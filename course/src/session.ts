import { link, lstat, open, realpath, rename, rm } from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";
import type { BigIntStats } from "node:fs";
import { randomUUID } from "node:crypto";
import { basename, dirname, resolve } from "node:path";

import { validateTranscript } from "./messages";
import type {
  CourseAssistantBlock,
  CourseJsonObject,
  CourseJsonValue,
  CourseMessage,
} from "./protocol";

export const SESSION_FORMAT_VERSION = 1;
export const MAX_SESSION_LINE_BYTES = 65_536;
export const MAX_SESSION_FILE_BYTES = 4_194_304;
export const MAX_SESSION_RECORDS = 4_096;

export type SessionHeader = Readonly<{
  type: "session";
  version: typeof SESSION_FORMAT_VERSION;
  id: string;
  createdAt: string;
}>;

export type SessionEntry = Readonly<{
  type: "entry";
  version: typeof SESSION_FORMAT_VERSION;
  id: string;
  parentId: string | null;
  timestamp: string;
  message: CourseMessage;
}>;

export type SessionStoreErrorCode =
  | "SESSION_ALREADY_EXISTS"
  | "SESSION_DUPLICATE_ENTRY_ID"
  | "SESSION_ENTRY_NOT_FOUND"
  | "SESSION_FILE_CHANGED"
  | "SESSION_FILE_TOO_LARGE"
  | "SESSION_INVALID_HEADER"
  | "SESSION_INVALID_JSON"
  | "SESSION_INVALID_MESSAGE"
  | "SESSION_INVALID_RECORD"
  | "SESSION_INVALID_TOOL_LINKAGE"
  | "SESSION_INVALID_UTF8"
  | "SESSION_LINE_TOO_LARGE"
  | "SESSION_PARENT_NOT_FOUND"
  | "SESSION_RECORD_LIMIT"
  | "SESSION_ROLLBACK_FAILED"
  | "SESSION_ROOT_CHANGED"
  | "SESSION_UNSUPPORTED_VERSION";

export class SessionStoreError extends Error {
  public constructor(
    public readonly code: SessionStoreErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "SessionStoreError";
  }
}

export type SessionStoreOptions = Readonly<{
  sessionId?: string;
  clock?: () => string;
  idFactory?: () => string;
  fileSystem?: Partial<SessionStoreFileSystem>;
}>;

export type SessionStoreFileSystem = Readonly<{
  lstat: (path: string) => Promise<BigIntStats>;
  link: (source: string, destination: string) => Promise<void>;
  rename: (source: string, destination: string) => Promise<void>;
  remove: (path: string) => Promise<void>;
}>;

type FileIdentity = Readonly<{
  dev: bigint;
  ino: bigint;
  birthtimeNs: bigint;
}>;

type RootIdentity = Readonly<{
  path: string;
  realPath: string;
  file: FileIdentity;
}>;

type ParsedSession = Readonly<{
  header: SessionHeader;
  entries: readonly SessionEntry[];
}>;

const textDecoder = new TextDecoder("utf-8", { fatal: true });
const sessionPathLocks = new Map<string, Promise<void>>();
const defaultSessionStoreFileSystem: SessionStoreFileSystem = Object.freeze({
  lstat: (path: string) => lstat(path, { bigint: true }),
  link,
  rename,
  remove: async (path: string) => rm(path, { force: true }),
});

export class SessionStore {
  readonly #path: string;
  readonly #lockKey: string;
  readonly #root: RootIdentity;
  readonly #clock: () => string;
  readonly #idFactory: () => string;
  readonly #fileSystem: SessionStoreFileSystem;
  readonly #header: SessionHeader;
  readonly #entries: SessionEntry[];
  readonly #entryById: Map<string, SessionEntry>;
  #fileIdentity: FileIdentity;
  #fileSize: number;
  #unusableError: SessionStoreError | undefined;
  #queue: Promise<void> = Promise.resolve();

