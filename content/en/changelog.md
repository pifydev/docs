---
title: Changelog
description: Changes to the Pify documentation site, separate from the Pi SDK changelog.
translation_key: changelog
language: en
status: reviewed
reviewed_by: Pify maintainers
last_updated: '2026-09-04'
---
This page records changes to the Pify documentation site. For Pi releases, use the [upstream release history](https://github.com/earendil-works/pi/releases).

## 2026-09-04

Pify's documentation baseline now follows the official [Pi `0.85.0` release](https://github.com/earendil-works/pi/releases/tag/v0.85.0) and explicitly includes the intervening [Pi `0.84.4` release](https://github.com/earendil-works/pi/releases/tag/v0.84.4). This is a documentation-release summary of user-visible changes, not a copy of Pi's upstream changelog.

### New capabilities

- Documented external session restoration through `SessionManager.inMemory()` and the ownership boundary for externally stored entries, plus persistent thinking settings and the inherited `supportsMidConvoEffort` compatibility flag.
- Added the experimental service architecture formed by `@earendil-works/pi-client`, `@earendil-works/pi-protocol`, and `@earendil-works/pi-server`, including routed sessions, transport, and protocol responsibilities.

### Behavior and interface changes

- Added the prompt and RPC lifecycle: `ui_prompt_start`/`ui_prompt_end` identify waits for extension UI, while `clear_queue` returns and removes steering and follow-up messages before abort flows.
- Clarified that built-in path tools resolve the live invocation `ctx.cwd`, and documented terminal/fullscreen behavior including `PI_HYPERLINKS`, capability overrides, faster search, selection-copy controls, and the embedded working indicator.
- Recorded fixes for Bash-only Skills and relational-algebra LaTeX rendering.

### Reliability/provider fixes

- Covered managed `fd`/`rg` downloads on musl without requiring the GitHub Releases API, restored the `@earendil-works/pi-coding-agent/client` compatibility entry point, and fixed incompatible event sequences and custom Tool-call deltas.
- Codex SSE now processes terminal events without a trailing blank line; fragmented Mistral tool calls retain continuations that omit the tool-call ID; OpenAI reasoning replay merges streamed text and summary deltas; the unavailable Grok model was removed.
- Provider catalog and request fixes make the Qwen catalog include Qwen3.8 Flash, send selected reasoning for Fable, correct Baseten image input metadata, select the Fireworks API adapter, repair Vertex proxy use, include Cloudflare gateway catalog models, and keep OpenRouter models that require reasoning from receiving `none` effort.
- Recorded JSONL append, concurrent share, collision-safe import, in-memory and file-backed fork, compaction, and manual abort integrity fixes.
- Documented `NO_PROXY` matching, proxy HTTP tunneling, restricted-seccomp terminal startup, EXIF orientation scanning, and safe image rendering for large output.

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
