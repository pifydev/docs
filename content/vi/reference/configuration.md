---
title: Configuration reference
description: File setting, quy tắc merge, project trust và các key cấu hình Pi thường dùng ở phiên bản hiện tại.
translation_key: reference-configuration
language: vi
status: reviewed
reviewed_by: Pify maintainers
last_updated: '2026-08-24'
---

Pi đọc JSON setting từ hai vị trí:

| Vị trí | Phạm vi |
|---|---|
| `~/.pi/agent/settings.json` | Global setting cho mọi project |
| `.pi/settings.json` | Override cho project hiện tại |

Giá trị project ghi đè giá trị global. Object lồng nhau được merge; array và scalar bị thay thế. Các CLI flag thông dụng tiếp tục ghi đè setting đã resolve trong process đó.

## Model và thinking

| Setting | Type | Mặc định | Mục đích |
|---|---|---|---|
| `defaultProvider` | string | chưa đặt | Provider ID mặc định |
| `defaultModel` | string | chưa đặt | Model ID mặc định |
| `defaultThinkingLevel` | string | chưa đặt | `off`, `minimal`, `low`, `medium`, `high`, `xhigh` hoặc `max` |
| `hideThinkingBlock` | boolean | `false` | Ẩn thinking block khỏi output được render |
| `thinkingBudgets` | object | theo provider | Token budget cho từng thinking level |

Chỉ các level được model đã chọn hỗ trợ mới có hiệu lực.

## UI và terminal

| Setting | Type | Mặc định | Mục đích |
|---|---|---|---|
| `theme` | string | `dark` | Tên theme tích hợp hoặc custom |
| `externalEditor` | string | theo platform | Command được mở bởi thao tác external editor |
| `quietStartup` | boolean | `false` | Ẩn startup header |
| `tuiMode` | string | `regular` | `regular` hoặc `fullscreen` đang thử nghiệm |
| `fullscreenExitOutput` | string | `transcript` | Output khi thoát fullscreen mode |
| `fullscreenScrollbar` | string | `auto` | `auto`, `always` hoặc `hidden` |
| `terminal.showImages` | boolean | `true` | Render image khi terminal hỗ trợ |
| `images.autoResize` | boolean | `true` | Resize image về tối đa 2000 × 2000 |
| `images.blockImages` | boolean | `false` | Không cho gửi image tới model |

Với VS Code, đặt `externalEditor` thành `"code --wait"` để Pi chờ editor process.

## Compaction và retry

| Setting | Type | Mặc định | Mục đích |
|---|---|---|---|
| `compaction.enabled` | boolean | `true` | Bật automatic compaction |
| `compaction.reserveTokens` | number | `16384` | Chừa context cho response tiếp theo |
| `compaction.keepRecentTokens` | number | `20000` | Giữ số recent token này ngoài summary |
| `branchSummary.reserveTokens` | number | `16384` | Chừa token khi tóm tắt branch đã rời |
| `retry.enabled` | boolean | `true` | Retry transient failure ở agent layer |
| `retry.maxRetries` | number | `3` | Số agent-level retry tối đa |
| `retry.baseDelayMs` | number | `2000` | Delay ban đầu của exponential backoff |
| `retry.provider.maxRetries` | number | `0` | Số retry ở provider layer |

Nên giữ provider retry bằng `0` trừ khi tích hợp thực sự cần. Kết hợp provider retry với agent retry có thể nhân số request và làm lỗi hiển thị chậm hơn.

## Delivery và transport

| Setting | Type | Mặc định | Mục đích |
|---|---|---|---|
| `steeringMode` | string | `one-at-a-time` | Gửi steering message trong queue từng message hoặc cùng lúc |
| `followUpMode` | string | `one-at-a-time` | Gửi follow-up message từng message hoặc cùng lúc |
| `transport` | string | `auto` | `sse`, `websocket`, `websocket-cached` hoặc tự chọn |
| `httpIdleTimeoutMs` | number | `300000` | HTTP stream idle timeout; `0` để tắt |
| `websocketConnectTimeoutMs` | number | `15000` | WebSocket connection timeout; `0` để tắt |

## Tool và shell

| Setting | Type | Mặc định | Mục đích |
|---|---|---|---|
| `defaultTools` | string[] | built-in chuẩn | Bộ built-in tool ban đầu |
| `shellPath` | string | shell theo platform | Shell executable tùy chỉnh |
| `shellCommandPrefix` | string | chưa đặt | Prefix áp dụng cho mỗi bash command |
| `npmCommand` | string[] | npm | Argument vector dùng cho package operation |

Array `defaultTools` rỗng sẽ tắt built-in mặc định nhưng không tắt custom tool từ extension hoặc SDK. `--tools` là allowlist nghiêm ngặt; `--no-tools` tắt mọi tool.

Path Windows trong JSON phải dùng dấu gạch chéo xuôi hoặc escape dấu gạch chéo ngược:

```json
{
  "shellPath": "C:/Program Files/Git/bin/bash.exe"
}
```

## Session và resource

| Setting | Type | Mặc định | Mục đích |
|---|---|---|---|
| `sessionDir` | string | session directory của Pi | Directory riêng cho persistent session |
| `enabledModels` | string[] | chưa đặt | Model pattern dùng khi chuyển model |
| `packages` | array | `[]` | npm hoặc Git package cung cấp resource |
| `extensions` | string[] | `[]` | File hoặc directory extension cục bộ |
| `skills` | string[] | `[]` | File hoặc directory skill cục bộ |
| `prompts` | string[] | `[]` | File hoặc directory prompt template cục bộ |
| `themes` | string[] | `[]` | File hoặc directory theme cục bộ |
| `enableSkillCommands` | boolean | `true` | Đăng ký skill đã discover thành slash command |

Path trong global setting được resolve từ `~/.pi/agent`; project path được resolve từ `.pi`. Resource array hỗ trợ glob pattern, exclusion và entry include/exclude tường minh.

## Project trust

`defaultProjectTrust` là setting chỉ dùng ở global với giá trị `ask`, `always` hoặc `never`; mặc định là `ask`. Project trust kiểm soát project-local setting và resource có thể thực thi như extension. Quyết định đã lưu nằm trong `~/.pi/agent/trust.json`.

Chế độ non-interactive không thể hiện trust prompt. Hãy dùng quyết định đã lưu, cấu hình global fallback hoặc truyền `--approve` / `--no-approve` cho một lần chạy.

## Ví dụ

```json title="~/.pi/agent/settings.json"
{
  "defaultProvider": "anthropic",
  "defaultModel": "claude-sonnet-4-6",
  "defaultThinkingLevel": "medium",
  "theme": "dark",
  "compaction": {
    "enabled": true,
    "reserveTokens": 16384,
    "keepRecentTokens": 20000
  },
  "retry": {
    "enabled": true,
    "maxRetries": 3
  },
  "defaultTools": ["read", "bash", "edit", "write"],
  "packages": ["@org/pi-resources"]
}
```
