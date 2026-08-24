---
title: 'Chương 9: Nén ngữ cảnh khi cuộc hội thoại quá dài'
description: Cách Pi chọn ranh giới history an toàn, ghi checkpoint có cấu trúc và dựng lại model context cho lần gọi tiếp theo.
translation_key: ch09-compaction
language: vi
chapter: 9
source_url: 'https://www.dgzhuya.com/modules/ch09-compaction'
official_refs:
  - 'https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/compaction.md'
terms_used:
  - Context Compaction
  - CompactionEntry
  - BranchSummaryEntry
  - Session
status: reviewed
last_updated: '2026-08-24'
translator: Pify maintainers
reviewed_by: Pify maintainers
---
Chương 8 đã lập bản đồ các lớp phòng vệ quanh một model request. `transformContext` có thể lọc `AgentMessage[]` được project cho một lần gọi, nhưng không viết lại session history. Compaction hoạt động ở một ranh giới khác: Coding Agent tóm tắt vùng cũ hơn trên active session path, thêm một `CompactionEntry` bền vững, rồi dựng lại message của Agent từ checkpoint đó.

Kết quả này có mất mát theo chủ đích. Phần việc gần đây được giữ nguyên văn; phần việc cũ tồn tại dưới dạng handoff có cấu trúc, gồm mục tiêu, constraint, tiến độ, quyết định, bước tiếp theo, context thiết yếu và một số metadata về thao tác file.

## 1. Vấn đề: history tăng, model window thì không

Mỗi request gồm system prompt, định nghĩa Tool đang active và message projection hiện tại. Tool result có thể làm phần message tăng rất nhanh. Ví dụ, một session có 50 turn, trung bình 3.000 token mỗi turn, đã đóng góp `50 × 3.000 = 150.000` token trước khi cộng system prompt hoặc Tool schema.

Xóa các turn cũ nhất sẽ giải phóng chỗ, nhưng đồng thời xóa mục tiêu ban đầu, quyết định trước đó, cách làm đã thất bại và những path đã thay đổi. Pi thay phần projection cũ của request bằng summary, trong khi vẫn giữ các session entry gốc trong JSONL tree.

Phép tính sau chỉ là ví dụ, không phải tỷ lệ nén được bảo đảm. Nếu active context giảm từ 185.000 token xuống một summary 10.000 token cộng 20.000 token gần đây, projection mới là `10.000 + 20.000 = 30.000` token. Request tiếp theo giảm 155.000 token và còn 170.000 token trống trong window 200.000 token.

```text
Trước: 185.000 active token
┌──────────── projection cũ: 165.000 ───────────────┬── gần đây: 20.000 ─┐
│ user, assistant và Tool message nguyên bản        │ giữ nguyên văn     │
└───────────────────────────────────────────────────┴─────────────────────┘

Sau: ví dụ 30.000 active token
┌── structured summary: 10.000 ──┬── gần đây: 20.000 ─┐
│ mục tiêu, state, quyết định     │ giữ nguyên văn     │
└─────────────────────────────────┴─────────────────────┘
```

Kích thước summary thay đổi theo cuộc hội thoại, model và response. Pi giới hạn main summary response ở giá trị nhỏ hơn giữa `floor(0.8 × reserveTokens)` và `model.maxTokens`; nó không cam kết summary luôn có 10.000 token.

### Ranh giới run: kiểm tra tự động và ngắt thủ công

Cách hiểu trong bản cũ là “giữa hai turn.” Pi hiện tại chính xác hơn. Sau khi `agent.prompt()` kết thúc và `agent_end` đã được phát, `_handlePostAgentRun()` kiểm tra assistant message cuối. Pi còn kiểm tra assistant message cuối trước khi nhận prompt tiếp theo, nhờ đó bắt được response đã bị abort mà bước kiểm tra sau run thông thường bỏ qua.

Manual compaction đi theo đường riêng. `AgentSession.compact(customInstructions?)` gọi `abort()` cho operation hiện tại của Agent trước, rồi mới bắt đầu compaction thủ công. Nó không tự động tiếp tục turn vừa bị ngắt.

```text
đường tự động
Agent run → message_end lưu message → agent_end → _checkCompaction()
                                            ├─ không làm gì → settle
                                            └─ compact → dựng lại Agent message

đường trước prompt
prompt tiếp theo → xét assistant cuối, kể cả aborted → có thể compact → gửi user message

đường thủ công
/compact [instructions] hoặc AgentSession.compact()
  → abort Agent operation hiện tại → compact → giữ trạng thái idle
```

Sau bước dispatch, các đường này dùng chung quy trình prepare, hook, tạo summary, append và reconstruction.

## 2. Khi nào Pi thực hiện compaction

