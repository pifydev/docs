---
title: 'Chương 5: Hệ thống Tool'
translation_key: ch05-tool-system
language: vi
chapter: 5
source_url: 'https://www.dgzhuya.com/modules/ch05-tool-system'
official_refs: []
terms_used: []
status: translated
last_updated: '2026-08-20'
translator: hypnguyen1209
reviewed_by: null
code_blocks: 29
code_lines: 279
mermaid_blocks: 0
---
> Chương 3 đã truy vết hành trình từ "model quyết định gọi tool read" đến "kết quả tool quay về trước mặt model". Nhưng lúc đó ta coi nó như hộp đen: chỉ nói "Loop thực thi tool" mà không giải thích cụ thể.

Chương này sẽ mở hộp đen đó ra.

Khi phản hồi của model chứa một chỉ thị như thế này:


```
{ "type": "toolCall", "id": "call_abc123", "name": "read", "arguments": { "path": "src/main.ts" } }
```


Từ chỉ thị này đến lúc nội dung file quay về trước mặt model, giữa chừng đã diễn ra những gì?

Phản xạ đầu tiên của bạn có thể là: tìm tool `read`, đọc file, nhét nội dung vào message, xong. Nhưng thực tế không đơn giản vậy: model có thể truyền tham số sai kiểu (`path: 12345` thay vì `"src/main.ts"`), model có thể yêu cầu thực thi lệnh nguy hiểm (`rm -rf /`), và bản thân tool có thể ném exception (file không tồn tại).

Pi dùng một **pipeline 5 bước** để giải quyết những vấn đề này: tiền xử lý tham số -> xác thực Schema -> chặn quy ph: thực thi tool: hậu xử lý kết quả. Mỗi bước có trách nhiệm rõ ràng; lỗi ở bước nào cũng không làm "nổ tung" cả vòng lặp.

Nhưng trước khi bàn về pipeline, cần làm rõ một câu hỏi nền tảng hơn: **tool được định nghĩa chính xác thế nào?** Tại sao Pi thiết kế ba lớp kiểu để mô tả "một tool"?

---

## 1. Ba lớp kiểu: tại sao "một tool" phải định nghĩa qua ba lớp?

### Lớp 1: Tool: một "tấm danh thiếp"

Mở `packages/ai/src/types.ts`, bạn sẽ thấy định nghĩa tool ở lớp thấp nhất:


```
// packages/ai/src/types.ts:433-437
export interface Tool<TParameters extends TSchema = TSchema> {
 name: string; // Tên công cụ, Chẳng hạn như "read", "bash"
 description: string; // cho LLM Xem mô tả công cụ
 parameters: TParameters; // tham số JSON Schema(sử dụng TypeBox độ nét)
}
```


Ba trường. Tool chỉ là một thứ có tên, có mô tả, và có parameter Schema.

Interface này sống ở tầng `pi-ai`: tầng thuần thích ứng model. Điều duy nhất nó quan tâm là: **làm sao nói với model về tool.** `name` và `description` xuất hiện trong API request gửi cho model; `parameters` bảo model "bạn được truyền tham số nào".

Ở tầng này, tool chỉ là **một tấm danh thiếp**. Có thể tự mô tả, nhưng không thể làm bất kỳ hành động nào.

### Lớp 2: AgentTool: thêm "khả năng thực thi"

Khi Agent Loop muốn thực thi một tool call, chỉ danh thiếp thì chưa đủ. Nó cần biết **làm sao thực thi** tool này, tool này **có chạy song song được không**, và format tham số có cần **tiền xử lý** không.

Vì vậy tầng `pi-agent-core` mở rộng `AgentTool` trên nền `Tool`:


```
// packages/agent/src/types.ts:371-394
export interface AgentTool<TParameters, TDetails>
 extends Tool<TParameters> // sự kế thừa Tool Ba lĩnh vực của
{
 label: string; // Tag cho mọi người xem(khác với việc cho LLM của description)
 prepareArguments?: (args: unknown) => Static<TParameters>; // Miếng đệm tương thích
 execute: (// Thực thi chức năng
 toolCallId: string,
 params: Static<TParameters>,
 signal?: AbortSignal,
 onUpdate?: AgentToolUpdateCallback<TDetails>,
) => Promise<AgentToolResult<TDetails>>;
 executionMode?: "sequential" | "parallel"; // chế độ thực hiện
}
```


Từ `Tool` lên `AgentTool`, có bốn trường được thêm. Mỗi trường có mục đích rõ ràng:

- **`label`**: model thấy `name` (ví dụ "read"), UI thấy `label` (ví dụ "Đọc file")
- **`prepareArguments`**: lớp tương thích xử lý các quirks của output tham số từ các model khác nhau (sẽ nói chi tiết sau)
- **`execute`**: hàm thực sự làm việc: khi model nói "đọc file", hàm này sẽ đọc
- **`executionMode`**: đánh dấu tool này có thể chạy song song với các tool khác không

### Lớp 3: ToolDefinition: tầng sản phẩm thêm tiếp

Ở tầng `pi-coding-agent` (tầng runtime sản phẩm), tool cần thêm khả năng: render tùy biến (tool `read` hiển thị trong terminal thế nào? tool `edit` hiển thị diff ra sao?), chèn prompt (có tool cần một đoạn hướng dẫn sử dụng trong system prompt).

Vì vậy lớp thứ ba `ToolDefinition` xuất hiện. Hàm `execute` của nó có thêm một tham số so với `AgentTool`: `ctx: ExtensionContext`: cho phép tool truy cập trạng thái phiên hiện tại khi thực thi:


```
AgentTool.execute: (toolCallId, params, signal, onUpdate) => ...
ToolDefinition.execute: (toolCallId, params, signal, onUpdate, ctx) => ...
 ^^^
 Thêm ExtensionContext(bối cảnh phiên)
```


`ToolDefinition` còn thêm các trường liên quan UI: `promptSnippet` (đoạn system prompt), `renderCall` (render lúc gọi), `renderResult` (render lúc có kết quả).

### Cầu nối hai lớp: `wrapToolDefinition`

Agent Loop chỉ hiểu `AgentTool`, nhưng tool ở tầng sản phẩm đều là `ToolDefinition`. Ai sẽ biến `ToolDefinition` thành `AgentTool`?

Câu trả lời là một wrapper chỉ hơn chục dòng:

Chú ý dòng cuối. Hàm `execute` của `AgentTool` chỉ có 4 tham số, nhưng `execute` của `ToolDefinition` có 5. Wrapper dùng closure để capture `ctxFactory`, mỗi lần gọi sẽ tự tạo `ExtensionContext` rồi tiêm vào làm tham số thứ 5. **Agent Loop không bao giờ biết sự tồn tại của `ExtensionContext`.**


