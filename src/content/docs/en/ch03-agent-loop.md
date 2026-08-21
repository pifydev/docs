---
title: "Chapter 3: Agent Loop: The Engine That Spins the Model"
chapter: 3
slug: en/ch03-agent-loop
title_zh: "第3章：Agent Loop: 让模型转动起来的引擎"
title_en: "Chapter 3: Agent Loop: The Engine That Spins the Model"
title_vi: "Chương 3: Agent Loop: Động cơ quay mô hình"
source_url: https://www.dgzhuya.com/modules/ch03-agent-loop
language: en
version_pairs:
 zh: zh/src/ch03-agent-loop.md
 en: en/src/ch03-agent-loop.md
 vi: vi/src/ch03-agent-loop.md
original_chars: 6859
code_lines: 385
reading_minutes: 35
translator: hypnguyen1209
reviewed_by: null
last_updated: "2026-08-20"
status: translated
official_refs: []
terms_used: []
code_blocks: 37
mermaid_blocks: 0
---

# Chapter 3: Agent Loop: The Engine That Spins the Model

> The previous chapter walked through Pi's layered architecture. The architecture is just the "skeleton": the real vitality of an Agent comes from the "loop." This chapter, we start from the most basic questions: **why do we need a loop? how does it spin? when does it stop?** Then we trace the complete journey of a user message to see every heartbeat of the Agent Loop.

---

## 1. Prelude: three ways to use an LLM

Before talking about the Agent Loop, let's step back and see how many modes "using an LLM" itself has. This is essential for understanding "why we need a loop."

### Mode 1: direct call: "model, answer me"

The most primitive and intuitive usage. You build a prompt, call the API once, get the result, done.

```
user input → Build prompt words → call the model → Model output → show results
```


The code roughly looks like this:


```
const response = await llm.chat({
 messages: [
 { role: "system", content: "You are a translation assistant" },
 { role: "user", content: "Translate this code into Python" },
 ],
});
console.log(response.content);
```


**The core work is "build the prompt."** A good prompt gives a good result. One call, one output, no back-and-forth.

Applicable scenarios: translation, summarization, Q&A, code completion: anything a "one-question-one-answer" can handle.

### Mode 2: Workflow: "model, you do step one first; I check, then you do step two"

When the task gets complex, you find it hard to get a satisfactory result in one go. So you break the big task into steps, calling the model once per step, with **your code** controlling the flow between steps.

```
user input → [steps1: call the model analysis] → [your code: Extract key information]
 → [steps2: Adjust model generation draft] → [your code: Check quality]
 → [steps3: Adjust and polish the model] → final output
```


At each step the model only does its own share of the work, **the decision power is in your hands**: you know when to advance to the next step; the model is just one link on the assembly line.

Applicable scenarios: document generation pipelines, code review automation, RAG (Retrieval-Augmented Generation).

### Mode 3: Agent Loop: "model, you decide how"

In Agent mode, you hand the decision power over to the model.

```
user input → call the model → Model says"I need to read a file" → Execute read file → Model to see the results
 → Model says"Still need to search the code" → Perform a search → Model to see the results
 → Model says"I know, The answer is..." → output → end
```


Key difference: the flow between steps is no longer hard-coded by you; it is driven by the content of the model's output. Your code only does two things:

1. Feed the user's input and tool execution results back to the model
2. If the model's output contains a tool-call request, execute it; if not, the task is considered complete

As for which tools to call and how many times: those are decided by the model's output. When to stop: this is a human-defined rule: when one model output no longer contains a tool call, we consider the loop finished.

A comparison table makes the three modes obvious:

| Dimension | Direct call | Workflow | Agent Loop |
| --- | --- | --- | --- |
| Decision maker | User | Your code | Model |
| Model call count | 1 | N (controlled by code) | Uncertain (controlled by model) |
| Core work | Write prompt | Design flow | Define tools and loop |
| Model role | Executor | Pipeline link | Autonomous decision-maker |
| Typical scenario | Translation, summarization | Doc pipelines, RAG | Coding assistant, automation tasks |

---

## 2. Two concepts to clarify first: Trace and Turn

Before diving into the source, two concepts must be distinguished. They are often conflated, but in Pi's code each has a precise meaning.

### Trace (one complete run)

A Trace is the entire process from the user pressing Enter, to the Agent completely stopping and emitting the agent_end event. A Trace contains multiple Turns.

