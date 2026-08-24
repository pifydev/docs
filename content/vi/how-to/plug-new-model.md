---
title: Thêm model provider
description: Thêm model qua models.json hoặc Provider, và chỉ viết streaming API adapter khi wire protocol hoàn toàn mới.
translation_key: how-to-plug-new-model
language: vi
official_refs:
  - "https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/coding-agent/docs/models.md"
  - "https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/coding-agent/docs/custom-provider.md"
  - "https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/ai/README.md#custom-providers"
terms_used:
  - Models
  - Provider
  - ModelRuntime
  - ProviderConfig
  - ProviderStreams
  - AbortSignal
status: reviewed
reviewed_by: Pify maintainers
last_updated: "2026-08-24"
---

Phần lớn trường hợp thêm model chỉ cần mô tả một endpoint mà Pi đã biết cách gọi. Hãy bắt đầu bằng `~/.pi/agent/models.json` hoặc `ProviderConfig` trong Extension; tạo native `Provider` khi cần cơ chế xác thực hoặc khám phá model do provider quản lý; chỉ triển khai `ProviderStreams` cho một wire protocol thật sự mới.

:::tip[Kết quả sau hướng dẫn]

Một model tương thích OpenAI trong catalog của Pi, metadata đúng về khả năng và chi phí, các lệnh xác nhận chọn model thành công, cùng chương trình kiểm tra text, thinking, Tool, lỗi, retry và cancellation.

:::

## Chọn hướng tích hợp

| Hướng | Dùng khi | Public surface |
| --- | --- | --- |
| `models.json` | Server local, proxy hoặc vendor dùng API mà Pi đã hỗ trợ. | `~/.pi/agent/models.json`; được `ModelRuntime` nạp và `/model` nạp lại. |
| Extension config | Vẫn dùng các API có sẵn, nhưng khâu thiết lập hoặc discovery thuộc về Extension. | `pi.registerProvider(name, ProviderConfig)`. |
| Native provider | Cần tự xử lý auth, lọc catalog, discovery hoặc kết hợp nhiều API. | `createProvider()` và `pi.registerProvider(provider)`. |
| API adapter mới | Request, response hoặc stream protocol của dịch vụ chưa được hỗ trợ. | Một implementation của `ProviderStreams` truyền vào `createProvider()`. |

Đừng khôi phục model/translator registry toàn cục đời cũ. Ứng dụng hiện tại sở hữu một collection `Models`; implementation công khai của Coding Agent là `ModelRuntime`. Factory của provider tích hợp nằm dưới `@earendil-works/pi-ai/providers/*`, còn factory của API dùng subpath export `@earendil-works/pi-ai/api/*`.

## Điều kiện cần

Pi `0.84.2` yêu cầu Node.js `>=22.19.0`. Với các ví dụ TypeScript, hãy dùng ESM và cài từng package được import:

```bash
npm init -y
npm pkg set type=module
npm install @earendil-works/pi-ai@0.84.2 @earendil-works/pi-coding-agent@0.84.2
npm install --save-dev typescript tsx @types/node
```

```json title="tsconfig.json"
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "types": ["node"]
  },
  "include": ["**/*.ts"]
}
```

Khởi động server tương thích OpenAI tại `http://127.0.0.1:1234/v1`, rồi kiểm tra model ID qua `GET /models`. Trong các bước sau, hãy thay URL, ID, giới hạn và khả năng bằng giá trị thật của server.

## 1. Thêm catalog OpenAI-compatible tĩnh

Tạo `~/.pi/agent/models.json`. Đây là cách tích hợp nhỏ nhất vẫn tồn tại qua các lần khởi động và có thể sửa mà không phải biên dịch Extension:

```json title="~/.pi/agent/models.json"
{
  "providers": {
    "local-openai": {
      "name": "Local OpenAI",
      "baseUrl": "http://127.0.0.1:1234/v1",
      "apiKey": "$LOCAL_OPENAI_API_KEY",
      "api": "openai-completions",
      "models": [
        {
          "id": "local-model",
          "name": "Local Model",
          "reasoning": false,
          "input": ["text"],
          "cost": {
            "input": 0,
            "output": 0,
            "cacheRead": 0,
            "cacheWrite": 0
          },
          "contextWindow": 32768,
          "maxTokens": 4096,
          "compat": {
            "supportsDeveloperRole": false,
            "supportsReasoningEffort": false,
            "supportsUsageInStreaming": false,
            "supportsFinishReason": false,
            "supportsStrictMode": false,
            "maxTokensField": "max_tokens"
          }
        }
      ]
    }
  }
}
```

Đặt credential trong process dùng để khởi động Pi:

```bash
export LOCAL_OPENAI_API_KEY="replace-me"
pi --list-models local-openai
```

`apiKey` nhận literal, `$ENV_VAR`, `${ENV_VAR}` hoặc giá trị bắt đầu bằng `!command`. Nên dùng biến môi trường hoặc `/login`; cách resolve bằng command sẽ chạy một chương trình local, vì vậy chỉ dùng command cố định và đáng tin cậy. Server local không cần key vẫn phải có auth được cấu hình thì model mới khả dụng: dùng placeholder không phải secret, lưu key bằng `/login`, hoặc truyền `--api-key` cho lần chạy đó.

Mở `/model` sẽ nạp lại `models.json`, nên không cần khởi động lại sau khi sửa cấu hình tĩnh. `ModelConfig` phân tích file này ở bên trong nhưng không phải package export công khai; ứng dụng SDK cần đường dẫn riêng nên dùng `ModelRuntime.create({ modelsPath })`.

## 2. Ghi metadata chính xác

Pi dùng metadata của model để chọn model, kiểm tra dữ liệu, tạo request, tính usage và hiển thị. Đừng sao chép một model gần giống chỉ vì endpoint nhận JSON có hình dạng giống OpenAI.

| Field | Ý nghĩa và quy tắc |
| --- | --- |
| `id`, `name` | Gửi đúng ID của server; dùng nhãn ổn định, dễ đọc. Trong `models.json`, `name` mặc định bằng `id`. |
| `api`, `baseUrl`, `provider` | Chọn adapter và endpoint. `ModelRuntime` điền `provider` cùng các giá trị kế thừa; một `Model` đã resolve luôn có đủ ba field. |
| `reasoning`, `thinkingLevelMap` | Chỉ bật khi model phát reasoning. Ánh xạ level của Pi sang giá trị provider chấp nhận; dùng `null` cho level không được hỗ trợ. |
| `input` | Chỉ khai báo modality được chấp nhận: `text` và, sau khi đã kiểm tra, `image`. |
| `cost` | Giá trên một triệu token cho `input`, `output`, `cacheRead` và `cacheWrite`. `tiers` tùy chọn áp dụng cho toàn request khi vượt ngưỡng input token. Chỉ dùng số không nếu endpoint thật sự miễn phí/local. |
| `contextWindow`, `maxTokens` | Tổng sức chứa context và số token sinh tối đa. Cả hai đều tính bằng token, không phải byte hay ký tự. |
| `samplingParams`, `headers` | Default tùy chọn của model và header riêng cho model. Giá trị trong request ghi đè sampling default. Không đặt secret trong hai field này. |
| `compat` | Các điều chỉnh rõ ràng cho dialect của server tương thích OpenAI. Default có thể được suy ra từ URL, không an toàn với URL local chưa biết. |

Những switch tương thích completions thường gặp điều khiển role `developer`, `reasoning_effort`, usage và `finish_reason` khi streaming, field giới hạn token, Tool strict/grammar, quy tắc replay Tool result hoặc reasoning content, thinking format, cache, routing và session affinity. Chỉ đặt flag đã kiểm chứng trên server. Metadata không có boolean `streaming` hay `toolUse` dùng chung: mọi `Provider` đều stream, còn khả năng dùng Tool phải được chứng minh bằng Tool call thật.

## 3. Khám phá model bằng provider config

Dùng Extension bất đồng bộ khi danh sách model của endpoint thay đổi. Hãy kiểm tra response không đáng tin cậy và truyền signal được cấp vào `fetch`. Danh sách trả về thay thế các model của Extension này; nếu refresh ném lỗi, Pi giữ danh sách trước đó.

```ts title=".pi/extensions/discover-local-models.ts"
import type {
  ExtensionAPI,
  ProviderModelConfig,
} from "@earendil-works/pi-coding-agent";

interface ModelListItem {
  id: string;
}

function isModelListItem(value: unknown): value is ModelListItem {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { id?: unknown }).id === "string" &&
    (value as { id: string }).id.trim().length > 0 &&
    (value as { id: string }).id.length <= 256
  );
}

async function discover(signal: AbortSignal): Promise<ProviderModelConfig[]> {
  const response = await fetch("http://127.0.0.1:1234/v1/models", {
    signal,
  });
  if (!response.ok) {
    throw new Error(`Model discovery failed: HTTP ${response.status}`);
  }

  const body: unknown = await response.json();
  const data =
    typeof body === "object" && body !== null
      ? (body as { data?: unknown }).data
      : undefined;
  if (
    !Array.isArray(data) ||
    data.length > 10_000 ||
    !data.every(isModelListItem)
  ) {
    throw new Error("Model discovery returned an invalid data array");
  }

  return data.map((item) => ({
    id: item.id,
    name: item.id,
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 32768,
    maxTokens: 4096,
    compat: {
      supportsDeveloperRole: false,
      supportsReasoningEffort: false,
      supportsUsageInStreaming: false,
      supportsFinishReason: false,
      supportsStrictMode: false,
      maxTokensField: "max_tokens",
    },
  }));
}

export default function discoverLocalModels(pi: ExtensionAPI) {
  pi.registerProvider("local-openai", {
    name: "Local OpenAI",
    baseUrl: "http://127.0.0.1:1234/v1",
    apiKey: "$LOCAL_OPENAI_API_KEY",
    api: "openai-completions",
    refreshModels: ({ signal }) => discover(signal),
  });
}
```

