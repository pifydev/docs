# Build Your Own Pi-style Agent Course Content Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish an original, full-depth bilingual course overview and checkpoints `00` through `14`, each tied to the tested workshop implementation and clearly distinguished from Pi SDK `0.84.3`.

**Architecture:** Add a separate localized Fumadocs group after the SDK chapters and before Help. Every checkpoint follows one editorial contract, links to its exact workshop module and focused test, uses original Pify prose and visuals, and has a structurally equivalent Vietnamese pair. A dedicated content-contract test prevents missing checkpoint sections, incorrect source/test links, and accidental per-page `pi-textbook` attribution.

**Tech Stack:** Fumadocs Markdown/MDX, Mermaid, TypeScript code examples, Node.js content tests, preservation manifest, bilingual editorial lint.

---

## Plan boundaries

- Complete and verify all workshop checkpoints first. Documentation must describe the code that actually passes, not a planned interface.
- The final translation contract is 43 EN/VI pairs and 86 public files.
- Course pages are original Pify works under the repository's `GPL-3.0-only` license. Do not copy or translate `pi-textbook` prose, diagrams, code, labs, checkpoint history, or distinctive expression.
- Do not add `pi-textbook` metadata, source URLs, adaptation notices, license banners, author notices, or commit notices to individual course pages.
- Every checkpoint uses the visible labels **Course implementation** and **Pi SDK 0.84.3**.

## Shared checkpoint page contract

Every English and Vietnamese checkpoint page must contain these ten sections in the same heading-depth order:

1. `Outcome` / localized equivalent;
2. `Prerequisites`;
3. `Mechanism`;
4. `Trace or model` with an original Mermaid diagram, timeline, or precise table when useful;
5. `Build it`, naming the exact cumulative workshop file;
6. `Run the focused test`, naming the exact test file and command;
7. `Failure experiment`;
8. `Acceptance criteria`;
9. `Compare with Pi SDK 0.84.3`;
10. `Next checkpoint`.

Code fences, diagram blocks, tables, callouts, commands, filenames, and identifiers must match between locales.

## Task 1: Register the course group with red content tests

**Files:**

- Create: `scripts/course-content.test.mjs`
- Modify: `package.json`
- Modify: `scripts/content.test.mjs`
- Modify: `scripts/validate-content.mjs`
- Modify: `content/translation-manifest.json`
- Modify: `content/en/meta.json`
- Modify: `content/vi/meta.json`
- Create: `content/en/course/meta.json`
- Create: `content/vi/course/meta.json`

- [ ] Add 16 expected translation keys to `scripts/content.test.mjs` and `scripts/validate-content.mjs`: `course-overview` plus `course-00-complete-agent-trace` through `course-14-agent-evaluation` using the approved slugs.

- [ ] Change exact pair counts from 27 to 43 and add `course` to the validator's allowed metadata directories.

- [ ] Define the root navigation in this exact placement: Chapter 11, localized course separator, `course`, localized Help separator. Do not flatten checkpoint filenames into root metadata.

- [ ] Define `course/meta.json` order as `index`, then checkpoint slugs `00` through `14`. Localize only the group title; keep filenames stable.

- [ ] Write `scripts/course-content.test.mjs` to assert:

  - all 32 localized public files exist;
  - each checkpoint has the shared ten-section heading shape;
  - each page names its exact `course/src/` module and `course/test/NN-*.test.ts` file;
  - each focused command selects that exact test file;
  - both required labels are present;
  - EN/VI fence languages, Mermaid counts, tables, and local links match;
  - no course page contains `pi-textbook`, `translated and adapted`, `source_commit`, or a per-page license banner.

- [ ] Add `scripts/course-content.test.mjs` to the explicit `test:content` Node test list in `package.json`.

- [ ] Run `npm run test:content`. Expected result: red because the manifest, navigation, and course files are missing.

- [ ] Add all 16 manifest entries with `group: "course"`, identical EN/VI paths, and no `zh` field. Add localized root and course metadata.

- [ ] Run `npm run test:content` again. Expected result: failures now identify the missing public course files and content contracts.

- [ ] Commit the red course scaffold.

  ```bash
  git add scripts/course-content.test.mjs scripts/content.test.mjs scripts/validate-content.mjs package.json content/translation-manifest.json content/en/meta.json content/vi/meta.json content/en/course/meta.json content/vi/course/meta.json
  git commit -m "test: register bilingual Agent course"
  ```

## Task 2: Write and translate the course overview

**Files:**

- Create: `content/en/course/index.mdx`
- Create: `content/vi/course/index.mdx`

- [ ] Add reviewed frontmatter with `translation_key: course-overview`, correct `language`, description, review date, translator, reviewer, and no source/adaptation metadata.

