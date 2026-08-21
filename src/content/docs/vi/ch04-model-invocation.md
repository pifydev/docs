---
title: "Chương 4: Gọi model: Một dòng, nhiều nhà cung cấp"
chapter: 4
slug: vi/ch04-model-invocation
title_zh: "第4章：模型调用: 一行代码驾驭多个模型"
title_en: "Chapter 4: Model Invocation: One Line, Many Providers"
title_vi: "Chương 4: Gọi model: Một dòng, nhiều nhà cung cấp"
source_url: https://www.dgzhuya.com/modules/ch04-model-invocation
language: vi
version_pairs: { zh: zh/src/ch04-model-invocation.md, en: en/src/ch04-model-invocation.md, vi: vi/src/ch04-model-invocation.md }
original_chars: 5321
code_lines: 138
reading_minutes: 27
translator: hypnguyen1209
reviewed_by: null
last_updated: "2026-08-20"
status: translated
official_refs: []
terms_used: []
mermaid_blocks: 0
code_blocks: 22
---

# Chương 4: Gọi model: Một dòng, nhiều nhà cung cấp

> Chương 3 đã truy vết toàn bộ hoạt động của Agent Loop. Bước then chốt nhất là "gọi model" (model invocation): vòng lặp gửi message cho LLM, nhận phản hồi, rồi quyết định tiếp tục hay dừng dựa trên phản hồi đó.
>
> Nhưng lúc đó ta đã bỏ qua chỉ bằng một dòng code:


```
const stream = streamSimple(model, context, options);
```


Dòng code này trông thì tầm thường. Nhưng nếu bạn mở thư mục `packages/ai/src/api/`, bạn sẽ thấy hàng chục file và 10 bộ translator (bản dịch) API (trong đó có một cái chuyên cho image), mỗi cái dài hơn nghìn dòng. **Ẩn sau sự đơn giản của một dòng gọi là cả một AI abstraction layer (lớp trừu tượng hóa AI) được thiết kế tỉ mỉ.**

Chương này sẽ mở tung dòng code đó ra: Pi làm sao để dùng chung một interface mà gọi được hơn 30 model khác nhau? Và nếu bạn muốn thêm một model mới, bạn cần làm gì?

---

## 1. Vấn đề: cùng một đoạn hội thoại, model khác nhau đòi format "dịch" khác nhau

Trước hết, hãy làm rõ vấn đề cần giải quyết.

Agent Loop phải gọi model, nhưng trên thị trường có hàng chục nhà cung cấp model: Anthropic (Claude), OpenAI (GPT), Google (Gemini), AWS Bedrock, Mistral... mỗi nhà đều có API spec riêng, dùng tên trường (field name) và cấu trúc dữ liệu khác nhau để mô tả cùng một thứ.

Sự khác biệt này lớn đến mức nào? Hãy xem một ví dụ đơn giản nhất. Giả sử người dùng nói với Agent:

> "Giúp tôi đọc file main.ts"

Message này được lưu trong Pi như thế này (format thống nhất):


```
{ role: "user", content: "đọc nó cho tôi main.ts", timestamp: 1748697600000 }
```


Nhưng để gửi cùng một message này cho các model khác nhau, nó phải được "dịch" (translate) sang format mà từng nhà cung cấp yêu cầu. Chỉ với một câu này thôi, bốn Provider đã đòi hỏi bốn hình dạng hoàn toàn khác nhau:

**Anthropic (Claude)**: nội dung message phải là một array, mỗi phần tử mang một trường `type`:


```
{ role: "user", content: [{ type: "text", text: "đọc nó cho tôi main.ts" }] }
```


**OpenAI (GPT)**: format trông na ná, nhưng ngữ nghĩa trường lệch rất tinh tế (ví dụ cách xử lý message tool-result hoàn toàn khác nhau):


```
{ role: "user", content: "đọc nó cho tôi main.ts" }
// Nhưng nếu thông báo chứa kết quả công cụ, OpenAI yêu cầu riêng { role: "tool" } tin tức, 
// Và Anthropic Hợp nhất các kết quả công cụ vào user trong tin nhắn
```


**Google (Gemini)**: tên trường chuyển từ `content` sang `parts`, cấu trúc phẳng hơn:


```
{ role: "user", parts: [{ text: "đọc nó cho tôi main.ts" }] }
```


**Bedrock (AWS)**: bọc thêm một lớp nữa quanh cấu trúc riêng của AWS:


```
{ role: "user", content: [{ text: "đọc nó cho tôi main.ts" }] }
// Lưu ý: Bedrock của text Không type trường, và Anthropic khác nhau
```


**Ngay cả message văn bản thuần đơn giản nhất cũng có bốn cách viết.** Tên trường khác nhau (`content` so với `parts`), cấu trúc khác nhau (có cái cần trường `type`, có cái không).

