# Pi 0.87.1 Documentation Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade all active Pify English/Vietnamese documentation from the exact Pi `0.85.0` baseline to the published Pi `0.87.1` release while preserving content depth and correcting every affected API, behavior, model, configuration, and course comparison.

**Architecture:** Treat tag `v0.87.1` at commit `f07218c4d4bbc12bef056a7058c3dd49dfe41abe` and the matching npm packages as one immutable release boundary. Add focused failing contracts before each content batch, edit English and Vietnamese together, compile public examples against exact declarations, and end with a complete 43-pair audit plus production verification. Include `v0.85.1`, `v0.86.0`, `v0.86.1`, and `v0.87.0` because the current site jumps directly from `0.85.0` to `0.87.1`.

**Tech Stack:** Node.js 22.19, TypeScript 6, Node test runner, Vitest, Fumadocs Markdown/MDX, Next.js 16, Playwright, npm, Git, GitHub Actions, Vercel.

---

## Plan boundaries

- Start implementation from commit `afb012f` or a later clean `main` containing the approved design.
- Use an isolated implementation worktree and branch, then fast-forward or merge the verified result into `main` before pushing directly to `origin/main`.
- Preserve all 43 manifest entries, 86 localized public documents, public routes, and navigation order.
- Never edit or remove unrelated untracked generated artifacts already present in the root workspace.
- Do not rewrite historical files under `docs/superpowers/` or older review ledgers to imply they reviewed `0.87.1`.
- Do not reduce preservation floors. Add an approved deletion only when the exact `v0.87.1` source proves that the deleted statement is wrong or duplicated.
- Pin `official_refs` to `f07218c4d4bbc12bef056a7058c3dd49dfe41abe`; never replace source pins with `main`.
- Keep the Course implementation and tests stable. Only Pi comparison surfaces and source pins move to `0.87.1` unless a compile-checked public API requires a code correction.
- Use English as the canonical technical draft and produce structurally equivalent Vietnamese in the same task.
- Run tasks in order. Each task must be green before its commit.

## File responsibility map

### Release authority and executable contracts

- `scripts/fixtures/pi-release-0871.json`: machine-readable release identity and included-release list.
- `scripts/pi-release-contract.test.mjs`: release, API, content, parity, source-pin, and stale-baseline contracts.
- `tests/fixtures/pi-sdk-0871.contract.ts`: compile-only examples for the current public SDK.
- `scripts/pi-evals-guide.test.mjs`: exact eval-guide checkout and workflow contract.
- `scripts/content.test.mjs`: public entry-point baseline and review-authority contract.
- `scripts/course-content.test.mjs`: Course comparison labels, callouts, and pinned sources.
- `package.json`, `package-lock.json`: exact published Pi dependencies and quality commands.

The old `scripts/fixtures/pi-release-0850.json` and
`tests/fixtures/pi-sdk-0850.contract.ts` are renamed rather than retained as
parallel active fixtures.

### Current-baseline entry points

- `README.md`
- `course/README.md`
- `content/{en,vi}/index.mdx`
- `content/{en,vi}/quickstart.md`
- `content/{en,vi}/help/faq.md`
- `content/{en,vi}/changelog.md`

### Provider, tool, model, and configuration contracts

- `content/{en,vi}/ch03-agent-loop.md`
- `content/{en,vi}/ch04-model-invocation.md`
- `content/{en,vi}/ch05-tool-system.md`
- `content/{en,vi}/ch06-messages.md`
- `content/{en,vi}/ch07-event-driven.md`
- `content/{en,vi}/how-to/add-custom-tool.md`
- `content/{en,vi}/how-to/customize-system-prompt.md`
- `content/{en,vi}/how-to/plug-new-model.md`
- `content/{en,vi}/how-to/stream-output.md`
- `content/{en,vi}/reference/api.md`
- `content/{en,vi}/reference/configuration.md`
- `content/{en,vi}/reference/environment-variables.md`

### Session, context, compaction, runtime, and eval contracts

- `content/{en,vi}/ch08-context-engineering.md`
- `content/{en,vi}/ch09-compaction.md`
- `content/{en,vi}/ch10-session.md`
- `content/{en,vi}/ch11-testing-evaluation.md`
- `content/{en,vi}/how-to/host-session-runtime.md`
- `content/{en,vi}/how-to/persist-sessions.md`
- `content/{en,vi}/how-to/run-pi-evals.md`
- `content/{en,vi}/how-to/test-agent-deterministically.md`

### Course and audit evidence

- `content/{en,vi}/course/index.mdx`
- `content/{en,vi}/course/00-complete-agent-trace.md` through
  `content/{en,vi}/course/14-agent-evaluation.md`
- `docs/translation-review/2026-09-23-pi-0871.md`
- `content/preservation-manifest.json`, only when an evidence-backed deletion is unavoidable.

## Task 1: Replace the release authority and package baseline

**Files:**

- Rename: `scripts/fixtures/pi-release-0850.json` → `scripts/fixtures/pi-release-0871.json`
- Modify: `scripts/pi-release-contract.test.mjs`
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Point the release loader at the future fixture and make identity assertions red.**

  Change `releaseFixtureURL` to `fixtures/pi-release-0871.json` and replace the
  release identity test with:

  ```js
  test("release fixture identifies published Pi 0.87.1 authority", async () => {
    const release = await readReleaseFixture();
    assert.equal(release.packageVersion, "0.87.1");
    assert.equal(release.tag, "v0.87.1");
    assert.equal(
      release.commit,
      "f07218c4d4bbc12bef056a7058c3dd49dfe41abe",
    );
    assert.equal(release.publishedAt, "2026-09-22T19:43:43Z");
    assert.equal(release.nodeRequirement, ">=22.19.0");
    assert.equal(release.previousDocumentationVersion, "0.85.0");
    assert.deepEqual(release.includedReleaseTags, [
      "v0.85.1",
      "v0.86.0",
      "v0.86.1",
      "v0.87.0",
      "v0.87.1",
    ]);
    assert.equal(release.sourceStatus, "published");
  });
  ```

- [ ] **Step 2: Run the focused test and confirm the missing fixture fails.**

  Run:

  ```powershell
  node --test --test-name-pattern="release fixture" scripts/pi-release-contract.test.mjs
  ```

  Expected: FAIL with `ENOENT` for `pi-release-0871.json`.

