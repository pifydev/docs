import { test } from "node:test";
import { strict as assert } from "node:assert";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { compareOptionalTermSets } from "./sync-check.mjs";

const exec = promisify(execFile);

test("sync-check exits 0 on current repo", async () => {
  const { stdout } = await exec("node", ["scripts/sync-check.mjs"]);
  assert.match(stdout, /All chapters in sync/);
});

test("chapter discovery excludes changelog", () => {
  assert.equal(/^ch\d{2}-[a-z0-9-]+\.md$/.test("changelog.md"), false);
  assert.equal(/^ch\d{2}-[a-z0-9-]+\.md$/.test("ch01-overview.md"), true);
});

test("optional term sets compare only defined languages", () => {
  assert.deepEqual(compareOptionalTermSets({ en: ["Agent"], vi: ["Agent"] }), []);
  assert.deepEqual(compareOptionalTermSets({ zh: undefined, en: ["Agent"], vi: ["Agent"] }), []);
  assert.deepEqual(compareOptionalTermSets({ zh: [], en: ["Agent"], vi: ["Agent"] }), []);
});
