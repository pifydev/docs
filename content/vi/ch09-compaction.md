---
title: 'Chương 9: Nén ngữ cảnh khi cuộc hội thoại quá dài'
description: Cách Pi chọn ranh giới an toàn trong lịch sử, ghi điểm kiểm tra có cấu trúc và dựng lại ngữ cảnh cho lần gọi mô hình tiếp theo.
translation_key: ch09-compaction
language: vi
chapter: 9
source_url: 'https://www.dgzhuya.com/modules/ch09-compaction'
official_refs:
  - 'https://github.com/earendil-works/pi/blob/005af57d88ee23b33778f343a9595b32e67ff788/packages/coding-agent/docs/compaction.md'
  - 'https://github.com/earendil-works/pi/blob/005af57d88ee23b33778f343a9595b32e67ff788/packages/coding-agent/src/core/cache-warmer.ts'
terms_used:
  - Context Compaction
  - CompactionEntry
  - BranchSummaryEntry
  - Session
status: reviewed
last_updated: '2026-10-01'
translator: Pify maintainers
reviewed_by: Pify maintainers
---
Chương 8 đã mô tả các lớp bảo vệ quanh một lần gọi mô hình. `transformContext` có thể lọc `AgentMessage[]` được chiếu vào một lần gọi, nhưng không viết lại lịch sử phiên. Cơ chế nén hoạt động ở một ranh giới khác: Coding Agent tóm tắt vùng cũ hơn trên nhánh phiên đang hoạt động, thêm một `CompactionEntry` bền vững, rồi dựng lại các thông điệp của Agent từ điểm kiểm tra đó.

Quá trình này chủ động chấp nhận mất mát. Phần việc gần đây được giữ nguyên văn; phần việc cũ trở thành bản bàn giao có cấu trúc, gồm mục tiêu, ràng buộc, tiến độ, quyết định, bước tiếp theo, ngữ cảnh thiết yếu và một số siêu dữ liệu về thao tác tệp.

## 1. Vấn đề: lịch sử vượt quá cửa sổ ngữ cảnh

Mỗi yêu cầu gồm lời nhắc hệ thống, định nghĩa các Tool đang dùng và danh sách thông điệp hiện tại được chiếu vào yêu cầu. Kết quả Tool có thể làm danh sách này tăng rất nhanh. Ví dụ, một phiên có 50 lượt, trung bình 3.000 token mỗi lượt, đã chiếm `50 × 3.000 = 150.000` token trước khi tính lời nhắc hệ thống hoặc lược đồ Tool.

Xóa các lượt cũ nhất sẽ giải phóng chỗ, nhưng cũng làm mất mục tiêu ban đầu, quyết định trước đó, cách làm đã thất bại và những đường dẫn đã thay đổi. Pi thay phần lịch sử cũ trong yêu cầu bằng một bản tóm tắt, còn các mục phiên gốc vẫn nằm trong cây JSONL.

Phép tính sau chỉ là ví dụ, không bảo đảm một tỷ lệ nén cố định. Nếu ngữ cảnh đang hoạt động giảm từ 185.000 token xuống một bản tóm tắt 10.000 token cộng 20.000 token gần đây, phép chiếu mới là `10.000 + 20.000 = 30.000` token. Yêu cầu tiếp theo bớt 155.000 token và còn 170.000 token trống trong cửa sổ 200.000 token.

```text
Trước: 185.000 token đang hoạt động
┌──────────── lịch sử cũ: 165.000 ──────────────┬── gần đây: 20.000 ─┐
│ thông điệp người dùng, trợ lý và Tool nguyên bản  │ giữ nguyên văn     │
└───────────────────────────────────────────────────┴─────────────────────┘

Sau: ví dụ 30.000 token đang hoạt động
┌── bản tóm tắt có cấu trúc: 10.000 ──┬── gần đây: 20.000 ─┐
│ mục tiêu, trạng thái, quyết định     │ giữ nguyên văn     │
└──────────────────────────────────────┴─────────────────────┘
```

Kích thước bản tóm tắt thay đổi theo cuộc hội thoại, mô hình và phản hồi. Pi giới hạn đầu ra của bản tóm tắt chính ở giá trị nhỏ hơn giữa `floor(0.8 × reserveTokens)` và `model.maxTokens`; con số 10.000 token trong ví dụ không phải mức cố định.

### Ranh giới lượt chạy: kiểm tra tự động và ngắt thủ công

Bản cũ mô tả thời điểm này là “giữa hai lượt”. Pi hiện tại cụ thể hơn. Khi low-level Agent run còn tiếp tục, Coding Agent có thể kiểm tra ngay trước phản hồi assistant kế tiếp. Sau khi `agent.prompt()` kết thúc và `agent_end` được phát, `_handlePostAgentRun()` kiểm tra thông điệp cuối của assistant lần nữa. Pi cũng kiểm tra thông điệp đó trước khi nhận prompt tiếp theo, nhờ vậy phát hiện response đã abort mà bước kiểm tra sau run thông thường bỏ qua.

Nén thủ công đi theo đường riêng. `AgentSession.compact(customInstructions?)` gọi `abort()` cho thao tác hiện tại của Agent trước, rồi mới bắt đầu nén. Phương thức này không tự động tiếp tục lượt vừa bị ngắt.

```text
đường tự động
assistant gọi Tool → append Tool result → chuẩn bị turn kế tiếp
  → kiểm tra ngưỡng → compaction tùy chọn → phản hồi assistant kế tiếp

đường sau run
Agent run → agent_end → _handlePostAgentRun() → _checkCompaction()
                                                ├─ không làm gì → kết thúc
                                                └─ compact → dựng lại message Agent

đường trước lời nhắc
lời nhắc tiếp theo → xét trợ lý cuối, kể cả khi đã hủy → có thể nén → gửi thông điệp người dùng

đường thủ công
/compact [chỉ dẫn] hoặc AgentSession.compact()
  → hủy thao tác Agent hiện tại → nén → giữ trạng thái chờ
```

Sau khi được phân luồng, các đường này dùng chung quy trình chuẩn bị, chạy hook, tạo bản tóm tắt, ghi nối tiếp và dựng lại ngữ cảnh.

## 2. Khi nào Pi thực hiện nén

### Ngưỡng, giá trị mặc định và thứ tự ưu tiên của thiết lập

Đường kiểm tra ngưỡng dùng phép so sánh nghiêm ngặt sau:

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

Giá trị mặc định hiện tại là `reserveTokens: 16384` và `keepRecentTokens: 20000`. `reserveTokens` chừa chỗ cho phản hồi; `keepRecentTokens` định hướng quá trình tìm điểm cắt theo chiều ngược. Trường hợp bằng nhau không kích hoạt: với cửa sổ 200.000 token, 183.616 vẫn chưa vượt qua ranh giới `>`.

Coding Agent đọc thiết lập toàn cục từ `~/.pi/agent/settings.json`. Tệp `.pi/settings.json` của dự án đã được tin cậy sẽ được hợp nhất sâu lên trên, nên dự án có thể thay một trường cấu hình nén lồng nhau mà không phải chép các trường còn lại. Pi bỏ qua tệp thiết lập của dự án chưa được tin cậy. Sau đó, mã SDK có thể gọi `SettingsManager.applyOverrides()`; các giá trị lồng nhau ở đây có ưu tiên cao hơn thiết lập đã hợp nhất từ tệp. Trường nào còn thiếu sẽ dùng giá trị mặc định tương ứng.

