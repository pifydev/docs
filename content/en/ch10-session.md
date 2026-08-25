---
title: "Chapter 10: Session management: storing, resuming, and branching conversations"
description: How Pi stores one session as a parent-linked JSONL tree, reconstructs active context, and exposes it through SessionManager.
translation_key: ch10-session
language: en
chapter: 10
source_url: "https://www.dgzhuya.com/modules/ch10-session"
official_refs:
  - "https://github.com/earendil-works/pi/blob/4e58f324fae8ebfa98a3d45181fb248072a2afac/packages/coding-agent/docs/sessions.md"
terms_used:
  - Session
  - Session Tree
  - SessionManager
  - SessionEntry
  - CompactionEntry
  - BranchSummaryEntry
status: reviewed
last_updated: "2026-08-25"
translator: Pify maintainers
reviewed_by: Pify maintainers
---

Chapter 9 ended with a `CompactionEntry` on a Session Tree. That compact description leaves two questions open: where does the tree live, and how does `buildSessionContext()` turn it back into the linear message list required by a model call?

Pi's Coding Agent answers both with one durable session file. Each non-header record points to its parent, an in-memory leaf marks the current position, and context reconstruction projects one root-to-leaf path. The same file can therefore retain several approaches while a model sees only the branch the user selected.

## 1. Start with two storage questions

`context.messages` is an array at the model boundary. It does not tell us where a conversation survives after the process exits or what historical shape the application keeps. A persistence design should answer those questions separately:

- **Storage medium:** where are records written?
- **Logical structure:** how are records related?

A database can store a tree, and a file can store a linear sequence. Choosing a medium does not settle the shape.

### Question A: where is a session stored?

Coding Agent writes local JSONL by default. Sessions live below `~/.pi/agent/sessions/`; the working directory is encoded into a directory such as `--work-project--`, and each session gets one `.jsonl` file. The files do not live in a project's `.pi/sessions/` directory. Project grouping happens under the user-level Agent directory.

This choice fits a local CLI. It needs no database service, the records remain inspectable with ordinary text tools, and moving between projects naturally selects a different encoded directory. It does not provide database-style transactions, cross-machine queries, or multi-writer coordination. Those are separate requirements, not properties of JSONL.

The built-in commands expose the storage policy without making callers assemble paths:

```bash
pi -c                  # Continue the most recent session
pi -r                  # Browse sessions
pi --no-session        # Keep the run in memory
pi --name "auth audit" # Name a new session
pi --session <path|id> # Open one session
pi --fork <path|id>    # Copy history into a new session
```

`/session` shows the current file, ID, message count, token totals, and cost. `/resume`, `/new`, `/name`, `/tree`, `/fork`, and `/clone` operate at a higher product layer.

Pi also has a generic asynchronous session harness in `@earendil-works/pi-agent-core`. Its `SessionStorage` interface has JSONL and in-memory implementations and can be implemented against another backend. Coding Agent's synchronous `SessionManager` is an independent implementation; it does not accept a `SessionStorage` adapter. Section 7 returns to this boundary.

### Question B: what shape does a session have?

A linear transcript works until a user retries from an earlier point, compares two approaches, or returns to an abandoned path. Rewriting a single array would either discard the old suffix or require copying it elsewhere.

Coding Agent keeps a parent-linked tree. Appending adds a record; rewinding moves the current leaf; the next append makes a new child of the selected entry. Older children remain in memory and in the JSONL file. A separate file is needed only when the user explicitly forks or clones a session.

| Dimension         | Common option                   | Coding Agent default             |
| ----------------- | ------------------------------- | -------------------------------- |
| Storage medium    | Relational or document database | One local JSONL file per session |
| Logical structure | Linear transcript               | Parent-linked append-only tree   |

These choices explain the rest of the chapter. JSONL supplies the physical sequence, while `id`, `parentId`, and `leafId` supply the logical tree.

## 2. Grow a session tree step by step

Consider an authentication bug. The developer switches models, asks why salt verification fails, lets the Agent inspect two functions, rejects the first diagnosis, and tries a different route.

The following is a scenario outline, not literal JSONL:

```text
1. Switch to anthropic/claude-sonnet-4-6.
2. Ask why salt verification fails in src/auth.ts.
3. The assistant calls read.
4. read returns the file contents.
5. The assistant blames the comparison at line 23.
6. Move the leaf back to the question.
7. Ask to inspect the hash implementation first.
8. The assistant calls grep and read, then gives a new diagnosis.
```

We use short aliases `e1`, `e2`, and so on in the diagrams. Persisted Coding Agent entry IDs are generated as collision-checked eight-character UUID prefixes, not these teaching aliases.

### Step 1: switch model and create the root entry

The first physical line is a `SessionHeader`, which is metadata rather than a tree node. Switching models appends the first `ModelChangeEntry`. Its real payload has both `provider` and `modelId`:

