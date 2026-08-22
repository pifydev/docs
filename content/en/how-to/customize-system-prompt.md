---
title: How to customize the system prompt
description: >-
  Layer AGENTS.md, SYSTEM.md, CLI flags, and extensions into a single coherent
  prompt the model sees.
translation_key: how-to-customize-system-prompt
language: en
---
This guide shows how Pi composes the system prompt from CLI flags, project files, and extension contributions. After it you will know which file to edit for which effect and how to debug the final prompt the model actually sees.

:::tip[When you need this]

- Project-specific rules ("never use `any` in `src/`")
- Team conventions encoded once, applied everywhere
- Debugging why the model is or is not following a rule

:::

## The composition order

Pi reads the system prompt sources in this order, top wins:

1. `--system-prompt <text>` CLI flag
2. `--append-system-prompt <text>` CLI flag
3. Project file `./SYSTEM.md` (closest to cwd)
4. Project file `./AGENTS.md` (closest to cwd)
5. Extension contributions via `pi.registerSystemPrompt()`
6. Default Pi system prompt

Each later layer sees the prompt as modified by earlier layers. The CLI flags override everything below them.

## 1. Add project rules in AGENTS.md

Create `AGENTS.md` in your project root:

```md title="AGENTS.md"
- Use TypeScript strict mode everywhere.
- Prefer `unknown` over `any`. Cast only at the boundary.
- Tests live next to the code as `*.test.ts`.
- Do not edit files under `vendor/`.
```

Pi reads this on every session that opens inside the project. The file is resolved by walking up from the working directory.

:::note[Closest file wins]

If both `./apps/web/AGENTS.md` and `./AGENTS.md` exist, Pi uses `./apps/web/AGENTS.md` because it is closer to the cwd. This lets you have repo-wide rules plus per-app overrides.

:::

## 2. Add an explicit system prompt block with SYSTEM.md

`SYSTEM.md` is treated as mandatory prose, while `AGENTS.md` is treated as guidance. Use `SYSTEM.md` when the model must follow the rule, `AGENTS.md` when it is a preference.

```md title="SYSTEM.md"
You are working inside the Pify monorepo.

Constraints:
- Never run `git push` without explicit user confirmation.
- Never delete files outside the working directory.
- Always read a file before editing it.
```

The distinction matters because Pi budgets token space differently for the two: `SYSTEM.md` is never trimmed during compaction, `AGENTS.md` may be.

## 3. Pass a one-off instruction from the CLI

For an ad-hoc override without editing any file:

```bash
pi --append-system-prompt "Reply in Japanese for this session."
```

`--system-prompt` replaces the default Pi prompt entirely (use with care). `--append-system-prompt` adds to whatever is composed below it.

## 4. Add prompt expansion via extensions

A Pi extension can contribute to the system prompt programmatically:

```ts title="extensions/team-roles.ts"
import { registerExtension } from "@pi-coding-agent";

registerExtension({
  name: "team-roles",
  systemPrompt: () => `
You are a staff engineer.
When reviewing code, focus on:
- API contract changes
- Backward compatibility
- Test coverage of new branches
`,
});
```

The function runs at session start. It sees the current working directory and the resolved model and returns a string. The string is appended after the project files and before the default prompt.

## 5. Inspect the final prompt

When the model behaves oddly, the fastest debugging step is to log the composed prompt. Pi does this when you pass `--log-prompts`:

```bash
pi --log-prompts
# starts the agent, logs the final system prompt to stderr on every turn
```

The log includes the source of each section, so you can tell whether a missing rule came from `AGENTS.md` or from a stale extension.

## 6. Override the model default prompt

Some models ship with vendor-specific framing in the default Pi prompt. To opt out:

```bash
pi --no-default-system-prompt --system-prompt "You are a focused coding agent."
```

This is useful when you want full control and do not want Pi's tone or guidance leaking into the conversation.

## Pitfalls

**Editing `AGENTS.md` and seeing no effect**

The file is read at session start. If the agent is already running, restart it. Hot-reload of `AGENTS.md` is not supported in stable releases.

**Putting secrets in the system prompt**

Anything in `SYSTEM.md` or `AGENTS.md` is sent to the model provider on every turn. Treat both files as public to whichever provider you call.

**Conflicting rules between AGENTS.md and SYSTEM.md**

`SYSTEM.md` wins for hard constraints, `AGENTS.md` for soft guidance. If they disagree and the model picks the wrong one, move the rule from `AGENTS.md` to `SYSTEM.md`.

## Next

- [Chapter 8: Context Engineering](../ch08-context-engineering.md) covers how the system prompt fits into the broader context budget.
- [Reference: Environment Variables](../reference/environment-variables.md) lists the knobs that affect prompt loading.
