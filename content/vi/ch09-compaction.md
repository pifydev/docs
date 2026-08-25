---
title: 'Chương 9: Nén ngữ cảnh khi cuộc hội thoại quá dài'
description: Cách Pi chọn ranh giới an toàn trong lịch sử, ghi điểm kiểm tra có cấu trúc và dựng lại ngữ cảnh cho lần gọi mô hình tiếp theo.
translation_key: ch09-compaction
language: vi
chapter: 9
source_url: 'https://www.dgzhuya.com/modules/ch09-compaction'
official_refs:
  - 'https://github.com/earendil-works/pi/blob/4e58f324fae8ebfa98a3d45181fb248072a2afac/packages/coding-agent/docs/compaction.md'
terms_used:
  - Context Compaction
  - CompactionEntry
  - BranchSummaryEntry
  - Session
status: reviewed
last_updated: '2026-08-25'
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

Bản cũ mô tả thời điểm này là “giữa hai lượt”. Pi hiện tại có hai điểm kiểm tra cụ thể. Sau khi `agent.prompt()` kết thúc và `agent_end` được phát, `_handlePostAgentRun()` kiểm tra thông điệp cuối của trợ lý. Pi cũng kiểm tra thông điệp đó trước khi nhận lời nhắc tiếp theo, nhờ vậy phát hiện được phản hồi đã bị hủy mà bước kiểm tra sau lượt chạy thông thường bỏ qua.

Nén thủ công đi theo đường riêng. `AgentSession.compact(customInstructions?)` gọi `abort()` cho thao tác hiện tại của Agent trước, rồi mới bắt đầu nén. Phương thức này không tự động tiếp tục lượt vừa bị ngắt.

```text
đường tự động
lượt chạy Agent → message_end lưu thông điệp → agent_end → _checkCompaction()
                                                      ├─ không làm gì → kết thúc
                                                      └─ nén → dựng lại thông điệp Agent

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

`enabled: false` tắt đường ngưỡng và tràn ngữ cảnh tự động vì `_checkCompaction()` trả về ngay. Thiết lập này không tắt `AgentSession.compact()`, `/compact`, RPC/SDK `compact()` hoặc lời gọi `ctx.compact()` từ Extension.

### Mức sử dụng hiện tại ưu tiên dữ liệu từ nhà cung cấp

Mô tả cũ dùng `chars / 4` làm kích thước ngữ cảnh hiện tại. Pi `0.84.3` ưu tiên `usage` hợp lệ gần nhất của trợ lý. `calculateContextTokens()` lấy `usage.totalTokens` khi giá trị này khác 0; nếu không, hàm cộng `input + output + cacheRead + cacheWrite`.

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
| Tràn ngữ cảnh hoặc độ dài có thể phục hồi | Lỗi tràn từ cùng mô hình, hoặc lý do dừng `length` có thể phục hồi dưới giới hạn đầu ra mong muốn của mô hình | Bỏ thông điệp trợ lý bị lỗi hoặc bị cắt khỏi trạng thái Agent, nén rồi thử lại một lần |
| Thủ công | `/compact [instructions]`, RPC/SDK `compact()` hoặc Extension `ctx.compact()` | Hủy lượt chạy hiện tại trước; không tự động tiếp tục lượt đó |

Pi chỉ nén rồi thử lại một lần để phục hồi khi tràn ngữ cảnh. Thông điệp trợ lý bị lỗi hoặc bị cắt đã được lưu qua `message_end`; Pi bỏ nó khỏi ngữ cảnh thử lại trong bộ nhớ, nhưng không xóa khỏi cây phiên. Sau khi dựng lại, Pi tiếp tục bỏ thông điệp trợ lý ở cuối nếu phép chiếu đưa nó trở lại vị trí đó, vì `agent.continue()` cần một trạng thái có thể tiếp tục.

Điều kiện cùng mô hình áp dụng khi phát hiện tràn ngữ cảnh và độ dài có thể phục hồi. Việc tính ngưỡng vẫn dùng mức sử dụng do nhà cung cấp trả về hoặc phép ước lượng riêng đã mô tả ở trên. Điều kiện này ngăn lỗi tràn cũ từ một mô hình có cửa sổ nhỏ hơn kích hoạt phục hồi sau khi người dùng đổi mô hình.

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

Trong lần nén đầu, `boundaryStart` là đầu đường dẫn của nhánh đang hoạt động. Ở lần sau, Pi tìm `CompactionEntry` trước đó và bắt đầu tại `firstKeptEntryId` của mục này. Nếu mã đó không có trên nhánh đang hoạt động, Pi dùng mục nằm sau lần nén trước làm phương án dự phòng. Nhờ vậy, thông điệp từng sống sót qua điểm cắt cũ có thể đi vào bản tóm tắt tiếp theo thay vì bị tách khỏi điểm kiểm tra đang được cập nhật.

```text
điểm kiểm tra trước
  bản tóm tắt A + mục từ firstKept(A) trở đi