- [ ] **Step 3: Rename the fixture and replace its complete JSON content.**

  ```json
  {
    "packageVersion": "0.87.1",
    "tag": "v0.87.1",
    "commit": "f07218c4d4bbc12bef056a7058c3dd49dfe41abe",
    "publishedAt": "2026-09-22T19:43:43Z",
    "nodeRequirement": ">=22.19.0",
    "previousDocumentationVersion": "0.85.0",
    "includedReleaseTags": [
      "v0.85.1",
      "v0.86.0",
      "v0.86.1",
      "v0.87.0",
      "v0.87.1"
    ],
    "sourceStatus": "published"
  }
  ```

- [ ] **Step 4: Pin every directly imported Pi package to exactly `0.87.1`.**

  Run:

  ```powershell
  npm install --save-dev --save-exact @earendil-works/pi-ai@0.87.1 @earendil-works/pi-agent-core@0.87.1 @earendil-works/pi-coding-agent@0.87.1 @earendil-works/pi-server@0.87.1
  ```

  Keep the root `package-lock.json` as the only active lockfile. Keep the package
  assertion loop tied to `release.packageVersion` instead of adding another
  hard-coded package version.

- [ ] **Step 5: Run the release identity and package-pin tests.**

  ```powershell
  node --test --test-name-pattern="release fixture|release contract packages" scripts/pi-release-contract.test.mjs
  ```

  Expected: all selected tests pass. Failures from the still-old compile fixture
  are outside this focused name pattern and are handled in Task 2.

- [ ] **Step 6: Commit the immutable release boundary.**

  ```powershell
  git add package.json package-lock.json scripts/fixtures scripts/pi-release-contract.test.mjs
  git commit -m "test: pin Pi 0.87.1 release authority"
  ```

## Task 2: Migrate the executable SDK fixture to `0.87.1`

**Files:**

- Rename: `tests/fixtures/pi-sdk-0850.contract.ts` → `tests/fixtures/pi-sdk-0871.contract.ts`
- Modify: `tests/fixtures/pi-sdk-0871.contract.ts`
- Modify: `scripts/pi-release-contract.test.mjs`

- [ ] **Step 1: Rename the compile fixture and all loader labels.**

  Replace every active path `tests/fixtures/pi-sdk-0850.contract.ts` with
  `tests/fixtures/pi-sdk-0871.contract.ts`, and replace diagnostic labels
  `Pi 0.85.0 compile fixture` with `Pi 0.87.1 compile fixture`.

- [ ] **Step 2: Run the release suite and capture the expected type failures.**

  ```powershell
  node --test --test-name-pattern="compile fixture" scripts/pi-release-contract.test.mjs
  ```

  Expected: FAIL because provider streams now receive `TranscriptContext`, the
  old request-capture code reads removed top-level prompt/tool properties, and
  newly required contracts are not yet exercised.

- [ ] **Step 3: Replace raw provider-context inspection with transcript helpers.**

  Update the `@earendil-works/pi-ai` imports and request capture to use this
  public shape:

  ```ts
  import {
    getCurrentSystemPrompt,
    getCurrentTools,
    type TranscriptContext,
  } from "@earendil-works/pi-ai";

  type ProviderRequestSummary = {
    roles: Array<TranscriptContext["messages"][number]["role"]>;
    systemPrompt: string;
    toolNames: string[];
    messages: TranscriptContext["messages"];
  };

  function captureTranscriptRequest(
    requests: ProviderRequestSummary[],
    context: TranscriptContext,
  ): void {
    requests.push({
      roles: context.messages.map((message) => message.role),
      systemPrompt: getCurrentSystemPrompt(context.messages),
      toolNames: getCurrentTools(context.messages).map((tool) => tool.name),
      messages: structuredClone(context.messages),
    });
  }
  ```

  Remove provider-side reads of `context.systemPrompt` and `context.tools`.
  Agent-facing `Context` usage may remain only where the public agent API still
  accepts that type.

- [ ] **Step 4: Add compile-only contracts for the `0.87.0` public boundary.**

  Add these imports and declarations to the fixture:

  ```ts
  import type { FinishTurn } from "@earendil-works/pi-agent-core";
  import {
    type AgentBeforeSettleEvent,
    type ContextEditEntry,
    SessionManager,
    type TurnEndEvent,
  } from "@earendil-works/pi-coding-agent";

  const finishAfterNormalResponse: FinishTurn = ({ message }) => {
    if (message.stopReason === "error" || message.stopReason === "aborted") {
      return undefined;
    }
    return { action: "end" };
  };

  const boundaryTypes = {
    beforeSettle: undefined as AgentBeforeSettleEvent | undefined,
    turnEnd: undefined as TurnEndEvent | undefined,
  };

  export function omitEntryFromFutureContext(
    manager: SessionManager,
    targetId: string,
  ): ContextEditEntry["id"] {
    return manager.appendContextEdit(targetId, null);
  }

  void [finishAfterNormalResponse, boundaryTypes];
  ```

  Do not construct synthetic `TurnEndEvent` or `AgentBeforeSettleEvent` values;
  their required context is host-generated. The compile contract verifies the
  exported types and the public context-edit method without inventing runtime
  fields.

- [ ] **Step 5: Update executable fixture assertions for system/tool transcript state.**

  Keep the existing deterministic two-request scenario, but assert the prompt
  and tools through the summaries returned by `captureTranscriptRequest`:

  ```ts
  assert.equal(requests[0]?.systemPrompt, "Use the add Tool for arithmetic.");
  assert.deepEqual(requests[0]?.toolNames, ["add"]);
  assert.deepEqual(requests[1]?.toolNames, ["add"]);
  ```

  Keep the existing complete Tool round-trip, stop reason, message ordering, and
  session/runtime assertions.

- [ ] **Step 6: Run compile and executable release contracts.**

  ```powershell
  node --test --test-name-pattern="compile fixture|deterministic Agent|session restoration|runtime guide" scripts/pi-release-contract.test.mjs
  ```

  Expected: all selected tests pass against installed `0.87.1` declarations.

- [ ] **Step 7: Commit the executable contract migration.**

  ```powershell
  git add tests/fixtures scripts/pi-release-contract.test.mjs
  git commit -m "test: migrate SDK contracts to Pi 0.87.1"
  ```

## Task 3: Publish the new baseline and bilingual release rollup

**Files:**

