---
title: Environment variables reference
description: Process configuration, child-process marker, session metadata, credential và proxy variable được Pi sử dụng.
translation_key: reference-environment-variables
language: vi
status: reviewed
reviewed_by: Pify maintainers
last_updated: '2026-08-24'
---

Pi đọc các variable dùng để cấu hình process và inject một nhóm riêng vào command được chạy qua built-in bash tool. Provider credential variable phụ thuộc vào provider đã chọn.

## Cấu hình process

| Variable | Mục đích |
|---|---|
| `PI_CODING_AGENT_DIR` | Ghi đè config directory; mặc định `~/.pi/agent` |
| `PI_CODING_AGENT_SESSION_DIR` | Ghi đè nơi lưu persistent session; `--session-dir` có độ ưu tiên cao hơn |
| `PI_PACKAGE_DIR` | Ghi đè package directory, bao gồm vị trí chỉ đọc của Nix/Guix |
| `PI_OFFLINE` | Tắt network operation khi khởi động, bao gồm update và telemetry |
| `PI_SKIP_VERSION_CHECK` | Chỉ tắt request kiểm tra phiên bản mới nhất |
| `PI_TELEMETRY` | Ép bật hoặc tắt telemetry bằng `1`/`true`/`yes` hoặc `0`/`false`/`no` |
| `PI_CACHE_RETENTION` | Đặt `long` để yêu cầu prompt caching dài hơn khi provider hỗ trợ |
| `PI_SHARE_VIEWER_URL` | Ghi đè base URL được `/share` sử dụng |
| `PI_HARDWARE_CURSOR` | Đặt `1` để hiện hardware cursor trong TUI |
| `PI_TUI_ESC_TIMEOUT` | Delay phân biệt phím ESC theo mili giây; mặc định 100 qua SSH và 10 trong trường hợp khác |
| `VISUAL`, `EDITOR` | External-editor fallback khi chưa đặt `externalEditor` |
| `HTTP_PROXY`, `HTTPS_PROXY` | Proxy cho outbound HTTP request |

Boolean variable của Pi là configuration flag, không phải chuỗi bất kỳ khác rỗng. Hãy dùng đúng các giá trị được chấp nhận ở trên.

## Process marker

CLI và RPC entry point đặt các variable sau cho child process:

| Variable | Giá trị | Mục đích |
|---|---|---|
| `AI_AGENT` | `pi` | Marker chung xác định agent đã khởi chạy process |
| `PI_CODING_AGENT` | `true` | Process marker riêng của Pi |

Các marker này không gắn với session cụ thể và không được tự động đặt khi Pi được nhúng qua SDK.

## Session metadata trong bash tool

Command do LLM-callable bash tool của Pi thực thi nhận state hiện tại của session:

| Variable | Mục đích |
|---|---|
| `PI_SESSION_ID` | Session ID hiện tại |
| `PI_SESSION_FILE` | Absolute path đến file JSONL; không được đặt với ephemeral session |
| `PI_PROVIDER` | Pi provider ID đang chọn |
| `PI_MODEL` | Pi model ID đang chọn |
| `PI_REASONING_LEVEL` | Reasoning level thực tế |

Giá trị được resolve khi mỗi command bắt đầu, vì vậy thay model hoặc reasoning level sẽ tác động đến command tiếp theo.

```bash
printf '%s/%s\n' "$PI_PROVIDER" "$PI_MODEL"
printf 'reasoning=%s session=%s\n' "$PI_REASONING_LEVEL" "$PI_SESSION_ID"
```

Các variable này không được inject vào command `!` hoặc `!!` do người dùng nhập trực tiếp. Custom tool được tạo bằng `createBashTool()` expose chúng theo mặc định; đặt `exposeSessionEnvironment: false` để loại bỏ.

## Provider credential

Các built-in provider thường đọc những variable như:

| Variable | Provider hoặc runtime |
|---|---|
| `ANTHROPIC_API_KEY` | Anthropic |
| `OPENAI_API_KEY` | Authentication tương thích OpenAI |
| `GEMINI_API_KEY` hoặc `GOOGLE_API_KEY` | Google Generative AI |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN`, `AWS_REGION` | Amazon Bedrock qua AWS credential chain |
| `AZURE_OPENAI_API_KEY` | Cấu hình Azure OpenAI dùng API-key authentication |

Bảng này không phải model catalog: credential source được hỗ trợ khác nhau theo provider và có thể gồm stored OAuth credential, cloud SDK configuration cùng cơ chế resolve do extension định nghĩa.

Custom provider configuration có thể tham chiếu `$ENV_VAR` hoặc `${ENV_VAR}` trong `apiKey` và giá trị header:

```ts
pi.registerProvider("company", {
  baseUrl: "https://gateway.example.com/v1",
  apiKey: "$COMPANY_AI_TOKEN",
  api: "openai-completions",
  models: [],
});
```

Không đưa secret vào `settings.json`, mã nguồn extension, log hoặc session transcript. Ưu tiên credential store của Pi hoặc inject environment từ secret manager.

## Lưu ý về độ ưu tiên

- Session directory: `--session-dir` → `PI_CODING_AGENT_SESSION_DIR` → setting `sessionDir` → mặc định.
- External editor: setting `externalEditor` → `VISUAL` → `EDITOR` → fallback theo platform.
- Offline mode rộng hơn `PI_SKIP_VERSION_CHECK`: nó tắt mọi startup network operation được hỗ trợ.
