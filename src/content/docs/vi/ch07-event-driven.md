---
title: "Chương 7: Hướng sự kiện: Hệ thần kinh của Agent"
chapter: 7
slug: vi/ch07-event-driven
title_zh: "第7章：事件驱动: Agent 的神经系统"
title_en: "Chapter 7: Event-Driven: Agent's Nervous System"
title_vi: "Chương 7: Hướng sự kiện: Hệ thần kinh của Agent"
source_url: https://www.dgzhuya.com/modules/ch07-event-driven
language: vi
version_pairs:
 zh: zh/src/ch07-event-driven.md
 en: en/src/ch07-event-driven.md
 vi: vi/src/ch07-event-driven.md
original_chars: 3423
code_lines: 164
reading_minutes: 18
translator: hypnguyen1209
reviewed_by: null
last_updated: "2026-08-20"
status: translated
official_refs: []
terms_used: []
code_blocks: 15
mermaid_blocks: 0
---

# Chương 7: Hướng sự kiện: Hệ thần kinh của Agent

Trong sáu chương vừa qua, có một thứ cứ lặp đi lặp lại mà ta chưa đào sâu: **sự kiện** (event).

Chương 3 từng nói "Agent Loop mỗi bước đều phát event để UI cập nhật real time". Chương 5 từng nói "khi thực thi tool sẽ phát ra event `tool_execution_start`, `tool_execution_update`, `tool_execution_end`". Ở Chương 6, event khắp nơi đều mang theo `AgentMessage`.

Nhưng ta chưa trả lời: event rốt cuộc được truyền từ bên trong Agent ra ngoài bằng cách nào? Ai đang lắng nghe? Tại sao Agent phát event xong lại phải "chờ" listener xử lý xong mới tiếp tục?

Chương này sẽ mở "hệ thần kinh" của Agent.

> Từ chương này trở đi là phần nâng cao. Sáu chương đầu đã xây dựng sự hiểu biết toàn cảnh về cơ chế vận hành của Pi-Agent; từ đây bắt đầu đào sâu vào các chủ đề kỹ thuật.

---

## 1. Tại sao cần hệ thống sự kiện?

### Một trực giác: bắt đầu từ theo dõi đơn giao hàng

Bạn đặt một đơn giao đồ ăn trên Meituan. Sau khi đặt, App sẽ đẩy cho bạn một chuỗi cập nhật trạng thái: "quán đã nhận đơn" -> "tài xế đã lấy đồ" -> "tài xế cách 500m" -> "đã giao". Mỗi cập nhật trạng thái là một **event**: nó báo bạn biết "có chuyện xảy ra". Bạn không cần cứ nhìn chằm chằm vào vị trí tài xế; chỉ cần khi nhận event thì liếc một cái.

Event của Pi-Agent cũng đúng ý này: trong quá trình Agent chạy, cứ liên tục sinh ra các snapshot "có chuyện xảy ra": message bắt đầu, message cập nhật, tool bắt đầu thực thi: rồi đẩy các snapshot này cho tất cả những ai quan tâm.

### Không dùng event thì sao?

Giả sử bạn muốn thêm một tính năng "log lời gọi tool" cho Agent: mỗi lần gọi tool thì in một dòng `[LOG] đã gọi read, đối số: main.ts`.

**Không dùng event system**: bạn phải sửa source Agent, thêm `console.log` trước và sau `tool.execute()`. Sau đó Pi cập nhật, bạn merge code upstream thì phát hiện xung đột: phần log bạn thêm đụng với logic mới upstream. Tự giải quyết xung đột, tuần sau Pi cập nhật tiếp, lại xung đột...

**Dùng event system**:

```
session.subscribe((event) => {
 if (event.type === "tool_execution_end") {
 console.log(`[LOG] được gọi là ${event.toolName}, kết quả: ${event.isError ? "thất bại": "sự thành công"}`);
 }
});
```


Sáu dòng code. Không đụng một dòng source Agent nào. Agent cập nhật, bạn chỉ cần `npm update`, logic log không bị ảnh hưởng.

Đây là giá trị cốt lõi nhất của event-driven: **tách rời hoàn toàn "có chuyện gì" và "ai quan tâm cái gì"**. Agent chỉ chuyên phát event; nó không biết cũng chẳng quan tâm ai đang nghe.

