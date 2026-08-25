import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import ts from "typescript";

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
const chapter11ExampleFunction = "verifyDeterministicAgentRoundTrip";
const deterministicGuideFunction = "verifyDeterministicAgentTestingGuide";
const runtimeGuideFunction = "createSerializedSessionRuntimeHost";

function chapter11ExampleFence(markdown) {
  const matches = [
    ...markdown.matchAll(
      /^```(?:ts|typescript)\s*\r?\n([\s\S]*?)\r?\n```\s*$/gm,
    ),
  ].filter((match) =>
    match[1].includes(`function ${chapter11ExampleFunction}`),
  );
  assert.equal(
    matches.length,
    1,
    `Chapter 11 must contain exactly one TypeScript fence for ${chapter11ExampleFunction}`,
  );
  return matches[0][1].replaceAll("\r\n", "\n");
}

function parsedExampleContract(
  source,
  label,
  functionName = chapter11ExampleFunction,
  strictTopLevel,
) {
  const sourceFile = ts.createSourceFile(
    label,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  assert.equal(
    sourceFile.parseDiagnostics.length,
    0,
    `${label} must parse without syntax diagnostics`,
  );
  const functions = sourceFile.statements.filter(
    (statement) =>
      ts.isFunctionDeclaration(statement) &&
      statement.name?.text === functionName,
  );
  assert.equal(
    functions.length,
    1,
    `${label} must define exactly one ${functionName} function`,
  );

  if (strictTopLevel) {
    const runnerCalls = [];
    for (const statement of sourceFile.statements) {
      if (ts.isImportDeclaration(statement)) {
        const clause = statement.importClause;
        const hasNamedImports =
          clause?.namedBindings &&
          ts.isNamedImports(clause.namedBindings) &&
          clause.namedBindings.elements.length > 0;
        assert.ok(
          clause &&
            !(
              clause.namedBindings && ts.isNamespaceImport(clause.namedBindings)
            ) &&
            (clause.name || hasNamedImports),
          `${label} contains an unexpected top-level import`,
        );
        continue;
      }
      if (
        ts.isFunctionDeclaration(statement) &&
        statement.name?.text === functionName
      ) {
        continue;
      }
      if (
        strictTopLevel.runnerTitle &&
        ts.isExpressionStatement(statement) &&
        ts.isCallExpression(statement.expression) &&
        ts.isIdentifier(statement.expression.expression) &&
        statement.expression.expression.text === "test"
      ) {
        runnerCalls.push(statement.expression);
        continue;
      }
      assert.fail(
        `${label} contains an unexpected top-level statement: ${ts.SyntaxKind[statement.kind]}`,
      );
    }

    if (strictTopLevel.runnerTitle) {
      assert.equal(
        runnerCalls.length,
        1,
        `${label} must register the compile-checked function as a test`,
      );
      const [runnerCall] = runnerCalls;
      assert.equal(
        runnerCall.arguments.length,
        2,
        `${label} must register the compile-checked function as a test`,
      );
      assert.ok(
        ts.isStringLiteral(runnerCall.arguments[0]) &&
          runnerCall.arguments[0].text === strictTopLevel.runnerTitle &&
          ts.isIdentifier(runnerCall.arguments[1]) &&
          runnerCall.arguments[1].text === functionName,
        `${label} must register the compile-checked function as a test`,
      );
    }
  }

  const imports = new Map();
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    const moduleName = statement.moduleSpecifier.text;
    const clause = statement.importClause;
    if (!clause) continue;

    if (clause.name) {
      imports.set(clause.name.text, {
        local: clause.name.text,
        imported: "default",
        module: moduleName,
        typeOnly: clause.isTypeOnly,
      });
    }
    if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
      for (const element of clause.namedBindings.elements) {
        imports.set(element.name.text, {
          local: element.name.text,
          imported: element.propertyName?.text ?? element.name.text,
          module: moduleName,
          typeOnly: clause.isTypeOnly || element.isTypeOnly,
        });
      }
    }
  }

  const identifiers = new Set();
  const visit = (node) => {
    if (ts.isIdentifier(node)) identifiers.add(node.text);
    ts.forEachChild(node, visit);
  };
  visit(functions[0]);

  const requiredImports = [...identifiers]
    .filter((identifier) => imports.has(identifier))
    .map((identifier) => imports.get(identifier))
    .sort((left, right) => left.local.localeCompare(right.local));
  const allImports = [...imports.values()].sort((left, right) =>
    left.local.localeCompare(right.local),
  );
  const functionSource = source
    .slice(functions[0].getStart(sourceFile), functions[0].end)
    .replaceAll("\r\n", "\n")
    .trim();

  return { allImports, functionSource, requiredImports };
}

