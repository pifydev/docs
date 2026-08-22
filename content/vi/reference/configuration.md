---
title: Configuration reference
description: 'Các thiết lập Pi đọc từ settings.json, file project, và CLI flags.'
translation_key: reference-configuration
language: vi
---
Các thiết lập Pi đọc khi khởi động. Hầu hết nằm trong `settings.json` dưới thư mục Pi home; một số có thể được ghi đè theo project hoặc theo CLI.

:::note[Resolution order]
CLI flags > `settings.json` (project) > `settings.json` (global) > defaults. Thiết lập theo project nằm trong `./.pi/settings.json`.
:::

## File locations

| Path | Scope |
|---|---|
| `~/.pi/settings.json` | Global defaults, áp dụng cho mọi project |
| `./.pi/settings.json` | Project overrides, áp dụng khi cwd ở đây hoặc bên dưới |
| `./SYSTEM.md` | Phần bắt buộc thêm vào system prompt |
| `./AGENTS.md` | Hướng dẫn mềm cho system prompt |

## Schema

```ts title="settings.json (TypeScript shape)"
interface Settings {
  model?: { provider: string; id: string };
  yolo?: boolean;
  logPrompts?: boolean;
  defaultTools?: string[];
  fullscreen?: {
    mode?: "auto" | "always" | "hidden";
    onExit?: "transcript" | "resume-hint";
  };
  tui?: {
    theme?: string;
    escapeTimeout?: number; // ms
  };
  compaction?: {
    threshold?: number; // 0..1, tỉ lệ context window
    preserveRecentTurns?: number;
  };
  sessions?: {
    retention?: "1d" | "7d" | "30d" | "forever";
    redactSecrets?: boolean;
  };
  providers?: {
    [provider: string]: {
      baseUrl?: string;
      apiKeyEnvVar?: string;
    };
  };
  extensions?: string[]; // đường dẫn hoặc tên npm package
}
```

## Models

### `model`

Default model cho session mới. Định dạng: `{ provider, id }`.

```json title="settings.json"
{
  "model": { "provider": "anthropic", "id": "claude-sonnet-4-5" }
}
```

Override theo session sẽ được ưu tiên khi một session được resume bằng `--session <id>`.

### `defaultTools`

Tên các built-in tool được bật khi khởi động. Mặc định `["read", "bash", "edit", "write"]`.

```json title="settings.json"
{
  "defaultTools": ["read", "bash", "edit"]
}
```

Đặt một mảng rỗng sẽ tắt tất cả managed tools.

## Permissions

### `yolo`

Nếu `true`, bỏ qua permission prompt trước khi gọi bất kỳ tool nào có `requiresPermission: true`.

```json title="settings.json"
{ "yolo": true }
```

:::caution
YOLO mode cho phép agent ghi file và chạy shell command mà không hỏi. Chỉ dùng trong sandbox có thể vứt bỏ.
:::

### Per-tool overrides

Để cho phép một tool cụ thể chạy không hỏi trong khi các tool khác vẫn hỏi, hãy đặt `requiresPermission: false` trên định nghĩa extension tool thay vì bật global `yolo`.

## Compaction

### `compaction.threshold`

Tỉ lệ context window của model kích hoạt automatic compaction. Mặc định `0.85`.

### `compaction.preserveRecentTurns`

Số turn gần nhất được giữ nguyên văn trong quá trình compaction. Phần còn lại được tóm tắt. Mặc định `3`.

## Sessions

### `sessions.retention`

Thời gian giữ session file. Pi quét thư mục sessions khi khởi động.

| Value | Effect |
|---|---|
| `"1d"` | Xoá sau một ngày |
| `"7d"` | Xoá sau một tuần (mặc định) |
| `"30d"` | Xoá sau ba mươi ngày |
| `"forever"` | Không bao giờ tự động xoá |

### `sessions.redactSecrets`

Nếu `true`, hook `redact` mặc định quét output `tool_result` tìm chuỗi trông giống API key và thay bằng `[redacted]`. Có thể đặt logic redact tuỳ biến theo session qua `Session({ redact })`.

## TUI

### `tui.theme`

Tên theme áp dụng khi khởi động. Dùng `/settings` trong TUI để duyệt.

### `tui.escapeTimeout`

Số mili giây chờ phím Escape được theo sau bởi một phím khác (cho `Alt+Enter`, arrow keys, v.v.). Mặc định `50`. Tăng lên khi SSH có độ trễ cao.

## Providers

### `providers[provider].baseUrl`

Ghi đè base URL cho một provider. Hữu ích cho self-hosted gateway hoặc llama.cpp server local.

```json title="settings.json"
{
  "providers": {
    "openai": { "baseUrl": "http://localhost:8080/v1" }
  }
}
```

### `providers[provider].apiKeyEnvVar`

Ghi đè tên biến môi trường mà SDK đọc cho API key. Mặc định là `<PROVIDER>_API_KEY`.

## Extensions

### `extensions`

Danh sách extension cần load khi khởi động. Mỗi mục là một đường dẫn tới file local hoặc tên npm package.

```json title="settings.json"
{ "extensions": ["@pi-extensions/git", "./extensions/team-roles.ts"] }
```

Đường dẫn tương đối được phân giải từ project root.

## Validation

Pi xác thực `settings.json` theo schema mỗi lần load. Giá trị không hợp lệ fail-fast với thông báo lỗi chính xác nêu tên field. Để kiểm thử file config trước khi commit:

```bash
pi --dry-run
```

Flag `--dry-run` load settings và in cấu hình đã được phân giải mà không khởi động agent.

## Tiếp theo

- [Reference: API](api.md) để xem runtime API.
- [Reference: Environment Variables](environment-variables.md) để xem các env var override.
