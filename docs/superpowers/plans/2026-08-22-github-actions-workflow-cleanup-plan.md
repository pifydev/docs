# GitHub Actions Workflow Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate repository validation, retain an Astro rollback build, and stop automatic GitHub Pages failures in `pifydev/docs`.

**Architecture:** `content-quality.yml` is the only content validation gate and runs every repository validator on Node.js 24. `deploy.yml` keeps its stable path but becomes a read-only Astro build check, while the duplicate PR-only workflow is removed. Node tests parse the YAML and protect these boundaries from regression.

**Tech Stack:** GitHub Actions YAML, Node.js 24, npm, `node:test`, `yaml`, Astro 7

---

### Task 1: Lock the workflow contract with failing tests

**Files:**
- Modify: `scripts/ci-config.test.mjs`

- [ ] **Step 1: Replace the obsolete workflow tests with semantic YAML assertions**

Use this complete test file:

```js
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";
import { parse } from "yaml";

const repositoryRoot = new URL("../", import.meta.url);

async function readWorkflow(filename) {
  const source = await readFile(
    new URL(`.github/workflows/${filename}`, repositoryRoot),
    "utf8",
  );
  return { source, workflow: parse(source) };
}

test("content workflow owns the complete validation pipeline", async () => {
  const { workflow } = await readWorkflow("content-quality.yml");
  const pullRequestPaths = workflow.on.pull_request.paths;
  const pushPaths = workflow.on.push.paths;
  const steps = workflow.jobs.quality.steps;
  const setupNode = steps.find((step) => step.uses === "actions/setup-node@v4");
  const commands = steps.filter((step) => step.run).map((step) => step.run);

  assert.equal(workflow.permissions.contents, "read");
  assert.equal(workflow.jobs.quality["timeout-minutes"], 15);
  assert.equal(setupNode.with["node-version"], 24);
  assert.ok(pullRequestPaths.includes(".github/workflows/**"));
  assert.ok(pushPaths.includes(".github/workflows/**"));
  assert.ok(pullRequestPaths.includes("src/content/docs/**"));
  assert.deepEqual(commands, [
    "npm ci",
    "npm run test:content",
    "npm run lint:gitbook",
    "npm run lint",
  ]);
});

test("Astro rollback workflow builds without deploying", async () => {
  const { source, workflow } = await readWorkflow("deploy.yml");
  const steps = workflow.jobs.build.steps;
  const setupNode = steps.find((step) => step.uses === "actions/setup-node@v4");
  const commands = steps.filter((step) => step.run).map((step) => step.run);

  assert.equal(workflow.name, "Astro Rollback Build");
  assert.deepEqual(workflow.permissions, { contents: "read" });
  assert.equal(workflow.jobs.build["timeout-minutes"], 15);
  assert.equal(setupNode.with["node-version"], 24);
  assert.deepEqual(commands, ["npm ci", "npm run build"]);
  assert.doesNotMatch(source, /deploy-pages|upload-pages-artifact/);
  assert.doesNotMatch(source, /^\s+(?:pages|id-token):\s+write$/m);
});

test("duplicate PR sync workflow is absent", async () => {
  await assert.rejects(
    access(new URL(".github/workflows/sync-check.yml", repositoryRoot)),
    { code: "ENOENT" },
  );
});

test("Mermaid validation supplies the documented Chromium CI sandbox override", async () => {
  const validator = await readFile(
    new URL("scripts/validate-mermaid.mjs", repositoryRoot),
    "utf8",
  );
  const configText = await readFile(
    new URL("scripts/puppeteer-ci.json", repositoryRoot),
    "utf8",
  ).catch(() => null);

  assert.match(validator, /process\.env\.CI/);
  assert.match(validator, /puppeteer-ci\.json/);
  assert.ok(configText, "scripts/puppeteer-ci.json must exist");
  assert.deepEqual(JSON.parse(configText), { args: ["--no-sandbox"] });
});
```

- [ ] **Step 2: Run the focused test and verify the old workflows fail the new contract**

Run:

```powershell
node --test scripts/ci-config.test.mjs
```

Expected: three workflow-contract tests fail because the content pipeline is incomplete, `deploy.yml` still deploys Pages, and `sync-check.yml` still exists. The Mermaid test passes.

### Task 2: Consolidate and harden the workflows

