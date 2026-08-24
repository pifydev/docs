---
title: 'Chương 4: Gọi model qua nhiều provider'
description: Cách Pi đăng ký provider, resolve model, chuyển đổi request và chuẩn hóa streaming response.
translation_key: ch04-model-invocation
language: vi
chapter: 4
source_url: 'https://www.dgzhuya.com/modules/ch04-model-invocation'
official_refs:
  - 'https://github.com/badlogic/pi-mono/blob/main/packages/ai/README.md'
terms_used:
  - Model
  - Provider
  - Provider Adapter
  - Stream
status: reviewed
last_updated: '2026-08-24'
translator: Pify maintainers
reviewed_by: Pify maintainers
---
Pi AI cung cấp một model interface chung nhưng vẫn giữ capability riêng của từng provider. Abstraction này gồm bốn phần: model collection, provider registration, provider adapter và event stream đã chuẩn hóa.

## 1. Entry point hiện tại

Ứng dụng tạo một `Models` collection và chỉ đăng ký provider thật sự cần. `builtinModels()` là lựa chọn tiện lợi khi bundle size không quan trọng.

```typescript
import { builtinModels } from "@earendil-works/pi-ai/providers/all";

const models = builtinModels();
const model = models.getModel("anthropic", "claude-sonnet-4-5");
if (!model) throw new Error("Model not found");
```

`Models.getModel()` tra cứu đồng bộ trong các catalog đã đăng ký. Record `Model` trả về chứa provider ID, model ID, API, capability, token limit và pricing metadata mà request layer cần.

## 2. Một model call

`Models.streamSimple()` nhận model cùng `Context` không phụ thuộc provider:

```typescript
const stream = models.streamSimple(model, {
  systemPrompt: "Answer with verified facts only.",
  messages: [
    {
      role: "user",
      content: "Explain the difference between SSE and WebSocket transport.",
      timestamp: Date.now(),
    },
  ],
  tools: [],
});

for await (const event of stream) {
  if (event.type === "text_delta") {
    process.stdout.write(event.delta);
  }
}

const response = await stream.result();
```

Stream vừa là async iterable vừa là result handle. Vòng lặp đọc event tăng dần; `result()` trả về `AssistantMessage` hoàn chỉnh.

## 3. Dispatch theo model ownership

`Models` collection ghi provider nào sở hữu từng model. Một call đi theo đường sau:

```text
Model
  -> owning provider registration
  -> provider stream implementation
  -> API adapter
  -> HTTP hoặc WebSocket transport
  -> normalized AssistantMessageEventStream
```

Ứng dụng không cần switch theo tên provider. Bước dispatch dùng model record và registration đã cài trong collection.

## 4. Provider adapter

Provider adapter chuyển đổi theo hai hướng:

1. Chuyển `Context`, `Message`, `Tool` và option của Pi thành provider-specific request body.
2. Chuyển provider response frame thành Pi event và `AssistantMessage` cuối.

Provider-specific data dừng tại boundary này. Public stream dùng các event name ổn định như `start`, `text_start`, `text_delta`, `toolcall_start`, `toolcall_delta`, `toolcall_end`, `done` và `error`.

Các opaque field cần cho hội thoại nhiều lượt, chẳng hạn thinking signature hoặc provider response ID, được giữ trong Pi message type thay vì phơi raw response payload.

## 5. `stream()` và `streamSimple()`

Dùng `streamSimple()` khi shared option đã đủ. Hàm này nhận reasoning level chuẩn hóa và trả cùng event model cho mọi provider.

Dùng `stream()` khi code cần đầy đủ option type của một provider API. Hãy narrow model theo API trước khi truyền provider-specific option để TypeScript kiểm tra request.

Các global function cũ `getModel()` và `streamSimple()` vẫn nằm trong `@earendil-works/pi-ai/compat`. Code mới nên dùng `Models` instance để registration và ownership luôn rõ ràng.

## 6. Xác thực và request option

Provider factory mặc định đọc biến môi trường được ghi trong tài liệu của provider đó. Một call cũng có thể truyền các shared request option như:

- `signal` để hủy;
- `apiKey` để dùng credential chỉ định;
- `headers` cho custom header được hỗ trợ;
- `timeoutMs`, `maxRetries` và `maxRetryDelayMs`;
- `sessionId` cho provider cache hoặc request affinity;
- hook `onPayload` và `onResponse` để kiểm tra có kiểm soát.

Không log credential hoặc provider payload chưa được redact từ các hook này.

## 7. Lỗi nằm trong stream contract

Provider failure dự kiến tạo event `error` và assistant message cuối có `stopReason: "error"`. Hành động hủy tạo `stopReason: "aborted"`. Consumer vì thế có thể lưu một outcome hoàn chỉnh mà không phải bắt exception shape khác nhau cho từng provider.

Lỗi cấu hình xảy ra trước khi request bắt đầu, như model không tồn tại hoặc thiếu provider registration, cần được xử lý tại bước lookup hoặc setup.

## 8. Đăng ký custom provider

Custom provider phải cung cấp provider ID ổn định, model catalog hoặc discovery function, cơ chế xác thực và stream implementation cho API được hỗ trợ. Nếu service tương thích OpenAI, hãy bắt đầu từ custom-provider helper trong tài liệu thay vì sao chép một built-in adapter.

Giữ custom code tại provider boundary:

- chuyển đổi request đúng một lần;
- phát Pi event type theo đúng thứ tự;
- giữ nguyên `ToolCall.id` và tool arguments;
- báo usage và stop reason khi service cung cấp;
- ánh xạ provider failure về normalized error result.

Xem [Tích hợp model provider](how-to/plug-new-model.md) để thực hiện theo từng bước.

## 9. Quy tắc thiết kế

Model layer giữ được tính portable khi caller tuân theo ba quy tắc:

1. Resolve model từ chính `Models` collection được dùng để stream.
2. Giữ provider-specific option sau boundary đã narrow theo API.
3. Lưu normalized Pi message trong application state, không lưu raw provider response.

[Chương 5](ch05-tool-system.md) theo dõi `ToolCall` từ model response qua validation tới execution.