```
one Trace(once agent_start Arrive agent_end)
│
├── Turn 1: call the model → Model returns toolUse(to read file)→ execute read Tools
│
├── Turn 2: Adjust the model with tool results → Model returns toolUse(Need to change the file)→ execute edit Tools
│
└── Turn 3: Adjust the model with tool results → Model returns stop(Changed, No tool calls)→ agent_end
```


### Turn (one round)

A Turn's definition is precise: one model call + all tool executions triggered by that call.

Each Turn is wrapped by a pair of turn_start and turn_end events. Key point: a Turn contains exactly one model call. The model returns a toolUse, execute that batch of tools, emit turn_end, this Turn is finished. Feeding the tool results back to call the model again is the next Turn.

Reading the code makes this even clearer. The structure of each iteration of the inner loop (detailed later):

```
while (hasMoreToolCalls || ...) {
 if (!firstTurn) emit(turn_start); // ← new Turn start

 Process pendingMessages
 streamAssistantResponse() // ← a model call
 Check stopReason
 executeToolCalls() // ← execute this Turn A batch of tools triggered
 emit(turn_end); // ← this Turn end

 prepareNextTurn / shouldStopAfterTurn / Check steering
}
```


One iteration of the inner loop equals one Turn equals one turn_start then one model call then tool execution then one turn_end.

If the model in one Turn requests 3 tools at once (read + grep + find), those 3 tools are all executed within the same Turn: because they are all products of the same model call. But the moment the results are fed back and the model is called again, we are already in the next Turn.

### So the relationship between Trace and Turn is

```
Trace(one complete run)
│ agent_start
│
├── Turn 1
│ │ turn_start
│ ├── call the model → toolUse → Execution tool(read + grep)
│ │ turn_end
│ │
├── Turn 2
│ │ turn_start
│ ├── call the model → toolUse → Execution tool(edit)
│ │ turn_end
│ │
├── Turn 3
│ │ turn_start
│ ├── call the model → stop → no tools
│ │ turn_end
│ │
│ agent_end
```

## 3. Big picture: how a message journeys, and how the loop spins

### Full flow


> Note: the first Turn's turn_start is emitted at the entry of runAgentLoop(), then inside runLoop() a firstTurn flag is used to skip the first iteration's turn_start to avoid duplicates.

Diagram description: a Trace outer shell nests 3 Turns; each Turn is a complete model call + tool execution closed loop. Note that Turn 3 has no ToolCall (dashed box); its stopReason = stop triggers the loop to exit.

```
You press enter: "read it for me src/main.ts"
│
│ ① Your input becomes a message
│
UserMessage { role: "user", content: "read it for me src/main.ts" }
│
│ ② enter loop(agentLoop entrance): agent_start(one Trace started)
│
└── runLoop()
 │
 │ ③ message conversion(AgentMessage → LLM acquaintance Message)
 │
 │ ┌── Turn 1 ──────────────────────────────────────────┐
 │ │ turn_start │
 │ │ ④ call Model(every Turn Only one model call) │
 │ │ streamSimple(model, { systemPrompt, messages }) │
 │ │ ↓ chase token Streaming return │
 │ │ AssistantMessage { │
 │ │ content: [ ..., ToolCall { name: "read", ... } ],│
 │ │ stopReason: "toolUse" ← There is a tool call, Continue to transfer │
 │ │ } │
 │ │ ⑤ execute Tool(The five-step pipeline of tools, For details, see Chapter5chapter) │
 │ │ ToolResultMessage { content: [{ text: "File content" }] }│
 │ │ turn_end │
 │ └─────────────────────────────────────────────────────┘
 │
 │ Circular judgment: stopReason Yes toolUse → hasMoreToolCalls = true → continue
 │
 │ ┌── Turn 2 ──────────────────────────────────────────┐
 │ │ turn_start │
 │ │ ⑥ second call Model(Tool results appended to message list) │
 │ │ streamSimple(model, { messages: [..., toolResult] })│
 │ │ ↓ The model sees the file contents, start explaining │
 │ │ AssistantMessage { │
 │ │ content: [ TextContent { text: "this file..." } ],│
 │ │ stopReason: "stop" ← No tool calls, Prepare to stop │
 │ │ } │
 │ │ turn_end │
 │ └─────────────────────────────────────────────────────┘
 │
 │ Circular judgment: hasMoreToolCalls = false, pendingMessages is empty
 │ → inner loop exit
 │ → Outer loop check followUp → empty → Outer loop exits
 │
 └── agent_end(one Trace end, total 2 a Turn)
```

### How the loop spins: stopReason: the only signal



The loop's gas and brake is concentrated on one field: stopReason. Each AssistantMessage returned by the model carries it.

