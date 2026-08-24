---
title: Customize the system prompt
description: Layer context files, prompt files, CLI sources, and extensions into the prompt Pi sends to a model.
translation_key: how-to-customize-system-prompt
language: en
status: reviewed
reviewed_by: Pify maintainers
last_updated: '2026-08-25'
---

Pi keeps project context, the selected base prompt, appended prompt text, and per-turn extension changes separate. This guide shows where each layer comes from and how to inspect the result without relying on a hidden precedence rule.

:::tip[When you need this]

- Apply repository conventions to every session opened below a directory.
- Replace or extend Pi's base role for one project or one CLI run.
- Diagnose a missing, duplicated, stale, or untrusted instruction.

:::

## The composition order

`DefaultResourceLoader.reload()` resolves files and explicit sources. `AgentSession` then builds the prompt in these stages:

| Stage | Selection or order |
|---|---|
| Base prompt | CLI `--system-prompt` source, otherwise trusted project `.pi/SYSTEM.md`, otherwise global `~/.pi/agent/SYSTEM.md`, otherwise Pi's built-in prompt |
| Appended prompt | CLI `--append-system-prompt` sources in flag order, otherwise trusted project `.pi/APPEND_SYSTEM.md`, otherwise global `~/.pi/agent/APPEND_SYSTEM.md` |
| Builder additions | Context files, eligible skills, then the current working directory |
| Per-turn changes | `before_agent_start` handlers, chained in extension order |

The base chain selects one source. The discovered append chain also selects one file, but repeated CLI append flags supply an ordered list and replace that discovered append source set. The builder still adds context files and, when the `read` tool is active, eligible skills; replacing the base does not remove them.

Project trust applies to project `.pi` prompt files, settings, extensions, and other protected resources. It does **not** gate `AGENTS.override.md`, `AGENTS.md`, or `CLAUDE.md`: context files load even for an untrusted project unless `--no-context-files` is set.

## 1. Add project rules in AGENTS.md

Create `AGENTS.md` in the repository root:

```md title="AGENTS.md"
# Project conventions

- Use TypeScript strict mode.
- Prefer `unknown` over `any`; cast only at a boundary.
- Keep tests next to code as `*.test.ts`.
- Do not edit files under `vendor/`.
```

Pi loads the global context file first, then one context file from every matching ancestor directory, from the filesystem root down to the current directory. All of those files layer; the closest one does not discard its parents.

Within a single directory, the first existing candidate wins: `AGENTS.override.md`, then `AGENTS.md`, `AGENTS.MD`, `CLAUDE.md`, or `CLAUDE.MD`. Therefore `apps/web/AGENTS.override.md` replaces only `apps/web/AGENTS.md` or `CLAUDE.md`; a root `AGENTS.md` still applies.

Use these files for commands, conventions, repository facts, and safety guidance. Keep statements concrete enough to verify, and use `--no-context-files` when repository-authored instructions should not enter the model context.

## 2. Set the base with SYSTEM.md

Put a project base prompt at `.pi/SYSTEM.md`, not `./SYSTEM.md`:

```md title=".pi/SYSTEM.md"
You are working inside the Pify monorepo.

Constraints:
- Never run `git push` without explicit user confirmation.
- Never delete files outside the working directory.
- Read a file before editing it.
```

If the project is trusted, this file replaces both the global file and Pi's built-in base. Without a trusted project file, Pi falls back to `~/.pi/agent/SYSTEM.md`, then to the built-in prompt.

Use `.pi/APPEND_SYSTEM.md` when the selected base should remain and only extra text should be added. The project file, when trusted, replaces the global `~/.pi/agent/APPEND_SYSTEM.md` as the discovered append source. Pi does not assign “hard” status to `SYSTEM.md`, “soft” status to `AGENTS.md`, or a separate compaction budget to either one; they are prompt inputs with different loading roles.

## 3. Pass one-run sources from the CLI