```
// packages/coding-agent/src/core/tools/tool-definition-wrapper.ts
export function wrapToolDefinition(definition, ctxFactory?) {
 return {
 name: definition.name,
 label: definition.label,
 description: definition.description,
 parameters: definition.parameters,
 prepareArguments: definition.prepareArguments,
 executionMode: definition.executionMode,
 // chìa khóa: viết lại execute, Tiêm thông qua đóng cửa ExtensionContext
 execute: (toolCallId, params, signal, onUpdate) =>
 definition.execute(toolCallId, params, signal, onUpdate, ctxFactory?.()),
 };
}
```


### Tại sao nhất định phải chia ba lớp?

Sao không nhét tất cả trường vào một interface `Tool` duy nhất, thêm vài trường tùy chọn là xong?

Không được. Lý do là **mỗi lớp có phạm vi phụ thuộc riêng**. Interface `Tool` ở tầng `pi-ai` chỉ phụ thuộc `TSchema` của TypeBox. Nếu thêm `renderCall` (trả về component UI terminal) vào interface đó, `pi-ai` sẽ phải phụ thuộc thư viện render UI terminal. Nhưng `pi-ai` là tầng thuần thích ứng model: việc của nó chỉ là "định dạng thông tin tool thành API request", nó không nên biết UI terminal trông thế nào.

Bản chất của việc tiến triển qua ba lớp là: **mỗi lớp chỉ thêm khả năng mà tầng đó cần, không vượt biên.** `Tool` lo "tôi có thể tự mô tả", `AgentTool` lo "tôi có thể bị thực thi", `ToolDefinition` lo "tôi có thể được hiển thị và mở rộng".

---

## 2. Pipeline 5 bước: gọi tool không phải là "gọi hàm xong là xong"

Đã rõ phần định nghĩa kiểu, giờ xem quá trình thực thi tool call thực tế.

**Chú thích hình:** Pipeline 5 bước dọc từ `ToolCall` đến `ToolResultMessage`: `prepareArguments` -> `validate` -> `beforeToolCall` -> `execute` -> `afterToolCall`. Bên phải mỗi bước có một nhánh lỗi (mũi tên nét đứt), nhưng mọi lỗi cuối cùng đều hội tụ thành message có `isError: true`, vòng lặp không bị exception phá.

### Tại sao không thể gọi thẳng hàm?

Cách xử lý đơn giản nhất: tìm tool `read` -> đọc file -> nhét nội dung vào `ToolResultMessage` -> xong. Một lần gọi hàm, rất trực quan.

Nhưng output của model không phải lúc nào cũng ngoan:

- **Sai format tham số**: tool `Edit` kỳ vọng `edits` là array, nhưng có model serialize array thành chuỗi `"[{...}]"`
- **Sai kiểu tham số**: tham số `path` của tool `Read` là `string`, nhưng model có thể truyền số `12345`
- **Thao tác nguy hiểm**: model yêu cầu chạy `rm -rf /`, Agent của bạn có thật sự chạy không?

Những vấn đề này cho thấy "gọi thẳng hàm" là chưa đủ. Bạn cần thêm vài chốt kiểm tra trước khi thực thi.

### Câu trả lời của Pi: pipeline 5 bước

Mỗi bước có trách nhiệm và cơ chế thoát rõ ràng. 3 bước đầu là "chuẩn bị": bước nào fail cũng không thực thi tool. Bước 4 là "thật sự làm việc". Bước 5 là "kết thúc". Ta mở rộng từng bước.


```
LLM đầu ra ToolCall
 │
 ▼
┌──────────────────────────────────────────────────┐
│ Không. 1 bước: prepareArguments(Tiền xử lý tham số) │
│ Quy trình LLM Các tham số đặc trưng của │
│ Chẳng hạn như: Phân tích mảng chuỗi trở lại mảng thực │
├──────────────────────────────────────────────────┤
│ Không. 2 bước: validateToolArguments(Schema Xác minh) │
│ sử dụng TypeBox Schema Thực hiện kiểm tra loại thời gian chạy │
│ Chẳng hạn như: path Có string, Không number │
├──────────────────────────────────────────────────┤
│ Không. 3 bước: beforeToolCall(Móc trước) │
│ Chặn quyền của lớp sản phẩm, Có thể ngăn chặn việc thực thi │
│ Trở lại { block: true, reason: "Lệnh nguy hiểm"} │
├──────────────────────────────────────────────────┤
│ Không. 4 bước: tool.execute(thực hiện thực tế) │
│ công cụ gọi điện execute chức năng │
│ hỗ trợ onUpdate Truyền phát lại tiến trình gọi lại │
├──────────────────────────────────────────────────┤
│ Không. 5 bước: afterToolCall(móc phía sau) │
│ Xử lý hậu kỳ kết quả lớp sản phẩm, Giá trị trả về có thể được sửa đổi │
│ có thể được thay thế content, details, isError │
└──────────────────────────────────────────────────┘
 │
 ▼
ToolResultMessage
```


### Bước 1: `prepareArguments`: miếng đệm tương thích

API của các model khác nhau có những khác biệt tinh tế khi serialize tham số tool. `prepareArguments` chính là lớp tương thích chuẩn bị cho những khác biệt này.

Ví dụ, tool `Edit` kỳ vọng `edits` là array. Nếu tool không định nghĩa `prepareArguments`, tham số được truyền thẳng. Code ở bước này rất đơn giản: có thì dùng, không có thì bỏ qua.

**Tại sao không gộp xử lý trong Schema validation?** Vì chúng quan tâm chuyện khác nhau. `prepareArguments` là "tôi biết model cụ thể nào sẽ mắc lỗi gì": lớp tương thích: chỉ xử lý các vấn đề đã biết của model cụ thể. `validateToolArguments` là "bất kể ai gọi tôi cũng phải xác thực": lớp an toàn: bảo đảm kiểu tham số đúng. Một là tương thích, một là đúng đắn; trộn lẫn sẽ khiến code khó bảo trì.


```
// Mô hình này thực sự xuất phát từ(Một số mô hình JSON Mảng được tuần tự hóa thành chuỗi)
{ edits: "[{\"oldText\":\"hello\",\"newText\":\"world\"}]" }

// đã vượt qua prepareArguments Sau khi xử lý
{ edits: [{ oldText: "hello", newText: "world" }] }
```


### Bước 2: `validateToolArguments`: xác thực Schema

Sau khi tiền xử lý, tham số còn phải qua một lần kiểm tra kiểu runtime của TypeBox. Ví dụ, `path` được định nghĩa là `string`, nhưng model truyền vào số:

Lỗi xác thực được `try-catch` của `prepareToolCall` bắt lại, tạo ra một `ToolResultMessage` lỗi. **Tool sẽ không bao giờ nhận tham số sai kiểu.**

### Bước 3: `beforeToolCall`: hook trước (có thể chặn thực thi)

Sau khi tham số được xác thực, trước khi thực thi, tầng sản phẩm còn một cơ hội chặn nữa. `beforeToolCall` là một hàm callback có thể kiểm tra lệnh có nguy hiểm không:

| Giá trị trả về | Hiệu ứng |
| --- | --- |
| `undefined` | cho qua, tiếp tục thực thi tool |
| `{ block: true, reason: "Lệnh nguy hiểm" }` | chặn thực thi, tạo `ToolResultMessage` lỗi |

**Lưu ý**: dù tool bị chặn, kết quả vẫn là một `ToolResultMessage` bình thường, chỉ là có `isError: true`. Model sẽ thấy message lỗi này, biết lệnh bị từ chối, rồi quyết định bước tiếp theo (đổi lệnh khác, hoặc giải thích với người dùng tại sao không thể thực thi). **Cả quá trình không ném exception nào và không làm đứt vòng lặp.**

### Bước 4: `tool.execute`: thực sự thực thi

Sau khi 3 bước trước qua được, hàm `execute` của tool được gọi thật sự. Cùng xem lại chữ ký của nó:


```
Before: { path: 12345 }
After: Xác thực không thành công → Báo cáo lỗi → Không thực thi công cụ
```


Bốn tham số: `toolCallId` là ID của lần gọi này, `params` là tham số đã xác thực, `signal` là `AbortSignal` dùng để hủy (kích hoạt khi người dùng nhấn Ctrl+C). Còn tham số thứ tư, `onUpdate`, là gì?

**Nó giải quyết vấn đề "nhận biết tiến độ tác vụ dài".** Giả sử tool Bash phải chạy lệnh 30 giây: nếu chỉ có thể báo ra ngoài ở hai thời điểm "bắt đầu thực thi" và "thực thi xong", trong 30 giây đó người dùng chỉ có thể nhìn chằm chằm vào hiệu ứng loading. `onUpdate` cho phép tool **đẩy message ra ngoài trong khi thực thi**: tool Bash mỗi 100ms đẩy output terminal hiện tại, tool Grep mỗi khi tìm được một loạt match thì đẩy, tool Read khi đọc file lớn có thể báo tiến độ theo từng đoạn. Những lần đẩy này được gói thành event `tool_execution_update` và cuối cùng chảy về UI.

Nói ngắn gọn: **không có `onUpdate`, việc thực thi tool là hộp đen; có nó, việc thực thi tool là "có thể quan sát".** Đây là cơ chế then chốt giúp tool báo cáo tiến độ cho người dùng theo thời gian thực.

Nhưng có một trường hợp cạnh cần xử lý. `execute` của tool là hàm async; sau khi nó `return`, bên trong có thể vẫn còn thao tác async chưa kết thúc: ví dụ tiến trình con của tool Bash vẫn đang in nốt mấy dòng log sau khi lệnh chính đã trả về. Nếu những callback trễ này vẫn đẩy dữ liệu vào `onUpdate`, chúng sẽ làm nhiễu một tool call đã kết thúc, khiến ngữ cảnh UI rối loạn. Pi dùng cờ `acceptingUpdates` để giải quyết: ngay khi `execute` trả về (hoặc ném lỗi), lập tức tắt cờ; mọi lần gọi `onUpdate` sau đó đều bị âm thầm bỏ. Đây là chi tiết phòng vệ kỹ thuật, không phức tạp, nhưng phải có.

Những message do `onUpdate` đẩy ra cuối cùng chảy về đâu? Câu hỏi này rất quan trọng: nó là chủ đề cốt lõi của chương sau, "hệ thống message", sẽ mở rộng ở đó. Ở đây bạn chỉ cần nhớ: việc thực thi tool không phải hộp đen, tiến độ có thể quan sát.

Nếu `tool.execute()` ném exception thì sao? Đừng lo, §4 sẽ giải thích chi tiết: tiết lộ trước: exception sẽ được dịch thành một message `isError: true` gửi cho model.

### Bước 5: `afterToolCall`: hook sau (có thể sửa kết quả)

Sau khi tool thực thi xong, tầng sản phẩm còn một cơ hội sửa kết quả. `afterToolCall` có thể làm những việc sau:

| Tình huống | Cần làm | Cách làm |
| --- | --- | --- |
| Bịt thông tin nhạy cảm | Thay thế thông tin nhạy cảm mà tool trả về | Trả về `{ content: [{type:"text", text:"[ĐÃ BỊT]"}] }` |
| Kiểm tra | Ghi lại thông tin chi tiết của tool call | Đọc result, ghi log, trả về `undefined` (không đổi result) |
| Sửa lỗi | Biến kết quả lỗi của tool thành kết quả bình thường | Trả về `{ isError: false, content: [...] }` |
| Dừng sớm | Agent dừng lại sau batch hiện tại | Trả về `{ terminate: true }` |

Ngữ nghĩa gộp là ghi đè cấp trường: cung cấp thì thay, không cung cấp thì giữ giá trị gốc.

### Điểm kết thúc pipeline: `ToolResultMessage`

Đi hết 5 bước, bất kể giữa chừng xảy ra chuyện gì, sản phẩm cuối cùng luôn là một `ToolResultMessage`:


```
execute: (toolCallId, params, signal, onUpdate) => Promise<AgentToolResult>
```


Message này được nối vào lịch sử hội thoại, vòng lặp sau gửi cho model làm context. Model thấy "nội dung file là thế này", rồi quyết định bước tiếp: có thể sửa, có thể đọc file khác, có thể trả lời người dùng luôn.

**Mọi lỗi cuối cùng đều trở thành cùng một thứ: một `ToolResultMessage` có `isError: true`.** Model thấy message lỗi, biết có chuyện, rồi tự quyết định xử lý. Tại sao thiết kế này là best practice? §4 sẽ phân tích kỹ.

---

## 3. Song song vs tuần tự: một batch tool không phải là "chạy chung là xong"

**Chú thích hình:** Phía trên cùng là quyết định "một phiếu phủ quyết": chỉ cần một tool khai báo `sequential`, cả batch chạy tuần tự. Bên trái là thiết kế ba pha màu xanh (chuẩn bị tuần tự -> thực thi song song -> sự kiện có thứ tự), bên phải là thác tuần tự màu đen. Phần đáy giải thích "tại sao pha chuẩn bị phải tuần tự" và "khi nào dùng tuần tự".

### Model thường gọi nhiều tool cùng lúc

Trong vòng lặp trong của Agent Loop, một phản hồi của model có thể chứa nhiều ToolCall:


```
{
 role: "toolResult",
 toolCallId: "call_abc123", // liên quan đến bản gốc ToolCall
 toolName: "read",
 content: [{ type: "text", text: "1│ import { Agent }..." }],
 details: { language: "typescript" }, // cho UI siêu dữ liệu
 isError: false, // Đây có phải là kết quả lỗi không?
 timestamp: 1700000000000,
}
```


Ba ToolCall, đều là thao tác chỉ đọc. Trực giác mách bảo ta nên chạy song song: dùng `Promise.all` chạy chung, tiết kiệm thời gian.


