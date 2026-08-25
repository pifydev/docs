import { constants as fsConstants, realpathSync, statSync } from "node:fs";
import {
  lstat,
  mkdir,
  open,
  realpath,
  rename,
  rmdir,
  stat,
  unlink,
} from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { spawn, type ChildProcessByStdio } from "node:child_process";
import {
  isAbsolute,
  join,
  posix,
  relative,
  resolve as resolvePath,
  win32,
} from "node:path";
import type { Readable } from "node:stream";
import { types as nodeUtilTypes } from "node:util";

import type { CourseTool, CourseToolExecutionContext } from "./protocol";

/** Maximum UTF-8 bytes accepted by read_file and write_file. */
export const COURSE_CODING_FILE_MAX_BYTES = 65_536;
/** Maximum UTF-8 bytes accepted as node_process JavaScript source. */
export const COURSE_NODE_SOURCE_MAX_BYTES = 32_768;
/** Maximum number of arguments accepted by node_process. */
export const COURSE_NODE_ARGUMENT_COUNT_MAX = 32;
/** Maximum UTF-8 bytes accepted for one node_process argument. */
export const COURSE_NODE_ARGUMENT_MAX_BYTES = 2_048;
/** Maximum combined UTF-8 bytes accepted for node_process arguments. */
export const COURSE_NODE_ARGUMENTS_TOTAL_MAX_BYTES = 8_192;
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

type FileIdentity = Readonly<{
  device: number | bigint;
  inode: number | bigint;
}>;
type CanonicalWorkspace = Readonly<{
  entry: string;
  root: string;
  identity: FileIdentity;
}>;
type NormalizedPath = Readonly<{
  display: string;
  segments: readonly string[];
}>;

type OutputCollector = Readonly<{
  append: (chunk: Buffer | string) => void;
  finish: () => Readonly<{ text: string; truncated: boolean }>;
}>;

type WriteLockState = {
  tail: Promise<void>;
  pending: number;
};

const targetWriteLocks = new Map<string, WriteLockState>();

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
        await assertCanonicalWorkspace(workspace);
        const currentResolved = await realpath(resolved);
        ensureInside(workspace.root, currentResolved);
        const currentMetadata = await stat(currentResolved);
        if (
          !sameFileIdentity(
            identityFromStat(currentMetadata),
            identityFromStat(metadata),
          )
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
      try {
        const parent = await resolveWritableParent(
          workspace,
          normalized.segments.slice(0, -1),
          context.signal,
        );
        const target = join(parent, normalized.segments.at(-1) as string);
        return await withTargetWriteLock(target, context.signal, async () => {
          await writeAtomically(
            workspace,
            parent,
            target,
            normalized.segments.at(-1) as string,
            input.content,
            context,
          );
          return Object.freeze({ path: normalized.display, bytes });
        });
      } catch (error) {
        propagateAbort(error, context.signal);
        throw normalizeOperationalError(error, "WRITE_FAILED");
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
      if (!fitsPortableNodeCommand(workspace, argumentsSnapshot)) {
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
      let scriptPath: string | undefined;
      try {
        scriptPath = await createNodeScript(
          workspace,
          input.source,
          context.signal,
        );
        await assertCanonicalWorkspace(workspace);
        throwIfAborted(context.signal);
        return await runNodeProcess(
          workspace,
          scriptPath,
          input.arguments,
          context,
        );
      } catch (error) {
        propagateAbort(error, context.signal);
        throw normalizeOperationalError(error, "NODE_PROCESS_FAILED");
      } finally {
        if (scriptPath !== undefined) {
          await removeTemporaryFile(scriptPath, "NODE_SCRIPT_CLEANUP_FAILED");
        }
      }
    },
  });
}

async function createNodeScript(
  workspace: CanonicalWorkspace,
  source: string,
  signal: AbortSignal,
): Promise<string> {
  if (Buffer.byteLength(source, "utf8") > COURSE_NODE_SOURCE_MAX_BYTES) {
    throw codingError("NODE_SOURCE_TOO_LARGE");
  }
  const scriptPath = join(workspace.root, `.pify-node-${randomUUID()}.cjs`);
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    await assertCanonicalWorkspace(workspace);
    handle = await open(scriptPath, "wx", 0o600);
    const openedMetadata = await handle.stat();
    if (!openedMetadata.isFile()) throw codingError("NODE_SCRIPT_NOT_REGULAR");
    const openedIdentity = identityFromStat(openedMetadata);
    await handle.writeFile(`process.argv.splice(1, 2);\n${source}\n`, "utf8");
    await handle.sync();
    await handle.close();
    handle = undefined;
    throwIfAborted(signal);
    await assertCanonicalWorkspace(workspace);
    const pathMetadata = await lstat(scriptPath);
    if (
      !pathMetadata.isFile() ||
      !sameFileIdentity(identityFromStat(pathMetadata), openedIdentity)
    ) {
      throw codingError("NODE_SCRIPT_IDENTITY_CHANGED");
    }
    return scriptPath;
  } catch (error) {
    await handle?.close().catch(() => undefined);
    await removeTemporaryFile(scriptPath, "NODE_SCRIPT_CLEANUP_FAILED");
    throw error;
  }
}

