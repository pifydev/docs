---
title: "Chapter 5: The Tool system"
description: How Pi defines, adapts, validates, schedules, executes, and records Tool calls.
translation_key: ch05-tool-system
language: en
chapter: 5
source_url: "https://www.dgzhuya.com/modules/ch05-tool-system"
official_refs:
  - "https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/agent/README.md#tools"
  - "https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/coding-agent/docs/extensions.md#custom-tools"
terms_used:
  - Tool
  - ToolCall
  - ToolResultMessage
  - AgentTool
  - ToolDefinition
status: reviewed
last_updated: "2026-08-24"
translator: Pify maintainers
reviewed_by: Pify maintainers
---

Chapter 3 followed an Agent turn from a model response to Tool execution and back into the conversation. Chapter 4 stopped at the other side of that boundary: a provider adapter had normalized the model's request into a `ToolCall` block such as this one.

```json
{
  "type": "toolCall",
  "id": "call_abc123",
  "name": "read",
  "arguments": { "path": "src/main.ts" }
}
```

That block does not authorize an operation and does not contain executable code. The runtime still has to find the named Tool, prepare and validate untrusted arguments, apply product policy, honor cancellation, run the effect, report progress, finalize the result, and create the matching `ToolResultMessage`. A batch adds another question: which effects may overlap without corrupting shared state?

Pi `0.84.2` answers those questions with three related type layers and a staged execution path. The historical five-step teaching model remains useful—prepare, validate, pre-hook, execute, post-hook—but the current implementation also defines scheduling, event order, cancellation boundaries, result construction, and batch-wide termination. This chapter follows that full path against pinned commit `a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c`.

## 1. Three type layers keep dependencies pointed inward

### Layer 1: `Tool` describes a provider-facing capability

The model layer needs enough information to advertise a callable capability. It has no reason to know how the application will execute or render that capability. The following source-faithful excerpt is the complete `Tool` interface from `packages/ai/src/types.ts` at the pinned commit:

```typescript
export interface Tool<TParameters extends TSchema = TSchema> {
  name: string;
  description: string;
  parameters: TParameters;
  constrainedSampling?: false | ConstrainedSamplingConfig;
}
```

`name` is the protocol identifier copied into `ToolCall.name`. `description` and `parameters` tell the model when the Tool applies and which argument object it should produce. `parameters` is a TypeBox `TSchema`. The optional `constrainedSampling` field asks a compatible provider for JSON-Schema or grammar-constrained sampling; `false` explicitly disables the request.

This layer describes what can be requested. It has no `execute` method, display label, UI renderer, session access, or cancellation signal. Provider adapters serialize only the declaration fields they support. That boundary lets `@earendil-works/pi-ai` remain usable in a direct model-call application with no Agent runtime.

### Layer 2: `AgentTool` adds an executable contract

Agent core must turn a normalized call into an effect and a normalized result. It extends `Tool<TParameters>` rather than inventing another provider declaration. The following source-faithful abridgement comes from `packages/agent/src/types.ts` at the same pin; comments are omitted, while the generic signatures and members are unchanged:

```typescript
export interface AgentToolResult<T> {
  content: (TextContent | ImageContent)[];
  details: T;
  usage?: Usage;
  addedToolNames?: string[];
  terminate?: boolean;
}

export type AgentToolUpdateCallback<T = any> = (
  partialResult: AgentToolResult<T>,
) => void;

export interface AgentTool<
  TParameters extends TSchema = TSchema,
  TDetails = any,
> extends Tool<TParameters> {
  label: string;
  prepareArguments?: (args: unknown) => Static<TParameters>;
  execute: (
    toolCallId: string,
    params: Static<TParameters>,
    signal?: AbortSignal,
    onUpdate?: AgentToolUpdateCallback<TDetails>,
  ) => Promise<AgentToolResult<TDetails>>;
  executionMode?: ToolExecutionMode;
}
```

`label` is human-facing; it can be `Read file` while the protocol name stays `read`. `prepareArguments` handles a known old or malformed wire shape before validation. `execute` receives validated parameters, the call ID, the run's optional `AbortSignal`, and an optional progress callback. `executionMode` is either `"parallel"` or `"sequential"`.

The result has two audiences. `content` contains text or image blocks for the model. `details` carries structured application data for rendering, logging, or reconstruction. A final result may also report nested Tool `usage`, record newly added Tool names, or opt into early termination. `details` is required by the TypeScript interface even when its value is `{}` or `undefined` through a corresponding detail type.

Here is a copyable low-level `AgentTool`. It uses both generic parameters so `params.path` and progress details remain typed. It checks cancellation before and after the filesystem operation; a production filesystem wrapper may also pass the signal into the underlying operation.

```typescript
import { Type } from "@earendil-works/pi-ai";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { readFile } from "node:fs/promises";

const readTextParameters = Type.Object({
  path: Type.String({ description: "Path to a UTF-8 text file" }),
});

interface ReadTextDetails {
  path: string;
  phase: "reading" | "done";
  bytes?: number;
}

export const readText: AgentTool<
  typeof readTextParameters,
  ReadTextDetails
> = {
  name: "read_text",
  label: "Read text",
  description: "Read one UTF-8 text file",
  parameters: readTextParameters,
  executionMode: "parallel",
  async execute(_toolCallId, params, signal, onUpdate) {
    if (signal?.aborted) throw new Error("Read cancelled before it started");

    onUpdate?.({
      content: [{ type: "text", text: `Reading ${params.path}` }],
      details: { path: params.path, phase: "reading" },
    });

    const text = await readFile(params.path, "utf8");
    if (signal?.aborted) throw new Error(`Read cancelled: ${params.path}`);

    return {
      content: [{ type: "text", text }],
      details: {
        path: params.path,
        phase: "done",
        bytes: Buffer.byteLength(text),
      },
    };
  },
};
```

