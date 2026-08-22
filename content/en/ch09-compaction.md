---
title: 'Chapter 9: Context Compaction: When the Conversation Gets Too Long'
translation_key: ch09-compaction
language: en
chapter: 9
source_url: 'https://www.dgzhuya.com/modules/ch09-compaction'
official_refs: []
terms_used: []
status: translated
last_updated: '2026-08-20'
translator: hypnguyen1209
reviewed_by: null
code_blocks: 20
code_lines: 183
mermaid_blocks: 0
---
Chapter 8 looked at the full picture of context engineering: among which `transformContext` is just an extension point; the actual "doing the compaction" core mechanism is Compaction. When the dialog grows longer and longer, messages get more and more, eventually exceeding the model's context window (Claude 200K, GPT 128K). At this point something more aggressive is needed: **compaction of the dialog history**.

This chapter looks at how Pi compresses 50 turns of dialog into a summary when the context window is almost full, letting the Agent continue to "remember" what happened before.

---

## 1. Problem: the dialog keeps growing, the window can't fit it

The Agent and LLM dialog is "stateful": every turn sends the full prior history to the model. You chat with the Agent for 50 turns, each turn might have several thousand tokens of tool results. Quick math: 50 turns x 3000 tokens/turn on average = 150,000 tokens. Claude Sonnet's context window is 200,000 tokens. Almost full.

Before vs after compaction token usage comparison

**Diagram caption:** on the left, red bar: 185K tokens almost fill the 200K window. On the right, green: after compaction only 60K remains (10K summary + 50K recent messages), freeing 140K to keep chatting. The bottom note clarifies that compaction is lossy but preserves structured info like goals, constraints, decisions.

What happens when full? The API errors out: "prompt is too long". Dialog is forced to interrupt.

The most intuitive solution is to delete old messages: throw away the first 30 turns, keep only the most recent 20. But then the Agent becomes "amnesiac": it doesn't remember what you originally asked it to do, what decisions were made before, what files were changed.

Pi's solution is **Compaction**: turn old messages into a structured summary, use the summary to replace the raw messages. This both frees up space and retains key information.

```
before compression(185,000 token): 
┌── turns -(135,000 token)──┬── turns -(50,000 token)──┐
│ original message(Lots of tool results) │ original message(recent context) │
└──────────────────────────┴──────────────────────────┘

After compression(approx. 60,000 token): 
┌── Summary(approx. 10,000 token)──┬── turns -(50,000 token)──┐
│ structured summary(target, Progress, │ original message(keep intact) │
│ decision making, File tracking……) │ │
└────────────────────────┴──────────────────────────┘
```


The Agent still "remembers" what the first 30 turns did: its memory just changed from "raw recording" to "summary notes".

### A key timeline: compaction happens between two turns of dialog

Before reading every subsequent detail, etch one core timeline into your head: **compaction is not triggered during the dialog, it happens between two turns of dialog**:

```
User asked → Agent answer → (Agent This round is over, send agent_end event)
 │
 ▼
 Check token: Is it beyond the threshold?？
 │
 ┌──────────┴──────────┐
 ▼ ▼
 Not over → Wait for the next round Exceeded → Compress immediately
 ├─ Find the cutting point
 ├─ Generate summary
 └─ put CompactionEntry write in Session Tree
 │
 ▼
 When the next round of users starts asking questions: 
 buildSessionContext() from Session Tree Rebuild context
 → CompactionSummaryMessage Replace old messages
 → LLM What I see is"Summary + recent news"
```


**This is the key to understanding the whole chapter**: all details (when triggered, where to cut, how to generate summary, how the result takes effect) all revolve around this "between two turns" timeline. Each subsequent section is a concrete link along this main line.

```
function shouldCompact(contextTokens, contextWindow, settings): boolean {
 if (!settings.enabled) return false;
 return contextTokens > contextWindow - settings.reserveTokens;
}
```


---

## 2. When to compact: red light

### Trigger condition

Compaction isn't triggered arbitrarily: it has a clear "red line":

Plug in concrete numbers: `contextWindow = 200,000`, `reserveTokens = 16,384`.

When `contextTokens > 200,000 - 16,384 = 183,616`, compaction triggers.

`reserveTokens` is the space reserved for the LLM reply: you can't fill the context window all the way to 200,000, otherwise the model doesn't even have room to reply.