But before that, we must clarify a key insight: the model never says I am done. The model is just a token predictor: given context, guess the next token, repeat. It does not know whether the task is done. Although the stopReason field is attached to the model's return value, its values come from two different places:

Three values returned by the model API:

| stopReason | Meaning |
| --- | --- |
| toolUse | The model output a tool-call JSON; the API detected it and returned |
| stop | Generation ended (hit stop token), no tool call |
| length | Token count hit maxTokens cap, truncated |

Two values injected by the framework's streaming layer (the model API itself never returns these):

| stopReason | Meaning | Injected by |
| --- | --- | --- |
| error | Exception during the call (network drop, API error, etc.) | Streaming layer's catch block: output.stopReason = error |
| aborted | User actively aborted (AbortSignal triggered) | Streaming layer's catch block: output.stopReason = aborted |

> Code evidence (packages/ai/src/): when the API call inside streamSimple throws an exception, the catch block executes output.stopReason = options?.signal?.aborted ? aborted: error. This is not said by the model; it is the framework falling back for it.

The loop only looks at one thing: whether the model's output contains tool calls. Behind this is a human-defined engineering convention:

> If one model output contains no tool calls, then this round needs no more operations; the loop can stop.

This is not the model's intelligent decision. Put another way: it is not the model saying I am done, it is us saying you did not ask for a tool, so we treat you as done.

```
// Simplify the logic(See in practice agent-loop.ts:202-216)
const toolCalls = message.content.filter(c => c.type === "toolCall");
hasMoreToolCalls = false;
if (toolCalls.length > 0) {
 const executedToolBatch = await executeToolCalls(...);
 hasMoreToolCalls = !executedToolBatch.terminate; // any tool terminate then stop
}
```

### One rule drives the entire loop


> Note: what drives the loop is not stopReason === toolUse, but rather toolCalls array length > 0 && !terminate. That means: even if stopReason === length (truncated), as long as content contains a toolCall block, the loop will still execute the tool; conversely, even if stopReason === toolUse, if all tool results set terminate: true, the loop will also stop.

The inner loop's condition is while (hasMoreToolCalls || pendingMessages.length > 0):

- Model returns toolCall and tools did not terminate → hasMoreToolCalls = true → keep spinning: execute tools, feed results back, call the model again
- stopReason === stop or length and no toolCall → hasMoreToolCalls = false → prepare to stop (check pending messages)
- stopReason === error or aborted → hard stop: immediately exit the entire loop, do not check followUp

```
 ┌──────────────────────────────────┐
 │ │
 ▼ │
 ┌─────────┐ toolUse ┌──────────┐ │
 │ call the model │ ─────────→ │ Execution tool │ │
 └─────────┘ └──────────┘ │
 │ │ │
 │ stop / length │ Append result │
 │ ▼ to the news │
 ▼ Retune the model ──────┘
 ┌─────────┐
 │ Prepare to stop │ ← It’s not determined by the model, is our rule
 └─────────┘

 error / aborted → Jump out of the entire loop directly(hard stop)
```

### Minimal Loop: lowest common denominator of all Agents


Why not let the code more intelligently judge is the task complete? Because this is exactly the essential difference between Agent and Workflow. In a Workflow you know how many steps the flow has, and you can use code to judge progress. But in Agent mode, you don't know how many files the model needs to read, or how many places it needs to change: the only signal you can reliably rely on is: whether the output contains tool calls. This is both a limitation and elegance: no task completeness judgment logic is needed; the code only does the simplest layer of judgment.

### All exit paths of the loop

Diagram description: the five stopReason values are handled in three branches: toolUse keeps the loop spinning; stop/length prepare a normal stop (still checks followUp); error/aborted are hard stops (do not check followUp). Note the two sources of stopReason: three from the model API, two are framework-streaming-layer fallbacks.

| Exit path | Trigger condition | Reason |
| --- | --- | --- |
| Normal exit | stop / length + no followUp + no pending messages | Most common. Model did not ask for tools and no follow-up tasks |
| Hard stop | error / aborted | Model call itself failed; running further is meaningless; skip followUp |
| External hook stop | shouldStopAfterTurn() returns true | Context is nearly full, max Turn count reached, etc. |
| Tool termination | All tools in a batch return terminate: true | All tools agree to stop (every, not some) |

---

## 4. Source walkthrough: base Loop and the layering design of coding-agent

Section 3 gave you the conceptual panorama: how messages flow, how stopReason drives the loop, when to stop. But that was all what is. This section dives into the code to answer how is it done.

Before looking at Pi's source, let us make one thing clear: the simplest Agent Loop is extremely short.

