import { constants as fsConstants, realpathSync, statSync } from "node:fs";
import {
  lstat,
  mkdir,
  open,
  realpath,
  rename,
  rm,
  stat,
} from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { spawn, type ChildProcessByStdio } from "node:child_process";
import { isAbsolute, join, posix, relative, win32 } from "node:path";
import type { Readable } from "node:stream";
import { types as nodeUtilTypes } from "node:util";

import type { CourseTool, CourseToolExecutionContext } from "./protocol";

/** Maximum UTF-8 bytes accepted by read_file and write_file. */
export const COURSE_CODING_FILE_MAX_BYTES = 65_536;
/** Maximum UTF-8 bytes accepted as node_process JavaScript source. */
export const COURSE_NODE_SOURCE_MAX_BYTES = 32_768;
/** Maximum number of arguments accepted by node_process. */
export const COURSE_NODE_ARGUMENT_COUNT_MAX = 64;
/** Maximum UTF-8 bytes accepted for one node_process argument. */
export const COURSE_NODE_ARGUMENT_MAX_BYTES = 4_096;
/** Maximum combined UTF-8 bytes accepted for node_process arguments. */
export const COURSE_NODE_ARGUMENTS_TOTAL_MAX_BYTES = 16_384;
/** Maximum bytes retained independently from stdout and stderr. */
export const COURSE_NODE_OUTPUT_MAX_BYTES = 32_768;
/** Fixed wall-clock ceiling for the deliberately small workshop process Tool. */
export const COURSE_NODE_TIMEOUT_MS = 500;

export type CourseReadToolInput = Readonly<{ path: string }>;
export type CourseReadToolOutput = Readonly<{
  path: string;
  content: string;
  bytes: number;
}>;
export type CourseWriteToolInput = Readonly<{
  path: string;
  content: string;
}>;
export type CourseWriteToolOutput = Readonly<{
  path: string;
  bytes: number;
}>;
export type CourseNodeProcessToolInput = Readonly<{
  source: string;
  arguments: readonly string[];
}>;
export type CourseNodeProcessToolOutput = Readonly<{
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  stdoutTruncated: boolean;
  stderrTruncated: boolean;
  timedOut: false;
}>;

type CanonicalWorkspace = Readonly<{ root: string }>;
type NormalizedPath = Readonly<{
  display: string;
  segments: readonly string[];
}>;

type OutputCollector = Readonly<{
  append: (chunk: Buffer | string) => void;
  finish: () => Readonly<{ text: string; truncated: boolean }>;
}>;

class CodingToolError extends Error {
  public readonly code: string;

  public constructor(code: string, options?: ErrorOptions) {
    super(code, options);
    this.name = "CodingToolError";
    this.code = code;
  }
}

export function createReadTool(
  root: string,
): CourseTool<CourseReadToolInput, CourseReadToolOutput> {
  const workspace = canonicalizeWorkspace(root);
  return Object.freeze({
    name: "read_file",
    description: `Read at most ${COURSE_CODING_FILE_MAX_BYTES} UTF-8 bytes from a workspace-relative file.`,
    validate(input: unknown) {
      const path = readExactStringRecord(input, ["path"]);
      if (path === undefined) {
        return { ok: false as const, error: "INVALID_READ_INPUT" };
      }
      const normalized = normalizeRelativePath(path);
      return normalized === undefined
        ? { ok: false as const, error: "INVALID_RELATIVE_PATH" }
        : {
            ok: true as const,
            value: Object.freeze({ path: normalized.display }),
          };
    },
    async execute(input, context) {
      throwIfAborted(context.signal);
      const normalized = requireNormalizedPath(input.path);
      const resolved = await resolveReadableFile(
        workspace,
        normalized,
        context.signal,
      );
      let handle: Awaited<ReturnType<typeof open>> | undefined;
      try {
        handle = await open(
          resolved,
          process.platform === "win32"
            ? fsConstants.O_RDONLY
            : fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW,
        );
        const metadata = await handle.stat();
        if (!metadata.isFile()) throw codingError("FILE_NOT_REGULAR");
        const currentResolved = await realpath(resolved);
        ensureInside(workspace.root, currentResolved);
        const currentMetadata = await stat(currentResolved);
        if (
          currentMetadata.dev !== metadata.dev ||
          currentMetadata.ino !== metadata.ino
        ) {
          throw codingError("PATH_CHANGED_DURING_READ");
        }
        if (metadata.size > COURSE_CODING_FILE_MAX_BYTES) {
          throw codingError("FILE_TOO_LARGE");
        }
        throwIfAborted(context.signal);
        const buffer = Buffer.alloc(COURSE_CODING_FILE_MAX_BYTES + 1);
        let bytes = 0;
        while (bytes < buffer.length) {
          throwIfAborted(context.signal);
          const result = await handle.read(
            buffer,
            bytes,
            buffer.length - bytes,
            bytes,
          );
          if (result.bytesRead === 0) break;
          bytes += result.bytesRead;
        }
        if (bytes > COURSE_CODING_FILE_MAX_BYTES) {
          throw codingError("FILE_TOO_LARGE");
        }
        throwIfAborted(context.signal);
        let content: string;
        try {
          content = new TextDecoder("utf-8", { fatal: true }).decode(
            buffer.subarray(0, bytes),
          );
        } catch (cause) {
          throw codingError("FILE_NOT_UTF8", cause);
        }
        return Object.freeze({ path: normalized.display, content, bytes });
      } catch (error) {
        propagateAbort(error, context.signal);
        throw normalizeOperationalError(error, "READ_FAILED");
      } finally {
        await handle?.close().catch(() => undefined);
      }
    },
  });
}

