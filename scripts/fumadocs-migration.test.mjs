import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const exists = async (path) =>
  access(new URL(path, root)).then(
    () => true,
    () => false,
  );

test("repository uses Next.js and Fumadocs without Astro", async () => {
  const pkg = JSON.parse(await readFile(new URL("package.json", root), "utf8"));
  assert.ok(pkg.dependencies.next);
  assert.ok(pkg.dependencies["fumadocs-core"]);
  assert.ok(pkg.dependencies["fumadocs-ui"]);
  assert.ok(pkg.dependencies["fumadocs-mdx"]);
  assert.equal(pkg.dependencies.astro, undefined);
  assert.equal(await exists("astro.config.mjs"), false);
  assert.equal(await exists("next.config.mjs"), true);
});

test("content exposes only directory-based English and Vietnamese locales", async () => {
  const manifest = JSON.parse(
    await readFile(new URL("content/translation-manifest.json", root), "utf8"),
  );
  assert.equal(manifest.pages.length, 23);
  assert.equal(manifest.pages[0].en, "index.mdx");
  assert.equal(manifest.pages[0].vi, "index.mdx");
  for (const locale of ["en", "vi"]) {
    assert.equal(await exists(`content/${locale}/index.mdx`), true);
    assert.equal(await exists(`content/${locale}/meta.json`), true);
    assert.equal(await exists(`content/${locale}/README.md`), false);
    assert.equal(await exists(`content/${locale}/SUMMARY.md`), false);
    assert.equal(await exists(`content/${locale}/.gitbook.yaml`), false);
  }
});

test("public app registers only en and vi", async () => {
  const source = await readFile(new URL("lib/i18n.ts", root), "utf8");
  assert.match(source, /languages:\s*\[\s*["']en["'],\s*["']vi["']\s*\]/);
  assert.doesNotMatch(source, /["']zh["']/);
});