Với remote catalog do provider quản lý ngoài Extension, gọi `await models.refresh({ allowNetwork: true, force: true, signal })`. Coding Agent cũng có `pi update --models`; catalog động đã cấu hình được cache để dùng khi khởi động offline. `PI_OFFLINE` tắt truy cập mạng để lấy model. Refresh là tùy chọn; provider tĩnh không cần refresh method.

## 4. Tạo native `Provider`

Dùng `createProvider()` khi provider phải tự quản lý xác thực, lọc model theo credential hoặc điều phối một hay nhiều API của Pi. Ví dụ này tái sử dụng OpenAI Completions adapter đã phát hành.

```ts title=".pi/extensions/native-local-provider.ts"
import {
  createProvider,
  envApiKeyAuth,
  type Model,
} from "@earendil-works/pi-ai";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const models: readonly Model<"openai-completions">[] = [
  {
    id: "local-model",
    name: "Local Model",
    provider: "local-native",
    api: "openai-completions",
    baseUrl: "http://127.0.0.1:1234/v1",
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 32768,
    maxTokens: 4096,
    compat: {
      supportsDeveloperRole: false,
      supportsReasoningEffort: false,
      supportsUsageInStreaming: false,
      supportsFinishReason: false,
      supportsStrictMode: false,
      maxTokensField: "max_tokens",
    },
  },
];

const provider = createProvider({
  id: "local-native",
  name: "Local Native",
  baseUrl: "http://127.0.0.1:1234/v1",
  auth: {
    apiKey: envApiKeyAuth("Local OpenAI API key", [
      "LOCAL_OPENAI_API_KEY",
    ]),
  },
  models,
  api: openAICompletionsApi(),
});

export default function nativeLocalProvider(pi: ExtensionAPI) {
  pi.registerProvider(provider);
}
```

`envApiKeyAuth()` kiểm tra credential đã lưu trước, rồi đến các biến môi trường được liệt kê. Với resolver tùy chỉnh, hãy triển khai method công khai `ApiKeyAuth.resolve({ ctx, credential, signal })` và đọc biến môi trường qua `ctx.env()`. `AuthResult` của method này có thể trả về request auth, `env` riêng của provider và nhãn nguồn. Phiên bản `0.84.2` không có type công khai tên `AuthResolver`; đừng import hoặc tự đặt ra type này. SDK caller có thể xem trạng thái đã resolve bằng `Models.getAuth()`.

Factory tích hợp cũng theo contract này. Ví dụ, `openaiProvider()` được export từ `@earendil-works/pi-ai/providers/openai`. Dùng factory khi catalog, auth và tổ hợp API của nó đã khớp dịch vụ; dùng `createProvider()` để tự kết hợp các phần.

## 5. Chỉ triển khai API adapter cho protocol mới

API adapter chuyển message và Tool trong `Context` của Pi thành payload từ xa, rồi chuyển response thành một `AssistantMessageEventStream`. Metadata vẫn nằm trong `Model`. Method surface dưới đây là đoạn tham chiếu, không phải adapter chạy được:

```ts title="ProviderStreams contract (reference excerpt)"
interface ProviderStreams {
  stream(model, context, options?): AssistantMessageEventStream;
  streamSimple(model, context, options?): AssistantMessageEventStream;
  fetchDeferred?(model, handle, options?): AssistantMessageEventStream;
  cancelDeferred?(model, handle, options?): Promise<void>;
}
```