export function createWriteTool(
  root: string,
): CourseTool<CourseWriteToolInput, CourseWriteToolOutput> {
  const workspace = canonicalizeWorkspace(root);
  return Object.freeze({
    name: "write_file",
    description: `Atomically write at most ${COURSE_CODING_FILE_MAX_BYTES} UTF-8 bytes to a workspace-relative file.`,
    validate(input: unknown) {
      const values = readExactDataRecord(input, ["path", "content"]);
      if (
        values === undefined ||
        typeof values.path !== "string" ||
        typeof values.content !== "string"
      ) {
        return { ok: false as const, error: "INVALID_WRITE_INPUT" };
      }
      const normalized = normalizeRelativePath(values.path);
      if (normalized === undefined) {
        return { ok: false as const, error: "INVALID_RELATIVE_PATH" };
      }
      if (
        Buffer.byteLength(values.content, "utf8") > COURSE_CODING_FILE_MAX_BYTES
      ) {
        return { ok: false as const, error: "FILE_TOO_LARGE" };
      }
      return {
        ok: true as const,
        value: Object.freeze({
          path: normalized.display,
          content: values.content,
        }),
      };
    },
    async execute(input, context) {
      throwIfAborted(context.signal);
      const normalized = requireNormalizedPath(input.path);
      const bytes = Buffer.byteLength(input.content, "utf8");
      if (bytes > COURSE_CODING_FILE_MAX_BYTES) {
        throw codingError("FILE_TOO_LARGE");
      }
      let temporaryPath: string | undefined;
      let handle: Awaited<ReturnType<typeof open>> | undefined;
      try {
        const parent = await resolveWritableParent(
          workspace,
          normalized.segments.slice(0, -1),
          context.signal,
        );
        const target = join(parent, normalized.segments.at(-1) as string);
        await rejectSymlinkTarget(target, workspace);
        temporaryPath = join(
          parent,
          `.${normalized.segments.at(-1)}.pify-tmp-${process.pid}-${randomUUID()}`,
        );
        handle = await open(temporaryPath, "wx", 0o600);
        await handle.writeFile(input.content, "utf8");
        await handle.sync();
        await handle.close();
        handle = undefined;
        throwIfAborted(context.signal);
        await assertDirectoryInsideWorkspace(parent, workspace);
        await rejectSymlinkTarget(target, workspace);
        await rename(temporaryPath, target);
        temporaryPath = undefined;
        return Object.freeze({ path: normalized.display, bytes });
      } catch (error) {
        propagateAbort(error, context.signal);
        throw normalizeOperationalError(error, "WRITE_FAILED");
      } finally {
        await handle?.close().catch(() => undefined);
        if (temporaryPath !== undefined) {
          await rm(temporaryPath, { force: true }).catch(() => undefined);
        }
      }
    },
  });
}

