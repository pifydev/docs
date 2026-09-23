import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import ts from "typescript";

const repositoryRoot = new URL("../", import.meta.url);
const releaseFixtureURL = new URL(
  "fixtures/pi-release-0871.json",
  import.meta.url,
);
const releaseContractPackages = [
  "@earendil-works/pi-ai",
  "@earendil-works/pi-agent-core",
  "@earendil-works/pi-coding-agent",
  "@earendil-works/pi-server",
];
const chapter11ExampleFunction = "verifyDeterministicAgentRoundTrip";
const deterministicGuideFunction = "verifyDeterministicAgentTestingGuide";
const runtimeGuideFunction = "createSerializedSessionRuntimeHost";
const runtimeHostAdapterFunction = "bindSerializedSessionRuntimeHost";
const runtimeBindingFailureFunction = "throwSessionBindingFailure";
const externalSessionGuideFunction = "restoreExternalSessionEntries";
const requiredArchitectureTerms = [
  "@earendil-works/pi-client",
  "Client",
  "createClientServiceTransport",
  "@earendil-works/pi-protocol",
  "PROTOCOL_VERSION",
  "@earendil-works/pi-server",
  "RoutedServerServiceHost",
  "RoutedSessionHandle",
  "serverId",
  "sessionId",
  "attachmentId",
  "Chord",
];

function normalizeLineEndings(source) {
  return source.replace(/\r\n?/g, "\n");
}

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
        (statement.name?.text === functionName ||
          strictTopLevel.allowedFunctions?.includes(statement.name?.text))
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
    "Pi 0.87.1 compile fixture",
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
  const displayedSource = runtimeGuideExampleFence(markdown, context);
  const displayed = parsedExampleContract(
    displayedSource,
    `${context} displayed example`,
    runtimeGuideFunction,
    {
      allowedFunctions: [
        runtimeBindingFailureFunction,
        runtimeHostAdapterFunction,
      ],
    },
  );
  const compiled = parsedExampleContract(
    compileFixture.replaceAll("\r\n", "\n"),
    "Pi 0.87.1 compile fixture",
    runtimeGuideFunction,
  );
  const displayedFailureHelper = parsedExampleContract(
    displayedSource,
    `${context} displayed binding failure helper`,
    runtimeBindingFailureFunction,
  );
  const compiledFailureHelper = parsedExampleContract(
    compileFixture.replaceAll("\r\n", "\n"),
    "Pi 0.87.1 compile fixture binding failure helper",
    runtimeBindingFailureFunction,
  );
  const displayedHostAdapter = parsedExampleContract(
    displayedSource,
    `${context} displayed runtime host adapter`,
    runtimeHostAdapterFunction,
  );
  const compiledHostAdapter = parsedExampleContract(
    compileFixture.replaceAll("\r\n", "\n"),
    "Pi 0.87.1 compile fixture runtime host adapter",
    runtimeHostAdapterFunction,
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
  assert.equal(
    displayedFailureHelper.functionSource,
    compiledFailureHelper.functionSource,
    `${context} binding failure helper must match the compile fixture`,
  );
  assert.equal(
    displayedHostAdapter.functionSource,
    compiledHostAdapter.functionSource,
    `${context} runtime host adapter must match the compile fixture`,
  );
}

function externalSessionGuideExampleFence(markdown, context) {
  const matches = [
    ...markdown.matchAll(
      /^```(?:ts|typescript)(?:[ \t]+[^\r\n]*)?[ \t]*\r?\n([\s\S]*?)\r?\n```\s*$/gm,
    ),
  ].filter((match) =>
    match[1].includes(`function ${externalSessionGuideFunction}`),
  );
  assert.equal(
    matches.length,
    1,
    `${context} must contain exactly one TypeScript fence for ${externalSessionGuideFunction}`,
  );
  return matches[0][1].replaceAll("\r\n", "\n");
}

