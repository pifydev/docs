---
title: Changelog
description: Changes to the Pify documentation site, separate from the Pi SDK changelog.
translation_key: changelog
language: en
status: reviewed
reviewed_by: Pify maintainers
last_updated: '2026-10-01'
---
This page records changes to the Pify documentation site. For Pi releases, use the [upstream release history](https://github.com/earendil-works/pi/releases).

## 2026-10-01

### Release coverage

Pify advances its documentation baseline to the official [Pi `v0.99.2` release](https://github.com/earendil-works/pi/releases/tag/v0.99.2). This entry rolls up the complete `0.99.x` publication chain—[`v0.99.0`](https://github.com/earendil-works/pi/releases/tag/v0.99.0), [`v0.99.1`](https://github.com/earendil-works/pi/releases/tag/v0.99.1), and `v0.99.2`—and pins source review to the exact release commit [`005af57d`](https://github.com/earendil-works/pi/commit/005af57d88ee23b33778f343a9595b32e67ff788). It summarizes user-visible changes that affect this documentation rather than reproducing the upstream package changelogs.

### Major platform capabilities

- `v0.99.0` introduced Codemode, Tool search, and MCP as built-in coding-agent extensions. Extensions can select `direct`, `model-only`, `codemode`, `deferred`, or `hidden` exposure, group Tools into namespaces, return `structuredContent`, and orchestrate bounded nested calls through `ctx.executeTool()`.
- Experimental Virtual Models can keep a stable model identity in session history while an extension selects a physical model and thinking level for each request. The routed physical model remains visible for cost accounting and diagnostics.
- The model runtime now treats chat, image, and classifier models as explicit operation types. It adds provider-resolved `generateImages()` and `classify()` operations while keeping existing unqualified model reads chat-only.
- The experimental `@earendil-works/pi-durable` package grew from an openable Harness and first chat/Tool turns into persisted Documents, Tasks, Conversations, inbox/reset scheduling, views and events, subagent ownership, structured concurrency, compaction, and one-retry overflow recovery.
- `v0.99.2` keeps default MCP servers out of the Codemode Tool description and stops waiting for them before the first prompt. Scripts discover server Tools through `searchTools()` and `describeNamespace()`; `/reload` also enables Tools newly added to `defaultTools`.

### Models, authentication, and interface

- `v0.99.1` added `gpt-6.1-sol` to OpenAI, Azure OpenAI Responses, and OpenAI Codex, and made it the default model for the legacy OpenAI Codex provider. The bundled release also restores the OpenAI login flow module.
- `v0.99.0` added Claude Sonnet 5.5, Sign in with ChatGPT for the OpenAI provider, classifier catalogs and Jev routes, the system terminal theme, and richer model-operation catalog accessors. `@earendil-works/pi-ai/models` in `v0.99.2` offers a lightweight entry point for model collections and provider construction.
- Anthropic workload identity federation can read the documented SDK environment variables, with API keys and `ANTHROPIC_AUTH_TOKEN` taking precedence. MCP HTTP servers can use a current provider-login token, while `oauth.clientName` supports servers that require a known OAuth client; provider-token authentication is limited to global configuration or extension registration and requires HTTPS except on loopback.
- MCP server descriptions now appear in the compact system-prompt server list and participate in Tool-search ranking. Direct MCP calls and fallback-rendered Tool calls show their arguments, while Codemode exposes structured results to JavaScript and records nested usage in session cost.

### Reliability and behavioral corrections

- Codemode/MCP fixes align MCP Tool names with Codemode identifiers, load the worker in Windows binaries, validate generated image data, cap wrapped result previews, omit hidden Tools from the system prompt, and keep late MCP startup or authentication from blocking the first user prompt.
- Model/provider fixes reject unfinished OpenAI Responses Tool calls, preserve requested Mistral thinking levels and direct-call sampling parameters, recognize Z.AI CN context overflow, send unsupported Anthropic strict schemas non-strict, and fall back to exponential backoff when `Retry-After` cannot be parsed.
- Catalog and routing fixes merge remote models in linear time and resolve each branch's Virtual Model selection with one catalog lookup. New sessions are persisted at the first user message, and `RpcClient` no longer skips the next listener when another listener unsubscribes during dispatch.
- Durable recovery now makes ownership and abort order explicit, waits for foreground descendants before owner completion, rejects background task-owned children, deduplicates admitted requests, and allows replay after interruption only when a Tool declares `replay: "safe"`.

### Documentation and verification scope

- Direct dependencies are pinned exactly to `0.99.2` for `@earendil-works/pi-ai`, `@earendil-works/pi-agent-core`, `@earendil-works/pi-coding-agent`, `@earendil-works/pi-server`, `@earendil-works/pi-durable`, and `@earendil-works/chord`. Release authority is recorded in `scripts/fixtures/pi-release-0992.json`.
- Compile fixtures cover the public SDK, coding-agent, and Durable surfaces in `tests/fixtures/pi-sdk-0992.contract.ts`, `tests/fixtures/pi-coding-agent-0992.contract.ts`, and `tests/fixtures/pi-durable-0992.contract.ts`. The verification suite also opens and closes a Durable Harness offline; it does not call a live provider account.
- Added synchronized English/Vietnamese guides for Codemode and MCP, Virtual Models, and the experimental Durable Agent. The public inventory now contains 46 bilingual page pairs and 92 public documents, with route, frontmatter, language-alternate, navigation, and LLM-index count checks.

## 2026-09-23

### Release coverage

Pify moves its documentation baseline from `0.85.0` to [Pi `0.87.1`](https://github.com/earendil-works/pi/releases/tag/v0.87.1). This rollup includes [Pi `0.85.1`](https://github.com/earendil-works/pi/releases/tag/v0.85.1), [Pi `0.86.0`](https://github.com/earendil-works/pi/releases/tag/v0.86.0), [Pi `0.86.1`](https://github.com/earendil-works/pi/releases/tag/v0.86.1), and [Pi `0.87.0`](https://github.com/earendil-works/pi/releases/tag/v0.87.0), with source review pinned to [`f07218c`](https://github.com/earendil-works/pi/commit/f07218c4d4bbc12bef056a7058c3dd49dfe41abe).

### Breaking API migrations

- In `0.86.0`, provider streams receive normalized `TranscriptContext`. Custom providers read the prompt and tool declarations from `context.messages` through `getCurrentSystemPrompt()` and `getCurrentTools()`.
- `ToolCall.arguments` and `ToolResultMessage.details` accept JSON-compatible values; `ToolResultMessage` is now a conditional type, and `JsonValue` arrays are readonly.
- The `user_bash` hook is fail-closed: errors or invalid defined results stop the command before later handlers or local execution. Return `undefined` to continue dispatch, or return `{ operations }` or `{ result }` to handle the command.
- In `0.87.0`, replace `shouldStopAfterTurn` with `finishTurn` and return `{ action: "end" }` to stop after the turn. The hook runs before `turn_end`, but its decision applies afterward. It also receives error and aborted responses; a predicate intended only for normal responses must return `undefined` for those hard exits.
- `SessionManager` now owns canonical provider context for `AgentSession`; assigning `session.agent.state.messages` no longer replaces future request history. Restore entries with `SessionManager.inMemory()`, navigate with `session.navigateTree()`, or append through the session manager and call `session.refreshContext()`.
- Exhaustive `SessionEntry` switches must handle `ContextEditEntry` with type `context_edit`. Use `replacement: null` to omit an entry from future provider context, or supply replacement content; raw history stays intact.
- Extension integrations must account for the required boundary fields on `TurnEndEvent` and the new `AgentBeforeSettleEvent` in `ExtensionEvent`. Dispatch actionable `turn_end` and `agent_before_settle` boundaries through `emitBoundary()`; handlers can return entries and request continuation. Runs requested during `agent_settled` wait until all settled handlers finish.

### New capabilities

- `0.85.1` adds GPT-6 Astra through OpenAI API keys and OpenAI Codex subscriptions.
- `0.86.0` adds cost-aware prompt cache warming during long Tool runs, with optional idle warming and a `cache_warming_decision` hook. `/bug` gathers redacted diagnostics with an optional transcript or summary for upload to Radius or local ZIP export.
- Radius gains an offline model catalog, supplemented by cached and live discovery. In `0.86.1`, Meta Muse supports `/login meta` with key refresh and direct `META_API_KEY` authentication.
- Per-model compaction budgets use `compaction.modelOverrides` with `reserveTokens` and `keepRecentTokens`. Extensions can call configured models through `ctx.modelRegistry.stream()` and `streamSimple()` with resolved authentication. `pi.on()` returns an unsubscribe function; registration changes during dispatch affect subsequent dispatches.
- In `0.87.0`, `context_with_system` runs after `context` on the full transcript, including system messages, and sends its result verbatim. Per-model `inputLimits.images.resize` profiles in `models.json` apply to attachments, `read`, and Tool-result images.
- `0.87.1` adds Claude Opus 5.5 through Anthropic, GPT-6 Sol and GPT-6 Luna through OpenAI API keys and OpenAI Codex subscriptions, and all three through supported GitHub Copilot routes. New xAI sessions default to Grok 4.7.

### Reliability, provider, and CLI fixes

- The root-import packaging workaround needed for `0.85.0` is no longer needed after `0.85.1` fixes accidental publication of internal experimental dependencies. The experimental `client` and `experimental/plugin` subpaths and server/client commands become source-only through `pi-test.sh`; the supported local SDK and stdio RPC API keep their existing contracts.
- The `0.86.x` fixes cover GitHub Copilot GPT routing through Responses, provider reasoning and cache metadata, compaction/cancellation races, signal-terminated shell commands, clipboard fallbacks, and `/bug` diagnostics. `0.86.1` also enables Node's persistent compile cache before CLI startup.
- `0.87.0` repairs context-edit accounting and recovery omissions, restores prompt and Tool state after `context` handlers, and avoids rebuilding expired caches during delayed idle warming. Offline `/bug` permits local ZIP export while blocking uploads; unknown OpenAI-compatible endpoints receive strict Tool schemas only when they advertise support.
- In `0.87.1`, split-turn compaction prompts separate the conversation from continuation instructions so Claude Fable 5.1 can summarize it. A missing or invalid `--mode` value now reports an error and exits with a nonzero status.
- The image-only message fix omits an empty text part that some OpenAI-compatible providers reject. Anthropic OAuth requests also report the corrected Claude Code version.

### Documentation and verification scope

- This entry publishes Pify's `0.87.1` baseline authority and release rollup. Detailed chapter, How-to, reference, and source-review migrations are scheduled for the remaining commits in this release series. The Course implementation remains an independent teaching implementation with no promise of Pi API compatibility.
- Package verification pins `@earendil-works/pi-ai`, `@earendil-works/pi-agent-core`, `@earendil-works/pi-coding-agent`, and `@earendil-works/pi-server` to `0.87.1`. `scripts/fixtures/pi-release-0871.json` records release authority; `tests/fixtures/pi-sdk-0871.contract.ts` checks public declarations and supplies offline deterministic Agent, session restoration, and runtime-host checks. Content checks cover release links, migration claims, bilingual structure, `lint:sync`, `lint:frontmatter`, `lint:editorial`, and `test:preservation`; these checks do not exercise live provider accounts.
- `@earendil-works/pi-client`, `@earendil-works/pi-protocol`, and `@earendil-works/pi-server` remain experimental, with no stable API or compatibility guarantee. Pinning a package or describing a source contract does not change that boundary.

## 2026-09-04

Pify's documentation baseline now follows the official [Pi `0.85.0` release](https://github.com/earendil-works/pi/releases/tag/v0.85.0) and explicitly includes the intervening [Pi `0.84.4` release](https://github.com/earendil-works/pi/releases/tag/v0.84.4). This is a documentation-release summary of user-visible changes, not a copy of Pi's upstream changelog.

### New capabilities

- Documented external session restoration through `SessionManager.inMemory()` and the ownership boundary for externally stored entries.
- Documented persistent Claude thinking effort: supported Anthropic transports preserve per-turn effort and recover safely from signed-thinking mismatches. `supportsMidConvoEffort` belongs to `AnthropicMessagesCompat`, defaults to `false`, and may be enabled only for an exact supported Claude model on a faithful Anthropic Messages transport; it is the mechanism used for per-turn effort and signed-thinking recovery.
- Added model compatibility fields: `vllmPriority` belongs to `OpenAICompletionsCompat`, is relevant to vLLM priority scheduling, and is not set in generated model metadata by default, while vLLM server priority defaults to `0`; `supportsMaxOutputTokens` belongs to `OpenAIResponsesCompat`, defaults to `true`, and controls whether Responses-compatible gateways receive `max_output_tokens`.
- Added relational-algebra LaTeX join-symbol rendering support.
- Added the experimental service architecture formed by `@earendil-works/pi-client`, `@earendil-works/pi-protocol`, and `@earendil-works/pi-server`, including routed sessions, transport, and protocol responsibilities.

### Behavior and interface changes

- Added the prompt and RPC lifecycle: `ui_prompt_start`/`ui_prompt_end` identify waits for extension UI, while `clear_queue` returns and removes steering and follow-up messages before abort flows.
- Clarified that built-in path tools resolve the live invocation `ctx.cwd`, and documented terminal/fullscreen behavior including `PI_HYPERLINKS`, capability overrides, faster search, selection-copy controls, and the embedded working indicator.
- Recorded the fix for Bash-only Skills.

### Reliability/provider fixes

- Covered managed `fd`/`rg` downloads on musl without requiring the GitHub Releases API, restored the `@earendil-works/pi-coding-agent/client` compatibility entry point, and fixed incompatible event sequences and custom Tool-call deltas.
- Codex SSE now processes terminal events without a trailing blank line; fragmented Mistral tool calls retain continuations that omit the tool-call ID; OpenAI reasoning replay merges streamed text and summary deltas; the unavailable Grok model was removed.
- Provider catalog and request fixes make the Qwen catalog include Qwen3.8 Flash, send selected reasoning for Fable, correct Baseten image input metadata, select the Fireworks API adapter, repair Vertex proxy use, include Cloudflare gateway catalog models, and keep OpenRouter models that require reasoning from receiving `none` effort.
- Recorded JSONL append, concurrent share, collision-safe import, in-memory and file-backed fork, compaction, and manual abort integrity fixes.
- Documented `NO_PROXY` matching, proxy HTTP tunneling, restricted-seccomp terminal startup, and EXIF orientation scanning; resilient rendering of image-heavy output avoids the V8 string-length-limit crash.

### Documentation and verification scope

- Updated the Pify chapters, How-to guides, references, FAQ, Quickstart, examples, and compile fixtures to the `0.85.0` package and source baseline, with focused bilingual structure and behavior verification checks.
- The client/protocol/server service packages remain experimental; this documentation does not present those APIs as stable or promise compatibility beyond the published release.

## 2026-08-26

- Refreshed the technical baseline and code examples for Pi `0.84.3`.
- Added Chapter 11 and three How-to guides for SDK testing, evaluation, and runtime hosting.
- Published an original bilingual course with a separate overview and 15-checkpoint Build Your Own Pi-style Agent path.
- Added an offline TypeScript workshop with focused tests for every checkpoint.
- Expanded the site to 43 synchronized English/Vietnamese pairs and 86 public documents.

## 2026-08-24

- Added an automated bilingual editorial lint for residual Han characters, control characters, full-width punctuation, mojibake, known literal translations, and long Vietnamese prose without diacritics.
- Defined a canonical English/Vietnamese terminology contract and a review ledger pinned to a specific upstream Pi commit.
- Began the full editorial and technical review of all 23 English/Vietnamese page pairs.

## 2026-08-22

- Replaced the previous Astro and GitBook delivery experiments with a self-hosted Fumadocs application on Vercel.
- Added English and Vietnamese routing, localized navigation, search, SEO metadata, syntax highlighting, Mermaid rendering, and bilingual end-to-end tests.
- Published the Quickstart, Glossary, Changelog, five task-oriented How-to guides, API/configuration/environment reference pages, and FAQ.
- Added code-block titles and line highlighting through the Fumadocs renderer.
- Fixed localized documentation links so clean routes no longer expose `.md` filenames.
- Added the Pify logo, adaptive favicon, GPLv3 license, contribution guide, and deployment documentation.

## 2026-08-20

- Imported the first 10 English and Vietnamese chapters from the Pi Agent Book translation project; the original Chinese Pi Agent Book was the canonical source for that first translation.
- Added the initial documentation navigation and source-provenance records.
- Added a custom 404 page and generated sitemap.
