---
title: "Chapter 6: Messages across the model, Agent, and session boundaries"
description: How Pi represents model messages, extends AgentMessage, projects session entries, and converts context before each provider call.
translation_key: ch06-messages
language: en
chapter: 6
source_url: "https://www.dgzhuya.com/modules/ch06-messages"
official_refs:
  - "https://github.com/earendil-works/pi/blob/4e58f324fae8ebfa98a3d45181fb248072a2afac/packages/ai/src/types.ts"
  - "https://github.com/earendil-works/pi/blob/4e58f324fae8ebfa98a3d45181fb248072a2afac/packages/agent/src/types.ts"
  - "https://github.com/earendil-works/pi/blob/4e58f324fae8ebfa98a3d45181fb248072a2afac/packages/agent/src/agent-loop.ts"
  - "https://github.com/earendil-works/pi/blob/4e58f324fae8ebfa98a3d45181fb248072a2afac/packages/coding-agent/src/core/messages.ts"
  - "https://github.com/earendil-works/pi/blob/4e58f324fae8ebfa98a3d45181fb248072a2afac/packages/coding-agent/src/core/session-manager.ts"
terms_used:
  - Message
  - AgentMessage
  - SessionEntry
  - ToolCall
  - ToolResultMessage
status: reviewed
last_updated: "2026-08-25"
translator: Pify maintainers
reviewed_by: Pify maintainers
---

Chapter 5 ended with a `ToolResultMessage`: the model requested a Tool, Agent core validated and executed it, and the result re-entered the conversation. That explanation used the word _message_ at several different boundaries. A provider request, the Agent's live transcript, the Coding Agent's terminal view, and a resumed JSONL session do not all consume the same representation.

This chapter follows one Bash command across those boundaries. The route exposes a reusable design: keep the richest useful source representation in the application, then derive the narrower model representation immediately before a call. Pi `0.84.3` implements that design with `Message`, extensible `AgentMessage`, Coding Agent `SessionEntry` records, `transformContext`, and `convertToLlm`.

## 1. Opening: follow one Bash message

Suppose a user enters `!ls -la` in the Coding Agent terminal. The command does not pass through the model's Tool protocol. Coding Agent executes it as a product action and creates a structured `BashExecutionMessage` in `packages/coding-agent/src/core/messages.ts`:

```typescript
interface BashExecutionMessage {
  role: "bashExecution";
  command: string;
  output: string;
  exitCode: number | undefined;
  cancelled: boolean;
  truncated: boolean;
  fullOutputPath?: string;
  timestamp: number;
  excludeFromContext?: boolean;
}
```

The TUI can render `command`, `output`, cancellation, truncation, and exit status separately. The session layer can persist those fields and restore the same structured message after restart. A model provider cannot accept the custom `"bashExecution"` role, however. Before the next call, Coding Agent either converts this record to a `user` message or filters it when `excludeFromContext` is true.

The conversion is a projection. The structured object remains in Agent state and, when persistence is enabled, in a session message entry. Only the per-call model context receives the flattened copy. Following that copy requires three boundaries:

```text
Coding Agent session entries
  -> reconstructed AgentMessage[]
  -> transformContext()          // AgentMessage[] -> AgentMessage[]
  -> convertToLlm()              // AgentMessage[] -> Message[]
  -> Pi AI provider conversion   // Message[] -> provider wire payload
```

## 2. Layer one: provider-facing `Message`

`@earendil-works/pi-ai` owns the normalized model-layer contract. Its `Message` union has three roles:

```typescript
export type Message = UserMessage | AssistantMessage | ToolResultMessage;
```

“Provider-facing” does not mean “identical to an Anthropic, OpenAI, or Google request object.” It means every Pi AI API implementation accepts the same `Context.messages: Message[]`. The selected API implementation then serializes that array into its provider's wire format, including provider-specific rules for Tool results, reasoning replay, images, empty blocks, and role ordering.

### The exact message and content shapes

The following complete interface from `packages/ai/src/types.ts` at pinned commit `4e58f324` shows the user-side shape:

```typescript
export interface UserMessage {
  role: "user";
  content: string | (TextContent | ImageContent)[];
  timestamp: number;
}
```

A string is the short text form. An array can interleave `TextContent` and `ImageContent`. `timestamp` is a Unix timestamp in milliseconds; it is application metadata rather than a promise that every remote API transmits time.

Assistant content uses three block types. This source-faithful excerpt is complete except for comments:

```typescript
export interface TextContent {
  type: "text";
  text: string;
  textSignature?: string;
}

export interface ThinkingContent {
  type: "thinking";
  thinking: string;
  thinkingSignature?: string;
  redacted?: boolean;
}

export interface ToolCall {
  type: "toolCall";
  id: string;
  name: string;
  arguments: Record<string, any>;
  thoughtSignature?: string;
  namespace?: string;
}
```

The exact discriminants are `"text"`, `"thinking"`, `"image"`, and `"toolCall"`; there is no `"tool_use"`, `"reasoning"`, or `"tool_call"` block in the shared Pi type. Their allowed positions also differ:

| Content type                          | Main fields                                                 | Allowed shared message content |
| ------------------------------------- | ----------------------------------------------------------- | ------------------------------ |
| `TextContent`, `type: "text"`         | `text`, optional `textSignature`                            | User, assistant, Tool result   |
| `ThinkingContent`, `type: "thinking"` | `thinking`, optional `thinkingSignature`, `redacted`        | Assistant only                 |
| `ImageContent`, `type: "image"`       | base64 `data`, `mimeType`                                   | User and Tool result           |
| `ToolCall`, `type: "toolCall"`        | `id`, `name`, `arguments`, optional signature and namespace | Assistant only                 |

`AssistantMessage` carries both the ordered content and the normalized outcome of the provider turn. The following source-faithful abridgement from the same file omits comments but no fields:

```typescript
export interface AssistantMessage {
  role: "assistant";
  content: (TextContent | ThinkingContent | ToolCall)[];
  api: Api;
  provider: ProviderId;
  model: string;
  responseModel?: string;
  responseId?: string;
  diagnostics?: AssistantMessageDiagnostic[];
  usage: Usage;
  stopReason: StopReason;
  deferred?: DeferredHandle;
  errorMessage?: string;
  rawStopReason?: string;
  endTurn?: boolean;
  timestamp: number;
}
```

`stopReason` is exactly `"pending" | "stop" | "length" | "toolUse" | "error" | "aborted" | "deferred"`. A streamed partial message begins with `"pending"`; the settled message replaces it in Agent state. Provider/runtime failures returned through the stream protocol end as `"error"` or `"aborted"` with `errorMessage`. A deferred response also carries a `DeferredHandle` when the provider supports later completion.

Opaque continuity values need literal preservation. `textSignature`, `thinkingSignature`, `thoughtSignature`, and `responseId` may encode provider state that a later turn must replay. Application code should not parse or translate them unless the owning Pi AI implementation documents that representation. Content order matters for the same reason: moving a Tool call ahead of its reasoning or text may change both provider replay and what the UI shows.

The Tool result closes the identity edge created by `ToolCall.id`. This is the complete current interface with comments removed:

```typescript
export interface ToolResultMessage<TDetails = any> {
  role: "toolResult";
  toolCallId: string;
  toolName: string;
  content: (TextContent | ImageContent)[];
  details?: TDetails;
  usage?: Usage;
  addedToolNames?: string[];
  isError: boolean;
  timestamp: number;
}
```

`toolCallId` must match the originating `ToolCall.id`. `details` remains available to the runtime and UI but provider encoders build the remote Tool result from the content and linkage fields. `usage` can account for work done by the Tool itself. `addedToolNames` marks Tools that became available at this transcript point; providers with native deferred Tool loading consume it, while other providers ignore it.

### A complete Tool exchange

The three roles form a causal chain. This copyable array uses every required field rather than replacing provider metadata with ellipses:

