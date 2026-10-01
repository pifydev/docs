---
title: 'Chapter 7: Event-driven runtime'
description: Agent lifecycle events, subscriber barriers, Tool progress, product events, Extension hooks, and UI integration.
translation_key: ch07-event-driven
language: en
chapter: 7
source_url: 'https://www.dgzhuya.com/modules/ch07-event-driven'
official_refs:
  - 'https://github.com/earendil-works/pi/blob/005af57d88ee23b33778f343a9595b32e67ff788/packages/agent/README.md#event-flow'
  - 'https://github.com/earendil-works/pi/blob/005af57d88ee23b33778f343a9595b32e67ff788/packages/coding-agent/docs/extensions.md#events'
  - 'https://github.com/earendil-works/pi/blob/005af57d88ee23b33778f343a9595b32e67ff788/packages/coding-agent/src/core/extensions/runner.ts'
terms_used:
  - Event
  - Agent
  - Tool
  - Stream
status: reviewed
last_updated: '2026-10-01'
translator: Pify maintainers
reviewed_by: Pify maintainers
---
The first six chapters followed data through the model, Agent loop, Tools, and message boundaries. Events were present at every step, but three questions remained: how does a transition reach outside code, which consumers receive it, and when must the Agent wait for them?

This chapter answers those questions across three surfaces in Pi 0.99.2:

- `AgentEvent` from `@earendil-works/pi-agent-core` describes one low-level run;
- `AgentSessionEvent` from `@earendil-works/pi-coding-agent` adds product concerns such as retries and compaction;
- Extension events expose observation plus explicit interception and preprocessing hooks.

Chapters 1–6 form the main runtime walkthrough. Chapter 7 begins the advanced engineering topics, so the discussion now includes settlement, mutation, and failure boundaries that a production UI must handle.

## 1. Why an event system exists

### A delivery-tracking intuition

A delivery app does not make the customer poll the restaurant, courier, and payment service continuously. It publishes state changes: the restaurant accepted the order, the courier collected it, and delivery finished. Each consumer reacts only to the changes it needs.

An Agent run has the same shape. A provider streams a response, several Tool calls may execute, and one prompt may span multiple turns. A final string hides the information needed to show partial text, a pending Tool, an error, or a retry. Events expose those state changes while the run is active. They are a live protocol, not the persisted session format.

### Adding a consumer without editing Agent core

Suppose an application needs a Tool audit line. Editing the Agent around every `tool.execute()` call couples the audit feature to execution internals and creates conflicts when Pi changes. A subscriber stays outside that code:

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

The returned function removes that listener. Keep it and call it when a view, request, or integration is disposed.

### Pub/sub compared with direct calls

A direct-call design makes the producer name every consumer. Pub/sub makes the event contract the dependency:

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

Pi still calls listener functions internally. Decoupling comes from ownership: Agent core owns the event type and delivery loop, while the application owns the listener set. Adding an observer does not add a terminal, database, or analytics dependency to the core package.

## 2. Event protocols and package boundaries

### The ten `AgentEvent` discriminants

`AgentEvent` has ten `type` values. Agent and turn lifecycles are start/end pairs; message and Tool-execution lifecycles also have an update event.

| Family | Discriminant | Payload after `type` |
| --- | --- | --- |
| Run | `agent_start` | none |
| Run | `agent_end` | `messages: AgentMessage[]` |
| Turn | `turn_start` | none |
| Turn | `turn_end` | `message: AgentMessage`, `toolResults: ToolResultMessage[]` |
| Message | `message_start` | `message: AgentMessage` |
| Message | `message_update` | `message: AgentMessage`, `assistantMessageEvent: AssistantMessageEvent` |
| Message | `message_end` | `message: AgentMessage` |
| Tool | `tool_execution_start` | `toolCallId`, `toolName`, `args` |
| Tool | `tool_execution_update` | `toolCallId`, `toolName`, `args`, `partialResult` |
| Tool | `tool_execution_end` | `toolCallId`, `toolName`, `result`, `isError` |