```json
{
  "compaction": {
    "enabled": true,
    "reserveTokens": 16384,
    "keepRecentTokens": 20000
  }
}
```

`compaction.modelOverrides` điều chỉnh hai budget này cho đúng khóa `provider/modelId` phân biệt chữ hoa chữ thường mà không đổi switch `enabled` toàn cục:

```json
{
  "compaction": {
    "reserveTokens": 16384,
    "keepRecentTokens": 20000,
    "modelOverrides": {
      "some-provider/large-context-model": {
        "reserveTokens": 400000
      }
    }
  }
}
```

Trong `compaction.modelOverrides`, mỗi giá trị `reserveTokens` và `keepRecentTokens` fallback độc lập từ model override khớp sang compaction setting thông thường, rồi mới đến built-in default. Trong ví dụ này, model được đặt tên chừa 400.000 token nhưng vẫn giữ recent suffix 20.000 token của setting thông thường. Field bị bỏ qua sẽ fallback; field không hợp lệ thì không. Cả giá trị thông thường lẫn override đều phải là số nguyên an toàn không âm.

| Field | Thứ tự resolve |
|---|---|
| `reserveTokens` | `compaction.modelOverrides[provider/modelId].reserveTokens → compaction.reserveTokens → 16384` |
| `keepRecentTokens` | `compaction.modelOverrides[provider/modelId].keepRecentTokens → compaction.keepRecentTokens → 20000` |

`enabled: false` tắt đường ngưỡng và tràn ngữ cảnh tự động vì `_checkCompaction()` trả về ngay. Thiết lập này không tắt `AgentSession.compact()`, `/compact`, RPC/SDK `compact()` hoặc lời gọi `ctx.compact()` từ Extension.

### Mức sử dụng hiện tại ưu tiên dữ liệu từ nhà cung cấp

Mô tả cũ dùng `chars / 4` làm kích thước ngữ cảnh hiện tại. Pi `0.99.2` ưu tiên `usage` hợp lệ gần nhất của assistant. `calculateContextTokens()` lấy `usage.totalTokens` khi giá trị này khác 0; nếu không, hàm cộng `input + output + cacheRead + cacheWrite`.

Với phản hồi bình thường của trợ lý có mức sử dụng khác 0, `_checkCompaction()` kiểm tra trực tiếp giá trị đó. Với phản hồi lỗi hoặc mức sử dụng toàn 0, `estimateContextTokens()` tìm mức sử dụng gần nhất của trợ lý không thuộc phản hồi lỗi hay bị hủy trong danh sách thông điệp đang hoạt động, rồi cộng ước lượng của các thông điệp theo sau. Nếu không có mức sử dụng hợp lệ, hàm ước lượng toàn bộ danh sách.

```text
mức sử dụng hợp lệ mới nhất của trợ lý
  contextTokens = totalTokens
               hoặc input + output + cacheRead + cacheWrite

mức sử dụng hợp lệ trước đó + thông điệp theo sau
  contextTokens = token từ usage + estimateTokens(thông điệp theo sau)

không có mức sử dụng hợp lệ
  contextTokens = Σ estimateTokens(toàn bộ thông điệp đang hoạt động)
```

`estimateTokens()` áp dụng `ceil(chars / 4)` cho nội dung văn bản. Hàm đếm văn bản và phần suy luận của trợ lý, tên lời gọi Tool và đối số JSON; lệnh Bash cùng đầu ra; bản tóm tắt; cũng như nội dung của người dùng, Tool tùy chỉnh hoặc kết quả Tool. Mỗi ảnh tương đương 4.800 ký tự ước lượng. Cách tính này có thể cao hoặc thấp hơn thực tế tùy ngôn ngữ và nội dung, nên Pi chỉ dùng nó làm phương án dự phòng và thước đo cho điểm cắt, không coi nó là bộ tách token chính xác.

Sau khi nén, mức sử dụng của trợ lý có trước điểm kiểm tra đã lỗi thời. Bước kiểm tra tự động không dùng nguồn `usage` có mốc thời gian bằng hoặc sớm hơn lần nén gần nhất. API công khai `getContextUsage()` cũng trả `{ tokens: null, percent: null }` cho tới khi một phản hồi hợp lệ của trợ lý sau điểm kiểm tra cung cấp mức sử dụng mới.

### Ba trường hợp tự động và một đường thủ công

Pi có ba trường hợp tự động và một đường thủ công:

| Đường | Cách phát hiện | Pi làm gì sau khi nén |
| --- | --- | --- |
| Ngưỡng | Mức sử dụng hợp lệ hoặc giá trị ước lượng vượt ngưỡng nghiêm ngặt | Giữ phản hồi đã hoàn tất; không thử lại |
| Tràn ngữ cảnh, phản hồi đã hoàn tất | Phản hồi từ cùng mô hình báo tràn nhưng có `stopReason: "stop"` | Giữ phản hồi; không thử lại |
| Tràn ngữ cảnh hoặc độ dài có thể phục hồi | Lỗi tràn từ cùng mô hình, hoặc lý do dừng `length` có thể phục hồi dưới giới hạn đầu ra mong muốn của mô hình | Ghi omission edit cho lần thử lỗi, nén projection thu được rồi thử lại một lần |
| Thủ công | `/compact [instructions]`, RPC/SDK `compact()` hoặc Extension `ctx.compact()` | Hủy lượt chạy hiện tại trước; không tự động tiếp tục lượt đó |

Pi chỉ nén rồi thử lại một lần để phục hồi khi tràn ngữ cảnh. Thông điệp assistant bị lỗi hoặc bị cắt cùng Tool result của nó có thể đã được lưu qua `message_end`. `_omitRecoveryAttempt()` ghi `ContextEditEntry` qua `appendContextEdit(targetId, null)` cho từng message entry đã phân giải rồi refresh canonical projection. Source entry vẫn còn trong cây append-only, còn các edit bền vững giữ lần thử lỗi đó ngoài những projection về sau và tạo trạng thái mà `agent.continue()` có thể tiếp tục.

Điều kiện cùng mô hình áp dụng khi phát hiện tràn ngữ cảnh và độ dài có thể phục hồi. Việc tính ngưỡng vẫn dùng mức sử dụng do nhà cung cấp trả về hoặc phép ước lượng riêng đã mô tả ở trên. Điều kiện này ngăn lỗi tràn cũ từ một mô hình có cửa sổ nhỏ hơn kích hoạt phục hồi sau khi người dùng đổi mô hình.

### Các điểm kiểm tra compaction giữa lượt chạy

Khi low-level loop còn một provider turn phải chạy, thứ tự được xác định rõ:

1. Mọi Tool result trong batch đã hoàn tất được append vào lịch sử Agent và session.
2. Sau đó Pi kiểm tra ngưỡng trên context đã cập nhật.
3. Nếu vượt ngưỡng, compaction tùy chọn hoàn tất và thay active projection của Agent.
4. Chỉ sau đó Pi mới yêu cầu phản hồi assistant kế tiếp.

Một Tool batch kết thúc mà không có message steering hoặc follow-up trong queue sẽ bỏ qua compaction giữa lượt chạy vì không có phản hồi assistant kế tiếp. Message trong queue giữ loop tiếp tục, nên cùng preparation point có thể compact trước khi delivery.

