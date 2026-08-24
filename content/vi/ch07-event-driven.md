---
title: 'Chương 7: Runtime hướng sự kiện'
description: Chuỗi Agent event, state visibility, subscriber barrier và cách tích hợp UI.
translation_key: ch07-event-driven
language: vi
chapter: 7
source_url: 'https://www.dgzhuya.com/modules/ch07-event-driven'
official_refs:
  - 'https://github.com/badlogic/pi-mono/blob/main/packages/agent/README.md#event-flow'
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
Agent core báo tiến độ bằng typed event. Vòng lặp sở hữu state transition; subscriber quan sát các transition để cập nhật UI, lưu dữ liệu hoặc thu telemetry mà không trở thành một phần của provider logic hay Tool logic.

## 1. Vì sao event là public boundary

Model response đến theo từng phần, tool call có thể chạy đồng thời và một prompt có thể kéo dài qua nhiều lượt. Chỉ trả final string sẽ làm mất thông tin ứng dụng tương tác cần.

Event cho biết:

- khi run và turn bắt đầu hoặc kết thúc;
- khi message được tạo, cập nhật và hoàn tất;
- khi Tool bắt đầu, báo tiến độ và hoàn tất;
- normalized assistant stream event đứng sau mỗi update.

Event stream là log thay đổi state của process đang chạy, không thay thế session data đã persist.

## 2. Các nhóm event

| Phạm vi | Event |
| --- | --- |
| Run | `agent_start`, `agent_end` |
| Turn | `turn_start`, `turn_end` |
| Message | `message_start`, `message_update`, `message_end` |
| Tool | `tool_execution_start`, `tool_execution_update`, `tool_execution_end` |

`message_update` được phát cho assistant message và chứa `assistantMessageEvent` bên dưới, chẳng hạn `text_delta` hoặc `toolcall_delta`.

## 3. Run không gọi Tool

Lệnh `prompt("Hello")` tạo thứ tự cấp cao sau:

```text
agent_start
turn_start
message_start   user
message_end     user
message_start   assistant
message_update  assistant delta
message_update  assistant delta
message_end     assistant
turn_end
agent_end
```

Số event `message_update` phụ thuộc provider stream. Consumer không được giả định mỗi token hoặc mỗi text block tương ứng đúng một event.

## 4. Run có Tool

Tool call thêm execution phase sau khi assistant message settle:

```text
message_end              assistant with ToolCall
tool_execution_start
tool_execution_update*   optional progress
tool_execution_end
message_start
message_end              ToolResultMessage
turn_end
turn_start               next model call
```

Trong parallel mode, completion event có thể theo thứ tự hoàn tất thực tế. Tool result message vẫn theo source order của các call trong assistant message.

## 5. Subscribe event

`Agent.subscribe()` trả về unsubscribe function:

```typescript
const unsubscribe = agent.subscribe(async (event, signal) => {
  switch (event.type) {
    case "message_update":
      if (event.assistantMessageEvent.type === "text_delta") {
        process.stdout.write(event.assistantMessageEvent.delta);
      }
      break;
    case "tool_execution_start":
      console.log(`Running ${event.toolName}`);
      break;
    case "agent_end":
      await flushSessionState(signal);
      break;
  }
});

unsubscribe();
```

Subscriber được await theo thứ tự đăng ký. Giữ high-frequency handler nhỏ; đưa rendering hoặc telemetry aggregation tốn thời gian vào bounded queue khi cần.

## 6. State visibility và barrier

Event timing có hai bảo đảm quan trọng:

1. Agent cập nhật in-memory state trước khi phát event tương ứng.
2. Subscriber của assistant `message_end` hoàn tất trước khi Tool preflight bắt đầu.

Bảo đảm thứ hai giúp `beforeToolCall` và UI subscriber nhìn thấy assistant message đã yêu cầu Tool trong state hiện tại.

`agent_end` là event cuối của một run, nhưng run settlement bao gồm các subscriber `agent_end` được await. Vì vậy, `await agent.prompt()` và `await agent.waitForIdle()` chỉ resolve sau khi final barrier work hoàn tất.

## 7. Render incremental output

Hãy xem `message_update` là patch cho partial assistant message hiện tại. Không append từng delta thành một persisted message riêng.

Renderer thường giữ:

- completed message từ `agent.state.messages`;
- `agent.state.streamingMessage` cho assistant response đang chạy;
- `agent.state.pendingToolCalls` cho spinner hoặc progress row;
- Tool update details cho trạng thái tạm thời.

Khi nhận `message_end`, thay partial view bằng completed message đã nằm trong agent state.

## 8. Persistence và telemetry

Persist tại boundary ổn định như `message_end`, `turn_end` hoặc `agent_end`, tùy storage model. Delta tần suất cao thường không phù hợp làm durable record vì replay phức tạp hơn lưu completed message.

Telemetry consumer nên gắn identifier của run, turn, Tool call, provider và model. Không sao chép API key, prompt chưa redact hoặc Tool secret vào event log dùng chung.

## 9. Xử lý failure

Xử lý failure theo phạm vi:

- provider failure xuất hiện trong normalized assistant outcome và stream event;
- Tool exception trở thành error Tool result và Tool completion event;
- application subscriber failure thuộc ứng dụng và cần được isolate hoặc surface theo reliability policy của ứng dụng;
- cancellation được điều phối qua `AbortSignal` đã cung cấp.

Tránh mutate agent state từ nhiều event handler. Dùng Agent API để thay đổi state và xem event như observation.

## 10. Quy tắc tích hợp

1. Switch theo field phân biệt `event.type`.
2. Chỉ bỏ qua future event type chưa biết khi chủ động hỗ trợ forward compatibility.
3. Giữ delta handler idempotent hoặc xử lý đúng một lần.
4. Dùng completed message làm durable source of truth.
5. Hoàn thành critical flush work trong final subscriber được await.

[Chương 8](ch08-context-engineering.md) giải thích cách ứng dụng chọn instruction, message, định nghĩa Tool và history cho mỗi model call.
