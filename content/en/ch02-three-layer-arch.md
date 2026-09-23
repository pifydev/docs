---
title: 'Chapter 2: The three-layer architecture'
description: How Pi separates model transport, the agent runtime, and the coding-agent application without forcing every package into three boxes.
translation_key: ch02-three-layer-arch
language: en
chapter: 2
source_url: 'https://www.dgzhuya.com/modules/ch02-three-layer-arch'
official_refs:
  - 'https://github.com/earendil-works/pi/tree/f07218c4d4bbc12bef056a7058c3dd49dfe41abe/packages'
  - 'https://github.com/earendil-works/pi/blob/f07218c4d4bbc12bef056a7058c3dd49dfe41abe/packages/client/README.md'
  - 'https://github.com/earendil-works/pi/blob/f07218c4d4bbc12bef056a7058c3dd49dfe41abe/packages/protocol/README.md'
  - 'https://github.com/earendil-works/pi/blob/f07218c4d4bbc12bef056a7058c3dd49dfe41abe/packages/server/README.md'
terms_used:
  - Model
  - Provider
  - Message
  - Agent
  - Agent Loop
  - AgentMessage
  - AgentTool
  - Coding Agent
  - Tool
  - TUI
  - Extension
  - Session
  - SDK
  - monorepo
  - npm workspaces
  - TypeScript
  - TypeBox
  - TSchema
status: reviewed
last_updated: '2026-09-23'
translator: Pify maintainers
reviewed_by: Pify maintainers
---
> This chapter steps back from individual functions and looks at Pi's package architecture: where the code lives, which package owns each decision, how dependencies point, and how types gain capabilities as they cross a layer. That map will keep later source tours grounded.

---

## 1. You just opened an Agent codebase

Suppose you cloned the Pi repository at revision `f07218c` and opened `packages/`. The relevant part of the tree looks like this:

```text
repo/
├── packages/
│   ├── ai/                 ← @earendil-works/pi-ai
│   ├── agent/              ← @earendil-works/pi-agent-core
│   ├── coding-agent/       ← @earendil-works/pi-coding-agent
│   ├── tui/                ← @earendil-works/pi-tui
│   ├── server/             ← experimental service boundary
│   ├── client/             ← @earendil-works/pi-client (experimental)
│   ├── protocol/           ← @earendil-works/pi-protocol (experimental)
│   ├── chord/
│   ├── durable/
│   ├── telemetry/
│   ├── evals/
│   └── session-backends/
├── package.json            ← root workspace and build order
└── tsconfig.json
```

The first three packages form the dependency-direction model taught in this chapter. `pi-tui` is an orthogonal UI library. The client, protocol, and server packages form an optional experimental sibling boundary; the remaining directories support Chord services, durable execution, telemetry, evaluations, and session backends. The monorepo therefore contains more than five packages, even though five roles are useful for the first architectural tour.

Older Pi material may mention `pi-web-ui` or `pi-orchestrator`. Neither is a workspace at the pinned revision. In particular, the old claim that an experimental `pi-orchestrator` sits above coding-agent cannot describe this tree. Section 2.5 instead maps the optional client/protocol/server boundary and keeps its experimental status explicit.

Pi uses npm workspaces. The root manifest includes `packages/*`, the session backend subpackages, and a few coding-agent Extension examples that have their own dependencies. A workspace makes local packages build together; it does not make them one architectural layer.

The useful question is narrower than “why exactly five packages?” Ask instead: which decisions belong to model transport, which belong to the reusable Agent runtime, and which belong to the coding product? Then ask where UI and service boundaries connect without forcing them into that three-layer stack.

---

## 2. Five package roles, each with a job

Set dependency arrows aside for a moment. Read each package from its own public surface and manifest.

### 2.1 pi-ai: in charge of “calling models”

`@earendil-works/pi-ai`, in `packages/ai/`, answers: how can one application call models from different providers through shared types and streaming contracts?

Its manifest describes a “Unified LLM API with automatic model discovery and provider configuration.” At revision `f07218c`, the package owns four related concepts:

1. `Model<TApi>` describes a concrete model, including its provider, API protocol, input modes, context window, token limit, costs, headers, and compatibility settings.
2. `Provider<TApi>` owns a provider ID, authentication behavior, a synchronous model catalog, optional refresh behavior, and its `stream()` and `streamSimple()` implementations.
3. `Models` is the runtime collection. It looks up providers and models, resolves authentication, refreshes dynamic catalogs, and delegates a request to the provider that owns the selected `Model`.
4. `Message`, `Context`, `Tool`, and `AssistantMessageEventStream` form the provider-neutral request and response contract.

The root entry is intentionally side-effect free. Provider factories live behind package subpaths, while `createModels()` and the shared domain types stay at the root:

```typescript
// packages/ai/src/index.ts (selected exports at f07218c)
export type { Static, TSchema } from "typebox";
export { Type } from "typebox";
export * from "./models.ts";
export * from "./types.ts";
export * from "./utils/event-stream.ts";

// Application code chooses providers explicitly.
import { createModels } from "@earendil-works/pi-ai";
import { anthropicProvider } from "@earendil-works/pi-ai/providers/anthropic";
```

There is no Agent loop or coding-session policy in this boundary. Pi AI knows how a model request is represented, authenticated, sent, and streamed. It does not decide when another model turn should start or where a coding transcript should be stored.

### 2.2 pi-agent-core: in charge of “running the loop”

`@earendil-works/pi-agent-core`, in `packages/agent/`, answers: how does an LLM repeatedly produce messages, request tools, consume results, and continue until the run settles?

Its manifest calls it a “General-purpose agent with transport abstraction, state management, and attachment support.” General-purpose is the boundary. The runtime has no built-in opinion that a Tool must read a file, execute Bash, or edit source code. It owns:

- `Agent` and the low-level `agentLoop()` control flow;
- `AgentState`, including the system prompt, selected `Model`, thinking level, `AgentTool[]`, `AgentMessage[]`, streaming state, and pending Tool calls;
- steering and follow-up queues;
- `transformContext` and `convertToLlm` hooks between application messages and model `Message[]`;
- Agent, turn, message, and Tool-execution events;
- reusable components for sessions, compaction, prompts, Skills, and managed Tool environments.

The public entry point reflects that split:

```typescript
// packages/agent/src/index.ts (selected exports at f07218c)
export * from "./agent.ts";
export * from "./agent-loop.ts";
export * from "./harness/compaction/compaction.ts";
export * from "./harness/session/index.ts";
export * from "./harness/tools/index.ts";
export * from "./types.ts";
```

The loop receives a `StreamFn`. `models.streamSimple.bind(models)` satisfies that contract, so Agent Core can run against the configured `Models` collection without discovering provider factories itself. That injection point separates “run the state machine” from “choose and authenticate a provider.”

### 2.3 pi-coding-agent: in charge of “the actual product”

`@earendil-works/pi-coding-agent`, in `packages/coding-agent/`, answers: how do those lower-level pieces become the `pi` coding assistant?

Its manifest says “Coding agent CLI with read, bash, edit, write tools and session management.” This package owns product policy and assembly:

- CLI parsing and interactive, print, JSON, RPC, and SDK entry paths;
- the eight built-in `read`, `bash`, `powershell`, `edit`, `write`, `grep`, `find`, and `ls` Tool definitions;
- `AgentSession`, `SessionManager`, session entries, branching, compaction integration, and persistence choices;
- credentials, settings, model resolution, project trust, and project/global instruction loading;
- Extensions, Skills, prompt templates, themes, Pi Packages, and resource discovery;
- TUI components and rendering adapters for Agent events and Tool results.

The executable entry remains tiny:

```typescript
// packages/coding-agent/src/cli.ts (selected lines)
#!/usr/bin/env node
import { main } from "./main.ts";

main(process.argv.slice(2));
```

The work behind it crosses several product-owned components:

```text
you enter: pi "Help me fix this bug"
│
├── cli.ts                  parses argv
├── main.ts                 selects interactive, print, JSON, or RPC mode
├── resource/model setup    loads instructions, Extensions, Skills, and Models
├── AgentSession            assembles Tools, settings, and session history
├── Agent                   owns live state and queues
└── agentLoop()             streams model output and executes Tools
```