### Token estimation: imprecise but good enough

A key question: how do you know how many tokens there are currently? Exact calculation requires a tokenizer, but different models have different tokenizers, and the computation overhead is large. Pi uses a rough-and-ready approach:

```
// actual signature(compaction.ts:256-296): estimateTokens(message: AgentMessage): number
// for each message Get the number of text characters chars, then return Math.ceil(chars / 4)
function estimateTokens(message: AgentMessage): number {
 let chars = 0;
 // ...press message.role Accumulate separately text/thinking/toolCall/command/output/summary number of characters
 return Math.ceil(chars / 4); // chars / 4
}
```


An English character is about 0.25 tokens (4 chars ~= 1 token, the estimate is close to actual). **Chinese is a reverse bias**: 1 Chinese character is about 1-2 tokens, but `chars/4` only counts it as 0.25 tokens: **severely underestimates** conversations with high Chinese content. This means in pure Chinese scenarios, Pi thinks "not yet at the compaction threshold" while actual tokens are close to the upper limit. This is a known precision issue, but `chars/4` is accurate enough when English dominates, and the implementation is extremely simple.

**Why use imprecise estimation?** Because it's better to over-estimate than to under-estimate. Over-estimation at worst triggers one extra compaction (harmless); under-estimation makes the API error out (harmful). This is a "conservative strategy": trade precision for safety.

### Two trigger scenarios

| Scenario | When triggered | What it means |
| --- | --- | --- |
| **Preventive compaction** | Tokens exceed threshold (183,616) but no error yet | Compact in advance, avoid API error |
| **Emergency compaction** | API returns context-overflow error | Remediation, compress first then retry |

Preventive compaction is the norm: handle the problem before it happens. Emergency compaction is the fallback: in case estimation is off and the API does error, there's still a line of defense.

---

## 3. Where to cut: the cut-point algorithm

We know to compact, but where to "make the cut"? You can't cut anywhere: some positions would break data integrity.

The cut-point algorithm for compaction

**Diagram caption:** a strip of message entries (entries 0-9), each labeled with type. Accumulating tokens backward from newest, you can't cut after toolResult (red X), you can cut after user / assistant (green check). Final chosen cut is entry 7 (assistant): left side 0-6 is compressed into a `CompactionSummaryMessage`, right side 7-9 is kept. Note: cutting at assistant will split the Turn of entries 4 (user) and 5-7 (assistant + toolResult), triggering turnPrefix processing (section 5 detailed).

### Not everywhere can be cut

The LLM's dialog history has strict structural constraints. For example a `ToolResult` message must immediately follow the `AssistantMessage` (containing the ToolCall) that triggered it. If you leave the ToolCall in the "kept area" and the ToolResult into the "compressed area", the model will see "I called the read tool, but where is the result?": context break.

So the cut point must be a **valid cut point**: one that won't break the position of message pairs.

```
entry: 0 1 2 3 4 5 6 7 8
 ┌─────┬─────┬──────┬───────┬─────┬──────┬───────┬──────┬─────┐
 │ hdr │ usr │ ass │ tool │ usr │ ass │ tool │ ass │tool │
 └─────┴─────┴──────┴───────┴─────┴──────┴───────┴──────┴─────┘

Effective cutting point = [1(usr), 2(ass), 4(usr), 5(ass), 7(ass)]
 ↑
 Note: 3(tool), 6(tool), 8(tool) All are excluded
```


Source findValidCutPoints has a clear rule: **`user` and `assistant` are both valid cut points, `toolResult` is not**. The key note in the comment is:

> When we cut at an assistant message with tool calls, its tool results follow it and will be kept.

### Cut point semantics: the start of the kept area

To understand the cut point grasp one key: **the cut point is not "the last message to be cut off", it is "the first message of the kept area"**. This semantic is important and will clarify all your subsequent questions.

The cut point is `user`, what does that mean? user itself enters the kept area, **the assistant and toolResult following it also enter the kept area**: this user-led entire Turn is all kept. What gets compressed is the messages **before** this user.

```
Example: Click to select entry 4 (usr)
entry: 0 1 2 3 4 5 6 7 8
 hdr usr ass tool [usr] ass tool ass tool
 └──────── compression zone ────────┘ └────── reserved area ──────────────┘
 ↑
 cut point = Reserved Area 1
 user + behind ass + tool keep all
 → this Turn complete！
```


