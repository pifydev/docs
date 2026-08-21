---
title: "Chapter 10: Session Management: Storing, Resuming, and Forking Conversations"
chapter: 10
slug: en/ch10-session
title_zh: "第10章：会话管理: 对话的存储、恢复与分叉"
title_en: "Chapter 10: Session Management: Storing, Resuming, and Forking Conversations"
title_vi: "Chương 10: Quản lý Session: Lưu trữ, khôi phục và phân nhánh cuộc hội thoại"
source_url: https://www.dgzhuya.com/modules/ch10-session
language: en
version_pairs:
 zh: zh/src/ch10-session.md
 en: en/src/ch10-session.md
 vi: vi/src/ch10-session.md
original_chars: 6407
code_lines: 187
reading_minutes: 33
translator: hypnguyen1209
reviewed_by: null
last_updated: "2026-08-20"
status: translated
official_refs: []
terms_used: []
code_blocks: 30
mermaid_blocks: 0
---

# Chapter 10: Session Management: Dialog Storage, Recovery, and Forking

When talking about the compaction algorithm in Chapter 9, we kept mentioning one concept: Session Tree. The compaction result (CompactionEntry) is stored on the Session Tree; `buildSessionContext()` builds the context the LLM needs from the Session Tree.

This chapter answers: what exactly is a Session Tree?

But before explaining Session Tree, we have to answer a more fundamental question: **how is session data stored?** The original article skipped this question, but it is the real starting point of this chapter.

---

## 1. Problem: how is session data stored?

The first 8 chapters we kept working with `context.messages`: it is an array storing the current turn's dialog. But every time the Agent starts, where does this array come from? After closing, where does it go?

This leads to the most basic engineering question: **how is session data stored?**

This question contains **two independent sub-questions** that need to be separated:

- **Sub-question A: where is it stored?** (storage medium)
- **Sub-question B: what does it look like?** (data structure)

The two dimensions are orthogonal: you can "use mysql to store a linear array", or "use JSONL files to store a tree". Confusing them will make the subsequent discussion muddled. We'll expand each separately.

### Sub-question A: where is it stored? (medium)

If you have done backend development, your first reaction might be mysql / postgres type relational databases: a `messages` table with `user_id + role + content + timestamp`, grouped by session id.

Pi's coding-agent **did not take this path**. It chose **local JSONL files**: one `.jsonl` file per session, in the user-local project directory. One entry per line, plain text.

Why files instead of a database? This is related to the coding-agent's product positioning:

- **Single user, runs locally**: coding-agent is a CLI tool running on the user's own machine; there is no need for "multi-user concurrency" or "cross-machine queries"; the database's concurrency/indexing/transactions are all over-engineered
- **Sessions follow the project**: `cd /project-a` opens project a's session history, `cd /project-b` opens project b's: each project's `.pi/sessions/` directory is that project's dialog archive
- **Zero dependencies, zero ops**: no need to install mysql, no need to start services, works out of the box
- **Readable, debuggable**: JSONL is plain text, can be `cat` / `grep` / opened directly in an editor, debug-time everything is clear

But Pi does not weld this path shut. The agent-core layer provides a `SessionStorage` interface (`harness/types.ts:440`), letting other applications implement their own database version. agent-core ships two implementations: `JsonlSessionStorage` (file) and `InMemorySessionStorage` (in-memory, for tests). **Note**: coding-agent's `SessionManager` (`session-manager.ts:758`) **does not implement** agent-core's `SessionStorage` interface: they are **two independent implementations**, coding-agent directly reads and writes its own JSONL files, not going through agent-core's abstraction layer. This "interface exists but is not forced to be reused" arrangement is a real example of loose coupling between Pi's internal packages.

> Implementation: `SessionStorage` interface in `packages/agent/src/harness/types.ts:440`; `JsonlSessionStorage` in `packages/agent/src/harness/session/jsonl-storage.ts`; coding-agent's independent `SessionManager` in `packages/coding-agent/src/core/session-manager.ts:758` (does not implement the former)

So the choice for the "where is it stored" layer is: **coding-agent chose local JSONL files, but the interface allows other applications to swap in a database**. With this layer clear, the next layer's question becomes easier to discuss.

### Sub-question B: what does it look like? (structure)

Where to store is solved, but there is a deeper question: **what is the logical form of dialog data?**

The most intuitive answer: **linear array**. `messages = [msg1, msg2, msg3,. ..]`, one after another. This structure is the simplest, also the default form of mysql-style `messages` tables.

But in real usage scenarios, dialogs are **not always linear**:

- **Retry**: Agent's reply is bad, you want to "go back to the previous turn" and regenerate
- **Branch**: you want to try two different approaches at some node, compare results
- **Rewind**: walked down a path and found it wrong, want to return to a previous fork

If dialog is a linear array, these operations mean "delete later messages and rewrite". Deleted is gone: what if you want to keep two branches' records? For example, first try plan A all the way, then go back and try plan B: A's conversation record also needs to be kept for comparison.

Linear array cannot do "fork without losing data". Pi's answer is **Session Tree**: organize dialog history into an **append-only, no-modify, no-delete tree**. Rewind / branch is not "delete data" but "move a pointer".

| Dimension | Common choice | Pi's choice |
| --- | --- | --- |
| Where to store | mysql etc. | Local JSONL file (interface allows database) |
| What it looks like | Linear array | Tree (Session Tree) |

Next we use a complete real dialog as an example, "growing" this tree step by step.

---

## 2. Watch a real dialog grow the tree

Abstractly saying "Session Tree is an append-only tree" is hard for anyone to grasp. We use a specific scenario: **debugging an auth bug**.

Imagine you open Pi Agent and perform 8 operations:

```
steps 1: switch to Claude 4.6 model(You want to use a smarter model)
steps 2: you ask "auth.ts inside salt Why verification failed？"
steps 3: Agent decide to tune read Tools for reading auth.ts
steps 4: read tool returns auth.ts content
steps 5: Agent reply after analysis "The problem is 23 OK, salt No coding"
steps 6: You are not satisfied with this answer, Go back to step 2 Start over
steps 7: Ask in a different way "Look first hash Function implementation"
steps 8: Agent tune grep + read Give new analysis
```


Next let's see how these 8 steps make the session tree grow from "empty" to a tree with branches.

### Step 1: switch model, first node on the tree

When the session starts, the file's first line is the Session Header (not a tree node, file metadata). Then you switch model, producing the first real tree node `ModelChangeEntry`:

```
e1: ModelChangeEntry
 parentId: null(root node)
 payload: { model: "claude-sonnet-4-6" }
```


The tree now has only one node:

```
e1 (model_change)
↑
leafId here
```


### Step 2: you ask, UserMessage node on the tree

You type "why does salt validation fail in auth.ts?": produces e2 (UserMessage), with parent pointing to e1:

```
e2: MessageEntry
 parentId: e1
 message:
 role: "user"
 content: [{ type: "text", text: "auth.ts inside salt Why verification failed？" }]
```


Note `parentId: e1`: it points to "the previous node", not to the session header. The tree:

```
e1 (model_change)
 └── e2 (user message)
 ↑
 leafId
```


### Step 3: Agent calls read tool, AssistantMessage node on the tree

Agent decides to read the file first: produces e3 (AssistantMessage with a ToolCall):

```
e3: MessageEntry
 parentId: e2
 message:
 role: "assistant"
 content: [
 { type: "text", text: "let me read it auth.ts" },
 { type: "toolCall", id: "call_001", name: "read",
 arguments: { path: "src/auth.ts" } }
 ]
 stopReason: "toolUse"
```


This AssistantMessage **simultaneously contains text and a tool call**: they are placed in the same content array, is the structure we saw in Chapter 6.

```
e1 (model_change)
 └── e2 (user)
 └── e3 (assistant + ToolCall)
 ↑
 leafId
```


### Step 4: read tool returns the result, ToolResult node on the tree

After the tool executes, a ToolResult message node is produced:

```
e4: MessageEntry
 parentId: e3
 message:
 role: "toolResult"
 toolCallId: "call_001" ← related to e3 inside ToolCall
 content: [{ type: "text", text: "export function verifySalt(s) { ... }" }]
 isError: false
```


Note the `toolCallId` field: it links this ToolResult to the ToolCall that triggered it. This is what Chapter 5 said "the tool result must accurately link back to the call request" looks like at the data layer.

```
e1 (model_change)
 └── e2 (user)
 └── e3 (assistant + ToolCall)
 └── e4 (toolResult)
 ↑
 leafId
```


### Step 5: Agent gives the analysis, another AssistantMessage

Agent sees the file content and replies with analysis:

```
e5: MessageEntry
 parentId: e4
 message:
 role: "assistant"
 content: [{ type: "text", text: "The problem is 23 OK, salt No coding" }]
 stopReason: "stop"
```


Up to now, 5 operations have produced 5 nodes, all on one straight line: this is the "main branch":

```
e1 (model_change)
 └── e2 (user: "salt Why verification failed?")
 └── e3 (assistant: read auth.ts)
 └── e4 (toolResult: auth.ts content)
 └── e5 (assistant: "The problem is 23 OK")
 ↑
 leafId
```