```typescript
import type { Message } from "@earendil-works/pi-ai";

const zeroUsage = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

export const exchange: Message[] = [
  { role: "user", content: "Read auth.ts", timestamp: 1_748_568_000_000 },
  {
    role: "assistant",
    content: [
      { type: "text", text: "I will inspect that file." },
      {
        type: "toolCall",
        id: "call_read_001",
        name: "read",
        arguments: { path: "auth.ts" },
      },
    ],
    api: "anthropic-messages",
    provider: "anthropic",
    model: "claude-sonnet-4-6",
    usage: zeroUsage,
    stopReason: "toolUse",
    timestamp: 1_748_568_000_100,
  },
  {
    role: "toolResult",
    toolCallId: "call_read_001",
    toolName: "read",
    content: [{ type: "text", text: "export function authorize() {}" }],
    isError: false,
    timestamp: 1_748_568_000_200,
  },
];
```

The assistant may place text, thinking, and several Tool calls in one ordered content array. Agent core may execute a Tool batch in parallel, but final `toolResult` messages remain in the assistant's source order. That stable ordering preserves the call/result pairs even when completion events arrive in a different order.

## 3. The Agent needs richer messages

An Agent product has readers beyond the provider. A terminal wants command, output, status, and truncation fields. A context compactor needs a structured summary record. A branch operation needs to remember where it came from. An extension may need data that persists but never enters a prompt.

Flattening all of that into `UserMessage.content` at creation time would make the model call easy and every later consumer poorer. A resumed UI could not recover the original exit code or decide how to render a summary. Keeping only custom objects would fail in the other direction because Pi AI accepts only the three shared roles.

Pi therefore keeps richer runtime messages and projects them late. In Coding Agent `0.84.3`, the four application roles declared in `packages/coding-agent/src/core/messages.ts` are:

```text
AgentMessage
├─ Message from @earendil-works/pi-ai
│  ├─ user
│  ├─ assistant
│  └─ toolResult
└─ Coding Agent additions
   ├─ bashExecution
   ├─ custom
   ├─ branchSummary
   └─ compactionSummary
```

Those four roles describe the current Coding Agent, not a permanent upper bound on `AgentMessage`. Another application can add different roles. Even Coding Agent has session-only entry types that are not messages at all. “Seven message types” is therefore a useful snapshot of this package augmentation, not the definition of the Agent abstraction.

Custom roles provide three independent capabilities. First, a UI can dispatch on `role` and render structured fields. Second, a product can define an explicit serialization and migration path. Third, `convertToLlm` can translate or omit each role without changing the stored object. Declaration merging supplies compile-time membership only; it does not implement any of those runtime policies.

## 4. Layer two: `AgentMessage` and its open extension slot

`@earendil-works/pi-agent-core` owns the live transcript type. Its state exposes `messages: AgentMessage[]`, and prompts, steering messages, follow-up messages, loop results, and message events use that union.

### The `AgentMessage` union type

The definition in `packages/agent/src/types.ts` is one line:

```typescript
export type AgentMessage =
  Message | CustomAgentMessages[keyof CustomAgentMessages];
```

The indexed access turns every property value registered on `CustomAgentMessages` into a union member. Standard messages pass through because `Message` is already one side of the union. Custom messages need a unique discriminant, normally `role`, so transforms, converters, event subscribers, and renderers can narrow them safely.

The core package depends on Pi AI, but it does not depend on Coding Agent or any consumer application. That dependency direction matters: a generic Agent remains usable without terminal commands, compaction cards, branch summaries, or a session manager.

### `CustomAgentMessages` is empty by default

The extension point itself contains no built-in roles:

```typescript
export interface CustomAgentMessages {
  // Empty by default - apps extend via declaration merging
}
```

An empty interface lets a consumer augment the package without editing it. It also means that merely importing Agent core does not add Coding Agent's four roles. Coding Agent's `core/messages.ts` performs that augmentation as part of its application implementation.

This mechanism has a deliberate limit. TypeScript declaration merging disappears at runtime. It neither validates deserialized JSON nor registers a converter, renderer, or persistence adapter. A custom role is complete only when those runtime boundaries have explicit behavior.

