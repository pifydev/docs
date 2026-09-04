import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

import { extractMermaidBlocks } from "./lib/markdown.mjs";
import {
  reviewMetadataErrors,
  validateRepository,
} from "./validate-content.mjs";

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
    "ch11-testing-evaluation",
    "---Build Your Own Pi-style Agent---",
    "course",
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
    "ch11-testing-evaluation",
    "---Tự xây Pi-style Agent---",
    "course",
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
    "test-agent-deterministically",
    "run-pi-evals",
    "host-session-runtime",
  ],
  reference: ["api", "configuration", "environment-variables"],
  course: [
    "index",
    "00-complete-agent-trace",
    "01-typescript-protocols",
    "02-event-stream",
    "03-message-ir",
    "04-deterministic-model",
    "05-provider-adapter",
    "06-tool-contract",
    "07-agent-loop",
    "08-coding-tools",
    "09-stateful-agent",
    "10-session-tree",
    "11-context-compaction",
    "12-resources-extensions",
    "13-runtime-composition",
    "14-agent-evaluation",
  ],
  help: ["faq"],
};

const courseTitles = {
  en: "Build Your Own Pi-style Agent",
  vi: "Tự xây Pi-style Agent",
};

async function exists(relativePath) {
  return access(new URL(relativePath, repositoryRoot)).then(
    () => true,
    () => false,
  );
}

