---
title: API reference
description: A curated map of core and experimental Pi package entry points at version 0.85.0.
translation_key: reference-api
language: en
official_refs:
  - 'https://github.com/earendil-works/pi/blob/107d79f11072bbc8a3a757ed7fd69596bee7d68c/packages/client/src/index.ts'
  - 'https://github.com/earendil-works/pi/blob/107d79f11072bbc8a3a757ed7fd69596bee7d68c/packages/client/README.md'
  - 'https://github.com/earendil-works/pi/blob/107d79f11072bbc8a3a757ed7fd69596bee7d68c/packages/protocol/src/index.ts'
  - 'https://github.com/earendil-works/pi/blob/107d79f11072bbc8a3a757ed7fd69596bee7d68c/packages/protocol/README.md'
  - 'https://github.com/earendil-works/pi/blob/107d79f11072bbc8a3a757ed7fd69596bee7d68c/packages/server/src/index.ts'
  - 'https://github.com/earendil-works/pi/blob/107d79f11072bbc8a3a757ed7fd69596bee7d68c/packages/server/README.md'
status: reviewed
reviewed_by: Pify maintainers
last_updated: '2026-09-04'
---

This curated integration reference omits exhaustive specialist and UI exports. It targets upstream commit `107d79f11072bbc8a3a757ed7fd69596bee7d68c`, the package roots at `0.85.0`, and Node.js `22.19` or newer.

- `@earendil-works/pi-ai` owns provider collections, model metadata, authentication, messages, and LLM streams.
- `@earendil-works/pi-agent-core` adds the agent loop, tool execution, state, queues, and lifecycle events.
- `@earendil-works/pi-coding-agent` assembles sessions, settings, resources, extensions, coding tools, and CLI or SDK runtimes.
- `@earendil-works/pi-client`, `@earendil-works/pi-protocol`, and `@earendil-works/pi-server` expose the optional experimental routed-service boundary.

The root of `pi-ai` is side-effect free. Provider factories live under `providers/*`, wire-protocol implementations under `api/*`, and the retired global catalog helpers under `compat`. New integrations should not use `compat`.

## `@earendil-works/pi-ai`

### Provider collections

`createModels()` returns an empty mutable `Models` collection. Add only the providers you ship, or use `builtinModels()` from `providers/all` when bundle size is not a concern.

```ts title="catalog.ts"
import { createModels } from "@earendil-works/pi-ai";
import { anthropicProvider } from "@earendil-works/pi-ai/providers/anthropic";

const models = createModels();
models.setProvider(anthropicProvider());

const model = models.getModel("anthropic", "claude-sonnet-4-6");
if (!model) throw new Error("Model is not in the registered catalog");
```

`MutableModels` adds `setProvider()`, `deleteProvider()`, and `clearProviders()` to the read and request methods on `Models`. Providers, not a process-wide registry, own catalogs and request routing.

### Catalog lookup and authentication

`getProviders()`, `getProvider()`, `getModels()`, and `getModel()` are synchronous reads of the last-known catalog. `refresh()` restores or refreshes dynamic providers and returns `{ aborted, errors }`; it does not reject merely because one provider failed. `checkAuth()`, `getAuth()`, and `getAvailable()` resolve provider-scoped availability. `login()` and `logout()` use the collection's credential store.

```ts title="lookup.ts"
import type { Api, Model } from "@earendil-works/pi-ai";
import { builtinModels } from "@earendil-works/pi-ai/providers/all";

const models = builtinModels();
const cached: readonly Model<Api>[] = models.getModels("anthropic");
const refresh = await models.refresh({
  providers: ["radius"],
  allowNetwork: false,
});
const available = await models.getAvailable("anthropic");

console.log(cached.length, refresh.errors.size, available.length);
```

Provider factories normally resolve stored credentials first and then provider environment variables or ambient credentials. Applications that need persistence supply a `CredentialStore` and, for dynamic catalogs, a `ModelsStore` to `createModels()`.

