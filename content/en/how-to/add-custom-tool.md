---
title: How to add a custom tool
description: >-
  Register a function the model can call, describe it with a JSON schema, and
  read the result back in the loop.
translation_key: how-to-add-custom-tool
language: en
---
This guide shows how to register a tool the model can call during a turn. After it you will have a working `get_weather` tool that the agent invokes when relevant and reads the result back into the loop.

:::tip[What you will have]

A tool definition (name, description, JSON schema) and a handler. The handler runs when the model emits a `tool_use` block. The result is fed back as a `tool_result` block on the next loop iteration.

:::

## 1. Describe the tool

The model only sees the schema. Write it as you would write the public docs for the tool.

```ts title="tools/get_weather.ts"
import { Type } from "@sinclair/typebox";

export const get_weather = {
  name: "get_weather",
  description: "Return the current weather for a city. Use when the user asks about weather or temperature.",
  parameters: Type.Object({
    city: Type.String({ description: "City name, e.g. 'Paris'" }),
    unit: Type.Optional(
      Type.Union([Type.Literal("celsius"), Type.Literal("fahrenheit")], {
        default: "celsius",
      })
    ),
  }),
};
```

:::note[Why TypeBox and not raw JSON Schema]

The SDK accepts both. TypeBox gives compile-time safety for the parameters, so a typo in `city` shows up at build time rather than as a runtime validation error.

:::

## 2. Write the handler

The handler receives the parsed arguments and returns a string or an object. The SDK serialises the return value into the `tool_result` block.

```ts title="tools/get_weather.ts" {13}
export async function get_weather_handler(args: {
  city: string;
  unit?: "celsius" | "fahrenheit";
}): Promise<string> {
  // In real code, call a weather API.
  // The hardcoded response below stands in for that.
  const temp = 18;
  const unit = args.unit ?? "celsius";
  return `${temp} degrees ${unit} in ${args.city}`;
}
```

The handler must be `async` and must return either a string or a serialisable object. The return value is the value the model sees in the next iteration.

## 3. Register both with the agent

```ts title="agent.ts"
import { agentLoop, getModel } from "@pi-agent-core";
import { get_weather, get_weather_handler } from "./tools/get_weather.js";

const tools = [
  {
    ...get_weather,
    handler: get_weather_handler,
  },
];

const model = getModel("anthropic", "claude-sonnet-4-5");

for await (const event of agentLoop({
  model,
  systemPrompt: "You can look up the weather. Use the get_weather tool when relevant.",
  messages: [{ role: "user", content: "What's the weather in Tokyo?" }],
  tools,
})) {
  if (event.type === "text_delta") process.stdout.write(event.delta);
  if (event.type === "tool_use") console.log("\n[tool]", event.name, event.args);
  if (event.type === "done") console.log("\n[done] reason:", event.reason);
}
```

When the model decides the user's question needs weather, it emits a `tool_use` block with `{ city: "Tokyo" }`. The agent loop calls your handler, feeds the return value back as a `tool_result`, and continues.

## 4. Add a permission gate (optional)

By default, the agent calls the handler without asking. For tools that touch the filesystem or shell, gate the call behind a permission check:

```ts title="tools/get_weather.ts" {2}
{
  ...get_weather,
  handler: get_weather_handler,
  requiresPermission: true,
}
```

When `requiresPermission` is `true`, the coding agent prompts the user before invoking the handler. In headless or `yolo` mode the prompt is skipped.

## Pitfalls

**The handler is `async` but throws synchronously**

Wrap the body in `try/catch` and return a string error message. The model sees the string and can react. A thrown exception ends the loop.

**The schema is too vague**

If the description is "weather tool", the model will call it for every message. Be specific: name the use cases, name the inputs, name what is returned.

**The result is too large**

A 50,000-character string is a fast way to blow the context window. Trim results before returning. For paginated APIs, return the first page and let the tool be called again.

## Next

- [Chapter 5: Tool System](../ch05-tool-system.md) covers the full tool registry and the JSON Schema to provider-translator pipeline.
- [How to plug in a new model](plug-new-model.md) for the other half of agent customisation.
