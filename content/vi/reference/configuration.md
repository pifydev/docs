---
title: Tham chiếu cấu hình
description: File setting, quy tắc merge, ranh giới trust, các nhóm setting và runtime override của Pi hiện tại.
translation_key: reference-configuration
language: vi
status: reviewed
reviewed_by: Pify maintainers
last_updated: '2026-08-25'
---

Pi đọc setting JSON khi khởi động và khi reload resource. Reference này mô tả `@earendil-works/pi-coding-agent` 0.84.3 trên Node.js 22.19 trở lên.

## File setting và thứ tự ưu tiên

### Vị trí file

| Path | Vai trò |
| --- | --- |
| `~/.pi/agent/settings.json` | Global setting cho mọi project |
| `<cwd>/.pi/settings.json` | Setting của project hiện tại, khi project được trust |
| `~/.pi/agent/trust.json` | Quyết định project trust đã lưu; đây không phải một settings layer |
| `<cwd>/.pi/SYSTEM.md`, `<cwd>/.pi/APPEND_SYSTEM.md` | Nguồn prompt của trusted project, không phải file setting |
| `AGENTS.md`, `CLAUDE.md` | Context file tìm từ chuỗi thư mục tổ tiên của working directory, không phải file setting |

Bạn có thể sửa trực tiếp file JSON hoặc dùng `/settings` cho các lựa chọn interactive thông dụng. `pi config` quản lý package resource nào được bật; nó không phải trình sửa mọi setting. Xem <a href="/vi/how-to/customize-system-prompt">Tùy chỉnh system prompt</a> để biết quy tắc ghép prompt file riêng.

### Merge và thứ tự ưu tiên CLI

Project setting override global setting theo cách đệ quy. Object lồng nhau merge theo key; array và scalar thay thế giá trị global. Sau đó, CLI argument chỉ override hành vi mà chính argument đó chỉ định trong process hiện tại. Ví dụ gồm `--model`, `--thinking`, `--models`, nhóm `--tools`, `--use-theme`, `--tui-mode`, `--session-dir` và các flag project trust.

:::note[Thứ tự ưu tiên phụ thuộc từng setting]

Không phải CLI flag nào cũng là một field trong `settings.json`. Chẳng hạn, session storage được resolve theo `--session-dir` → `PI_CODING_AGENT_SESSION_DIR` → `sessionDir` → mặc định. Flag resource tường minh thêm path ở runtime, còn `--no-extensions`, `--no-skills`, `--no-prompt-templates` và `--no-themes` tắt discovery của nhóm resource tương ứng.

:::

## Hình dạng setting hiện tại

Package root public export `SettingsManager` và một số setting type, không export full schema validator. Các nhóm JSON hiện tại là:

| Nhóm | Key |
| --- | --- |
| Model | `defaultProvider`, `defaultModel`, `defaultThinkingLevel`, `thinkingBudgets`, `enabledModels` |
| Tương tác | `steeringMode`, `followUpMode`, `defaultTools`, `doubleEscapeAction`, `treeFilterMode` |
| Hiển thị | `theme`, `tuiMode`, `fullscreenExitOutput`, `fullscreenScrollbar`, `terminal`, `images`, `markdown` |
| Vòng đời | `compaction`, `branchSummary`, `retry`, `sessionDir` |
| Network | `transport`, `httpProxy`, `httpIdleTimeoutMs`, `websocketConnectTimeoutMs` |
| Resource | `packages`, `extensions`, `skills`, `prompts`, `themes`, `enableSkillCommands` |

Host nên dùng public getter khi cần giá trị có hiệu lực. Ví dụ runnable dưới đây cố ý bỏ qua project setting. SDK dùng trực tiếp không đọc CLI trust store; host phải tự resolve trust rồi truyền `projectTrusted`.

```ts title="inspect-settings.ts"
import { getAgentDir, SettingsManager } from "@earendil-works/pi-coding-agent";

const settings = SettingsManager.create(process.cwd(), getAgentDir(), {
  projectTrusted: false,
});

console.log({
  model: [settings.getDefaultProvider(), settings.getDefaultModel()],
  thinking: settings.getDefaultThinkingLevel(),
  tools: settings.getDefaultTools(),
  compaction: settings.getCompactionSettings(),
  retry: settings.getRetrySettings(),
  diagnostics: settings.drainErrors().map(({ scope, error }) => ({
    scope,
    message: error.message,
  })),
});
```

## Model, thinking và tool

### Model và thinking

`defaultProvider` và `defaultModel` xác định model mặc định. `--model` được ưu tiên cho một lần chạy; session được resume có thể khôi phục model đã ghi khi không truyền model tường minh qua CLI. `defaultThinkingLevel` nhận `off`, `minimal`, `low`, `medium`, `high`, `xhigh` hoặc `max`. `thinkingBudgets` cung cấp token budget cho provider hoặc compatible model có hỗ trợ.

