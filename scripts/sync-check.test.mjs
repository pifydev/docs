import { test } from "node:test";
import { strict as assert } from "node:assert";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);

test("sync-check exits 0 on current repo", async () => {
  const { stdout } = await exec("node", ["scripts/sync-check.mjs"]);
  assert.match(stdout, /All chapters in sync/);
});
