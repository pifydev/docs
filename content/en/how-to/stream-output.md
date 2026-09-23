---
title: Stream agent output
description: Render text, thinking, and Tool progress from AgentSession events without buffering a whole run.
translation_key: how-to-stream-output
language: en
official_refs:
  - 'https://github.com/earendil-works/pi/blob/f07218c4d4bbc12bef056a7058c3dd49dfe41abe/packages/coding-agent/src/core/agent-session.ts'
  - 'https://github.com/earendil-works/pi/blob/f07218c4d4bbc12bef056a7058c3dd49dfe41abe/packages/coding-agent/src/modes/rpc/rpc-types.ts'
  - 'https://github.com/earendil-works/pi/blob/f07218c4d4bbc12bef056a7058c3dd49dfe41abe/packages/coding-agent/src/core/model-registry.ts'
status: reviewed
reviewed_by: Pify maintainers
last_updated: '2026-09-23'
---

Subscribe to an `AgentSession` before calling `prompt()`. Its events let a CLI or UI render partial output, Tool work, retries, and final state without repeatedly reading the complete transcript.

:::tip[When you need this]

- A chat UI that reveals text while the model responds
- A CLI that reports thinking and Tool progress
- A web app that must cancel a long run

:::

The examples target Node.js `>=22.19.0`, ESM, and the published package at `0.87.1`:

```bash
npm install @earendil-works/pi-coding-agent@0.87.1
npm install --save-dev tsx typescript @types/node
```

## The event stream

`subscribe()` takes a synchronous `(event) => void` listener and returns its unsubscribe function. `AgentSession` calls listeners immediately; it does not await a returned Promise. Keep the callback small and move expensive rendering into a queue or batch.

| Session event | What it means | Typical UI action |
|---|---|---|
| `message_start` | A user, assistant, or Tool-result message opened | Allocate a message row |
| `message_update` | An assistant message changed | Inspect `assistantMessageEvent` |
| `message_end` | The complete message is available, including an assistant `stopReason` | Commit or label the row |
| `tool_execution_start` / `update` / `end` | One Tool started, reported progress, then returned or failed | Update state keyed by `toolCallId` |
| `agent_end` | One agent attempt ended; `willRetry` says whether session retry follows | End the attempt, not necessarily the run |
| `auto_retry_start` / `end` | Session retry delay or result | Show retry status |
| `agent_settled` | Retries and queued continuation work are finished and the session is idle | Enable input and mark the run complete |

For `message_update`, inspect `assistantMessageEvent.type`. Text, thinking, and Tool arguments each have `*_start`, `*_delta`, and `*_end` phases. In the current agent loop, provider `start` and terminal `done` or `error` become the outer `message_start` and `message_end`; they are not separate top-level session events.

`prompt()` resolves after the session settles. It does not wait for asynchronous work started inside your listener, because session listeners are synchronous.

## 1. Stream plain text

With a model and credentials already configured, this is a complete terminal consumer:

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

Run it with `npx tsx stream.ts`. A delta is a text chunk, not necessarily one character. Append each delta as it arrives; if you also need the final string, accumulate the same deltas while still rendering them.

## 2. Stream Tool calls

Tool streaming has two layers. Nested `toolcall_*` events assemble the model's Tool-call arguments. Later, `tool_execution_*` events report actual execution. This compact renderer handles both layers, text, retry state, and final settlement:

```ts title="render-output.ts"
import type {
  AgentSession,
  AgentSessionEvent,
} from "@earendil-works/pi-coding-agent";

interface OutputView {
  appendText(delta: string): void;
  startToolArguments(contentIndex: number): void;
  appendToolArguments(contentIndex: number, delta: string): void;
  commitToolCall(call: {
    id: string;
    name: string;
    arguments: Record<string, unknown>;
  }): void;
  startTool(id: string, name: string, args: unknown): void;
  updateTool(id: string, partialResult: unknown): void;
  finishTool(id: string, result: unknown, isError: boolean): void;
  finishMessage(stopReason: string, errorMessage?: string): void;
  finishAttempt(willRetry: boolean): void;
  showRetry(
    attempt: number,
    maxAttempts: number,
    delayMs: number,
    errorMessage: string,
  ): void;
  finishRetry(success: boolean, attempt: number, finalError?: string): void;
  markIdle(): void;
}

export function subscribeToOutput(
  session: AgentSession,
  view: OutputView,
): () => void {
  return session.subscribe((event: AgentSessionEvent) => {
    if (event.type === "message_update") {
      const part = event.assistantMessageEvent;
      if (part.type === "text_delta") view.appendText(part.delta);
      if (part.type === "toolcall_start") {
        view.startToolArguments(part.contentIndex);
      }
      if (part.type === "toolcall_delta") {
        view.appendToolArguments(part.contentIndex, part.delta);
      }
      if (part.type === "toolcall_end") view.commitToolCall(part.toolCall);
      return;
    }

    switch (event.type) {
      case "message_end":
        if (event.message.role === "assistant") {
          view.finishMessage(
            event.message.stopReason,
            event.message.errorMessage,
          );
        }
        break;
      case "tool_execution_start":
        view.startTool(event.toolCallId, event.toolName, event.args);
        break;
      case "tool_execution_update":
        view.updateTool(event.toolCallId, event.partialResult);
        break;
      case "tool_execution_end":
        view.finishTool(event.toolCallId, event.result, event.isError);
        break;
      case "agent_end":
        view.finishAttempt(event.willRetry);
        break;
      case "auto_retry_start":
        view.showRetry(
          event.attempt,
          event.maxAttempts,
          event.delayMs,
          event.errorMessage,
        );
        break;
      case "auto_retry_end":
        view.finishRetry(event.success, event.attempt, event.finalError);
        break;
      case "agent_settled":
        view.markIdle();
        break;
    }
  });
}
```

Tools can execute in parallel. Their progress and completion can interleave, so keep execution state by `toolCallId`; do not use “last Tool started” as an implicit stack. `contentIndex` identifies argument blocks while the model is still constructing them. `auto_retry_start` supplies the delay and triggering error; `auto_retry_end` closes that status with success or a final error.

## 3. Stream thinking blocks

Thinking is a separate content type and may be absent. Keep it separate from answer text and decide whether your product should show, collapse, or omit it.

```ts title="thinking.ts"
import type { AgentSession } from "@earendil-works/pi-coding-agent";

interface ThinkingView {
  open(contentIndex: number): void;
  append(delta: string): void;
  close(content: string): void;
}

export function subscribeToThinking(
  session: AgentSession,
  view: ThinkingView,
): () => void {
  return session.subscribe((event) => {
    if (event.type !== "message_update") return;

    const part = event.assistantMessageEvent;
    if (part.type === "thinking_start") view.open(part.contentIndex);
    if (part.type === "thinking_delta") view.append(part.delta);
    if (part.type === "thinking_end") view.close(part.content);
  });
}
```

Do not infer support from a provider name. Test the selected model and treat no thinking events as a valid outcome. Avoid logging thinking by default if it may contain sensitive context.

## 4. Cancel an active run

Await `session.abort()`. It cancels an active retry and the core agent, then waits until the session is idle:

```ts title="cancel.ts"
import type { AgentSession } from "@earendil-works/pi-coding-agent";

export function wireCancel(
  session: AgentSession,
  cancelButton: HTMLButtonElement,
  onError: (error: unknown) => void = console.error,
): () => void {
  const onCancel = () => {
    cancelButton.disabled = true;
    void (async () => {
      try {
        await session.abort();
      } finally {
        cancelButton.disabled = false;
      }
    })().catch(onError);
  };

  cancelButton.addEventListener("click", onCancel);
  return () => cancelButton.removeEventListener("click", onCancel);
}
```

Keep partial output already rendered. If an assistant response is active, it ends through `message_end` with `stopReason: "aborted"`, followed by attempt and settlement events. This API guarantees local cancellation and idle settlement; it does not make a billing guarantee about an external provider.

Headless RPC separates cancellation from queue disposal. The exact public `clear_queue` request and successful response shapes are:

```ts title="rpc-clear-queue.ts"
{ id?: string; type: "clear_queue" }
{
  id?: string;
  type: "response";
  command: "clear_queue";
  success: true;
  data: { steering: string[]; followUp: string[] };
}
```

RPC `abort` cancels the active operation—including an active manual compaction in Pi 0.85.0—and waits for the session to become idle before it responds. Queued steering or follow-up work can continue unless `clear_queue` removes it, so an abort response alone does not mean the queue was discarded.

For interactive Escape, send `clear_queue` before `abort`, then restore the returned `steering` and `followUp` text in the client editor if appropriate. Reversing that order can let queued work start while `abort` is waiting for idle.

