---
title: "Chương 10: Quản lý session: lưu, tiếp tục và phân nhánh hội thoại"
description: Cách Pi lưu một session thành cây JSONL nối bằng parent, dựng lại context đang hoạt động và cung cấp SessionManager.
translation_key: ch10-session
language: vi
chapter: 10
source_url: "https://www.dgzhuya.com/modules/ch10-session"
official_refs:
  - "https://github.com/earendil-works/pi/blob/4e58f324fae8ebfa98a3d45181fb248072a2afac/packages/coding-agent/docs/sessions.md"
terms_used:
  - Session
  - Session Tree
  - SessionManager
  - SessionEntry
  - CompactionEntry
  - BranchSummaryEntry
status: reviewed
last_updated: "2026-08-25"
translator: Pify maintainers
reviewed_by: Pify maintainers
---

Chương 9 kết thúc với một `CompactionEntry` trên Session Tree. Mô tả ngắn đó còn để lại hai câu hỏi: cây nằm ở đâu, và `buildSessionContext()` biến cây trở lại danh sách message tuyến tính mà mỗi lần gọi model cần bằng cách nào?

Coding Agent của Pi giải quyết cả hai bằng một file session bền vững. Mỗi bản ghi sau header trỏ đến nút cha, một nút lá trong bộ nhớ đánh dấu vị trí hiện tại, còn bước dựng context chiếu ra đúng một đường từ gốc đến nút lá. Vì vậy, cùng một file có thể giữ nhiều hướng xử lý trong khi model chỉ thấy nhánh mà người dùng đã chọn.

## 1. Bắt đầu từ hai câu hỏi về lưu trữ

`context.messages` là một mảng tại ranh giới model. Mảng này không cho biết hội thoại tồn tại ở đâu sau khi tiến trình kết thúc, cũng không cho biết ứng dụng giữ lịch sử theo hình dạng nào. Thiết kế lưu bền vững nên trả lời riêng hai câu hỏi:

- **Nơi lưu trữ:** bản ghi được ghi ở đâu?
- **Cấu trúc logic:** các bản ghi liên hệ với nhau ra sao?

Cơ sở dữ liệu có thể lưu một cây, còn file có thể lưu một chuỗi tuyến tính. Chọn nơi lưu không tự quyết định cấu trúc.

### Câu hỏi A: session được lưu ở đâu?

Mặc định, Coding Agent ghi JSONL cục bộ. Session nằm dưới `~/.pi/agent/sessions/`; thư mục làm việc được mã hóa thành một thư mục như `--work-project--`, và mỗi session có đúng một file `.jsonl`. File không nằm trong `.pi/sessions/` của dự án. Việc nhóm theo dự án diễn ra bên dưới thư mục Agent của người dùng.

Lựa chọn này hợp với một CLI chạy cục bộ. Nó không cần dịch vụ cơ sở dữ liệu, bản ghi có thể đọc bằng công cụ văn bản thông thường, và khi chuyển dự án, Pi tự chọn thư mục đã mã hóa tương ứng. JSONL không cung cấp giao dịch kiểu cơ sở dữ liệu, truy vấn xuyên máy hay điều phối nhiều tiến trình ghi. Nếu sản phẩm cần các đặc tính đó, chúng phải được thiết kế riêng.

Các lệnh có sẵn xử lý việc ghép đường dẫn thay cho mã gọi:

```bash
pi -c                  # Tiếp tục session gần nhất
pi -r                  # Duyệt các session
pi --no-session        # Chỉ giữ run trong bộ nhớ
pi --name "auth audit" # Đặt tên session mới
pi --session <path|id> # Mở một session
pi --fork <path|id>    # Chép lịch sử sang session mới
```

`/session` hiển thị file, ID, số message, tổng token và chi phí hiện tại. `/resume`, `/new`, `/name`, `/tree`, `/fork` và `/clone` hoạt động ở tầng sản phẩm cao hơn.

Pi còn có bộ khung session bất đồng bộ tổng quát trong `@earendil-works/pi-agent-core`. Giao diện `SessionStorage` có bản triển khai JSONL, bản triển khai trong bộ nhớ và cho phép ứng dụng tự viết tầng lưu trữ khác. `SessionManager` đồng bộ của Coding Agent là một bản triển khai độc lập; nó không nhận bộ chuyển đổi `SessionStorage`. Phần 7 sẽ phân định rõ hai tầng này.

### Câu hỏi B: session có cấu trúc gì?

Bản ghi hội thoại tuyến tính đủ dùng cho đến khi người dùng muốn thử lại từ một điểm cũ, so sánh hai hướng hoặc quay về branch đã bỏ. Nếu chỉ viết lại một mảng, ứng dụng phải bỏ đoạn đuôi cũ hoặc sao chép đoạn đó sang nơi khác.

Coding Agent giữ một cây nối bằng parent. Append thêm bản ghi; rewind di chuyển leaf hiện tại; lần append tiếp theo tạo nút con mới bên dưới entry được chọn. Các nút con cũ vẫn ở trong bộ nhớ và file JSONL. Chỉ khi người dùng chủ động fork hoặc clone thì Pi mới tạo file khác.

| Chiều thiết kế | Lựa chọn phổ biến                                      | Mặc định của Coding Agent             |
| -------------- | ------------------------------------------------------ | ------------------------------------- |
| Nơi lưu trữ    | Cơ sở dữ liệu quan hệ hoặc cơ sở dữ liệu dạng tài liệu | Một file JSONL cục bộ cho mỗi session |
| Cấu trúc logic | Bản ghi hội thoại tuyến tính                           | Cây chỉ ghi thêm, nối bằng parent     |

Hai lựa chọn này dẫn đến toàn bộ phần còn lại của chương. JSONL tạo thứ tự vật lý; `id`, `parentId` và `leafId` tạo cây logic.

## 2. Xây Session Tree theo từng bước

Xét một lỗi xác thực. Nhà phát triển đổi model, hỏi vì sao bước kiểm tra salt thất bại, để Agent xem hai hàm, bác chẩn đoán đầu tiên rồi thử một hướng khác.

Đây là dàn ý tình huống, không phải JSONL nguyên văn:

```text
1. Chuyển sang anthropic/claude-sonnet-4-6.
2. Hỏi vì sao salt verification thất bại trong src/auth.ts.
3. Assistant gọi read.
4. read trả về nội dung file.
5. Assistant cho rằng phép so sánh ở dòng 23 có lỗi.
6. Chuyển leaf về câu hỏi.
7. Yêu cầu xem bản triển khai của hàm hash trước.
8. Assistant gọi grep và read, rồi đưa ra chẩn đoán mới.
```

Các sơ đồ dùng bí danh ngắn `e1`, `e2`, v.v. Entry ID thực mà Coding Agent lưu là tiền tố UUID tám ký tự đã kiểm tra trùng, không phải các bí danh minh họa này.

### Bước 1: đổi model và tạo root entry

Dòng vật lý đầu tiên là `SessionHeader`, tức siêu dữ liệu chứ không phải nút trong cây. Khi đổi model, Pi append `ModelChangeEntry` đầu tiên. Dữ liệu thực có cả `provider` và `modelId`:

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

`parentId: null` đánh dấu một root entry. Header không có `id` của entry nên không thể làm parent.

### Bước 2: append user message

Câu hỏi trở thành `SessionMessageEntry`; trường `message` của nó là một `UserMessage` thuộc Pi AI. Bản phác thảo này lược bỏ timestamp ISO của entry và timestamp Unix mili giây của message. Ví dụ lưu trữ ở Phần 6 sẽ có cả hai.

```text
e2: SessionMessageEntry
  parentId: e1
  message:
    role: "user"
    content: "Vì sao salt verification thất bại trong src/auth.ts?"
```

Liên kết parent kéo dài đường dẫn đang hoạt động:

```text
e1 model_change
└─ e2 user  <- leafId
```

`e2` trỏ đến entry đứng trước nó trên branch này, chứ không nhất thiết là dòng vật lý đứng trước. Khi cây còn tuyến tính, hai thứ tự tình cờ trùng nhau.

### Bước 3: lưu lời gọi Tool của assistant

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

Message của assistant được lưu còn có đầy đủ `api`, `provider`, `model`, số liệu `usage` và timestamp dạng số. Các trường đó mô tả phản hồi hoàn chỉnh của provider; session entry bao ngoài có timestamp ISO riêng.

### Bước 4: nối kết quả Tool với lời gọi tương ứng

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

Kết quả nối tiếp cùng chuỗi parent:

```text
e1 model_change
└─ e2 user
   └─ e3 assistant + lệnh gọi read
      └─ e4 kết quả read  <- leafId
```

`toolCallId` khớp với `ToolCall.id` trong `e3`; `toolName` cho biết Tool nào đã chạy. Liên kết parent sắp thứ tự session entry, còn ID của lời gọi Tool ghi lại quan hệ giao thức giữa hai message.

### Bước 5: append chẩn đoán đầu tiên

Assistant đọc kết quả Tool rồi trả lời:

```text
e5: SessionMessageEntry
  parentId: e4
  message:
    role: "assistant"
    content: [{ type: "text", text: "Phép so sánh ở dòng 23 dùng sai cách mã hóa." }]
    stopReason: "stop"
```

Lần thử đầu tiên trở thành một đường dẫn gồm năm entry:

```text
e1 model_change
└─ e2 user: salt verification
   └─ e3 assistant: read
      └─ e4 toolResult: auth.ts
         └─ e5 assistant: chẩn đoán dòng 23  <- leafId
```

Mỗi lần append tạo một entry mới rồi đẩy `leafId` tới entry đó. Không entry cũ nào được thêm danh sách nút con hay bị sửa nội dung.

### Bước 6: rewind bằng cách di chuyển leaf

Người lập trình muốn thử cách khác. Thao tác điều hướng bằng API có thể đặt leaf tại `e2`. Đây là mã giả bám theo mã nguồn; phương thức công khai `branch()` kiểm tra entry tồn tại rồi gán con trỏ theo cách đồng bộ:

```text
if (!byId.has("e2")) throw new Error("Entry e2 not found");
leafId = "e2";
```

Đoạn đuôi cũ vẫn còn nguyên:

```text
e1 model_change
└─ e2 user: salt verification  <- leafId
   └─ e3 assistant: read
      └─ e4 toolResult: auth.ts
         └─ e5 assistant: chẩn đoán dòng 23
```

Việc di chuyển con trỏ chỉ diễn ra trong bộ nhớ. `leafId` không phải trường trong header v3 của Coding Agent, còn `branch()` không append bản ghi điều hướng. Lần append sau đó mới ghi branch bền vững thông qua `parentId`. Nếu tiến trình thoát ngay sau `branch()`, khi mở lại, Pi lấy entry vật lý cuối cùng làm leaf.

### Bước 7: append bên dưới vị trí đã rewind

Người lập trình đặt câu hỏi hẹp hơn. Vì leaf hiện tại là `e2`, user entry mới trỏ đến `e2`, giống `e3`:

```text
e6: SessionMessageEntry
  parentId: e2
  message:
    role: "user"
    content: "Hãy xem bản triển khai của hàm hash trước verifier."
```

Hai nút con có cùng parent tạo thành hai branch:

```text
e1 model_change
└─ e2 user: salt verification
   ├─ e3 assistant: hướng đầu tiên
   │  └─ e4 toolResult
   │     └─ e5 assistant: chẩn đoán đầu tiên
   └─ e6 user: xem hash trước  <- leafId
```

Ví dụ bằng API này chủ động append message thứ hai của người dùng sau `e2`. Trong chế độ tương tác, `/tree` xử lý khác khi entry được chọn là message của người dùng hoặc message tùy chỉnh: nó chuyển tới parent của entry, chép văn bản đã chọn vào trình soạn thảo và để lần gửi đã sửa trở thành nút cùng cha với entry được chọn.

### Bước 8: tiếp tục branch mới

Assistant yêu cầu cả tìm kiếm lẫn đọc file. Mỗi `ToolResultMessage` trả về trở thành một session entry riêng trước câu trả lời cuối:

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

