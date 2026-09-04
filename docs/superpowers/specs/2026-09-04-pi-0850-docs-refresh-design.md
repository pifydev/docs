# Pi 0.85.0 Documentation Refresh — Design Spec

- **Date:** 2026-09-04
- **Status:** Approved
- **Owner:** Pify Docs maintainers
- **Documentation baseline:** Pi `0.84.3`
- **Target release:** Pi `0.85.0`
- **Target tag commit:** `107d79f11072bbc8a3a757ed7fd69596bee7d68c`
- **Intermediate release included:** Pi `0.84.4`

## 1. Decision

Upgrade the complete 43-pair English/Vietnamese documentation baseline from Pi
`0.84.3` to `0.85.0`. Every public page will be audited, but only pages affected
by a verified source or behavior change will receive substantive edits. Other
pages retain their current depth and receive only the release-pin or wording
changes required to keep the baseline internally consistent.

The update must not shorten, flatten, or otherwise narrow the current content.
Material may be removed only when it is demonstrably incorrect for `0.85.0` or
duplicated elsewhere on the same page.

## 2. Goals

- Explain the user-visible additions, changes, and fixes in Pi `0.85.0` in both
  English and Vietnamese.
- Include relevant `0.84.4` changes because the current docs jump directly from
  `0.84.3` to `0.85.0`.
- Update version-sensitive API, runtime behavior, settings, and architecture
  claims against the exact published release.
- Preserve the current 43 translation pairs, navigation, URLs, course scope,
  diagrams, examples, and explanatory depth.
- Keep IT and Coding identifiers in English while making surrounding English and
  Vietnamese prose natural and technically precise.
- Compile-check copyable TypeScript examples against exact `0.85.0` packages.
- Prevent stale `0.84.3` claims or links from surviving in active public docs.

## 3. Non-goals

- Do not redesign the Fumadocs interface, navigation, or deployment topology.
- Do not add another public locale.
- Do not rewrite the independent Course implementation to imitate Pi internals.
- Do not document post-tag `main` behavior as released functionality.
- Do not promise stability for `pi-client`, `pi-protocol`, `pi-server`, Chord, or
  other interfaces that upstream labels experimental.
- Do not add per-page attribution or adaptation notices. The existing centralized
  README provenance policy remains unchanged.

## 4. Source of truth

Evidence is evaluated in this order:

1. Published GitHub releases:
   - `https://github.com/earendil-works/pi/releases/tag/v0.85.0`
   - `https://github.com/earendil-works/pi/releases/tag/v0.84.4`
2. Exact source at commit
   `107d79f11072bbc8a3a757ed7fd69596bee7d68c`.
3. Published npm package metadata and declarations for version `0.85.0`.
4. Official Markdown documentation contained in that tag.

The release tag, commit, and npm package must agree before an API is described as
published. Source on another branch or a later commit may be used to understand
history but must not be presented as part of `0.85.0`.

The release contract records at least:

- version `0.85.0`;
- tag `v0.85.0`;
- commit `107d79f11072bbc8a3a757ed7fd69596bee7d68c`;
- publication timestamp `2026-09-04T10:18:28Z`;
- Node.js requirement `>=22.19.0`;
- exact package versions used by compile fixtures.

## 5. Update strategy

### 5.1 Rejected: mechanical version bump

Changing `0.84.3` to `0.85.0` without auditing source is insufficient. The
experimental client/server boundary and several runtime contracts changed enough
that old prose would become misleading while appearing current.

### 5.2 Selected: verified baseline migration

Use the `0.84.3..0.85.0` source diff to classify every current claim as:

- unchanged and safe to retain;
- changed and requiring a targeted correction;
- newly relevant and worth adding without displacing existing material;
- obsolete and removable only with explicit evidence.

This keeps stable explanations intact while directing review effort toward actual
release changes.

### 5.3 Rejected: full rewrite

A full rewrite would create translation drift and risk losing the depth restored
in the previous editorial pass. It provides no accuracy benefit for unchanged
areas.

## 6. Release changes that require documentation

### 6.1 Session restoration

Document the new overload:

```ts
SessionManager.inMemory(process.cwd(), { id: sessionId }, entries)
```

Explain that an application can restore externally stored `FileEntry[]` without
creating a Pi session file. Keep the distinction between ownership of external
storage, in-memory session state, and Pi's append-only session tree. Recheck
forking, import, compaction-boundary, and active-turn settlement claims against
the new implementation.

### 6.2 Model and provider compatibility

Add the published compatibility controls:

- `AnthropicMessagesCompat.supportsMidConvoEffort`;
- `OpenAICompletionsCompat.vllmPriority`;
- `OpenAIResponsesCompat.supportsMaxOutputTokens`.

Explain persistent Claude thinking effort only for supported Anthropic transports
and exact compatible models. Include safe recovery from signed-thinking prefix
mismatches without generalizing the behavior to all Anthropic-compatible
providers.

### 6.3 Extension UI lifecycle