  private constructor(input: {
    path: string;
    root: RootIdentity;
    fileIdentity: FileIdentity;
    fileSize: number;
    header: SessionHeader;
    entries: readonly SessionEntry[];
    clock: () => string;
    idFactory: () => string;
    fileSystem: SessionStoreFileSystem;
  }) {
    this.#path = input.path;
    this.#lockKey = canonicalSessionKey(input.path, input.root);
    this.#root = input.root;
    this.#fileIdentity = input.fileIdentity;
    this.#fileSize = input.fileSize;
    this.#header = input.header;
    this.#entries = [...input.entries];
    this.#entryById = new Map(
      input.entries.map((entry) => [entry.id, entry] as const),
    );
    this.#clock = input.clock;
    this.#idFactory = input.idFactory;
    this.#fileSystem = input.fileSystem;
  }

  public static async create(
    path: string,
    options: SessionStoreOptions = {},
  ): Promise<SessionStore> {
    const absolutePath = assertSessionPath(path);
    const root = await captureRoot(dirname(absolutePath));
    const configuredSessionId = snapshotOptionalString(
      options,
      "sessionId",
      "SESSION_INVALID_HEADER",
    );
    const sessionId = configuredSessionId ?? randomUUID();
    const clock = snapshotFunction(options, "clock", () =>
      new Date().toISOString(),
    );
    const idFactory = snapshotFunction(options, "idFactory", randomUUID);
    const fileSystem = snapshotSessionStoreFileSystem(options);
    await assertNoRecoveryMarker(absolutePath, fileSystem);
    assertNonEmptyString(sessionId, "Session ID", "SESSION_INVALID_HEADER");
    const createdAt = clock();
    assertNonEmptyString(
      createdAt,
      "Session creation timestamp",
      "SESSION_INVALID_HEADER",
    );
    const header = freezeHeader({
      type: "session",
      version: SESSION_FORMAT_VERSION,
      id: sessionId,
      createdAt,
    });
    const bytes = serializeLine(header);
    let handle;
    try {
      handle = await open(absolutePath, "wx", 0o600);
      await writeAll(handle, bytes);
      await handle.sync();
      const stats = await handle.stat({ bigint: true });
      if (!stats.isFile()) {
        throw new Error("Session path is not a regular file");
      }
      const identity = identityFromStats(stats);
      await handle.close();
      handle = undefined;
      await assertRoot(root);
      await assertPathIdentity(absolutePath, identity, bytes.byteLength);
      await syncDirectory(root.path);
      return new SessionStore({
        path: absolutePath,
        root,
        fileIdentity: identity,
        fileSize: bytes.byteLength,
        header,
        entries: [],
        clock,
        idFactory,
        fileSystem,
      });
    } catch (cause) {
      await handle?.close().catch(() => undefined);
      if ((cause as NodeJS.ErrnoException).code === "EEXIST") {
        throw new SessionStoreError(
          "SESSION_ALREADY_EXISTS",
          "Session file already exists",
          { cause },
        );
      }
      throw cause;
    }
  }

  public static async load(
    path: string,
    options: SessionStoreOptions = {},
  ): Promise<SessionStore> {
    const absolutePath = assertSessionPath(path);
    const fileSystem = snapshotSessionStoreFileSystem(options);
    await assertNoRecoveryMarker(absolutePath, fileSystem);
    const root = await captureRoot(dirname(absolutePath));
    const before = await lstat(absolutePath, { bigint: true });
    if (!before.isFile()) {
      throw new SessionStoreError(
        "SESSION_FILE_CHANGED",
        "Session path is not a regular file",
      );
    }
    if (before.size > BigInt(MAX_SESSION_FILE_BYTES)) {
      throw new SessionStoreError(
        "SESSION_FILE_TOO_LARGE",
        "Session file exceeds the byte limit",
      );
    }
    const expectedIdentity = identityFromStats(before);
    const handle = await open(absolutePath, "r");
    let bytes: Buffer;
    try {
      const opened = await handle.stat({ bigint: true });
      if (!sameIdentity(identityFromStats(opened), expectedIdentity)) {
        throw new SessionStoreError(
          "SESSION_FILE_CHANGED",
          "Session file changed while it was opened",
        );
      }
      bytes = await handle.readFile();
    } finally {
      await handle.close();
    }
    if (bytes.byteLength > MAX_SESSION_FILE_BYTES) {
      throw new SessionStoreError(
        "SESSION_FILE_TOO_LARGE",
        "Session file exceeds the byte limit",
      );
    }
    await assertRoot(root);
    await assertPathIdentity(absolutePath, expectedIdentity, bytes.byteLength);
    const parsed = parseSession(bytes);
    const clock = snapshotFunction(options, "clock", () =>
      new Date().toISOString(),
    );
    const idFactory = snapshotFunction(options, "idFactory", randomUUID);
    return new SessionStore({
      path: absolutePath,
      root,
      fileIdentity: expectedIdentity,
      fileSize: bytes.byteLength,
      header: parsed.header,
      entries: parsed.entries,
      clock,
      idFactory,
      fileSystem,
    });
  }

  public get header(): SessionHeader {
    return this.#header;
  }

  public get entries(): readonly SessionEntry[] {
    return Object.freeze([...this.#entries]);
  }

  public append(
    parentId: string | null,
    message: CourseMessage,
  ): Promise<SessionEntry> {
    let messageSnapshot: CourseMessage;
    try {
      if (parentId !== null) {
        assertNonEmptyString(parentId, "Parent ID", "SESSION_PARENT_NOT_FOUND");
      }
      messageSnapshot = snapshotMessage(message);
    } catch (cause) {
      return Promise.reject(cause);
    }
    return this.#enqueue(() => this.#append(parentId, messageSnapshot));
  }

  public flush(): Promise<void> {
    return this.#enqueue(() => this.#atomicRewrite());
  }

  async #append(
    parentId: string | null,
    message: CourseMessage,
  ): Promise<SessionEntry> {
    await this.#assertStorageIdentity();
    if (this.#entries.length >= MAX_SESSION_RECORDS) {
      throw new SessionStoreError(
        "SESSION_RECORD_LIMIT",
        "Session record limit reached",
      );
    }
    if (parentId !== null && !this.#entryById.has(parentId)) {
      throw new SessionStoreError(
        "SESSION_PARENT_NOT_FOUND",
        `Parent entry "${parentId}" does not exist`,
      );
    }
    const id = this.#idFactory();
    assertNonEmptyString(id, "Entry ID", "SESSION_INVALID_RECORD");
    if (this.#entryById.has(id)) {
      throw new SessionStoreError(
        "SESSION_DUPLICATE_ENTRY_ID",
        `Entry ID "${id}" already exists`,
      );
    }
    const timestamp = this.#clock();
    assertNonEmptyString(
      timestamp,
      "Entry timestamp",
      "SESSION_INVALID_RECORD",
    );
    const entry = freezeEntry({
      type: "entry",
      version: SESSION_FORMAT_VERSION,
      id,
      parentId,
      timestamp,
      message,
    });
    assertToolLinkage(entry, this.#entryById);
    const prospectiveEntries = Object.freeze([...this.#entries, entry]);
    await this.#atomicCommit(prospectiveEntries);
    this.#entries.push(entry);
    this.#entryById.set(entry.id, entry);
    return entry;
  }

  async #atomicRewrite(): Promise<void> {
    await this.#atomicCommit(this.#entries);
  }

  async #atomicCommit(entries: readonly SessionEntry[]): Promise<void> {
    await this.#assertStorageIdentity();
    const bytes = serializeSession(this.#header, entries);
    const temporaryPath = `${this.#path}.pify-session-${process.pid}-${randomUUID()}`;
    const backupPath = `${this.#path}.pify-session-recovery`;
    const originalIdentity = this.#fileIdentity;
    const originalSize = this.#fileSize;
    let temporaryIdentity: FileIdentity | undefined;
    let backupOwned = false;
    let preserveBackup = false;
    let handle;
    try {
      handle = await open(temporaryPath, "wx", 0o600);
      const stats = await handle.stat({ bigint: true });
      if (!stats.isFile()) {
        throw new Error("Session temporary is not a regular file");
      }
      temporaryIdentity = identityFromStats(stats);
      await writeAll(handle, bytes);
      await handle.sync();
      await handle.close();
      handle = undefined;
      await this.#assertStorageIdentity();
      await assertPathIdentity(
        temporaryPath,
        temporaryIdentity,
        bytes.byteLength,
      );
      await this.#fileSystem.link(this.#path, backupPath);
      backupOwned = true;
      const backupStats = await this.#fileSystem.lstat(backupPath);
      if (
        !backupStats.isFile() ||
        !sameIdentity(identityFromStats(backupStats), originalIdentity) ||
        backupStats.size !== BigInt(originalSize)
      ) {
        throw new SessionStoreError(
          "SESSION_FILE_CHANGED",
          "Session rollback link has an unexpected identity",
        );
      }
      await this.#assertStorageIdentity();
      await this.#fileSystem.rename(temporaryPath, this.#path);
      let installedIdentity: FileIdentity;
      try {
        const installed = await this.#fileSystem.lstat(this.#path);
        installedIdentity = identityFromStats(installed);
        if (
          !installed.isFile() ||
          !sameIdentity(installedIdentity, temporaryIdentity) ||
          installed.size !== BigInt(bytes.byteLength)
        ) {
          throw new SessionStoreError(
            "SESSION_FILE_CHANGED",
            "Installed session file identity is unexpected",
          );
        }
        await syncDirectory(this.#root.path);
      } catch (primaryCause) {
        try {
          const restoration = await this.#restoreOldGeneration(
            backupPath,
            originalIdentity,
            originalSize,
          );
          backupOwned = restoration.backupOwned;
          this.#fileIdentity = restoration.identity;
          this.#fileSize = originalSize;
        } catch (rollbackCause) {
          preserveBackup = true;
          const rollbackError = new SessionStoreError(
            "SESSION_ROLLBACK_FAILED",
            "Session rollback failed; the recovery backup was retained",
            {
              cause: new AggregateError(
                [primaryCause, rollbackCause],
                "Session commit and rollback both failed",
              ),
            },
          );
          this.#unusableError = rollbackError;
          throw rollbackError;
        }
        await syncDirectory(this.#root.path).catch(() => undefined);
        throw primaryCause;
      }
      this.#fileIdentity = installedIdentity;
      this.#fileSize = bytes.byteLength;
      backupOwned = !(await cleanupOwnedPath(
        backupPath,
        originalIdentity,
        originalSize,
        this.#fileSystem,
      ));
      await syncDirectory(this.#root.path).catch(() => undefined);
    } finally {
      await handle?.close().catch(() => undefined);
      if (temporaryIdentity !== undefined) {
        await cleanupOwnedPath(
          temporaryPath,
          temporaryIdentity,
          undefined,
          this.#fileSystem,
        ).catch(() => false);
      }
      if (backupOwned && !preserveBackup) {
        await cleanupOwnedPath(
          backupPath,
          originalIdentity,
          originalSize,
          this.#fileSystem,
        ).catch(() => false);
      }
    }
  }

  async #restoreOldGeneration(
    backupPath: string,
    originalIdentity: FileIdentity,
    originalSize: number,
  ): Promise<Readonly<{ identity: FileIdentity; backupOwned: boolean }>> {
    const rollbackFailures: unknown[] = [];
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        await this.#fileSystem.rename(backupPath, this.#path);
        return Object.freeze({
          identity: originalIdentity,
          backupOwned: false,
        });
      } catch (cause) {
        rollbackFailures.push(cause);
        if (
          await pathMatchesIdentity(
            this.#path,
            originalIdentity,
            originalSize,
            this.#fileSystem,
          )
        ) {
          return Object.freeze({
            identity: originalIdentity,
            backupOwned: false,
          });
        }
      }
    }

    const restorePath = `${this.#path}.pify-session-restore-${process.pid}-${randomUUID()}`;
    let restoreIdentity: FileIdentity | undefined;
    let restoreOwned = false;
    try {
      const reader = await open(backupPath, "r");
      let originalBytes: Buffer;
      try {
        const sourceStats = await reader.stat({ bigint: true });
        if (
          !sourceStats.isFile() ||
          !sameIdentity(identityFromStats(sourceStats), originalIdentity) ||
          sourceStats.size !== BigInt(originalSize)
        ) {
          throw new Error("Recovery backup identity changed");
        }
        originalBytes = await reader.readFile();
      } finally {
        await reader.close();
      }

      const writer = await open(restorePath, "wx", 0o600);
      restoreOwned = true;
      try {
        const restoreStats = await writer.stat({ bigint: true });
        if (!restoreStats.isFile()) {
          throw new Error("Recovery temporary is not a regular file");
        }
        restoreIdentity = identityFromStats(restoreStats);
        await writeAll(writer, originalBytes);
        await writer.sync();
      } finally {
        await writer.close();
      }
      await this.#fileSystem.rename(restorePath, this.#path);
      restoreOwned = false;
      await syncDirectory(this.#root.path).catch(() => undefined);
      if (restoreIdentity === undefined) {
        throw new Error("Recovery temporary identity is unavailable");
      }
      return Object.freeze({
        identity: restoreIdentity,
        backupOwned: true,
      });
    } catch (cause) {
      rollbackFailures.push(cause);
      throw new AggregateError(
        rollbackFailures,
        "All bounded session rollback strategies failed",
      );
    } finally {
      if (restoreOwned && restoreIdentity !== undefined) {
        await cleanupOwnedPath(
          restorePath,
          restoreIdentity,
          undefined,
          this.#fileSystem,
        ).catch(() => false);
      }
    }
  }

  async #assertStorageIdentity(): Promise<void> {
    if (this.#unusableError !== undefined) throw this.#unusableError;
    await assertRoot(this.#root);
    await assertPathIdentity(this.#path, this.#fileIdentity, this.#fileSize);
  }

  #enqueue<Result>(task: () => Promise<Result>): Promise<Result> {
    const result = this.#queue.then(() =>
      withSessionPathLock(this.#lockKey, task),
    );
    this.#queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}

export class SessionTree {
  readonly #store: SessionStore;
  #activeLeafId: string | null;
  #queue: Promise<void> = Promise.resolve();

  public constructor(store: SessionStore) {
    this.#store = store;
    this.#activeLeafId = store.entries.at(-1)?.id ?? null;
  }

  public get activeLeafId(): string | null {
    return this.#activeLeafId;
  }

  public get entries(): readonly SessionEntry[] {
    return this.#store.entries;
  }

  public get activeEntries(): readonly SessionEntry[] {
    if (this.#activeLeafId === null) return Object.freeze([]);
    const byId = new Map(this.#store.entries.map((entry) => [entry.id, entry]));
    const reversed: SessionEntry[] = [];
    let currentId: string | null = this.#activeLeafId;
    while (currentId !== null) {
      const entry = byId.get(currentId);
      if (entry === undefined) {
        throw new SessionStoreError(
          "SESSION_ENTRY_NOT_FOUND",
          `Active entry "${currentId}" does not exist`,
        );
      }
      reversed.push(entry);
      currentId = entry.parentId;
    }
    reversed.reverse();
    return Object.freeze(reversed);
  }

  public get activeMessages(): readonly CourseMessage[] {
    return Object.freeze(this.activeEntries.map((entry) => entry.message));
  }

  public moveTo(entryId: string | null): Promise<void> {
    return this.#enqueue(async () => {
      if (
        entryId !== null &&
        !this.#store.entries.some((entry) => entry.id === entryId)
      ) {
        throw new SessionStoreError(
          "SESSION_ENTRY_NOT_FOUND",
          `Session entry "${entryId}" does not exist`,
        );
      }
      this.#activeLeafId = entryId;
    });
  }

  public append(message: CourseMessage): Promise<SessionEntry> {
    let messageSnapshot: CourseMessage;
    try {
      messageSnapshot = snapshotMessage(message);
    } catch (cause) {
      return Promise.reject(cause);
    }
    return this.#enqueue(async () => {
      const entry = await this.#store.append(
        this.#activeLeafId,
        messageSnapshot,
      );
      this.#activeLeafId = entry.id;
      return entry;
    });
  }

  #enqueue<Result>(operation: () => Promise<Result>): Promise<Result> {
    const result = this.#queue.then(operation);
    this.#queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}

function parseSession(bytes: Buffer): ParsedSession {
  const rawLines: Buffer[] = [];
  let lineStart = 0;
  for (let index = 0; index < bytes.byteLength; index += 1) {
    if (bytes[index] !== 0x0a) continue;
    rawLines.push(bytes.subarray(lineStart, index));
    lineStart = index + 1;
  }
  const hasTrailingNewline = lineStart === bytes.byteLength;
  if (!hasTrailingNewline) rawLines.push(bytes.subarray(lineStart));
  if (rawLines.length === 0) {
    throw new SessionStoreError(
      "SESSION_INVALID_HEADER",
      "Session file is empty",
    );
  }

  const values: unknown[] = [];
  for (let index = 0; index < rawLines.length; index += 1) {
    let line = rawLines[index];
    if (line.at(-1) === 0x0d) line = line.subarray(0, line.byteLength - 1);
    if (line.byteLength > MAX_SESSION_LINE_BYTES) {
      throw new SessionStoreError(
        "SESSION_LINE_TOO_LARGE",
        `Session line ${index + 1} exceeds the byte limit`,
      );
    }
    const isIncompleteFinal =
      index === rawLines.length - 1 && !hasTrailingNewline;
    let text: string;
    try {
      text = textDecoder.decode(line);
    } catch (cause) {
      throw new SessionStoreError(
        "SESSION_INVALID_UTF8",
        `Session line ${index + 1} is not valid UTF-8`,
        { cause },
      );
    }
    try {
      values.push(JSON.parse(text) as unknown);
    } catch (cause) {
      if (isIncompleteFinal && isIncompleteJsonObjectPrefix(text)) {
        break;
      }
      throw new SessionStoreError(
        "SESSION_INVALID_JSON",
        `Session line ${index + 1} is not valid JSON`,
        { cause },
      );
    }
  }
  if (values.length === 0) {
    throw new SessionStoreError(
      "SESSION_INVALID_HEADER",
      "Session header is missing or incomplete",
    );
  }
  const header = parseHeader(values[0]);
  const entries: SessionEntry[] = [];
  const entryById = new Map<string, SessionEntry>();
  for (let index = 1; index < values.length; index += 1) {
    if (entries.length >= MAX_SESSION_RECORDS) {
      throw new SessionStoreError(
        "SESSION_RECORD_LIMIT",
        "Session record limit exceeded",
      );
    }
    const entry = parseEntry(values[index]);
    if (entryById.has(entry.id)) {
      throw new SessionStoreError(
        "SESSION_DUPLICATE_ENTRY_ID",
        `Duplicate entry ID "${entry.id}"`,
      );
    }
    if (entry.parentId !== null && !entryById.has(entry.parentId)) {
      throw new SessionStoreError(
        "SESSION_PARENT_NOT_FOUND",
        `Parent entry "${entry.parentId}" must precede its child`,
      );
    }
    assertToolLinkage(entry, entryById);
    entries.push(entry);
    entryById.set(entry.id, entry);
  }
  return Object.freeze({
    header,
    entries: Object.freeze(entries),
  });
}

type JsonPrefixStatus = "complete" | "incomplete" | "invalid";

function isIncompleteJsonObjectPrefix(text: string): boolean {
  const parser = new JsonPrefixParser(text);
  parser.skipWhitespace();
  if (parser.peek() !== "{") return false;
  const status = parser.parseObject();
  if (status !== "complete") return status === "incomplete";
  parser.skipWhitespace();
  return false;
}

class JsonPrefixParser {
  #index = 0;

  public constructor(private readonly text: string) {}

  public peek(): string | undefined {
    return this.text[this.#index];
  }

  public skipWhitespace(): void {
    while (isJsonWhitespace(this.peek())) this.#index += 1;
  }

  public parseObject(): JsonPrefixStatus {
    if (this.peek() !== "{") return "invalid";
    this.#index += 1;
    this.skipWhitespace();
    if (this.peek() === undefined) return "incomplete";
    if (this.peek() === "}") {
      this.#index += 1;
      return "complete";
    }

    while (true) {
      const key = this.#parseString();
      if (key !== "complete") return key;
      this.skipWhitespace();
      if (this.peek() === undefined) return "incomplete";
      if (this.peek() !== ":") return "invalid";
      this.#index += 1;
      this.skipWhitespace();
      const value = this.#parseValue();
      if (value !== "complete") return value;
      this.skipWhitespace();
      const delimiter = this.peek();
      if (delimiter === undefined) return "incomplete";
      if (delimiter === "}") {
        this.#index += 1;
        return "complete";
      }
      if (delimiter !== ",") return "invalid";
      this.#index += 1;
      this.skipWhitespace();
      if (this.peek() === undefined) return "incomplete";
      if (this.peek() === "}") return "invalid";
    }
  }

  #parseValue(): JsonPrefixStatus {
    const next = this.peek();
    if (next === undefined) return "incomplete";
    if (next === "{") return this.parseObject();
    if (next === "[") return this.#parseArray();
    if (next === '"') return this.#parseString();
    if (next === "t") return this.#parseLiteral("true");
    if (next === "f") return this.#parseLiteral("false");
    if (next === "n") return this.#parseLiteral("null");
    if (next === "-" || isAsciiDigit(next)) return this.#parseNumber();
    return "invalid";
  }

  #parseArray(): JsonPrefixStatus {
    this.#index += 1;
    this.skipWhitespace();
    if (this.peek() === undefined) return "incomplete";
    if (this.peek() === "]") {
      this.#index += 1;
      return "complete";
    }

    while (true) {
      const value = this.#parseValue();
      if (value !== "complete") return value;
      this.skipWhitespace();
      const delimiter = this.peek();
      if (delimiter === undefined) return "incomplete";
      if (delimiter === "]") {
        this.#index += 1;
        return "complete";
      }
      if (delimiter !== ",") return "invalid";
      this.#index += 1;
      this.skipWhitespace();
      if (this.peek() === undefined) return "incomplete";
      if (this.peek() === "]") return "invalid";
    }
  }

  #parseString(): JsonPrefixStatus {
    if (this.peek() !== '"') return "invalid";
    this.#index += 1;
    while (true) {
      const character = this.peek();
      if (character === undefined) return "incomplete";
      this.#index += 1;
      if (character === '"') return "complete";
      if (character.charCodeAt(0) <= 0x1f) return "invalid";
      if (character !== "\\") continue;
      const escape = this.peek();
      if (escape === undefined) return "incomplete";
      this.#index += 1;
      if ('"\\/bfnrt'.includes(escape)) continue;
      if (escape !== "u") return "invalid";
      for (let digit = 0; digit < 4; digit += 1) {
        const hex = this.peek();
        if (hex === undefined) return "incomplete";
        if (!isHexDigit(hex)) return "invalid";
        this.#index += 1;
      }
    }
  }

  #parseLiteral(expected: "true" | "false" | "null"): JsonPrefixStatus {
    for (let offset = 0; offset < expected.length; offset += 1) {
      const character = this.peek();
      if (character === undefined) return "incomplete";
      if (character !== expected[offset]) return "invalid";
      this.#index += 1;
    }
    return "complete";
  }

  #parseNumber(): JsonPrefixStatus {
    if (this.peek() === "-") {
      this.#index += 1;
      if (this.peek() === undefined) return "incomplete";
    }
    if (this.peek() === "0") {
      this.#index += 1;
      if (isAsciiDigit(this.peek())) return "invalid";
    } else if (isNonZeroAsciiDigit(this.peek())) {
      while (isAsciiDigit(this.peek())) this.#index += 1;
    } else {
      return "invalid";
    }

    if (this.peek() === ".") {
      this.#index += 1;
      if (this.peek() === undefined) return "incomplete";
      if (!isAsciiDigit(this.peek())) return "invalid";
      while (isAsciiDigit(this.peek())) this.#index += 1;
    }
    if (this.peek() === "e" || this.peek() === "E") {
      this.#index += 1;
      if (this.peek() === "+" || this.peek() === "-") this.#index += 1;
      if (this.peek() === undefined) return "incomplete";
      if (!isAsciiDigit(this.peek())) return "invalid";
      while (isAsciiDigit(this.peek())) this.#index += 1;
    }
    return "complete";
  }
}

