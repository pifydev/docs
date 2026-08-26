import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import { matchesGlob, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import ts from "typescript";
import { resolveConfig } from "vitest/node";
import { parse } from "yaml";

const repositoryRoot = new URL("../", import.meta.url);
const repositoryRootPath = fileURLToPath(repositoryRoot);
const maximumJobTimeoutMinutes = 20;

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
  runCommands: ["npm ci", "npm run quality:content"],
};

const applicationWorkflowContract = {
  name: "Next.js Application Build",
  paths: applicationPaths,
  concurrency: {
    group: "next-build-${{ github.ref }}",
    "cancel-in-progress": true,
  },
  jobKey: "build",
  runCommands: ["npm ci", "npm run typecheck", "npm run build"],
};

async function readWorkflow(filename) {
  const source = await readFile(
    new URL(`.github/workflows/${filename}`, repositoryRoot),
    "utf8",
  );
  return { source, workflow: parse(source) };
}

function nestedEntries(value) {
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, nestedValue]) => [
    [key, nestedValue],
    ...nestedEntries(nestedValue),
  ]);
}

function nestedStrings(value) {
  if (typeof value === "string") return [value];
  if (!value || typeof value !== "object") return [];
  return Object.values(value).flatMap(nestedStrings);
}

function assertNoVercelCredentials(value) {
  const vercelCredentialName =
    /^VERCEL_(?:(?:.*_)?(?:TOKEN|KEY|SECRET|PASSWORD|CREDENTIALS?)(?:_.*)?|ORG_ID|PROJECT_ID|TEAM_ID)$/i;
  const vercelCredentialReference =
    /\bVERCEL_(?:(?:.*_)?(?:TOKEN|KEY|SECRET|PASSWORD|CREDENTIALS?)(?:_.*)?|ORG_ID|PROJECT_ID|TEAM_ID)\b/i;
  for (const [key, nestedValue] of nestedEntries(value)) {
    assert.doesNotMatch(key, vercelCredentialName);
    if (typeof nestedValue === "string") {
      assert.doesNotMatch(nestedValue, vercelCredentialReference);
    }
  }
}

function assertNoDeploymentCommand(command) {
  assert.doesNotMatch(
    command,
    /\b(?:npm|pnpm|bun)\s+run\s+deploy\b|\byarn\s+(?:run\s+)?deploy\b|\bvercel\s+(?:deploy\b|--prod\b)|\b(?:wrangler\s+)?pages\s+deploy\b|\bwrangler\s+deploy\b|\b(?:firebase|netlify)\s+deploy\b/i,
  );
}

