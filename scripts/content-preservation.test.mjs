import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  contentMetrics,
  preservationManifestCoverageErrors,
  preservationErrors,
  validatePreservation,
} from "./lib/content-preservation.mjs";

test("contentMetrics records semantic structure without frontmatter or fenced code", () => {
  const source = `---
title: Demo
---

## One

Useful prose here.

### Two

| A | B |
|---|---|
| 1 | 2 |

\`\`\`ts
const hidden = "not prose";
## Not a heading
\`\`\`

\`\`\`mermaid
graph TD
  A --> B
\`\`\``;

  assert.deepEqual(contentMetrics(source), {
    words: 3,
    headings: [2, 3],
    codeFences: ["ts", "mermaid"],
    mermaidBlocks: 1,
    tables: 1,
  });
});

test("contentMetrics handles CRLF, tilde fences, and a final table", () => {
  const source = [
    "---",
    "title: Edge case",
    "---",
    "",
    "## Visible heading",
    "",
    "Words remain visible.",
    "",
    "~~~ js",
    "## Hidden heading",
    "hidden code words",
    "~~~",
    "",
    "| Name | Value |",
    "| :--- | ---: |",
    "| one | two |",
  ].join("\r\n");

  assert.deepEqual(contentMetrics(source), {
    words: 3,
    headings: [2],
    codeFences: ["js"],
    mermaidBlocks: 0,
    tables: 1,
  });
});

test("preservationErrors rejects silent coverage loss", () => {
  const errors = preservationErrors(
    "en/ch01-overview.md",
    {
      words: 700,
      headings: [2, 2],
      codeFences: ["ts"],
      mermaidBlocks: 0,
      tables: 0,
    },
    {
      baselineWords: 1000,
      minimumWordRatio: 0.8,
      minimumHeadingCounts: { 2: 3 },
      minimumCodeFences: 2,
      minimumMermaidBlocks: 1,
      minimumTables: 1,
      approvedDeletions: [],
    },
  );

  assert.equal(errors.length, 5);
  for (const error of errors) assert.match(error, /^en\/ch01-overview\.md:/);
});

test("preservationErrors enforces each requested heading depth independently", () => {
  const errors = preservationErrors(
    "en/reference/api.md",
    {
      words: 100,
      headings: [2, 3],
      codeFences: [],
      mermaidBlocks: 0,
      tables: 0,
    },
    {
      baselineWords: 100,
      minimumWordRatio: 0,
      minimumHeadingCounts: { 2: 1, 3: 2, 4: 1 },
    },
  );

  assert.deepEqual(errors, [
    "en/reference/api.md: H3 headings 1 below minimum 2",
    "en/reference/api.md: H4 headings 0 below minimum 1",
  ]);
});

test("approved word deletions can lower the word minimum explicitly", () => {
  const rule = {
    baselineWords: 1000,
    minimumWordRatio: 0.8,
    minimumHeadingCounts: {},
    minimumCodeFences: 0,
    minimumMermaidBlocks: 0,
    minimumTables: 0,
    approvedDeletions: [{ metric: "words", amount: 100 }],
  };

  assert.deepEqual(
    preservationErrors(
      "en/quickstart.md",
      {
        words: 700,
        headings: [],
        codeFences: [],
        mermaidBlocks: 0,
        tables: 0,
      },
      rule,
    ),
    [],
  );
});

test("heading allowances must be scoped to a valid depth", () => {
  const errors = preservationErrors(
    "en/reference/api.md",
    {
      words: 100,
      headings: [],
      codeFences: [],
      mermaidBlocks: 0,
      tables: 0,
    },
    {
      baselineWords: 100,
      minimumWordRatio: 0,
      minimumHeadingCounts: { 2: 1, 3: 1 },
      approvedDeletions: [{ metric: "headings", amount: 1 }],
    },
  );

  assert.deepEqual(errors, [
    "en/reference/api.md: H2 headings 0 below minimum 1",
    "en/reference/api.md: H3 headings 0 below minimum 1",
  ]);
});

