import { expect, test, vi } from "vitest";

import {
  ContextCompactionError,
  MAX_CONTEXT_DEPTH,
  MAX_CONTEXT_TOTAL_UNITS,
  assistantMessage,
  buildActiveContext,
  compactContext,
  estimateContextUnits,
  groupToolRounds,
  selectCompactionBoundary,
  toolResultMessage,
  userMessage,
  type ContextSummarizer,
  type CourseMessage,
} from "../src/index";

type Deferred<Value> = Readonly<{
  promise: Promise<Value>;
  resolve: (value: Value | PromiseLike<Value>) => void;
  reject: (reason?: unknown) => void;
}>;

function deferred<Value>(): Deferred<Value> {
  let resolve!: (value: Value | PromiseLike<Value>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<Value>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function nextEventLoopTurn(): Promise<void> {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => {
      channel.port1.close();
      channel.port2.close();
      resolve();
    };
    channel.port2.postMessage(undefined);
  });
}

function listenForUnhandledRejections(
  listener: (reason: unknown) => void,
): () => void {
  process.on("unhandledRejection", listener);
  return () => process.removeListener("unhandledRejection", listener);
}

function creatorObservedLockedRejection(message: string): Readonly<{
  promise: Promise<never>;
  creatorObservation: Promise<unknown>;
}> {
  const source = deferred<never>();
  const creatorObservation = Reflect.apply(
    Promise.prototype.then,
    source.promise,
    [undefined, () => undefined],
  );
  Object.defineProperties(source.promise, {
    constructor: {
      get() {
        throw new Error("locked hostile Promise constructor getter");
      },
    },
    then: { value: undefined },
  });
  source.reject(new Error(message));
  return { promise: source.promise, creatorObservation };
}

function toolTranscript(): readonly CourseMessage[] {
  return [
    userMessage({ id: "old-user", content: "Inspect both files." }),
    assistantMessage({
      id: "tool-round",
      content: [
        { type: "text", text: "I will read both. " },
        {
          type: "toolCall",
          id: "call-a",
          name: "read",
          arguments: { path: "a.txt" },
        },
        {
          type: "toolCall",
          id: "call-b",
          name: "read",
          arguments: { path: "b.txt" },
        },
        { type: "text", text: "Then I will compare them." },
      ],
    }),
    toolResultMessage({
      id: "result-a",
      toolCallId: "call-a",
      toolName: "read",
      content: "alpha",
    }),
    toolResultMessage({
      id: "result-b",
      toolCallId: "call-b",
      toolName: "read",
      content: "beta",
    }),
    userMessage({ id: "recent-user", content: "What changed?" }),
  ];
}

function compactionOptions(
  context: ReturnType<typeof buildActiveContext>,
  summarizer: ContextSummarizer,
  summaryMaxUnits: number,
  signal?: AbortSignal,
) {
  return {
    maxUnits: estimateContextUnits(context) - 1,
    targetUnits:
      estimateContextUnits(
        buildActiveContext({
          requirements: context.requirements,
          messages: [context.messages.at(-1)!],
        }),
      ) + summaryMaxUnits,
    summaryMaxUnits,
    retainRecentMessages: 1,
    summaryId: "summary-001",
    recordId: "compaction-001",
    summarizer,
    signal,
  } as const;
}

async function expectContextError(
  promise: Promise<unknown>,
  code: ContextCompactionError["code"],
): Promise<void> {
  await expect(promise).rejects.toBeInstanceOf(ContextCompactionError);
  await expect(promise).rejects.toMatchObject({ code });
}

test("groups every Tool call with all of its results and keeps adjacent text", () => {
  const transcript = toolTranscript();
  const groups = groupToolRounds(transcript);

  expect(
    groups.map(({ kind, startIndex, endIndex, messages }) => ({
      kind,
      startIndex,
      endIndex,
      roles: messages.map((message) => message.role),
    })),
  ).toEqual([
    { kind: "message", startIndex: 0, endIndex: 1, roles: ["user"] },
    {
      kind: "toolRound",
      startIndex: 1,
      endIndex: 4,
      roles: ["assistant", "toolResult", "toolResult"],
    },
    { kind: "message", startIndex: 4, endIndex: 5, roles: ["user"] },
  ]);
  expect(Object.isFrozen(groups)).toBe(true);
  expect(groups.every((group) => Object.isFrozen(group))).toBe(true);
  expect(groups.every((group) => Object.isFrozen(group.messages))).toBe(true);
});

