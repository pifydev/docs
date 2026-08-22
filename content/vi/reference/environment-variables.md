---
title: Environment variables reference
description: Mọi environment variable Pi đọc khi chạy.
translation_key: reference-environment-variables
language: vi
---
Pi đọc environment variable cho API key, runtime flag, và process marker. Trang này liệt kê mọi biến mà SDK chạm vào.

:::note[How Pi reads these]
API key của provider được đọc vào lúc gửi một request, không phải khi khởi động. Điều này có nghĩa xoay vòng key (ví dụ sau `pi auth print-api-key`) có hiệu lực ở turn kế tiếp mà không cần khởi động lại agent.
:::

## Provider API keys

| Variable | Provider |
|---|---|
| `ANTHROPIC_API_KEY` | Anthropic |
| `OPENAI_API_KEY` | OpenAI |
| `GOOGLE_API_KEY` | Google Generative AI |
| `GEMINI_API_KEY` | Google Generative AI (thay thế) |
| `GOOGLE_VERTEX_API_KEY` | Google Vertex AI |
| `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY` | Amazon Bedrock |
| `BASETEN_API_KEY` | Baseten |
| `OPENROUTER_API_KEY` | OpenRouter |
| `AZURE_OPENAI_API_KEY` + `AZURE_OPENAI_ENDPOINT` | Azure OpenAI |
| `GITHUB_TOKEN` | GitHub Copilot |

Với self-hosted provider, tên biến là bất cứ gì được cấu hình trong `providers[provider].apiKeyEnvVar` trong [settings.json](configuration.md#providers).

## Runtime flags

### `PI_HOME`

Ghi đè thư mục Pi home. Mặc định `~/.pi`. Pi tìm `settings.json`, `skills/`, `extensions/`, và `sessions/` dưới đường dẫn này.

```bash
PI_HOME=/var/lib/pi pi
```

### `PI_TUI_ESC_TIMEOUT`

Số mili giây chờ giữa phím Escape và phím tiếp theo, dùng để phân biệt `Alt+Enter` với một Escape đơn trong TUI. Tăng lên khi SSH có độ trễ cao.

```bash
PI_TUI_ESC_TIMEOUT=200 pi
```

Mặc định `50`.

### `PI_CODING_AGENT`

Tự động được đặt thành `true` khi `@pi-coding-agent` sinh một tiến trình con. Sub-agent và extension đọc biến này để phát hiện chúng đang chạy bên trong coding agent và điều chỉnh hành vi cho phù hợp.

### `AI_AGENT`

Tự động được đặt thành `pi` khi bất kỳ tiến trình Pi nào sinh một tiến trình con. Được dùng bởi dịch vụ bên ngoài và bởi agent khác để phát hiện "công việc này đang được thực hiện bởi Pi". Chỉ đọc từ phía Pi.

### `PI_EXPERIMENTAL`

Đặt thành `1` để bật các tính năng thử nghiệm. Tính đến v0.84, tính năng thử nghiệm duy nhất là strict JSON-schema constrained sampling cho các managed tool `read`, `bash`, `edit`, và `write`.

```bash
PI_EXPERIMENTAL=1 pi
```

Tính năng thử nghiệm có thể thay đổi hình thức giữa các bản minor.

### `PI_LOG_LEVEL`

Mức chi tiết của log. Một trong `silent`, `error`, `warn`, `info`, `debug`. Mặc định `info`. CLI cũng nhận `--log-prompts` để log composed system prompt ở mỗi turn bất kể level.

## Proxy variables

Pi tôn trọng các biến proxy chuẩn khi được đặt:

| Variable | Effect |
|---|---|
| `HTTP_PROXY` | HTTP proxy cho non-TLS request |
| `HTTPS_PROXY` | HTTP proxy cho TLS request |
| `NO_PROXY` | Danh sách host phân tách bởi dấu phẩy để bypass proxy |
| `SSL_CERT_FILE` | Đường dẫn tới CA bundle để verify TLS |

Provider HTTP client trong `@pi-ai/core` đọc trực tiếp từ `process.env`.

## Provider-specific

### `OPENAI_ORG_ID`

Đặt header `OpenAI-Organization` trên mọi request OpenAI. Hữu ích khi chạy với nhiều organization.

### `ANTHROPIC_BASE_URL`

Ghi đè Anthropic base URL. Tương đương `providers.anthropic.baseUrl` trong settings.

### `GOOGLE_APPLICATION_CREDENTIALS`

Đường dẫn tới file JSON service-account Google cho Vertex AI authentication. Quy ước chuẩn của Google; Pi đọc cho Vertex nhưng không thông dịch.

### `CLOUDFLARE_AI_GATEWAY_ACCOUNT_ID` + `CLOUDFLARE_AI_GATEWAY_TOKEN`

Bắt buộc để route qua Cloudflare AI Gateway. Đặt trong `providers[provider].baseUrl` nếu bạn cũng dùng gateway.

## Process markers

Pi đặt các biến sau trên mỗi tiến trình con được sinh ra:

- `AI_AGENT=pi` — marker agent chung, được đọc bởi công cụ bên ngoài
- `PI_CODING_AGENT=true` — thêm khi tiến trình con chính là coding agent
- `PI_PARENT_SESSION=<session-id>` — khi tiến trình con được sinh từ một session

Tiến trình con có thể tuỳ ý đọc các biến này hoặc bỏ qua. Đọc `PI_PARENT_SESSION` cho phép một sub-agent ghi lại nguồn gốc của nó trong metadata của bất kỳ session nào nó tạo.

## Pitfalls

**Nhiều key cho cùng một provider**

Pi dùng biến khớp đầu tiên theo thứ tự liệt kê ở trên. Nếu cả `GOOGLE_API_KEY` và `GEMINI_API_KEY` đều được đặt, `GOOGLE_API_KEY` thắng.

**YOLO mode vs. `PI_EXPERIMENTAL`**

Chúng độc lập. YOLO là thiết lập permission; `PI_EXPERIMENTAL` bật các tính năng cụ thể. Có thể bật cùng lúc.

**Đặt `PI_HOME` tới thư mục không tồn tại**

Pi không tự tạo thư mục home. Nó sẽ fail ở thao tác đầu tiên cố ghi một session. Hãy tạo thư mục trước:

```bash
mkdir -p "$PI_HOME" && pi
```

## Tiếp theo

- [Reference: Configuration](configuration.md) để xem bề mặt settings.json.
- [Reference: API](api.md) để xem runtime API.