**Chú thích hình:** Phía trên là format thống nhất bên trong Pi; phía dưới, bốn card xếp cạnh nhau cho thấy cùng một message trông thế nào trong Anthropic / OpenAI / Google / Bedrock. Mỗi card tô đỏ "điểm riêng" của nhà đó ở dưới đáy: array + type, role độc lập, parts thay content, không type, v.v. Phần đáy còn liệt kê bức tranh toàn cảnh của bốn chiều khác biệt.

### Không chỉ format message: bốn chiều đều khác nhau

Format message mới chỉ là phần nổi của tảng băng. Sự khác biệt giữa các Provider trải đều khắp nơi, chủ yếu trên bốn chiều:

| Chiều | Khác ở đâu | Ví dụ |
| --- | --- | --- |
| **Format message** | Cùng một message, tên trường và cấu trúc khác nhau | Anthropic dùng `content[]`, Google dùng `parts[]` |
| **Streaming** | Cơ chế "trả về từng chữ" của model khác nhau | Anthropic gửi text SSE thô phải tự parse; SDK OpenAI trả về chunk có cấu trúc sẵn |
| **Thinking mode** | Param "bắt model suy nghĩ sâu" hoàn toàn khác nhau | Anthropic dùng `thinking.budget_tokens`, OpenAI dùng `reasoning_effort` |
| **Cache control** | Cách "đánh dấu nội dung không đổi" khác nhau | Anthropic gắn marker `cache_control`; Bedrock chèn node `cachePoint` |

Mỗi chiều đơn lẻ không phức tạp, nhưng bốn chiều nhân với hơn 30 Provider, lượng khác biệt kết hợp là rất lớn.

Bây giờ câu hỏi đặt ra: **Agent Loop chỉ có một dòng `streamSimple(model, context)`, nó không thể viết logic riêng cho từng Provider. Vậy nó đối phó với nhiều khác biệt thế này bằng cách nào?**

---

## 2. Giải pháp: kiến trúc ba lớp, mỗi lớp phụ trách một việc

Có thể bạn sẽ nghĩ đến một đáp án trực quan: bọc tất cả Provider trong một lớp để chúng trông giống nhau: cùng input, cùng output.

**Đúng rồi, Pi chính là làm vậy.** Nhưng cụ thể làm sao để "chúng trông giống nhau"? Cách của Pi là tách việc này thành ba lớp, mỗi lớp có phân công rõ ràng:


```
tầng một · lối vào thống nhất → "nhận được yêu cầu, Tìm ra người để liên lạc"
tầng hai · giao thức sự kiện → "Định dạng đầu ra được thống nhất:Bất kể ai xử lý nó, Mọi thứ tôi đưa lại trông như thế này"
tầng ba · người phiên dịch → "những người thực sự làm việc:Mỗi dịch giả thành thạo một Provider phương ngữ"
```


Hãy dùng một phép loại suy để hiểu. Hãy tưởng tượng một công ty phiên dịch quốc tế:

- **Lớp 1 (quầy lễ tân)**: khách bước vào, quầy lễ tân hỏi "bạn cần dịch sang ngôn ngữ nào?", rồi tra danh bạ tìm phiên dịch viên tương ứng và phân công việc
- **Lớp 2 (mẫu báo cáo chuẩn)**: bất kể phiên dịch viên dịch tiếng Pháp, tiếng Nhật hay tiếng Ả Rập, báo cáo cuối cùng đều phải dùng format thống nhất của công ty: bìa, nội dung, ô ký xác nhận, format cố định
- **Lớp 3 (các phiên dịch viên)**: mỗi phiên dịch viên thành thạo một ngôn ngữ; việc dịch bên trong thế nào là việc của họ, nhưng output phải tuân theo format chuẩn của Lớp 2

**Điểm mấu chốt: quầy lễ tân (Lớp 1) và phiên dịch viên (Lớp 3) kết nối qua báo cáo chuẩn (Lớp 2). Quầy lễ tân không cần biết ngoại ngữ; phiên dịch viên không cần biết quy trình công ty.**

Agent Loop chính là "khách hàng" đó: nó đưa yêu cầu cho quầy lễ tân (Lớp 1), nhận về báo cáo format chuẩn (Lớp 2), không bao giờ trực tiếp liên lạc với phiên dịch viên (Lớp 3).

**Chú thích hình:** Bốn lớp từ trên xuống dưới: khách (Agent Loop) → quầy lễ tân (`stream`) → giao thức báo cáo chuẩn (12 loại sự kiện) → các phiên dịch viên (4 Provider). Bên trái ghi "danh bạ" (registry); bên phải ghi `streamSimple` là wrapper tiện lợi của entry. Tất cả phiên dịch viên cuối cùng đều phải xuất ra event stream thống nhất trở về Agent Loop.

Bây giờ mở rộng từng lớp.

### Lớp 1: Entry thống nhất

Hàm entry tên là `stream()`, code cực kỳ đơn giản:


```
// compat.ts
export function stream(model, context, options?) {
 const provider = resolveApiProvider(model.api); // Tra cứu bảng: cái nàymodelTìm ai？
 return provider.stream(model, context, options); // Giao việc cho người phiên dịch
}
```


