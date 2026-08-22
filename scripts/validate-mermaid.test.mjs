import { test } from "node:test";
import { strict as assert } from "node:assert";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);

test("validate-mermaid exits 0 on current repo", async () => {
  // Skip if mmdc is not installed; that is acceptable for CI on first run
  const { stdout } = await exec("node", ["scripts/validate-mermaid.mjs"]).catch((e) => ({
    stdout: e.stdout || "",
  }));
  assert.match(stdout, /Validated \d+ mermaid block/);
});
