# Pi Docs Translation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Build a tri-lingual (zh canonical, en, vi) static documentation site for the Pi Agent Book at https://www.dgzhuya.com/, deployed to GitHub Pages via mdBook + GitHub Actions, with cross-language structure validation.

**Architecture:** Three parallel mdBook projects (zh/, en/, vi/) sharing the same chapter structure. Plain Markdown files are the source of truth. PowerShell scripts validate cross-language consistency and frontmatter schema. GitHub Actions builds all three books and deploys to GitHub Pages via actions/deploy-pages@v4. Diagrams in zh/ keep ASCII art; en/ and vi/ convert ASCII to mermaid via mdbook-mermaid plugin.

**Tech Stack:** PowerShell 7+ (scripts), mdBook 0.4.x, mdbook-mermaid plugin, mermaid-cli (mmdc), GitHub Actions (ubuntu-latest runners), Python 3.11+ (helper scripts), Pandoc (HTML to MD conversion for fetch-zh.ps1).

---
## File Structure

```
pi-docs/
- .github/workflows/{deploy.yml, sync-check.yml}
- .github/PULL_REQUEST_TEMPLATE.md
- .markdownlint.json, .gitignore, LICENSE
- docs/superpowers/{specs, plans}/
- scripts/{sync-check.ps1, validate-frontmatter.ps1, fetch-zh.ps1, validate-mermaid.ps1, build-all.ps1}
- scripts/lib/{frontmatter.ps1, markdown-stats.ps1}
- zh/{book.toml, src/{SUMMARY.md, index.md, chapter-01..10.md}, theme/custom.css}
- en/ (same as zh)
- vi/ (same as zh)
- GLOSSARY.md, README.md, CONTRIBUTING.md
```

---

## Phase 1: Skeleton Setup

### Task 1: Initialize git repo and GitHub remote

**Files:** local `.git/` + remote `pi-docs` repo on GitHub.

- [ ] Initialize local repo: `cd E:\project\pi-docs && git init -b main`
- [ ] Create GitHub repo at https://github.com/new (name: pi-docs, public, no README init).
- [ ] Add remote: `git remote add origin https://github.com/<user>/pi-docs.git`
- [ ] Commit existing spec: `git add docs/ && git commit -m "docs: add initial design spec" && git push -u origin main`
- [ ] Verify: spec visible at https://github.com/<user>/pi-docs/tree/main/docs/superpowers/specs/

### Task 2: Root config files (.gitignore, LICENSE, .markdownlint.json)

**Files:**
- Create: `E:\project\pi-docs\.gitignore` (build outputs, OS junk, IDE files)
- Create: `E:\project\pi-docs\LICENSE` (MIT, same as upstream Pi)
- Create: `E:\project\pi-docs\.markdownlint.json` (relax MD013, MD033, MD041; MD046 fenced)

See spec section 3.1 for full contents.

Commit: `git commit -m "chore: add gitignore, LICENSE, markdownlint config"`

### Task 3: Write README.md

**Files:**
- Create: `E:\project\pi-docs\README.md`

Sections: title + intro, Available Languages table (zh/en/vi), Tech Stack, Repo Layout, Local Dev (with pwsh command), Contributing link, License, References (dgzhuya + pi.dev + earendil-works/pi).

Commit: `git commit -m "docs: add README"`

### Task 4: Write CONTRIBUTING.md

**Files:**
- Create: `E:\project\pi-docs\CONTRIBUTING.md`

Workflow: pick chapter → branch → translate → add frontmatter → run sync-check + validate-frontmatter → build → PR → CI passes → review.

Style rules summary (no emojis, no fluff, NEVER translate code/APIs/paths/env vars).

Commit: `git commit -m "docs: add CONTRIBUTING guide"`

---
### Task 5: Create 3 mdBook projects (zh, en, vi)