Chỉ hai bước: **tra bảng, phân công.** `model.api` là một chuỗi (ví dụ `"anthropic-messages"`), lúc khởi động hệ thống tất cả translator đã được đăng ký vào một "danh bạ" (bảng tra cứu).

"Danh bạ" này trông như sau:


```
const BUILTIN_APIS = [
 ["anthropic-messages", anthropicMessagesApi()], // Claude người phiên dịch
 ["openai-completions", openAICompletionsApi()], // GPT người phiên dịch
 ["google-generative-ai", googleGenerativeAIApi()], // Gemini người phiên dịch
 ["bedrock-converse-stream", bedrockConverseStreamApi()], // Bedrock người phiên dịch
 // ... Ngoài ra 5 một
];
```


Bên trái là key ("mã số nhân viên"), bên phải là translator ("nhân viên phiên dịch"). Giá trị của `model.api` chính là key: lấy key, tra bảng, tìm translator, gọi. Cả lớp entry không xử lý bất kỳ logic nghiệp vụ nào, hoàn toàn là một bộ định tuyến (router).

### Lớp 2: Event protocol (giao thức sự kiện)

Sau khi translator gửi yêu cầu cho model, model trả về nội dung theo stream ("nhổ" ra từng chữ một). Nếu mỗi translator nhổ theo cách riêng, quầy lễ tân sẽ phát điên. Vì vậy Lớp 2 quy ước một format output thống nhất.

Pi quy định: bất kể model nền tảng nào, translator phải xuất ra **event stream thống nhất**, tổng cộng có 12 loại sự kiện:


```
AssistantMessageEvent(12 loài)
│
├── start ← Dòng chảy bắt đầu
│
├── text_start → text_delta → ... → text_end ← Mô hình đang xuất văn bản
├── thinking_start → thinking_delta → ... → thinking_end ← tư duy kiểu mẫu
├── toolcall_start → toolcall_delta → ... → toolcall_end ← Công cụ gọi model
│
├── done (reason: stop / length / toolUse) ← Kết thúc bình thường
└── error (reason: error / aborted) ← đã xảy ra sự cố
```


Bạn không cần nhớ hết cả 12 loại. Chỉ cần hiểu pattern: **nội dung phản hồi của model chia thành ba loại (text, thinking, tool call), mỗi loại có "bắt đầu -> delta tăng dần -> kết thúc" ba bước, cộng thêm tín hiệu bắt đầu stream và kết thúc stream.**

Tại sao mỗi loại lại ba bước? Vì đây là streaming: translator trước tiên báo "sắp bắt đầu text" (`text_start`), rồi đẩy từng chữ một (`text_delta`, có thể rất nhiều), cuối cùng báo "text kết thúc" (`text_end`). Nhờ vậy Agent Loop có thể render từng chữ một: phản hồi AI bạn thấy nhảy ra từng chữ chính là cơ chế này.

Còn một quy ước quan trọng nữa: mỗi sự kiện đều mang theo `partial: AssistantMessage`: snapshot đầy đủ của message hiện tại. Chương 3 đã nói về "thay tại chỗ": mỗi lần nhận sự kiện, dùng `partial` ghi đè lên message cuối cùng trong context, không cần tự mình nối các delta.

### Lớp 3: Translator (Bộ dịch)

Translator mới là người làm việc thực sự. Mỗi translator tương ứng với một API (như Anthropic, OpenAI), chịu trách nhiệm dịch format thống nhất sang format riêng của Provider đó, rồi dịch phản hồi về lại event thống nhất.

Tất cả translator đều theo cùng một quy trình 5 bước:

**Chú thích hình:** Một pipeline 5 bước dọc: tạo client -> dựng param yêu cầu -> gửi yêu cầu -> xử lý stream phản hồi -> gửi sự kiện kết thúc. Bước 2 và bước 4 là nơi diễn ra công việc (viền đỏ nổi bật). Bên phải, nhánh lỗi hội tụ thành một sự kiện `error` thống nhất.

Bước 2 (dịch yêu cầu) và bước 4 (dịch phản hồi) là nơi khối lượng công việc cốt lõi nằm, cũng là lý do mỗi translator dài hơn nghìn dòng.


```
người phiên dịch(model, context, options)
│
├── 1. Tạo khách hàng
│ sử dụng API Key Khởi tạo kết nối. Giống như người dịch xác nhận rằng anh ta đã mang từ điển. 
│
├── 2. Xây dựng các tham số yêu cầu
│ tin nhắn có định dạng thống nhất, Định nghĩa công cụ, Lời nhắc hệ thống, dịch sang Provider định dạng riêng tư. 
│ Ví dụ Google muốn content → parts, Thực hiện chuyển đổi này ở bước này. 
│
├── 3. Gửi yêu cầu
│ Vượt qua SDK hoặc trực tiếp HTTP Gửi tới model. Đợi mô hình bắt đầu phản hồi. 
│
├── 4. Xử lý luồng phản hồi
│ Truyền phát mô hình trả về nội dung. Người phiên dịch Provider định dạng sự kiện riêng tư, 
│ Chuyển sang yêu cầu cấp độ thứ hai 12 sự kiện thống nhất. 
│
└── 5. Gửi sự kiện chấm dứt
 sự thành công → push done; thất bại → push error. Luồng phải được chấm dứt. 
```


