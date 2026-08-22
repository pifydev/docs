---
title: 'Chapter 2: Three-Layer Architecture: Pi-Agent Project Skeleton'
translation_key: ch02-three-layer-arch
language: en
chapter: 2
source_url: 'https://www.dgzhuya.com/modules/ch02-three-layer-arch'
official_refs:
  - 'https://pi.dev/docs/latest/index'
  - 'https://pi.dev/docs/latest/quickstart'
  - 'https://pi.dev/docs/latest/usage'
  - 'https://pi.dev/docs/latest/providers'
  - 'https://pi.dev/docs/latest/settings'
  - 'https://pi.dev/docs/latest/extensions'
  - 'https://pi.dev/docs/latest/skills'
  - 'https://pi.dev/docs/latest/packages'
  - 'https://pi.dev/docs/latest/models'
  - 'https://pi.dev/docs/latest/security'
  - 'https://pi.dev/docs/latest/keybindings'
  - 'https://pi.dev/docs/latest/sessions'
  - 'https://pi.dev/docs/latest/compaction'
terms_used:
  - Pi Agent
  - Agent Loop
  - Tool System
  - Tool
  - TUI
  - MCP
  - Provider
  - KnownProvider
  - Skills
  - Extensions
  - Pi Package
  - Theme
  - SDK
  - DAG
  - Hot Reload
  - pi-ai
  - pi-agent-core
  - pi-coding-agent
  - pi-tui
  - pi-orchestrator
  - monorepo
  - npm workspaces
  - TypeScript
  - TypeBox
  - Static
  - TSchema
status: translated
last_updated: '2026-08-20'
translator: pi-docs-bot
reviewed_by: null
code_blocks: 16
code_lines: 203
mermaid_blocks: 0
---
> In this chapter, we step back and look at Pi''s overall architecture: where the code lives, how the packages depend on each other, and how types flow between layers. Once you have this full picture, drilling into any single module later will not get you lost.

---

## 1. You just opened an Agent codebase

Suppose you just cloned Pi''s repository and typed `ls` in the terminal. This is the directory layout you would see:

```
repo/
├── packages/
│ ├── ai/ ← @earendil-works/pi-ai
│ ├── agent/ ← @earendil-works/pi-agent-core
│ ├── coding-agent/ ← @earendil-works/pi-coding-agent
│ ├── orchestrator/ ← @earendil-works/pi-orchestrator(Experimental, Much Agent Arrange)
│ └── tui/ ← @earendil-works/pi-tui
├── package.json ← root configuration, npm workspaces
└── tsconfig.json
```

Five packages, lined up neatly.

> Note 1: A `pi-web-ui` package used to exist (a browser-side Lit component library), but it was removed as a workspace in commit `b141e1fa` on 2026-05-20; the current repository no longer contains it.
> Note 2: `pi-orchestrator` is an experimental orchestration package added in v0.80.x. It depends on `pi-coding-agent` and handles multi-agent coordination, RPC inter-process communication, and Supervisor monitoring. It belongs to the **outer orchestration layer**, not the "core three-piece set" learning path, and is described separately at the end of this module.

If you have worked on Node.js projects before, you have probably used a monorepo (multiple packages managed in one repository). Pi uses the standard npm workspaces approach: the root `package.json` declares `"workspaces": ["packages/*"]`, and npm automatically treats each subdirectory under `packages/` as an independent package.

But that is not the point. The point is: **why five packages (four extending the core three-piece set, plus one outer orchestration layer)? What is the relationship between them? Can they be merged?**

To answer that, we need to figure out what each package does.

---

## 2. Five packages, each with a job

Ignore dependency relationships for now. Look at each package from its own point of view and see what it is doing.

### 2.1 pi-ai: in charge of "calling models"

`@earendil-works/pi-ai` (source at `packages/ai/`) answers the question: **how do you call different LLMs with one codebase?**

Its `package.json` carries a one-line description:

> "Unified LLM API with automatic model discovery and provider configuration."

Concretely, it does three things:

1. **Define unified types**: whether you use OpenAI, Anthropic, Google, or AWS Bedrock, the message format is the same: `UserMessage`, `AssistantMessage`, `ToolResultMessage`, and the model definition is `Model<TApi>`.
2. **Unify streaming calls**: every provider''s call route is collapsed into a single `streamSimple()` function that returns an `AssistantMessageEventStream` (a stream you can read token by token).
3. **Adapt 30+ providers**: it supports more than 30 providers, from OpenAI, Claude, and Gemini to DeepSeek, Groq, Xiaomi, etc., with one adapter file per provider.

