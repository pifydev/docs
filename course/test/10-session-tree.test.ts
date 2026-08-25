import {
  access,
  link as createLink,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, expect, test } from "vitest";

import {
  MAX_SESSION_FILE_BYTES,
  MAX_SESSION_LINE_BYTES,
  MAX_SESSION_RECORDS,
  SESSION_FORMAT_VERSION,
  SessionStore,
  SessionStoreError,
  SessionTree,
  type CourseMessage,
  type SessionEntry,
} from "../src/index";

const temporaryDirectories: string[] = [];
let workspace: string;
let sessionPath: string;

beforeEach(async () => {
  workspace = await mkdtemp(join(tmpdir(), "pify-course-10-session-"));
  temporaryDirectories.push(workspace);
  sessionPath = join(workspace, "session.jsonl");
});

afterEach(async () => {
  while (temporaryDirectories.length > 0) {
    const directory = temporaryDirectories.pop();
    if (directory !== undefined) {
      await rm(directory, { recursive: true, force: true });
    }
  }
});

function deterministicOptions() {
  let id = 0;
  let tick = 0;
  return {
    sessionId: "session-001",
    idFactory: () => `entry-${String(++id).padStart(3, "0")}`,
    clock: () => `2026-08-26T00:00:${String(++tick).padStart(2, "0")}.000Z`,
  };
}

function user(id: string, content: string): CourseMessage {
  return { id, role: "user", content };
}

function headerLine(): string {
  return JSON.stringify({
    type: "session",
    version: SESSION_FORMAT_VERSION,
    id: "session-001",
    createdAt: "2026-08-26T00:00:01.000Z",
  });
}

function entryLine(entry: Partial<SessionEntry> = {}): string {
  return JSON.stringify({
    type: "entry",
    version: SESSION_FORMAT_VERSION,
    id: "entry-001",
    parentId: null,
    timestamp: "2026-08-26T00:00:02.000Z",
    message: user("message-001", "hello"),
    ...entry,
  });
}

async function expectSessionError(
  promise: Promise<unknown>,
  code: string,
): Promise<void> {
  await expect(promise).rejects.toMatchObject({ code });
}

test("creates a versioned session header and one durable JSON object per line", async () => {
  const store = await SessionStore.create(sessionPath, deterministicOptions());

  expect(store.header).toEqual({
    type: "session",
    version: SESSION_FORMAT_VERSION,
    id: "session-001",
    createdAt: "2026-08-26T00:00:01.000Z",
  });
  expect(Object.isFrozen(store.header)).toBe(true);
  expect(store.entries).toEqual([]);
  const raw = await readFile(sessionPath, "utf8");
  expect(raw).toBe(`${headerLine()}\n`);
});

test("appends records in call order with deterministic IDs, timestamps, and parents", async () => {
  const store = await SessionStore.create(sessionPath, deterministicOptions());
  const first = await store.append(null, user("message-001", "first"));
  const second = await store.append(first.id, user("message-002", "second"));

  expect(store.entries).toEqual([first, second]);
  expect(first).toMatchObject({
    type: "entry",
    version: SESSION_FORMAT_VERSION,
    id: "entry-001",
    parentId: null,
    timestamp: "2026-08-26T00:00:02.000Z",
  });
  expect(second).toMatchObject({
    id: "entry-002",
    parentId: "entry-001",
    timestamp: "2026-08-26T00:00:03.000Z",
  });
  expect(
    (await readFile(sessionPath, "utf8")).trimEnd().split("\n"),
  ).toHaveLength(3);
});

test("branches from an earlier entry while retaining inactive descendants", async () => {
  const store = await SessionStore.create(sessionPath, deterministicOptions());
  const tree = new SessionTree(store);
  const root = await tree.append(user("message-001", "root"));
  const oldLeaf = await tree.append(user("message-002", "old branch"));

  await tree.moveTo(root.id);
  const newLeaf = await tree.append(user("message-003", "new branch"));

  expect(newLeaf.parentId).toBe(root.id);
  expect(tree.activeLeafId).toBe(newLeaf.id);
  expect(tree.activeMessages.map((message) => message.content)).toEqual([
    "root",
    "new branch",
  ]);
  expect(tree.entries.map((entry) => entry.id)).toEqual([
    root.id,
    oldLeaf.id,
    newLeaf.id,
  ]);
  expect(tree.entries.find((entry) => entry.id === oldLeaf.id)).toBe(oldLeaf);
});