### Declaration merging adds a type-safe application role

This copyable example registers a UI notification that should remain outside model context:

```typescript
import type { AgentMessage } from "@earendil-works/pi-agent-core";

export interface NotificationMessage {
  role: "notification";
  text: string;
  level: "info" | "warning";
  timestamp: number;
}

declare module "@earendil-works/pi-agent-core" {
  interface CustomAgentMessages {
    notification: NotificationMessage;
  }
}

export const reconnecting: AgentMessage = {
  role: "notification",
  text: "Reconnecting to the provider",
  level: "warning",
  timestamp: Date.now(),
};
```

Inheritance would couple an application class hierarchy to a union of plain data objects. Passing a message generic through every Agent API would widen many signatures that otherwise need no application knowledge. Declaration merging keeps the dependency one-way and retains exhaustive narrowing inside the application compilation.

Package augmentation is compilation-wide. Two libraries that register the same property key with incompatible types will conflict, and a package that exposes custom messages should choose stable, namespaced keys when collisions are plausible. The runtime `role` values should also remain stable across persisted versions.

## 5. Conversion boundary: `convertToLlm`

Agent core never teaches provider adapters about arbitrary application roles. Immediately before each model call, it asks the application to return Pi AI `Message[]`. This is where a custom message becomes model-readable text or disappears from that call.

### When conversion runs and how failures cross the boundary

`AgentLoopConfig.convertToLlm` is required and accepts a synchronous or asynchronous result. `AgentOptions.convertToLlm` is optional because the `Agent` class supplies a default converter that keeps only `user`, `assistant`, and `toolResult`. That default is safe for UI-only roles, but it also means a custom role is invisible to the model unless the application provides a conversion.

The low-level contract says `convertToLlm` must not throw or reject. It should return a safe fallback, normally the standard messages it can prove valid. Throwing interrupts the low-level loop before a normal provider event sequence can be produced.

The same distinction applies one level up. The `Agent` class catches a run failure and emits a normalized assistant failure with `stopReason: "error"` or `"aborted"`, followed by `message_start`, `message_end`, `turn_end`, and `agent_end`. Direct callers of the low-level `runAgentLoop()` receive the rejection. Provider request/model/runtime failures follow a different contract: a `StreamFunction` should encode them in its returned event stream and final `AssistantMessage`, not throw after invocation.

### Coding Agent conversion rules

Coding Agent exports `convertToLlm` from `@earendil-works/pi-coding-agent`; the role definitions and formatting helpers live in internal `core/messages.ts`. The package's SDK wraps this converter to replace images when the `blockImages` setting is enabled. Consumers should import the root export rather than deep-importing internal message interfaces.

At the pinned revision, the base Coding Agent converter applies these rules:

| Input role                        | Model-context result                                                                               |
| --------------------------------- | -------------------------------------------------------------------------------------------------- |
| `user`, `assistant`, `toolResult` | Passed through as the same `Message` object                                                        |
| `bashExecution`                   | Omitted when `excludeFromContext`; otherwise one `UserMessage` containing formatted command output |
| `custom`                          | One `UserMessage`; string content becomes one `TextContent`, array content stays an array          |
| `branchSummary`                   | One `UserMessage` with `BRANCH_SUMMARY_PREFIX`, the summary, and closing `</summary>`              |
| `compactionSummary`               | One `UserMessage` with `COMPACTION_SUMMARY_PREFIX`, the summary, and closing `</summary>`          |

This source-faithful abridgement from `packages/coding-agent/src/core/messages.ts` preserves all documented role branches; it omits only the defensive `default` exhaustiveness check and shortens object formatting:

```typescript
export function convertToLlm(messages: AgentMessage[]): Message[] {
  return messages
    .map((m): Message | undefined => {
      switch (m.role) {
        case "bashExecution":
          if (m.excludeFromContext) return undefined;
          return {
            role: "user",
            content: [{ type: "text", text: bashExecutionToText(m) }],
            timestamp: m.timestamp,
          };
        case "custom":
          return {
            role: "user",
            content:
              typeof m.content === "string"
                ? [{ type: "text", text: m.content }]
                : m.content,
            timestamp: m.timestamp,
          };
        case "branchSummary":
          return {
            role: "user",
            content: [
              {
                type: "text",
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
                type: "text",
                text:
                  COMPACTION_SUMMARY_PREFIX +
                  m.summary +
                  COMPACTION_SUMMARY_SUFFIX,
              },
            ],
            timestamp: m.timestamp,
          };
        case "user":
        case "assistant":
        case "toolResult":
          return m;
      }
    })
    .filter((m) => m !== undefined);
}
```

The baseline rule “every custom message becomes User” describes this particular Coding Agent converter, not the Agent core contract. An application may filter a role, turn it into several shared messages, or merge it with nearby context. It must still return only `Message` members and preserve any ordering constraints the provider conversation needs.

### A Bash record before and after conversion

The application-side record keeps fields that the terminal and session can use:

```json
{
  "role": "bashExecution",
  "command": "ls -la",
  "output": "total 32\ndrwxr-xr-x 5 user staff 160 .",
  "exitCode": 0,
  "cancelled": false,
  "truncated": false,
  "timestamp": 1748568000000
}
```

The model-context projection is a standard user message:

````json
{
  "role": "user",
  "content": [
    {
      "type": "text",
      "text": "Ran `ls -la`\n```\ntotal 32\ndrwxr-xr-x 5 user staff 160 .\n```"
    }
  ],
  "timestamp": 1748568000000
}
````

`bashExecutionToText()` also writes `(command cancelled)` for cancellation, a nonzero exit-code sentence, and the full-output path when truncation recorded one. Those facts become prose in the model copy; they remain typed fields in the original message. Conversion does not mutate or replace that original object.

## 6. Two-stage processing: `transformContext` before `convertToLlm`

The two Agent hooks solve different problems. `transformContext` works within the richer type and returns `AgentMessage[]`; `convertToLlm` crosses into the closed model-layer union and returns `Message[]`.

The sequencing comes directly from `streamAssistantResponse()` in `packages/agent/src/agent-loop.ts`. This is a source-faithful abridgement at the pin:

```typescript
let messages = context.messages;
if (config.transformContext) {
  messages = await config.transformContext(messages, signal);
}

const llmMessages = await config.convertToLlm(messages);

const llmContext: Context = {
  systemPrompt: context.systemPrompt,
  messages: llmMessages,
  tools: context.tools,
};

const response = await streamFunction(config.model, llmContext, {
  ...config,
  apiKey: resolvedApiKey,
  signal,
});
```

`transformContext` is optional and its public signature returns `Promise<AgentMessage[]>`; the loop always awaits it. It can prune history, inject retrieved context, or apply an application context policy while custom fields still exist. Its contract says to return the original messages or another safe fallback rather than reject.

Coding Agent uses this hook for Extension `context` handlers. `ExtensionRunner.emitContext()` starts from a structured clone, awaits handlers in registration order, feeds each returned `messages` array to the next handler, and catches an individual extension error so the remaining pipeline can continue. Coding Agent compaction itself belongs to session reconstruction: a `CompactionEntry` determines which historical entries become the next runtime transcript before this hook runs.

`convertToLlm` can also be async, and the loop awaits it after transformation. At that point the application decides model visibility and performs lossy role conversion. Provider selection still happens later. Switching from Anthropic to OpenAI should not require changing an application role converter because Pi AI owns `Message[]`-to-wire conversion.

Keeping the stages separate prevents policy from leaking across packages. Context selection can change without rewriting custom-role formatting. Application roles can change without moving compaction or retrieval into provider code. Provider adapters can change without learning about terminal-only roles.

## 7. Visibility, filtering, and session boundaries

Visibility is not one boolean shared by the model, TUI, and storage. Each boundary makes its own decision. A role can be persisted but absent from runtime context, present in runtime context but filtered from the model, or sent to the model while hidden in the TUI.

### `excludeFromContext` filters Bash output at the last model boundary

