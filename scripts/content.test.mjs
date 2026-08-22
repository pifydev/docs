import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

import { extractMermaidBlocks } from "./lib/markdown.mjs";
import { validateRepository } from "./validate-content.mjs";

const repositoryRoot = new URL("../", import.meta.url);
const manifestURL = new URL(
  "content/translation-manifest.json",
  repositoryRoot,
);

const rootPages = {
  en: [
    "index",
    "quickstart",
    "glossary",
    "---How-to guides---",
    "how-to",
    "---Reference---",
    "reference",
    "---Chapters---",
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
    "---Help---",
    "help",
    "changelog",
  ],
  vi: [
    "index",
    "quickstart",
    "glossary",
    "---Hướng dẫn---",
    "how-to",
    "---Tham khảo---",
    "reference",
    "---Các chương---",
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
    "---Hỗ trợ---",
    "help",
    "changelog",
  ],
};

const nestedPages = {
  "how-to": [
    "add-custom-tool",
    "plug-new-model",
    "stream-output",
    "persist-sessions",
    "customize-system-prompt",
  ],
  reference: ["api", "configuration", "environment-variables"],
  help: ["faq"],
};

async function exists(relativePath) {
  return access(new URL(relativePath, repositoryRoot)).then(
    () => true,
    () => false,
  );
}

test("translation manifest contains 23 unique EN/VI pairs", async () => {
  const manifest = JSON.parse(await readFile(manifestURL, "utf8"));
  assert.equal(manifest.version, 1);
  assert.equal(manifest.pages.length, 23);
  assert.equal(new Set(manifest.pages.map((page) => page.key)).size, 23);
  assert.equal(new Set(manifest.pages.map((page) => page.en)).size, 23);
  assert.equal(new Set(manifest.pages.map((page) => page.vi)).size, 23);
  assert.deepEqual(manifest.pages[0], {
    key: "home",
    group: "start",
    en: "index.mdx",
    vi: "index.mdx",
    zh: "README.md",
  });

  for (const page of manifest.pages) {
    assert.match(page.key, /^[a-z0-9][a-z0-9-]*$/);
    assert.match(page.en, /\.(?:md|mdx)$/);
    assert.match(page.vi, /\.(?:md|mdx)$/);
    assert.equal(page.en, page.vi);
  }
});

test("Chinese references remain internal provenance only", async () => {
  const manifest = JSON.parse(await readFile(manifestURL, "utf8"));
  const chinese = manifest.pages
    .filter((page) => page.zh)
    .map((page) => page.key);
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

test("Fumadocs navigation contains every public page in stable localized order", async () => {
  for (const locale of ["en", "vi"]) {
    const rootMeta = JSON.parse(
      await readFile(
        new URL(`content/${locale}/meta.json`, repositoryRoot),
        "utf8",
      ),
    );
    assert.deepEqual(rootMeta.pages, rootPages[locale]);

    for (const [directory, pages] of Object.entries(nestedPages)) {
      const meta = JSON.parse(
        await readFile(
          new URL(`content/${locale}/${directory}/meta.json`, repositoryRoot),
          "utf8",
        ),
      );
      assert.deepEqual(meta.pages, pages);
    }
  }
});

test("GitBook authoring files and syntax are absent", async () => {
  for (const locale of ["en", "vi"]) {
    assert.equal(await exists(`content/${locale}/README.md`), false);
    assert.equal(await exists(`content/${locale}/SUMMARY.md`), false);
    assert.equal(await exists(`content/${locale}/.gitbook.yaml`), false);

    const home = await readFile(
      new URL(`content/${locale}/index.mdx`, repositoryRoot),
      "utf8",
    );
    assert.doesNotMatch(home, /\{%\s*(?:hint|endhint)\b/);
    assert.match(home, /<Callout type="info">/);
  }
});

test("FAQ contribution guidance uses the canonical content tree", async () => {
  for (const locale of ["en", "vi"]) {
    const faq = await readFile(
      new URL(`content/${locale}/help/faq.md`, repositoryRoot),
      "utf8",
    );
    assert.doesNotMatch(faq, /src\/content\/docs\/(?:en|vi)\//);
    assert.doesNotMatch(faq, /scripts\/translate\.mjs/);
  }
});

test("repository satisfies the Fumadocs content contract", async () => {
  const errors = await validateRepository(new URL("..", import.meta.url));
  assert.deepEqual(errors, []);
});

test("Mermaid extraction covers blocks outside numbered chapters", () => {
  const markdown = "# Guide\n\n```mermaid\ngraph TD\n  A --> B\n```\n";
  assert.deepEqual(extractMermaidBlocks(markdown), ["graph TD\n  A --> B"]);
});
