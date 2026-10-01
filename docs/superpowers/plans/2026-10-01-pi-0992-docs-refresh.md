# Pi 0.99.2 Documentation Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the complete English/Vietnamese Pify documentation baseline from Pi `0.87.1` to the exact published Pi `0.99.2` release, add focused Codemode/MCP, Virtual Models, and experimental Durable Agent guides, and publish the verified result to GitHub and Vercel.

**Architecture:** Keep the existing Fumadocs application, routes, Course implementation, and centralized provenance policy. Treat the `v0.99.2` tag at commit `005af57d88ee23b33778f343a9595b32e67ff788` as immutable authority, encode release-sensitive claims in focused Node test contracts and TypeScript compile fixtures, and edit every English/Vietnamese pair as one semantic unit. Use `https://pi.dev/docs/latest` only to improve topic organization; all API claims and source links must resolve to the exact tag, published declarations, or release pages.

**Tech Stack:** Next.js 16, Fumadocs, MDX/Markdown, Node.js 22.19, TypeScript 6, Node test runner, Vitest, Playwright, npm, GitHub Actions, Vercel.

---

## Locked release facts

- Release: Pi `0.99.2`
- Tag: `v0.99.2`
- Commit: `005af57d88ee23b33778f343a9595b32e67ff788`
- Published: `2026-09-30T19:30:47Z`
- Node.js: `>=22.19.0`
- Included release chain: `v0.99.0`, `v0.99.1`, `v0.99.2`
- Previous documentation baseline: `0.87.1`
- Final bilingual inventory: 46 pairs, 92 public files, 11 How-to guides
- Direct release packages: `@earendil-works/pi-ai`, `@earendil-works/pi-agent-core`, `@earendil-works/pi-coding-agent`, `@earendil-works/pi-server`, `@earendil-works/pi-durable`, `@earendil-works/chord`

## File responsibility map

**Create**

- `scripts/fixtures/pi-release-0992.json`: immutable release identity used by active tests.
- `scripts/pi-release-0992-contract.test.mjs`: focused contracts for new `0.99.2` capabilities, guide semantics, package pins, and offline Durable behavior.
- `tests/fixtures/pi-coding-agent-0992.contract.ts`: public Coding Agent, Tool, MCP, and Virtual Model declaration contract.
- `tests/fixtures/pi-durable-0992.contract.ts`: public Durable/Chord declaration contract.
- `content/en/how-to/use-codemode-and-mcp.md` and `content/vi/how-to/use-codemode-and-mcp.md`: complete paired Codemode/MCP guide.
- `content/en/how-to/route-virtual-models.md` and `content/vi/how-to/route-virtual-models.md`: complete paired Virtual Models guide.
- `content/en/how-to/build-durable-agent.md` and `content/vi/how-to/build-durable-agent.md`: complete paired experimental Durable Agent guide.
- `docs/translation-review/2026-10-01-pi-0992.md`: 46-pair evidence ledger.

**Rename by adding the new path and deleting the old path with `apply_patch`**

- `tests/fixtures/pi-sdk-0871.contract.ts` to `tests/fixtures/pi-sdk-0992.contract.ts`.

**Delete after all references move**

- `scripts/fixtures/pi-release-0871.json`.
- `tests/fixtures/pi-sdk-0871.contract.ts`.

**Modify application and validation configuration**

- `package.json`, `package-lock.json`
- `README.md`, `CONTRIBUTING.md`
- `content/translation-manifest.json`
- `content/en/meta.json`, `content/vi/meta.json`
- `content/en/how-to/meta.json`, `content/vi/how-to/meta.json`
- `scripts/content.test.mjs`
- `scripts/course-content.test.mjs`
- `scripts/pi-release-contract.test.mjs`
- `scripts/pi-evals-guide.test.mjs`
- `scripts/validate-frontmatter.test.mjs`
- `scripts/validate-content.mjs`

**Audit and edit as paired content**

- Entry/help: `index.mdx`, `quickstart.md`, `glossary.md`, `help/faq.md`, `changelog.md`
- Existing How-to: `add-custom-tool.md`, `plug-new-model.md`, `stream-output.md`, `persist-sessions.md`, `customize-system-prompt.md`, `test-agent-deterministically.md`, `run-pi-evals.md`, `host-session-runtime.md`
- Reference: `reference/api.md`, `reference/configuration.md`, `reference/environment-variables.md`
- Chapters: `ch01-overview.md` through `ch11-testing-evaluation.md`
- Course: `course/index.mdx` and `course/00-complete-agent-trace.md` through `course/14-agent-evaluation.md`

Do not modify `D:\pi`. Read release evidence with `git -C D:\pi show v0.99.2:<path>` so post-tag `main` cannot leak into the documentation.

### Task 1: Create the isolated implementation worktree and record a clean baseline

**Files:**

- Verify only: `.gitignore`
- Verify only: `package-lock.json`

- [ ] **Step 1: Confirm the root checkout and ignored worktree location**

Run from `E:\project\pi-docs`:

```powershell
git status --short
git check-ignore -v .worktrees
git worktree list
```

Expected: the unrelated generated files and logs already present in the root checkout remain untracked; `.worktrees/` is ignored; no worktree exists for `docs/pi-0992-update`.

- [ ] **Step 2: Create the release branch in the ignored project-local worktree**

```powershell
$piDocsBranch = 'docs/pi-0992-update'
$piDocsWorktree = 'E:\project\pi-docs\.worktrees\pi-0992-update'
git worktree add $piDocsWorktree -b $piDocsBranch
Set-Location $piDocsWorktree
git status --short
```

Expected: the new worktree is on `docs/pi-0992-update` at the same commit as `main`, containing the approved design spec and this plan, and `git status --short` is empty.

- [ ] **Step 3: Install the locked baseline without changing dependencies**

```powershell
npm ci
node --version
npm --version
```

Expected: install succeeds, Node reports `v22.19.0` or a later Node 22 release, and npm does not rewrite `package-lock.json`.

- [ ] **Step 4: Run the pre-change quality baseline**

```powershell
npm run quality:content
npm run typecheck
```

Expected: both commands pass against the existing `0.87.1` documentation. Record any environmental failure before editing; do not weaken a test to accommodate it.

### Task 2: Pin immutable Pi 0.99.2 release authority and all six direct packages

**Files:**

- Create: `scripts/fixtures/pi-release-0992.json`
- Create: `scripts/pi-release-0992-contract.test.mjs`
- Delete: `scripts/fixtures/pi-release-0871.json`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `scripts/pi-release-contract.test.mjs`

- [ ] **Step 1: Write the failing release identity and dependency tests**

Create `scripts/pi-release-0992-contract.test.mjs` with this foundation:

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

import ts from "typescript";

const repositoryRoot = new URL("../", import.meta.url);
const releaseFixtureURL = new URL(
  "fixtures/pi-release-0992.json",
  import.meta.url,
);
const releasePackages = [
  "@earendil-works/pi-ai",
  "@earendil-works/pi-agent-core",
  "@earendil-works/pi-coding-agent",
  "@earendil-works/pi-server",
  "@earendil-works/pi-durable",
  "@earendil-works/chord",
];
const expectedRelease = {
  packageVersion: "0.99.2",
  tag: "v0.99.2",
  commit: "005af57d88ee23b33778f343a9595b32e67ff788",
  publishedAt: "2026-09-30T19:30:47Z",
  nodeRequirement: ">=22.19.0",
  previousDocumentationVersion: "0.87.1",
  includedReleaseTags: ["v0.99.0", "v0.99.1", "v0.99.2"],
  sourceStatus: "published",
};

async function readJson(url) {
  return JSON.parse(await readFile(url, "utf8"));
}

test("release fixture identifies the exact published Pi 0.99.2 authority", async () => {
  assert.deepEqual(await readJson(releaseFixtureURL), expectedRelease);
});

