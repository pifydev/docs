---
title: 'Chapter 9: Context compaction'
description: How Pi summarizes older conversation state while preserving recent messages and branch history.
translation_key: ch09-compaction
language: en
chapter: 9
source_url: 'https://www.dgzhuya.com/modules/ch09-compaction'
official_refs:
  - 'https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/compaction.md'
terms_used:
  - Context Compaction
  - CompactionEntry
  - BranchSummaryEntry
  - Session
status: reviewed
last_updated: '2026-08-24'
translator: Pify maintainers
reviewed_by: Pify maintainers
---
Context compaction replaces older conversation history with a structured summary while keeping recent messages verbatim. Pi uses it to continue a long session without sending the entire transcript on every model call.

## 1. Trigger threshold

Automatic compaction runs when estimated context use crosses this boundary:

```text
contextTokens > contextWindow - reserveTokens
```

`reserveTokens` protects space for the next model response. The current default is 16,384 tokens. Users can also run `/compact [instructions]` manually.

An overflow detected by the provider may trigger compaction and retry even when the local token estimate was below the threshold.

## 2. Select the cut point

Pi walks backward from the newest message and accumulates estimated tokens until it reaches `keepRecentTokens`, which defaults to 20,000. The messages after the cut remain verbatim; older messages are summarized.

```text
older history                         recent tail
[user][assistant][tool result] | [user][assistant][tool result]
                                 ^
                          firstKeptEntryId
```

A valid cut point must preserve message semantics. Pi may cut at user, assistant, bash-execution, custom-message, or branch-summary boundaries. It does not cut at an isolated Tool result because that would separate the result from its call.

## 3. Split turns

A turn begins with a user message and includes the following assistant and Tool messages until the next user message. Normally Pi cuts between turns.

One large turn can exceed `keepRecentTokens` by itself. Pi then keeps the newest part of that turn and creates a separate summary for its earlier prefix. The final summary merges:

1. previous history, including an earlier compaction summary when present;
2. the prefix of the oversized current turn.

This preserves the relationship between the active user request, its Tool calls, and the recent results.

## 4. Generate a structured summary

Pi serializes selected messages as labeled text before summarization. Tool output is truncated during serialization to keep the summary request bounded.

The default summary records:

- the user's goal and constraints;
- completed, active, and blocked work;
- key decisions and their rationale;
- next steps;
- critical identifiers and context;
- files read and files modified.

A useful summary preserves state needed to continue. It should not restate every message or invent missing rationale.

## 5. Append a compaction entry

The summary is added to the session as a new entry; older entries are not deleted.

```typescript
interface CompactionEntry<T = unknown> {
  type: "compaction";
  id: string;
  parentId: string;
  timestamp: number;
  summary: string;
  firstKeptEntryId: string;
  tokensBefore: number;
  usage?: Usage;
  fromHook?: boolean;
  details?: T;
}
```

`firstKeptEntryId` identifies where the verbatim tail starts. Newer session formats may also store a materialized retained tail so the compaction acts as a self-contained checkpoint.

`usage` records the model work used to create the summary. Default `details` track files read and modified.

## 6. Rebuild model context

For the next request, session logic constructs:

```text
system prompt
+ compaction summary
+ retained recent messages
+ messages appended after compaction
```

The full JSONL history remains available for navigation and audit. Compaction changes the active model context, not the historical record.

## 7. Repeated compaction

On a later compaction, Pi includes the previous summary as iterative context and summarizes from the earlier kept boundary. This prevents messages that survived one compaction from becoming permanently disconnected from the next summary.

The new `tokensBefore` value is calculated from the rebuilt context being replaced, not from the raw size of the session file.

## 8. Branch summarization

Session-tree navigation solves a related problem. When `/tree` moves from one branch to another, Pi can summarize the branch being left and append a `BranchSummaryEntry` at the target path.

```text
        B -- C -- D     branch being left
       /
A ----+
       \
        E -- F -- [summary of B, C, D]
```

Pi finds the deepest common ancestor, collects the abandoned path, generates a structured summary, and attaches it after the target leaf. This carries useful work across branches without merging their raw transcripts.

Compaction and branch summarization both accumulate file-operation metadata from earlier summaries.

## 9. Settings and extension hooks

Configure automatic compaction in global or project settings:

```json
{
  "compaction": {
    "enabled": true,
    "reserveTokens": 16384,
    "keepRecentTokens": 20000
  }
}
```

Extensions can observe or replace the process through `session_before_compact`, handle terminal failures through `session_compact_failed`, and customize tree navigation through `session_before_tree`.

A custom summary must return valid boundaries and JSON-serializable details. Preserve the supplied abort signal and record usage when another model generates the summary.

## 10. Failure and quality controls

Compaction is lossy, so test it as a state-transfer operation:

1. Verify active goals, constraints, decisions, and pending work survive.
2. Keep exact paths, commands, error messages, and identifiers when they matter.
3. Do not retain secrets merely because they appeared earlier in the transcript.
4. Confirm every retained Tool result still has the context needed to interpret it.
5. Track summary-generation failures separately from the original agent run.
6. Allow manual compaction even when automatic compaction is disabled.

[Chapter 10](ch10-session.md) explains the JSONL tree that stores messages, compaction checkpoints, summaries, labels, and branches.
