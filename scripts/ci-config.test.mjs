import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { resolveConfig } from "vitest/node";
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

function assertWorkflowPath(workflow, expectedPath) {
  assert.ok(workflow.on.pull_request.paths.includes(expectedPath));
  assert.ok(workflow.on.push.paths.includes(expectedPath));
}

test("content workflow validates the Fumadocs source tree", async () => {
  const { source, workflow } = await readWorkflow("content-quality.yml");

  assert.equal(workflow.name, "Content Quality");
  assertReadOnlyNode22(workflow, "quality");
  assertWorkflowPath(workflow, "content/**");
  assertWorkflowPath(workflow, "course/**");
  assertWorkflowPath(workflow, "vitest.config.ts");
  assert.deepEqual(workflowCommands(workflow, "quality"), [
    "npm ci",
    "npm run quality:content",
  ]);
  const packageJSON = JSON.parse(
    await readFile(new URL("package.json", repositoryRoot), "utf8"),
  );
  const contentQualityCommands = packageJSON.scripts["quality:content"]
    .split("&&")
    .map((command) => command.trim());
  assert.equal(packageJSON.scripts["test:course"], "vitest run course/test");
  assert.equal(packageJSON.scripts["test:course:checkpoint"], "vitest run");
  assert.equal(packageJSON.scripts["test:unit"], "vitest run tests");
  assert.equal(
    contentQualityCommands.filter(
      (command) => command === "npm run test:course",
    ).length,
    1,
  );
  assert.ok(contentQualityCommands.includes("npm run test:preservation"));
  assert.ok(contentQualityCommands.includes("npm run test:release"));
  assert.match(packageJSON.scripts["lint:content"], /--require-reviewed/);
  assert.match(packageJSON.scripts["quality:content"], /test:editorial/);
  assert.match(packageJSON.scripts["quality:content"], /lint:editorial/);
  assert.doesNotMatch(source, /GitBook|src\/content\/docs|lint:gitbook/i);
});

test("application workflow builds Next.js without deploying", async () => {
  const { source, workflow } = await readWorkflow("deploy.yml");

  assert.equal(workflow.name, "Next.js Application Build");
  assertReadOnlyNode22(workflow, "build");
  assertWorkflowPath(workflow, "course/**");
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

test("resolved Vitest config discovers application and course tests", async () => {
  const { vitestConfig } = await resolveConfig({
    root: fileURLToPath(repositoryRoot),
    config: fileURLToPath(new URL("vitest.config.ts", repositoryRoot)),
  });

  assert.ok(vitestConfig.include.includes("tests/**/*.test.ts"));
  assert.ok(vitestConfig.include.includes("course/test/**/*.test.ts"));
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