File giờ có mười entry của cây theo thứ tự append. Đường dẫn đang hoạt động là `e1 -> e2 -> e6 -> e7 -> e8 -> e9 -> e10`. Các entry `e3` đến `e5` vẫn có thể truy cập bằng `getEntry()`, vẫn xuất hiện trong `getTree()` và vẫn có thể được chọn lại, nhưng không đi vào context của lần gọi model kế tiếp.

## 3. Đọc một session entry

Cây trở nên cụ thể khi ta xem một bản ghi đã lưu.

### Một SessionMessageEntry đầy đủ

Đây là đối tượng JSON hợp lệ cho lời gọi Tool của assistant. Nó có mọi trường bắt buộc trong `AssistantMessage` hiện tại của Pi AI; token và chi phí thực tế đến từ provider.

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

| Trường                  | Ý nghĩa khi chạy                          | Lý do lưu                                                                            |
| ----------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------ |
| `type`                  | Phân biệt thành viên trong kiểu hợp entry | Cây có message, thay đổi trạng thái, bản tóm tắt và siêu dữ liệu                     |
| `id`                    | Định danh entry này                       | Nút con và label tham chiếu entry bằng ID                                            |
| `parentId`              | Trỏ đến entry đứng trước trên branch      | Một con trỏ đủ để dựng đường dẫn từ root đến leaf                                    |
| `timestamp` của entry   | Thời điểm tạo dạng ISO                    | Dùng khi sắp xếp session, hiển thị cây và gỡ lỗi                                     |
| `message`               | Dữ liệu `AgentMessage` đầy đủ             | Khi tiếp tục, Pi giữ phản hồi của provider, số liệu sử dụng và trường giao thức Tool |
| `timestamp` của message | Unix mili giây                            | Message thuộc Pi AI giữ cách biểu diễn thời gian riêng                               |

Khi `SessionManager` đọc file v3, nó không kiểm tra đầy đủ schema của từng dòng đã phân tích cú pháp. Hãy xem định nghĩa TypeScript là quy ước định dạng; việc một đối tượng JSON phân tích cú pháp được chưa đủ chứng minh nó an toàn.

### Chín kiểu entry của Coding Agent

`SessionEntry` là kiểu hợp gồm chín kiểu. Chia theo tác động lên context giúp ta thấy lý do chúng tồn tại riêng.

Bốn kiểu entry có thể chiếu một hoặc nhiều message vào context đang hoạt động:

| Kiểu entry                              | Kết quả chiếu                                                                                                                                                          |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SessionMessageEntry` (`message`)       | Trả về `AgentMessage` đã lưu; `appendMessage()` nhận message của người dùng, assistant, kết quả Tool, message tùy chỉnh và lệnh Bash, còn bản tóm tắt dùng entry riêng |
| `CustomMessageEntry` (`custom_message`) | Tạo `CustomMessage` với `customType`, `content`, `display`, `details` và timestamp của entry                                                                           |
| `CompactionEntry` (`compaction`)        | Tạo `CompactionSummaryMessage`; `buildContextEntries()` còn áp dụng ranh giới giữ lại                                                                                  |
| `BranchSummaryEntry` (`branch_summary`) | Tạo `BranchSummaryMessage` gắn với `fromId`                                                                                                                            |

Hai kiểu entry thay đổi trạng thái trả về bên cạnh messages:

| Kiểu entry                                           | Tác động lên trạng thái                           |
| ---------------------------------------------------- | ------------------------------------------------- |
| `ModelChangeEntry` (`model_change`)                  | Đặt `{ provider, modelId }` cho đường dẫn đã chọn |
| `ThinkingLevelChangeEntry` (`thinking_level_change`) | Đặt chuỗi `thinkingLevel` hiện tại                |

Ba kiểu entry lưu siêu dữ liệu nhưng không đi vào context của model:

| Kiểu entry                          | Mục đích                                                                      |
| ----------------------------------- | ----------------------------------------------------------------------------- |
| `CustomEntry` (`custom`)            | Lưu `data` của Extension dưới một `customType`                                |
| `LabelEntry` (`label`)              | Đặt hoặc xóa label trên `targetId`; thay đổi được append sau cùng có hiệu lực |
| `SessionInfoEntry` (`session_info`) | Đặt hoặc xóa `name` hiển thị; entry được append sau cùng có hiệu lực          |

`SessionHeader` ở đầu file là cấu trúc thứ mười, nhưng nó không phải `SessionEntry` và không có parent. Bộ khung tổng quát mới hơn của Pi Agent Core định nghĩa một kiểu hợp khác gồm bảy kiểu entry, cùng lane và bản ghi thao tác. Trộn hai lược đồ sẽ tạo trình phân tích sai.

### Vì sao entry chỉ lưu parent

Con trỏ parent cho phép append mà không chạm vào entry cũ. Nếu `e2` lưu `children: [e3]`, khi thêm `e6`, hệ thống phải viết lại nó thành `children: [e3, e6]`. Với `parentId`, chỉ entry mới ghi quan hệ đó.

Coding Agent giữ `byId: Map<string, SessionEntry>` để tra cứu parent trực tiếp và duyệt từ leaf về root. `getChildren(parentId)` tìm nút con bằng cách quét các giá trị trong map; không có chỉ mục nút con thứ hai được lưu. `getTree()` cũng quét, coi entry mất parent là root, gắn label đã xác định và sắp xếp mỗi mảng nút con theo timestamp ISO.

Cách biểu diễn này giúp append trong bộ nhớ và `branch()` có chi phí trung bình O(1). Dựng toàn bộ dạng xem nút con cần một lượt quét, còn I/O có chi phí riêng. Con trỏ parent tránh phải viết lại entry cũ; nó không biến mọi truy vấn cây thành O(1).

## 4. Append, rewind, branch và tóm tắt

Từ ví dụ trên, ta có thể rút ra bốn thao tác mà vẫn giữ đúng hành vi sản phẩm.

### Thao tác 1: append một nút con

Mã giả bám theo mã nguồn dưới đây mô tả `_appendEntry()` cùng các mã gọi. Đây là mã giả vì bản triển khai chia bước tạo entry cho nhiều phương thức `appendXXX()` có kiểu cụ thể.

```text
id = generateCollisionCheckedId(byId)
entry = { type, id, parentId: leafId, timestamp: nowIso(), ...payload }
fileEntries.push(entry)
byId.set(id, entry)
leafId = id
persistAccordingToLazyWritePolicy(entry)
return id
```

Với message thông thường, mã gọi dùng API công khai thay vì tự tạo entry:

```text
entryId = session.appendMessage(agentMessage)
```

Các thay đổi trong bộ nhớ gồm thao tác append, `Map.set` và gán con trỏ. `SessionManager` ghi file đồng bộ, nên thời gian thực tế còn gồm tạo file, ghi toàn bộ file lần đầu hoặc `appendFileSync`, tùy trạng thái.

### Thao tác 2: rewind con trỏ hiện tại

`branch(entryId)` kiểm tra entry tồn tại rồi gán `leafId`. `resetLeaf()` đặt leaf thành `null`, nhờ đó lần append kế tiếp có thể tạo root khác.

```text
branch("e2")
// leafId giờ là "e2"; e3, e4 và e5 không thay đổi.
```

Lời gọi này không tính hay lưu một đối tượng branch. Đường dẫn được suy ra sau bằng cách đi theo parent. Lần append kế tiếp mới cung cấp bằng chứng bền vững cho hướng mới.

### Thao tác 3: append sau khi rewind

Sau khi leaf chuyển vị trí, append thông thường tạo branch. Không có kiểu branch riêng:

```text
branch("e2")
e6 = appendMessage(revisedQuestion) // e6.parentId === "e2"
```

Các thao tác tương tác phân biệt việc giữ branch trong cùng file với việc chép một đường dẫn sang file khác:

| Thao tác  | Kết quả về file   | Hành vi chọn                                                                                                                               |
| --------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `/tree`   | Cùng file session | Di chuyển trong toàn cây; khi chọn message của người dùng hoặc message tùy chỉnh, Pi chép văn bản vào trình soạn thảo và chuyển đến parent |
| `/fork`   | File session mới  | Chọn message cũ của user, trích đường dẫn đứng trước nó rồi đưa văn bản đã chọn vào trình soạn thảo                                        |
| `/clone`  | File session mới  | Chép branch đang hoạt động                                                                                                                 |
| `/resume` | Mở file đã có     | Dùng bộ chọn session của dự án                                                                                                             |
| `/new`    | Cấp session mới   | Bắt đầu với header mới và leaf null                                                                                                        |

`createBranchedSession(leafId)` trích một đường dẫn từ root đến leaf. Nó bỏ các nút `LabelEntry` khỏi đường dẫn được chép, nối lại các entry còn giữ, rồi append bản ghi label cho những đích còn tồn tại. Header mới ghi file cũ vào `parentSession`. Chính manager chuyển sang session mới; phương thức này không phải một hàm xuất dữ liệu thuần túy.

### Gắn bản tóm tắt branch tùy chọn

Khi `/tree` rời một đường dẫn để sang đường dẫn khác, `AgentSession.navigateTree()` có thể tóm tắt đoạn đuôi bị bỏ. Nó tìm tổ tiên chung sâu nhất giữa đường dẫn cũ và đường dẫn đích, thu các entry từ nút con của tổ tiên đó đến leaf cũ, rồi sinh bản tóm tắt trước khi chuyển leaf.

Đây là mã giả về vòng đời, không phải chữ ký của một phương thức bất đồng bộ duy nhất:

```text
fromExtension = false
result = await generateBranchSummary(entriesToSummarize, {
  model: requestModel, apiKey, headers, env, signal,
  customInstructions, replaceInstructions, reserveTokens,
  streamFn, retry, callbacks
})
summaryText = result.summary
summaryDetails = { readFiles: result.readFiles || [],
                   modifiedFiles: result.modifiedFiles || [] }
