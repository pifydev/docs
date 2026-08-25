# Build Your Own Pi-style Agent Workshop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a cumulative, offline, deterministic TypeScript workshop with one focused Vitest file for each checkpoint `00` through `14`.

**Architecture:** Implement a small educational Agent stack in layers: protocols, event transport, message IR, deterministic model, provider adapter, Tool execution, Agent Loop, coding Tools, stateful Agent, Session Tree, Context Compaction, Resources and Extensions, runtime composition, and evaluation. The code uses only root dependencies and the root lockfile, isolates all filesystem effects in temporary directories, performs no network calls, and labels its APIs as course-only rather than Pi SDK-compatible.

**Tech Stack:** Node.js 22, TypeScript 6, Vitest 4, Node filesystem/process APIs, npm, Git.

---

## Plan boundaries

- Complete the Pi `0.84.3` foundation and SDK-doc plans first.
- Do not import unpublished Pi internals into `course/`.
- The workshop may compare behavior with Pi, but every export in `course/src/` belongs to the **Course implementation** namespace.
- Tests may create files only below a unique `mkdtemp()` directory and must remove that exact resolved directory in `afterEach` or `finally`.
- Process tests must launch `process.execPath` with argument arrays; do not depend on Bash, PowerShell, shell interpolation, or platform-specific utilities.
- Every checkpoint begins red, becomes green through the smallest cumulative implementation, and leaves all prior checkpoint tests passing.

## Task 1: Create the workshop test harness and CI contract

**Files:**

- Create: `course/README.md`
- Create: `course/tsconfig.json`
- Create: `course/fixtures/provider-tool-roundtrip.json`
- Create: `course/fixtures/eval-tasks.json`
- Modify: `package.json`
- Modify: `scripts/ci-config.test.mjs`
- Modify: `.github/workflows/content-quality.yml`
- Modify: `.github/workflows/deploy.yml`

- [ ] Add failing assertions to `scripts/ci-config.test.mjs` requiring both workflows to include `course/**` in push and pull-request path filters, and requiring `quality:content` to include `npm run test:course`.

- [ ] Run `node --test scripts/ci-config.test.mjs`. Expected result: red on the missing path filters and course command.

- [ ] Add these root scripts:

  ```json
  {
    "test:course": "vitest run course/test",
    "test:course:checkpoint": "vitest run"
  }
  ```

  Add `npm run test:course` to `quality:content` exactly once.

- [ ] Add `course/**` to both workflow path-filter lists. Keep workflows read-only and do not add a deployment credential or Vercel action.

- [ ] Create `course/tsconfig.json` extending `../tsconfig.json`, setting `noEmit: true`, and including only `src/**/*.ts` and `test/**/*.ts`.

- [ ] Create `course/README.md` that states the offline/no-key contract, Node 22 requirement, checkpoint commands, temporary-workspace rule, cumulative architecture, and the distinction between **Course implementation** and **Pi SDK 0.84.3**.

- [ ] Add deterministic JSON fixtures:

  - `provider-tool-roundtrip.json` contains a normalized assistant Tool call followed by a final text response;
  - `eval-tasks.json` contains at least one passing and one failing held-out task with IDs, prompts, expected public evidence, and no secrets or real file contents.

- [ ] Run `node --test scripts/ci-config.test.mjs` and `npm run typecheck`. Expected result: both pass.

- [ ] Commit the harness.

  ```bash
  git add course package.json .github/workflows scripts/ci-config.test.mjs
  git commit -m "test: scaffold offline Agent workshop"
  ```

## Task 2: Checkpoint 00 — follow one complete Agent trace

**Files:**

- Create: `course/test/00-complete-agent-trace.test.ts`
- Create: `course/src/demo/prologue.ts`
- Create: `course/src/index.ts`

- [ ] Write the focused test first. It must import `runPrologue()` and assert this exact event order: user message accepted, model stream opened, Tool call completed, Tool execution started, Tool result appended, second model stream opened, final text completed, Agent ended.

- [ ] Assert the trace links one stable Tool-call ID to the Tool result and returns `status: "completed"` with the final text `The sum is 42.`.

- [ ] Run `npm run test:course:checkpoint -- course/test/00-complete-agent-trace.test.ts`. Expected result: red because `runPrologue()` does not exist.

