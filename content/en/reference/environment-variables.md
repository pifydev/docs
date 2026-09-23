---
title: Environment variables reference
description: Process flags, provider credentials, child markers, session metadata, and proxy variables used by Pi.
translation_key: reference-environment-variables
language: en
official_refs:
  - 'https://github.com/earendil-works/pi/blob/f07218c4d4bbc12bef056a7058c3dd49dfe41abe/packages/coding-agent/docs/environment-variables.md'
  - 'https://github.com/earendil-works/pi/blob/f07218c4d4bbc12bef056a7058c3dd49dfe41abe/packages/coding-agent/docs/providers.md'
status: reviewed
reviewed_by: Pify maintainers
last_updated: '2026-09-23'
---

Pi uses environment variables in three distinct places: its own process configuration, authentication for a selected provider, and the environment of commands launched by the LLM-callable `bash` and `powershell` tools. Scope matters: a variable recognized by one provider is not automatically a Pi-wide setting.

:::note[When values are read]

Most process flags affect startup. Provider authentication is resolved when Pi asks the selected provider for credentials. Changing a shell variable affects later requests only when neither a stored `auth.json` credential nor a configured provider `apiKey` in `models.json` takes precedence. Shell-tool metadata is rebuilt for every tool command.

:::

## Provider credentials

For Pi's built-in providers, credential order is an explicit CLI `--api-key` or runtime override, a matching stored `auth.json` API key or OAuth credential, the configured `models.json` `apiKey` (a literal or `$ENV` reference under that file's contract), then the built-in provider's ambient environment. Extension-defined providers may implement a different contract. Use `/login` to write the protected credential store instead of putting secrets in project files.

| Provider | Environment credential recognized by 0.87.1 |
|---|---|
| Anthropic | `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_OAUTH_TOKEN`, `ANTHROPIC_API_KEY` |
| Ant Ling, OpenAI, Azure OpenAI | `ANT_LING_API_KEY`, `OPENAI_API_KEY`, `AZURE_OPENAI_API_KEY` |
| DeepSeek, NVIDIA NIM, Gemini | `DEEPSEEK_API_KEY`, `NVIDIA_API_KEY`, `GEMINI_API_KEY` |
| Mistral, Groq, Cerebras | `MISTRAL_API_KEY`, `GROQ_API_KEY`, `CEREBRAS_API_KEY` |
| xAI, OpenRouter, Vercel AI Gateway | `XAI_API_KEY`, `OPENROUTER_API_KEY`, `AI_GATEWAY_API_KEY` |
| ZAI Global and China | `ZAI_API_KEY`, `ZAI_CODING_CN_API_KEY` |
| OpenCode Zen and Go | `OPENCODE_API_KEY` |
| Radius, Hugging Face | `RADIUS_API_KEY`, `HF_TOKEN` |
| Fireworks, Together AI, Baseten | `FIREWORKS_API_KEY`, `TOGETHER_API_KEY`, `BASETEN_API_KEY` |
| Kimi, Meta Muse, MiniMax, MiniMax China, Moonshot | `KIMI_API_KEY`, `META_API_KEY`, `MINIMAX_API_KEY`, `MINIMAX_CN_API_KEY`, `MOONSHOT_API_KEY` |
| Qwen Token Plan | `QWEN_TOKEN_PLAN_API_KEY`, `QWEN_TOKEN_PLAN_CN_API_KEY` |
| Xiaomi MiMo and token-plan regions | `XIAOMI_API_KEY`, `XIAOMI_TOKEN_PLAN_CN_API_KEY`, `XIAOMI_TOKEN_PLAN_AMS_API_KEY`, `XIAOMI_TOKEN_PLAN_SGP_API_KEY` |
| GitHub Copilot | `COPILOT_GITHUB_TOKEN` |
| Cloudflare AI Gateway and Workers AI | `CLOUDFLARE_API_KEY`; IDs are covered below |

