import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";

import { validateFrontmatter } from "./validate-frontmatter.mjs";

const exec = promisify(execFile);
const publicLocales = ["en", "vi"];

function publicDocumentCount(manifest, locales = publicLocales) {
  return manifest.pages.length * locales.length;
}

async function withChapterFixture(chapter, callback) {
  const root = await mkdtemp(path.join(tmpdir(), "pify-frontmatter-"));
  const manifest = {
    pages: [
      {
        key: "ch11-testing-evaluation",
        en: "ch11-testing-evaluation.md",
        vi: "ch11-testing-evaluation.md",
      },
    ],
  };
  const frontmatter = `---
title: Testing and evaluation
translation_key: ch11-testing-evaluation
language: LOCALE
chapter: ${chapter}
source_url: https://docs.pify.dev/LOCALE/ch11-testing-evaluation
status: reviewed
---
`;

  try {
    await mkdir(path.join(root, "content", "en"), { recursive: true });
    await mkdir(path.join(root, "content", "vi"), { recursive: true });
    await writeFile(
      path.join(root, "content", "translation-manifest.json"),
      JSON.stringify(manifest),
    );
    await Promise.all(
      ["en", "vi"].map((locale) =>
        writeFile(
          path.join(root, "content", locale, "ch11-testing-evaluation.md"),
          frontmatter.replaceAll("LOCALE", locale),
        ),
      ),
    );
    await callback(pathToFileURL(`${root}${path.sep}`));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("frontmatter validation covers every public document", async () => {
  const manifest = JSON.parse(
    await readFile(
      new URL("../content/translation-manifest.json", import.meta.url),
      "utf8",
    ),
  );
  const expectedCount = publicDocumentCount(manifest);
  const { stdout } = await exec("node", ["scripts/validate-frontmatter.mjs"]);
  assert.match(
    stdout,
    new RegExp(`Validated ${expectedCount} public content files`),
  );
  assert.match(stdout, /All frontmatter is valid/);

  const result = await validateFrontmatter(new URL("../", import.meta.url));
  assert.equal(result.count, expectedCount);
  assert.deepEqual(result.errors, []);
});

test("frontmatter count expectation follows the manifest and public locales", () => {
  assert.equal(publicDocumentCount({ pages: [{}, {}, {}] }, ["en", "vi"]), 6);
});

test("frontmatter validation accepts chapter 11 and still rejects chapter 12", async () => {
  await withChapterFixture(11, async (rootURL) => {
    const result = await validateFrontmatter(rootURL);
    assert.deepEqual(result.errors, []);
  });

  await withChapterFixture(12, async (rootURL) => {
    const result = await validateFrontmatter(rootURL);
    assert.equal(result.errors.length, 2);
    assert.match(
      result.errors[0],
      /chapter must be an integer from 1 through 11/,
    );
    assert.match(
      result.errors[1],
      /chapter must be an integer from 1 through 11/,
    );
  });
});