- [ ] Write the English overview with:

  - who the course is for and what learners build;
  - explicit educational/unofficial/no-API-compatibility boundaries;
  - prerequisite Node 22, TypeScript, async iteration, and testing knowledge;
  - offline/no-key/no-network guarantee;
  - cumulative architecture map from protocol to evaluation;
  - a checkpoint table with outcome, source module, focused test, and prerequisite for all 15 checkpoints;
  - workshop setup and exact `npm run test:course` commands;
  - guidance for reading **Course implementation** versus **Pi SDK 0.84.3** callouts;
  - learning workflow: read, run red experiment, implement/inspect, run green test, compare with SDK;
  - final completion criteria.

- [ ] Add one original Mermaid dependency graph for checkpoints `00` through `14` without reproducing any source diagram.

- [ ] Produce the Vietnamese overview with identical structure, table rows, diagram nodes, commands, and technical depth.

- [ ] Run `npm run lint:sync`, `npm run lint:mermaid`, `npm run lint:frontmatter`, and the course-content test. Expected result: only checkpoint pages remain red.

- [ ] Commit the overview pair.

  ```bash
  git add content/en/course/index.mdx content/vi/course/index.mdx
  git commit -m "docs: add bilingual Agent course overview"
  ```

## Task 3: Write checkpoints 00 through 03

**Files:**

- Create: `content/en/course/00-complete-agent-trace.md`
- Create: `content/en/course/01-typescript-protocols.md`
- Create: `content/en/course/02-event-stream.md`
- Create: `content/en/course/03-message-ir.md`
- Create: matching files under `content/vi/course/`
- Read: `course/src/demo/prologue.ts`
- Read: `course/src/protocol.ts`
- Read: `course/src/event-stream.ts`
- Read: `course/src/messages.ts`
- Read: focused tests `course/test/00-*.test.ts` through `course/test/03-*.test.ts`

- [ ] Create reviewed frontmatter for each English page with matching translation key, `language: en`, checkpoint number, current review date, translator, reviewer, and release-pinned Pi references only when the comparison section needs them.

- [ ] Checkpoint 00 must teach one complete user → model → Tool → model → final response trace, stable Tool-call/result linkage, event order, and terminal status. Its failure experiment changes the Tool result ID and observes the trace invariant fail.

- [ ] Checkpoint 01 must teach discriminated unions, readonly boundaries, exhaustive switching, stable IDs, terminal result types, and why protocol types precede classes. Its failure experiment adds an unhandled union member and runs typecheck.

- [ ] Checkpoint 02 must teach an `AsyncIterable` event channel plus terminal result promise, producer/consumer backpressure boundary, buffered and waiting consumers, finish/fail semantics, and waiter cleanup. Its failure experiment pushes after terminal state.

- [ ] Checkpoint 03 must teach the normalized Message IR, assistant content blocks, Tool-call/result protocol, validation errors, and JSON round-trip. Its failure experiment creates an orphan Tool result.

- [ ] Add original diagrams: a sequence diagram for 00, protocol boundary diagram for 01, producer/consumer timeline for 02, and valid/invalid Tool-round graph for 03.

- [ ] Include exact workshop excerpts that compile as written, but avoid dumping an entire source module when a focused fragment explains the mechanism.

- [ ] Translate all four pages completely into Vietnamese. Preserve code, IDs, filenames, commands, graph topology, warnings, and acceptance criteria.

- [ ] Run focused course-content tests, sync, Mermaid, editorial lint, and all workshop tests `00` through `03`.

- [ ] Commit the first checkpoint batch.

  ```bash
  git add content/en/course/00-complete-agent-trace.md content/en/course/01-typescript-protocols.md content/en/course/02-event-stream.md content/en/course/03-message-ir.md content/vi/course/00-complete-agent-trace.md content/vi/course/01-typescript-protocols.md content/vi/course/02-event-stream.md content/vi/course/03-message-ir.md
  git commit -m "docs(course): add checkpoints 00 through 03"
  ```

## Task 4: Write checkpoints 04 through 07

**Files:**

- Create: `content/en/course/04-deterministic-model.md`
- Create: `content/en/course/05-provider-adapter.md`
- Create: `content/en/course/06-tool-contract.md`
- Create: `content/en/course/07-agent-loop.md`
- Create: matching files under `content/vi/course/`
- Read: corresponding `course/src/` modules and focused tests `04` through `07`

- [ ] Checkpoint 04 must explain scripted response factories, request capture, chunk ordering, queue exhaustion, abort boundaries, and deterministic test doubles. Its failure experiment requests one response beyond the queue.