Vì vậy Pi giữ ba điểm kiểm tra: kiểm tra giữa lượt chạy ở trên, kiểm tra sau khi low-level Agent run kết thúc tại `agent_end`, và kiểm tra trước khi gửi prompt mới. Đường cuối cố ý bao gồm assistant message đã abort; đường sau run thông thường bỏ qua chúng.

### Prompt cache warming quanh Tool execution dài

Pi `0.99.2` có thể giữ prompt cache đủ điều kiện của provider còn hiệu lực khi một Tool execution dài làm chậm model request kế tiếp. Mode mặc định `cacheWarming: "streaming"` chỉ lên lịch refresh khi Agent run còn active. `cacheWarming: "idle"` cho phép tiếp tục lên lịch khi Agent đã settle, còn `"off"` tắt tính năng. Model chỉ đủ điều kiện khi metadata khai báo cache lifetime trong `promptCache` cho retention tier đang dùng của request; thiếu lifetime thì warming dừng.

Quyết định này có cân nhắc chi phí. Pi so sánh chi phí ước lượng của một cache read cộng một output token với chi phí tăng thêm dự kiến của cache miss sau đó, và chỉ warm khi mức tiết kiệm ước lượng đạt ngưỡng của runtime đã pin. Usage của warming được tính vào session total nhưng không đi vào model context. Cơ chế này không loại bỏ chi phí provider và không bảo đảm cache hit: provider vẫn quyết định việc nhận cache, thời điểm hết hạn và cách tính phí.

`/session` cho biết warming đang inactive, scheduled hay refreshing, đồng thời hiển thị quyết định chi phí kế tiếp. Usage của refresh thành công có thể xuất hiện dưới dạng transcript notice khi bật cache notice. Trước mỗi refresh đã lên lịch trong cả `streaming` lẫn `idle`, Extension nhận `cache_warming_decision`; giá trị `warm` hoặc `stop` override quyết định đó, và action từ handler cuối cùng được áp dụng. Khi transcript của session thay đổi, kể cả do compaction, Pi không còn xem request cũ là hiện hành và không warm một prefix đã lỗi thời.

| Runtime phase | Decision hook |
|---|---|
| `streaming` | `cache_warming_decision` |
| `idle` | `cache_warming_decision` |

## 3. Pi cắt nhánh đang hoạt động ở đâu

### Điểm cắt hợp lệ giữ đúng giao thức Tool

Kết quả Tool thuộc về lời gọi Tool của trợ lý đã yêu cầu nó. Nếu vùng giữ lại bắt đầu tại kết quả Tool, mô hình có thể thấy kết quả mà không thấy lời gọi. Vì vậy, `findValidCutPoints()` chấp nhận các vai trò thông điệp có trong ngữ cảnh gồm `user`, `assistant`, `bashExecution`, `custom`, `branchSummary` và `compactionSummary`, nhưng không bao giờ chấp nhận `toolResult`. Pi cũng bỏ qua mục phiên có kiểu `compaction` khi chọn ứng viên.

```text
mục:      0       1       2        3       4       5        6
         đầu    người    trợ lý   Tool   người    trợ lý   Tool
                 dùng                    dùng
ứng viên:         ✓       ✓        ✗       ✓       ✓        ✗

Nếu giữ mục 5, kết quả Tool ở mục 6 vẫn nằm sau lời gọi tương ứng.
```

Những mục không được chiếu vào ngữ cảnh, chẳng hạn nhãn hoặc lần đổi mô hình, không tạo điểm cắt thông điệp. Sau khi chọn điểm cắt, Pi quét ngược qua siêu dữ liệu liền kề không xuất hiện trong ngữ cảnh để giữ chúng ở phía được giữ lại. Quá trình dừng khi gặp một mục có mặt trong ngữ cảnh hoặc ranh giới nén cũ.

### `firstKeptEntryId` là điểm đầu của vùng giữ lại

Ranh giới xác định mục phiên đầu tiên được giữ, thay vì mục cuối cùng được tóm tắt. Cắt tại một thông điệp người dùng sẽ giữ thông điệp đó và mọi thứ phía sau. Cắt tại một thông điệp trợ lý sẽ giữ thông điệp trợ lý cùng các kết quả Tool theo sau, rồi ghi siêu dữ liệu về phần đầu của lượt bị tách.

```text
cắt tại mục người dùng số 4

0       1       2       3      [4]      5       6
đầu   người    trợ lý   Tool   người    trợ lý   Tool
       dùng                   dùng
       └──── được tóm tắt ──┘  └──── giữ nguyên văn ──────┘
                                  firstKeptEntryId = id(mục 4)
```

`firstKeptEntryId` xác định một mục trong cây phiên thay vì vị trí trong mảng. Nhờ đó, bước dựng lại có thể tìm đúng ranh giới sau khi tải lại và trên đường dẫn liên kết qua các mục cha. Nếu một phiên cũ không cung cấp được mã cho mục đã chọn, bước chuẩn bị trả `undefined` thay vì ghi một điểm kiểm tra không thể dùng.

Pi lấy `firstKeptEntryId` từ một điểm cắt hợp lệ trong các canonical projected entry của branch đã chọn, còn summary bao phủ các projected message cũ hơn nằm trước boundary đó. Plain `custom` entry bị loại khỏi LLM context và không thể là điểm cắt; `custom_message` được chiếu thành role `custom` và có thể là điểm cắt hợp lệ. Việc append checkpoint thay đổi projection về sau nhưng không xóa raw tree.

### Đi ngược theo ngân sách và ranh giới của lần nén tiếp theo

Quá trình tìm điểm cắt đi từ `boundaryEnd - 1` về `boundaryStart`, cộng số token ước lượng của mọi thông điệp mà từng mục chiếu ra. Khi tổng đạt `keepRecentTokens`, thuật toán chọn điểm cắt hợp lệ gần nhất tại hoặc sau vị trí đó. Nếu tổng không đạt ngân sách, ứng viên ban đầu vẫn là điểm cắt hợp lệ sớm nhất; bước chuẩn bị sau đó trả `undefined` nếu không còn gì để tóm tắt.

Mã giả có ghi nguồn dưới đây rút gọn thuật toán hiện tại. Sau phần lựa chọn này, Pi còn kéo siêu dữ liệu sang phía giữ lại và phát hiện lượt bị tách.

```text
Mã giả dựa trên findCutPoint(), compaction.ts dòng 403–460

cutPoints = các mục có trong ngữ cảnh và hợp lệ, loại kết quả Tool
cutIndex = điểm cắt sớm nhất
accumulated = 0

với từng mục từ mới nhất về boundaryStart:
  accumulated += token ước lượng của thông điệp do mục đó chiếu ra
  nếu accumulated >= keepRecentTokens:
    cutIndex = điểm cắt đầu tiên có chỉ số tại hoặc sau mục này
    dừng

đưa siêu dữ liệu liền kề không hiện trong ngữ cảnh về trước cutIndex
suy ra turnStartIndex và isSplitTurn
trả về firstKeptEntryIndex, turnStartIndex, isSplitTurn
```