Add `ui_prompt_start` and `ui_prompt_end`, including prompt kinds
`select | confirm | input | editor | custom`. Describe these as best-effort,
non-awaited lifecycle signals around a blocking user-facing Extension prompt.
Document `embedWorkingStatus` for custom editors and the default editor's embedded
working indicator.

### 6.4 RPC queue and cancellation semantics

Add `clear_queue` and its returned `steering` and `followUp` text arrays. Clarify
that `abort` waits for idle and does not implicitly promise to discard queued
messages. Interactive Escape behavior must be described using the documented
clear-then-abort sequence where applicable.

### 6.5 Compaction timing and summaries

Update the lifecycle to show the threshold check after Tool results are appended
and before the next assistant response. Explain when mid-run compaction is skipped
at a terminating batch boundary, and retain the checks before a new prompt and
after a low-level run. Incorporate fixes for lost compaction boundaries and branch
summary reasoning that exceeded the previous cap.

### 6.6 Tool working directory

State that the built-in `bash`, `edit`, `find`, `grep`, `ls`, `read`, and `write`
Tools honor the live invocation `ctx.cwd`. Examples must not imply that paths are
permanently bound to the directory captured when a Tool or Extension was loaded.
The write Tool must no longer claim that its result reports a UTF-16 byte count.

### 6.7 Terminal and fullscreen behavior

Integrate the settings and environment overrides introduced in `0.84.4`:

- `PI_HYPERLINKS=1|0|auto` / `terminal.hyperlinks`;
- `PI_IMAGE_PROTOCOL=kitty|iterm2|none|auto` / `terminal.images`;
- `PI_TRUE_COLOR=1|0|auto` / `terminal.trueColor`;
- `fullscreenCopyOnSelect`;
- fullscreen transcript jump-to-latest and selection behavior.

Document precedence and warn that forcing an unsupported terminal capability can
emit escape sequences the terminal cannot render.

### 6.8 Experimental service architecture

Replace the old `PiServer`/`PiServerService` description with the released
`0.85.0` boundary:

- `@earendil-works/pi-client` exposes transport-neutral `Client` primitives and
  `createClientServiceTransport()`;
- `@earendil-works/pi-protocol` owns strict routed envelopes, CBOR framing, and
  transport validation, while application payload semantics remain opaque;
- Chord owns service-control parsing, bindings, subscriptions, and replicated
  state;
- `@earendil-works/pi-server` routes server- and Session-scoped services through
  presentation attachments;
- requests use durable `{ serverId, sessionId, attachmentId }` routing where
  applicable;
- actual `Session` and Agent Harness objects remain process-local.

The docs must retain a prominent experimental warning and must not describe this
layer as the ordinary three-package Agent SDK stack.

### 6.9 Fix rollup

The changelog will summarize fixes by user impact rather than repeat every commit:

- provider stream compatibility and terminal-event handling;
- managed `fd`/ripgrep downloads, including Linux musl and avoiding a required
  GitHub Releases API call;
- `NO_PROXY`, proxied HTTP, and RPC abort correctness;
- session share/import/fork and compaction integrity;
- image metadata, EXIF orientation, and terminal image detection;
- model-catalog corrections and removal of unavailable models;
- Skills loading when Bash is the only available Tool.

Provider-specific fixes may appear in deeper guides only where they alter an
existing explanation or operational warning.

## 7. Content impact map

### 7.1 Global audit: all 43 EN/VI pairs

Every page is scanned for `0.84.3`, `v0.84.3`, commit `4e58f324...`, old package
install commands, old source links, and version-specific wording. Global edits
must not be used to hide a page that needs substantive review.

### 7.2 Substantive chapter updates

| Area | Primary pages |
|---|---|
| Package and service architecture | `ch01-overview`, `ch02-three-layer-arch` |
| Model transport and thinking effort | `ch04-model-invocation` |
| Live Tool cwd and write result | `ch05-tool-system` |
| Extension prompt lifecycle | `ch07-event-driven` |
| Mid-run context handling | `ch08-context-engineering`, `ch09-compaction` |
| External in-memory restoration and fork integrity | `ch10-session` |
| Verification examples | `ch11-testing-evaluation` when its published contracts changed |

`ch03-agent-loop` and `ch06-messages` still receive source-diff review even if the
result is only a release-pin update.

### 7.3 Substantive guide/reference updates

- `how-to/persist-sessions`: external-entry restoration and safety boundaries.
- `how-to/host-session-runtime`: revalidate replacement and cancellation behavior.
- `how-to/plug-new-model`: new compatibility flags and provider fixes.
- `how-to/add-custom-tool`: live `ctx.cwd` semantics.
- `how-to/stream-output`: stream terminal-event fixes if they affect guidance.
- `reference/api`: new public types, overloads, events, and exports.
- `reference/configuration`: model-thinking, terminal, and fullscreen settings.
- `reference/environment-variables`: new terminal capability overrides.
- `quickstart`, home, FAQ, glossary, and remaining guides: release consistency and
  claim audit without forced expansion.