### Layer 3: Extension `ToolDefinition` adds product concerns

Coding Agent needs prompt contributions, terminal rendering, and the live session context available to extensions. Its public Extension `ToolDefinition` adds those concerns without making Agent core depend on the TUI or session manager. The following non-self-contained, source-faithful abridgement comes from `packages/coding-agent/src/core/extensions/types.ts` at the pin. It retains the exact generics and function types while omitting documentation comments:

```typescript
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

`promptSnippet` opts the Tool into the default system prompt's short available-Tools list. `promptGuidelines` adds Tool-specific guidance while the Tool is active. Each guideline must name its Tool because Coding Agent appends the bullets to one flat section. `renderCall` and `renderResult` create TUI components; `TState` types the state shared by those render slots. `renderShell: "self"` tells the host that the renderer supplies its own framing.

The fifth `execute` argument is the Extension `ctx`. It exposes the current working directory, mode, UI capability, read-only session manager, model registry, current model, scoped models, thinking level, current signal, and controlled actions such as `abort()`, `compact()`, and `getSystemPrompt()`. These are Coding Agent responsibilities, not Agent core responsibilities.

### `defineTool()` and `pi.registerTool()` serve different moments

An object literal passed inline to `pi.registerTool()` receives contextual typing from `ExtensionAPI.registerTool<TParams, TDetails, TState>()`. A standalone definition assigned to a variable can lose parameter inference before it reaches that method. `defineTool()` is an identity function whose return intersection preserves that inference for variables and arrays. Its complete implementation in `packages/coding-agent/src/core/extensions/types.ts` at the pin is:

```typescript
export function defineTool<
  TParams extends TSchema,
  TDetails = unknown,
  TState = any,
>(
  tool: ToolDefinition<TParams, TDetails, TState>,
): ToolDefinition<TParams, TDetails, TState> & AnyToolDefinition {
  return tool as ToolDefinition<TParams, TDetails, TState> & AnyToolDefinition;
}
```

`defineTool()` does not register or wrap anything at runtime. `pi.registerTool()` stores the definition under its name and refreshes the session's Tool registry. Registration and activation are separate when an allowlist is in use: an SDK session created with a `tools` array must include the custom name, and extensions can inspect or change the active names with `pi.getActiveTools()` and `pi.setActiveTools(names)`. Unknown names passed to `setActiveTools()` are ignored.

This complete extension is copyable. It gives `defineTool()` explicit detail typing, registers the result through `pi.registerTool()`, reports one progress update, uses `ctx.cwd`, passes the run signal to `readFile`, and throws a path-specific error for a known failure.

```typescript
import { Type } from "@earendil-works/pi-ai";
import {
  defineTool,
  type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const inspectTextParameters = Type.Object({
  path: Type.String({ description: "Project-relative UTF-8 file path" }),
});

interface InspectTextDetails {
  path: string;
  phase: "reading" | "done";
  bytes?: number;
}

const inspectText = defineTool<
  typeof inspectTextParameters,
  InspectTextDetails
>({
  name: "inspect_text",
  label: "Inspect text",
  description: "Report the byte length of one UTF-8 project file",
  promptSnippet: "Inspect the byte length of a UTF-8 project file",
  promptGuidelines: [
    "Use inspect_text when the byte length of a text file is needed.",
  ],
  parameters: inspectTextParameters,
  executionMode: "parallel",
  async execute(_toolCallId, params, signal, onUpdate, ctx) {
    const absolutePath = resolve(ctx.cwd, params.path);
    onUpdate?.({
      content: [{ type: "text", text: `Reading ${params.path}` }],
      details: { path: params.path, phase: "reading" },
    });

    try {
      const text = await readFile(absolutePath, { encoding: "utf8", signal });
      return {
        content: [
          {
            type: "text",
            text: `${params.path} contains ${Buffer.byteLength(text)} bytes`,
          },
        ],
        details: {
          path: params.path,
          phase: "done",
          bytes: Buffer.byteLength(text),
        },
      };
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        throw new Error(`File does not exist: ${params.path}`);
      }
      throw error;
    }
  },
});

export default function register(pi: ExtensionAPI): void {
  pi.registerTool(inspectText);
}
```

### The bridge injects `ExtensionContext` without widening Agent core

Agent Loop consumes `AgentTool`; the product registry stores `ToolDefinition`. `wrapToolDefinition()` adapts the latter into the former. The complete implementation below is from `packages/coding-agent/src/core/tools/tool-definition-wrapper.ts` at the pin:

```typescript
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
```

The wrapper copies the protocol and runtime fields, leaves prompt and rendering fields in Coding Agent, and adapts `execute`. Its implementation accepts an optional explicit fifth context internally; normal Agent core calls provide four arguments, so the wrapper calls `ctxFactory()` and supplies the returned `ExtensionContext`.

Registered extension Tools use `() => runner.createContext()` as that factory. `createContext()` builds an object with guarded lazy getters and methods resolved at call time. It therefore sees the current session, model, Tool set, signal, and UI state instead of freezing values from extension-load time. A stale runner rejects access after reload or session replacement. Agent Loop never imports `ExtensionContext` and cannot reach Coding Agent session APIs directly.

That guarantee applies to definitions registered through the Extension runner. Built-in definitions are also wrapped directly without a factory; their implementations treat the fifth value as optional where they use it. Extension authors who need `ctx` should register through `pi.registerTool()` or the supported ResourceLoader path, not call the internal wrapper without a context factory.

The bridge can be summarized without hiding ownership. This is architectural pseudocode, not an importable API:

```text
pi-ai Tool declaration
  -> pi-agent-core AgentTool execution contract
  -> Coding Agent ToolDefinition prompt, rendering, and session contract
  -> wrapToolDefinition copies shared fields
  -> execute closure obtains a fresh ExtensionContext
  -> Agent Loop still invokes the four-argument AgentTool contract
