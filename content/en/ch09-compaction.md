---
title: 'Chapter 9: Context compaction when the conversation gets too long'
description: How Pi selects a safe history boundary, writes a structured checkpoint, and reconstructs the next model context.
translation_key: ch09-compaction
language: en
chapter: 9
source_url: 'https://www.dgzhuya.com/modules/ch09-compaction'
official_refs:
  - 'https://github.com/earendil-works/pi/blob/4e58f324fae8ebfa98a3d45181fb248072a2afac/packages/coding-agent/docs/compaction.md'
terms_used:
  - Context Compaction
  - CompactionEntry
  - BranchSummaryEntry
  - Session
status: reviewed
last_updated: '2026-08-25'
translator: Pify maintainers
reviewed_by: Pify maintainers
---
Chapter 8 mapped the defenses around a model request. `transformContext` can filter the `AgentMessage[]` projected for one call, but it does not rewrite session history. Compaction works at a different boundary: Coding Agent summarizes an older region of the active session path, appends a durable `CompactionEntry`, and rebuilds the Agent's messages from that checkpoint.

The result is intentionally lossy. Recent work remains verbatim; older work survives as a structured handoff containing goals, constraints, progress, decisions, next steps, critical context, and selected file-operation metadata.

## 1. The problem: history grows, the model window does not

Each request includes the system prompt, active Tool definitions, and the current message projection. Tool results can make the message portion grow quickly. An illustrative session with 50 turns at an average 3,000 tokens per turn contributes `50 × 3,000 = 150,000` tokens before adding the system prompt or Tool schemas.

Deleting the oldest turns would free space, but it would also erase the original goal, earlier decisions, failed approaches, and changed paths. Pi instead replaces the old request projection with a summary while leaving the underlying session entries in the JSONL tree.

The following arithmetic is an illustration, not a guaranteed compression ratio. If an active context falls from 185,000 tokens to a 10,000-token summary plus 20,000 recent tokens, the new projection is `10,000 + 20,000 = 30,000` tokens. That removes 155,000 tokens from the next request and leaves 170,000 tokens of headroom in a 200,000-token window.

```text
Before: 185,000 active tokens
┌──────────── older projection: 165,000 ────────────┬── recent: 20,000 ──┐
│ raw user, assistant, and Tool messages            │ kept verbatim      │
└───────────────────────────────────────────────────┴─────────────────────┘

After: illustrative 30,000 active tokens
┌── structured summary: 10,000 ──┬── recent: 20,000 ──┐
│ goals, state, decisions, paths  │ kept verbatim      │
└─────────────────────────────────┴─────────────────────┘
```

The summary size varies with the conversation, model, and response. Pi caps the main summary response at the smaller of `floor(0.8 × reserveTokens)` and `model.maxTokens`; it does not promise a fixed 10,000-token summary.

### The run boundary: automatic checks and manual interruption

The baseline mental model was “between two turns.” Current Pi is more precise. After `agent.prompt()` finishes and `agent_end` has been delivered, `_handlePostAgentRun()` checks the last assistant message. Pi also checks the last assistant message before accepting a later prompt, which catches an aborted response that the normal post-run check skipped.

Manual compaction is separate. `AgentSession.compact(customInstructions?)` first calls `abort()` on the current Agent operation, then starts manual compaction. It never resumes that interrupted turn automatically.

```text
automatic path
Agent run → message_end persists messages → agent_end → _checkCompaction()
                                             ├─ no action → settle
                                             └─ compact → rebuild Agent messages

pre-prompt path
next prompt → inspect last assistant, including aborted → maybe compact → send user message

manual path
/compact [instructions] or AgentSession.compact()
  → abort current Agent operation → compact → remain idle
```

These paths all use the same preparation, hook, summary, append, and reconstruction machinery after dispatch.

## 2. When Pi compacts

### Threshold, defaults, and setting precedence

The threshold path uses this exact strict comparison:

```typescript
import {
  DEFAULT_COMPACTION_SETTINGS,
  shouldCompact,
} from "@earendil-works/pi-coding-agent";

const contextWindow = 200_000;
const contextTokens = 183_617;

shouldCompact(contextTokens, contextWindow, DEFAULT_COMPACTION_SETTINGS); // true
// 183_617 > 200_000 - 16_384 = 183_616
```

The current defaults are `reserveTokens: 16384` and `keepRecentTokens: 20000`. `reserveTokens` leaves space for the response; `keepRecentTokens` guides the backward cut-point search. Equality does not trigger: with a 200,000-token window, 183,616 is still below the strict `>` boundary.

Coding Agent loads global settings from `~/.pi/agent/settings.json`. A trusted project's `.pi/settings.json` is deep-merged on top, so a project can replace one nested compaction field without copying the others. An untrusted project's settings file is ignored. SDK code may then call `SettingsManager.applyOverrides()`, whose nested values take precedence over the merged file settings. Missing fields fall back independently to the defaults.

```json
{
  "compaction": {
    "enabled": true,
    "reserveTokens": 16384,
    "keepRecentTokens": 20000
  }
}
```

`enabled: false` disables the automatic threshold and overflow paths because `_checkCompaction()` returns immediately. It does not disable `AgentSession.compact()`, `/compact`, RPC `compact`, or an Extension call to `ctx.compact()`.

### Current usage comes from provider data first

The older implementation description treated `chars / 4` as the current context size. Pi `0.84.3` prefers the last valid assistant `usage`. `calculateContextTokens()` takes `usage.totalTokens` when it is nonzero; otherwise it adds `input + output + cacheRead + cacheWrite`.

For a normal assistant response with nonzero usage, `_checkCompaction()` tests that value directly. For an error response or all-zero usage, `estimateContextTokens()` finds the last non-error, non-aborted assistant usage in the active messages and adds estimates for messages after it. If no valid usage exists, it estimates every message.

```text
valid latest assistant usage
  contextTokens = totalTokens
               or input + output + cacheRead + cacheWrite

valid earlier usage + trailing messages
  contextTokens = usage-backed tokens + estimateTokens(trailing messages)

no valid usage
  contextTokens = Σ estimateTokens(all active messages)
```

`estimateTokens()` applies `ceil(chars / 4)` to textual content. It counts assistant text, thinking, Tool-call names and JSON arguments; Bash command plus output; summaries; and user, custom, or Tool-result content. Each image contributes 4,800 estimated characters. This heuristic can overestimate or underestimate depending on language and content, so it is a fallback and a cut-point measure, not an exact tokenizer.

After a compaction, pre-compaction assistant usage is stale. Automatic checking rejects a usage source at or before the latest compaction timestamp. The public `getContextUsage()` similarly returns `{ tokens: null, percent: null }` until a valid assistant response after that checkpoint supplies fresh usage.

### Three automatic cases and one manual route

The automatic dispatcher distinguishes more than “preventive” and “emergency” compaction:

| Route | Detection | What Pi does after compaction |
| --- | --- | --- |
| Threshold | Valid or estimated usage satisfies the strict threshold | Keeps the completed response; no retry |
| Overflow, completed response | Same-model response reports overflow but has `stopReason: "stop"` | Keeps the response; no retry |
| Overflow or recoverable length | Same-model overflow error, or a recoverable `length` stop below the model's desired output limit | Removes the failed/truncated assistant from Agent state, compacts, and retries once |
| Manual | `/compact [instructions]`, RPC/SDK `compact()`, or Extension `ctx.compact()` | Aborts any current run first; never resumes it automatically |

Overflow recovery is limited to one compact-and-retry attempt. The failed or truncated assistant was already persisted on `message_end`; Pi removes it from the in-memory retry context, not from the session tree. After rebuilding, it removes that terminal assistant again if projection brought it back as the last message, because `agent.continue()` requires a continuable state.

The same-model guard applies to overflow and recoverable-length detection. Threshold accounting remains the separate provider-usage or estimate path described above. This prevents a stale overflow from a smaller previous model from forcing recovery after a model switch.

## 3. Where Pi cuts the active path

### Valid cut points preserve the Tool protocol