**Files (per language):**
- `book.toml` — mdBook config + mermaid preprocessor + edit URL
- `src/SUMMARY.md` — TOC with 10 chapter links + index
- `src/index.md` — intro page with language-specific frontmatter
- `theme/custom.css` — shared styling (Geist Mono font, mermaid background)
- `src/chapter-01.md` ... `src/chapter-10.md` — placeholder (frontmatter + heading + "Placeholder" text)

**book.toml template** (parameterized by language):

```toml
[book]
title = "<Language Title>"
description = "Source-code reading notes for the Pi Agent SDK"
authors = ["Pi Docs Contributors"]
language = "<zh|en|vi>"
multilingual = false
src = "src"

[preprocessor.mermaid]
command = "mdbook-mermaid install"

[output.html]
default-theme = "light"
preferred-dark-theme = "navy"
git-repository-url = "https://github.com/<user>/pi-docs"
edit-url-template = "https://github.com/<user>/pi-docs/edit/main/<lang>/src/{path}"
additional-css = ["theme/custom.css"]

[output.html.fold]
enable = true
level = 1

[output.html.playground]
editable = false
copyable = true
copy-js = true
```

**Steps:**

- [ ] Create dir structure: `mkdir zh\src, zh\theme, en\src, en\theme, vi\src, vi\theme`
- [ ] Write 3 book.toml files
- [ ] Write 3 SUMMARY.md files (chapter titles translated)
- [ ] Write 3 index.md files (one paragraph each, language-appropriate)
- [ ] Copy custom.css to 3 theme/ folders
- [ ] Create 30 placeholder chapter files (10 per language) with frontmatter:

```yaml
---
chapter: <N>
language: <lang>
status: draft
---
```

- [ ] Install mdbook + mdbook-mermaid locally: `cargo install mdbook mdbook-mermaid`
- [ ] Build all 3: `mdbook build zh && mdbook build en && mdbook build vi`
- [ ] Verify: 3 book/ folders generated, no warnings
- [ ] Commit: `git commit -m "feat: scaffold 3 mdBook projects with placeholder chapters"`

### Task 6: Write GLOSSARY.md

**Files:**
- Create: `E:\project\pi-docs\GLOSSARY.md`

Sections: Core Pi terms, Official API identifiers, Telemetry attributes, Environment variables, Slash commands, Settings keys, Concepts and formats, Paths.

~80 terms total (table format, with English column always first, Vietnamese explanation column second, Context column third).

Commit: `git commit -m "docs: add initial glossary"`

---
### Task 7: Write scripts/lib/frontmatter.ps1 (YAML parser)

**Files:**
- Create: `E:\project\pi-docs\scripts\lib\frontmatter.ps1`

Function `Get-Frontmatter -Path <file>` returns hashtable of frontmatter fields. Strips `---` fences, parses simple key:value pairs and nested arrays (indented lines).

PowerShell regex strips frontmatter: `^---\\r?\\n(.*?)\\r?\\n---`

Smoke-test: `Import-Module scripts/lib/frontmatter.ps1; (Get-Frontmatter -Path zh/src/chapter-01.md).chapter` returns `1`.

Commit: `git commit -m "feat(scripts): add frontmatter parser helper"`

### Task 8: Write scripts/lib/markdown-stats.ps1

**Files:**
- Create: `E:\project\pi-docs\scripts\lib\markdown-stats.ps1`

Function `Get-MarkdownStats -Path <file>` returns object with:

- `Headings` hashtable (h1..h6 counts)
- `TotalHeadings`
- `CodeBlocks` array of { Language, LineCount }
- `CodeBlockCount`
- `MermaidBlocks`
- `CodeLines` (excluding mermaid blocks)

Regex for fenced code: `(?ms)^```(\\w+)?\\r?\\n(.*?)\\r?\\n````

Smoke-test: `Get-MarkdownStats -Path zh/src/chapter-01.md` returns Headings.h1 = 1 (placeholder heading).

Commit: `git commit -m "feat(scripts): add markdown stats helper"`

### Task 9: Write scripts/validate-frontmatter.ps1

**Files:**
- Create: `E:\project\pi-docs\scripts\validate-frontmatter.ps1`