Both flags accept literal text or the contents of an existing file path. `--append-system-prompt` is repeatable:

```bash
pi --system-prompt ./prompts/reviewer.md
pi --append-system-prompt ./prompts/security.md \
  --append-system-prompt "Reply with a concise compatibility report."
pi --no-context-files --system-prompt "Review only the files named by the user."
```

`--system-prompt` replaces the selected base for this process, but the builder still adds append text, context files, eligible skills, and the working directory. Suppress context discovery separately with `--no-context-files` or `-nc`.

Once any CLI append source is supplied, the loader uses the ordered CLI list instead of discovering project or global `APPEND_SYSTEM.md`. Repeat the file path explicitly if its contents must remain in that run. For project `.pi` resources, `--approve` trusts them for one run and `--no-approve` ignores them; neither flag disables ordinary context files.

## 4. Extend the prompt per turn

An extension can change the fully built prompt after the user submits a prompt and before the agent loop starts:

```ts title="team-roles.ts"
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function teamRoles(pi: ExtensionAPI) {
  pi.on("before_agent_start", (event) => {
    return {
      systemPrompt: `${event.systemPrompt}

When reviewing code, check API contracts, backward compatibility, and tests.`,
    };
  });
}
```

Load it with `pi -e ./team-roles.ts`. `event.systemPrompt` contains the chain produced so far. Returning `systemPrompt` replaces that value for this turn, and the next handler sees the returned value. Inside the handler, `ctx.getSystemPrompt()` reports the same current chain; a later handler can still change it.

Use this hook for request-specific instructions. Avoid reconstructing file discovery in the extension: `event.systemPromptOptions` already exposes the base inputs, including context files and skills.

## 5. Inspect the effective prompt

There is no `--log-prompts` flag. Use the public loader getters to inspect selected source files, then inspect `session.agent.state.systemPrompt` for the builder result before per-turn extension changes:

```ts title="inspect-system-prompt.ts"
import {
  createAgentSession,
  DefaultResourceLoader,
  getAgentDir,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";

const cwd = process.cwd();
const agentDir = getAgentDir();
const trustProject = process.argv.includes("--trust-project");
const settingsManager = SettingsManager.create(cwd, agentDir, {
  projectTrusted: trustProject,
});
const loader = new DefaultResourceLoader({ cwd, agentDir, settingsManager });
await loader.reload();

console.log({
  base: loader.getSystemPromptSource()?.path ?? "built-in",
  append: loader.getAppendSystemPromptSources().map(({ path }) => path),
  context: loader.getAgentsFiles().agentsFiles.map(({ path }) => path),
});

const { session } = await createAgentSession({
  cwd,
  agentDir,
  resourceLoader: loader,
  settingsManager,
});
try {
  console.log(session.agent.state.systemPrompt);
} finally {
  session.dispose();
}
```

Run it with `npx tsx inspect-system-prompt.ts`; the example deliberately ignores project `.pi` resources. Add `--trust-project` only after your SDK host has made that trust decision. A standalone `SettingsManager` does not reproduce the CLI's saved-trust and interactive prompt flow, while context files remain visible in either mode. `getSystemPrompt()` and `getAppendSystemPrompt()` return the selected raw text when content, rather than source paths, is what you need. During `before_agent_start`, inspect `event.systemPrompt` or `ctx.getSystemPrompt()` instead because they include earlier handlers for that turn. Provider-payload rewrites made later by `before_provider_request` are outside these views.

The optional fixture below creates isolated files, performs no provider request, and checks context order, the same-directory override, trusted and untrusted project prompt files, explicit CLI-style source selection, effective builder output, and `session.reload()`.

Run it with `npx tsx verify-system-prompt.ts` on Node `>=22.19.0` after installing `@earendil-works/pi-coding-agent@0.84.2`, `tsx`, and TypeScript.

<Accordions type="single">
<Accordion title="Optional deterministic resource-loader fixture">

