import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import ts from "typescript";
import { resolveConfig } from "vitest/node";
import { parse } from "yaml";

const repositoryRoot = new URL("../", import.meta.url);
const repositoryRootPath = fileURLToPath(repositoryRoot);

const contentPaths = [
  "content/**",
  "course/**",
  "source/**",
  "scripts/**",
  "tests/**",
  "app/**",
  "components/**",
  "lib/**",
  "package.json",
  "package-lock.json",
  "vitest.config.ts",
  ".github/workflows/**",
];

const applicationPaths = [
  "app/**",
  "components/**",
  "content/**",
  "course/**",
  "lib/**",
  "public/**",
  "tests/**",
  "proxy.ts",
  "source.config.ts",
  "next.config.mjs",
  "postcss.config.mjs",
  "tsconfig.json",
  "package.json",
  "package-lock.json",
  ".github/workflows/deploy.yml",
];

const contentWorkflowContract = {
  name: "Content Quality",
  paths: contentPaths,
  concurrency: {
    group: "content-quality-${{ github.ref }}",
    "cancel-in-progress": true,
  },
  jobKey: "quality",
  job: {
    name: "Validate content and application",
    "runs-on": "ubuntu-latest",
    "timeout-minutes": 20,
    steps: [
      { uses: "actions/checkout@v4" },
      {
        uses: "actions/setup-node@v4",
        with: { "node-version": 22, cache: "npm" },
      },
      { run: "npm ci" },
      { run: "npm run quality:content" },
    ],
  },
};

const applicationWorkflowContract = {
  name: "Next.js Application Build",
  paths: applicationPaths,
  concurrency: {
    group: "next-build-${{ github.ref }}",
    "cancel-in-progress": true,
  },
  jobKey: "build",
  job: {
    name: "Build Next.js application",
    "runs-on": "ubuntu-latest",
    "timeout-minutes": 20,
    steps: [
      { uses: "actions/checkout@v4" },
      {
        uses: "actions/setup-node@v4",
        with: { "node-version": 22, cache: "npm" },
      },
      { run: "npm ci" },
      { run: "npm run typecheck" },
      { run: "npm run build" },
    ],
  },
};

async function readWorkflow(filename) {
  const source = await readFile(
    new URL(`.github/workflows/${filename}`, repositoryRoot),
    "utf8",
  );
  return { source, workflow: parse(source) };
}

