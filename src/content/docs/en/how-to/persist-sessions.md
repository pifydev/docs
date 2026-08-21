---
title: "How to persist sessions"
description: "Save a turn-by-turn conversation to disk, resume it later, and branch the history."
template: doc
sidebar:
  label: "Persist sessions"
  order: 4
---

This guide shows how to persist a conversation across runs. After it you will be able to start an agent, save the session, quit the process, and resume on the next run with full context restored.

:::tip[When you need this]
- A long-running task that must survive restarts
- A user who closes the laptop and reopens the project tomorrow
- A tree of conversations that branch from a shared point
:::

## The session model

A Pi session is a directory containing one JSONL file per turn and a `metadata.json` with the resolved model, the working directory, and the parent session id. The default location is `~/.pi/agent/sessions/`. You can override the root with `PI_HOME`.

## 1. Start a session

The agent loop accepts a `sessionId` option. If unset, the SDK generates a UUID.

```ts title="agent.ts"
import { agentLoop, getModel, Session } from "@pi-agent-core";
import { homedir } from "node:os";
import { join } from "node:path";

const sessionsRoot = join(homedir(), ".pi", "agent", "sessions");
const session = new Session({
  root: sessionsRoot,
  // No id: a new session is created on first save.
});

const model = getModel("anthropic", "claude-sonnet-4-5");

const events: unknown[] = [];
for await (const event of agentLoop({
  model,
  session,
  messages: [{ role: "user", content: "Start a refactor plan." }],
})) {
  events.push(event);
  if (event.type === "done") break;
}

await session.save(events);
console.log("saved as", session.id);
```

After the run, `~/.pi/agent/sessions/<id>/turn-0.jsonl` and `metadata.json` exist on disk.

## 2. Resume a session

On the next run, load the session by id:

```ts title="agent.ts" {4}
import { Session } from "@pi-agent-core";
import { join } from "node:path";
import { homedir } from "node:os";

const session = await Session.load({
  root: join(homedir(), ".pi", "agent", "sessions"),
  id: "a1b2c3-...", // the id from the previous run
});
```

`Session.load` reads `metadata.json` and the turn files, in order, and reconstructs the message history. The model and provider are restored from the metadata, not from `getModel`.

:::caution[Check the model is still available]
If the original model is no longer in your catalog, the resume fails. Pin the model with `Session.load({ ..., pinModel: true })` to keep using the original descriptor even if the catalog changes.
:::

## 3. Branch a session

Branching forks the conversation at a specific turn. The original session is unchanged; a new session is created with a `parentId`:

```ts title="agent.ts"
const branch = await Session.branch({
  root: sessionsRoot,
  parentId: "a1b2c3-...",
  fromTurn: 4, // copy turns 0..4 to the new session
  newId: "d4e5f6-...",
});

// branch.messages contains the copied turns.
// Subsequent writes go to branch, not to the parent.
```

The new session can diverge from turn 5 onward. The parent stays read-only.

## 4. Walk the tree

Sessions form a tree via `parentId`. To list a user's history:

```ts title="agent.ts"
import { listSessions } from "@pi-agent-core";

const all = await listSessions({ root: sessionsRoot });
for (const meta of all) {
  console.log(meta.id, meta.parentId, meta.title);
}
```

The CLI uses this to render the session picker.

## 5. Privacy and cleanup

Sessions are plain JSONL on disk. They contain every user message and every tool result. Before shipping a build that creates sessions, decide:

- Where the root lives (the default `~/.pi/agent/sessions` is fine for personal use; multi-user deployments want a per-user root)
- How long to keep them (Pi ships a retention setting; see [Reference: Configuration](/en/reference/configuration/))
- Whether to redact secrets before write (a `Session.redact` hook runs before each save)

```ts title="agent.ts"
const session = new Session({
  root: sessionsRoot,
  redact: (event) => {
    if (event.type === "tool_result" && event.output.includes("sk-")) {
      return { ...event, output: "[redacted]" };
    }
    return event;
  },
});
```

## Pitfalls

**Forgetting to call `save`**

Events are buffered in memory until you save. A crash before save loses the turn. Wrap the loop in `try/finally` and call `save` even on error.

**Writing to the wrong root**

The `root` option is per-`Session`. If you start a new `Session` with a different root by accident, the two halves of your conversation will not link.

**Loading a session with a different model version**

The Pi SDK may bump message shapes between minor versions. A session from 0.78 may not load on 0.84 if the schemas diverge. The session file includes a `schemaVersion` field; check it in your loader and surface a clear error on mismatch.

## Next

- [Chapter 10: Session Management](/en/ch10-session/) for the full session tree and metadata schema.
- [Reference: Configuration](/en/reference/configuration/#sessions) for the retention and redacting settings.