### Provider factories and adapters

Use a factory from `providers/*` to add an existing provider. Use `createProvider()` only when defining a provider or combining a catalog with a wire-protocol implementation. The following local OpenAI-compatible provider uses the public lazy API subpath and standard environment-key resolver.

```ts title="custom-provider.ts"
import {
  createModels,
  createProvider,
  envApiKeyAuth,
  type Model,
} from "@earendil-works/pi-ai";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";

const localModel = {
  id: "local-chat",
  name: "Local Chat",
  api: "openai-completions",
  provider: "local",
  baseUrl: "http://127.0.0.1:8080/v1",
  reasoning: false,
  input: ["text"],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 32_768,
  maxTokens: 4_096,
} satisfies Model<"openai-completions">;

const local = createProvider({
  id: "local",
  auth: { apiKey: envApiKeyAuth("Local API key", ["LOCAL_API_KEY"]) },
  models: [localModel],
  api: openAICompletionsApi(),
});

const models = createModels();
models.setProvider(local);
```

A native `Provider` supplies identity, auth, `getModels()`, optional `refreshModels()`, and stream methods. `createProvider({ fetchModels })` handles a dynamic overlay. A new protocol adapter must return an `AssistantMessageEventStream` and follow its terminal-event contract.

### Streaming and completion

`stream()` and `complete()` accept API-specific options. `streamSimple()` and `completeSimple()` accept portable reasoning, retry, transport, abort, and payload/response hooks, then translate those options for the selected API.

```ts title="stream.ts"
import type { Context } from "@earendil-works/pi-ai";
import { builtinModels } from "@earendil-works/pi-ai/providers/all";

const models = builtinModels();
const model = models.getModel("openai", "gpt-4o-mini");
if (!model) throw new Error("Model not found");

const context: Context = {
  messages: [{ role: "user", content: "Reply in one sentence.", timestamp: Date.now() }],
};
const stream = models.streamSimple(model, context);

for await (const event of stream) {
  if (event.type === "text_delta") process.stdout.write(event.delta);
}
const finalMessage = await stream.result();
console.log(finalMessage.stopReason, finalMessage.usage.cost.total);
```

The stream itself encodes request failures: inspect the final `error` event or the resolved message's `stopReason` and `errorMessage`. Pass an `AbortSignal` in the options to cancel a request.

### Model metadata

`Model<TApi>` is the request descriptor. Required fields are `id`, `name`, `api`, `provider`, `baseUrl`, `reasoning`, supported `input`, per-million-token `cost`, `contextWindow`, and `maxTokens`. Optional metadata includes `thinkingLevelMap`, `samplingParams`, `headers`, and API-specific `compat` flags.

```ts title="model.ts"
import type { Model } from "@earendil-works/pi-ai";

const model = {
  id: "local-chat",
  name: "Local Chat",
  api: "openai-completions",
  provider: "local",
  baseUrl: "http://127.0.0.1:8080/v1",
  reasoning: false,
  input: ["text", "image"],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 32_768,
  maxTokens: 4_096,
  compat: { supportsDeveloperRole: false },
} satisfies Model<"openai-completions">;

console.log(model.provider, model.contextWindow);
```

Google exposes two public thinking-level types from `@earendil-works/pi-ai`. `GoogleApiThinkingLevel` is the API-facing union `"THINKING_LEVEL_UNSPECIFIED" | "MINIMAL" | "LOW" | "MEDIUM" | "HIGH"`, matching the enum-like values accepted by `GoogleOptions.thinking.level` and `GoogleVertexOptions.thinking.level`. `ResolvedGoogleThinkingLevel` is the normalized adapter union `"minimal" | "low" | "medium" | "high"`; it represents the result after model-level resolution and is appropriate for internal mapping tables, not request options.