The coding package exports `AgentSession`, `createAgentSession()`, Extension types, Tool factories, resource loaders, and session types. It does not export a type named `CodingAgentMessage`. Coding Agent keeps using `AgentMessage`; application-specific messages join that union through `CustomAgentMessages` declaration merging and are converted to model-layer `Message[]` before a provider call.

### 2.4 pi-tui: in charge of “display”

`@earendil-works/pi-tui`, in `packages/tui/`, is a terminal UI library with differential rendering. It exports components such as `Markdown`, `Text`, `Editor`, `SelectList`, `ScrollView`, stacks, terminal abstractions, keyboard handling, image rendering, and width-aware string utilities.

Its runtime dependencies at the pinned revision are `marked` and `get-east-asian-width`. It has no runtime dependency on `pi-ai`, `pi-agent-core`, or `pi-coding-agent`. Coding Agent depends on TUI and adapts runtime events into components, but the TUI package does not know what an Agent, Model, Provider, or session is. That makes it orthogonal to the three-layer dependency model rather than a fourth layer on top.

### 2.5 pi-server: an experimental service boundary

The fifth role is an optional service boundary spread across three packages. `@earendil-works/pi-client` exports the transport-neutral `Client`: the application supplies an ordered byte transport, while the client performs the version handshake, tracks the live route, and correlates requests. `createClientServiceTransport()` adapts a lazily resolved server or Session target to a Chord transport; `Client` itself does not build typed service proxies or interpret application contracts.

`@earendil-works/pi-protocol` defines `PROTOCOL_VERSION`, strict routed envelopes, definite-length CBOR encoding, and four-byte length-prefixed byte-stream framing. A server request targets `{ serverId }`; a Session request targets the durable identity plus the live presentation capability `{ serverId, sessionId, attachmentId }`. Envelope schemas reject unknown fields and require opaque payloads to be strict JSON. They intentionally do not understand the payload grammar.

That semantic boundary belongs to Chord and the application. Chord owns service calls, control parsing, bindings, catalogues, subscriptions, snapshots and updates, and the Delta codecs used for replicated state. The application decides what those services mean—for example management, a transcript, or a model catalogue—while `pi-protocol` only carries their values as opaque strict JSON.

`@earendil-works/pi-server` routes server-scoped services through an application-supplied `RoutedServerServiceHost` and Session-scoped services through a `RoutedSessionHandle` acquired for a presentation attachment. The server validates the route before forwarding an opaque invocation. The actual `Session` and Agent Harness stay process-local: neither JavaScript object crosses the protocol boundary, and the host retains Session, worker, and Harness lifecycle policy.

Disconnect, disposal, and retry policy are deliberately visible. A disconnect or disposal rejects pending work locally and clears the live attachment route, but work already accepted may still finish remotely before the server releases that attachment. There is no automatic reconnect and no request replay; the application must reconnect, attach again through its management service, and repeat only operations it knows are safe.

> **Experimental boundary:** These packages are experimental and carry no compatibility guarantee. They are an optional sibling integration boundary, not a fourth mandatory SDK layer, not a stable end-to-end server product, and not the retired multi-Agent orchestrator.

Telemetry, evaluation, and SQLite session-backend packages make still other boundaries explicit. They matter when their contracts enter a design, but they do not erase the three-layer teaching model.

---

## 3. A first architectural model

The core stack now has a recognizable shape:

```text
┌──────────────────────────────────────────────────────────┐
│ @earendil-works/pi-coding-agent                          │
│ product policy: CLI, sessions, resources, Tools, UI      │
├──────────────────────────────────────────────────────────┤
│ @earendil-works/pi-agent-core                            │
│ runtime mechanics: Agent state, loop, queues, events     │
├──────────────────────────────────────────────────────────┤
│ @earendil-works/pi-ai                                    │
│ model boundary: Models, Provider, Model, Message, stream │
└──────────────────────────────────────────────────────────┘

Beside the stack:
  @earendil-works/pi-tui       reusable terminal UI
  pi-client/protocol/server    optional experimental service boundary
```

