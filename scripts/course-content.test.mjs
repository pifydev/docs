import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

import matter from "gray-matter";

const repositoryRoot = new URL("../", import.meta.url);

const checkpoints = [
  ["00-complete-agent-trace", "course/src/demo/prologue.ts"],
  ["01-typescript-protocols", "course/src/protocol.ts"],
  ["02-event-stream", "course/src/event-stream.ts"],
  ["03-message-ir", "course/src/messages.ts"],
  ["04-deterministic-model", "course/src/scripted-model.ts"],
  ["05-provider-adapter", "course/src/provider-adapter.ts"],
  ["06-tool-contract", "course/src/tool.ts"],
  ["07-agent-loop", "course/src/agent-loop.ts"],
  ["08-coding-tools", "course/src/coding-tools.ts"],
  ["09-stateful-agent", "course/src/agent.ts"],
  ["10-session-tree", "course/src/session.ts"],
  ["11-context-compaction", "course/src/context.ts"],
  ["12-resources-extensions", "course/src/resources.ts"],
  ["13-runtime-composition", "course/src/runtime.ts"],
  ["14-agent-evaluation", "course/src/eval.ts"],
].map(([slug, source]) => ({
  slug,
  source,
  test: `course/test/${slug}.test.ts`,
}));

const headingContracts = {
  en: [
    "Outcome",
    "Prerequisites",
    "Mechanism",
    "Trace or model",
    "Build it",
    "Run the focused test",
    "Failure experiment",
    "Acceptance criteria",
    "Compare with Pi SDK 0.84.3",
    "Next checkpoint",
  ],
  vi: [
    "Kết quả",
    "Điều kiện tiên quyết",
    "Cơ chế",
    "Dấu vết hoặc mô hình",
    "Xây dựng",
    "Chạy focused test",
    "Thử nghiệm lỗi",
    "Tiêu chí chấp nhận",
    "So sánh với Pi SDK 0.84.3",
    "Checkpoint tiếp theo",
  ],
};

async function exists(relativePath) {
  return access(new URL(relativePath, repositoryRoot)).then(
    () => true,
    () => false,
  );
}

async function readCoursePage(locale, filename) {
  return readFile(
    new URL(`content/${locale}/course/${filename}`, repositoryRoot),
    "utf8",
  );
}

function h2Headings(body) {
  return [...body.matchAll(/^## ([^\r\n]+)\r?$/gm)].map((match) => match[1]);
}

function fenceLanguages(body) {
  return [...body.matchAll(/^```([^\s`]*)/gm)].map((match) => match[1]);
}

function mermaidCount(body) {
  return fenceLanguages(body).filter((language) => language === "mermaid")
    .length;
}

function tableShape(body) {
  return (body.match(/^\|.*\|\s*$/gm) ?? []).map(
    (row) => row.split("|").length,
  );
}

