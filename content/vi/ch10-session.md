---
title: "Chương 10: Quản lý session: lưu, tiếp tục và phân nhánh hội thoại"
description: Cách Pi lưu một session thành cây JSONL nối bằng parent, dựng lại context đang hoạt động và cung cấp SessionManager.
translation_key: ch10-session
language: vi
chapter: 10
source_url: "https://www.dgzhuya.com/modules/ch10-session"
official_refs:
  - "https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/coding-agent/docs/sessions.md"
terms_used:
  - Session
  - Session Tree
  - SessionManager
  - SessionEntry
  - CompactionEntry
  - BranchSummaryEntry
status: reviewed
last_updated: "2026-08-24"
translator: Pify maintainers
reviewed_by: Pify maintainers
---

Chương 9 kết thúc với một `CompactionEntry` trên Session Tree. Mô tả ngắn đó còn để lại hai câu hỏi: cây nằm ở đâu, và `buildSessionContext()` biến cây trở lại danh sách message tuyến tính mà mỗi model call cần bằng cách nào?

Coding Agent của Pi giải quyết cả hai bằng một file session bền vững. Mỗi record sau header trỏ đến parent, một leaf trong bộ nhớ đánh dấu vị trí hiện tại, còn bước dựng context chiếu ra đúng một đường từ root đến leaf. Vì vậy, cùng một file có thể giữ nhiều hướng xử lý trong khi model chỉ thấy branch mà người dùng đã chọn.

## 1. Bắt đầu từ hai câu hỏi về lưu trữ

`context.messages` là một mảng tại ranh giới model. Mảng này không cho biết hội thoại tồn tại ở đâu sau khi process kết thúc, cũng không cho biết ứng dụng giữ lịch sử theo hình dạng nào. Thiết kế persistence nên trả lời riêng hai câu hỏi:

- **Nơi lưu trữ:** record được ghi ở đâu?
- **Cấu trúc logic:** các record liên hệ với nhau ra sao?

Database có thể lưu một cây, còn file có thể lưu một chuỗi tuyến tính. Chọn nơi lưu không tự quyết định cấu trúc.

### Câu hỏi A: session được lưu ở đâu?

Mặc định, Coding Agent ghi JSONL cục bộ. Session nằm dưới `~/.pi/agent/sessions/`; working directory được mã hóa thành một thư mục như `--work-project--`, và mỗi session có đúng một file `.jsonl`. File không nằm trong `.pi/sessions/` của project. Việc nhóm theo project diễn ra bên dưới thư mục Agent của user.

Lựa chọn này hợp với một CLI chạy cục bộ. Nó không cần dịch vụ database, record có thể đọc bằng công cụ text thông thường, và khi chuyển project, Pi tự chọn thư mục đã mã hóa tương ứng. JSONL không cung cấp transaction kiểu database, truy vấn xuyên máy hay điều phối nhiều writer. Nếu sản phẩm cần các đặc tính đó, chúng phải được thiết kế riêng.

Các command có sẵn che phần ghép path khỏi caller:

```bash
pi -c                  # Tiếp tục session gần nhất
pi -r                  # Duyệt các session
pi --no-session        # Chỉ giữ run trong bộ nhớ
pi --name "auth audit" # Đặt tên session mới
pi --session <path|id> # Mở một session
pi --fork <path|id>    # Chép lịch sử sang session mới
```

`/session` hiển thị file, ID, số message, tổng token và chi phí hiện tại. `/resume`, `/new`, `/name`, `/tree`, `/fork` và `/clone` hoạt động ở tầng sản phẩm cao hơn.

Pi còn có session harness bất đồng bộ tổng quát trong `@earendil-works/pi-agent-core`. Interface `SessionStorage` có implementation JSONL, implementation in-memory và cho phép ứng dụng tự viết backend khác. `SessionManager` đồng bộ của Coding Agent là một implementation độc lập; nó không nhận adapter `SessionStorage`. Phần 7 sẽ phân định rõ hai tầng này.

### Câu hỏi B: session có cấu trúc gì?

Transcript tuyến tính đủ dùng cho đến khi user muốn thử lại từ một điểm cũ, so sánh hai hướng hoặc quay về branch đã bỏ. Nếu chỉ viết lại một mảng, ứng dụng phải bỏ suffix cũ hoặc sao chép suffix đó sang nơi khác.

Coding Agent giữ một cây nối bằng parent. Append thêm record; rewind di chuyển leaf hiện tại; lần append tiếp theo tạo child mới bên dưới entry được chọn. Các child cũ vẫn ở trong bộ nhớ và file JSONL. Chỉ khi user chủ động fork hoặc clone thì Pi mới tạo file khác.

| Chiều thiết kế | Lựa chọn phổ biến              | Mặc định của Coding Agent             |
| -------------- | ------------------------------ | ------------------------------------- |
| Nơi lưu trữ    | Database quan hệ hoặc document | Một file JSONL cục bộ cho mỗi session |
| Cấu trúc logic | Transcript tuyến tính          | Cây append-only nối bằng parent       |

Hai lựa chọn này dẫn đến toàn bộ phần còn lại của chương. JSONL tạo thứ tự vật lý; `id`, `parentId` và `leafId` tạo cây logic.

## 2. Xây Session Tree theo từng bước

Xét một lỗi xác thực. Developer đổi model, hỏi vì sao bước kiểm tra salt thất bại, để Agent xem hai hàm, bác chẩn đoán đầu tiên rồi thử một hướng khác.

Đây là dàn ý tình huống, không phải JSONL nguyên văn:

```text
1. Chuyển sang anthropic/claude-sonnet-4-6.
2. Hỏi vì sao salt verification thất bại trong src/auth.ts.
3. Assistant gọi read.
4. read trả về nội dung file.
5. Assistant cho rằng phép so sánh ở dòng 23 có lỗi.
6. Chuyển leaf về câu hỏi.
7. Yêu cầu xem implementation của hàm hash trước.
8. Assistant gọi grep và read, rồi đưa ra chẩn đoán mới.
```

Các sơ đồ dùng alias ngắn `e1`, `e2`, v.v. Entry ID thực mà Coding Agent lưu là tiền tố UUID tám ký tự đã kiểm tra collision, không phải các alias minh họa này.

### Bước 1: đổi model và tạo root entry

Dòng vật lý đầu tiên là `SessionHeader`, tức metadata chứ không phải node trong cây. Khi đổi model, Pi append `ModelChangeEntry` đầu tiên. Payload thực có cả `provider` và `modelId`:

```text
e1: ModelChangeEntry
  parentId: null
  provider: "anthropic"
  modelId: "claude-sonnet-4-6"
```

Leaf trong bộ nhớ tiến đến `e1`:

```text
e1 model_change  <- leafId
```

`parentId: null` đánh dấu một root entry. Header không có entry `id` nên không thể làm parent.

### Bước 2: append user message

Câu hỏi trở thành `SessionMessageEntry`; trường `message` của nó là một `UserMessage` thuộc Pi AI. Sketch này lược bỏ timestamp ISO của entry và timestamp Unix mili giây của message. Ví dụ lưu trữ ở Phần 6 sẽ có cả hai.

```text
e2: SessionMessageEntry
  parentId: e1
  message:
    role: "user"
    content: "Vì sao salt verification thất bại trong src/auth.ts?"
```

Parent link kéo dài active path:

```text
e1 model_change
└─ e2 user  <- leafId
```

`e2` trỏ đến entry đứng trước nó trên branch này, không chỉ trỏ đến dòng vật lý đứng trước. Khi cây còn tuyến tính, hai thứ tự tình cờ trùng nhau.

### Bước 3: lưu Tool call của assistant

Assistant quyết định xem `src/auth.ts`. Text và lệnh gọi `read` cùng nằm trong một mảng `AssistantMessage.content`:

```text
e3: SessionMessageEntry
  parentId: e2
  message:
    role: "assistant"
    content:
      - { type: "text", text: "Tôi sẽ xem hàm verification." }
      - { type: "toolCall", id: "call_001", name: "read",
          arguments: { path: "src/auth.ts" } }
    stopReason: "toolUse"
```

Cây vẫn chỉ có một branch:

```text
e1 model_change
└─ e2 user
   └─ e3 assistant + lệnh gọi read  <- leafId
```

Assistant message được lưu còn có `api`, `provider`, `model`, `usage` đầy đủ và timestamp dạng số. Các trường đó mô tả provider response đã hoàn tất; session entry bao ngoài có timestamp ISO riêng.

### Bước 4: nối Tool result với call tương ứng

Sau khi Tool chạy xong, Pi tạo một `ToolResultMessage` riêng trong `SessionMessageEntry` kế tiếp:

```text
e4: SessionMessageEntry
  parentId: e3
  message:
    role: "toolResult"
    toolCallId: "call_001"
    toolName: "read"
    content: [{ type: "text", text: "export function verifySalt(...) { ... }" }]
    isError: false
```

Result nối tiếp cùng parent chain:

```text
e1 model_change
└─ e2 user
   └─ e3 assistant + lệnh gọi read
      └─ e4 kết quả read  <- leafId
```

`toolCallId` khớp với `ToolCall.id` trong `e3`; `toolName` cho biết Tool nào đã chạy. Parent link sắp thứ tự session entry, còn Tool-call ID ghi lại quan hệ protocol giữa hai message.

### Bước 5: append chẩn đoán đầu tiên

Assistant đọc Tool result rồi trả lời:

```text
e5: SessionMessageEntry
  parentId: e4
  message:
    role: "assistant"
    content: [{ type: "text", text: "Phép so sánh ở dòng 23 dùng sai encoding." }]
    stopReason: "stop"
```

Lần thử đầu tiên trở thành một path gồm năm entry:

```text
e1 model_change
└─ e2 user: salt verification
   └─ e3 assistant: read
      └─ e4 toolResult: auth.ts
         └─ e5 assistant: chẩn đoán dòng 23  <- leafId
```

Mỗi lần append tạo một entry mới rồi đẩy `leafId` tới entry đó. Không entry cũ nào được thêm danh sách child hay bị sửa nội dung.

### Bước 6: rewind bằng cách di chuyển leaf

Developer muốn thử cách khác. Navigation bằng API có thể đặt leaf tại `e2`. Đây là pseudocode bám theo source; method public `branch()` kiểm tra entry tồn tại rồi gán pointer theo cách đồng bộ:

```text
if (!byId.has("e2")) throw new Error("Entry e2 not found");
leafId = "e2";
```

Suffix cũ vẫn còn nguyên:

```text
e1 model_change
└─ e2 user: salt verification  <- leafId
   └─ e3 assistant: read
      └─ e4 toolResult: auth.ts
         └─ e5 assistant: chẩn đoán dòng 23
```

Chỉ di chuyển pointer là thao tác trong bộ nhớ. `leafId` không phải field trong header v3 của Coding Agent, còn `branch()` không append navigation record. Lần append sau đó mới ghi branch bền vững thông qua `parentId`. Nếu process thoát ngay sau `branch()`, khi mở lại, Pi lấy entry vật lý cuối cùng làm leaf.

### Bước 7: append bên dưới vị trí đã rewind

Developer đặt câu hỏi hẹp hơn. Vì leaf hiện tại là `e2`, user entry mới trỏ đến `e2`, giống `e3`:

```text
e6: SessionMessageEntry
  parentId: e2
  message:
    role: "user"
    content: "Hãy xem implementation của hàm hash trước verifier."
```