```text
e1: ModelChangeEntry
  parentId: null
  provider: "anthropic"
  modelId: "claude-sonnet-4-6"
```

The in-memory leaf advances to `e1`:

```text
e1 model_change  <- leafId
```

`parentId: null` identifies a root entry. The header has no entry `id` and cannot be a parent.

### Step 2: append the user message

The question becomes a `SessionMessageEntry` whose `message` is a Pi AI `UserMessage`. This sketch omits the entry's ISO timestamp and the message's Unix-millisecond timestamp; both appear in the persisted example in Section 6.

```text
e2: SessionMessageEntry
  parentId: e1
  message:
    role: "user"
    content: "Why does salt verification fail in src/auth.ts?"
```

The parent link extends the active path:

```text
e1 model_change
└─ e2 user  <- leafId
```

`e2` points to the preceding entry on this branch, not merely to the preceding physical line. The two happen to coincide while the tree is linear.

### Step 3: persist an assistant Tool call

The assistant decides to inspect `src/auth.ts`. Text and the `read` call share one `AssistantMessage.content` array:

```text
e3: SessionMessageEntry
  parentId: e2
  message:
    role: "assistant"
    content:
      - { type: "text", text: "I'll inspect the verifier." }
      - { type: "toolCall", id: "call_001", name: "read",
          arguments: { path: "src/auth.ts" } }
    stopReason: "toolUse"
```

The tree still has one branch:

```text
e1 model_change
└─ e2 user
   └─ e3 assistant + read call  <- leafId
```

The persisted assistant message also carries `api`, `provider`, `model`, full `usage`, and a numeric message timestamp. Those fields describe the completed provider response; the surrounding session entry has its own ISO timestamp.

### Step 4: link the Tool result to its call

Tool execution produces a separate `ToolResultMessage` inside another `SessionMessageEntry`:

```text
e4: SessionMessageEntry
  parentId: e3
  message:
    role: "toolResult"
    toolCallId: "call_001"
    toolName: "read"
    content: [{ type: "text", text: "export function verifySalt(...) { ... }" }]
    isError: false
```

The result extends the same parent chain:

```text
e1 model_change
└─ e2 user
   └─ e3 assistant + read call
      └─ e4 read result  <- leafId
```

`toolCallId` matches the `ToolCall.id` in `e3`; `toolName` identifies the executed Tool. The parent link orders session entries, while the Tool-call ID records the protocol relationship between the two messages.

### Step 5: append the first diagnosis

The assistant consumes the Tool result and replies:

```text
e5: SessionMessageEntry
  parentId: e4
  message:
    role: "assistant"
    content: [{ type: "text", text: "The comparison at line 23 uses the wrong encoding." }]
    stopReason: "stop"
```

The first attempt is now a five-entry path:

```text
e1 model_change
└─ e2 user: salt verification
   └─ e3 assistant: read
      └─ e4 toolResult: auth.ts
         └─ e5 assistant: line 23 diagnosis  <- leafId
```

Every append created one new entry and advanced `leafId`. No older entry acquired a child list or changed its contents.

### Step 6: rewind by moving the leaf

The developer wants another approach. Programmatic navigation can place the leaf on `e2`. This is source-aligned pseudocode; the public `branch()` method performs the existence check and assignment synchronously:

```text
if (!byId.has("e2")) throw new Error("Entry e2 not found");
leafId = "e2";
```

The old suffix remains present:

```text
e1 model_change
└─ e2 user: salt verification  <- leafId
   └─ e3 assistant: read
      └─ e4 toolResult: auth.ts
         └─ e5 assistant: line 23 diagnosis
```

Moving the pointer alone is an in-memory operation. `leafId` is not a field in Coding Agent's v3 header and `branch()` does not append a navigation record. A later append records the branch durably through its `parentId`. If the process exits immediately after `branch()`, reopening the file selects the last physical entry as the leaf.

### Step 7: append below the rewound position

The developer asks a narrower question. Because the current leaf is `e2`, the new user entry points to `e2`, just as `e3` does:

```text
e6: SessionMessageEntry
  parentId: e2
  message:
    role: "user"
    content: "Inspect the hash implementation before the verifier."
```

Two children with the same parent form two branches:

```text
e1 model_change
└─ e2 user: salt verification
   ├─ e3 assistant: first approach
   │  └─ e4 toolResult
   │     └─ e5 assistant: first diagnosis
   └─ e6 user: inspect hash first  <- leafId
```

This programmatic example deliberately appends a second user message after `e2`. Interactive `/tree` behaves differently when the selected entry itself is a user or custom message: it moves to that entry's parent, copies the selected text into the editor, and lets the edited submission become a sibling of the selected entry.

### Step 8: continue the new branch

The assistant requests both a search and a file read. Each returned `ToolResultMessage` becomes its own session entry before the final answer:

