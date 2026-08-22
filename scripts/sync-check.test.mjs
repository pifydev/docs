import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import test from "node:test";
import { promisify } from "node:util";

import { checkSync, compareOptionalTermSets } from "./sync-check.mjs";

const exec = promisify(execFile);

test("sync-check validates all manifest page pairs", async () => {
  const { stdout } = await exec("node", ["scripts/sync-check.mjs"]);
  assert.match(stdout, /Checked 23 EN\/VI page pairs/);
  assert.match(stdout, /All public translations are in sync/);

  const result = await checkSync(new URL("../", import.meta.url));
  assert.equal(result.count, 23);
  assert.deepEqual(result.errors, []);
});

test("optional term sets compare only defined languages", () => {
  assert.deepEqual(
    compareOptionalTermSets({ en: ["Agent"], vi: ["Agent"] }),
    [],
  );
  assert.deepEqual(
    compareOptionalTermSets({ en: ["Agent"], vi: undefined }),
    [],
  );
  assert.deepEqual(compareOptionalTermSets({ en: [], vi: ["Agent"] }), []);
  assert.deepEqual(compareOptionalTermSets({ en: ["Agent"], vi: ["Tool"] }), [
    "terms_used differs (en vs vi)",
  ]);
});
