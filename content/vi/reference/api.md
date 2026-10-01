---
title: Tham chiếu API
description: Bản đồ chọn lọc các entry point của package Pi lõi và thử nghiệm ở phiên bản 0.99.2.
translation_key: reference-api
language: vi
official_refs:
  - 'https://github.com/earendil-works/pi/blob/005af57d88ee23b33778f343a9595b32e67ff788/packages/ai/src/types.ts'
  - 'https://github.com/earendil-works/pi/blob/005af57d88ee23b33778f343a9595b32e67ff788/packages/coding-agent/src/core/settings-manager.ts'
  - 'https://github.com/earendil-works/pi/blob/005af57d88ee23b33778f343a9595b32e67ff788/packages/coding-agent/src/core/extensions/types.ts'
  - 'https://github.com/earendil-works/pi/blob/005af57d88ee23b33778f343a9595b32e67ff788/packages/coding-agent/src/modes/interactive/components/custom-editor.ts'
  - 'https://github.com/earendil-works/pi/blob/005af57d88ee23b33778f343a9595b32e67ff788/packages/coding-agent/src/modes/rpc/rpc-types.ts'
  - 'https://github.com/earendil-works/pi/blob/005af57d88ee23b33778f343a9595b32e67ff788/packages/coding-agent/src/utils/mime.ts'
  - 'https://github.com/earendil-works/pi/blob/005af57d88ee23b33778f343a9595b32e67ff788/packages/client/src/index.ts'
  - 'https://github.com/earendil-works/pi/blob/005af57d88ee23b33778f343a9595b32e67ff788/packages/client/README.md'
  - 'https://github.com/earendil-works/pi/blob/005af57d88ee23b33778f343a9595b32e67ff788/packages/protocol/src/index.ts'
  - 'https://github.com/earendil-works/pi/blob/005af57d88ee23b33778f343a9595b32e67ff788/packages/protocol/README.md'
  - 'https://github.com/earendil-works/pi/blob/005af57d88ee23b33778f343a9595b32e67ff788/packages/server/src/index.ts'
  - 'https://github.com/earendil-works/pi/blob/005af57d88ee23b33778f343a9595b32e67ff788/packages/server/README.md'
status: reviewed
reviewed_by: Pify maintainers
last_updated: '2026-10-01'
---

Tài liệu tham chiếu tích hợp có chọn lọc này không liệt kê toàn bộ export chuyên biệt và UI. Nội dung áp dụng cho upstream commit `005af57d88ee23b33778f343a9595b32e67ff788`, các package root ở phiên bản `0.99.2` và Node.js `22.19` trở lên.

- `@earendil-works/pi-ai` quản lý provider collection, metadata của model, authentication, message và LLM stream.
- `@earendil-works/pi-agent-core` bổ sung agent loop, thực thi tool, state, queue và lifecycle event.
- `@earendil-works/pi-coding-agent` kết hợp session, setting, resource, extension, coding tool cùng runtime CLI hoặc SDK.
- `@earendil-works/pi-client`, `@earendil-works/pi-protocol` và `@earendil-works/pi-server` expose boundary thử nghiệm, tùy chọn cho routed service.

Root của `pi-ai` không có side effect. Provider factory nằm dưới `providers/*`, implementation của wire protocol nằm dưới `api/*`, còn các global catalog helper đã ngừng dùng nằm dưới `compat`. Tích hợp mới không nên dùng `compat`.

## `@earendil-works/pi-ai`

### Provider collection

`createModels()` trả về một collection `Models` rỗng và có thể thay đổi. Chỉ thêm các provider ứng dụng thực sự phân phối, hoặc dùng `builtinModels()` từ `providers/all` khi bundle size không phải vấn đề.

```ts title="catalog.ts"
import { createModels } from "@earendil-works/pi-ai";
import { anthropicProvider } from "@earendil-works/pi-ai/providers/anthropic";

const models = createModels();
models.setProvider(anthropicProvider());

const model = models.getModel("anthropic", "claude-sonnet-4-6");
if (!model) throw new Error("Model is not in the registered catalog");
```

`MutableModels` bổ sung `setProvider()`, `deleteProvider()` và `clearProviders()` vào các method đọc và gửi request của `Models`. Provider sở hữu catalog và request routing; không còn process-wide registry.

### Tra cứu catalog và authentication

`getProviders()`, `getProvider()`, `getModels()` và `getModel()` đọc đồng bộ last-known catalog. `refresh()` khôi phục hoặc làm mới dynamic provider rồi trả về `{ aborted, errors }`; method này không reject chỉ vì một provider lỗi. `checkAuth()`, `getAuth()` và `getAvailable()` xác định availability theo provider. `login()` và `logout()` dùng credential store của collection.

```ts title="lookup.ts"
import type { Api, Model } from "@earendil-works/pi-ai";
import { builtinModels } from "@earendil-works/pi-ai/providers/all";

const models = builtinModels();
const cached: readonly Model<Api>[] = models.getModels("anthropic");
const refresh = await models.refresh({
  providers: ["radius"],
  allowNetwork: false,
});
const available = await models.getAvailable("anthropic");

console.log(cached.length, refresh.errors.size, available.length);
```

Provider factory thường resolve credential đã lưu trước, sau đó mới xét environment variable của provider hoặc ambient credential. Ứng dụng cần persistence phải truyền `CredentialStore` và, với dynamic catalog, `ModelsStore` vào `createModels()`.

### Provider factory và adapter

Dùng factory trong `providers/*` để thêm provider có sẵn. Chỉ dùng `createProvider()` khi định nghĩa provider hoặc ghép catalog với implementation của wire protocol. Provider tương thích OpenAI chạy local dưới đây dùng lazy API subpath công khai và environment-key resolver chuẩn.

```ts title="custom-provider.ts"
import {
  createModels,
  createProvider,
  envApiKeyAuth,
  type Model,
} from "@earendil-works/pi-ai";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";

const localModel = {
  id: "local-chat",
  name: "Local Chat",
  api: "openai-completions",
  provider: "local",
  baseUrl: "http://127.0.0.1:8080/v1",
  reasoning: false,
  input: ["text"],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 32_768,
  maxTokens: 4_096,
} satisfies Model<"openai-completions">;

const local = createProvider({
  id: "local",
  auth: { apiKey: envApiKeyAuth("Local API key", ["LOCAL_API_KEY"]) },
  models: [localModel],
  api: openAICompletionsApi(),
});

const models = createModels();
models.setProvider(local);
```