A Tool result belongs after the assistant Tool call that requested it. Starting the retained region at a Tool result could expose a result with no visible call. `findValidCutPoints()` therefore accepts context-visible user, assistant, Bash-execution, custom, branch-summary, and compaction-summary message roles, but never `toolResult`. Session entries of type `compaction` are skipped as candidates.

```text
entry:   0       1       2        3       4       5        6
       header   user  assistant  tool    user  assistant  tool
candidate:       ✓       ✓        ✗       ✓       ✓        ✗

If entry 5 is kept, its Tool result at entry 6 remains after it.
```

Entries that do not project into context, such as labels or model changes, do not create message cut points. After choosing a cut, Pi scans backward across adjacent context-invisible metadata so those entries stay on the retained side. The scan stops at a visible entry or an older compaction boundary.

### `firstKeptEntryId` names the beginning of the retained region

The boundary identifies the first retained session entry, rather than the final entry summarized. A user cut keeps that user message and everything after it. An assistant cut keeps that assistant message and its following Tool results, then records split-turn metadata for the earlier part of the same turn.

```text
cut at user entry 4

0       1       2       3      [4]      5       6
header  user    assistant tool   user    assistant tool
        └──── summarized ────┘   └──── retained verbatim ────┘
                                  firstKeptEntryId = id(entry 4)
```

`firstKeptEntryId` identifies an entry in the session tree rather than an array position. This lets reconstruction resolve the boundary after reload and across parent-linked paths. If a legacy session cannot supply an id for the selected entry, preparation returns `undefined` instead of writing an unusable checkpoint.

### Backward budget walk and repeated-compaction boundary

The cut search walks from `boundaryEnd - 1` toward `boundaryStart`, adding estimated tokens from every message projected by each entry. Once the total reaches `keepRecentTokens`, it chooses the closest valid cut point at or after that position. If no message reaches the budget, the initial candidate is the earliest valid cut point; preparation later returns `undefined` if this leaves nothing to summarize.

The source algorithm can be read as the following attributed pseudocode. Metadata backtracking and split-turn discovery happen after the shown selection.

```text
PSEUDOCODE based on findCutPoint(), compaction.ts lines 403–460

cutPoints = valid context-visible entries, excluding Tool results
cutIndex = earliest cut point
accumulated = 0

for entry from newest to boundaryStart:
  accumulated += estimated tokens of entry's projected messages
  if accumulated >= keepRecentTokens:
    cutIndex = first cut point whose index is at or after this entry
    break

include adjacent context-invisible metadata before cutIndex
derive turnStartIndex and isSplitTurn
return firstKeptEntryIndex, turnStartIndex, isSplitTurn
```

For the first compaction, `boundaryStart` is the beginning of the active branch path. On a later compaction, Pi finds the previous `CompactionEntry` and starts at its `firstKeptEntryId`. If that id is absent from the active path, it falls back to the entry after the previous compaction. Messages that survived the earlier cut can therefore enter the next summary rather than becoming detached from the evolving checkpoint.

```text
previous checkpoint
  summary A + entries from firstKept(A) onward

next preparation
  previousSummary = summary A
  boundaryStart   = firstKept(A), or entry after compaction A as fallback
  new cut         = firstKept(B)

messages [boundaryStart, new cut) → new summary input
messages [new cut, current leaf]   → retained region
```

## 4. What replaces the older messages

### A fixed six-section checkpoint

Pi asks the summarizing model for a continuation checkpoint. The exact labels below remain inside a fenced template so they do not become page-navigation headings:

```markdown
## Goal
[What is the user trying to accomplish?]

## Constraints & Preferences
- [Requirements or preferences, or "(none)"]

## Progress
### Done
- [x] [Completed work]

### In Progress
- [ ] [Current work]

### Blocked
- [Current blockers]

## Key Decisions
- **[Decision]**: [Brief rationale]

## Next Steps
1. [Ordered continuation steps]

## Critical Context
- [Exact data, examples, or references needed to continue]
```

