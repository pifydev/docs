---
title: 'Chapter 4: Model invocation across providers'
description: How Pi registers providers, resolves models, converts requests, and normalizes streaming responses.
translation_key: ch04-model-invocation
language: en
chapter: 4
source_url: 'https://www.dgzhuya.com/modules/ch04-model-invocation'
official_refs:
  - 'https://github.com/badlogic/pi-mono/blob/main/packages/ai/README.md'
terms_used:
  - Model
  - Provider
  - Provider Adapter
  - Stream
status: reviewed
last_updated: '2026-08-24'
translator: Pify maintainers
reviewed_by: Pify maintainers
---
Pi AI presents one model interface while preserving the capabilities of different providers. The abstraction has four parts: a model collection, provider registrations, provider adapters, and a normalized event stream.

## 1. The current entry point

Applications create a `Models` collection and register only the providers they need. `builtinModels()` is the convenient option when bundle size is not a concern.

```typescript
import { builtinModels } from "@earendil-works/pi-ai/providers/all";

const models = builtinModels();
const model = models.getModel("anthropic", "claude-sonnet-4-5");
if (!model) throw new Error("Model not found");
```

`Models.getModel()` performs a synchronous lookup in the registered catalogs. The returned `Model` record contains the provider ID, model ID, API, capabilities, token limits, and pricing metadata used by the request layer.

## 2. A model call

`Models.streamSimple()` accepts a model and a provider-neutral `Context`:

```typescript
const stream = models.streamSimple(model, {
  systemPrompt: "Answer with verified facts only.",
  messages: [
    {
      role: "user",
      content: "Explain the difference between SSE and WebSocket transport.",
      timestamp: Date.now(),
    },
  ],
  tools: [],
});

for await (const event of stream) {
  if (event.type === "text_delta") {
    process.stdout.write(event.delta);
  }
}

const response = await stream.result();
```

The stream is both an async iterable and a result handle. Iteration exposes incremental events; `result()` returns the completed `AssistantMessage`.

## 3. Dispatch by model ownership

The `Models` collection records which provider owns each model. A call follows this path:

```text
Model
  -> owning provider registration
  -> provider stream implementation
  -> API adapter
  -> HTTP or WebSocket transport
  -> normalized AssistantMessageEventStream
```

The application does not switch on provider names. Dispatch uses the model record and the registrations already installed in the collection.

## 4. Provider adapters

A provider adapter converts two directions:

1. Pi `Context`, `Message`, `Tool`, and options into the provider-specific request body.
2. Provider response frames into Pi events and a final `AssistantMessage`.

Provider-specific data stays inside this boundary. The public stream uses stable event names such as `start`, `text_start`, `text_delta`, `toolcall_start`, `toolcall_delta`, `toolcall_end`, `done`, and `error`.

Opaque fields required for multi-turn continuity, such as thinking signatures or provider response IDs, are preserved on Pi message types rather than exposed as raw response payloads.

## 5. `stream()` and `streamSimple()`

Use `streamSimple()` when the shared options are sufficient. It accepts normalized reasoning levels and returns the same event model across providers.

Use `stream()` when code needs a provider API's full option type. Narrow the model by API before passing provider-specific options so TypeScript can check the request.

The old global `getModel()` and `streamSimple()` functions remain on `@earendil-works/pi-ai/compat`. New code should prefer a `Models` instance because registration and ownership are explicit.

## 6. Authentication and request options

Provider factories resolve their documented environment variables by default. A call may also supply shared request options such as:

- `signal` for cancellation;
- `apiKey` for an explicit credential;
- `headers` for supported custom headers;
- `timeoutMs`, `maxRetries`, and `maxRetryDelayMs`;
- `sessionId` for provider caching or request affinity;
- `onPayload` and `onResponse` hooks for controlled inspection.

Do not log credentials or unredacted provider payloads from these hooks.

## 7. Errors stay in the stream contract

Expected provider failures produce an `error` event and a final assistant message with `stopReason: "error"`. Cancellation produces `stopReason: "aborted"`. Consumers can therefore persist a complete outcome without catching a different exception shape for every provider.

Configuration errors that occur before a request can start, such as an unknown model or missing provider registration, should be handled at lookup or setup time.

## 8. Registering a custom provider

A custom provider must supply a stable provider ID, a model catalog or discovery function, authentication behavior, and stream implementations for its supported API. If the service is OpenAI-compatible, start from the documented custom-provider helpers rather than copying a built-in adapter.

Keep custom code at the provider boundary:

- translate the request once;
- emit Pi event types in order;
- preserve `ToolCall.id` and tool arguments;
- report usage and stop reasons when the service supplies them;
- map provider failures to the normalized error result.

See [Integrate a model provider](how-to/plug-new-model.md) for a task-oriented procedure.

## 9. Design rules

The model layer remains portable when callers follow three rules:

1. Resolve models from the same `Models` collection used to stream them.
2. Keep provider-specific options behind an API-narrowed boundary.
3. Store normalized Pi messages, not raw provider responses, in application state.

[Chapter 5](ch05-tool-system.md) follows `ToolCall` from the model response through validation and execution.
