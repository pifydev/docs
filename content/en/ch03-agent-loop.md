---
title: "Chapter 3: The agent loop"
description: How Pi turns a prompt into model turns, tool batches, queued interventions, and a settled run.
translation_key: ch03-agent-loop
language: en
chapter: 3
source_url: "https://www.dgzhuya.com/modules/ch03-agent-loop"
official_refs:
  - "https://github.com/earendil-works/pi/blob/f07218c4d4bbc12bef056a7058c3dd49dfe41abe/packages/agent/src/agent-loop.ts"
  - "https://github.com/earendil-works/pi/blob/f07218c4d4bbc12bef056a7058c3dd49dfe41abe/packages/agent/src/agent.ts"
  - "https://github.com/earendil-works/pi/blob/f07218c4d4bbc12bef056a7058c3dd49dfe41abe/packages/agent/src/types.ts"
terms_used:
  - Agent Loop
  - Trace
  - Turn
  - Tool
  - Event
  - Steering
  - Follow-up
status: reviewed
last_updated: '2026-09-23'
translator: Pify maintainers
reviewed_by: Pify maintainers
---

Chapter 2 separated model transport, the Agent runtime, and the coding product. The Agent Loop is the moving part inside that architecture. This chapter starts with why a loop exists, then follows one message through Pi 0.87.1: context preparation, streaming, Tool execution, queued instructions, termination, events, and final settlement.

## 1. Prelude: three ways to use an LLM

The amount of control delegated to the model separates a direct call, a Workflow, and an Agent Loop. All three can use the same provider and model; their control flow differs.

### Mode 1: direct call, “model, answer me”

A direct call sends one prepared context and consumes one response:

```text
user input -> build Context -> models.streamSimple() -> final AssistantMessage
```

The current Pi AI entry point is a `Models` collection. This complete example registers one provider and makes one call:

```typescript
import { createModels, type Context } from "@earendil-works/pi-ai";
import { anthropicProvider } from "@earendil-works/pi-ai/providers/anthropic";

const models = createModels();
models.setProvider(anthropicProvider());

const model = models.getModel("anthropic", "claude-sonnet-4-6");
if (!model) throw new Error("Model not found");

const context: Context = {
  systemPrompt: "You are a translation assistant.",
  messages: [
    {
      role: "user",
      content: "Translate this TypeScript function into Python.",
      timestamp: Date.now(),
    },
  ],
};

const stream = models.streamSimple(model, context);
const response = await stream.result();
console.log(response.content);
```

Prompt construction and response handling are the application’s main work. Translation, extraction, classification, and a bounded question often fit this mode.

### Mode 2: Workflow, “follow these application-defined steps”

A Workflow calls a model several times, but application code fixes the order and decides whether a step passed:

```text
input
  -> model: extract requirements
  -> code: validate required fields
  -> model: draft change
  -> code: run tests
  -> model: explain failures or write summary
```

The model supplies judgment inside each stage. The application owns the state machine. Document pipelines, RAG, review gates, and repeatable approval flows benefit from that predictability.

### Mode 3: Agent Loop, “choose the next operation”

An Agent gives the model a set of Tools and lets each assistant response select the next operation:

```text
user: "Explain why this test fails"
  -> model requests read(test file)
  -> application executes read and appends ToolResultMessage
  -> model requests grep(symbol)
  -> application executes grep and appends ToolResultMessage
  -> model returns an explanation with no ToolCall
  -> run reaches a stable boundary
```

The application still controls the available Tools, permissions, validation, `finishTurn`, queues, and error policy. The model chooses among those permitted operations. Pi repeats model and Tool turns until the runtime reaches an explicit exit boundary.

That division of authority is practical. The model cannot execute an arbitrary function merely by naming it: Agent Core resolves the name against `AgentContext.tools`, normalizes and validates the arguments, and can block the call before product code runs. Likewise, the model cannot keep the process alive by emitting prose that says “continue.” Another Turn needs a Tool batch, an injected steering or follow-up message, or a `finishTurn` continuation accepted by runtime state.

| Dimension          | Direct call                 | Workflow                            | Agent Loop                                  |
| ------------------ | --------------------------- | ----------------------------------- | ------------------------------------------- |
| Next-step decision | Caller                      | Application state machine           | Model output within runtime rules           |
| Model calls        | Usually one                 | Known or bounded by code            | Depends on Tool requests and queues         |
| Main design work   | Context and output handling | Stages, transitions, and validation | Tools, loop policy, events, and termination |
| Model role         | Answer generator            | Specialist inside a stage           | Chooses among permitted operations          |
| Good fit           | Translation or extraction   | RAG or review pipeline              | Coding assistant or open-ended automation   |

## 2. Two concepts first: Trace and Turn

Pi’s public event names make the distinction concrete. A run is bounded by `agent_start` and `agent_end`. A Turn is bounded by `turn_start` and `turn_end`.

### Trace: one complete run

This chapter uses Trace for the whole run initiated by one `Agent.prompt()` or `Agent.continue()` call. “Trace” is a teaching term here, not an exported Pi type.

```text
Trace
├─ agent_start
├─ Turn 1: assistant requests read + grep; both Tools settle
├─ Turn 2: assistant requests edit; the Tool settles
├─ Turn 3: assistant answers without a ToolCall
└─ agent_end
```

A Trace can also end after one Turn, on a hard provider failure, after a `finishTurn` decision, or at a deferred-response boundary. Awaited `Agent` subscribers remain part of settlement even after the `agent_end` event has been emitted.

### Turn: one assistant response plus its Tool batch

