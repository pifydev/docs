# Pi 0.99.2 Documentation Refresh — Design Spec

- **Date:** 2026-10-01
- **Status:** Approved
- **Owner:** Pify Docs maintainers
- **Documentation baseline:** Pi `0.87.1`
- **Target release:** Pi `0.99.2`
- **Target tag commit:** `005af57d88ee23b33778f343a9595b32e67ff788`
- **Intermediate releases included:** Pi `0.99.0` and `0.99.1`

## 1. Decision

Upgrade the complete English/Vietnamese documentation baseline from Pi `0.87.1`
to `0.99.2`. Audit every existing public page, add focused bilingual guides for
Codemode/MCP, Virtual Models, and the experimental Durable Agent Harness, and
integrate the remaining release changes into the pages where readers already
expect those concepts.

The migration preserves the current Fumadocs interface, public URLs, course
scope, explanatory depth, examples, diagrams, and centralized provenance
policy. Content may be removed only when exact `v0.99.2` evidence proves it is
incorrect or duplicated on the same page.

## 2. Goals

- Make Pi `0.99.2` the single current baseline across entry points, guides,
  references, course comparisons, source links, examples, package pins, and
  verification fixtures.
- Cover the complete published `0.99.0` through `0.99.2` release chain instead
  of treating the work as a patch-note update.
- Add complete English and Vietnamese guides for Codemode/MCP, Virtual Models,
  and Durable Agent development.
- Correct version-sensitive API, configuration, runtime, lifecycle, security,
  and recovery claims using exact published source and declarations.
- Preserve all 43 existing English/Vietnamese pairs and add three pairs, for a
  final total of 46 pairs and 92 public content files.
- Keep API identifiers and IT/Coding terms in English while making surrounding
  prose natural and technically precise in both languages.
- Compile-check copyable TypeScript examples against the exact `0.99.2`
  packages without contacting real providers or MCP servers.
- Prevent obsolete `0.87.1` baseline claims and post-tag `main` behavior from
  appearing as current `0.99.2` guidance.

## 3. Non-goals

- Do not redesign the Fumadocs interface, branding, navigation model, or Vercel
  deployment topology.
- Do not add a locale, rename an existing route, or remove an existing page.
- Do not mirror the complete information architecture of `pi.dev/docs/latest`.
- Do not shorten or flatten existing explanations merely to resemble upstream
  documentation.
- Do not rewrite the independent Course implementation to mirror Pi internals.
- Do not describe post-`v0.99.2` commits from `D:\pi` as released behavior.
- Do not present `@earendil-works/pi-durable` as stable or as a mandatory
  replacement for Agent Core and SessionManager.
- Do not add per-page translation, adaptation, or attribution notices; the
  centralized README provenance policy remains unchanged.

## 4. Source of truth

Evidence is evaluated in this order:

1. Published GitHub releases:
   - `https://github.com/earendil-works/pi/releases/tag/v0.99.2`
   - `https://github.com/earendil-works/pi/releases/tag/v0.99.1`
   - `https://github.com/earendil-works/pi/releases/tag/v0.99.0`
2. Exact source at commit
   `005af57d88ee23b33778f343a9595b32e67ff788` in the local `D:\pi`
   checkout.
3. Published npm metadata and declarations for version `0.99.2`.
4. Official Markdown documentation contained in tag `v0.99.2`.
5. `https://pi.dev/docs/latest` as a secondary source for topic organization
   and reader-facing explanations.

The release tag, commit, npm metadata, and public declarations must agree before
an API is described as published. The `latest` site and post-tag `main` may
suggest topics to inspect, but they cannot establish `0.99.2` behavior.

The release contract records:

- version `0.99.2`;
- tag `v0.99.2`;
- commit `005af57d88ee23b33778f343a9595b32e67ff788`;
- publication timestamp `2026-09-30T19:30:47Z`;
- Node.js requirement `>=22.19.0`;
- included release tags `v0.99.0`, `v0.99.1`, and `v0.99.2`;
- exact package versions used by every compile fixture.

## 5. Options considered

### 5.1 Selected: release-pinned expansion

Audit the complete current documentation and add three focused bilingual guides.
Use upstream documentation for discoverability while verifying technical claims
against the exact release tag. This approach preserves Pify's depth and course
while giving the major new capabilities enough space to be useful.

### 5.2 Rejected: mirror most of Pi Docs

Mirroring `pi.dev/docs/latest` would create substantial duplication, discard the
existing teaching structure, and introduce drift whenever the upstream latest
site moves beyond `v0.99.2`.

### 5.3 Rejected: baseline-only refresh

Changing package pins, API names, and the changelog without dedicated guides
would leave Codemode/MCP, Virtual Models, and Durable Agent behavior too shallow
for readers to use safely.

## 6. Release changes that require documentation

### 6.1 Codemode, Tool search, and MCP from `0.99.0`

Document Codemode as model-written JavaScript executed in a QuickJS sandbox that
can orchestrate Pi Tools. Explain how `tool_search`, `searchTools()`,
`describeTool()`, `describeNamespace()`, and `ALL_TOOLS` expose tools without
placing every schema in the model request.

