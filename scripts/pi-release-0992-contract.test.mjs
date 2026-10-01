import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

import ts from "typescript";

const repositoryRoot = new URL("../", import.meta.url);
const releaseFixtureURL = new URL(
  "fixtures/pi-release-0992.json",
  import.meta.url,
);
const releaseContractPackages = [
  "@earendil-works/pi-ai",
  "@earendil-works/pi-agent-core",
  "@earendil-works/pi-coding-agent",
  "@earendil-works/pi-server",
  "@earendil-works/pi-durable",
  "@earendil-works/chord",
];
const expectedRelease = {
  packageVersion: "0.99.2",
  tag: "v0.99.2",
  commit: "005af57d88ee23b33778f343a9595b32e67ff788",
  publishedAt: "2026-09-30T19:30:47Z",
  nodeRequirement: ">=22.19.0",
  previousDocumentationVersion: "0.87.1",
  includedReleaseTags: ["v0.99.0", "v0.99.1", "v0.99.2"],
  sourceStatus: "published",
};

async function readJson(url) {
  const filename = fileURLToPath(url);
  const source = await readFile(filename, "utf8");
  assert.deepEqual(ts.parseJsonText(filename, source).parseDiagnostics, []);
  return JSON.parse(source);
}

async function readGuide(locale, slug) {
  return readFile(
    new URL(`content/${locale}/how-to/${slug}.md`, repositoryRoot),
    "utf8",
  );
}