Here you see the "append operation": each step does only two things: create a new node (with parentId) + move leafId. No old node is modified.

### Step 6: rewind: this is the key turning point

You're not satisfied with the "problem is on line 23" analysis, you want to change approach. At this point you do a **rewind**: but **no nodes are deleted**:

```
branch(branchFromId: "e2"): void {
 this.leafId = "e2"; // Just change this line
}
```


The operation is just one line: `leafId = "e2"`. The tree after rewind looks like:

```
e1 (model_change)
 └── e2 (user: "salt Why verification failed?")
 ├── e3 (assistant: read auth.ts) ← The old branch is still there
 │ └── e4 (toolResult) Keep data intact
 │ └── e5 (assistant: "The problem is 23 OK")
 │
 ↑ leafId Point back now e2
```


**e3, e4, e5 are not deleted**: they are still on the tree, just not on the "current path". This is the core of append-only: **rewind is not deleting data, it is moving the pointer**.

Why keep them? Because you don't know whether in the future you'll want to return to the old branch. Maybe the new approach doesn't work out after half a day, you want to go back and see the original "problem is on line 23" analysis. If rewind deleted, it could never be recovered.

### Step 7: change approach, re-ask: new branch grows

From the e2 fork point, you change the question, producing a new node:

```
e6: MessageEntry
 parentId: e2 ← follow e3 share the same parent！
 message:
 role: "user"
 content: [{ type: "text", text: "Look first hash Function implementation" }]
```


Note: e6's `parentId` is also `e2`, same as e3. This is the essence of branching: **two nodes sharing the same parent are the two branches on the tree**.

```
e1 (model_change)
 └── e2 (user: "salt Why verification failed?")
 ├── e3 (assistant: read auth.ts)
 │ └── e4 (toolResult)
 │ └── e5 (assistant: "The problem is 23 OK")
 │
 └── e6 (user: "Look first hash function") ← new branch starting point
 ↑
 leafId
```


### Step 8: new branch continues to grow

Agent on the new branch calls grep + read tools, producing 3 new nodes (assistant + toolResult + assistant):

```
e1 (model_change)
 └── e2 (user: "salt Why verification failed?")
 ├── e3 (assistant: read auth.ts)
 │ └── e4 (toolResult)
 │ └── e5 (assistant: "The problem is 23 OK")
 │
 └── e6 (user: "Look first hash function")
 └── e7 (assistant: grep hash)
 └── e8 (toolResult: grep result)
 └── e9 (assistant: new analysis)
 ↑
 leafId
```


Now the whole tree has 9 nodes, split into two branches. **All data is completely preserved**: you can return to the e5 branch at any time to continue working, or continue along the e9 branch.

This is the complete Session Tree story: **dialog is a tree, every message is a node, rewind/branch don't delete data, only move the pointer**.

Session Tree: append-only state changes

**Diagram caption:** three snapshots showing the tree's evolution: 1. currently at A2 -> 2. user rewinds to A1 (only move leafId, A2 node still on tree becomes dashed, O(1)) -> 3. from A1 a new branch B1->B2 grows. All "abandoned" branches are never deleted: this is the iron rule of append-only. Bottom legend: red = current leafId position, green = new branch, dashed gray = abandoned but still preserved branches.

---

## 3. Tree node anatomy

Now that we've seen how the tree grows, let's look at the node itself in detail.

### A complete MessageEntry looks like this

The AssistantMessage from step 3, in the. jsonl file, is one line like this:

```
{
 "type": "message",
 "id": "e3",
 "parentId": "e2",
 "timestamp": "2026-07-03T10:23:45.000Z",
 "message": {
 "role": "assistant",
 "content": [
 { "type": "text", "text": "let me read it auth.ts" },
 { "type": "toolCall", "id": "call_001", "name": "read",
 "arguments": { "path": "src/auth.ts" } }
 ],
 "model": "claude-sonnet-4-6",
 "stopReason": "toolUse",
 "usage": { "input": 1250, "output": 80 }
 }
}
```


Reading this JSON you grasp the entire essence of the Session Tree:

| Field | What it does | Design motivation |
| --- | --- | --- |
| `type: "message"` | Distinguishes node types | The tree carries more than messages: there are also `model_change`, `compaction`, and other kinds |
| `id: "e3"` | Unique node identifier | Other nodes reference it through `parentId` |
| `parentId: "e2"` | Points to parent node | **recognize-father-not-child (认父不认子)**: the node does not know which children it has |
| `timestamp` | Creation time | Used for sorting and debugging |
| `message` | Actual message payload | `role` + `content` + `model` fields (covered in Chapter 6) |