So cutting after `user` is **the safest choice**: guaranteeing the Turn is complete, because the assistant and toolResult following `user` all enter the kept area.

### Backward traversal: protecting the most important things

After determining valid cut points, where to cut from? Pi's strategy is **accumulating backward** (findCutPoint L392-454):

Why backward? Because **the most recent context is the most important**. The model needs to know "what did we do", "what files did we just read", "what did the user just say". Walk backward until enough tokens are accumulated (20,000), ensuring enough recent context is kept.

```
Go back from the latest news, accumulate token number. 
When the cumulative amount >= keepRecentTokens(20,000)time, stop. 
Find the nearest valid cutting point after the stop position:That's the cutter right there. 
```


The cut result splits messages into two groups: kept area (entry 7 and after) and compressed area (entry 6 and before). Each side is then processed differently.

Why backward? Because **the most recent context is the most important**. The model needs to know "what did we do", "what files did we just read", "what did the user just say". Walk backward until enough tokens are accumulated (20,000), ensuring enough recent context is kept.

```
function findCutPoint(entries, keepRecentTokens) {
 const cutPoints = findValidCutPoints(entries); // exclude toolResult

 let accumulated = 0;
 for (let i = entries.length - 1; i >= 0; i--) {
 accumulated += estimateTokens(entries[i]);
 if (accumulated >= keepRecentTokens) {
 // Find the first one >= i effective cutting point
 return first one >= i of cutPoint;
 }
 }
 return earliest cutPoint; // All needs to be compressed
}
```


The cut result splits messages into two groups:

```
Message before cutting point → messagesToSummarize(compressed)
Messages after the cut point → kept(Reserve)
```


---

## 4. What happens to the cut-off part: structured summary

The dozens of compressed turns of dialog are not directly thrown away; they become a **structured summary**.

### Summary format: not free text, fill in the form

Pi does not ask the LLM to "just write a summary": it requires the LLM to fill in a fixed-format table, 6 sections:

```
## Goal ← What does the user initially want to do?
## Constraints & Preferences ← What are the constraints?
## Progress ← what did(Done / In Progress / Blocked)
## Key Decisions ← key decisions
## Next Steps ← what to do next
## Critical Context ← Key information not to be forgotten
```


Why structured format? Because free text easily misses information: the LLM may spend a long paragraph on some interesting technical detail yet forget to record the user's core requirement. Fixed sections force the LLM to cover every dimension, reducing omissions.

### Summary generation: one LLM call

The summary-generation process: first serialize the messages into text, then call the LLM to generate the summary.

```
original message(AgentMessage[])
 │
 ▼ serialization
"[User]: help me fix it auth.ts
 [Assistant tool calls]: read(path=\"auth.ts\")
 [Tool result]: export function authenticate() {...}
 [Assistant]: Found the problem, missing salt..."
 │
 ▼ LLM call(Use summary prompt)
 │
structured summary
 ## Goal
 Fix authentication bug in auth.ts
 ## Progress
 ### Done
 - [x] Read auth.ts, identified missing salt
 ...
```


### Incremental update: not every time from scratch

If a long dialog is compressed multiple times (the first time compresses turns 1-30, the second time turns 31-50), the second compression takes the previous summary as `previousSummary`:

```
First compression: 
 input: turns - original message
 output: Summary A

Second compression: 
 input: Summary A + turns - original message
 output: Summary B(in A Incorporate new information on the basis of)
```


This makes the LLM do **update rather than rewrite**: existing Goal/Constraints are kept, new Progress is appended. More stable than writing the summary from scratch each time.

### File tracking: compaction is summary text

For the coding Agent, "which files were modified" is crucial info. Pi's summary also maintains a file tracking list:

```
<read-files>
src/auth.ts
src/utils/hash.ts
</read-files>

<modified-files>
src/auth.ts
</modified-files>
```


These lists accumulate across compactions: the second compression merges the file list in `previousSummary` into the new summary. This way, even after multiple rounds of compression, the Agent still knows what files were read and modified throughout the entire session.

---

## 5. Edge case: Turn split

Section 3 talked about both user cut points and assistant cut points being valid. But they have different natures:

- **user cut point**: ensures Turn completeness (the assistant + toolResult following user also enter the kept area)
- **assistant cut point**: **will split the Turn**: the user corresponding to this assistant is in the compressed area while the assistant itself is in the kept area