Trong lần nén đầu, `boundaryStart` là đầu canonical projected path. Ở lần sau, `prepareCompaction()` gọi `buildSessionProjection()`, tìm `CompactionEntry` mới nhất đang được chiếu rồi đặt `boundaryStart = prevCompactionIndex + 1`. Projection đã áp dụng retained tail của checkpoint đó cùng mọi `context_edit` theo sau, nên bước chuẩn bị không tìm `firstKeptEntryId` cũ trên raw branch. Các message sống sót qua điểm cắt trước vẫn có thể đi vào summary kế tiếp qua canonical projection.

```text
canonical projection
  [prevCompactionIndex: bản tóm tắt A] + các projected entry được giữ

chuẩn bị lần tiếp theo
  previousSummary = bản tóm tắt A
  boundaryStart   = prevCompactionIndex + 1
  điểm cắt mới    = firstKept(B) trong projected entry

thông điệp [boundaryStart, điểm cắt mới) → đầu vào cho bản tóm tắt mới
thông điệp [điểm cắt mới, lá hiện tại]   → vùng giữ lại
```

Với Virtual Model đã chọn, entry `model_change` là session/tree state của selection đó, còn router state được lưu riêng trong một `custom` entry có tên `pi.virtual-model-state`. Khi restore hoặc chọn branch, Pi dựng lại selection đã đăng ký từ active path; nếu Virtual Model không còn đăng ký, Pi fallback về physical response mới nhất trên branch. Physical model dùng cho mỗi assistant turn được ghi trong assistant message. Compaction thay đổi canonical context projection; nó không replay routing decision cũ và không reroute turn đã lưu.

## 4. Nội dung thay thế các thông điệp cũ

### Điểm kiểm tra cố định gồm sáu mục

Pi yêu cầu mô hình tóm tắt tạo một điểm kiểm tra để tiếp tục công việc. Các nhãn chính xác bên dưới nằm trong khối mẫu, nên chúng không trở thành tiêu đề trên thanh điều hướng của trang:

```markdown
## Goal
[Người dùng đang muốn hoàn thành việc gì?]

## Constraints & Preferences
- [Ràng buộc hoặc tùy chọn ưu tiên, hoặc "(none)"]

## Progress
### Done
- [x] [Phần việc đã hoàn thành]

### In Progress
- [ ] [Phần việc hiện tại]

### Blocked
- [Trở ngại hiện tại]

## Key Decisions
- **[Quyết định]**: [Lý do ngắn]

## Next Steps
1. [Các bước tiếp tục theo thứ tự]

## Critical Context
- [Dữ liệu, ví dụ hoặc tham chiếu chính xác cần để tiếp tục]
```

Lời nhắc yêu cầu giữ nguyên đường dẫn tệp, tên hàm và thông báo lỗi. Các mục cố định giảm khả năng một chi tiết nổi bật lấn át mục tiêu ban đầu hoặc hành động cần làm tiếp. Mô hình vẫn có thể bỏ sót hoặc làm sai lệch thông tin, nên phần đuôi được giữ nguyên và lịch sử phiên có thể kiểm tra vẫn là một phần của thiết kế.

### Tuần tự hóa và yêu cầu tạo bản tóm tắt

`generateSummaryWithUsage()` chạy `convertToLlm()` của Coding Agent trên vùng `AgentMessage[]` đã chọn. Sau đó, hàm tuần tự hóa các thông điệp tương thích thành văn bản có nhãn để mô hình tóm tắt đọc chúng như dữ liệu nguồn, thay vì tiếp tục cuộc hội thoại.

```text
[User]: Sửa lỗi xác thực trong src/auth.ts

[Assistant thinking]: Kiểm tra đường gọi trước khi sửa.

[Assistant tool calls]: read(path="src/auth.ts")

[Tool result]: export function authenticate(...) { ... }

[Assistant]: deriveKey() chưa nhận salt.
```

Mỗi kết quả Tool sau khi tuần tự hóa giữ tối đa 2.000 ký tự, rồi thêm một dấu đánh dấu số ký tự đã lược bỏ. Giới hạn này chỉ áp dụng cho yêu cầu tóm tắt; nó không viết lại mục kết quả Tool đã lưu.

Request dùng `SUMMARIZATION_SYSTEM_PROMPT`, không cung cấp định nghĩa Tool, không ép `toolChoice: "none"`, tắt ghi prompt cache bằng `cacheRetention: "none"`, và tạo routing session id mới nếu caller không cấp. Lỗi tạm thời trong summary stream tuân theo retry policy đã cấu hình; lỗi tất định và abort trả về ngay. History summary chính dùng một lần gọi model. Turn bị tách có thể cần request cho history chính, sau đó là request cho turn prefix; Pi hiện chạy hai request này tuần tự.

### Từ chối summary chưa hoàn chỉnh

Pi 0.99.2 chạy `getSummarizationFailure` sau từng request history summary tích hợp sẵn và turn-prefix summary; branch summarization dùng cùng phép kiểm tra. Response có `stopReason: "length"` là chưa hoàn chỉnh, nên Pi báo failure và không append hay lưu partial text thành `CompactionEntry` hoặc `BranchSummaryEntry`. Đường main và prefix throw vào lifecycle compaction failure đã mô tả; đường branch trả error result. `getSummarizationFailure` không được export từ package root.

Branch summarization hiện cho phép output cap 4.096 token, bị chặn bởi `model.maxTokens` dương nhỏ hơn, thay vì cap 2.048 token cũ. Thay đổi này sửa failure khi reasoning dùng allowance trước đó trước khi đủ final summary text được emit. Cap lớn hơn không làm yếu validation: history summary, turn-prefix summary và branch summary vẫn từ chối `stopReason: "length"`.

### Bản tóm tắt tăng dần có quy tắc đầu vào chính xác

Khi `prepareCompaction()` tìm thấy lần nén cũ, hàm chép `summary` của mục đó vào `previousSummary`. Với lần nén không tách lượt, hoặc lần nén tách lượt có thông điệp cũ hoàn chỉnh để tóm tắt, `generateSummaryWithUsage()` bọc các thông điệp mới trong `<conversation>` và điểm kiểm tra trước trong `<previous-summary>`, rồi chuyển từ lời nhắc ban đầu sang chỉ dẫn cập nhật.

```text
lần nén đầu
  thông điệp 1…30 → bản tóm tắt A

lần nén sau
  <conversation>thông điệp được A giữ nhưng nay nằm trước điểm cắt B</conversation>
  <previous-summary>bản tóm tắt A</previous-summary>
  → bản tóm tắt B
```

Chỉ dẫn cập nhật yêu cầu giữ thông tin cũ, thêm tiến độ và quyết định, chuyển phần đã hoàn thành, cập nhật bước tiếp theo, đồng thời cho phép bỏ thông tin không còn liên quan. “Tăng dần” ở đây là bản cập nhật do LLM thực hiện theo chỉ dẫn, không phải phép nối byte nguyên trạng.

Trong lượt bị tách, `compact()` khởi tạo `historyText` bằng `previousSummary ?? "No prior history."`. Khi `messagesToSummarize` không rỗng, history summary mới sinh sẽ thay giá trị đó. Khi đoạn bị tách không có message cũ hoàn chỉnh, Pi không tạo request lịch sử riêng nhưng vẫn giữ `previousSummary` nếu đã có; literal fallback chỉ xuất hiện khi không có summary trước.

### Siêu dữ liệu thao tác tệp có phạm vi hẹp và được tích lũy

