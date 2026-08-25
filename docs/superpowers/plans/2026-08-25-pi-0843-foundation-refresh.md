# Pi 0.84.3 Foundation Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pin active Pify SDK documentation and compile-time contracts to published Pi `0.84.3` without shortening the existing English or Vietnamese editions or leaking post-tag behavior into release guidance.

**Architecture:** Treat `v0.84.3` at `4e58f324fae8ebfa98a3d45181fb248072a2afac` as the only release authority. Add one machine-readable release fixture, a Node contract test that scans active public material, and a TypeScript export fixture compiled by the existing root typecheck. Apply release corrections to paired EN/VI pages in small batches, while preserving all current preservation baselines.

**Tech Stack:** Node.js 22, TypeScript 6, Node test runner, Vitest, Fumadocs Markdown/MDX, npm, Git.

---

## Plan boundaries

- This plan is first in the five-plan suite.
- Do not edit historical records under `docs/superpowers/specs/` or `docs/superpowers/plans/` to replace old release numbers.
- Do not document upstream `main` changes that are absent from tag `v0.84.3` as released behavior.
- Do not reduce the word, heading, code-fence, Mermaid, or table baselines of any existing page.
- Use English as the canonical technical edition, then make the Vietnamese page structurally equivalent while preserving identifiers exactly.

## Task 1: Add an executable Pi release boundary

**Files:**

- Create: `scripts/fixtures/pi-release-0843.json`
- Create: `scripts/pi-release-contract.test.mjs`
- Create: `tests/fixtures/pi-sdk-0843.contract.ts`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `scripts/ci-config.test.mjs`

- [ ] Write the failing Node tests first in `scripts/pi-release-contract.test.mjs`.

  The tests must assert:

  - fixture version is exactly `0.84.3`;
  - fixture tag is exactly `v0.84.3`;
  - fixture commit is exactly `4e58f324fae8ebfa98a3d45181fb248072a2afac`;
  - audited upstream head is `dcd461925db2edf69a43c8135db1180d418afd54` and is explicitly marked `unreleased`;
  - the root development dependencies used by the compile fixture are pinned to `0.84.3`;
  - active files in `content/en/`, `content/vi/`, and `README.md` contain neither `0.84.2` nor commit prefix `a470b121` after migration;
  - a release source link that claims SDK `0.84.3` uses the tag or release commit, never the audited `main` commit.

- [ ] Run `node --test scripts/pi-release-contract.test.mjs` and confirm it fails because the fixture and pinned dependencies do not exist.

- [ ] Add `scripts/fixtures/pi-release-0843.json` with these fields and exact values:

  ```json
  {
    "packageVersion": "0.84.3",
    "tag": "v0.84.3",
    "commit": "4e58f324fae8ebfa98a3d45181fb248072a2afac",
    "upstreamAuditCommit": "dcd461925db2edf69a43c8135db1180d418afd54",
    "upstreamAuditStatus": "unreleased"
  }
  ```

- [ ] Add exact `0.84.3` development dependencies for the public packages imported by the contract fixture: `@earendil-works/pi-ai`, `@earendil-works/pi-agent-core`, and `@earendil-works/pi-coding-agent`. Regenerate only the root `package-lock.json`; do not create another lockfile.

- [ ] Add `tests/fixtures/pi-sdk-0843.contract.ts` with compile-time imports for the public exports used by the refreshed docs, including `Agent`, faux-provider helpers, `createAgentSession`, `createAgentSessionRuntime`, `createPowerShellTool`, `PowerShellOperations`, `GoogleApiThinkingLevel`, and `ResolvedGoogleThinkingLevel`. Use `satisfies` assignments or no-op typed functions so `npm run typecheck` proves symbol and signature availability without network calls or runtime side effects.

- [ ] Add `test:release` to `package.json` as `node --test scripts/pi-release-contract.test.mjs`, and add it to `quality:content` before application linting.

- [ ] Extend `scripts/ci-config.test.mjs` to require `npm run test:release` in `quality:content`.

- [ ] Run `node --test scripts/pi-release-contract.test.mjs scripts/ci-config.test.mjs`. Expected result: dependency and fixture assertions pass; the active-content scan remains red until Task 2.

- [ ] Commit the release boundary.

  ```bash
  git add package.json package-lock.json scripts/fixtures/pi-release-0843.json scripts/pi-release-contract.test.mjs scripts/ci-config.test.mjs tests/fixtures/pi-sdk-0843.contract.ts
  git commit -m "test: pin Pi SDK release boundary"
  ```

## Task 2: Refresh release pins without changing page depth

**Files:**