A normal request makes the division concrete. Coding Agent reads input and project resources, then asks Agent Core to prompt. Agent Core applies `transformContext`, converts its `AgentMessage[]` to model `Message[]`, and calls the injected `StreamFn`. Pi AI finds the provider that owns the selected `Model`, resolves auth, and opens the stream. Agent Core consumes events and executes requested `AgentTool`s. Coding Agent renders the events and records session entries. Provider payloads remain inside Pi AI; UI and storage policy remain inside Coding Agent.

That looks like a clean bottom-middle-top stack. The package manifests reveal a detail that a strict adjacent-layer drawing hides.

---

## 4. Open package.json, things are not so simple

> **Reading path:** Sections 4 and 5 go deeper into dependency direction and TypeScript types. Read them before building on the SDK. If you only need to choose a package for a small Agent, Section 6 gives the practical decision table.

The coding package depends directly on all three foundational packages in the teaching stack. This selected manifest excerpt shows those dependencies:

```jsonc
{
  "dependencies": {
    // Selected foundational dependencies from package.json at f07218c.
    "@earendil-works/pi-agent-core": "^0.87.1",
    "@earendil-works/pi-ai": "^0.87.1",
    "@earendil-works/pi-tui": "^0.87.1"
  }
}
```

The full manifest also lists `@earendil-works/pi-client` and `@earendil-works/pi-protocol`. They support client/protocol boundaries outside this three-layer teaching stack; the excerpt is not the complete `dependencies` object.

`pi-coding-agent` reaches past the middle layer to `pi-ai`. This is allowed. The architecture promises one-way dependencies, not adjacency-only imports.

### The answer is hiding in the type system

Some direct imports exist because public product APIs mention `Model`, `Provider`, `Usage`, `Context`, `ImageContent`, and other Pi AI types. TypeScript must resolve those types even when a given import disappears from emitted JavaScript.

The dependency is also present at runtime. Coding Agent compares models, extracts message content, creates IDs, retries assistant calls, and implements `ModelRuntime` and `ModelRegistry` over Pi AI contracts. Describing the edge as “only a type re-export” would be inaccurate at `f07218c`.

Agent Core shows the progressive foundation most clearly:

```typescript
// packages/agent/src/types.ts (imports abridged, f07218c)
import type {
  Api,
  AssistantMessageEventStream,
  ImageContent,
  JsonValue,
  Message,
  Model,
  SimpleStreamOptions,
  TextContent,
  Tool,
  ToolResultMessage,
  TranscriptContext,
  Usage,
} from "@earendil-works/pi-ai";
```

`Message`, `Model`, `Tool`, and normalized `TranscriptContext` are the atoms used to state the Agent runtime contract. Agent Core adds its own state, execution, queues, and events. Coding Agent may use both sets because it assembles the product.

### So what is the actual layering rule?

> **Lower-layer code must not reference an upper-layer symbol.**

The rule gives three concrete checks:

- Pi AI must not import Agent Core or Coding Agent.
- Agent Core may import Pi AI, but it must not import Coding Agent product policy.
- Coding Agent may import either lower package and the orthogonal TUI library.

Direct access from the top to the bottom preserves the direction. A violation would look like `packages/ai/src/index.ts` importing `AgentState`, or Agent Core choosing Coding Agent's session directory and permission UI.

The dependency arrows below point from a reusable dependency toward its consumer:

```text
@earendil-works/pi-ai ───────→ @earendil-works/pi-agent-core
          │                                │
          └────────────────────────────────┼──→ @earendil-works/pi-coding-agent
                                           │
@earendil-works/pi-tui ────────────────────┘

@earendil-works/pi-protocol ──→ @earendil-works/pi-client
@earendil-works/pi-protocol ──→ @earendil-works/pi-server
@earendil-works/pi-agent-core ─→ @earendil-works/pi-server
@earendil-works/pi-client ─────→ @earendil-works/pi-coding-agent
@earendil-works/pi-protocol ───→ @earendil-works/pi-coding-agent
```