The prompt explicitly asks for exact file paths, function names, and error messages. Fixed slots reduce the chance that an interesting detail crowds out the original goal or the next required action. The model can still omit or distort information, which is why the retained tail and inspectable session history remain part of the design.

### Serialization and the summary request

`generateSummaryWithUsage()` first runs Coding Agent's `convertToLlm()` over the selected `AgentMessage[]`. It then serializes the compatible messages as labeled text so the summarizer treats them as evidence rather than a conversation to continue.

```text
[User]: Fix the authentication failure in src/auth.ts

[Assistant thinking]: Inspect the call path before editing.

[Assistant tool calls]: read(path="src/auth.ts")

[Tool result]: export function authenticate(...) { ... }

[Assistant]: The salt is not passed to deriveKey().
```

Each serialized Tool result keeps at most 2,000 characters, then receives a marker with the omitted character count. This bound applies to the summarization request only; it does not rewrite the stored Tool-result entry.

The request uses `SUMMARIZATION_SYSTEM_PROMPT`, disables Tool calls with `toolChoice: "none"`, disables prompt-cache writes with `cacheRetention: "none"`, and uses a fresh routing session id when the caller does not supply one. Transient summary-stream failures follow the configured retry policy; deterministic errors and aborts return immediately. A main summary is one model request. A split turn may require a main-history request followed by a turn-prefix request; current Pi executes them sequentially.

### Incremental summaries have a precise input rule

When `prepareCompaction()` finds an earlier compaction, it copies that entry's `summary` into `previousSummary`. For a non-split compaction, or for a split compaction with complete earlier messages to summarize, `generateSummaryWithUsage()` wraps the new messages in `<conversation>` and the previous checkpoint in `<previous-summary>`, then switches from the initial prompt to update instructions.

```text
first compaction
  messages 1…30 → summary A

later compaction
  <conversation>messages kept by A that now fall before cut B</conversation>
  <previous-summary>summary A</previous-summary>
  → summary B
```

The update instructions preserve existing information, add progress and decisions, move completed work, refresh next steps, and permit removal of information that is no longer relevant. “Incremental” therefore means an LLM-guided update, not byte-for-byte accumulation.

During a split turn, the main-history request receives `previousSummary` only when `messagesToSummarize` is nonempty. If the split interval contains no complete earlier messages, current `compact()` uses the literal `No prior history.` before the turn-prefix summary and does not make a separate previous-summary request.

### File-operation metadata is narrow and cumulative

Default compaction inspects assistant Tool calls named exactly `read`, `write`, and `edit` when their arguments contain a string `path`. It carries the previous Pi-generated compaction's `details` forward, then adds operations from both the main summary region and a split-turn prefix.

`computeFileLists()` sorts the results. A path seen in `write` or `edit` goes to `modifiedFiles`; such a path is removed from `readFiles`, so that list contains read-only paths. Bash side effects and custom Tool conventions are not inferred. An Extension-generated prior entry (`fromHook: true`) may use a different `details` schema, so built-in extraction does not assume it contains Pi's file lists.

```text
<read-files>
src/utils/hash.ts
</read-files>

<modified-files>
src/auth.ts
</modified-files>
```

These tags are appended to the summary only when a list is nonempty. The same arrays are stored in the built-in entry's `details`, which lets the next built-in compaction carry them forward without parsing prose.

## 5. Edge case: one turn is larger than the retained budget

A turn starts at a user-like message and runs through subsequent assistant and Tool-result messages until the next user-like start. Pi treats user, Bash-execution, custom, branch-summary, and compaction-summary roles as turn starts. An assistant or Tool result does not start a turn.

### Why assistant cut points are allowed

Keeping only user cut points would preserve whole turns, but one large turn could make the retained region much larger than `keepRecentTokens`. Assistant cut points give the algorithm a usable boundary inside that turn while still keeping following Tool results with their call.

The current result shape exposes the consequence explicitly. This is a source-faithful type excerpt, not a replacement for importing the exported `CutPointResult`:

```typescript
interface CutPointResult {
  firstKeptEntryIndex: number;
  turnStartIndex: number;
  isSplitTurn: boolean;
}
```

