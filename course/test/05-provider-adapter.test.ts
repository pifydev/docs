import { readFileSync } from "node:fs";

import { expect, test, vi } from "vitest";

import providerToolRoundtrip from "../fixtures/provider-tool-roundtrip.json" with { type: "json" };
import {
  FixtureProviderAdapter,
  FixtureProviderError,
  ScriptedModel,
  type CourseModelChunk,
  type CourseModelRequest,
  type CourseModelResponse,
  type ScriptedResponseFactory,
} from "../src/index";

type Deferred<Value> = Readonly<{
  promise: Promise<Value>;
  resolve: (value: Value | PromiseLike<Value>) => void;
}>;

function deferred<Value>(): Deferred<Value> {
  let resolve!: (value: Value | PromiseLike<Value>) => void;
  const promise = new Promise<Value>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function request(id: string): CourseModelRequest {
  return {
    id,
    messages: [
      {
        id: `message-${id}`,
        role: "user",
        content: "Use the fixture transport.",
      },
    ],
  };
}

function fixtureWith(records: unknown): unknown {
  return { schemaVersion: 1, responses: [{ records }] };
}

function textRecords(
  responseId: string,
  deltas: readonly string[] = ["done"],
): readonly unknown[] {
  return [
    { type: "response_start", responseId, role: "assistant" },
    ...deltas.map((text) => ({ type: "text_delta", text })),
    {
      type: "response_end",
      responseId,
      stopReason: "stop",
      usage: { inputTokens: 7, outputTokens: 3 },
    },
  ];
}

async function collect<Value>(source: AsyncIterable<Value>): Promise<Value[]> {
  const values: Value[] = [];
  for await (const value of source) values.push(value);
  return values;
}

async function settleStream(
  stream: AsyncIterable<CourseModelChunk> & {
    readonly result: Promise<CourseModelResponse>;
  },
) {
  return Promise.allSettled([collect(stream), stream.result]);
}

function loadRoundtripFixture(): unknown {
  return providerToolRoundtrip;
}

function providerAdapterSource(): string {
  return readFileSync(
    new URL("../src/provider-adapter.ts", import.meta.url),
    "utf8",
  );
}

function asyncTextRecords(responseId: string): AsyncIterable<unknown> {
  return {
    async *[Symbol.asyncIterator]() {
      for (const record of textRecords(responseId)) yield record;
    },
  };
}

function guardGlobal(key: PropertyKey, value: unknown): () => void {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, key);
  Object.defineProperty(globalThis, key, {
    configurable: true,
    value,
    writable: true,
  });
  return () => {
    if (descriptor === undefined) {
      Reflect.deleteProperty(globalThis, key);
    } else {
      Object.defineProperty(globalThis, key, descriptor);
    }
  };
}

test("adapts the checked-in Tool roundtrip fixture without network access", async () => {
  const fetchGuard = vi.fn(() => {
    throw new Error("FixtureProviderAdapter must not call fetch");
  });
  const webSocketGuard = vi.fn(() => {
    throw new Error("FixtureProviderAdapter must not open WebSocket");
  });
  const restoreGlobals: Array<() => void> = [];

  try {
    restoreGlobals.push(guardGlobal("fetch", fetchGuard));
    restoreGlobals.push(guardGlobal("WebSocket", webSocketGuard));
    const adapter = new FixtureProviderAdapter(loadRoundtripFixture());
    const first = adapter.stream(
      request("request-tool"),
      new AbortController().signal,
    );

    await expect(collect(first)).resolves.toEqual([
      {
        type: "toolCall",
        requestId: "request-tool",
        toolCall: {
          type: "toolCall",
          id: "call-add-001",
          name: "add",
          arguments: { left: 20, right: 22 },
        },
      },
    ]);
    await expect(first.result).resolves.toEqual({
      id: "response-tool-001",
      requestId: "request-tool",
      message: {
        id: "message-response-tool-001",
        role: "assistant",
        content: [
          {
            type: "toolCall",
            id: "call-add-001",
            name: "add",
            arguments: { left: 20, right: 22 },
          },
        ],
      },
      stopReason: "toolCall",
      usage: { inputTokens: 12, outputTokens: 8 },
    });

    const second = adapter.stream(
      request("request-final"),
      new AbortController().signal,
    );
    await expect(collect(second)).resolves.toEqual([
      {
        type: "textDelta",
        requestId: "request-final",
        delta: "The sum is 42.",
      },
    ]);
    await expect(second.result).resolves.toMatchObject({
      id: "response-text-002",
      requestId: "request-final",
      message: {
        content: [{ type: "text", text: "The sum is 42." }],
      },
      stopReason: "stop",
      usage: { inputTokens: 20, outputTokens: 6 },
    });
    expect(adapter.callCount).toBe(2);
    expect(adapter.pendingResponseCount).toBe(0);
    expect(fetchGuard).not.toHaveBeenCalled();
    expect(webSocketGuard).not.toHaveBeenCalled();
  } finally {
    while (restoreGlobals.length > 0) restoreGlobals.pop()?.();
  }
});

