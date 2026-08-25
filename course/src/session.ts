import { lstat, open, realpath, rename, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname, resolve } from "node:path";

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
  recovered: boolean;
}>;

const textDecoder = new TextDecoder("utf-8", { fatal: true });

export class SessionStore {
  readonly #path: string;
  readonly #root: RootIdentity;
  readonly #clock: () => string;
  readonly #idFactory: () => string;
  readonly #header: SessionHeader;
  readonly #entries: SessionEntry[];
  readonly #entryById: Map<string, SessionEntry>;
  #fileIdentity: FileIdentity;
  #fileSize: number;
  #needsRecovery: boolean;
  #queue: Promise<void> = Promise.resolve();

  private constructor(input: {
    path: string;
    root: RootIdentity;
    fileIdentity: FileIdentity;
    fileSize: number;
    header: SessionHeader;
    entries: readonly SessionEntry[];
    recovered: boolean;
    clock: () => string;
    idFactory: () => string;
  }) {
    this.#path = input.path;
    this.#root = input.root;
    this.#fileIdentity = input.fileIdentity;
    this.#fileSize = input.fileSize;
    this.#header = input.header;
    this.#entries = [...input.entries];
    this.#entryById = new Map(
      input.entries.map((entry) => [entry.id, entry] as const),
    );
    this.#needsRecovery = input.recovered;
    this.#clock = input.clock;
    this.#idFactory = input.idFactory;
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
      const written = await handle.write(bytes, 0, bytes.byteLength, 0);
      if (written.bytesWritten !== bytes.byteLength) {
        throw new Error("Session header write was incomplete");
      }
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
        recovered: false,
        clock,
        idFactory,
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
      recovered: parsed.recovered,
      clock,
      idFactory,
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
    const bytes = serializeLine(entry);
    if (this.#needsRecovery) await this.#atomicRewrite();
    await this.#assertStorageIdentity();
    if (this.#fileSize + bytes.byteLength > MAX_SESSION_FILE_BYTES) {
      throw new SessionStoreError(
        "SESSION_FILE_TOO_LARGE",
        "Appending the record would exceed the session file limit",
      );
    }

    const handle = await open(this.#path, "r+");
    try {
      const opened = await handle.stat({ bigint: true });
      if (!sameIdentity(identityFromStats(opened), this.#fileIdentity)) {
        throw new SessionStoreError(
          "SESSION_FILE_CHANGED",
          "Session file changed before append",
        );
      }
      if (opened.size !== BigInt(this.#fileSize)) {
        throw new SessionStoreError(
          "SESSION_FILE_CHANGED",
          "Session file size changed before append",
        );
      }
      const written = await handle.write(
        bytes,
        0,
        bytes.byteLength,
        this.#fileSize,
      );
      if (written.bytesWritten !== bytes.byteLength) {
        await handle.sync();
        throw new Error("Session append was incomplete");
      }
      await handle.sync();
    } finally {
      await handle.close();
    }
    await assertRoot(this.#root);
    await assertPathIdentity(
      this.#path,
      this.#fileIdentity,
      this.#fileSize + bytes.byteLength,
    );
    this.#fileSize += bytes.byteLength;
    this.#entries.push(entry);
    this.#entryById.set(entry.id, entry);
    return entry;
  }

  async #atomicRewrite(): Promise<void> {
    await this.#assertStorageIdentity();
    const bytes = serializeSession(this.#header, this.#entries);
    const temporaryPath = `${this.#path}.pify-session-${process.pid}-${randomUUID()}`;
    let temporaryIdentity: FileIdentity | undefined;
    let handle;
    try {
      handle = await open(temporaryPath, "wx", 0o600);
      const stats = await handle.stat({ bigint: true });
      if (!stats.isFile()) {
        throw new Error("Session temporary is not a regular file");
      }
      temporaryIdentity = identityFromStats(stats);
      const written = await handle.write(bytes, 0, bytes.byteLength, 0);
      if (written.bytesWritten !== bytes.byteLength) {
        throw new Error("Session flush write was incomplete");
      }
      await handle.sync();
      await handle.close();
      handle = undefined;
      await this.#assertStorageIdentity();
      await assertPathIdentity(
        temporaryPath,
        temporaryIdentity,
        bytes.byteLength,
      );
      await rename(temporaryPath, this.#path);
      const installed = await lstat(this.#path, { bigint: true });
      const installedIdentity = identityFromStats(installed);
      if (!sameIdentity(installedIdentity, temporaryIdentity)) {
        throw new SessionStoreError(
          "SESSION_FILE_CHANGED",
          "Installed session file identity is unexpected",
        );
      }
      this.#fileIdentity = installedIdentity;
      this.#fileSize = bytes.byteLength;
      this.#needsRecovery = false;
      await syncDirectory(this.#root.path);
    } finally {
      await handle?.close().catch(() => undefined);
      if (temporaryIdentity !== undefined) {
        await removeExactTemporary(temporaryPath, temporaryIdentity);
      }
    }
  }

  async #assertStorageIdentity(): Promise<void> {
    await assertRoot(this.#root);
    await assertPathIdentity(this.#path, this.#fileIdentity, this.#fileSize);
  }

  #enqueue<Result>(task: () => Promise<Result>): Promise<Result> {
    const result = this.#queue.then(task);
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

  public moveTo(entryId: string | null): void {
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
  }

  public async append(message: CourseMessage): Promise<SessionEntry> {
    const parentId = this.#activeLeafId;
    const entry = await this.#store.append(parentId, message);
    this.#activeLeafId = entry.id;
    return entry;
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
  let recovered = false;
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
      if (isIncompleteFinal) {
        recovered = true;
        break;
      }
      throw new SessionStoreError(
        "SESSION_INVALID_UTF8",
        `Session line ${index + 1} is not valid UTF-8`,
        { cause },
      );
    }
    try {
      values.push(JSON.parse(text) as unknown);
    } catch (cause) {
      if (isIncompleteFinal) {
        recovered = true;
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
    recovered: recovered || !hasTrailingNewline,
  });
}

function parseHeader(value: unknown): SessionHeader {
  const record = exactRecord(value, ["type", "version", "id", "createdAt"]);
  if (record === undefined || record.type !== "session") {
    throw new SessionStoreError(
      "SESSION_INVALID_HEADER",
      "First session record must be a header",
    );
  }
  if (record.version !== SESSION_FORMAT_VERSION) {
    throw new SessionStoreError(
      "SESSION_UNSUPPORTED_VERSION",
      `Unsupported session version ${String(record.version)}`,
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
  if (record.version !== SESSION_FORMAT_VERSION) {
    throw new SessionStoreError(
      "SESSION_UNSUPPORTED_VERSION",
      `Unsupported entry version ${String(record.version)}`,
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

async function removeExactTemporary(
  path: string,
  expected: FileIdentity,
): Promise<void> {
  try {
    const stats = await lstat(path, { bigint: true });
    if (stats.isFile() && sameIdentity(identityFromStats(stats), expected)) {
      await rm(path, { force: true });
    }
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code !== "ENOENT") throw cause;
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