```text
e1 model_change
└─ e2 user: salt verification
   ├─ e3 assistant: first approach
   │  └─ e4 read result
   │     └─ e5 assistant: first diagnosis
   └─ e6 user: inspect hash first
      └─ e7 assistant: grep + read calls
         └─ e8 grep result
            └─ e9 read result
               └─ e10 assistant: new diagnosis  <- leafId
```

The file now contains ten tree entries in append order. The active path is `e1 -> e2 -> e6 -> e7 -> e8 -> e9 -> e10`. Entries `e3` through `e5` are still addressable through `getEntry()`, visible through `getTree()`, and available for later navigation, but they are absent from the next model context.

## 3. Read a session entry

The tree becomes concrete when we inspect one persisted record.

### A complete SessionMessageEntry

This is a valid JSON object for the assistant Tool call. It shows every required field used by the current Pi AI `AssistantMessage`; real token and cost values come from the provider.

```json
{
  "type": "message",
  "id": "c3d4e5f6",
  "parentId": "b2c3d4e5",
  "timestamp": "2026-08-24T10:23:30.000Z",
  "message": {
    "role": "assistant",
    "content": [
      { "type": "text", "text": "I'll inspect the verifier." },
      {
        "type": "toolCall",
        "id": "call_001",
        "name": "read",
        "arguments": { "path": "src/auth.ts" }
      }
    ],
    "api": "anthropic-messages",
    "provider": "anthropic",
    "model": "claude-sonnet-4-6",
    "usage": {
      "input": 1250,
      "output": 80,
      "cacheRead": 0,
      "cacheWrite": 0,
      "totalTokens": 1330,
      "cost": {
        "input": 0,
        "output": 0,
        "cacheRead": 0,
        "cacheWrite": 0,
        "total": 0
      }
    },
    "stopReason": "toolUse",
    "timestamp": 1787567010000
  }
}
```

| Field               | Runtime meaning                              | Why it is stored                                                          |
| ------------------- | -------------------------------------------- | ------------------------------------------------------------------------- |
| `type`              | Discriminates the entry union                | The tree contains messages, state changes, summaries, and metadata        |
| `id`                | Identifies this entry                        | Children and labels refer to an entry by ID                               |
| `parentId`          | Points to the preceding entry on this branch | One pointer is enough to reconstruct a root-to-leaf path                  |
| Entry `timestamp`   | ISO creation time                            | Session ordering, tree display, and debugging use it                      |
| `message`           | The complete `AgentMessage` payload          | Resuming preserves the provider response, usage, and Tool protocol fields |
| Message `timestamp` | Unix milliseconds                            | Pi AI messages retain their own time representation                       |

The schema does not validate every parsed line when `SessionManager` loads a v3 file. Treat these TypeScript definitions as the format contract, and do not infer that an arbitrary JSON object is safe because parsing succeeded.

### Nine Coding Agent entry types

`SessionEntry` is a union of nine types. Grouping them by their effect on context explains why they are separate.

Four entry types can project one or more messages into active context:

| Entry type                              | Projection                                                                                                                                                                 |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SessionMessageEntry` (`message`)       | Returns its stored `AgentMessage`; `appendMessage()` accepts user, assistant, Tool-result, custom, and Bash-execution messages, but summary messages use dedicated entries |
| `CustomMessageEntry` (`custom_message`) | Creates a `CustomMessage` with `customType`, `content`, `display`, `details`, and the entry timestamp                                                                      |
| `CompactionEntry` (`compaction`)        | Creates a `CompactionSummaryMessage`; `buildContextEntries()` also selects its retained boundary                                                                           |
| `BranchSummaryEntry` (`branch_summary`) | Creates a `BranchSummaryMessage` tied to `fromId`                                                                                                                          |

Two entry types change the state returned beside the messages:

| Entry type                                           | State effect                                       |
| ---------------------------------------------------- | -------------------------------------------------- |
| `ModelChangeEntry` (`model_change`)                  | Sets `{ provider, modelId }` for the selected path |
| `ThinkingLevelChangeEntry` (`thinking_level_change`) | Sets the current `thinkingLevel` string            |

Three entry types persist metadata without entering model context:

| Entry type                          | Purpose                                                              |
| ----------------------------------- | -------------------------------------------------------------------- |
| `CustomEntry` (`custom`)            | Stores extension-owned `data` under a `customType`                   |
| `LabelEntry` (`label`)              | Applies or clears a label on `targetId`; latest appended change wins |
| `SessionInfoEntry` (`session_info`) | Sets or clears the display `name`; latest appended entry wins        |

The top-level `SessionHeader` is a tenth file-record shape, but it is not a `SessionEntry` and has no parent. Pi Agent Core's newer generic harness defines a different seven-entry union plus lanes and operation records. Mixing those schemas produces incorrect parsers.

### Why entries store only their parent

A parent pointer lets append leave all older entries untouched. If `e2` stored `children: [e3]`, adding `e6` would require rewriting it as `children: [e3, e6]`. With `parentId`, the new entry alone records the relationship.

Coding Agent keeps `byId: Map<string, SessionEntry>` for direct parent lookup and leaf-to-root traversal. `getChildren(parentId)` derives children by scanning the map values; there is no second persisted child index. `getTree()` performs a similar pass, treats missing-parent entries as roots, attaches resolved labels, and sorts each child array by ISO timestamp.

This representation makes in-memory append and `branch()` constant-time on average. Building a full child view costs a scan, and storage I/O has its own cost. The parent-pointer design avoids an old-entry rewrite; it does not make every tree query constant-time.

## 4. Append, rewind, branch, and summarize

The walkthrough can now be reduced to four operations without losing their product behavior.

### Operation 1: append a child

The following source-aligned pseudocode describes `_appendEntry()` and its callers. It is pseudocode because entry creation is split among the typed `appendXXX()` methods in the implementation.

```text
id = generateCollisionCheckedId(byId)
entry = { type, id, parentId: leafId, timestamp: nowIso(), ...payload }
fileEntries.push(entry)
byId.set(id, entry)
leafId = id
persistAccordingToLazyWritePolicy(entry)
return id
```

For a normal message, callers use the public API rather than constructing the entry:

```text
entryId = session.appendMessage(agentMessage)
```

The in-memory mutations are append, `Map.set`, and pointer assignment. Persistence is synchronous in this `SessionManager`, so the wall-clock operation also includes file creation, the first full-file write, or `appendFileSync`, depending on state.

### Operation 2: rewind the current pointer

`branch(entryId)` checks that the entry exists and assigns `leafId`. `resetLeaf()` sets it to `null`, allowing the next append to create another root.

```text
branch("e2")
// leafId is now "e2"; e3, e4, and e5 remain unchanged.
```

This call does not compute or persist a branch object. The path is derived later by following parents. The next append supplies the durable evidence of the new route.

### Operation 3: append after the rewind

Once the leaf has moved, ordinary append creates the branch. No separate branch type exists:

```text
branch("e2")
e6 = appendMessage(revisedQuestion) // e6.parentId === "e2"
```

Interactive operations choose between retaining branches in the same file and copying a path to another file:

| Operation | File result                 | Selection behavior                                                                                                    |
| --------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `/tree`   | Same session file           | Moves within the full tree; a selected user/custom message is copied to the editor and navigation lands on its parent |
| `/fork`   | New session file            | Selects an earlier user message and extracts the path before it, then preloads the selected text for editing          |
| `/clone`  | New session file            | Copies the current active branch                                                                                      |
| `/resume` | Opens another existing file | Uses the session picker for the project                                                                               |
| `/new`    | Allocates a new session     | Starts with a fresh header and null leaf                                                                              |

`createBranchedSession(leafId)` extracts a root-to-leaf path. It removes `LabelEntry` nodes from that copied path, re-chains the retained entries, then appends label records for labels whose targets survived. The new header records the previous file in `parentSession`. The manager itself switches to the new session; the method is not a pure exporter.

### Attach an optional branch summary

When `/tree` leaves one path for another, `AgentSession.navigateTree()` can summarize the abandoned suffix. It finds the deepest common ancestor between the old and target paths, collects entries from that ancestor's child through the old leaf, and generates the summary before it moves the leaf.

The following is lifecycle pseudocode, not the signature of one async method:

```text
fromExtension = false
result = await generateBranchSummary(entriesToSummarize, {
  model: requestModel, apiKey, headers, env, signal,
  customInstructions, replaceInstructions, reserveTokens,
  streamFn, retry, callbacks
})
summaryText = result.summary
summaryDetails = { readFiles: result.readFiles || [],
                   modifiedFiles: result.modifiedFiles || [] }
summaryUsage = result.usage
summaryId = session.branchWithSummary(newLeafId, summaryText, summaryDetails,
                                      fromExtension, summaryUsage)
```

`branchWithSummary()` itself is synchronous. It captures the old leaf in `fromId`, moves to the requested target, appends a `BranchSummaryEntry` as a child of that target, and makes the summary entry the new leaf:

```text
e2 user: salt verification
├─ e3 ... e5 abandoned attempt
└─ bs1 branch_summary(fromId: "e5")  <- leafId
   └─ next appended entry