```
// The simplest Agent Loop(pseudocode)
async function simpleLoop(messages, model, tools) {
 while (true) {
 // ① call the model
 const response = await callModel(model, messages, tools);
 messages.push(response);

 // ② No tool calls → end
 if (response.stopReason !== "toolUse") {
 return messages;
 }

 // ③ There is a tool call → execute, Feed the results back
 for (const toolCall of response.toolCalls) {
 const result = await executeTool(toolCall);
 messages.push(result);
 }
 }
}
```

### What coding-agent layers on top


A dozen lines of code. One while loop: call the model, execute tools, call the model again, until the model no longer requests tools. This is the minimal implementation of the logic from Section 3: any Agent needs this core.


Pi's coding-agent is an interactive coding assistant: the user talks to it in the terminal; it may need to read several files, edit code, run tests. This product scenario has more real needs than the minimal loop:

| Real need | Layered design | Source location |
| --- | --- | --- |
| User types a new instruction while the Agent is working | steering message injection: urgent messages can jump the queue between Turns | Inner loop start |
| System wants to append follow-up tasks after the Agent finishes (e.g., also run tests) | outer followUp loop: inner loop stops but outer loop can restart the inner | Outer while(true) |
| Different complexity tasks want different tier models | prepareNextTurn hook: can switch model/context at the end of each Turn | After turn_end |
| Context window almost full, need to trigger compaction | shouldStopAfterTurn hook: external judgment of whether to stop | After prepareNextTurn |

Key insight: these layered designs are all functional choices of coding-agent, not universal laws of Agents. If you are making a simple Agent that does Q&A plus tools, the entire table above is redundant: you only need the minimal loop.

But understanding how coding-agent layers these designs is valuable: your own product scenario will likely need similar mechanisms. Next, using coding-agent's full source as an example, we walk through these designs step by step. Following that please read src/main.ts message, walk through the journey from entry to finish.

### 4.1 Entry: what runAgentLoop() receives

> Section 3 briefly showed the flow panorama; here we expand into code details: the same process, a deeper perspective.

After you press Enter, the call chain is: Agent.prompt(), runPromptMessages(), runAgentLoop(). Stop at the entry:

```
// agent-loop.ts:95-118
async function runAgentLoop(
 prompts: AgentMessage[], // your message
 context: AgentContext, // current conversation context(snapshot copy)
 config: AgentLoopConfig, // Loop configuration(model, hook, Queue callback)
 emit: AgentEventSink, // event emitter
 signal?: AbortSignal, // abort signal
 streamFn?: StreamFn, // Streaming function(Replaceable)
): Promise<AgentMessage[]>
```


The three most important of the six parameters:

prompts: your messages have already been wrapped into standard format:


```
[{
 role: "user",
 content: [{ type: "text", text: "read it for me src/main.ts" }],
 timestamp: 1748000000000
}]
```


context: a snapshot of the conversation context. Note that it is a copy (created by createContextSnapshot() at agent.ts:414-420); modifications to context during Loop execution do not affect the Agent class's original state:


```
{
 systemPrompt: "You are a helpful coding assistant...",
 messages: [ /* Previous conversation history */ ],
 tools: [
 { name: "read", description: "...", parameters: Type.Object({...}), execute: ... },
 { name: "bash", description: "...", parameters: Type.Object({...}), execute: ... },
 ]
}
```


config: the Loop's behavior configuration. This contains a set of key hooks (all functions, not data):


```
{
 model: Model, // Which to use LLM
 convertToLlm: Function, // AgentMessage[] → Message[] Convert
 transformContext?: Function, // tune LLM Context preprocessing before(such as compression)
 getSteeringMessages?: Function, // get"Emergency queue cutting"news
 getFollowUpMessages?: Function, // get"Additional tasks"news
 shouldStopAfterTurn?: Function, // Should we stop after each round?
 beforeToolCall?: Function, // Tool pre-execution hook
 afterToolCall?: Function, // Tool post-execution hook
 toolExecution: "parallel", // Tool execution mode
}
```


These hooks are all functions rather than data: the Loop calls them at runtime to pull the latest state. This makes the Loop completely decoupled from external message sources.

The entry function only does three prep steps:

```
Step 1: create newMessages array
 → Collect this round Trace All new messages generated

Step 2: put prompts append to context.messages
 → context.messages = [...context.messages, ...prompts]

Step 3: initial event
 → emit("agent_start") ← Trace start
 → emit("turn_start") ← first round Turn start(Delivered at the entrance, Follow-up Turn Send in inner loop)
 → for each prompt: emit("message_start") + emit("message_end")
 → call runLoop()
```