Nguồn: [`ProviderStreams`](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/ai/src/types.ts#L262-L281) tại commit đã pin. Đoạn trích lược bỏ type của parameter; hãy import interface đã phát hành để lấy signature chính xác.

`streamSimple()` là điểm vào trung lập với provider: nó ánh xạ reasoning level của Pi, `toolChoice` và thinking budget tùy chọn trước khi chuyển cho adapter. Adapter production phải giữ đúng thứ tự `start`, các event có index `text_*`, `thinking_*`, `toolcall_*`, rồi kết thúc bằng đúng một `done` hoặc `error`. Nó cũng phải báo usage, phân loại context overflow, giữ Tool-call ID ổn định khi replay, gọi các hook request/response, đồng thời dừng network và parser khi `options.signal` bị abort.

Hãy đọc adapter hiện tại có transport gần giống nhất trước khi viết. Đừng phát hành ví dụ chỉ parse từng dòng SSE bất kỳ hoặc chỉ đẩy text delta: cách đó làm mất đối số Tool dạng JSON chưa hoàn chỉnh, reasoning signature, usage, finish reason, error body và hành vi abort. Đặt object `ProviderStreams` đã hoàn thiện vào `createProvider({ api })`; không đăng ký translator toàn cục.

## 6. Chọn và xem model

Liệt kê catalog, rồi chọn bằng dạng `provider/id` không nhập nhằng:

```bash
pi --list-models local-openai
pi --model local-openai/local-model --thinking off "Reply with exactly: provider ready"
```

Trong interactive mode, mở `/model` và tìm `local-openai`. Bộ chọn sẽ nạp lại `models.json` và refresh các provider động đã cấu hình. Trong ứng dụng SDK, hãy resolve qua instance `Models` của chính ứng dụng:

```ts title="inspect-model.ts"
import type { Models } from "@earendil-works/pi-ai";
import { ModelRuntime } from "@earendil-works/pi-coding-agent";

const models: Models = await ModelRuntime.create({
  allowModelNetwork: false,
});
const model = models.getModel("local-openai", "local-model");
if (!model) throw new Error("local-openai/local-model was not loaded");

console.log({
  provider: model.provider,
  id: model.id,
  api: model.api,
  contextWindow: model.contextWindow,
  maxTokens: model.maxTokens,
  reasoning: model.reasoning,
  input: model.input,
  cost: model.cost,
  compat: model.compat,
});
```

Nếu `getModel()` thành công nhưng model không xuất hiện trong `/model`, auth chưa được cấu hình. Kiểm tra `await models.getAuth(model)` hoặc `pi auth check --provider local-openai` mà không in secret.

## 7. Kiểm tra streaming, thinking và Tool

Chạy request thật cho từng khả năng được khai báo. Chương trình này dùng đường `Models.streamSimple()` để áp dụng auth và default của provider. Nó in output tăng dần và báo lỗi nếu stream kết thúc bằng error message.

```ts title="verify-provider.ts"
import {
  Type,
  type Context,
  type Models,
  type Tool,
} from "@earendil-works/pi-ai";
import { ModelRuntime } from "@earendil-works/pi-coding-agent";

const mode = process.argv[2] ?? "text";
if (!new Set(["text", "thinking", "tool"]).has(mode)) {
  throw new Error("Use: text, thinking, or tool");
}

const models: Models = await ModelRuntime.create({
  allowModelNetwork: false,
});
const model = models.getModel("local-openai", "local-model");
if (!model) throw new Error("local-openai/local-model was not loaded");

const echoTool: Tool = {
  name: "echo_text",
  description: "Return text unchanged. Use when explicitly asked to echo.",
  parameters: Type.Object(
    { text: Type.String() },
    { additionalProperties: false },
  ),
};
const prompts = {
  text: "Reply with exactly: stream ok",
  thinking: "Think briefly, then answer: what is 2 + 2?",
  tool: "Call echo_text once with the text tool ok.",
} as const;
const context: Context = {
  messages: [
    {
      role: "user",
      content: [{ type: "text", text: prompts[mode as keyof typeof prompts] }],
      timestamp: Date.now(),
    },
  ],
  tools: mode === "tool" ? [echoTool] : undefined,
};

const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 30_000);
const stream = models.streamSimple(model, context, {
  signal: controller.signal,
  reasoning: mode === "thinking" ? "low" : undefined,
});

try {
  for await (const event of stream) {
    if (event.type === "text_delta" || event.type === "thinking_delta") {
      process.stdout.write(event.delta);
    }
    if (event.type === "toolcall_end") {
      console.log("\ntool:", event.toolCall.name, event.toolCall.arguments);
    }
    if (event.type === "error") {
      throw new Error(event.error.errorMessage ?? event.error.stopReason);
    }
  }
  const result = await stream.result();
  console.log("\nstop:", result.stopReason, "usage:", result.usage);
} finally {
  clearTimeout(timeout);
}
```

```bash
npx tsx verify-provider.ts text
npx tsx verify-provider.ts thinking
npx tsx verify-provider.ts tool
```

Chạy text trước. Chỉ bật `reasoning` và `thinkingLevelMap` đúng sự thật sau khi lần chạy thinking phát thinking content hoặc representation reasoning được protocol ghi rõ. Chỉ thêm `image` sau khi request ảnh thành công. Khả năng dùng Tool đòi hỏi một `toolcall_end` có đúng tên và đối số đã parse; một câu trả lời text bình thường chưa chứng minh được điều đó.

## 8. Xử lý lỗi, retry và cancellation

Hãy quy định transport policy rõ ràng. API adapter được gọi trực tiếp mặc định không retry trừ khi caller đặt `maxRetries`; các OpenAI adapter retry lỗi kết nối và response HTTP `408`, `409`, `429`, `5xx`, trừ khi retry header của server yêu cầu khác. Thời gian chờ giữa các lần retry có thể bị abort. Agent retry ở tầng Coding Agent là cơ chế riêng, vì vậy tránh nhân số lần retry ở cả hai tầng.

Request bị abort kết thúc bằng assistant message có `stopReason` là `"aborted"`; lỗi provider dùng `"error"` và `errorMessage`. Consumer vẫn nên đọc hết stream hoặc chờ `stream.result()`, và chỉ lưu trạng thái transcript mà ứng dụng có thể replay an toàn. Không retry lỗi xác thực, Tool call sai định dạng hoặc lỗi validation chắc chắn lặp lại nếu input không đổi.

## Xử lý sự cố

| Hiện tượng | Cần kiểm tra |
| --- | --- |
| Không thấy provider hoặc model | Validate `models.json`, dùng đúng provider ID, cấu hình auth, rồi mở lại `/model` hoặc chạy `pi --list-models`. |
| `401` hoặc `403` | Kiểm tra environment của process Pi, `/login`, `authHeader`, và endpoint cần API-key auth hay bearer auth. Không ghi resolved key vào log. |
| `404` | Xác nhận `baseUrl` có cần `/v1` hay không, và `api` đã chọn có nối thêm route mà server triển khai hay không. |
| Stream in text nhưng không kết thúc | Adapter phải phát đúng một `done` hoặc `error` cuối cùng và đóng body khi abort. Kiểm tra tương thích `finish_reason`. |
| Thinking thành plain text hoặc bị từ chối | Sửa `reasoning`, `thinkingLevelMap`, `thinkingFormat` và `supportsReasoningEffort`; không khai báo reasoning cho model thường. |
| Tool call thành text, rỗng hoặc sai định dạng | Kiểm tra Tool schema của server và argument delta trong stream. Xem lại các flag về strict mode, tên Tool result và replay. |
| Usage hoặc giới hạn bị sai | Kiểm tra hỗ trợ usage khi streaming cùng giới hạn context/output thật. Giới hạn sai gây truncate không đúng và tổng chi phí sai lệch. |
| Dynamic refresh bị treo | Truyền `signal` vào mọi thao tác fetch/read, giới hạn thời gian xử lý từ xa, giữ danh sách tốt gần nhất khi lỗi và tuân theo `PI_OFFLINE`. |

## Danh sách kiểm tra bảo mật

- Không đặt API key và session token trong model metadata, source control, URL, error text hoặc log.
- Xem discovery payload, model ID, header và đối số Tool là input không đáng tin cậy. Kiểm tra cấu trúc và giới hạn kích thước trước khi lưu.
- Dùng HTTPS cho provider từ xa. Cố định host dự kiến; không để output của model chọn `baseUrl`, credential command hoặc proxy target.
- Review riêng credential command và OAuth flow. Dùng `ApiKeyAuth.resolve()` với `AbortSignal` được cấp, và chỉ trả về giá trị riêng của provider mà adapter cần.
- Xóa dữ liệu nhạy cảm khỏi provider error body trước khi đưa cho người dùng hoặc model. Nội dung đó có thể chứa credential, request content hoặc thông tin nội bộ của gateway.
- Kiểm tra cancellation và retry trong tình huống lỗi. Stream hết thời gian phải giải phóng socket, parser và tác vụ con.

## Tiếp theo

Sau khi chọn model và vượt qua ba bài kiểm tra, hãy dùng model đó trong agent ở [Quickstart](../quickstart.md). [Chương 4: Gọi model](../ch04-model-invocation.md) lần theo đường đi của request và stream. Nếu protocol mới cần lớp chuyển đổi Tool tùy chỉnh, hãy đọc [Thêm Tool tùy chỉnh](add-custom-tool.md) cùng source adapter mà bạn đang đối chiếu.
