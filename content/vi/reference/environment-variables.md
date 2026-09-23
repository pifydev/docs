---
title: Tham chiếu biến môi trường
description: Process flag, provider credential, child marker, session metadata và proxy variable được Pi sử dụng.
translation_key: reference-environment-variables
language: vi
official_refs:
  - 'https://github.com/earendil-works/pi/blob/f07218c4d4bbc12bef056a7058c3dd49dfe41abe/packages/coding-agent/docs/environment-variables.md'
  - 'https://github.com/earendil-works/pi/blob/f07218c4d4bbc12bef056a7058c3dd49dfe41abe/packages/coding-agent/docs/providers.md'
status: reviewed
reviewed_by: Pify maintainers
last_updated: '2026-09-23'
---

Pi dùng environment variable ở ba nơi riêng biệt: cấu hình process của chính Pi, authentication cho provider đã chọn và environment của command do các LLM-callable tool `bash` và `powershell` khởi chạy. Scope rất quan trọng: một variable được một provider nhận diện không tự động trở thành setting dùng trên toàn Pi.

:::note[Thời điểm đọc giá trị]

Phần lớn process flag có hiệu lực khi khởi động. Provider authentication được resolve khi Pi yêu cầu credential cho provider đã chọn. Thay đổi shell variable chỉ ảnh hưởng request sau nếu stored credential trong `auth.json` và configured `apiKey` trong `models.json` đều không được ưu tiên cho provider đó. Shell-tool metadata được tạo lại cho từng tool command.

:::

## Provider credential

Với built-in provider của Pi, thứ tự credential là CLI `--api-key` hoặc runtime override tường minh, API key hoặc OAuth credential khớp được lưu trong `auth.json`, `apiKey` đã cấu hình trong `models.json` (literal hoặc tham chiếu `$ENV` theo contract của file này), rồi ambient environment của built-in provider. Provider do extension định nghĩa có thể triển khai contract khác. Hãy dùng `/login` để ghi vào credential store được bảo vệ thay vì đưa secret vào file của project.

| Provider | Environment credential được 0.87.1 nhận diện |
|---|---|
| Anthropic | `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_OAUTH_TOKEN`, `ANTHROPIC_API_KEY` |
| Ant Ling, OpenAI, Azure OpenAI | `ANT_LING_API_KEY`, `OPENAI_API_KEY`, `AZURE_OPENAI_API_KEY` |
| DeepSeek, NVIDIA NIM, Gemini | `DEEPSEEK_API_KEY`, `NVIDIA_API_KEY`, `GEMINI_API_KEY` |
| Mistral, Groq, Cerebras | `MISTRAL_API_KEY`, `GROQ_API_KEY`, `CEREBRAS_API_KEY` |
| xAI, OpenRouter, Vercel AI Gateway | `XAI_API_KEY`, `OPENROUTER_API_KEY`, `AI_GATEWAY_API_KEY` |
| ZAI Global và China | `ZAI_API_KEY`, `ZAI_CODING_CN_API_KEY` |
| OpenCode Zen và Go | `OPENCODE_API_KEY` |
| Radius, Hugging Face | `RADIUS_API_KEY`, `HF_TOKEN` |
| Fireworks, Together AI, Baseten | `FIREWORKS_API_KEY`, `TOGETHER_API_KEY`, `BASETEN_API_KEY` |
| Kimi, Meta Muse, MiniMax, MiniMax China, Moonshot | `KIMI_API_KEY`, `META_API_KEY`, `MINIMAX_API_KEY`, `MINIMAX_CN_API_KEY`, `MOONSHOT_API_KEY` |
| Qwen Token Plan | `QWEN_TOKEN_PLAN_API_KEY`, `QWEN_TOKEN_PLAN_CN_API_KEY` |
| Xiaomi MiMo và các region token-plan | `XIAOMI_API_KEY`, `XIAOMI_TOKEN_PLAN_CN_API_KEY`, `XIAOMI_TOKEN_PLAN_AMS_API_KEY`, `XIAOMI_TOKEN_PLAN_SGP_API_KEY` |
| GitHub Copilot | `COPILOT_GITHUB_TOKEN` |
| Cloudflare AI Gateway và Workers AI | `CLOUDFLARE_API_KEY`; các ID được trình bày bên dưới |

Các catalog entry chọn lọc dưới đây phân biệt direct API-key route với subscription authentication. Cột credential đặt tên cho route, không phải giá trị cần sao chép vào environment variable:

| Model | Provider route | Credential path |
|---|---|---|
| `Claude Opus 5.5` | `anthropic` | `ANTHROPIC_API_KEY` |
| `GPT-6 Sol` | `openai` | `OPENAI_API_KEY` |
| `GPT-6 Luna` | `openai` | `OPENAI_API_KEY` |
| `GPT-6 Sol` | `openai-codex` | `OpenAI Codex subscription` |
| `GPT-6 Luna` | `openai-codex` | `OpenAI Codex subscription` |
| `Claude Opus 5.5` | `github-copilot` | `GitHub Copilot subscription` |
| `GPT-6 Sol` | `github-copilot` | `GitHub Copilot subscription` |
| `GPT-6 Luna` | `github-copilot` | `GitHub Copilot subscription` |
| `Grok 4.7` | `xai` | `XAI_API_KEY` |

Hai Claude route hiện dùng ID khác nhau: Anthropic dùng `claude-opus-5-5`, còn GitHub Copilot dùng `claude-opus-5.5`. Dùng `/login` cho subscription route và giữ environment variable cho các direct-key route ở trên.

Amazon Bedrock và Google Vertex AI còn nhận ambient cloud credential được mô tả trong phần variable riêng cho provider. Custom provider trong `models.json` có thể tham chiếu variable bất kỳ bằng `"apiKey": "$COMPANY_AI_TOKEN"`; chuỗi chỉ gồm chữ hoa là literal, không phải environment lookup. Xem <a href="/vi/how-to/plug-new-model">Thêm một nhà cung cấp mô hình</a> để biết surface chính xác của file này.

Meta Muse hỗ trợ `/login meta`; flow này lưu login credential và tự động refresh Muse Model API key. `META_API_KEY` cung cấp trực tiếp Model API key đó khi interactive login không phù hợp. Hai đường có contract riêng: environment value đã là request credential và không tạo stored Meta login.

| Đường xác thực Meta | Ranh giới credential |
|---|---|
| `/login meta` | `stored login → automatic Muse Model API key refresh` |
| `META_API_KEY` | `direct Muse Model API key → no stored login` |

## Runtime flag

### Directory và runtime asset

| Variable | Mục đích chính xác |
|---|---|
| `PI_CODING_AGENT_DIR` | Agent config directory; mặc định `~/.pi/agent` |
| `PI_CODING_AGENT_SESSION_DIR` | Persistent session directory; đứng dưới `--session-dir` và trên setting `sessionDir` trong thứ tự ưu tiên của CLI |
| `PI_PACKAGE_DIR` | Packaged asset directory, hữu ích với bản cài đặt Nix hoặc Guix chỉ đọc |

`PI_CODING_AGENT_DIR` thay thế switch home-directory rộng trước đây; nó nhắm đến agent configuration của Pi, không phải home directory của hệ điều hành. Lời gọi SDK trực tiếp dùng path được truyền vào constructor và không tự động tái hiện mọi quy tắc ưu tiên của CLI.

```bash title="Khởi động Pi với runtime directory tường minh"
export PI_CODING_AGENT_DIR=/srv/pi/agent
export PI_CODING_AGENT_SESSION_DIR=/srv/pi/sessions
export PI_PACKAGE_DIR=/nix/store/example-pi
pi
```

### Switch offline, version và telemetry

| Variable | Giá trị được chấp nhận và tác dụng |
|---|---|
| `PI_OFFLINE` | `1`, `true` hoặc `yes` tắt startup và model-catalog network work được hỗ trợ, gồm version/package check, install/update telemetry và `/bug` upload |
| `PI_SKIP_VERSION_CHECK` | Đặt thành `1` để chỉ bỏ qua request lấy phiên bản mới nhất |
| `PI_TELEMETRY` | `1`/`true`/`yes` bật install/update telemetry và Pi provider-attribution header; `0`/`false`/`no` tắt chúng |

Hãy dùng `--offline` hoặc giá trị truthy được hỗ trợ cho `PI_OFFLINE`. Muốn bật lại network work, hãy unset variable: một số downstream path chỉ kiểm tra `PI_OFFLINE` có tồn tại hay không, vì vậy `PI_OFFLINE=0` không an toàn và có thể vẫn hoạt động như offline. Offline mode chặn Radius upload từ `/bug` nhưng vẫn cho xuất ZIP local. `PI_SKIP_VERSION_CHECK` có scope hẹp hơn offline mode. Đừng dựa vào cách viết không được tài liệu hóa cho `PI_TELEMETRY`.

### Hành vi terminal và editor

