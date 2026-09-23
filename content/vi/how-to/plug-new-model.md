---
title: Thêm một nhà cung cấp mô hình
description: Thêm model qua models.json hoặc Provider, và chỉ viết streaming API adapter khi wire protocol hoàn toàn mới.
translation_key: how-to-plug-new-model
language: vi
official_refs:
  - "https://github.com/earendil-works/pi/blob/f07218c4d4bbc12bef056a7058c3dd49dfe41abe/packages/coding-agent/docs/models.md"
  - "https://github.com/earendil-works/pi/blob/f07218c4d4bbc12bef056a7058c3dd49dfe41abe/packages/coding-agent/docs/custom-provider.md"
  - "https://github.com/earendil-works/pi/blob/f07218c4d4bbc12bef056a7058c3dd49dfe41abe/packages/ai/README.md#custom-providers"
terms_used:
  - Models
  - Provider
  - ModelRuntime
  - ProviderConfig
  - ProviderStreams
  - AbortSignal
status: reviewed
reviewed_by: Pify maintainers
last_updated: '2026-09-23'
---

Phần lớn trường hợp thêm model chỉ cần mô tả một endpoint mà Pi đã biết cách gọi. Hãy bắt đầu bằng `~/.pi/agent/models.json` hoặc `ProviderConfig` trong Extension; tạo native `Provider` khi cần cơ chế xác thực hoặc khám phá model do provider quản lý; chỉ triển khai `ProviderStreams` cho một wire protocol thật sự mới.

:::tip[Kết quả sau hướng dẫn]

Một model tương thích OpenAI trong catalog của Pi, metadata đúng về khả năng và chi phí, cùng bảy bước kiểm tra cho việc chọn model, text, thinking, Tool, lỗi, một lần retry và cancellation có độ trễ.

:::

## Chọn hướng tích hợp

| Hướng | Dùng khi | Public surface |
| --- | --- | --- |
| `models.json` | Server local, proxy hoặc vendor dùng API mà Pi đã hỗ trợ. | `~/.pi/agent/models.json`; được `ModelRuntime` nạp và `/model` nạp lại. |
| Extension config | Vẫn dùng các API có sẵn, nhưng khâu thiết lập hoặc discovery thuộc về Extension. | `pi.registerProvider(name, ProviderConfig)`. |
| Native provider | Cần tự xử lý auth, lọc catalog, discovery hoặc kết hợp nhiều API. | `createProvider()` và `pi.registerProvider(provider)`. |
| API adapter mới | Request, response hoặc stream protocol của dịch vụ chưa được hỗ trợ. | Một implementation của `ProviderStreams` truyền vào `createProvider()`. |

Chọn đúng một hướng: hoàn thành mục **1–2** cho catalog tĩnh, **2–3** cho Extension discovery, **2 và 4** cho native provider, hoặc **2, 4 và 5** cho wire protocol mới. Khi hoàn thành hướng đã chọn, chuyển thẳng đến **6. Chọn và xem model** và **7. Kiểm tra streaming, thinking và Tool**.

Đừng khôi phục model/translator registry toàn cục đời cũ. Ứng dụng hiện tại sở hữu một collection `Models`; implementation công khai của Coding Agent là `ModelRuntime`. Factory của provider tích hợp nằm dưới `@earendil-works/pi-ai/providers/*`, còn factory của API dùng subpath export `@earendil-works/pi-ai/api/*`.

## Điều kiện cần

Pi `0.87.1` yêu cầu Node.js `>=22.19.0`. Với các ví dụ TypeScript, hãy dùng ESM và cài từng package được import:

```bash
npm init -y
npm pkg set type=module
npm install @earendil-works/pi-ai@0.87.1 @earendil-works/pi-coding-agent@0.87.1
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
| `cost` | Giá trên một triệu token cho `input`, `output`, `cacheRead` và `cacheWrite`. `tiers` so sánh `usage.input + usage.cacheRead + usage.cacheWrite` với từng `inputTokensAbove`; ngưỡng cao nhất nhỏ hơn tổng đó quyết định mức giá cho toàn request. Chỉ dùng số không nếu endpoint thật sự miễn phí/local. |
| `contextWindow`, `maxTokens` | Tổng sức chứa context và số token sinh tối đa. Cả hai đều tính bằng token, không phải byte hay ký tự. |
| `samplingParams`, `headers` | Default tùy chọn của model và header riêng cho model. Giá trị trong request ghi đè sampling default. Không đặt secret trong hai field này. |
| `compat` | Các điều chỉnh rõ ràng cho dialect của server tương thích OpenAI. Default có thể được suy ra từ URL, không an toàn với URL local chưa biết. |

Những switch tương thích completions thường gặp điều khiển role `developer`, `reasoning_effort`, usage và `finish_reason` khi streaming, field giới hạn token, Tool strict/grammar, quy tắc replay Tool result hoặc reasoning content, thinking format, cache, routing và session affinity. Chỉ đặt flag đã kiểm chứng trên server. Metadata không có boolean `streaming` hay `toolUse` dùng chung: mọi `Provider` đều stream, còn khả năng dùng Tool phải được chứng minh bằng Tool call thật.

Image normalization cũng lấy cấu hình từ model metadata. Trong `0.87.1`, `inputLimits.images.resize` là profile riêng cho từng model, được áp dụng tại mỗi điểm một image mới đi vào conversation history:

| Điểm image đi vào history | Nguồn cấu hình resize | Tác động lên history |
|---|---|---|
| `file attachment` | `selected model.inputLimits.images.resize` | `resize once before history append` |
| `read` | `ctx.model.inputLimits.images.resize` | `resize once in Tool result` |
| `Tool-result image` | `active model.inputLimits.images.resize` | `normalize once after tool_result hooks` |
| `profile scope` | `per model` | `no uniform limit` |
| `model switch` | `historical images` | `not rewritten` |
| `provider-side transform` | `outside Pi resize profile` | `not controlled` |

Profile có thể đặt `maxWidth`, `maxHeight`, `maxBytes` và `jpegQuality`. Hãy dùng giá trị phù hợp với model đã chọn rồi kiểm tra toàn bộ đường đi; provider vẫn có thể áp dụng hard limit hoặc biến đổi image đã encode sau khi Pi chuyển request cho nó. Pi chỉ normalize mỗi image mới một lần khi image đi vào history, nhờ đó input đã lưu vẫn cache-safe. Đổi model về sau không re-encode image đã lưu trong transcript.

## 3. Khám phá model bằng provider config

Dùng Extension bất đồng bộ khi danh sách model của endpoint thay đổi. Hãy kiểm tra response không đáng tin cậy và truyền signal được cấp vào `fetch`. Danh sách trả về thay thế các model của Extension này; nếu refresh ném lỗi, Pi giữ danh sách đang có trong bộ nhớ.

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
  const provider = "local-openai";
  const api = "openai-completions";
  const baseUrl = "http://127.0.0.1:1234/v1";

  pi.registerProvider("local-openai", {
    name: "Local OpenAI",
    baseUrl,
    apiKey: "$LOCAL_OPENAI_API_KEY",
    api,
    refreshModels: async (context) => {
      const stored =
        context.stored?.models.filter((model) => model.provider === provider) ??
        [];
      if (!context.allowNetwork) return [...stored];

      try {
        const discovered = await discover(context.signal);
        await context.publish({
          persist: {
            models: discovered.map((model) => ({
              ...model,
              provider,
              api: model.api ?? api,
              baseUrl: model.baseUrl ?? baseUrl,
            })),
            checkedAt: Date.now(),
          },
        });
        return discovered;
      } catch (error) {
        if (stored.length > 0) return [...stored];
        throw error;
      }
    },
  });
}
```

`ProviderConfig.refreshModels()` phải chủ động lưu dữ liệu qua contract công khai nhận một đối số: `await context.publish({ persist: entry })`. Ví dụ lưu các object `Model` đã resolve đầy đủ để dùng lại khi tắt mạng hoặc lúc discovery thất bại. Native `createProvider({ fetchModels })` tự khôi phục và lưu dynamic overlay.

Với remote catalog do provider quản lý ngoài Extension, gọi `await models.refresh({ allowNetwork: true, force: true, signal })`. Coding Agent cũng có `pi update --models`. `PI_OFFLINE` tắt truy cập mạng để lấy model. Refresh là tùy chọn; provider tĩnh không cần refresh method.

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

`envApiKeyAuth()` kiểm tra credential đã lưu trước, rồi đến các biến môi trường được liệt kê. Với resolver tùy chỉnh, hãy triển khai method công khai `ApiKeyAuth.resolve({ ctx, credential, signal })` và đọc biến môi trường qua `ctx.env()`. `AuthResult` của method này có thể trả về request auth, `env` riêng của provider và nhãn nguồn. Phiên bản `0.87.1` không có type công khai tên `AuthResolver`; đừng import hoặc tự đặt ra type này. SDK caller có thể xem trạng thái đã resolve bằng `Models.getAuth()`.