**Key point: `parentId` is one-way.** A node knows where it came from (`parentId`), but the parent does not know which children it has. This is not an oversight: it is by design: if the parent had to maintain a `children` list, appending a new child would require modifying the parent, violating the append-only principle. **So "recognize-father-not-child" (认父不认子) is a necessary condition for append-only.**

### 9 Entry types, grouped by responsibility

Section 2 showed four node types: `model_change`, `user`, `assistant`, `toolResult`. In fact Pi defines **9 Entry types** in total. It looks like a lot, but **grouping them by "impact on the LLM call" into three groups** makes it clear:

**Group 1: Enter the LLM context (4 types)**

These 4 become one entry in the messages array, sent to the LLM:

| Type | What message is produced | Example |
| --- | --- | --- |
| `MessageEntry` | UserMessage / AssistantMessage / ToolResultMessage | All dialog messages from steps 2–5 |
| `CustomMessageEntry` | CustomMessage (the custom messages covered in Chapter 6) | Special messages injected by extensions |
| `CompactionEntry` | CompactionSummaryMessage (replaces old messages) | Compaction results covered in Chapter 9 |
| `BranchSummaryEntry` | BranchSummaryMessage (summary of an abandoned branch) | Covered later in §4 |

**Group 2: Affect subsequent LLM calls (2 types)**

These 2 produce no message, but change parameters of subsequent LLM calls:

| Type | What it changes | Example |
| --- | --- | --- |
| `ModelChangeEntry` | Which model to use afterwards | Step 1 switched to Claude 4.6 |
| `ThinkingLevelChangeEntry` | The thinking level afterwards | User adjusts thinking intensity |

**Group 3: Pure metadata, no LLM impact (3 types)**

These 3 produce no message and don't change LLM parameters: purely for UI or extension use:

| Type | What it does |
| --- | --- |
| `LabelEntry` | Tags a node with a bookmark ("this is a key point") |
| `SessionInfoEntry` | Session metadata (name, creator, etc.) |
| `CustomEntry` | Metadata that extensions store themselves |

**Why such fine-grained typing?** Because `buildSessionContext()` (covered in the next section) needs to dispatch by type: messages go into the messages array, state changes modify state variables, metadata is skipped. If there were only one type, the processing logic would be stuffed with `if-else` chains, hurting both readability and extensibility.

9 Entry types on the Session Tree

Dark mode policy override.
 prose.css applies `invert(1) hue-rotate(180deg)` to `.prose figure svg` by default.
 When `darkMode="native"` or `"none"`, we need to opt out of that filter.
 Since `<img src="*.svg">` renders as an `<img>` element (not inline SVG), the global `.prose figure svg` selector does not match it: but if the host page inlines the SVG into the DOM, this override is needed.
 The rule below strategically opts out for the inline-SVG case.

**Diagram caption:** All Entries share the base fields (`type` / `id` / `parentId` / `timestamp`), grouped by "impact on the LLM call" into three groups: ① Enter context (4 types, red, pushed into the messages array); ② Affect state (2 types, black, only modify `model` / `thinkingLevel` variables); ③ Pure metadata (3 types, dashed gray, skipped by `buildSessionContext`). This classification drives the dispatch logic of `buildSessionContext` in the next section.

> Type definitions live in the `SessionEntry` union type at `packages/agent/src/harness/types.ts`

### Why "recognize-father-not-child" (认父不认子) is a necessary condition for append-only

Back to the `parentId` design. What if we switched to "recognize-child-not-father": child nodes have no `parentId`, but the parent has a `children` list? What would happen?

Back to step 7, where you grow a new branch e6 from e2. Under "recognize-child", e2's `children` list would change from `[e3]` to `[e3, e6]`: **that requires modifying e2**. But append-only forbids mutating nodes, so we have a contradiction.

So **only "recognize-father-not-child" lets the append operation modify no old nodes**. This is a design that seems counter-intuitive ("in trees the parent usually knows its children") but is completely sound.

---

## 4. Three core operations + branch summary

With the concrete example from §2 in hand, we can now lay out the three core operations and branch summaries together.

### Operation 1: append: O(1), no old nodes modified

The append operation has only three steps:


```
1. create new Entry(including one's own id, parentId Point to current leafId, payload)
2. Deposit byId mapping table(id → entry)
3. leafId = new entry of id
```


Back to step 3 (producing node e3):


```
appendEntry({ type: "message", id: "e3", parentId: "e2", message: ... });
// internal:
// byId.set("e3", newEntry);
// this.leafId = "e3";
```