- Modify: `README.md`
- Modify: `course/README.md`
- Modify: `content/en/index.mdx`
- Modify: `content/vi/index.mdx`
- Modify: `content/en/quickstart.md`
- Modify: `content/vi/quickstart.md`
- Modify: `content/en/help/faq.md`
- Modify: `content/vi/help/faq.md`
- Modify: `content/en/changelog.md`
- Modify: `content/vi/changelog.md`
- Modify: `scripts/content.test.mjs`
- Modify: `scripts/pi-release-contract.test.mjs`

- [ ] **Step 1: Make entry-point authority checks require `0.87.1`.**

  In `scripts/content.test.mjs`, set the expected release and commit to:

  ```js
  const releaseURL =
    "https://github.com/earendil-works/pi/releases/tag/v0.87.1";
  const releaseCommit =
    "f07218c4d4bbc12bef056a7058c3dd49dfe41abe";
  ```

  Rename the test to
  `release entry points publish the Pi 0.87.1 baseline and exact review authority`.

- [ ] **Step 2: Add a red contract for the first bilingual changelog entry.**

  Require the first dated entry in both changelogs to be `2026-09-23`, link all
  five included releases, and contain these exact technical tokens:

  ```js
  const requiredReleaseTokens = [
    "TranscriptContext",
    "user_bash",
    "finishTurn",
    "ContextEditEntry",
    "context_with_system",
    "inputLimits.images.resize",
    "Claude Opus 5.5",
    "GPT-6 Sol",
    "GPT-6 Luna",
    "Grok 4.7",
  ];
  ```

- [ ] **Step 3: Run the entry-point and changelog tests and confirm they fail.**

  ```powershell
  node --test --test-name-pattern="release entry points|first bilingual changelog" scripts/content.test.mjs scripts/pi-release-contract.test.mjs
  ```

  Expected: FAIL because current entry points and the first changelog entry still
  identify `0.85.0`.

- [ ] **Step 4: Update current-baseline prose and source links.**

  Set the current baseline to `0.87.1`, link the official release, and link
  short commit `f07218c` to the full immutable commit in README and FAQ. Update
  `course/README.md` comparison wording without changing the Course's independent
  implementation guarantee.

  In localized landing and Quickstart content, retain the current structure and
  replace only claims that identify the active SDK baseline, supported Node
  requirement, install version, or pinned source.

- [ ] **Step 5: Add the complete bilingual `2026-09-23` changelog entry.**

  Use the same section structure in both locales:

  ```markdown
  ## 2026-09-23

  ### Release coverage
  ### Breaking API migrations
  ### New capabilities
  ### Reliability, provider, and CLI fixes
  ### Documentation and verification scope
  ```

  The entry must state that Pify moved from `0.85.0` to `0.87.1` and includes
  `0.85.1`, `0.86.0`, `0.86.1`, and `0.87.0`. Cover the obsolete `0.85.0`
  packaging workaround, `TranscriptContext`, JSON-compatible tool values,
  fail-closed `user_bash`, cache warming, `/bug`, Radius, Meta Muse,
  `finishTurn`, canonical `SessionManager` context, `ContextEditEntry`, boundary
  events, `context_with_system`, per-model image limits, new frontier models,
  Grok 4.7, compaction fixes, and `--mode` validation.

- [ ] **Step 6: Run focused entry-point checks.**

  ```powershell
  node --test --test-name-pattern="release entry points|first bilingual changelog" scripts/content.test.mjs scripts/pi-release-contract.test.mjs
  ```

  Expected: all selected tests pass.

- [ ] **Step 7: Commit the release rollup.**

  ```powershell
  git add README.md course/README.md content/en/index.mdx content/vi/index.mdx content/en/quickstart.md content/vi/quickstart.md content/en/help/faq.md content/vi/help/faq.md content/en/changelog.md content/vi/changelog.md scripts/content.test.mjs scripts/pi-release-contract.test.mjs
  git commit -m "docs: publish Pi 0.87.1 baseline"
  ```

## Task 4: Remove the `0.85.0`-only SDK installation workaround

**Files:**

- Modify: `content/{en,vi}/how-to/add-custom-tool.md`
- Modify: `content/{en,vi}/how-to/customize-system-prompt.md`
- Modify: `content/{en,vi}/how-to/host-session-runtime.md`
- Modify: `content/{en,vi}/how-to/persist-sessions.md`
- Modify: `content/{en,vi}/how-to/plug-new-model.md`
- Modify: `content/{en,vi}/how-to/stream-output.md`
- Modify: `scripts/pi-release-contract.test.mjs`

- [ ] **Step 1: Replace the old workaround contract with a removal contract.**

  Replace the test named
  `Pi 0.85 SDK install recipes include the same-version pi-server packaging workaround`
  with:

  ```js
  test("Pi 0.87.1 SDK install recipes omit the fixed 0.85.0 packaging workaround", async () => {
    const guidePaths = [
      "how-to/add-custom-tool.md",
      "how-to/customize-system-prompt.md",
      "how-to/host-session-runtime.md",
      "how-to/persist-sessions.md",
      "how-to/plug-new-model.md",
      "how-to/stream-output.md",
    ];

    for (const locale of ["en", "vi"]) {
      for (const relativePath of guidePaths) {
        const markdown = await readContent(locale, relativePath);
        assert.doesNotMatch(markdown, /0\.85\.0 packaging workaround/i);
        assert.doesNotMatch(markdown, /workaround đóng gói.*0\.85\.0/i);
        assert.doesNotMatch(markdown, /@earendil-works\/pi-[a-z-]+@0\.85\.0/);
      }
    }
  });
  ```

- [ ] **Step 2: Run the replacement contract and confirm stale guidance fails.**

  ```powershell
  node --test --test-name-pattern="omit the fixed 0.85.0 packaging workaround" scripts/pi-release-contract.test.mjs
  ```

  Expected: FAIL on the existing release-scoped callouts and install commands.

- [ ] **Step 3: Correct install commands without deleting required imports.**

  In each EN/VI pair:

  - pin every package shown in an install command to `0.87.1`;
  - remove the callout claiming the Coding Agent root export requires an extra
    `pi-server` dependency because of the `0.85.0` publish defect;
  - keep `@earendil-works/pi-server@0.87.1` only in examples that directly import
    the server package;
  - retain Node.js `>=22.19.0`, ESM, TypeScript, and `tsx` setup where used by the
    guide;
  - preserve all surrounding task steps and explanatory depth.