```

The default summarizer works within a token budget, keeps recent eligible messages, carries file-operation details, and converts existing compaction or branch summaries into summary context. It omits raw `toolResult` messages from the branch-summary prompt because the assistant Tool calls already identify the actions. An extension can cancel navigation, replace the summary, adjust instructions, or provide details.

Without a summary, navigation calls `branch()` or `resetLeaf()`. With a summary, the abandoned entries remain in the file and the compact account enters the target branch as a distinct `BranchSummaryMessage`. No branch is merged or deleted.

## 5. Reconstruct active context

Storage is tree-shaped, while `Agent` and provider adapters consume a linear `AgentMessage[]`. Coding Agent makes the projection explicit instead of treating the JSONL order as model context.

### Why projection is a separate step

Physical order answers “when was this record appended?” Parent order answers “which history belongs to this position?” After branching, those orders differ. Sending all physical lines would mix competing attempts, label records, and state from paths the user left.

`getBranch()` exposes the full selected root-to-leaf path. `buildContextEntries()` applies the latest compaction on that path. `buildSessionContext()` then converts selected entries to messages and resolves model and thinking state from the full path.

### Step 1: walk from leaf to root

This source-aligned pseudocode mirrors the internal `buildSessionPath()` helper:

```text
if (leafId === null) return []
leaf = leafId ? byId.get(leafId) : entries.at(-1)
path = []
while (leaf exists):
  path.push(leaf)
  leaf = leaf.parentId ? byId.get(leaf.parentId) : undefined
