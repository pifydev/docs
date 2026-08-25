# Pi SDK Testing and Evaluation Documentation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one full Pi SDK chapter and three runnable task-oriented guides in synchronized English and Vietnamese, all verified against public Pi `0.84.3` APIs or its release-pinned source tree.

**Architecture:** Extend the existing chapter and How-to tracks rather than mixing SDK usage into the new educational course. Register four translation pairs in the manifest and localized Fumadocs navigation, compile public SDK snippets through the existing `0.84.3` contract fixture, and validate eval instructions against the private monorepo package at the release commit.

**Tech Stack:** Fumadocs Markdown, Mermaid, TypeScript 6, public `@earendil-works/pi-*` packages at `0.84.3`, Node.js 22 tests, preservation manifest.

---

## Plan boundaries

- Complete `2026-08-25-pi-0843-foundation-refresh.md` first.
- The interim translation count in this plan is 27 pairs and 54 public files. The course plan later raises it to 43 pairs and 86 files.
- `@earendil-works/pi-evals` is not a public SDK dependency. Eval commands operate only in a Pi source checkout pinned to `4e58f324fae8ebfa98a3d45181fb248072a2afac`.
- New content must be at least as deep in Vietnamese as in English: identical heading depths, fence languages, Mermaid count, table count, examples, warnings, and acceptance guidance.

## Task 1: Register the four SDK page pairs with failing contract tests

**Files:**

- Modify: `scripts/content.test.mjs`
- Modify: `scripts/validate-content.mjs`
- Modify: `content/translation-manifest.json`
- Modify: `content/en/meta.json`
- Modify: `content/vi/meta.json`
- Modify: `content/en/how-to/meta.json`
- Modify: `content/vi/how-to/meta.json`

- [ ] Change the expected manifest contract in `scripts/content.test.mjs` from 23 to 27 unique pairs and add exact entries for:

  ```text
  ch11-testing-evaluation -> ch11-testing-evaluation.md
  how-to-test-agent-deterministically -> how-to/test-agent-deterministically.md
  how-to-run-pi-evals -> how-to/run-pi-evals.md
  how-to-host-session-runtime -> how-to/host-session-runtime.md
  ```

- [ ] Extend the expected root navigation so `ch11-testing-evaluation` follows `ch10-session`. Extend How-to navigation in this exact order: existing five guides, `test-agent-deterministically`, `run-pi-evals`, `host-session-runtime`.

- [ ] Make the equivalent 27-pair and navigation expectations in `scripts/validate-content.mjs`.

- [ ] Run `node --test scripts/content.test.mjs`. Expected result: red because the manifest, metadata, and four pairs do not exist.

- [ ] Add the four entries to `content/translation-manifest.json` with groups `chapters` or `how-to`, no `zh` field, and identical EN/VI relative paths.

- [ ] Update both root `meta.json` files and both How-to `meta.json` files to the approved order.

- [ ] Run `node --test scripts/content.test.mjs` again. Expected result: failures now identify only missing content files.

- [ ] Commit the red content scaffold.

  ```bash
  git add scripts/content.test.mjs scripts/validate-content.mjs content/translation-manifest.json content/en/meta.json content/vi/meta.json content/en/how-to/meta.json content/vi/how-to/meta.json
  git commit -m "test: register Pi testing and runtime docs"
  ```

## Task 2: Write Chapter 11 in English

**Files:**

- Create: `content/en/ch11-testing-evaluation.md`
- Modify: `tests/fixtures/pi-sdk-0843.contract.ts`

- [ ] Create reviewed frontmatter with `translation_key: ch11-testing-evaluation`, `language: en`, `chapter: 11`, release-pinned `official_refs`, and no `pi-textbook` metadata.

- [ ] Write the chapter with this exact conceptual sequence:

  1. testing as layered evidence rather than one end-to-end score;
  2. protocol and provider-adapter tests;
  3. deterministic faux-provider tests;
  4. Agent Loop and Tool round-trip invariants;
  5. session append order and active-path assertions;
  6. end-to-end harness boundaries;
  7. deterministic judges and model-backed judges;
  8. repeated baseline/candidate comparison;
  9. task failure versus infrastructure failure;
  10. artifact privacy, cost, and reproducibility;
  11. a practical test matrix and release-pinned source map.

- [ ] Include one original Mermaid evidence pyramid, one table mapping layers to test doubles and failure signals, one deterministic code example, one comparative-eval pseudocode example, and one warning about model-backed judge cost and sensitive artifacts.

- [ ] In the deterministic example use public `fauxProvider()`, `fauxAssistantMessage()`, `fauxToolCall()`, and `fauxText()` from `@earendil-works/pi-ai@0.84.3`. Show an explicit `Models` collection, a Tool call and result, a final assistant response, request/transcript assertions, and cleanup.