test("provider adapter source has no network imports or API calls", () => {
  const source = providerAdapterSource();
  const bannedPatterns: readonly RegExp[] = [
    /["'](?:node:)?(?:http|https|net|tls)(?:\/[^"']*)?["']/u,
    /["']undici(?:\/[^"']*)?["']/u,
    /\bfetch\b/u,
    /\bWebSocket\b/u,
  ];

  for (const pattern of bannedPatterns) expect(source).not.toMatch(pattern);
});

test("provider parser has no direct unknown-to-course protocol assertion", () => {
  expect(providerAdapterSource()).not.toMatch(
    /\bas\s+(?:unknown\s+as\s+)?Course(?:ToolCall|JsonObject)\b/u,
  );
});

test("preserves delta order, stable Tool IDs, normalized usage, and immutable output", async () => {
  const mutableArguments = { nested: { value: 1 } };
  const source = {
    schemaVersion: 1,
    responses: [
      {
        records: [
          {
            type: "response_start",
            responseId: "response-ordered",
            role: "assistant",
          },
          { type: "text_delta", text: "first" },
          { type: "text_delta", text: "second" },
          {
            type: "tool_call",
            id: "call-stable-001",
            name: "inspect",
            arguments: mutableArguments,
          },
          {
            type: "response_end",
            responseId: "response-ordered",
            stopReason: "tool_call",
            usage: { input_tokens: 9, output_tokens: 4 },
          },
        ],
      },
    ],
  };
  const adapter = new FixtureProviderAdapter(source);
  mutableArguments.nested.value = 999;
  source.responses[0].records[1] = { type: "text_delta", text: "mutated" };
  const stream = adapter.stream(
    request("request-ordered"),
    new AbortController().signal,
  );

  const chunks = await collect(stream);
  const response = await stream.result;

  expect(chunks).toEqual([
    {
      type: "textDelta",
      requestId: "request-ordered",
      delta: "first",
    },
    {
      type: "textDelta",
      requestId: "request-ordered",
      delta: "second",
    },
    {
      type: "toolCall",
      requestId: "request-ordered",
      toolCall: {
        type: "toolCall",
        id: "call-stable-001",
        name: "inspect",
        arguments: { nested: { value: 1 } },
      },
    },
  ]);
  expect(response).toMatchObject({
    id: "response-ordered",
    requestId: "request-ordered",
    stopReason: "toolCall",
    usage: { inputTokens: 9, outputTokens: 4 },
  });
  expect(response.message.content).toEqual([
    { type: "text", text: "first" },
    { type: "text", text: "second" },
    {
      type: "toolCall",
      id: "call-stable-001",
      name: "inspect",
      arguments: { nested: { value: 1 } },
    },
  ]);
  expect(chunks.every(Object.isFrozen)).toBe(true);
  expect(Object.isFrozen(response)).toBe(true);
  expect(Object.isFrozen(response.message)).toBe(true);
  expect(Object.isFrozen(response.message.content)).toBe(true);
  expect(Object.isFrozen(response.usage)).toBe(true);
  expect(
    chunks[2].type === "toolCall" &&
      Object.isFrozen(chunks[2].toolCall.arguments.nested),
  ).toBe(true);
});

test("copies dangerous JSON keys into an immutable own-property-only Tool snapshot", async () => {
  const argumentsValue = Object.create(null) as Record<string, unknown>;
  Object.defineProperty(argumentsValue, "__proto__", {
    enumerable: true,
    value: { polluted: true },
  });
  Object.defineProperties(argumentsValue, {
    constructor: { enumerable: true, value: "constructor-value" },
    prototype: { enumerable: true, value: "prototype-value" },
  });
  const stream = new FixtureProviderAdapter(
    fixtureWith([
      {
        type: "response_start",
        responseId: "response-dangerous-keys",
        role: "assistant",
      },
      {
        type: "tool_call",
        id: "call-dangerous-keys",
        name: "inspect",
        arguments: argumentsValue,
      },
      {
        type: "response_end",
        responseId: "response-dangerous-keys",
        stopReason: "tool_call",
        usage: { inputTokens: 1, outputTokens: 1 },
      },
    ]),
  ).stream(request("request-dangerous-keys"), new AbortController().signal);

  const chunks = await collect(stream);
  await expect(stream.result).resolves.toMatchObject({
    id: "response-dangerous-keys",
  });
  expect(chunks).toHaveLength(1);
  if (chunks[0].type !== "toolCall") {
    throw new Error("Expected a Tool-call chunk");
  }
  const snapshot = chunks[0].toolCall.arguments;
  expect(Object.hasOwn(snapshot, "__proto__")).toBe(true);
  expect(Object.hasOwn(snapshot, "constructor")).toBe(true);
  expect(Object.hasOwn(snapshot, "prototype")).toBe(true);
  expect(Reflect.get(snapshot, "__proto__")).toEqual({ polluted: true });
  expect(Reflect.get(snapshot, "constructor")).toBe("constructor-value");
  expect(Reflect.get(snapshot, "prototype")).toBe("prototype-value");
  expect(Object.isFrozen(snapshot)).toBe(true);
  expect(Object.getPrototypeOf(snapshot)).toBeNull();
  expect(Reflect.get(Object.prototype, "polluted")).toBeUndefined();
});