Cơ chế nén mặc định chỉ xét lời gọi Tool của trợ lý có tên chính xác `read`, `write` hoặc `edit` khi đối số chứa `path` kiểu chuỗi. Nó mang `details` của lần nén trước do Pi tạo sang lần tiếp theo, rồi bổ sung thao tác từ cả vùng tóm tắt chính lẫn phần đầu của lượt bị tách.

`computeFileLists()` sắp xếp kết quả. Đường dẫn xuất hiện trong `write` hoặc `edit` đi vào `modifiedFiles`; đường dẫn đó bị loại khỏi `readFiles`, nên danh sách này chỉ còn tệp chỉ đọc. Pi không suy luận tác dụng phụ từ Bash hoặc quy ước của Tool tùy chỉnh. Mục trước do Extension tạo (`fromHook: true`) có thể dùng lược đồ `details` khác, vì vậy cơ chế trích xuất tích hợp sẵn không giả định mục đó chứa danh sách tệp của Pi.

```text
<read-files>
src/utils/hash.ts
</read-files>

<modified-files>
src/auth.ts
</modified-files>
```

Các thẻ này chỉ được nối vào bản tóm tắt khi danh sách tương ứng không rỗng. Hai mảng cũng được lưu trong `details` của mục do Pi tạo, giúp lần nén tích hợp sẵn tiếp theo mang dữ liệu đi tiếp mà không phải phân tích văn xuôi.

## 5. Trường hợp biên: một lượt lớn hơn ngân sách giữ lại

Một lượt bắt đầu bằng một thông điệp mở đầu lượt và kéo dài qua các thông điệp trợ lý cùng kết quả Tool tiếp theo cho tới điểm bắt đầu lượt kế tiếp. Pi coi các vai trò `user`, `bashExecution`, `custom`, `branchSummary` và `compactionSummary` là điểm bắt đầu lượt. Vai trò `assistant` và `toolResult` không bắt đầu lượt.

### Vì sao cho phép điểm cắt tại trợ lý

Nếu chỉ cắt tại người dùng, mỗi lượt luôn trọn vẹn, nhưng một lượt lớn có thể làm vùng giữ lại vượt xa `keepRecentTokens`. Điểm cắt tại trợ lý cho thuật toán một ranh giới dùng được bên trong lượt đó, đồng thời vẫn giữ các kết quả Tool theo sau lời gọi tương ứng.

Cấu trúc kết quả hiện tại thể hiện rõ hệ quả này. Đoạn khai báo kiểu sau bám sát mã nguồn, nhưng không thay thế việc nhập `CutPointResult` đã được xuất:

```typescript
interface CutPointResult {
  firstKeptEntryIndex: number;
  turnStartIndex: number;
  isSplitTurn: boolean;
}
```

Nếu mục được chọn tự bắt đầu một lượt, `turnStartIndex` là `-1` và `isSplitTurn` là `false`. Nếu không, Pi quét ngược tới mục bắt đầu lượt gần nhất trong ranh giới nén hiện tại.

```text
một lượt quá lớn

mục:       1       2       3       4       5       6      [7]      8
        người    trợ lý   Tool    trợ lý   Tool    Tool    trợ lý   Tool
         dùng
          ↑                                                ↑
    turnStartIndex                                 firstKeptEntryId
          └────────── turnPrefixMessages: 1…6 ─────────────┘
                                                           └─ giữ: 7…8
```

Yêu cầu của người dùng thuộc `turnPrefixMessages`, không thuộc bản tóm tắt lịch sử chính. Các lượt cũ hoàn chỉnh kết thúc trước `turnStartIndex` và đi vào `messagesToSummarize`.

### Điểm kiểm tra phần đầu nối lại lượt bị tách

Yêu cầu cho phần đầu lượt dùng giới hạn đầu ra nhỏ hơn, tức giá trị nhỏ hơn giữa `floor(0.5 × reserveTokens)` và `model.maxTokens`, cùng mẫu riêng sau:

```markdown
## Original Request
[Người dùng đã yêu cầu gì trong lượt này?]

## Early Progress
- [Quyết định và phần việc chính đã hoàn thành trong phần đầu]

## Context for Suffix
- [Thông tin cần để hiểu phần việc gần đây được giữ lại]
```

Khi có thông điệp cũ hoàn chỉnh, Pi trước tiên tạo hoặc cập nhật bản tóm tắt lịch sử sáu mục. Sau đó, Pi tạo bản tóm tắt phần đầu lượt. Mức sử dụng của hai yêu cầu được cộng theo từng trường. Văn bản được lưu bằng cách nối hai phần qua dấu phân cách và nhãn `Turn Context (split turn)`.

```text
[bản tóm tắt lịch sử sáu mục mới, previousSummary, hoặc "No prior history."]

---

Turn Context (split turn):

[Original Request / Early Progress / Context for Suffix]

sau đó, trong ngữ cảnh được chiếu:
[trợ lý tại firstKeptEntryId] [kết quả Tool của nó] [thông điệp về sau]
```

Việc tách lượt vẫn làm mất thông tin, nhưng mô hình tiếp theo nhận yêu cầu ban đầu và phần việc đầu dưới dạng ngữ cảnh có cấu trúc trước khi thấy phần đuôi nguyên văn.

## 6. Lưu trữ, dựng lại và sự kiện vòng đời

### `CompactionEntry` là điểm kiểm tra được lưu

`SessionManager.appendCompaction()` thêm một mục con vào lá hiện tại rồi chuyển lá sang mục mới. Phương thức này không xóa các mục vừa được tóm tắt. Kiểu công khai của Coding Agent tại phiên bản mã nguồn đã ghim có cấu trúc sau:

```typescript
import type { SystemMessage, Usage } from "@earendil-works/pi-ai";

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
  systemMessage?: SystemMessage;
}
```

`timestamp` là chuỗi ISO trong phiên đã lưu, khác với mốc thời gian dạng số của `AgentMessage` được chiếu. `fromHook` là tên trường tương thích ngược dành cho kết quả do Extension cung cấp. `details` phải tuần tự hóa được thành JSON nếu phiên được lưu dưới dạng JSONL. Khi `appendCompaction()` tạo entry, nó chụp leading `SystemMessage` hiện hành vào `systemMessage` nếu message này tồn tại, nhờ đó giữ prompt và trạng thái Tool tại ranh giới compaction.

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

`tokensBefore` đo active context đã được dựng lại và sắp bị thay thế. Khi không có context edit, Pi có thể dùng provider usage hợp lệ rồi fallback sang phép ước lượng. Khi active projection có `context_edit`, usage gốc mô tả một transcript khác, nên threshold accounting dùng phép ước lượng trên projected context. Giá trị này không phải số token của mọi entry JSONL, kích thước session file theo byte hay usage của summary request. `usage` của bước tạo summary được lưu riêng và cộng vào tổng token cùng chi phí của toàn session.

Truyền `null` làm retained boundary sẽ tạo compaction dạng retain-none:

```typescript
sessionManager.appendCompaction(summary, null, tokensBefore);
```

`appendCompaction()` sinh ID của entry mới rồi lưu chính ID đó làm `firstKeptEntryId` bên trong. Vì vậy projection kế tiếp bắt đầu tại compaction checkpoint và không giữ entry nào đứng trước; caller không cần tự tạo một first-kept ID vốn chưa tồn tại.