Hai child có cùng parent tạo thành hai branch:

```text
e1 model_change
└─ e2 user: salt verification
   ├─ e3 assistant: hướng đầu tiên
   │  └─ e4 toolResult
   │     └─ e5 assistant: chẩn đoán đầu tiên
   └─ e6 user: xem hash trước  <- leafId
```

Ví dụ bằng API này chủ động append user message thứ hai sau `e2`. `/tree` trong interactive mode xử lý khác khi entry được chọn là user message hoặc custom message: nó chuyển tới parent của entry, chép text đã chọn vào editor và để lần submit đã sửa trở thành sibling của entry được chọn.

### Bước 8: tiếp tục branch mới

Assistant yêu cầu cả search lẫn đọc file. Mỗi `ToolResultMessage` trả về trở thành một session entry riêng trước câu trả lời cuối:

```text
e1 model_change
└─ e2 user: salt verification
   ├─ e3 assistant: hướng đầu tiên
   │  └─ e4 kết quả read
   │     └─ e5 assistant: chẩn đoán đầu tiên
   └─ e6 user: xem hash trước
      └─ e7 assistant: lệnh gọi grep + read
         └─ e8 kết quả grep
            └─ e9 kết quả read
               └─ e10 assistant: chẩn đoán mới  <- leafId
```

File giờ có mười tree entry theo thứ tự append. Active path là `e1 -> e2 -> e6 -> e7 -> e8 -> e9 -> e10`. Các entry `e3` đến `e5` vẫn có thể truy cập bằng `getEntry()`, vẫn xuất hiện trong `getTree()` và vẫn có thể được chọn lại, nhưng không đi vào model context kế tiếp.

## 3. Đọc một session entry

Cây trở nên cụ thể khi ta xem một record đã lưu.

### Một SessionMessageEntry đầy đủ

Đây là object JSON hợp lệ cho Tool call của assistant. Nó có mọi field bắt buộc trong `AssistantMessage` hiện tại của Pi AI; token và chi phí thực tế đến từ provider.

```json
{
  "type": "message",
  "id": "c3d4e5f6",
  "parentId": "b2c3d4e5",
  "timestamp": "2026-08-24T10:23:30.000Z",
  "message": {
    "role": "assistant",
    "content": [
      { "type": "text", "text": "Tôi sẽ xem hàm verification." },
      {
        "type": "toolCall",
        "id": "call_001",
        "name": "read",
        "arguments": { "path": "src/auth.ts" }
      }
    ],
    "api": "anthropic-messages",
    "provider": "anthropic",
    "model": "claude-sonnet-4-6",
    "usage": {
      "input": 1250,
      "output": 80,
      "cacheRead": 0,
      "cacheWrite": 0,
      "totalTokens": 1330,
      "cost": {
        "input": 0,
        "output": 0,
        "cacheRead": 0,
        "cacheWrite": 0,
        "total": 0
      }
    },
    "stopReason": "toolUse",
    "timestamp": 1787567010000
  }
}
```

| Field                   | Ý nghĩa khi chạy                       | Lý do lưu                                                              |
| ----------------------- | -------------------------------------- | ---------------------------------------------------------------------- |
| `type`                  | Phân biệt thành viên trong entry union | Cây có message, thay đổi state, summary và metadata                    |
| `id`                    | Định danh entry này                    | Child và label tham chiếu entry bằng ID                                |
| `parentId`              | Trỏ đến entry đứng trước trên branch   | Một pointer đủ để dựng path từ root đến leaf                           |
| `timestamp` của entry   | Thời điểm tạo dạng ISO                 | Dùng khi sắp xếp session, hiển thị cây và debug                        |
| `message`               | Payload `AgentMessage` đầy đủ          | Khi resume, Pi giữ provider response, usage và field của Tool protocol |
| `timestamp` của message | Unix mili giây                         | Message thuộc Pi AI giữ cách biểu diễn thời gian riêng                 |

Khi `SessionManager` load file v3, schema không validate đầy đủ từng dòng đã parse. Hãy xem định nghĩa TypeScript là format contract; việc một object JSON parse được chưa đủ chứng minh nó an toàn.

### Chín entry type của Coding Agent

`SessionEntry` là union gồm chín type. Chia theo tác động lên context giúp ta thấy lý do chúng tồn tại riêng.

Bốn entry type có thể chiếu một hoặc nhiều message vào active context:

| Entry type                              | Kết quả chiếu                                                                                                                                     |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SessionMessageEntry` (`message`)       | Trả về `AgentMessage` đã lưu; `appendMessage()` nhận user, assistant, Tool-result, custom và Bash-execution message, còn summary dùng entry riêng |
| `CustomMessageEntry` (`custom_message`) | Tạo `CustomMessage` với `customType`, `content`, `display`, `details` và timestamp của entry                                                      |
| `CompactionEntry` (`compaction`)        | Tạo `CompactionSummaryMessage`; `buildContextEntries()` còn áp dụng ranh giới giữ lại                                                             |
| `BranchSummaryEntry` (`branch_summary`) | Tạo `BranchSummaryMessage` gắn với `fromId`                                                                                                       |

Hai entry type thay đổi state trả về bên cạnh messages:

| Entry type                                           | Tác động lên state                           |
| ---------------------------------------------------- | -------------------------------------------- |
| `ModelChangeEntry` (`model_change`)                  | Đặt `{ provider, modelId }` cho path đã chọn |
| `ThinkingLevelChangeEntry` (`thinking_level_change`) | Đặt chuỗi `thinkingLevel` hiện tại           |

Ba entry type lưu metadata nhưng không đi vào model context:

| Entry type                          | Mục đích                                                                      |
| ----------------------------------- | ----------------------------------------------------------------------------- |
| `CustomEntry` (`custom`)            | Lưu `data` của extension dưới một `customType`                                |
| `LabelEntry` (`label`)              | Đặt hoặc xóa label trên `targetId`; thay đổi được append sau cùng có hiệu lực |
| `SessionInfoEntry` (`session_info`) | Đặt hoặc xóa `name` hiển thị; entry được append sau cùng có hiệu lực          |

`SessionHeader` ở đầu file là shape thứ mười, nhưng nó không phải `SessionEntry` và không có parent. Generic harness mới hơn của Pi Agent Core định nghĩa union khác gồm bảy entry type, cùng lane và operation record. Trộn hai schema sẽ tạo parser sai.

### Vì sao entry chỉ lưu parent

Parent pointer cho phép append mà không chạm vào entry cũ. Nếu `e2` lưu `children: [e3]`, khi thêm `e6`, hệ thống phải viết lại nó thành `children: [e3, e6]`. Với `parentId`, chỉ entry mới ghi quan hệ đó.

Coding Agent giữ `byId: Map<string, SessionEntry>` để lookup parent trực tiếp và duyệt từ leaf về root. `getChildren(parentId)` tìm child bằng cách quét các value trong map; không có child index thứ hai được lưu. `getTree()` cũng quét, coi entry mất parent là root, gắn label đã resolve và sắp xếp mỗi mảng child theo timestamp ISO.

Cách biểu diễn này giúp append trong bộ nhớ và `branch()` có chi phí trung bình O(1). Dựng toàn bộ child view cần một lượt quét, còn I/O có chi phí riêng. Parent pointer tránh phải viết lại entry cũ; nó không biến mọi tree query thành O(1).

## 4. Append, rewind, branch và tóm tắt

Từ walkthrough trên, ta có thể thu lại thành bốn thao tác mà vẫn giữ đúng hành vi sản phẩm.

### Thao tác 1: append một child

Pseudocode bám theo source dưới đây mô tả `_appendEntry()` cùng các caller. Đây là pseudocode vì implementation chia bước tạo entry cho nhiều method `appendXXX()` có type cụ thể.

```text
id = generateCollisionCheckedId(byId)
entry = { type, id, parentId: leafId, timestamp: nowIso(), ...payload }
fileEntries.push(entry)
byId.set(id, entry)
leafId = id
persistAccordingToLazyWritePolicy(entry)
return id
```

Với message thông thường, caller dùng API public thay vì tự tạo entry:

```text
entryId = session.appendMessage(agentMessage)
```

Các thay đổi trong bộ nhớ gồm append, `Map.set` và gán pointer. `SessionManager` ghi file đồng bộ, nên thời gian thực tế còn gồm tạo file, ghi toàn bộ file lần đầu hoặc `appendFileSync`, tùy state.

### Thao tác 2: rewind pointer hiện tại

`branch(entryId)` kiểm tra entry tồn tại rồi gán `leafId`. `resetLeaf()` đặt leaf thành `null`, nhờ đó lần append kế tiếp có thể tạo root khác.

```text
branch("e2")
// leafId giờ là "e2"; e3, e4 và e5 không thay đổi.
```

Call này không tính hay lưu một branch object. Path được suy ra sau bằng cách đi theo parent. Lần append kế tiếp mới cung cấp bằng chứng bền vững cho hướng mới.

### Thao tác 3: append sau khi rewind

Sau khi leaf chuyển vị trí, append thông thường tạo branch. Không có branch type riêng:

```text
branch("e2")
e6 = appendMessage(revisedQuestion) // e6.parentId === "e2"
```

Các thao tác interactive phân biệt việc giữ branch trong cùng file với việc chép một path sang file khác:

| Thao tác  | Kết quả về file   | Hành vi chọn                                                                                                       |
| --------- | ----------------- | ------------------------------------------------------------------------------------------------------------------ |
| `/tree`   | Cùng file session | Di chuyển trong toàn cây; khi chọn user/custom message, Pi chép text vào editor và navigation đến parent của entry |
| `/fork`   | File session mới  | Chọn user message cũ, trích path đứng trước nó rồi đưa text đã chọn vào editor                                     |
| `/clone`  | File session mới  | Chép active branch hiện tại                                                                                        |
| `/resume` | Mở file đã có     | Dùng session picker của project                                                                                    |
| `/new`    | Cấp session mới   | Bắt đầu với header mới và leaf null                                                                                |

`createBranchedSession(leafId)` trích một path từ root đến leaf. Nó bỏ các node `LabelEntry` khỏi path được chép, nối lại các entry còn giữ, rồi append label record cho những target còn tồn tại. Header mới ghi file cũ vào `parentSession`. Chính manager chuyển sang session mới; method này không phải một exporter thuần túy.

### Gắn branch summary tùy chọn

Khi `/tree` rời một path để sang path khác, `AgentSession.navigateTree()` có thể tóm tắt suffix bị bỏ. Nó tìm common ancestor sâu nhất giữa path cũ và path đích, thu các entry từ child của ancestor đó đến old leaf, rồi sinh summary trước khi chuyển leaf.

Đây là pseudocode vòng đời, không phải signature của một async method duy nhất:

```text
abandoned = collectEntriesForBranchSummary(oldLeafId, targetId)
summary = await generateBranchSummary(abandoned, model, instructions, signal)
summaryId = session.branchWithSummary(newLeafId, summary.text, summary.details,
                                      summary.fromExtension, summary.usage)
```

Bản thân `branchWithSummary()` chạy đồng bộ. Nó ghi old leaf vào `fromId`, chuyển tới target, append `BranchSummaryEntry` làm child của target rồi đặt summary entry làm leaf mới:

```text
e2 user: salt verification
├─ e3 ... e5 hướng đã bỏ
└─ bs1 branch_summary(fromId: "e5")  <- leafId
   └─ entry được append tiếp theo