A Turn contains exactly one assistant model response and every Tool call that Pi accepts from that response. Three parallel Tool calls still belong to one Turn:

```text
turn_start
  -> one streamFn(model, context, options) call
  -> one completed AssistantMessage
  -> zero or more Tool executions from that message
  -> zero or more ToolResultMessage objects
turn_end
```

The next model call starts another Turn. The initial user prompt is emitted inside the first Turn, before assistant streaming begins. Steering and follow-up messages are likewise emitted when the loop injects them before a later assistant response.

`turn_end.toolResults` contains the finalized Tool result messages for that assistant response. A Turn with no calls carries an empty array. A response with several calls still produces one `turn_end` after the batch settles; it does not close and reopen the Turn around each individual Tool. This boundary gives session persistence and telemetry a stable unit without hiding fine-grained Tool progress events.

### Relationship between Trace and Turn

```text
one Trace
│
├─ Turn 1
│  ├─ AssistantMessage: ToolCall(read), ToolCall(grep)
│  └─ ToolResultMessage(read), ToolResultMessage(grep)
│
├─ Turn 2
│  ├─ AssistantMessage: ToolCall(edit)
│  └─ ToolResultMessage(edit)
│
└─ Turn 3
   └─ AssistantMessage: text, no ToolCall
```

The distinction prevents two common counting errors: treating each Tool in a parallel batch as a Turn, or treating an entire multi-Turn prompt as one Turn.

## 3. Big picture: the message journey and the loop

### Full journey

The complete path for `agent.prompt("Read src/main.ts and explain it")` is:

```text
string input
  -> normalized UserMessage
  -> agent_start, turn_start, user message_start/message_end
  -> transformContext(AgentMessage[])
  -> convertToLlm(AgentMessage[]) -> Message[]
  -> streamFn(model, TranscriptContext, options)
  -> assistant message_start/message_update*/message_end
  -> ToolCall blocks selected from AssistantMessage.content
  -> Tool preflight and execution
  -> ToolResultMessage events and transcript append
  -> finishTurn(completed Turn)
  -> turn_end
  -> apply finishTurn decision
  -> steering queue drain
  -> if another inner Turn is required: prepareNextTurn
  -> if the earlier poll was empty: steering queue refresh after preparation
  -> another Turn, follow-up outer loop, or agent_end
```

During a normal Tool turn, the transcript grows in conversation order. This artifact shows selected fields rather than complete protocol objects:

```json
[
  { "role": "user", "content": "Read src/main.ts" },
  {
    "role": "assistant",
    "content": [{ "type": "toolCall", "id": "call_1", "name": "read" }]
  },
  {
    "role": "toolResult",
    "toolCallId": "call_1",
    "toolName": "read",
    "isError": false
  }
]
```

`AgentState.streamingMessage` exposes the partial assistant message while it is being built. `AgentState.pendingToolCalls` tracks Tool call IDs between `tool_execution_start` and `tool_execution_end`. Completed messages enter `AgentState.messages` on `message_end`.

The loop also maintains `newMessages`, a run-local collector returned by the low-level stream and attached to `agent_end`. For a prompt run it begins with the input messages; for a continuation run it begins empty. It then collects assistant output, Tool results, and injected queue messages. Existing context is therefore distinguishable from artifacts created during this invocation, which is useful when an outer session decides what to persist or display.

### What keeps the loop moving, and what ends it

The loop cannot be reduced to “inspect `stopReason`.” Pi 0.87.1 uses several pieces of state:

```text
assistant response
  ├─ error / aborted ------------------------------> finishTurn observes; hard exit remains
  ├─ ToolCall blocks ------------------------------> Tool batch
  │    ├─ non-terminating batch -------------------> automatic next Turn
  │    └─ every finalized result terminate=true ---> no automatic Tool continuation
  ├─ finishTurn action=end ------------------------> graceful exit after turn_end, before queues
  ├─ steering messages ----------------------------> next inner-loop Turn
  ├─ follow-up messages at stable boundary --------> reopen inner loop
  └─ none of the above ----------------------------> agent_end
```

`StopReason` still records why provider streaming ended:

| Final reason        | What Agent Core does                                                                                                  |
| ------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `toolUse`           | Executes actual `ToolCall` content blocks; the label alone does not continue the loop                                 |
| `stop`              | With no Tool calls, reaches `finishTurn` and the steering/follow-up queue checks                                      |
| `length`            | Never executes Tool calls from the truncated response; emits an error result for each and lets the model reissue them |
| `deferred`          | Takes the ordinary no-Tool post-Turn path; the loop does not poll the `DeferredHandle`                                |
| `error` / `aborted` | Calls `finishTurn`, emits `turn_end`, then hard-exits through `agent_end`; the decision does not override the hard exit |

`pending` is the initial/partial value while some provider streams are in flight. It is not a successful terminal `done` reason. A final `deferred` message carries a `DeferredHandle`; fetching or cancelling it belongs to the host through `Models.fetchDeferred()` or `Models.cancelDeferred()`, outside this Agent Loop.

This explains why a termination report must name both the provider result and the runtime state. “The model returned `stop`” is incomplete if a steering instruction is already queued. “A Tool returned `terminate: true`” is incomplete if another result in the same batch did not. “The stream ended” is incomplete when the final message is deferred and host-level handling remains. The observable finish condition belongs to the whole run, not to one field on one message.

### One rule drives ordinary continuation

The core decision is based on content and finalized Tool state, not one string:

```typescript
// Abridged from packages/agent/src/agent-loop.ts at f07218c4.
const toolCalls = message.content.filter((part) => part.type === "toolCall");
hasMoreToolCalls = false;

if (toolCalls.length > 0) {
  const batch =
    message.stopReason === "length"
      ? await failToolCallsFromTruncatedMessage(toolCalls, emit)
      : await executeToolCalls(currentContext, message, config, signal, emit);

  hasMoreToolCalls = !batch.terminate;
}
```

A `toolUse` reason with no `ToolCall` block does not force another Turn. Conversely, a valid Tool block controls execution even though the runtime must separately handle `length`, abort, hooks, and queues. After Tool execution, batch termination only disables automatic Tool continuation; steering or follow-up messages can still extend the run.

### Minimal loop: the common denominator

The smallest useful Agent loop can be taught without Pi-specific hooks. This is pseudocode, not a copyable API:

```typescript
// Pseudocode
while (true) {
  const assistant = await callModel(messages, tools);
  messages.push(assistant);

  const calls = getCompleteToolCalls(assistant);
  if (calls.length === 0) break;

  const results = await executeAllowedTools(calls);
  messages.push(...results);
}
```

That loop is the ReAct rhythm: the model reasons into an action, the application observes the action by running a Tool, and the observation returns as a Tool result. Production code needs cancellation, validation, event ordering, queue policy, custom messages, and settlement guarantees around it.

### All exit paths

| Exit path              | Trigger                                                   | Queue behavior                                                                                                           |
| ---------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Normal stable boundary | No Tool continuation and no queued message                | Runs `finishTurn`, emits `turn_end`, polls steering and follow-up, then emits `agent_end` if both are empty               |
| Batch termination hint | Every finalized Tool result has `terminate: true`         | Skips automatic Tool continuation, then still runs `finishTurn`, steering, and follow-up                                 |
| Graceful hook stop     | `finishTurn` returns `{ action: "end" }`                 | Emits `turn_end`, then exits before steering and follow-up polling                                                        |
| Provider hard stop     | Final reason is `error` or `aborted`                      | Exposes the completed Turn to `finishTurn`, emits `turn_end`, then skips preparation and queues                           |
| Deferred boundary      | Final reason is `deferred` and there are no Tool calls    | Runs `finishTurn` and steering, then follow-up at a stable boundary if steering is empty; host handles the handle         |
| Callback/runtime throw | A “must not throw” transform, conversion, or hook rejects | Raw low-level normal sequence is not guaranteed; `Agent` catches run failure and emits a synthetic failure turn          |

For a no-Tool `deferred` message, the loop runs `finishTurn` on the completed-Turn snapshot, emits `turn_end`, and then applies the decision. `{ action: "end" }` emits `agent_end` before queue polling. Otherwise the loop polls steering, then follow-up at the stable boundary when steering is empty. Neither poll fetches or cancels the `DeferredHandle`; that remains the host's responsibility.

`Agent.abort()` signals the active provider request and Tool callbacks. Provider-side cancellation normally becomes an `aborted` assistant message. If the signal arrives during Tool processing, started Tools receive the signal; sequential preparation stops after the observed abort, and the next provider boundary receives the already-aborted signal. A Tool must honor its signal for cancellation to be prompt.

## 4. Source walkthrough: base loop and coding-agent layering

The reusable loop now lives in `@earendil-works/pi-agent-core`. The coding product does not maintain a separate private loop. It constructs `Agent`, supplies a `StreamFn` wrapper, converts coding-specific messages, refreshes model/system prompt/Tools between Turns, maps terminal input to steering or follow-up, and persists the emitted state.

The conceptual kernel remains short:

```typescript
// Pseudocode: conceptual kernel only.
for (;;) {
  const assistant = await streamAssistant(context);
  const batch = await executeCompleteToolCalls(assistant);
  if (!batch.needsAnotherModelTurn) break;
}
```

### What the coding agent layers on top

| Product need                                      | Reusable Agent Core mechanism          | Coding Agent policy                                                  |
| ------------------------------------------------- | -------------------------------------- | -------------------------------------------------------------------- |
| Terminal input arrives during a run               | `steer()` and steering queue modes     | Interactive/RPC input selects steering                               |
| A task should wait until the current task settles | `followUp()` and the outer queue check | UI and RPC expose follow-up commands                                 |
| Extensions alter model-visible context            | `transformContext` and `convertToLlm`  | Extension context event, custom message conversion, image blocking   |
| Settings or extensions change between Turns       | `prepareNextTurnWithContext`           | Refresh system prompt, Tools, model, and thinking level              |
| Provider retries, headers, and timeouts           | Injected `StreamFn`                    | `ModelRuntime.streamSimple()` wrapper and Extension provider hooks   |
| Session/UI updates                                | Typed `AgentEvent` stream              | `AgentSession` persistence, rendering, compaction, and queue display |

This is a correction to older source tours: steering, follow-up, turn hooks, and parallel Tool scheduling are Agent Core features at the pinned revision. Coding Agent supplies product policy through those extension points.

### 4.1 Entry: `Agent`, `agentLoop()`, and `agentLoopContinue()`

Most applications should enter through `Agent`. The current model stream function is bound to its `Models` instance:

```typescript
import { Agent } from "@earendil-works/pi-agent-core";
import { createModels } from "@earendil-works/pi-ai";
import { anthropicProvider } from "@earendil-works/pi-ai/providers/anthropic";

const models = createModels();
models.setProvider(anthropicProvider());
const model = models.getModel("anthropic", "claude-sonnet-4-6");
if (!model) throw new Error("Model not found");

const agent = new Agent({
  initialState: {
    systemPrompt: "Inspect code before making a claim.",
    model,
    tools: [],
  },
  streamFn: models.streamSimple.bind(models),
});

await agent.prompt("Explain the build scripts in package.json.");
```