Validates frontmatter schema across all chapter files. Checks:

- Required fields: chapter, slug, language, source_url, status
- chapter ∈ {1..10}
- language ∈ {zh, en, vi}
- status ∈ {draft, translated, reviewed, published}
- code_lines / code_blocks / mermaid_blocks numbers match actual content (via Get-MarkdownStats)

Exit codes: 0 = pass, 1 = any error.

Usage: `pwsh scripts/validate-frontmatter.ps1`

Commit: `git commit -m "feat(scripts): add frontmatter validator"`

### Task 10: Write scripts/sync-check.ps1

**Files:**
- Create: `E:\project\pi-docs\scripts\sync-check.ps1`

Compares 3 files (zh/, en/, vi/) for each chapter. Checks:

- Filename parity (all 3 exist)
- Heading count parity (per level)
- Code block count parity + language hint parity
- Code block line count parity (critical: detects "translated" code)
- Mermaid block count parity
- Frontmatter schema parity (terms_used, version_pairs)

Usage:

- `pwsh scripts/sync-check.ps1` (all chapters)
- `pwsh scripts/sync-check.ps1 -Chapter chapter-01` (one chapter)

Exit codes: 0 = pass, 1 = error, 2 = warning only.

Commit: `git commit -m "feat(scripts): add cross-language sync validator"`

---
### Task 11: Write scripts/fetch-zh.ps1

**Files:**
- Create: `E:\project\pi-docs\scripts\fetch-zh.ps1`

Fetches a chapter from dgzhuya.com, converts HTML to Markdown, writes to zh/src/chapter-XX.md with frontmatter.

**Steps:**

- [ ] Define URL map at top: `$urls = @{ "01" = "https://www.dgzhuya.com/modules/ch01-overview"; "02" = "..."; ... }`
- [ ] Use `Invoke-WebRequest` to fetch HTML, parse article body (CSS selector `.prose` or similar)
- [ ] Use Pandoc to convert: `pandoc -f html -t markdown_strict input.html -o output.md`
- [ ] Extract or compute metadata: original_chars (length of article text), code_lines (count lines in code blocks), mermaid_blocks (count `mermaid` fences), code_blocks (total fences)
- [ ] Write frontmatter block + content to zh/src/chapter-XX.md
- [ ] Set status: translated

Usage: `pwsh scripts/fetch-zh.ps1 -Chapter 01` (one chapter), or `-All` (all 10).

Commit: `git commit -m "feat(scripts): add fetch-zh.ps1 for source scraping"`

### Task 12: Write scripts/validate-mermaid.ps1

**Files:**
- Create: `E:\project\pi-docs\scripts\validate-mermaid.ps1`

Extracts all ```mermaid blocks from en/ and vi/ chapters and validates syntax using `mmdc` (mermaid-cli).

**Steps:**

- [ ] Find all `. `md` files in en/src and vi/src
- [ ] Extract ` ```mermaid\\n...\\n``` ` blocks
- [ ] Write each block to temp .mmd file, run `mmdc -i file.mmd -o /dev/null`
- [ ] Collect errors per file, exit 1 if any error

Prerequisites: `npm install -g @mermaid-js/mermaid-cli`

Usage: `pwsh scripts/validate-mermaid.ps1`

Commit: `git commit -m "feat(scripts): add mermaid syntax validator"`

### Task 13: Write scripts/build-all.ps1

**Files:**
- Create: `E:\project\pi-docs\scripts\build-all.ps1`

Builds all 3 mdBooks, combines into single dist/ folder for GitHub Pages.

**Steps:**

- [ ] For each language (zh, en, vi): `mdbook build <lang>` → outputs to `<lang>/book/`
- [ ] Copy each `<lang>/book/*` to `dist/<lang>/`
- [ ] Add root index.html to dist/ that redirects to `dist/en/` (default English)

Usage: `pwsh scripts/build-all.ps1`

Commit: `git commit -m "feat(scripts): add build-all script"`

---
### Task 14: Write GitHub Actions workflows