function validRule(path) {
  return {
    path,
    baselineWords: 0,
    minimumWordRatio: 0,
    minimumHeadingCounts: {},
    minimumCodeFences: 0,
    minimumMermaidBlocks: 0,
    minimumTables: 0,
    approvedDeletions: [],
  };
}

test("validatePreservation resolves locale paths below the content root", async () => {
  const rule = validRule("en/index.mdx");
  const errors = await validatePreservation(new URL("../", import.meta.url), {
    version: 1,
    pages: [rule],
  });

  assert.deepEqual(errors, []);
});

test("validatePreservation rejects paths outside the content root", async () => {
  const root = new URL("../", import.meta.url);
  const manifest = {
    version: 1,
    pages: [
      validRule("../package.json"),
      validRule("/package.json"),
      validRule("https://example.com/page.md"),
    ],
  };

  const errors = await validatePreservation(root, manifest);
  assert.deepEqual(errors, [
    "preservation-manifest.json: pages[0].path must be a locale-relative Markdown path",
    "preservation-manifest.json: pages[1].path must be a locale-relative Markdown path",
    "preservation-manifest.json: pages[2].path must be a locale-relative Markdown path",
  ]);
});

test("validatePreservation reports malformed manifest schema deterministically", async () => {
  const root = new URL("../", import.meta.url);
  assert.deepEqual(await validatePreservation(root, {}), [
    "preservation-manifest.json: version must be 1",
    "preservation-manifest.json: pages must be a non-empty array",
  ]);
  assert.deepEqual(
    await validatePreservation(root, { version: 1, pages: [] }),
    ["preservation-manifest.json: pages must be a non-empty array"],
  );

  const malformed = validRule("en/index.mdx");
  malformed.baselineWords = -1;
  malformed.minimumWordRatio = 2;
  malformed.minimumHeadingCounts = { 1: 1, 2: -1 };
  malformed.minimumCodeFences = "one";
  malformed.approvedDeletions = [{ metric: "headings", amount: 1 }];
  const errors = await validatePreservation(root, {
    version: 2,
    pages: [malformed, { ...validRule("en/index.mdx"), path: undefined }],
  });

  assert.deepEqual(errors, [
    "preservation-manifest.json: version must be 1",
    "preservation-manifest.json: pages[0].baselineWords must be a finite nonnegative number",
    "preservation-manifest.json: pages[0].minimumWordRatio must be a number from 0 through 1",
    "preservation-manifest.json: pages[0].minimumHeadingCounts.1 must use heading depth 2, 3, or 4",
    "preservation-manifest.json: pages[0].minimumHeadingCounts.2 must be a finite nonnegative number",
    "preservation-manifest.json: pages[0].minimumCodeFences must be a finite nonnegative number",
    "preservation-manifest.json: pages[0].approvedDeletions[0].section is required",
    "preservation-manifest.json: pages[0].approvedDeletions[0].reason is required",
    "preservation-manifest.json: pages[0].approvedDeletions[0].evidence is required",
    "preservation-manifest.json: pages[0].approvedDeletions[0].depth must be 2, 3, or 4 for heading allowances",
    "preservation-manifest.json: pages[1].path is required",
  ]);

  assert.deepEqual(
    await validatePreservation(root, {
      version: 1,
      pages: [validRule("en/index.mdx"), validRule("en/index.mdx")],
    }),
    ["preservation-manifest.json: pages[1].path duplicates pages[0].path"],
  );

  assert.deepEqual(
    await validatePreservation(root, {
      version: 1,
      pages: [{ path: "en/index.mdx" }],
    }),
    [
      "preservation-manifest.json: pages[0].baselineWords must be a finite nonnegative number",
      "preservation-manifest.json: pages[0].minimumWordRatio must be a number from 0 through 1",
      "preservation-manifest.json: pages[0].minimumHeadingCounts must be an object",
      "preservation-manifest.json: pages[0].minimumCodeFences must be a finite nonnegative number",
      "preservation-manifest.json: pages[0].minimumMermaidBlocks must be a finite nonnegative number",
      "preservation-manifest.json: pages[0].minimumTables must be a finite nonnegative number",
      "preservation-manifest.json: pages[0].approvedDeletions must be an array",
    ],
  );
});