test("ignores inherited usage fields and never invokes inherited getters", async () => {
  let inheritedReads = 0;
  const usagePrototype = Object.defineProperty({}, "inputTokens", {
    get() {
      inheritedReads += 1;
      return 1;
    },
  });
  const usage = Object.create(usagePrototype) as Record<string, unknown>;
  Object.defineProperty(usage, "outputTokens", {
    enumerable: true,
    value: 1,
  });
  const records = async function* (): AsyncGenerator<unknown, void, void> {
    yield {
      type: "response_start",
      responseId: "response-inherited-usage",
      role: "assistant",
    };
    yield { type: "text_delta", text: "must fail closed" };
    yield {
      type: "response_end",
      responseId: "response-inherited-usage",
      stopReason: "stop",
      usage,
    };
  };
  const stream = new FixtureProviderAdapter(fixtureWith(records())).stream(
    request("request-inherited-usage"),
    new AbortController().signal,
  );

  const [events, result] = await settleStream(stream);
  expect(events).toMatchObject({
    status: "rejected",
    reason: { code: "PROVIDER_INVALID_EVENT" },
  });
  expect(result).toMatchObject({
    status: "rejected",
    reason: { code: "PROVIDER_INVALID_EVENT" },
  });
  expect(inheritedReads).toBe(0);
});

test("fixture snapshots are unaffected by later prototype mutation", async () => {
  let inheritedReads = 0;
  const usage = Object.create(null) as Record<string, unknown>;
  Object.defineProperties(usage, {
    inputTokens: { configurable: true, enumerable: true, value: 1 },
    outputTokens: { configurable: true, enumerable: true, value: 1 },
  });
  const adapter = new FixtureProviderAdapter(
    fixtureWith([
      {
        type: "response_start",
        responseId: "response-prototype-mutation",
        role: "assistant",
      },
      { type: "text_delta", text: "snapshotted before mutation" },
      {
        type: "response_end",
        responseId: "response-prototype-mutation",
        stopReason: "stop",
        usage,
      },
    ]),
  );
  const hostilePrototype = Object.defineProperty({}, "inputTokens", {
    get() {
      inheritedReads += 1;
      throw new Error("mutated prototype must not be consulted");
    },
  });
  Reflect.deleteProperty(usage, "inputTokens");
  Object.setPrototypeOf(usage, hostilePrototype);
  const stream = adapter.stream(
    request("request-prototype-mutation"),
    new AbortController().signal,
  );

  const [events, result] = await settleStream(stream);
  expect(events).toMatchObject({
    status: "fulfilled",
    value: [{ delta: "snapshotted before mutation" }],
  });
  expect(result).toMatchObject({
    status: "fulfilled",
    value: {
      id: "response-prototype-mutation",
      usage: { inputTokens: 1, outputTokens: 1 },
    },
  });
  expect(inheritedReads).toBe(0);
});

test("rejects duplicate usage aliases by own presence even when one is undefined", async () => {
  const stream = new FixtureProviderAdapter(
    fixtureWith([
      {
        type: "response_start",
        responseId: "response-duplicate-usage-alias",
        role: "assistant",
      },
      { type: "text_delta", text: "must fail closed" },
      {
        type: "response_end",
        responseId: "response-duplicate-usage-alias",
        stopReason: "stop",
        usage: {
          inputTokens: undefined,
          input_tokens: 1,
          outputTokens: 1,
        },
      },
    ]),
  ).stream(
    request("request-duplicate-usage-alias"),
    new AbortController().signal,
  );

  const [events, result] = await settleStream(stream);
  expect(events).toMatchObject({
    status: "rejected",
    reason: { code: "PROVIDER_INVALID_EVENT" },
  });
  expect(result).toMatchObject({
    status: "rejected",
    reason: { code: "PROVIDER_INVALID_EVENT" },
  });
});

test("maps a validated transport_error to a stable typed failure", async () => {
  const adapter = new FixtureProviderAdapter(
    fixtureWith([
      {
        type: "transport_error",
        code: "UPSTREAM_RESET",
        message: "fixture connection reset",
      },
    ]),
  );
  const stream = adapter.stream(
    request("request-error"),
    new AbortController().signal,
  );
  const [events, result] = await settleStream(stream);

  expect(events).toMatchObject({
    status: "rejected",
    reason: {
      name: "FixtureProviderError",
      code: "PROVIDER_TRANSPORT_ERROR",
      providerCode: "UPSTREAM_RESET",
      message: "fixture connection reset",
    },
  });
  expect(result).toMatchObject({
    status: "rejected",
    reason: {
      code: "PROVIDER_TRANSPORT_ERROR",
      providerCode: "UPSTREAM_RESET",
    },
  });
});