Just look at what its `index.ts` exports:

```
// packages/ai/src/index.ts(v0.80.x excerpt)
// The top comment clearly says: Core only, side-effect free: no generated catalogs,
// no provider factories, no api-registry, no OAuth implementations, no compat.
// overall API Registry, stream/complete Functions etc. have been moved to ./compat.ts(packages/ai/src/compat.ts)
export type { Static, TSchema } from "typebox";
export { Type } from "typebox";
export * from "./api/lazy.ts" // each Provider API Lazy loading entry
export * from "./auth/context.ts" // Authentication context
export * from "./auth/credential-store.ts"
export * from "./auth/helpers.ts"
export * from "./auth/types.ts"
export * from "./images-models.ts"
export * from "./models.ts" // Model definition(KnownProvider 35 a)
export * from "./types.ts" // unified type
export * from "./utils/event-stream.ts" // event stream base class
// Streaming call entrance(stream / streamSimple)actually located in ./compat.ts
```

No "agent", no "tool", no "loop". It only does one thing: **flatten the differences between LLM APIs and expose a single unified interface**.

### 2.2 pi-agent-core: in charge of "running the loop"

`@earendil-works/pi-agent-core` (source at `packages/agent/`) answers the question: **how do you make an LLM think and act repeatedly?**

Its `package.json` description is:

> "General-purpose agent with transport abstraction, state management, and attachment support."

The key word is **"general-purpose"**. This package does not know whether it is powering a coding Agent, a customer-service Agent, or any other domain-specific Agent. It only knows:

- How to maintain conversation state (`AgentState`)
- How to run a "call LLM → execute tools → call LLM again" loop (`agentLoop`)
- How to emit events during the loop so external observers know what is happening (`AgentEvent`)
- How to manage session history and do context compaction (`Session`, `compact`)

Look at its `index.ts` exports:

```
// packages/agent/src/index.ts(excerpt)
export * from "./agent.js" // Agent class
export * from "./agent-loop.js" // loop function
export * from "./harness/session/..." // Session management
export * from "./harness/compaction/..." // Context compression
export * from "./types.js" // type definition
```

No "read" (reading files), no "bash" (running commands), no "edit" (editing code). It does not care what the Agent does, only "how to run an Agent".

### 2.3 pi-coding-agent: in charge of "the actual product"

`@earendil-works/pi-coding-agent` (source at `packages/coding-agent/`) answers the question: **how do you build a coding assistant?**

Its `package.json` description is:

> "Coding agent CLI with read, bash, edit, write tools and session management"

This layer is the "thickest": over a hundred source files, more than the previous two layers combined. Because it knows everything concrete:

- How the 7 coding tools (read, bash, edit, write, grep, find, ls) are implemented
- How the Extension system loads and runs
- How sessions are persisted to disk
- How the CLI parses arguments and renders output in the terminal
- How authentication credentials are stored

Its entry point is `cli.ts`, the file that fires when the user types `pi` in the terminal:

```
// packages/coding-agent/src/cli.ts
#!/usr/bin/env node
import { main } from "./main.js";
main(process.argv.slice(2));
```

A tiny entry, but a complete startup chain behind it:

```
you enter: pi "Help me change it bug"
│
├── cli.ts ← Parse command line parameters
│ └── main.ts ← Create session, Select operating mode(interaction/Print/RPC)
│ └── AgentSession ← Assembly tools, Load extension
│ └── Agent ← Management status, Run loop
│ └── agentLoop() ← core loop starts
```

### 2.4 pi-tui: in charge of "display"

The last package is the UI layer:

- **pi-tui**: a terminal UI library responsible for rendering Markdown, syntax highlighting, and differential display in the terminal. Its `dependencies` contain **no AI-related packages**: the runtime only has `marked` (Markdown rendering) plus `get-east-asian-width` (East-Asian character-width calculation); `chalk` and `@xterm/headless` are devDependencies and are not bundled at runtime.

This package has nothing to do with "how an Agent works". It only renders what the Agent is doing so the user can see it. We will not go deep into this layer later in the book.

### 2.5 pi-orchestrator: in charge of "multi-Agent orchestration" (experimental)

