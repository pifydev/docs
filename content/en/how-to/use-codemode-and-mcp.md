---
title: Use Codemode and MCP
description: Configure Pi 0.99.2 Codemode and MCP discovery, authentication, extensions, permissions, results, and retry boundaries.
translation_key: how-to-use-codemode-and-mcp
language: en
official_refs:
  - "https://github.com/earendil-works/pi/blob/005af57d88ee23b33778f343a9595b32e67ff788/packages/coding-agent/docs/mcp.md"
  - "https://github.com/earendil-works/pi/blob/005af57d88ee23b33778f343a9595b32e67ff788/packages/coding-agent/docs/cli.md"
  - "https://github.com/earendil-works/pi/blob/005af57d88ee23b33778f343a9595b32e67ff788/packages/coding-agent/src/extensions/codemode/index.ts"
  - "https://github.com/earendil-works/pi/blob/005af57d88ee23b33778f343a9595b32e67ff788/packages/coding-agent/src/extensions/codemode/tool.ts"
  - "https://github.com/earendil-works/pi/blob/005af57d88ee23b33778f343a9595b32e67ff788/packages/coding-agent/src/core/extensions/types.ts"
  - "https://github.com/earendil-works/pi/blob/005af57d88ee23b33778f343a9595b32e67ff788/packages/coding-agent/src/core/mcp-servers.ts"
  - "https://github.com/earendil-works/pi/blob/005af57d88ee23b33778f343a9595b32e67ff788/packages/coding-agent/CHANGELOG.md"
terms_used:
  - Codemode
  - MCP
  - QuickJS
  - Tool exposure
  - tool_search
  - structuredContent
status: reviewed
reviewed_by: Pify maintainers
last_updated: '2026-10-01'
---

# Use Codemode and MCP

Pi `0.99.2` can connect MCP servers and let the model compose Tool calls in `codemode`. This guide covers the operating boundary, not just setup: what the model can discover, when a server delays a prompt, where authentication may be stored, which permission hooks still run, and which failures Pi retries.

## Mental model

Keep three layers separate:

| Layer | What it does | What it does not grant |
| --- | --- | --- |
| `codemode` | Evaluates model-written JavaScript in a fresh QuickJS sandbox and exposes selected Tools through `tools` | Direct Node.js, filesystem, network, timer, or process access |
| Pi Tool pipeline | Validates arguments, runs `tool_call` and `tool_result` hooks, applies permission policy, and records Tool events | Safety merely because a call came from a sandbox |
| MCP connection | Discovers remote or local Tools and resources over stdio or streamable HTTP | Authorization to perform every operation advertised by the server |

QuickJS isolates model-written JavaScript from the host process, but Tool calls still use the host filesystem, network, credentials, and process permissions. A script can only reach those capabilities through Tools, yet those calls are real: completed side effects are not rolled back when a later statement fails.

Nested calls from Codemode traverse the same validation, hooks, and permission checks as model-issued calls. Treat the sandbox as a language/runtime boundary and the Tool pipeline as the security-policy boundary.

## Choose how Tools reach the model

Extension Tools have five exposure values. Keep this table separate from MCP server exposure because only the general Tool contract has `model-only`.

| Tool exposure | Declared to the model | Callable through another Tool | Intended use |
| --- | --- | --- | --- |
| `direct` | While active | While active | Ordinary Tools the model may call directly |
| `model-only` | While active | Never | Orchestrators or interactive Tools that must not recurse |
| `codemode` | Only when explicitly activated | Whenever registered | Tools normally reached from a Codemode script |
| `deferred` | After `tool_search` loads a match | Whenever registered | Large or uncommon Tool catalogs |
| `hidden` | Never | Never | Registered but intentionally unreachable |

MCP configuration accepts four values:

| MCP exposure | Behavior |
| --- | --- |
| `direct` | Declare the server Tool to the model and allow Codemode to call it |
| `codemode` | Default; keep declarations out of the request and discover/call them from Codemode |
| `deferred` | Keep declarations out until `tool_search` loads a match; Codemode can still call it |
| `hidden` | Register the Tool but make it unreachable |

`toolExposure` can override individual MCP Tools by exact name or `*` pattern. Exact names win; otherwise the first matching pattern wins. Exposure controls discoverability and callability, not authorization. Even a `direct` Tool must pass permission policy, while `annotations` are unverified hints rather than proof that an operation is safe.

