---
title: "Chapter 4: Model invocation: one line, many providers"
description: How Models routes a request through provider-owned auth, API adapters, and one normalized event protocol.
translation_key: ch04-model-invocation
language: en
chapter: 4
source_url: "https://www.dgzhuya.com/modules/ch04-model-invocation"
official_refs:
  - "https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/ai/README.md"
terms_used:
  - Model
  - Provider
  - Provider Adapter
  - Stream
status: reviewed
last_updated: "2026-08-24"
translator: Pify maintainers
reviewed_by: Pify maintainers
---

Chapter 3 followed the Agent Loop through model selection, streaming, Tool execution, and the decision to continue. Its model boundary can still be written as one call.

Pseudocode: `model`, `context`, and `options` are inputs owned by the caller.

```typescript
const stream = models.streamSimple(model, context, options);
```

That line crosses a substantial boundary. Pi AI must find the provider that owns the model, resolve its credentials, turn Pi messages and Tools into the provider's request format, consume the provider's streaming dialect, and return one stable event protocol. The implementation at the pinned Pi `0.84.2` revision divides that work among a `Models` collection, provider objects, and API implementations. The old global descriptor/translator registry is available only from the compatibility entry point and is covered later as migration context.

This chapter opens that boundary without replacing it with a short usage sample. It starts with the provider differences, follows the current dispatch path, then examines streaming, reasoning, caching, aborts, retries, and the work required to add a provider.

## 1. The problem: one conversation, different provider dialects

An Agent Loop works with Pi's `Context`, `Message`, and `Tool` types. Providers do not accept those types over the wire. Anthropic Messages, OpenAI Chat Completions or Responses, Google Generative AI, and Amazon Bedrock Converse describe equivalent turns with different roles, block names, fields, and continuity metadata.

Suppose a user asks the Agent to read `main.ts`. Pi can persist that user turn in its provider-neutral form:

```json
{
  "role": "user",
  "content": "Read main.ts and explain the exported functions.",
  "timestamp": 1748697600000
}
```

The following four payload fragments are pseudocode. They deliberately show only the message fragment that demonstrates the structural difference; they are not complete provider requests.

Anthropic represents text as typed content blocks:

```json
{
  "role": "user",
  "content": [
    {
      "type": "text",
      "text": "Read main.ts and explain the exported functions."
    }
  ]
}
```

OpenAI Chat Completions accepts a string for this plain user turn, while Tool results become separate `tool` messages in later turns:

```json
{
  "role": "user",
  "content": "Read main.ts and explain the exported functions."
}
```

Google places message content in `parts` inside a `contents` entry:

```json
{
  "role": "user",
  "parts": [
    {
      "text": "Read main.ts and explain the exported functions."
    }
  ]
}
```

Bedrock Converse uses content blocks without Anthropic's `type: "text"` discriminator:

```json
{
  "role": "user",
  "content": [
    {
      "text": "Read main.ts and explain the exported functions."
    }
  ]
}
```

These fragments look close because the turn contains only text. Tool calls, Tool results, images, thinking signatures, response IDs, system instructions, and cross-provider replay create more consequential differences. An adapter must preserve useful provider metadata while preventing a raw provider payload from becoming application state.

### Four dimensions vary together

Message conversion is one part of the boundary. Streaming, reasoning, and cache control also differ, and they interact within the same request.

| Dimension               | Shared Pi input or output                                                                                       | Provider-specific work                                                                                                                    |
| ----------------------- | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Message and Tool format | `Context`, `Message`, `Tool`, and the `text`, `thinking`, `toolCall`, and image blocks supported by those types | Roles, block names, JSON Schema placement, Tool-result grouping, opaque signatures, and response identifiers                              |
| Streaming               | `AssistantMessageEventStream` with 12 event types                                                               | Raw SSE parsing, SDK chunk iteration, WebSocket or Bedrock event consumption, partial JSON assembly, usage, and stop-reason mapping       |
| Reasoning               | `streamSimple(..., { reasoning })` and model capability metadata                                                | Anthropic adaptive effort or token budgets, OpenAI reasoning effort, Google thinking level or budget, and provider-specific output limits |
| Cache control           | `cacheRetention` set to `"none"`, `"short"`, or `"long"`, plus an optional `sessionId`                          | Anthropic content markers, Bedrock cache-point blocks, OpenAI request fields, or no explicit marker when a provider ignores the option    |

