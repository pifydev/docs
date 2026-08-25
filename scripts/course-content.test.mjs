import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
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
const courseFilenames = [
  "index.mdx",
  ...checkpoints.map(({ slug }) => `${slug}.md`),
];

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

function publicCourseFilenameErrors(directoryFilenames) {
  const publicFilenames = directoryFilenames.filter((filename) =>
    /\.(?:md|mdx)$/i.test(filename),
  );
  const actual = new Set(publicFilenames);
  const expected = new Set(courseFilenames);

  return [
    ...courseFilenames
      .filter((filename) => !actual.has(filename))
      .map((filename) => `missing public course file: ${filename}`),
    ...publicFilenames
      .filter((filename) => !expected.has(filename))
      .sort()
      .map((filename) => `unexpected public course file: ${filename}`),
  ];
}

function assertNoPerPageAttribution(source, label) {
  const parsed = matter(source);
  const disallowedMetadata = Object.keys(parsed.data).filter((key) => {
    const normalized = key.toLowerCase().replaceAll(/[^a-z0-9]/g, "");
    return [
      "source",
      "adapted",
      "adaptation",
      "license",
      "licensing",
      "author",
    ].some((prefix) => normalized.startsWith(prefix));
  });
  assert.deepEqual(
    disallowedMetadata,
    [],
    `${label}: source, adaptation, author, and license metadata`,
  );

  const noticePatterns = [
    /pi-textbook/i,
    /source(?:[_-]|\s+)commit/i,
    /translated\s+(?:and|&)\s+adapted/i,
    /translation\s+(?:and|&)\s+adaptation/i,
    /(?:được\s+)?dịch\s+(?:và|&)\s+(?:điều chỉnh(?:\s+kỹ thuật)?|chuyển thể|hiệu chỉnh)/iu,
    /^#{1,6}\s+(?:authors?|tác giả|licen[cs](?:e|ing)|giấy phép)\s*$/gimu,
    /^(?:[-*>]\s*)?(?:\*\*|__)?(?:authors?|tác giả|licen[cs](?:e|ing)|giấy phép)\s*:(?:\*\*|__)?(?:\s+.*)?$/gimu,
    /\bGPL[-\s]?(?:v(?:ersion)?\s*)?3(?:\.0)?(?:-only)?\b/i,
    /GNU\s+General\s+Public\s+License(?:\s+(?:version|v))?\s*3(?:\.0)?/i,
  ];
  const matchedNotices = noticePatterns.filter((pattern) =>
    pattern.test(parsed.content),
  );
  assert.deepEqual(
    matchedNotices,
    [],
    `${label}: per-page attribution notice or license banner`,
  );
}

test("attribution guard rejects normalized metadata key variants", () => {
  const metadataKeys = [
    "sourceUrl",
    "source-url",
    "adaptedFrom",
    "adaptation-notice",
    "licenseNotice",
    "authorName",
  ];

  for (const key of metadataKeys) {
    assert.throws(
      () =>
        assertNoPerPageAttribution(
          `---\n${key}: hidden attribution\n---\n\nCourse body.\n`,
          key,
        ),
      /metadata/i,
      `${key} must be rejected after key normalization`,
    );
  }
});

test("attribution guard rejects English and Vietnamese notice variants", () => {
  const notices = [
    "## Author\n\nPify maintainers.\n",
    "**Tác giả:** Pify maintainers.\n",
    "Trang này được dịch và điều chỉnh kỹ thuật.\n",
    "## Licensing\n\nSee the repository license.\n",
    "### Giấy phép\n\nXem giấy phép của repository.\n",
    "Released under GPLv3.\n",
    "Released under GPL 3.0.\n",
    "Released under the GNU General Public License version 3.\n",
  ];

  for (const notice of notices) {
    assert.throws(
      () => assertNoPerPageAttribution(notice, "body notice"),
      /notice|banner/i,
      `notice must be rejected: ${notice.split("\n", 1)[0]}`,
    );
  }
});

test("attribution guard allows ordinary prose and approved review metadata", () => {
  const source = `---
official_refs:
  - https://github.com/earendil-works/pi
translator: Pify maintainers
reviewed_by: Pify maintainers
---

The Tool author chooses a stable ID. A provider may return licensing data as
ordinary payload text, and the tác giả field can remain part of that example.
`;

  assert.doesNotThrow(() => assertNoPerPageAttribution(source, "ordinary"));
});

test("public course filename contract rejects missing and extra route files", () => {
  const exactDirectory = ["meta.json", "draft.txt", ...courseFilenames];
  assert.deepEqual(publicCourseFilenameErrors(exactDirectory), []);
  assert.deepEqual(
    publicCourseFilenameErrors(
      exactDirectory.filter((filename) => filename !== "index.mdx"),
    ),
    ["missing public course file: index.mdx"],
  );
  assert.deepEqual(
    publicCourseFilenameErrors([...exactDirectory, "unplanned-route.mdx"]),
    ["unexpected public course file: unplanned-route.mdx"],
  );
  assert.deepEqual(
    publicCourseFilenameErrors([...exactDirectory, "unplanned-route.MD"]),
    ["unexpected public course file: unplanned-route.MD"],
  );
});

test("course directories contain exactly 32 localized public files", async () => {
  const errors = [];

  for (const locale of ["en", "vi"]) {
    const directory = `content/${locale}/course`;
    const entries = await readdir(new URL(`${directory}/`, repositoryRoot), {
      withFileTypes: true,
    });
    const filenames = entries
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name);
    errors.push(
      ...publicCourseFilenameErrors(filenames).map(
        (error) => `${directory}: ${error}`,
      ),
    );
  }

  assert.deepEqual(
    errors,
    [],
    `course directory contract errors:\n${errors.join("\n")}`,
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

  for (const filename of courseFilenames) {
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

  for (const locale of ["en", "vi"]) {
    for (const filename of courseFilenames) {
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