Một `Provider` native cung cấp identity, auth, `getModels()`, `refreshModels()` tùy chọn và các stream method. `createProvider({ fetchModels })` quản lý dynamic overlay. Adapter cho protocol mới phải trả về `AssistantMessageEventStream` và tuân thủ terminal-event contract.

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

### Streaming và completion

`stream()` và `complete()` nhận option riêng của từng API. `streamSimple()` và `completeSimple()` nhận các option portable cho reasoning, retry, transport, abort cùng payload/response hook, rồi chuyển chúng sang API được chọn.

```ts title="stream.ts"
import type { Context } from "@earendil-works/pi-ai";
import { builtinModels } from "@earendil-works/pi-ai/providers/all";

const models = builtinModels();
const model = models.getModel("openai", "gpt-4o-mini");
if (!model) throw new Error("Model not found");

const context: Context = {
  messages: [{ role: "user", content: "Reply in one sentence.", timestamp: Date.now() }],
};
const stream = models.streamSimple(model, context);

for await (const event of stream) {
  if (event.type === "text_delta") process.stdout.write(event.delta);
}
const finalMessage = await stream.result();
console.log(finalMessage.stopReason, finalMessage.usage.cost.total);
```

Chính stream mã hóa request failure: kiểm tra event `error` cuối hoặc `stopReason` và `errorMessage` của message đã resolve. Truyền `AbortSignal` trong options để hủy request.

### Metadata của model

`Model<TApi>` là request descriptor. Các field bắt buộc gồm `id`, `name`, `api`, `provider`, `baseUrl`, `reasoning`, `input` được hỗ trợ, `cost` trên một triệu token, `contextWindow` và `maxTokens`. Metadata tùy chọn gồm `thinkingLevelMap`, `samplingParams`, `headers` và flag `compat` riêng cho từng API.

```ts title="model.ts"
import type { Model } from "@earendil-works/pi-ai";

const model = {
  id: "local-chat",
  name: "Local Chat",
  api: "openai-completions",
  provider: "local",
  baseUrl: "http://127.0.0.1:8080/v1",
  reasoning: false,
  input: ["text", "image"],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 32_768,
  maxTokens: 4_096,
  compat: { supportsDeveloperRole: false },
} satisfies Model<"openai-completions">;

console.log(model.provider, model.contextWindow);
```

Google expose hai thinking-level type công khai từ `@earendil-works/pi-ai`. `GoogleApiThinkingLevel` là union kiểu enum hướng API `"THINKING_LEVEL_UNSPECIFIED" | "MINIMAL" | "LOW" | "MEDIUM" | "HIGH"`, khớp với các giá trị mà `GoogleOptions.thinking.level` và `GoogleVertexOptions.thinking.level` nhận. `ResolvedGoogleThinkingLevel` là union đã chuẩn hóa trong adapter `"minimal" | "low" | "medium" | "high"`; type này biểu diễn kết quả sau bước resolution theo model và phù hợp cho bảng ánh xạ nội bộ, không phải request option.

```ts title="google-thinking-types.ts"
import type {
  GoogleApiThinkingLevel,
  GoogleOptions,
  ResolvedGoogleThinkingLevel,
} from "@earendil-works/pi-ai";

const apiLevel: GoogleApiThinkingLevel = "HIGH";
const options = {
  thinking: { enabled: true, level: apiLevel },
} satisfies GoogleOptions;

const normalizedBudgets: Record<ResolvedGoogleThinkingLevel, number> = {
  minimal: 1_024,
  low: 2_048,
  medium: 8_192,
  high: 16_384,
};

void [options, normalizedBudgets];
```

Các declaration chọn lọc dưới đây giữ nguyên chữ ký member tùy chọn được Pi 0.99.2 phát hành; chúng không lặp lại những member khác của các interface:

```ts title="compatibility-types.ts"
export interface OpenAICompletionsCompat {
  vllmPriority?: number;
}

export interface OpenAIResponsesCompat {
  supportsMaxOutputTokens?: boolean;
}

export interface AnthropicMessagesCompat {
  supportsMidConvoEffort?: boolean;
}
```

`vllmPriority` chỉ thuộc `OpenAICompletionsCompat`: giá trị thấp hơn được xử lý sớm hơn, mặc định của vLLM server là `0`, và field chỉ có ý nghĩa với `--scheduling-policy priority`. Tính năng này tắt theo mặc định và không được đặt trong generated model catalog.

`supportsMaxOutputTokens` thuộc `OpenAIResponsesCompat` và mặc định là `true`; đặt thành `false` khi gateway tương thích Responses từ chối `max_output_tokens`. `supportsMidConvoEffort` thuộc `AnthropicMessagesCompat` và mặc định là `false`. Với model tích hợp sẵn trong generated catalog của Pi 0.99.2, automatic detection chuyển `modelId` thành chữ thường trước, sau đó bỏ một prefix tùy chọn khớp `^~?anthropic/` (`anthropic/` hoặc `~anthropic/`). Pi chỉ tự động bật cờ khi `provider` chính xác là `anthropic` hoặc `openrouter`. ID đã chuẩn hóa phải khớp chính xác `^claude-opus-5(?:-\d{8})?$` hoặc `^claude-(?:fable|mythos)-5(?:[.-]1)(?:-\d{8})?$`. Đúng model được hỗ trợ vẫn phải chạy trên transport Anthropic Messages trung thực; điều này không có nghĩa mọi provider tương thích Anthropic hoặc API chỉ bắt chước hình dạng Messages đều được hỗ trợ.

Các biến thể ID đã chuẩn hóa được chấp nhận gồm `claude-opus-5`, có thể kèm `-YYYYMMDD`; `claude-fable-5.1` hoặc `claude-fable-5-1`, mỗi ID có thể kèm ngày; và `claude-mythos-5.1` hoặc `claude-mythos-5-1`, mỗi ID có thể kèm ngày.

