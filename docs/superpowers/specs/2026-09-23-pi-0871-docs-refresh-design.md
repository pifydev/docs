# Pi 0.87.1 Documentation Refresh — Design Spec

- **Date:** 2026-09-23
- **Status:** Approved
- **Owner:** Pify Docs maintainers
- **Documentation baseline:** Pi `0.85.0`
- **Target release:** Pi `0.87.1`
- **Target tag commit:** `f07218c4d4bbc12bef056a7058c3dd49dfe41abe`
- **Intermediate releases included:** Pi `0.85.1`, `0.86.0`, `0.86.1`, and
  `0.87.0`

## 1. Decision

Upgrade the complete 43-pair English/Vietnamese documentation baseline from Pi
`0.85.0` to `0.87.1`. Audit every public page against the complete published
release chain, but make substantive edits only where exact release evidence
changes an API, behavior, configuration, model, workflow, or compatibility
claim.

The migration preserves the existing information architecture, URLs, course
scope, examples, diagrams, and explanatory depth. Content may be removed only
when it is demonstrably incorrect for `0.87.1` or duplicated on the same page.

## 2. Goals

- Make Pi `0.87.1` the single current baseline across entry points, guides,
  references, course comparisons, source links, examples, package pins, and
  verification fixtures.
- Cover all relevant changes from `0.85.1`, `0.86.0`, `0.86.1`, `0.87.0`, and
  `0.87.1`; do not present the migration as a patch-note-only update.
- Correct version-sensitive API and runtime claims using exact published source
  and declarations.
- Preserve all 43 English/Vietnamese page pairs and their structural parity.
- Keep API identifiers and IT/Coding terms in English while making surrounding
  prose natural and technically precise in both languages.
- Compile-check copyable TypeScript examples against the exact `0.87.1`
  packages.
- Prevent obsolete `0.85.0` baseline claims, release-scoped workarounds, and
  removed APIs from surviving in active guidance.

## 3. Non-goals

- Do not redesign the Fumadocs interface, navigation, branding, or deployment
  topology.
- Do not add a locale or rename public routes.
- Do not shorten or flatten existing explanations merely to match upstream's
  current documentation layout.
- Do not rewrite the independent Course implementation to mirror Pi internals.
- Do not document post-tag `main` behavior as released functionality.
- Do not broaden stability guarantees for experimental packages or subpaths.
- Do not add per-page translation, adaptation, or attribution notices; the
  centralized README provenance policy remains unchanged.

## 4. Source of truth

Evidence is evaluated in this order:

1. Published GitHub releases:
   - `https://github.com/earendil-works/pi/releases/tag/v0.87.1`
   - `https://github.com/earendil-works/pi/releases/tag/v0.87.0`
   - `https://github.com/earendil-works/pi/releases/tag/v0.86.1`
   - `https://github.com/earendil-works/pi/releases/tag/v0.86.0`
   - `https://github.com/earendil-works/pi/releases/tag/v0.85.1`
2. Exact source at commit
   `f07218c4d4bbc12bef056a7058c3dd49dfe41abe`.
3. Published npm package metadata and declarations for version `0.87.1`.
4. Official Markdown documentation contained in tag `v0.87.1`.

The release tag, commit, npm metadata, and declarations must agree before an API
is described as published. Later `main` commits can explain history but cannot be
used as `0.87.1` behavior.

The release contract records at least:

- version `0.87.1`;
- tag `v0.87.1`;
- commit `f07218c4d4bbc12bef056a7058c3dd49dfe41abe`;
- publication timestamp `2026-09-22T19:43:43Z`;
- Node.js requirement `>=22.19.0`;
- exact package versions used by compile fixtures;
- included release tags `v0.85.1`, `v0.86.0`, `v0.86.1`, `v0.87.0`, and
  `v0.87.1`.

## 5. Options considered

### 5.1 Selected: verified full-baseline migration

Audit the complete `v0.85.0..v0.87.1` release boundary and classify each current
claim as unchanged, changed, newly relevant, obsolete, or historical. This
preserves stable content while directing edits toward verified behavior changes.

### 5.2 Rejected: update only the `0.87.1` patch notes

This would leave the breaking changes introduced in `0.86.0` and `0.87.0`
undocumented while falsely presenting older samples as current.

