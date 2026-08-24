---
title: Configuration reference
description: Current settings files, merge rules, trust behavior, and commonly used Pi configuration keys.
translation_key: reference-configuration
language: en
status: reviewed
reviewed_by: Pify maintainers
last_updated: '2026-08-24'
---

Pi reads JSON settings from two locations:

| Location | Scope |
|---|---|
| `~/.pi/agent/settings.json` | Global settings for every project |
| `.pi/settings.json` | Overrides for the current project |

Project values override global values. Nested objects are merged; arrays and scalar values are replaced. Common CLI flags then override the resolved settings for that process.

## Model and thinking

| Setting | Type | Default | Purpose |
|---|---|---|---|
| `defaultProvider` | string | unset | Default provider ID |
| `defaultModel` | string | unset | Default model ID |
| `defaultThinkingLevel` | string | unset | `off`, `minimal`, `low`, `medium`, `high`, `xhigh`, or `max` |
| `hideThinkingBlock` | boolean | `false` | Hide thinking blocks from rendered output |
| `thinkingBudgets` | object | provider defaults | Token budgets by thinking level |

Only levels supported by the selected model are effective.

## UI and terminal

| Setting | Type | Default | Purpose |
|---|---|---|---|
| `theme` | string | `dark` | Built-in or custom theme name |
| `externalEditor` | string | platform fallback | Command opened by the external-editor action |
| `quietStartup` | boolean | `false` | Hide the startup header |
| `tuiMode` | string | `regular` | `regular` or experimental `fullscreen` |
| `fullscreenExitOutput` | string | `transcript` | Output shown when fullscreen mode exits |
| `fullscreenScrollbar` | string | `auto` | `auto`, `always`, or `hidden` |
| `terminal.showImages` | boolean | `true` | Render images when the terminal supports them |
| `images.autoResize` | boolean | `true` | Resize images to at most 2000 × 2000 |
| `images.blockImages` | boolean | `false` | Prevent images from being sent to the model |

Set `externalEditor` to `"code --wait"` for VS Code so Pi waits for the editor process.

## Compaction and retries

| Setting | Type | Default | Purpose |
|---|---|---|---|
| `compaction.enabled` | boolean | `true` | Enable automatic compaction |
| `compaction.reserveTokens` | number | `16384` | Reserve context space for the next response |
| `compaction.keepRecentTokens` | number | `20000` | Keep this many recent tokens outside the summary |
| `branchSummary.reserveTokens` | number | `16384` | Reserve tokens when summarizing an abandoned branch |
| `retry.enabled` | boolean | `true` | Retry transient failures at the agent layer |
| `retry.maxRetries` | number | `3` | Maximum agent-level retries |
| `retry.baseDelayMs` | number | `2000` | Initial exponential-backoff delay |
| `retry.provider.maxRetries` | number | `0` | Provider-layer retries |

Leave provider retries at `0` unless the integration requires them. Layering provider and agent retries can multiply requests and delay a visible failure.

## Delivery and transport

| Setting | Type | Default | Purpose |
|---|---|---|---|
| `steeringMode` | string | `one-at-a-time` | Deliver queued steering messages one at a time or all together |
| `followUpMode` | string | `one-at-a-time` | Deliver follow-up messages one at a time or all together |
| `transport` | string | `auto` | `sse`, `websocket`, `websocket-cached`, or automatic selection |
| `httpIdleTimeoutMs` | number | `300000` | HTTP stream idle timeout; `0` disables it |
| `websocketConnectTimeoutMs` | number | `15000` | WebSocket connection timeout; `0` disables it |

## Tools and shell

| Setting | Type | Default | Purpose |
|---|---|---|---|
| `defaultTools` | string[] | standard built-ins | Initial built-in tool set |
| `shellPath` | string | platform shell | Custom shell executable |
| `shellCommandPrefix` | string | unset | Prefix applied to each bash command |
| `npmCommand` | string[] | npm | Argument vector used for package operations |

An empty `defaultTools` array disables built-in defaults but does not disable extension or SDK custom tools. `--tools` is a strict allowlist; `--no-tools` disables every tool.

Windows paths in JSON must use forward slashes or escaped backslashes:

```json
{
  "shellPath": "C:/Program Files/Git/bin/bash.exe"
}
```

## Sessions and resources

| Setting | Type | Default | Purpose |
|---|---|---|---|
| `sessionDir` | string | Pi session directory | Custom persistent-session directory |
| `enabledModels` | string[] | unset | Model patterns available through model cycling |
| `packages` | array | `[]` | npm or Git packages that provide resources |
| `extensions` | string[] | `[]` | Local extension files or directories |
| `skills` | string[] | `[]` | Local skill files or directories |
| `prompts` | string[] | `[]` | Local prompt-template files or directories |
| `themes` | string[] | `[]` | Local theme files or directories |
| `enableSkillCommands` | boolean | `true` | Register discovered skills as slash commands |

Paths in global settings resolve from `~/.pi/agent`; project paths resolve from `.pi`. Resource arrays accept glob patterns, exclusions, and explicit include/exclude entries.

## Project trust

`defaultProjectTrust` is a global-only setting with values `ask`, `always`, or `never`; its default is `ask`. Project trust controls project-local settings and executable resources such as extensions. Saved decisions live in `~/.pi/agent/trust.json`.

Non-interactive modes cannot show a trust prompt. Use a saved decision, configure the global fallback, or pass `--approve` / `--no-approve` for one run.

## Example

```json title="~/.pi/agent/settings.json"
{
  "defaultProvider": "anthropic",
  "defaultModel": "claude-sonnet-4-6",
  "defaultThinkingLevel": "medium",
  "theme": "dark",
  "compaction": {
    "enabled": true,
    "reserveTokens": 16384,
    "keepRecentTokens": 20000
  },
  "retry": {
    "enabled": true,
    "maxRetries": 3
  },
  "defaultTools": ["read", "bash", "edit", "write"],
  "packages": ["@org/pi-resources"]
}
```