function assertNoDeploymentCapabilities(source) {
  assert.doesNotMatch(
    source,
    /\bvercel\b|deploy-pages|upload-pages-artifact|actions\/deploy|\bsecrets\s*(?:\.|\[)|\bwrite-all\b/i,
  );
  assert.doesNotMatch(source, /^\s*[\w-]+:\s*write\s*(?:#.*)?$/im);
  assert.doesNotMatch(source, /^\s*-\s+(?:uses|run):[^\r\n]*\bdeploy\b/im);
}

function assertWorkflowContract(source, workflow, contract) {
  assert.equal(workflow.name, contract.name);
  assert.deepEqual(Object.keys(workflow.on).sort(), [
    "pull_request",
    "push",
    "workflow_dispatch",
  ]);
  assert.deepEqual(workflow.on.pull_request, { paths: contract.paths });
  assert.deepEqual(workflow.on.push, {
    branches: ["main"],
    paths: contract.paths,
  });
  assert.equal(workflow.on.workflow_dispatch, null);
  assert.deepEqual(workflow.permissions, { contents: "read" });
  assert.deepEqual(workflow.concurrency, contract.concurrency);
  assert.deepEqual(Object.keys(workflow.jobs), [contract.jobKey]);
  assert.equal(
    Object.hasOwn(workflow.jobs[contract.jobKey], "permissions"),
    false,
  );
  assert.deepEqual(workflow.jobs[contract.jobKey], contract.job);
  assertNoDeploymentCapabilities(source);
}

async function findTypeScriptFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nestedFiles = await Promise.all(
    entries.map(async (entry) => {
      const absolutePath = resolve(directory, entry.name);
      if (entry.isDirectory()) return findTypeScriptFiles(absolutePath);
      if (entry.isFile() && entry.name.endsWith(".ts")) return [absolutePath];
      return [];
    }),
  );
  return nestedFiles.flat().sort();
}

function canonicalPath(filePath) {
  const normalized = resolve(filePath).replaceAll("\\", "/");
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function assertCourseFilesIncluded(courseFiles, programFiles) {
  const includedFiles = new Set(programFiles.map(canonicalPath));
  const missingFiles = courseFiles
    .map(canonicalPath)
    .filter((filePath) => !includedFiles.has(filePath));

  assert.deepEqual(missingFiles, []);
}

test("content workflow validates the Fumadocs source tree", async () => {
  const { source, workflow } = await readWorkflow("content-quality.yml");

  assertWorkflowContract(source, workflow, contentWorkflowContract);
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
    packageJSON.scripts["test:release"],
    "node --test scripts/pi-release-contract.test.mjs",
  );
  assert.equal(
    packageJSON.scripts["test:evals-guide"],
    "node --test scripts/pi-evals-guide.test.mjs",
  );
  assert.deepEqual(contentQualityCommands, [
    "npm run test:content",
    "npm run test:preservation",
    "npm run test:editorial",
    "npm run test:unit",
    "npm run test:course",
    "npm run lint:sync",
    "npm run lint:frontmatter",
    "npm run lint:content",
    "npm run lint:editorial",
    "npm run lint:mermaid",
    "npm run test:release",
    "npm run test:evals-guide",
    "npm run lint:app",
  ]);
  assert.match(packageJSON.scripts["lint:content"], /--require-reviewed/);
  assert.match(packageJSON.scripts["quality:content"], /test:editorial/);
  assert.match(packageJSON.scripts["quality:content"], /lint:editorial/);
  assert.doesNotMatch(source, /GitBook|src\/content\/docs|lint:gitbook/i);
});

test("application workflow builds Next.js without deploying", async () => {
  const { source, workflow } = await readWorkflow("deploy.yml");

  assertWorkflowContract(source, workflow, applicationWorkflowContract);
  assert.doesNotMatch(source, /Astro|GitBook/i);
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

test("TypeScript configuration includes course sources", async () => {
  const configPath = fileURLToPath(new URL("tsconfig.json", repositoryRoot));
  const configResult = ts.readConfigFile(configPath, ts.sys.readFile);
  assert.equal(
    configResult.error,
    undefined,
    configResult.error
      ? ts.flattenDiagnosticMessageText(configResult.error.messageText, "\n")
      : undefined,
  );
  const parsedConfig = ts.parseJsonConfigFileContent(
    configResult.config,
    ts.sys,
    repositoryRootPath,
    undefined,
    configPath,
  );
  assert.equal(
    parsedConfig.errors.length,
    0,
    parsedConfig.errors
      .map((diagnostic) =>
        ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
      )
      .join("\n"),
  );
  const courseFiles = await findTypeScriptFiles(
    resolve(repositoryRootPath, "course"),
  );

  assert.ok(
    courseFiles.some((filePath) => /[\\/]course[\\/]src[\\/]/.test(filePath)),
  );
  assert.ok(
    courseFiles.some((filePath) => /[\\/]course[\\/]test[\\/]/.test(filePath)),
  );
  assertCourseFilesIncluded(courseFiles, parsedConfig.fileNames);
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

test("deployment guard rejects secrets and write or deploy capabilities", () => {
  const forbiddenSources = [
    "token: ${{ secrets.DEPLOY_TOKEN }}",
    "token: ${{ secrets['DEPLOY_TOKEN'] }}",
    "permissions: write-all",
    "contents: write",
    "- uses: example/deploy@v1",
  ];

  for (const source of forbiddenSources) {
    assert.throws(
      () => assertNoDeploymentCapabilities(source),
      `accepted forbidden workflow source: ${source}`,
    );
  }
});

test("workflow contract rejects extra jobs and conditional steps", async () => {
  const { source, workflow } = await readWorkflow("deploy.yml");
  const extraJobWorkflow = structuredClone(workflow);
  extraJobWorkflow.jobs.deploy = structuredClone(workflow.jobs.build);
  assert.throws(() =>
    assertWorkflowContract(
      source,
      extraJobWorkflow,
      applicationWorkflowContract,
    ),
  );

  const conditionalWorkflow = structuredClone(workflow);
  conditionalWorkflow.jobs.build.steps[2].if = "${{ always() }}";
  assert.throws(() =>
    assertWorkflowContract(
      source,
      conditionalWorkflow,
      applicationWorkflowContract,
    ),
  );

  const continueOnErrorWorkflow = structuredClone(workflow);
  continueOnErrorWorkflow.jobs.build.steps[3]["continue-on-error"] = true;
  assert.throws(() =>
    assertWorkflowContract(
      source,
      continueOnErrorWorkflow,
      applicationWorkflowContract,
    ),
  );
});

test("workflow contract rejects job-level permission overrides", async () => {
  const { source, workflow } = await readWorkflow("deploy.yml");
  workflow.jobs.build.permissions = "write-all";

  assert.throws(() =>
    assertWorkflowContract(source, workflow, applicationWorkflowContract),
  );
});

test("workflow contract rejects trigger drift", async () => {
  const { source, workflow } = await readWorkflow("deploy.yml");
  const extraPathWorkflow = structuredClone(workflow);
  extraPathWorkflow.on.pull_request.paths.push("README.md");
  assert.throws(() =>
    assertWorkflowContract(
      source,
      extraPathWorkflow,
      applicationWorkflowContract,
    ),
  );

  const extraBranchWorkflow = structuredClone(workflow);
  extraBranchWorkflow.on.push.branches.push("release");
  assert.throws(() =>
    assertWorkflowContract(
      source,
      extraBranchWorkflow,
      applicationWorkflowContract,
    ),
  );

  const missingDispatchWorkflow = structuredClone(workflow);
  delete missingDispatchWorkflow.on.workflow_dispatch;
  assert.throws(() =>
    assertWorkflowContract(
      source,
      missingDispatchWorkflow,
      applicationWorkflowContract,
    ),
  );
});

test("course inclusion guard rejects omitted source and test files", () => {
  const sourceFile = resolve(repositoryRootPath, "course/src/example.ts");
  const testFile = resolve(repositoryRootPath, "course/test/example.test.ts");

  assert.throws(() => assertCourseFilesIncluded([sourceFile], [testFile]));
  assert.throws(() => assertCourseFilesIncluded([testFile], [sourceFile]));
});