```
assistantMessage.content = [
 { type: "text", text: "Hãy để tôi kiểm tra tập tin" },
 { type: "toolCall", id: "call_1", name: "read", arguments: {path: "a.ts"} },
 { type: "toolCall", id: "call_2", name: "grep", arguments: {pattern: "TODO"} },
 { type: "toolCall", id: "call_3", name: "find", arguments: {pattern: "*.test.ts"} },
]
```


### Nhưng song song không phải là `Promise.all` một cách máy móc

Nếu trong ba ToolCall có hai cái là `edit` (cùng sửa một file), chạy song song sẽ ghi đè lẫn nhau:

Vì vậy Pi cần một cơ chế để phán định "tool nào chạy song song được, tool nào bắt buộc tuần tự".

### Chiến lược điều phối của Pi: một phiếu phủ quyết

Chiến lược của Pi rất đơn giản: **chỉ cần một tool được đánh dấu `sequential`, cả batch chạy tuần tự**:

**Tại sao lại một phiếu phủ quyết thay vì chỉ chạy tuần tự các tool xung đột?** Vì "tool nào sẽ xung đột" rất khó phán đoán chính xác. Hai lệnh `edit` khác file thì có thể chạy song song không? Lỡ các file chúng sửa có quan hệ phụ thuộc thì sao? Pi chọn chiến lược bảo thủ: **thà đợi lâu còn hơn sai**.


```
ToolCall 1: edit { path: "app.ts", oldText: "v1", newText: "v2" }
ToolCall 2: edit { path: "app.ts", oldText: "v3", newText: "v4" }
 ^^^^^^^^
 cùng một tập tin！Thực thi song song → ToolCall 1 Việc sửa đổi đã ToolCall 2 Bìa
```


### Thiết kế ba pha của thực thi song song

Khi quyết định được là có thể song song, Pi không đơn giản `Promise.all` rồi xong: nó tách quá trình thực thi thành ba pha:

Tại sao thiết kế thế này? Vì **pha chuẩn bị có thể có tác dụng phụ** (`beforeToolCall` có thể sửa trạng thái chia sẻ), phải chạy tuần tự. Còn **thứ tự message kết quả mà model phụ thuộc là thứ tự gọi** (model yêu cầu `read` trước rồi `grep`, message phải theo đúng thứ tự đó), nên `ToolResultMessage` phải có thứ tự. Chỉ `tool.execute()` là thật sự song song.

> Còn một chi tiết: cả 7 tool dựng sẵn trong v0.80.2 (read/write/edit/bash/grep/find/ls) **đều không khai báo `executionMode` một cách tường minh**, đều mặc định `"parallel"` (kiểu `ToolExecutionMode` ở `agent/src/types.ts:41`, runtime chỉ kiểm tra có phải `"sequential"` không tại `agent-loop.ts:382`, không khai báo được coi là song song). Vậy tool Edit đảm bảo an toàn file bằng cách nào? Câu trả lời là hàng đợi đột biến file nội bộ của tool `withFileMutationQueue` (hàng đợi đột biến file, `file-mutation-queue.ts:32-61`): Edit gọi nó tại `edit.ts:312`, đảm bảo serialize các thao tác sửa **cùng một file**. Đây là tuyến phòng vệ thứ hai mà tool tự dựng, không cần dựa vào khai báo `executionMode` bên ngoài. **Tool extension nếu cần tuần tự có thể khai báo tường minh `executionMode: "sequential"`.**


```
// Kiểm tra xem các công cụ nối tiếp có sẵn không
const hasSequentialToolCall = toolCalls.some(
 (tc) => tools?.find((t) => t.name === tc.name)?.executionMode === "sequential",
);

// Có công cụ nối tiếp → toàn bộ loạt nối tiếp; Không → Song song
if (config.toolExecution === "sequential" || hasSequentialToolCall) {
 return executeToolCallsSequential(...);
}
return executeToolCallsParallel(...);
```


---

## 4. Không bao giờ ném: lỗi tool cũng là một message

Trong pipeline 5 bước ở §2 ở trên, mỗi bước có lỗi đều được mã hóa thành một `ToolResultMessage` có `isError: true`. Có vẻ lỗi đã được xử lý rồi.

Nhưng bạn có thể hỏi: nếu bên trong `tool.execute()` ném một exception chưa bắt thì sao? Khi lập trình viên viết tool, chuyện gì cũng có thể xảy ra: file không tồn tại, quyền bị từ chối, lệnh hết giờ, JSON parse thất bại. Nếu những exception này không được xử lý, chúng sẽ xuyên suốt pipeline và phá vỡ Agent Loop.

Phần này trả lời: **khi thực thi tool lỗi, Pi xử lý thế nào? Tại sao cách xử lý này là "best practice"?**

### Đầu ra lỗi thống nhất: 6 loại lỗi, 1 loại sản phẩm

Nhìn lại toàn bộ pipeline 5 bước, mỗi bước của tool call đều có thể lỗi. Nhưng bạn sẽ thấy một quy luật đáng kinh ngạc: **bất kể bước nào lỗi, sản phẩm cuối cùng luôn là cùng một thứ: một `ToolResultMessage` có `isError: true`.**

| Bước nào lỗi | Xử lý thế nào | Sản phẩm cuối |
| --- | --- | --- |
| Không tìm thấy tool | trả về kết quả lỗi trực tiếp, không vào pipeline | `ToolResultMessage { isError: true, content: "Tool xxx not found" }` |
| `prepareArguments` ném lỗi | bị try-catch bắt | `ToolResultMessage { isError: true, content: thông tin ngoại lệ }` |
| Schema validation thất bại | bị try-catch bắt | `ToolResultMessage { isError: true, content: mô tả lỗi xác thực }` |
| `beforeToolCall` chặn | trả về kết quả chặn | `ToolResultMessage { isError: true, content: lý do chặn }` |
| **`tool.execute` ném lỗi** | bị try-catch của `executePreparedToolCall` bắt | `ToolResultMessage { isError: true, content: thông tin ngoại lệ }` |
| `afterToolCall` ném lỗi | bị try-catch của `finalizeExecutedToolCall` bắt | `ToolResultMessage { isError: true, content: thông tin ngoại lệ }` |

Chú ý cột bên phải: **hình thức cuối cùng của mọi lỗi đều là `ToolResultMessage`**. Không một lỗi nào thoát khỏi pipeline dưới dạng "ném ngoại lệ".


