---
title: API reference
description: Các entry point công khai chính của Pi AI, Agent Core và Coding Agent tại upstream revision đã kiểm duyệt.
translation_key: reference-api
language: vi
status: reviewed
reviewed_by: Pify maintainers
last_updated: '2026-08-24'
---

Reference này mô tả các entry point ổn định mà đa số tích hợp cần dùng. Nội dung bám theo upstream commit `a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c`, package version `0.84.2`.

## Các package

| Package | Trách nhiệm |
|---|---|
| `@earendil-works/pi-ai` | Provider, model catalog, authentication, message và LLM stream |
| `@earendil-works/pi-agent-core` | Stateful agent loop, tool, event, queue, compaction và harness primitive |
| `@earendil-works/pi-coding-agent` | Session, setting, extension, resource, coding tool, CLI và SDK |

Global catalog API cũ vẫn còn trong `@earendil-works/pi-ai/compat`. Code mới nên dùng collection `Models` và provider factory.

## Pi AI

### `createModels(options?)`

Tạo collection provider rỗng và có thể thay đổi.

```ts
import { createModels } from "@earendil-works/pi-ai";
import { anthropicProvider } from "@earendil-works/pi-ai/providers/anthropic";

const models = createModels();
models.setProvider(anthropicProvider());
```

Dùng `builtinModels()` từ `@earendil-works/pi-ai/providers/all` khi ứng dụng cần toàn bộ provider tích hợp.

### `Models`

Các method quan trọng:

```ts
interface Models {
  getProviders(): readonly Provider[];
  getProvider(id: string): Provider | undefined;
  getModels(provider?: string): readonly Model[];
  getModel(provider: string, id: string): Model | undefined;
  getAvailable(provider?: string): Promise<readonly Model[]>;
  refresh(options?: ModelsRefreshOptions): Promise<ModelsRefreshResult>;
  stream(model: Model, context: Context, options?: StreamOptions): AssistantMessageEventStream;
  complete(model: Model, context: Context, options?: StreamOptions): Promise<AssistantMessage>;
  streamSimple(model: Model, context: Context, options?: SimpleStreamOptions): AssistantMessageEventStream;
  completeSimple(model: Model, context: Context, options?: SimpleStreamOptions): Promise<AssistantMessage>;
}
```

`getModel()` là synchronous và trả về `undefined` khi không tìm thấy cặp tương ứng. `refresh()` cập nhật các dynamic provider đã cấu hình mà không reject toàn bộ thao tác chỉ vì một provider lỗi.

### `createProvider(options)`

Tạo native `Provider`. Provider sở hữu model list, authentication policy, streaming implementation và tùy chọn dynamic refresh.

### Message và stream

`Context` chứa system prompt, `Message[]` và tool tùy chọn. `Message` là union hướng tới provider gồm user message, assistant message và tool-result message. `AssistantMessageEventStream` phát incremental event của assistant và resolve thành assistant message hoàn chỉnh.

## Agent Core

### `new Agent(options)`

```ts
import { Agent } from "@earendil-works/pi-agent-core";

const agent = new Agent({
  initialState: { systemPrompt: "Be concise.", model },
  streamFn: models.streamSimple.bind(models),
});

const unsubscribe = agent.subscribe((event) => {
  // Handle lifecycle and streaming events.
});

await agent.prompt("Explain the current module.");
```

Core state nằm trong `agent.state`: `systemPrompt`, `model`, `thinkingLevel`, `tools`, `messages`, `streamingMessage` và `errorMessage`.

Các method chính gồm `prompt()`, `continue()`, `steer()`, `followUp()`, `abort()`, `subscribe()` và `waitForIdle()`.

### `AgentTool`

Một tool cung cấp `name`, `label`, `description`, schema TypeBox `parameters` và `execute(toolCallId, params, signal, onUpdate)`. Handler thành công trả về `content`, `details` tùy chọn và `terminate` tùy chọn. Hãy throw để báo tool failure.

### Event

| Event | Ý nghĩa |
|---|---|
| `agent_start` / `agent_end` | Một agent run bắt đầu hoặc kết thúc hoàn toàn |
| `turn_start` / `turn_end` | Một LLM call cùng tool batch bắt đầu hoặc hoàn tất |
| `message_start` / `message_update` / `message_end` | Lifecycle của message; chỉ assistant message được cập nhật tăng dần |
| `tool_execution_start` / `tool_execution_update` / `tool_execution_end` | Tool preflight, tiến trình và kết quả cuối |

Khi thực thi song song, các tool có thể hoàn tất khác thứ tự trong source. Tool-result message được persist vẫn giữ thứ tự source của assistant.

## Coding Agent

### `createAgentSession(options?)`

Tạo `AgentSession` cùng các runtime dependency đã resolve.

```ts
import {
  createAgentSession,
  ModelRuntime,
  SessionManager,
} from "@earendil-works/pi-coding-agent";

const modelRuntime = await ModelRuntime.create();
const { session } = await createAgentSession({
  modelRuntime,
  sessionManager: SessionManager.inMemory(),
});
```

Các option thường dùng gồm `cwd`, `model`, `modelRuntime`, `sessionManager`, `settingsManager`, `resourceLoader`, `tools`, `excludeTools`, `customTools` và `noTools`.

### `AgentSession`

Các member quan trọng:

```ts
interface AgentSession {
  prompt(text: string, options?: PromptOptions): Promise<void>;
  steer(text: string): Promise<void>;
  followUp(text: string): Promise<void>;
  subscribe(listener: (event: AgentSessionEvent) => void): () => void;
  compact(customInstructions?: string): Promise<CompactionResult>;
  abort(): Promise<void>;
  dispose(): void;

  readonly sessionId: string;
  readonly sessionFile: string | undefined;
  readonly agent: Agent;
  readonly messages: AgentMessage[];
  readonly isStreaming: boolean;
}
```

### Helper cho session và setting

- `SessionManager.create(cwd)`, `.inMemory(cwd)`, `.continueRecent(cwd)` và `.open(path)` xác định cơ chế persistence.
- `SettingsManager.create()` đọc global setting và project setting; `applyOverrides()` thêm runtime override.
- `DefaultResourceLoader` discover context file, extension, skill, prompt template và theme.
- `defineTool()` giữ type inference của tham số cho standalone tool được truyền qua `customTools`.
- `ModelRuntime.create()` kết hợp model catalog, credential, provider configuration và runtime refresh.

### Thay thế runtime

Dùng `createAgentSessionRuntime()` khi ứng dụng phải thay active session qua các flow new, switch, fork, clone hoặc import. Sau khi thay, hãy đọc lại `runtime.session` và gắn subscription mới.

## Lưu ý tương thích

- Import provider factory từ `@earendil-works/pi-ai/providers/*` và API implementation từ `@earendil-works/pi-ai/api/*`.
- Không dùng package name đã bị loại bỏ như `@pi-ai/core` hoặc `@pi-agent-core`.
- Ưu tiên type trực tiếp từ package thay vì tạo lại interface theo trang này; release sau có thể bổ sung optional field.
