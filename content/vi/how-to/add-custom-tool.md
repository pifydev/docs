---
title: Thêm custom tool
description: Định nghĩa tool có type, cung cấp cho AgentSession và xử lý tiến trình, hủy tác vụ cùng lỗi thực thi.
translation_key: how-to-add-custom-tool
language: vi
status: reviewed
reviewed_by: Pify maintainers
last_updated: '2026-08-24'
---

Dùng custom tool khi model cần gọi mã ứng dụng hoặc dịch vụ bên ngoài. Ví dụ này thêm tool `get_weather` có type vào Coding Agent SDK.

## Cài đặt SDK

```bash
npm install @earendil-works/pi-coding-agent typebox
```

Pi dùng schema TypeBox để mô tả tham số cho model và kiểm tra từng tool call trước khi thực thi.

## Định nghĩa tool

```ts title="tools/get-weather.ts"
import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

export const getWeather = defineTool({
  name: "get_weather",
  label: "Get Weather",
  description: "Return the current weather for a city.",
  parameters: Type.Object({
    city: Type.String({ description: "City name, for example Paris" }),
    unit: Type.Optional(
      Type.Union([Type.Literal("celsius"), Type.Literal("fahrenheit")]),
    ),
  }),
  async execute(_toolCallId, params, signal, onUpdate) {
    onUpdate?.({
      content: [{ type: "text", text: `Checking ${params.city}...` }],
      details: {},
    });

    const response = await fetch(
      `https://weather.example.test/current?city=${encodeURIComponent(params.city)}`,
      { signal },
    );
    if (!response.ok) throw new Error(`Weather service returned ${response.status}`);

    const data = (await response.json()) as { temperature: number };
    return {
      content: [
        {
          type: "text",
          text: `${params.city}: ${data.temperature}° ${params.unit ?? "celsius"}`,
        },
      ],
      details: { city: params.city, temperature: data.temperature },
    };
  },
});
```

Handler nhận object `params` đã được kiểm tra. Truyền `signal` vào các thao tác I/O có thể hủy và chỉ gọi `onUpdate` khi có tiến trình hữu ích. Hãy throw khi thực thi thất bại; Pi sẽ chuyển exception thành tool error cho model.

## Thêm tool vào session

```ts title="agent.ts"
import {
  createAgentSession,
  ModelRuntime,
  SessionManager,
} from "@earendil-works/pi-coding-agent";
import { getWeather } from "./tools/get-weather.js";

const modelRuntime = await ModelRuntime.create();
const { session } = await createAgentSession({
  modelRuntime,
  sessionManager: SessionManager.inMemory(),
  customTools: [getWeather],
});

await session.prompt("What is the weather in Paris?");
```

`customTools` được kết hợp với các tool do extension đăng ký. Nếu bạn còn truyền allowlist `tools`, hãy thêm `"get_weather"`; nếu không, tool sẽ chưa được kích hoạt.

## Đăng ký tool từ extension

Extension có thể đăng ký cùng một định nghĩa qua `pi.registerTool()`:

```ts title="weather-extension.ts"
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

export default function weatherExtension(pi: ExtensionAPI) {
  pi.registerTool({
    name: "get_weather",
    label: "Get Weather",
    description: "Return the current weather for a city.",
    parameters: Type.Object({ city: Type.String() }),
    async execute(_toolCallId, { city }) {
      return {
        content: [{ type: "text", text: `No forecast configured for ${city}.` }],
        details: {},
      };
    },
  });
}
```

Tên tool nên ổn định, cụ thể và dễ phân biệt đối với model. Không đưa secret vào description hoặc nội dung trả về.
