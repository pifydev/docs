import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  mapSourcePath,
  normalizeDocument,
  rewriteLocaleLinks,
} from "./lib/gitbook-content.mjs";

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

test("index MDX becomes GitBook README", () => {
  assert.equal(mapSourcePath("index.mdx"), "README.md");
  assert.equal(mapSourcePath("how-to/add-custom-tool.md"), "how-to/add-custom-tool.md");
});

test("locale-root links become relative Markdown links", () => {
  const input = "Read [Quickstart](/en/quickstart/) and [API](/en/reference/api/).";
  assert.equal(
    rewriteLocaleLinks(input, "en", "how-to/add-custom-tool.md"),
    "Read [Quickstart](../quickstart.md) and [API](../reference/api.md).",
  );
});

test("home MDX becomes GitBook Markdown with stable metadata", () => {
  const input = `---
title: Pify Agent Book
description: English docs
template: splash
---

import Hero from "../../../components/Hero.astro";
import Callout from "../../../components/Callout.astro";

<Hero lang="en" />

<Callout type="tip">
Start with [Quickstart](/en/quickstart/).
</Callout>
`;
  const output = normalizeDocument(input, {
    locale: "en",
    key: "home",
    sourceRelativePath: "index.mdx",
    targetRelativePath: "README.md",
  });
  assert.match(output, /translation_key: home/);
  assert.match(output, /language: en/);
  assert.doesNotMatch(output, /template: splash/);
  assert.doesNotMatch(output, /import Hero/);
  assert.doesNotMatch(output, /<Hero/);
  assert.match(output, /\{% hint style="info" %\}/);
  assert.match(output, /\[Quickstart\]\(quickstart\.md\)/);
  assert.match(output, /\{% endhint %\}/);
});

test("FAQ contribution guidance does not reference retired Astro automation", async () => {
  const repositoryRoot = new URL("../", import.meta.url);
  const faqFiles = [
    new URL("src/content/docs/en/help/faq.md", repositoryRoot),
    new URL("src/content/docs/vi/help/faq.md", repositoryRoot),
  ];
  for (const faqFile of faqFiles) {
    const faq = await readFile(faqFile, "utf8");
    assert.doesNotMatch(faq, /src\/content\/docs\/(?:en|vi)\//);
    assert.doesNotMatch(faq, /scripts\/translate\.mjs/);
  }
});