```ts title="google-thinking-types.ts"
import type {
  GoogleApiThinkingLevel,
  GoogleOptions,
  ResolvedGoogleThinkingLevel,
} from "@earendil-works/pi-ai";

const apiLevel: GoogleApiThinkingLevel = "HIGH";
const options = {
  thinking: { enabled: true, level: apiLevel },
} satisfies GoogleOptions;

const normalizedBudgets: Record<ResolvedGoogleThinkingLevel, number> = {
  minimal: 1_024,
  low: 2_048,
  medium: 8_192,
  high: 16_384,
};

void [options, normalizedBudgets];
```

Cost tiers, when present, compare `input + cacheRead + cacheWrite` with `inputTokensAbove`; the highest matching threshold prices the whole request.

### Context, messages, and tools

`Context` contains an optional `systemPrompt`, `Message[]`, and optional `Tool[]`. `Message` is the provider-facing union of user, assistant, and tool-result messages. Tool parameters are TypeBox schemas; validate arguments before executing tools when working below Agent Core.

```ts title="context.ts"
import { Type, type Context, type Tool } from "@earendil-works/pi-ai";

const search = {
  name: "search",
  description: "Search indexed documents",
  parameters: Type.Object({ query: Type.String() }),
} satisfies Tool;

const context: Context = {
  systemPrompt: "Cite the matching document.",
  messages: [{ role: "user", content: "Find the release note.", timestamp: Date.now() }],
  tools: [search],
};

console.log(context.tools?.[0]?.name);
```

`AssistantMessage` content contains text, thinking, or tool-call blocks and carries usage, cost, stop reason, and optional error or deferred-response metadata. Persist opaque signatures unchanged when replaying a conversation.

### Stream events

`AssistantMessageEventStream` is both an async iterable and a holder for `result()`. A conforming stream starts once and terminates once.

| Event | Payload and use |
|---|---|
| `start` | Initial partial assistant message |
| `text_start` / `text_delta` / `text_end` | Text block lifecycle and incremental text |
| `thinking_start` / `thinking_delta` / `thinking_end` | Thinking block lifecycle when the model emits it |
| `toolcall_start` / `toolcall_delta` / `toolcall_end` | Partial arguments and the validated final tool call |
| `done` | Successful terminal event with reason `stop`, `length`, `toolUse`, or `deferred` |
| `error` | Terminal `error` or `aborted` assistant message |

## `@earendil-works/pi-agent-core`

### `Agent`

`Agent` is the stateful wrapper for the low-level loop. It owns the transcript, tool execution, steering and follow-up queues, and event delivery. Its `streamFn` can be `models.streamSimple.bind(models)`.

```ts title="agent.ts"
import { Agent } from "@earendil-works/pi-agent-core";
import { builtinModels } from "@earendil-works/pi-ai/providers/all";

const models = builtinModels();
const model = models.getModel("anthropic", "claude-sonnet-4-6");
if (!model) throw new Error("Model not found");

const agent = new Agent({
  initialState: { systemPrompt: "Be concise.", model },
  streamFn: models.streamSimple.bind(models),
});

await agent.prompt("Explain this module.");
```

`prompt()` starts a run; `continue()` resumes when the last message is user or tool-result. Use `steer()` for the next turn and `followUp()` after the loop would otherwise stop.

### `agentLoop()`

`agentLoop(prompts, context, config, signal, streamFn)` is stateless with respect to your application. It returns `EventStream<AgentEvent, AgentMessage[]>`; iterate events, then await `result()` for the new messages. `agentLoopContinue()` reuses a context whose last message can continue.

