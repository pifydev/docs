---
title: Add a custom tool
description: Define a typed Tool, register it with agent core or Coding Agent, and control validation, progress, cancellation, permissions, and errors.
translation_key: how-to-add-custom-tool
language: en
official_refs:
  - "https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/agent/README.md#tools"
  - "https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/coding-agent/docs/extensions.md#custom-tools"
terms_used:
  - AgentTool
  - ToolDefinition
  - ExtensionContext
  - AbortSignal
status: reviewed
reviewed_by: Pify maintainers
last_updated: "2026-08-24"
---

This guide builds a typed `get_weather` Tool that the model can call during a turn. The example runs against a small in-memory data set, so you can test the Tool without an external service. The same execution contract works with a database or HTTP client once you pass through cancellation and keep credentials out of model-visible output.

:::tip[What you will have]

A TypeBox schema, a four-argument agent-core `AgentTool`, a five-argument Coding Agent `ToolDefinition`, and registration examples for `customTools` and `pi.registerTool()`. The final result becomes a `ToolResultMessage` for the next model call; progress updates remain runtime events.

:::

## Choose the integration route

| Route | Use it when | Registration |
| --- | --- | --- |
| Agent core | Your application owns the model runtime, transcript, and policy hooks. | Put an `AgentTool` in `Agent.state.tools` or `initialState.tools`. |
| Coding Agent SDK | You need `AgentSession`, persistence, resource loading, and built-in Tools. | Pass a `ToolDefinition` through `customTools`. |
| Coding Agent Extension | The Tool should be discovered with an Extension and use live session or UI context. | Call `pi.registerTool()` during Extension loading. |

Choose one product route for registration. A Coding Agent session combines `customTools` with Extension-registered Tools, but registering the same name through both routes makes ownership unclear.

## Prerequisites

Pi `0.84.2` requires Node.js `>=22.19.0`. Start an ESM TypeScript project and install every package imported directly by the examples:

```bash
npm init -y
npm pkg set type=module
npm install @earendil-works/pi-ai@0.84.2 @earendil-works/pi-agent-core@0.84.2 @earendil-works/pi-coding-agent@0.84.2
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

Configure provider credentials as described in [Quickstart](../quickstart.md) before running either agent. `@earendil-works/pi-ai` re-exports `Type` and `Static` from TypeBox, so these files do not need a second schema import path.

## 1. Describe the Tool

The model sees `name`, `description`, and `parameters`. The runtime and UI also use `label`. Keep the protocol name stable and specific. Write the description as a selection rule: say when to call the Tool, what it accepts, and what it returns.

```ts title="tools/get-weather-core.ts"
import { Type, type Static } from "@earendil-works/pi-ai";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { setTimeout as delay } from "node:timers/promises";

export const weatherParameters = Type.Object(
  {
    city: Type.String({
      description: "City name. This demo supports Paris and Tokyo.",
      minLength: 1,
      maxLength: 80,
    }),
    unit: Type.Optional(
      Type.Union([Type.Literal("celsius"), Type.Literal("fahrenheit")]),
    ),
  },
  { additionalProperties: false },
);

export type WeatherParameters = Static<typeof weatherParameters>;

export interface WeatherDetails {
  phase: "lookup" | "done";
  city: string;
  unit: "celsius" | "fahrenheit";
  temperature?: number;
}

const celsiusByCity: Record<string, number> = {
  paris: 18,
  tokyo: 24,
};

export const getWeatherTool: AgentTool<
  typeof weatherParameters,
  WeatherDetails