- [ ] Implement `runPrologue()` as a deliberately explicit deterministic trace with immutable records. It must perform no I/O and must not yet hide control flow behind the later Agent Loop.

- [ ] Export `runPrologue` from `course/src/index.ts`.

- [ ] Run the focused command again. Expected result: one passing test file.

- [ ] Commit Checkpoint 00.

  ```bash
  git add course/src/demo/prologue.ts course/src/index.ts course/test/00-complete-agent-trace.test.ts
  git commit -m "feat(course): add complete Agent trace"
  ```

## Task 3: Checkpoint 01 — define TypeScript protocols

**Files:**

- Create: `course/test/01-typescript-protocols.test.ts`
- Create: `course/src/protocol.ts`
- Modify: `course/src/index.ts`

- [ ] Write compile-time and runtime tests for discriminated contracts:

  - `CourseMessage` roles `user`, `assistant`, and `toolResult`;
  - assistant content blocks `text` and `toolCall`;
  - `CourseModelRequest`, `CourseModelChunk`, and `CourseModelResponse`;
  - `CourseTool` with `name`, `description`, `validate`, and async `execute`;
  - `AgentEvent` with stable `type`, `sequence`, and payload;
  - terminal `RunResult` statuses `completed`, `cancelled`, `maxSteps`, and `failed`.

- [ ] Add exhaustive-switch assertions using an `assertNever()` helper so an unhandled union member fails typecheck.

- [ ] Run the focused test. Expected result: red because the protocol exports do not exist.

- [ ] Implement readonly types, stable string IDs, and `assertNever()` in `course/src/protocol.ts`. Do not add runtime orchestration.

- [ ] Re-export the protocol surface from `course/src/index.ts`.

- [ ] Run the focused test and `npm run typecheck`. Expected result: both pass.

- [ ] Commit Checkpoint 01.

  ```bash
  git add course/src/protocol.ts course/src/index.ts course/test/01-typescript-protocols.test.ts
  git commit -m "feat(course): define Agent protocols"
  ```

## Task 4: Checkpoint 02 — implement EventStream

**Files:**

- Create: `course/test/02-event-stream.test.ts`
- Create: `course/src/event-stream.ts`
- Modify: `course/src/index.ts`

- [ ] Write tests for an `EventStream<TEvent, TResult>` that is both an `AsyncIterable<TEvent>` and exposes a `result` promise.

- [ ] Cover ordered delivery, a subscriber waiting before `push()`, buffered events pushed before iteration, exactly one `finish(result)`, `fail(error)` rejection, iterator cleanup on consumer return, and rejection of `push()` after terminal state.

- [ ] Use a controlled deferred promise instead of timer sleeps.

- [ ] Run the focused test. Expected result: red because `EventStream` does not exist.

- [ ] Implement `push`, `finish`, `fail`, `[Symbol.asyncIterator]`, and terminal-state guards. Ensure every pending iterator waiter is settled on finish or failure.

- [ ] Re-export `EventStream`; run the focused test and all previous checkpoint tests.

- [ ] Commit Checkpoint 02.

  ```bash
  git add course/src/event-stream.ts course/src/index.ts course/test/02-event-stream.test.ts
  git commit -m "feat(course): implement EventStream"
  ```

## Task 5: Checkpoint 03 — normalize the Message IR

**Files:**

- Create: `course/test/03-message-ir.test.ts`
- Create: `course/src/messages.ts`
- Modify: `course/src/index.ts`

- [ ] Write tests for constructors `userMessage()`, `assistantMessage()`, and `toolResultMessage()`, plus `validateTranscript()` and `textFromAssistant()`.

- [ ] Assert that a valid Tool round-trip requires a unique assistant `toolCall.id`, a matching later `toolResult.toolCallId`, and an identical Tool name. Reject duplicate IDs, orphan results, result-before-call order, empty Tool names, and non-object arguments.

- [ ] Assert serialization to JSON and back preserves the discriminants and IDs.

- [ ] Run the focused test. Expected result: red on missing message helpers.

- [ ] Implement pure constructors and transcript validation. Return structured validation errors with message index and code instead of throwing during inspection; constructors may throw on invalid direct input.

- [ ] Re-export the helpers; run checkpoint tests `00` through `03` and typecheck.

