# Glossary

Preserved English technical terms used across all translations of the Pi Agent Book. **Do not translate** any term in this glossary — use it verbatim in Chinese, English, and Vietnamese chapters.

When you encounter a term not yet listed here, append a row with: `term | category | short explanation | source`.

---

## Core Pi Terms

| English term | Vietnamese (giải thích) | Source / Bối cảnh |
|---|---|---|
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

---

## Official API Identifiers

| English term | Vietnamese (giải thích) | Source / Bối cảnh |
|---|---|---|
| SessionManager | SessionManager | Class quản lý session |
| CompactionEntry | CompactionEntry | Entry type cho compaction |
| BranchSummaryEntry | BranchSummaryEntry | Entry type cho branch summary |
| firstKeptEntryId | firstKeptEntryId | ID entry đầu tiên giữ sau compaction |
| keepRecentTokens | keepRecentTokens | Token threshold giữ recent msgs |
| reserveTokens | reserveTokens | Reserve tokens cho LLM response |
| contextWindow | contextWindow | Cửa sổ context của model |
| contextTokens | contextTokens | Tokens đang dùng |

---

## Telemetry Attributes

| English term | Vietnamese (giải thích) | Source / Bối cảnh |
|---|---|---|
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

---

## Paths & Settings Files

| English term | Vietnamese (giải thích) | Source / Bối cảnh |
|---|---|---|
| `~/.pi/agent/settings.json` | `~/.pi/agent/settings.json` | Global settings |
| `/.pi/settings.json` | `/.pi/settings.json` | Project settings |
| `SYSTEM.md` | `SYSTEM.md` | Custom system prompt file |
| `models.json` | `models.json` | Custom models config |
| `packages/coding-agent/src/` | `packages/coding-agent/src/` | Source path prefix |
| `packages/agent/src/` | `packages/agent/src/` | Source path prefix |
| `packages/ai/src/` | `packages/ai/src/` | Source path prefix |
| `packages/tui/src/` | `packages/tui/src/` | Source path prefix |

---

## Environment Variables