Enable both indirect routes globally or in a trusted project's `.pi/settings.json`:

```json title="~/.pi/agent/settings.json"
{
  "defaultTools": ["+codemode", "+tool_search"]
}
```

For one invocation, remember that `--tools` replaces the selection, so name every Tool the session needs:

```bash
pi --tools read,bash,edit,write,codemode,tool_search
```

`tool_search` searches undeclared Tools and injects matching declarations for the next model call; the loaded declarations remain on that session branch. Codemode instead uses `searchTools()`, `describeTool()`, `describeNamespace()`, and `ALL_TOOLS` without injecting every schema into the model request up front. `/reload` activates entries newly added to `defaultTools`; removing an entry does not turn off an already active Tool, and a Tool manually disabled during the session stays off unless the entry is newly added. Explicit `--tools`, `--no-tools`, and `--no-builtin-tools` still override settings.

## Configure MCP servers

Use file configuration for servers that should return every session. Use `pi.registerMcpServer()` for a server owned by an Extension and scoped to its current session.

### Global and trusted-project configuration

Pi reads the global file at `~/.pi/agent/mcp.json` and the project file at `.pi/mcp.json`. A project entry replaces a global entry with the same name. Pi reads the project file only after project trust is granted, so review commands, URLs, environment interpolation, and project Extensions before trusting it.

Project trust is not a sandbox and is not authorization. It permits Pi to load project-controlled resources; it does not constrain a loaded stdio process, an HTTP server, or a later Tool call. Put personal servers and credentials in the global file. Keep only project-required, reviewable entries in `.pi/mcp.json`.

### stdio and streamable HTTP

The following global configuration starts one local stdio server and connects one streamable HTTP server:

```json title="~/.pi/agent/mcp.json"
{
  "mcpServers": {
    "workspace": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "."],
      "description": "Read approved workspace files",
      "exposure": "codemode"
    },
    "docs": {
      "url": "https://mcp.example.com/mcp",
      "description": "Search product documentation",
      "exposure": "deferred"
    }
  }
}
```

A stdio entry uses `command`, `args`, `env`, and `cwd`; `command` is one executable, not a shell command string. An HTTP entry uses `url`, `headers`, and authentication settings. Pi supports streamable HTTP, not legacy SSE. Both transports accept `timeout`, `enabled`, `exposure`, `toolExposure`, and `description`. Write `description` as a one-sentence capability summary: Pi shows it in the `mcp_servers` prompt section, uses it for Tool ranking, and returns it from `describeNamespace()`.

The CLI writes global configuration by default; add `--local` or `-l` for `.pi/mcp.json`. `add` writes configuration but does not prove the connection, so follow it with `list`:

```bash
pi mcp add workspace --description "Read approved workspace files" -- npx -y @modelcontextprotocol/server-filesystem .
pi mcp add docs --url https://mcp.example.com/mcp --exposure deferred --description "Search product documentation"
pi mcp list
pi
```

Inside a session, `/mcp` shows state, source, Tool count, effective exposure, errors, and the tail of stderr for a failed stdio server. It also supports sign-in, sign-out, reconnect, enable/disable, and exposure changes. After editing configuration outside the session, reload it:

```text
/mcp
/mcp login docs
/mcp reconnect docs
/reload
```

Pi connects enabled servers in the background. The first prompt waits up to ten seconds only for servers with `direct` Tools because those declarations must be present in the request. A Codemode script waits on demand for each server namespace it names; `searchTools()` and `ALL_TOOLS`, `tool_search`, and MCP resource Tools wait for all relevant servers.

Connection retries are bounded: HTTP network errors and transient 408, 429, and 5xx responses retry two times; resource reads and listings retry one time after those transient HTTP failures. A dropped connection becomes disconnected and reconnects on the next call.

Server names accept letters, digits, `_`, and `-`. Namespace normalization replaces hyphens with underscores, so `mcp__dev-radius` becomes `mcp__dev_radius`. When normalized Tool names collide, Pi gives every colliding Tool a stable hash suffix; server names that differ only by `-` and `_` are rejected instead of silently merging. Invalid entries are reported and skipped, while a file-configured server deliberately overrides an Extension registration of the same name.

### OAuth and provider-token authentication