### Threshold, giá trị mặc định và thứ tự ưu tiên của setting

Đường threshold dùng phép so sánh nghiêm ngặt sau:

```typescript
import {
  DEFAULT_COMPACTION_SETTINGS,
  shouldCompact,
} from "@earendil-works/pi-coding-agent";

const contextWindow = 200_000;
const contextTokens = 183_617;

shouldCompact(contextTokens, contextWindow, DEFAULT_COMPACTION_SETTINGS); // true
// 183_617 > 200_000 - 16_384 = 183_616
```

Giá trị mặc định hiện tại là `reserveTokens: 16384` và `keepRecentTokens: 20000`. `reserveTokens` chừa chỗ cho response; `keepRecentTokens` hướng dẫn quá trình tìm cut point theo chiều ngược. Trường hợp bằng nhau không kích hoạt: với window 200.000 token, 183.616 vẫn chưa thỏa boundary `>`.

Coding Agent đọc global setting từ `~/.pi/agent/settings.json`. File `.pi/settings.json` của project đã được trust sẽ được deep-merge lên trên, nên project có thể thay một field compaction lồng nhau mà không phải chép các field còn lại. Setting của project chưa được trust sẽ bị bỏ qua. Sau đó, code SDK có thể gọi `SettingsManager.applyOverrides()`; giá trị lồng nhau ở đây có ưu tiên cao hơn setting đã merge từ file. Mỗi field còn thiếu tự fallback về giá trị mặc định tương ứng.

```json
{
  "compaction": {
    "enabled": true,
    "reserveTokens": 16384,
    "keepRecentTokens": 20000
  }
}
```

`enabled: false` tắt đường threshold và overflow tự động vì `_checkCompaction()` return ngay. Nó không tắt `AgentSession.compact()`, `/compact`, RPC/SDK `compact()` hoặc lời gọi `ctx.compact()` từ Extension.

### Current usage ưu tiên dữ liệu từ provider

Mô tả cũ coi `chars / 4` là kích thước context hiện tại. Pi `0.84.2` ưu tiên `usage` của assistant hợp lệ gần nhất. `calculateContextTokens()` lấy `usage.totalTokens` nếu giá trị này khác 0; nếu không, hàm cộng `input + output + cacheRead + cacheWrite`.

Với assistant response bình thường có usage khác 0, `_checkCompaction()` kiểm tra trực tiếp giá trị đó. Với error response hoặc usage toàn 0, `estimateContextTokens()` tìm assistant usage gần nhất không thuộc response lỗi hay aborted trong active message, rồi cộng ước lượng của những message theo sau. Nếu không có usage hợp lệ, hàm ước lượng toàn bộ message.

```text
latest assistant usage hợp lệ
  contextTokens = totalTokens
               hoặc input + output + cacheRead + cacheWrite

usage hợp lệ trước đó + trailing message
  contextTokens = token từ usage + estimateTokens(trailing message)

không có usage hợp lệ
  contextTokens = Σ estimateTokens(toàn bộ active message)
```

`estimateTokens()` áp dụng `ceil(chars / 4)` cho nội dung text. Hàm đếm assistant text, thinking, tên Tool call và JSON argument; Bash command cùng output; summary; và nội dung user, custom hoặc Tool result. Mỗi image tương đương 4.800 ký tự ước lượng. Heuristic này có thể ước lượng cao hoặc thấp tùy ngôn ngữ và nội dung, nên nó chỉ là fallback và thước đo cho cut point, không phải tokenizer chính xác.

Sau compaction, assistant usage có trước checkpoint đã cũ. Bước kiểm tra tự động từ chối nguồn usage có timestamp bằng hoặc sớm hơn compaction gần nhất. Public API `getContextUsage()` cũng trả `{ tokens: null, percent: null }` cho tới khi một assistant response hợp lệ sau checkpoint cung cấp usage mới.

### Ba trường hợp tự động và một đường thủ công

Automatic dispatcher phân biệt nhiều hơn hai trường hợp “phòng ngừa” và “khẩn cấp”:

| Đường | Cách phát hiện | Pi làm gì sau compaction |
| --- | --- | --- |
| Threshold | Usage hợp lệ hoặc ước lượng thỏa threshold nghiêm ngặt | Giữ completed response; không retry |
| Overflow, response đã hoàn tất | Response từ cùng model báo overflow nhưng có `stopReason: "stop"` | Giữ response; không retry |
| Overflow hoặc recoverable length | Overflow error từ cùng model, hoặc `length` stop có thể phục hồi dưới output limit mong muốn của model | Bỏ assistant lỗi/bị cắt khỏi Agent state, compact rồi retry một lần |
| Manual | `/compact [instructions]`, RPC/SDK `compact()` hoặc Extension `ctx.compact()` | Abort run hiện tại trước; không tự động tiếp tục run đó |

