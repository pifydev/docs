---
title: Thêm model provider
description: Đăng ký endpoint tương thích OpenAI hoặc native provider mà không phải sửa agent loop.
translation_key: how-to-plug-new-model
language: vi
status: reviewed
reviewed_by: Pify maintainers
last_updated: '2026-08-24'
---

Provider quản lý authentication, metadata của model và streaming. Khi đăng ký provider qua extension, các model của provider sẽ dùng được trong CLI và Coding Agent SDK mà không cần sửa agent loop.

## Chọn mức tích hợp

Dùng provider-config cho server tương thích OpenAI, proxy hoặc API mà Pi đã hỗ trợ. Dùng `createProvider()` khi cần authentication, model discovery, filtering hoặc streaming tùy chỉnh.

## Đăng ký server tương thích OpenAI

Tạo một extension:

```ts title=".pi/extensions/local-provider.ts"
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function localProvider(pi: ExtensionAPI) {
  pi.registerProvider("local-openai", {
    name: "Local OpenAI",
    baseUrl: "http://localhost:1234/v1",
    apiKey: "$LOCAL_OPENAI_API_KEY",
    api: "openai-completions",
    models: [
      {
        id: "local-model",
        name: "Local Model",
        reasoning: false,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 128000,
        maxTokens: 4096,
      },
    ],
  });
}
```

Chỉ đặt credential nếu server yêu cầu:

```bash
export LOCAL_OPENAI_API_KEY="your-key"
```

Khi có `models`, danh sách này sẽ thay thế danh sách model hiện tại của provider. Mỗi descriptor phải phản ánh đúng giới hạn context, giới hạn output, loại input, khả năng reasoning và chi phí token của endpoint.

## Chọn và kiểm tra model

```bash
pi --list-models local-openai
pi --provider local-openai --model local-model
```

Với tích hợp SDK, hãy resolve model qua `ModelRuntime` hoặc collection `Models` của ứng dụng. Không tạo model bằng cách sao chép field từ provider khác.

## Chuyển hướng provider có sẵn

Bỏ `models` để giữ catalog tích hợp và chỉ thay endpoint hoặc header:

```ts title=".pi/extensions/company-proxy.ts"
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function companyProxy(pi: ExtensionAPI) {
  pi.registerProvider("anthropic", {
    baseUrl: "https://ai-gateway.example.com/anthropic",
    headers: { "X-Company-Token": "$COMPANY_AI_TOKEN" },
  });
}
```

Giá trị cấu hình hỗ trợ nội suy `$ENV_VAR` và `${ENV_VAR}`. Hãy lưu credential trong environment hoặc credential store của Pi, không ghi vào mã nguồn extension.

## Triển khai native provider

Với protocol không theo chuẩn có sẵn, hãy tạo `Provider` hoàn chỉnh bằng `createProvider()` cùng API implementation tương ứng, rồi truyền vào `pi.registerProvider(provider)`. Đây là hướng nâng cao vì adapter phải bảo toàn:

- ngữ nghĩa message và content block của Pi;
- tool call và tool result;
- event tăng dần cho text, thinking, usage và trạng thái kết thúc;
- khả năng hủy qua `AbortSignal`;
- phân loại lỗi provider và context overflow.

Trước khi dùng trong production, hãy kiểm tra plain text, tool, image, reasoning, cancellation, response sai định dạng và context overflow.