```

### Why three layers are worth keeping

Putting every field on one interface would reverse dependencies. A provider adapter would need to understand terminal `Component` values. Agent core would need a session manager just to execute a plain in-memory Tool. A browser Agent would inherit Node and TUI concerns that it never uses.

The progression instead adds capability at the owner that can implement it. Pi AI describes a request. Agent core executes and schedules it. Coding Agent adds product prompt, rendering, registry, and session behavior. The wrapper is narrow enough to audit: every copied field and the context injection are visible in one function.

## 2. The execution pipeline turns a request into a result

### Direct invocation leaves policy and protocol gaps

A direct lookup followed by `await tool.execute()` omits several observable contracts. The model can name a Tool that is not active. A resumed session can carry an old argument shape. Required fields can be missing. A policy hook may block a dangerous request. The user may cancel while a long process is running. An exception still needs a result linked to the original call so provider transcripts remain valid.

This invalid call is a better validation example than the historical `path: 12345` example. Current validation performs supported primitive conversion, so a number may become a string. A missing required property cannot satisfy this schema:

```json
{
  "type": "toolCall",
  "id": "call_missing_path",
  "name": "read",
  "arguments": { "offset": 20 }
}
```

Application authorization also stays outside the model. A model request to run a shell command is intent, not permission. The pre-hook checks the effective, validated arguments against host policy before an effect starts.

### The current pipeline includes events and batch control

The five conceptual processing stages sit inside a larger event and scheduling path. This is implementation-faithful pseudocode for `packages/agent/src/agent-loop.ts` at the pin:

```text
assistant ToolCall in source order
  -> emit tool_execution_start with raw arguments
  -> resolve active AgentTool by name
  -> prepareArguments when present
  -> validateToolArguments on the prepared call
  -> beforeToolCall with validated args and the run signal
  -> schedule the allowed execute effect
  -> execute with AbortSignal and onUpdate
  -> wait for accepted update-event emissions
  -> afterToolCall patch
  -> emit tool_execution_end with final result and isError
  -> construct ToolResultMessage
  -> emit message_start and message_end for that result
  -> append result to the conversation after the batch returns
```

Unknown Tools, preparation errors, validation errors, cancellation observed during preparation, and blocked calls produce an immediate outcome. They skip `execute` and `afterToolCall`, but still emit `tool_execution_end` and result-message events for the call that was finalized. A response stopped for `length` is stricter: every Tool call in that assistant message is failed without execution because its streamed arguments may be silently truncated.

### Step 1: `prepareArguments` adapts known historical shapes

`prepareArguments(args: unknown)` runs only when the resolved Tool defines it. Its output replaces the raw arguments for validation and execution. The current built-in `edit` Tool uses this hook for model and session compatibility: it parses a JSON string in `edits`, wraps one edit object into an array, and converts the older top-level `oldText`/`newText` form into the current array form.

Illustrative input and output based on that current compatibility rule:

```jsonc
// Raw arguments from an older stored call
{ "path": "app.ts", "oldText": "v1", "newText": "v2" }

// Effective arguments returned for current validation
{
  "path": "app.ts",
  "edits": [{ "oldText": "v1", "newText": "v2" }]
}
```

Preparation is deterministic computation at this boundary. Network requests, permission prompts, writes, and shared-state changes belong in `beforeToolCall` or `execute`, where cancellation and ordering are defined. Keeping the public schema current also avoids advertising deprecated fields to the model merely to resume an old transcript.

### Step 2: validation clones, normalizes, converts, then checks

`validateToolArguments()` is public from Pi AI and lives in `packages/ai/src/utils/validation.ts`. It `structuredClone()`s the prepared arguments, treats `null` as omission for optional non-nullable properties, applies TypeBox `Value.Convert`, and then checks a cached validator. Serialized plain JSON Schemas receive an additional AJV-compatible primitive coercion path.

The conversion step changes the old blanket claim that every wrong primitive type must fail. The current tests prove cases such as `"42"` becoming `42` for a number schema and `true` becoming `"true"` for a string schema. Validation still rejects a value that cannot satisfy the schema after supported conversion. Failure text names the Tool, formats each schema path and localized message, and includes the original received arguments. A missing `path` produces text shaped like this:

```text
Validation failed for tool "read":
  - path: Expected required property