The two exported low-level functions return `EventStream<AgentEvent, AgentMessage[]>`:

```typescript
function agentLoop(
  prompts: AgentMessage[],
  context: AgentContext,
  config: AgentLoopConfig,
  signal: AbortSignal | undefined,
  streamFn: StreamFn,
): EventStream<AgentEvent, AgentMessage[]>;
```

```typescript
function agentLoopContinue(
  context: AgentContext,
  config: AgentLoopConfig,
  signal: AbortSignal | undefined,
  streamFn: StreamFn,
): EventStream<AgentEvent, AgentMessage[]>;
```

| Entry                 | Adds prompt messages | Owns durable state/queues        | Event-consumer barrier                   |
| --------------------- | -------------------- | -------------------------------- | ---------------------------------------- |
| `Agent.prompt()`      | Yes                  | Yes                              | Awaits subscribers in registration order |
| `agentLoop()`         | Yes                  | Caller owns returned messages    | Raw stream is observational              |
| `agentLoopContinue()` | No                   | Caller supplies existing context | Raw stream is observational              |

`agentLoopContinue()` requires non-empty context whose last message is not an assistant message. After `convertToLlm`, the provider-facing tail must be `user` or `toolResult`. This path is for an already prepared continuation; it does not invent a retry prompt.

Low-level callers must also own transcript persistence. `agentLoop()` creates a working message array and returns the messages created by that invocation through `stream.result()`; the supplied `AgentContext` is not a stateful substitute for `Agent`. A caller that wants another independent low-level run must merge the returned artifacts into its own context deliberately. This ownership rule is one reason the `Agent` wrapper is the safer default.

The raw context carries transcript messages and optional executable Tool implementations. The provider prompt is the leading `SystemMessage`, not an `AgentContext.systemPrompt` field. Any `toolsAdded` or `toolsRemoved` on that system message describe the transcript's Tool state; `AgentContext.tools` holds the actual `AgentTool` callbacks the runtime can execute. This complete low-level example preserves the system message during conversion:

```typescript
import {
  agentLoop,
  type AgentContext,
  type AgentLoopConfig,
  type AgentMessage,
} from "@earendil-works/pi-agent-core";
import type { Message } from "@earendil-works/pi-ai";
import { builtinModels } from "@earendil-works/pi-ai/providers/all";

const models = builtinModels();
const model = models.getModel("openai", "gpt-4o-mini");
if (!model) throw new Error("Model not found");

const rawContext: AgentContext = {
  messages: [
    {
      role: "system",
      content: "Be precise.",
      timestamp: Date.now(),
    },
  ],
  tools: [],
};
const prompts: AgentMessage[] = [
  {
    role: "user",
    content: "Inspect package.json.",
    timestamp: Date.now(),
  },
];
const config: AgentLoopConfig = {
  model,
  convertToLlm: (messages) =>
    messages.filter(
      (message): message is Message =>
        message.role === "system" ||
        message.role === "user" ||
        message.role === "assistant" ||
        message.role === "toolResult",
    ),
  toolExecution: "parallel",
};

const events = agentLoop(
  prompts,
  rawContext,
  config,
  undefined,
  models.streamSimple.bind(models),
);
void events;
```

The public `Agent` creates snapshots of its system prompt, messages, and Tools, runs `runAgentLoop` or `runAgentLoopContinue`, then reduces events back into live `AgentState`.

### 4.2 Skeleton of `runLoop()`: core first, shells second

#### Core: the inner loop

The pinned inner condition includes both automatic Tool continuation and injected messages:

```typescript
// Faithfully abridged from packages/agent/src/agent-loop.ts.
let lastCompletedTurn: PrepareNextTurnContext | undefined;
let explicitContinuation = false;

while (hasMoreToolCalls || pendingMessages.length > 0) {
  if (lastCompletedTurn) {
    const nextTurnSnapshot = await config.prepareNextTurn?.(lastCompletedTurn);
    if (nextTurnSnapshot) {
      currentContext = nextTurnSnapshot.context ?? currentContext;
      config = {
        ...config,
        model: nextTurnSnapshot.model ?? config.model,
        reasoning:
          nextTurnSnapshot.thinkingLevel === undefined
            ? config.reasoning
            : nextTurnSnapshot.thinkingLevel === "off"
              ? undefined
              : nextTurnSnapshot.thinkingLevel,
      };
    }
    if (pendingMessages.length === 0) {
      pendingMessages = (await config.getSteeringMessages?.()) || [];
    }
    await emit({ type: "turn_start" });
  }

  if (pendingMessages.length > 0) {
    for (const pendingMessage of pendingMessages) {
      await emit({ type: "message_start", message: pendingMessage });
      await emit({ type: "message_end", message: pendingMessage });
      currentContext.messages.push(pendingMessage);
      newMessages.push(pendingMessage);
    }
    pendingMessages = [];
  }

  const message = await streamAssistantResponse(
    currentContext,
    config,
    signal,
    emit,
    streamFunction,
  );
  newMessages.push(message);

  if (message.stopReason === "error" || message.stopReason === "aborted") {
    lastCompletedTurn = {
      message,
      toolResults: [],
      context: currentContext,
      newMessages,
    };
    await config.finishTurn?.(lastCompletedTurn, signal);
    await emit({ type: "turn_end", message, toolResults: [] });
    await emit({ type: "agent_end", messages: newMessages });
    return;
  }

  const toolCalls = message.content.filter((part) => part.type === "toolCall");
  const toolResults: ToolResultMessage[] = [];
  hasMoreToolCalls = false;
  if (toolCalls.length > 0) {
    const executedToolBatch =
      message.stopReason === "length"
        ? await failToolCallsFromTruncatedMessage(toolCalls, emit)
        : await executeToolCalls(currentContext, message, config, signal, emit);
    toolResults.push(...executedToolBatch.messages);
    hasMoreToolCalls = !executedToolBatch.terminate;
    for (const result of toolResults) {
      currentContext.messages.push(result);
      newMessages.push(result);
    }
  }

  lastCompletedTurn = {
    message,
    toolResults,
    context: currentContext,
    newMessages,
  };

  const decision = await config.finishTurn?.(lastCompletedTurn, signal);
  await emit({ type: "turn_end", message, toolResults });
  if (decision?.action === "end") {
    await emit({ type: "agent_end", messages: newMessages });
    return;
  }

  explicitContinuation = decision?.action === "continue";
  pendingMessages = (await config.getSteeringMessages?.()) || [];
  if (hasMoreToolCalls || pendingMessages.length > 0) {
    explicitContinuation = false;
  }
}
```

