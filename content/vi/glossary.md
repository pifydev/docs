---
title: Thuật ngữ
description: Các thuật ngữ Pi được dùng thống nhất trong tài liệu tiếng Anh và tiếng Việt.
translation_key: glossary
language: vi
status: reviewed
reviewed_by: Pify maintainers
last_updated: '2026-10-01'
---
Các định nghĩa dưới đây bám theo package Pi hiện tại. Identifier, tên package, command, đường dẫn, configuration key và biến môi trường luôn được giữ nguyên.

:::note[Vì sao cần bảng thuật ngữ]

Pi sử dụng nhất quán một nhóm thuật ngữ kỹ thuật nhỏ trong các package. Những định nghĩa này giúp đọc mã nguồn nhanh hơn và giữ hai bản tiếng Anh, tiếng Việt đồng bộ. Luôn giữ nguyên identifier và tên package. Nếu một thuật ngữ không có trong danh sách, hãy hiểu theo nghĩa tiếng Anh thông thường, trừ khi mã nguồn định nghĩa hẹp hơn. Bản tiếng Việt có thể dịch khái niệm chung sau khi nêu thuật ngữ tiếng Anh chuẩn ở lần xuất hiện đầu tiên.

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

## Composition Root

Composition root là ranh giới khởi động duy nhất, nơi ứng dụng tạo các dependency cụ thể rồi kết nối chúng với interface mà phần còn lại của hệ thống sử dụng. Ví dụ, composition root của CLI có thể tạo provider adapter, session store và Tool, sau đó inject chúng vào agent runtime.

## Context Window

Số token tối đa model có thể xử lý trong một request. Pi ước tính lượng token đang dùng và có thể nén phần ngữ cảnh cũ trước khi vượt giới hạn này.

## Descriptor

Một record `Model` có cấu trúc, chứa provider ID, model ID, API, capability, giới hạn ngữ cảnh và metadata về giá. `Models.getModel(provider, id)` lấy record này từ model collection đã đăng ký.

## Event

Sự kiện (event) có kiểu do model stream hoặc agent runtime phát ra. Các sự kiện model stream gồm `start`, `text_start`, `text_delta`, `text_end`, `toolcall_start`, `toolcall_delta`, `toolcall_end`, `done` và `error`.

## Extension

Module TypeScript được nạp trong process của coding agent. Extension có thể đăng ký Tool và command, theo dõi lifecycle event và tùy chỉnh hành vi qua extension API được công bố.

## Fail-closed