Received arguments:
{
  "offset": 20
}
```

That string is caught by `prepareToolCall()` and placed in an error result; `execute` never receives the rejected object. Preparation itself may have changed the original argument object if a custom implementation mutated it, so custom `prepareArguments` code should return a fresh value and avoid mutation.

### Step 3: `beforeToolCall` applies host policy

Agent core's hook receives `{ assistantMessage, toolCall, args, context }` plus the optional run signal. `args` has passed validation. The raw `toolCall` remains available for identity and protocol metadata. The current return contract is:

| Hook return                                                | Runtime effect                                                                                       |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `undefined` or `{ block: false }`                          | Continue if the signal has not been aborted.                                                         |
| `{ block: true }`                                          | Skip execution and create an error result with `Tool execution was blocked`.                         |
| `{ block: true, reason: "Policy denied this path" }`       | Use the supplied reason as the error text.                                                           |
| `{ block: true, reason: "Final denial", terminate: true }` | Mark this result terminating; the whole batch still needs every result to terminate.                 |

This copyable Agent-core hook blocks shell access. It reads the validated object defensively because `BeforeToolCallContext.args` is `unknown` at the public boundary:

```typescript
agent.beforeToolCall = async ({ toolCall, args }, signal) => {
  if (signal?.aborted) {
    return { block: true, reason: "Operation aborted" };
  }
  if (toolCall.name !== "bash") return undefined;

  const command =
    typeof args === "object" &&
    args !== null &&
    "command" in args &&
    typeof args.command === "string"
      ? args.command
      : "";

  if (command.includes("rm -rf")) {
    return { block: true, reason: "Destructive command blocked" };
  }
  return undefined;
};
```

Coding Agent connects extension `tool_call` events to this hook. The Extension event receives `toolName`, `toolCallId`, and validated `input`; its handler may return `block`, `reason`, and `terminate`. A thrown `tool_call` handler error is caught by Agent preparation and becomes an error result, so extension policy failure does not accidentally allow the effect.

### Step 4: `execute` owns effects, cancellation, and progress

The exact Agent-core call contract can be read independently of the product wrapper:

```typescript
execute: (
  toolCallId: string,
  params: Static<TParameters>,
  signal?: AbortSignal,
  onUpdate?: AgentToolUpdateCallback<TDetails>,
) => Promise<AgentToolResult<TDetails>>;
```

`toolCallId` correlates logs and UI state. `params` is the prepared and validated value. `signal` is the run's cancellation channel. Tools must check it and pass it into cancellable filesystem, process, network, or timer APIs; receiving a signal does not make an arbitrary dependency cancellable. Known aborts should throw a concrete message such as `Command aborted` or `Read cancelled: src/main.ts`.

`onUpdate` emits partial `AgentToolResult` values for observation. A long Tool can publish useful partial output while keeping its final `content` authoritative:

```typescript
onUpdate?.({
  content: [{ type: "text", text: collectedStdout }],
  details: { phase: "running", elapsedMs: Date.now() - startedAt },
});
```

Agent core wraps accepted callbacks as `tool_execution_update` events with call ID, Tool name, raw call arguments, and `partialResult`. It stops accepting callbacks as soon as the `execute` promise settles. Delayed callbacks from an orphaned timer or process listener are ignored. The runtime also waits for every already accepted update-event promise before it returns success or encodes an exception. That produces this per-call order:

```text
tool_execution_start
  -> zero or more tool_execution_update events
  -> execute promise settles
  -> accepted update emissions settle
  -> afterToolCall settles
  -> tool_execution_end
  -> ToolResultMessage message_start
  -> ToolResultMessage message_end
