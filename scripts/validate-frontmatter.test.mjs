import { test } from "node:test";
import { strict as assert } from "node:assert";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);

test("validate-frontmatter exits 0 on current repo", async () => {
  const { stdout } = await exec("node", ["scripts/validate-frontmatter.mjs"]);
  assert.match(stdout, /All files OK/);
});

test("chapter filename pattern excludes changelog", () => {
  assert.equal(/^ch\d{2}-[a-z0-9-]+\.md$/.test("changelog.md"), false);
  assert.equal(/^ch\d{2}-[a-z0-9-]+\.md$/.test("ch01-overview.md"), true);
});