return path.reverse()
```

For the completed second attempt, the selected path is:

```text
[e1, e2, e6, e7, e8, e9, e10]
```

The `e3 -> e5` suffix is absent. A broken parent ends traversal early because lookup returns `undefined`; `SessionManager` does not synthesize the missing history.

### Step 2: project selected entry types

After compaction selection, `sessionEntryToContextMessages()` applies this dispatch:

```text
message          -> stored AgentMessage
custom_message   -> CustomMessage
branch_summary   -> BranchSummaryMessage
compaction       -> CompactionSummaryMessage
model_change     -> no message
thinking change  -> no message
custom           -> no message
label            -> no message
session_info     -> no message
```

The active message sequence for the example has this shape:

```text
[
  UserMessage(e2),
  UserMessage(e6),
  AssistantMessage(e7: grep + read calls),
  ToolResultMessage(e8: grep),
  ToolResultMessage(e9: read),
  AssistantMessage(e10: new diagnosis)
]
```

The two user messages are consecutive because this example called `branch("e2")` and then appended below it. Provider-facing normalization happens later at `convertToLlm`; session projection preserves the Agent-message history rather than guessing a provider's wire rules.

### Resolve model and thinking state

State extraction walks the complete selected path from root to leaf. `thinkingLevel` starts as `"off"`. Every `thinking_level_change` overwrites it. `model` starts as `null`; every `model_change` overwrites it, and an assistant message also updates it from the provider and model that produced that response.

```text
e1 model_change anthropic/claude-sonnet-4-6 -> model = that pair
e7 assistant from the same pair             -> model = that pair
no thinking_level_change on the path        -> thinkingLevel = "off"
```

The last applicable entry on the selected path wins. Moving the leaf before a state-change entry removes that change from the path. Recording state transitions as entries therefore makes rewind reproduce historical state without mutating a global session setting.

### Apply the latest CompactionEntry

`buildContextEntries()` finds the last `CompactionEntry` on the active path. Current Coding Agent v3 stores `firstKeptEntryId`; it does not store the generic harness's `retainedTail` field.

```text
e1 user: old request
e2 assistant: old work
e3 user: recent request          <- firstKeptEntryId
e4 assistant: recent work
e5 compaction(summary, firstKeptEntryId: "e3")
e6 user: work after compaction
```

The projection places the compaction entry first, then entries from `firstKeptEntryId` up to the compaction, then entries after it:

```text
[
  CompactionSummaryMessage(from e5),
  UserMessage(e3),
  AssistantMessage(e4),
  UserMessage(e6)
]
```

Raw entries `e1` and `e2` remain in JSONL. Navigating to a leaf before `e5` selects a path without that compaction, so those messages can reappear. If `firstKeptEntryId` cannot be found on the selected path, the current implementation returns the summary and post-compaction entries without inventing a retained prefix.

## 6. Persist the tree as JSONL

The file representation is deliberately plain, but its two timestamp domains and lazy creation policy deserve careful handling.

### Store one record per line

The first line is a v3 header. Every later line is one `SessionEntry`. This sample is valid JSONL; each physical line parses independently:

```jsonl
{"type":"session","version":3,"id":"01992742-9d1a-7aa0-b123-112233445566","timestamp":"2026-08-24T10:00:00.000Z","cwd":"/work/auth"}
{"type":"model_change","id":"a1b2c3d4","parentId":null,"timestamp":"2026-08-24T10:00:05.000Z","provider":"anthropic","modelId":"claude-sonnet-4-6"}
{"type":"message","id":"b2c3d4e5","parentId":"a1b2c3d4","timestamp":"2026-08-24T10:23:00.000Z","message":{"role":"user","content":"Why does salt verification fail in src/auth.ts?","timestamp":1787566980000}}
{"type":"message","id":"c3d4e5f6","parentId":"b2c3d4e5","timestamp":"2026-08-24T10:23:30.000Z","message":{"role":"assistant","content":[{"type":"text","text":"I'll inspect the verifier."},{"type":"toolCall","id":"call_001","name":"read","arguments":{"path":"src/auth.ts"}}],"api":"anthropic-messages","provider":"anthropic","model":"claude-sonnet-4-6","usage":{"input":1250,"output":80,"cacheRead":0,"cacheWrite":0,"totalTokens":1330,"cost":{"input":0,"output":0,"cacheRead":0,"cacheWrite":0,"total":0}},"stopReason":"toolUse","timestamp":1787567010000}}
{"type":"message","id":"d4e5f6a7","parentId":"c3d4e5f6","timestamp":"2026-08-24T10:23:31.000Z","message":{"role":"toolResult","toolCallId":"call_001","toolName":"read","content":[{"type":"text","text":"export function verifySalt(...) { ... }"}],"isError":false,"timestamp":1787567011000}}
{"type":"message","id":"e5f6a7b8","parentId":"d4e5f6a7","timestamp":"2026-08-24T10:24:00.000Z","message":{"role":"assistant","content":[{"type":"text","text":"The comparison uses the wrong encoding."}],"api":"anthropic-messages","provider":"anthropic","model":"claude-sonnet-4-6","usage":{"input":1400,"output":40,"cacheRead":0,"cacheWrite":0,"totalTokens":1440,"cost":{"input":0,"output":0,"cacheRead":0,"cacheWrite":0,"total":0}},"stopReason":"stop","timestamp":1787567040000}}
{"type":"message","id":"f6a7b8c9","parentId":"b2c3d4e5","timestamp":"2026-08-24T10:30:00.000Z","message":{"role":"user","content":"Inspect the hash implementation first.","timestamp":1787567400000}}
```

By default the directory is `~/.pi/agent/sessions/--<encoded-cwd>--/`. `newSession()` names a file `<ISO-with-colons-and-dots-replaced>_<sessionId>.jsonl`. The default session ID is UUIDv7. A caller may supply an ID containing alphanumerics, `.`, `_`, and `-`, with an alphanumeric first and last character.

Entry IDs come from the first eight characters of a random UUID, with up to 100 collision checks against `byId` and a full-UUID fallback. Entry timestamps are ISO strings. Nested Pi AI message timestamps are numbers in Unix milliseconds. `parentSession` appears in a header created from another session by fork, clone, or `newSession({ parentSession })`.

JSONL makes the common write a line append instead of serializing one growing JSON array. It also exposes the branch: two records with the same `parentId` are siblings even when many physical lines separate them.

### Delay disk creation until an assistant arrives

A fresh persisted manager allocates a path and buffers entries in `fileEntries`, but normally does not create the file until the first assistant message has been appended. The policy in `_persist()` is:

| Assistant exists anywhere in `fileEntries` | `flushed` | Write behavior                                                                               |
| ------------------------------------------ | --------- | -------------------------------------------------------------------------------------------- |
| No                                         | `false`   | Keep entries in memory; no file is created                                                   |
| No                                         | `true`    | Append the current entry, an edge used after opening an already flushed file                 |
| Yes                                        | `false`   | Open the new path with `"wx"`, write the header and every buffered entry, then set `flushed` |
| Yes                                        | `true`    | Append only the current entry with `appendFileSync`                                          |

The delay prevents a fresh failed request from leaving a new session file that contains only the user's question. It does not guarantee that every persisted turn is complete forever. Later user messages append immediately after the first flush, and a crash or provider failure may leave one without a following assistant response.

`isPersisted()` reports whether the manager is configured for persistence. It does not check whether lazy creation has produced the file. A persisted manager can therefore return a prospective `getSessionFile()` path that does not exist yet.

### Treat rewrites, partial tails, and backups explicitly

Normal writes append, but Coding Agent's `SessionManager` also rewrites:

- Loading a v1 or v2 session migrates it to v3 and calls `_rewriteFile()` on the same path.
- Opening an explicitly supplied empty file initializes and rewrites it.
- `createBranchedSession()` constructs a new file from one path and resolved labels.
- `forkFrom()` creates a new header with `"wx"` and appends every non-header source entry.

`_rewriteFile()` opens its target with `"w"`, truncates it, and writes lines in a loop. It does not stage a sibling file, rename atomically, or create a backup. Copy a valuable session before migration or a bulk transform. “Append-only tree” describes the logical entry model; it is not a promise that the physical file is never rewritten.

The v3 loader reads UTF-8 in chunks, parses each complete line, and silently skips malformed lines. It also tries to parse a final unterminated fragment and skips it if parsing fails. It validates that the first parsed entry is a session header with a string ID, but it does not report every bad line or repair a torn tail. A parser built for audit or migration should be stricter than this runtime recovery behavior.

Coding Agent's manager uses synchronous file calls and has no file lock, `fsync`, compare-and-swap, or cross-process writer queue. Keep one writer per session file. `list()` and `listAll()` are read-side operations; metadata loading is capped at ten concurrent files, unreadable files are omitted, and results are sorted by derived activity time.

The generic Pi Agent Core `JsonlSessionStorage` has different safety code: it serializes writes through a per-instance promise tail and uses a temporary sibling plus rename for forks and torn-tail repair. Those v4 guarantees do not apply to Coding Agent's v3 `SessionManager`.

## 7. Separate the two persistence layers and use SessionManager

Pi 0.84.3 contains two session systems with related ideas and incompatible contracts:

| Property              | Pi Agent Core harness                                                          | Coding Agent `SessionManager`                                               |
| --------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| Public abstraction    | Async `SessionStorage` and `Session`                                           | Concrete synchronous class                                                  |
| Current entries       | 7 types, including `active_tools_change`; separate lanes and operation records | 9 `SessionEntry` types, including custom messages, labels, and session info |
| JSONL schema          | v4 header, mutations, numeric timestamps and sequence numbers                  | v3 `type: "session"` header, ISO entry timestamps                           |
| File implementation   | `JsonlSessionStorage`, queued per instance                                     | Direct `fs` calls inside `SessionManager`                                   |
| Memory implementation | `InMemorySessionStorage`                                                       | `SessionManager.inMemory()`                                                 |
| Custom backend        | Implement `SessionStorage`                                                     | No storage-adapter injection point                                          |

The generic interface owns metadata, lanes, entry and record appends, queries, facts, labels, and statistics. A web or server product can implement those asynchronous methods over a database. That implementation works with the generic harness. It cannot be passed into Coding Agent's `SessionManager`, whose signatures, entry union, header, and write timing differ.

`SessionManager` is still useful outside the CLI because the package exports the class and its entry/context types. The main static methods are:

| Static method                                                 | Behavior                                                                                     |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `create(cwd, sessionDir?, options?)`                          | Allocate a new persisted session and prospective file path                                   |
| `open(path, sessionDir?, cwdOverride?)`                       | Load one file, migrate old versions, build indices, and use the header cwd unless overridden |
| `continueRecent(cwd, sessionDir?)`                            | Open the most recent matching session or create a new one                                    |
| `inMemory(cwd?, options?)`                                    | Use the same tree behavior without a file                                                    |
| `forkFrom(sourcePath, targetCwd, sessionDir?, options?)`      | Copy the source file's non-header entries under a new v3 header and `parentSession`          |
| `list(cwd, sessionDir?, onProgress?)`                         | Return project sessions asynchronously, newest derived activity first                        |
| `listAll(onProgress?)` or `listAll(sessionDir?, onProgress?)` | Search all encoded project directories or one supplied directory                             |

Its instance surface falls into four groups:

| Group                     | Current methods                                                                                                                                                                                  |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Lifecycle and identity    | `newSession()`, `setSessionFile()`, `createBranchedSession()`, `isPersisted()`, `usesDefaultSessionDir()`, `getCwd()`, `getSessionDir()`, `getSessionId()`, `getSessionFile()`                   |
| Append                    | `appendMessage()`, `appendThinkingLevelChange()`, `appendModelChange()`, `appendCompaction()`, `appendCustomEntry()`, `appendCustomMessageEntry()`, `appendLabelChange()`, `appendSessionInfo()` |
| Tree and labels           | `getLeafId()`, `getLeafEntry()`, `getEntry()`, `getChildren()`, `getBranch()`, `getTree()`, `getLabel()`, `branch()`, `resetLeaf()`, `branchWithSummary()`                                       |
| Projection and inspection | `buildContextEntries()`, `buildSessionContext()`, `getEntries()`, `getHeader()`, `getSessionName()`                                                                                              |

All append methods return the new entry ID. `appendCompaction()` and `branchWithSummary()` accept optional `details`, `fromHook`, and `usage`; summary generation belongs to `AgentSession`, not to the manager. `getEntries()` returns a new array containing the stored entry objects, so callers should treat those objects as read-only.

This copyable example uses only exported public methods:

```typescript
import { SessionManager } from "@earendil-works/pi-coding-agent";