summaryUsage = result.usage
summaryId = session.branchWithSummary(newLeafId, summaryText, summaryDetails,
                                      fromExtension, summaryUsage)
```

Bản thân `branchWithSummary()` chạy đồng bộ. Nó ghi leaf cũ vào `fromId`, chuyển tới đích, append `BranchSummaryEntry` làm nút con của đích rồi đặt entry tóm tắt làm leaf mới:

```text
e2 user: salt verification
├─ e3 ... e5 hướng đã bỏ
└─ bs1 branch_summary(fromId: "e5")  <- leafId
   └─ entry được append tiếp theo
```

Bộ tóm tắt mặc định làm việc trong ngân sách token, giữ các message hợp lệ gần nhất, mang theo chi tiết thao tác file và biến compaction hoặc bản tóm tắt branch cũ thành context tóm tắt. Nó bỏ `toolResult` thô khỏi lời nhắc tóm tắt branch vì lời gọi Tool của assistant đã chỉ ra thao tác. Extension có thể hủy điều hướng, thay bản tóm tắt, chỉnh chỉ dẫn hoặc cung cấp dữ liệu chi tiết.

Nếu không có bản tóm tắt, thao tác điều hướng gọi `branch()` hoặc `resetLeaf()`. Nếu có bản tóm tắt, các entry bị bỏ vẫn nằm trong file, còn bản tóm tắt ngắn đi vào branch đích dưới dạng `BranchSummaryMessage` riêng. Không branch nào bị gộp hay xóa.

## 5. Dựng lại context đang hoạt động

Dữ liệu lưu có dạng cây, còn `Agent` và bộ chuyển đổi của provider nhận `AgentMessage[]` tuyến tính. Coding Agent thực hiện một phép chiếu rõ ràng, thay vì xem thứ tự dòng JSONL là context của model.

### Vì sao phép chiếu là một bước riêng

Thứ tự vật lý trả lời “bản ghi này được append lúc nào?”. Thứ tự parent trả lời “lịch sử nào thuộc vị trí này?”. Sau khi phân nhánh, hai thứ tự khác nhau. Gửi mọi dòng vật lý sẽ trộn các hướng cạnh tranh, bản ghi label và trạng thái của branch mà người dùng đã rời.

`getBranch()` cung cấp đường dẫn đầy đủ từ root đến leaf. `buildContextEntries()` áp dụng compaction mới nhất trên đường dẫn đó. Sau đó, `buildSessionContext()` đổi các entry đã chọn thành message và xác định model cùng trạng thái suy luận từ đường dẫn đầy đủ.

### Bước 1: đi từ leaf về root

Mã giả bám theo mã nguồn này phản ánh hàm hỗ trợ nội bộ `buildSessionPath()`:

```text
if (leafId === null) return []
leaf = leafId ? byId.get(leafId) : entries.at(-1)
path = []
while (leaf exists):
  path.push(leaf)
  leaf = leaf.parentId ? byId.get(leaf.parentId) : undefined
