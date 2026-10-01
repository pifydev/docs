import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { promisify } from "node:util";

import { checkSync, compareOptionalTermSets } from "./sync-check.mjs";

const exec = promisify(execFile);

test("sync-check validates all manifest page pairs", async () => {
  const manifest = JSON.parse(
    await readFile(
      new URL("../content/translation-manifest.json", import.meta.url),
      "utf8",
    ),
  );
  assert.equal(manifest.pages.length, 46);
  const { stdout } = await exec("node", ["scripts/sync-check.mjs"]);
  assert.match(stdout, /Checked 46 EN\/VI page pairs/);
  assert.match(stdout, /All public translations are in sync/);

  const result = await checkSync(new URL("../", import.meta.url));
  assert.equal(result.count, 46);
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