### Pub-sub (đăng-nhận) so với gọi trực tiếp

Dùng thuật ngữ lập trình, event-driven hiện thực mẫu thiết kế **pub-sub** (publish-subscribe, đăng-nhận theo kiểu nhà xuất bản-người đăng ký). Đối chiếu với cách gọi hàm trực tiếp:

```
gọi trực tiếp(gọi): 
 Agent ──gọi──→ kết xuất thiết bị đầu cuối
 ──gọi──→ Lưu trữ tập tin
 ──gọi──→ khai thác gỗ
 Agent Cần biết sự tồn tại của tất cả người tiêu dùng, Mỗi khi một tính năng mới được thêm vào, nó cần phải được thay đổi Agent

xuất bản-Đăng ký(phát sóng): 
 Agent ──emitsự kiện──→ 📡 xe buýt sự kiện
 ├──→ kết xuất thiết bị đầu cuối(Đã đăng ký)
 ├──→ Lưu trữ tập tin(Đã đăng ký)
 ├──→ khai thác gỗ(Đã đăng ký)
 └──→ (Các tính năng mới chỉ cần đăng ký, Agent không cần biết)
```


Một câu: **gọi trực tiếp là "tôi tự đến tìm bạn"; pub-sub là "tôi hét lên giữa không khí, ai nghe được thì tính"**. Trong Pi, "hét lên giữa không khí" là `emit(event)`, "ai nghe được" là `subscribe(listener)`.

---

## 2. 10 loại sự kiện, 4 lớp lồng nhau

Tầng lõi Agent định nghĩa 10 loại `AgentEvent` (sự kiện do Agent phát ra). Chúng cấu thành "mạch đập" hoàn chỉnh của Agent:

10 sự kiện, 4 lớp lồng nhau

**Chú thích hình:** từ ngoài vào trong 4 lớp lồng nhau: Agent (Trace) -> Turn -> Message -> Tool Execution. Mỗi lớp là cặp "bắt đầu -> cập nhật (×N) -> kết thúc". Chú ý Turn 2 không có ToolCall nên không có lớp 4 lồng. Chú giải phía dưới đánh dấu số event mỗi lớp (2+2+3+3 = 10 loại).

```
export type AgentEvent =
 // Tầng : Agent vòng đời(toàn bộ hoạt động)
 | { type: "agent_start" }
 | { type: "agent_end"; messages: AgentMessage[] }

 // Tầng : Turn vòng đời(Một vòng gọi mẫu + thực thi công cụ)
 | { type: "turn_start" }
 | { type: "turn_end"; message: AgentMessage; toolResults: ToolResultMessage[] }

 // Tầng : Message vòng đời(một tin nhắn)
 | { type: "message_start"; message: AgentMessage }
 | { type: "message_update"; message: AgentMessage; assistantMessageEvent: AssistantMessageEvent }
 | { type: "message_end"; message: AgentMessage }

 // Tầng : Tool Execution vòng đời(Thực thi một công cụ)
 | { type: "tool_execution_start"; toolCallId: string; toolName: string; args: any }
 | { type: "tool_execution_update"; toolCallId: string; toolName: string; args: any; partialResult: any }
 | { type: "tool_execution_end"; toolCallId: string; toolName: string; result: any; isError: boolean };
```


10 loại nghe thì nhiều, nhưng quy luật rất rõ: chúng là **vòng đời 4 tầng lồng nhau**, mỗi tầng đều có cặp "bắt đầu -> cập nhật -> kết thúc":

```
Agent chạy
├── agent_start ───────────────────── Agent bắt đầu
│
├── Turn 1(Chương  nói: một cuộc gọi mẫu + Công cụ nó kích hoạt thực thi)
│ ├── turn_start ────────────────── Turn bắt đầu
│ │
│ ├── Message(LLM phản ứng)
│ │ ├── message_start
│ │ ├── message_update ×N ────── truyền tải đồng bằng(đuổi theo token cập nhật)
│ │ └── message_end
│ │
│ ├── Tool Execution(thực thi công cụ)
│ │ ├── tool_execution_start
│ │ ├── tool_execution_update ×N tiến độ công cụ(Chẳng hạn như Bash Đầu ra của)
│ │ └── tool_execution_end
│ │
│ └── turn_end ──────────────────── Turn kết thúc
│
├── Turn 2 ...
│
└── agent_end ──────────────────────── Agent kết thúc
```


