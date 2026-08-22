---
title: 'Chapter 4: Model Invocation: One Line, Many Providers'
translation_key: ch04-model-invocation
language: en
chapter: 4
source_url: 'https://www.dgzhuya.com/modules/ch04-model-invocation'
official_refs: []
terms_used: []
status: translated
last_updated: '2026-08-20'
translator: hypnguyen1209
reviewed_by: null
code_blocks: 22
code_lines: 138
mermaid_blocks: 0
---
> Chapter 3 traced the full operation of the Agent Loop. The most critical step is "calling the model": the loop sends the message to the LLM, gets a reply, and decides whether to continue or stop based on the reply.
>
> But at that point we skipped past it with a single line of code:


```
const stream = streamSimple(model, context, options);
```


This line of code looks unremarkable. But if you open the `packages/ai/src/api/` directory, you will find dozens of files and 10 API translators (including one dedicated to images), each over a thousand lines long. **Behind the simplicity of a one-line call lies a carefully designed AI abstraction layer.**

This chapter unpacks that one line of code: how does Pi manage to use the same interface to call over 30 different models? And what would you need to do to plug in a new model?

---

## 1. Problem: same dialog, different models demand different "translations"

First, let us be clear about what problem needs solving.

Agent Loop must call models, but the market has dozens of model providers: Anthropic (Claude), OpenAI (GPT), Google (Gemini), AWS Bedrock, Mistral... each has its own API specification, using different field names and data structures to describe the same thing.

How big is this difference? Look at a simple example. Suppose the user tells the Agent:

> "Help me read main.ts"

This message is stored like this inside Pi (unified format):


```
{ role: "user", content: "read it for me main.ts", timestamp: 1748697600000 }
```


But to send this same message to different models, it must be "translated" into each provider's required format. For this one sentence alone, four Providers demand four completely different shapes:

**Anthropic (Claude)**: the message content must be an array, each item carrying a `type` field:


```
{ role: "user", content: [{ type: "text", text: "read it for me main.ts" }] }
```


**OpenAI (GPT)**: the format looks similar, but field semantics differ subtly (for example, how tool-result messages are handled is completely different):


```
{ role: "user", content: "read it for me main.ts" }
// But if the message contains tool results, OpenAI request separate { role: "tool" } news, 
// And Anthropic Merge tool results into user in the message
```


**Google (Gemini)**: the field name shifts from `content` to `parts`, and the structure is flatter:


```
{ role: "user", parts: [{ text: "read it for me main.ts" }] }
```


**Bedrock (AWS)**: wraps yet another layer around AWS's own structure:


```
{ role: "user", content: [{ text: "read it for me main.ts" }] }
// Note: Bedrock of text No type Field, and Anthropic different
```