| Tình huống | Cách projection/accounting xử lý | Kết quả |
| --- | --- | --- |
| `appendCompaction(summary, null, tokensBefore)` | `ID của compaction entry` | `không giữ entry nào đứng trước` |
| `có context_edit` | `ước lượng projected context` | `tính toán usage` |
| `lượt retry / recovery đã bị bỏ` | `context_edit với replacement: null` | `bị loại khỏi provider context về sau` |
| `lịch sử thô` | `chỉ ghi thêm (append-only)` | `được giữ nguyên` |

Khi retry sau overflow hoặc recoverable length, Coding Agent append omission edit cho failed assistant attempt cùng Tool result trước khi compact. Provider context về sau loại bỏ attempt đã bỏ đó, nhưng raw session tree và UI history vẫn còn. Các omission entry cũng đi qua đường compact-and-retry, nên failed attempt không xuất hiện lại sau khi context được dựng lại.

### Cây đã lưu, phép chiếu đang hoạt động và biến đổi từng lần gọi là ba trạng thái khác nhau

Session tree giữ raw entry cũ, context edit, entry được giữ lại, compaction entry và các child về sau. `buildContextEntries()` chỉ đi theo parent path của leaf đã chọn và tìm compaction gần nhất. Sau đó `buildSessionProjection()` áp dụng edit mới nhất cho từng target đã chọn mà không sửa stored entry:

```text
đường đã chọn trong dữ liệu lưu
mục thô cũ → firstKept → mục gần đây → CompactionEntry → mục về sau

các mục ngữ cảnh đang hoạt động
CompactionEntry → firstKept → mục gần đây → mục về sau

AgentMessage[] đang hoạt động
CompactionSummaryMessage → thông điệp được giữ → thông điệp về sau
```

`CompactionEntry` gần nhất trở thành `CompactionSummaryMessage` có mốc thời gian thông điệp dạng số. Sau đó, `convertToLlm()` của Coding Agent chuyển nó thành thông điệp người dùng của Pi AI, với văn bản được bọc trong lời dẫn nén cố định và thẻ `<summary>`.

```text
The conversation history before this point was compacted into the following summary:

<summary>
[bản tóm tắt đã lưu]
</summary>
```

Phép chiếu này diễn ra khi tải phiên và sau khi nén. Trong mỗi lần gọi mô hình, lõi Agent tiếp tục áp dụng hook `transformContext` của Chương 8 lên `AgentMessage[]` đó, rồi chạy `convertToLlm()` của Coding Agent. Hook có thể lọc phép chiếu của một yêu cầu; nó không ghi thêm `CompactionEntry`, đổi `firstKeptEntryId` hay xóa cây đã lưu.

Bộ thực thi Agent dùng chung trong kho mã có lược đồ nén riêng, với `retainedTail` đã được cụ thể hóa. Coding Agent `SessionManager` tại phiên bản mã nguồn đã ghim dùng `firstKeptEntryId`. Không thêm `retainedTail` vào kiểu `CompactionEntry` của Coding Agent hoặc giả định hai hợp đồng lưu trữ dựng ngữ cảnh giống nhau.

### Sự kiện công khai và hook Extension phục vụ các thành phần khác nhau

Thành phần đăng ký qua `AgentSession.subscribe()` nhận `compaction_start` và `compaction_end`. Sự kiện bắt đầu có `reason: "manual" | "threshold" | "overflow"`. Sự kiện kết thúc luôn mang cùng `reason`. Trong declaration, các field còn lại là `result: CompactionResult | undefined`, `aborted: boolean`, `willRetry: boolean` và `errorMessage?: string`; chỉ property cuối là tùy chọn.

Extension có ba hook riêng:

- `session_before_compact` được chờ hoàn tất và có thể trả `{ cancel: true }` hoặc kết quả nén tùy chỉnh.
- `session_compact` được chờ hoàn tất sau khi mục mới đã được ghi và các thông điệp Agent đã được dựng lại.
- `session_compact_failed` được chờ hoàn tất sau lỗi hoặc thao tác hủy và mang trạng thái kết thúc.

Các sự kiện bắt đầu và kết thúc công khai của phiên được phát đồng bộ tới bên đăng ký. Hook Extension được phân luồng qua `ExtensionRunner`; kết quả hủy sẽ dừng các trình xử lý phía sau, còn kết quả không hủy cuối cùng sẽ được dùng. Nếu không có trình xử lý nào trả kết quả tùy chỉnh, bộ nén tích hợp sẵn tiếp tục xử lý. Hook ném lỗi sẽ được báo thành lỗi Extension, còn quá trình phân luồng vẫn tiếp tục.

```text
thủ công: compaction_start
  → kiểm tra mô hình/xác thực → chuẩn bị → session_before_compact
  → kết quả tích hợp sẵn hoặc tùy chỉnh → ghi mục → dựng lại thông điệp Agent
  → session_compact → compaction_end(thành công)

tự động: chuẩn bị trước → compaction_start
  → session_before_compact → kết quả tích hợp sẵn hoặc tùy chỉnh
  → ghi mục → dựng lại thông điệp Agent → session_compact
  → compaction_end(thành công, willRetry)

lỗi kết thúc hoặc thao tác hủy thông thường sau compaction_start
  → compaction_end(result: undefined, aborted/errorMessage)
  → session_compact_failed

phục hồi overflow đã dùng hết, không có compaction_start mới
  → compaction_end(reason: overflow, result: undefined, các field kết thúc)
  → session_compact_failed (được chờ với cùng trạng thái kết thúc)
```

Lỗi compaction thông thường đã bắt đầu đi theo chuỗi `compaction_start`, rồi `compaction_end`, cuối cùng là hook `session_compact_failed` được chờ hoàn tất.

Phục hồi overflow đã dùng hết là ngoại lệ kết thúc đối với cặp start/end. Không có `compaction_start` mới, Pi phát `compaction_end` rồi chờ `session_compact_failed` hoàn tất. Sự kiện kết thúc có `result: undefined`; cả hai mang `reason: "overflow"`, `errorMessage` là `Context overflow recovery failed after one compact-and-retry attempt. Try reducing context or switching to a larger-context model.` hoặc `Truncated response recovery failed after one compact-and-retry attempt.`, `aborted: false` và `willRetry: false`; sự kiện lỗi của Extension còn mang `fromExtension: false`.

Extension dưới đây ghi nhận kết quả của cả ba hook mà không thay bản tóm tắt tích hợp sẵn:

```typescript
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

type SessionCompactFailedEvent = {
  type: "session_compact_failed";
  reason: "manual" | "threshold" | "overflow";
  errorMessage?: string;
  aborted: boolean;
  willRetry: boolean;
  fromExtension: boolean;
};

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
    const failure: SessionCompactFailedEvent = event;
    const detail = failure.aborted
      ? "aborted"
      : (failure.errorMessage ?? "failed");
    ctx.ui.notify(`Compaction ${detail}`, "warning");
  });
}
```

Payload kết thúc gồm năm field đó không có mục compaction hay số token. `errorMessage` chỉ có mặt với lỗi không phải abort; `aborted` bằng true khi hook yêu cầu hủy hoặc tín hiệu bị abort. `fromExtension` chỉ bằng true khi nội dung compaction tùy chỉnh đang được dùng tại thời điểm lỗi. Vì sự kiện ghi một kết quả kết thúc, `willRetry` bằng false ngay cả với lần overflow mà đường thành công lẽ ra sẽ retry.