Với custom `Model` dùng `anthropic-messages`, hãy dùng cấu hình `compat.supportsMidConvoEffort: true` chỉ sau khi xác minh transport Anthropic Messages là trung thực và model thuộc đúng Claude family tương thích nói trên. Provider name nằm ngoài allowlist của generated catalog không tự nó cấm manual configuration; không bao giờ khái quát ngoại lệ này sang provider hoặc model tương thích Anthropic tùy ý.

Khi có cost tier, hệ thống so sánh `input + cacheRead + cacheWrite` với `inputTokensAbove`; threshold khớp cao nhất định giá toàn bộ request.

### Context, message và tool

`Context` chứa `systemPrompt` tùy chọn, `Message[]` và `Tool[]` tùy chọn. `Message` là union của system message, user message, assistant message và tool-result message. Phần triển khai provider nhận các message đó trong `TranscriptContext`. Parameter của tool là schema TypeBox; khi làm việc bên dưới Agent Core, hãy validate argument trước khi chạy tool.

```ts title="context.ts"
import { Type, type Context, type Tool } from "@earendil-works/pi-ai";

const search = {
  name: "search",
  description: "Search indexed documents",
  parameters: Type.Object({ query: Type.String() }),
} satisfies Tool;

const context: Context = {
  systemPrompt: "Cite the matching document.",
  messages: [{ role: "user", content: "Find the release note.", timestamp: Date.now() }],
  tools: [search],
};

console.log(context.tools?.[0]?.name);
```

Content của `AssistantMessage` gồm text, thinking hoặc tool-call block, kèm usage, cost, stop reason và metadata tùy chọn cho error hoặc deferred response. Khi replay conversation, hãy persist opaque signature nguyên vẹn.

Trong Pi 0.99.2, `ToolCall.arguments` có kiểu `JsonObject`, còn `ToolResultMessage.details` chứa dữ liệu tương thích JSON. Giữ input và details cần lưu của custom Tool ở dạng tuần tự hóa được: mã hóa ngày thành chuỗi, để function, class instance và process handle ngoài transcript. Schema của Tool vẫn quyết định những dạng đối số JSON được chấp nhận.

`ToolResultMessage<TDetails = JsonValue>` là kiểu có điều kiện. Với kiểu details tương thích, nó có `details?: JsonRepresentation<TDetails>`; kiểu không tương thích cho kết quả `never`. Dùng kiểu details cụ thể tương thích JSON và xử lý trường hợp không có `details`. `AgentToolResult<TDetails>` ở runtime vẫn là contract generic riêng; gán kiểu details ở đó không chứng minh dữ liệu có thể được lưu thành Tool result message.

`JsonValue` chứa `readonly JsonValue[]`. Consumer phải sao chép mảng trước khi sửa, hoặc nhận parameter readonly. Khi xử lý đầy đủ các nhánh trong TypeScript, cần bao quát `null`, kiểu nguyên thủy, mảng readonly và object; dùng type guard thu hẹp về `readonly JsonValue[]` khi cần. Các declaration này không bổ sung kiểm tra dữ liệu ở runtime hay đóng băng object: vẫn phải kiểm tra dữ liệu không đáng tin cậy và từ chối vòng tham chiếu hoặc giá trị cơ chế tuần tự hóa không biểu diễn được.

### Stream event

`AssistantMessageEventStream` vừa là async iterable vừa giữ `result()`. Một stream hợp lệ chỉ start một lần và terminate một lần.

| Event | Payload và cách dùng |
|---|---|
| `start` | Partial assistant message ban đầu |
| `text_start` / `text_delta` / `text_end` | Lifecycle của text block và text tăng dần |
| `thinking_start` / `thinking_delta` / `thinking_end` | Lifecycle của thinking block khi model phát thinking |
| `toolcall_start` / `toolcall_delta` / `toolcall_end` | Partial argument và Tool call đã parse, hoàn chỉnh; Agent Core validate argument trước khi thực thi |
| `done` | Terminal event thành công với reason `stop`, `length`, `toolUse` hoặc `deferred` |
| `error` | Assistant message cuối ở trạng thái `error` hoặc `aborted` |

## `@earendil-works/pi-agent-core`

### `Agent`

`Agent` là stateful wrapper quanh low-level loop. Nó sở hữu transcript, việc thực thi tool, steering và follow-up queue cùng event delivery. `streamFn` có thể là `models.streamSimple.bind(models)`.

```ts title="agent.ts"
import { Agent } from "@earendil-works/pi-agent-core";
import { builtinModels } from "@earendil-works/pi-ai/providers/all";

const models = builtinModels();
const model = models.getModel("anthropic", "claude-sonnet-4-6");
if (!model) throw new Error("Model not found");

const agent = new Agent({
  initialState: { systemPrompt: "Be concise.", model },
  streamFn: models.streamSimple.bind(models),
});

await agent.prompt("Explain this module.");
```

`prompt()` bắt đầu một run; `continue()` tiếp tục khi message cuối là user hoặc tool-result. Dùng `steer()` cho turn kế tiếp và `followUp()` sau thời điểm loop lẽ ra đã dừng.

### `agentLoop()`

`agentLoop(prompts, context, config, signal, streamFn)` không giữ state của ứng dụng. Nó trả về `EventStream<AgentEvent, AgentMessage[]>`; hãy iterate event rồi await `result()` để lấy message mới. `agentLoopContinue()` dùng lại context có message cuối hợp lệ để tiếp tục.

```ts title="agent-loop.ts"
import { agentLoop, type AgentContext } from "@earendil-works/pi-agent-core";
import type { Message } from "@earendil-works/pi-ai";
import { builtinModels } from "@earendil-works/pi-ai/providers/all";

const models = builtinModels();
const model = models.getModel("openai", "gpt-4o-mini");
if (!model) throw new Error("Model not found");

const rawContext: AgentContext = {
  messages: [
    {
      role: "system",
      content: "Be exact.",
      timestamp: Date.now(),
    },
  ],
  tools: [],
};
const prompt = { role: "user" as const, content: "Summarize the API.", timestamp: Date.now() };
const events = agentLoop(
  [prompt],
  rawContext,
  {
    model,
    convertToLlm: (messages) =>
      messages.filter(
        (message): message is Message =>
          message.role === "system" || message.role === "user" || message.role === "assistant" || message.role === "toolResult",
      ),
  },
  undefined,
  models.streamSimple.bind(models),
);

for await (const event of events) console.log(event.type);
const newMessages = await events.result();
```

