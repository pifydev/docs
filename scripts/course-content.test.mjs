import assert from "node:assert/strict";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
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
const approvedAttributionMetadataKeys = new Set([
  "officialrefs",
  "translator",
  "reviewedby",
]);
const forbiddenAttributionMetadataTokens = new Set([
  "source",
  "sources",
  "adapted",
  "adaptation",
  "license",
  "licence",
  "licensing",
  "licencing",
  "author",
  "authors",
  "authorship",
  "attribution",
  "copyright",
  "copyrighted",
  "provenance",
]);

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

function scanMarkdownFences(body) {
  let fence = null;
  const blocks = [];

  const visibleBody = body
    .split(/(?<=\n)/)
    .map((line) => {
      const text = line.replace(/\r?\n$/, "");
      if (fence) {
        const closing = text.match(/^\s{0,3}(`{3,}|~{3,})\s*$/);
        if (
          closing &&
          closing[1][0] === fence.character &&
          closing[1].length >= fence.length
        ) {
          blocks.push({
            language: fence.language,
            body: fence.lines.join(""),
          });
          fence = null;
        } else {
          fence.lines.push(line);
        }
        return line.replace(/[^\r\n]/g, " ");
      }

      const opening = text.match(/^\s{0,3}(`{3,}|~{3,})(.*)$/);
      if (opening && !(opening[1][0] === "`" && opening[2].includes("`"))) {
        fence = {
          character: opening[1][0],
          length: opening[1].length,
          language: opening[2].trim().split(/\s+/, 1)[0] ?? "",
          lines: [],
        };
        return line.replace(/[^\r\n]/g, " ");
      }
      return line;
    })
    .join("");

  return { blocks, visibleBody };
}

function maskFencedContent(body) {
  return scanMarkdownFences(body).visibleBody;
}

function h2Headings(body) {
  return [...maskFencedContent(body).matchAll(/^## ([^\r\n]+)\r?$/gm)].map(
    (match) => match[1],
  );
}

function h2Section(body, heading) {
  const visibleBody = maskFencedContent(body);
  const headingMatch = new RegExp(
    `^## ${escapeRegExp(heading)}\\r?$`,
    "m",
  ).exec(visibleBody);
  if (!headingMatch) return "";

  const sectionStart = headingMatch.index + headingMatch[0].length;
  const remainder = visibleBody.slice(sectionStart).replace(/^\r?\n/, "");
  const nextHeading = remainder.search(/^##(?:\s+|$)/m);
  return nextHeading === -1 ? remainder : remainder.slice(0, nextHeading);
}

function markdownListItems(body) {
  return body.match(/^\s{0,3}[-*+]\s+\S.*$/gm) ?? [];
}

function fencedCommandCount(body, command) {
  return scanMarkdownFences(body).blocks.filter(
    (block) => block.language === "bash" && block.body.trim() === command,
  ).length;
}

test("checkpoint evidence helpers reject fenced and prose lookalikes", () => {
  const command =
    "npm run test:course:checkpoint -- course/test/00-complete-agent-trace.test.ts";
  const lookalikes = `The prose says ${command}, but it is not executable evidence.

\`\`\`markdown
## Failure experiment

This heading is inside a fence.
:::note[Course implementation]
:::info[Pi SDK 0.84.3]
\`\`\`

\`\`\`bash
${command} --extra
\`\`\`
`;

  assert.equal(h2Section(lookalikes, "Failure experiment"), "");
  assert.equal(fencedCommandCount(lookalikes, command), 0);
  assert.doesNotMatch(
    maskFencedContent(lookalikes),
    /^:::note\[Course implementation\]\s*$/m,
  );
  assert.doesNotMatch(
    maskFencedContent(lookalikes),
    /^:::info\[Pi SDK 0\.84\.3\]\s*$/m,
  );
});

test("checkpoint command evidence respects outer fences and fence length", () => {
  const command =
    "npm run test:course:checkpoint -- course/test/00-complete-agent-trace.test.ts";
  const nestedInFourBackticks = `\`\`\`\`markdown
\`\`\`bash
${command}
\`\`\`
\`\`\`\`
`;
  const nestedInTildes = `~~~~markdown
\`\`\`bash
${command}
\`\`\`
~~~~
`;
  const validTopLevelFences = `\`\`\`\`bash
${command}
\`\`\`\`

~~~bash
${command}
~~~
`;

  assert.equal(fencedCommandCount(nestedInFourBackticks, command), 0);
  assert.equal(fencedCommandCount(nestedInTildes, command), 0);
  assert.equal(fencedCommandCount(validTopLevelFences, command), 2);
});

test("checkpoint section evidence includes a final H2 body through EOF", () => {
  const body = `## Failure experiment

Break the invariant deliberately and confirm the focused test reports it.`;

  assert.equal(
    h2Section(body, "Failure experiment").trim(),
    "Break the invariant deliberately and confirm the focused test reports it.",
  );
});

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

async function publicMarkdownRelativePaths(directoryPath, relativePath = "") {
  const currentDirectory = relativePath
    ? path.join(directoryPath, ...relativePath.split("/"))
    : directoryPath;
  const entries = await readdir(currentDirectory, { withFileTypes: true });
  const publicPaths = [];

  for (const entry of entries) {
    const entryPath = relativePath
      ? `${relativePath}/${entry.name}`
      : entry.name;
    if (entry.isDirectory()) {
      publicPaths.push(
        ...(await publicMarkdownRelativePaths(directoryPath, entryPath)),
      );
    } else if (entry.isFile() && /\.(?:md|mdx)$/i.test(entry.name)) {
      publicPaths.push(entryPath);
    }
  }

  return publicPaths.sort();
}

function stringValues(value) {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(stringValues);
  if (value && typeof value === "object") {
    return Object.values(value).flatMap(stringValues);
  }
  return [];
}

function metadataKeyTokens(key) {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((token) => token.toLowerCase());
}

function assertNoPerPageAttribution(source, label) {
  const parsed = matter(source);
  const disallowedMetadata = Object.keys(parsed.data).filter((key) => {
    const normalized = key.toLowerCase().replaceAll(/[^a-z0-9]/g, "");
    if (approvedAttributionMetadataKeys.has(normalized)) {
      return false;
    }
    return metadataKeyTokens(key).some((token) =>
      forbiddenAttributionMetadataTokens.has(token),
    );
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
  const noticeTargets = [source, ...stringValues(parsed.data)];
  const matchedNotices = noticePatterns.filter((pattern) =>
    noticeTargets.some((target) => {
      pattern.lastIndex = 0;
      return pattern.test(target);
    }),
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
    "piSourceUrl",
    "adaptedFrom",
    "adaptation-notice",
    "translatedAndAdapted",
    "licenseNotice",
    "pageLicense",
    "authorName",
    "originalAuthor",
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

test("attribution guard scans forbidden values in approved metadata", () => {
  const metadataValues = [
    ["official_refs", "https://github.com/hahhforest/pi-textbook"],
    ["translator", "translated and adapted from another page"],
    ["reviewed_by", "Released under GPLv3"],
    ["description", "Author: Original writer"],
    ["description", "source_commit: 20dd3a7"],
  ];

  for (const [key, value] of metadataValues) {
    assert.throws(
      () =>
        assertNoPerPageAttribution(
          `---\n${key}: ${JSON.stringify(value)}\n---\n\nCourse body.\n`,
          `${key} value`,
        ),
      /notice|banner/i,
      `${key} must not allow the forbidden value ${value}`,
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

test("attribution guard allows legitimate metadata with overlapping substrings", () => {
  const metadataKeys = [
    "resourceLinks",
    "resources",
    "resource_count",
    "authoritativeRefs",
    "creditBudget",
  ];

  for (const key of metadataKeys) {
    assert.doesNotThrow(
      () =>
        assertNoPerPageAttribution(
          `---\n${key}: safe value\n---\n\nCourse body.\n`,
          key,
        ),
      `${key} is not attribution metadata`,
    );
  }
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
  assert.deepEqual(
    publicCourseFilenameErrors([...exactDirectory, "bonus/index.md"]),
    ["unexpected public course file: bonus/index.md"],
  );
});

test("public course file discovery includes normalized nested routes", async () => {
  const fixtureRoot = await mkdtemp(path.join(tmpdir(), "pify-course-files-"));

  try {
    await mkdir(path.join(fixtureRoot, "bonus"));
    await writeFile(path.join(fixtureRoot, "ROOT.MDX"), "root");
    await writeFile(path.join(fixtureRoot, "bonus", "index.md"), "nested");
    await writeFile(path.join(fixtureRoot, "bonus", "notes.txt"), "ignored");

    assert.deepEqual(await publicMarkdownRelativePaths(fixtureRoot), [
      "ROOT.MDX",
      "bonus/index.md",
    ]);
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test("course directories contain exactly 32 localized public files", async () => {
  const errors = [];

  for (const locale of ["en", "vi"]) {
    const directory = `content/${locale}/course`;
    const filenames = await publicMarkdownRelativePaths(
      fileURLToPath(new URL(`${directory}/`, repositoryRoot)),
    );
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
      const visibleBody = maskFencedContent(body);
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
        assert.equal(
          fencedCommandCount(body, command),
          1,
          `${relativePath}: one exact focused command in a bash fence`,
        );
        const failureSection = h2Section(body, headingContracts[locale][6]);
        assert.ok(
          (failureSection.match(/[\p{L}\p{N}]+/gu) ?? []).length >= 20,
          `${relativePath}: substantive failure experiment`,
        );
        const acceptanceSection = h2Section(body, headingContracts[locale][7]);
        assert.ok(
          markdownListItems(acceptanceSection).length >= 1,
          `${relativePath}: acceptance checklist`,
        );
        assert.match(
          visibleBody,
          /^:::note\[Course implementation\]\s*$/m,
          `${relativePath}: exact Course implementation callout label`,
        );
        assert.match(
          visibleBody,
          /^:::info\[Pi SDK 0\.84\.3\]\s*$/m,
          `${relativePath}: exact Pi SDK 0.84.3 callout label`,
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