test("rejects unknown records and malformed discriminant payloads", async () => {
  const cases: readonly Readonly<{
    records: readonly unknown[];
    code: string;
  }>[] = [
    {
      records: [
        {
          type: "response_start",
          responseId: "response-unknown",
          role: "assistant",
        },
        { type: "surprise", payload: true },
      ],
      code: "PROVIDER_UNKNOWN_EVENT",
    },
    {
      records: [
        {
          type: "response_start",
          responseId: "response-bad-delta",
          role: "assistant",
        },
        { type: "text_delta", text: 42 },
      ],
      code: "PROVIDER_INVALID_EVENT",
    },
    {
      records: [
        {
          type: "response_start",
          responseId: "response-bad-role",
          role: "user",
        },
      ],
      code: "PROVIDER_INVALID_EVENT",
    },
    {
      records: [
        {
          type: "transport_error",
          code: " ",
          message: 42,
        },
      ],
      code: "PROVIDER_INVALID_EVENT",
    },
  ];

  for (const [index, current] of cases.entries()) {
    const adapter = new FixtureProviderAdapter(fixtureWith(current.records));
    const stream = adapter.stream(
      request(`request-invalid-${index}`),
      new AbortController().signal,
    );
    const [events, result] = await settleStream(stream);
    expect(events).toMatchObject({
      status: "rejected",
      reason: { code: current.code },
    });
    expect(result).toMatchObject({
      status: "rejected",
      reason: { code: current.code },
    });
  }
});

test("requires one and only one terminal response", async () => {
  const missing = new FixtureProviderAdapter(
    fixtureWith([
      {
        type: "response_start",
        responseId: "response-missing-end",
        role: "assistant",
      },
      { type: "text_delta", text: "partial" },
    ]),
  ).stream(request("request-missing-end"), new AbortController().signal);
  const duplicate = new FixtureProviderAdapter(
    fixtureWith([
      ...textRecords("response-duplicate-end"),
      {
        type: "response_end",
        responseId: "response-duplicate-end",
        stopReason: "stop",
        usage: { inputTokens: 7, outputTokens: 3 },
      },
    ]),
  ).stream(request("request-duplicate-end"), new AbortController().signal);

  await expect(missing.result).rejects.toMatchObject({
    code: "PROVIDER_MISSING_TERMINAL",
  });
  await expect(collect(missing)).rejects.toMatchObject({
    code: "PROVIDER_MISSING_TERMINAL",
  });
  await expect(duplicate.result).rejects.toMatchObject({
    code: "PROVIDER_DUPLICATE_TERMINAL",
  });
  await expect(collect(duplicate)).rejects.toMatchObject({
    code: "PROVIDER_DUPLICATE_TERMINAL",
  });
});

test("correlates response IDs and enforces stop-reason semantics", async () => {
  const cases: readonly Readonly<{
    records: readonly unknown[];
    code: string;
  }>[] = [
    {
      records: [
        {
          type: "response_start",
          responseId: "response-start",
          role: "assistant",
        },
        {
          type: "response_end",
          responseId: "response-other",
          stopReason: "stop",
          usage: { inputTokens: 1, outputTokens: 1 },
        },
      ],
      code: "PROVIDER_RESPONSE_MISMATCH",
    },
    {
      records: [
        {
          type: "response_start",
          responseId: "response-tool-without-call",
          role: "assistant",
        },
        {
          type: "response_end",
          responseId: "response-tool-without-call",
          stopReason: "tool_call",
          usage: { inputTokens: 1, outputTokens: 1 },
        },
      ],
      code: "PROVIDER_INVALID_TERMINAL",
    },
    {
      records: [
        {
          type: "response_start",
          responseId: "response-stop-with-call",
          role: "assistant",
        },
        {
          type: "tool_call",
          id: "call-before-stop",
          name: "read",
          arguments: { path: "README.md" },
        },
        {
          type: "response_end",
          responseId: "response-stop-with-call",
          stopReason: "stop",
          usage: { inputTokens: 1, outputTokens: 1 },
        },
      ],
      code: "PROVIDER_INVALID_TERMINAL",
    },
  ];

  for (let index = 0; index < cases.length; index += 1) {
    const current = cases[index];
    const stream = new FixtureProviderAdapter(
      fixtureWith(current.records),
    ).stream(
      request(`request-terminal-${index}`),
      new AbortController().signal,
    );
    const [events, result] = await settleStream(stream);
    expect(events).toMatchObject({
      status: "rejected",
      reason: { code: current.code },
    });
    expect(result).toMatchObject({
      status: "rejected",
      reason: { code: current.code },
    });
  }
});

test("rejects duplicate starts, events before a start, and duplicate Tool IDs", async () => {
  const cases: readonly Readonly<{
    records: readonly unknown[];
    code: string;
  }>[] = [
    {
      records: [
        {
          type: "response_start",
          responseId: "response-first-start",
          role: "assistant",
        },
        {
          type: "response_start",
          responseId: "response-second-start",
          role: "assistant",
        },
      ],
      code: "PROVIDER_DUPLICATE_START",
    },
    {
      records: [{ type: "text_delta", text: "too early" }],
      code: "PROVIDER_MISSING_START",
    },
    {
      records: [
        {
          type: "response_start",
          responseId: "response-duplicate-call",
          role: "assistant",
        },
        {
          type: "tool_call",
          id: "call-duplicate",
          name: "read",
          arguments: { path: "README.md" },
        },
        {
          type: "tool_call",
          id: "call-duplicate",
          name: "read",
          arguments: { path: "LICENSE" },
        },
      ],
      code: "PROVIDER_INVALID_EVENT",
    },
  ];

  for (let index = 0; index < cases.length; index += 1) {
    const current = cases[index];
    const stream = new FixtureProviderAdapter(
      fixtureWith(current.records),
    ).stream(
      request(`request-ordering-${index}`),
      new AbortController().signal,
    );
    const [events, result] = await settleStream(stream);
    expect(events).toMatchObject({
      status: "rejected",
      reason: { code: current.code },
    });
    expect(result).toMatchObject({
      status: "rejected",
      reason: { code: current.code },
    });
  }
});

