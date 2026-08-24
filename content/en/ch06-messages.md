---
title: 'Chapter 6: Messages across the model and agent layers'
description: Pi message roles, content blocks, custom agent messages, conversion, and persistence rules.
translation_key: ch06-messages
language: en
chapter: 6
source_url: 'https://www.dgzhuya.com/modules/ch06-messages'
official_refs:
  - 'https://github.com/badlogic/pi-mono/blob/main/packages/ai/src/types.ts'
  - 'https://github.com/badlogic/pi-mono/blob/main/packages/agent/README.md#agentmessage-vs-llm-message'
terms_used:
  - Message
  - AgentMessage
  - ToolCall
  - ToolResultMessage
status: reviewed
last_updated: '2026-08-24'
translator: Pify maintainers
reviewed_by: Pify maintainers
---
Pi uses one message model for provider-neutral LLM requests and a wider message model inside the agent runtime. The conversion boundary lets applications keep UI or domain events in agent state without sending unsupported roles to a provider.

## 1. Two message layers

```text
AgentMessage[]
  -> transformContext()
  -> AgentMessage[]
  -> convertToLlm()
  -> Message[]
  -> provider adapter
```

`Message` belongs to `@earendil-works/pi-ai`. It is the portable transcript that provider adapters understand.

`AgentMessage` belongs to `@earendil-works/pi-agent-core`. It includes Pi AI messages and can be extended with application-specific roles.

## 2. Pi AI message roles

The model layer defines three roles:

```typescript
type Message = UserMessage | AssistantMessage | ToolResultMessage;
```

### 2.1 `UserMessage`

```typescript
interface UserMessage {
  role: "user";
  content: string | (TextContent | ImageContent)[];
  timestamp: number;
}
```

Text may use the short string form. Multimodal input uses an array of typed content blocks.

### 2.2 `AssistantMessage`

An assistant message contains `text`, `thinking`, and `toolCall` blocks plus provider, model, usage, timestamp, and stop metadata. `stopReason` is one of `pending`, `stop`, `length`, `toolUse`, `error`, `aborted`, or `deferred`.

Fields such as `responseId`, `thinkingSignature`, and `rawStopReason` preserve information required for debugging or multi-turn continuity without exposing a raw provider response as application state.

### 2.3 `ToolResultMessage`

```typescript
interface ToolResultMessage<TDetails = unknown> {
  role: "toolResult";
  toolCallId: string;
  toolName: string;
  content: (TextContent | ImageContent)[];
  details?: TDetails;
  isError: boolean;
  timestamp: number;
}
```

`toolCallId` must match the originating `ToolCall.id`. Provider adapters depend on that link when constructing the next request.

## 3. Content blocks

The discriminated `type` field selects a content-block shape:

| Type | Main payload | Used in |
| --- | --- | --- |
| `text` | `text` | User, assistant, Tool result |
| `image` | base64 `data`, `mimeType` | User, Tool result |
| `thinking` | `thinking`, optional signature | Assistant |
| `toolCall` | `id`, `name`, `arguments` | Assistant |

Keep content in declaration order. Reordering thinking, text, and tool calls can change provider replay behavior and the meaning shown to users.

## 4. Custom agent messages

Applications may extend `AgentMessage` through declaration merging:

```typescript
declare module "@earendil-works/pi-agent-core" {
  interface CustomAgentMessages {
    notification: {
      role: "notification";
      text: string;
      timestamp: number;
    };
  }
}
```

The custom role can now live in agent state and drive a UI. A provider still does not understand it, so `convertToLlm` must filter or convert it.

## 5. Transform and convert

The two hooks have distinct jobs:

### 5.1 `transformContext`

This hook returns `AgentMessage[]`. Use it to compact history, inject retrieved context, or remove messages that should not participate in the next call. It may remain asynchronous.

### 5.2 `convertToLlm`

This hook returns Pi AI `Message[]`. It is the final type boundary before model transport:

```typescript
const agent = new Agent({
  streamFn: models.streamSimple.bind(models),
  convertToLlm: (messages) =>
    messages.flatMap((message) =>
      message.role === "notification" ? [] : [message],
    ),
});
```

Do not leave a custom role in the returned array and rely on a provider adapter to ignore it. Each adapter should receive only the shared model-layer contract.

## 6. Provider conversion

Provider adapters map normalized messages to each wire format. Differences include:

- how system instructions are represented;
- whether Tool results use a dedicated role or content block;
- how reasoning signatures and response IDs are replayed;
- how images and cache-control metadata are encoded;
- which invalid or empty blocks must be removed.

This conversion belongs in Pi AI. Agent code should not branch on Anthropic, OpenAI, or Google message shapes.

## 7. Identity, time, and opaque metadata

Three rules protect transcript integrity:

1. Preserve `ToolCall.id` through execution and into `toolCallId`.
2. Preserve timestamps as Unix milliseconds when copying or creating messages.
3. Treat provider signatures and response IDs as opaque; store and replay them without parsing unless the owning adapter documents a format.

Do not translate role names, content `type` values, stop reasons, provider IDs, model IDs, or JSON keys.

## 8. Persistence

Persist complete messages at stable boundaries. A partial streaming assistant message is useful for UI rendering but should not replace the last settled transcript entry.

When a run fails, persist the normalized assistant outcome when the runtime produces one. `stopReason`, `errorMessage`, diagnostics, and usage explain what happened without requiring raw provider logs.

Custom application messages need an explicit serialization and migration policy. Declaration merging adds TypeScript support; it does not automatically make a custom role durable across versions.

## 9. Validation checklist

Before sending or storing a transcript, verify:

- every message has a valid role and timestamp;
- each content block matches its discriminant;
- every Tool result references an existing Tool call;
- custom agent roles are removed or converted before the provider boundary;
- secret values and unnecessary raw payloads are absent;
- message order has not changed.

[Chapter 7](ch07-event-driven.md) explains how the runtime reports message and Tool state changes without coupling the loop to a UI.