The diagram makes two limits visible. First, the three layers describe dependency direction for the model, runtime, and coding-product responsibilities; they do not classify every monorepo package. Second, Coding Agent's direct client and protocol dependencies support its experimental service integration; the experimental client/protocol/server packages do not sit above Coding Agent as another layer. They route opaque Chord service traffic to application-owned, process-local capabilities.

---

## 5. Type progression between layers: from atoms to molecules and materials

Dependency arrows show who may know whom. Type definitions show what each layer adds.

### Layer 1: pi-ai defines the atoms

Pi AI declares the smallest provider-neutral shapes. The following excerpt is shortened, but every shown member matches the pinned source:

```typescript
type Message = SystemMessage | UserMessage | AssistantMessage | ToolResultMessage;

interface Model<TApi extends Api> {
  id: string;
  name: string;
  api: TApi;
  provider: ProviderId;
  baseUrl: string;
  reasoning: boolean;
  input: ("text" | "image")[];
  contextWindow: number;
  maxTokens: number;
}

interface Tool<TParameters extends TSchema = TSchema> {
  name: string;
  description: string;
  parameters: TParameters;
  constrainedSampling?: false | ConstrainedSamplingConfig;
}
```

`Tool` describes a callable schema for the model. It has no `execute()` method and no terminal renderer. `Message` is the closed LLM-facing union. `Model` identifies both a provider and an API protocol, so `Models` can delegate the stream to the correct `Provider`.

### Layer 2: pi-agent-core composes the atoms into molecules

Agent Core keeps those atoms and adds runtime capability:

```typescript
type AgentMessage =
  | Message
  | CustomAgentMessages[keyof CustomAgentMessages];

interface AgentTool<
  TParameters extends TSchema = TSchema,
  TDetails = any,
> extends Tool<TParameters> {
  label: string;
  prepareArguments?: (args: unknown) => Static<TParameters>;
  execute(
    toolCallId: string,
    params: Static<TParameters>,
    signal?: AbortSignal,
    onUpdate?: AgentToolUpdateCallback<TDetails>,
  ): Promise<AgentToolResult<TDetails>>;
  replay?: "never" | "safe";
  executionMode?: "sequential" | "parallel";
}
```

`AgentMessage` opens the transcript to application-defined messages through declaration merging. Before an LLM call, `convertToLlm` must turn that broader union back into Pi AI's `Message[]`. `AgentTool` extends the model-facing schema with a label, optional argument preparation, execution, streaming updates, a recovery policy, and a per-Tool execution mode. Its `replay` field applies when durable intent exists but the outcome is unknown: omitting it or setting `never` prevents replay, while `safe` permits recovery only when the persisted call state also records a safe replay. The Agent loop can now run what the model requested.

### Layer 3: pi-coding-agent builds molecules into materials

Coding Agent assembles types around a complete user workflow. `AgentSession` coordinates the live Agent with settings, model runtime, resource loading, Extensions, and `SessionManager`. Session entries preserve messages plus model changes, thinking-level changes, compaction records, branch summaries, and custom entries. `ResolvedResource` and related diagnostics record where Skills, prompt templates, themes, and instruction files came from.

For Tools, the product-facing `ToolDefinition` is deliberately separate from `AgentTool`. Their model-facing metadata overlaps, but their execution signatures do not: `ToolDefinition.execute` requires a fifth `ctx: ExtensionContext` parameter. A `ToolDefinition` therefore cannot be passed directly to Agent Core as an `AgentTool`.

```typescript
// Selected exact fields and signatures from extensions/types.ts at f07218c.
export interface ToolDefinition<
  TParams extends TSchema = TSchema,
  TDetails = unknown,
  TState = any,
> {
  name: string;
  label: string;
  description: string;
  promptSnippet?: string;
  promptGuidelines?: string[];
  parameters: TParams;
  constrainedSampling?: false | ConstrainedSamplingConfig;
  renderShell?: "default" | "self";
  prepareArguments?: (args: unknown) => Static<TParams>;
  executionMode?: ToolExecutionMode;
  execute(
    toolCallId: string,
    params: Static<TParams>,
    signal: AbortSignal | undefined,
    onUpdate: AgentToolUpdateCallback<TDetails> | undefined,
    ctx: ExtensionContext,
  ): Promise<AgentToolResult<TDetails>>;
  renderCall?: (
    args: Static<TParams>,
    theme: Theme,
    context: ToolRenderContext<TState, Static<TParams>>,
  ) => Component;
  renderResult?: (
    result: AgentToolResult<TDetails>,
    options: ToolRenderResultOptions,
    theme: Theme,
    context: ToolRenderContext<TState, Static<TParams>>,
  ) => Component;
}
```

