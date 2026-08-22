---
title: How to stream output
description: >-
  Render model tokens to the user as they arrive, including tool calls and
  thinking blocks.
translation_key: how-to-stream-output
language: en
---
This guide shows how to consume the agent stream in real time. After it you will be able to render text deltas, surface tool calls as they happen, and stream thinking blocks to the UI without buffering the whole turn.

:::tip[When you need this]
- A chat UI that shows tokens appearing letter by letter
- A CLI that prints progress while the model thinks
- A web app that needs to cancel a long generation
:::

## The event stream

The agent loop emits a typed async iterable. Every event has a `type` field. The full list lives in [Reference: Events](../reference/api.md#events); the four you will use most are:

| Event | Carries |
|---|---|
| `message_start` | The opening of a turn. One per turn. |
| `text_delta` | A chunk of streaming text. Many per turn. |
| `tool_use` | The model calling a tool. Zero or more per turn. |
| `done` | The terminal event. One per turn. |

## 1. Plain text streaming

The minimal useful consumer renders text as it arrives:

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

The output appears character by character. No buffering, no JSON wrapping.

## 2. Stream with tool calls

A turn that uses a tool emits `text_delta`, then `tool_use`, then more `text_delta` after the tool result returns. To show this in a chat UI:

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

The `chat` object is whatever your frontend uses. The point is that each event has enough information to update the UI without re-parsing the full state.

## 3. Stream thinking blocks

Some models emit a separate "thinking" stream before the answer. To show it indented above the answer:

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

The `thinking_delta` event arrives only when the descriptor has `capabilities.thinking: true`. Anthropic and Gemini models support it. OpenAI does not (yet).

## 4. Cancel mid-stream

To cancel a long generation, drop the loop:

```ts title="agent.ts"
const iterator = agentLoop({ model, messages, tools })[Symbol.asyncIterator]();

// Start streaming
const next = await iterator.next();
// ... render `next.value` ...

// User clicked cancel
iterator.return?.(); // closes the underlying HTTP request
```

After `return`, the next call to `next()` resolves with `{ done: true }`. The HTTP request is aborted cleanly. The model provider sees the connection drop and stops billing.

## 5. Backpressure

Async iterators apply natural backpressure. If your renderer is slow, the loop pauses waiting for you to consume the next event. This means you do not need a queue:

```ts title="agent.ts"
// Slow renderer on purpose
async function slowAppend(delta: string) {
  await new Promise((r) => setTimeout(r, 16));
  // ... write to UI ...
}

for await (const event of agentLoop({ model, messages, tools })) {
  if (event.type === "text_delta") await slowAppend(event.delta);
}
```

The model is throttled to whatever speed the renderer can keep up with. Useful when you do not want to buffer 100k tokens in memory before rendering.

## Pitfalls

**Missing a case in the switch**

Unhandled event types are silently dropped. Add a `default:` branch that logs to the console. Future SDK versions may add new event types and you want to know.

**Buffering in a string and flushing at the end**

This defeats the point. The whole reason to use a stream is to render tokens as they arrive. If you need final text, accumulate `text_delta` events into a string but still render incrementally.

**Calling `await iterator.return()` after `done`**

Calling `return` on a finished iterator is a no-op, not an error. But calling it twice may behave differently across runtimes. Guard with a `done` flag.

## Next

- [Chapter 6: Message System](../ch06-messages.md) for the full event taxonomy.
- [Reference: API](../reference/api.md#events) for every event field.
