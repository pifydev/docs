# Pi 0.85.0 Documentation Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade all active Pify English/Vietnamese documentation from the Pi `0.84.3` baseline to the exact published Pi `0.85.0` release while preserving content depth and correcting every affected API, behavior, architecture, and course comparison.

**Architecture:** Treat tag `v0.85.0` at commit `107d79f11072bbc8a3a757ed7fd69596bee7d68c` and the matching npm packages as the release boundary. Add focused red contracts before each documentation batch, edit English and Vietnamese together, compile runnable examples against exact packages, and finish with a repository-wide stale-pin and rendering gate. Changes from `v0.84.4` are included because the current baseline is `v0.84.3`.

**Tech Stack:** Node.js 22.19, TypeScript 6, Node test runner, Vitest, Fumadocs Markdown/MDX, Next.js 16, Playwright, npm, Git.

---

## Plan boundaries

- Work only in the isolated worktree on branch `docs/pi-0850-update`.
- Keep all 43 manifest entries, 86 localized public files, routes, and navigation order.
- Do not rewrite historical files under `docs/superpowers/` or older translation-review ledgers to pretend they reviewed `0.85.0`.
- Do not reduce preservation floors or add an `approvedDeletion` unless an exact pinned source proves that the removed claim is invalid or duplicated.
- Use the exact release commit in `official_refs`; do not replace pins with `main`.
- Keep the Course implementation and its 382 tests stable. Only Pi comparison surfaces move to `0.85.0`.
- Use English as the canonical technical draft, then produce structurally equivalent Vietnamese without translating identifiers.
- Run tasks in order. Each task must be green before its commit.

## File responsibility map

### Release authority and executable contracts

- `scripts/fixtures/pi-release-0850.json`: machine-readable release authority.
- `scripts/pi-release-contract.test.mjs`: feature, parity, source-pin, and stale-baseline contracts.
- `tests/fixtures/pi-sdk-0850.contract.ts`: compile-only public SDK examples used by docs.
- `scripts/pi-evals-guide.test.mjs`: exact eval-guide release pin and workflow contract.
- `package.json`, `package-lock.json`: exact published Pi dependencies and quality commands.

The old `scripts/fixtures/pi-release-0843.json` and
`tests/fixtures/pi-sdk-0843.contract.ts` are renamed, not retained as parallel
active fixtures.

### Substantive content

- Architecture: `content/{en,vi}/ch01-overview.md`,
  `content/{en,vi}/ch02-three-layer-arch.md`, and API reference.
- Models: `content/{en,vi}/ch04-model-invocation.md`,
  `content/{en,vi}/how-to/plug-new-model.md`, configuration, and API reference.
- Tools/terminal: `content/{en,vi}/ch05-tool-system.md`,
  `content/{en,vi}/how-to/add-custom-tool.md`, configuration, environment, and API
  reference.
- Extension/RPC: `content/{en,vi}/ch07-event-driven.md`, stream guide, and API
  reference.
- Sessions/compaction: `content/{en,vi}/ch08-context-engineering.md`,
  `ch09-compaction.md`, `ch10-session.md`, persistence guide, runtime-host guide,
  and API reference.
- Release rollup: home, quickstart, glossary when needed, testing/eval guides,
  FAQ, changelog, `README.md`, and all 16 Course pages per locale.

### Review evidence

- `docs/translation-review/2026-09-04-pi-0850.md`: page-pair audit results,
  source evidence, substantive-versus-pin-only classification, and any justified
  deletion.
- `content/preservation-manifest.json`: modify only if a source-proven deletion is
  unavoidable; never lower a metric merely to accept an edit.

## Task 1: Replace the release authority fixture

**Files:**

- Rename: `scripts/fixtures/pi-release-0843.json` →
  `scripts/fixtures/pi-release-0850.json`
- Modify: `scripts/pi-release-contract.test.mjs`
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Make release identity assertions red.**

  Change `releaseFixtureURL` to `fixtures/pi-release-0850.json` and replace the
  first release test with these exact assertions:

  ```js
  test("release fixture identifies published Pi 0.85.0 authority", async () => {
    const release = await readReleaseFixture();
    assert.equal(release.packageVersion, "0.85.0");
    assert.equal(release.tag, "v0.85.0");
    assert.equal(
      release.commit,
      "107d79f11072bbc8a3a757ed7fd69596bee7d68c",
    );
    assert.equal(release.publishedAt, "2026-09-04T10:18:28Z");
    assert.equal(release.nodeRequirement, ">=22.19.0");
    assert.equal(release.previousDocumentationVersion, "0.84.3");
    assert.deepEqual(release.includedReleaseTags, ["v0.84.4", "v0.85.0"]);
    assert.equal(release.sourceStatus, "published");
  });
  ```

- [ ] **Step 2: Verify the new fixture test fails.**

  Run:

  ```powershell
  node --test scripts/pi-release-contract.test.mjs
  ```

  Expected: FAIL with `ENOENT` for `pi-release-0850.json`.

