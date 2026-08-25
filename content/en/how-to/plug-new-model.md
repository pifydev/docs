---
title: Add a model provider
description: Add a model through models.json or a Provider, and implement a streaming API adapter only when the wire protocol is new.
translation_key: how-to-plug-new-model
language: en
official_refs:
  - "https://github.com/earendil-works/pi/blob/4e58f324fae8ebfa98a3d45181fb248072a2afac/packages/coding-agent/docs/models.md"
  - "https://github.com/earendil-works/pi/blob/4e58f324fae8ebfa98a3d45181fb248072a2afac/packages/coding-agent/docs/custom-provider.md"
  - "https://github.com/earendil-works/pi/blob/4e58f324fae8ebfa98a3d45181fb248072a2afac/packages/ai/README.md#custom-providers"
terms_used:
  - Models
  - Provider
  - ModelRuntime
  - ProviderConfig
  - ProviderStreams
  - AbortSignal
status: reviewed
reviewed_by: Pify maintainers
last_updated: "2026-08-25"
---

Most model additions describe an endpoint Pi already knows how to call. Start with `~/.pi/agent/models.json` or an Extension `ProviderConfig`; build a native `Provider` when you need provider-owned authentication or discovery; implement `ProviderStreams` only for a genuinely new wire protocol.

:::tip[What you will have]

A local OpenAI-compatible model in the Pi catalog, accurate capability and cost metadata, and seven checks covering selection, text, thinking, Tools, failure, one retry, and delayed cancellation.

:::

## Choose the integration route

| Route | Use it when | Public surface |
| --- | --- | --- |
| `models.json` | A local server, proxy, or vendor speaks a supported Pi API. | `~/.pi/agent/models.json`; loaded by `ModelRuntime` and reloaded by `/model`. |
| Extension config | The same APIs apply, but setup or discovery belongs in an Extension. | `pi.registerProvider(name, ProviderConfig)`. |
| Native provider | You need custom auth resolution, catalog filtering, discovery, or mixed APIs. | `createProvider()` and `pi.registerProvider(provider)`. |
| New API adapter | The service's request, response, or stream protocol is unsupported. | A `ProviderStreams` implementation passed to `createProvider()`. |

Choose exactly one route: complete sections **1–2** for a static catalog, **2–3** for Extension discovery, **2 and 4** for a native provider, or **2, 4, and 5** for a new wire protocol. When that route is complete, skip to **6. Select and inspect the model** and **7. Probe streaming, thinking, and Tools**.

Do not revive the old process-global model/translator registry. Current applications own a `Models` collection; Coding Agent's public implementation is `ModelRuntime`. Built-in provider factories live under `@earendil-works/pi-ai/providers/*`, while API factories use `@earendil-works/pi-ai/api/*` subpath exports.

## Prerequisites

Pi `0.84.3` requires Node.js `>=22.19.0`. For the TypeScript examples, use ESM and install each package you import:

```bash
npm init -y
npm pkg set type=module
npm install @earendil-works/pi-ai@0.84.3 @earendil-works/pi-coding-agent@0.84.3
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

Start the OpenAI-compatible server at `http://127.0.0.1:1234/v1` and confirm its model ID with `GET /models`. Substitute its real URL, ID, limits, and capabilities below.

## 1. Add a static OpenAI-compatible catalog

Create `~/.pi/agent/models.json`. This is the smallest integration that survives restarts and remains editable without compiling an Extension:

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

Set the credential in the process that starts Pi:

```bash
export LOCAL_OPENAI_API_KEY="replace-me"
pi --list-models local-openai
```

`apiKey` accepts a literal, `$ENV_VAR`, `${ENV_VAR}`, or a leading `!command`. Prefer an environment variable or `/login`; command-based resolution executes a local program and should only use a trusted, fixed command. A keyless local server still needs configured auth before its models become available: use a non-secret placeholder, store a key with `/login`, or pass `--api-key` for that invocation.

Opening `/model` reloads `models.json`, so static edits do not require a restart. `ModelConfig` parses this file internally, but it is not a public package export; use `ModelRuntime.create({ modelsPath })` when an SDK application needs a custom path.

## 2. Record metadata accurately

Pi uses model metadata for selection, validation, request shaping, usage, and display. Do not copy a nearby model merely because the endpoint accepts OpenAI-shaped JSON.