```

Cancellation can be observed before the pre-hook, after the hook, or inside the Tool. Preparation returns `Operation aborted` when it sees the signal at its checks. During execution, Tool code decides how promptly to stop. The loop catches a thrown abort error as a Tool error result, and the surrounding Agent run also uses the same signal to stop provider work and later scheduling. Code must not release a mutation lock while an underlying write can still finish; the built-in `edit` Tool checks the signal after awaited operations while holding its per-file queue.

### Step 5: `afterToolCall` applies a field-level patch

Agent core calls `afterToolCall` only after an allowed Tool has returned or thrown. The hook receives the assistant message, call, validated args, current `AgentToolResult`, current `isError`, Agent context, and the run signal. A return value patches selected fields without a deep merge:

| Returned field | Merge rule and use                                                                                                              |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `content`      | Replaces the entire text/image block array; use for redaction or result normalization.                                          |
| `details`      | Replaces the entire details value; use for audit or UI metadata.                                                                |
| `isError`      | Replaces the error flag; a hook can mark a returned result failed or deliberately recover an execution error.                   |
| `usage`        | Replaces Tool-owned usage, such as tokens consumed by a nested model call.                                                      |
| `terminate`    | Replaces the runtime hint; it is effective only if every finalized result in the batch ends with `terminate: true`.             |

The following hook redacts a secret-like text result and preserves all fields it does not mention:

```typescript
agent.afterToolCall = async ({ toolCall, result, isError }) => {
  if (toolCall.name !== "read_secret" || isError) return undefined;

  return {
    content: result.content.map((block) =>
      block.type === "text"
        ? { type: "text" as const, text: "[REDACTED BY POLICY]" }
        : block,
    ),
  };
};
```

If the core hook throws, `finalizeExecutedToolCall()` replaces the current result with a text error result and sets `isError: true`. In Coding Agent, extension `tool_result` handlers provide a narrower product hook: they may replace `content`, `details`, `isError`, and `usage`, but their public result type has no `terminate` field. The Extension runner catches and reports an individual `tool_result` handler exception, then continues the handler chain; that logged handler failure does not replace the Tool result. Coding Agent normalizes result images after the chain. Core `afterToolCall` supports `terminate`; Extension `tool_result` does not.

### The pipeline ends with `ToolResultMessage`

The normalized transcript type belongs to Pi AI. This source-faithful excerpt from `packages/ai/src/types.ts` retains its complete fields:

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

`createToolResultMessage()` copies the call ID and name, normalizes missing JavaScript-extension content to `[]`, carries details and usage, conditionally carries non-empty `addedToolNames`, sets the finalized error flag, and stamps `Date.now()`. A successful result can therefore look like this:

```typescript
const resultMessage = {
  role: "toolResult",
  toolCallId: "call_abc123",
  toolName: "read",
  content: [{ type: "text", text: "export const answer = 42;" }],
  details: { path: "src/main.ts" },
  isError: false,
  timestamp: 1787533200000,
} satisfies ToolResultMessage<{ path: string }>;
```

`terminate` is deliberately absent. It controls whether the runtime makes another model call after the current batch; it is not part of the provider transcript. `addedToolNames` is different: it marks definitions that became available from this transcript position, which lets providers with native deferred Tool loading preserve the load point. Other providers rely on the current active Tool list on the next request.

When a Coding Agent Tool calls `pi.setActiveTools()`, the registered wrapper compares active names before and after execution. A purely additive change becomes `addedToolNames` on the result. Removing a previously active Tool in the same call suppresses that additive marker. Register all candidate Tools first, keep only the loader set active, and add matched names without removing current ones when implementing dynamic Tool discovery.

## 3. Batch scheduling separates ordering from concurrency

### One assistant message may request several effects

An assistant content array can mix text and multiple calls. The call order remains the source order even when the effects can overlap:

```typescript
const content = [
  { type: "text", text: "I will inspect the implementation and tests." },
  {
    type: "toolCall",
    id: "call_1",
    name: "read",
    arguments: { path: "src/main.ts" },
  },
  {
    type: "toolCall",
    id: "call_2",
    name: "grep",
    arguments: { pattern: "TODO", path: "src" },
  },
  {
    type: "toolCall",
    id: "call_3",
    name: "find",
    arguments: { pattern: "*.test.ts" },
  },
] satisfies AssistantMessage["content"];
```

Read-only calls often benefit from concurrency. Mutations need a clearer ownership rule. Two read-modify-write effects can both observe the same old bytes and then overwrite one another:

```text
edit call 1: read app.ts at version A -> compute version B -> write B
edit call 2: read app.ts at version A -> compute version C -> write C
final file: B or C, with one valid change lost
```

The scheduler cannot infer conflicts from Tool names and JSON arguments in the general case. A database Tool, deployment Tool, or interactive prompt may share state that is invisible to Agent core.

### Parallel execution is more than one `Promise.all`

Pi separates preflight, effects, finalization, and transcript emission. `beforeToolCall` runs during source-ordered preflight because policy handlers may inspect or update shared application state. Allowed effects can then run concurrently. Each result still passes through `afterToolCall` before its end event. Final result messages are emitted in source order after the concurrent work settles.

Immediate outcomes are worth noting. If call 1 is unknown or blocked during parallel preflight, its `tool_execution_end` is emitted immediately, before later allowed effects are started. The loop continues preflighting later calls unless cancellation is observed. The eventual `ToolResultMessage` artifacts are still emitted from the ordered finalized array.

### One sequential Tool serializes the batch

The global `Agent.toolExecution` mode defaults to `"parallel"`. A Tool may set `executionMode: "sequential"`. If global mode is sequential or any called active Tool carries that per-Tool override, Pi sends the whole batch through the sequential executor. This source-faithful excerpt is from `packages/agent/src/agent-loop.ts` at the pin:

```typescript
const hasSequentialToolCall = toolCalls.some(
  (tc) =>
    currentContext.tools?.find((t) => t.name === tc.name)?.executionMode ===
    "sequential",
);
if (config.toolExecution === "sequential" || hasSequentialToolCall) {
  return executeToolCallsSequential(
    currentContext,
    assistantMessage,
    toolCalls,
    config,
    signal,
    emit,
  );
}
return executeToolCallsParallel(
  currentContext,
  assistantMessage,
  toolCalls,
  config,
  signal,
  emit,
);
```

The conservative batch vote avoids inventing a conflict analyzer. Use the per-Tool override for interactions, global state transitions, and operations whose meaning depends on sibling order. Use global sequential mode when the host cannot permit overlap at all.

The seven built-in Coding Agent definitions at this pin omit `executionMode`, so the global default allows them to overlap. Built-in `edit` and `write` add a second, more precise safeguard: `withFileMutationQueue()` serializes the complete mutation window per canonical file path while leaving different files concurrent. Custom file-mutating Tools should use the same exported helper with the resolved absolute target path.

### Parallel and sequential paths emit different timelines

Sequential mode completes the full lifecycle for one call before it starts the next. It emits each result message immediately after that call's end event. If cancellation is observed, it breaks without starting later calls.

Parallel mode first emits each start event and runs each preparation in source order. It stores allowed effects as deferred functions. After preflight, `Promise.all` starts those functions together. End events occur as each effect plus post-hook finishes; result-message events wait for the ordered `Promise.all` result. Implementation-faithful pseudocode makes the distinction visible:

```text
sequential mode
  call 1 start -> prepare -> execute -> after -> end -> result message
  call 2 start -> prepare -> execute -> after -> end -> result message

parallel mode
  call 1 start -> prepare
  call 2 start -> prepare
  call 3 start -> prepare
  execute allowed calls concurrently
  call 2 after -> end
  call 1 after -> end
  call 3 after -> end
  emit result messages for call 1, call 2, call 3
