---
title: Tham chiếu API
description: Bản đồ chọn lọc các entry point của package Pi lõi và thử nghiệm ở phiên bản 0.85.0.
translation_key: reference-api
language: vi
official_refs:
  - 'https://github.com/earendil-works/pi/blob/107d79f11072bbc8a3a757ed7fd69596bee7d68c/packages/ai/src/types.ts'
  - 'https://github.com/earendil-works/pi/blob/107d79f11072bbc8a3a757ed7fd69596bee7d68c/packages/coding-agent/src/core/settings-manager.ts'
  - 'https://github.com/earendil-works/pi/blob/107d79f11072bbc8a3a757ed7fd69596bee7d68c/packages/coding-agent/src/utils/mime.ts'
  - 'https://github.com/earendil-works/pi/blob/107d79f11072bbc8a3a757ed7fd69596bee7d68c/packages/client/src/index.ts'
  - 'https://github.com/earendil-works/pi/blob/107d79f11072bbc8a3a757ed7fd69596bee7d68c/packages/client/README.md'
  - 'https://github.com/earendil-works/pi/blob/107d79f11072bbc8a3a757ed7fd69596bee7d68c/packages/protocol/src/index.ts'
  - 'https://github.com/earendil-works/pi/blob/107d79f11072bbc8a3a757ed7fd69596bee7d68c/packages/protocol/README.md'
  - 'https://github.com/earendil-works/pi/blob/107d79f11072bbc8a3a757ed7fd69596bee7d68c/packages/server/src/index.ts'
  - 'https://github.com/earendil-works/pi/blob/107d79f11072bbc8a3a757ed7fd69596bee7d68c/packages/server/README.md'
status: reviewed
reviewed_by: Pify maintainers
last_updated: '2026-09-04'
---

Tài liệu tham chiếu tích hợp có chọn lọc này không liệt kê toàn bộ export chuyên biệt và UI. Nội dung áp dụng cho upstream commit `107d79f11072bbc8a3a757ed7fd69596bee7d68c`, các package root ở phiên bản `0.85.0` và Node.js `22.19` trở lên.

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

Các declaration chọn lọc dưới đây giữ nguyên chữ ký member tùy chọn được Pi 0.85.0 phát hành; chúng không lặp lại những member khác của các interface:

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

`supportsMaxOutputTokens` thuộc `OpenAIResponsesCompat` và mặc định là `true`; đặt thành `false` khi gateway tương thích Responses từ chối `max_output_tokens`. `supportsMidConvoEffort` thuộc `AnthropicMessagesCompat` và mặc định là `false`; chỉ bật cho chính xác Claude model được hỗ trợ trên transport Anthropic Messages trung thực, không bật chỉ vì provider tương thích Anthropic.

Khi có cost tier, hệ thống so sánh `input + cacheRead + cacheWrite` với `inputTokensAbove`; threshold khớp cao nhất định giá toàn bộ request.

### Context, message và tool

`Context` chứa `systemPrompt` tùy chọn, `Message[]` và `Tool[]` tùy chọn. `Message` là provider-facing union của user message, assistant message và tool-result message. Parameter của tool là schema TypeBox; khi làm việc bên dưới Agent Core, hãy validate argument trước khi chạy tool.

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

### Stream event

`AssistantMessageEventStream` vừa là async iterable vừa giữ `result()`. Một stream hợp lệ chỉ start một lần và terminate một lần.

| Event | Payload và cách dùng |
|---|---|
| `start` | Partial assistant message ban đầu |
| `text_start` / `text_delta` / `text_end` | Lifecycle của text block và text tăng dần |
| `thinking_start` / `thinking_delta` / `thinking_end` | Lifecycle của thinking block khi model phát thinking |
| `toolcall_start` / `toolcall_delta` / `toolcall_end` | Partial argument và tool call cuối đã validate |
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

const context: AgentContext = { systemPrompt: "Be exact.", messages: [], tools: [] };
const prompt = { role: "user" as const, content: "Summarize the API.", timestamp: Date.now() };
const events = agentLoop(
  [prompt],
  context,
  {
    model,
    convertToLlm: (messages) =>
      messages.filter(
        (message): message is Message =>
          message.role === "user" || message.role === "assistant" || message.role === "toolResult",
      ),
  },
  undefined,
  models.streamSimple.bind(models),
);