Source findCutPoint L444-453 judgment logic:

**Cut point is user -> certainly not split turn**. **Cut point is assistant (or bashExecution / custom etc.) -> might be split turn**: walk forward to find this Turn's user starting point, separately process the messages between user starting point and cut point (assistant + toolResult sequence).

### Why allow assistant cut points?

The most intuitive question is: since assistant cut points will split the Turn, why cut only at user? Wouldn't this completely avoid split turns?

The answer lies in the precision of token control. Look at this scenario:

```
const isUserMessage = cutEntry.message.role === "user";
const turnStartIndex = isUserMessage ? -1: findTurnStartIndex(entries, cutIndex, startIndex);
isSplitTurn: !isUserMessage && turnStartIndex !== -1,
```


Assume that backward accumulation reaches entry 6, accumulation just reaches `keepRecentTokens` (20K). At this point we need to find a valid cut point "at or after 6":

- If **only user cut points are allowed**: the most recent user is entry 1: meaning the kept area starts from entry 1, keeping entries 1-8 (8 entries total). But the token budget may only allow 2-3 entries. **Compaction fails**: cannot compress at all.
- If **assistant cut points are allowed**: choose entry 6 as cut point, kept area is only entries 6-8 (3 entries), **precisely controlling token count**.

This is a **trade-off**:

- Only user cut points -> kept area always too large, compaction inefficient or even fails
- Allow assistant cut points -> precisely control tokens, but split Turns -> use turnPrefix mechanism to compensate

Pi chose the latter: **first make sure compaction can take effect**, then use the turnPrefix summary to compensate for the loss of Turn completeness.

```
entry: 1 2 3 4 5 6 7 8
 usr ass tool ass tool ass tool ass
 ↑
 Accumulate backwards to here token Budget ran out
```


### turnPrefix mechanism: what happens to the split Turn?

Source calls this part **turnPrefixMessages** (compaction.ts:698-705): using a dedicated TURN_PREFIX_SUMMARIZATION_PROMPT to independently generate a prefix summary, generated in parallel with the main summary (L784-813 uses Promise.all), finally merged into one summary text.

Note the division of labor between the main summary and the turnPrefix summary:

- **Main summary** covers the compressed "complete history" (multiple complete Turns) -> uses the 6-section structured format
- **turnPrefix summary** covers the split "half Turn" (user in main summary, assistant in kept area) -> uses a lighter 3-segment format (Original Request / Early Progress / Context for Suffix)

After both summaries are merged, they are stored in the same CompactionEntry; the next buildSessionContext injects them together. What the LLM sees is a complete "what happened before compaction + half Turn's prefix".

```
entry: 1 2 3 4 5 6 7 8 9
 ┌─────┬──────┬──────┬──────┬──────┬───────┬──────┬─────┬──────┐
 │ usr │ ass │ tool │ ass │ tool │ tool │ ass │tool │ ass │
 └─────┴──────┴──────┴──────┴──────┴───────┴──────┴─────┴──────┘
 ↑ └────────── turnPrefixMessages ──────────┘ └─ kept ─┘
 turnStart=1 (entries 2-6) entries 7-9

 The cutting point is entry 7(assistant), But entry 1(user)is its Turn starting point
 → entry 1 Compress in main summary
 → entry 2-6 Yes"cut off Turn prefix", Generate separately turnPrefix Summary
```


---

## 6. How compaction results take effect

At the end of section 1 we already talked about the core timeline: compaction happens between two turns. This section expands on how compaction results affect the next run.

After compaction completes, how does the result affect subsequent Agent runs?

### CompactionEntry: the physical form of compaction results

Each compaction produces a `CompactionEntry`, stored on the Session Tree (Chapter 10 in detail):

### Context reconstruction

Next time the Agent runs, `buildSessionContext()` reconstructs the context based on CompactionEntry:

Recalling the message system in Chapter 6: `CompactionSummaryMessage` is a custom message type of coding-agent; `convertToLlm` translates it into a `UserMessage` wrapped in `<summary>` tags. What the LLM sees is: "The conversation history before this point was compacted into the following summary:. .."

**To the LLM, the dozens of turns of dialog turn into one summary**. It doesn't know the details of the raw messages, but it knows the goals, progress, decisions, and file operation records: usually enough to continue working.