test("all direct Pi release packages are pinned to exact 0.99.2", async () => {
  const packageJson = await readJson(new URL("package.json", repositoryRoot));
  for (const packageName of releasePackages) {
    assert.equal(packageJson.devDependencies[packageName], "0.99.2");
  }
});
```

- [ ] **Step 2: Run the focused test and observe the baseline failure**

```powershell
node --test scripts/pi-release-0992-contract.test.mjs
```

Expected: FAIL because `pi-release-0992.json` does not exist and the dependency pins are still `0.87.1` or absent.

- [ ] **Step 3: Add the exact release fixture**

Create `scripts/fixtures/pi-release-0992.json` with:

```json
{
  "packageVersion": "0.99.2",
  "tag": "v0.99.2",
  "commit": "005af57d88ee23b33778f343a9595b32e67ff788",
  "publishedAt": "2026-09-30T19:30:47Z",
  "nodeRequirement": ">=22.19.0",
  "previousDocumentationVersion": "0.87.1",
  "includedReleaseTags": ["v0.99.0", "v0.99.1", "v0.99.2"],
  "sourceStatus": "published"
}
```

- [ ] **Step 4: Install all release packages at exact version 0.99.2**

```powershell
npm install --save-dev --save-exact '@earendil-works/pi-ai@0.99.2' '@earendil-works/pi-agent-core@0.99.2' '@earendil-works/pi-coding-agent@0.99.2' '@earendil-works/pi-server@0.99.2' '@earendil-works/pi-durable@0.99.2' '@earendil-works/chord@0.99.2'
```

Expected: `package.json` contains all six exact pins, `package-lock.json` is regenerated by npm, and the existing Node engine remains `>=22.19 <23`.

- [ ] **Step 5: Move the active legacy release-test authority to the new fixture**

In `scripts/pi-release-contract.test.mjs`:

- change `fixtures/pi-release-0871.json` to `fixtures/pi-release-0992.json`;
- add `@earendil-works/pi-durable` and `@earendil-works/chord` to `releaseContractPackages`;
- change the release-identity assertions to the exact values in `expectedRelease`;
- make the active release list exactly `v0.99.0`, `v0.99.1`, `v0.99.2`;
- retain older version strings only inside tests that explicitly exercise historical changelog or migration text.

Delete `scripts/fixtures/pi-release-0871.json` after `rg -n "pi-release-0871" scripts tests content README.md CONTRIBUTING.md` returns no active reference.

- [ ] **Step 6: Add the focused suite to the release script**

Set the script to:

```json
"test:release": "node --test scripts/pi-release-contract.test.mjs scripts/pi-release-0992-contract.test.mjs"
```

- [ ] **Step 7: Verify the focused release tests**

```powershell
node --test scripts/pi-release-0992-contract.test.mjs
npm ls '@earendil-works/pi-ai' '@earendil-works/pi-agent-core' '@earendil-works/pi-coding-agent' '@earendil-works/pi-server' '@earendil-works/pi-durable' '@earendil-works/chord'
```

Expected: the focused tests pass and every listed package resolves to `0.99.2`. The older broad release suite may remain red until the paired content contracts are migrated in Tasks 7–11.

- [ ] **Step 8: Commit the release authority**

```powershell
git add package.json package-lock.json scripts/fixtures/pi-release-0992.json scripts/fixtures/pi-release-0871.json scripts/pi-release-contract.test.mjs scripts/pi-release-0992-contract.test.mjs
git commit -m "test: pin Pi 0.99.2 release authority"
```

### Task 3: Move core coverage to 0.99.2 and add focused compile contracts

**Files:**

- Create: `tests/fixtures/pi-sdk-0992.contract.ts`
- Create: `tests/fixtures/pi-coding-agent-0992.contract.ts`
- Create: `tests/fixtures/pi-durable-0992.contract.ts`
- Delete: `tests/fixtures/pi-sdk-0871.contract.ts`
- Modify: `scripts/pi-release-contract.test.mjs`
- Modify: `scripts/pi-release-0992-contract.test.mjs`
- Modify: `content/en/ch11-testing-evaluation.md`
- Modify: `content/vi/ch11-testing-evaluation.md`
- Modify: `content/en/how-to/test-agent-deterministically.md`
- Modify: `content/vi/how-to/test-agent-deterministically.md`
- Modify: `content/en/how-to/host-session-runtime.md`
- Modify: `content/vi/how-to/host-session-runtime.md`

- [ ] **Step 1: Add a compile helper and three failing fixture tests**

Append this helper and loop to `scripts/pi-release-0992-contract.test.mjs`:

```js
function assertTypeScriptFixtureCompiles(relativePath) {
  const fixturePath = fileURLToPath(new URL(relativePath, repositoryRoot));
  const program = ts.createProgram([fixturePath], {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    esModuleInterop: true,
    types: ["node"],
  });
  const diagnostics = ts.getPreEmitDiagnostics(program);
  assert.equal(
    diagnostics.length,
    0,
    ts.formatDiagnostics(diagnostics, {
      getCanonicalFileName: (fileName) => fileName,
      getCurrentDirectory: () => fileURLToPath(repositoryRoot),
      getNewLine: () => "\n",
    }),
  );
}

for (const fixture of [
  "tests/fixtures/pi-sdk-0992.contract.ts",
  "tests/fixtures/pi-coding-agent-0992.contract.ts",
  "tests/fixtures/pi-durable-0992.contract.ts",
]) {
  test(`${fixture} compiles against published Pi 0.99.2 declarations`, () => {
    assertTypeScriptFixtureCompiles(fixture);
  });
}
```

- [ ] **Step 2: Run the compile contracts and observe missing-fixture failures**

```powershell
node --test --test-name-pattern="compiles against published Pi 0.99.2" scripts/pi-release-0992-contract.test.mjs
```

Expected: FAIL for each new fixture path.

- [ ] **Step 3: Move the existing core fixture and update synchronized references**

Use `apply_patch` to add `tests/fixtures/pi-sdk-0992.contract.ts` with the complete content of the old fixture, then delete `tests/fixtures/pi-sdk-0871.contract.ts`. Update every fixture path and active baseline label in `scripts/pi-release-contract.test.mjs`, Chapter 11, the deterministic testing guide, and the session-runtime guide from `pi-sdk-0871.contract.ts` to `pi-sdk-0992.contract.ts`.

Keep the deterministic faux-provider execution, watchdog cleanup, external-session restoration, and runtime-host checks intact. Update only declarations that the installed `0.99.2` compiler proves have changed.

- [ ] **Step 4: Add the Coding Agent/Codemode/MCP/Virtual Models fixture**

Create `tests/fixtures/pi-coding-agent-0992.contract.ts`:

```ts
import { Type } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const LookupParameters = Type.Object({ query: Type.String() });
const LookupOutput = Type.Object({ matches: Type.Array(Type.String()) });

export function registerPi0992ExtensionContracts(pi: ExtensionAPI): void {
  pi.registerMcpServer("docs", {
    url: "https://mcp.example.com/docs",
    description: "Search release-pinned product documentation.",
    exposure: "codemode",
    oauth: { clientName: "Pify Docs" },
  });
  pi.registerMcpServer("artifacts", {
    url: "https://mcp.example.com/artifacts",
    description: "Read build artifacts with the configured provider token.",
    exposure: "deferred",
    auth: { provider: "openai" },
  });

  pi.registerTool({
    name: "docs_lookup",
    label: "Documentation lookup",
    description: "Find a release-pinned documentation topic.",
    parameters: LookupParameters,
    outputSchema: LookupOutput,
    exposure: "codemode",
    namespace: {
      name: "docs",
      description: "Documentation utilities",
      instructions: "Use exact package and API identifiers in queries.",
    },
    annotations: { readOnlyHint: true, idempotentHint: true },
    defaultActive: false,
    prepareLoadout(loadout) {
      return {
        descriptions: {
          docs_lookup: `Search documentation with ${loadout.callable.length} callable Tools available.`,
        },
      };
    },
    async execute(_toolCallId, { query }, signal, _onUpdate, ctx) {
      const nested = await ctx.executeTool(
        "read",
        { path: query },
        { signal },
      );
      return {
        content: [
          {
            type: "text",
            text: nested.isError
              ? `Lookup failed for ${query}`
              : `Lookup finished for ${query}`,
          },
        ],
        details: { nestedIsError: nested.isError },
        structuredContent: { matches: nested.isError ? [] : [query] },
        isError: nested.isError,
      };
    },
  });

  pi.registerVirtualModel<{ phase: "plan" | "build" }>({
    provider: "router",
    id: "auto",
    name: "Auto",
    thinkingLevels: ["low", "high"],
    route(request, ctx) {
      const sticky = request.failed ?? request.previous;
      if (request.reason !== "user" && sticky) {
        return {
          model: sticky.model,
          thinkingLevel: sticky.thinkingLevel ?? "medium",
        };
      }
      const model = ctx.modelRegistry.find("openai", "gpt-6.1-sol");
      if (!model) throw new Error("openai/gpt-6.1-sol is unavailable");
      return {
        model,
        thinkingLevel: "medium",
        state: request.state ?? { phase: "plan" },
      };
    },
  });
}
```

- [ ] **Step 5: Add the Durable/Chord fixture**

Create `tests/fixtures/pi-durable-0992.contract.ts`:

```ts
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { createModels } from "@earendil-works/pi-ai/models";
import {
  createRegistry,
  Harness,
  MemoryStorage,
  type Conversation,
} from "@earendil-works/pi-durable";

