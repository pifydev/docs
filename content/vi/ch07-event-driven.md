---
title: 'Chương 7: Runtime hướng sự kiện'
description: Vòng đời Agent, subscriber barrier, tiến độ Tool, sự kiện cấp sản phẩm, Extension hook và tích hợp UI.
translation_key: ch07-event-driven
language: vi
chapter: 7
source_url: 'https://www.dgzhuya.com/modules/ch07-event-driven'
official_refs:
  - 'https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/agent/README.md#event-flow'
  - 'https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/coding-agent/docs/extensions.md#events'
terms_used:
  - Event
  - Agent
  - Tool
  - Stream
status: reviewed
last_updated: '2026-08-24'
translator: Pify maintainers
reviewed_by: Pify maintainers
---
Sáu chương đầu đã theo dõi dữ liệu qua model, vòng lặp Agent, Tool và các biên message. Sự kiện xuất hiện ở mọi bước, nhưng vẫn còn ba câu hỏi: một chuyển đổi trạng thái đi tới code bên ngoài bằng cách nào, consumer nào nhận được nó và khi nào Agent phải chờ consumer xử lý xong?

Chương này trả lời các câu hỏi đó trên ba bề mặt của Pi 0.84.2:

- `AgentEvent` trong `@earendil-works/pi-agent-core` mô tả một run cấp thấp;
- `AgentSessionEvent` trong `@earendil-works/pi-coding-agent` bổ sung các mối quan tâm cấp sản phẩm như retry và compaction;
- Extension event vừa cho phép quan sát, vừa cung cấp hook riêng để chặn hoặc tiền xử lý dữ liệu.

Chương 1–6 tạo thành tuyến chính giải thích runtime. Chương 7 mở đầu phần kỹ thuật nâng cao, vì vậy nội dung đi sâu vào quá trình hoàn tất, mutation và biên xử lý lỗi mà một UI dùng trong production cần nắm rõ.

## 1. Vì sao cần hệ thống sự kiện

### Trực giác từ việc theo dõi đơn giao hàng

Ứng dụng giao hàng không bắt khách liên tục hỏi nhà hàng, tài xế và dịch vụ thanh toán. Ứng dụng phát các thay đổi trạng thái: nhà hàng đã nhận đơn, tài xế đã lấy hàng và đơn đã được giao. Mỗi consumer chỉ phản ứng với thay đổi mà nó cần.

Một Agent run có hình dạng tương tự. Provider trả response theo luồng, nhiều Tool call có thể chạy, và một prompt có thể kéo dài qua nhiều turn. Chỉ trả về chuỗi cuối cùng sẽ che mất thông tin cần để hiển thị text chưa hoàn tất, Tool đang chờ, lỗi hoặc lần retry. Sự kiện công bố các thay đổi đó khi run còn hoạt động. Đây là giao thức trực tiếp của runtime, không phải định dạng session được lưu bền vững.

### Thêm consumer mà không sửa Agent core

Giả sử ứng dụng cần ghi một dòng audit cho mỗi Tool. Nếu sửa Agent quanh mọi lời gọi `tool.execute()`, tính năng audit sẽ phụ thuộc vào chi tiết thực thi và dễ xung đột khi Pi thay đổi. Subscriber có thể nằm hoàn toàn bên ngoài phần code đó:

```typescript
import type { Agent } from "@earendil-works/pi-agent-core";

export function logToolResults(agent: Agent): () => void {
  return agent.subscribe((event) => {
    if (event.type === "tool_execution_end") {
      const status = event.isError ? "failed" : "succeeded";
      console.log(`[tool] ${event.toolName}: ${status}`);
    }
  });
}
```

Hàm trả về sẽ gỡ listener vừa đăng ký. Hãy giữ hàm đó và gọi khi view, request hoặc integration bị hủy.

### So sánh pub/sub với lời gọi trực tiếp

Thiết kế gọi trực tiếp buộc producer phải biết tên mọi consumer. Với pub/sub, event contract trở thành dependency chung:

```text
direct calls
Agent ──> terminal renderer
      ├─> persistence adapter
      └─> telemetry exporter

publish/subscribe
Agent ──> AgentEvent ──> terminal subscriber
                     ├─> persistence subscriber
                     ├─> telemetry subscriber
                     └─> a later subscriber the Agent does not know
```

Bên trong, Pi vẫn gọi các hàm listener. Sự tách rời đến từ quyền sở hữu: Agent core sở hữu event type và vòng lặp phân phối, còn ứng dụng sở hữu tập listener. Thêm một observer không làm core package phụ thuộc vào terminal, database hoặc hệ thống analytics.

## 2. Giao thức sự kiện và biên package

### Mười discriminant của `AgentEvent`

`AgentEvent` có mười giá trị `type`. Vòng đời Agent và turn là các cặp start/end; vòng đời message và thực thi Tool có thêm event update.