The product boundary becomes a runtime Tool through an explicit adapter in `packages/coding-agent/src/core/tools/tool-definition-wrapper.ts`:

```typescript
// Selected from tool-definition-wrapper.ts at f07218c.
export function wrapToolDefinition<TDetails = unknown>(
  definition: ToolDefinition<any, TDetails>,
  ctxFactory?: () => ExtensionContext,
): AgentTool<any, TDetails> {
  return {
    name: definition.name,
    label: definition.label,
    description: definition.description,
    parameters: definition.parameters,
    constrainedSampling: definition.constrainedSampling,
    prepareArguments: definition.prepareArguments,
    executionMode: definition.executionMode,
    execute: (toolCallId, params, signal, onUpdate, ctx?: ExtensionContext) =>
      definition.execute(
        toolCallId,
        params,
        signal,
        onUpdate,
        ctx ?? (ctxFactory?.() as ExtensionContext),
      ),
  };
}

// extensions/wrapper.ts, inside wrapRegisteredTool():
const tool = wrapToolDefinition(registeredTool.definition, () =>
  runner.createContext(),
);
```

The adapter copies the `AgentTool` fields and replaces `execute` with a function that supplies `ExtensionContext`. `wrapRegisteredTool()` provides `runner.createContext()` for Extension Tools; `wrapRegisteredTools()` applies that conversion to a list. `AgentSession._refreshToolRegistry()` collects registered and SDK Tool definitions, wraps them, and places the resulting `AgentTool`s in the runtime registry. Built-in factories use the same wrapper for the eight coding Tools: `read`, `bash`, `powershell`, `edit`, `write`, `grep`, `find`, and `ls`.

The loader also preserves the registrations from each loaded Extension as one aggregate. This is the current interface, with no fields omitted:

```typescript
// packages/coding-agent/src/core/extensions/types.ts at f07218c.
export interface Extension {
  path: string;
  resolvedPath: string;
  hidden?: boolean;
  sourceInfo: SourceInfo;
  handlers: Map<string, HandlerFn[]>;
  tools: Map<string, RegisteredTool>;
  messageRenderers: Map<string, MessageRenderer>;
  markdownTransformer?: MarkdownTransformer;
  entryRenderers?: Map<string, EntryRenderer>;
  commands: Map<string, RegisteredCommand>;
  flags: Map<string, ExtensionFlag>;
  shortcuts: Map<KeyId, ExtensionShortcut>;
}
```

`createExtension()` initializes those maps before it calls the Extension factory. Methods on `ExtensionAPI` then write each registration into the matching collection: `pi.on()` adds handlers, `pi.registerTool()` adds a `RegisteredTool`, and the renderer, command, flag, and shortcut methods fill their corresponding maps. If the factory finishes, `commit()` applies pending runtime changes and the loader returns the aggregate. If the factory throws, `discard()` invalidates the loading API and no `Extension` is returned.

At runtime, `ExtensionRunner` dispatches event handlers with a fresh context, resolves message and entry renderers, exposes commands and flags, and resolves shortcut conflicts. For Tools, it returns the first registration for each name; `AgentSession` sends those definitions through the adapter described above. A registration made while the runtime is active calls `refreshTools()`, so the runtime registry and active Tool set can be rebuilt without treating the loaded `Extension` object itself as an `AgentTool`.

There is no `CodingAgentMessage` rung in this ladder. Coding Agent uses `AgentMessage` for the live transcript and defines `SessionEntry` variants for durable product history. Keeping those concepts separate prevents a storage record from masquerading as something an LLM can consume.

### Before → After comparison of the type extension

The Tool path provides the shortest field-by-field comparison:

```text
Before, in pi-ai: Tool describes what the model may call
────────────────────────────────────────────────────────
name + description + parameters + constrainedSampling

            ↓ Agent Core adds runtime capability

After, in pi-agent-core: AgentTool can run
────────────────────────────────────────────────────────
Tool fields + label + prepareArguments + execute + executionMode

            ↓ Coding Agent defines product execution and rendering

After, in pi-coding-agent: ToolDefinition describes the product Tool
────────────────────────────────────────────────────────
shared Tool metadata + required ExtensionContext
+ promptSnippet + promptGuidelines
+ renderCall + renderResult

            ↓ wrapToolDefinition() supplies context and adapts execute

Runtime handoff: AgentTool enters Agent Core
────────────────────────────────────────────────────────
four-argument execute + the shared Tool metadata
```

The message path progresses differently: `Message` becomes the wider `AgentMessage` union, then Coding Agent stores it inside session entries and renders custom variants. Type progression may use inheritance, unions, composition, or an explicit adapter. The invariant is ownership: each layer adds only the information needed for its responsibility, then converts back to the contract required by the lower layer.

---

## 6. Do I need three layers when writing my own Agent?

The answer depends on the product you are building. Three scenarios make the trade-off concrete.

### Scenario A: no layering, everything in one file

```typescript
// Conceptual pseudocode: a deliberately unlayered Agent.
import OpenAI from "openai";

const client = new OpenAI();
const messages = [];

while (true) {
  const response = await client.chat.completions.create({
    model: "gpt-4o",
    messages,
  });
  // Parse Tool calls, execute them, append results, and continue.
}
```

This can serve a tiny experiment. As provider requests, Tool execution, state, storage, and UI accumulate in the same module, a change in one concern forces readers to inspect all the others. Merge conflicts are a symptom; the deeper cost is that none of the pieces has an independent contract.

### Scenario B: only two layers, without the coding-agent product

```typescript
import { Agent } from "@earendil-works/pi-agent-core";
import { createModels } from "@earendil-works/pi-ai";
import { anthropicProvider } from "@earendil-works/pi-ai/providers/anthropic";

const models = createModels();
models.setProvider(anthropicProvider());

const model = models.getModel("anthropic", "claude-sonnet-4-6");
if (!model) throw new Error("Model not found");

const agent = new Agent({
  initialState: { systemPrompt: "Help the operator.", model },
  streamFn: models.streamSimple.bind(models),
});
```

This is a good fit for a domain-specific Agent. Agent Core supplies state, the loop, Tool execution, queues, and events. Your application supplies its own `AgentTool`s, entry point, session policy, permissions, and UI. You avoid inheriting coding-assistant policy that the product does not need.

### Scenario C: only one layer, pi-ai

```typescript
import { createModels } from "@earendil-works/pi-ai";
import { anthropicProvider } from "@earendil-works/pi-ai/providers/anthropic";

const models = createModels();
models.setProvider(anthropicProvider());

const model = models.getModel("anthropic", "claude-sonnet-4-6");
if (!model) throw new Error("Model not found");

const stream = models.streamSimple(model, {
  messages: [{ role: "user", content: "Explain dependency direction.", timestamp: Date.now() }],
});

for await (const event of stream) {
  if (event.type === "text_delta") process.stdout.write(event.delta);
}
```

Pi AI works by itself when you need one model exchange or want to write the control flow yourself. You own message state, repeated turns, Tool execution, queues, and termination.

### Dependency direction matters more than the number of layers

The scenarios lead to a practical choice:

| Scenario | Best fit | What your code still owns |
| --- | --- | --- |
| Pi AI only | Model calls without a reusable Agent loop | State, loop, Tool execution, termination |
| Pi AI + Agent Core | A domain-specific Agent | Product Tools, entry point, storage, permissions, UI |
| All three layers | A coding assistant or Pi Extension | Product-specific changes and integrations |

Whichever shape you choose, keep lower packages free of upper-product knowledge. Agent Core should not import the application that embeds it, and Pi AI should not import either Agent Core or that application. Injection points such as `streamFn`, context transforms, hooks, and Tool implementations let higher layers supply behavior without pushing their policy downward.

