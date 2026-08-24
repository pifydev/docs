---
title: Persist sessions
description: Create, resume, inspect, branch, and safely retain append-only JSONL sessions.
translation_key: how-to-persist-sessions
language: en
status: reviewed
reviewed_by: Pify maintainers
last_updated: '2026-08-25'
---

Use `SessionManager` when a conversation must outlive the current process. It owns the session file and appends state as an `AgentSession` runs.

:::tip[When you need this]

- Resume a coding task after restarting a CLI, service, or worker
- Keep an auditable conversation and Tool history
- Rewind within one history or extract a selected path into a new session

:::

The examples target Node.js `>=22.19.0`, ESM, and `@earendil-works/pi-coding-agent@0.84.2`. Install it with `npm install @earendil-works/pi-coding-agent@0.84.2`, plus `tsx`, TypeScript, and Node types for the commands below.

## The session model

A persistent session is **one append-only JSONL file**, not one file per turn. Its first record is a header with a session `id`, timestamp, `cwd`, format version, and optional `parentSession`. Later records are tree entries. Every entry has its own `id`, a `parentId`, and a timestamp; messages, model changes, compaction, labels, and extension state can therefore share one history.

`parentId` links entries inside a file. `parentSession` records lineage between files created by extraction or forking. Read the current ID with `getSessionId()`; do not invent filenames or edit either relationship yourself.

By default, SDK-created files live under `~/.pi/agent/sessions/<encoded-cwd>/`. `SessionManager.create(cwd, sessionDir)` and `continueRecent(cwd, sessionDir)` use the explicit second argument when supplied; otherwise they use that default. `SessionManager.inMemory(cwd)` keeps the same tree API without writing a file.

## 1. Start a session

With a model and credentials already configured, create the manager first and pass that exact instance into the agent:

```ts title="start-session.ts"
import {
  createAgentSession,
  ModelRuntime,
  SessionManager,
} from "@earendil-works/pi-coding-agent";

const cwd = process.cwd();
const sessionDir = process.env.APP_SESSION_DIR;
const sessionManager = SessionManager.create(cwd, sessionDir);
const modelRuntime = await ModelRuntime.create();
const { session } = await createAgentSession({
  cwd,
  modelRuntime,
  sessionManager,
});

try {
  await session.prompt("Create a refactoring plan for this project.");
  console.log(sessionManager.getSessionFile());
} finally {
  session.dispose();
}
```

Run it with `npx tsx start-session.ts`. The agent appends completed messages and state changes automatically; there is no `save()` call. A new manager can report its prospective path immediately, but Pi delays creating the file until the first assistant message arrives. An in-flight first response is therefore not yet durable.

## 2. Resume a session

`continueRecent(cwd, sessionDir?)` opens the newest session matching `cwd`, or prepares a new one when no matching session exists. With an explicit custom `sessionDir`, it filters candidate headers by their stored `cwd`; the default encoded-CWD directory is already project-scoped:

```ts title="resume-session.ts"
import {
  createAgentSession,
  ModelRuntime,
  SessionManager,
} from "@earendil-works/pi-coding-agent";

const cwd = process.cwd();
const sessionDir = process.env.APP_SESSION_DIR;
const sessionManager = SessionManager.continueRecent(cwd, sessionDir);
const modelRuntime = await ModelRuntime.create();
const { session, modelFallbackMessage } = await createAgentSession({
  cwd,
  modelRuntime,
  sessionManager,
});

if (modelFallbackMessage) console.warn(modelFallbackMessage);

try {
  await session.prompt("Continue with the first safe change.");
} finally {
  session.dispose();
}
```

Always surface `modelFallbackMessage`. It explains that a saved provider/model could not be restored and, when possible, names the replacement. The current API restores model and thinking changes recorded on the active branch; there is no `pinModel` session option.

To resume a chosen file, pass an absolute path from `SessionManager.list()` or `listAll()` to `SessionManager.open(path)`. `open()` normally restores the `cwd` stored in the header. Its third argument is an explicit `cwdOverride`; use it only when you intentionally relocate the worktree. Validate user-supplied paths against an allowed session root before opening them.

## 3. Branch a session

Choose between two operations:

- `branch(entryId)` only moves the active leaf in the current manager. The next append becomes another child in the **same file**; existing entries remain untouched.
- `createBranchedSession(leafId)` copies the root-to-leaf path into a **new file**. On a persistent manager it also switches that manager to the new file and session ID.

