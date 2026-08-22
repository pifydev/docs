---
title: 'Chương 3: Agent Loop: Động cơ quay mô hình'
translation_key: ch03-agent-loop
language: vi
chapter: 3
source_url: 'https://www.dgzhuya.com/modules/ch03-agent-loop'
official_refs: []
terms_used: []
status: translated
last_updated: '2026-08-20'
translator: hypnguyen1209
reviewed_by: null
code_blocks: 37
code_lines: 385
mermaid_blocks: 0
---
> Chương trước đã xem kiến trúc phân lớp của Pi. Kiến trúc chỉ là "bộ xương": sức sống thật sự của một Agent đến từ "vòng lặp" (loop). Chương này, ta bắt đầu từ những câu hỏi cơ bản nhất: **tại sao cần vòng lặp? nó quay như thế nào? khi nào dừng?** Rồi ta truy vết hành trình đầy đủ của một message người dùng để thấy từng nhịp đập của Agent Loop.

---

## 1. Mở đầu: ba cách dùng LLM

Trước khi bàn về Agent Loop, ta lùi một bước xem bản thân việc "dùng LLM" có bao nhiêu kiểu. Điều này rất quan trọng để hiểu "tại sao cần vòng lặp".

### Kiểu 1: gọi trực tiếp: "model, trả lời đi"

Cách dùng nguyên thủy và trực quan nhất. Bạn dựng prompt, gọi API một lần, lấy kết quả, xong.

```
đầu vào của người dùng → Xây dựng các từ gợi ý → gọi model → Đầu ra mô hình → hiển thị kết quả
```


Code kiểu thế này:


```
const response = await llm.chat({
 messages: [
 { role: "system", content: "Bạn là trợ lý dịch thuật" },
 { role: "user", content: "Dịch mã này sang Python" },
 ],
});
console.log(response.content);
```


**Công việc cốt lõi là "dựng prompt" (build the prompt).** Prompt tốt thì kết quả tốt. Một lần gọi, một lần output, không qua lại.

Tình huống áp dụng: dịch, tóm tắt, hỏi đáp, hoàn thiện code: bất cứ thứ gì "một câu hỏi một câu trả lời" xử lý được.

### Kiểu 2: Workflow: "model, làm bước một trước; tôi kiểm tra, rồi làm bước hai"

Khi task phức tạp lên, bạn thấy khó có kết quả tốt trong một lần. Vậy là bạn chia task lớn thành nhiều bước, mỗi bước gọi model một lần, giữa các bước **code của bạn** điều khiển luồng.

```
đầu vào của người dùng → [bước1: Phân tích mô hình điều chỉnh] → [mã của bạn: Trích xuất thông tin chính]
 → [bước2: Điều chỉnh dự thảo tạo mô hình] → [mã của bạn: Kiểm tra chất lượng]
 → [bước3: Điều chỉnh và đánh bóng mô hình] → đầu ra cuối cùng
```


Mỗi bước model chỉ làm phần việc của mình, **quyền quyết định nằm trong tay bạn**: bạn biết khi nào nên sang bước tiếp; model chỉ là một mắt xích trên dây chuyền.

Tình huống áp dụng: pipeline tạo tài liệu, tự động review code, RAG (Retrieval-Augmented Generation: sinh tăng cường truy xuất).

### Kiểu 3: Agent Loop: "model, tự quyết đi"

Ở chế độ Agent, bạn giao quyền quyết định cho model.

```
đầu vào của người dùng → gọi model → Model nói"Tôi cần đọc một tập tin" → Thực hiện đọc file → Làm mẫu để xem kết quả
 → Model nói"Vẫn cần tìm kiếm mã" → Thực hiện tìm kiếm → Làm mẫu để xem kết quả
 → Model nói"tôi biết, Câu trả lời là..." → đầu ra → kết thúc
```


Khác biệt cốt lõi: luồng giữa các bước không còn do bạn viết cứng nữa; nó được dẫn dắt bởi nội dung output của model. Code của bạn chỉ làm hai việc:

1. Đưa input người dùng và kết quả thực thi tool cho model
2. Nếu output của model có chứa yêu cầu gọi tool, thì thực thi nó; nếu không, coi như task xong

Còn gọi tool nào, gọi mấy lần: những thứ đó do nội dung output model quyết. Khi nào dừng: đây là quy tắc do con người định nghĩa: khi một lần output của model không còn chứa lệnh gọi tool, ta coi như vòng lặp kết thúc.

Bảng so sánh làm rõ ba kiểu:

| Chiều | Gọi trực tiếp | Workflow | Agent Loop |
| --- | --- | --- | --- |
| Người quyết định | Người dùng | Code của bạn | Model |
| Số lần gọi model | 1 | N (do code kiểm soát) | Không chắc (do model kiểm soát) |
| Việc cốt lõi | Viết prompt | Thiết kế flow | Định nghĩa tool và vòng lặp |
| Vai trò model | Người thi hành | Mắt xích pipeline | Người quyết định tự chủ |
| Tình huống điển hình | Dịch, tóm tắt | Pipeline tài liệu, RAG | Trợ lý lập trình, tự động hóa task |

---

## 2. Hai khái niệm cần nắm trước: Trace và Turn

Trước khi đào sâu source, có hai khái niệm bắt buộc phân biệt. Chúng hay bị dùng lẫn, nhưng trong code Pi mỗi cái có nghĩa chính xác riêng.

### Trace (một lần chạy đầy đủ)

Trace là toàn bộ quá trình từ lúc người dùng nhấn Enter, cho đến khi Agent dừng hẳn và phát ra sự kiện agent_end. Một Trace gồm nhiều Turn.

```
một Trace(một lần agent_start Đến agent_end)
│
├── Turn 1: gọi model → Trả về mô hình toolUse(để đọc tập tin)→ thi hành read Công cụ
│
├── Turn 2: gọi model bằng kết quả công cụ → Trả về mô hình toolUse(Cần thay đổi tập tin)→ thi hành edit Công cụ
│
└── Turn 3: gọi model bằng kết quả công cụ → Trả về mô hình stop(Đã thay đổi, Không có cuộc gọi công cụ)→ agent_end
```


