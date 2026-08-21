---
title: "Glossary"
description: "Các thuật ngữ Pi tự đặt cho mình. Nguyên bản tiếng Anh được giữ trong các bản dịch để ghi chú đọc source code không bị mơ hồ."
template: doc
sidebar:
  label: "Glossary"
  order: 2
---

Glossary này tổng hợp các thuật ngữ tiếng Anh mà Pi dùng cho chính nó. Bản dịch giữ nguyên các thuật ngữ gốc này. Một thuật ngữ xuất hiện ở đây khi nó có ý nghĩa chính xác trong codebase của Pi, hoặc khi dịch nguyên văn sẽ gây hiểu lầm.

:::note[Vì sao có glossary]
Pi dùng một từ vựng nhỏ gọn và dùng mỗi từ với chủ đích. Đọc source mà không có các định nghĩa này thì được nhưng chậm. Nếu một chapter dùng thuật ngữ không có trong danh sách này, hãy hiểu theo nghĩa tiếng Anh thông thường.
:::

## Agent

Chương trình điều khiển LLM. Agent sở hữu loop, tool surface, và session state. Trong Pi, agent được tách qua hai package: `@pi-agent-core` chứa loop, `@pi-coding-agent` thêm CLI shell, prompt expansion, và managed tool.

## Agent Loop

Chuỗi lặp `prompt -> model -> tool calls -> tool results -> model` điều khiển một turn. Pi hiện thực loop trong `agentLoop()` bên trong `@pi-agent-core`. Loop là event-driven, không phải callback-based; consumer subscribe vào một stream các event có kiểu.

## Block

Một đơn vị unit bên trong một turn. Một turn gồm một hoặc nhiều block. Ví dụ block type: `text`, `thinking`, `tool_use`, `tool_result`. Block chảy trong message stream theo thứ tự khai báo.

## Coding Agent

CLI đi kèm. Chỉ cụ thể ám chỉ `@pi-coding-agent`, package nằm trên `@pi-agent-core` và thêm prompt expansion, permission prompt, và managed tool cho file/bash. Không phải từ đồng nghĩa của "agent".

## Compaction

Quá trình rút gọn cuộc hội thoại dài thành một bản tóm tắt ngắn hơn để vừa context window của model. Pi hiện thực điều này dưới dạng một agent turn riêng biệt tóm tắt các block cũ đồng thời giữ nguyên văn các block gần đây. Xem [Chapter 9: Context Compaction](/vi/ch09-compaction/).

## Context Window

Lượng text tối đa model sẽ đọc trong một request, đo bằng token. Mỗi model có một trần cứng; Pi theo dõi usage theo turn và trigger compaction khi gần trần.

## Descriptor

Mô tả có cấu trúc của một model: provider, model id, request shape, capability, pricing. Pi lưu descriptor trong catalog dưới `@pi-ai/core`. `getModel(provider, id)` trả về một descriptor. Descriptor là đơn vị pluggability cho model mới.

## Event

Một message có kiểu do agent loop hoặc stream phát ra. Ví dụ: `message_start`, `text_delta`, `tool_use`, `tool_result`, `message_update`, `done`. Event chảy qua một async iterable.

## Extension

Một hook do người dùng định nghĩa chạy bên trong tiến trình agent. Extension của Pi có thể đăng ký tool, chặn message, thêm slash command, và override theme token. Extension API ổn định qua các version `pi-coding-agent`.

## Managed Tools

Bốn tool có sẵn `read`, `bash`, `edit`, và `write`. Pi chạy chúng với permission prompt theo mặc định và hỗ trợ YOLO mode bỏ qua prompt.

## Message

Một bản ghi có kiểu truyền giữa agent và model. Pi dùng message hình dạng Anthropic ở protocol layer, sau đó adapt theo provider. Có hai loại message trong Pi: `user` và `assistant`. Tool use và tool result được nhúng trong `assistant` message.

## Model Provider

Dịch vụ HTTP mà SDK gọi đến: Anthropic, OpenAI, Google, OpenRouter, llama.cpp, v.v. Mỗi provider có một translator bên trong `@pi-ai/core` chuyển đổi giữa message của Pi và wire format của provider.

## Pi

Dự án tổng. `Pi` viết hoa luôn ám chỉ Pi Agent SDK của `earendil-works`. `pi` viết thường là CLI binary (`@pi-coding-agent`).

## Session

Một conversation tree được lưu trên đĩa. Session sống trên disk dưới thư mục Pi home và được load theo id. Một session lưu message, branch, metadata, và resolved model. Xem [Chapter 10: Session Management](/vi/ch10-session/).

## Skill

Một prompt template có tên, tái sử dụng được, gọi qua `/skill-name` trong prompt. Skill được lưu trong `~/.pi/agent/skills/` hoặc trong `.pi/skills/` bên trong project.

## Stream

Async iterable của các event trả về bởi `streamSimple` hoặc bởi agent loop. Stream là pull-based: consumer await từng event.

## Subagent

Một agent được một agent khác khởi chạy. Pi hỗ trợ subagent thông qua tool `subagent` và extension API `pi.runSubagent()`. Subagent chạy loop riêng và có thể trả về kết quả cuối hoặc stream ngược lại.

## System Prompt

Khối instruction gửi ở đầu mỗi model call. Pi compose system prompt từ CLI flag, project file (`AGENTS.md`, `SYSTEM.md`), và extension contribution. Xem [Chapter 8: Context Engineering](/vi/ch08-context-engineering/).

## Tool

Một hàm model có thể gọi. Tool được mô tả với model bằng tên, mô tả, và JSON schema cho tham số. Pi dispatch tool call đến handler đã đăng ký và feed kết quả trở lại loop.

## Tool Use

Message ở protocol level biểu diễn việc model yêu cầu gọi một tool. Nó mang theo tên tool, một id, và các tham số. Agent thực thi handler tương ứng và phát ra một `tool_result` ghép đôi.

## Translator

Adapter theo provider bên trong `@pi-ai/core` chuyển đổi message của Pi sang request format của provider và stream của provider ngược lại thành event của Pi. Có một translator cho mỗi provider.

## Turn

Một round-trip của agent loop, kết thúc khi model trả về stop reason. Một turn có thể chứa không hoặc nhiều tool call. Session nhiều turn xâu chuỗi các turn với nhau.