test("moving the active leaf is in-memory only and controls the next parent", async () => {
  const store = await SessionStore.create(sessionPath, deterministicOptions());
  const tree = new SessionTree(store);
  const root = await tree.append(user("message-001", "root"));
  await tree.append(user("message-002", "child"));
  const beforeMove = await readFile(sessionPath, "utf8");

  await tree.moveTo(root.id);
  expect(await readFile(sessionPath, "utf8")).toBe(beforeMove);
  const branched = await tree.append(user("message-003", "branch"));
  expect(branched.parentId).toBe(root.id);

  await tree.moveTo(null);
  expect(tree.activeEntries).toEqual([]);
  const secondRoot = await tree.append(user("message-004", "second root"));
  expect(secondRoot.parentId).toBeNull();
});

test("reloads CRLF and valid final records with no trailing newline", async () => {
  const lines = [
    headerLine(),
    entryLine(),
    entryLine({
      id: "entry-002",
      parentId: "entry-001",
      message: user("message-002", "xin chào ✓"),
    }),
  ];
  await writeFile(sessionPath, lines.join("\r\n"), "utf8");

  const store = await SessionStore.load(sessionPath, deterministicOptions());
  const tree = new SessionTree(store);
  expect(tree.activeMessages.map((message) => message.content)).toEqual([
    "hello",
    "xin chào ✓",
  ]);
  expect(tree.activeLeafId).toBe("entry-002");
});

test("canonicalizes a valid final record with no newline before the next append", async () => {
  await writeFile(sessionPath, `${headerLine()}\n${entryLine()}`, "utf8");
  const options = deterministicOptions();
  options.idFactory = () => "entry-002";
  const store = await SessionStore.load(sessionPath, options);

  await store.append("entry-001", user("message-002", "after reload"));

  const reloaded = await SessionStore.load(sessionPath, deterministicOptions());
  expect(reloaded.entries.map((entry) => entry.id)).toEqual([
    "entry-001",
    "entry-002",
  ]);
});

test("ignores only an incomplete final JSONL record", async () => {
  await writeFile(
    sessionPath,
    `${headerLine()}\n${entryLine()}\n{"type":"entry","id":"cut`,
    "utf8",
  );

  const store = await SessionStore.load(sessionPath, deterministicOptions());
  expect(store.entries.map((entry) => entry.id)).toEqual(["entry-001"]);
  expect(await readFile(sessionPath, "utf8")).toContain('"id":"cut');

  const options = deterministicOptions();
  options.idFactory = () => "entry-002";
  const recovered = await SessionStore.load(sessionPath, options);
  await recovered.append("entry-001", user("message-002", "after recovery"));
  const canonical = await readFile(sessionPath, "utf8");
  expect(canonical).not.toContain('"id":"cut');
  await expect(
    SessionStore.load(sessionPath, deterministicOptions()),
  ).resolves.toMatchObject({
    entries: [{ id: "entry-001" }, { id: "entry-002" }],
  });
});

test("rejects arbitrary or syntactically complete corruption in an unterminated tail", async () => {
  for (const tail of [
    "not-json",
    `${entryLine()}TRAIL`,
    '{"type":"entry",,"id":"broken"',
    '{"type":"entry","id":truX',
  ]) {
    await writeFile(sessionPath, `${headerLine()}\n${tail}`, "utf8");
    await expectSessionError(
      SessionStore.load(sessionPath, deterministicOptions()),
      "SESSION_INVALID_JSON",
    );
  }
});

test("fails closed for malformed complete middle and final records", async () => {
  for (const [name, raw] of [
    ["middle", `${headerLine()}\nnot-json\n${entryLine()}\n`],
    ["final", `${headerLine()}\n${entryLine()}\nnot-json\n`],
  ] as const) {
    await writeFile(sessionPath, raw, "utf8");
    await expectSessionError(
      SessionStore.load(sessionPath, deterministicOptions()),
      "SESSION_INVALID_JSON",
    );
    expect(name).toMatch(/middle|final/);
  }
});

test("fails closed for invalid UTF-8 including an unterminated final byte sequence", async () => {
  const valid = Buffer.from(`${headerLine()}\n${entryLine()}\n`, "utf8");
  await writeFile(
    sessionPath,
    Buffer.concat([valid, Buffer.from([0x7b, 0xc3])]),
  );
  await expectSessionError(
    SessionStore.load(sessionPath, deterministicOptions()),
    "SESSION_INVALID_UTF8",
  );

  await writeFile(
    sessionPath,
    Buffer.concat([
      Buffer.from(`${headerLine()}\n`, "utf8"),
      Buffer.from([0xc3, 0x0a]),
    ]),
  );
  await expectSessionError(
    SessionStore.load(sessionPath, deterministicOptions()),
    "SESSION_INVALID_UTF8",
  );
});