Overflow recovery chỉ được compact-and-retry một lần. Assistant lỗi hoặc bị cắt đã được lưu qua `message_end`; Pi bỏ nó khỏi retry context trong memory, không xóa khỏi session tree. Sau khi rebuild, Pi lại bỏ terminal assistant đó nếu projection đưa nó về cuối message list, vì `agent.continue()` cần một state có thể tiếp tục.

Same-model guard áp dụng cho việc phát hiện overflow và recoverable length. Threshold accounting vẫn đi theo đường provider usage hoặc estimate riêng đã mô tả ở trên. Guard này ngăn overflow cũ từ model có window nhỏ hơn ép recovery sau khi người dùng đổi model.

## 3. Pi cắt active path ở đâu

### Cut point hợp lệ giữ đúng Tool protocol

Tool result thuộc về assistant Tool call đã yêu cầu nó. Nếu retained region bắt đầu tại Tool result, model có thể thấy result mà không thấy call. Vì vậy, `findValidCutPoints()` chấp nhận các message role có mặt trong context gồm user, assistant, Bash-execution, custom, branch-summary và compaction-summary, nhưng không bao giờ chấp nhận `toolResult`. Session entry có type `compaction` cũng bị bỏ qua khi chọn candidate.

```text
entry:   0       1       2        3       4       5        6
       header   user  assistant  tool    user  assistant  tool
candidate:       ✓       ✓        ✗       ✓       ✓        ✗

Nếu giữ entry 5, Tool result ở entry 6 vẫn nằm sau nó.
```

Entry không project vào context, chẳng hạn label hoặc model change, không tạo message cut point. Sau khi chọn điểm cắt, Pi quét ngược qua metadata liền kề nhưng không hiện trong context để giữ chúng ở phía retained. Quá trình dừng khi gặp entry có mặt trong context hoặc compaction boundary cũ.

### `firstKeptEntryId` là điểm đầu của retained region

Boundary xác định session entry đầu tiên được giữ, thay vì entry cuối cùng được tóm tắt. Cắt tại user sẽ giữ user message đó và mọi thứ phía sau. Cắt tại assistant sẽ giữ assistant message đó cùng Tool result theo sau, rồi ghi metadata về split turn cho phần trước của cùng turn.

```text
cắt tại user entry 4

0       1       2       3      [4]      5       6
header  user    assistant tool   user    assistant tool
        └──── được tóm tắt ──┘   └──── giữ nguyên văn ──────┘
                                  firstKeptEntryId = id(entry 4)
```

`firstKeptEntryId` xác định một entry trong session tree thay vì vị trí của array. Nhờ đó reconstruction có thể resolve boundary sau khi reload và trên parent-linked path. Nếu legacy session không cung cấp được id cho entry đã chọn, preparation trả `undefined` thay vì ghi một checkpoint không thể dùng.

### Đi ngược theo budget và boundary của lần compaction tiếp theo

Cut search đi từ `boundaryEnd - 1` về `boundaryStart`, cộng token ước lượng của mọi message mà từng entry project ra. Khi tổng đạt `keepRecentTokens`, nó chọn cut point hợp lệ gần nhất tại hoặc sau vị trí đó. Nếu không có message nào làm tổng chạm budget, candidate ban đầu vẫn là cut point hợp lệ sớm nhất; preparation sau đó trả `undefined` nếu kết quả không còn gì để tóm tắt.

Pseudocode có ghi nguồn dưới đây rút gọn thuật toán hiện tại. Bước kéo metadata về phía retained và phát hiện split turn diễn ra sau phần lựa chọn được thể hiện ở đây.

```text
PSEUDOCODE dựa trên findCutPoint(), compaction.ts dòng 403–460

cutPoints = entry hiện trong context và hợp lệ, loại Tool result
cutIndex = cut point sớm nhất
accumulated = 0

với từng entry từ mới nhất về boundaryStart:
  accumulated += token ước lượng của message do entry project ra
  nếu accumulated >= keepRecentTokens:
    cutIndex = cut point đầu tiên có index tại hoặc sau entry này
    dừng

đưa metadata liền kề không hiện trong context về trước cutIndex
suy ra turnStartIndex và isSplitTurn
trả firstKeptEntryIndex, turnStartIndex, isSplitTurn
```

Trong lần compaction đầu, `boundaryStart` là đầu active branch path. Ở lần sau, Pi tìm `CompactionEntry` trước đó và bắt đầu tại `firstKeptEntryId` của entry này. Nếu id đó không có trên active path, Pi fallback về entry sau compaction trước. Vì vậy, message từng sống sót qua cut cũ có thể đi vào summary tiếp theo thay vì bị tách khỏi checkpoint đang được cập nhật.

