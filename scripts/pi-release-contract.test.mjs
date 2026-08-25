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

  const body = lines.slice(start + 1, end).join("\n").trim();
  return {
    body,
    depth,
    fenceLanguages: [
      ...body.matchAll(/^```([A-Za-z0-9_-]+)(?:\s|$)/gm),
    ].map((match) => match[1]),
    nestedHeadingDepths: [
      ...body.matchAll(/^(#{1,6})\s+/gm),
    ].map((match) => match[1].length),
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
  const scatteredSource = `
### Bash and PowerShell are separate shell-tool sessions

The \`powershell\` tool is optional.

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
    /synthetic PowerShell guidance section must contain at least 80 words/,
  );
});

test("both Chapter 5 locales explain the optional PowerShell tool contract", async () => {
  const chapters = await readLocalizedContent("ch05-tool-system.md");
  const localeContract = {
    en: {
      heading: "### Bash and PowerShell are separate shell-tool sessions",
      distinction: /It is a separate Tool from `bash`/,
      selection: /It is \*\*not\*\* in the default `defaultTools` set/,
      localBackend:
        /default local Bash and PowerShell operations start a separate child process for each Tool call/,
      cancellation: /honor `signal` and `timeout`/,
      cleanup: /release child handles, transports, timers, and abort listeners in `finally`/,
      exposureDefault:
        /`exposeSessionEnvironment` defaults to `true`, but Pi injects the `PI_\*` fields only when the Tool is executed with an Agent\/Extension context/,
      exposureDisabled:
        /`exposeSessionEnvironment: false` suppresses them even when that context exists/,
      exposureWithoutContext:
        /A standalone or custom invocation without that context does not receive them automatically/,
    },
    vi: {
      heading: "### Bash và PowerShell là các phiên shell-tool riêng biệt",
      distinction: /Đây là Tool riêng với `bash`/,
      selection: /Nó \*\*không\*\* thuộc tập `defaultTools` mặc định/,
      localBackend:
        /operations Bash và PowerShell cục bộ mặc định khởi động một child process riêng cho mỗi Tool call/,
      cancellation: /tuân theo `signal` và `timeout`/,
      cleanup: /giải phóng child handle, transport, timer và abort listener trong `finally`/,
      exposureDefault:
        /`exposeSessionEnvironment` mặc định là `true`, nhưng Pi chỉ inject các field `PI_\*` khi Tool được execute với Agent\/Extension context/,
      exposureDisabled:
        /`exposeSessionEnvironment: false` chặn các field này ngay cả khi context đó tồn tại/,
      exposureWithoutContext:
        /Standalone hoặc custom invocation không có context đó sẽ không tự động nhận các field này/,
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
        contract.distinction,
        contract.selection,
        contract.localBackend,
        contract.cancellation,
        contract.cleanup,
        contract.exposureDefault,
        contract.exposureDisabled,
        contract.exposureWithoutContext,
      ],
      `${locale} Chapter 5 PowerShell guidance`,
      {
        heading: contract.heading,
        minWords: 260,
        fenceLanguages: ["typescript", "typescript"],
      },
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
  const selectionStatement = {
    en: /Selecting a Tool does not change the host shell/,
    vi: /Chọn một Tool không thay đổi host shell/,
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
        selectionStatement[locale],
      ],
      `${locale} configuration PowerShell guidance`,
      {
        heading: headings[locale],
        minWords: 100,
        fenceLanguages: ["json", "json"],
      },
    );
    structures.push(sectionStructure(section));
  }
  assert.deepEqual(structures[0], structures[1]);
});

test("both environment locales preserve Bash guidance and add concrete PowerShell customization", async () => {
  const references = await readLocalizedContent(
    "reference/environment-variables.md",
  );
  const localeContract = {
    en: {
      heading: "## Process markers and shell-tool metadata",
      localBackend:
        /Default local Bash and PowerShell operations launch a separate child process for each Tool call/,
      customBackend:
        /Custom operations instead delegate to their configured backend/,
      exposureDefault:
        /`exposeSessionEnvironment` defaults to `true`, but injection requires an Agent\/Extension execution context/,
      exposureDisabled:
        /`exposeSessionEnvironment: false` suppresses all five session fields/,
      exposureWithoutContext:
        /A standalone or custom invocation without that context does not receive them automatically/,
    },
    vi: {
      heading: "## Process marker và shell-tool metadata",
      localBackend:
        /Operations Bash và PowerShell cục bộ mặc định khởi chạy một child process riêng cho mỗi Tool call/,
      customBackend:
        /Custom operations thay vào đó ủy quyền cho backend đã cấu hình/,
      exposureDefault:
        /`exposeSessionEnvironment` mặc định là `true`, nhưng việc inject cần Agent\/Extension execution context/,
      exposureDisabled:
        /`exposeSessionEnvironment: false` chặn cả năm session field/,
      exposureWithoutContext:
        /Standalone hoặc custom invocation không có context đó sẽ không tự động nhận chúng/,
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
        contract.localBackend,
        contract.customBackend,
        contract.exposureDefault,
        contract.exposureDisabled,
        contract.exposureWithoutContext,
      ],
      `${locale} environment PowerShell guidance`,
      {
        heading: contract.heading,
        minWords: 180,
        fenceLanguages: ["ts", "ts", "ts"],
      },
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
