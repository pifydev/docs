---
title: Configuration reference
description: Current Pi settings files, merge rules, trust boundary, settings families, and runtime overrides.
translation_key: reference-configuration
language: en
official_refs:
  - 'https://github.com/earendil-works/pi/blob/f07218c4d4bbc12bef056a7058c3dd49dfe41abe/packages/coding-agent/docs/settings.md'
  - 'https://github.com/earendil-works/pi/blob/f07218c4d4bbc12bef056a7058c3dd49dfe41abe/packages/coding-agent/docs/models.md'
  - 'https://github.com/earendil-works/pi/blob/f07218c4d4bbc12bef056a7058c3dd49dfe41abe/packages/coding-agent/src/core/settings-manager.ts'
status: reviewed
reviewed_by: Pify maintainers
last_updated: '2026-09-23'
---

Pi reads JSON settings at startup and when resources reload. This reference describes `@earendil-works/pi-coding-agent` 0.87.1 on Node.js 22.19 or newer.

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
| Model | `defaultProvider`, `defaultModel`, `defaultThinkingLevel`, `modelThinkingLevels`, `thinkingBudgets`, `enabledModels`, `cacheWarming`, `showCacheMissNotices` |
| Interaction | `steeringMode`, `followUpMode`, `defaultTools`, `doubleEscapeAction`, `treeFilterMode` |
| Display | `theme`, `tuiMode`, `fullscreenExitOutput`, `fullscreenScrollbar`, `fullscreenCopyOnSelect`, `terminal`, `images`, `markdown` |
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

`defaultProvider` and `defaultModel` identify the default model. `--model` takes precedence for a run; a resumed session can restore its recorded model when no explicit CLI model is supplied. `defaultThinkingLevel` accepts `off`, `minimal`, `low`, `medium`, `high`, `xhigh`, or `max`; it can be saved with Ctrl+S in `/thinking` or edited manually. This semantic global startup default is distinct from provider request fields.

The model resolver supplies a fallback when neither an explicit selection nor resumed state supplies a model:

| Provider | Resolution scope | Resolver default |
|---|---|---|
| `xai` | `new session` | `grok-4.7` |

This is the default for new or otherwise default-resolved xAI sessions in `0.87.1`. It does not replace a model selected with `--model`, chosen interactively, configured as `defaultModel`, or restored from a resumed session.

`modelThinkingLevels` stores per-model startup thinking levels keyed by `provider/modelId`; configure it from `/settings` → Default thinking level per model or edit the JSON manually. A matching per-model value selects that model's startup level, while `defaultThinkingLevel` remains the global fallback. `thinkingBudgets` separately supplies token budgets for supported providers or compatible models.

Do not confuse those semantic settings with a direct Google API option. `GoogleApiThinkingLevel`, exported from `@earendil-works/pi-ai`, is the API-facing union `"THINKING_LEVEL_UNSPECIFIED" | "MINIMAL" | "LOW" | "MEDIUM" | "HIGH"` used by `GoogleOptions.thinking.level` and `GoogleVertexOptions.thinking.level`. `ResolvedGoogleThinkingLevel` is the normalized adapter union `"minimal" | "low" | "medium" | "high"` used after Pi resolves model capability mappings. Neither type expands the allowed values of `defaultThinkingLevel`; they describe provider-code boundaries.

```ts title="google-provider-levels.ts"
import type {
  GoogleApiThinkingLevel,
  ResolvedGoogleThinkingLevel,
} from "@earendil-works/pi-ai";

const directRequestLevel: GoogleApiThinkingLevel = "HIGH";
const resolvedAdapterLevel: ResolvedGoogleThinkingLevel = "high";
void [directRequestLevel, resolvedAdapterLevel];
```

`hideThinkingBlock` hides thinking in the transcript. `showCacheMissNotices` shows transcript notices for significant prompt-cache misses, compaction or branch-summary usage, and provider recovery diagnostics such as dropped Anthropic thinking blocks. A model still decides which thinking levels and budgets it supports.