test("merges overlapping Tool intervals instead of exposing an unsafe boundary", () => {
  const transcript = [
    assistantMessage({
      id: "assistant-a",
      content: [
        {
          type: "toolCall",
          id: "call-a",
          name: "read",
          arguments: {},
        },
      ],
    }),
    assistantMessage({
      id: "assistant-b",
      content: [
        {
          type: "toolCall",
          id: "call-b",
          name: "read",
          arguments: {},
        },
      ],
    }),
    toolResultMessage({
      id: "result-b",
      toolCallId: "call-b",
      toolName: "read",
      content: "b",
    }),
    toolResultMessage({
      id: "result-a",
      toolCallId: "call-a",
      toolName: "read",
      content: "a",
    }),
  ];

  expect(groupToolRounds(transcript)).toMatchObject([
    { kind: "toolRound", startIndex: 0, endIndex: 4 },
  ]);
});

test("calculates an exact deterministic budget in Unicode code points", () => {
  const ascii = buildActiveContext({
    requirements: [{ id: "r", content: "AB" }],
    messages: [userMessage({ id: "u", content: "a" })],
  });
  const unicode = buildActiveContext({
    requirements: [{ id: "r", content: "AB" }],
    messages: [userMessage({ id: "u", content: "😀" })],
  });

  // requirement: 3 + 1 + 2; user: 4 + 1 + 1
  expect(estimateContextUnits(ascii)).toBe(12);
  expect(estimateContextUnits(unicode)).toBe(12);
  expect(estimateContextUnits(unicode)).toBe(
    estimateContextUnits(buildActiveContext(unicode)),
  );
});

test("selects the first safe boundary that reaches the target budget", () => {
  const context = buildActiveContext({
    requirements: [{ id: "system", content: "Never invent file contents." }],
    messages: toolTranscript(),
  });
  const summaryMaxUnits = estimateContextUnits(
    buildActiveContext({ summary: { id: "summary-001", content: "summary" } }),
  );
  const targetUnits =
    estimateContextUnits(
      buildActiveContext({
        requirements: context.requirements,
        messages: [context.messages[4]],
      }),
    ) + summaryMaxUnits;

  expect(
    selectCompactionBoundary(context, {
      targetUnits,
      summaryMaxUnits,
      retainRecentMessages: 1,
    }),
  ).toBe(4);
  expect(
    selectCompactionBoundary(context, {
      targetUnits: summaryMaxUnits,
      summaryMaxUnits,
      retainRecentMessages: context.messages.length,
    }),
  ).toBeNull();
});

test("compacts a safe prefix, retains requirements and recent messages, and inserts a summary", async () => {
  const context = buildActiveContext({
    requirements: [{ id: "system", content: "Never invent file contents." }],
    messages: toolTranscript(),
  });
  const summary = { id: "summary-001", content: "Read a.txt and b.txt." };
  const summaryMaxUnits = estimateContextUnits(buildActiveContext({ summary }));
  const requests: unknown[] = [];
  const summarizer: ContextSummarizer = async (request) => {
    requests.push(request);
    return summary.content;
  };

  const result = await compactContext(
    context,
    compactionOptions(context, summarizer, summaryMaxUnits),
  );

  expect(result.status).toBe("compacted");
  if (result.status !== "compacted") throw new Error("compaction expected");
  expect(result.context.requirements).toEqual(context.requirements);
  expect(result.context.summary).toEqual(summary);
  expect(result.context.messages.map((message) => message.id)).toEqual([
    "recent-user",
  ]);
  expect(result.context.compactions).toHaveLength(1);
  expect(result.record).toMatchObject({
    id: "compaction-001",
    summaryId: "summary-001",
    boundary: 4,
    compactedMessageIds: ["old-user", "tool-round", "result-a", "result-b"],
    unitsBefore: estimateContextUnits(context),
    unitsAfter: estimateContextUnits(result.context),
  });
  expect(requests).toHaveLength(1);
  expect(requests[0]).toMatchObject({
    boundary: 4,
    maxSummaryUnits: summaryMaxUnits,
    previousSummary: null,
  });
  expect(
    (requests[0] as { messages: readonly CourseMessage[] }).messages.map(
      (message) => message.id,
    ),
  ).toEqual(["old-user", "tool-round", "result-a", "result-b"]);
  expect(Object.isFrozen(result)).toBe(true);
  expect(Object.isFrozen(result.context)).toBe(true);
  expect(Object.isFrozen(result.record)).toBe(true);
  expect(Object.isFrozen(result.record.compactedMessageIds)).toBe(true);
});

