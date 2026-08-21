---
title: "How to plug in a new model"
description: "Thêm một model provider SDK không có sẵn bằng cách viết một translator và một descriptor."
template: doc
sidebar:
  label: "Gắn model mới"
  order: 2
---

Hướng dẫn này chỉ cách thêm một model provider mà `@pi-ai/core` không có sẵn. Sau khi xong bạn sẽ có thể gọi `getModel("my-provider", "my-model")` và SDK sẽ nói chuyện với provider mới mà không thay đổi gì trong agent loop.

:::tip[Khi nào cần]
- Một llama.cpp server cục bộ
- Một self-hosted model gateway bọc Anthropic hoặc OpenAI
- Một provider thương mại mới chưa được thêm upstream
:::

## Hai nửa

Để gắn model bạn cần đúng hai thứ:

1. **Descriptor** đặt tên model, capability, và nơi gửi request.
2. **Translator** chuyển đổi message của Pi sang wire format của provider và stream của provider ngược lại thành event của Pi.

Descriptor là dữ liệu thuần. Translator là phần code duy nhất bạn viết.

## 1. Viết descriptor

Descriptor là một object literal. Lưu cạnh các descriptor khác.

```ts title="models/my-provider.ts"
import type { ModelDescriptor } from "@pi-ai/core";

export const myModel: ModelDescriptor = {
  id: "my-model",
  provider: "my-provider",
  displayName: "My Model 7B",
  contextWindow: 8192,
  maxOutputTokens: 2048,
  pricing: { input: 0, output: 0 }, // miễn phí cho self-hosted
  capabilities: {
    toolUse: true,
    images: false,
    streaming: true,
    thinking: false,
  },
  baseUrl: "http://localhost:8080/v1",
  apiKeyEnvVar: "MY_PROVIDER_API_KEY",
};
```

`baseUrl` trỏ đến provider. `apiKeyEnvVar` là biến môi trường SDK đọc lúc gọi.

## 2. Đăng ký descriptor

```ts title="models/index.ts"
import { registerModel } from "@pi-ai/core";
import { myModel } from "./models/my-provider.js";

registerModel("my-provider", myModel);
```

`registerModel` là idempotent. Gọi hai lần với cùng provider id sẽ thay thế entry.

## 3. Viết translator

Translator là một object nhỏ với hai method: `request` dựng HTTP body từ message của Pi, và `response` parse stream của provider ngược thành event của Pi.

```ts title="translators/openai-completions.ts"
import type { Translator, Context, Message } from "@pi-ai/core";

export const openaiCompletionsTranslator: Translator = {
  async request(model, context: Context, options) {
    const body = {
      model: model.id,
      messages: [
        ...(context.systemPrompt
          ? [{ role: "system", content: context.systemPrompt }]
          : []),
        ...context.messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
      ],
      stream: true,
    };
    return {
      url: `${model.baseUrl}/chat/completions`,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${process.env[model.apiKeyEnvVar]}`,
      },
      body,
    };
  },

  async *response(model, response, options) {
    // Parse SSE chunk thành event của Pi.
    // Shape chính xác phụ thuộc vào provider.
    // Xem translator Anthropic hoặc OpenAI để có implementation đầy đủ.
    for await (const chunk of parseSse(response)) {
      yield {
        type: "text_delta",
        delta: chunk.choices[0].delta.content ?? "",
      };
    }
    yield { type: "done", reason: "stop" };
  },
};
```

:::note[Đây là skeleton]
Translator thật trong `@pi-ai/core` dài 200-300 dòng. Chúng xử lý tool call, image content, lỗi, retry, và streaming back-pressure. Hãy copy translator có sẵn gần nhất và adapt thay vì viết từ đầu.
:::

## 4. Gắn translator

```ts title="translators/index.ts"
import { registerTranslator } from "@pi-ai/core";
import { openaiCompletionsTranslator } from "./openai-completions.js";

registerTranslator("my-provider", openaiCompletionsTranslator);
```

## 5. Gọi nó

```ts title="agent.ts"
import { getModel, streamSimple } from "@pi-ai/core";
import "./models/index.js";
import "./translators/index.js";

const model = getModel("my-provider", "my-model");
const stream = streamSimple(model, {
  messages: [{ role: "user", content: "Hello" }],
});
```

Nếu bạn có một llama.cpp server chạy trên `localhost:8080`, giờ bạn có một agent hoạt động nói chuyện với nó.

## Pitfalls

**Translator yield sai event type**

Agent loop rẽ nhánh theo event type. Event `done` với `reason: "stop"` kết thúc turn sạch sẽ. Event `tool_use` không có block `tool_result` ghép sẽ làm loop treo.

**Provider gửi response dạng JSON, không phải SSE**

Hầu hết provider hiện đại hỗ trợ streaming. Nếu của bạn không, đặt `streaming: false` trong descriptor và yield tất cả event từ một lần gọi `response`.

**Descriptor đã đăng ký nhưng `getModel` trả undefined**

`getModel` đọc từ catalog. `registerModel` thay đổi catalog. Đảm bảo thứ tự import trong entry point load registration trước lần gọi `getModel` đầu tiên.

## Tiếp theo

- [Chapter 4: Model Invocation](/vi/ch04-model-invocation/) cho thấy các translator upstream được xếp lớp thế nào.
- [Reference: API](/vi/reference/api/) liệt kê mọi field descriptor và method translator.