- Modify: `content/en/ch01-overview.md`
- Modify: `content/en/ch02-three-layer-arch.md`
- Modify: `content/en/ch03-agent-loop.md`
- Modify: `content/en/ch04-model-invocation.md`
- Modify: `content/en/ch05-tool-system.md`
- Modify: `content/en/ch06-messages.md`
- Modify: `content/en/ch07-event-driven.md`
- Modify: `content/en/ch08-context-engineering.md`
- Modify: `content/en/ch09-compaction.md`
- Modify: `content/en/ch10-session.md`
- Modify: matching files under `content/vi/`
- Modify: all existing paired files under `content/en/how-to/`, `content/vi/how-to/`, `content/en/reference/`, `content/vi/reference/`, and `content/{en,vi}/help/faq.md` that contain the old version or old commit

- [ ] Capture the current preservation result before editing: run `npm run test:preservation` and save the passing console output in the implementation notes or commit message body.

- [ ] Use `rg -n "0\\.84\\.2|a470b121" content/en content/vi README.md` to enumerate the exact active references. Do not include historical planning files in the replacement set.

- [ ] For each paired page, inspect the corresponding source at tag `v0.84.3` before replacing the package version and commit. If an old claim no longer exists at the release tag, correct the claim in both locales instead of changing only its link.

- [ ] Preserve every existing section, example, diagram, edge case, and warning unless there is written evidence that it is technically invalid or duplicated. If removal is unavoidable, add the required `approvedDeletions` record to `content/preservation-manifest.json` with section, reason, evidence URL pinned to `v0.84.3`, and heading depth.

- [ ] Update `last_updated` on every changed public page, keep `status: reviewed`, and retain both `translator` and `reviewed_by`.

- [ ] Run:

  ```bash
  npm run test:release
  npm run lint:sync
  npm run test:preservation
  ```

  Expected result: no old active release pin remains, EN/VI structure matches, and all 46 existing preservation entries still pass.

- [ ] Commit the release-pin migration.

  ```bash
  git add content README.md
  git commit -m "docs: refresh active Pi references to 0.84.3"
  ```

## Task 3: Document the PowerShell Tool and shell-session behavior

**Files:**

- Modify: `content/en/ch05-tool-system.md`
- Modify: `content/vi/ch05-tool-system.md`
- Modify: `content/en/reference/api.md`
- Modify: `content/vi/reference/api.md`
- Modify: `content/en/reference/configuration.md`
- Modify: `content/vi/reference/configuration.md`
- Modify: `content/en/reference/environment-variables.md`
- Modify: `content/vi/reference/environment-variables.md`
- Modify: `tests/fixtures/pi-sdk-0843.contract.ts`
- Modify: `scripts/pi-release-contract.test.mjs`

- [ ] Add red assertions to `scripts/pi-release-contract.test.mjs` that require the English and Vietnamese Tool/API/configuration material to contain `powershell`, `createPowerShellTool`, `PowerShellOperations`, and `defaultTools`.

- [ ] Extend the TypeScript contract fixture with a typed PowerShell Tool creation example. It must prove the factory and operation type compile and must not execute a shell process.

- [ ] Run `npm run test:release` and confirm the content assertions fail before the docs are updated.

- [ ] Update Chapter 5 in both locales with:

  - the optional `powershell` built-in and its Windows use case;
  - the distinction between `bash` and `powershell` sessions;
  - `createPowerShellTool()` customization;
  - the `PowerShellOperations` contract;
  - bounded output, cancellation, and cleanup requirements;
  - a clear statement of whether `powershell` is present in `defaultTools` at `0.84.3`.

- [ ] Update the API reference with public import paths and signatures verified by the TypeScript fixture. Update configuration examples so `defaultTools` behavior is accurate and explain that selecting a Tool is different from changing the host shell.

- [ ] Update environment-variable wording so shell-session variables and process environment guidance explicitly cover both Bash and PowerShell where supported. Keep variable names and configuration keys untranslated in Vietnamese.

- [ ] Run `npm run test:release`, `npm run typecheck`, `npm run lint:sync`, and `npm run test:preservation`. Expected result: all pass.

- [ ] Commit the Tool refresh.

  ```bash
  git add content/en/ch05-tool-system.md content/vi/ch05-tool-system.md content/en/reference content/vi/reference tests/fixtures/pi-sdk-0843.contract.ts scripts/pi-release-contract.test.mjs
  git commit -m "docs: add Pi 0.84.3 PowerShell guidance"
  ```

## Task 4: Correct Extension and provider contracts

**Files:**

- Modify: `content/en/ch04-model-invocation.md`
- Modify: `content/vi/ch04-model-invocation.md`
- Modify: `content/en/ch07-event-driven.md`
- Modify: `content/vi/ch07-event-driven.md`
- Modify: `content/en/ch09-compaction.md`
- Modify: `content/vi/ch09-compaction.md`
- Modify: `content/en/reference/api.md`
- Modify: `content/vi/reference/api.md`
- Modify: `content/en/reference/configuration.md`
- Modify: `content/vi/reference/configuration.md`
- Modify: `tests/fixtures/pi-sdk-0843.contract.ts`
- Modify: `scripts/pi-release-contract.test.mjs`