### Turn (một vòng)

Định nghĩa của Turn rất chính xác: một lần gọi model + tất cả tool execution được kích hoạt bởi lần gọi đó.

Mỗi Turn được bọc bởi một cặp sự kiện turn_start và turn_end. Điểm mấu chốt: một Turn chỉ có đúng một lần gọi model. Model trả về toolUse, thực thi cụm tool đó, phát turn_end, Turn này kết thúc. Lấy kết quả tool feed lại để gọi model lần nữa: đó là Turn tiếp theo.

Đọc code sẽ thấy rõ hơn. Cấu trúc mỗi vòng của inner loop (sẽ nói kỹ sau):

```
while (hasMoreToolCalls || ...) {
 if (!firstTurn) emit(turn_start); // ← mới Turn bắt đầu

 Quy trình pendingMessages
 streamAssistantResponse() // ← một cuộc gọi mẫu
 Kiểm tra stopReason
 executeToolCalls() // ← thực hiện điều này Turn Một loạt công cụ được kích hoạt
 emit(turn_end); // ← cái này Turn kết thúc

 prepareNextTurn / shouldStopAfterTurn / Kiểm tra steering
}
```


Một vòng inner loop = một Turn = một turn_start → một lần gọi model → thực thi tool → một turn_end.

Nếu model trong một Turn gọi một lúc 3 tool (read + grep + find), thì cả 3 tool đó đều chạy trong cùng Turn: vì chúng đều là sản phẩm của cùng một lần gọi model. Nhưng khoảnh khắc kết quả được feed lại và model được gọi tiếp, ta đã ở Turn tiếp theo rồi.

### Vậy quan hệ giữa Trace và Turn là

```
Trace(một lần chạy hoàn chỉnh)
│ agent_start
│
├── Turn 1
│ │ turn_start
│ ├── gọi model → toolUse → Công cụ thực thi(read + grep)
│ │ turn_end
│ │
├── Turn 2
│ │ turn_start
│ ├── gọi model → toolUse → Công cụ thực thi(edit)
│ │ turn_end
│ │
├── Turn 3
│ │ turn_start
│ ├── gọi model → stop → không có công cụ
│ │ turn_end
│ │
│ agent_end
```

## 3. Toàn cảnh: hành trình một message, và vòng lặp quay ra sao

### Flow toàn cảnh


> Lưu ý: turn_start của Turn đầu tiên được phát ra ngay ở đầu vào runAgentLoop(), sau đó bên trong runLoop() dùng cờ firstTurn để bỏ qua turn_start ở vòng đầu, tránh phát trùng.

Mô tả hình: vỏ ngoài Trace bao 3 Turn; mỗi Turn là vòng kín gọi model + thực thi tool. Lưu ý Turn 3 không có ToolCall (khung nét đứt); stopReason = stop của nó kích hoạt vòng lặp thoát ra.

```
Bạn nhấn enter: "đọc nó cho tôi src/main.ts"
│
│ ① Đầu vào của bạn sẽ trở thành một tin nhắn
│
UserMessage { role: "user", content: "đọc nó cho tôi src/main.ts" }
│
│ ② nhập vòng lặp(agentLoop lối vào): agent_start(một Trace bắt đầu)
│
└── runLoop()
 │
 │ ③ chuyển đổi tin nhắn(AgentMessage → LLM người quen Message)
 │
 │ ┌── Turn 1 ──────────────────────────────────────────┐
 │ │ turn_start │
 │ │ ④ gọi Model(mỗi Turn Chỉ có một cuộc gọi mẫu) │
 │ │ streamSimple(model, { systemPrompt, messages }) │
 │ │ ↓ đuổi theo token Truyền phát trở lại │
 │ │ AssistantMessage { │
 │ │ content: [ ..., ToolCall { name: "read", ... } ],│
 │ │ stopReason: "toolUse" ← Có một cuộc gọi công cụ, Tiếp tục chuyển │
 │ │ } │
 │ │ ⑤ thi hành Tool(Quy trình công cụ gồm năm bước, Để biết chi tiết, xem Chương5chương) │
 │ │ ToolResultMessage { content: [{ text: "Nội dung tập tin" }] }│
 │ │ turn_end │
 │ └─────────────────────────────────────────────────────┘
 │
 │ Phán quyết vòng tròn: stopReason Có toolUse → hasMoreToolCalls = true → tiếp tục
 │
 │ ┌── Turn 2 ──────────────────────────────────────────┐
 │ │ turn_start │
 │ │ ⑥ cuộc gọi thứ hai Model(Kết quả công cụ được thêm vào danh sách tin nhắn) │
 │ │ streamSimple(model, { messages: [..., toolResult] })│
 │ │ ↓ Mô hình xem nội dung tập tin, bắt đầu giải thích │
 │ │ AssistantMessage { │
 │ │ content: [ TextContent { text: "tập tin này..." } ],│
 │ │ stopReason: "stop" ← Không có cuộc gọi công cụ, Chuẩn bị dừng lại │
 │ │ } │
 │ │ turn_end │
 │ └─────────────────────────────────────────────────────┘
 │
 │ Phán quyết vòng tròn: hasMoreToolCalls = false, pendingMessages trống rỗng
 │ → thoát vòng lặp bên trong
 │ → Kiểm tra vòng ngoài followUp → trống rỗng → Thoát khỏi vòng lặp bên ngoài
 │
 └── agent_end(một Trace kết thúc, tổng cộng 2 một Turn)
```

### Vòng lặp quay ra sao: stopReason: đèn tín hiệu duy nhất



Ga và phanh của vòng lặp gói gọn trong một field: stopReason. Mỗi AssistantMessage model trả về đều mang theo nó.

Nhưng trước hết phải làm rõ một điểm then chốt: model không bao giờ nói tôi xong rồi. Model chỉ là bộ dự đoán token: cho context, đoán token tiếp theo, lặp lại. Nó không biết task đã xong hay chưa. Dù field stopReason được gắn trên giá trị trả về của model, giá trị của nó đến từ hai nơi khác nhau:

Ba giá trị model API thật sự trả về:

| stopReason | Ý nghĩa |
| --- | --- |
| toolUse | Model output JSON gọi tool; API phát hiện và trả về |
| stop | Sinh kết thúc tự nhiên (gặp stop token), không có tool call |
| length | Số token chạm trần maxTokens, bị cắt |

Hai giá trị do tầng streaming của framework tiêm vào (bản thân model API không bao giờ trả về):

| stopReason | Ý nghĩa | Ai tiêm |
| --- | --- | --- |
| error | Exception trong lúc gọi (mạng rớt, API lỗi, v.v.) | Khối catch của tầng streaming: output.stopReason = error |
| aborted | Người dùng chủ động hủy (AbortSignal kích hoạt) | Khối catch của tầng streaming: output.stopReason = aborted |

> Bằng chứng code (packages/ai/src/): khi lệnh gọi API bên trong streamSimple ném exception, khối catch thực thi output.stopReason = options?.signal?.aborted ? aborted: error. Đây không phải model nói, mà là framework chữa cháy thay.

Thực ra vòng lặp chỉ nhìn một thứ: output của model có chứa tool call hay không. Đằng sau là một quy ước kỹ thuật do con người định:

> Nếu một lần output của model không có tool call, thì vòng này không cần làm thêm gì nữa; vòng lặp có thể dừng.

Đây không phải quyết định thông minh của model. Nói cách khác: không phải model đang nói tôi xong rồi, mà là ta đang nói mày không xin tool, thì coi như mày xong.

```
// Đơn giản hóa logic(Xem thực tế agent-loop.ts:202-216)
const toolCalls = message.content.filter(c => c.type === "toolCall");
hasMoreToolCalls = false;
if (toolCalls.length > 0) {
 const executedToolBatch = await executeToolCalls(...);
 hasMoreToolCalls = !executedToolBatch.terminate; // bất kỳ công cụ nào terminate sau đó dừng lại
}
```

### Một quy tắc dẫn dắt cả vòng lặp


> Lưu ý: thứ thật sự điều khiển vòng lặp không phải stopReason === toolUse, mà là độ dài mảng toolCalls > 0 && !terminate. Nghĩa là: dù stopReason === length (bị cắt), miễn là trong content có khối toolCall, vòng lặp vẫn thực thi tool; ngược lại, dù stopReason === toolUse, nếu mọi kết quả tool đều đặt terminate: true, vòng lặp cũng dừng.

Điều kiện inner loop là while (hasMoreToolCalls || pendingMessages.length > 0):

- Model trả toolCall và tool không terminate → hasMoreToolCalls = true → tiếp tục quay: thực thi tool, feed kết quả lại, gọi model lần nữa
- stopReason === stop hoặc length và không có toolCall → hasMoreToolCalls = false → chuẩn bị dừng (xem có pending message không)
- stopReason === error hoặc aborted → dừng cứng: thoát ngay cả vòng lặp, không kiểm tra followUp

```
 ┌──────────────────────────────────┐
 │ │
 ▼ │
 ┌─────────┐ toolUse ┌──────────┐ │
 │ gọi model │ ─────────→ │ Công cụ thực thi │ │
 └─────────┘ └──────────┘ │
 │ │ │
 │ stop / length │ Nối kết quả │
 │ ▼ đến tin tức │
 ▼ Điều chỉnh lại mô hình ──────┘
 ┌─────────┐
 │ Chuẩn bị dừng lại │ ← Nó không được xác định bởi mô hình, là quy tắc của chúng tôi
 └─────────┘

 error / aborted → Nhảy ra khỏi toàn bộ vòng lặp trực tiếp(dừng lại)
```

### Vòng lặp tối thiểu: mẫu số chung nhỏ nhất của mọi Agent


Sao không để code khéo léo hơn trong việc đoán task đã xong chưa? Vì đây chính là khác biệt cốt lõi giữa Agent và Workflow. Trong Workflow bạn biết flow có mấy bước, có thể dùng code đánh giá tiến độ. Nhưng ở chế độ Agent, bạn không biết model cần đọc bao nhiêu file, sửa bao nhiêu chỗ: tín hiệu duy nhất có thể tin cậy là: output có tool call hay không. Đây vừa là giới hạn, vừa là sự thanh nhã: không cần logic đánh giá độ hoàn thành task nào cả; code chỉ làm lớp phán đoán đơn giản nhất.

### Mọi đường thoát của vòng lặp

Mô tả hình: năm giá trị stopReason được xử lý theo ba nhánh: toolUse giữ vòng lặp quay tiếp; stop/length chuẩn bị dừng bình thường (vẫn kiểm tra followUp); error/aborted dừng cứng (không kiểm tra followUp). Lưu ý hai nguồn của stopReason: ba từ model API, hai là fallback do tầng streaming của framework tiêm.

| Đường thoát | Điều kiện kích hoạt | Lý do |
| --- | --- | --- |
| Thoát bình thường | stop / length + không có followUp + không có pending message | Phổ biến nhất. Model không xin tool và không có task nối tiếp |
| Dừng cứng | error / aborted | Bản thân lệnh gọi model đã lỗi; chạy tiếp vô nghĩa; bỏ qua followUp |
| Hook ngoài dừng | shouldStopAfterTurn() trả về true | Context sắp đầy, đạt số Turn tối đa, v.v. |
| Tool tự kết thúc | Cụm tool đều trả về terminate: true | Tất cả tool đều đồng ý dừng (every, không phải some) |

---

## 4. Đi sâu source: Loop nền và thiết kế lớp phủ của coding-agent

Mục 3 đã cho bạn toàn cảnh khái niệm: message chảy ra sao, stopReason dẫn dắt vòng lặp ra sao, khi nào dừng. Nhưng tất cả mới là là gì. Mục này đào vào code để trả lời làm bằng cách nào.

Trước khi xem source Pi, hãy làm rõ một điều: Agent Loop đơn giản nhất thật ra cực kỳ ngắn.