for await (const event of events) console.log(event.type);
const newMessages = await events.result();
```

### `AgentLoopConfig`

Hai field bắt buộc là `model` và `convertToLlm`. Hook tùy chọn có thể transform context, resolve key, chuẩn bị turn tiếp theo, dừng sau một turn đã hoàn tất hoặc chặn tool call. Config cũng nhận portable stream option, nguồn queue, retry limit và `toolExecution: "parallel" | "sequential"`.

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
        message.role === "user" || message.role === "assistant" || message.role === "toolResult",
    ),
  toolExecution: "parallel",
  shouldStopAfterTurn: ({ toolResults }) => toolResults.some((result) => result.isError),
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

- `SessionManager.create(cwd, sessionDir?, options?)`, `continueRecent(cwd, sessionDir?)`, `open(path, sessionDir?, cwdOverride?)`, `inMemory(cwd?, options?)`, `forkFrom(sourcePath, targetCwd, sessionDir?, options?)` và `list(cwd, sessionDir?, onProgress?)` quản lý session JSONL append-only cùng cây session. Dùng `listAll(onProgress?)` hoặc `listAll(sessionDir?, onProgress?)` để liệt kê trên nhiều project.
- `SettingsManager.create(cwd, agentDir?)` merge global setting với project setting đã tin cậy; `SettingsManager.inMemory()` phù hợp với embedded host và test.
- `new DefaultResourceLoader({ cwd, agentDir, settingsManager? })` tạo loader để discover context file, system prompt, extension, skill, prompt template và theme sau `reload()`.
- `ModelRuntime.create()` sở hữu provider catalog và credential được đồng bộ mà Coding Agent sử dụng.

Fragment `Settings` dưới đây là shape source-level internal của `settings.json` được trích chính xác; nó không được export hay import như public API, còn `SettingsManager` và các settings type chọn lọc là public surface có thể import của `@earendil-works/pi-coding-agent` 0.85.0.

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

SDK host trực tiếp phải tự quản lý cwd, trust, storage và cleanup policy. Không sửa session JSONL khi manager đang active, và không giả định `SettingsManager.create()` tự tái hiện trust resolution của CLI nếu host chưa cung cấp quyết định đó.

### Phát hiện MIME của image

`detectSupportedImageMimeTypeFromFile()` được export từ gốc package `@earendil-works/pi-coding-agent` với đúng signature đã publish sau:

```ts
declare function detectSupportedImageMimeTypeFromFile(
  filePath: string,
): Promise<string | null>;
```

Function này mở filename do `filePath` chỉ định, đọc tối đa 4.100 byte đầu rồi kiểm tra signature trong file header cùng các field cấu trúc tối thiểu cần để nhận diện input JPEG, PNG không animation, GIF, WebP hoặc BMP mà Pi hỗ trợ. Nó trả MIME string được hỗ trợ hoặc `null` khi các bước kiểm tra không nhận diện được image hợp lệ; lỗi mở hay đọc filesystem vẫn làm promise reject. Cơ chế này dựa trên nội dung file, không dựa trên extension của filename, và không decode, resize hay validate mọi pixel của image. Hãy dùng kết quả như một input-format gate, không phải bằng chứng rằng image có thể decode hoàn toàn hoặc an toàn.

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

| Managed tool | Availability |
|---|---|
| `read`, `bash`, `edit`, `write` | Được tích hợp và active mặc định, trừ khi setting hoặc SDK option thay đổi lựa chọn |
| `powershell` | Built-in tùy chọn trên Windows; chọn tường minh hoặc dùng factory đã export |
| `grep`, `find`, `ls` | Được tích hợp; active qua `tools` hoặc dùng factory đã export |
| Entry từ extension hoặc `customTools` | Do host đăng ký; vẫn được lọc bởi `tools`, `excludeTools` và `noTools` |

Quyền truy cập tool là policy của ứng dụng. SDK hiện tại không cung cấp switch `--yolo` trong baseline.

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

Các package-root export dưới đây là boundary hiện hành của `0.85.0`, không phải công thức remote Agent ổn định. Ứng dụng vẫn sở hữu service contract, authentication cho transport, Session discovery, vòng đời worker và retry policy. Những subpath export như `@earendil-works/pi-client/unix`, `@earendil-works/pi-server/unix` và `@earendil-works/pi-server/testing` tách khỏi các root được tóm tắt ở đây.

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