```
sân khấu 1 - chuẩn bị(thực hiện tuần tự): 
 ToolCall 1: emit_start → prepareArguments → validate → beforeToolCall
 ToolCall 2: emit_start → prepareArguments → validate → beforeToolCall
 ToolCall 3: emit_start → prepareArguments → validate → beforeToolCall
 // Giai đoạn chuẩn bị phải theo trình tự, bởi vì beforeToolCall có thể có tác dụng phụ(Chẳng hạn như sửa đổi trạng thái toàn cầu)

sân khấu 2 - thi hành(Song song): 
 ToolCall 1: execute ────────────────┐
 ToolCall 2: execute ───────────────┤ Promise.all
 ToolCall 3: execute ───────────────┘
 // chỉ tool.execute() Song song

sân khấu 3 - Gửi sự kiện(có trật tự): 
 ToolCall 2: emit_end ← Đầu tiên về đích đầu tiên tool_execution_end
 ToolCall 1: emit_end
 ToolCall 3: emit_end
 ToolCall 1: emit_result ← Nhưng ToolResultMessage Gửi theo thứ tự gọi
 ToolCall 2: emit_result
 ToolCall 3: emit_result
```


### Code then chốt: bảo vệ kép cho `tool.execute`

Tầng then chốt nhất nằm ở `executePreparedToolCall()`: nó bao bọc `tool.execute()`, khâu dễ lỗi nhất:

Đoạn code này làm ba việc, mỗi việc ứng với một quyết định kỹ thuật then chốt:

**1. Exception bị bắt, không lan truyền.** Bất kể `tool.execute()` ném exception gì: `ENOENT` file không tồn tại, `EACCES` quyền bị từ chối, `TIMEOUT` lệnh hết giờ, `SyntaxError` JSON parse thất bại: đều dừng ở đây.

**2. Exception được "dịch" thành kết quả bình thường.** Khối catch gọi `createErrorToolResult(error.message)`, biến đối tượng exception thành một `AgentToolResult`: trông giống hệt kết quả bình thường, chỉ là `content` chứa văn bản mô tả lỗi. Từ khoảnh khắc đó, nó không còn là "exception" nữa mà là "một message được đánh dấu lỗi".

**3. Event tiến độ được đẩy hết trước khi mã hóa lỗi.** `await Promise.all(updateEvents)` trong khối catch không phải tùy chọn: nó bảo đảm mọi event `tool_execution_update` đã phát trong quá trình thực thi tool đều được gửi đi trước khi message lỗi được phát. Nếu không, thứ tự event sẽ lộn xộn và UI sẽ thấy hình ảnh kỳ quặc là "tool báo lỗi trước, rồi mới nhổ ra dòng tiến độ cuối cùng".


```
// packages/agent/src/agent-loop.ts:628-669
async function executePreparedToolCall(prepared, signal, emit) {
 const updateEvents: Promise<void>[] = [];
 let acceptingUpdates = true; // Công cụ Promise settle Đóng sau

 try {
 const result = await prepared.tool.execute(
 prepared.toolCall.id,
 prepared.args,
 signal,
 (partialResult) => {
 if (!acceptingUpdates) return; // settle Cuộc gọi lại mồ côi sau
 updateEvents.push(/* ... gửi tool_execution_update ... */);
 },
);
 acceptingUpdates = false;
 await Promise.all(updateEvents);
 return { result, isError: false };

 } catch (error) {
 acceptingUpdates = false;
 // chìa khóa: Đợi tất cả các sự kiện tiến trình được gửi trước, Sau đó mã hóa ngoại lệ thành tin nhắn
 await Promise.all(updateEvents);
 return {
 result: createErrorToolResult(
 error instanceof Error ? error.message: String(error)
),
 isError: true,
 };
 } finally {
 acceptingUpdates = false; // Hãy ghi nhớ mọi thứ: Đóng cửa xả lũ bằng mọi giá
 }
}
```


### Exception -> message: so sánh trước/sau khi mã hóa

Bảng so sánh dưới đây cho thấy bản chất của "exception được dịch thành message":

Sự khác biệt giữa exception và message không nằm ở "nội dung là gì": cả hai mô tả cùng một chuyện: mà nằm ở **người nhận là ai**. Người nhận của exception là call stack (framework bên ngoài), nó sẽ làm đứt vòng lặp; người nhận của message là model, nó sẽ tiêu hóa lỗi rồi tiếp tục. Pi chọn cách dịch exception thành message, biến "lỗi tool" thành một dòng thông tin bình thường, có thể xử lý được và model nhìn thấy được.

### Tại sao "ngụy trang thành message" là cách xử lý tốt nhất?

Bạn có thể nghĩ: ném exception ra ngoài cho tầng trên xử lý thống nhất cũng được chứ? Sao phải mất công dịch thành message "trông như kết quả bình thường"?

Cốt lõi của câu trả lời là: **để model tự quyết định bước tiếp theo tốt hơn là framework quyết thay nó.**

Xét các tình huống lỗi tool thực tế sau:

| Tình huống lỗi | Phản ứng hợp lý sau khi model thấy message lỗi |
| --- | --- |
| `read("/path/a.ts")` báo "file không tồn tại" | Model có thể trước `ls` xem trong thư mục có gì, tìm đúng tên file rồi đọc |
| `edit` báo "oldText không tìm thấy trong file" | Model có thể trước `read` file xem nội dung thật, chỉnh oldText rồi thử lại |
| `bash("npm run build")` báo "không tìm thấy module" | Model có thể `npm install` rồi build lại |
| `bash("rm -rf /")` bị `beforeToolCall` chặn | Model thấy lý do chặn, đổi cách viết an toàn hơn hoặc giải thích với người dùng |

Trong mỗi tình huống, **bước tiếp theo đúng đắn là khác nhau, và chỉ có model đủ ngữ cảnh để quyết định đi đường nào**. Framework không biết "file không tồn tại" là do gõ sai đường dẫn hay do nên chọn file khác; model biết: nó biết mình vừa định làm gì, biết cấu trúc file của dự án (các kết quả read/grep trước đó đều nằm trong lịch sử hội thoại), biết ý định thật của người dùng.

Nếu framework ném thẳng exception làm đứt vòng lặp, nó từ bỏ mọi khả năng tự sửa lỗi của model: người dùng chỉ có thể khởi động lại thủ công sau khi Agent sập. Nhưng nếu mã hóa lỗi thành message gửi cho model, model có cơ hội **tự nghĩ ra phương án khắc phục** như bảng trên. Đây là một trong những then chốt khiến Agent "thông minh" hơn script truyền thống: lỗi không chấm dứt luồng, mà trở thành input cho quyết định tiếp theo.

**Vậy triết lý xử lý lỗi tool của Pi có thể tóm gọn trong một câu: message lỗi là phản hồi cho model, không phải tín hiệu kết thúc cho framework.**


```
Ngoại lệ ban đầu do công cụ đưa ra(catch trước đây): được mã hóa ToolResultMessage(catch sau): 
Error: ENOENT: no such file or dir {
 → tất cả các cách thông qua đường ống role: "toolResult",
 → làm gián đoạn Agent Loop toolCallId: "call_abc",
 → Chuỗi sự kiện không đầy đủ, UI bị mắc kẹt toolName: "read",
 content: [{
 type: "text",
 text: "ENOENT: no such file or dir"
 }],
 isError: true ← thẻ duy nhất
 }
 → Thêm vào lịch sử cuộc trò chuyện
 → Mô hình sẽ được gửi vào vòng tiếp theo
 → Quyết định những việc cần làm sau khi xem mô hình
```