The following selected catalog entries distinguish direct API-key routes from subscription authentication. The credential column names the route, not a value to copy into an environment variable:

| Model | Provider route | Credential path |
|---|---|---|
| `Claude Opus 5.5` | `anthropic` | `ANTHROPIC_API_KEY` |
| `GPT-6 Sol` | `openai` | `OPENAI_API_KEY` |
| `GPT-6 Luna` | `openai` | `OPENAI_API_KEY` |
| `GPT-6 Sol` | `openai-codex` | `OpenAI Codex subscription` |
| `GPT-6 Luna` | `openai-codex` | `OpenAI Codex subscription` |
| `Claude Opus 5.5` | `github-copilot` | `GitHub Copilot subscription` |
| `GPT-6 Sol` | `github-copilot` | `GitHub Copilot subscription` |
| `GPT-6 Luna` | `github-copilot` | `GitHub Copilot subscription` |
| `Grok 4.7` | `xai` | `XAI_API_KEY` |

For the two Claude routes, the current IDs differ: Anthropic uses `claude-opus-5-5`, while GitHub Copilot uses `claude-opus-5.5`. Use `/login` for subscription routes and keep environment variables for the direct-key routes shown above.

Amazon Bedrock and Google Vertex AI also accept ambient cloud credentials described under provider-specific variables. A custom `models.json` provider can reference an arbitrary variable with `"apiKey": "$COMPANY_AI_TOKEN"`; a plain uppercase string is a literal, not an environment lookup. See <a href="/en/how-to/plug-new-model">Add a model provider</a> for that file's exact surface.

Meta Muse supports `/login meta`, which stores the login credential and refreshes its Muse Model API key automatically. `META_API_KEY` supplies that Model API key directly when interactive login is not appropriate. Keep the two paths distinct: the environment value is already the request credential and does not create a stored Meta login.

| Meta authentication path | Credential boundary |
|---|---|
| `/login meta` | `stored login → automatic Muse Model API key refresh` |
| `META_API_KEY` | `direct Muse Model API key → no stored login` |

## Runtime flags

### Directories and runtime assets

| Variable | Exact purpose |
|---|---|
| `PI_CODING_AGENT_DIR` | Agent config directory; default `~/.pi/agent` |
| `PI_CODING_AGENT_SESSION_DIR` | Persistent session directory; below `--session-dir` and above the `sessionDir` setting in CLI precedence |
| `PI_PACKAGE_DIR` | Packaged assets directory, useful for read-only Nix or Guix installations |

`PI_CODING_AGENT_DIR` replaces the old broad home-directory switch; it targets Pi's agent configuration, not the operating-system home directory. Direct SDK calls use the paths passed to their constructors and do not automatically reproduce every CLI precedence rule.

```bash title="Start Pi with explicit runtime directories"
export PI_CODING_AGENT_DIR=/srv/pi/agent
export PI_CODING_AGENT_SESSION_DIR=/srv/pi/sessions
export PI_PACKAGE_DIR=/nix/store/example-pi
pi
```

### Offline, version, and telemetry switches

| Variable | Accepted value and effect |
|---|---|
| `PI_OFFLINE` | `1`, `true`, or `yes` disables supported startup and model-catalog network work, including version/package checks, install/update telemetry, and `/bug` uploads |
| `PI_SKIP_VERSION_CHECK` | Set to `1` to skip only the latest-version request |
| `PI_TELEMETRY` | `1`/`true`/`yes` enables install/update telemetry and Pi provider-attribution headers; `0`/`false`/`no` disables them |

Use `--offline` or a supported truthy `PI_OFFLINE` value. Unset the variable to re-enable network work: some downstream paths test whether `PI_OFFLINE` exists, so `PI_OFFLINE=0` is unsafe and can behave as offline. Offline mode blocks Radius upload from `/bug`, but local ZIP export remains available. `PI_SKIP_VERSION_CHECK` is narrower than offline mode. Do not rely on undocumented spellings for `PI_TELEMETRY`.

