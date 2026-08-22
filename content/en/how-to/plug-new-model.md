---
title: How to plug in a new model
description: >-
  Add a model provider that the SDK does not ship with by writing one translator
  and one descriptor.
translation_key: how-to-plug-new-model
language: en
---
This guide shows how to add a model provider that `@pi-ai/core` does not ship with. After it you will be able to call `getModel("my-provider", "my-model")` and have the SDK talk to the new provider with no changes to the agent loop.

:::tip[When you need this]
- A local llama.cpp server
- A self-hosted model gateway that wraps Anthropic or OpenAI
- A new commercial provider that has not been added upstream yet
:::

## The two halves

To plug in a model you need exactly two things:

1. **A descriptor** that names the model, its capabilities, and where to send requests.
2. **A translator** that converts Pi messages into the provider wire format and the provider stream back into Pi events.

The descriptor is pure data. The translator is the only code you write.

## 1. Write the descriptor

A descriptor is a literal object. Save it next to your other descriptors.

```ts title="models/my-provider.ts"
import type { ModelDescriptor } from "@pi-ai/core";

export const myModel: ModelDescriptor = {
  id: "my-model",
  provider: "my-provider",
  displayName: "My Model 7B",
  contextWindow: 8192,
  maxOutputTokens: 2048,
  pricing: { input: 0, output: 0 }, // free for self-hosted
  capabilities: {
    toolUse: true,
    images: false,
    streaming: true,
    thinking: false,
  },
  baseUrl: "http://localhost:8080/v1",
  apiKeyEnvVar: "MY_PROVIDER_API_KEY",
};
```

`baseUrl` points at the provider. `apiKeyEnvVar` is the environment variable the SDK reads at call time.

## 2. Register the descriptor

```ts title="models/index.ts"
import { registerModel } from "@pi-ai/core";
import { myModel } from "./models/my-provider.js";

registerModel("my-provider", myModel);
```

`registerModel` is idempotent. Calling it twice with the same provider id replaces the entry.

## 3. Write a translator

A translator is a small object with two methods: `request` builds the HTTP body from Pi messages, and `response` parses the provider stream back into Pi events.

```ts title="translators/openai-completions.ts"
import type { Translator, Context, Message } from "@pi-ai/core";

export const openaiCompletionsTranslator: Translator = {
  async request(model, context: Context, options) {
    const body = {
      model: model.id,
      messages: [
        ...(context.systemPrompt
          ? [{ role: "system", content: context.systemPrompt }]
          : []),
        ...context.messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
      ],
      stream: true,
    };
    return {
      url: `${model.baseUrl}/chat/completions`,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${process.env[model.apiKeyEnvVar]}`,
      },
      body,
    };
  },

  async *response(model, response, options) {
    // Parse SSE chunks into Pi events.
    // The exact shape depends on the provider.
    // See the Anthropic or OpenAI translator for a full implementation.
    for await (const chunk of parseSse(response)) {
      yield {
        type: "text_delta",
        delta: chunk.choices[0].delta.content ?? "",
      };
    }
    yield { type: "done", reason: "stop" };
  },
};
```

:::note[This is a skeleton]
The real translators in `@pi-ai/core` are 200-300 lines. They handle tool calls, image content, errors, retries, and streaming back-pressure. Copy the closest existing translator and adapt it rather than starting from scratch.
:::

## 4. Wire the translator

```ts title="translators/index.ts"
import { registerTranslator } from "@pi-ai/core";
import { openaiCompletionsTranslator } from "./openai-completions.js";

registerTranslator("my-provider", openaiCompletionsTranslator);
```

## 5. Call it

```ts title="agent.ts"
import { getModel, streamSimple } from "@pi-ai/core";
import "./models/index.js";
import "./translators/index.js";

const model = getModel("my-provider", "my-model");
const stream = streamSimple(model, {
  messages: [{ role: "user", content: "Hello" }],
});
```

If you have a llama.cpp server running on `localhost:8080`, you now have a working agent that talks to it.

## Pitfalls

**The translator yields the wrong event types**

The agent loop branches on event type. A `done` event with `reason: "stop"` ends the turn cleanly. A `tool_use` event without a matching `tool_result` block leaves the loop hanging.

**The provider sends responses as JSON, not SSE**

Most modern providers support streaming. If yours does not, set `streaming: false` in the descriptor and yield all events from a single `response` call.

**The descriptor is registered but `getModel` returns undefined**

`getModel` reads from the catalog. `registerModel` mutates the catalog. Make sure the import order in your entry point loads the registration before the first `getModel` call.

## Next

- [Chapter 4: Model Invocation](../ch04-model-invocation.md) shows how the upstream translators are layered.
- [Reference: API](../reference/api.md) lists every descriptor field and translator method.