`PI_HARDWARE_CURSOR=1` làm hardware cursor của TUI hiện ra. `PI_TUI_ESC_TIMEOUT` nhận số mili giây hữu hạn dương để phân biệt một phím Escape đơn với Alt-key sequence bị chia nhỏ; mặc định là 100 ms khi có `SSH_CONNECTION` hoặc `SSH_TTY`, và 10 ms trong trường hợp khác.

Pi tự động phát hiện OSC 8 hyperlink, inline image protocol và truecolor. Pi 0.87.1 cung cấp chính xác các advanced override sau:

| Capability | Giá trị environment | JSON setting tương ứng |
|---|---|---|
| OSC 8 hyperlink | `PI_HYPERLINKS=1\|0\|auto` | `terminal.hyperlinks: true\|false\|"auto"` |
| Inline image | `PI_IMAGE_PROTOCOL=kitty\|iterm2\|none\|auto` | `terminal.images: "kitty"\|"iterm2"\|false\|"auto"` |
| Truecolor | `PI_TRUE_COLOR=1\|0\|auto` | `terminal.trueColor: true\|false\|"auto"` |

Với `PI_HYPERLINKS`, `1` buộc bật OSC 8 hyperlink, `0` buộc tắt chúng, còn `auto` chuyển sang tự động detect. `terminal.hyperlinks` setting tường minh được ưu tiên hơn cả `PI_HYPERLINKS` lẫn kết quả detect tự động; `"auto"` không tạo setting override.

Với `PI_IMAGE_PROTOCOL`, `kitty` chọn protocol Kitty và `iterm2` chọn protocol iTerm2; `none` buộc tắt inline image, còn `auto` chuyển sang tự động detect. Một protocol tường minh hoặc `false` trong `terminal.images` setting được ưu tiên hơn cả `PI_IMAGE_PROTOCOL` lẫn kết quả detect tự động; `"auto"` không tạo setting override.

Với `PI_TRUE_COLOR`, `1` buộc bật truecolor, `0` buộc tắt nó, còn `auto` chuyển sang tự động detect. `terminal.trueColor` setting tường minh được ưu tiên hơn cả `PI_TRUE_COLOR` lẫn kết quả detect tự động; `"auto"` không tạo setting override.

Chỉ force capability khi toàn bộ đường đi qua terminal, proxy và multiplexer hỗ trợ nó, vì escape sequence không được hỗ trợ có thể làm hỏng rendering.

Cơ chế tự động detect nhận diện integrated terminal của Zed là có truecolor và hyperlink nhưng không chọn inline image protocol tại đó. Với `auto`, Zed vì vậy dùng image text fallback; đừng force sequence của Kitty hay iTerm2 nếu terminal path thực tế không hỗ trợ.

Với Ctrl+G, setting `externalEditor` được ưu tiên, sau đó là `VISUAL`, `EDITOR` rồi fallback theo platform. Các variable này chứa editor command, không chứa nội dung file.

### Cache và chia sẻ

`PI_CACHE_RETENTION=long` yêu cầu provider prompt caching kéo dài nếu API được chọn hỗ trợ; giá trị khác không chọn một tier được tài liệu hóa. `PI_SHARE_VIEWER_URL` thay base URL dùng để tạo viewer link cho `/share`. `PI_RADIUS_GATEWAY` override Radius gateway origin mà `/bug` upload và Radius relay connection sử dụng. Không variable nào trong nhóm này là provider credential.

### `PI_EXPERIMENTAL`

`PI_EXPERIMENTAL=1` bật các runtime feature còn được gate tường minh là experimental. Phép so sánh chính xác là `1`; `true` không được chấp nhận. Variable này không còn điều khiển constrained sampling của built-in Tool `read`, `bash`, `powershell`, `edit` và `write`: các definition đó mặc định dùng strict-prefer sampling, còn Extension có thể thay một definition bằng `constrainedSampling: false`.

### Quy tắc về giá trị

Environment variable là chuỗi, nhưng Pi không coi mọi chuỗi khác rỗng là true. Chỉ dùng các giá trị nêu trên. Path có thể là absolute path hoặc được helper path của CLI expand theo tài liệu; giá trị riêng cho provider cũng có thể đến từ object `env` theo scope của stored credential, và được ưu tiên hơn ambient process đối với các field được hỗ trợ.

## Proxy và TLS

Pi 0.87.1 cấu hình Undici `EnvHttpProxyAgent` cho traffic dùng fetch do Pi quản lý.

| Variable | Hành vi |
|---|---|
| `HTTP_PROXY` | Proxy cho HTTP destination |
| `HTTPS_PROXY` | Proxy cho HTTPS destination |
| `NO_PROXY` | Bypass host phân tách bằng dấu phẩy hoặc khoảng trắng; `*` bỏ qua toàn bộ proxy |