function localLinks(body) {
  return [
    ...body.matchAll(
      /\[[^\]]*\]\((?!https?:|mailto:|#)([^)#?]+)(?:[?#][^)]*)?\)/g,
    ),
  ].map((match) => decodeURIComponent(match[1]));
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function assertNoPerPageAttribution(source, label) {
  const disallowedMetadata = Object.keys(matter(source).data).filter((key) =>
    /^(?:source(?:_|$)|adapt(?:ed|ation)(?:_|$)|license$|author$)/i.test(key),
  );
  assert.deepEqual(
    disallowedMetadata,
    [],
    `${label}: source, adaptation, author, and license metadata`,
  );
  assert.doesNotMatch(source, /pi-textbook/i, `${label}: pi-textbook metadata`);
  assert.doesNotMatch(
    source,
    /translated and adapted/i,
    `${label}: adaptation notice`,
  );
  assert.doesNotMatch(source, /source_commit/i, `${label}: source_commit`);
  assert.doesNotMatch(
    source,
    /(?:^license\s*:|^##\s+(?:license|giấy phép)\s*$|GPL-3\.0-only)/gim,
    `${label}: per-page license banner`,
  );
}

test("all 32 localized public course files exist", async () => {
  const filenames = [
    "index.mdx",
    ...checkpoints.map(({ slug }) => `${slug}.md`),
  ];
  const expected = [
    ...filenames.map((filename) => `content/en/course/${filename}`),
    ...filenames.map((filename) => `content/vi/course/${filename}`),
  ];
  const missing = [];

  for (const relativePath of expected) {
    if (!(await exists(relativePath))) missing.push(relativePath);
  }

  assert.deepEqual(
    missing,
    [],
    `missing public course files:\n${missing.join("\n")}`,
  );
});

test("every checkpoint satisfies the shared content contract", async () => {
  const errors = [];

  for (const locale of ["en", "vi"]) {
    for (const checkpoint of checkpoints) {
      const relativePath = `content/${locale}/course/${checkpoint.slug}.md`;
      if (!(await exists(relativePath))) {
        errors.push(`${relativePath}: missing file`);
        continue;
      }

      const source = await readCoursePage(locale, `${checkpoint.slug}.md`);
      const body = matter(source).content;
      const command = `npm run test:course:checkpoint -- ${checkpoint.test}`;

      try {
        assert.deepEqual(
          h2Headings(body),
          headingContracts[locale],
          `${relativePath}: ten-section H2 contract`,
        );
        assert.match(
          body,
          new RegExp(`\\x60${escapeRegExp(checkpoint.source)}\\x60`),
          `${relativePath}: exact Course implementation module`,
        );
        assert.match(
          body,
          new RegExp(`\\x60${escapeRegExp(checkpoint.test)}\\x60`),
          `${relativePath}: exact focused test`,
        );
        assert.match(
          body,
          new RegExp(`(?:^|\\n)${escapeRegExp(command)}(?:\\r?$|\\n)`),
          `${relativePath}: exact focused command`,
        );
        assert.match(
          body,
          /Course implementation/,
          `${relativePath}: Course implementation label`,
        );
        assert.match(
          body,
          /Pi SDK 0\.84\.3/,
          `${relativePath}: Pi SDK 0.84.3 label`,
        );
        assertNoPerPageAttribution(source, relativePath);
      } catch (error) {
        errors.push(error.message);
      }
    }
  }

  assert.deepEqual(errors, []);
});

test("English and Vietnamese course pages keep structural parity", async () => {
  const errors = [];
  const filenames = [
    "index.mdx",
    ...checkpoints.map(({ slug }) => `${slug}.md`),
  ];

  for (const filename of filenames) {
    const enPath = `content/en/course/${filename}`;
    const viPath = `content/vi/course/${filename}`;
    if (!(await exists(enPath)) || !(await exists(viPath))) {
      errors.push(`${filename}: EN/VI pair is incomplete`);
      continue;
    }

    const en = matter(await readCoursePage("en", filename)).content;
    const vi = matter(await readCoursePage("vi", filename)).content;

    try {
      assert.deepEqual(
        fenceLanguages(en),
        fenceLanguages(vi),
        `${filename}: fence languages`,
      );
      assert.equal(
        mermaidCount(en),
        mermaidCount(vi),
        `${filename}: Mermaid counts`,
      );
      assert.deepEqual(tableShape(en), tableShape(vi), `${filename}: tables`);
      assert.deepEqual(
        localLinks(en),
        localLinks(vi),
        `${filename}: local links`,
      );
    } catch (error) {
      errors.push(error.message);
    }
  }

  assert.deepEqual(errors, []);
});

test("course pages do not carry per-page source or license notices", async () => {
  const errors = [];
  const filenames = [
    "index.mdx",
    ...checkpoints.map(({ slug }) => `${slug}.md`),
  ];

  for (const locale of ["en", "vi"]) {
    for (const filename of filenames) {
      const relativePath = `content/${locale}/course/${filename}`;
      if (!(await exists(relativePath))) continue;
      try {
        assertNoPerPageAttribution(
          await readCoursePage(locale, filename),
          relativePath,
        );
      } catch (error) {
        errors.push(error.message);
      }
    }
  }

  assert.deepEqual(errors, []);
});
