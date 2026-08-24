---
title: 'Chương 8: Kỹ thuật ngữ cảnh'
description: Cách Pi ghép system instruction, project context, message, Tool và dữ liệu truy xuất cho mỗi model call.
translation_key: ch08-context-engineering
language: vi
chapter: 8
source_url: 'https://www.dgzhuya.com/modules/ch08-context-engineering'
official_refs:
  - 'https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/usage.md#context-files'
  - 'https://github.com/badlogic/pi-mono/blob/main/packages/agent/README.md#message-flow'
terms_used:
  - Context
  - Context Engineering
  - System Prompt
  - transformContext
  - convertToLlm
status: reviewed
last_updated: '2026-08-24'
translator: Pify maintainers
reviewed_by: Pify maintainers
---
Kỹ thuật ngữ cảnh (context engineering) là quá trình chọn instruction, message, định nghĩa Tool và thông tin bên ngoài cho một model request. Ngữ cảnh tốt phải liên quan, có thứ tự, audit được và đủ nhỏ để chừa chỗ cho response.

## 1. Request context

`Context` của Pi AI có ba phần rõ ràng:

```typescript
interface Context {
  systemPrompt?: string;
  messages: Message[];
  tools?: Tool[];
}
```

Coding agent xây ba phần này từ nhiều application source trước khi Agent core chuyển chúng sang model layer.

## 2. Nguồn system prompt

Pi bắt đầu bằng coding-agent prompt mặc định. Người dùng có thể thay hoặc mở rộng prompt qua:

- `.pi/SYSTEM.md` cho dự án;
- `~/.pi/agent/SYSTEM.md` ở global scope;
- `APPEND_SYSTEM.md` tại một trong hai vị trí để nối instruction;
- `--system-prompt` hoặc `--append-system-prompt` cho một lần chạy;
- nội dung do extension đóng góp.

Thay thế và nối thêm có semantics khác nhau. Chỉ thay toàn bộ khi bạn chủ động sở hữu toàn bộ instruction contract.

## 3. File ngữ cảnh dự án

Khi khởi động, Pi tìm `AGENTS.md` hoặc `CLAUDE.md` theo directory hierarchy, đồng thời nạp `~/.pi/agent/AGENTS.md` cho instruction global. Nếu một thư mục có `AGENTS.override.md`, file đó thay `AGENTS.md` hoặc `CLAUDE.md` trong cùng thư mục.

Context file phù hợp cho:

- build command và test command;
- quy ước repository;
- safety constraint;
- architectural boundary;
- response preference riêng của dự án.

Giữ nội dung factual và ổn định. Chi tiết riêng của task nên nằm trong user message hiện tại hoặc file được tham chiếu.

## 4. Project trust

Project-local setting, extension, package, prompt, skill và theme có thể chạy code hoặc ảnh hưởng behavior. Pi áp dụng project-trust flow trước khi nạp các resource đó.

Non-interactive mode không thể hiện trust prompt. Chúng dùng `defaultProjectTrust` trừ khi caller truyền `--approve` hoặc `--no-approve`.

Hãy xem context discovery là input boundary. Review instruction từ repository lạ trước khi cho phép chúng kích hoạt Tool hoặc extension.

## 5. Biến đổi message history

Agent core cung cấp hai stage:

```typescript
const agent = new Agent({
  streamFn: models.streamSimple.bind(models),
  transformContext: async (messages, signal) => {
    return selectRelevantMessages(messages, { signal });
  },
  convertToLlm: (messages) => {
    return messages.filter(isModelMessage);
  },
});
```

`transformContext` làm việc với `AgentMessage[]`. Dùng hook này cho retrieval, pruning hoặc application-specific compaction.

`convertToLlm` tạo Pi AI `Message[]` cuối. Dùng nó để loại hoặc chuyển custom agent role. Provider-specific conversion diễn ra sau đó trong Pi AI.

## 6. Tool cũng là ngữ cảnh

Mỗi tên Tool, description và parameter schema đều chiếm context và ảnh hưởng model behavior. Chỉ cung cấp Tool liên quan tới task hiện tại.

Tool description nên nêu:

- Tool làm gì;
- khi nào nên dùng;
- constraint model phải biết trước khi gọi;
- ý nghĩa chính xác của arguments.

Authorization và path validation vẫn thuộc runtime policy. Prompt instruction không phải security boundary.

## 7. Skill, prompt template và extension

Ba cơ chế đóng góp ngữ cảnh ở các thời điểm khác nhau:

| Cơ chế | Vai trò |
| --- | --- |
| Prompt template | Mở rộng workflow Markdown có tên thành user prompt |
| Skill | Cung cấp instruction và resource có thể tái sử dụng cho loại task cụ thể |
| Extension | Có thể đăng ký Tool, command, hook và dynamic context |

Dùng Markdown tĩnh khi thông tin ổn định. Dùng extension khi context phụ thuộc runtime state hoặc external system.

## 8. Ngữ cảnh truy xuất và ngữ cảnh tạo sinh

Retrieved context nên kèm source và đủ đoạn xung quanh để hiểu đúng. Ưu tiên một số passage có độ tin cậy cao thay vì dump nhiều nội dung không phân loại.

Generated summary phải giữ decision, constraint, phần việc chưa xong và identifier cần để tiếp tục. Không được bịa thêm fact chỉ để câu chuyện trôi chảy hơn.

Tool output cũng là context source. Hãy truncate hoặc summarize output lớn trước các model call lặp lại, nhưng giữ evidence chính xác cần cho decision hiện tại.

## 9. Token budget và compaction

Phân bổ context window cho:

1. system instruction và project instruction;
2. conversation message gần đây;
3. định nghĩa Tool;
4. retrieved hoặc generated context;
5. phần dự trữ cho model response.

Khi hội thoại gần configured threshold, Pi compact phần history cũ và giữ một recent tail. Compaction làm mất thông tin, vì vậy summary phải giữ actionable state thay vì mọi câu chữ. [Chương 9](ch09-compaction.md) trình bày thuật toán.

## 10. Checklist chất lượng ngữ cảnh

Trước một request, hãy kiểm tra:

- relevance: mỗi phần đều giúp task hiện tại;
- authority: source và precedence rõ ràng;
- consistency: instruction không xung đột âm thầm;
- recency: dữ liệu phụ thuộc version còn mới hoặc đã được pin;
- safety: untrusted text không thể tự cấp authority;
- size: request chừa đủ chỗ cho response hữu ích;
- traceability: fact quan trọng truy ngược được tới file, message hoặc Tool result.

Context engineering hiệu quả nhất khi được triển khai như deterministic pipeline. Ghi lại source nào được chọn và lý do, đồng thời redact secret cùng private content.