return path.reverse()
```

Với hướng thứ hai đã hoàn tất, đường dẫn được chọn là:

```text
[e1, e2, e6, e7, e8, e9, e10]
```

Đoạn đuôi `e3 -> e5` không xuất hiện. Nếu parent bị gãy, quá trình duyệt dừng sớm vì phép tra cứu trả về `undefined`; `SessionManager` không tự dựng phần lịch sử đã mất.

### Bước 2: chiếu từng kiểu entry đã chọn

Sau bước chọn theo compaction, `sessionEntryToContextMessages()` phân nhánh xử lý như sau:

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

Chuỗi message đang hoạt động của ví dụ có dạng:

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

Hai user message đứng liền nhau vì ví dụ gọi `branch("e2")` rồi append bên dưới. Bước chuẩn hóa cho từng provider diễn ra sau tại `convertToLlm`; phép chiếu session giữ nguyên lịch sử Agent message thay vì đoán quy tắc định dạng giao tiếp của provider.

### Xác định model và trạng thái suy luận

Bước lấy trạng thái đi qua toàn bộ đường dẫn đã chọn từ root đến leaf. `thinkingLevel` bắt đầu bằng `"off"`; mỗi `thinking_level_change` ghi đè giá trị. `model` bắt đầu bằng `null`; mỗi `model_change` ghi đè nó, và một message của assistant cũng cập nhật model từ provider cùng model đã tạo phản hồi đó.

```text
e1 model_change anthropic/claude-sonnet-4-6 -> model = cặp đó
e7 assistant từ cùng cặp                         -> model = cặp đó
path không có thinking_level_change              -> thinkingLevel = "off"
```

Entry hợp lệ cuối cùng trên đường dẫn có hiệu lực. Khi di chuyển leaf về trước một entry thay đổi trạng thái, thay đổi đó rời khỏi đường dẫn. Lưu lần chuyển trạng thái thành entry vì thế giúp rewind phục hồi trạng thái lịch sử mà không sửa một biến toàn cục của session.

### Áp dụng CompactionEntry mới nhất

`buildContextEntries()` tìm `CompactionEntry` cuối cùng trên đường dẫn đang hoạt động. Coding Agent v3 hiện tại lưu `firstKeptEntryId`; nó không lưu trường `retainedTail` của bộ khung tổng quát.

```text
e1 user: yêu cầu cũ
e2 assistant: phần việc cũ
e3 user: yêu cầu gần đây          <- firstKeptEntryId
e4 assistant: phần việc gần đây
e5 compaction(summary, firstKeptEntryId: "e3")
e6 user: công việc sau compaction
```

Phép chiếu đặt compaction entry trước, rồi các entry từ `firstKeptEntryId` đến trước compaction, rồi những entry sau compaction:

```text
[
  CompactionSummaryMessage(từ e5),
  UserMessage(e3),
  AssistantMessage(e4),
  UserMessage(e6)
]
```

Các entry thô `e1` và `e2` vẫn còn trong JSONL. Nếu chuyển đến leaf trước `e5`, đường dẫn không chứa compaction đó nên các message cũ có thể xuất hiện lại. Nếu không tìm thấy `firstKeptEntryId` trên đường dẫn đã chọn, bản triển khai hiện tại trả bản tóm tắt cùng các entry sau compaction, không tự tạo một đoạn đầu được giữ lại.

## 6. Lưu cây bằng JSONL

Định dạng file đơn giản, nhưng hai miền timestamp và chính sách tạo file muộn cần được xử lý chính xác.

### Lưu một bản ghi trên mỗi dòng

Dòng đầu là header v3. Mỗi dòng sau là một `SessionEntry`. Ví dụ này là JSONL hợp lệ; từng dòng vật lý được phân tích cú pháp độc lập:

```jsonl
{"type":"session","version":3,"id":"01992742-9d1a-7aa0-b123-112233445566","timestamp":"2026-08-24T10:00:00.000Z","cwd":"/work/auth"}
{"type":"model_change","id":"a1b2c3d4","parentId":null,"timestamp":"2026-08-24T10:00:05.000Z","provider":"anthropic","modelId":"claude-sonnet-4-6"}
{"type":"message","id":"b2c3d4e5","parentId":"a1b2c3d4","timestamp":"2026-08-24T10:23:00.000Z","message":{"role":"user","content":"Vì sao salt verification thất bại trong src/auth.ts?","timestamp":1787566980000}}
{"type":"message","id":"c3d4e5f6","parentId":"b2c3d4e5","timestamp":"2026-08-24T10:23:30.000Z","message":{"role":"assistant","content":[{"type":"text","text":"Tôi sẽ xem hàm verification."},{"type":"toolCall","id":"call_001","name":"read","arguments":{"path":"src/auth.ts"}}],"api":"anthropic-messages","provider":"anthropic","model":"claude-sonnet-4-6","usage":{"input":1250,"output":80,"cacheRead":0,"cacheWrite":0,"totalTokens":1330,"cost":{"input":0,"output":0,"cacheRead":0,"cacheWrite":0,"total":0}},"stopReason":"toolUse","timestamp":1787567010000}}
{"type":"message","id":"d4e5f6a7","parentId":"c3d4e5f6","timestamp":"2026-08-24T10:23:31.000Z","message":{"role":"toolResult","toolCallId":"call_001","toolName":"read","content":[{"type":"text","text":"export function verifySalt(...) { ... }"}],"isError":false,"timestamp":1787567011000}}
{"type":"message","id":"e5f6a7b8","parentId":"d4e5f6a7","timestamp":"2026-08-24T10:24:00.000Z","message":{"role":"assistant","content":[{"type":"text","text":"Phép so sánh dùng sai encoding."}],"api":"anthropic-messages","provider":"anthropic","model":"claude-sonnet-4-6","usage":{"input":1400,"output":40,"cacheRead":0,"cacheWrite":0,"totalTokens":1440,"cost":{"input":0,"output":0,"cacheRead":0,"cacheWrite":0,"total":0}},"stopReason":"stop","timestamp":1787567040000}}
{"type":"message","id":"f6a7b8c9","parentId":"b2c3d4e5","timestamp":"2026-08-24T10:30:00.000Z","message":{"role":"user","content":"Hãy xem bản triển khai của hàm hash trước.","timestamp":1787567400000}}
```

Mặc định, thư mục là `~/.pi/agent/sessions/--<encoded-cwd>--/`. `newSession()` đặt tên file theo mẫu `<ISO-with-colons-and-dots-replaced>_<sessionId>.jsonl`. Session ID mặc định là UUIDv7. Mã gọi có thể cấp ID chứa chữ số, chữ cái, `.`, `_` và `-`, với ký tự đầu và cuối là chữ hoặc số.

ID của entry lấy tám ký tự đầu của UUID ngẫu nhiên, thử tối đa 100 lần để tránh trùng trong `byId`, rồi dùng UUID đầy đủ nếu vẫn trùng. Timestamp của entry là chuỗi ISO. Timestamp lồng trong Pi AI message là số Unix mili giây. `parentSession` xuất hiện trong header được tạo từ session khác qua fork, clone hoặc `newSession({ parentSession })`.

JSONL giúp thao tác ghi phổ biến chỉ append một dòng thay vì tuần tự hóa lại một mảng JSON ngày càng lớn. Nó cũng để lộ branch: hai bản ghi có cùng `parentId` là các nút cùng cha dù giữa chúng có nhiều dòng vật lý.

### Trì hoãn tạo file đến khi có assistant

Manager lưu bền vững mới cấp một đường dẫn và giữ entry trong vùng đệm `fileEntries`, nhưng thông thường chưa tạo file cho đến khi message đầu tiên của assistant được append. Chính sách trong `_persist()` là:

| Đã có assistant trong `fileEntries` | `flushed` | Hành vi ghi                                                                             |
| ----------------------------------- | --------- | --------------------------------------------------------------------------------------- |
| Chưa                                | `false`   | Giữ entry trong bộ nhớ; chưa tạo file                                                   |
| Chưa                                | `true`    | Append entry hiện tại, trường hợp biên sau khi mở file đã được ghi                      |
| Có                                  | `false`   | Mở đường dẫn mới bằng `"wx"`, ghi header và mọi entry trong vùng đệm, rồi đặt `flushed` |
| Có                                  | `true`    | Chỉ append entry hiện tại bằng `appendFileSync`                                         |

Việc trì hoãn giúp một yêu cầu mới thất bại không để lại file session chỉ có câu hỏi của người dùng. Nó không bảo đảm mọi lượt đã lưu về sau luôn hoàn chỉnh. Sau lần ghi đầu, message của người dùng được append ngay, nên sự cố tiến trình hoặc lỗi provider vẫn có thể để lại câu hỏi chưa có phản hồi của assistant.

`isPersisted()` cho biết manager có được cấu hình để lưu bền vững hay không. Nó không kiểm tra cơ chế tạo muộn đã tạo file chưa. Vì vậy, một manager lưu bền vững có thể trả về đường dẫn dự kiến từ `getSessionFile()` dù đường dẫn đó chưa tồn tại.

### Xử lý rõ việc ghi lại file, phần cuối dở dang và bản sao lưu

Phần lớn thao tác là append, nhưng `SessionManager` của Coding Agent cũng ghi lại toàn bộ file trong các trường hợp sau:

- Khi đọc session v1 hoặc v2, Pi nâng lên v3 và gọi `_rewriteFile()` trên cùng đường dẫn.
- Khi mở một file rỗng được chỉ định trực tiếp, Pi khởi tạo rồi ghi lại file đó.
- `createBranchedSession()` tạo file mới từ một đường dẫn và các label đã xác định.
- `forkFrom()` tạo header mới bằng `"wx"` rồi append mọi entry không phải header từ nguồn.

`_rewriteFile()` mở file đích bằng `"w"`, cắt ngắn rồi ghi từng dòng trong vòng lặp. Nó không ghi trước vào file cùng thư mục, không đổi tên nguyên tử và không tạo bản sao lưu. Hãy sao chép session có giá trị trước khi nâng phiên bản hoặc biến đổi hàng loạt. “Cây chỉ ghi thêm” mô tả mô hình entry logic, không cam kết file vật lý không bao giờ bị ghi lại.

Bộ nạp v3 đọc UTF-8 theo từng khối, phân tích từng dòng đầy đủ và âm thầm bỏ dòng lỗi. Nó cũng thử phân tích đoạn cuối không có ký tự xuống dòng rồi bỏ qua nếu thất bại. Bộ nạp kiểm tra entry hợp lệ đầu tiên là session header có ID dạng chuỗi, nhưng không báo mọi dòng lỗi hay sửa phần cuối bị ghi dở. Trình phân tích dùng cho kiểm toán hoặc chuyển đổi nên chặt hơn hành vi khôi phục khi chạy này.

Manager của Coding Agent gọi API file đồng bộ và không có khóa file, `fsync`, compare-and-swap hay hàng đợi ghi xuyên tiến trình. Mỗi file session chỉ nên có một tiến trình ghi. `list()` và `listAll()` chỉ đọc; chúng nạp siêu dữ liệu của tối đa mười file cùng lúc, bỏ file không đọc được rồi sắp xếp theo thời điểm hoạt động suy ra.

`JsonlSessionStorage` tổng quát của Pi Agent Core có cơ chế an toàn khác: nó tuần tự hóa thao tác ghi bằng một chuỗi Promise trên từng đối tượng và dùng file tạm cùng phép đổi tên khi fork hoặc sửa phần cuối bị ghi dở. Các bảo đảm v4 đó không áp dụng cho `SessionManager` v3 của Coding Agent.

## 7. Tách hai tầng lưu trữ và dùng SessionManager

Pi 0.84.3 có hai hệ thống session cùng chia sẻ một số ý tưởng nhưng không tương thích về quy ước:

| Thuộc tính                  | Bộ khung Pi Agent Core                                               | `SessionManager` của Coding Agent                                        |
| --------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Lớp trừu tượng công khai    | `SessionStorage` và `Session` bất đồng bộ                            | Lớp cụ thể đồng bộ                                                       |
| Kiểu entry hiện tại         | 7 kiểu, gồm `active_tools_change`; có lane và bản ghi thao tác riêng | 9 kiểu `SessionEntry`, gồm message tùy chỉnh, label và thông tin session |
| Lược đồ JSONL               | Header v4, bản ghi thay đổi, timestamp số và số thứ tự               | Header v3 `type: "session"`, timestamp entry dạng ISO                    |
| Bản triển khai trên file    | `JsonlSessionStorage`, có hàng đợi trên từng đối tượng               | Gọi `fs` trực tiếp trong `SessionManager`                                |
| Bản triển khai trong bộ nhớ | `InMemorySessionStorage`                                             | `SessionManager.inMemory()`                                              |
| Tầng lưu trữ tùy chỉnh      | Triển khai `SessionStorage`                                          | Không có điểm để truyền bộ chuyển đổi lưu trữ                            |

Giao diện tổng quát quản lý siêu dữ liệu, lane, thao tác append entry và bản ghi, truy vấn, dữ kiện, label cùng thống kê. Một sản phẩm web hoặc máy chủ có thể triển khai các phương thức bất đồng bộ đó trên cơ sở dữ liệu. Bản triển khai ấy dùng với bộ khung tổng quát. Không thể truyền nó vào `SessionManager` của Coding Agent vì chữ ký, kiểu hợp entry, header và thời điểm ghi đều khác.

`SessionManager` vẫn hữu ích bên ngoài CLI vì gói có xuất lớp này cùng các kiểu entry/context. Các phương thức tĩnh chính gồm:

| Phương thức tĩnh                                                | Hành vi                                                                                   |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `create(cwd, sessionDir?, options?)`                            | Tạo session lưu bền vững mới cùng đường dẫn file dự kiến                                  |
| `open(path, sessionDir?, cwdOverride?)`                         | Đọc một file, nâng phiên bản cũ, dựng chỉ mục và dùng cwd trong header nếu không thay thế |
| `continueRecent(cwd, sessionDir?)`                              | Mở session phù hợp gần nhất hoặc tạo session mới                                          |
| `inMemory(cwd?, options?)`                                      | Dùng cùng hành vi cây nhưng không có file                                                 |
| `forkFrom(sourcePath, targetCwd, sessionDir?, options?)`        | Chép entry không phải header của nguồn dưới header v3 mới có `parentSession`              |
| `list(cwd, sessionDir?, onProgress?)`                           | Trả siêu dữ liệu session của dự án theo thời điểm hoạt động mới nhất trước                |
| `listAll(onProgress?)` hoặc `listAll(sessionDir?, onProgress?)` | Tìm qua mọi thư mục dự án đã mã hóa hoặc một thư mục được cấp                             |

API của đối tượng chia thành bốn nhóm:

| Nhóm                   | Phương thức hiện tại                                                                                                                                                                             |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Vòng đời và định danh  | `newSession()`, `setSessionFile()`, `createBranchedSession()`, `isPersisted()`, `usesDefaultSessionDir()`, `getCwd()`, `getSessionDir()`, `getSessionId()`, `getSessionFile()`                   |
| Append                 | `appendMessage()`, `appendThinkingLevelChange()`, `appendModelChange()`, `appendCompaction()`, `appendCustomEntry()`, `appendCustomMessageEntry()`, `appendLabelChange()`, `appendSessionInfo()` |
| Tree và label          | `getLeafId()`, `getLeafEntry()`, `getEntry()`, `getChildren()`, `getBranch()`, `getTree()`, `getLabel()`, `branch()`, `resetLeaf()`, `branchWithSummary()`                                       |
| Phép chiếu và kiểm tra | `buildContextEntries()`, `buildSessionContext()`, `getEntries()`, `getHeader()`, `getSessionName()`                                                                                              |

Mọi phương thức append đều trả ID của entry mới. `appendCompaction()` và `branchWithSummary()` nhận `details`, `fromHook` và `usage` tùy chọn; việc sinh bản tóm tắt thuộc `AgentSession`, không thuộc manager. `getEntries()` trả một mảng mới chứa các đối tượng entry đã lưu, nên mã gọi không được sửa các đối tượng đó.

Ví dụ có thể sao chép này chỉ dùng các phương thức công khai đã xuất:

```typescript
import { SessionManager } from "@earendil-works/pi-coding-agent";