```text
checkpoint trước
  summary A + entry từ firstKept(A) trở đi

preparation tiếp theo
  previousSummary = summary A
  boundaryStart   = firstKept(A), hoặc entry sau compaction A nếu fallback
  cut mới         = firstKept(B)

message [boundaryStart, cut mới) → input cho summary mới
message [cut mới, current leaf]   → retained region
```

## 4. Nội dung thay thế message cũ

### Checkpoint cố định gồm sáu section

Pi yêu cầu summarizing model tạo checkpoint để tiếp tục công việc. Các label chính xác bên dưới nằm trong fenced template để không trở thành heading trên thanh điều hướng của trang:

```markdown
## Goal
[Người dùng đang muốn hoàn thành việc gì?]

## Constraints & Preferences
- [Yêu cầu hoặc preference, hoặc "(none)"]

## Progress
### Done
- [x] [Phần việc đã hoàn thành]

### In Progress
- [ ] [Phần việc hiện tại]

### Blocked
- [Blocker hiện tại]

## Key Decisions
- **[Decision]**: [Rationale ngắn]

## Next Steps
1. [Các bước tiếp tục theo thứ tự]

## Critical Context
- [Dữ liệu, ví dụ hoặc tham chiếu chính xác cần để tiếp tục]
```

Prompt yêu cầu rõ phải giữ chính xác file path, tên function và error message. Các slot cố định giảm khả năng một chi tiết hấp dẫn lấn át mục tiêu ban đầu hoặc hành động cần làm tiếp. Model vẫn có thể bỏ sót hoặc làm sai lệch thông tin, nên retained tail và session history có thể kiểm tra vẫn là một phần của thiết kế.

### Serialization và summary request

`generateSummaryWithUsage()` chạy `convertToLlm()` của Coding Agent trên vùng `AgentMessage[]` đã chọn trước. Sau đó nó serialize các message tương thích thành text có label để summarizer coi chúng là dữ liệu cần đọc, không phải cuộc hội thoại cần tiếp tục.

```text
[User]: Sửa lỗi xác thực trong src/auth.ts

[Assistant thinking]: Kiểm tra call path trước khi sửa.

[Assistant tool calls]: read(path="src/auth.ts")

[Tool result]: export function authenticate(...) { ... }

[Assistant]: deriveKey() chưa nhận salt.
```

Mỗi Tool result đã serialize giữ tối đa 2.000 ký tự, sau đó có marker ghi số ký tự bị bỏ. Giới hạn này chỉ áp dụng cho summarization request; nó không viết lại Tool-result entry đã lưu.

Request dùng `SUMMARIZATION_SYSTEM_PROMPT`, tắt Tool call bằng `toolChoice: "none"`, tắt ghi prompt cache bằng `cacheRetention: "none"`, và dùng routing session id mới nếu caller không cấp id. Lỗi tạm thời của summary stream tuân theo retry policy đã cấu hình; deterministic error và abort return ngay. Main summary dùng một model request. Split turn có thể cần một main-history request rồi một turn-prefix request; Pi hiện tại chạy chúng tuần tự.

### Incremental summary có quy tắc input chính xác

Khi `prepareCompaction()` tìm thấy compaction cũ, nó chép `summary` của entry đó vào `previousSummary`. Với compaction không split, hoặc split compaction có complete message cũ để tóm tắt, `generateSummaryWithUsage()` bọc message mới trong `<conversation>` và checkpoint trước trong `<previous-summary>`, rồi chuyển từ initial prompt sang update instructions.

```text
lần compaction đầu
  message 1…30 → summary A

lần compaction sau
  <conversation>message được A giữ nhưng nay nằm trước cut B</conversation>
  <previous-summary>summary A</previous-summary>
  → summary B
```

Update instructions yêu cầu giữ thông tin cũ, thêm tiến độ và quyết định, chuyển phần đã hoàn thành, cập nhật next step, đồng thời cho phép bỏ thông tin không còn liên quan. Vì vậy, “incremental” là cập nhật do LLM thực hiện theo chỉ dẫn, không phải nối byte nguyên trạng.

Trong split turn, main-history request chỉ nhận `previousSummary` khi `messagesToSummarize` không rỗng. Nếu split interval không có complete message cũ, `compact()` hiện tại dùng literal `No prior history.` trước turn-prefix summary và không tạo request riêng để đưa `previousSummary` vào.

### Metadata thao tác file có phạm vi hẹp và được tích lũy