export async function verifyPi0992DurableContracts(): Promise<number> {
  const context = BACKGROUND_CONTEXT;
  const harness = await Harness.open(
    new MemoryStorage(),
    { models: createModels(), registry: createRegistry() },
    context,
  );
  try {
    const root: Conversation = await harness.root(context);
    await root.setCompaction(
      {
        enabled: true,
        reserveTokens: 16_384,
        keepRecentTokens: 20_000,
        backgroundTokens: 32_768,
      },
      context,
    );
    const view = await root.viewState(context);
    view.dispose();
    return root.id;
  } finally {
    await harness.close(context);
  }
}
```

- [ ] **Step 6: Add an offline Durable runtime test**

Append to `scripts/pi-release-0992-contract.test.mjs`:

```js
test("Durable Harness opens, observes, and closes in memory without network access", async () => {
  const [{ BACKGROUND_CONTEXT }, { createModels }, durable] =
    await Promise.all([
      import("@earendil-works/chord/context"),
      import("@earendil-works/pi-ai/models"),
      import("@earendil-works/pi-durable"),
    ]);
  const harness = await durable.Harness.open(
    new durable.MemoryStorage(),
    { models: createModels(), registry: durable.createRegistry() },
    BACKGROUND_CONTEXT,
  );
  try {
    const root = await harness.root(BACKGROUND_CONTEXT);
    const view = await root.viewState(BACKGROUND_CONTEXT);
    assert.equal(root.id, 1);
    view.dispose();
  } finally {
    await harness.close(BACKGROUND_CONTEXT);
  }
});
```

- [ ] **Step 7: Run compile, runtime, and repository type checks**

```powershell
node --test scripts/pi-release-0992-contract.test.mjs
npm run typecheck
```

Expected: the three fixtures compile, the in-memory Durable test passes without credentials or network traffic, and repository type checking passes.

- [ ] **Step 8: Commit the compile contracts**

```powershell
git add tests/fixtures scripts/pi-release-contract.test.mjs scripts/pi-release-0992-contract.test.mjs content/en/ch11-testing-evaluation.md content/vi/ch11-testing-evaluation.md content/en/how-to/test-agent-deterministically.md content/vi/how-to/test-agent-deterministically.md content/en/how-to/host-session-runtime.md content/vi/how-to/host-session-runtime.md
git commit -m "test: compile Pi 0.99.2 public contracts"
```

### Task 4: Add the complete Codemode and MCP guide pair

**Files:**

- Create: `content/en/how-to/use-codemode-and-mcp.md`
- Create: `content/vi/how-to/use-codemode-and-mcp.md`
- Modify: `scripts/pi-release-0992-contract.test.mjs`

- [ ] **Step 1: Write the failing paired semantic contract**

Add helper functions and the guide contract to `scripts/pi-release-0992-contract.test.mjs`:

```js
async function readGuide(locale, slug) {
  return readFile(
    new URL(`content/${locale}/how-to/${slug}.md`, repositoryRoot),
    "utf8",
  );
}

