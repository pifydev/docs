import {
  access,
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

  tree.moveTo(root.id);
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

  tree.moveTo(root.id);
  expect(await readFile(sessionPath, "utf8")).toBe(beforeMove);
  const branched = await tree.append(user("message-003", "branch"));
  expect(branched.parentId).toBe(root.id);

  tree.moveTo(null);
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

test("fails closed for invalid UTF-8 except an incomplete final byte sequence", async () => {
  const valid = Buffer.from(`${headerLine()}\n${entryLine()}\n`, "utf8");
  await writeFile(
    sessionPath,
    Buffer.concat([valid, Buffer.from([0x7b, 0xc3])]),
  );
  await expect(
    SessionStore.load(sessionPath, deterministicOptions()),
  ).resolves.toMatchObject({ entries: [{ id: "entry-001" }] });

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
  expect(() => tree.moveTo("entry-missing")).toThrowError(SessionStoreError);
  expect(() => tree.moveTo("entry-missing")).toThrowError(
    expect.objectContaining({ code: "SESSION_ENTRY_NOT_FOUND" }),
  );
});