```

Summarizer mặc định làm việc trong token budget, giữ các message hợp lệ gần nhất, mang theo chi tiết thao tác file và biến compaction hoặc branch summary cũ thành summary context. Nó bỏ raw `toolResult` khỏi prompt tóm tắt branch vì Tool call của assistant đã chỉ ra thao tác. Extension có thể hủy navigation, thay summary, chỉnh instruction hoặc cung cấp details.

Nếu không có summary, navigation gọi `branch()` hoặc `resetLeaf()`. Nếu có summary, các entry bị bỏ vẫn nằm trong file, còn bản tóm tắt ngắn đi vào branch đích dưới dạng `BranchSummaryMessage` riêng. Không branch nào bị merge hay xóa.

## 5. Dựng lại active context

Storage có dạng cây, còn `Agent` và provider adapter nhận `AgentMessage[]` tuyến tính. Coding Agent thực hiện bước projection rõ ràng, thay vì xem thứ tự dòng JSONL là model context.

### Vì sao projection là một bước riêng

Thứ tự vật lý trả lời “record này được append lúc nào?”. Thứ tự parent trả lời “history nào thuộc vị trí này?”. Sau khi phân nhánh, hai thứ tự khác nhau. Gửi mọi dòng vật lý sẽ trộn các hướng cạnh tranh, label record và state của branch mà user đã rời.

`getBranch()` cung cấp path đầy đủ từ root đến leaf. `buildContextEntries()` áp dụng compaction mới nhất trên path đó. Sau đó, `buildSessionContext()` đổi các entry đã chọn thành message và resolve model cùng thinking state từ path đầy đủ.

### Bước 1: đi từ leaf về root

Pseudocode bám theo source này phản ánh helper nội bộ `buildSessionPath()`:

```text
if (leafId === null) return []
leaf = leafId ? byId.get(leafId) : entries.at(-1)
path = []
while (leaf exists):
  path.push(leaf)
  leaf = leaf.parentId ? byId.get(leaf.parentId) : undefined