function fitsPortableNodeCommand(
  workspace: CanonicalWorkspace,
  argumentsValue: readonly string[],
): boolean {
  if (process.platform !== "win32") return true;
  const representativeScript = join(
    workspace.root,
    `.pify-node-${"0".repeat(36)}.cjs`,
  );
  const command = [
    process.execPath,
    representativeScript,
    "--",
    ...argumentsValue,
  ];
  let units = 1;
  for (let index = 0; index < command.length; index += 1) {
    units += windowsQuotedArgumentUnits(command[index]);
    if (index > 0) units += 1;
  }
  // Windows permits 32,767 UTF-16 code units. Reserve space for runtime and
  // launcher implementation details rather than accepting a fragile edge.
  return units <= 30_000;
}

function windowsQuotedArgumentUnits(value: string): number {
  if (value.length > 0 && !/[\s"]/u.test(value)) return value.length;
  let units = 2;
  let backslashes = 0;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === "\\") {
      backslashes += 1;
      continue;
    }
    if (character === '"') {
      units += backslashes * 2 + 2;
    } else {
      units += backslashes + 1;
    }
    backslashes = 0;
  }
  return units + backslashes * 2;
}

async function writeAtomically(
  workspace: CanonicalWorkspace,
  parent: string,
  target: string,
  filename: string,
  content: string,
  context: CourseToolExecutionContext,
): Promise<void> {
  let temporaryPath: string | undefined = join(
    parent,
    `.${filename}.pify-tmp-${process.pid}-${randomUUID()}`,
  );
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  let primaryFailed = false;
  try {
    await assertCanonicalWorkspace(workspace);
    await assertDirectoryInsideWorkspace(parent, workspace);
    await rejectSymlinkTarget(target, workspace);
    handle = await open(temporaryPath, "wx", 0o600);
    const openedMetadata = await handle.stat();
    if (!openedMetadata.isFile()) throw codingError("WRITE_TEMP_NOT_REGULAR");
    const openedIdentity = identityFromStat(openedMetadata);
    await handle.writeFile(content, "utf8");
    await handle.sync();
    if (process.platform === "win32") {
      await handle.close();
      handle = undefined;
    }
    throwIfAborted(context.signal);

    // External writers get a scheduling boundary before the final identity
    // check. Correctness must not depend on winning this race.
    await new Promise<void>((resolve) => setImmediate(resolve));
    const beforeRename = await inspectTemporaryPath(
      temporaryPath,
      "WRITE_TEMP_IDENTITY_CHANGED",
    );
    if (
      !beforeRename.isFile() ||
      !sameFileIdentity(identityFromStat(beforeRename), openedIdentity)
    ) {
      throw codingError("WRITE_TEMP_IDENTITY_CHANGED");
    }
    await assertCanonicalWorkspace(workspace);
    await assertDirectoryInsideWorkspace(parent, workspace);
    await rejectSymlinkTarget(target, workspace);
    throwIfAborted(context.signal);
    try {
      await rename(temporaryPath, target);
    } catch (cause) {
      const currentTemporary = await inspectTemporaryPath(
        temporaryPath,
        "WRITE_TEMP_IDENTITY_CHANGED",
      );
      if (
        !currentTemporary.isFile() ||
        !sameFileIdentity(identityFromStat(currentTemporary), openedIdentity)
      ) {
        throw codingError("WRITE_TEMP_IDENTITY_CHANGED", cause);
      }
      throw cause;
    }
    const afterRename = await inspectTemporaryPath(
      target,
      "WRITE_TEMP_IDENTITY_CHANGED",
    );
    if (
      !afterRename.isFile() ||
      !sameFileIdentity(identityFromStat(afterRename), openedIdentity)
    ) {
      await removePathIfIdentity(target, identityFromStat(afterRename));
      throw codingError("WRITE_TEMP_IDENTITY_CHANGED");
    }
    temporaryPath = undefined;
  } catch (error) {
    primaryFailed = true;
    throw error;
  } finally {
    await handle?.close().catch(() => undefined);
    if (temporaryPath !== undefined) {
      try {
        await removeTemporaryFile(temporaryPath, "WRITE_TEMP_CLEANUP_FAILED");
      } catch (cleanupError) {
        if (!primaryFailed) throw cleanupError;
        // The primary operation/identity failure remains authoritative. The
        // cleanup rejection is observed here and cannot become unhandled.
      }
    }
  }
}