Nhớ lại khái niệm từ Chương 3: **một Turn = một lần gọi model + tất cả lần thực thi tool do lần gọi đó kích hoạt**. Từ `turn_start` đến `turn_end`, model được gọi đúng một lần.

**Tại sao 4 lớp?** Vì những consumer (bên tiêu thụ) khác nhau quan tâm đến độ mịn khác nhau. TUI (terminal UI) cần render chữ theo từng token, nên nó subscribe `message_update`; còn Session manager chỉ quan tâm một lượt hội thoại đã kết thúc chưa, nên nó chỉ xem `turn_end`. 4 lớp lồng nhau cho phép mỗi consumer phản hồi ở đúng độ mịn vừa đủ.

---

## 3. emit không phải "thông báo", mà là "rào chắn đồng bộ"

Sau khi đã biết 10 loại event, giờ xem chúng được phát ra như thế nào. Mục này chứa quyết định thiết kế quan trọng nhất của hệ thống event Pi.

```
export type AgentEventSink = (event: AgentEvent) => Promise<void> | void;
```


Chú ý giá trị trả về: `Promise<void>`. emit có thể là async.

Nếu bạn đã viết `EventEmitter` của Node.js, bạn biết rằng emit là đồng bộ và fire-and-forget (phát đi rồi thôi, không chờ): phát xong là đi tiếp, mặc kệ ai đang nghe. Nhưng trong Agent Loop của Pi, mỗi lần gọi emit đều mang theo `await`:

### Mỗi lần phát sự kiện đều có await

Rào chắn đồng bộ so với Fire-and-Forget

**Chú thích hình:** đối chiếu theo chiều ngang: mũi tên trên: EventEmitter kiểu cũ (fire-and-forget), mũi tên dưới: rào chắn `await` của Pi (chờ hết listener). Cả hai mũi tên đều tới được `bước tiếp theo`, nhưng mũi tên dưới chờ tất cả consumer xong trước.

```
await emit({ type: "agent_start" });
await emit({ type: "turn_start" });
await emit({ type: "message_start", ... });
await emit({ type: "message_update", ... });
await emit({ type: "message_end", ... });
```


Mỗi `await` đều đang nói: **"chờ event này được xử lý xong hoàn toàn, rồi tiếp tục"**.

Cái này khác với pub-sub truyền thống: truyền thống là "tôi hét lên rồi đi luôn". Pi quyết không làm vậy: mỗi lần phát event, nó đứng đợi tất cả mọi người xử lý xong, rồi mới đi tiếp bước kế.

Tại sao? Sẽ giải thích ngay sau.

### processEvents: cập nhật state trước, rồi chờ listener

Thực thể của `emit` là phương thức `processEvents` của class Agent, nó làm ba việc:

```
private async processEvents(event: AgentEvent): Promise<void> {
 // bước đầu tiên: Cập nhật trạng thái nội bộ dựa trên loại sự kiện
 switch (event.type) {
 case "message_start":
 this._state.streamingMessage = event.message; // Bắt đầu theo dõi tin tức trực tuyến
 break;
 case "message_update":
 this._state.streamingMessage = event.message; // Cập nhật nội dung tin nhắn phát trực tuyến
 break;
 case "message_end":
 this._state.streamingMessage = undefined; // Xóa các máy trạm tạm thời
 this._state.messages.push(event.message); // Di chuyển vào các tập tin chính thức
 break;
 // ... tool_execution_start/end cập nhật pendingToolCalls Đợi đã
 }

 // Bước 2: lấy AbortSignal
 const signal = this.activeRun?.abortController.signal;

 // Bước 3: Đồng bộ chờ tất cả người nghe hoàn thành
 for (const listener of this.listeners) {
 await listener(event, signal); // ← Đợi từng người một！
 }
}
```


Mấu chốt ở bước thứ ba: **Agent lần lượt await tất cả listener theo thứ tự đăng ký**.