The interactive terminal maps a single `!command` to a normal Bash record and `!!command` to a record with `excludeFromContext: true`. The converter performs the filter:

```typescript
case "bashExecution":
  if (m.excludeFromContext) {
    return undefined;
  }
  return {
    role: "user",
    content: [{ type: "text", text: bashExecutionToText(m) }],
    timestamp: m.timestamp,
  };
```

Once inserted, the message stays in `agent.state.messages`, renders as a Bash execution, and is stored by `SessionManager.appendMessage()` when the session persists. Coding Agent inserts and persists it immediately when no Agent run is active. If the command finishes while the Agent is streaming, `recordBashResult()` instead queues it in `_pendingBashMessages`. The `agent_end` listener does not flush that queue. `_runAgentPrompt()` first awaits `agent.prompt()` and any post-run continuations; only its `finally` block, after the final Agent run has settled and emitted `agent_end`, calls `_flushPendingBashMessages()` to insert and persist the queued records. This boundary prevents a product action from splitting the provider-required assistant Tool-call/Tool-result ordering.

Filtering model context is not a secrecy boundary by itself. The output can still appear on screen and in the session JSONL file, and extensions can observe product events. Do not put a secret into a message merely because `convertToLlm` omits it.

### Model, TUI, and storage visibility are separate policies

The current Coding Agent behavior makes the separation concrete:

| Record                                          | Agent/runtime context                   | Model after conversion | TUI conversation                   | Persisted session                                    |
| ----------------------------------------------- | --------------------------------------- | ---------------------- | ---------------------------------- | ---------------------------------------------------- |
| Standard `Message`                              | Yes                                     | Yes                    | Yes                                | `SessionMessageEntry` after settled message events   |
| Normal `BashExecutionMessage`                   | Yes; after the post-run flush if queued | As one `UserMessage`   | Yes                                | `SessionMessageEntry` at the same insertion boundary |
| Bash with `excludeFromContext`                  | Yes; after the post-run flush if queued | No                     | Yes                                | `SessionMessageEntry` at the same insertion boundary |
| `CustomMessage`, `display: true`                | Yes                                     | As one `UserMessage`   | Yes, with custom rendering         | `CustomMessageEntry`                                 |
| `CustomMessage`, `display: false`               | Yes                                     | As one `UserMessage`   | Hidden                             | `CustomMessageEntry`                                 |
| Extension `CustomEntry` from `pi.appendEntry()` | No message projection                   | No                     | No default conversation message    | `CustomEntry` for extension state                    |
| Branch or compaction entry on the active path   | Reconstructed as a summary message      | As one `UserMessage`   | Product-specific summary rendering | `BranchSummaryEntry` or `CompactionEntry`            |

`display: false` does not mean “exclude from the model.” It hides a Coding Agent `CustomMessage` in the TUI while `buildSessionContext()` reconstructs it and `convertToLlm()` turns it into `user` content. Use `pi.appendEntry()` for extension state that must persist without entering model context, or define and filter an explicit custom `AgentMessage` in an application that owns its own runtime.

Session storage has a different schema from both message unions. `SessionManager` stores an append-only tree of `SessionEntry` objects in JSONL when persistence is enabled. Every entry has `id`, `parentId`, and an ISO timestamp. Message entries wrap an `AgentMessage`; compaction, branch summary, model change, thinking-level change, label, session info, custom state, and custom-message entries have dedicated shapes.

On resume, `buildSessionContext()` selects the active root-to-leaf path, applies the latest compaction boundary, reconstructs runtime messages, and separately restores the model and thinking level. This source-faithful abridgement from `packages/coding-agent/src/core/session-manager.ts` shows the message projection:

```typescript
export function sessionEntryToContextMessages(
  entry: SessionEntry,
): AgentMessage[] {
  if (entry.type === "message") return [entry.message];
  if (entry.type === "custom_message") {
    return [
      createCustomMessage(
        entry.customType,
        entry.content ?? [],
        entry.display,
        entry.details,
        entry.timestamp,
      ),
    ];
  }
  if (entry.type === "branch_summary" && entry.summary) {
    return [
      createBranchSummaryMessage(entry.summary, entry.fromId, entry.timestamp),
    ];
  }
  if (entry.type === "compaction") {
    return [
      createCompactionSummaryMessage(
        entry.summary,
        entry.tokensBefore,
        entry.timestamp,
      ),
    ];
  }
  return [];
}
```