A model call cannot branch through all of these rules in Agent Loop code. Pi keeps the loop provider-neutral and assigns the differences to the model boundary.

## 2. Three boundaries, each with one responsibility

The historical implementation used a global API registry and described API files as translators. Pi `0.84.2` makes ownership explicit. Applications build a `Models` collection from provider factories. Each `Provider` owns a model catalog, authentication behavior, and stream dispatch. API implementations own the wire protocol and normalization. Pseudocode: this boundary map is architectural, not executable syntax.

```text
Agent Loop or application
  -> Models collection: locate model owner and apply auth
  -> Provider: own catalog and select the model's API implementation
  -> API implementation: convert request, consume response, emit Pi events
  -> AssistantMessageEventStream: normalized events and final AssistantMessage
```

The translation-company analogy still helps if its limits are clear. `Models` is the coordinator, the normalized event types are the delivery contract, and the API implementation handles a specific wire dialect. A provider also owns the catalog and credentials, and one provider may dispatch models to more than one API implementation.

### Boundary 1: the `Models` collection

`createModels()` returns an empty mutable collection. `models.setProvider(anthropicProvider())` adds one provider; `builtinModels()` from `@earendil-works/pi-ai/providers/all` adds every built-in provider and is intentionally the heavier entry point. Reads such as `getProviders()`, `getModels()`, and `getModel()` are synchronous against the last-known catalogs. Dynamic providers refresh through the explicit async `models.refresh()` operation.

Dispatch begins with `model.provider`, not `model.api`. The collection looks up that provider, resolves auth, applies an auth-derived `baseUrl` when present, merges request options, and calls the provider. The provider created by `createProvider()` then selects its single API implementation or a map entry keyed by `model.api`.

The following non-self-contained excerpt is from `packages/ai/src/models.ts` at `a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c`. It is the exact `ModelsImpl.streamSimple()` body and depends on private class methods and imported types from that file.

```typescript
streamSimple(model: Model<Api>, context: Context, options?: ModelsSimpleStreamOptions): AssistantMessageEventStream {
  return lazyStream(model, async () => {
    const provider = this.requireProvider(model);
    const { requestModel, requestOptions } = await this.applyAuth(model, options);
    return provider.streamSimple(requestModel, context, requestOptions as SimpleStreamOptions);
  });
}
```

`lazyStream()` explains an important surface detail: `Models.stream*()` returns an event stream synchronously even though provider lookup, auth, and lazy module loading may be asynchronous. A setup failure is converted into the same terminal error protocol as a failure after the HTTP request starts.

### Boundary 2: the event protocol

Every chat API implementation emits the same 12 `AssistantMessageEvent` variants. Pseudocode: this protocol sketch uses the exact event and terminal-reason names:

```text
start
text_start       -> text_delta       -> text_end
thinking_start   -> thinking_delta   -> thinking_end
toolcall_start   -> toolcall_delta   -> toolcall_end
done  (reason: stop | length | toolUse | deferred)
error (reason: error | aborted)
```

The three content families correspond to Pi's exact block discriminators: `text`, `thinking`, and `toolCall`. A `start` event carries the initial `partial` assistant message. Content events carry `contentIndex` and the current `partial`; delta events also carry the new string fragment. `toolcall_end` carries the completed `ToolCall`.

Terminal events differ on purpose. `done` carries `message`, and `error` carries `error`; neither terminal variant has `partial`. The old claim that every event carries `partial` is therefore unsafe for a discriminated-union consumer. `stream.result()` resolves to the terminal `AssistantMessage` in either case.

Providers may interleave updates from different blocks. A UI can see `text_delta`, then `toolcall_start`, then another `text_delta`. Consumers must use `contentIndex`, update the corresponding block from `event.partial`, and avoid assuming that each start/delta/end family is contiguous.