test("rejects non-JSON Tool arguments instead of casting unknown payloads", async () => {
  const stream = new FixtureProviderAdapter(
    fixtureWith([
      {
        type: "response_start",
        responseId: "response-exotic-arguments",
        role: "assistant",
      },
      {
        type: "tool_call",
        id: "call-exotic-arguments",
        name: "inspect",
        arguments: { unsupported: undefined },
      },
    ]),
  ).stream(request("request-exotic-arguments"), new AbortController().signal);

  const [events, result] = await settleStream(stream);
  expect(events).toMatchObject({
    status: "rejected",
    reason: { code: "PROVIDER_INVALID_EVENT" },
  });
  expect(result).toMatchObject({
    status: "rejected",
    reason: { code: "PROVIDER_INVALID_EVENT" },
  });
});

test("rejects exotic Tool argument prototypes at every JSON depth", async () => {
  class ClassArguments {
    public readonly value = 1;
  }

  const cases: readonly Readonly<{ label: string; argumentsValue: unknown }>[] =
    [
      {
        label: "Date root",
        argumentsValue: new Date("2026-08-25T00:00:00.000Z"),
      },
      { label: "class root", argumentsValue: new ClassArguments() },
      {
        label: "nested Date",
        argumentsValue: {
          nested: { createdAt: new Date("2026-08-25T00:00:00.000Z") },
        },
      },
      {
        label: "nested class",
        argumentsValue: { nested: new ClassArguments() },
      },
    ];

  for (let index = 0; index < cases.length; index += 1) {
    const current = cases[index];
    const responseId = `response-exotic-prototype-${index}`;
    const records = async function* (): AsyncGenerator<unknown, void, void> {
      yield { type: "response_start", responseId, role: "assistant" };
      yield {
        type: "tool_call",
        id: `call-exotic-prototype-${index}`,
        name: "inspect",
        arguments: current.argumentsValue,
      };
      yield {
        type: "response_end",
        responseId,
        stopReason: "tool_call",
        usage: { inputTokens: 1, outputTokens: 1 },
      };
    };
    const stream = new FixtureProviderAdapter(fixtureWith(records())).stream(
      request(`request-exotic-prototype-${index}`),
      new AbortController().signal,
    );
    const [events, result] = await settleStream(stream);

    expect(events, current.label).toMatchObject({
      status: "rejected",
      reason: { code: "PROVIDER_INVALID_EVENT" },
    });
    expect(result, current.label).toMatchObject({
      status: "rejected",
      reason: { code: "PROVIDER_INVALID_EVENT" },
    });
  }
});

test("fails closed when the finite fixture queue is exhausted", async () => {
  const adapter = new FixtureProviderAdapter({
    schemaVersion: 1,
    responses: [],
  });
  const stream = adapter.stream(
    request("request-exhausted"),
    new AbortController().signal,
  );

  await expect(collect(stream)).rejects.toMatchObject({
    code: "PROVIDER_EXHAUSTED",
  });
  await expect(stream.result).rejects.toMatchObject({
    code: "PROVIDER_EXHAUSTED",
  });
  expect(adapter.callCount).toBe(1);
});

test("cancellation before streaming preserves the queued fixture response", async () => {
  const adapter = new FixtureProviderAdapter(
    fixtureWith(textRecords("response-retry")),
  );
  const controller = new AbortController();
  controller.abort();
  const cancelled = adapter.stream(
    request("request-cancelled-before"),
    controller.signal,
  );

  await expect(collect(cancelled)).rejects.toMatchObject({
    name: "AbortError",
  });
  await expect(cancelled.result).rejects.toMatchObject({ name: "AbortError" });
  expect(adapter.pendingResponseCount).toBe(1);

  const retried = adapter.stream(
    request("request-retry"),
    new AbortController().signal,
  );
  await expect(collect(retried)).resolves.toHaveLength(1);
  await expect(retried.result).resolves.toMatchObject({
    id: "response-retry",
    requestId: "request-retry",
  });
});

test("cancellation interrupts a deferred record source and closes it without sleeps", async () => {
  const releaseTerminal = deferred<void>();
  const sourceClosed = deferred<void>();
  async function* records(): AsyncGenerator<unknown, void, void> {
    try {
      yield {
        type: "response_start",
        responseId: "response-deferred",
        role: "assistant",
      };
      yield { type: "text_delta", text: "first" };
      await releaseTerminal.promise;
      yield {
        type: "response_end",
        responseId: "response-deferred",
        stopReason: "stop",
        usage: { inputTokens: 1, outputTokens: 1 },
      };
    } finally {
      sourceClosed.resolve();
    }
  }

  const adapter = new FixtureProviderAdapter(fixtureWith(records()));
  const controller = new AbortController();
  const stream = adapter.stream(request("request-deferred"), controller.signal);
  const iterator = stream[Symbol.asyncIterator]();

  await expect(iterator.next()).resolves.toEqual({
    done: false,
    value: {
      type: "textDelta",
      requestId: "request-deferred",
      delta: "first",
    },
  });
  const pending = iterator.next();
  const resultRejection = expect(stream.result).rejects.toMatchObject({
    name: "AbortError",
  });
  controller.abort();

  await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  await resultRejection;
  releaseTerminal.resolve();
  await sourceClosed.promise;
});

