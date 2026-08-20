# Contributing to Pi Docs

Thank you for your interest in Pi Docs — a community translation of the [Pi Agent Book](https://www.dgzhuya.com/) source-code reading notes. This guide explains how to contribute, the style rules we follow, and the local workflow.

## Code of Conduct

Be respectful and focus on technical accuracy. Disagreements about translations are resolved by referencing the original Chinese source, the official [pi.dev](https://pi.dev) docs, and the [Pi source code](https://github.com/earendil-works/pi). When in doubt, follow the source code.

## How to Contribute

You can help in several ways:

- **Fix a typo or improve wording** in an existing translation (small PR, single file).
- **Translate a missing chapter** (medium PR, 1-2 files in `en/src/` or `vi/src/`).
- **Add a new term to `GLOSSARY.md`** when you encounter a technical term that is not yet listed (small PR).
- **Improve validation scripts or CI** in `scripts/` and `.github/workflows/` (medium PR).
- **Report a sync mismatch** between `zh/`, `en/`, and `vi/` by opening an issue.

All contributions go through pull requests. Direct pushes to `main` are not permitted.

## Translation Workflow

Follow these steps to translate or edit a chapter:

1. Identify the source chapter in `zh/src/` (Chinese is canonical).
2. Open the matching file in `en/src/` or `vi/src/`.
3. Preserve the frontmatter schema exactly; only update `status`, `last_updated`, `translator`, `reviewed_by`.
4. Translate the body following the [Style Rules](#style-rules).
5. Run `pwsh scripts/sync-check.ps1` locally to confirm structural parity with `zh/`.
6. Open a PR. CI runs `sync-check.yml` and `deploy.yml` automatically.

## Style Rules

These rules are enforced manually in review and partially automated by `validate-frontmatter.ps1`:

1. **Never translate code, API names, file paths, or environment variables.** Keep `SessionManager`, `PI_OFFLINE`, `~/.pi/agent/settings.json` as-is.
2. **Inline terms**: first occurrence uses `English term (short explanation)`; after that, English only.
3. **Headings**: write in natural English or Vietnamese; if the heading is a core technical term, keep the English term in parentheses.
4. **Code comments**: if the Chinese source comment is in Chinese, translate the comment to English or Vietnamese; keep all code identifiers unchanged.
5. **Numbers, units, dates**: keep the original format.
6. **Links**: keep the URL unchanged; translate the link text.
7. **Tables**: translate headers and cells; preserve column count.
8. **Frontmatter values** (`title_en`, `title_vi`): translate fully into the target language.
9. **No emojis** in prose, headings, or code comments.
10. **No fluff**: avoid cheerful filler like "Thanks!" or "Hope this helps!" — technical prose only.
11. **Concise language**: define jargon before use; prefer concrete examples over abstract summaries.
12. **Structure**: when explaining a non-trivial concept, follow `problem -> example -> solution -> why`.

## Frontmatter Schema

Every chapter `.md` file begins with YAML frontmatter. Example:

```yaml
---
chapter: 1
slug: ch01-overview
title_zh: "Chapter 1"
title_en: "Chapter 1: Introduction - Why Pi-Agent Is Worth Your Time"
title_vi: "Chapter 1: Introduction"
source_url: https://www.dgzhuya.com/modules/ch01-overview
language: en
version_pairs:
  zh: zh/src/ch01-overview.md
  en: en/src/ch01-overview.md
  vi: vi/src/ch01-overview.md
original_chars: 6787
code_lines: 82
reading_minutes: 34
translator: your-github-handle
reviewed_by: null
last_updated: 2026-08-20
status: draft
official_refs:
  - https://pi.dev/docs/latest/index
  - https://pi.dev/docs/latest/quickstart
terms_used:
  - Agent Loop
  - Pi-Agent
  - Tool System
mermaid_blocks: 2
code_blocks: 7
---
```

Field reference (all required unless noted):

- `chapter` (int, 1-10) — chapter number.
- `slug` (string, matches `^ch[0-9]{2}-[a-z0-9-]+$`) — unique identifier.
- `title_zh`, `title_en`, `title_vi` — translated chapter titles.
- `source_url` (URL) — original Chinese source on dgzhuya.com.
- `language` (`zh` | `en` | `vi`) — language of this file.
- `version_pairs` — sibling file paths in all three languages.
- `original_chars`, `code_lines`, `reading_minutes` (optional) — source metrics.
- `translator`, `reviewed_by` (optional) — git handles.
- `last_updated` (date) — last edit date.
- `status` (`draft` | `translated` | `reviewed` | `published`) — workflow state.
- `official_refs` (optional list) — official pi.dev URLs used to verify content.
- `terms_used` (optional list) — glossary terms that appear in this chapter.
- `mermaid_blocks`, `code_blocks` (int) — counts for sync validation.

See `docs/superpowers/specs/2026-08-20-pi-docs-translation-design.md` section 4 for full schema details.

## Glossary

`GLOSSARY.md` at the repository root holds preserved English technical terms that must not be translated. Categories include:

- **Core Pi terms** — Pi Agent, Agent Loop, Tool System, TUI, Skills, Extensions, etc.
- **Official API identifiers** — `SessionManager`, `firstKeptEntryId`, `contextWindow`.
- **Telemetry attributes** — `pi.ai.request`, `pi.harness.run`.
- **Paths and settings** — `~/.pi/agent/settings.json`, `SYSTEM.md`.
- **Environment variables** — `PI_OFFLINE`, `PI_CODING_AGENT`, `ANTHROPIC_API_KEY`.
- **Slash commands** — `/login`, `/resume`, `/compact`.
- **Settings keys** — `defaultProvider`, `defaultThinkingLevel`.
- **Concepts and formats** — JSONL, GGUF, llama.cpp, MCP.

When you encounter a term not yet in `GLOSSARY.md`, add a row with: term | category | short explanation. Do not translate the term itself — use it verbatim in all translations.

## Mermaid Diagrams

Diagrams use the `mermaid` code fence:

````markdown
```mermaid
flowchart LR
    A[User Input] --> B[Agent Loop]
    B --> C[Tool Call]
    C --> D[Provider]
    D --> B
```
````

- GitHub renders Mermaid natively in the web view.
- mdBook renders Mermaid to SVG via the `mdbook-mermaid` plugin during build.
- Validate locally before committing: `pwsh scripts/validate-mermaid.ps1` (uses `@mermaid-js/mermaid-cli`).

## Local Development

Prerequisites: [`mdbook`](https://rust-lang.github.io/mdBook/), [`mdbook-mermaid`](https://github.com/badboy/mdbook-mermaid), and [`pwsh`](https://learn.microsoft.com/powershell/scripting/install/installing-powershell) (PowerShell 7+).

```powershell
# Build all three languages
pwsh scripts/build-all.ps1

# Serve one language locally for preview
cd en && mdbook serve --open
```

Available scripts in `scripts/`:

- `pwsh scripts/validate-frontmatter.ps1` — check frontmatter schema on every chapter file.
- `pwsh scripts/sync-check.ps1` — confirm structural parity between `zh/`, `en/`, `vi/`.
- `pwsh scripts/validate-mermaid.ps1` — render every Mermaid block to SVG via mermaid-cli.
- `pwsh scripts/build-all.ps1` — run `mdbook build` in each language folder.
- `pwsh scripts/fetch-zh.ps1` — fetch the canonical Chinese chapter from dgzhuya.com.

## Reporting Issues

Open an issue on GitHub with:

- A clear title (e.g. "Sync mismatch: ch03 in zh vs en").
- The file paths involved.
- A short description of the discrepancy (missing section, wrong heading count, broken link).

## License

Pi Docs is released under the MIT License (see `LICENSE`). By contributing, you agree that your contributions will be licensed under the same MIT License.
