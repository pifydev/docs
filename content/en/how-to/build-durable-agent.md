---
title: Build an experimental Durable Agent
description: Build a small Pi 0.99.2 Durable Agent host with correct recovery, replay, ownership, observation, and storage boundaries.
translation_key: how-to-build-durable-agent
language: en
official_refs:
  - "https://github.com/earendil-works/pi/blob/005af57d88ee23b33778f343a9595b32e67ff788/packages/durable/README.md"
  - "https://github.com/earendil-works/pi/blob/005af57d88ee23b33778f343a9595b32e67ff788/packages/durable/src/index.ts"
  - "https://github.com/earendil-works/pi/blob/005af57d88ee23b33778f343a9595b32e67ff788/packages/durable/src/harness/harness.ts"
  - "https://github.com/earendil-works/pi/blob/005af57d88ee23b33778f343a9595b32e67ff788/packages/durable/src/harness/types.ts"
  - "https://github.com/earendil-works/pi/blob/005af57d88ee23b33778f343a9595b32e67ff788/packages/durable/src/tasks.ts"
  - "https://github.com/earendil-works/pi/blob/005af57d88ee23b33778f343a9595b32e67ff788/packages/durable/src/storage/memory.ts"
  - "https://github.com/earendil-works/pi/blob/005af57d88ee23b33778f343a9595b32e67ff788/packages/durable/src/storage/sqlite/node.ts"
  - "https://github.com/earendil-works/pi/blob/005af57d88ee23b33778f343a9595b32e67ff788/packages/durable/src/storage/jsonl/node.ts"
  - "https://github.com/earendil-works/pi/blob/005af57d88ee23b33778f343a9595b32e67ff788/packages/chord/src/context/index.ts"
  - "https://github.com/earendil-works/pi/blob/005af57d88ee23b33778f343a9595b32e67ff788/packages/durable/package.json"
terms_used:
  - Harness
  - Conversation
  - Entry
  - Commit
  - Document
  - Task
  - Submission
  - Registry
status: reviewed
reviewed_by: Pify maintainers
last_updated: '2026-10-01'
---

# Build an experimental Durable Agent

> **Experimental.** `@earendil-works/pi-durable` can change without notice between releases. Pin its version, test recovery against the pinned version, and treat upgrades as migrations.

Pi Durable is a storage-backed agent harness. It commits conversations, model turns, Tool calls, and application state before publishing them, then resumes admitted work after a process restart. This guide builds the smallest useful host while preserving the boundaries that keep replay and cancellation correct.

## Status and when to use it

Use Durable when a run must survive a worker crash or planned restart, when transcript and application state must become visible atomically, or when child work needs explicit ownership. It is also useful for hosts that need a structural committed view rather than reconstructing state from transient callbacks.

Do not add it merely to wrap one short-lived model request, and do not mistake durability for exactly-once execution of external effects. The experimental package is not a mandatory replacement for Agent Core or `SessionManager`; those remain appropriate when their in-process agent loop and session tree are the contract you need. Durable is a separate runtime choice for persisted scheduling and recovery.

## Mental model: Harness, Conversation, and run

- A **Harness** owns one open storage and serializes atomic commits while scheduling durable work.
- A **Conversation** is a stateless handle to a transcript; compare handles by `id`. Its immutable **Entry** records include user input, assistant output, Tool results, system changes, reset markers, and application-defined kinds.
- A **Commit** is the publication unit. It may append Entries, update typed JSON **Document** state, and create a durable **Task** together.
- A Task is a checkpointed state machine. Each Task is owned by a Conversation or another Task, unless its Conversation is explicitly ownerless.
- A **Submission** is durably admitted input or a passive Entry write that the host can inspect, wait for, abort while queued, or reacquire by ID.
- A **Registry** supplies Tool definitions, Task definitions, system-prompt sections, hooks, and per-Conversation setup. New work uses the currently published Registry state.

A turn is one model response plus its Tool calls; a run spans every turn from an admitted input through its final answer. The Conversation is busy for that run, so later inputs cross the busy boundary through the inbox rather than racing the active turn.