`AgentContext.tools` chứa các implementation `AgentTool` thực thi được. Nó khác với khai báo Tool do leading `SystemMessage` ghi lại; `convertToLlm` phải giữ system message đó để provider nhận prompt và trạng thái Tool của transcript qua `TranscriptContext`.

### `AgentLoopConfig`

Hai field bắt buộc là `model` và `convertToLlm`. Hook tùy chọn có thể transform context, resolve key, chuẩn bị hoặc finalize một turn, hay chặn Tool call. Config cũng nhận portable stream option, nguồn queue, retry limit và `toolExecution: "parallel" | "sequential"`. `finishTurn` chạy trước `turn_end`, còn quyết định của nó có hiệu lực sau đó. Response error và aborted vẫn là hard exit.

```typescript
import type { FinishTurn } from "@earendil-works/pi-agent-core";

declare const shouldEnd: (message: Parameters<FinishTurn>[0]["message"]) => boolean;

const finishTurn: FinishTurn = ({ message }) => {
  if (message.stopReason === "error" || message.stopReason === "aborted") {
    return undefined;
  }
  return shouldEnd(message) ? { action: "end" } : undefined;
};
```

```ts title="loop-config.ts"
import type { AgentLoopConfig } from "@earendil-works/pi-agent-core";
import type { Message } from "@earendil-works/pi-ai";
import { builtinModels } from "@earendil-works/pi-ai/providers/all";

const models = builtinModels();
const model = models.getModel("openai", "gpt-4o-mini");
if (!model) throw new Error("Model not found");

const config = {
  model,
  convertToLlm: (messages) =>
    messages.filter(
      (message): message is Message =>
        message.role === "system" || message.role === "user" || message.role === "assistant" || message.role === "toolResult",
    ),
  toolExecution: "parallel",
  finishTurn: ({ message }) =>
    message.stopReason === "error" || message.stopReason === "aborted"
      ? undefined
      : { action: "end" },
} satisfies AgentLoopConfig;

console.log(config.toolExecution);
```

`convertToLlm` phải lọc hoặc chuyển đổi custom variant của `AgentMessage` và không được reject. `transformContext` cùng dynamic key resolution cũng phải có safe fallback.

### `AgentTool`

`AgentTool` mở rộng schema tool của Pi AI bằng UI label và `execute(toolCallId, params, signal, onUpdate)`. Trả về `content` cho model cùng `details` có cấu trúc; throw để tạo error tool result. `onUpdate` phát partial progress.

```ts title="tool.ts"
import { Type } from "@earendil-works/pi-ai";
import type { AgentTool } from "@earendil-works/pi-agent-core";

const parameters = Type.Object({ path: Type.String() });

const inspectFile: AgentTool<typeof parameters, { path: string }> = {
  name: "inspect_file",
  label: "Inspect file",
  description: "Inspect one file",
  parameters,
  async execute(_toolCallId, { path }, signal, onUpdate) {
    signal?.throwIfAborted();
    onUpdate?.({ content: [{ type: "text", text: `Opening ${path}` }], details: { path } });
    return { content: [{ type: "text", text: `Inspected ${path}` }], details: { path } };
  },
};

console.log(inspectFile.name);
```

Mặc định, nhiều call chạy song song; từng tool có thể yêu cầu chạy tuần tự. Completion event có thể đến khác source order, nhưng tool-result message cuối vẫn giữ source order của assistant.

### State, điều khiển và event

`agent.state` cung cấp system prompt, model, thinking level, tool, message, streaming message, ID của pending tool call và error mới nhất. `subscribe()` nhận listener sync hoặc async rồi trả về hàm unsubscribe; Agent await listener theo thứ tự đăng ký.

```ts title="agent-events.ts"
import type { Agent } from "@earendil-works/pi-agent-core";

export function observe(agent: Agent): () => void {
  return agent.subscribe(async (event, signal) => {
    if (signal.aborted) return;
    if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
      process.stdout.write(event.assistantMessageEvent.delta);
    }
    if (event.type === "tool_execution_end") console.log(event.toolCallId, event.isError);
  });
}
```

Mỗi run phát `agent_start`/`agent_end`; từng model turn phát `turn_start`/`turn_end`; message phát start/update/end; tool phát execution start/update/end. `abort()` báo hủy active run. `waitForIdle()` chỉ settle sau listener cuối đã được await. Agent Core cũng export harness và session primitive; dùng `SessionManager` của Coding Agent khi cần định dạng coding session JSONL của Pi.

## `@earendil-works/pi-coding-agent`

### `createAgentSession()` và `AgentSession`

`createAgentSession(options?)` resolve `ModelRuntime`, `SessionManager`, `SettingsManager`, `ResourceLoader`, tool và extension, rồi trả về `{ session, extensionsResult, modelFallbackMessage? }`. Prompt cần model và credential đã cấu hình.

```ts title="session.ts"
import {
  createAgentSession,
  ModelRuntime,
  SessionManager,
} from "@earendil-works/pi-coding-agent";

const modelRuntime = await ModelRuntime.create();
const { session, modelFallbackMessage } = await createAgentSession({
  modelRuntime,
  sessionManager: SessionManager.inMemory(process.cwd()),
  tools: ["read"],
});

const unsubscribe = session.subscribe((event) => {
  if (event.type === "agent_settled") console.log("idle");
});
try {
  if (modelFallbackMessage) console.warn(modelFallbackMessage);
  await session.prompt("Describe the current directory.");
} finally {
  await session.abort();
  unsubscribe();
  session.dispose();
}
```

`AgentSession` bổ sung synchronous subscription, persistence, compaction, retry, chạy bash, chọn model, reload và extension dispatch quanh `Agent`. Hãy await `abort()` để hủy retry lẫn agent work và chờ idle; gọi `dispose()` khi host dùng xong.

### Persistence, setting và resource