For ordinary MCP OAuth, omit an `Authorization` header and use `/mcp login <server>` or `pi mcp login <server>`. Pi stores tokens in `~/.pi/agent/mcp-auth.json`, refreshes them when necessary, and deletes them on logout. If a server cannot dynamically register clients, configure its client ID, optional secret, callback, and scope. `oauth.clientName` changes the `client_name` used during dynamic registration; log out before signing in again under a different name.

Pi `0.99.2` also supports `auth.provider`, which sends the current `/login <provider>` token as a bearer token and reads it again for every request so refreshes apply:

```json title="~/.pi/agent/mcp.json"
{
  "mcpServers": {
    "figma": {
      "url": "https://mcp.figma.com/mcp",
      "oauth": { "clientName": "Claude Code" }
    },
    "private-api": {
      "url": "https://mcp.example.com/private",
      "auth": { "provider": "github" }
    }
  }
}
```

Provider-token authentication is prohibited in project `.pi/mcp.json`; use it only in the global file or from an Extension. Because it sends a provider credential to the configured URL, `auth.provider` requires HTTPS except for HTTP loopback hosts (`localhost`, `127.0.0.1`, or `[::1]`). OAuth callback URLs are the inverse special case: they must be HTTP on one of those loopback hosts. Keep client secrets and literal headers out of project configuration.

```bash
pi mcp add figma --url https://mcp.figma.com/mcp --oauth-client-name "Claude Code"
pi mcp login figma
pi mcp logout figma
```

For `auth.provider`, first authenticate that provider with `/login <provider>`, then reconnect the MCP server so the next request uses the current token.

## Discover and call Tools

Use `tool_search` when the model should call a matching Tool directly after discovery. Use Codemode when several calls should be composed, parallelized, or filtered before their output reaches the model. Codemode's declaration budget defaults to about 3,000 estimated tokens; deferred Tools never enter that description, and the discovery helpers find them on demand.

This script narrows discovery to one normalized MCP namespace, inspects its instructions, runs two independent calls, and returns a compact projection:

```javascript
const matches = await searchTools("find an issue by id", {
  namespace: "mcp__issues",
  limit: 5,
});
const namespace = await describeNamespace("mcp__issues");
const declaration = await describeTool(matches[0]?.name);
const available = ALL_TOOLS.filter((tool) =>
  tool.name.startsWith("mcp__issues__"),
);

const [issue, comments] = await Promise.all([
  tools.mcp__issues__get_issue({ id: "PI-992" }),
  tools.mcp__issues__list_comments({ id: "PI-992" }),
]);

text({
  server: namespace?.description,
  described: declaration !== undefined,
  discovered: available.length,
  issue: issue.structuredContent ?? issue.content,
  comments: comments.structuredContent ?? comments.content,
});
```

`searchTools()` ranks with BM25 and accepts `limit` plus `namespace`. `describeTool()` returns one Tool's description and declaration. `describeNamespace()` returns a namespace summary, MCP server instructions, and Tool names. The namespace lookup accepts forms such as `mcp__dev-radius`, `mcp__dev_radius`, `dev-radius`, and `dev_radius`. Reading `ALL_TOOLS` discovers every callable Tool but can wait for all MCP servers, so prefer a known Tool name or namespace when latency matters.

A Codemode script receives the full MCP `CallToolResult`, including `content`, `structuredContent`, and `isError`. Direct model output can be truncated, while a script receives the complete result and can reduce it before calling `text()` or `image()`. Top-level `return`, `text()`, `image()`, `console.*`, and `exit()` produce script output; unawaited work is cancelled when evaluation ends.

## Register MCP from an extension

An Extension can register a session-scoped server and a higher-level Tool that calls it. This example also shows the orchestration fields added in `0.99.0`:

```typescript title=".pi/extensions/issues.ts"
import { Type } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function issuesExtension(pi: ExtensionAPI): void {
  pi.registerMcpServer("issues", {
    url: "https://mcp.example.com/issues",
    description: "Read project issues",
    exposure: "deferred",
  });

  pi.registerTool({
    name: "issue_digest",
    label: "Issue digest",
    description: "Read one issue through the issues MCP server.",
    parameters: Type.Object({ id: Type.String() }),
    outputSchema: Type.Object({
      id: Type.String(),
      summary: Type.String(),
    }),
    exposure: "direct",
    namespace: {
      name: "project_workflows",
      description: "Curated project workflows",
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    prepareLoadout(loadout) {
      const available = loadout.callable.some(
        (tool) => tool.name === "mcp__issues__get_issue",
      );
      return {
        descriptions: {
          issue_digest: available
            ? "Read one issue through the issues MCP server."
            : "The issues MCP server is not callable.",
        },
      };
    },
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const outcome = await ctx.executeTool(
        "mcp__issues__get_issue",
        { id: params.id },
        { signal },
      );
      if (outcome.isError) {
        return {
          content: outcome.result.content,
          details: { nestedTool: "mcp__issues__get_issue" },
          isError: true,
        };
      }

      const summary = outcome.result.content
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join("\n");
      const data = { id: params.id, summary };
      return {
        content: [{ type: "text", text: summary }],
        structuredContent: data,
        details: { nestedTool: "mcp__issues__get_issue" },
      };
    },
  });
}
```

`pi.registerMcpServer()` uses the same config shape as an `mcpServers` entry, connects during `session_start` when registered during load, and connects immediately when registered later. The registration is not saved. A server from `mcp.json` with the same name wins; `pi mcp` shell commands do not load Extensions and therefore cannot see only-registered servers.

For a Tool, `namespace` groups related declarations; `annotations` expose read-only, destructive, idempotent, and open-world hints; `outputSchema` describes successful `structuredContent`; and `prepareLoadout()` can adjust model-facing descriptions or hide declarations as the active/callable set changes. None of those fields bypasses authorization.

`ctx.executeTool()` runs a nested call through validation, `tool_call` and `tool_result` hooks, permission checks, and execution events. Nested events carry `parentToolCallId`; their transcript does not gain separate Tool messages, but the parent result keeps a bounded `nestedCalls` record. An `AgentToolCallOutcome` reports Tool failures through `isError` instead of rejecting merely because the nested Tool failed.

## Preserve permission boundaries

Apply policy at the operation that creates the side effect:

| Boundary | Required control |
| --- | --- |
| Project load | Review `.pi/mcp.json` and Extensions before granting trust |
| Tool selection | Use exposure to limit discoverability, not as a permission decision |
| Tool execution | Gate sensitive calls in `tool_call`; fail closed when approval UI is unavailable |
| Arguments | Treat model-produced paths, URLs, commands, and identifiers as untrusted after schema validation |
| Credentials | Resolve them in the host; never put them in descriptions, model-facing `content`, logs, or project config |
| Side effects | Assume an earlier nested call remains committed if a later call or the script fails |

QuickJS removes direct host APIs from the script, but it cannot reduce the authority of a Tool implemented in the host process. A filesystem Tool can still write files, a shell Tool can start processes, and an MCP Tool can mutate a remote service under the credentials supplied to its server.

Permission handlers see both direct and nested calls. Inspect the effective Tool name, normalized arguments, current session context, and declared annotations; do not accept `readOnlyHint` or `idempotentHint` without trusting the Tool or server that supplied it. Keep destructive Tools `hidden` unless a workflow needs them, then require explicit approval near the call.

## Handle results, errors, and retries

A Tool result has three distinct layers:

| Field | Consumer | Meaning |
| --- | --- | --- |
| `content` | Model and UI | Text/image blocks that explain the outcome |
| `structuredContent` | Programmatic callers | Machine-readable value matching `outputSchema`; not sent to the model as a separate layer |
| `isError` | Agent loop and callers | Marks failure while preserving `content`, details, and structured data where present |

When any Tool declares `outputSchema` and its result supplies `structuredContent`, Codemode resolves the call to that `structuredContent` even when `isError: true`. MCP Tools use this rule to expose the complete `CallToolResult`, including `content`, `structuredContent`, and `isError`. Otherwise, a successful Tool resolves to combined text. Only other failures—an unknown Tool, invalid arguments, a blocked call, or a thrown execution error—throw an `Error` in the script. A failed script keeps partial output before `Script error:`, and earlier successful calls are not undone.

MCP Tool calls are not retried because a side effect may already have happened. Only the documented connection and resource-read paths use the bounded transient retries described above. Do not wrap an unknown mutation in a blind application retry; first establish idempotency with an operation key or read back state.

Common operational cases:

| Symptom | Check and action |
| --- | --- |
| `pi mcp list` exits `1` | Fix an invalid entry or enabled server that did not connect; use `/mcp` for the full error and stdio stderr tail |
| A non-direct Tool is never called | Ensure `codemode` or `tool_search` is active, check effective exposure in `/mcp`, then search the expected namespace |
| OAuth loops after changing `oauth.clientName` | Log out to remove the old registration, then log in again |
| `auth.provider` returns unauthorized | Run `/login <provider>`, verify the global/Extension config and HTTPS URL, then reconnect |
| A script times out after mutations | Inspect `nestedCalls` and remote state; do not assume rollback or replay the entire script |
| A result is too large | Filter inside Codemode; use the full result there and return only the model-relevant projection |
| A server drops | Let the next call reconnect; use `/mcp reconnect <server>` when diagnosing persistent failure |

## Operational checklist

- [ ] Put reusable personal servers and all provider-token configuration in `~/.pi/agent/mcp.json`.
- [ ] Review project MCP commands and URLs before granting project trust.
- [ ] Give every server a concise `description`; choose `direct` only when its schemas must be present on the first prompt.
- [ ] Use `codemode` for orchestration/filtering and `tool_search` for direct post-discovery calls.
- [ ] Validate with `pi mcp list`, inspect with `/mcp`, and run `/reload` after out-of-session edits.
- [ ] Install `tool_call` permission gates for filesystem, process, credential, destructive, and open-world operations.
- [ ] Preserve `content`, `structuredContent`, and `isError` consistently when a `tool_result` hook redacts or transforms output.
- [ ] Design mutation APIs for idempotency; never assume Pi retries MCP Tool calls.
- [ ] Test disconnected servers, expired credentials, timeouts, partial Codemode failure, denied nested calls, and oversized results.
- [ ] In SDK sessions, explicitly add the MCP, Codemode, and Tool-search built-in Extensions because SDK sessions do not load them automatically.

## Release-pinned sources

All behavior in this guide is pinned to release commit [`005af57d88ee23b33778f343a9595b32e67ff788`](https://github.com/earendil-works/pi/commit/005af57d88ee23b33778f343a9595b32e67ff788):

| Source | Evidence used |
| --- | --- |
| [`docs/mcp.md`](https://github.com/earendil-works/pi/blob/005af57d88ee23b33778f343a9595b32e67ff788/packages/coding-agent/docs/mcp.md) | Configuration, transports, exposure, discovery waits, OAuth, resources, permissions, retry limits, and Extension precedence |
| [`docs/cli.md`](https://github.com/earendil-works/pi/blob/005af57d88ee23b33778f343a9595b32e67ff788/packages/coding-agent/docs/cli.md) | Codemode runtime, helpers, `tool_search`, `--tools`, and `pi mcp` commands |
| [`codemode/index.ts`](https://github.com/earendil-works/pi/blob/005af57d88ee23b33778f343a9595b32e67ff788/packages/coding-agent/src/extensions/codemode/index.ts) | Built-in Extension activation and settings wiring |
| [`codemode/tool.ts`](https://github.com/earendil-works/pi/blob/005af57d88ee23b33778f343a9595b32e67ff788/packages/coding-agent/src/extensions/codemode/tool.ts) | QuickJS boundary, discovery helpers, declaration budget, result mapping, and Codemode loadout behavior |
| [`extensions/types.ts`](https://github.com/earendil-works/pi/blob/005af57d88ee23b33778f343a9595b32e67ff788/packages/coding-agent/src/core/extensions/types.ts) | Five Tool exposures, namespace/annotations/output schema, loadouts, nested-call events, and MCP registration API |
| [`mcp-servers.ts`](https://github.com/earendil-works/pi/blob/005af57d88ee23b33778f343a9595b32e67ff788/packages/coding-agent/src/core/mcp-servers.ts) | Four MCP exposures, config validation, namespace normalization, OAuth fields, and provider-token transport restrictions |
| [`CHANGELOG.md`](https://github.com/earendil-works/pi/blob/005af57d88ee23b33778f343a9595b32e67ff788/packages/coding-agent/CHANGELOG.md) | Introduction in `0.99.0` and the discovery, authentication, normalization, and reload changes in `0.99.2` |

Read the release pages separately for the shipped sequence: [`v0.99.0`](https://github.com/earendil-works/pi/releases/tag/v0.99.0), [`v0.99.1`](https://github.com/earendil-works/pi/releases/tag/v0.99.1), and [`v0.99.2`](https://github.com/earendil-works/pi/releases/tag/v0.99.2).
