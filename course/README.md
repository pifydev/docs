# Build Your Own Pi-style Agent workshop

This directory contains a cumulative TypeScript workshop for learning how an
Agent stack works from protocols through evaluation. It runs entirely offline:
the exercises make no provider network calls and require no API key, account,
or paid model. Use Node.js 22 and the repository's root dependencies and
lockfile; do not create a separate package or lockfile below `course/`.

## Run the workshop

Install dependencies once from the repository root, then run either the full
suite or one explicit checkpoint:

```bash
npm ci
npm run test:course
npm run test:course:checkpoint -- course/test/04-deterministic-model.test.ts
```

`npm run test:course` runs every completed checkpoint. The checkpoint command
must always receive one explicit `course/test/*.test.ts` path so it selects only
that checkpoint.

Checkpoint 00 is the first focused workshop test. Each later checkpoint adds
one test file, so the completed workshop has exactly the planned 15 focused
checkpoint test files.

## Checkpoint map

Run these commands from the repository root. Every focused command selects one
test file and runs offline.

| Checkpoint | Primary source                   | Focused test                                  | Exact command                                                                   | Expected outcome                                                               |
| ---------- | -------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 00         | `course/src/demo/prologue.ts`    | `course/test/00-complete-agent-trace.test.ts` | `npm run test:course:checkpoint -- course/test/00-complete-agent-trace.test.ts` | One file passes and proves the complete immutable Agent trace.                 |
| 01         | `course/src/protocol.ts`         | `course/test/01-typescript-protocols.test.ts` | `npm run test:course:checkpoint -- course/test/01-typescript-protocols.test.ts` | One file passes and proves the readonly TypeScript protocol contracts.         |
| 02         | `course/src/event-stream.ts`     | `course/test/02-event-stream.test.ts`         | `npm run test:course:checkpoint -- course/test/02-event-stream.test.ts`         | One file passes and proves ordered events plus one terminal result.            |
| 03         | `course/src/messages.ts`         | `course/test/03-message-ir.test.ts`           | `npm run test:course:checkpoint -- course/test/03-message-ir.test.ts`           | One file passes and proves normalized messages and Tool linkage.               |
| 04         | `course/src/scripted-model.ts`   | `course/test/04-deterministic-model.test.ts`  | `npm run test:course:checkpoint -- course/test/04-deterministic-model.test.ts`  | One file passes and proves deterministic streaming and cancellation.           |
| 05         | `course/src/provider-adapter.ts` | `course/test/05-provider-adapter.test.ts`     | `npm run test:course:checkpoint -- course/test/05-provider-adapter.test.ts`     | One file passes and proves validated offline provider-fixture adaptation.      |
| 06         | `course/src/tool.ts`             | `course/test/06-tool-contract.test.ts`        | `npm run test:course:checkpoint -- course/test/06-tool-contract.test.ts`        | One file passes and proves atomic Tool registration and bounded execution.     |
| 07         | `course/src/agent-loop.ts`       | `course/test/07-agent-loop.test.ts`           | `npm run test:course:checkpoint -- course/test/07-agent-loop.test.ts`           | One file passes and proves the deterministic Agent Loop lifecycle.             |
| 08         | `course/src/coding-tools.ts`     | `course/test/08-coding-tools.test.ts`         | `npm run test:course:checkpoint -- course/test/08-coding-tools.test.ts`         | One file passes and proves workspace-safe file and Node process Tools.         |
| 09         | `course/src/agent.ts`            | `course/test/09-stateful-agent.test.ts`       | `npm run test:course:checkpoint -- course/test/09-stateful-agent.test.ts`       | One file passes and proves stateful prompts, queues, events, and cancellation. |
| 10         | `course/src/session.ts`          | `course/test/10-session-tree.test.ts`         | `npm run test:course:checkpoint -- course/test/10-session-tree.test.ts`         | One file passes and proves durable append-only Session Tree behavior.          |
| 11         | `course/src/context.ts`          | `course/test/11-context-compaction.test.ts`   | `npm run test:course:checkpoint -- course/test/11-context-compaction.test.ts`   | One file passes and proves deterministic, Tool-safe Context Compaction.        |
| 12         | `course/src/resources.ts`        | `course/test/12-resources-extensions.test.ts` | `npm run test:course:checkpoint -- course/test/12-resources-extensions.test.ts` | One file passes and proves trusted Resources and atomic Extensions.            |
| 13         | `course/src/runtime.ts`          | `course/test/13-runtime-composition.test.ts`  | `npm run test:course:checkpoint -- course/test/13-runtime-composition.test.ts`  | One file passes and proves runtime ownership, replacement, and disposal.       |
| 14         | `course/src/eval.ts`             | `course/test/14-agent-evaluation.test.ts`     | `npm run test:course:checkpoint -- course/test/14-agent-evaluation.test.ts`     | One file passes and proves deterministic evaluation and safe reports.          |

## Workshop contract

The workshop is one cumulative architecture. Each checkpoint adds a focused
layer—protocols, event transport, message IR, deterministic model, provider
adapter, Tools, Agent Loop, coding Tools, state, sessions, compaction,
extensions, runtime composition, then evaluation—without breaking earlier
checkpoint tests.

All filesystem tests must create a unique workspace with `mkdtemp()`. They may
write only below that workspace and must remove that exact resolved directory
in `afterEach` or `finally`, including when an assertion or operation fails.
Process tests must use `process.execPath` with argument arrays and must not use
shell interpolation or platform-specific utilities.

Exports under `course/src/` are the **Course implementation**: simplified,
educational APIs owned by this workshop. They are not Pi APIs and are not
promised to be API-compatible with Pi. References labeled **Pi SDK 0.87.1**
describe the separately published production SDK release and only its verified
public exports.