- [ ] Commit Checkpoint 03.

  ```bash
  git add course/src/messages.ts course/src/index.ts course/test/03-message-ir.test.ts
  git commit -m "feat(course): add validated Message IR"
  ```

## Task 6: Checkpoint 04 — add a deterministic scripted model

**Files:**

- Create: `course/test/04-deterministic-model.test.ts`
- Create: `course/src/scripted-model.ts`
- Modify: `course/src/index.ts`

- [ ] Write tests for `ScriptedModel`, constructed with a queue of response factories and exposing `stream(request, signal)`.

- [ ] Assert exact request capture, ordered text and Tool-call chunks, deterministic final response, queue replacement, queue append, call count, exhausted-queue failure code `SCRIPT_EXHAUSTED`, and cancellation before and during streaming.

- [ ] Use deferred gates to test in-flight cancellation; do not use wall-clock sleeps.

- [ ] Run the focused test. Expected result: red because `ScriptedModel` does not exist.

- [ ] Implement the queue, immutable request snapshots, abort checks before every chunk, and `EventStream<CourseModelChunk, CourseModelResponse>` output. Ensure exhausted responses fail closed rather than synthesizing success.

- [ ] Re-export the model; run checkpoint tests `00` through `04`.

- [ ] Commit Checkpoint 04.

  ```bash
  git add course/src/scripted-model.ts course/src/index.ts course/test/04-deterministic-model.test.ts
  git commit -m "feat(course): add deterministic scripted model"
  ```

## Task 7: Checkpoint 05 — adapt provider transport fixtures

**Files:**

- Create: `course/test/05-provider-adapter.test.ts`
- Create: `course/src/provider-adapter.ts`
- Modify: `course/src/index.ts`
- Read: `course/fixtures/provider-tool-roundtrip.json`

- [ ] Write tests for `FixtureProviderAdapter` converting transport records `response_start`, `text_delta`, `tool_call`, `response_end`, and `transport_error` into the course model stream.

- [ ] Assert delta order, one terminal response, usage normalization, stable Tool-call IDs, unknown-event rejection, missing-terminal rejection, duplicate-terminal rejection, cancellation, and no network API usage.

- [ ] Run the focused test. Expected result: red because the adapter does not exist.

- [ ] Implement a parser that accepts fixture records as `unknown`, validates every discriminant and payload, then pushes normalized chunks. Never cast unvalidated JSON directly to a protocol type.

- [ ] Load `provider-tool-roundtrip.json` through the test and prove the adapter produces the expected Tool call and final text.

- [ ] Re-export the adapter; run checkpoint tests `00` through `05` and typecheck.

- [ ] Commit Checkpoint 05.

  ```bash
  git add course/src/provider-adapter.ts course/src/index.ts course/test/05-provider-adapter.test.ts course/fixtures/provider-tool-roundtrip.json
  git commit -m "feat(course): add provider fixture adapter"
  ```

## Task 8: Checkpoint 06 — validate and execute Tools

**Files:**

- Create: `course/test/06-tool-contract.test.ts`
- Create: `course/src/tool.ts`
- Modify: `course/src/index.ts`

- [ ] Write tests for `ToolRegistry`, `defineTool()`, and `executeToolCall()`.

- [ ] Cover atomic registration, duplicate-name rejection, unknown Tool rejection, argument validation before side effects, successful structured output, Tool-thrown failure normalization, abort propagation, bounded text output, and preservation of `toolCallId` plus Tool name.

- [ ] Use a spy Tool to prove `execute` is not invoked when validation fails.

- [ ] Run the focused test. Expected result: red because the registry and executor do not exist.

- [ ] Implement a registry backed by a private map. `registerMany()` must validate the whole batch before mutating the map. `executeToolCall()` must return a `toolResult` message for expected Tool failures while propagating programmer errors only when the error is explicitly marked non-recoverable.

- [ ] Set one documented output cap in bytes or characters and test the truncation marker.

- [ ] Re-export the Tool surface; run checkpoint tests `00` through `06`.

- [ ] Commit Checkpoint 06.

  ```bash
  git add course/src/tool.ts course/src/index.ts course/test/06-tool-contract.test.ts
  git commit -m "feat(course): implement Tool contracts"
  ```