function deterministicGuideExampleFence(markdown, context) {
  const matches = [
    ...markdown.matchAll(
      /^```(?:ts|typescript)(?:\s+[^\r\n]*)?\s*\r?\n([\s\S]*?)\r?\n```\s*$/gm,
    ),
  ].filter((match) =>
    match[1].includes(`function ${deterministicGuideFunction}`),
  );
  assert.equal(
    matches.length,
    1,
    `${context} must contain exactly one TypeScript fence for ${deterministicGuideFunction}`,
  );
  return matches[0][1].replaceAll("\r\n", "\n");
}

function assertDeterministicGuideExampleParity(
  markdown,
  compileFixture,
  context,
) {
  const source = deterministicGuideExampleFence(markdown, context);
  const displayed = parsedExampleContract(
    source,
    `${context} displayed example`,
    deterministicGuideFunction,
    {
      runnerTitle: "runs a deterministic Agent without network access",
    },
  );
  const compiled = parsedExampleContract(
    compileFixture.replaceAll("\r\n", "\n"),
    "Pi 0.84.3 compile fixture",
    deterministicGuideFunction,
  );
  const testImport = {
    local: "test",
    imported: "default",
    module: "node:test",
    typeOnly: false,
  };
  const allowedImports = [...displayed.requiredImports, testImport].sort(
    (left, right) => left.local.localeCompare(right.local),
  );

  assert.deepEqual(
    displayed.allImports,
    allowedImports,
    `${context} displayed example must use only its compile-checked imports and node:test`,
  );
  assert.equal(
    displayed.functionSource,
    compiled.functionSource,
    `${context} displayed function must match the compile fixture`,
  );
  assert.deepEqual(
    displayed.requiredImports,
    compiled.requiredImports,
    `${context} required imports must match the compile fixture`,
  );
}

function runtimeGuideExampleFence(markdown, context) {
  const matches = [
    ...markdown.matchAll(
      /^```(?:ts|typescript)(?:\s+[^\r\n]*)?\s*\r?\n([\s\S]*?)\r?\n```\s*$/gm,
    ),
  ].filter((match) => match[1].includes(`function ${runtimeGuideFunction}`));
  assert.equal(
    matches.length,
    1,
    `${context} must contain exactly one TypeScript fence for ${runtimeGuideFunction}`,
  );
  return matches[0][1].replaceAll("\r\n", "\n");
}

function assertRuntimeGuideExampleParity(markdown, compileFixture, context) {
  const displayed = parsedExampleContract(
    runtimeGuideExampleFence(markdown, context),
    `${context} displayed example`,
    runtimeGuideFunction,
    {},
  );
  const compiled = parsedExampleContract(
    compileFixture.replaceAll("\r\n", "\n"),
    "Pi 0.84.3 compile fixture",
    runtimeGuideFunction,
  );

  assert.deepEqual(
    displayed.allImports,
    displayed.requiredImports,
    `${context} displayed example must not carry unused imports`,
  );
  assert.equal(
    displayed.functionSource,
    compiled.functionSource,
    `${context} displayed host function must match the compile fixture`,
  );
  assert.deepEqual(
    displayed.requiredImports,
    compiled.requiredImports,
    `${context} required imports must match the compile fixture`,
  );
}