**e2 was not modified**: we created e3 with its `parentId` pointing to e2. e2 has no idea it gained a child, but a reverse lookup through the `byId` table finds all nodes whose `parentId` references it. That is exactly what "recognize-father-not-child + `byId` reverse lookup" means: the parent doesn't store children, the global index does.

Cost? One extra `Map.has()` per append. Negligible. The benefit is that all old nodes stay immutable, every `parentId` pointer is forever valid, and you can rewind/branch freely without any cascading rewrites.


### Operation 2: rewind: only move leafId


```
branch(branchFromId: "e2"): void {
 if (!this.byId.has(branchFromId)) {
 throw new Error(`Entry ${branchFromId} not found`);
 }
 this.leafId = "e2"; // The core is this line
}
```


**The whole core is that one line `leafId = branchFromId`** (plus an existence check to avoid pointing to a missing node). No deletion of e3, e4, e5: they are still in `byId`, still in the `.jsonl` file. `leafId` is the only mutable pointer; everything else stays immutable. This is what makes `branch()` O(1):

- No tree restructuring
- No file rewriting
- No need to compute "new current path" (the next append will start from e2)

If you want a clean retry without keeping any history hint, `branch()` is enough. But Pi also offers a more thoughtful option: generate a summary of the abandoned branch, hang it on the new branch so the Agent knows "we tried X before, here's what we learned":


### Operation 3: branch: the natural result of appending after a rewind

### Branch summary: BranchSummaryEntry: optional on rewind


```
branchWithSummary(fromId: "e5"): Promise<void> {
 // 1. put e3-e5 This abandoned branch feeds LLM Generate a structured summary
 // 2. create a new BranchSummaryEntry, its parentId point to e2(with e3-e5 Same father)
 // 3. The summary content is structured(Goal / Progress / Decisions Wait, Same as compressed summary format)
}
```


After hanging it on, the tree becomes:


```
e2 (user)
 ├── e3 (assistant: read auth.ts)
 │ └── e4 (toolResult)
 │ └── e5 (assistant: "The problem is 23 OK")
 │
 ├── e_BranchSummary (BranchSummaryEntry: "Tried before read auth.ts, discover salt Encoding issues but not solving the root cause")
 │
 └── e6 (user: "Look first hash function")
 ...
```


**Difference between `BranchSummaryEntry` and an ordinary message**: it is the "last words" of the abandoned branch, not a dialog that happened. `buildSessionContext` turns it into a **`BranchSummaryMessage`** (distinct from the `CompactionSummaryMessage` produced by compaction: two different message types; see `createBranchSummaryMessage` at `session-manager.ts:397` vs `createCompactionSummaryMessage` at `:403`; Chapter 6 covered how `convertToLlm` translates this into a `<summary>` UserMessage). So the Agent on the new branch sees: "We previously tried X and concluded Y": it knows the history, but it is not drowned in the old branch's details.

**This is optional**: if the old branch doesn't matter at all, just call `branch()`, no summary generated. `branchWithSummary()` is for scenarios where you want to preserve the essence of history but not the full conversation.

> Implementation: `branchWithSummary` in `packages/coding-agent/src/core/session-manager.ts`; summary generation reuses the structured prompt from Chapter 9.

---

## 5. From tree to LLM context: buildSessionContext

The tree is built, but **the LLM doesn't understand trees**. The LLM's API only accepts a **linear `messages` array** (Chapter 6: `user` / `assistant` / `toolResult` three kinds). So before each LLM call, you have to "flatten" the tree into an array. That's what `buildSessionContext()` does.

### Why this step must exist

Imagine the LLM's perspective: you send it an HTTP request whose body is `messages: [...]`: an array. It doesn't know whether your session history is a tree or an array; it only sees the `messages` array.

So no matter how complex your internal data structure is, **it must become linear at the LLM boundary**. This is the Session Tree's "exit": storage is tree-shaped, but the exit format is a linear `messages` array.

### Step 1: path traversal: walk from leaf back to root

Back to our example, the current `leafId` is e9. `buildSessionContext` first walks from e9 back to the root, collecting all entries along the path:


```
const path: SessionEntry[] = [];
let current = byId.get(leafId); // e9
while (current) {
 path.push(current); // Press first leaf → root sequential collection
 current = current.parentId ? byId.get(current.parentId): undefined;
}
path.reverse(); // Invert to root → leaf order
```


After the walk, the `path` array (in root → leaf order) is:


```
[e1, e2, e6, e7, e8, e9]
```


**Note that e3, e4, e5 are not in `path`**: they are not on the current branch. That is what "current path" means: only the single line from leaf back to root. Data on other branches is not sent to the LLM.

### Step 2: dispatch by type