`hasMoreToolCalls` begins `true` so the first assistant response runs even with no pending messages. Each later iteration corresponds to a new Turn. The abridgement removes detailed helper bodies but preserves the pinned control-flow order.

#### Layering: the outer queue shell and stateful wrapper

There are two shells around that kernel:

```text
Agent wrapper
  ├─ mutable public state
  ├─ awaited subscribers
  ├─ AbortController and settlement promise
  └─ steering/follow-up queue objects
       |
       └─ runLoop outer while(true)
            ├─ inner while(tool continuation || pending messages)
            └─ when inner stops: drain follow-up, honor one explicit continuation, or break
```

The outer `while (true)` is not another model algorithm. At the point the Agent would otherwise stop, it reopens the inner loop for queued follow-up messages or one context-only request selected by `finishTurn`.

### 4.3 Steering injection

Applications enqueue a complete `AgentMessage`:

```typescript
agent.steer({
  role: "user",
  content: "Read the test fixture instead of production data.",
  timestamp: Date.now(),
});
```

The queue does not interrupt the active provider stream or a running Tool. Agent Core polls steering before the first inner-loop iteration and after every completed Turn whose `finishTurn` decision is not `end`. If Tool continuation or that post-Turn poll warrants another iteration, it runs `prepareNextTurn`; when the earlier poll was empty, it polls once more after preparation so steering queued during a long-running hook can join the next Turn:

```typescript
if (pendingMessages.length > 0) {
  for (const message of pendingMessages) {
    await emit({ type: "message_start", message });
    await emit({ type: "message_end", message });
    currentContext.messages.push(message);
    newMessages.push(message);
  }
  pendingMessages = [];
}
```

`one-at-a-time` drains the oldest queued message per poll. `all` drains the whole queue. Because polling occurs at Turn boundaries, “steering” means next-Turn priority, not mid-Tool preemption.

### 4.4 `streamAssistantResponse()`: the model boundary

#### Phase A: transform Agent context

The first hook works entirely in the richer application message domain:

```typescript
let messages = context.messages;
if (config.transformContext) {
  messages = await config.transformContext(messages, signal);
}
```

Coding Agent uses this stage to let Extensions transform context. Compaction or retrieval can also return a different `AgentMessage[]`. The contract says the hook must not throw; on failure it should return the original messages or another safe fallback.

```text
durable AgentMessage[]
  -> transformContext()
  -> turn-specific AgentMessage[]
```

The returned array prepares one request. It does not replace the durable transcript unless application policy explicitly performs a separate state update.

#### Phase B: convert `AgentMessage` to `Message`

`convertToLlm` is required at the low-level boundary:

```typescript
const llmMessages = await config.convertToLlm(messages);
```

The default `Agent` converter retains `system`, `user`, `assistant`, and `toolResult` roles. Coding Agent instead maps `bashExecution`, `custom`, `branchSummary`, and `compactionSummary` messages into user messages, while excluded Bash messages are filtered out:

```typescript
// Faithfully abridged from packages/coding-agent/src/core/messages.ts.
switch (m.role) {
  case "bashExecution":
    if (m.excludeFromContext) return undefined;
    return {
      role: "user",
      content: [{ type: "text", text: bashExecutionToText(m) }],
      timestamp: m.timestamp,
    };
  case "custom": {
    const content =
      typeof m.content === "string"
        ? [{ type: "text" as const, text: m.content }]
        : m.content;
    return { role: "user", content, timestamp: m.timestamp };
  }
  case "branchSummary":
    return {
      role: "user",
      content: [
        {
          type: "text" as const,
          text: BRANCH_SUMMARY_PREFIX + m.summary + BRANCH_SUMMARY_SUFFIX,
        },
      ],
      timestamp: m.timestamp,
    };
  case "compactionSummary":
    return {
      role: "user",
      content: [
        {
          type: "text" as const,
          text:
            COMPACTION_SUMMARY_PREFIX + m.summary + COMPACTION_SUMMARY_SUFFIX,
        },
      ],
      timestamp: m.timestamp,
    };
  case "system":
  case "user":
  case "assistant":
  case "toolResult":
    return m;
}
```

`bashExecutionToText()` and the two summary prefix/suffix constants are declared in the same pinned file. The excerpt preserves all four coding-specific role branches instead of standing in invented conversion helpers.

The type transition is intentionally lossy:

```text
AgentMessage[]                           Message[]
├─ system ----------------------------> system
├─ user ------------------------------> user
├─ assistant -------------------------> assistant
├─ toolResult ------------------------> toolResult
├─ compactionSummary -----------------> user summary
├─ bashExecution(excluded) -----------> removed
└─ custom ----------------------------> user content
```

Provider adapters never need to understand Coding Agent’s storage or UI message types.

The order of the two hooks is part of the contract. `transformContext` can reason about application-only types before anything is discarded. `convertToLlm` then performs the final projection into the provider union. Reversing them would make compaction or Extension logic blind to messages that the model should not receive directly but that still carry useful application state.

#### Phase C: build `TranscriptContext` and call the selected model

The loop converts application messages first, then normalizes the result into the `TranscriptContext` accepted by `StreamFn`. The system prompt and transcript Tool declarations remain in leading system messages; executable `AgentTool` implementations stay in `AgentContext.tools` and are used by Agent Core for execution rather than copied into the provider wrapper:

```typescript
import type {
  AgentContext,
  AgentLoopConfig,
  StreamFn,
} from "@earendil-works/pi-agent-core";
import {
  normalizeContext,
  type AssistantMessageEventStream,
  type SimpleStreamOptions,
} from "@earendil-works/pi-ai";

async function requestAssistant(
  context: AgentContext,
  config: AgentLoopConfig,
  streamFunction: StreamFn,
  options?: SimpleStreamOptions,
): Promise<AssistantMessageEventStream> {
  const llmMessages = await config.convertToLlm(context.messages);
  const llmContext = normalizeContext({ messages: llmMessages });
  return streamFunction(config.model, llmContext, options);
}
```

The production loop also resolves the current API key and merges the portable stream options before making this call.

For ordinary Agent Core applications, pass the current model collection method with its receiver:

```typescript
const streamFn = models.streamSimple.bind(models);
```

Coding Agent wraps the same contract rather than passing `Models` directly:

```typescript
// Faithfully abridged from packages/coding-agent/src/core/sdk.ts.
streamFn: async (model, context, options) => {
  const providerRetrySettings = settingsManager.getProviderRetrySettings();
  const httpIdleTimeoutMs = settingsManager.getHttpIdleTimeoutMs();
  const effectiveTimeoutMs =
    httpIdleTimeoutMs === 0 ? 2147483647 : httpIdleTimeoutMs;
  const timeoutMs =
    options?.timeoutMs ?? providerRetrySettings.timeoutMs ?? effectiveTimeoutMs;
  const websocketConnectTimeoutMs =
    options?.websocketConnectTimeoutMs ??
    settingsManager.getWebSocketConnectTimeoutMs();
  const headerRunner = extensionRunnerRef.current;

  return modelRuntime.streamSimple(model, context, {
    ...options,
    timeoutMs,
    websocketConnectTimeoutMs,
    maxRetries: options?.maxRetries ?? providerRetrySettings.maxRetries,
    maxRetryDelayMs:
      options?.maxRetryDelayMs ?? providerRetrySettings.maxRetryDelayMs,
    transformHeaders: async (requestHeaders) => {
      const headers = mergeProviderAttributionHeaders(
        model,
        settingsManager,
        options?.sessionId,
        requestHeaders,
      );
      return headerRunner?.hasHandlers("before_provider_headers")
        ? headerRunner.emitBeforeProviderHeaders(headers ?? {})
        : (headers ?? {});
    },
  });
},
```

The surrounding `sdk.ts` scope supplies `settingsManager`, `extensionRunnerRef`, `mergeProviderAttributionHeaders`, and `modelRuntime`. The wrapper applies timeout and retry settings, provider attribution, and the Extension header hook. Credential resolution remains an Agent Loop concern through `getApiKey`; the loop still sees only `StreamFn`.

| Context part                            | Typical stability across Turns | Why it can still change                                      |
| --------------------------------------- | ------------------------------ | ------------------------------------------------------------ |
| leading `SystemMessage`                 | Often stable                   | `prepareNextTurn` or product settings may replace prompt state |
| executable `AgentContext.tools`         | Often stable                   | Extensions or a Tool result may change availability          |
| transcript Tool declarations in system | Often stable                   | System messages can declare Tool additions and removals       |
| `messages`                              | Grows each Turn                | Assistant and Tool result messages are appended               |
| `model`                                 | Usually stable                 | `prepareNextTurn` can select another model                     |

Provider adapters own cache-control serialization. Rebuilding the small `TranscriptContext` object does not itself define a cache hit; provider-visible content and provider cache semantics do.

#### Phase D: stream and replace the assistant message in place

`streamAssistantResponse()` reserves one transcript slot on `start`, replaces that slot with each partial, and finally replaces it with the completed message:

```typescript
// Faithfully abridged from packages/agent/src/agent-loop.ts at f07218c4.
case "start":
  partialMessage = event.partial;
  context.messages.push(partialMessage);
  await emit({ type: "message_start", message: { ...partialMessage } });
  break;

case "text_delta":
case "toolcall_delta":
case "thinking_delta":
  partialMessage = event.partial;
  context.messages[context.messages.length - 1] = partialMessage;
  await emit({ type: "message_update", message: { ...partialMessage }, assistantMessageEvent: event });
  break;

case "done":
case "error":
  finalMessage = await response.result();
  context.messages[context.messages.length - 1] = finalMessage;
  await emit({ type: "message_end", message: finalMessage });
  return finalMessage;
```

The actual switch also handles `*_start` and `*_end` events. If a stream reaches completion without a `start` event, the implementation appends the final message and synthesizes `message_start` before `message_end`.