test("rejects duplicate entry IDs and missing parents during reload", async () => {
  for (const [raw, code] of [
    [
      `${headerLine()}\n${entryLine()}\n${entryLine({ message: user("message-002", "duplicate") })}\n`,
      "SESSION_DUPLICATE_ENTRY_ID",
    ],
    [
      `${headerLine()}\n${entryLine({ parentId: "entry-missing" })}\n`,
      "SESSION_PARENT_NOT_FOUND",
    ],
  ] as const) {
    await writeFile(sessionPath, raw, "utf8");
    await expectSessionError(
      SessionStore.load(sessionPath, deterministicOptions()),
      code,
    );
  }
});

test("validates loaded headers, records, messages, and branch-local Tool linkage", async () => {
  const invalidDocuments = [
    {
      raw: `${JSON.stringify({ type: "session", version: 99, id: "session-001", createdAt: "now" })}\n`,
      code: "SESSION_UNSUPPORTED_VERSION",
    },
    {
      raw: `${headerLine()}\n${entryLine({ message: { id: "x", role: "admin", content: "no" } as never })}\n`,
      code: "SESSION_INVALID_MESSAGE",
    },
    {
      raw: `${headerLine()}\n${entryLine({
        message: {
          id: "result-001",
          role: "toolResult",
          toolCallId: "missing",
          toolName: "read_file",
          content: "no",
          isError: false,
        },
      })}\n`,
      code: "SESSION_INVALID_TOOL_LINKAGE",
    },
  ];
  for (const fixture of invalidDocuments) {
    await writeFile(sessionPath, fixture.raw, "utf8");
    await expectSessionError(
      SessionStore.load(sessionPath, deterministicOptions()),
      fixture.code,
    );
  }
});

test("reports hostile non-primitive header and entry versions without coercion", async () => {
  const hostileVersion = { toString: null, valueOf: null };
  const hostileHeader = JSON.stringify({
    type: "session",
    version: hostileVersion,
    id: "session-001",
    createdAt: "2026-08-26T00:00:01.000Z",
  });
  const hostileEntry = JSON.stringify({
    type: "entry",
    version: hostileVersion,
    id: "entry-001",
    parentId: null,
    timestamp: "2026-08-26T00:00:02.000Z",
    message: user("message-001", "hello"),
  });

  for (const raw of [
    `${hostileHeader}\n`,
    `${headerLine()}\n${hostileEntry}\n`,
  ]) {
    await writeFile(sessionPath, raw, "utf8");
    await expect(
      SessionStore.load(sessionPath, deterministicOptions()),
    ).rejects.toEqual(
      expect.objectContaining({
        name: "SessionStoreError",
        code: "SESSION_UNSUPPORTED_VERSION",
      }),
    );
  }
});

test("rejects duplicate generated IDs and missing append parents without writing", async () => {
  const options = deterministicOptions();
  options.idFactory = () => "entry-same";
  const store = await SessionStore.create(sessionPath, options);
  const first = await store.append(null, user("message-001", "first"));
  const before = await readFile(sessionPath, "utf8");

  await expectSessionError(
    store.append(first.id, user("message-002", "duplicate")),
    "SESSION_DUPLICATE_ENTRY_ID",
  );
  await expectSessionError(
    store.append("entry-missing", user("message-003", "missing")),
    "SESSION_PARENT_NOT_FOUND",
  );
  expect(await readFile(sessionPath, "utf8")).toBe(before);
  expect(store.entries).toHaveLength(1);
});

test("snapshots and freezes messages without invoking hostile accessors", async () => {
  const store = await SessionStore.create(sessionPath, deterministicOptions());
  const input = user("message-001", "before") as {
    id: string;
    role: "user";
    content: string;
  };
  const entry = await store.append(null, input);
  input.content = "after";
  expect(entry.message).toEqual(user("message-001", "before"));
  expect(Object.isFrozen(entry)).toBe(true);
  expect(Object.isFrozen(entry.message)).toBe(true);
  expect(Object.isFrozen(store.entries)).toBe(true);

  let reads = 0;
  const hostile = Object.defineProperty({ id: "bad", content: "bad" }, "role", {
    enumerable: true,
    get() {
      reads += 1;
      return "user";
    },
  });
  await expectSessionError(
    store.append(entry.id, hostile as never),
    "SESSION_INVALID_MESSAGE",
  );
  expect(reads).toBe(0);
});

test("rejects accessor-backed creation options without invoking them", async () => {
  let reads = 0;
  const options = Object.defineProperty(
    {
      clock: () => "2026-08-26T00:00:01.000Z",
      idFactory: () => "entry-001",
    },
    "sessionId",
    {
      enumerable: true,
      get() {
        reads += 1;
        return "session-001";
      },
    },
  );

  await expectSessionError(
    SessionStore.create(sessionPath, options),
    "SESSION_INVALID_HEADER",
  );
  expect(reads).toBe(0);
  await expect(access(sessionPath)).rejects.toMatchObject({ code: "ENOENT" });
});