```
{
 type: "compaction",
 summary: "## Goal\nFix auth.ts...\n## Progress\n...", // summary text
 tokensBefore: 185000, // before compression token number(for diagnostics and auditing)
 firstKeptEntryId: "e30", // reserved start entry id(Start here when rebuilding the context)
 details: { // File operation tracking(from extractFileOperations)
 readFiles: ["src/auth.ts", "src/utils/hash.ts"],
 modifiedFiles: ["src/auth.ts"],
 },
 // ... Contains id/parentId/timestamp Wait SessionEntryBase Field
}
```


### Automatic compaction integration

Automatic compaction is embedded in the `agent_end` event handler of AgentSession (Chapter 7 talked about the event system):

### Two event sets

The compaction process emits two events (Session-layer extension events discussed in Chapter 7):

- `compaction_start` (reason: manual / threshold / overflow)
- `compaction_end` (carries compaction result or error info)

UI can subscribe to these events to display progress hints like "compacting context...".

```
Reconstructed context: 
├── CompactionSummaryMessage(role: "compactionSummary")
│ content = summary text
│ (No.6chapter: convertToLlm translate it to UserMessage)
│
├── Original message retained(entry 30 later news)
│ ├── UserMessage: "Continue to repair"
│ ├── AssistantMessage: ...
│ └── ...
│
└── (New messages will be appended on the fly)
```


---

## 7. Complete chain review

Threading together the whole chapter, the complete journey of one compaction:

The complete chain of compaction

**Diagram caption:** 6-step horizontal flow: trigger judgment -> find cut point -> split -> generate summary (red focus) -> store CompactionEntry -> next run reconstruct context. Between step 5 and step 6 is a cross-run dashed arrow, emphasizing CompactionEntry is the bridge connecting two runs.

Each node's role at a glance:

1. **Trigger judgment**: `shouldCompact` checks if context exceeds window - reserveTokens
2. **Find cut point**: `findCutPoint` accumulates backward, guaranteeing kept area >= `keepRecentTokens`
3. **Split**: divide messages into kept area and compressed area, process turnPrefix if split turn
4. **Generate summary**: main summary (6 sections) + turnPrefix summary (3 sections), call LLM in parallel
5. **Store CompactionEntry**: written to Session Tree, ready for next run
6. **Next run reconstruct context**: `buildSessionContext` injects the CompactionSummaryMessage, original messages are gone

The result of a compation IS a `CompactionSummaryMessage` injected at the boundary between compressed area and kept area, so that the LLM sees: before this point was the summary, after this point is the recent full messages.

That's all about the complete chain. The remaining sections are about design essence: a summary of the design ideas of these mechanisms.

```
Agent End of operation(agent_end event)
 │
 ▼
Check shouldCompact()？
 │
 ├── No need → end
 │
 └── need → Perform compression
 ├── findCutPoint → Find the cutting point
 ├── serialization + LLM call → Generate summary
 ├── Append CompactionEntry Arrive Session Tree
 └── next time it runs buildSessionContext Use compressed context
```


The compaction process emits two events (Session-layer extension events discussed in Chapter 7):

- `compaction_start` (reason: "manual" / "threshold" / "overflow")
- `compaction_end` (carries compaction result or error info)

UI can subscribe to these events to display progress hints like "compacting context...".

```
① Trigger judgment
 shouldCompact() → contextTokens(185K) > contextWindow(200K) - reserve(16K)
 red light on, Start compression

② Find the cutting point
 Traverse backward → accumulate token Arrive keepRecent(20K) → Find the nearest effective cutting point
 exclude ToolResult position after → Ensure message pair integrity

③ split message
 before cutting point → messagesToSummarize(compressed)
 after cutting point → kept(Reserve)

④ Generate summary
 Serialize message to text → tune LLM fill in 6 section structured summary
 incoming previousSummary do incremental updates → Merge file tracking list

⑤ Store results
 CompactionEntry append to Session Tree

⑥ next time it runs
 buildSessionContext() → use CompactionSummaryMessage Replace old message
 convertToLlm → abstract translated into UserMessage issued to LLM
```


---

## 8. Design essence

Looking back at the whole chapter, Pi's compaction algorithm has three design ideas worth taking away. Each one is not "clever for clever's sake", but in response to a specific engineering tension.

### 1. Backward traversal + valid cut point: protecting the most important things