```ts title="agent-loop.ts"
import { agentLoop, type AgentContext } from "@earendil-works/pi-agent-core";
import type { Message } from "@earendil-works/pi-ai";
import { builtinModels } from "@earendil-works/pi-ai/providers/all";

const models = builtinModels();
const model = models.getModel("openai", "gpt-4o-mini");
if (!model) throw new Error("Model not found");

const context: AgentContext = { systemPrompt: "Be exact.", messages: [], tools: [] };
const prompt = { role: "user" as const, content: "Summarize the API.", timestamp: Date.now() };
const events = agentLoop(
  [prompt],
  context,
  {
    model,
    convertToLlm: (messages) =>
      messages.filter(
        (message): message is Message =>
          message.role === "user" || message.role === "assistant" || message.role === "toolResult",
      ),
  },
  undefined,
  models.streamSimple.bind(models),
);

for await (const event of events) console.log(event.type);
const newMessages = await events.result();
```

### `AgentLoopConfig`

The required fields are `model` and `convertToLlm`. Optional hooks transform context, resolve keys, prepare the next turn, stop after a completed turn, or intercept tool calls. Portable stream options, queue sources, retry limits, and `toolExecution: "parallel" | "sequential"` are also accepted.

```ts title="loop-config.ts"
import type { AgentLoopConfig } from "@earendil-works/pi-agent-core";
import type { Message } from "@earendil-works/pi-ai";
import { builtinModels } from "@earendil-works/pi-ai/providers/all";

const models = builtinModels();
const model = models.getModel("openai", "gpt-4o-mini");
if (!model) throw new Error("Model not found");

const config = {
  model,
  convertToLlm: (messages) =>
    messages.filter(
      (message): message is Message =>
        message.role === "user" || message.role === "assistant" || message.role === "toolResult",
    ),
  toolExecution: "parallel",
  shouldStopAfterTurn: ({ toolResults }) => toolResults.some((result) => result.isError),
} satisfies AgentLoopConfig;

console.log(config.toolExecution);
```

`convertToLlm` must filter or convert custom `AgentMessage` variants and must not reject. The same safe-fallback rule applies to `transformContext` and dynamic key resolution.

### `AgentTool`

`AgentTool` extends the Pi AI tool schema with a UI label and `execute(toolCallId, params, signal, onUpdate)`. Return model-visible `content` and structured `details`; throw to produce an error tool result. `onUpdate` emits partial progress.

```ts title="tool.ts"
import { Type } from "@earendil-works/pi-ai";
import type { AgentTool } from "@earendil-works/pi-agent-core";

const parameters = Type.Object({ path: Type.String() });

const inspectFile: AgentTool<typeof parameters, { path: string }> = {
  name: "inspect_file",
  label: "Inspect file",
  description: "Inspect one file",
  parameters,
  async execute(_toolCallId, { path }, signal, onUpdate) {
    signal?.throwIfAborted();
    onUpdate?.({ content: [{ type: "text", text: `Opening ${path}` }], details: { path } });
    return { content: [{ type: "text", text: `Inspected ${path}` }], details: { path } };
  },
};

console.log(inspectFile.name);
```

Multiple calls run in parallel by default, but a tool can request sequential execution. Completion events may arrive out of source order; final tool-result messages remain in assistant source order.

### State, control, and events

`agent.state` exposes the current system prompt, model, thinking level, tools, messages, streaming message, pending tool-call IDs, and latest error. `subscribe()` accepts sync or async listeners and returns an unsubscribe function; Agent awaits listeners in registration order.

```ts title="agent-events.ts"
import type { Agent } from "@earendil-works/pi-agent-core";

export function observe(agent: Agent): () => void {
  return agent.subscribe(async (event, signal) => {
    if (signal.aborted) return;
    if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
      process.stdout.write(event.assistantMessageEvent.delta);
    }
    if (event.type === "tool_execution_end") console.log(event.toolCallId, event.isError);
  });
}
```

Runs emit `agent_start`/`agent_end`; each model turn emits `turn_start`/`turn_end`; messages emit start/update/end; tools emit execution start/update/end. `abort()` signals the active run. `waitForIdle()` settles after the final awaited listener. Agent Core also exports harness and session primitives; use Coding Agent's `SessionManager` when you need Pi's JSONL coding-session format.

## `@earendil-works/pi-coding-agent`