The following is a source-faithful excerpt from [`packages/agent/src/types.ts`](https://github.com/earendil-works/pi/blob/005af57d88ee23b33778f343a9595b32e67ff788/packages/agent/src/types.ts), formatted over more lines but not simplified:

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

One turn contains one assistant response and any Tool calls and results produced by that response. A run contains one or more turns when Tools, steering, or follow-up messages keep the loop active. A prompted run with one Tool call followed by one final model response has this event order:

```text
agent_start
├─ turn_start
│  ├─ message_start                 prompted user message
│  ├─ message_end                   prompted user message
│  ├─ message_start                 assistant response
│  ├─ message_update*               streamed assistant response
│  ├─ message_end                   assistant response
│  ├─ tool_execution_start          requested Tool
│  ├─ tool_execution_update*        requested Tool progress
│  ├─ tool_execution_end            requested Tool
│  ├─ message_start                 ToolResultMessage
│  ├─ message_end                   ToolResultMessage
│  └─ turn_end
├─ turn_start                       next model call
│  ├─ message_start                 assistant response
│  ├─ message_update*               streamed assistant response
│  ├─ message_end                   assistant response
│  └─ turn_end
└─ agent_end
```

Every prompted or injected user message receives its own `message_start` and `message_end`. Only streamed assistant messages receive `message_update`. Section 7 refines the Tool portion for multiple sequential or parallel calls.

### The nested `AssistantMessageEvent`

`message_update` preserves the Pi AI event that caused the update. The exact discriminants from `@earendil-works/pi-ai` are:

| Phase | Events and payloads |
| --- | --- |
| Stream | `start { partial }` |
| Text | `text_start { contentIndex, partial }`, `text_delta { contentIndex, delta, partial }`, `text_end { contentIndex, content, partial }` |
| Thinking | `thinking_start { contentIndex, partial }`, `thinking_delta { contentIndex, delta, partial }`, `thinking_end { contentIndex, content, partial }` |
| Tool call | `toolcall_start { contentIndex, partial }`, `toolcall_delta { contentIndex, delta, partial }`, `toolcall_end { contentIndex, toolCall, partial }` |
| Terminal | `done { reason, message }`, `error { reason, error }` |

Agent core maps the nine text, thinking, and Tool-call start/update/end variants to `message_update`. Pi AI's outer `start` becomes `message_start`; `done` or `error` becomes `message_end`. `done.reason` is `stop`, `length`, `toolUse`, or `deferred`; `error.reason` is `aborted` or `error`.

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

Use the nested discriminant before reading `delta`. `text_start`, `text_end`, and the thinking or Tool-call variants do not all carry that field.

### `AgentSessionEvent`: core lifecycle plus product state

`AgentSession` forwards the ten core discriminants, changes `agent_end` to add `willRetry: boolean`, and adds 13 distinct product discriminants. Counting those inherited and product values gives 23 distinct session event types.

| Product event | Exact payload |
| --- | --- |
| `agent_settled` | none |
| `queue_update` | `steering: readonly string[]`, `followUp: readonly string[]` |
| `compaction_start` | `reason: "manual" \| "threshold" \| "overflow"` |
| `compaction_end` | `reason`, `result`, `aborted`, `willRetry`, optional `errorMessage` |
| `entry_appended` | `entry: SessionEntry` |
| `session_info_changed` | `name: string \| undefined` |
| `thinking_level_changed` | `level: ThinkingLevel` |
| `auto_retry_start` | `attempt`, `maxAttempts`, `delayMs`, `errorMessage` |
| `auto_retry_end` | `success`, `attempt`, optional `finalError` |
| `summarization_retry_scheduled` | `attempt`, `maxAttempts`, `delayMs`, `errorMessage` |
| `summarization_retry_attempt_start` | `source: "branchSummary"`, or `source: "compaction"` plus `reason` |
| `summarization_retry_finished` | none |
| `bash_execution_update` | optional `id`, `delta: string` |

The normalized inventory below is based on [`packages/coding-agent/src/core/agent-session.ts`](https://github.com/earendil-works/pi/blob/005af57d88ee23b33778f343a9595b32e67ff788/packages/coding-agent/src/core/agent-session.ts). It refers back to the core union and collapses multiline formatting. It is not a verbatim source excerpt:

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

`agent_end` closes one low-level Agent run. Coding Agent may still retry, compact, or continue queued work. `agent_settled` marks the product boundary after those automatic continuations have stopped. `bash_execution_update` describes a user `!` or `!!` command executed by the session; it is separate from an LLM-requested Tool's `tool_execution_update`.

### Extension events form a separate contract

`pi.on()` does not consume `AgentSessionEvent` directly. `ExtensionEvent` is a wider Coding Agent contract:

| Family | Exact discriminants |
| --- | --- |
| Startup and resources | `project_trust`, `resources_discover` |
| Session | `session_start`, `session_info_changed`, `session_before_switch`, `session_before_fork`, `session_before_compact`, `session_compact`, `session_compact_failed`, `session_before_tree`, `session_tree`, `session_shutdown` |
| Agent and provider | `before_agent_start`, `agent_start`, `agent_end`, `agent_before_settle`, `agent_settled`, `turn_start`, `turn_end`, `message_start`, `message_update`, `message_end`, `tool_execution_start`, `tool_execution_update`, `tool_execution_end`, `context`, `context_with_system`, `before_provider_request`, `before_provider_headers`, `after_provider_response`, `provider_stream_event`, `cache_warming_decision` |
| Extension UI prompts | `ui_prompt_start`, `ui_prompt_end` |
| Model | `model_select`, `thinking_level_select` |
| Tool, Bash, and input | `tool_call`, `tool_result`, `user_bash`, `input` |

Several names overlap with core events, but the payloads and guarantees belong to the Extension API. For example, Extension `turn_start` adds `turnIndex` and `timestamp`; Extension `agent_end` does not add the session subscriber's `willRetry`; `tool_call` and the two context phases can change execution, while `tool_execution_start` and `message_update` report lifecycle state.

`provider_stream_event` carries a parsed provider frame before Pi normalizes it: `provider`, `api`, and `model` identify the route, while adapter-owned `data` is read-only. It is an observation event inside the existing provider taxonomy, not a normalized `AssistantMessageEvent` and not a mutation hook.

The `input` hook exposes `streamingBehavior` only when a prompt arrives while the session is already streaming: `"steer"` sends it to the steering queue and `"followUp"` sends it to the follow-up queue. `AgentSession.prompt()` lets an Extension command and `input` handlers consume the input before the streaming queue branch. When either consumes it, RPC reports `handled` without `streamingBehavior`. The missing-option error is checked only if neither handler consumes the input and the unhandled prompt reaches the streaming queue branch.

At the RPC boundary, every successful input command reports how the input was accepted. An Extension may consume any of these paths first; otherwise `prompt` starts an idle run or applies the selected streaming behavior, while explicit `steer` and `follow_up` use their named queues.

| RPC command/path | Extension consumes first | Unhandled delivery | Successful `disposition` |
| --- | --- | --- | --- |
| `prompt + idle` | `handled` | start run | `started` |
| `prompt + streaming "steer"` | `handled` | steering queue | `queued` |
| `prompt + streaming "followUp"` | `handled` | follow-up queue | `queued` |
| `steer` | `handled` | steering queue | `queued` |
| `follow_up` | `handled` | follow-up queue | `queued` |

`turn_end` and `agent_before_settle` are actionable boundaries. `TurnEndEvent` requires `turnIndex`, `message`, `toolResults`, `messageEntryId`, `toolResultEntryIds`, `outcome`, `entries`, `continue`, and a context preview. `AgentBeforeSettleEvent` carries the shared boundary state and is part of the exported `ExtensionEvent` union. Host integrations dispatch both through `emitBoundary(baseEvent, buildContext)`, which previews chained entry drafts before they are committed.

| Extension event | Contract | Host scheduling |
| --- | --- | --- |
| `turn_end` | `actionable` | `emitBoundary(baseEvent, buildContext)` |
| `agent_before_settle` | `actionable` | `emitBoundary(baseEvent, buildContext)` |
| `agent_settled` | `requested runs` | `after all settled handlers finish` |

`turn_end` can continue only a normally completed Turn. A low-level `error` or `aborted` response remains a hard exit through `agent_end`, even when a handler returns `continue: true`. Coding Agent applies retry, compaction, and queue policy before the later `agent_before_settle` recovery boundary. A recovery handler should therefore inspect both `event.outcome` and `event.context.canContinue` before appending the entries that make another request valid.

```text
turn_end + outcome=completed + continue=true + context.canContinue=true -> next provider request
turn_end + outcome=error|aborted + continue=true -> agent_end
retry|compaction|queue policy -> agent_before_settle
agent_before_settle + continue=true + context.canContinue=true -> next provider request
```

An actionable handler can append a context omission and ask for one next provider request. Guard the continuation condition; returning `continue: true` unconditionally creates a loop.

```typescript
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export function registerRecoveryBoundary(
  pi: ExtensionAPI,
  targetId: string,
): () => void {
  let recoveryPending = true;
  return pi.on("agent_before_settle", (event) => {
    if (
      !recoveryPending ||
      event.outcome !== "error" ||
      event.context.canContinue
    ) {
      return;
    }
    recoveryPending = false;
    return {
      entries: [
        ...event.entries,
        {
          type: "context_edit",
          targetId,
          replacement: null,
        },
      ],
      continue: true,
    };
  });
}
```

The local flag makes this example a one-shot recovery. A real Extension should replace it with the condition that identifies its abandoned attempt.

If an `agent_settled` handler calls a session API that starts a run, Pi queues that work until every settled handler has finished. One handler therefore cannot start the next run while another handler is still observing the previous settled boundary.

Registration is reversible. `pi.on()` returns an unsubscribe function, and Pi snapshots the handlers for an event before dispatch begins. A handler added or removed during that dispatch does not change the snapshot being processed; the change applies to later dispatches.

```ts title="unsubscribe-extension-handler.ts"
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function temporaryInputHandler(pi: ExtensionAPI) {
  const unsubscribe = pi.on("input", async (event) => {
    void event;
    return { action: "continue" };
  });

  unsubscribe();
}
```

An Extension can also make nested model calls through `ctx.modelRegistry.stream()` for API-specific options or `ctx.modelRegistry.streamSimple()` for provider-neutral options. Both routes use the configured provider and resolved authentication at request time. They do not require an Extension to read `auth.json` or copy an API key into the handler.

| API boundary | Runtime contract |
|---|---|
| `ctx.modelRegistry.stream()` | `configured provider → resolved authentication` |
| `ctx.modelRegistry.streamSimple()` | `configured provider → resolved authentication` |
| `pi.on()` | `returns () => void` |
| `dispatch` | `handler snapshot → registration changes apply to later dispatches` |

At the Pi `0.99.2` baseline, `cache_warming_decision` runs before each scheduled prompt-cache refresh in both the active `streaming` phase and the optional `idle` phase. A handler may return `{ action: "warm" }` or `{ action: "stop" }`; the last returned action wins for that decision. The hook changes whether that refresh is sent, not the model's advertised cache lifetime or the provider's cache behavior.

Pi 0.99.2 exports these prompt event types from the package root:

```typescript
type UIPromptKind =
  "select" | "confirm" | "input" | "editor" | "custom";

interface UIPromptStartEvent {
  type: "ui_prompt_start";
  reason: "ui_prompt";
  kind: UIPromptKind;
  title?: string;
}

interface UIPromptEndEvent {
  type: "ui_prompt_end";
  reason: "ui_prompt";
  kind: UIPromptKind;
  title?: string;
}
```

Blocking user-facing calls to `ctx.ui.select()`, `ctx.ui.confirm()`, `ctx.ui.input()`, `ctx.ui.editor()`, and `ctx.ui.custom()` produce paired `ui_prompt_start` and `ui_prompt_end` status notifications for time Pi spends waiting on the prompt. Both payloads always carry `reason: "ui_prompt"` and the exact `kind`; `title` is present only when the prompt supplies one. This lets a host distinguish “waiting for user” from active agent work without treating the notification as a control hook.

Delivery is best-effort and not awaited. Nested or overlapping prompts are coalesced into one outer waiting span, for which Pi schedules one `ui_prompt_start` and one matching `ui_prompt_end` with `queueMicrotask` around the outer blocking prompt span. These notifications are not ordering barriers: an observer may run after the corresponding UI state transition. A slow or failed observer therefore cannot delay the dialog, and integrations should use the pair as status hints rather than a durable audit barrier.

The exact failure payload is not a token-only catalog entry:

```typescript
type SessionCompactFailedEvent = {
  type: "session_compact_failed";
  reason: "manual" | "threshold" | "overflow";
  errorMessage?: string;
  aborted: boolean;
  willRetry: boolean;
  fromExtension: boolean;
};
```

`errorMessage` is present for non-abort failures and omitted for cancellation or an `AbortError`; `aborted` makes that distinction explicit. `fromExtension` says that extension-provided compaction content was active when the attempt failed, not merely that a `session_before_compact` handler was registered. A failed event is terminal, so `willRetry` is `false` even when `reason` is `"overflow"` and a successful compaction would have retried the interrupted turn.

Pi emits the synchronous session `compaction_end` first; `session_compact_failed` is dispatched and awaited after `compaction_end`. The failed hook therefore settles before the manual `compact()` promise rejects or the automatic path returns `false`.

For a manual attempt, `compact()` rejects only after `session_compact_failed` handlers settle; for an automatic post-start failure that emits this event, the compaction loop returns `false` only after those handlers settle. Neither terminal path appends a new compaction entry. Automatic cancellation, abort, and ordinary started summary failure are handled inside the automatic path rather than thrown to its caller. A no-model result, unavailable preparation, or authentication error before `compaction_start` can return `false` without emitting `compaction_end` or `session_compact_failed`.

Ordinary started compaction failures follow `compaction_start`, then `compaction_end`, and finally the awaited `session_compact_failed` hook.

Exhausted overflow recovery is a separate terminal path. Without a new `compaction_start`, Pi emits `compaction_end` and then awaits `session_compact_failed`. The end event has `result: undefined`; both carry `reason: "overflow"`, `errorMessage` set to either `Context overflow recovery failed after one compact-and-retry attempt. Try reducing context or switching to a larger-context model.` or `Truncated response recovery failed after one compact-and-retry attempt.`, `aborted: false`, and `willRetry: false`; the failed Extension event also carries `fromExtension: false`.

## 3. Delivery, listener order, and settlement

### `Agent.subscribe()` is an awaited subscription

The direct core API accepts a synchronous or asynchronous listener and returns an unsubscribe function:

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

The `Set` of listeners is traversed in registration order. Pi awaits one listener before calling the next listener for that event. A slow listener therefore delays later listeners and the producer phase behind the event.

### State is reduced before subscribers run

`Agent.processEvents()` changes public runtime state first, then calls listeners. This excerpt is pseudocode, condensed from [`packages/agent/src/agent.ts`](https://github.com/earendil-works/pi/blob/005af57d88ee23b33778f343a9595b32e67ff788/packages/agent/src/agent.ts):

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

The real implementation replaces `pendingToolCalls` with a new `Set` on start and end. A listener that receives `message_end` can read the completed message from `agent.state.messages`; a listener that receives `tool_execution_start` finds the call ID in `agent.state.pendingToolCalls`.

### Lifecycle events act as barriers

Most loop emissions are awaited at the call site:

```text
update Agent state
  -> listener 1 settles
  -> listener 2 settles
  -> emit resolves
  -> next producer phase starts
```

This ordering creates concrete barriers. Assistant `message_end` delivery finishes before Tool preflight begins. Each `tool_execution_start` finishes before argument preparation, validation, and `beforeToolCall`. `tool_execution_end` finishes before the corresponding `ToolResultMessage` lifecycle starts.

`agent_end` is the last loop event, but its listeners remain inside the active run. `await agent.prompt(...)` and `await agent.waitForIdle()` resolve after those listeners settle and `finishRun()` clears runtime-owned streaming state.

### Tool progress is concurrent delivery followed by a barrier

Historical Pi documentation described `tool_execution_update` listeners as never awaited. Pi 0.99.2 uses a two-part rule. The Tool's synchronous `onUpdate` callback starts delivery without awaiting it, so a Tool may report another update while subscribers process the previous one. Every delivery promise is collected, and all of them must settle before result postprocessing continues.

The following is source-faithful pseudocode derived from [`executePreparedToolCall()`](https://github.com/earendil-works/pi/blob/005af57d88ee23b33778f343a9595b32e67ff788/packages/agent/src/agent-loop.ts):

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

Within one update, direct `Agent.subscribe()` listeners still run in registration order. Separate update deliveries can overlap, so global completion order between update N and update N+1 is not guaranteed. The `acceptingUpdates` gate drops callbacks made after `tool.execute()` has settled. A rejected progress delivery is observed at `Promise.all`; it does not disappear in the background.

### Low-level streams, `Agent`, and `AgentSession` settle differently

| Surface | Listener shape | Async settlement |
| --- | --- | --- |
| `agentLoop()` / `agentLoopContinue()` | async iterator over `AgentEvent` | Observational stream consumption is not a producer barrier |
| `Agent.subscribe()` | `(event, signal) => void \| Promise<void>` | Listener promises are awaited in registration order |
| `AgentSession.subscribe()` | `(event) => void` | Listeners run synchronously in array order; returned promises are ignored |
| `pi.on()` | Extension handler with `ExtensionContext` | Handler settlement and result semantics depend on the named hook |

`AgentSession` registers an internal async listener on its `Agent`. For a bridged core event, that handler awaits Extension lifecycle handlers first, calls session subscribers synchronously, then persists completed messages on `message_end`. The whole internal handler is one awaited `Agent` listener, but an `async` function passed to `AgentSession.subscribe()` is outside that barrier because the session listener type returns `void`.

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

Use `Agent.subscribe()` for critical awaited work tied to a single low-level run. Use `AgentSession.waitForIdle()` or the `agent_settled` product event when completion must include retry, compaction, and queued-continuation policy. If a session listener starts asynchronous work, track and await that work in the application itself.

## 4. Failure, isolation, and cancellation

### Direct subscriber failures affect the run

`Agent.processEvents()` has no catch around each listener. When listener 1 throws or rejects, later listeners do not receive that event. The error reaches `runWithLifecycle()`, which normally converts a run failure into an assistant failure message and emits `message_start`, `message_end`, `turn_end`, and `agent_end` for it. A listener that also fails during this synthetic failure sequence can make `prompt()` reject.

Catch recoverable application errors inside the subscriber. Rethrow when an incomplete audit, persistence, or policy action should make the run fail visibly:

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

The functions in this example represent application code. The event shape and `AbortSignal` usage are copyable; the failure policy must come from the application.

### Provider, Tool, and abort outcomes stay scoped

Pi AI terminates a failed provider stream with `AssistantMessageEvent.error`. Agent core finalizes the assistant message with `stopReason: "error"` or `"aborted"`, then emits normal message, turn, and run end events. Tool lookup, argument validation, `beforeToolCall`, execution, and `afterToolCall` failures become an error Tool result where the core catches them. The Tool lifecycle still ends with `isError: true`, followed by a `ToolResultMessage` that the next model turn can inspect.

```text
provider failure: message_end(error/aborted) -> turn_end -> agent_end
Tool failure:     tool_execution_end(isError=true)
               -> message_start/end(ToolResultMessage)
               -> turn_end
```

Every direct Agent subscriber receives the active run's `AbortSignal`. `agent.abort()` aborts that signal. Providers, Tools, and subscriber work only stop promptly when they honor it. Aborting does not license a producer to emit progress forever: late Tool updates are rejected by the `acceptingUpdates` gate described above.

### Extension handlers have hook-specific isolation

Coding Agent's Extension runner catches and reports failures for ordinary lifecycle observation and for chained handlers such as `context`, `input`, `message_end`, and `tool_result`. One faulty observer does not prevent later Extension observers from running. Results that can change behavior are awaited in Extension load order.

`tool_call` is routed through Agent core's `beforeToolCall`. If that handler throws, core preflight catches the error and produces an error Tool result instead of executing the Tool. Session subscriber errors follow another path: `_emit()` does not catch them, so a synchronous throw during a bridged Agent event rejects the internal Agent listener and affects the run.

The boundaries are deliberate and event-specific. Code should not assume every object named “listener” has the same failure policy.

## 5. Observation, interception, preprocessing, and UI

### Observe a run

A read-only subscriber can collect timing, telemetry, or a compact Tool trace. Correlate Tools by `toolCallId`; Tool names alone are not unique.

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

Do not put API keys, unredacted prompts, Tool secrets, or raw credentials into a generic event log. Run, turn, provider, model, and Tool-call identifiers usually give enough correlation.

### Intercept a Tool call through the Extension API

Lifecycle observation does not define a return value that blocks execution. The `tool_call` hook does. It runs after `tool_execution_start` and validated argument parsing, before Tool execution. Earlier handlers may mutate `event.input` in place; later handlers see that mutation, and Pi does not revalidate it.

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

`terminate` applies to the blocked call here. Pinned [`shouldTerminateToolBatch()`](https://github.com/earendil-works/pi/blob/005af57d88ee23b33778f343a9595b32e67ff788/packages/agent/src/agent-loop.ts) evaluates termination only after the current batch has produced all of its finalized results. A non-empty result set in which every result has `terminate: true` sets the batch's termination decision; the flag never stops the current batch early.

### Preprocess model context without changing history

The `context` Extension event runs before each model call. It starts from a deep clone, chains returned message arrays in Extension load order, and leaves the authoritative session history intact.

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

Other explicit transformation hooks operate at different boundaries: `input` can transform or handle raw input, `before_agent_start` can inject a message or replace the per-turn system prompt, `before_provider_request` can replace the serialized provider payload, `before_provider_headers` mutates headers, `message_end` can replace a finalized message while retaining its role, and `tool_result` can patch the result before its end event.

### Forward text to a browser UI

A server can translate session events into a smaller SSE contract. End the HTTP stream on `agent_settled`, not `agent_end`, if the browser should remain connected through automatic retry or compaction.

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

Browser renderers should batch redraws to the display refresh rate when provider deltas arrive faster than the UI can paint. That batching belongs behind the session subscriber; changing Agent delivery would also change settlement semantics for every other consumer.

## 6. The complete `text_delta` journey

### From provider to UI

Assume an adapter receives a chunk containing `"Hel"`. The journey crosses package boundaries without flattening the lower-level event:

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

AgentSession does not persist `message_update`. Persistence happens on `message_end`, after the final assistant message has replaced the partial.

### Delta and cumulative partial serve different consumers

`assistantMessageEvent.delta` contains the new text fragment. `event.message` and `assistantMessageEvent.partial` contain the cumulative assistant state at that point. A terminal can append `delta`; a structured renderer can replace its current block with the cumulative state.

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

Pi AI providers commonly build the cumulative `AssistantMessage` by mutating its content as chunks arrive. Agent loop shallow-copies the top-level message when emitting, not every nested content block. Event objects therefore carry no deep-immutability guarantee. Read what you need during the callback, or deep-clone a snapshot that must remain unchanged after later deltas.

### Finalization can preserve object identity

On Pi AI `done` or `error`, Agent loop obtains `response.result()`, replaces the partial in its context, and emits `message_end`. `Agent.processEvents()` clears `streamingMessage` and appends that final object to `state.messages` before subscribers run.

Coding Agent then runs Extension `message_end` handlers. A valid replacement must keep the same message `role`. `AgentSession` mutates the already-stored message object in place so Agent state, later `turn_end` and `agent_end` payloads, session subscribers, and persistence all keep the same object identity and the same replacement content. This is an intentional mutation boundary; observers should not freeze the event object or retain it as an immutable historical snapshot.

## 7. Tool progress and result ordering

### One Tool call

For one Tool call that passes preflight, the current lifecycle places preparation and result transformation at precise points:

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

`tool_execution_start.args` is the original Tool-call argument object. A `prepareArguments` function or `tool_call` Extension may change the arguments used by execution afterward. `tool_execution_update.partialResult` is defined by the Tool; built-in streaming Tools generally publish a cumulative display result, while a custom Tool must document its own `details` contract.

When one Tool calls another through `ctx.executeTool()`, `tool_call`, `tool_result`, and all three `tool_execution_*` events for the nested call carry `parentToolCallId`. The nested call ID is `<parent id>/<n>` and never becomes its own transcript Tool call/result pair; the parent result holds the bounded `nestedCalls` record instead.

### Sequential and parallel batches

Sequential mode finishes one call's immediate preflight outcome or full prepared pipeline, emits its end event and result-message lifecycle, and only then starts the next call. Pinned [`executeToolCallsParallel()`](https://github.com/earendil-works/pi/blob/005af57d88ee23b33778f343a9595b32e67ff788/packages/agent/src/agent-loop.ts) separates a source-order scan from concurrent prepared pipelines:

1. Pi emits `tool_execution_start` and runs preflight sequentially in the assistant message's Tool-call order. A lookup, preparation, validation, hook, or abort failure is an immediate result, so its `tool_execution_end` is also emitted during this scan. Pi then continues scanning later calls unless abort is observed.
2. After the scan, prepared Tool executions start concurrently. Each normal pipeline awaits Tool execution, every collected progress delivery, and `afterToolCall` finalization before emitting `tool_execution_end`.
3. Normal end events therefore follow pipeline-finalization timing, not necessarily raw `tool.execute()` completion timing. Progress and end events from prepared calls may interleave.
4. After every immediate or prepared outcome is finalized, `ToolResultMessage` start/end events are emitted in the assistant message's original Tool-call order.
5. After those result-message lifecycles, the all-results `terminate` reduction supplies the batch's post-batch continuation decision; it does not cancel work within the batch.
6. `turn_end.toolResults` then uses the same source order.

```text
assistant calls:         A (preflight error), B, C
source-order scan:       start A -> end A(error) -> start B -> start C
prepared pipelines:      update C -> B execute returns -> C execute returns
finalization events:     end C -> end B   (B's awaited afterToolCall finished later)
result messages:         result A -> result B -> result C
batch terminate:         reduce all finalized results (post-batch decision)
turn_end.toolResults:    [A, B, C]
```

Correlate all three Tool event types with `toolCallId`. Array position, raw Tool completion, and finalized end-event order are different contracts.

## 8. Design decisions and transfer lessons

### Separate observation from control

Use lifecycle events to observe settled state. Use named hooks to change behavior: `beforeToolCall` or Extension `tool_call` for blocking, `afterToolCall` or `tool_result` for result changes, `transformContext` or Extension `context` for model input, and `message_end` for a same-role final replacement. This split makes a return value meaningful instead of letting an arbitrary observer silently steer the run.

### Put the barrier at the required consistency boundary

Agent core awaits lifecycle delivery because Tool preflight, state readers, and critical flush work require a coherent transition. Tool progress starts deliveries concurrently to avoid blocking the Tool callback, then joins them before result finalization. Coding Agent's public session subscribers stay synchronous for UI dispatch, while Extension hooks are awaited where their results alter execution.

The practical rule is to identify the last phase that must see a consumer's work. Place an explicit join there. Background work without an owner becomes an unhandled rejection, a reordered write, or a process that exits before its final flush.

### Keep product policy outside the kernel

The ten core events describe any Agent run. Retry, compaction, session naming, summarization retry, direct Bash output, and final product settlement live in Coding Agent. Project trust, resource discovery, provider payloads, and interactive input live in the Extension contract. Package ownership keeps the low-level Agent usable without importing the CLI product.

For another event-driven system, carry over five tests:

1. Every discriminant has one documented owner and payload.
2. State visibility before delivery is explicit.
3. Listener order, async settlement, and unsubscribe behavior are explicit per surface.
4. High-frequency updates have a named join before finalization.
5. Observation, interception, mutation, persistence, error, and abort policies are separate contracts.

## 9. Next chapter

Events reveal when context is prepared, messages stream, and Tool results return. They do not decide which instructions, history, resources, or Tool outputs enter the next model call. [Chapter 8](ch08-context-engineering.md) follows that context-engineering pipeline, from system-prompt assembly and Tool-output limits to compaction and branch summaries.

> **Pinned source index:** Pi `0.99.2`, commit `005af57d88ee23b33778f343a9595b32e67ff788`: [`packages/ai/src/types.ts`](https://github.com/earendil-works/pi/blob/005af57d88ee23b33778f343a9595b32e67ff788/packages/ai/src/types.ts), [`packages/agent/src/types.ts`](https://github.com/earendil-works/pi/blob/005af57d88ee23b33778f343a9595b32e67ff788/packages/agent/src/types.ts), [`packages/agent/src/agent-loop.ts`](https://github.com/earendil-works/pi/blob/005af57d88ee23b33778f343a9595b32e67ff788/packages/agent/src/agent-loop.ts), [`packages/agent/src/agent.ts`](https://github.com/earendil-works/pi/blob/005af57d88ee23b33778f343a9595b32e67ff788/packages/agent/src/agent.ts), [`packages/coding-agent/src/core/agent-session.ts`](https://github.com/earendil-works/pi/blob/005af57d88ee23b33778f343a9595b32e67ff788/packages/coding-agent/src/core/agent-session.ts), [`packages/coding-agent/src/core/extensions/types.ts`](https://github.com/earendil-works/pi/blob/005af57d88ee23b33778f343a9595b32e67ff788/packages/coding-agent/src/core/extensions/types.ts), and [`packages/coding-agent/src/core/extensions/runner.ts`](https://github.com/earendil-works/pi/blob/005af57d88ee23b33778f343a9595b32e67ff788/packages/coding-agent/src/core/extensions/runner.ts).
