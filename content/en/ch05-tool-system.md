---
title: 'Chapter 5: Tool System'
translation_key: ch05-tool-system
language: en
chapter: 5
source_url: 'https://www.dgzhuya.com/modules/ch05-tool-system'
official_refs: []
terms_used: []
status: translated
last_updated: '2026-08-20'
translator: hypnguyen1209
reviewed_by: null
code_blocks: 29
code_lines: 279
mermaid_blocks: 0
---
# Chapter 5: Tool System: The Pipeline That Turns "Calling a Function" Into a Controlled Process

> Chapter 3 traced the journey from "the model decides to call the read tool" to "the tool result returns to the model". But at that point we treated it as a black box: we only said "Loop executes the tool" without explaining how.

This chapter opens that black box.

When the model reply contains a directive like this:


```
{ "type": "toolCall", "id": "call_abc123", "name": "read", "arguments": { "path": "src/main.ts" } }
```


From this directive to the file content returning to the model, what happened in between?

Your first reaction might be: find the `read` tool, read the file, stuff the content into a message, done. But reality is not that simple: the model may pass parameters of the wrong type (`path: 12345` instead of `"src/main.ts"`), the model may request executing a dangerous command (`rm -rf /`), and the tool itself may throw an exception (file does not exist).

Pi uses a **five-step pipeline** to solve these problems: parameter preprocessing -> Schema validation -> permission interception -> tool execution -> result post-processing. Each step has a clear responsibility; an error in any step will not "explode" the entire loop.

But before talking about the pipeline, we need to clarify a more fundamental question: **how exactly is a tool defined?** Why does Pi design three layers of types to describe "a tool"?

---

## 1. Three layers of types: why must "one tool" be defined across three layers?

### Layer 1: Tool: a "name card"

Open `packages/ai/src/types.ts` and you will see the lowest-level tool definition:


```
// packages/ai/src/types.ts:433-437
export interface Tool<TParameters extends TSchema = TSchema> {
 name: string; // Tool name, Such as "read", "bash"
 description: string; // give LLM See tool description
 parameters: TParameters; // parametric JSON Schema(use TypeBox definition)
}
```


Three fields. A tool is just something that has a name, a description, and a parameter Schema.

This interface lives in the `pi-ai` layer: the pure model-adaptation layer. The only thing it cares about is: **how to tell the model about the tool.** `name` and `description` show up in the API request sent to the model; `parameters` tells the model "what arguments you may pass".

At this layer, the tool is only **a name card**. It can describe itself, but cannot execute anything.

### Layer 2: AgentTool: "execution capability" added

When Agent Loop wants to execute a tool call, a name card is not enough. It needs to know **how to execute** this tool, whether the tool **can run in parallel**, and whether the parameter format needs **preprocessing**.

So the `pi-agent-core` layer extends `AgentTool` on top of `Tool`:


```
// packages/agent/src/types.ts:371-394
export interface AgentTool<TParameters, TDetails>
 extends Tool<TParameters> // inheritance Tool The three fields of
{
 label: string; // Tags for people to see(different from giving LLM of description)
 prepareArguments?: (args: unknown) => Static<TParameters>; // Compatibility spacer
 execute: (// Execute function
 toolCallId: string,
 params: Static<TParameters>,
 signal?: AbortSignal,
 onUpdate?: AgentToolUpdateCallback<TDetails>,
) => Promise<AgentToolResult<TDetails>>;
 executionMode?: "sequential" | "parallel"; // execution mode
}
```


From `Tool` to `AgentTool`, four fields are added. Each has a clear purpose:

- **`label`**: the model sees `name` (e.g., "read"), the UI sees `label` (e.g., "Read file")
- **`prepareArguments`**: a compatibility layer that deals with quirks of different models' parameter output (covered in detail later)
- **`execute`**: the function that does the real work: when the model says "read the file", this function reads
- **`executionMode`**: marks whether this tool can run in parallel with other tools

### Layer 3: ToolDefinition: product layer adds more

At the `pi-coding-agent` layer (product runtime layer), tools need more capabilities: custom rendering (how does the `read` tool display in the terminal? how does the `edit` tool show diffs?), prompt injection (some tools need a usage guide snippet in the system prompt).

So a third layer `ToolDefinition` appears. Its `execute` function has one more parameter than `AgentTool`: `ctx: ExtensionContext`: letting tool execution access the current session state:


```
AgentTool.execute: (toolCallId, params, signal, onUpdate) => ...
ToolDefinition.execute: (toolCallId, params, signal, onUpdate, ctx) => ...
 ^^^
 More ExtensionContext(session context)
```


`ToolDefinition` also adds `promptSnippet` (system prompt fragment), `renderCall` (render at call time), `renderResult` (render at result time) and other UI-related fields.

### Bridging two layers: `wrapToolDefinition`

Agent Loop only understands `AgentTool`, but the tools in the product layer are all `ToolDefinition`. Who turns `ToolDefinition` into `AgentTool`?

The answer is a wrapper function of only a dozen lines:

Notice the last line. `AgentTool`'s `execute` has only 4 parameters, but `ToolDefinition`'s `execute` has 5. The wrapper uses a closure to capture `ctxFactory`, dynamically creating an `ExtensionContext` on each call and injecting it as the 5th parameter. **Agent Loop never knows that `ExtensionContext` exists.**