### `createAgentSession()` and `AgentSession`

`createAgentSession(options?)` resolves a `ModelRuntime`, `SessionManager`, `SettingsManager`, `ResourceLoader`, tools, and extensions, then returns `{ session, extensionsResult, modelFallbackMessage? }`. Prompting requires a configured model and credential.

```ts title="session.ts"
import {
  createAgentSession,
  ModelRuntime,
  SessionManager,
} from "@earendil-works/pi-coding-agent";

const modelRuntime = await ModelRuntime.create();
const { session, modelFallbackMessage } = await createAgentSession({
  modelRuntime,
  sessionManager: SessionManager.inMemory(process.cwd()),
  tools: ["read"],
});

const unsubscribe = session.subscribe((event) => {
  if (event.type === "agent_settled") console.log("idle");
});
try {
  if (modelFallbackMessage) console.warn(modelFallbackMessage);
  await session.prompt("Describe the current directory.");
} finally {
  await session.abort();
  unsubscribe();
  session.dispose();
}
```

An `AgentSession` adds synchronous subscriptions, persistence, compaction, retries, bash execution, model selection, reload, and extension dispatch around `Agent`. Await `abort()` to cancel retry and agent work and wait for idle; call `dispose()` when the host is finished.

### Persistence, settings, and resources

- `SessionManager.create(cwd, sessionDir?, options?)`, `continueRecent(cwd, sessionDir?)`, `open(path, sessionDir?, cwdOverride?)`, `inMemory(cwd?, options?)`, `forkFrom(sourcePath, targetCwd, sessionDir?, options?)`, and `list(cwd, sessionDir?, onProgress?)` manage append-only JSONL sessions and their trees. Use `listAll(onProgress?)` or `listAll(sessionDir?, onProgress?)` across projects.
- `SettingsManager.create(cwd, agentDir?)` merges global and trusted project settings; `SettingsManager.inMemory()` is useful for embedded hosts and tests.
- `new DefaultResourceLoader({ cwd, agentDir, settingsManager? })` constructs a loader that discovers context files, system prompts, extensions, skills, prompt templates, and themes after `reload()`.
- `ModelRuntime.create()` owns the provider catalog and synchronized credentials used by Coding Agent.

Direct SDK hosts own cwd, trust, storage, and cleanup policy. Do not mutate session JSONL while a manager is active, and do not assume that `SettingsManager.create()` reproduces CLI trust resolution without the host supplying that decision.

### Extensions and managed tools

An extension is an `ExtensionFactory` receiving the exported `ExtensionAPI`. Register tools, commands, shortcuts, flags, providers, and event handlers through that object; there is no global `registerExtension()`.

```ts title="extension.ts"
import { Type } from "@earendil-works/pi-ai";
import { defineTool, type ExtensionFactory } from "@earendil-works/pi-coding-agent";

const inspectPath = defineTool({
  name: "inspect_path",
  label: "Inspect path",
  description: "Return the requested path",
  parameters: Type.Object({ path: Type.String() }),
  async execute(_toolCallId, { path }) {
    return { content: [{ type: "text", text: path }], details: { path } };
  },
});

const extension: ExtensionFactory = (pi) => {
  pi.registerTool(inspectPath);
  pi.on("before_agent_start", (event) => ({
    systemPrompt: `${event.systemPrompt}\nKeep file paths exact.`,
  }));
};

export default extension;
```

| Managed tool | Availability |
|---|---|
| `read`, `bash`, `edit`, `write` | Built in and active by default unless settings or SDK options change the selection |
| `powershell` | Optional Windows built-in; select it explicitly or use its exported factory |
| `grep`, `find`, `ls` | Built in; activate through `tools` or use their exported factories |
| Extension or `customTools` entries | Registered by the host; still filtered by `tools`, `excludeTools`, and `noTools` |

Tool access is an application policy. The current SDK does not expose the baseline `--yolo` switch.

### PowerShell Tool factory and operations