test("serializes concurrent appends and flushes without losing records", async () => {
  const store = await SessionStore.create(sessionPath, deterministicOptions());
  const appended = await Promise.all([
    store.append(null, user("message-001", "one")),
    store.append(null, user("message-002", "two")),
    store.flush(),
    store.append(null, user("message-003", "three")),
    store.flush(),
  ]);

  expect(appended.filter((value) => value !== undefined)).toMatchObject([
    { id: "entry-001" },
    { id: "entry-002" },
    { id: "entry-003" },
  ]);
  const reloaded = await SessionStore.load(sessionPath, deterministicOptions());
  expect(reloaded.entries.map((entry) => entry.id)).toEqual([
    "entry-001",
    "entry-002",
    "entry-003",
  ]);
  expect(
    (await readdir(workspace)).filter((name) =>
      name.includes(".pify-session-"),
    ),
  ).toEqual([]);
});

test("serializes independent stores for one file and rejects the stale generation", async () => {
  const firstOptions = deterministicOptions();
  firstOptions.idFactory = () => "entry-first";
  const firstStore = await SessionStore.create(sessionPath, firstOptions);
  const secondOptions = deterministicOptions();
  secondOptions.idFactory = () => "entry-second";
  const secondStore = await SessionStore.load(sessionPath, secondOptions);
  const originalIdentity = await lstat(sessionPath, { bigint: true });
  const probe = await open(sessionPath, "r");
  const fileHandlePrototype = Object.getPrototypeOf(probe) as {
    stat: (options: { bigint: true }) => Promise<{
      dev: bigint;
      ino: bigint;
    }>;
  };
  const originalStat = fileHandlePrototype.stat;
  await probe.close();
  let destinationHandles = 0;
  let releaseDestinationHandles: (() => void) | undefined;
  const bothDestinationHandles = new Promise<void>((resolve) => {
    releaseDestinationHandles = resolve;
  });
  fileHandlePrototype.stat = async function (options) {
    const stats = await originalStat.call(this, options);
    if (
      stats.dev === originalIdentity.dev &&
      stats.ino === originalIdentity.ino
    ) {
      destinationHandles += 1;
      if (destinationHandles === 2) releaseDestinationHandles?.();
      await bothDestinationHandles;
    }
    return stats;
  };

  let outcomes: PromiseSettledResult<SessionEntry>[];
  try {
    outcomes = await Promise.allSettled([
      firstStore.append(null, user("message-first", "aaaaa")),
      secondStore.append(null, user("message-second", "bbbbb")),
    ]);
  } finally {
    fileHandlePrototype.stat = originalStat;
  }

  expect(
    outcomes.filter((outcome) => outcome.status === "fulfilled"),
  ).toHaveLength(1);
  const rejected = outcomes.find((outcome) => outcome.status === "rejected");
  expect(rejected).toMatchObject({
    status: "rejected",
    reason: { code: "SESSION_FILE_CHANGED" },
  });
  const winner = outcomes.find((outcome) => outcome.status === "fulfilled");
  if (winner?.status !== "fulfilled") throw new Error("Missing winning append");
  const reloaded = await SessionStore.load(sessionPath, deterministicOptions());
  expect(reloaded.entries).toHaveLength(1);
  expect(reloaded.entries[0]).toEqual(winner.value);
});

test("atomically flushes a reloadable snapshot and leaves no temporary siblings", async () => {
  const store = await SessionStore.create(sessionPath, deterministicOptions());
  await store.append(null, user("message-001", "persisted"));
  await store.flush();

  const raw = await readFile(sessionPath, "utf8");
  expect(raw.endsWith("\n")).toBe(true);
  expect(raw.trimEnd().split("\n")).toHaveLength(2);
  await expect(
    SessionStore.load(sessionPath, deterministicOptions()),
  ).resolves.toMatchObject({ entries: [{ id: "entry-001" }] });
  expect(
    (await readdir(workspace)).filter((name) =>
      name.includes(".pify-session-"),
    ),
  ).toEqual([]);
});

test("preserves the existing file and removes its exact temporary after flush I/O failure", async () => {
  const store = await SessionStore.create(sessionPath, deterministicOptions());
  await store.append(null, user("message-001", "keep"));
  const before = await readFile(sessionPath, "utf8");
  const probe = await open(sessionPath, "r");
  const fileHandlePrototype = Object.getPrototypeOf(probe) as {
    sync: () => Promise<void>;
  };
  const originalSync = fileHandlePrototype.sync;
  await probe.close();
  fileHandlePrototype.sync = async () => {
    throw new Error("injected sync failure");
  };

  try {
    await expect(store.flush()).rejects.toThrowError("injected sync failure");
  } finally {
    fileHandlePrototype.sync = originalSync;
  }

  expect(await readFile(sessionPath, "utf8")).toBe(before);
  expect(store.entries.map((entry) => entry.id)).toEqual(["entry-001"]);
  expect(
    (await readdir(workspace)).filter((name) =>
      name.includes(".pify-session-"),
    ),
  ).toEqual([]);
});

