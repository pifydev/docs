import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import test from "node:test";
import { promisify } from "node:util";

import { validateFrontmatter } from "./validate-frontmatter.mjs";

const exec = promisify(execFile);

test("frontmatter validation covers every public document", async () => {
  const { stdout } = await exec("node", ["scripts/validate-frontmatter.mjs"]);
  assert.match(stdout, /Validated 46 public content files/);
  assert.match(stdout, /All frontmatter is valid/);

  const result = await validateFrontmatter(new URL("../", import.meta.url));
  assert.equal(result.count, 46);
  assert.deepEqual(result.errors, []);
});
