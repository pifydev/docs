import {
  access,
  lstat,
  mkdtemp,
  mkdir,
  readFile,
  realpath,
  rm,
  symlink,
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

test("documents finite file, process, output, argument, and time caps", () => {
  expect(COURSE_CODING_FILE_MAX_BYTES).toBe(65_536);
  expect(COURSE_NODE_SOURCE_MAX_BYTES).toBe(32_768);
  expect(COURSE_NODE_ARGUMENT_COUNT_MAX).toBe(64);
  expect(COURSE_NODE_ARGUMENT_MAX_BYTES).toBe(4_096);
  expect(COURSE_NODE_ARGUMENTS_TOTAL_MAX_BYTES).toBe(16_384);
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
