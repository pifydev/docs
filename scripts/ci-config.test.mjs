import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const repositoryRoot = new URL("../", import.meta.url);

test("deploy workflow uses valid expressions and runs its lint dependency on every event", async () => {
  const workflow = await readFile(
    new URL(".github/workflows/deploy.yml", repositoryRoot),
    "utf8",
  );
  const normalizedWorkflow = workflow.replace(/\r\n/g, "\n");
  const lintMatch = normalizedWorkflow.match(/  lint:\n(?<body>[\s\S]*?)\n  build:/);

  assert.ok(lintMatch, "lint job block must be present");
  assert.doesNotMatch(normalizedWorkflow, /^\s*if:\s+.*"/gm);
  assert.doesNotMatch(lintMatch.groups.body, /^\s+if:/m);
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