Default compaction chỉ xét assistant Tool call có tên chính xác `read`, `write` và `edit` khi argument chứa `path` kiểu string. Nó mang `details` của compaction trước do Pi sinh ra đi tiếp, rồi thêm operation từ cả main summary region lẫn split-turn prefix.

`computeFileLists()` sắp xếp kết quả. Path xuất hiện trong `write` hoặc `edit` đi vào `modifiedFiles`; path đó bị loại khỏi `readFiles`, nên danh sách này chỉ còn file chỉ đọc. Pi không suy luận side effect từ Bash hay convention của custom Tool. Entry trước do Extension tạo (`fromHook: true`) có thể dùng schema `details` khác, vì vậy built-in extraction không giả định nó chứa file list của Pi.

```text
<read-files>
src/utils/hash.ts
</read-files>

<modified-files>
src/auth.ts
</modified-files>
```

Các tag này chỉ được nối vào summary khi danh sách tương ứng không rỗng. Hai array đó cũng được lưu trong `details` của built-in entry, giúp compaction built-in tiếp theo mang dữ liệu đi tiếp mà không phải parse prose.

## 5. Trường hợp biên: một turn lớn hơn retained budget

Một turn bắt đầu tại user-like message và kéo dài qua assistant cùng Tool-result message tiếp theo cho tới user-like start kế tiếp. Pi coi role user, Bash-execution, custom, branch-summary và compaction-summary là turn start. Assistant và Tool result không bắt đầu turn.

### Vì sao cho phép assistant cut point

Nếu chỉ giữ user cut point, mỗi turn luôn trọn vẹn, nhưng một turn lớn có thể làm retained region vượt xa `keepRecentTokens`. Assistant cut point cho thuật toán một boundary dùng được bên trong turn đó, đồng thời vẫn giữ Tool result theo sau cùng call tương ứng.

Result shape hiện tại thể hiện hệ quả này trực tiếp. Đây là type excerpt bám sát source, không thay thế việc import `CutPointResult` đã export:

```typescript
interface CutPointResult {
  firstKeptEntryIndex: number;
  turnStartIndex: number;
  isSplitTurn: boolean;
}
```

Nếu entry được chọn tự bắt đầu một turn, `turnStartIndex` là `-1` và `isSplitTurn` là false. Nếu không, Pi quét ngược tới turn-start entry gần nhất trong compaction boundary hiện tại.

```text
một turn quá lớn

entry:   1      2       3       4       5       6      [7]      8
       user  assistant  tool  assistant  tool    tool  assistant  tool
        ↑                                             ↑
  turnStartIndex                              firstKeptEntryId
        └──────── turnPrefixMessages: 1…6 ────────────┘
                                                      └─ kept: 7…8
```

User request thuộc `turnPrefixMessages`, không thuộc main history summary. Các complete turn cũ kết thúc trước `turnStartIndex` và đi vào `messagesToSummarize`.

### Prefix checkpoint nối lại split turn

Prefix request dùng output cap nhỏ hơn, tức giá trị nhỏ hơn giữa `floor(0.5 × reserveTokens)` và `model.maxTokens`, cùng template riêng sau:

```markdown
## Original Request
[Người dùng đã yêu cầu gì trong turn này?]

## Early Progress
- [Quyết định và phần việc chính đã hoàn thành trong prefix]

## Context for Suffix
- [Thông tin cần để hiểu phần việc gần đây được giữ lại]
```

Khi có complete message cũ, Pi tạo hoặc cập nhật six-section history summary trước. Sau đó nó tạo prefix summary. Usage từ hai request được cộng theo từng field. Text được lưu nối hai phần bằng separator và label `Turn Context (split turn)`.

```text
[six-section history summary, hoặc "No prior history."]

---

Turn Context (split turn):

[Original Request / Early Progress / Context for Suffix]

sau đó, trong projected context:
[assistant tại firstKeptEntryId] [Tool result của nó] [message về sau]
```

Split vẫn làm mất thông tin, nhưng model tiếp theo nhận original request và phần việc đầu dưới dạng structured context trước khi thấy suffix nguyên văn.

## 6. Persistence, reconstruction và lifecycle event

### `CompactionEntry` là checkpoint được lưu

`SessionManager.appendCompaction()` thêm một child của current leaf rồi đưa leaf tới entry mới. Nó không xóa những entry vừa được tóm tắt. Public type của Coding Agent tại revision đã pin có shape sau:

```typescript
import type { Usage } from "@earendil-works/pi-ai";

interface CompactionEntry<T = unknown> {
  type: "compaction";
  id: string;
  parentId: string | null;
  timestamp: string;
  summary: string;
  firstKeptEntryId: string;
  tokensBefore: number;
  details?: T;
  usage?: Usage;
  fromHook?: boolean;
}
```