### Chi tiết then chốt: mô tả lỗi càng cụ thể, khả năng tự sửa của model càng mạnh

Đến đây bạn có thể hiểu nhầm: "vì framework cũng sẽ mã hóa exception thành message, vậy trong tool mình cứ `throw new Error("failed")` đại đi?"

**Tuyệt đối không.** Nội dung message lỗi trực tiếp quyết định model có tự sửa được không. So sánh hai tình huống:

Model thấy "Read failed" chỉ có thể mù quáng thử lại hoặc bỏ cuộc; thấy "Offset 200 is beyond end of file (100 lines total)" sẽ hiểu ngay "à, file chỉ có 100 dòng, mình gán offset sai", lần sau cho `offset: 50` là xong. **Mô tả lỗi cụ thể chính là gợi ý "sửa thế nào cho đúng" cho model.**

### Cách làm thật của Pi: xử lý lỗi hai lớp, phân công theo lớp

Nhìn lại source code xem các tool của Pi làm thế nào, bạn sẽ thấy nó **không dựa vào lưới an toàn của framework**, mà ngay trong tool đã viết mô tả lỗi rất cụ thể:

**Tool Read** (`read.ts:275`): khi vượt biên thì kèm tổng số dòng của file:

**Tool Edit** (`edit.ts:330`): kèm đường dẫn file và lỗi gốc:

**Tool Bash** (`bash.ts:390-407`): đoạn này là kiểu mẫu "chủ động nhận diện + đóng gói lại":


```
Lỗi mơ hồ(Không nên): cụ thể error.message(Được đề xuất): 
{ {
 content: [{ text: "Read failed" }] content: [{
 isError: true text: "Offset 200 is beyond end of file (100 lines total)"
} }]
 isError: true
 }
```


Chú ý chiến lược của Bash: nó **chủ động nhận diện** các loại lỗi đã biết (abort, timeout, exit code khác không), mỗi loại đều được `appendStatus(text,. ..)` đóng gói "nội dung đã output" và "lý do cụ thể" vào một Error mới. Chỉ khi gặp exception thật sự không nhận diện được thì mới `throw err` nguyên bản.

Đây là thiết kế thật của Pi: **xử lý lỗi hai lớp, phân công theo lớp**.

**Lớp 1 (bên trong tool, chủ động)**: nhận diện các loại lỗi đã biết, đóng gói thành mô tả cụ thể, dễ đọc
 - Read / Edit / Bash đều làm vậy: Bash còn kèm "nội dung đã output" vào lỗi
 - Mục đích: cung cấp cho model manh mối cụ thể "tại sao lỗi, sửa thế nào"

**Lớp 2 (lưới an toàn framework, bị động)**: catch của `executePreparedToolCall`
 - Chỉ vào cuộc khi tool không nhận diện được lỗi
 - Không tạo mô tả lỗi mới, chỉ chuyển nguyên `error.message` cho model
 - Mục đích: bảo đảm không exception nào xuyên đến Agent Loop


```
if (startLine >= allLines.length) {
 throw new Error(`Offset ${offset} is beyond end of file (${allLines.length} lines total)`);
}
```


**Tool Read** (`read.ts:275`): khi vượt biên thì kèm tổng số dòng của file:

Catch lưới an toàn trong `executePreparedToolCall` dùng chính `error.message` mà tool tự ném:

Thân hàm `createErrorToolResult` chỉ có ba dòng (`agent-loop.ts:716-721`), nó không làm bất kỳ "mô tả thống nhất" nào: tool viết message gì thì model thấy đó. **Vậy tool đóng gói lỗi bên trong càng cụ thể, model thấy message lỗi càng hữu ích.**


```
throw new Error(`Could not edit file: ${path}. ${errorMessage}.`);
```


**Tool Edit** (`edit.ts:330`): kèm đường dẫn file và lỗi gốc:

**Tool Bash** (`bash.ts:390-407`): đoạn này là kiểu mẫu "chủ động nhận diện + đóng gói lại":


```
} catch (err) {
 const snapshot = await finishOutput(); // Đầu tiên sửa nội dung đầu ra
 const { text } = formatOutput(snapshot, "");
 if (err instanceof Error && err.message === "aborted") {
 throw new Error(appendStatus(text, "Command aborted"));
 // ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
 // đóng gói lại: Đã đính kèm"Đầu ra trước khi hủy bỏ" + "trạng thái hủy bỏ"
 }
 if (err instanceof Error && err.message.startsWith("timeout:")) {
 const timeoutSecs = err.message.split(":")[1];
 throw new Error(appendStatus(text, `Command timed out after ${timeoutSecs} seconds`));
 }
 if (exitCode !== 0 && exitCode !== null) {
 throw new Error(appendStatus(outputText, `Command exited with code ${exitCode}`));
 }
 throw err; // ← chìa khóa: Ngoại lệ không được công nhận, Ném như cũ, Để nó vào khuôn khổ
}
```


Chú ý chiến lược của Bash: nó **chủ động nhận diện** các loại lỗi đã biết (abort, timeout, exit code khác không), mỗi loại đều được `appendStatus(text,. ..)` đóng gói "nội dung đã output" và "lý do cụ thể" vào một Error mới. Chỉ khi gặp exception thật sự không nhận diện được thì mới `throw err` nguyên bản.

Đây là thiết kế thật của Pi: **xử lý lỗi hai lớp, phân công theo lớp**.


```
tầng một(Bên trong công cụ, Hãy chủ động): Xác định các loại lỗi đã biết, Đóng gói thành một mô tả cụ thể có thể đọc được
└── Read/Edit/Bash Tất cả đều như thế này:Bash thậm chí đặt"Những gì đã được xuất ra"Kèm theo lỗi
└── mục đích: Cung cấp cho mô hình"tại sao thất bại, Làm thế nào để thay đổi nó?"manh mối cụ thể

tầng hai(Bìa khung, Bị động): executePreparedToolCall của catch
└── Chỉ có hiệu lực khi công cụ không được nhận dạng
└── Không tạo mô tả lỗi mới, Chỉ cần đặt error.message Được chuyển vào mô hình một cách minh bạch như hiện tại
└── mục đích: Đảm bảo rằng mọi trường hợp ngoại lệ sẽ không xâm nhập Agent Loop
```


Catch lưới an toàn trong `executePreparedToolCall` dùng chính `error.message` mà tool tự ném:

Thân hàm `createErrorToolResult` chỉ có ba dòng (`agent-loop.ts:716-721`), nó không làm bất kỳ "mô tả thống nhất" nào: tool viết message gì thì model thấy đó. **Vậy tool đóng gói lỗi bên trong càng cụ thể, model thấy message lỗi càng hữu ích.**