## Task 9: Checkpoint 07 — implement the Agent Loop

**Files:**

- Create: `course/test/07-agent-loop.test.ts`
- Create: `course/src/agent-loop.ts`
- Modify: `course/src/index.ts`

- [ ] Write tests for `runAgentLoop({ messages, model, tools, maxSteps, signal })` returning `EventStream<AgentEvent, RunResult>`.

- [ ] Cover a direct final answer, one Tool call followed by a second model request, multiple Tool calls in assistant order, Tool error returned to the model, cancellation during model streaming, cancellation during Tool execution, `maxSteps` termination, invalid transcript failure, and exact event sequence numbers.

- [ ] Assert each subsequent model request contains the assistant Tool call and matching Tool result in protocol order.

- [ ] Run the focused test. Expected result: red because the loop does not exist.

- [ ] Implement the loop with one owner of mutation, explicit stop-reason handling, abort checks at each effect boundary, and no recursive turn calls. Finish only after terminal events are pushed.

- [ ] Ensure `maxSteps` cannot be bypassed by Tool-heavy responses and zero/negative limits are rejected at construction.

- [ ] Re-export the loop; run checkpoint tests `00` through `07` and typecheck.

- [ ] Commit Checkpoint 07.

  ```bash
  git add course/src/agent-loop.ts course/src/index.ts course/test/07-agent-loop.test.ts
  git commit -m "feat(course): implement deterministic Agent Loop"
  ```

## Task 10: Checkpoint 08 — add safe coding Tools

**Files:**

- Create: `course/test/08-coding-tools.test.ts`
- Create: `course/src/coding-tools.ts`
- Modify: `course/src/index.ts`

- [ ] Write tests for `createReadTool(root)`, `createWriteTool(root)`, and `createNodeProcessTool(root)` using a unique temporary workspace.

- [ ] Cover relative-path success, `..` traversal rejection, absolute-path rejection, symlink escape rejection when supported, UTF-8 file size limits, atomic write behavior, bounded stdout/stderr, nonzero exit status, cancellation, timeout, and cleanup.

- [ ] Launch only `process.execPath` with an argument array and `cwd` fixed to the validated workspace. The Tool input accepts JavaScript source and arguments, not an arbitrary shell command.

- [ ] Run the focused test. Expected result: red because coding Tools do not exist.

- [ ] Implement canonical root resolution and a `resolveInsideRoot()` check that validates the final real parent path before read/write/process operations. Use a temporary sibling file plus rename for writes.

- [ ] Ensure every spawned process is terminated on abort/timeout and listeners are removed after exit.

- [ ] Re-export the Tools; run checkpoint tests `00` through `08` on Windows and typecheck.

- [ ] Commit Checkpoint 08.

  ```bash
  git add course/src/coding-tools.ts course/src/index.ts course/test/08-coding-tools.test.ts
  git commit -m "feat(course): add workspace-safe coding Tools"
  ```

## Task 11: Checkpoint 09 — wrap the loop in a stateful Agent

**Files:**

- Create: `course/test/09-stateful-agent.test.ts`
- Create: `course/src/agent.ts`
- Modify: `course/src/index.ts`

- [ ] Write tests for an `Agent` class with `prompt`, `continue`, `cancel`, `steer`, `followUp`, `subscribe`, `messages`, and `isRunning`.

- [ ] Cover prompt lifecycle, one active run at a time, busy rejection, immutable public state snapshots, cancellation, steering queued at the next safe boundary, follow-up queued after terminal completion, subscriber ordering, unsubscribe behavior, and recovery after a failed run.

- [ ] Run the focused test. Expected result: red because `Agent` does not exist.

- [ ] Implement the class as the single owner of transcript state. Serialize state changes, expose copied readonly snapshots, and clean the active controller in `finally` for every terminal path.

- [ ] Keep steering and follow-up behavior explicit and deterministic; do not silently merge queued user messages.

- [ ] Re-export `Agent`; run checkpoint tests `00` through `09` and typecheck.

- [ ] Commit Checkpoint 09.

  ```bash
  git add course/src/agent.ts course/src/index.ts course/test/09-stateful-agent.test.ts
  git commit -m "feat(course): add stateful Agent lifecycle"
  ```

## Task 12: Checkpoint 10 — persist a Session Tree

