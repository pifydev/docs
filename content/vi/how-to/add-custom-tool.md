---
title: How to add a custom tool
description: >-
  Đăng ký một hàm model có thể gọi, mô tả bằng JSON schema, và đọc kết quả trở
  lại loop.
translation_key: how-to-add-custom-tool
language: vi
---
Hướng dẫn này chỉ cách đăng ký một tool mà model có thể gọi trong một turn. Sau khi xong bạn sẽ có một tool `get_weather` hoạt động, được agent gọi khi phù hợp và đọc kết quả trở lại loop.

:::tip[Bạn sẽ có gì]
Một định nghĩa tool (tên, mô tả, JSON schema) và một handler. Handler chạy khi model phát ra một block `tool_use`. Kết quả được feed trở lại dưới dạng block `tool_result` ở vòng lặp tiếp theo.
:::

## 1. Mô tả tool

Model chỉ thấy schema. Hãy viết như khi viết docs công khai cho tool.

```ts title="tools/get_weather.ts"
import { Type } from "@sinclair/typebox";

export const get_weather = {
  name: "get_weather",
  description: "Return the current weather for a city. Use when the user asks about weather or temperature.",
  parameters: Type.Object({
    city: Type.String({ description: "City name, e.g. 'Paris'" }),
    unit: Type.Optional(
      Type.Union([Type.Literal("celsius"), Type.Literal("fahrenheit")], {
        default: "celsius",
      })
    ),
  }),
};
```

:::note[Vì sao dùng TypeBox mà không phải raw JSON Schema]
SDK nhận cả hai. TypeBox cho type safety ở thời điểm biên dịch cho parameters, vì vậy một lỗi đánh máy trong `city` hiện ra lúc build chứ không phải lúc runtime.

## 2. Viết handler

Handler nhận tham số đã parse và trả về chuỗi hoặc object. SDK serialize giá trị trả về thành block `tool_result`.

```ts title="tools/get_weather.ts" {13}
export async function get_weather_handler(args: {
  city: string;
  unit?: "celsius" | "fahrenheit";
}): Promise<string> {
  // Trong code thật, gọi một weather API.
  // Response hardcode dưới đây thay thế cho việc đó.
  const temp = 18;
  const unit = args.unit ?? "celsius";
  return `${temp} degrees ${unit} in ${args.city}`;
}
```

Handler phải `async` và phải trả về hoặc chuỗi hoặc object có thể serialize. Giá trị trả về là giá trị model thấy ở vòng lặp tiếp theo.

## 3. Đăng ký cả hai với agent

```ts title="agent.ts"
import { agentLoop, getModel } from "@pi-agent-core";
import { get_weather, get_weather_handler } from "./tools/get_weather.js";

const tools = [
  {
    ...get_weather,
    handler: get_weather_handler,
  },
];

const model = getModel("anthropic", "claude-sonnet-4-5");

for await (const event of agentLoop({
  model,
  systemPrompt: "You can look up the weather. Use the get_weather tool when relevant.",
  messages: [{ role: "user", content: "What's the weather in Tokyo?" }],
  tools,
})) {
  if (event.type === "text_delta") process.stdout.write(event.delta);
  if (event.type === "tool_use") console.log("\n[tool]", event.name, event.args);
  if (event.type === "done") console.log("\n[done] reason:", event.reason);
}
```

Khi model quyết định câu hỏi của user cần weather, nó phát ra block `tool_use` với `{ city: "Tokyo" }`. Agent loop gọi handler của bạn, feed giá trị trả về thành `tool_result`, và tiếp tục.

## 4. Thêm permission gate (tuỳ chọn)

Theo mặc định, agent gọi handler không hỏi. Với tool chạm vào filesystem hoặc shell, chặn cuộc gọi bằng permission check:

```ts title="tools/get_weather.ts" {2}
{
  ...get_weather,
  handler: get_weather_handler,
  requiresPermission: true,
}
```

Khi `requiresPermission` là `true`, coding agent sẽ prompt người dùng trước khi gọi handler. Ở chế độ headless hoặc `yolo`, prompt bị bỏ qua.

## Pitfalls

**Handler `async` nhưng throw đồng bộ**

Bọc phần thân trong `try/catch` và trả về chuỗi thông báo lỗi. Model thấy chuỗi và phản ứng. Exception bị ném ra kết thúc loop.

**Schema quá mơ hồ**

Nếu mô tả chỉ là "weather tool", model sẽ gọi nó cho mọi message. Hãy cụ thể: liệt kê use case, liệt kê input, liệt kê output trả về.

**Kết quả quá lớn**

Một chuỗi 50.000 ký tự là cách nhanh nhất để phá context window. Cắt kết quả trước khi trả về. Với API phân trang, trả về trang đầu và để tool được gọi lại.

## Tiếp theo

- [Chapter 5: Tool System](../ch05-tool-system.md) trình bày toàn bộ tool registry và pipeline JSON Schema sang provider-translator.
- [How to plug in a new model](plug-new-model.md) cho nửa còn lại của việc tuỳ biến agent.
