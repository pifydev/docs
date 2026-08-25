---
title: Configuration reference
description: Current Pi settings files, merge rules, trust boundary, settings families, and runtime overrides.
translation_key: reference-configuration
language: en
status: reviewed
reviewed_by: Pify maintainers
last_updated: '2026-08-25'
---

Pi reads JSON settings at startup and when resources reload. This reference describes `@earendil-works/pi-coding-agent` 0.84.3 on Node.js 22.19 or newer.

## Settings files and precedence

### File locations

| Path | Role |
| --- | --- |
| `~/.pi/agent/settings.json` | Global settings for every project |
| `<cwd>/.pi/settings.json` | Settings for the current project, when the project is trusted |
| `~/.pi/agent/trust.json` | Saved project-trust decisions; this is not a settings layer |
| `<cwd>/.pi/SYSTEM.md`, `<cwd>/.pi/APPEND_SYSTEM.md` | Trusted project prompt sources, not settings files |
| `AGENTS.md`, `CLAUDE.md` | Context files found from the working-directory ancestry, not settings files |

Edit the JSON files directly, or use `/settings` for the common interactive choices. `pi config` manages which package resources are enabled; it is not a general settings editor. See <a href="/en/how-to/customize-system-prompt">Customize the system prompt</a> for the separate prompt-file composition rules.

### Merge and CLI precedence

Project settings recursively override global settings. Nested objects merge by key; arrays and scalar values replace the global value. CLI arguments then override only the behavior they name for that process. Examples include `--model`, `--thinking`, `--models`, the `--tools` family, `--use-theme`, `--tui-mode`, `--session-dir`, and the project-trust flags.

:::note[Precedence is setting-specific]

Do not treat every CLI flag as a field in `settings.json`. For example, session storage resolves as `--session-dir` → `PI_CODING_AGENT_SESSION_DIR` → `sessionDir` → the default. Explicit resource flags add runtime paths, while `--no-extensions`, `--no-skills`, `--no-prompt-templates`, and `--no-themes` disable discovery for their resource family.

:::

## Current settings shape

The public root exports `SettingsManager` and selected setting types, not a full schema validator. The current JSON families are:

| Family | Keys |
| --- | --- |
| Model | `defaultProvider`, `defaultModel`, `defaultThinkingLevel`, `thinkingBudgets`, `enabledModels` |
| Interaction | `steeringMode`, `followUpMode`, `defaultTools`, `doubleEscapeAction`, `treeFilterMode` |
| Display | `theme`, `tuiMode`, `fullscreenExitOutput`, `fullscreenScrollbar`, `terminal`, `images`, `markdown` |
| Lifecycle | `compaction`, `branchSummary`, `retry`, `sessionDir` |
| Network | `transport`, `httpProxy`, `httpIdleTimeoutMs`, `websocketConnectTimeoutMs` |
| Resources | `packages`, `extensions`, `skills`, `prompts`, `themes`, `enableSkillCommands` |

Use public getters when a host needs the effective value. This runnable inspection intentionally ignores project settings. Direct SDK use does not consult the CLI trust store; the host must resolve trust and pass `projectTrusted` itself.

```ts title="inspect-settings.ts"
import { getAgentDir, SettingsManager } from "@earendil-works/pi-coding-agent";

const settings = SettingsManager.create(process.cwd(), getAgentDir(), {
  projectTrusted: false,
});

console.log({
  model: [settings.getDefaultProvider(), settings.getDefaultModel()],
  thinking: settings.getDefaultThinkingLevel(),
  tools: settings.getDefaultTools(),
  compaction: settings.getCompactionSettings(),
  retry: settings.getRetrySettings(),
  diagnostics: settings.drainErrors().map(({ scope, error }) => ({
    scope,
    message: error.message,
  })),
});
```

## Models, thinking, and tools

### Model and thinking

`defaultProvider` and `defaultModel` identify the default model. `--model` takes precedence for a run; a resumed session can restore its recorded model when no explicit CLI model is supplied. `defaultThinkingLevel` accepts `off`, `minimal`, `low`, `medium`, `high`, `xhigh`, or `max`. `thinkingBudgets` supplies token budgets for supported providers or compatible models.