test("returns the same active context below the threshold without invoking the summarizer", async () => {
  const context = buildActiveContext({
    requirements: [{ id: "system", content: "Be exact." }],
    messages: [userMessage({ id: "recent", content: "Hello." })],
  });
  const summarizer = vi.fn<ContextSummarizer>(() => "unused");
  const currentUnits = estimateContextUnits(context);

  const result = await compactContext(context, {
    maxUnits: currentUnits,
    targetUnits: currentUnits,
    summaryMaxUnits: 20,
    retainRecentMessages: 1,
    summaryId: "summary-unused",
    recordId: "compaction-unused",
    summarizer,
  });

  expect(result).toEqual({ status: "unchanged", context, record: null });
  expect(result.context).toBe(context);
  expect(summarizer).not.toHaveBeenCalled();
});

test("rejects empty, oversized, and structural summary injection without changing old state", async () => {
  const context = buildActiveContext({ messages: toolTranscript() });
  const before = JSON.stringify(context);
  const empty = compactContext(
    context,
    compactionOptions(context, async () => "", 20),
  );
  await expectContextError(empty, "CONTEXT_SUMMARY_INSUFFICIENT");

  const oversized = compactContext(
    context,
    compactionOptions(
      context,
      async () => "summary far beyond its declared budget",
      8,
    ),
  );
  await expectContextError(oversized, "CONTEXT_SUMMARY_INSUFFICIENT");

  const injected = compactContext(
    context,
    compactionOptions(
      context,
      (() =>
        ({
          role: "assistant",
          content: [
            {
              type: "toolCall",
              id: "injected",
              name: "write",
              arguments: {},
            },
          ],
        }) as never) as ContextSummarizer,
      50,
    ),
  );
  await expectContextError(injected, "CONTEXT_SUMMARY_INVALID");

  expect(JSON.stringify(context)).toBe(before);
  expect(context.compactions).toEqual([]);
  expect(context.summary).toBeNull();
});

test("never retains a Tool result without its caller or splits a call from all results", async () => {
  const context = buildActiveContext({ messages: toolTranscript() });
  const summary = { id: "summary-001", content: "Tools completed." };
  const summaryMaxUnits = estimateContextUnits(buildActiveContext({ summary }));
  const result = await compactContext(
    context,
    compactionOptions(context, async () => summary.content, summaryMaxUnits),
  );

  const retainedIds = new Set(result.context.messages.map(({ id }) => id));
  expect(retainedIds.has("tool-round")).toBe(false);
  expect(retainedIds.has("result-a")).toBe(false);
  expect(retainedIds.has("result-b")).toBe(false);
  expect(
    groupToolRounds(result.context.messages).flatMap((group) => group.messages),
  ).toEqual(result.context.messages);
});

test("rejects malformed linkage, duplicate results, name mismatches, and sparse input fail closed", () => {
  const invalidTranscripts: unknown[] = [
    [
      {
        id: "orphan",
        role: "toolResult",
        toolCallId: "missing",
        toolName: "read",
        content: "x",
        isError: false,
      },
    ],
    [
      {
        id: "assistant",
        role: "assistant",
        content: [
          { type: "toolCall", id: "call", name: "read", arguments: {} },
        ],
      },
      {
        id: "result-a",
        role: "toolResult",
        toolCallId: "call",
        toolName: "read",
        content: "a",
        isError: false,
      },
      {
        id: "result-b",
        role: "toolResult",
        toolCallId: "call",
        toolName: "read",
        content: "b",
        isError: false,
      },
    ],
    [
      {
        id: "assistant",
        role: "assistant",
        content: [
          { type: "toolCall", id: "call", name: "read", arguments: {} },
        ],
      },
      {
        id: "result",
        role: "toolResult",
        toolCallId: "call",
        toolName: "write",
        content: "x",
        isError: false,
      },
    ],
    new Array(1),
  ];

  for (const messages of invalidTranscripts) {
    expect(() => buildActiveContext({ messages } as never)).toThrowError(
      expect.objectContaining({ code: "CONTEXT_INVALID_TRANSCRIPT" }),
    );
    expect(() => groupToolRounds(messages)).toThrowError(
      expect.objectContaining({ code: "CONTEXT_INVALID_TRANSCRIPT" }),
    );
  }
});