That rule does not promise that any lower package can be replaced without adaptation. Agent Core's public contract explicitly uses Pi AI's `Model`, `Message`, normalized `TranscriptContext`, and stream types. It does promise that removing an upper product leaves its lower dependencies independently usable.

A related placement guide from the same rule is useful during code review:

| Change | Owning boundary |
| --- | --- |
| Add a provider-specific request header | Pi AI provider or request transform |
| Filter an application-only message before a model call | Agent `convertToLlm` boundary |
| Block a dangerous shell command | Coding Tool policy or Extension |
| Add a terminal panel | Coding Agent, using Pi TUI primitives |
| Store sessions in another backend | Application/session integration |

---

## 7. Three portable methods

Pi's package graph offers three methods that transfer to other Agent projects.

### Method 1: the “dependency funnel”

Draw dependency arrows before choosing directory names. Put provider-neutral concepts and transport contracts at the narrow end. Put reusable state and control flow above them. Put user, storage, permission, and presentation policy at the wide product end.

Use four steps:

1. Find code that can operate without product knowledge. That is a lower-layer candidate.
2. Find code that depends on those contracts but still does not know the user's concrete workflow. That is a runtime candidate.
3. Find code that decides what the user sees, what resources load, what permissions apply, and what persists. That belongs in the product.
4. Search lower source trees for upper-package imports. Each match needs either removal or an explicit boundary redesign.

The quick verification question is: if the upper application disappears, can the lower package still build and serve its stated purpose? Pi AI can stream without Agent Core. Agent Core can run an Agent without Coding Agent. TUI can render a terminal application without any AI package.

### Method 2: the “progressive type extension” pattern

Start with the smallest type that the lowest owner can defend. Let a higher layer add capability through a union, `extends`, composition, or an explicit adapter.

1. The transport layer defines atoms such as `Message`, `Model`, and schema-only `Tool`.
2. The runtime broadens `Message` to `AgentMessage` and adds execution to form `AgentTool`.
3. The product stores Agent messages in session records and defines Tools with prompts, a required `ExtensionContext`, and renderers.
4. Before passing data downward, convert it back to the lower contract. `convertToLlm` handles messages; `wrapToolDefinition()` handles product Tool definitions.

This keeps the lower package publishable and reusable. It also names lossy boundaries. A custom application message cannot silently reach a provider; the conversion step must filter or translate it.

### Method 3: the “independently usable” test

Test each package without its consumers. Remove upper-layer dependencies from the test environment, then compile and exercise the lower package's public job.

- Pi AI should construct a `Models` collection, register a `Provider`, select a `Model`, and stream a `Context` without Agent Core.
- Agent Core should run with injected streaming and Tool implementations without Coding Agent.
- Pi TUI should render components without importing an AI domain type.
- Coding Agent is the assembled product, so it is expected to depend on the lower packages.

Use the package manifest and source-import graph as evidence. A passing application test can hide an upward dependency because the full monorepo makes every workspace available. The isolated package test exposes it.

---

## 8. Next step: drill into the Agent's heart

This map gives you the coordinates for the next source tour. Pi AI owns `Models`, `Provider`, `Model`, `Message`, and provider streams. Agent Core owns `Agent`, `AgentMessage`, `AgentTool`, state, queues, events, and the loop. Coding Agent owns sessions, Extensions, coding Tools, resources, and the product UI. Pi TUI remains reusable beside the stack, while the experimental client/protocol/server siblings carry opaque Chord services to application-owned, process-local capabilities.

Chapter 3 follows one prompt through the Agent Loop: why a loop is needed, how streaming events update state, how Tool calls become results, how queued messages enter the next turn, and how the run terminates.

> **Reading order:** Chapters 1–6 build the core mechanism in sequence. Chapters 7 onward isolate advanced engineering concerns and can be read as focused references.

> **Version note:** This chapter describes Pi `0.87.1` at commit `f07218c4d4bbc12bef056a7058c3dd49dfe41abe`. Package names, exports, dependencies, and experimental labels were checked against that revision.

> **Next up:** [Chapter 3: Agent Loop](ch03-agent-loop.md)