`@earendil-works/pi-orchestrator` (source at `packages/orchestrator/`) is an **experimental** package added in v0.80.x. It answers: **how do you make multiple coding-agent instances cooperate?**

Its core consists of a handful of files:

- `supervisor.ts`: the supervisor that manages child Agents'' lifecycles
- `rpc-process.ts`: RPC-based inter-process communication
- `radius.ts`: scope/boundary control for orchestration
- `serve.ts` / `storage.ts`: service exposure and state persistence

Note its positioning: it **depends on `pi-coding-agent`** and sits above coding-agent. It implements none of the Agent core logic itself (the loop, state, and compaction still come from agent-core). It just "weaves" multiple coding-agent instances together so they can divide work, communicate, and be supervised.

> ⚠️ This capability is experimental; both the API and the file layout may change. The learning path only covers the core three-piece set (ai / agent-core / coding-agent); orchestrator can wait for an advanced section.

---

## 3. After reading five packages, you have an intuition

After reading the section above, you probably have a picture in your head already:

```
┌─────────────────────────────────────────────┐
│ pi-coding-agent: I know how to write code │ ← Know best about business
│ (Tools, Expand, CLI, Session persistence) │
├─────────────────────────────────────────────┤
│ pi-agent-core: i know how to run Agent │ ← Only understand the framework
│ (loop, Status, event, Compression) │
├─────────────────────────────────────────────┤
│ pi-ai: I know how to tune the model │ ← Only understand models
│ (unify API, Streaming call, 30+ Provider adaptation) │
└─────────────────────────────────────────────┘

There is also a separate one next to it UI package: 
┌──────────┐
│ pi-tui │ ← Just show
└──────────┘
```

A intuitive layering: the bottom calls models, the middle runs the loop, the top handles the business. Right?

But wait :

---

## 4. Open package.json, things are not so simple

> **Reading path hint**: Sections 4-5 are **advanced architecture understanding**, going into dependency relationships and type-flow details. Section 4 corrects the common misconception of "strict layering" and clarifies the dependency direction: **a must-read if you plan to build on top of the SDK**. Section 5 expands on the three-layer type progression; it leans more on TypeScript system details and you can forget field names without hurting later learning. **If you only want to get up and running quickly, you can skip these two sections and jump to Section 6 to see "how the layering promise holds".**

If your mental model says "upper layers may only depend on the adjacent lower layer", then opening `packages/coding-agent/package.json` and looking at the `dependencies` field, you will see one unexpected detail:

```
// packages/coding-agent/package.json
"dependencies": {
 "@earendil-works/pi-agent-core": "^0.80.2", // ← Depend on middle layer, reasonable
 "@earendil-works/pi-ai": "^0.80.2", // ← Also depends directly on the underlying？
 "@earendil-works/pi-tui": "^0.80.2",
 // ... Other dependencies
}
```

pi-coding-agent depends on **both** the middle layer (pi-agent-core) **and** the bottom layer (pi-ai). That looks like a violation of "strict layering", but it is a deliberate design choice.

### The answer is hiding in the type system

A `import` statement at the top of a `.ts` file is not the only way a package "depends on" another. With TypeScript''s structural type system, **type references are also dependencies**, even when runtime calls do not exist.

The reason pi-coding-agent reaches for pi-ai is type-level:

- pi-coding-agent needs to **expose pi-ai''s types in its own public API** (e.g., `Model`, `Provider`, `Usage`, `StopReason`).
- These types are then re-exported so third-party Extensions can construct model objects without depending on pi-ai directly.

In short, pi-coding-agent does **use** pi-agent-core at runtime (to run the Agent loop) but only **re-exports types from** pi-ai (so extensions get a one-stop import surface).

You can verify this by opening `packages/agent/src/types.ts`: almost every base type pi-agent-core needs comes from pi-ai:

```
// packages/agent/src/types.ts:1-14
import type {
 Api,
 AssistantMessage,
 AssistantMessageEvent,
 AssistantMessageEventStream,
 Context,
 ImageContent,
 Message,
 Model,
 SimpleStreamOptions,
 TextContent,
 Tool,
 ToolResultMessage,
} from "@earendil-works/pi-ai";
```

pi-agent-core''s type definitions import a large number of base types from pi-ai: `Message`, `Model`, `ImageContent`, `Tool`... These are the "atomic concepts" of the entire system: like chemical elements, every layer needs the definition of its "atoms".