export function createNodeProcessTool(
  root: string,
): CourseTool<CourseNodeProcessToolInput, CourseNodeProcessToolOutput> {
  const workspace = canonicalizeWorkspace(root);
  return Object.freeze({
    name: "node_process",
    description: `Run bounded JavaScript with process.execPath for at most ${COURSE_NODE_TIMEOUT_MS} ms. This is a process boundary, not a security sandbox.`,
    validate(input: unknown) {
      const values = readExactDataRecord(input, ["source", "arguments"]);
      if (values === undefined || typeof values.source !== "string") {
        return { ok: false as const, error: "INVALID_NODE_PROCESS_INPUT" };
      }
      if (
        Buffer.byteLength(values.source, "utf8") > COURSE_NODE_SOURCE_MAX_BYTES
      ) {
        return { ok: false as const, error: "NODE_SOURCE_TOO_LARGE" };
      }
      const argumentsSnapshot = snapshotStringArray(values.arguments);
      if (argumentsSnapshot === undefined) {
        return { ok: false as const, error: "INVALID_NODE_PROCESS_INPUT" };
      }
      if (argumentsSnapshot.length > COURSE_NODE_ARGUMENT_COUNT_MAX) {
        return { ok: false as const, error: "TOO_MANY_NODE_ARGUMENTS" };
      }
      let totalBytes = 0;
      for (let index = 0; index < argumentsSnapshot.length; index += 1) {
        const bytes = Buffer.byteLength(argumentsSnapshot[index], "utf8");
        if (bytes > COURSE_NODE_ARGUMENT_MAX_BYTES) {
          return { ok: false as const, error: "NODE_ARGUMENT_TOO_LARGE" };
        }
        totalBytes += bytes;
      }
      if (totalBytes > COURSE_NODE_ARGUMENTS_TOTAL_MAX_BYTES) {
        return { ok: false as const, error: "NODE_ARGUMENTS_TOO_LARGE" };
      }
      return {
        ok: true as const,
        value: Object.freeze({
          source: values.source,
          arguments: argumentsSnapshot,
        }),
      };
    },
    async execute(input, context) {
      throwIfAborted(context.signal);
      await assertCanonicalWorkspace(workspace);
      throwIfAborted(context.signal);
      return runNodeProcess(workspace, input, context);
    },
  });
}

function canonicalizeWorkspace(root: string): CanonicalWorkspace {
  if (typeof root !== "string" || root.length === 0 || root.includes("\0")) {
    throw codingError("INVALID_WORKSPACE_ROOT");
  }
  let canonical: string;
  try {
    canonical = realpathSync.native(root);
  } catch (cause) {
    const code = errnoCode(cause);
    throw codingError(
      code === "ENOENT" ? "WORKSPACE_ROOT_NOT_FOUND" : "INVALID_WORKSPACE_ROOT",
      cause,
    );
  }
  let metadata: ReturnType<typeof statSync>;
  try {
    metadata = statSync(canonical);
  } catch (cause) {
    throw codingError("INVALID_WORKSPACE_ROOT", cause);
  }
  if (!metadata.isDirectory())
    throw codingError("WORKSPACE_ROOT_NOT_DIRECTORY");
  return Object.freeze({ root: canonical });
}

function normalizeRelativePath(value: string): NormalizedPath | undefined {
  if (
    value.length === 0 ||
    value.includes("\0") ||
    isAbsolute(value) ||
    posix.isAbsolute(value) ||
    win32.isAbsolute(value) ||
    /^[A-Za-z]:/.test(value)
  ) {
    return undefined;
  }
  const portable = value.replaceAll("\\", "/");
  const rawSegments = portable.split("/");
  const segments: string[] = [];
  for (let index = 0; index < rawSegments.length; index += 1) {
    const segment = rawSegments[index];
    if (segment === "..") return undefined;
    if (segment === "" || segment === ".") continue;
    segments.push(segment);
  }
  if (segments.length === 0) return undefined;
  return Object.freeze({
    display: segments.join("/"),
    segments: Object.freeze(segments),
  });
}

function requireNormalizedPath(value: string): NormalizedPath {
  const normalized = normalizeRelativePath(value);
  if (normalized === undefined) throw codingError("INVALID_RELATIVE_PATH");
  return normalized;
}