test("allows one reusable iterable to return a fresh iterator per response", async () => {
  let iteratorCount = 0;
  const reusable = {
    [Symbol.asyncIterator]() {
      iteratorCount += 1;
      return asyncTextRecords(`response-reusable-${iteratorCount}`)[
        Symbol.asyncIterator
      ]();
    },
  };
  const adapter = new FixtureProviderAdapter({
    schemaVersion: 1,
    responses: [{ records: reusable }, { records: reusable }],
  });

  const first = adapter.stream(
    request("request-reusable-first"),
    new AbortController().signal,
  );
  await expect(collect(first)).resolves.toHaveLength(1);
  await expect(first.result).resolves.toMatchObject({
    id: "response-reusable-1",
  });

  const second = adapter.stream(
    request("request-reusable-second"),
    new AbortController().signal,
  );
  await expect(collect(second)).resolves.toHaveLength(1);
  await expect(second.result).resolves.toMatchObject({
    id: "response-reusable-2",
  });
  expect(iteratorCount).toBe(2);
});

test("rejects concurrent shared-iterator reuse through distinct wrappers without cross-wiring", async () => {
  const releaseTerminal = deferred<void>();
  async function* sharedRecords(): AsyncGenerator<unknown, void, void> {
    yield {
      type: "response_start",
      responseId: "response-shared-concurrent",
      role: "assistant",
    };
    yield { type: "text_delta", text: "owned by first" };
    await releaseTerminal.promise;
    yield {
      type: "response_end",
      responseId: "response-shared-concurrent",
      stopReason: "stop",
      usage: { inputTokens: 1, outputTokens: 1 },
    };
  }
  const iterator = sharedRecords();
  const firstWrapper = { [Symbol.asyncIterator]: () => iterator };
  const secondWrapper = { [Symbol.asyncIterator]: () => iterator };
  const adapter = new FixtureProviderAdapter({
    schemaVersion: 1,
    responses: [{ records: firstWrapper }, { records: secondWrapper }],
  });
  const first = adapter.stream(
    request("request-shared-owner"),
    new AbortController().signal,
  );
  const firstIterator = first[Symbol.asyncIterator]();
  await expect(firstIterator.next()).resolves.toMatchObject({
    done: false,
    value: { requestId: "request-shared-owner", delta: "owned by first" },
  });

  const reused = adapter.stream(
    request("request-shared-intruder"),
    new AbortController().signal,
  );
  const reusedSettlement = settleStream(reused);
  releaseTerminal.resolve();

  await expect(firstIterator.next()).resolves.toEqual({
    done: true,
    value: undefined,
  });
  await expect(first.result).resolves.toMatchObject({
    id: "response-shared-concurrent",
    requestId: "request-shared-owner",
  });
  const [events, result] = await reusedSettlement;
  expect(events).toMatchObject({
    status: "rejected",
    reason: { code: "PROVIDER_ITERATOR_REUSED" },
  });
  expect(result).toMatchObject({
    status: "rejected",
    reason: { code: "PROVIDER_ITERATOR_REUSED" },
  });
});

test("rejects sequential shared-iterator reuse across adapter instances", async () => {
  const iterator = asyncTextRecords("response-shared-sequential")[
    Symbol.asyncIterator
  ]();
  const first = new FixtureProviderAdapter(
    fixtureWith({ [Symbol.asyncIterator]: () => iterator }),
  ).stream(request("request-shared-first"), new AbortController().signal);
  await expect(collect(first)).resolves.toHaveLength(1);
  await expect(first.result).resolves.toMatchObject({
    id: "response-shared-sequential",
  });

  const reused = new FixtureProviderAdapter(
    fixtureWith({ [Symbol.asyncIterator]: () => iterator }),
  ).stream(request("request-shared-second"), new AbortController().signal);
  const [events, result] = await settleStream(reused);
  expect(events).toMatchObject({
    status: "rejected",
    reason: { code: "PROVIDER_ITERATOR_REUSED" },
  });
  expect(result).toMatchObject({
    status: "rejected",
    reason: { code: "PROVIDER_ITERATOR_REUSED" },
  });
});

