# Pi SDK and Build-Your-Own Course Expansion Design

**Date:** 2026-08-25
**Status:** Approved for planning
**Published Pi release:** `0.84.3`, tag `v0.84.3`, commit `4e58f324fae8ebfa98a3d45181fb248072a2afac`
**Upstream audit head:** `dcd461925db2edf69a43c8135db1180d418afd54`
**Pedagogical research reference:** `hahhforest/pi-textbook` at `20dd3a7d791c2470a87c5172aa0729c3963a6b18`

## Context

Pify currently publishes 23 synchronized English/Vietnamese page pairs: ten architecture chapters, five How-to guides, three Reference pages, and five start/help pages. The existing chapters already cover most of the subject sequence in `pi-textbook`, including messages, streams, providers, Tools, the Agent Loop, events, context engineering, compaction, and sessions.

The comparison identified four useful gaps in the SDK documentation:

1. deterministic Agent testing with Pi's current faux-provider API;
2. end-to-end and comparative Agent evaluation;
3. focused guidance for hosting a replaceable `AgentSessionRuntime`;
4. release-specific guidance added in Pi `0.84.3`.

The user also approved a separate, complete “Build Your Own Pi-style Agent” course. It must not be mixed into the production SDK chapter sequence, and it must not present its teaching interfaces as Pi public APIs.

## Goals

- Keep Pi SDK documentation as the primary reading path.
- Refresh active SDK guidance from `0.84.2` to the published `0.84.3` release.
- Add one SDK chapter and three task-oriented SDK guides for testing, evaluation, and runtime hosting.
- Add a new top-level course group with an overview and all checkpoints `00` through `14` in English and Vietnamese.
- Ship an offline, deterministic TypeScript workshop whose implementation and focused tests support every course checkpoint.
- Preserve the depth and structure of every existing page while applying only targeted release corrections.
- Keep the public site, search, clean routes, locale switching, machine-readable endpoints, and Vercel deployment behavior unchanged.

## Non-goals

- Replacing the ten existing SDK chapters with a translation of `pi-textbook`.
- Copying or translating `pi-textbook` prose, diagrams, code, labs, or checkpoint history.
- Publishing Chinese as a third locale.
- Claiming that workshop types or functions are Pi SDK APIs.
- Requiring API keys, network access, or paid models to complete the workshop.
- Documenting post-release `main` behavior as if it shipped in `0.84.3`.
- Shortening existing pages to make room for the new course.
- Creating a second documentation application, subdomain, package lockfile, or deployment target.

## Source authority and release boundary

Active SDK instructions target the packages published as `0.84.3` and the matching `v0.84.3` source tag at `4e58f324`. Package signatures, exported names, event contracts, configuration, and examples must be verified against that release.

Upstream `main` was audited at `dcd4619`. It contains post-tag changes, including compaction and llama-provider work that is not part of the published `0.84.3` package. Such changes may appear only in a clearly labeled unreleased note or be omitted. They must not be folded into runnable `0.84.3` examples.

`pi-textbook` is a research reference for topic selection and teaching cadence. The Pify course will use original prose, original diagrams, original code, and original exercises validated against the published Pi release. The course may teach the same public facts and general engineering concepts, but it will not reproduce the source's expression or checkpoint implementation.

## Information architecture

The current start, How-to, Reference, and SDK chapter groups remain in place. A new top-level sidebar group appears after the SDK chapter sequence and before Help:

```text
Build Your Own Pi-style Agent
├── Course overview
├── 00 · Follow one complete Agent trace
├── 01 · TypeScript protocols
├── 02 · EventStream
├── 03 · Message IR
├── 04 · Deterministic model
├── 05 · Provider adapter
├── 06 · Tool contract
├── 07 · Agent Loop
├── 08 · Coding Tools
├── 09 · Stateful Agent
├── 10 · Session Tree
├── 11 · Context Compaction
├── 12 · Resources and Extensions
├── 13 · Runtime Composition
└── 14 · Agent Evaluation
```

The public paths are locale-prefixed:

- `/en/course` and `/vi/course` for the overview;
- `/en/course/00-complete-agent-trace` through `/en/course/14-agent-evaluation`;
- the same 15 checkpoint slugs under `/vi/course/`.