```

Progress events can interleave across calls in parallel mode. Consumers must correlate by `toolCallId`, not by arrival position. Persisted `ToolResultMessage` order remains aligned with the assistant's calls, which provider adapters need when reconstructing the next request.

Batch termination is also an ordered reduction, not a race. `shouldTerminateToolBatch()` returns true only for a non-empty finalized array in which every `result.terminate` is exactly `true`. A blocked call can participate through `beforeToolCall`; an allowed call can participate through `execute` or the core post-hook. One non-terminating, invalid, unknown, cancelled, or ordinary result keeps the automatic follow-up model turn enabled.

## 4. Tool failures become model-visible result messages

### Six common failure paths share one transcript product

Tool authors should throw on failed execution. Agent core catches those exceptions at the Tool boundary, while preparation and finalization have their own catches. The resulting transcript represents failure with `ToolResultMessage.isError: true` and text content. The six baseline paths still exist with current details:

| Failure point             | Runtime behavior                                                                                 | Final transcript product                                    |
| ------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| Tool name not active      | Return immediate `Tool <name> not found`; skip preparation, hooks, and execution.                | Error `ToolResultMessage`                                   |
| `prepareArguments` throws | Preparation catch converts `error.message` or `String(error)`.                                   | Error `ToolResultMessage`                                   |
| Schema validation fails   | The same catch carries the formatted validation report.                                         | Error `ToolResultMessage`                                   |
| `beforeToolCall` blocks   | Use its reason or the default blocked text; copy a true termination hint.                        | Error `ToolResultMessage`; termination stays runtime-only   |
| `execute` throws          | Stop accepting updates, await accepted update emissions, and create a text error result.         | Error `ToolResultMessage`                                   |
| `afterToolCall` throws    | Replace the executed result with the thrown message and set the final error flag.                | Error `ToolResultMessage`                                   |

An observed abort during preparation adds another immediate error route, and a `length`-stopped assistant response fails all its Tool calls without entering this pipeline. Those safeguards extend the baseline table; they do not change the error-as-result contract for calls that are finalized.

### The execution catch closes progress before encoding an exception

The following source-faithful abridgement comes from `executePreparedToolCall()` in `packages/agent/src/agent-loop.ts` at the pin. It omits event object construction inside the callback but preserves the state and settlement order:

```typescript
const updateEvents: Promise<void>[] = [];
let acceptingUpdates = true;

try {
  const result = await prepared.tool.execute(
    prepared.toolCall.id,
    prepared.args as never,
    signal,
    (partialResult) => {
      if (!acceptingUpdates) return;
      updateEvents.push(
        Promise.resolve(
          emit({
            type: "tool_execution_update",
            toolCallId: prepared.toolCall.id,
            toolName: prepared.toolCall.name,
            args: prepared.toolCall.arguments,
            partialResult,
          }),
        ),
      );
    },
  );
  acceptingUpdates = false;
  await Promise.all(updateEvents);
  return { result, isError: false };
} catch (error) {
  acceptingUpdates = false;
  await Promise.all(updateEvents);
  return {
    result: createErrorToolResult(
      error instanceof Error ? error.message : String(error),
    ),
    isError: true,
  };
} finally {
  acceptingUpdates = false;
}
```

The abridgement starts after local declarations owned by the surrounding function, so it is non-self-contained. It does not change the decisions: callbacks close when the Tool promise settles, accepted event promises drain on both success and failure, and exceptions become `AgentToolResult` values.

### Exception and message have different receivers

An uncaught exception targets the JavaScript call stack. A `ToolResultMessage` targets the model on the next request. Pi changes the receiver at the runtime boundary:

```text
inside Tool
  throw Error("ENOENT: src/config.ts")
    -> executePreparedToolCall catches it
    -> AgentToolResult { content: [text], details: {} }
    -> finalized isError: true
    -> ToolResultMessage linked to the original call
    -> provider adapter serializes the result for the next model turn
```

The runtime still reports `isError` to UI and event consumers. Encoding a failure as a message does not pretend it succeeded. It keeps the assistant-call/result pairing intact and gives the model the evidence needed to revise its next action.

### Model-visible errors support different recovery paths

The host cannot choose one correct recovery rule for every Tool. The conversation contains intent and earlier observations that the model can use:

| Result shown to the model                                 | Plausible next action                                                                                   |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `read` reports that `src/a.ts` does not exist             | List or search the directory, choose the discovered filename, then read it.                             |
| `edit` reports that `oldText` is not unique               | Read the current file, narrow the match, and issue one corrected edit.                                  |
| `bash` reports a missing package during a build           | Inspect the manifest and lockfile, then ask for permission or install according to host policy.         |
| A pre-hook reports that a destructive command was blocked | Choose a bounded command or explain why policy prevents the requested effect.                           |

The framework knows that a call failed. It does not know whether a path was a typo, a stale assumption, or an intended new file. Returning concrete evidence lets the model plan from the actual state while the loop remains structurally valid.

### Specific error text improves self-correction

`Operation failed` gives the model no variable to change. The built-in `read` Tool throws the requested offset and total line count; `edit` includes the path and underlying access code; `bash` retains captured output before adding abort, timeout, or exit status.

```text
weak:     Read failed
specific: Offset 200 is beyond end of file (100 lines total)