`enabledModels` supplies patterns for Ctrl+P model cycling; `--models` overrides that scope for one run. Provider endpoints and credentials do not belong in a `providers` settings object. Put supported endpoints in `~/.pi/agent/models.json` or a Provider configuration, and keep credentials in the supported authentication store or environment. See <a href="/en/how-to/plug-new-model">Add a model provider</a>.

`cacheWarming` is global-only because refreshes incur provider usage. Its default, `"streaming"`, keeps eligible caches warm while an Agent run is active; `"idle"` may continue after settlement, and `"off"` disables warming. Eligibility comes from the selected model's `promptCache` lifetime metadata for the active retention tier. Pi evaluates expected savings before each refresh, but warming still costs money and cannot guarantee a provider cache hit. `/session` exposes the next decision, while `showCacheMissNotices` controls transcript notices for significant misses, successful warming, compaction usage, and provider recovery.

Radius model discovery uses three layers: the bundled offline catalog is available immediately, cached gateway metadata overlays it when present, and a live gateway refresh overlays both when network access succeeds. A custom Radius gateway configured in `models.json` uses its own catalog instead of inheriting the public `radius.pi.dev` catalog.

| Priority | Radius catalog layer |
|---|---|
| `1` | `bundled offline catalog` |
| `2` | `cached gateway catalog` |
| `3` | `live gateway catalog` |

