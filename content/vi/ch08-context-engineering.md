---
title: 'Chương 8: Kỹ thuật ngữ cảnh'
description: Cách Pi giới hạn đầu ra Tool, ghép tài nguyên theo project trust, rồi nén lịch sử dài hoặc tóm tắt nhánh cho từng lần gọi model.
translation_key: ch08-context-engineering
language: vi
chapter: 8
source_url: 'https://www.dgzhuya.com/modules/ch08-context-engineering'
official_refs:
  - 'https://github.com/earendil-works/pi/blob/f07218c4d4bbc12bef056a7058c3dd49dfe41abe/packages/coding-agent/src/core/resource-loader.ts'
  - 'https://github.com/earendil-works/pi/blob/f07218c4d4bbc12bef056a7058c3dd49dfe41abe/packages/coding-agent/src/core/tools/truncate.ts'
  - 'https://github.com/earendil-works/pi/blob/f07218c4d4bbc12bef056a7058c3dd49dfe41abe/packages/coding-agent/src/core/compaction/compaction.ts'
  - 'https://github.com/earendil-works/pi/blob/f07218c4d4bbc12bef056a7058c3dd49dfe41abe/packages/coding-agent/src/core/tools/index.ts'
terms_used:
  - Context
  - Context Engineering
  - System Prompt
  - transformContext
  - convertToLlm
status: reviewed
last_updated: '2026-09-23'
translator: Pify maintainers
reviewed_by: Pify maintainers
---

Chương 6 đã đi theo các bản ghi `AgentMessage` giàu dữ liệu tới ranh giới `convertToLlm`. Chương 7 đã theo dõi các sự kiện phát ra khi những bản ghi đó thay đổi. Cả hai con đường đều gặp một giới hạn: model chỉ nhận lượng context hữu hạn, trong khi một phiên lập trình có thể tiếp tục tích lũy chỉ dẫn, định nghĩa Tool, thông điệp, nội dung file, log lệnh và bằng chứng truy xuất.

Kỹ thuật ngữ cảnh quyết định dữ liệu nào đi vào một lần gọi model, theo thứ tự nào và dưới hình thức gì. Pi áp dụng nhiều cơ chế tại các ranh giới khác nhau. Giới hạn 50 KiB của đầu ra Tool đo byte UTF-8. Cửa sổ model đo token. `transformContext` tạo bản chiếu thông điệp cho một lần gọi. Compaction thay đổi góc nhìn của phiên hiện hành bằng cách thêm một bản ghi tóm tắt. Mỗi cơ chế xử lý một dạng lỗi khác nhau.

## 1. Vấn đề: cửa sổ cố định, hội thoại tiếp tục dài ra

Một yêu cầu Pi AI có `systemPrompt`, `messages` và `tools`. Package coding-agent điền các trường đó từ nhiều nguồn hơn những gì kiểu dữ liệu gọn gàng này thể hiện:

```text
Một yêu cầu gửi model
├─ system prompt
│  ├─ prompt mặc định hoặc prompt thay thế
│  ├─ phần prompt nối thêm
│  ├─ file ngữ cảnh AGENTS.md / CLAUDE.md
│  └─ metadata của skill hiển thị cho model
├─ thông điệp trong phiên hiện hành
│  ├─ thông điệp của user và assistant
│  ├─ lời gọi Tool và kết quả Tool
│  ├─ bản tóm tắt compaction
│  └─ bản tóm tắt nhánh tùy chọn
├─ định nghĩa và schema tham số của Tool đang hoạt động
└─ đầu vào hiện tại của người dùng cùng context được truy xuất
```

Bất kỳ nhánh nào cũng có thể phình lớn. Một lần build có thể in hàng nghìn dòng. File sinh tự động có thể đặt hàng chục kilobyte trên một dòng. Schema của Tool chiếm context trước khi model trả lời. Phiên dài giữ lại các quyết định và thử nghiệm thất bại trước đó. Khi chuyển nhánh, kết quả điều tra hữu ích có thể nằm lại trên một đường dẫn không còn hiện hành.

`contextWindow` của model là hạn mức token cứng, dùng chung cho đầu vào và phản hồi. Vì vậy, Pi giới hạn một số kết quả Tool trước khi đưa chúng vào lịch sử, ghép các chỉ dẫn ổn định để người dùng không phải nhắc lại, chỉ chiếu đường dẫn hiện hành của phiên, rồi tóm tắt lịch sử cũ hoặc phần lịch sử bị bỏ lại khi luồng xử lý tương ứng yêu cầu.

## 2. Bản đồ: phòng thủ tại ranh giới đầu vào, yêu cầu và lịch sử

Thiết kế gốc chia thành hai phía lớn là đầu vào và lịch sử. Pi hiện tại còn có một ranh giới hữu ích ở giữa: bản chiếu thông điệp của từng yêu cầu, trước khi chúng được đổi thành thông điệp Pi AI.

```text
Ranh giới tài nguyên và Tool
  giới hạn đầu ra của một số Tool tích hợp sẵn; tìm chỉ dẫn và skill
                              │
                              ▼
Ranh giới yêu cầu
  dựng system prompt; chạy hook ngữ cảnh; đổi AgentMessage[] thành Message[]
                              │
                              ▼
Ranh giới lịch sử
  chiếu nhánh hiện hành; nén lịch sử cũ; tùy chọn tóm tắt nhánh vừa rời
```

| Cơ chế | Đơn vị và phạm vi | Thời điểm kích hoạt | Việc cơ chế không làm |
| --- | --- | --- | --- |
| Cắt đầu ra Tool | Dòng, byte UTF-8 và độ dài chuỗi của `grep` | Trong lúc một số Tool tích hợp sẵn chạy | Không tính token hoặc rút ngắn lịch sử đã có |
| Ghép system prompt | File, bản ghi tài nguyên và chuỗi | Khi nạp lại tài nguyên và dựng lại prompt | Không làm chỉ dẫn trong repository trở nên an toàn, có thẩm quyền hoặc được phép thực hiện; project trust chỉ kiểm soát việc nạp tài nguyên, không cấp quyền hay tạo sandbox |
| `transformContext` và `convertToLlm` | Thông điệp cho một lần gọi model | Trước mỗi phản hồi của assistant | Tự chúng không ghi bền bản ghi compaction |
| Compaction | Token ước lượng hoặc token do provider báo trên nhánh hiện hành | Yêu cầu thủ công, vượt ngưỡng hoặc khôi phục sau tràn ngữ cảnh | Không cắt một kết quả Tool quá lớn ngay khi Tool chạy |
| Bản tóm tắt nhánh | Bản ghi trên đường dẫn vừa rời | Khi thao tác điều hướng cây yêu cầu tóm tắt | Không chạy trong mọi lần chuyển nhánh |

Các lớp phòng thủ phối hợp với nhau. Bỏ một lớp vì đã có lớp khác sẽ làm dạng lỗi ban đầu xuất hiện trở lại.

## 3. Phòng thủ đầu vào 1: cắt đầu ra Tool

### Vấn đề: một lệnh có thể lấp đầy cửa sổ

