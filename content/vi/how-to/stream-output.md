---
title: Stream output của agent
description: Subscribe event của AgentSession để hiển thị text, thinking, tiến trình tool, lỗi và trạng thái hoàn tất.
translation_key: how-to-stream-output
language: vi
status: reviewed
reviewed_by: Pify maintainers
last_updated: '2026-08-24'
---

`AgentSession` phát lifecycle event trong khi `prompt()` chạy. Hãy subscribe trước khi gửi prompt, cập nhật UI từ các delta và unsubscribe khi consumer bị hủy.

## Stream text ra terminal

```ts title="stream.ts"
import {
  createAgentSession,
  ModelRuntime,
  SessionManager,
} from "@earendil-works/pi-coding-agent";

const modelRuntime = await ModelRuntime.create();
const { session } = await createAgentSession({
  modelRuntime,
  sessionManager: SessionManager.inMemory(),
});

const unsubscribe = session.subscribe((event) => {
  if (
    event.type === "message_update" &&
    event.assistantMessageEvent.type === "text_delta"
  ) {
    process.stdout.write(event.assistantMessageEvent.delta);
  }
});

try {
  await session.prompt("Write a TypeScript haiku.");
  process.stdout.write("\n");
} finally {
  unsubscribe();
  session.dispose();
}
```

`prompt()` resolve sau khi lượt chạy đã nhận hoàn tất, bao gồm tool call, retry và các subscriber cuối lượt cần được await. Callback nhận event tăng dần; không render lại toàn bộ message sau mỗi delta.

## Xử lý các nhóm event

```ts title="render-events.ts"
const unsubscribe = session.subscribe((event) => {
  switch (event.type) {
    case "message_update":
      if (event.assistantMessageEvent.type === "text_delta") {
        appendText(event.assistantMessageEvent.delta);
      } else if (event.assistantMessageEvent.type === "thinking_delta") {
        appendThinking(event.assistantMessageEvent.delta);
      }
      break;

    case "tool_execution_start":
      showTool(event.toolCallId, event.toolName, event.args);
      break;

    case "tool_execution_update":
      updateTool(event.toolCallId, event.partialResult);
      break;

    case "tool_execution_end":
      finishTool(event.toolCallId, event.isError);
      break;

    case "agent_end":
      markIdle();
      break;
  }
});
```

Trong chế độ chạy tool song song, event hoàn tất có thể đến theo thứ tự hoàn thành thay vì thứ tự trong source. Hãy quản lý state UI theo `toolCallId`; đừng giả định tool được bắt đầu gần nhất sẽ hoàn tất tiếp theo.

## Hỗ trợ cancellation

```ts
cancelButton.addEventListener("click", () => {
  void session.abort();
});
```

Abort sẽ dừng thao tác đang chạy. Giữ lại partial output đã hiển thị và dùng state cuối của message hoặc chuỗi event để gắn nhãn chính xác cho lượt chạy.

## Tránh lỗi streaming thường gặp

- Chỉ subscribe một lần cho mỗi session và giữ lại hàm unsubscribe.
- Gom các lần cập nhật UI có tần suất cao bằng `requestAnimationFrame` trong browser client.
- Xử lý thinking như content type riêng; không trộn vào câu trả lời cuối.
- Hiển thị tool update như tiến trình có thể thay thế, không phải message cố định trong transcript.
- Subscribe lại sau khi thao tác của `AgentSessionRuntime` thay thế `runtime.session`.