`hideThinkingBlock` hides thinking in the transcript. `showCacheMissNotices` shows transcript notices for significant prompt-cache misses. A model still decides which thinking levels and budgets it supports.

`enabledModels` supplies patterns for Ctrl+P model cycling; `--models` overrides that scope for one run. Provider endpoints and credentials do not belong in a `providers` settings object. Put supported endpoints in `~/.pi/agent/models.json` or a Provider configuration, and keep credentials in the supported authentication store or environment. See <a href="/en/how-to/plug-new-model">Add a model provider</a>.

```json title="thinking-settings.json"
{
  "defaultProvider": "anthropic",
  "defaultModel": "claude-sonnet-4-6",
  "defaultThinkingLevel": "medium",
  "thinkingBudgets": {
    "minimal": 1024,
    "low": 4096,
    "medium": 10240,
    "high": 32768
  },
  "hideThinkingBlock": false,
  "showCacheMissNotices": true
}
```

### Tool selection

`defaultTools` selects built-in tools at startup. When omitted, exactly `read`, `bash`, `edit`, and `write` are active defaults. The other selectable built-ins are `powershell`, `grep`, `find`, and `ls`; `powershell` is the optional native Windows shell Tool and is not added to the default set automatically. An empty array removes the built-in defaults but leaves extension and SDK custom tools available.

`--tools` is a strict allowlist across built-in, extension, and custom tools. `--no-tools` disables all tools, `--no-builtin-tools` removes built-ins only, and `--exclude-tools` filters the result. A project array replaces the global array.

```json title="tool-settings.json"
{
  "defaultTools": ["read", "bash", "edit", "write"]
}
```

Select PowerShell explicitly on Windows, either instead of Bash or alongside it:

```json title="tool-settings-windows.json"
{
  "defaultTools": ["read", "powershell", "edit", "write"]
}
```

Selecting a Tool does not change the host shell that launched Pi. It chooses which LLM-callable Tool names are active: `bash` sends commands to Pi's Bash-compatible backend, while `powershell` sends commands to the native PowerShell backend. The CLI/SDK `tools` allowlist follows the same distinction.

## Project trust

### Fallback and saved decisions

Project trust controls loading `.pi/settings.json`, project `.pi` resources, project packages, and executable extensions. `defaultProjectTrust` is global-only: `ask` is the default, while `always` or `never` supplies the non-interactive fallback. Interactive startup asks when trust-requiring project resources exist and no saved decision applies. `/trust` writes the decision to `~/.pi/agent/trust.json`; restart Pi to apply it to the current project runtime.

The CLI resolves that store before it creates the trusted runtime. `SettingsManager.create()` used directly by an SDK host defaults `projectTrusted` to `true` and never reads `trust.json`; security-sensitive hosts should pass an explicit decision.

### One-run overrides

`--approve` (`-a`) trusts project-local files for one run. `--no-approve` (`-na`) ignores them for one run. Print, JSON, and RPC modes cannot display a trust prompt, so they use an applicable saved decision, the global fallback, or one of these flags.

Project trust is a project-resource boundary, not per-tool approval. Current settings have no `yolo`, `permissions`, or `requiresPermission` switch. Enforce tool approval or denial in the embedding host or an Extension `tool_call` policy.

## Compaction and retries

### Compaction and branch summaries

| Setting | Default | Effect |
| --- | ---: | --- |
| `compaction.enabled` | `true` | Enables automatic compaction |
| `compaction.reserveTokens` | `16384` | Reserves context space for the next model response |
| `compaction.keepRecentTokens` | `20000` | Keeps this many recent tokens outside the summary |
| `branchSummary.reserveTokens` | `16384` | Reserves tokens for branch summarization |
| `branchSummary.skipPrompt` | `false` | When `true`, skips the branch-summary question and defaults to no summary |

The former fractional `compaction.threshold` and turn-count `preserveRecentTurns` settings do not exist. Current compaction is driven by token reserve and recent-token budgets.

### Retry and message delivery

`retry.enabled`, `maxRetries` (`3`), and `baseDelayMs` (`2000`) control agent-level retries. `retry.provider.timeoutMs`, `maxRetries`, and `maxRetryDelayMs` (`60000`) control the provider layer. Provider retries default to zero in the Coding Agent integration; increasing both layers can multiply requests and delay the visible failure.