test("rolls back an append after a partial temporary write and permits retry", async () => {
  const store = await SessionStore.create(sessionPath, deterministicOptions());
  const before = await readFile(sessionPath, "utf8");
  const probe = await open(sessionPath, "r");
  const fileHandlePrototype = Object.getPrototypeOf(probe) as {
    write: (
      buffer: Uint8Array,
      offset?: number,
      length?: number,
      position?: number | null,
    ) => Promise<{ bytesWritten: number; buffer: Uint8Array }>;
  };
  const originalWrite = fileHandlePrototype.write;
  await probe.close();
  let writeCalls = 0;
  fileHandlePrototype.write = async function (
    buffer,
    offset = 0,
    length = buffer.byteLength - offset,
    position = null,
  ) {
    writeCalls += 1;
    if (writeCalls > 1) throw new Error("injected write failure");
    const partialLength = Math.max(1, Math.floor(length / 2));
    return originalWrite.call(this, buffer, offset, partialLength, position);
  };

  try {
    await expect(
      store.append(null, user("message-001", "first attempt")),
    ).rejects.toThrow();
  } finally {
    fileHandlePrototype.write = originalWrite;
  }

  expect(writeCalls).toBe(2);
  expect(await readFile(sessionPath, "utf8")).toBe(before);
  expect(store.entries).toEqual([]);
  expect(
    (await readdir(workspace)).filter((name) =>
      name.includes(".pify-session-"),
    ),
  ).toEqual([]);
  await expect(
    store.append(null, user("message-002", "retry")),
  ).resolves.toMatchObject({ id: "entry-002" });
});

test("rolls back an append after temporary fsync failure and permits retry", async () => {
  const store = await SessionStore.create(sessionPath, deterministicOptions());
  const before = await readFile(sessionPath, "utf8");
  const probe = await open(sessionPath, "r");
  const fileHandlePrototype = Object.getPrototypeOf(probe) as {
    sync: () => Promise<void>;
  };
  const originalSync = fileHandlePrototype.sync;
  await probe.close();
  fileHandlePrototype.sync = async () => {
    throw new Error("injected append sync failure");
  };

  try {
    await expect(
      store.append(null, user("message-001", "first attempt")),
    ).rejects.toThrowError("injected append sync failure");
  } finally {
    fileHandlePrototype.sync = originalSync;
  }

  expect(await readFile(sessionPath, "utf8")).toBe(before);
  expect(store.entries).toEqual([]);
  expect(
    (await readdir(workspace)).filter((name) =>
      name.includes(".pify-session-"),
    ),
  ).toEqual([]);
  await expect(
    store.append(null, user("message-002", "retry")),
  ).resolves.toMatchObject({ id: "entry-002" });
});

test("cleans an exclusively linked backup when its first lstat fails", async () => {
  let backupLinked = false;
  let failBackupLstat = true;
  const removed: string[] = [];
  const options = {
    ...deterministicOptions(),
    fileSystem: {
      async link(source: string, destination: string) {
        await createLink(source, destination);
        backupLinked = true;
      },
      async lstat(path: string) {
        if (
          backupLinked &&
          failBackupLstat &&
          path.endsWith(".pify-session-recovery")
        ) {
          failBackupLstat = false;
          throw Object.assign(new Error("injected backup lstat failure"), {
            code: "EIO",
          });
        }
        return lstat(path, { bigint: true });
      },
      async remove(path: string) {
        removed.push(path);
        await rm(path, { force: true });
      },
    },
  };
  const store = await SessionStore.create(sessionPath, options);
  const before = await readFile(sessionPath, "utf8");

  await expect(
    store.append(null, user("message-001", "first attempt")),
  ).rejects.toMatchObject({ code: "EIO" });

  expect(await readFile(sessionPath, "utf8")).toBe(before);
  expect(store.entries).toEqual([]);
  expect(removed.some((path) => path.endsWith(".pify-session-recovery"))).toBe(
    true,
  );
  expect(
    (await readdir(workspace)).filter((name) =>
      name.includes(".pify-session-"),
    ),
  ).toEqual([]);
  await expect(
    store.append(null, user("message-002", "retry")),
  ).resolves.toMatchObject({ id: "entry-002" });
});