- [ ] **Step 3: Rename and replace the fixture content.**

  Use this exact JSON:

  ```json
  {
    "packageVersion": "0.85.0",
    "tag": "v0.85.0",
    "commit": "107d79f11072bbc8a3a757ed7fd69596bee7d68c",
    "publishedAt": "2026-09-04T10:18:28Z",
    "nodeRequirement": ">=22.19.0",
    "previousDocumentationVersion": "0.84.3",
    "includedReleaseTags": ["v0.84.4", "v0.85.0"],
    "sourceStatus": "published"
  }
  ```

- [ ] **Step 4: Pin the three directly compiled packages to `0.85.0`.**

  Run:

  ```powershell
  npm install --save-dev --save-exact @earendil-works/pi-ai@0.85.0 @earendil-works/pi-agent-core@0.85.0 @earendil-works/pi-coding-agent@0.85.0
  ```

  Keep the root lockfile as the only lockfile. Update the dependency test loop to
  compare each `compileFixturePackages` entry with `release.packageVersion`, not a
  second hard-coded version.

- [ ] **Step 5: Remove the obsolete unreleased-head test.**

  Delete only the test for `upstreamAuditCommit` / `upstreamAuditStatus`; the new
  fixture describes one exact published boundary and intentionally has no moving
  `main` audit pin.

- [ ] **Step 6: Run the focused release identity tests.**

  Run:

  ```powershell
  node --test --test-name-pattern="release fixture|compile fixture packages" scripts/pi-release-contract.test.mjs
  ```

  Expected: the release identity and package pin tests pass.

- [ ] **Step 7: Commit the release authority.**

  ```powershell
  git add package.json package-lock.json scripts/fixtures scripts/pi-release-contract.test.mjs
  git commit -m "test: pin Pi 0.85.0 release authority"
  ```

## Task 2: Move the compile fixture to Pi 0.85.0

**Files:**

- Rename: `tests/fixtures/pi-sdk-0843.contract.ts` →
  `tests/fixtures/pi-sdk-0850.contract.ts`
- Modify: `scripts/pi-release-contract.test.mjs`
- Test: `tests/fixtures/pi-sdk-0850.contract.ts`

- [ ] **Step 1: Point every fixture loader and diagnostic label at `0850`.**

  Replace `tests/fixtures/pi-sdk-0843.contract.ts` with
  `tests/fixtures/pi-sdk-0850.contract.ts`, and replace human-readable
  `Pi 0.84.3 compile fixture` labels with `Pi 0.85.0 compile fixture`.

- [ ] **Step 2: Add compile-first contracts for the new public surface.**

  Extend imports with:

  ```ts
  import type {
    AnthropicMessagesCompat,
    OpenAICompletionsCompat,
    OpenAIResponsesCompat,
  } from "@earendil-works/pi-ai";
  import {
    detectSupportedImageMimeTypeFromFile,
    SessionManager,
    type FileEntry,
    type UIPromptEndEvent,
    type UIPromptKind,
    type UIPromptStartEvent,
  } from "@earendil-works/pi-coding-agent";
  ```

  Add these exact compile-only values and helper:

  ```ts
  const anthropicCompat = {
    supportsMidConvoEffort: true,
  } satisfies AnthropicMessagesCompat;
  const completionsCompat = {
    vllmPriority: -1,
  } satisfies OpenAICompletionsCompat;
  const responsesCompat = {
    supportsMaxOutputTokens: false,
  } satisfies OpenAIResponsesCompat;
  const promptKind: UIPromptKind = "custom";
  const promptStart: UIPromptStartEvent = {
    type: "ui_prompt_start",
    reason: "ui_prompt",
    kind: promptKind,
  };
  const promptEnd: UIPromptEndEvent = {
    type: "ui_prompt_end",
    reason: "ui_prompt",
    kind: promptKind,
  };
  const imageMimeDetector =
    detectSupportedImageMimeTypeFromFile satisfies typeof detectSupportedImageMimeTypeFromFile;

  export function restoreExternalSessionEntries(
    sessionId: string,
    entries: FileEntry[],
    cwd = process.cwd(),
  ): SessionManager {
    return SessionManager.inMemory(cwd, { id: sessionId }, entries);
  }
  ```

  Add the new constants, `imageMimeDetector`, and helper to the terminal
  `void [...]` reference list so TypeScript cannot silently drop unused-contract
  checks.

- [ ] **Step 3: Run typecheck and record any real API drift.**

  Run:

  ```powershell
  npm run typecheck
  ```

  Expected: PASS after imports and fixture code match the published declarations.
  If an existing `0.84.3` contract fails, inspect the exact `0.85.0` declaration
  and update the fixture without weakening its behavioral assertion.

- [ ] **Step 4: Run the fixture-dependent release tests.**

  Run:

  ```powershell
  npm run test:release
  ```

  Expected: all existing fixture parity/runtime tests pass with the renamed file.

- [ ] **Step 5: Commit the compile boundary.**

  ```powershell
  git add tests/fixtures scripts/pi-release-contract.test.mjs
  git commit -m "test: compile documentation contracts against Pi 0.85.0"
  ```

## Task 3: Rewrite the experimental client/protocol/server architecture

**Files:**