### Boundary 3: provider and API-adapter responsibilities

The provider and API implementation divide a model call into five stages. Pseudocode: this sequence summarizes the boundary hand-offs:

```text
1. Models resolves provider auth and request headers
2. Provider selects the API implementation for model.api
3. API implementation converts Context, messages, Tools, and options
4. Provider SDK, HTTP stream, WebSocket, or Bedrock command returns frames
5. API implementation updates AssistantMessage and emits done or error
```

Stages 3 and 5 contain most provider-specific logic. Request conversion normalizes unsupported or cross-provider content before producing the wire body. Response conversion builds Pi blocks, parses partial Tool arguments, records usage and diagnostics, maps raw stop reasons, and preserves opaque continuation data such as thinking signatures and response IDs on the normalized message types.

The Anthropic path exposes the bidirectional mapping. Pseudocode: this source-derived map uses current SSE and Pi event names while omitting intermediate state updates:

```text
message_start                                      -> start
content_block_start(type: text)                    -> text_start
content_block_delta(type: text_delta)              -> text_delta
content_block_start(type: thinking)                -> thinking_start
content_block_delta(type: thinking_delta)          -> thinking_delta
content_block_start(type: tool_use)                -> toolcall_start
content_block_delta(type: input_json_delta)        -> toolcall_delta
content_block_stop                                 -> matching *_end
message_delta(stop_reason: end_turn | tool_use)    -> done(stop | toolUse)
```

The mapping also sanitizes text, normalizes Tool-call IDs where an API requires it, and calculates cost from normalized usage. These are adapter duties; the Agent Loop should not reproduce them.

### The contracts an API implementation must satisfy

The following non-self-contained, source-faithful abridgement contains the exact stream members from `packages/ai/src/types.ts` at `a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c`. Imported types and the optional deferred methods are outside this excerpt.

```typescript
export interface ProviderStreams {
  stream(
    model: Model<Api>,
    context: Context,
    options?: StreamOptions,
  ): AssistantMessageEventStream;
  streamSimple(
    model: Model<Api>,
    context: Context,
    options?: SimpleStreamOptions,
  ): AssistantMessageEventStream;
}

export type StreamFunction<
  TApi extends Api = Api,
  TOptions extends StreamOptions = StreamOptions,
> = (
  model: Model<TApi>,
  context: Context,
  options?: TOptions,
) => AssistantMessageEventStream;
```

The contract has three consequences. An implementation accepts a `Model`, a provider-neutral `Context`, and its option type. Its successful return value is `AssistantMessageEventStream`, regardless of transport. Request, model, and runtime failures after that return belong in the stream as a terminal `error` event whose final message has `stopReason: "error"` or `"aborted"` and an `errorMessage`.

`Models.stream*()` also invokes the provider inside `lazyStream()` setup. That wrapper converts provider lookup, auth, lazy import, and synchronous provider-call failures into the outer stream. Direct imports from `@earendil-works/pi-ai/api/*` are lower-level: they bypass `Models` auth and some implementations synchronously reject missing request credentials before returning a stream. Applications that need the normalized setup-error contract should call through `Models`.

The protocol boundary lets Anthropic, OpenAI, Google, and Bedrock obey the same input/output and termination contract even though they share little conversion code.

## 3. From an ordinary call to a new provider

The public API supports two distinct tasks. Most applications assemble known provider factories and call an existing model. Provider integrations additionally define catalog, auth, and wire behavior.

### Scenario 1: call an existing model

This example is self-contained application code for `@earendil-works/pi-ai` `0.84.2`. It uses one tree-shakeable provider factory and only public exports.