test("retries a transient rollback rename and restores the old generation", async () => {
  let rollbackRenameAttempts = 0;
  const options = {
    ...deterministicOptions(),
    fileSystem: {
      async rename(source: string, destination: string) {
        if (source.endsWith(".pify-session-recovery")) {
          rollbackRenameAttempts += 1;
          if (rollbackRenameAttempts === 1) {
            throw Object.assign(
              new Error("injected transient rename failure"),
              {
                code: "EBUSY",
              },
            );
          }
        }
        await rename(source, destination);
      },
    },
  };
  const store = await SessionStore.create(sessionPath, options);
  const before = await readFile(sessionPath, "utf8");
  const probe = await open(sessionPath, "r");
  const fileHandlePrototype = Object.getPrototypeOf(probe) as {
    stat: (options: {
      bigint: true;
    }) => Promise<{ isDirectory: () => boolean }>;
    sync: () => Promise<void>;
  };
  const originalStat = fileHandlePrototype.stat;
  const originalSync = fileHandlePrototype.sync;
  await probe.close();
  fileHandlePrototype.sync = async function () {
    const stats = await originalStat.call(this, { bigint: true });
    if (stats.isDirectory()) throw new Error("injected directory sync failure");
    await originalSync.call(this);
  };

  try {
    await expect(
      store.append(null, user("message-001", "first attempt")),
    ).rejects.toThrowError("injected directory sync failure");
  } finally {
    fileHandlePrototype.sync = originalSync;
  }

  expect(await readFile(sessionPath, "utf8")).toBe(before);
  expect(rollbackRenameAttempts).toBe(2);
  expect(store.entries).toEqual([]);
  expect(
    (await readdir(workspace)).filter((name) =>
      name.includes(".pify-session-"),
    ),
  ).toEqual([]);
  await expect(
    store.append(null, user("message-002", "retry")),
  ).resolves.toMatchObject({ id: "entry-002" });
});

test("preserves a deterministic recovery backup when rollback cannot restore", async () => {
  let installedNewGeneration = false;
  let rollbackRenameAttempts = 0;
  const removed: string[] = [];
  const options = {
    ...deterministicOptions(),
    fileSystem: {
      async rename(source: string, destination: string) {
        if (!installedNewGeneration && source.includes(".pify-session-")) {
          await rename(source, destination);
          installedNewGeneration = true;
          return;
        }
        rollbackRenameAttempts += 1;
        throw Object.assign(new Error("injected persistent rename failure"), {
          code: "EBUSY",
        });
      },
      async remove(path: string) {
        removed.push(path);
        await rm(path, { force: true });
      },
    },
  };
  const store = await SessionStore.create(sessionPath, options);
  const before = await readFile(sessionPath, "utf8");
  const probe = await open(sessionPath, "r");
  const fileHandlePrototype = Object.getPrototypeOf(probe) as {
    stat: (options: {
      bigint: true;
    }) => Promise<{ isDirectory: () => boolean }>;
    sync: () => Promise<void>;
  };
  const originalStat = fileHandlePrototype.stat;
  const originalSync = fileHandlePrototype.sync;
  await probe.close();
  fileHandlePrototype.sync = async function () {
    const stats = await originalStat.call(this, { bigint: true });
    if (stats.isDirectory()) throw new Error("injected directory sync failure");
    await originalSync.call(this);
  };

  try {
    await expect(
      store.append(null, user("message-001", "must not adopt")),
    ).rejects.toMatchObject({
      name: "SessionStoreError",
      code: "SESSION_ROLLBACK_FAILED",
    });
  } finally {
    fileHandlePrototype.sync = originalSync;
  }

  const recoveryPath = `${sessionPath}.pify-session-recovery`;
  expect(await readFile(recoveryPath, "utf8")).toBe(before);
  expect(store.entries).toEqual([]);
  expect(rollbackRenameAttempts).toBeGreaterThanOrEqual(3);
  expect(removed).not.toContain(recoveryPath);
  await expect(store.flush()).rejects.toMatchObject({
    code: "SESSION_ROLLBACK_FAILED",
  });
  await expect(
    SessionStore.load(sessionPath, deterministicOptions()),
  ).rejects.toMatchObject({ code: "SESSION_ROLLBACK_FAILED" });
  expect(await readFile(recoveryPath, "utf8")).toBe(before);
});