### Terminal and editor behavior

`PI_HARDWARE_CURSOR=1` makes the TUI hardware cursor visible. `PI_TUI_ESC_TIMEOUT` accepts a positive finite number of milliseconds for distinguishing a lone Escape from a split Alt-key sequence; the default is 100 ms when `SSH_CONNECTION` or `SSH_TTY` exists and 10 ms otherwise.

Pi auto-detects OSC 8 hyperlinks, an inline image protocol, and truecolor. Pi 0.87.1 exposes these exact advanced overrides:

| Capability | Environment value | Matching JSON setting |
|---|---|---|
| OSC 8 hyperlinks | `PI_HYPERLINKS=1\|0\|auto` | `terminal.hyperlinks: true\|false\|"auto"` |
| Inline images | `PI_IMAGE_PROTOCOL=kitty\|iterm2\|none\|auto` | `terminal.images: "kitty"\|"iterm2"\|false\|"auto"` |
| Truecolor | `PI_TRUE_COLOR=1\|0\|auto` | `terminal.trueColor: true\|false\|"auto"` |

For `PI_HYPERLINKS`, `1` force-enables OSC 8 hyperlinks, `0` force-disables them, and `auto` falls back to automatic detection. An explicit boolean `terminal.hyperlinks` setting overrides both `PI_HYPERLINKS` and automatic detection; `"auto"` supplies no setting override.

For `PI_IMAGE_PROTOCOL`, `kitty` selects the Kitty protocol and `iterm2` selects the iTerm2 protocol; `none` force-disables inline images, while `auto` falls back to automatic detection. An explicit protocol or `false` in the `terminal.images` setting overrides both `PI_IMAGE_PROTOCOL` and automatic detection; `"auto"` supplies no setting override.

For `PI_TRUE_COLOR`, `1` force-enables truecolor, `0` force-disables it, and `auto` falls back to automatic detection. An explicit boolean `terminal.trueColor` setting overrides both `PI_TRUE_COLOR` and automatic detection; `"auto"` supplies no setting override.

Force a capability only when the complete terminal, proxy, and multiplexer path supports it, because unsupported escape sequences can corrupt rendering.

Automatic detection recognizes the Zed integrated terminal as truecolor- and hyperlink-capable, but it does not select an inline image protocol there. Under `auto`, Zed therefore uses the image text fallback; do not force Kitty or iTerm2 sequences unless the actual terminal path supports them.

For Ctrl+G, the `externalEditor` setting wins, followed by `VISUAL`, then `EDITOR`, then the platform fallback. These variables contain an editor command, not file content.

### Cache and sharing

`PI_CACHE_RETENTION=long` requests extended provider prompt caching where the selected API supports it; other values do not select another documented tier. `PI_SHARE_VIEWER_URL` replaces the base URL used to build the `/share` viewer link. `PI_RADIUS_GATEWAY` overrides the Radius gateway origin used by `/bug` uploads and Radius relay connections. None of these variables is a provider credential.

### `PI_EXPERIMENTAL`

`PI_EXPERIMENTAL=1` enables remaining runtime features that are explicitly gated as experimental. The exact comparison is `1`; `true` is not accepted. It no longer controls constrained sampling for the built-in `read`, `bash`, `powershell`, `edit`, and `write` Tools: those definitions use strict-prefer sampling by default, and an Extension can replace one with `constrainedSampling: false`.

### Value rules

Environment variables are strings, but Pi does not treat every non-empty string as true. Use only the values above. Paths may be absolute or expanded by the documented CLI path helpers; provider-specific values can also come from a stored credential's scoped `env` object, which takes precedence over the ambient process for those supported fields.

## Proxy and TLS

Pi 0.87.1 configures an Undici `EnvHttpProxyAgent` for Pi-managed fetch traffic.