async function resolveReadableFile(
  workspace: CanonicalWorkspace,
  path: NormalizedPath,
  signal: AbortSignal,
): Promise<string> {
  await assertCanonicalWorkspace(workspace);
  throwIfAborted(signal);
  const lexicalTarget = join(workspace.root, ...path.segments);
  try {
    const canonicalParent = await realpath(join(lexicalTarget, ".."));
    ensureInside(workspace.root, canonicalParent);
    const canonicalTarget = await realpath(lexicalTarget);
    ensureInside(workspace.root, canonicalTarget);
    const metadata = await stat(canonicalTarget);
    if (!metadata.isFile()) throw codingError("FILE_NOT_REGULAR");
    return canonicalTarget;
  } catch (error) {
    if (error instanceof CodingToolError) throw error;
    if (errnoCode(error) === "ENOENT")
      throw codingError("FILE_NOT_FOUND", error);
    throw codingError("READ_FAILED", error);
  }
}

async function resolveWritableParent(
  workspace: CanonicalWorkspace,
  segments: readonly string[],
  signal: AbortSignal,
): Promise<string> {
  await assertCanonicalWorkspace(workspace);
  let current = workspace.root;
  for (let index = 0; index < segments.length; index += 1) {
    throwIfAborted(signal);
    const candidate = join(current, segments[index]);
    try {
      await lstat(candidate);
    } catch (error) {
      if (errnoCode(error) !== "ENOENT") throw error;
      try {
        await mkdir(candidate);
      } catch (mkdirError) {
        if (errnoCode(mkdirError) !== "EEXIST") throw mkdirError;
      }
      await lstat(candidate);
    }
    const canonical = await realpath(candidate);
    ensureInside(workspace.root, canonical);
    const canonicalMetadata = await stat(canonical);
    if (!canonicalMetadata.isDirectory()) {
      throw codingError("WRITE_PARENT_NOT_DIRECTORY");
    }
    current = canonical;
  }
  await assertDirectoryInsideWorkspace(current, workspace);
  return current;
}

async function rejectSymlinkTarget(
  target: string,
  workspace: CanonicalWorkspace,
): Promise<void> {
  try {
    const metadata = await lstat(target);
    if (!metadata.isSymbolicLink()) return;
    const canonical = await realpath(target);
    ensureInside(workspace.root, canonical);
    throw codingError("WRITE_TARGET_SYMLINK");
  } catch (error) {
    if (errnoCode(error) === "ENOENT") return;
    throw error;
  }
}

async function assertCanonicalWorkspace(
  workspace: CanonicalWorkspace,
): Promise<void> {
  let current: string;
  try {
    current = await realpath(workspace.root);
  } catch (cause) {
    throw codingError("WORKSPACE_ROOT_CHANGED", cause);
  }
  if (!samePath(current, workspace.root)) {
    throw codingError("WORKSPACE_ROOT_CHANGED");
  }
  const metadata = await stat(current);
  if (!metadata.isDirectory()) throw codingError("WORKSPACE_ROOT_CHANGED");
}

async function assertDirectoryInsideWorkspace(
  directory: string,
  workspace: CanonicalWorkspace,
): Promise<void> {
  const canonical = await realpath(directory);
  ensureInside(workspace.root, canonical);
  const metadata = await stat(canonical);
  if (!metadata.isDirectory()) throw codingError("WRITE_PARENT_NOT_DIRECTORY");
}

function ensureInside(root: string, target: string): void {
  const pathFromRoot = relative(root, target);
  if (
    pathFromRoot === "" ||
    (!pathFromRoot.startsWith(`..${win32.sep}`) &&
      !pathFromRoot.startsWith(`..${posix.sep}`) &&
      pathFromRoot !== ".." &&
      !isAbsolute(pathFromRoot))
  ) {
    return;
  }
  throw codingError("PATH_OUTSIDE_WORKSPACE");
}

function samePath(left: string, right: string): boolean {
  return process.platform === "win32"
    ? left.toLocaleLowerCase("en-US") === right.toLocaleLowerCase("en-US")
    : left === right;
}