```
// Đơn giản nhất Agent Loop(mã giả)
async function simpleLoop(messages, model, tools) {
 while (true) {
 // ① gọi model
 const response = await callModel(model, messages, tools);
 messages.push(response);

 // ② Không có cuộc gọi công cụ → kết thúc
 if (response.stopReason !== "toolUse") {
 return messages;
 }

 // ③ Có một cuộc gọi công cụ → thi hành, Trả lại kết quả
 for (const toolCall of response.toolCalls) {
 const result = await executeTool(toolCall);
 messages.push(result);
 }
 }
}
```

### coding-agent phủ lên trên những gì


Hơn chục dòng code. Một vòng while: gọi model, thực thi tool, gọi model lại, cho đến khi model không còn yêu cầu tool nữa. Đây là cài đặt tối thiểu của logic đã nói ở mục 3: Agent nào cũng cần lõi này.


coding-agent của Pi là một trợ lý lập trình tương tác: người dùng nói chuyện với nó trong terminal; có khi phải đọc nhiều file, sửa code, chạy test. Bối cảnh sản phẩm này có thêm nhu cầu thật so với vòng lặp tối thiểu:

| Nhu cầu thật | Thiết kế phủ lên | Vị trí source |
| --- | --- | --- |
| Người dùng gõ thêm chỉ dẫn trong khi Agent đang làm | steering message injection: message khẩn có thể chèn ngang giữa các Turn | Đầu inner loop |
| Hệ thống muốn nối tiếp task sau khi Agent xong (ví dụ tiện thể chạy test luôn) | outer followUp loop: inner loop dừng nhưng outer có thể khởi động lại inner | Outer while(true) |
| Task phức tạp khác nhau muốn model hạng khác nhau | hook prepareNextTurn: có thể đổi model/context ở cuối mỗi Turn | Sau turn_end |
| Cửa sổ context sắp đầy, cần kích hoạt nén | hook shouldStopAfterTurn: phán đoán bên ngoài có nên dừng không | Sau prepareNextTurn |

Nhận thức then chốt: những thiết kế phủ lên này đều là lựa chọn chức năng của coding-agent, không phải quy luật phổ quát của Agent. Nếu bạn đang làm một Agent đơn giản kiểu hỏi đáp có tool, cả bảng trên đều thừa: bạn chỉ cần vòng lặp tối thiểu.

Nhưng hiểu coding-agent phủ các thiết kế này như thế nào rất có giá trị: bối cảnh sản phẩm của bạn rất có thể cần cơ chế tương tự. Tiếp theo, dùng source đầy đủ của coding-agent làm ví dụ, ta đi qua từng thiết kế này từng bước. Bám theo message đọc giúp tôi src/main.ts, đi hết hành trình từ đầu vào đến kết thúc.

### 4.1 Đầu vào: runAgentLoop() nhận gì

> Mục 3 đã trình bày toàn cảnh flow; ở đây ta bung chi tiết code: cùng một quá trình, nhìn sâu hơn.

Sau khi bạn nhấn Enter, chuỗi gọi là: Agent.prompt() → runPromptMessages() → runAgentLoop(). Dừng ở đầu vào:

```
// agent-loop.ts:95-118
async function runAgentLoop(
 prompts: AgentMessage[], // tin nhắn của bạn
 context: AgentContext, // bối cảnh hội thoại hiện tại(sao chép ảnh chụp nhanh)
 config: AgentLoopConfig, // Cấu hình vòng lặp(model, cái móc, Gọi lại hàng đợi)
 emit: AgentEventSink, // bộ phát sự kiện
 signal?: AbortSignal, // tín hiệu hủy bỏ
 streamFn?: StreamFn, // Chức năng truyền phát(Có thể thay thế)
): Promise<AgentMessage[]>
```


Ba tham số quan trọng nhất trong sáu:

prompts: message của bạn đã được đóng gói thành định dạng chuẩn:


```
[{
 role: "user",
 content: [{ type: "text", text: "đọc nó cho tôi src/main.ts" }],
 timestamp: 1748000000000
}]
```


context: snapshot của context hội thoại. Lưu ý là bản sao (do createContextSnapshot() ở agent.ts:414-420 tạo); mọi sửa đổi context trong khi Loop chạy không ảnh hưởng trạng thái gốc của lớp Agent:


```
{
 systemPrompt: "You are a helpful coding assistant...",
 messages: [ /* Lịch sử cuộc trò chuyện trước đó */ ],
 tools: [
 { name: "read", description: "...", parameters: Type.Object({...}), execute: ... },
 { name: "bash", description: "...", parameters: Type.Object({...}), execute: ... },
 ]
}
```


config: cấu hình hành vi của Loop. Có một nhóm hook quan trọng (đều là hàm, không phải dữ liệu):


```
{
 model: Model, // Sử dụng cái nào LLM
 convertToLlm: Function, // AgentMessage[] → Message[] Chuyển đổi
 transformContext?: Function, // điều chỉnh LLM Tiền xử lý bối cảnh trước(chẳng hạn như nén)
 getSteeringMessages?: Function, // nhận được"Cắt hàng đợi khẩn cấp"tin tức
 getFollowUpMessages?: Function, // nhận được"Nhiệm vụ bổ sung"tin tức
 shouldStopAfterTurn?: Function, // Chúng ta có nên dừng lại sau mỗi vòng đấu không?
 beforeToolCall?: Function, // Móc trước khi thực hiện công cụ
 afterToolCall?: Function, // Công cụ móc sau khi thực hiện
 toolExecution: "parallel", // Chế độ thực thi công cụ
}
```


Các hook này đều là hàm chứ không phải dữ liệu: Loop gọi chúng khi chạy để kéo trạng thái mới nhất về. Điều này khiến Loop hoàn toàn tách rời khỏi nguồn message bên ngoài.

Hàm đầu vào chỉ làm ba bước chuẩn bị:

```
Step 1: tạo ra newMessages mảng
 → Thu thập vòng này Trace Tất cả tin nhắn mới được tạo

Step 2: đặt prompts nối thêm vào context.messages
 → context.messages = [...context.messages, ...prompts]

Step 3: sự kiện ban đầu
 → emit("agent_start") ← Trace bắt đầu
 → emit("turn_start") ← vòng đầu tiên Turn bắt đầu(Giao tại lối vào, Theo dõi Turn Gửi vào vòng lặp bên trong)
 → cho mỗi prompt: emit("message_start") + emit("message_end")
 → gọi runLoop()
```