function isJsonWhitespace(value: string | undefined): boolean {
  return value === " " || value === "\t" || value === "\r" || value === "\n";
}

function isAsciiDigit(value: string | undefined): boolean {
  return value !== undefined && value >= "0" && value <= "9";
}

function isNonZeroAsciiDigit(value: string | undefined): boolean {
  return value !== undefined && value >= "1" && value <= "9";
}

function isHexDigit(value: string): boolean {
  return (
    (value >= "0" && value <= "9") ||
    (value >= "a" && value <= "f") ||
    (value >= "A" && value <= "F")
  );
}

function describeUnknownPrimitive(value: unknown): string {
  if (value === null) return "null";
  switch (typeof value) {
    case "undefined":
      return "undefined";
    case "boolean":
      return value ? "true" : "false";
    case "number":
      return Number.isFinite(value) ? `number(${value})` : "non-finite number";
    case "string":
      return `string(${JSON.stringify(value)})`;
    case "bigint":
      return "bigint";
    case "symbol":
      return "symbol";
    case "function":
    case "object":
      return "non-primitive";
    default:
      return "unknown";
  }
}

function parseHeader(value: unknown): SessionHeader {
  const record = exactRecord(value, ["type", "version", "id", "createdAt"]);
  if (record === undefined || record.type !== "session") {
    throw new SessionStoreError(
      "SESSION_INVALID_HEADER",
      "First session record must be a header",
    );
  }
  if (
    typeof record.version !== "number" ||
    record.version !== SESSION_FORMAT_VERSION
  ) {
    throw new SessionStoreError(
      "SESSION_UNSUPPORTED_VERSION",
      `Unsupported session version ${describeUnknownPrimitive(record.version)}`,
    );
  }
  assertNonEmptyString(record.id, "Session ID", "SESSION_INVALID_HEADER");
  assertNonEmptyString(
    record.createdAt,
    "Session creation timestamp",
    "SESSION_INVALID_HEADER",
  );
  return freezeHeader({
    type: "session",
    version: SESSION_FORMAT_VERSION,
    id: record.id,
    createdAt: record.createdAt,
  });
}