| Variable | Behavior |
|---|---|
| `HTTP_PROXY` | Proxy for HTTP destinations |
| `HTTPS_PROXY` | Proxy for HTTPS destinations |
| `NO_PROXY` | Comma- or space-separated bypass hosts; `*` bypasses all proxying |

Undici also recognizes lowercase forms and gives them precedence over uppercase forms. The global `httpProxy` setting fills `HTTP_PROXY` and `HTTPS_PROXY` only when they are unset. Provider SDKs such as AWS or Google may own separate transports, so these variables are not a guarantee for every extension or cloud client.

`SSL_CERT_FILE` is not read or installed by Pi's published 0.87.1 transport. Configure custom certificate trust through the selected Node runtime or provider SDK and verify that route independently; do not assume this baseline variable changes Pi-managed TLS.

## Provider-specific variables

### Azure OpenAI

Azure OpenAI Responses requires `AZURE_OPENAI_API_KEY` and either `AZURE_OPENAI_BASE_URL` or `AZURE_OPENAI_RESOURCE_NAME`. Optional controls are `AZURE_OPENAI_API_VERSION` and the comma-separated `AZURE_OPENAI_DEPLOYMENT_NAME_MAP`. The generic `OPENAI_ORG_ID` baseline variable is not consumed by the 0.87.1 OpenAI provider.

### Amazon Bedrock

Bedrock accepts `AWS_BEARER_TOKEN_BEDROCK`, `AWS_PROFILE`, or the standard AWS access-key/role chain, including `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, optional `AWS_SESSION_TOKEN`, ECS credentials, and web identity. Region selection reads `AWS_REGION` or `AWS_DEFAULT_REGION`. Proxy deployments can use `AWS_ENDPOINT_URL_BEDROCK_RUNTIME`; `AWS_BEDROCK_SKIP_AUTH=1` and `AWS_BEDROCK_FORCE_HTTP1=1` are specialized compatibility switches.

### Google Vertex AI

Vertex accepts `GOOGLE_CLOUD_API_KEY` directly. Application Default Credentials instead require a valid default credential file or `GOOGLE_APPLICATION_CREDENTIALS`, plus `GOOGLE_CLOUD_PROJECT` (or `GCLOUD_PROJECT`) and `GOOGLE_CLOUD_LOCATION`. `GOOGLE_API_KEY` and `GOOGLE_VERTEX_API_KEY` are not aliases for the current Gemini and Vertex variables.

### Cloudflare

Cloudflare Workers AI uses `CLOUDFLARE_API_KEY` and `CLOUDFLARE_ACCOUNT_ID`; AI Gateway additionally requires `CLOUDFLARE_GATEWAY_ID`. These exact all-uppercase names replace the baseline's misspelled `CLOUDflare_*` form.

```bash title="Set non-secret proxy and cloud routing values"
export HTTPS_PROXY=http://proxy.internal.example:8080
export NO_PROXY=localhost,127.0.0.1,.internal.example
export GOOGLE_CLOUD_PROJECT=example-project
export GOOGLE_CLOUD_LOCATION=us-central1
```

The old `ANTHROPIC_BASE_URL` variable is also not a current built-in override. Configure a supported custom endpoint in `models.json` or a provider implementation rather than relying on an ambient alias.

## Process markers and shell-tool metadata

CLI and RPC entry points set `AI_AGENT=pi` and `PI_CODING_AGENT=true`. Child processes inherit them, but they are not session identifiers and an SDK embedding does not set them automatically. Published 0.87.1 does not emit the old `PI_PARENT_SESSION` marker.

Pi can expose the following current session context to commands run by the LLM-callable `bash` and `powershell` tools:

| Variable | Value |
|---|---|
| `PI_SESSION_ID` | Current session ID; always present when the injection conditions below are met |
| `PI_SESSION_FILE` | Absolute JSONL path; present only for a file-backed session with a session file path |
| `PI_PROVIDER` | Selected Pi provider ID; present only when `ctx.model` exists |
| `PI_MODEL` | Selected Pi model ID; present only when `ctx.model` exists |
| `PI_REASONING_LEVEL` | Effective level: `off`, `minimal`, `low`, `medium`, `high`, `xhigh`, or `max`; present only when `ctx.thinkingLevel` is truthy |

Default local Bash and PowerShell operations launch a separate child process for each Tool call and use their respective command syntax. Custom operations instead delegate to their configured backend; that backend owns cancellation, cleanup, and whether any execution state persists. The wrapper first removes inherited values for all five session variables. `exposeSessionEnvironment` defaults to `true`, but injection requires an Agent/Extension execution context. `exposeSessionEnvironment: false` suppresses all five session fields even when that context exists. A standalone or custom invocation without that context does not receive them automatically. When injection occurs, the values are resolved before that shell-tool command, so model or reasoning changes affect the next command. The native `powershell` Tool is Windows-only. These variables are not injected into user-entered `!` or `!!` commands.

When those conditions are met, a custom shell tool created with `createBashTool()` or `createPowerShellTool()` exposes the metadata before `spawnHook`, so preserve the received process environment when adding fields. Without the context, or with exposure disabled, the hook receives an environment with these session fields removed. The existing Bash form remains:

```ts title="Preserve Pi metadata in a custom bash tool"
import { createBashTool } from "@earendil-works/pi-coding-agent";