Lấy Anthropic làm ví dụ, quy tắc dịch ở bước 4 (dịch tên sự kiện riêng của Anthropic sang tên sự kiện thống nhất của Pi):


```
Anthropic sự kiện riêng tư → Pi sự kiện thống nhất
───────────────── ────────────
content_block_start (type: "text") → text_start
content_block_delta (text_delta) → text_delta
content_block_start (type: "tool_use") → toolcall_start
content_block_delta (input_json) → toolcall_delta
message_delta (stop_reason) → done(Lý do chấm dứt ánh xạ)
```


Chú ý cách ánh xạ stop-reason: Anthropic's `"end_turn"` -> Pi's `"stop"`, `"tool_use"` -> `"toolUse"`. Mỗi Provider đặt tên khác nhau, Pi thống nhất thành từ vựng riêng của mình. Chương 3 đã nói Agent Loop kiểm tra `stopReason` để quyết định có tiếp tục vòng lặp không: những giá trị đó chính là thuật ngữ thống nhất sau khi qua lớp dịch này.

### StreamFunction: "Yêu cầu nhập môn" của translator

Để kiến trúc ba lớp vận hành được, có một điều kiện tiên quyết: **tất cả translator phải tuân theo cùng một bộ quy tắc.** Pi dùng một kiểu TypeScript để định nghĩa bộ quy tắc này: nó tên là `StreamFunction`, "hiến pháp" của cả lớp trừu tượng:


```
export type StreamFunction<TApi extends Api, TOptions> = (
 model: Model<TApi>, // Nên sử dụng mô hình nào
 context: Context, // bối cảnh hội thoại(Lời nhắc hệ thống + tin tức + Công cụ)
 options?: TOptions, // Cấu hình tùy chọn(mức độ tư duy, Bộ nhớ đệm, v.v.)
) => AssistantMessageEventStream; // ← Phải trả về luồng sự kiện hợp nhất
```


Chữ ký này định nghĩa ba quy tắc:

1. **Input giống nhau**: tất cả translator nhận cùng ba tham số (model, context, options)
2. **Output giống nhau**: phải trả về `AssistantMessageEventStream`: bất kể tầng dưới là SSE thô hay SDK stream, kiểu bên ngoài là kiểu này
3. **Lỗi không ném exception**: khi gọi API thất bại, không `throw`; mà phát ra một sự kiện `{ type: "error" }`

Quy tắc 3 phản ánh nguyên tắc "không bao giờ ném" của Chương 3. Nhắc lại: `stopReason: "error"` và `"aborted"` được nói đến trong Chương 3 không phải do model trả về: chúng được **tiêm vào bởi khối catch của translator khi có ngoại lệ**. Cụ thể, translator gói ngoại lệ thành một sự kiện `error` rồi đẩy vào event stream. Agent Loop nhận được dùng chung cơ chế xử lý thành công và thất bại; vòng lặp không bao giờ bị ngoại lệ làm đứt.

Với bộ quy tắc StreamFunction, "quầy lễ tân" (Lớp 1) có thể yên tâm phân công cho bất kỳ translator nào: vì họ đảm bảo cùng format input, cùng format output, cùng cách xử lý lỗi.

---

## 3. Cách dùng: từ gọi đến thêm model mới

Đã hiểu kiến trúc ba lớp, giờ xem cách dùng thực tế. Hai kịch bản: **cách gọi** một model có sẵn, và **cách thêm** một model mới.

### Kịch bản 1: Gọi model

Agent Loop thực ra không gọi `stream()`, mà gọi `streamSimple()`. Tại sao có hai phiên bản?

`stream()` là entry cấp thấp: nó chỉ làm "tra bảng + phân công", không xử lý dịch thinking level. `streamSimple()` bọc thêm một lớp tiện ích quanh `stream()`: tự động xử lý dịch thinking level (ThinkingLevel), tự động điều chỉnh giới hạn token, v.v. Nói ngắn gọn:

- **`stream()`**: cấp thấp nhất, không có tiện ích. Dùng trực tiếp thì bạn phải tự xử lý nhiều chi tiết dịch
- **`streamSimple()`**: giúp xử lý sẵn dịch thinking level v.v., là entry thực tế dùng trong phát triển

Code điển hình của Agent Loop dùng `streamSimple()`:


```
const stream = streamSimple(model, context, { reasoning: "high" });
// ↑ kể nó đi"Suy nghĩ ở cấp độ cao hơn"
// streamSimple sẽ được tự động dịch sang từng Provider Các thông số cụ thể của

for await (const event of stream) {
 // Sự kiện sẽ đến theo thứ tự: 
 // start → thinking_start/delta/end → text_start/delta/end → done
 switch (event.type) {
 case "text_delta":
 // tăng văn bản, hiển thị tới thiết bị đầu cuối
 break;
 case "toolcall_end":
 // Công cụ gọi model, Nhận thông tin cuộc gọi công cụ đầy đủ
 break;
 case "done":
 // Vòng gọi mô hình này kết thúc, nhìn stopReason Quyết định có tiếp tục lặp hay không
 break;
 case "error":
 // đã xảy ra sự cố(Hết thời gian chờ mạng, APILỗi vv.), errorReason Có "error" hoặc "aborted"
 break;
 }
}
```