If the chosen entry itself starts a turn, `turnStartIndex` is `-1` and `isSplitTurn` is false. Otherwise Pi scans backward to the nearest turn-start entry within the current compaction boundary.

```text
one oversized turn

entry:   1      2       3       4       5       6      [7]      8
       user  assistant  tool  assistant  tool    tool  assistant  tool
        ↑                                             ↑
  turnStartIndex                              firstKeptEntryId
        └──────── turnPrefixMessages: 1…6 ────────────┘
                                                      └─ kept: 7…8
```

The user request belongs to `turnPrefixMessages`, not to the main history summary. Complete earlier turns end before `turnStartIndex` and go to `messagesToSummarize`.

### The prefix checkpoint repairs the split

The prefix request uses a smaller output cap, the smaller of `floor(0.5 × reserveTokens)` and `model.maxTokens`, and this separate template:

```markdown
## Original Request
[What did the user ask for in this turn?]

## Early Progress
- [Key decisions and work completed in the prefix]

## Context for Suffix
- [Information needed to understand the retained recent work]
```

When complete earlier messages exist, Pi generates or updates the six-section history summary first. It then generates the prefix summary. Usage from both requests is added field by field. The stored text joins the two parts with a separator and a `Turn Context (split turn)` label.

```text
[six-section history summary, or "No prior history."]

---

Turn Context (split turn):

[Original Request / Early Progress / Context for Suffix]

then, in projected context:
[assistant at firstKeptEntryId] [its Tool results] [later messages]
```

The split remains lossy, but the next model receives the original request and early work as structured context before seeing the verbatim suffix.

## 6. Persistence, reconstruction, and lifecycle events

### `CompactionEntry` is the stored checkpoint

`SessionManager.appendCompaction()` appends a child of the current leaf and advances the leaf. It does not delete the entries summarized by the new checkpoint. The public Coding Agent type at the pinned revision has this shape:

```typescript
import type { Usage } from "@earendil-works/pi-ai";

interface CompactionEntry<T = unknown> {
  type: "compaction";
  id: string;
  parentId: string | null;
  timestamp: string;
  summary: string;
  firstKeptEntryId: string;
  tokensBefore: number;
  details?: T;
  usage?: Usage;
  fromHook?: boolean;
}
```

`timestamp` is an ISO string in the stored session, not the numeric timestamp used by projected `AgentMessage`s. `fromHook` is the backward-compatible field name for an Extension-provided result. `details` must be JSON-serializable if the session uses JSONL storage.

```json
{
  "type": "compaction",
  "id": "e_compact",
  "parentId": "e_last",
  "timestamp": "2026-08-24T10:00:00.000Z",
  "summary": "## Goal\nRepair authentication...",
  "firstKeptEntryId": "e_recent",
  "tokensBefore": 185000,
  "details": {
    "readFiles": ["src/utils/hash.ts"],
    "modifiedFiles": ["src/auth.ts"]
  },
  "fromHook": false
}
```

`tokensBefore` is calculated during preparation from `estimateContextTokens(buildSessionContext(pathEntries).messages)`. It measures the rebuilt active context being replaced, using provider usage when valid and estimates where needed. It is not the token count of every JSONL entry, the session file byte size, or the summary request usage. Summary-generation `usage` is stored separately and included in all-session token and cost totals.

### Stored tree, active projection, and per-call transform are different states

The session tree retains old raw entries, the kept entries, the compaction entry, and later children. `buildContextEntries()` follows only the selected leaf's parent path, finds the latest compaction on that path, and returns:

```text
persisted selected path
old raw entries → firstKept → recent entries → CompactionEntry → later entries

active context entries
CompactionEntry → firstKept → recent entries → later entries

active AgentMessage[]
CompactionSummaryMessage → retained messages → later messages
```

The latest `CompactionEntry` becomes a `CompactionSummaryMessage` with a numeric message timestamp. Coding Agent's `convertToLlm()` later converts it to a Pi AI user message whose text is wrapped in the fixed compaction preamble and `<summary>` tags.