return path.reverse()
```

Với hướng thứ hai đã hoàn tất, path được chọn là:

```text
[e1, e2, e6, e7, e8, e9, e10]
```

Suffix `e3 -> e5` không xuất hiện. Nếu parent bị gãy, traversal dừng sớm vì lookup trả về `undefined`; `SessionManager` không tự dựng phần history đã mất.

### Bước 2: chiếu từng entry type đã chọn

Sau bước chọn theo compaction, `sessionEntryToContextMessages()` dispatch như sau:

```text
message          -> AgentMessage đã lưu
custom_message   -> CustomMessage
branch_summary   -> BranchSummaryMessage
compaction       -> CompactionSummaryMessage
model_change     -> không sinh message
thinking change  -> không sinh message
custom           -> không sinh message
label            -> không sinh message
session_info     -> không sinh message
```

Active message sequence của ví dụ có dạng:

```text
[
  UserMessage(e2),
  UserMessage(e6),
  AssistantMessage(e7: lệnh gọi grep + read),
  ToolResultMessage(e8: grep),
  ToolResultMessage(e9: read),
  AssistantMessage(e10: chẩn đoán mới)
]
```

Hai user message đứng liền nhau vì ví dụ gọi `branch("e2")` rồi append bên dưới. Bước chuẩn hóa cho từng provider diễn ra sau tại `convertToLlm`; session projection giữ nguyên Agent-message history thay vì đoán wire rule của provider.

### Resolve model và thinking state

Bước lấy state đi qua toàn bộ path đã chọn từ root đến leaf. `thinkingLevel` bắt đầu bằng `"off"`; mỗi `thinking_level_change` ghi đè giá trị. `model` bắt đầu bằng `null`; mỗi `model_change` ghi đè nó, và một assistant message cũng cập nhật model từ provider cùng model đã tạo response đó.

```text
e1 model_change anthropic/claude-sonnet-4-6 -> model = cặp đó
e7 assistant từ cùng cặp                         -> model = cặp đó
path không có thinking_level_change              -> thinkingLevel = "off"
```

Entry hợp lệ cuối cùng trên path có hiệu lực. Khi di chuyển leaf về trước một state-change entry, thay đổi đó rời khỏi path. Lưu state transition thành entry vì thế giúp rewind phục hồi state lịch sử mà không sửa một biến global của session.

### Áp dụng CompactionEntry mới nhất

`buildContextEntries()` tìm `CompactionEntry` cuối cùng trên active path. Coding Agent v3 hiện tại lưu `firstKeptEntryId`; nó không lưu field `retainedTail` của generic harness.

```text
e1 user: yêu cầu cũ
e2 assistant: phần việc cũ
e3 user: yêu cầu gần đây          <- firstKeptEntryId
e4 assistant: phần việc gần đây
e5 compaction(summary, firstKeptEntryId: "e3")
e6 user: công việc sau compaction
```

Projection đặt compaction entry trước, rồi các entry từ `firstKeptEntryId` đến trước compaction, rồi những entry sau compaction:

```text
[
  CompactionSummaryMessage(từ e5),
  UserMessage(e3),
  AssistantMessage(e4),
  UserMessage(e6)
]
```

Raw entry `e1` và `e2` vẫn còn trong JSONL. Nếu chuyển đến leaf trước `e5`, path không chứa compaction đó nên các message cũ có thể xuất hiện lại. Nếu không tìm thấy `firstKeptEntryId` trên path đã chọn, implementation hiện tại trả summary cùng các entry sau compaction, không tự tạo một prefix giữ lại.

## 6. Lưu cây bằng JSONL

Định dạng file đơn giản, nhưng hai miền timestamp và chính sách tạo file muộn cần được xử lý chính xác.

### Lưu một record trên mỗi dòng

Dòng đầu là header v3. Mỗi dòng sau là một `SessionEntry`. Sample này là JSONL hợp lệ; từng dòng vật lý parse độc lập:

```jsonl
{"type":"session","version":3,"id":"01992742-9d1a-7aa0-b123-112233445566","timestamp":"2026-08-24T10:00:00.000Z","cwd":"/work/auth"}
{"type":"model_change","id":"a1b2c3d4","parentId":null,"timestamp":"2026-08-24T10:00:05.000Z","provider":"anthropic","modelId":"claude-sonnet-4-6"}
{"type":"message","id":"b2c3d4e5","parentId":"a1b2c3d4","timestamp":"2026-08-24T10:23:00.000Z","message":{"role":"user","content":"Vì sao salt verification thất bại trong src/auth.ts?","timestamp":1787566980000}}
{"type":"message","id":"c3d4e5f6","parentId":"b2c3d4e5","timestamp":"2026-08-24T10:23:30.000Z","message":{"role":"assistant","content":[{"type":"toolCall","id":"call_001","name":"read","arguments":{"path":"src/auth.ts"}}],"api":"anthropic-messages","provider":"anthropic","model":"claude-sonnet-4-6","usage":{"input":1250,"output":80,"cacheRead":0,"cacheWrite":0,"totalTokens":1330,"cost":{"input":0,"output":0,"cacheRead":0,"cacheWrite":0,"total":0}},"stopReason":"toolUse","timestamp":1787567010000}}
{"type":"message","id":"d4e5f6a7","parentId":"c3d4e5f6","timestamp":"2026-08-24T10:23:31.000Z","message":{"role":"toolResult","toolCallId":"call_001","toolName":"read","content":[{"type":"text","text":"export function verifySalt(...) { ... }"}],"isError":false,"timestamp":1787567011000}}
{"type":"message","id":"e5f6a7b8","parentId":"d4e5f6a7","timestamp":"2026-08-24T10:24:00.000Z","message":{"role":"assistant","content":[{"type":"text","text":"Phép so sánh dùng sai encoding."}],"api":"anthropic-messages","provider":"anthropic","model":"claude-sonnet-4-6","usage":{"input":1400,"output":40,"cacheRead":0,"cacheWrite":0,"totalTokens":1440,"cost":{"input":0,"output":0,"cacheRead":0,"cacheWrite":0,"total":0}},"stopReason":"stop","timestamp":1787567040000}}
{"type":"message","id":"f6a7b8c9","parentId":"b2c3d4e5","timestamp":"2026-08-24T10:30:00.000Z","message":{"role":"user","content":"Hãy xem implementation của hàm hash trước.","timestamp":1787567400000}}
```

Mặc định, thư mục là `~/.pi/agent/sessions/--<encoded-cwd>--/`. `newSession()` đặt tên file theo mẫu `<ISO-with-colons-and-dots-replaced>_<sessionId>.jsonl`. Session ID mặc định là UUIDv7. Caller có thể cấp ID chứa chữ số, chữ cái, `.`, `_` và `-`, với ký tự đầu và cuối là chữ hoặc số.

Entry ID lấy tám ký tự đầu của random UUID, thử tối đa 100 lần để tránh collision trong `byId`, rồi fallback sang UUID đầy đủ. Timestamp của entry là chuỗi ISO. Timestamp lồng trong Pi AI message là số Unix mili giây. `parentSession` xuất hiện trong header được tạo từ session khác qua fork, clone hoặc `newSession({ parentSession })`.

JSONL giúp thao tác ghi phổ biến chỉ append một dòng thay vì serialize lại một mảng JSON ngày càng lớn. Nó cũng để lộ branch: hai record có cùng `parentId` là sibling dù giữa chúng có nhiều dòng vật lý.

### Trì hoãn tạo file đến khi có assistant

Manager persisted mới cấp một path và buffer entry trong `fileEntries`, nhưng thông thường chưa tạo file cho đến khi assistant message đầu tiên được append. Chính sách trong `_persist()` là:

| Đã có assistant trong `fileEntries` | `flushed` | Hành vi ghi                                                                     |
| ----------------------------------- | --------- | ------------------------------------------------------------------------------- |
| Chưa                                | `false`   | Giữ entry trong bộ nhớ; chưa tạo file                                           |
| Chưa                                | `true`    | Append entry hiện tại, trường hợp biên sau khi mở file đã flush                 |
| Có                                  | `false`   | Mở path mới bằng `"wx"`, ghi header và mọi entry đang buffer, rồi đặt `flushed` |
| Có                                  | `true`    | Chỉ append entry hiện tại bằng `appendFileSync`                                 |

Việc trì hoãn giúp một request mới thất bại không để lại file session chỉ có câu hỏi của user. Nó không bảo đảm mọi turn đã lưu về sau luôn hoàn chỉnh. Sau lần flush đầu, user message được append ngay, nên crash hoặc lỗi provider vẫn có thể để lại câu hỏi chưa có assistant response.

`isPersisted()` cho biết manager có được cấu hình để lưu bền vững hay không. Nó không kiểm tra cơ chế lazy đã tạo file chưa. Vì vậy, một persisted manager có thể trả về path dự kiến từ `getSessionFile()` dù path đó chưa tồn tại.

### Xử lý rõ rewrite, partial tail và backup

Phần lớn thao tác là append, nhưng `SessionManager` của Coding Agent cũng rewrite trong các trường hợp sau:

- Khi load session v1 hoặc v2, Pi migrate lên v3 và gọi `_rewriteFile()` trên cùng path.
- Khi mở một file rỗng được chỉ định trực tiếp, Pi khởi tạo rồi rewrite file đó.
- `createBranchedSession()` tạo file mới từ một path và các label đã resolve.
- `forkFrom()` tạo header mới bằng `"wx"` rồi append mọi entry không phải header từ source.

`_rewriteFile()` mở target bằng `"w"`, truncate rồi ghi từng dòng trong vòng lặp. Nó không stage file sibling, không rename nguyên tử và không tạo backup. Hãy sao chép session có giá trị trước khi migrate hoặc transform hàng loạt. “Append-only tree” mô tả mô hình entry logic, không cam kết file vật lý không bao giờ bị rewrite.

Loader v3 đọc UTF-8 theo chunk, parse từng dòng đầy đủ và âm thầm bỏ dòng lỗi. Nó cũng thử parse fragment cuối không có newline rồi bỏ qua nếu parse thất bại. Loader kiểm tra entry parse được đầu tiên là session header có ID dạng chuỗi, nhưng không báo mọi dòng lỗi hay sửa torn tail. Parser dùng cho audit hoặc migration nên chặt hơn hành vi khôi phục khi chạy này.

Manager của Coding Agent gọi API file đồng bộ và không có file lock, `fsync`, compare-and-swap hay queue writer xuyên process. Mỗi file session chỉ nên có một writer. `list()` và `listAll()` chỉ đọc; chúng load metadata tối đa mười file đồng thời, bỏ file không đọc được rồi sắp xếp theo thời điểm hoạt động suy ra.

`JsonlSessionStorage` tổng quát của Pi Agent Core có cơ chế an toàn khác: nó tuần tự hóa write bằng promise tail trên từng instance và dùng file tạm cùng rename khi fork hoặc sửa torn tail. Các bảo đảm v4 đó không áp dụng cho `SessionManager` v3 của Coding Agent.

## 7. Tách hai tầng persistence và dùng SessionManager

Pi 0.84.2 có hai hệ thống session cùng chia sẻ một số ý tưởng nhưng không tương thích về contract:

| Thuộc tính                  | Pi Agent Core harness                                                | `SessionManager` của Coding Agent                                |
| --------------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Abstraction công khai       | `SessionStorage` và `Session` bất đồng bộ                            | Class đồng bộ cụ thể                                             |
| Entry hiện tại              | 7 type, gồm `active_tools_change`; có lane và operation record riêng | 9 `SessionEntry` type, gồm custom message, label và session info |
| JSONL schema                | Header v4, mutation, timestamp số và sequence number                 | Header v3 `type: "session"`, timestamp entry dạng ISO            |
| Bản triển khai file         | `JsonlSessionStorage`, có queue trên từng instance                   | Gọi `fs` trực tiếp trong `SessionManager`                        |
| Bản triển khai trong bộ nhớ | `InMemorySessionStorage`                                             | `SessionManager.inMemory()`                                      |
| Backend tùy chỉnh           | Implement `SessionStorage`                                           | Không hỗ trợ inject storage adapter                              |

Interface tổng quát quản lý metadata, lane, append entry và record, query, fact, label cùng thống kê. Một sản phẩm web hoặc server có thể implement các method bất đồng bộ đó trên database. Implementation ấy dùng với generic harness. Không thể truyền nó vào `SessionManager` của Coding Agent vì signature, entry union, header và thời điểm ghi đều khác.

`SessionManager` vẫn hữu ích bên ngoài CLI vì package có export class này cùng các type entry/context. Các static method chính gồm:

| Static method                                                   | Hành vi                                                                                   |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `create(cwd, sessionDir?, options?)`                            | Cấp session persisted mới cùng path file dự kiến                                          |
| `open(path, sessionDir?, cwdOverride?)`                         | Load một file, migrate version cũ, dựng index và dùng cwd trong header nếu không override |
| `continueRecent(cwd, sessionDir?)`                              | Mở session phù hợp gần nhất hoặc tạo session mới                                          |
| `inMemory(cwd?, options?)`                                      | Dùng cùng hành vi tree nhưng không có file                                                |
| `forkFrom(sourcePath, targetCwd, sessionDir?, options?)`        | Chép entry không phải header của source dưới header v3 mới có `parentSession`             |
| `list(cwd, sessionDir?, onProgress?)`                           | Trả metadata session của project theo thời điểm hoạt động mới nhất trước                  |
| `listAll(onProgress?)` hoặc `listAll(sessionDir?, onProgress?)` | Tìm qua mọi thư mục project đã mã hóa hoặc một thư mục được cấp                           |

Instance surface chia thành bốn nhóm:

| Nhóm                   | Method hiện tại                                                                                                                                                                                  |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Vòng đời và định danh  | `newSession()`, `setSessionFile()`, `createBranchedSession()`, `isPersisted()`, `usesDefaultSessionDir()`, `getCwd()`, `getSessionDir()`, `getSessionId()`, `getSessionFile()`                   |
| Append                 | `appendMessage()`, `appendThinkingLevelChange()`, `appendModelChange()`, `appendCompaction()`, `appendCustomEntry()`, `appendCustomMessageEntry()`, `appendLabelChange()`, `appendSessionInfo()` |
| Tree và label          | `getLeafId()`, `getLeafEntry()`, `getEntry()`, `getChildren()`, `getBranch()`, `getTree()`, `getLabel()`, `branch()`, `resetLeaf()`, `branchWithSummary()`                                       |
| Projection và kiểm tra | `buildContextEntries()`, `buildSessionContext()`, `getEntries()`, `getHeader()`, `getSessionName()`                                                                                              |

Mọi append method đều trả ID của entry mới. `appendCompaction()` và `branchWithSummary()` nhận `details`, `fromHook` và `usage` tùy chọn; việc sinh summary thuộc `AgentSession`, không thuộc manager. `getEntries()` trả một mảng mới chứa các object entry đã lưu, nên caller cần xem các object đó là read-only.

Ví dụ có thể sao chép này chỉ dùng method public đã export:

```typescript
import { SessionManager } from "@earendil-works/pi-coding-agent";