**Agent Loop không cần quan tâm model nền tảng là gì.** Dù model là Claude, GPT hay Gemini, `streamSimple` trả về cùng một kiểu event stream, cách tiêu thụ hoàn toàn giống nhau.

### Kịch bản 2: Thêm một model mới

Giả sử bạn muốn thêm một model mới mà Pi chưa hỗ trợ: ví dụ một large model nội địa nào đó. Bạn cần làm gì?

**Ba bước**, mỗi bước tương ứng với một lớp trong ba lớp ở trên:

**Bước 1: Viết một translator** (tương ứng Lớp 3)

Bản chất của translator là một hàm khớp với chữ ký `StreamFunction`. Bạn cần:

- Dịch format message thống nhất của Pi sang format API của model bạn (chiều yêu cầu)
- Dịch phản hồi streaming của model bạn sang 12 sự kiện thống nhất của Pi (chiều phản hồi)
- Khi có ngoại lệ, đừng `throw`; hãy push một sự kiện `error`

Bước này là nhiều việc nhất: bạn cần đọc tài liệu API của model, hiểu format message, giao thức streaming, mã lỗi. Nhưng đây là "công việc một lần": viết xong là không cần đụng lại nữa.

**Bước 2: Đăng ký translator** (tương ứng Lớp 1):


```
registerApiProvider({
 api: "your-model-api", // Đặt tên cho người dịch của bạn
 stream: yourStreamFunction, // Người dịch do bạn viết
 streamSimple: yourSimpleFunction, // Phiên bản tiện lợi
});
```


Bước này chỉ là thêm một bản ghi vào "danh bạ". Sau khi hệ thống khởi động, `resolveApiProvider()` của Lớp 1 có thể tìm được translator của bạn.

**Bước 3: Cấu hình thông tin model**:


```
const yourModel: Model = {
 id: "your-model-id",
 api: "your-model-api", // ← Chỉ vào 2 tên đăng ký
 provider: "your-provider",
 baseUrl: "https://api.your-model.com",
 // ... Siêu dữ liệu khác(kích thước cửa sổ ngữ cảnh, Liệu nó có hỗ trợ suy nghĩ, v.v.)
};
```


Bước này báo cho hệ thống biết "có một model như thế này". Trường `api` trỏ đến tên đã đăng ký ở bước 2, Lớp 1 tra bảng định tuyến dựa trên trường này.

**Xong.** Agent Loop không cần sửa một dòng nào. Hệ thống sự kiện, quản lý phiên, thuật toán nén: tất cả tự thích ứng. Đây là giá trị của kiến trúc ba lớp: **chi phí thêm model mới được giới hạn ở một điểm duy nhất: "viết một translator": không cần đụng vào bất kỳ chỗ nào khác.**

---

## 4. [Nâng cao] Bên trong translator: SSE parsing và các dialect của thinking mode

> Ba phần trước đã bao quát thiết kế cốt lõi của AI abstraction layer. Phần sau là chi tiết kỹ thuật triển khai: nếu bạn không cần tự viết translator, có thể bỏ qua phần này.

### Streaming: Tại sao Anthropic và OpenAI lại parse khác nhau hoàn toàn?

Chương 3 đã nói: phản hồi của model là streaming: "nhổ ra" từng chữ một. Nhưng "nhổ thế nào" mỗi nhà mỗi khác:

**SDK của OpenAI** đóng gói rất tốt. Bạn gọi `client.chat.completions.create()`, nó trả về thẳng một stream chunk có cấu trúc. `choices[0].delta` của mỗi chunk là dữ liệu đã parse xong, lấy ra dùng luôn.

**Anthropic** trả về text stream SSE (Server-Sent Events) thô. Bạn phải tự đọc từng dòng trường `event:` và `data:`, tự làm JSON parsing (kèm dung sai: JSON của một số chunk có thể chưa đầy đủ).


```
Anthropic liên kết phân tích cú pháp(Người dịch tự mình làm công việc bẩn thỉu): 
 nguyên bản HTTP phản ứng → Đọc từng dòng → sự chia ly event và data → JSON phân tích cú pháp(Chứa khả năng chịu lỗi) → sự kiện nội bộ

OpenAI liên kết phân tích cú pháp(SDK Việc bẩn thỉu có giúp ích gì cho bạn không): 
 client.chat.completions.create() → Trả lại trực tiếp AsyncIterable<Chunk> → Đó là dữ liệu có cấu trúc
```