- Modify: `content/en/ch01-overview.md`
- Modify: `content/vi/ch01-overview.md`
- Modify: `content/en/ch02-three-layer-arch.md`
- Modify: `content/vi/ch02-three-layer-arch.md`
- Modify: `content/en/reference/api.md`
- Modify: `content/vi/reference/api.md`
- Modify: `scripts/pi-release-contract.test.mjs`

- [ ] **Step 1: Add a failing architecture contract.**

  Add a test that loads the two Chapter 2 locales and requires all of these exact
  identifiers:

  ```js
  const requiredArchitectureTerms = [
    "@earendil-works/pi-client",
    "Client",
    "createClientServiceTransport",
    "@earendil-works/pi-protocol",
    "PROTOCOL_VERSION",
    "@earendil-works/pi-server",
    "RoutedServerServiceHost",
    "RoutedSessionHandle",
    "serverId",
    "sessionId",
    "attachmentId",
    "Chord",
  ];
  ```

  The same test must reject the obsolete phrases `` `PiClient` `` and
  `` `PiServerService` `` in active Chapter 2 content, and require the localized
  experimental warning in both files.

- [ ] **Step 2: Run the focused contract and verify it fails.**

  ```powershell
  node --test --test-name-pattern="experimental service architecture" scripts/pi-release-contract.test.mjs
  ```

  Expected: FAIL because Chapter 2 still documents `PiServerService`.

- [ ] **Step 3: Replace Chapter 2's experimental boundary in place.**

  Preserve the existing core stack explanation. Replace only the experimental
  service subsection with:

  - the transport-neutral `Client` and `createClientServiceTransport()`;
  - strict routed envelopes and CBOR framing in `pi-protocol`;
  - Chord-owned application service semantics and replicated state;
  - server and Session-scoped routing through presentation attachments;
  - durable `{ serverId, sessionId, attachmentId }` targets;
  - process-local `Session` and Agent Harness objects;
  - explicit lack of automatic reconnect/replay and lack of stable compatibility
    guarantees.

  Update the diagram and table labels only if they currently encode the retired
  architecture. Keep diagram count and conceptual depth.

- [ ] **Step 4: Align Chapter 1 and API reference.**

  Chapter 1 should name the service packages as an optional experimental sibling
  boundary, not a fourth mandatory layer. The API reference should list exact
  current top-level exports without presenting a copyable end-to-end server as a
  stable production recipe.

- [ ] **Step 5: Update source pins and review metadata for the three pairs.**

  Pin links to `107d79f11072bbc8a3a757ed7fd69596bee7d68c`, set
  `last_updated: 2026-09-04`, and keep the existing translator/reviewer fields.

- [ ] **Step 6: Run focused validation.**

  ```powershell
  node --test --test-name-pattern="experimental service architecture" scripts/pi-release-contract.test.mjs
  npm run lint:sync
  npm run lint:mermaid
  npm run test:preservation
  ```

  Expected: all pass.

- [ ] **Step 7: Commit the architecture correction.**

  ```powershell
  git add content/en/ch01-overview.md content/vi/ch01-overview.md content/en/ch02-three-layer-arch.md content/vi/ch02-three-layer-arch.md content/en/reference/api.md content/vi/reference/api.md scripts/pi-release-contract.test.mjs
  git commit -m "docs: align experimental services with Pi 0.85.0"
  ```

## Task 4: Document persistent thinking effort and model compatibility

**Files:**

- Modify: `content/en/ch04-model-invocation.md`
- Modify: `content/vi/ch04-model-invocation.md`
- Modify: `content/en/how-to/plug-new-model.md`
- Modify: `content/vi/how-to/plug-new-model.md`
- Modify: `content/en/reference/api.md`
- Modify: `content/vi/reference/api.md`
- Modify: `content/en/reference/configuration.md`
- Modify: `content/vi/reference/configuration.md`
- Modify: `scripts/pi-release-contract.test.mjs`

- [ ] **Step 1: Add red bilingual feature assertions.**

  Require these tokens in all semantically relevant pairs:

  ```js
  const model0850Terms = [
    "supportsMidConvoEffort",
    "supportsMaxOutputTokens",
    "vllmPriority",
    "modelThinkingLevels",
    "prefix_mismatch_behavior",
    '"drop_block"',
  ];
  ```

  Require the English page to say the feature is limited to the exact supported
  Anthropic transport/model combination. Require the Vietnamese page to retain
  the same scope using natural Vietnamese, not to claim all compatible providers
  support it.

- [ ] **Step 2: Verify the assertions fail.**

  ```powershell
  node --test --test-name-pattern="0.85.0 model compatibility" scripts/pi-release-contract.test.mjs
  ```

  Expected: FAIL on missing compatibility settings.

- [ ] **Step 3: Update model invocation and provider guidance.**

  Add a focused section explaining:

  - native per-response thinking effort persistence;
  - recovery of effort-only system messages;
  - safe dropping of a signed thinking block on prefix mismatch;
  - why `supportsMidConvoEffort` defaults to `false`;
  - the vLLM scheduling prerequisite for `vllmPriority`;
  - why a Codex-protocol gateway may need
    `supportsMaxOutputTokens: false`.

  Keep the existing provider setup, auth, Google thinking-level distinctions, and
  code examples unless the `0.85.0` declarations require a correction.