- [ ] **Step 4: Run the focused workaround and content-preservation tests.**

  ```powershell
  node --test --test-name-pattern="omit the fixed 0.85.0 packaging workaround" scripts/pi-release-contract.test.mjs
  npm run test:preservation
  ```

  Expected: both commands pass.

- [ ] **Step 5: Commit the installation correction.**

  ```powershell
  git add content/en/how-to content/vi/how-to scripts/pi-release-contract.test.mjs
  git commit -m "docs: remove obsolete Pi 0.85 install workaround"
  ```

## Task 5: Migrate provider and tool contracts introduced in `0.86.0`

**Files:**

- Modify: `content/{en,vi}/ch04-model-invocation.md`
- Modify: `content/{en,vi}/ch05-tool-system.md`
- Modify: `content/{en,vi}/ch06-messages.md`
- Modify: `content/{en,vi}/how-to/add-custom-tool.md`
- Modify: `content/{en,vi}/how-to/plug-new-model.md`
- Modify: `content/{en,vi}/reference/api.md`
- Modify: `scripts/pi-release-contract.test.mjs`

- [ ] **Step 1: Add red semantic contracts for provider and tool migrations.**

  Add a paired-page test requiring:

  ```js
  const providerContractTerms = [
    "TranscriptContext",
    "getCurrentSystemPrompt",
    "getCurrentTools",
  ];
  const toolContractTerms = [
    "ToolCall.arguments",
    "ToolResultMessage.details",
    "JsonValue",
    "readonly",
    "user_bash",
    "undefined",
    "operations",
    "result",
  ];
  ```

  Require provider terms in both `how-to/plug-new-model.md` and
  `reference/api.md`. Require tool terms in both `how-to/add-custom-tool.md` and
  `reference/api.md`. Require the conceptual explanation in `ch04`, `ch05`, and
  `ch06` without forcing identical English prose into Vietnamese.

- [ ] **Step 2: Run the focused test and confirm missing `0.86.0` coverage.**

  ```powershell
  node --test --test-name-pattern="0.86.0 provider and tool contracts" scripts/pi-release-contract.test.mjs
  ```

  Expected: FAIL because current pages still describe the `0.85.0` provider and
  value boundary.

- [ ] **Step 3: Update the custom-provider stream example.**

  The example must accept `TranscriptContext` and derive prompt/tool state from
  `context.messages`:

  ```ts
  import {
    getCurrentSystemPrompt,
    getCurrentTools,
    type TranscriptContext,
  } from "@earendil-works/pi-ai";

  function inspectProviderContext(context: TranscriptContext) {
    return {
      systemPrompt: getCurrentSystemPrompt(context.messages),
      tools: getCurrentTools(context.messages),
    };
  }
  ```

  Explain that only Pi's normalization path produces the branded
  `TranscriptContext`; callers should not cast raw `Context` objects into it.

- [ ] **Step 4: Correct tool value and `user_bash` behavior.**

  State in both locales:

  - `ToolCall.arguments` and `ToolResultMessage.details` are JSON-compatible;
  - `ToolResultMessage` is conditional and `JsonValue` arrays are readonly;
  - `user_bash` returns `undefined` only to continue propagation;
  - a handled result returns exactly one valid `{ operations }` or `{ result }`
    object;
  - an exception or invalid defined value aborts the command and must not fall
    through to later handlers or local execution.

  Keep the current Tool schema, execution, cancellation, partial-result, and
  error-handling explanations.

- [ ] **Step 5: Run provider/tool contracts, sync, and frontmatter checks.**

  ```powershell
  node --test --test-name-pattern="0.86.0 provider and tool contracts" scripts/pi-release-contract.test.mjs
  npm run lint:sync
  npm run lint:frontmatter
  ```

  Expected: all commands pass.

- [ ] **Step 6: Commit provider and tool migrations.**

  ```powershell
  git add content/en/ch04-model-invocation.md content/vi/ch04-model-invocation.md content/en/ch05-tool-system.md content/vi/ch05-tool-system.md content/en/ch06-messages.md content/vi/ch06-messages.md content/en/how-to/add-custom-tool.md content/vi/how-to/add-custom-tool.md content/en/how-to/plug-new-model.md content/vi/how-to/plug-new-model.md content/en/reference/api.md content/vi/reference/api.md scripts/pi-release-contract.test.mjs
  git commit -m "docs: migrate Pi 0.86 provider and tool contracts"
  ```

## Task 6: Document `0.86.x` operational and extension features

**Files:**

- Modify: `content/{en,vi}/ch07-event-driven.md`
- Modify: `content/{en,vi}/ch08-context-engineering.md`
- Modify: `content/{en,vi}/ch09-compaction.md`
- Modify: `content/{en,vi}/ch10-session.md`
- Modify: `content/{en,vi}/how-to/customize-system-prompt.md`
- Modify: `content/{en,vi}/how-to/stream-output.md`
- Modify: `content/{en,vi}/reference/api.md`
- Modify: `content/{en,vi}/reference/configuration.md`
- Modify: `content/{en,vi}/reference/environment-variables.md`
- Modify: `scripts/pi-release-contract.test.mjs`

- [ ] **Step 1: Add red coverage contracts for the `0.86.x` feature groups.**

  Define these feature tokens in the release test:

  ```js
  const operationalFeatureTerms = [
    "cache_warming_decision",
    "compaction.modelOverrides",
    "reserveTokens",
    "keepRecentTokens",
    "/bug",
    "Radius",
    "Meta",
    "META_API_KEY",
    "ctx.modelRegistry.stream",
    "streamSimple",
  ];
  ```

  Add separate assertions that `pi.on()` is documented as returning an
  unsubscribe function and that built-in `read`, `bash`, `powershell`, `edit`,
  and `write` tools use strict-prefer constrained sampling by default unless an
  extension registers `constrainedSampling: false`.

- [ ] **Step 2: Run the feature test and confirm the old baseline fails.**

  ```powershell
  node --test --test-name-pattern="0.86.x operational features" scripts/pi-release-contract.test.mjs
  ```

  Expected: FAIL on missing cache warming, bug reporting, provider, compaction,
  and extension API coverage.

- [ ] **Step 3: Add cache warming and per-model compaction configuration.**

  In the existing compaction and configuration sections, document:

  - cost-aware warming during long Tool execution;
  - optional idle warming;
  - `/session` diagnostics and transcript notices;
  - extension decisions through `cache_warming_decision`;
  - model cache-lifetime metadata;
  - `compaction.modelOverrides.<model>.reserveTokens` and
    `keepRecentTokens`, with ordinary compaction settings as fallback.

  Do not imply that warming removes provider cost or guarantees cache hits.