function assertExternalSessionGuideExampleParity(
  markdown,
  compileFixture,
  context,
) {
  const displayed = parsedExampleContract(
    externalSessionGuideExampleFence(markdown, context),
    `${context} displayed example`,
    externalSessionGuideFunction,
  );
  const compiled = parsedExampleContract(
    compileFixture.replaceAll("\r\n", "\n"),
    "Pi 0.87.1 compile fixture",
    externalSessionGuideFunction,
  );

  assert.deepEqual(
    displayed.allImports,
    displayed.requiredImports,
    `${context} displayed example must not carry unused imports`,
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

let compileFixtureBindingSequence = 0;

async function importCompileFixtureFunctions(
  source,
  functionNames,
  injectedBindings = {},
) {
  const normalized = source.replaceAll("\r\n", "\n");
  const executableSource = functionNames
    .map(
      (functionName) =>
        parsedExampleContract(
          normalized,
          `executable Pi 0.87.1 compile fixture ${functionName}`,
          functionName,
        ).functionSource,
    )
    .map((source) => (source.startsWith("export ") ? source : `export ${source}`))
    .join("\n\n");
  const compiled = ts.transpileModule(executableSource, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  });
  const bindingEntries = Object.entries(injectedBindings);
  if (bindingEntries.length === 0) {
    const moduleURL = `data:text/javascript;base64,${Buffer.from(compiled.outputText).toString("base64")}`;
    return import(moduleURL);
  }

  for (const [name] of bindingEntries) {
    assert.match(
      name,
      /^[A-Za-z_$][A-Za-z0-9_$]*$/,
      `fixture binding ${name} must be a JavaScript identifier`,
    );
    assert.match(
      executableSource,
      new RegExp(`\\b${name}\\b`),
      `fixture binding ${name} must be referenced by an extracted function`,
    );
  }

  const bindingKey = `pi-release-fixture:${process.pid}:${compileFixtureBindingSequence++}`;
  const bindingSymbol = Symbol.for(bindingKey);
  globalThis[bindingSymbol] = Object.freeze({ ...injectedBindings });
  const bindingPrelude = bindingEntries
    .map(
      ([name]) =>
        `const ${name} = globalThis[Symbol.for(${JSON.stringify(bindingKey)})][${JSON.stringify(name)}];`,
    )
    .join("\n");
  const moduleURL = `data:text/javascript;base64,${Buffer.from(`${bindingPrelude}\n${compiled.outputText}`).toString("base64")}`;
  try {
    return await import(moduleURL);
  } finally {
    delete globalThis[bindingSymbol];
  }
}

async function importCompileFixtureFunction(source, functionName) {
  return (await importCompileFixtureFunctions(source, [functionName]))[
    functionName
  ];
}

function createRuntimePortHarness(events, options = {}) {
  let beforeSessionInvalidate;
  let rebindSession;
  let replacementIndex = 0;

  const createSession = (label) => ({
    label,
    async bindExtensions() {
      events.push(`${label}:bind-extensions`);
    },
    async abort() {
      events.push(`${label}:abort`);
      if (options.abortFailure) throw options.abortFailure;
    },
  });

  const runtime = {
    session: createSession("old"),
    cwd: "/old",
    diagnostics: [],
    newSessionCalls: 0,
    setBeforeSessionInvalidate(callback) {
      beforeSessionInvalidate = callback;
    },
    setRebindSession(callback) {
      rebindSession = callback;
    },
    async newSession() {
      this.newSessionCalls += 1;
      events.push("replacement:before-invalidate");
      beforeSessionInvalidate?.();
      events.push("replacement:before-invalidate-returned");
      events.push("old:disposed");
      events.push("factory:called");
      options.onFactoryCalled?.();
      if (options.factoryGate) await options.factoryGate;
      if (options.factoryFailure) throw options.factoryFailure;
      replacementIndex += 1;
      const replacement = createSession(`replacement-${replacementIndex}`);
      this.session = replacement;
      this.cwd = `/replacement-${replacementIndex}`;
      events.push(`replacement-${replacementIndex}:applied`);
      await rebindSession?.(replacement);
      events.push(`replacement-${replacementIndex}:rebound`);
      return { cancelled: false };
    },
    async switchSession() {
      return this.newSession();
    },
    async fork() {
      await this.newSession();
      return { cancelled: false };
    },
    async importFromJsonl() {
      return this.newSession();
    },
    async dispose() {
      events.push("runtime:dispose");
      beforeSessionInvalidate?.();
      if (options.disposeFailure) throw options.disposeFailure;
    },
  };

  return runtime;
}

async function loadRuntimeHostAdapter() {
  const compileFixture = await readFile(
    new URL("tests/fixtures/pi-sdk-0871.contract.ts", repositoryRoot),
    "utf8",
  );
  return importCompileFixtureFunctions(compileFixture, [
    runtimeBindingFailureFunction,
    runtimeHostAdapterFunction,
  ]);
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
    /runtime\.setRebindSession\(async \(session\) => \{[\s\S]*?await bindSession\(session\);/,
    `${context} replacement sessions must use bindSession`,
  );
  assert.match(
    source,
    /try \{\s+await bindSession\(runtime\.session\);/,
    `${context} initial session must use bindSession`,
  );
}

function assertRuntimeGuideBindingFailureCleanup(markdown, context) {
  const source = runtimeGuideExampleFence(markdown, context);
  const bindStart = source.indexOf(
    "  const bindSession = async (session: AgentSession) => {",
  );
  const bindEnd = source.indexOf("\n  const disposeRuntimeFailure", bindStart);
  assert.ok(bindStart >= 0, `${context} must define async bindSession`);
  assert.ok(bindEnd > bindStart, `${context} must scope async bindSession`);
  const bindSession = source.slice(bindStart, bindEnd);
  const catchStart = bindSession.indexOf("  } catch (error) {");
  assert.ok(
    catchStart >= 0,
    `${context} bindSession must catch binding failure`,
  );
  assert.match(
    bindSession.slice(catchStart),
    /clearSubscriptionAfterFailure\(cleanupFailures\);/,
    `${context} bindSession must clear a newly installed subscription on failure`,
  );
  assert.match(
    bindSession.slice(catchStart),
    /throw new CapturedSessionBindingFailure\(error, cleanupFailures\);/,
    `${context} bindSession must preserve its primary and cleanup failures as flat captured data`,
  );

  const disposeStart = bindEnd + 1;
  const disposeEnd = source.indexOf("\n  const assertAvailable", disposeStart);
  assert.ok(
    disposeEnd > disposeStart,
    `${context} must scope disposeBindingFailure`,
  );
  const disposeFailure = source.slice(disposeStart, disposeEnd);
  assert.match(
    disposeFailure,
    /unusable = true;[\s\S]*?await runtime\.dispose\(\);[\s\S]*?finally \{[\s\S]*?replacementInFlight = true;[\s\S]*?unusable = true;/,
    `${context} failed binding must dispose the applied runtime and remain unavailable in finally`,
  );
  assert.match(
    disposeFailure,
    /error instanceof CapturedSessionBindingFailure[\s\S]*?cleanupFailures = \[\.\.\.captured\.cleanupFailures\][\s\S]*?throwSessionBindingFailure\(\s*captured\.primary,\s*cleanupFailures,/,
    `${context} disposal must append cleanup failures before one final throw with the original primary`,
  );
  assert.match(
    source,
    /runtime\.setRebindSession\(async \(session\) => \{[\s\S]*?catch \(error\) \{\s+return disposeRuntimeFailure\(error, "replacement session binding"\);/,
    `${context} replacement binding failure must use fail-closed disposal`,
  );
  assert.match(
    source,
    /try \{\s+await bindSession\(runtime\.session\);\s+\} catch \(error\) \{\s+return disposeRuntimeFailure\(error, "initial session binding"\);/,
    `${context} initial binding failure must use fail-closed disposal`,
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
    "Pi 0.87.1 compile fixture",
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
  const courseReadmeURL = new URL("course/README.md", repositoryRoot);

  return Promise.all(
    [...contentFiles, readmeURL, courseReadmeURL].map(async (fileURL) => ({
      filename: path.relative(repositoryRoot.pathname, fileURL.pathname),
      source: await readFile(fileURL, "utf8"),
    })),
  );
}

function findStaleContentFiles(
  activeSources,
  { previousVersion, previousCommit, historicalChangelogHeading },
) {
  return activeSources
    .filter(({ filename, source }) => {
      const activeSource = filename.endsWith("changelog.md")
        ? source.replace(
            new RegExp(
              `^${historicalChangelogHeading}\\r?\\n[\\s\\S]*?(?=^## |(?![\\s\\S]))`,
              "m",
            ),
            "",
          )
        : source;
      return (
        activeSource.includes(previousVersion) ||
        source.includes(previousCommit)
      );
    })
    .map(({ filename }) => filename)
    .sort();
}

function findStaleReleaseSurfaceFiles(
  releaseSurfaces,
  { previousCommit, previousReleaseFixture, previousSdkFixture },
) {
  return releaseSurfaces
    .filter(({ filename, source }) => {
      const activeSource = withoutAllowedStaleBaselineSelfTestLiterals(
        filename,
        source,
        previousCommit,
      );
      return (
        filename.includes(previousReleaseFixture) ||
        filename.includes(previousSdkFixture) ||
        activeSource.includes(previousCommit) ||
        activeSource.includes(previousReleaseFixture) ||
        activeSource.includes(previousSdkFixture)
      );
    })
    .map(({ filename }) => filename)
    .sort();
}

function withoutAllowedStaleBaselineSelfTestLiterals(
  filename,
  source,
  previousCommit,
) {
  if (
    filename.replaceAll("\\", "/") !== "scripts/pi-release-contract.test.mjs"
  ) {
    return source;
  }

  const previousBaselinePattern = `/0\\.84\\.3|${previousCommit}/`;
  const allowedLiteralsByTest = new Map([
    [
      "Pi 0.85 Tool and terminal pages use the current baseline metadata",
      [{ kind: "regex", value: previousBaselinePattern }],
    ],
    [
      "Pi 0.85 prompt and RPC pages use current source pins and review date",
      [{ kind: "regex", value: previousBaselinePattern }],
    ],
    [
      "parses the exact GitHub source ref for published Pi release links",
      [
        {
          kind: "string",
          value: `https://github.com/earendil-works/pi/blob/${previousCommit}/file.ts`,
        },
        { kind: "string", value: previousCommit },
      ],
    ],
  ]);
  const sourceFile = ts.createSourceFile(
    filename,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  );
  const allowedSpans = [];

  for (const statement of sourceFile.statements) {
    if (
      !ts.isExpressionStatement(statement) ||
      !ts.isCallExpression(statement.expression) ||
      !ts.isIdentifier(statement.expression.expression) ||
      statement.expression.expression.text !== "test"
    ) {
      continue;
    }
    const titleNode = statement.expression.arguments[0];
    if (!ts.isStringLiteral(titleNode)) continue;
    const remainingLiterals = allowedLiteralsByTest
      .get(titleNode.text)
      ?.slice();
    if (!remainingLiterals) continue;

    const visit = (node) => {
      const kind = ts.isRegularExpressionLiteral(node)
        ? "regex"
        : ts.isStringLiteral(node)
          ? "string"
          : undefined;
      if (kind) {
        const matchIndex = remainingLiterals.findIndex(
          (literal) => literal.kind === kind && literal.value === node.text,
        );
        if (matchIndex !== -1) {
          remainingLiterals.splice(matchIndex, 1);
          allowedSpans.push([node.getStart(sourceFile), node.end]);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(statement);
  }

  return allowedSpans
    .sort(([left], [right]) => right - left)
    .reduce(
      (activeSource, [start, end]) =>
        `${activeSource.slice(0, start)}${" ".repeat(end - start)}${activeSource.slice(end)}`,
      source,
    );
}

function tokenizeShellCommands(source, language = "shell") {
  const cmdShell = /^(?:cmd|bat)$/.test(language);
  const commands = [];
  let command = [];
  let argument = "";
  let atTokenBoundary = true;
  let quote;
  let comment = false;
  const endArgument = () => {
    if (cmdShell && command.length === 0 && /^(?:@?rem$|::)/i.test(argument)) {
      comment = true;
    } else if (argument.length > 0) {
      command.push(argument);
    }
    argument = "";
    atTokenBoundary = true;
  };
  const endCommand = () => {
    endArgument();
    if (command.length > 0) commands.push(command);
    command = [];
  };
  for (const character of source) {
    if (comment) {
      if (character !== "\n") continue;
      comment = false;
    }
    if (quote) {
      if (character === quote) quote = undefined;
      else argument += character;
    } else if (character === '"' || (!cmdShell && character === "'")) {
      quote = character;
      atTokenBoundary = false;
    } else if (!cmdShell && character === "#" && atTokenBoundary) {
      comment = true;
    } else if (/[\n;&|]/.test(character)) {
      endCommand();
    } else if (/\s/.test(character)) {
      endArgument();
    } else {
      argument += character;
      atTokenBoundary = false;
    }
  }
  assert.equal(quote, undefined, "SDK install recipes must close shell quotes");
  endCommand();
  return commands;
}

function sdkInstallCommands(markdown) {
  const snippets = [];
  for (const segment of markdownSemanticSegments(markdown)) {
    if (segment.kind === "code") {
      const [language = "shell"] = segment.fenceLanguages;
      if (!/^(?:bash|sh|shell|zsh|powershell|pwsh|ps1|cmd|bat)$/.test(language)) {
        continue;
      }
      const continuation = /^(?:powershell|pwsh|ps1)$/.test(language)
        ? /`\n[ \t]*/g
        : /^(?:cmd|bat)$/.test(language)
          ? /\^\n[ \t]*/g
          : /\\\n[ \t]*/g;
      const body = segment.text.split("\n").slice(1, -1).join("\n");
      snippets.push({
        source: body.replace(continuation, " "),
        language,
      });
    } else {
      snippets.push(
        ...[...segment.text.matchAll(/`([^`\n]+)`/g)].map((match) => ({
          source: match[1],
        })),
      );
    }
  }
  return snippets.flatMap(({ source, language }) =>
    tokenizeShellCommands(source, language).filter(
      ([executable, action]) => executable === "npm" && action === "install",
    ),
  );
}

function assertSdkInstallPackages(source, scope, context) {
  const importedPackages = new Set(
    [
      ...source.matchAll(
        /\bfrom\s+["'](@earendil-works\/pi-[a-z-]+)(?:\/[^"']*)?["']/g,
      ),
    ].map((match) => match[1]),
  );
  const installedPackages = sdkInstallCommands(scope).flatMap((command) =>
    command
      .slice(2)
      .map((argument) =>
        /^(@earendil-works\/pi-[a-z-]+)(?:@(.+))?$/.exec(argument),
      )
      .filter(Boolean),
  );
  assert.ok(importedPackages.size > 0, `${context} must import Pi packages`);
  assert.deepEqual(
    [...new Set(installedPackages.map((match) => match[1]))].sort(),
    [...importedPackages].sort(),
    `${context} must install every directly imported Pi package without unused dependencies`,
  );
  for (const [, packageName, version] of installedPackages) {
    assert.equal(
      version,
      "0.87.1",
      `${context} must pin ${packageName} to 0.87.1`,
    );
  }
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

function extractMarkdownPreamble(source, endHeading, context) {
  const lines = source.replaceAll("\r\n", "\n").split("\n");
  const end = lines.indexOf(endHeading);
  assert.notEqual(end, -1, `${context} must contain section ${endHeading}`);

  let start = 0;
  if (lines[0] === "---") {
    const frontmatterEnd = lines.indexOf("---", 1);
    assert.notEqual(
      frontmatterEnd,
      -1,
      `${context} must close its frontmatter`,
    );
    start = frontmatterEnd + 1;
  }

  return lines.slice(start, end).join("\n").trim();
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
  return matchingParagraph;
}

const providerContractTerms = [
  "TranscriptContext",
  "getCurrentSystemPrompt",
  "getCurrentTools",
];
const toolContractTerms = [
  "ToolCall.arguments",
  "ToolResultMessage.details",
  "JsonValue",
  "readonly",
  "user_bash",
  "undefined",
  "operations",
  "result",
];

const operationalFeatureTerms = [
  "cache_warming_decision",
  "compaction.modelOverrides",
  "reserveTokens",
  "keepRecentTokens",
  "/bug",
  "Radius",
  "Meta",
  "META_API_KEY",
  "ctx.modelRegistry.stream",
  "streamSimple",
];

function assertTextContentMessageRoles(source, locale) {
  const section = extractMarkdownSection(
    source,
    locale === "en"
      ? "### The exact message and content shapes"
      : "### Cấu trúc chính xác của message và content",
    `${locale} Chapter 6 content positions`,
  );
  const cells = section.body
    .split("\n")
    .filter((line) => line.startsWith("|"))
    .map((line) =>
      line
        .split("|")
        .slice(1, -1)
        .map((cell) => cell.trim()),
    )
    .find(([contentType]) => /`TextContent`/.test(contentType));
  assert.ok(cells, `${locale} TextContent row`);
  for (const role of [
    /\bsystem(?:message)?\b/i,
    /\buser\b/i,
    /\bassistant\b/i,
    /Tool result/i,
  ]) {
    assert.match(cells[2], role, `${locale} TextContent allowed message roles`);
  }
  return cells[2];
}

function assertAgentProviderOpening(source, locale) {
  const section = extractMarkdownSection(
    source,
    locale === "en"
      ? "## 1. The problem: one conversation, different provider dialects"
      : "## 1. Vấn đề: một cuộc hội thoại, nhiều provider dialect",
    `${locale} Chapter 4 opening boundary`,
  );
  const [paragraph] = section.body.split(/\n\s*\n/);
  // Validate the explicit technical pipeline; surrounding prose needs editorial review.
  const pipeline = paragraph.match(
    /`AgentContext`\s*\(\s*`AgentMessage\[\]`\s*,\s*`AgentTool\[\]`\s*\)\s*→\s*`convertToLlm`\s*→\s*`Message\[\]`\s*→\s*`normalizeContext\(\)`\s*→\s*`TranscriptContext`/,
  );
  assert.ok(
    pipeline,
    `${locale} opening must include the Agent-to-provider pipeline`,
  );
  return paragraph;
}

test("0.86.0 provider and tool contracts preserve system text in content positions", async () => {
  for (const { locale, source } of await readLocalizedContent(
    "ch06-messages.md",
  )) {
    assertTextContentMessageRoles(source, locale);
  }
});

test("0.86.0 provider and tool contracts preserve the Agent conversion boundary", async () => {
  for (const { locale, source } of await readLocalizedContent(
    "ch04-model-invocation.md",
  )) {
    assertAgentProviderOpening(source, locale);
  }
});

const agentProviderPipelineStages = [
  "`AgentContext` (`AgentMessage[]`, `AgentTool[]`)",
  "`convertToLlm`",
  "`Message[]`",
  "`normalizeContext()`",
  "`TranscriptContext`",
];
const agentProviderPipeline = agentProviderPipelineStages.join(" → ");

test("0.86.0 provider and tool contracts accept paraphrased Agent boundaries in both locales", () => {
  const rewrites = {
    en: [
      "## 1. The problem: one conversation, different provider dialects",
      `The Agent Loop keeps runtime state and executable Tools in Agent core. The request follows ${agentProviderPipeline}. The provider receives the normalized transcript.`,
    ],
    vi: [
      "## 1. Vấn đề: một cuộc hội thoại, nhiều provider dialect",
      `Agent Loop giữ trạng thái runtime và Tool thực thi trong Agent core. Request đi qua ${agentProviderPipeline}. Provider nhận transcript đã chuẩn hóa.`,
    ],
  };
  for (const [locale, [heading, paragraph]] of Object.entries(rewrites)) {
    assert.doesNotThrow(() =>
      assertAgentProviderOpening(`${heading}\n\n${paragraph}`, locale),
    );
    assert.doesNotThrow(() =>
      assertAgentProviderOpening(
        `${heading}\n\n${paragraph.replaceAll(". ", ".\n")}`,
        locale,
      ),
    );
    assert.doesNotThrow(() =>
      assertAgentProviderOpening(
        `${heading}\n\n${paragraph.replaceAll(" → ", "\n→\t")}`,
        locale,
      ),
    );
  }
});

test("0.86.0 provider and tool contracts reject inverted prose without the Agent pipeline", () => {
  const inverted = {
    en: [
      "## 1. The problem: one conversation, different provider dialects",
      "`AgentContext` contains `AgentMessage[]` and `AgentTool[]`, but `convertToLlm` is skipped; `Message[]` is never produced, `normalizeContext()` is never called, and no `TranscriptContext` reaches the provider.",
    ],
    vi: [
      "## 1. Vấn đề: một cuộc hội thoại, nhiều provider dialect",
      "`AgentContext` chứa `AgentMessage[]` và `AgentTool[]`, nhưng bỏ qua `convertToLlm`; `Message[]` không được tạo, `normalizeContext()` không được gọi và không có `TranscriptContext` nào đến provider.",
    ],
  };
  for (const [locale, [heading, paragraph]] of Object.entries(inverted)) {
    assert.throws(
      () => assertAgentProviderOpening(`${heading}\n\n${paragraph}`, locale),
      assert.AssertionError,
      `${locale} identifier order alone cannot replace the structural pipeline`,
    );
  }
});

test("0.86.0 provider and tool contracts reject omitted system text and bypassed Agent conversion", async () => {
  for (const { locale, source } of await readLocalizedContent(
    "ch06-messages.md",
  )) {
    const allowedRoles = assertTextContentMessageRoles(source, locale);
    const withoutSystem = allowedRoles.replace(
      /\bsystem(?:message)?\b\s*,?\s*/i,
      "",
    );
    assert.throws(
      () =>
        assertTextContentMessageRoles(
          source.replace(allowedRoles, withoutSystem),
          locale,
        ),
      assert.AssertionError,
      `${locale} system text cannot be omitted from the content table`,
    );
  }
  for (const { locale, source } of await readLocalizedContent(
    "ch04-model-invocation.md",
  )) {
    const paragraph = assertAgentProviderOpening(source, locale);
    for (const [from, to] of [
      ["`AgentContext`", "`Context`"],
      ["`AgentMessage[]`", "`Message[]`"],
      ["`AgentTool[]`", "`Tool[]`"],
      ["`convertToLlm`", "`serialize`"],
      ["`Message[]`", "`AgentMessage[]`"],
      ["`normalizeContext()`", "`castContext()`"],
      ["`TranscriptContext`", "`Context`"],
    ]) {
      const withoutIdentifier = paragraph.replaceAll(from, "");
      const reordered =
        from === "`TranscriptContext`"
          ? `${from} ${withoutIdentifier}`
          : `${withoutIdentifier} ${from}`;
      for (const [mutation, changedParagraph] of [
        ["removed", withoutIdentifier],
        ["replaced", paragraph.replaceAll(from, to)],
        ["reordered", reordered],
      ]) {
        assert.throws(
          () =>
            assertAgentProviderOpening(
              source.replace(paragraph, changedParagraph),
              locale,
            ),
          assert.AssertionError,
          `${locale} rejects ${mutation} ${from}`,
        );
      }
    }
    const mutations = [];
    for (let index = 0; index < agentProviderPipelineStages.length; index++) {
      const skipped = agentProviderPipelineStages.filter(
        (_, i) => i !== index,
      );
      mutations.push([`skipped stage ${index}`, skipped.join(" → ")]);
      if (index + 1 < agentProviderPipelineStages.length) {
        const swapped = [...agentProviderPipelineStages];
        [swapped[index], swapped[index + 1]] = [
          swapped[index + 1],
          swapped[index],
        ];
        mutations.push([
          `swapped stages ${index}/${index + 1}`,
          swapped.join(" → "),
        ]);
        const connectors = Array(agentProviderPipelineStages.length - 1).fill(
          " → ",
        );
        for (const connector of [" ", " ← "]) {
          connectors[index] = connector;
          mutations.push([
            `invalid arrow ${index}: ${JSON.stringify(connector)}`,
            agentProviderPipelineStages
              .map((stage, i) => stage + (connectors[i] ?? ""))
              .join(""),
          ]);
        }
      }
    }
    for (const [mutation, pipeline] of mutations) {
      assert.throws(
        () =>
          assertAgentProviderOpening(
            source.replace(agentProviderPipeline, pipeline),
            locale,
          ),
        assert.AssertionError,
        `${locale} rejects ${mutation}`,
      );
    }
    assert.throws(
      () =>
        assertAgentProviderOpening(
          source.replace(paragraph, `Boundary omitted.\n\n${paragraph}`),
          locale,
        ),
      assert.AssertionError,
      `${locale} the boundary must appear in the opening paragraph`,
    );
  }
});

function assertProviderTranscriptContract(
  source,
  locale,
  label,
  example = false,
) {
  for (const term of providerContractTerms)
    assert.ok(source.includes(term), `${label}: ${term}`);
  assertParagraphContainsAll(
    source,
    [
      /TranscriptContext/,
      /normalizeContext/,
      /brand/i,
      locale === "en" ? /must not cast/ : /không được ép kiểu/,
    ],
    `${label} normalization boundary`,
  );
  assertParagraphContainsAll(
    source,
    [
      /system/,
      /toolsAdded/,
      /toolsRemoved/,
      /sections/,
      locale === "en" ? /replay|in order/ : /phát lại|theo thứ tự/,
    ],
    `${label} transcript state`,
  );
  if (example) {
    const code = providerContextExample(source, label);
    assert.match(code, /context: TranscriptContext/);
    assert.match(
      code,
      /systemPrompt: getCurrentSystemPrompt\(context\.messages\)/,
    );
    assert.match(code, /tools: getCurrentTools\(context\.messages\)/);
    assert.doesNotMatch(
      code,
      /context\.(?:systemPrompt|tools)\b|\bas\s+(?:unknown|any|TranscriptContext)\b/,
    );
    return code;
  }
}

function providerContextExample(source, label) {
  const matches = [
    ...source.matchAll(/^```(?:ts|typescript)[^\n]*\r?\n([\s\S]*?)\r?\n```/gm),
  ].filter((match) => match[1].includes("function inspectProviderContext"));
  assert.equal(matches.length, 1, `${label} provider context example`);
  return normalizeLineEndings(matches[0][1]);
}

function assertJsonToolContract(source, locale, label) {
  assertParagraphContainsAll(
    source,
    [
      /ToolCall\.arguments/,
      /JsonObject/,
      /ToolResultMessage\.details/,
      locale === "en" ? /JSON-compatible/ : /tương thích JSON/,
    ],
    `${label} JSON values`,
  );
  assertParagraphContainsAll(
    source,
    [
      /ToolResultMessage/,
      /JsonRepresentation/,
      locale === "en"
        ? /incompatible type resolves to `never`/
        : /kiểu không tương thích cho kết quả `never`/,
      locale === "en" ? /conditional type/ : /kiểu có điều kiện/,
    ],
    `${label} conditional details`,
  );
  assertParagraphContainsAll(
    source,
    [
      /JsonValue/,
      /readonly/,
      locale === "en" ? /copy/ : /sao chép/,
      locale === "en"
        ? /add no runtime validation or freezing/
        : /không bổ sung kiểm tra.*runtime hay đóng băng/,
    ],
    `${label} readonly and runtime boundary`,
  );
}

function assertUserBashFailureContract(source, locale, label) {
  assertParagraphContainsAll(
    source,
    [
      /user_bash/,
      /undefined/,
      locale === "en"
        ? /only[^.]*continue propagation/
        : /chỉ[^.]*tiếp tục truyền event/,
      /\{ operations \}/,
      /\{ result \}/,
      locale === "en" ? /exactly one valid/ : /đúng một object hợp lệ/,
    ],
    `${label} user_bash handled result`,
  );
  assertParagraphContainsAll(
    source,
    [
      /user_bash/,
      locale === "en"
        ? /exception or invalid defined value aborts the command/
        : /exception hoặc giá trị đã định nghĩa không hợp lệ sẽ hủy lệnh/,
      locale === "en"
        ? /no later handler or local execution may run/
        : /không handler tiếp theo hay thực thi cục bộ nào được chạy/,
    ],
    `${label} user_bash fail closed`,
  );
}

test("0.86.0 provider and tool contracts are explained in paired guides, API reference, and chapters", async () => {
  const headings = {
    "how-to/plug-new-model.md": [
      "## 5. Implement an API adapter only for a new protocol",
      "## 5. Chỉ triển khai API adapter cho protocol mới",
    ],
    "reference/api.md": [
      "### Provider factories and adapters",
      "### Provider factory và adapter",
    ],
    "ch04-model-invocation.md": [
      "### The contracts an API implementation must satisfy",
      "### Contract mà API implementation phải tuân theo",
    ],
  };
  for (const filename of [
    "how-to/plug-new-model.md",
    "reference/api.md",
    "ch04-model-invocation.md",
  ]) {
    for (const { locale, source } of await readLocalizedContent(filename)) {
      const section = extractMarkdownSection(
        source,
        headings[filename][locale === "en" ? 0 : 1],
        filename,
      );
      assertProviderTranscriptContract(
        section.body,
        locale,
        `${locale} ${filename}`,
        filename !== "ch04-model-invocation.md",
      );
    }
  }
  const toolHeadings = {
    "how-to/add-custom-tool.md": [
      "## 2. Understand the handler contract",
      "## 2. Hiểu contract thực thi của handler",
    ],
    "reference/api.md": [
      "### Context, messages, and tools",
      "### Context, message và tool",
    ],
    "ch05-tool-system.md": [
      "### Layer 2: `AgentTool` adds an executable contract",
      "### Lớp 2: `AgentTool` bổ sung ràng buộc thực thi",
    ],
    "ch06-messages.md": [
      "### The exact message and content shapes",
      "### Cấu trúc chính xác của message và content",
    ],
  };
  const bashHeadings = {
    "how-to/add-custom-tool.md": [
      "## 4. Add a permission gate",
      "## 4. Thêm permission gate",
    ],
    "reference/api.md": ["#### `user_bash` event", "#### Event `user_bash`"],
    "ch05-tool-system.md": [
      "### The error contract ends at a finalized Tool call",
      "### Ràng buộc lỗi kết thúc tại lời gọi Tool đã được chốt",
    ],
  };
  for (const filename of [
    "how-to/add-custom-tool.md",
    "reference/api.md",
    "ch05-tool-system.md",
    "ch06-messages.md",
  ]) {
    for (const { locale, source } of await readLocalizedContent(filename)) {
      const label = `${locale} ${filename}`;
      const section = extractMarkdownSection(
        source,
        toolHeadings[filename][locale === "en" ? 0 : 1],
        label,
      );
      assertJsonToolContract(section.body, locale, label);
      if (filename !== "ch06-messages.md") {
        for (const term of toolContractTerms)
          assert.ok(source.includes(term), `${label}: ${term}`);
        const bashSection = extractMarkdownSection(
          source,
          bashHeadings[filename][locale === "en" ? 0 : 1],
          label,
        );
        assertUserBashFailureContract(bashSection.body, locale, label);
      } else {
        assert.match(
          source,
          /Message = SystemMessage \| UserMessage \| AssistantMessage \| ToolResultMessage/,
        );
        assertParagraphContainsAll(
          source,
          [
            /toolCallId/,
            /ToolCall\.id/,
            locale === "en" ? /preserve/ : /giữ nguyên/,
          ],
          `${label} call/result pairing`,
        );
        assert.doesNotMatch(
          source,
          /interface ToolResultMessage|arguments: Record<string, any>|addedToolNames/,
        );
      }
    }
  }
});

test("0.86.0 provider and tool contracts pages pin current sources and review date", async () => {
  const release = await readReleaseFixture();
  for (const filename of [
    "ch04-model-invocation.md",
    "ch05-tool-system.md",
    "ch06-messages.md",
    "how-to/add-custom-tool.md",
    "how-to/plug-new-model.md",
    "reference/api.md",
  ]) {
    for (const { locale, source } of await readLocalizedContent(filename)) {
      const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(source)?.[1];
      assert.ok(frontmatter, `${locale} ${filename} frontmatter`);
      assert.match(frontmatter, /^last_updated: '2026-09-23'$/m);
      assert.deepEqual(
        invalidPiSourceLinks([{ filename, source }], release),
        [],
      );
    }
  }
});

test("0.86.0 provider and tool contracts mutation guards reject broken relationships", async () => {
  for (const { locale, source } of await readLocalizedContent(
    "reference/api.md",
  )) {
    assertProviderTranscriptContract(source, locale, locale, true);
    assertJsonToolContract(source, locale, locale);
    assertUserBashFailureContract(source, locale, locale);
    for (const [from, to, check] of [
      [
        "getCurrentTools(context.messages)",
        "getCurrentTools([])",
        (text) => assertProviderTranscriptContract(text, locale, locale, true),
      ],
      [
        "getCurrentSystemPrompt(context.messages)",
        "getCurrentSystemPrompt([])",
        (text) => assertProviderTranscriptContract(text, locale, locale, true),
      ],
      [
        locale === "en" ? "must not cast" : "không được ép kiểu",
        locale === "en" ? "may cast" : "có thể ép kiểu",
        (text) => assertProviderTranscriptContract(text, locale, locale),
      ],
      [
        locale === "en" ? "conditional type" : "kiểu có điều kiện",
        "interface",
        (text) => assertJsonToolContract(text, locale, locale),
      ],
      [
        locale === "en"
          ? "incompatible type resolves to `never`"
          : "kiểu không tương thích cho kết quả `never`",
        "compatible types resolve to never",
        (text) => assertJsonToolContract(text, locale, locale),
      ],
      [
        locale === "en"
          ? "add no runtime validation or freezing"
          : "không bổ sung kiểm tra dữ liệu ở runtime hay đóng băng",
        "validate and freeze values at runtime",
        (text) => assertJsonToolContract(text, locale, locale),
      ],
      [
        locale === "en"
          ? "`ToolCall.arguments` is a `JsonObject`"
          : "`ToolCall.arguments` có kiểu `JsonObject`",
        "`ToolCall.arguments` accepts arbitrary values",
        (text) => assertJsonToolContract(text, locale, locale),
      ],
      [
        locale === "en"
          ? "copy an array before mutating"
          : "sao chép mảng trước khi sửa",
        "mutate arrays freely",
        (text) => assertJsonToolContract(text, locale, locale),
      ],
      [
        locale === "en" ? "exactly one valid" : "đúng một object hợp lệ",
        "both",
        (text) => assertUserBashFailureContract(text, locale, locale),
      ],
      [
        locale === "en"
          ? "no later handler or local execution may run"
          : "không handler tiếp theo hay thực thi cục bộ nào được chạy",
        "later handlers may continue",
        (text) => assertUserBashFailureContract(text, locale, locale),
      ],
    ]) {
      assert.ok(source.includes(from), `${locale} mutation target: ${from}`);
      assert.throws(
        () => check(source.replaceAll(from, to)),
        assert.AssertionError,
        `${locale}: ${from}`,
      );
    }
  }
});

test("0.86.0 provider and tool contracts provider examples typecheck against public 0.87.1 declarations", async () => {
  const examples = [];
  for (const filename of ["how-to/plug-new-model.md", "reference/api.md"]) {
    for (const { locale, source } of await readLocalizedContent(filename)) {
      examples.push(providerContextExample(source, `${locale} ${filename}`));
    }
  }
  assert.ok(
    examples.every((source) => source === examples[0]),
    "all locales use the same provider example",
  );
  const filename = fileURLToPath(
    new URL("tests/fixtures/provider-context-example.ts", repositoryRoot),
  );
  const options = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    types: ["node"],
  };
  const host = ts.createCompilerHost(options);
  const readSource = host.getSourceFile.bind(host);
  host.getSourceFile = (file, languageVersion, ...args) =>
    path.resolve(file) === path.resolve(filename)
      ? ts.createSourceFile(file, examples[0], languageVersion, true)
      : readSource(file, languageVersion, ...args);
  const program = ts.createProgram([filename], options, host);
  const diagnostics = ts.getPreEmitDiagnostics(program);
  assert.equal(
    diagnostics.length,
    0,
    ts.formatDiagnostics(diagnostics, {
      getCanonicalFileName: (file) => file,
      getCurrentDirectory: () => fileURLToPath(repositoryRoot),
      getNewLine: () => "\n",
    }),
  );
});

test("0.86.0 provider and tool contracts Tool examples typecheck against public 0.87.1 declarations", async () => {
  const files = new Map();
  for (const { locale, source } of await readLocalizedContent(
    "how-to/add-custom-tool.md",
  )) {
    let extensionIndex = 0;
    for (const match of source.matchAll(
      /^```ts title="([^"]+\.ts)"\r?\n([\s\S]*?)\r?\n```/gm,
    )) {
      const title =
        match[1] === ".pi/extensions/weather.ts"
          ? `.pi/extensions/weather-${extensionIndex++}.ts`
          : match[1];
      const filename = fileURLToPath(
        new URL(`tests/fixtures/tool-guide-${locale}/${title}`, repositoryRoot),
      );
      files.set(path.resolve(filename), match[2]);
    }
    assert.equal(
      extensionIndex,
      2,
      `${locale} both Extension registration routes`,
    );
  }
  for (const { locale, source } of await readLocalizedContent(
    "reference/api.md",
  )) {
    for (const title of ["tool.ts", "extension.ts"]) {
      const code = [
        ...source.matchAll(/^```ts title="([^"]+)"\r?\n([\s\S]*?)\r?\n```/gm),
      ].find((match) => match[1] === title)?.[2];
      assert.ok(code, `${locale} API ${title}`);
      const filename = fileURLToPath(
        new URL(`tests/fixtures/tool-api-${locale}/${title}`, repositoryRoot),
      );
      files.set(path.resolve(filename), code);
    }
  }
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
  const originalExists = host.fileExists.bind(host);
  const originalDirectoryExists = host.directoryExists.bind(host);
  const originalSourceFile = host.getSourceFile.bind(host);
  host.fileExists = (file) =>
    files.has(path.resolve(file)) || originalExists(file);
  host.directoryExists = (directory) =>
    [...files.keys()].some((file) =>
      file.startsWith(path.resolve(directory) + path.sep),
    ) || originalDirectoryExists(directory);
  host.getSourceFile = (file, languageVersion, ...args) =>
    files.has(path.resolve(file))
      ? ts.createSourceFile(
          file,
          files.get(path.resolve(file)),
          languageVersion,
          true,
        )
      : originalSourceFile(file, languageVersion, ...args);
  const program = ts.createProgram([...files.keys()], options, host);
  const diagnostics = ts.getPreEmitDiagnostics(program);
  assert.equal(
    diagnostics.length,
    0,
    ts.formatDiagnostics(diagnostics, {
      getCanonicalFileName: (file) => file,
      getCurrentDirectory: () => fileURLToPath(repositoryRoot),
      getNewLine: () => "\n",
    }),
  );
});

test("0.86.x operational features preserve runtime boundaries in both locales", async () => {
  const scopedFiles = [
    "ch07-event-driven.md",
    "ch08-context-engineering.md",
    "ch09-compaction.md",
    "ch10-session.md",
    "how-to/customize-system-prompt.md",
    "how-to/stream-output.md",
    "reference/api.md",
    "reference/configuration.md",
    "reference/environment-variables.md",
  ];
  const localized = new Map(
    await Promise.all(
      scopedFiles.flatMap((filename) =>
        ["en", "vi"].map(async (locale) => [
          `${locale}/${filename}`,
          await readFile(
            new URL(`content/${locale}/${filename}`, repositoryRoot),
            "utf8",
          ),
        ]),
      ),
    ),
  );

  for (const locale of ["en", "vi"]) {
    const get = (filename) => localized.get(`${locale}/${filename}`);
    const corpus = scopedFiles.map(get).join("\n");
    const language =
      locale === "en"
        ? {
            costAware: /cost-aware/i,
            longTool: /long Tool (?:run|execution)/i,
            optionalIdle: /optional(?:ly)?[^.\n]*idle|idle[^.\n]*optional/i,
            cacheLifetime: /(?:cache|`promptCache`)[^.\n]*lifetime/i,
            noFreeGuarantee:
              /does not (?:eliminate|remove)[^.\n]*(?:cost|charge)[^.\n]*(?:does not|cannot)[^.\n]*guarantee[^.\n]*cache hit/i,
            fallback: /fall(?:s)? back independently/i,
            secretRedaction:
              /secret[^.\n]*(?:redact|omit)|(?:redact|omit)[^.\n]*secret/i,
            transcriptChoice:
              /(?:include|attach)[^.\n]*transcript[^.\n]*(?:model-written|model-generated)[^.\n]*summary/i,
            offlineBoundary:
              /offline[^.\n]*(?:local )?(?:ZIP|zip)[^.\n]*(?:cannot|disable|block)[^.\n]*upload/i,
            catalogLayers:
              /offline[^.\n]*catalog[^.\n]*cached[^.\n]*(?:live|gateway)/i,
            museRefresh:
              /\/login meta[^.\n]*(?:automatic|refresh)[^.\n]*(?:Muse|Model API key)/i,
            resolvedAuth: /resolved authentication/i,
            unsubscribe: /returns? (?:an? )?unsubscribe function/i,
            snapshot:
              /(?:added|removed)[^.\n]*during[^.\n]*dispatch[^.\n]*(?:later|subsequent)[^.\n]*dispatch/i,
            strictPrefer: /strict-prefer/i,
            promptDelta:
              /structured[^.\n]*(?:prompt|section|tool|guideline)[^.\n]*transcript delta/i,
            directRpcCommands: /direct RPC[^.\n]*`steer`[^.\n]*`follow_up`/i,
            rpcInputHandlers: /Extension `input` handlers/i,
            rpcBeforeQueue:
              /`input` handlers[^.\n]*before[^.\n]*(?:queue|queued)/i,
            sameRenderedPrompt: /same current rendered prompt/i,
            earlierPromptHandlers:
              /(?:mutation|change)s?[^.\n]*(?:earlier|prior) handlers/i,
          }
        : {
            costAware: /cân nhắc chi phí/i,
            longTool:
              /Tool (?:run|execution|chạy|thực thi)[^.\n]*dài|(?:run|lần chạy) Tool dài/i,
            optionalIdle:
              /(?:tùy chọn|có thể|cho phép)[^.\n]*idle|idle[^.\n]*(?:tùy chọn|nếu bật|có thể|cho phép)/i,
            cacheLifetime:
              /(?:thời gian sống|cache lifetime|`promptCache`[^.\n]*lifetime)/i,
            noFreeGuarantee:
              /không (?:loại bỏ|xóa)[^.\n]*(?:chi phí|phí)[^.\n]*(?:không bảo đảm|không đảm bảo)[^.\n]*cache hit/i,
            fallback: /fallback độc lập|rơi về độc lập/i,
            secretRedaction:
              /(?:che|loại bỏ)[^.\n]*secret|secret[^.\n]*(?:che|loại bỏ)/i,
            transcriptChoice:
              /(?:kèm|đính kèm)[^.\n]*transcript[^.\n]*(?:model[^.\n]*summary|summary[^.\n]*model)/i,
            offlineBoundary:
              /offline[^.\n]*(?:ZIP|zip)[^.\n]*(?:không thể|chặn|tắt)[^.\n]*upload/i,
            catalogLayers:
              /catalog offline[^.\n]*(?:đã cache|cache)[^.\n]*(?:trực tiếp|live|gateway)/i,
            museRefresh:
              /\/login meta[^.\n]*(?:tự động|refresh)[^.\n]*(?:Muse|Model API key)/i,
            resolvedAuth: /(?:xác thực|authentication) đã (?:được )?resolve/i,
            unsubscribe: /trả về (?:một )?hàm unsubscribe/i,
            snapshot:
              /(?:thêm|xóa)[^.\n]*trong (?:một |lúc )?dispatch[^.\n]*(?:sau|tiếp theo)/i,
            strictPrefer: /strict-prefer/i,
            promptDelta:
              /(?:prompt|section|tool|guideline)[^.\n]*có cấu trúc[^.\n]*transcript delta|transcript delta[^.\n]*(?:prompt|section|tool|guideline)/i,
            directRpcCommands: /RPC trực tiếp[^.\n]*`steer`[^.\n]*`follow_up`/i,
            rpcInputHandlers: /handler `input` của Extension/i,
            rpcBeforeQueue:
              /handler `input`[^.\n]*trước khi[^.\n]*(?:queue|xếp hàng)/i,
            sameRenderedPrompt: /đúng prompt hiện tại đã render/i,
            earlierPromptHandlers:
              /(?:mutation|thay đổi)[^.\n]*handler chạy trước/i,
          };

    for (const term of operationalFeatureTerms) {
      assert.ok(corpus.includes(term), `${locale} operational corpus: ${term}`);
    }

    const compaction = get("ch09-compaction.md");
    assertContainsAll(
      compaction,
      [
        language.costAware,
        language.longTool,
        language.optionalIdle,
        /`\/session`/,
        /transcript/i,
        /`cache_warming_decision`/,
        language.cacheLifetime,
        language.noFreeGuarantee,
      ],
      `${locale} cache warming boundaries`,
    );
    assertParagraphContainsAll(
      compaction,
      [
        /`compaction\.modelOverrides`/,
        /`reserveTokens`/,
        /`keepRecentTokens`/,
        language.fallback,
      ],
      `${locale} per-model compaction fallback`,
    );
    const cacheDecisionPatterns = [
      /`cache_warming_decision`/,
      /`streaming`/,
      /`idle`/,
    ];
    const cacheDecisionParagraph = assertParagraphContainsAll(
      compaction,
      cacheDecisionPatterns,
      `${locale} cache warming decision phases`,
    );
    for (const [phase, replacement] of [
      ["streaming", "active"],
      ["idle", "settled"],
    ]) {
      const mutatedParagraph = cacheDecisionParagraph.replaceAll(
        `\`${phase}\``,
        `\`${replacement}\``,
      );
      assert.notEqual(
        mutatedParagraph,
        cacheDecisionParagraph,
        `${locale} cache decision fixture must contain ${phase}`,
      );
      assert.throws(
        () =>
          assertParagraphContainsAll(
            compaction.replace(cacheDecisionParagraph, mutatedParagraph),
            cacheDecisionPatterns,
            `${locale} mutated cache warming decision phases`,
          ),
        assert.AssertionError,
        `${locale} cache decision contract rejects missing ${phase} phase`,
      );
    }

    const sessions = get("ch10-session.md");
    assertContainsAll(
      sessions,
      [
        /`\/bug \[description\]`/,
        /metadata/i,
        language.secretRedaction,
        language.transcriptChoice,
        /Radius/,
        /ZIP/i,
        language.offlineBoundary,
        /`~\/\.pi\/agent\/crashes\.json`/,
      ],
      `${locale} bug-reporting boundaries`,
    );

    assertParagraphContainsAll(
      get("reference/configuration.md"),
      [/Radius/, language.catalogLayers],
      `${locale} Radius catalog layering`,
    );
    assertParagraphContainsAll(
      get("reference/environment-variables.md"),
      [/`META_API_KEY`/, /`\/login meta`/, language.museRefresh],
      `${locale} Meta Muse authentication`,
    );

    const events = get("ch07-event-driven.md");
    assertContainsAll(
      events,
      [
        /`ctx\.modelRegistry\.stream\(\)`/,
        /`streamSimple\(\)`/,
        language.resolvedAuth,
        /`pi\.on\(\)`/,
        language.unsubscribe,
        language.snapshot,
      ],
      `${locale} Extension model and subscription APIs`,
    );

    assertParagraphContainsAll(
      get("ch08-context-engineering.md"),
      [
        /`read`/,
        /`bash`/,
        /`powershell`/,
        /`edit`/,
        /`write`/,
        language.strictPrefer,
        /`constrainedSampling: false`/,
      ],
      `${locale} built-in constrained sampling`,
    );
    const promptCustomization = get("how-to/customize-system-prompt.md");
    assert.match(
      promptCustomization,
      language.promptDelta,
      `${locale} prompt customization must explain transcript-backed deltas`,
    );
    assertParagraphContainsAll(
      promptCustomization,
      [
        /`ctx\.getSystemPrompt\(\)`/,
        /`event\.systemPrompt`/,
        language.sameRenderedPrompt,
        language.earlierPromptHandlers,
      ],
      `${locale} current rendered prompt visibility`,
    );
    assertParagraphContainsAll(
      get("how-to/stream-output.md"),
      [
        /`ctx\.modelRegistry\.stream\(\)`/,
        /`streamSimple\(\)`/,
        language.resolvedAuth,
      ],
      `${locale} nested Extension streams`,
    );
    const apiReference = get("reference/api.md");
    assertContainsAll(
      apiReference,
      [
        /`cache_warming_decision`/,
        /`ctx\.modelRegistry\.stream\(\)`/,
        /`streamSimple\(\)`/,
        /`constrainedSampling: false`/,
      ],
      `${locale} operational API reference`,
    );
    const rpcSection = extractMarkdownSection(
      apiReference,
      locale === "en"
        ? "### RPC queue and cancellation"
        : "### Queue RPC và thao tác hủy",
      `${locale} RPC input boundary`,
    );
    const rpcInputPatterns = [
      language.directRpcCommands,
      language.rpcInputHandlers,
      language.rpcBeforeQueue,
      /`source`[^.\n]*`"rpc"`/i,
      /`steer`[^.\n]*`streamingBehavior`[^.\n]*`"steer"`/i,
      /`follow_up`[^.\n]*`streamingBehavior`[^.\n]*`"followUp"`/i,
    ];
    const rpcInputParagraph = assertParagraphContainsAll(
      rpcSection.body,
      rpcInputPatterns,
      `${locale} direct RPC input handlers`,
    );
    for (const [mutation, from, to] of [
      ["source", '`"rpc"`', '`"interactive"`'],
      ["steer mapping", '`"steer"`', '`"followUp"`'],
      ["follow-up mapping", '`"followUp"`', '`"steer"`'],
    ]) {
      const mutatedParagraph = rpcInputParagraph.replace(from, to);
      assert.notEqual(
        mutatedParagraph,
        rpcInputParagraph,
        `${locale} RPC fixture must expose ${mutation}`,
      );
      assert.throws(
        () =>
          assertParagraphContainsAll(
            rpcSection.body.replace(rpcInputParagraph, mutatedParagraph),
            rpcInputPatterns,
            `${locale} mutated direct RPC input handlers`,
          ),
        assert.AssertionError,
        `${locale} RPC input contract rejects broken ${mutation}`,
      );
    }
  }

  const snippets = [];
  for (const locale of ["en", "vi"]) {
    const source = localized.get(`${locale}/ch07-event-driven.md`);
    const match =
      /^```ts title="unsubscribe-extension-handler\.ts"\r?\n([\s\S]*?)\r?\n```/m.exec(
        source,
      );
    assert.ok(match, `${locale} unsubscribe example`);
    snippets.push(match[1]);
  }
  assert.equal(snippets[0], snippets[1], "unsubscribe example locale parity");
  assert.match(
    snippets[0],
    /const unsubscribe = pi\.on\("input", async \(event\) => \{\s+void event;\s+return \{ action: "continue" \};\s+\}\);\s+\s*unsubscribe\(\);/,
  );

  const promptSnippets = [];
  for (const locale of ["en", "vi"]) {
    const source = localized.get(`${locale}/how-to/customize-system-prompt.md`);
    const match = /^```ts title="team-roles\.ts"\r?\n([\s\S]*?)\r?\n```/m.exec(
      source,
    );
    assert.ok(match, `${locale} structured prompt example`);
    promptSnippets.push(match[1]);
  }
  assert.equal(
    promptSnippets[0],
    promptSnippets[1],
    "structured prompt example locale parity",
  );
  assert.match(
    promptSnippets[0],
    /event\.systemPromptOptions\.promptGuidelines\.push\(/,
  );

  const virtualSources = new Map(
    [
      ["extension-unsubscribe-example.ts", snippets[0]],
      ["structured-prompt-example.ts", promptSnippets[0]],
    ].map(([filename, source]) => [
      path.resolve(
        fileURLToPath(new URL(`tests/fixtures/${filename}`, repositoryRoot)),
      ),
      source,
    ]),
  );
  const options = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    types: ["node"],
  };
  const host = ts.createCompilerHost(options);
  const originalExists = host.fileExists.bind(host);
  const originalSourceFile = host.getSourceFile.bind(host);
  host.fileExists = (file) =>
    virtualSources.has(path.resolve(file)) || originalExists(file);
  host.getSourceFile = (file, languageVersion, ...args) => {
    const source = virtualSources.get(path.resolve(file));
    return source === undefined
      ? originalSourceFile(file, languageVersion, ...args)
      : ts.createSourceFile(file, source, languageVersion, true);
  };
  const program = ts.createProgram([...virtualSources.keys()], options, host);
  const diagnostics = ts.getPreEmitDiagnostics(program);
  assert.equal(
    diagnostics.length,
    0,
    ts.formatDiagnostics(diagnostics, {
      getCanonicalFileName: (file) => file,
      getCurrentDirectory: () => fileURLToPath(repositoryRoot),
      getNewLine: () => "\n",
    }),
  );
});

function assertMidRunCompactionLifecycle(source, locale, context) {
  const contract =
    locale === "en"
      ? {
          heading: "### Mid-run compaction checkpoints",
          ordered: [
            /Tool results?[^\n]*append/i,
            /threshold[^\n]*check|check[^\n]*threshold/i,
            /optional[^\n]*compaction|compact[^\n]*if[^\n]*threshold/i,
            /next assistant response/i,
          ],
          terminating: /terminating Tool batch/i,
          noQueue: /no (?:steering or follow-up|queued) message/i,
          skip: /skip[^.]*mid-run compaction|does not run[^.]*mid-run compaction/i,
          nextResponse: /no next assistant response/i,
          beforePrompt: /before (?:submitting|sending) a new prompt/i,
          afterRun: /after the low-level Agent run/i,
        }
      : {
          heading: "### Các điểm kiểm tra compaction giữa lượt chạy",
          ordered: [
            /Tool result[^\n]*(?:được )?(?:append|ghi thêm)/i,
            /kiểm tra[^\n]*ngưỡng|ngưỡng[^\n]*được kiểm tra/i,
            /compaction[^\n]*(?:tùy chọn|nếu[^\n]*vượt ngưỡng)/i,
            /phản hồi assistant kế tiếp/i,
          ],
          terminating: /Tool batch kết thúc/i,
          noQueue: /không có message[^.]*queue/i,
          skip: /bỏ qua[^.]*compaction giữa lượt chạy|không chạy[^.]*compaction giữa lượt chạy/i,
          nextResponse: /không có phản hồi assistant kế tiếp/i,
          beforePrompt: /trước khi (?:gửi|submit) prompt mới/i,
          afterRun: /sau khi low-level Agent run kết thúc/i,
        };
  const section = extractMarkdownSection(source, contract.heading, context);
  const orderedOffsets = contract.ordered.map((pattern) => {
    const match = pattern.exec(section.body);
    assert.ok(match, `${context} lifecycle must cover ${pattern}`);
    return match.index;
  });
  assert.deepEqual(
    [...orderedOffsets].sort((left, right) => left - right),
    orderedOffsets,
    `${context} must order append, threshold check, optional compaction, then the next assistant response`,
  );
  assertParagraphContainsAll(
    section.body,
    [
      contract.terminating,
      contract.noQueue,
      contract.skip,
      contract.nextResponse,
    ],
    `${context} terminating-batch skip`,
  );
  assertParagraphContainsAll(
    section.body,
    [/mid-run|giữa lượt chạy/i, contract.beforePrompt, contract.afterRun],
    `${context} three compaction check points`,
  );
  return section;
}

function assertReleasedSummarizationFailure(source, locale, context) {
  const contract =
    locale === "en"
      ? {
          heading: "### Reject incomplete summaries",
          incomplete: /incomplete/i,
          persistence: /not (?:append|persist|write)/i,
          history: /history summary/i,
          prefix: /turn-prefix summary/i,
          branch: /branch summary/i,
          cap: /4,096-token/i,
          oldCap: /2,048-token/i,
          reasoning: /reasoning/i,
        }
      : {
          heading: "### Từ chối summary chưa hoàn chỉnh",
          incomplete: /chưa hoàn chỉnh/i,
          persistence: /không (?:append|lưu|ghi)/i,
          history: /history summary/i,
          prefix: /turn-prefix summary/i,
          branch: /branch summary/i,
          cap: /4\.096 token/i,
          oldCap: /2\.048 token/i,
          reasoning: /reasoning/i,
        };
  const section = assertContainsAll(
    source,
    [
      /`getSummarizationFailure`/,
      /`stopReason: "length"`/,
      contract.incomplete,
      contract.history,
      contract.prefix,
      contract.branch,
      contract.cap,
      contract.oldCap,
      contract.reasoning,
    ],
    context,
    { heading: contract.heading },
  );
  assertParagraphContainsAll(
    section.body,
    [
      /`getSummarizationFailure`/,
      /`stopReason: "length"`/,
      contract.incomplete,
      contract.persistence,
    ],
    `${context} incomplete-summary persistence rule`,
  );
  return section;
}

function assertExtensionPromptLifecycle(source, context) {
  assert.match(
    source,
    /type UIPromptKind =\s*\n?\s*"select" \| "confirm" \| "input" \| "editor" \| "custom";/,
    `${context} must preserve the exact UIPromptKind union`,
  );
  for (const [name, discriminant] of [
    ["UIPromptStartEvent", "ui_prompt_start"],
    ["UIPromptEndEvent", "ui_prompt_end"],
  ]) {
    assert.match(
      source,
      new RegExp(
        `interface ${name} \\{[^}]*type: "${discriminant}";[^}]*reason: "ui_prompt";[^}]*kind: UIPromptKind;[^}]*title\\?: string;[^}]*\\}`,
      ),
      `${context} must preserve the exact ${name} payload`,
    );
  }
  assert.match(
    source,
    /\|[^|]*(?:Extension UI prompts|Prompt UI của Extension)[^|]*\|[^|]*`ui_prompt_start`[^|]*`ui_prompt_end`[^|]*\|/i,
    `${context} must include both prompt events in the Extension catalog`,
  );
  assertParagraphContainsAll(
    source,
    [
      /`ctx\.ui\.select\(\)`/,
      /`ctx\.ui\.confirm\(\)`/,
      /`ctx\.ui\.input\(\)`/,
      /`ctx\.ui\.editor\(\)`/,
      /`ctx\.ui\.custom\(\)`/,
      /`ui_prompt_start`/,
      /`ui_prompt_end`/,
      /waiting|chờ/i,
    ],
    `${context} prompt-method event relationship`,
  );
  assertParagraphContainsAll(
    source,
    [
      /best-effort/i,
      /not awaited|không được chờ/i,
      /nested|lồng nhau/i,
      /overlapping|chồng lấp/i,
      /coalesc|gộp/i,
      /outer[^.]*waiting span|khoảng chờ ngoài cùng/i,
    ],
    `${context} prompt delivery and coalescing relationship`,
  );
  assertParagraphContainsAll(
    source,
    [
      /schedul|xếp lịch/i,
      /around[^.]*outer[^.]*prompt span|quanh[^.]*khoảng prompt ngoài cùng/i,
      /not[^.]*ordering barrier|không phải[^.]*rào cản thứ tự/i,
      /observer[^.]*may run after[^.]*UI state transition|observer[^.]*có thể chạy sau[^.]*chuyển trạng thái UI/i,
    ],
    `${context} prompt notification timing`,
  );
  assert.doesNotMatch(
    source,
    /`ui_prompt_start`[^.]*before Pi starts waiting|`ui_prompt_end`[^.]*when Pi stops waiting|`ui_prompt_start`[^.]*trước khi Pi bắt đầu chờ|`ui_prompt_end`[^.]*khi Pi thôi chờ/i,
    `${context} must not present prompt notifications as ordering barriers`,
  );
}

function assertRpcQueueLifecycle(source, context) {
  assert.ok(
    source.includes('{ id?: string; type: "clear_queue" }'),
    `${context} must preserve the exact clear_queue request shape`,
  );
  assert.ok(
    source.includes(`{
  id?: string;
  type: "response";
  command: "clear_queue";
  success: true;
  data: { steering: string[]; followUp: string[] };
}`),
    `${context} must preserve the exact clear_queue response shape`,
  );
  assertParagraphContainsAll(
    source,
    [
      /`abort`/,
      /waits?[^.]*idle|chờ[^.]*idle/i,
      /queued|trong queue/i,
      /continue|tiếp tục/i,
      /`clear_queue`/,
      /manual compaction|compaction thủ công/i,
      /cancel|hủy/i,
    ],
    `${context} abort, queue, and manual-compaction relationship`,
  );
  assertParagraphContainsAll(
    source,
    [
      /interactive Escape|Escape tương tác/i,
      /`clear_queue`[^.]*before[^.]*`abort`|`clear_queue`[^.]*trước[^.]*`abort`/i,
      /steering/,
      /followUp/,
    ],
    `${context} interactive Escape ordering`,
  );
}

function assertThinkingLevelSessionPersistence(source, contract, context) {
  assertParagraphContainsAll(
    source,
    [
      /`pi\.setThinkingLevel\(\)`/,
      contract.effective,
      contract.differs,
      contract.records,
      contract.notEveryRequest,
      contract.persisted,
      contract.newSessionDefault,
    ],
    `${context} effective thinking-level persistence`,
  );
}

const liveCwdBuiltins = ["bash", "edit", "find", "grep", "ls", "read", "write"];

function assertLiveInvocationCwdBinding(source, context) {
  const paragraph = source
    .split(/\n\s*\n/)
    .find(
      (candidate) =>
        /`ctx\.cwd`/.test(candidate) &&
        /live|current|hiện tại/i.test(candidate) &&
        /invocation|execution|lời gọi|thực thi/i.test(candidate),
    );
  assert.ok(
    paragraph,
    `${context} must bind built-in path resolution to live invocation ctx.cwd in one paragraph`,
  );

  const namedBuiltins = [
    ...paragraph.matchAll(/`(bash|edit|find|grep|ls|powershell|read|write)`/g),
  ].map((match) => match[1]);
  assert.deepEqual(
    [...new Set(namedBuiltins)].sort(),
    liveCwdBuiltins,
    `${context} must bind exactly the affected built-in Tool set to ctx.cwd`,
  );
  assert.match(
    paragraph,
    /fallback|fall back|dự phòng/i,
    `${context} must explain the factory cwd fallback`,
  );
  assert.match(
    paragraph,
    /not[^.]*permanent|not[^.]*load-time|không[^.]*cố định|không[^.]*thời điểm load/i,
    `${context} must reject permanent load-time cwd capture`,
  );
}

function assertNoMisleadingWriteByteCount(source, context) {
  const suspectSegments = markdownSemanticSegments(source).filter(
    ({ text }) =>
      /\bwrite\b/i.test(text) && /UTF-16/i.test(text) && /byte/i.test(text),
  );
  for (const { text } of suspectSegments) {
    assert.match(
      text,
      /does not|no longer|remov(?:e|ed|es|ing)|không|đã bỏ/i,
      `${context} must not claim that write reports UTF-16 code units as bytes`,
    );
  }
}

const terminalCapabilityContracts = [
  {
    environment: "PI_HYPERLINKS",
    setting: "terminal.hyperlinks",
    enable: /`1`[^.]{0,80}(?:force-enables?|buộc bật)/i,
    disable: /`0`[^.]{0,80}(?:force-disables?|buộc tắt)/i,
  },
  {
    environment: "PI_IMAGE_PROTOCOL",
    setting: "terminal.images",
    enable:
      /`kitty`[^.]{0,80}(?:selects?|chọn)[^.]{0,80}Kitty[^.]{0,80}`iterm2`[^.]{0,80}(?:selects?|chọn)[^.]{0,80}iTerm2/i,
    disable: /`none`[^.]{0,80}(?:force-disables?|buộc tắt)/i,
  },
  {
    environment: "PI_TRUE_COLOR",
    setting: "terminal.trueColor",
    enable: /`1`[^.]{0,80}(?:force-enables?|buộc bật)/i,
    disable: /`0`[^.]{0,80}(?:force-disables?|buộc tắt)/i,
  },
];

function assertTerminalCapabilitySemantics(source, context) {
  for (const contract of terminalCapabilityContracts) {
    const settingPattern = new RegExp(
      `\\b${contract.setting.replace(".", "\\.")}\\b[^.]{0,160}(?:overrides?|takes precedence over|ghi đè|được ưu tiên hơn)[^.]{0,160}(?:${contract.environment}|environment|môi trường|detection|detect|phát hiện)`,
      "i",
    );
    assertParagraphContainsAll(
      source,
      [
        new RegExp(`\\b${contract.environment}\\b`),
        new RegExp(`\\b${contract.setting.replace(".", "\\.")}\\b`),
        contract.enable,
        contract.disable,
        /`auto`[^.]{0,120}(?:falls? back to|leaves?)[^.]{0,80}(?:automatic detection|auto-detection)|`auto`[^.]{0,120}(?:chuyển|để)[^.]{0,80}(?:tự động detect|tự động phát hiện|cơ chế detect)/i,
        settingPattern,
      ],
      `${context} ${contract.environment}/${contract.setting}`,
    );
  }
}

function assertFullscreenControlSemantics(source, context) {
  assertParagraphContainsAll(
    source,
    [
      /fullscreenCopyOnSelect[^.]{0,100}(?:defaults? to|mặc định là) `true`/i,
      /(?:disabled|`false`|tắt)/i,
      /Ctrl\+X/,
      /(?:eligible )?active selection|selection đang active đủ điều kiện/i,
      /attempts? to copy|thử copy/i,
      /returns?[^.]{0,100}(?:succeeds? or fails?|success or failure)|(?:kết thúc|dừng)[^.]{0,100}(?:thành công hay thất bại|thành công hoặc thất bại)/i,
      /falls? back[^.]{0,140}only when no (?:eligible )?active selection exists|chỉ fallback[^.]{0,140}không có selection đang active đủ điều kiện/i,
      /last assistant message|assistant message cuối/i,
    ],
    `${context} fullscreen selection-copy precedence`,
  );
  assertParagraphContainsAll(
    source,
    [
      /Jump to latest message/,
      /appears?[^.]{0,100}only while[^.]{0,100}(?:scrolled|above the latest)|chỉ xuất hiện[^.]{0,100}(?:scroll|ở phía trên message mới nhất)/i,
      /transcript/i,
    ],
    `${context} jump-to-latest visibility condition`,
  );
}

const supportedImageMimeTypes = [
  "image/bmp",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
];

function assertImageMimeDetectionSemantics(source, context) {
  const paragraph = assertParagraphContainsAll(
    source,
    [
      /detectSupportedImageMimeTypeFromFile/,
      /(?:reads?|inspects?)[^.]{0,120}at most[^.]{0,80}first[^.]{0,30}4[,.]100 bytes?|(?:đọc|kiểm tra)[^.]{0,120}tối đa[^.]{0,30}4[,.]100 byte[^.]{0,30}đầu/i,
      /returns? `null`[^.]{0,120}(?:unsupported|undetectable)|trả `null`[^.]{0,120}(?:không được hỗ trợ|không nhận diện được)/i,
      /detect(?:s|ion)?[^.]{0,160}(?:does not|not)[^.]{0,100}decode|phát hiện[^.]{0,160}không decode/i,
      /(?:does not|not)[^.]{0,100}(?:fully validate|validate every)|không[^.]{0,100}(?:xác thực đầy đủ|validate mọi)/i,
    ],
    `${context} file MIME detector behavior`,
  );
  const mimeTypes = [
    ...paragraph.matchAll(/`(image\/(?:bmp|gif|jpeg|png|webp))`/g),
  ]
    .map((match) => match[1])
    .sort();
  assert.deepEqual(
    [...new Set(mimeTypes)],
    supportedImageMimeTypes,
    `${context} must name exactly the published supported MIME set`,
  );
  assert.match(
    paragraph,
    /`image\/png`[^.]{0,100}(?:non-animated PNG|PNG không animation)|(?:non-animated PNG|PNG không animation)[^.]{0,100}`image\/png`/i,
    `${context} must restrict image/png detection to non-animated PNG`,
  );
  assert.doesNotMatch(
    paragraph,
    /returns? `undefined`|trả `undefined`/i,
    `${context} must use null, not undefined, for undetectable content`,
  );
}

function assertCustomToolLiveCwdGuidance(source, context) {
  assertLiveInvocationCwdBinding(source, context);
  assertParagraphContainsAll(
    source,
    [
      /`ctx\.cwd`/,
      /custom Tool/i,
      /authorization|permission|safe|cấp quyền|được phép|an toàn/i,
      /does not|still|không|vẫn/i,
    ],
    `${context} authorization warning`,
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

function hasReleasedTruncatedSummarySignature(segment) {
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

test("release fixture identifies published Pi 0.87.1 authority", async () => {
  const release = await readReleaseFixture();
  assert.equal(release.packageVersion, "0.87.1");
  assert.equal(release.tag, "v0.87.1");
  assert.equal(
    release.commit,
    "f07218c4d4bbc12bef056a7058c3dd49dfe41abe",
  );
  assert.equal(release.publishedAt, "2026-09-22T19:43:43Z");
  assert.equal(release.nodeRequirement, ">=22.19.0");
  assert.equal(release.previousDocumentationVersion, "0.85.0");
  assert.deepEqual(release.includedReleaseTags, [
    "v0.85.1",
    "v0.86.0",
    "v0.86.1",
    "v0.87.0",
    "v0.87.1",
  ]);
  assert.equal(release.sourceStatus, "published");
});

const rollupAccuracyContracts = {
  en: {
    capabilitiesHeading: "### New capabilities",
    reliabilityHeading: "### Reliability/provider fixes",
    claudeThinking:
      /supported Anthropic transports[^.]*preserve[^.]*per-turn[^.]*effort[^.]*recover[^.]*signed-thinking mismatches/i,
    midConvoRelationship: [
      /`supportsMidConvoEffort`/,
      /`AnthropicMessagesCompat`/,
      /defaults? to `false`/i,
      /exact supported Claude model/i,
      /faithful Anthropic Messages transport/i,
      /per-turn effort/i,
      /signed-thinking mismatch/i,
    ],
    vllmRelationship: [
      /`vllmPriority`/,
      /`OpenAICompletionsCompat`/,
      /vLLM priority scheduling/i,
      /not set in generated model metadata by default/i,
      /vLLM server priority defaults? to `0`/i,
    ],
    maxOutputRelationship: [
      /`supportsMaxOutputTokens`/,
      /`OpenAIResponsesCompat`/,
      /defaults? to `true`/i,
      /controls? whether/i,
      /Responses-compatible gateways/i,
      /`max_output_tokens`/,
    ],
    compatibilityFields:
      /Added model compatibility fields[^.]*`vllmPriority`[^.]*`supportsMaxOutputTokens`/i,
    latexAdded:
      /Added relational-algebra LaTeX[^.]*join-symbol rendering support/i,
    latexFixed:
      /fix(?:ed|es)?[^.]*relational-algebra LaTeX|relational-algebra LaTeX[^.]*fix/i,
    imageResilience:
      /resilient rendering[^.]*image-heavy output[^.]*V8 string-length-limit crash/i,
  },
  vi: {
    capabilitiesHeading: "### Khả năng mới",
    reliabilityHeading: "### Bản sửa lỗi độ tin cậy/provider",
    claudeThinking:
      /transport Anthropic được hỗ trợ[^.]*giữ[^.]*effort theo từng lượt[^.]*phục hồi[^.]*signed-thinking không khớp/i,
    midConvoRelationship: [
      /`supportsMidConvoEffort`/,
      /`AnthropicMessagesCompat`/,
      /mặc định(?: là)? `false`/i,
      /đúng model Claude được hỗ trợ/i,
      /transport[^.]*trung thực[^.]*Anthropic Messages/i,
      /effort theo từng lượt/i,
      /signed-thinking không khớp/i,
    ],
    vllmRelationship: [
      /`vllmPriority`/,
      /`OpenAICompletionsCompat`/,
      /lập lịch ưu tiên vLLM/i,
      /mặc định không được đặt trong model metadata được tạo/i,
      /priority mặc định của vLLM server là `0`/i,
    ],
    maxOutputRelationship: [
      /`supportsMaxOutputTokens`/,
      /`OpenAIResponsesCompat`/,
      /mặc định(?: là)? `true`/i,
      /kiểm soát/i,
      /gateway tương thích Responses/i,
      /`max_output_tokens`/,
    ],
    compatibilityFields:
      /Bổ sung các field tương thích model[^.]*`vllmPriority`[^.]*`supportsMaxOutputTokens`/i,
    latexAdded: /Bổ sung hỗ trợ render[^.]*join[^.]*LaTeX[^.]*đại số quan hệ/i,
    latexFixed: /sửa[^.]*LaTeX[^.]*đại số quan hệ/i,
    imageResilience:
      /render bền vững[^.]*output nhiều image[^.]*crash[^.]*giới hạn độ dài string của V8/i,
  },
};

function assertReleaseRollupAccuracy(entryBody, locale, context) {
  const contract = rollupAccuracyContracts[locale];
  const capabilities = assertContainsAll(
    entryBody,
    [
      contract.claudeThinking,
      contract.compatibilityFields,
      contract.latexAdded,
    ],
    `${context} exact additions`,
    { heading: contract.capabilitiesHeading },
  );
  assertParagraphContainsAll(
    capabilities.body,
    contract.midConvoRelationship,
    `${context} Claude effort compatibility boundary`,
  );
  assertParagraphContainsAll(
    capabilities.body,
    contract.vllmRelationship,
    `${context} vLLM priority compatibility owner`,
  );
  assertParagraphContainsAll(
    capabilities.body,
    contract.maxOutputRelationship,
    `${context} Responses output-token compatibility owner`,
  );
  assert.doesNotMatch(
    entryBody,
    contract.latexFixed,
    `${context} must not classify relational-algebra LaTeX support as a fix`,
  );

  assertContainsAll(
    entryBody,
    [contract.imageResilience],
    `${context} image-rendering resilience`,
    { heading: contract.reliabilityHeading },
  );
  assert.doesNotMatch(
    entryBody,
    /safe image rendering|render image an toàn/i,
    `${context} must not overclaim image-rendering safety`,
  );
}

const currentRollupHeadings = {
  en: {
    coverage: "### Release coverage",
    migrations: "### Breaking API migrations",
    capabilities: "### New capabilities",
    reliability: "### Reliability, provider, and CLI fixes",
    scope: "### Documentation and verification scope",
  },
  vi: {
    coverage: "### Phạm vi release",
    migrations: "### Các thay đổi API không tương thích",
    capabilities: "### Khả năng mới",
    reliability: "### Bản sửa lỗi về độ tin cậy, provider và CLI",
    scope: "### Phạm vi tài liệu và kiểm chứng",
  },
};

const currentRollupTopics = {
  coverage: [],
  migrations: [
    /`TranscriptContext`/,
    /`ToolCall\.arguments`/,
    /`user_bash`/,
    /`finishTurn`/,
    /`SessionManager`/,
    /`ContextEditEntry`/,
    /`TurnEndEvent`/,
  ],
  capabilities: [
    /GPT-6 Astra/,
    /cache warming/,
    /Meta Muse/,
    /`compaction\.modelOverrides`/,
    /`context_with_system`/,
    /Claude Opus 5\.5/,
  ],
  reliability: [
    /root-import/,
    /`0\.86\.x`/,
    /`0\.87\.0`/,
    /split-turn compaction/,
    /image-only/,
  ],
  scope: [
    /Pify/,
    /`scripts\/fixtures\/pi-release-0871\.json`/,
    /`@earendil-works\/pi-client`/,
  ],
};

function assertCurrentRollupAccuracy(entryBody, locale, context) {
  const headings = currentRollupHeadings[locale];
  const structures = Object.entries(currentRollupTopics).map(
    ([key, topics]) => {
      const section = extractMarkdownSection(entryBody, headings[key], context);
      const bullets = section.body
        .split(/(?=^- )/m)
        .filter((block) => block.startsWith("- "));
      assert.equal(
        bullets.length,
        topics.length,
        `${context} ${key} must preserve its bullet count`,
      );
      for (const [index, topic] of topics.entries()) {
        assert.match(
          bullets[index],
          topic,
          `${context} ${key} bullet ${index + 1} must cover ${topic}`,
        );
      }
      return {
        ...sectionStructure(section),
        bulletTopics: topics.map((topic) => topic.source),
      };
    },
  );
  const boundaries =
    locale === "en"
      ? {
          failClosed:
            /errors or invalid defined results stop the command before later handlers or local execution/i,
          finishTurn: /runs before `turn_end`[^\n]*decision applies afterward/i,
          canonical:
            /assigning `session\.agent\.state\.messages` no longer replaces future request history/i,
          edits: /raw history stays intact/i,
          transcript:
            /after `context`[^\n]*including system messages[^\n]*verbatim/i,
          experimental:
            /remain experimental[^\n]*no stable API or compatibility guarantee/i,
        }
      : {
          failClosed:
            /lỗi hoặc result khác `undefined` nhưng không hợp lệ dừng command trước khi gọi handler tiếp theo hoặc thực thi local/i,
          finishTurn:
            /chạy trước `turn_end`[^\n]*quyết định được áp dụng sau đó/i,
          canonical:
            /gán `session\.agent\.state\.messages` không còn thay thế history cho request tiếp theo/i,
          edits: /raw history được giữ nguyên/i,
          transcript: /sau `context`[^\n]*gồm system message[^\n]*nguyên vẹn/i,
          experimental:
            /vẫn ở trạng thái thử nghiệm[^\n]*không cam kết API ổn định hay compatibility/i,
        };
  const migrations = extractMarkdownSection(
    entryBody,
    headings.migrations,
    context,
  ).body;
  for (const patterns of [
    [
      /`TranscriptContext`/,
      /`context\.messages`/,
      /`getCurrentSystemPrompt\(\)`/,
      /`getCurrentTools\(\)`/,
    ],
    [
      /`ToolCall\.arguments`/,
      /`ToolResultMessage\.details`/,
      /JSON-compatible/,
      /`JsonValue`/,
      /readonly/,
    ],
    [
      /`user_bash`/,
      /fail-closed/,
      boundaries.failClosed,
      /`undefined`/,
      /`\{ operations \}`/,
      /`\{ result \}`/,
    ],
    [
      /`shouldStopAfterTurn`/,
      /`finishTurn`/,
      /`\{ action: "end" \}`/,
      boundaries.finishTurn,
      /error/,
      /aborted/,
      /`undefined`/,
    ],
    [
      /`SessionManager`/,
      boundaries.canonical,
      /`SessionManager\.inMemory\(\)`/,
      /`session\.navigateTree\(\)`/,
      /`session\.refreshContext\(\)`/,
    ],
    [
      /`ContextEditEntry`/,
      /`SessionEntry`/,
      /`context_edit`/,
      /`replacement: null`/,
      boundaries.edits,
    ],
  ]) {
    assertParagraphContainsAll(
      migrations,
      patterns,
      `${context} migration boundary`,
    );
  }
  const capabilities = extractMarkdownSection(
    entryBody,
    headings.capabilities,
    context,
  ).body;
  assertParagraphContainsAll(
    capabilities,
    [/`0\.85\.1`/, /GPT-6 Astra/, /OpenAI API/, /OpenAI Codex/],
    `${context} 0.85.1 model addition`,
  );
  assertParagraphContainsAll(
    capabilities,
    [/`context_with_system`/, boundaries.transcript],
    `${context} full transcript boundary`,
  );
  assertParagraphContainsAll(
    capabilities,
    [
      /Claude Opus 5\.5/,
      /Anthropic/,
      /GPT-6 Sol/,
      /GPT-6 Luna/,
      /OpenAI API/,
      /OpenAI Codex/,
      /GitHub Copilot/,
      /supported|được hỗ trợ/i,
    ],
    `${context} supported model routes`,
  );
  const reliability = extractMarkdownSection(
    entryBody,
    headings.reliability,
    context,
  ).body;
  assertParagraphContainsAll(
    reliability,
    [
      /`0\.85\.1`/,
      /`0\.85\.0`/,
      /root-import/,
      /workaround/i,
      /no longer needed|không còn cần/i,
      /source-only/,
      /`pi-test\.sh`/,
      /stdio RPC/,
    ],
    `${context} packaging fix and experimental boundary`,
  );
  assertParagraphContainsAll(
    reliability,
    [/`--mode`/, /missing or invalid|thiếu hoặc không hợp lệ/i, /nonzero/],
    `${context} CLI failure`,
  );
  const scope = extractMarkdownSection(entryBody, headings.scope, context).body;
  assertContainsAll(
    scope,
    [boundaries.experimental, /release series|đợt cập nhật/i],
    `${context} publication scope`,
  );
  assert.doesNotMatch(
    entryBody,
    /all providers support|mọi provider đều hỗ trợ|safe image rendering|render image an toàn/i,
    `${context} must not overclaim support or safety`,
  );
  return structures;
}

test("the first bilingual changelog entry is the structured Pi 0.87.1 documentation rollup", async () => {
  const references = await readLocalizedContent("changelog.md");
  const requiredReleaseTokens = [
    "TranscriptContext",
    "user_bash",
    "finishTurn",
    "ContextEditEntry",
    "context_with_system",
    "inputLimits.images.resize",
    "Claude Opus 5.5",
    "GPT-6 Sol",
    "GPT-6 Luna",
    "Grok 4.7",
  ];
  const sections = [
    {
      key: "coverage",
      patterns: [/Pify/, /`0\.85\.0`/, /Pi `0\.87\.1`/],
    },
    {
      key: "migrations",
      patterns: [
        /`TurnEndEvent`/,
        /`AgentBeforeSettleEvent`/,
        /`ExtensionEvent`/,
        /`emitBoundary\(\)`/,
      ],
    },
    {
      key: "capabilities",
      patterns: [
        /GPT-6 Astra/,
        /cache warming/,
        /`\/bug`/,
        /Radius/,
        /Meta Muse/,
        /`\/login meta`/,
        /`META_API_KEY`/,
        /`compaction\.modelOverrides`/,
        /`reserveTokens`/,
        /`keepRecentTokens`/,
        /`ctx\.modelRegistry\.stream\(\)`/,
        /`streamSimple\(\)`/,
        /`pi\.on\(\)`/,
        /unsubscribe/,
        /`inputLimits\.images\.resize`/,
        /`models\.json`/,
        /Grok 4\.7/,
        /xAI/,
      ],
    },
    {
      key: "reliability",
      patterns: [
        /split-turn compaction/,
        /Claude Fable 5\.1/,
        /image-only/,
        /empty text part/,
        /OpenAI-compatible/,
        /Anthropic OAuth/,
        /Claude Code version/,
      ],
    },
    {
      key: "scope",
      patterns: [
        /`@earendil-works\/pi-ai`/,
        /`@earendil-works\/pi-agent-core`/,
        /`@earendil-works\/pi-coding-agent`/,
        /`@earendil-works\/pi-server`/,
        /`@earendil-works\/pi-client`/,
        /`@earendil-works\/pi-protocol`/,
        /`0\.87\.1`/,
        /`scripts\/fixtures\/pi-release-0871\.json`/,
        /`tests\/fixtures\/pi-sdk-0871\.contract\.ts`/,
        /offline/,
        /`lint:sync`/,
        /`lint:frontmatter`/,
        /`lint:editorial`/,
        /`test:preservation`/,
      ],
    },
  ];
  const structures = [];
  for (const { locale, source } of references) {
    const context = `${locale} first changelog entry`;
    const headings = currentRollupHeadings[locale];
    assert.equal(
      source.match(/^## ([^\r\n]+)$/m)?.[1],
      "2026-09-23",
      `${context} must be dated 2026-09-23`,
    );
    assert.match(source, /last_updated: '2026-09-23'/);
    const entry = extractMarkdownSection(source, "## 2026-09-23", context);
    for (const tag of ["v0.85.1", "v0.86.0", "v0.86.1", "v0.87.0", "v0.87.1"]) {
      assert.ok(
        entry.body.includes(
          `https://github.com/earendil-works/pi/releases/tag/${tag}`,
        ),
        `${context} must link ${tag}`,
      );
    }
    for (const token of requiredReleaseTokens) {
      assert.ok(entry.body.includes(token), `${context} must cover ${token}`);
    }
    assert.deepEqual(
      [...entry.body.matchAll(/^### [^\r\n]+$/gm)].map((match) => match[0]),
      sections.map(({ key }) => headings[key]),
    );
    for (const { key, patterns } of sections) {
      assertContainsAll(entry.body, patterns, context, {
        heading: headings[key],
      });
    }
    structures.push(assertCurrentRollupAccuracy(entry.body, locale, context));
  }
  assert.deepEqual(structures[0], structures[1]);
});

test("first bilingual changelog accuracy guard rejects migration and scope regressions", async () => {
  const [{ source }] = await readLocalizedContent("changelog.md");
  const entry = extractMarkdownSection(
    source,
    "## 2026-09-23",
    "EN current rollup mutation baseline",
  );
  assertCurrentRollupAccuracy(
    entry.body,
    "en",
    "EN current rollup mutation baseline",
  );
  const mutations = [
    ["`TranscriptContext`", "`Context`"],
    [
      "errors or invalid defined results stop the command before later handlers or local execution",
      "errors allow later handlers or local execution",
    ],
    ["decision applies afterward", "decision applies beforehand"],
    [
      "assigning `session.agent.state.messages` no longer replaces future request history",
      "assigning `session.agent.state.messages` replaces future request history",
    ],
    ["raw history stays intact", "raw history is rewritten"],
    ["verbatim", "after rebuilding it"],
    ["no longer needed", "still required"],
    [
      "no stable API or compatibility guarantee",
      "a stable API and compatibility guarantee",
    ],
  ];
  for (const [pattern, replacement] of mutations) {
    assert.ok(entry.body.includes(pattern), `${pattern} mutation must apply`);
    assert.throws(
      () =>
        assertCurrentRollupAccuracy(
          entry.body.replace(pattern, replacement),
          "en",
          pattern,
        ),
      { name: "AssertionError" },
    );
  }
});

test("first bilingual changelog guard rejects deleted or reordered reliability topics", async () => {
  for (const { locale, source } of await readLocalizedContent("changelog.md")) {
    const context = `${locale} rollup topic mutations`;
    const entry = extractMarkdownSection(source, "## 2026-09-23", context);
    assertCurrentRollupAccuracy(entry.body, locale, context);
    const reliability = extractMarkdownSection(
      entry.body,
      currentRollupHeadings[locale].reliability,
      context,
    );
    const bullets = reliability.body
      .split(/(?=^- )/m)
      .map((bullet) => bullet.trim());
    for (let index = 0; index < bullets.length; index += 1) {
      const deleted = bullets.filter((_, candidate) => candidate !== index);
      assert.throws(
        () =>
          assertCurrentRollupAccuracy(
            entry.body.replace(reliability.body, deleted.join("\n")),
            locale,
            `${context} deleted bullet ${index + 1}`,
          ),
        { name: "AssertionError" },
      );
      if (index + 1 < bullets.length) {
        const reordered = [...bullets];
        [reordered[index], reordered[index + 1]] = [
          reordered[index + 1],
          reordered[index],
        ];
        assert.throws(
          () =>
            assertCurrentRollupAccuracy(
              entry.body.replace(reliability.body, reordered.join("\n")),
              locale,
              `${context} reordered bullet ${index + 1}`,
            ),
          { name: "AssertionError" },
        );
      }
    }
  }
});

// This short denylist catches known contract overclaims, not arbitrary prose.
// Editorial review is authoritative for unrestricted natural-language contradictions.
const knownRollupOverclaimFragments = {
  en: [
    "chapters, guides, references, and source-review records are already migrated",
  ],
  vi: ["chương, hướng dẫn, trang tham khảo cùng hồ sơ nguồn đã cập nhật xong"],
};

function assertRollupPublicationScope(entryBody, locale, context) {
  const scope = extractMarkdownSection(
    entryBody,
    currentRollupHeadings[locale].scope,
    context,
  ).body.replace(/\n(?=- )/g, "\n\n");
  const anchors =
    locale === "en"
      ? {
          published: [
            /\b(?:publish(?:es|ed)?|records?|pins?|establish(?:es)?)\b/i,
            /\b(?:authority|source|revision|commit)\b/i,
            /\b(?:rollup|summary)\b/i,
            /\breleases?\b/i,
          ],
          deferred: [
            /\bchapters?\b/i,
            /How-to|\bguides?\b/i,
            /\breferences?\b/i,
            /\bsource\b/i,
            /migrat|updat/i,
            /\b(?:scheduled|planned|deferred|pending|will)\b/i,
            /\b(?:later|remaining|subsequent|future|follow-up)\b/i,
          ],
        }
      : {
          published: [
            /công bố|xuất bản|ghi nhận|ghim|xác định/i,
            /nguồn|commit|revision/i,
            /tóm tắt|tổng hợp|rollup/i,
            /release/i,
          ],
          deferred: [
            /chương|chapter/i,
            /hướng dẫn|How-to|guide/i,
            /tham khảo|reference/i,
            /source|nguồn/i,
            /cập nhật|migration/i,
            /dự kiến|sẽ|để lại|chờ/i,
            /còn lại|tiếp theo|sau/i,
          ],
        };
  assertParagraphContainsAll(
    scope,
    [/\bPi(?:fy)?\b/i, /\b0\.87\.1\b/, /baseline/i, ...anchors.published],
    `${context} current baseline authority and rollup`,
  );
  assertParagraphContainsAll(
    scope,
    [/\bcommits?\b/i, ...anchors.deferred],
    `${context} detailed migrations deferred to later commits`,
  );
  for (const fragment of knownRollupOverclaimFragments[locale]) {
    assert.equal(
      scope.toLowerCase().includes(fragment),
      false,
      `${context} must not repeat known overclaim: ${fragment}`,
    );
  }
}

test("first bilingual changelog distinguishes publication scope and includes GPT-6 Astra", async () => {
  for (const { locale, source } of await readLocalizedContent("changelog.md")) {
    const context = `${locale} rollup publication scope`;
    const entry = extractMarkdownSection(source, "## 2026-09-23", context);
    assertParagraphContainsAll(
      entry.body,
      [/`0\.85\.1`/, /GPT-6 Astra/, /OpenAI API/, /OpenAI Codex/],
      `${context} 0.85.1 model addition`,
    );
    assertRollupPublicationScope(entry.body, locale, context);
  }
});

test("first bilingual changelog publication guard allows rewrites and rejects known overclaim fragments", async () => {
  const rewrites = {
    en: {
      published:
        "Pify now records the source authority for baseline 0.87.1 and a summary of the releases.",
      deferred:
        "Later commits will migrate the chapters, guides, references, and source-review records.",
      knownOverclaim:
        "The chapters, guides, references, and source-review records are already migrated.",
    },
    vi: {
      published:
        "Pify công bố nguồn xác thực cho baseline 0.87.1 và bản tổng hợp release.",
      deferred:
        "Các chương, hướng dẫn, trang tham khảo cùng hồ sơ nguồn sẽ được cập nhật trong những commit tiếp theo.",
      knownOverclaim:
        "Các chương, hướng dẫn, trang tham khảo cùng hồ sơ nguồn đã cập nhật xong.",
    },
  };
  for (const { locale, source } of await readLocalizedContent("changelog.md")) {
    const context = `${locale} publication guard editorial variants`;
    const entry = extractMarkdownSection(source, "## 2026-09-23", context);
    const scope = extractMarkdownSection(
      entry.body,
      currentRollupHeadings[locale].scope,
      context,
    );
    const firstBullet = scope.body.split(/\n(?=- )/)[0];
    const { published, deferred, knownOverclaim } = rewrites[locale];
    const rewrite = entry.body.replace(
      firstBullet,
      `- ${published} ${deferred}`,
    );
    assert.doesNotThrow(() =>
      assertRollupPublicationScope(rewrite, locale, context),
    );
    assert.throws(
      () =>
        assertRollupPublicationScope(
          rewrite.replace(deferred, `${deferred} ${knownOverclaim}`),
          locale,
          context,
        ),
      { name: "AssertionError" },
    );
    assert.doesNotThrow(() =>
      assertRollupPublicationScope(
        `${knownOverclaim}\n\n${rewrite}`,
        locale,
        context,
      ),
    );
    const wrongSection = `${published} ${deferred}\n\n${entry.body.replace(firstBullet, "")}`;
    assert.throws(
      () => assertRollupPublicationScope(wrongSection, locale, context),
      { name: "AssertionError" },
    );
  }
});

test("first bilingual changelog scope checks leave unrestricted wording to editorial review", async () => {
  const editorialExamples = {
    en: "The chapters are fully migrated and the guides are not yet migrated",
    vi: "Các chương dự kiến hoàn tất migration trong các commit tiếp theo",
  };
  for (const { locale, source } of await readLocalizedContent("changelog.md")) {
    const context = `${locale} editorial review boundary`;
    const entry = extractMarkdownSection(source, "## 2026-09-23", context);
    const scope = extractMarkdownSection(
      entry.body,
      currentRollupHeadings[locale].scope,
      context,
    );
    assert.doesNotThrow(() =>
      assertRollupPublicationScope(
        entry.body.replace(
          scope.body,
          `${scope.body}\n\n${editorialExamples[locale]}`,
        ),
        locale,
        context,
      ),
    );
  }
});

test("the historical bilingual changelog preserves the structured Pi 0.85.0 documentation rollup", async () => {
  const references = await readLocalizedContent("changelog.md");
  const release0850 =
    "https://github.com/earendil-works/pi/releases/tag/v0.85.0";
  const release0844 =
    "https://github.com/earendil-works/pi/releases/tag/v0.84.4";
  const contracts = {
    en: {
      headings: [
        "### New capabilities",
        "### Behavior and interface changes",
        "### Reliability/provider fixes",
        "### Documentation and verification scope",
      ],
      externalSession: /external session (?:restoration|restore)/i,
      promptRpc: /prompt[^.]*RPC|RPC[^.]*prompt/i,
      terminalFullscreen: /terminal[^.]*fullscreen|fullscreen[^.]*terminal/i,
      bashOnlySkills: /Bash-only Skills/i,
      architecture: /experimental service architecture/i,
      providerFixes: [
        /incompatible event sequences[^.]*custom Tool-call deltas/i,
        /Codex SSE[^.]*terminal events[^.]*blank line/i,
        /fragmented Mistral tool calls[^.]*tool-call ID/i,
        /OpenAI reasoning[^.]*merge[^.]*text[^.]*summary/i,
        /Grok[^.]*remov/i,
        /Qwen[^.]*Qwen3\.8 Flash/i,
        /Fable[^.]*reasoning/i,
        /Baseten[^.]*image input/i,
        /Fireworks[^.]*API adapter/i,
        /Vertex[^.]*proxy/i,
        /Cloudflare[^.]*catalog/i,
        /OpenRouter[^.]*reasoning[^.]*`none`/i,
      ],
      integrity:
        /JSONL[^.]*share[^.]*import[^.]*fork[^.]*compaction[^.]*manual abort/i,
      network: /NO_PROXY[^.]*proxy HTTP[^.]*seccomp[^.]*EXIF/i,
      experimentalBoundary: /experimental[^.]*not[^.]*stable/i,
      documentation: /documentation/i,
    },
    vi: {
      headings: [
        "### Khả năng mới",
        "### Thay đổi hành vi và interface",
        "### Bản sửa lỗi độ tin cậy/provider",
        "### Phạm vi tài liệu và kiểm chứng",
      ],
      externalSession: /khôi phục external session/i,
      promptRpc: /prompt[^.]*RPC|RPC[^.]*prompt/i,
      terminalFullscreen: /terminal[^.]*fullscreen|fullscreen[^.]*terminal/i,
      bashOnlySkills: /Skills[^.]*chỉ bật Bash/i,
      architecture: /kiến trúc service thử nghiệm/i,
      providerFixes: [
        /event sequence không tương thích[^.]*custom Tool-call delta/i,
        /Codex SSE[^.]*terminal event[^.]*blank line/i,
        /Mistral[^.]*tool call phân mảnh[^.]*tool-call ID/i,
        /OpenAI reasoning[^.]*gộp[^.]*text[^.]*summary/i,
        /Grok[^.]*loại bỏ/i,
        /Qwen[^.]*Qwen3\.8 Flash/i,
        /Fable[^.]*reasoning/i,
        /Baseten[^.]*image input/i,
        /Fireworks[^.]*API adapter/i,
        /Vertex[^.]*proxy/i,
        /Cloudflare[^.]*catalog/i,
        /OpenRouter[^.]*reasoning[^.]*`none`/i,
      ],
      integrity:
        /JSONL[^.]*share[^.]*import[^.]*fork[^.]*compaction[^.]*manual abort/i,
      network: /NO_PROXY[^.]*proxy HTTP[^.]*seccomp[^.]*EXIF/i,
      experimentalBoundary: /thử nghiệm[^.]*không[^.]*ổn định/i,
      documentation: /tài liệu/i,
    },
  };
  const structures = [];

  for (const { locale, source } of references) {
    const context = `${locale} historical 0.85.0 changelog entry`;
    const entry = extractMarkdownSection(source, "## 2026-09-04", context);
    const contract = contracts[locale];

    assert.match(entry.body, /Pi `0\.85\.0`/);
    assert.ok(entry.body.includes(release0850));
    assert.match(entry.body, /(?:intervening|trung gian)[^\r\n]*`0\.84\.4`/i);
    assert.ok(entry.body.includes(release0844));

    const actualHeadings = [...entry.body.matchAll(/^### ([^\r\n]+)$/gm)].map(
      (match) => `### ${match[1]}`,
    );
    assert.deepEqual(actualHeadings, contract.headings);

    const capabilities = assertContainsAll(
      entry.body,
      [
        /`SessionManager\.inMemory\(\)`/,
        contract.externalSession,
        /`supportsMidConvoEffort`/,
        /`@earendil-works\/pi-client`/,
        /`@earendil-works\/pi-protocol`/,
        /`@earendil-works\/pi-server`/,
        contract.architecture,
      ],
      `${context} new capabilities`,
      { heading: contract.headings[0] },
    );
    const interfaces = assertContainsAll(
      entry.body,
      [
        /`ui_prompt_start`/,
        /`clear_queue`/,
        /`ctx\.cwd`/,
        /`PI_HYPERLINKS`/,
        contract.promptRpc,
        contract.terminalFullscreen,
        contract.bashOnlySkills,
      ],
      `${context} behavior and interfaces`,
      { heading: contract.headings[1] },
    );
    const reliability = assertContainsAll(
      entry.body,
      [
        /managed `fd`\/`rg`[^.]*musl[^.]*API/i,
        /`@earendil-works\/pi-coding-agent\/client`[^.]*compatibility entry point/i,
        ...contract.providerFixes,
        contract.integrity,
        contract.network,
      ],
      `${context} reliability and providers`,
      { heading: contract.headings[2] },
    );
    const scope = assertContainsAll(
      entry.body,
      [
        /Pify/i,
        contract.documentation,
        /verification|kiểm chứng/i,
        contract.experimentalBoundary,
      ],
      `${context} documentation scope`,
      { heading: contract.headings[3] },
    );
    assertReleaseRollupAccuracy(entry.body, locale, context);
    structures.push(
      [capabilities, interfaces, reliability, scope].map(sectionStructure),
    );
  }

  assert.deepEqual(structures[0], structures[1]);
});

test("historical rollup accuracy guard rejects attribution and resilience regressions", async () => {
  const [{ source }] = await readLocalizedContent("changelog.md");
  const entry = extractMarkdownSection(
    source,
    "## 2026-09-04",
    "EN changelog mutation baseline",
  );
  assertReleaseRollupAccuracy(
    entry.body,
    "en",
    "EN changelog mutation baseline",
  );

  const mutations = [
    {
      label: "compatibility fields presented as pre-existing documentation",
      pattern: "Added model compatibility fields",
      replacement: "Documented model compatibility fields",
    },
    {
      label: "vLLM priority owner blurred",
      pattern: "`vllmPriority` belongs to `OpenAICompletionsCompat`",
      replacement:
        "`vllmPriority` belongs to an OpenAI compatibility interface",
    },
    {
      label: "Responses output-token owner blurred",
      pattern: "`supportsMaxOutputTokens` belongs to `OpenAIResponsesCompat`",
      replacement:
        "`supportsMaxOutputTokens` belongs to an OpenAI compatibility interface",
    },
    {
      label: "vLLM metadata default blurred",
      pattern: "is not set in generated model metadata by default",
      replacement: "defaults to priority `0` in generated model metadata",
    },
    {
      label: "Responses output-token default inverted",
      pattern: "defaults to `true`",
      replacement: "defaults to `false`",
    },
    {
      label: "Claude model and transport boundary blurred",
      pattern:
        "an exact supported Claude model on a faithful Anthropic Messages transport",
      replacement: "an Anthropic transport",
    },
    {
      label: "Claude effort flag default inverted",
      pattern: "defaults to `false`",
      replacement: "defaults to `true`",
    },
    {
      label: "relational-algebra LaTeX presented as a fix",
      pattern: "Added relational-algebra LaTeX join-symbol rendering support",
      replacement: "Fixed relational-algebra LaTeX join-symbol rendering",
    },
    {
      label: "image resilience presented as a safety guarantee",
      pattern:
        "resilient rendering of image-heavy output avoids the V8 string-length-limit crash",
      replacement: "safe image rendering for large output",
    },
  ];

  for (const { label, pattern, replacement } of mutations) {
    assert.ok(entry.body.includes(pattern), `${label} mutation must apply`);
    const mutated = entry.body.replace(pattern, replacement);
    assert.throws(() => assertReleaseRollupAccuracy(mutated, "en", label), {
      name: "AssertionError",
    });
  }
});

test("both Chapter 2 locales document the Pi 0.85.0 experimental service architecture", async () => {
  const [chapters, references] = await Promise.all([
    readLocalizedContent("ch02-three-layer-arch.md"),
    readLocalizedContent("reference/api.md"),
  ]);
  const referencesByLocale = new Map(
    references.map(({ locale, source }) => [locale, source]),
  );
  const localeContract = {
    en: {
      chapterHeading: "### 2.5 pi-server: an experimental service boundary",
      dependencyHeading: "## 4. Open package.json, things are not so simple",
      client: [
        /`Client`/,
        /transport-neutral/i,
        /`createClientServiceTransport\(\)`/,
        /Chord transport/,
        /does not build typed service proxies/,
      ],
      protocol: [
        /`PROTOCOL_VERSION`/,
        /strict routed envelopes/,
        /CBOR/,
        /\{ serverId \}/,
        /\{ serverId, sessionId, attachmentId \}/,
        /opaque payloads/,
        /strict JSON/,
      ],
      chord: [
        /Chord owns/,
        /control parsing/,
        /bindings/,
        /subscriptions/,
        /replicated state/,
        /`pi-protocol`/,
        /opaque strict JSON/,
      ],
      server: [
        /server-scoped services/,
        /Session-scoped services/,
        /`RoutedServerServiceHost`/,
        /`RoutedSessionHandle`/,
        /presentation attachment/,
      ],
      local: [
        /actual `Session`/,
        /Agent Harness/,
        /process-local/,
        /neither JavaScript object crosses/,
      ],
      disconnect: [
        /disconnect/i,
        /disposal/i,
        /pending work locally/,
        /clears the live attachment route/,
        /accepted may still finish remotely/,
        /no automatic reconnect/,
        /no request replay/,
      ],
      warning: [
        /^> \*\*Experimental boundary:\*\*/m,
        /experimental/i,
        /no compatibility guarantee/i,
      ],
      apiHeading: "## Experimental routed-service packages",
      apiClientHeading: "### `@earendil-works/pi-client`",
      apiProtocolHeading: "### `@earendil-works/pi-protocol`",
      apiServerHeading: "### `@earendil-works/pi-server`",
      apiClientExports: [
        /root exports/i,
        /`Client`/,
        /`createClientServiceTransport`/,
        /`ByteTransportFactory`/,
        /`ClientOptions`/,
        /`ServiceSubscription`/,
      ],
      apiClientBoundary: [
        /transport-neutral/i,
        /`RpcTarget`/,
        /Chord's `RemoteServiceTransport`/,
        /does not manufacture typed services/,
      ],
      apiDisconnect: [
        /disconnect/i,
        /disposal/i,
        /pending requests reject locally/,
        /live attachment is cleared/,
        /does not reconnect or replay requests automatically/,
        /accepted work may finish remotely/,
      ],
      apiProtocolBoundary: [
        /CBOR/,
        /strict envelopes/,
        /opaque strict-JSON values/,
        /Chord owns/,
        /service-control parsing/,
        /replicated-state semantics/,
      ],
      apiServerExports: [
        /root exports/i,
        /`Server`/,
        /`ServerHost`/,
        /`RoutedServerServiceHost`/,
        /`RoutedSessionHandle`/,
      ],
      apiServerBoundary: [
        /server-scoped/,
        /Session services/,
        /does not.*open `Session` or Agent Harness over the wire/,
        /\{ serverId \}/,
        /\{ serverId, sessionId, attachmentId \}/,
        /application responsibilities/,
        /does not present an end-to-end launch recipe as stable/,
      ],
      apiWarning: [/experimental/i, /no compatibility guarantee/i],
    },
    vi: {
      chapterHeading: "### 2.5 pi-server: một service boundary thử nghiệm",
      dependencyHeading:
        "## 4. Mở package.json ra, mọi thứ không đơn giản như vậy",
      client: [
        /`Client` trung lập với transport/,
        /`createClientServiceTransport\(\)`/,
        /Chord transport/,
        /không dựng typed service proxy/,
      ],
      protocol: [
        /`PROTOCOL_VERSION`/,
        /routed envelope nghiêm ngặt/,
        /CBOR/,
        /\{ serverId \}/,
        /\{ serverId, sessionId, attachmentId \}/,
        /opaque payload/,
        /strict JSON/,
      ],
      chord: [
        /Chord sở hữu/,
        /control parsing/,
        /binding/,
        /subscription/,
        /replicated state/,
        /`pi-protocol`/,
        /strict JSON opaque/,
      ],
      server: [
        /service phạm vi server/,
        /service phạm vi Session/,
        /`RoutedServerServiceHost`/,
        /`RoutedSessionHandle`/,
        /presentation attachment/,
      ],
      local: [
        /`Session` thật/,
        /Agent Harness/,
        /trong process/,
        /không JavaScript object nào đi qua protocol boundary/,
      ],
      disconnect: [
        /Disconnect/,
        /dispose/,
        /pending work reject ở phía local/,
        /xóa live attachment route/,
        /đã được chấp nhận.*hoàn tất ở remote/,
        /Không có automatic reconnect/,
        /request replay/,
      ],
      warning: [
        /^> \*\*Boundary thử nghiệm:\*\*/m,
        /thử nghiệm/i,
        /không bảo đảm tương thích/i,
      ],
      apiHeading: "## Các package routed-service thử nghiệm",
      apiClientHeading: "### `@earendil-works/pi-client`",
      apiProtocolHeading: "### `@earendil-works/pi-protocol`",
      apiServerHeading: "### `@earendil-works/pi-server`",
      apiClientExports: [
        /Root export/,
        /`Client`/,
        /`createClientServiceTransport`/,
        /`ByteTransportFactory`/,
        /`ClientOptions`/,
        /`ServiceSubscription`/,
      ],
      apiClientBoundary: [
        /`Client` trung lập với transport/,
        /`RpcTarget`/,
        /`RemoteServiceTransport` của Chord/,
        /không tự dựng typed service/,
      ],
      apiDisconnect: [
        /mất kết nối/,
        /dispose/,
        /pending request reject ở local/,
        /live attachment bị xóa/,
        /không tự reconnect hoặc replay request/,
        /đã được chấp nhận.*hoàn tất ở remote/,
      ],
      apiProtocolBoundary: [
        /CBOR/,
        /envelope nghiêm ngặt/,
        /strict JSON opaque/,
        /Chord sở hữu/,
        /control parsing/,
        /ngữ nghĩa replicated state/,
      ],
      apiServerExports: [
        /Root export/,
        /`Server`/,
        /`ServerHost`/,
        /`RoutedServerServiceHost`/,
        /`RoutedSessionHandle`/,
      ],
      apiServerBoundary: [
        /service phạm vi server/,
        /service phạm vi Session attachment/,
        /không.*`Session`.*Agent Harness qua wire/,
        /\{ serverId \}/,
        /\{ serverId, sessionId, attachmentId \}/,
        /Ứng dụng có trách nhiệm/,
        /không trình bày.*recipe end-to-end.*ổn định/,
      ],
      apiWarning: [/thử nghiệm/i, /không bảo đảm tương thích/i],
    },
  };
  const structures = [];

  for (const { locale, source } of chapters) {
    const contract = localeContract[locale];
    const section = extractMarkdownSection(
      source,
      contract.chapterHeading,
      `${locale} Chapter 2 experimental service architecture`,
    );

    for (const term of requiredArchitectureTerms) {
      assert.ok(
        section.body.includes(term),
        `${locale} Chapter 2 experimental service architecture must name ${term}`,
      );
    }
    for (const [claim, patterns] of [
      ["transport-neutral client boundary", contract.client],
      ["routed protocol boundary", contract.protocol],
      ["Chord semantic ownership", contract.chord],
      ["routed server boundary", contract.server],
      ["process-local Session and Harness", contract.local],
      ["disconnect and replay semantics", contract.disconnect],
    ]) {
      assertParagraphContainsAll(
        section.body,
        patterns,
        `${locale} Chapter 2 ${claim}`,
      );
    }
    assert.doesNotMatch(
      source,
      /\b(?:PiClient|PiServerService)\b/,
      `${locale} Chapter 2 must not present obsolete client or server identifiers`,
    );
    assertParagraphContainsAll(
      section.body,
      contract.warning,
      `${locale} Chapter 2 experimental compatibility warning`,
    );

    const dependencySection = extractMarkdownSection(
      source,
      contract.dependencyHeading,
      `${locale} Chapter 2 dependency graph`,
    );
    assert.match(
      dependencySection.body,
      /@earendil-works\/pi-client\s+─+→ @earendil-works\/pi-coding-agent/,
      `${locale} Chapter 2 dependency graph must show the direct pi-client to pi-coding-agent edge`,
    );
    assert.match(
      dependencySection.body,
      /@earendil-works\/pi-protocol\s+─+→ @earendil-works\/pi-coding-agent/,
      `${locale} Chapter 2 dependency graph must show the direct pi-protocol to pi-coding-agent edge`,
    );

    const referenceSource = referencesByLocale.get(locale);
    assert.ok(referenceSource, `${locale} API reference must be available`);
    const apiSection = extractMarkdownSection(
      referenceSource,
      contract.apiHeading,
      `${locale} API experimental service packages`,
    );
    const apiClient = extractMarkdownSection(
      referenceSource,
      contract.apiClientHeading,
      `${locale} API client exports`,
    );
    const apiProtocol = extractMarkdownSection(
      referenceSource,
      contract.apiProtocolHeading,
      `${locale} API protocol exports`,
    );
    const apiServer = extractMarkdownSection(
      referenceSource,
      contract.apiServerHeading,
      `${locale} API server exports`,
    );
    assertParagraphContainsAll(
      apiClient.body,
      contract.apiClientExports,
      `${locale} API current client exports`,
    );
    assertParagraphContainsAll(
      apiClient.body,
      contract.apiClientBoundary,
      `${locale} API client service boundary`,
    );
    assertParagraphContainsAll(
      apiClient.body,
      contract.apiDisconnect,
      `${locale} API disconnect and replay semantics`,
    );
    assertParagraphContainsAll(
      apiProtocol.body,
      contract.apiProtocolBoundary,
      `${locale} API protocol and Chord ownership`,
    );
    assertParagraphContainsAll(
      apiServer.body,
      contract.apiServerExports,
      `${locale} API current server exports`,
    );
    assertParagraphContainsAll(
      apiServer.body,
      contract.apiServerBoundary,
      `${locale} API routed server boundary`,
    );
    assertParagraphContainsAll(
      apiSection.body,
      contract.apiWarning,
      `${locale} API experimental compatibility warning`,
    );

    structures.push({
      chapter: sectionStructure(section),
      dependency: sectionStructure(dependencySection),
      api: sectionStructure(apiSection),
    });
  }

  assert.deepEqual(structures[0], structures[1]);
});

test("Pi direct dependencies are exactly pinned to the published release", async () => {
  const release = await readReleaseFixture();
  const packageJSON = JSON.parse(
    await readFile(new URL("package.json", repositoryRoot), "utf8"),
  );

  for (const packageName of releaseContractPackages) {
    assert.equal(
      packageJSON.devDependencies[packageName],
      release.packageVersion,
    );
  }
});

test("Pi 0.87.1 compile fixture typechecks against the installed public declarations", () => {
  const fixturePath = fileURLToPath(
    new URL("tests/fixtures/pi-sdk-0871.contract.ts", repositoryRoot),
  );
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
});

for (const functionName of [chapter11ExampleFunction, deterministicGuideFunction]) {
  test(`Pi 0.87.1 compile fixture executes ${functionName} offline`, async () => {
    const [compileFixture, ai, agentCore] = await Promise.all([
      readFile(
        new URL("tests/fixtures/pi-sdk-0871.contract.ts", repositoryRoot),
        "utf8",
      ),
      import("@earendil-works/pi-ai"),
      import("@earendil-works/pi-agent-core"),
    ]);
    const modules = {
      "node:assert/strict": { default: assert },
      "@earendil-works/pi-ai": ai,
      "@earendil-works/pi-agent-core": agentCore,
    };
    const { requiredImports } = parsedExampleContract(
      compileFixture,
      "Pi 0.87.1 compile fixture",
      functionName,
    );
    const bindings = Object.fromEntries(
      requiredImports
        .filter((binding) => !binding.typeOnly)
        .map((binding) => {
          const value = modules[binding.module]?.[binding.imported];
          assert.notEqual(
            value,
            undefined,
            `missing public binding ${binding.local}`,
          );
          return [binding.local, value];
        }),
    );
    const fixture = await importCompileFixtureFunctions(
      compileFixture,
      [functionName],
      bindings,
    );
    await fixture[functionName]();
  });
}

test("Chapter 11 compile fixture aborts and drains a stalled Agent before removing its provider", async () => {
  const [compileFixture, ai, { Agent }] = await Promise.all([
    readFile(
      new URL("tests/fixtures/pi-sdk-0871.contract.ts", repositoryRoot),
      "utf8",
    ),
    import("@earendil-works/pi-ai"),
    import("@earendil-works/pi-agent-core"),
  ]);
  const models = ai.createModels();
  const cleanupEvents = [];
  class StalledAgent extends Agent {
    prompt() {
      return new Promise(() => {});
    }
    abort() {
      cleanupEvents.push("abort");
      super.abort();
    }
    async waitForIdle() {
      assert.ok(models.getProvider("chapter-11-faux"));
      cleanupEvents.push("idle");
      await super.waitForIdle();
    }
  }
  const fixture = await importCompileFixtureFunctions(
    compileFixture,
    [chapter11ExampleFunction],
    {
      assert,
      Agent: StalledAgent,
      createModels: () => models,
      fauxProvider: ai.fauxProvider,
      fauxAssistantMessage: ai.fauxAssistantMessage,
      fauxText: ai.fauxText,
      fauxToolCall: ai.fauxToolCall,
      getCurrentSystemPrompt: ai.getCurrentSystemPrompt,
      getCurrentTools: ai.getCurrentTools,
      Type: ai.Type,
    },
  );
  let safetyTimer;
  try {
    const safetyDeadline = new Promise((_, reject) => {
      safetyTimer = setTimeout(
        () => reject(new Error("fixture did not enforce its Agent watchdog")),
        5_000,
      );
    });
    await assert.rejects(
      Promise.race([fixture[chapter11ExampleFunction](), safetyDeadline]),
      /Chapter 11 Agent run did not settle within 2000 ms/,
    );
    assert.ok(cleanupEvents.includes("abort"));
    assert.ok(cleanupEvents.includes("idle"));
    assert.ok(cleanupEvents.indexOf("abort") < cleanupEvents.indexOf("idle"));
    assert.equal(models.getProvider("chapter-11-faux"), undefined);
    assert.equal(models.getModel("chapter-11-faux", "chapter-11-model"), undefined);
  } finally {
    clearTimeout(safetyTimer);
  }
});

test("Pi 0.87.1 SDK install recipes omit the fixed 0.85.0 packaging workaround", async () => {
  const guideContracts = [
    {
      path: "how-to/add-custom-tool.md",
      headings: { en: "## Prerequisites", vi: "## Điều kiện cần" },
    },
    {
      path: "how-to/stream-output.md",
      beforeHeadings: { en: "## The event stream", vi: "## Event stream" },
    },
    {
      path: "how-to/plug-new-model.md",
      headings: { en: "## Prerequisites", vi: "## Điều kiện cần" },
    },
    {
      path: "how-to/persist-sessions.md",
      beforeHeadings: {
        en: "## The session model",
        vi: "## Mô hình session",
      },
    },
    {
      path: "how-to/customize-system-prompt.md",
      headings: {
        en: "## 5. Inspect the effective prompt",
        vi: "## 5. Kiểm tra prompt thực tế",
      },
    },
    {
      path: "how-to/host-session-runtime.md",
      beforeHeadings: { en: "## Outcome", vi: "## Kết quả" },
    },
  ];
  for (const guideContract of guideContracts) {
    for (const { locale, source } of await readLocalizedContent(
      guideContract.path,
    )) {
      const context = `${locale} ${guideContract.path} Pi 0.87.1 SDK install`;
      const scope = guideContract.headings
        ? extractMarkdownSection(
            source,
            guideContract.headings[locale],
            context,
          ).body
        : extractMarkdownPreamble(
            source,
            guideContract.beforeHeadings[locale],
            context,
          );

      assert.doesNotMatch(source, /0\.85\.0`? packaging workaround/i, context);
      assert.doesNotMatch(
        source,
        /workaround[^\r\n]*đóng gói[^\r\n]*0\.85\.0/i,
        context,
      );
      assert.doesNotMatch(source, /@earendil-works\/pi-[a-z-]+@0\.85\.0/, context);

      assertSdkInstallPackages(source, scope, context);
    }
  }
});

test("SDK install recipes reject extra Pi packages on continuation lines", () => {
  const source =
    'import { createAgentSession } from "@earendil-works/pi-coding-agent";';
  for (const [language, continuation] of [
    ["bash", "\\"],
    ["powershell", "`"],
    ["cmd", "^"],
  ]) {
    const scope = [
      `\`\`\`${language}`,
      `npm install @earendil-works/pi-coding-agent@0.87.1 ${continuation}`,
      "  @earendil-works/pi-server@0.87.1",
      "```",
    ].join("\n");
    assert.throws(
      () => assertSdkInstallPackages(source, scope, language),
      /without unused dependencies/,
    );
  }
});

test("SDK install recipes recognize and pin required packages on continuation lines", () => {
  const source = [
    'import { createAgentSession } from "@earendil-works/pi-coding-agent";',
    'import { Type } from "@earendil-works/pi-ai";',
  ].join("\n");
  for (const [language, continuation] of [
    ["bash", "\\"],
    ["powershell", "`"],
    ["cmd", "^"],
  ]) {
    const scope = [
      `\`\`\`${language}`,
      `npm install @earendil-works/pi-ai@0.87.1 ${continuation}`,
      "  @earendil-works/pi-coding-agent@0.87.1",
      "```",
    ].join("\r\n");
    assert.doesNotThrow(() => assertSdkInstallPackages(source, scope, language));
    for (const version of ["0.87.0", "^0.87.1", "0.87.10"]) {
      assert.throws(
        () =>
          assertSdkInstallPackages(
            source,
            scope.replace("pi-coding-agent@0.87.1", `pi-coding-agent@${version}`),
            language,
          ),
        /must pin @earendil-works\/pi-coding-agent to 0\.87\.1/,
      );
    }
  }
});

test("SDK install recipes keep following commands and prose outside the install set", () => {
  const source =
    'import { createAgentSession } from "@earendil-works/pi-coding-agent";';
  for (const scope of [
    "```bash\nnpm install @earendil-works/pi-coding-agent@0.87.1 \\\n  --save-exact\nnpm view @earendil-works/pi-server@0.87.1\n```\nThe old npm install @earendil-works/pi-server@0.85.0 command is obsolete.",
    "Install with `npm install @earendil-works/pi-coding-agent@0.87.1`, then run `npm view @earendil-works/pi-server@0.87.1`.",
    "```bash\nnpm install @earendil-works/pi-coding-agent@0.87.1 && npm view @earendil-works/pi-server@0.87.1\n```",
  ]) {
    assert.doesNotThrow(() =>
      assertSdkInstallPackages(source, scope, "command boundary"),
    );
  }
});

test("SDK install recipes accept quoted package arguments", () => {
  const source =
    'import { createAgentSession } from "@earendil-works/pi-coding-agent";';
  for (const [language, quotes] of [
    ["bash", ["'", '"']],
    ["powershell", ["'", '"']],
    ["cmd", ['"']],
  ]) {
    for (const quote of quotes) {
      const scope = [
        `\`\`\`${language}`,
        `npm install --save-exact ${quote}@earendil-works/pi-coding-agent@0.87.1${quote}`,
        "```",
      ].join("\n");
      assert.doesNotThrow(() => assertSdkInstallPackages(source, scope, language));
    }
  }
});

test("SDK install recipes ignore shell comments without stripping quoted hashes", () => {
  const source =
    'import { createAgentSession } from "@earendil-works/pi-coding-agent";';
  for (const [language, comment] of [
    ["bash", "#"],
    ["powershell", "#"],
    ["cmd", "& rem"],
    ["cmd", "& ::"],
  ]) {
    const unquotedScope = [
      `\`\`\`${language}`,
      `npm install @earendil-works/pi-coding-agent@0.87.1 ${comment} @earendil-works/pi-server@0.87.1 "unmatched quote in comment`,
      "```",
    ].join("\n");
    assert.doesNotThrow(() =>
      assertSdkInstallPackages(source, unquotedScope, language),
    );
    const scope = [
      `\`\`\`${language}`,
      `npm install --registry="https://registry.example/#mirror;cache" "@earendil-works/pi-coding-agent@0.87.1" ${comment} @earendil-works/pi-server@0.87.1`,
      "```",
    ].join("\n");
    assert.doesNotThrow(() => assertSdkInstallPackages(source, scope, language));
    assert.throws(
      () =>
        assertSdkInstallPackages(
          source,
          scope.replace("pi-coding-agent@0.87.1", "pi-coding-agent@0.87.1#invalid"),
          language,
        ),
      /must pin @earendil-works\/pi-coding-agent to 0\.87\.1/,
    );
  }
});

test("SDK install recipes preserve Bash and PowerShell hashes within unquoted arguments", () => {
  const source =
    'import { createAgentSession } from "@earendil-works/pi-coding-agent";';
  for (const language of ["bash", "powershell", "pwsh"]) {
    const scope = [
      `\`\`\`${language}`,
      "npm install --cache=/tmp/build#1 @earendil-works/pi-coding-agent@0.87.1",
      "```",
    ].join("\n");
    assert.doesNotThrow(() => assertSdkInstallPackages(source, scope, language));
  }
});

test("external-session restoration examples stay synchronized with the compile fixture", async () => {
  const [guides, compileFixture] = await Promise.all([
    readLocalizedContent("how-to/persist-sessions.md"),
    readFile(
      new URL("tests/fixtures/pi-sdk-0871.contract.ts", repositoryRoot),
      "utf8",
    ),
  ]);

  const displayedExamples = guides.map(({ locale, source }) => {
    assertExternalSessionGuideExampleParity(
      source,
      compileFixture,
      `${locale} persistence guide`,
    );
    return externalSessionGuideExampleFence(
      source,
      `${locale} persistence guide`,
    );
  });
  assert.equal(
    displayedExamples[0],
    displayedExamples[1],
    "external-session restoration code must be identical across locales",
  );
});

test("external-session fixture helper restores an in-memory tree at runtime", async () => {
  const [compileFixture, { SessionManager }] = await Promise.all([
    readFile(
      new URL("tests/fixtures/pi-sdk-0871.contract.ts", repositoryRoot),
      "utf8",
    ),
    import("@earendil-works/pi-coding-agent"),
  ]);
  const { restoreExternalSessionEntries } = await importCompileFixtureFunctions(
    compileFixture,
    [externalSessionGuideFunction],
    { SessionManager },
  );
  const cwd = process.cwd();
  const sessionId = "external-session-0850";
  const header = {
    type: "session",
    version: 3,
    id: sessionId,
    timestamp: "2026-09-04T10:18:28.000Z",
    cwd,
  };
  const restoredEntries = [
    {
      type: "custom",
      id: "root-entry",
      parentId: null,
      timestamp: "2026-09-04T10:18:29.000Z",
      customType: "fixture",
      data: { branch: "root" },
    },
    {
      type: "custom",
      id: "first-branch",
      parentId: "root-entry",
      timestamp: "2026-09-04T10:18:30.000Z",
      customType: "fixture",
      data: { branch: "first" },
    },
    {
      type: "custom",
      id: "active-branch",
      parentId: "root-entry",
      timestamp: "2026-09-04T10:18:31.000Z",
      customType: "fixture",
      data: { branch: "active" },
    },
  ];

  const manager = restoreExternalSessionEntries(
    sessionId,
    [header, ...restoredEntries],
    cwd,
  );

  assert.equal(manager.getSessionId(), sessionId);
  assert.deepEqual(manager.getHeader(), header);
  assert.deepEqual(manager.getEntries(), restoredEntries);
  assert.equal(manager.getLeafId(), "active-branch");
  assert.deepEqual(
    manager.getBranch().map((entry) => entry.id),
    ["root-entry", "active-branch"],
  );
  assert.deepEqual(
    manager.getTree().map((root) => ({
      id: root.entry.id,
      children: root.children.map((child) => child.entry.id),
    })),
    [{ id: "root-entry", children: ["first-branch", "active-branch"] }],
  );
  assert.equal(manager.getSessionFile(), undefined);
  assert.equal(manager.isPersisted(), false);

  const appendedId = manager.appendCustomEntry("fixture", {
    branch: "appended",
  });
  assert.equal(manager.getLeafId(), appendedId);
  assert.equal(manager.getEntry(appendedId)?.parentId, "active-branch");
  assert.equal(manager.getEntries().length, restoredEntries.length + 1);
  assert.equal(manager.getSessionFile(), undefined);
  assert.equal(manager.isPersisted(), false);
});

test("persistence guides define external ownership and the restoration input boundary", async () => {
  const guides = await readLocalizedContent("how-to/persist-sessions.md");
  const localeContract = {
    en: {
      heading: "## Restore externally stored entries",
      ownership: /host[^.]*owns[^.]*external storage/i,
      noFile: /does not[^.]*Pi session file/i,
      caller: /caller[^.]*responsible/i,
      wellFormed: /well-formed `FileEntry\[\]`/i,
      header: /header[^.]*`id`[^.]*`cwd`[^.]*`version`/i,
      validate: /validat(?:e|ion)[^.]*before/i,
      migration: /`migrateSessionEntries\(\)`[^.]*mutates/i,
      parser: /`parseSessionEntries\(\)`[^.]*skip/i,
      appendOnly: /append-only tree/i,
    },
    vi: {
      heading: "## Khôi phục entry do storage bên ngoài quản lý",
      ownership: /host[^.]*sở hữu[^.]*external storage/i,
      noFile: /không[^.]*Pi session file/i,
      caller: /caller[^.]*chịu trách nhiệm/i,
      wellFormed: /`FileEntry\[\]` đúng cấu trúc/i,
      header: /header[^.]*`id`[^.]*`cwd`[^.]*`version`/i,
      validate: /validat(?:e|ion)[^.]*trước/i,
      migration: /`migrateSessionEntries\(\)`[^.]*thay đổi/i,
      parser: /`parseSessionEntries\(\)`[^.]*bỏ qua/i,
      appendOnly: /append-only tree/i,
    },
  };

  const structures = guides.map(({ locale, source }) => {
    const contract = localeContract[locale];
    const section = assertContainsAll(
      source,
      [
        /`FileEntry\[\]`/,
        /`SessionManager\.inMemory\(cwd, \{ id: sessionId \}, entries\)`/,
        contract.ownership,
        contract.noFile,
        contract.caller,
        contract.wellFormed,
        contract.header,
        contract.validate,
        contract.migration,
        contract.parser,
        contract.appendOnly,
      ],
      `${locale} external-session restoration`,
      { heading: contract.heading },
    );
    return sectionStructure(section);
  });
  assert.deepEqual(structures[0], structures[1]);
});

test("session docs integrate the Pi 0.85.0 collision and fork fixes without broad guarantees", async () => {
  const pages = [
    ...(await readLocalizedContent("ch10-session.md")),
    ...(await readLocalizedContent("how-to/host-session-runtime.md")),
  ];
  for (const { locale, source } of pages) {
    assert.match(
      source,
      /import(?:ed| JSONL)[^.]*same filename|import[^.]*trùng filename/i,
    );
    assert.match(
      source,
      /concurrent session shares?[^.]*not overwrite|share session đồng thời[^.]*không ghi đè/i,
    );
    assert.match(
      source,
      /fork[^.]*compaction boundary|fork[^.]*ranh giới compaction/i,
    );
    assert.match(
      source,
      /in-memory[^.]*fork[^.]*active turn[^.]*settle|fork in-memory[^.]*active turn[^.]*settle/i,
    );
    assert.doesNotMatch(
      source,
      /all session writes are atomic|mọi thao tác ghi session đều atomic/i,
      `${locale} session docs must not overclaim atomicity`,
    );
  }
});

test("API references publish the exact external-session overload and types", async () => {
  const references = await readLocalizedContent("reference/api.md");
  const exactDeclarations = `export interface NewSessionOptions {
  id?: string;
  parentSession?: string;
}

export type FileEntry = SessionHeader | SessionEntry;

export declare class SessionManager {
  static inMemory(
    cwd?: string,
    options?: NewSessionOptions,
    entries?: FileEntry[],
  ): SessionManager;
}`;
  const structures = references.map(({ locale, source }) => {
    const heading =
      locale === "en"
        ? "#### External-session restoration"
        : "#### Khôi phục session bên ngoài";
    const section = extractMarkdownSection(
      source,
      heading,
      `${locale} API external session surface`,
    );
    assert.match(section.body, /```ts[\s\S]*```/);
    assert.ok(
      section.body.includes(exactDeclarations),
      `${locale} API must preserve exact FileEntry, NewSessionOptions, and inMemory declarations`,
    );
    assert.doesNotMatch(
      section.body,
      /getSummarizationFailure[^.]*package root|package root[^.]*getSummarizationFailure/i,
      `${locale} API must not claim getSummarizationFailure is a package-root export`,
    );
    return sectionStructure(section);
  });
  assert.deepEqual(structures[0], structures[1]);
});

test("external-session restoration parity rejects call-shape and FileEntry drift", async () => {
  const compileFixture = await readFile(
    new URL("tests/fixtures/pi-sdk-0871.contract.ts", repositoryRoot),
    "utf8",
  );
  const exactExample = `\`\`\`ts\nimport {\n  type FileEntry,\n  SessionManager,\n} from "@earendil-works/pi-coding-agent";\n\n${
    parsedExampleContract(
      compileFixture,
      "Pi 0.87.1 compile fixture",
      externalSessionGuideFunction,
    ).functionSource
  }\n\`\`\``;
  const changedCall = exactExample.replace(
    "SessionManager.inMemory(cwd, { id: sessionId }, entries)",
    "SessionManager.inMemory(cwd, entries)",
  );
  const changedType = exactExample.replace(
    "entries: FileEntry[]",
    "entries: unknown[]",
  );
  assert.notEqual(changedCall, exactExample);
  assert.notEqual(changedType, exactExample);

  assert.throws(
    () =>
      assertExternalSessionGuideExampleParity(
        changedCall,
        compileFixture,
        "synthetic restoration guide",
      ),
    /displayed function must match the compile fixture/,
  );
  assert.throws(
    () =>
      assertExternalSessionGuideExampleParity(
        changedType,
        compileFixture,
        "synthetic restoration guide",
      ),
    /displayed example must not carry unused imports|displayed function must match the compile fixture/,
  );
});

test("Chapters 8 and 9 document the three automatic compaction checkpoints", async () => {
  for (const relativePath of [
    "ch08-context-engineering.md",
    "ch09-compaction.md",
  ]) {
    const chapters = await readLocalizedContent(relativePath);
    const structures = chapters.map(({ locale, source }) =>
      sectionStructure(
        assertMidRunCompactionLifecycle(
          source,
          locale,
          `${locale} ${relativePath}`,
        ),
      ),
    );
    assert.deepEqual(
      structures[0],
      structures[1],
      `${relativePath} mid-run lifecycle structure must match across locales`,
    );
  }
});

test("mid-run lifecycle guard rejects reordered phases and an inverted terminating-batch rule", () => {
  const valid = `### Mid-run compaction checkpoints

1. Tool results are appended to the session first.
2. Pi then performs the threshold check.
3. If the threshold is crossed, optional compaction completes.
4. Only then does Pi request the next assistant response.

A terminating Tool batch with no steering or follow-up message skips mid-run compaction because there is no next assistant response.

The three guards are the mid-run check, the check before submitting a new prompt, and the check after the low-level Agent run finishes.`;
  assert.doesNotThrow(() =>
    assertMidRunCompactionLifecycle(valid, "en", "synthetic lifecycle"),
  );

  const reordered = valid
    .replace("1. Tool results are appended to the session first.\n", "")
    .replace(
      "3. If the threshold is crossed, optional compaction completes.\n",
      "3. If the threshold is crossed, optional compaction completes.\n4. Tool results are appended to the session first.\n",
    );
  const invertedSkip = valid.replace(
    "skips mid-run compaction",
    "always runs mid-run compaction",
  );
  assert.throws(
    () =>
      assertMidRunCompactionLifecycle(reordered, "en", "reordered lifecycle"),
    /must order append, threshold check, optional compaction/,
  );
  assert.throws(
    () =>
      assertMidRunCompactionLifecycle(
        invertedSkip,
        "en",
        "inverted terminating lifecycle",
      ),
    /terminating-batch skip/,
  );
});

test("Chapters 8 and 9 document released incomplete-summary rejection", async () => {
  for (const relativePath of [
    "ch08-context-engineering.md",
    "ch09-compaction.md",
  ]) {
    const chapters = await readLocalizedContent(relativePath);
    const structures = chapters.map(({ locale, source }) =>
      sectionStructure(
        assertReleasedSummarizationFailure(
          source,
          locale,
          `${locale} ${relativePath}`,
        ),
      ),
    );
    assert.deepEqual(
      structures[0],
      structures[1],
      `${relativePath} incomplete-summary structure must match across locales`,
    );
  }
});

test("both replaceable session runtime guides name the public 0.85.0 contracts", async () => {
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
      new URL("tests/fixtures/pi-sdk-0871.contract.ts", repositoryRoot),
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
      new URL("tests/fixtures/pi-sdk-0871.contract.ts", repositoryRoot),
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
  const markdown = normalizeLineEndings(
    await readFile(
      new URL("content/en/how-to/host-session-runtime.md", repositoryRoot),
      "utf8",
    ),
  );
  const extensionBinding =
    "      await session.bindExtensions(bindings.extensionBindings(session));\n";
  const hostSubscription = "      unsubscribe = bindings.subscribe(session);\n";
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

test("replaceable runtime guides clean up failed initial and replacement bindings", async () => {
  const guides = await readLocalizedContent("how-to/host-session-runtime.md");

  for (const { locale, source } of guides) {
    assert.doesNotThrow(() =>
      assertRuntimeGuideBindingFailureCleanup(
        source,
        `${locale} replaceable session runtime guide`,
      ),
    );
  }
});

test("replaceable runtime cleanup guard rejects missing subscription cleanup and runtime disposal", async () => {
  const markdown = normalizeLineEndings(
    await readFile(
      new URL("content/en/how-to/host-session-runtime.md", repositoryRoot),
      "utf8",
    ),
  );
  const bindStart = markdown.indexOf(
    "  const bindSession = async (session: AgentSession) => {",
  );
  const bindEnd = markdown.indexOf(
    "\n  const disposeRuntimeFailure",
    bindStart,
  );
  assert.ok(bindStart >= 0);
  assert.ok(bindEnd > bindStart);
  const bindSession = markdown.slice(bindStart, bindEnd);
  const missingSubscriptionCleanupBlock = bindSession.replace(
    "      clearSubscriptionAfterFailure(cleanupFailures);\n",
    "",
  );
  const missingSubscriptionCleanup = markdown.replace(
    bindSession,
    missingSubscriptionCleanupBlock,
  );
  const missingRuntimeDisposal = markdown.replace(
    "        await runtime.dispose();\n",
    "",
  );
  assert.notEqual(missingSubscriptionCleanupBlock, bindSession);
  assert.notEqual(missingSubscriptionCleanup, markdown);
  assert.notEqual(missingRuntimeDisposal, markdown);

  assert.throws(
    () =>
      assertRuntimeGuideBindingFailureCleanup(
        missingSubscriptionCleanup,
        "synthetic missing failed-subscription cleanup",
      ),
    /must clear a newly installed subscription on failure/,
  );
  assert.throws(
    () =>
      assertRuntimeGuideBindingFailureCleanup(
        missingRuntimeDisposal,
        "synthetic missing failed-runtime disposal",
      ),
    /must dispose the applied runtime and remain unavailable in finally/,
  );
});

test("binding failure finalizer preserves one flat primary and staged cleanup order", async () => {
  const compileFixture = await readFile(
    new URL("tests/fixtures/pi-sdk-0871.contract.ts", repositoryRoot),
    "utf8",
  );
  const throwSessionBindingFailure = await importCompileFixtureFunction(
    compileFixture,
    runtimeBindingFailureFunction,
  );
  assert.equal(typeof throwSessionBindingFailure, "function");

  const primary = new Error("primary binding failure");
  const unsubscribeFailure = new Error("unsubscribe failure");
  const disposeFailure = new Error("dispose failure");
  assert.throws(
    () =>
      throwSessionBindingFailure(
        primary,
        [unsubscribeFailure, disposeFailure],
        "replacement session binding",
      ),
    (error) => {
      assert.ok(error instanceof AggregateError);
      assert.deepEqual(error.errors, [
        primary,
        unsubscribeFailure,
        disposeFailure,
      ]);
      assert.equal(error.cause, primary);
      return true;
    },
  );
  assert.throws(
    () => throwSessionBindingFailure(primary, [], "initial session binding"),
    (error) => error === primary,
  );
});

test("synchronous invalidation cleanup failure cannot interrupt replacement teardown or factory", async () => {
  const { bindSerializedSessionRuntimeHost } = await loadRuntimeHostAdapter();
  assert.equal(typeof bindSerializedSessionRuntimeHost, "function");

  const events = [];
  const unsubscribeFailure = new Error("old unsubscribe failure");
  const replacementDisposeFailure = new Error(
    "applied replacement disposal failure",
  );
  const runtime = createRuntimePortHarness(events, {
    disposeFailure: replacementDisposeFailure,
  });
  const host = await bindSerializedSessionRuntimeHost(runtime, {
    extensionBindings: () => ({}),
    subscribe(session) {
      events.push(`${session.label}:subscribe`);
      return () => {
        events.push(`${session.label}:unsubscribe`);
        if (session.label === "old") throw unsubscribeFailure;
      };
    },
    reportDiagnostics() {},
    async flushPersistence() {
      events.push("persistence:flush");
    },
  });

  await assert.rejects(host.newSession(), (error) => {
    assert.ok(error instanceof AggregateError);
    assert.deepEqual(error.errors, [
      unsubscribeFailure,
      replacementDisposeFailure,
    ]);
    assert.equal(error.cause, unsubscribeFailure);
    return true;
  });
  assert.ok(
    events.indexOf("old:unsubscribe") <
      events.indexOf("replacement:before-invalidate-returned"),
  );
  assert.ok(
    events.indexOf("replacement:before-invalidate-returned") <
      events.indexOf("old:disposed"),
  );
  assert.ok(events.indexOf("old:disposed") < events.indexOf("factory:called"));
  assert.ok(
    events.indexOf("factory:called") < events.indexOf("runtime:dispose"),
  );
  assert.throws(() => host.cwd, /no usable current session/);
});

test("post-rebind persistence failure disposes the installed runtime and stays terminal", async () => {
  const { bindSerializedSessionRuntimeHost } = await loadRuntimeHostAdapter();
  const events = [];
  const flushFailure = new Error("replacement persistence flush failure");
  const runtime = createRuntimePortHarness(events);
  const host = await bindSerializedSessionRuntimeHost(runtime, {
    extensionBindings: () => ({}),
    subscribe(session) {
      events.push(`${session.label}:subscribe`);
      return () => events.push(`${session.label}:unsubscribe`);
    },
    reportDiagnostics() {},
    async flushPersistence() {
      events.push("persistence:flush");
      throw flushFailure;
    },
  });

  await assert.rejects(host.newSession(), (error) => error === flushFailure);
  assert.ok(
    events.indexOf("replacement-1:rebound") <
      events.indexOf("persistence:flush"),
  );
  assert.ok(
    events.indexOf("persistence:flush") <
      events.indexOf("replacement-1:unsubscribe"),
  );
  assert.ok(
    events.indexOf("replacement-1:unsubscribe") <
      events.indexOf("runtime:dispose"),
  );
  assert.throws(() => host.cwd, /no usable current session/);
  await assert.rejects(host.newSession(), /no usable current session/);
  assert.equal(runtime.newSessionCalls, 1);
});

test("final persistence failure still disposes and unsubscribes after terminal state", async () => {
  const { bindSerializedSessionRuntimeHost } = await loadRuntimeHostAdapter();
  const events = [];
  const flushFailure = new Error("final persistence flush failure");
  const runtimeDisposeFailure = new Error("final runtime disposal failure");
  const unsubscribeFailure = new Error("final unsubscribe failure");
  const runtime = createRuntimePortHarness(events, {
    disposeFailure: runtimeDisposeFailure,
  });
  const host = await bindSerializedSessionRuntimeHost(runtime, {
    extensionBindings: () => ({}),
    subscribe(session) {
      events.push(`${session.label}:subscribe`);
      return () => {
        events.push(`${session.label}:unsubscribe`);
        throw unsubscribeFailure;
      };
    },
    reportDiagnostics() {},
    async flushPersistence() {
      events.push("persistence:flush");
      throw flushFailure;
    },
  });

  const disposing = host.dispose();
  assert.throws(() => host.cwd, /disposed/);
  await assert.rejects(disposing, (error) => {
    assert.ok(error instanceof AggregateError);
    assert.deepEqual(error.errors, [
      flushFailure,
      unsubscribeFailure,
      runtimeDisposeFailure,
    ]);
    assert.equal(error.cause, flushFailure);
    return true;
  });
  assert.deepEqual(events.slice(-4), [
    "old:abort",
    "persistence:flush",
    "runtime:dispose",
    "old:unsubscribe",
  ]);
  assert.throws(() => host.diagnostics, /disposed/);
  await assert.rejects(host.newSession(), /disposed/);
  assert.equal(runtime.newSessionCalls, 0);
});

test("final runtime invalidation callback failure is drained and rejects disposal", async () => {
  const { bindSerializedSessionRuntimeHost } = await loadRuntimeHostAdapter();
  const events = [];
  const unsubscribeFailure = new Error("final callback unsubscribe failure");
  const runtime = createRuntimePortHarness(events);
  const host = await bindSerializedSessionRuntimeHost(runtime, {
    extensionBindings: () => ({}),
    subscribe(session) {
      events.push(`${session.label}:subscribe`);
      return () => {
        events.push(`${session.label}:unsubscribe`);
        throw unsubscribeFailure;
      };
    },
    reportDiagnostics() {},
    async flushPersistence() {
      events.push("persistence:flush");
    },
  });

  await assert.rejects(host.dispose(), (error) => error === unsubscribeFailure);
  assert.ok(
    events.indexOf("runtime:dispose") < events.indexOf("old:unsubscribe"),
  );
  assert.throws(() => host.cwd, /disposed/);
  await assert.rejects(host.newSession(), /disposed/);
});

test("dispose requested during replacement becomes terminal immediately and queues cleanup", async () => {
  const { bindSerializedSessionRuntimeHost } = await loadRuntimeHostAdapter();
  const events = [];
  let releaseFactory;
  let reportFactoryCalled;
  const factoryGate = new Promise((resolve) => {
    releaseFactory = resolve;
  });
  const factoryCalled = new Promise((resolve) => {
    reportFactoryCalled = resolve;
  });
  const runtime = createRuntimePortHarness(events, {
    factoryGate,
    onFactoryCalled: reportFactoryCalled,
  });
  const host = await bindSerializedSessionRuntimeHost(runtime, {
    extensionBindings: () => ({}),
    subscribe(session) {
      events.push(`${session.label}:subscribe`);
      return () => events.push(`${session.label}:unsubscribe`);
    },
    reportDiagnostics() {},
    async flushPersistence() {
      events.push("persistence:flush");
    },
  });

  const replacing = host.newSession();
  await factoryCalled;
  const disposing = host.dispose();
  let disposalSettled = false;
  void disposing.then(
    () => {
      disposalSettled = true;
    },
    () => {
      disposalSettled = true;
    },
  );
  await Promise.resolve();
  assert.equal(disposalSettled, false);
  assert.throws(() => host.cwd, /disposed/);
  const laterOperation = host.newSession();

  releaseFactory();
  await replacing;
  await disposing;
  await assert.rejects(laterOperation, /disposed/);
  await assert.rejects(host.dispose(), /disposed/);
  assert.equal(runtime.newSessionCalls, 1);
  assert.ok(
    events.indexOf("replacement-1:rebound") <
      events.indexOf("replacement-1:abort"),
  );
  assert.ok(
    events.indexOf("replacement-1:abort") < events.indexOf("runtime:dispose"),
  );
  assert.throws(() => host.diagnostics, /disposed/);
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
      new URL("tests/fixtures/pi-sdk-0871.contract.ts", repositoryRoot),
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
    ).then((source) => normalizeLineEndings(source)),
    readFile(
      new URL("tests/fixtures/pi-sdk-0871.contract.ts", repositoryRoot),
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
    ).then((source) => normalizeLineEndings(source)),
    readFile(
      new URL("tests/fixtures/pi-sdk-0871.contract.ts", repositoryRoot),
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
      new URL("tests/fixtures/pi-sdk-0871.contract.ts", repositoryRoot),
      "utf8",
    ),
  ]);

  for (const { context, source } of [
    ...guides.map(({ locale, source }) => ({
      context: `${locale} deterministic Agent guide`,
      source,
    })),
    { context: "Pi 0.87.1 compile fixture", source: compileFixture },
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
      new URL("tests/fixtures/pi-sdk-0871.contract.ts", repositoryRoot),
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
      new URL("tests/fixtures/pi-sdk-0871.contract.ts", repositoryRoot),
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

test("Pi 0.85 Tool cwd contracts bind the exact affected built-ins at invocation time", async () => {
  const chapters = await readLocalizedContent("ch05-tool-system.md");
  const headings = {
    en: "### The eight built-ins declare only the operations they consume",
    vi: "### Tám Tool dựng sẵn chỉ khai báo thao tác mà chúng dùng",
  };
  const structures = [];

  for (const { locale, source } of chapters) {
    const section = extractMarkdownSection(
      source,
      headings[locale],
      `${locale} Chapter 5 live cwd guidance`,
    );
    assertLiveInvocationCwdBinding(
      section.body,
      `${locale} Chapter 5 live cwd guidance`,
    );
    assertNoMisleadingWriteByteCount(source, `${locale} Chapter 5`);
    structures.push(sectionStructure(section));
  }
  assert.deepEqual(structures[0], structures[1]);

  assert.throws(
    () =>
      assertNoMisleadingWriteByteCount(
        "The write Tool reports its UTF-16 code-unit count as a byte count.",
        "synthetic write result",
      ),
    /must not claim that write reports UTF-16 code units as bytes/,
  );
  assert.doesNotThrow(() =>
    assertNoMisleadingWriteByteCount(
      "The write Tool no longer reports its UTF-16 code-unit count as bytes.",
      "synthetic corrected write result",
    ),
  );
});

test("Pi 0.85 terminal override contracts preserve exact values and precedence", async () => {
  const documentContracts = [
    {
      path: "reference/environment-variables.md",
      headings: {
        en: "### Terminal and editor behavior",
        vi: "### Hành vi terminal và editor",
      },
    },
    {
      path: "reference/configuration.md",
      headings: {
        en: "### Terminal, images, shell, and npm",
        vi: "### Terminal, image, shell và npm",
      },
    },
  ];

  for (const documentContract of documentContracts) {
    const references = await readLocalizedContent(documentContract.path);
    const structures = [];
    for (const { locale, source } of references) {
      const section = assertContainsAll(
        source,
        [
          /PI_HYPERLINKS=1(?:\\?\|)0(?:\\?\|)auto/,
          /PI_IMAGE_PROTOCOL=kitty(?:\\?\|)iterm2(?:\\?\|)none(?:\\?\|)auto/,
          /PI_TRUE_COLOR=1(?:\\?\|)0(?:\\?\|)auto/,
          /terminal\.hyperlinks/,
          /terminal\.images/,
          /terminal\.trueColor/,
          /Zed/,
          /escape sequence/i,
        ],
        `${locale} ${documentContract.path} terminal override guidance`,
        {
          heading: documentContract.headings[locale],
          minWords: 125,
        },
      );
      assertTerminalCapabilitySemantics(
        section.body,
        `${locale} ${documentContract.path} terminal capability semantics`,
      );
      structures.push(sectionStructure(section));
    }
    assert.deepEqual(structures[0], structures[1]);
  }

  const terminalFixture = [
    "`PI_HYPERLINKS`: `1` force-enables hyperlinks, `0` force-disables them, and `auto` falls back to automatic detection. The explicit `terminal.hyperlinks` setting overrides `PI_HYPERLINKS` and detection.",
    "`PI_IMAGE_PROTOCOL`: `kitty` selects Kitty and `iterm2` selects iTerm2; `none` force-disables inline images, while `auto` falls back to automatic detection. The explicit `terminal.images` setting overrides `PI_IMAGE_PROTOCOL` and detection.",
    "`PI_TRUE_COLOR`: `1` force-enables truecolor, `0` force-disables it, and `auto` falls back to automatic detection. The explicit `terminal.trueColor` setting overrides `PI_TRUE_COLOR` and detection.",
  ].join("\n\n");
  assert.doesNotThrow(() =>
    assertTerminalCapabilitySemantics(
      terminalFixture,
      "synthetic terminal fixture",
    ),
  );
  assert.throws(
    () =>
      assertTerminalCapabilitySemantics(
        terminalFixture.replace(
          "`1` force-enables hyperlinks",
          "`1` force-disables hyperlinks",
        ),
        "mutated terminal enable semantics",
      ),
    /PI_HYPERLINKS\/terminal\.hyperlinks/,
  );
  assert.throws(
    () =>
      assertTerminalCapabilitySemantics(
        terminalFixture.replace(
          "The explicit `terminal.trueColor` setting overrides `PI_TRUE_COLOR` and detection.",
          "`PI_TRUE_COLOR` overrides the `terminal.trueColor` setting and detection.",
        ),
        "mutated terminal precedence",
      ),
    /PI_TRUE_COLOR\/terminal\.trueColor/,
  );
});

test("Pi 0.85 fullscreen controls are documented in both configuration locales", async () => {
  const references = await readLocalizedContent("reference/configuration.md");
  const headings = {
    en: "### UI and display",
    vi: "### UI và display",
  };
  const structures = [];

  for (const { locale, source } of references) {
    const section = assertContainsAll(
      source,
      [
        /fullscreenCopyOnSelect/,
        /Ctrl\+X/,
        /selection/i,
        /disabled|tắt/i,
        /Jump to latest message/,
        /tui\.altScreen\.bottom/,
        /fullscreenScrollbar/,
        /`auto`/,
        /pointer/i,
        /track/i,
      ],
      `${locale} configuration fullscreen controls`,
      { heading: headings[locale], minWords: 115 },
    );
    assertFullscreenControlSemantics(
      section.body,
      `${locale} configuration fullscreen controls`,
    );
    structures.push(sectionStructure(section));
  }
  assert.deepEqual(structures[0], structures[1]);

  const fullscreenFixture =
    "`fullscreenCopyOnSelect` defaults to `true`. When disabled, `Ctrl+X` attempts to copy the eligible active selection and returns whether that copy succeeds or fails; it falls back to the last assistant message only when no eligible active selection exists.\n\nThe `Jump to latest message` label appears only while the transcript is scrolled above the latest message.";
  assert.doesNotThrow(() =>
    assertFullscreenControlSemantics(
      fullscreenFixture,
      "synthetic fullscreen fixture",
    ),
  );
  assert.throws(
    () =>
      assertFullscreenControlSemantics(
        fullscreenFixture.replace(
          "only when no eligible active selection exists",
          "when selection copying fails",
        ),
        "mutated fullscreen fallback",
      ),
    /selection-copy precedence/,
  );
  assert.throws(
    () =>
      assertFullscreenControlSemantics(
        fullscreenFixture.replace(
          "appears only while the transcript is scrolled above the latest message",
          "always appears below the transcript",
        ),
        "mutated jump visibility",
      ),
    /jump-to-latest visibility condition/,
  );
});

test("Pi 0.85 API locales expose file-based supported image MIME detection", async () => {
  const references = await readLocalizedContent("reference/api.md");
  const headings = {
    en: "### Image MIME detection",
    vi: "### Phát hiện MIME của image",
  };
  const structures = [];

  for (const { locale, source } of references) {
    const section = assertContainsAll(
      source,
      [
        /detectSupportedImageMimeTypeFromFile/,
        /filePath: string/,
        /Promise<string \| null>/,
        /package root|gốc package/i,
        /signature|header/i,
        /null/,
        /does not decode|không decode/i,
        /not[^.]*filename extension|không[^.]*extension của filename/i,
      ],
      `${locale} API image MIME detection`,
      { heading: headings[locale], minWords: 70, fenceLanguages: ["ts"] },
    );
    assertImageMimeDetectionSemantics(
      section.body,
      `${locale} API image MIME detection`,
    );
    structures.push(sectionStructure(section));
  }
  assert.deepEqual(structures[0], structures[1]);

  const mimeFixture =
    "`detectSupportedImageMimeTypeFromFile()` reads at most the first 4,100 bytes and detects exactly `image/jpeg`, `image/png` for non-animated PNG, `image/gif`, `image/webp`, and `image/bmp`. It returns `null` for unsupported or undetectable content. This detection does not decode the image and does not fully validate it.";
  assert.doesNotThrow(() =>
    assertImageMimeDetectionSemantics(mimeFixture, "synthetic MIME fixture"),
  );
  for (const [label, mutation] of [
    ["sniff bound", mimeFixture.replace("4,100", "41,000")],
    ["sentinel", mimeFixture.replace("`null`", "`undefined`")],
    ["supported set", mimeFixture.replace(", and `image/bmp`", "")],
    [
      "decode scope",
      mimeFixture.replace(
        "This detection does not decode the image and does not fully validate it.",
        "This detection fully decodes and validates the image.",
      ),
    ],
  ]) {
    assert.throws(
      () =>
        assertImageMimeDetectionSemantics(mutation, `mutated MIME ${label}`),
      /file MIME detector behavior|published supported MIME set|must use null/,
    );
  }
  for (const [label, mutation] of [
    [
      "removed",
      mimeFixture.replace("`image/png` for non-animated PNG", "`image/png`"),
    ],
    ["reversed", mimeFixture.replace("non-animated PNG", "animated PNG")],
  ]) {
    assert.throws(
      () =>
        assertImageMimeDetectionSemantics(
          mutation,
          `mutated ${label} PNG animation restriction`,
        ),
      /must restrict image\/png detection to non-animated PNG/,
    );
  }
});

test("Pi 0.85 custom Tool guidance preserves live cwd and authorization boundaries", async () => {
  const references = await readLocalizedContent("how-to/add-custom-tool.md");
  const headings = {
    en: "### Arguments, paths, commands, and secrets",
    vi: "### Đối số, đường dẫn, lệnh và secret",
  };
  const structures = [];

  for (const { locale, source } of references) {
    const section = extractMarkdownSection(
      source,
      headings[locale],
      `${locale} custom Tool live cwd guidance`,
    );
    assertCustomToolLiveCwdGuidance(
      section.body,
      `${locale} custom Tool live cwd guidance`,
    );
    structures.push(sectionStructure(section));
  }
  assert.deepEqual(structures[0], structures[1]);

  const customToolFixture =
    "At each live invocation, `bash`, `edit`, `find`, `grep`, `ls`, `read`, and `write` use `ctx.cwd`; the factory cwd is a fallback, so they are not permanently load-time bound. A custom Tool still owns authorization, and `ctx.cwd` does not make arbitrary paths safe.";
  assert.doesNotThrow(() =>
    assertCustomToolLiveCwdGuidance(
      customToolFixture,
      "synthetic custom Tool fixture",
    ),
  );
  assert.throws(
    () =>
      assertCustomToolLiveCwdGuidance(
        customToolFixture.replace(", `grep`", ""),
        "mutated custom Tool list",
      ),
    /exactly the affected built-in Tool set/,
  );
  assert.throws(
    () =>
      assertCustomToolLiveCwdGuidance(
        customToolFixture.replace(
          "A custom Tool still owns authorization, and `ctx.cwd` does not make arbitrary paths safe.",
          "A custom Tool may trust every path from `ctx.cwd`.",
        ),
        "mutated custom Tool authorization",
      ),
    /authorization warning/,
  );
});

test("Tool and terminal pages use the current baseline metadata", async () => {
  const paths = [
    "ch05-tool-system.md",
    "how-to/add-custom-tool.md",
    "reference/api.md",
    "reference/configuration.md",
    "reference/environment-variables.md",
  ];
  const release = await readReleaseFixture();

  for (const relativePath of paths) {
    for (const { locale, source } of await readLocalizedContent(relativePath)) {
      assertNoMisleadingWriteByteCount(source, `${locale} ${relativePath}`);
      assert.doesNotMatch(
        source,
        /0\.84\.3|4e58f324fae8ebfa98a3d45181fb248072a2afac/,
        `${locale} ${relativePath} must not retain the previous baseline`,
      );
      assert.match(
        source,
        /last_updated:\s*["']2026-09-23["']/,
        `${locale} ${relativePath} must record the Pi 0.87.1 review date`,
      );
      const links = piSourceLinks([{ filename: relativePath, source }]);
      for (const { link } of links) {
        assert.ok(
          isPublishedReleaseSourceLink(link, release),
          `${locale} ${relativePath} must pin Pi source links to ${release.packageVersion}`,
        );
      }
    }
  }
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

test("Chapter 7 Extension catalogs specify the Pi 0.85 compaction-failure terminal contract", async () => {
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

test("Pi 0.85 Chapter 7 Extension catalogs define the coalesced UI prompt lifecycle", async () => {
  const chapters = await readLocalizedContent("ch07-event-driven.md");
  const headings = {
    en: "### Extension events form a separate contract",
    vi: "### Sự kiện Extension có hợp đồng riêng",
  };
  const structures = [];

  for (const { locale, source } of chapters) {
    const section = extractMarkdownSection(
      source,
      headings[locale],
      `${locale} Chapter 7 Extension prompt lifecycle`,
    );
    assertExtensionPromptLifecycle(
      section.body,
      `${locale} Chapter 7 Extension prompt lifecycle`,
    );
    structures.push(sectionStructure(section));
  }
  assert.deepEqual(structures[0], structures[1]);

  const promptFixture = `
type UIPromptKind = "select" | "confirm" | "input" | "editor" | "custom";
interface UIPromptStartEvent { type: "ui_prompt_start"; reason: "ui_prompt"; kind: UIPromptKind; title?: string; }
interface UIPromptEndEvent { type: "ui_prompt_end"; reason: "ui_prompt"; kind: UIPromptKind; title?: string; }

| Extension UI prompts | \`ui_prompt_start\`, \`ui_prompt_end\` |

\`ctx.ui.select()\`, \`ctx.ui.confirm()\`, \`ctx.ui.input()\`, \`ctx.ui.editor()\`, and \`ctx.ui.custom()\` emit \`ui_prompt_start\` and \`ui_prompt_end\` around the time Pi is waiting for the user.

Delivery is best-effort and not awaited. Nested or overlapping prompts are coalesced into one outer waiting span.

Notifications are scheduled around the outer blocking prompt span, but they are not an ordering barrier: an observer may run after the corresponding UI state transition.`;
  assert.doesNotThrow(() =>
    assertExtensionPromptLifecycle(promptFixture, "synthetic prompt fixture"),
  );
  for (const [label, mutation] of [
    ["missing kind", promptFixture.replace(' | "custom"', "")],
    ["wrong reason", promptFixture.replaceAll('"ui_prompt"', '"prompt"')],
    ["awaited", promptFixture.replace("not awaited", "awaited")],
    ["uncoalesced", promptFixture.replace("are coalesced", "remain separate")],
    [
      "ordering barrier",
      promptFixture.replace(
        "Notifications are scheduled around the outer blocking prompt span",
        "`ui_prompt_start` fires before Pi starts waiting and `ui_prompt_end` fires when Pi stops waiting",
      ),
    ],
  ]) {
    assert.throws(
      () =>
        assertExtensionPromptLifecycle(
          mutation,
          `mutated prompt lifecycle ${label}`,
        ),
      /UIPromptKind|UIPromptStartEvent|UIPromptEndEvent|prompt delivery and coalescing|prompt notification timing|ordering barriers/,
    );
  }
});

test("Pi 0.85 stream guides define RPC queue clearing and abort ordering", async () => {
  const guides = await readLocalizedContent("how-to/stream-output.md");
  const headings = {
    en: "## 4. Cancel an active run",
    vi: "## 4. Hủy lượt chạy đang hoạt động",
  };
  const structures = [];

  for (const { locale, source } of guides) {
    const section = extractMarkdownSection(
      source,
      headings[locale],
      `${locale} stream guide RPC queue lifecycle`,
    );
    assertRpcQueueLifecycle(
      section.body,
      `${locale} stream guide RPC queue lifecycle`,
    );
    assertParagraphContainsAll(
      section.body,
      [
        /transport-neutral|trung lập với transport/i,
        /JSON Lines/,
        /not[^.]*all providers[^.]*SSE|không[^.]*mọi provider[^.]*SSE/i,
      ],
      `${locale} stream guide transport boundary`,
    );
    structures.push(sectionStructure(section));
  }
  assert.deepEqual(structures[0], structures[1]);

  const rpcFixture = `
\`\`\`ts
{ id?: string; type: "clear_queue" }
{
  id?: string;
  type: "response";
  command: "clear_queue";
  success: true;
  data: { steering: string[]; followUp: string[] };
}
\`\`\`

RPC \`abort\` waits until idle and now cancels active manual compaction; queued work can continue unless \`clear_queue\` removes it.

For interactive Escape, send \`clear_queue\` before \`abort\`, then restore the returned steering and followUp text.

This event-consumption guidance is transport-neutral: RPC uses JSON Lines, and not all providers use SSE.`;
  assert.doesNotThrow(() =>
    assertRpcQueueLifecycle(rpcFixture, "synthetic RPC fixture"),
  );
  for (const [label, mutation] of [
    [
      "response field",
      rpcFixture.replace("followUp: string[]", "follow_up: string[]"),
    ],
    [
      "abort ordering",
      rpcFixture.replace(
        "`clear_queue` before `abort`",
        "`abort` before `clear_queue`",
      ),
    ],
    [
      "queue semantics",
      rpcFixture.replace(
        "queued work can continue",
        "queued work is discarded",
      ),
    ],
    [
      "compaction cancellation",
      rpcFixture.replace(
        "now cancels active manual compaction",
        "does not affect manual compaction",
      ),
    ],
  ]) {
    assert.throws(
      () => assertRpcQueueLifecycle(mutation, `mutated RPC lifecycle ${label}`),
      /response shape|abort, queue, and manual-compaction|interactive Escape ordering/,
    );
  }
});

test("Pi 0.85 API Extension guidance preserves session-scoped controls and editor status ownership", async () => {
  const references = await readLocalizedContent("reference/api.md");
  const headings = {
    en: "### Extensions and managed tools",
    vi: "### Extension và managed tool",
  };
  const localeContract = {
    en: {
      restored: /recorded[^.]*session history[^.]*restored[^.]*resumed/i,
      modelDefault:
        /does not change[^.]*`defaultProvider`[^.]*`defaultModel`[^.]*new sessions/i,
      effective: /effective[^.]*capability-clamped/i,
      differs: /only when[^.]*differs[^.]*current/i,
      records: /records|appends/i,
      notEveryRequest: /not every requested choice/i,
      persisted: /persists[^.]*restores[^.]*effective change/i,
      newSessionDefault:
        /does not change[^.]*configured default[^.]*new sessions/i,
      defaultEditor: /default editor[^.]*embeds[^.]*working indicator/i,
      customEditor: /custom editors[^.]*standalone[^.]*unless[^.]*opt in/i,
    },
    vi: {
      restored: /ghi[^.]*lịch sử session[^.]*khôi phục[^.]*resume/i,
      modelDefault:
        /không thay đổi[^.]*`defaultProvider`[^.]*`defaultModel`[^.]*session mới/i,
      effective: /mức hiệu lực[^.]*giới hạn[^.]*capability/i,
      differs: /chỉ khi[^.]*khác[^.]*hiện tại/i,
      records: /ghi|append/i,
      notEveryRequest: /không phải mọi lựa chọn được yêu cầu/i,
      persisted: /lưu[^.]*khôi phục[^.]*thay đổi có hiệu lực/i,
      newSessionDefault:
        /không thay đổi[^.]*default đã cấu hình[^.]*session mới/i,
      defaultEditor: /editor mặc định[^.]*nhúng[^.]*working indicator/i,
      customEditor: /custom editor[^.]*độc lập[^.]*trừ khi[^.]*opt in/i,
    },
  };
  const structures = [];

  for (const { locale, source } of references) {
    const section = assertContainsAll(
      source,
      [
        /`pi\.setModel\(\)`/,
        /`pi\.setThinkingLevel\(\)`/,
        /`CustomEditor`/,
        /\{ embedWorkingStatus: true \}/,
      ],
      `${locale} API Extension session controls`,
      { heading: headings[locale], minWords: 190 },
    );
    const contract = localeContract[locale];
    assertParagraphContainsAll(
      section.body,
      [/`pi\.setModel\(\)`/, contract.restored, contract.modelDefault],
      `${locale} API setModel session-default boundary`,
    );
    assertThinkingLevelSessionPersistence(
      section.body,
      contract,
      `${locale} API setThinkingLevel session-default boundary`,
    );
    assertParagraphContainsAll(
      section.body,
      [
        /`CustomEditor`/,
        /\{ embedWorkingStatus: true \}/,
        contract.defaultEditor,
        contract.customEditor,
      ],
      `${locale} API editor working-status ownership`,
    );
    structures.push(sectionStructure(section));
  }
  assert.deepEqual(structures[0], structures[1]);

  const thinkingFixture =
    "`pi.setThinkingLevel()` computes the effective capability-clamped level and records a session-history change only when it differs from the current value; not every requested choice produces a history entry. Pi persists and restores that effective change for this session, but does not change the configured default used by new sessions.";
  const fixtureContract = localeContract.en;
  assert.doesNotThrow(() =>
    assertThinkingLevelSessionPersistence(
      thinkingFixture,
      fixtureContract,
      "synthetic thinking-level fixture",
    ),
  );
  for (const [label, mutation] of [
    [
      "unchanged request",
      thinkingFixture.replace(
        "only when it differs from the current value",
        "for every request, even when it equals the current value",
      ),
    ],
    [
      "requested choice",
      thinkingFixture.replace(
        "persists and restores that effective change",
        "persists and restores every requested choice",
      ),
    ],
  ]) {
    assert.throws(
      () =>
        assertThinkingLevelSessionPersistence(
          mutation,
          fixtureContract,
          `mutated thinking-level persistence ${label}`,
        ),
      /effective thinking-level persistence/,
    );
  }
});

test("Pi 0.85 API reference records exact RPC clear_queue shapes and lifecycle", async () => {
  const references = await readLocalizedContent("reference/api.md");
  const headings = {
    en: "### RPC queue and cancellation",
    vi: "### Queue RPC và thao tác hủy",
  };
  const structures = [];

  for (const { locale, source } of references) {
    const section = extractMarkdownSection(
      source,
      headings[locale],
      `${locale} API RPC queue lifecycle`,
    );
    assertRpcQueueLifecycle(section.body, `${locale} API RPC queue lifecycle`);
    structures.push(sectionStructure(section));
  }
  assert.deepEqual(structures[0], structures[1]);
});

test("Pi 0.85 prompt and RPC pages use current source pins and review date", async () => {
  const release = await readReleaseFixture();
  const paths = [
    "ch07-event-driven.md",
    "how-to/stream-output.md",
    "reference/api.md",
  ];

  for (const relativePath of paths) {
    for (const { locale, source } of await readLocalizedContent(relativePath)) {
      assert.doesNotMatch(
        source,
        /0\.84\.3|4e58f324fae8ebfa98a3d45181fb248072a2afac/,
        `${locale} ${relativePath} must not retain the previous baseline`,
      );
      assert.match(
        source,
        /last_updated:\s*["']2026-09-04["']/,
        `${locale} ${relativePath} must record the Pi 0.85 review date`,
      );
      for (const { link } of piSourceLinks([
        { filename: relativePath, source },
      ])) {
        assert.ok(
          isPublishedReleaseSourceLink(link, release),
          `${locale} ${relativePath} must pin Pi source links to 0.85.0`,
        );
      }
    }
  }
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

test("both model guides bind Pi 0.85 compatibility flags to their exact interfaces and semantics", async () => {
  const documentContracts = [
    {
      path: "ch04-model-invocation.md",
      headings: {
        en: "### Reasoning levels and provider translation",
        vi: "### Reasoning level và phép chuyển đổi theo provider",
      },
    },
    {
      path: "how-to/plug-new-model.md",
      headings: {
        en: "## 7. Probe streaming, thinking, and Tools",
        vi: "## 7. Kiểm tra streaming, thinking và Tool",
      },
    },
  ];
  const localeContract = {
    en: {
      persists: /persists?[^.]*native[^.]*effort/i,
      reconstructs: /reconstructs?[^.]*effort-only system messages/i,
      midConvoDefault: /supportsMidConvoEffort[^.]*defaults? to `false`/i,
      exactTransport:
        /exact supported[^.]*model[^.]*faithful Anthropic Messages transport/i,
      notCompatible: /not[^.]*all Anthropic-compatible|not[^.]*merely imitate/i,
      lowerEarlier: /lower[^.]*handled earlier/i,
      serverDefault: /server default[^.]*`?0`?/i,
      offByDefault: /off by default/i,
      generatedCatalog:
        /not (?:set|generated)[^.]*generated (?:model )?catalog/i,
      maxOutputDefault: /supportsMaxOutputTokens[^.]*defaults? to `true`/i,
      disableMaxOutput:
        /set it to `false`[^.]*rejects?[^.]*`max_output_tokens`[^.]*omit/i,
    },
    vi: {
      persists: /lưu[^.]*effort native|duy trì[^.]*effort native/i,
      reconstructs: /khôi phục|dựng lại|tái tạo/i,
      midConvoDefault: /supportsMidConvoEffort[^.]*mặc định(?: là)? `false`/i,
      exactTransport:
        /chính xác[^.]*model[^.]*transport Anthropic Messages trung thực|đúng[^.]*model[^.]*transport Anthropic Messages trung thực/i,
      notCompatible:
        /không[^.]*mọi provider tương thích Anthropic|không[^.]*chỉ bắt chước/i,
      lowerEarlier: /giá trị thấp hơn[^.]*xử lý sớm hơn/i,
      serverDefault: /mặc định[^.]*server[^.]*`?0`?/i,
      offByDefault: /tắt theo mặc định/i,
      generatedCatalog: /không[^.]*generated (?:model )?catalog/i,
      maxOutputDefault: /supportsMaxOutputTokens[^.]*mặc định(?: là)? `true`/i,
      disableMaxOutput:
        /đặt thành `false`[^.]*từ chối[^.]*`max_output_tokens`[^.]*Pi[^.]*bỏ/i,
    },
  };

  for (const documentContract of documentContracts) {
    const documents = await readLocalizedContent(documentContract.path);
    const structures = [];
    for (const { locale, source } of documents) {
      const section = assertContainsAll(
        source,
        [
          /supportsMidConvoEffort/,
          /supportsMaxOutputTokens/,
          /vllmPriority/,
          /prefix_mismatch_behavior/,
          /"drop_block"/,
          /OpenAICompletionsCompat/,
          /OpenAIResponsesCompat/,
          /AnthropicMessagesCompat/,
          /--scheduling-policy priority/,
        ],
        `${locale} ${documentContract.path} Pi 0.85 compatibility guidance`,
        { heading: documentContract.headings[locale] },
      );
      const contract = localeContract[locale];
      assertParagraphContainsAll(
        section.body,
        [
          /supportsMidConvoEffort/,
          /AnthropicMessagesCompat/,
          contract.midConvoDefault,
          contract.exactTransport,
          contract.notCompatible,
        ],
        `${locale} ${documentContract.path} mid-conversation effort scope`,
      );
      assertParagraphContainsAll(
        section.body,
        [
          contract.persists,
          contract.reconstructs,
          /prefix_mismatch_behavior/,
          /"drop_block"/,
          /signed thinking/i,
        ],
        `${locale} ${documentContract.path} persistent effort recovery`,
      );
      assertParagraphContainsAll(
        section.body,
        [
          /vllmPriority/,
          /OpenAICompletionsCompat/,
          contract.lowerEarlier,
          /--scheduling-policy priority/,
          contract.serverDefault,
          contract.offByDefault,
          contract.generatedCatalog,
        ],
        `${locale} ${documentContract.path} vLLM priority semantics`,
      );
      assertParagraphContainsAll(
        section.body,
        [
          /supportsMaxOutputTokens/,
          /OpenAIResponsesCompat/,
          contract.maxOutputDefault,
          contract.disableMaxOutput,
        ],
        `${locale} ${documentContract.path} Responses output-token compatibility`,
      );
      structures.push(sectionStructure(section));
    }
    assert.deepEqual(structures[0], structures[1]);
  }
});

test("all model docs separate generated-catalog detection from verified custom-model configuration", async () => {
  const documentContracts = [
    {
      path: "ch04-model-invocation.md",
      headings: {
        en: "### Reasoning levels and provider translation",
        vi: "### Reasoning level và phép chuyển đổi theo provider",
      },
    },
    {
      path: "how-to/plug-new-model.md",
      headings: {
        en: "## 7. Probe streaming, thinking, and Tools",
        vi: "## 7. Kiểm tra streaming, thinking và Tool",
      },
    },
    {
      path: "reference/api.md",
      headings: {
        en: "### Model metadata",
        vi: "### Metadata của model",
      },
    },
  ];
  const localeContracts = {
    en: {
      automaticDetection: [
        /built-in models?[^.]*Pi 0\.87\.1 generated catalog/i,
        /automatic detection[^.]*lowercases `modelId` first[^.]*then strips/i,
        /only when `provider` is exactly `anthropic` or `openrouter`\./,
      ],
      customConfiguration: [
        /custom `Model`[^.]*`anthropic-messages`/i,
        /`compat\.supportsMidConvoEffort: true`/,
        /only after verifying[^.]*faithful Anthropic Messages transport[^.]*same exact compatible Claude model family/i,
        /provider name[^.]*outside[^.]*generated-catalog allowlist[^.]*does not by itself forbid manual configuration/i,
        /never generalize[^.]*arbitrary Anthropic-compatible providers or models/i,
      ],
      exactProviders:
        /only when `provider` is exactly `anthropic` or `openrouter`\./,
      overbroadProhibition:
        /Outside that Pi 0\.87\.1 provider\/ID set[^.]*do not manually opt in/i,
    },
    vi: {
      automaticDetection: [
        /model tích hợp sẵn[^.]*generated catalog của Pi 0\.87\.1/i,
        /automatic detection[^.]*chuyển `modelId` thành chữ thường trước[^.]*sau đó bỏ/i,
        /chỉ tự động bật[^.]*`provider` chính xác là `anthropic` hoặc `openrouter`\./i,
      ],
      customConfiguration: [
        /custom `Model`[^.]*`anthropic-messages`/i,
        /`compat\.supportsMidConvoEffort: true`/,
        /chỉ sau khi xác minh[^.]*transport Anthropic Messages là trung thực[^.]*model thuộc đúng Claude family tương thích nói trên/i,
        /provider name[^.]*nằm ngoài[^.]*allowlist của generated catalog[^.]*không tự nó cấm manual configuration/i,
        /không bao giờ khái quát[^.]*provider hoặc model tương thích Anthropic tùy ý/i,
      ],
      exactProviders:
        /chỉ tự động bật[^.]*`provider` chính xác là `anthropic` hoặc `openrouter`\./i,
      overbroadProhibition:
        /Ngoài tập provider\/ID của Pi 0\.87\.1[^.]*không bật thủ công/i,
    },
  };
  const exactIdPatterns = [
    "`^~?anthropic/`",
    "`^claude-opus-5(?:-\\d{8})?$`",
    "`^claude-(?:fable|mythos)-5(?:[.-]1)(?:-\\d{8})?$`",
    "`claude-opus-5`",
    "`claude-fable-5.1`",
    "`claude-fable-5-1`",
    "`claude-mythos-5.1`",
    "`claude-mythos-5-1`",
    "`-YYYYMMDD`",
  ];

  for (const documentContract of documentContracts) {
    for (const { locale, source } of await readLocalizedContent(
      documentContract.path,
    )) {
      const context = `${locale} ${documentContract.path} Claude effort support`;
      const section = extractMarkdownSection(
        source,
        documentContract.headings[locale],
        context,
      );
      const contract = localeContracts[locale];
      const automaticDetection = assertParagraphContainsAll(
        section.body,
        contract.automaticDetection,
        `${context} generated-catalog automatic detection`,
      );
      const customConfiguration = assertParagraphContainsAll(
        section.body,
        contract.customConfiguration,
        `${context} custom Model configuration`,
      );
      assert.notEqual(
        automaticDetection,
        customConfiguration,
        `${context} must keep automatic detection and manual configuration readable as separate blocks`,
      );
      assert.match(automaticDetection, contract.exactProviders, context);
      for (const fragment of exactIdPatterns) {
        assert.ok(
          section.body.includes(fragment),
          `${context} must include ${fragment}`,
        );
      }
      assert.doesNotMatch(
        section.body,
        contract.overbroadProhibition,
        `${context} must not treat the generated-catalog provider allowlist as a blanket manual-config prohibition`,
      );
    }
  }
});

test("both model guides record the Pi 0.87.1 review date in frontmatter", async () => {
  const guides = await readLocalizedContent("how-to/plug-new-model.md");

  for (const { locale, source } of guides) {
    const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(source);
    assert.ok(frontmatter, `${locale} model guide must contain frontmatter`);
    const reviewDates = [
      ...frontmatter[1].matchAll(
        /^last_updated:\s*["']?([^"'\r\n]+?)["']?\s*$/gm,
      ),
    ].map((match) => match[1]);

    assert.deepEqual(
      reviewDates,
      ["2026-09-23"],
      `${locale} model guide must record exactly one Pi 0.87.1 review date`,
    );
  }
});

test("both API locales distinguish published compatibility declarations from the internal settings shape", async () => {
  const references = await readLocalizedContent("reference/api.md");
  const declarations = [
    /interface OpenAICompletionsCompat \{[\s\S]*?vllmPriority\?: number;/,
    /interface OpenAIResponsesCompat \{[\s\S]*?supportsMaxOutputTokens\?: boolean;/,
    /interface AnthropicMessagesCompat \{[\s\S]*?supportsMidConvoEffort\?: boolean;/,
  ];
  const settingsSemantics = {
    en: {
      keyed: /keyed by `provider\/modelId`/i,
      saved: /`defaultThinkingLevel`[^.]*Ctrl\+S[^.]*`\/thinking`/i,
      distinct: /distinct from[^.]*provider request fields/i,
      recovery: /showCacheMissNotices[^.]*dropped Anthropic thinking blocks/i,
      maxOutputDefault: /supportsMaxOutputTokens[^.]*defaults? to `true`/i,
      midConvoDefault: /supportsMidConvoEffort[^.]*defaults? to `false`/i,
      internalSettings:
        /`Settings`[^.]*source-level[^.]*settings\.json[^.]*not (?:exported|importable)[^.]*`SettingsManager`[^.]*public/i,
    },
    vi: {
      keyed: /khóa `provider\/modelId`|key `provider\/modelId`/i,
      saved: /`defaultThinkingLevel`[^.]*Ctrl\+S[^.]*`\/thinking`/i,
      distinct: /tách biệt với[^.]*request field của provider/i,
      recovery: /showCacheMissNotices[^.]*thinking block Anthropic bị loại/i,
      maxOutputDefault: /supportsMaxOutputTokens[^.]*mặc định(?: là)? `true`/i,
      midConvoDefault: /supportsMidConvoEffort[^.]*mặc định(?: là)? `false`/i,
      internalSettings:
        /`Settings`[^.]*source-level[^.]*settings\.json[^.]*không (?:được export|thể import)[^.]*`SettingsManager`[^.]*public/i,
    },
  };
  const structures = [];

  for (const { locale, source } of references) {
    const section = assertContainsAll(
      source,
      declarations,
      `${locale} API compatibility declarations`,
      {
        heading:
          locale === "en" ? "### Model metadata" : "### Metadata của model",
      },
    );
    assertParagraphContainsAll(
      section.body,
      [/vllmPriority/, /OpenAICompletionsCompat/, /lower|thấp hơn/i],
      `${locale} API vLLM priority ownership`,
    );
    assertParagraphContainsAll(
      section.body,
      [
        /supportsMaxOutputTokens/,
        /OpenAIResponsesCompat/,
        settingsSemantics[locale].maxOutputDefault,
      ],
      `${locale} API Responses output-token ownership`,
    );
    assertParagraphContainsAll(
      section.body,
      [
        /supportsMidConvoEffort/,
        /AnthropicMessagesCompat/,
        settingsSemantics[locale].midConvoDefault,
      ],
      `${locale} API Anthropic effort ownership`,
    );
    structures.push(sectionStructure(section));

    const settingsSection = assertContainsAll(
      source,
      [
        /interface Settings \{[\s\S]*?defaultThinkingLevel\?: ThinkingLevel;[\s\S]*?modelThinkingLevels\?: Record<string, ThinkingLevel>;[\s\S]*?showCacheMissNotices\?: boolean;/,
        /class SettingsManager \{[\s\S]*?getDefaultThinkingLevel\(\): ThinkingLevel \| undefined;[\s\S]*?setDefaultThinkingLevel\(level: ThinkingLevel\): void;[\s\S]*?getModelThinkingLevel\(provider: string, modelId: string\): ThinkingLevel \| undefined;[\s\S]*?getAllModelThinkingLevels\(\): Record<string, ThinkingLevel>;[\s\S]*?setModelThinkingLevel\(provider: string, modelId: string, level: ThinkingLevel\): void;[\s\S]*?removeModelThinkingLevel\(provider: string, modelId: string\): void;/,
      ],
      `${locale} API settings declarations`,
      {
        heading:
          locale === "en"
            ? "### Persistence, settings, and resources"
            : "### Persistence, setting và resource",
      },
    );
    const semantics = settingsSemantics[locale];
    const settingsProse = settingsSection.body.replace(
      /^```[\s\S]*?^```/gm,
      "",
    );
    assert.doesNotMatch(
      settingsProse,
      /omitted members remain part of the published interfaces|những member bị lược vẫn thuộc các interface đã phát hành/i,
      `${locale} API must not present the source-level Settings shape as a published interface`,
    );
    assertParagraphContainsAll(
      settingsProse,
      [semantics.internalSettings],
      `${locale} API internal Settings versus public SettingsManager boundary`,
    );
    assertParagraphContainsAll(
      settingsSection.body,
      [/modelThinkingLevels/, semantics.keyed, /startup|khởi động/i],
      `${locale} API per-model thinking setting semantics`,
    );
    assertParagraphContainsAll(
      settingsSection.body,
      [/defaultThinkingLevel/, semantics.saved, semantics.distinct],
      `${locale} API global thinking setting semantics`,
    );
    assertParagraphContainsAll(
      settingsSection.body,
      [/showCacheMissNotices/, semantics.recovery],
      `${locale} API provider recovery notice semantics`,
    );
    structures.push(sectionStructure(settingsSection));
  }
  assert.deepEqual(structures[0], structures[2]);
  assert.deepEqual(structures[1], structures[3]);
});

test("both settings references distinguish global and per-model thinking defaults and recovery notices", async () => {
  const references = await readLocalizedContent("reference/configuration.md");
  const localeContract = {
    en: {
      keyed: /keyed by `provider\/modelId`/i,
      saved: /`defaultThinkingLevel`[^.]*saved[^.]*Ctrl\+S[^.]*`\/thinking`/i,
      distinct: /distinct from[^.]*provider request fields/i,
      recovery:
        /provider recovery diagnostics[^.]*dropped Anthropic thinking blocks/i,
    },
    vi: {
      keyed: /khóa `provider\/modelId`|key `provider\/modelId`/i,
      saved: /`defaultThinkingLevel`[^.]*lưu[^.]*Ctrl\+S[^.]*`\/thinking`/i,
      distinct: /tách biệt với[^.]*request field của provider/i,
      recovery:
        /chẩn đoán phục hồi provider[^.]*thinking block Anthropic bị loại/i,
    },
  };
  const structures = [];

  for (const { locale, source } of references) {
    const contract = localeContract[locale];
    const section = assertContainsAll(
      source,
      [
        /modelThinkingLevels/,
        /defaultThinkingLevel/,
        /showCacheMissNotices/,
        contract.keyed,
        contract.saved,
        contract.distinct,
        contract.recovery,
      ],
      `${locale} configuration thinking persistence`,
      {
        heading:
          locale === "en" ? "### Model and thinking" : "### Model và thinking",
      },
    );
    assertParagraphContainsAll(
      section.body,
      [/modelThinkingLevels/, contract.keyed, /startup|khởi động/i],
      `${locale} per-model startup thinking levels`,
    );
    structures.push(sectionStructure(section));
  }
  assert.deepEqual(structures[0], structures[1]);
});

test("active docs do not present the renamed GoogleThinkingLevel identifier as current", async () => {
  const activeSources = await readActiveSources();
  const staleGoogleTypeMentions = activeSources
    .filter(({ source }) => /\bGoogleThinkingLevel\b/.test(source))
    .map(({ filename }) => filename);

  assert.deepEqual(staleGoogleTypeMentions, []);
});

test("known truncated-summary signatures use a focused positive and negative matrix", () => {
  const releasedClaims = [
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
  const unrelatedClaims = [
    "Compaction summaries use `getSummarizationFailure` for a length-stopped generation.",
    'For a compaction summary, `stopReason: "length"` is documented without a persistence claim.',
    "Compaction summary generation hit the token cap and the summary is incomplete.",
    "getSummarizationFailure applies elsewhere; this compaction summary is unaffected.",
    "getSummarizationFailure áp dụng ở nơi khác; bản tóm tắt compaction này không bị ảnh hưởng.",
    "Compaction does not truncate a single oversized Tool result at execution time.",
    "A truncated assistant response triggers compaction and one retry; it is not a compaction summary.",
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
  const releasedSourceFences = [
    "```ts\n// compaction summary\nconst failure = getSummarizationFailure(response);\n```",
    '```typescript\n// branch summary\nif (response.stopReason === "length") return failure;\n```',
  ];
  const allowedNonSourceFence =
    "```text\ncompaction summary: getSummarizationFailure(response)\n```";

  for (const claim of releasedClaims) {
    const [segment] = markdownSemanticSegments(claim);
    assert.equal(hasReleasedTruncatedSummarySignature(segment), true, claim);
  }
  for (const claim of unrelatedClaims) {
    const [segment] = markdownSemanticSegments(claim);
    assert.equal(hasReleasedTruncatedSummarySignature(segment), false, claim);
  }
  for (const source of releasedSourceFences) {
    const [segment] = markdownSemanticSegments(source);
    assert.equal(hasReleasedTruncatedSummarySignature(segment), true, source);
  }
  const [nonSourceSegment] = markdownSemanticSegments(allowedNonSourceFence);
  assert.equal(
    hasReleasedTruncatedSummarySignature(nonSourceSegment),
    false,
    allowedNonSourceFence,
  );
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

test("Chapter 3 preserves the Pi 0.85.0 post-turn steering order", async () => {
  const chapters = await readLocalizedContent("ch03-agent-loop.md");

  for (const { locale, source } of chapters) {
    const stopHookIndex = source.indexOf(
      "if (await config.shouldStopAfterTurn?.(lastCompletedTurn))",
    );
    const steeringAssignments = [
      ...source.matchAll(
        /pendingMessages = \(await config\.getSteeringMessages\?\.\(\)\) \|\| \[\];/g,
      ),
    ].map((match) => match.index);

    assert.notEqual(stopHookIndex, -1, `${locale} Chapter 3 stop hook`);
    assert.equal(
      steeringAssignments.length,
      2,
      `${locale} Chapter 3 must show preparation-time and post-turn steering polls`,
    );
    assert.ok(
      steeringAssignments[0] < stopHookIndex &&
        stopHookIndex < steeringAssignments[1],
      `${locale} Chapter 3 must poll steering after preparation and after the stop hook`,
    );
  }
});

test("stale baseline scanner permits its exact rejection-test literals", async () => {
  const previousCommit = [
    "4e58f324",
    "fae8ebfa",
    "98a3d451",
    "81fb2480",
    "72a2afac",
  ].join("");
  const previousReleaseFixture = ["pi-release-", "0843"].join("");
  const previousSdkFixture = ["pi-sdk-", "0843"].join("");
  const source = await readFile(new URL(import.meta.url), "utf8");

  assert.deepEqual(
    findStaleReleaseSurfaceFiles(
      [{ filename: "scripts/pi-release-contract.test.mjs", source }],
      {
        previousCommit,
        previousReleaseFixture,
        previousSdkFixture,
      },
    ),
    [],
  );
});

test("stale baseline scanner rejects marker-tagged values outside its allowlist", () => {
  const previousCommit = [
    "4e58f324",
    "fae8ebfa",
    "98a3d451",
    "81fb2480",
    "72a2afac",
  ].join("");
  const previousReleaseFixture = ["pi-release-", "0843"].join("");
  const previousSdkFixture = ["pi-sdk-", "0843"].join("");
  const legacyRejectionMarker = "stale-baseline-allow: rejected";

  assert.deepEqual(
    findStaleReleaseSurfaceFiles(
      [
        {
          filename: "scripts/unrelated-commit.mjs",
          source: `const pin = "${previousCommit}"; // ${legacyRejectionMarker}`,
        },
        {
          filename: "scripts/unrelated-release-fixture.mjs",
          source: `const fixture = "${previousReleaseFixture}.json"; // ${legacyRejectionMarker}`,
        },
        {
          filename: "scripts/unrelated-sdk-fixture.mjs",
          source: `const fixture = "${previousSdkFixture}.json"; // ${legacyRejectionMarker}`,
        },
        {
          filename: "scripts/pi-release-contract.test.mjs",
          source: `test("unrelated", () => { const pin = "${previousCommit}"; // ${legacyRejectionMarker}\n});`,
        },
      ],
      {
        previousCommit,
        previousReleaseFixture,
        previousSdkFixture,
      },
    ),
    [
      "scripts/pi-release-contract.test.mjs",
      "scripts/unrelated-commit.mjs",
      "scripts/unrelated-release-fixture.mjs",
      "scripts/unrelated-sdk-fixture.mjs",
    ],
  );
});

test("stale content scanner reports repository and Course README paths exactly", () => {
  const previousVersion = ["0", "84", "3"].join(".");
  const previousCommit = [
    "4e58f324",
    "fae8ebfa",
    "98a3d451",
    "81fb2480",
    "72a2afac",
  ].join("");

  assert.deepEqual(
    findStaleContentFiles(
      [
        { filename: "README.md", source: `Pi SDK ${previousVersion}` },
        {
          filename: "course/README.md",
          source: `Pi SDK ${previousVersion}`,
        },
        {
          filename: "content/en/guide.md",
          source: `Source commit: ${previousCommit}`,
        },
      ],
      {
        previousVersion,
        previousCommit,
        historicalChangelogHeading: "## 2026-08-26",
      },
    ),
    ["README.md", "content/en/guide.md", "course/README.md"],
  );
});

test("active documentation and release surfaces contain no stale Pi baseline", async () => {
  const previousVersion = ["0", "84", "3"].join(".");
  const previousCommit = [
    "4e58f324",
    "fae8ebfa",
    "98a3d451",
    "81fb2480",
    "72a2afac",
  ].join("");
  const previousReleaseFixture = ["pi-release-", "0843"].join("");
  const previousSdkFixture = ["pi-sdk-", "0843"].join("");
  const historicalChangelogHeading = "## 2026-08-26";
  const activeSources = await readActiveSources();
  const staleContentFiles = findStaleContentFiles(activeSources, {
    previousVersion,
    previousCommit,
    historicalChangelogHeading,
  });

  const releaseSurfaceURLs = [
    new URL("package.json", repositoryRoot),
    ...(await activeContentFiles(new URL("scripts/", repositoryRoot))),
    ...(await activeContentFiles(new URL("tests/fixtures/", repositoryRoot))),
  ];
  const releaseSurfaces = await Promise.all(
    releaseSurfaceURLs.map(async (fileURL) => ({
      filename: path.relative(repositoryRoot.pathname, fileURL.pathname),
      source: await readFile(fileURL, "utf8"),
    })),
  );
  const staleReleaseSurfaceFiles = findStaleReleaseSurfaceFiles(
    releaseSurfaces,
    {
      previousCommit,
      previousReleaseFixture,
      previousSdkFixture,
    },
  );

  assert.deepEqual(
    { staleContentFiles, staleReleaseSurfaceFiles },
    { staleContentFiles: [], staleReleaseSurfaceFiles: [] },
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
    tag: "v0.85.0",
    commit: "107d79f11072bbc8a3a757ed7fd69596bee7d68c",
    upstreamAuditCommit: "dcd461925db2edf69a43c8135db1180d418afd54",
  };
  const acceptedLinks = [
    "https://github.com/earendil-works/pi/blob/v0.85.0/packages/ai/src/index.ts",
    `https://github.com/badlogic/pi-mono/tree/${release.commit}/packages/agent`,
    `https://github.com/earendil-works/pi/commit/${release.commit}`,
  ];
  const rejectedLinks = [
    "https://github.com/earendil-works/pi/blob/main/docs/v0.84.3-notes.md",
    "https://github.com/earendil-works/pi/blob/v0.84.3/file.ts",
    "https://github.com/earendil-works/pi/blob/4e58f324fae8ebfa98a3d45181fb248072a2afac/file.ts",
    "https://github.com/earendil-works/pi/blob/v0.85.00/file.ts",
    `https://github.com/earendil-works/pi/blob/${release.upstreamAuditCommit}/file.ts`,
  ];

  assert.deepEqual(acceptedLinks.map(releaseSourceRef), [
    release.tag,
    release.commit,
    release.commit,
  ]);
  assert.deepEqual(rejectedLinks.map(releaseSourceRef), [
    "main",
    "v0.84.3",
    "4e58f324fae8ebfa98a3d45181fb248072a2afac",
    "v0.85.00",
    release.upstreamAuditCommit,
  ]);
  assert.deepEqual(
    acceptedLinks.map((link) => isPublishedReleaseSourceLink(link, release)),
    [true, true, true],
  );
  assert.deepEqual(
    rejectedLinks.map((link) => isPublishedReleaseSourceLink(link, release)),
    [false, false, false, false, false],
  );
});

test("detects invalid Pi source refs without a release version claim", () => {
  const release = {
    tag: "v0.85.0",
    commit: "107d79f11072bbc8a3a757ed7fd69596bee7d68c",
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

test("bilingual semantic source links pin the exact Pi 0.85 implementation ranges", async () => {
  const { commit } = await readReleaseFixture();
  const sourceBase = `https://github.com/earendil-works/pi/blob/${commit}/`;
  const contracts = [
    {
      path: "ch07-event-driven.md",
      links: [
        {
          label: /executePreparedToolCall/,
          target: `${sourceBase}packages/agent/src/agent-loop.ts#L677-L718`,
        },
        {
          label: /shouldTerminateToolBatch/,
          target: `${sourceBase}packages/agent/src/agent-loop.ts#L589-L590`,
        },
      ],
      staleFragments: ["#L670", "#L582-L584"],
    },
    {
      path: "ch08-context-engineering.md",
      links: [
        {
          label: /`read`/,
          target: `${sourceBase}packages/coding-agent/src/core/tools/read.ts#L151-L176`,
        },
        {
          label: /`grep`/,
          target: `${sourceBase}packages/coding-agent/src/core/tools/grep.ts#L285-L303`,
        },
      ],
      staleFragments: ["#L271-L317", "#L321-L361"],
    },
    {
      path: "ch09-compaction.md",
      links: [
        {
          label: /SDK|ghi đè/,
          target: `${sourceBase}packages/coding-agent/src/core/settings-manager.ts#L550-L553`,
        },
      ],
      staleFragments: ["#L546-L549"],
    },
  ];

  for (const contract of contracts) {
    for (const { locale, source } of await readLocalizedContent(
      contract.path,
    )) {
      const markdownLinks = [
        ...source.matchAll(/\[([^\]]+)]\((https:\/\/github\.com\/[^)]+)\)/g),
      ].map((match) => ({ label: match[1], target: match[2] }));
      for (const expected of contract.links) {
        assert.ok(
          markdownLinks.some(
            (link) =>
              expected.label.test(link.label) &&
              link.target === expected.target,
          ),
          `${locale} ${contract.path} must pin ${expected.target}`,
        );
      }
      for (const staleFragment of contract.staleFragments) {
        assert.ok(
          !source.includes(staleFragment),
          `${locale} ${contract.path} must not retain ${staleFragment}`,
        );
      }
    }
  }
});

test("0.85.0 source links point to the published tag or release commit", async () => {
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
      "0.85.0 claims require at least one source link pinned to the published tag or release commit",
    );
  }
});