Data change:


```
In front of the entrance: 
 context.messages = [user1, asst1, toolResult1] ← previous conversation
 newMessages = []

After the entrance: 
 context.messages = [user1, asst1, toolResult1, user2] ← Your message is appended
 newMessages = [user2] ← The collector starts recording
```

### 4.2 Skeleton of runLoop(): core first, then layering

#### Core: the inner loop


---


Now we enter runLoop(): the most core code in the whole system. Don't be intimidated by its length; we look at the core first, then the layering.


If we only keep the minimal Loop logic, runLoop looks like this:

```
// Only keep the kernel runLoop(pseudocode)
while (hasMoreToolCalls) {
 // steps B: tune LLM
 // steps C: Check stopReason → error/aborted Just quit
 // steps D: Execution tool
 // steps E: emit turn_end
}
// end → emit agent_end
```

#### Layering: coding-agent adds two outer shells


This is the minimal Loop: call the model, execute tools, turn_end, repeat. The exit condition hasMoreToolCalls of the inner loop is driven by toolCalls array length > 0 && !terminate (covered in Section 3). This is the core that all Agents need.


But coding-agent, as an interactive coding assistant, needs two more things outside the core:

Layering 1: steering message injection (checked at the start of the inner loop + at the end of each iteration). The user types a new instruction while the Agent is working: these messages cannot wait for the current task to finish; they must be urgently injected at the start of the next iteration. So the inner loop condition gains an extra || pendingMessages.length > 0.

Layering 2: outer followUp loop (wrapping the entire inner loop). After the Agent stops, the system may want to append more tasks (e.g., also run tests). The outer loop lets these appended tasks keep running within the same Trace, without needing to start a new Loop.

Combining the core and the two layers is the full runLoop skeleton:

```
async function runLoop(currentContext, newMessages, config, signal, emit, streamFn) {

 // ① first time steering Check(before entering the inner loop！)
 let pendingMessages = (await config.getSteeringMessages?.()) || [];

 // ========== Overlay2: Outer loop(followUp Extend life)==========
 while (true) {
 let hasMoreToolCalls = true;
 let firstTurn = true; // Skip first round turn_start(The entrance has been sent)

 // ========== Kernel + Overlay1: inner loop ==========
 while (hasMoreToolCalls || pendingMessages.length > 0) {
 // ↑ Overlay1: steering Messages also drive loops

 if (!firstTurn) {
 emit({ type: "turn_start" });
 }
 firstTurn = false;

 // steps A: Inject pendingMessages(steering news)← Overlay1
 // steps B: tune LLM → streamAssistantResponse() ← Kernel
 // steps C: Check stopReason ← Kernel
 // steps D: Execution tool ← Kernel
 // steps E: emit turn_end ← Kernel
 // steps F: prepareNextTurn → shouldStopAfterTurn ← Overlay(hook)
 // → Check again steering ← Overlay1
 }

 // ========== End of inner loop ==========
 // Overlay2: Check followUp Queue
 const followUpMessages = (await config.getFollowUpMessages?.()) || [];
 if (followUpMessages.length > 0) {
 pendingMessages = followUpMessages;
 continue; // Return to the top of the outer loop, Inner loop reopens
 }

 break; // Both queues are empty, Really quit
 }
}
```

### 4.3 [Layering 1 · Step A] steering message injection


Now we walk through each step. Each step will be labeled core or layering for clarity.

---


> What is steering? This is an interaction feature of coding-agent. Imagine you ask the Agent to fix a bug, the Agent is reading files and analyzing code. Then you suddenly think of an addendum: also check the test files: you want this instruction to jump the queue, not wait for the Agent to finish the current task.

Steering is this queue-jumping mechanism. New instructions typed by the user while the Agent is working are placed into the steering queue. At the start of each iteration of the inner loop, the Loop checks this queue first and injects the urgent messages into the current conversation:

```
if (pendingMessages.length > 0) {
 for (const message of pendingMessages) {
 await emit({ type: "message_start", message });
 await emit({ type: "message_end", message });
 currentContext.messages.push(message);
 newMessages.push(message);
 }
 pendingMessages = []; // Consumption completed, Clear
}
```

### 4.4 [Core · Step B] streamAssistantResponse(): calling the LLM

#### Phase A: context preprocessing (optional)


This code injects the urgent messages one by one into the context and the message collector.

