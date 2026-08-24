---
title: Stream agent output
description: Subscribe to AgentSession events to render text, thinking, tool progress, errors, and completion.
translation_key: how-to-stream-output
language: en
status: reviewed
reviewed_by: Pify maintainers
last_updated: '2026-08-24'
---

`AgentSession` publishes lifecycle events while `prompt()` is running. Subscribe before sending the prompt, update the UI from deltas, and unsubscribe when the consumer is disposed.

## Stream text to a terminal

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

`prompt()` resolves after the accepted run finishes, including tool calls, retries, and awaited end-of-run subscribers. The callback receives incremental events; do not repeatedly render the full message on every delta.

## Handle the event families

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

In parallel tool mode, tool completion events can arrive in completion order rather than source order. Key UI state by `toolCallId`; never assume the last started tool is the next one to finish.

## Support cancellation

```ts
cancelButton.addEventListener("click", () => {
  void session.abort();
});
```

Aborting stops the active operation. Keep partial output already rendered and use the final message state or event sequence to label the run accurately.

## Avoid common streaming bugs

- Subscribe once per session and retain the unsubscribe function.
- Batch high-frequency UI updates with `requestAnimationFrame` in browser clients.
- Treat thinking as a separate content type; do not merge it into the final answer.
- Render tool updates as replaceable progress, not permanent transcript messages.
- Re-subscribe after an `AgentSessionRuntime` operation replaces `runtime.session`.