function headingShape(markdown) {
  return [...markdown.matchAll(/^(#{1,6})\s+/gm)].map(
    ([, hashes]) => hashes.length,
  );
}

function codeFenceCount(markdown) {
  return (markdown.match(/^```/gm) ?? []).length;
}

function headings(markdown) {
  return [...markdown.matchAll(/^(#{1,6})\s+(.+)$/gm)].map(
    ([, hashes, title]) => `${hashes} ${title}`,
  );
}

function codeFences(markdown) {
  return [...markdown.matchAll(/^```[^\n]*\n[\s\S]*?^```$/gm)].map(
    ([fence]) => fence,
  );
}

function paragraphContaining(markdown, needle) {
  const paragraph = markdown
    .split(/\r?\n\r?\n/)
    .find((candidate) => candidate.includes(needle));
  assert.ok(paragraph, `guide must contain paragraph with ${needle}`);
  return paragraph;
}

function sectionContaining(markdown, heading) {
  const marker = `${heading}\n`;
  const start = markdown.indexOf(marker);
  assert.notEqual(start, -1, `guide must contain section ${heading}`);
  const contentStart = start + marker.length;
  const nextSection = markdown.indexOf("\n## ", contentStart);
  return markdown.slice(
    start,
    nextSection === -1 ? markdown.length : nextSection,
  );
}

function tableRowContaining(markdown, key) {
  const row = markdown
    .split(/\r?\n/)
    .find((candidate) => candidate.startsWith(`| \`${key}\` |`));
  assert.ok(row, `section must contain table row for ${key}`);
  return row;
}

test("release fixture identifies the exact published Pi 0.99.2 authority", async () => {
  assert.deepEqual(await readJson(releaseFixtureURL), expectedRelease);
});

test("all six Pi direct dependencies use exact 0.99.2 pins", async () => {
  const packageJSON = await readJson(new URL("package.json", repositoryRoot));
  const packageLock = await readJson(
    new URL("package-lock.json", repositoryRoot),
  );

  for (const packageName of releaseContractPackages) {
    assert.equal(
      packageJSON.devDependencies[packageName],
      expectedRelease.packageVersion,
    );
    assert.equal(
      packageLock.packages[""].devDependencies[packageName],
      expectedRelease.packageVersion,
    );
  }
});

function assertTypeScriptFixtureCompiles(relativePath) {
  const fixturePath = fileURLToPath(new URL(relativePath, repositoryRoot));
  const program = ts.createProgram([fixturePath], {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    esModuleInterop: true,
    types: ["node"],
  });
  const diagnostics = ts.getPreEmitDiagnostics(program);
  assert.equal(
    diagnostics.length,
    0,
    ts.formatDiagnostics(diagnostics, {
      getCanonicalFileName: (fileName) => fileName,
      getCurrentDirectory: () => fileURLToPath(repositoryRoot),
      getNewLine: () => "\n",
    }),
  );
}

function assertTypeScriptSourceCompiles(relativePath, source) {
  const sourcePath = fileURLToPath(new URL(relativePath, repositoryRoot));
  const options = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    esModuleInterop: true,
    types: ["node"],
  };
  const host = ts.createCompilerHost(options);
  const normalizePath = (fileName) =>
    fileName.replaceAll("\\", "/").toLowerCase();
  const sourceKey = normalizePath(sourcePath);
  const isSource = (fileName) => normalizePath(fileName) === sourceKey;
  const defaultFileExists = host.fileExists.bind(host);
  const defaultReadFile = host.readFile.bind(host);
  const defaultGetSourceFile = host.getSourceFile.bind(host);

  host.fileExists = (fileName) =>
    isSource(fileName) || defaultFileExists(fileName);
  host.readFile = (fileName) =>
    isSource(fileName) ? source : defaultReadFile(fileName);
  host.getSourceFile = (
    fileName,
    languageVersion,
    onError,
    shouldCreateNewSourceFile,
  ) =>
    isSource(fileName)
      ? ts.createSourceFile(fileName, source, languageVersion, true)
      : defaultGetSourceFile(
          fileName,
          languageVersion,
          onError,
          shouldCreateNewSourceFile,
        );

  const diagnostics = ts.getPreEmitDiagnostics(
    ts.createProgram([sourcePath], options, host),
  );
  assert.equal(
    diagnostics.length,
    0,
    ts.formatDiagnostics(diagnostics, {
      getCanonicalFileName: (fileName) => fileName,
      getCurrentDirectory: () => fileURLToPath(repositoryRoot),
      getNewLine: () => "\n",
    }),
  );
}

for (const relativePath of [
  "tests/fixtures/pi-sdk-0992.contract.ts",
  "tests/fixtures/pi-coding-agent-0992.contract.ts",
  "tests/fixtures/pi-durable-0992.contract.ts",
]) {
  test(`${relativePath} compiles against published Pi 0.99.2 declarations`, () => {
    assertTypeScriptFixtureCompiles(relativePath);
  });
}

test("Pi 0.99.2 durable Harness opens and closes offline", async () => {
  const [{ BACKGROUND_CONTEXT }, { createModels }, durable] = await Promise.all(
    [
      import("@earendil-works/chord/context"),
      import("@earendil-works/pi-ai/models"),
      import("@earendil-works/pi-durable"),
    ],
  );
  const { createRegistry, Harness, MemoryStorage } = durable;
  let harness;

  try {
    harness = await Harness.open(
      new MemoryStorage(),
      {
        models: createModels(),
        registry: createRegistry(),
      },
      BACKGROUND_CONTEXT,
    );
    const root = await harness.root(BACKGROUND_CONTEXT);
    const view = await root.viewState(BACKGROUND_CONTEXT);
    try {
      assert.equal(root.id, 1);
      assert.equal(view.value.conversation.id, root.id);
    } finally {
      view.dispose();
    }
  } finally {
    await harness?.close(BACKGROUND_CONTEXT);
  }
});

test("Codemode and MCP guides preserve paired structure and safety boundaries", async () => {
  const [english, vietnamese] = await Promise.all([
    readGuide("en", "use-codemode-and-mcp"),
    readGuide("vi", "use-codemode-and-mcp"),
  ]);

  assert.deepEqual(headingShape(english), headingShape(vietnamese));
  assert.equal(codeFenceCount(english), codeFenceCount(vietnamese));

  assert.deepEqual(headings(english), [
    "# Use Codemode and MCP",
    "## Mental model",
    "## Choose how Tools reach the model",
    "## Configure MCP servers",
    "### Global and trusted-project configuration",
    "### stdio and streamable HTTP",
    "### OAuth and provider-token authentication",
    "## Discover and call Tools",
    "## Register MCP from an extension",
    "## Preserve permission boundaries",
    "## Handle results, errors, and retries",
    "## Operational checklist",
    "## Release-pinned sources",
  ]);
  assert.deepEqual(headings(vietnamese), [
    "# Sử dụng Codemode và MCP",
    "## Mô hình tư duy",
    "## Chọn cách model tiếp cận Tool",
    "## Cấu hình MCP server",
    "### Cấu hình global và trusted project",
    "### stdio và streamable HTTP",
    "### OAuth và xác thực bằng provider token",
    "## Khám phá và gọi Tool",
    "## Đăng ký MCP từ extension",
    "## Giữ nguyên permission boundary",
    "## Xử lý kết quả, lỗi và retry",
    "## Checklist vận hành",
    "## Nguồn được ghim theo release",
  ]);

  assert.deepEqual(codeFences(english), codeFences(vietnamese));

  const requiredTerms = [
    "QuickJS",
    "tool_search",
    "searchTools()",
    "describeTool()",
    "describeNamespace()",
    "ALL_TOOLS",
    "registerMcpServer",
    "oauth.clientName",
    "auth.provider",
    "structuredContent",
    "prepareLoadout()",
    "ctx.executeTool()",
    "parentToolCallId",
    "nestedCalls",
  ];
  for (const [locale, guide] of [
    ["en", english],
    ["vi", vietnamese],
  ]) {
    for (const term of requiredTerms) {
      assert.ok(guide.includes(term), `${locale} guide must include ${term}`);
    }
    assert.match(
      guide,
      /\bdirect\b[\s\S]*\bmodel-only\b[\s\S]*\bcodemode\b[\s\S]*\bdeferred\b[\s\S]*\bhidden\b/i,
      `${locale} guide must order all five Tool exposure values`,
    );

    const [mcpExposureStart, mcpExposureEnd] =
      locale === "en"
        ? [
            "MCP configuration accepts four values:",
            "`toolExposure` can override",
          ]
        : ["Cấu hình MCP nhận bốn giá trị:", "`toolExposure` có thể override"];
    const mcpExposureSection = guide.slice(
      guide.indexOf(mcpExposureStart) + mcpExposureStart.length,
      guide.indexOf(mcpExposureEnd),
    );
    const mcpExposureValues = [
      ...mcpExposureSection.matchAll(/^\| `([^`]+)` \|/gm),
    ].map(([, exposure]) => exposure);
    assert.deepEqual(
      mcpExposureValues,
      ["direct", "codemode", "deferred", "hidden"],
      `${locale} MCP exposure section must contain exactly four values`,
    );
    assert.ok(
      !mcpExposureSection.includes("`model-only`"),
      `${locale} MCP exposure must exclude model-only`,
    );

    const pinnedRoot =
      "https://github.com/earendil-works/pi/blob/005af57d88ee23b33778f343a9595b32e67ff788/";
    for (const sourcePath of [
      "packages/coding-agent/docs/mcp.md",
      "packages/coding-agent/docs/cli.md",
      "packages/coding-agent/src/extensions/codemode/index.ts",
      "packages/coding-agent/src/extensions/codemode/tool.ts",
      "packages/coding-agent/src/core/extensions/types.ts",
      "packages/coding-agent/src/core/mcp-servers.ts",
      "packages/coding-agent/CHANGELOG.md",
    ]) {
      assert.ok(
        guide.includes(`${pinnedRoot}${sourcePath}`),
        `${locale} guide must pin ${sourcePath}`,
      );
    }
    for (const tag of ["v0.99.0", "v0.99.1", "v0.99.2"]) {
      assert.ok(
        guide.includes(
          `https://github.com/earendil-works/pi/releases/tag/${tag}`,
        ),
        `${locale} guide must link release ${tag}`,
      );
    }
    assert.ok(
      guide.includes(
        "https://github.com/earendil-works/pi/commit/005af57d88ee23b33778f343a9595b32e67ff788",
      ),
      `${locale} guide must link the exact release commit page`,
    );
    assert.doesNotMatch(guide, /\/(?:blob|tree)\/main\/|\/latest(?:\/|\b)/);
  }

  assert.match(english, /MCP Tool calls are not retried[^.]*side effect/i);
  assert.match(vietnamese, /MCP Tool call không được retry[^.]*side effect/i);
  assert.match(
    english,
    /declares `outputSchema`[^.]*supplies `structuredContent`[^.]*`isError: true`/i,
  );
  assert.match(
    vietnamese,
    /khai báo `outputSchema`[^.]*cung cấp `structuredContent`[^.]*`isError: true`/i,
  );
  assert.match(
    english,
    /Only other failures[^.]*throw an `Error` in the script/i,
  );
  assert.match(
    vietnamese,
    /Chỉ các trường hợp lỗi còn lại[^.]*ném `Error` trong script/i,
  );
  for (const [locale, guide] of [
    ["en", english],
    ["vi", vietnamese],
  ]) {
    const firstPrompt = paragraphContaining(
      guide,
      locale === "en" ? "The first prompt waits" : "Prompt đầu tiên chỉ chờ",
    );
    assert.match(
      firstPrompt,
      locale === "en"
        ? /first prompt waits[^.]*only[^.]*servers with `direct` Tools/i
        : /Prompt đầu tiên chỉ chờ[^.]*server có Tool `direct`/i,
      `${locale} first prompt must wait only for direct MCP Tools`,
    );
    assert.match(
      firstPrompt,
      locale === "en"
        ? /Servers without `direct` Tools are awaited only on demand/i
        : /Server không có Tool `direct` chỉ được chờ khi cần/i,
      `${locale} indirect MCP servers must be awaited only on demand`,
    );
    assert.match(
      firstPrompt,
      locale === "en"
        ? /Codemode script waits on demand[^.]*server namespace/i
        : /Codemode script chờ theo nhu cầu[^.]*server namespace/i,
      `${locale} Codemode must await named servers on demand`,
    );
    assert.match(
      firstPrompt,
      locale === "en"
        ? /`tool_search`[^.]*MCP resource Tools wait[^.]*servers/i
        : /`tool_search`[^.]*MCP resource Tool chờ[^.]*server/i,
      `${locale} tool_search and MCP resource reads must await servers on demand`,
    );

    const providerAuth = paragraphContaining(
      guide,
      "Provider-token authentication",
    );
    assert.match(
      providerAuth,
      locale === "en"
        ? /prohibited in project `.pi\/mcp\.json`/i
        : /bị cấm trong `.pi\/mcp\.json` của project/i,
      `${locale} provider auth must be prohibited in project config`,
    );
    assert.match(
      providerAuth,
      locale === "en"
        ? /`auth\.provider` requires HTTPS except[^.]*loopback/i
        : /`auth\.provider` bắt buộc dùng HTTPS[^.]*ngoại trừ[^.]*loopback/i,
      `${locale} provider auth must require HTTPS except loopback`,
    );

    const normalization = paragraphContaining(guide, "Namespace normalization");
    assert.match(
      normalization,
      locale === "en"
        ? /replaces hyphens with underscores/i
        : /thay hyphen bằng underscore/i,
      `${locale} namespace normalization must replace hyphens`,
    );
    assert.match(
      normalization,
      /stable hash suffix/i,
      `${locale} normalized collisions must use stable hashes`,
    );
    assert.match(
      normalization,
      locale === "en"
        ? /server names that differ only[^.]*rejected[^.]*silently merging/i
        : /Tên server chỉ khác nhau[^.]*bị từ chối[^.]*không bị gộp ngầm/i,
      `${locale} invalid normalized names must reject instead of merge`,
    );

    const reload = paragraphContaining(guide, "`/reload`");
    assert.match(
      reload,
      locale === "en"
        ? /`\/reload` activates entries newly added to `defaultTools`/i
        : /`\/reload` activate các entry mới thêm vào `defaultTools`/i,
      `${locale} reload must activate newly added defaultTools entries`,
    );

    const codemodeOutput = paragraphContaining(
      guide,
      locale === "en" ? "unawaited work" : "work chưa được await",
    );
    assert.match(
      codemodeOutput,
      locale === "en"
        ? /`text\(\)`, `image\(\)`, `console\.\*`[^.]*top-level `return`[^.]*append script output/i
        : /`text\(\)`, `image\(\)`, `console\.\*`[^.]*`return` ở top-level[^.]*thêm[^.]*script output/i,
      `${locale} output helpers must append script output`,
    );
    assert.match(
      codemodeOutput,
      locale === "en"
        ? /`exit\(\)`[^.]*terminates[^.]*success[^.]*no output/i
        : /`exit\(\)`[^.]*chỉ kết thúc sớm[^.]*thành công[^.]*không thêm output/i,
      `${locale} exit must terminate successfully without output`,
    );
  }
  for (const [locale, guide, projectTrustPattern] of [
    ["en", english, /project trust[^.]*not an? sandbox[^.]*not authorization/i],
    [
      "vi",
      vietnamese,
      /project trust[^.]*không phải[^.]*sandbox[^.]*không phải[^.]*authorization/i,
    ],
  ]) {
    assert.match(
      guide,
      /connection[^.]*retry[^.]*\b(?:two|hai|2)\b[^.]*resource read[^.]*retry[^.]*\b(?:one|một|1)\b/is,
      `${locale} guide must bound connection and resource-read retries`,
    );
    assert.match(
      guide,
      /QuickJS[^.]*host process[^.]*filesystem[^.]*process permission/is,
      `${locale} guide must distinguish QuickJS from host permissions`,
    );
    assert.match(
      guide,
      projectTrustPattern,
      `${locale} guide must distinguish trust from sandbox and authorization`,
    );
  }
});