`content/en/course/meta.json` and `content/vi/course/meta.json` own the localized group titles and stable checkpoint order. The root locale metadata links the new course group without flattening its pages into the SDK chapter list.

## Pi SDK additions

### Chapter 11: Testing and Agent Evaluation

`ch11-testing-evaluation.md` explains the test layers around Pi:

- protocol and adapter tests;
- deterministic provider tests;
- Agent Loop and Tool round-trip invariants;
- session and active-path assertions;
- end-to-end harnesses;
- deterministic judges versus model-backed judges;
- repeated comparative evaluation;
- infrastructure failure versus task failure;
- artifact privacy, cost, and reproducibility.

The chapter uses Pi `0.84.3` names and links to the release-pinned faux-provider, Agent E2E, and eval harness sources.

### How-to: Test an Agent deterministically

`how-to/test-agent-deterministically.md` uses public `@earendil-works/pi-ai@0.84.3` faux-provider exports and `@earendil-works/pi-agent-core@0.84.3`. It scripts a Tool call followed by a final answer, verifies the provider requests and transcript, covers cancellation and exhausted responses, and cleans up provider registration. It performs no external request and uses no secret.

### How-to: Run Pi evals

`how-to/run-pi-evals.md` targets a Pi source checkout because `@earendil-works/pi-evals` is a private monorepo package rather than a public SDK dependency. It covers one smoke eval, a Pi coding-agent harness, deterministic and model-backed judges, baseline/candidate comparison, repetitions, telemetry, artifact locations, and safe cleanup. Model-backed execution is explicitly optional and warns about provider cost and sensitive session artifacts.

### How-to: Host a replaceable session runtime

`how-to/host-session-runtime.md` explains when to use `createAgentSession()` versus `createAgentSessionRuntime()`, how new/resume/fork/clone/import replace the active session, why subscriptions must be rebound, how to serialize host operations, and how to dispose old resources. It uses only APIs exported by `@earendil-works/pi-coding-agent@0.84.3`.

## Pi `0.84.3` refresh

The refresh audits every active `0.84.2` package example and release-pinned source link. It updates version references only after checking that the corresponding code still compiles or the claim still exists at `v0.84.3`.

Required release updates include:

- the optional `powershell` Tool, `createPowerShellTool()`, `PowerShellOperations`, and `defaultTools` behavior;
- shell-session environment wording that applies to both `bash` and `powershell`;
- the `session_compact_failed` Extension event shipped in `0.84.3`;
- the `GoogleThinkingLevel` to `GoogleApiThinkingLevel` rename and the new `ResolvedGoogleThinkingLevel` type;
- relevant Tool, provider, model, settings, and Windows guidance from the `0.84.3` changelogs.

Post-tag fixes found only after `4e58f324`, including rejection of truncated compaction summaries, are not active `0.84.3` behavior. If mentioned, they are labeled unreleased and excluded from executable release examples.

## Course content contract

The course consists of an overview plus 15 checkpoint pages. Each checkpoint contains:

1. a concrete outcome and prerequisite map;
2. a mechanism-first explanation;
3. an original diagram or execution timeline when it materially improves comprehension;
4. the code introduced at that checkpoint;
5. a focused test and exact command;
6. one controlled failure experiment;
7. acceptance criteria;
8. a clearly labeled comparison with Pi SDK `0.84.3`;
9. a short handoff to the next checkpoint.

The course uses two explicit labels:

- **Course implementation** for workshop-only APIs and simplified mechanisms;
- **Pi SDK 0.84.3** for release behavior and production-facing exports.

The overview states that the workshop is educational, unofficial, and not API-compatible with Pi unless a section names a verified public export.

## Course file layout

The localized content files are:

```text
content/en/course/
content/vi/course/
├── index.mdx
├── 00-complete-agent-trace.md
├── 01-typescript-protocols.md
├── 02-event-stream.md
├── 03-message-ir.md
├── 04-deterministic-model.md
├── 05-provider-adapter.md
├── 06-tool-contract.md
├── 07-agent-loop.md
├── 08-coding-tools.md
├── 09-stateful-agent.md
├── 10-session-tree.md
├── 11-context-compaction.md
├── 12-resources-extensions.md
├── 13-runtime-composition.md
├── 14-agent-evaluation.md
└── meta.json
```

