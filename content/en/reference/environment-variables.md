---
title: Environment variables reference
description: Process configuration, child-process markers, session metadata, credentials, and proxy variables used by Pi.
translation_key: reference-environment-variables
language: en
status: reviewed
reviewed_by: Pify maintainers
last_updated: '2026-08-24'
---

Pi reads variables that configure its process and injects a separate set into commands launched through the built-in bash tool. Provider credential variables depend on the selected provider.

## Process configuration

| Variable | Purpose |
|---|---|
| `PI_CODING_AGENT_DIR` | Override the config directory; default `~/.pi/agent` |
| `PI_CODING_AGENT_SESSION_DIR` | Override persistent-session storage; `--session-dir` has higher precedence |
| `PI_PACKAGE_DIR` | Override the package directory, including read-only Nix/Guix locations |
| `PI_OFFLINE` | Disable startup network work, including updates and telemetry |
| `PI_SKIP_VERSION_CHECK` | Disable only the latest-version request |
| `PI_TELEMETRY` | Force telemetry on or off with `1`/`true`/`yes` or `0`/`false`/`no` |
| `PI_CACHE_RETENTION` | Set `long` to request extended prompt caching where supported |
| `PI_SHARE_VIEWER_URL` | Override the base URL used by `/share` |
| `PI_HARDWARE_CURSOR` | Set `1` to show the hardware cursor in the TUI |
| `PI_TUI_ESC_TIMEOUT` | ESC disambiguation delay in milliseconds; default 100 over SSH and 10 otherwise |
| `VISUAL`, `EDITOR` | External-editor fallback when `externalEditor` is unset |
| `HTTP_PROXY`, `HTTPS_PROXY` | Proxy outbound HTTP requests |

Boolean Pi variables are configuration flags, not arbitrary non-empty strings. Use the accepted values documented above.

## Process markers

CLI and RPC entry points set these variables for child processes:

| Variable | Value | Purpose |
|---|---|---|
| `AI_AGENT` | `pi` | Generic marker identifying the launching agent |
| `PI_CODING_AGENT` | `true` | Pi-specific process marker |

The markers are not session-specific and are not automatically set when Pi is embedded through the SDK.

## Bash tool session metadata

Commands executed by Pi's LLM-callable bash tool receive current session state:

| Variable | Purpose |
|---|---|
| `PI_SESSION_ID` | Current session ID |
| `PI_SESSION_FILE` | Absolute JSONL path; unset for an ephemeral session |
| `PI_PROVIDER` | Selected Pi provider ID |
| `PI_MODEL` | Selected Pi model ID |
| `PI_REASONING_LEVEL` | Effective reasoning level |

Values are resolved when each command starts, so a model or reasoning-level change affects the next command.

```bash
printf '%s/%s\n' "$PI_PROVIDER" "$PI_MODEL"
printf 'reasoning=%s session=%s\n' "$PI_REASONING_LEVEL" "$PI_SESSION_ID"
```

These variables are not injected into `!` or `!!` commands entered directly by the user. Custom tools built with `createBashTool()` expose them by default; set `exposeSessionEnvironment: false` to remove them.

## Provider credentials

Built-in providers commonly read variables such as:

| Variable | Provider or runtime |
|---|---|
| `ANTHROPIC_API_KEY` | Anthropic |
| `OPENAI_API_KEY` | OpenAI-compatible authentication |
| `GEMINI_API_KEY` or `GOOGLE_API_KEY` | Google Generative AI |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN`, `AWS_REGION` | Amazon Bedrock through the AWS credential chain |
| `AZURE_OPENAI_API_KEY` | Azure OpenAI configurations that use API-key authentication |

This table is not the model catalog: supported credential sources vary by provider and can include stored OAuth credentials, cloud SDK configuration, and extension-defined resolution.

Custom provider configuration can reference `$ENV_VAR` or `${ENV_VAR}` in `apiKey` and header values:

```ts
pi.registerProvider("company", {
  baseUrl: "https://gateway.example.com/v1",
  apiKey: "$COMPANY_AI_TOKEN",
  api: "openai-completions",
  models: [],
});
```

Keep secrets out of `settings.json`, extension source, logs, and session transcripts. Prefer the Pi credential store or environment injection from a secret manager.

## Precedence notes

- Session directory: `--session-dir` → `PI_CODING_AGENT_SESSION_DIR` → `sessionDir` setting → default.
- External editor: `externalEditor` setting → `VISUAL` → `EDITOR` → platform fallback.
- Offline mode is broader than `PI_SKIP_VERSION_CHECK`: it disables all supported startup network operations.