- [ ] **Step 4: Update configuration and API surfaces.**

  Document `modelThinkingLevels` as a map keyed by `provider/modelId`, explain
  saving `/thinking` through Ctrl+S, and add provider recovery diagnostics to
  `showCacheMissNotices`. Keep `defaultThinkingLevel` semantics distinct from
  provider request fields.

- [ ] **Step 5: Update pins and run the focused gates.**

  ```powershell
  npm run test:release
  npm run typecheck
  npm run lint:sync
  npm run test:preservation
  ```

  Expected: all pass.

- [ ] **Step 6: Commit the model update.**

  ```powershell
  git add content/en/ch04-model-invocation.md content/vi/ch04-model-invocation.md content/en/how-to/plug-new-model.md content/vi/how-to/plug-new-model.md content/en/reference/api.md content/vi/reference/api.md content/en/reference/configuration.md content/vi/reference/configuration.md scripts/pi-release-contract.test.mjs
  git commit -m "docs: cover Pi 0.85.0 thinking compatibility"
  ```

## Task 5: Update Tool cwd and terminal capability behavior

**Files:**

- Modify: `content/en/ch05-tool-system.md`
- Modify: `content/vi/ch05-tool-system.md`
- Modify: `content/en/how-to/add-custom-tool.md`
- Modify: `content/vi/how-to/add-custom-tool.md`
- Modify: `content/en/reference/api.md`
- Modify: `content/vi/reference/api.md`
- Modify: `content/en/reference/configuration.md`
- Modify: `content/vi/reference/configuration.md`
- Modify: `content/en/reference/environment-variables.md`
- Modify: `content/vi/reference/environment-variables.md`
- Modify: `scripts/pi-release-contract.test.mjs`

- [ ] **Step 1: Add red Tool and terminal contracts.**

  Require both locales to list the exact built-in Tool set that honors the live
  `ctx.cwd`:

  ```js
  const cwdAwareTools = ["bash", "edit", "find", "grep", "ls", "read", "write"];
  const terminalOverrides = [
    "PI_HYPERLINKS",
    "PI_IMAGE_PROTOCOL",
    "PI_TRUE_COLOR",
    "terminal.hyperlinks",
    "terminal.images",
    "terminal.trueColor",
    "fullscreenCopyOnSelect",
  ];
  ```

  Reject the claim that the write Tool reports a UTF-16 byte count.

- [ ] **Step 2: Verify focused tests fail.**

  ```powershell
  node --test --test-name-pattern="live Tool cwd|terminal capability overrides" scripts/pi-release-contract.test.mjs
  ```

  Expected: FAIL on missing `ctx.cwd` and terminal overrides.

- [ ] **Step 3: Correct Tool path semantics.**

  Explain that built-in path resolution uses the invocation context rather than a
  permanently captured load-time cwd. Preserve the existing custom Tool security
  example, realpath containment, cancellation, output-bound, and PowerShell
  guidance. Remove only the misleading write-result byte-count statement.

- [ ] **Step 4: Add terminal configuration with precedence.**

  Document accepted values exactly:

  ```text
  PI_HYPERLINKS=1|0|auto
  PI_IMAGE_PROTOCOL=kitty|iterm2|none|auto
  PI_TRUE_COLOR=1|0|auto
  ```

  Explain settings precedence and the unsupported-escape-sequence risk. Add
  `fullscreenCopyOnSelect`, Ctrl+X selection behavior, Zed image detection, and
  the jump-to-latest transcript control without turning the configuration page
  into a raw changelog. Clarify that `fullscreenScrollbar: "auto"` also becomes
  visible from pointer interaction with its track. Add the public
  `detectSupportedImageMimeTypeFromFile()` export to the API reference and keep
  its filename-based detection scope distinct from image decoding.

- [ ] **Step 5: Run the paired validation.**

  ```powershell
  npm run test:release
  npm run lint:sync
  npm run test:preservation
  npm run lint:editorial
  ```

  Expected: all pass.

- [ ] **Step 6: Commit Tool and terminal behavior.**

  ```powershell
  git add content/en/ch05-tool-system.md content/vi/ch05-tool-system.md content/en/how-to/add-custom-tool.md content/vi/how-to/add-custom-tool.md content/en/reference content/vi/reference scripts/pi-release-contract.test.mjs
  git commit -m "docs: update Pi Tool and terminal behavior"
  ```

## Task 6: Add Extension prompt and RPC queue lifecycle

**Files:**

- Modify: `content/en/ch07-event-driven.md`
- Modify: `content/vi/ch07-event-driven.md`
- Modify: `content/en/how-to/stream-output.md`
- Modify: `content/vi/how-to/stream-output.md`
- Modify: `content/en/reference/api.md`
- Modify: `content/vi/reference/api.md`
- Modify: `scripts/pi-release-contract.test.mjs`