```
// packages/coding-agent/src/core/tools/tool-definition-wrapper.ts
export function wrapToolDefinition(definition, ctxFactory?) {
 return {
 name: definition.name,
 label: definition.label,
 description: definition.description,
 parameters: definition.parameters,
 prepareArguments: definition.prepareArguments,
 executionMode: definition.executionMode,
 // key: rewrite execute, Injection via closure ExtensionContext
 execute: (toolCallId, params, signal, onUpdate) =>
 definition.execute(toolCallId, params, signal, onUpdate, ctxFactory?.()),
 };
}
```


### Why must we have three layers?

Why not stuff every field into a single `Tool` interface, with a few optional fields?

It will not work. The reason is **each layer has its own dependency scope**. The `Tool` interface in the `pi-ai` layer only depends on TypeBox's `TSchema`. If we add `renderCall` (returning a terminal UI component) to that interface, `pi-ai` would have to depend on the terminal UI rendering library. But `pi-ai` is the pure model-adaptation layer: its job is just "format tool info into API requests", it should not know what the terminal UI looks like.

The essence of the three-layer progression is: **each layer only adds capabilities that its own level needs, without crossing the line.** `Tool` handles "I can describe myself", `AgentTool` handles "I can be executed", `ToolDefinition` handles "I can be displayed and extended".

---

## 2. Five-step pipeline: a tool call is not "just call a function"

Now that the type definitions are clear, look at the actual execution process of a tool call.

**Diagram caption:** A five-step vertical pipeline from `ToolCall` to `ToolResultMessage`: `prepareArguments` -> `validate` -> `beforeToolCall` -> `execute` -> `afterToolCall`. On the right of each step there is a failure branch (dashed arrow), but all failures eventually converge into a message with `isError: true`, and the loop is not broken by an exception.

### Why cannot we just call the function directly?

The simplest handling: find the `read` tool -> read the file -> stuff the content into `ToolResultMessage` -> done. One function call, intuitive.

But model outputs are not always well-behaved:

- **Wrong parameter format**: the `Edit` tool expects `edits` to be an array, but some models serialize the array as the string `"[{...}]"`
- **Wrong parameter type**: the `Read` tool's `path` parameter is `string`, but the model may pass a number `12345`
- **Dangerous operations**: the model asks to run `rm -rf /`, does your Agent do it?

These issues mean "directly calling the function" is not enough. You need a few checkpoints before execution.

### Pi's answer: the five-step pipeline

Each step has clear responsibility and exit mechanism. The first 3 steps are "preparation": failure in any step does not execute the tool. Step 4 is "doing the work". Step 5 is "wrapping up". Let us expand step by step.


```
LLM output ToolCall
 │
 ▼
┌──────────────────────────────────────────────────┐
│ No. 1 step: prepareArguments(Parameter preprocessing) │
│ Process LLM The parameter quirks of │
│ Such as: Parse stringified array back to real array │
├──────────────────────────────────────────────────┤
│ No. 2 step: validateToolArguments(Schema Verify) │
│ use TypeBox Schema Do runtime type checking │
│ Such as: path Yes string, No number │
├──────────────────────────────────────────────────┤
│ No. 3 step: beforeToolCall(Prehook) │
│ Product layer permission interception, Can prevent execution │
│ Return { block: true, reason: "Dangerous order"} │
├──────────────────────────────────────────────────┤
│ No. 4 step: tool.execute(actual execution) │
│ calling tools execute function │
│ support onUpdate Streaming progress callback │
├──────────────────────────────────────────────────┤
│ No. 5 step: afterToolCall(rear hook) │
│ Product layer result post-processing, The return value can be modified │
│ can be replaced content, details, isError │
└──────────────────────────────────────────────────┘
 │
 ▼
ToolResultMessage
```


### Step 1: `prepareArguments`: compatibility shim

Different models' APIs have subtle differences when serializing tool parameters. `prepareArguments` is the compatibility layer prepared for these differences.

For example, the `Edit` tool expects `edits` to be an array. If the tool does not define `prepareArguments`, parameters are passed through directly. The code at this step is simple: use it if present, skip if not.

**Why not handle this in Schema validation?** Because they focus on different things. `prepareArguments` is "I know which mistake a particular model makes": a compatibility layer: handling only known issues of specific models. `validateToolArguments` is "regardless of who calls me I must validate": a safety layer: guaranteeing parameter types are correct. One is compatibility, the other is correctness; mixing them would make the code hard to maintain.


```
// The model actually comes from(Some models JSON Array serialized into string)
{ edits: "[{\"oldText\":\"hello\",\"newText\":\"world\"}]" }

// passed prepareArguments After processing
{ edits: [{ oldText: "hello", newText: "world" }] }
```


### Step 2: `validateToolArguments`: Schema validation

After preprocessing, parameters still need to pass a TypeBox runtime type check. For example, `path` is defined as `string`, but the model passes a number:

Validation errors are caught by the `try-catch` of `prepareToolCall`, which generates an error `ToolResultMessage`. **Tools will never receive parameters of the wrong type.**

