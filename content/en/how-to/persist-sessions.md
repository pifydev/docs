---
title: Persist and resume sessions
description: Save a JSONL session, continue recent work, open a specific file, and branch conversation history.
translation_key: how-to-persist-sessions
language: en
status: reviewed
reviewed_by: Pify maintainers
last_updated: '2026-08-24'
---

Pi stores a persistent session as one JSONL file. Entries form a tree through `id` and `parentId`, so one file can preserve multiple conversation branches.

## Create a persistent session

```ts title="new-session.ts"
import {
  createAgentSession,
  ModelRuntime,
  SessionManager,
} from "@earendil-works/pi-coding-agent";

const cwd = process.cwd();
const modelRuntime = await ModelRuntime.create();
const { session } = await createAgentSession({
  modelRuntime,
  sessionManager: SessionManager.create(cwd),
});

await session.prompt("Create a refactoring plan for this project.");
console.log(session.sessionFile);
session.dispose();
```

`SessionManager.create(cwd)` creates a new persistent session for that working directory. Pi appends entries as the conversation changes; you do not need a separate `save()` call.

Use `SessionManager.inMemory(cwd)` for tests or ephemeral work that must not reach disk.

## Continue the most recent session

```ts title="continue-session.ts"
import {
  createAgentSession,
  ModelRuntime,
  SessionManager,
} from "@earendil-works/pi-coding-agent";

const cwd = process.cwd();
const modelRuntime = await ModelRuntime.create();
const { session, modelFallbackMessage } = await createAgentSession({
  modelRuntime,
  sessionManager: SessionManager.continueRecent(cwd),
});

if (modelFallbackMessage) console.warn(modelFallbackMessage);
await session.prompt("Continue with the first safe change.");
```

The fallback message matters: a saved model may no longer be available, and the restored session can select a replacement.

## Open or list saved sessions

```ts
const sessions = await SessionManager.list(process.cwd());
const allSessions = await SessionManager.listAll(process.cwd());

const manager = SessionManager.open("/absolute/path/to/session.jsonl");
const { session } = await createAgentSession({ sessionManager: manager });
```

`list()` is scoped to a working directory. `listAll()` searches every project known to the configured Pi agent directory.

## Navigate and branch the tree

```ts
const manager = SessionManager.open("/absolute/path/to/session.jsonl");
const entries = manager.getEntries();
const currentPath = manager.getPath();

const checkpoint = entries.find((entry) => manager.getLabel(entry.id) === "checkpoint");
if (checkpoint) manager.branch(checkpoint.id);
```

`branch(id)` changes the active leaf in the same file. A new prompt then creates another child. Use `createBranchedSession(leafId)` when the selected path should become a separate session file.

## Storage and safety

The default root is `~/.pi/agent/sessions/`, grouped by working directory. Override it with `--session-dir`, then `PI_CODING_AGENT_SESSION_DIR`, or `sessionDir` in `settings.json`, in that precedence order.

Session files can contain prompts, tool arguments, tool output, file paths, and extension data. Apply the same access control, retention, and backup policy as source code and operational logs.