function parseEntry(value: unknown): SessionEntry {
  const record = exactRecord(value, [
    "type",
    "version",
    "id",
    "parentId",
    "timestamp",
    "message",
  ]);
  if (record === undefined || record.type !== "entry") {
    throw new SessionStoreError(
      "SESSION_INVALID_RECORD",
      "Session entry has an invalid shape",
    );
  }
  if (
    typeof record.version !== "number" ||
    record.version !== SESSION_FORMAT_VERSION
  ) {
    throw new SessionStoreError(
      "SESSION_UNSUPPORTED_VERSION",
      `Unsupported entry version ${describeUnknownPrimitive(record.version)}`,
    );
  }
  assertNonEmptyString(record.id, "Entry ID", "SESSION_INVALID_RECORD");
  if (record.parentId !== null && !isNonEmptyString(record.parentId)) {
    throw new SessionStoreError(
      "SESSION_INVALID_RECORD",
      "Entry parent ID must be null or a non-empty string",
    );
  }
  assertNonEmptyString(
    record.timestamp,
    "Entry timestamp",
    "SESSION_INVALID_RECORD",
  );
  const message = snapshotMessage(record.message);
  return freezeEntry({
    type: "entry",
    version: SESSION_FORMAT_VERSION,
    id: record.id,
    parentId: record.parentId,
    timestamp: record.timestamp,
    message,
  });
}