- [ ] Checkpoint 05 must separate untrusted transport records from normalized model chunks, validate unknown JSON, normalize usage and Tool IDs, enforce exactly one terminal event, and avoid networking. Its failure experiment removes `response_end` from the fixture.

- [ ] Checkpoint 06 must explain Tool definition, validation before effects, atomic registration, bounded output, cancellation, recoverable Tool errors, and Tool-result linkage. Its failure experiment sends invalid arguments to a spy Tool and proves no side effect occurred.

- [ ] Checkpoint 07 must teach the iterative Agent Loop, transcript ownership, Tool round-trips, multiple Tool calls, stop reasons, `maxSteps`, cancellation, and total event ordering. Its failure experiment sets a one-step budget for a response requiring a Tool continuation.

- [ ] Add original diagrams: scripted queue timeline for 04, transport trust boundary for 05, validate→execute→normalize flow for 06, and Loop state machine for 07.

- [ ] In every Pi comparison, name only verified `0.84.3` public exports. Explicitly label simplified workshop behavior when Pi has richer usage, provider, event, or Tool contracts.

- [ ] Produce full Vietnamese pairs and run course-content, sync, Mermaid, editorial, and workshop tests `00` through `07`.

- [ ] Commit the second checkpoint batch.

  ```bash
  git add content/en/course/04-deterministic-model.md content/en/course/05-provider-adapter.md content/en/course/06-tool-contract.md content/en/course/07-agent-loop.md content/vi/course/04-deterministic-model.md content/vi/course/05-provider-adapter.md content/vi/course/06-tool-contract.md content/vi/course/07-agent-loop.md
  git commit -m "docs(course): add checkpoints 04 through 07"
  ```

## Task 5: Write checkpoints 08 through 11

**Files:**

- Create: `content/en/course/08-coding-tools.md`
- Create: `content/en/course/09-stateful-agent.md`
- Create: `content/en/course/10-session-tree.md`
- Create: `content/en/course/11-context-compaction.md`
- Create: matching files under `content/vi/course/`
- Read: corresponding `course/src/` modules and focused tests `08` through `11`

- [ ] Checkpoint 08 must explain workspace confinement, canonical paths, traversal and symlink defenses, atomic writes, bounded process output, cancellation, timeout, and platform-neutral `process.execPath`. Its failure experiment attempts `../outside.txt` and verifies no file appears outside the temp root.

- [ ] Checkpoint 09 must explain the stateful Agent lifecycle, busy guard, immutable snapshots, subscriber cleanup, cancellation, steering safe points, follow-up sequencing, and failure recovery. Its failure experiment issues two concurrent prompts.

- [ ] Checkpoint 10 must explain append-only JSONL, parent-linked entries, active leaf, branching, root-to-leaf projection, truncated-last-line recovery, middle corruption rejection, and atomic flush. Its failure experiment truncates the final record and then corrupts a middle record to compare recoverable and fatal cases.

- [ ] Checkpoint 11 must explain grouped Tool rounds, deterministic context budgeting, compaction boundaries, summary validation, recent-message retention, cancellation, and no mutation on failure. Its failure experiment tries to split a Tool call from its result.

- [ ] Add original visuals: confinement boundary for 08, Agent lifecycle state machine for 09, Session Tree for 10, and compaction before/after timeline for 11.

- [ ] Keep security claims proportionate: describe course defenses and limitations, not a claim that the workshop is a hardened sandbox.

- [ ] Produce full Vietnamese pairs and run course-content, sync, Mermaid, editorial, and workshop tests `00` through `11`.

- [ ] Commit the third checkpoint batch.

  ```bash
  git add content/en/course/08-coding-tools.md content/en/course/09-stateful-agent.md content/en/course/10-session-tree.md content/en/course/11-context-compaction.md content/vi/course/08-coding-tools.md content/vi/course/09-stateful-agent.md content/vi/course/10-session-tree.md content/vi/course/11-context-compaction.md
  git commit -m "docs(course): add checkpoints 08 through 11"
  ```

## Task 6: Write checkpoints 12 through 14

**Files:**

- Create: `content/en/course/12-resources-extensions.md`
- Create: `content/en/course/13-runtime-composition.md`
- Create: `content/en/course/14-agent-evaluation.md`
- Create: matching files under `content/vi/course/`
- Read: corresponding `course/src/` modules and focused tests `12` through `14`

- [ ] Checkpoint 12 must explain trusted resource roots, metadata-only discovery, lazy activation, hook order, atomic contribution registration, rollback, and reverse disposal. Its failure experiment activates an Extension that fails after allocating one disposable resource.

