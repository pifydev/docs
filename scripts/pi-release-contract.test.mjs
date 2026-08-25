import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const repositoryRoot = new URL("../", import.meta.url);
const releaseFixtureURL = new URL(
  "fixtures/pi-release-0843.json",
  import.meta.url,
);
const compileFixturePackages = [
  "@earendil-works/pi-ai",
  "@earendil-works/pi-agent-core",
  "@earendil-works/pi-coding-agent",
];

async function readReleaseFixture() {
  return JSON.parse(await readFile(releaseFixtureURL, "utf8"));
}

async function activeContentFiles(directoryURL) {
  const entries = await readdir(directoryURL, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryURL = new URL(
        `${entry.name}${entry.isDirectory() ? "/" : ""}`,
        directoryURL,
      );
      return entry.isDirectory() ? activeContentFiles(entryURL) : [entryURL];
    }),
  );
  return files.flat();
}

async function readActiveSources() {
  const contentFiles = (
    await Promise.all([
      activeContentFiles(new URL("content/en/", repositoryRoot)),
      activeContentFiles(new URL("content/vi/", repositoryRoot)),
    ])
  ).flat();
  const readmeURL = new URL("README.md", repositoryRoot);

  return Promise.all(
    [...contentFiles, readmeURL].map(async (fileURL) => ({
      filename: path.relative(repositoryRoot.pathname, fileURL.pathname),
      source: await readFile(fileURL, "utf8"),
    })),
  );
}

async function readLocalizedContent(relativePath) {
  return Promise.all(
    ["en", "vi"].map(async (locale) => ({
      locale,
      source: await readFile(
        new URL(`content/${locale}/${relativePath}`, repositoryRoot),
        "utf8",
      ),
    })),
  );
}