Undici cũng nhận dạng dạng chữ thường và ưu tiên dạng đó hơn dạng chữ hoa. Setting global `httpProxy` chỉ điền `HTTP_PROXY` và `HTTPS_PROXY` khi chúng chưa được đặt. Provider SDK như AWS hoặc Google có thể sở hữu transport riêng, vì vậy các variable này không bảo đảm cho mọi extension hoặc cloud client.

`SSL_CERT_FILE` không được transport trong bản Pi 0.87.1 đã publish đọc hoặc cài đặt. Hãy cấu hình custom certificate trust qua Node runtime hoặc provider SDK đã chọn rồi kiểm tra riêng route đó; đừng giả định variable từ baseline này thay đổi TLS do Pi quản lý.

## Variable riêng cho provider

### Azure OpenAI

Azure OpenAI Responses yêu cầu `AZURE_OPENAI_API_KEY` cùng `AZURE_OPENAI_BASE_URL` hoặc `AZURE_OPENAI_RESOURCE_NAME`. Control tùy chọn gồm `AZURE_OPENAI_API_VERSION` và `AZURE_OPENAI_DEPLOYMENT_NAME_MAP` phân tách bằng dấu phẩy. Variable `OPENAI_ORG_ID` chung trong baseline không được OpenAI provider của 0.87.1 sử dụng.

### Amazon Bedrock

Bedrock nhận `AWS_BEARER_TOKEN_BEDROCK`, `AWS_PROFILE` hoặc standard AWS access-key/role chain, gồm `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN` tùy chọn, ECS credential và web identity. Region selection đọc `AWS_REGION` hoặc `AWS_DEFAULT_REGION`. Proxy deployment có thể dùng `AWS_ENDPOINT_URL_BEDROCK_RUNTIME`; `AWS_BEDROCK_SKIP_AUTH=1` và `AWS_BEDROCK_FORCE_HTTP1=1` là compatibility switch chuyên biệt.

### Google Vertex AI

Vertex nhận trực tiếp `GOOGLE_CLOUD_API_KEY`. Application Default Credentials cần default credential file hợp lệ hoặc `GOOGLE_APPLICATION_CREDENTIALS`, cộng với `GOOGLE_CLOUD_PROJECT` (hoặc `GCLOUD_PROJECT`) và `GOOGLE_CLOUD_LOCATION`. `GOOGLE_API_KEY` và `GOOGLE_VERTEX_API_KEY` không phải alias cho variable Gemini và Vertex hiện tại.

### Cloudflare

Cloudflare Workers AI dùng `CLOUDFLARE_API_KEY` và `CLOUDFLARE_ACCOUNT_ID`; AI Gateway cần thêm `CLOUDFLARE_GATEWAY_ID`. Các tên viết hoa hoàn toàn và chính xác này thay dạng `CLOUDflare_*` bị viết sai trong baseline.

```bash title="Đặt giá trị proxy và cloud routing không chứa secret"
export HTTPS_PROXY=http://proxy.internal.example:8080
export NO_PROXY=localhost,127.0.0.1,.internal.example
export GOOGLE_CLOUD_PROJECT=example-project
export GOOGLE_CLOUD_LOCATION=us-central1
```

Variable cũ `ANTHROPIC_BASE_URL` cũng không phải built-in override hiện tại. Hãy cấu hình endpoint được hỗ trợ trong `models.json` hoặc provider implementation thay vì dựa vào ambient alias.

## Process marker và shell-tool metadata

CLI và RPC entry point đặt `AI_AGENT=pi` cùng `PI_CODING_AGENT=true`. Child process kế thừa chúng, nhưng đây không phải session identifier và bản nhúng SDK không tự động đặt chúng. Bản publish 0.87.1 không phát marker cũ `PI_PARENT_SESSION`.

Pi có thể expose session context hiện tại sau cho command do các LLM-callable tool `bash` và `powershell` chạy:

| Variable | Giá trị |
|---|---|
| `PI_SESSION_ID` | Session ID hiện tại; luôn có khi các điều kiện inject bên dưới được đáp ứng |
| `PI_SESSION_FILE` | Absolute path đến JSONL; chỉ có với file-backed session có session file path |
| `PI_PROVIDER` | Pi provider ID đang chọn; chỉ có khi `ctx.model` tồn tại |
| `PI_MODEL` | Pi model ID đang chọn; chỉ có khi `ctx.model` tồn tại |
| `PI_REASONING_LEVEL` | Level thực tế: `off`, `minimal`, `low`, `medium`, `high`, `xhigh` hoặc `max`; chỉ có khi `ctx.thinkingLevel` là truthy |

