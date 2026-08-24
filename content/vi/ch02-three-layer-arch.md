---
title: 'Chương 2: Kiến trúc ba lớp'
description: Cách Pi tách provider transport, agent runtime và ứng dụng coding agent.
translation_key: ch02-three-layer-arch
language: vi
chapter: 2
source_url: 'https://www.dgzhuya.com/modules/ch02-three-layer-arch'
official_refs:
  - 'https://github.com/badlogic/pi-mono/tree/main/packages'
terms_used:
  - Model
  - Provider
  - Agent
  - Coding Agent
  - TUI
status: reviewed
last_updated: '2026-08-24'
translator: Pify maintainers
reviewed_by: Pify maintainers
---
Pi tách ba trách nhiệm: giao tiếp với model, chạy agent và cung cấp sản phẩm coding. Package graph thực thi ranh giới này bằng hướng dependency, không chỉ bằng tên package.

## 1. Ba lớp

| Lớp | Package | Trách nhiệm |
| --- | --- | --- |
| Model | `@earendil-works/pi-ai` | Model, provider registration, message, Tool, xác thực, streaming |
| Agent | `@earendil-works/pi-agent-core` | State, vòng lặp model/Tool, hàng chờ, context transform, runtime event |
| Ứng dụng | `@earendil-works/pi-coding-agent` | CLI, ngữ cảnh dự án, Tool tích hợp, session, extension, skill |

`@earendil-works/pi-tui` là presentation package độc lập. Coding agent dùng package này; model layer và agent layer thì không.

## 2. Lớp 1: model transport

Model layer trả lời một câu hỏi: làm sao ứng dụng gọi nhiều provider qua cùng typed interface?

Package này định nghĩa các type dùng chung như `Model`, `Message`, `Tool`, `Context` và stream event. Provider factory đăng ký model catalog cùng implementation của `stream()` và `streamSimple()`.

```typescript
import { createModels } from "@earendil-works/pi-ai";
import { openAIProvider } from "@earendil-works/pi-ai/providers/openai";

const models = createModels();
models.setProvider(openAIProvider());

const model = models.getModel("openai", "gpt-5-mini");
if (!model) throw new Error("Model not found");
```

Đoạn code này không biết về session, terminal hoặc vòng lặp Agent. Kết quả là một model descriptor và collection có thể gửi streaming request.

## 3. Lớp 2: agent runtime

Agent layer bổ sung state và control flow. Nó quản lý:

- system prompt, model, Tool, message và thinking level hiện tại;
- vòng lặp luân phiên giữa model call và chạy Tool;
- boundary `transformContext` và `convertToLlm`;
- hàng chờ steering và follow-up;
- lifecycle event cho application consumer.

Runtime nhận model stream function qua cấu hình:

```typescript
const agent = new Agent({
  initialState: { systemPrompt, model, tools },
  streamFn: models.streamSimple.bind(models),
});
```

Cách inject này giữ runtime độc lập với provider registry cụ thể và giúp boundary dễ test.

## 4. Lớp 3: ứng dụng coding agent

Coding-agent package biến runtime thành sản phẩm `pi`. Nó quyết định application policy:

- nạp file chỉ dẫn global và file chỉ dẫn dự án nào;
- cung cấp implementation Tool nào;
- lưu credential, setting và session ở đâu;
- render event trong TUI ra sao;
- tìm extension, skill, prompt template, theme và package như thế nào.

Các quyết định này nằm trên agent runtime vì một sản phẩm khác có thể dùng storage, permission hoặc presentation khác.

## 5. Đường đi của dữ liệu

Một interactive request thông thường đi qua các lớp theo thứ tự:

1. Coding agent nhận user input và ngữ cảnh dự án.
2. Agent runtime thêm user message và chuẩn bị model context tiếp theo.
3. `transformContext` có thể lược bỏ hoặc chèn agent message.
4. `convertToLlm` tạo `Message[]` cho model layer.
5. Pi AI chọn provider đã đăng ký và mở model stream.
6. Runtime cập nhật state từ stream event và chạy Tool nếu model yêu cầu.
7. Coding agent render event và lưu các session entry mới.

Response đi ngược qua cùng các boundary. Provider-specific payload dừng trong Pi AI; coding agent chỉ nhận event và agent message đã chuẩn hóa.

## 6. Quy tắc dependency

Kiến trúc giữ được tính rõ ràng khi tuân theo các quy tắc sau:

### 6.1 Lớp dưới không import product policy

Pi AI không được import setting của coding agent hoặc terminal component. Agent core không nên giả định một session directory hay permission UI cụ thể.

### 6.2 Truyền hành vi qua interface hẹp

Agent nhận `streamFn`, context transform, hook và implementation Tool dưới dạng value. Cách này rõ hơn việc dạy runtime tự tìm mọi application service.

### 6.3 Giữ nguyên protocol identifier tại boundary

Các type như `ToolCall`, `ToolResultMessage`, provider ID, model ID và event name là contract. Chỉ dịch phần giải thích xung quanh, không dịch identifier.

## 7. Chọn đúng layer

| Thay đổi | Layer phù hợp |
| --- | --- |
| Thêm request header riêng cho provider | Pi AI provider adapter |
| Lọc UI-only message trước model call | `convertToLlm` của Agent |
| Chặn shell command nguy hiểm | Tool policy hoặc coding-agent extension |
| Thêm terminal panel | Coding agent hoặc Pi TUI |
| Lưu session bằng backend khác | Application/session integration |

Khi một thay đổi đi qua nhiều layer, hãy đặt shared type tại layer thấp nhất sở hữu khái niệm và giữ policy ở layer cao nhất cần policy đó.

## 8. Bước tiếp theo

[Chương 3](ch03-agent-loop.md) theo dõi agent runtime qua một prompt hoàn chỉnh, gồm streaming, tool call, message trong hàng chờ và điều kiện kết thúc.