Dữ liệu thay đổi:


```
Trước lối vào: 
 context.messages = [user1, asst1, toolResult1] ← cuộc trò chuyện trước đó
 newMessages = []

Sau lối vào: 
 context.messages = [user1, asst1, toolResult1, user2] ← Tin nhắn của bạn đã được thêm vào
 newMessages = [user2] ← Người thu thập bắt đầu ghi
```

### 4.2 Bộ xương của runLoop(): lõi trước, lớp phủ sau

#### Lõi: inner loop


---


Giờ ta vào runLoop(): đoạn code cốt lõi nhất của cả hệ thống. Đừng nản vì độ dài; ta xem lõi trước, rồi đến lớp phủ.


Nếu chỉ giữ lại logic vòng lặp tối thiểu, runLoop trông thế này:

```
// Chỉ giữ lại kernel runLoop(mã giả)
while (hasMoreToolCalls) {
 // bước B: điều chỉnh LLM
 // bước C: Kiểm tra stopReason → error/aborted Cứ bỏ đi
 // bước D: Công cụ thực thi
 // bước E: emit turn_end
}
// kết thúc → emit agent_end
```

#### Lớp phủ: coding-agent thêm hai vỏ ngoài


Đây là vòng lặp tối thiểu: gọi model, thực thi tool, turn_end, lặp lại. Điều kiện thoát hasMoreToolCalls của inner loop được dẫn dắt bởi độ dài mảng toolCalls > 0 && !terminate (đã nói ở mục 3). Đây là lõi mà mọi Agent đều cần.


Nhưng coding-agent, với vai trò trợ lý lập trình tương tác, cần thêm hai thứ bên ngoài lõi:

Lớp phủ 1: steering message injection (kiểm tra ở đầu inner loop + ở cuối mỗi vòng). Người dùng gõ thêm chỉ dẫn trong khi Agent đang làm: những message này không thể đợi task hiện tại chạy xong; chúng phải được chèn gấp ở đầu vòng tiếp theo. Nên điều kiện inner loop có thêm || pendingMessages.length > 0.

Lớp phủ 2: outer followUp loop (bọc toàn bộ inner loop). Sau khi Agent dừng tự nhiên, hệ thống có thể muốn nối tiếp task (ví dụ tiện thể chạy test). Outer loop cho phép các task nối tiếp này tiếp tục chạy trong cùng một Trace, không cần khởi động Loop mới.

Ghép lõi và hai lớp phủ lại, ta có bộ xương runLoop đầy đủ:

```
async function runLoop(currentContext, newMessages, config, signal, emit, streamFn) {

 // ① lần đầu tiên steering Kiểm tra(trước khi vào vòng trong！)
 let pendingMessages = (await config.getSteeringMessages?.()) || [];

 // ========== Lớp phủ2: Vòng ngoài(followUp Kéo dài cuộc sống)==========
 while (true) {
 let hasMoreToolCalls = true;
 let firstTurn = true; // Bỏ qua vòng đầu tiên turn_start(Lối vào đã được gửi)

 // ========== hạt nhân + Lớp phủ1: vòng lặp bên trong ==========
 while (hasMoreToolCalls || pendingMessages.length > 0) {
 // ↑ Lớp phủ1: steering Tin nhắn cũng thúc đẩy các vòng lặp

 if (!firstTurn) {
 emit({ type: "turn_start" });
 }
 firstTurn = false;

 // bước A: tiêm pendingMessages(steering tin tức)← Lớp phủ1
 // bước B: điều chỉnh LLM → streamAssistantResponse() ← hạt nhân
 // bước C: Kiểm tra stopReason ← hạt nhân
 // bước D: Công cụ thực thi ← hạt nhân
 // bước E: emit turn_end ← hạt nhân
 // bước F: prepareNextTurn → shouldStopAfterTurn ← Lớp phủ(cái móc)
 // → Kiểm tra lại steering ← Lớp phủ1
 }

 // ========== Kết thúc vòng lặp bên trong ==========
 // Lớp phủ2: Kiểm tra followUp Hàng đợi
 const followUpMessages = (await config.getFollowUpMessages?.()) || [];
 if (followUpMessages.length > 0) {
 pendingMessages = followUpMessages;
 continue; // Trở về đầu vòng lặp bên ngoài, Vòng lặp bên trong mở lại
 }

 break; // Cả hai hàng đợi đều trống, Thực sự bỏ cuộc
 }
}
```

### 4.3 [Lớp phủ 1 · Bước A] steering message injection


Giờ ta đi qua từng bước. Mỗi bước sẽ được gắn nhãn lõi hoặc lớp phủ để phân biệt.

---


> Steering là gì? Đây là một tính năng tương tác của coding-agent. Hãy tưởng tượng bạn nhờ Agent sửa bug, Agent đang đọc file, phân tích code. Lúc đó bạn chợt nghĩ ra một bổ sung: tiện kiểm tra luôn file test: bạn muốn chỉ dẫn này chen ngang, không phải đợi Agent làm xong task hiện tại rồi mới tính.

Steering chính là cơ chế chen ngang này. Chỉ dẫn mới người dùng gõ trong khi Agent đang làm sẽ được đưa vào hàng đợi steering. Ở đầu mỗi vòng inner loop, Loop kiểm tra hàng đợi này trước và chèn các message khẩn vào cuộc hội thoại hiện tại:

```
if (pendingMessages.length > 0) {
 for (const message of pendingMessages) {
 await emit({ type: "message_start", message });
 await emit({ type: "message_end", message });
 currentContext.messages.push(message);
 newMessages.push(message);
 }
 pendingMessages = []; // Tiêu thụ hoàn thành, Xóa
}
```

### 4.4 [Lõi · Bước B] streamAssistantResponse(): gọi LLM

#### Pha A: tiền xử lý context (tùy chọn)


Đoạn code này chèn các message khẩn lần lượt vào context và bộ thu thập message.