- [ ] Add the chapter example to `tests/fixtures/pi-sdk-0843.contract.ts` as a compile-only function. Do not invoke the function from a test.

- [ ] Run `npm run typecheck`, `npm run lint:frontmatter`, and `npm run lint:mermaid`. Expected result: all pass for the English page; sync remains red until Vietnamese exists.

- [ ] Commit the canonical English chapter.

  ```bash
  git add content/en/ch11-testing-evaluation.md tests/fixtures/pi-sdk-0843.contract.ts
  git commit -m "docs: add English Pi testing and evaluation chapter"
  ```

## Task 3: Produce the full Vietnamese Chapter 11 pair

**Files:**

- Create: `content/vi/ch11-testing-evaluation.md`
- Modify: `content/en/ch11-testing-evaluation.md`

- [ ] Translate and technically adapt the complete English chapter, preserving the exact heading-depth sequence, code fences, Mermaid graph shape, table columns, callouts, identifiers, imports, commands, and links.

- [ ] Keep `test double`, `fixture`, `harness`, `judge`, `verdict`, `held-out evaluation`, `Agent Loop`, `Tool`, `ToolCall`, `ToolResultMessage`, and SDK identifiers in English where translation would reduce precision. Explain them naturally in Vietnamese prose.

- [ ] Review both editions side by side for equal depth and correct any English sentence that became ambiguous during translation.

- [ ] Run:

  ```bash
  npm run lint:sync
  npm run lint:frontmatter
  npm run lint:mermaid
  npm run lint:editorial
  ```

  Expected result: Chapter 11 has no structural or editorial mismatch.

- [ ] Commit the bilingual chapter pair.

  ```bash
  git add content/en/ch11-testing-evaluation.md content/vi/ch11-testing-evaluation.md
  git commit -m "docs: complete bilingual Pi testing chapter"
  ```

## Task 4: Add the deterministic Agent testing guide

**Files:**

- Create: `content/en/how-to/test-agent-deterministically.md`
- Create: `content/vi/how-to/test-agent-deterministically.md`
- Modify: `tests/fixtures/pi-sdk-0843.contract.ts`
- Modify: `scripts/pi-release-contract.test.mjs`

- [ ] Add a failing release-contract test requiring the new EN/VI pages and the exact public helpers `fauxProvider`, `fauxAssistantMessage`, `fauxToolCall`, and `fauxText`.

- [ ] Write the English guide with these sections:

  - outcome, prerequisites, and package versions;
  - create an isolated `Models` collection and faux provider;
  - define a deterministic calculator Tool;
  - queue a Tool call followed by a final answer;
  - run `Agent` and capture the event/transcript sequence;
  - assert provider requests, Tool arguments, Tool result linkage, final text, and stop reason;
  - test cancellation with `AbortController`;
  - test an exhausted faux-response queue and its error result;
  - cleanup provider/model registration in `afterEach` or `finally`;
  - troubleshooting and acceptance checklist.

- [ ] Make the displayed test self-contained and compilable through `tests/fixtures/pi-sdk-0843.contract.ts`. It must use no environment secret and make no network request.

- [ ] Write the Vietnamese page with identical structure and unchanged code.

- [ ] Run `npm run test:release`, `npm run typecheck`, `npm run lint:sync`, and `npm run lint:editorial`. Expected result: all pass for this guide.

- [ ] Commit the guide pair.

  ```bash
  git add content/en/how-to/test-agent-deterministically.md content/vi/how-to/test-agent-deterministically.md tests/fixtures/pi-sdk-0843.contract.ts scripts/pi-release-contract.test.mjs
  git commit -m "docs: add deterministic Pi Agent testing guide"
  ```

## Task 5: Add the release-pinned Pi eval guide

**Files:**

- Create: `content/en/how-to/run-pi-evals.md`
- Create: `content/vi/how-to/run-pi-evals.md`
- Create: `scripts/pi-evals-guide.test.mjs`
- Modify: `package.json`

- [ ] Write `scripts/pi-evals-guide.test.mjs` first. It must read both guide files and assert:

  - the release commit appears exactly;
  - the guide identifies `packages/evals` as a private monorepo package, not an npm install target;
  - smoke eval, Pi harness, deterministic judge, model-backed judge, baseline, candidate, repetitions, telemetry, artifacts, and cleanup are covered;
  - model-backed execution is marked optional;
  - the warning mentions cost and sensitive artifacts;
  - no command installs `@earendil-works/pi-evals` from npm.

- [ ] Run `node --test scripts/pi-evals-guide.test.mjs`. Expected result: red because the guide files do not exist.

- [ ] Write the English guide with exact checkout instructions:

  ```bash
  git clone https://github.com/earendil-works/pi.git
  cd pi
  git checkout 4e58f324fae8ebfa98a3d45181fb248072a2afac
  npm install
  ```

  Then explain one smoke eval, the coding-agent harness, judge selection, baseline/candidate comparison, repetition count, telemetry, artifact paths, redaction, cleanup, and how infrastructure errors are separated from task verdicts. Commands must match `packages/evals/package.json` at the pinned commit.