The first source of pendingMessages is the first steering check executed when runLoop enters (agent-loop.ts:167). Why check before entering the loop? Because the user may have typed more content while waiting for the LLM's first response: at that point the messages have already been queued externally, but the loop has not started yet; if we do not fetch them ahead of time, that batch of messages is dropped.

```
let messages = context.messages;
if (config.transformContext) {
 messages = await config.transformContext(messages, signal);
}
```


If transformContext is configured (such as a compaction algorithm), preprocess messages here. If not configured, skip.



```
const llmMessages = await config.convertToLlm(messages);
```

#### Phase B: AgentMessage to Message conversion (the boundary of the two-layer message system)

This line stands on the boundary between the Agent core and the LLM. To understand why it exists, you must first know the design of the two-layer message system.

When an Agent maintains its conversation history internally, it needs to record not only what the user said and what AI replied: it also needs to record its own internal state. For example, coding-agent records: that context was compacted (CompactionSummaryMessage), the execution details of a Bash command (BashExecutionMessage), the record of a branch switch (BranchSummaryMessage). These are the Agent's own internal language, and the LLM does not recognize these message types at all: it only recognizes three standard messages: UserMessage, AssistantMessage, ToolResultMessage.

convertToLlm is the translator standing on this boundary: it translates the Agent's internal language into the protocol the LLM understands. The default implementation is just a. filter(): keep only the three standard messages:

```
function defaultConvertToLlm(messages: AgentMessage[]): Message[] {
 return messages.filter(
 (message) => message.role === "user"
 || message.role === "assistant"
 || message.role === "toolResult",
);
}
```


Data transformation:


```
Before conversion(AgentMessage[]): 
[
 { role: "user", content: "read it for me src/main.ts", ... }, ← Reserve
 { role: "assistant", content: [...], ... }, ← Reserve
 { role: "compactionSummary", summary: "Summary of previous conversation..." }, ← filter out
 { role: "toolResult", content: [...], ... }, ← Reserve
]

After conversion(Message[]): 
[
 { role: "user", content: "read it for me src/main.ts", ... },
 { role: "assistant", content: [...], ... },
 { role: "toolResult", content: [...], ... },
]
```

#### Phase C: build Context and call the model


> The full design of the two-layer message system is detailed in Chapter 6: Message System.



```
const llmContext: Context = {
 systemPrompt: context.systemPrompt,
 messages: llmMessages,
 tools: context.tools,
};

const streamFunction = streamFn || streamSimple;
const resolvedApiKey =
 (config.getApiKey ? await config.getApiKey(config.model.provider): undefined)
 || config.apiKey;

const response = await streamFunction(config.model, llmContext, {
 ...config,
 apiKey: resolvedApiKey,
 signal,
});
```


Building Context is the main thread of this step. Note that llmContext is a brand new object, rebuilt every iteration of the inner loop. It consists of three parts:

- systemPrompt: directly reuses the system prompt from the Agent context, telling the model who you are, what rules to follow
- messages: the llmMessages filtered by the previous step convertToLlm, only the three standard messages LLM recognizes
- tools: tool list (with schema definitions), letting the model know what tools are available this time

Note one detail: llmContext.tools = context.tools is reference assignment: every iteration wraps a new wrapper object, but the tools array itself is the same reference, byte-stable in content. systemPrompt is the same. Only messages grows (each iteration appends a new ToolResultMessage).

So why rebuild llmContext this wrapper every iteration? Because some Turns do change one of these three: the prepareNextTurn hook (§4.7) may switch the model or modify systemPrompt; the extension system (§5) may dynamically register new tools. The cost of rebuilding the wrapper is negligible (one JS object), but it ensures we do not get hard-to-trace state pollution from shared references.

Does this break the prompt cache? No. Anthropic's prompt cache is content-addressed: it looks at the bytes sent, not at the request's identity. Whether a new or old object is sent does not matter; as long as the bytes of system + tools are unchanged, the cache hits. Pi explicitly tags cache_control: { type: ephemeral } in three places in anthropic-messages.ts:

| Position | Source line | Effect |
| --- | --- | --- |
| End of system prompt | L922/929/938 | Whole system prompt as cacheable prefix |
| Last tool | L1208 | Whole tools list as cacheable prefix |
| Last user message | L1157-1178 | rolling cache: each Turn pushes the cache breakpoint to the latest message |

The third is particularly clever: the cache breakpoint is not fixed at the first message; it rides along with the latest user message. That way, the old prefix keeps hitting, the newly appended content gets written in, and the entire conversation history enjoys the cache benefit. The hit chain roughly is:

```
Turn 1: write [system + tools] → write [messages §1]
Turn 2: hit [system + tools] → hit [messages §1] → write [messages §2]
Turn 3: hit [system + tools] → hit [messages §1+§2] → write [messages §3]
```