test("rolls back instead of adopting memory when recovery marker removal is denied", async () => {
  let denyRecoveryRemoval = true;
  let recoveryRemoveAttempts = 0;
  const options = {
    ...deterministicOptions(),
    fileSystem: {
      async remove(path: string) {
        if (denyRecoveryRemoval && path.endsWith(".pify-session-recovery")) {
          recoveryRemoveAttempts += 1;
          throw Object.assign(new Error("injected recovery remove failure"), {
            code: "EACCES",
          });
        }
        await rm(path, { force: true });
      },
    },
  };
  const store = await SessionStore.create(sessionPath, options);
  const before = await readFile(sessionPath, "utf8");

  await expect(
    store.append(null, user("message-001", "must roll back")),
  ).rejects.toMatchObject({ code: "SESSION_ROLLBACK_FAILED" });

  const recoveryPath = `${sessionPath}.pify-session-recovery`;
  expect(recoveryRemoveAttempts).toBeGreaterThanOrEqual(3);
  expect(await readFile(sessionPath, "utf8")).toBe(before);
  expect(store.entries).toEqual([]);
  await expect(access(recoveryPath)).rejects.toMatchObject({ code: "ENOENT" });

  denyRecoveryRemoval = false;
  await expect(
    store.append(null, user("message-002", "retry")),
  ).resolves.toMatchObject({ id: "entry-002" });
});

test("retains the old marker and poisons the store when cleanup and rollback both fail", async () => {
  let installedNewGeneration = false;
  let rollbackRenameAttempts = 0;
  const options = {
    ...deterministicOptions(),
    fileSystem: {
      async rename(source: string, destination: string) {
        if (!installedNewGeneration && source.includes(".pify-session-")) {
          await rename(source, destination);
          installedNewGeneration = true;
          return;
        }
        rollbackRenameAttempts += 1;
        throw Object.assign(new Error("injected persistent rollback failure"), {
          code: "EBUSY",
        });
      },
      async remove(path: string) {
        if (path.endsWith(".pify-session-recovery")) {
          throw Object.assign(new Error("injected persistent remove failure"), {
            code: "EACCES",
          });
        }
        await rm(path, { force: true });
      },
    },
  };
  const store = await SessionStore.create(sessionPath, options);
  const before = await readFile(sessionPath, "utf8");

  await expect(
    store.append(null, user("message-001", "must stay recoverable")),
  ).rejects.toMatchObject({ code: "SESSION_ROLLBACK_FAILED" });

  const recoveryPath = `${sessionPath}.pify-session-recovery`;
  expect(rollbackRenameAttempts).toBeGreaterThanOrEqual(3);
  expect(await readFile(recoveryPath, "utf8")).toBe(before);
  expect(store.entries).toEqual([]);
  await expect(store.flush()).rejects.toMatchObject({
    code: "SESSION_ROLLBACK_FAILED",
  });
  await expect(
    SessionStore.load(sessionPath, deterministicOptions()),
  ).rejects.toMatchObject({ code: "SESSION_ROLLBACK_FAILED" });
  expect(await readFile(recoveryPath, "utf8")).toBe(before);
});

test("normalizes a preexisting recovery-marker collision without deleting it", async () => {
  const removed: string[] = [];
  const options = {
    ...deterministicOptions(),
    fileSystem: {
      async remove(path: string) {
        removed.push(path);
        await rm(path, { force: true });
      },
    },
  };
  const store = await SessionStore.create(sessionPath, options);
  const before = await readFile(sessionPath, "utf8");
  const recoveryPath = `${sessionPath}.pify-session-recovery`;
  await createLink(sessionPath, recoveryPath);

  await expect(
    store.append(null, user("message-001", "blocked by marker")),
  ).rejects.toMatchObject({ code: "SESSION_ROLLBACK_FAILED" });

  expect(await readFile(sessionPath, "utf8")).toBe(before);
  expect(await readFile(recoveryPath, "utf8")).toBe(before);
  expect(removed).not.toContain(recoveryPath);
  expect(store.entries).toEqual([]);
  await expect(store.flush()).rejects.toMatchObject({
    code: "SESSION_ROLLBACK_FAILED",
  });
});

test("linearizes concurrent tree appends into an invocation-ordered chain", async () => {
  const store = await SessionStore.create(sessionPath, deterministicOptions());
  const tree = new SessionTree(store);

  const first = tree.append(user("message-001", "first"));
  const second = tree.append(user("message-002", "second"));
  const [firstEntry, secondEntry] = await Promise.all([first, second]);

  expect(firstEntry.parentId).toBeNull();
  expect(secondEntry.parentId).toBe(firstEntry.id);
  expect(tree.activeLeafId).toBe(secondEntry.id);
  expect(tree.activeMessages.map((message) => message.content)).toEqual([
    "first",
    "second",
  ]);
});

test("linearizes moveTo after pending appends and does not overwrite the move", async () => {
  const store = await SessionStore.create(sessionPath, deterministicOptions());
  const tree = new SessionTree(store);

  const appended = tree.append(user("message-001", "first"));
  const movedToNewEntry = Promise.resolve().then(() =>
    tree.moveTo("entry-001"),
  );
  const movedToRoot = Promise.resolve().then(() => tree.moveTo(null));
  const outcomes = await Promise.allSettled([
    appended,
    movedToNewEntry,
    movedToRoot,
  ]);

  expect(outcomes.every((outcome) => outcome.status === "fulfilled")).toBe(
    true,
  );
  expect(tree.activeLeafId).toBeNull();
  expect(tree.activeEntries).toEqual([]);
  expect(tree.entries.map((entry) => entry.id)).toEqual(["entry-001"]);
});