Factory tích hợp cũng theo contract này. Ví dụ, `openaiProvider()` được export từ `@earendil-works/pi-ai/providers/openai`. Dùng factory khi catalog, auth và tổ hợp API của nó đã khớp dịch vụ; dùng `createProvider()` để tự kết hợp các phần.

## 5. Chỉ triển khai API adapter cho protocol mới

`ProviderStreams.stream()` và `streamSimple()` nhận `TranscriptContext` đã chuẩn hóa. Chỉ bước chuẩn hóa của Pi qua `normalizeContext()` tạo ra kiểu có brand này; caller không được ép kiểu một `Context` thô thành nó. `Models.stream*()` nhận dạng viết gọn `Context` công khai và chuẩn hóa trước khi chuyển cho provider.

Các message `system` trong transcript chứa prompt và khai báo Tool. Phát lại chúng theo thứ tự: `content` thêm chỉ dẫn, `sections` thay hoặc xóa các phần prompt có tên, còn `toolsAdded` / `toolsRemoved` thay đổi tập Tool khả dụng. Dùng `getCurrentSystemPrompt(context.messages)` và `getCurrentTools(context.messages)` để lấy trạng thái request hiện tại. Giữ vị trí system message khi transport hỗ trợ; các transcript helper của Pi có thể gộp trạng thái này cho API không hỗ trợ.

```ts title="provider-context.ts"
import {
  getCurrentSystemPrompt,
  getCurrentTools,
  type TranscriptContext,
} from "@earendil-works/pi-ai";

function inspectProviderContext(context: TranscriptContext) {
  return {
    systemPrompt: getCurrentSystemPrompt(context.messages),
    tools: getCurrentTools(context.messages),
  };
}
```

API adapter chuyển transcript đó thành payload từ xa, rồi chuyển response thành một `AssistantMessageEventStream`. Metadata vẫn nằm trong `Model`. Method surface dưới đây là đoạn tham chiếu, không phải adapter chạy được:

```ts title="ProviderStreams contract (reference excerpt)"
interface ProviderStreams {
  stream(model: Model<Api>, context: TranscriptContext, options?: StreamOptions): AssistantMessageEventStream;
  streamSimple(model: Model<Api>, context: TranscriptContext, options?: SimpleStreamOptions): AssistantMessageEventStream;
  fetchDeferred?(model, handle, options?): AssistantMessageEventStream;
  cancelDeferred?(model, handle, options?): Promise<void>;
}
```