`timestamp` là ISO string trong session được lưu, không phải numeric timestamp của `AgentMessage` đã project. `fromHook` là tên field tương thích ngược dành cho result do Extension cung cấp. `details` phải serialize được thành JSON nếu session dùng JSONL storage.

```json
{
  "type": "compaction",
  "id": "e_compact",
  "parentId": "e_last",
  "timestamp": "2026-08-24T10:00:00.000Z",
  "summary": "## Goal\nRepair authentication...",
  "firstKeptEntryId": "e_recent",
  "tokensBefore": 185000,
  "details": {
    "readFiles": ["src/utils/hash.ts"],
    "modifiedFiles": ["src/auth.ts"]
  },
  "fromHook": false
}
```

`tokensBefore` được tính trong preparation từ `estimateContextTokens(buildSessionContext(pathEntries).messages)`. Nó đo active context được rebuild và sắp bị thay thế, dùng provider usage khi hợp lệ và ước lượng khi cần. Nó không phải token count của mọi JSONL entry, byte size của session file hay usage của summary request. `usage` của bước tạo summary được lưu riêng và được cộng vào tổng token cùng cost của toàn session.

### Stored tree, active projection và per-call transform là các state khác nhau

Session tree giữ raw entry cũ, kept entry, compaction entry và child về sau. `buildContextEntries()` chỉ đi theo parent path của leaf đã chọn, tìm compaction gần nhất trên path đó rồi trả:

```text
selected path đã lưu
raw entry cũ → firstKept → recent entry → CompactionEntry → later entry

active context entry
CompactionEntry → firstKept → recent entry → later entry

active AgentMessage[]
CompactionSummaryMessage → retained message → later message
```

`CompactionEntry` gần nhất trở thành `CompactionSummaryMessage` có numeric message timestamp. Sau đó, `convertToLlm()` của Coding Agent chuyển nó thành Pi AI user message với text được bọc trong compaction preamble cố định và tag `<summary>`.

```text
The conversation history before this point was compacted into the following summary:

<summary>
[stored summary]
</summary>
```

Projection này diễn ra khi session được load và sau compaction. Trong mỗi model call, Agent core tiếp tục áp dụng hook `transformContext` của Chương 8 lên `AgentMessage[]` đó, rồi chạy `convertToLlm()` của Coding Agent. Hook có thể lọc projection của một request; nó không append `CompactionEntry`, đổi `firstKeptEntryId` hay xóa stored tree.

Generic Agent runtime trong monorepo có compaction schema riêng với `retainedTail` đã materialize. Coding Agent `SessionManager` tại revision đã pin dùng `firstKeptEntryId`. Không thêm `retainedTail` vào type `CompactionEntry` của Coding Agent hoặc giả định hai persistence contract dựng context giống nhau.

### Public event và Extension hook phục vụ consumer khác nhau

Consumer của `AgentSession.subscribe()` thấy `compaction_start` và `compaction_end`. Start event có `reason: "manual" | "threshold" | "overflow"`. End event luôn có reason đó cùng `result`, `aborted`, `willRetry` và `errorMessage` tùy chọn.

Extension có ba hook riêng:

- `session_before_compact` được await và có thể trả `{ cancel: true }` hoặc custom `compaction` result.
- `session_compact` được await sau khi entry đã append và Agent message đã rebuild.
- `session_compact_failed` được await sau failure hoặc abort và mang terminal status.

Public session start/end event được emit đồng bộ tới subscriber. Extension hook được dispatch qua `ExtensionRunner`; cancel result dừng các handler phía sau, còn non-cancel result cuối cùng sẽ thắng. Nếu không có handler nào trả custom result, built-in compactor tiếp tục nắm quyền xử lý. Hook ném lỗi sẽ được báo thành Extension error và dispatch vẫn tiếp tục.

```text
manual: compaction_start
  → validate model/auth → prepare → session_before_compact
  → built-in hoặc custom result → append entry → rebuild Agent message
  → session_compact → compaction_end(success)

automatic: prepare trước → compaction_start
  → session_before_compact → built-in hoặc custom result
  → append entry → rebuild Agent message → session_compact
  → compaction_end(success, willRetry)

terminal failure hoặc abort sau start
  → compaction_end(result: undefined, aborted/errorMessage)
  → session_compact_failed
```

Extension dưới đây ghi nhận cả ba hook outcome mà không thay built-in summary:

```typescript
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function compactionAudit(pi: ExtensionAPI) {
  pi.on("session_before_compact", async (event, ctx) => {
    ctx.ui.notify(`Compaction requested: ${event.reason}`, "info");
  });

  pi.on("session_compact", async (event, ctx) => {
    ctx.ui.notify(
      `Compacted ${event.compactionEntry.tokensBefore.toLocaleString()} tokens`,
      "info",
    );
  });

  pi.on("session_compact_failed", async (event, ctx) => {
    const detail = event.aborted ? "aborted" : (event.errorMessage ?? "failed");
    ctx.ui.notify(`Compaction ${detail}`, "warning");
  });
}
```

Replacement trả từ `session_before_compact` phải có `summary`, `firstKeptEntryId` và `tokensBefore`; `usage` cùng `details` là tùy chọn. Pi không chạy lại cut-point validation cho replacement đó, nên handler thường phải chép `firstKeptEntryId` và `tokensBefore` đã prepare. Extension nhận prepared boundary, hai vùng message, previous summary, file operation, reason, retry intent, branch entry và `AbortSignal` đang active. Custom model call nên truyền signal này và trả provider usage.

### Semantics của failure, cancellation và retry

Manual `compact()` abort Agent run trước, emit `compaction_start`, rồi reject promise nếu thiếu model, không có gì để compact, hook cancel, signal abort hoặc summary thất bại. Hook cancellation trở thành `Error("Compaction cancelled")`. `compaction_end` tương ứng có `aborted: true`, không có `errorMessage` và `willRetry: false`; `session_compact_failed` nhận cùng trạng thái kết thúc.

`abortCompaction()` abort controller của manual hoặc automatic compaction. Built-in summary call nhận signal đó. Pi kiểm tra signal lần nữa trước khi append, nên trường hợp abort sau khi tạo summary nhưng trước persistence sẽ không ghi checkpoint.

Automatic cancellation hoặc abort trả `false` về post-run loop, emit terminal event, không ghi entry và tắt retry cho lần đó. Automatic failure khác được format thành `Auto-compaction failed: ...` hoặc `Context overflow recovery failed: ...`, rồi được emit, báo cho `session_compact_failed`, và được `_runAutoCompaction()` xử lý nội bộ thay vì throw cho caller. Nếu overflow vẫn xảy ra sau đúng một lần compact-and-retry, Pi emit terminal recovery failure và không compact hay retry thêm.

Không có public `compaction_start` khi automatic preparation trả `undefined`; manual start xảy ra sớm hơn nên vẫn ghép với failure end cho trường hợp “Already compacted” hoặc “Nothing to compact.” Khi thành công, `compaction_end` chỉ được emit sau persistence, projection và `session_compact`. Manual path xóa controller trước end event để end listener có thể gửi queued prompt an toàn.

## 7. Chuỗi end-to-end hoàn chỉnh

Đường tự động hoàn chỉnh đi qua năm dạng biểu diễn: provider usage, session entry, message của summary request, checkpoint đã lưu và provider request tiếp theo.

```text
1. Agent response settle
   message_end lưu assistant → agent_end → _handlePostAgentRun()

2. Phân loại
   overflow/recoverable length từ cùng model HOẶC threshold từ current usage

3. Prepare
   dựng active branch path
   → tính lại tokensBefore từ buildSessionContext(path).messages
   → tìm previous-summary boundary
   → đi ngược tới firstKeptEntryId
   → chia messagesToSummarize / turnPrefixMessages / kept region
   → thu built-in file operation

4. Intercept
   compaction_start → await session_before_compact
   → cancel, custom result hoặc built-in generation

5. Tóm tắt
   convertToLlm → serializeConversation (Tool result giới hạn 2.000 ký tự)
   → six-section initial/update request
   → turn-prefix request tuần tự nếu cần
   → nối file list đã sort và cộng usage

6. Persist
   SessionManager.appendCompaction(...)
   → JSONL entry mới nối parent; entry cũ vẫn còn

7. Project
   buildSessionContext()
   → CompactionSummaryMessage + entry từ firstKeptEntryId + later entry
   → thay agent.state.messages

8. Thông báo và tiếp tục
   session_compact → compaction_end
   → retry một overflow turn, phát queued message hoặc settle

9. Model call tiếp theo
   transformContext → convertToLlm
   → system prompt + <summary> user message + recent message nguyên văn
```

Manual compaction đi vào bước 4 sau khi abort Agent run đang active và prepare cùng các vùng message. Nó không bao giờ đi vào nhánh automatic retry ở bước 8.

## 8. Nguyên tắc thiết kế và kiểm tra handoff

### 1. Giữ recent suffix đúng protocol

Việc chọn theo chiều ngược thể hiện một ưu tiên: phần việc gần đây hữu ích hơn khi giữ nguyên văn so với phần việc cũ có cùng token cost. Valid cut point thêm một constraint cứng từ protocol. Retained Tool result không có call tương ứng là context sai cấu trúc, nên `keepRecentTokens` là target chứ không cho phép cắt tại token offset tùy ý.