Fail-closed là hành vi an toàn từ chối hoặc dừng operation khi một quyết định bắt buộc bị thiếu, không hợp lệ hoặc không thể lấy được, thay vì mặc định cho phép operation. Ví dụ, nếu [judge](#judge) của policy gặp lỗi, tool gate theo nguyên tắc fail-closed sẽ ghi [verdict](#verdict) từ chối và không chạy Tool.

## Fixture

Fixture là input, state hoặc expected output cố định, có thể tái sử dụng cho một test case hay evaluation case. Fixture chứa dữ liệu của ca kiểm thử—ví dụ một conversation cùng chuỗi model event được định sẵn bằng script—còn [harness](#harness) là hạ tầng chạy dữ liệu đó.

## Harness

Harness là hạ tầng thực thi test hoặc evaluation: điều khiển system under test, nạp fixture, thu lại hành vi và báo cáo kết quả. Harness chạy [fixture](#fixture); nó không tự quyết định kết quả có đạt hay không, trừ khi gọi thêm một [judge](#judge).

## Held-out Evaluation

Held-out evaluation là phép đánh giá trên các ca không được dùng trong quá trình implementation hoặc prompt tuning. So sánh kết quả held-out evaluation với development set đã biết giúp phát hiện việc tối ưu quá mức cho các fixture đã biết.

## Judge

Judge là bộ đánh giá áp dụng tiêu chí rõ ràng cho một kết quả quan sát được. Judge có thể được triển khai bằng code hoặc model, cũng có thể do con người trực tiếp thực hiện. Judge tạo ra [verdict](#verdict); [harness](#harness) chỉ cung cấp observation và ghi lại kết luận đó.

## Managed Tools

Bốn Tool `read`, `write`, `edit` và `bash` được coding agent cung cấp mặc định. Có thể bật thêm các Tool chỉ đọc như `grep`, `find` và `ls` qua cấu hình Tool.

## Message

Record có kiểu được truyền qua các lớp model và agent. Package Pi AI định nghĩa `SystemMessage`, `UserMessage`, `AssistantMessage` và `ToolResultMessage`; provider adapter chuyển các record này sang wire format của từng provider.

## Model Provider

Dịch vụ xử lý model request, chẳng hạn Anthropic, OpenAI, Google, Bedrock hoặc local server tương thích. Mỗi provider registration bổ sung model, cơ chế xác thực và hàm streaming vào một `Models` collection.

## Pi

Bộ công cụ agent mã nguồn mở được duy trì trong repository `earendil-works/pi`. Tên viết thường `pi` chỉ command của coding-agent CLI.

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

## Test Double

Test double là thành phần thay thế có kiểm soát cho dependency thật trong khi test. Ví dụ, một test double của model provider chạy theo script có thể phát stream event xác định mà không cần network access, giúp harness kiểm tra agent loop theo cách tái lập được.

## Tool

Hàm được cung cấp cho model bằng tên, mô tả và TypeBox schema cho tham số. Khi model trả về `ToolCall`, agent kiểm tra arguments, chạy implementation tương ứng và thêm một `ToolResultMessage`.

## Tool Use

Chuỗi protocol trong đó assistant message chứa một `ToolCall`, sau đó `ToolResultMessage` tham chiếu tool call đó bằng ID.

## Provider Adapter

Implementation riêng cho từng provider, chịu trách nhiệm chuyển message và option của Pi thành provider request, sau đó chuyển response stream về các sự kiện Pi.

## Turn

Một assistant response cùng lô Tool được chấp nhận từ response đó, nằm giữa `turn_start` và `turn_end`. Một Agent run có thể chứa nhiều Turn, do đó có thể có nhiều model call.

## Verdict

Verdict là kết luận có cấu trúc do [judge](#judge) tạo ra, chẳng hạn pass/fail, score hoặc label kèm lý do. Judge là cơ chế ra quyết định; verdict là kết quả được ghi lại.

## Codemode

Chế độ thực thi của Pi coding agent, cung cấp môi trường JavaScript để model điều phối các Tool được nạp theo yêu cầu. Ban đầu Codemode chỉ đưa vào metadata khám phá nhỏ gọn, sau đó mới nạp và gọi đúng Tool mà script cần.

## MCP server/Tool exposure

MCP server cung cấp exposure mặc định, còn `toolExposure` là boundary override theo từng Tool. Tool `direct` được khai báo cho model; Tool `codemode` không nằm trong declaration của model; Tool `deferred` chưa được khai báo cho đến khi `tool_search` nạp nó để model gọi trực tiếp; Tool `hidden` không thể được khám phá hay gọi. Các Tool hợp lệ mang exposure `direct`, `codemode` và `deferred` đều có thể được gọi từ Codemode; Tool `hidden` thì không.

## Virtual Model

Route có giao diện như model, trong đó selector chọn physical model tại thời điểm gửi request. Session history ghi identity của Virtual Model, còn routing metadata lưu physical target đã chọn cho request đó.

## physical model

Provider và model descriptor cụ thể được chọn phía sau Virtual Model. Credential của provider, khả năng thinking, giới hạn token và usage accounting đều lấy từ physical model này.

## Durable Harness

Entry point runtime thử nghiệm của `@earendil-works/pi-durable`, quản lý durable storage, Tool đã đăng ký, Conversation, Document và Task. Sau khi process khởi động lại, Harness tiếp tục durable Task từ checkpoint đã commit. Execution của Tool bị gián đoạn chỉ được chạy lại khi replay policy là safe (`replay: "safe"`); execution unsafe sẽ trở thành error Tool result.

## Submission

Handle bền vững được trả về khi input hoặc write được nhận vào Conversation. Có thể chờ hoặc abort handle này độc lập; việc cancel một wait không hủy durable work.

## replay policy

Khai báo của Tool cho biết execution bị gián đoạn có được replay hay không. Chỉ `replay: "safe"` cho phép Durable Harness chạy lại Tool đó sau recovery.