`steeringMode` and `followUpMode` accept `one-at-a-time` (default) or `all`. `transport` accepts `auto`, `sse`, `websocket`, or `websocket-cached`. `httpIdleTimeoutMs` defaults to `300000`; `0` disables the HTTP idle timeout. `websocketConnectTimeoutMs` controls the opening handshake and also accepts `0` to disable it.

## Sessions, terminal, and shell

### Session storage

`sessionDir` changes persistent session storage. Relative paths resolve from the process working directory, and `~` expands to the home directory. Without an override, Pi stores one append-only JSONL file per session below `~/.pi/agent/sessions/<encoded-cwd>/`.

There are no built-in `sessions.retention` or `sessions.redactSecrets` settings. The application operating Pi owns file permissions, backups, retention, and deletion; protect session JSONL because it can contain prompts, model output, and tool results. See <a href="/en/how-to/persist-sessions">Persist sessions</a>.

### Terminal, images, shell, and npm

`terminal.showImages` (`true`) controls inline display, `imageWidthCells` (`60`) sets preferred width, `clearOnShrink` (`false`) clears vacated rows, and `showTerminalProgress` (`false`) emits supported terminal progress indicators. `images.autoResize` (`true`) resizes model-bound images to at most 2000 × 2000; `images.blockImages` (`false`) blocks all images from reaching providers. Hiding terminal images does not block upload.

`shellPath` selects the executable for the `bash` Tool, `shellCommandPrefix` prefixes every `bash` command, and `npmCommand` is an argv array for package operations. These Bash settings do not activate, configure, or replace the `powershell` Tool; PowerShell selection belongs in `defaultTools`, `--tools`, or the SDK `tools` option. Windows JSON paths need forward slashes or escaped backslashes.

```json title="terminal-and-shell-settings.json"
{
  "terminal": {
    "showImages": true,
    "imageWidthCells": 60,
    "clearOnShrink": false,
    "showTerminalProgress": false
  },
  "images": {
    "autoResize": true,
    "blockImages": false
  },
  "shellPath": "C:/Program Files/Git/bin/bash.exe",
  "shellCommandPrefix": "shopt -s expand_aliases",
  "npmCommand": ["mise", "exec", "node@22", "--", "npm"],
  "sessionDir": ".pi/sessions"
}
```

## Interface and output

### UI and display

`theme`, `externalEditor`, `quietStartup`, and `collapseChangelog` control startup and presentation. `externalEditor` overrides `VISUAL`, then `EDITOR`; use `code --wait` when Pi must wait for VS Code. `doubleEscapeAction` is `tree`, `fork`, or `none`, and `treeFilterMode` chooses the default `/tree` filter.

`editorPaddingX` is clamped from 0 to 3, `outputPad` is 0 or 1, and `autocompleteMaxVisible` is clamped from 3 to 20. `showHardwareCursor` helps IME input. `tuiMode` is `regular` or experimental `fullscreen`; the related flat keys are `fullscreenExitOutput` (`transcript` or `resume-hint`) and `fullscreenScrollbar` (`auto`, `always`, or `hidden`). The old nested `tui.*` and `fullscreen.*` shapes are not current. Escape-key timing is an environment control documented in <a href="/en/reference/environment-variables">Environment variables</a>.

### Markdown and warnings

`markdown.codeBlockIndent` defaults to two spaces. `markdown.mermaid` accepts `off`, `final`, or `streaming` (default). `warnings.anthropicExtraUsage` defaults to `true` and controls the subscription extra-usage warning.

## Network, telemetry, and updates

`httpProxy` applies `HTTP_PROXY` and `HTTPS_PROXY` to Pi-managed HTTP clients and is read from global settings only. Do not embed proxy credentials in a project file. Stream timeout and transport settings are listed under retry and message delivery.

`enableInstallTelemetry` defaults to `true` for the anonymous install/update version ping. `enableAnalytics` is opt-in and defaults to `false`; Pi creates `trackingId` on opt-in. These settings do not disable update checks. `collapseChangelog` changes how the changelog is shown, while `lastChangelogVersion` is Pi-managed state and should not be edited by hand. Use `PI_SKIP_VERSION_CHECK` or offline mode for network policy; see <a href="/en/reference/environment-variables">Environment variables</a> for the exact controls.