```typescript
import { createModels, type Context } from "@earendil-works/pi-ai";
import { anthropicProvider } from "@earendil-works/pi-ai/providers/anthropic";

const models = createModels();
models.setProvider(anthropicProvider());

const model = models.getModel("anthropic", "claude-sonnet-4-5");
if (!model) throw new Error("Configured Anthropic model was not found");

const context: Context = {
  systemPrompt:
    "Answer from the supplied conversation and identify uncertainty.",
  messages: [
    {
      role: "user",
      content:
        "Explain why SSE consumers buffer incomplete JSON tool arguments.",
      timestamp: Date.now(),
    },
  ],
  tools: [],
};

const stream = models.streamSimple(model, context, {
  reasoning: "medium",
  cacheRetention: "short",
});

for await (const event of stream) {
  if (event.type === "text_delta") process.stdout.write(event.delta);
}

const response = await stream.result();
if (response.stopReason === "error" || response.stopReason === "aborted") {
  console.error(response.errorMessage);
}
```

Use `streamSimple()` when `SimpleStreamOptions` covers the request: provider-neutral reasoning, Tool choice, cache retention, sampling, timeout, retry, abort, headers, callbacks, and related shared settings. `completeSimple()` waits for the same final message without exposing incremental events.

Use `stream()` or `complete()` when an API-specific option is required. A dynamic `getModel()` result has type `Model<Api>`; narrow it with `hasApi(model, "anthropic-messages")` or another exact API ID before passing options such as Anthropic's `thinkingBudgetTokens`. This keeps provider-specific parameters at an explicit boundary while preserving type checking.

### Authentication and model configuration

Each provider factory declares how credentials resolve. Built-in Anthropic checks its stored credential and then supported ambient variables, including `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_OAUTH_TOKEN`, and `ANTHROPIC_API_KEY`; other factories own their corresponding rules. `createModels()` uses an in-memory credential store unless the application injects a persistent `CredentialStore`.

The request merge order is precise. Pseudocode: the arrows summarize exact field precedence rather than executable assignments:

```text
stored credential or provider ambient auth
  -> model.headers
  -> explicit options.apiKey and options.headers
  -> Models-only transformHeaders callback
  -> Provider.stream() or Provider.streamSimple()
```

An explicit per-request `apiKey` wins. A stored credential owns its provider, so a failed stored OAuth refresh does not silently fall back to an environment key. `models.getAuth()` can inspect resolution without starting a request; when called directly, broken credential storage or OAuth refresh rejects with `ModelsError`. The `Models.stream*()` path catches those setup failures inside `lazyStream()` and emits a normalized error result instead.

`getModel(provider, id)` is a synchronous catalog lookup and returns `undefined` when no registered provider currently exposes that ID. It does not fetch a catalog and does not prove that auth is configured. `getAvailable()` applies auth checks, while dynamic providers update their last-known model lists through `refresh()`.

A `Model` records both routing keys. `provider` names the collection owner; `api` names the provider's wire implementation. The record also carries `id`, `name`, `baseUrl`, input capabilities, reasoning support, token limits, cost rates, compatibility flags, optional headers, and a model-specific `thinkingLevelMap`. Keep a custom model's `provider` aligned with the ID passed to `createProvider()` and configure the endpoint on the model when the reused API implementation reads `model.baseUrl`.

### Scenario 2: add a provider or a new wire protocol

For an OpenAI-compatible endpoint, reuse the existing lazy API implementation and define only provider-owned concerns. This self-contained construction example compiles against the public `0.84.2` exports; it creates the provider and catalog without making a network request.

```typescript
import {
  createModels,
  createProvider,
  type Model,
} from "@earendil-works/pi-ai";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";

const localModel: Model<"openai-completions"> = {
  id: "llama-3.1-8b",
  name: "Llama 3.1 8B (local)",
  api: "openai-completions",
  provider: "local-openai",
  baseUrl: "http://localhost:11434/v1",
  reasoning: false,
  input: ["text"],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 128000,
  maxTokens: 32000,
};

const localProvider = createProvider({
  id: "local-openai",
  name: "Local OpenAI-compatible server",
  auth: {
    apiKey: {
      name: "Local server",
      resolve: async () => ({ auth: {} }),
    },
  },
  models: [localModel],
  api: openAICompletionsApi(),
});

const models = createModels();
models.setProvider(localProvider);

const configured = models.getModel("local-openai", "llama-3.1-8b");
if (!configured) throw new Error("Local model registration failed");
console.log(configured.name);
```