Every asynchronous Durable call accepts a Chord `Context`. `BACKGROUND_CONTEXT` never cancels. Cancelling a wait cancels only that wait and never cancels the durable work; call `Submission.abort()`, `Conversation.abort()`, or `Harness.abortTask()` when cancellation of admitted work is actually intended. A task invocation receives its own bounded Context, so code should not retain invocation-bound handles after the invocation ends.

## Open an in-memory Harness

Start with `MemoryStorage` to learn the lifecycle and run deterministic tests. The following example is synchronized byte-for-byte with the compile-checked Pi `0.99.2` contract fixture. `createRegistry()` includes the built-in Durable tasks and Conversation setup; `createModels()` is deliberately unconfigured, so this example opens, configures, observes, and closes without provider or network access.

```ts
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { createModels } from "@earendil-works/pi-ai/models";
import {
  createRegistry,
  Harness,
  MemoryStorage,
  type Conversation,
} from "@earendil-works/pi-durable";

export async function verifyPi0992DurableContracts(): Promise<number> {
  const context = BACKGROUND_CONTEXT;
  const harness = await Harness.open(
    new MemoryStorage(),
    {
      models: createModels(),
      registry: createRegistry(),
    },
    context,
  );

  try {
    const root: Conversation = await harness.root(context);
    await root.setCompaction(
      {
        enabled: true,
        reserveTokens: 16_384,
        keepRecentTokens: 20_000,
        backgroundTokens: 32_768,
      },
      context,
    );
    const view = await root.viewState(context);
    try {
      void view.value;
    } finally {
      view.dispose();
    }
    return root.id;
  } finally {
    await harness.close(context);
  }
}
```

`Harness.open()` reconciles Tasks that were left `running` to recoverable pending work. `root()` creates reserved root ID `1` in one Commit if it does not exist, or returns the existing root after reopening. Always close in `finally`: closing seals admission, joins current Task invocations, and then closes storage, but it does not discard unfinished durable work.

## Submit input and commit immutable Entries

Configure a model and provider before a real submission. `submit()` first admits the input durably and returns a `Submission`; the built-in generation Task then appends the user Entry, calls the model, owns the Tool Tasks for that turn, and eventually settles the Submission as `done` or `unanswered`. This host-level pattern keeps admission separate from consuming the result:

```ts
import { AssistantEntry } from "@earendil-works/pi-durable";

const submission = await root.submit(
  {
    type: "input",
    content: "What is the capital of France?",
    requestId: "capital-france-1",
  },
  context,
);
const settled = await submission.wait(context);
if (settled.status === "done" && settled.type === "input") {
  const answer = await root.commit(
    (tx) => tx.entry(AssistantEntry, settled.answer),
    context,
  );
  console.log(answer?.model?.[0]);
}
```

Entries never change after publication. A Commit is atomic: an observer sees either all newly committed Entries, Documents, and Tasks or none of them. No UI, event adapter, or worker should publish intermediate transaction state before storage accepts the Commit.

The sample intentionally writes another `AssistantEntry` to demonstrate typed Entry creation; a production UI would normally render the assistant Entry already committed by the generation Task instead of duplicating it.

## Persist Documents and Tasks atomically

A Document is typed JSON state stored beside transcripts. Use `defineDoc()` or `defineDocFamily()` to declare its kind, version, scope, history behavior, fork behavior, and initializer. Update it only through a Commit and read it through snapshots or attached Document state. Choose `history: "rewindable"` only when historical snapshots are required; `latest` avoids retaining old content.

Create an Entry, edit a Document, and create a Task in the same transaction when they describe one business transition. For example, an accepted job can append the audit Entry, change the job Document, and create its processing Task together; if any operation fails, no part is stored. A Conversation Commit supplies that Conversation as the default owner for Tasks, while an explicit Task ownership links child work to its parent.

