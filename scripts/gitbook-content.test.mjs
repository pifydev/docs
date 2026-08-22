import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const manifestURL = new URL("../content/translation-manifest.json", import.meta.url);

test("translation manifest contains 23 unique EN/VI pairs", async () => {
  const manifest = JSON.parse(await readFile(manifestURL, "utf8"));
  assert.equal(manifest.version, 1);
  assert.equal(manifest.pages.length, 23);
  assert.equal(new Set(manifest.pages.map((page) => page.key)).size, 23);
  assert.equal(new Set(manifest.pages.map((page) => page.en)).size, 23);
  assert.equal(new Set(manifest.pages.map((page) => page.vi)).size, 23);
  for (const page of manifest.pages) {
    assert.match(page.key, /^[a-z0-9][a-z0-9-]*$/);
    assert.ok(page.en.endsWith(".md"));
    assert.ok(page.vi.endsWith(".md"));
    assert.equal(page.en, page.vi);
  }
});

test("Chinese references are limited to home and chapters 1 through 10", async () => {
  const manifest = JSON.parse(await readFile(manifestURL, "utf8"));
  const chinese = manifest.pages.filter((page) => page.zh).map((page) => page.key);
  assert.deepEqual(chinese, [
    "home",
    "ch01-overview",
    "ch02-three-layer-arch",
    "ch03-agent-loop",
    "ch04-model-invocation",
    "ch05-tool-system",
    "ch06-messages",
    "ch07-event-driven",
    "ch08-context-engineering",
    "ch09-compaction",
    "ch10-session",
  ]);
});