`npm test` có thể in 8.000 dòng. Đọc một bundle đã minify có thể trả về một dòng 100 KB. Khi các yêu cầu sau tiếp tục mang theo những kết quả đó, phần context dành cho quyết định hiện tại bị đầu ra cũ chiếm mất.

Chỉ cắt theo số ký tự không thể diễn tả quy tắc Pi cần. Khi đọc file, phần đầu của vùng được yêu cầu thường quan trọng; khi lệnh thất bại, stack hoặc báo cáo thoát hữu ích thường nằm ở cuối. Số dòng mới giữ cho kết quả dễ đọc, còn số byte giới hạn khối dữ liệu. Phần triển khai cũng phải chỉ rõ vùng bị bỏ để model có thể lấy lại.

Tiện ích dùng chung thuộc `@earendil-works/pi-coding-agent`, không thuộc Agent core hay Pi AI. Package này export `truncateHead()`, `truncateTail()`, `truncateLine()` cùng metadata kết quả. Tool tùy chỉnh không tự động được các hàm hỗ trợ này bảo vệ; tác giả Tool phải tự giới hạn kết quả hoặc gọi tiện ích đã export.

### Hai giới hạn: dòng và byte

[`tools/truncate.ts`](https://github.com/earendil-works/pi/blob/107d79f11072bbc8a3a757ed7fd69596bee7d68c/packages/coding-agent/src/core/tools/truncate.ts#L11-L45) định nghĩa các giá trị mặc định:

- `DEFAULT_MAX_LINES = 2000`
- `DEFAULT_MAX_BYTES = 50 * 1024`
- `GREP_MAX_LINE_LENGTH = 500`

`truncateHead()` và `truncateTail()` nhận `maxLines` cùng `maxBytes`. Chúng dừng khi chạm giới hạn đang có hiệu lực đầu tiên. Số byte dùng `Buffer.byteLength(text, "utf-8")`; số này không liên quan tới cách model tách token.

| Thao tác | Giới hạn chính | Phần được giữ | Cách dùng hiện tại |
| --- | --- | --- | --- |
| `truncateHead()` | mặc định 2.000 dòng nguyên vẹn hoặc 50 KiB | Phần đầu | `read`; giới hạn byte cuối cho `grep`, `find` và `ls` |
| `truncateTail()` | mặc định 2.000 dòng hoặc 50 KiB | Phần cuối | đầu ra đang truyền và đầu ra hoàn tất của `bash` |
| `truncateLine()` | mặc định 500 code unit JavaScript | Phần đầu một dòng | từng dòng khớp hoặc dòng ngữ cảnh của `grep` |

`grep` có thêm giới hạn mặc định 100 kết quả khớp. Sau đó nó cắt từng dòng hiển thị và gọi `truncateHead(rawOutput, { maxLines: Number.MAX_SAFE_INTEGER })`. Vì vậy, giới hạn kết quả khớp kiểm soát số dòng, còn tiện ích dùng chung áp dụng giới hạn tổng 50 KiB.

### Quy tắc giữ đầu và giữ cuối

`read` giữ các dòng nguyên vẹn từ `offset` được yêu cầu. Câu lệnh import, khai báo và tài liệu cấp file thường nằm sớm, còn dấu tiếp tục cho biết offset kế tiếp. `bash` giữ phần cuối, nơi bản tóm tắt kiểm thử, stack lỗi và thông báo chẩn đoán khi thoát thường xuất hiện.

Có thể tóm lược hai hướng duyệt mà không chép chi tiết phần triển khai:

```text
Mã giả, không phải API Pi

truncateHead: đi từ đầu → cuối; giữ từng dòng nguyên vẹn khi cả hai hạn mức còn đủ
truncateTail: đi từ cuối → đầu; chèn từng dòng vào đầu khi cả hai hạn mức còn đủ

Ngoại lệ: nếu riêng dòng cuối ban đầu đã vượt hạn mức byte của tail,
truncateTail giữ hậu tố an toàn theo biên UTF-8 và đánh dấu dòng bị cắt một phần.
```

Giữ head hay tail là quy tắc riêng của từng Tool. Tool tùy chỉnh trả về thông báo chẩn đoán đầu tiên của compiler có thể chọn giữ head. Tool khác có thể trả về bản tóm tắt có cấu trúc kèm file handle thay vì một đoạn cắt thô ở đầu hoặc cuối.

### Byte UTF-8 và ranh giới chuỗi

Mã nguồn dùng ba đơn vị khác nhau, vì vậy tên của chúng phải luôn rõ ràng:

| Ranh giới | Cách đo | Thuộc tính an toàn |
| --- | --- | --- |
| Giới hạn byte cho head và tail | Byte UTF-8 | Giữ dòng nguyên vẹn, ngoại trừ trường hợp biên đã ghi rõ của tail |
| Cắt một phần dòng ở tail | Byte của `Buffer` UTF-8 | Bỏ qua các byte tiếp diễn trước khi giải mã, nên đoạn cắt bắt đầu tại biên UTF-8 hợp lệ |
| Giới hạn dòng của `grep` | `String.length` và `.slice()` của JavaScript | Đếm code unit UTF-16, không đếm Unicode code point hoặc byte UTF-8 |

Ví dụ, `🙂` chiếm bốn byte UTF-8, hai code unit UTF-16 và một Unicode code point:

```text
giá trị                byte UTF-8    code unit UTF-16    code point
"A"                    1             1                   1
"é"                    2             1                   1
"🙂"                   4             2                   1
```

`truncateTail()` đổi dòng thành `Buffer`, chọn vị trí byte bắt đầu, bỏ qua byte tiếp diễn rồi giải mã phần hậu tố còn lại. Nó không trả về emoji bị giải mã một nửa. `truncateHead()` hoàn toàn không cắt một phần dòng đầu quá dài. `truncateLine()` có quy ước khác: `.slice()` theo 500 đơn vị có thể rơi giữa hai UTF-16 surrogate của ký tự nằm ngoài BMP. Vì vậy, giới hạn hiển thị của `grep` không bảo toàn biên code point.

### Khi một dòng vượt hạn mức

Phép cắt head và tail cố ý xử lý trường hợp biên này khác nhau.

Với `read`, nếu riêng dòng đầu được chọn đã lớn hơn 50 KiB, `truncateHead()` trả về nội dung rỗng cùng `firstLineExceedsLimit: true`. Tool đổi trạng thái đó thành kết quả có hành động khôi phục rõ ràng:

```text
[Line 1 is 92.3KB, exceeds 50.0KB limit.
 Use bash: sed -n '1p' bundle.js | head -c 51200]
```

Với `bash`, nếu riêng dòng cuối ban đầu đã vượt giới hạn byte, `truncateTail()` trả về hậu tố UTF-8 hợp lệ lớn nhất còn vừa hạn mức và đặt `lastLinePartial: true`. Bash Tool báo cả kích thước phần được giữ lẫn dòng gốc, đồng thời trỏ tới log đầy đủ đã lưu.

Sự bất đối xứng này giúp `read` không trình bày dòng đầu bị cắt như một dòng mã nguồn bình thường, đồng thời vẫn giữ lại phần cuối của đầu ra khi lệnh thất bại.

### Quy tắc 500 đơn vị của grep

[`truncateLine()`](https://github.com/earendil-works/pi/blob/107d79f11072bbc8a3a757ed7fd69596bee7d68c/packages/coding-agent/src/core/tools/truncate.ts) giữ 500 code unit JavaScript đầu tiên rồi nối `... [truncated]`. `grep` áp dụng hàm này cho dòng khớp và dòng ngữ cảnh tùy chọn. Một thông báo yêu cầu model dùng `read` để xem dòng đầy đủ.

Giới hạn này xử lý vấn đề hẹp hơn giới hạn 50 KiB. Một dòng đã minify có thể lấn át danh sách kết quả khớp hữu ích ngay cả khi tổng đầu ra vẫn dưới 50 KiB. Giới hạn 100 kết quả khớp, 500 code unit trên mỗi dòng và 50 KiB tổng thể bảo vệ ba chiều khác nhau.

### Dấu báo cho người dùng và đường lấy lại dữ liệu

Phần đầu ra bị bỏ cần có dấu vết nguồn và hành động khôi phục. Tool tích hợp sẵn hiện đưa các hành động đó vào chính văn bản của kết quả Tool:

| Tool | Dấu báo ví dụ | Đường lấy lại dữ liệu |
| --- | --- | --- |
| `read` | `[Showing lines 1-2000 of 5000. Use offset=2001 to continue.]` | gọi lại `read` với `offset` |
| `read`, chạm giới hạn byte | `[Showing lines 1-640 of 5000 (50.0KB limit). Use offset=641 to continue.]` | tiếp tục từ dòng được báo |
| `bash` | `[Showing lines 6501-8500 of 8500. Full output: /tmp/pi-output-….log]` | đọc log tạm |
| `grep` | `[100 matches limit reached. … Some lines truncated to 500 chars. Use read tool to see full lines]` | thu hẹp biểu thức tìm kiếm, tăng `limit` hoặc đọc mã nguồn |

```text
Ví dụ dấu báo cho trường hợp biên của Bash

[Showing last 49.9KB of line 1 (line is 92.3KB).
 Full output: /tmp/pi-output-1a2b3c4d.log]
```

`OutputAccumulator` giải mã luồng byte bằng `TextDecoder`, duy trì phần cuối hiển thị có giới hạn và mở file tạm khi giới hạn byte hoặc dòng đòi hỏi phải giữ bản đầy đủ. Kết quả Tool cuối vẫn dùng cùng quy tắc giữ tail. Đường dẫn tạm thuộc cơ chế tích lũy của Bash; `read` đã có file gốc, còn `grep` hướng model trở lại mã nguồn.

Giới hạn output kiểm soát nội dung đi vào context sau khi Tool chạy. Pi cũng kiểm soát cách một số built-in yêu cầu model sinh argument: `read`, `bash`, `powershell`, `edit` và `write` mặc định dùng JSON Schema constrained sampling ở chế độ strict-prefer. Provider có capability phù hợp sẽ enforce schema; provider không tương thích sẽ fallback về Tool calling thông thường vì policy là “prefer”, không phải “require”. Extension chủ động thay một trong các definition này có thể opt out bằng `constrainedSampling: false`.

| Tool hoặc phạm vi thay thế | Quy ước `constrainedSampling` |
|---|---|
| `read` | `strict-prefer` |
| `bash` | `strict-prefer` |
| `powershell` | `strict-prefer` |
| `edit` | `strict-prefer` |
| `write` | `strict-prefer` |
| `extension replacement` | `constrainedSampling: false` |

## 4. Phòng thủ đầu vào 2: ghép system prompt và tài nguyên

### Vấn đề: quy tắc dự án phải tới model mà không cần nhắc lại

Repository có thể quy định package manager, lệnh kiểm thử, chính sách cho file được sinh hoặc ranh giới kiến trúc cụ thể. Đưa các quy tắc ổn định đó vào mọi thông điệp của người dùng vừa tốn token vừa dễ sai lệch. Pi tìm các chỉ dẫn bền vững một lần, rồi dựng lại system prompt khi tài nguyên hoặc Tool đang hoạt động thay đổi.

System prompt chỉ là một phần của `Context` trong Pi AI. Định nghĩa Tool thật cũng đi qua `Context.tools`; prompt chứa đoạn mô tả ngắn và hướng dẫn của Tool để model chọn trong tập đang hoạt động. Mẫu prompt mở rộng thành đầu vào của người dùng, còn hook ngữ cảnh của Extension chạy trên thông điệp ở bước sau. Các đường này đóng góp context tại những thời điểm khác nhau.

### Tìm file ngữ cảnh và thứ tự ưu tiên

`loadProjectContextFiles()` đọc nhiều nhất một file ngữ cảnh từ mỗi thư mục. Thứ tự ứng viên chính xác là:

```text
AGENTS.override.md
AGENTS.md
AGENTS.MD
CLAUDE.md
CLAUDE.MD
```

Vì vậy, `AGENTS.override.md` chỉ thắng trong chính thư mục của nó. File này không loại file ngữ cảnh ở thư mục khác. Các biến thể viết hoa nêu trên là những ứng viên được liệt kê rõ; quá trình tìm kiếm không quét thư mục theo kiểu bỏ qua chữ hoa và chữ thường.

Danh sách trả về bắt đầu bằng file khớp đầu tiên trong `agentDir`, thường là `~/.pi/agent/AGENTS.md`. Sau đó Pi đi từ `cwd` lên thư mục gốc của hệ thống tệp, chèn mỗi file khớp vào đầu để thư mục cha đứng trước thư mục con:

```text
/workspace/AGENTS.md                     # quy tắc rộng của repository
/workspace/apps/AGENTS.md                # quy tắc của application
/workspace/apps/web/AGENTS.override.md   # bản thay thế riêng cho cwd này
```

Trong linked worktree nằm bên dưới worktree chính, Pi bỏ file ngữ cảnh của checkout chính nếu file đó lặp lại phạm vi logic của repository tại thư mục gốc worktree. Cơ chế kế thừa từ thư mục cha vẫn giữ nguyên. Có thể tắt việc nạp file ngữ cảnh bằng `--no-context-files`.

Thứ tự này cho model đọc từ quy tắc tổng quát tới quy tắc cụ thể; Pi không có bộ phân tích cú pháp tự giải quyết mâu thuẫn trong phần văn xuôi. Khi hai file xung đột, tác giả vẫn phải nêu rõ quy tắc nào được ưu tiên.

### Project trust: ranh giới chính xác

Project trust quyết định Pi được nạp những tài nguyên dự án nào. Nó không cấp quyền cho lời gọi Tool, không cô lập process trong sandbox và không ngăn prompt injection. Tool tích hợp sẵn và extension của Pi chạy với quyền hệ điều hành của process Pi.

`AGENTS.override.md`, `AGENTS.md` và `CLAUDE.md` vẫn được nạp bất kể quyết định về project trust, trừ khi việc nạp file ngữ cảnh bị tắt. Project trust áp dụng điều kiện nạp cho cài đặt dự án và các kênh tài nguyên có thể thực thi hoặc cấu hình hành vi; nó không xác nhận văn bản thông thường trong repository là an toàn.

| Nguồn | Dự án không được tin cậy | Dự án được tin cậy | Quy tắc chọn hoặc hợp nhất |
| --- | --- | --- | --- |
| File ngữ cảnh trong `agentDir` và chuỗi thư mục | Nạp | Nạp | file toàn cục trước, rồi từ thư mục cha tới `cwd`; một ứng viên mỗi thư mục |
| `~/.pi/agent/settings.json` và tài nguyên người dùng | Nạp | Nạp | phạm vi người dùng luôn có thể dùng |
| `.pi/settings.json` | Bỏ qua | Nạp | hợp nhất sâu và ghi đè cài đặt toàn cục |
| `.pi/extensions`, `skills`, `prompts` và `themes` | Bỏ qua | Nạp | cài đặt có thể bật hoặc tắt từng mục được tìm thấy |
| `.agents/skills` của dự án, từ `cwd` đi lên | Bỏ qua | Nạp | dừng tại Git root, hoặc thư mục gốc của hệ thống tệp khi không ở trong repository |
| `.pi/SYSTEM.md` và `.pi/APPEND_SYSTEM.md` của dự án | Bỏ qua | Có thể chọn | chỉ xét tại `cwd` hiện tại; mỗi loại dùng file toàn cục làm phương án dự phòng |
| Extension người dùng/toàn cục và extension CLI `-e` tạm thời trong lúc xác định trust | Nạp | Nạp | có thể xử lý `project_trust` trước khi extension dự án được nạp |

Pi chỉ hỏi khi tìm thấy tài nguyên chỉ được nạp nếu project trust cho phép và chưa có quyết định đã lưu cho thư mục hiện tại hoặc thư mục cha. `~/.pi/agent/trust.json` lưu quyết định theo đường dẫn thư mục đã chuẩn hóa. Chế độ tương tác có thể hỏi; các chế độ không tương tác `-p`, JSON và RPC dùng `defaultProjectTrust`. Giá trị mặc định `"ask"` được xử lý như trạng thái không tin cậy khi không có UI để hỏi. `--approve` và `--no-approve` ghi đè quyết định trong một lần chạy.

### `DefaultResourceLoader`: tìm kiếm, bổ sung và thay thế

[`DefaultResourceLoader`](https://github.com/earendil-works/pi/blob/107d79f11072bbc8a3a757ed7fd69596bee7d68c/packages/coding-agent/src/core/resource-loader.ts) phối hợp `SettingsManager`, `DefaultPackageManager` và việc nạp Extension, file ngữ cảnh, skill, mẫu prompt, theme cùng đầu vào system prompt.

Khi có bộ phân giải project trust, luồng `reload()` trước hết nạp tập extension ở trạng thái không tin cậy. Bước khởi tạo này gồm extension người dùng/toàn cục và extension CLI tạm thời. Sau khi bộ phân giải trả về, bộ nạp đặt `SettingsManager.projectTrusted`, nạp lại cài đặt theo trạng thái đó, phân giải package cùng tài nguyên cục bộ đã bật, nạp từng loại tài nguyên, tìm file ngữ cảnh rồi phân giải đầu vào prompt.

Các thư mục gốc của tài nguyên được xác định cụ thể:

```text
User
├─ ~/.pi/agent/{extensions,skills,prompts,themes}
└─ ~/.agents/skills

Dự án, khi project trust cho phép
├─ <cwd>/.pi/{extensions,skills,prompts,themes}
└─ <cwd hoặc thư mục cha>/.agents/skills

Đường dẫn khai báo trực tiếp
└─ additionalExtensionPaths / additionalSkillPaths /
   additionalPromptTemplatePaths / additionalThemePaths
```

Các mảng `additional*Paths` có ngữ nghĩa bổ sung. Bộ nạp hợp nhất chúng sau các đường dẫn đã bật và loại đường dẫn chuẩn hóa trùng nhau. `--no-skills` tắt skill được tự động tìm, nhưng đường dẫn skill bổ sung được khai báo tường minh vẫn được nạp. Extension có thể thêm đường dẫn tài nguyên về sau qua `extendResources()`.

Các callback có ngữ nghĩa thay thế tại ranh giới của tập hợp. `skillsOverride(base)`, `promptsOverride(base)`, `themesOverride(base)`, `agentsFilesOverride(base)` và `extensionsOverride(base)` nhận giá trị gốc đã nạp rồi trả về giá trị cuối. Chúng chỉ nối thêm nếu callback tự trả lại các mục gốc cùng phần bổ sung. `systemPromptOverride(base)` trả về chuỗi thay thế cuối; `appendSystemPromptOverride(base)` trả về mảng cuối. Vì vậy, gọi chúng là “append hook” sẽ mô tả sai API.

### Biên XML và ngữ nghĩa thay thế so với nối thêm

Nếu không có đầu vào `systemPrompt` tường minh, quá trình tìm kiếm chỉ xét `<cwd>/.pi/SYSTEM.md` khi dự án được tin cậy. Bộ nạp chọn file dự án đó nếu nó tồn tại; nếu dự án không được tin cậy hoặc file không tồn tại, bộ nạp dùng `~/.pi/agent/SYSTEM.md` làm phương án dự phòng. Chỉ một file thay thế được chọn. Tương tự, khi không có đầu vào `appendSystemPrompt` tường minh, quá trình tìm kiếm chỉ xét `.pi/APPEND_SYSTEM.md` của dự án khi dự án được tin cậy, rồi dùng file toàn cục làm phương án dự phòng. Mảng `appendSystemPrompt` tường minh bỏ qua quá trình tìm kiếm này và có thể chứa nhiều chuỗi hoặc đường dẫn file; `AgentSession` nối các giá trị đã phân giải bằng dòng trống.

`buildSystemPrompt()` áp dụng ngữ nghĩa thay thế có phạm vi hẹp cho prompt tùy chỉnh: nó thay vai trò mặc định, phần văn xuôi liệt kê Tool, hướng dẫn và khối tài liệu Pi. Phần văn bản nối thêm, file ngữ cảnh, metadata của skill hiển thị và thư mục làm việc hiện tại vẫn được thêm sau. File ngữ cảnh được bọc kèm đường dẫn:

```xml
<project_context>

Project-specific instructions and guidelines:

<project_instructions path="/workspace/AGENTS.md">
Use npm and run npm test before submitting.
</project_instructions>

</project_context>
```

XML giúp model nhìn thấy ranh giới giữa các nguồn. Nó không thực thi chỉ dẫn, không cô lập process và không cấp quyền. Chính sách runtime vẫn quản lý đường dẫn, phê duyệt, thông tin xác thực và tác dụng phụ.

### Skill nạp metadata trước, chỉ dẫn theo nhu cầu

Pi tìm skill từ thư mục gốc của người dùng, thư mục dự án được project trust cho phép, package, cài đặt và đường dẫn `--skill` tường minh. Nó tìm đệ quy các thư mục chứa `SKILL.md`, kiểm tra frontmatter, chuẩn hóa đường dẫn, cảnh báo khi trùng tên và giữ tên gặp trước.

Khi `read` đang hoạt động, `formatSkillsForPrompt()` chèn metadata hiển thị cho model thay vì toàn bộ nội dung của mọi skill:

```xml
<available_skills>
  <skill>
    <name>test-setup</name>
    <description>Run and diagnose this repository's test suites.</description>
    <location>/workspace/.agents/skills/test-setup/SKILL.md</location>
  </skill>
</available_skills>
```

Phần prompt đứng trước danh sách yêu cầu model dùng `read` khi tác vụ khớp và phân giải tham chiếu tương đối từ thư mục skill. `disable-model-invocation: true` loại skill khỏi danh sách này. Skill vẫn có thể được gọi tường minh bằng `/skill:name`.

Hai cách nạp tạo ra lịch sử khác nhau. Skill do model chọn đi vào dưới dạng kết quả Tool bình thường của `read`. `/skill:name args` đọc file trong ứng dụng, bỏ frontmatter, bọc nội dung trong `<skill name="…" location="…">`, nối đối số rồi mở rộng văn bản đó thành thông điệp của người dùng. Metadata được nạp sớm; nội dung chỉ dẫn chỉ đi vào context khi cần.

### Khung đầy đủ của system prompt

`buildSystemPrompt()` hiện tại không thêm ngày. Thứ tự cuối là:

```text
Đường mặc định
1. vai trò coding assistant
2. đoạn mô tả một dòng cho Tool đang hoạt động
3. hướng dẫn của Tool đang hoạt động + hướng dẫn về câu trả lời ngắn và đường dẫn rõ ràng
4. đường dẫn tài liệu Pi cùng quy tắc đọc
5. appendSystemPrompt, nếu có
6. các file <project_context>, theo thứ tự của bộ nạp
7. <available_skills>, chỉ khi `read` đang hoạt động và có skill hiển thị cho model
8. thư mục làm việc hiện tại

Đường dùng prompt tùy chỉnh
1. customPrompt
2. appendSystemPrompt
3. ngữ cảnh dự án
4. skill hiển thị, khi `read` được chọn
5. thư mục làm việc hiện tại
```

`AgentSession._rebuildSystemPrompt()` truyền tên, đoạn mô tả và hướng dẫn của Tool đang hoạt động, cùng giá trị prompt, file ngữ cảnh và skill từ bộ nạp. Tách khỏi phần văn xuôi đó, `Agent` mang đối tượng Tool thật trong yêu cầu Pi AI. Ranh giới này giữ schema dùng khi thực thi Tool ngoài phần văn xuôi nhưng vẫn mô tả đúng mục đích dùng Tool.

## 5. Phòng thủ lịch sử 1: compaction

Phép cắt đầu ra Tool giới hạn kết quả mới theo dòng và byte. Compaction phản ứng với context của model đã tích lũy theo token. Nó hoạt động trên nhánh phiên hiện hành, ghi bền `CompactionEntry` và tách biệt với bản chiếu `transformContext` của từng lần gọi model.

Giá trị hiện tại trong `DEFAULT_COMPACTION_SETTINGS` là `enabled: true`, `reserveTokens: 16384` và `keepRecentTokens: 20000`. Ngưỡng compaction dùng đúng điều kiện sau:

```text
contextTokens > contextWindow - reserveTokens
```

Khi có thể, `contextTokens` lấy từ số liệu `usage` hợp lệ mới nhất của assistant: `usage.totalTokens` gốc, hoặc `input + output + cacheRead + cacheWrite`. Các thông điệp sau lần đo `usage` đó được ước lượng. Đường xử lý lỗi và trường hợp mọi số liệu `usage` đều bằng 0 vẫn ước lượng phần context theo sau để không bỏ sót token. Không có phép đổi cố định từ ước lượng token này sang giới hạn Tool 50 KiB.

Kiểm tra tự động chạy tại ba ranh giới: trước một phản hồi assistant khác trong low-level Agent run, sau khi run đó đến `agent_end`, và trước khi gửi prompt mới. Có ba trường hợp: tràn ngữ cảnh có thể khôi phục bằng một lần chạy compaction rồi thử lại; phản hồi thành công nhưng vẫn tràn nên chạy compaction mà không thử lại; hoặc vượt ngưỡng và chạy compaction mà không thử lại. `AgentSession.compact()` là điểm vào thủ công riêng. Cả hai đường đều chuẩn bị đường dẫn hiện hành, cho hook `session_before_compact` quyền hủy hoặc thay kết quả, rồi mới gọi hàm compaction cấp thấp dùng chung nếu cần.

```text
các bản ghi trên nhánh hiện hành
      │
      ├─ tìm ranh giới compaction mới nhất
      ├─ đi ngược để giữ khoảng keepRecentTokens
      ├─ tóm tắt các thông điệp cũ đủ điều kiện
      └─ thêm CompactionEntry
             ├─ summary
             ├─ firstKeptEntryId
             └─ tokensBefore

lần buildSessionContext() kế tiếp
      └─ CompactionSummaryMessage + bản ghi được giữ + các bản ghi đến sau
```

Điểm cắt có thể là thông điệp của user hoặc assistant, nhưng không bao giờ là bản ghi kết quả Tool. Nếu cắt giữa một lượt, Pi ghi bản tóm tắt riêng cho phần đầu lượt. Các lần compaction sau cập nhật bản tóm tắt trước thay vì chồng lại toàn bộ lịch sử thô. [Chương 9](ch09-compaction.md) sẽ phân tích quy tắc chọn điểm cắt và bản tóm tắt có cấu trúc.

`CompactionEntry` đã được ghi bền vẫn là bản ghi phiên. `buildSessionContext()` chiếu nó thành `CompactionSummaryMessage`, bỏ các bản ghi cũ đã được tóm tắt và đưa phần đuôi gần đây vào. Sau đó `convertToLlm()` đổi role tùy chỉnh này thành thông điệp Pi AI có dạng user, nằm giữa các dấu báo dành cho bản tóm tắt compaction.

### Các điểm kiểm tra compaction giữa lượt chạy

Bên trong run có dùng Tool, vòng đời trước lần gọi provider kế tiếp có thứ tự sau:

1. Mọi Tool result trong batch đã hoàn tất được append vào lịch sử Agent và session.
2. Sau đó Pi kiểm tra ngưỡng trên context đã cập nhật.
3. Nếu vượt ngưỡng, compaction tùy chọn hoàn tất và dựng lại message của Agent.
4. Chỉ sau đó Pi mới yêu cầu phản hồi assistant kế tiếp.

Một Tool batch kết thúc mà không có message steering hoặc follow-up trong queue sẽ bỏ qua compaction giữa lượt chạy vì không có phản hồi assistant kế tiếp cần bảo vệ. Nếu message trong queue giữ loop tiếp tục, preparation hook vẫn chạy trước response đó và có thể compact lịch sử vừa lớn lên.

Đây là ba lớp bảo vệ bổ sung cho nhau: kiểm tra giữa lượt chạy ngăn Tool result lớn đi vào provider request kế tiếp, kiểm tra sau khi low-level Agent run kết thúc bắt usage cùng overflow ở cuối, còn kiểm tra trước khi gửi prompt mới bao gồm last response đã abort. Hai điểm kiểm tra sau run và trước prompt vẫn được giữ; phase mới giữa lượt chạy không thay thế chúng.

## 6. Phòng thủ lịch sử 2: bản tóm tắt nhánh tùy chọn

Phiên là một cây nối bằng quan hệ cha. Quay lại bản ghi cũ rồi tiếp tục sẽ tạo đường dẫn hiện hành từ gốc tới một nút lá khác. Lịch sử trên đường dẫn vừa rời không còn xuất hiện trên đường dẫn mới, trừ khi thao tác điều hướng mang nó sang.

```text
gốc
├─ điều tra phương án A
│  └─ tìm ra lý do A thất bại       ← nút lá cũ
└─ phương án B                       ← đường dẫn mới sau khi điều hướng
```

### Vấn đề: công việc hữu ích có thể nằm lại trên nhánh vừa rời

Chép toàn bộ đường dẫn cũ sang nhánh mới sẽ vượt các giới hạn kích thước. Bỏ hẳn có thể khiến model lặp lại thí nghiệm thất bại. `AgentSession.navigateTree(targetId, { summarize: true })` cung cấp lựa chọn thứ ba: tóm tắt các bản ghi riêng của đường dẫn vừa rời và gắn bản tóm tắt tại đích điều hướng.

Việc tóm tắt là tùy chọn. Khi `summarize` không có hoặc là false, Pi chuyển nút lá mà không tạo bản tóm tắt nhánh. Hook `session_before_tree` của Extension có thể hủy thao tác điều hướng, đổi chỉ dẫn và nhãn, hoặc cung cấp bản tóm tắt riêng khi người dùng đã yêu cầu tóm tắt.

### LCA: xác định điểm phân nhánh

`collectEntriesForBranchSummary()` tìm tổ tiên chung sâu nhất giữa nút lá cũ và đích:

```text
Mã giả, khớp với thuật toán nối bằng quan hệ cha hiện tại

oldIds = Set(getBranch(oldLeafId).map(entry => entry.id))
targetPath = getBranch(targetId)                  # gốc đứng trước
common = bản ghi sâu nhất trong targetPath cũng có trong oldIds

current = oldLeafId
while current tồn tại và current != common:
  thu thập getEntry(current)
  current = entry.parentId

đảo ngược các bản ghi đã thu thập                  # theo thứ tự thời gian
```

Đó là tổ tiên chung gần nhất (lowest common ancestor, LCA) của hai đường dẫn được chọn. Bản thân LCA không được tóm tắt. Quá trình thu thập không dừng tại ranh giới compaction cũ; bản ghi compaction hoặc bản ghi tóm tắt nhánh trên đường dẫn vừa rời vẫn đóng góp bản tóm tắt của nó vào context.

### Việc sinh bản tóm tắt dùng lại luồng compaction

Bộ tóm tắt nhánh đổi các bản ghi đủ điều kiện thành `AgentMessage`, chọn các bản ghi mới nhất trước trong hạn mức `model.contextWindow - reserveTokens`, rồi khôi phục thứ tự thời gian. Bản ghi chỉ chứa kết quả Tool bị bỏ qua khi đổi thành thông điệp, còn lời gọi Tool và dữ liệu theo dõi thao tác file giữ lại bằng chứng hữu ích.

Sau đó bộ sinh dùng `convertToLlm()`, `serializeConversation()` cùng `SUMMARIZATION_SYSTEM_PROMPT` dùng chung. Phép tuần tự hóa bọc hội thoại cũ như dữ liệu để bộ tóm tắt không tiếp tục cuộc hội thoại đó. Phần dự trữ mặc định cho nhánh là 16.384 token, cửa sổ context dự phòng là 128.000 khi model không báo, và giới hạn phản hồi branch summary hiện là 4.096 token (vẫn bị chặn bởi `model.maxTokens` dương nhỏ hơn). Thay đổi này sửa giới hạn 2.048 token trước đây, vốn có thể để lại quá ít output hiển thị sau khi reasoning dùng một phần response budget.

### Từ chối summary chưa hoàn chỉnh

Pi 0.85.0 áp dụng `getSummarizationFailure` cho history summary chính, turn-prefix summary của turn bị tách và branch summary. Khi provider trả `stopReason: "length"`, text sinh ra chưa hoàn chỉnh: Pi báo lỗi và không append hay lưu nó thành checkpoint compaction hoặc branch summary. Helper này thuộc module compaction nội bộ chứ không phải export ở package root; application quan sát failure qua result hoặc event public của compaction và navigation.

Request branch summary dùng output cap 4.096 token mới thay cho cap 2.048 token cũ. Trần lớn hơn xử lý chính xác trường hợp reasoning dùng hết allowance cũ, nhưng không chứng minh summary hoàn chỉnh: `stopReason: "length"` vẫn bị từ chối trên các đường history summary, turn-prefix summary và branch summary.

### Mẫu của nhánh khác mẫu compaction

Mẫu nhánh hiện tại yêu cầu ràng buộc và ưu tiên, ba trạng thái tiến độ, quyết định cùng bước tiếp theo. Nó không có phần `Critical Context` của compaction. Các nhãn Markdown của mẫu phải nằm trong fence dành cho bộ tóm tắt, không đi vào mục lục của trang:

```text
## Goal
[What was the user trying to accomplish in this branch?]

## Constraints & Preferences
- [Constraints or "(none)"]

## Progress
### Done
- [x] [Completed work]
### In Progress
- [ ] [Started work]
### Blocked
- [Blocking issues]

## Key Decisions
- **[Decision]**: [Rationale]

## Next Steps
1. [Next action]
```

Theo mặc định, chỉ dẫn tùy chỉnh được nối dưới nhãn `Additional focus`. `replaceInstructions: true` cho phép chúng thay mẫu. Pi thêm vào kết quả tích hợp sẵn phần mở đầu cho biết người dùng đã khám phá nhánh khác, cùng danh sách `<read-files>` và `<modified-files>` được suy ra từ hoạt động của Tool.

### Chèn bản ghi trước, chiếu thành thông điệp sau

Pi ghi bền `BranchSummaryEntry` với `parentId` là đích điều hướng, `fromId` là nút lá cũ (hoặc `"root"`), văn bản tóm tắt, `details` tùy chọn, `usage` và `fromHook`. `BranchSummaryMessage` chỉ tồn tại dưới dạng bản chiếu gửi cho model.

```text
Bản ghi phiên đã lưu bền                Bản chiếu theo từng yêu cầu
BranchSummaryEntry                      BranchSummaryMessage
├─ parentId: đích điều hướng             └─ convertToLlm()
├─ fromId: nút lá cũ                        └─ thông điệp dạng user với
├─ summary                                  tiền tố/hậu tố của bản tóm tắt nhánh
└─ details / usage / fromHook
```

`buildSessionContext()` đi trên đường dẫn hiện hành mới và đổi bản ghi tại đúng vị trí của nó. Vì vậy, bản tóm tắt được gắn vào nhánh mới, còn vị trí trên đường dẫn quyết định thứ tự của nó trong mọi context về sau.

### So sánh compaction và bản tóm tắt nhánh

| Khía cạnh | Compaction | Bản tóm tắt nhánh |
| --- | --- | --- |
| Kích hoạt | lời gọi thủ công, vượt ngưỡng hoặc khôi phục sau tràn ngữ cảnh | điều hướng cây với `summarize: true` |
| Vùng được chọn | phần cũ hơn của đường dẫn hiện hành | các bản ghi từ nút lá cũ đi ngược tới nhưng không gồm LCA |
| Context gần đây | giữ khoảng `keepRecentTokens` theo điểm cắt hợp lệ | giữ nhánh đích theo cách bình thường |
| Bản ghi lưu bền | `CompactionEntry` | `BranchSummaryEntry` |
| Bản chiếu gửi model | `CompactionSummaryMessage` | `BranchSummaryMessage` |
| Hạn mức phản hồi mặc định | tối đa `min(0.8 × reserveTokens, model.maxTokens)` | tối đa 4.096 token, bị chặn bởi `model.maxTokens` dương nhỏ hơn |
| Mục đích chính | giúp lịch sử hiện hành vừa cửa sổ | mang công việc hữu ích từ đường dẫn bị bỏ sang nhánh mới |

## 7. Luồng xử lý đầy đủ: từ tài nguyên tới lần gọi model kế tiếp

Các lớp phòng thủ xuất hiện vào những thời điểm khác nhau. Luồng sau gồm cả lượt dùng Tool bình thường lẫn phép kiểm tra có thể thay đổi context về sau:

```text
1. DefaultResourceLoader.reload()
   ├─ nạp extension người dùng/CLI để xác định project trust
   ├─ xác định trust; nạp lại cài đặt toàn cục + cài đặt dự án đủ điều kiện
   ├─ tìm tài nguyên đã bật và đường dẫn bổ sung được khai báo tường minh
   ├─ nạp file ngữ cảnh bất kể trust
   └─ phân giải SYSTEM.md / APPEND_SYSTEM.md theo quy tắc trust

2. AgentSession dựng lại system prompt
   └─ mặc định hoặc tùy chỉnh + phần nối thêm + project_context + danh sách skill + cwd

3. SessionManager.buildSessionContext()
   └─ đường dẫn hiện hành từ gốc tới nút lá, có xử lý compaction và bản tóm tắt nhánh

4. Vòng lặp Agent chuẩn bị một phản hồi của assistant
   ├─ hook ngữ cảnh Extension / transformContext: AgentMessage[] → AgentMessage[]
   ├─ convertToLlm: AgentMessage[] → Pi AI Message[]
   └─ yêu cầu Pi AI: systemPrompt + messages + schema của Tool đang hoạt động

5. Model gọi Tool
   ├─ read: quy tắc giữ head
   ├─ bash: quy tắc giữ tail của luồng đầu ra + có thể có file đầu ra đầy đủ
   └─ grep: giới hạn kết quả khớp + dòng + tổng byte

6. ToolResultMessage đi vào Agent và lịch sử phiên
   └─ Tool result hoàn tất được append trước mọi quyết định theo ngưỡng

7. Trước phản hồi assistant kế tiếp trong cùng run
   └─ kiểm tra ngưỡng có thể compact, dựng lại context rồi quay lại bước 4

8. Sau agent_end hoặc trước prompt về sau
   └─ kiểm tra ngưỡng/tràn ngữ cảnh có thể thêm CompactionEntry

9. Khi thao tác điều hướng cây về sau có summarize: true
   └─ phép chọn theo LCA có thể thêm BranchSummaryEntry tại đích
```

| Giai đoạn | Package hoặc class sở hữu | Có thay đổi trạng thái lưu bền không? |
| --- | --- | --- |
| Giới hạn byte/dòng của Tool | Phần triển khai Tool tích hợp sẵn trong Coding Agent | Kết quả Tool có giới hạn và đôi khi có file tạm chứa đầu ra đầy đủ |
| Tìm tài nguyên và đầu vào prompt | `DefaultResourceLoader` + `SettingsManager` | tập tài nguyên trong bộ nhớ; cài đặt và quyết định trust được lưu ở các file riêng |
| Chiếu đường dẫn hiện hành | `SessionManager.buildSessionContext()` | không; tạo thông điệp từ bản ghi phiên |
| Lọc theo lần gọi | Agent `transformContext` / hook `context` của Extension | không; làm việc trên bản chiếu của yêu cầu |
| Đổi role | Coding Agent `convertToLlm()` | không; tạo Pi AI `Message[]` |
| Compaction | `AgentSession` + module compaction của Coding Agent | có; thêm `CompactionEntry` |
| Bản tóm tắt nhánh | `AgentSession.navigateTree()` + bộ tóm tắt nhánh | có khi được yêu cầu; thêm `BranchSummaryEntry` |

Bảng phân định trách nhiệm này ngăn hai lỗi phổ biến: đặt compaction của phiên trong hook chỉ biến đổi context của một yêu cầu, và cho rằng kết quả Tool đã giới hạn byte đồng nghĩa toàn bộ context theo token chắc chắn vừa cửa sổ.

## 8. Bài học thiết kế

### 1. Xếp lớp phòng thủ theo dạng lỗi

Pi dùng nhiều quy tắc vì các dạng lỗi có đơn vị đo và vòng đời khác nhau: giới hạn dòng giữ đầu ra dễ đọc; giới hạn byte chặn khối dữ liệu Tool quá lớn; giới hạn token bảo vệ yêu cầu gửi model; bản chiếu đường dẫn hiện hành tôn trọng cây phiên; project trust quyết định kênh tài nguyên dự án nào được nạp khi khởi động.

Mỗi quy tắc cần một quy ước quan sát được. Kết quả Tool ghi phần nào bị bỏ và cách lấy lại; bản ghi compaction lưu ranh giới được giữ lại; bản tóm tắt nhánh ghi nơi nó đến từ; bản ghi tài nguyên mang đường dẫn nguồn. Các dấu báo này cho phép kiểm tra thao tác làm mất dữ liệu.

Mỗi điểm mở rộng tùy chỉnh vẫn chịu trách nhiệm riêng. `truncate.ts` không thể bảo vệ Tool tùy chỉnh chưa từng gọi nó, và project trust không thể cấp quyền cho đường dẫn nguy hiểm chỉ vì một chỉ dẫn yêu cầu như vậy.

### 2. Phép cộng và phép trừ cùng định hình yêu cầu

Phần văn bản nối vào system prompt, file ngữ cảnh, metadata skill, bản tóm tắt compaction và bản tóm tắt nhánh thêm thông tin có cấu trúc. Phép cắt đầu ra Tool, lựa chọn nhánh hiện hành, hook yêu cầu và compaction loại bỏ hoặc thay thế dữ liệu theo giới hạn dòng, byte, đường dẫn hiện hành hoặc token tương ứng.

Mỗi phép biến đổi phải giữ dấu vết nguồn:

```text
bản ghi nguồn
  → quy tắc chọn
  → dạng biểu diễn có giới hạn hoặc có cấu trúc
  → dấu báo nêu tên nguồn hoặc vùng bị bỏ
  → yêu cầu gửi model kế tiếp
```

Mỗi phần đầu vào được thêm sẽ dùng một phần hạn mức byte hoặc token đã xác định. Khi nội dung bị bỏ, dấu báo trong kết quả Tool hoặc metadata của bản ghi tóm tắt sẽ ghi vùng bị bỏ hay ranh giới được giữ lại. Mẫu tóm tắt giữ đường dẫn, ràng buộc, quyết định, thử nghiệm thất bại và phần việc chưa xong.

Trước khi bàn giao luồng xử lý ngữ cảnh, hãy kiểm thử năm ranh giới cụ thể:

1. Đưa vào một dòng lớn hơn giới hạn byte và đặt văn bản đa byte tại điểm cắt.
2. Tạo các chỉ dẫn toàn cục, ở thư mục cha, ở thư mục hiện tại, thay thế và nối thêm sao cho chúng xung đột; ghi lại thứ tự kết quả.
3. Lặp lại phép kiểm thử tài nguyên khi từ chối project trust; xác nhận file ngữ cảnh vẫn được nạp, còn tài nguyên dự án bị chặn khi dự án chưa được tin cậy.
4. Vượt ngưỡng token một lần bằng số liệu `usage` của provider và một lần bằng các thông điệp theo sau được ước lượng; kiểm tra ranh giới bản ghi được giữ lại.
5. Điều hướng giữa hai nút lá cùng cấp, một lần không tóm tắt và một lần có tóm tắt; kiểm tra `fromId`, `parentId` cùng thông điệp được chiếu.

### 3. Lời gọi Tool cung cấp context theo nhu cầu

Cách skill công bố dần nội dung, offset để `read` đọc tiếp, việc thu hẹp truy vấn `grep` và file đầu ra đầy đủ của Bash cùng theo một mẫu: giữ yêu cầu mặc định nhỏ và cho model cách lấy thêm dữ liệu chính xác.

```text
Đẩy mọi tài nguyên có thể cần           Công bố chỉ mục nhỏ + đường truy xuất
───────────────────────────             ────────────────────────────────
prompt cố định lớn                      tên / mô tả / vị trí của skill
phần lớn nội dung không liên quan       model chỉ chọn read khi khớp
không có quyết định truy xuất           nội dung đã lấy trở thành lịch sử có thể truy vết
```

| Khía cạnh | Đẩy sẵn | Kéo theo nhu cầu |
| --- | --- | --- |
| Chi phí token ban đầu | trả cho mọi tài nguyên | chỉ trả cho metadata |
| Lựa chọn | ứng dụng dự đoán toàn bộ mức độ liên quan | model hoặc người dùng chọn nguồn có tên |
| Dấu vết | nội dung có thể hòa vào prompt lớn | kết quả Tool hoặc lớp bọc skill ghi đường dẫn |
| Phù hợp nhất | chỉ dẫn bắt buộc, ổn định | luồng xử lý tùy chọn, file dài và thông báo chẩn đoán hiếm gặp |

Quy tắc bắt buộc vẫn nên nằm trong file ngữ cảnh hoặc system prompt. Kiến thức tùy chọn phù hợp với chỉ mục và Tool dùng để truy xuất. Khi bàn giao, cần giữ cả hai phần: phần mô tả đủ để tìm thấy và đường dẫn mà tập Tool đang hoạt động thật sự đọc được.

## 9. Trạm tiếp theo

[Chương 9](ch09-compaction.md) mở hộp đen compaction: ước lượng token, điểm cắt hợp lệ, lượt bị chia, bản tóm tắt tăng dần, theo dõi file và cách dựng lại từ `CompactionEntry`. Sau đó [Chương 10](ch10-session.md) đi theo cây phiên nối bằng quan hệ cha, nền tảng của bản chiếu đường dẫn hiện hành và bản tóm tắt nhánh dựa trên LCA.

Các tham chiếu phần triển khai của chương này được ghim theo Pi `0.85.0` tại `107d79f11072bbc8a3a757ed7fd69596bee7d68c`:

- [Phép cắt đầu ra Tool và ranh giới Unicode](https://github.com/earendil-works/pi/blob/107d79f11072bbc8a3a757ed7fd69596bee7d68c/packages/coding-agent/src/core/tools/truncate.ts)
- [Dấu tiếp tục của `read`](https://github.com/earendil-works/pi/blob/107d79f11072bbc8a3a757ed7fd69596bee7d68c/packages/coding-agent/src/core/tools/read.ts#L151-L176) và [giới hạn của `grep`](https://github.com/earendil-works/pi/blob/107d79f11072bbc8a3a757ed7fd69596bee7d68c/packages/coding-agent/src/core/tools/grep.ts#L285-L303)
- [Cách tìm file ngữ cảnh và `DefaultResourceLoader`](https://github.com/earendil-works/pi/blob/107d79f11072bbc8a3a757ed7fd69596bee7d68c/packages/coding-agent/src/core/resource-loader.ts)
- [Thư mục tài nguyên được kiểm soát theo mức tin cậy của dự án](https://github.com/earendil-works/pi/blob/107d79f11072bbc8a3a757ed7fd69596bee7d68c/packages/coding-agent/src/core/package-manager.ts) và [ranh giới trust](https://github.com/earendil-works/pi/blob/107d79f11072bbc8a3a757ed7fd69596bee7d68c/packages/coding-agent/docs/security.md)
- [Cách ghép system prompt](https://github.com/earendil-works/pi/blob/107d79f11072bbc8a3a757ed7fd69596bee7d68c/packages/coding-agent/src/core/system-prompt.ts) và [định dạng metadata của skill](https://github.com/earendil-works/pi/blob/107d79f11072bbc8a3a757ed7fd69596bee7d68c/packages/coding-agent/src/core/skills.ts#L347-L380)
- [Giá trị mặc định và ngưỡng compaction](https://github.com/earendil-works/pi/blob/107d79f11072bbc8a3a757ed7fd69596bee7d68c/packages/coding-agent/src/core/compaction/compaction.ts#L126-L237)
- [Cách thu thập và sinh bản tóm tắt nhánh](https://github.com/earendil-works/pi/blob/107d79f11072bbc8a3a757ed7fd69596bee7d68c/packages/coding-agent/src/core/compaction/branch-summarization.ts)
- [Bản chiếu ngữ cảnh của phiên](https://github.com/earendil-works/pi/blob/107d79f11072bbc8a3a757ed7fd69596bee7d68c/packages/coding-agent/src/core/session-manager.ts#L380-L469)

> **Đọc tiếp:** [Chương 9: Nén ngữ cảnh](ch09-compaction.md)