export const bashTool = createBashTool(process.cwd(), {
  spawnHook: (context) => ({
    ...context,
    env: { ...context.env, CI: "1" },
  }),
});
```

PowerShell customization uses the same hook contract. When registered and executed through Pi with Agent context and default exposure, it receives the same session fields:

```ts title="Preserve Pi metadata in a custom PowerShell tool"
import { createPowerShellTool } from "@earendil-works/pi-coding-agent";

export const powerShellTool = createPowerShellTool(process.cwd(), {
  spawnHook: (context) => ({
    ...context,
    env: { ...context.env, CI: "1" },
  }),
});
```

Disable exposure explicitly on either factory when commands cross a trust boundary. Pi removes inherited session fields first, preventing stale parent metadata from leaking into the command or hook. This Bash example remains valid; replace the factory with `createPowerShellTool()` for the equivalent PowerShell policy:

```ts title="Disable bash session metadata"
import { createBashTool } from "@earendil-works/pi-coding-agent";

export const isolatedBashTool = createBashTool(process.cwd(), {
  exposeSessionEnvironment: false,
  spawnHook: (context) => context,
});
```

## Pitfalls and security

- Do not put API keys in committed shell files, `settings.json`, extension source, logs, prompts, or transcripts. Prefer `/login`, a secret manager, or narrowly scoped process injection; remember that child processes inherit exported values.
- Current names are exact. `PI_HOME`, `PI_LOG_LEVEL`, `PI_PARENT_SESSION`, `GOOGLE_API_KEY`, `GOOGLE_VERTEX_API_KEY`, `GITHUB_TOKEN`, `OPENAI_ORG_ID`, `ANTHROPIC_BASE_URL`, and misspelled `CLOUDflare_*` names are not compatibility aliases in published 0.87.1.
- A stored provider credential and a configured `models.json` `apiKey` both take precedence over ambient variables. Log out or update the stored entry, and remove or change the configured key, before expecting a rotated shell key to win.
- `PI_EXPERIMENTAL` is unrelated to provider authentication and is not a permission or “yolo” switch.
- Do not print complete environment dumps while debugging. Inspect only non-secret markers or individual metadata fields, and treat `PI_SESSION_FILE` as sensitive local data.

## Next

- <a href="/en/reference/configuration">Configuration reference</a> covers `settings.json`, trust, resources, tools, and sessions.
- <a href="/en/reference/api">API reference</a> covers public SDK surfaces.
- <a href="/en/how-to/plug-new-model">Add a model provider</a> covers `models.json`, authentication, and custom adapters.