async function inspectTemporaryPath(
  path: string,
  failureCode: string,
): Promise<Awaited<ReturnType<typeof lstat>>> {
  try {
    return await lstat(path);
  } catch (cause) {
    throw codingError(failureCode, cause);
  }
}

async function removePathIfIdentity(
  path: string,
  expected: FileIdentity,
): Promise<void> {
  let current: Awaited<ReturnType<typeof lstat>>;
  try {
    current = await lstat(path);
  } catch {
    return;
  }
  if (!sameFileIdentity(identityFromStat(current), expected)) return;
  try {
    if (current.isDirectory() && !current.isSymbolicLink()) {
      await rmdir(path);
    } else {
      await unlink(path);
    }
  } catch (error) {
    if (
      current.isSymbolicLink() &&
      (errnoCode(error) === "EISDIR" || errnoCode(error) === "EPERM")
    ) {
      await rmdir(path).catch(() => undefined);
    }
  }
}

async function removeTemporaryFile(
  path: string,
  failureCode: string,
): Promise<void> {
  try {
    const metadata = await lstat(path);
    try {
      if (metadata.isDirectory() && !metadata.isSymbolicLink()) {
        await rmdir(path);
      } else {
        await unlink(path);
      }
    } catch (error) {
      if (
        metadata.isSymbolicLink() &&
        (errnoCode(error) === "EISDIR" || errnoCode(error) === "EPERM")
      ) {
        await rmdir(path);
      } else {
        throw error;
      }
    }
  } catch (error) {
    if (errnoCode(error) === "ENOENT") return;
    if (error instanceof CodingToolError) throw error;
    throw codingError(failureCode, error);
  }
}

async function withTargetWriteLock<Value>(
  target: string,
  signal: AbortSignal,
  operation: () => Promise<Value>,
): Promise<Value> {
  const key = process.platform === "win32" ? target.toLowerCase() : target;
  const state = targetWriteLocks.get(key) ?? {
    tail: Promise.resolve(),
    pending: 0,
  };
  const previous = state.tail;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  state.tail = previous.then(() => gate);
  state.pending += 1;
  targetWriteLocks.set(key, state);
  try {
    await waitForLockTurn(previous, signal);
    throwIfAborted(signal);
    return await operation();
  } finally {
    release();
    state.pending -= 1;
    if (state.pending === 0 && targetWriteLocks.get(key) === state) {
      targetWriteLocks.delete(key);
    }
  }
}

function waitForLockTurn(
  turn: Promise<void>,
  signal: AbortSignal,
): Promise<void> {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const cleanup = () => signal.removeEventListener("abort", onAbort);
    const onAbort = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
    void turn.then(
      () => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve();
      },
      (error: unknown) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(error);
      },
    );
    if (signal.aborted) onAbort();
  });
}

function canonicalizeWorkspace(root: string): CanonicalWorkspace {
  if (typeof root !== "string" || root.length === 0 || root.includes("\0")) {
    throw codingError("INVALID_WORKSPACE_ROOT");
  }
  const entry = resolvePath(root);
  let canonical: string;
  try {
    canonical = realpathSync.native(entry);
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
  return Object.freeze({
    entry,
    root: canonical,
    identity: identityFromStat(metadata),
  });
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
    if (segment === "" || segment === ".") continue;
    if (segment === ".." || !isPortablePathSegment(segment)) return undefined;
    segments.push(segment);
  }
  if (segments.length === 0) return undefined;
  return Object.freeze({
    display: segments.join("/"),
    segments: Object.freeze(segments),
  });
}