- `SessionManager.create(cwd, sessionDir?, options?)`, `continueRecent(cwd, sessionDir?)`, `open(path, sessionDir?, cwdOverride?)`, `inMemory(cwd?, options?, entries?)`, `forkFrom(sourcePath, targetCwd, sessionDir?, options?)` và `list(cwd, sessionDir?, onProgress?)` quản lý session JSONL append-only cùng cây session. Dùng `listAll(onProgress?)` hoặc `listAll(sessionDir?, onProgress?)` để liệt kê trên nhiều project.
- `SettingsManager.create(cwd, agentDir?)` merge global setting với project setting đã tin cậy; `SettingsManager.inMemory()` phù hợp với embedded host và test.
- `new DefaultResourceLoader({ cwd, agentDir, settingsManager? })` tạo loader để discover context file, system prompt, extension, skill, prompt template và theme sau `reload()`.
- `ModelRuntime.create()` sở hữu provider catalog và credential được đồng bộ mà Coding Agent sử dụng.

#### Khôi phục session bên ngoài

`FileEntry`, `SessionHeader`, `SessionEntry` và `NewSessionOptions` là các type public ở package root. Các declaration liên quan đến việc khôi phục entry do application sở hữu có dạng chính xác sau:

```ts
export interface NewSessionOptions {
  id?: string;
  parentSession?: string;
}

export type FileEntry = SessionHeader | SessionEntry;

export declare class SessionManager {
  static inMemory(
    cwd?: string,
    options?: NewSessionOptions,
    entries?: FileEntry[],
  ): SessionManager;
}
```

Truyền `entries` sẽ khôi phục parent-linked tree mà không bật cơ chế lưu Pi file. Caller sở hữu validation, durable write và việc đồng bộ với external store. `parseSessionEntries()` cùng `migrateSessionEntries()` cũng được export, nhưng parser bỏ qua dòng JSON lỗi còn migration thay đổi array; cả hai không phải schema validator tổng quát cho trust boundary.

#### Provider context chuẩn và append-only edit

`SessionManager` sở hữu projection chuẩn dùng cho provider request về sau. Dùng `session.navigateTree()` khi di chuyển trong tree. Sau khi application append trực tiếp qua `session.sessionManager`, hãy gọi `session.refreshContext()`; gán message array trên Agent bên dưới không thay thế projection của manager.

| Thao tác | Thay đổi được lưu | Ảnh hưởng lên projection |
| --- | --- | --- |
| `appendContextEdit(targetEntryId, null)` | `thêm entry context_edit` | `loại entry đích khỏi provider context về sau` |
| `appendContextEdit(targetEntryId, { content })` | `thêm entry context_edit` | `thay content của entry đích trong provider context về sau` |
| `transcript thô / lịch sử UI` | `chỉ ghi thêm (append-only)` | `không đổi` |
| `editId trả về` | `entry context_edit mới` | `không phải entry đích` |

`ContextEditEntry` thuộc union `SessionEntry` đã export, vì vậy switch exhaustive phải xử lý `context_edit`. Replacement object có đúng shape `{ content }`; `null` nghĩa là omission. Cả hai dạng đều append một edit entry và giữ nguyên target entry. `appendCompaction(summary, null, tokensBefore)` là dạng retain-none: ID của compaction entry vừa sinh trở thành retained boundary có hiệu lực, nên projection kế tiếp không giữ entry nào đứng trước nó.

#### Export compaction và ranh giới failure

Package root export `DEFAULT_COMPACTION_SETTINGS`, `shouldCompact()`, `compact()`, `generateSummary()`, `generateSummaryWithUsage()`, `generateBranchSummary()` cùng các type public liên quan đến result, setting, preparation và file operation. Package không export helper nội bộ `getSummarizationFailure()`. Tuy vậy, các đường generation tích hợp sẵn cho compaction, turn-prefix và branch summary đều áp dụng phép kiểm tra đó bên trong: response kết thúc bằng `stopReason: "length"` là chưa hoàn chỉnh và không được lưu thành summary checkpoint. Branch summary generation hiện yêu cầu tối đa 4.096 output token, đồng thời bị giới hạn thêm bởi model limit dương nhỏ hơn.

Fragment `Settings` dưới đây là shape source-level internal của `settings.json` được trích chính xác; nó không được export hay import như public API, còn `SettingsManager` và các settings type chọn lọc là public surface có thể import của `@earendil-works/pi-coding-agent` 0.99.2.

```ts title="thinking-settings-types.ts"
interface Settings {
  defaultThinkingLevel?: ThinkingLevel;
  modelThinkingLevels?: Record<string, ThinkingLevel>;
  showCacheMissNotices?: boolean;
}

declare class SettingsManager {
  getDefaultThinkingLevel(): ThinkingLevel | undefined;
  setDefaultThinkingLevel(level: ThinkingLevel): void;
  getModelThinkingLevel(provider: string, modelId: string): ThinkingLevel | undefined;
  getAllModelThinkingLevels(): Record<string, ThinkingLevel>;
  setModelThinkingLevel(provider: string, modelId: string, level: ThinkingLevel): void;
  removeModelThinkingLevel(provider: string, modelId: string): void;
}
```

`modelThinkingLevels` lưu lựa chọn khởi động theo từng model với khóa `provider/modelId`; các method tương ứng của `SettingsManager` nhận provider và model ID riêng. `defaultThinkingLevel` vẫn là global fallback lúc khởi động, có thể được lưu bằng Ctrl+S trong `/thinking`, và tách biệt với request field của provider.

Khi bật `showCacheMissNotices`, transcript còn có thể hiển thị chẩn đoán phục hồi provider như thinking block Anthropic bị loại, ngoài cache miss đáng kể và mức sử dụng summary.

Package root còn export `CacheWarmingMode`, `CompactionModelOverride` và `CompactionSettings`. `SettingsManager.getCacheWarmingMode()` resolve `"off" | "streaming" | "idle"`; `setCacheWarmingMode()` đổi global setting có phát sinh chi phí đó. `getCompactionSettings(model?)` resolve `reserveTokens` và `keepRecentTokens` qua `compaction.modelOverrides` của đúng model, rồi compaction setting thông thường, sau cùng là built-in default.

SDK host trực tiếp phải tự quản lý cwd, trust, storage và cleanup policy. Không sửa session JSONL khi manager đang active, và không giả định `SettingsManager.create()` tự tái hiện trust resolution của CLI nếu host chưa cung cấp quyết định đó.

### Phát hiện MIME của image