Define application Tasks with `defineTask()`, register them before recovery, and make every phase commit its next checkpoint or terminal outcome. A waiting state names the child Task IDs to join and selects `allSettled` or `failFast`; a completed Task remains `completing` until ordinary work it owns drains. This is durable structured concurrency rather than a detached Promise queue.

## Recover work and deduplicate requests

After a crash or orderly close, persistent storage retains admitted Entries, Documents, Submissions, and unfinished Tasks; reopen the same backend, start the scheduler, and explicitly resume it with `resume()`. `submit()`, `Submission.wait()`, `waitForTask()`, and idle waits also resume scheduling automatically.

Use a stable `requestId` whenever a retried host may submit the same request; within one Conversation it returns the existing Submission and does not start a second run. Keep the ID in the caller's durable record, because changing it after a timeout defeats deduplication. The ID scopes to a Conversation; it is not a global idempotency key for an external service.

Persist a `Submission.id` when a caller will reconnect. `harness.submission(id, context)` reacquires it after reopening, and `status()` observes without waiting. If a Task definition is missing, too old, or fails migration, `inspect()` exposes blocked work; do not silently treat that state as success.

## Declare Tool replay policy

A Tool call is itself a durable Task. Its intent is committed before `execute()` runs, but only a Tool declared with `replay: "safe"` may rerun after an interruption. The default is `unsafe`; recovery converts an interrupted unsafe call into an error Tool result and preserves the output committed so far. Mark a Tool safe only when its whole execution is repeatable or it performs its own durable idempotency protocol.

Suppose a Tool charged a card, then the process had a crash before the success was recorded; persistence of the Tool intent cannot make that side effect safe because replay could charge the card again. Use a stable provider idempotency key and reconcile the provider result, or keep `replay` unsafe and require explicit recovery. Storing more local state does not manufacture an exactly-once guarantee for an arbitrary remote effect.

`api.output()`, `api.details()`, diagnostics, and Tool result usage are committed while execution proceeds. A thrown error becomes an error result for the model. Returning `control.terminate` can end a run, while a handoff requests a reset; neither changes the replay classification of the Tool's external effects.

## Schedule the inbox and reset context

While a Conversation is busy, the `pi.inbox` Document makes ordering explicit. A default `followUp` waits for the final answer and starts the next run; `steer` acts as a controlled interrupt only after the current Tool round and joins the active run; `reject` throws `ConversationBusy` and writes nothing; a `write` appends an Entry without invoking the model. Follow-up and steering modes can place one queued item or all queued items at a boundary. If a run fails, queued items remain until a later submission places them, oldest first.

`Submission.abort()` only withdraws queued input; it cannot retract an item already placed. A queued write stays when `Conversation.abort()` withdraws queued inputs. Model these distinctions in the host UI instead of displaying every abort button as equivalent.

`reset(handoff, context)` submits a `pi.reset` Entry. The model context begins at that marker and optionally receives the handoff as a user message, but older Entries remain stored. A reset queued during busy work is placed at a boundary; if placed during a Tool round, it ends the current run.

## Compact without losing durable work

Compaction changes model context, not durable history. It summarizes older active Entries into a `pi.compaction` head marker and retains the source Entries in storage. `keepRecentTokens` estimates what remains verbatim, `reserveTokens` establishes the blocking threshold below the model context window, and `backgroundTokens` starts earlier background work; setting it to zero disables only background compaction.

When background compaction is not ready at the threshold, generation performs blocking compaction before the request. Summarization usage contributes to spend in `pi.usage`. On a provider context overflow, generation compacts and retries once; this is a narrow retry boundary, not permission to replay completed Tool side effects.

Manual `compact()` returns a Task ID. Its summary runs while the Conversation works and is placed immediately when idle or at the next turn boundary when busy. Multiple in-flight summaries can become `stale`, so only a summary with a valid cut is applied. `beforeCompact` may decline compaction or provide a summary; running attempts and retry backoff remain visible in `pi.live`.

## Observe views, events, and hooks