| Field | Meaning and rule |
| --- | --- |
| `id`, `name` | Send the exact server ID; use a stable human label. In `models.json`, `name` defaults to `id`. |
| `api`, `baseUrl`, `provider` | Select the adapter and endpoint. `ModelRuntime` fills `provider` and inherited values; a resolved `Model` always has all three. |
| `reasoning`, `thinkingLevelMap` | Enable only when the model emits reasoning. Map Pi levels to accepted provider values; use `null` for an unsupported level. |
| `input` | Declare only accepted modalities: `text` and, when tested, `image`. |
| `cost` | Per-million-token `input`, `output`, `cacheRead`, and `cacheWrite` rates. `tiers` compare `usage.input + usage.cacheRead + usage.cacheWrite` with each `inputTokensAbove`; the highest threshold strictly below that total sets rates for the whole request. Use zero when the endpoint is free/local. |
| `contextWindow`, `maxTokens` | Total context capacity and maximum generated tokens. Both are token counts, not bytes or characters. |
| `samplingParams`, `headers` | Optional model defaults and model-specific headers. Request values override sampling defaults. Keep secrets out of either field. |
| `compat` | Explicit corrections for an OpenAI-compatible server's dialect. Defaults may be URL-derived, which is unsafe for an unknown local URL. |

Common completions compatibility switches cover `developer` roles, `reasoning_effort`, streaming usage and `finish_reason`, the max-token field, strict/grammar Tools, replay rules for Tool results or reasoning content, thinking format, caching, routing, and session affinity. Set only flags you can demonstrate against the server. Metadata has no general `streaming` or `toolUse` boolean: every `Provider` streams, and Tool support is proven by an actual Tool call.

## 3. Discover models with provider config

Use an async Extension when the endpoint's model list changes. Validate the untrusted response and pass the supplied signal to `fetch`. The returned list replaces this Extension's models; if refresh throws, Pi keeps the previous in-memory list.

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

`ProviderConfig.refreshModels()` must opt into cross-session storage with the published one-argument contract `await context.publish({ persist: entry })`; the example persists fully resolved `Model` objects and returns that cache when networking is disabled or fails. A native `createProvider({ fetchModels })` restores and publishes its dynamic overlay automatically.

Call `await models.refresh({ allowNetwork: true, force: true, signal })` for provider-owned remote catalogs outside an Extension. Coding Agent also offers `pi update --models`. `PI_OFFLINE` disables model network access. Refresh is optional; static providers need no refresh method.

## 4. Build a native `Provider`

Use `createProvider()` when the provider must own authentication, filter models by credential, or dispatch one or more Pi APIs. This example reuses the published OpenAI Completions adapter.

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

`envApiKeyAuth()` checks a stored credential first, then the listed environment variables. For a custom resolver, implement the public `ApiKeyAuth.resolve({ ctx, credential, signal })` method and read environment values through `ctx.env()`. Its `AuthResult` can return request auth, provider-scoped `env`, and a source label. There is no public `AuthResolver` type in `0.84.3`; do not import or invent one. SDK callers can inspect resolved state with `Models.getAuth()`.

Built-in factories follow the same contract. For example, `openaiProvider()` is exported from `@earendil-works/pi-ai/providers/openai`. Use a factory when its catalog, auth, and API mix already match your service; use `createProvider()` for your own composition.

## 5. Implement an API adapter only for a new protocol

An API adapter converts Pi `Context` messages and Tools into the remote payload, then converts the response into one `AssistantMessageEventStream`. Model metadata stays in `Model`. This method surface is a reference excerpt, not a runnable adapter:

```ts title="ProviderStreams contract (reference excerpt)"
interface ProviderStreams {
  stream(model, context, options?): AssistantMessageEventStream;
  streamSimple(model, context, options?): AssistantMessageEventStream;
  fetchDeferred?(model, handle, options?): AssistantMessageEventStream;
  cancelDeferred?(model, handle, options?): Promise<void>;
}
```