Cover MCP over stdio and streamable HTTP, global and trusted-project
configuration, CLI and `/mcp` management, OAuth, extension registration,
resources, and the Tool pipeline. Explain `direct`, `model-only`, `codemode`,
`deferred`, and `hidden` exposure where each is part of the public extension or
MCP contract.

Update Tool guidance for `namespace`, annotations, `outputSchema`,
`structuredContent`, `isError`, `prepareLoadout()`, `ctx.executeTool()`, nested
calls, `parentToolCallId`, and bounded `nestedCalls`.

### 6.2 Virtual Models and multi-operation ModelRuntime from `0.99.0`

Explain the difference between a selected virtual model and the physical model
used for each request. Cover registration, request routing, thinking-level
mapping, session restoration, cost reporting, context limits, and compaction
behavior without implying that a router guarantees an optimal choice.

Update model and API guidance for image generation and classifier operations,
their model accessors, runtime-resolved authentication, Jev classifiers, and the
catalog's chat/image/classifier distinction. Chat-only accessors and model
selection behavior must remain clearly separated from the new operations.

### 6.3 Authentication, configuration, TUI, and RPC from `0.99.0`

Integrate Sign in with ChatGPT for the OpenAI provider, the legacy OpenAI Codex
label, the default system theme, extended theme color formats, built-in
extension identifiers, additive/removal `defaultTools` entries, and the
`fullscreenWheelScrollLines` setting into existing pages.

Document successful RPC input disposition and `streamingBehavior` only where
the current RPC/session guidance requires it. Include the session-file creation
boundary at the first user message and relevant fixes where an existing claim
would otherwise be wrong.

### 6.4 GPT-6.1 Sol from `0.99.1`

Update model-selection guidance for `gpt-6.1-sol` on OpenAI, Azure OpenAI
Responses, and OpenAI Codex, including its role as the OpenAI Codex default at
this release. Retain model catalogs as generated authority rather than creating
large hand-maintained tables.

### 6.5 MCP lifecycle and authentication from `0.99.2`

Document server descriptions, `oauth.clientName`, provider-token authentication,
namespace normalization, collision handling, background connection behavior,
and `/reload` semantics for newly added default Tools.

Clarify that the first prompt waits only for servers with `direct` Tools. Other
servers are awaited when Codemode, Tool search, or resource access needs them.
MCP Tool calls are not retried because the remote operation may already have
caused a side effect; only the documented connection and resource-read paths
receive bounded transient retries.

### 6.6 Experimental Durable Agent Harness at `0.99.2`

Add a focused guide for `@earendil-works/pi-durable` and label the API
experimental. Cover Harness, Conversation, immutable Entry, atomic Commit,
typed Document, durable Task, Submission, Registry, and the distinction between
a Turn and a run.

Explain persistence and recovery, request-ID deduplication, Tool replay policy,
inbox scheduling, resets, compaction, structural views, experimental events,
hooks, forks, ownership, foreground/background subagents, child Tasks,
structured concurrency, usage, and storage backends at the depth needed to
build a small correct host.

The guide must state that cancelling a wait does not cancel durable work, only
`replay: "safe"` permits a Tool to rerun after interruption, background Tasks
form an abort boundary, abort proceeds bottom-up, and one process owns a storage
instance at a time.

## 7. Content architecture

### 7.1 New pages

Add these paired routes under the existing How-to navigation:

- `content/en/how-to/use-codemode-and-mcp.md`
- `content/vi/how-to/use-codemode-and-mcp.md`
- `content/en/how-to/route-virtual-models.md`
- `content/vi/how-to/route-virtual-models.md`
- `content/en/how-to/build-durable-agent.md`
- `content/vi/how-to/build-durable-agent.md`

The pages are complete guides, not release summaries. They include mental
models, configuration or TypeScript examples, operational boundaries, failure
modes, security notes, and links to exact release source.

### 7.2 Existing pages

README, landing pages, quickstart, FAQ, glossary, and bilingual changelog move to
the `0.99.2` authority. Chapters and references receive targeted edits for
models, authentication, Tools, events, sessions, compaction, configuration, and
environment changes. Stable explanations remain intact.

The changelog adds one structured `0.99.2` documentation rollup covering all
three `0.99.x` releases while preserving older entries as history.

### 7.3 Course

Every "Compare with Pi SDK" section and pinned source URL moves to `0.99.2`.
Course code remains a deliberately smaller teaching implementation. Comparison
notes describe the new production contracts only where they affect the lesson;
the Course does not acquire Codemode, MCP, Virtual Model, or Durable internals
solely for parity.

## 8. Safety and semantic boundaries

- A QuickJS Codemode sandbox restricts the script runtime; it does not make the
  Tools it calls harmless or remove the Pi process's filesystem and process
  permissions.
- Project trust controls which project resources Pi loads. It is not a Tool-call
  sandbox.
- MCP exposure controls discoverability and declaration, not authorization.
  Extension Tool handlers and permission gates remain part of the call pipeline.