**Even the simplest plain-text message has four ways to write it.** Field names differ (`content` vs `parts`), structures differ (some need a `type` field, some don't).

**Diagram caption:** At the top is Pi's internal unified format; below, four cards laid out side-by-side show what the same message looks like in Anthropic / OpenAI / Google / Bedrock. Each card highlights "what's unique to this one" in red at the bottom: array + type, independent role, parts replacing content, no type, etc. The bottom also gives the full picture of the four difference dimensions.

### Not just message format: all four dimensions differ

Message format is just the tip of the iceberg. The differences between Providers are across the board, mainly on four dimensions:

| Dimension | What differs | Example |
| --- | --- | --- |
| **Message format** | Same message, different field names and structure | Anthropic uses `content[]`, Google uses `parts[]` |
| **Streaming** | The model's "char-by-char return" mechanism differs | Anthropic sends raw SSE text you parse yourself; OpenAI's SDK returns structured chunks directly |
| **Thinking mode** | The param to "make the model think deeply" is completely different | Anthropic uses `thinking.budget_tokens`, OpenAI uses `reasoning_effort` |
| **Cache control** | The way to "mark unchanged content" differs | Anthropic applies a `cache_control` marker; Bedrock inserts a `cachePoint` node |

Each dimension alone is not complex, but four dimensions times 30+ Providers makes the combinatorial difference huge.

Now the question: **Agent Loop has just one line `streamSimple(model, context)`, it cannot write a different logic per Provider. So how does it cope with so many differences?**

---

## 2. Solution: three layers, each owning one thing

You might think of an intuitive answer: wrap all Providers in one layer so they look the same: same input, same output.

**Right, Pi does exactly this.** But specifically how to "make them look the same"? Pi's approach is to split this into three layers, each with clear responsibility:


```
first floor · unified entrance → "receive request, Find out who to contact"
second floor · event protocol → "Agreed output format:No matter who handles it, Everything I handed back looked like this"
third floor · translator → "people who really work:Each translator is proficient in one Provider dialect"
```


Use an analogy to understand. Imagine an international translation company:

- **Layer 1 (front desk)**: customer walks in, front desk asks "what language do you need translated?", then looks up the directory to find the matching translator and assigns the work
- **Layer 2 (standard report template)**: regardless of whether the translator works on French, Japanese, or Arabic, the final report must use the company's unified format: cover page, body, signature block, format is fixed
- **Layer 3 (translators)**: each translator masters one language; how they translate internally is their own business, but the output must conform to Layer 2's standard format

**Key point: the front desk (Layer 1) and translators (Layer 3) connect through the standard report (Layer 2). The front desk does not need to know foreign languages; translators do not need to know company process.**

Agent Loop is that "customer": it hands the request to the front desk (Layer 1), gets back a standard-format report (Layer 2), and never directly contacts translators (Layer 3).

**Diagram caption:** Four layers from top to bottom: customer (Agent Loop) → front desk (`stream`) → standard report protocol (12 events) → translators (4 Providers). Left labels the "directory" (registry); right labels `streamSimple` as the convenience wrapper for the entry. All translators emit a unified event stream back to Agent Loop.

Now expand layer by layer.

### Layer 1: Unified entry

The entry function is called `stream()`, and the code is extremely simple:


```
// compat.ts
export function stream(model, context, options?) {
 const provider = resolveApiProvider(model.api); // Look up table: thismodelWho to look for？
 return provider.stream(model, context, options); // Give the job to the translator
}
```


Just two steps: **look up the table, dispatch the work.** `model.api` is a string (for example `"anthropic-messages"`), and at system startup all translators have been registered into a "directory" (the lookup table).

This "directory" looks like this:


```
const BUILTIN_APIS = [
 ["anthropic-messages", anthropicMessagesApi()], // Claude translator
 ["openai-completions", openAICompletionsApi()], // GPT translator
 ["google-generative-ai", googleGenerativeAIApi()], // Gemini translator
 ["bedrock-converse-stream", bedrockConverseStreamApi()], // Bedrock translator
 // ... Also 5 a
];
```


On the left is the key ("employee number"), on the right is the translator ("translator employee"). The value of `model.api` is the key: take the key, look up the table, find the translator, call it. The entire entry layer handles no business logic at all; it is purely a router.

### Layer 2: Event protocol

After the translator sends the request to the model, the model returns content in a stream ("spits out" one character at a time). If each translator spits in its own way, the front desk will go crazy. So Layer 2 defines a unified output format.

Pi specifies: regardless of which underlying model, the translator must output a **unified event stream**, with 12 event types in total:


```
AssistantMessageEvent(12 species)
│
├── start ← The flow started
│
├── text_start → text_delta → ... → text_end ← The model is outputting text
├── thinking_start → thinking_delta → ... → thinking_end ← model thinking
├── toolcall_start → toolcall_delta → ... → toolcall_end ← Model adjustment tools
│
├── done (reason: stop / length / toolUse) ← End normally
└── error (reason: error / aborted) ← something went wrong
```


You do not need to memorize all 12. Just understand the pattern: **the model's reply content falls into three categories (text, thinking, tool call), each category has "start -> incremental delta -> end" three steps, plus a stream-start and stream-end signal.**

Why three steps per category? Because this is streaming: the translator first tells you "text is about to start" (`text_start`), then pushes char-by-char (`text_delta`, possibly many of them), and finally tells you "text is over" (`text_end`). This lets Agent Loop render char-by-char: the AI reply you see popping out one character at a time is exactly this mechanism.

There is another important convention: every event carries `partial: AssistantMessage`: the complete snapshot of the current message. Chapter 3 talked about "in-place replacement": every time an event is received, use `partial` to overwrite the last message in the context, no need to manually concatenate the deltas.

### Layer 3: Translator

The translator is the real worker. Each translator corresponds to one API (such as Anthropic, OpenAI), responsible for translating the unified format to that Provider's private format, then translating the response back to unified events.

All translators follow the same 5-step workflow:

**Diagram caption:** A vertical 5-step pipeline: create client -> build request params -> send request -> process response stream -> send termination event. Steps 2 and 4 are where the work happens (highlighted with red borders). On the right, the failure branch converges into a unified `error` event.

Step 2 (request translation) and Step 4 (response translation) are where the core work lies, and the reason each translator is over a thousand lines long.


```
translator(model, context, options)
│
├── 1. Create client
│ use API Key Initialize connection. Just like the translator confirms that he has brought a dictionary. 
│
├── 2. Build request parameters
│ uniformly formatted messages, Tool definition, System prompt, translated into Provider private format. 
│ For example Google want content → parts, Do this conversion in this step. 
│
├── 3. Send request
│ Pass SDK or directly HTTP Send to model. Wait for the model to start responding. 
│
├── 4. Process the response stream
│ Model streaming returns content. Translator Provider private event format, 
│ Translated into second level requirements 12 a unified event. 
│
└── 5. Send termination event
 success → push done; failed → push error. The stream must be terminated. 
```


Taking Anthropic as an example, Step 4's translation rules (translating Anthropic's private event names into Pi's unified event names):


```
Anthropic private event → Pi unification event
───────────────── ────────────
content_block_start (type: "text") → text_start
content_block_delta (text_delta) → text_delta
content_block_start (type: "tool_use") → toolcall_start
content_block_delta (input_json) → toolcall_delta
message_delta (stop_reason) → done(Mapping termination reason)
```


Note the stop-reason mapping: Anthropic's `"end_turn"` -> Pi's `"stop"`, `"tool_use"` -> `"toolUse"`. Each Provider names things differently; Pi unifies them into its own vocabulary. Chapter 3 talked about Agent Loop checking `stopReason` to decide whether to continue the loop: those values are the unified terms produced by this translation layer.

### StreamFunction: Translator's "onboarding requirements"

For the three-layer architecture to run, there is a prerequisite: **all translators must obey the same set of rules.** Pi uses a TypeScript type to define these rules: it is called `StreamFunction`, the "constitution" of the entire abstraction layer:


```
export type StreamFunction<TApi extends Api, TOptions> = (
 model: Model<TApi>, // Which model to use
 context: Context, // conversation context(System prompt + news + Tools)
 options?: TOptions, // Optional configuration(thinking level, Caching etc.)
) => AssistantMessageEventStream; // ← Must return unified event stream
```


This signature defines three rules:

1. **Same input**: all translators accept the same three parameters (model, context, options)
2. **Same output**: must return an `AssistantMessageEventStream`: regardless of whether the underlying layer is raw SSE or an SDK stream, the external type is this one
3. **Errors do not throw**: when the API call fails, do not `throw`; instead emit a `{ type: "error" }` event

Rule 3 echoes Chapter 3's "never throw" principle. Recall: the `stopReason: "error"` and `"aborted"` mentioned in Chapter 3 are not returned by the model: they are **injected by the translator's catch block on exception**. Specifically, the translator wraps the exception into an `error` event and pushes it into the event stream. After Agent Loop receives it, it uses the same mechanism for both success and failure; the loop is never broken by an exception.

With the StreamFunction rules in place, the "front desk" (Layer 1) can confidently dispatch work to any translator: because they guarantee the same input format, the same output format, and the same error handling.

---

## 3. How to use: from call to plugging in a new model

Now that we understand the three-layer architecture, look at actual usage. Two scenarios: **how to call** an existing model, and **how to plug in** a new model.

### Scenario 1: Call the model

Agent Loop does not call `stream()`, it calls `streamSimple()`. Why are there two versions?

`stream()` is the low-level entry: it only does "lookup + dispatch" and does not handle thinking-level translation. `streamSimple()` wraps `stream()` with a layer of convenience features: auto handles thinking level (ThinkingLevel) translation, auto adjusts token caps, etc. In short:

- **`stream()`**: the lowest level, no convenience features. If you use it directly you must handle many translation details yourself
- **`streamSimple()`**: helps you handle thinking level and other translation work, the entry used in development

Typical code for Agent Loop using `streamSimple()`:


```
const stream = streamSimple(model, context, { reasoning: "high" });
// ↑ tell it"Think at a higher level"
// streamSimple will be automatically translated into each Provider The specific parameters of

for await (const event of stream) {
 // Events will arrive in order: 
 // start → thinking_start/delta/end → text_start/delta/end → done
 switch (event.type) {
 case "text_delta":
 // text increment, display to terminal
 break;
 case "toolcall_end":
 // Model adjustment tools, Get complete tool call information
 break;
 case "done":
 // This round of model calling ends, look stopReason Decide whether to continue looping
 break;
 case "error":
 // something went wrong(Network timeout, APIErrors etc.), errorReason Yes "error" or "aborted"
 break;
 }
}
```


**Agent Loop does not need to care which model is underneath.** Whether model is Claude, GPT, or Gemini, `streamSimple` returns the same kind of event stream, the consumption way is exactly the same.

### Scenario 2: Plug in a new model

Suppose you want to plug in a new model Pi does not yet support: say a domestic large model. What do you need to do?

**Three steps**, each corresponding to one of the three layers above:

**Step 1: Write a translator** (corresponds to Layer 3)

A translator is a function matching the `StreamFunction` signature. What you do:

- Translate Pi's unified message format into your model's API format (request direction)
- Translate your model's streaming response into Pi's 12 unified events (response direction)
- On exception, do not `throw`; instead push an `error` event

This step is the most work: you need to read your model's API docs, understand its message format, streaming protocol, error codes. But it is "one-time work": once written, no need to change again.

**Step 2: Register the translator** (corresponds to Layer 1):


```
registerApiProvider({
 api: "your-model-api", // Give your translator a name
 stream: yourStreamFunction, // Translator written by you
 streamSimple: yourSimpleFunction, // Convenient version
});
```


This step is just adding one record to the "directory". After system startup, Layer 1's `resolveApiProvider()` can find your translator.

**Step 3: Configure model information**:


```
const yourModel: Model = {
 id: "your-model-id",
 api: "your-model-api", // ← Point to the 2 registered name
 provider: "your-provider",
 baseUrl: "https://api.your-model.com",
 // ... Other metadata(context window size, Does it support thinking, etc.)
};
```


This step tells the system "there is a model like this". The `api` field points to the name registered in step 2, and Layer 1 routes via this field's lookup.

**Done.** Agent Loop needs no change at all. Event system, session management, compaction algorithm: all auto-adapt. This is the value of the three-layer architecture: **the cost of plugging in a new model is confined to one point: "write a translator": no need to touch anything else.**

---

## 4. [Advanced] Inside the translator: SSE parsing and thinking-mode dialects

> The first three sections covered the core design of the AI abstraction layer. What follows is engineering implementation detail: if you do not need to write your own translator, you can skip this section.

### Streaming: Why do Anthropic and OpenAI parse so differently?

Chapter 3 mentioned that model responses are streaming: "spit out" one character at a time. But "how they spit" differs per vendor:

**OpenAI's** SDK wraps it well. You call `client.chat.completions.create()`, and it returns a structured chunk stream directly. The `choices[0].delta` of each chunk is already parsed data, ready to use.

**Anthropic** returns raw SSE (Server-Sent Events) text stream. You must read `event:` and `data:` fields line by line and do your own JSON parsing (with fault tolerance: some chunks' JSON may be incomplete).


```
Anthropic parsing link(Translators do the dirty work themselves): 
 original HTTP response → Read line by line → separation event and data → JSON parse(Contains fault tolerance) → internal events

OpenAI parsing link(SDK Did the dirty work for you): 
 client.chat.completions.create() → Return directly AsyncIterable<Chunk> → It’s structured data
```


**Why not use a unified SDK?** Because not all Providers have mature SDKs. Some SDKs do not support streaming, some do not support custom events. Pi's strategy: use an SDK if available (OpenAI, Google), parse manually if not (Anthropic). But regardless of internal implementation, all eventually translate to the unified 12 events.

### Thinking mode: four kinds of "thinking", four parameters

Different Providers have completely different concepts and parameters for "let the model think deeply":


```
// Anthropic: give one token budget, Let the model think within this budget
params.thinking = { type: "enabled", budget_tokens: 16384 };

// OpenAI: Give a level of effort(low/medium/high)
params.reasoning_effort = "high";

// Google: use thinkingConfig Configuration
config.thinkingConfig = { includeThoughts: true, thinkingLevel: "high" };
```


Even Anthropic itself has two modes: newer models use "adaptive thinking" (the model decides how much to think), older models use "budget thinking" (fixed token cap).

### How Pi unifies: ThinkingLevel 5-tier scale

Pi defines a unified thinking-level enum:

**Diagram caption:** Top axis shows the six levels off / minimal / low / medium / high / xhigh, each annotated with its token cap. Below are how three Providers' "high" maps to different parameters. At the bottom is the clamp fallback strategy: first look upward, if not found then look downward.


```
 off minimal low medium high xhigh
 │ │ │ │ │ │
 not thinking 1024 tk 2048 tk 8192 tk 16384 tk Model maximum
```


Upper code only needs to say `reasoning: "high"`, and the translator looks up the table to translate to each Provider's specific parameters. Each `Model` object brings its own `thinkingLevelMap` (translation table), declaring "for my model, each level corresponds to what parameters".

If the requested level is not supported by the model (for example, requesting `xhigh` but only `high` is supported), the `clampThinkingLevel()` function does a fallback: **first look upward** (thinking more is usually safer than thinking less), if not found then look downward.

`streamSimple()` is the convenience function that helps you complete this translation automatically: lookup + clamp + adjust `maxTokens`, then call the underlying `stream()`.

---

## 5. [Advanced] Cache control and error handling

### Cache control: Let the model "compute less"

Agent dialog is "stateful": each turn sends the full history to the model. If you chatted with the Agent for 50 turns, each turn recomputes the content of the first 49 turns. Cache tells the model server: "this content has not changed, do not recompute it."

But "how to mark" differs per Provider: Anthropic appends a `cache_control` marker on the message block, Bedrock inserts an independent `cachePoint` node.

Pi abstracts cache control into three semantic levels:


```
type CacheRetention = "none" | "short" | "long";
```


Upper code only needs to say "I want long cache", and the translator itself translates to each Provider's specific marking. This is the same "unified enum + per-provider translation table" pattern as ThinkingLevel, but more interesting: **the four have completely different design philosophies for "how to mark unchanged content"**. The comparison table in the source code roughly looks like:

| Provider | `none` | `short` | `long` | Mark position |
| --- | --- | --- | --- | --- |
| **Anthropic** | no mark | `cache_control: { type: "ephemeral" }` (default 5-min TTL) | add `ttl: "1h"` (newer models only) | system end + last tool + last user message (rolling) |
| **Bedrock** | no node | insert independent object `{ cachePoint: { type: DEFAULT } }` | add `ttl: ONE_HOUR` | after system block + after last message |
| **OpenAI Responses** | no cache key | send `prompt_cache_key: sessionId` | add `prompt_cache_retention: "24h"` | no mark: OpenAI auto-matches by session key prefix |
| **OpenAI compatible (DeepSeek/Qwen etc.)** | no mark | mark `cache_control` in Anthropic style | add `ttl: "1h"` (if supported) | reuse Anthropic's three positions |

Source references: Anthropic's three marks at [anthropic-messages.ts:922/929/938](https://github.com/earendil-works/pi/blob/main/packages/ai/src/api/anthropic-messages.ts#L922) + [L1208](https://github.com/earendil-works/pi/blob/main/packages/ai/src/api/anthropic-messages.ts#L1208) + [L1157](https://github.com/earendil-works/pi/blob/main/packages/ai/src/api/anthropic-messages.ts#L1157); Bedrock's `cachePoint` at [bedrock-converse-stream.ts:696/885](https://github.com/earendil-works/pi/blob/main/packages/ai/src/api/bedrock-converse-stream.ts#L696); OpenAI Responses' `prompt_cache_key` at [openai-responses.ts:229](https://github.com/earendil-works/pi/blob/main/packages/ai/src/api/openai-responses.ts#L229).

Here is a comparison worth pausing to think about: all four are saying "tell the server this content has not changed", but each gave **four completely different protocol designs** :

- **Anthropic's approach is like "sticking a sticky note"**: append a `cache_control` field to the existing content block. The content is still that content, just with one extra "this is unchanged" label
- **Bedrock's approach is like "inserting a road sign"**: insert an independent, business-data-free `cachePoint` object at a specific position in the message stream. It does not attach to any content, it is itself a placeholder
- **OpenAI native is like "looking up by membership card"**: you do not mark at all, just include a `prompt_cache_key` (Pi uses `sessionId` as the key) on every request, and the OpenAI backend auto-identifies prefix overlap
- **OpenAI-compatible vendors are the most naive**: they directly copy Anthropic's sticky-note protocol (`cacheControlFormat: "anthropic"`), so Pi uses the same `applyAnthropicCacheControl` function to handle them

Chapter 3 discussed "why Pi rebuilds `llmContext` each loop without breaking cache": the answer is in this table. Once `cacheRetention` is set, every loop in the Trace uses the same strategy and the same marks (system/tools content unchanged, user message is rolling). The Anthropic backend matches prefix by content bytes: hit is hit, regardless of "which loop call you are on".

**Why does Anthropic pick three specific positions for marks?** Not random: `system + tools` is the most stable prefix within the Trace, and `last user message` is the rolling "cutoff line". Anthropic specifies at most 4 cache breakpoints per request; these three positions cover the two segments "completely unchanged + recently rolling", the optimal solution that maximizes benefit without exceeding the limit.

Cache has high economic value: cache-hit tokens are billed at the cache-read price, usually 1/10 of normal input price. A 200K-token dialog history can save ~90% of input cost after caching.

### Error handling: Encode into the stream, do not break the loop

All translators' error handling follows the same pattern:


```
try {
 // ... normal process: Build request, send, Parse response
 stream.push({ type: "done", reason: output.stopReason, message: output });
} catch (error) {
 // Error is not thrown, Instead, it is encoded into the stream
 output.stopReason = options?.signal?.aborted ? "aborted": "error";
 output.errorMessage = error.message;
 stream.push({ type: "error", reason: output.stopReason, error: output });
}
```


**This is where Chapter 3 mentioned `stopReason: "error"` and `"aborted"` are injected.** The model API itself does not return these two values: they are set by the translator's catch block on exception. Could be network timeout, API key expired, or user actively canceling. Regardless of the cause, the exception is wrapped into an event; Agent Loop can retry, degrade, or report to the user after receiving it, the loop does not stop.

There is also a hidden problem: **context overflow**. Sometimes the request does not error, but the model returns empty output: because the input had too many tokens and was silently truncated by the server. Pi has an `isContextOverflow()` function that does triple detection (error message pattern matching, token count comparison, zero output + `length` stop), to unified catch different Providers' various overflow behaviors.

---

## 6. Back to that one line of code

Back to the opening question: what happens behind `streamSimple(model, context)`: that one line of code?

In one sentence: **Agent Loop says "use this model to handle this dialog", the front desk looks up which translator to use, the translator translates the request into the Provider's format and sends it to the model, then translates the model's streaming response back to unified events: Agent Loop only ever sees the unified event stream, with no idea how much translation happened in between.**


```
Agent Loop: streamSimple(model, context, { reasoning: "high" })
 │
 │ ① streamSimple Processing thinking level translation(Look up table → clamp → adjustmaxTokens)
 │
 │ ② call stream() → Check the table at the front desk → find translator
 │
 │ ③ translator job: 
 │ · unified format → Provider private format(Request translation)
 │ · Send to model
 │ · Provider private response → 12a unified event(response translation)
 │
 │ ④ Return AssistantMessageEventStream
 │
 └── Agent Loop: for await (event of stream) { ... } ← consumption unified event
```


**Agent Loop only sees ④: a clean event stream.** This is the power of the three-layer architecture: complexity is encapsulated inside the translator, the external interface stays clean.

### Design essence

Three core ideas worth taking away:

**1. "Protocol > implementation" design method.** Pi did not design a `BaseProvider` abstract class for all translators to inherit, but defined an event protocol (12 events) and a function signature (`StreamFunction`). Why not inheritance? Because translators share almost no common ground: inheritance requires finding common code, but Anthropic and Google do not even share field names for "send a message". A protocol only specifies "what input, what output", without caring how it is handled in the middle.

**2. "Unified enum + mapping table" strategy.** ThinkingLevel is a unified enum (5 levels), and `ThinkingLevelMap` lets each Model bring its own translation table. The upper layer says `"high"`, the lower layer looks up the table. More flexible than "take the intersection of all Providers" (the intersection might only have `"off"`), and more concise than "expose each Provider's native params" (the upper layer does not need to know 20 parameter names).

**3. "Unified semantics, dispersed implementation".** `cacheRetention` (none / short / long) is a semantic interface: the upper layer says "I want long-term cache", regardless of whether the lower layer marks or inserts nodes. A semantic interface describes "what to do", a mechanism interface describes "how to do it".

---

## 7. Next stop

The AI layer wraps model differences cleanly: Agent Loop has no idea what model is underneath.

But how does the Agent "do things"? The model returns a `ToolCall`, who executes it? During execution, how to ensure parameters are correct (the model may pass wrong-type parameters), how to ensure safety (the model may request executing a dangerous command)? Chapter 3 skipped this process as a black box.

Next chapter, we open this black box: the tool system.

---

> **Key source index for this chapter**:
> 
> `packages/ai/src/compat.ts:237-247`: `stream()` entry (Layer 1 · low-level)
> `packages/ai/src/compat.ts:258-268`: `streamSimple()` entry (Layer 1 · convenience wrapper)
> `packages/ai/src/compat.ts:172-206`: Provider registration ("directory")
> `packages/ai/src/types.ts:304-308`: `StreamFunction` signature ("constitution")
> `packages/ai/src/types.ts:453-465`: 12 `AssistantMessageEvent`s (Layer 2 · event protocol)
> `packages/ai/src/api/anthropic-messages.ts`: Anthropic translator (Layer 3 · 5-step skeleton)
> `packages/ai/src/api/openai-completions.ts`: OpenAI translator
> `packages/ai/src/types.ts:74-76`: `ThinkingLevel` / `ThinkingLevelMap`
> `packages/ai/src/models.ts:410-429`: `clampThinkingLevel` fallback strategy
> `packages/ai/src/utils/overflow.ts:126-155`: `isContextOverflow` triple detection

---

> **Version note**
> This chapter is written against Pi **v0.80.2**. Code analysis follows the [earendil-works/pi](https://github.com/earendil-works/pi) repository (tutorial links may point at `main` and differ slightly from v0.80.2).


---

> **Next up**
> [Chapter 5: Tool System](ch05-tool-system.md)