`hideThinkingBlock` ẩn thinking khỏi transcript. `showCacheMissNotices` hiện thông báo trong transcript cho prompt-cache miss đáng kể. Model vẫn quyết định thinking level và budget nào được hỗ trợ.

`enabledModels` cung cấp pattern cho thao tác chuyển model bằng Ctrl+P; `--models` override scope đó trong một lần chạy. Provider endpoint và credential không nằm trong object setting `providers`. Hãy đặt endpoint được hỗ trợ trong `~/.pi/agent/models.json` hoặc Provider configuration, đồng thời giữ credential trong authentication store hoặc environment được hỗ trợ. Xem <a href="/vi/how-to/plug-new-model">Thêm một nhà cung cấp mô hình</a>.

```json title="thinking-settings.json"
{
  "defaultProvider": "anthropic",
  "defaultModel": "claude-sonnet-4-6",
  "defaultThinkingLevel": "medium",
  "thinkingBudgets": {
    "minimal": 1024,
    "low": 4096,
    "medium": 10240,
    "high": 32768
  },
  "hideThinkingBlock": false,
  "showCacheMissNotices": true
}
```

### Chọn tool

`defaultTools` chọn built-in tool lúc khởi động. Khi bỏ qua setting này, `read`, `bash`, `edit` và `write` là các mặc định được bật; `grep`, `find` và `ls` cũng là built-in và có thể được chọn, tương tự native tool `powershell` tùy chọn trên Windows. Array rỗng bỏ các built-in mặc định nhưng vẫn để extension tool và SDK custom tool hoạt động.

`--tools` là allowlist nghiêm ngặt cho built-in, extension và custom tool. `--no-tools` tắt toàn bộ tool, `--no-builtin-tools` chỉ bỏ built-in, còn `--exclude-tools` lọc kết quả. Array ở project thay thế toàn bộ array global.

```json title="tool-settings.json"
{
  "defaultTools": ["read", "bash", "edit", "write"]
}
```

## Project trust

### Giá trị fallback và quyết định đã lưu

Project trust kiểm soát việc load `.pi/settings.json`, resource trong project `.pi`, project package và extension thực thi được. `defaultProjectTrust` chỉ dùng ở global: `ask` là mặc định, còn `always` hoặc `never` cung cấp fallback ở non-interactive mode. Interactive startup sẽ hỏi khi có project resource cần trust và chưa có quyết định phù hợp. `/trust` ghi quyết định vào `~/.pi/agent/trust.json`; hãy khởi động lại Pi để áp dụng cho project runtime hiện tại.

CLI resolve trust store trước khi tạo trusted runtime. `SettingsManager.create()` được SDK host gọi trực tiếp mặc định `projectTrusted` là `true` và không bao giờ đọc `trust.json`; host nhạy cảm về security nên truyền quyết định tường minh.

### Override cho một lần chạy

`--approve` (`-a`) trust file cục bộ của project trong một lần chạy. `--no-approve` (`-na`) bỏ qua chúng trong một lần chạy. Print, JSON và RPC mode không thể hiện trust prompt, nên chúng dùng quyết định đã lưu phù hợp, global fallback hoặc một trong hai flag này.

Project trust là ranh giới cho project resource, không phải per-tool approval. Setting hiện tại không có switch `yolo`, `permissions` hoặc `requiresPermission`. Hãy áp dụng chính sách duyệt hoặc chặn tool trong embedding host hay Extension `tool_call`.

## Compaction và retry

### Compaction và branch summary

| Setting | Mặc định | Tác dụng |
| --- | ---: | --- |
| `compaction.enabled` | `true` | Bật automatic compaction |
| `compaction.reserveTokens` | `16384` | Chừa context cho model response kế tiếp |
| `compaction.keepRecentTokens` | `20000` | Giữ số recent token này ngoài summary |
| `branchSummary.reserveTokens` | `16384` | Chừa token cho branch summarization |
| `branchSummary.skipPrompt` | `false` | Khi là `true`, bỏ câu hỏi branch summary và mặc định không tạo summary |

Hai setting cũ `compaction.threshold` theo tỉ lệ và `preserveRecentTurns` theo số turn không còn tồn tại. Compaction hiện dùng token reserve và recent-token budget.

### Retry và message delivery

`retry.enabled`, `maxRetries` (`3`) và `baseDelayMs` (`2000`) điều khiển agent-level retry. `retry.provider.timeoutMs`, `maxRetries` và `maxRetryDelayMs` (`60000`) điều khiển provider layer. Provider retry mặc định bằng 0 trong tích hợp Coding Agent; tăng ở cả hai layer có thể nhân số request và khiến failure xuất hiện chậm.