function headingShape(markdown) {
  return [...markdown.matchAll(/^(#{1,6})\s+.+$/gm)].map(
    (match) => match[1].length,
  );
}

function codeFenceCount(markdown) {
  return [...markdown.matchAll(/^```/gm)].length / 2;
}

test("Codemode and MCP guides preserve paired structure and safety boundaries", async () => {
  const [english, vietnamese] = await Promise.all([
    readGuide("en", "use-codemode-and-mcp"),
    readGuide("vi", "use-codemode-and-mcp"),
  ]);
  assert.deepEqual(headingShape(english), headingShape(vietnamese));
  assert.equal(codeFenceCount(english), codeFenceCount(vietnamese));
  for (const source of [english, vietnamese]) {
    for (const token of [
      "QuickJS",
      "tool_search",
      "searchTools()",
      "describeTool()",
      "describeNamespace()",
      "ALL_TOOLS",
      "registerMcpServer",
      "oauth.clientName",
      "auth.provider",
      "structuredContent",
      "prepareLoadout()",
      "ctx.executeTool()",
      "parentToolCallId",
      "nestedCalls",
    ]) {
      assert.ok(source.includes(token), `missing ${token}`);
    }
    assert.match(source, /direct[\s\S]*model-only[\s\S]*codemode[\s\S]*deferred[\s\S]*hidden/);
    assert.match(source, /MCP Tool call[\s\S]{0,500}(?:not retried|không retry)/i);
    assert.match(source, /(?:connection|kết nối)[\s\S]{0,500}(?:resource read|đọc resource)[\s\S]{0,500}(?:bounded|giới hạn)/i);
    assert.match(source, /QuickJS[\s\S]{0,800}(?:host process|tiến trình host|filesystem|process permissions)/i);
    assert.match(source, /project trust[\s\S]{0,500}(?:not|không)[\s\S]{0,200}(?:sandbox|authorization|ủy quyền)/i);
  }
});
```

- [ ] **Step 2: Run the focused test and observe missing-page failure**

```powershell
node --test --test-name-pattern="Codemode and MCP guides" scripts/pi-release-0992-contract.test.mjs
```

Expected: FAIL because both guide files are absent.

- [ ] **Step 3: Write both guides with identical technical structure**

Use these section structures, keeping code blocks byte-identical across locales:

English:

```markdown
# Use Codemode and MCP
## Mental model
## Choose how Tools reach the model
## Configure MCP servers
### Global and trusted-project configuration
### stdio and streamable HTTP
### OAuth and provider-token authentication
## Discover and call Tools
## Register MCP from an extension
## Preserve permission boundaries
## Handle results, errors, and retries
## Operational checklist
## Release-pinned sources
```

Vietnamese:

```markdown
# Sử dụng Codemode và MCP
## Mô hình tư duy
## Chọn cách model tiếp cận Tool
## Cấu hình MCP server
### Cấu hình global và trusted project
### stdio và streamable HTTP
### OAuth và xác thực bằng provider token
## Khám phá và gọi Tool
## Đăng ký MCP từ extension
## Giữ nguyên permission boundary
## Xử lý kết quả, lỗi và retry
## Checklist vận hành
## Nguồn được ghim theo release
```

The paired prose must establish these exact relationships:

- Codemode runs model-written JavaScript in QuickJS, but called Tools retain the host process's permissions and side effects.
- `tool_search` loads deferred Tool declarations; Codemode uses `searchTools()`, `describeTool()`, `describeNamespace()`, and `ALL_TOOLS` without injecting every schema up front.
- Tool exposure defines discoverability/callability, not authorization. Explain all five Tool exposures and the four MCP exposures separately.
- Global `mcp.json` and trusted project `mcp.json` have distinct trust implications. Project trust governs loading; it is not a Tool-call sandbox.
- MCP supports stdio and streamable HTTP. Cover CLI and `/mcp`, `description`, `oauth.clientName`, and `auth.provider`; provider-token auth is prohibited in project config and requires HTTPS except loopback.
- The first prompt waits only for servers exposing `direct` Tools. Codemode, Tool search, and resource reads await other servers when needed.
- MCP Tool calls are not retried because a side effect may already have happened. Only documented connection and resource-read paths use bounded transient retries.
- Namespace normalization replaces hyphens, resolves collisions with a stable hash, and rejects invalid cases rather than silently merging servers.
- `/reload` can activate newly added `defaultTools` entries.
- Extension Tool results distinguish model-facing `content`, machine-readable `structuredContent`, and `isError`; nested calls traverse validation, hooks, and permission checks and appear under `parentToolCallId`/bounded `nestedCalls`.

Use exact source links under commit `005af57d88ee23b33778f343a9595b32e67ff788` for `packages/coding-agent/docs/mcp.md`, `packages/coding-agent/src/extensions/codemode/index.ts`, `packages/coding-agent/src/extensions/codemode/tool.ts`, `packages/coding-agent/src/core/extensions/types.ts`, and `packages/coding-agent/src/core/mcp-servers.ts`. Link the three GitHub release pages separately. Do not use `main` or `/latest` as technical authority.

- [ ] **Step 4: Verify the pair and content formatting**

```powershell
node --test --test-name-pattern="Codemode and MCP guides" scripts/pi-release-0992-contract.test.mjs
npx prettier --check content/en/how-to/use-codemode-and-mcp.md content/vi/how-to/use-codemode-and-mcp.md scripts/pi-release-0992-contract.test.mjs
```

Expected: focused test and Prettier pass.

- [ ] **Step 5: Commit the Codemode/MCP guide**

```powershell
git add content/en/how-to/use-codemode-and-mcp.md content/vi/how-to/use-codemode-and-mcp.md scripts/pi-release-0992-contract.test.mjs
git commit -m "docs: add Pi 0.99.2 Codemode and MCP guide"
```

### Task 5: Add the complete Virtual Models guide pair

**Files:**

- Create: `content/en/how-to/route-virtual-models.md`
- Create: `content/vi/how-to/route-virtual-models.md`
- Modify: `scripts/pi-release-0992-contract.test.mjs`

- [ ] **Step 1: Write the failing selected-versus-physical model contract**

Append:

```js
test("Virtual Model guides separate selection, dispatch, state, and accounting", async () => {
  const [english, vietnamese] = await Promise.all([
    readGuide("en", "route-virtual-models"),
    readGuide("vi", "route-virtual-models"),
  ]);
  assert.deepEqual(headingShape(english), headingShape(vietnamese));
  assert.equal(codeFenceCount(english), codeFenceCount(vietnamese));
  for (const source of [english, vietnamese]) {
    for (const token of [
      "registerVirtualModel",
      "ModelRouteReason",
      "user",
      "continuation",
      "retry",
      "direct",
      "request.previous",
      "request.failed",
      "request.state",
      "gpt-6.1-sol",
    ]) {
      assert.ok(source.includes(token), `missing ${token}`);
    }
    assert.match(source, /virtual model[\s\S]{0,500}physical model/i);
    assert.match(source, /assistant message[\s\S]{0,400}physical model/i);
    assert.match(source, /JSON-serializable|JSON serializable/i);
    assert.match(source, /direct[\s\S]{0,500}(?:ignore|bỏ qua)[\s\S]{0,150}state/i);
    assert.match(source, /(?:cost|chi phí)[\s\S]{0,500}(?:physical|vật lý)/i);
    assert.match(source, /(?:does not guarantee|không bảo đảm)[\s\S]{0,250}(?:optimal|tối ưu)/i);
  }
});
```

- [ ] **Step 2: Run the test and observe missing-page failure**

```powershell
node --test --test-name-pattern="Virtual Model guides" scripts/pi-release-0992-contract.test.mjs
```

Expected: FAIL because the pair does not exist.

- [ ] **Step 3: Write both guides with this paired structure**

```markdown
# Route requests with Virtual Models
## Selection and dispatch
## Register a virtual model
## Route user, continuation, retry, and direct requests
## Keep sticky turns and retries correct
## Persist JSON router state
## Restore sessions and branches
## Account for context, compaction, and cost
## Use classifier and image operations deliberately
## Failure modes and operational checklist
## Release-pinned sources
```

The Vietnamese page translates headings naturally but keeps the same levels, order, code, tables, and identifiers. Copy the `registerVirtualModel` example from `tests/fixtures/pi-coding-agent-0992.contract.ts` into both pages and explain:

- selection stores the virtual provider/model and selected thinking level;
- dispatch sends only the physical model/level to the provider and records that pair on assistant messages;
- `continuation` should normally use `request.previous`, while `retry` should normally use `request.failed`, to preserve prompt caches and thinking signatures;
- `direct` is outside the agent loop, receives no router state, and ignores returned state;
- state must be JSON-serializable, follows the branch, survives compaction, and is stored before dispatch even if the request later fails;
- session resume restores a registered virtual selection, otherwise it falls back to the latest physical response;
- context limits, compaction, usage, and cost follow the physical response/dispatch where the release does so;
- a router may use classifier operations, but the guide does not claim routing is optimal;
- image generation and classifier operations are separate ModelRuntime operations and must not be presented as chat models or chat-only accessors.

Use pinned links to `packages/coding-agent/docs/virtual-models.md`, `packages/coding-agent/src/core/virtual-models.ts`, `packages/ai/src/models.ts`, and the exact release pages.

- [ ] **Step 4: Verify the pair**

```powershell
node --test --test-name-pattern="Virtual Model guides" scripts/pi-release-0992-contract.test.mjs
npx prettier --check content/en/how-to/route-virtual-models.md content/vi/how-to/route-virtual-models.md
```

Expected: focused semantic and formatting checks pass.

- [ ] **Step 5: Commit the Virtual Models guide**

```powershell
git add content/en/how-to/route-virtual-models.md content/vi/how-to/route-virtual-models.md scripts/pi-release-0992-contract.test.mjs
git commit -m "docs: add Pi 0.99.2 Virtual Models guide"
```

### Task 6: Add the complete experimental Durable Agent guide pair

**Files:**

- Create: `content/en/how-to/build-durable-agent.md`
- Create: `content/vi/how-to/build-durable-agent.md`
- Modify: `scripts/pi-release-0992-contract.test.mjs`

- [ ] **Step 1: Write the failing Durable semantic contract**

Append:

```js
test("Durable guides preserve replay, cancellation, ownership, and storage boundaries", async () => {
  const [english, vietnamese] = await Promise.all([
    readGuide("en", "build-durable-agent"),
    readGuide("vi", "build-durable-agent"),
  ]);
  assert.deepEqual(headingShape(english), headingShape(vietnamese));
  assert.equal(codeFenceCount(english), codeFenceCount(vietnamese));
  for (const source of [english, vietnamese]) {
    for (const token of [
      "Experimental",
      "Harness",
      "Conversation",
      "Entry",
      "Commit",
      "Document",
      "Task",
      "Submission",
      "Registry",
      "requestId",
      'replay: "safe"',
      "MemoryStorage",
      "openNodeSqliteStorage",
      "openNodeJsonlStorage",
    ]) {
      assert.ok(source.includes(token), `missing ${token}`);
    }
    assert.match(source, /cancel(?:ling)?[\s\S]{0,300}wait[\s\S]{0,300}(?:does not cancel|không hủy)[\s\S]{0,200}(?:work|công việc)/i);
    assert.match(source, /replay: "safe"[\s\S]{0,500}(?:rerun|chạy lại)/i);
    assert.match(source, /background[\s\S]{0,400}abort boundary/i);
    assert.match(source, /bottom-up|từ dưới lên/i);
    assert.match(source, /one process[\s\S]{0,300}(?:storage|lưu trữ)[\s\S]{0,300}(?:no cross-process locking|không có cross-process locking)/i);
    assert.match(source, /(?:not|không)[\s\S]{0,250}(?:replacement|thay thế)[\s\S]{0,250}(?:Agent Core|SessionManager)/i);
  }
});
```

- [ ] **Step 2: Run the test and observe missing-page failure**

```powershell
node --test --test-name-pattern="Durable guides" scripts/pi-release-0992-contract.test.mjs
```

Expected: FAIL because the guide pair is absent.

- [ ] **Step 3: Write both guides with this paired structure**

```markdown
# Build an experimental Durable Agent
## Status and when to use it
## Mental model: Harness, Conversation, and run
## Open an in-memory Harness
## Submit input and commit immutable Entries
## Persist Documents and Tasks atomically
## Recover work and deduplicate requests
## Declare Tool replay policy
## Schedule the inbox and reset context
## Compact without losing durable work
## Observe views, events, and hooks
## Fork conversations and structure subagents
## Choose foreground or background ownership
## Track usage and choose storage
## Failure modes and operational checklist
## Release-pinned sources
```

Use a visible `Experimental` callout near the top. Copy the in-memory compile-checked Harness example from `tests/fixtures/pi-durable-0992.contract.ts`, then add this second example byte-identically to both locales:

```ts
import { AssistantEntry } from "@earendil-works/pi-durable";

const submission = await root.submit(
  {
    type: "input",
    content: "What is the capital of France?",
    requestId: "capital-france-1",
  },
  context,
);
const settled = await submission.wait(context);
if (settled.status === "done" && settled.type === "input") {
  const answer = await root.commit(
    (tx) => tx.entry(AssistantEntry, settled.answer),
    context,
  );
  console.log(answer?.model?.[0]);
}
```

Both locales must state:

- a Turn is one model response plus Tool calls; a run spans the turns from admitted input to final answer;
- commits atomically persist Entries, Documents, and Tasks before observers see them;
- resubmitting the same `requestId` returns the existing Submission;
- cancelling a Chord wait cancels only the wait, never durable work;
- only a Tool declared with `replay: "safe"` may rerun after interruption; persistence alone cannot make arbitrary side effects safe;
- inbox queueing, reset, compaction, structural views, experimental events, hooks, and forks have separate roles;
- foreground child work belongs to its parent Task; background Tasks establish an abort boundary; abort proceeds bottom-up;
- Memory, Node SQLite, and Node JSONL have different durability; one process owns a storage instance and there is no cross-process locking;
- `@earendil-works/pi-durable` is experimental and is not a mandatory replacement for Agent Core or SessionManager.

Use pinned links to `packages/durable/README.md`, `packages/durable/src/index.ts`, `packages/durable/src/harness/harness.ts`, `packages/durable/src/harness/types.ts`, `packages/durable/src/tasks.ts`, `packages/durable/src/storage/memory.ts`, `packages/durable/src/storage/sqlite/node.ts`, `packages/durable/src/storage/jsonl/node.ts`, `packages/chord/src/context/index.ts`, and the exact release page.

- [ ] **Step 4: Verify the pair**

```powershell
node --test --test-name-pattern="Durable guides" scripts/pi-release-0992-contract.test.mjs
npx prettier --check content/en/how-to/build-durable-agent.md content/vi/how-to/build-durable-agent.md
```

Expected: the safety contract and formatting pass.

- [ ] **Step 5: Commit the Durable guide**

```powershell
git add content/en/how-to/build-durable-agent.md content/vi/how-to/build-durable-agent.md scripts/pi-release-0992-contract.test.mjs
git commit -m "docs: add experimental Pi Durable Agent guide"
```

### Task 7: Integrate the three routes and publish the 0.99.2 entry-point story

**Files:**

- Modify: `content/translation-manifest.json`
- Modify: `content/en/how-to/meta.json`
- Modify: `content/vi/how-to/meta.json`
- Modify: `README.md`
- Modify: `CONTRIBUTING.md`
- Modify: `content/en/index.mdx`
- Modify: `content/vi/index.mdx`
- Modify: `content/en/glossary.md`
- Modify: `content/vi/glossary.md`
- Modify: `content/en/help/faq.md`
- Modify: `content/vi/help/faq.md`
- Modify: `content/en/changelog.md`
- Modify: `content/vi/changelog.md`
- Modify: `scripts/content.test.mjs`
- Modify: `scripts/validate-frontmatter.test.mjs`
- Modify: `scripts/validate-content.mjs`
- Modify: `scripts/pi-release-0992-contract.test.mjs`
- Modify: `tests/seo.test.ts`
- Modify: `tests/e2e/docs.spec.ts`

- [ ] **Step 1: Update count/navigation tests before the manifest**

Change the hard-coded expectations in `scripts/content.test.mjs` and `scripts/validate-frontmatter.test.mjs` to:

```js
assert.equal(manifest.pages.length, 46);
assert.match(readme, /eleven How-to guides/i);
assert.match(readme, /46 synchronized[^\r\n]*92 public documents/i);
assert.match(contributing, /validates all 92 public files/);
assert.match(stdout, /Validated 92 public content files/);
```

Add assertions that both How-to navigation arrays contain this exact ordered suffix:

```js
[
  "use-codemode-and-mcp",
  "route-virtual-models",
  "build-durable-agent",
]
```

Add three manifest assertions for keys `how-to-use-codemode-and-mcp`, `how-to-route-virtual-models`, and `how-to-build-durable-agent`, with matching EN/VI relative paths.

In `tests/seo.test.ts`, change both total expectations to 92, both per-locale expectations to 46, and add exact-path assertions for `/en/how-to/use-codemode-and-mcp`, `/vi/how-to/route-virtual-models`, and `/vi/how-to/build-durable-agent`.

In `tests/e2e/docs.spec.ts`, change sitemap/path counts from 86 to 92 and each `llms.txt` entry count from 43 to 46. Add this route test:

```ts
test("renders every new Pi 0.99.2 guide in both locales", async ({ page }) => {
  for (const slug of [
    "use-codemode-and-mcp",
    "route-virtual-models",
    "build-durable-agent",
  ]) {
    for (const locale of ["en", "vi"]) {
      const response = await page.goto(`/${locale}/how-to/${slug}`);
      expect(response?.ok()).toBe(true);
      await expect(page.locator("main h1")).toBeVisible();
      const targetLocale = locale === "en" ? "vi" : "en";
      await expect(
        page.locator(`link[rel="alternate"][hreflang="${targetLocale}"]`),
      ).toHaveAttribute(
        "href",
        `${publicDocsOrigin}/${targetLocale}/how-to/${slug}`,
      );
    }
  }
});
```

- [ ] **Step 2: Observe the inventory failure**

```powershell
npm run test:content
```

Expected: FAIL on 43/46 pairs, 86/92 public files, eight/eleven How-to guides, and missing navigation routes.

- [ ] **Step 3: Add the manifest and navigation entries**

Append these records after `how-to-host-session-runtime` in `content/translation-manifest.json`:

```json
{ "key": "how-to-use-codemode-and-mcp", "group": "how-to", "en": "how-to/use-codemode-and-mcp.md", "vi": "how-to/use-codemode-and-mcp.md" },
{ "key": "how-to-route-virtual-models", "group": "how-to", "en": "how-to/route-virtual-models.md", "vi": "how-to/route-virtual-models.md" },
{ "key": "how-to-build-durable-agent", "group": "how-to", "en": "how-to/build-durable-agent.md", "vi": "how-to/build-durable-agent.md" }
```

Append the same route names in the same order to both `content/en/how-to/meta.json` and `content/vi/how-to/meta.json`. Do not change existing route slugs or top-level navigation.

- [ ] **Step 4: Update README and contributor inventory**

In `README.md`:

- set the current baseline and official release link to `0.99.2`;
- state 11 How-to guides and 46 synchronized EN/VI pairs / 92 public documents;
- name Codemode/MCP, Virtual Models, and experimental Durable Agent as the new focused guides;
- retain the centralized statement that the Course draws on `pi-textbook`/`pi-handbook` where already documented; do not add per-page translation/adaptation notices.

In `CONTRIBUTING.md`, change the frontmatter scope from 86 to 92 public files and state that every content change must update its EN/VI pair and the current 46-row review ledger.

- [ ] **Step 5: Write the failing changelog structure contract**

Append:

```js
test("the first bilingual changelog entry rolls up Pi 0.99.0 through 0.99.2", async () => {
  const localizedHeadings = {
    en: [
      "Release coverage",
      "Major platform capabilities",
      "Models, authentication, and interface",
      "Reliability and behavioral corrections",
      "Documentation and verification scope",
    ],
    vi: [
      "Phạm vi release",
      "Các capability chính của nền tảng",
      "Model, xác thực và giao diện",
      "Các sửa lỗi về độ tin cậy và hành vi",
      "Phạm vi tài liệu và kiểm chứng",
    ],
  };
  for (const locale of ["en", "vi"]) {
    const source = await readFile(
      new URL(`content/${locale}/changelog.md`, repositoryRoot),
      "utf8",
    );
    const releaseIndex = source.indexOf("## 2026-10-01");
    assert.ok(releaseIndex > -1);
    for (const heading of localizedHeadings[locale]) {
      assert.ok(source.includes(`### ${heading}`), `missing ${locale} ${heading}`);
    }
    for (const token of ["v0.99.0", "v0.99.1", "v0.99.2", "gpt-6.1-sol"])
      assert.ok(source.includes(token));
  }
});
```

- [ ] **Step 6: Update paired entry points, glossary, FAQ, and changelog**

Set `last_updated: 2026-10-01` in both files of each edited pair. Apply these exact content responsibilities:

- `index.mdx`: current release, exact commit, six package families, and links to the three new guides.
- `glossary.md`: add concise entries for Codemode, MCP server/Tool exposure, Virtual Model, physical model, Durable Harness, Submission, and replay policy; keep identifiers English.
- `help/faq.md`: explain when to use direct Tools, Codemode, MCP, Virtual Models, and Durable; retain the distinction between `AgentToolResult` and transcript `ToolResultMessage`.
- `changelog.md`: add the first dated block `2026-10-01`, with the five subsections from the test. Summarize the full `0.99.0`–`0.99.2` chain, package pins, compile fixtures, and the three new guide pairs. Preserve all older dated entries verbatim as history.

The Vietnamese changelog uses natural translated subsection titles but preserves the same order and technical tokens. Update the test to accept the exact Vietnamese headings chosen, rather than bypassing their verification.

- [ ] **Step 7: Update the validator message and run inventory checks**

Change the final message in `scripts/validate-content.mjs` to:

```js
console.log("Fumadocs content validation passed: 46 EN/VI page pairs.");
```

Run:

```powershell
npm run test:content
npm run test:unit
npm run lint:frontmatter
npm run lint:sync
node --test --test-name-pattern="first bilingual changelog" scripts/pi-release-0992-contract.test.mjs
```

Expected: all inventory, navigation, frontmatter, synchronization, and changelog checks pass.

- [ ] **Step 8: Commit the route and entry-point integration**

```powershell
git add README.md CONTRIBUTING.md content/translation-manifest.json content/en content/vi scripts/content.test.mjs scripts/validate-frontmatter.test.mjs scripts/validate-content.mjs scripts/pi-release-0992-contract.test.mjs tests/seo.test.ts tests/e2e/docs.spec.ts
git commit -m "docs: integrate Pi 0.99.2 guide routes"
```

### Task 8: Audit model, Tool, provider, configuration, and event documentation

**Files:**

- Modify paired files: `content/{en,vi}/quickstart.md`
- Modify paired files: `content/{en,vi}/ch01-overview.md`
- Modify paired files: `content/{en,vi}/ch02-three-layer-arch.md`
- Modify paired files: `content/{en,vi}/ch03-agent-loop.md`
- Modify paired files: `content/{en,vi}/ch04-model-invocation.md`
- Modify paired files: `content/{en,vi}/ch05-tool-system.md`
- Modify paired files: `content/{en,vi}/ch06-messages.md`
- Modify paired files: `content/{en,vi}/ch07-event-driven.md`
- Modify paired files: `content/{en,vi}/how-to/add-custom-tool.md`
- Modify paired files: `content/{en,vi}/how-to/plug-new-model.md`
- Modify paired files: `content/{en,vi}/how-to/stream-output.md`
- Modify paired files: `content/{en,vi}/how-to/customize-system-prompt.md`
- Modify paired files: `content/{en,vi}/reference/api.md`
- Modify paired files: `content/{en,vi}/reference/configuration.md`
- Modify paired files: `content/{en,vi}/reference/environment-variables.md`
- Modify: `scripts/pi-release-contract.test.mjs`
- Modify: `scripts/pi-release-0992-contract.test.mjs`

- [ ] **Step 1: Add failing relationship contracts for the release deltas**

In `scripts/pi-release-0992-contract.test.mjs`, add a table-driven test over both locales that requires:

```js
const activeReleaseContracts = [
  {
    path: "quickstart.md",
    tokens: ["0.99.2", "005af57d", "@earendil-works/pi-ai@0.99.2"],
  },
  {
    path: "ch04-model-invocation.md",
    tokens: ["gpt-6.1-sol", "image", "classifier", "provider_stream_event"],
  },
  {
    path: "ch05-tool-system.md",
    tokens: ["structuredContent", "outputSchema", "ctx.executeTool()", "nestedCalls"],
  },
  {
    path: "ch07-event-driven.md",
    tokens: ["provider_stream_event", "parentToolCallId", "streamingBehavior"],
  },
  {
    path: "reference/configuration.md",
    tokens: ["system", "defaultTools", "+", "-", "fullscreenWheelScrollLines"],
  },
  {
    path: "reference/environment-variables.md",
    tokens: [
      "ANTHROPIC_FEDERATION_RULE_ID",
      "ANTHROPIC_ORGANIZATION_ID",
      "ANTHROPIC_IDENTITY_TOKEN_FILE",
      "ANTHROPIC_SERVICE_ACCOUNT_ID",
      "ANTHROPIC_WORKSPACE_ID",
    ],
  },
];

test("active release contracts use Pi 0.99.2 capabilities and authority", async () => {
  for (const { path, tokens } of activeReleaseContracts) {
    for (const locale of ["en", "vi"]) {
      const source = await readFile(
        new URL(`content/${locale}/${path}`, repositoryRoot),
        "utf8",
      );
      assert.match(source, /^last_updated: 2026-10-01$/m);
      for (const token of tokens) {
        assert.ok(source.includes(token), `${locale}/${path} missing ${token}`);
      }
      assert.doesNotMatch(source, /github\.com\/earendil-works\/pi\/(?:blob|tree)\/main\//);
    }
  }
});
```

For each entry, read `content/en/<path>` and `content/vi/<path>`, require every token, require `last_updated: 2026-10-01`, and reject GitHub source URLs containing `/blob/main/` or `/tree/main/`.

- [ ] **Step 2: Run the release-delta contract against the old prose**

```powershell
node --test --test-name-pattern="active release contracts" scripts/pi-release-0992-contract.test.mjs
```

Expected: FAIL on the old baseline, missing capabilities, and old source pins.

- [ ] **Step 3: Re-audit the exact tag before editing each topic**

Use these read-only commands as the authority checklist:

```powershell
git -C D:\pi show v0.99.2:packages/coding-agent/docs/models.md
git -C D:\pi show v0.99.2:packages/coding-agent/docs/settings.md
git -C D:\pi show v0.99.2:packages/coding-agent/docs/environment-variables.md
git -C D:\pi show v0.99.2:packages/coding-agent/docs/providers.md
git -C D:\pi show v0.99.2:packages/coding-agent/src/core/extensions/types.ts
git -C D:\pi show v0.99.2:packages/coding-agent/src/modes/rpc/rpc-types.ts
git -C D:\pi show v0.99.2:packages/ai/src/models.ts
git -C D:\pi show v0.99.2:packages/ai/src/providers/anthropic.ts
```

Expected: all paths resolve from tag `v0.99.2`; do not switch or pull the `D:\pi` checkout.

- [ ] **Step 4: Update package/model/provider guidance in both locales**

Preserve existing explanations and examples unless the tag disproves them. Apply these verified deltas:

- all current install commands use exact `0.99.2` pins;
- `gpt-6.1-sol` is available through OpenAI, Azure OpenAI Responses, and OpenAI Codex, and is the OpenAI Codex default at this release;
- Sign in with ChatGPT belongs to the OpenAI provider; retain the legacy OpenAI Codex label only where the UI/auth distinction requires it;
- model catalogs distinguish chat, image, and classifier models; `ModelRuntime` image/classifier accessors and runtime-resolved auth do not become chat-model APIs;
- document Jev classifier routing only as a verified capability, not a quality guarantee;
- keep generated model catalogs authoritative instead of adding a manually maintained complete table.

- [ ] **Step 5: Update Tool and event guidance in both locales**

Integrate the public `0.99.2` contracts for `ToolExposure`, namespace, annotations, `outputSchema`, `structuredContent`, `isError`, `prepareLoadout()`, nested `ctx.executeTool()`, `parentToolCallId`, and bounded `nestedCalls`. Preserve the distinction between Tool handler results and protocol transcript messages.

In RPC/event guidance, document successful input disposition and `streamingBehavior` at the existing prompt/steer/follow-up boundary. Add `provider_stream_event` only where the event taxonomy is already explained.

- [ ] **Step 6: Update configuration, themes, built-ins, and environment guidance**

Document:

- system theme as the default and the six accepted color forms: three- or six-digit RGB hexadecimal, OKLCH, OKHSL, ANSI 256-color index, variable reference, and the empty-string terminal default;
- built-in extension identifiers;
- additive/removal `defaultTools` entries using `+name` and `-name`, including reload activation;
- `fullscreenWheelScrollLines`;
- Anthropic workload federation environment variables using the exact names from the tag;
- `bash` and PowerShell structured output up to 1 MiB with truncation metadata, without promising unlimited terminal output.

Keep existing environment-variable warnings when still correct. Replace only claims contradicted by the tag.

- [ ] **Step 7: Update the broad release suite without erasing historical tests**

In `scripts/pi-release-contract.test.mjs`, migrate active baseline labels, package commands, fixture paths, review dates, source pins, and installed-declaration assertions to `0.99.2`. Keep tests that deliberately mutate older changelog entries or verify historical migrations; name them as historical so the stale-baseline scan can permit them.

- [ ] **Step 8: Run the focused and relevant broad contracts**

```powershell
node --test --test-name-pattern="active release contracts|models|provider|Tool|event|configuration|environment" scripts/pi-release-0992-contract.test.mjs scripts/pi-release-contract.test.mjs
npm run typecheck
```

Expected: the updated provider/model/Tool/configuration contracts pass and all examples compile against `0.99.2`.

- [ ] **Step 9: Commit the model and Tool audit**

```powershell
git add content/en content/vi scripts/pi-release-contract.test.mjs scripts/pi-release-0992-contract.test.mjs
git commit -m "docs: audit Pi 0.99.2 models tools and configuration"
```

### Task 9: Audit session, context, compaction, runtime, and evaluation documentation

**Files:**

- Modify paired files: `content/{en,vi}/ch08-context-engineering.md`
- Modify paired files: `content/{en,vi}/ch09-compaction.md`
- Modify paired files: `content/{en,vi}/ch10-session.md`
- Modify paired files: `content/{en,vi}/ch11-testing-evaluation.md`
- Modify paired files: `content/{en,vi}/how-to/persist-sessions.md`
- Modify paired files: `content/{en,vi}/how-to/test-agent-deterministically.md`
- Modify paired files: `content/{en,vi}/how-to/run-pi-evals.md`
- Modify paired files: `content/{en,vi}/how-to/host-session-runtime.md`
- Modify: `scripts/pi-release-contract.test.mjs`
- Modify: `scripts/pi-release-0992-contract.test.mjs`
- Modify: `scripts/pi-evals-guide.test.mjs`
- Modify: `tests/fixtures/pi-sdk-0992.contract.ts`

- [ ] **Step 1: Write failing lifecycle and session-boundary checks**

Append this contract to `scripts/pi-release-0992-contract.test.mjs`:

```js
test("session lifecycle, runtime, compaction, and eval guides use 0.99.2 boundaries", async () => {
  const paths = [
    "ch08-context-engineering.md",
    "ch09-compaction.md",
    "ch10-session.md",
    "ch11-testing-evaluation.md",
    "how-to/persist-sessions.md",
    "how-to/test-agent-deterministically.md",
    "how-to/run-pi-evals.md",
    "how-to/host-session-runtime.md",
  ];
  const localized = new Map();
  for (const locale of ["en", "vi"]) {
    for (const path of paths) {
      const source = await readFile(
        new URL(`content/${locale}/${path}`, repositoryRoot),
        "utf8",
      );
      localized.set(`${locale}/${path}`, source);
      assert.match(source, /^last_updated: 2026-10-01$/m);
      assert.ok(source.includes("0.99.2"), `${locale}/${path} release pin`);
      assert.ok(
        source.includes("005af57d88ee23b33778f343a9595b32e67ff788"),
        `${locale}/${path} source pin`,
      );
    }
  }

  const enSession = localized.get("en/ch10-session.md");
  const viSession = localized.get("vi/ch10-session.md");
  assert.match(enSession, /session file[\s\S]{0,300}first user message/i);
  assert.match(viSession, /session file[\s\S]{0,300}user message đầu tiên/i);
  assert.match(enSession, /selected Virtual Model[\s\S]{0,500}physical model/i);
  assert.match(viSession, /Virtual Model được chọn[\s\S]{0,500}physical model/i);

  for (const locale of ["en", "vi"]) {
    const stream = localized.get(`${locale}/how-to/host-session-runtime.md`);
    assert.ok(stream.includes("disposition"));
    assert.ok(stream.includes("streamingBehavior"));
    assert.ok(stream.includes("abort()"));
    assert.match(stream, /non-transactional|không có tính transaction/i);

    const deterministic = localized.get(
      `${locale}/how-to/test-agent-deterministically.md`,
    );
    assert.ok(deterministic.includes("tests/fixtures/pi-sdk-0992.contract.ts"));
    assert.match(deterministic, /without network access|không truy cập network/i);

    const evalGuide = localized.get(`${locale}/how-to/run-pi-evals.md`);
    assert.ok(evalGuide.includes("without_docs"));
    assert.ok(evalGuide.includes("with_docs"));
  }
});
```

This contract makes the following relationships executable: first-message session-file creation; selected-versus-physical model state through restore/compaction; RPC disposition and `streamingBehavior`; runtime abort/replacement failure boundaries; offline deterministic examples; and symmetric eval treatment/control.

Run:

```powershell
node --test --test-name-pattern="session lifecycle|session|compaction|runtime|deterministic|eval" scripts/pi-release-0992-contract.test.mjs scripts/pi-release-contract.test.mjs scripts/pi-evals-guide.test.mjs
```

Expected: FAIL on stale version, fixture, date, or source assertions before content migration.

- [ ] **Step 2: Verify exact tag sources before editing**

```powershell
git -C D:\pi show v0.99.2:packages/coding-agent/src/core/session-manager.ts
git -C D:\pi show v0.99.2:packages/coding-agent/src/core/agent-session.ts
git -C D:\pi show v0.99.2:packages/coding-agent/src/core/agent-session-runtime.ts
git -C D:\pi show v0.99.2:packages/coding-agent/src/core/compaction/compaction.ts
git -C D:\pi show v0.99.2:packages/evals/README.md
```

Expected: exact tag content is available for every edited lifecycle claim.

- [ ] **Step 3: Edit each EN/VI pair without reducing depth**

For Chapters 8–11 and the four How-to pairs:

- set `last_updated: 2026-10-01`;
- update active release/install/source pins to `0.99.2` and the exact commit;
- retain all still-correct context projection, compaction, persistence, collision, runtime replacement, deterministic testing, and eval explanations;
- integrate only the new lifecycle facts at the section where a reader expects them;
- keep code blocks identical between locales and update the compiled fixture first whenever a public signature changed;
- remove prose only when the exact tag proves it false or it duplicates the same claim on the same page; record any removal in the final ledger.

- [ ] **Step 4: Run lifecycle, fixture, and eval contracts**

```powershell
node --test --test-name-pattern="session lifecycle|session|compaction|runtime|deterministic|eval" scripts/pi-release-0992-contract.test.mjs scripts/pi-release-contract.test.mjs scripts/pi-evals-guide.test.mjs
npm run test:evals-guide
npm run typecheck
```

Expected: all scoped tests pass and the compile fixture remains synchronized with displayed examples.

- [ ] **Step 5: Commit the lifecycle audit**

```powershell
git add content/en content/vi scripts/pi-release-0992-contract.test.mjs scripts/pi-release-contract.test.mjs scripts/pi-evals-guide.test.mjs tests/fixtures/pi-sdk-0992.contract.ts
git commit -m "docs: audit Pi 0.99.2 session and runtime behavior"
```

### Task 10: Re-pin all Course comparisons without changing the Course implementation

**Files:**

- Modify paired files: `content/{en,vi}/course/index.mdx`
- Modify paired files: `content/{en,vi}/course/00-complete-agent-trace.md`
- Modify paired files: `content/{en,vi}/course/01-typescript-protocols.md`
- Modify paired files: `content/{en,vi}/course/02-event-stream.md`
- Modify paired files: `content/{en,vi}/course/03-message-ir.md`
- Modify paired files: `content/{en,vi}/course/04-deterministic-model.md`
- Modify paired files: `content/{en,vi}/course/05-provider-adapter.md`
- Modify paired files: `content/{en,vi}/course/06-tool-contract.md`
- Modify paired files: `content/{en,vi}/course/07-agent-loop.md`
- Modify paired files: `content/{en,vi}/course/08-coding-tools.md`
- Modify paired files: `content/{en,vi}/course/09-stateful-agent.md`
- Modify paired files: `content/{en,vi}/course/10-session-tree.md`
- Modify paired files: `content/{en,vi}/course/11-context-compaction.md`
- Modify paired files: `content/{en,vi}/course/12-resources-extensions.md`
- Modify paired files: `content/{en,vi}/course/13-runtime-composition.md`
- Modify paired files: `content/{en,vi}/course/14-agent-evaluation.md`
- Modify: `scripts/course-content.test.mjs`
- Modify: `scripts/pi-release-contract.test.mjs`

- [ ] **Step 1: Change Course tests to the new comparison authority first**

In `scripts/course-content.test.mjs`, set:

```js
const courseComparisonCallout = "Pi SDK 0.99.2";
```

Require `Compare with Pi SDK 0.99.2` in English, `So sánh với Pi SDK 0.99.2` in Vietnamese, exact commit-pinned source links, and `last_updated: 2026-10-01` across all 16 pairs. Update mutation tests so they still prove that stale labels and unpinned source paths are rejected.

- [ ] **Step 2: Observe Course comparison failures**

```powershell
npm run test:course
node --test scripts/course-content.test.mjs
```

Expected: the Course implementation tests pass, while content contracts fail on old `0.87.1` labels and pins.

- [ ] **Step 3: Audit and update all 16 comparison pairs**

For every listed Course pair:

- change the comparison heading/callout to `0.99.2`;
- update source URLs to commit `005af57d88ee23b33778f343a9595b32e67ff788`;
- preserve Course code, exercises, checkpoints, diagrams, and explanatory depth;
- update a comparison paragraph only when `0.99.2` changed the production contract relevant to that lesson;
- mention Codemode/MCP, Virtual Models, or Durable only when the lesson's existing concern requires the distinction;
- continue describing the Course as an original, smaller teaching implementation with no Pi API-compatibility promise.

Do not edit `course/src/` or `course/test/` unless a failing Course test proves an accidental documentation-code mismatch unrelated to Pi internals.

- [ ] **Step 4: Run Course and source-pin verification**

```powershell
npm run test:course
node --test scripts/course-content.test.mjs
node --test --test-name-pattern="Course comparisons" scripts/pi-release-contract.test.mjs
```

Expected: the workshop tests remain green and all 16 bilingual comparison contracts pass.

- [ ] **Step 5: Commit the Course re-pin**

```powershell
git add content/en/course content/vi/course scripts/course-content.test.mjs scripts/pi-release-contract.test.mjs
git commit -m "docs: re-pin Course comparisons to Pi 0.99.2"
```

### Task 11: Complete the 46-pair bilingual audit ledger and stale-baseline scanner

**Files:**

- Create: `docs/translation-review/2026-10-01-pi-0992.md`
- Modify: all remaining unaudited files under `content/en/` and `content/vi/`
- Modify: `scripts/pi-release-contract.test.mjs`
- Modify: `scripts/pi-release-0992-contract.test.mjs`
- Verify unchanged: `content/preservation-manifest.json`

- [ ] **Step 1: Add a failing ledger and stale-authority contract**

Require the new ledger to contain exactly one row for each of these 46 keys:

```text
home
quickstart
glossary
how-to-add-custom-tool
how-to-plug-new-model
how-to-stream-output
how-to-persist-sessions
how-to-customize-system-prompt
how-to-test-agent-deterministically
how-to-run-pi-evals
how-to-host-session-runtime
how-to-use-codemode-and-mcp
how-to-route-virtual-models
how-to-build-durable-agent
reference-api
reference-configuration
reference-environment-variables
ch01-overview
ch02-three-layer-arch
ch03-agent-loop
ch04-model-invocation
ch05-tool-system
ch06-messages
ch07-event-driven
ch08-context-engineering
ch09-compaction
ch10-session
ch11-testing-evaluation
course-overview
course-00-complete-agent-trace
course-01-typescript-protocols
course-02-event-stream
course-03-message-ir
course-04-deterministic-model
course-05-provider-adapter
course-06-tool-contract
course-07-agent-loop
course-08-coding-tools
course-09-stateful-agent
course-10-session-tree
course-11-context-compaction
course-12-resources-extensions
course-13-runtime-composition
course-14-agent-evaluation
faq
changelog
```

Append these tests to `scripts/pi-release-0992-contract.test.mjs`, using the 46-line key block above as the literal value of `expectedAuditKeysText`:

```js
const expectedAuditKeysText = `home
quickstart
glossary
how-to-add-custom-tool
how-to-plug-new-model
how-to-stream-output
how-to-persist-sessions
how-to-customize-system-prompt
how-to-test-agent-deterministically
how-to-run-pi-evals
how-to-host-session-runtime
how-to-use-codemode-and-mcp
how-to-route-virtual-models
how-to-build-durable-agent
reference-api
reference-configuration
reference-environment-variables
ch01-overview
ch02-three-layer-arch
ch03-agent-loop
ch04-model-invocation
ch05-tool-system
ch06-messages
ch07-event-driven
ch08-context-engineering
ch09-compaction
ch10-session
ch11-testing-evaluation
course-overview
course-00-complete-agent-trace
course-01-typescript-protocols
course-02-event-stream
course-03-message-ir
course-04-deterministic-model
course-05-provider-adapter
course-06-tool-contract
course-07-agent-loop
course-08-coding-tools
course-09-stateful-agent
course-10-session-tree
course-11-context-compaction
course-12-resources-extensions
course-13-runtime-composition
course-14-agent-evaluation
faq
changelog`;
const expectedAuditKeys = expectedAuditKeysText.split("\n");

test("Pi 0.99.2 bilingual audit ledger covers every public pair", async () => {
  const [ledger, manifest] = await Promise.all([
    readFile(
      new URL(
        "docs/translation-review/2026-10-01-pi-0992.md",
        repositoryRoot,
      ),
      "utf8",
    ),
    readJson(new URL("content/translation-manifest.json", repositoryRoot)),
  ]);
  assert.deepEqual(
    manifest.pages.map((page) => page.key),
    expectedAuditKeys,
  );

  const rows = ledger
    .split(/\r?\n/)
    .filter((line) => line.startsWith("| `"))
    .map((line) => line.slice(1, -1).split("|").map((cell) => cell.trim()));
  assert.equal(rows.length, 46);
  assert.deepEqual(
    rows.map(([key]) => key.replaceAll("`", "")),
    expectedAuditKeys,
  );
  assert.equal(new Set(rows.map(([key]) => key)).size, 46);

  for (const [index, cells] of rows.entries()) {
    assert.equal(cells.length, 6, `ledger row ${index + 1} column count`);
    const [keyCell, outcome, evidence, files, fences, deletion] = cells;
    const key = keyCell.replaceAll("`", "");
    const page = manifest.pages.find((entry) => entry.key === key);
    assert.ok(page, `manifest entry for ${key}`);
    assert.match(outcome, /substantive|pin-only|verified unchanged/);
    assert.match(
      evidence,
      /005af57d88ee23b33778f343a9595b32e67ff788|releases\/tag\/v0\.99\.[012]/,
    );
    assert.ok(files.includes(`content/en/${page.en}`));
    assert.ok(files.includes(`content/vi/${page.vi}`));
    assert.match(fences, /^\d+\/\d+ audited$/);
    assert.ok(deletion.length > 0, `${key} deletion result`);
  }
});

test("stale active authority and moving source pins are absent", async () => {
  const manifest = await readJson(
    new URL("content/translation-manifest.json", repositoryRoot),
  );
  const activePaths = ["README.md", "CONTRIBUTING.md"];
  for (const page of manifest.pages) {
    if (page.key === "changelog") continue;
    activePaths.push(`content/en/${page.en}`, `content/vi/${page.vi}`);
  }
  for (const relativePath of new Set(activePaths)) {
    const source = await readFile(new URL(relativePath, repositoryRoot), "utf8");
    assert.doesNotMatch(source, /0\.87\.1/);
    assert.doesNotMatch(source, /f07218c4d4bbc12bef056a7058c3dd49dfe41abe/);
    assert.doesNotMatch(source, /pi-release-0871\.json/);
    assert.doesNotMatch(source, /pi-sdk-0871\.contract\.ts/);
    assert.doesNotMatch(
      source,
      /github\.com\/earendil-works\/pi\/(?:blob|tree)\/main\//,
    );
  }
  for (const locale of ["en", "vi"]) {
    const changelog = await readFile(
      new URL(`content/${locale}/changelog.md`, repositoryRoot),
      "utf8",
    );
    assert.doesNotMatch(
      changelog,
      /github\.com\/earendil-works\/pi\/(?:blob|tree)\/main\//,
    );
  }
});
```

The ledger test compares keys to `content/translation-manifest.json`, verifies 46 unique rows, and requires both file paths, source evidence, code-fence counts, outcome, and a deletion field. The stale-authority test rejects active `0.87.1`, the old commit, the two old fixture names, `/blob/main/`, and `/tree/main/`. Its scan deliberately excludes only:

- dated historical changelog blocks;
- the approved design and implementation plan;
- older immutable review ledgers;
- explicit migration prose that names both old and new versions.

- [ ] **Step 2: Run the audit contract and observe failures**

```powershell
node --test --test-name-pattern="audit ledger|stale active authority" scripts/pi-release-0992-contract.test.mjs scripts/pi-release-contract.test.mjs
```

Expected: FAIL because the ledger is absent and remaining active stale references have not been classified.

- [ ] **Step 3: Audit every pair and update remaining frontmatter**

For each manifest row:

1. read the full English and Vietnamese files;
2. compare heading levels, code fence languages/counts, callouts, tables, internal links, source links, and technical relationships;
3. keep API identifiers, commands, flags, event names, package names, type names, and common IT/Coding terms in English;
4. make Vietnamese prose natural without weakening or broadening the English claim;
5. set `last_updated: 2026-10-01` when the frontmatter schema includes that field;
6. record exact tag/source evidence and whether the audit was substantive, pin-only, or verified unchanged;
7. record `none` under deletion unless exact tag evidence justified a removal.

Do not add per-page translation/adaptation notes and do not change `content/preservation-manifest.json` unless a source-proven deletion requires a reviewed manifest update.

- [ ] **Step 4: Write the complete ledger**

Start `docs/translation-review/2026-10-01-pi-0992.md` with release identity, methodology, source hierarchy, terminology rules, deletion policy, and totals. Use this exact table schema:

```markdown
| Key | Outcome | Evidence | Files checked | Code fences EN/VI | Deletion |
| --- | --- | --- | --- | --- | --- |
```

Add all 46 rows in manifest order. Each evidence cell must link to an exact commit path, an exact release page, or a published package declaration relevant to that pair. End with outcome totals that sum to 46 and a concise review result.

- [ ] **Step 5: Run bilingual, preservation, source, and stale scans**

```powershell
npm run lint:sync
npm run test:preservation
npm run test:editorial
npm run lint:content
node --test --test-name-pattern="audit ledger|stale active authority" scripts/pi-release-0992-contract.test.mjs scripts/pi-release-contract.test.mjs
rg -n "0\.87\.1|f07218c4d4bbc12bef056a7058c3dd49dfe41abe|pi-release-0871|pi-sdk-0871|/blob/main/|/tree/main/" content README.md CONTRIBUTING.md scripts tests
```

Expected: automated checks pass. Every `rg` result is either an allowed historical/migration occurrence covered by the test or is corrected before continuing.

- [ ] **Step 6: Commit the complete bilingual audit**

```powershell
git add content/en content/vi docs/translation-review/2026-10-01-pi-0992.md scripts/pi-release-contract.test.mjs scripts/pi-release-0992-contract.test.mjs
git commit -m "docs: complete Pi 0.99.2 bilingual audit"
```

### Task 12: Run full verification, merge to main, push, deploy, and smoke-test production

**Files:**

- Verify: all tracked files changed on `docs/pi-0992-update`
- Verify: `.github/workflows/*`
- Verify public deployment: `https://docs.pify.dev`

- [ ] **Step 1: Run the complete local quality suite**

```powershell
npm run quality:content
npm run typecheck
npm run format:check
npm run build
npm run test:e2e
git diff --check main...HEAD
```

Expected: every command exits 0; Next.js generates all 92 content routes and no diff whitespace errors are reported.

- [ ] **Step 2: Inspect the final tracked diff and commit history**

```powershell
git status --short
git diff --stat main...HEAD
git diff --name-status main...HEAD
git log --oneline --decorate main..HEAD
```

Expected: only task-related tracked files appear; root-checkout untracked artifacts are absent; no content route was deleted; the history contains reviewable release, fixture, guide, audit, and quality commits.

- [ ] **Step 3: Add a final verification commit only if formatting generated tracked changes**

If verification changed tracked generated files, review them and commit only the expected files:

```powershell
git add --update
git commit -m "chore: finalize Pi 0.99.2 docs verification"
```

If `git status --short` is empty, skip this commit.

- [ ] **Step 4: Fast-forward the verified branch into main**

Return to the root checkout and verify the exact target before changing it:

```powershell
Set-Location 'E:\project\pi-docs'
git status --short
git branch --show-current
git merge --ff-only docs/pi-0992-update
```

Expected: current branch is `main`; existing unrelated untracked files remain untouched; the merge is fast-forward only.

- [ ] **Step 5: Push the exact verified main commit**

```powershell
$piDocsHead = git rev-parse HEAD
git push origin main
git ls-remote origin refs/heads/main
```

Expected: the remote `main` SHA equals `$piDocsHead`.

- [ ] **Step 6: Verify GitHub Actions on the exact SHA**

```powershell
$piDocsRuns = gh run list --branch main --commit $piDocsHead --limit 20 --json databaseId,name | ConvertFrom-Json
$piDocsRequiredWorkflows = @('Content Quality', 'Next.js Application Build')
foreach ($piDocsWorkflow in $piDocsRequiredWorkflows) {
  $piDocsRun = $piDocsRuns | Where-Object { $_.name -eq $piDocsWorkflow } | Select-Object -First 1
  if (-not $piDocsRun) {
    throw "Missing GitHub Actions run: $piDocsWorkflow at $piDocsHead"
  }
  gh run watch $piDocsRun.databaseId --exit-status
}
```

Expected: Content Quality and Next.js Application Build complete successfully for `$piDocsHead`.

- [ ] **Step 7: Verify or trigger the Vercel production deployment**

First inspect deployments associated with the pushed commit:

```powershell
vercel ls --prod
```

If the Git integration has already created a production deployment for `$piDocsHead`, wait for it to become Ready. If no production deployment exists for that SHA, run:

```powershell
vercel --prod --yes
```

Expected: the production deployment is Ready and reports the same source commit where Vercel exposes commit metadata.

- [ ] **Step 8: Smoke-test public routes and clean URLs**

```powershell
$piDocsUrls = @(
  'https://docs.pify.dev/en',
  'https://docs.pify.dev/vi',
  'https://docs.pify.dev/en/how-to/use-codemode-and-mcp',
  'https://docs.pify.dev/vi/how-to/use-codemode-and-mcp',
  'https://docs.pify.dev/en/how-to/route-virtual-models',
  'https://docs.pify.dev/vi/how-to/route-virtual-models',
  'https://docs.pify.dev/en/how-to/build-durable-agent',
  'https://docs.pify.dev/vi/how-to/build-durable-agent'
)
foreach ($piDocsUrl in $piDocsUrls) {
  $piDocsResponse = Invoke-WebRequest -Uri $piDocsUrl -MaximumRedirection 5
  if ($piDocsResponse.StatusCode -ne 200) {
    throw "$piDocsUrl returned $($piDocsResponse.StatusCode)"
  }
}
```

Expected: every clean route returns HTTP 200. In a browser, verify language switching, search, sidebar order, code highlighting, Mermaid rendering, internal links, and favicon on at least one existing page and all three new guide pairs. Confirm no `.md` URL is exposed when following rendered documentation links.

- [ ] **Step 9: Remove the recoverable worktree after production verification**

```powershell
git worktree remove 'E:\project\pi-docs\.worktrees\pi-0992-update'
git branch -d docs/pi-0992-update
git status --short
```

Expected: the temporary worktree and merged local branch are removed; all committed work remains recoverable from `origin/main`; the root checkout's pre-existing untracked files are unchanged.

## Completion criteria

- 46 EN/VI pairs and 92 public content files pass manifest, navigation, frontmatter, sync, preservation, editorial, Mermaid, and link checks.
- All six direct packages and all active compile fixtures use exact `0.99.2` declarations.
- Codemode/MCP, Virtual Models, and Durable each have a full bilingual guide with the safety and lifecycle relationships specified above.
- Existing explanations, routes, Course code, and Fumadocs UI are preserved; source-proven deletions are explicitly recorded.
- No active page treats `0.87.1`, the old commit, `main`, or `/latest` as `0.99.2` authority.
- Local verification, GitHub Actions, Vercel production deployment, and public route smoke tests pass on the same commit.