weak:     Command failed
specific: <captured output> followed by Command exited with code 2
```

Specific messages also improve UI, logs, and human review. Do not include secrets, full credentials, or unbounded output merely to add detail. A useful error names the failed operation, relevant safe identifiers, the observed constraint, and a correction the caller can attempt.

### Built-in Tools use active handling plus a framework fallback

The built-in Tools recognize failures they can explain. `read` checks an out-of-range offset before slicing. `edit` wraps access failure with the requested path and error code. `bash` accumulates bounded output and then attaches process status. This source-faithful excerpt from `packages/coding-agent/src/core/tools/bash.ts` at the pin shows the current inner catch and exit handling; local variables are established by the surrounding `execute` body:

```typescript
try {
  const result = await ops.exec(spawnContext.command, spawnContext.cwd, {
    onData: handleData,
    signal,
    timeout,
    env: spawnContext.env,
  });
  exitCode = result.exitCode;
} catch (err) {
  const snapshot = await finishOutput();
  const { text } = formatOutput(snapshot, "");
  if (err instanceof Error && err.message === "aborted") {
    throw new Error(appendStatus(text, "Command aborted"));
  }
  if (err instanceof Error && err.message.startsWith("timeout:")) {
    const timeoutSecs = err.message.split(":")[1];
    throw new Error(
      appendStatus(text, `Command timed out after ${timeoutSecs} seconds`),
    );
  }
  throw err;
}

const snapshot = await finishOutput();
const { text: outputText, details } = formatOutput(snapshot);
if (exitCode !== 0 && exitCode !== null) {
  throw new Error(
    appendStatus(outputText, `Command exited with code ${exitCode}`),
  );
}
return { content: [{ type: "text", text: outputText }], details };
```

Recognized cases gain context owned by the Tool. Unrecognized exceptions are rethrown unchanged. `executePreparedToolCall()` supplies the second layer: it carries `error.message`, or `String(error)` for a non-`Error` throw, into `createErrorToolResult()`. The fallback does not rewrite every failure into one vague phrase.

### Custom Tools should preserve that division of responsibility

A custom Tool should validate domain rules after schema validation, honor its signal, bound its output, and wrap only errors it understands. The complete extension example in Section 1 follows this rule: `ENOENT` becomes `File does not exist: <path>`, while an unknown read failure is rethrown.

Mutating Tools need one more practice. Use a narrow schema and resolve paths under the intended root, then place the entire read-modify-write window inside `withFileMutationQueue(absolutePath, fn)`. Setting `executionMode: "sequential"` protects the whole batch but sacrifices safe concurrency across unrelated files; the shared per-file queue protects the real resource and cooperates with built-in `edit` and `write`.

Security policy remains outside the Tool's model-facing description. Use `beforeToolCall` or Extension `tool_call` to require trust, confirmation, allowlists, or environment restrictions. The Tool still enforces its own invariants because hooks can be absent in another host. Redact both final content and progress details: `onUpdate` reaches UI and event subscribers before the post-hook can replace the final result.

### The error contract ends at a finalized Tool call

For a finalized call, Tool failure becomes an error result and does not escape as a raw Tool exception. That statement has boundaries. Extension event subscribers and provider callbacks have their own error policies. A Tool that ignores its `AbortSignal` can continue external work after the user cancels. A process crash cannot be converted by an in-process catch. A sequential batch stopped by cancellation may leave later calls unstarted instead of synthesizing results for them.

Within the normal Agent loop path, however, each prepared and executed call reaches one visible end state. The model receives the final error content when the loop continues, and the host receives ordered events even when an effect fails.

## 5. Operations interfaces separate Tool logic from system access

### Hard-coded system calls bind behavior to one environment

The shortest read implementation calls the local filesystem directly:

```typescript
const content = await readFile(absolutePath, "utf8");
```

That choice is valid for a small application, but it couples path checks, bytes, tests, and execution environment to Node's local filesystem. A remote workspace, in-memory test, sandbox broker, or audited filesystem proxy would require edits inside the Tool's decision logic.

The built-in Coding Agent Tools instead accept small `operations` objects when they are created. Their normal defaults still use local filesystem, process, ripgrep, or fd behavior. Tests and alternative hosts can supply the operations the Tool needs without replacing argument handling, truncation, progress, rendering, or result formatting.

### Each Tool calls an injected, minimal interface

`ReadOperations` is a representative public contract. This complete source excerpt comes from `packages/coding-agent/src/core/tools/read.ts` at the pin:

```typescript
export interface ReadOperations {
  readFile: (absolutePath: string) => Promise<Buffer>;
  access: (absolutePath: string) => Promise<void>;
  detectImageMimeType?: (
    absolutePath: string,
  ) => Promise<string | null | undefined>;
}
```

`createReadToolDefinition(cwd, options)` selects `options?.operations ?? defaultReadOperations` once. The returned `ToolDefinition` closes over that value. At execution time it resolves the requested path, calls `ops.access`, optionally calls `ops.detectImageMimeType`, reads through `ops.readFile`, and then applies the same image processing, line selection, truncation, content construction, and rendering metadata regardless of the backend.

Architectural pseudocode shows the substitution point:

```text
Tool policy and formatting
  -> ops.access(absolutePath)
  -> ops.detectImageMimeType(absolutePath) when provided
  -> ops.readFile(absolutePath)

default operations -> local Node filesystem
test operations    -> in-memory buffers
remote operations  -> authenticated workspace service
```

This copyable example creates a real built-in Read `ToolDefinition` backed by an in-memory map. It supplies the exact async operations contract; no temporary files are needed:

```typescript
import {
  createReadToolDefinition,
  type ReadOperations,
} from "@earendil-works/pi-coding-agent";
import { resolve } from "node:path";

const projectRoot = resolve("/virtual/project");
const files = new Map<string, Buffer>([
  [resolve(projectRoot, "README.md"), Buffer.from("# Demo\n")],
]);

