---
title: API reference
description: 'The public surface of @pi-ai/core, @pi-agent-core, and @pi-coding-agent.'
translation_key: reference-api
language: en
---
The public surface of the three Pi packages. This page lists every export a user is expected to import. Internal helpers are deliberately omitted.

:::note[Versioning]

The APIs documented here reflect `@pi-ai/core`, `@pi-agent-core`, and `@pi-coding-agent` at **v0.80.2**. Newer releases may add exports; check the upstream changelog for additions.

:::

## `@pi-ai/core`

The lowest layer. Translators, descriptors, and the `streamSimple` primitive.

### `getModel(provider, id)`

```ts
function getModel(provider: string, id: string): ModelDescriptor;
```

Resolve a model from the in-process catalog. Throws if the pair is unknown.

### `registerModel(provider, descriptor)`

```ts
function registerModel(provider: string, descriptor: ModelDescriptor): void;
```

Add or replace a model in the catalog. Idempotent.

### `registerTranslator(provider, translator)`

```ts
function registerTranslator(provider: string, translator: Translator): void;
```

Attach a translator to a provider id. The translator is called on every `streamSimple` request whose descriptor references this provider.

### `streamSimple(model, context, options?)`

```ts
function streamSimple(
 model: ModelDescriptor,
 context: Context,
 options?: StreamOptions
): AsyncIterable<StreamEvent>;
```

Open a streaming request and return an async iterable of typed events. The simplest way to talk to one model without an agent loop.

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

The middle layer. The agent loop, tool registry, and session management.

### `agentLoop(options)`

```ts
function agentLoop(options: AgentLoopOptions): AsyncIterable<StreamEvent>;
```

Run one agent turn. The loop emits the same event vocabulary as `streamSimple`, plus tool dispatch events.

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
 parameters: unknown; // JSON Schema or TypeBox schema
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

List every session under a root. Used by the CLI to render the session picker.

## `@pi-coding-agent`

The top layer. CLI shell, prompt expansion, managed tools, and the extension API.

### `registerExtension(extension)`

```ts
function registerExtension(extension: Extension): void;
```

Register a Pi extension. Extensions can contribute to the system prompt, register tools, intercept messages, and add slash commands.

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
| `read` | Read a file with line range support |
| `bash` | Run a shell command |
| `edit` | Apply a targeted edit by string match |
| `write` | Create or overwrite a file |

All four are gated behind permission prompts by default. Pass `--yolo` or set `yolo: true` in extension config to skip.

### CLI flags

| Flag | Effect |
|---|---|
| `--model <provider/id>` | Override the default model |
| `--system-prompt <text>` | Replace the default prompt |
| `--append-system-prompt <text>` | Append to the composed prompt |
| `--no-default-system-prompt` | Strip the default Pi prompt |
| `--yolo` | Skip permission prompts |
| `--log-prompts` | Log the composed prompt to stderr |
| `--session <id>` | Resume a specific session |

## Next

- [Reference: Configuration](configuration.md) for the runtime settings.
- [Reference: Environment Variables](environment-variables.md) for the env var surface.