**Files:**
- Create: `E:\project\pi-docs\.github\workflows\deploy.yml`
- Create: `E:\project\pi-docs\.github\workflows\sync-check.yml`
- Create: `E:\project\pi-docs\.github\PULL_REQUEST_TEMPLATE.md`

**deploy.yml** (builds on push to main + PR, deploys to GitHub Pages on main only):

```yaml
name: Build & Deploy
on:
  push:
    branches: [main]
  pull_request:
  workflow_dispatch:
jobs:
  lint:
    if: github.event_name == pull_request\n    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Sync check
        run: pwsh scripts/sync-check.ps1
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Install mdBook
        run: |
          curl -sSL https://github.com/rust-lang/mdBook/releases/download/v0.4.40/mdbook-v0.4.40-x86_64-unknown-linux-gnu.tar.gz | tar xz
          sudo mv mdbook /usr/local/bin/
    branches: [main]
  pull_request:
  workflow_dispatch:
jobs:
  lint:
    if: github.event_name == "pull_request"
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Install PowerShell
        uses: microsoft/powershell@v1
      - name: Sync check
        run: pwsh scripts/sync-check.ps1
      - name: Validate frontmatter
        run: pwsh scripts/validate-frontmatter.ps1
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Install mdBook
        run: |
          curl -sSL https://github.com/rust-lang/mdBook/releases/download/v0.4.40/mdbook-v0.4.40-x86_64-unknown-linux-gnu.tar.gz | tar xz
          sudo mv mdbook /usr/local/bin/
      - name: Install mdbook-mermaid
        run: |
          curl -sSL https://github.com/badboy/mdbook-mermaid/releases/latest/download/mdbook-mermaid-x86_64-unknown-linux-gnu.tar.gz | tar xz
          sudo mv mdbook-mermaid /usr/local/bin/
      - name: Build
        run: pwsh scripts/build-all.ps1
      - name: Upload artifact
        uses: actions/upload-artifact@v4
        with:
          name: site
          path: dist
  deploy:
    needs: build
    if: github.ref == "refs/heads/main"
    runs-on: ubuntu-latest
    permissions:
      pages: write
      id-token: write
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/deploy-pages@v4
```

**sync-check.yml** (PR-only quick validation):

```yaml
name: Sync Check
on:
  pull_request:
    branches: [main]
jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Install PowerShell
        uses: microsoft/powershell@v1
      - name: Sync check
        run: pwsh scripts/sync-check.ps1
      - name: Frontmatter validate
        run: pwsh scripts/validate-frontmatter.ps1
      - name: Validate mermaid
        run: |
          npm install -g @mermaid-js/mermaid-cli
          pwsh scripts/validate-mermaid.ps1
```

**PULL_REQUEST_TEMPLATE.md** checklist:

```markdown
## Translation PR Checklist

- [ ] Source chapter present in `zh/src/`
- [ ] Translation covers all headings from source
- [ ] Glossary terms preserved (see GLOSSARY.md)
- [ ] Code blocks identical across zh/en/vi (line count + content)
- [ ] Mermaid blocks render (where applicable)
- [ ] Frontmatter filled (translator, terms_used, code_lines, etc.)
- [ ] Local sync-check passes: `pwsh scripts/sync-check.ps1`
- [ ] Local mdBook build passes: `cd en && mdbook build`
- [ ] Technical claims verified against official Pi docs
- [ ] No emojis, no fluff

## Reviewer Checklist

- [ ] Glossary consistency check
- [ ] Technical accuracy vs https://pi.dev/docs/latest
- [ ] Prose reads naturally (not machine-translated)
- [ ] Code blocks unaltered
```

Commit: `git commit -m "ci: add GitHub Actions workflows + PR template"`

---

## Phase 2: Validate with Chapter 1

### Task 15: Fetch chapter 1 from dgzhuya.com

**Files:**
- Create: `E:\project\pi-docs\zh\src\chapter-01.md`