function assertNoDeploymentCapabilities(workflow) {
  for (const job of Object.values(workflow.jobs ?? {})) {
    for (const value of nestedStrings(job)) {
      assert.doesNotMatch(value, /\bsecrets\s*(?:\.|\[)/i);
    }
    assertNoVercelCredentials(job.env);

    if (!Array.isArray(job.steps)) continue;
    for (const step of job.steps) {
      if (typeof step.uses === "string") {
        assert.doesNotMatch(
          step.uses,
          /^(?:actions\/(?:deploy-pages|upload-pages-artifact)|peaceiris\/actions-gh-pages|jamesives\/github-pages-deploy-action|firebaseextended\/action-hosting-deploy|azure\/static-web-apps-deploy|amondnet\/vercel-action|cloudflare\/pages-action|vercel\/[^@\s]+|[^/\s]+\/[^@\s]*(?:deploy|deployment)[^@\s]*)@/i,
        );
      }
      assertNoVercelCredentials(step.env);
      assertNoVercelCredentials(step.with);
      if (typeof step.run === "string") assertNoDeploymentCommand(step.run);
      for (const input of nestedStrings(step.with)) {
        assertNoDeploymentCommand(input);
      }
    }
  }
}

function assertContainsRequired(actualValues, requiredValues) {
  assert.ok(Array.isArray(actualValues));
  const actualSet = new Set(actualValues);
  const missingValues = requiredValues.filter((value) => !actualSet.has(value));
  assert.deepEqual(missingValues, []);
}

function negativePatternOverlapsRequired(negativePattern, requiredPattern) {
  const pattern = negativePattern.slice(1);
  const requiredIsRoot = requiredPattern.endsWith("/**");
  if (!requiredIsRoot) return matchesGlob(requiredPattern, pattern);

  const protectedSegments = requiredPattern.slice(0, -3).split("/");
  const patternSegments = pattern.split("/");
  for (let index = 0; index < protectedSegments.length; index += 1) {
    const patternSegment = patternSegments[index];
    if (patternSegment === undefined) return true;
    if (patternSegment === "**") return true;
    if (!matchesGlob(protectedSegments[index], patternSegment)) return false;
  }
  return true;
}

function assertRequiredPatterns(patterns, requiredPatterns) {
  assertContainsRequired(patterns, requiredPatterns);
  for (const requiredPattern of requiredPatterns) {
    const lastRequiredIndex = patterns.lastIndexOf(requiredPattern);
    const overlappingNegative = patterns
      .slice(lastRequiredIndex + 1)
      .find(
        (pattern) =>
          typeof pattern === "string" &&
          pattern.startsWith("!") &&
          negativePatternOverlapsRequired(pattern, requiredPattern),
      );
    assert.equal(
      overlappingNegative,
      undefined,
      `${requiredPattern} is negated by ${overlappingNegative}`,
    );
  }
}

function assertReadOnlyPermissions(
  permissions,
  { required = false, requireContents = false } = {},
) {
  if (permissions === undefined) {
    assert.equal(required, false);
    return;
  }
  if (typeof permissions === "string") {
    assert.equal(permissions, "read-all");
    return;
  }

  assert.ok(permissions && typeof permissions === "object");
  for (const access of Object.values(permissions)) {
    assert.ok(access === "read" || access === "none");
  }
  if (requireContents) assert.equal(permissions.contents, "read");
}

function hasNonemptyRunner(runsOn) {
  if (typeof runsOn === "string") return runsOn.trim().length > 0;
  if (Array.isArray(runsOn)) {
    return runsOn.length > 0 && runsOn.every(hasNonemptyRunner);
  }
  if (!runsOn || typeof runsOn !== "object") return false;
  const runnerValues = Object.values(runsOn);
  return runnerValues.length > 0 && runnerValues.every(hasNonemptyRunner);
}

function assertValidJob(job) {
  assert.ok(job && typeof job === "object");
  assertReadOnlyPermissions(job.permissions);
  assert.equal(Object.hasOwn(job, "secrets"), false);
  assert.equal(Object.hasOwn(job, "uses"), false);
  assert.ok(hasNonemptyRunner(job["runs-on"]));
  assert.ok(Number.isInteger(job["timeout-minutes"]));
  assert.ok(job["timeout-minutes"] > 0);
  assert.ok(job["timeout-minutes"] <= maximumJobTimeoutMinutes);
  assert.ok(Array.isArray(job.steps));
  assert.ok(job.steps.length > 0);
  for (const step of job.steps) {
    assert.ok(step && typeof step === "object");
  }
}

function assertRequiredJob(workflow, job, runCommands) {
  assert.ok(job);
  assert.ok(Array.isArray(job.steps));
  assert.equal(Object.hasOwn(job, "if"), false);
  assert.equal(Object.hasOwn(job, "continue-on-error"), false);
  assert.equal(Object.hasOwn(workflow.defaults ?? {}, "run"), false);
  assert.equal(Object.hasOwn(job.defaults ?? {}, "run"), false);
  for (const step of job.steps) {
    assert.equal(Object.hasOwn(step, "if"), false);
    assert.equal(Object.hasOwn(step, "continue-on-error"), false);
    if (Object.hasOwn(step, "run")) {
      assert.equal(Object.hasOwn(step, "shell"), false);
      assert.equal(Object.hasOwn(step, "working-directory"), false);
    }
  }

  assert.equal(job.steps.length, runCommands.length + 2);
  const [checkoutStep, setupNodeStep, ...runSteps] = job.steps;
  assert.match(checkoutStep.uses, /^actions\/checkout@\S+$/);
  assert.equal(Object.hasOwn(checkoutStep, "run"), false);
  assert.match(setupNodeStep.uses, /^actions\/setup-node@\S+$/);
  assert.equal(Object.hasOwn(setupNodeStep, "run"), false);
  assert.match(
    String(setupNodeStep.with?.["node-version"]),
    /^22(?:\.(?:x|\d+)){0,2}$/i,
  );
  assert.equal(setupNodeStep.with?.cache, "npm");
  assert.deepEqual(
    runSteps.map((step) => step.run),
    runCommands,
  );
  for (const step of runSteps) {
    assert.equal(Object.hasOwn(step, "uses"), false);
  }
}

function assertWorkflowContract(workflow, contract) {
  assert.equal(workflow.name, contract.name);
  for (const event of ["pull_request", "push", "workflow_dispatch"]) {
    assert.ok(Object.hasOwn(workflow.on, event));
  }
  assertRequiredPatterns(workflow.on.pull_request.paths, contract.paths);
  assertRequiredPatterns(workflow.on.push.paths, contract.paths);
  assertRequiredPatterns(workflow.on.push.branches, ["main"]);
  assertReadOnlyPermissions(workflow.permissions, {
    required: true,
    requireContents: true,
  });
  assert.deepEqual(workflow.concurrency, contract.concurrency);
  for (const job of Object.values(workflow.jobs)) assertValidJob(job);
  assertRequiredJob(
    workflow,
    workflow.jobs[contract.jobKey],
    contract.runCommands,
  );
  assertNoDeploymentCapabilities(workflow);
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

  assertWorkflowContract(workflow, contentWorkflowContract);
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

  assertWorkflowContract(workflow, applicationWorkflowContract);
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

test("deployment guard rejects secret contexts and deploy steps", () => {
  const forbiddenWorkflows = [
    {
      jobs: { audit: { steps: [{ env: { TOKEN: "${{ secrets.TOKEN }}" } }] } },
    },
    {
      jobs: {
        audit: { steps: [{ env: { TOKEN: "${{ secrets['TOKEN'] }}" } }] },
      },
    },
    { jobs: { audit: { steps: [{ uses: "example/deploy@v1" }] } } },
    {
      jobs: {
        audit: { steps: [{ uses: "peaceiris/actions-gh-pages@v4" }] },
      },
    },
    {
      jobs: { audit: { steps: [{ uses: "actions/deploy-pages@v4" }] } },
    },
    {
      jobs: {
        audit: {
          steps: [
            {
              uses: "cloudflare/wrangler-action@v3",
              with: { command: "pages deploy out" },
            },
          ],
        },
      },
    },
    { jobs: { audit: { steps: [{ run: "npm run deploy" }] } } },
    { jobs: { audit: { steps: [{ uses: "vercel/action@v1" }] } } },
    {
      jobs: {
        audit: { steps: [{ env: { VERCEL_TOKEN: "credential" } }] },
      },
    },
    {
      jobs: {
        audit: {
          steps: [{ with: { token: "${{ vars.VERCEL_DEPLOY_TOKEN }}" } }],
        },
      },
    },
  ];

  for (const workflow of forbiddenWorkflows) {
    assert.throws(
      () => assertNoDeploymentCapabilities(workflow),
      `accepted forbidden workflow: ${JSON.stringify(workflow)}`,
    );
  }
});

test("workflow contract allows additive safe paths and jobs", async () => {
  const { workflow } = await readWorkflow("deploy.yml");
  workflow.on.pull_request.paths.unshift("README.md");
  workflow.on.pull_request.paths.push("!examples/private/**");
  workflow.on.pull_request.paths.push("!c[a]rgo/**");
  workflow.on.pull_request.paths.push("docs/vercel-migration/**");
  workflow.on.pull_request.paths.push("!course/**", "course/**");
  workflow.on.push.paths.push("README.md");
  workflow.on.push.paths.push("!examples/private/**");
  workflow.on.push.paths.push("!c[a]rgo/**");
  workflow.on.push.paths.push("docs/vercel-migration/**");
  workflow.on.push.branches.push("release");
  workflow.on.push.branches.push("!experimental");
  workflow.on.schedule = [{ cron: "0 0 * * 0" }];
  workflow.jobs.build.steps[0] = {
    name: "Checkout sources",
    uses: "actions/checkout@v5",
    with: { "fetch-depth": 1 },
  };
  workflow.jobs.build.steps[1] = {
    name: "Set up Node",
    uses: "actions/setup-node@v5",
    with: {
      "node-version": "22.x",
      cache: "npm",
      "cache-dependency-path": "package-lock.json",
    },
  };
  workflow.jobs.docs = {
    name: "Read-only docs check",
    "runs-on": "ubuntu-latest",
    "timeout-minutes": 10,
    permissions: { contents: "read" },
    if: "github.event_name == 'pull_request'",
    "continue-on-error": true,
    steps: [
      { name: "Checkout", uses: "actions/checkout@v5" },
      {
        name: "Write report output",
        uses: "example/report@v1",
        with: { "output-mode": "write" },
      },
      {
        name: "Inspect npm",
        run: "npm run test:vercel-config",
        "continue-on-error": true,
      },
    ],
  };

  assert.doesNotThrow(() =>
    assertWorkflowContract(workflow, applicationWorkflowContract),
  );
});

test("workflow contract rejects unbounded jobs and conditional steps", async () => {
  const { workflow } = await readWorkflow("deploy.yml");
  const unboundedJobWorkflow = structuredClone(workflow);
  unboundedJobWorkflow.jobs.audit = {
    "runs-on": "ubuntu-latest",
    steps: [{ run: "npm --version" }],
  };
  assert.throws(() =>
    assertWorkflowContract(unboundedJobWorkflow, applicationWorkflowContract),
  );

  const conditionalWorkflow = structuredClone(workflow);
  conditionalWorkflow.jobs.build.steps[2].if = "${{ always() }}";
  assert.throws(() =>
    assertWorkflowContract(conditionalWorkflow, applicationWorkflowContract),
  );

  const continueOnErrorWorkflow = structuredClone(workflow);
  continueOnErrorWorkflow.jobs.build.steps[3]["continue-on-error"] = true;
  assert.throws(() =>
    assertWorkflowContract(
      continueOnErrorWorkflow,
      applicationWorkflowContract,
    ),
  );

  const deployWorkflow = structuredClone(workflow);
  deployWorkflow.jobs.audit = {
    "runs-on": "ubuntu-latest",
    "timeout-minutes": 10,
    steps: [{ uses: "example/deploy@v1" }],
  };
  assert.throws(() =>
    assertWorkflowContract(deployWorkflow, applicationWorkflowContract),
  );

  const secretWorkflow = structuredClone(workflow);
  secretWorkflow.jobs.build.steps[0].env = {
    TOKEN: "${{ secrets['DEPLOY_TOKEN'] }}",
  };
  assert.throws(() =>
    assertWorkflowContract(secretWorkflow, applicationWorkflowContract),
  );
});

test("workflow contract rejects job-level permission overrides", async () => {
  const { workflow } = await readWorkflow("deploy.yml");
  workflow.jobs.audit = {
    "runs-on": "ubuntu-latest",
    "timeout-minutes": 10,
    permissions: "write-all",
    steps: [{ run: "npm --version" }],
  };

  assert.throws(() =>
    assertWorkflowContract(workflow, applicationWorkflowContract),
  );
});

test("workflow contract rejects trigger drift", async () => {
  const { workflow } = await readWorkflow("deploy.yml");
  const missingPathWorkflow = structuredClone(workflow);
  missingPathWorkflow.on.pull_request.paths =
    missingPathWorkflow.on.pull_request.paths.filter(
      (path) => path !== "course/**",
    );
  assert.throws(() =>
    assertWorkflowContract(missingPathWorkflow, applicationWorkflowContract),
  );

  const missingMainWorkflow = structuredClone(workflow);
  missingMainWorkflow.on.push.branches = ["release"];
  assert.throws(() =>
    assertWorkflowContract(missingMainWorkflow, applicationWorkflowContract),
  );

  const missingDispatchWorkflow = structuredClone(workflow);
  delete missingDispatchWorkflow.on.workflow_dispatch;
  assert.throws(() =>
    assertWorkflowContract(
      missingDispatchWorkflow,
      applicationWorkflowContract,
    ),
  );

  for (const negativePath of [
    "!course/**",
    "!course/private/**",
    "!c[o]urse/**",
    "!c*e/**",
    "!**/test/**",
    "!*.json",
  ]) {
    const negatedPathWorkflow = structuredClone(workflow);
    negatedPathWorkflow.on.pull_request.paths.push(negativePath);
    assert.throws(() =>
      assertWorkflowContract(negatedPathWorkflow, applicationWorkflowContract),
    );
  }

  const negatedMainWorkflow = structuredClone(workflow);
  negatedMainWorkflow.on.push.branches.push("!main");
  assert.throws(() =>
    assertWorkflowContract(negatedMainWorkflow, applicationWorkflowContract),
  );

  const wildcardNegatedMainWorkflow = structuredClone(workflow);
  wildcardNegatedMainWorkflow.on.push.branches.push("!m*");
  assert.throws(() =>
    assertWorkflowContract(
      wildcardNegatedMainWorkflow,
      applicationWorkflowContract,
    ),
  );
});

test("required jobs reject custom shell overrides", async () => {
  const { workflow } = await readWorkflow("deploy.yml");
  const stepShellWorkflow = structuredClone(workflow);
  stepShellWorkflow.jobs.build.steps[2].shell = "echo {0}";
  assert.throws(() =>
    assertWorkflowContract(stepShellWorkflow, applicationWorkflowContract),
  );

  const jobShellWorkflow = structuredClone(workflow);
  jobShellWorkflow.jobs.build.defaults = { run: { shell: "echo {0}" } };
  assert.throws(() =>
    assertWorkflowContract(jobShellWorkflow, applicationWorkflowContract),
  );

  const workflowShellWorkflow = structuredClone(workflow);
  workflowShellWorkflow.defaults = { run: { shell: "echo {0}" } };
  assert.throws(() =>
    assertWorkflowContract(workflowShellWorkflow, applicationWorkflowContract),
  );

  const stepDirectoryWorkflow = structuredClone(workflow);
  stepDirectoryWorkflow.jobs.build.steps[2]["working-directory"] = "course";
  assert.throws(() =>
    assertWorkflowContract(stepDirectoryWorkflow, applicationWorkflowContract),
  );

  const jobDirectoryWorkflow = structuredClone(workflow);
  jobDirectoryWorkflow.jobs.build.defaults = {
    run: { "working-directory": "course" },
  };
  assert.throws(() =>
    assertWorkflowContract(jobDirectoryWorkflow, applicationWorkflowContract),
  );

  const workflowDirectoryWorkflow = structuredClone(workflow);
  workflowDirectoryWorkflow.defaults = {
    run: { "working-directory": "course" },
  };
  assert.throws(() =>
    assertWorkflowContract(
      workflowDirectoryWorkflow,
      applicationWorkflowContract,
    ),
  );
});

test("required jobs reject reordered or duplicate setup actions", async () => {
  const { workflow } = await readWorkflow("deploy.yml");
  const lateSetupWorkflow = structuredClone(workflow);
  const [setupNodeStep] = lateSetupWorkflow.jobs.build.steps.splice(1, 1);
  lateSetupWorkflow.jobs.build.steps.push(setupNodeStep);
  assert.throws(() =>
    assertWorkflowContract(lateSetupWorkflow, applicationWorkflowContract),
  );

  const duplicateSetupWorkflow = structuredClone(workflow);
  duplicateSetupWorkflow.jobs.build.steps.push({
    uses: "actions/setup-node@v5",
    with: { "node-version": 20, cache: "npm" },
  });
  assert.throws(() =>
    assertWorkflowContract(duplicateSetupWorkflow, applicationWorkflowContract),
  );

  const duplicateCheckoutWorkflow = structuredClone(workflow);
  duplicateCheckoutWorkflow.jobs.build.steps.push({
    uses: "actions/checkout@v5",
  });
  assert.throws(() =>
    assertWorkflowContract(
      duplicateCheckoutWorkflow,
      applicationWorkflowContract,
    ),
  );

  const prepActionWorkflow = structuredClone(workflow);
  prepActionWorkflow.jobs.build.steps.splice(2, 0, {
    uses: "example/prepare@v1",
  });
  assert.throws(() =>
    assertWorkflowContract(prepActionWorkflow, applicationWorkflowContract),
  );
});

test("step jobs require a runner", async () => {
  const { workflow } = await readWorkflow("deploy.yml");
  workflow.jobs.audit = {
    "timeout-minutes": 10,
    steps: [{ run: "npm --version" }],
  };

  assert.throws(() =>
    assertWorkflowContract(workflow, applicationWorkflowContract),
  );

  const emptyRunnerWorkflow = structuredClone(workflow);
  emptyRunnerWorkflow.jobs.audit["runs-on"] = [""];
  assert.throws(() =>
    assertWorkflowContract(emptyRunnerWorkflow, applicationWorkflowContract),
  );
});

test("reusable workflow jobs are rejected", async () => {
  const { workflow } = await readWorkflow("deploy.yml");
  workflow.jobs.reusable = {
    uses: "example/repository/.github/workflows/check.yml@v1",
    permissions: { contents: "read" },
  };

  assert.throws(() =>
    assertWorkflowContract(workflow, applicationWorkflowContract),
  );
});

test("course inclusion guard rejects omitted source and test files", () => {
  const sourceFile = resolve(repositoryRootPath, "course/src/example.ts");
  const testFile = resolve(repositoryRootPath, "course/test/example.test.ts");

  assert.throws(() => assertCourseFilesIncluded([sourceFile], [testFile]));
  assert.throws(() => assertCourseFilesIncluded([testFile], [sourceFile]));
});