Every provider declares auth semantics, including a keyless local provider. A keyed proxy can use the public `envApiKeyAuth()` helper. A mixed provider passes a map of `model.api` values to `ProviderStreams`; `createProvider()` dispatches each model through the matching entry and produces a stream error if no entry exists.

A genuinely new wire protocol requires more work than registering a model. Pseudocode: this integration sequence contains no exported helper calls.

```text
define the API ID and typed options
  -> implement ProviderStreams.stream and streamSimple
  -> convert Context, messages, Tools, and options into the wire request
  -> convert every response path into normalized Pi events
  -> wrap the implementation lazily when SDK loading is expensive
  -> createProvider({ id, auth, models, api })
  -> models.setProvider(provider)
  -> test streaming, usage, abort, empty output, overflow, Tools, and replay
```

An upstream Pi contribution places API implementations in `packages/ai/src/api/`, provider factories in `packages/ai/src/providers/`, and stable catalogs beside the factories. Application code may implement the public `ProviderStreams` contract locally. In both cases, adding the provider must not require changes to Agent Loop, session storage, or Tool execution; those layers continue to consume normalized messages and events.

The old `registerApiProvider()` path belongs to `@earendil-works/pi-ai/compat`. It supports migration for code written around the global registry, but new integrations should build a provider with `createProvider()`, add it to a `Models` collection, and call through that collection.

## 4. Inside the API adapter: streaming and reasoning dialects

The public protocol hides transport differences, but adapter authors must handle them explicitly. The current code does not force every provider through one SDK or one transport.

Readers who only call built-in providers can treat this section as implementation reference. Provider and adapter authors need the event-family and reasoning details to preserve Pi's public contract.

### Streaming dialects

Pseudocode: this data-flow sketch names the exact current upstream event or chunk families and omits provider request fields.

```text
Anthropic HTTP body -> iterateSseMessages() -> content_block_* / message_delta -> Pi events
OpenAI SDK          -> AsyncIterable<ChatCompletionChunk> -> choices[0].delta -> Pi events
Google SDK          -> generateContentStream() -> GenerateContentResponse parts -> Pi events
Bedrock SDK         -> ConverseStreamCommand output events -> Pi events
```

The Anthropic adapter imports the official SDK to construct requests and auth headers, then iterates the response body's SSE frames itself. It validates known event names, parses each `data` record, and maps content-block start, delta, and stop events. OpenAI Chat Completions uses the SDK's structured chunks and accumulates `choices[0].delta.content`, reasoning fields, and indexed Tool-call fragments. Google iterates structured response parts; function calls do not stream argument fragments in the same way, so the adapter emits a complete `toolcall_delta` followed by `toolcall_end`.

Those differences affect failure and finalization paths. An adapter must close any unfinished content blocks, remove streaming scratch fields such as partial Tool JSON, preserve partial content on abort, and emit exactly one terminal event. It must also record provider usage that may arrive at the start, in a final metadata chunk, or in a separate SDK field.

SDK parsing leaves provider event shapes and semantics different. Pi standardizes the application-facing protocol while each adapter handles its actual upstream protocol.

### Reasoning levels and provider translation

The shared `reasoning` option is semantic. API implementations translate it to their own controls. Pseudocode: these representative adapter outputs omit the rest of each request object.

```typescript
anthropicAdaptive.output_config = { effort: "high" };
anthropicBudget.thinking = { type: "enabled", budget_tokens: 16384 };
openAIResponses.reasoning = { effort: "high" };
googleThinking.thinkingConfig = {
  includeThoughts: true,
  thinkingLevel: "HIGH",
};
```

Anthropic adaptive-thinking models use effort; older capable models use a token budget. OpenAI APIs use reasoning-effort fields with API-specific option names. Gemini families may use a discrete thinking level or a token budget. Bedrock follows the selected model family and can carry Anthropic reasoning content in Converse blocks. `streamSimple()` owns these translations, while `stream()` exposes each API's full options after model narrowing.

Pi now has seven model capability levels, not the historical five-tier scale. Pseudocode: this ladder pairs the standard token budgets with the levels that have them:

```text
off -> minimal -> low -> medium -> high -> xhigh -> max
       1,024     2,048   8,192    16,384   provider-specific
```

`SimpleStreamOptions.reasoning` accepts `minimal` through `max`; it does not accept `off`. Omit `reasoning` when no reasoning is requested. `ModelThinkingLevel` adds `off` for capability maps and adapter logic.

The standard token budgets through `high` are 1,024, 2,048, 8,192, and 16,384 unless the caller supplies `thinkingBudgets`. `xhigh` and `max` are opt-in model levels and require non-null `thinkingLevelMap` entries. `getSupportedThinkingLevels()` reports the concrete model's levels. If a requested level is unavailable, `clampThinkingLevel()` searches upward first, then downward. Simple adapters also protect answer space and clamp output against the model's context window; the exact payload still belongs to the API implementation.

## 5. Cache control, errors, retries, and cancellation

The same semantic boundary applies to performance and failure behavior. Shared options express caller intent, while adapters implement only the mechanisms their APIs support.

### Cache control follows provider semantics

Agent turns normally resend a growing conversation prefix. Prompt caching can avoid recomputing an unchanged provider-visible prefix, but providers expose different controls. Pi presents one preference whose exact source declaration is:

```typescript
export type CacheRetention = "none" | "short" | "long";
```

This source-faithful declaration is from `packages/ai/src/types.ts` at `a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c`. The adapters default to `short` when the caller omits `cacheRetention`; `long` is honored only where model and API compatibility metadata support it.

| Adapter family                     | `none`                                                                            | `short`                                                                                                             | `long` and placement                                                                                                                  |
| ---------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Anthropic Messages                 | No `cache_control`                                                                | `cache_control: { type: "ephemeral" }`                                                                              | Adds `ttl: "1h"` for models with long-retention support; marks the system prompt, final Tool definition, and last eligible user block |
| Bedrock Converse                   | No explicit `cachePoint`                                                          | Inserts `cachePoint: { type: DEFAULT }` for supported Claude models                                                 | Adds `ttl: ONE_HOUR`; cache points follow the system block and the last converted conversation message                                |
| OpenAI Responses                   | Omits the prompt cache key and may request explicit no-cache mode where supported | Uses a clamped `sessionId` as `prompt_cache_key` when supplied                                                      | Adds `prompt_cache_retention: "24h"` when compatibility metadata permits it                                                           |
| OpenAI-compatible Chat Completions | Omits `prompt_cache_key` and Anthropic-style markers                              | Uses a supplied `sessionId` as `prompt_cache_key` on OpenAI; compatible endpoints may instead use Anthropic markers | Adds `prompt_cache_retention: "24h"` when supported, or `ttl: "1h"` in Anthropic-marker mode; marker placement follows the row above  |

The table describes adapter behavior, not a guarantee that a provider will produce a cache hit. Hits depend on the provider-visible serialized prefix and the service's own eligibility rules. Rebuilding a JavaScript `Context` object does not by itself break a content-prefix cache. Changing the system prompt, Tool definitions, converted message blocks, compatibility mode, or session key can change what the provider sees.

The baseline's fixed pricing ratios and savings estimate are not part of Pi's API contract and are omitted. Current usage records `cacheRead`, `cacheWrite`, and the calculated cost based on each model's catalog rates; applications can measure actual savings from those fields.

### Errors, retry boundaries, abort, and overflow

The following non-self-contained excerpt is from `packages/ai/src/api/lazy.ts` at `a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c`. It shows the exact setup-error path; `setup`, `forwardStream`, `createSetupErrorMessage`, and `outer` are defined in the surrounding function.

```typescript
setup()
  .then((inner) => forwardStream(outer, inner))
  .catch((error) => {
    const message = createSetupErrorMessage(model, error);
    outer.push({ type: "error", reason: "error", error: message });
    outer.end(message);
  });
```

