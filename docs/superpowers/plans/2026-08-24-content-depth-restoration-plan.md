# Content Depth Restoration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the valid depth, structure, examples, and bilingual scope present at `b10130f` while keeping current Pi `0.84.2` technical corrections and the Fumadocs application.

**Architecture:** Treat the historical page as the preservation baseline, the current page as the correction set, and pinned upstream source as the technical authority. A committed preservation manifest and deletion ledger make every material removal explicit and keep CI from accepting another silent collapse in coverage.

**Tech Stack:** Markdown/MDX, Node.js 22, gray-matter, Node test runner, Fumadocs, Next.js, Playwright, Prettier, ESLint.

---

## File map

- Create `scripts/lib/content-preservation.mjs`: extract structural metrics and validate them against the manifest.
- Create `scripts/content-preservation.test.mjs`: unit and repository integration tests for the preservation gate.
- Create `content/preservation-manifest.json`: committed baseline metrics and approved deletion records for all 46 public documents.
- Create `docs/translation-review/2026-08-24-content-restoration.md`: human-readable section outcome and deletion ledger.
- Modify `scripts/validate-content.mjs`: invoke the preservation validator in strict mode.
- Modify `scripts/ci-config.test.mjs`, `package.json`, and `.github/workflows/content-quality.yml`: make the new gate mandatory.
- Modify `content/en/**` and `content/vi/**`: restore and re-edit the 23 page pairs.

## Task 1: Add the preservation metric extractor with TDD

**Files:**

- Create: `scripts/lib/content-preservation.mjs`
- Create: `scripts/content-preservation.test.mjs`
- Modify: `package.json`

- [ ] **Step 1: Write failing unit tests for structural metrics**

Add tests that prove prose words, H2–H4 headings, fenced code, Mermaid blocks, and Markdown tables are counted without frontmatter or fenced-code contents leaking into prose metrics:

```js
import assert from "node:assert/strict";
import test from "node:test";

import {
  contentMetrics,
  preservationErrors,
} from "./lib/content-preservation.mjs";

test("contentMetrics records semantic structure", () => {
  const source = `---\ntitle: Demo\n---\n\n## One\n\nUseful prose here.\n\n### Two\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n\`\`\`ts\nconst hidden = "not prose";\n\`\`\`\n\n\`\`\`mermaid\ngraph TD\n  A --> B\n\`\`\``;
  assert.deepEqual(contentMetrics(source), {
    words: 3,
    headings: [2, 3],
    codeFences: ["ts", "mermaid"],
    mermaidBlocks: 1,
    tables: 1,
  });
});

test("preservationErrors rejects silent coverage loss", () => {
  const errors = preservationErrors("en/ch01-overview.md", {
    words: 700,
    headings: [2, 2],
    codeFences: ["ts"],
    mermaidBlocks: 0,
    tables: 0,
  }, {
    baselineWords: 1000,
    minimumWordRatio: 0.8,
    minimumHeadingCounts: { "2": 3 },
    minimumCodeFences: 2,
    minimumMermaidBlocks: 1,
    minimumTables: 1,
    approvedDeletions: [],
  });
  assert.equal(errors.length, 5);
});
```

- [ ] **Step 2: Run the tests and confirm the import fails**

Run:

```bash
node --test scripts/content-preservation.test.mjs
```

Expected: FAIL because `scripts/lib/content-preservation.mjs` does not exist.

- [ ] **Step 3: Implement metric extraction and validation**

Implement exports with these contracts:

```js
export function contentMetrics(source) {
  // Strip frontmatter and fenced code from prose before counting words.
  // Return words, heading depths, fence languages, Mermaid count, and table count.
}

export function preservationErrors(relativePath, actual, rule) {
  // Enforce word ratio, per-depth heading minimums, code fences, Mermaid, and tables.
  // Every error begins with relativePath for CI diagnostics.
}