### 5.3 Rejected: replace Pify Docs with upstream documentation

Upstream's reorganized pages are useful evidence, not a replacement information
architecture. A wholesale import would discard bilingual depth, course framing,
and Pify-specific editorial work without improving unchanged technical claims.

## 6. Release changes that require documentation

### 6.1 The `0.85.1` publication boundary

Remove the `0.85.0`-only workaround that installed extra internal runtime
dependencies solely to make the public Coding Agent root import load. The fix in
`0.85.1` made the experimental `client` and `experimental/plugin` subpaths
source-only while leaving the supported local SDK and stdio RPC API intact.

Document GPT-6 Astra only where model catalogs or provider selection are in
scope. Keep historical `0.85.0` wording in the changelog or archived design
records, not in current installation guidance.

### 6.2 Provider and value contracts from `0.86.0`

Update custom provider examples and explanations for normalized
`TranscriptContext`. System prompts and tool declarations must be read from the
transcript with `getCurrentSystemPrompt()` and `getCurrentTools()` rather than
from the former provider-stream `Context` shape.

Update tool contracts for JSON-compatible `ToolCall.arguments` and
`ToolResultMessage.details`, conditional `ToolResultMessage`, and readonly
`JsonValue` arrays. Explain the `user_bash` fail-closed contract precisely:
`undefined` continues propagation, while valid `{ operations }` or `{ result }`
values handle the event; errors and invalid defined values must not silently
fall through to local execution.

### 6.3 Configuration and operational features from `0.86.x`

Integrate the features where they fit existing pages rather than creating a
release-note dump:

- cost-aware prompt-cache warming, including model metadata, long-tool and idle
  behavior, diagnostics, and `cache_warming_decision`;
- `/bug` reports, local ZIP export, redaction, offline behavior, crash metadata,
  and transcript consent boundaries;
- transcript-backed prompt and tool updates;
- per-model compaction budgets;
- Radius catalog behavior and Meta Muse authentication;
- `ctx.modelRegistry.stream()` and `streamSimple()`;
- the unsubscribe function returned by `pi.on()`;
- default strict-prefer sampling for built-in tools;
- direct RPC `steer` and `follow_up` passing through extension `input` handlers.

Provider-specific fixes should be added only when an existing guide makes a
claim that would otherwise be incomplete or wrong.

### 6.4 Canonical session context from `0.87.0`

Describe `SessionManager` as canonical for future provider context. Assigning
`session.agent.state.messages` no longer replaces future request history.
Restoration and mutation guidance must use the public session contracts,
including `SessionManager.inMemory(...)`, `session.navigateTree()`, append
operations through `session.sessionManager`, and `session.refreshContext()`.

Document append-only context edits and `ContextEditEntry`. Exhaustive
`SessionEntry` switches must handle `context_edit`; `replacement: null` omits a
message from future provider context without rewriting raw transcript or UI
history.

### 6.5 Agent and extension lifecycle from `0.87.0`

Replace `shouldStopAfterTurn` with `finishTurn`. Migration examples must show
`{ action: "end" }` for a normal-response stop and `undefined` for error or
aborted responses that should follow default hard-exit handling.

Update lifecycle coverage for:

- required boundary fields on `TurnEndEvent`;
- `AgentBeforeSettleEvent` in the exported `ExtensionEvent` union;
- actionable `turn_end` and `agent_before_settle` results;
- host dispatch through `emitBoundary(baseEvent, buildContext)` rather than
  `ExtensionRunner.emit("turn_end", ...)`;
- deferred runs requested from `agent_settled` handlers;
- `context` operating without system messages and Pi restoring prompt/tool
  state after handlers;
- `context_with_system` receiving and returning the full transcript verbatim.

### 6.6 Compaction and image limits from `0.87.x`

Cover retain-none compaction boundaries, context-edit accounting, abandoned
attempt omission, cache warming interactions, and split-turn summary behavior
only to the depth required by the existing compaction and session guides.

Document per-model `inputLimits.images.resize` where attachments, `read`, tool
results, model configuration, or cache-safe preprocessing are explained.

### 6.7 Models and provider defaults from `0.87.1`