> = {
  name: "get_weather",
  label: "Get weather",
  description:
    "Return the demo temperature for Paris or Tokyo. Use only for a weather or temperature question about one of those cities.",
  parameters: weatherParameters,
  executionMode: "parallel",
  async execute(_toolCallId, params, signal, onUpdate) {
    signal?.throwIfAborted();

    const city = params.city.trim();
    const unit = params.unit ?? "celsius";
    const celsius = celsiusByCity[city.toLowerCase()];
    if (celsius === undefined) {
      throw new Error(`Unsupported city: ${city}`);
    }

    onUpdate?.({
      content: [{ type: "text", text: `Checking ${city}...` }],
      details: { phase: "lookup", city, unit },
    });

    await delay(200, undefined, { signal });
    const temperature =
      unit === "celsius" ? celsius : Math.round((celsius * 9) / 5 + 32);

    return {
      content: [
        {
          type: "text",
          text: `${city}: ${temperature} degrees ${unit}`,
        },
      ],
      details: { phase: "done", city, unit, temperature },
    };
  },
};
```

TypeBox has two jobs here. `Static<typeof weatherParameters>` gives the handler a compile-time parameter type. Pi also validates each model-produced argument object against the schema before `execute` runs. Business rules still belong in application code: a valid string can name a city that the service does not support.

## 2. Write the handler

The low-level `AgentTool.execute` contract has exactly four arguments. This source-faithful excerpt is from `packages/agent/src/types.ts` at the pinned commit:

```ts
execute: (
  toolCallId: string,
  params: Static<TParameters>,
  signal?: AbortSignal,
  onUpdate?: AgentToolUpdateCallback<TDetails>,
) => Promise<AgentToolResult<TDetails>>;
```

`params` has already passed schema validation. Forward `signal` to cancellable I/O and check it around work that cannot accept a signal. Call `onUpdate` with a complete partial `AgentToolResult`: both `content` and `details` are required. The callback produces `tool_execution_update` events; only the final returned result is sent to the model.

Throw an `Error` when execution fails. Agent core catches it, emits `tool_execution_end` with `isError: true`, and creates an error `ToolResultMessage`. Return ordinary content only for success. Error messages are model-visible, so remove credentials, headers, private paths, and raw upstream response bodies before throwing.

## 3. Register the Tool with the agent

### Agent core

Agent core accepts the four-argument `AgentTool` directly. `builtinModels()` owns provider lookup and streaming; the `Agent` owns the loop and event stream.

```ts title="agent-core.ts"
import { Agent } from "@earendil-works/pi-agent-core";
import { builtinModels } from "@earendil-works/pi-ai/providers/all";
import { getWeatherTool } from "./tools/get-weather-core.js";

const models = builtinModels();
const model = models.getModel("anthropic", "claude-sonnet-4-5");
if (!model) throw new Error("Configured model was not found");

const agent = new Agent({
  initialState: {
    systemPrompt: "Use get_weather for supported weather questions.",
    model,
    thinkingLevel: "off",
    tools: [getWeatherTool],
    messages: [],
  },
  streamFn: (activeModel, context, options) =>
    models.streamSimple(activeModel, context, options),
});

const unsubscribe = agent.subscribe((event) => {
  if (event.type === "message_update") {
    if (event.assistantMessageEvent.type === "text_delta") {
      process.stdout.write(event.assistantMessageEvent.delta);
    }
  } else if (event.type === "tool_execution_update") {
    const first = event.partialResult.content[0];
    if (first?.type === "text") console.error(`\n[progress] ${first.text}`);
  } else if (event.type === "tool_execution_end") {
    console.error(`\n[tool ${event.isError ? "error" : "done"}] ${event.toolName}`);
  }
});

const abort = () => agent.abort();
process.once("SIGINT", abort);

try {
  await agent.prompt("What is the weather in Tokyo?");
} finally {
  process.off("SIGINT", abort);
  unsubscribe();
}
```

When the model emits a normalized `ToolCall` for `get_weather`, the loop resolves the active Tool, validates the arguments, executes it, appends the matching `ToolResultMessage`, and calls the model again so it can answer the user.

### Coding Agent SDK with `defineTool()` and `customTools`

`customTools` accepts Coding Agent `ToolDefinition` objects. Their `execute` method has a fifth `ExtensionContext` argument. The following definition reuses the core implementation but declares the product-level signature through `defineTool()`:

```ts title="tools/get-weather-session.ts"
import { defineTool } from "@earendil-works/pi-coding-agent";
import {
  getWeatherTool,
  weatherParameters,
  type WeatherDetails,
} from "./get-weather-core.js";

export const getWeather = defineTool<
  typeof weatherParameters,
  WeatherDetails
>({
  name: getWeatherTool.name,
  label: getWeatherTool.label,
  description: getWeatherTool.description,
  promptSnippet: "Look up the demo temperature for Paris or Tokyo",
  parameters: weatherParameters,
  executionMode: getWeatherTool.executionMode,
  async execute(toolCallId, params, signal, onUpdate, _ctx) {
    return getWeatherTool.execute(toolCallId, params, signal, onUpdate);
  },
});
```

`defineTool()` is a type-inference identity function, not a registry. Coding Agent later adapts the `ToolDefinition` to the four-argument `AgentTool` contract. Its internal wrapper copies the shared fields and injects a fresh `ExtensionContext` as the fifth argument when it calls the definition. Do not import that internal wrapper; use `customTools` or `pi.registerTool()` so the context comes from the active session.

```ts title="agent-session.ts"
import {
  createAgentSession,
  ModelRuntime,
  SessionManager,
} from "@earendil-works/pi-coding-agent";
import { getWeather } from "./tools/get-weather-session.js";