- [ ] Run: `pwsh scripts/fetch-zh.ps1 -Chapter 01`
- [ ] Verify: file created with ~6,787 chars, 82 code lines, mermaid_blocks count
- [ ] Review the markdown output for any parsing issues (garbled HTML, missing images)
- [ ] Manually fix any obvious problems (replace broken images with text descriptions)
- [ ] Commit: `git commit -m "feat(zh): fetch chapter 1 from dgzhuya.com"`

### Task 16: Translate chapter 1 to English

**Files:**
- Create: `E:\project\pi-docs\en\src\chapter-01.md`

- [ ] Create from scratch (do NOT copy zh/ file)
- [ ] Read zh/src/chapter-01.md + GLOSSARY.md + style guide section 6.2
- [ ] Translate title to: "Chapter 1: Introduction — Why Pi-Agent Is Worth Your Time"
- [ ] Translate each section, preserving:
  - All code blocks (verbatim)
  - All API names / file paths / env vars
  - All technical terms per glossary
  - First occurrence pattern: `<English term> (<Vietnamese>)` — then English only
- [ ] Add frontmatter (chapter: 1, language: en, title_en, title_vi, title_zh, source_url, translator: <your-handle>, status: translated)
- [ ] For ASCII art diagrams: convert to mermaid blocks (flowchart / sequenceDiagram depending on shape)
- [ ] Validate locally:
  - `pwsh scripts/sync-check.ps1 -Chapter chapter-01`
  - `pwsh scripts/validate-frontmatter.ps1 -Path en/src/chapter-01.md`
  - `cd en && mdbook build`
- [ ] Commit: `git commit -m "feat(en): translate chapter 1 to English"`

### Task 17: Translate chapter 1 to Vietnamese

**Files:**
- Create: `E:\project\pi-docs\vi\src\chapter-01.md`

Same workflow as Task 16, but Vietnamese. Verify cross-language parity with sync-check.

Commit: `git commit -m "feat(vi): translate chapter 1 to Vietnamese"`

### Task 18: Open PR and verify CI

- [ ] Push branch: `git push origin translate/chapter-01`
- [ ] Open PR on GitHub
- [ ] Verify CI passes:
  - sync-check.ps1: 0 errors
  - validate-frontmatter.ps1: 0 errors
  - mdBook build zh/en/vi: success
  - mermaid syntax: 0 errors
- [ ] Request review from maintainer
- [ ] Iterate on review feedback
- [ ] Merge PR after approval
- [ ] Verify: main branch has 3 chapter-01.md files synced

---

## Phase 3: Scale to all chapters (ch2-10)

Repeat Task 15-18 for chapters 2-10, one PR per chapter. Update GLOSSARY.md as new terms are discovered.

Acceptance criteria:

- [ ] 10/10 chapters published in all 3 languages
- [ ] All PRs reviewed and merged
- [ ] GitHub Pages site shows all chapters
- [ ] sync-check passes with 0 errors
- [ ] Glossary covers all terms used

## Phase 4: Maintenance

- Monthly cron (GitHub Actions workflow, scheduled): fetch zh/ chapters, diff vs current, notify maintainer if source updated
- Contributor onboarding: ensure CONTRIBUTING.md stays accurate
- Glossary review: add new terms, remove obsolete

---

## Acceptance Criteria (overall plan complete when)

- [ ] Phase 1 complete: skeleton builds + CI passes
- [ ] Phase 2 complete: chapter 1 published in 3 languages, deployed to GitHub Pages
- [ ] Phase 3 complete: all 10 chapters published
- [ ] GLOSSARY.md has 100+ terms
- [ ] sync-check.ps1 always green on main branch
- [ ] mdBook builds pass on every PR

## Self-Review Checklist (run after plan execution)

1. Spec coverage: every section in 2026-08-20-pi-docs-translation-design.md has corresponding task(s) above
2. Placeholder scan: no TBD/TODO/FIXME in plan
3. Type consistency: function names (Get-Frontmatter, Get-MarkdownStats, Sync-Check) match across tasks
4. Commit messages: descriptive + conventional format
5. File paths: exact, all match between tasks
