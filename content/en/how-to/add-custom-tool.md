---
title: Add a custom tool
description: Define a typed tool, expose it to an AgentSession, and handle progress, cancellation, and errors.
translation_key: how-to-add-custom-tool
language: en
status: reviewed
reviewed_by: Pify maintainers
last_updated: '2026-08-24'
---

Use a custom tool when the model needs to call application code or an external service. This example adds a typed `get_weather` tool to the Coding Agent SDK.

## Install the SDK

```bash
npm install @earendil-works/pi-coding-agent typebox
```

Pi uses TypeBox schemas both to describe arguments to the model and to validate each tool call before execution.

## Define the tool

```ts title="tools/get-weather.ts"
import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

export const getWeather = defineTool({
  name: "get_weather",
  label: "Get Weather",
  description: "Return the current weather for a city.",
  parameters: Type.Object({
    city: Type.String({ description: "City name, for example Paris" }),
    unit: Type.Optional(
      Type.Union([Type.Literal("celsius"), Type.Literal("fahrenheit")]),
    ),
  }),
  async execute(_toolCallId, params, signal, onUpdate) {
    onUpdate?.({
      content: [{ type: "text", text: `Checking ${params.city}...` }],
      details: {},
    });

    const response = await fetch(
      `https://weather.example.test/current?city=${encodeURIComponent(params.city)}`,
      { signal },
    );
    if (!response.ok) throw new Error(`Weather service returned ${response.status}`);

    const data = (await response.json()) as { temperature: number };
    return {
      content: [
        {
          type: "text",
          text: `${params.city}: ${data.temperature}° ${params.unit ?? "celsius"}`,
        },
      ],
      details: { city: params.city, temperature: data.temperature },
    };
  },
});
```

The handler receives a validated `params` object. Pass `signal` to cancellable I/O, and call `onUpdate` only for useful progress. Throw when execution fails; Pi converts the exception into a tool error for the model.

## Add the tool to a session

```ts title="agent.ts"
import {
  createAgentSession,
  ModelRuntime,
  SessionManager,
} from "@earendil-works/pi-coding-agent";
import { getWeather } from "./tools/get-weather.js";

const modelRuntime = await ModelRuntime.create();
const { session } = await createAgentSession({
  modelRuntime,
  sessionManager: SessionManager.inMemory(),
  customTools: [getWeather],
});

await session.prompt("What is the weather in Paris?");
```

`customTools` are combined with tools registered by extensions. If you also pass a `tools` allowlist, include `"get_weather"` or the tool will remain inactive.

## Register the tool from an extension

An extension can register the same definition through `pi.registerTool()`:

```ts title="weather-extension.ts"
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

export default function weatherExtension(pi: ExtensionAPI) {
  pi.registerTool({
    name: "get_weather",
    label: "Get Weather",
    description: "Return the current weather for a city.",
    parameters: Type.Object({ city: Type.String() }),
    async execute(_toolCallId, { city }) {
      return {
        content: [{ type: "text", text: `No forecast configured for ${city}.` }],
        details: {},
      };
    },
  });
}
```

Tool names should be stable, specific, and easy for the model to distinguish. Keep secrets out of descriptions and returned content.