#### Phase D: stream the response: the cleverness of in-place replacement


Another easy-to-misunderstand point: tools are not appended to the end of messages. In the Anthropic API protocol tools is an independent top-level field (positioned before messages); this protocol design itself considers caching: stable tools first, changing messages after; the longer the prefix, the more you save.

OpenAI takes a different route (openai-completions.ts:554): prompt_cache_key: sessionId, the OpenAI backend matches prefixes automatically by session. DeepSeek, Qwen, etc., via the cacheControlFormat: anthropic compatibility field, can also reuse Anthropic-style cache_control markers (the applyAnthropicCacheControl at L593).


```
for await (const event of response) {
 switch (event.type) {
 case "start":
 // get one"empty shell"news, direct push Arrive context
 partialMessage = event.partial;
 context.messages.push(partialMessage);
 emit({ type: "message_start", ... });
 break;

 case "text_delta": // text increment
 case "toolcall_delta": // Tool call increment
 case "thinking_delta": // Think incrementally
 partialMessage = event.partial; // Some updated news
 context.messages[last] = partialMessage; // ★ Replace in place！
 emit({ type: "message_update", ... }); // UI Receive incremental updates
 break;

 case "done":
 case "error":
 finalMessage = await response.result();
 context.messages[last] = finalMessage; // ★ Replace with final complete message
 emit({ type: "message_end", ... });
 return finalMessage;
 }
}
```


Why push an empty shell first and then replace in-place? Note what in-place replacement means: it is not pushing new items into the context.messages array; it is modifying the last message's content blocks in place. The streaming response chunks come in one by one; we do not have the full message yet. We first push an empty AssistantMessage so the message collector already has a slot for the final result. Then each streaming chunk mutates this message in place: as long as the collector iterates over messages after the response completes, it sees the completed message.

```
start → { role: "assistant", content: [] } ← empty shell push
text_delta → { content: [{ type:"text", text:"OK..." }] } ← The text is growing
toolcall → { content: [{ text:"OK..." }, ← Tool call appears
 { type:"toolCall", name:"read", arguments:{file_path:"src/main.ts"} }] }
done → { content: [...], stopReason:"toolUse", usage:{...} } ← Final complete message replacement
```

### 4.5 [Core · Step C] check stopReason


---


Section 3 covered stopReason in detail. Here we look at the actual code:

```
// agent-loop.ts:196-200
if (message.stopReason === "error" || message.stopReason === "aborted") {
 await emit({ type: "turn_end", message, toolResults: [] });
 await emit({ type: "agent_end", messages: newMessages });
 return; // ← Exit the entire runLoop, Don't check followUp
}
```

### 4.6 [Core · Step D] executeToolCalls(): execute tools


error and aborted are hard stops: immediately emit turn_end + agent_end, and return directly. Tools are not even executed, nor is followUp checked. This is a fail fast strategy: since the model call itself failed (network exception or user cancellation), continuing to run is meaningless.

```
const toolCalls = message.content.filter((c) => c.type === "toolCall");
```


Then decide whether this batch of tools runs in parallel or serial:


```
if (config.toolExecution === "sequential" || hasSequentialToolCall) {
 return executeToolCallsSequential(...); // serial
}
return executeToolCallsParallel(...); // Parallel
```


Veto strategy: as long as any one tool in this batch declares executionMode: sequential, the entire batch must run serially. This is a conservative choice: when a tool needs to operate on the result of the previous tool, it has no choice but to run in order.

```
serial mode: 
 ToolCall A: Prepare → Verify → beforeHook → execute → afterHook → emit end
 ToolCall B: Prepare → Verify → beforeHook → execute → afterHook → emit end
 (a complete end, Just started the next one)

parallel mode(three-stage design): 
 stage1 - Prepare(order): A Prepare → B Prepare → C Prepare
 ↑ prepareToolCall Contains verification and beforeHook, Must be executed sequentially
 stage2 - execute(Parallel): A, B, C execute simultaneously(Promise.all)
 ↑ only tool.execute Parallel, save time
 stage3 - event(orderly): end Send in order of completion; result Send in order of calling
 ↑ result message keep and ToolCall consistent order, LLM The context received is correct
```


Note the subtlety of parallel mode: the prepare phase is always sequential (because validation and permission checks cannot be parallel: if B is blocked, C should not execute). Only after all tools have been validated can they execute in parallel.