`steeringMode` và `followUpMode` nhận `one-at-a-time` (mặc định) hoặc `all`. `transport` nhận `auto`, `sse`, `websocket` hoặc `websocket-cached`. `httpIdleTimeoutMs` mặc định `300000`; `0` tắt HTTP idle timeout. `websocketConnectTimeoutMs` điều khiển opening handshake và cũng nhận `0` để tắt.

## Session, terminal và shell

### Session storage

`sessionDir` thay đổi nơi lưu persistent session. Relative path được resolve từ working directory của process, còn `~` được mở rộng thành home directory. Khi không có override, Pi lưu một file JSONL append-only cho mỗi session dưới `~/.pi/agent/sessions/<encoded-cwd>/`.

Không có setting tích hợp `sessions.retention` hoặc `sessions.redactSecrets`. Ứng dụng vận hành Pi chịu trách nhiệm về file permission, backup, retention và deletion; hãy bảo vệ session JSONL vì nó có thể chứa prompt, model output và tool result. Xem <a href="/vi/how-to/persist-sessions">Duy trì session</a>.

### Terminal, image, shell và npm

`terminal.showImages` (`true`) điều khiển inline display, `imageWidthCells` (`60`) đặt chiều rộng ưu tiên, `clearOnShrink` (`false`) xóa hàng không còn dùng, còn `showTerminalProgress` (`false`) phát progress indicator khi terminal hỗ trợ. `images.autoResize` (`true`) resize image gửi tới model về tối đa 2000 × 2000; `images.blockImages` (`false`) chặn mọi image gửi đến provider. Ẩn image trong terminal không chặn upload.

`shellPath` chọn shell, `shellCommandPrefix` thêm prefix vào mọi bash command, còn `npmCommand` là argv array cho package operation. Path Windows trong JSON cần dùng dấu gạch chéo xuôi hoặc escape dấu gạch chéo ngược.

```json title="terminal-and-shell-settings.json"
{
  "terminal": {
    "showImages": true,
    "imageWidthCells": 60,
    "clearOnShrink": false,
    "showTerminalProgress": false
  },
  "images": {
    "autoResize": true,
    "blockImages": false
  },
  "shellPath": "C:/Program Files/Git/bin/bash.exe",
  "shellCommandPrefix": "shopt -s expand_aliases",
  "npmCommand": ["mise", "exec", "node@22", "--", "npm"],
  "sessionDir": ".pi/sessions"
}
```

## Interface và output

### UI và display

`theme`, `externalEditor`, `quietStartup` và `collapseChangelog` điều khiển startup và cách trình bày. `externalEditor` override `VISUAL`, rồi `EDITOR`; dùng `code --wait` khi Pi cần chờ VS Code. `doubleEscapeAction` nhận `tree`, `fork` hoặc `none`, còn `treeFilterMode` chọn filter mặc định cho `/tree`.

`editorPaddingX` được clamp từ 0 đến 3, `outputPad` là 0 hoặc 1, còn `autocompleteMaxVisible` được clamp từ 3 đến 20. `showHardwareCursor` hỗ trợ nhập bằng IME. `tuiMode` nhận `regular` hoặc `fullscreen` đang thử nghiệm; các key flat liên quan là `fullscreenExitOutput` (`transcript` hoặc `resume-hint`) và `fullscreenScrollbar` (`auto`, `always` hoặc `hidden`). Hai shape lồng cũ `tui.*` và `fullscreen.*` không còn dùng. Thời gian chờ phím Escape là environment control được mô tả ở <a href="/vi/reference/environment-variables">Biến môi trường</a>.

### Markdown và warning

`markdown.codeBlockIndent` mặc định là hai dấu cách. `markdown.mermaid` nhận `off`, `final` hoặc `streaming` (mặc định). `warnings.anthropicExtraUsage` mặc định `true` và điều khiển cảnh báo extra usage của subscription.

## Network, telemetry và update

`httpProxy` áp dụng `HTTP_PROXY` và `HTTPS_PROXY` cho HTTP client do Pi quản lý và chỉ được đọc từ global setting. Đừng nhúng proxy credential vào project file. Stream timeout và transport setting đã được liệt kê ở phần retry và message delivery.

`enableInstallTelemetry` mặc định `true` cho version ping ẩn danh khi install/update. `enableAnalytics` là opt-in và mặc định `false`; Pi tạo `trackingId` khi opt-in. Các setting này không tắt update check. `collapseChangelog` thay đổi cách hiện changelog, còn `lastChangelogVersion` là state do Pi quản lý và không nên sửa bằng tay. Dùng `PI_SKIP_VERSION_CHECK` hoặc offline mode cho network policy; xem <a href="/vi/reference/environment-variables">Biến môi trường</a> để biết control chính xác.