chuẩn bị lần tiếp theo
  previousSummary = bản tóm tắt A
  boundaryStart   = firstKept(A), hoặc mục sau lần nén A nếu phải dự phòng
  điểm cắt mới    = firstKept(B)

thông điệp [boundaryStart, điểm cắt mới) → đầu vào cho bản tóm tắt mới
thông điệp [điểm cắt mới, lá hiện tại]   → vùng giữ lại
```

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

Yêu cầu dùng `SUMMARIZATION_SYSTEM_PROMPT`, tắt lời gọi Tool bằng `toolChoice: "none"`, tắt ghi bộ nhớ đệm lời nhắc bằng `cacheRetention: "none"`, và tạo mã phiên định tuyến mới nếu bên gọi không cấp mã. Lỗi tạm thời trong luồng tóm tắt tuân theo chính sách thử lại đã cấu hình; lỗi tất định và thao tác hủy trả về ngay. Bản tóm tắt chính dùng một lần gọi mô hình. Lượt bị tách có thể cần một yêu cầu cho lịch sử chính, sau đó là một yêu cầu cho phần đầu lượt; Pi hiện chạy hai yêu cầu này tuần tự.

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

Trong lượt bị tách, yêu cầu tóm tắt lịch sử chính chỉ nhận `previousSummary` khi `messagesToSummarize` không rỗng. Nếu đoạn bị tách không có thông điệp cũ hoàn chỉnh, `compact()` hiện dùng nguyên văn `No prior history.` trước bản tóm tắt phần đầu lượt và không tạo yêu cầu riêng để đưa `previousSummary` vào.

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
[bản tóm tắt lịch sử sáu mục, hoặc "No prior history."]

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

`timestamp` là chuỗi ISO trong phiên đã lưu, khác với mốc thời gian dạng số của `AgentMessage` được chiếu. `fromHook` là tên trường tương thích ngược dành cho kết quả do Extension cung cấp. `details` phải tuần tự hóa được thành JSON nếu phiên được lưu dưới dạng JSONL.

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

`tokensBefore` được tính trong bước chuẩn bị từ `estimateContextTokens(buildSessionContext(pathEntries).messages)`. Giá trị này đo ngữ cảnh đang hoạt động đã được dựng lại và sắp bị thay thế, dùng mức sử dụng từ nhà cung cấp khi hợp lệ và phép ước lượng khi cần. Nó không phải số token của mọi mục JSONL, kích thước tệp phiên theo byte hay mức sử dụng của yêu cầu tóm tắt. `usage` của bước tạo bản tóm tắt được lưu riêng và cộng vào tổng token cùng chi phí của toàn phiên.

### Cây đã lưu, phép chiếu đang hoạt động và biến đổi từng lần gọi là ba trạng thái khác nhau

Cây phiên giữ các mục thô cũ, mục được giữ lại, mục nén và các mục con về sau. `buildContextEntries()` chỉ đi theo đường liên kết cha của lá đã chọn, tìm lần nén gần nhất trên đường đó rồi trả về:

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

Thành phần đăng ký qua `AgentSession.subscribe()` nhận `compaction_start` và `compaction_end`. Sự kiện bắt đầu có `reason: "manual" | "threshold" | "overflow"`. Sự kiện kết thúc luôn mang cùng `reason`, cùng các trường tùy chọn `result`, `aborted`, `willRetry` và `errorMessage`.

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
1. Phản hồi Agent kết thúc
   message_end lưu trợ lý → agent_end → _handlePostAgentRun()

2. Phân loại
   tràn/độ dài có thể phục hồi từ cùng mô hình HOẶC ngưỡng từ mức sử dụng hiện tại

3. Chuẩn bị
   dựng đường dẫn của nhánh đang hoạt động
   → tính lại tokensBefore từ buildSessionContext(path).messages
   → tìm ranh giới của bản tóm tắt trước
   → đi ngược tới firstKeptEntryId
   → chia messagesToSummarize / turnPrefixMessages / vùng giữ lại
   → thu thập thao tác tệp tích hợp sẵn

4. Can thiệp
   compaction_start → chờ session_before_compact
   → hủy, dùng kết quả tùy chỉnh hoặc tạo kết quả tích hợp sẵn

5. Tóm tắt
   convertToLlm → serializeConversation (kết quả Tool giới hạn 2.000 ký tự)
   → yêu cầu ban đầu/cập nhật theo sáu mục
   → yêu cầu phần đầu lượt theo thứ tự nếu cần
   → nối danh sách tệp đã sắp xếp và cộng mức sử dụng

6. Lưu
   SessionManager.appendCompaction(...)
   → mục JSONL mới nối với mục cha; mục cũ vẫn còn

7. Chiếu
   buildSessionContext()
   → CompactionSummaryMessage + mục từ firstKeptEntryId + mục về sau
   → thay agent.state.messages

8. Thông báo và tiếp tục
   session_compact → compaction_end
   → thử lại một lượt bị tràn, phát thông điệp đang chờ hoặc kết thúc

9. Lần gọi mô hình tiếp theo
   transformContext → convertToLlm
   → lời nhắc hệ thống + thông điệp người dùng <summary> + thông điệp gần đây nguyên văn
```