```text
The conversation history before this point was compacted into the following summary:

<summary>
[stored summary]
</summary>
```

This projection happens when a session is loaded and after compaction. On each model call, Agent core then applies the Chapter 8 `transformContext` hook to that `AgentMessage[]`, followed by Coding Agent's `convertToLlm()`. The hook can filter a single request projection; it does not append `CompactionEntry`, change `firstKeptEntryId`, or delete the stored tree.

The monorepo's generic Agent runtime has a separate compaction schema with a materialized `retainedTail`. Coding Agent `SessionManager` at this pinned revision uses `firstKeptEntryId`. Do not add `retainedTail` to the Coding Agent `CompactionEntry` type or assume the two persistence contracts reconstruct context identically.

### Public events and Extension hooks serve different consumers

`AgentSession.subscribe()` consumers see `compaction_start` and `compaction_end`. The start has `reason: "manual" | "threshold" | "overflow"`. The end always reports that reason plus `result`, `aborted`, `willRetry`, and an optional `errorMessage`.

Extensions have three separate hooks:

- `session_before_compact` is awaited and may return `{ cancel: true }` or a custom `compaction` result.
- `session_compact` is awaited after the entry has been appended and Agent messages rebuilt.
- `session_compact_failed` is awaited after failure or abort and carries terminal status.

The public session start/end events are emitted synchronously to subscribers. Extension hooks are dispatched through `ExtensionRunner`; a cancel result short-circuits later handlers, and the last non-cancel result wins. If no handler returns a custom result, the built-in compactor remains in control. A thrown hook error is reported as an Extension error and dispatch continues.

```text
manual: compaction_start
  → validate model/auth → prepare → session_before_compact
  → built-in or custom result → append entry → rebuild Agent messages
  → session_compact → compaction_end(success)

automatic: prepare first → compaction_start
  → session_before_compact → built-in or custom result
  → append entry → rebuild Agent messages → session_compact
  → compaction_end(success, willRetry)

terminal failure or abort after start
  → compaction_end(result: undefined, aborted/errorMessage)
  → session_compact_failed
```

This copyable Extension records all three hook outcomes without replacing the built-in summary:

```typescript
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function compactionAudit(pi: ExtensionAPI) {
  pi.on("session_before_compact", async (event, ctx) => {
    ctx.ui.notify(`Compaction requested: ${event.reason}`, "info");
  });

  pi.on("session_compact", async (event, ctx) => {
    ctx.ui.notify(
      `Compacted ${event.compactionEntry.tokensBefore.toLocaleString()} tokens`,
      "info",
    );
  });

  pi.on("session_compact_failed", async (event, ctx) => {
    const detail = event.aborted ? "aborted" : (event.errorMessage ?? "failed");
    ctx.ui.notify(`Compaction ${detail}`, "warning");
  });
}
```

A replacement returned from `session_before_compact` must provide `summary`, `firstKeptEntryId`, and `tokensBefore`; `usage` and `details` are optional. Pi does not re-run cut-point validation on that replacement, so a handler should normally copy the prepared `firstKeptEntryId` and `tokensBefore`. The Extension receives the prepared boundary, both message regions, previous summary, file operations, reason, retry intent, branch entries, and the active `AbortSignal`. A custom model call should pass that signal and return its provider usage.

### Failure, cancellation, and retry semantics

Manual `compact()` aborts the Agent run first, emits `compaction_start`, and rejects its promise on missing model, nothing to compact, hook cancellation, abort, or summary failure. Hook cancellation becomes `Error("Compaction cancelled")`. Its `compaction_end` has `aborted: true`, no `errorMessage`, and `willRetry: false`; `session_compact_failed` receives the same terminal meaning.

`abortCompaction()` aborts either the manual or automatic compaction controller. Built-in summary calls receive that signal. Pi checks the signal again before appending, so an abort after summary generation but before persistence does not write a checkpoint.