Session phát đồng bộ `compaction_end`, rồi chờ `session_compact_failed` hoàn tất sau `compaction_end`, trước khi `compact()` thủ công reject hoặc đường tự động trả `false`. Vì vậy, handler lỗi có thể ghi xong telemetry trước khi caller quan sát settlement kết thúc.

Với lỗi thủ công, `compact()` reject sau `session_compact_failed`; với thao tác hủy, abort, lỗi summary hoặc phục hồi overflow đã dùng hết một lần retry trên đường tự động, đường tự động trả `false` sau `session_compact_failed`. Cả hai đường đều không ghi mục compaction mới, và implementation tự động xử lý nội bộ các kết quả kết thúc này thay vì ném chúng cho caller.

Kết quả thay thế từ `session_before_compact` phải có `summary`, `firstKeptEntryId` và `tokensBefore`; `usage` cùng `details` là tùy chọn. Pi không kiểm tra lại điểm cắt cho kết quả đó, nên trình xử lý thường phải chép `firstKeptEntryId` và `tokensBefore` đã chuẩn bị. Extension nhận ranh giới đã chuẩn bị, hai vùng thông điệp, bản tóm tắt trước, thao tác tệp, lý do, ý định thử lại, các mục nhánh và `AbortSignal` đang hoạt động. Lần gọi mô hình tùy chỉnh nên truyền tín hiệu này và trả về mức sử dụng do nhà cung cấp báo cáo.

### Quy tắc khi lỗi, hủy và thử lại

Lệnh `compact()` thủ công hủy lượt chạy Agent trước, phát `compaction_start`, rồi kết thúc bằng lỗi nếu thiếu mô hình, không có gì để nén, hook yêu cầu hủy, tín hiệu bị hủy hoặc bước tóm tắt thất bại. Lệnh hủy từ hook trở thành `Error("Compaction cancelled")`. `compaction_end` tương ứng có `aborted: true`, không có `errorMessage` và có `willRetry: false`; `session_compact_failed` nhận cùng trạng thái kết thúc.

`abortCompaction()` hủy bộ điều khiển của lần nén thủ công hoặc tự động. Lần gọi tóm tắt tích hợp sẵn nhận tín hiệu đó. Pi kiểm tra tín hiệu lần nữa trước khi ghi, nên thao tác hủy sau khi tạo bản tóm tắt nhưng trước khi lưu sẽ không ghi điểm kiểm tra.

Kết quả hủy từ hook hoặc tín hiệu hủy trong đường tự động trả `false` về vòng lặp sau lượt chạy, phát sự kiện kết thúc, không ghi mục mới và tắt thử lại cho lần đó. Các lỗi tự động khác được định dạng thành `Auto-compaction failed: ...` hoặc `Context overflow recovery failed: ...`, rồi được phát, báo cho `session_compact_failed` và được `_runAutoCompaction()` xử lý nội bộ thay vì ném cho bên gọi. Nếu ngữ cảnh vẫn tràn sau đúng một lần nén rồi thử lại, Pi phát lỗi phục hồi kết thúc và không nén hay thử thêm.

Pi không phát `compaction_start` công khai khi bước chuẩn bị tự động trả `undefined`. Đường thủ công phát sự kiện bắt đầu sớm hơn, nên lỗi `Already compacted` hoặc `Nothing to compact (session too small)` vẫn có sự kiện kết thúc tương ứng. Khi thành công, Pi chỉ phát `compaction_end` sau khi lưu, chiếu lại ngữ cảnh và chạy `session_compact`. Đường thủ công xóa bộ điều khiển trước sự kiện kết thúc để trình lắng nghe có thể gửi lời nhắc đang chờ một cách an toàn.

## 7. Chuỗi xử lý hoàn chỉnh từ đầu đến cuối

Đường tự động hoàn chỉnh đi qua năm dạng biểu diễn: mức sử dụng từ nhà cung cấp, mục phiên, thông điệp của yêu cầu tóm tắt, điểm kiểm tra đã lưu và yêu cầu tiếp theo gửi tới nhà cung cấp.

```text
1. Phase assistant và Tool kết thúc
   message_end lưu assistant cùng mọi Tool result trong batch đã hoàn tất

2. Gate giữa run, chỉ khi low-level loop sẽ tiếp tục
   prepareNextTurnWithContext → kiểm tra ngưỡng
   → compaction tùy chọn và dựng lại projection → phản hồi assistant kế tiếp
   (Tool batch kết thúc không có queued message sẽ bỏ qua gate này)

3. Gate sau run
   agent_end → _handlePostAgentRun() → _checkCompaction()

4. Phân loại
   tràn/độ dài có thể phục hồi từ cùng mô hình HOẶC ngưỡng từ mức sử dụng hiện tại

5. Chuẩn bị
   buildSessionProjection(pathEntries)
   → tính lại tokensBefore bằng estimateProjectedContextTokens(projection, pathEntries)
   → tìm ranh giới projected previous-summary
   → đi ngược qua projected entry để chọn firstKeptEntryId
   → chia messagesToSummarize / turnPrefixMessages / vùng giữ lại
   → thu thập thao tác tệp tích hợp sẵn

6. Can thiệp
   compaction_start → chờ session_before_compact
   → hủy, dùng kết quả tùy chỉnh hoặc tạo kết quả tích hợp sẵn

7. Tóm tắt
   convertToLlm → serializeConversation (kết quả Tool giới hạn 2.000 ký tự)
   → yêu cầu ban đầu/cập nhật theo sáu mục
   → yêu cầu phần đầu lượt theo thứ tự nếu cần
   → nối danh sách tệp đã sắp xếp và cộng mức sử dụng

8. Lưu
   SessionManager.appendCompaction(...)
   → mục JSONL mới nối với mục cha; mục cũ vẫn còn

9. Chiếu
   buildSessionProjection()
   → CompactionSummaryMessage + mục từ firstKeptEntryId + mục về sau
   → thay agent.state.messages

10. Thông báo và tiếp tục
   session_compact → compaction_end
   → thử lại một lượt bị tràn, phát thông điệp đang chờ hoặc kết thúc

11. Lần gọi mô hình tiếp theo
   transformContext → convertToLlm
   → lời nhắc hệ thống + thông điệp người dùng <summary> + thông điệp gần đây nguyên văn
```

Nén thủ công đi vào bước 6 sau khi hủy lượt chạy Agent đang hoạt động và chuẩn bị các vùng thông điệp. Đường này không đi vào nhánh thử lại tự động ở bước 10.

## 8. Nguyên tắc thiết kế và kiểm tra bàn giao

### 1. Giữ phần đuôi gần đây đúng giao thức

Việc chọn theo chiều ngược ưu tiên giữ nguyên văn phần việc gần đây hơn phần việc cũ có cùng chi phí token. Điểm cắt hợp lệ còn áp đặt một ràng buộc cứng của giao thức. Kết quả Tool được giữ lại mà thiếu lời gọi tương ứng sẽ tạo ngữ cảnh sai cấu trúc, nên `keepRecentTokens` chỉ là mục tiêu, không cho phép cắt tại một độ lệch token tùy ý.