Nguồn đầu tiên của pendingMessages là lần kiểm tra steering đầu tiên khi runLoop vào (agent-loop.ts:167). Sao phải kiểm tra trước khi vào vòng lặp? Vì người dùng có thể đã gõ thêm nội dung trong khi đợi phản hồi LLM đầu tiên: lúc đó message đã được hàng đợi bên ngoài nhận vào, nhưng vòng lặp chưa bắt đầu; nếu ta không lấy trước, cụm message đó sẽ bị bỏ mất.

```
let messages = context.messages;
if (config.transformContext) {
 messages = await config.transformContext(messages, signal);
}
```


Nếu transformContext được cấu hình (ví dụ thuật toán nén), tiền xử lý message ở đây. Không cấu hình thì bỏ qua.



```
const llmMessages = await config.convertToLlm(messages);
```

#### Pha B: chuyển AgentMessage thành Message (ranh giới của hai tầng message)

Dòng này đứng trên ranh giới giữa lõi Agent và LLM. Để hiểu vì sao nó tồn tại, phải biết trước thiết kế hai tầng message.

Khi Agent duy trì lịch sử hội thoại bên trong, nó cần ghi lại không chỉ người dùng nói gì, AI trả lời gì: mà còn trạng thái nội bộ của chính nó. Ví dụ, coding-agent ghi: context đã được nén (CompactionSummaryMessage), chi tiết thực thi lệnh Bash (BashExecutionMessage), record chuyển nhánh (BranchSummaryMessage). Đây là ngôn ngữ nội bộ của Agent, và LLM hoàn toàn không nhận dạng các kiểu message này: nó chỉ nhận ba kiểu chuẩn: UserMessage, AssistantMessage, ToolResultMessage.

convertToLlm là người phiên dịch đứng ở ranh giới này: dịch ngôn ngữ nội bộ của Agent sang giao thức LLM hiểu được. Cài đặt mặc định chỉ là một. filter(): giữ lại ba kiểu chuẩn:

```
function defaultConvertToLlm(messages: AgentMessage[]): Message[] {
 return messages.filter(
 (message) => message.role === "user"
 || message.role === "assistant"
 || message.role === "toolResult",
);
}
```


Biến đổi dữ liệu:


```
Trước khi chuyển đổi(AgentMessage[]): 
[
 { role: "user", content: "đọc nó cho tôi src/main.ts", ... }, ← Dự trữ
 { role: "assistant", content: [...], ... }, ← Dự trữ
 { role: "compactionSummary", summary: "Tóm tắt cuộc trò chuyện trước đó..." }, ← lọc ra
 { role: "toolResult", content: [...], ... }, ← Dự trữ
]

Sau khi chuyển đổi(Message[]): 
[
 { role: "user", content: "đọc nó cho tôi src/main.ts", ... },
 { role: "assistant", content: [...], ... },
 { role: "toolResult", content: [...], ... },
]
```

#### Pha C: dựng Context và gọi model


> Thiết kế đầy đủ của hệ thống hai tầng message được trình bày chi tiết ở Chương 6: Hệ thống Message.



```
const llmContext: Context = {
 systemPrompt: context.systemPrompt,
 messages: llmMessages,
 tools: context.tools,
};

const streamFunction = streamFn || streamSimple;
const resolvedApiKey =
 (config.getApiKey ? await config.getApiKey(config.model.provider): undefined)
 || config.apiKey;

const response = await streamFunction(config.model, llmContext, {
 ...config,
 apiKey: resolvedApiKey,
 signal,
});
```


Dựng Context là luồng chính của bước này. Lưu ý llmContext là một đối tượng hoàn toàn mới, được dựng lại mỗi vòng của inner loop. Nó gồm ba phần:

- systemPrompt: dùng lại trực tiếp system prompt từ context của Agent, bảo model mày là ai, phải theo rule nào
- messages: chính là llmMessages đã được lọc bởi convertToLlm ở bước trước, chỉ gồm ba kiểu chuẩn LLM nhận
- tools: danh sách tool (kèm định nghĩa schema), để model biết lần này có những tool nào

Lưu ý một chi tiết: llmContext.tools = context.tools là gán tham chiếu: mỗi vòng có bọc một wrapper object mới, nhưng bản thân mảng tools là cùng một tham chiếu, nội dung ổn định ở cấp byte. systemPrompt cũng vậy. Chỉ có messages thật sự dài ra (mỗi vòng thêm một ToolResultMessage mới).

Vậy sao vẫn dựng lại wrapper llmContext mỗi vòng? Vì có những Turn thật sự thay đổi một trong ba thứ đó: hook prepareNextTurn (§4.7) có thể đổi model hoặc sửa systemPrompt; hệ thống extension (§5) có thể đăng ký tool mới lúc chạy. Chi phí dựng lại wrapper không đáng kể (một object JS), nhưng đảm bảo không bị ô nhiễm trạng thái khó truy vết do tham chiếu chung.

Vậy có vỡ prompt cache không? Không. prompt cache của Anthropic là content-addressed (đánh địa chỉ theo nội dung): nó nhìn vào byte gửi đi, không phải identity của request. Gửi object mới hay cũ không quan trọng; miễn là byte của system + tools không đổi, cache sẽ hit. Pi gắn cache_control: { type: ephemeral } rõ ràng ở ba vị trí trong anthropic-messages.ts:

| Vị trí | Dòng source | Tác dụng |
| --- | --- | --- |
| Cuối system prompt | L922/929/938 | Cả system prompt làm prefix có thể cache |
| Tool cuối cùng | L1208 | Cả danh sách tools làm prefix có thể cache |
| User message cuối | L1157-1178 | rolling cache: mỗi Turn đẩy breakpoint cache lên message mới nhất |

Cái thứ ba đặc biệt tinh tế: cache breakpoint không cố định ở message đầu tiên; nó chạy theo user message mới nhất. Như vậy, prefix cũ tiếp tục hit, nội dung mới thêm vào cũng được ghi vào, cả lịch sử hội thoại đều hưởng lợi từ cache. Chuỗi hit đại khái là:

```
Turn 1: viết [system + tools] → viết [messages §1]
Turn 2: đánh [system + tools] → đánh [messages §1] → viết [messages §2]
Turn 3: đánh [system + tools] → đánh [messages §1+§2] → viết [messages §3]
```

#### Pha D: xử lý streaming response: cái hay của việc thay tại chỗ


Thêm một điểm dễ hiểu sai: tools không bị nhét vào cuối messages. Trong giao thức API của Anthropic, tools là một field top-level độc lập (đặt trước messages); bản thân thiết kế giao thức đã tính đến cache: tools ổn định phía trước, messages biến động phía sau; prefix càng dài, tiết kiệm càng nhiều.

OpenAI đi hướng khác (openai-completions.ts:554): prompt_cache_key: sessionId, backend OpenAI tự khớp prefix theo session. DeepSeek, Qwen, v.v., thông qua field tương thích cacheControlFormat: anthropic, cũng có thể dùng lại marker kiểu Anthropic cache_control (applyAnthropicCacheControl ở L593).


```
for await (const event of response) {
 switch (event.type) {
 case "start":
 // lấy một cái"vỏ rỗng"tin tức, trực tiếp push Đến context
 partialMessage = event.partial;
 context.messages.push(partialMessage);
 emit({ type: "message_start", ... });
 break;

 case "text_delta": // tăng văn bản
 case "toolcall_delta": // Tăng cuộc gọi công cụ
 case "thinking_delta": // Hãy suy nghĩ dần dần
 partialMessage = event.partial; // Một số tin tức cập nhật
 context.messages[last] = partialMessage; // ★ Thay thế tại chỗ！
 emit({ type: "message_update", ... }); // UI Nhận thông tin cập nhật gia tăng
 break;

 case "done":
 case "error":
 finalMessage = await response.result();
 context.messages[last] = finalMessage; // ★ Thay thế bằng thông báo hoàn chỉnh cuối cùng
 emit({ type: "message_end", ... });
 return finalMessage;
 }
}
```


Sao push vỏ rỗng trước rồi thay tại chỗ? Lưu ý ý nghĩa của thay tại chỗ: không phải đẩy mục mới vào mảng context.messages; mà là sửa các khối nội dung của message cuối cùng tại chỗ. Chunk streaming response lần lượt đến; ta chưa có toàn bộ message. Ta push trước một AssistantMessage rỗng để bộ thu thập đã có sẵn chỗ cho kết quả cuối cùng. Sau đó mỗi chunk streaming sẽ mutate message này tại chỗ: miễn là sau khi response xong, bộ thu thập duyệt messages, nó sẽ thấy message đã hoàn chỉnh.

```
start → { role: "assistant", content: [] } ← vỏ rỗng push
text_delta → { content: [{ type:"text", text:"được rồi..." }] } ← Văn bản đang phát triển
toolcall → { content: [{ text:"được rồi..." }, ← Cuộc gọi công cụ xuất hiện
 { type:"toolCall", name:"read", arguments:{file_path:"src/main.ts"} }] }
done → { content: [...], stopReason:"toolUse", usage:{...} } ← Thay thế tin nhắn hoàn chỉnh cuối cùng
```

### 4.5 [Lõi · Bước C] kiểm tra stopReason


---


Mục 3 đã nói kỹ về stopReason. Ở đây ta xem code thật:

```
// agent-loop.ts:196-200
if (message.stopReason === "error" || message.stopReason === "aborted") {
 await emit({ type: "turn_end", message, toolResults: [] });
 await emit({ type: "agent_end", messages: newMessages });
 return; // ← Thoát toàn bộ runLoop, Đừng kiểm tra followUp
}
```

### 4.6 [Lõi · Bước D] executeToolCalls(): thực thi tool


error và aborted là dừng cứng: lập tức phát turn_end + agent_end, return thẳng. Không thực thi tool, cũng không kiểm tra followUp. Đây là chiến lược fail fast (thất bại nhanh): vì bản thân lệnh gọi model đã thất bại (lỗi mạng hoặc người dùng hủy), chạy tiếp là vô nghĩa.

```
const toolCalls = message.content.filter((c) => c.type === "toolCall");
```


Rồi quyết định cụm tool này chạy song song hay nối tiếp:


```
if (config.toolExecution === "sequential" || hasSequentialToolCall) {
 return executeToolCallsSequential(...); // nối tiếp
}
return executeToolCallsParallel(...); // Song song
```


Chiến lược phủ quyết: miễn là bất kỳ một tool nào trong cụm khai báo executionMode: sequential, toàn bộ cụm phải chạy nối tiếp. Đây là lựa chọn bảo thủ: khi một tool cần thao tác trên kết quả của tool trước, không còn cách nào khác ngoài chạy tuần tự.

```
chế độ nối tiếp: 
 ToolCall A: chuẩn bị → Xác minh → beforeHook → thi hành → afterHook → emit end
 ToolCall B: chuẩn bị → Xác minh → beforeHook → thi hành → afterHook → emit end
 (một kết thúc hoàn chỉnh, Vừa mới bắt đầu phần tiếp theo)

chế độ song song(thiết kế ba giai đoạn): 
 sân khấu1 - chuẩn bị(đặt hàng): A chuẩn bị → B chuẩn bị → C chuẩn bị
 ↑ prepareToolCall Chứa xác minh và beforeHook, Phải thực hiện tuần tự
 sân khấu2 - thi hành(Song song): A, B, C thực hiện đồng thời(Promise.all)
 ↑ chỉ tool.execute Song song, tiết kiệm thời gian
 sân khấu3 - sự kiện(có trật tự): end Gửi theo thứ tự hoàn thành; result Gửi theo thứ tự gọi
 ↑ result giữ tin nhắn và ToolCall trật tự nhất quán, LLM Ngữ cảnh nhận được là chính xác
```


Lưu ý sự tinh tế của chế độ song song: pha chuẩn bị luôn tuần tự (vì validate và kiểm tra quyền không thể chạy song song: nếu B bị chặn thì C không nên chạy). Chỉ sau khi mọi tool đã validate xong thì mới thật sự chạy song song.