const session = SessionManager.create(process.cwd());
const firstQuestionId = session.appendMessage({
  role: "user",
  content: "Review the authentication flow.",
  timestamp: Date.now(),
});

session.appendThinkingLevelChange("high");
session.branch(firstQuestionId);
session.appendMessage({
  role: "user",
  content: "Start with the password hash implementation.",
  timestamp: Date.now(),
});

const { messages, model, thinkingLevel } = session.buildSessionContext();
const sessions = await SessionManager.list(process.cwd());

console.log({
  messages: messages.length,
  model,
  thinkingLevel,
  sessions: sessions.length,
});
```

Several exported functions expose the machinery without a manager instance: `buildContextEntries()`, `buildSessionContext()`, `sessionEntryToContextMessages()`, `parseSessionEntries()`, `migrateSessionEntries()`, and `getLatestCompactionEntry()`. Internal class helpers such as `_buildIndex()`, `_appendEntry()`, `_persist()`, and `_rewriteFile()` implement storage policy and should not be treated as stable application APIs.

Creation and opening carry details that affect callers. `create()` can return a manager whose `getSessionFile()` is only a prospective path, while `newSession()` can return that path directly, because writes are lazy. `open()` derives `sessionDir` from the file's parent unless one is supplied. `continueRecent()` filters by header `cwd` when a custom shared directory is used. `list()` and `listAll()` return `SessionInfo` metadata, not open managers; call `open(info.path)` to resume one.

## 8. Carry the design into another system

The session tree solves a specific local CLI problem, but its design questions travel well.

### Keep medium and structure independent

| Decision   | Question                               | Coding Agent answer                                      |
| ---------- | -------------------------------------- | -------------------------------------------------------- |
| Medium     | Where and how is durable data written? | One local JSONL file per session, grouped by encoded cwd |
| Structure  | How are histories related?             | Immutable historical entries linked to one parent        |
| Selection  | Which history is active?               | An in-memory leaf and its root path                      |
| Projection | What reaches the model?                | Compaction-aware entries converted to `AgentMessage[]`   |

A service may keep the same parent-linked shape in SQL. A small test may keep it entirely in memory. The tree does not depend on JSONL, and JSONL does not require a tree.

### Use append-only history for rewind and comparison

Parent links preserve old attempts without copying them inside the same session. The cost is retained storage and linear scans for some views. The benefit is inspectable history and cheap pointer movement.

Define durability separately. Coding Agent persists the branch only when a new entry points at the selected parent. A system that must persist navigation itself needs an explicit lane or leaf record, like the generic harness's lane mutations, or another transactional pointer store.

### Store state changes where they take effect

Model and thinking changes belong on the history path because their meaning depends on position. A rewind should restore the settings that applied there. Coding Agent also uses assistant-message provider/model fields as model state during reconstruction, which makes a resumed path recover the model that produced its latest assistant response.

Apply the same test to other state: if moving to an older node should restore a value, record the change as a path event. Keep session-wide facts, such as the latest display name, outside branch-scoped reconstruction when their semantics are global.

The handoff for an implementation review is concrete: specify header and entry schemas, define the current-pointer durability rule, separate branch selection from branch extraction, document projection, decide how summaries enter context, and state rewrite, backup, and concurrency guarantees. A tree diagram alone leaves all six contracts unresolved.

## 9. Continue from the session boundary

Chapters 3 through 10 now connect the full runtime path: the loop emits messages, Tools add call/result pairs, context engineering bounds inputs, compaction appends a summary checkpoint, and session projection selects the branch used by the next model call.

Pi's extension system sits on both sides of this boundary. Extensions can append `custom` state, inject `custom_message` context, provide compaction or branch summaries, label entries, and observe navigation. The source files to read next are:

- Coding Agent [`schema`](https://github.com/earendil-works/pi/blob/4e58f324fae8ebfa98a3d45181fb248072a2afac/packages/coding-agent/src/core/session-manager.ts#L30-L153), [`projection`](https://github.com/earendil-works/pi/blob/4e58f324fae8ebfa98a3d45181fb248072a2afac/packages/coding-agent/src/core/session-manager.ts#L334-L469), and [`SessionManager`](https://github.com/earendil-works/pi/blob/4e58f324fae8ebfa98a3d45181fb248072a2afac/packages/coding-agent/src/core/session-manager.ts) implementation;
- branch-summary [`collection`](https://github.com/earendil-works/pi/blob/4e58f324fae8ebfa98a3d45181fb248072a2afac/packages/coding-agent/src/core/compaction/branch-summarization.ts#L96-L145) and [`generation`](https://github.com/earendil-works/pi/blob/4e58f324fae8ebfa98a3d45181fb248072a2afac/packages/coding-agent/src/core/compaction/branch-summarization.ts);
- generic-harness [`entry and storage contracts`](https://github.com/earendil-works/pi/blob/4e58f324fae8ebfa98a3d45181fb248072a2afac/packages/agent/src/harness/session/types.ts#L14-L326) and [`JSONL safety implementation`](https://github.com/earendil-works/pi/blob/4e58f324fae8ebfa98a3d45181fb248072a2afac/packages/agent/src/harness/session/jsonl/storage.ts#L23-L124);
- [Current CLI behavior](https://github.com/earendil-works/pi/blob/4e58f324fae8ebfa98a3d45181fb248072a2afac/packages/coding-agent/docs/sessions.md).

This chapter targets Pi `0.84.3` at commit `4e58f324fae8ebfa98a3d45181fb248072a2afac`.
