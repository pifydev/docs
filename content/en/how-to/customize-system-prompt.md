---
title: Customize the system prompt
description: Choose between context files, prompt replacement, prompt append files, CLI flags, and SDK overrides.
translation_key: how-to-customize-system-prompt
language: en
status: reviewed
reviewed_by: Pify maintainers
last_updated: '2026-08-24'
---

Pi separates project guidance from the base system prompt. Choose the narrowest mechanism that matches the intended scope.

## Choose the right source

| Goal | Source |
|---|---|
| Share project conventions | `AGENTS.md` or `CLAUDE.md` |
| Override instructions for one directory | `AGENTS.override.md` |
| Replace Pi's default prompt | `.pi/SYSTEM.md` or `~/.pi/agent/SYSTEM.md` |
| Append to the default prompt | `.pi/APPEND_SYSTEM.md` or the global equivalent |
| Make a one-run override | `--system-prompt` or `--append-system-prompt` |
| Embed Pi with a programmatic prompt | `DefaultResourceLoader` |

## Add project guidance

Create `AGENTS.md` in the repository:

```md title="AGENTS.md"
# Project conventions

- Use TypeScript strict mode.
- Run `npm test` before reporting completion.
- Do not edit generated files under `dist/`.
- Treat migrations as backward-compatible changes.
```

Pi loads the global file and walks from parent directories to the current working directory. If one directory contains `AGENTS.override.md`, that file replaces `AGENTS.md` or `CLAUDE.md` from the same directory only.

Use context files for commands, conventions, safety rules, and repository facts. Keep them short and verifiable. Disable discovery with `--no-context-files` when handling an untrusted checkout.

## Replace or append the base prompt

Use `.pi/SYSTEM.md` when the application needs a different base role. Use `.pi/APPEND_SYSTEM.md` when Pi's built-in tool and environment guidance should remain intact.

```md title=".pi/APPEND_SYSTEM.md"
## Release policy

Never publish a package without showing the exact version and tag to the user.
```

Project-local `.pi` resources require project trust. Interactive Pi prompts for that decision; non-interactive modes follow `defaultProjectTrust` unless `--approve` or `--no-approve` is provided.

## Override from the CLI

```bash
pi --system-prompt "You review API compatibility. Return a concise report."
pi --append-system-prompt "Do not modify files in this run."
```

`--system-prompt` replaces the base prompt, but discovered context files and skills are still added. `--append-system-prompt` preserves the base prompt and adds the supplied text.

## Override from the SDK

```ts title="custom-prompt.ts"
import {
  createAgentSession,
  DefaultResourceLoader,
} from "@earendil-works/pi-coding-agent";

const loader = new DefaultResourceLoader({
  systemPromptOverride: () =>
    "You are a concise API compatibility reviewer. Cite files and symbols.",
});
await loader.reload();

const { session } = await createAgentSession({ resourceLoader: loader });
await session.prompt("Review the public exports.");
```

Use `appendSystemPromptOverride` instead when you need to transform the list of appended prompt sections without replacing the base prompt.

## Check the effective prompt

In an SDK integration, inspect `session.agent.state.systemPrompt` after session creation. When debugging the CLI, reduce overlapping sources and confirm the effective working directory and project-trust decision first.

Never place API keys, access tokens, or private user data in prompt files: the selected provider receives the resulting context.