After an adapter stream starts, API implementations use the same outcome for request failures. They preserve the partial `AssistantMessage`, set `stopReason` to `"aborted"` when the signal is aborted or `"error"` otherwise, attach `errorMessage`, emit `error`, and end the stream. On the normal `Models` path, `stream.result()` resolves to a persistable outcome and provider-specific SDK exceptions stay inside the boundary. A missing model remains a lookup concern because `getModel()` returned `undefined` before streaming began.

Cancellation travels through `options.signal`. It interrupts supported HTTP or SDK work and the retry backoff, and the final message may contain text, thinking, Tool fragments, usage, and cost accumulated before cancellation. The caller can store that aborted message and decide whether a later request should continue from it.

`maxRetries` controls adapter-level retries where supported. At this pin, the shared OpenAI/Anthropic retry helper defaults to zero retries, honors `x-should-retry`, retries status `408`, `409`, `429`, and `5xx`, respects server retry-delay headers, and uses abortable exponential backoff. A server-requested delay above `maxRetryDelayMs` fails immediately; the default cap is 60 seconds, while zero disables the cap. `timeoutMs` is passed only to providers or SDKs that support it. These options do not promise identical transport behavior across every adapter.

This request-level retry is separate from higher-level Agent policy. `Models` does not automatically retry a completed assistant error after the stream settles. A host such as Coding Agent can classify the normalized error, schedule another model call, report progress, or stop according to its own retry budget.

Context overflow also needs a normalized test. The exported `isContextOverflow()` checks provider error-message patterns, successful responses whose input usage exceeds a supplied context window, and a `length` result with zero output whose input fills at least 99% of that window. The last two checks cover services that truncate or accept oversized input without a conventional error. Custom providers may still need an additional pattern or host-side check.

`onPayload` can inspect or replace a provider payload, and `onResponse` can inspect status and redacted headers. Both hooks run inside the request path, so thrown hook errors become stream errors. Do not log API keys, authorization headers, unredacted prompts, or private Tool data from either callback.

## 6. What happens behind the one-line call

The complete route can now be read without the retired global registry. Pseudocode: this final sequence summarizes the current dispatch and normalization path:

```text
models.streamSimple(model, context, sharedOptions)
  -> Models locates model.provider
  -> Models resolves auth and final request headers
  -> Provider selects ProviderStreams for model.api
  -> streamSimple translates reasoning and shared options
  -> API adapter converts Context and sends the provider request
  -> adapter normalizes streaming blocks, usage, stop reasons, and errors
  -> AssistantMessageEventStream exposes events and result()
  -> Agent Loop consumes only Pi messages and Pi event types
```

The collection and provider layers decide where the work goes. The API adapter decides how provider data becomes Pi data. The event stream defines what the caller can rely on.

### Design summary

Three design choices carry beyond Pi.

1. Define a protocol at the volatile boundary. `ProviderStreams`, `StreamFunction`, and `AssistantMessageEvent` constrain inputs, outputs, and termination without forcing unrelated providers into a shared base class.
2. Put routing and configuration in owned objects. A `Models` collection makes provider registration, catalog reads, credentials, and dispatch explicit; a provider factory keeps SDK imports and auth policy local.
3. Standardize caller intent and keep mechanisms in adapters. Reasoning levels and cache retention remain stable concepts even though their request fields, limits, and eligibility rules differ.

Compatibility APIs can preserve an old call shape during migration, but they should not define new architecture. New code should resolve a model and stream it through the same `Models` collection.

## 7. Next stop

The model boundary returns normalized `ToolCall` blocks, but it does not execute them. The next chapter follows a Tool call through schema validation, scheduling, safety hooks, execution, progress, and the `ToolResultMessage` sent back to the model.

Source review for this chapter is pinned to Pi `0.84.2` at commit `a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c`. The primary files are `packages/ai/src/models.ts`, `types.ts`, `api/lazy.ts`, `api/simple-options.ts`, the Anthropic/OpenAI/Google/Bedrock API implementations, `utils/event-stream.ts`, `utils/provider-retry.ts`, `utils/overflow.ts`, and the provider factories under `packages/ai/src/providers/`.

[Chapter 5: Tool system](ch05-tool-system.md)