Each public course page has ordinary Pify frontmatter: title, description, `translation_key`, language, checkpoint number where applicable, review status, update date, translator, reviewer, and current official Pi references when needed. It does not carry `pi-textbook` source metadata or a per-page adaptation notice.

## Workshop architecture

The workshop lives at repository root under `course/` and uses the root dependency lockfile:

```text
course/
├── README.md
├── tsconfig.json
├── fixtures/
├── src/
│   ├── demo/prologue.ts
│   ├── protocol.ts
│   ├── event-stream.ts
│   ├── messages.ts
│   ├── scripted-model.ts
│   ├── provider-adapter.ts
│   ├── tool.ts
│   ├── agent-loop.ts
│   ├── coding-tools.ts
│   ├── agent.ts
│   ├── session.ts
│   ├── context.ts
│   ├── resources.ts
│   ├── runtime.ts
│   ├── eval.ts
│   └── index.ts
└── test/
    ├── 00-complete-agent-trace.test.ts
    ├── 01-typescript-protocols.test.ts
    ├── 02-event-stream.test.ts
    ├── 03-message-ir.test.ts
    ├── 04-deterministic-model.test.ts
    ├── 05-provider-adapter.test.ts
    ├── 06-tool-contract.test.ts
    ├── 07-agent-loop.test.ts
    ├── 08-coding-tools.test.ts
    ├── 09-stateful-agent.test.ts
    ├── 10-session-tree.test.ts
    ├── 11-context-compaction.test.ts
    ├── 12-resources-extensions.test.ts
    ├── 13-runtime-composition.test.ts
    └── 14-agent-evaluation.test.ts
```

The workshop is one cumulative reference implementation. Each focused test isolates the contract introduced by its checkpoint, while the full suite proves that later additions did not break earlier layers. Learners can copy `course/` to a practice directory and implement modules in checkpoint order; this first release does not include a checkpoint generator or hidden solution branch.

The workshop obeys these boundaries:

- no provider network calls or credentials;
- deterministic scripted model and normalized transport fixtures;
- filesystem effects restricted to per-test temporary workspaces;
- platform-neutral process fixtures that run on supported Windows and CI environments;
- bounded output, explicit cancellation, and cleanup for Tool tests;
- append-only session fixtures with explicit recovery checks;
- isolated evaluation fixtures and reports that omit transcript and file contents;
- no dependency on unpublished Pi internals.

The root package adds `test:course` for the full workshop and `test:course:checkpoint` for one explicit test path:

```bash
npm run test:course:checkpoint -- course/test/04-deterministic-model.test.ts
npm run test:course
```

## Bilingual editorial contract

English is the canonical technical edition. Vietnamese matches its heading hierarchy, code-fence languages, diagrams, tables, examples, warnings, and factual depth. Neither edition is a literal translation of `pi-textbook`.

Exact identifiers remain unchanged across languages: package names, imports, types, functions, fields, events, filenames, commands, configuration keys, environment variables, and protocol values. Established IT/Coding terms remain in English when translation would reduce precision. The glossary adds paired definitions for test double, fixture, harness, judge, verdict, held-out evaluation, composition root, and fail-closed.

No existing page may lose unique explanations, examples, diagrams, or edge cases during the release refresh. An update that removes existing content still requires the preservation ledger's `technically-invalid` or `duplicate` evidence.

## Attribution and licensing

The repository remains `GPL-3.0-only`. The course is original Pify content and code. It does not copy or translate copyrighted expression from `pi-textbook`, so it does not add a per-page license, `NOTICE`, or attribution banner.

README's existing “Sources and attribution” list gains one concise bullet identifying `pi-textbook` as a pedagogical research reference. No additional attribution is rendered on course pages.

## Manifest, search, and route changes

The translation manifest grows from 23 to 43 page pairs:

- 4 new Pi SDK pairs;
- 16 new course pairs.