| Nhóm | Discriminant | Payload sau `type` |
| --- | --- | --- |
| Run | `agent_start` | không có |
| Run | `agent_end` | `messages: AgentMessage[]` |
| Turn | `turn_start` | không có |
| Turn | `turn_end` | `message: AgentMessage`, `toolResults: ToolResultMessage[]` |
| Message | `message_start` | `message: AgentMessage` |
| Message | `message_update` | `message: AgentMessage`, `assistantMessageEvent: AssistantMessageEvent` |
| Message | `message_end` | `message: AgentMessage` |
| Tool | `tool_execution_start` | `toolCallId`, `toolName`, `args` |
| Tool | `tool_execution_update` | `toolCallId`, `toolName`, `args`, `partialResult` |
| Tool | `tool_execution_end` | `toolCallId`, `toolName`, `result`, `isError` |

Đoạn dưới đây bám sát source [`packages/agent/src/types.ts`](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/agent/src/types.ts#L428). Đoạn trích chỉ được dàn thành nhiều dòng hơn, không lược bỏ field:

```typescript
export type AgentEvent =
  | { type: "agent_start" }
  | { type: "agent_end"; messages: AgentMessage[] }
  | { type: "turn_start" }
  | {
      type: "turn_end";
      message: AgentMessage;
      toolResults: ToolResultMessage[];
    }
  | { type: "message_start"; message: AgentMessage }
  | {
      type: "message_update";
      message: AgentMessage;
      assistantMessageEvent: AssistantMessageEvent;
    }
  | { type: "message_end"; message: AgentMessage }
  | {
      type: "tool_execution_start";
      toolCallId: string;
      toolName: string;
      args: any;
    }
  | {
      type: "tool_execution_update";
      toolCallId: string;
      toolName: string;
      args: any;
      partialResult: any;
    }
  | {
      type: "tool_execution_end";
      toolCallId: string;
      toolName: string;
      result: any;
      isError: boolean;
    };
```

Một turn gồm một assistant response cùng các Tool call và kết quả do response đó tạo ra. Một run có thể gồm nhiều turn khi Tool, steering message hoặc follow-up message giữ cho vòng lặp tiếp tục.

```text
agent_start
└─ turn_start
   ├─ message_start/update*/end   assistant response
   ├─ tool_execution_start/update*/end
   ├─ message_start/end           ToolResultMessage
   └─ turn_end
└─ turn_start ...                 next model call, when needed
agent_end
```

User message và message được inject cũng nhận `message_start` và `message_end`. Chỉ assistant message đang streaming mới nhận `message_update`.

### `AssistantMessageEvent` lồng bên trong

`message_update` giữ lại Pi AI event đã gây ra lần cập nhật. Các discriminant chính xác từ `@earendil-works/pi-ai` gồm:

| Giai đoạn | Event và payload |
| --- | --- |
| Stream | `start { partial }` |
| Text | `text_start { contentIndex, partial }`, `text_delta { contentIndex, delta, partial }`, `text_end { contentIndex, content, partial }` |
| Thinking | `thinking_start { contentIndex, partial }`, `thinking_delta { contentIndex, delta, partial }`, `thinking_end { contentIndex, content, partial }` |
| Tool call | `toolcall_start { contentIndex, partial }`, `toolcall_delta { contentIndex, delta, partial }`, `toolcall_end { contentIndex, toolCall, partial }` |
| Kết thúc | `done { reason, message }`, `error { reason, error }` |

Agent core ánh xạ chín biến thể start/update/end của text, thinking và Tool call thành `message_update`. `start` ở lớp ngoài của Pi AI trở thành `message_start`; `done` hoặc `error` trở thành `message_end`. `done.reason` nhận `stop`, `length`, `toolUse` hoặc `deferred`; `error.reason` nhận `aborted` hoặc `error`.

```typescript
import type { AgentEvent } from "@earendil-works/pi-agent-core";

export function logTextDelta(event: AgentEvent): void {
  if (
    event.type === "message_update" &&
    event.assistantMessageEvent.type === "text_delta"
  ) {
    const { contentIndex, delta } = event.assistantMessageEvent;
    console.log(contentIndex, delta);
  }
}
```

Hãy thu hẹp theo discriminant lồng bên trong trước khi đọc `delta`. Không phải `text_start`, `text_end` hay các biến thể thinking và Tool call đều có field đó.

### `AgentSessionEvent`: vòng đời core cộng với trạng thái sản phẩm

`AgentSession` chuyển tiếp mười discriminant của core, đổi `agent_end` để thêm `willRetry: boolean`, rồi bổ sung 13 discriminant cấp sản phẩm. Nếu đếm theo discriminant thay vì union arm bị lặp, session có tổng cộng 23 event type.

| Product event | Payload chính xác |
| --- | --- |
| `agent_settled` | không có |
| `queue_update` | `steering: readonly string[]`, `followUp: readonly string[]` |
| `compaction_start` | `reason: "manual" \| "threshold" \| "overflow"` |
| `compaction_end` | `reason`, `result`, `aborted`, `willRetry`, `errorMessage` không bắt buộc |
| `entry_appended` | `entry: SessionEntry` |
| `session_info_changed` | `name: string \| undefined` |
| `thinking_level_changed` | `level: ThinkingLevel` |
| `auto_retry_start` | `attempt`, `maxAttempts`, `delayMs`, `errorMessage` |
| `auto_retry_end` | `success`, `attempt`, `finalError` không bắt buộc |
| `summarization_retry_scheduled` | `attempt`, `maxAttempts`, `delayMs`, `errorMessage` |
| `summarization_retry_attempt_start` | `source: "branchSummary"`, hoặc `source: "compaction"` kèm `reason` |
| `summarization_retry_finished` | không có |
| `bash_execution_update` | `id` không bắt buộc, `delta: string` |

Đoạn dưới đây bám sát [`packages/coding-agent/src/core/agent-session.ts`](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/coding-agent/src/core/agent-session.ts#L142). Phần lược duy nhất là tham chiếu lại core union và gộp cách xuống dòng:

```typescript
type AgentSessionEvent =
  | Exclude<AgentEvent, { type: "agent_end" }>
  | { type: "agent_end"; messages: AgentMessage[]; willRetry: boolean }
  | { type: "agent_settled" }
  | { type: "queue_update"; steering: readonly string[]; followUp: readonly string[] }
  | { type: "compaction_start"; reason: "manual" | "threshold" | "overflow" }
  | { type: "entry_appended"; entry: SessionEntry }
  | { type: "session_info_changed"; name: string | undefined }
  | { type: "thinking_level_changed"; level: ThinkingLevel }
  | { type: "compaction_end"; reason: "manual" | "threshold" | "overflow"; result: CompactionResult | undefined; aborted: boolean; willRetry: boolean; errorMessage?: string }
  | { type: "auto_retry_start"; attempt: number; maxAttempts: number; delayMs: number; errorMessage: string }
  | { type: "auto_retry_end"; success: boolean; attempt: number; finalError?: string }
  | { type: "summarization_retry_scheduled"; attempt: number; maxAttempts: number; delayMs: number; errorMessage: string }
  | { type: "summarization_retry_attempt_start"; source: "branchSummary" }
  | { type: "summarization_retry_attempt_start"; source: "compaction"; reason: "manual" | "threshold" | "overflow" }
  | { type: "summarization_retry_finished" }
  | { type: "bash_execution_update"; id?: string; delta: string };
```

`agent_end` đóng một Agent run cấp thấp. Coding Agent vẫn có thể retry, compact hoặc tiếp tục công việc đang chờ. `agent_settled` đánh dấu biên cấp sản phẩm sau khi các bước tiếp tục tự động đã dừng. `bash_execution_update` mô tả lệnh `!` hoặc `!!` do session thực thi trực tiếp; event này khác với `tool_execution_update` của Tool do LLM yêu cầu.

### Extension event là một contract riêng

`pi.on()` không nhận trực tiếp `AgentSessionEvent`. `ExtensionEvent` là contract rộng hơn của Coding Agent:

| Nhóm | Discriminant chính xác |
| --- | --- |
| Khởi động và resource | `project_trust`, `resources_discover` |
| Session | `session_start`, `session_info_changed`, `session_before_switch`, `session_before_fork`, `session_before_compact`, `session_compact`, `session_compact_failed`, `session_before_tree`, `session_tree`, `session_shutdown` |
| Agent và provider | `before_agent_start`, `agent_start`, `agent_end`, `agent_settled`, `turn_start`, `turn_end`, `message_start`, `message_update`, `message_end`, `tool_execution_start`, `tool_execution_update`, `tool_execution_end`, `context`, `before_provider_request`, `before_provider_headers`, `after_provider_response` |
| Model | `model_select`, `thinking_level_select` |
| Tool, Bash và input | `tool_call`, `tool_result`, `user_bash`, `input` |

Một số tên trùng với core event, nhưng payload và bảo đảm thuộc về Extension API. Chẳng hạn, `turn_start` của Extension thêm `turnIndex` và `timestamp`; `agent_end` của Extension không có `willRetry` như session subscriber; `tool_call` và `context` có thể thay đổi quá trình thực thi, còn `tool_execution_start` và `message_update` chỉ báo trạng thái vòng đời.

## 3. Phân phối, thứ tự listener và quá trình hoàn tất

### `Agent.subscribe()` là subscription có chờ

Core API trực tiếp nhận listener đồng bộ hoặc bất đồng bộ rồi trả về hàm unsubscribe:

```typescript
import type { Agent } from "@earendil-works/pi-agent-core";

export function attachFinalFlush(
  agent: Agent,
  flush: (signal: AbortSignal) => Promise<void>,
): () => void {
  return agent.subscribe(async (event, signal) => {
    if (event.type === "agent_end") {
      await flush(signal);
    }
  });
}
```

Pi duyệt `Set` listener theo thứ tự đăng ký. Pi chờ một listener xong rồi mới gọi listener kế tiếp cho cùng event. Vì vậy, listener chậm sẽ trì hoãn cả listener phía sau lẫn giai đoạn producer nằm sau event.

### State được cập nhật trước khi subscriber chạy

`Agent.processEvents()` thay đổi runtime state công khai trước, rồi mới gọi listener. Đoạn dưới là pseudocode rút gọn từ [`packages/agent/src/agent.ts`](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/agent/src/agent.ts#L538):

```typescript
// Pseudocode: omitted cases retain the same state-before-delivery order.
async function processEvents(event: AgentEvent) {
  if (event.type === "message_update") state.streamingMessage = event.message;
  if (event.type === "message_end") {
    state.streamingMessage = undefined;
    state.messages.push(event.message);
  }
  if (event.type === "tool_execution_start") pending.add(event.toolCallId);
  if (event.type === "tool_execution_end") pending.delete(event.toolCallId);

  for (const listener of listeners) {
    await listener(event, activeAbortSignal);
  }
}
```

Implementation thật thay `pendingToolCalls` bằng một `Set` mới ở event start và end. Listener nhận `message_end` có thể đọc completed message từ `agent.state.messages`; listener nhận `tool_execution_start` sẽ thấy call ID trong `agent.state.pendingToolCalls`.

### Event vòng đời tạo thành barrier

Phần lớn lời gọi emit trong vòng lặp đều được await tại chỗ:

```text
update Agent state
  -> listener 1 settles
  -> listener 2 settles
  -> emit resolves
  -> next producer phase starts
```

Thứ tự này tạo ra các barrier cụ thể. Việc phân phối `message_end` của assistant phải xong trước khi bắt đầu preflight Tool. Mỗi `tool_execution_start` phải xong trước khâu chuẩn bị đối số, validation và `beforeToolCall`. `tool_execution_end` phải xong trước khi bắt đầu vòng đời của `ToolResultMessage` tương ứng.

`agent_end` là event cuối của vòng lặp, nhưng listener của nó vẫn nằm trong active run. `await agent.prompt(...)` và `await agent.waitForIdle()` chỉ resolve sau khi các listener đó settle và `finishRun()` dọn streaming state do runtime sở hữu.

### Tiến độ Tool được phân phối đồng thời rồi chờ tại barrier

Tài liệu Pi cũ mô tả listener của `tool_execution_update` là không bao giờ được await. Pi 0.84.2 dùng quy tắc hai phần. Callback `onUpdate` đồng bộ của Tool bắt đầu phân phối mà không await, nên Tool có thể báo update tiếp theo khi subscriber vẫn đang xử lý update trước. Mọi promise phân phối đều được thu lại và phải settle hết trước khi bước hậu xử lý kết quả tiếp tục.

Đoạn dưới là pseudocode bám sát thứ tự trong [`executePreparedToolCall()`](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/agent/src/agent-loop.ts#L670):

```typescript
// Pseudocode: exact ordering, abbreviated payload construction.
const updateEvents: Promise<void>[] = [];
let acceptingUpdates = true;

const result = await tool.execute(id, args, signal, (partialResult) => {
  if (!acceptingUpdates) return;
  updateEvents.push(Promise.resolve(emit({
    type: "tool_execution_update",
    toolCallId: id,
    toolName,
    args: originalArgs,
    partialResult,
  })));
});

acceptingUpdates = false;
await Promise.all(updateEvents);
// afterToolCall -> tool_execution_end -> ToolResultMessage comes later
```

Trong một update, các listener trực tiếp của `Agent.subscribe()` vẫn chạy theo thứ tự đăng ký. Những lần phân phối update riêng biệt có thể chồng lên nhau, nên không có bảo đảm update N sẽ xử lý xong trước update N+1. Cổng `acceptingUpdates` bỏ callback đến sau khi `tool.execute()` đã settle. Nếu việc phân phối tiến độ bị reject, `Promise.all` sẽ quan sát lỗi đó; lỗi không biến mất trong background.

### Low-level stream, `Agent` và `AgentSession` hoàn tất khác nhau

| Bề mặt | Dạng listener | Cách hoàn tất công việc async |
| --- | --- | --- |
| `agentLoop()` / `agentLoopContinue()` | async iterator của `AgentEvent` | Việc consumer đọc stream chỉ để quan sát, không tạo producer barrier |
| `Agent.subscribe()` | `(event, signal) => void \| Promise<void>` | Promise của listener được await theo thứ tự đăng ký |
| `AgentSession.subscribe()` | `(event) => void` | Listener chạy đồng bộ theo thứ tự trong array; promise trả về bị bỏ qua |
| `pi.on()` | Extension handler có `ExtensionContext` | Settlement và ý nghĩa return value phụ thuộc vào hook cụ thể |

`AgentSession` đăng ký một listener nội bộ bất đồng bộ lên `Agent`. Với core event được bridge qua session, handler này chờ Extension lifecycle handler trước, gọi session subscriber theo cách đồng bộ, rồi persist completed message tại `message_end`. Toàn bộ handler nội bộ là một `Agent` listener được await, nhưng hàm `async` truyền vào `AgentSession.subscribe()` nằm ngoài barrier vì session listener type trả về `void`.

```typescript
import type { AgentSession } from "@earendil-works/pi-coding-agent";

export function observeSession(session: AgentSession): () => void {
  return session.subscribe((event) => {
    if (event.type === "agent_end" && event.willRetry) {
      console.log("The low-level run ended; Coding Agent will retry.");
    }
    if (event.type === "agent_settled") {
      console.log("No automatic continuation remains.");
    }
  });
}
```

Hãy dùng `Agent.subscribe()` cho công việc bắt buộc phải được await trong một low-level run. Dùng `AgentSession.waitForIdle()` hoặc product event `agent_settled` nếu khái niệm hoàn tất phải bao gồm retry, compaction và chính sách tiếp tục queue. Khi session listener khởi động công việc bất đồng bộ, chính ứng dụng phải theo dõi và await công việc đó.

## 4. Lỗi, cô lập và hủy tác vụ

### Lỗi từ subscriber trực tiếp ảnh hưởng đến run

`Agent.processEvents()` không bọc catch quanh từng listener. Khi listener 1 throw hoặc reject, các listener phía sau không nhận event đó. Lỗi đi tới `runWithLifecycle()`, nơi thông thường sẽ chuyển lỗi của run thành assistant failure message rồi phát `message_start`, `message_end`, `turn_end` và `agent_end` cho message ấy. Nếu listener tiếp tục lỗi trong chuỗi failure event nhân tạo này, `prompt()` có thể reject.

Hãy bắt lỗi ứng dụng có thể phục hồi ngay trong subscriber. Chỉ throw tiếp nếu việc thiếu audit, persistence hoặc policy action phải khiến run thất bại rõ ràng:

```typescript
import type { Agent, AgentMessage } from "@earendil-works/pi-agent-core";

export function attachAudit(
  agent: Agent,
  writeAuditRecord: (
    message: AgentMessage,
    signal: AbortSignal,
  ) => Promise<void>,
  reportAuditFailure: (error: unknown) => void,
): () => void {
  return agent.subscribe(async (event, signal) => {
    if (event.type !== "message_end") return;

    try {
      await writeAuditRecord(event.message, signal);
    } catch (error) {
      reportAuditFailure(error);
      // Add `throw error` when losing this record must fail the run.
    }
  });
}
```

Các hàm trong ví dụ này đại diện cho code của ứng dụng. Dạng event và cách dùng `AbortSignal` có thể sao chép; chính sách lỗi phải do ứng dụng quyết định.

### Kết quả của provider, Tool và abort giữ đúng phạm vi

Pi AI kết thúc provider stream bị lỗi bằng `AssistantMessageEvent.error`. Agent core hoàn tất assistant message với `stopReason: "error"` hoặc `"aborted"`, rồi phát các event kết thúc message, turn và run như bình thường. Lỗi khi tìm Tool, validate đối số, chạy `beforeToolCall`, thực thi hoặc chạy `afterToolCall` sẽ trở thành error Tool result tại nơi core bắt lỗi. Vòng đời Tool vẫn kết thúc với `isError: true`, sau đó là `ToolResultMessage` để model ở turn tiếp theo có thể đọc.

```text
provider failure: message_end(error/aborted) -> turn_end -> agent_end
Tool failure:     tool_execution_end(isError=true)
               -> message_start/end(ToolResultMessage)
               -> turn_end
```

Mỗi Agent subscriber trực tiếp nhận `AbortSignal` của active run. `agent.abort()` hủy signal đó. Provider, Tool và công việc trong subscriber chỉ dừng nhanh nếu chúng tuân theo signal. Sau abort, producer cũng không được phát tiến độ vô hạn: cổng `acceptingUpdates` nói trên sẽ bỏ update đến muộn.

### Extension handler có chính sách cô lập theo từng hook

Extension runner của Coding Agent bắt và báo lỗi cho hoạt động quan sát vòng đời thông thường, cũng như các handler dạng chuỗi như `context`, `input`, `message_end` và `tool_result`. Một observer lỗi không chặn các Extension observer phía sau. Return value có thể thay đổi hành vi sẽ được await theo thứ tự nạp Extension.

`tool_call` được nối vào `beforeToolCall` của Agent core. Nếu handler này throw, core preflight bắt lỗi và tạo error Tool result thay vì thực thi Tool. Lỗi session subscriber đi theo đường khác: `_emit()` không catch, vì vậy một synchronous throw trong core event được bridge sẽ làm listener nội bộ của Agent reject và ảnh hưởng đến run.

Các biên này được định nghĩa riêng theo từng event. Code không nên giả định mọi thứ có tên “listener” đều dùng cùng một chính sách lỗi.

## 5. Quan sát, chặn, tiền xử lý và UI

### Quan sát một run

Subscriber chỉ đọc có thể thu thập timing, telemetry hoặc Tool trace ngắn. Hãy liên kết Tool bằng `toolCallId`; chỉ dùng Tool name thì không đủ để phân biệt từng call.

```typescript
import type { AgentSession } from "@earendil-works/pi-coding-agent";

export function logToolTimings(session: AgentSession): () => void {
  const started = new Map<string, number>();

  return session.subscribe((event) => {
    if (event.type === "tool_execution_start") {
      started.set(event.toolCallId, Date.now());
    }
    if (event.type === "tool_execution_end") {
      const beganAt = started.get(event.toolCallId);
      const elapsedMs =
        beganAt === undefined ? undefined : Date.now() - beganAt;
      console.log({
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        elapsedMs,
        isError: event.isError,
      });
      started.delete(event.toolCallId);
    }
  });
}
```

Không ghi API key, prompt chưa redact, Tool secret hoặc credential thô vào event log dùng chung. Identifier của run, turn, provider, model và Tool call thường đã đủ để liên kết dữ liệu.

### Chặn Tool call qua Extension API

Lifecycle event dùng để quan sát không có return value để chặn thực thi. Hook `tool_call` có contract đó. Hook chạy sau `tool_execution_start` và sau khi đối số đã được validate, nhưng trước khi Tool thực thi. Handler trước có thể mutate `event.input` tại chỗ; handler sau nhìn thấy mutation ấy, và Pi không validate lại.

```typescript
import {
  isToolCallEventType,
  type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";

export default function protectProduction(pi: ExtensionAPI) {
  pi.on("tool_call", (event) => {
    if (
      isToolCallEventType("bash", event) &&
      event.input.command.includes("rm -rf")
    ) {
      return {
        block: true,
        reason: "Recursive deletion is disabled by this extension.",
        terminate: true,
      };
    }
  });
}
```

Ở đây, `terminate` áp dụng cho call bị block. Theo [`shouldTerminateToolBatch()`](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/agent/src/agent-loop.ts#L582-L584) ở bản source đã pin, Pi chỉ đánh giá việc kết thúc sau khi batch hiện tại đã tạo xong mọi kết quả cuối. Nếu batch có ít nhất một kết quả và mọi kết quả đều có `terminate: true`, quyết định kết thúc của batch nhận giá trị true; flag này không bao giờ dừng sớm chính batch hiện tại.

### Tiền xử lý model context mà không đổi history

Extension event `context` chạy trước mỗi model call. Event bắt đầu từ một deep clone, nối các message array được trả về theo thứ tự nạp Extension và giữ nguyên session history có thẩm quyền.

```typescript
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function hideEphemeralStatus(pi: ExtensionAPI) {
  pi.on("context", (event) => ({
    messages: event.messages.filter(
      (message) =>
        message.role !== "custom" ||
        message.customType !== "ephemeral-status",
    ),
  }));
}
```

Các hook chuyển đổi khác nằm ở những biên riêng: `input` có thể transform hoặc tự xử lý raw input; `before_agent_start` có thể inject message hoặc thay system prompt của turn; `before_provider_request` có thể thay provider payload đã serialize; `before_provider_headers` mutate header; `message_end` có thể thay finalized message nhưng phải giữ nguyên role; `tool_result` có thể sửa result trước end event.

### Chuyển text tới UI trên trình duyệt

Server có thể chuyển session event thành SSE contract nhỏ hơn. Nếu trình duyệt cần giữ kết nối qua auto-retry hoặc compaction, hãy kết thúc HTTP stream tại `agent_settled` thay vì `agent_end`.

```typescript
import type { ServerResponse } from "node:http";
import type { AgentSession } from "@earendil-works/pi-coding-agent";

export function forwardText(
  session: AgentSession,
  response: ServerResponse,
): () => void {
  const unsubscribe = session.subscribe((event) => {
    if (
      event.type === "message_update" &&
      event.assistantMessageEvent.type === "text_delta"
    ) {
      response.write(
        `data: ${JSON.stringify({ type: "text_delta", delta: event.assistantMessageEvent.delta })}\n\n`,
      );
    }
    if (event.type === "agent_settled") response.end();
  });

  response.on("close", unsubscribe);
  return unsubscribe;
}
```

Browser renderer nên gom các lần vẽ theo refresh rate của màn hình khi provider delta đến nhanh hơn khả năng render của UI. Việc gom đó thuộc phía sau session subscriber; nếu đổi cách Agent phân phối, ngữ nghĩa hoàn tất của mọi consumer khác cũng thay đổi.

## 6. Hành trình đầy đủ của `text_delta`

### Năm chuyển đổi từ provider tới UI

Giả sử adapter nhận một chunk chứa `"Hel"`. Hành trình đi qua các biên package mà không làm phẳng event ở lớp dưới:

```text
provider response bytes
  -> @earendil-works/pi-ai adapter updates cumulative AssistantMessage
  -> AssistantMessageEvent { type: "text_delta", contentIndex, delta: "Hel", partial }
  -> agent-loop replaces the current context partial
  -> AgentEvent { type: "message_update", message, assistantMessageEvent }
  -> Agent.processEvents sets state.streamingMessage
  -> awaited Agent listeners in registration order
  -> AgentSession awaits Extension message_update handlers
  -> synchronous AgentSession subscribers
  -> TUI redraw, JSON/RPC projection, or application transport
```

`AgentSession` không persist `message_update`. Persistence diễn ra tại `message_end`, sau khi finalized assistant message đã thay partial.

### Delta và cumulative partial phục vụ consumer khác nhau

`assistantMessageEvent.delta` chứa mảnh text mới. `event.message` và `assistantMessageEvent.partial` chứa trạng thái assistant tích lũy tại thời điểm đó. Terminal có thể append `delta`; renderer có cấu trúc có thể thay block hiện tại bằng cumulative state.

```typescript
import type { AssistantMessage } from "@earendil-works/pi-ai";
import type { AgentSession } from "@earendil-works/pi-coding-agent";

export function renderAssistantStream(
  session: AgentSession,
  appendText: (contentIndex: number, delta: string) => void,
  renderPartialToolCall: (
    contentIndex: number,
    partial: AssistantMessage,
  ) => void,
): () => void {
  return session.subscribe((event) => {
    if (event.type !== "message_update") return;

    const update = event.assistantMessageEvent;
    if (update.type === "text_delta") {
      appendText(update.contentIndex, update.delta);
    } else if (update.type === "toolcall_delta") {
      renderPartialToolCall(update.contentIndex, update.partial);
    }
  });
}
```

Pi AI provider thường tạo cumulative `AssistantMessage` bằng cách mutate content khi chunk mới đến. Agent loop chỉ shallow-copy object message ở cấp ngoài khi emit, không sao chép sâu mọi content block. Vì vậy, event object không có bảo đảm deep immutability. Hãy đọc dữ liệu cần thiết ngay trong callback, hoặc deep-clone snapshot phải giữ nguyên sau các delta tiếp theo.

### Finalization có thể giữ nguyên object identity

Khi Pi AI phát `done` hoặc `error`, Agent loop lấy `response.result()`, thay partial trong context rồi emit `message_end`. `Agent.processEvents()` xóa `streamingMessage` và append object cuối vào `state.messages` trước khi subscriber chạy.

Sau đó Coding Agent chạy Extension handler `message_end`. Replacement hợp lệ phải giữ cùng message `role`. `AgentSession` mutate tại chỗ object đã được lưu để Agent state, payload `turn_end` và `agent_end` về sau, session subscriber cùng persistence đều giữ một object identity và nội dung replacement giống nhau. Đây là biên mutation có chủ ý; observer không nên freeze event object hoặc giữ nó như một historical snapshot bất biến.

## 7. Tiến độ Tool và thứ tự kết quả

### Một Tool call

Với một Tool call vượt qua preflight, vòng đời hiện tại đặt khâu chuẩn bị và bước đổi result vào các vị trí chính xác:

```text
assistant message_end barrier
tool_execution_start barrier
prepareArguments -> validate -> beforeToolCall
Tool execute -> tool_execution_update* -> settle all update deliveries
await afterToolCall / Extension tool_result
tool_execution_end barrier
message_start ToolResultMessage
message_end ToolResultMessage
turn_end
```

`tool_execution_start.args` là object đối số gốc của Tool call. `prepareArguments` hoặc Extension `tool_call` có thể đổi đối số dùng để thực thi sau đó. Tool tự định nghĩa `tool_execution_update.partialResult`; các Tool streaming tích hợp sẵn thường phát cumulative display result, còn custom Tool phải tự ghi rõ contract cho `details`.

### Batch tuần tự và song song

Sequential mode hoàn tất kết quả preflight tức thời hoặc toàn bộ pipeline đã chuẩn bị của một call, phát end event và vòng đời result message, rồi mới bắt đầu call tiếp theo. Ở bản source đã pin, [`executeToolCallsParallel()`](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/agent/src/agent-loop.ts#L489-L552) tách lượt quét theo thứ tự nguồn khỏi các pipeline đã chuẩn bị chạy đồng thời:

1. Pi phát `tool_execution_start` và chạy preflight tuần tự theo thứ tự Tool call trong assistant message. Lỗi lookup, chuẩn bị, validation, hook hoặc abort trở thành kết quả tức thời, nên `tool_execution_end` của lỗi đó cũng được phát ngay trong lượt quét. Pi vẫn quét các call phía sau trừ khi phát hiện abort.
2. Sau lượt quét, các Tool đã chuẩn bị bắt đầu chạy đồng thời. Mỗi pipeline bình thường phải chờ `tool.execute()`, mọi lần phân phối tiến độ đã thu thập và bước hoàn tất `afterToolCall` trước khi phát `tool_execution_end`.
3. Vì vậy, end event bình thường đi theo thời điểm toàn pipeline hoàn tất, không nhất thiết theo thời điểm `tool.execute()` trả về. Progress event và end event của các call đã chuẩn bị có thể xen kẽ.
4. Sau khi mọi kết quả tức thời hoặc đã chuẩn bị đều hoàn tất, event start/end của `ToolResultMessage` được phát theo thứ tự Tool call ban đầu trong assistant message.
5. Sau các vòng đời result message đó, phép gộp `terminate` trên mọi kết quả mới cung cấp quyết định tiếp tục sau batch; nó không hủy công việc bên trong batch.
6. Sau đó, `turn_end.toolResults` dùng cùng thứ tự nguồn.

```text
assistant calls:         A (preflight error), B, C
source-order scan:       start A -> end A(error) -> start B -> start C
prepared pipelines:      update C -> B execute returns -> C execute returns
finalization events:     end C -> end B   (B's awaited afterToolCall finished later)
result messages:         result A -> result B -> result C
batch terminate:         reduce all finalized results (post-batch decision)
turn_end.toolResults:    [A, B, C]
```

Hãy liên kết cả ba loại Tool event bằng `toolCallId`. Vị trí trong array, thời điểm `tool.execute()` hoàn tất và thứ tự end event sau finalization là ba contract khác nhau.

## 8. Quyết định thiết kế và bài học áp dụng

### Tách quan sát khỏi điều khiển

Dùng lifecycle event để quan sát state đã được cập nhật. Dùng hook có tên rõ ràng để đổi hành vi: `beforeToolCall` hoặc Extension `tool_call` để block; `afterToolCall` hoặc `tool_result` để đổi result; `transformContext` hoặc Extension `context` để chuẩn bị model input; `message_end` để thay message cuối nhưng giữ nguyên role. Cách tách này làm cho return value có ý nghĩa, tránh để observer bất kỳ âm thầm điều khiển run.

### Đặt barrier ở biên nhất quán cần thiết

Agent core await việc phân phối lifecycle vì Tool preflight, state reader và công việc flush bắt buộc cần một chuyển đổi nhất quán. Tiến độ Tool bắt đầu nhiều lần phân phối đồng thời để callback của Tool không bị chặn, rồi join tất cả trước khi hoàn tất result. Public session subscriber của Coding Agent chạy đồng bộ để dispatch UI, còn Extension hook được await tại nơi return value thay đổi thực thi.

Khi thiết kế hệ thống khác, hãy xác định giai đoạn cuối cùng phải nhìn thấy công việc của consumer và đặt điểm join rõ ràng tại đó. Background work không có owner dễ trở thành unhandled rejection, lần ghi sai thứ tự hoặc process thoát trước khi flush xong.

### Giữ policy cấp sản phẩm bên ngoài kernel

Mười core event mô tả mọi Agent run. Retry, compaction, tên session, retry cho summarization, output Bash trực tiếp và final settlement của sản phẩm thuộc Coding Agent. Project trust, resource discovery, provider payload và interactive input thuộc Extension contract. Biên package này giúp Agent cấp thấp hoạt động mà không cần import sản phẩm CLI.

Khi áp dụng thiết kế hướng sự kiện cho hệ thống khác, hãy kiểm tra năm điểm:

1. Mỗi discriminant có đúng một owner và payload được ghi rõ.
2. Thời điểm state trở nên khả kiến trước khi phân phối được xác định rõ.
3. Thứ tự listener, async settlement và cách unsubscribe được mô tả riêng cho từng bề mặt.
4. Update tần suất cao có điểm join được đặt tên trước finalization.
5. Quan sát, can thiệp, mutation, persistence, lỗi và abort là các contract riêng.

## 9. Chương tiếp theo

Sự kiện cho biết khi nào context được chuẩn bị, message đang streaming và Tool result đã trở về. Sự kiện không quyết định instruction, history, resource hay Tool output nào đi vào model call kế tiếp. [Chương 8](ch08-context-engineering.md) sẽ đi theo pipeline kỹ thuật ngữ cảnh đó, từ lắp ráp system prompt và giới hạn Tool output tới compaction và branch summary.

> **Chỉ mục source đã pin:** Pi `0.84.2`, commit `a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c`: [`packages/ai/src/types.ts`](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/ai/src/types.ts#L527), [`packages/agent/src/types.ts`](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/agent/src/types.ts#L421), [`packages/agent/src/agent-loop.ts`](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/agent/src/agent-loop.ts#L281), [`packages/agent/src/agent.ts`](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/agent/src/agent.ts#L240), [`packages/coding-agent/src/core/agent-session.ts`](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/coding-agent/src/core/agent-session.ts#L142), và [`packages/coding-agent/src/core/extensions/runner.ts`](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/coding-agent/src/core/extensions/runner.ts#L801).