function snapshotMessage(value: unknown): CourseMessage {
  try {
    const base = ownDataRecord(value);
    if (base === undefined) throw new Error("Message must be a plain object");
    const role = ownDataValue(base, "role");
    const id = ownDataValue(base, "id");
    if (!isNonEmptyString(id)) throw new Error("Message ID is invalid");
    if (role === "user") {
      assertExactKeys(base, ["id", "role", "content"]);
      const content = ownDataValue(base, "content");
      if (typeof content !== "string")
        throw new Error("User content is invalid");
      return Object.freeze({ id, role, content });
    }
    if (role === "assistant") {
      assertExactKeys(base, ["id", "role", "content"]);
      const content = snapshotAssistantContent(ownDataValue(base, "content"));
      return Object.freeze({ id, role, content });
    }
    if (role === "toolResult") {
      assertExactKeys(base, [
        "id",
        "role",
        "toolCallId",
        "toolName",
        "content",
        "isError",
      ]);
      const toolCallId = ownDataValue(base, "toolCallId");
      const toolName = ownDataValue(base, "toolName");
      const content = ownDataValue(base, "content");
      const isError = ownDataValue(base, "isError");
      if (
        !isNonEmptyString(toolCallId) ||
        !isNonEmptyString(toolName) ||
        typeof content !== "string" ||
        typeof isError !== "boolean"
      ) {
        throw new Error("Tool result is invalid");
      }
      return Object.freeze({
        id,
        role,
        toolCallId,
        toolName,
        content,
        isError,
      });
    }
    throw new Error("Message role is invalid");
  } catch (cause) {
    if (cause instanceof SessionStoreError) throw cause;
    throw new SessionStoreError(
      "SESSION_INVALID_MESSAGE",
      "Session message is invalid",
      { cause },
    );
  }
}