function markdownWordCount(source) {
  const prose = source.replace(/^```[\s\S]*?^```/gm, " ");
  return (prose.match(/[\p{L}\p{N}][\p{L}\p{N}_'-]*/gu) ?? []).length;
}

function extractMarkdownSection(source, heading, context) {
  const lines = source.replaceAll("\r\n", "\n").split("\n");
  const start = lines.indexOf(heading);
  assert.notEqual(start, -1, `${context} must contain section ${heading}`);

  const headingMatch = /^(#{1,6})\s+/.exec(lines[start]);
  assert.ok(headingMatch, `${context} must use a Markdown heading`);
  const depth = headingMatch[1].length;
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    const candidate = /^(#{1,6})\s+/.exec(lines[index]);
    if (candidate && candidate[1].length <= depth) {
      end = index;
      break;
    }
  }

  const body = lines
    .slice(start + 1, end)
    .join("\n")
    .trim();
  return {
    body,
    depth,
    fenceLanguages: [...body.matchAll(/^```([A-Za-z0-9_-]+)(?:\s|$)/gm)].map(
      (match) => match[1],
    ),
    nestedHeadingDepths: [...body.matchAll(/^(#{1,6})\s+/gm)].map(
      (match) => match[1].length,
    ),
  };
}

function assertContainsAll(source, patterns, context, sectionContract) {
  const section = sectionContract
    ? extractMarkdownSection(source, sectionContract.heading, context)
    : undefined;
  const target = section?.body ?? source;

  if (sectionContract?.minWords) {
    assert.ok(
      markdownWordCount(target) >= sectionContract.minWords,
      `${context} section must contain at least ${sectionContract.minWords} words`,
    );
  }
  if (sectionContract?.fenceLanguages) {
    assert.deepEqual(
      section.fenceLanguages,
      sectionContract.fenceLanguages,
      `${context} section must preserve its fenced-code structure`,
    );
  }
  for (const pattern of patterns) {
    assert.match(target, pattern, `${context} section must cover ${pattern}`);
  }
  return section;
}

function sectionStructure(section) {
  return {
    depth: section.depth,
    fenceLanguages: section.fenceLanguages,
    nestedHeadingDepths: section.nestedHeadingDepths,
  };
}

function assertParagraphContainsAll(source, patterns, context) {
  const paragraphs = source.split(/\n\s*\n/);
  const matchingParagraph = paragraphs.find((paragraph) =>
    patterns.every((pattern) => pattern.test(paragraph)),
  );
  assert.ok(
    matchingParagraph,
    `${context} must relate ${patterns.join(", ")} in one paragraph`,
  );
}

function markdownSemanticSegments(source) {
  const lines = source.replaceAll("\r\n", "\n").split("\n");
  const segments = [];
  let paragraph = [];
  const segment = (kind, text, fenceLanguages = []) => ({
    kind,
    text,
    fenceLanguages,
  });
  const languagesIn = (text) =>
    [...text.matchAll(/^\s*(?:```|~~~)\s*([\w+-]+)/gm)].map((match) =>
      match[1].toLowerCase(),
    );
  const flushParagraph = () => {
    if (paragraph.length > 0) {
      segments.push(segment("prose", paragraph.join("\n")));
    }
    paragraph = [];
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^\s*\{% hint\b/.test(line)) {
      flushParagraph();
      const callout = [line];
      while (
        index + 1 < lines.length &&
        !/^\s*\{% endhint %\}/.test(lines[index])
      ) {
        index += 1;
        callout.push(lines[index]);
      }
      const text = callout.join("\n");
      segments.push(segment("callout", text, languagesIn(text)));
      continue;
    }
    const fenceMatch = /^\s*(```|~~~)\s*([\w+-]*)/.exec(line);
    if (fenceMatch) {
      flushParagraph();
      const [, fence, language] = fenceMatch;
      const code = [line];
      while (index + 1 < lines.length) {
        index += 1;
        code.push(lines[index]);
        if (new RegExp(`^\\s*${fence}`).test(lines[index])) break;
      }
      segments.push(
        segment(
          "code",
          code.join("\n"),
          language ? [language.toLowerCase()] : [],
        ),
      );
      continue;
    }
    if (/^\s*\|/.test(line)) {
      flushParagraph();
      segments.push(segment("table", line));
      continue;
    }
    if (line.trim() === "") {
      flushParagraph();
      continue;
    }
    paragraph.push(line);
  }
  flushParagraph();
  return segments;
}

function hasKnownUnreleasedTruncatedSummarySignature(segment) {
  const normalized = segment.text.replace(/\s+/g, " ").trim();
  const mentionsCompactionOrBranchSummary =
    /(?:compaction|branch)\s+summar(?:y|ies|ization)|(?:summar(?:y|ies|ization)|bản tóm tắt)\s+(?:compaction|branch|nhánh)/i.test(
      normalized,
    );
  const hasSourceShapedFence = segment.fenceLanguages.some((language) =>
    /^(?:cjs|js|javascript|jsx|mjs|ts|tsx|typescript)$/.test(language),
  );
  const auditedSourceSignature =
    hasSourceShapedFence &&
    mentionsCompactionOrBranchSummary &&
    (/getSummarizationFailure\s*\(/.test(normalized) ||
      /response\.stopReason\s*===\s*["']length["']/.test(normalized));
  const reviewedPhrases = [
    /Pi does not persist a length-limited summary/i,
    /Pi rejects a length-limited (?:compaction|branch) summary/i,
    /Pi rejects a truncated compaction summary/i,
    /Pi rejects a compaction summary based on (?:its|the) output size/i,
    /Pi does not persist a compaction summary whose output exceeds its maximum/i,
    /Pi does not persist a compaction summary when its output is too large/i,
    /Pi từ chối bản tóm tắt compaction bị cắt cụt/i,
    /Pi không lưu bản tóm tắt compaction khi đầu ra vượt quá giới hạn tối đa/i,
    /Pi không lưu bản tóm tắt compaction khi đầu ra quá lớn/i,
  ];

  return (
    auditedSourceSignature ||
    reviewedPhrases.some((signature) => signature.test(normalized))
  );
}

function assertTruncatedSummaryClaimsAreUnreleased(source, locale, context) {
  // This deliberately recognizes audited source signatures and a small reviewed
  // phrase list, not arbitrary natural language. Free-form paraphrases remain a
  // release-source review responsibility.
  const claims = markdownSemanticSegments(source).filter(
    hasKnownUnreleasedTruncatedSummarySignature,
  );
  const warning =
    locale === "en" ? /\*\*Unreleased:\*\*/ : /\*\*Chưa phát hành:\*\*/;

  for (const claim of claims) {
    assert.match(
      claim.text,
      /\{% hint style="warning" %\}/,
      `${context} must put truncated-summary rejection in a warning callout`,
    );
    assert.match(
      claim.text,
      warning,
      `${context} must visibly label truncated-summary rejection as unreleased`,
    );
  }
}

function assertActiveTruncatedSummaryClaimsAreUnreleased(sources) {
  for (const { filename, source } of sources) {
    const locale = filename.startsWith("content/vi/") ? "vi" : "en";
    assertTruncatedSummaryClaimsAreUnreleased(source, locale, filename);
  }
}

function releaseSourceRef(link) {
  const match = new URL(link).pathname.match(
    /^\/(?:earendil-works\/pi|badlogic\/pi-mono)\/(?:blob|tree|commit)\/([^/]+)(?:\/|$)/,
  );
  return match?.[1];
}

function isPublishedReleaseSourceLink(link, release) {
  const ref = releaseSourceRef(link);
  return ref === release.tag || ref === release.commit;
}

function piSourceLinks(sources) {
  return sources.flatMap(({ filename, source }) =>
    [
      ...source.matchAll(
        /https:\/\/github\.com\/(?:earendil-works\/pi|badlogic\/pi-mono)\/(?:blob|commit|tree)\/[^\s)'"\]]+/g,
      ),
    ].map(([link]) => ({ filename, link })),
  );
}

function invalidPiSourceLinks(sources, release) {
  return piSourceLinks(sources).filter(
    ({ link }) => !isPublishedReleaseSourceLink(link, release),
  );
}

test("release fixture identifies published Pi 0.84.3 authority", async () => {
  const release = await readReleaseFixture();

  assert.equal(release.packageVersion, "0.84.3");
  assert.equal(release.tag, "v0.84.3");
  assert.equal(release.commit, "4e58f324fae8ebfa98a3d45181fb248072a2afac");
});

test("release fixture keeps the audited upstream head explicitly unreleased", async () => {
  const release = await readReleaseFixture();

  assert.equal(
    release.upstreamAuditCommit,
    "dcd461925db2edf69a43c8135db1180d418afd54",
  );
  assert.equal(release.upstreamAuditStatus, "unreleased");
});

test("compile fixture packages are exactly pinned to the published release", async () => {
  const packageJSON = JSON.parse(
    await readFile(new URL("package.json", repositoryRoot), "utf8"),
  );

  for (const packageName of compileFixturePackages) {
    assert.equal(packageJSON.devDependencies[packageName], "0.84.3");
  }
});

test("PowerShell section contracts reject concepts scattered across unrelated sections", () => {
  const scopedFiller = Array.from(
    { length: 90 },
    (_, index) => `scoped-word-${index}`,
  ).join(" ");
  const scatteredSource = `
### Bash and PowerShell are separate shell-tool sessions

The \`powershell\` tool is optional. ${scopedFiller}

### Factory appendix

Use \`createPowerShellTool()\` with \`PowerShellOperations\` and \`defaultTools\`.

### Lifecycle appendix

The backend receives \`signal?: AbortSignal\`, while \`DEFAULT_MAX_LINES\` and
\`DEFAULT_MAX_BYTES\` bound output before cleanup.
`;

  assert.throws(
    () =>
      assertContainsAll(
        scatteredSource,
        [
          /`powershell`/,
          /`createPowerShellTool\(\)`/,
          /`PowerShellOperations`/,
          /`defaultTools`/,
          /signal\?: AbortSignal/,
          /DEFAULT_MAX_LINES/,
          /DEFAULT_MAX_BYTES/,
          /cleanup/,
        ],
        "synthetic PowerShell guidance",
        {
          heading: "### Bash and PowerShell are separate shell-tool sessions",
          minWords: 80,
        },
      ),
    (error) => {
      assert.match(
        error.message,
        /synthetic PowerShell guidance section must cover/,
      );
      assert.doesNotMatch(error.message, /must contain at least 80 words/);
      return true;
    },
  );
});

test("both Chapter 5 locales explain the optional PowerShell tool contract", async () => {
  const chapters = await readLocalizedContent("ch05-tool-system.md");
  const localeContract = {
    en: {
      heading: "### Bash and PowerShell are separate shell-tool sessions",
      defaultLocal: /default local/i,
      selectable: /selectable|select/i,
      notDefault: /not[^.]*default/i,
      cleanup: /cleanup|clean up|release/i,
      withoutContext: /without[^.]*context/i,
      alwaysPresent: /always present|always set/i,
      fileBacked: /file-backed|session file path/i,
      truthy: /truthy/i,
    },
    vi: {
      heading: "### Bash và PowerShell là các phiên shell-tool riêng biệt",
      defaultLocal: /cục bộ mặc định/i,
      selectable: /có thể[^.]*chọn|chọn/i,
      notDefault: /không[^.]*mặc định/i,
      cleanup: /cleanup|giải phóng|dọn dẹp/i,
      withoutContext: /không có[^.]*context/i,
      alwaysPresent: /luôn có|luôn được đặt/i,
      fileBacked: /file-backed|session file path/i,
      truthy: /truthy/i,
    },
  };
  const structures = [];

  for (const { locale, source } of chapters) {
    const contract = localeContract[locale];
    const section = assertContainsAll(
      source,
      [
        /`powershell`/,
        /`createPowerShellTool\(\)`/,
        /`PowerShellOperations`/,
        /`defaultTools`/,
        /onData: \(data: Buffer\) => void/,
        /signal\?: AbortSignal/,
        /exitCode: number \| null/,
        /DEFAULT_MAX_LINES/,
        /DEFAULT_MAX_BYTES/,
        /`\$`/,
        /`PS>`/,
        /PI_SESSION_ID/,
        /PI_SESSION_FILE/,
        /PI_PROVIDER/,
        /PI_MODEL/,
        /PI_REASONING_LEVEL/,
      ],
      `${locale} Chapter 5 PowerShell guidance`,
      {
        heading: contract.heading,
        minWords: 260,
        fenceLanguages: ["typescript", "typescript"],
      },
    );
    assertParagraphContainsAll(
      section.body,
      [
        contract.defaultLocal,
        /Bash/,
        /PowerShell/,
        /`\$`/,
        /`PS>`/,
        /custom/i,
        /operations/i,
      ],
      `${locale} Chapter 5 default-local prompt scope`,
    );
    assertParagraphContainsAll(
      section.body,
      [
        /`powershell`/,
        /`defaultTools`/,
        contract.selectable,
        contract.notDefault,
      ],
      `${locale} Chapter 5 explicit PowerShell selection`,
    );
    assertParagraphContainsAll(
      section.body,
      [/custom/i, /operations/i, /signal/, /timeout/, contract.cleanup],
      `${locale} Chapter 5 custom backend lifecycle`,
    );
    assertParagraphContainsAll(
      section.body,
      [
        /exposeSessionEnvironment/,
        /Agent\/Extension/,
        /false/,
        contract.withoutContext,
      ],
      `${locale} Chapter 5 conditional session exposure`,
    );
    assertParagraphContainsAll(
      section.body,
      [/PI_SESSION_ID/, contract.alwaysPresent],
      `${locale} Chapter 5 required session ID`,
    );
    assertParagraphContainsAll(
      section.body,
      [/PI_SESSION_FILE/, contract.fileBacked],
      `${locale} Chapter 5 optional session file`,
    );
    assertParagraphContainsAll(
      section.body,
      [/PI_PROVIDER/, /PI_MODEL/, /ctx\.model/],
      `${locale} Chapter 5 optional model metadata`,
    );
    assertParagraphContainsAll(
      section.body,
      [/PI_REASONING_LEVEL/, /thinkingLevel/, contract.truthy],
      `${locale} Chapter 5 optional reasoning metadata`,
    );
    structures.push(sectionStructure(section));
  }
  assert.deepEqual(structures[0], structures[1]);
});

test("both API locales document the public PowerShell factory and operations signature", async () => {
  const references = await readLocalizedContent("reference/api.md");
  const headings = {
    en: "### PowerShell Tool factory and operations",
    vi: "### Factory và operations của PowerShell Tool",
  };
  const structures = [];

  for (const { locale, source } of references) {
    const section = assertContainsAll(
      source,
      [
        /```ts\s+import \{\s+createPowerShellTool,\s+type PowerShellOperations,\s+type PowerShellToolOptions,\s+\} from "@earendil-works\/pi-coding-agent";\s+```/,
        /createPowerShellTool\(cwd: string, options\?: PowerShellToolOptions\)/,
        /operations\?: PowerShellOperations/,
        /exposeSessionEnvironment\?: boolean/,
        /spawnHook\?: PowerShellSpawnHook/,
        /onData: \(data: Buffer\) => void/,
        /Promise<\{ exitCode: number \| null \}>/,
      ],
      `${locale} API PowerShell guidance`,
      {
        heading: headings[locale],
        minWords: 180,
        fenceLanguages: ["ts", "ts", "ts", "ts"],
      },
    );
    structures.push(sectionStructure(section));
  }
  assert.deepEqual(structures[0], structures[1]);
});

test("both configuration locales distinguish tool selection from shell selection", async () => {
  const references = await readLocalizedContent("reference/configuration.md");
  const selectionRelation = {
    en: [/select/i, /does not change/i, /host shell/i],
    vi: [/chọn/i, /không thay đổi/i, /host shell/i],
  };
  const headings = {
    en: "### Tool selection",
    vi: "### Chọn tool",
  };
  const structures = [];

  for (const { locale, source } of references) {
    const section = assertContainsAll(
      source,
      [
        /`defaultTools`/,
        /"defaultTools": \["read", "bash", "edit", "write"\]/,
        /"defaultTools": \["read", "powershell", "edit", "write"\]/,
        /`powershell`/,
      ],
      `${locale} configuration PowerShell guidance`,
      {
        heading: headings[locale],
        minWords: 100,
        fenceLanguages: ["json", "json"],
      },
    );
    assertParagraphContainsAll(
      section.body,
      [/`powershell`/, ...selectionRelation[locale]],
      `${locale} configuration tool versus host shell selection`,
    );
    structures.push(sectionStructure(section));
  }
  assert.deepEqual(structures[0], structures[1]);
});

test("Chapter 7 Extension catalogs specify the 0.84.3 compaction-failure terminal contract", async () => {
  const chapters = await readLocalizedContent("ch07-event-driven.md");
  const localeContract = {
    en: {
      heading: "### Extension events form a separate contract",
      awaited: /awaited/i,
      afterEnd: /after `compaction_end`/i,
      manual: /manual[^.]*rejects/i,
      automatic: /automatic post-start[^.]*returns `false`/i,
    },
    vi: {
      heading: "### Sự kiện Extension có hợp đồng riêng",
      awaited: /được chờ hoàn tất/i,
      afterEnd: /sau `compaction_end`/i,
      manual: /thủ công[^.]*reject/i,
      automatic: /tự động sau khi bắt đầu[^.]*trả `false`/i,
    },
  };
  const structures = [];

  for (const { locale, source } of chapters) {
    const contract = localeContract[locale];
    const section = assertContainsAll(
      source,
      [
        /`session_compact_failed`/,
        /reason: "manual" \| "threshold" \| "overflow"/,
        /errorMessage\?: string/,
        /aborted: boolean/,
        /willRetry: boolean/,
        /fromExtension: boolean/,
      ],
      `${locale} Chapter 7 compaction-failure catalog`,
      { heading: contract.heading, minWords: 105 },
    );
    assertParagraphContainsAll(
      section.body,
      [
        /`compaction_end`/,
        /`session_compact_failed`/,
        contract.awaited,
        contract.afterEnd,
      ],
      `${locale} Chapter 7 compaction-failure timing`,
    );
    assertParagraphContainsAll(
      section.body,
      [/`session_compact_failed`/, contract.manual, contract.automatic],
      `${locale} Chapter 7 compaction-failure settlement`,
    );
    structures.push(sectionStructure(section));
  }
  assert.deepEqual(structures[0], structures[1]);
});

test("Chapter 9 compaction lifecycle specifies failed-event payload, order, and terminal behavior", async () => {
  const chapters = await readLocalizedContent("ch09-compaction.md");
  const localeContract = {
    en: {
      heading:
        "### Public events and Extension hooks serve different consumers",
      afterEnd: /after `compaction_end`/i,
      beforeSettlement: /before[^.]*rejects|before[^.]*returns `false`/i,
      manual: /manual[^.]*rejects/i,
      automatic: /automatic[^.]*returns `false`/i,
      noEntry: /Neither path writes a new compaction entry/i,
    },
    vi: {
      heading:
        "### Sự kiện công khai và hook Extension phục vụ các thành phần khác nhau",
      afterEnd: /sau `compaction_end`/i,
      beforeSettlement: /trước khi[^.]*reject|trước khi[^.]*trả `false`/i,
      manual: /thủ công[^.]*reject/i,
      automatic: /tự động[^.]*trả `false`/i,
      noEntry: /Cả hai đường đều không ghi mục compaction mới/i,
    },
  };
  const structures = [];

  for (const { locale, source } of chapters) {
    const contract = localeContract[locale];
    const section = assertContainsAll(
      source,
      [
        /type: "session_compact_failed"/,
        /reason: "manual" \| "threshold" \| "overflow"/,
        /errorMessage\?: string/,
        /aborted: boolean/,
        /willRetry: boolean/,
        /fromExtension: boolean/,
      ],
      `${locale} Chapter 9 compaction-failure lifecycle`,
      {
        heading: contract.heading,
        minWords: 180,
        fenceLanguages: ["text", "typescript"],
      },
    );
    assertParagraphContainsAll(
      section.body,
      [
        /`compaction_end`/,
        /`session_compact_failed`/,
        /await|chờ/,
        contract.afterEnd,
        contract.beforeSettlement,
      ],
      `${locale} Chapter 9 compaction-failure ordering`,
    );
    assertParagraphContainsAll(
      section.body,
      [
        /`session_compact_failed`/,
        contract.manual,
        contract.automatic,
        contract.noEntry,
      ],
      `${locale} Chapter 9 compaction-failure terminal behavior`,
    );
    structures.push(sectionStructure(section));
  }
  assert.deepEqual(structures[0], structures[1]);
});

test("Chapters 7 and 9 cover exhausted overflow recovery without a new compaction start", async () => {
  const documentContracts = [
    {
      path: "ch07-event-driven.md",
      headings: {
        en: "### Extension events form a separate contract",
        vi: "### Sự kiện Extension có hợp đồng riêng",
      },
    },
    {
      path: "ch09-compaction.md",
      headings: {
        en: "### Public events and Extension hooks serve different consumers",
        vi: "### Sự kiện công khai và hook Extension phục vụ các thành phần khác nhau",
      },
    },
  ];
  const localeContract = {
    en: {
      ordinary: /ordinary started compaction failures/i,
      exhausted: /exhausted overflow recovery/i,
      noStart: /without a new `compaction_start`/i,
      awaited: /awaited|awaits/i,
      reason: /reason[^.]*`?"overflow"`?/i,
      error: /errorMessage[^.]*recovery failed/i,
      result: /result[^.]*undefined/i,
      aborted: /aborted[^.]*false/i,
      retry: /willRetry[^.]*false/i,
      extension: /fromExtension[^.]*false/i,
      contextError:
        /Context overflow recovery failed after one compact-and-retry attempt\. Try reducing context or switching to a larger-context model\./,
      truncatedError:
        /Truncated response recovery failed after one compact-and-retry attempt\./,
    },
    vi: {
      ordinary: /lỗi compaction thông thường đã bắt đầu/i,
      exhausted: /phục hồi overflow đã dùng hết/i,
      noStart: /không có `compaction_start` mới/i,
      awaited: /được chờ|chờ[^.]*hoàn tất/i,
      reason: /reason[^.]*`?"overflow"`?/i,
      error: /errorMessage[^.]*recovery failed/i,
      result: /result[^.]*undefined/i,
      aborted: /aborted[^.]*false/i,
      retry: /willRetry[^.]*false/i,
      extension: /fromExtension[^.]*false/i,
      contextError:
        /Context overflow recovery failed after one compact-and-retry attempt\. Try reducing context or switching to a larger-context model\./,
      truncatedError:
        /Truncated response recovery failed after one compact-and-retry attempt\./,
    },
  };

  for (const documentContract of documentContracts) {
    const documents = await readLocalizedContent(documentContract.path);
    const structures = [];
    for (const { locale, source } of documents) {
      const section = extractMarkdownSection(
        source,
        documentContract.headings[locale],
        `${locale} ${documentContract.path} exhausted overflow lifecycle`,
      );
      const contract = localeContract[locale];
      assertParagraphContainsAll(
        section.body,
        [
          contract.ordinary,
          /`compaction_start`/,
          /`compaction_end`/,
          contract.awaited,
          /`session_compact_failed`/,
        ],
        `${locale} ${documentContract.path} ordinary started failure lifecycle`,
      );
      assertParagraphContainsAll(
        section.body,
        [
          contract.exhausted,
          contract.noStart,
          /`compaction_end`/,
          /`session_compact_failed`/,
          contract.awaited,
          contract.reason,
          contract.error,
          contract.result,
          contract.aborted,
          contract.retry,
          contract.extension,
          contract.contextError,
          contract.truncatedError,
        ],
        `${locale} ${documentContract.path} exhausted overflow lifecycle`,
      );
      structures.push(sectionStructure(section));
    }
    assert.deepEqual(structures[0], structures[1]);
  }
});

test("provider, API, and configuration guidance distinguish Google API and normalized thinking levels", async () => {
  const documentContracts = [
    {
      path: "ch04-model-invocation.md",
      headings: {
        en: "### Reasoning levels and provider translation",
        vi: "### Reasoning level và phép chuyển đổi theo provider",
      },
      minWords: 210,
    },
    {
      path: "reference/api.md",
      headings: { en: "### Model metadata", vi: "### Metadata của model" },
      minWords: 75,
    },
    {
      path: "reference/configuration.md",
      headings: { en: "### Model and thinking", vi: "### Model và thinking" },
      minWords: 45,
    },
  ];

  for (const documentContract of documentContracts) {
    const documents = await readLocalizedContent(documentContract.path);
    const structures = [];
    for (const { locale, source } of documents) {
      const section = assertContainsAll(
        source,
        [
          /: GoogleApiThinkingLevel/,
          /: ResolvedGoogleThinkingLevel|Record<ResolvedGoogleThinkingLevel/,
          /from "@earendil-works\/pi-ai"/,
          /"THINKING_LEVEL_UNSPECIFIED"/,
          /"MINIMAL"/,
          /"LOW"/,
          /"MEDIUM"/,
          /"HIGH"/,
          /"minimal" \| "low" \| "medium" \| "high"/,
          /API-facing|hướng API/i,
          /normalized|chuẩn hóa/i,
        ],
        `${locale} ${documentContract.path} Google thinking-level guidance`,
        {
          heading: documentContract.headings[locale],
          minWords: documentContract.minWords,
        },
      );
      structures.push(sectionStructure(section));
    }
    assert.deepEqual(structures[0], structures[1]);
  }
});

test("active docs do not present the renamed GoogleThinkingLevel identifier as current", async () => {
  const activeSources = await readActiveSources();
  const staleGoogleTypeMentions = activeSources
    .filter(({ source }) => /\bGoogleThinkingLevel\b/.test(source))
    .map(({ filename }) => filename);

  assert.deepEqual(staleGoogleTypeMentions, []);
});

test("known truncated-summary signatures use a focused positive and negative matrix", () => {
  const guardedClaims = [
    "Pi does not persist a length-limited summary.",
    "Pi rejects a length-limited branch summary.",
    "Pi rejects a truncated compaction summary instead of persisting it.",
    "Pi rejects a compaction summary based on its output size.",
    "Pi does not persist a compaction summary whose output exceeds its maximum.",
    "Pi does not persist a compaction summary whose output\nexceeds its maximum.",
    "Pi does not persist a compaction summary when its output is too large.",
    "Pi từ chối bản tóm tắt compaction bị cắt cụt.",
    "Pi không lưu bản tóm tắt compaction khi đầu ra vượt quá giới hạn tối đa.",
    "Pi không lưu bản tóm tắt compaction khi đầu ra quá lớn.",
  ];
  const allowedClaims = [
    "Compaction summaries use `getSummarizationFailure` for a length-stopped generation.",
    'For a compaction summary, `stopReason: "length"` marks the post-tag behavior.',
    "Compaction summary generation hit the token cap and the summary is incomplete.",
    "At 0.84.3, a compaction summary does not use getSummarizationFailure.",
    "Ở 0.84.3, bản tóm tắt compaction không sử dụng getSummarizationFailure.",
    "getSummarizationFailure applies elsewhere; this compaction summary is unaffected.",
    "getSummarizationFailure áp dụng ở nơi khác; bản tóm tắt compaction này không bị ảnh hưởng.",
    "A historical note quotes “compaction summary generation hit the token cap and the summary is incomplete,” but explicitly says 0.84.3 does not have it.",
    "Ghi chú lịch sử trích dẫn “compaction summary generation hit the token cap and the summary is incomplete,” nhưng nói rõ 0.84.3 không có hành vi này.",
    "Compaction does not truncate a single oversized Tool result at execution time.",
    "A truncated assistant response triggers compaction and one retry; it is not a compaction summary.",
    "At 0.84.3, a compaction summary can fail when the provider returns an incomplete response.",
    "Ở 0.84.3, bản tóm tắt compaction có thể thất bại khi nhà cung cấp trả về phản hồi không hoàn chỉnh.",
    "Compaction summary generation throws an error that reports response size.",
    "A branch summary fails because the response size is unknown.",
    "Pi does not persist a compaction summary because the provider only reports the response size.",
    "Pi không lưu bản tóm tắt compaction vì metadata chỉ ghi kích thước đầu ra.",
    "A truncated assistant response is discarded before retry; it is not a compaction summary.",
    "A truncated Tool result is discarded before retry; it is not a compaction summary.",
    "A truncated assistant response is discarded, not the compaction summary.",
    "A truncated Tool result is discarded rather than the compaction summary.",
    "The request is too large, so Pi does not persist the compaction summary output.",
    "Pi does not reject a truncated compaction summary.",
    "Pi never discards a length-limited branch summary.",
    "Pi không từ chối bản tóm tắt compaction bị cắt cụt.",
    "Pi rejects a truncated Tool result, then creates a compaction summary.",
    "Pi discards a cut-off assistant response before generating a compaction summary.",
    "Pi does not persist diagnostics for a compaction summary when provider output is too large.",
    "The compaction summary is invalid when JSON parsing fails. Its output size is logged for diagnostics.",
  ];
  const guardedSourceFences = [
    "```ts\n// compaction summary\nconst failure = getSummarizationFailure(response);\n```",
    '```typescript\n// branch summary\nif (response.stopReason === "length") return failure;\n```',
  ];
  const allowedNonSourceFence =
    "```text\ncompaction summary: getSummarizationFailure(response)\n```";

  for (const claim of guardedClaims) {
    const [segment] = markdownSemanticSegments(claim);
    assert.equal(
      hasKnownUnreleasedTruncatedSummarySignature(segment),
      true,
      claim,
    );
  }
  for (const claim of allowedClaims) {
    const [segment] = markdownSemanticSegments(claim);
    assert.equal(
      hasKnownUnreleasedTruncatedSummarySignature(segment),
      false,
      claim,
    );
  }
  for (const source of guardedSourceFences) {
    const [segment] = markdownSemanticSegments(source);
    assert.equal(
      hasKnownUnreleasedTruncatedSummarySignature(segment),
      true,
      source,
    );
  }
  const [nonSourceSegment] = markdownSemanticSegments(allowedNonSourceFence);
  assert.equal(
    hasKnownUnreleasedTruncatedSummarySignature(nonSourceSegment),
    false,
    allowedNonSourceFence,
  );
});

test("truncated-summary rejection claims require visual localized unreleased warnings", () => {
  const englishClaim =
    "Pi rejects a truncated compaction summary instead of persisting it.";
  const vietnameseClaim =
    "Pi từ chối bản tóm tắt compaction bị cắt cụt và không lưu nó.";
  const sourceClaim =
    "```ts\n// compaction summary\nconst failure = getSummarizationFailure(response);\n```";

  assert.throws(
    () =>
      assertTruncatedSummaryClaimsAreUnreleased(
        englishClaim,
        "en",
        "synthetic English claim",
      ),
    /must put truncated-summary rejection in a warning callout/,
  );
  assert.throws(
    () =>
      assertTruncatedSummaryClaimsAreUnreleased(
        sourceClaim,
        "en",
        "synthetic audited source claim",
      ),
    /must put truncated-summary rejection in a warning callout/,
  );
  assert.throws(
    () =>
      assertTruncatedSummaryClaimsAreUnreleased(
        `{% hint style="warning" %}\n${englishClaim}\n{% endhint %}`,
        "en",
        "synthetic English unlabeled callout",
      ),
    /must visibly label truncated-summary rejection as unreleased/,
  );
  assert.throws(
    () =>
      assertTruncatedSummaryClaimsAreUnreleased(
        `**Unreleased:** ${englishClaim}`,
        "en",
        "synthetic English non-visual warning",
      ),
    /must put truncated-summary rejection in a warning callout/,
  );
  assert.throws(
    () =>
      assertTruncatedSummaryClaimsAreUnreleased(
        `{% hint style="warning" %}\n${vietnameseClaim}\n{% endhint %}`,
        "vi",
        "synthetic Vietnamese unlabeled callout",
      ),
    /must visibly label truncated-summary rejection as unreleased/,
  );

  assert.doesNotThrow(() =>
    assertTruncatedSummaryClaimsAreUnreleased(
      `{% hint style="warning" %}\n**Unreleased:** ${englishClaim}\n{% endhint %}`,
      "en",
      "synthetic English warning",
    ),
  );
  assert.doesNotThrow(() =>
    assertTruncatedSummaryClaimsAreUnreleased(
      `{% hint style="warning" %}\n**Unreleased:** post-tag source only\n\n${sourceClaim}\n{% endhint %}`,
      "en",
      "synthetic audited source warning",
    ),
  );
  assert.doesNotThrow(() =>
    assertTruncatedSummaryClaimsAreUnreleased(
      `{% hint style="warning" %}\n**Chưa phát hành:** ${vietnameseClaim}\n{% endhint %}`,
      "vi",
      "synthetic Vietnamese warning",
    ),
  );
  assert.throws(
    () =>
      assertActiveTruncatedSummaryClaimsAreUnreleased([
        {
          filename: "content/en/ch07-event-driven.md",
          source: englishClaim,
        },
      ]),
    /must put truncated-summary rejection in a warning callout/,
  );
});

test("active docs do not claim post-tag truncated-summary rejection as released", async () => {
  assertActiveTruncatedSummaryClaimsAreUnreleased(await readActiveSources());
});

test("both environment locales preserve Bash guidance and add concrete PowerShell customization", async () => {
  const references = await readLocalizedContent(
    "reference/environment-variables.md",
  );
  const localeContract = {
    en: {
      heading: "## Process markers and shell-tool metadata",
      defaultLocal: /default local/i,
      childProcess: /child process/i,
      delegatedBackend: /delegate|configured backend/i,
      cleanup: /cleanup|clean up/i,
      withoutContext: /without[^.]*context/i,
      alwaysPresent: /always present|always set/i,
      fileBacked: /file-backed|session file path/i,
      truthy: /truthy/i,
    },
    vi: {
      heading: "## Process marker và shell-tool metadata",
      defaultLocal: /cục bộ mặc định/i,
      childProcess: /child process/i,
      delegatedBackend: /ủy quyền|backend đã cấu hình/i,
      cleanup: /cleanup|dọn dẹp/i,
      withoutContext: /không có[^.]*context/i,
      alwaysPresent: /luôn có|luôn được đặt/i,
      fileBacked: /file-backed|session file path/i,
      truthy: /truthy/i,
    },
  };
  const structures = [];

  for (const { locale, source } of references) {
    const contract = localeContract[locale];
    const section = assertContainsAll(
      source,
      [
        /createBashTool\(process\.cwd\(\), \{/,
        /createPowerShellTool\(process\.cwd\(\), \{/,
        /`bash` and `powershell`|`bash` và `powershell`/,
        /PI_SESSION_ID/,
        /PI_SESSION_FILE/,
        /PI_PROVIDER/,
        /PI_MODEL/,
        /PI_REASONING_LEVEL/,
        /exposeSessionEnvironment: false/,
        /spawnHook: \(context\) =>/,
      ],
      `${locale} environment PowerShell guidance`,
      {
        heading: contract.heading,
        minWords: 180,
        fenceLanguages: ["ts", "ts", "ts"],
      },
    );
    assertParagraphContainsAll(
      section.body,
      [
        contract.defaultLocal,
        /Bash/,
        /PowerShell/,
        contract.childProcess,
        /custom/i,
        /operations/i,
        contract.delegatedBackend,
        contract.cleanup,
      ],
      `${locale} environment local and custom backend distinction`,
    );
    assertParagraphContainsAll(
      section.body,
      [
        /exposeSessionEnvironment/,
        /Agent\/Extension/,
        /false/,
        contract.withoutContext,
      ],
      `${locale} environment conditional session exposure`,
    );
    assertParagraphContainsAll(
      section.body,
      [/PI_SESSION_ID/, contract.alwaysPresent],
      `${locale} environment required session ID`,
    );
    assertParagraphContainsAll(
      section.body,
      [/PI_SESSION_FILE/, contract.fileBacked],
      `${locale} environment optional session file`,
    );
    assertParagraphContainsAll(
      section.body,
      [/PI_PROVIDER/, /PI_MODEL/, /ctx\.model/],
      `${locale} environment optional model metadata`,
    );
    assertParagraphContainsAll(
      section.body,
      [/PI_REASONING_LEVEL/, /thinkingLevel/, contract.truthy],
      `${locale} environment optional reasoning metadata`,
    );
    structures.push(sectionStructure(section));
  }
  assert.deepEqual(structures[0], structures[1]);
});

test("active content satisfies the published Pi migration contract", async () => {
  const release = await readReleaseFixture();
  const activeSources = await readActiveSources();
  const staleFiles = activeSources
    .filter(({ source }) => /0\.84\.2|a470b121/.test(source))
    .map(({ filename }) => filename);
  const invalidSourceLinks = invalidPiSourceLinks(activeSources, release);

  assert.deepEqual(
    { staleFiles, invalidSourceLinks },
    { staleFiles: [], invalidSourceLinks: [] },
  );
});

test("active content uses the maintained Pi repository authority", async () => {
  const activeSources = await readActiveSources();
  const legacyRepositoryMentions = activeSources
    .filter(({ source }) => source.includes("badlogic/pi-mono"))
    .map(({ filename }) => filename);

  assert.deepEqual(legacyRepositoryMentions, []);
});

test("parses the exact GitHub source ref for published Pi release links", () => {
  const release = {
    tag: "v0.84.3",
    commit: "4e58f324fae8ebfa98a3d45181fb248072a2afac",
    upstreamAuditCommit: "dcd461925db2edf69a43c8135db1180d418afd54",
  };
  const acceptedLinks = [
    "https://github.com/earendil-works/pi/blob/v0.84.3/packages/ai/src/index.ts",
    `https://github.com/badlogic/pi-mono/tree/${release.commit}/packages/agent`,
    `https://github.com/earendil-works/pi/commit/${release.commit}`,
  ];
  const rejectedLinks = [
    "https://github.com/earendil-works/pi/blob/main/docs/v0.84.3-notes.md",
    "https://github.com/earendil-works/pi/blob/v0.84.30/file.ts",
    `https://github.com/earendil-works/pi/blob/${release.upstreamAuditCommit}/file.ts`,
  ];

  assert.deepEqual(acceptedLinks.map(releaseSourceRef), [
    release.tag,
    release.commit,
    release.commit,
  ]);
  assert.deepEqual(rejectedLinks.map(releaseSourceRef), [
    "main",
    "v0.84.30",
    release.upstreamAuditCommit,
  ]);
  assert.deepEqual(
    acceptedLinks.map((link) => isPublishedReleaseSourceLink(link, release)),
    [true, true, true],
  );
  assert.deepEqual(
    rejectedLinks.map((link) => isPublishedReleaseSourceLink(link, release)),
    [false, false, false],
  );
});

test("detects invalid Pi source refs without a release version claim", () => {
  const release = {
    tag: "v0.84.3",
    commit: "4e58f324fae8ebfa98a3d45181fb248072a2afac",
  };
  const sources = [
    {
      filename: "content/en/non-version-source.md",
      source:
        "See https://github.com/earendil-works/pi/blob/main/packages/ai/src/index.ts for implementation details.",
    },
  ];

  assert.deepEqual(invalidPiSourceLinks(sources, release), [
    {
      filename: "content/en/non-version-source.md",
      link: "https://github.com/earendil-works/pi/blob/main/packages/ai/src/index.ts",
    },
  ]);
});

test("0.84.3 source links point to the published tag or release commit", async () => {
  const release = await readReleaseFixture();
  const activeSources = await readActiveSources();
  const releaseClaimSources = activeSources.filter(({ source }) =>
    source.includes(release.packageVersion),
  );
  const publishedReleaseSourceLinks = piSourceLinks(releaseClaimSources).filter(
    ({ link }) => isPublishedReleaseSourceLink(link, release),
  );

  if (releaseClaimSources.length > 0) {
    assert.ok(
      publishedReleaseSourceLinks.length > 0,
      "0.84.3 claims require at least one source link pinned to the published tag or release commit",
    );
  }
});
