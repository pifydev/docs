---
title: "FAQ"
description: "Các câu hỏi thường gặp về Pi và Pify Agent Book."
template: doc
sidebar:
  label: "FAQ"
  order: 1
---

Các câu hỏi thường gặp về Pi và cuốn sách này. Nếu câu hỏi của bạn không có ở đây, hãy mở issue trên GitHub.

## Về Pi

### Pi là gì?

Pi là một agent SDK và CLI open-source của `earendil-works`. Nó đi kèm một coding agent, một TUI, và ba package xếp lớp (`@pi-ai/core`, `@pi-agent-core`, `@pi-coding-agent`) bạn có thể dùng độc lập.

### Pi khác gì Claude Code hay Codex?

Pi cố tình tối giản. Nó không có planning mode, không có subagent có sẵn, không có MCP client, không có permission prompt theo mặc định. Triết lý là "bắt đầu rỗng, để người dùng điền thứ họ cần". Claude Code và Everything Claude Code đi theo hướng ngược lại: một agent đầy đủ tính năng với hàng trăm command.

### Pi hỗ trợ những model provider nào?

Bất kỳ provider nào nói chuyện theo giao thức OpenAI Chat Completions hoặc Anthropic Messages. Pi có translator cho Anthropic, OpenAI, Google, Bedrock, và một số khác. Bạn có thể thêm provider mới bằng cách viết một file translator. Xem [How to plug in a new model](/vi/how-to/plug-new-model/).

### Pi có miễn phí không?

SDK là open-source và miễn phí. Các model bạn gọi thì do provider tính phí. Hãy đặt spend limit trên tài khoản provider.

## Đọc cuốn sách này

### Có nên đọc các chapter theo thứ tự không?

Chapter 1 thúc đẩy motivation cho dự án. Chapter 2 thiết lập three-layer architecture. Chapter 3 là agent loop. Các chapter còn lại là reference material có thể lấy ra đọc khi cần. Nếu bạn đọc để hiểu codebase, đi theo chapter 1 đến 3 theo thứ tự là đúng đường.

### Các chapter tiếng Anh ghi "v0.80.2" trong version note. Còn cập nhật không?

Không. Pi SDK hiện ở v0.84.2 tính đến lần kiểm tra cuối. Bản dịch tiếng Anh được làm dựa trên v0.80.2. Kiến trúc mô tả trong chapter 2 và 3 không đổi. Các chapter mới hơn (chưa dịch) bao gồm các tính năng mới hơn (fullscreen TUI mode, PiClient, Mermaid theming). Bản sửa đổi tương lai sẽ bump version note.

### Vì sao có snippet TypeScript và có snippet JavaScript?

Pi SDK viết bằng TypeScript. TypeScript là nguồn sự thật. JavaScript chỉ xuất hiện khi ràng buộc runtime bắt buộc. Cả hai đều hợp lệ; snippet TypeScript được ưu tiên.

### Có thể copy snippet vào project riêng không?

Có, với một lưu ý: snippet giả định `@pi-ai/core` hoặc `@pi-agent-core` đã được cài. Xem [Quickstart](/vi/quickstart/) để biết pattern cài đặt.

## Đóng góp

### Báo lỗi dịch thế nào?

Mở issue tại [github.com/pifydev/docs/issues](https://github.com/pifydev/docs/issues) và tag `translation`. Kèm chapter slug và câu bị lỗi.

### Tôi có thể thêm chapter không?

Có. Hãy mở PR với các file chapter tiếng Anh và tiếng Việt tương ứng. Việc review bản dịch được thực hiện thủ công.

### Style guide biên tập ở đâu?

Cuốn sách theo house rules trong [CONTRIBUTING.md](https://github.com/pifydev/docs/blob/main/CONTRIBUTING.md). Phiên bản ngắn: giữ thuật ngữ kỹ thuật tiếng Anh trong bản dịch, dùng sentence case cho heading, ưu tiên active voice.

## Lỗi hay gặp

### Tool result không đến được model.

Kiểm tra handler tool trả về block `tool_result` với cùng `tool_use_id` đã đến. Id lệch nhau sẽ bị drop âm thầm.

### Session không resume.

Session được lưu dưới thư mục Pi home, mặc định `~/.pi/agent/sessions/`. Xác nhận đường dẫn tồn tại và working directory lúc khởi động khớp.

### TUI render xấu qua SSH.

Đặt `PI_TUI_ESC_TIMEOUT` cao hơn. Pi 0.84.x thêm núm chỉnh này cho terminal có độ trễ cao. Xem [Reference: Environment Variables](/vi/reference/environment-variables/#pi_tui_esc_timeout).

### Model trả 429 dù key hợp lệ.

Bạn đang bị rate limit. Pi tự retry với backoff. Nếu rate limit vẫn còn, kiểm tra quota tài khoản hoặc chuyển sang model nhỏ hơn.