Use `viewState()` for committed structural state and dispose its attached state when finished. Use `watch()` when the consumer must receive each exact frame with the Chord operations of that Commit in serialized callback order; it starts at the current view and does not replay old frames. The agent event adapter is **Experimental**: `watchEvents()` derives coding-agent-style events from those commits and starts from a snapshot rather than an event-history log.

Both streams are bounded. A slow structural watch keeps at most 100 pending frames before replacing them with one newest full-view frame; a slow event stream similarly emits a fresh snapshot after 100 pending batches. Partial model and Tool output is committed at most every 100 ms, so the newest partial window can be lost in a crash even though prior commits remain valid.

Hooks run within a built-in Task's defined phase, not as a global event bus. Generation hooks cover request preparation, responses, final yields, and completed Tool rounds; Tool hooks can block or rewrite arguments and replace results; the compaction hook can decline or supply a summary. Register a hook with `scope: { conversationId }`, and add `subtree: true` only when the hook scope should include Conversations transitively owned by that Conversation's Tasks.

## Fork conversations and structure subagents

A `fork(entryId, options, context)` creates a new Conversation whose branch ancestry exposes the parent's Entries through that Entry ID. The child then advances independently and starts with the parent's Conversation settings as of the fork point. Fork-aware Entry scans walk this ancestry, so do not copy the visible transcript into a second application log as though it had no parent.

Create a subagent Conversation inside the owning Tool or Task Commit and set `ownership: { kind: "task", taskId }`. On replay, query by owner before creating it again, and give child submissions stable request IDs. This makes child discovery, admission, and recovery deterministic without an uncommitted in-memory map.

Ownership is transitive: a Conversation owned by a child Task belongs to the same ordinary ownership scope. Ownerless Conversations instead contribute to Harness-wide idle waits and need an explicit host lifecycle.

## Choose foreground or background ownership

Foreground children belong to the parent, keep it busy, and must join before it becomes terminal; this is structured concurrency. A background Task establishes independent ownership, does not keep the parent busy, and allows its owned subtree to survive an ordinary parent abort.

A background Task is an abort boundary. Ordinary abort stops non-background owned work, whereas `abort(context, { background: true })` crosses existing background boundaries too. Abort proceeds bottom-up: owned Conversations and child Tasks settle first, then the owner's abort handler runs, so each Task can undo its own effects after its descendants stop.

Use foreground ownership when a Tool must return the child's answer and failure should cancel the child. Use a background anchor Task for persistent subagents or reporters whose lifecycle outlasts one run. The host must expose a separate stop operation for that background work and wait for it during final shutdown.

## Track usage and choose storage

Each Conversation's `pi.usage` records model totals by `provider/model` and Tool-reported totals by Tool name; failed and aborted attempts count. `harness.usage(context)` sums committed usage across the Session. Treat cost or spend limits as host policy: check committed totals and enforce admission instead of assuming a provider cancellation will erase already incurred usage.

`MemoryStorage` is fast and deterministic but loses everything when the process ends; `openNodeSqliteStorage(file)` persists one database file and is the practical general-purpose Node option; `openNodeJsonlStorage(directory, context, options)` keeps append-only files that are easy to inspect but require directory lifecycle discipline. All three implement the same atomic storage contract, not the same failure durability.

Node SQLite uses WAL with `synchronous = NORMAL`: commits survive process crashes, but the newest commit can be lost on a power or host failure. Node JSONL can use `fsync: true` to flush before each commit marker, trading throughput for a stronger power-loss boundary. These are release-specific backend properties, not universal database guarantees.

Exactly one process owns a storage at a time; there is no cross-process locking supplied by Durable. Do not open the same SQLite file or JSONL directory from competing workers, even though SQLite exposes its own busy timeout. Use process-level routing or a single storage-owning service if several clients need access.

## Failure modes and operational checklist

Before serving traffic, verify `requestId` stability, review every Tool replay declaration, pass a Chord `Context` to every async call, await close during shutdown, and enforce one process per storage. Also exercise the following cases without a provider network dependency:

- Kill the process after admission, during generation, and during a Tool call; reopen the same backend, resume, and observe the original Submission.
- Prove unsafe Tools produce an interrupted result while safe Tools use an external idempotency key or a local transactional protocol.
- Cancel a wait and show that the Task continues; separately abort the Submission, Task, foreground Conversation, and background scope.
- Commit an Entry, Document change, and Task together, then verify observers never see a partial combination.
- Retry one stable request ID and prove it resolves to the existing Submission rather than a second run.
- Queue steer, follow-up, reject, write, and reset operations while busy and verify their placement boundaries.
- Force threshold and overflow compaction, count summarization usage, and preserve old Entries in storage.
- Attach late and slow view/event consumers, handle replacement snapshots, and dispose or stop watchers.
- Restart with a missing or newer Task definition, inspect blocked work, and provide an explicit migration or abort policy.
- Fork a Conversation and verify parent history, fork-local settings, and independent advancement.
- Abort nested foreground work and verify bottom-up settlement; prove ordinary parent abort does not cross a background Task boundary.
- Test backend-specific crash and power-loss expectations, guard filesystem permissions, retain backups where needed, and never share one storage between processes.

Log IDs, Task kinds, phases, outcomes, and retry decisions, but redact prompt content, Tool arguments, credentials, and Document fields that may contain secrets. A durable transcript is still sensitive application data.

## Release-pinned sources

The exact tag source is the source of truth for API and behavior in this guide. The release pages are historical context for the three releases that introduced and refined the package; neither a moving branch nor an unversioned documentation page overrides the pinned code.

- [`packages/durable/README.md`](https://github.com/earendil-works/pi/blob/005af57d88ee23b33778f343a9595b32e67ff788/packages/durable/README.md)
- [`packages/durable/src/index.ts`](https://github.com/earendil-works/pi/blob/005af57d88ee23b33778f343a9595b32e67ff788/packages/durable/src/index.ts)
- [`packages/durable/src/harness/harness.ts`](https://github.com/earendil-works/pi/blob/005af57d88ee23b33778f343a9595b32e67ff788/packages/durable/src/harness/harness.ts)
- [`packages/durable/src/harness/types.ts`](https://github.com/earendil-works/pi/blob/005af57d88ee23b33778f343a9595b32e67ff788/packages/durable/src/harness/types.ts)
- [`packages/durable/src/tasks.ts`](https://github.com/earendil-works/pi/blob/005af57d88ee23b33778f343a9595b32e67ff788/packages/durable/src/tasks.ts)
- [`packages/durable/src/storage/memory.ts`](https://github.com/earendil-works/pi/blob/005af57d88ee23b33778f343a9595b32e67ff788/packages/durable/src/storage/memory.ts)
- [`packages/durable/src/storage/sqlite/node.ts`](https://github.com/earendil-works/pi/blob/005af57d88ee23b33778f343a9595b32e67ff788/packages/durable/src/storage/sqlite/node.ts)
- [`packages/durable/src/storage/jsonl/node.ts`](https://github.com/earendil-works/pi/blob/005af57d88ee23b33778f343a9595b32e67ff788/packages/durable/src/storage/jsonl/node.ts)
- [`packages/chord/src/context/index.ts`](https://github.com/earendil-works/pi/blob/005af57d88ee23b33778f343a9595b32e67ff788/packages/chord/src/context/index.ts)
- [`packages/durable/package.json`](https://github.com/earendil-works/pi/blob/005af57d88ee23b33778f343a9595b32e67ff788/packages/durable/package.json)
- [Release commit `005af57d88ee23b33778f343a9595b32e67ff788`](https://github.com/earendil-works/pi/commit/005af57d88ee23b33778f343a9595b32e67ff788)
- [Pi `v0.99.0` release](https://github.com/earendil-works/pi/releases/tag/v0.99.0)
- [Pi `v0.99.1` release](https://github.com/earendil-works/pi/releases/tag/v0.99.1)
- [Pi `v0.99.2` release](https://github.com/earendil-works/pi/releases/tag/v0.99.2)