The package root publicly exports the PowerShell factory and types; no deep import into `dist/` or `src/` is required:

```ts
import {
  createPowerShellTool,
  type PowerShellOperations,
  type PowerShellToolOptions,
} from "@earendil-works/pi-coding-agent";
```

The published declaration is:

```ts
declare function createPowerShellTool(
  cwd: string,
  options?: PowerShellToolOptions,
): ReturnType<typeof createBashTool>;
```

In compact signature form, this is `createPowerShellTool(cwd: string, options?: PowerShellToolOptions)`. The returned `AgentTool` accepts `{ command: string, timeout?: number }`, streams partial results through the normal Tool update callback, and resolves to the shared shell-tool detail shape. Creating the Tool does not execute a command; execution begins only when its `execute` method is invoked by the host.

`PowerShellToolOptions` is declared as a `Pick` of the shared shell options. Its effective public shape is:

```ts
interface PowerShellToolOptions {
  operations?: PowerShellOperations;
  exposeSessionEnvironment?: boolean;
  spawnHook?: PowerShellSpawnHook;
}
```

`PowerShellSpawnHook` receives and returns `{ command: string; cwd: string; env: NodeJS.ProcessEnv }`. The default `exposeSessionEnvironment` is `true`; the hook runs after Pi builds the command environment. Unlike `BashToolOptions`, this type does not expose `commandPrefix` or `shellPath`.

`PowerShellOperations` is a public alias of `BashOperations`, not a private PowerShell process class. A custom backend implements exactly one streamed method:

```ts
interface PowerShellOperations {
  exec: (
    command: string,
    cwd: string,
    options: {
      onData: (data: Buffer) => void;
      signal?: AbortSignal;
      timeout?: number;
      env?: NodeJS.ProcessEnv;
    },
  ) => Promise<{ exitCode: number | null }>;
}
```

The Tool wrapper owns argument validation, progress/result formatting, and bounded output. The operations backend owns actual execution: it must stream stdout/stderr bytes through `onData`, honor cancellation and timeout, return `null` when killed, and clean up process trees, transports, timers, and listeners. `createLocalPowerShellOperations()` is also public and supplies Pi's native Windows backend, but its executable discovery and process lifecycle are implementation behavior rather than an API for private process handles.

### Runtime and CLI integration

For one fixed session, use `createAgentSession()`. For new, switch, fork, clone, or import flows, use `createAgentSessionRuntime()` and read `runtime.session` again after replacement; subscriptions belong to the old session. Lower-level hosts can use `createAgentSessionServices()`, `createAgentSessionFromServices()`, `runPrintMode()`, `runRpcMode()`, `RpcClient`, `parseArgs()`, or `main()`.

| CLI flag | Current purpose |
|---|---|
| `--provider`, `--model`, `--models` | Select one model or a model-cycle scope |
| `--thinking` | Select `off`, `minimal`, `low`, `medium`, `high`, `xhigh`, or `max` |
| `--system-prompt <text>` | Replace the base prompt source with literal text or the contents of an existing file path |
| `--append-system-prompt <text>` | Add literal text or an existing file as an ordered append source; repeat the flag to add more sources |
| `--tools`, `--exclude-tools`, `--no-tools`, `--no-builtin-tools` | Select the initial tool surface |
| `--session`, `--session-id`, `--session-dir`, `--continue`, `--resume`, `--fork`, `--no-session` | Choose persistence or restoration behavior |
| `--extension`, `--no-extensions`, `--skill`, `--no-skills`, `--no-context-files` | Control discovered or explicit resources |
| `--mode text|json|rpc`, `--print` | Select the host protocol or non-interactive output |

Extensions can register additional flags, so `parseArgs()` retains unknown flags for extension resolution. Use `--help` from the installed `pi` binary as the complete CLI inventory for that exact version.

## Experimental routed-service packages