- [ ] **Step 4: Add `/bug`, Radius, and Meta Muse boundaries.**

  In the session/configuration/environment pages, document:

  - `/bug [description]` metadata collection and secret redaction;
  - optional transcript inclusion or model-written summary;
  - Radius upload versus local ZIP export;
  - offline mode allowing local export but not upload;
  - crash metadata in `~/.pi/agent/crashes.json`;
  - Radius offline/cached/live catalog layering;
  - `/login meta`, automatic Muse Model API key refresh, and `META_API_KEY`.

- [ ] **Step 5: Add extension model calls, unsubscription, and constrained sampling.**

  Explain that `ctx.modelRegistry.stream()` and `streamSimple()` use configured
  providers with resolved authentication. Show and explain this unsubscription
  shape:

  ```ts
  const unsubscribe = pi.on("input", async (event) => {
    void event;
    return { action: "continue" };
  });

  unsubscribe();
  ```

  Explain that handlers added or removed during one dispatch affect later
  dispatches, not the snapshot currently being processed. Compile-check the
  snippet before it is published.

- [ ] **Step 6: Run focused tests and bilingual editorial checks.**

  ```powershell
  node --test --test-name-pattern="0.86.x operational features" scripts/pi-release-contract.test.mjs
  npm run lint:editorial
  npm run lint:sync
  ```

  Expected: all commands pass.

- [ ] **Step 7: Commit the `0.86.x` feature coverage.**

  ```powershell
  git add content/en/ch07-event-driven.md content/vi/ch07-event-driven.md content/en/ch08-context-engineering.md content/vi/ch08-context-engineering.md content/en/ch09-compaction.md content/vi/ch09-compaction.md content/en/ch10-session.md content/vi/ch10-session.md content/en/how-to/customize-system-prompt.md content/vi/how-to/customize-system-prompt.md content/en/how-to/stream-output.md content/vi/how-to/stream-output.md content/en/reference content/vi/reference scripts/pi-release-contract.test.mjs
  git commit -m "docs: cover Pi 0.86 operational features"
  ```

## Task 7: Migrate canonical session context and lifecycle APIs from `0.87.0`

**Files:**

- Modify: `content/{en,vi}/ch03-agent-loop.md`
- Modify: `content/{en,vi}/ch07-event-driven.md`
- Modify: `content/{en,vi}/ch08-context-engineering.md`
- Modify: `content/{en,vi}/ch09-compaction.md`
- Modify: `content/{en,vi}/ch10-session.md`
- Modify: `content/{en,vi}/how-to/host-session-runtime.md`
- Modify: `content/{en,vi}/how-to/persist-sessions.md`
- Modify: `content/{en,vi}/how-to/stream-output.md`
- Modify: `content/{en,vi}/reference/api.md`
- Modify: `scripts/pi-release-contract.test.mjs`

- [ ] **Step 1: Add red tests for removed and newly required API terms.**

  Add a stale API scanner over active public docs:

  ```js
  const removedCurrentApiPatterns = [
    /\bshouldStopAfterTurn\b/,
    /ExtensionRunner\.emit\(["']turn_end["']/,
    /session\.agent\.state\.messages\s*=/,
  ];
  ```

  Exclude `content/{en,vi}/changelog.md` from the first two patterns only when
  the occurrence is explicitly presented as historical migration text. Require
  these current terms in their mapped guides:

  ```js
  const sessionBoundaryTerms = [
    "finishTurn",
    "ContextEditEntry",
    "appendContextEdit",
    "context_edit",
    "agent_before_settle",
    "emitBoundary",
    "context_with_system",
    "refreshContext",
  ];
  ```

- [ ] **Step 2: Run the lifecycle contract and confirm stale/missing coverage.**

  ```powershell
  node --test --test-name-pattern="0.87.0 session context and lifecycle" scripts/pi-release-contract.test.mjs
  ```

  Expected: FAIL because the current baseline lacks new context-edit and boundary
  contracts and may still teach old stopping semantics.

- [ ] **Step 3: Replace `shouldStopAfterTurn` guidance with `finishTurn`.**

  Use this exact migration shape in the agent-loop/API pair:

  ```ts
  import type { FinishTurn } from "@earendil-works/pi-agent-core";

  const finishTurn: FinishTurn = ({ message }) => {
    if (message.stopReason === "error" || message.stopReason === "aborted") {
      return undefined;
    }
    return shouldEnd(message) ? { action: "end" } : undefined;
  };
  ```

  Explain ordering: `finishTurn` runs before `turn_end`, its decision is applied
  afterward, and error/aborted responses are visible but remain hard exits unless
  ordinary default handling is preserved with `undefined`.

- [ ] **Step 4: Make `SessionManager` canonical in restoration and mutation guidance.**

  Keep external restoration through:

  ```ts
  const manager = SessionManager.inMemory(cwd, { id: sessionId }, entries);
  ```

  Replace direct message-array mutation advice with `session.navigateTree()`,
  append operations through `session.sessionManager`, and
  `session.refreshContext()`. Explain that raw transcript/UI history stays
  append-only even when future provider context changes.

- [ ] **Step 5: Add context-edit and boundary examples.**

  Publish this omission example where session editing is taught:

  ```ts
  const editId = session.sessionManager.appendContextEdit(targetEntryId, null);
  session.refreshContext();
  ```

  Explain that non-null replacements use `{ content }`, exhaustive
  `SessionEntry` switches must handle `context_edit`, and the returned ID belongs
  to the new append-only edit entry.

  For extension boundaries, show a result shaped as:

  ```ts
  return {
    entries: [
      ...event.entries,
      {
        type: "context_edit",
        targetId,
        replacement: null,
      },
    ],
    continue: true,
  };
  ```

  State that hosts dispatch actionable boundaries through
  `emitBoundary(baseEvent, buildContext)`, and runs requested from
  `agent_settled` handlers start only after all settled handlers finish.

- [ ] **Step 6: Distinguish `context` and `context_with_system`.**

  Document that `context` handlers receive the conversation without system
  messages and Pi restores the leading prompt/tool state after they run.
  `context_with_system` then receives the full transcript and its returned value
  is sent verbatim; removing the leading system message removes the provider
  prompt and initial tool declarations.