Automatic cancellation or abort returns `false` to the post-run loop, emits terminal events, writes no entry, and disables retry for that attempt. Other automatic failures are formatted as `Auto-compaction failed: ...` or `Context overflow recovery failed: ...`, emitted, reported to `session_compact_failed`, and swallowed by `_runAutoCompaction()` rather than thrown to the caller. If overflow still occurs after the single compact-and-retry attempt, Pi emits a terminal recovery failure and does not compact or retry again.

No public `compaction_start` is emitted when automatic preparation returns `undefined`; manual start is earlier and therefore still pairs with a failure end for “Already compacted” or “Nothing to compact.” On success, `compaction_end` is emitted only after persistence, projection, and `session_compact`. Manual code clears its controller before the end event so an end listener can safely submit a queued prompt.

## 7. Complete end-to-end chain

The complete automatic path crosses five representations: provider usage, session entries, summary-request messages, a persisted checkpoint, and the next provider request.

```text
1. Agent response settles
   message_end persists assistant → agent_end → _handlePostAgentRun()

2. Classify
   same-model overflow/recoverable length OR threshold from current usage

3. Prepare
   build active branch path
   → recalculate tokensBefore from buildSessionContext(path).messages
   → find previous-summary boundary
   → walk backward to firstKeptEntryId
   → split messagesToSummarize / turnPrefixMessages / kept region
   → collect built-in file operations

4. Intercept
   compaction_start → awaited session_before_compact
   → cancel, custom result, or built-in generation

5. Summarize
   convertToLlm → serializeConversation (Tool results capped at 2,000 chars)
   → six-section initial/update request
   → optional sequential turn-prefix request
   → append sorted file lists and combine usage

6. Persist
   SessionManager.appendCompaction(...)
   → new parent-linked JSONL entry; old entries remain

7. Project
   buildSessionContext()
   → CompactionSummaryMessage + entries from firstKeptEntryId + later entries
   → replace agent.state.messages

8. Notify and continue
   session_compact → compaction_end
   → retry one overflow turn, deliver queued messages, or settle

9. Next model call
   transformContext → convertToLlm
   → system prompt + <summary> user message + verbatim recent messages
```

Manual compaction enters at step 4 after aborting the active Agent run and preparing the same regions. It never takes the automatic retry branch in step 8.

## 8. Design principles and handoff checks

### 1. Preserve a protocol-safe recent suffix

Backward selection encodes a value judgment: recent work is more useful verbatim than old work at the same token cost. Valid cut points add a hard protocol constraint. A retained Tool result without its call is malformed context, so `keepRecentTokens` is a target rather than permission to cut at an arbitrary token offset.

Test this property with a turn containing several Tool calls near the boundary. Confirm that the chosen entry is never a Tool result, every retained Tool result still follows its assistant call, and an assistant boundary produces `turnPrefixMessages` beginning at the correct user-like entry.

### 2. Make lossy state transfer inspectable

The six-section template, split-turn template, `firstKeptEntryId`, `tokensBefore`, file lists, and summary `usage` describe what changed and how it was produced. None proves the summary is complete. Quality tests should ask whether the checkpoint retains the active goal, user constraints, accepted decisions, unfinished work, blockers, exact paths, commands, and errors needed for the next action.

Do not copy secrets into a summary merely because they appeared in history. Compaction does not erase data: raw entries remain in the session file, summary text may repeat old content, and the generic Agent runtime can copy content into a retained tail. Compliance deletion requires a separate, precise storage rewrite outside this runtime mechanism.

### 3. Keep persistence, projection, and navigation separate

Compaction changes the active-path projection by adding `CompactionEntry`. `transformContext` changes one request in memory. Branch summarization solves another problem: when tree navigation requests a summary, Pi appends a `BranchSummaryEntry` at the target path so useful work from the branch being left can follow the navigation. It does not use the compaction threshold or `firstKeptEntryId`.

Before handing off a compaction integration, verify these cases:

1. Exact threshold boundary and both current defaults.
2. Provider-backed usage, all-zero/error fallback, and stale post-compaction usage rejection.
3. First compaction, repeated compaction, missing previous kept id, and nothing-to-summarize result.
4. Whole-turn and split-turn cuts, including Tool ordering and prefix-summary usage totals.
5. Global/project/SDK setting precedence, plus an untrusted project.
6. Manual success, manual cancellation, automatic hook cancellation, summary error, signal abort, overflow retry success, and second overflow failure.
7. JSONL entry fields, active context entries, projected `AgentMessage[]`, and final Pi AI `Message[]` as four separate assertions.
8. Built-in versus Extension `details`, read-only versus modified file lists, and Bash/custom Tool operations that require their own metadata.

## 9. Next stop

[Chapter 10](ch10-session.md) follows the parent-linked JSONL tree behind `getBranch()`, `appendCompaction()`, `buildContextEntries()`, rewind, and branch navigation. That storage model explains why compaction can omit old entries from the next model request without deleting them.

The implementation references for this chapter are pinned to Pi `0.84.3` at `4e58f324fae8ebfa98a3d45181fb248072a2afac`:

- [Compaction defaults, token accounting, cut points, templates, preparation, and generation](https://github.com/earendil-works/pi/blob/4e58f324fae8ebfa98a3d45181fb248072a2afac/packages/coding-agent/src/core/compaction/compaction.ts)
- [Summary serialization and file-operation tracking](https://github.com/earendil-works/pi/blob/4e58f324fae8ebfa98a3d45181fb248072a2afac/packages/coding-agent/src/core/compaction/utils.ts)
- [`CompactionEntry`](https://github.com/earendil-works/pi/blob/4e58f324fae8ebfa98a3d45181fb248072a2afac/packages/coding-agent/src/core/session-manager.ts#L46-L80), [`appendCompaction()`](https://github.com/earendil-works/pi/blob/4e58f324fae8ebfa98a3d45181fb248072a2afac/packages/coding-agent/src/core/session-manager.ts#L1096-L1119), and [`buildSessionContext()`](https://github.com/earendil-works/pi/blob/4e58f324fae8ebfa98a3d45181fb248072a2afac/packages/coding-agent/src/core/session-manager.ts#L379-L469)
- [Manual and automatic lifecycle, retry, abort, and failure paths](https://github.com/earendil-works/pi/blob/4e58f324fae8ebfa98a3d45181fb248072a2afac/packages/coding-agent/src/core/agent-session.ts#L1818-L2359)
- [Extension context compaction contracts](https://github.com/earendil-works/pi/blob/4e58f324fae8ebfa98a3d45181fb248072a2afac/packages/coding-agent/src/core/extensions/types.ts#L290-L302) and [event hooks](https://github.com/earendil-works/pi/blob/4e58f324fae8ebfa98a3d45181fb248072a2afac/packages/coding-agent/src/core/extensions/types.ts#L593-L630)
- [Compaction-summary message conversion](https://github.com/earendil-works/pi/blob/4e58f324fae8ebfa98a3d45181fb248072a2afac/packages/coding-agent/src/core/messages.ts#L109-L120) and [per-call transform order](https://github.com/earendil-works/pi/blob/4e58f324fae8ebfa98a3d45181fb248072a2afac/packages/agent/src/agent-loop.ts#L277-L302)
- [Global/project setting merge](https://github.com/earendil-works/pi/blob/4e58f324fae8ebfa98a3d45181fb248072a2afac/packages/coding-agent/src/core/settings-manager.ts#L148-L170), [SDK overrides](https://github.com/earendil-works/pi/blob/4e58f324fae8ebfa98a3d45181fb248072a2afac/packages/coding-agent/src/core/settings-manager.ts#L546-L549), and [effective compaction defaults](https://github.com/earendil-works/pi/blob/4e58f324fae8ebfa98a3d45181fb248072a2afac/packages/coding-agent/src/core/settings-manager.ts#L825-L852)
- [Generic Agent `retainedTail` schema](https://github.com/earendil-works/pi/blob/4e58f324fae8ebfa98a3d45181fb248072a2afac/packages/agent/src/harness/session/types.ts#L39-L51), which is distinct from Coding Agent `SessionManager`

> **Next up:** [Chapter 10: Session Management](ch10-session.md)
