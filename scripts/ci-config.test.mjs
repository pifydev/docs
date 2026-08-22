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

function workflowCommands(workflow, job) {
  return workflow.jobs[job].steps
    .filter((step) => step.run)
    .map((step) => step.run);
}

function assertReadOnlyNode22(workflow, job) {
  const steps = workflow.jobs[job].steps;
  const setupNode = steps.find((step) => step.uses === "actions/setup-node@v4");

  assert.deepEqual(workflow.permissions, { contents: "read" });
  assert.equal(workflow.jobs[job]["timeout-minutes"], 20);
  assert.equal(setupNode.with["node-version"], 22);
  assert.equal(setupNode.with.cache, "npm");
}

test("content workflow validates the Fumadocs source tree", async () => {
  const { source, workflow } = await readWorkflow("content-quality.yml");

  assert.equal(workflow.name, "Content Quality");
  assertReadOnlyNode22(workflow, "quality");
  assert.ok(workflow.on.pull_request.paths.includes("content/**"));
  assert.ok(workflow.on.push.paths.includes("content/**"));
  assert.deepEqual(workflowCommands(workflow, "quality"), [
    "npm ci",
    "npm run test:content",
    "npm run test:unit",
    "npm run lint:sync",
    "npm run lint:frontmatter",
    "npm run lint:content",
    "npm run lint:mermaid",
    "npm run lint:app",
  ]);
  assert.doesNotMatch(source, /GitBook|src\/content\/docs|lint:gitbook/i);
});

test("application workflow builds Next.js without deploying", async () => {
  const { source, workflow } = await readWorkflow("deploy.yml");

  assert.equal(workflow.name, "Next.js Application Build");
  assertReadOnlyNode22(workflow, "build");
  assert.deepEqual(workflowCommands(workflow, "build"), [
    "npm ci",
    "npm run typecheck",
    "npm run build",
  ]);
  assert.match(source, /app\/\*\*/);
  assert.match(source, /content\/\*\*/);
  assert.doesNotMatch(
    source,
    /Astro|GitBook|deploy-pages|upload-pages-artifact/i,
  );
  assert.doesNotMatch(source, /^\s+(?:pages|id-token):\s+write$/m);
  assert.doesNotMatch(source, /vercel/i);
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
  );

  assert.match(validator, /process\.env\.CI/);
  assert.match(validator, /puppeteer-ci\.json/);
  assert.deepEqual(JSON.parse(configText), { args: ["--no-sandbox"] });
});