Hãy test thuộc tính này bằng một turn có nhiều Tool call gần boundary. Xác nhận entry được chọn không bao giờ là Tool result, mọi retained Tool result vẫn theo sau assistant call, và assistant boundary tạo `turnPrefixMessages` bắt đầu đúng tại user-like entry.

### 2. Làm cho state transfer có mất mát vẫn kiểm tra được

Six-section template, split-turn template, `firstKeptEntryId`, `tokensBefore`, file list và summary `usage` mô tả nội dung đã đổi cùng cách tạo ra nó. Không có field nào chứng minh summary đã đầy đủ. Quality test cần kiểm tra checkpoint còn active goal, constraint của người dùng, quyết định đã chấp nhận, phần việc chưa xong, blocker, path, command và error cần cho hành động tiếp theo hay không.

Không chép secret vào summary chỉ vì nó từng xuất hiện trong history. Compaction không xóa dữ liệu: raw entry vẫn còn trong session file, summary có thể lặp lại nội dung cũ, và generic Agent runtime có thể copy nội dung vào retained tail. Xóa dữ liệu vì compliance cần một storage rewrite chính xác, tách khỏi runtime mechanism này.

### 3. Tách persistence, projection và navigation

Compaction thay active-path projection bằng cách thêm `CompactionEntry`. `transformContext` chỉ thay một request trong memory. Branch summarization giải quyết bài toán khác: khi tree navigation yêu cầu summary, Pi thêm `BranchSummaryEntry` tại target path để phần việc hữu ích từ branch sắp rời đi theo lần navigation. Nó không dùng compaction threshold hay `firstKeptEntryId`.

Trước khi handoff một compaction integration, hãy kiểm tra các trường hợp sau:

1. Boundary chính xác của threshold và hai giá trị mặc định hiện tại.
2. Usage từ provider, fallback cho error/toàn 0 và việc từ chối stale usage sau compaction.
3. Compaction đầu, compaction lặp lại, previous kept id bị thiếu và kết quả không có gì để tóm tắt.
4. Whole-turn cut và split-turn cut, gồm Tool ordering cùng tổng usage của prefix summary.
5. Thứ tự ưu tiên global/project/SDK setting, cộng trường hợp project chưa được trust.
6. Manual success, manual cancellation, automatic hook cancellation, summary error, signal abort, overflow retry thành công và overflow lần hai thất bại.
7. JSONL entry field, active context entry, projected `AgentMessage[]` và Pi AI `Message[]` cuối cùng dưới dạng bốn assertion riêng.
8. `details` của built-in so với Extension, file chỉ đọc so với file đã sửa, và operation từ Bash/custom Tool cần metadata riêng.

## 9. Trạm tiếp theo

[Chương 10](ch10-session.md) đi theo parent-linked JSONL tree phía sau `getBranch()`, `appendCompaction()`, `buildContextEntries()`, rewind và branch navigation. Storage model đó giải thích vì sao compaction có thể bỏ entry cũ khỏi model request tiếp theo mà không xóa chúng.

Các implementation reference của chương này được pin tại Pi `0.84.2`, commit `a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c`:

- [Giá trị mặc định, token accounting, cut point, template, preparation và generation của compaction](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/coding-agent/src/core/compaction/compaction.ts#L126-L997)
- [Summary serialization và theo dõi file operation](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/coding-agent/src/core/compaction/utils.ts#L12-L158)
- [`CompactionEntry`, append và active-path projection](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/coding-agent/src/core/session-manager.ts#L46-L80), cùng [`buildSessionContext()`](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/coding-agent/src/core/session-manager.ts#L379-L469)
- [Lifecycle, retry, abort và failure path thủ công/tự động](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/coding-agent/src/core/agent-session.ts#L1818-L2359)
- [Contract của Extension compaction event](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/coding-agent/src/core/extensions/types.ts#L288-L300) và [hook](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/coding-agent/src/core/extensions/types.ts#L591-L627)
- [Chuyển đổi compaction-summary message](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/coding-agent/src/core/messages.ts#L11-L17) và [thứ tự per-call transform](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/agent/src/agent-loop.ts#L277-L302)
- [Merge global/project setting và SDK override](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/coding-agent/src/core/settings-manager.ts#L150-L169), cùng [giá trị compaction hiệu dụng](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/coding-agent/src/core/settings-manager.ts#L825-L852)
- [Schema `retainedTail` của generic Agent](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/agent/src/harness/session/types.ts#L39-L51), khác với Coding Agent `SessionManager`

> **Tiếp theo:** [Chương 10: Quản lý Session](ch10-session.md)