- [ ] **Step 7: Update compaction semantics.**

  Add retain-none compaction through
  `appendCompaction(summary, null, tokensBefore)`. Explain context-edit usage
  accounting, omission of abandoned retry/recovery attempts from future provider
  context, and the rule that raw history remains available even when projected
  context changes.

- [ ] **Step 8: Run lifecycle, compile, preservation, and sync tests.**

  ```powershell
  node --test --test-name-pattern="0.87.0 session context and lifecycle|compile fixture|session" scripts/pi-release-contract.test.mjs
  npm run test:preservation
  npm run lint:sync
  ```

  Expected: all commands pass.

- [ ] **Step 9: Commit session and lifecycle migration.**

  ```powershell
  git add content/en/ch03-agent-loop.md content/vi/ch03-agent-loop.md content/en/ch07-event-driven.md content/vi/ch07-event-driven.md content/en/ch08-context-engineering.md content/vi/ch08-context-engineering.md content/en/ch09-compaction.md content/vi/ch09-compaction.md content/en/ch10-session.md content/vi/ch10-session.md content/en/how-to/host-session-runtime.md content/vi/how-to/host-session-runtime.md content/en/how-to/persist-sessions.md content/vi/how-to/persist-sessions.md content/en/how-to/stream-output.md content/vi/how-to/stream-output.md content/en/reference/api.md content/vi/reference/api.md scripts/pi-release-contract.test.mjs
  git commit -m "docs: migrate Pi 0.87 session lifecycle APIs"
  ```

## Task 8: Update image limits, current models, provider defaults, and CLI behavior

**Files:**

- Modify: `content/{en,vi}/ch04-model-invocation.md`
- Modify: `content/{en,vi}/how-to/plug-new-model.md`
- Modify: `content/{en,vi}/quickstart.md`
- Modify: `content/{en,vi}/help/faq.md`
- Modify: `content/{en,vi}/reference/configuration.md`
- Modify: `content/{en,vi}/reference/environment-variables.md`
- Modify: `scripts/pi-release-contract.test.mjs`

- [ ] **Step 1: Add red model/configuration assertions.**

  Require both locales to contain these tokens in mapped pages:

  ```js
  const currentModelTerms = [
    "inputLimits.images.resize",
    "Claude Opus 5.5",
    "GPT-6 Sol",
    "GPT-6 Luna",
    "Grok 4.7",
    "GitHub Copilot",
  ];
  ```

  Require the CLI reference to state that missing or invalid `--mode` values are
  errors with a nonzero exit status. Require provider guidance to state that
  image-only user messages no longer send an empty text part to
  OpenAI-compatible providers.

- [ ] **Step 2: Run the focused model/configuration test and confirm it fails.**

  ```powershell
  node --test --test-name-pattern="0.87.1 models and image limits" scripts/pi-release-contract.test.mjs
  ```

  Expected: FAIL on missing `0.87.x` model and configuration details.

- [ ] **Step 3: Document per-model image resize profiles.**

  Explain that `inputLimits.images.resize` applies to file attachments, image
  reads, and Tool-result images. State that profiles are per model and designed
  to keep resizing cache-safe. Do not claim that all models use the same limits
  or that arbitrary provider-side image transformations are controlled by Pi.

- [ ] **Step 4: Update current model/provider guidance.**

  Record:

  - Claude Opus 5.5 through Anthropic, including adaptive thinking and its 1M
    context-window catalog entry;
  - GPT-6 Sol and GPT-6 Luna through OpenAI API keys and OpenAI Codex
    subscriptions;
  - Claude Opus 5.5, GPT-6 Sol, and GPT-6 Luna through supported GitHub Copilot
    routes;
  - Grok 4.7 as the default for new xAI sessions.

  Keep the docs catalog-oriented rather than reproducing the complete generated
  model list.

- [ ] **Step 5: Correct CLI and provider edge behavior.**

  Add concise current behavior for `--mode` validation, image-only
  OpenAI-compatible messages, and split-turn compaction summaries for Claude
  Fable 5.1. Keep these fixes in troubleshooting or caution text; do not present
  them as new public APIs.

- [ ] **Step 6: Run focused tests and validate content.**

  ```powershell
  node --test --test-name-pattern="0.87.1 models and image limits" scripts/pi-release-contract.test.mjs
  npm run lint:content
  npm run lint:editorial
  ```

  Expected: all commands pass.

- [ ] **Step 7: Commit the `0.87.1` model and CLI update.**

  ```powershell
  git add content/en/ch04-model-invocation.md content/vi/ch04-model-invocation.md content/en/how-to/plug-new-model.md content/vi/how-to/plug-new-model.md content/en/quickstart.md content/vi/quickstart.md content/en/help/faq.md content/vi/help/faq.md content/en/reference/configuration.md content/vi/reference/configuration.md content/en/reference/environment-variables.md content/vi/reference/environment-variables.md scripts/pi-release-contract.test.mjs
  git commit -m "docs: update Pi 0.87.1 models and configuration"
  ```

## Task 9: Repin Course comparisons and eval guidance

**Files:**

- Modify: `content/{en,vi}/course/index.mdx`
- Modify: `content/{en,vi}/course/00-complete-agent-trace.md`
- Modify: `content/{en,vi}/course/01-typescript-protocols.md`
- Modify: `content/{en,vi}/course/02-event-stream.md`
- Modify: `content/{en,vi}/course/03-message-ir.md`
- Modify: `content/{en,vi}/course/04-deterministic-model.md`
- Modify: `content/{en,vi}/course/05-provider-adapter.md`
- Modify: `content/{en,vi}/course/06-tool-contract.md`
- Modify: `content/{en,vi}/course/07-agent-loop.md`
- Modify: `content/{en,vi}/course/08-coding-tools.md`
- Modify: `content/{en,vi}/course/09-stateful-agent.md`
- Modify: `content/{en,vi}/course/10-session-tree.md`
- Modify: `content/{en,vi}/course/11-context-compaction.md`
- Modify: `content/{en,vi}/course/12-resources-extensions.md`
- Modify: `content/{en,vi}/course/13-runtime-composition.md`
- Modify: `content/{en,vi}/course/14-agent-evaluation.md`
- Modify: `content/{en,vi}/how-to/run-pi-evals.md`
- Modify: `content/{en,vi}/how-to/test-agent-deterministically.md`
- Modify: `scripts/course-content.test.mjs`
- Modify: `scripts/pi-evals-guide.test.mjs`
- Modify: `scripts/pi-release-contract.test.mjs`