Update relevant model/provider guidance for Claude Opus 5.5, GPT-6 Sol, GPT-6
Luna, supported GitHub Copilot routes, and the new Grok 4.7 xAI default. Avoid
turning generated model catalogs into hand-maintained exhaustive tables.

Include the `--mode` validation change and image-only OpenAI-compatible request
fix only where current CLI or provider prose would otherwise imply the old
behavior.

## 7. Content architecture

### 7.1 Entry points and history

README, FAQ, landing copy, and release metadata identify `0.87.1` as the current
baseline and link to the exact release and commit. The bilingual changelog adds a
structured `0.87.1` rollup covering the complete skipped release chain while
retaining older entries as history.

### 7.2 Guides and references

Targeted edits land in the existing conceptual, how-to, and reference pages.
Source frontmatter and inline source maps are pinned to the exact target commit.
Stable descriptions remain intact; no page is rewritten simply because upstream
moved or split its own documentation.

### 7.3 Course

All "Compare with Pi SDK" sections and pinned source URLs move to `0.87.1`.
Workshop code remains deliberately smaller where that supports learning, but its
contrast notes must state the new production contracts accurately. A course
example is changed only when the published API or the comparison explanation
requires it.

### 7.4 Translation contract

English and Vietnamese are edited as one semantic unit. Paired pages retain the
same headings, code blocks, callouts, tables, links, and technical claims. API
names, type names, event names, commands, flags, package names, and common
IT/Coding terms remain in English; the surrounding Vietnamese must be natural,
not literal or mechanically translated.

## 8. Release fixtures and package pins

- Replace the current `pi-release-0850.json` authority fixture with a
  `pi-release-0871.json` fixture.
- Rename the `pi-sdk-0850` compile fixture and every active test reference to an
  `0871` name.
- Pin directly imported Pi packages to exactly `0.87.1` and regenerate the npm
  lockfile through the package manager.
- Compile executable examples against published `0.87.1` declarations.
- Preserve historical version strings inside changelog entries and approved
  design/plan records; do not make global text replacement a correctness rule.

## 9. Verification design

Automated verification must prove:

1. The release fixture identifies the official tag, commit, publication time,
   Node requirement, and complete intermediate release list.
2. Direct Pi dependencies are exactly `0.87.1`, with no stale direct `0.85.0`
   package pin.
3. Compile fixtures use current declarations and exercise changed public
   contracts.
4. Active docs do not teach `shouldStopAfterTurn`, the old provider `Context`
   shape, the `0.85.0` root-import workaround, or direct message-array mutation
   as current behavior.
5. English/Vietnamese structure and code sample parity remain intact.
6. Stale version or commit references are allowed only in explicit historical
   contexts.
7. Links, frontmatter, Mermaid, syntax highlighting, navigation, and public
   routes still pass their existing checks.

The final verification sequence includes content tests, preservation checks,
editorial checks, course tests, release-contract tests, eval-guide tests,
frontmatter/sync/content/Mermaid lint, application lint, TypeScript checking, and
a production Next.js build.

## 10. Delivery

Implementation may be split into reviewable commits, but `main` must finish with
one coherent `0.87.1` baseline. After all local gates pass:

1. push the verified commits directly to `origin/main` as previously authorized;
2. confirm GitHub Actions succeeds;
3. confirm Vercel production deploys that exact commit;
4. smoke-test `https://docs.pify.dev` in English and Vietnamese, including
   navigation, language switching, source links, and highlighted code blocks.

## 11. Acceptance criteria

- All 43 public EN/VI pairs remain present and structurally synchronized.
- Current entry points identify Pi `0.87.1` and commit
  `f07218c4d4bbc12bef056a7058c3dd49dfe41abe`.
- The bilingual changelog covers the relevant `0.85.1` through `0.87.1`
  migration without deleting historical entries.
- Breaking API migrations from `0.86.0` and `0.87.0` are taught with valid
  `0.87.1` examples.
- Release-scoped `0.85.0` workarounds are removed from current instructions.
- Direct Pi packages and compile fixtures use exact published `0.87.1`
  declarations.
- Existing depth, course scope, routes, Fumadocs UI, and centralized provenance
  policy are preserved.
- The full local quality suite, GitHub Actions, Vercel production deployment, and
  public smoke tests pass.
