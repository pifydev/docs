# Pi Docs Translation — Design Spec

- **Date**: 2026-08-20
- **Status**: Draft (pending user review)
- **Owner**: pi-docs maintainers
- **Source site**: https://www.dgzhuya.com/ (Pi Agent Book by 冬瓜)
- **Reference sources**: https://pi.dev/docs/latest + https://github.com/earendil-works/pi

---

## 1. Goals & Non-Goals

### 1.1 Goals

- Dịch toàn bộ 10 chương của *Pi Agent Book · 源码精读笔记* từ tiếng Trung sang **English** và **Vietnamese**.
- Output vừa là plain `.md` files (đọc trên GitHub/VS Code), vừa là static HTML site (qua mdBook build).
- Ba bản ngôn ngữ đồng bộ cấu trúc: `zh/` (canonical source), `en/`, `vi/`.
- Mermaid diagrams được render đồng nhất trên GitHub, mdBook site, VS Code.
- Auto-deploy lên GitHub Pages qua GitHub Actions.
- Pipeline reproducible, có quality gates, có thể onboard contributor mới.

### 1.2 Non-Goals

- Không phải bản dịch thương mại / xuất bản — chỉ technical translation cho cộng đồng developer.
- Không sửa nội dung kỹ thuật của source dgzhuya.com; chỉ dịch ngôn ngữ, giữ nguyên ý.
- Không hỗ trợ đa ngôn ngữ ngoài EN/VI trong giai đoạn này (kiến trúc mở để sau này thêm).
- Không xây CMS / web editor; toàn bộ workflow dựa trên Git + GitHub PR.
- Không fork lại site gốc Astro của dgzhuya.com — output hoàn toàn độc lập, dùng mdBook.

---

## 2. Source of Truth

Mỗi thông tin kỹ thuật cần dịch phải được verify với **một trong ba nguồn** theo thứ tự ưu tiên:

| Priority | Source | URL pattern | Dùng khi |
|---:|---|---|---|
| 1 | Official Pi docs | https://pi.dev/docs/latest | Kiểm tra API names, terminology chính thức, code samples |
| 2 | Pi mono repo source | https://github.com/earendil-works/pi/tree/main/packages/... | Đọc TypeScript definitions, source code referenced |
| 3 | dgzhuya.com (dgzhuya) | https://www.dgzhuya.com/modules/... | Bài viết gốc tiếng Trung cần dịch |

### 2.1 Official docs inventory

`packages/coding-agent/docs/` (32 file Markdown + images/) — phân nhóm theo `docs.json` (Mintlify nav):

- Start here: index.md, quickstart.md, usage.md, providers.md, security.md, containerization.md, settings.md, keybindings.md, sessions.md, compaction.md
- Customization: extensions.md (121 KB — LỚN NHẤT, reference chính cho extension API), skills.md, prompt-templates.md, themes.md, packages.md, models.md, custom-provider.md
- Reference: session-format.md
- Programmatic Usage: sdk.md, rpc.md, json.md, tui.md
- Platform Setup: windows.md, termux.md, tmux.md, terminal-setup.md, shell-aliases.md
- Development: development.md
- Environment: environment-variables.md (4.4 KB — danh sách PI_* env vars quan trọng)
- Local models: llama-cpp.md (4.3 KB — provider cho llama.cpp router)
- Assets: images/ (folder chứa SVG/PNG diagrams — vd exy.png cho exe.dev mascot)

File sizes cho quick reference (bytes):

| File | Size | File | Size | File | Size |
|---|---:|---|---:|---|---:|
| compaction.md | 18,768 | extensions.md | 121,581 | rpc.md | 42,132 |
| containerization.md | 4,522 | images/ | dir | sdk.md | 37,518 |
| custom-provider.md | 28,639 | index.md | 3,365 | security.md | 5,318 |
| development.md | 1,483 | json.md | 3,843 | session-format.md | 16,744 |
| docs.json | 3,038 | keybindings.md | 12,928 | sessions.md | 5,340 |
| environment-variables.md | 4,385 | llama-cpp.md | 4,262 | settings.md | 15,221 |
| models.md | 24,750 | packages.md | 8,784 | shell-aliases.md | 356 |
| prompt-templates.md | 2,966 | providers.md | 14,399 | skills.md | 7,324 |
| terminal-setup.md | 6,104 | terms.md/termux.md | 3,213 | themes.md | 9,403 |
| tmux.md | 2,041 | tui.md | 30,778 | usage.md | 14,781 |
| windows.md | 394 | quickstart.md | 4,623 | | |