function isPortablePathSegment(value: string): boolean {
  if (value.includes(":")) return false;
  if (/[. ]$/u.test(value)) return false;
  return !/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(value);
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
  let metadata: Awaited<ReturnType<typeof stat>>;
  try {
    current = await realpath(workspace.entry);
    metadata = await stat(current);
  } catch (cause) {
    throw codingError("WORKSPACE_ROOT_CHANGED", cause);
  }
  if (!samePath(current, workspace.root)) {
    throw codingError("WORKSPACE_ROOT_CHANGED");
  }
  if (
    !metadata.isDirectory() ||
    !sameFileIdentity(identityFromStat(metadata), workspace.identity)
  ) {
    throw codingError("WORKSPACE_ROOT_CHANGED");
  }
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

function identityFromStat(
  value: Readonly<{
    dev: number | bigint;
    ino: number | bigint;
  }>,
): FileIdentity {
  return Object.freeze({ device: value.dev, inode: value.ino });
}

function sameFileIdentity(left: FileIdentity, right: FileIdentity): boolean {
  return (
    Object.is(left.device, right.device) && Object.is(left.inode, right.inode)
  );
}

async function runNodeProcess(
  workspace: CanonicalWorkspace,
  scriptPath: string,
  argumentsValue: readonly string[],
  context: CourseToolExecutionContext,
): Promise<CourseNodeProcessToolOutput> {
  const stdout = createOutputCollector();
  const stderr = createOutputCollector();
  let child: ChildProcessByStdio<null, Readable, Readable>;
  try {
    child = spawn(process.execPath, [scriptPath, "--", ...argumentsValue], {
      cwd: workspace.root,
      detached: process.platform !== "win32",
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
  } catch (cause) {
    throw codingError("NODE_PROCESS_START_FAILED", cause);
  }

  return new Promise<CourseNodeProcessToolOutput>((resolve, reject) => {
    let terminal: "abort" | "timeout" | "output" | "start" | undefined;
    let terminalReason: unknown;
    let outcomeSettled = false;
    let cleaned = false;
    let timer: NodeJS.Timeout | undefined;
    let terminationTimer: NodeJS.Timeout | undefined;
    let lateCleanupTimer: NodeJS.Timeout | undefined;

    const removeControlListeners = () => {
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
      context.signal.removeEventListener("abort", onAbort);
    };
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      removeControlListeners();
      if (terminationTimer !== undefined) clearTimeout(terminationTimer);
      if (lateCleanupTimer !== undefined) clearTimeout(lateCleanupTimer);
      terminationTimer = undefined;
      lateCleanupTimer = undefined;
      child.removeListener("error", onChildError);
      child.removeListener("exit", onExit);
      child.removeListener("close", onClose);
      child.stdout.removeListener("data", onStdout);
      child.stdout.removeListener("error", onOutputError);
      child.stderr.removeListener("data", onStderr);
      child.stderr.removeListener("error", onOutputError);
    };
    const terminalError = (): unknown => {
      if (terminal === "timeout") return codingError("NODE_PROCESS_TIMEOUT");
      return terminalReason;
    };
    const settleTerminal = () => {
      if (outcomeSettled) return;
      outcomeSettled = true;
      removeControlListeners();
      if (terminationTimer !== undefined) clearTimeout(terminationTimer);
      terminationTimer = undefined;
      const reason = terminalError();
      reject(reason);
      lateCleanupTimer = setTimeout(cleanup, 1_000);
      lateCleanupTimer.unref();
    };
    const requestTermination = () => {
      let groupTerminationAttempted = false;
      try {
        if (process.platform !== "win32" && child.pid !== undefined) {
          process.kill(-child.pid, "SIGKILL");
          groupTerminationAttempted = true;
        }
      } catch {
        // The direct child may already be gone while its process group lives.
      }
      try {
        if (!groupTerminationAttempted || child.exitCode === null) {
          child.kill("SIGKILL");
        }
      } catch {
        // Exit/close or the bounded termination timer owns settlement.
      }
      try {
        child.stdout.destroy();
      } catch {
        // A concurrently closed stream needs no additional cleanup.
      }
      try {
        child.stderr.destroy();
      } catch {
        // A concurrently closed stream needs no additional cleanup.
      }
    };
    const beginTerminal = (
      kind: "abort" | "timeout" | "output" | "start",
      reason?: unknown,
    ) => {
      if (terminal !== undefined || outcomeSettled) return;
      terminal = kind;
      terminalReason = reason;
      removeControlListeners();
      requestTermination();
      if (child.exitCode !== null || child.signalCode !== null) {
        queueMicrotask(settleTerminal);
        return;
      }
      terminationTimer = setTimeout(settleTerminal, 250);
      terminationTimer.unref();
    };
    const onAbort = () => {
      beginTerminal(
        "abort",
        context.signal.reason ?? new DOMException("Aborted", "AbortError"),
      );
    };
    const onTimeout = () => {
      beginTerminal("timeout");
    };
    const onOutputError = (error: unknown) => {
      if (terminal !== undefined || outcomeSettled) return;
      beginTerminal("output", codingError("NODE_PROCESS_OUTPUT_FAILED", error));
    };
    const onChildError = (error: unknown) => {
      if (terminal !== undefined || outcomeSettled) return;
      beginTerminal("start", codingError("NODE_PROCESS_START_FAILED", error));
    };
    const onStdout = (chunk: Buffer | string) => stdout.append(chunk);
    const onStderr = (chunk: Buffer | string) => stderr.append(chunk);
    const onExit = () => {
      if (terminal !== undefined) settleTerminal();
    };
    const onClose = (
      exitCode: number | null,
      signal: NodeJS.Signals | null,
    ) => {
      if (terminal !== undefined) {
        settleTerminal();
        cleanup();
        return;
      }
      if (outcomeSettled) {
        cleanup();
        return;
      }
      outcomeSettled = true;
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
    child.once("exit", onExit);
    child.once("close", onClose);
    context.signal.addEventListener("abort", onAbort, { once: true });
    timer = setTimeout(onTimeout, COURSE_NODE_TIMEOUT_MS);
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