## Resource, package và glob

### Danh sách resource và package filter

`extensions`, `skills`, `prompts` và `themes` chứa local path hoặc directory. Trong global setting, relative path được resolve từ `~/.pi/agent`; trong project setting, nó được resolve từ `.pi`. Các array này hỗ trợ glob, exclusion `!pattern`, force-include `+path` và force-exclude `-path`. `enableSkillCommands` điều khiển việc đăng ký thành `/skill:name` và mặc định `true`.

Dùng `packages` cho nguồn npm hoặc Git; đừng đặt package name vào `extensions`. Package entry dạng string tự load mọi resource. Dạng object có thể đặt `autoload: false` và lọc `extensions`, `skills`, `prompts` hoặc `themes`. Project resource và thao tác cài project package còn thiếu vẫn chịu project trust.

```json title="resource-settings.json"
{
  "packages": [
    "@org/pi-resources",
    {
      "source": "git:github.com/org/team-pi-resources",
      "autoload": false,
      "skills": ["review", "release"],
      "extensions": []
    }
  ],
  "extensions": ["./extensions/*.ts", "!./extensions/legacy.ts"],
  "skills": ["+./skills/release/SKILL.md", "!./skills/experimental/**"],
  "prompts": ["./prompts/*.md"],
  "themes": ["./themes/*.json"],
  "enableSkillCommands": true
}
```

## Ví dụ đầy đủ và project override

Global file này bao quát các nhóm thông dụng mà không chứa provider credential:

```json title="complete-settings.json"
{
  "defaultProvider": "anthropic",
  "defaultModel": "claude-sonnet-4-6",
  "defaultThinkingLevel": "medium",
  "thinkingBudgets": {
    "minimal": 1024,
    "low": 4096,
    "medium": 10240,
    "high": 32768
  },
  "hideThinkingBlock": false,
  "showCacheMissNotices": true,
  "enabledModels": ["anthropic/*", "openai/gpt-5.2*"],
  "defaultTools": ["read", "bash", "edit", "write"],
  "theme": "dark",
  "quietStartup": true,
  "tuiMode": "regular",
  "markdown": {
    "codeBlockIndent": "  ",
    "mermaid": "final"
  },
  "compaction": {
    "enabled": true,
    "reserveTokens": 16384,
    "keepRecentTokens": 20000
  },
  "branchSummary": {
    "reserveTokens": 16384,
    "skipPrompt": false
  },
  "retry": {
    "enabled": true,
    "maxRetries": 3,
    "baseDelayMs": 2000,
    "provider": {
      "maxRetries": 0,
      "maxRetryDelayMs": 60000
    }
  },
  "steeringMode": "one-at-a-time",
  "followUpMode": "one-at-a-time",
  "transport": "auto",
  "httpIdleTimeoutMs": 300000,
  "websocketConnectTimeoutMs": 15000,
  "sessionDir": ".pi/sessions",
  "terminal": {
    "showImages": true
  },
  "images": {
    "autoResize": true,
    "blockImages": false
  },
  "warnings": {
    "anthropicExtraUsage": true
  },
  "packages": ["@org/pi-resources"]
}
```

Với ví dụ merge, bắt đầu từ global file này:

```json title="settings-global.json"
{
  "theme": "dark",
  "compaction": {
    "enabled": true,
    "reserveTokens": 16384,
    "keepRecentTokens": 20000
  },
  "defaultTools": ["read", "bash", "edit", "write"]
}
```

Sau đó thêm trusted project override:

```json title=".pi/settings.json"
{
  "compaction": {
    "reserveTokens": 8192
  },
  "defaultTools": ["read"]
}
```

Kết quả giữ `theme`, `compaction.enabled` và `keepRecentTokens`, đổi `reserveTokens`, đồng thời thay toàn bộ array `defaultTools`.

## Kiểm tra và tiếp tục

Pi parse JSON và báo load failure dưới dạng settings warning. Pi không expose command `pi --dry-run` đã ngừng dùng, full-schema validator public hay setting `logPrompts`. Ở lần load đầu, scope lỗi không đóng góp setting; khi reload, `SettingsManager` giữ giá trị hợp lệ gần nhất của scope đó và expose lỗi qua `drainErrors()`. Unknown field không chứng minh config hợp lệ, vì vậy hãy kiểm tra giá trị có hiệu lực bằng public getter và chạy runtime path liên quan. Guide về system prompt trình bày các API inspect prompt hiện tại.

Sau khi sửa trong interactive session, dùng `/reload`; SDK host có thể `await settingsManager.reload()`. Tiếp theo, xem <a href="/vi/reference/api">API reference</a> hoặc <a href="/vi/reference/environment-variables">Biến môi trường</a>.