Nguồn: [`ProviderStreams`](https://github.com/earendil-works/pi/blob/f07218c4d4bbc12bef056a7058c3dd49dfe41abe/packages/ai/src/types.ts) tại commit đã pin. Đoạn trích lược bỏ import và type của parameter trong deferred method; hãy import interface đã phát hành để lấy contract đầy đủ.

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

Hãy chạy mọi bước phù hợp trước khi tuyên bố hỗ trợ:

| Bước kiểm tra | Đích | Điều kiện đạt |
| --- | --- | --- |
| Chọn model | Pi đã cấu hình | Dạng `provider/id` resolve được và trả lời. |
| Stream text | Endpoint thật | Text đến theo từng phần và kết thúc bằng `"stop"`. |
| Thinking | Endpoint thật | Xuất hiện representation reasoning đã khai báo. |
| Tool | Endpoint thật | `toolcall_end` có đúng tên và đối số đã parse. |
| Lỗi | Fixture local | Event cuối và result đều báo `"error"`. |
| Một lần retry | Fixture local | Một response `429` tạo đúng hai lần gọi, rồi trả content và `"stop"`. |
| Abort có độ trễ | Fixture local | Result là `"aborted"` và connection đóng mà không bị treo. |

`supportsMidConvoEffort` thuộc `AnthropicMessagesCompat` và mặc định là `false`. Với model tích hợp sẵn trong generated catalog của Pi 0.87.1, automatic detection chuyển `modelId` thành chữ thường trước, sau đó bỏ một prefix tùy chọn khớp `^~?anthropic/` (`anthropic/` hoặc `~anthropic/`). Pi chỉ tự động bật cờ khi `provider` chính xác là `anthropic` hoặc `openrouter`. ID đã chuẩn hóa phải khớp chính xác `^claude-opus-5(?:-\d{8})?$` hoặc `^claude-(?:fable|mythos)-5(?:[.-]1)(?:-\d{8})?$`. Đúng model được hỗ trợ vẫn phải chạy trên transport Anthropic Messages trung thực; điều này không có nghĩa mọi provider tương thích Anthropic hoặc API chỉ bắt chước hình dạng Messages đều được hỗ trợ.

Các biến thể ID đã chuẩn hóa được chấp nhận gồm `claude-opus-5`, có thể kèm `-YYYYMMDD`; `claude-fable-5.1` hoặc `claude-fable-5-1`, mỗi ID có thể kèm ngày; và `claude-mythos-5.1` hoặc `claude-mythos-5-1`, mỗi ID có thể kèm ngày.

Với custom `Model` dùng `anthropic-messages`, hãy dùng cấu hình `compat.supportsMidConvoEffort: true` chỉ sau khi xác minh transport Anthropic Messages là trung thực và model thuộc đúng Claude family tương thích nói trên. Provider name nằm ngoài allowlist của generated catalog không tự nó cấm manual configuration; không bao giờ khái quát ngoại lệ này sang provider hoặc model tương thích Anthropic tùy ý.

Khi cờ này được bật, Pi lưu effort native của từng response và khôi phục các effort-only system messages lúc replay cuộc hội thoại. Pi cũng gửi thinking binding control `prefix_mismatch_behavior: "drop_block"`; khi prefix mismatch, control này loại an toàn signed thinking block cũ và ngăn vòng lặp response 400 kéo dài.

Với vLLM Chat Completions, `vllmPriority` là member của `OpenAICompletionsCompat`. Giá trị thấp hơn được xử lý sớm hơn và setting chỉ có ý nghĩa khi vLLM chạy với `--scheduling-policy priority`; mặc định của server là `0`. Tính năng tắt theo mặc định và không được đặt trong generated model catalog, vì vậy chỉ cấu hình tường minh khi server dùng priority scheduling.

Với endpoint OpenAI Responses, `supportsMaxOutputTokens` là member của `OpenAIResponsesCompat` và mặc định là `true`. Hãy đặt thành `false` cho gateway từ chối `max_output_tokens`; Pi sẽ bỏ field này. Không đặt cờ này trên `OpenAICompletionsCompat`.

Chương trình kiểm tra endpoint thật dùng đường `Models.streamSimple()` để áp dụng auth và default của provider. Nó in output tăng dần và báo lỗi nếu stream kết thúc bằng error message.

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

Fixture xác định này là tùy chọn. Hãy dùng nó khi viết adapter hoặc kiểm tra hành vi retry, lỗi và cancellation. Lưu file cạnh chương trình kiểm tra endpoint thật. Fixture khởi động một endpoint OpenAI-compatible trên loopback nên không cần server bên ngoài hay secret.

```bash
npx tsx --test verify-provider-errors.test.ts
```

<Accordions type="single">
<Accordion title="Mã fixture tùy chọn: lỗi, retry và abort">

```ts title="verify-provider-errors.test.ts"
import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import {
  createModels,
  createProvider,
  envApiKeyAuth,
  type AssistantMessageEvent,
  type AssistantMessageEventStream,
  type Context,
  type Model,
  type ModelsSimpleStreamOptions,
} from "@earendil-works/pi-ai";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";

const context: Context = {
  messages: [{ role: "user", content: "test", timestamp: 0 }],
};

async function within<T>(promise: Promise<T>, label: string): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error(`${label} timed out`)),
          1_000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

async function settle(stream: AssistantMessageEventStream) {
  const events: AssistantMessageEvent[] = [];
  for await (const event of stream) events.push(event);
  return { events, result: await stream.result() };
}

function terminalError(events: AssistantMessageEvent[]) {
  const terminal = events.at(-1);
  assert.equal(terminal?.type, "error");
  if (terminal?.type !== "error") throw new Error("missing error event");
  return terminal.reason;
}

test("provider errors, retry, and abort use the real stream path", async (t) => {
  let scenario: "failure" | "retry" | "abort" = "failure";
  let retryAttempts = 0;
  let signalAbortRequest!: () => void;
  let signalAbortClosed!: () => void;
  const abortRequest = new Promise<void>((resolve) =>
    (signalAbortRequest = resolve),
  );
  const abortClosed = new Promise<void>((resolve) =>
    (signalAbortClosed = resolve),
  );
  const server = createServer(async (req, res) => {
    assert.equal(req.url, "/v1/chat/completions");
    for await (const _chunk of req) {
      // Consume the request before choosing the deterministic response.
    }

    if (scenario === "failure") {
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: { message: "fixture failure" } }));
      return;
    }
    if (scenario === "retry" && ++retryAttempts === 1) {
      res.writeHead(429, {
        "content-type": "application/json",
        "retry-after-ms": "0",
      });
      res.end(JSON.stringify({ error: { message: "retry once" } }));
      return;
    }
    if (scenario === "abort") {
      res.on("close", signalAbortClosed);
      signalAbortRequest();
      return;
    }

    const chunk = {
      id: "fixture",
      model: "fixture-model",
      choices: [
        {
          index: 0,
          delta: { content: "retry ok" },
          finish_reason: "stop",
        },
      ],
      usage: { prompt_tokens: 1, completion_tokens: 2 },
    };
    res.writeHead(200, { "content-type": "text/event-stream" });
    res.end(`data: ${JSON.stringify(chunk)}\n\ndata: [DONE]\n\n`);
  });

  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address() as AddressInfo;
  const model: Model<"openai-completions"> = {
    id: "fixture-model",
    name: "Fixture model",
    provider: "fixture",
    api: "openai-completions",
    baseUrl: `http://127.0.0.1:${port}/v1`,
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 1024,
    maxTokens: 64,
  };
  process.env.FIXTURE_API_KEY = "not-secret";
  const models = createModels();
  models.setProvider(
    createProvider({
      id: "fixture",
      auth: { apiKey: envApiKeyAuth("Fixture key", ["FIXTURE_API_KEY"]) },
      models: [model],
      api: openAICompletionsApi(),
    }),
  );
  const run = (options: ModelsSimpleStreamOptions = {}) =>
    settle(models.streamSimple(model, context, options));

  try {
    await t.test("returns a terminal error", async () => {
      scenario = "failure";
      const { events, result } = await run({ maxRetries: 0 });
      assert.equal(terminalError(events), "error");
      assert.equal(result.stopReason, "error");
      assert.match(result.errorMessage ?? "", /fixture failure/);
    });

    await t.test("retries once, then returns the successful content", async () => {
      scenario = "retry";
      const { events, result } = await run({ maxRetries: 1 });
      assert.equal(retryAttempts, 2);
      assert.equal(events.at(-1)?.type, "done");
      assert.equal(result.stopReason, "stop");
      assert.deepEqual(result.content, [{ type: "text", text: "retry ok" }]);
    });

    await t.test(
      "aborts a delayed response and closes its connection",
      async () => {
        scenario = "abort";
        const controller = new AbortController();
        const settled = run({
          signal: controller.signal,
          maxRetries: 0,
        });
        await within(abortRequest, "request start");
        controller.abort();
        const { events, result } = await within(settled, "aborted stream");
        await within(abortClosed, "connection cleanup");
        assert.equal(terminalError(events), "aborted");
        assert.equal(result.stopReason, "aborted");
      },
    );
  } finally {
    delete process.env.FIXTURE_API_KEY;
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
```

</Accordion>
</Accordions>

## 8. Xử lý lỗi, retry và cancellation

Hãy quy định transport policy rõ ràng. API adapter được gọi trực tiếp mặc định không retry trừ khi caller đặt `maxRetries`; các OpenAI adapter retry lỗi kết nối và response HTTP `408`, `409`, `429`, `5xx`, trừ khi retry header của server yêu cầu khác. Thời gian chờ giữa các lần retry có thể bị abort. Agent retry ở tầng Coding Agent là cơ chế riêng, vì vậy tránh nhân số lần retry ở cả hai tầng.

Request bị abort kết thúc bằng assistant message có `stopReason` là `"aborted"`; lỗi provider dùng `"error"` và `errorMessage`. Consumer vẫn nên đọc hết stream hoặc chờ `stream.result()`, và chỉ lưu trạng thái transcript mà ứng dụng có thể replay an toàn. Không retry lỗi xác thực, Tool call sai định dạng hoặc lỗi validation chắc chắn lặp lại nếu input không đổi.

## Xử lý sự cố

Khi kiểm tra request chỉ có image, cần chú ý edge case sau của adapter:

| Hình dạng request | Cách xử lý text part | Payload bắt buộc |
|---|---|---|
| `OpenAI-compatible + image-only user message` | `omit empty text part` | `send image block` |

Đây là hành vi của adapter trong `0.87.1`, không phải public option mới. Custom adapter tương thích OpenAI phải giữ image content nhưng không tự tạo empty text item mà endpoint có thể từ chối.

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

Sau khi vượt qua cả bảy bước kiểm tra, hãy dùng model đó trong agent ở [Quickstart](../quickstart.md). [Chương 4: Gọi model](../ch04-model-invocation.md) lần theo đường đi của request và stream. Nếu protocol mới cần lớp chuyển đổi Tool tùy chỉnh, hãy đọc [Thêm Tool tùy chỉnh](add-custom-tool.md) cùng source adapter mà bạn đang đối chiếu.
