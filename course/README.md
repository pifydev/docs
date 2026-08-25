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
promised to be API-compatible with Pi. References labeled **Pi SDK 0.84.3**
describe the separately published production SDK release and only its verified
public exports.