```
} catch (error) {
 return {
 result: createErrorToolResult(error instanceof Error ? error.message: String(error)),
 // ^^^^^^^^^^^^^^^^
 // Mô tả chi tiết về bao bì bên trong của dụng cụ, Khung không di chuyển nó, chỉ vận chuyển
 isError: true,
 };
}
```


### Best practice khi viết custom tool

Mượn cách viết của tool Bash, `execute` của custom tool nên có dạng thế này:

**Hai nguyên tắc then chốt**:

1. **Lỗi nhận diện được thì phải đóng gói**: kèm manh mối "lỗi gì, tại sao, làm thế nào". Ví dụ "file không tồn tại" mạnh hơn "thao tác thất bại" 10 lần; "file /a.ts không tồn tại, trong thư mục có [b.ts, c.ts]" lại mạnh hơn "file không tồn tại" thêm 10 lần nữa.
2. **Lỗi không nhận diện được thì đừng cứng mô tả**: cứ `throw err`, để catch lưới an toàn của framework chuyển `err.message` nguyên văn. **Đừng viết `throw new Error("Thao tác thất bại")` và những mô tả mơ hồ tương tự**: như vậy là quét tất cả lỗi chưa biết thành cùng một màu, model không phân biệt được.

**Đó là lý do "kể cả lỗi chưa biết cũng phải thành một message"**: không có nghĩa là "mô tả thống nhất lỗi chưa biết thành 'có chuyện'" mà là "để catch lưới an toàn của framework tiếp quản, ít nhất bảo đảm exception chưa biết cũng được dịch thành message `isError: true` gửi cho model, chứ không xuyên qua làm đứt vòng lặp". Mô tả lỗi vẫn nên cụ thể nhất có thể; chỉ khi thật sự không nhận diện được thì mới để `err.message` chuyển nguyên cho model.


```
execute: async (id, params, signal, onUpdate) => {
 try {
 // ... logic kinh doanh
 return { content: [...], details: {...} };
 } catch (err) {
 // Không. 1 bước: Xác định các loại lỗi đã biết, Đóng gói lại thành mô tả cụ thể
 if (err instanceof MyKnownErrorA) {
 throw new Error(`mô tả cụ thểA: ${err.message}. Đề xuất sửa lỗi...`);
 }
 if (err instanceof MyKnownErrorB) {
 throw new Error(`mô tả cụ thểB: ${err.message}. lý do có thể...`);
 }
 // Không. 2 bước: Những điều bất thường thực sự không thể nhận ra, Ném như cũ, Hãy để khuôn khổ tiếp quản
 throw err;
 }
}
```


### Tóm gọn một câu

Khi thực thi tool lỗi, Pi không ném exception làm đứt vòng lặp, mà mã hóa lỗi thành một `ToolResultMessage` có `isError: true` gửi cho model. Then chốt ở đây là **phân công hai lớp**: bên trong tool cố gắng nhận diện các lỗi đã biết, đóng gói thành mô tả cụ thể "tại sao sai, sửa thế nào" (xem try-catch của tool Bash); lớp lưới an toàn framework chỉ tiếp quản khi tool không nhận diện được, chuyển `error.message` nguyên văn cho model. Model nhận được thông tin lỗi cụ thể sẽ tự quyết định bước tiếp: thử lại, đổi đường dẫn, hoặc giải thích với người dùng. Đó là lý do Agent Loop của Pi có thể ổn định trong những tình huống thực tế mà tool hay lỗi.

---

## 5. [Nâng cao] Trừu tượng Operations: thực thi tool không giống gọi hệ thống

> Phần này thuộc kỹ thuật triển khai phần mềm, không liên quan nhiều đến bản thân Agent. Nếu bạn chỉ quan tâm cơ chế vận hành của Agent, có thể bỏ qua.

### Vấn đề: code tool gọi cứng system call

Tool Read muốn đọc file, cách viết trực quan nhất:

Nhưng nếu bạn muốn **mock filesystem trong test**? Muốn tool **đọc file remote qua SSH**? Muốn tool **chạy trong Docker container**?

`fs.readFileSync` bị ghi cứng: nó chỉ nhận filesystem cục bộ. Muốn đổi môi trường thực thi, phải sửa code tool.


```
const content = fs.readFileSync(path, "utf-8");
```


### Giải pháp: tool không gọi trực tiếp API hệ thống, mà gọi interface

Mỗi tool của Pi không gọi trực tiếp `fs`, `child_process` hay các API hệ thống khác. Nó định nghĩa một interface tối thiểu, tool chỉ phụ thuộc interface, không phụ thuộc cài đặt cụ thể.

Lấy tool Read làm ví dụ:

Bên trong hàm `execute` của tool Read, mọi thao tác file đều được gọi qua đối tượng `ops`:

**Khác biệt then chốt:** gọi trực tiếp so với qua interface. Với lệnh `fs` trực tiếp, tool Read chỉ đọc được file cục bộ và test phải tạo file thật. Qua interface `Operations`, tiêm cái gì thì gọi cái đó.


```
export interface ReadOperations {
 readFile: (absolutePath: string) => Promise<Buffer>;
 access: (absolutePath: string) => Promise<void>;
 detectImageMimeType?: (absolutePath: string) => Promise<string | null>;
}
```


Bên trong hàm `execute` của tool Read, mọi thao tác file đều được gọi qua đối tượng `ops`:


```
execute: async (toolCallId, params, signal, onUpdate, ctx) => {
 const ops = options?.operations ? defaultReadOperations;
 await ops.access(absolutePath); // Kiểm tra quyền thông qua giao diện
 const buffer = await ops.readFile(absolutePath); // Đọc tập tin thông qua giao diện
 // ...
}
```


**Khác biệt then chốt:**


```
Điều chỉnh trực tiếp fs(được mã hóa cứng): Vượt qua Operations giao diện(Có thể thay thế): 
┌──────────────────────┐ ┌──────────────────────┐
│ Read Công cụ │ │ Read Công cụ │
│ fs.readFile(path) │ │ ops.readFile(path) │
│ Chỉ có thể đọc các tập tin cục bộ │ │ địa phương / SSH / Mock │
│ Kiểm thử phải tạo file thật │ │ Điều chỉnh bất cứ thứ gì bạn tiêm. │
└──────────────────────┘ └──────────────────────┘
```


Operations được closure capture **lúc tạo tool**. Mọi lần thực thi sau đều dùng chung một cài đặt. Môi trường khác nhau tiêm cài đặt Operations khác nhau, code tool không đổi một dòng:


```
// thực thi cục bộ(Mặc định)
const tool = createReadToolDefinition(cwd); // sử dụng defaultReadOperations

// Kiểm tra đơn vị(Mock)
const tool = createReadToolDefinition(cwd, {
 operations: {
 readFile: () => Buffer.from("mock file content"), // Không cần tạo tập tin thực
 access: () => {}, // Nếu không có ngoại lệ nào được đưa ra thì tệp đó tồn tại.
 }
});

// thực thi từ xa(SSH, giả thuyết)
const tool = createReadToolDefinition(cwd, {
 operations: {
 readFile: (path) => sshExec(`cat ${path}`),
 access: (path) => sshExec(`test -r ${path}`),
 }
});
```


