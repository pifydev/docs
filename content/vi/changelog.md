---
title: Nhật ký thay đổi
description: Các thay đổi của website tài liệu Pify, tách biệt với changelog của Pi SDK.
translation_key: changelog
language: vi
status: reviewed
reviewed_by: Pify maintainers
last_updated: '2026-09-04'
---
Trang này ghi các thay đổi của website tài liệu Pify. Để xem release của Pi, hãy dùng [lịch sử release upstream](https://github.com/earendil-works/pi/releases).

## 2026-09-04

Baseline của tài liệu Pify nay theo [release Pi `0.85.0` chính thức](https://github.com/earendil-works/pi/releases/tag/v0.85.0) và bao gồm rõ release trung gian [Pi `0.84.4`](https://github.com/earendil-works/pi/releases/tag/v0.84.4). Đây là phần tóm tắt các thay đổi ảnh hưởng tới người dùng mà đợt phát hành tài liệu ghi nhận, không phải bản sao changelog upstream của Pi.

### Khả năng mới

- Ghi lại cách khôi phục external session qua `SessionManager.inMemory()` và ranh giới ownership đối với entry do bên ngoài lưu trữ.
- Ghi lại persistent Claude thinking effort: các transport Anthropic được hỗ trợ giữ nguyên effort theo từng lượt và phục hồi an toàn khi signed-thinking không khớp; `supportsMidConvoEffort` là cơ chế docs/API để nhận diện transport Anthropic phù hợp với hành vi này.
- Bổ sung các field tương thích model `vllmPriority` và `supportsMaxOutputTokens` cho capability kế thừa của transport tương thích OpenAI.
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