- [ ] **Step 1: Make Course labels and exact source pins require `0.87.1`.**

  Change required callout labels to:

  ```js
  const courseComparisonHeading = {
    en: "Compare with Pi SDK 0.87.1",
    vi: "So sánh với Pi SDK 0.87.1",
  };
  const courseComparisonCallout = "Pi SDK 0.87.1";
  const releaseCommit = "f07218c4d4bbc12bef056a7058c3dd49dfe41abe";
  ```

  Add a negative assertion that no active Course source URL contains commit
  `107d79f11072bbc8a3a757ed7fd69596bee7d68c`.

- [ ] **Step 2: Update eval-guide test authority and make it red.**

  Set `RELEASE_COMMIT` in `scripts/pi-evals-guide.test.mjs` to the full `0.87.1`
  commit and require checkout commands, source maps, and checklist assertions to
  match it.

  Run:

  ```powershell
  npm run test:course
  node --test scripts/course-content.test.mjs scripts/pi-evals-guide.test.mjs
  ```

  Expected: Course implementation tests pass, while content contracts fail on
  old comparison labels and source pins.

- [ ] **Step 3: Repin every Course source and comparison surface.**

  For all 16 Course pages per locale:

  - update `official_refs` links from the `0.85.0` commit to the exact `0.87.1`
    commit;
  - update the comparison heading and callout label;
  - preserve workshop code and learning objectives;
  - revise comparison prose only where `TranscriptContext`, JSON-compatible Tool
    values, `finishTurn`, canonical session context, context edits, compaction,
    extension boundaries, or runtime composition changed;
  - keep the Course's smaller implementation described as a teaching model, not
    a drop-in compatibility layer.

- [ ] **Step 4: Update eval and deterministic-testing source maps.**

  Pin checkout instructions, preflight checks, source URLs, and final checklists
  to `f07218c4d4bbc12bef056a7058c3dd49dfe41abe`. Audit the tagged eval harness and
  reporter files before changing flags, output artifacts, pass/fail semantics,
  telemetry comparisons, or cleanup claims.

- [ ] **Step 5: Run Course, eval-guide, and release contracts.**

  ```powershell
  npm run test:course
  node --test scripts/course-content.test.mjs scripts/pi-evals-guide.test.mjs
  node --test --test-name-pattern="Course|course|eval" scripts/pi-release-contract.test.mjs
  ```

  Expected: all commands pass and all comparison/source-pin checks identify
  `0.87.1`.

- [ ] **Step 6: Commit Course and eval repinning.**

  ```powershell
  git add content/en/course content/vi/course content/en/how-to/run-pi-evals.md content/vi/how-to/run-pi-evals.md content/en/how-to/test-agent-deterministically.md content/vi/how-to/test-agent-deterministically.md scripts/course-content.test.mjs scripts/pi-evals-guide.test.mjs scripts/pi-release-contract.test.mjs
  git commit -m "docs: repin Course and evals to Pi 0.87.1"
  ```

## Task 10: Audit all 43 translation pairs and record evidence

**Files:**

- Create: `docs/translation-review/2026-09-23-pi-0871.md`
- Modify: affected files under `content/en/` and `content/vi/`
- Modify: `scripts/pi-release-contract.test.mjs`
- Modify: `content/preservation-manifest.json` only for a source-proven deletion.

- [ ] **Step 1: Add a red repository-wide stale-current-baseline test.**

  Scan active public content and root entry points for:

  ```js
  const staleCurrentBaselinePatterns = [
    /Pi SDK `0\.85\.0` is authoritative/,
    /Pi SDK 0\.85\.0\]/,
    /Compare with Pi SDK 0\.85\.0/,
    /So sánh với Pi SDK 0\.85\.0/,
    /github\.com\/earendil-works\/pi\/blob\/107d79f11072bbc8a3a757ed7fd69596bee7d68c/,
  ];
  ```

  Permit `0.85.0` in the bilingual changelog when the surrounding section is
  explicitly historical. Exclude `docs/superpowers/` and old review ledgers from
  this active-content scanner.

- [ ] **Step 2: Run the stale-baseline test and capture every remaining active hit.**

  ```powershell
  node --test --test-name-pattern="active docs contain no stale Pi 0.85.0 baseline" scripts/pi-release-contract.test.mjs
  ```

  Expected: FAIL with a finite list of active public files that still require
  review or pin-only correction.

- [ ] **Step 3: Create the complete review ledger.**

  The ledger must record release authority, translation rules, deletion policy,
  and one outcome for each of these 43 paired suffixes:

  ```text
  ch01-overview.md
  ch02-three-layer-arch.md
  ch03-agent-loop.md
  ch04-model-invocation.md
  ch05-tool-system.md
  ch06-messages.md
  ch07-event-driven.md
  ch08-context-engineering.md
  ch09-compaction.md
  ch10-session.md
  ch11-testing-evaluation.md
  changelog.md
  course/00-complete-agent-trace.md
  course/01-typescript-protocols.md
  course/02-event-stream.md
  course/03-message-ir.md
  course/04-deterministic-model.md
  course/05-provider-adapter.md
  course/06-tool-contract.md
  course/07-agent-loop.md
  course/08-coding-tools.md
  course/09-stateful-agent.md
  course/10-session-tree.md
  course/11-context-compaction.md
  course/12-resources-extensions.md
  course/13-runtime-composition.md
  course/14-agent-evaluation.md
  course/index.mdx
  glossary.md
  help/faq.md
  how-to/add-custom-tool.md
  how-to/customize-system-prompt.md
  how-to/host-session-runtime.md
  how-to/persist-sessions.md
  how-to/plug-new-model.md
  how-to/run-pi-evals.md
  how-to/stream-output.md
  how-to/test-agent-deterministically.md
  index.mdx
  quickstart.md
  reference/api.md
  reference/configuration.md
  reference/environment-variables.md
  ```

  For each row, record `substantive`, `pin-only`, or `verified unchanged`, the
  exact upstream release/source evidence, the EN/VI files checked, and any
  source-proven deletion. Do not mark a row reviewed until both locales and all
  code blocks on that pair have been inspected.

