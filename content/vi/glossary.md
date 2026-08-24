---
title: Thuật ngữ
description: Các thuật ngữ Pi được dùng thống nhất trong tài liệu tiếng Anh và tiếng Việt.
translation_key: glossary
language: vi
status: reviewed
reviewed_by: Pify maintainers
last_updated: '2026-08-24'
---
Các định nghĩa dưới đây bám theo package Pi hiện tại. Identifier, tên package, command, đường dẫn, configuration key và biến môi trường luôn được giữ nguyên.

:::note[Quy tắc dịch]

Bản tiếng Việt giữ nguyên tên sản phẩm và identifier trong code. Khái niệm thông thường có thể được dịch, nhưng lần xuất hiện đầu tiên phải kèm thuật ngữ tiếng Anh chuẩn.

:::

## Agent

Runtime gửi ngữ cảnh tới model, cung cấp Tool, xử lý tool call và theo dõi state. Implementation cốt lõi được phát hành qua package `@earendil-works/pi-agent-core`.

## Agent Loop

Vòng lặp Agent (Agent Loop) thực hiện chuỗi `prompt -> model response -> tool calls -> tool results -> model response` trong một lượt xử lý. Pi phát các sự kiện có kiểu trong khi vòng lặp chạy.

## Block

Một phần tử có kiểu trong nội dung message. Các loại thường gặp gồm `text`, `thinking` và `toolCall`. Message `toolResult` trả lại kết quả của một tool call.

## Coding Agent

Ứng dụng dòng lệnh Pi được phát hành dưới tên `@earendil-works/pi-coding-agent`. Package này bổ sung TUI, ngữ cảnh dự án, Tool tích hợp, phiên làm việc, extension, skill và cấu hình quanh agent runtime.

## Compaction

Nén ngữ cảnh (compaction) thay phần hội thoại cũ bằng một bản tóm tắt có cấu trúc, đồng thời giữ nguyên các message gần đây. Cơ chế này giúp phiên làm việc tiếp tục trước khi vượt context window của model. Xem [Chương 9: Nén ngữ cảnh](ch09-compaction.md).

## Context Window

Số token tối đa model có thể xử lý trong một request. Pi ước tính lượng token đang dùng và có thể nén phần ngữ cảnh cũ trước khi vượt giới hạn này.

## Descriptor

Một record `Model` có cấu trúc, chứa provider ID, model ID, API, capability, giới hạn ngữ cảnh và metadata về giá. `Models.getModel(provider, id)` lấy record này từ model collection đã đăng ký.

## Event

Sự kiện (event) có kiểu do model stream hoặc agent runtime phát ra. Các sự kiện model stream gồm `start`, `text_start`, `text_delta`, `text_end`, `toolcall_start`, `toolcall_delta`, `toolcall_end`, `done` và `error`.

## Extension

Module TypeScript được nạp trong process của coding agent. Extension có thể đăng ký Tool và command, theo dõi lifecycle event và tùy chỉnh hành vi qua extension API được công bố.

## Managed Tools

Bốn Tool `read`, `write`, `edit` và `bash` được coding agent cung cấp mặc định. Có thể bật thêm các Tool chỉ đọc như `grep`, `find` và `ls` qua cấu hình Tool.

## Message

Record có kiểu được truyền qua các lớp model và agent. Package Pi AI định nghĩa `UserMessage`, `AssistantMessage` và `ToolResultMessage`; provider adapter chuyển các record này sang wire format của từng provider.

## Model Provider

Dịch vụ xử lý model request, chẳng hạn Anthropic, OpenAI, Google, Bedrock hoặc local server tương thích. Mỗi provider registration bổ sung model, cơ chế xác thực và hàm streaming vào một `Models` collection.

## Pi

Bộ công cụ agent mã nguồn mở được duy trì trong `badlogic/pi-mono` và mirror tại `earendil-works/pi`. Tên viết thường `pi` chỉ command của coding-agent CLI.

## Session

Phiên làm việc (session) là lịch sử hội thoại được lưu bền vững. Coding agent lưu session dưới dạng JSONL, hỗ trợ phân nhánh và có thể tiếp tục một nhánh trước đó. Xem [Chương 10: Quản lý phiên làm việc](ch10-session.md).

## Skill

File chỉ dẫn có thể tái sử dụng, được tìm trong các thư mục skill đã cấu hình. Mỗi skill mô tả điều kiện áp dụng và hướng dẫn riêng cho một loại tác vụ.

## Stream

Một `AssistantMessageEventStream`: vừa là async iterable chứa các sự kiện có kiểu, vừa là handle dùng để lấy kết quả cuối.

## Subagent

Agent được khởi chạy để thực hiện một tác vụ giới hạn thay cho agent khác. Pi hỗ trợ workflow subagent qua extension và implementation mẫu, thay vì cố định một chính sách điều phối trong core loop.

## System Prompt

Phần chỉ dẫn được gửi cùng model context. Coding agent ghép system prompt từ giá trị mặc định, file ngữ cảnh dự án, tùy chọn dòng lệnh và nội dung do extension cung cấp. Xem [Chương 8: Kỹ thuật ngữ cảnh](ch08-context-engineering.md).

## Tool

Hàm được cung cấp cho model bằng tên, mô tả và TypeBox schema cho tham số. Khi model trả về `ToolCall`, agent kiểm tra arguments, chạy implementation tương ứng và thêm một `ToolResultMessage`.

## Tool Use

Chuỗi protocol trong đó assistant message chứa một `ToolCall`, sau đó `ToolResultMessage` tham chiếu tool call đó bằng ID.

## Provider Adapter

Implementation riêng cho từng provider, chịu trách nhiệm chuyển message và option của Pi thành provider request, sau đó chuyển response stream về các sự kiện Pi.

## Turn

Một user request cùng toàn bộ model/tool work cần thiết để agent đạt state ổn định tiếp theo. Một lượt có thể chứa nhiều model call khi model gọi Tool.