test("rejects accessor-backed and excessively deep hostile input without invoking it", () => {
  let reads = 0;
  const hostile = Object.defineProperty(
    { id: "hostile", content: "hidden" },
    "role",
    {
      enumerable: true,
      get() {
        reads += 1;
        return "user";
      },
    },
  );

  expect(() => buildActiveContext({ messages: [hostile] } as never)).toThrow();
  expect(reads).toBe(0);

  let value: Record<string, unknown> = { leaf: true };
  for (let index = 0; index <= MAX_CONTEXT_DEPTH; index += 1) {
    value = { nested: value };
  }
  expect(() =>
    buildActiveContext({
      messages: [
        {
          id: "deep",
          role: "assistant",
          content: [
            {
              type: "toolCall",
              id: "deep-call",
              name: "inspect",
              arguments: value,
            },
          ],
        },
        {
          id: "deep-result",
          role: "toolResult",
          toolCallId: "deep-call",
          toolName: "inspect",
          content: "done",
          isError: false,
        },
      ],
    } as never),
  ).toThrowError(expect.objectContaining({ code: "CONTEXT_LIMIT_EXCEEDED" }));
});

test("enforces the aggregate input budget before inspecting later hostile messages", () => {
  const content = "x".repeat(Math.floor(MAX_CONTEXT_TOTAL_UNITS / 16) + 1);
  const messages: unknown[] = Array.from({ length: 16 }, (_, index) => ({
    id: `large-${index}`,
    role: "user",
    content,
  }));
  const late = Object.defineProperty(
    { id: "late", content: "must not be reached" },
    "role",
    {
      enumerable: true,
      get(): string {
        throw new Error("late hostile getter");
      },
    },
  );
  messages.push(late);

  expect(() => buildActiveContext({ messages } as never)).toThrowError(
    expect.objectContaining({ code: "CONTEXT_LIMIT_EXCEEDED" }),
  );
});

test("rejects cancellation before the summarizer and does not call it", async () => {
  const context = buildActiveContext({ messages: toolTranscript() });
  const controller = new AbortController();
  controller.abort("stop before summary");
  const summarizer = vi.fn<ContextSummarizer>(() => "unused");

  const operation = compactContext(
    context,
    compactionOptions(context, summarizer, 30, controller.signal),
  );
  await expectContextError(operation, "CONTEXT_CANCELLED");
  expect(summarizer).not.toHaveBeenCalled();
  expect(context.compactions).toEqual([]);
});

test("settles cancellation during the summarizer and observes a late rejection", async () => {
  const context = buildActiveContext({ messages: toolTranscript() });
  const controller = new AbortController();
  const entered = deferred<void>();
  const late = deferred<string>();
  const summarizer: ContextSummarizer = () => {
    entered.resolve();
    return late.promise;
  };

  const operation = compactContext(
    context,
    compactionOptions(context, summarizer, 30, controller.signal),
  );
  await entered.promise;
  controller.abort("stop during summary");
  await expectContextError(operation, "CONTEXT_CANCELLED");
  late.reject(new Error("late summary failure"));
  await Promise.resolve();
  await Promise.resolve();
  expect(context.compactions).toEqual([]);
});

test("honors cancellation selected while a thenable resolves", async () => {
  const context = buildActiveContext({ messages: toolTranscript() });
  const controller = new AbortController();
  const summarizer = (() => ({
    then(resolve: (value: string) => void) {
      resolve("summary");
      controller.abort("stop after summary");
    },
  })) as unknown as ContextSummarizer;

  await expectContextError(
    compactContext(
      context,
      compactionOptions(context, summarizer, 30, controller.signal),
    ),
    "CONTEXT_CANCELLED",
  );
  expect(context.compactions).toEqual([]);
});

test("normalizes thrown, rejected, and malformed thenable failures", async () => {
  const context = buildActiveContext({ messages: toolTranscript() });
  const failures: ContextSummarizer[] = [
    () => {
      throw new Error("thrown");
    },
    async () => {
      throw new Error("rejected");
    },
    (() =>
      Object.defineProperty({}, "then", {
        get() {
          throw new Error("malformed thenable");
        },
      })) as unknown as ContextSummarizer,
  ];

  for (const summarizer of failures) {
    await expectContextError(
      compactContext(context, compactionOptions(context, summarizer, 30)),
      "CONTEXT_SUMMARIZER_FAILED",
    );
  }
  expect(context.compactions).toEqual([]);
});

test("observes a late native rejection before reading hostile Promise metadata", async () => {
  const context = buildActiveContext({ messages: toolTranscript() });
  const source = deferred<string>();
  Object.defineProperties(source.promise, {
    constructor: {
      configurable: true,
      get() {
        throw new Error("hostile Promise constructor getter");
      },
    },
    then: { configurable: true, value: undefined },
  });
  const unhandled: unknown[] = [];
  const removeListener = listenForUnhandledRejections((reason) => {
    unhandled.push(reason);
  });

  const operation = compactContext(
    context,
    compactionOptions(context, () => source.promise, 30),
  );
  source.reject(new Error("late hostile Promise rejection"));
  await expectContextError(operation, "CONTEXT_SUMMARIZER_FAILED");
  await nextEventLoopTurn();
  await nextEventLoopTurn();
  removeListener();
  expect(unhandled).toEqual([]);
  expect(context.compactions).toEqual([]);
});