### Mỗi tool tự định nghĩa interface tối thiểu của mình

Nhìn vào interface Operations của 7 tool dựng sẵn, chúng đều tối thiểu và theo nhu cầu, không phải một cỡ duy nhất. **Mỗi tool chỉ khai báo đúng các method nó cần, không hơn không kém.**

| Tool | Interface | Methods |
| --- | --- | --- |
| Read | `ReadOperations` | `readFile`, `access` (có thêm `detectImageMimeType` tuỳ chọn) |
| Write | `WriteOperations` | `writeFile`, `mkdir` |
| Edit | `EditOperations` | `readFile`, `writeFile`, `access` |
| Bash | `BashOperations` | `exec` |
| Grep | `GrepOperations` | `isDirectory`, `readFile` |
| Find | `FindOperations` | `exists`, `glob` |
| Ls | `LsOperations` | `exists`, `stat`, `readdir` |

Tool Read không cần ghi file, nên `ReadOperations` không có `writeFile`. Tool Grep chỉ cần kiểm tra đường dẫn và đọc nội dung file để hiển thị ngữ cảnh, nên interface của nó là tối giản nhất. **Mỗi tool chỉ khai báo đúng các method nó cần, không hơn không kém.**

> Source: `read.ts:43-50` / `write.ts:25-30` / `edit.ts:74-81` / `bash.ts:40-58` / `grep.ts:51-56` / `find.ts:41-46` / `ls.ts:32-39`

---

## 6. Chắt lọc phương pháp luận

Nhìn lại toàn bộ hệ thống tool, có bốn design pattern đáng dùng lại trong dự án Agent của bạn:

**1. Phương pháp interface phân lớp tiến triển**: lớp nền chỉ lo "có thể mô tả" (Tool), lớp runtime thêm "có thể thực thi" (AgentTool), lớp sản phẩm thêm "có thể hiển thị và mở rộng" (ToolDefinition). Thông qua wrapper để cầu nối khác biệt giữa các lớp.

**2. Mẫu Pipeline + Hooks**: luồng cốt lõi là một pipeline (prepare -> validate -> execute), trước và sau pipeline có mỗi một hook (before/after), có thể chặn hoặc sửa. Lỗi ở bất kỳ bước nào trong pipeline đều không ném exception, đều được mã hóa thống nhất thành message bình thường.

**3. Nguyên tắc lỗi là message**: mỗi lỗi ở mỗi bước thực thi tool đều được mã hóa thống nhất thành một `ToolResultMessage` có `isError: true` gửi cho model. Model tự quyết định bước tiếp dựa trên thông tin lỗi: thử lại, đổi đường dẫn, hoặc giải thích với người dùng. Kể cả exception chưa biết cũng được `String(error)` bắt làm message dự phòng; không bao giờ để exception thô xuyên qua làm đứt Agent Loop.

**4. Trừu tượng Operations**: tool không gọi trực tiếp API hệ thống, mà gián tiếp qua một interface Operations tối thiểu. Test có thể mock, remote có thể SSH, không cần sửa code tool.

---

## 7. Kết thúc

Quay lại câu hỏi mở đầu: "khi model nói 'đọc file này', thật ra đã xảy ra chuyện gì?"

Giờ bạn đã có câu trả lời đầy đủ:


```
Đầu ra mô hình ToolCall { name: "read", arguments: { path: "src/main.ts" } }
 │
 ├── Không. 1 bước: prepareArguments Xử lý các vấn đề của mô hình
 ├── Không. 2 bước: validateToolArguments làm Schema Xác minh
 ├── Không. 3 bước: beforeToolCall Kiểm tra quyền
 ├── Không. 4 bước: tool.execute Vượt qua Operations Giao diện đọc file
 │ └── ops.readFile() → Không điều chỉnh trực tiếp fs
 └── Không. 5 bước: afterToolCall Xử lý hậu kỳ kết quả
 │
 ▼
ToolResultMessage { content: Nội dung tập tin, isError: false }
 │
 ▼ Thêm vào lịch sử cuộc trò chuyện, Mô hình sẽ được gửi vào vòng tiếp theo
```


Tool không phải lệnh gọi hàm đơn giản, mà là một pipeline có kiểm soát. Xác thực tham số chặn dữ liệu rác, hook chặn thao tác nguy hiểm, trừu tượng Operations khiến cùng một đoạn code vừa chạy được ở local vừa chạy được ở remote. Mọi lỗi tool: từ xác thực tham số thất bại đến exception chưa biết do `execute` ném ra: đều được dịch thành một `ToolResultMessage` có `isError: true` gửi cho model, để model tự quyết định bước tiếp; vòng lặp sẽ không bao giờ sập vì lỗi tool.

Nhưng còn một câu hỏi: ai đang nghe các event `tool_execution_start`, `tool_execution_update`, `tool_execution_end` phát ra trong khi thực thi tool? Tại sao lõi Agent không cần biết gì về sự tồn tại của UI?

Chương sau, ta mở "hệ thống bộ nhớ" của Agent: hệ thống message. Không, khoan: trước đó còn một câu hỏi nền tảng hơn: rốt cuộc những message này trông thế nào? Cấu trúc của message kết quả tool, message phản hồi model, message người dùng nhập là gì? Message nội bộ của Agent có giống message gửi cho model không?

---

> **Chỉ mục source chính của chương này**:
> 
> `packages/ai/src/types.ts:433-437`: `Tool` (Lớp 1)
> `packages/agent/src/types.ts:371-394`: `AgentTool` (Lớp 2)
> `packages/coding-agent/src/core/extensions/types.ts:435-482`: `ToolDefinition` (Lớp 3)
> `packages/coding-agent/src/core/tools/tool-definition-wrapper.ts:5-18`: `wrapToolDefinition` (wrapper)
> `packages/agent/src/agent-loop.ts:562-626`: `prepareToolCall` (3 bước đầu của pipeline)
> `packages/agent/src/agent-loop.ts:628-669`: `executePreparedToolCall` (bước 4 + catch lưới an toàn framework)
> `packages/agent/src/agent-loop.ts:671-714`: `finalizeExecutedToolCall` (bước 5)
> `packages/agent/src/agent-loop.ts:716-721`: `createErrorToolResult` (hàm chuyển message lỗi)
> `packages/coding-agent/src/core/tools/bash.ts:390-407`: kiểu mẫu chủ động nhận diện lỗi của tool Bash
> `packages/coding-agent/src/core/tools/read.ts:275`: tool Read kèm tổng số dòng file
> `packages/coding-agent/src/core/tools/edit.ts:330`: tool Edit kèm đường dẫn file
> `packages/coding-agent/src/core/tools/read.ts:43-50`: `ReadOperations` (trừu tượng Operations)
