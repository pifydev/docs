---
title: 'Quickstart: Build your first Pi agent'
description: >-
  A 10-minute tutorial that takes you from an empty folder to a working Pi agent
  that streams a model reply.
translation_key: quickstart
language: en
---
This tutorial takes you from an empty folder to a working Pi agent that streams a model reply. You will install `@pi-ai/core`, plug in one model, and run a 5-line script. No prior Pi knowledge required.

:::tip[What you will have at the end]
A TypeScript file that talks to one model through the same `streamSimple` interface the Pi agent itself uses. From there you can layer on tools, events, sessions, and the full agent loop.
:::

## Before you start

You need:

- **Node.js 20 or later** — check with `node --version`
- **An API key for one provider** — Anthropic, OpenAI, Google, or any local proxy that speaks the OpenAI Chat Completions protocol. Anthropic is used in the snippets below.
- **A terminal** in an empty folder

:::caution[Cost and safety]
This tutorial makes real API calls. Set a low spend limit on your provider account before continuing, and keep the key out of any file you commit.
:::

## 1. Initialize the project

```bash
mkdir pi-quickstart && cd pi-quickstart
npm init -y
npm pkg set type=module
npm install @pi-ai/core
```

This gives you:

- a `package.json` with `"type": "module"` so `.ts` and `.mjs` files run without flags
- `@pi-ai/core` installed in `node_modules`

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
import { getModel, streamSimple } from "@pi-ai/core";

const model = getModel("anthropic", "claude-sonnet-4-5");

const stream = streamSimple(model, {
  systemPrompt: "You are a concise assistant. Reply in one sentence.",
  messages: [{ role: "user", content: "What is the capital of France?" }],
});

for await (const event of stream) {
  if (event.type === "text_delta") {
    process.stdout.write(event.delta);
  } else if (event.type === "done") {
    console.log("\n[done] reason:", event.reason);
  }
}
```

Three things happen in this file:

1. `getModel("anthropic", "claude-sonnet-4-5")` resolves a model descriptor from the catalog. The descriptor knows the provider, the URL, and the request shape.
2. `streamSimple(model, context)` opens a streaming request. It returns an async iterable of events.
3. The `for await` loop pulls events until the stream finishes. `text_delta` events carry the token chunks; `done` is the terminal event.

## 4. Load the key and run

The SDK reads the API key from `process.env.ANTHROPIC_API_KEY`. To get the value from `.env` into the environment, use a one-shot loader:

```bash
npm install --save-dev dotenv
node --env-file=.env --import tsx agent.ts
```

:::tip[Or use a script]
If you prefer a permanent setup, add this to `package.json`:

```json title="package.json"
{
  "scripts": {
    "start": "node --env-file=.env --import tsx agent.ts"
  }
}
```

Then `npm start` does the same thing.
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
const stream = streamSimple(model, {
  systemPrompt: "You are a concise assistant. Reply in one sentence.",
  messages: [{ role: "user", content: "Name three Pi SDK packages." }],
});
```

The `{6}` after the language tag is Expressive Code line highlighting. Line 6 is now visually called out in the rendered code block.

## Where to go next

You have a working `streamSimple` call. The rest of the book layers on top of this primitive:

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

`getModel` could not resolve the model descriptor. Check the spelling. The canonical IDs are listed in [Reference: Models](reference/configuration.md#models).

**`SyntaxError: Cannot use import statement outside a module`**

Your `package.json` is missing `"type": "module"`. Run `npm pkg set type=module` and try again.