function assertRuntimeGuideExtensionBindingOrder(markdown, context) {
  const source = runtimeGuideExampleFence(markdown, context);
  const helperStart = source.indexOf(
    "  const bindSession = async (session: AgentSession) => {",
  );
  const helperEnd = source.indexOf(
    "\n  runtime.setBeforeSessionInvalidate",
    helperStart,
  );
  assert.ok(helperStart >= 0, `${context} must define async bindSession`);
  assert.ok(helperEnd > helperStart, `${context} must scope async bindSession`);
  const helper = source.slice(helperStart, helperEnd);
  const extensionBinding =
    "await session.bindExtensions(bindings.extensionBindings(session));";
  const hostSubscription = "unsubscribe = bindings.subscribe(session);";
  assert.equal(
    helper.split(extensionBinding).length - 1,
    1,
    `${context} bindSession must bind Extensions exactly once`,
  );
  assert.equal(
    helper.split(hostSubscription).length - 1,
    1,
    `${context} bindSession must install the host subscription exactly once`,
  );
  assert.ok(
    helper.indexOf(extensionBinding) < helper.indexOf(hostSubscription),
    `${context} must bind Extensions before the host subscription`,
  );
  assert.match(
    source,
    /runtime\.setRebindSession\(async \(session\) => \{\s+await bindSession\(session\);/,
    `${context} replacement sessions must use bindSession`,
  );
  assert.match(
    source,
    /try \{\s+await bindSession\(runtime\.session\);/,
    `${context} initial session must use bindSession`,
  );
}

function assertChapter11ExampleParity(markdown, compileFixture) {
  const displayed = parsedExampleContract(
    chapter11ExampleFence(markdown),
    "Chapter 11 displayed example",
    chapter11ExampleFunction,
    {},
  );
  const compiled = parsedExampleContract(
    compileFixture.replaceAll("\r\n", "\n"),
    "Pi 0.84.3 compile fixture",
  );

  assert.deepEqual(
    displayed.allImports,
    displayed.requiredImports,
    "Chapter 11 displayed example must not carry unused imports",
  );
  assert.equal(
    displayed.functionSource,
    compiled.functionSource,
    "Chapter 11 displayed function must match the compile fixture",
  );
  assert.deepEqual(
    displayed.requiredImports,
    compiled.requiredImports,
    "Chapter 11 required imports must match the compile fixture",
  );
}

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

test("both replaceable session runtime guides name the public 0.84.3 contracts", async () => {
  const guides = await readLocalizedContent("how-to/host-session-runtime.md");

  for (const { locale, source } of guides) {
    for (const contract of [
      "createAgentSession",
      "createAgentSessionRuntime",
      "CreateAgentSessionRuntimeFactory",
      "AgentSessionRuntime",
    ]) {
      assert.match(
        source,
        new RegExp(`\\b${contract}\\b`),
        `${locale} replaceable session runtime guide must name ${contract}`,
      );
    }
  }
});

test("replaceable session runtime guide examples stay synchronized with the compile fixture", async () => {
  const [guides, compileFixture] = await Promise.all([
    readLocalizedContent("how-to/host-session-runtime.md"),
    readFile(
      new URL("tests/fixtures/pi-sdk-0843.contract.ts", repositoryRoot),
      "utf8",
    ),
  ]);

  const displayedExamples = guides.map(({ locale, source }) => {
    assert.doesNotThrow(() =>
      assertRuntimeGuideExampleParity(
        source,
        compileFixture,
        `${locale} replaceable session runtime guide`,
      ),
    );
    return runtimeGuideExampleFence(
      source,
      `${locale} replaceable session runtime guide`,
    );
  });
  assert.equal(
    displayedExamples[0],
    displayedExamples[1],
    "replaceable session runtime guide code must be identical across locales",
  );
});

test("replaceable session runtime parity rejects function and import drift", async () => {
  const [markdown, compileFixture] = await Promise.all([
    readFile(
      new URL("content/en/how-to/host-session-runtime.md", repositoryRoot),
      "utf8",
    ),
    readFile(
      new URL("tests/fixtures/pi-sdk-0843.contract.ts", repositoryRoot),
      "utf8",
    ),
  ]);
  const changedFunction = markdown.replace(
    "await createAgentSessionFromServices({",
    "await createAgentSessionFromServices({ /* drift */",
  );
  const changedImport = markdown.replace(
    'from "@earendil-works/pi-coding-agent";',
    'from "@earendil-works/pi-coding-agent/internal";',
  );
  assert.notEqual(changedFunction, markdown);
  assert.notEqual(changedImport, markdown);

  assert.throws(
    () =>
      assertRuntimeGuideExampleParity(
        changedFunction,
        compileFixture,
        "synthetic replaceable session runtime guide",
      ),
    /displayed host function must match the compile fixture/,
  );
  assert.throws(
    () =>
      assertRuntimeGuideExampleParity(
        changedImport,
        compileFixture,
        "synthetic replaceable session runtime guide",
      ),
    /required imports must match the compile fixture/,
  );
});

test("replaceable runtime guides bind Extensions before every host subscription", async () => {
  const guides = await readLocalizedContent("how-to/host-session-runtime.md");

  for (const { locale, source } of guides) {
    assert.doesNotThrow(() =>
      assertRuntimeGuideExtensionBindingOrder(
        source,
        `${locale} replaceable session runtime guide`,
      ),
    );
  }
});

test("replaceable runtime binding guard rejects missing and reordered Extension binding", async () => {
  const markdown = await readFile(
    new URL("content/en/how-to/host-session-runtime.md", repositoryRoot),
    "utf8",
  );
  const extensionBinding =
    "    await session.bindExtensions(bindings.extensionBindings(session));\n";
  const hostSubscription = "    unsubscribe = bindings.subscribe(session);\n";
  const missing = markdown.replace(extensionBinding, "");
  const reordered = markdown.replace(
    `${extensionBinding}${hostSubscription}`,
    `${hostSubscription}${extensionBinding}`,
  );
  assert.notEqual(missing, markdown);
  assert.notEqual(reordered, markdown);

  assert.throws(
    () =>
      assertRuntimeGuideExtensionBindingOrder(
        missing,
        "synthetic missing Extension binding",
      ),
    /must bind Extensions exactly once/,
  );
  assert.throws(
    () =>
      assertRuntimeGuideExtensionBindingOrder(
        reordered,
        "synthetic reordered Extension binding",
      ),
    /must bind Extensions before the host subscription/,
  );
});

test("both replaceable session runtime guides preserve the ten-step lifecycle and diagram actors", async () => {
  const guides = await readLocalizedContent("how-to/host-session-runtime.md");

  for (const { locale, source } of guides) {
    let cursor = -1;
    for (let step = 1; step <= 10; step += 1) {
      const next = source.search(new RegExp(`^## ${step}\\.`, "m"));
      assert.ok(
        next > cursor,
        `${locale} runtime guide step ${step} must be ordered`,
      );
      cursor = next;
    }
    for (const actor of [
      "Host lock",
      "Old session",
      "Runtime factory",
      "Replacement session",
      "Subscription rebind",
      "Disposal",
    ]) {
      assert.match(
        source,
        new RegExp(actor, "i"),
        `${locale} runtime guide Mermaid diagram must name ${actor}`,
      );
    }
  }
});

test("both deterministic Agent guides use the public faux-provider helpers", async () => {
  const guides = await readLocalizedContent(
    "how-to/test-agent-deterministically.md",
  );

  for (const { locale, source } of guides) {
    for (const helper of [
      "fauxProvider",
      "fauxAssistantMessage",
      "fauxToolCall",
      "fauxText",
    ]) {
      assert.match(
        source,
        new RegExp(`\\b${helper}\\b`),
        `${locale} deterministic Agent guide must use ${helper}`,
      );
    }
  }
});

test("deterministic Agent guide examples stay synchronized with the compile fixture", async () => {
  const [guides, compileFixture] = await Promise.all([
    readLocalizedContent("how-to/test-agent-deterministically.md"),
    readFile(
      new URL("tests/fixtures/pi-sdk-0843.contract.ts", repositoryRoot),
      "utf8",
    ),
  ]);

  const displayedExamples = guides.map(({ locale, source }) => {
    assert.doesNotThrow(() =>
      assertDeterministicGuideExampleParity(
        source,
        compileFixture,
        `${locale} deterministic Agent guide`,
      ),
    );
    return deterministicGuideExampleFence(
      source,
      `${locale} deterministic Agent guide`,
    );
  });
  assert.equal(
    displayedExamples[0],
    displayedExamples[1],
    "deterministic Agent guide code must be identical across locales",
  );
});

test("deterministic Agent guide parity rejects function, import, and runner drift", async () => {
  const [markdown, compileFixture] = await Promise.all([
    readFile(
      new URL(
        "content/en/how-to/test-agent-deterministically.md",
        repositoryRoot,
      ),
      "utf8",
    ),
    readFile(
      new URL("tests/fixtures/pi-sdk-0843.contract.ts", repositoryRoot),
      "utf8",
    ),
  ]);
  const changedFunction = markdown.replace(
    'fauxText("The total is 42.")',
    'fauxText("The total is forty-two.")',
  );
  const changedImport = markdown.replace(
    'from "@earendil-works/pi-agent-core";',
    'from "@earendil-works/pi-agent-core/internal";',
  );
  const changedRunner = markdown.replace(
    '"runs a deterministic Agent without network access"',
    '"runs a renamed deterministic test"',
  );
  assert.notEqual(changedFunction, markdown);
  assert.notEqual(changedImport, markdown);
  assert.notEqual(changedRunner, markdown);

  assert.throws(
    () =>
      assertDeterministicGuideExampleParity(
        changedFunction,
        compileFixture,
        "synthetic deterministic Agent guide",
      ),
    /displayed function must match the compile fixture/,
  );
  assert.throws(
    () =>
      assertDeterministicGuideExampleParity(
        changedImport,
        compileFixture,
        "synthetic deterministic Agent guide",
      ),
    /required imports must match the compile fixture/,
  );
  assert.throws(
    () =>
      assertDeterministicGuideExampleParity(
        changedRunner,
        compileFixture,
        "synthetic deterministic Agent guide",
      ),
    /must register the compile-checked function as a test/,
  );
});

test("deterministic Agent guide parser rejects malformed and unrelated top-level code", async () => {
  const [markdown, compileFixture] = await Promise.all([
    readFile(
      new URL(
        "content/en/how-to/test-agent-deterministically.md",
        repositoryRoot,
      ),
      "utf8",
    ),
    readFile(
      new URL("tests/fixtures/pi-sdk-0843.contract.ts", repositoryRoot),
      "utf8",
    ),
  ]);
  const source = deterministicGuideExampleFence(
    markdown,
    "English deterministic Agent guide",
  );
  const malformed = markdown.replace(source, `${source}\nconst malformed = ;`);
  const unrelated = markdown.replace(
    source,
    `${source}\nconst unrelated = true;`,
  );
  const sideEffectImport = markdown.replace(
    source,
    `import "unexpected-side-effect";\n${source}`,
  );
  assert.notEqual(malformed, markdown);
  assert.notEqual(unrelated, markdown);
  assert.notEqual(sideEffectImport, markdown);

  assert.throws(
    () =>
      assertDeterministicGuideExampleParity(
        malformed,
        compileFixture,
        "synthetic malformed deterministic Agent guide",
      ),
    /must parse without syntax diagnostics/,
  );
  assert.throws(
    () =>
      assertDeterministicGuideExampleParity(
        unrelated,
        compileFixture,
        "synthetic unrelated deterministic Agent guide",
      ),
    /contains an unexpected top-level statement/,
  );
  assert.throws(
    () =>
      assertDeterministicGuideExampleParity(
        sideEffectImport,
        compileFixture,
        "synthetic side-effect import deterministic Agent guide",
      ),
    /contains an unexpected top-level import/,
  );
});

test("deterministic Agent guide guards event indexes and asynchronous waits", async () => {
  const [guides, compileFixture] = await Promise.all([
    readLocalizedContent("how-to/test-agent-deterministically.md"),
    readFile(
      new URL("tests/fixtures/pi-sdk-0843.contract.ts", repositoryRoot),
      "utf8",
    ),
  ]);

  for (const { context, source } of [
    ...guides.map(({ locale, source }) => ({
      context: `${locale} deterministic Agent guide`,
      source,
    })),
    { context: "Pi 0.84.3 compile fixture", source: compileFixture },
  ]) {
    for (const pattern of [
      /const toolStartIndex = eventTypes\.indexOf\("tool_execution_start"\);/,
      /const toolEndIndex = eventTypes\.indexOf\("tool_execution_end"\);/,
      /assert\.ok\(toolStartIndex >= 0, "Tool execution start event is required"\);/,
      /assert\.ok\(toolEndIndex >= 0, "Tool execution end event is required"\);/,
      /toolStartIndex < toolEndIndex/,
      /awaitWithFailureWatchdog/,
      /clearTimeout\(watchdog\)/,
      /awaitWithFailureWatchdog\(\s*assistantStarted,/,
      /awaitWithFailureWatchdog\(\s*exhaustedAgent\.prompt\(/,
      /did not settle within \$\{WATCHDOG_MS\} ms/,
    ]) {
      assert.match(source, pattern, `${context} must cover ${pattern}`);
    }
  }
});

test("both deterministic Agent guides describe faux token chunk size accurately", async () => {
  const guides = Object.fromEntries(
    (await readLocalizedContent("how-to/test-agent-deterministically.md")).map(
      ({ locale, source }) => [locale, source],
    ),
  );

  assert.match(
    guides.en,
    /fixed two-token chunks[^.]*roughly eight characters/i,
  );
  assert.doesNotMatch(guides.en, /two-character chunks/i);
  assert.match(guides.vi, /chunk[^.]*hai token[^.]*xấp xỉ tám ký tự/i);
  assert.doesNotMatch(guides.vi, /chunk cố định hai ký tự/i);
});

test("Chapter 11 deterministic example stays synchronized with the compile fixture", async () => {
  const [markdown, compileFixture] = await Promise.all([
    readFile(
      new URL("content/en/ch11-testing-evaluation.md", repositoryRoot),
      "utf8",
    ),
    readFile(
      new URL("tests/fixtures/pi-sdk-0843.contract.ts", repositoryRoot),
      "utf8",
    ),
  ]);

  assert.doesNotThrow(() =>
    assertChapter11ExampleParity(markdown, compileFixture),
  );
});

test("Chapter 11 parity guard rejects function and required-import drift", async () => {
  const [markdown, compileFixture] = await Promise.all([
    readFile(
      new URL("content/en/ch11-testing-evaluation.md", repositoryRoot),
      "utf8",
    ),
    readFile(
      new URL("tests/fixtures/pi-sdk-0843.contract.ts", repositoryRoot),
      "utf8",
    ),
  ]);
  const changedFunction = markdown.replace(
    'fauxText("The total is 42.")',
    'fauxText("The total is forty-two.")',
  );
  const changedImport = markdown.replace(
    'from "@earendil-works/pi-agent-core";',
    'from "@earendil-works/pi-agent-core/node";',
  );
  assert.notEqual(changedFunction, markdown);
  assert.notEqual(changedImport, markdown);

  assert.throws(
    () => assertChapter11ExampleParity(changedFunction, compileFixture),
    /displayed function must match the compile fixture/,
  );
  assert.throws(
    () => assertChapter11ExampleParity(changedImport, compileFixture),
    /required imports must match the compile fixture/,
  );
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