Source: pinned [`ProviderStreams`](https://github.com/earendil-works/pi/blob/4e58f324fae8ebfa98a3d45181fb248072a2afac/packages/ai/src/types.ts#L262-L281). Parameter types are omitted in the excerpt; import the published interface for the exact signatures.

`streamSimple()` is the provider-neutral entry point: it maps Pi reasoning levels, `toolChoice`, and optional thinking budgets before delegating to the adapter. A production adapter must preserve ordered `start`, indexed `text_*`, `thinking_*`, and `toolcall_*` events and finish with exactly one `done` or `error`. It must also report usage, classify context overflow, keep Tool-call IDs stable across replay, invoke request/response hooks, and stop network and parser work when `options.signal` aborts.

Study a current adapter with the same transport before coding. Do not publish a sketch that parses arbitrary SSE lines or pushes only text deltas: that loses partial JSON Tool arguments, reasoning signatures, usage, finish reasons, error bodies, and abort behavior. Put the finished `ProviderStreams` object in `createProvider({ api })`; do not register a global translator.

## 6. Select and inspect the model

List the catalog, then select by the unambiguous `provider/id` form:

```bash
pi --list-models local-openai
pi --model local-openai/local-model --thinking off "Reply with exactly: provider ready"
```

In interactive mode, open `/model` and search for `local-openai`. The selector reloads `models.json` and refreshes configured dynamic providers. In an SDK application, resolve through the application's `Models` instance:

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

If `getModel()` succeeds but the model is absent from `/model`, auth is not configured. Check `await models.getAuth(model)` or `pi auth check --provider local-openai` without printing the secret.

## 7. Probe streaming, thinking, and Tools

Run every check that applies before claiming support:

| Check | Target | Pass condition |
| --- | --- | --- |
| Selection | Configured Pi | `provider/id` resolves and answers. |
| Text stream | Live endpoint | Text arrives incrementally and ends with `"stop"`. |
| Thinking | Live endpoint | The declared reasoning representation appears. |
| Tool | Live endpoint | `toolcall_end` has the expected name and parsed arguments. |
| Failure | Local fixture | The terminal event and result both report `"error"`. |
| One retry | Local fixture | One `429` produces exactly two attempts, then content and `"stop"`. |
| Delayed abort | Local fixture | The result is `"aborted"` and the connection closes without hanging. |

The live probe uses the `Models.streamSimple()` path that applies auth and provider defaults. It prints incremental output and fails on the stream's terminal error message.

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

Run text first. Enable `reasoning` and a truthful `thinkingLevelMap` only after the thinking run emits thinking content or the protocol's documented reasoning representation. Add `image` only after an image request succeeds. Tool support requires a `toolcall_end` with the right name and parsed arguments; a normal text answer does not prove it.

This deterministic fixture is optional. Use it when writing an adapter or verifying retry, error, and cancellation behavior. Save it beside the live probe. It starts a loopback OpenAI-compatible endpoint, so it needs no external server or secret.

```bash
npx tsx --test verify-provider-errors.test.ts
```

<Accordions type="single">
<Accordion title="Optional fixture source: failure, retry, and abort">

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

## 8. Handle errors, retry, and cancellation

Keep transport policy explicit. Direct API adapters default to no retries unless the caller sets `maxRetries`; the OpenAI adapters retry connection failures, HTTP `408`, `409`, `429`, and `5xx` responses unless the server's retry header says otherwise. Retry waits are abortable. Coding Agent's higher-level agent retry is separate, so avoid multiplying retries across both layers.

An aborted request terminates with an assistant message whose `stopReason` is `"aborted"`; a provider failure uses `"error"` and an `errorMessage`. Consumers should still drain or await `stream.result()` and persist only the transcript state their application can safely replay. Never retry authentication failures, malformed Tool calls, or deterministic validation errors without changing the input.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Provider or model is missing | Validate `models.json`, use the exact provider ID, configure auth, then reopen `/model` or run `pi --list-models`. |
| `401` or `403` | Check the environment of the Pi process, `/login`, `authHeader`, and whether the endpoint expects API-key or bearer auth. Do not log the resolved key. |
| `404` | Confirm whether `baseUrl` includes `/v1`, and whether the selected `api` appends the route the server implements. |
| Stream prints text but never finishes | The adapter must emit one terminal `done` or `error` and close the body on abort. Check `finish_reason` compatibility. |
| Thinking is plain text or rejected | Correct `reasoning`, `thinkingLevelMap`, `thinkingFormat`, and `supportsReasoningEffort`; do not claim reasoning for a plain model. |
| Tool call is text, empty, or malformed | Test the server's Tool schema and streamed argument deltas. Review strict-mode, Tool-result-name, and replay compatibility flags. |
| Usage or limits are wrong | Check streaming usage support and the real context/output limits. Wrong limits cause bad truncation and misleading cost totals. |
| Dynamic refresh stalls | Pass `signal` to every fetch/read, bound remote work, keep the last good list on error, and honor `PI_OFFLINE`. |

## Security checklist

- Keep API keys and session tokens out of model metadata, source control, URLs, error text, and logs.
- Treat discovery payloads, model IDs, headers, and Tool arguments as untrusted input. Validate shape and bound sizes before storing them.
- Use HTTPS for remote providers. Pin the intended host; do not let model output choose `baseUrl`, credential commands, or proxy targets.
- Give credential commands and OAuth flows their own review. Use `ApiKeyAuth.resolve()` with the supplied `AbortSignal`, and return only provider-scoped values the adapter needs.
- Redact provider error bodies before exposing them to users or a model. They can contain credentials, request content, or gateway internals.
- Test cancellation and retry under failure. A timed-out stream must release sockets, parsers, and child work.

## Next

Once the seven checks pass, use the model in the [Quickstart](../quickstart.md) agent. [Chapter 4: Model invocation](../ch04-model-invocation.md) traces the request and stream path. If a new protocol needs a custom Tool translation layer, review [Add a custom Tool](add-custom-tool.md) alongside the source adapter you are matching.