test("fails promptly for a Proxy Promise under an explicit creator-observation contract", async () => {
  const context = buildActiveContext({ messages: toolTranscript() });
  const source = deferred<never>();
  const creatorObservation = Reflect.apply(
    Promise.prototype.then,
    source.promise,
    [undefined, () => undefined],
  );
  const proxy = new Proxy(source.promise, {});
  const operation = compactContext(
    context,
    compactionOptions(
      context,
      (() => proxy) as unknown as ContextSummarizer,
      30,
    ),
  );

  await expectContextError(operation, "CONTEXT_ASYNC_VALUE_UNOBSERVABLE");
  source.reject(new Error("creator observes hidden target"));
  await creatorObservation;
  expect(context.compactions).toEqual([]);
});

test("fails stably for a creator-observed locked native Promise", async () => {
  const context = buildActiveContext({ messages: toolTranscript() });
  const locked = creatorObservedLockedRejection("locked summary rejection");
  const operation = compactContext(
    context,
    compactionOptions(
      context,
      (() => locked.promise) as unknown as ContextSummarizer,
      30,
    ),
  );

  await expectContextError(operation, "CONTEXT_ASYNC_VALUE_UNOBSERVABLE");
  await locked.creatorObservation;
  expect(context.compactions).toEqual([]);
});

test("observes a rejected Promise returned by a custom thenable after fulfillment", async () => {
  const context = buildActiveContext({ messages: toolTranscript() });
  const unhandled: unknown[] = [];
  const removeListener = listenForUnhandledRejections((reason) => {
    unhandled.push(reason);
  });
  const summarizer = (() => ({
    then(resolve: (value: string) => void) {
      resolve("Observed detached return.");
      return Promise.reject(new Error("detached then return rejected"));
    },
  })) as unknown as ContextSummarizer;

  const result = await compactContext(
    context,
    compactionOptions(context, summarizer, 60),
  );
  expect(result.status).toBe("compacted");
  await nextEventLoopTurn();
  await nextEventLoopTurn();
  removeListener();
  expect(unhandled).toEqual([]);
});

test("rejects a recursively assimilated thenable chain at a bounded depth", async () => {
  const context = buildActiveContext({ messages: toolTranscript() });
  let value: unknown = "too deep";
  for (let index = 0; index < 80; index += 1) {
    const next = value;
    value = {
      then(resolve: (result: unknown) => void) {
        resolve(next);
      },
    };
  }

  await expectContextError(
    compactContext(
      context,
      compactionOptions(
        context,
        (() => value) as unknown as ContextSummarizer,
        30,
      ),
    ),
    "CONTEXT_SUMMARIZER_FAILED",
  );
});

test("rejects a missing safe boundary without calling the summarizer", async () => {
  const context = buildActiveContext({ messages: toolTranscript() });
  const summarizer = vi.fn<ContextSummarizer>(() => "unused");

  const operation = compactContext(context, {
    ...compactionOptions(context, summarizer, 30),
    retainRecentMessages: context.messages.length,
  });
  await expectContextError(operation, "CONTEXT_BOUNDARY_UNAVAILABLE");
  expect(summarizer).not.toHaveBeenCalled();
});

test("carries the prior summary into a later compaction and appends one immutable record", async () => {
  const firstRecord = {
    id: "compaction-000",
    summaryId: "summary-000",
    boundary: 1,
    compactedMessageIds: ["earlier"],
    unitsBefore: 100,
    unitsAfter: 50,
  } as const;
  const context = buildActiveContext({
    summary: { id: "summary-000", content: "Earlier work." },
    messages: toolTranscript(),
    compactions: [firstRecord],
  });
  let previousSummary: unknown;
  const nextSummary = { id: "summary-001", content: "All prior work." };
  const max = estimateContextUnits(
    buildActiveContext({ summary: nextSummary }),
  );

  const result = await compactContext(
    context,
    compactionOptions(
      context,
      (request) => {
        previousSummary = request.previousSummary;
        return nextSummary.content;
      },
      max,
    ),
  );

  expect(previousSummary).toEqual(context.summary);
  expect(result.context.compactions.map(({ id }) => id)).toEqual([
    "compaction-000",
    "compaction-001",
  ]);
  expect(context.compactions.map(({ id }) => id)).toEqual(["compaction-000"]);
});