test("prevents concurrent iterator reuse from ScriptedModel into provider adapter", async () => {
  const releaseTerminal = deferred<void>();
  const sharedIterator = (async function* () {
    yield {
      type: "textDelta",
      requestId: "request-cross-owner",
      delta: "owned by ScriptedModel",
    } as const;
    await releaseTerminal.promise;
    return {
      id: "response-cross-owner",
      requestId: "request-cross-owner",
      message: {
        id: "message-response-cross-owner",
        role: "assistant",
        content: [{ type: "text", text: "owned by ScriptedModel" }],
      },
      stopReason: "stop",
      usage: { inputTokens: 1, outputTokens: 1 },
    } as const;
  })();
  const model = new ScriptedModel([
    (() => sharedIterator) as ScriptedResponseFactory,
  ]);
  const modelStream = model.stream(
    request("request-cross-owner"),
    new AbortController().signal,
  );
  const modelEvents = modelStream[Symbol.asyncIterator]();
  await expect(modelEvents.next()).resolves.toMatchObject({
    done: false,
    value: {
      requestId: "request-cross-owner",
      delta: "owned by ScriptedModel",
    },
  });

  const providerStream = new FixtureProviderAdapter(
    fixtureWith({ [Symbol.asyncIterator]: () => sharedIterator }),
  ).stream(request("request-cross-intruder"), new AbortController().signal);
  const providerSettlement = settleStream(providerStream);
  releaseTerminal.resolve();

  await expect(modelEvents.next()).resolves.toEqual({
    done: true,
    value: undefined,
  });
  await expect(modelStream.result).resolves.toMatchObject({
    id: "response-cross-owner",
    requestId: "request-cross-owner",
  });
  const [events, result] = await providerSettlement;
  expect(events).toMatchObject({
    status: "rejected",
    reason: { code: "PROVIDER_ITERATOR_REUSED" },
  });
  expect(result).toMatchObject({
    status: "rejected",
    reason: { code: "PROVIDER_ITERATOR_REUSED" },
  });
});

test("prevents sequential iterator reuse from provider adapter into ScriptedModel", async () => {
  const sharedIterator = asyncTextRecords("response-provider-owner")[
    Symbol.asyncIterator
  ]();
  const providerStream = new FixtureProviderAdapter(
    fixtureWith({ [Symbol.asyncIterator]: () => sharedIterator }),
  ).stream(request("request-provider-owner"), new AbortController().signal);
  await expect(collect(providerStream)).resolves.toHaveLength(1);
  await expect(providerStream.result).resolves.toMatchObject({
    id: "response-provider-owner",
    requestId: "request-provider-owner",
  });

  const model = new ScriptedModel([
    (() => sharedIterator) as unknown as ScriptedResponseFactory,
  ]);
  const modelStream = model.stream(
    request("request-scripted-intruder"),
    new AbortController().signal,
  );
  const [events, result] = await settleStream(modelStream);
  expect(events).toMatchObject({
    status: "rejected",
    reason: { code: "SCRIPT_ITERATOR_REUSED" },
  });
  expect(result).toMatchObject({
    status: "rejected",
    reason: { code: "SCRIPT_ITERATOR_REUSED" },
  });
});

test("normalizes hostile async-iterator getters and calls", async () => {
  const hostileGetter = Object.defineProperty({}, Symbol.asyncIterator, {
    get(): never {
      throw new Error("hostile iterator getter");
    },
  });
  expect(() => new FixtureProviderAdapter(fixtureWith(hostileGetter))).toThrow(
    expect.objectContaining({
      name: "FixtureProviderError",
      code: "PROVIDER_INVALID_FIXTURE",
    }),
  );

  const hostileCall = {
    [Symbol.asyncIterator](): never {
      throw new Error("hostile iterator call");
    },
  };
  const stream = new FixtureProviderAdapter(fixtureWith(hostileCall)).stream(
    request("request-hostile-iterator-call"),
    new AbortController().signal,
  );
  const [events, result] = await settleStream(stream);
  expect(events).toMatchObject({
    status: "rejected",
    reason: { code: "PROVIDER_INVALID_FIXTURE" },
  });
  expect(result).toMatchObject({
    status: "rejected",
    reason: { code: "PROVIDER_INVALID_FIXTURE" },
  });
});

test("normalizes unexpected async source failures and ignores cleanup failures", async () => {
  const sourceFailure = new Error("fixture source failed");
  const cleanupFailure = new Error("cleanup must not replace source failure");
  const source = {
    [Symbol.asyncIterator]() {
      return {
        next: async () => {
          throw sourceFailure;
        },
        return: () => {
          throw cleanupFailure;
        },
      };
    },
  };
  const stream = new FixtureProviderAdapter(fixtureWith(source)).stream(
    request("request-source-failure"),
    new AbortController().signal,
  );

  const [events, result] = await settleStream(stream);
  expect(events).toMatchObject({
    status: "rejected",
    reason: {
      name: "FixtureProviderError",
      code: "PROVIDER_INVALID_FIXTURE",
      message: "Async fixture record source failed",
    },
  });
  expect(result).toMatchObject({
    status: "rejected",
    reason: {
      code: "PROVIDER_INVALID_FIXTURE",
      message: "Async fixture record source failed",
    },
  });
});

test("does not trust a FixtureProviderError thrown by an untrusted source", async () => {
  const forged = new FixtureProviderError(
    "PROVIDER_TRANSPORT_ERROR",
    "forged provider transport failure",
    { providerCode: "FORGED_UPSTREAM" },
  );
  const source = {
    [Symbol.asyncIterator]() {
      return {
        next: () => Promise.reject(forged),
      };
    },
  };
  const stream = new FixtureProviderAdapter(fixtureWith(source)).stream(
    request("request-forged-error"),
    new AbortController().signal,
  );

  const [events, result] = await settleStream(stream);
  expect(events).toMatchObject({
    status: "rejected",
    reason: {
      name: "FixtureProviderError",
      code: "PROVIDER_INVALID_FIXTURE",
      message: "Async fixture record source failed",
      providerCode: undefined,
    },
  });
  expect(result).toMatchObject({
    status: "rejected",
    reason: {
      code: "PROVIDER_INVALID_FIXTURE",
      providerCode: undefined,
    },
  });
  if (events.status !== "rejected") {
    throw new Error("Expected the event stream to reject");
  }
  expect(events.reason).not.toBe(forged);
});