- [ ] **Step 1: Add red event/RPC assertions.**

  Require both locales to include:

  ```js
  const promptKinds = ["select", "confirm", "input", "editor", "custom"];
  const promptEvents = ["ui_prompt_start", "ui_prompt_end"];
  const rpcTerms = ["clear_queue", "steering", "followUp", "abort"];
  ```

  Require a statement that prompt events are best-effort and non-awaited. Require
  `clear_queue` to appear before `abort` in the interactive Escape sequence.

- [ ] **Step 2: Run the test and verify red.**

  ```powershell
  node --test --test-name-pattern="Extension prompt lifecycle|RPC queue lifecycle" scripts/pi-release-contract.test.mjs
  ```

  Expected: FAIL on missing events and command.

- [ ] **Step 3: Extend the event catalog.**

  Add `UIPromptStartEvent`, `UIPromptEndEvent`, and `UIPromptKind` to the existing
  Extension event explanation. Explain coalescing around the outer waiting span,
  `title?`, and `reason: "ui_prompt"`. Document
  `{ embedWorkingStatus: true }` for a custom editor while noting that the default
  editor embeds its working indicator automatically.

- [ ] **Step 4: Correct RPC cancellation guidance.**

  Add the request and response shapes:

  ```ts
  { id?: string; type: "clear_queue" }
  {
    id?: string;
    type: "response";
    command: "clear_queue";
    success: true;
    data: { steering: string[]; followUp: string[] };
  }
  ```

  State that `abort` waits for idle but queued work can continue unless the queue
  is cleared, and that RPC abort now cancels an active manual compaction. Keep
  stream examples transport-neutral and incorporate the fix for valid terminal
  SSE events without implying that every provider uses SSE. In the Extension API
  discussion, clarify that `pi.setModel()` and `pi.setThinkingLevel()` persist for
  the current session but do not redefine the default for newly created sessions.

- [ ] **Step 5: Run event, compile, sync, and preservation checks.**

  ```powershell
  npm run test:release
  npm run typecheck
  npm run lint:sync
  npm run test:preservation
  ```

  Expected: all pass.

- [ ] **Step 6: Commit the event/RPC update.**

  ```powershell
  git add content/en/ch07-event-driven.md content/vi/ch07-event-driven.md content/en/how-to/stream-output.md content/vi/how-to/stream-output.md content/en/reference/api.md content/vi/reference/api.md scripts/pi-release-contract.test.mjs
  git commit -m "docs: add Pi 0.85.0 prompt and RPC lifecycle"
  ```

## Task 7: Add external session restoration and mid-run compaction

**Files:**

- Modify: `content/en/ch08-context-engineering.md`
- Modify: `content/vi/ch08-context-engineering.md`
- Modify: `content/en/ch09-compaction.md`
- Modify: `content/vi/ch09-compaction.md`
- Modify: `content/en/ch10-session.md`
- Modify: `content/vi/ch10-session.md`
- Modify: `content/en/how-to/persist-sessions.md`
- Modify: `content/vi/how-to/persist-sessions.md`
- Modify: `content/en/how-to/host-session-runtime.md`
- Modify: `content/vi/how-to/host-session-runtime.md`
- Modify: `content/en/reference/api.md`
- Modify: `content/vi/reference/api.md`
- Modify: `scripts/pi-release-contract.test.mjs`
- Modify: `tests/fixtures/pi-sdk-0850.contract.ts`

- [ ] **Step 1: Add red session restoration assertions.**

  Extract the displayed restoration example from both persistence guides and
  require it to match `restoreExternalSessionEntries()` in the compile fixture.
  Require the exact call shape:

  ```ts
  SessionManager.inMemory(cwd, { id: sessionId }, entries)
  ```

  The prose contract must distinguish external storage ownership from Pi file
  persistence and must state that the input is `FileEntry[]`.

- [ ] **Step 2: Add red mid-run compaction assertions.**

  Require Chapters 8 and 9 to describe this order in both locales:

  ```text
  Tool result appended -> threshold check -> optional compaction -> next assistant response
  ```

  Also require the terminating-batch/no-queued-message skip condition and retain
  checks before a new prompt and after a low-level run.

- [ ] **Step 3: Verify both contracts fail.**

  ```powershell
  node --test --test-name-pattern="external in-memory session|mid-run compaction" scripts/pi-release-contract.test.mjs
  ```

  Expected: FAIL on the missing overload and lifecycle order.

- [ ] **Step 4: Update persistence and session chapters.**

  Add a complete ESM TypeScript restoration example, explain validation/migration
  expectations, and preserve the existing append-only tree, labels, branching,
  file persistence, and security sections. Incorporate fixes for imported-file
  overwrite, concurrent share overwrite, lost fork compaction boundaries, and
  in-memory forks requested before the active turn settles.

- [ ] **Step 5: Update compaction lifecycle and runtime-host claims.**

  Insert the mid-run threshold phase into the existing diagrams and numbered
  lifecycle rather than appending a disconnected note. Re-audit every
  `AgentSessionRuntime` replacement, abort, fork, and import claim at the exact
  tag; change only those whose source behavior differs. Convert the former
  post-`0.84.3` “unreleased” summary-validation warning into released `0.85.0`
  behavior: `getSummarizationFailure()` rejects incomplete `length` responses for
  compaction, turn-prefix summarization, and branch summarization. Update the
  existing positive/negative release-contract matrix instead of deleting it.