The following package-root exports are the current `0.85.0` boundary, not a stable remote-Agent recipe. Applications still own service contracts, transport authentication, Session discovery, worker lifecycle, and retry policy. Subpath exports such as `@earendil-works/pi-client/unix`, `@earendil-works/pi-server/unix`, and `@earendil-works/pi-server/testing` are separate from the roots summarized here.

### `@earendil-works/pi-client`

The root exports `Client` and `createClientServiceTransport`; `ClientDisposedError`, `DisconnectedError`, and `ServerError`; the transport contracts `ByteTransport`, `ByteTransportFactory`, and `ByteTransportHandlers`; and the client types `AttachmentChangeListener`, `ClientOptions`, `ConnectionState`, `ConnectionStateChange`, `ListenerErrorHandler`, `ServiceSubscription`, and `Unsubscribe`.

`Client` is transport-neutral and operates on explicit `RpcTarget` values. `createClientServiceTransport(client, getTarget)` adapts a lazily resolved target to Chord's `RemoteServiceTransport`. It does not manufacture typed services. On disconnect or disposal, pending requests reject locally and the live attachment is cleared; the client does not reconnect or replay requests automatically, even though accepted work may finish remotely.

### `@earendil-works/pi-protocol`

The root exports `PROTOCOL_VERSION` (value `8`), `isServerId`, the message and target types `ClientMessage`, `ServerMessage`, `RpcTarget`, `ServerId`, and `SessionTarget`, plus the individual hello, request, cancellation, response, service-event, attachment, and protocol-error types. Encoding and validation entry points include `parseClientMessage`, `parseServerMessage`, `encodeClientMessage`, `encodeServerMessage`, `ClientMessageDecoder`, `ServerMessageDecoder`, `isSupportedProtocolVersion`, and `ProtocolValidationError`.

The same root re-exports CBOR and framing primitives: `encodeCbor`, `decodeCbor`, `CborError`, CBOR limit constants and options, `encodeFrame`, `FrameDecoder`, `FrameError`, `FrameDecoderOptions`, and `DEFAULT_MAX_FRAME_LENGTH`. These APIs validate strict envelopes, framing, and opaque strict-JSON values; Chord owns service-control parsing, subscriptions, bindings, and replicated-state semantics.

### `@earendil-works/pi-server`

The root exports `Server`, `ServerListener`, `ServerOptions`, `ServerHost`, `RoutedServerPresentation`, `RoutedServerServiceAttachment`, `RoutedServerServiceHost`, `RoutedSessionAttachment`, `RoutedSessionHandle`, and `MaybePromise`. It also exports `ServerError`, `WrongServerError`, `SessionNotFoundError`, `SessionAmbiguousError`, `SessionNotAttachedError`, `ServerDrainingError`, and `INTERNAL_SERVER_ERROR_MESSAGE`.

The server routes server-scoped and attachment-scoped Session services; it does not export the application's service catalogue or move an open `Session` or Agent Harness over the wire. A server target is `{ serverId }`, whereas a live Session target is `{ serverId, sessionId, attachmentId }`. Constructing listeners and providing routed service hosts are application responsibilities, so this reference intentionally does not present an end-to-end launch recipe as stable.

:::warning[Experimental compatibility]

The client, protocol, and server packages are experimental and have no compatibility guarantee. Pin their versions together and treat reconnect, replay, authentication, and lifecycle behavior as explicit application policy.

:::

## Next

- Review runtime settings: <a href="/en/reference/configuration">Configuration reference</a>
- Review credentials and paths: <a href="/en/reference/environment-variables">Environment variables</a>
- Add a provider or protocol adapter: <a href="/en/how-to/plug-new-model">Plug in a new model</a>
- Build an Agent Core tool: <a href="/en/how-to/add-custom-tool">Add a custom tool</a>
- Render event streams: <a href="/en/how-to/stream-output">Stream output</a>
- Store and branch coding sessions: <a href="/en/how-to/persist-sessions">Persist sessions</a>