Bạn có thể hỏi: cái này khác gì "gọi hàm trong một vòng lặp"? Khác ở chỗ **`this.listeners` của Agent là một Set bên ngoài, nó không biết trong đó là ai**. Agent chỉ chịu trách nhiệm "duyệt qua và chờ", còn ai ở trong Set, ai không: hoàn toàn do bên ngoài điều khiển qua `subscribe()`. Bên trong code lõi Agent không có một dòng `updateTerminal()` hay `appendToFile()` nào: nó thậm chí không biết TUI hay file storage tồn tại.

### Tại sao nhất định phải await?

Giả sử không await. Xem chuyện gì sẽ xảy ra:

```
giả thuyết emit Có fire-and-forget(đừng chờ đợi): 

Agent Loop: emit(start) emit(update) emit(end)
 ↓ ↓ ↓
TUI người nghe: [Bắt đầu kết xuất...] [Chưa hoàn thành [Ba sự kiện xếp chồng lên nhau]
 start...]

câu hỏi: TUI Chưa hoàn thành message_start, message_update Nó đến đây. 
 UI Có thể hiển thị tin nhắn trống, Cũng có thể hiển thị nội dung lỗi thời:Trạng thái không nhất quán. 
```




```
thiết kế thực tế(await, rào cản đồng bộ): 

Agent Loop: emit(start)──await──→ emit(update)──await──→ emit(end)──await──→
 ↓ ↓ ↓
TUI người nghe: [Đã xử lý, Trở lại] [Đã xử lý, Trở lại] [Đã xử lý, Trở lại]

đảm bảo: Agent Sự kiện tiếp theo sẽ không được phát ra cho đến khi người nghe quay lại. 
```


Tóm tắt một câu: **`await` không phải để "thông báo", mà để "đàm phán đồng bộ"**: đảm bảo tất cả consumer đều theo kịp, Agent mới đi tiếp bước sau. Đó là ý nghĩa của "rào chắn đồng bộ".

Giá phải trả là hiệu năng (phải chờ consumer chậm nhất); cái được là tính đúng đắn (state luôn nhất quán).

### Một ngoại lệ: tool_execution_update không chờ

Nếu mỗi event đều phải await, thì `tool_execution_update` thì sao? Trong quá trình thực thi tool có thể sinh ra rất nhiều progress output (mỗi dòng output trong một lần thực thi Bash), await mỗi lần có chậm quá không?

Đúng vậy, Pi xử lý đặc biệt cho loại event tần suất cao này: **gom trước, rồi chờ theo lô**:

```
const updateEvents: Promise<void>[] = []; // hộp sưu tập
let acceptingUpdates = true;

const result = await tool.execute(id, args, signal, (partialResult) => {
 if (!acceptingUpdates) return; // Công cụ đã kết thúc, bỏ muộn update
 // Không await！đầu tiên emit của Promise thu thập
 updateEvents.push(emit({ type: "tool_execution_update", ... }));
});

acceptingUpdates = false; // đóng cửa xả lũ
await Promise.all(updateEvents); // Tất cả cùng một lúc update Đã hoàn thành
```


Cái này không mâu thuẫn. **Quy tắc rào chắn đồng bộ vẫn chặt, nhưng mở một khe hở cho event dạng cập nhật tiến độ**. Cập nhật tiến độ là "tần suất cao, giá trị thấp, có thể gộp": gửi thêm một cái hay bớt một cái không ảnh hưởng đến trạng thái cuối. Còn event vòng đời (start/end) là "tần suất thấp, giá trị cao": bỏ lỡ `message_start` thì hết cơ hội.

Còn một chi tiết thiết kế nữa: cổng `acceptingUpdates`. Hàm `execute` của tool là hàm `async`; callback tiến độ bên trong nó có thể vẫn còn được gọi bất đồng bộ sau khi Promise resolve (timer/delay callback sót lại). Không có cổng này, `partialResult` đến trễ sẽ phát `tool_execution_update` thêm lần nữa sau khi đã phát `tool_execution_end`, khiến listener thấy chuỗi rối tung "tool đã kết thúc rồi mà vẫn cập nhật".

---

## 4. Xử lý lỗi: listener ném ngoại lệ thẳng lên trên