- [ ] Checkpoint 13 must explain the composition root, global versus workspace-bound dependencies, serialized replacement, session/subscription rebinding, persistence flush, reverse cleanup, construction rollback, and fail-closed swap. Its failure experiment makes replacement construction fail and proves the old runtime remains live.

- [ ] Checkpoint 14 must explain held-out tasks, fresh runtime per repetition, deterministic judges, verdicts, infrastructure versus task failure, baseline/candidate comparison, reproducible aggregates, cancellation, and privacy-safe reports. Its failure experiment throws inside the harness and verifies the result is `error`, not a failed task verdict.

- [ ] Add original visuals: Extension activation transaction for 12, runtime ownership graph for 13, and evaluation lifecycle plus evidence boundary for 14.

- [ ] The Checkpoint 14 Pi comparison must distinguish the offline course harness from the release-pinned private `packages/evals` monorepo package and link to the new Pi eval How-to guide.

- [ ] Produce full Vietnamese pairs and run course-content, sync, Mermaid, editorial, and the complete workshop.

- [ ] Commit the final checkpoint batch.

  ```bash
  git add content/en/course/12-resources-extensions.md content/en/course/13-runtime-composition.md content/en/course/14-agent-evaluation.md content/vi/course/12-resources-extensions.md content/vi/course/13-runtime-composition.md content/vi/course/14-agent-evaluation.md
  git commit -m "docs(course): add checkpoints 12 through 14"
  ```

## Task 7: Establish course preservation baselines

**Files:**

- Modify: `content/preservation-manifest.json`
- Modify: `scripts/content-preservation.test.mjs`
- Modify: `scripts/course-content.test.mjs`

- [ ] Run all public content and editorial checks first. Treat the passing files as the approved initial course versions.

- [ ] Append 32 preservation records in translation-manifest order, EN then VI for each course key. Calculate actual word, H2/H3/H4, code-fence, Mermaid, and table baselines. Use empty `approvedDeletions` arrays.

- [ ] Keep all prior 54 preservation records unchanged. Update the coverage test to require exactly 86 records and one EN/VI record per each of 43 translation keys.

- [ ] Add course-content assertions that all 15 checkpoint pages in each locale have at least one failure experiment, one acceptance checklist, one focused command, and both course/SDK labels.

- [ ] Run:

  ```bash
  npm run test:content
  npm run test:preservation
  npm run test:editorial
  npm run lint:sync
  npm run lint:frontmatter
  npm run lint:content
  npm run lint:editorial
  npm run lint:mermaid
  npm run test:course
  npm run format:check
  git diff --check
  ```

  Expected result: all commands pass with 43 pairs, 86 preservation records, 16 course pages per locale, and 15 passing workshop test files.

- [ ] Commit the approved course baselines.

  ```bash
  git add content/preservation-manifest.json scripts/content-preservation.test.mjs scripts/course-content.test.mjs
  git commit -m "test: baseline bilingual Agent course"
  ```

## Task 8: Perform a bilingual originality and depth review

**Files:**

- Review: all files under `content/en/course/` and `content/vi/course/`
- Review: `course/src/`, `course/test/`, and `course/fixtures/`

- [ ] Compare every checkpoint with its actual source module and focused test. Correct any prose that names a nonexistent export, skips a tested invariant, or claims behavior the workshop does not implement.

- [ ] Compare EN and VI side by side. Require equal heading shape, code, diagrams, tables, warnings, failure experiments, acceptance criteria, and Pi comparison depth.

- [ ] Audit technical terminology. Keep imports, types, functions, fields, events, filenames, commands, configuration keys, environment variables, protocol values, `Agent`, `Tool`, `Agent Loop`, `EventStream`, `Session Tree`, and `Context Compaction` unchanged.

- [ ] Audit originality against the research reference at commit `20dd3a7d791c2470a87c5172aa0729c3963a6b18`. If any phrase, diagram structure, lab sequence, code shape, or distinctive explanation appears derivative, rewrite it from the verified workshop mechanism and Pi release sources.

- [ ] Run `rg -n -i "pi-textbook|translated and adapted|source_commit|cc by" content/en/course content/vi/course`. Expected result: no matches.

- [ ] Run the full Task 7 command set again. Expected result: all pass without reducing preservation baselines.

- [ ] Commit only real review corrections.

  ```bash
  git add content/en/course content/vi/course course scripts/course-content.test.mjs content/preservation-manifest.json
  git commit -m "docs(course): complete technical and bilingual review"
  ```

## Completion handoff

Proceed to `docs/superpowers/plans/2026-08-25-course-integration-release.md` only when all 43 pairs are reviewed, all 86 preservation entries pass, and course prose agrees with the runnable workshop.