The real function also normalizes missing `content` from old, forked, or hand-edited standard messages to an empty array. `SessionManager`, `buildSessionContext`, `buildContextEntries`, and `sessionEntryToContextMessages` are public root exports of `@earendil-works/pi-coding-agent`. The calls that persist `message_end`, defer Bash insertion, and assign reconstructed messages to Agent state are Coding Agent integration glue, not behavior supplied by declaration merging or Agent core.

Store settled messages, not partial stream snapshots. During streaming, `agent.state.streamingMessage` exposes the current partial assistant object for UI updates. Agent core replaces that partial with the final `AssistantMessage` before `message_end`; Coding Agent persists on `message_end`. The final message retains `stopReason`, `errorMessage`, usage, diagnostics, IDs, and signatures needed to explain and resume the turn.

## 8. Complete data flow: from user action to provider payload and back

The live path and the resume path meet at `AgentMessage[]`. Pseudocode: this diagram names current types and methods but omits event subscribers, retry policy, Tool batches, and provider-specific payload fields.

```text
LIVE INPUT
  user enters !ls -la
    -> Coding Agent executes Bash
    -> BashExecutionMessage
    -> if no Agent run is active:
         insert into agent.state.messages
         persist with SessionManager.appendMessage()
    -> if the Agent is streaming:
         queue in _pendingBashMessages
         -> final Agent run settles and emits agent_end
         -> _runAgentPrompt() finally calls _flushPendingBashMessages()
         -> insert into agent.state.messages and persist

RESUME INPUT
  JSONL SessionEntry tree
    -> active root-to-leaf path
    -> latest compaction boundary
    -> sessionEntryToContextMessages()
    -> agent.state.messages: AgentMessage[]

EACH MODEL CALL
  snapshot Agent context
    -> await transformContext(messages, signal)
       AgentMessage[] -> AgentMessage[]
    -> await convertToLlm(messages)
       BashExecutionMessage -> UserMessage, or filter
       branch/compaction/custom -> UserMessage
       standard Message -> pass through
    -> Context { systemPrompt, messages: Message[], tools }
    -> streamFunction(model, context, options)
    -> Pi AI API implementation converts Message[] to provider wire data
    -> provider stream becomes one settled AssistantMessage
    -> optional ToolCall batch becomes ordered ToolResultMessage[]
    -> message_end persistence
    -> next turn repeats conversion from the rich runtime transcript
```

Each arrow has one owner. Coding Agent owns terminal records, session entries, and its concrete converter. Agent core owns loop sequencing and the extensible runtime union. Pi AI owns normalized message/content types and provider serialization. Moving a responsibility across one of those package boundaries usually creates a dependency in the wrong direction.

The path also locates the error boundaries. Session parsing and reconstruction occur before the Agent run. Context and conversion hooks must return fallbacks instead of rejecting. The Agent class normalizes an unexpected run failure into an assistant outcome, while low-level callers receive the error. Once a provider stream exists, provider failures belong in its events and final assistant message. A persistence listener can then record the same settled outcome that the UI observed.

Before accepting a custom message path, test these invariants:

1. Every shared role and content block uses the exact discriminant and required fields.
2. Every Tool result preserves its call ID and follows the assistant request that created it.
3. Context transformation leaves a valid `AgentMessage[]`; conversion returns only `Message[]`.
4. Filtering does not reorder the remaining transcript into an invalid conversation.
5. UI visibility, model visibility, and storage policy are reviewed separately.
6. Persisted custom data has a version and migration policy; opaque provider fields survive unchanged.
7. Partial assistant state is rendered transiently and replaced by the settled message before persistence.

## 9. Summary and transfer lessons

### The stored source and model projection serve different readers