**Files:**

- Create: `course/test/10-session-tree.test.ts`
- Create: `course/src/session.ts`
- Modify: `course/src/index.ts`

- [ ] Write tests for append-only `SessionStore` records with header, entry ID, parent ID, timestamp, and message payload, plus `SessionTree` active-leaf operations.

- [ ] Cover new session creation, append order, branch from an earlier entry, active root-to-leaf reconstruction, inactive branch retention, JSONL reload, truncated final-line recovery, malformed middle-line failure, duplicate ID rejection, missing parent rejection, and atomic flush.

- [ ] Use a fresh temporary directory and explicit cleanup for every test.

- [ ] Run the focused test. Expected result: red because session modules do not exist.

- [ ] Implement durable append with one JSON object per line. Recovery may ignore only an incomplete final record; it must fail closed for corruption before the final line.

- [ ] Keep navigation and persistence separate: moving the in-memory leaf alone does not rewrite old records, and the next append records its chosen `parentId`.

- [ ] Re-export the session surface; run checkpoint tests `00` through `10`.

- [ ] Commit Checkpoint 10.

  ```bash
  git add course/src/session.ts course/src/index.ts course/test/10-session-tree.test.ts
  git commit -m "feat(course): add append-only Session Tree"
  ```

## Task 13: Checkpoint 11 — compact active context safely

**Files:**

- Create: `course/test/11-context-compaction.test.ts`
- Create: `course/src/context.ts`
- Modify: `course/src/index.ts`

- [ ] Write tests for `groupToolRounds()`, `estimateContextUnits()`, `selectCompactionBoundary()`, `compactContext()`, and `buildActiveContext()`.

- [ ] Cover preservation of complete assistant Tool-call/result groups, deterministic budget calculation, retention of system requirements and recent messages, summary insertion, no-op below threshold, insufficient-summary rejection, cancellation, and no mutation on failed compaction.

- [ ] Explicitly test that a Tool result is never retained without its calling assistant message and that a Tool call is never split from its results.

- [ ] Run the focused test. Expected result: red because context functions do not exist.

- [ ] Implement a deterministic summarizer interface supplied by the caller. Validate the summary and prospective context before appending a compaction record; if validation fails, preserve the old context unchanged.

- [ ] Re-export context helpers; run checkpoint tests `00` through `11` and typecheck.

- [ ] Commit Checkpoint 11.

  ```bash
  git add course/src/context.ts course/src/index.ts course/test/11-context-compaction.test.ts
  git commit -m "feat(course): add deterministic Context Compaction"
  ```

## Task 14: Checkpoint 12 — load Resources and Extensions

**Files:**

- Create: `course/test/12-resources-extensions.test.ts`
- Create: `course/src/resources.ts`
- Modify: `course/src/index.ts`

- [ ] Write tests for resource precedence, trusted roots, lazy Extension activation, hook ordering, atomic Tool registration, duplicate Extension IDs, activation failure rollback, disposal in reverse order, and rejection of paths outside trusted roots.

- [ ] Define `ResourceLoader`, `ExtensionDefinition`, `ExtensionContext`, and `ExtensionHost` as course-only contracts. Hooks may observe Agent events and register Tools but may not mutate internal maps directly.

- [ ] Run the focused test. Expected result: red because resource and Extension modules do not exist.

- [ ] Implement discovery as metadata-only and activation as an explicit later phase. Validate the complete activation contribution before committing it to the live registry.

- [ ] On partial activation failure, dispose resources already created by that Extension and leave the host registry unchanged.

- [ ] Re-export resource APIs; run checkpoint tests `00` through `12`.

- [ ] Commit Checkpoint 12.

  ```bash
  git add course/src/resources.ts course/src/index.ts course/test/12-resources-extensions.test.ts
  git commit -m "feat(course): add trusted Resources and Extensions"
  ```

## Task 15: Checkpoint 13 — compose the runtime

**Files:**

- Create: `course/test/13-runtime-composition.test.ts`
- Create: `course/src/runtime.ts`
- Modify: `course/src/index.ts`

- [ ] Write tests for `createCourseRuntime(options)` as the composition root returning `{ agent, session, tools, extensions, flush, dispose }`.