const modelRuntime = await ModelRuntime.create();
const { session } = await createAgentSession({
  modelRuntime,
  sessionManager: SessionManager.inMemory(),
  customTools: [getWeather],
  tools: ["get_weather"],
});

session.subscribe((event) => {
  if (event.type === "message_update") {
    if (event.assistantMessageEvent.type === "text_delta") {
      process.stdout.write(event.assistantMessageEvent.delta);
    }
  } else if (event.type === "tool_execution_update") {
    console.error("\n[progress]", event.partialResult);
  } else if (event.type === "tool_execution_end") {
    console.error(`\n[tool ${event.isError ? "error" : "done"}] ${event.toolName}`);
  }
});

const abort = () => void session.abort();
process.once("SIGINT", abort);

try {
  await session.prompt("What is the weather in Paris?");
} finally {
  process.off("SIGINT", abort);
  session.dispose();
}
```

The explicit `tools` array is an allowlist across built-in, custom, and Extension Tools. This example intentionally enables only `get_weather`. Omit `tools` to use the normal defaults, or include every Tool name the session needs.

### Coding Agent Extension with `pi.registerTool()`

Place this file in `.pi/extensions/` for project-local discovery, or load it through `DefaultResourceLoader`. The same `ToolDefinition` can be registered without `customTools`:

```ts title=".pi/extensions/weather.ts"
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { getWeather } from "../../tools/get-weather-session.js";

