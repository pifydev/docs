---
title: Configuration reference
description: 'The settings Pi reads from settings.json, project files, and CLI flags.'
translation_key: reference-configuration
language: en
---
The settings Pi reads at startup. Most live in `settings.json` under the Pi home directory; some can be overridden per-project or per-CLI.

:::note[Resolution order]
CLI flags > `settings.json` (project) > `settings.json` (global) > defaults. Per-project settings live in `./.pi/settings.json`.
:::

## File locations

| Path | Scope |
|---|---|
| `~/.pi/settings.json` | Global defaults, applied to every project |
| `./.pi/settings.json` | Project overrides, applied when cwd is here or below |
| `./SYSTEM.md` | Mandatory system prompt additions |
| `./AGENTS.md` | Soft system prompt guidance |

## Schema

```ts title="settings.json (TypeScript shape)"
interface Settings {
  model?: { provider: string; id: string };
  yolo?: boolean;
  logPrompts?: boolean;
  defaultTools?: string[];
  fullscreen?: {
    mode?: "auto" | "always" | "hidden";
    onExit?: "transcript" | "resume-hint";
  };
  tui?: {
    theme?: string;
    escapeTimeout?: number; // ms
  };
  compaction?: {
    threshold?: number; // 0..1, fraction of context window
    preserveRecentTurns?: number;
  };
  sessions?: {
    retention?: "1d" | "7d" | "30d" | "forever";
    redactSecrets?: boolean;
  };
  providers?: {
    [provider: string]: {
      baseUrl?: string;
      apiKeyEnvVar?: string;
    };
  };
  extensions?: string[]; // paths or npm package names
}
```

## Models

### `model`

The default model for new sessions. Format: `{ provider, id }`.

```json title="settings.json"
{
  "model": { "provider": "anthropic", "id": "claude-sonnet-4-5" }
}
```

Per-session overrides take precedence when a session is resumed with `--session <id>`.

### `defaultTools`

Names of the built-in tools that are enabled at startup. Defaults to `["read", "bash", "edit", "write"]`.

```json title="settings.json"
{
  "defaultTools": ["read", "bash", "edit"]
}
```

Setting an empty array disables all managed tools.

## Permissions

### `yolo`

If `true`, skips the permission prompt before invoking any tool with `requiresPermission: true`.

```json title="settings.json"
{ "yolo": true }
```

:::caution
YOLO mode lets the agent write files and run shell commands without asking. Use it only in disposable sandboxes.
:::

### Per-tool overrides

To allow one tool without prompting while keeping prompts for others, set `requiresPermission: false` on the extension tool definition rather than flipping global `yolo`.

## Compaction

### `compaction.threshold`

Fraction of the model context window that triggers automatic compaction. Default `0.85`.

### `compaction.preserveRecentTurns`

Number of recent turns kept verbatim during compaction. The rest are summarised. Default `3`.

## Sessions

### `sessions.retention`

How long to keep session files. Pi sweeps the sessions directory on startup.

| Value | Effect |
|---|---|
| `"1d"` | Delete after one day |
| `"7d"` | Delete after one week (default) |
| `"30d"` | Delete after thirty days |
| `"forever"` | Never delete automatically |

### `sessions.redactSecrets`

If `true`, the default `redact` hook scans `tool_result` outputs for strings that look like API keys and replaces them with `[redacted]`. Custom redaction logic can be set per-session via `Session({ redact })`.

## TUI

### `tui.theme`

Name of the theme to apply on startup. Use `/settings` in the TUI to browse.

### `tui.escapeTimeout`

Milliseconds to wait for an Escape key to be followed by another key (for `Alt+Enter`, arrow keys, etc.). Default `50`. Increase on high-latency SSH sessions.

## Providers

### `providers[provider].baseUrl`

Override the base URL for a provider. Useful for self-hosted gateways or local llama.cpp servers.

```json title="settings.json"
{
  "providers": {
    "openai": { "baseUrl": "http://localhost:8080/v1" }
  }
}
```

### `providers[provider].apiKeyEnvVar`

Override the environment variable name the SDK reads for the API key. The default is `<PROVIDER>_API_KEY`.

## Extensions

### `extensions`

List of extensions to load at startup. Each entry is either a path to a local file or an npm package name.

```json title="settings.json"
{ "extensions": ["@pi-extensions/git", "./extensions/team-roles.ts"] }
```

Relative paths are resolved from the project root.

## Validation

Pi validates `settings.json` against the schema on every load. Invalid values fail fast with a precise error message that names the field. To test a config file before committing:

```bash
pi --dry-run
```

The `--dry-run` flag loads settings and prints the resolved configuration without starting the agent.

## Next

- [Reference: API](api.md) for the runtime API.
- [Reference: Environment Variables](environment-variables.md) for env-var level overrides.