const session = SessionManager.create(process.cwd());
const firstQuestionId = session.appendMessage({
  role: "user",
  content: "Review the authentication flow.",
  timestamp: Date.now(),
});

session.appendThinkingLevelChange("high");
session.branch(firstQuestionId);
session.appendMessage({
  role: "user",
  content: "Start with the password hash implementation.",
  timestamp: Date.now(),
});

const { messages, model, thinkingLevel } = session.buildSessionContext();
const sessions = await SessionManager.list(process.cwd());

console.log({
  messages: messages.length,
  model,
  thinkingLevel,
  sessions: sessions.length,
});
```

Một số function đã export cho phép dùng trực tiếp cơ chế này mà không cần manager instance: `buildContextEntries()`, `buildSessionContext()`, `sessionEntryToContextMessages()`, `parseSessionEntries()`, `migrateSessionEntries()` và `getLatestCompactionEntry()`. Các helper của class như `_buildIndex()`, `_appendEntry()`, `_persist()` và `_rewriteFile()` triển khai storage policy, không nên được xem là application API ổn định.

Chi tiết khi tạo và mở session có ảnh hưởng trực tiếp đến caller. `create()` có thể trả một manager mà `getSessionFile()` mới chỉ là path dự kiến, còn `newSession()` có thể trả trực tiếp path đó, vì cơ chế ghi là lazy. `open()` lấy `sessionDir` từ thư mục cha của file nếu caller không cấp. `continueRecent()` lọc theo `cwd` trong header khi dùng thư mục tùy chỉnh dùng chung. `list()` và `listAll()` trả metadata `SessionInfo`, không trả manager đang mở; hãy gọi `open(info.path)` để resume.

## 8. Mang thiết kế sang hệ thống khác

Session Tree giải bài toán cụ thể của CLI cục bộ, nhưng các câu hỏi thiết kế của nó dùng được ở nhiều nơi.

### Tách nơi lưu trữ khỏi cấu trúc

| Quyết định | Câu hỏi                                       | Câu trả lời của Coding Agent                                   |
| ---------- | --------------------------------------------- | -------------------------------------------------------------- |
| Nơi lưu    | Durable data được ghi ở đâu và bằng cách nào? | Một file JSONL cục bộ cho mỗi session, nhóm theo cwd đã mã hóa |
| Cấu trúc   | Các history liên hệ ra sao?                   | Entry lịch sử không đổi, mỗi entry nối tới một parent          |
| Lựa chọn   | History nào đang hoạt động?                   | Một leaf trong bộ nhớ cùng root path của nó                    |
| Projection | Nội dung nào đến model?                       | Entry đã áp dụng compaction được đổi thành `AgentMessage[]`    |

Service có thể giữ cùng parent-linked shape trong SQL. Test nhỏ có thể giữ toàn bộ trong memory. Cây không phụ thuộc JSONL, và JSONL không bắt buộc dữ liệu phải là cây.

### Dùng append-only history cho rewind và so sánh

Parent link giữ các lần thử cũ mà không sao chép chúng trong cùng session. Đổi lại, hệ thống giữ nhiều dữ liệu hơn và một số view cần quét tuyến tính. Lợi ích là history kiểm tra được và pointer di chuyển rẻ.

Hãy định nghĩa durability riêng. Coding Agent chỉ lưu branch khi entry mới trỏ đến parent đã chọn. Hệ thống cần lưu chính thao tác navigation phải có lane hoặc leaf record rõ ràng, như lane mutation của generic harness, hoặc một pointer store có transaction.

### Lưu state change tại nơi nó có hiệu lực

Thay đổi model và thinking thuộc về history path vì ý nghĩa của chúng phụ thuộc vị trí. Rewind phải phục hồi setting đã áp dụng ở đó. Coding Agent còn dùng field provider/model trong assistant message khi dựng lại model state, nhờ vậy path được resume khôi phục model đã sinh assistant response gần nhất.

Có thể áp dụng cùng phép thử cho state khác: nếu chuyển tới node cũ phải khôi phục một giá trị, hãy ghi thay đổi thành path event. Với fact có nghĩa trên toàn session, chẳng hạn display name mới nhất, hãy tách nó khỏi reconstruction theo branch.

Handoff cho một implementation review cần cụ thể: chốt schema header và entry, quy tắc durability của current pointer, phân biệt chọn branch với trích branch, mô tả projection, quyết định summary đi vào context ra sao, rồi nêu rõ bảo đảm về rewrite, backup và concurrency. Chỉ một sơ đồ cây không trả lời được sáu contract đó.

## 9. Tiếp tục từ ranh giới session

Từ Chương 3 đến Chương 10, đường chạy đã nối liền: loop phát message, Tool thêm cặp call/result, context engineering giới hạn input, compaction append summary checkpoint, còn session projection chọn branch cho model call tiếp theo.

Extension system của Pi nằm ở cả hai phía ranh giới này. Extension có thể append state `custom`, inject context `custom_message`, cung cấp compaction hoặc branch summary, gắn label cho entry và quan sát navigation. Các source file nên đọc tiếp gồm:

- [`session-manager.ts`](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/coding-agent/src/core/session-manager.ts) cho schema v3, tree, projection, write và class public của Coding Agent;
- [`branch-summarization.ts`](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/coding-agent/src/core/compaction/branch-summarization.ts) cho bước tìm common ancestor và sinh summary;
- [`types.ts`](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/agent/src/harness/session/types.ts) cùng [`jsonl/storage.ts`](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/agent/src/harness/session/jsonl/storage.ts) cho generic harness riêng;
- [`sessions.md`](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/coding-agent/docs/sessions.md) cho hành vi CLI hiện tại.

Chương này bám theo Pi `0.84.2` tại commit `a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c`.