```text
start          messages[last] = empty/initial AssistantMessage
text_delta     messages[last] = newer partial AssistantMessage
toolcall_end   messages[last] = partial with complete ToolCall
done/error     messages[last] = final AssistantMessage
```

One slot avoids storing every token delta as a conversation message. Subscribers still receive each typed update for rendering.

### 4.5 Stop and termination checks

`finishTurn` receives the finalized assistant message, Tool results, current context, and run-local `newMessages`. Use this migration shape when a predicate should stop only after a normal response:

```typescript
import type { FinishTurn } from "@earendil-works/pi-agent-core";

declare const shouldEnd: (message: Parameters<FinishTurn>[0]["message"]) => boolean;

const finishTurn: FinishTurn = ({ message }) => {
  if (message.stopReason === "error" || message.stopReason === "aborted") {
    return undefined;
  }
  return shouldEnd(message) ? { action: "end" } : undefined;
};
```

The callback runs before `turn_end`; Agent Core saves its decision and applies it after `turn_end`. Error and aborted responses are visible to the callback but remain hard exits. Returning `undefined` for them preserves that default and prevents a normal-response predicate from running against a failure object.

| Callback / result | Responses | Runtime boundary |
| --- | --- | --- |
| `finishTurn` | `normal, error, aborted` | `runs before turn_end; decision applies after turn_end` |
| `normal + { action: "end" }` | `turn_end` | `agent_end before queue polling` |
| `error / aborted + undefined` | `turn_end` | `hard exit` |

For every non-hard-exit final reason, the loop inspects actual Tool blocks. `length` is a special safety branch: arguments may be syntactically salvageable but incomplete, so Pi emits a failed Tool result for every call and executes none. `{ action: "continue" }` ensures one next provider request; an existing Tool, steering, or follow-up continuation satisfies it without adding another request. Only a continuing inner loop runs request preparation before its next `turn_start`.

### 4.6 Execute Tool calls

The two modes preserve conversation order in different ways:

| Stage                | Sequential mode    | Parallel mode                                     |
| -------------------- | ------------------ | ------------------------------------------------- |
| Preflight            | One call at a time | Source order, before any allowed execution begins |
| Execution            | One call at a time | Allowed prepared calls run concurrently           |
| `tool_execution_end` | Source order       | Completion order                                  |
| `ToolResultMessage`  | Source order       | Source order after the batch settles              |

If any targeted Tool declares `executionMode: "sequential"`, the whole assistant batch runs sequentially. Preflight resolves the Tool, applies `prepareArguments`, validates the schema, and calls `beforeToolCall`:

```typescript
// Faithfully abridged from packages/agent/src/agent-loop.ts at f07218c4.
const preparedToolCall = prepareToolCallArguments(tool, toolCall);
const validatedArgs = validateToolArguments(tool, preparedToolCall);
const beforeResult = await config.beforeToolCall?.(
  { assistantMessage, toolCall, args: validatedArgs, context: currentContext },
  signal,
);
```

Unknown Tools, invalid arguments, thrown preflight code, blocked calls, and observed aborts become immediate error results. `afterToolCall` runs only after an allowed Tool actually executes; it may replace `content`, `details`, `usage`, `isError`, or `terminate` before final events:

```typescript
// Faithfully abridged from packages/agent/src/agent-loop.ts at f07218c4.
const afterResult = await config.afterToolCall?.(
  {
    assistantMessage,
    toolCall,
    args,
    result,
    isError,
    context: currentContext,
  },
  signal,
);

result = {
  ...result,
  content: afterResult?.content ?? result.content,
  details: afterResult?.details ?? result.details,
  usage: afterResult?.usage ?? result.usage,
  terminate: afterResult?.terminate ?? result.terminate,
};
isError = afterResult?.isError ?? isError;
```

For each finalized call, Pi emits `tool_execution_end`, then a `message_start`/`message_end` pair for the normalized `ToolResultMessage`. Under an un-aborted batch this produces one result per call. If abort is observed while preparing a batch, later source calls may never start.

Batch termination uses `every`:

```typescript
// Faithfully abridged from packages/agent/src/agent-loop.ts at f07218c4.
const terminate =
  finalizedCalls.length > 0 &&
  finalizedCalls.every((entry) => entry.result.terminate === true);
```

A mixed batch continues. A blocked `beforeToolCall` result participates only if it sets both `block: true` and `terminate: true`. `afterToolCall` can add or remove the executed result’s termination hint.

Parallel mode deliberately separates preparation from execution. Pi prepares calls in assistant source order and records immediate failures before it launches the allowed calls concurrently. `tool_execution_end` can therefore reflect real completion order, while Tool result messages wait until all launched work settles and then return to source order. The model sees a deterministic transcript even when the UI shows one Tool finishing before another.

The `terminate` flag is runtime-only. `createToolResultMessage()` copies content, details, usage, added Tool names, error state, and identity fields, but not `terminate`. The next provider request never receives a nonstandard termination field in its Tool result. Agent Core consumes the hint while deciding whether automatic continuation is needed.

### 4.7 `turn_end`, hooks, events, and steering

The post-Turn order is fixed:

```text
save { message, toolResults, context, newMessages }
  -> finishTurn(completed-Turn snapshot)
  -> turn_end
  -> if action=end: agent_end
  -> otherwise: getSteeringMessages()
  -> if the inner loop continues: prepareNextTurn(saved snapshot)
  -> apply returned context/model/thinkingLevel
  -> if the post-Turn poll was empty: getSteeringMessages() again
  -> turn_start
```