Each entry along the path is handled according to its type:


```
e1 (model_change) → Update state variables model = "claude-sonnet-4-6", Not entering messages
e2 (user message) → push in messages array
e6 (user message) → push in messages array
e7 (assistant + ToolCall) → push in messages array
e8 (toolResult) → push in messages array
e9 (assistant) → push in messages array
```


Finally, the resulting `messages` array looks like:


```
[
 { role: "user", content: "auth.ts inside salt Why verification failed?" }, // e2
 { role: "user", content: "Look first hash Function implementation" }, // e6
 { role: "assistant", content: [{ text: ... }, { toolCall: grep ...}] }, // e7
 { role: "toolResult", toolCallId: "call_002", content: ... }, // e8
 { role: "assistant", content: [{ text: "new analysis..." }] } // e9
]
```


Notice one subtle thing: **e2 and e6 are both user messages: two user messages in a row**. Does the LLM API protocol allow that? Most providers allow it, but some require merging. Pi handles this merging at the `convertToLlm` layer (the conversion rules covered in Chapter 6).

### State variables: overwrite-style extraction

`model_change` and `thinkingLevel_change` don't enter the `messages` array, but they affect "which parameters to use when calling the LLM". The extraction is **overwrite-style**: walk along the path from root to leaf, overwriting on each change:


```
e1 (model_change: "claude-sonnet-4-6") → model variable = "claude-sonnet-4-6"
e2-e9(No model_change) → model variables remain unchanged
```


If the path contains multiple `model_change` entries (say first switched to 4.6, then 4.5, then back to 4.6), the last one wins: which matches the "last-write-effective" semantics.

> **Initial-value fallback:** in `buildSessionContext` the `model` state variable initializes to `null` (`session-manager.ts:367`). If the path has **no `model_change` node at all** (e.g. never switched models), the function returns `model: null`; the caller (`agent-session-runtime`) falls back to the initial model configured at session start. Assistant messages themselves don't carry "which model generated them" info: the model is determined entirely by `model_change` nodes.

**This is exactly why Pi stores "switching the model" as a node rather than a state variable**: a node fully records "when did we switch, at which position", while a state variable can only hold the last value. If you rewind to a point before the model switch, `buildSessionContext`'s path doesn't include that `model_change`, so `model` falls back to the pre-switch value automatically. **Node-ifying state makes rewind correct.**


### CompactionEntry special handling: selective collection


```
e1 (user) ← This was preceded by early conversations(has been compressed)
e2 (assistant) ← compressed
e3 (assistant) ← compressed
e4 (compaction) ← Compress node, recorded firstKeptEntryId = "e3"
e5 (user) ← Recent messages retained after compression
e6 (assistant)
```


When `buildSessionContext` walks past e4, it does **not simply "stop collecting messages before it"**: it does **selective collection by `firstKeptEntryId`**:

1. First generate one `CompactionSummaryMessage` (from the `summary` field of e4) and push it to the front of the `messages` array
2. Among entries **before** e4, only collect those **at or after `firstKeptEntryId` (e3)**: e1, e2 are dropped, e3 is kept
3. All entries **after** e4 are collected normally

The resulting `messages` array:


```
[
 CompactionSummaryMessage (from e4 generate), // replaced e1, e2
 { role: "assistant", ... }, // e3(The first one in the reserved area)
 { role: "user", ... }, // e5
 { role: "assistant", ... }, // e6
]
```


## 6. JSONL persistence details

### Format: one Entry per line

**This is the concrete implementation of "compaction result replaces old messages" mentioned in Chapter 9**: it does not delete e1 and e2 (append-only forbids deletion); instead, `buildSessionContext` "skips" them during traversal based on `firstKeptEntryId`. Next time you rewind to before e4, the path of `buildSessionContext` will not include e4, and e1–e3 will reappear as normal messages: compaction is not destructive, it is just a "view on the current path".

Notice that `firstKeptEntryId` is a field recorded on the `CompactionEntry` itself: it was calculated at compaction time as "which recent messages to keep". The "find a cutting point" logic from Chapter 9 exists precisely to determine this `firstKeptEntryId`.

> Implementation: `buildSessionContext` in `packages/coding-agent/src/core/session-manager.ts`: the core logic for path traversal and dispatch-by-type.