| English term | Vietnamese (giải thích) | Source / Bối cảnh |
|---|---|---|
| `PI_OFFLINE` | `PI_OFFLINE` | Disable startup network operations |
| `PI_CODING_AGENT` | `PI_CODING_AGENT` | Process marker (true) khi chạy trong Pi |
| `AI_AGENT` | `AI_AGENT` | Generic process marker (pi) |
| `PI_CODING_AGENT_DIR` | `PI_CODING_AGENT_DIR` | Override config directory (default ~/.pi/agent) |
| `PI_CODING_AGENT_SESSION_DIR` | `PI_CODING_AGENT_SESSION_DIR` | Override session storage |
| `PI_PACKAGE_DIR` | `PI_PACKAGE_DIR` | Override package directory (Nix/Guix) |
| `PI_SKIP_VERSION_CHECK` | `PI_SKIP_VERSION_CHECK` | Disable pi.dev latest-version request |
| `PI_TELEMETRY` | `PI_TELEMETRY` | Install/update telemetry override (1/true/yes or 0/false/no) |
| `PI_CACHE_RETENTION` | `PI_CACHE_RETENTION` | long = extended provider prompt caching |
| `PI_SHARE_VIEWER_URL` | `PI_SHARE_VIEWER_URL` | Override base URL cho /share command |
| `PI_HARDWARE_CURSOR` | `PI_HARDWARE_CURSOR` | Show hardware cursor (1) |
| `PI_TUI_ESC_TIMEOUT` | `PI_TUI_ESC_TIMEOUT` | ESC timeout ms (default 100 SSH, 10 local) |
| `PI_EXPERIMENTAL` | `PI_EXPERIMENTAL` | Enable experimental first-time setup |
| `PI_SESSION_ID` | `PI_SESSION_ID` | Current session ID (injected cho bash tool) |
| `PI_SESSION_FILE` | `PI_SESSION_FILE` | Absolute path session JSONL file |
| `PI_PROVIDER` | `PI_PROVIDER` | Selected model provider (in bash tool env) |
| `PI_MODEL` | `PI_MODEL` | Selected model ID (in bash tool env) |
| `PI_REASONING_LEVEL` | `PI_REASONING_LEVEL` | off, minimal, low, medium, high, xhigh, max |
| `ANTHROPIC_API_KEY` | `ANTHROPIC_API_KEY` | Anthropic API credential |
| `OPENAI_API_KEY` | `OPENAI_API_KEY` | OpenAI API credential |
| `LLAMA_BASE_URL` | `LLAMA_BASE_URL` | llama.cpp router URL (default http://127.0.0.1:8080) |
| `LLAMA_API_KEY` | `LLAMA_API_KEY` | llama.cpp router API key (optional) |
| `HF_TOKEN` | `HF_TOKEN` | Hugging Face token cho gated models |

---

## Slash Commands

| English term | Vietnamese (giải thích) | Source / Bối cảnh |
|---|---|---|
| `/login` | `/login` | Provider login flow |
| `/llama` | `/llama` | llama.cpp model manager |
| `/model` | `/model` | Chọn model cho session |
| `/resume` | `/resume` | Browse và select previous sessions |
| `/new` | `/new` | Start new session |
| `/session` | `/session` | Show session info |
| `/tree` | `/tree` | Navigate session tree |
| `/fork` | `/fork` | Create new session từ previous user message |
| `/clone` | `/clone` | Duplicate active branch vào new session |
| `/compact` | `/compact` | Summarize older context (nhận optional prompt) |
| `/share` | `/share` | Upload session as private GitHub gist |
| `/export` | `/export` | Export session sang HTML |
| `/name` | `/name` | Set session display name |
| `/settings` | `/settings` | Edit common settings |
| `/trust` | `/trust` | Save project trust decision |

---

## Settings Keys

| English term | Vietnamese (giải thích) | Source / Bối cảnh |
|---|---|---|
| `defaultProvider` | `defaultProvider` | Default provider (vd "anthropic", "openai") |
| `defaultModel` | `defaultModel` | Default model ID |
| `defaultThinkingLevel` | `defaultThinkingLevel` | off/minimal/low/medium/high/xhigh/max |
| `hideThinkingBlock` | `hideThinkingBlock` | Hide thinking blocks in output |
| `theme` | `theme` | "dark", "light", hoặc custom |
| `defaultProjectTrust` | `defaultProjectTrust` | ask / always / never (global only) |
| `treeFilterMode` | `treeFilterMode` | default / no-tools / user-only / labeled-only / all |
| `doubleEscapeAction` | `doubleEscapeAction` | tree / fork / none |
| `enableInstallTelemetry` | `enableInstallTelemetry` | Anonymous version ping |
| `enableAnalytics` | `enableAnalytics` | Opt-in analytics (chỉ với PI_EXPERIMENTAL=1) |
| `thinkingBudgets` | `thinkingBudgets` | Custom token budgets per thinking level |
| `showCacheMissNotices` | `showCacheMissNotices` | Show prompt-cache miss notices |
| `tuiMode` | `tuiMode` | regular / fullscreen (experimental) |
| `quietStartup` | `quietStartup` | Hide startup header |

---

## Concepts & Formats

| English term | Vietnamese (giải thích) | Source / Bối cảnh |
|---|---|---|
| JSONL | JSONL | Newline-delimited JSON — session file format |
| llama.cpp | llama.cpp | Local GGUF model router (server) |
| GGUF | GGUF | GPT-Generated Unified Format (model file format) |
| createBashTool | createBashTool | API factory cho custom bash tools |
| exposeSessionEnvironment | exposeSessionEnvironment | Toggle PI_* env injection cho bash tool |
| spawnHook | spawnHook | Hook function inject env vars trước spawn |
| treeFilterMode filter | treeFilterMode filter | Mode filter trong /tree picker |
| trash CLI | trash CLI | Safe delete CLI (alternative to rm) |
| Tree (DAG) | Cây phiên (DAG) | Cấu trúc session: mỗi entry có id + parentId |

---

## Maintenance

Glossary is a living document. When you spot a term that appears in dgzhuya.com, official pi.dev docs, or earendil-works/pi source but is not listed here, add a row. Keep entries short and factual; the "Vietnamese" column is for short explanations only — do not invent new translations for the term itself.