The eval and deterministic-testing guides are recompiled and diff-audited. They
are rewritten only if the published `0.85.0` harness or eval contract requires it.

### 7.4 Course pages

Keep all 15 Course implementation checkpoints and their tests unchanged unless a
course defect is independently discovered. Update only:

- source links and release pins;
- headings/callouts that say “Pi SDK 0.84.3”;
- comparisons whose referenced Pi public contract changed.

The workshop remains an educational implementation, not an API compatibility
layer for Pi `0.85.0`.

## 8. Bilingual editorial contract

- English describes the released API directly and avoids translation-shaped
  phrasing.
- Vietnamese retains API names, type names, event names, flags, environment
  variables, Tool names, package names, paths, and protocol fields in English.
- The two locales preserve the same heading hierarchy, tables, code blocks,
  diagrams, warnings, lists, and factual scope.
- Code stays identical across locales except for explanatory comments when a
  localized comment materially helps comprehension.
- New terms are added to the paired glossary only when readers need a definition;
  public identifiers are not translated into invented Vietnamese names.
- Review metadata advances together for both locales after technical and language
  review.

## 9. Test-first release contract

The implementation begins by changing or adding tests that fail against the old
baseline. Required coverage:

1. A `pi-release-0850.json` fixture identifies the exact GitHub release and npm
   package authority.
2. Directly imported Pi packages are exactly pinned to `0.85.0`.
3. Compile fixtures build against the published `0.85.0` declarations.
4. A focused compile/runtime fixture covers restoring an in-memory session from
   external entries.
5. Static content contracts require the new compatibility settings, Extension
   events, RPC queue semantics, compaction timing, and `ctx.cwd` behavior in both
   locales.
6. Experimental architecture contracts reject retired `PiClient` and
   `PiServerService` descriptions where those names no longer match the exported
   `0.85.0` API.
7. Active public content cannot retain the old version, tag commit, or fixture
   filename except in explicitly historical changelog context.
8. Existing preservation and translation-parity tests continue to pass.

Version-specific fixture and assertion names should become `0850`. Historical
review/spec files are excluded from the active-content stale-pin prohibition and
must not be rewritten as if they had originally reviewed `0.85.0`.

## 10. Preservation and deletion policy

The existing preservation manifest remains the minimum baseline. For every
substantively edited page:

- keep all unaffected sections and examples;
- preserve heading depth, fenced examples, tables, and diagrams;
- add context near the existing relevant section instead of appending an
  unstructured release-note dump;
- record any removal with the exact obsolete claim and upstream evidence;
- do not lower preservation floors merely to make a rewritten page pass.

If an old example no longer compiles, replace it in place with an equivalent
`0.85.0` example and retain the surrounding explanation's learning objective.

## 11. Validation and release gates

The update is complete only after:

- release-contract tests pass against exact `0.85.0` dependencies;
- all 43 EN/VI pairs pass structural and terminology sync checks;
- all 86 public content files pass frontmatter and editorial validation;
- preservation, content, unit, course, eval-guide, and Mermaid tests pass;
- TypeScript typecheck, ESLint, Prettier, and production build pass on Node
  `22.19.x`;
- a stale-pin scan finds no unintended `0.84.3`, old commit, or `0843` active
  artifacts;
- all changed official GitHub source links resolve at the pinned commit;
- rendered EN and VI pages receive a browser smoke check for navigation, code
  highlighting, callouts, tables, and diagrams.

No production deployment is part of the content-editing step unless separately
authorized during release handoff.

## 12. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Treating a large experimental rewrite as stable API | Preserve upstream experimental labels and document only exact tag exports. |
| Mechanical pin replacement masks obsolete prose | Maintain the content impact map and require feature-specific assertions. |
| New material reduces bilingual parity | Edit EN/VI as pairs and run structural sync after each batch. |
| Release-note wording overstates provider scope | Verify source conditions and name the specific transport/compatibility flag. |
| Updating the Course changes its teaching contract | Restrict edits to Pi comparison surfaces; keep Course code/tests stable. |
| Old links remain in active docs | Enforce exact tag/commit parsing and a final stale-pin scan. |
| “Cleanup” removes restored depth | Keep preservation floors and require evidence for every deletion. |

## 13. Acceptance criteria

- All 43 public EN/VI pairs identify Pi `0.85.0` consistently where a current SDK
  baseline is mentioned.
- The bilingual changelog covers both `0.84.4` and `0.85.0` changes relevant to
  current users.
- Session restoration, persistent thinking effort, Extension prompt events, RPC
  queue handling, mid-run compaction, live Tool cwd, terminal overrides, and the
  experimental service architecture are accurately documented.
- Copyable examples compile against exact published `0.85.0` packages.
- Course implementation behavior and all 382 course tests remain intact.
- No unapproved loss of content depth or structure occurs.
- Full local verification is green before integration or deployment is proposed.