`detectSupportedImageMimeTypeFromFile()` được export từ gốc package `@earendil-works/pi-coding-agent` với đúng signature đã publish sau:

```ts
declare function detectSupportedImageMimeTypeFromFile(
  filePath: string,
): Promise<string | null>;
```

`detectSupportedImageMimeTypeFromFile()` mở filename do `filePath` chỉ định, đọc tối đa 4.100 byte đầu rồi kiểm tra signature trong file header cùng các field cấu trúc tối thiểu cần để phát hiện chính xác `image/jpeg`, `image/png` cho PNG không animation, `image/gif`, `image/webp` hoặc `image/bmp`. Function trả `null` cho nội dung thuộc format không được hỗ trợ hoặc không nhận diện được; lỗi mở hay đọc filesystem vẫn làm promise reject. Cơ chế phát hiện này dựa trên nội dung file, không dựa trên extension của filename, đồng thời không decode, resize hay xác thực đầy đủ image. Hãy dùng kết quả như một input-format gate, không phải bằng chứng rằng image có thể decode hoàn toàn hoặc an toàn.

### Extension và managed tool

Một extension là `ExtensionFactory` nhận `ExtensionAPI` đã export. Đăng ký tool, command, shortcut, flag, provider và event handler qua object này; không có global `registerExtension()`.

```ts title="extension.ts"
import { Type } from "@earendil-works/pi-ai";
import { defineTool, type ExtensionFactory } from "@earendil-works/pi-coding-agent";

const inspectPath = defineTool({
  name: "inspect_path",
  label: "Inspect path",
  description: "Return the requested path",
  parameters: Type.Object({ path: Type.String() }),
  async execute(_toolCallId, { path }) {
    return { content: [{ type: "text", text: path }], details: { path } };
  },
});

const extension: ExtensionFactory = (pi) => {
  pi.registerTool(inspectPath);
  pi.on("before_agent_start", (event) => ({
    systemPrompt: `${event.systemPrompt}\nKeep file paths exact.`,
  }));
};

export default extension;
```

Mọi overload của `pi.on()` đều trả về hàm unsubscribe. Pi chụp snapshot các handler khớp trước một dispatch, vì vậy việc thêm handler hoặc gọi hàm unsubscribe của nó trong dispatch đó chỉ ảnh hưởng dispatch sau, không đổi snapshot đang chạy. `cache_warming_decision` là actionable hook: trước một refresh đã lên lịch, handler có thể trả `{ action: "warm" }` hoặc `{ action: "stop" }`.

`ExtensionContext.modelRegistry` cung cấp `ctx.modelRegistry.stream()` cho option riêng của API và `ctx.modelRegistry.streamSimple()` cho option trung lập với provider. Cả hai method gọi provider đã cấu hình với authentication đã được resolve tại thời điểm gửi request; method `complete()` tương ứng chờ assistant message đầy đủ. Facade này giữ Extension trên cùng đường provider và credential của Coding Agent thay vì tự đọc secret.

#### Actionable lifecycle boundary

`TurnEndEvent` nay có thêm `turnIndex`, `messageEntryId`, `toolResultEntryIds`, `outcome`, `entries`, `continue` và context preview bên cạnh message đã finalize cùng Tool result. `AgentBeforeSettleEvent` thuộc union `ExtensionEvent` đã export. Handler `turn_end` và `agent_before_settle` đều có thể trả append-only entry draft cùng `continue: true`; host dispatch hai actionable event này qua `emitBoundary(baseEvent, buildContext)`.

Continuation từ `turn_end` chỉ áp dụng cho Turn hoàn tất bình thường. Outcome low-level `error` và `aborted` hard-exit qua `agent_end` kể cả khi handler trả `continue: true`. Sau khi policy retry, compaction và queue đã chạy, `agent_before_settle` là ranh giới recovery diễn ra muộn hơn; handler nên kiểm tra `event.outcome` và `event.context.canContinue` trước khi yêu cầu một provider call khác.

```text
turn_end + outcome=completed + continue=true + context.canContinue=true -> next provider request
turn_end + outcome=error|aborted + continue=true -> agent_end
retry|compaction|queue policy -> agent_before_settle
agent_before_settle + continue=true + context.canContinue=true -> next provider request
```

Event `context` thông thường nhận conversation message không có system message; Pi khôi phục leading prompt và Tool state sau mỗi handler. `context_with_system` chạy sau đó với full transcript và gửi nguyên văn message được trả về. Vì vậy, xóa leading system message ở phase này cũng xóa provider prompt cùng Tool declaration ban đầu. Run được yêu cầu bên trong handler `agent_settled` chỉ bắt đầu sau khi mọi settled handler đã chạy xong.

`pi.setModel()` đổi model của session hiện tại. Lựa chọn thành công được ghi vào lịch sử session và được khôi phục khi session đó được resume, nhưng không thay đổi `defaultProvider` hoặc `defaultModel` đã cấu hình cho session mới. Promise trả về `false` khi provider được chọn chưa có authentication.

`pi.setThinkingLevel()` tính mức hiệu lực đã được giới hạn theo capability, và chỉ khi mức này khác giá trị hiện tại thì Pi mới ghi thay đổi vào lịch sử session; không phải mọi lựa chọn được yêu cầu đều được ghi. Pi lưu và khôi phục thay đổi có hiệu lực đó cho session hiện tại, nhưng không thay đổi default đã cấu hình cho session mới.

Editor mặc định tự động nhúng working indicator vào viền editor. Các custom editor dựng từ `CustomEditor` giữ working indicator độc lập trừ khi chủ động opt in: truyền `{ embedWorkingStatus: true }` làm đối số thứ tư của constructor để nhúng cùng trạng thái đó vào viền. Option này chỉ đổi vị trí trạng thái, không đổi thời điểm Agent settle hoặc cách Tool chạy.

| Managed tool | Availability |
|---|---|
| `read`, `bash`, `edit`, `write` | Được tích hợp và active mặc định, trừ khi setting hoặc SDK option thay đổi lựa chọn |
| `powershell` | Built-in tùy chọn trên Windows; chọn tường minh hoặc dùng factory đã export |
| `grep`, `find`, `ls` | Được tích hợp; active qua `tools` hoặc dùng factory đã export |
| Entry từ extension hoặc `customTools` | Do host đăng ký; vẫn được lọc bởi `tools`, `excludeTools` và `noTools` |

