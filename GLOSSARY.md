# Glossary

This file defines the terminology contract for the English and Vietnamese documentation. Preserve code identifiers, type names, package names, commands, file paths, configuration keys, and environment variables exactly. Ordinary technical concepts may be translated only when the table below explicitly allows it.

In Vietnamese prose, introduce terms marked **Explain first use** with the Vietnamese phrase followed by the canonical English term in parentheses. After that, use the Vietnamese phrase consistently. Do not alternate between synonyms for style.

---

## Core terminology

| Canonical term | English usage | Vietnamese usage | Translate? | Verification source |
| --- | --- | --- | --- | --- |
| Pi | Pi | Pi | No | [Project README](https://github.com/badlogic/pi-mono/blob/main/README.md) |
| Agent | agent; `Agent` for the class | Agent; preserve `Agent` for the class | No | [`packages/agent/README.md`](https://github.com/badlogic/pi-mono/blob/main/packages/agent/README.md) |
| Agent Loop | agent loop | vòng lặp Agent (Agent Loop) | Explain first use | [`harness.md`](https://github.com/badlogic/pi-mono/blob/main/packages/agent/docs/harness.md) |
| Harness | harness | bộ khung (harness) | Explain first use | [`harness.md`](https://github.com/badlogic/pi-mono/blob/main/packages/agent/docs/harness.md) |
| Tool | tool; preserve `Tool` for the type | Tool | No | [`packages/agent/README.md`](https://github.com/badlogic/pi-mono/blob/main/packages/agent/README.md) |
| Tool System | tool system | hệ thống Tool | Explain first use | [`harness.md`](https://github.com/badlogic/pi-mono/blob/main/packages/agent/docs/harness.md) |
| Event | event | sự kiện | Yes in prose | [`harness.md`](https://github.com/badlogic/pi-mono/blob/main/packages/agent/docs/harness.md) |
| event-driven | event-driven | hướng sự kiện | Yes | [`harness.md`](https://github.com/badlogic/pi-mono/blob/main/packages/agent/docs/harness.md) |
| Provider | provider; preserve provider IDs | provider | No | [`providers.md`](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/providers.md) |
| Model | model; preserve model IDs | model | No | [`models.md`](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/models.md) |
| Prompt | prompt | prompt | No | [`prompt-templates.md`](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/prompt-templates.md) |
| Message | message; preserve message types | message; preserve message types | No | [`packages/agent/README.md`](https://github.com/badlogic/pi-mono/blob/main/packages/agent/README.md) |
| Context | context | ngữ cảnh | Yes in prose | [`usage.md`](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/usage.md) |
| Context Engineering | context engineering | kỹ thuật ngữ cảnh (context engineering) | Explain first use | [`harness.md`](https://github.com/badlogic/pi-mono/blob/main/packages/agent/docs/harness.md) |
| Context Compaction | context compaction | nén ngữ cảnh | Yes | [`compaction.md`](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/compaction.md) |
| Session | session | phiên làm việc (session) | Explain first use | [`sessions.md`](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/sessions.md) |
| Session Tree | session tree | cây phiên làm việc | Yes | [`sessions.md`](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/sessions.md) |
| streaming | streaming | truyền dữ liệu theo luồng (streaming) | Explain first use | [`packages/ai/README.md`](https://github.com/badlogic/pi-mono/blob/main/packages/ai/README.md) |
| TUI | TUI | TUI | No | [`tui.md`](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/tui.md) |
| MCP | MCP | MCP | No | Model Context Protocol |
| RPC | RPC | RPC | No | [`rpc.md`](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/rpc.md) |
| SDK | SDK | SDK | No | [`sdk.md`](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/sdk.md) |
| DAG | DAG | DAG | No | Directed acyclic graph |
| Skill | skill | skill | No | [`skills.md`](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/skills.md) |
| Extension | extension | extension | No | [`extensions.md`](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/extensions.md) |
| Pi Package | Pi package | gói Pi (Pi package) | Explain first use | [`packages.md`](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/packages.md) |
| Prompt Template | prompt template | mẫu prompt (prompt template) | Explain first use | [`prompt-templates.md`](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/prompt-templates.md) |
| Hot Reload | hot reload | hot reload | No | [`extensions.md`](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/extensions.md) |
| Steering | steering message | message điều hướng (steering) | Explain first use | [`harness.md`](https://github.com/badlogic/pi-mono/blob/main/packages/agent/docs/harness.md) |
| Follow-up | follow-up message | message tiếp nối (follow-up) | Explain first use | [`harness.md`](https://github.com/badlogic/pi-mono/blob/main/packages/agent/docs/harness.md) |

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
| AgentMessage | AgentMessage | Union type từ pi-agent-core |
| Agent | Agent | Class chính trong pi-agent-core |
| AgentState | AgentState | State object của agent runtime |
| transformContext | transformContext | Filter/inject messages trước LLM call |
| convertToLlm | convertToLlm | Bridge AgentMessage → Message[] LLM-friendly |
| beforeToolCall | beforeToolCall | Hook chạy sau tool_execution_start |
| afterToolCall | afterToolCall | Hook chạy sau khi tool xong |
| finishTurn | finishTurn | Hook quyết định kết thúc hoặc tiếp tục sau Turn |
| subscribe() | subscribe() | Agent method đăng ký event listener |
| prompt() | prompt() | Agent method gửi user message |
| ExtensionAPI | ExtensionAPI | Interface injection vào extension factory |
| ExtensionContext | ExtensionContext | Context truyền kèm event handler |
| ExtensionCommandContext | ExtensionCommandContext | Context cho slash command handler |
| registerTool | registerTool | Extension API đăng ký custom tool |
| registerCommand | registerCommand | Extension API đăng ký slash command |
| registerProvider | registerProvider | Extension API đăng ký LLM provider |
| appendEntry | appendEntry | Extension API ghi session entry custom |
| Type / Static / TSchema | Type / Static / TSchema | Re-exports từ TypeBox trong pi-ai |
| StringEnum | StringEnum | pi-ai helper cho Google-compatible enum |
| BashExecutionMessage | BashExecutionMessage | Role `bashExecution` trong session JSONL |
| BranchSummaryMessage | BranchSummaryMessage | Role `branchSummary` đánh dấu branch khác |
| CompactionSummaryMessage | CompactionSummaryMessage | Role `compactionSummary` lưu summary |
| CustomMessage | CustomMessage | Role `custom` cho extension-produced entry |
| JsonAgentSessionEvent | JsonAgentSessionEvent | Union type cho `--mode json` events |
| JsonAssistantMessageEvent | JsonAssistantMessageEvent | Streaming variant bỏ `partial` |
| TextContent / ImageContent / ThinkingContent | TextContent / ImageContent / ThinkingContent | Content block types trong message |
| ToolCall | ToolCall | `{type:"toolCall", id, name, arguments}` content block |
| Usage | Usage | `{input,output,cacheRead,cacheWrite,totalTokens,cost}` |
| StopReason | StopReason | `"stop"` / `"length"` / `"toolUse"` / `"error"` / `"aborted"` (+`"pending"` trong stream) |

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
| `~/.pi/agent/settings.json` | `~/.pi/agent/settings.json` | Global settings (mọi project) |
| `~/.pi/agent/AGENTS.md` | `~/.pi/agent/AGENTS.md` | Global context file cho mọi session |
| `.pi/settings.json` | `.pi/settings.json` | Project-local settings (override global) |
| `.pi/extensions/` | `.pi/extensions/` | Project-local extensions folder |
| `.pi/npm/` | `.pi/npm/` | Project-local pi packages từ npm |
| `.pi/skills/` | `.pi/skills/` | Project-local skills folder |
| `~/.pi/agent/auth.json` | `~/.pi/agent/auth.json` | OAuth/API-key credentials storage |
| `~/.pi/agent/models-store.json` | `~/.pi/agent/models-store.json` | Cached model catalogs (Radius/openai-catalog refresh) |
| `~/.pi/agent/models.json` | `~/.pi/agent/models.json` | Custom user models/providers config |
| `~/.pi/agent/trust.json` | `~/.pi/agent/trust.json` | Saved per-folder project-trust decisions |
| `~/.pi/agent/keybindings.json` | `~/.pi/agent/keybindings.json` | Custom keybinding bindings |
| `~/.pi/agent/sessions/` | `~/.pi/agent/sessions/` | Auto-save folder cho session JSONL |
| `SYSTEM.md` | `SYSTEM.md` | Custom system prompt file |
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
| `ANT_LING_API_KEY` | `ANT_LING_API_KEY` | Ant Ling credential |
| `AZURE_OPENAI_API_KEY` | `AZURE_OPENAI_API_KEY` | Azure OpenAI Responses credential |
| `OPENAI_API_KEY` | `OPENAI_API_KEY` | OpenAI API credential |
| `DEEPSEEK_API_KEY` | `DEEPSEEK_API_KEY` | DeepSeek credential |
| `NVIDIA_API_KEY` | `NVIDIA_API_KEY` | NVIDIA NIM credential |
| `GEMINI_API_KEY` | `GEMINI_API_KEY` | Google Gemini credential |
| `AWS_BEARER_TOKEN_BEDROCK` | `AWS_BEARER_TOKEN_BEDROCK` | Amazon Bedrock credential |
| `MISTRAL_API_KEY` | `MISTRAL_API_KEY` | Mistral credential |
| `GROQ_API_KEY` | `GROQ_API_KEY` | Groq credential |
| `CEREBRAS_API_KEY` | `CEREBRAS_API_KEY` | Cerebras credential |
| `CLOUDFLARE_API_KEY` | `CLOUDFLARE_API_KEY` | Cloudflare AI Gateway / Workers AI |
| `CLOUDFLARE_ACCOUNT_ID` | `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account id |
| `CLOUDFLARE_GATEWAY_ID` | `CLOUDFLARE_GATEWAY_ID` | Cloudflare AI Gateway id |
| `XAI_API_KEY` | `XAI_API_KEY` | xAI API credential |
| `OPENROUTER_API_KEY` | `OPENROUTER_API_KEY` | OpenRouter API credential |
| `AI_GATEWAY_API_KEY` | `AI_GATEWAY_API_KEY` | Vercel AI Gateway credential |
| `ZAI_API_KEY` | `ZAI_API_KEY` | ZAI Coding Plan (Global) |
| `ZAI_CODING_CN_API_KEY` | `ZAI_CODING_CN_API_KEY` | ZAI Coding Plan (China) |
| `OPENCODE_API_KEY` | `OPENCODE_API_KEY` | OpenCode Zen / OpenCode Go |
| `RADIUS_API_KEY` | `RADIUS_API_KEY` | Radius gateway credential |
| `HF_TOKEN` | `HF_TOKEN` | Hugging Face token cho gated models |
| `FIREWORKS_API_KEY` | `FIREWORKS_API_KEY` | Fireworks credential |
| `TOGETHER_API_KEY` | `TOGETHER_API_KEY` | Together AI credential |
| `BASETEN_API_KEY` | `BASETEN_API_KEY` | Baseten credential |
| `KIMI_API_KEY` | `KIMI_API_KEY` | Kimi For Coding |
| `MINIMAX_API_KEY` | `MINIMAX_API_KEY` | MiniMax (global) |
| `MINIMAX_CN_API_KEY` | `MINIMAX_CN_API_KEY` | MiniMax (China) |
| `QWEN_TOKEN_PLAN_API_KEY` | `QWEN_TOKEN_PLAN_API_KEY` | Qwen Token Plan |
| `QWEN_TOKEN_PLAN_CN_API_KEY` | `QWEN_TOKEN_PLAN_CN_API_KEY` | Qwen Token Plan (China) |
| `XIAOMI_API_KEY` | `XIAOMI_API_KEY` | Xiaomi MiMo credential |
| `XIAOMI_TOKEN_PLAN_CN_API_KEY` | `XIAOMI_TOKEN_PLAN_CN_API_KEY` | Xiaomi MiMo Token Plan (China) |
| `XIAOMI_TOKEN_PLAN_AMS_API_KEY` | `XIAOMI_TOKEN_PLAN_AMS_API_KEY` | Xiaomi MiMo Token Plan (Amsterdam) |
| `XIAOMI_TOKEN_PLAN_SGP_API_KEY` | `XIAOMI_TOKEN_PLAN_SGP_API_KEY` | Xiaomi MiMo Token Plan (Singapore) |
| `LLAMA_BASE_URL` | `LLAMA_BASE_URL` | llama.cpp router URL (default http://127.0.0.1:8080) |
| `LLAMA_API_KEY` | `LLAMA_API_KEY` | llama.cpp router API key (optional) |
| `$VISUAL` / `$EDITOR` | `$VISUAL` / `$EDITOR` | External editor (Ctrl+G) |
| `PKCE_AUTHORIZATION_CODE` | `PKCE_AUTHORIZATION_CODE` | OAuth PKCE code cho headless /login |

---

## Slash Commands

| English term | Vietnamese (giải thích) | Source / Bối cảnh |
|---|---|---|
| `/login` | `/login` | Provider login flow (OAuth hoặc API key) |
| `/logout` | `/logout` | Clear stored credentials trong auth.json |
| `/llama` | `/llama` | llama.cpp model manager |
| `/model` | `/model` | Chọn model cho session |
| `/scoped-models` | `/scoped-models` | Enable/disable models cho Ctrl+P cycling |
| `/resume` | `/resume` | Browse và select previous sessions |
| `/new` | `/new` | Start new session |
| `/session` | `/session` | Show session info |
| `/tree` | `/tree` | Navigate session tree |
| `/fork` | `/fork` | Create new session từ previous user message |
| `/clone` | `/clone` | Duplicate active branch vào new session |
| `/compact` | `/compact` | Summarize older context (nhận optional prompt) |
| `/copy` | `/copy` | Copy last assistant message to clipboard |
| `/share` | `/share` | Upload session as private GitHub gist |
| `/export` | `/export` | Export session sang HTML hoặc JSONL |
| `/import` | `/import` | Import và resume session từ JSONL |
| `/name` | `/name` | Set session display name |
| `/settings` | `/settings` | Edit common settings (theme, thinking level, v.v.) |
| `/trust` | `/trust` | Save project trust decision |
| `/reload` | `/reload` | Reload keybindings/extensions/skills/prompts/themes/context files |
| `/hotkeys` | `/hotkeys` | Show all keyboard shortcuts |
| `/changelog` | `/changelog` | Display version history |
| `/quit` | `/quit` | Quit pi |

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
| `enableInstallTelemetry` | `enableInstallTelemetry` | Anonymous version ping (default true) |
| `enableAnalytics` | `enableAnalytics` | Opt-in analytics (chỉ với PI_EXPERIMENTAL=1) |
| `trackingId` | `trackingId` | Analytics tracking id (tự sinh khi enableAnalytics bật) |
| `thinkingBudgets` | `thinkingBudgets` | Custom token budgets per thinking level |
| `showCacheMissNotices` | `showCacheMissNotices` | Show prompt-cache miss notices |
| `tuiMode` | `tuiMode` | regular / fullscreen (experimental) |
| `fullscreenExitOutput` | `fullscreenExitOutput` | transcript / resume-hint (chỉ áp dụng fullscreen) |
| `fullscreenScrollbar` | `fullscreenScrollbar` | auto / always / never (fullscreen transcript scrollbar) |
| `quietStartup` | `quietStartup` | Hide startup header |
| `collapseChangelog` | `collapseChangelog` | Show condensed changelog after updates |
| `editorPaddingX` | `editorPaddingX` | Horizontal padding input editor (0-3) |
| `outputPad` | `outputPad` | Horizontal padding user/assistant/thinking (0/1) |
| `autocompleteMaxVisible` | `autocompleteMaxVisible` | Max visible items in autocomplete dropdown (3-20) |
| `showHardwareCursor` | `showHardwareCursor` | Show terminal cursor while TUI positions IME |
| `shellCommandPrefix` | `shellCommandPrefix` | Lệnh chạy trước mỗi `bash` để expand shell aliases (vd `shopt -s expand_aliases`) |
| `externalEditor` | `externalEditor` | Command cho Ctrl+G (override $VISUAL/$EDITOR) |
| `npmCommand` | `npmCommand` | Wrapper cho npm operations (vd `mise exec node@20 -- npm`) |
| `packages` | `packages` | Danh sách `npm:`/`git:` references cho resources |
| `extensions` | `extensions` | Extra extension paths ngoài auto-discovery folders |
| `steeringMode` | `steeringMode` | Cấu hình cách steering messages được gửi |
| `followUpMode` | `followUpMode` | Cấu hình cách follow-up messages được gửi |
| `toolExecution` | `toolExecution` | Global default: parallel / sequential |

---

## Concepts & Formats

| English term | Vietnamese (giải thích) | Source / Bối cảnh |
|---|---|---|
| JSONL | JSONL | Newline-delimited JSON: session file format |
| llama.cpp | llama.cpp | Local GGUF model router (server) |
| GGUF | GGUF | GPT-Generated Unified Format (model file format) |
| createBashTool | createBashTool | API factory cho custom bash tools |
| exposeSessionEnvironment | exposeSessionEnvironment | Toggle PI_* env injection cho bash tool |
| spawnHook | spawnHook | Hook function inject env vars trước spawn |
| treeFilterMode filter | treeFilterMode filter | Mode filter trong /tree picker |
| trash CLI | trash CLI | Safe delete CLI (alternative to rm) |
| Tree (DAG) | Cây phiên (DAG) | Cấu trúc session: mỗi entry có id + parentId |
| Session v1 / v2 / v3 | Session v1 / v2 / v3 | v1 linear, v2 tree id/parentId, v3 đổi `hookMessage`→`custom` |
| Hot Reload | Hot Reload | Extension/keybinding/prompt change apply không cần restart |
| Message Queue | Message Queue | Hàng chờ giúp gửi messages trong khi Agent đang xử lý |
| Steering Mode | Steering Mode | Enter queue và inject giữa turn hiện tại |
| Follow-up Mode | Follow-up Mode | Alt+Enter queue và inject sau khi Agent xong |
| `--mode json` | `--mode json` | JSON event stream stdout (cho integration) |
| `--mode rpc` | `--mode rpc` | RPC mode (JSON-RPC over stdio) |
| `--print / -p` | `--print / -p` | Non-interactive one-shot mode |
| `--ignore-scripts` | `--ignore-scripts` | npm install flag vô hiệu lifecycle scripts |
| `-e / --extension` | `-e / --extension` | Quick-test extension từ local path |
| `pi -c` | `pi -c` | Continue most-recent session |
| `pi -r` | `pi -r` | Browse session picker (giống /resume nhưng lúc khởi động) |
| `pi --no-session` | `pi --no-session` | Ephemeral mode, không save session |
| `pi --name` | `pi --name` | Đặt session display name lúc khởi động |
| `pi --session` | `pi --session` | Dùng một session file/id cụ thể |
| `pi --fork` | `pi --fork` | Fork session file/id sang session mới |
| `--approve / -a` | `--approve / -a` | Trust project-local settings cho run này |
| `--no-approve / -na` | `--no-approve / -na` | Ignore project-local settings cho run này |
| OpenRouter PKCE | OpenRouter PKCE | OAuth authorization flow qua browser; headless cần paste URL/code |
| GitHub Copilot Enterprise | GitHub Copilot Enterprise | Domain Github Enterprise Server, có thể cần enable model trong VS Code |
| Anthropic Extra Usage | Anthropic Extra Usage | Token-billed cho third-party harness, không trừ Claude plan limit |
| Image Input | Image Input | Ctrl+V, Alt+V (Windows), drag-drop, base64 attachment |
| External Editor | External Editor | Ctrl+G mở `externalEditor` → `$VISUAL` → `$EDITOR` → `notepad` (Win) → `nano` |
| Parallel vs Sequential tool execution | Parallel vs Sequential tool execution | Parallel (default) chạy concurrent, sequential chạy tuần tự theo order |
| `terminate: true` | `terminate: true` | Tool/blocked/overridden result gợi ý bỏ qua auto-follow-up LLM call |

---

## Context Files

| English term | Vietnamese (giải thích) | Source / Bối cảnh |
|---|---|---|
| `AGENTS.md` | `AGENTS.md` | File context instructions trong từng project directory (hoặc parent) |
| `CLAUDE.md` | `CLAUDE.md` | Alias cho AGENTS.md: Pi đọc cả hai names |
| `AGENTS.override.md` | `AGENTS.override.md` | Override file ở một directory cụ thể (thay thế AGENTS.md/CLAUDE.md ở đó) |
| `~/.pi/agent/AGENTS.md` | `~/.pi/agent/AGENTS.md` | Global context instructions cho mọi session |
| Parent-directory walk | Parent-directory walk | Pi đọc AGENTS.md/CLAUDE.md từ CWD đi lên tới root |
| Project Trust Decision | Project Trust Decision | Saved cho folder path trong `~/.pi/agent/trust.json` |

---

## Authentication & OAuth

| English term | Vietnamese (giải thích) | Source / Bối cảnh |
|---|---|---|
| `auth.json` | `auth.json` | Lưu OAuth tokens (auto-refresh) hoặc API keys per provider |
| `models-store.json` | `models-store.json` | Cached model catalogs từ Radius / openai-catalog refreshes |
| Subscription Provider | Subscription Provider | OAuth login: Claude Pro/Max, ChatGPT Plus/Pro Codex, GitHub Copilot, xAI, OpenRouter, Radius |
| ChatGPT Plus/Pro (Codex) | ChatGPT Plus/Pro (Codex) | Subscription với Codex CLI được OpenAI endorse |
| Claude Pro/Max | Claude Pro/Max | Subscription auth active, third-party harness dùng Extra Usage |
| GitHub Copilot | GitHub Copilot | Subscription OAuth: có thể cần enable model trong VS Code |
| xAI Subscription | xAI Subscription | Grok/X plan qua `/login xai` → "Use a subscription" |
| OpenRouter | OpenRouter | Mint user-controlled API key từ OpenRouter credits (no expiry auto) |
| Radius | Radius | Dynamic `pi-messages` gateway, OAuth tokens lưu trong auth.json |
| Anthropic Bedrock | Anthropic Bedrock | AWS Bedrock-hosted Claude qua bearer token |
| API Key Provider | API Key Provider | Auth qua env var hoặc `auth.json` (vd Anthropic, OpenAI) |
| `auth.json` key | `auth.json` key | Từng provider có key riêng trong auth.json (vd `anthropic`, `openai`) |
| PKCE Flow | PKCE Flow | OAuth flow cho provider như OpenRouter; paste URL/code trên headless |
| Extra Usage | Extra Usage | Token-billed cho third-party Anthropic harness |
| OAuth Token Refresh | OAuth Token Refresh | Auto-refresh khi expired (trừ OpenRouter minted API key) |

---

## pi-agent-core API

| English term | Vietnamese (giải thích) | Source / Bối cảnh |
|---|---|---|
| `Agent` class | `Agent` class | Stateful agent chính từ `@earendil-works/pi-agent-core` |
| `AgentState` | `AgentState` | State object chứa systemPrompt, model, messages |
| `AgentMessage` union | `AgentMessage` union | Bao gồm user/assistant/toolResult + custom qua declaration merging |
| `transformContext` | `transformContext` | Optional pre-LLM hook: prune messages, inject context |
| `convertToLlm` | `convertToLlm` | Required bridge: AgentMessage[] → LLM-compatible Message[] |
| `beforeToolCall` | `beforeToolCall` | Hook chạy sau tool_execution_start + argument parsing |
| `afterToolCall` | `afterToolCall` | Hook chạy sau tool xong, trước tool_execution_end |
| `finishTurn` | `finishTurn` | Hook quyết định kết thúc hoặc tiếp tục sau Turn |
| `subscribe(eventHandler)` | `subscribe(eventHandler)` | Agent method đăng ký event listener |
| `prompt(message)` | `prompt(message)` | Agent method gửi user message vào loop |
| `toolExecution` | `toolExecution` | Config parallel / sequential cho tool execution |
| `terminate: true` | `terminate: true` | Tool/blocked/overridden result hint skip auto-follow-up LLM call |
| `agent_start` / `agent_end` | `agent_start` / `agent_end` | Lifecycle events wrapping toàn bộ `prompt()` call |
| `turn_start` / `turn_end` | `turn_start` / `turn_end` | Per-turn events; turn_end mang `message` + `toolResults` |
| `message_start` / `message_update` / `message_end` | `message_start` / `message_update` / `message_end` | Per-message lifecycle; update có `partial` cho streaming |
| `tool_execution_start` / `_update` / `_end` | `tool_execution_start` / `_update` / `_end` | Per-tool-call lifecycle events |

---

## Extension API

| English term | Vietnamese (giải thích) | Source / Bối cảnh |
|---|---|---|
| `ExtensionAPI` | `ExtensionAPI` | Interface injection vào default factory function |
| `ExtensionContext` | `ExtensionContext` | Object truyền vào event handler: `ctx.ui`, `ctx.sessionInfo`... |
| `ExtensionCommandContext` | `ExtensionCommandContext` | Object truyền vào slash command handler |
| `pi.on(event, handler)` | `pi.on(event, handler)` | Đăng ký lifecycle/resource/session/agent/model/tool event |
| `pi.registerTool(def)` | `pi.registerTool(def)` | Đăng ký tool LLM có thể gọi |
| `pi.registerCommand(name, def)` | `pi.registerCommand(name, def)` | Đăng ký slash command |
| `pi.registerProvider(id, def)` | `pi.registerProvider(id, def)` | Đăng ký/override LLM provider |
| `pi.appendEntry(entry)` | `pi.appendEntry(entry)` | Ghi custom message vào session JSONL |
| `ctx.ui.notify(message, level)` | `ctx.ui.notify(message, level)` | Hiển thị toast/notification |
| `ctx.ui.confirm(title, message)` | `ctx.ui.confirm(title, message)` | Hỏi yes/no |
| `ctx.ui.input(options)` | `ctx.ui.input(options)` | Hỏi một giá trị input |
| `ctx.ui.select(options)` | `ctx.ui.select(options)` | Hiển thị fuzzy-search picker |
| `ctx.ui.custom(component)` | `ctx.ui.custom(component)` | Mount custom TUI component |
| Event interception | Event interception | Block hoặc modify tool call/result trong handler |

---

## TUI API

| English term | Vietnamese (giải thích) | Source / Bối cảnh |
|---|---|---|
| `TUI` | `TUI` | Root class cho terminal UI |
| `TuiMainScreen` | `TuiMainScreen` | Default regular-mode screen |
| `TuiAltScreen` | `TuiAltScreen` | Fullscreen-mode screen với scroll transcript region |
| `ProcessTerminal` | `ProcessTerminal` | Terminal abstraction (TTY detection, modes, capabilities) |
| `matchesKey(input, action)` | `matchesKey(input, action)` | Resolve keybinding id từ user input |
| `Component` interface | `Component` interface | Base TUI component contract |
| `Focusable` interface | `Focusable` interface | Component có thể nhận keyboard focus |
| `CURSOR_MARKER` | `CURSOR_MARKER` | Special marker char khi render hardware cursor position |
| `keyHint()` | `keyHint()` | Helper render keybinding hint trong editor footer |
| Differential Render | Differential Render | Chỉ vẽ lại diff giữa frame trước/sau, tiết kiệm redraw |
| Fuzzy Filter | Fuzzy Filter | Subsequence-match ranking cho `/model`, `/resume` pickers |
| `package.json` deps | `package.json` deps | Extensions pi-tui chỉ cần `get-east-asian-width` + `marked` |
| `marked` | `marked` | Markdown parser dùng trong pi-tui |
| `get-east-asian-width` | `get-east-asian-width` | East-Asian width detection cho terminal alignment |
| OSC 8 Hyperlink | OSC 8 Hyperlink | Terminal escape sequence cho clickable links (click mở default handler) |
| Kitty Keyboard Protocol | Kitty Keyboard Protocol | Báo cáo `super` modifier riêng: cần thiết cho Ctrl+Super+K |
| Bracketed Paste Mode | Bracketed Paste Mode | Terminal mode wrap pasted text giúp Pi phân biệt paste vs typed input |
| CSI 2026 Synchronized Output | CSI 2026 Synchronized Output | Suppress flicker bằng synchronized-output escape sequence |
| OSC 133 Semantic Prompt | OSC 133 Semantic Prompt | Markers cho input/output regions (semantic prompt) |
| Fullscreen Mode | Fullscreen Mode | `--tui-mode fullscreen`: alternate screen với scrollable transcript dock |

---

## pi-ai API

| English term | Vietnamese (giải thích) | Source / Bối cảnh |
|---|---|---|
| `Models` collection | `Models` collection | Registry chứa providers và models |
| `builtinModels()` | `builtinModels()` | Tạo Models từ built-in catalog |
| `createModels()` | `createModels()` | Tạo Models instance (factory) |
| `models.setProvider(provider)` | `models.setProvider(provider)` | Đăng ký provider vào collection |
| `models.getModel(provider, id)` | `models.getModel(provider, id)` | Lookup model theo (provider, id) |
| `models.streamSimple(...)` | `models.streamSimple(...)` | Convenience LLM stream entrypoint |
| `models.completeSimple(...)` | `models.completeSimple(...)` | Convenience non-streaming LLM call |
| `stream(model, ctx, opts)` | `stream(model, ctx, opts)` | Low-level streaming LLM call |
| `complete(model, ctx, opts)` | `complete(model, ctx, opts)` | Low-level non-streaming LLM call |
| `ProviderFactories` | `ProviderFactories` | Factory helpers cho built-in providers (vd `anthropicProvider()`) |
| `createProvider(def)` | `createProvider(def)` | Build provider object từ custom definition |
| `Type`, `Static`, `TSchema` | `Type`, `Static`, `TSchema` | Re-exports từ TypeBox (JSON Schema compatible) |
| `StringEnum` | `StringEnum` | Helper cho Google-compatible enum |
| `CompatConfig` | `CompatConfig` | Field `compat` trong models.json: supportsDeveloperRole, supportsReasoningEffort... |
| `compat.thinkingTokenBudgetField` | `compat.thinkingTokenBudgetField` | Field name tùy chỉnh cho thinking budget trên OpenAI-compat |
| `modelOverrides` | `modelOverrides` | Patch built-in provider's specific model |

---

## Packages

| English term | Vietnamese (giải thích) | Source / Bối cảnh |
|---|---|---|
| `@earendil-works/pi-coding-agent` | `@earendil-works/pi-coding-agent` | CLI product + Extension types |
| `@earendil-works/pi-agent-core` | `@earendil-works/pi-agent-core` | Stateful Agent engine, built on `@earendil-works/pi-ai` |
| `@earendil-works/pi-ai` | `@earendil-works/pi-ai` | Multi-provider LLM abstraction |
| `@earendil-works/pi-tui` | `@earendil-works/pi-tui` | Differential-rendering TUI library, decoupled từ Agent |
| `@earendil-works/pi-session-backend-sqlite-node` | `@earendil-works/pi-session-backend-sqlite-node` | SQLite session backend + `node:sqlite` adapter (separate package) |
| `@earendil-works/pi-orchestrator` | `@earendil-works/pi-orchestrator` | Experimental multi-agent orchestration (v0.80.x) |

---

## Maintenance

Glossary is a living document. When you spot a term that appears in dgzhuya.com, official pi.dev docs, or earendil-works/pi source but is not listed here, add a row. Keep entries short and factual; the "Vietnamese" column is for short explanations only. Do not invent new translations for the term itself.

When multiple sub-sections cover adjacent vocabulary (e.g. `AgentMessage` appears in both messages and agent-core API tables), prefer keeping it in the most-specific section and cross-reference the other by short phrase ("Also see: Core Pi Terms"). Do not duplicate verbatim.