```
{"type":"session","version":3,"id":"UUIDv7","cwd":"/project","timestamp":"2026-07-03T10:00:00Z"}
{"type":"model_change","id":"e1","parentId":null,"provider":"anthropic","modelId":"claude-sonnet-4-6","timestamp":"2026-07-03T10:00:05Z"}
{"type":"message","id":"e2","parentId":"e1","message":{"role":"user","content":[{"type":"text","text":"auth.ts inside salt Why verification failed?"}]},"timestamp":"2026-07-03T10:23:00Z"}
{"type":"message","id":"e3","parentId":"e2","message":{"role":"assistant","content":[{"type":"text","text":"let me read it auth.ts"},{"type":"toolCall","id":"call_001","name":"read","arguments":{"path":"src/auth.ts"}}],"stopReason":"toolUse"},"timestamp":"2026-07-03T10:23:30Z"}
{"type":"message","id":"e4","parentId":"e3","message":{"role":"toolResult","toolCallId":"call_001","content":[{"type":"text","text":"export function verifySalt(s) { ... }"}],"isError":false},"timestamp":"2026-07-03T10:23:31Z"}
{"type":"message","id":"e5","parentId":"e4","message":{"role":"assistant","content":[{"type":"text","text":"The problem is 23 OK, salt No coding"}],"stopReason":"stop"},"timestamp":"2026-07-03T10:24:00Z"}
{"type":"message","id":"e6","parentId":"e2","message":{"role":"user","content":[{"type":"text","text":"Look first hash Function implementation"}]},"timestamp":"2026-07-03T10:30:00Z"}
{"type":"message","id":"e7","parentId":"e6",...}
```


The first line is the Session Header (`type: "session"`), recording session metadata (`cwd`, version, etc.). Each subsequent line is one Entry.

**A few notable details**:

1. **e6's `parentId` is e2**: through this field you can see "there's a branch here" in the file. Running `grep '"parentId":"e2"'` finds all children grown from e2.
2. **`timestamp` is an ISO string**: human-readable, so during debugging the order is obvious at a glance.
3. **`id` is an 8-character short UUID** (e.g. `a1b2c3d4`): saves space vs. full UUID; collision probability within a session is low enough.

**Why JSONL instead of a single JSON blob?** Because JSONL is **line-level append**: new Entries are appended directly to the end of the file via `appendFileSync`, no need to read-modify-rewrite the entire file. This matches the append-only tree design perfectly: the tree only appends, never modifies; the file only appends, never rewrites.

> Implementation: `_appendEntry` (around L941) in `packages/coding-agent/src/core/session-manager.ts`, using `appendFileSync`.

### Lazy write: avoiding "a question with no answer" half-finished dialog

There's one write-policy detail: **writes are delayed until the first assistant message arrives**. The rule has four cases:

| Has assistant? | Flushed? | Behavior |
| --- | --- | --- |
| No | Yes | Append current entry immediately |
| No | No | Mark as "not flushed", **don't write to disk**: wait for assistant |
| Yes | No | **Rewrite the entire file** (header + all buffered entries), use `openSync("wx") + writeFileSync` for atomicity, mark as flushed |
| Yes | Yes | Append current entry immediately |

Why this complex logic? To avoid leaving behind half-finished dialog with "a question but no answer": the user asked something but the Agent never replied (network drop, API error, etc.). If every user message were flushed immediately, on next open you'd see a lone user message hanging there with no matching reply. By delaying the batch write until the first assistant message arrives, anything that lands on disk is guaranteed at least one complete user↔assistant exchange.

After that, all entries are appended immediately: once the first flush happens, this mechanism no longer kicks in because we're "on track".

### Occasional whole-file rewrites

Although daily appends use `appendFileSync`, there are two situations that trigger a full file rewrite (`writeFileSync`):

- **Creating a branch copy**: when cloning a session into a new `.jsonl` file, every entry on the current path must be copied over
- **Repairing a corrupted session file**: when the file format looks abnormal, rewrite it in canonical form

Rewriting does not break the append-only principle: the rewrite produces a new file or new format, while the original historical data is fully preserved inside the rewritten content.

> Implementation: `_rewriteFile` in `packages/coding-agent/src/core/session-manager.ts`, around L876.

---

## 7. Two-layer implementation: the interface allows swapping the database

Session Tree has two layers of implementation, echoing the "interface allows swapping the database" point from §1:

| | agent-core layer | coding-agent layer |
| --- | --- | --- |
| **API style** | Asynchronous | Synchronous |
| **Entry types** | 11 types | 9 types |
| **Storage** | `SessionStorage` interface (pluggable) | **Independent implementation**, directly operates JSONL |
| **Purpose** | Generic framework layer | Coding Agent product layer |

`agent-core` provides a generic Session management framework and the `SessionStorage` interface. **But note: coding-agent's SessionManager does NOT implement this interface**: it is a **completely independent** implementation that directly operates its own JSONL files. It reuses `agent-core`'s type definitions (such as `SessionEntry`) but does not reuse its storage abstraction. Two implementations exist in parallel.