function snapshotAssistantContent(
  value: unknown,
): readonly CourseAssistantBlock[] {
  if (!Array.isArray(value))
    throw new Error("Assistant content must be an array");
  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
  const length = lengthDescriptor?.value;
  if (!Number.isSafeInteger(length) || (length as number) < 0) {
    throw new Error("Assistant content length is invalid");
  }
  const blocks: CourseAssistantBlock[] = [];
  for (let index = 0; index < (length as number); index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (descriptor === undefined || !("value" in descriptor)) {
      throw new Error(
        "Assistant content must not be sparse or accessor-backed",
      );
    }
    const record = ownDataRecord(descriptor.value);
    if (record === undefined)
      throw new Error("Assistant block must be an object");
    const type = ownDataValue(record, "type");
    if (type === "text") {
      assertExactKeys(record, ["type", "text"]);
      const text = ownDataValue(record, "text");
      if (typeof text !== "string") throw new Error("Text block is invalid");
      blocks.push(Object.freeze({ type, text }));
      continue;
    }
    if (type !== "toolCall") throw new Error("Assistant block type is invalid");
    assertExactKeys(record, ["type", "id", "name", "arguments"]);
    const id = ownDataValue(record, "id");
    const name = ownDataValue(record, "name");
    if (!isNonEmptyString(id) || !isNonEmptyString(name)) {
      throw new Error("Tool call identity is invalid");
    }
    const argumentsValue = snapshotJsonObject(
      ownDataValue(record, "arguments"),
      new WeakSet(),
    );
    blocks.push(Object.freeze({ type, id, name, arguments: argumentsValue }));
  }
  return Object.freeze(blocks);
}

function snapshotJsonObject(
  value: unknown,
  ancestors: WeakSet<object>,
): CourseJsonObject {
  const descriptors = ownDataRecord(value);
  if (descriptors === undefined)
    throw new Error("Tool arguments must be a JSON object");
  if (ancestors.has(value as object)) throw new Error("Circular JSON value");
  ancestors.add(value as object);
  try {
    const snapshot: Record<string, CourseJsonValue> = {};
    for (const key of Object.keys(descriptors)) {
      const descriptor = descriptors[key];
      if (!("value" in descriptor) || !descriptor.enumerable) {
        throw new Error("JSON object contains an unsupported property");
      }
      Object.defineProperty(snapshot, key, {
        value: snapshotJsonValue(descriptor.value, ancestors),
        enumerable: true,
        writable: false,
        configurable: false,
      });
    }
    return Object.freeze(snapshot);
  } finally {
    ancestors.delete(value as object);
  }
}

function snapshotJsonValue(
  value: unknown,
  ancestors: WeakSet<object>,
): CourseJsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    if (ancestors.has(value)) throw new Error("Circular JSON value");
    ancestors.add(value);
    try {
      const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
      const length = lengthDescriptor?.value;
      if (!Number.isSafeInteger(length) || (length as number) < 0) {
        throw new Error("JSON array length is invalid");
      }
      const snapshot: CourseJsonValue[] = [];
      for (let index = 0; index < (length as number); index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(
          value,
          String(index),
        );
        if (descriptor === undefined || !("value" in descriptor)) {
          throw new Error("JSON arrays must not be sparse or accessor-backed");
        }
        snapshot.push(snapshotJsonValue(descriptor.value, ancestors));
      }
      return Object.freeze(snapshot);
    } finally {
      ancestors.delete(value);
    }
  }
  return snapshotJsonObject(value, ancestors);
}