- [ ] **Step 6: Run focused and full release contracts.**

  ```powershell
  npm run test:release
  npm run typecheck
  npm run lint:sync
  npm run lint:mermaid
  npm run test:preservation
  ```

  Expected: all pass.

- [ ] **Step 7: Commit session and compaction updates.**

  ```powershell
  git add content/en/ch08-context-engineering.md content/vi/ch08-context-engineering.md content/en/ch09-compaction.md content/vi/ch09-compaction.md content/en/ch10-session.md content/vi/ch10-session.md content/en/how-to/persist-sessions.md content/vi/how-to/persist-sessions.md content/en/how-to/host-session-runtime.md content/vi/how-to/host-session-runtime.md content/en/reference/api.md content/vi/reference/api.md scripts/pi-release-contract.test.mjs tests/fixtures/pi-sdk-0850.contract.ts
  git commit -m "docs: update Pi session and compaction contracts"
  ```

## Task 8: Publish the bilingual release rollup

**Files:**

- Modify: `content/en/changelog.md`
- Modify: `content/vi/changelog.md`
- Modify: `content/en/index.mdx`
- Modify: `content/vi/index.mdx`
- Modify: `content/en/quickstart.md`
- Modify: `content/vi/quickstart.md`
- Modify: `content/en/help/faq.md`
- Modify: `content/vi/help/faq.md`
- Modify: `README.md`
- Modify: `scripts/content.test.mjs`
- Modify: `scripts/pi-release-contract.test.mjs`

- [ ] **Step 1: Add failing release-rollup assertions.**

  Require the first changelog entry in both locales to contain version `0.85.0`,
  date `2026-09-04`, tag URL, and these user-impact categories:

  ```js
  const releaseHighlights = [
    "SessionManager.inMemory",
    "supportsMidConvoEffort",
    "ui_prompt_start",
    "clear_queue",
    "ctx.cwd",
    "PI_HYPERLINKS",
    "pi-client",
    "pi-protocol",
    "pi-server",
  ];
  ```

  Require an explicit note that the migration includes the intervening `0.84.4`
  changes.

- [ ] **Step 2: Verify the changelog contract fails.**

  ```powershell
  node --test --test-name-pattern="README and bilingual changelog" scripts/content.test.mjs
  ```

  Expected: FAIL because the current leading entry targets `0.84.3`.

- [ ] **Step 3: Write the English and Vietnamese changelog entries.**

  Use four subsections in the same order:

  1. New capabilities;
  2. Behavior and interface changes;
  3. Reliability/provider fixes;
  4. Documentation and verification scope.

  Summarize fixes by user impact. Do not claim that experimental service APIs are
  stable, and do not delete historical entries. The entry must account for these
  additional release-note items without inflating each into a separate guide:

  - managed `fd`/ripgrep downloads on Linux musl and without a required GitHub
    Releases API call;
  - OpenAI Codex SSE terminal events, Mistral fragmented Tool calls, OpenAI
    reasoning replay/serialization, and incompatible custom Tool-call deltas;
  - Grok Build removal plus Qwen3.8 Flash, GitHub Copilot Claude Fable 5, Baseten
    GLM 5.2, Fireworks GLM, Vertex proxy, Cloudflare AI Gateway, and OpenRouter
    compatibility corrections;
  - resumed JSONL repair, concurrent share/import overwrite prevention, fork and
    compaction-boundary integrity, and manual-compaction abort cancellation;
  - `NO_PROXY`, proxied plain HTTP after Tool calls, restricted-seccomp
    `SIGWINCH`, EXIF orientation, and image-heavy transcript rendering;
  - Skills loading with Bash-only Tool availability, fullscreen selection/search,
    working-indicator placement, and relational-algebra LaTeX join symbols.

- [ ] **Step 4: Refresh entry-point pages and README.**

  Update the stated SDK baseline, install commands, release commit links, and
  current review wording. Keep the existing product description, bilingual
  navigation, GitBook/pi-handbook provenance, GPL notice, local commands, Vercel
  deployment notes, and URL structure.

- [ ] **Step 5: Run entry-point tests.**

  ```powershell
  node --test scripts/content.test.mjs scripts/pi-release-contract.test.mjs
  npm run lint:sync
  npm run test:preservation
  ```

  Expected: all pass for the updated pairs; older active pins are handled in Task
  9.

- [ ] **Step 6: Commit the release rollup.**

  ```powershell
  git add README.md content/en/changelog.md content/vi/changelog.md content/en/index.mdx content/vi/index.mdx content/en/quickstart.md content/vi/quickstart.md content/en/help/faq.md content/vi/help/faq.md scripts/content.test.mjs scripts/pi-release-contract.test.mjs
  git commit -m "docs: publish Pi 0.85.0 release notes"
  ```

## Task 9: Migrate all remaining active pins and Course comparisons

**Files:**

- Modify: every remaining matched file under `content/en/` and `content/vi/`
- Modify: `scripts/pi-evals-guide.test.mjs`
- Modify: `scripts/pi-release-contract.test.mjs`

