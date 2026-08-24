import assert from "node:assert/strict";
import test from "node:test";

import {
  contentMetrics,
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

test("validatePreservation reads every manifest page and combines diagnostics", async () => {
  const rootURL = new URL("../", import.meta.url);
  const manifest = {
    pages: [
      {
        path: "scripts/content-preservation.test.mjs",
        baselineWords: 1,
        minimumWordRatio: 0,
        minimumHeadingCounts: {},
        minimumCodeFences: 0,
        minimumMermaidBlocks: 0,
        minimumTables: 0,
      },
      {
        path: "scripts/does-not-exist.md",
        baselineWords: 1,
        minimumWordRatio: 0,
      },
    ],
  };

  const errors = await validatePreservation(rootURL, manifest);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /^scripts\/does-not-exist\.md:/);
});