- [ ] **Step 4: Correct remaining active stale pins and translation drift.**

  For each failing file:

  - change current source pins and comparison labels to `0.87.1`;
  - preserve historical release references in the changelog;
  - retain IT/Coding terms, identifiers, flags, commands, package names, and
    event names in English;
  - correct Vietnamese prose that changes meaning, invents an API guarantee, or
    uses an obsolete identifier;
  - keep heading, table, code-fence, callout, and link structure synchronized;
  - remove content only with an exact ledger citation proving it wrong or
    duplicated.

- [ ] **Step 5: Run all content-quality gates.**

  ```powershell
  npm run test:content
  npm run test:preservation
  npm run test:editorial
  npm run lint:sync
  npm run lint:frontmatter
  npm run lint:content
  npm run lint:editorial
  npm run lint:mermaid
  ```

  Expected: all commands pass without lowering preservation metrics.

- [ ] **Step 6: Re-run the stale-current-baseline test.**

  ```powershell
  node --test --test-name-pattern="active docs contain no stale Pi 0.85.0 baseline" scripts/pi-release-contract.test.mjs
  ```

  Expected: PASS. Remaining `0.85.0` strings exist only in explicitly historical
  content, approved specs/plans, or older ledgers.

- [ ] **Step 7: Commit the completed bilingual audit.**

  ```powershell
  git add content/en content/vi docs/translation-review/2026-09-23-pi-0871.md scripts/pi-release-contract.test.mjs content/preservation-manifest.json
  git commit -m "docs: complete Pi 0.87.1 bilingual audit"
  ```

  If `content/preservation-manifest.json` did not change, omit it from the final
  staged set rather than creating a no-op edit.

## Task 11: Run the complete verification and release to production

**Files:**

- Verify only: entire tracked repository
- Modify only when a failing gate reveals a real defect in the already-scoped files.

- [ ] **Step 1: Confirm the tracked worktree contains only intentional changes.**

  ```powershell
  git status --short --untracked-files=no
  git diff --check main...HEAD
  git log --oneline --decorate main..HEAD
  ```

  Expected: only scoped tracked changes, no whitespace errors, and the planned
  sequence of commits.

- [ ] **Step 2: Run the full content and application quality suite.**

  ```powershell
  npm run quality:content
  npm run typecheck
  npm run format:check
  npm run build
  npm run test:e2e
  ```

  Expected: every command exits with code 0. The production build completes and
  Playwright passes all localized navigation, clean-route, language-switching,
  syntax-highlight, Mermaid, metadata, and sitemap checks.

- [ ] **Step 3: Run final release-specific negative scans.**

  ```powershell
  rg -n --glob '!docs/superpowers/**' --glob '!docs/translation-review/2026-09-04-pi-0850.md' "pi-release-0850|pi-sdk-0850|107d79f11072bbc8a3a757ed7fd69596bee7d68c|shouldStopAfterTurn" README.md course content scripts tests package.json
  rg -n '"@earendil-works/pi-(ai|agent-core|coding-agent|server)": "0\.87\.1"' package.json
  ```

  Expected: the first command returns only explicitly historical changelog text
  allowed by tests, with no old fixture names or removed API guidance. The second
  command returns all four direct package pins.

- [ ] **Step 4: Commit any verification-only correction and re-run its failing gate.**

  If a gate exposed a scoped defect, fix that defect, rerun the exact failed
  command, then commit the correction with a message naming the contract. If no
  correction was required, do not create an empty commit.

- [ ] **Step 5: Integrate the verified branch into local `main`.**

  From the root workspace:

  ```powershell
  git switch main
  git merge --ff-only docs/pi-0871-update
  git status --short --untracked-files=no
  ```

  Expected: fast-forward succeeds and tracked `main` is clean. If execution used
  a different implementation branch name, substitute that exact branch name in
  the `--ff-only` command.

- [ ] **Step 6: Push directly to GitHub and confirm Actions.**

  ```powershell
  git push origin main
  $headCommit = git rev-parse HEAD
  $runs = gh run list --branch main --commit $headCommit --limit 10 --json databaseId,name,headSha | ConvertFrom-Json
  $requiredRuns = $runs | Where-Object {
    $_.name -in @('Content Quality', 'Next.js Application Build') -and
    $_.headSha -eq $headCommit
  }
  if ($requiredRuns.Count -ne 2) {
    throw "Expected two required workflow runs for $headCommit"
  }
  foreach ($run in $requiredRuns) {
    gh run watch $run.databaseId --exit-status
    if ($LASTEXITCODE -ne 0) {
      throw "$($run.name) failed for $headCommit"
    }
  }
  ```

  Expected: both required workflows finish with `success` for the exact pushed
  commit.

- [ ] **Step 7: Confirm the Vercel production deployment.**

  First inspect connected deployments:

  ```powershell
  vercel ls pify-docs
  ```

  If the GitHub integration has not produced a production deployment for the
  pushed commit, deploy the same checkout explicitly:

  ```powershell
  vercel deploy --prod --yes
  ```

  Expected: the production alias resolves to `https://docs.pify.dev` and the
  deployment reports Ready.

- [ ] **Step 8: Smoke-test the public EN/VI site.**

  Run:

  ```powershell
  $routes = @(
    'https://docs.pify.dev/en',
    'https://docs.pify.dev/vi',
    'https://docs.pify.dev/en/changelog',
    'https://docs.pify.dev/vi/changelog',
    'https://docs.pify.dev/en/how-to/plug-new-model',
    'https://docs.pify.dev/vi/how-to/plug-new-model',
    'https://docs.pify.dev/en/reference/api',
    'https://docs.pify.dev/vi/reference/api',
    'https://docs.pify.dev/en/course/13-runtime-composition',
    'https://docs.pify.dev/vi/course/13-runtime-composition'
  )
  foreach ($route in $routes) {
    $response = Invoke-WebRequest -UseBasicParsing $route
    if ($response.StatusCode -ne 200) {
      throw "$route returned $($response.StatusCode)"
    }
    if ($response.Content -match 'Pi SDK 0\.85\.0') {
      throw "$route still renders the old current baseline"
    }
  }
  ```

  Expected: all ten routes return HTTP 200 and none renders `Pi SDK 0.85.0` as
  the current baseline. Manually verify one English and one Vietnamese code
  block retain syntax highlighting and that the language switch preserves the
  corresponding clean route.

- [ ] **Step 9: Record final release evidence in the handoff.**

  Report the pushed commit, successful GitHub Actions run IDs, Vercel deployment
  URL, custom-domain smoke result, total EN/VI pair count, package version, tag,
  and pinned upstream commit. Do not claim completion until each item has been
  read back from its authoritative system.