This "interface exists but coding-agent doesn't reuse it" arrangement has two implications: (1) if you want to build a web version of Pi Agent, you can **yourself** implement `SessionStorage` with mysql and the rest of `agent-core` stays untouched; (2) but you **cannot** just take coding-agent's SessionManager and plug it into `agent-core`'s `SessionStorage` interface: their signatures are incompatible. This is the concrete landing of "interface allows swapping the database" from §1, but the landing path is "each implemented separately" rather than "unified inheritance".

> The `SessionStorage` interface is at `packages/agent/src/harness/types.ts:440`; two reference implementations: `packages/agent/src/harness/session/jsonl-storage.ts` (file) and `memory-storage.ts` (in-memory); the independent coding-agent implementation is at `packages/coding-agent/src/core/session-manager.ts:758`.

---

## 8. Summary

### One main thread: two independent dimensions of session storage

Looking back at the most important thing you can take away from this chapter: **how session data is stored should be split into two independent questions**:

| Dimension | What it answers | Common approach | Pi's choice |
| --- | --- | --- | --- |
| **Storage medium** | Where is it stored? | mysql and similar databases | Local JSONL files (interface allows swap) |
| **Data structure** | What shape? | Linear array | Tree (Session Tree) |

These two dimensions can be chosen independently. Next time you design any "dialog history persistence" or similar state-saving system, ask yourself these two questions first, then decide on a solution: don't glue them together.

### The essence of Session Tree: using tree + append-only to achieve "rewind without losing data"

Why a tree? Because dialog isn't linear: users rewind, retry, branch.
Why append-only? Because deleted data cannot be recovered, and historical branches may have value.
Why recognize-father-not-child? Because append-only requires immutable nodes, so the parent cannot maintain a `children` list.
Why path traversal? Because the LLM only understands a linear `messages` array, tree-shaped data must be "flattened".

**This chain of design choices is coherent**: each choice responds to the constraints brought by the previous one, eventually forming a self-consistent solution.

### Three transferable ideas

**1. Separate "where to store" from "what shape".** When designing a persistence system, first think through these two questions separately, then combine the choices. Discussing them as one compresses your option space: you'll think "using a database means linear array" or "using a file means append-only", but that's not necessarily the case.

**2. Use append-only data structures for "undo / rewind / branch" scenarios.** When the system needs these capabilities, don't delete old data. Use append-only + pointer positioning (`leafId`) to keep history fully intact. The cost is storage space, but disk is cheap, data is priceless.

**3. Node-ify state variables so rewind is correct.** Pi also stores "switch model" and "adjust thinking level" as nodes (`ModelChangeEntry` etc.), instead of stuffing them into a global state object. The benefit is that on rewind the state variable automatically returns to what it was at that point: path traversal only sees changes on the current path, automatically ignoring changes that have been rewound past. This is a design worth borrowing in your own projects.

---

## 9. Next stop

Up to this chapter we have gone deep into Pi's core runtime mechanisms: Agent Loop (Ch.3), model invocation (Ch.4), tool system (Ch.5), message system (Ch.6), event-driven (Ch.7), context engineering (Ch.8), context compaction (Ch.9), session management (Ch.10).

But there's still one important capability we haven't covered: **the extension system**. Earlier chapters kept mentioning "extensions can intercept tool calls", "extensions can modify messages", "extensions can preprocess context". How does Pi add capabilities to the Agent without touching the source code?

> **Note on later chapters:** This tutorial currently only covers up to Chapter 10 (Session Management). The extension system, testing mode, design-essence summary, and other advanced topics are not yet covered; interested readers can consult the source code and documentation at the [official pi repository](https://github.com/earendil-works/pi).

---

> **Key source-code index for this chapter**:
>
> `packages/agent/src/harness/types.ts`: `SessionEntry` type definitions, `SessionStorage` interface
> `packages/agent/src/harness/session/jsonl-storage.ts`: `JsonlSessionStorage` implementation
> `packages/agent/src/harness/session/memory-storage.ts`: `InMemorySessionStorage` (for tests)
> `packages/coding-agent/src/core/session-manager.ts`: coding-agent's `SessionManager` (`buildSessionContext`, `appendEntry`, `branchWithSummary`, etc.)
> `packages/coding-agent/src/core/compaction/branch-summarization.ts`: branch-summary generation

---

> **Version note**
> This chapter is written against Pi **v0.80.2**. Code analysis follows the [earendil-works/pi](https://github.com/earendil-works/pi) repository (tutorial links may point at `main` and differ slightly from v0.80.2).