async function runNodeProcess(
  workspace: CanonicalWorkspace,
  input: CourseNodeProcessToolInput,
  context: CourseToolExecutionContext,
): Promise<CourseNodeProcessToolOutput> {
  const stdout = createOutputCollector();
  const stderr = createOutputCollector();
  let child: ChildProcessByStdio<null, Readable, Readable>;
  try {
    child = spawn(
      process.execPath,
      ["-e", input.source, "--", ...input.arguments],
      {
        cwd: workspace.root,
        detached: process.platform !== "win32",
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      },
    );
  } catch (cause) {
    throw codingError("NODE_PROCESS_START_FAILED", cause);
  }

  return new Promise<CourseNodeProcessToolOutput>((resolve, reject) => {
    let terminal: "abort" | "timeout" | "output" | "start" | undefined;
    let terminalReason: unknown;
    let settled = false;

    const cleanup = () => {
      clearTimeout(timer);
      context.signal.removeEventListener("abort", onAbort);
      child.removeListener("error", onChildError);
      child.removeListener("close", onClose);
      child.stdout.removeListener("data", onStdout);
      child.stdout.removeListener("error", onOutputError);
      child.stderr.removeListener("data", onStderr);
      child.stderr.removeListener("error", onOutputError);
    };
    const settleReject = (reason: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(reason);
    };
    const requestTermination = () => {
      if (child.exitCode !== null || child.signalCode !== null) return;
      try {
        if (process.platform !== "win32" && child.pid !== undefined) {
          process.kill(-child.pid, "SIGKILL");
        } else {
          child.kill("SIGKILL");
        }
      } catch {
        try {
          child.kill("SIGKILL");
        } catch {
          // The close/error event owns the terminal result.
        }
      }
    };
    const onAbort = () => {
      if (terminal !== undefined || settled) return;
      terminal = "abort";
      terminalReason =
        context.signal.reason ?? new DOMException("Aborted", "AbortError");
      requestTermination();
    };
    const onTimeout = () => {
      if (terminal !== undefined || settled) return;
      terminal = "timeout";
      requestTermination();
    };
    const onOutputError = (error: unknown) => {
      if (terminal !== undefined || settled) return;
      terminal = "output";
      terminalReason = codingError("NODE_PROCESS_OUTPUT_FAILED", error);
      requestTermination();
    };
    const onChildError = (error: unknown) => {
      if (terminal !== undefined) return;
      terminal = "start";
      terminalReason = codingError("NODE_PROCESS_START_FAILED", error);
      requestTermination();
    };
    const onStdout = (chunk: Buffer | string) => stdout.append(chunk);
    const onStderr = (chunk: Buffer | string) => stderr.append(chunk);
    const onClose = (
      exitCode: number | null,
      signal: NodeJS.Signals | null,
    ) => {
      if (settled) return;
      if (terminal === "abort") {
        settleReject(terminalReason);
        return;
      }
      if (terminal === "timeout") {
        settleReject(codingError("NODE_PROCESS_TIMEOUT"));
        return;
      }
      if (terminal === "output") {
        settleReject(terminalReason);
        return;
      }
      if (terminal === "start") {
        settleReject(terminalReason);
        return;
      }
      settled = true;
      cleanup();
      const standardOutput = stdout.finish();
      const standardError = stderr.finish();
      resolve(
        Object.freeze({
          exitCode,
          signal,
          stdout: standardOutput.text,
          stderr: standardError.text,
          stdoutTruncated: standardOutput.truncated,
          stderrTruncated: standardError.truncated,
          timedOut: false as const,
        }),
      );
    };

    child.stdout.on("data", onStdout);
    child.stdout.on("error", onOutputError);
    child.stderr.on("data", onStderr);
    child.stderr.on("error", onOutputError);
    child.once("error", onChildError);
    child.once("close", onClose);
    context.signal.addEventListener("abort", onAbort, { once: true });
    const timer = setTimeout(onTimeout, COURSE_NODE_TIMEOUT_MS);
    timer.unref();
    if (context.signal.aborted) onAbort();
  });
}

