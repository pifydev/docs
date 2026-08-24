---
title: API reference
description: Key public entry points for Pi AI, Agent Core, and Coding Agent at the reviewed upstream revision.
translation_key: reference-api
language: en
status: reviewed
reviewed_by: Pify maintainers
last_updated: '2026-08-24'
---

This reference covers the stable entry points most integrations need. It reflects upstream commit `a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c`, package version `0.84.2`.

## Packages

| Package | Responsibility |
|---|---|
| `@earendil-works/pi-ai` | Providers, model catalog, authentication, messages, and LLM streams |
| `@earendil-works/pi-agent-core` | Stateful agent loop, tools, events, queues, compaction, and harness primitives |
| `@earendil-works/pi-coding-agent` | Sessions, settings, extensions, resources, coding tools, CLI, and SDK |

The old global catalog API remains on `@earendil-works/pi-ai/compat`. New code should use a `Models` collection and provider factories.

## Pi AI

### `createModels(options?)`

Creates an empty mutable provider collection.

```ts
import { createModels } from "@earendil-works/pi-ai";
import { anthropicProvider } from "@earendil-works/pi-ai/providers/anthropic";

const models = createModels();
models.setProvider(anthropicProvider());
```

Use `builtinModels()` from `@earendil-works/pi-ai/providers/all` when an application needs all built-in providers.

### `Models`

Important methods:

```ts
interface Models {
  getProviders(): readonly Provider[];
  getProvider(id: string): Provider | undefined;
  getModels(provider?: string): readonly Model[];
  getModel(provider: string, id: string): Model | undefined;
  getAvailable(provider?: string): Promise<readonly Model[]>;
  refresh(options?: ModelsRefreshOptions): Promise<ModelsRefreshResult>;
  stream(model: Model, context: Context, options?: StreamOptions): AssistantMessageEventStream;
  complete(model: Model, context: Context, options?: StreamOptions): Promise<AssistantMessage>;
  streamSimple(model: Model, context: Context, options?: SimpleStreamOptions): AssistantMessageEventStream;
  completeSimple(model: Model, context: Context, options?: SimpleStreamOptions): Promise<AssistantMessage>;
}
```

`getModel()` is synchronous and returns `undefined` for an unknown pair. `refresh()` updates configured dynamic providers without rejecting the whole operation when one provider fails.

### `createProvider(options)`

Creates a native `Provider`. A provider owns its model list, authentication policy, streaming implementation, and optional dynamic refresh behavior.

### Messages and streams

`Context` contains the system prompt, `Message[]`, and optional tools. `Message` is the provider-facing union of user, assistant, and tool-result messages. `AssistantMessageEventStream` emits incremental assistant events and resolves to the complete assistant message.

## Agent Core

### `new Agent(options)`

```ts
import { Agent } from "@earendil-works/pi-agent-core";

const agent = new Agent({
  initialState: { systemPrompt: "Be concise.", model },
  streamFn: models.streamSimple.bind(models),
});

const unsubscribe = agent.subscribe((event) => {
  // Handle lifecycle and streaming events.
});

await agent.prompt("Explain the current module.");
```

Core state is available through `agent.state`: `systemPrompt`, `model`, `thinkingLevel`, `tools`, `messages`, `streamingMessage`, and `errorMessage`.

Key methods are `prompt()`, `continue()`, `steer()`, `followUp()`, `abort()`, `subscribe()`, and `waitForIdle()`.

### `AgentTool`

A tool provides `name`, `label`, `description`, a TypeBox `parameters` schema, and `execute(toolCallId, params, signal, onUpdate)`. A successful handler returns `content`, optional `details`, and optional `terminate`. Throw to report a tool failure.

### Events

| Event | Meaning |
|---|---|
| `agent_start` / `agent_end` | One agent run starts or settles |
| `turn_start` / `turn_end` | One LLM call and its tool batch start or finish |
| `message_start` / `message_update` / `message_end` | A message lifecycle; only assistant messages update incrementally |
| `tool_execution_start` / `tool_execution_update` / `tool_execution_end` | Tool preflight, progress, and final result |

Parallel execution can finish tools out of source order. Persisted tool-result messages remain in assistant source order.

## Coding Agent

### `createAgentSession(options?)`

Creates an `AgentSession` and its resolved runtime dependencies.

```ts
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
```

Common options include `cwd`, `model`, `modelRuntime`, `sessionManager`, `settingsManager`, `resourceLoader`, `tools`, `excludeTools`, `customTools`, and `noTools`.

### `AgentSession`

Important members:

```ts
interface AgentSession {
  prompt(text: string, options?: PromptOptions): Promise<void>;
  steer(text: string): Promise<void>;
  followUp(text: string): Promise<void>;
  subscribe(listener: (event: AgentSessionEvent) => void): () => void;
  compact(customInstructions?: string): Promise<CompactionResult>;
  abort(): Promise<void>;
  dispose(): void;

  readonly sessionId: string;
  readonly sessionFile: string | undefined;
  readonly agent: Agent;
  readonly messages: AgentMessage[];
  readonly isStreaming: boolean;
}
```

### Session and settings helpers

- `SessionManager.create(cwd)`, `.inMemory(cwd)`, `.continueRecent(cwd)`, and `.open(path)` select persistence behavior.
- `SettingsManager.create()` loads global and project settings; `applyOverrides()` adds runtime overrides.
- `DefaultResourceLoader` discovers context files, extensions, skills, prompt templates, and themes.
- `defineTool()` preserves parameter inference for standalone tools passed through `customTools`.
- `ModelRuntime.create()` composes the model catalog, credentials, provider configuration, and runtime refresh.

### Runtime replacement

Use `createAgentSessionRuntime()` when the application must replace the active session through new, switch, fork, clone, or import flows. After replacement, read `runtime.session` again and attach new subscriptions.

## Compatibility notes

- Import provider factories from `@earendil-works/pi-ai/providers/*` and API implementations from `@earendil-works/pi-ai/api/*`.
- Do not use removed package names such as `@pi-ai/core` or `@pi-agent-core`.
- Prefer exact package types over recreating interfaces from this page; signatures can gain optional fields in later releases.