function assertToolLinkage(
  candidate: SessionEntry,
  byId: ReadonlyMap<string, SessionEntry>,
): void {
  const reversed: CourseMessage[] = [candidate.message];
  let parentId = candidate.parentId;
  while (parentId !== null) {
    const parent = byId.get(parentId);
    if (parent === undefined) {
      throw new SessionStoreError(
        "SESSION_PARENT_NOT_FOUND",
        `Parent entry "${parentId}" does not exist`,
      );
    }
    reversed.push(parent.message);
    parentId = parent.parentId;
  }
  reversed.reverse();
  const errors = validateTranscript(reversed).filter(
    (error) => error.code !== "MISSING_TOOL_RESULT",
  );
  if (errors.length > 0) {
    throw new SessionStoreError(
      "SESSION_INVALID_TOOL_LINKAGE",
      `Session branch has invalid Tool linkage: ${errors[0].code}`,
    );
  }
}

function serializeLine(value: SessionHeader | SessionEntry): Buffer {
  const bytes = Buffer.from(`${JSON.stringify(value)}\n`, "utf8");
  if (bytes.byteLength - 1 > MAX_SESSION_LINE_BYTES) {
    throw new SessionStoreError(
      "SESSION_LINE_TOO_LARGE",
      "Serialized session record exceeds the line limit",
    );
  }
  return bytes;
}

function serializeSession(
  header: SessionHeader,
  entries: readonly SessionEntry[],
): Buffer {
  const parts = [serializeLine(header), ...entries.map(serializeLine)];
  const bytes = Buffer.concat(parts);
  if (bytes.byteLength > MAX_SESSION_FILE_BYTES) {
    throw new SessionStoreError(
      "SESSION_FILE_TOO_LARGE",
      "Serialized session exceeds the file limit",
    );
  }
  return bytes;
}

function freezeHeader(value: SessionHeader): SessionHeader {
  return Object.freeze(value);
}

function freezeEntry(value: SessionEntry): SessionEntry {
  return Object.freeze(value);
}

function exactRecord(
  value: unknown,
  keys: readonly string[],
): Record<string, unknown> | undefined {
  const record = ownDataRecord(value);
  if (record === undefined) return undefined;
  try {
    assertExactKeys(record, keys);
    const snapshot: Record<string, unknown> = {};
    for (const key of keys) snapshot[key] = ownDataValue(record, key);
    return snapshot;
  } catch {
    return undefined;
  }
}

function ownDataRecord(
  value: unknown,
): Record<string, PropertyDescriptor> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return undefined;
  return Object.getOwnPropertyDescriptors(value);
}

function ownDataValue(
  descriptors: Record<string, PropertyDescriptor>,
  key: string,
): unknown {
  const descriptor = descriptors[key];
  if (
    descriptor === undefined ||
    !("value" in descriptor) ||
    !descriptor.enumerable
  ) {
    throw new Error(`Property "${key}" must be enumerable data`);
  }
  return descriptor.value;
}

function assertExactKeys(
  descriptors: Record<string, PropertyDescriptor>,
  expected: readonly string[],
): void {
  const actual = Object.keys(descriptors).filter(
    (key) => key !== "length" && descriptors[key].enumerable,
  );
  if (
    actual.length !== expected.length ||
    expected.some((key) => !actual.includes(key))
  ) {
    throw new Error("Object contains missing or unsupported properties");
  }
  for (const key of expected) ownDataValue(descriptors, key);
}

function snapshotFunction<Return>(
  options: SessionStoreOptions,
  key: "clock" | "idFactory",
  fallback: () => Return,
): () => Return {
  const descriptor = Object.getOwnPropertyDescriptor(options, key);
  if (descriptor === undefined) return fallback;
  if (!("value" in descriptor) || typeof descriptor.value !== "function") {
    throw new TypeError(
      `Session option ${key} must be a function-valued property`,
    );
  }
  return descriptor.value as () => Return;
}

function snapshotOptionalString(
  options: SessionStoreOptions,
  key: "sessionId",
  code: SessionStoreErrorCode,
): string | undefined {
  let descriptor: PropertyDescriptor | undefined;
  try {
    descriptor = Object.getOwnPropertyDescriptor(options, key);
  } catch (cause) {
    throw new SessionStoreError(code, `Session option ${key} is invalid`, {
      cause,
    });
  }
  if (descriptor === undefined) return undefined;
  if (!("value" in descriptor) || !isNonEmptyString(descriptor.value)) {
    throw new SessionStoreError(
      code,
      `Session option ${key} must be a non-empty string data property`,
    );
  }
  return descriptor.value;
}

function snapshotSessionStoreFileSystem(
  options: SessionStoreOptions,
): SessionStoreFileSystem {
  const optionDescriptor = Object.getOwnPropertyDescriptor(
    options,
    "fileSystem",
  );
  if (optionDescriptor === undefined) return defaultSessionStoreFileSystem;
  if (!("value" in optionDescriptor)) {
    throw new TypeError("Session option fileSystem must be a data property");
  }
  if (optionDescriptor.value === undefined) {
    return defaultSessionStoreFileSystem;
  }
  const descriptors = ownDataRecord(optionDescriptor.value);
  if (descriptors === undefined) {
    throw new TypeError("Session option fileSystem must be a plain object");
  }
  const supported = ["lstat", "link", "rename", "remove"] as const;
  const unsupported = Object.keys(descriptors).filter(
    (key) => descriptors[key].enumerable && !supported.includes(key as never),
  );
  if (unsupported.length > 0) {
    throw new TypeError("Session option fileSystem has unsupported operations");
  }
  return Object.freeze({
    lstat: snapshotFileSystemOperation(descriptors, "lstat"),
    link: snapshotFileSystemOperation(descriptors, "link"),
    rename: snapshotFileSystemOperation(descriptors, "rename"),
    remove: snapshotFileSystemOperation(descriptors, "remove"),
  });
}

