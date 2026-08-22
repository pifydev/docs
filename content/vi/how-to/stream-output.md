---
title: How to stream output
description: >-
  Render token model cho người dùng khi chúng đến, bao gồm tool call và thinking
  block.
translation_key: how-to-stream-output
language: vi
---
Hướng dẫn này chỉ cách consume agent stream theo thời gian thực. Sau khi xong bạn sẽ có thể render text delta, hiện tool call khi chúng xảy ra, và stream thinking block ra UI mà không buffer cả turn.

:::tip[Khi nào cần]
- Một chat UI hiện token xuất hiện từng chữ một
- Một CLI in tiến trình khi model đang suy nghĩ
- Một web app cần huỷ một generation dài
:::

## Event stream

Agent loop phát ra một async iterable có kiểu. Mọi event có field `type`. Danh sách đầy đủ ở [Reference: Events](../reference/api.md#events); bốn event bạn dùng nhiều nhất:

| Event | Mang theo |
|---|---|
| `message_start` | Mở đầu của một turn. Một mỗi turn. |
| `text_delta` | Một chunk của text đang stream. Nhiều mỗi turn. |
| `tool_use` | Model gọi một tool. Không hoặc nhiều mỗi turn. |
| `done` | Event kết thúc. Một mỗi turn. |

## 1. Plain text streaming

Consumer tối thiểu hữu dụng render text khi nó đến:

```ts title="agent.ts"
import { agentLoop, getModel } from "@pi-agent-core";

const model = getModel("anthropic", "claude-sonnet-4-5");

for await (const event of agentLoop({
  model,
  messages: [{ role: "user", content: "Tell me a haiku about TypeScript." }],
})) {
  if (event.type === "text_delta") {
    process.stdout.write(event.delta);
  } else if (event.type === "done") {
    console.log("\n[done]");
  }
}
```

Output xuất hiện từng ký tự. Không buffer, không bọc JSON.

## 2. Stream với tool call

Một turn có dùng tool phát ra `text_delta`, rồi `tool_use`, rồi thêm `text_delta` sau khi tool result trở về. Để hiện điều này trong chat UI:

```ts title="agent.ts" {7-11}
for await (const event of agentLoop({ model, messages, tools })) {
  switch (event.type) {
    case "text_delta":
      chat.appendText(event.delta);
      break;
    case "tool_use":
      chat.appendToolCall(event.name, event.args);
      break;
    case "tool_result":
      chat.appendToolResult(event.toolUseId, event.output);
      break;
    case "done":
      chat.finalise(event.reason, event.usage);
      break;
  }
}
```

`chat` là object tuỳ frontend bạn dùng. Điểm là mỗi event có đủ thông tin để update UI mà không cần parse lại toàn bộ state.

## 3. Stream thinking block

Một số model phát ra một stream "thinking" riêng trước câu trả lời. Để hiện nó thụt vào phía trên câu trả lời:

```ts title="agent.ts" {13-15}
for await (const event of agentLoop({ model, messages, tools })) {
  switch (event.type) {
    case "text_delta":
      chat.appendText(event.delta);
      break;
    case "thinking_delta":
      chat.appendThinking(event.delta);
      break;
    case "tool_use":
      chat.appendToolCall(event.name, event.args);
      break;
    case "done":
      chat.finalise(event.reason, event.usage);
      break;
  }
}
```

Event `thinking_delta` chỉ đến khi descriptor có `capabilities.thinking: true`. Model Anthropic và Gemini hỗ trợ. OpenAI thì chưa.

## 4. Huỷ giữa stream

Để huỷ một generation dài, drop loop:

```ts title="agent.ts"
const iterator = agentLoop({ model, messages, tools })[Symbol.asyncIterator]();

// Bắt đầu streaming
const next = await iterator.next();
// ... render `next.value` ...

// Người dùng bấm cancel
iterator.return?.(); // đóng HTTP request bên dưới
```

Sau `return`, lần gọi `next()` tiếp theo resolve với `{ done: true }`. HTTP request bị huỷ sạch. Model provider thấy kết nối drop và dừng tính phí.

## 5. Backpressure

Async iterator áp dụng backpressure tự nhiên. Nếu renderer của bạn chậm, loop tạm dừng chờ bạn consume event tiếp theo. Nghĩa là bạn không cần queue:

```ts title="agent.ts"
// Renderer chậm cố ý
async function slowAppend(delta: string) {
  await new Promise((r) => setTimeout(r, 16));
  // ... ghi ra UI ...
}

for await (const event of agentLoop({ model, messages, tools })) {
  if (event.type === "text_delta") await slowAppend(event.delta);
}
```

Model bị throttle theo tốc độ renderer theo kịp. Hữu ích khi bạn không muốn buffer 100k token trong bộ nhớ trước khi render.

## Pitfalls

**Thiếu một case trong switch**

Event type không được xử lý sẽ bị drop âm thầm. Thêm một nhánh `default:` log ra console. Các version SDK tương lai có thể thêm event type mới và bạn muốn biết.

**Buffer trong một chuỗi và flush ở cuối**

Điều này vô hiệu hoá mục đích. Cả lý do dùng stream là render token khi chúng đến. Nếu bạn cần text cuối, tích luỹ `text_delta` event vào một chuỗi nhưng vẫn render incremental.

**Gọi `await iterator.return()` sau `done`**

Gọi `return` trên iterator đã kết thúc là no-op, không phải lỗi. Nhưng gọi hai lần có thể hành xử khác nhau qua các runtime. Guard bằng cờ `done`.

## Tiếp theo

- [Chapter 6: Message System](../ch06-messages.md) cho taxonomy event đầy đủ.
- [Reference: API](../reference/api.md#events) cho mọi field của event.
