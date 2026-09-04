---
title: FAQ
description: Frequently asked questions about Pi and the Pify Agent Book.
translation_key: faq
language: en
status: reviewed
reviewed_by: Pify maintainers
last_updated: '2026-09-04'
---
These answers cover Pi and this documentation project. Open a [GitHub issue](https://github.com/pifydev/docs/issues) if your question is not listed.

## Pi itself

### What is Pi?

Pi is an open-source coding-agent toolkit. Its monorepo contains a model API, an agent runtime, a terminal UI, and the `pi` command-line application. The main npm packages are `@earendil-works/pi-ai`, `@earendil-works/pi-agent-core`, and `@earendil-works/pi-coding-agent`.

### How is Pi different from Claude Code or Codex?

Pi keeps the core small and exposes customization through extensions, skills, prompt templates, themes, and packages. Claude Code and Codex have different built-in workflows and service integrations. Compare the products against the workflow, provider support, security model, and deployment constraints you need rather than treating them as interchangeable agents.

### Which model providers does Pi support?

Pi registers built-in providers for Anthropic, OpenAI, Google, Bedrock, OpenRouter, several subscription endpoints, and other hosted or local services. It can also register a custom provider or an OpenAI-compatible server. See [Integrate a model provider](../how-to/plug-new-model.md).

### Is Pi free?

The Pi source and npm packages use open-source licenses. Model providers may charge for inference, so configure account limits before making API calls.

## Reading this book

### Should I read the chapters in order?

Read chapters 1 through 3 in order for the project overview, package architecture, and agent loop. Chapters 4 through 11 each focus on one subsystem and can be read independently after that foundation.

### Which Pi revision does this documentation describe?

The current documentation baseline is the official [Pi `0.85.0` release](https://github.com/earendil-works/pi/releases/tag/v0.85.0). The editorial review ledger pins verification to [`107d79f`](https://github.com/earendil-works/pi/commit/107d79f11072bbc8a3a757ed7fd69596bee7d68c). Recheck the upstream source before relying on a version-sensitive API or default.

### Why do examples use TypeScript?

Pi is implemented in TypeScript and publishes type declarations with its packages. The examples use TypeScript when types clarify the API. Shell, JSON, and JavaScript appear where they match the runtime or configuration format.

### Can I copy the examples into my project?

Yes. Install the package named by the example and match the documented Node.js requirement. Start with the [Quickstart](../quickstart.md) for a complete runnable setup.

## Contributing

### How do I report a translation error?

Open an issue at [github.com/pifydev/docs/issues](https://github.com/pifydev/docs/issues). Include the page path, the sentence, and your proposed correction.

### Can I add a page or chapter?

Yes. Submit matching English and Vietnamese files, keep their heading and code-fence structures aligned, and follow [CONTRIBUTING.md](https://github.com/pifydev/docs/blob/main/CONTRIBUTING.md).

### Where is the terminology policy?

The repository-level [GLOSSARY.md](https://github.com/pifydev/docs/blob/main/GLOSSARY.md) defines canonical terms. Preserve identifiers and translate only the concepts that the glossary marks as translatable.

## Common pitfalls

### My tool result does not reach the model

Return a `ToolResultMessage` whose `toolCallId` matches the original `ToolCall.id`. Also preserve the tool name and provide content in the expected block format.

### My session does not resume

The coding agent stores sessions under `~/.pi/agent/sessions/` by default. Confirm the session exists and start Pi from the expected working directory, or pass the session path or ID explicitly.

### The TUI behaves oddly over SSH

Increase `PI_TUI_ESC_TIMEOUT` for a high-latency terminal. See [Environment variables](../reference/environment-variables.md#pi_tui_esc_timeout).

### The provider returns HTTP 429 with a valid key

HTTP 429 indicates rate limiting or exhausted quota, not an invalid key. Check the provider account, wait for the retry window, or select another model.