**Tại sao không dùng một SDK thống nhất?** Vì không phải Provider nào cũng có SDK trưởng thành. Có SDK không hỗ trợ streaming, có SDK không hỗ trợ custom event. Chiến lược của Pi: có SDK thì dùng (OpenAI, Google), không có thì tự parse (Anthropic). Nhưng bất kể triển khai bên trong thế nào, cuối cùng đều dịch thành 12 sự kiện thống nhất.

### Thinking mode: bốn kiểu "suy nghĩ", bốn tham số

Các Provider khác nhau có khái niệm và tham số hoàn toàn khác nhau cho chuyện "bắt model suy nghĩ sâu":


```
// Anthropic: cho một cái token ngân sách, Hãy để mô hình suy nghĩ trong phạm vi ngân sách này
params.thinking = { type: "enabled", budget_tokens: 16384 };

// OpenAI: Đưa ra một mức độ nỗ lực(low/medium/high)
params.reasoning_effort = "high";

// Google: sử dụng thinkingConfig Cấu hình
config.thinkingConfig = { includeThoughts: true, thinkingLevel: "high" };
```


Ngay cả Anthropic cũng có hai chế độ: model mới dùng "adaptive thinking" (model tự quyết định suy nghĩ bao nhiêu), model cũ dùng "budget thinking" (giới hạn token cố định).

### Pi thống nhất thế nào: thang ThinkingLevel 5 cấp

Pi định nghĩa một enum cấp độ suy nghĩ thống nhất:

**Chú thích hình:** Trục trên cùng hiển thị sáu cấp off / minimal / low / medium / high / xhigh, mỗi cấp ghi chú trần token. Bên dưới là cách "high" của ba Provider ánh xạ sang tham số khác nhau. Phần đáy hiển thị chiến lược clamp: trước tìm lên, không thấy thì tìm xuống.


```
 off minimal low medium high xhigh
 │ │ │ │ │ │
 không suy nghĩ 1024 tk 2048 tk 8192 tk 16384 tk mô hình tối đa
```


Code tầng trên chỉ cần ghi `reasoning: "high"`, translator tự tra bảng dịch sang tham số riêng của từng Provider. Mỗi object `Model` tự mang theo một `thinkingLevelMap` (bảng dịch), khai báo "với model của tôi, mỗi cấp tương ứng tham số gì".

Nếu cấp được yêu cầu model không hỗ trợ (ví dụ yêu cầu `xhigh` nhưng chỉ hỗ trợ tới `high`), hàm `clampThinkingLevel()` thực hiện fallback: **trước tìm lên** (suy nghĩ nhiều thường an toàn hơn suy nghĩ ít), không thấy thì tìm xuống.

`streamSimple()` chính là hàm tiện ích giúp bạn hoàn tất tự động phần dịch này: tra bảng + clamp + điều chỉnh `maxTokens`, rồi gọi `stream()` bên dưới.

---

## 5. [Nâng cao] Cache control và xử lý lỗi

### Cache control: Cho model "tính ít đi"

Hội thoại của Agent là "có trạng thái": mỗi lượt đều gửi toàn bộ lịch sử trước đó cho model. Nếu bạn chat với Agent 50 lượt, mỗi lượt đều tính lại nội dung 49 lượt trước. Cache nói với server model: "nội dung này không đổi, đừng tính lại."

Nhưng "đánh dấu thế nào" mỗi Provider khác nhau: Anthropic gắn marker `cache_control` lên khối message, Bedrock chèn một node `cachePoint` độc lập.

Pi trừu tượng hóa cache control thành ba cấp ngữ nghĩa:


```
type CacheRetention = "none" | "short" | "long";
```


Code tầng trên chỉ cần nói "tôi muốn cache long", translator tự dịch sang cách đánh dấu riêng của từng Provider. Đây cùng một kiểu "enum thống nhất + bảng dịch từng nhà" như ThinkingLevel, nhưng thú vị hơn: **bốn nhà có tư duy thiết kế hoàn toàn khác nhau cho chuyện "đánh dấu nội dung không đổi"**. Bảng so sánh trong source code đại khái thế này:

| Provider | `none` | `short` | `long` | Vị trí đánh dấu |
| --- | --- | --- | --- | --- |
| **Anthropic** | không đánh dấu | `cache_control: { type: "ephemeral" }` (mặc định TTL 5 phút) | thêm `ttl: "1h"` (chỉ model mới hỗ trợ) | cuối system + tool cuối + user message cuối (rolling) |
| **Bedrock** | không chèn node | chèn object độc lập `{ cachePoint: { type: DEFAULT } }` | thêm `ttl: ONE_HOUR` | sau khối system + sau message cuối |
| **OpenAI Responses** | không gửi cache key | gửi `prompt_cache_key: sessionId` | thêm `prompt_cache_retention: "24h"` | không đánh dấu: OpenAI tự khớp theo prefix session key |
| **OpenAI compatible (DeepSeek/Qwen v.v.)** | không đánh dấu | đánh dấu `cache_control` kiểu Anthropic | thêm `ttl: "1h"` (nếu hỗ trợ) | dùng lại ba vị trí của Anthropic |