- Virtual selection and physical dispatch are separate state. Provider requests,
  assistant messages, cost, context limits, and compaction must be attributed to
  the physical model where the release does so.
- Durable persistence does not make arbitrary side effects replay-safe. Replay
  policy is an explicit Tool declaration and must be explained with failure and
  crash examples.
- Experimental packages and subpaths receive no compatibility guarantee beyond
  the pinned release.

## 9. Translation contract

English and Vietnamese are edited as one semantic unit. Paired pages retain the
same headings, code blocks, callouts, tables, links, and technical claims. API
names, types, events, commands, flags, package names, configuration keys, and
common IT/Coding terms remain in English. Vietnamese prose may use a different
word order for naturalness but cannot weaken or broaden the English claim.

The final bilingual review ledger covers all 46 pairs and records exact source
evidence, files checked, code-fence counts, audit outcome, and any source-proven
deletion.

## 10. Release fixtures and compile contracts

- Replace the current `pi-release-0871.json` authority fixture with a
  `pi-release-0992.json` fixture.
- Move active core compile coverage from an `0871` fixture to an `0992` fixture.
- Keep focused compile fixtures for Coding Agent/Codemode/MCP/Virtual Models and
  Durable/Chord so one large fixture does not mix unrelated contracts.
- Pin these direct packages to exactly `0.99.2` and regenerate the npm lockfile
  through the package manager:
  - `@earendil-works/pi-ai`
  - `@earendil-works/pi-agent-core`
  - `@earendil-works/pi-coding-agent`
  - `@earendil-works/pi-server`
  - `@earendil-works/pi-durable`
  - `@earendil-works/chord`
- Compile examples against published declarations and run deterministic examples
  offline with faux providers or in-memory components.
- Preserve historical version strings inside changelog entries and approved
  design/plan records; global text replacement is not a correctness strategy.

## 11. Verification design

Automated verification must prove:

1. The release fixture identifies the exact tag, commit, publication time, Node
   requirement, and complete `0.99.x` release list.
2. All six direct Pi packages are pinned to exact `0.99.2` versions.
3. The translation manifest contains 46 unique pairs and frontmatter validation
   covers 92 public files.
4. Both navigation trees contain the same three new routes in matching order.
5. Core, Coding Agent, and Durable examples compile against the installed public
   declarations without network access.
6. The new pages satisfy relationship-based semantic contracts, including MCP
   retry/side-effect rules, selected-versus-physical model state, and Durable
   replay/ownership/storage boundaries.
7. Active docs do not present `0.87.1` as current or teach APIs removed by
   `0.99.2`; historical occurrences remain allowed only in explicit history or
   migration contexts.
8. Public technical source links pin the target commit rather than `main` or
   `/latest`.
9. English/Vietnamese structure, code samples, and technical relationships
   remain synchronized.
10. Existing preservation, links, frontmatter, Mermaid, syntax highlighting,
    navigation, search, and clean-route behavior continue to pass.

New behavior is developed test-first: each contract is written and observed
failing against the `0.87.1` baseline before the corresponding content or
fixture migration is implemented.

The final local sequence runs content, preservation, editorial, unit, Course,
release, eval-guide, sync, frontmatter, content, Mermaid, and application lint;
then TypeScript checking, format checking, a production build, and the complete
Playwright suite.

## 12. Execution and delivery

Implementation runs in a project-local ignored worktree on branch
`docs/pi-0992-update`. The root checkout's unrelated untracked files are not
modified. The `D:\pi` checkout is read-only and source is read from tag
`v0.99.2` without changing its current branch.

Changes are split into reviewable release authority, baseline migration,
Codemode/MCP, Virtual Models, Durable Agent, Course/audit, and final-quality
commits. Every substantive content edit changes the English and Vietnamese pair
together.

After all local gates pass:

1. fast-forward the verified branch into `main`;
2. push directly to `origin/main` under the user's existing authorization;
3. wait for Content Quality and Next.js Application Build on the exact head;
4. confirm Vercel production deploys that commit;
5. smoke-test `https://docs.pify.dev` in both locales, including the new routes,
   language switching, search, links, redirects, Mermaid, and highlighted code;
6. remove the temporary worktree only after the result is recoverable from
   `origin/main`.

## 13. Acceptance criteria

- All 43 existing public pairs remain present and three complete new pairs are
  added, for 46 synchronized EN/VI pairs.
- Current entry points identify Pi `0.99.2` and commit
  `005af57d88ee23b33778f343a9595b32e67ff788`.
- The bilingual changelog covers `0.99.0`, `0.99.1`, and `0.99.2` without
  deleting historical entries.
- Codemode/MCP, Virtual Models, and Durable Agent each have a complete focused
  guide with the required operational and safety boundaries.
- Existing model, Tool, event, session, compaction, configuration, environment,
  and Course claims match published `0.99.2` behavior.
- Direct dependencies and compile fixtures use exact published `0.99.2`
  declarations.
- Existing depth, routes, Fumadocs UI, Course scope, and centralized provenance
  policy are preserved.
- The full local quality suite, GitHub Actions, Vercel deployment, and public
  production smoke tests pass.