Các definition tích hợp sẵn `read`, `bash`, `powershell`, `edit` và `write` yêu cầu JSON Schema constrained sampling ở chế độ strict-prefer. Provider có hỗ trợ sẽ enforce schema, còn provider không hỗ trợ có thể fallback về Tool calling thông thường. Extension chủ động thay một definition có thể tắt request này bằng `constrainedSampling: false`.

Quyền truy cập tool là policy của ứng dụng. SDK hiện tại không cung cấp switch `--yolo` trong baseline.

#### Event `user_bash`

`user_bash` chặn các lệnh `!` / `!!` do người dùng nhập. Handler trả `undefined` chỉ để tiếp tục truyền event. Response đã xử lý phải là đúng một object hợp lệ `{ operations }` hoặc `{ result }`: `operations` cung cấp `BashOperations`, còn `result` cung cấp một `BashResult` đầy đủ. Nếu mọi handler đều trả `undefined`, Pi có thể thực thi lệnh cục bộ.

Với `user_bash`, exception hoặc giá trị đã định nghĩa không hợp lệ sẽ hủy lệnh; không handler tiếp theo hay thực thi cục bộ nào được chạy sau lỗi đó. Các giá trị như `null`, `false`, `{}` hoặc object chứa cả hai phương án đều không hợp lệ. Event Extension này có ranh giới lỗi riêng. Bash Tool dựng sẵn tuân theo `AgentTool.execute`: lỗi thực thi trở thành Tool result lỗi như mô tả ở trên.

### Queue RPC và thao tác hủy

Giao thức RPC headless nhận correlation ID không bắt buộc. Đây là các kiểu chính xác cho request `clear_queue` và response thành công:

```ts
{ id?: string; type: "clear_queue" }
{
  id?: string;
  type: "response";
  command: "clear_queue";
  success: true;
  data: { steering: string[]; followUp: string[] };
}
```

Các lệnh RPC trực tiếp `steer` và `follow_up` đi qua handler `input` của Extension trước khi được đưa vào queue. Cả hai input event đều đặt `source` thành `"rpc"`. Khi session đang stream, `steer` đặt `streamingBehavior` thành `"steer"`, còn `follow_up` đặt `streamingBehavior` thành `"followUp"`; khi idle, field này là `undefined`. Vì vậy, handler có thể transform hoặc handle RPC input trước khi Pi thêm nó vào queue tương ứng.

| Lệnh RPC | Trạng thái session | `source` | `streamingBehavior` | Thứ tự handler |
|---|---|---|---|---|
| `steer` | `streaming` | `"rpc"` | `"steer"` | `Extension input → queue` |
| `follow_up` | `streaming` | `"rpc"` | `"followUp"` | `Extension input → queue` |
| `steer` | `idle` | `"rpc"` | `undefined` | `Extension input → queue` |
| `follow_up` | `idle` | `"rpc"` | `undefined` | `Extension input → queue` |

`clear_queue` loại bỏ nguyên tử công việc trong queue và trả về phần text đã loại bỏ, vẫn tách riêng message steering và follow-up. RPC `abort` hủy thao tác đang hoạt động, nay bao gồm cả compaction thủ công đang chạy, rồi chờ tới khi session idle mới phản hồi. Công việc trong queue vẫn có thể tiếp tục trừ khi `clear_queue` đã loại bỏ nó; thao tác hủy và dọn queue là hai việc riêng.

Trong luồng Escape tương tác, hãy gọi `clear_queue` trước `abort`, sau đó quyết định có khôi phục các chuỗi `steering` và `followUp` được trả về vào editor hay không. Thứ tự này ngăn công việc tiếp diễn trong queue bắt đầu khi lệnh abort còn chờ trạng thái idle.

### Factory và operations của PowerShell Tool

Package root export công khai factory và type PowerShell; không cần deep import vào `dist/` hoặc `src/`:

```ts
import {
  createPowerShellTool,
  type PowerShellOperations,
  type PowerShellToolOptions,
} from "@earendil-works/pi-coding-agent";
```

Khai báo đã publish là:

```ts
declare function createPowerShellTool(
  cwd: string,
  options?: PowerShellToolOptions,
): ReturnType<typeof createBashTool>;
```

Ở dạng signature ngắn gọn, đây là `createPowerShellTool(cwd: string, options?: PowerShellToolOptions)`. `AgentTool` trả về nhận `{ command: string, timeout?: number }`, stream partial result qua Tool update callback thông thường và resolve về shell-tool detail shape dùng chung. Việc tạo Tool không chạy command; execution chỉ bắt đầu khi host gọi method `execute` của nó.

`PowerShellToolOptions` được khai báo bằng `Pick` từ shell option dùng chung. Public shape tương đương là:

```ts
interface PowerShellToolOptions {
  operations?: PowerShellOperations;
  exposeSessionEnvironment?: boolean;
  spawnHook?: PowerShellSpawnHook;
}
```

`PowerShellSpawnHook` nhận và trả `{ command: string; cwd: string; env: NodeJS.ProcessEnv }`. `exposeSessionEnvironment` mặc định là `true`; hook chạy sau khi Pi dựng command environment. Khác với `BashToolOptions`, type này không expose `commandPrefix` hay `shellPath`.

`PowerShellOperations` là public alias của `BashOperations`, không phải process class PowerShell riêng tư. Custom backend triển khai đúng một method dạng stream:

```ts
interface PowerShellOperations {
  exec: (
    command: string,
    cwd: string,
    options: {
      onData: (data: Buffer) => void;
      signal?: AbortSignal;
      timeout?: number;
      env?: NodeJS.ProcessEnv;
    },
  ) => Promise<{ exitCode: number | null }>;
}
```

Tool wrapper sở hữu argument validation, định dạng progress/result và giới hạn output. Operations backend sở hữu execution thực: nó phải stream byte stdout/stderr qua `onData`, tuân theo cancellation cùng timeout, trả `null` khi bị kill, đồng thời cleanup process tree, transport, timer và listener. `createLocalPowerShellOperations()` cũng là API công khai và cung cấp backend Windows native của Pi, nhưng executable discovery cùng process lifecycle là hành vi triển khai chứ không phải API cho private process handle.