This consumption guidance is transport-neutral: the RPC process carries commands and events as JSON Lines, while an application may project session events over SSE, WebSocket, or another channel. Not all providers use SSE, so the Pi 0.85.0 OpenAI Codex fix for a terminal SSE event without a trailing blank line is an adapter detail, not a framing rule for this renderer.

## 5. Batch UI work; do not expect backpressure

An `AgentSession` listener is not an async iterator. Returning a Promise or awaiting inside an async listener does not slow event production. Browser clients should batch deltas and flush at a chosen threshold:

```ts title="browser-batcher.ts"
import type { AgentSession } from "@earendil-works/pi-coding-agent";

const FLUSH_THRESHOLD_CHARS = 64 * 1024;

export function subscribeBatchedText(
  session: AgentSession,
  append: (text: string) => void,
): () => void {
  let pending = "";
  let frame: number | undefined;

  const flush = () => {
    frame = undefined;
    if (pending.length === 0) return;
    const batch = pending;
    pending = "";
    append(batch);
  };

  const unsubscribe = session.subscribe((event) => {
    if (
      event.type !== "message_update" ||
      event.assistantMessageEvent.type !== "text_delta"
    ) {
      return;
    }

    pending += event.assistantMessageEvent.delta;
    if (pending.length >= FLUSH_THRESHOLD_CHARS) {
      if (frame !== undefined) cancelAnimationFrame(frame);
      flush();
    } else if (frame === undefined) {
      frame = requestAnimationFrame(flush);
    }
  });

  return () => {
    unsubscribe();
    if (frame !== undefined) cancelAnimationFrame(frame);
    flush();
  };
}
```

A single delta may exceed the threshold, and `flush()` still calls `append()` synchronously. The threshold controls browser batch size; it is not a hard bound on asynchronous work. For a server or worker, replace `requestAnimationFrame` with a bounded queue and one consumer. Decide explicitly whether overload should pause upstream work outside the listener, coalesce UI updates, or cancel the session; never let a queue grow without a limit.

## 6. Stream a nested Extension model call

An Extension that already has an `ExtensionContext` can open a direct provider stream without constructing another `AgentSession`. Use `ctx.modelRegistry.stream()` for API-specific request options and `ctx.modelRegistry.streamSimple()` for provider-neutral options; both methods call the configured provider with resolved authentication at request time. Consume the returned `AssistantMessageEventStream` with the same `for await` pattern used by Pi AI, then await `.result()` when the complete assistant message and usage are needed.

That nested stream belongs to the Extension. Its low-level Pi AI events are not automatically copied into the parent session's `AgentSessionEvent` stream. Forward only the UI state you own, and include nested-call usage in a custom Tool result when the Tool contract requires session accounting.

## Pitfalls

- **Silent event loss:** log unhandled event types during development. New session event families should not crash the renderer.
- **Rendering only at the end:** accumulate final text if needed, but append `text_delta` chunks immediately.
- **Treating `agent_end` as idle:** check `willRetry`; use `agent_settled` or await `prompt()` / `abort()` for the final boundary.
- **Leaking listeners:** retain the unsubscribe function. When completely finished, unsubscribe and call `session.dispose()`.
- **Keeping an old runtime subscription:** new, switch, fork, clone, and import flows can replace `runtime.session`. Rebind to the new object:

```ts title="runtime-binding.ts"
import type {
  AgentSession,
  AgentSessionEventListener,
  AgentSessionRuntime,
} from "@earendil-works/pi-coding-agent";

export async function followRuntime(
  runtime: AgentSessionRuntime,
  listener: AgentSessionEventListener,
): Promise<() => void> {
  let unsubscribe: (() => void) | undefined;

  const bind = async (session: AgentSession) => {
    unsubscribe?.();
    unsubscribe = session.subscribe(listener);
  };

  runtime.setRebindSession(bind);
  await bind(runtime.session);

  return () => {
    runtime.setRebindSession(undefined);
    unsubscribe?.();
  };
}
```

The runtime aborts and disposes the outgoing session before it applies the replacement, then calls the rebind callback. Do not keep using a captured old session.

## Next

- [Chapter 6: Message System](../ch06-messages.md) explains the message shapes carried by these events.
- [Reference: API events](../reference/api.md#events) lists the public event families and fields.