`packages/agent/docs/` (3 file):

- harness.md (~230 KB — main engine documentation)
- search.md (9.5 KB)
- telemetry-schema.md (13 KB)

### 2.3 Additional source files (not in docs/, nhưng liên quan)

- **`AGENTS.md`** (root, 11.9 KB) — style guide cho contributors + agents (no emoji, no fluff, concise language)
- **`CONTRIBUTING.md`** (root) — quy trình contribute (đóng góp issue/PR)
- **`README.md`** (root) — overview của toàn bộ monorepo, package list
- **Other packages KHÔNG có docs/ folder**: `packages/ai/`, `packages/tui/`, `packages/telemetry/` — nhưng source code của chúng là reference cho terminology

Khi cần verify terminology, lookup theo thứ tự:

1. Search trong `packages/coding-agent/docs/*.md` (32 file)
2. Search trong `packages/agent/docs/*.md` (3 file)
3. Search trong source code ở `packages/*/src/` để confirm API names
4. Cuối cùng: dùng `/pi` local search để cross-check

### 2.4 Cross-Reference Table (dgzhuya ↔ official)

| Pi Agent Book chapter | Official Pi docs reference |
|---|---|
| Ch1: 开篇 — 为什么 Pi-Agent 值得你花时间 | index.md, quickstart.md, usage.md, environment-variables.md |
| Ch2: 三层架构 | development.md (Project Structure section) |
| Ch3: Agent Loop | agent/docs/harness.md |
| Ch4: 模型调用 — 一行代码驾驭多个模型 | providers.md, custom-provider.md, llama-cpp.md, environment-variables.md |
| Ch5: 工具系统 | extensions.md (121 KB — full extension reference), skills.md, custom-provider.md |
| Ch6: 消息系统 | agent/docs/harness.md (message section) |
| Ch7: 事件驱动 | agent/docs/telemetry-schema.md |
| Ch8: 上下文工程 | usage.md (Context Files section), compaction.md |
| Ch9: 上下文压缩 | compaction.md |
| Ch10: 会话管理 | sessions.md, session-format.md |

---

## 3. Repository Architecture

### 3.1 Top-level layout

```
pi-docs/
├── .github/
│   └── workflows/
│       ├── deploy.yml          # build + deploy → GitHub Pages (push to main)
│       └── sync-check.yml      # PR-only: validate frontmatter, sync structure
├── docs/
│   └── superpowers/
│       ├── specs/              # design docs (file này)
│       └── plans/              # implementation plans
├── scripts/
│   ├── sync-check.ps1          # verify zh/en/vi đồng bộ cấu trúc
│   ├── fetch-zh.ps1            # fetch source từ dgzhuya.com về zh/
│   └── validate-frontmatter.ps1
├── zh/
│   ├── book.toml
│   ├── src/
│   │   ├── SUMMARY.md
│   │   ├── chapter-01.md
│   │   ├── chapter-02.md
│   │   └── ... (chapter-10.md)
│   └── theme/ (nếu cần custom)
├── en/
│   ├── book.toml
│   ├── src/
│   │   ├── SUMMARY.md
│   │   ├── chapter-01.md
│   │   └── ...
│   └── theme/
├── vi/
│   ├── book.toml
│   ├── src/
│   │   ├── SUMMARY.md
│   │   ├── chapter-01.md
│   │   └── ...
│   └── theme/
├── GLOSSARY.md                 # thuật ngữ EN được bảo tồn
├── README.md                   # giới thiệu + hướng dẫn contribute
├── CONTRIBUTING.md             # quy trình dịch + review
├── LICENSE                     # MIT (theo site gốc Pi)
└── .gitignore                  # book/, book-en/, book-vi/, node_modules/
```

### 3.2 `book.toml` template (per language)