- [ ] Cover construction order, session resume, event-to-session persistence, one serialized host operation at a time, replacement of cwd-bound resources, subscription rebinding, flush-before-dispose, idempotent disposal, reverse cleanup order, construction rollback, and fail-closed replacement when the new runtime cannot be built.

- [ ] Run the focused test. Expected result: red because runtime composition does not exist.

- [ ] Implement the composition root with explicit ownership. Process-global dependencies are captured once; workspace-bound Tools, ResourceLoader, SessionStore, and Agent are rebuilt for the effective root.

- [ ] Keep the previous runtime live until the replacement is fully constructed and validated. Swap the reference atomically, then dispose the old runtime.

- [ ] Re-export runtime APIs; run checkpoint tests `00` through `13` and typecheck.

- [ ] Commit Checkpoint 13.

  ```bash
  git add course/src/runtime.ts course/src/index.ts course/test/13-runtime-composition.test.ts
  git commit -m "feat(course): compose the Agent runtime"
  ```

## Task 16: Checkpoint 14 — evaluate the Agent

**Files:**

- Create: `course/test/14-agent-evaluation.test.ts`
- Create: `course/src/eval.ts`
- Modify: `course/src/index.ts`
- Read: `course/fixtures/eval-tasks.json`

- [ ] Write tests for `runEvaluation()`, `compareEvaluations()`, deterministic judges, and JSON report serialization.

- [ ] Cover a fresh runtime per task/repetition, held-out fixture isolation, pass/fail/error verdicts, task failure versus infrastructure failure, baseline/candidate comparison, deterministic aggregate rates, stable task IDs, cancellation, bounded concurrency set to one by default, and safe reports that omit prompts, transcripts, Tool output, and file contents.

- [ ] Assert the report contains only task ID, run ID, candidate ID, verdict, public metrics, duration, and sanitized error code.

- [ ] Run the focused test. Expected result: red because eval APIs do not exist.

- [ ] Implement a judge interface with a deterministic default. A model-backed judge is represented only as an injected interface; the workshop must not contain credentials or a network implementation.

- [ ] Load `eval-tasks.json`, evaluate both passing and failing cases, and prove a repeated run produces the same verdict sequence and aggregate result.

- [ ] Re-export evaluation APIs; run all checkpoint tests and typecheck.

- [ ] Commit Checkpoint 14.

  ```bash
  git add course/src/eval.ts course/src/index.ts course/test/14-agent-evaluation.test.ts course/fixtures/eval-tasks.json
  git commit -m "feat(course): add deterministic Agent evaluation"
  ```

## Task 17: Verify the complete cumulative workshop

**Files:**

- Modify: `course/README.md`
- Verify: all files below `course/src/`, `course/test/`, and `course/fixtures/`

- [ ] Update `course/README.md` with a table mapping checkpoints `00` through `14` to their source file, focused test file, exact command, and expected outcome.

- [ ] Verify there are exactly 15 focused test files and the filenames match the approved checkpoint slugs.

- [ ] Run every focused test individually using the documented command. Each command must select exactly one file and pass without network access.

- [ ] Run the cumulative gates:

  ```bash
  npm run test:course
  npm run typecheck
  npm run lint:app
  npm run format:check
  git diff --check
  ```

  Expected result: all commands exit zero.

- [ ] Run the full workshop twice in succession. Expected result: identical test counts and no fixture or temporary-directory state leaking between runs.

- [ ] Search for unsafe or accidental dependencies:

  ```bash
  rg -n "fetch\\(|https?://|API_KEY|process\\.env|exec\\(|spawn\\([^,]+,\\s*\\{\\s*shell" course/src course/test
  ```

  Expected result: no network/secret usage and no shell-enabled process execution. Any source URL in comments must be removed; educational attribution belongs in README, not implementation comments.

- [ ] Confirm no lockfile exists below `course/`.

- [ ] Commit final workshop documentation corrections if needed.

  ```bash
  git add course package.json package-lock.json .github/workflows scripts/ci-config.test.mjs
  git commit -m "test: verify complete offline Agent workshop"
  ```

## Completion handoff

Proceed to `docs/superpowers/plans/2026-08-25-build-your-own-course-content.md` only after all 15 focused files pass offline, the cumulative suite is repeatable, and every checkpoint export is clearly course-owned.