```ts title="branch-session.ts"
import { isAbsolute } from "node:path";
import { SessionManager } from "@earendil-works/pi-coding-agent";

const sessionPath = process.argv[2];
const checkpointId = process.argv[3];
if (!sessionPath || !isAbsolute(sessionPath) || !checkpointId) {
  throw new Error("Usage: branch-session.ts /absolute/session.jsonl ENTRY_ID");
}

const manager = SessionManager.open(sessionPath);
if (!manager.getEntry(checkpointId)) throw new Error("Unknown entry ID");

manager.branch(checkpointId);
console.log("same-file path", manager.getBranch().map((entry) => entry.id));

const parentFile = manager.getSessionFile();
const extractedFile = manager.createBranchedSession(checkpointId);
console.log({ parentFile, extractedFile, activeFile: manager.getSessionFile() });
```

Save `parentFile` before extraction if the caller still needs it. `forkFrom(sourcePath, targetCwd, sessionDir)` is the cross-project alternative: it creates a new file and copies the source file's full non-header history, while recording the source path as `parentSession`.

## 4. Walk the tree

`getEntries()` returns every non-header entry. `getBranch(leafId?)` returns one root-to-leaf path. `getTree()` exposes all branches as nodes with `children` and resolved labels.

```ts title="inspect-sessions.ts"
import { isAbsolute } from "node:path";
import {
  SessionManager,
  type SessionTreeNode,
} from "@earendil-works/pi-coding-agent";

const cwd = process.cwd();
const sessionDir = process.env.APP_SESSION_DIR;
const projectSessions = await SessionManager.list(cwd, sessionDir);
const searchableSessions = sessionDir
  ? await SessionManager.listAll(sessionDir)
  : await SessionManager.listAll();

const selected = projectSessions[0] ?? searchableSessions[0];
if (!selected || !isAbsolute(selected.path)) throw new Error("No saved session");

const manager = SessionManager.open(selected.path, sessionDir);
console.log("cwd", manager.getCwd());
console.log("entries", manager.getEntries().length);
console.log("active path", manager.getBranch().map((entry) => entry.id));

function printTree(nodes: SessionTreeNode[], depth = 0): void {
  for (const node of nodes) {
    console.log(`${"  ".repeat(depth)}${node.entry.type} ${node.entry.id}`);
    printTree(node.children, depth + 1);
  }
}

printTree(manager.getTree());
```

`list(cwd, sessionDir?)` is project-scoped. With no argument, `listAll()` searches all encoded project directories under Pi's default session root. Its string argument is a **session directory**, not a `cwd`; do not write `listAll(process.cwd())` unless the working directory really is the storage directory.

The following optional, no-secret fixture exercises the storage operations without contacting a provider. It asserts delayed file creation, create/open/continue/list, tree branching, path extraction, `forkFrom()`, and the manager switch after extraction. Run it with `npx tsx verify-sessions.ts`.

<Accordions type="single">
<Accordion title="Optional deterministic SessionManager fixture">

