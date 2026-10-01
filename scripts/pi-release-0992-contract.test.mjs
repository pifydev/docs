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

  const headings = (markdown) =>
    [...markdown.matchAll(/^(#{1,6})\s+(.+)$/gm)].map(
      ([, hashes, title]) => `${hashes} ${title}`,
    );
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

  const codeFences = (markdown) =>
    [...markdown.matchAll(/^```[^\n]*\n[\s\S]*?^```$/gm)].map(
      ([fence]) => fence,
    );
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