`prepareNextTurn` does not itself force another Turn. It runs at the start of an iteration already warranted by Tool continuation or pending messages. Coding Agent installs `prepareNextTurnWithContext` to refresh its system prompt, Tool registry, selected model, and thinking level from live session state.

The event path for a Tool Turn is:

| Order | Event                                                                   |
| ----: | ----------------------------------------------------------------------- |
|     1 | `turn_start`                                                            |
|     2 | assistant `message_start`, zero or more `message_update`, `message_end` |
|     3 | `tool_execution_start`, optional updates, `tool_execution_end`          |
|     4 | Tool result `message_start` and `message_end`                           |
|     5 | `turn_end`                                                              |

`Agent.processEvents()` reduces state before invoking listeners. Listeners are awaited in subscription order, so assistant `message_end` is a barrier: `beforeToolCall` sees `Agent.state.messages` already containing the assistant request. Raw `agentLoop()` streams preserve event order but do not turn asynchronous consumer work into a producer barrier.

Settlement extends past event emission. `agent_end` guarantees that the loop will produce no later events, but `Agent.state.isStreaming` stays true while awaited `agent_end` listeners run. Only `finishRun()` clears streaming state and pending Tool IDs, resolves `waitForIdle()`, and removes the active run. This lets a subscriber flush a session or telemetry buffer before `await agent.prompt()` returns.

### 4.8 Back to the top of the loop

```typescript
// Faithfully abridged from packages/agent/src/agent-loop.ts at f07218c4.
while (hasMoreToolCalls || pendingMessages.length > 0) {
  // one assistant response and its Tool batch
}
```

Automatic continuation comes from a non-terminating Tool batch. Steering continuation comes from the post-Turn poll. An explicit `{ action: "continue" }` is consumed by any natural next request, or creates one context-only request when none exists. If Tool continuation already warrants another iteration and the first steering poll was empty, preparation gets one more steering poll before `turn_start`. `{ action: "end" }` exits before these queue decisions.

### 4.9 The follow-up outer loop

At the stable boundary, Agent Core polls only the follow-up queue:

```typescript
// Faithfully abridged from packages/agent/src/agent-loop.ts at f07218c4.
const followUpMessages = (await config.getFollowUpMessages?.()) || [];
if (followUpMessages.length > 0) {
  explicitContinuation = false;
  pendingMessages = followUpMessages;
  continue;
}
if (explicitContinuation) {
  explicitContinuation = false;
  continue;
}
break;
```

The outer `continue` returns to the inner loop, where follow-up messages receive normal message events before the next assistant call. They remain part of the same `agent_start`/`agent_end` run. A hard `error`/`aborted` path or `{ action: "end" }` decision returns before this poll.

`Agent.continue()` is a separate public action after a run has settled. With a user or Tool-result tail, it starts a new run from existing transcript state. With an assistant tail, it can consume already queued steering or follow-up messages; without either queue it rejects. Every accepted path emits a new `agent_start`. It should not be confused with the outer loop extending the current run.

### 4.10 Steering versus follow-up

| Dimension                         | Steering                                                   | Follow-up                                                        |
| --------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------- |
| Enqueue API                       | `agent.steer(message)`                                     | `agent.followUp(message)`                                        |
| Poll point                        | Before the first inner iteration; after each completed Turn; again after preparation when that poll was empty and the loop continues | Only after the inner loop would stop                             |
| Effect                            | Influences the next available Turn                         | Starts another Turn after current work reaches a stable boundary |
| Does it interrupt a running Tool? | No                                                         | No                                                               |
| Queue modes                       | `one-at-a-time` or `all`                                   | `one-at-a-time` or `all`                                         |
| Hard error / `finishTurn` end     | Not polled                                                 | Not polled                                                       |

Coding Agent maps input entered while streaming to one of these queues and exposes their modes in settings. Steering is appropriate for “use the fixture instead.” Follow-up is appropriate for “after that, summarize the diff.”

## 5. Summary: three loop designs to carry forward

### 1. ReAct is the core rhythm

```text
Reason in AssistantMessage
  -> Act through ToolCall
  -> Observe through ToolResultMessage
  -> Reason again
```

One Turn contains one assistant response plus its Tool batch. One run can contain many Turns.

### 2. Termination is a state decision

`stopReason` describes provider completion, but control also depends on Tool blocks, truncated-call safety, batch-wide `terminate`, `finishTurn`, steering, follow-up, abort, errors, and deferred ownership. The runtime ends only at a defined boundary; it does not ask the model to certify task completeness.

### 3. Keep the kernel small and layer product policy

| Boundary    | Agent Core owns                                    | Coding Agent adds                                      |
| ----------- | -------------------------------------------------- | ------------------------------------------------------ |
| Model       | `StreamFn` contract and per-Turn call              | Models runtime settings, retries, headers, credentials |
| Messages    | transforms, conversion boundary, transcript events | coding-specific message conversion and persistence     |
| Tools       | validation, hooks, scheduling, results             | coding Tools, permission policy, Extension wrapping    |
| Interaction | steering/follow-up queues and lifecycle events     | terminal/RPC mapping, UI, session behavior             |

This separation lets a small domain Agent use `Agent` directly while the full coding assistant keeps richer policy in `AgentSession` and its Extensions.

## 6. Next stop

[Chapter 4](ch04-model-invocation.md) opens the `StreamFn` boundary: model collections, provider registration, request conversion, normalized streaming events, and error handling.

> Version boundary: this walkthrough follows Pi `0.87.1` at commit `f07218c4d4bbc12bef056a7058c3dd49dfe41abe` and Node.js `>=22.19.0`.
