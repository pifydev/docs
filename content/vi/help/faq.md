---
title: Câu hỏi thường gặp
description: Các câu hỏi thường gặp về Pi và Pify Agent Book.
translation_key: faq
language: vi
status: reviewed
reviewed_by: Pify maintainers
last_updated: '2026-09-23'
---
Các câu trả lời dưới đây đề cập tới Pi và dự án tài liệu này. Hãy mở [GitHub issue](https://github.com/pifydev/docs/issues) nếu câu hỏi của bạn chưa có trong danh sách.

## Về Pi

### Pi là gì?

Pi là bộ công cụ coding agent mã nguồn mở. Monorepo của Pi chứa model API, agent runtime, TUI và ứng dụng dòng lệnh `pi`. Ba npm package chính là `@earendil-works/pi-ai`, `@earendil-works/pi-agent-core` và `@earendil-works/pi-coding-agent`.

### Pi khác Claude Code hoặc Codex ở điểm nào?

Pi giữ phần core nhỏ và cho phép tùy chỉnh bằng extension, skill, prompt template, theme và package. Claude Code và Codex có workflow tích hợp sẵn và service integration khác. Hãy so sánh theo workflow, provider, mô hình bảo mật và yêu cầu triển khai của dự án thay vì xem chúng là các agent tương đương.

### Pi hỗ trợ những model provider nào?

Pi đăng ký sẵn provider cho Anthropic, OpenAI, Google, Bedrock, OpenRouter, một số subscription endpoint và nhiều dịch vụ hosted hoặc local khác. Bạn cũng có thể đăng ký custom provider hoặc server tương thích OpenAI. Xem [Tích hợp model provider](../how-to/plug-new-model.md).

Các bổ sung chọn lọc của `0.87.1` dưới đây cho thấy một tên trong catalog có thể có nhiều provider route:

| Model | Route hiện tại | Hành vi của route |
|---|---|---|
| `Claude Opus 5.5` | `anthropic + github-copilot` | `adaptive thinking + route Copilot được hỗ trợ` |
| `GPT-6 Sol` | `openai + openai-codex + github-copilot` | `API key + OpenAI Codex subscription + route Copilot được hỗ trợ` |
| `GPT-6 Luna` | `openai + openai-codex + github-copilot` | `API key + OpenAI Codex subscription + route Copilot được hỗ trợ` |
| `Grok 4.7` | `xai` | `default cho xAI session mới` |

Đây không phải toàn bộ catalog. Dùng `/model` hoặc `pi --list-models` để xem bản đã cài, và lưu ý model được chọn tường minh hoặc model đã lưu trong session được resume có độ ưu tiên cao hơn xAI default dành cho session mới.

### Pi có miễn phí không?

Mã nguồn và npm package của Pi dùng giấy phép mã nguồn mở. Model provider vẫn có thể tính phí inference, vì vậy hãy đặt giới hạn tài khoản trước khi gọi API.

## Đọc tài liệu

### Có nên đọc các chương theo thứ tự không?

Hãy đọc chương 1 đến 3 theo thứ tự để nắm tổng quan dự án, kiến trúc package và vòng lặp Agent. Sau đó, có thể đọc độc lập từng chương 4 đến 11 theo subsystem bạn quan tâm.

### Tài liệu này mô tả revision nào của Pi?

Baseline hiện tại của tài liệu là [release Pi `0.87.1` chính thức](https://github.com/earendil-works/pi/releases/tag/v0.87.1). Review ledger ghim việc kiểm chứng tại [`f07218c`](https://github.com/earendil-works/pi/commit/f07218c4d4bbc12bef056a7058c3dd49dfe41abe). Hãy kiểm tra lại upstream trước khi phụ thuộc vào API hoặc giá trị mặc định có thể thay đổi theo version.

### Vì sao ví dụ dùng TypeScript?

Pi được viết bằng TypeScript và phát hành type declaration cùng các package. Tài liệu dùng TypeScript khi type giúp API rõ ràng hơn; shell, JSON và JavaScript được dùng khi phù hợp với runtime hoặc định dạng cấu hình.

### Có thể dùng lại ví dụ trong dự án riêng không?

Có. Hãy cài đúng package được ghi trong ví dụ và dùng đúng phiên bản Node.js yêu cầu. [Hướng dẫn nhanh](../quickstart.md) cung cấp một setup hoàn chỉnh có thể chạy ngay.

## Đóng góp

### Báo lỗi dịch như thế nào?

Mở issue tại [github.com/pifydev/docs/issues](https://github.com/pifydev/docs/issues). Ghi rõ đường dẫn trang, câu bị lỗi và đề xuất sửa.

### Có thể thêm trang hoặc chương mới không?

Có. Hãy gửi đủ file tiếng Anh và tiếng Việt, giữ cấu trúc heading và code fence đồng bộ, đồng thời tuân theo [CONTRIBUTING.md](https://github.com/pifydev/docs/blob/main/CONTRIBUTING.md).

### Quy ước thuật ngữ nằm ở đâu?

[GLOSSARY.md](https://github.com/pifydev/docs/blob/main/GLOSSARY.md) tại repository root định nghĩa thuật ngữ chuẩn. Giữ nguyên identifier và chỉ dịch các khái niệm được glossary cho phép.

## Lỗi thường gặp

Hai bản sửa trong `0.87.1` cần được tính đến khi chẩn đoán lỗi riêng của provider:

| Trường hợp | Hành vi ở bản cũ | Hành vi trong `0.87.1` |
|---|---|---|
| `OpenAI-compatible` | `request chỉ có image có thể kèm empty text part` | `bỏ empty text part; giữ image block` |
| `Claude Fable 5.1 + split-turn compaction` | `summary có thể bị từ chối` | `tách Conversation và Instructions; dùng chỉ dẫn để tiếp tục` |

Các sửa đổi implementation này không expose public API. Nếu endpoint tương thích OpenAI vẫn từ chối lượt chỉ có image, hãy kiểm tra các content part đã serialize. Ở bản cũ, split-turn compaction summary có thể bị Claude Fable 5.1 từ chối. Phiên bản `0.87.1` tách `Conversation` trước đó khỏi `Instructions` chứa chỉ dẫn để tiếp tục. Không có public compaction knob cho hành vi này.

### Kết quả Tool không đến được model

Hãy trả về `ToolResultMessage` có `toolCallId` khớp với `ToolCall.id` ban đầu. Đồng thời giữ đúng tên Tool và định dạng content block mà API yêu cầu.

### Không thể tiếp tục phiên làm việc

Coding agent mặc định lưu session trong `~/.pi/agent/sessions/`. Xác nhận session còn tồn tại và khởi chạy Pi từ working directory phù hợp, hoặc truyền trực tiếp đường dẫn hay ID của session.

### TUI hoạt động không ổn định qua SSH

Tăng `PI_TUI_ESC_TIMEOUT` khi terminal có độ trễ cao. Xem [Biến môi trường](../reference/environment-variables.md#pi_tui_esc_timeout).

### Provider trả HTTP 429 dù key hợp lệ

HTTP 429 cho biết request bị rate limit hoặc tài khoản đã hết quota, không phải key sai. Kiểm tra tài khoản provider, chờ hết retry window hoặc chọn model khác.
