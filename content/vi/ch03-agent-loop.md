---
title: 'Chương 3: Vòng lặp Agent'
description: Cách Pi đi từ user prompt qua model streaming, chạy Tool, xử lý message trong hàng chờ và kết thúc.
translation_key: ch03-agent-loop
language: vi
chapter: 3
source_url: 'https://www.dgzhuya.com/modules/ch03-agent-loop'
official_refs:
  - 'https://github.com/badlogic/pi-mono/blob/main/packages/agent/README.md'
terms_used:
  - Agent Loop
  - Tool
  - Event
  - Steering
  - Follow-up
status: reviewed
last_updated: '2026-08-24'
translator: Pify maintainers
reviewed_by: Pify maintainers
---
Vòng lặp Agent (Agent Loop) biến một user request thành chuỗi model call và lần chạy Tool. Vòng lặp tiếp tục khi model yêu cầu Tool hoặc ứng dụng còn message trong hàng chờ, rồi dừng tại một state boundary ổn định.

## 1. Toàn cảnh vòng lặp

```text
user message
  -> chuẩn bị ngữ cảnh
  -> nhận model response theo stream
  -> thêm assistant message
  -> chạy tool call, nếu có
  -> thêm tool-result message
  -> xử lý hàng chờ steering và follow-up
  -> gọi lại model hoặc kết thúc
```

Một **lượt** (turn) gồm một model call và các Tool được response đó yêu cầu. Một lần gọi `agent.prompt()` có thể chạy qua nhiều lượt.

## 2. Agent state

`AgentState` giữ thông tin cần thiết để tiếp tục vòng lặp:

```typescript
interface AgentState {
  systemPrompt: string;
  model: Model<any>;
  thinkingLevel: ThinkingLevel;
  tools: AgentTool<any>[];
  messages: AgentMessage[];
  readonly isStreaming: boolean;
  readonly streamingMessage?: AgentMessage;
  readonly pendingToolCalls: ReadonlySet<string>;
  readonly errorMessage?: string;
}
```

Các message đã hoàn thành tạo thành conversation state bền vững. `streamingMessage` và `pendingToolCalls` phản ánh tiến độ khi run đang hoạt động.

## 3. Bắt đầu một run

`agent.prompt()` chuẩn hóa input, thêm user message, phát các event mở đầu và bắt đầu lượt đầu tiên.

```typescript
await agent.prompt("Inspect package.json and explain the build scripts.");
```

`agent.continue()` tiếp tục từ context hiện tại mà không thêm message mới. Message cuối phải là user message hoặc `ToolResultMessage`, vì hành động hợp lệ tiếp theo là assistant response.

## 4. Chuẩn bị model context

Trước mỗi model call, message đi qua hai boundary:

```text
AgentMessage[]
  -> transformContext()
  -> AgentMessage[]
  -> convertToLlm()
  -> Message[]
```

`transformContext` có thể lược bớt history, chèn retrieved context hoặc áp dụng compaction. `convertToLlm` là protocol bridge bắt buộc cho custom agent-message type: hàm này chỉ được trả về những message model layer hiểu.

Sau đó runtime gọi `streamFn` đã cấu hình với model, system prompt, message và định nghĩa Tool.

## 5. Nhận assistant message theo stream

Model stream phát các event chi tiết như `text_delta` và `toolcall_delta`. Agent core ghép một assistant message tạm thời từ các event này rồi phát thông báo `message_update`.

```typescript
agent.subscribe((event) => {
  if (
    event.type === "message_update" &&
    event.assistantMessageEvent.type === "text_delta"
  ) {
    process.stdout.write(event.assistantMessageEvent.delta);
  }
});
```

Khi provider stream hoàn tất, runtime thêm assistant message đầy đủ trước khi bắt đầu Tool preflight. Vì vậy, hook nhìn thấy state đã chứa message yêu cầu Tool.

## 6. Chạy Tool

Nếu assistant message chứa block `ToolCall`, runtime xử lý từng call theo pipeline cố định:

1. Tìm Tool theo tên.
2. Kiểm tra arguments bằng schema của Tool.
3. Chạy `beforeToolCall`; hook này có thể chặn call.
4. Chạy Tool ở parallel mode hoặc sequential mode.
5. Chạy `afterToolCall` và thêm `ToolResultMessage`.

Parallel mode là mặc định. Result message vẫn được thêm theo thứ tự tool call trong assistant message, kể cả khi các Tool hoàn tất theo thứ tự khác.

Sau khi thêm Tool result, vòng lặp thường bắt đầu lượt mới để model xử lý kết quả. Tool result có thể yêu cầu `terminate: true`; vòng lặp chỉ dừng sớm khi mọi result đã hoàn tất trong batch đều yêu cầu kết thúc.

## 7. Hàng chờ steering và follow-up

Steering message và follow-up message phục vụ hai thời điểm khác nhau:

```typescript
agent.steer({
  role: "user",
  content: "Use the test fixture instead of production data.",
  timestamp: Date.now(),
});

agent.followUp({
  role: "user",
  content: "Summarize the changes after the checks pass.",
  timestamp: Date.now(),
});
```

Steering message được kiểm tra sau lượt hiện tại và trước bước continuation thông thường. Tool đang chạy sẽ hoàn thành trước; Pi không ngắt implementation Tool ở giữa.

Follow-up message chỉ được kiểm tra khi không còn tool call hoặc steering message. Nó nối thêm một user instruction vào cùng run.

Cả hai hàng chờ hỗ trợ mode `one-at-a-time` và `all`. Ứng dụng có thể xóa riêng từng hàng chờ hoặc xóa cả hai.

## 8. Event và thời điểm hoàn tất

Một run không gọi Tool phát chuỗi event cấp cao sau:

```text
agent_start
turn_start
message_start / message_end        user message
message_start / message_update* / message_end
turn_end
agent_end
```

Tool call chèn thêm `tool_execution_start`, không hoặc nhiều event `tool_execution_update`, `tool_execution_end` và event cho Tool result message trước lượt tiếp theo.

Subscriber được await theo thứ tự đăng ký. `await agent.prompt()` và `await agent.waitForIdle()` chỉ settle sau khi subscriber `agent_end` đã hoàn tất, nên ứng dụng có thể flush session state tại barrier cuối.

## 9. Điều kiện dừng và lỗi

Vòng lặp kết thúc khi một trong các điều kiện sau đúng:

- assistant response không có Tool call và không còn message trong hàng chờ;
- `shouldStopAfterTurn` trả về `true` sau một lượt hoàn chỉnh;
- mọi Tool result trong batch đều yêu cầu termination;
- run bị abort;
- provider hoặc runtime báo lỗi không thể phục hồi.

`shouldStopAfterTurn` là graceful boundary. Hook này không hủy provider request hay Tool đang chạy; nó chạy sau `turn_end` và trước bước kiểm tra hàng chờ.

## 10. Các invariant cốt lõi

Năm invariant giúp implementation dễ kiểm tra:

1. Message đã hoàn thành được thêm theo đúng thứ tự hội thoại.
2. Mỗi `ToolCall` có một `ToolResultMessage` tương ứng, kể cả call bị chặn hoặc arguments không hợp lệ.
3. Provider-specific payload không thoát khỏi model layer.
4. Application observer nhận typed event thay vì sửa trực tiếp vòng lặp.
5. Vòng lặp chỉ dừng tại state boundary rõ ràng.

## 11. Bước tiếp theo

[Chương 4](ch04-model-invocation.md) mở boundary model call và giải thích provider registration, request conversion, streaming cùng normalized error.