- [ ] **Step 1: Enumerate remaining old baseline references.**

  Run:

  ```powershell
  rg -n "0\.84\.3|v0\.84\.3|4e58f324fae8ebfa98a3d45181fb248072a2afac|pi-release-0843|pi-sdk-0843" content README.md package.json scripts tests
  ```

  Classify every result as active current-baseline text or legitimate historical
  changelog context. Do not include `docs/superpowers/` in the replacement set.

- [ ] **Step 2: Add the final stale-baseline test before replacing content.**

  Add a test that recursively scans `content/en`, `content/vi`, and `README.md`.
  Permit `0.84.3` only inside the dated historical changelog section. Separately
  scan `package.json`, active scripts, and test fixtures for the old commit and
  active filenames `pi-release-0843` / `pi-sdk-0843`. The new fixture may contain
  `previousDocumentationVersion: "0.84.3"`; the test source may also name the old
  version as the value it rejects. Do not create a self-matching scanner that
  fails on its own expected strings.

- [ ] **Step 3: Verify the stale-baseline test fails.**

  ```powershell
  node --test --test-name-pattern="active baseline contains no stale Pi 0.84.3 pins" scripts/pi-release-contract.test.mjs
  ```

  Expected: FAIL and list the remaining active files.

- [ ] **Step 4: Update all unaffected chapter/guide source pins pairwise.**

  For `ch03-agent-loop`, `ch06-messages`, `ch11-testing-evaluation`, remaining
  how-to/reference pages, and paired glossaries:

  - audit the source diff for the cited file;
  - update package commands and current baseline wording to `0.85.0`;
  - update source URLs to the target commit;
  - keep prose unchanged when the claim is unchanged;
  - set `last_updated: 2026-09-04` only when the public file changes.

- [ ] **Step 5: Update Course comparison surfaces only.**

  Across `content/{en,vi}/course/index.mdx` and chapters `00` through `14`:

  - rename “Pi SDK 0.84.3” comparison headings/callouts to “Pi SDK 0.85.0”;
  - update pinned source links;
  - revise only a comparison whose referenced public Pi contract changed;
  - do not edit `course/src/`, `course/test/`, or checkpoint behavior.

- [ ] **Step 6: Update the eval guide release contract.**

  Set:

  ```js
  const RELEASE_COMMIT = "107d79f11072bbc8a3a757ed7fd69596bee7d68c";
  ```

  Re-audit each command and source path at the tag. If an upstream eval path or
  flag changed, update the paired guide and test together; otherwise change only
  the version/commit pin.

- [ ] **Step 7: Run all content and course gates.**

  ```powershell
  npm run test:release
  npm run test:evals-guide
  npm run test:content
  npm run test:course
  npm run lint:sync
  npm run lint:frontmatter
  npm run lint:content
  npm run test:preservation
  ```

  Expected: all pass, including 382 unchanged Course tests.

- [ ] **Step 8: Commit the baseline migration.**

  ```powershell
  git add content scripts/pi-evals-guide.test.mjs scripts/pi-release-contract.test.mjs
  git commit -m "docs: migrate all Pi SDK comparisons to 0.85.0"
  ```

## Task 10: Record the bilingual technical review

**Files:**

- Create: `docs/translation-review/2026-09-04-pi-0850.md`
- Modify: `GLOSSARY.md` only if a new canonical term is required
- Modify: `content/en/glossary.md` only if a new reader-facing definition is required
- Modify: `content/vi/glossary.md` only if a new reader-facing definition is required
- Modify: `content/preservation-manifest.json` only for a source-proven deletion

- [ ] **Step 1: Create the review ledger with one row per translation pair.**

  Use this table schema:

  ```markdown
  | Key | EN review | VI review | Change class | Pi 0.85.0 evidence | Rendering |
  |---|---|---|---|---|---|
  | `home` | reviewed | reviewed | release-pin | release/tag link | pending |
  ```

  Valid change classes are `substantive`, `release-pin`, and `verified-unchanged`.
  Include all 43 keys in manifest order. Link substantive rows to exact commit
  files or the official release.

- [ ] **Step 2: Record removals and retained scope.**

  Add a section listing every removed factual claim, its replacement, and pinned
  evidence. If there were no deletions, state exactly:

  ```markdown
  No source-proven content deletion was required for this migration.
  ```

  Record that Course source/tests were deliberately unchanged.

- [ ] **Step 3: Audit terminology.**

  Search Vietnamese prose for translated or malformed occurrences of new
  identifiers. At minimum, keep these exact:

  ```text
  supportsMidConvoEffort
  supportsMaxOutputTokens
  vllmPriority
  ui_prompt_start
  ui_prompt_end
  clear_queue
  ctx.cwd
  serverId
  sessionId
  attachmentId
  Chord
  ```

  Add glossary entries only when a concept needs explanation; do not add a row
  merely because an identifier appears.

- [ ] **Step 4: Run editorial and preservation validation.**

  ```powershell
  npm run lint:editorial
  npm run lint:sync
  npm run test:editorial
  npm run test:preservation
  ```

  Expected: all pass without lowering preservation floors.

