import assert from "node:assert/strict";
import test from "node:test";

import { inspectDocument, proseOnly } from "./editorial-lint.mjs";

test("proseOnly removes frontmatter, fenced code, inline code, and URLs", () => {
  const markdown = `---
title: Test
---
Đoạn văn có dấu đầy đủ và liên kết https://example.com.

\`inline 中文\`

\`\`\`ts
const label = "中文";
\`\`\`
`;
  const prose = proseOnly(markdown);

  assert.doesNotMatch(prose, /title:/);
  assert.doesNotMatch(prose, /const label/);
  assert.doesNotMatch(prose, /inline/);
  assert.doesNotMatch(prose, /example\.com/);
  assert.match(prose, /Đoạn văn có dấu đầy đủ/);
});

test("English lint reports residual Han and literal translation", () => {
  const errors = inspectDocument(
    "Provider private format. This prose still contains 中文.",
    "en",
    "ch04-model-invocation.md",
  );

  assert.ok(errors.some((error) => error.rule === "residual-han"));
  assert.ok(errors.some((error) => error.rule === "literal-english"));
});

test("editorial lint reports control characters and full-width punctuation", () => {
  const errors = inspectDocument(
    "Chapter \u0001 uses the wrong punctuation！",
    "en",
    "ch06-messages.md",
  );

  assert.ok(errors.some((error) => error.rule === "control-character"));
  assert.ok(errors.some((error) => error.rule === "fullwidth-punctuation"));
});

test("Vietnamese lint reports a long unaccented paragraph", () => {
  const paragraph =
    "Day la mot doan van tieng Viet khong dau du dai de bo kiem tra phat hien va yeu cau bien tap lai truoc khi xuat ban chinh thuc cho nguoi doc.";
  const errors = inspectDocument(paragraph, "vi", "ch09-compaction.md");

  assert.ok(errors.some((error) => error.rule === "unaccented-vietnamese"));
});

test("Vietnamese lint handles Markdown punctuation at paragraph start", () => {
  const paragraph =
    "**Tai sao:** Day la mot doan van tieng Viet khong dau du dai de bo kiem tra phat hien va yeu cau bien tap lai truoc khi xuat ban chinh thuc cho nguoi doc.";

  assert.doesNotThrow(() =>
    inspectDocument(paragraph, "vi", "ch09-compaction.md"),
  );
  assert.ok(
    inspectDocument(paragraph, "vi", "ch09-compaction.md").some(
      (error) => error.rule === "unaccented-vietnamese",
    ),
  );
});

test("Vietnamese lint accepts natural accented prose", () => {
  const paragraph =
    "Đây là một đoạn văn tiếng Việt có dấu, giải thích rõ cách hệ thống nén ngữ cảnh nhưng vẫn giữ lại các quyết định quan trọng của phiên làm việc.";

  assert.deepEqual(inspectDocument(paragraph, "vi", "ch09-compaction.md"), []);
});

test("Vietnamese lint accepts canonical testing and runtime terms", () => {
  const paragraph =
    "Fixture lưu input và expected output cố định; harness chạy hệ thống, judge áp dụng tiêu chí, rồi verdict ghi lại kết luận có cấu trúc.";

  assert.deepEqual(inspectDocument(paragraph, "vi", "glossary.md"), []);
});

test("editorial lint ignores technical identifiers inside code", () => {
  const markdown = `Keep this sentence concise.

\`\`\`ts
const message = "Provider private format";
\`\`\`
`;

  assert.deepEqual(inspectDocument(markdown, "en", "example.md"), []);
});