function snapshotFileSystemOperation<Key extends keyof SessionStoreFileSystem>(
  descriptors: Record<string, PropertyDescriptor>,
  key: Key,
): SessionStoreFileSystem[Key] {
  const descriptor = descriptors[key];
  if (descriptor === undefined) return defaultSessionStoreFileSystem[key];
  if (!("value" in descriptor) || typeof descriptor.value !== "function") {
    throw new TypeError(
      `Session fileSystem operation ${key} must be a function-valued property`,
    );
  }
  return descriptor.value as SessionStoreFileSystem[Key];
}

async function assertNoRecoveryMarker(
  sessionPath: string,
  fileSystem: SessionStoreFileSystem,
): Promise<void> {
  try {
    await fileSystem.lstat(`${sessionPath}.pify-session-recovery`);
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === "ENOENT") return;
    throw cause;
  }
  throw new SessionStoreError(
    "SESSION_ROLLBACK_FAILED",
    "Session recovery is required before this file can be opened",
  );
}

async function writeAll(handle: FileHandle, bytes: Buffer): Promise<void> {
  let offset = 0;
  while (offset < bytes.byteLength) {
    const result = await handle.write(
      bytes,
      offset,
      bytes.byteLength - offset,
      offset,
    );
    if (
      !Number.isSafeInteger(result.bytesWritten) ||
      result.bytesWritten <= 0 ||
      result.bytesWritten > bytes.byteLength - offset
    ) {
      throw new Error("Session write made invalid progress");
    }
    offset += result.bytesWritten;
  }
}

async function withSessionPathLock<Result>(
  key: string,
  operation: () => Promise<Result>,
): Promise<Result> {
  const predecessor = sessionPathLocks.get(key) ?? Promise.resolve();
  let release: (() => void) | undefined;
  const gate = new Promise<void>((resolveGate) => {
    release = resolveGate;
  });
  const tail = predecessor.then(() => gate);
  sessionPathLocks.set(key, tail);
  await predecessor;
  try {
    return await operation();
  } finally {
    release?.();
    if (sessionPathLocks.get(key) === tail) sessionPathLocks.delete(key);
  }
}

function canonicalSessionKey(path: string, root: RootIdentity): string {
  const key = resolve(root.realPath, basename(path));
  return process.platform === "win32" ? key.toLocaleLowerCase("en-US") : key;
}

async function captureRoot(path: string): Promise<RootIdentity> {
  const absolutePath = resolve(path);
  const stats = await lstat(absolutePath, { bigint: true });
  if (!stats.isDirectory()) {
    throw new SessionStoreError(
      "SESSION_ROOT_CHANGED",
      "Session parent must be a directory",
    );
  }
  return Object.freeze({
    path: absolutePath,
    realPath: await realpath(absolutePath),
    file: identityFromStats(stats),
  });
}

async function assertRoot(expected: RootIdentity): Promise<void> {
  try {
    const stats = await lstat(expected.path, { bigint: true });
    const resolved = await realpath(expected.path);
    if (
      !stats.isDirectory() ||
      resolved !== expected.realPath ||
      !sameIdentity(identityFromStats(stats), expected.file)
    ) {
      throw new Error("changed");
    }
  } catch (cause) {
    throw new SessionStoreError(
      "SESSION_ROOT_CHANGED",
      "Session parent directory changed",
      { cause },
    );
  }
}

async function assertPathIdentity(
  path: string,
  expected: FileIdentity,
  expectedSize?: number,
): Promise<void> {
  try {
    const stats = await lstat(path, { bigint: true });
    if (
      !stats.isFile() ||
      !sameIdentity(identityFromStats(stats), expected) ||
      (expectedSize !== undefined && stats.size !== BigInt(expectedSize))
    ) {
      throw new Error("changed");
    }
  } catch (cause) {
    if (cause instanceof SessionStoreError) throw cause;
    throw new SessionStoreError(
      "SESSION_FILE_CHANGED",
      "Session file identity changed",
      { cause },
    );
  }
}

function identityFromStats(stats: {
  dev: bigint;
  ino: bigint;
  birthtimeNs: bigint;
}): FileIdentity {
  return Object.freeze({
    dev: stats.dev,
    ino: stats.ino,
    birthtimeNs: stats.birthtimeNs,
  });
}

function sameIdentity(left: FileIdentity, right: FileIdentity): boolean {
  return (
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.birthtimeNs === right.birthtimeNs
  );
}

async function cleanupOwnedPath(
  path: string,
  expected: FileIdentity,
  expectedSize: number | undefined,
  fileSystem: SessionStoreFileSystem,
): Promise<boolean> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const stats = await fileSystem.lstat(path);
      if (
        !stats.isFile() ||
        !sameIdentity(identityFromStats(stats), expected) ||
        (expectedSize !== undefined && stats.size !== BigInt(expectedSize))
      ) {
        return false;
      }
      await fileSystem.remove(path);
      return true;
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code === "ENOENT") return true;
    }
  }
  return false;
}

async function pathMatchesIdentity(
  path: string,
  expected: FileIdentity,
  expectedSize: number,
  fileSystem: SessionStoreFileSystem,
): Promise<boolean> {
  try {
    const stats = await fileSystem.lstat(path);
    return (
      stats.isFile() &&
      sameIdentity(identityFromStats(stats), expected) &&
      stats.size === BigInt(expectedSize)
    );
  } catch {
    return false;
  }
}

async function syncDirectory(path: string): Promise<void> {
  let handle;
  try {
    handle = await open(path, "r");
    await handle.sync();
  } catch (cause) {
    const code = (cause as NodeJS.ErrnoException).code;
    if (code !== "EINVAL" && code !== "ENOTSUP" && code !== "EPERM") {
      throw cause;
    }
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

function assertSessionPath(path: string): string {
  if (!isNonEmptyString(path)) throw new TypeError("Session path is required");
  return resolve(path);
}

function assertNonEmptyString(
  value: unknown,
  label: string,
  code: SessionStoreErrorCode,
): asserts value is string {
  if (!isNonEmptyString(value)) {
    throw new SessionStoreError(code, `${label} must be a non-empty string`);
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
