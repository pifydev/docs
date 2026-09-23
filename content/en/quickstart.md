---
title: 'Quickstart: Build your first Pi agent'
description: >-
  Create a small TypeScript program that streams a model response through the
  current Pi AI API.
translation_key: quickstart
language: en
status: reviewed
reviewed_by: Pify maintainers
last_updated: '2026-09-23'
---
This guide targets the official [Pi `0.87.1` release](https://github.com/earendil-works/pi/releases/tag/v0.87.1), reviewed against [`f07218c`](https://github.com/earendil-works/pi/commit/f07218c4d4bbc12bef056a7058c3dd49dfe41abe), and creates a small TypeScript program that streams a model response. You will install `@earendil-works/pi-ai`, register the built-in providers, resolve one model, and consume its event stream. No prior Pi knowledge is required.

:::tip[What you will have at the end]

A TypeScript file that calls one model through the `Models.streamSimple()` interface. You can then add tools, event handling, session persistence, and an agent loop.

:::

## Before you start

You need:

- **Node.js 22.19 or later** - check with `node --version`
- **An API key for one provider** - Anthropic, OpenAI, Google, or any local proxy that speaks the OpenAI Chat Completions protocol. Anthropic is used in the snippets below.
- **A terminal** in an empty folder

:::caution[Cost and safety]

This guide makes real API calls. Set a low spending limit on your provider account, and never commit the API key.

:::

## 1. Initialize the project

```bash
mkdir pi-quickstart && cd pi-quickstart
npm init -y
npm pkg set type=module
npm install @earendil-works/pi-ai@0.87.1
npm install --save-dev tsx
```

This gives you:

- a `package.json` configured for ECMAScript modules
- `@earendil-works/pi-ai` and the `tsx` TypeScript loader in `node_modules`

## 2. Add your API key

Create a file called `.env` in the same folder:

```bash title=".env"
ANTHROPIC_API_KEY=sk-ant-...
```

:::note[Why a `.env` file and not a hardcoded string]

The key is read by the SDK at runtime. Keeping it in `.env` means you can `.gitignore` the file and never leak the key to source control.

:::

Add `.env` to `.gitignore`:

```bash title=".gitignore"
node_modules
.env
```

## 3. Write the agent

Create `agent.ts`:

```ts title="agent.ts"
import { builtinModels } from "@earendil-works/pi-ai/providers/all";

const models = builtinModels();
const model = models.getModel("anthropic", "claude-sonnet-4-5");
if (!model) throw new Error("Model not found");

const stream = models.streamSimple(model, {
  systemPrompt: "You are a concise assistant. Reply in one sentence.",
  messages: [
    {
      role: "user",
      content: "What is the capital of France?",
      timestamp: Date.now(),
    },
  ],
});

for await (const event of stream) {
  if (event.type === "text_delta") {
    process.stdout.write(event.delta);
  } else if (event.type === "done") {
    console.log("\n[done] reason:", event.reason);
  }
}
```

Four steps happen in this file:

1. `builtinModels()` creates a `Models` collection with the built-in providers registered.
2. `models.getModel("anthropic", "claude-sonnet-4-5")` resolves a model descriptor from that collection.
3. `models.streamSimple(model, context)` opens a streaming request and returns an async iterable of events.
4. The `for await` loop consumes events until the stream finishes. `text_delta` carries text fragments; `done` is the terminal event.

## 4. Load the key and run

The provider reads `ANTHROPIC_API_KEY` from the process environment. Node can load the `.env` file directly:

```bash
node --env-file=.env --import tsx agent.ts
```

:::tip[Or use a script]

Add a script to `package.json` if you want a shorter command:

```json title="package.json"
{
  "scripts": {
    "start": "node --env-file=.env --import tsx agent.ts"
  }
}
```

Then run `npm start`.

:::

You should see something like:

```
The capital of France is Paris.
[done] reason: stop
```

If you see that, you have a working Pi agent.

## 5. Try one variation

Change the user message and run it again:

```ts title="agent.ts" {6}
const stream = models.streamSimple(model, {
  systemPrompt: "You are a concise assistant. Reply in one sentence.",
  messages: [
    {
      role: "user",
      content: "Name three Pi SDK packages.",
      timestamp: Date.now(),
    },
  ],
});
```

The `{6}` metadata asks the Fumadocs code renderer to highlight line 6.

## Where to go next

You now have a working `Models.streamSimple()` call. Continue with the topic that matches your goal:

| Goal | Read |
|---|---|
| Understand the full agent loop, not just one model call | [Chapter 3: Agent Loop](ch03-agent-loop.md) |
| Add a tool the model can call | [How to add a custom tool](how-to/add-custom-tool.md) |
| Plug in a model provider the SDK does not ship with | [How to plug in a new model](how-to/plug-new-model.md) |
| Persist the conversation across runs | [How to persist sessions](how-to/persist-sessions.md) |

## Troubleshooting

**`Error: ANTHROPIC_API_KEY is not set`**

The SDK did not find the key. Confirm `.env` exists in the current directory and that you launched Node with `--env-file=.env`.

**`Error: model not found`**

`models.getModel()` could not resolve the descriptor. Check both the provider ID and model ID. See [Reference: Configuration](reference/configuration.md#models).

**`SyntaxError: Cannot use import statement outside a module`**

Your `package.json` is missing `"type": "module"`. Run `npm pkg set type=module` and try again.
