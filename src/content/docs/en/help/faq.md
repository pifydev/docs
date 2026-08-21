---
title: "FAQ"
description: "Frequently asked questions about Pi and the Pify Agent Book."
template: doc
sidebar:
  label: "FAQ"
  order: 1
---

Common questions about Pi and this book. If your question is not here, open an issue on GitHub.

## Pi itself

### What is Pi?

Pi is an open-source agent SDK and CLI by `earendil-works`. It ships a coding agent, a TUI, and three layered packages (`@pi-ai/core`, `@pi-agent-core`, `@pi-coding-agent`) you can use independently.

### How is Pi different from Claude Code or Codex?

Pi is intentionally minimal. It does not ship a planning mode, a built-in subagent, an MCP client, or permission prompts by default. The philosophy is "start empty, let the user fill in what they need". Claude Code and Everything Claude Code ship in the opposite direction: a fully featured agent with hundreds of commands.

### Which model providers does Pi support?

Any provider that speaks the OpenAI Chat Completions protocol or the Anthropic Messages protocol. Pi ships translators for Anthropic, OpenAI, Google, Bedrock, and several more. You can add a new provider by writing one translator file. See [How to plug in a new model](/en/how-to/plug-new-model/).

### Is Pi free?

The SDK is open-source and free. The models you call are billed by the provider. Set a spend limit on your provider account.

## Reading this book

### Should I read the chapters in order?

Chapter 1 motivates the project. Chapter 2 sets the three-layer architecture. Chapter 3 is the agent loop. The remaining chapters are reference material that can be dipped into. If you are reading to understand the codebase, chapters 1 through 3 in order is the right path.

### The English chapters say "v0.80.2" in the version note. Is that still current?

No. The Pi SDK is at v0.84.2 as of the last check. The English translation was done against v0.80.2. The architecture described in chapters 2 and 3 has not changed. Newer chapters cover newer features (fullscreen TUI mode, PiClient, Mermaid theming). A future revision will bump the version note.

### Why are some code snippets in TypeScript and others in JavaScript?

The Pi SDK is written in TypeScript. TypeScript is the source of truth. JavaScript appears only when a runtime constraint forces it. Both are valid; the TypeScript snippets are preferred.

### Can I copy the snippets into my own project?

Yes, with one caveat: the snippets assume `@pi-ai/core` or `@pi-agent-core` is installed. See the [Quickstart](/en/quickstart/) for the install pattern.

## Contributing

### How do I report a translation error?

Open an issue at [github.com/pifydev/docs/issues](https://github.com/pifydev/docs/issues) and tag it `translation`. Include the chapter slug and the offending sentence.

### Can I add a chapter?

Yes. Open a PR with the chapter in `src/content/docs/en/`. The translation workflow is automated through `scripts/translate.mjs`.

### Where is the editorial style guide?

The book follows the house rules in [CONTRIBUTING.md](https://github.com/pifydev/docs/blob/main/CONTRIBUTING.md). The short version: keep English technical terms in translations, use sentence case for headings, prefer active voice.

## Common pitfalls

### My tool result is not reaching the model.

Check that the tool handler returns a `tool_result` block with the same `tool_use_id` that came in. Mismatched ids silently drop.

### My session does not resume.

Sessions are stored under the Pi home directory, defaulting to `~/.pi/agent/sessions/`. Confirm the path exists and that the working directory at startup matches.

### The TUI renders oddly over SSH.

Set `PI_TUI_ESC_TIMEOUT` higher. Pi 0.84.x added this knob for high-latency terminals. See [Reference: Environment Variables](/en/reference/environment-variables/#pi_tui_esc_timeout).

### The model returns 429 even though I have a valid key.

You are rate-limited. Pi retries automatically with backoff. If the rate limit persists, check your account quota or switch to a smaller model.
