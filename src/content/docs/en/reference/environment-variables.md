---
title: "Environment variables reference"
description: "Every environment variable Pi reads at runtime."
template: doc
sidebar:
  label: "Environment variables"
  order: 3
---

Pi reads environment variables for API keys, runtime flags, and process markers. This page lists every variable the SDK touches.

:::note[How Pi reads these]
Provider API keys are read at the moment a request is sent, not at startup. This means rotating a key (e.g. after `pi auth print-api-key`) takes effect on the next turn without restarting the agent.
:::

## Provider API keys

| Variable | Provider |
|---|---|
| `ANTHROPIC_API_KEY` | Anthropic |
| `OPENAI_API_KEY` | OpenAI |
| `GOOGLE_API_KEY` | Google Generative AI |
| `GEMINI_API_KEY` | Google Generative AI (alternate) |
| `GOOGLE_VERTEX_API_KEY` | Google Vertex AI |
| `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY` | Amazon Bedrock |
| `BASETEN_API_KEY` | Baseten |
| `OPENROUTER_API_KEY` | OpenRouter |
| `AZURE_OPENAI_API_KEY` + `AZURE_OPENAI_ENDPOINT` | Azure OpenAI |
| `GITHUB_TOKEN` | GitHub Copilot |

For self-hosted providers, the variable name is whatever is configured in `providers[provider].apiKeyEnvVar` in [settings.json](/en/reference/configuration/#providers).

## Runtime flags

### `PI_HOME`

Overrides the Pi home directory. Default `~/.pi`. Pi looks for `settings.json`, `skills/`, `extensions/`, and `sessions/` under this path.

```bash
PI_HOME=/var/lib/pi pi
```

### `PI_TUI_ESC_TIMEOUT`

Milliseconds to wait between an Escape key and the next key, used to disambiguate `Alt+Enter` from a lone Escape in the TUI. Increase on high-latency SSH sessions.

```bash
PI_TUI_ESC_TIMEOUT=200 pi
```

Default `50`.

### `PI_CODING_AGENT`

Set automatically to `true` when `@pi-coding-agent` spawns a child process. Sub-agents and extensions read this to detect they are running inside the coding agent and adjust their behaviour accordingly.

### `AI_AGENT`

Set automatically to `pi` when any Pi process spawns a child. Used by external services and by other agents to detect "this work is being done by Pi". Read-only from Pi's perspective.

### `PI_EXPERIMENTAL`

Set to `1` to enable experimental features. As of v0.84 the only experimental feature is strict JSON-schema constrained sampling for the managed `read`, `bash`, `edit`, and `write` tools.

```bash
PI_EXPERIMENTAL=1 pi
```

Experimental features may change shape between minor versions.

### `PI_LOG_LEVEL`

Log verbosity. One of `silent`, `error`, `warn`, `info`, `debug`. Default `info`. The CLI also accepts `--log-prompts` which logs the composed system prompt on every turn regardless of level.

## Proxy variables

Pi honours the standard proxy variables when set:

| Variable | Effect |
|---|---|
| `HTTP_PROXY` | HTTP proxy for non-TLS requests |
| `HTTPS_PROXY` | HTTP proxy for TLS requests |
| `NO_PROXY` | Comma-separated host list to bypass the proxy |
| `SSL_CERT_FILE` | Path to a CA bundle for verifying TLS |

The provider HTTP client in `@pi-ai/core` reads these directly from `process.env`.

## Provider-specific

### `OPENAI_ORG_ID`

Sets the `OpenAI-Organization` header on every OpenAI request. Useful when running against multiple organisations.

### `ANTHROPIC_BASE_URL`

Overrides the Anthropic base URL. Equivalent to `providers.anthropic.baseUrl` in settings.

### `GOOGLE_APPLICATION_CREDENTIALS`

Path to a Google service-account JSON file for Vertex AI authentication. Standard Google convention; Pi reads it for Vertex but does not interpret it.

### `CLOUDflare_AI_GATEWAY_ACCOUNT_ID` + `CLOUDFLARE_AI_GATEWAY_TOKEN`

Required for routing through Cloudflare AI Gateway. Set in `providers[provider].baseUrl` if you also use the gateway.

## Process markers

Pi sets the following on every child it spawns:

- `AI_AGENT=pi` — generic agent marker, read by external tools
- `PI_CODING_AGENT=true` — added when the child is the coding agent itself
- `PI_PARENT_SESSION=<session-id>` — when the child was spawned from a session

Children may opt to read these or ignore them. Reading `PI_PARENT_SESSION` lets a sub-agent record its origin in the metadata of any session it creates.

## Pitfalls

**Multiple keys for the same provider**

Pi uses the first matching variable in the order listed above. If both `GOOGLE_API_KEY` and `GEMINI_API_KEY` are set, `GOOGLE_API_KEY` wins.

**YOLO mode vs. `PI_EXPERIMENTAL`**

These are independent. YOLO is a permission setting; `PI_EXPERIMENTAL` enables specific features. They can be on at the same time.

**Setting `PI_HOME` to a directory that does not exist**

Pi does not auto-create the home directory. It will fail at the first operation that tries to write a session. Create the directory first:

```bash
mkdir -p "$PI_HOME" && pi
```

## Next

- [Reference: Configuration](/en/reference/configuration/) for the settings.json surface.
- [Reference: API](/en/reference/api/) for the runtime API.