const operations: ReadOperations = {
  async access(absolutePath) {
    if (!files.has(absolutePath)) {
      throw new Error(`Virtual file does not exist: ${absolutePath}`);
    }
  },
  async readFile(absolutePath) {
    const value = files.get(absolutePath);
    if (!value) {
      throw new Error(`Virtual file does not exist: ${absolutePath}`);
    }
    return value;
  },
  async detectImageMimeType() {
    return null;
  },
};

export const virtualRead = createReadToolDefinition(projectRoot, {
  autoResizeImages: false,
  operations,
});
```

An SSH or container backend can implement the same interface, but it must preserve the contract: absolute paths, rejected access for unreadable targets, raw bytes from `readFile`, cancellation inside its own transport if supported, bounded execution, and safe credential handling. The interface alone does not add a sandbox.

### The seven built-ins declare only the operations they consume

Current public interfaces remain per-Tool rather than forming one large virtual operating system:

| Tool  | Operations interface | Required methods and exact return shape                                                                                     |
| ----- | -------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Read  | `ReadOperations`     | `readFile(): Promise<Buffer>`, `access(): Promise<void>`, optional async `detectImageMimeType()`                             |
| Write | `WriteOperations`    | async `writeFile(absolutePath, content)` and `mkdir(dir)`                                                                    |
| Edit  | `EditOperations`     | async `readFile(): Buffer`, `writeFile(absolutePath, content)`, and `access()`                                                |
| Bash  | `BashOperations`     | `exec(command, cwd, { onData, signal, timeout, env }): Promise<{ exitCode: number | null }>`                                 |
| Grep  | `GrepOperations`     | sync or async `isDirectory(absolutePath)` and `readFile(absolutePath): string`                                                |
| Find  | `FindOperations`     | sync or async `exists(absolutePath)` and `glob(pattern, cwd, { ignore, limit }): string[]`                                   |
| Ls    | `LsOperations`       | sync or async `exists`, `stat` with `isDirectory()`, and `readdir(): string[]`                                                |

Read cannot write. Write does not need directory listing. Grep and Find keep their search-specific inputs. Bash owns streaming bytes, environment, timeout, signal, and exit code. Smaller interfaces make fakes short and prevent a Tool from quietly reaching an operation that its contract never declared.

Operations capture and Agent scheduling solve separate problems. The operations object selects how one effect reaches a resource. `executionMode` and `withFileMutationQueue()` decide how multiple effects overlap. `beforeToolCall` decides whether the effect is allowed. Keeping those choices separate makes each one testable.

## 6. Design lessons from the Tool system

Four reusable decisions emerge from the full path.

1. Extend types at the layer that owns the new capability. Provider declarations, Agent execution, and product rendering have different dependency budgets. A small adapter can join them without making the lower layer import the upper one.
2. Separate compatibility, validation, policy, effect, and result transformation. `prepareArguments` handles known shapes, validation establishes the runtime parameter contract, the pre-hook applies host policy, `execute` owns the effect, and the post-hook patches the result.
3. Preserve errors as typed information. Tool authors throw specific failures; Agent core converts them into error results linked to the call. The model can then retry, change inputs, or explain the policy boundary without corrupting the transcript.
4. Make concurrency and resource access explicit. Batch scheduling defines event and transcript order. Per-Tool execution mode handles coarse conflicts. A minimal Operations interface and a per-resource queue handle the actual system boundary.

These decisions also expose review points. Schema and preparation code are input security. `beforeToolCall` is authorization policy. `execute` is the side-effect and cancellation boundary. Progress events are an observability boundary that may leak data. `afterToolCall` is the final redaction point for model-visible content. `ToolResultMessage` is the durable protocol handed to the next provider call.

## 7. Closing: follow one call end to end

The opening `read` call now has a complete route. This is architectural pseudocode tied to the current implementation:

```text
AssistantMessage contains ToolCall("read", { path: "src/main.ts" })
  -> batch scheduler chooses sequential or parallel path
  -> tool_execution_start exposes raw call metadata
  -> active AgentTool lookup resolves "read"
  -> prepareArguments adapts a known legacy shape when defined
  -> validateToolArguments clones, normalizes, converts, and checks
  -> beforeToolCall may block with a model-visible reason
  -> execute receives validated params, AbortSignal, and onUpdate
  -> ReadOperations reaches the configured filesystem backend
  -> accepted progress events settle
  -> afterToolCall may replace content, details, usage, error, or termination
  -> tool_execution_end carries the finalized runtime result
  -> ToolResultMessage records call identity, content, details, and isError
  -> ordered result enters conversation history
  -> the batch-wide termination vote decides whether another model turn starts
```

Tool execution is therefore a controlled protocol around an effect. The schema limits the argument language, preparation keeps old calls usable, hooks enforce product policy, the signal carries cancellation, progress makes long work observable, scheduling protects order, and result messages keep failures available to the model.

Chapter 6 follows those messages across the richer Agent transcript and the provider conversion boundary. It explains why Tool details can serve the UI while only text and image content enter the normal model-facing result.

Source review for this chapter is pinned to Pi `0.84.2` at commit `a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c`. Primary files are `packages/ai/src/types.ts` and `utils/validation.ts`; `packages/agent/src/types.ts`, `agent-loop.ts`, and `agent.ts`; `packages/coding-agent/src/core/extensions/types.ts`, `runner.ts`, `wrapper.ts`, and `loader.ts`; `core/agent-session.ts`; and the Tool implementations under `packages/coding-agent/src/core/tools/`.

[Chapter 6: Message system](ch06-messages.md)