```
After tool execution: 
 context.messages = [..., user2, assistantMessage, {
 role: "toolResult", toolCallId: "toolu_01", toolName: "read",
 content: [{ text: "File content..." }], isError: false
 }]
```


terminate mechanism: a tool can set terminate: true in its return result, meaning I think we should stop. If all tools in a batch agree to terminate (the code uses every, not some), the loop stops.

```
// ① emit turn_end: Notify external"This round is over"(Kernel)
await emit({ type: "turn_end", message, toolResults });

// ② prepareNextTurn: Give the outside world a chance"Modification"next round(Overlay)
// The return value can contain context / model / thinkingLevel Coverage of one of the three
const nextTurnSnapshot = await config.prepareNextTurn?.({...});
if (nextTurnSnapshot) {
 currentContext = nextTurnSnapshot.context ? currentContext;
 config.model = nextTurnSnapshot.model ? config.model;
 // thinkingLevel Also covered here(See details agent-loop.ts in prepareNextTurn processing logic)
}

// ③ shouldStopAfterTurn: External judgment as to whether it is time to stop(Overlay)
if (await config.shouldStopAfterTurn?.({...})) {
 await emit({ type: "agent_end", messages: newMessages });
 return;
}

// ④ Check again steering: Is there any new emergency news?？(Overlay1)
pendingMessages = (await config.getSteeringMessages?.()) || [];
```

### 4.7 [Core + Layering · Steps E-F] turn_end + hooks + recheck steering


prepareNextTurn: this is an easy-to-miss but powerful extension point. After each turn_end and before the next iteration, the Loop calls this function to give the outside a chance to switch the model or modify the context:

```
scene: Switch models based on task complexity

Turn 1: User asked a simple question → For models Haiku(Fast, cheap)
 turn_end → prepareNextTurn Detecting the problem is easy
 → Return { model: haiku } → Continue using it next round Haiku

scene: Halfway through, I discovered that the task had become more complicated.

Turn 1: User lets"Refactor this module" → Haiku Start reading file
 turn_end → prepareNextTurn Found that there are many files to be changed
 → Return { model: opus } → Automatically cut to the next round Opus(Strong, Expensive)
```

### 4.8 Back to top of the loop


Beyond switching the model, it can also switch context (e.g., inject new context info) and thinkingLevel (thinking intensity). The return value indicates whether the next Turn should still run, so it can also serve as a safety valve.

```
while (hasMoreToolCalls || pendingMessages.length > 0)
```

### 4.9 [Layering 2 · Step G] outer loop: followUp life-extension


Either condition being true continues the loop. hasMoreToolCalls is determined by whether the model's output contains a toolCall block (and they have not all terminated); pendingMessages.length > 0 means there are pending messages from steering or other sources.


```
const followUpMessages = (await config.getFollowUpMessages?.()) || [];
if (followUpMessages.length > 0) {
 pendingMessages = followUpMessages; // stuffed pending, trigger new Turn
 continue; // Return to the top of the outer loop
}
break; // Both queues are empty, Really quit
```

### 4.10 steering vs followUp: a table to see both interventions

## 5. Summary: four core Loop designs

### 1. ReAct loop pattern


If there are followUp messages, they are pushed into pendingMessages, and continue jumps back to the top of the outer loop. This is the life-extending mechanism: the inner loop is done but the outer loop can keep the Agent working.

Now let us compare the two intervention mechanisms: steering vs followUp: in one table:

| Dimension | steering | followUp |
| --- | --- | --- |
| Injection timing | Before the inner loop starts + at the end of each iteration of the inner loop | After the inner loop fully ends |
| Semantics | Urgent queue jump: injected during tool execution gaps | Wait in line: wait until the current task is fully done |
| Typical scenario | User typed new instructions while the Agent is working | System appends also run tests after the Agent finishes |

Life analogy: steering is when you are in a meeting and someone knocks on the door to slip you a note: urgent, look at this first. followUp is when, after the meeting, you check your mailbox: not urgent, but needs handling.

Diagram description: left red right green comparison: steering is checked at the start and end of every inner-loop iteration and queue-jumps; followUp is checked after the inner loop fully ends and extends the run. Bottom lists the timing, source, effect, and typical scenarios for each.
### 2. stopReason-driven mechanism

### 3. Core + layering architecture approach

## 6. Next stop

---

> **Version note**
> This chapter is written against Pi **v0.80.2**. Code analysis follows the [earendil-works/pi](https://github.com/earendil-works/pi) repository (tutorial links may point at `main` and differ slightly from v0.80.2).


---

> **Next up**
> [Chapter 4: Model Invocation](/en/ch04-model-invocation/)