Vòng lặp listener của `processEvents` có một chi tiết dễ bị bỏ qua: **không có try-catch**.

```
for (const listener of this.listeners) {
 await listener(event, signal); // Không try-catch！
}
```


Nếu một listener nào đó ném ngoại lệ, ngoại lệ sẽ lan lên thẳng `runWithLifecycle`, kích hoạt cả lần chạy Agent thất bại. **Một bug render UI có thể khiến Agent chết.** Nghe có vẻ nguy hiểm.

Tại sao không bọc try-catch?

Vì triết lý thiết kế của Pi là: **listener lỗi -> lần chạy dừng -> vấn đề hiện ra ngay**. Nếu bạn âm thầm nuốt ngoại lệ, Agent trông có vẻ chạy "bình thường", nhưng UI đã hỏng rồi: bạn debug sẽ không tìm thấy vấn đề đâu cả.

Nó giống như cầu chì trong mạch điện: cầu chì nổ, bạn lập tức biết có chỗ hỏng. Nếu mỗi linh kiện đều có bảo vệ riêng nhưng không bao giờ báo lỗi, cả hệ thống trông "bình thường" nhưng có thể đã hỏng một nửa.

**Khuyến nghị thực hành**: nếu bạn viết listener UI/extension của riêng mình dựa trên Pi, **nhớ tự try-catch bên trong listener**: Agent sẽ không giúp bạn chặn hộ.

Nhưng có một ngoại lệ: **hệ thống extension**. Framework tự bọc try-catch cô lập cho callback của extension bên thứ ba, một extension sập sẽ không kéo theo cả session. Nguyên tắc là: với listener tầng trong đáng tin (code do mình viết), cứ để ngoại lệ phơi bày; với listener tầng ngoài không đáng tin (extension bên thứ ba), framework cô lập giúp.
---

## 5. Bạn có thể làm gì với hệ thống sự kiện?

Mấy mục trước trình bày "cơ chế". Sau khi hiểu cơ chế, câu hỏi thực sự là: **bạn có thể xây dựng gì trên hệ thống event này?**

Dưới đây là một số kịch bản tiêu biểu:

### Kịch bản 1: quan sát real-time Agent đang làm gì



```
session.subscribe((event) => {
 if (event.type === "tool_execution_start") {
 console.log(`🔧 ${event.toolName}(${JSON.stringify(event.args).slice(0, 50)})`);
 }
 if (event.type === "tool_execution_end") {
 console.log(` └─ ${event.isError ? "❌ thất bại": "✅ sự thành công"}`);
 }
});
```

Bản thân TUI của Pi là một panel quan sát được hiện thực bằng cách subscribe event. Mọi output terminal bạn thấy đều đến từ tiêu thụ event.

### Kịch bản 2: chặn lời gọi tool

Thông qua event `tool_call` của hệ thống extension, extension có thể trả về `{ block: true, reason: "cấm thao tác xóa trong production" }`, và tool sẽ không được thực thi. Bước 3 trong pipeline 5 bước ở Chương 5, `beforeToolCall`, chính là do cơ chế này hiện thực.

### Kịch bản 3: tiền xử lý context

Extension có thể sửa danh sách message trước khi gọi LLM: inject thời gian hiện tại, trạng thái Git, hoặc tóm tắt lượt trước. Đây là cách hook `transformContext` được nhắc ở Chương 6 được hiện thực.

### Kịch bản 4: chuyển tiếp stream về frontend Web



```
// Máy chủ
session.subscribe((event) => {
 if (event.type === "message_update") {
 res.write(`data: ${JSON.stringify({ type: "delta", text: extractText(event.message) })}\n\n`);
 }
 if (event.type === "agent_end") {
 res.end();
 }
});
```

Agent chạy trên server, người dùng truy cập qua trình duyệt. Subscribe stream event, đẩy qua SSE về trình duyệt: đây là lõi của tích hợp Web.

### Tóm tắt nhỏ

Các kịch bản này có một đặc điểm chung: **thêm bất kỳ tính năng nào đều không cần sửa lõi Agent**. Bạn chỉ cần `subscribe`, rồi trong callback làm điều bạn muốn. Sức mạnh thật sự của kiến trúc event-driven không phải "cơ chế thông báo", mà là **cơ chế mở rộng mở**.