function createOutputCollector(): OutputCollector {
  const chunks: Buffer[] = [];
  let bytes = 0;
  let truncated = false;
  return Object.freeze({
    append(chunk: Buffer | string) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      const remaining = COURSE_NODE_OUTPUT_MAX_BYTES - bytes;
      if (remaining <= 0) {
        if (buffer.length > 0) truncated = true;
        return;
      }
      if (buffer.length > remaining) truncated = true;
      const retained = buffer.subarray(0, Math.min(buffer.length, remaining));
      if (retained.length > 0) {
        chunks.push(Buffer.from(retained));
        bytes += retained.length;
      }
    },
    finish() {
      const decoded = boundedUtf8Decode(Buffer.concat(chunks, bytes));
      if (decoded.truncated) truncated = true;
      return Object.freeze({
        text: decoded.text,
        truncated,
      });
    },
  });
}

function boundedUtf8Decode(buffer: Buffer): Readonly<{
  text: string;
  truncated: boolean;
}> {
  const decoded = buffer.toString("utf8");
  if (Buffer.byteLength(decoded, "utf8") <= COURSE_NODE_OUTPUT_MAX_BYTES) {
    return Object.freeze({ text: decoded, truncated: false });
  }
  const parts: string[] = [];
  let bytes = 0;
  for (const character of decoded) {
    const width = Buffer.byteLength(character, "utf8");
    if (bytes + width > COURSE_NODE_OUTPUT_MAX_BYTES) break;
    parts.push(character);
    bytes += width;
  }
  return Object.freeze({ text: parts.join(""), truncated: true });
}

function readExactStringRecord(
  value: unknown,
  keys: readonly string[],
): string | undefined {
  const record = readExactDataRecord(value, keys);
  if (record === undefined) return undefined;
  const field = record[keys[0]];
  return typeof field === "string" ? field : undefined;
}

function readExactDataRecord(
  value: unknown,
  keys: readonly string[],
): Readonly<Record<string, unknown>> | undefined {
  if (!isPlainRecord(value)) return undefined;
  let ownKeys: readonly PropertyKey[];
  try {
    ownKeys = Reflect.ownKeys(value);
  } catch {
    return undefined;
  }
  if (ownKeys.length !== keys.length) return undefined;
  const result: Record<string, unknown> = Object.create(null) as Record<
    string,
    unknown
  >;
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    if (!ownKeys.includes(key)) return undefined;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (
      descriptor === undefined ||
      !("value" in descriptor) ||
      descriptor.enumerable !== true
    ) {
      return undefined;
    }
    result[key] = descriptor.value;
  }
  return Object.freeze(result);
}

function snapshotStringArray(value: unknown): readonly string[] | undefined {
  if (!Array.isArray(value) || nodeUtilTypes.isProxy(value)) return undefined;
  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
  if (
    lengthDescriptor === undefined ||
    !("value" in lengthDescriptor) ||
    !Number.isSafeInteger(lengthDescriptor.value) ||
    lengthDescriptor.value < 0
  ) {
    return undefined;
  }
  const length = lengthDescriptor.value as number;
  const snapshot: string[] = [];
  for (let index = 0; index < length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (
      descriptor === undefined ||
      !("value" in descriptor) ||
      typeof descriptor.value !== "string"
    ) {
      return undefined;
    }
    snapshot.push(descriptor.value);
  }
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.length !== length + 1) return undefined;
  return Object.freeze(snapshot);
}

function isPlainRecord(value: unknown): value is object {
  if (
    typeof value !== "object" ||
    value === null ||
    nodeUtilTypes.isProxy(value) ||
    Array.isArray(value)
  ) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function throwIfAborted(signal: AbortSignal): void {
  if (!signal.aborted) return;
  throw signal.reason ?? new DOMException("Aborted", "AbortError");
}

function propagateAbort(error: unknown, signal: AbortSignal): void {
  if (signal.aborted) {
    throw signal.reason ?? new DOMException("Aborted", "AbortError");
  }
  if (isAbortError(error)) throw error;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function codingError(code: string, cause?: unknown): CodingToolError {
  return new CodingToolError(code, cause === undefined ? undefined : { cause });
}

function normalizeOperationalError(
  error: unknown,
  fallback: string,
): CodingToolError {
  return error instanceof CodingToolError
    ? error
    : codingError(fallback, error);
}

function errnoCode(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(value, "code");
  return descriptor !== undefined &&
    "value" in descriptor &&
    typeof descriptor.value === "string"
    ? descriptor.value
    : undefined;
}