- [ ] **Step 5: Commit the review evidence.**

  ```powershell
  git add docs/translation-review/2026-09-04-pi-0850.md GLOSSARY.md content/en/glossary.md content/vi/glossary.md content/preservation-manifest.json
  git commit -m "docs: record Pi 0.85.0 bilingual review"
  ```

  Stage only files that actually changed; omit optional paths from `git add` when
  unchanged.

## Task 11: Run the complete local release gate

**Files:**

- Verify only; modify prior task files only when a failing check identifies a
  concrete defect.

- [ ] **Step 1: Verify the required runtime and clean dependency install.**

  ```powershell
  $env:Path = "C:\Users\Admin\AppData\Local\nvm\v22.19.0;$env:Path"
  node --version
  npm ci
  ```

  Expected: Node prints `v22.19.0`; install succeeds with no lockfile change.

- [ ] **Step 2: Run focused release checks first.**

  ```powershell
  npm run test:release
  npm run test:evals-guide
  npm run typecheck
  ```

  Expected: every command exits zero.

- [ ] **Step 3: Run the full repository quality gate.**

  ```powershell
  npm run quality:content
  npm run format:check
  npm run build
  git diff --check
  ```

  Expected: 43 EN/VI pairs and 86 public files validate, all 382 Course tests
  remain green, and the production Next.js build succeeds.

- [ ] **Step 4: Prove stale active references are gone.**

  ```powershell
  rg -n "v0\.84\.3|4e58f324fae8ebfa98a3d45181fb248072a2afac|pi-release-0843|pi-sdk-0843" content README.md package.json scripts/fixtures tests/fixtures scripts/pi-evals-guide.test.mjs
  rg -n "0\.84\.3" content README.md package.json scripts tests
  ```

  Expected: the first command has no matches. The second may match only the
  historical changelog entry and `previousDocumentationVersion` fixture field.

- [ ] **Step 5: Validate pinned GitHub links.**

  Extract unique `github.com/earendil-works/pi/blob/107d79f...` URLs from changed
  public files and request their anchor-free raw equivalents:

  ```powershell
  $releaseCommit = "107d79f11072bbc8a3a757ed7fd69596bee7d68c"
  $changedContent = git diff --name-only origin/main...HEAD -- content
  $pattern = 'https://github\.com/earendil-works/pi/blob/{0}/[^\s\)\]''"]+' -f [regex]::Escape($releaseCommit)
  $urls = foreach ($path in $changedContent) {
    $text = Get-Content -Raw -LiteralPath $path
    [regex]::Matches($text, $pattern).Value
  }
  $urls = $urls | ForEach-Object { $_.Split("#")[0] } | Sort-Object -Unique
  foreach ($url in $urls) {
    $raw = $url -replace "^https://github\.com/earendil-works/pi/blob/", "https://raw.githubusercontent.com/earendil-works/pi/"
    $response = Invoke-WebRequest -UseBasicParsing -Uri $raw
    if ($response.StatusCode -ne 200) { throw "Broken pinned source: $url" }
  }
  ```

  Expected: every request returns HTTP 200 and no `0.85.0` claim links to `main`.

- [ ] **Step 6: Smoke-test rendered docs.**

  Start the local production server in a hidden process:

  ```powershell
  $docsServer = Start-Process -FilePath npm.cmd -ArgumentList "run", "start", "--", "-p", "3210" -WorkingDirectory (Get-Location) -WindowStyle Hidden -PassThru
  ```

  Use the browser skill against `http://127.0.0.1:3210` and inspect at least:

  ```text
  /en/ch02-three-layer-arch
  /vi/ch02-three-layer-arch
  /en/ch04-model-invocation
  /vi/ch04-model-invocation
  /en/ch09-compaction
  /vi/ch09-compaction
  /en/reference/api
  /vi/reference/api
  /en/changelog
  /vi/changelog
  /en/course/10-session-tree
  /vi/course/10-session-tree
  ```

  Verify locale navigation, headings, code highlighting, callouts, tables,
  Mermaid diagrams, and absence of `.md` suffix navigation. Stop the exact server
  process in a `finally` cleanup after the browser checks:

  ```powershell
  Stop-Process -Id $docsServer.Id
  ```

- [ ] **Step 7: Update review-ledger rendering status.**

  Change applicable `pending` cells in
  `docs/translation-review/2026-09-04-pi-0850.md` to `checked`, rerun Prettier and
  `git diff --check`, and commit only if this creates a diff:

  ```powershell
  git add docs/translation-review/2026-09-04-pi-0850.md
  git commit -m "test: verify Pi 0.85.0 documentation release"
  ```

- [ ] **Step 8: Inspect final branch state.**

  ```powershell
  git status --short
  git log --oneline origin/main..HEAD
  ```

  Expected: clean worktree and only the planned Pi `0.85.0` commits ahead of
  `origin/main`.

## Completion handoff

After Task 11 is green, invoke `superpowers:requesting-code-review`, resolve any
validated findings, rerun `superpowers:verification-before-completion`, and then
offer the integration choices from `superpowers:finishing-a-development-branch`.
Do not push, merge, or deploy until the selected handoff step authorizes it.
