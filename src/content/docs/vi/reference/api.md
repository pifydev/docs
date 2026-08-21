---
title: "API reference"
description: "Bề mặt công khai của @pi-ai/core, @pi-agent-core, và @pi-coding-agent."
sidebar:
  label: "API reference"
  order: 1
---

Bề mặt công khai của ba package Pi. Trang này liệt kê mọi export mà người dùng được kỳ vọng sẽ import. Hàm nội bộ được cố ý bỏ qua.

:::note[Versioning]
Các API được mô tả ở đây phản ánh `@pi-ai/core`, `@pi-agent-core`, và `@pi-coding-agent` tại **v0.80.2**. Bản phát hành mới hơn có thể bổ sung export; kiểm tra upstream changelog để biết thêm.
:::

## `@pi-ai/core`

Tầng thấp nhất. Translator, descriptor, và primitive `streamSimple`.

### `getModel(provider, id)`

```ts
function getModel(provider: string, id: string): ModelDescriptor;
```

Tra cứu một model từ catalog trong tiến trình. Throw nếu cặp này chưa được biết.

### `registerModel(provider, descriptor)`

```ts
function registerModel(provider: string, descriptor: ModelDescriptor): void;
```

Thêm hoặc thay thế một model trong catalog. Idempotent.

### `registerTranslator(provider, translator)`

```ts
function registerTranslator(provider: string, translator: Translator): void;
```

Gắn một translator vào một provider id. Translator được gọi cho mỗi request `streamSimple` mà descriptor của nó tham chiếu đến provider này.

### `streamSimple(model, context, options?)`

```ts
function streamSimple(
  model: ModelDescriptor,
  context: Context,
  options?: StreamOptions
): AsyncIterable<StreamEvent>;
```

Mở một streaming request và trả về async iterable gồm các event có kiểu. Cách đơn giản nhất để nói chuyện với một model mà không cần agent loop.

### `ModelDescriptor`

```ts
interface ModelDescriptor {
  id: string;
  provider: string;
  displayName: string;
  contextWindow: number;
  maxOutputTokens: number;
  pricing: { input: number; output: number };
  capabilities: {
    toolUse: boolean;
    images: boolean;
    streaming: boolean;
    thinking: boolean;
  };
  baseUrl: string;
  apiKeyEnvVar: string;
}
```

### `Translator`

```ts
interface Translator {
  request(
    model: ModelDescriptor,
    context: Context,
    options?: StreamOptions
  ): Promise<HttpRequest>;

  response(
    model: ModelDescriptor,
    response: Response,
    options?: StreamOptions
  ): AsyncIterable<StreamEvent>;
}
```

### Events

| Event | Fields |
|---|---|
| `message_start` | `model: string` |
| `text_delta` | `delta: string` |
| `thinking_delta` | `delta: string` |
| `tool_use` | `id`, `name`, `args: unknown` |
| `tool_result` | `toolUseId`, `output: unknown` |
| `message_update` | `usage: { input, output }` |
| `error` | `message`, `code?` |
| `done` | `reason: "stop" \| "length" \| "tool_use" \| "error"` |

## `@pi-agent-core`

Tầng giữa. Agent loop, tool registry, và session management.

### `agentLoop(options)`

```ts
function agentLoop(options: AgentLoopOptions): AsyncIterable<StreamEvent>;
```

Chạy một agent turn. Loop phát ra cùng bộ từ vựng event như `streamSimple`, cộng thêm các event dispatch tool.

### `AgentLoopOptions`

```ts
interface AgentLoopOptions {
  model: ModelDescriptor;
  systemPrompt?: string;
  messages: Message[];
  tools?: Tool[];
  session?: Session;
}
```

### `Tool`

```ts
interface Tool {
  name: string;
  description: string;
  parameters: unknown; // JSON Schema hoặc TypeBox schema
  handler: (args: unknown) => Promise<unknown>;
  requiresPermission?: boolean;
}
```

### `Session`

```ts
class Session {
  static load(opts: { root: string; id: string; pinModel?: boolean }): Promise<Session>;
  static branch(opts: {
    root: string;
    parentId: string;
    fromTurn: number;
    newId?: string;
  }): Promise<Session>;

  save(events: StreamEvent[]): Promise<void>;
  readonly id: string;
  readonly metadata: SessionMetadata;
}
```

### `listSessions(opts)`

```ts
function listSessions(opts: { root: string }): Promise<SessionMetadata[]>;
```

Liệt kê mọi session dưới một root. CLI dùng để hiển thị session picker.

## `@pi-coding-agent`

Tầng trên cùng. CLI shell, prompt expansion, managed tools, và extension API.

### `registerExtension(extension)`

```ts
function registerExtension(extension: Extension): void;
```

Đăng ký một Pi extension. Extension có thể đóng góp vào system prompt, đăng ký tool, chặn message, và thêm slash command.

### `Extension`

```ts
interface Extension {
  name: string;
  systemPrompt?: (ctx: { cwd: string; model: ModelDescriptor }) => string | Promise<string>;
  tools?: Tool[];
  commands?: { name: string; description: string; handler: (args: string) => Promise<void> }[];
  messageTransformers?: {
    beforeModel?: (event: StreamEvent) => StreamEvent | null;
    afterModel?: (event: StreamEvent) => StreamEvent | null;
  };
}
```

### Managed tools

| Name | Purpose |
|---|---|
| `read` | Đọc một file với hỗ trợ khoảng dòng |
| `bash` | Chạy một shell command |
| `edit` | Áp dụng một edit có chọn lọc theo string match |
| `write` | Tạo hoặc ghi đè một file |

Cả bốn đều chặn sau permission prompts theo mặc định. Truyền `--yolo` hoặc đặt `yolo: true` trong extension config để bỏ qua.

### CLI flags

| Flag | Effect |
|---|---|
| `--model <provider/id>` | Ghi đè default model |
| `--system-prompt <text>` | Thay thế default prompt |
| `--append-system-prompt <text>` | Nối vào prompt đã compose |
| `--no-default-system-prompt` | Bỏ default Pi prompt |
| `--yolo` | Bỏ qua permission prompts |
| `--log-prompts` | Ghi composed prompt ra stderr |
| `--session <id>` | Tiếp tục một session cụ thể |

## Tiếp theo

- [Reference: Configuration](/vi/reference/configuration/) để xem runtime settings.
- [Reference: Environment Variables](/vi/reference/environment-variables/) để xem bề mặt env var.