### So what is the actual layering rule?

Stop thinking of "layering" as "may only depend on adjacent layers". The real rule is one-way:

> **Lower-layer code must not reference any upper-layer symbol.**

That is:

- pi-ai may not import anything from pi-agent-core or pi-coding-agent.
- pi-agent-core may not import anything from pi-coding-agent.
- pi-coding-agent may import anything below it (which it does).

The asymmetry is allowed because "depending on a lower layer" at runtime is only the most obvious case; the dependency-direction rule cares about "the lower layer cannot know the upper layer".

> Counter-example: if pi-ai''s `index.ts` contained `import { AgentState } from "@earendil-works/pi-agent-core"`, that would be a layering violation. But pi-ai never carries any such import: verified by `grep -r "@earendil-works/pi-agent-core\|@earendil-works/pi-coding-agent" packages/ai/src/`, which returns no matches.

So the layering rule is not "adjacent-only". It is "**strictly one-direction: lower does not know upper**".

Visualized, the dependency direction looks like this:

```
pi-ai(Ground floor)
 ↑ ↑
 │ │
 │ pi-agent-core(middle layer)
 │ ↑
 │ │
 └─── pi-coding-agent(top level)
 ↑
 │
 pi-orchestrator(Experimental Peripheral Orchestration Layer, Optional)
```

All the arrows point up. **The bottom layer never knows about the upper layer**: there is no import in pi-ai''s code that points to pi-agent-core or pi-coding-agent; orchestrator does not penetrate back into coding-agent either. That is the real rule of layering: **it does not restrict the depth of references, but ensures the dependency direction is strictly one-way upward.**

---

## 5. Type progression between layers: from atoms to molecules

Now that the dependency rule is clear, we can use the type system to make the progression between layers even more concrete.

### Layer 1: pi-ai defines the atoms

In pi-ai, a `Tool` is the smallest possible tool unit: only enough fields to describe what the tool is:

```
// packages/ai/src/types.ts(excerpt)
// The most basic message type:all LLM A format that everyone recognizes
type Message = UserMessage | AssistantMessage | ToolResultMessage

// Model definition:describe a LLM All information of
interface Model<TApi> {
 id: string // Such as "claude-sonnet-4-6"
 name: string
 api: TApi // Such as "anthropic-messages"
 contextWindow: number // Such as 200000
 // ... More fields
}

// Tool definition:Describe a tool schema
interface Tool<TSchema> {
 name: string
 description: string
 parameters: TSchema
}
```

That is all. No `execute`, no UI hint, no `approval`. It is just a **type-level description**.

### Layer 2: pi-agent-core composes the atoms into molecules

In pi-agent-core, `AgentTool` is built on top of `Tool`, with an execution function added:

```
// packages/agent/src/types.ts(excerpt)
import type {
 Message, Model, Tool, ImageContent, ...
} from "@earendil-works/pi-ai";

// extended message: In addition to the standard LLM news, You can also have custom messages
type AgentMessage = Message | CustomAgentMessages[keyof CustomAgentMessages]

// Extension tools: Except schema, There is also parameter preprocessing, Execution functions and execution modes(types.ts:371-394)
interface AgentTool<TParameters extends TSchema = TSchema, TDetails = any> extends Tool<TParameters> {
 label: string // display name
 prepareArguments?: (args: unknown) => Static<TParameters> // Parameter preprocessing
 execute: (toolCallId: string, params, signal?: AbortSignal, onUpdate?: AgentToolUpdateCallback<TDetails>) => Promise<AgentToolResult<TDetails>>
 executionMode?: ToolExecutionMode // "sequential" | "parallel"
}
```

`AgentTool` is a "molecule": it still has the `name`, `description`, and `parameters`, but it adds the ability to **run**. The Agent loop iterates over `AgentTool[]`, calls each tool''s `execute`, and feeds the result back into the model.

### Layer 3: pi-coding-agent builds molecules into materials

In pi-coding-agent, the final `ToolDefinition` wraps `AgentTool` with everything UI/permission-related:

```
// packages/coding-agent/src/core/extensions/types.ts:435-482(excerpt)
// Tool definition(Product perspective):The complete interface is 10+ fields, Key fields are listed below
// Note: ToolDefinition in TypeScript level is independent interface restate, 
// with AgentTool Yes"Architecturally compatible"rather than using extends inheritance(See details types.ts:435)
interface ToolDefinition<TParams extends TSchema, TDetails = unknown, TState = any> {
 name: string
 label: string // UI display name
 description: string
 promptSnippet?: string // Automatically spelled system prompt tool fragment
 promptGuidelines?: string[] // Tool usage guidelines
 parameters: TParams
 renderShell?: "default" | "self" // Rendering mode
 prepareArguments?: (args: unknown) => Static<TParams> // Parameter preprocessing hook
 executionMode?: ToolExecutionMode // Parallel/serial
 execute: (toolCallId, params, signal, onUpdate, ctx: ExtensionContext) => Promise<AgentToolResult<TDetails>> // Signature extension: Than AgentTool.execute Much ctx parameters
 renderCall?: ... // Custom call rendering
 // ... And the renderer, UI Components and other business attributes
}

// extended definition(runtime aggregate, types.ts:1585-1595)
interface Extension {
 path: string // Expansion path
 resolvedPath: string // The resolved absolute path
 sourceInfo: SourceInfo // Source information
 handlers: Map<string, HandlerFn[]> // Various types of processors
 tools: Map<string, RegisteredTool> // Registered tools(Map, Not Record)
 messageRenderers: Map<string, MessageRenderer> // message renderer
 commands: Map<string, RegisteredCommand> // Registered command(Map, Not Record)
 flags: Map<string, ExtensionFlag> // extension flag
 shortcuts: Map<KeyId, ExtensionShortcut> // Shortcut key bindings
}
```

This is the shape that pi-coding-agent''s actual 7 tools implement (`read`, `bash`, `edit`, `write`, `grep`, `find`, `ls`).

### Before → After comparison of the type extension

To make the progression concrete, here is the field-by-field type extension chain:

```
Before(pi-ai layer): Tool only know"what does it look like"
────────────────────────────────────────────
interface Tool<TSchema> {
 name: string
 description: string
 parameters: TSchema
}

 ↓ agent-core Expand

After(pi-agent-core layer): AgentTool know"How to execute"
────────────────────────────────────────────
interface AgentTool<TSchema> extends Tool<TSchema> {
 label: string ← New
 execute: (...) => Promise<AgentToolResult> ← New
 executionMode?: "sequential" | "parallel" ← New
}

 ↓ coding-agent Expand

After(pi-coding-agent layer): ToolDefinition plus"How to display"
────────────────────────────────────────────
interface ToolDefinition {
 // inheritance AgentTool All fields of
 // + Renderer, Business attributes such as permission control
}
```

---

## 6. Do I need three layers when writing my own Agent?

You might wonder: this Pi layering looks great, but is it overdesigned for my own Agent project?

Let us walk through three scenarios to see.

### Scenario A: no layering, everything in one file

```
// hypothesis: not layered Agent
import OpenAI from "openai";

const client = new OpenAI();
const messages = [];

while (true) {
 const response = await client.chat.completions.create({
 model: "gpt-4o",
 messages,
 });
 // Parsing tool call, execute, append to messages ...
}
```

Workable for tiny projects, but as soon as the Agent grows past ~1000 lines, every change becomes a nightmare: changing UI colors touches loop logic, changing the LLM provider touches tool execution. Merge conflicts pile up.

### Scenario B: only two layers (drop the coding-agent layer)

```
// Only use the bottom layer + middle layer
import { Agent, agentLoop } from "@earendil-works/pi-agent-core";
import { streamSimple } from "@earendil-works/pi-ai";
```

Better, but you re-implement CLI argument parsing and session management every time. And your tools become tightly coupled to your specific Agent scenario: they cannot be reused by other Agents.

### Scenario C: only one layer (only pi-ai)

```
// Only use the bottom layer
import { streamSimple } from "@earendil-works/pi-ai";

const stream = streamSimple(model, context);
for await (const event of stream) {
 console.log(event);
}
```

This is also perfectly fine. pi-ai is itself an independent package: calling the LLM, streaming the result, no Agent framework needed.

But then you would have to write the loop, manage message state, and handle tool calls yourself. That is exactly why pi-agent-core exists: **it does the hardest part of an Agent (loop, state, events, compaction) for you, and you only have to tell it which tools to use.**

### Layering is not dogma; dependency-direction control is

The three scenarios above imply:

| Scenario | Best for | What you do yourself |
|---|---|---|
| pi-ai only | You only need to call the LLM, no Agent loop | Manage state, write the loop (if needed) |
| pi-ai + pi-agent-core | You need full Agent capability but have a unique business scenario | Write your own tools, your own entry point |
| All three layers | Building a Pi-class coding assistant | Use directly, or write Extensions |

The number of layers depends on your complexity. But no matter how many layers, there is one rule that cannot be broken:

**No lower-layer code may contain any reference to an upper layer.**

pi-ai may not import anything from pi-agent-core. pi-agent-core may not import anything from pi-coding-agent. This rule guarantees that you can swap any layer for your own implementation without touching the other layers. For example, you can swap pi-ai for your own model-call layer, and neither pi-agent-core nor pi-coding-agent needs to change.

---

## 7. Three portable methods

From Pi''s layering design, I extract three reusable methods for your own Agent projects.

### Method 1: the "dependency funnel"

**What it is**: when designing package structure, draw the dependency arrows first. The bottom is "knows nothing about the outside world", the middle is "knows the bottom but not the business", the top is "knows everything".

**How to do it**:

1. Find parts of your code that "do not depend on any external knowledge" → bottom layer
2. Find parts that "depend on the bottom but do not know the specific business" → middle layer
3. Find parts that "know what the user wants" → top layer
4. Check: if any high-layer thing is imported by the bottom layer, your layering is broken

**How to verify**: ask yourself "if I remove the upper layer, can the lower layer still run?" If yes, the dependency direction is correct. If no, the upper layer has leaked into the lower one.

### Method 2: the "progressive type extension" pattern

**What it is**: the bottom layer defines the smallest type interface; upper layers extend through union types (`|`) and inheritance (`extends`) rather than modifying the bottom types.

**How to do it**:

1. Bottom defines the atom types (e.g., `Tool = { name, description, parameters }`)
2. Middle extends with inheritance (e.g., `AgentTool extends Tool`, adding the `execute` field)
3. Top stacks on business attributes (e.g., `ToolDefinition`, adding renderers)
4. Each layer only adds things it cares about; do not modify the bottom layer

**Benefit**: the bottom layer can be published and reused independently. Others can reference your bottom-layer types without pulling in the whole Agent framework.

### Method 3: the "independently usable" test

**What it is**: after each layer is designed, do a simple test: remove the upper layer, can this layer still work?

Pi''s three layers all pass this test:

- Remove pi-agent-core and pi-coding-agent, pi-ai can call the LLM on its own.
- Remove pi-coding-agent, pi-ai + pi-agent-core can run a custom Agent.
- All three together is a complete coding assistant.

**How to do it**: in your `package.json`, temporarily remove the upper-layer dependencies and see if the lower-layer package still compiles and tests. If it errors out, your bottom layer has leaked an upper-layer dependency.

---

## 8. Next step: drill into the Agent''s heart

In this chapter we took an outside look at Pi''s overall architecture. You now know:

- Pi is layered in three: pi-ai (in charge of models) → pi-agent-core (in charge of the loop) → pi-coding-agent (in charge of the business)
- The core layering rule is **one-way dependency, bottom knows nothing about the top**
- Types expand progressively from bottom to top: `Tool` → `AgentTool` → `ToolDefinition`
- Three layers are not required; the number of layers depends on your complexity. But dependency-direction control is required.

But we have not yet answered a more fundamental question: how does the Agent run? How does the LLM keep thinking, calling tools, reading results, thinking again? What does the famous "Agent Loop" look like?

In the next chapter we drill into the Agent''s heart: **the Agent Loop**. We will first understand why a loop is needed (instead of finishing in one call), then trace a single user message''s full journey from pressing Enter until the Agent says "I am done".

---

> **About this book''s structure**: chapters 1-6 (Chapter 1 Opening → Chapter 6 Message System) build a complete understanding of Pi-Agent''s core mechanisms; we recommend reading them in order. Starting from Chapter 7 (Event-Driven, Context Engineering, Context Compaction, Session Management, etc.), the topics become advanced engineering concerns; each chapter is relatively independent and can be read as needed.

---

> **Version note**
> This chapter is written against Pi **v0.80.2**. Code analysis follows the [earendil-works/pi](https://github.com/earendil-works/pi) repository (tutorial links may point at `main` and differ slightly from v0.80.2).


---

> **Next up**
> [Chapter 3: Agent Loop](ch03-agent-loop.md)