```toml
[book]
title = "Pi Agent Book (English)"
description = "Source-code reading notes for Pi Agent SDK"
authors = ["Pi Docs Contributors"]
language = "en"
multilingual = false
src = "src"

[preprocessor.mermaid]
command = "mdbook-mermaid install"

[output.html]
default-theme = "light"
preferred-dark-theme = "navy"
git-repository-url = "https://github.com/<user>/pi-docs"
edit-url-template = "https://github.com/<user>/pi-docs/edit/main/en/src/{path}"

[output.html.fold]
enable = true
level = 1

[output.html.playground]
editable = false
copyable = true
copy-js = true
```

### 3.3 Build outputs (gitignored)

| Command | Output | Purpose |
|---|---|---|
| mdbook build zh | zh/book/ | Static site cho zh/ |
| mdbook build en | en/book/ | Static site cho en/ |
| mdbook build vi | vi/book/ | Static site cho vi/ |
| ./scripts/build-all.ps1 | dist/{zh,en,vi}/ | Combined dist cho GitHub Pages |

### 3.4 Deployment URL structure (GitHub Pages)

```
https://<user>.github.io/pi-docs/             # root → redirect to /en/
https://<user>.github.io/pi-docs/zh/          # Chinese (canonical)
https://<user>.github.io/pi-docs/en/          # English
https://<user>.github.io/pi-docs/vi/          # Vietnamese
```

---

## 4. File Frontmatter

Mỗi file chapter `.md` bắt đầu bằng YAML frontmatter. Schema:

```yaml
---
chapter: 1                        # int, required
slug: ch01-overview               # string, required, unique
title_zh: "第1章：开篇 —— 为什么 Pi-Agent 值得你花时间"
title_en: "Chapter 1: Introduction — Why Pi-Agent Is Worth Your Time"
title_vi: "Chương 1: Mở đầu — Tại sao Pi-Agent đáng để bạn dành thời gian"
source_url: https://www.dgzhuya.com/modules/ch01-overview
language: en                      # zh | en | vi
version_pairs:
  zh: zh/src/chapter-01.md
  en: en/src/chapter-01.md
  vi: vi/src/chapter-01.md
original_chars: 6787              # count từ source dgzhuya
code_lines: 82                    # tổng số dòng code (ts + py)
reading_minutes: 34               # ước lượng đọc
translator: null                  # git handle, filled sau khi dịch
reviewed_by: null
last_updated: 2026-08-20
status: draft                     # draft | translated | reviewed | published
official_refs:                    # link official docs dùng để verify
  - https://pi.dev/docs/latest/index
  - https://pi.dev/docs/latest/quickstart
  - https://pi.dev/docs/latest/usage
terms_used:                       # terms từ GLOSSARY.md xuất hiện trong chapter này
  - Agent Loop
  - Pi-Agent
  - Tool System
  - Session Tree
mermaid_blocks: 2                 # count actual
code_blocks: 7                    # count actual
---
```

Validation rules (enforced by `validate-frontmatter.ps1`):

- Required: chapter, slug, source_url, language, version_pairs.{zh,en,vi}, status
- chapter int 1..10
- language ∈ {zh, en, vi}
- slug matches pattern `^ch[0-9]{2}-[a-z0-9-]+$`
- version_pairs.<self> khớp với đường dẫn file hiện tại
- mermaid_blocks, code_blocks, code_lines ≥ 0
- status ∈ {draft, translated, reviewed, published}
- terms_used items phải tồn tại trong GLOSSARY.md

---

## 5. Content Pipeline

### 5.1 End-to-end flow

```
[1] www.dgzhuya.com (HTML source)
        ↓ scripts/fetch-zh.ps1 (scrape → markdown + mermaid extraction)
[2] zh/src/chapter-XX.md (canonical, source of truth)
        ↓ LLM-assisted translate (using GLOSSARY.md + style guide)
[3a] en/src/chapter-XX.md    [3b] vi/src/chapter-XX.md
        ↓ scripts/sync-check.ps1 (validate structure)
[4] PASS → commit → PR → human review
        ↓ GitHub Actions
[5] mdbook build zh/en/vi
        ↓
[6] GitHub Pages: <user>.github.io/pi-docs/{zh,en,vi}/
```

### 5.2 Step-by-step

**Step 1 — Fetch source** (scripts/fetch-zh.ps1)