test("closes an opened source when its next getter is hostile", async () => {
  let cleanupAttempts = 0;
  const iterator = {
    get next(): never {
      throw new Error("hostile next getter");
    },
    return() {
      cleanupAttempts += 1;
      throw new Error("hostile cleanup");
    },
  };
  const source = {
    [Symbol.asyncIterator]() {
      return iterator;
    },
  };
  const stream = new FixtureProviderAdapter(fixtureWith(source)).stream(
    request("request-hostile-next"),
    new AbortController().signal,
  );

  const [events, result] = await settleStream(stream);
  expect(events).toMatchObject({
    status: "rejected",
    reason: {
      code: "PROVIDER_INVALID_FIXTURE",
      message: "Async fixture iterator next() could not be inspected",
    },
  });
  expect(result).toMatchObject({
    status: "rejected",
    reason: { code: "PROVIDER_INVALID_FIXTURE" },
  });
  expect(cleanupAttempts).toBe(1);
});

test("does not inspect the irrelevant value of a completed iterator step", async () => {
  const steps: IteratorResult<unknown>[] = [
    {
      done: false,
      value: {
        type: "response_start",
        responseId: "response-hostile-done-value",
        role: "assistant",
      },
    },
    {
      done: false,
      value: { type: "text_delta", text: "complete" },
    },
    {
      done: false,
      value: {
        type: "response_end",
        responseId: "response-hostile-done-value",
        stopReason: "stop",
        usage: { inputTokens: 1, outputTokens: 1 },
      },
    },
  ];
  const completedStep = Object.defineProperty({ done: true }, "value", {
    get(): never {
      throw new Error("completed step value must not be read");
    },
  });
  let stepIndex = 0;
  const source = {
    [Symbol.asyncIterator]() {
      return {
        next: async () => steps[stepIndex++] ?? completedStep,
      };
    },
  };
  const stream = new FixtureProviderAdapter(fixtureWith(source)).stream(
    request("request-hostile-done-value"),
    new AbortController().signal,
  );

  await expect(collect(stream)).resolves.toEqual([
    {
      type: "textDelta",
      requestId: "request-hostile-done-value",
      delta: "complete",
    },
  ]);
  await expect(stream.result).resolves.toMatchObject({
    id: "response-hostile-done-value",
  });
});

test("uses trusted array indexing and reads hostile record properties once", async () => {
  const records = textRecords("response-safe-array") as unknown[];
  Object.defineProperties(records, {
    entries: {
      value: () => {
        throw new Error("entries must not be called");
      },
    },
    map: {
      value: () => {
        throw new Error("map must not be called");
      },
    },
    [Symbol.iterator]: {
      value: () => {
        throw new Error("iterator must not be called");
      },
    },
  });
  const start = records[0] as Record<string, unknown>;
  let responseIdReads = 0;
  Object.defineProperty(start, "responseId", {
    enumerable: true,
    get() {
      responseIdReads += 1;
      return responseIdReads === 1 ? "response-safe-array" : "changed";
    },
  });

  const adapter = new FixtureProviderAdapter(fixtureWith(records));
  const stream = adapter.stream(
    request("request-safe-array"),
    new AbortController().signal,
  );

  await expect(collect(stream)).resolves.toEqual([
    {
      type: "textDelta",
      requestId: "request-safe-array",
      delta: "done",
    },
  ]);
  await expect(stream.result).resolves.toMatchObject({
    id: "response-safe-array",
  });
  expect(responseIdReads).toBe(1);
});

test("rejects sparse and hostile fixture containers with a stable typed code", () => {
  const sparseRecords = new Array<unknown>(1);
  expect(() => new FixtureProviderAdapter(fixtureWith(sparseRecords))).toThrow(
    expect.objectContaining({
      name: "FixtureProviderError",
      code: "PROVIDER_INVALID_FIXTURE",
    }),
  );

  const hostileResponse = Object.defineProperty({}, "records", {
    get(): never {
      throw new Error("hostile records getter");
    },
  });
  expect(
    () =>
      new FixtureProviderAdapter({
        schemaVersion: 1,
        responses: [hostileResponse],
      }),
  ).toThrow(
    expect.objectContaining({
      name: "FixtureProviderError",
      code: "PROVIDER_INVALID_FIXTURE",
    }),
  );
});

test("FixtureProviderError exposes stable readonly failure metadata", () => {
  const error = new FixtureProviderError(
    "PROVIDER_INVALID_EVENT",
    "Invalid provider record",
    { recordIndex: 2 },
  );

  expect(error).toMatchObject({
    name: "FixtureProviderError",
    code: "PROVIDER_INVALID_EVENT",
    message: "Invalid provider record",
    recordIndex: 2,
  });
});