Operations Bash và PowerShell cục bộ mặc định khởi chạy một child process riêng cho mỗi Tool call và dùng command syntax tương ứng. Custom operations thay vào đó ủy quyền cho backend đã cấu hình; backend đó sở hữu cancellation, cleanup và quyết định execution state có persist hay không. Wrapper trước hết xóa giá trị kế thừa của cả năm session variable. `exposeSessionEnvironment` mặc định là `true`, nhưng việc inject cần Agent/Extension execution context. `exposeSessionEnvironment: false` chặn cả năm session field ngay cả khi context đó tồn tại. Standalone hoặc custom invocation không có context đó sẽ không tự động nhận chúng. Khi việc inject diễn ra, giá trị được resolve trước shell-tool command đó, nên thay đổi model hoặc reasoning tác động đến command kế tiếp. Tool `powershell` native chỉ có trên Windows. Các variable này không được inject vào command `!` hoặc `!!` do người dùng nhập.

Khi các điều kiện trên được đáp ứng, custom shell tool tạo bằng `createBashTool()` hoặc `createPowerShellTool()` expose metadata trước `spawnHook`, vì vậy hãy giữ process environment nhận được khi thêm field. Nếu thiếu context hoặc exposure bị tắt, hook nhận environment đã xóa các session field này. Dạng Bash hiện có vẫn là:

```ts title="Giữ Pi metadata trong custom bash tool"
import { createBashTool } from "@earendil-works/pi-coding-agent";

export const bashTool = createBashTool(process.cwd(), {
  spawnHook: (context) => ({
    ...context,
    env: { ...context.env, CI: "1" },
  }),
});
```

Customization PowerShell dùng cùng hook contract. Khi được đăng ký và execute qua Pi với Agent context cùng exposure mặc định, Tool nhận cùng session field:

```ts title="Giữ Pi metadata trong custom PowerShell tool"
import { createPowerShellTool } from "@earendil-works/pi-coding-agent";

export const powerShellTool = createPowerShellTool(process.cwd(), {
  spawnHook: (context) => ({
    ...context,
    env: { ...context.env, CI: "1" },
  }),
});
```

Hãy tắt exposure một cách tường minh trên một trong hai factory khi command vượt qua trust boundary. Pi xóa session field kế thừa trước, ngăn metadata cũ của parent rò vào command hoặc hook. Ví dụ Bash này vẫn hợp lệ; thay factory bằng `createPowerShellTool()` để có policy PowerShell tương đương:

```ts title="Tắt bash session metadata"
import { createBashTool } from "@earendil-works/pi-coding-agent";

export const isolatedBashTool = createBashTool(process.cwd(), {
  exposeSessionEnvironment: false,
  spawnHook: (context) => context,
});
```

## Lỗi thường gặp và bảo mật

- Không đưa API key vào shell file được commit, `settings.json`, mã nguồn extension, log, prompt hoặc transcript. Ưu tiên `/login`, secret manager hoặc process injection có scope hẹp; hãy nhớ child process kế thừa giá trị được export.
- Tên hiện tại phải chính xác. `PI_HOME`, `PI_LOG_LEVEL`, `PI_PARENT_SESSION`, `GOOGLE_API_KEY`, `GOOGLE_VERTEX_API_KEY`, `GITHUB_TOKEN`, `OPENAI_ORG_ID`, `ANTHROPIC_BASE_URL` và tên `CLOUDflare_*` viết sai không phải compatibility alias trong bản publish 0.87.1.
- Stored provider credential và `apiKey` đã cấu hình trong `models.json` đều được ưu tiên hơn ambient variable. Hãy logout hoặc cập nhật stored entry, đồng thời xóa hoặc đổi configured key, trước khi mong shell key vừa rotate được chọn.
- `PI_EXPERIMENTAL` không liên quan đến provider authentication và không phải switch permission hay “yolo”.
- Không in toàn bộ environment dump khi debug. Chỉ kiểm tra non-secret marker hoặc từng metadata field, đồng thời coi `PI_SESSION_FILE` là local data nhạy cảm.

## Tiếp theo

- <a href="/vi/reference/configuration">Tham chiếu cấu hình</a> trình bày `settings.json`, trust, resource, tool và session.
- <a href="/vi/reference/api">Tham chiếu API</a> trình bày public SDK surface.
- <a href="/vi/how-to/plug-new-model">Thêm một nhà cung cấp mô hình</a> trình bày `models.json`, authentication và custom adapter.