- Input: list of chapter URLs (https://www.dgzhuya.com/modules/chXX-...)
- Output: zh/src/chapter-XX.md with frontmatter + content
- Logic:
  1. Fetch HTML via Invoke-WebRequest
  2. Parse article body (exclude header/footer/nav)
  3. Convert HTML → Markdown via pandoc hoặc ReverseMarkdown
  4. Convert `<pre><code class="language-X">` → fenced code blocks (giữ language hint)
  5. Convert `<svg>` diagrams (nếu có) → embed reference hoặc convert sang mermaid
  6. Convert inline `<img>` (nếu có) → reference assets/
  7. Save → commit + status: translated

**Step 2 — Translation** (LLM-assisted, manual review)

- Input: zh/src/chapter-XX.md + GLOSSARY.md + style guide (Section 6)
- Output: en/src/chapter-XX.md và vi/src/chapter-XX.md
- Approach: single-pass manual — dịch 1 lượt, fill translator field, status: translated
- Human reviewer sau đó verify, adjust, set reviewed_by + status: reviewed
- Final merge → status: published

**Step 3 — Sync verification** (scripts/sync-check.ps1)

Chạy so sánh giữa 3 file chapter-XX.md ở zh/, en/, vi/:

| Check | Severity | Description |
|---|---|---|
| Filename parity | error | cùng tên file tồn tại cả 3 bản |
| Heading count | error | cùng tổng số heading, cùng số heading mỗi level |
| Code block count | error | cùng số fenced code blocks |
| Code block language hints | error | cùng language hint (ts, py, bash, ...) |
| Code block line count | error | cùng số dòng trong mỗi code block (phát hiện dịch code làm hỏng) |
| Mermaid block count | error | cùng số mermaid blocks |
| Mermaid node/edge count | warn | cùng nodes + edges trong mỗi mermaid block |
| Frontmatter schema | error | required fields + types |
| version_pairs consistency | error | 3 file cross-link đúng |
| code_lines, mermaid_blocks, code_blocks field accuracy | error | số trong frontmatter phải khớp actual count |
| terms_used cross-file | warn | cùng tập term xuất hiện trong 3 bản |
| original_chars consistency | info | chỉ file zh mới có giá trị thật |

Exit codes:

- 0 — all checks pass
- 1 — any error check fail
- 2 — only warning check fail (informational)

**Step 4 — PR review** (human)

Reviewer checklist:

- [ ] Glossary terms sử dụng đúng (theo GLOSSARY.md)
- [ ] Technical claims verify với official_refs (Section 2.2)
- [ ] Code blocks identical across 3 bản
- [ ] Mermaid diagrams render OK
- [ ] Prose tự nhiên, không máy móc

Set reviewed_by, status → reviewed.

**Step 5 — Build & Deploy** (CI)

.github/workflows/deploy.yml:

- Trigger: push to main, manual dispatch
- Jobs:
  1. lint (PR only): chạy sync-check.ps1, validate-frontmatter.ps1, markdownlint
  2. build-zh/en/vi: install mdbook + mdbook-mermaid → mdbook build → artifact
  3. deploy: gh-pages branch hoặc GitHub Pages deploy action

---

## 6. Glossary & Style Guide

### 6.1 GLOSSARY.md (top-level)

Glossary được bảo tồn nguyên Anh khi dịch. Glossary ban đầu được khởi tạo từ 3 nguồn:

- Thuật ngữ xuất hiện trong dgzhuya.com (bài viết gốc)
- API/Identifier từ official Pi docs (https://pi.dev/docs/latest)
- Source code identifiers từ earendil-works/pi repo

| English term | Vietnamese (giải thích) | Bối cảnh / Source |
|---|---|---|
| **Core Pi terms** | | |
| Pi Agent | Pi Agent (tên sản phẩm) | Tên project, không dịch |
| Agent Loop | Vòng lặp Agent | Engine chính của Pi runtime |
| Harness | Harness | Agent shell framework |
| Tool System | Hệ thống Tool | 5-step pipeline |
| Tool | Tool | read, write, edit, bash, grep, find, ls |
| Event-driven | Event-driven | pub/sub + sync barrier |
| Context Engineering | Context Engineering | Kỹ thuật tối ưu cửa sổ LLM |
| Context Compression | Nén ngữ cảnh | Structured summary |
| Session Tree | Cây phiên (DAG) | Branchable history |
| Provider | Provider | LLM vendor abstraction |
| KnownProvider | KnownProvider (enum) | 35 provider IDs |
| TUI | TUI | Terminal UI |
| MCP | MCP | Model Context Protocol |
| RPC | RPC | Remote Procedure Call |
| SDK | SDK | Software Development Kit |
| YOLO mode | YOLO mode | Không hỏi trước khi chạy |
| DAG | DAG | Directed Acyclic Graph |
| Skills | Skills | Markdown-based tools |
| Extensions | Extensions | TS-based plugins |
| Pi Package | Pi Package | npm/git-distributed bundle |
| Prompt Template | Prompt Template | Markdown workflows |
| Theme | Theme | TUI skin |
| **Official API identifiers** | | |
| SessionManager | SessionManager | Class quản lý session |
| CompactionEntry | CompactionEntry | Entry type cho compaction |
| BranchSummaryEntry | BranchSummaryEntry | Entry type cho branch summary |
| firstKeptEntryId | firstKeptEntryId | ID entry đầu tiên giữ sau compaction |
| keepRecentTokens | keepRecentTokens | Token threshold giữ recent msgs |
| reserveTokens | reserveTokens | Reserve tokens cho LLM response |
| contextWindow | contextWindow | Cửa sổ context của model |
| contextTokens | contextTokens | Tokens đang dùng |
| **Telemetry attributes** | | |
| pi.ai.request | pi.ai.request | Span cho AI request |
| pi.ai.provider | pi.ai.provider | Provider id |
| pi.ai.model | pi.ai.model | Model id |
| pi.ai.api | pi.ai.api | API id |
| pi.ai.streaming | pi.ai.streaming | Stream hay không |
| pi.ai.usage.input_tokens | pi.ai.usage.input_tokens | Input tokens |
| pi.ai.usage.output_tokens | pi.ai.usage.output_tokens | Output tokens |
| pi.harness.run | pi.harness.run | Span cho run invocation |
| pi.harness.compaction | pi.harness.compaction | Span cho compaction |
| pi.harness.turn | pi.harness.turn | Span cho assistant turn |
| pi.harness.step | pi.harness.step | Span cho retry attempt |
| pi.session.id | pi.session.id | Session identifier |
| pi.lane.name | pi.lane.name | Lane name |
| pi.operation.id | pi.operation.id | Durable operation id |
| **Paths & settings** | | |
| ~/.pi/agent/settings.json | ~/.pi/agent/settings.json | Global settings |
| /.pi/settings.json | /.pi/settings.json | Project settings |
| SYSTEM.md | SYSTEM.md | Custom system prompt file |
| models.json | models.json | Custom models config |
| packages/coding-agent/src/ | packages/coding-agent/src/ | Source path prefix |
| packages/agent/src/ | packages/agent/src/ | Source path prefix |
| packages/ai/src/ | packages/ai/src/ | Source path prefix |
| packages/tui/src/ | packages/tui/src/ | Source path prefix |
| **Environment variables (PI_*)** | | |
| PI_OFFLINE | PI_OFFLINE | Disable startup network operations |
| PI_CODING_AGENT | PI_CODING_AGENT | Process marker (true) khi chạy trong Pi |
| AI_AGENT | AI_AGENT | Generic process marker (pi) |
| PI_CODING_AGENT_DIR | PI_CODING_AGENT_DIR | Override config directory (default ~/.pi/agent) |
| PI_CODING_AGENT_SESSION_DIR | PI_CODING_AGENT_SESSION_DIR | Override session storage |
| PI_PACKAGE_DIR | PI_PACKAGE_DIR | Override package directory (Nix/Guix) |
| PI_SKIP_VERSION_CHECK | PI_SKIP_VERSION_CHECK | Disable pi.dev latest-version request |
| PI_TELEMETRY | PI_TELEMETRY | Install/update telemetry override (1/true/yes or 0/false/no) |
| PI_CACHE_RETENTION | PI_CACHE_RETENTION | long = extended provider prompt caching |
| PI_SHARE_VIEWER_URL | PI_SHARE_VIEWER_URL | Override base URL cho /share command |
| PI_HARDWARE_CURSOR | PI_HARDWARE_CURSOR | Show hardware cursor (1) |
| PI_TUI_ESC_TIMEOUT | PI_TUI_ESC_TIMEOUT | ESC timeout ms (default 100 SSH, 10 local) |
| PI_EXPERIMENTAL | PI_EXPERIMENTAL | Enable experimental first-time setup |
| PI_SESSION_ID | PI_SESSION_ID | Current session ID (injected cho bash tool) |
| PI_SESSION_FILE | PI_SESSION_FILE | Absolute path session JSONL file |
| PI_PROVIDER | PI_PROVIDER | Selected model provider (in bash tool env) |
| PI_MODEL | PI_MODEL | Selected model ID (in bash tool env) |
| PI_REASONING_LEVEL | PI_REASONING_LEVEL | off, minimal, low, medium, high, xhigh, max |
| ANTHROPIC_API_KEY | ANTHROPIC_API_KEY | Anthropic API credential |
| OPENAI_API_KEY | OPENAI_API_KEY | OpenAI API credential |
| LLAMA_BASE_URL | LLAMA_BASE_URL | llama.cpp router URL (default http://127.0.0.1:8080) |
| LLAMA_API_KEY | LLAMA_API_KEY | llama.cpp router API key (optional) |
| HF_TOKEN | HF_TOKEN | Hugging Face token cho gated models |
| **Slash commands (/...)** | | |
| /login /login | Provider login flow | |
| /llama /llama | llama.cpp model manager | |
| /model /model | Chọn model cho session | |
| /resume /resume | Browse và select previous sessions | |
| /new /new | Start new session | |
| /session /session | Show session info | |
| /tree /tree | Navigate session tree | |
| /fork /fork | Create new session từ previous user message | |
| /clone /clone | Duplicate active branch vào new session | |
| /compact /compact | Summarize older context (nhận optional prompt) | |
| /share /share | Upload session as private GitHub gist | |
| /export /export | Export session sang HTML | |
| /name /name | Set session display name | |
| /settings /settings | Edit common settings | |
| /trust /trust | Save project trust decision | |
| **Settings keys (settings.json)** | | |
| defaultProvider | defaultProvider | Default provider (vd "anthropic", "openai") |
| defaultModel | defaultModel | Default model ID |
| defaultThinkingLevel | defaultThinkingLevel | off/minimal/low/medium/high/xhigh/max |
| hideThinkingBlock | hideThinkingBlock | Hide thinking blocks in output |
| theme | theme | "dark", "light", hoặc custom |
| defaultProjectTrust | defaultProjectTrust | ask / always / never (global only) |
| treeFilterMode | treeFilterMode | default / no-tools / user-only / labeled-only / all |
| doubleEscapeAction | doubleEscapeAction | tree / fork / none |
| enableInstallTelemetry | enableInstallTelemetry | Anonymous version ping |
| enableAnalytics | enableAnalytics | Opt-in analytics (chỉ với PI_EXPERIMENTAL=1) |
| thinkingBudgets | thinkingBudgets | Custom token budgets per thinking level |
| showCacheMissNotices | showCacheMissNotices | Show prompt-cache miss notices |
| tuiMode | tuiMode | regular / fullscreen (experimental) |
| quietStartup | quietStartup | Hide startup header |
| **Concept & format** | | |
| JSONL | JSONL | Newline-delimited JSON — session file format |
| llama.cpp | llama.cpp | Local GGUF model router (server) |
| GGUF | GGUF | GPT-Generated Unified Format (model file format) |
| createBashTool | createBashTool | API factory cho custom bash tools |
| exposeSessionEnvironment | exposeSessionEnvironment | Toggle PI_* env injection cho bash tool |
| spawnHook | spawnHook | Hook function inject env vars trước spawn |
| treeFilterMode filter | treeFilterMode filter | Mode filter trong /tree picker |
| trash CLI | trash CLI | Safe delete CLI (alternative to rm) |
| Tree (DAG) | Cây phiên (DAG) | Cấu trúc session: mỗi entry có id + parentId |

Glossary là living document — cập nhật khi phát hiện term mới qua các chapter.

### 6.2 Style rules

1. Code, API names, file paths, env vars: NEVER translate.
2. Inline terms first occurrence: `<English term> (<giải thích ngắn>)` — sau đó dùng English term thuần.
3. Headings: tiếng Việt/Anh tự nhiên; nếu là thuật ngữ chính, giữ English term trong ngoặc đơn.
4. Comments trong code blocks: nếu source là tiếng Trung → dịch comment sang VI/EN; code identifier giữ nguyên.
5. Numbers, units, dates: giữ nguyên format gốc.
6. Bold/italic emphasis: được phép dịch để giữ nhịp tự nhiên.
7. Links: giữ URL nguyên; link text dịch.
8. Tables: dịch header + cell content; giữ column count.
9. Blockquotes: dịch nội dung; giữ > marker.
10. Frontmatter values (title_*): dịch hoàn toàn sang ngôn ngữ đó.
11. **No emojis**: trong prose, headings, code comments, tables (theo official AGENTS.md).
12. **No fluff**: bỏ cheerful filler ("Thanks!", "Hope this helps!", etc.) — technical prose only.
13. **Concise language**: define jargon trước khi dùng, prefer concrete examples over abstract summaries.
14. **Problem → example → solution → why**: khi giải thích design/non-trivial concept, follow structure này.

### 6.3 Style reference (từ official Pi docs)

- Concise: 1-3 câu cho mỗi ý chính
- Code-first: code sample trước, giải thích sau
- Tables for structured info: dùng table thay vì bullet list dài
- No fluff: bỏ marketing language, tập trung technical fact
- Cross-reference: link official docs/source khi claim technical

---

## 7. Diagram Conversion Strategy

### 7.1 Source (dgzhuya.com)

- Hầu hết diagram là ASCII art box-drawing (vd: box-drawing chars)
- Một số là SVG rendered từ Astro components
- Một số có thể là Mermaid embedded (cần verify từng chapter)

### 7.2 Conversion plan

| Bản | Strategy |
|---|---|
| zh/ | Giữ ASCII art faithful với source (đây là canonical) |
| en/ | Convert tất cả ASCII art + SVG sang mermaid blocks |
| vi/ | Convert tất cả ASCII art + SVG sang mermaid blocks (mirror en/) |

### 7.3 Conversion rules (ASCII → mermaid)

- Vertical hierarchy (vd: package layers): flowchart TD
- Horizontal data flow (vd: message timeline): sequenceDiagram
- State machine (vd: session lifecycle): stateDiagram-v2
- Generic boxes/relationships: flowchart LR
- Subgraph dùng `subgraph Title ... end`
- Node labels escape ký tự đặc biệt với `["..."]`
- Labels có dấu Việt/Anh → giữ nguyên (mermaid hỗ trợ UTF-8)

### 7.4 Conversion workflow

1. Identify diagram trong source zh/src/chapter-XX.md
2. Draw mermaid equivalent (manual hoặc LLM-assisted)
3. Validate syntax: dùng `mmdc -i input.mmd -o output.svg` (mermaid CLI)
4. Replace ASCII block trong en/ và vi/
5. Update frontmatter mermaid_blocks count

### 7.5 CI validation

- Workflow sync-check.yml chạy mmdc validate tất cả mermaid blocks (không syntax error)
- Nếu fail → block PR

---

## 8. Quality Gates

### 8.1 Gate summary

| Gate | When | Tool | Failure = ? |
|---|---|---|---|
| Frontmatter schema | pre-commit, CI | validate-frontmatter.ps1 | block commit + PR |
| Sync structure | PR, CI | sync-check.ps1 | block PR |
| mdBook build | CI | mdbook build (3 books) | block deploy |
| Mermaid syntax | CI | mmdc validate | block deploy |
| Markdown lint | CI | markdownlint | warning only |
| URL link check | manual + scheduled | lychee | warning only |
| Technical accuracy | PR review (human) | manual + official_refs | block merge |
| Visual review | PR review (human) | manual | block merge |

### 8.2 CI workflow draft

`.github/workflows/deploy.yml` (sketch) — full YAML sẽ có trong implementation plan.

Workflow chính:

- Trigger: push to main, pull_request, workflow_dispatch
- Jobs:
  - lint (PR only): chạy sync-check.ps1 + validate-frontmatter.ps1
  - build: install mdbook + mdbook-mermaid → mdbook build zh/en/vi → upload artifact
  - deploy (main only): dùng actions/deploy-pages@v4 đến GitHub Pages

### 8.3 Required GitHub repo settings

- Settings → Pages → Source = "GitHub Actions"
- Actions → General → Workflow permissions = "Read and write permissions"
- (Optional) Settings → Environments → github-pages → required reviewers

---

## 9. Phased Delivery

### Phase 0 — Spec (current task)

- [x] Brainstorm + design research (official Pi docs)
- [x] Write design doc (file này)
- [ ] Self-review spec
- [ ] User review spec
- [ ] Invoke writing-plans skill → tạo implementation plan

### Phase 1 — Skeleton setup

- Khởi tạo GitHub repo `pi-docs`
- Tạo `zh/`, `en/`, `vi/` với `book.toml` + `SUMMARY.md` skeleton
- Tạo scripts: `sync-check.ps1`, `validate-frontmatter.ps1`, `fetch-zh.ps1`, `validate-mermaid.ps1`
- Tạo GitHub Actions workflows (`deploy.yml`, `sync-check.yml`)
- Tạo `GLOSSARY.md` (initial 50 terms), `README.md`, `CONTRIBUTING.md`, `LICENSE`
- Verify: `mdbook build` cả 3 books thành công với placeholder content
- **Acceptance**: tất cả CI checks pass trên empty chapter files

### Phase 2 — Validate với Chapter 1

- Fetch chương 1 từ `dgzhuya.com` → `zh/src/chapter-01.md`
- Dịch sang `en/src/chapter-01.md` + `vi/src/chapter-01.md`
- Convert diagrams: ASCII → mermaid trong `en/`, `vi/`
- User review → adjust glossary/style nếu cần
- Verify: sync-check pass, mdBook build pass, mermaid render pass
- Deploy lên GitHub Pages lần đầu (verify URL accessible)
- **Acceptance**: cả 3 bản render đúng trên GitHub Pages, PR review approved

### Phase 3 — Scale to all chapters

- Lặp lại Phase 2 cho chương 2-10
- Mỗi chương thành 1 PR riêng
- Update `GLOSSARY.md` liên tục khi phát hiện term mới
- **Acceptance**: 10/10 chapters published trên cả 3 ngôn ngữ

### Phase 4 — Maintenance

- Monthly cron kiểm tra site gốc có cập nhật
- Nếu có → fetch diff → re-translate affected chapters
- Contributor onboarding via `CONTRIBUTING.md`

---

## 10. Open Questions & Risks

### 10.1 Open questions (cần user input khi execute)

- Repo owner GitHub: tên user/org? (Default: tạo mới dưới user hiện tại)
- Domain cho GitHub Pages: dùng `*.github.io/pi-docs/` hay custom domain?
- Có muốn Dark theme mặc định cho `vi/`?
- LLM API key cho translation automation (nếu muốn auto-translate)?

### 10.2 Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Site gốc dgzhuya.com cập nhật | Drift giữa source và bản dịch | Monthly cron + version tracking trong frontmatter |
| Official Pi docs thay đổi API names | Glossary cũ, bản dịch cũ | Glossary update + chapter re-review |
| Mermaid syntax fail | Diagram không render | CI validate mmdc block PR |
| Translator inconsistency | Glossary drift | Enforce glossary + review checklist |
| GitHub Pages bandwidth | Limit nếu nhiều traffic | Có thể dùng Cloudflare proxy sau |
| Build time chậm khi 10 chapter × mermaid blocks | CI timeout | Cache mdbook binary, parallel build |

### 10.3 Out-of-scope (future)

- PDF export (qua `mdbook-pdf` plugin)
- EPUB export
- Search multi-language
- Auto-translate pipeline (LLM API integration)
- Translation memory database
- Contributor analytics dashboard

---

## 11. Acceptance Criteria for this Spec

Spec này được coi là complete khi:

- [x] Tất cả decisions trong spec được rationale rõ ràng
- [x] Cross-reference table (Section 2.2) verified với official docs
- [x] Glossary initial list (Section 6.1) đầy đủ ≥ 50 terms
- [x] CI workflow draft (Section 8) referenced
- [ ] Implementation plan viết riêng (`docs/superpowers/plans/2026-08-20-pi-docs-translation-plan.md`)
- [ ] User đã review spec và approve trước khi chuyển sang implementation

---

*End of spec. Implementation plan sẽ được tạo qua `superpowers:writing-plans` skill.*
