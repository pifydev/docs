---
title: 'Chapter 10: Session storage and branching'
description: Pi session JSONL, entry types, parent links, context reconstruction, and SessionManager APIs.
translation_key: ch10-session
language: en
chapter: 10
source_url: 'https://www.dgzhuya.com/modules/ch10-session'
official_refs:
  - 'https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/sessions.md'
  - 'https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/session-format.md'
terms_used:
  - Session
  - Session Tree
  - SessionManager
  - CompactionEntry
  - BranchSummaryEntry
status: reviewed
last_updated: '2026-08-24'
translator: Pify maintainers
reviewed_by: Pify maintainers
---
Pi stores a conversation as an append-only JSONL session whose entries form a tree. The format supports resuming work, branching from an earlier entry, compacting active context, and retaining abandoned paths without rewriting the original transcript.

## 1. Session storage

The coding agent stores sessions under `~/.pi/agent/sessions/` by default and groups them by working directory.

```bash
pi -c                  # Continue the most recent session
pi -r                  # Browse previous sessions
pi --no-session        # Run without persistence
pi --name "my task"    # Set a display name
pi --session <path|id> # Open a specific session
pi --fork <path|id>    # Copy one branch into a new session
```

Use `/session` to inspect the active file, session ID, message count, token usage, and cost.

## 2. Append-only JSONL

The first line is a session header. Every later line is one entry encoded as JSON.

```json
{"type":"session","version":3,"id":"session-id","timestamp":"2026-08-24T00:00:00.000Z","cwd":"/project"}
{"type":"message","id":"entry-1","parentId":null,"timestamp":"2026-08-24T00:00:01.000Z","message":{"role":"user","content":"Inspect the tests","timestamp":1787529601000}}
{"type":"message","id":"entry-2","parentId":"entry-1","timestamp":"2026-08-24T00:00:02.000Z","message":{"role":"assistant","content":[],"provider":"anthropic","model":"claude-sonnet-4-6","usage":{},"stopReason":"stop","timestamp":1787529602000}}
```

Session-entry timestamps use the persisted format defined by the session schema. Nested Pi AI messages retain their own Unix-millisecond timestamps.

Appending avoids rewriting a growing transcript after every turn. A partially written final line can be detected and handled without invalidating earlier entries.

## 3. Entry types

The session format stores more than messages:

| Entry | Purpose |
| --- | --- |
| `message` | User, assistant, Tool result, or agent message |
| `model_change` | Change provider/model for following entries |
| `thinking_level_change` | Change reasoning level |
| `compaction` | Summary checkpoint for active context |
| `branch_summary` | Summary of a branch left during navigation |
| `custom` | Extension state that does not enter model context |
| `custom_message` | Extension content that does enter model context |
| `label` | Bookmark an existing entry |
| `session_info` | Session metadata such as display name |

Consumers should switch on `type` and preserve unknown entries when performing migrations unless the format version defines another rule.

## 4. Parent links form the tree

Each non-header entry has its own `id` and a `parentId`. The first entry on a branch uses `parentId: null`; every later entry points to the entry that precedes it on that branch.

```text
entry-1 -- entry-2 -- entry-3 -- entry-4
                      \
                       entry-5 -- entry-6   current leaf
```

Entries store the parent pointer only. Child lists are derived by indexing all entries by `parentId`. This keeps each append local and prevents older rows from being rewritten when a branch is created.

The active **leaf** identifies the current position. The active branch is the path obtained by walking parent links from that leaf to the root and reversing the result.

## 5. Branching and navigation

Interactive commands expose the tree:

| Command | Effect |
| --- | --- |
| `/tree` | Move the current leaf to another entry, optionally summarizing the branch being left |
| `/fork` | Create a new session from an earlier user-message position |
| `/clone` | Copy the active branch into a new session |
| `/resume` | Select an existing session |
| `/new` | Start a new session |

Branching does not delete the old child entries. It changes which path is active, then appends new entries below the selected position.

## 6. Build active context

`buildContextEntries()` walks the active path and applies session checkpoints. `buildSessionContext()` then produces the messages, selected model, and thinking level for the next model call.

When the path contains compaction:

1. earlier raw messages are replaced in active context by the compaction summary;
2. the retained tail is included;
3. entries appended after the compaction remain in order;
4. the JSONL history itself remains unchanged.

`custom` entries are available to extensions but do not enter model context. `custom_message` entries do.

## 7. Compaction and branch summaries

A `CompactionEntry` identifies a summary and the retained boundary. Newer entries may include a materialized `retainedTail`, making the checkpoint self-contained.

A `BranchSummaryEntry` records the path left during `/tree` navigation and attaches its summary to the target branch. Both entry types may include usage and extension-specific details.

These summaries affect context reconstruction; they do not merge or delete the underlying branches.

## 8. SessionManager API

`SessionManager` provides creation, listing, append, tree, and context methods:

```typescript
import { SessionManager } from "@earendil-works/pi-coding-agent";

const session = SessionManager.create(process.cwd());

session.appendMessage({
  role: "user",
  content: "Review the authentication flow.",
  timestamp: Date.now(),
});

const context = session.buildSessionContext();
console.log(context.messages.length);
```

Other entry points include `open()`, `continueRecent()`, `inMemory()`, and `forkFrom()`. Tree methods include `getBranch()`, `getTree()`, `getChildren()`, `branch()`, and `createBranchedSession()`.

Use `SessionManager.inMemory()` for tests or ephemeral work that must not create a file.

## 9. Format and migration rules

Session files are application data. Handle them conservatively:

1. Check the header version before interpreting entry fields.
2. Parse one JSON object per line and report the line number on failure.
3. Preserve IDs, parent links, Tool-call links, and entry order.
4. Keep unknown extension data JSON-serializable.
5. Write migrations as explicit version-to-version transforms.
6. Never translate role names, entry types, field names, provider IDs, or model IDs.

Copying a file manually may carry a working directory and credentials context that does not match the new environment. Prefer documented fork and export commands.

## 10. Operational safety

Session files can contain source code, prompts, Tool output, file paths, model reasoning, and extension data. Protect them as potentially sensitive records.

- Restrict filesystem access to the session directory.
- Redact secrets before writing custom entries or logs.
- Avoid uploading a session without reviewing its contents.
- Use atomic append and flush behavior appropriate for the storage backend.
- Back up before running a migration or bulk rewrite.

The session tree is the durable record; the active model context is a derived view produced from one branch plus its summaries and compaction checkpoints.