test("validatePreservation reads every manifest page and combines diagnostics", async () => {
  const rootURL = new URL("../", import.meta.url);
  const manifest = {
    version: 1,
    pages: [
      {
        path: "en/index.mdx",
        baselineWords: 1,
        minimumWordRatio: 0,
        minimumHeadingCounts: {},
        minimumCodeFences: 0,
        minimumMermaidBlocks: 0,
        minimumTables: 0,
        approvedDeletions: [],
      },
      {
        path: "en/does-not-exist.md",
        baselineWords: 1,
        minimumWordRatio: 0,
        minimumHeadingCounts: {},
        minimumCodeFences: 0,
        minimumMermaidBlocks: 0,
        minimumTables: 0,
        approvedDeletions: [],
      },
    ],
  };

  const errors = await validatePreservation(rootURL, manifest);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /^en\/does-not-exist\.md:/);
});

test("preservation manifest coverage rejects incomplete and mis-keyed translations", () => {
  const translations = {
    pages: [
      { key: "home", en: "index.mdx", vi: "index.mdx" },
      { key: "quickstart", en: "quickstart.md", vi: "quickstart.md" },
    ],
  };
  const manifest = {
    pages: [
      validRule("en/index.mdx"),
      { ...validRule("vi/index.mdx"), key: "wrong-key" },
      { ...validRule("en/quickstart.md"), key: "quickstart" },
    ],
  };
  manifest.pages[0].key = "home";

  assert.deepEqual(preservationManifestCoverageErrors(translations, manifest), [
    "preservation-manifest.json: pages[1].key must match translation key home",
    "preservation-manifest.json: missing pages[3] for translation key quickstart (vi/quickstart.md)",
  ]);
});

test("the repository content satisfies the historical preservation baseline", async () => {
  const [manifest, translations] = await Promise.all([
    readFile(
      new URL("../content/preservation-manifest.json", import.meta.url),
      "utf8",
    ).then(JSON.parse),
    readFile(
      new URL("../content/translation-manifest.json", import.meta.url),
      "utf8",
    ).then(JSON.parse),
  ]);
  assert.equal(manifest.pages.length, 86);
  const expectedPages = translations.pages.flatMap((page) => [
    { key: page.key, path: `en/${page.en}` },
    { key: page.key, path: `vi/${page.vi}` },
  ]);
  const legacyExpectedPages = translations.pages
    .filter((page) => page.group !== "course")
    .flatMap((page) => [
      { key: page.key, path: `en/${page.en}` },
      { key: page.key, path: `vi/${page.vi}` },
    ]);
  const courseExpectedPages = translations.pages
    .filter((page) => page.group === "course")
    .flatMap((page) => [
      { key: page.key, path: `en/${page.en}` },
      { key: page.key, path: `vi/${page.vi}` },
    ]);

  assert.deepEqual(
    manifest.pages
      .slice(0, legacyExpectedPages.length)
      .map(({ key, path }) => ({
        key,
        path,
      })),
    legacyExpectedPages,
    "the 54 historical records must remain first and in their original order",
  );
  assert.deepEqual(
    manifest.pages.slice(legacyExpectedPages.length).map(({ key, path }) => ({
      key,
      path,
    })),
    courseExpectedPages,
    "the 32 course records must follow translation-manifest order, EN then VI",
  );
  assert.equal(translations.pages.length, 43);
  assert.equal(expectedPages.length, 86);
  for (const page of translations.pages) {
    const entries = manifest.pages.filter((entry) => entry.key === page.key);
    assert.equal(
      entries.length,
      2,
      `${page.key} must have exactly two entries`,
    );
    assert.deepEqual(
      entries.map(({ path }) => path),
      [`en/${page.en}`, `vi/${page.vi}`],
      `${page.key} must have one EN and one VI path in order`,
    );
  }

  assert.deepEqual(
    new Set(manifest.pages.map(({ path }) => path)),
    new Set(expectedPages.map(({ path }) => path)),
    "the preservation manifest must cover every translated public path once",
  );

  const errors = await validatePreservation(
    new URL("../", import.meta.url),
    manifest,
  );
  assert.equal(errors.length, 0, errors.join("\n"));
});