export default function weatherExtension(pi: ExtensionAPI): void {
  pi.registerTool(getWeather);
}
```

Use the Extension route when `execute` needs its live `ctx.cwd`, `ctx.mode`, `ctx.hasUI`, session metadata, or controlled session actions. Do not capture load-time context and reuse it after a session replacement or reload.

## 4. Add a permission gate

Tool declarations do not grant permission. Agent core exposes `beforeToolCall`; Coding Agent connects the Extension `tool_call` event to that hook. This full Extension registers the Tool and asks before each call:

```ts title=".pi/extensions/weather.ts"
import {
  isToolCallEventType,
  type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";
import type { WeatherParameters } from "../../tools/get-weather-core.js";
import { getWeather } from "../../tools/get-weather-session.js";

export default function weatherExtension(pi: ExtensionAPI): void {
  pi.registerTool(getWeather);

  pi.on("tool_call", async (event, ctx) => {
    if (
      !isToolCallEventType<"get_weather", WeatherParameters>(
        "get_weather",
        event,
      )
    ) {
      return;
    }

    if (!ctx.hasUI) {
      return {
        block: true,
        reason: "get_weather requires interactive approval",
      };
    }

    const approved = await ctx.ui.confirm(
      "Run get_weather?",
      `Look up the demo weather for ${event.input.city}?`,
    );
    if (!approved) {
      return { block: true, reason: "User denied the weather lookup" };
    }
  });
}
```

There is no current `requiresPermission` Tool field. Decide policy in the host hook and fail closed when approval is required but `ctx.hasUI` is false. A blocked call becomes an error Tool result, so the model can explain the denial or choose another action. For agent core, supply the equivalent application policy through `new Agent({ beforeToolCall })`.

## Control lifecycle and security boundaries

### Activation, concurrency, and termination

Custom and Extension Tools are active by default unless a creation-time `tools` allowlist or `excludeTools` filters them. `session.getActiveToolNames()` and `session.setActiveToolsByName(names)` change the active set for the current `AgentSession`; unknown or filtered names are ignored, the system prompt is rebuilt, and the change applies on the next turn. An Extension has the equivalent `pi.getActiveTools()` and `pi.setActiveTools(names)` methods.

The agent-wide execution mode defaults to `"parallel"`. Set `executionMode: "sequential"` on a Tool that mutates shared state and cannot overlap safely. If any Tool called in a batch is sequential, the whole batch runs sequentially.

A result may set `terminate: true` when the Tool itself is the final answer, such as a `submit_result` Tool. Pi skips the automatic follow-up model call only when every finalized result in that batch has `terminate: true`. A weather lookup should not set it because the model still needs to phrase the answer.

Use active-Tool controls for session behavior, not as a substitute for authorization inside `execute`.

### Arguments, paths, commands, and secrets

Treat model arguments as untrusted even after schema validation. TypeBox checks shape, bounds, and literals; it cannot decide whether a customer ID, filesystem path, URL, or shell command is authorized. Recheck those rules next to the effect. An Extension `tool_call` handler may mutate `event.input`, and Pi does not revalidate after that mutation, so a mutating handler must preserve or recheck the schema invariants.

For a Tool that reads an existing project file, resolve both the root and target through `realpath()` and then enforce containment. The following is application code, not a Pi helper:

```ts title="tools/project-path.ts"
import { realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

export async function resolveExistingPathInsideRoot(
  cwd: string,
  input: string,
): Promise<string> {
  if (isAbsolute(input)) throw new Error("Path must be project-relative");

  const root = await realpath(cwd);
  const target = await realpath(resolve(root, input));
  const fromRoot = relative(root, target);
  const escapes =
    fromRoot === ".." ||
    fromRoot.startsWith(`..${sep}`) ||
    isAbsolute(fromRoot);

  if (escapes) throw new Error("Path leaves the project root");
  return target;
}
```

This handles existing symlink targets but does not remove time-of-check/time-of-use races on a hostile shared filesystem. Use an OS sandbox or descriptor-relative filesystem API for that threat model. For commands, pass a fixed executable and an argument array instead of interpolating model text into a shell string. Keep secrets in host configuration, never in `description`, progress content, final content, or thrown messages.

## Test and debug

Test the executable contract without a model first. This covers typed parameters, progress, the final result, a business-rule error, and cancellation:

```ts title="test/get-weather.test.ts"
import assert from "node:assert/strict";
import test from "node:test";
import { getWeatherTool } from "../tools/get-weather-core.js";

test("get_weather reports progress and returns a typed result", async () => {
  const updates: string[] = [];
  const result = await getWeatherTool.execute(
    "test-call",
    { city: "Paris", unit: "celsius" },
    undefined,
    (update) => {
      const first = update.content[0];
      if (first?.type === "text") updates.push(first.text);
    },
  );

  assert.deepEqual(updates, ["Checking Paris..."]);
  assert.equal(result.details.temperature, 18);
});

test("get_weather rejects an unsupported city", async () => {
  await assert.rejects(
    getWeatherTool.execute("test-call", { city: "Oslo" }),
    /Unsupported city: Oslo/,
  );
});

test("get_weather observes cancellation", async () => {
  const controller = new AbortController();
  controller.abort();

  await assert.rejects(
    getWeatherTool.execute("test-call", { city: "Tokyo" }, controller.signal),
    { name: "AbortError" },
  );
});
```

```bash
npx tsc --noEmit
npx tsx --test test/get-weather.test.ts
npx tsx agent-core.ts
npx tsx agent-session.ts
```

Subscribe before calling `prompt()` when debugging the full loop. Log `tool_execution_start`, `tool_execution_update`, and `tool_execution_end`; redact the payloads if they can contain user data or credentials.

## Pitfalls

**The Tool is registered but the model never calls it**

Check that the selected model supports Tool calls, the Tool name is active, and a `tools` allowlist includes it. Then tighten the description so it distinguishes this Tool from its neighbors. Do not tell the model to call it for every request.

**The Tool throws, but the error should be recoverable**

Throw a short, actionable, sanitized `Error`. Pi encodes it as an error Tool result and the model can retry or explain it. Returning the same text as a successful result leaves `isError` false. An uncaught Tool exception does not need a local `try/catch` unless you are translating a low-level error into a safer message.

**Progress never appears or continues after completion**

Register the event subscriber before the prompt and call the provided `onUpdate` only while `execute` is pending. Pi ignores late updates after the Tool promise settles. Each update needs both `content` and `details`.

**Cancellation does not stop the external operation**

`session.abort()` and `agent.abort()` signal cancellation; they cannot undo an effect that ignores `AbortSignal`. Pass the signal to `fetch`, timers, filesystem calls that support it, and child-process wrappers, then check it between non-cancellable stages.

**The result consumes too much context**

Trim logs and response bodies before placing them in `content`. Return a bounded page plus a cursor, or store the full data outside the transcript and return a safe summary. Progress events also need bounds because UIs and subscribers receive them.

## Next

- [Chapter 5: Tool System](../ch05-tool-system.md) follows validation, hooks, scheduling, errors, adapter boundaries, and result construction through the pinned source.
- [How to plug in a new model](plug-new-model.md) covers the provider side of an agent integration.