```ts title="verify-sessions.ts"
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import { SessionManager } from "@earendil-works/pi-coding-agent";

type StoredMessage = Parameters<SessionManager["appendMessage"]>[0];

function user(text: string): StoredMessage {
  return { role: "user", content: text, timestamp: Date.now() };
}

function assistant(text: string): StoredMessage {
  return {
    role: "assistant",
    content: [{ type: "text", text }],
    api: "openai-completions",
    provider: "fixture",
    model: "fixture",
    usage: {
      input: 1,
      output: 1,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 2,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: "stop",
    timestamp: Date.now(),
  };
}

const root = await mkdtemp(join(tmpdir(), "pi-session-fixture-"));
try {
  const cwd = join(root, "project");
  const sessionDir = join(root, "sessions");
  await mkdir(cwd);

  const manager = SessionManager.create(cwd, sessionDir);
  const sessionFile = manager.getSessionFile();
  assert.ok(sessionFile && isAbsolute(sessionFile));
  assert.equal(existsSync(sessionFile), false);

  const firstUser = manager.appendMessage(user("question"));
  const firstAssistant = manager.appendMessage(assistant("answer"));
  manager.appendMessage(user("main follow-up"));
  manager.appendMessage(assistant("main answer"));
  assert.equal(existsSync(sessionFile), true);

  const projectSessions = await SessionManager.list(cwd, sessionDir);
  const customDirSessions = await SessionManager.listAll(sessionDir);
  assert.equal(projectSessions[0]?.path, sessionFile);
  assert.equal(customDirSessions[0]?.path, sessionFile);

  const opened = SessionManager.open(sessionFile);
  assert.equal(opened.getCwd(), cwd);
  assert.equal(opened.getEntries().length, 4);
  assert.deepEqual(
    opened.getBranch().map((entry) => entry.id),
    opened.getEntries().map((entry) => entry.id),
  );

  opened.branch(firstAssistant);
  const alternateUser = opened.appendMessage(user("alternate follow-up"));
  const alternateLeaf = opened.appendMessage(assistant("alternate answer"));
  assert.deepEqual(
    opened.getBranch().map((entry) => entry.id),
    [firstUser, firstAssistant, alternateUser, alternateLeaf],
  );
  assert.equal(opened.getTree()[0]?.children[0]?.children.length, 2);

  const nonmatchingCwd = join(root, "other-project");
  await mkdir(nonmatchingCwd);
  const nonmatching = SessionManager.create(nonmatchingCwd, sessionDir);
  nonmatching.appendMessage(user("other question"));
  nonmatching.appendMessage(assistant("other answer"));
  const nonmatchingFile = nonmatching.getSessionFile();
  assert.ok(nonmatchingFile);
  const future = new Date(Date.now() + 60_000);
  await utimes(nonmatchingFile, future, future);

  const continued = SessionManager.continueRecent(cwd, sessionDir);
  assert.equal(continued.getSessionFile(), sessionFile);
  assert.equal(continued.getCwd(), cwd);

  const missingCwd = join(root, "missing-project");
  await mkdir(missingCwd);
  const noMatch = SessionManager.continueRecent(missingCwd, sessionDir);
  assert.equal(noMatch.getEntries().length, 0);
  assert.equal(noMatch.getCwd(), missingCwd);
  assert.notEqual(noMatch.getSessionFile(), nonmatchingFile);

  const parentFile = continued.getSessionFile();
  const parentId = continued.getSessionId();
  assert.ok(parentFile);
  const extractedFile = continued.createBranchedSession(alternateLeaf);
  assert.ok(extractedFile && extractedFile !== parentFile);
  assert.equal(continued.getSessionFile(), extractedFile);
  assert.notEqual(continued.getSessionId(), parentId);
  assert.equal(continued.getHeader()?.parentSession, parentFile);
  assert.equal(continued.getBranch().length, 4);

  const forkCwd = join(root, "fork-project");
  const forkDir = join(root, "fork-sessions");
  await mkdir(forkCwd);
  const forked = SessionManager.forkFrom(parentFile, forkCwd, forkDir);
  assert.equal(forked.getCwd(), forkCwd);
  assert.equal(forked.getHeader()?.parentSession, parentFile);
  assert.equal(SessionManager.inMemory(cwd).getSessionFile(), undefined);

  console.log("session fixture passed");
} finally {
  await rm(root, { recursive: true, force: true });
}
```

</Accordion>
</Accordions>

## 5. Privacy and cleanup

Treat a session file like source code plus operational logs. It may contain prompts, model output, Tool arguments and results, local paths, images, and extension data. Restrict the storage directory to the application account, validate paths at trust boundaries, encrypt backups when appropriate, and never commit sessions or credentials to a repository.

Retention, redaction, and backup schedules belong to the host application or operator; `SessionManager` does not expose the baseline guide's `redact()` or retention hooks. Stop and dispose the session before external maintenance. In the interactive `/resume` selector, `Ctrl+D` followed by confirmation deletes the selected session and uses the system trash command when available. For SDK cleanup, delete only the resolved file returned by `getSessionFile()` after verifying it is inside the intended session directory.

Back up files before upgrades or bulk cleanup. The loader automatically migrates v1 to v2 and v2 to v3 when opening an older valid session, rewriting it in the current format. Let `SessionManager.open()` perform that migration; do not parse, patch, or write `version` yourself.

## Pitfalls

- **Calling `save()`:** there is no current save step. `AgentSession` appends completed events through its manager.
- **Expecting the file too early:** a new persistent session is held in memory until its first assistant message. A crash can lose that in-flight response. Completed later entries are appended synchronously, while malformed JSONL lines—including a partial tail—are skipped on reload; this is recovery behavior, not an atomic-durability guarantee.
- **Sharing one file between writers:** the implementation has no inter-process locking. Use one live manager/process per file, and never edit a file while it is open. This follows from the synchronous append and rewrite paths rather than a concurrency contract.
- **Confusing CLI and SDK storage rules:** the CLI resolves `--session-dir`, then `PI_CODING_AGENT_SESSION_DIR`, then `sessionDir` in `settings.json`. Direct SDK calls do not read that precedence chain; pass `sessionDir` explicitly or accept the default.
- **Passing a project path to `listAll()`:** its first string argument is a storage directory. Use `list(cwd)` for one project or zero-argument `listAll()` for all default project directories.
- **Overriding `cwd` accidentally:** prefer the absolute `SessionInfo.path` returned by the list methods and let `open()` restore the header's working directory.

## Next

- [Chapter 10: Session Management](../ch10-session.md) explains the JSONL tree, compaction-aware projection, rewinds, and rewrite boundaries.
- [Reference: Configuration](../reference/configuration.md) lists the current session and resource settings.