```ts title="verify-system-prompt.ts"
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createAgentSession,
  DefaultResourceLoader,
  ModelRuntime,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";

const root = await mkdtemp(join(tmpdir(), "pi-prompt-guide-"));
const agentDir = join(root, "agent");
const projectDir = join(root, "workspace");
const cwd = join(projectDir, "apps", "web");
const projectConfigDir = join(cwd, ".pi");
const cliBaseFile = join(root, "cli-base.md");
const cliAppendFile = join(root, "cli-append.md");

async function load(options: {
  projectTrusted: boolean;
  systemPrompt?: string;
  appendSystemPrompt?: string[];
}) {
  const settingsManager = SettingsManager.inMemory(
    {},
    { projectTrusted: options.projectTrusted },
  );
  const loader = new DefaultResourceLoader({
    cwd,
    agentDir,
    settingsManager,
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    systemPrompt: options.systemPrompt,
    appendSystemPrompt: options.appendSystemPrompt,
  });
  await loader.reload();
  return { loader, settingsManager };
}

try {
  await mkdir(agentDir, { recursive: true });
  await mkdir(projectConfigDir, { recursive: true });
  await writeFile(join(agentDir, "AGENTS.md"), "GLOBAL CONTEXT");
  await writeFile(join(projectDir, "AGENTS.md"), "ROOT CONTEXT");
  await writeFile(join(cwd, "AGENTS.md"), "SHADOWED LOCAL CONTEXT");
  await writeFile(join(cwd, "AGENTS.override.md"), "LOCAL OVERRIDE");
  await writeFile(join(agentDir, "SYSTEM.md"), "GLOBAL BASE");
  await writeFile(join(agentDir, "APPEND_SYSTEM.md"), "GLOBAL APPEND");
  await writeFile(join(projectConfigDir, "SYSTEM.md"), "PROJECT BASE");
  await writeFile(
    join(projectConfigDir, "APPEND_SYSTEM.md"),
    "PROJECT APPEND",
  );
  await writeFile(cliBaseFile, "CLI BASE");
  await writeFile(cliAppendFile, "CLI APPEND ONE");

  const untrusted = await load({ projectTrusted: false });
  assert.equal(untrusted.loader.getSystemPrompt(), "GLOBAL BASE");
  assert.deepEqual(untrusted.loader.getAppendSystemPrompt(), ["GLOBAL APPEND"]);

  const context = untrusted.loader
    .getAgentsFiles()
    .agentsFiles.filter(({ path }) => path.startsWith(root));
  assert.deepEqual(
    context.map(({ content }) => content),
    ["GLOBAL CONTEXT", "ROOT CONTEXT", "LOCAL OVERRIDE"],
  );
  assert(!context.some(({ content }) => content.includes("SHADOWED")));

  const trusted = await load({ projectTrusted: true });
  assert.equal(trusted.loader.getSystemPrompt(), "PROJECT BASE");
  assert.deepEqual(trusted.loader.getAppendSystemPrompt(), ["PROJECT APPEND"]);

  const explicit = await load({
    projectTrusted: true,
    systemPrompt: cliBaseFile,
    appendSystemPrompt: [cliAppendFile, "CLI APPEND TWO"],
  });
  assert.equal(explicit.loader.getSystemPrompt(), "CLI BASE");
  assert.deepEqual(explicit.loader.getAppendSystemPrompt(), [
    "CLI APPEND ONE",
    "CLI APPEND TWO",
  ]);
  assert.deepEqual(explicit.loader.getAppendSystemPromptSources(), [
    { path: cliAppendFile },
  ]);

  const modelRuntime = await ModelRuntime.create({
    authPath: join(root, "auth.json"),
    modelsPath: null,
    refreshOnCreate: false,
  });
  const { session } = await createAgentSession({
    cwd,
    agentDir,
    modelRuntime,
    resourceLoader: explicit.loader,
    settingsManager: explicit.settingsManager,
    sessionManager: SessionManager.inMemory(cwd),
    noTools: "all",
  });

  try {
    const first = session.agent.state.systemPrompt;
    for (const marker of [
      "CLI BASE",
      "CLI APPEND ONE",
      "CLI APPEND TWO",
      "GLOBAL CONTEXT",
      "ROOT CONTEXT",
      "LOCAL OVERRIDE",
    ]) {
      assert(first.includes(marker), `missing ${marker}`);
    }
    assert(!first.includes("PROJECT BASE"));
    assert(!first.includes("SHADOWED LOCAL CONTEXT"));

    await writeFile(join(projectDir, "AGENTS.md"), "ROOT CONTEXT RELOADED");
    await session.reload();
    assert(session.agent.state.systemPrompt.includes("ROOT CONTEXT RELOADED"));
    assert(!session.agent.state.systemPrompt.includes("ROOT CONTEXT\n"));
  } finally {
    session.dispose();
  }

  console.log("system prompt fixture passed");
} finally {
  await rm(root, { recursive: true, force: true });
}
```