```json title="thinking-settings.json"
{
  "defaultProvider": "anthropic",
  "defaultModel": "claude-sonnet-4-6",
  "defaultThinkingLevel": "medium",
  "modelThinkingLevels": {
    "anthropic/claude-sonnet-4-6": "high"
  },
  "thinkingBudgets": {
    "minimal": 1024,
    "low": 4096,
    "medium": 10240,
    "high": 32768
  },
  "hideThinkingBlock": false,
  "showCacheMissNotices": true,
  "cacheWarming": "streaming"
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

The built-in `read`, `bash`, `powershell`, `edit`, and `write` definitions use strict-prefer JSON Schema constrained sampling by default. A provider that cannot enforce the schema falls back to ordinary Tool calling. An Extension replacing a built-in definition can opt out explicitly with `constrainedSampling: false`.

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
| `compaction.modelOverrides` | none | Overrides either token budget for an exact `provider/modelId` |
| `branchSummary.reserveTokens` | `16384` | Reserves tokens for branch summarization |
| `branchSummary.skipPrompt` | `false` | When `true`, skips the branch-summary question and defaults to no summary |

The former fractional `compaction.threshold` and turn-count `preserveRecentTurns` settings do not exist. Current compaction is driven by token reserve and recent-token budgets.

Inside `compaction.modelOverrides`, `reserveTokens` and `keepRecentTokens` fall back independently to the ordinary compaction value, then the built-in default. Keys are exact and case-sensitive, including slashes inside a model ID. Only omitted fields fall back; values must be non-negative safe integers, and an invalid matching override is an error.

### Retry and message delivery

`retry.enabled`, `maxRetries` (`3`), and `baseDelayMs` (`2000`) control agent-level retries. `retry.provider.timeoutMs`, `maxRetries`, and `maxRetryDelayMs` (`60000`) control the provider layer. Provider retries default to zero in the Coding Agent integration; increasing both layers can multiply requests and delay the visible failure.

`steeringMode` and `followUpMode` accept `one-at-a-time` (default) or `all`. `transport` accepts `auto`, `sse`, `websocket`, or `websocket-cached`. `httpIdleTimeoutMs` defaults to `300000`; `0` disables the HTTP idle timeout. `websocketConnectTimeoutMs` controls the opening handshake and also accepts `0` to disable it.

## Sessions, terminal, and shell

### Session storage

`sessionDir` changes persistent session storage. Relative paths resolve from the process working directory, and `~` expands to the home directory. Without an override, Pi stores one append-only JSONL file per session below `~/.pi/agent/sessions/<encoded-cwd>/`.

There are no built-in `sessions.retention` or `sessions.redactSecrets` settings. The application operating Pi owns file permissions, backups, retention, and deletion; protect session JSONL because it can contain prompts, model output, and tool results. See <a href="/en/how-to/persist-sessions">Persist sessions</a>.

`/bug [description]` is a runtime command, not a `settings.json` family. It redacts secret values from collected metadata, then offers optional transcript inclusion, a model-written summary, Radius upload, or local ZIP export. Offline mode blocks upload but preserves local ZIP export. Crash metadata is kept in `~/.pi/agent/crashes.json` for the next report; protect that file and any exported ZIP as diagnostic data.

### Terminal, images, shell, and npm

`terminal.showImages` (`true`) controls inline display, `imageWidthCells` (`60`) sets preferred width, `clearOnShrink` (`false`) clears vacated rows, and `showTerminalProgress` (`false`) emits supported terminal progress indicators. `images.blockImages` (`false`) blocks all images from reaching providers. Hiding terminal images does not block upload.

`images.autoResize` is the global on/off gate. `model.inputLimits.images.resize` is an optional per-field override. Pi merges its supplied fields over runtime fallbacks, so an absent profile uses every fallback and a partial profile keeps the fallback for each omitted field:

| Control or event | Scope | Effect |
|---|---|---|
| `images.autoResize` | `global gate` | `enable or disable resizing` |
| `model.inputLimits.images.resize` | `optional per-field override` | `new images before history` |
| `model switch` | `stored image` | `do not rewrite` |

| Field | Runtime fallback | Unit or boundary |
|---|---|---|
| `maxWidth` | `2000` | `pixels` |
| `maxHeight` | `2000` | `pixels` |
| `maxBytes` | `4.5` | `MiB base64 payload` |
| `jpegQuality` | `80` | `integer` |

The effective limits can differ per model. The active profile is used for file attachments, images returned by `read`, and Tool-result images. Each new image is normalized once as it enters history; selecting another model later does not rewrite the stored content. Provider-side transformations and hard limits remain outside this Pi profile, so validate them separately for each route.

Pi auto-detects terminal capabilities, with these exact environment and setting values:

| Capability | Environment value | JSON setting |
|---|---|---|
| OSC 8 hyperlinks | `PI_HYPERLINKS=1\|0\|auto` | `terminal.hyperlinks: true\|false\|"auto"` |
| Inline images | `PI_IMAGE_PROTOCOL=kitty\|iterm2\|none\|auto` | `terminal.images: "kitty"\|"iterm2"\|false\|"auto"` |
| Truecolor | `PI_TRUE_COLOR=1\|0\|auto` | `terminal.trueColor: true\|false\|"auto"` |

For `PI_HYPERLINKS`, `1` force-enables OSC 8 hyperlinks, `0` force-disables them, and `auto` falls back to automatic detection. An explicit boolean `terminal.hyperlinks` setting overrides both `PI_HYPERLINKS` and automatic detection; `"auto"` supplies no setting override.

For `PI_IMAGE_PROTOCOL`, `kitty` selects the Kitty protocol and `iterm2` selects the iTerm2 protocol; `none` force-disables inline images, while `auto` falls back to automatic detection. An explicit protocol or `false` in the `terminal.images` setting overrides both `PI_IMAGE_PROTOCOL` and automatic detection; `"auto"` supplies no setting override.

For `PI_TRUE_COLOR`, `1` force-enables truecolor, `0` force-disables it, and `auto` falls back to automatic detection. An explicit boolean `terminal.trueColor` setting overrides both `PI_TRUE_COLOR` and automatic detection; `"auto"` supplies no setting override.

Forcing a capability unsupported anywhere along the terminal, proxy, or multiplexer path may emit unsupported escape sequences and corrupt rendering. Detection recognizes the Zed integrated terminal as supporting truecolor and hyperlinks but no inline image protocol, so `auto` uses the image text fallback there.

`shellPath` selects the executable for the `bash` Tool, `shellCommandPrefix` prefixes every `bash` command, and `npmCommand` is an argv array for package operations. These Bash settings do not activate, configure, or replace the `powershell` Tool; PowerShell selection belongs in `defaultTools`, `--tools`, or the SDK `tools` option. Windows JSON paths need forward slashes or escaped backslashes.

```json title="terminal-and-shell-settings.json"
{
  "terminal": {
    "showImages": true,
    "imageWidthCells": 60,
    "clearOnShrink": false,
    "showTerminalProgress": false,
    "hyperlinks": "auto",
    "images": "auto",
    "trueColor": "auto"
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

`--mode` accepts `text`, `json`, or `rpc`. Pi `0.87.1` treats both a missing value and an unknown value as CLI errors rather than falling back to interactive mode:

| Invocation | Result | Process outcome |
|---|---|---|
| `--mode <missing>` | `error` | `exit status=1` |
| `--mode invalid` | `error` | `exit status=1` |

This validation happens before the session starts, which makes a misspelled mode fail visibly in scripts and CI.

### UI and display

`theme`, `externalEditor`, `quietStartup`, and `collapseChangelog` control startup and presentation. `externalEditor` overrides `VISUAL`, then `EDITOR`; use `code --wait` when Pi must wait for VS Code. `doubleEscapeAction` is `tree`, `fork`, or `none`, and `treeFilterMode` chooses the default `/tree` filter.

`editorPaddingX` is clamped from 0 to 3, `outputPad` is 0 or 1, and `autocompleteMaxVisible` is clamped from 3 to 20. `showHardwareCursor` helps IME input. `tuiMode` is `regular` or experimental `fullscreen`; the related flat keys are `fullscreenExitOutput` (`transcript` or `resume-hint`) and `fullscreenScrollbar` (`auto`, `always`, or `hidden`). The old nested `tui.*` and `fullscreen.*` shapes are not current. Escape-key timing is an environment control documented in <a href="/en/reference/environment-variables">Environment variables</a>.

`fullscreenCopyOnSelect` defaults to `true`, which copies a fullscreen drag selection automatically. When it is disabled, the selection remains active and highlighted; `Ctrl+X` attempts to copy the eligible active selection and returns from the copy action whether the clipboard write succeeds or fails. It falls back to the last assistant message only when no eligible active selection exists. This setting affects fullscreen text selection, while `/tree` keeps its own selected-message copy behavior.

The clickable `Jump to latest message` control appears only while the fullscreen transcript is scrolled above the latest message; it occupies the bottom row and shows the `tui.altScreen.bottom` shortcut. For `fullscreenScrollbar: "auto"`, the scrollbar becomes visible while scrolling or when the pointer enters its rightmost-column track. Clicking that track jumps through the transcript; `always` reserves and displays the column continuously, while `hidden` removes it.

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
  "cacheWarming": "streaming",
  "enabledModels": ["anthropic/*", "openai/gpt-5.2*"],
  "defaultTools": ["read", "bash", "edit", "write"],
  "theme": "dark",
  "quietStartup": true,
  "tuiMode": "regular",
  "fullscreenCopyOnSelect": true,
  "markdown": {
    "codeBlockIndent": "  ",
    "mermaid": "final"
  },
  "compaction": {
    "enabled": true,
    "reserveTokens": 16384,
    "keepRecentTokens": 20000,
    "modelOverrides": {
      "some-provider/large-context-model": {
        "reserveTokens": 400000
      }
    }
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
    "showImages": true,
    "hyperlinks": "auto",
    "images": "auto",
    "trueColor": "auto"
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
