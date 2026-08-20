import { test } from "node:test";
import { strict as assert } from "node:assert";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);

test("validate-frontmatter exits 0 on current repo", async () => {
  const { stdout } = await exec("node", ["scripts/validate-frontmatter.mjs"]);
  assert.match(stdout, /All files OK/);
});
