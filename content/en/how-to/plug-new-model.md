---
title: Add a model provider
description: Register an OpenAI-compatible endpoint or a native provider without changing the agent loop.
translation_key: how-to-plug-new-model
language: en
status: reviewed
reviewed_by: Pify maintainers
last_updated: '2026-08-24'
---

Providers own authentication, model metadata, and streaming. Registering one through an extension makes its models available to the CLI and Coding Agent SDK without changing the agent loop.

## Choose an integration level

Use the provider-config form for an OpenAI-compatible server, a proxy, or a known Pi API. Use `createProvider()` when you need custom authentication, model discovery, filtering, or streaming behavior.

## Register an OpenAI-compatible server

Create an extension:

```ts title=".pi/extensions/local-provider.ts"
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function localProvider(pi: ExtensionAPI) {
  pi.registerProvider("local-openai", {
    name: "Local OpenAI",
    baseUrl: "http://localhost:1234/v1",
    apiKey: "$LOCAL_OPENAI_API_KEY",
    api: "openai-completions",
    models: [
      {
        id: "local-model",
        name: "Local Model",
        reasoning: false,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 128000,
        maxTokens: 4096,
      },
    ],
  });
}
```

Set the credential only if the server requires one:

```bash
export LOCAL_OPENAI_API_KEY="your-key"
```

When `models` is present, it replaces the provider's current model list. Every descriptor must reflect the endpoint's real context limit, output limit, input modes, reasoning support, and token cost.

## Select and verify the model

```bash
pi --list-models local-openai
pi --provider local-openai --model local-model
```

For an SDK integration, resolve the model through `ModelRuntime` or the `Models` collection used by your application. Do not construct a model with fields copied from another provider.

## Redirect an existing provider

Omit `models` to keep the built-in catalog and change only its endpoint or headers:

```ts title=".pi/extensions/company-proxy.ts"
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function companyProxy(pi: ExtensionAPI) {
  pi.registerProvider("anthropic", {
    baseUrl: "https://ai-gateway.example.com/anthropic",
    headers: { "X-Company-Token": "$COMPANY_AI_TOKEN" },
  });
}
```

Configuration values support `$ENV_VAR` and `${ENV_VAR}` interpolation. Keep credentials in the environment or the Pi credential store, not in the extension source.

## Implement a native provider

For a non-standard protocol, create a complete `Provider` with `createProvider()` and a matching API implementation, then pass it to `pi.registerProvider(provider)`. This is the advanced path because the adapter must preserve:

- Pi message and content-block semantics;
- tool calls and tool results;
- incremental text, thinking, usage, and terminal events;
- cancellation through `AbortSignal`;
- provider error and context-overflow classification.

Test plain text, tools, images, reasoning, cancellation, malformed responses, and context overflow before enabling the provider in production.