Nén thủ công đi vào bước 4 sau khi hủy lượt chạy Agent đang hoạt động và chuẩn bị các vùng thông điệp. Đường này không đi vào nhánh thử lại tự động ở bước 8.

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

Các tham chiếu triển khai của chương này được ghim tại Pi `0.84.3`, commit `4e58f324fae8ebfa98a3d45181fb248072a2afac`:

- [Giá trị mặc định, cách tính token, điểm cắt, mẫu, bước chuẩn bị và tạo kết quả nén](https://github.com/earendil-works/pi/blob/4e58f324fae8ebfa98a3d45181fb248072a2afac/packages/coding-agent/src/core/compaction/compaction.ts)
- [Tuần tự hóa bản tóm tắt và theo dõi thao tác tệp](https://github.com/earendil-works/pi/blob/4e58f324fae8ebfa98a3d45181fb248072a2afac/packages/coding-agent/src/core/compaction/utils.ts)
- [`CompactionEntry`](https://github.com/earendil-works/pi/blob/4e58f324fae8ebfa98a3d45181fb248072a2afac/packages/coding-agent/src/core/session-manager.ts#L46-L80), [`appendCompaction()`](https://github.com/earendil-works/pi/blob/4e58f324fae8ebfa98a3d45181fb248072a2afac/packages/coding-agent/src/core/session-manager.ts#L1096-L1119) và [`buildSessionContext()`](https://github.com/earendil-works/pi/blob/4e58f324fae8ebfa98a3d45181fb248072a2afac/packages/coding-agent/src/core/session-manager.ts#L379-L469)
- [Đường xử lý vòng đời, thử lại, hủy và thất bại trong chế độ thủ công hoặc tự động](https://github.com/earendil-works/pi/blob/4e58f324fae8ebfa98a3d45181fb248072a2afac/packages/coding-agent/src/core/agent-session.ts#L1818-L2359)
- [Hợp đồng nén trong context của Extension](https://github.com/earendil-works/pi/blob/4e58f324fae8ebfa98a3d45181fb248072a2afac/packages/coding-agent/src/core/extensions/types.ts#L290-L302) và [các event hook](https://github.com/earendil-works/pi/blob/4e58f324fae8ebfa98a3d45181fb248072a2afac/packages/coding-agent/src/core/extensions/types.ts#L593-L630)
- [Chuyển đổi thông điệp tóm tắt nén](https://github.com/earendil-works/pi/blob/4e58f324fae8ebfa98a3d45181fb248072a2afac/packages/coding-agent/src/core/messages.ts#L109-L120) và [thứ tự biến đổi cho từng lần gọi](https://github.com/earendil-works/pi/blob/4e58f324fae8ebfa98a3d45181fb248072a2afac/packages/agent/src/agent-loop.ts#L277-L302)
- [Hợp nhất thiết lập toàn cục/dự án](https://github.com/earendil-works/pi/blob/4e58f324fae8ebfa98a3d45181fb248072a2afac/packages/coding-agent/src/core/settings-manager.ts#L148-L170), [giá trị ghi đè từ SDK](https://github.com/earendil-works/pi/blob/4e58f324fae8ebfa98a3d45181fb248072a2afac/packages/coding-agent/src/core/settings-manager.ts#L546-L549) và [giá trị nén có hiệu lực](https://github.com/earendil-works/pi/blob/4e58f324fae8ebfa98a3d45181fb248072a2afac/packages/coding-agent/src/core/settings-manager.ts#L825-L852)
- [Lược đồ `retainedTail` của Agent dùng chung](https://github.com/earendil-works/pi/blob/4e58f324fae8ebfa98a3d45181fb248072a2afac/packages/agent/src/harness/session/types.ts#L39-L51), khác với Coding Agent `SessionManager`

> **Tiếp theo:** [Chương 10: Quản lý phiên](ch10-session.md)
