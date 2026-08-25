import {
  access,
  lstat,
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  realpath,
  rm,
  symlink,
  watch,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

import { afterEach, beforeEach, expect, test } from "vitest";

import {
  COURSE_CODING_FILE_MAX_BYTES,
  COURSE_NODE_ARGUMENT_COUNT_MAX,
  COURSE_NODE_ARGUMENT_MAX_BYTES,
  COURSE_NODE_ARGUMENTS_TOTAL_MAX_BYTES,
  COURSE_NODE_OUTPUT_MAX_BYTES,
  COURSE_NODE_SOURCE_MAX_BYTES,
  COURSE_NODE_TIMEOUT_MS,
  ToolRegistry,
  createNodeProcessTool,
  createReadTool,
  createWriteTool,
  executeToolCall,
  type CourseTool,
  type CourseToolCall,
  type CourseToolExecutionContext,
} from "../src/index";

const temporaryDirectories: string[] = [];
let workspace: string;

async function temporaryDirectory(prefix: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
}

beforeEach(async () => {
  workspace = await temporaryDirectory("pify-course-08-workspace-");
});

afterEach(async () => {
  while (temporaryDirectories.length > 0) {
    const directory = temporaryDirectories.pop();
    if (directory !== undefined) {
      await rm(directory, { recursive: true, force: true });
    }
  }
});

function call(
  name: string,
  argumentsValue: CourseToolCall["arguments"],
  id = `call-${name}-001`,
): CourseToolCall {
  return { type: "toolCall", id, name, arguments: argumentsValue };
}

function executionContext(
  signal = new AbortController().signal,
): CourseToolExecutionContext {
  return Object.freeze({ signal, toolCallId: "call-direct-001" });
}

function validatedInput<Input, Output>(
  tool: CourseTool<Input, Output>,
  input: unknown,
): Input {
  const validation = tool.validate(input);
  expect(validation).toMatchObject({ ok: true });
  if (!validation.ok) throw new Error(validation.error);
  return validation.value;
}

function parseToolContent(content: string): unknown {
  return JSON.parse(content) as unknown;
}

async function waitForFile(path: string): Promise<void> {
  for (let turn = 0; turn < 10_000; turn += 1) {
    try {
      await access(path);
      return;
    } catch {
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
  }
  throw new Error(`Timed out waiting for fixture file ${path}`);
}

async function replaceNextWriteTemporary(
  root: string,
  signal: AbortSignal,
  replace: (path: string) => Promise<void> = async (path) =>
    writeFile(path, "substituted temporary", "utf8"),
): Promise<string> {
  for await (const event of watch(root, { signal })) {
    const filename = event.filename;
    if (typeof filename !== "string" || !filename.includes(".pify-tmp-")) {
      continue;
    }
    const temporaryPath = join(root, filename);
    for (let turn = 0; turn < 10_000; turn += 1) {
      try {
        await rm(temporaryPath, { force: true });
        await replace(temporaryPath);
        return temporaryPath;
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code !== "EBUSY" && code !== "EPERM" && code !== "ENOENT") {
          throw error;
        }
        await new Promise<void>((resolve) => setImmediate(resolve));
      }
    }
    throw new Error("Could not replace the observed write temporary");
  }
  throw new Error("Temporary watcher ended before observing a write");
}

test("documents finite file, process, output, argument, and time caps", () => {
  expect(COURSE_CODING_FILE_MAX_BYTES).toBe(65_536);
  expect(COURSE_NODE_SOURCE_MAX_BYTES).toBe(32_768);
  expect(COURSE_NODE_ARGUMENT_COUNT_MAX).toBe(32);
  expect(COURSE_NODE_ARGUMENT_MAX_BYTES).toBe(2_048);
  expect(COURSE_NODE_ARGUMENTS_TOTAL_MAX_BYTES).toBe(8_192);
  expect(COURSE_NODE_OUTPUT_MAX_BYTES).toBe(32_768);
  expect(COURSE_NODE_TIMEOUT_MS).toBe(500);
});

test("reads and atomically writes relative UTF-8 files through the Tool layer", async () => {
  await mkdir(join(workspace, "notes"));
  await writeFile(join(workspace, "notes", "before.txt"), "xin chào", "utf8");
  const registry = new ToolRegistry([
    createReadTool(workspace),
    createWriteTool(workspace),
  ]);

  const readResult = await executeToolCall(
    registry,
    call("read_file", { path: "notes/before.txt" }),
    new AbortController().signal,
  );
  expect(readResult.isError).toBe(false);
  expect(parseToolContent(readResult.content)).toEqual({
    bytes: 9,
    content: "xin chào",
    path: "notes/before.txt",
  });

  const writeResult = await executeToolCall(
    registry,
    call("write_file", {
      path: "generated/nested/result.txt",
      content: "Pi ✓",
    }),
    new AbortController().signal,
  );
  expect(writeResult.isError).toBe(false);
  expect(parseToolContent(writeResult.content)).toEqual({
    bytes: 6,
    path: "generated/nested/result.txt",
  });
  expect(
    await readFile(
      join(workspace, "generated", "nested", "result.txt"),
      "utf8",
    ),
  ).toBe("Pi ✓");
  expect(await readFile(join(workspace, "notes", "before.txt"), "utf8")).toBe(
    "xin chào",
  );

  const generatedEntries = await import("node:fs/promises").then(
    ({ readdir }) => readdir(join(workspace, "generated", "nested")),
  );
  expect(generatedEntries).toEqual(["result.txt"]);
});

test("rejects traversal and absolute paths across POSIX, Windows, mixed, UNC, and device forms", async () => {
  const registry = new ToolRegistry([createReadTool(workspace)]);
  const invalidPaths = [
    "../outside.txt",
    "..\\outside.txt",
    "nested/../../outside.txt",
    "nested\\..\\..\\outside.txt",
    "/tmp/outside.txt",
    "\\tmp\\outside.txt",
    "C:\\temp\\outside.txt",
    "C:/temp/outside.txt",
    "C:relative.txt",
    "\\\\server\\share\\outside.txt",
    "\\\\?\\C:\\outside.txt",
    "\\\\.\\pipe\\outside",
  ];

  for (let index = 0; index < invalidPaths.length; index += 1) {
    const result = await executeToolCall(
      registry,
      call("read_file", { path: invalidPaths[index] }, `call-invalid-${index}`),
      new AbortController().signal,
    );
    expect(result.isError).toBe(true);
    expect(parseToolContent(result.content)).toMatchObject({
      error: {
        code: "TOOL_ARGUMENTS_INVALID",
        message: "INVALID_RELATIVE_PATH",
      },
    });
  }
});

test("rejects Windows ADS and colon path components before filesystem effects", async () => {
  const registry = new ToolRegistry([
    createReadTool(workspace),
    createWriteTool(workspace),
  ]);
  const invalidPaths = [
    "file.txt:secret",
    "nested/file:ads",
    "nested\\file:ads",
    "C:drive-relative.txt",
    "\\\\?\\C:\\device.txt",
    "\\\\.\\C:\\device.txt",
    "CON",
    "nested/NUL.txt",
    "COM1.log",
    "nested/LPT9",
    "trailing-dot.",
    "trailing-space ",
  ];

  for (let index = 0; index < invalidPaths.length; index += 1) {
    for (const [name, argumentsValue] of [
      ["read_file", { path: invalidPaths[index] }],
      ["write_file", { path: invalidPaths[index], content: "blocked" }],
    ] as const) {
      const result = await executeToolCall(
        registry,
        call(name, argumentsValue, `call-colon-${name}-${index}`),
        new AbortController().signal,
      );
      expect(parseToolContent(result.content)).toMatchObject({
        error: {
          code: "TOOL_ARGUMENTS_INVALID",
          message: "INVALID_RELATIVE_PATH",
        },
      });
    }
  }
  expect(
    (await readdir(workspace)).filter((entry) => entry.includes(".pify-tmp-")),
  ).toEqual([]);
});

test("rejects symlink escapes for reads and writes", async () => {
  const outside = await temporaryDirectory("pify-course-08-outside-");
  await writeFile(join(outside, "secret.txt"), "outside", "utf8");
  const linkPath = join(workspace, "escape");
  try {
    await symlink(
      outside,
      linkPath,
      process.platform === "win32" ? "junction" : "dir",
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EPERM") return;
    throw error;
  }
  const registry = new ToolRegistry([
    createReadTool(workspace),
    createWriteTool(workspace),
  ]);

  for (const [name, args] of [
    ["read_file", { path: "escape/secret.txt" }],
    ["write_file", { path: "escape/new.txt", content: "blocked" }],
  ] as const) {
    const result = await executeToolCall(
      registry,
      call(name, args),
      new AbortController().signal,
    );
    expect(result.isError).toBe(true);
    expect(parseToolContent(result.content)).toMatchObject({
      error: {
        code: "TOOL_EXECUTION_FAILED",
        message: "PATH_OUTSIDE_WORKSPACE",
      },
    });
  }
  await expect(access(join(outside, "new.txt"))).rejects.toMatchObject({
    code: "ENOENT",
  });
});

test("canonicalizes a directory symlink root and rejects file or missing roots", async () => {
  const rootLink = join(
    await temporaryDirectory("pify-course-08-root-link-"),
    "root",
  );
  try {
    await symlink(
      workspace,
      rootLink,
      process.platform === "win32" ? "junction" : "dir",
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EPERM") throw error;
  }
  if (
    await lstat(rootLink).then(
      () => true,
      () => false,
    )
  ) {
    await writeFile(join(workspace, "linked.txt"), "linked", "utf8");
    const linkedTool = createReadTool(rootLink);
    const result = await linkedTool.execute(
      validatedInput(linkedTool, { path: "linked.txt" }),
      executionContext(),
    );
    expect(result.content).toBe("linked");
  }

  const rootFile = join(workspace, "not-a-directory.txt");
  await writeFile(rootFile, "file", "utf8");
  expect(() => createReadTool(rootFile)).toThrowError(
    "WORKSPACE_ROOT_NOT_DIRECTORY",
  );
  expect(() => createWriteTool(join(workspace, "missing-root"))).toThrowError(
    "WORKSPACE_ROOT_NOT_FOUND",
  );
});

test("enforces UTF-8 byte caps without changing an existing destination", async () => {
  const writeTool = createWriteTool(workspace);
  const readTool = createReadTool(workspace);
  const boundary = "🙂".repeat(COURSE_CODING_FILE_MAX_BYTES / 4);
  const target = join(workspace, "boundary.txt");

  await writeTool.execute(
    validatedInput(writeTool, { path: "boundary.txt", content: boundary }),
    executionContext(),
  );
  await expect(
    readTool.execute(
      validatedInput(readTool, { path: "boundary.txt" }),
      executionContext(),
    ),
  ).resolves.toMatchObject({
    bytes: COURSE_CODING_FILE_MAX_BYTES,
    content: boundary,
  });

  const validation = writeTool.validate({
    path: "boundary.txt",
    content: `${boundary}a`,
  });
  expect(validation).toEqual({ ok: false, error: "FILE_TOO_LARGE" });
  expect(await readFile(target, "utf8")).toBe(boundary);

  await writeFile(
    join(workspace, "oversized.txt"),
    Buffer.alloc(COURSE_CODING_FILE_MAX_BYTES + 1, 0x61),
  );
  await expect(
    readTool.execute(
      validatedInput(readTool, { path: "oversized.txt" }),
      executionContext(),
    ),
  ).rejects.toThrowError("FILE_TOO_LARGE");
});

test("keeps the destination and cleans temporary siblings when atomic rename fails", async () => {
  const writeTool = createWriteTool(workspace);
  const destination = join(workspace, "destination");
  await mkdir(destination);
  await writeFile(join(destination, "keep.txt"), "keep", "utf8");

  await expect(
    writeTool.execute(
      validatedInput(writeTool, {
        path: "destination",
        content: "replacement",
      }),
      executionContext(),
    ),
  ).rejects.toThrow();
  expect(await readFile(join(destination, "keep.txt"), "utf8")).toBe("keep");
  const parentEntries = await import("node:fs/promises").then(({ readdir }) =>
    readdir(workspace),
  );
  expect(parentEntries.filter((entry) => entry.includes(".pify-tmp-"))).toEqual(
    [],
  );
});

test("serializes concurrent writes to one canonical target on Windows-compatible filesystems", async () => {
  const tools = [createWriteTool(workspace), createWriteTool(workspace)];
  const first = "A".repeat(COURSE_CODING_FILE_MAX_BYTES);
  const second = "B".repeat(COURSE_CODING_FILE_MAX_BYTES);
  const inputs = [first, second, first, second, first, second];

  const results = await Promise.all(
    inputs.map((content, index) => {
      const tool = tools[index % tools.length];
      return tool.execute(
        validatedInput(tool, { path: "shared.txt", content }),
        executionContext(),
      );
    }),
  );

  expect(results).toHaveLength(inputs.length);
  const finalContent = await readFile(join(workspace, "shared.txt"), "utf8");
  expect(inputs).toContain(finalContent);
  expect(finalContent).toHaveLength(COURSE_CODING_FILE_MAX_BYTES);
  expect(
    (await readdir(workspace)).filter((entry) => entry.includes(".pify-tmp-")),
  ).toEqual([]);
});

test("rejects a substituted temporary file instead of committing attacker content", async () => {
  const tool = createWriteTool(workspace);
  const watcherController = new AbortController();
  const replacement = replaceNextWriteTemporary(
    workspace,
    watcherController.signal,
  );
  const pending = tool.execute(
    validatedInput(tool, {
      path: "identity.txt",
      content: "trusted".repeat(8_000),
    }),
    executionContext(),
  );

  try {
    await replacement;
    await expect(pending).rejects.toThrowError("WRITE_TEMP_IDENTITY_CHANGED");
  } finally {
    watcherController.abort();
    await pending.catch(() => undefined);
  }
  await expect(access(join(workspace, "identity.txt"))).rejects.toMatchObject({
    code: "ENOENT",
  });
  expect(
    (await readdir(workspace)).filter((entry) => entry.includes(".pify-tmp-")),
  ).toEqual([]);
});

test("rejects symlink and junction substitutions at the temporary pathname", async () => {
  const variants: Array<
    Readonly<{
      name: string;
      prepare: () => Promise<(path: string) => Promise<void>>;
    }>
  > = [
    {
      name: "symlink",
      async prepare() {
        const source = join(workspace, "symlink-source.txt");
        const probe = join(workspace, "symlink-probe.txt");
        await writeFile(source, "outside temporary", "utf8");
        await symlink(source, probe, "file");
        await rm(probe, { force: true });
        return async (path) => symlink(source, path, "file");
      },
    },
    {
      name: "junction",
      async prepare() {
        const source = join(workspace, "junction-source");
        await mkdir(source);
        return async (path) => symlink(source, path, "junction");
      },
    },
  ];

  for (const variant of variants) {
    let replace: (path: string) => Promise<void>;
    try {
      replace = await variant.prepare();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EPERM") continue;
      throw error;
    }
    const tool = createWriteTool(workspace);
    const watcherController = new AbortController();
    const replacement = replaceNextWriteTemporary(
      workspace,
      watcherController.signal,
      replace,
    );
    const target = `identity-${variant.name}.txt`;
    const pending = tool.execute(
      validatedInput(tool, {
        path: target,
        content: "trusted".repeat(8_000),
      }),
      executionContext(),
    );
    try {
      await replacement;
      const failure = await pending.then(
        () => new Error("write unexpectedly succeeded"),
        (error: unknown) => error,
      );
      expect(failure, variant.name).toMatchObject({
        message: "WRITE_TEMP_IDENTITY_CHANGED",
      });
    } finally {
      watcherController.abort();
      await pending.catch(() => undefined);
    }
    await expect(access(join(workspace, target))).rejects.toMatchObject({
      code: "ENOENT",
    });
    expect(
      (await readdir(workspace)).filter((entry) =>
        entry.includes(".pify-tmp-"),
      ),
    ).toEqual([]);
  }
});

test("runs only JavaScript source with an argument array in the canonical workspace", async () => {
  const tool = createNodeProcessTool(workspace);
  const source = [
    "process.stdout.write(JSON.stringify({",
    "  execPath: process.execPath,",
    "  args: process.argv.slice(1),",
    "  cwd: process.cwd(),",
    "}));",
    "process.stderr.write('diagnostic');",
  ].join("\n");
  const output = await tool.execute(
    validatedInput(tool, { source, arguments: ["alpha", "two words"] }),
    executionContext(),
  );

  expect(output.exitCode).toBe(0);
  expect(output.signal).toBeNull();
  expect(output.stderr).toBe("diagnostic");
  expect(output.timedOut).toBe(false);
  expect(output.stdoutTruncated).toBe(false);
  expect(output.stderrTruncated).toBe(false);
  expect(JSON.parse(output.stdout)).toEqual({
    execPath: process.execPath,
    args: ["alpha", "two words"],
    cwd: await realpath(workspace),
  });
});

test("validates Node source and argument caps before spawning", () => {
  const tool = createNodeProcessTool(workspace);
  expect(
    tool.validate({
      source: "a".repeat(COURSE_NODE_SOURCE_MAX_BYTES + 1),
      arguments: [],
    }),
  ).toEqual({ ok: false, error: "NODE_SOURCE_TOO_LARGE" });
  expect(
    tool.validate({
      source: "",
      arguments: Array.from(
        { length: COURSE_NODE_ARGUMENT_COUNT_MAX + 1 },
        () => "x",
      ),
    }),
  ).toEqual({ ok: false, error: "TOO_MANY_NODE_ARGUMENTS" });
  expect(
    tool.validate({
      source: "",
      arguments: ["a".repeat(COURSE_NODE_ARGUMENT_MAX_BYTES + 1)],
    }),
  ).toEqual({ ok: false, error: "NODE_ARGUMENT_TOO_LARGE" });
  expect(
    tool.validate({
      source: "",
      arguments: Array.from(
        {
          length:
            COURSE_NODE_ARGUMENTS_TOTAL_MAX_BYTES /
              COURSE_NODE_ARGUMENT_MAX_BYTES +
            1,
        },
        () => "a".repeat(COURSE_NODE_ARGUMENT_MAX_BYTES),
      ),
    }),
  ).toEqual({ ok: false, error: "NODE_ARGUMENTS_TOO_LARGE" });
  expect(tool.validate({ source: "", arguments: "--help" })).toEqual({
    ok: false,
    error: "INVALID_NODE_PROCESS_INPUT",
  });
});

test("launches exact accepted source and argument boundaries through a temporary script", async () => {
  const tool = createNodeProcessTool(workspace);
  const expectedLengths = Array.from(
    {
      length:
        COURSE_NODE_ARGUMENTS_TOTAL_MAX_BYTES / COURSE_NODE_ARGUMENT_MAX_BYTES,
    },
    () => COURSE_NODE_ARGUMENT_MAX_BYTES,
  );
  const argumentsValue = expectedLengths.map((length) =>
    ' \\"'.repeat(Math.ceil(length / 3)).slice(0, length),
  );
  const program =
    "process.stdout.write(JSON.stringify(process.argv.slice(-" +
    String(argumentsValue.length) +
    ").map((value) => value.length)));";
  const source = `${program}${" ".repeat(
    COURSE_NODE_SOURCE_MAX_BYTES - Buffer.byteLength(program, "utf8"),
  )}`;

  const output = await tool.execute(
    validatedInput(tool, { source, arguments: argumentsValue }),
    executionContext(),
  );

  expect(output.exitCode).toBe(0);
  expect(JSON.parse(output.stdout)).toEqual(expectedLengths);
  expect(
    (await readdir(workspace)).filter((entry) => entry.includes(".pify-node-")),
  ).toEqual([]);
});

test("bounds stdout and stderr independently at UTF-8 byte boundaries", async () => {
  const tool = createNodeProcessTool(workspace);
  const output = await tool.execute(
    validatedInput(tool, {
      source: [
        `process.stdout.write('a'.repeat(${COURSE_NODE_OUTPUT_MAX_BYTES + 100}));`,
        `process.stderr.write('🙂'.repeat(${COURSE_NODE_OUTPUT_MAX_BYTES / 4 + 10}));`,
      ].join("\n"),
      arguments: [],
    }),
    executionContext(),
  );

  expect(Buffer.byteLength(output.stdout, "utf8")).toBe(
    COURSE_NODE_OUTPUT_MAX_BYTES,
  );
  expect(Buffer.byteLength(output.stderr, "utf8")).toBe(
    COURSE_NODE_OUTPUT_MAX_BYTES,
  );
  expect(output.stdoutTruncated).toBe(true);
  expect(output.stderrTruncated).toBe(true);
  expect(output.stdout.endsWith("a")).toBe(true);
  expect(output.stderr.endsWith("🙂")).toBe(true);
});

test("returns stable structured output for a nonzero Node exit", async () => {
  const tool = createNodeProcessTool(workspace);
  const output = await tool.execute(
    validatedInput(tool, {
      source: "process.stderr.write('failed'); process.exitCode = 7;",
      arguments: [],
    }),
    executionContext(),
  );

  expect(output).toMatchObject({
    exitCode: 7,
    signal: null,
    stdout: "",
    stderr: "failed",
    stdoutTruncated: false,
    stderrTruncated: false,
    timedOut: false,
  });
});

test("kills an in-flight Node process on cancellation before rejecting", async () => {
  const marker = "child-started.txt";
  const markerPath = join(workspace, marker);
  const controller = new AbortController();
  const reason = new Error("cancel checkpoint 08");
  const tool = createNodeProcessTool(workspace);
  const pending = tool.execute(
    validatedInput(tool, {
      source: [
        "const fs = require('node:fs');",
        `fs.writeFileSync(${JSON.stringify(marker)}, String(process.pid));`,
        "setInterval(() => {}, 1_000);",
      ].join("\n"),
      arguments: [],
    }),
    executionContext(controller.signal),
  );

  await waitForFile(markerPath);
  const pid = Number(await readFile(markerPath, "utf8"));
  controller.abort(reason);
  await expect(pending).rejects.toBe(reason);
  expect(() => process.kill(pid, 0)).toThrow();
  expect(
    (await readdir(workspace)).filter((entry) => entry.includes(".pify-node-")),
  ).toEqual([]);
});

test("kills timed-out Node processes and returns a stable Tool-layer error", async () => {
  const registry = new ToolRegistry([createNodeProcessTool(workspace)]);
  const result = await executeToolCall(
    registry,
    call("node_process", {
      source: "setInterval(() => {}, 1_000);",
      arguments: [],
    }),
    new AbortController().signal,
  );

  expect(result.isError).toBe(true);
  expect(parseToolContent(result.content)).toEqual({
    error: {
      code: "TOOL_EXECUTION_FAILED",
      message: "NODE_PROCESS_TIMEOUT",
    },
  });
  expect(
    (await readdir(workspace)).filter((entry) => entry.includes(".pify-node-")),
  ).toEqual([]);
});

test("timeout settles promptly when an exited parent leaves a descendant holding stdio", async () => {
  const tool = createNodeProcessTool(workspace);
  const source = [
    "const { spawn } = require('node:child_process');",
    "const descendant = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 1_500)'], {",
    "  stdio: ['ignore', 'inherit', 'inherit'],",
    "});",
    ...(process.platform === "win32" ? [] : ["descendant.unref();"]),
  ].join("\n");
  const startedAt = performance.now();

  await expect(
    tool.execute(
      validatedInput(tool, { source, arguments: [] }),
      executionContext(),
    ),
  ).rejects.toThrowError("NODE_PROCESS_TIMEOUT");

  expect(performance.now() - startedAt).toBeLessThan(
    COURSE_NODE_TIMEOUT_MS + 500,
  );
  expect(
    (await readdir(workspace)).filter((entry) => entry.includes(".pify-node-")),
  ).toEqual([]);
});

test("termination never skips cleanup merely because the direct child has exited", async () => {
  const source = await readFile(
    new URL("../src/coding-tools.ts", import.meta.url),
    "utf8",
  );
  expect(source).not.toMatch(
    /child\.exitCode !== null \|\| child\.signalCode !== null\) return/,
  );
});

test("rejects a deleted and recreated workspace root for every coding Tool", async () => {
  await writeFile(join(workspace, "before.txt"), "before", "utf8");
  const readTool = createReadTool(workspace);
  const writeTool = createWriteTool(workspace);
  const nodeTool = createNodeProcessTool(workspace);
  await rm(workspace, { recursive: true, force: true });
  await mkdir(workspace);
  await writeFile(join(workspace, "before.txt"), "replacement", "utf8");

  await expect(
    readTool.execute(
      validatedInput(readTool, { path: "before.txt" }),
      executionContext(),
    ),
  ).rejects.toThrowError("WORKSPACE_ROOT_CHANGED");
  await expect(
    writeTool.execute(
      validatedInput(writeTool, { path: "after.txt", content: "blocked" }),
      executionContext(),
    ),
  ).rejects.toThrowError("WORKSPACE_ROOT_CHANGED");
  await expect(
    nodeTool.execute(
      validatedInput(nodeTool, { source: "", arguments: [] }),
      executionContext(),
    ),
  ).rejects.toThrowError("WORKSPACE_ROOT_CHANGED");
  await expect(access(join(workspace, "after.txt"))).rejects.toMatchObject({
    code: "ENOENT",
  });
});

test("rejects a workspace root symlink repointed after Tool creation", async () => {
  const parent = await temporaryDirectory("pify-course-08-repoint-");
  const first = join(parent, "first");
  const second = join(parent, "second");
  const rootLink = join(parent, "root");
  await mkdir(first);
  await mkdir(second);
  await writeFile(join(first, "value.txt"), "first", "utf8");
  await writeFile(join(second, "value.txt"), "second", "utf8");
  try {
    await symlink(
      first,
      rootLink,
      process.platform === "win32" ? "junction" : "dir",
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EPERM") return;
    throw error;
  }
  const tool = createReadTool(rootLink);
  await rm(rootLink, { recursive: true, force: true });
  await symlink(
    second,
    rootLink,
    process.platform === "win32" ? "junction" : "dir",
  );

  await expect(
    tool.execute(
      validatedInput(tool, { path: "value.txt" }),
      executionContext(),
    ),
  ).rejects.toThrowError("WORKSPACE_ROOT_CHANGED");
});

test("rejects hostile input shapes without invoking accessors", () => {
  const readTool = createReadTool(workspace);
  const nodeTool = createNodeProcessTool(workspace);
  let pathReads = 0;
  const accessorInput = Object.defineProperty({}, "path", {
    enumerable: true,
    get() {
      pathReads += 1;
      return "safe.txt";
    },
  });
  const sparseArguments = ["first", "second"];
  delete sparseArguments[1];

  expect(readTool.validate(accessorInput)).toEqual({
    ok: false,
    error: "INVALID_READ_INPUT",
  });
  expect(pathReads).toBe(0);
  expect(nodeTool.validate({ source: "", arguments: sparseArguments })).toEqual(
    {
      ok: false,
      error: "INVALID_NODE_PROCESS_INPUT",
    },
  );
});

test("never leaves write temporaries or Node fixture artifacts after cleanup", async () => {
  const writeTool = createWriteTool(workspace);
  await writeTool.execute(
    validatedInput(writeTool, { path: "clean.txt", content: "clean" }),
    executionContext(),
  );
  const rootName = basename(workspace);
  expect(rootName).toMatch(/^pify-course-08-workspace-/);
  expect(await readFile(join(workspace, "clean.txt"), "utf8")).toBe("clean");
});