const session = SessionManager.create(process.cwd());
const firstQuestionId = session.appendMessage({
  role: "user",
  content: "Rà soát luồng xác thực.",
  timestamp: Date.now(),
});

session.appendThinkingLevelChange("high");
session.branch(firstQuestionId);
session.appendMessage({
  role: "user",
  content: "Bắt đầu từ bản triển khai hàm băm mật khẩu.",
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

Một số hàm đã xuất cho phép dùng trực tiếp cơ chế này mà không cần đối tượng `SessionManager`: `buildContextEntries()`, `buildSessionContext()`, `sessionEntryToContextMessages()`, `parseSessionEntries()`, `migrateSessionEntries()` và `getLatestCompactionEntry()`. Các hàm hỗ trợ nội bộ của lớp như `_buildIndex()`, `_appendEntry()`, `_persist()` và `_rewriteFile()` triển khai chính sách lưu trữ, không nên được xem là API ổn định cho ứng dụng.

Chi tiết khi tạo và mở session có ảnh hưởng trực tiếp đến mã gọi. `create()` có thể trả một manager mà `getSessionFile()` mới chỉ là đường dẫn dự kiến, còn `newSession()` có thể trả trực tiếp đường dẫn đó, vì cơ chế ghi tạo file muộn. `open()` lấy `sessionDir` từ thư mục cha của file nếu mã gọi không cấp. `continueRecent()` lọc theo `cwd` trong header khi dùng thư mục tùy chỉnh dùng chung. `list()` và `listAll()` trả siêu dữ liệu `SessionInfo`, không trả manager đang mở; hãy gọi `open(info.path)` để tiếp tục.

## 8. Mang thiết kế sang hệ thống khác

Session Tree giải bài toán cụ thể của CLI cục bộ, nhưng các câu hỏi thiết kế của nó dùng được ở nhiều nơi.

### Tách nơi lưu trữ khỏi cấu trúc

| Quyết định | Câu hỏi                                           | Câu trả lời của Coding Agent                                   |
| ---------- | ------------------------------------------------- | -------------------------------------------------------------- |
| Nơi lưu    | Dữ liệu bền vững được ghi ở đâu và bằng cách nào? | Một file JSONL cục bộ cho mỗi session, nhóm theo cwd đã mã hóa |
| Cấu trúc   | Các lịch sử liên hệ ra sao?                       | Entry lịch sử không đổi, mỗi entry nối tới một parent          |
| Lựa chọn   | Lịch sử nào đang hoạt động?                       | Một leaf trong bộ nhớ cùng đường dẫn về root                   |
| Phép chiếu | Nội dung nào đến model?                           | Entry đã áp dụng compaction được đổi thành `AgentMessage[]`    |

Dịch vụ có thể giữ cùng cấu trúc nối bằng parent trong SQL. Một bài kiểm thử nhỏ có thể giữ toàn bộ trong bộ nhớ. Cây không phụ thuộc JSONL, và JSONL không bắt buộc dữ liệu phải là cây.

### Dùng lịch sử chỉ ghi thêm để rewind và so sánh

Liên kết parent giữ các lần thử cũ mà không sao chép chúng trong cùng session. Đổi lại, hệ thống giữ nhiều dữ liệu hơn và một số dạng xem cần quét tuyến tính. Lợi ích là lịch sử có thể kiểm tra và con trỏ di chuyển rẻ.

Hãy định nghĩa độ bền dữ liệu riêng. Coding Agent chỉ lưu branch khi entry mới trỏ đến parent đã chọn. Hệ thống cần lưu chính thao tác điều hướng phải có bản ghi lane hoặc leaf rõ ràng, như thay đổi lane của bộ khung tổng quát, hoặc một kho con trỏ có giao dịch.

### Lưu thay đổi trạng thái tại nơi nó có hiệu lực

Thay đổi model và mức suy luận thuộc về đường dẫn lịch sử vì ý nghĩa của chúng phụ thuộc vị trí. Rewind phải phục hồi thiết lập đã áp dụng ở đó. Coding Agent còn dùng trường provider/model trong message của assistant khi dựng lại trạng thái model, nhờ vậy đường dẫn được tiếp tục sẽ khôi phục model đã sinh phản hồi gần nhất của assistant.

Có thể áp dụng cùng phép thử cho trạng thái khác: nếu chuyển tới nút cũ phải khôi phục một giá trị, hãy ghi thay đổi thành sự kiện trên đường dẫn. Với dữ kiện có nghĩa trên toàn session, chẳng hạn tên hiển thị mới nhất, hãy tách nó khỏi quá trình dựng lại theo branch.

Bản bàn giao cho lần rà soát triển khai cần cụ thể: chốt quy ước của header và entry, quy tắc lưu con trỏ hiện tại, phân biệt chọn branch với trích branch, mô tả phép chiếu, quyết định bản tóm tắt đi vào context ra sao, rồi nêu rõ bảo đảm về việc ghi lại file, bản sao lưu và truy cập đồng thời. Chỉ một sơ đồ cây không trả lời được sáu quy ước đó.

## 9. Tiếp tục từ ranh giới session

Từ Chương 3 đến Chương 10, đường chạy đã nối liền: vòng lặp phát message, Tool thêm cặp lời gọi/kết quả, kỹ thuật context giới hạn đầu vào, compaction append mốc tóm tắt, còn phép chiếu session chọn branch cho lần gọi model tiếp theo.

Hệ thống Extension của Pi nằm ở cả hai phía ranh giới này. Extension có thể append trạng thái `custom`, đưa context `custom_message` vào, cung cấp bản tóm tắt compaction hoặc branch, gắn label cho entry và quan sát điều hướng. Các file mã nguồn nên đọc tiếp gồm:

- [`lược đồ`](https://github.com/earendil-works/pi/blob/4e58f324fae8ebfa98a3d45181fb248072a2afac/packages/coding-agent/src/core/session-manager.ts#L30-L153), [`phép chiếu`](https://github.com/earendil-works/pi/blob/4e58f324fae8ebfa98a3d45181fb248072a2afac/packages/coding-agent/src/core/session-manager.ts#L334-L469) và phần triển khai [`SessionManager`](https://github.com/earendil-works/pi/blob/4e58f324fae8ebfa98a3d45181fb248072a2afac/packages/coding-agent/src/core/session-manager.ts) của Coding Agent;
- phần [`thu thập entry`](https://github.com/earendil-works/pi/blob/4e58f324fae8ebfa98a3d45181fb248072a2afac/packages/coding-agent/src/core/compaction/branch-summarization.ts#L96-L145) và [`sinh bản tóm tắt`](https://github.com/earendil-works/pi/blob/4e58f324fae8ebfa98a3d45181fb248072a2afac/packages/coding-agent/src/core/compaction/branch-summarization.ts);
- [`quy ước entry và lưu trữ`](https://github.com/earendil-works/pi/blob/4e58f324fae8ebfa98a3d45181fb248072a2afac/packages/agent/src/harness/session/types.ts#L14-L326) cùng [`cơ chế an toàn JSONL`](https://github.com/earendil-works/pi/blob/4e58f324fae8ebfa98a3d45181fb248072a2afac/packages/agent/src/harness/session/jsonl/storage.ts#L23-L124) của bộ khung tổng quát;
- [Hành vi CLI hiện tại](https://github.com/earendil-works/pi/blob/4e58f324fae8ebfa98a3d45181fb248072a2afac/packages/coding-agent/docs/sessions.md).

Chương này bám theo Pi `0.84.3` tại commit `4e58f324fae8ebfa98a3d45181fb248072a2afac`.