### Step 3: `beforeToolCall`: pre-hook (can block execution)

After parameter validation passes, before execution, the product layer has one more interception opportunity. `beforeToolCall` is a callback function that can check whether a command is dangerous:

| Return value | Effect |
| --- | --- |
| `undefined` | allow through, continue executing the tool |
| `{ block: true, reason: "Dangerous command" }` | block execution, generate an error `ToolResultMessage` |

**Note**: even when the tool is blocked, the result is still a normal `ToolResultMessage`, just with `isError: true`. The model will see this error message, know the command was rejected, and decide the next step (try another command, or explain to the user why it cannot be executed). **The entire process throws no exception and does not break the loop.**

### Step 4: `tool.execute`: actual execution

After the first 3 steps pass, the tool's `execute` function is called. Let us look at its signature again:


```
Before: { path: 12345 }
After: Authentication failed → Report an error → Don't execute tool
```


Four parameters: `toolCallId` is the ID of this call, `params` is the validated parameters, `signal` is the `AbortSignal` used for cancellation (triggered when the user presses Ctrl+C). What is the fourth, `onUpdate`?

**It solves the problem of "long-task progress awareness".** Suppose the Bash tool has to run a 30-second command: if it can only report to the outside at "start execution" and "execution complete", during those 30 seconds the user can only stare at the loading animation. `onUpdate` lets the tool **push messages outward while executing**: the Bash tool pushes the current terminal output every 100ms, the Grep tool pushes every time it finds a batch of matches, the Read tool reports progress in chunks when reading a large file. These pushes are wrapped as `tool_execution_update` events and flow to the UI.

In short: **without `onUpdate`, tool execution is a black box; with it, tool execution is "observable".** This is the key mechanism that lets tools report progress to the user in real time.

But there is an edge case that needs handling. The tool's `execute` is an async function; after it `return`s, there may still be unfinished async operations inside: for example the Bash tool's child process is asynchronously printing the last few lines of log after the main command returns. If these delayed callbacks still push data to `onUpdate`, they will pollute a tool call that has already finished, confusing the UI context. Pi uses an `acceptingUpdates` flag to solve this: once `execute` returns (or throws), immediately turn off the flag; all subsequent `onUpdate` calls are silently discarded. This is a defensive engineering detail, not complex, but must exist.

Where do the messages pushed by `onUpdate` flow? This question is important: it is the core topic of the next chapter, the "message system", which we will expand there. For now you only need to remember: tool execution is not a black box, progress is observable.

What if `tool.execute()` throws an exception? Don't worry, §4 will explain in detail how this is handled: spoiler: the exception is translated into an `isError: true` message sent to the model.

### Step 5: `afterToolCall`: post-hook (can modify the result)

After the tool finishes execution, the product layer has one more chance to modify the result. `afterToolCall` can do these things:

| Scenario | What to do | How |
| --- | --- | --- |
| Redact | Replace sensitive info returned by the tool | Return `{ content: [{type:"text", text:"[REDACTED]"}] }` |
| Audit | Record detailed info of the tool call | Read result, write log, return `undefined` (don't change result) |
| Fix error | Turn the tool's error result into a normal result | Return `{ isError: false, content: [...] }` |
| Early stop | Make Agent stop after the current batch | Return `{ terminate: true }` |

The merge semantics is field-level override: provide it to replace, leave it out to keep the original value.

### Pipeline's end: `ToolResultMessage`

After the five steps, regardless of what happened in the middle, the final product is always a `ToolResultMessage`:


```
execute: (toolCallId, params, signal, onUpdate) => Promise<AgentToolResult>
```


This message is appended to the conversation history and sent to the model as context in the next loop iteration. The model sees "the file content is like this", then decides the next step: maybe edit, maybe read another file, maybe answer the user directly.

**All errors eventually become the same thing: an `isError: true` `ToolResultMessage`.** The model sees the error message, knows something went wrong, then decides how to handle it itself. Why is this design the best practice? §4 will elaborate.

---

## 3. Parallel vs serial: a batch of tools is not "run them together"

**Diagram caption:** The top shows the "one-vote-veto" decision: as long as one tool declares `sequential`, the whole batch runs serially. On the left is the green three-phase design (sequential prepare -> parallel execute -> ordered events), on the right is the black waterfall serial execution. At the bottom is the explanation of "why the prepare phase must be sequential" and "when to use serial".

### Models often call multiple tools at once

In the inner loop of Agent Loop, a single model reply may contain multiple ToolCalls:


```
{
 role: "toolResult",
 toolCallId: "call_abc123", // related to original ToolCall
 toolName: "read",
 content: [{ type: "text", text: "1│ import { Agent }..." }],
 details: { language: "typescript" }, // give UI metadata
 isError: false, // Is it an error result?
 timestamp: 1700000000000,
}
```


Three ToolCalls, all read-only operations. Intuition tells us we should run them in parallel: use `Promise.all` to run them together, save time.


```
assistantMessage.content = [
 { type: "text", text: "Let me check the file" },
 { type: "toolCall", id: "call_1", name: "read", arguments: {path: "a.ts"} },
 { type: "toolCall", id: "call_2", name: "grep", arguments: {pattern: "TODO"} },
 { type: "toolCall", id: "call_3", name: "find", arguments: {pattern: "*.test.ts"} },
]
```


### But parallel is not blindly `Promise.all`

If two of the three ToolCalls are `edit` (modifying the same file), parallel execution will overwrite each other:

So Pi needs a mechanism to judge "which tools can run in parallel, which must run serially".

### Pi's scheduling strategy: one-vote veto

Pi's strategy is simple: **as long as one tool is marked `sequential`, the entire batch runs serially**:

**Why a one-vote veto instead of only serializing the conflicting tools?** Because "which tools will conflict" is hard to judge precisely. Can two `edit`s running on different files be parallel? What if the files they edit have dependency relationships? Pi chose the conservative strategy: **better to wait longer than to make a mistake**.


```
ToolCall 1: edit { path: "app.ts", oldText: "v1", newText: "v2" }
ToolCall 2: edit { path: "app.ts", oldText: "v3", newText: "v4" }
 ^^^^^^^^
 same file！Parallel execution → ToolCall 1 The modification was ToolCall 2 Cover
```


### Three-phase design of parallel execution

When it is decided that parallel execution is OK, Pi does not simply `Promise.all` and call it done: it splits execution into three phases:

Why design it this way? Because **the prepare phase may have side effects** (`beforeToolCall` may modify shared state) and must run serially. And **the order of result messages the model depends on is the call order** (the model first asks `read`, then `grep`, the messages must be in that order), so `ToolResultMessage` must be ordered. Only `tool.execute()` is parallel.

> One more detail: all 7 built-in tools in v0.80.2 (read/write/edit/bash/grep/find/ls) **do not explicitly declare `executionMode`**, they all default to `"parallel"` (the `ToolExecutionMode` type is in `agent/src/types.ts:41`, runtime checks whether it is `"sequential"` only at `agent-loop.ts:382`, undeclared is treated as parallel). So how does the Edit tool guarantee file safety? The answer is the tool's internal `withFileMutationQueue` (file mutation queue, `file-mutation-queue.ts:32-61`): Edit calls it in `edit.ts:312`, ensuring serialization of edits to the **same file**. This is a second line of defense the tool itself builds, with no need to rely on the outer `executionMode` declaration. **Extension tools that need serial execution can explicitly declare `executionMode: "sequential"`.**


```
// Check if serial tools are available
const hasSequentialToolCall = toolCalls.some(
 (tc) => tools?.find((t) => t.name === tc.name)?.executionMode === "sequential",
);

// There are serial tools → whole batch serial; No → Parallel
if (config.toolExecution === "sequential" || hasSequentialToolCall) {
 return executeToolCallsSequential(...);
}
return executeToolCallsParallel(...);
```


---

## 4. Never throw: a tool error is also a message

In the five-step pipeline of §2 above, every step's error was encoded as an `isError: true` `ToolResultMessage`. It seems errors are already handled.

But you might ask: what if `tool.execute()` internally throws an uncaught exception? When tool developers write code, anything can happen: file does not exist, permission denied, command timed out, JSON parse failed. If these exceptions are not handled, they will penetrate all the way through the pipeline and break Agent Loop.

This section answers: **when a tool execution errors, how does Pi handle it? Why is this handling the "best practice"?**

### Unified error exit: 6 kinds of errors, 1 kind of product

Looking back at the entire five-step pipeline, every step of a tool call can fail. But you will notice an amazing pattern: **regardless of which step errors, the final product is always the same thing: an `isError: true` `ToolResultMessage`.**

| Which step errors | How to handle | Final product |
| --- | --- | --- |
| Tool not found | directly return error result, do not enter the pipeline | `ToolResultMessage { isError: true, content: "Tool xxx not found" }` |
| `prepareArguments` throws | caught by try-catch | `ToolResultMessage { isError: true, content: exception info }` |
| Schema validation fails | caught by try-catch | `ToolResultMessage { isError: true, content: validation error description }` |
| `beforeToolCall` blocks | return block result | `ToolResultMessage { isError: true, content: block reason }` |
| **`tool.execute` throws** | caught by `executePreparedToolCall`'s try-catch | `ToolResultMessage { isError: true, content: exception info }` |
| `afterToolCall` throws | caught by `finalizeExecutedToolCall`'s try-catch | `ToolResultMessage { isError: true, content: exception info }` |

Notice the right column: **the final form of every error is `ToolResultMessage`**. Not a single error escapes the pipeline as a "thrown exception".


```
stage 1 - Prepare(sequential execution): 
 ToolCall 1: emit_start → prepareArguments → validate → beforeToolCall
 ToolCall 2: emit_start → prepareArguments → validate → beforeToolCall
 ToolCall 3: emit_start → prepareArguments → validate → beforeToolCall
 // The preparation phase must be in sequence, because beforeToolCall may have side effects(Such as modifying the global status)

stage 2 - execute(Parallel): 
 ToolCall 1: execute ────────────────┐
 ToolCall 2: execute ───────────────┤ Promise.all
 ToolCall 3: execute ───────────────┘
 // only tool.execute() Parallel

stage 3 - Event sending(orderly): 
 ToolCall 2: emit_end ← First to finish first tool_execution_end
 ToolCall 1: emit_end
 ToolCall 3: emit_end
 ToolCall 1: emit_result ← But ToolResultMessage Send in order of calling
 ToolCall 2: emit_result
 ToolCall 3: emit_result
```


### Key code: dual protection of `tool.execute`

The most critical layer is in `executePreparedToolCall()`: it wraps `tool.execute()`, the most error-prone part:

This code does three things, each corresponding to a key engineering decision:

**1. Exceptions are caught, not propagated.** Whatever exception `tool.execute()` throws: `ENOENT` for file not found, `EACCES` for permission denied, `TIMEOUT` for command timeout, `SyntaxError` for JSON parse failure: all are stopped here.

**2. Exceptions are "translated" into normal results.** The catch block calls `createErrorToolResult(error.message)`, turning the exception object into an `AgentToolResult`: looking just like a normal result, except the `content` contains the error description text. From this moment on, it is no longer an "exception" but "a message marked with an error".

**3. Progress events are flushed before encoding the error.** The `await Promise.all(updateEvents)` in the catch block is not optional: it guarantees that all `tool_execution_update` events emitted during tool execution are delivered before the error message is emitted. Otherwise the event sequence would be disordered and the UI would see the weird picture of "the tool first reports an error, then spits out the last line of progress".


```
// packages/agent/src/agent-loop.ts:628-669
async function executePreparedToolCall(prepared, signal, emit) {
 const updateEvents: Promise<void>[] = [];
 let acceptingUpdates = true; // Tools Promise settle Close after

 try {
 const result = await prepared.tool.execute(
 prepared.toolCall.id,
 prepared.args,
 signal,
 (partialResult) => {
 if (!acceptingUpdates) return; // settle The orphan callback after
 updateEvents.push(/* ... send tool_execution_update ... */);
 },
);
 acceptingUpdates = false;
 await Promise.all(updateEvents);
 return { result, isError: false };

 } catch (error) {
 acceptingUpdates = false;
 // key: Wait for all progress events to be sent first, Then encode the exception into a message
 await Promise.all(updateEvents);
 return {
 result: createErrorToolResult(
 error instanceof Error ? error.message: String(error)
),
 isError: true,
 };
 } finally {
 acceptingUpdates = false; // Keep everything in mind: Close the floodgates no matter what
 }
}
```


### Exception -> message: before/after encoding comparison

The comparison below lets you see the essence of "exception translated into a message":

The difference between an exception and a message is not in "what the content is": both describe the same thing: but in **who the receiver is**. The receiver of an exception is the call stack (outer framework), which will break the loop; the receiver of a message is the model, which will digest the error and continue. Pi chooses to translate exceptions into messages, making "tool error" a normal, processable information flow visible to the model.

### Why is "disguising as a message" the best handling?

You might think: why throw the exception out and let the outer layer handle it uniformly? Why bother translating into a message that "looks like a normal result"?

The core of the answer is: **letting the model decide the next step is better than the framework deciding for it.**

Consider these real tool error scenarios:

| Error scenario | Reasonable reaction after the model sees the error message |
| --- | --- |
| `read("/path/a.ts")` says "file does not exist" | The model may first `ls` to see what's in the directory, find the correct filename, then read |
| `edit` says "oldText not found in file" | The model may first `read` the file to see actual content, adjust oldText, then retry |
| `bash("npm run build")` says "module not found" | The model may `npm install` then build again |
| `bash("rm -rf /")` is blocked by `beforeToolCall` | The model sees the block reason, switches to a safer approach or explains to the user |

In each scenario, **the correct next step is different, and only the model has enough context to decide which path to take**. The framework does not know that "file does not exist" is because the path was typed wrong or because a different file should be chosen; the model knows: it knows what it was trying to do, knows the project's file structure (the previous read/grep results are all in the conversation history), knows the user's real intent.

If the framework directly throws an exception to break the loop, it gives up all of the model's self-correcting ability: the user can only manually restart after the Agent crashes. But if we encode the error as a message and send it to the model, the model has a chance to **come up with a remediation plan on its own** as in the table above. This is one of the keys that makes Agents "smarter" than traditional scripts: errors do not terminate the flow, they become inputs for the next decision.

**So Pi's tool error handling philosophy can be summarized in one sentence: the error message is feedback for the model, not a termination signal for the framework.**


```
The original exception thrown by the tool(catch before): encoded ToolResultMessage(catch after): 
Error: ENOENT: no such file or dir {
 → all the way through the pipe role: "toolResult",
 → interrupt Agent Loop toolCallId: "call_abc",
 → Incomplete sequence of events, UI stuck toolName: "read",
 content: [{
 type: "text",
 text: "ENOENT: no such file or dir"
 }],
 isError: true ← unique tag
 }
 → Append to conversation history
 → The model will be sent to the next round
 → Decide what to do after seeing the model
```


### Key detail: the more specific the error description, the stronger the model's self-correction

By now you may have a misunderstanding: "since the framework encodes exceptions into messages anyway, can I just throw an `Error("failed")` inside my tool?"

**Absolutely not.** The content of the error message directly determines whether the model can self-correct. Compare the two cases:

When the model sees "Read failed", it can only blindly retry or give up; when it sees "Offset 200 is beyond end of file (100 lines total)", it immediately understands "oh, the file only has 100 lines, my offset was wrong", and next time directly give `offset: 50` and it will work. **A specific error description equals a "how to fix it" hint for the model.**

### Pi's actual practice: two-layer error handling, layered responsibility

Looking back at the source code to see how Pi's own tools do it, you will find that it **does not rely on the framework's safety net**, but rather makes the error description specific inside the tool:

**Read tool** (`read.ts:275`): appends total line count when out of bounds:

**Edit tool** (`edit.ts:330`): appends file path and original error:

**Bash tool** (`bash.ts:390-407`): this snippet is textbook "active identification + rewrapping":


```
Ambiguous error(Not advisable): specific error.message(Recommended): 
{ {
 content: [{ text: "Read failed" }] content: [{
 isError: true text: "Offset 200 is beyond end of file (100 lines total)"
} }]
 isError: true
 }
```


Notice Bash's strategy: it **actively identifies** known error types (abort, timeout, non-zero exit code), each is packaged by `appendStatus(text,. ..)` with the "already output content" and "specific reason" into a new Error. Only when it encounters an exception that cannot be identified does it `throw err` and pass it through as-is.

This is Pi's real design: **two-layer error handling, layered responsibility**.

**Layer 1 (inside the tool, active)**: identify known error types, package them into specific, readable descriptions
 - Read / Edit / Bash all do this: Bash even attaches "already output content" to the error
 - Purpose: provide the model with concrete clues of "why it failed, how to fix it"

**Layer 2 (framework safety net, passive)**: the catch of `executePreparedToolCall`
 - Only kicks in when the tool did not identify the error
 - Does not create new error descriptions, only passes the `error.message` straight through to the model
 - Purpose: guarantee no exception ever penetrates to Agent Loop


```
if (startLine >= allLines.length) {
 throw new Error(`Offset ${offset} is beyond end of file (${allLines.length} lines total)`);
}
```


**Read tool** (`read.ts:275`): when out of bounds, appends total file line count:

The fallback catch in `executePreparedToolCall` uses the `error.message` that the tool itself threw:

The `createErrorToolResult` function body is only three lines (`agent-loop.ts:716-721`), it does not do any "unified description": whatever message the tool wrote, the model sees it. **So the more specifically the tool packages its errors internally, the more useful the error message the model sees.**


```
throw new Error(`Could not edit file: ${path}. ${errorMessage}.`);
```


**Edit tool** (`edit.ts:330`): appends file path and original error:

**Bash tool** (`bash.ts:390-407`): this snippet is textbook "active identification + rewrapping":


```
} catch (err) {
 const snapshot = await finishOutput(); // First fix the output content
 const { text } = formatOutput(snapshot, "");
 if (err instanceof Error && err.message === "aborted") {
 throw new Error(appendStatus(text, "Command aborted"));
 // ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
 // repackage: Attached"Output before abort" + "abort status"
 }
 if (err instanceof Error && err.message.startsWith("timeout:")) {
 const timeoutSecs = err.message.split(":")[1];
 throw new Error(appendStatus(text, `Command timed out after ${timeoutSecs} seconds`));
 }
 if (exitCode !== 0 && exitCode !== null) {
 throw new Error(appendStatus(outputText, `Command exited with code ${exitCode}`));
 }
 throw err; // ← key: Unrecognized exception, Throw as is, Leave it to the framework
}
```


Note Bash's strategy: it **actively identifies** known error types (abort, timeout, non-zero exit code), each is packaged by `appendStatus(text,. ..)` with "already output content" and "specific reason" into a new Error. Only when it encounters an exception that cannot be identified does it `throw err` and pass it through as-is.

This is Pi's real design: **two-layer error handling, layered responsibility**.


```
first floor(Inside the tool, Take the initiative): Identify known error types, Packed into a concrete readable description
└── Read/Edit/Bash It's all like this:Bash even put"What has been output"Attached to error
└── purpose: Provide the model with"why failed, How to change it?"specific clues

second floor(Frame cover, Passive): executePreparedToolCall of catch
└── Only takes effect when the tool is not recognized
└── Do not create new error descriptions, Just put error.message Transparently passed to the model as is
└── purpose: Ensure that any exceptions will not penetrate Agent Loop
```


The fallback catch in `executePreparedToolCall` uses the `error.message` that the tool itself threw:

The `createErrorToolResult` function body is only three lines (`agent-loop.ts:716-721`), it does not do any "unified description": whatever message the tool wrote, the model sees it. **So the more specifically the tool packages its errors internally, the more useful the error message the model sees.**


```
} catch (error) {
 return {
 result: createErrorToolResult(error instanceof Error ? error.message: String(error)),
 // ^^^^^^^^^^^^^^^^
 // Detailed description of the internal packaging of the tool, The frame doesn't move it, only transport
 isError: true,
 };
}
```


### Best practices when writing custom tools

Borrowing from the Bash tool's writing style, a custom tool's `execute` should look like this:

**Two key principles**:

1. **Always wrap errors you can identify**: attach clues of "what went wrong, why, what to do". For example, "file does not exist" is 10x stronger than "operation failed"; "file /a.ts does not exist, the directory has [b.ts, c.ts]" is another 10x stronger than "file does not exist".
2. **Do not hard-code descriptions for unrecognized errors**: just `throw err`, let the framework's fallback catch pass `err.message` through. **Do not write `throw new Error("Operation failed")` and similar vague descriptions**: that equals painting all unknown errors in the same color, and the model cannot distinguish them.

**This is why "even unknown errors should become a message"**: it does not mean "uniformly describe unknown errors as 'something went wrong'", but rather "let the framework fallback catch take over, at least guaranteeing that unknown exceptions are also translated into `isError: true` messages sent to the model, rather than penetrating to break the loop". The error description itself should still be as specific as possible; only when it is impossible to identify, let `err.message` be passed through to the model as-is.


```
execute: async (id, params, signal, onUpdate) => {
 try {
 // ... business logic
 return { content: [...], details: {...} };
 } catch (err) {
 // No. 1 step: Identify known error types, Repackage into specific description
 if (err instanceof MyKnownErrorA) {
 throw new Error(`specific descriptionA: ${err.message}. Suggested fix...`);
 }
 if (err instanceof MyKnownErrorB) {
 throw new Error(`specific descriptionB: ${err.message}. possible reasons...`);
 }
 // No. 2 step: Abnormalities that are really unrecognizable, Throw as is, Let the framework take over
 throw err;
 }
}
```


### One sentence summary

When a tool execution errors, Pi does not throw an exception to break the loop, but encodes the error into an `isError: true` `ToolResultMessage` and sends it to the model. The key here is **two-layer division of labor**: the tool's interior tries to identify known errors, package them into specific descriptions of "why it's wrong, how to fix it" (see the Bash tool's try-catch); the framework fallback layer only takes over when the tool fails to identify, passing `error.message` straight to the model. After the model receives specific error information, it decides the next step on its own: retry, switch path, or explain to the user. This is why Pi's Agent Loop can stay stable in real scenarios where tools frequently fail.

---

## 5. [Advanced] Operations abstraction: tool execution is not the same as system calls

> This section belongs to software-engineering implementation techniques and has little to do with the Agent itself. If you only care about how the Agent runs, you can skip it.

### Problem: tool code hard-codes system calls

The Read tool wants to read a file, the most intuitive way:

But what if you want to **mock the file system in tests**? What if you want the tool to **read a remote file via SSH**? What if you want the tool to **execute inside a Docker container**?

`fs.readFileSync` is hard-coded: it only recognizes the local file system. To switch execution environment, you would have to modify the tool code.


```
const content = fs.readFileSync(path, "utf-8");
```


### Solution: tools do not call system APIs directly, they call interfaces

Each of Pi's tools does not call `fs`, `child_process` and other system APIs directly. It defines a minimal interface, and the tool only depends on the interface, not the concrete implementation.

Taking the Read tool as an example:

Inside the Read tool's `execute` function, all file operations are called through the `ops` object:

**Key difference:** direct call vs through interface. With direct `fs` call, the Read tool can only read local files and tests must create real files. Through the `Operations` interface, what you inject is what gets called.


```
export interface ReadOperations {
 readFile: (absolutePath: string) => Promise<Buffer>;
 access: (absolutePath: string) => Promise<void>;
 detectImageMimeType?: (absolutePath: string) => Promise<string | null>;
}
```


Inside the Read tool's `execute` function, all file operations are called through the `ops` object:


```
execute: async (toolCallId, params, signal, onUpdate, ctx) => {
 const ops = options?.operations ? defaultReadOperations;
 await ops.access(absolutePath); // Check permissions via interface
 const buffer = await ops.readFile(absolutePath); // Reading files through the interface
 // ...
}
```


**Key difference:**


```
Directly adjust fs(hardcoded): Pass Operations interface(Replaceable): 
┌──────────────────────┐ ┌──────────────────────┐
│ Read Tools │ │ Read Tools │
│ fs.readFile(path) │ │ ops.readFile(path) │
│ Can only read local files │ │ local / SSH / Mock │
│ Tests must create real files │ │ Adjust whatever you inject. │
└──────────────────────┘ └──────────────────────┘
```


Operations are captured by closure **at tool creation time**. Every subsequent execution uses the same implementation. Different environments inject different Operations implementations, the tool code does not change a single line:


```
// local execution(Default)
const tool = createReadToolDefinition(cwd); // use defaultReadOperations

// Unit testing(Mock)
const tool = createReadToolDefinition(cwd, {
 operations: {
 readFile: () => Buffer.from("mock file content"), // No need to create real files
 access: () => {}, // If no exception is thrown, the file exists.
 }
});

// remote execution(SSH, hypothesis)
const tool = createReadToolDefinition(cwd, {
 operations: {
 readFile: (path) => sshExec(`cat ${path}`),
 access: (path) => sshExec(`test -r ${path}`),
 }
});
```


### Each tool defines its own minimal interface

Looking at the seven built-in tools' Operations interfaces, they are minimal and on-demand, not one-size-fits-all. **Each tool only declares the methods it needs, no more, no less.**

| Tool | Interface | Methods |
| --- | --- | --- |
| Read | `ReadOperations` | `readFile`, `access` (also optional `detectImageMimeType`) |
| Write | `WriteOperations` | `writeFile`, `mkdir` |
| Edit | `EditOperations` | `readFile`, `writeFile`, `access` |
| Bash | `BashOperations` | `exec` |
| Grep | `GrepOperations` | `isDirectory`, `readFile` |
| Find | `FindOperations` | `exists`, `glob` |
| Ls | `LsOperations` | `exists`, `stat`, `readdir` |

Read tool does not need to write files, so `ReadOperations` has no `writeFile`. Grep tool only needs to check the path and read file content to display context, so its interface is the most minimal. **Each tool only declares the methods it needs, no more, no less.**

> Source: `read.ts:43-50` / `write.ts:25-30` / `edit.ts:74-81` / `bash.ts:40-58` / `grep.ts:51-56` / `find.ts:41-46` / `ls.ts:32-39`

---

## 6. Methodology distillation

Looking back at the entire tool system, there are four design patterns worth reusing in your own Agent project:

**1. Layered interface progression**: the base layer only handles "can describe" (Tool), the runtime layer adds "can execute" (AgentTool), the product layer adds "can display and extend" (ToolDefinition). Bridging layer differences through wrappers.

**2. Pipeline + hooks pattern**: the core flow is a pipeline (prepare -> validate -> execute), with one hook before and after the pipeline (before/after), which can intercept or modify. Errors in any step inside the pipeline do not throw exceptions; they are uniformly encoded as normal messages.

**3. Errors-as-messages principle**: every error at every step of tool execution is uniformly encoded as an `isError: true` `ToolResultMessage` and sent to the model. The model decides the next step on its own based on the error information: retry, switch path, or explain to the user. Even unknown exceptions are caught with `String(error)` as a fallback message; never let raw exceptions penetrate to break Agent Loop.

**4. Operations abstraction**: tools do not call system APIs directly, but indirectly through a minimal Operations interface. Tests can mock, remote can SSH, without modifying tool code.

---

## 7. Closing

Back to the opening question: "when the model says 'read this file', what happened?"

Now you have the complete answer:


```
Model output ToolCall { name: "read", arguments: { path: "src/main.ts" } }
 │
 ├── No. 1 step: prepareArguments Handling model quirks
 ├── No. 2 step: validateToolArguments do Schema Verify
 ├── No. 3 step: beforeToolCall Check permissions
 ├── No. 4 step: tool.execute Pass Operations Interface to read files
 │ └── ops.readFile() → Not directly adjusted fs
 └── No. 5 step: afterToolCall Post-process the results
 │
 ▼
ToolResultMessage { content: File content, isError: false }
 │
 ▼ Append to conversation history, The model will be sent to the next round
```


Tools are not simple function calls, but a controlled pipeline. Parameter validation blocks bad data, hooks intercept dangerous operations, the Operations abstraction lets the same code run both locally and remotely. All tool errors: from parameter validation failures to unknown exceptions thrown by `execute`: are translated into an `isError: true` `ToolResultMessage` sent to the model, letting the model decide the next step; the loop will never crash because of a tool error.

But there is one more question: who is listening to the `tool_execution_start`, `tool_execution_update`, `tool_execution_end` events emitted during tool execution? Why does the Agent core need to know nothing about the UI?

Next chapter, we open the Agent's "memory system": the message system. No, wait: before that, there is a more fundamental question: what exactly do these messages look like? What are the structures of tool result messages, model reply messages, user input messages? Are the internal messages of the Agent the same as the messages sent to the model?

---

> **Key source index for this chapter**:
> 
> `packages/ai/src/types.ts:433-437`: `Tool` (Layer 1)
> `packages/agent/src/types.ts:371-394`: `AgentTool` (Layer 2)
> `packages/coding-agent/src/core/extensions/types.ts:435-482`: `ToolDefinition` (Layer 3)
> `packages/coding-agent/src/core/tools/tool-definition-wrapper.ts:5-18`: `wrapToolDefinition` (wrapper)
> `packages/agent/src/agent-loop.ts:562-626`: `prepareToolCall` (first 3 steps of pipeline)
> `packages/agent/src/agent-loop.ts:628-669`: `executePreparedToolCall` (step 4 + framework fallback catch)
> `packages/agent/src/agent-loop.ts:671-714`: `finalizeExecutedToolCall` (step 5)
> `packages/agent/src/agent-loop.ts:716-721`: `createErrorToolResult` (error message pass-through)
> `packages/coding-agent/src/core/tools/bash.ts:390-407`: Bash tool's exemplary active error identification
> `packages/coding-agent/src/core/tools/read.ts:275`: Read tool appends total line count
> `packages/coding-agent/src/core/tools/edit.ts:330`: Edit tool appends file path
> `packages/coding-agent/src/core/tools/read.ts:43-50`: `ReadOperations` (Operations abstraction)

---

> **Version note**
> This chapter is written against Pi **v0.80.2**. Code analysis follows the [earendil-works/pi](https://github.com/earendil-works/pi) repository (tutorial links may point at `main` and differ slightly from v0.80.2).


---

> **Next up**
> [Chapter 6: Message System](ch06-messages.md)
