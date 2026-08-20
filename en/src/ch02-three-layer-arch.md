---
chapter: 2
slug: ch02-three-layer-arch
title_zh: "第2章：三层架构: Pi-Agent 项目的骨骼"
title_en: "Chapter 2: Three-Layer Architecture: Pi-Agent Project Skeleton"
title_vi: "Chương 2: Kiến trúc ba lớp: Bộ xương của Pi-Agent"
source_url: https://www.dgzhuya.com/modules/ch02-three-layer-arch
language: en
version_pairs:
 zh: zh/src/ch02-three-layer-arch.md
 en: en/src/ch02-three-layer-arch.md
 vi: vi/src/ch02-three-layer-arch.md
original_chars: 4215
code_lines: 203
reading_minutes: 22
translator: pi-docs-bot
reviewed_by: null
last_updated: 2026-08-20
status: translated
official_refs:
 - https://pi.dev/docs/latest/index
 - https://pi.dev/docs/latest/quickstart
 - https://pi.dev/docs/latest/usage
 - https://pi.dev/docs/latest/providers
 - https://pi.dev/docs/latest/settings
 - https://pi.dev/docs/latest/extensions
 - https://pi.dev/docs/latest/skills
 - https://pi.dev/docs/latest/packages
 - https://pi.dev/docs/latest/models
 - https://pi.dev/docs/latest/security
 - https://pi.dev/docs/latest/keybindings
 - https://pi.dev/docs/latest/sessions
 - https://pi.dev/docs/latest/compaction
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
code_blocks: 16
mermaid_blocks: 0
---

# Chapter 2: Three-Layer Architecture: Pi-Agent Project Skeleton

> In this chapter, we step back and look at Pi''s overall architecture: where the code lives, how the packages depend on each other, and how types flow between layers. Once you have this full picture, drilling into any single module later will not get you lost.

---

## 1. You just opened an Agent codebase

Suppose you just cloned Pi''s repository and typed `ls` in the terminal. This is the directory layout you would see:

```
repo/
├── packages/
│   ├── ai/              ← @earendil-works/pi-ai
│   ├── agent/           ← @earendil-works/pi-agent-core
│   ├── coding-agent/    ← @earendil-works/pi-coding-agent
│   ├── orchestrator/    ← @earendil-works/pi-orchestrator（实验性，多 Agent 编排）
│   └── tui/             ← @earendil-works/pi-tui
├── package.json         ← 根配置，npm workspaces
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
// packages/ai/src/index.ts（v0.80.x 节选）
// 顶部注释明确写：Core only, side-effect free: no generated catalogs,
// no provider factories, no api-registry, no OAuth implementations, no compat.
// 全局 API 注册表、stream/complete 函数等已迁至 ./compat.ts（packages/ai/src/compat.ts）
export type { Static, TSchema } from "typebox";
export { Type } from "typebox";
export * from "./api/lazy.ts"            // 各 Provider API 的懒加载入口
export * from "./auth/context.ts"        // 认证上下文
export * from "./auth/credential-store.ts"
export * from "./auth/helpers.ts"
export * from "./auth/types.ts"
export * from "./images-models.ts"
export * from "./models.ts"              // 模型定义（KnownProvider 35 个）
export * from "./types.ts"               // 统一类型
export * from "./utils/event-stream.ts"  // 事件流基类
// 流式调用入口（stream / streamSimple）实际位于 ./compat.ts
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
// packages/agent/src/index.ts（节选）
export * from "./agent.js"               // Agent 类
export * from "./agent-loop.js"          // 循环函数
export * from "./harness/session/..."    // 会话管理
export * from "./harness/compaction/..." // 上下文压缩
export * from "./types.js"              // 类型定义
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
你输入: pi "帮我改个 bug"
│
├── cli.ts          ← 解析命令行参数
│   └── main.ts     ← 创建会话、选择运行模式（交互/打印/RPC）
│       └── AgentSession    ← 组装工具、加载扩展
│           └── Agent       ← 管理状态、跑循环
│               └── agentLoop()  ← 核心循环开始
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
│  pi-coding-agent：我知道怎么写代码            │  ← 最懂业务
│  （工具、扩展、CLI、会话持久化）               │
├─────────────────────────────────────────────┤
│  pi-agent-core：我知道怎么跑 Agent            │  ← 只懂框架
│  （循环、状态、事件、压缩）                    │
├─────────────────────────────────────────────┤
│  pi-ai：我知道怎么调模型                      │  ← 只懂模型
│  （统一 API、流式调用、30+ 提供商适配）        │
└─────────────────────────────────────────────┘

旁边还有一个独立的 UI 包：
┌──────────┐
│  pi-tui  │  ← 只管显示
└──────────┘
```

