---
title: 'Chapter 7: Event-driven runtime'
description: The Agent event sequence, state visibility, subscriber barriers, and UI integration.
translation_key: ch07-event-driven
language: en
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
Agent core reports progress through typed events. The loop owns state transitions; subscribers observe those transitions and update a UI, persist data, or collect telemetry without becoming part of provider or Tool logic.

## 1. Why events are the public boundary

A model response arrives incrementally, Tool calls may run concurrently, and one prompt may span several turns. Returning only the final string would hide the information an interactive application needs.

Events expose:

- when a run and turn start or end;
- when a message is created, updated, and completed;
- when a Tool starts, reports progress, and completes;
- the normalized assistant stream event behind each update.

The event stream is a state-change log for the active process, not a replacement for persisted session data.

## 2. Event families

| Scope | Events |
| --- | --- |
| Run | `agent_start`, `agent_end` |
| Turn | `turn_start`, `turn_end` |
| Message | `message_start`, `message_update`, `message_end` |
| Tool | `tool_execution_start`, `tool_execution_update`, `tool_execution_end` |

`message_update` is emitted for assistant messages and includes the underlying `assistantMessageEvent`, such as `text_delta` or `toolcall_delta`.

## 3. A run without tools

Calling `prompt("Hello")` produces the following high-level order:

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

The exact number of `message_update` events depends on the provider stream. Consumers must not assume one event per token or one event per text block.

## 4. A run with tools

Tool calls add an execution phase after the assistant message settles:

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

In parallel mode, completion events may follow wall-clock completion order. Tool result messages remain in the source order of the assistant's calls.

## 5. Subscribe to events

`Agent.subscribe()` returns an unsubscribe function:

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

Subscribers are awaited in registration order. Keep high-frequency handlers small; move expensive rendering or telemetry aggregation behind a bounded queue when necessary.

## 6. State visibility and barriers

Event timing has two important guarantees:

1. The agent updates its in-memory state before publishing the corresponding event.
2. Assistant `message_end` subscribers finish before Tool preflight begins.

The second guarantee means `beforeToolCall` and UI subscribers see the assistant message that requested the Tool in current state.

`agent_end` is the final event for a run, but run settlement includes awaited `agent_end` subscribers. `await agent.prompt()` and `await agent.waitForIdle()` therefore resolve after final barrier work completes.

## 7. Rendering incremental output

Treat `message_update` as a patch to the current partial assistant message. Do not append every delta as an independent persisted message.

A renderer commonly keeps:

- completed messages from `agent.state.messages`;
- `agent.state.streamingMessage` for the active assistant response;
- `agent.state.pendingToolCalls` for spinners or progress rows;
- Tool update details for transient status.

On `message_end`, replace the partial view with the completed message already stored in agent state.

## 8. Persistence and telemetry

Persist at stable boundaries such as `message_end`, `turn_end`, or `agent_end`, depending on the storage model. High-frequency deltas are usually unsuitable as durable records because replaying them is more complex than storing the completed message.

Telemetry consumers should attach identifiers for the run, turn, Tool call, provider, and model. Never copy API keys, unredacted prompts, or Tool secrets into generic event logs.

## 9. Failure handling

Handle failures by scope:

- provider failures appear in the normalized assistant outcome and stream events;
- Tool exceptions become error Tool results and Tool completion events;
- application subscriber failures belong to the application and should be isolated or surfaced according to its reliability policy;
- cancellation is coordinated through the supplied `AbortSignal`.

Avoid mutating agent state from multiple event handlers. Use the Agent API for state changes and treat events as observations.

## 10. Integration rules

1. Switch on the discriminated `event.type` field.
2. Ignore unknown future event types only when forward compatibility is intentional.
3. Keep delta handlers idempotent or process them exactly once.
4. Use completed messages as the durable source of truth.
5. Finish critical flush work in an awaited final subscriber.

[Chapter 8](ch08-context-engineering.md) explains how the application chooses the instructions, messages, Tool definitions, and history included in each model call.