The public content count grows from 46 to 86 files. Sitemap, LLM text endpoints, search indexing, locale switching, clean Markdown-link rewriting, canonical metadata, and alternate-language links must cover all 86 public routes. Unsupported locales remain `404`, and direct legacy `.md/.mdx` URLs continue to redirect to clean localized paths.

## Validation design

### Content and preservation

- Translation manifest, frontmatter, navigation, and sync checks expect 43 pairs.
- EN/VI course headings, code fences, diagram blocks, and internal links remain structurally aligned.
- New pages receive preservation baselines after their first approved version so later edits cannot silently shorten them.
- Existing 23 pairs retain their current preservation baselines and deletion rules.
- Editorial lint covers all 86 public files.

### Workshop and SDK examples

- Every checkpoint has one focused Vitest file that fails before its implementation exists and passes after the checkpoint is complete.
- `npm run test:course` runs all checkpoint tests offline.
- SDK guide examples are compiled against the published `0.84.3` packages in an isolated verification fixture.
- The Pi eval guide is checked against the release-pinned source checkout rather than installed as a public package.

### Application and browser behavior

- Unit tests verify all 43 translation pairs and the new course paths.
- E2E verifies course navigation, locale switching on the same checkpoint, locale-scoped search, clean internal links, responsive sidebar behavior, syntax highlighting, and Mermaid rendering.
- Sitemap contains 86 documentation URLs.
- `llms.txt` exposes 43 entries per locale and `llms-full.txt` contains the full new content.
- Formatting, ESLint, TypeScript, production build, and `git diff --check` remain required.

## Delivery sequence

Implementation proceeds in reviewable batches:

1. release-source fixture, expected failing `0.84.3` checks, and manifest/test scaffolding;
2. targeted `0.84.3` refresh of existing SDK content;
3. SDK Chapter 11 and the three SDK How-to pairs;
4. workshop protocols through Agent Loop, checkpoints `00–07`;
5. workshop Coding Tools through Evaluation, checkpoints `08–14`;
6. course overview and EN/VI checkpoint pages `00–07`;
7. EN/VI checkpoint pages `08–14`;
8. glossary, README source reference, navigation, search, and preservation baselines;
9. independent technical, English, Vietnamese, code, and render review;
10. full local verification, direct push to `main`, GitHub Actions monitoring, and Vercel production verification.

Each batch is committed separately. Existing unrelated worktree changes are not modified.

## Risks and controls

| Risk | Control |
| --- | --- |
| Course duplicates the SDK book | Separate navigation and explicit course-versus-SDK labels |
| Unreleased `main` behavior leaks into `0.84.3` docs | Verify active claims at tag `v0.84.3`; label or omit post-tag changes |
| Course code drifts from prose | One focused test per checkpoint and exact file/test links in both locales |
| EN/VI depth diverges | Structural sync checks, paired review, and shared preservation manifest |
| Model-backed evals incur cost or leak data | Keep workshop offline; mark model eval optional; document artifact sensitivity |
| New content is silently shortened later | Establish preservation baselines immediately after approval |
| Large change becomes hard to review | Commit and review in the ten delivery batches above |

## Acceptance criteria

- Pi SDK active guidance targets published package `0.84.3` and source tag `v0.84.3`.
- No post-tag behavior is presented as released `0.84.3` behavior.
- The SDK track contains Chapter 11 and all three approved How-to guides in English and Vietnamese.
- The new course group contains an overview and all checkpoints `00–14` in both locales.
- Course prose, diagrams, code, labs, and failure experiments are original Pify work.
- The offline workshop passes all 15 focused test files without credentials or network access.
- All 43 EN/VI pairs have matching structure, reviewed metadata, valid links, and preservation coverage.
- Sitemap exposes 86 localized documentation URLs; search and LLM endpoints include every new page.
- README names `pi-textbook` only as a pedagogical research reference; no per-page notice is added.
- Content, preservation, editorial, course, unit, lint, formatting, typecheck, build, and E2E gates pass on Node.js `22.19.0` or newer Node 22.
- GitHub Actions pass for the final `main` commit and Vercel serves the new SDK and course routes in both locales.