Tham chiếu source: ba điểm đánh dấu của Anthropic tại [anthropic-messages.ts:922/929/938](https://github.com/earendil-works/pi/blob/main/packages/ai/src/api/anthropic-messages.ts#L922) + [L1208](https://github.com/earendil-works/pi/blob/main/packages/ai/src/api/anthropic-messages.ts#L1208) + [L1157](https://github.com/earendil-works/pi/blob/main/packages/ai/src/api/anthropic-messages.ts#L1157); `cachePoint` của Bedrock tại [bedrock-converse-stream.ts:696/885](https://github.com/earendil-works/pi/blob/main/packages/ai/src/api/bedrock-converse-stream.ts#L696); `prompt_cache_key` của OpenAI Responses tại [openai-responses.ts:229](https://github.com/earendil-works/pi/blob/main/packages/ai/src/api/openai-responses.ts#L229).

Đây là một điểm đáng dừng lại suy nghĩ: cùng nói "báo cho server đoạn này không đổi", nhưng bốn nhà đưa ra **bốn thiết kế giao thức hoàn toàn khác nhau** :

- **Cách của Anthropic giống như "dán giấy nhớ"**: gắn thêm trường `cache_control` lên khối nội dung có sẵn. Nội dung vẫn là nội dung đó, chỉ thêm một nhãn "đoạn này không đổi"
- **Cách của Bedrock giống như "cắm biển chỉ đường"**: chèn một object `cachePoint` độc lập, không chứa dữ liệu nghiệp vụ, tại vị trí cụ thể trong stream message. Nó không bám vào nội dung nào, chính nó là chỗ đánh dấu
- **Cách native của OpenAI giống như "tra theo thẻ thành viên"**: bạn không đánh dấu gì cả, chỉ kèm `prompt_cache_key` (Pi dùng `sessionId` làm key) trong mỗi yêu cầu, backend OpenAI tự nhận diện độ trùng prefix
- **Các vendor OpenAI-compatible thì ngây thơ nhất**: sao chép nguyên giao thức giấy nhớ của Anthropic (`cacheControlFormat: "anthropic"`), nên Pi dùng chung hàm `applyAnthropicCacheControl` để xử lý chúng

Chương 3 đã bàn "tại sao Pi mỗi vòng dựng lại `llmContext` mà không phá cache": câu trả lời nằm trong bảng này. Một khi `cacheRetention` được đặt, mỗi vòng trong Trace đều dùng cùng chiến lược và cùng dấu (nội dung system/tools không đổi, user message là rolling). Backend Anthropic khớp prefix theo byte nội dung: trúng là trúng, không liên quan "bạn đang gọi vòng thứ mấy".

**Tại sao Anthropic chọn ba vị trí cụ thể để đánh dấu?** Không phải chọn bừa: `system + tools` là phần prefix ổn định nhất trong Trace, `user message cuối` là "đường cắt" rolling. Anthropic quy định tối đa 4 cache breakpoint mỗi yêu cầu; ba vị trí này phủ hai đoạn "hoàn toàn không đổi + rolling gần nhất", là nghiệm tối ưu vừa tối đa lợi ích vừa không vượt giới hạn.

Giá trị kinh tế của cache rất cao: token trúng cache tính theo giá đọc cache, thường bằng 1/10 giá input thường. Lịch sử hội thoại 200K token sau khi cache có thể tiết kiệm khoảng 90% chi phí input.

### Xử lý lỗi: Mã hóa vào stream, không làm đứt vòng lặp

Xử lý lỗi của tất cả translator đều theo cùng một pattern:


```
try {
 // ... quá trình bình thường: Yêu cầu xây dựng, gửi, Phân tích phản hồi
 stream.push({ type: "done", reason: output.stopReason, message: output });
} catch (error) {
 // Lỗi không được ném, Thay vào đó, nó được mã hóa thành luồng
 output.stopReason = options?.signal?.aborted ? "aborted": "error";
 output.errorMessage = error.message;
 stream.push({ type: "error", reason: output.stopReason, error: output });
}
```


**Đây chính là nơi Chương 3 nói `stopReason: "error"` và `"aborted"` được tiêm vào.** Bản thân API model không trả về hai giá trị này: chúng được đặt bởi khối catch của translator khi có ngoại lệ. Có thể là timeout mạng, có thể API Key hết hạn, có thể người dùng chủ động hủy. Bất kể nguyên nhân gì, ngoại lệ đều được gói thành sự kiện, Agent Loop nhận được có thể thử lại, giảm cấp, hoặc báo cho người dùng, vòng lặp không dừng.

Còn một vấn đề ẩn: **tràn context (context overflow)**. Đôi khi yêu cầu không lỗi, nhưng model trả về output rỗng: vì input có quá nhiều token và bị server âm thầm cắt bớt. Pi có hàm `isContextOverflow()` làm phát hiện ba lớp (so mẫu thông báo lỗi, so sánh số token, output bằng không + stop `length`), để thống nhất bắt các biểu hiện tràn khác nhau của các Provider.

---

## 6. Quay lại dòng code đó

Quay lại câu hỏi ban đầu: đằng sau dòng code `streamSimple(model, context)` đã xảy ra những gì?

Tóm gọn một câu: **Agent Loop nói "dùng model này xử lý đoạn hội thoại này", quầy lễ tân tra ra cần tìm translator nào, translator dịch yêu cầu sang format của Provider rồi gửi cho model, sau đó dịch phản hồi streaming của model về thành sự kiện thống nhất: Agent Loop từ đầu đến cuối chỉ nhìn thấy event stream thống nhất, không biết giữa chừng đã diễn ra bao nhiêu lần dịch.**


```
Agent Loop: streamSimple(model, context, { reasoning: "high" })
 │
 │ ① streamSimple Xử lý dịch cấp độ tư duy(Tra cứu bảng → clamp → điều chỉnhmaxTokens)
 │
 │ ② gọi stream() → Kiểm tra bàn ở quầy lễ tân → tìm người phiên dịch
 │
 │ ③ công việc phiên dịch: 
 │ · định dạng thống nhất → Provider định dạng riêng tư(Yêu cầu dịch)
 │ · Gửi tới model
 │ · Provider phản hồi riêng tư → 12sự kiện thống nhất(dịch đáp ứng)
 │
 │ ④ Trở lại AssistantMessageEventStream
 │
 └── Agent Loop: for await (event of stream) { ... } ← sự kiện thống nhất tiêu thụ
```


**Agent Loop chỉ nhìn thấy ④: một event stream sạch sẽ.** Đây là sức mạnh của kiến trúc ba lớp: độ phức tạp được đóng gói bên trong translator, interface bên ngoài vẫn gọn gàng.

### Tinh hoa thiết kế

Ba ý tưởng cốt lõi đáng mang đi:

**1. Phương pháp thiết kế "giao thức > cài đặt".** Pi không thiết kế một class trừu tượng `BaseProvider` để mọi translator kế thừa, mà định nghĩa một bộ event protocol (12 sự kiện) và một chữ ký hàm (`StreamFunction`). Tại sao không kế thừa? Vì translator gần như không có điểm chung: kế thừa đòi hỏi tìm code chung, nhưng Anthropic và Google ngay cả tên trường cho "gửi message" cũng khác nhau. Giao thức chỉ quy ước "input gì, output gì", không quan tâm giữa chừng xử lý ra sao.

**2. Chiến lược "enum thống nhất + bảng ánh xạ".** ThinkingLevel là enum thống nhất (5 cấp), `ThinkingLevelMap` để mỗi Model tự mang theo bảng dịch của mình. Tầng trên nói `"high"`, tầng dưới tự tra bảng. Linh hoạt hơn "lấy giao của mọi Provider" (giao có khi chỉ còn `"off"`), và gọn hơn "phơi bày tham số riêng của từng Provider" (tầng trên không cần biết 20 tên tham số).

**3. "Ngữ nghĩa thống nhất, cài đặt phân tán".** `cacheRetention` (none / short / long) là interface ngữ nghĩa: tầng trên nói "tôi muốn cache dài hạn", không quan tâm tầng dưới đánh dấu hay chèn node. Interface ngữ nghĩa mô tả "làm gì", interface cơ chế mô tả "làm thế nào".

---

## 7. Trạm tiếp theo

Tầng AI đóng gói khác biệt giữa các model sạch sẽ: Agent Loop không biết model nền tảng là gì.

Nhưng Agent "làm việc" thế nào? Model trả về `ToolCall`, ai thực thi? Trong quá trình thực thi, làm sao đảm bảo tham số đúng (model có thể truyền tham số sai kiểu), làm sao đảm bảo an toàn (model có thể yêu cầu thực thi lệnh nguy hiểm)? Chương 3 đã bỏ qua quá trình này như một hộp đen.

Chương sau, ta mở hộp đen này: hệ thống tool.

---

> **Chỉ mục source chính của chương này**:
> 
> `packages/ai/src/compat.ts:237-247`: entry `stream()` (Lớp 1 · cấp thấp)
> `packages/ai/src/compat.ts:258-268`: entry `streamSimple()` (Lớp 1 · wrapper tiện lợi)
> `packages/ai/src/compat.ts:172-206`: đăng ký Provider ("danh bạ")
> `packages/ai/src/types.ts:304-308`: chữ ký `StreamFunction` ("hiến pháp")
> `packages/ai/src/types.ts:453-465`: 12 `AssistantMessageEvent` (Lớp 2 · event protocol)
> `packages/ai/src/api/anthropic-messages.ts`: Anthropic translator (Lớp 3 · khung 5 bước)
> `packages/ai/src/api/openai-completions.ts`: OpenAI translator
> `packages/ai/src/types.ts:74-76`: `ThinkingLevel` / `ThinkingLevelMap`
> `packages/ai/src/models.ts:410-429`: chiến lược fallback `clampThinkingLevel`
> `packages/ai/src/utils/overflow.ts:126-155`: phát hiện ba lớp `isContextOverflow`