function glossaryDefinitionErrors(markdown, requiredTerms) {
  const sections = [...markdown.matchAll(/^## ([^\r\n]+)\r?$/gm)].map(
    (match) => ({
      heading: match[1],
      start: match.index,
      bodyStart: match.index + match[0].length,
    }),
  );
  const errors = [];

  for (const term of requiredTerms) {
    const definitions = sections.filter((section) => section.heading === term);

    if (definitions.length !== 1) {
      errors.push(
        `term "${term}" must have exactly one H2 definition; found ${definitions.length}`,
      );
      continue;
    }

    const definition = definitions[0];
    const sectionIndex = sections.indexOf(definition);
    const bodyEnd = sections[sectionIndex + 1]?.start ?? markdown.length;
    const body = markdown
      .slice(definition.bodyStart, bodyEnd)
      .replace(/```[\s\S]*?```|~~~[\s\S]*?~~~/g, "");
    const hasProse = body.split(/\r?\n/).some((line) => {
      const text = line.trim();
      return (
        text !== "" &&
        !/^#{1,6}(?:\s|$)/.test(text) &&
        !/^:::+/.test(text) &&
        /[\p{L}\p{N}]/u.test(text)
      );
    });

    if (!hasProse) {
      errors.push(`term "${term}" must have a non-empty prose definition`);
    }
  }

  return errors;
}

test("translation manifest contains 43 unique EN/VI pairs", async () => {
  const manifest = JSON.parse(await readFile(manifestURL, "utf8"));
  assert.equal(manifest.version, 1);
  assert.equal(manifest.pages.length, 43);
  assert.equal(new Set(manifest.pages.map((page) => page.key)).size, 43);
  assert.equal(new Set(manifest.pages.map((page) => page.en)).size, 43);
  assert.equal(new Set(manifest.pages.map((page) => page.vi)).size, 43);
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

  const expectedPages = [
    {
      key: "ch11-testing-evaluation",
      group: "chapters",
      en: "ch11-testing-evaluation.md",
      vi: "ch11-testing-evaluation.md",
    },
    {
      key: "how-to-test-agent-deterministically",
      group: "how-to",
      en: "how-to/test-agent-deterministically.md",
      vi: "how-to/test-agent-deterministically.md",
    },
    {
      key: "how-to-run-pi-evals",
      group: "how-to",
      en: "how-to/run-pi-evals.md",
      vi: "how-to/run-pi-evals.md",
    },
    {
      key: "how-to-host-session-runtime",
      group: "how-to",
      en: "how-to/host-session-runtime.md",
      vi: "how-to/host-session-runtime.md",
    },
    {
      key: "course-overview",
      group: "course",
      en: "course/index.mdx",
      vi: "course/index.mdx",
    },
    ...[
      "00-complete-agent-trace",
      "01-typescript-protocols",
      "02-event-stream",
      "03-message-ir",
      "04-deterministic-model",
      "05-provider-adapter",
      "06-tool-contract",
      "07-agent-loop",
      "08-coding-tools",
      "09-stateful-agent",
      "10-session-tree",
      "11-context-compaction",
      "12-resources-extensions",
      "13-runtime-composition",
      "14-agent-evaluation",
    ].map((slug) => ({
      key: `course-${slug}`,
      group: "course",
      en: `course/${slug}.md`,
      vi: `course/${slug}.md`,
    })),
  ];

  for (const expectedPage of expectedPages) {
    assert.deepEqual(
      manifest.pages.find((page) => page.key === expectedPage.key),
      expectedPage,
    );
  }
});

test("README and bilingual changelog describe the complete SDK and course release", async () => {
  const readme = await readFile(new URL("README.md", repositoryRoot), "utf8");
  const contributing = await readFile(
    new URL("CONTRIBUTING.md", repositoryRoot),
    "utf8",
  );
  const changelog = {
    en: await readFile(
      new URL("content/en/changelog.md", repositoryRoot),
      "utf8",
    ),
    vi: await readFile(
      new URL("content/vi/changelog.md", repositoryRoot),
      "utf8",
    ),
  };

  assert.match(readme, /eleven Pi SDK chapters/i);
  assert.match(readme, /eight How-to guides/i);
  assert.match(readme, /Chapter 11[^\r\n]*testing and evaluation/i);
  assert.match(readme, /Test an agent deterministically/);
  assert.match(readme, /Run Pi evaluations/);
  assert.match(readme, /Host a session runtime/);
  assert.match(
    readme,
    /separate overview[^\r\n]*15-checkpoint Build Your Own Pi-style Agent course/i,
  );
  assert.match(readme, /43 synchronized[^\r\n]*86 public documents/i);
  assert.match(readme, /^course\/\s+Offline TypeScript workshop/m);
  assert.match(readme, /`npm run test:course`/);
  assert.match(contributing, /compares all 43 public EN\/VI page pairs/);
  assert.match(contributing, /validates all 86 public files/);
  assert.match(
    readme,
    /`npm run test:course:checkpoint -- course\/test\/04-deterministic-model\.test\.ts`/,
  );
  const completeGate = readme.match(
    /Run the complete local gate:\s*```bash\s*([\s\S]*?)```/,
  )?.[1];
  assert.equal(
    completeGate?.trim(),
    [
      "npm run quality:content",
      "npm run typecheck",
      "npm run build",
      "npm run format:check",
      "npm run test:e2e",
      "git diff --check",
    ].join("\n"),
  );
  assert.match(
    readme,
    /^\| `npm run quality:content`[^\r\n]*release[^\r\n]*eval[^\r\n]*lint[^\r\n]*\|$/im,
  );

  const researchReference =
    "- Pedagogical research reference: [hahhforest/pi-textbook](https://github.com/hahhforest/pi-textbook), consulted at commit `20dd3a7d791c2470a87c5172aa0729c3963a6b18`.";
  assert.equal(readme.split(researchReference).length - 1, 1);
  assert.equal(
    readme
      .split(/\r?\n/)
      .filter((line) => line.includes("hahhforest/pi-textbook")).length,
    1,
    "README must contain exactly one pi-textbook reference bullet",
  );

  for (const markdown of Object.values(changelog)) {
    assert.match(markdown, /^## 2026-08-26$/m);
    assert.match(markdown, /Pi `0\.84\.3`/);
    assert.match(markdown, /43[^\r\n]*(?:86|cặp|pairs)/i);
    assert.match(markdown, /15(?:-| )checkpoint/i);
  }

  assert.match(changelog.en, /testing, evaluation, and runtime/i);
  assert.match(changelog.en, /original bilingual course/i);
  assert.match(changelog.en, /offline TypeScript workshop/i);
  assert.match(changelog.vi, /testing, evaluation và runtime/i);
  assert.match(changelog.vi, /course song ngữ nguyên bản/i);
  assert.match(changelog.vi, /workshop TypeScript offline/i);
});

test("release entry points publish the Pi 0.85.0 baseline and exact review authority", async () => {
  const releaseURL =
    "https://github.com/earendil-works/pi/releases/tag/v0.85.0";
  const commit = "107d79f11072bbc8a3a757ed7fd69596bee7d68c";
  const pages = await Promise.all(
    [
      "content/en/index.mdx",
      "content/vi/index.mdx",
      "content/en/quickstart.md",
      "content/vi/quickstart.md",
      "content/en/help/faq.md",
      "content/vi/help/faq.md",
    ].map(async (relativePath) => ({
      relativePath,
      source: await readFile(new URL(relativePath, repositoryRoot), "utf8"),
    })),
  );
  const readme = await readFile(new URL("README.md", repositoryRoot), "utf8");

  for (const { relativePath, source } of pages) {
    assert.match(
      source,
      /last_updated: '2026-09-04'/,
      `${relativePath} must carry the publication baseline date`,
    );
    assert.ok(
      source.includes(releaseURL),
      `${relativePath} must link the official Pi 0.85.0 release`,
    );
  }

  for (const { relativePath, source } of pages.filter(({ relativePath }) =>
    /(?:index\.mdx|faq\.md)$/.test(relativePath),
  )) {
    assert.ok(
      source.includes(`https://github.com/earendil-works/pi/commit/${commit}`),
      `${relativePath} must link the exact reviewed Pi commit`,
    );
  }

  for (const { relativePath, source } of pages.filter(({ relativePath }) =>
    relativePath.endsWith("quickstart.md"),
  )) {
    assert.match(
      source,
      /npm install @earendil-works\/pi-ai@0\.85\.0/,
      `${relativePath} must pin its SDK install command`,
    );
  }

  assert.match(readme, /Pi SDK `0\.85\.0`/);
  assert.ok(readme.includes(releaseURL));
  assert.ok(
    readme.includes(`https://github.com/earendil-works/pi/commit/${commit}`),
  );
  assert.match(readme, /reviewed[\s\S]{0,160}2026-09-04/i);
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
      if (directory === "course") {
        assert.equal(meta.title, courseTitles[locale]);
      }
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

test("paired glossaries define the canonical testing and runtime terms", async () => {
  const requiredTerms = [
    "Test Double",
    "Fixture",
    "Harness",
    "Judge",
    "Verdict",
    "Held-out Evaluation",
    "Composition Root",
    "Fail-closed",
  ];

  for (const locale of ["en", "vi"]) {
    const glossary = await readFile(
      new URL(`content/${locale}/glossary.md`, repositoryRoot),
      "utf8",
    );
    assert.deepEqual(
      glossaryDefinitionErrors(glossary, requiredTerms),
      [],
      `content/${locale}/glossary.md must define every canonical term exactly once with prose`,
    );
  }
});

test("glossary definition contract rejects duplicate and empty sections", () => {
  const glossary = `# Glossary

## Fixture

A reusable case.

## Fixture

Another fixture.

## Judge

### Details

## Verdict

`;

  assert.deepEqual(
    glossaryDefinitionErrors(glossary, [
      "Fixture",
      "Judge",
      "Verdict",
      "Test Double",
    ]),
    [
      'term "Fixture" must have exactly one H2 definition; found 2',
      'term "Judge" must have a non-empty prose definition',
      'term "Verdict" must have a non-empty prose definition',
      'term "Test Double" must have exactly one H2 definition; found 0',
    ],
  );
});

test("repository satisfies the Fumadocs content contract", async () => {
  const errors = await validateRepository(new URL("..", import.meta.url));
  assert.deepEqual(errors, []);
});

test("review gate requires reviewed status, reviewer, and review date", () => {
  assert.deepEqual(
    reviewMetadataErrors(
      "vi/quickstart.md",
      {
        status: "translated",
        reviewed_by: "",
        last_updated: "2026/08/24",
      },
      { requireReviewed: true },
    ),
    [
      "vi/quickstart.md: status must be reviewed",
      "vi/quickstart.md: reviewed_by is required",
      "vi/quickstart.md: last_updated must use YYYY-MM-DD",
    ],
  );

  assert.deepEqual(
    reviewMetadataErrors(
      "en/quickstart.md",
      {
        status: "reviewed",
        reviewed_by: "Pify maintainers",
        last_updated: "2026-08-24",
      },
      { requireReviewed: true },
    ),
    [],
  );
});

test("Mermaid extraction covers blocks outside numbered chapters", () => {
  const markdown = "# Guide\n\n```mermaid\ngraph TD\n  A --> B\n```\n";
  assert.deepEqual(extractMermaidBlocks(markdown), ["graph TD\n  A --> B"]);
});