- [ ] Add a source map linking the pinned `packages/evals/README.md`, `src/smoke.eval.ts`, `src/pi-harness.ts`, reporter, artifact, and summary modules.

- [ ] Add the full Vietnamese page with identical commands, headings, tables, warnings, and links.

- [ ] Add `test:evals-guide` to `package.json` and include it in `quality:content` next to `test:release`.

- [ ] Run `npm run test:evals-guide`, `npm run lint:sync`, `npm run lint:frontmatter`, and `npm run lint:editorial`. Expected result: all pass.

- [ ] Commit the eval guide.

  ```bash
  git add content/en/how-to/run-pi-evals.md content/vi/how-to/run-pi-evals.md scripts/pi-evals-guide.test.mjs package.json
  git commit -m "docs: add release-pinned Pi eval guide"
  ```

## Task 6: Add the replaceable session runtime guide

**Files:**

- Create: `content/en/how-to/host-session-runtime.md`
- Create: `content/vi/how-to/host-session-runtime.md`
- Modify: `tests/fixtures/pi-sdk-0843.contract.ts`
- Modify: `scripts/pi-release-contract.test.mjs`

- [ ] Add a failing release-contract assertion requiring `createAgentSession`, `createAgentSessionRuntime`, `CreateAgentSessionRuntimeFactory`, and `AgentSessionRuntime` in both new pages.

- [ ] Write the English guide in this sequence:

  1. decision table for `createAgentSession()` versus `createAgentSessionRuntime()`;
  2. define process-global inputs and cwd-bound inputs;
  3. implement a typed `CreateAgentSessionRuntimeFactory`;
  4. create the initial runtime;
  5. bind host subscriptions to the current `AgentSession`;
  6. serialize new, resume, fork, clone, and import host operations;
  7. unbind old subscriptions and bind the replacement session;
  8. dispose old resources and flush persistence;
  9. handle factory failure without exposing a half-replaced session;
  10. verify cwd changes, diagnostics, and acceptance criteria.

- [ ] Include an original lifecycle sequence diagram showing the host lock, old session, runtime factory, replacement session, subscription rebind, and disposal.

- [ ] Compile the displayed factory and host-wrapper shape in `tests/fixtures/pi-sdk-0843.contract.ts` without constructing real resources.

- [ ] Write the complete Vietnamese pair, retaining all exported type names and method names unchanged.

- [ ] Run `npm run test:release`, `npm run typecheck`, `npm run lint:sync`, `npm run lint:mermaid`, and `npm run lint:editorial`. Expected result: all pass.

- [ ] Commit the runtime guide.

  ```bash
  git add content/en/how-to/host-session-runtime.md content/vi/how-to/host-session-runtime.md tests/fixtures/pi-sdk-0843.contract.ts scripts/pi-release-contract.test.mjs
  git commit -m "docs: add replaceable session runtime guide"
  ```

## Task 7: Establish preservation baselines and close the 27-pair batch

**Files:**

- Modify: `content/preservation-manifest.json`
- Modify: `scripts/content-preservation.test.mjs`
- Modify: `scripts/content.test.mjs`
- Modify: `scripts/validate-content.mjs`

- [ ] Add eight preservation entries in translation-manifest order: EN then VI for each of the four new keys. Calculate baseline words, heading counts by depth, code-fence count, Mermaid count, and table count from the approved files; use the same minimum-word ratio policy as comparable existing pages and an empty `approvedDeletions` array.

- [ ] Keep all prior 46 preservation entries byte-for-byte unchanged. Add a regression assertion in `scripts/content-preservation.test.mjs` that manifest coverage is 54 entries at this stage.

- [ ] Run `npm run test:content` and confirm the repository now satisfies the exact 27-pair content contract.

- [ ] Run the complete SDK-doc batch:

  ```bash
  npm run test:release
  npm run test:evals-guide
  npm run test:content
  npm run test:preservation
  npm run test:editorial
  npm run lint:sync
  npm run lint:frontmatter
  npm run lint:content
  npm run lint:editorial
  npm run lint:mermaid
  npm run typecheck
  npm run format:check
  git diff --check
  ```

  Expected result: all commands exit zero, with 27 synchronized pairs and 54 preservation entries.

- [ ] Commit the approved baselines.

  ```bash
  git add content/preservation-manifest.json scripts/content-preservation.test.mjs scripts/content.test.mjs scripts/validate-content.mjs
  git commit -m "test: baseline new Pi SDK documentation"
  ```

## Completion handoff

Proceed to `docs/superpowers/plans/2026-08-25-build-your-own-workshop.md` only after all four public examples compile against Pi `0.84.3`, the eval guide is pinned to the release source checkout, and the 27-pair batch is fully green.