The baseline described “two readers”: the model and the functional layer. Pi `0.84.3` makes the storage boundary explicit enough to name three views:

| View                  | Primary reader                                 | Shape                       | May be lossy?                                                        |
| --------------------- | ---------------------------------------------- | --------------------------- | -------------------------------------------------------------------- |
| Session history       | resume, branching, compaction, extension state | `SessionEntry` tree         | No; retain the fields needed to reconstruct product state            |
| Live Agent transcript | loop, queues, events, UI                       | extensible `AgentMessage[]` | Derived from the selected session path, but still application-rich   |
| Model context         | Pi AI and selected provider                    | closed `Message[]`          | Yes; filter or flatten application roles immediately before the call |

The model projection is disposable. Recompute it for each call after context policy runs. Persisting that flattened array as the only source would discard branch structure, custom fields, display state, compaction metadata, and extension-only data. Sending raw session entries in the other direction would expose roles and fields that no provider contract accepts.

The union and declaration-merging pattern keeps the generic package open without making it depend on every application. The conversion function closes the boundary again. Session projection adds the temporal dimension: an application can reconstruct only the active branch and replace old history with a compaction summary while retaining the append-only record.

Chapter 5's `Tool -> AgentTool -> ToolDefinition` progression applies the same boundary rule to capabilities rather than messages. Pi AI owns the provider declaration, Agent core adds execution, and Coding Agent adds product context and rendering. In both systems, a lower package exposes a narrow contract and the application layer adds only the fields and behavior it owns.

### Apply the pattern to another protocol boundary

Start by listing the consumers and the fields each one needs. A provider may need role, ordered content, Tool identity, and replay signatures. A UI may need status, command metadata, partial updates, and display flags. Storage may need IDs, parent links, migration versions, and application details.

Keep the richest authoritative representation at the layer that owns it. Do not flatten fields early for protocol convenience. Derive a narrow protocol value through one named conversion and make loss visible in its return type. Pi's `AgentMessage[] -> Message[]` signature says more than a formatter returning `unknown`: custom roles cannot cross accidentally, and the output still receives compile-time checking.

Then give each extension point its runtime pair. A declaration-merged type needs a converter. A visible message needs a renderer. A durable message needs serialization, validation, and migration. A filtered message needs a threat review because model invisibility says nothing about logs, UI, events, or disk.

Finally, test ordering and failure behavior at the boundary. Async transforms must settle in the intended order. A safe fallback must preserve a valid transcript. Tool call/result identity must survive filtering. Provider-specific conversion should remain below the shared `Message` contract. These checks let the internal representation grow without weakening the external protocol.

## 10. Next stop

The first six chapters now connect the core route: model dispatch produces normalized assistant content, Agent core executes Tool calls, Tool results return to the transcript, and the message pipeline selects what the next provider request can see.

The same route emits `message_start`, `message_update`, `message_end`, Tool execution events, turn events, and Agent lifecycle events. Event subscribers render partial output and persist settled messages, and their settlement order affects when the runtime is idle. [Chapter 7](ch07-event-driven.md) follows that event path.

> Before moving on, trace one `ToolCall` through its ordered `ToolResultMessage`, then through session persistence, `transformContext`, and the next `convertToLlm` pass. If every boundary and owner is clear, the event sequence in Chapter 7 has a concrete data path to attach to.

Source review for this chapter is pinned to Pi `0.84.3` at commit `4e58f324fae8ebfa98a3d45181fb248072a2afac`. Primary paths are `packages/ai/src/types.ts`, `packages/ai/src/api/transform-messages.ts`, the provider API implementations under `packages/ai/src/api/`, `packages/agent/src/types.ts`, `packages/agent/src/agent-loop.ts`, `packages/agent/src/agent.ts`, `packages/coding-agent/src/core/messages.ts`, `packages/coding-agent/src/core/session-manager.ts`, `packages/coding-agent/src/core/sdk.ts`, `packages/coding-agent/src/core/agent-session.ts`, and `packages/coding-agent/src/core/extensions/runner.ts`.
