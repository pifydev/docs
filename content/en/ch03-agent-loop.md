---
title: 'Chapter 3: The agent loop'
description: How Pi moves from a user prompt through model streaming, tool execution, queued messages, and termination.
translation_key: ch03-agent-loop
language: en
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
The agent loop converts one user request into a sequence of model calls and tool executions. It continues while the model requests tools or the application has queued messages, then stops at a stable boundary.

## 1. The loop in one view

```text
user message
  -> prepare context
  -> stream model response
  -> append assistant message
  -> execute tool calls, if any
  -> append tool-result messages
  -> process steering and follow-up queues
  -> call the model again or finish
```

A **turn** contains one model call and the tool executions produced by that response. One call to `agent.prompt()` may span several turns.

## 2. Agent state

`AgentState` holds the information needed to continue the loop:

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

The completed messages form durable conversation state. `streamingMessage` and `pendingToolCalls` expose progress while a run is active.

## 3. Starting a run

`agent.prompt()` normalizes the input, appends a user message, emits the opening events, and starts the first turn.

```typescript
await agent.prompt("Inspect package.json and explain the build scripts.");
```

`agent.continue()` starts from existing context without appending a new message. The last message must be a user message or a `ToolResultMessage`, because the next valid action is an assistant response.

## 4. Preparing model context

Before each model call, messages cross two boundaries:

```text
AgentMessage[]
  -> transformContext()
  -> AgentMessage[]
  -> convertToLlm()
  -> Message[]
```

`transformContext` may prune history, inject retrieved context, or apply compaction. `convertToLlm` is the required protocol bridge for custom agent-message types: it must return only messages the model layer understands.

The runtime then calls the configured `streamFn` with the selected model, system prompt, messages, and Tool definitions.

## 5. Streaming the assistant message

The model stream produces fine-grained events such as `text_delta` and `toolcall_delta`. Agent core builds one partial assistant message from those events and publishes `message_update` notifications.

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

When the provider stream settles, the runtime appends the completed assistant message before it begins Tool preflight. Hooks therefore see state that already contains the message which requested the Tool.

## 6. Executing tools

If the assistant message contains `ToolCall` blocks, the runtime processes each call through a fixed pipeline:

1. Resolve the Tool by name.
2. Validate arguments against the Tool schema.
3. Run `beforeToolCall`; it may block the call.
4. Execute the Tool in parallel or sequential mode.
5. Run `afterToolCall` and append a `ToolResultMessage`.

Parallel mode is the default. Result messages are still appended in the source order of the assistant's tool calls, even if individual Tools finish in a different order.

After Tool results are appended, the loop normally starts another turn so the model can interpret them. A Tool result can request `terminate: true`; the loop stops early only when every finalized result in that batch requests termination.

## 7. Steering and follow-up queues

Steering and follow-up messages serve different timing requirements:

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

A steering message is checked after the current turn and before ordinary continuation. Current Tool calls finish first; Pi does not interrupt a Tool in the middle of its implementation.

A follow-up message is checked only when there are no remaining tool calls or steering messages. It extends the same run with another user instruction.

Both queues support `one-at-a-time` and `all` modes. Applications can clear either queue or both.

## 8. Events and settlement

A run without tools emits this high-level sequence:

```text
agent_start
turn_start
message_start / message_end        user message
message_start / message_update* / message_end
turn_end
agent_end
```

Tool calls insert `tool_execution_start`, zero or more `tool_execution_update` events, `tool_execution_end`, and paired Tool result message events before the next turn.

Subscribers are awaited in registration order. `await agent.prompt()` and `await agent.waitForIdle()` settle only after awaited `agent_end` subscribers finish, so an application can flush session state at the final barrier.

## 9. Stop and error conditions

The loop finishes when one of these conditions holds:

- the assistant response has no Tool calls and no queued message remains;
- `shouldStopAfterTurn` returns `true` after a completed turn;
- every Tool result in a batch requests termination;
- the run is aborted;
- the provider or runtime reports an unrecoverable error.

`shouldStopAfterTurn` is a graceful boundary. It does not cancel an active provider request or a running Tool; it runs after `turn_end` and before queue polling.

## 10. Core invariants

The implementation is easier to reason about when five invariants remain visible:

1. Completed messages are appended in conversation order.
2. Every `ToolCall` receives a matching `ToolResultMessage`, including blocked or invalid calls.
3. Provider-specific payloads do not escape the model layer.
4. Application observers receive typed events instead of mutating the loop directly.
5. The loop stops only at an explicit state boundary.

## 11. Next step

[Chapter 4](ch04-model-invocation.md) opens the model-call boundary and explains provider registration, request conversion, streaming, and normalized errors.