## Resources, packages, and globs

### Resource lists and package filters

`extensions`, `skills`, `prompts`, and `themes` contain local paths or directories. In global settings, relative paths resolve from `~/.pi/agent`; in project settings they resolve from `.pi`. These arrays support globs, `!pattern` exclusions, `+path` force-includes, and `-path` force-excludes. `enableSkillCommands` controls registration as `/skill:name` and defaults to `true`.

Use `packages` for npm or Git package sources; do not put package names in `extensions`. A string package entry autoloads all resources. An object can set `autoload: false` and filter `extensions`, `skills`, `prompts`, or `themes`. Project resources and missing project-package installation remain subject to project trust.

```json title="resource-settings.json"
{
  "packages": [
    "@org/pi-resources",
    {
      "source": "git:github.com/org/team-pi-resources",
      "autoload": false,
      "skills": ["review", "release"],
      "extensions": []
    }
  ],
  "extensions": ["./extensions/*.ts", "!./extensions/legacy.ts"],
  "skills": ["+./skills/release/SKILL.md", "!./skills/experimental/**"],
  "prompts": ["./prompts/*.md"],
  "themes": ["./themes/*.json"],
  "enableSkillCommands": true
}
```

## Complete example and project override

This global file covers the common families without provider credentials:

```json title="complete-settings.json"
{
  "defaultProvider": "anthropic",
  "defaultModel": "claude-sonnet-4-6",
  "defaultThinkingLevel": "medium",
  "thinkingBudgets": {
    "minimal": 1024,
    "low": 4096,
    "medium": 10240,
    "high": 32768
  },
  "hideThinkingBlock": false,
  "showCacheMissNotices": true,
  "enabledModels": ["anthropic/*", "openai/gpt-5.2*"],
  "defaultTools": ["read", "bash", "edit", "write"],
  "theme": "dark",
  "quietStartup": true,
  "tuiMode": "regular",
  "markdown": {
    "codeBlockIndent": "  ",
    "mermaid": "final"
  },
  "compaction": {
    "enabled": true,
    "reserveTokens": 16384,
    "keepRecentTokens": 20000
  },
  "branchSummary": {
    "reserveTokens": 16384,
    "skipPrompt": false
  },
  "retry": {
    "enabled": true,
    "maxRetries": 3,
    "baseDelayMs": 2000,
    "provider": {
      "maxRetries": 0,
      "maxRetryDelayMs": 60000
    }
  },
  "steeringMode": "one-at-a-time",
  "followUpMode": "one-at-a-time",
  "transport": "auto",
  "httpIdleTimeoutMs": 300000,
  "websocketConnectTimeoutMs": 15000,
  "sessionDir": ".pi/sessions",
  "terminal": {
    "showImages": true
  },
  "images": {
    "autoResize": true,
    "blockImages": false
  },
  "warnings": {
    "anthropicExtraUsage": true
  },
  "packages": ["@org/pi-resources"]
}
```

For a merge example, start with this global file:

```json title="settings-global.json"
{
  "theme": "dark",
  "compaction": {
    "enabled": true,
    "reserveTokens": 16384,
    "keepRecentTokens": 20000
  },
  "defaultTools": ["read", "bash", "edit", "write"]
}
```

Then add the trusted project override:

```json title=".pi/settings.json"
{
  "compaction": {
    "reserveTokens": 8192
  },
  "defaultTools": ["read"]
}
```

The result keeps `theme`, `compaction.enabled`, and `keepRecentTokens`, changes `reserveTokens`, and replaces the whole `defaultTools` array.

## Validate and continue

Pi parses JSON and reports load failures as settings warnings. It does not expose the retired `pi --dry-run` command, a public full-schema validator, or a `logPrompts` setting. On initial load, an invalid scope contributes no settings; on reload, `SettingsManager` keeps that scope's last valid values and exposes the error through `drainErrors()`. Unknown fields are not proof of validity, so inspect effective values through public getters and exercise the affected runtime path. The system-prompt guide shows the current prompt-inspection APIs.

After editing in an interactive session, use `/reload`; an SDK host can await `settingsManager.reload()`. Then continue with <a href="/en/reference/api">API reference</a> or <a href="/en/reference/environment-variables">Environment variables</a>.
