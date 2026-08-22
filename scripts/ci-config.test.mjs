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