</Accordion>
</Accordions>

## 6. Take full control of the base

For an SDK integration, override the loader's selected base with the public callbacks. `cwd` and `agentDir` are required constructor options:

```ts title="full-system-prompt.ts"
import {
  DefaultResourceLoader,
  getAgentDir,
} from "@earendil-works/pi-coding-agent";

const loader = new DefaultResourceLoader({
  cwd: process.cwd(),
  agentDir: getAgentDir(),
  systemPromptOverride: () =>
    "You are a focused coding reviewer. Report evidence by file and symbol.",
  appendSystemPromptOverride: (base) => [
    ...base,
    "Do not modify files unless the user asks.",
  ],
});
await loader.reload();

console.log(loader.getSystemPrompt());
console.log(loader.getAppendSystemPrompt());
```

`systemPromptOverride` receives the file- or CLI-selected base, which may be `undefined`, and returns the replacement. `appendSystemPromptOverride` receives the selected append list; return `[]` to remove it. Context files, eligible skills, and the working directory are still builder additions. Set `noContextFiles: true` or `noSkills: true` only when the embedding application intentionally wants those separate inputs disabled.

The CLI has no `--no-default-system-prompt` flag. Use `--system-prompt` for a one-run base replacement or a configured `DefaultResourceLoader` for programmatic control.

## Pitfalls

**A changed file appears stale.** Interactive Pi loads resources at startup. Run `/reload`; SDK callers use `await session.reload()`. Reload rebuilds resources and the system prompt. If `/trust` changes a saved decision, restart Pi as directed by the trust flow.

**A child context file seems to erase its parent.** Ancestor directories layer. Only `AGENTS.override.md` replaces `AGENTS.md` or `CLAUDE.md` in the same directory.

**An untrusted checkout still contributes instructions.** Project trust protects `.pi` resources, not context files. Use `--no-context-files` and an OS-level sandbox or isolated environment when repository text must not reach the model.

**A CLI append drops `APPEND_SYSTEM.md`.** Supplying any `--append-system-prompt` source replaces append-file discovery for that run. Pass every required file or text source explicitly.

**Rules conflict.** Pi does not enforce a `SYSTEM.md` hard-rule tier over `AGENTS.md`. Remove the contradiction or make the narrower rule explicit instead of depending on source type.

**A prompt contains secrets.** The selected provider receives the assembled prompt on model requests. Context files, append text, extension additions, paths, and skill descriptions may all be present. Keep API keys, tokens, private user data, and unnecessary internal details out of these inputs, and treat debug output as sensitive.

## Next

- [Chapter 8: Context Engineering](../ch08-context-engineering.md) explains how prompt construction fits into the wider context pipeline.
- [Reference: Environment Variables](../reference/environment-variables.md) covers environment inputs used by Pi and providers.