- [ ] Add red release-contract assertions that require:

  - the event catalog and compaction chapter to include `session_compact_failed` in both locales;
  - active docs to contain `GoogleApiThinkingLevel` and `ResolvedGoogleThinkingLevel`;
  - active docs not to present `GoogleThinkingLevel` as the current type;
  - any post-tag truncated-summary rejection note to contain an explicit `unreleased` label in English and its equivalent warning in Vietnamese.

- [ ] Run `npm run test:release` and record the expected failures.

- [ ] Verify the `session_compact_failed` payload and handler timing at `v0.84.3`, then correct Chapter 7 and Chapter 9 without inventing fields from later `main`.

- [ ] Replace the released Google thinking-level type name with `GoogleApiThinkingLevel`, add `ResolvedGoogleThinkingLevel` where the resolved type is relevant, and keep both identifiers unchanged in Vietnamese.

- [ ] Inspect every paragraph that discusses truncated compaction summaries. Omit post-tag behavior when it is not needed; otherwise place it in a visually explicit unreleased note and exclude it from runnable `0.84.3` examples.

- [ ] Add compile-only assignments in `tests/fixtures/pi-sdk-0843.contract.ts` for the renamed and resolved Google types.

- [ ] Run:

  ```bash
  npm run test:release
  npm run typecheck
  npm run lint:sync
  npm run lint:mermaid
  npm run test:preservation
  ```

  Expected result: all pass and no active page confuses tag behavior with audited `main`.

- [ ] Commit the contract corrections.

  ```bash
  git add content/en content/vi tests/fixtures/pi-sdk-0843.contract.ts scripts/pi-release-contract.test.mjs
  git commit -m "docs: align extension and provider contracts with Pi 0.84.3"
  ```

## Task 5: Add the paired testing and runtime vocabulary

**Files:**

- Modify: `content/en/glossary.md`
- Modify: `content/vi/glossary.md`
- Modify: `scripts/content.test.mjs`
- Modify: `scripts/editorial-lint.test.mjs`

- [ ] Add a failing content test requiring both glossaries to define these exact identifiers or terms: `test double`, `fixture`, `harness`, `judge`, `verdict`, `held-out evaluation`, `composition root`, and `fail-closed`.

- [ ] Add concise paired definitions. English is canonical; Vietnamese explanations may be natural Vietnamese, but the established English term remains visible and exact.

- [ ] Add one example or cross-reference per term where it improves disambiguation, especially the distinction among `fixture`, `harness`, `judge`, and `verdict`.

- [ ] Run `node --test scripts/content.test.mjs scripts/editorial-lint.test.mjs`, `npm run lint:sync`, and `npm run test:preservation`. Expected result: all pass.

- [ ] Commit the glossary extension.

  ```bash
  git add content/en/glossary.md content/vi/glossary.md scripts/content.test.mjs scripts/editorial-lint.test.mjs
  git commit -m "docs: add testing and runtime glossary terms"
  ```

## Task 6: Verify the foundation batch

**Files:**

- Verify only; modify the preceding files only if a failing check exposes a defect.

- [ ] Prepend Node.js `22.19.0` to `PATH` on this Windows machine:

  ```powershell
  $env:PATH = "C:\Users\Admin\AppData\Local\nvm\v22.19.0;$env:PATH"
  node --version
  ```

  Expected output: `v22.19.0`.

- [ ] Run `npm ci` and confirm the root lockfile installs the exact `0.84.3` SDK verification dependencies.

- [ ] Run the focused gates:

  ```bash
  npm run test:release
  npm run test:content
  npm run test:preservation
  npm run test:editorial
  npm run lint:content
  npm run lint:sync
  npm run lint:mermaid
  npm run typecheck
  npm run format:check
  git diff --check
  ```

  Expected result: every command exits zero.

- [ ] Run `rg -n "0\\.84\\.2|a470b121" content/en content/vi README.md`. Expected result: no matches.

- [ ] Run `rg -n "dcd461925db2edf69a43c8135db1180d418afd54" content/en content/vi`. Expected result: either no matches or only explicitly unreleased material.

- [ ] Inspect `git status --short` and confirm only deliberate foundation-refresh files are present.

- [ ] If verification required corrections, commit them separately.

  ```bash
  git add package.json package-lock.json scripts tests content README.md
  git commit -m "test: verify Pi 0.84.3 documentation foundation"
  ```

## Completion handoff

Proceed to `docs/superpowers/plans/2026-08-25-pi-sdk-testing-evaluation-docs.md` only when every Task 6 command passes and all existing preservation baselines remain intact.