A intuitive layering: the bottom calls models, the middle runs the loop, the top handles the business. Right?

But wait :

---

## 4. Open package.json, things are not so simple

> **Reading path hint**: Sections 4–5 are **advanced architecture understanding**, going into dependency relationships and type-flow details. Section 4 corrects the common misconception of "strict layering" and clarifies the dependency direction: **a must-read if you plan to build on top of the SDK**. Section 5 expands on the three-layer type progression; it leans more on TypeScript system details and you can forget field names without hurting later learning. **If you only want to get up and running quickly, you can skip these two sections and jump to Section 6 to see "how the layering promise holds".**

If your mental model says "upper layers may only depend on the adjacent lower layer", then opening `packages/coding-agent/package.json` and looking at the `dependencies` field, you will see one unexpected detail:

```
// packages/coding-agent/package.json
"dependencies": {
    "@earendil-works/pi-agent-core": "^0.80.2",   // ← 依赖中间层，合理
    "@earendil-works/pi-ai": "^0.80.2",            // ← 也直接依赖底层？
    "@earendil-works/pi-tui": "^0.80.2",
    // ... 其他依赖
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
pi-ai（底层）
  ↑         ↑
  │         │
  │    pi-agent-core（中间层）
  │         ↑
  │         │
  └─── pi-coding-agent（顶层）
            ↑
            │
       pi-orchestrator（实验性外围编排层，可选）
```

All the arrows point up. **The bottom layer never knows about the upper layer**: there is no import in pi-ai''s code that points to pi-agent-core or pi-coding-agent; orchestrator does not penetrate back into coding-agent either. That is the real rule of layering: **it does not restrict the depth of references, but ensures the dependency direction is strictly one-way upward.**

---

## 5. Type progression between layers: from atoms to molecules

Now that the dependency rule is clear, we can use the type system to make the progression between layers even more concrete.

### Layer 1: pi-ai defines the atoms

In pi-ai, a `Tool` is the smallest possible tool unit: only enough fields to describe what the tool is:

```
// packages/ai/src/types.ts（节选）
// 最基础的消息类型:所有 LLM 都认的格式
type Message = UserMessage | AssistantMessage | ToolResultMessage

// 模型定义:描述一个 LLM 的全部信息
interface Model<TApi> {
    id: string           // 如 "claude-sonnet-4-6"
    name: string
    api: TApi            // 如 "anthropic-messages"
    contextWindow: number // 如 200000
    // ... 更多字段
}

// 工具定义:描述一个工具的 schema
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
// packages/agent/src/types.ts（节选）
import type {
    Message, Model, Tool, ImageContent, ...
} from "@earendil-works/pi-ai";

// 扩展消息：除了标准 LLM 消息，还可以有自定义消息
type AgentMessage = Message | CustomAgentMessages[keyof CustomAgentMessages]

// 扩展工具：除了 schema，还有参数预处理、执行函数和执行模式（types.ts:371-394）
interface AgentTool<TParameters extends TSchema = TSchema, TDetails = any> extends Tool<TParameters> {
    label: string                                    // 显示名称
    prepareArguments?: (args: unknown) => Static<TParameters>   // 参数预处理
    execute: (toolCallId: string, params, signal?: AbortSignal, onUpdate?: AgentToolUpdateCallback<TDetails>) => Promise<AgentToolResult<TDetails>>
    executionMode?: ToolExecutionMode                 // "sequential" | "parallel"
}
```

`AgentTool` is a "molecule": it still has the `name`, `description`, and `parameters`, but it adds the ability to **run**. The Agent loop iterates over `AgentTool[]`, calls each tool''s `execute`, and feeds the result back into the model.

### Layer 3: pi-coding-agent builds molecules into materials

In pi-coding-agent, the final `ToolDefinition` wraps `AgentTool` with everything UI/permission-related:

```
// packages/coding-agent/src/core/extensions/types.ts:435-482（节选）
// 工具定义（产品视角）:完整接口有 10+ 个字段，下面列出关键字段
// 注意：ToolDefinition 在 TypeScript 层面是独立 interface 重新声明，
// 与 AgentTool 是"结构兼容"而非用 extends 继承（详见 types.ts:435）
interface ToolDefinition<TParams extends TSchema, TDetails = unknown, TState = any> {
    name: string
    label: string                         // UI 展示名
    description: string
    promptSnippet?: string                // 自动拼到 system prompt 的工具片段
    promptGuidelines?: string[]           // 工具使用守则
    parameters: TParams
    renderShell?: "default" | "self"      // 渲染模式
    prepareArguments?: (args: unknown) => Static<TParams>   // 参数预处理钩子
    executionMode?: ToolExecutionMode     // 并行/串行
    execute: (toolCallId, params, signal, onUpdate, ctx: ExtensionContext) => Promise<AgentToolResult<TDetails>>  // 签名扩展：比 AgentTool.execute 多 ctx 参数
    renderCall?: ...                      // 自定义调用渲染
    // ... 还有渲染器、UI 组件等业务属性
}

// 扩展定义（运行时聚合体，types.ts:1585-1595）
interface Extension {
    path: string                                       // 扩展路径
    resolvedPath: string                               // 解析后的绝对路径
    sourceInfo: SourceInfo                             // 来源信息
    handlers: Map<string, HandlerFn[]>                 // 各类处理器
    tools: Map<string, RegisteredTool>                 // 注册的工具（Map，非 Record）
    messageRenderers: Map<string, MessageRenderer>     // 消息渲染器
    commands: Map<string, RegisteredCommand>           // 注册的命令（Map，非 Record）
    flags: Map<string, ExtensionFlag>                  // 扩展标志
    shortcuts: Map<KeyId, ExtensionShortcut>           // 快捷键绑定
}
```

This is the shape that pi-coding-agent''s actual 7 tools implement (`read`, `bash`, `edit`, `write`, `grep`, `find`, `ls`).

### Before → After comparison of the type extension

To make the progression concrete, here is the field-by-field type extension chain:

```
Before（pi-ai 层）：Tool 只知道"长什么样"
────────────────────────────────────────────
interface Tool<TSchema> {
    name: string
    description: string
    parameters: TSchema
}

         ↓ agent-core 扩展

After（pi-agent-core 层）：AgentTool 知道"怎么执行"
────────────────────────────────────────────
interface AgentTool<TSchema> extends Tool<TSchema> {
    label: string                              ← 新增
    execute: (...) => Promise<AgentToolResult> ← 新增
    executionMode?: "sequential" | "parallel"  ← 新增
}

         ↓ coding-agent 扩展

After（pi-coding-agent 层）：ToolDefinition 加上"怎么显示"
────────────────────────────────────────────
interface ToolDefinition {
    // 继承 AgentTool 的全部字段
    // + 渲染器、权限控制等业务属性
}
```

---

## 6. Do I need three layers when writing my own Agent?

You might wonder: this Pi layering looks great, but is it overdesigned for my own Agent project?

Let us walk through three scenarios to see.

### Scenario A: no layering, everything in one file

```
// 假设：不分层的 Agent
import OpenAI from "openai";

const client = new OpenAI();
const messages = [];

while (true) {
    const response = await client.chat.completions.create({
        model: "gpt-4o",
        messages,
    });
    // 解析工具调用、执行、追加到 messages ...
}
```

Workable for tiny projects, but as soon as the Agent grows past ~1000 lines, every change becomes a nightmare: changing UI colors touches loop logic, changing the LLM provider touches tool execution. Merge conflicts pile up.

### Scenario B: only two layers (drop the coding-agent layer)

```
// 只用底层 + 中间层
import { Agent, agentLoop } from "@earendil-works/pi-agent-core";
import { streamSimple } from "@earendil-works/pi-ai";
```

Better, but you re-implement CLI argument parsing and session management every time. And your tools become tightly coupled to your specific Agent scenario: they cannot be reused by other Agents.

### Scenario C: only one layer (only pi-ai)

```
// 只用底层
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

> **About this book''s structure**: chapters 1–6 (Chapter 1 Opening → Chapter 6 Message System) build a complete understanding of Pi-Agent''s core mechanisms; we recommend reading them in order. Starting from Chapter 7 (Event-Driven, Context Engineering, Context Compaction, Session Management, etc.), the topics become advanced engineering concerns; each chapter is relatively independent and can be read as needed.