**Files:**
- Modify: `.github/workflows/content-quality.yml`
- Modify: `.github/workflows/deploy.yml`
- Delete: `.github/workflows/sync-check.yml`
- Test: `scripts/ci-config.test.mjs`

- [ ] **Step 1: Make the content workflow the single validation gate**

Replace `.github/workflows/content-quality.yml` with:

```yaml
name: GitBook Content Quality

on:
  pull_request:
    paths:
      - "content/**"
      - "source/**"
      - "src/content/docs/**"
      - "scripts/**"
      - "package.json"
      - "package-lock.json"
      - ".github/workflows/**"
  push:
    branches: [main]
    paths:
      - "content/**"
      - "source/**"
      - "src/content/docs/**"
      - "scripts/**"
      - "package.json"
      - "package-lock.json"
      - ".github/workflows/**"
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: gitbook-content-${{ github.ref }}
  cancel-in-progress: true

jobs:
  quality:
    name: Validate GitBook content
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npm run test:content
      - run: npm run lint:gitbook
      - run: npm run lint
```

- [ ] **Step 2: Convert the legacy deploy workflow into a rollback build**

Replace `.github/workflows/deploy.yml` with:

```yaml
name: Astro Rollback Build

on:
  pull_request:
    paths:
      - "src/**"
      - "public/**"
      - "scripts/build.mjs"
      - "astro.config.mjs"
      - "package.json"
      - "package-lock.json"
      - "tsconfig.json"
      - ".github/workflows/deploy.yml"
  push:
    branches: [main]
    paths:
      - "src/**"
      - "public/**"
      - "scripts/build.mjs"
      - "astro.config.mjs"
      - "package.json"
      - "package-lock.json"
      - "tsconfig.json"
      - ".github/workflows/deploy.yml"
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: astro-rollback-${{ github.ref }}
  cancel-in-progress: true

jobs:
  build:
    name: Build Astro rollback
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npm run build
```

- [ ] **Step 3: Remove the duplicate PR workflow**

Delete `.github/workflows/sync-check.yml` completely.

- [ ] **Step 4: Run the focused regression test**

Run:

```powershell
node --test scripts/ci-config.test.mjs
```

Expected: 4 tests pass and 0 fail.

- [ ] **Step 5: Commit the implementation**

```powershell
git add -- .github/workflows/content-quality.yml .github/workflows/deploy.yml .github/workflows/sync-check.yml scripts/ci-config.test.mjs
git commit -m "fix(ci): consolidate docs workflows"
```

### Task 3: Verify and publish directly to main

**Files:**
- Verify: `.github/workflows/content-quality.yml`
- Verify: `.github/workflows/deploy.yml`
- Verify: `scripts/ci-config.test.mjs`

- [ ] **Step 1: Rebase on the latest remote main**

```powershell
git fetch origin main
git rebase origin/main
```

Expected: the branch rebases without conflicts and contains the design and implementation commits above `origin/main`.

- [ ] **Step 2: Run the complete local verification gate after the rebase**

```powershell
npm run test:content
npm run lint:gitbook
$env:CI = "true"
npm run lint
Remove-Item Env:CI
npm run build
npm run check
node --input-type=module -e "import{readdirSync,readFileSync}from'node:fs';import{parseDocument}from'yaml';for(const f of readdirSync('.github/workflows')){const d=parseDocument(readFileSync('.github/workflows/'+f,'utf8'));if(d.errors.length)throw new Error(f+': '+d.errors.join('; '));console.log(f+': YAML OK')}"
git diff --check origin/main...HEAD
```

Expected: 12 content/config tests pass, GitBook validates 23 EN/VI pairs, sync/frontmatter/Mermaid pass, Astro builds 71 pages, Astro check reports zero errors, both workflows parse, and the diff has no whitespace errors.

- [ ] **Step 3: Push the verified branch as a fast-forward update to main**

```powershell
git push origin HEAD:main
```

Expected: `main` advances without a force push.

- [ ] **Step 4: Verify the remote SHA and GitHub Actions results**

Confirm that `refs/heads/main` equals local `HEAD`, then monitor runs for that SHA. Expected outcomes:

- `GitBook Content Quality`: success.
- `Astro Rollback Build`: success.
- No `Deploy to GitHub Pages` job is created.
- No `Sync Check (PR only)` run is created.
