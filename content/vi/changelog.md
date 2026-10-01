---
title: Nhật ký thay đổi
description: Các thay đổi của website tài liệu Pify, tách biệt với changelog của Pi SDK.
translation_key: changelog
language: vi
status: reviewed
reviewed_by: Pify maintainers
last_updated: '2026-10-01'
---
Trang này ghi các thay đổi của website tài liệu Pify. Để xem release của Pi, hãy dùng [lịch sử release upstream](https://github.com/earendil-works/pi/releases).

## 2026-10-01

### Phạm vi release

Pify nâng baseline tài liệu lên [release Pi `v0.99.2` chính thức](https://github.com/earendil-works/pi/releases/tag/v0.99.2). Mục này tổng hợp đầy đủ chuỗi phát hành `0.99.x`—[`v0.99.0`](https://github.com/earendil-works/pi/releases/tag/v0.99.0), [`v0.99.1`](https://github.com/earendil-works/pi/releases/tag/v0.99.1) và `v0.99.2`—đồng thời ghim source review tại commit phát hành chính xác [`005af57d`](https://github.com/earendil-works/pi/commit/005af57d88ee23b33778f343a9595b32e67ff788). Nội dung dưới đây tóm tắt các thay đổi hướng tới người dùng có ảnh hưởng đến tài liệu này, không sao chép changelog của từng package upstream.

### Các capability chính của nền tảng

- `v0.99.0` bổ sung Codemode, Tool search và MCP dưới dạng extension tích hợp của coding agent. Extension có thể chọn exposure `direct`, `model-only`, `codemode`, `deferred` hoặc `hidden`, gom Tool vào namespace, trả về `structuredContent` và điều phối nested call có giới hạn qua `ctx.executeTool()`.
- Virtual Model thử nghiệm giữ một model identity ổn định trong session history, còn extension chọn physical model và thinking level cho từng request. Physical model đã route vẫn hiển thị trong cost accounting và diagnostic.
- Model runtime nay phân biệt rõ operation type `chat`, `image` và `classifier`. Runtime bổ sung `generateImages()` và `classify()` với credential được resolve theo provider, trong khi các model read không chỉ định type vẫn chỉ trả về chat model.
- Package thử nghiệm `@earendil-works/pi-durable` phát triển từ Harness có thể mở cùng chat/Tool turn đầu tiên thành Document, Task, Conversation được lưu bền vững, cơ chế lập lịch inbox/reset, view và event, ownership cho subagent, structured concurrency, compaction và recovery khi overflow với đúng một lần retry.
- `v0.99.2` không còn đưa MCP server mặc định vào mô tả Tool của Codemode và không chờ server trước prompt đầu tiên. Script khám phá Tool của server qua `searchTools()` và `describeNamespace()`; `/reload` cũng bật Tool mới được thêm vào `defaultTools`.

### Model, xác thực và giao diện

- `v0.99.1` bổ sung `gpt-6.1-sol` cho OpenAI, Azure OpenAI Responses và OpenAI Codex, đồng thời đặt model này làm default cho provider OpenAI Codex cũ. Bản bundle cũng khôi phục module cho luồng đăng nhập OpenAI.
- `v0.99.0` bổ sung Claude Sonnet 5.5, Sign in with ChatGPT cho provider OpenAI, catalog classifier cùng các route Jev, system theme theo terminal và các accessor đầy đủ hơn cho catalog theo model operation. Trong `v0.99.2`, `@earendil-works/pi-ai/models` cung cấp entry point nhẹ để tạo model collection và provider.
- Anthropic workload identity federation có thể đọc các biến môi trường SDK đã được tài liệu hóa; API key và `ANTHROPIC_AUTH_TOKEN` có độ ưu tiên cao hơn. MCP HTTP server có thể dùng token hiện tại từ provider login, còn `oauth.clientName` hỗ trợ server yêu cầu OAuth client đã biết; xác thực bằng provider token chỉ được phép trong global config hoặc khi extension đăng ký và yêu cầu HTTPS, trừ loopback.
- Mô tả MCP server xuất hiện trong danh sách server ngắn gọn của system prompt và được dùng để xếp hạng Tool search. Direct MCP call cùng Tool dùng fallback renderer hiển thị arguments, còn Codemode cung cấp structured result cho JavaScript và ghi nhận nested usage vào session cost.

### Các sửa lỗi về độ tin cậy và hành vi

- Các bản sửa Codemode/MCP đồng bộ tên MCP Tool với identifier của Codemode, nạp worker trong Windows binary, kiểm tra dữ liệu image được tạo, giới hạn preview result theo dòng đã wrap, loại Tool bị ẩn khỏi system prompt và không để quá trình khởi động hay xác thực MCP chậm chặn prompt đầu tiên.
- Các bản sửa model/provider từ chối OpenAI Responses Tool call chưa hoàn tất, giữ thinking level đã yêu cầu cho Mistral và sampling parameter khi gọi trực tiếp, nhận diện context overflow của Z.AI CN, gửi non-strict khi Anthropic không hỗ trợ keyword trong strict schema và dùng exponential backoff khi không parse được `Retry-After`.
- Các bản sửa catalog và routing merge remote model theo thời gian tuyến tính và resolve lựa chọn Virtual Model của từng branch bằng một lần lookup catalog. Session mới được lưu ngay ở user message đầu tiên; `RpcClient` không còn bỏ qua listener kế tiếp khi một listener khác unsubscribe trong lúc dispatch.
- Durable recovery nay xác định rõ ownership và thứ tự abort, chờ foreground descendant trước khi owner hoàn tất, từ chối child background do Task sở hữu, loại request trùng lặp sau khi được nhận và chỉ cho phép replay sau gián đoạn khi Tool khai báo `replay: "safe"`.

### Phạm vi tài liệu và kiểm chứng

- Các dependency trực tiếp được ghim chính xác ở `0.99.2`, gồm `@earendil-works/pi-ai`, `@earendil-works/pi-agent-core`, `@earendil-works/pi-coding-agent`, `@earendil-works/pi-server`, `@earendil-works/pi-durable` và `@earendil-works/chord`. Nguồn xác thực release được lưu trong `scripts/fixtures/pi-release-0992.json`.
- Compile fixture kiểm tra các public surface của SDK, coding agent và Durable trong `tests/fixtures/pi-sdk-0992.contract.ts`, `tests/fixtures/pi-coding-agent-0992.contract.ts` và `tests/fixtures/pi-durable-0992.contract.ts`. Bộ kiểm chứng cũng mở rồi đóng Durable Harness offline và không gọi tài khoản provider thật.
- Bổ sung các cặp hướng dẫn Anh/Việt đồng bộ cho Codemode và MCP, Virtual Model và Durable Agent thử nghiệm. Inventory công khai hiện có 46 cặp trang song ngữ, tương ứng 92 tài liệu công khai, kèm kiểm tra số lượng route, frontmatter, language alternate, navigation và LLM index.

## 2026-09-23

### Phạm vi release

Pify chuyển baseline tài liệu từ `0.85.0` lên [Pi `0.87.1`](https://github.com/earendil-works/pi/releases/tag/v0.87.1). Đợt cập nhật này bao gồm [Pi `0.85.1`](https://github.com/earendil-works/pi/releases/tag/v0.85.1), [Pi `0.86.0`](https://github.com/earendil-works/pi/releases/tag/v0.86.0), [Pi `0.86.1`](https://github.com/earendil-works/pi/releases/tag/v0.86.1) và [Pi `0.87.0`](https://github.com/earendil-works/pi/releases/tag/v0.87.0), với source review ghim tại [`f07218c`](https://github.com/earendil-works/pi/commit/f07218c4d4bbc12bef056a7058c3dd49dfe41abe).

### Các thay đổi API không tương thích

- Từ `0.86.0`, provider stream nhận `TranscriptContext` đã chuẩn hóa. Custom provider đọc prompt và khai báo Tool từ `context.messages` qua `getCurrentSystemPrompt()` và `getCurrentTools()`.
- `ToolCall.arguments` và `ToolResultMessage.details` nhận các giá trị JSON-compatible; `ToolResultMessage` trở thành conditional type, còn array trong `JsonValue` là readonly.
- Hook `user_bash` dùng cơ chế fail-closed: lỗi hoặc result khác `undefined` nhưng không hợp lệ dừng command trước khi gọi handler tiếp theo hoặc thực thi local. Trả về `undefined` để tiếp tục dispatch, hoặc trả về `{ operations }` hay `{ result }` để xử lý command.
- Từ `0.87.0`, thay `shouldStopAfterTurn` bằng `finishTurn` và trả về `{ action: "end" }` để dừng sau lượt hiện tại. Hook chạy trước `turn_end`, nhưng quyết định được áp dụng sau đó. Hook cũng nhận response có trạng thái error và aborted; predicate chỉ dành cho response bình thường phải trả về `undefined` ở các trường hợp kết thúc bắt buộc này.
- `SessionManager` nay quản lý provider context chuẩn của `AgentSession`; gán `session.agent.state.messages` không còn thay thế history cho request tiếp theo. Khôi phục entry bằng `SessionManager.inMemory()`, điều hướng bằng `session.navigateTree()`, hoặc append qua session manager rồi gọi `session.refreshContext()`.
- Switch xử lý đầy đủ `SessionEntry` phải bổ sung `ContextEditEntry` với type `context_edit`. Dùng `replacement: null` để bỏ một entry khỏi provider context về sau, hoặc cung cấp content thay thế; raw history được giữ nguyên.
- Extension integration phải xử lý các boundary field bắt buộc của `TurnEndEvent` và `AgentBeforeSettleEvent` mới trong `ExtensionEvent`. Dùng `emitBoundary()` để dispatch các actionable boundary `turn_end` và `agent_before_settle`; handler có thể trả về entry và yêu cầu chạy tiếp. Run được yêu cầu trong `agent_settled` chờ đến khi mọi settled handler hoàn tất.

### Khả năng mới

- `0.85.1` bổ sung GPT-6 Astra qua OpenAI API key và OpenAI Codex subscription.
- `0.86.0` bổ sung prompt cache warming có cân nhắc chi phí trong các Tool run dài, kèm tùy chọn warming khi idle và hook `cache_warming_decision`. `/bug` thu thập diagnostic đã che secret, có thể kèm transcript hoặc summary để upload lên Radius hay xuất ZIP local.
- Radius bổ sung model catalog offline, kết hợp với catalog đã cache và kết quả discovery trực tiếp. Trong `0.86.1`, Meta Muse hỗ trợ `/login meta` với key refresh và xác thực trực tiếp bằng `META_API_KEY`.
- Compaction budget theo model dùng `compaction.modelOverrides` với `reserveTokens` và `keepRecentTokens`. Extension có thể gọi model đã cấu hình qua `ctx.modelRegistry.stream()` và `streamSimple()` với thông tin xác thực tương ứng. `pi.on()` trả về hàm unsubscribe; thay đổi đăng ký trong lúc dispatch có hiệu lực ở những lần dispatch tiếp theo.
- Trong `0.87.0`, `context_with_system` chạy sau `context` trên toàn bộ transcript, gồm system message, và gửi kết quả nguyên vẹn. Profile `inputLimits.images.resize` theo model trong `models.json` áp dụng cho attachment, `read` và image trong Tool result.
- `0.87.1` bổ sung Claude Opus 5.5 qua Anthropic, GPT-6 Sol và GPT-6 Luna qua OpenAI API key cùng OpenAI Codex subscription, và cả ba model qua các route GitHub Copilot được hỗ trợ. Session xAI mới mặc định dùng Grok 4.7.

### Bản sửa lỗi về độ tin cậy, provider và CLI

- Workaround root-import dành cho `0.85.0` không còn cần sau khi `0.85.1` sửa lỗi phát hành nhầm các dependency thử nghiệm nội bộ. Các subpath thử nghiệm `client`, `experimental/plugin` và command server/client chuyển sang source-only qua `pi-test.sh`; local SDK và stdio RPC API được hỗ trợ giữ nguyên contract.
- Các bản sửa trong `0.86.x` bao gồm định tuyến model GPT của GitHub Copilot qua Responses, metadata reasoning và cache của provider, race giữa compaction/cancellation, shell command bị kết thúc bởi signal, clipboard fallback và diagnostic của `/bug`. `0.86.1` cũng bật persistent compile cache của Node trước khi khởi động CLI.
- `0.87.0` sửa cách tính context sau edit và việc bỏ model attempt khi recovery, khôi phục prompt cùng trạng thái Tool sau các handler `context`, và tránh dựng lại cache đã hết hạn khi idle warming bị trễ. `/bug` ở chế độ offline cho phép xuất ZIP local nhưng chặn upload; endpoint OpenAI-compatible chưa xác định chỉ nhận strict Tool schema khi công bố hỗ trợ.
- Trong `0.87.1`, prompt cho split-turn compaction tách conversation khỏi chỉ dẫn tiếp tục để Claude Fable 5.1 có thể tạo summary. Giá trị `--mode` bị thiếu hoặc không hợp lệ nay báo lỗi và thoát với status nonzero.
- Bản sửa message image-only bỏ empty text part mà một số provider OpenAI-compatible từ chối. Request Anthropic OAuth cũng gửi đúng Claude Code version.

### Phạm vi tài liệu và kiểm chứng

- Mục này công bố baseline `0.87.1` cùng nguồn xác thực và phần tóm tắt release của Pify. Các cập nhật chi tiết cho chương, hướng dẫn How-to, trang tham khảo và source-review record dự kiến nằm trong các commit còn lại của đợt cập nhật này. Course implementation vẫn là implementation độc lập để học, không cam kết tương thích API của Pi.
- Phần kiểm chứng package ghim `@earendil-works/pi-ai`, `@earendil-works/pi-agent-core`, `@earendil-works/pi-coding-agent` và `@earendil-works/pi-server` ở `0.87.1`. `scripts/fixtures/pi-release-0871.json` ghi nguồn xác thực release; `tests/fixtures/pi-sdk-0871.contract.ts` kiểm tra public declaration và cung cấp các bài kiểm tra offline cho deterministic Agent, session restoration và runtime host. Content check bao gồm release link, các mô tả migration, cấu trúc song ngữ, `lint:sync`, `lint:frontmatter`, `lint:editorial` và `test:preservation`; các kiểm tra này không gọi tài khoản provider thật.
- `@earendil-works/pi-client`, `@earendil-works/pi-protocol` và `@earendil-works/pi-server` vẫn ở trạng thái thử nghiệm, không cam kết API ổn định hay compatibility. Ghim package hoặc mô tả source contract không thay đổi ranh giới này.

## 2026-09-04

Baseline của tài liệu Pify nay theo [release Pi `0.85.0` chính thức](https://github.com/earendil-works/pi/releases/tag/v0.85.0) và bao gồm rõ release trung gian [Pi `0.84.4`](https://github.com/earendil-works/pi/releases/tag/v0.84.4). Đây là phần tóm tắt các thay đổi ảnh hưởng tới người dùng mà đợt phát hành tài liệu ghi nhận, không phải bản sao changelog upstream của Pi.

### Khả năng mới

- Ghi lại cách khôi phục external session qua `SessionManager.inMemory()` và ranh giới ownership đối với entry do bên ngoài lưu trữ.
- Ghi lại persistent Claude thinking effort: các transport Anthropic được hỗ trợ giữ nguyên effort theo từng lượt và phục hồi an toàn khi signed-thinking không khớp. `supportsMidConvoEffort` thuộc `AnthropicMessagesCompat`, mặc định là `false` và chỉ có thể bật cho đúng model Claude được hỗ trợ trên transport tuân thủ trung thực giao thức Anthropic Messages; đây là cơ chế dùng cho effort theo từng lượt và phục hồi signed-thinking.
- Bổ sung các field tương thích model: `vllmPriority` thuộc `OpenAICompletionsCompat`, dùng cho lập lịch ưu tiên vLLM và mặc định không được đặt trong model metadata được tạo, trong khi priority mặc định của vLLM server là `0`; `supportsMaxOutputTokens` thuộc `OpenAIResponsesCompat`, mặc định là `true` và kiểm soát việc gateway tương thích Responses có nhận `max_output_tokens` hay không.
- Bổ sung hỗ trợ render join symbol bằng LaTeX cho đại số quan hệ.
- Bổ sung kiến trúc service thử nghiệm gồm `@earendil-works/pi-client`, `@earendil-works/pi-protocol` và `@earendil-works/pi-server`, bao gồm trách nhiệm của routed session, transport và protocol.

### Thay đổi hành vi và interface

- Bổ sung vòng đời prompt và RPC: `ui_prompt_start`/`ui_prompt_end` đánh dấu thời gian chờ UI của extension, còn `clear_queue` trả về rồi xóa steering message và follow-up message trước luồng abort.
- Làm rõ các Tool xử lý path dùng `ctx.cwd` tại đúng invocation hiện tại, đồng thời ghi lại hành vi terminal/fullscreen gồm `PI_HYPERLINKS`, capability override, search nhanh hơn, điều khiển copy selection và working indicator được nhúng.
- Ghi nhận bản sửa giúp Skills hoạt động khi chỉ bật Bash.

### Bản sửa lỗi độ tin cậy/provider

- Ghi lại managed `fd`/`rg` download trên musl mà không cần GitHub Releases API, khôi phục `@earendil-works/pi-coding-agent/client` làm compatibility entry point và sửa event sequence không tương thích cùng custom Tool-call delta.
- Codex SSE nay xử lý terminal event không có blank line theo sau; Mistral giữ đúng tool call phân mảnh khi chunk tiếp nối thiếu tool-call ID; OpenAI reasoning replay gộp các delta text và summary; model Grok không còn khả dụng đã được loại bỏ.
- Các bản sửa catalog và request giúp catalog Qwen bổ sung Qwen3.8 Flash, Fable gửi reasoning đã chọn, Baseten sửa metadata image input, Fireworks chọn đúng API adapter, Vertex hoạt động với proxy, Cloudflare bổ sung model vào gateway catalog và ngăn model OpenRouter bắt buộc reasoning nhận effort `none`.
- Ghi nhận các bản sửa tính toàn vẹn cho JSONL append, share đồng thời, import tránh collision, fork in-memory và file-backed, compaction và manual abort.
- Ghi lại cách khớp `NO_PROXY`, tunnel proxy HTTP, khởi động terminal dưới seccomp hạn chế và đọc orientation từ EXIF; render bền vững cho output nhiều image tránh crash do giới hạn độ dài string của V8.

### Phạm vi tài liệu và kiểm chứng

- Cập nhật các chương, hướng dẫn How-to, trang tham khảo, FAQ, Hướng dẫn nhanh, example và compile fixture của Pify theo baseline package và source `0.85.0`, kèm kiểm chứng tập trung cho hành vi và cấu trúc song ngữ.
- Các package service client/protocol/server vẫn ở trạng thái thử nghiệm; tài liệu này không trình bày những API đó là ổn định và không cam kết compatibility vượt quá release đã phát hành.

## 2026-08-26

- Cập nhật technical baseline và các code example theo Pi `0.84.3`.
- Thêm Chương 11 và ba hướng dẫn How-to về SDK testing, evaluation và runtime hosting.
- Xuất bản course song ngữ nguyên bản với trang tổng quan riêng và lộ trình Tự xây Pi-style Agent gồm 15 checkpoint.
- Thêm workshop TypeScript offline kèm focused test cho từng checkpoint.
- Mở rộng website lên 43 cặp trang Anh/Việt đồng bộ, tương ứng 86 tài liệu công khai.

## 2026-08-24

- Thêm editorial lint song ngữ để phát hiện ký tự Hán còn sót, control character, dấu câu full-width, mojibake, các mẫu dịch sát chữ đã biết và đoạn tiếng Việt dài không dấu.
- Định nghĩa quy ước thuật ngữ Anh/Việt và review ledger được ghim vào một upstream commit cụ thể của Pi.
- Bắt đầu biên tập và kiểm chứng kỹ thuật toàn bộ 23 cặp trang tiếng Anh/Việt.

## 2026-08-22

- Thay các thử nghiệm triển khai Astro và GitBook trước đó bằng ứng dụng Fumadocs self-hosted trên Vercel.
- Thêm route Anh/Việt, navigation bản địa hóa, search, SEO metadata, syntax highlighting, Mermaid renderer và end-to-end test song ngữ.
- Xuất bản Hướng dẫn nhanh, bảng thuật ngữ, nhật ký thay đổi, 5 hướng dẫn theo tác vụ, các trang tham khảo về API/cấu hình/biến môi trường và FAQ.
- Thêm tiêu đề code block và line highlighting qua Fumadocs renderer.
- Sửa các link tài liệu theo locale để route sạch không còn lộ đuôi `.md`.
- Thêm logo Pify, favicon thích ứng, giấy phép GPLv3, hướng dẫn đóng góp và tài liệu triển khai.

## 2026-08-20

- Import 10 chương tiếng Anh và tiếng Việt đầu tiên từ dự án dịch Pi Agent Book; bản Pi Agent Book tiếng Trung là nguồn chuẩn cho lần dịch đầu tiên đó.
- Thêm navigation ban đầu và metadata về nguồn tài liệu.
- Thêm trang 404 tùy chỉnh và tạo sitemap.