export async function validatePreservation(rootURL, manifest) {
  // Read every manifest path and combine preservationErrors for the repository.
}
```

- [ ] **Step 4: Run the focused tests**

Run:

```bash
node --test scripts/content-preservation.test.mjs
```

Expected: all preservation unit tests pass.

- [ ] **Step 5: Register the test script without enabling the repository gate yet**

Add:

```json
"test:preservation": "node --test scripts/content-preservation.test.mjs"
```

- [ ] **Step 6: Commit**

```bash
git add scripts/lib/content-preservation.mjs scripts/content-preservation.test.mjs package.json
git commit -m "test(docs): add content preservation metrics"
```

## Task 2: Capture the baseline and create a failing repository gate

**Files:**

- Create: `content/preservation-manifest.json`
- Create: `docs/translation-review/2026-08-24-content-restoration.md`
- Modify: `scripts/content-preservation.test.mjs`

- [ ] **Step 1: Extract baseline metrics from `b10130f`**

Read all paths from `content/translation-manifest.json`. For each EN/VI Markdown file, collect metrics from:

```bash
git show b10130f:content/en/ch01-overview.md
git show b10130f:content/vi/ch01-overview.md
```

Commit the results in manifest version 1 using this exact page shape:

```json
{
  "key": "ch01-overview",
  "path": "en/ch01-overview.md",
  "baselineWords": 5279,
  "minimumWordRatio": 0.8,
  "minimumHeadingCounts": { "2": 7, "3": 15, "4": 0 },
  "minimumCodeFences": 1,
  "minimumMermaidBlocks": 1,
  "minimumTables": 1,
  "approvedDeletions": []
}
```

Use the measured values for every page. Set `minimumWordRatio` to `0.8` initially. A later reduction requires an `approvedDeletions` entry with section, reason, evidence, and adjusted metric.

- [ ] **Step 2: Create the restoration ledger**

Add one row per translation key with baseline EN/VI word, heading, code-fence, table, and Mermaid counts. Add outcome columns `restored`, `merged`, `technically-invalid`, `duplicate`, `english`, `vietnamese`, and `render`; initialize page review states to `pending`.

- [ ] **Step 3: Add a repository integration test**

```js
test("repository preserves the approved content baseline", async () => {
  const manifest = JSON.parse(
    await readFile(new URL("../content/preservation-manifest.json", import.meta.url), "utf8"),
  );
  const errors = await validatePreservation(new URL("../", import.meta.url), manifest);
  assert.deepEqual(errors, []);
});
```

- [ ] **Step 4: Run the test and confirm it fails on shortened chapters**

Run:

```bash
npm run test:preservation
```

Expected: FAIL for chapters 1–10 and shortened How-to pages, with word/heading/code coverage errors.

- [ ] **Step 5: Commit the failing repository contract**

```bash
git add content/preservation-manifest.json docs/translation-review/2026-08-24-content-restoration.md scripts/content-preservation.test.mjs
git commit -m "test(docs): record pre-edit content baseline"
```

## Task 3: Audit start and help pages without unnecessary rewrites

**Files:**

- Modify when required: `content/en/index.mdx`, `content/vi/index.mdx`
- Modify when required: `content/en/quickstart.md`, `content/vi/quickstart.md`
- Modify when required: `content/en/glossary.md`, `content/vi/glossary.md`
- Modify when required: `content/en/help/faq.md`, `content/vi/help/faq.md`
- Modify when required: `content/en/changelog.md`, `content/vi/changelog.md`
- Modify: `docs/translation-review/2026-08-24-content-restoration.md`

- [ ] **Step 1: Map baseline sections to current sections**

For each page, compare `git show b10130f:<path>` with the current file. Preserve the current file when semantic coverage is already equal. Restore only missing unique explanations or examples.

- [ ] **Step 2: Preserve current verified corrections**

Keep Node `>=22.19.0`, current `@earendil-works/*` packages, `builtinModels()`, `models.streamSimple()`, current Fumadocs routes, and the pinned upstream note.

- [ ] **Step 3: Record outcomes and verify the pair**

Run:

```bash
node scripts/editorial-lint.mjs content/en/index.mdx content/vi/index.mdx content/en/quickstart.md content/vi/quickstart.md content/en/glossary.md content/vi/glossary.md content/en/help/faq.md content/vi/help/faq.md content/en/changelog.md content/vi/changelog.md
npm run lint:content
npm run test:preservation
```

Expected: the five pairs pass or have explicit approved deletion records.

- [ ] **Step 4: Commit**

```bash
git add content/en/index.mdx content/vi/index.mdx content/en/quickstart.md content/vi/quickstart.md content/en/glossary.md content/vi/glossary.md content/en/help/faq.md content/vi/help/faq.md content/en/changelog.md content/vi/changelog.md content/preservation-manifest.json docs/translation-review/2026-08-24-content-restoration.md
git commit -m "docs(i18n): preserve start and help coverage"
```

## Task 4: Restore chapters 1–3

**Files:**

- Modify: `content/en/ch01-overview.md`, `content/vi/ch01-overview.md`
- Modify: `content/en/ch02-three-layer-arch.md`, `content/vi/ch02-three-layer-arch.md`
- Modify: `content/en/ch03-agent-loop.md`, `content/vi/ch03-agent-loop.md`
- Modify: `content/preservation-manifest.json`
- Modify: `docs/translation-review/2026-08-24-content-restoration.md`

- [ ] **Step 1: Restore Chapter 1's learning progression**

Retain the opening questions; one-diagram definition; package roles; coding-agent, learning-resource, and SDK viewpoints; customization levers; quick start; `models.json`; subtraction philosophy; run modes; alternatives; and summary. Update package count and package names to the pinned monorepo. Keep current Mermaid syntax valid.

- [ ] **Step 2: Restore Chapter 2's architecture analysis**

Retain package-by-package roles, dependency direction, progressive type extension, before/after type comparison, three layering scenarios, dependency funnel, independently usable test, and transition to the loop. Correct the obsolete five-package list using current upstream packages and clearly label experimental packages.

- [ ] **Step 3: Restore Chapter 3's complete loop walkthrough**

Retain direct-call/workflow/agent-loop comparison; trace and turn; complete flow; loop termination; low-level loop and product layering; context transforms; conversion boundary; streaming replacement; tool execution; steering; follow-up; exit paths; and design summary. Replace `stopReason`-only claims with current `Agent`, `agentLoop`, tool batches, queues, hooks, `shouldStopAfterTurn`, and event behavior.

- [ ] **Step 4: Rebuild Vietnamese prose against the reviewed English**

Keep all headings, diagrams, tables, and code fences paired. Preserve exact identifiers while rewriting surrounding prose in accented Vietnamese.

- [ ] **Step 5: Verify and commit**

```bash
npx prettier --write "content/{en,vi}/ch0{1,2,3}-*.md" content/preservation-manifest.json docs/translation-review/2026-08-24-content-restoration.md
npm run lint:content
npm run lint:editorial
npm run lint:mermaid
npm run test:preservation
npm run build
git diff --check
git add content/en/ch01-overview.md content/vi/ch01-overview.md content/en/ch02-three-layer-arch.md content/vi/ch02-three-layer-arch.md content/en/ch03-agent-loop.md content/vi/ch03-agent-loop.md content/preservation-manifest.json docs/translation-review/2026-08-24-content-restoration.md
git commit -m "docs(i18n): restore architecture chapter depth"
```

## Task 5: Restore chapters 4–6

**Files:**

- Modify: `content/en/ch04-model-invocation.md`, `content/vi/ch04-model-invocation.md`
- Modify: `content/en/ch05-tool-system.md`, `content/vi/ch05-tool-system.md`
- Modify: `content/en/ch06-messages.md`, `content/vi/ch06-messages.md`
- Modify: preservation manifest and restoration ledger

- [ ] **Step 1: Restore Chapter 4 around the current Models collection**

Retain provider differences, unified entry, event protocol, adapter responsibilities, call/new-provider scenarios, streaming dialects, thinking levels, cache control, errors, and design summary. Replace descriptor/translator registry examples with `Models`, provider factories, `createProvider()`, and `streamSimple()`; mention compat only as migration context.

- [ ] **Step 2: Restore Chapter 5's full tool pipeline**

Retain the three type layers, bridge, argument preparation, validation, pre-hook, execution, post-hook, result message, parallel/sequential scheduling, error encoding, operations abstraction, custom-tool practices, and methodology. Correct current `AgentTool`, `ToolDefinition`, `defineTool()`, `pi.registerTool()`, `executionMode`, cancellation, progress, and `terminate` semantics.

- [ ] **Step 3: Restore Chapter 6's message journey**

Retain provider-facing messages, richer agent messages, declaration merging, conversion boundary, two-stage transformation, visibility/filtering, full data flow, and transfer lessons. Correct content-block names, `AgentMessage` extensibility, `transformContext`, `convertToLlm`, and session persistence boundaries.

- [ ] **Step 4: Verify paired structure and commit**

```bash
npx prettier --write "content/{en,vi}/ch0{4,5,6}-*.md" content/preservation-manifest.json docs/translation-review/2026-08-24-content-restoration.md
npm run lint:content
npm run lint:editorial
npm run test:preservation
npm run build
git diff --check
git add content/en/ch04-model-invocation.md content/vi/ch04-model-invocation.md content/en/ch05-tool-system.md content/vi/ch05-tool-system.md content/en/ch06-messages.md content/vi/ch06-messages.md content/preservation-manifest.json docs/translation-review/2026-08-24-content-restoration.md
git commit -m "docs(i18n): restore model tool and message depth"
```

## Task 6: Restore chapters 7–10

**Files:**

- Modify: `content/en/ch07-event-driven.md`, `content/vi/ch07-event-driven.md`
- Modify: `content/en/ch08-context-engineering.md`, `content/vi/ch08-context-engineering.md`
- Modify: `content/en/ch09-compaction.md`, `content/vi/ch09-compaction.md`
- Modify: `content/en/ch10-session.md`, `content/vi/ch10-session.md`
- Modify: preservation manifest and restoration ledger

- [ ] **Step 1: Restore Chapter 7's event-system analysis**

Retain motivation, pub/sub comparison, event families, subscriber settlement, synchronization barriers, error behavior, observation/interception/preprocessing/UI scenarios, a `text_delta` journey, product-layer extensions, and design decisions. Correct the claim that progress listeners are never awaited; document current subscriber ordering and settlement from upstream.

- [ ] **Step 2: Restore Chapter 8's context-engineering defenses**

Retain fixed-window problem, tool-output truncation, byte/line and UTF-8 boundaries, system-prompt assembly, context-file discovery, skills, compaction, branch summary, LCA, pipeline, and addition/subtraction lessons. Render the old summary-template headings as a fenced template instead of page H2 headings. Add current project trust and resource-loader behavior.

- [ ] **Step 3: Restore Chapter 9's compaction algorithm**

Retain timing, threshold, token estimate, cut-point rules, structured summary, incremental summaries, split-turn handling, `CompactionEntry`, reconstruction, events, complete chain, and design principles. Use current defaults `reserveTokens: 16384` and `keepRecentTokens: 20000`; keep summary-template labels inside a code block.

- [ ] **Step 4: Restore Chapter 10's session-tree walkthrough**

Retain storage questions, step-by-step tree growth, entry anatomy, entry types, parent-pointer rationale, append/rewind/branch, branch summary, context reconstruction, JSONL details, lazy writes, rewrites, swappable persistence, and transfer lessons. Remove the Chinese phrase from the English heading and explain parent pointers directly. Correct one-file-per-session storage and current `SessionManager` APIs.

- [ ] **Step 5: Verify and commit**

```bash
npx prettier --write "content/{en,vi}/ch{07,08,09,10}-*.md" content/preservation-manifest.json docs/translation-review/2026-08-24-content-restoration.md
npm run lint:content
npm run lint:editorial
npm run lint:mermaid
npm run test:preservation
npm run build
npm run test:e2e
git diff --check
git add content/en/ch07-event-driven.md content/vi/ch07-event-driven.md content/en/ch08-context-engineering.md content/vi/ch08-context-engineering.md content/en/ch09-compaction.md content/vi/ch09-compaction.md content/en/ch10-session.md content/vi/ch10-session.md content/preservation-manifest.json docs/translation-review/2026-08-24-content-restoration.md
git commit -m "docs(i18n): restore context and session depth"
```

## Task 7: Restore five How-to guides

**Files:**

- Modify: `content/en/how-to/*.md`, `content/vi/how-to/*.md`
- Modify: preservation manifest and restoration ledger

- [ ] **Step 1: Restore task prerequisites, intermediate steps, variations, and troubleshooting**

For each guide, keep the baseline's complete task flow and supporting explanations. Update implementations as follows:

- `add-custom-tool`: `defineTool()`, `customTools`, `pi.registerTool()`, TypeBox, progress, cancellation, errors, active-tool allowlists.
- `plug-new-model`: provider-config form, `createProvider()`, model metadata, authentication, compatibility flags, dynamic discovery, testing.
- `stream-output`: `AgentSession.subscribe()`, assistant deltas, thinking, tool events, cancellation, parallel ordering, browser batching, cleanup.
- `persist-sessions`: `SessionManager.create()`, `.continueRecent()`, `.open()`, listing, tree traversal, branch extraction, storage safety.
- `customize-system-prompt`: context discovery, `AGENTS.override.md`, `SYSTEM.md`, `APPEND_SYSTEM.md`, CLI overrides, project trust, `DefaultResourceLoader`.

- [ ] **Step 2: Keep every useful baseline example**

Update obsolete examples in place instead of replacing the guide with one short example. Record any merged or removed example in the ledger.

- [ ] **Step 3: Verify and commit**

```bash
npx prettier --write "content/{en,vi}/how-to/*.md" content/preservation-manifest.json docs/translation-review/2026-08-24-content-restoration.md
npm run lint:content
npm run lint:editorial
npm run test:preservation
npm run build
git diff --check
git add content/en/how-to content/vi/how-to content/preservation-manifest.json docs/translation-review/2026-08-24-content-restoration.md
git commit -m "docs(i18n): restore task guide depth"
```

## Task 8: Restore and expand three Reference pages

**Files:**

- Modify: `content/en/reference/*.md`, `content/vi/reference/*.md`
- Modify: preservation manifest and restoration ledger

- [ ] **Step 1: Preserve the API reference's useful detail**

Cover `Models` and `MutableModels`, provider factories, core message/stream types, `Agent`, `AgentTool`, events, `createAgentSession`, `AgentSession`, `SessionManager`, `SettingsManager`, `DefaultResourceLoader`, `ModelRuntime`, tool factories, and runtime replacement. Label the API page as a curated public reference rather than claiming to list every export.

- [ ] **Step 2: Restore complete current configuration coverage**

Use upstream `settings.md` as the authoritative key list. Preserve tables for model/thinking, UI, telemetry, network, warnings, compaction, branch summary, retries, delivery, terminal/images, shell, tools, sessions, cycling, Markdown, resources, packages, merge behavior, and project trust.

- [ ] **Step 3: Restore complete current environment-variable coverage**

Use upstream `environment-variables.md` for process markers, bash session metadata, Pi process configuration, editor/proxy variables, and precedence. Keep provider credentials clearly separated and avoid claiming a short credential sample is exhaustive.

- [ ] **Step 4: Verify and commit**

```bash
npx prettier --write "content/{en,vi}/reference/*.md" content/preservation-manifest.json docs/translation-review/2026-08-24-content-restoration.md
npm run lint:content
npm run lint:editorial
npm run test:preservation
npm run build
npm run test:e2e
git diff --check
git add content/en/reference content/vi/reference content/preservation-manifest.json docs/translation-review/2026-08-24-content-restoration.md
git commit -m "docs(i18n): restore technical reference depth"
```

## Task 9: Make preservation mandatory in CI

**Files:**

- Modify: `scripts/validate-content.mjs`
- Modify: `scripts/ci-config.test.mjs`
- Modify: `package.json`
- Modify: `.github/workflows/content-quality.yml`

- [ ] **Step 1: Add a failing CI configuration assertion**

Require `quality:content` to invoke `test:preservation` and require the strict repository validator to load `content/preservation-manifest.json`.

- [ ] **Step 2: Run the focused test and observe failure**

```bash
node --test scripts/ci-config.test.mjs
```

Expected: FAIL because the preservation command is not yet part of `quality:content`.

- [ ] **Step 3: Wire the strict preservation gate**

Add `npm run test:preservation` to `quality:content`. Make `validate-content.mjs --require-reviewed` also load and validate the preservation manifest so local lint and CI share the same contract.

- [ ] **Step 4: Run quality checks and commit**

```bash
npm run quality:content
npm run format:check
git diff --check
git add scripts/validate-content.mjs scripts/ci-config.test.mjs package.json .github/workflows/content-quality.yml
git commit -m "ci(docs): enforce content depth preservation"
```

## Task 10: Final factual, bilingual, render, and production verification

**Files:**

- Modify if findings require it: all files touched above
- Modify: `docs/translation-review/2026-08-24-content-restoration.md`

- [ ] **Step 1: Audit every ledger row**

Confirm every baseline section has an outcome. Confirm every `technically-invalid` or `duplicate` record has evidence and a corresponding manifest allowance. No row remains `pending`.

- [ ] **Step 2: Run targeted stale-content scans**

```bash
rg -n "@pi-ai/core|@pi-agent-core|@pi-coding-agent|v0\.80\.2|PI_HOME" content/en content/vi
rg --pcre2 -n "^status: (?!reviewed$).+" content/en content/vi
rg -n "\| pending|machine-translated" docs/translation-review
```

Expected: old packages occur only in explicitly labeled migration notes; every status is reviewed; no pending ledger row remains.

- [ ] **Step 3: Run the complete clean verification suite**

```bash
npm ci
npm run quality:content
npm run typecheck
npm run build
npm run test:e2e
npm run format:check
git diff --check
git status --short
```

Expected: all commands pass; 23 EN/VI pairs and 46 public files validate; the worktree is clean after the final verification commit.

- [ ] **Step 4: Commit final review findings**

```bash
git add content docs/translation-review scripts tests package.json .github/workflows
git commit -m "docs(i18n): complete depth-preserving review"
```

- [ ] **Step 5: Fast-forward `main` and verify external state**

```bash
git fetch origin main
git merge-base --is-ancestor origin/main HEAD
git push origin HEAD:main
```

Do not force-push. Confirm GitHub Content Quality and Next.js Application Build succeed for the pushed SHA. Request both `/en/reference/api` and `/vi/reference/api` with a cache-busting query and verify restored headings and Pi `0.84.2` content are served.
