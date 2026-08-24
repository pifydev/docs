---
title: 'Chapter 5: The Tool system'
description: Tool schemas, runtime execution, hooks, progress events, errors, and parallel batches in Pi.
translation_key: ch05-tool-system
language: en
chapter: 5
source_url: 'https://www.dgzhuya.com/modules/ch05-tool-system'
official_refs:
  - 'https://github.com/badlogic/pi-mono/blob/main/packages/agent/README.md#tools'
terms_used:
  - Tool
  - ToolCall
  - ToolResultMessage
  - AgentTool
status: reviewed
last_updated: '2026-08-24'
translator: Pify maintainers
reviewed_by: Pify maintainers
---
A Tool is a typed capability that the model may request. Pi separates the Tool definition sent to the model from the runtime implementation that validates arguments, performs the effect, reports progress, and returns content.

## 1. Tool definition and runtime implementation

At the model layer, `Tool<TParameters>` contains three fields:

- `name`, the protocol identifier used in `ToolCall.name`;
- `description`, which tells the model when to use the Tool;
- `parameters`, a TypeBox schema for arguments.

Agent core extends that shape with `AgentTool`:

```typescript
interface AgentTool<TParameters extends TSchema, TDetails>
  extends Tool<TParameters> {
  label: string;
  prepareArguments?: (args: unknown) => Static<TParameters>;
  execute: (
    toolCallId: string,
    params: Static<TParameters>,
    signal?: AbortSignal,
    onUpdate?: AgentToolUpdateCallback<TDetails>,
  ) => Promise<AgentToolResult<TDetails>>;
  executionMode?: "parallel" | "sequential";
}
```

`label`, `execute`, progress details, and execution mode are runtime concerns. They are not sent to the model as part of the Tool schema.

## 2. Define a Tool

This example reads one UTF-8 file and reports its path and size to the UI:

```typescript
import { Type } from "@earendil-works/pi-ai";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { readFile } from "node:fs/promises";

const readTextFile: AgentTool = {
  name: "read_text_file",
  label: "Read text file",
  description: "Read a UTF-8 text file from the current project",
  parameters: Type.Object({
    path: Type.String({ description: "Project-relative file path" }),
  }),
  executionMode: "parallel",
  execute: async (_toolCallId, params, signal, onUpdate) => {
    if (signal?.aborted) throw new Error("Tool execution aborted");

    onUpdate?.({
      content: [{ type: "text", text: `Reading ${params.path}` }],
      details: { path: params.path, phase: "reading" },
    });

    const text = await readFile(params.path, "utf8");
    return {
      content: [{ type: "text", text }],
      details: { path: params.path, bytes: Buffer.byteLength(text) },
    };
  },
};
```

The `content` array is visible to the model. `details` is application metadata for logs or UI rendering and is not part of the normal LLM transcript.

## 3. The execution pipeline

Every `ToolCall` follows the same stages:

1. Emit `tool_execution_start`.
2. Resolve an `AgentTool` by `ToolCall.name`.
3. Apply `prepareArguments`, if defined.
4. Validate the effective arguments against the TypeBox schema.
5. Run `beforeToolCall`; it may allow or block execution.
6. Call `execute()` and forward progress through `tool_execution_update`.
7. Run `afterToolCall` and emit `tool_execution_end`.
8. Append a `ToolResultMessage` linked by `toolCallId`.

Unknown Tools, invalid arguments, blocked calls, and thrown errors still produce a Tool result. This keeps the transcript valid: every call receives a result that the model can interpret.

## 4. Argument compatibility

`prepareArguments` is a compatibility shim for raw model output before schema validation. Use it only for deterministic normalization, such as mapping a legacy field name to the current field.

Do not use it to bypass validation or perform external effects. The returned object must satisfy the declared schema.

## 5. Hooks

`beforeToolCall` runs after argument validation and can enforce application policy:

```typescript
agent.beforeToolCall = async ({ toolCall, args }) => {
  if (toolCall.name === "bash" && String(args.command).includes("rm -rf")) {
    return { block: true, reason: "Destructive command blocked" };
  }
};
```

`afterToolCall` runs after execution and may replace content, details, error state, usage, added Tool names, or the termination hint. Use it for redaction, audit metadata, and result normalization.

Hooks are policy boundaries. The Tool implementation should still validate domain assumptions and honor its `AbortSignal`.

## 6. Errors

Throw an `Error` when execution fails. Agent core catches the error and creates a `ToolResultMessage` with `isError: true`.

Do not return a successful content block that merely says an operation failed. That hides the failure from the runtime and makes UI, retry, and audit behavior unreliable.

## 7. Parallel and sequential batches

Agent core runs Tool calls in parallel by default. Set `toolExecution: "sequential"` on the agent to serialize all calls, or set `executionMode: "sequential"` on one `AgentTool` when that Tool cannot safely overlap with others.

If any Tool in a batch requires sequential execution, Pi executes the entire batch sequentially. In parallel mode:

- calls may finish in any order;
- completion events are emitted when each call finalizes;
- persisted `ToolResultMessage` records remain in assistant source order.

Choose sequential mode for shared mutable resources, interactive prompts, or operations whose order changes their meaning.

## 8. Early termination

`execute()`, a blocked `beforeToolCall`, or `afterToolCall` may return `terminate: true`. The hint asks the loop to skip the automatic follow-up model call after the batch.

Termination takes effect only when every finalized result in the batch sets the hint. A mixed batch continues so the model can process all results.

## 9. Security rules

A Tool crosses from model output into application effects. Treat that boundary as untrusted input:

1. Keep the schema narrow and reject unknown shapes.
2. Resolve paths against an approved root before file access.
3. Separate read-only and mutating capabilities.
4. Apply timeouts, output limits, and cancellation.
5. Redact secrets before returning content or emitting logs.
6. Record enough metadata to audit the effect without storing credentials.

The model's decision to call a Tool is not authorization. Authorization belongs to application policy.

## 10. Result contract

`ToolResultMessage` preserves `toolCallId`, `toolName`, content, optional details and usage, `isError`, and a timestamp. Provider adapters translate that normalized result into the wire format expected by the next model call.

[Chapter 6](ch06-messages.md) describes the message types that carry tool calls and results across the model and agent layers.