```
Sau khi thực hiện công cụ: 
 context.messages = [..., user2, assistantMessage, {
 role: "toolResult", toolCallId: "toolu_01", toolName: "read",
 content: [{ text: "Nội dung tập tin..." }], isError: false
 }]
```


Cơ chế terminate: tool có thể đặt terminate: true trong kết quả trả về, nghĩa là tôi nghĩ nên dừng. Nếu tất cả tool trong cụm đều đồng ý terminate (code dùng every, không phải some), vòng lặp dừng.

```
// ① emit turn_end: Thông báo bên ngoài"Vòng này kết thúc"(hạt nhân)
await emit({ type: "turn_end", message, toolResults });

// ② prepareNextTurn: Hãy cho thế giới bên ngoài một cơ hội"sửa đổi"vòng tiếp theo(Lớp phủ)
// Giá trị trả về có thể chứa context / model / thinkingLevel Bảo hiểm của một trong ba
const nextTurnSnapshot = await config.prepareNextTurn?.({...});
if (nextTurnSnapshot) {
 currentContext = nextTurnSnapshot.context ? currentContext;
 config.model = nextTurnSnapshot.model ? config.model;
 // thinkingLevel Cũng được đề cập ở đây(Xem chi tiết agent-loop.ts trong prepareNextTurn logic xử lý)
}

// ③ shouldStopAfterTurn: Đánh giá bên ngoài về việc liệu đã đến lúc phải dừng lại(Lớp phủ)
if (await config.shouldStopAfterTurn?.({...})) {
 await emit({ type: "agent_end", messages: newMessages });
 return;
}

// ④ Kiểm tra lại steering: Có tin tức khẩn cấp nào mới không?？(Lớp phủ1)
pendingMessages = (await config.getSteeringMessages?.()) || [];
```

### 4.7 [Lõi + Lớp phủ · Bước E~F] turn_end + hook + kiểm tra lại steering


prepareNextTurn: đây là extension point dễ bị bỏ qua nhưng rất mạnh. Sau mỗi turn_end và trước vòng tiếp theo, Loop gọi hàm này để cho bên ngoài cơ hội đổi model hoặc sửa context:

```
bối cảnh: Chuyển đổi mô hình dựa trên độ phức tạp của nhiệm vụ

Turn 1: Người dùng đã hỏi một câu hỏi đơn giản → Dành cho model Haiku(Nhanh, giá rẻ)
 turn_end → prepareNextTurn Phát hiện vấn đề thật dễ dàng
 → Trở lại { model: haiku } → Tiếp tục sử dụng ở lần tiếp theo Haiku

bối cảnh: Đi được nửa đường, tôi phát hiện ra rằng nhiệm vụ đã trở nên phức tạp hơn.

Turn 1: Người dùng cho phép"Tái cấu trúc mô-đun này" → Haiku Bắt đầu đọc tập tin
 turn_end → prepareNextTurn Nhận thấy có nhiều file cần thay đổi
 → Trở lại { model: opus } → Tự động cắt sang vòng tiếp theo Opus(mạnh mẽ, Đắt)
```

### 4.8 Quay về đầu vòng lặp


Ngoài đổi model, nó còn có thể đổi context (ví dụ tiêm thông tin context mới) và thinkingLevel (cường độ suy luận). Giá trị trả về cho biết Turn tiếp theo có nên chạy nữa hay không, nên nó cũng có thể làm van an toàn.

```
while (hasMoreToolCalls || pendingMessages.length > 0)
```

### 4.9 [Lớp phủ 2 · Bước G] outer loop: cơ chế kéo dài thở của followUp


Một trong hai điều kiện đúng thì vòng lặp tiếp tục. hasMoreToolCalls do output của model có khối toolCall hay không (và chưa tất cả đều terminate) quyết định; pendingMessages.length > 0 nghĩa là có message đang chờ từ steering hoặc nguồn khác.


```
const followUpMessages = (await config.getFollowUpMessages?.()) || [];
if (followUpMessages.length > 0) {
 pendingMessages = followUpMessages; // nhồi bông pending, kích hoạt mới Turn
 continue; // Trở về đầu vòng lặp bên ngoài
}
break; // Cả hai hàng đợi đều trống, Thực sự bỏ cuộc
```

### 4.10 steering vs followUp: một bảng nhìn rõ hai can thiệp

## 5. Tổng kết: bốn thiết kế cốt lõi của Loop

### 1. Mô hình vòng lặp ReAct


Nếu có message followUp, chúng được đẩy vào pendingMessages, và continue nhảy về đầu outer loop. Đây là cơ chế kéo dài thở: inner loop xong rồi nhưng outer loop vẫn có thể giữ Agent làm tiếp.

Giờ so sánh hai cơ chế can thiệp: steering vs followUp: trong một bảng:

| Chiều | steering | followUp |
| --- | --- | --- |
| Thời điểm chèn | Trước khi inner loop bắt đầu + ở cuối mỗi vòng của inner loop | Sau khi inner loop kết thúc hoàn toàn |
| Ngữ nghĩa | Chen ngang khẩn: chèn vào khoảng trống khi tool đang thực thi | Xếp hàng chờ gọi: đợi task hiện tại làm xong hẳn |
| Tình huống điển hình | Người dùng gõ thêm chỉ dẫn trong khi Agent đang làm | Hệ thống nối tiếp tiện chạy test luôn sau khi Agent xong |

Ví đời thường: steering là bạn đang họp, có người gõ cửa đưa một tờ giấy: khẩn, xem cái này trước. followUp là tan họp bạn lật hộp thư: không gấp, nhưng cần xử lý.

Mô tả hình: đối chiếu trái đỏ phải xanh: steering kiểm tra ở đầu và cuối mỗi vòng inner loop và chen ngang; followUp kiểm tra sau khi inner loop kết thúc hoàn toàn và kéo dài lần chạy. Phía dưới liệt kê thời điểm, nguồn, tác động và tình huống điển hình của mỗi cái.
### 2. Cơ chế dẫn dắt bởi stopReason

### 3. Tư duy kiến trúc lõi + lớp phủ

## 6. Trạm tiếp theo