---

## 6. Case study: hành trình hoàn chỉnh của một text_delta

Nối những gì đã học lại, ta truy vết một event `text_delta`: từ ký tự đầu tiên LLM trả về cho đến màn hình terminal của bạn.

Hành trình xuyên tầng hoàn chỉnh của text_delta

**Chú thích hình:** luồng dữ liệu 5 tầng: LLM SSE -> EventStream.push của tầng AI -> Agent Loop chuyển thành `message_update` -> rào chắn đồng bộ `Agent.processEvents` -> listener TUI ghi terminal. Mỗi tầng chỉ quan tâm phép chuyển đổi của riêng mình.

Giả sử LLM đang sinh ra hai chữ "hello". Một chữ 'h', từ lúc sinh ra đến lúc hiển thị, trải qua 5 bước:

```
Kết thúc kích hoạt: LLM SSE luồng mạng
 │ data: {"type":"text_delta","delta":"bạn",...}
 │
 ▼ quá cảnh1: AI lớp EventStream.push()
 │ hàng đợi không đồng bộ, AssistantMessageEvent { type: "text_delta", delta: "bạn" }
 │ (Chương  nói12một trong những sự kiện)
 │
 ▼ quá cảnh2: Agent Loop chuyển tiếp sự kiện
 │ AI lớp text_delta → Agent lớp message_update
 │ sự kiện ban đầu đã qua assistantMessageEvent Truyền trong suốt trường
 │
 ▼ quá cảnh3: Agent.processEvents()(rào cản đồng bộ)
 │ cập nhật streamingMessage trạng thái nội bộ
 │ await tất cả listeners
 │
 ▼ quá cảnh4: AgentSession._handleAgentEvent()
 │ Hệ thống mở rộng thông báo → phân phối cho Session người nghe → kiên trì
 │
 ▼ điểm cuối: TUI người nghe
 │ Trích xuất delta "bạn" → Kết xuất đến thiết bị đầu cuối
 │
 ▼
bạn đã thấy "bạn" từ xuất hiện
```


Trên toàn chuỗi này, mỗi tầng chỉ quan tâm việc của mình: tầng AI chỉ lo parse SSE và dựng message; Agent Loop chỉ lo emit event và xử lý tool; Agent chỉ lo cập nhật state và await listener; Session chỉ lo phân phối và lưu trữ; TUI chỉ lo render. **Không tầng nào trực tiếp gọi phương thức nội bộ của tầng khác: giao thức liên lạc duy nhất giữa chúng là "event"**.

Có một phép biến đổi dữ liệu then chốt đáng chú ý: **các event delta đa dạng của tầng AI (`text_delta`, `thinking_delta`, `toolcall_delta`) được ánh xạ đồng loạt thành `message_update` của tầng Agent**. Event thô của tầng AI được gắn vào `message_update` qua trường `assistantMessageEvent` và truyền nguyên xi. Agent Loop không quan tâm kiểu delta cụ thể: nó chỉ biết "message đã cập nhật". Nhưng consumer có thể quan tâm, nên event thô được giữ lại chứ không bị bỏ.

---

## 7. Tầng Session mở rộng gì

Sáu mục trước nói về hệ thống event của lõi Agent: 10 loại. Nhưng Pi không chỉ có tầng Agent; ở trên còn có một `AgentSession` (tầng phiên sản phẩm).

`AgentSession` phải xử lý nhiều thứ hơn lõi Agent rất nhiều: nén context, thử lại tự động, quản lý trạng thái hàng đợi... Những khái niệm này không tồn tại trong lõi Agent. Cũng như bạn không tìm thấy thông báo "Bluetooth đã kết nối" trong kernel Linux: kernel chỉ lo lập lịch tiến trình và quản lý bộ nhớ; Bluetooth là việc của tầng trên.

### Kernel 10 + Session 7

`AgentSession` dùng kiểu union để mở rộng event:

```
AgentSessionEvent =
 Khái niệm cơ bản 10 loài(agent_end bị quá tải, tăng lên willRetry trường)
 + Session Mới 7 loài: 
 queue_update ← steering/followUp Thay đổi hàng đợi
 compaction_start/end ← Nén ngữ cảnh(chi tiết ở Chương )
 auto_retry_start/end ← LLM Tự động thử lại nếu cuộc gọi không thành công
 session_info_changed ← Thay đổi tên phiên
 thinking_level_changed ← Công tắc chiều sâu suy nghĩ
```


Những event này chỉ liên quan đến "trải nghiệm cấp sản phẩm", không liên quan đến "logic lõi Agent". Nên chúng được đặt ở tầng Session chứ không phải tầng Agent.

**Đây là tư tưởng thiết kế "event hai lớp": lõi chỉ quản việc của lõi (vòng đời), sản phẩm mở rộng phía trên theo nhu cầu (trải nghiệm người dùng)**. Tiêu chuẩn phán đoán rất đơn giản: nếu bỏ event nào đó đi mà lõi vẫn chạy bình thường, thì nó thuộc tầng ngoài.

---

## 8. Tóm tắt: ba quyết định thiết kế

### Quyết định 1: rào chắn đồng bộ

`processEvents` await tất cả listener, không fire-and-forget. Đảm bảo consumer luôn thấy trạng thái nhất quán. Giá phải trả là hiệu năng, nhưng chiến lược "gom trước rồi chờ theo lô" của `tool_execution_update` đã giảm nhẹ vấn đề hiệu năng của event tần suất cao.

### Quyết định 2: phơi bày ngoại lệ trực tiếp

Vòng lặp listener không có try-catch. Listener lỗi -> lần chạy thất bại -> vấn đề hiện ra ngay. Với listener tầng trong đáng tin (code do mình viết) không bảo vệ; với listener tầng ngoài không đáng tin (extension bên thứ ba) framework cô lập.

### Quyết định 3: event hai lớp

Lõi Agent chỉ định nghĩa 10 loại event trên 4 tầng vòng đời. Tầng Session mở rộng 7 event cấp sản phẩm qua kiểu union. Nếu bỏ event nào đó đi mà lõi vẫn chạy bình thường, nó thuộc tầng ngoài.

---

## 9. Trạm tiếp theo

Chương này ta thấy hệ thống event đã tách rời hoàn toàn Agent với thế giới bên ngoài: UI, log, lưu trữ, extension: tất cả đều làm việc qua subscribe event.

Nhưng có một cơ chế liên quan mật thiết đến event mà ta mới chỉ nhắc một câu: **`transformContext`**. Chương 6 bàn hệ thống message đã từng nói nó chạy trước `convertToLlm`, chịu trách nhiệm cắt bớt message cũ và inject context bên ngoài. Khi hội thoại ngày càng dài, message ngày càng nhiều, cuối cùng sẽ vượt quá context window của model. Lúc đó `transformContext` cần làm thêm một việc quyết liệt hơn: **nén lịch sử hội thoại**.

Hai chương tới ta mở toàn cảnh context engineering của Pi. Chương 8 trước tiên nói bức tranh toàn cảnh: từ cắt output của tool ở phía đầu vào, lắp ráp system prompt, đến Compaction và tóm tắt nhánh ở phía lịch sử, để bạn thấy rõ tuyến phòng thủ Pi bố trí ở nhiều khâu; Chương 9 đào sâu vào thuật toán nén cốt lõi nhất (Compaction), xem Pi làm sao khi context window sắp đầy, nén 50 lượt hội thoại thành một đoạn tóm tắt có cấu trúc, để Agent tiếp tục "nhớ" được trước đó đã xảy ra chuyện gì.

---

> **Chỉ mục source then chốt của chương này**:
>
> `packages/agent/src/types.ts:413-428`: định nghĩa 10 loại `AgentEvent`
> `packages/agent/src/agent-loop.ts:25`: kiểu `AgentEventSink` (chữ ký emit)
> `packages/agent/src/agent.ts:509-556`: `processEvents` (hiện thực rào chắn đồng bộ)
> `packages/agent/src/agent.ts:168,231-233`: `subscribe` và `listeners`
> `packages/agent/src/agent-loop.ts:628-669`: `executePreparedToolCall` (xử lý đặc biệt update)
> `packages/coding-agent/src/core/agent-session.ts:126-150`: `AgentSessionEvent` (17 loại event)