Hãy kiểm thử thuộc tính này bằng một lượt có nhiều lời gọi Tool gần ranh giới. Xác nhận mục được chọn không bao giờ là kết quả Tool, mọi kết quả Tool được giữ lại vẫn theo sau lời gọi của trợ lý, và ranh giới tại trợ lý tạo `turnPrefixMessages` bắt đầu đúng ở mục mở đầu lượt.

### 2. Giữ khả năng kiểm tra khi truyền trạng thái có mất mát

Mẫu sáu mục, mẫu cho lượt bị tách, `firstKeptEntryId`, `tokensBefore`, danh sách tệp và `usage` của bản tóm tắt cho biết nội dung đã thay đổi và cách Pi tạo ra nó. Không trường nào chứng minh bản tóm tắt đã đầy đủ. Kiểm thử chất lượng cần xác nhận điểm kiểm tra vẫn chứa mục tiêu đang thực hiện, ràng buộc của người dùng, quyết định đã chấp nhận, phần việc chưa xong, trở ngại, đường dẫn, lệnh và lỗi cần cho hành động tiếp theo.

Không chép bí mật vào bản tóm tắt chỉ vì nó từng xuất hiện trong lịch sử. Nén không xóa dữ liệu: các mục thô vẫn còn trong tệp phiên, bản tóm tắt có thể lặp lại nội dung cũ, và bộ thực thi Agent dùng chung có thể sao chép nội dung vào phần đuôi được giữ lại. Xóa dữ liệu để đáp ứng yêu cầu tuân thủ cần một thao tác viết lại kho lưu trữ chính xác, tách khỏi cơ chế thời gian chạy này.

### 3. Tách lưu trữ, phép chiếu và điều hướng

Nén thay phép chiếu của nhánh đang hoạt động bằng cách thêm `CompactionEntry`. `transformContext` chỉ thay một yêu cầu trong bộ nhớ. Tóm tắt nhánh giải quyết bài toán khác: khi thao tác điều hướng cây yêu cầu bản tóm tắt, Pi thêm `BranchSummaryEntry` tại đường dẫn đích để phần việc hữu ích từ nhánh sắp rời đi được mang theo. Cơ chế này không dùng ngưỡng nén hay `firstKeptEntryId`.

Trước khi bàn giao một phần tích hợp nén, hãy kiểm tra các trường hợp sau:

1. Ranh giới chính xác của ngưỡng và hai giá trị mặc định hiện tại.
2. Mức sử dụng từ nhà cung cấp, phương án dự phòng cho lỗi hoặc toàn 0, và việc loại bỏ mức sử dụng cũ sau khi nén.
3. Lần nén đầu, lần nén lặp lại, mã mục được giữ trước đó bị thiếu và trường hợp không còn gì để tóm tắt.
4. Điểm cắt trọn lượt và điểm cắt giữa lượt, gồm thứ tự Tool cùng tổng mức sử dụng của bản tóm tắt phần đầu.
5. Thứ tự ưu tiên của thiết lập toàn cục, dự án và SDK, cùng trường hợp dự án chưa được tin cậy.
6. Thành công và hủy thủ công, hook tự động yêu cầu hủy, lỗi tóm tắt, tín hiệu hủy, thử lại sau tràn thành công và lần tràn thứ hai thất bại.
7. Các trường của mục JSONL, mục ngữ cảnh đang hoạt động, `AgentMessage[]` được chiếu và `Message[]` cuối cùng của Pi AI dưới dạng bốn phép kiểm tra riêng.
8. `details` tích hợp sẵn so với Extension, tệp chỉ đọc so với tệp đã sửa, và thao tác từ Bash hoặc Tool tùy chỉnh cần siêu dữ liệu riêng.

## 9. Trạm tiếp theo

[Chương 10](ch10-session.md) đi sâu vào cây JSONL liên kết qua các mục cha mà `getBranch()`, `appendCompaction()` và `buildContextEntries()` sử dụng, cùng thao tác quay lại và điều hướng nhánh. Mô hình lưu trữ đó giải thích vì sao cơ chế nén có thể bỏ các mục cũ khỏi yêu cầu mô hình tiếp theo mà không xóa chúng.

Các tham chiếu triển khai của chương này được ghim tại Pi `0.99.2`, commit `005af57d88ee23b33778f343a9595b32e67ff788`:

- [Giá trị mặc định, cách tính token, điểm cắt, mẫu, bước chuẩn bị và tạo kết quả nén](https://github.com/earendil-works/pi/blob/005af57d88ee23b33778f343a9595b32e67ff788/packages/coding-agent/src/core/compaction/compaction.ts)
- [Tuần tự hóa bản tóm tắt và theo dõi thao tác tệp](https://github.com/earendil-works/pi/blob/005af57d88ee23b33778f343a9595b32e67ff788/packages/coding-agent/src/core/compaction/utils.ts)
- [`CompactionEntry`](https://github.com/earendil-works/pi/blob/005af57d88ee23b33778f343a9595b32e67ff788/packages/coding-agent/src/core/session-manager.ts), [`appendCompaction()`](https://github.com/earendil-works/pi/blob/005af57d88ee23b33778f343a9595b32e67ff788/packages/coding-agent/src/core/session-manager.ts) và [`buildSessionContext()`](https://github.com/earendil-works/pi/blob/005af57d88ee23b33778f343a9595b32e67ff788/packages/coding-agent/src/core/session-manager.ts)
- [Đường xử lý vòng đời, thử lại, hủy và thất bại trong chế độ thủ công hoặc tự động](https://github.com/earendil-works/pi/blob/005af57d88ee23b33778f343a9595b32e67ff788/packages/coding-agent/src/core/agent-session.ts)
- [Hợp đồng nén trong context của Extension](https://github.com/earendil-works/pi/blob/005af57d88ee23b33778f343a9595b32e67ff788/packages/coding-agent/src/core/extensions/types.ts) và [các event hook](https://github.com/earendil-works/pi/blob/005af57d88ee23b33778f343a9595b32e67ff788/packages/coding-agent/src/core/extensions/types.ts)
- [Chuyển đổi thông điệp tóm tắt nén](https://github.com/earendil-works/pi/blob/005af57d88ee23b33778f343a9595b32e67ff788/packages/coding-agent/src/core/messages.ts) và [thứ tự biến đổi cho từng lần gọi](https://github.com/earendil-works/pi/blob/005af57d88ee23b33778f343a9595b32e67ff788/packages/agent/src/agent-loop.ts)
- [Hợp nhất thiết lập toàn cục/dự án](https://github.com/earendil-works/pi/blob/005af57d88ee23b33778f343a9595b32e67ff788/packages/coding-agent/src/core/settings-manager.ts), [giá trị ghi đè từ SDK](https://github.com/earendil-works/pi/blob/005af57d88ee23b33778f343a9595b32e67ff788/packages/coding-agent/src/core/settings-manager.ts) và [giá trị nén có hiệu lực](https://github.com/earendil-works/pi/blob/005af57d88ee23b33778f343a9595b32e67ff788/packages/coding-agent/src/core/settings-manager.ts)
- [Lược đồ `retainedTail` của Agent dùng chung](https://github.com/earendil-works/pi/blob/005af57d88ee23b33778f343a9595b32e67ff788/packages/agent/src/harness/session/types.ts), khác với Coding Agent `SessionManager`

> **Tiếp theo:** [Chương 10: Quản lý phiên](ch10-session.md)