### Tích hợp runtime và CLI

Với một session cố định, dùng `createAgentSession()`. Với flow new, switch, fork, clone hoặc import, dùng `createAgentSessionRuntime()` và đọc lại `runtime.session` sau khi thay thế; subscription thuộc về session cũ. Host cấp thấp hơn có thể dùng `createAgentSessionServices()`, `createAgentSessionFromServices()`, `runPrintMode()`, `runRpcMode()`, `RpcClient`, `parseArgs()` hoặc `main()`.

| CLI flag | Mục đích hiện tại |
|---|---|
| `--provider`, `--model`, `--models` | Chọn một model hoặc phạm vi model để cycle |
| `--thinking` | Chọn `off`, `minimal`, `low`, `medium`, `high`, `xhigh` hoặc `max` |
| `--system-prompt <text>` | Thay base prompt source bằng text literal hoặc nội dung của một file có sẵn |
| `--append-system-prompt <text>` | Thêm text literal hoặc file có sẵn làm append source có thứ tự; lặp lại flag để thêm source |
| `--tools`, `--exclude-tools`, `--no-tools`, `--no-builtin-tools` | Chọn tool surface ban đầu |
| `--session`, `--session-id`, `--session-dir`, `--continue`, `--resume`, `--fork`, `--no-session` | Chọn cách persist hoặc restore session |
| `--extension`, `--no-extensions`, `--skill`, `--no-skills`, `--no-context-files` | Kiểm soát resource được discover hoặc chỉ định rõ |
| `--mode text|json|rpc`, `--print` | Chọn host protocol hoặc output non-interactive |

Extension có thể đăng ký thêm flag, vì vậy `parseArgs()` giữ unknown flag cho bước extension resolution. Dùng `--help` từ binary `pi` đã cài để xem toàn bộ CLI inventory của đúng phiên bản đó.

## Các package routed-service thử nghiệm

Các package-root export dưới đây là boundary hiện hành của `0.99.2`, không phải công thức remote Agent ổn định. Ứng dụng vẫn sở hữu service contract, authentication cho transport, Session discovery, vòng đời worker và retry policy. Những subpath export như `@earendil-works/pi-client/unix`, `@earendil-works/pi-server/unix` và `@earendil-works/pi-server/testing` tách khỏi các root được tóm tắt ở đây.

### `@earendil-works/pi-client`

Root export `Client` và `createClientServiceTransport`; các error `ClientDisposedError`, `DisconnectedError`, `ServerError`; contract transport `ByteTransport`, `ByteTransportFactory`, `ByteTransportHandlers`; cùng các client type `AttachmentChangeListener`, `ClientOptions`, `ConnectionState`, `ConnectionStateChange`, `ListenerErrorHandler`, `ServiceSubscription` và `Unsubscribe`.

`Client` trung lập với transport và làm việc trên `RpcTarget` tường minh. `createClientServiceTransport(client, getTarget)` chuyển một target được resolve lười thành `RemoteServiceTransport` của Chord; nó không tự dựng typed service. Khi mất kết nối hoặc dispose, pending request reject ở local và live attachment bị xóa; client không tự reconnect hoặc replay request, dù công việc đã được chấp nhận vẫn có thể hoàn tất ở remote.

### `@earendil-works/pi-protocol`

Root export `PROTOCOL_VERSION` (giá trị `8`), `isServerId`, các message và target type `ClientMessage`, `ServerMessage`, `RpcTarget`, `ServerId`, `SessionTarget`, cùng từng type hello, request, cancellation, response, service event, attachment và protocol error. Các entry point cho encoding và validation gồm `parseClientMessage`, `parseServerMessage`, `encodeClientMessage`, `encodeServerMessage`, `ClientMessageDecoder`, `ServerMessageDecoder`, `isSupportedProtocolVersion` và `ProtocolValidationError`.

Cũng từ root đó, package re-export primitive cho CBOR và framing: `encodeCbor`, `decodeCbor`, `CborError`, các hằng số giới hạn cùng option CBOR, `encodeFrame`, `FrameDecoder`, `FrameError`, `FrameDecoderOptions` và `DEFAULT_MAX_FRAME_LENGTH`. Những API này validate envelope nghiêm ngặt, framing và value strict JSON opaque; Chord sở hữu control parsing, subscription, binding và ngữ nghĩa replicated state của service.

### `@earendil-works/pi-server`

Root export `Server`, `ServerListener`, `ServerOptions`, `ServerHost`, `RoutedServerPresentation`, `RoutedServerServiceAttachment`, `RoutedServerServiceHost`, `RoutedSessionAttachment`, `RoutedSessionHandle` và `MaybePromise`. Nó cũng export `ServerError`, `WrongServerError`, `SessionNotFoundError`, `SessionAmbiguousError`, `SessionNotAttachedError`, `ServerDrainingError` cùng `INTERNAL_SERVER_ERROR_MESSAGE`.

Server route service phạm vi server và service phạm vi Session attachment; nó không export service catalogue của ứng dụng, cũng không đưa một `Session` đang mở hoặc Agent Harness qua wire. Server target là `{ serverId }`, còn live Session target là `{ serverId, sessionId, attachmentId }`. Ứng dụng có trách nhiệm dựng listener và cung cấp routed service host, vì vậy reference này chủ ý không trình bày một launch recipe end-to-end như API ổn định.

:::warning[Tương thích thử nghiệm]

Các package client, protocol và server đang thử nghiệm và không bảo đảm tương thích. Hãy pin version của chúng cùng nhau, đồng thời coi reconnect, replay, authentication và lifecycle behavior là policy tường minh của ứng dụng.

:::

## Tiếp theo

- Xem runtime setting: <a href="/vi/reference/configuration">Tham chiếu cấu hình</a>
- Xem credential và path: <a href="/vi/reference/environment-variables">Biến môi trường</a>
- Thêm provider hoặc protocol adapter: <a href="/vi/how-to/plug-new-model">Tích hợp model mới</a>
- Xây dựng tool cho Agent Core: <a href="/vi/how-to/add-custom-tool">Thêm custom tool</a>
- Render event stream: <a href="/vi/how-to/stream-output">Stream output</a>
- Lưu và branch coding session: <a href="/vi/how-to/persist-sessions">Persist session</a>