test("continues queued tree operations after an append failure", async () => {
  const options = deterministicOptions();
  const generatedIds = ["entry-001", "entry-001", "entry-002"];
  options.idFactory = () => generatedIds.shift() ?? "entry-unexpected";
  const store = await SessionStore.create(sessionPath, options);
  const tree = new SessionTree(store);
  await tree.append(user("message-001", "existing"));

  const failed = tree.append(user("message-002", "duplicate"));
  const recovered = tree.append(user("message-003", "recovered"));

  await expect(failed).rejects.toMatchObject({
    code: "SESSION_DUPLICATE_ENTRY_ID",
  });
  await expect(recovered).resolves.toMatchObject({
    id: "entry-002",
    parentId: "entry-001",
  });
  expect(tree.activeLeafId).toBe("entry-002");
});

test("detects root replacement and preserves both disk and memory on failure", async () => {
  const store = await SessionStore.create(sessionPath, deterministicOptions());
  await store.append(null, user("message-001", "keep"));
  const original = await readFile(sessionPath, "utf8");
  const moved = `${workspace}-moved`;
  temporaryDirectories.push(moved);
  await rename(workspace, moved);
  await mkdir(workspace);

  await expectSessionError(store.flush(), "SESSION_ROOT_CHANGED");
  await expectSessionError(
    store.append("entry-001", user("message-002", "blocked")),
    "SESSION_ROOT_CHANGED",
  );
  expect(store.entries).toHaveLength(1);
  expect(await readFile(join(moved, "session.jsonl"), "utf8")).toBe(original);
  await expect(access(sessionPath)).rejects.toMatchObject({ code: "ENOENT" });
});

test("detects file replacement before append without mutating memory", async () => {
  const store = await SessionStore.create(sessionPath, deterministicOptions());
  await store.append(null, user("message-001", "keep"));
  const replacement = join(workspace, "replacement.jsonl");
  await writeFile(replacement, `${headerLine()}\n`, "utf8");
  await rm(sessionPath);
  await rename(replacement, sessionPath);

  await expectSessionError(
    store.append("entry-001", user("message-002", "blocked")),
    "SESSION_FILE_CHANGED",
  );
  expect(store.entries.map((entry) => entry.id)).toEqual(["entry-001"]);
  expect(await readFile(sessionPath, "utf8")).toBe(`${headerLine()}\n`);
});

test("enforces documented file, line, and record bounds", async () => {
  expect(SESSION_FORMAT_VERSION).toBe(1);
  expect(MAX_SESSION_LINE_BYTES).toBe(65_536);
  expect(MAX_SESSION_FILE_BYTES).toBe(4_194_304);
  expect(MAX_SESSION_RECORDS).toBe(4_096);

  await writeFile(
    sessionPath,
    `${headerLine()}\n${"x".repeat(MAX_SESSION_LINE_BYTES + 1)}\n`,
    "utf8",
  );
  await expectSessionError(
    SessionStore.load(sessionPath, deterministicOptions()),
    "SESSION_LINE_TOO_LARGE",
  );

  await writeFile(sessionPath, Buffer.alloc(MAX_SESSION_FILE_BYTES + 1, 0x61));
  await expectSessionError(
    SessionStore.load(sessionPath, deterministicOptions()),
    "SESSION_FILE_TOO_LARGE",
  );

  const tooManyRecords = Array.from(
    { length: MAX_SESSION_RECORDS + 1 },
    (_, index) =>
      entryLine({
        id: `entry-${index + 1}`,
        message: user(`message-${index + 1}`, "x"),
      }),
  );
  await writeFile(
    sessionPath,
    `${headerLine()}\n${tooManyRecords.join("\n")}\n`,
    "utf8",
  );
  await expectSessionError(
    SessionStore.load(sessionPath, deterministicOptions()),
    "SESSION_RECORD_LIMIT",
  );
});

test("uses a stable typed error surface for invalid active leaves", async () => {
  const store = await SessionStore.create(sessionPath, deterministicOptions());
  const tree = new SessionTree(store);
  await expect(
    Promise.resolve().then(() => tree.moveTo("entry-missing")),
  ).rejects.toBeInstanceOf(SessionStoreError);
  await expect(
    Promise.resolve().then(() => tree.moveTo("entry-missing")),
  ).rejects.toMatchObject({ code: "SESSION_ENTRY_NOT_FOUND" });
});