test("Virtual Model guides separate selection, dispatch, state, and accounting", async () => {
  const [english, vietnamese, fixture] = await Promise.all([
    readGuide("en", "route-virtual-models"),
    readGuide("vi", "route-virtual-models"),
    readFile(
      new URL(
        "tests/fixtures/pi-coding-agent-0992.contract.ts",
        repositoryRoot,
      ),
      "utf8",
    ),
  ]);

  assert.deepEqual(headings(english), [
    "# Route requests with Virtual Models",
    "## Selection and dispatch",
    "## Register a virtual model",
    "## Route user, continuation, retry, and direct requests",
    "## Keep sticky turns and retries correct",
    "## Persist JSON router state",
    "## Restore sessions and branches",
    "## Account for context, compaction, and cost",
    "## Use classifier and image operations deliberately",
    "## Failure modes and operational checklist",
    "## Release-pinned sources",
  ]);
  assert.deepEqual(headings(vietnamese), [
    "# Định tuyến request bằng Virtual Model",
    "## Selection và dispatch",
    "## Đăng ký Virtual Model",
    "## Định tuyến request user, continuation, retry và direct",
    "## Giữ đúng sticky turn và retry",
    "## Duy trì JSON router state",
    "## Khôi phục session và branch",
    "## Tính context, compaction và cost",
    "## Dùng classifier và image operation có chủ đích",
    "## Failure mode và checklist vận hành",
    "## Nguồn được ghim theo release",
  ]);
  assert.deepEqual(headingShape(english), headingShape(vietnamese));
  assert.equal(codeFenceCount(english), codeFenceCount(vietnamese));
  assert.doesNotMatch(
    vietnamese,
    /trả về về/,
    "vi guide must not duplicate the Vietnamese return preposition",
  );
  const englishFences = codeFences(english);
  const vietnameseFences = codeFences(vietnamese);
  assert.deepEqual(englishFences, vietnameseFences);
  assert.equal(englishFences.length, 1);
  assertTypeScriptSourceCompiles(
    "tests/fixtures/route-virtual-models-guide.contract.ts",
    englishFences[0].replace(/^```[^\n]*\n/, "").replace(/\n```$/, ""),
  );

  const registrationStart = fixture.indexOf(
    "  pi.registerVirtualModel<RouterState>({",
  );
  const registrationEnd =
    fixture.indexOf("\n  });", registrationStart) + "\n  });".length;
  assert.notEqual(registrationStart, -1);
  assert.ok(registrationEnd > registrationStart);
  assert.ok(
    englishFences[0].includes(
      fixture.slice(registrationStart, registrationEnd),
    ),
    "guide registration must stay synchronized with the compile-checked fixture",
  );

  const requiredTerms = [
    "registerVirtualModel",
    "ModelRouteReason",
    "user",
    "continuation",
    "retry",
    "direct",
    "request.previous",
    "request.failed",
    "request.state",
    "gpt-6.1-sol",
  ];
  const pinnedRoot =
    "https://github.com/earendil-works/pi/blob/005af57d88ee23b33778f343a9595b32e67ff788/";
  const pinnedPaths = [
    "packages/coding-agent/docs/virtual-models.md",
    "packages/coding-agent/src/core/virtual-models.ts",
    "packages/coding-agent/src/core/extensions/types.ts",
    "packages/ai/src/models.ts",
    "packages/coding-agent/CHANGELOG.md",
  ];

  for (const [locale, guide] of [
    ["en", english],
    ["vi", vietnamese],
  ]) {
    for (const term of requiredTerms) {
      assert.ok(guide.includes(term), `${locale} guide must include ${term}`);
    }
    for (const sourcePath of pinnedPaths) {
      assert.ok(
        guide.includes(`${pinnedRoot}${sourcePath}`),
        `${locale} guide must pin ${sourcePath}`,
      );
    }
    assert.ok(
      guide.includes(
        "https://github.com/earendil-works/pi/commit/005af57d88ee23b33778f343a9595b32e67ff788",
      ),
      `${locale} guide must link the exact release commit page`,
    );
    for (const tag of ["v0.99.0", "v0.99.1", "v0.99.2"]) {
      assert.ok(
        guide.includes(
          `https://github.com/earendil-works/pi/releases/tag/${tag}`,
        ),
        `${locale} guide must link release ${tag}`,
      );
    }
    assert.doesNotMatch(guide, /\/(?:blob|tree)\/main\/|\/latest(?:\/|\b)/);

    const localizedHeadings =
      locale === "en"
        ? {
            selection: "## Selection and dispatch",
            registration: "## Register a virtual model",
            reasons: "## Route user, continuation, retry, and direct requests",
            sticky: "## Keep sticky turns and retries correct",
            resume: "## Restore sessions and branches",
            accounting: "## Account for context, compaction, and cost",
            operations: "## Use classifier and image operations deliberately",
            failures: "## Failure modes and operational checklist",
          }
        : {
            selection: "## Selection và dispatch",
            registration: "## Đăng ký Virtual Model",
            reasons:
              "## Định tuyến request user, continuation, retry và direct",
            sticky: "## Giữ đúng sticky turn và retry",
            resume: "## Khôi phục session và branch",
            accounting: "## Tính context, compaction và cost",
            operations: "## Dùng classifier và image operation có chủ đích",
            failures: "## Failure mode và checklist vận hành",
          };
    const selectionSection = sectionContaining(
      guide,
      localizedHeadings.selection,
    );
    const registrationSection = sectionContaining(
      guide,
      localizedHeadings.registration,
    );
    const reasonsSection = sectionContaining(guide, localizedHeadings.reasons);
    const stickySection = sectionContaining(guide, localizedHeadings.sticky);
    const resumeSection = sectionContaining(guide, localizedHeadings.resume);
    const accountingSection = sectionContaining(
      guide,
      localizedHeadings.accounting,
    );
    const operationsSection = sectionContaining(
      guide,
      localizedHeadings.operations,
    );
    const failuresSection = sectionContaining(
      guide,
      localizedHeadings.failures,
    );

    const selection = paragraphContaining(
      selectionSection,
      locale === "en" ? "The selected pair" : "Cặp được chọn",
    );
    assert.match(
      selection,
      locale === "en"
        ? /selected pair[^.]*virtual provider\/model[^.]*virtual thinking level[^.]*separate[^.]*per-request dispatched pair[^.]*physical provider\/model[^.]*physical thinking level/i
        : /Cặp được chọn[^.]*virtual provider\/model[^.]*virtual thinking level[^.]*tách biệt[^.]*cặp dispatch theo từng request[^.]*physical provider\/model[^.]*physical thinking level/i,
      `${locale} guide must distinguish virtual selection from physical dispatch`,
    );

    const recordedSelection = paragraphContaining(
      selectionSection,
      locale === "en"
        ? "Pi stores the virtual selection"
        : "Pi lưu virtual selection",
    );
    assert.match(
      recordedSelection,
      locale === "en"
        ? /virtual selection[^.]*`model_change`[^.]*`thinking_level_change`[\s\S]*current selection remains visible through[^.]*`\/model`[^.]*`ctx\.model`[^.]*`ctx\.thinkingLevel`[^.]*`PI_MODEL`[^.]*`PI_REASONING_LEVEL`/i
        : /virtual selection[^.]*`model_change`[^.]*`thinking_level_change`[\s\S]*Selection hiện tại vẫn hiển thị qua[^.]*`\/model`[^.]*`ctx\.model`[^.]*`ctx\.thinkingLevel`[^.]*`PI_MODEL`[^.]*`PI_REASONING_LEVEL`/i,
      `${locale} selection entries and current identifiers must remain virtual`,
    );

    const messages = paragraphContaining(
      selectionSection,
      locale === "en"
        ? "Provider requests receive only"
        : "Provider request chỉ nhận",
    );
    assert.match(
      messages,
      locale === "en"
        ? /Provider requests receive only the physical dispatched model and thinking level[^.]*assistant message produced by that dispatch records the physical model[^.]*`provider`[^.]*`api`[^.]*`model`[^.]*`thinkingLevel` fields/i
        : /Provider request chỉ nhận physical model và thinking level đã dispatch[^.]*assistant message do dispatch đó tạo ra[^.]*ghi lại physical model[^.]*`provider`[^.]*`api`[^.]*`model`[^.]*`thinkingLevel`/i,
      `${locale} provider dispatch and assistant records must keep the physical model and thinking level`,
    );
    assert.match(
      messages,
      locale === "en"
        ? /routing fails before dispatch[^.]*error assistant message retains the virtual model/i
        : /routing thất bại trước dispatch[^.]*error assistant message vẫn giữ virtual model/i,
      `${locale} guide must preserve the virtual model on routing failures`,
    );

    const routeRegistration = tableRowContaining(
      registrationSection,
      "route(request, ctx)",
    );
    assert.match(
      routeRegistration,
      locale === "en"
        ? /Public extension callback[^|]*physical `model`[^|]*`thinkingLevel`[^|]*router `state`/i
        : /Public extension callback[^|]*physical `model`[^|]*`thinkingLevel`[^|]*router `state`/i,
      `${locale} registration table must define the public route callback`,
    );

    const lookup = paragraphContaining(
      registrationSection,
      locale === "en"
        ? "Use `ctx.modelRegistry.find(provider, id)`"
        : "Dùng `ctx.modelRegistry.find(provider, id)`",
    );
    assert.match(
      lookup,
      locale === "en"
        ? /look up a physical chat model[^.]*handle `undefined` explicitly[\s\S]*returned model must be physical[^.]*provider must have usable credentials[^.]*routing from one Virtual Model to another Virtual Model is invalid/i
        : /lookup physical chat model[^.]*xử lý `undefined`[^.]*tường minh[\s\S]*Model trả về phải là physical[^.]*provider của nó phải có credential sử dụng được[^.]*route từ một Virtual Model sang Virtual Model khác là không hợp lệ/i,
      `${locale} lookup must require a credentialed physical target and reject virtual-to-virtual routing`,
    );

    const reasonRows = ["user", "continuation", "retry", "direct"].map(
      (reason) => tableRowContaining(reasonsSection, reason),
    );
    assert.match(
      reasonRows[0],
      locale === "en"
        ? /first request after a user-authored prompt[^|]*steering message[^|]*follow-up/i
        : /Request đầu tiên sau prompt[^|]*steering message[^|]*follow-up[^|]*người dùng viết/i,
      `${locale} user reason must describe the first user-authored request`,
    );
    assert.match(
      reasonRows[1],
      locale === "en"
        ? /Another request inside the agent loop[^|]*after Tool results[^|]*extension messages/i
        : /Request khác bên trong agent loop[^|]*sau Tool result[^|]*extension message/i,
      `${locale} continuation reason must stay inside the agent loop`,
    );
    assert.match(
      reasonRows[2],
      locale === "en"
        ? /automatic retry after a failed physical request[^|]*after compaction[^|]*context overflow/i
        : /Automatic retry sau physical request thất bại[^|]*sau compaction[^|]*context overflow/i,
      `${locale} retry reason must cover failed requests and overflow compaction`,
    );
    assert.match(
      reasonRows[3],
      locale === "en"
        ? /outside the agent loop[^|]*compaction summary[^|]*`ctx\.modelRegistry\.streamSimple\(\)`/i
        : /ngoài agent loop[^|]*compaction summary[^|]*`ctx\.modelRegistry\.streamSimple\(\)`/i,
      `${locale} direct reason must describe work outside the agent loop`,
    );

    const sticky = paragraphContaining(
      stickySection,
      locale === "en"
        ? "`request.failed` takes precedence"
        : "`request.failed` có precedence",
    );
    assert.match(
      sticky,
      locale === "en"
        ? /`request\.failed` takes precedence[^.]*`request\.previous`[^.]*`request\.failed \?\? request\.previous`[\s\S]*continuation[^.]*`request\.previous`[^.]*retry[^.]*`request\.failed`[^.]*preserves provider prompt caches and thinking signatures/i
        : /`request\.failed` có precedence[^.]*`request\.previous`[^.]*`request\.failed \?\? request\.previous`[\s\S]*continuation[^.]*`request\.previous`[^.]*retry[^.]*`request\.failed`[^.]*bảo toàn provider prompt cache và thinking signature/i,
      `${locale} failed routing context must take precedence and preserve cache/signature continuity`,
    );

    const state = paragraphContaining(
      guide,
      locale === "en"
        ? "Router state must be JSON-serializable"
        : "Router state phải JSON-serializable",
    );
    assert.match(
      state,
      locale === "en"
        ? /JSON-serializable[^.]*session branch[^.]*forks[^.]*survives compaction[^.]*before dispatch[^.]*request later fails[^.]*new object only when[^.]*changes/i
        : /JSON-serializable[^.]*session branch[^.]*fork[^.]*sống qua compaction[^.]*trước dispatch[^.]*request lỗi sau đó[^.]*chỉ return object mới khi[^.]*thay đổi/i,
      `${locale} guide must explain durable state without unnecessary churn`,
    );

    const directState = paragraphContaining(
      guide,
      locale === "en"
        ? "A direct request has no router state"
        : "Direct request không có router state",
    );
    assert.match(
      directState,
      locale === "en"
        ? /direct request has no router state[\s\S]*returned state is ignored/i
        : /Direct request không có router state[\s\S]*state được return cũng bị bỏ qua/i,
      `${locale} direct requests must not read or persist router state`,
    );

    const accounting = paragraphContaining(
      accountingSection,
      locale === "en" ? "Usage and cost belong" : "Usage và cost thuộc",
    );
    assert.match(
      accounting,
      locale === "en"
        ? /Usage and cost belong[^.]*physical model[^.]*Context[^.]*physical[^.]*Compaction[^.]*physical model selected for each dispatch/i
        : /Usage và cost thuộc[^.]*physical model[^.]*Context[^.]*physical[^.]*Compaction[^.]*physical model được chọn cho từng dispatch/i,
      `${locale} accounting, context, and compaction must follow physical models`,
    );

    const contextLimits = paragraphContaining(
      accountingSection,
      locale === "en"
        ? "Before any successful physical response exists"
        : "Trước khi có successful physical response",
    );
    assert.match(
      contextLimits,
      locale === "en"
        ? /Before any successful physical response[^.]*Virtual Model[^.]*`contextWindow`[^.]*`maxTokens`[\s\S]*checks compaction[^.]*physical model selected for that dispatch[^.]*compacts before sending[^.]*without changing the router's choice/i
        : /Trước khi có successful physical response[^.]*`contextWindow`[^.]*`maxTokens`[^.]*Virtual Model[\s\S]*kiểm tra compaction[^.]*physical model được chọn cho dispatch[^.]*compact trước khi gửi[^.]*không thay đổi lựa chọn của router/i,
      `${locale} pre-response limits and per-dispatch compaction must follow the routed model without rerouting`,
    );

    const classifierLatency = paragraphContaining(
      operationsSection,
      locale === "en" ? "A router can use" : "Router có thể dùng",
    );
    assert.match(
      classifierLatency,
      locale === "en"
        ? /`ctx\.modelRegistry\.findOfType\('classifier', provider, id\)`[^.]*`ctx\.modelRegistry\.classify\(\)`[\s\S]*adds latency[^.]*first token/i
        : /`ctx\.modelRegistry\.findOfType\('classifier', provider, id\)`[^.]*`ctx\.modelRegistry\.classify\(\)`[\s\S]*làm tăng latency[^.]*first token/i,
      `${locale} classifier-assisted routing must disclose latency`,
    );
    const separateOperations = paragraphContaining(
      operationsSection,
      locale === "en"
        ? "Classifier and image generation"
        : "Classifier và image generation",
    );
    assert.match(
      separateOperations,
      locale === "en"
        ? /separate `ModelRuntime` operations[^.]*not chat models[\s\S]*`getModelsOfType\(\)`[^.]*`getModelOfType\(\)`[^.]*`getAvailableOfType\(\)`[^.]*`classify\(\)`[^.]*`generateImages\(\)`[^.]*`getModels\(\)`[^.]*`getModel\(\)`[^.]*chat-only accessors/i
        : /operation riêng của `ModelRuntime`[^.]*không phải chat model[\s\S]*`getModelsOfType\(\)`[^.]*`getModelOfType\(\)`[^.]*`getAvailableOfType\(\)`[^.]*`classify\(\)`[^.]*`generateImages\(\)`[^.]*`getModels\(\)`[^.]*`getModel\(\)`[^.]*accessor chỉ dành cho chat/i,
      `${locale} classifier and image operations must stay separate from chat accessors`,
    );

    const guarantee = paragraphContaining(
      failuresSection,
      locale === "en" ? "Pi does not guarantee" : "Pi không bảo đảm",
    );
    assert.match(
      guarantee,
      locale === "en"
        ? /does not guarantee[^.]*optimal choice/i
        : /không bảo đảm[^.]*lựa chọn tối ưu/i,
      `${locale} guide must reject an optimal-routing guarantee`,
    );

    const routeFailure = paragraphContaining(
      failuresSection,
      locale === "en"
        ? "The request ends with an error response"
        : "Request kết thúc bằng error response",
    );
    assert.match(
      routeFailure,
      locale === "en"
        ? /ends with an error response[^.]*`route\(\)` throws[^.]*returns another Virtual Model[^.]*physical provider without credentials/i
        : /kết thúc bằng error response[^.]*`route\(\)` throw[^.]*return một Virtual Model khác[^.]*physical provider không có credential/i,
      `${locale} invalid routing and missing credentials must end in an error response`,
    );

    const registeredResume = paragraphContaining(
      resumeSection,
      locale === "en" ? "latest `model_change`" : "`model_change` mới nhất",
    );
    assert.match(
      registeredResume,
      locale === "en"
        ? /restores a registered virtual selection[^.]*latest `model_change` entry[^.]*later assistant messages name physical models[\s\S]*Branch navigation and forks restore the router state attached to their own branch[^.]*two branches can advance independently/i
        : /khôi phục virtual selection đã đăng ký[^.]*entry `model_change` mới nhất[^.]*assistant message[^.]*physical model[\s\S]*Điều hướng branch và fork khôi phục router state gắn với chính branch đó[^.]*hai branch[^.]*độc lập/i,
      `${locale} registered resume and fork or /tree navigation must restore branch-local virtual selection and state`,
    );

    const fallbackResume = paragraphContaining(
      resumeSection,
      locale === "en"
        ? "If the selected Virtual Model is no longer registered"
        : "Nếu Virtual Model đã chọn không còn được đăng ký",
    );
    assert.match(
      fallbackResume,
      locale === "en"
        ? /falls back[^.]*latest successful physical response[\s\S]*`getBranchSelection\(\)`[^.]*without filtering[^.]*`error`[^.]*`aborted`[^.]*failed routing message remains virtual/i
        : /fallback[^.]*successful physical response gần nhất[\s\S]*`getBranchSelection\(\)`[^.]*không filter[^.]*`error`[^.]*`aborted`[^.]*routing thất bại vẫn là virtual/i,
      `${locale} guide must explain resume fallback and its 0.99.2 stop-reason edge case`,
    );
  }
});