`findCutPoint` is not "find where you can cut", it is "find where it is worth keeping": **walking from the newest messages backward**, until `keepRecentTokens` (default 20K) is accumulated. The "reverse" thinking's judgment is: **the most recent context is the most important**: the model needs "what we just read", "what the user just said", more critically than "what was discussed 10 turns ago".

Excluding `toolResult` from cut points is due to protocol constraints: toolResult must immediately follow toolCall, otherwise the model is "called the tool but can't find the result". This is a non-negotiable hard constraint.

> Implementation: `findCutPoint` in `packages/coding-agent/src/core/compaction/compaction.ts` (around L392)

### 2. Structured summary: using fixed templates to fight the LLM's "free invention"

`SUMMARIZATION_PROMPT` forces the LLM to fill 6 fixed sections: Goal / Constraints & Preferences / Progress (three sub-items: Done / In Progress / Blocked) / Key Decisions / Next Steps / Critical Context. Among them Progress's Blocked sub-item specifically records "blocked things": the LLM sees this line in the next round and can prioritize trying to unblock.

Why not write "please summarize the dialog"? Because free-text summary has a failure mode: the LLM tends to be attracted by "interesting content", spends a long paragraph describing some technical detail, **forgets to record the user's core requirement**. Fixed sections force the LLM to scan every dimension at least once, turning "easy to miss" into "mandatory fill".

Add incremental update (UPDATE_SUMMARIZATION_PROMPT): in multiple compactions the new summary is updated on the old summary, not rewritten from scratch. This avoids the cumulative error of "each compression summary drifts slightly".

**This is an example of fighting LLM cognitive bias via prompt design**: fixed templates + incremental updates = give the LLM's ability to "recall" and "organize" information a structural constraint.

> Implementation: SUMMARIZATION_PROMPT in `compaction.ts` (around L460) and UPDATE_SUMMARIZATION_PROMPT (around L493)

### 3. File tracking accumulation: domain-specific knowledge of the coding Agent

`extractFileOperations` accumulates file lists from two sources:

1. `details.readFiles` / `modifiedFiles` from the previous compression
2. Files involved in all tool calls in the just-compressed messages (read tools -> readFiles, edit/write tools -> modifiedFiles)

Finally `formatFileOperations` wraps these two lists with `<read-files>...`/...`</read-files>` and `<modified-files>...</modified-files>` tags and appends them to the end of the summary.

Why track files separately? Because for the coding Agent, "which files were modified" is crucial meta-info: more accurate and verifiable than "what was discussed in the dialog". The LLM sees this list and knows which files have been touched by the project, avoiding repeated reads and avoiding overwriting others' changes. This is a "domain knowledge embedded into the general mechanism" approach: the compaction algorithm itself is generic, but the details field carries domain-specific info.

> Implementation: `extractFileOperations` (around L41); tag formatting in `formatFileOperations` in `utils.ts`

---

## 9. Next stop

This chapter we saw how the compaction algorithm works: from trigger judgment to cut-point calculation to summary generation. But there is one concept we keep mentioning but never elaborate on: **Session Tree**. The compaction result (CompactionEntry) is stored on the Session Tree; `buildSessionContext()` builds the LLM-needed context from the Session Tree.

What exactly is a Session Tree? Why is the dialog history a tree rather than a linear array? What are branches about?

The next chapter: session management: answers these questions.

---

> **Key source index for this chapter**:
>
> `packages/coding-agent/src/core/compaction/compaction.ts`: core algorithm (findCutPoint, prepareCompaction, shouldCompact)
> `packages/coding-agent/src/core/compaction/compaction.ts:256-296`: `estimateTokens` (chars/4 heuristic estimation)
> `packages/coding-agent/src/core/compaction/utils.ts`: other utility functions (message serialization etc.)
> `packages/coding-agent/src/core/session-manager.ts`: CompactionEntry definition + buildSessionContext
> `packages/coding-agent/src/core/messages.ts`: CompactionSummaryMessage
> `packages/coding-agent/src/core/agent-session.ts`: automatic compaction integration (triggered after agent_end)

---

> **Version note**
> This chapter is written against Pi **v0.80.2**. Code analysis follows the [earendil-works/pi](https://github.com/earendil-works/pi) repository (tutorial links may point at `main` and differ slightly from v0.80.2).


---

> **Next up**
> [Chapter 10: Session Management](ch10-session.md)
