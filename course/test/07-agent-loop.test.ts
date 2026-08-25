import { expect, test } from "vitest";

import {
  EventStream,
  MAX_AGENT_STEPS,
  MAX_INITIAL_MESSAGES,
  MAX_MODEL_BLOCKS_PER_STEP,
  MAX_MODEL_CHUNKS_PER_STEP,
  MAX_MODEL_TEXT_CODE_POINTS,
  MAX_TOOL_ARGUMENT_DEPTH,
  MAX_TOOL_ARGUMENT_ENTRIES,
  MAX_TOOL_ARGUMENT_NODES,
  MAX_TOOL_ARGUMENT_STRING_CODE_POINTS,
  ScriptedModel,
  ToolRegistry,
  defineTool,
  runAgentLoop,
  type AgentEvent,
  type CourseAssistantBlock,
  type CourseModel,
  type CourseModelChunk,
  type CourseModelResponse,
  type CourseToolCall,
  type RunResult,
  type ScriptedResponseFactory,
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

async function settlementByNextTurn(
  result: Promise<RunResult>,
): Promise<"settled" | "rejected" | "pending"> {
  return Promise.race([
    result.then(
      () => "settled" as const,
      () => "rejected" as const,
    ),
    nextEventLoopTurn().then(() => "pending" as const),
  ]);
}

function shadowPromiseMetadata<Value>(promise: Promise<Value>): Promise<Value> {
  Object.defineProperties(promise, {
    constructor: {
      configurable: true,
      get() {
        throw new Error("hostile Promise constructor getter");
      },
    },
    then: { value: undefined },
  });
  return promise;
}

function lockPromiseMetadata<Value>(promise: Promise<Value>): Promise<Value> {
  Object.defineProperties(promise, {
    constructor: {
      get() {
        throw new Error("locked hostile Promise constructor getter");
      },
    },
    then: { value: undefined },
  });
  return promise;
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
  lockPromiseMetadata(source.promise);
  source.reject(new Error(message));
  return { promise: source.promise, creatorObservation };
}

function user(content = "Add 20 and 22.") {
  return { id: "message-user-001", role: "user" as const, content };
}

function call(
  name: string,
  id: string,
  argumentsValue: CourseToolCall["arguments"] = {},
): CourseToolCall {
  return { type: "toolCall", id, name, arguments: argumentsValue };
}

function responseFor(
  requestId: string,
  id: string,
  content: readonly CourseAssistantBlock[],
  stopReason: CourseModelResponse["stopReason"],
): CourseModelResponse {
  return {
    id,
    requestId,
    message: {
      id: `message-${id}`,
      role: "assistant",
      content,
    },
    stopReason,
    usage: { inputTokens: 10, outputTokens: 4 },
  };
}

function scriptedResponse(
  id: string,
  content: readonly CourseAssistantBlock[],
  stopReason: CourseModelResponse["stopReason"],
): ScriptedResponseFactory {
  return async function* (request) {
    for (const block of content) {
      const chunk: CourseModelChunk =
        block.type === "text"
          ? { type: "textDelta", requestId: request.id, delta: block.text }
          : { type: "toolCall", requestId: request.id, toolCall: block };
      yield chunk;
    }
    return responseFor(request.id, id, content, stopReason);
  };
}

function addTool(name = "add") {
  return defineTool({
    name,
    description: "Add two numbers.",
    validate: (input: unknown) => {
      if (
        typeof input === "object" &&
        input !== null &&
        "left" in input &&
        "right" in input &&
        typeof input.left === "number" &&
        typeof input.right === "number"
      ) {
        return {
          ok: true as const,
          value: { left: input.left, right: input.right },
        };
      }
      return { ok: false as const, error: "left and right are required" };
    },
    execute: async ({ left, right }) => ({ sum: left + right }),
  });
}

async function collect<Value>(source: AsyncIterable<Value>): Promise<Value[]> {
  const values: Value[] = [];
  for await (const value of source) values.push(value);
  return values;
}

async function settleRun(stream: EventStream<AgentEvent, RunResult>) {
  const eventsPromise = collect(stream);
  const result = await stream.result;
  const events = await eventsPromise;
  return { events, result };
}

test("rejects a non-positive or non-integer maxSteps before starting a run", () => {
  const model = new ScriptedModel();
  const tools = new ToolRegistry();
  const signal = new AbortController().signal;

  for (const maxSteps of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    expect(() =>
      runAgentLoop({ messages: [user()], model, tools, maxSteps, signal }),
    ).toThrowError("maxSteps must be a positive safe integer");
  }
  expect(model.callCount).toBe(0);
});

test("validates a request sequence start while preserving the standalone default", async () => {
  const tools = new ToolRegistry();
  const signal = new AbortController().signal;
  const defaultModel = new ScriptedModel([
    scriptedResponse(
      "response-default-sequence",
      [{ type: "text", text: "default" }],
      "stop",
    ),
  ]);
  await runAgentLoop({
    messages: [user()],
    model: defaultModel,
    tools,
    maxSteps: 1,
    signal,
  }).result;
  expect(defaultModel.requests[0].id).toBe("request-001");

  const offsetModel = new ScriptedModel([
    scriptedResponse(
      "response-offset-sequence",
      [{ type: "text", text: "offset" }],
      "stop",
    ),
  ]);
  await runAgentLoop({
    messages: [user()],
    model: offsetModel,
    tools,
    maxSteps: 1,
    signal,
    requestSequenceStart: 4,
  }).result;
  expect(offsetModel.requests[0].id).toBe("request-005");

  for (const requestSequenceStart of [-1, 1.5, MAX_AGENT_STEPS]) {
    expect(() =>
      runAgentLoop({
        messages: [user()],
        model: new ScriptedModel(),
        tools,
        maxSteps: 1,
        signal,
        requestSequenceStart,
      }),
    ).toThrowError("requestSequenceStart");
  }
  expect(() =>
    runAgentLoop({
      messages: [user()],
      model: new ScriptedModel(),
      tools,
      maxSteps: 2,
      signal,
      requestSequenceStart: MAX_AGENT_STEPS - 1,
    }),
  ).toThrowError("requestSequenceStart");
});

test("completes a direct answer with immutable snapshots and exact sequence numbers", async () => {
  const callerMessages = [user()];
  const model = new ScriptedModel([
    scriptedResponse(
      "response-direct-001",
      [{ type: "text", text: "The sum is 42." }],
      "stop",
    ),
  ]);
  const stream = runAgentLoop({
    messages: callerMessages,
    model,
    tools: new ToolRegistry(),
    maxSteps: 2,
    signal: new AbortController().signal,
  });

  callerMessages[0].content = "mutated after construction";
  callerMessages.push(user("also mutated"));

  const { events, result } = await settleRun(stream);

  expect(events.map(({ type, sequence }) => ({ type, sequence }))).toEqual([
    { type: "message.accepted", sequence: 0 },
    { type: "model.chunk", sequence: 1 },
    { type: "run.finished", sequence: 2 },
  ]);
  expect(result).toEqual({
    status: "completed",
    messages: [
      user(),
      {
        id: "message-response-direct-001",
        role: "assistant",
        content: [{ type: "text", text: "The sum is 42." }],
      },
    ],
    finalText: "The sum is 42.",
  });
  expect(events.at(-1)?.payload).toEqual({ result });
  expect(Object.isFrozen(result)).toBe(true);
  expect(Object.isFrozen(result.messages)).toBe(true);
  expect(Object.isFrozen(result.messages[1])).toBe(true);
  expect(Object.isFrozen(events[0])).toBe(true);
  expect(Object.isFrozen(events[0].payload)).toBe(true);
  expect(model.requests[0]).not.toBe(callerMessages);
});

test("appends one Tool call and its matching result before the second model request", async () => {
  const addCall = call("add", "call-add-001", { left: 20, right: 22 });
  const model = new ScriptedModel([
    scriptedResponse("response-tool-001", [addCall], "toolCall"),
    scriptedResponse(
      "response-tool-002",
      [{ type: "text", text: "The sum is 42." }],
      "stop",
    ),
  ]);

  const { events, result } = await settleRun(
    runAgentLoop({
      messages: [user()],
      model,
      tools: new ToolRegistry([addTool()]),
      maxSteps: 2,
      signal: new AbortController().signal,
    }),
  );

  expect(model.callCount).toBe(2);
  expect(model.requests.map(({ id }) => id)).toEqual([
    "request-001",
    "request-002",
  ]);
  expect(model.requests[1].messages).toEqual([
    user(),
    {
      id: "message-response-tool-001",
      role: "assistant",
      content: [addCall],
    },
    {
      id: "tool-result-call-add-001",
      role: "toolResult",
      toolCallId: "call-add-001",
      toolName: "add",
      content: '{"sum":42}',
      isError: false,
    },
  ]);
  expect(events.map(({ type }) => type)).toEqual([
    "message.accepted",
    "model.chunk",
    "tool.started",
    "tool.finished",
    "model.chunk",
    "run.finished",
  ]);
  expect(events.map(({ sequence }) => sequence)).toEqual([0, 1, 2, 3, 4, 5]);
  expect(result).toMatchObject({
    status: "completed",
    finalText: "The sum is 42.",
  });
});

test("executes multiple Tool calls in assistant order and preserves protocol order", async () => {
  const executionOrder: string[] = [];
  const first = call("first", "call-first-001");
  const second = call("second", "call-second-001");
  const tool = (name: string) =>
    defineTool({
      name,
      description: name,
      validate: () => ({ ok: true as const, value: name }),
      execute: async (value) => {
        executionOrder.push(value);
        return value.toUpperCase();
      },
    });
  const model = new ScriptedModel([
    scriptedResponse("response-multi-001", [first, second], "toolCall"),
    scriptedResponse(
      "response-multi-002",
      [{ type: "text", text: "Both finished." }],
      "stop",
    ),
  ]);

  const { events } = await settleRun(
    runAgentLoop({
      messages: [user("Run both.")],
      model,
      tools: new ToolRegistry([tool("first"), tool("second")]),
      maxSteps: 2,
      signal: new AbortController().signal,
    }),
  );

  expect(executionOrder).toEqual(["first", "second"]);
  expect(
    events
      .filter((event) => event.type === "tool.started")
      .map((event) => event.payload.toolCall.id),
  ).toEqual(["call-first-001", "call-second-001"]);
  expect(model.requests[1].messages.slice(1)).toEqual([
    {
      id: "message-response-multi-001",
      role: "assistant",
      content: [first, second],
    },
    {
      id: "tool-result-call-first-001",
      role: "toolResult",
      toolCallId: "call-first-001",
      toolName: "first",
      content: '"FIRST"',
      isError: false,
    },
    {
      id: "tool-result-call-second-001",
      role: "toolResult",
      toolCallId: "call-second-001",
      toolName: "second",
      content: '"SECOND"',
      isError: false,
    },
  ]);
});

test("returns a recoverable Tool error to the model instead of stopping the run", async () => {
  const missing = call("missing", "call-missing-001");
  const model = new ScriptedModel([
    scriptedResponse("response-error-001", [missing], "toolCall"),
    scriptedResponse(
      "response-error-002",
      [{ type: "text", text: "I could not use that Tool." }],
      "stop",
    ),
  ]);

  const { result } = await settleRun(
    runAgentLoop({
      messages: [user("Use the missing Tool.")],
      model,
      tools: new ToolRegistry(),
      maxSteps: 2,
      signal: new AbortController().signal,
    }),
  );

  expect(model.requests[1].messages.at(-1)).toMatchObject({
    role: "toolResult",
    toolCallId: "call-missing-001",
    toolName: "missing",
    isError: true,
  });
  expect(
    model.requests[1].messages.at(-1)?.role === "toolResult"
      ? model.requests[1].messages.at(-1)?.content
      : "",
  ).toContain('"code":"TOOL_NOT_FOUND"');
  expect(result.status).toBe("completed");
});

test("returns a cancelled result when cancellation arrives during model streaming", async () => {
  const enteredWait = deferred<void>();
  const release = deferred<void>();
  const controller = new AbortController();
  const model = new ScriptedModel([
    async function* (request) {
      yield {
        type: "textDelta",
        requestId: request.id,
        delta: "partial",
      };
      enteredWait.resolve();
      await release.promise;
      return responseFor(
        request.id,
        "response-cancel-model",
        [{ type: "text", text: "partial" }],
        "stop",
      );
    },
  ]);
  const stream = runAgentLoop({
    messages: [user()],
    model,
    tools: new ToolRegistry(),
    maxSteps: 2,
    signal: controller.signal,
  });
  const iterator = stream[Symbol.asyncIterator]();
  const accepted = await iterator.next();
  const streamedChunk = await iterator.next();

  await enteredWait.promise;
  controller.abort("caller stopped the run");

  const result = await stream.result;
  const remainingEvents: AgentEvent[] = [];
  while (true) {
    const step = await iterator.next();
    if (step.done) break;
    remainingEvents.push(step.value);
  }
  const events = [
    ...(accepted.done ? [] : [accepted.value]),
    ...(streamedChunk.done ? [] : [streamedChunk.value]),
    ...remainingEvents,
  ];
  release.resolve();

  expect(result).toEqual({
    status: "cancelled",
    messages: [user()],
    reason: "caller stopped the run",
  });
  expect(events.map(({ type }) => type)).toEqual([
    "message.accepted",
    "model.chunk",
    "run.finished",
  ]);
  expect(events.map(({ sequence }) => sequence)).toEqual([0, 1, 2]);
});

test("returns a cancelled result without a Tool result when execution is aborted", async () => {
  const executionStarted = deferred<void>();
  const release = deferred<string>();
  const controller = new AbortController();
  const slowCall = call("slow", "call-slow-001");
  const slowTool = defineTool({
    name: "slow",
    description: "Wait for a gate.",
    validate: () => ({ ok: true as const, value: undefined }),
    execute: async (_value, context) => {
      expect(context.signal.aborted).toBe(false);
      executionStarted.resolve();
      return release.promise;
    },
  });
  const model = new ScriptedModel([
    scriptedResponse("response-cancel-tool", [slowCall], "toolCall"),
  ]);
  const stream = runAgentLoop({
    messages: [user("Run slowly.")],
    model,
    tools: new ToolRegistry([slowTool]),
    maxSteps: 2,
    signal: controller.signal,
  });
  const eventsPromise = collect(stream);

  await executionStarted.promise;
  controller.abort(new DOMException("cancel Tool", "AbortError"));

  const result = await stream.result;
  const events = await eventsPromise;
  release.resolve("late output");

  expect(result).toMatchObject({
    status: "cancelled",
    reason: "cancel Tool",
  });
  expect(events.map(({ type }) => type)).toEqual([
    "message.accepted",
    "model.chunk",
    "tool.started",
    "run.finished",
  ]);
  expect(result.messages.some((message) => message.role === "toolResult")).toBe(
    false,
  );
});

test("enforces maxSteps after a Tool-heavy turn without starting another model call", async () => {
  const executed: string[] = [];
  const calls = [
    call("echo", "call-echo-001", { value: 1 }),
    call("echo", "call-echo-002", { value: 2 }),
    call("echo", "call-echo-003", { value: 3 }),
  ];
  const echo = defineTool({
    name: "echo",
    description: "Echo a value.",
    validate: (input: unknown) => ({ ok: true as const, value: input }),
    execute: async (input, context) => {
      executed.push(context.toolCallId);
      return input;
    },
  });
  const model = new ScriptedModel([
    scriptedResponse("response-budget-001", calls, "toolCall"),
    scriptedResponse(
      "response-budget-002",
      [{ type: "text", text: "must not run" }],
      "stop",
    ),
  ]);

  const { events, result } = await settleRun(
    runAgentLoop({
      messages: [user("Echo three values.")],
      model,
      tools: new ToolRegistry([echo]),
      maxSteps: 1,
      signal: new AbortController().signal,
    }),
  );

  expect(executed).toEqual(["call-echo-001", "call-echo-002", "call-echo-003"]);
  expect(model.callCount).toBe(1);
  expect(result).toMatchObject({ status: "maxSteps", maxSteps: 1 });
  expect(events.at(-1)).toMatchObject({
    type: "run.finished",
    sequence: events.length - 1,
    payload: { result: { status: "maxSteps", maxSteps: 1 } },
  });
});

test("fails an invalid starting transcript without invoking the model", async () => {
  const model = new ScriptedModel();
  const invalidMessages = [
    {
      id: "message-orphan-001",
      role: "toolResult" as const,
      toolCallId: "call-unknown-001",
      toolName: "unknown",
      content: "orphan",
      isError: false,
    },
  ];

  const { events, result } = await settleRun(
    runAgentLoop({
      messages: invalidMessages,
      model,
      tools: new ToolRegistry(),
      maxSteps: 1,
      signal: new AbortController().signal,
    }),
  );

  expect(model.callCount).toBe(0);
  expect(result).toMatchObject({
    status: "failed",
    error: { code: "INVALID_TRANSCRIPT" },
  });
  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({
    type: "run.finished",
    sequence: 0,
    payload: { result: { status: "failed" } },
  });
});

test("fails closed when a model chunk or terminal response is not correlated", async () => {
  const cases: ReadonlyArray<Readonly<{ name: string; model: CourseModel }>> = [
    {
      name: "wrong chunk request",
      model: {
        stream(request) {
          const stream = new EventStream<
            CourseModelChunk,
            CourseModelResponse
          >();
          stream.push({
            type: "textDelta",
            requestId: "request-wrong",
            delta: "bad",
          });
          stream.finish(
            responseFor(
              request.id,
              "response-wrong-chunk",
              [{ type: "text", text: "bad" }],
              "stop",
            ),
          );
          return stream;
        },
      },
    },
    {
      name: "wrong terminal request",
      model: {
        stream(request) {
          const stream = new EventStream<
            CourseModelChunk,
            CourseModelResponse
          >();
          stream.push({
            type: "textDelta",
            requestId: request.id,
            delta: "bad",
          });
          stream.finish(
            responseFor(
              "request-wrong",
              "response-wrong-terminal",
              [{ type: "text", text: "bad" }],
              "stop",
            ),
          );
          return stream;
        },
      },
    },
  ];

  for (const { name, model } of cases) {
    const { result } = await settleRun(
      runAgentLoop({
        messages: [user(name)],
        model,
        tools: new ToolRegistry(),
        maxSteps: 1,
        signal: new AbortController().signal,
      }),
    );
    expect(result, name).toMatchObject({
      status: "failed",
      error: { code: "MODEL_PROTOCOL_ERROR" },
    });
  }
});

test("rejects disagreement between streamed chunks and the final assistant message", async () => {
  const model: CourseModel = {
    stream(request) {
      const stream = new EventStream<CourseModelChunk, CourseModelResponse>();
      stream.push({
        type: "textDelta",
        requestId: request.id,
        delta: "streamed text",
      });
      stream.finish(
        responseFor(
          request.id,
          "response-inconsistent",
          [{ type: "text", text: "different terminal text" }],
          "stop",
        ),
      );
      return stream;
    },
  };

  const { events, result } = await settleRun(
    runAgentLoop({
      messages: [user()],
      model,
      tools: new ToolRegistry(),
      maxSteps: 1,
      signal: new AbortController().signal,
    }),
  );

  expect(result).toMatchObject({
    status: "failed",
    error: { code: "MODEL_PROTOCOL_ERROR" },
  });
  expect(result.messages).toEqual([user()]);
  expect(events.map(({ type }) => type)).toEqual([
    "message.accepted",
    "model.chunk",
    "run.finished",
  ]);
  expect(events.map(({ sequence }) => sequence)).toEqual([0, 1, 2]);
});

test("classifies an uninspectable model chunk as a protocol failure", async () => {
  const model: CourseModel = {
    stream(request) {
      const stream = new EventStream<CourseModelChunk, CourseModelResponse>();
      const hostileChunk = Object.defineProperty({}, "type", {
        get() {
          throw new Error("hostile chunk getter");
        },
      }) as CourseModelChunk;
      stream.push(hostileChunk);
      stream.finish(
        responseFor(
          request.id,
          "response-hostile-chunk",
          [{ type: "text", text: "unreachable" }],
          "stop",
        ),
      );
      return stream;
    },
  };

  const { result } = await settleRun(
    runAgentLoop({
      messages: [user()],
      model,
      tools: new ToolRegistry(),
      maxSteps: 1,
      signal: new AbortController().signal,
    }),
  );

  expect(result).toMatchObject({
    status: "failed",
    error: { code: "MODEL_PROTOCOL_ERROR" },
  });
});

test("normalizes a rejected model stream into a failed terminal result", async () => {
  const model: CourseModel = {
    stream() {
      const stream = new EventStream<CourseModelChunk, CourseModelResponse>();
      stream.fail(new Error("provider offline"));
      return stream;
    },
  };

  const { events, result } = await settleRun(
    runAgentLoop({
      messages: [user()],
      model,
      tools: new ToolRegistry(),
      maxSteps: 1,
      signal: new AbortController().signal,
    }),
  );

  expect(result).toEqual({
    status: "failed",
    messages: [user()],
    error: { code: "MODEL_STREAM_FAILED", message: "provider offline" },
  });
  expect(events.map(({ type, sequence }) => ({ type, sequence }))).toEqual([
    { type: "message.accepted", sequence: 0 },
    { type: "run.finished", sequence: 1 },
  ]);
});

test("cancels while iterator.next stays pending and observes its late rejection", async () => {
  const nextStep = deferred<IteratorResult<CourseModelChunk>>();
  const controller = new AbortController();
  const unhandled: unknown[] = [];
  const removeListener = listenForUnhandledRejections((reason) => {
    unhandled.push(reason);
  });
  let cleanupCalls = 0;
  const model: CourseModel = {
    stream() {
      const stream = new EventStream<CourseModelChunk, CourseModelResponse>();
      const iterator: AsyncIterableIterator<CourseModelChunk> = {
        next: () => nextStep.promise,
        return: async () => {
          cleanupCalls += 1;
          return { done: true, value: undefined };
        },
        [Symbol.asyncIterator]() {
          return this;
        },
      };
      Object.defineProperty(stream, Symbol.asyncIterator, {
        value: () => iterator,
      });
      return stream;
    },
  };
  const run = runAgentLoop({
    messages: [user()],
    model,
    tools: new ToolRegistry(),
    maxSteps: 1,
    signal: controller.signal,
  });

  controller.abort("cancel pending next");

  await expect(settlementByNextTurn(run.result)).resolves.toBe("settled");
  await expect(run.result).resolves.toMatchObject({
    status: "cancelled",
    reason: "cancel pending next",
  });
  expect(cleanupCalls).toBe(1);

  nextStep.reject(new Error("late next rejection"));
  await nextEventLoopTurn();
  await nextEventLoopTurn();
  removeListener();
  expect(unhandled).toEqual([]);
});

test("cancels while model stream.result stays pending and observes its late rejection", async () => {
  const controller = new AbortController();
  const resultRequested = deferred<void>();
  const unhandled: unknown[] = [];
  const removeListener = listenForUnhandledRejections((reason) => {
    unhandled.push(reason);
  });
  let modelStream:
    EventStream<CourseModelChunk, CourseModelResponse> | undefined;
  const model: CourseModel = {
    stream() {
      const stream = new EventStream<CourseModelChunk, CourseModelResponse>();
      modelStream = stream;
      const iterator: AsyncIterableIterator<CourseModelChunk> = {
        next: async () => ({ done: true, value: undefined }),
        [Symbol.asyncIterator]() {
          return this;
        },
      };
      Object.defineProperty(stream, Symbol.asyncIterator, {
        value: () => iterator,
      });
      const originalResult = stream.result;
      Object.defineProperty(stream, "result", {
        get() {
          resultRequested.resolve();
          return originalResult;
        },
      });
      return stream;
    },
  };
  const run = runAgentLoop({
    messages: [user()],
    model,
    tools: new ToolRegistry(),
    maxSteps: 1,
    signal: controller.signal,
  });

  await resultRequested.promise;
  controller.abort("cancel pending result");

  await expect(settlementByNextTurn(run.result)).resolves.toBe("settled");
  await expect(run.result).resolves.toMatchObject({
    status: "cancelled",
    reason: "cancel pending result",
  });

  modelStream?.fail(new Error("late result rejection"));
  await nextEventLoopTurn();
  await nextEventLoopTurn();
  removeListener();
  expect(unhandled).toEqual([]);
});

test("does not await hostile iterator cleanup and observes a rejected cleanup", async () => {
  const cleanup = deferred<IteratorResult<CourseModelChunk>>();
  const unhandled: unknown[] = [];
  const removeListener = listenForUnhandledRejections((reason) => {
    unhandled.push(reason);
  });
  let cleanupCalls = 0;
  const model: CourseModel = {
    stream() {
      const stream = new EventStream<CourseModelChunk, CourseModelResponse>();
      const iterator: AsyncIterableIterator<CourseModelChunk> = {
        next: async () => ({
          done: false,
          value: {
            type: "textDelta",
            requestId: "request-wrong",
            delta: "bad",
          },
        }),
        return: () => {
          cleanupCalls += 1;
          return cleanup.promise;
        },
        [Symbol.asyncIterator]() {
          return this;
        },
      };
      Object.defineProperty(stream, Symbol.asyncIterator, {
        value: () => iterator,
      });
      return stream;
    },
  };
  const run = runAgentLoop({
    messages: [user()],
    model,
    tools: new ToolRegistry(),
    maxSteps: 1,
    signal: new AbortController().signal,
  });

  await expect(settlementByNextTurn(run.result)).resolves.toBe("settled");
  await expect(run.result).resolves.toMatchObject({
    status: "failed",
    error: { code: "MODEL_PROTOCOL_ERROR" },
  });
  expect(cleanupCalls).toBe(1);

  cleanup.reject(new Error("cleanup rejected late"));
  await nextEventLoopTurn();
  await nextEventLoopTurn();
  removeListener();
  expect(unhandled).toEqual([]);
});

test("a hostile iterator return getter cannot replace the model protocol failure", async () => {
  const model: CourseModel = {
    stream() {
      const stream = new EventStream<CourseModelChunk, CourseModelResponse>();
      const iterator = {
        next: async () => ({ done: false, value: null }),
        [Symbol.asyncIterator]() {
          return this;
        },
      };
      Object.defineProperty(iterator, "return", {
        get() {
          throw new Error("hostile return getter");
        },
      });
      Object.defineProperty(stream, Symbol.asyncIterator, {
        value: () => iterator,
      });
      return stream;
    },
  };

  const { result } = await settleRun(
    runAgentLoop({
      messages: [user()],
      model,
      tools: new ToolRegistry(),
      maxSteps: 1,
      signal: new AbortController().signal,
    }),
  );

  expect(result).toMatchObject({
    status: "failed",
    error: { code: "MODEL_PROTOCOL_ERROR" },
  });
});

test("observes an asynchronously rejected model.stream return with shadowed then", async () => {
  const unhandled: unknown[] = [];
  const removeListener = listenForUnhandledRejections((reason) => {
    unhandled.push(reason);
  });
  const rejected = Promise.reject(new Error("async stream rejection"));
  Object.defineProperty(rejected, "then", { value: undefined });
  const model: CourseModel = {
    stream() {
      return rejected as unknown as EventStream<
        CourseModelChunk,
        CourseModelResponse
      >;
    },
  };

  const { result } = await settleRun(
    runAgentLoop({
      messages: [user()],
      model,
      tools: new ToolRegistry(),
      maxSteps: 1,
      signal: new AbortController().signal,
    }),
  );

  await nextEventLoopTurn();
  await nextEventLoopTurn();
  removeListener();
  expect(result).toMatchObject({
    status: "failed",
    error: { code: "MODEL_PROTOCOL_ERROR" },
  });
  expect(unhandled).toEqual([]);
});

test("uses captured AbortSignal intrinsics instead of hostile own properties", async () => {
  const controller = new AbortController();
  Object.defineProperties(controller.signal, {
    aborted: {
      get() {
        throw new Error("hostile aborted getter");
      },
    },
    reason: {
      get() {
        throw new Error("hostile reason getter");
      },
    },
    addEventListener: {
      value() {
        throw new Error("hostile addEventListener");
      },
    },
    removeEventListener: {
      value() {
        throw new Error("hostile removeEventListener");
      },
    },
  });
  const model: CourseModel = {
    stream(request) {
      const stream = new EventStream<CourseModelChunk, CourseModelResponse>();
      stream.push({
        type: "textDelta",
        requestId: request.id,
        delta: "safe",
      });
      stream.finish(
        responseFor(
          request.id,
          "response-hostile-signal",
          [{ type: "text", text: "safe" }],
          "stop",
        ),
      );
      return stream;
    },
  };

  const { result } = await settleRun(
    runAgentLoop({
      messages: [user()],
      model,
      tools: new ToolRegistry(),
      maxSteps: 1,
      signal: controller.signal,
    }),
  );

  expect(result).toMatchObject({ status: "completed", finalText: "safe" });
});

test("normalizes an AbortSignal internal-slot access failure into a failed result", async () => {
  const invalidSignal: AbortSignal = Object.create(AbortSignal.prototype);

  const run = runAgentLoop({
    messages: [user()],
    model: new ScriptedModel(),
    tools: new ToolRegistry(),
    maxSteps: 1,
    signal: invalidSignal,
  });

  await expect(run.result).resolves.toMatchObject({
    status: "failed",
    error: { code: "SIGNAL_ACCESS_FAILED" },
  });
});

test("classifies a null IteratorResult as a model protocol failure", async () => {
  const model: CourseModel = {
    stream() {
      const stream = new EventStream<CourseModelChunk, CourseModelResponse>();
      const iterator = {
        next: async () => null,
        [Symbol.asyncIterator]() {
          return this;
        },
      };
      Object.defineProperty(stream, Symbol.asyncIterator, {
        value: () => iterator,
      });
      return stream;
    },
  };

  const { result } = await settleRun(
    runAgentLoop({
      messages: [user()],
      model,
      tools: new ToolRegistry(),
      maxSteps: 1,
      signal: new AbortController().signal,
    }),
  );

  expect(result).toMatchObject({
    status: "failed",
    error: { code: "MODEL_PROTOCOL_ERROR" },
  });
});

test("reads hostile IteratorResult done and value properties at most once", async () => {
  const reads = { done: 0, value: 0 };
  const model: CourseModel = {
    stream() {
      const stream = new EventStream<CourseModelChunk, CourseModelResponse>();
      const step = Object.defineProperties(
        {},
        {
          done: {
            get() {
              reads.done += 1;
              return false;
            },
          },
          value: {
            get() {
              reads.value += 1;
              return null;
            },
          },
        },
      );
      const iterator = {
        next: async () => step,
        [Symbol.asyncIterator]() {
          return this;
        },
      };
      Object.defineProperty(stream, Symbol.asyncIterator, {
        value: () => iterator,
      });
      return stream;
    },
  };

  const { result } = await settleRun(
    runAgentLoop({
      messages: [user()],
      model,
      tools: new ToolRegistry(),
      maxSteps: 1,
      signal: new AbortController().signal,
    }),
  );

  expect(result).toMatchObject({
    status: "failed",
    error: { code: "MODEL_PROTOCOL_ERROR" },
  });
  expect(reads).toEqual({ done: 1, value: 1 });
});

test("rejects hostile and oversized starting transcript lengths before indexed traversal", async () => {
  expect(MAX_INITIAL_MESSAGES).toBe(4096);
  const target = [user()];
  const hostileLength = new Proxy(target, {
    get(value, key, receiver) {
      if (key === "length") return Number.POSITIVE_INFINITY;
      return Reflect.get(value, key, receiver);
    },
  });
  const model = new ScriptedModel();
  const invalidLengthRun = runAgentLoop({
    messages: hostileLength,
    model,
    tools: new ToolRegistry(),
    maxSteps: 1,
    signal: new AbortController().signal,
  });

  await expect(invalidLengthRun.result).resolves.toMatchObject({
    status: "failed",
    error: {
      code: "INVALID_TRANSCRIPT",
      message: "messages.length must be a non-negative safe integer",
    },
  });

  const tooMany = Array.from({ length: MAX_INITIAL_MESSAGES + 1 }, (_, index) =>
    user(`message ${index}`),
  );
  await expect(
    runAgentLoop({
      messages: tooMany,
      model,
      tools: new ToolRegistry(),
      maxSteps: 1,
      signal: new AbortController().signal,
    }).result,
  ).resolves.toMatchObject({
    status: "failed",
    error: { code: "INVALID_TRANSCRIPT" },
  });
  expect(model.callCount).toBe(0);
});

test("snapshots the Tool registry before late registration and ignores subclass overrides", async () => {
  const releaseModel = deferred<void>();
  const executed: string[] = [];
  class HostileRegistry extends ToolRegistry {
    public snapshot(): ToolRegistry {
      throw new Error("hostile snapshot override");
    }
  }
  const registry = new HostileRegistry([
    defineTool({
      name: "existing",
      description: "Existing Tool.",
      validate: () => ({ ok: true as const, value: "existing" }),
      execute: async (value) => {
        executed.push(value);
        return value;
      },
    }),
  ]);
  const existingCall = call("existing", "call-existing-001");
  const lateCall = call("late", "call-late-001");
  const model = new ScriptedModel([
    async function* (request) {
      await releaseModel.promise;
      yield { type: "toolCall", requestId: request.id, toolCall: existingCall };
      yield { type: "toolCall", requestId: request.id, toolCall: lateCall };
      return responseFor(
        request.id,
        "response-registry-snapshot",
        [existingCall, lateCall],
        "toolCall",
      );
    },
  ]);
  const run = runAgentLoop({
    messages: [user("Use registry snapshot.")],
    model,
    tools: registry,
    maxSteps: 1,
    signal: new AbortController().signal,
  });

  registry.register(
    defineTool({
      name: "late",
      description: "Registered after run construction.",
      validate: () => ({ ok: true as const, value: "late" }),
      execute: async (value) => {
        executed.push(value);
        return value;
      },
    }),
  );
  releaseModel.resolve();

  const { result } = await settleRun(run);
  const toolResults = result.messages.filter(
    (message) => message.role === "toolResult",
  );
  expect(executed).toEqual(["existing"]);
  expect(toolResults).toHaveLength(2);
  expect(toolResults[0]).toMatchObject({
    toolName: "existing",
    isError: false,
  });
  expect(toolResults[1]).toMatchObject({ toolName: "late", isError: true });
  expect(toolResults[1].content).toContain('"code":"TOOL_NOT_FOUND"');
});

test("enforces the documented maxSteps ceiling at construction", () => {
  expect(MAX_AGENT_STEPS).toBe(64);
  expect(() =>
    runAgentLoop({
      messages: [user()],
      model: new ScriptedModel(),
      tools: new ToolRegistry(),
      maxSteps: MAX_AGENT_STEPS + 1,
      signal: new AbortController().signal,
    }),
  ).toThrowError(`maxSteps must not exceed ${MAX_AGENT_STEPS}`);
});

test("fails deterministically when result-only consumption exceeds the chunk cap", async () => {
  expect(MAX_MODEL_CHUNKS_PER_STEP).toBe(1024);
  const model: CourseModel = {
    stream(request) {
      const stream = new EventStream<CourseModelChunk, CourseModelResponse>();
      for (let index = 0; index <= 1024; index += 1) {
        stream.push({
          type: "textDelta",
          requestId: request.id,
          delta: "x",
        });
      }
      stream.finish(
        responseFor(
          request.id,
          "response-too-many-chunks",
          [{ type: "text", text: "x".repeat(1025) }],
          "stop",
        ),
      );
      return stream;
    },
  };
  const run = runAgentLoop({
    messages: [user()],
    model,
    tools: new ToolRegistry(),
    maxSteps: 1,
    signal: new AbortController().signal,
  });

  await expect(run.result).resolves.toMatchObject({
    status: "failed",
    error: { code: "MODEL_PROTOCOL_ERROR" },
  });
});

test("rejects oversized streamed text before emitting the model chunk", async () => {
  expect(MAX_MODEL_TEXT_CODE_POINTS).toBe(65_536);
  const oversized = "😀".repeat(65_537);
  const model: CourseModel = {
    stream(request) {
      const stream = new EventStream<CourseModelChunk, CourseModelResponse>();
      stream.push({
        type: "textDelta",
        requestId: request.id,
        delta: oversized,
      });
      stream.finish(
        responseFor(
          request.id,
          "response-text-cap",
          [{ type: "text", text: oversized }],
          "stop",
        ),
      );
      return stream;
    },
  };

  const { events, result } = await settleRun(
    runAgentLoop({
      messages: [user()],
      model,
      tools: new ToolRegistry(),
      maxSteps: 1,
      signal: new AbortController().signal,
    }),
  );

  expect(result).toMatchObject({
    status: "failed",
    error: { code: "MODEL_PROTOCOL_ERROR" },
  });
  expect(events.map(({ type }) => type)).toEqual([
    "message.accepted",
    "run.finished",
  ]);
});

test("bounds a Tool-heavy response before any Tool effect runs", async () => {
  let executions = 0;
  const registry = new ToolRegistry([
    defineTool({
      name: "bounded",
      description: "Must not execute after an oversized model turn.",
      validate: () => ({ ok: true as const, value: undefined }),
      execute: async () => {
        executions += 1;
        return "unexpected";
      },
    }),
  ]);
  const model: CourseModel = {
    stream(request) {
      const stream = new EventStream<CourseModelChunk, CourseModelResponse>();
      for (let index = 0; index <= MAX_MODEL_CHUNKS_PER_STEP; index += 1) {
        stream.push({
          type: "toolCall",
          requestId: request.id,
          toolCall: call("bounded", `call-bounded-${index}`),
        });
      }
      stream.finish(
        responseFor(
          request.id,
          "response-tool-cap",
          [{ type: "text", text: "unreachable" }],
          "stop",
        ),
      );
      return stream;
    },
  };

  const run = runAgentLoop({
    messages: [user()],
    model,
    tools: registry,
    maxSteps: 1,
    signal: new AbortController().signal,
  });

  await expect(run.result).resolves.toMatchObject({
    status: "failed",
    error: { code: "MODEL_PROTOCOL_ERROR" },
  });
  expect(executions).toBe(0);
});

test("observes model.stream native Promise rejection before hostile metadata", async () => {
  const unhandled: unknown[] = [];
  const removeListener = listenForUnhandledRejections((reason) => {
    unhandled.push(reason);
  });
  const rejected = shadowPromiseMetadata(
    Promise.reject(new Error("stream metadata rejection")),
  );
  const model: CourseModel = {
    stream() {
      return rejected as unknown as EventStream<
        CourseModelChunk,
        CourseModelResponse
      >;
    },
  };

  const { result } = await settleRun(
    runAgentLoop({
      messages: [user()],
      model,
      tools: new ToolRegistry(),
      maxSteps: 1,
      signal: new AbortController().signal,
    }),
  );

  await nextEventLoopTurn();
  await nextEventLoopTurn();
  removeListener();
  expect(result).toMatchObject({
    status: "failed",
    error: { code: "MODEL_PROTOCOL_ERROR" },
  });
  expect(unhandled).toEqual([]);
});

test("observes iterator.next native Promise rejection before hostile metadata", async () => {
  const unhandled: unknown[] = [];
  const removeListener = listenForUnhandledRejections((reason) => {
    unhandled.push(reason);
  });
  const rejected = shadowPromiseMetadata(
    Promise.reject(new Error("next metadata rejection")),
  );
  const model: CourseModel = {
    stream() {
      const stream = new EventStream<CourseModelChunk, CourseModelResponse>();
      const iterator = {
        next: () => rejected,
        [Symbol.asyncIterator]() {
          return this;
        },
      };
      Object.defineProperty(stream, Symbol.asyncIterator, {
        value: () => iterator,
      });
      return stream;
    },
  };

  const { result } = await settleRun(
    runAgentLoop({
      messages: [user()],
      model,
      tools: new ToolRegistry(),
      maxSteps: 1,
      signal: new AbortController().signal,
    }),
  );

  await nextEventLoopTurn();
  await nextEventLoopTurn();
  removeListener();
  expect(result).toMatchObject({
    status: "failed",
    error: { code: "MODEL_STREAM_FAILED" },
  });
  expect(unhandled).toEqual([]);
});

test("observes iterator cleanup rejection before hostile Promise metadata", async () => {
  const unhandled: unknown[] = [];
  const removeListener = listenForUnhandledRejections((reason) => {
    unhandled.push(reason);
  });
  const rejectedCleanup = shadowPromiseMetadata(
    Promise.reject(new Error("cleanup metadata rejection")),
  );
  const model: CourseModel = {
    stream() {
      const stream = new EventStream<CourseModelChunk, CourseModelResponse>();
      const iterator = {
        next: async () => ({ done: false, value: null }),
        return: () => rejectedCleanup,
        [Symbol.asyncIterator]() {
          return this;
        },
      };
      Object.defineProperty(stream, Symbol.asyncIterator, {
        value: () => iterator,
      });
      return stream;
    },
  };

  const { result } = await settleRun(
    runAgentLoop({
      messages: [user()],
      model,
      tools: new ToolRegistry(),
      maxSteps: 1,
      signal: new AbortController().signal,
    }),
  );

  await nextEventLoopTurn();
  await nextEventLoopTurn();
  removeListener();
  expect(result).toMatchObject({
    status: "failed",
    error: { code: "MODEL_PROTOCOL_ERROR" },
  });
  expect(unhandled).toEqual([]);
});

test("classifies a locked native model.stream Promise as unobservable", async () => {
  const locked = creatorObservedLockedRejection("locked stream rejection");
  const model: CourseModel = {
    stream() {
      return locked.promise as unknown as EventStream<
        CourseModelChunk,
        CourseModelResponse
      >;
    },
  };

  const { result } = await settleRun(
    runAgentLoop({
      messages: [user()],
      model,
      tools: new ToolRegistry(),
      maxSteps: 1,
      signal: new AbortController().signal,
    }),
  );
  await locked.creatorObservation;

  expect(result).toMatchObject({
    status: "failed",
    error: {
      code: "MODEL_ASYNC_VALUE_UNOBSERVABLE",
      message: expect.stringContaining("creator must observe"),
    },
  });
});

test("classifies a locked native iterator.next Promise as unobservable", async () => {
  const locked = creatorObservedLockedRejection("locked next rejection");
  const model: CourseModel = {
    stream() {
      const stream = new EventStream<CourseModelChunk, CourseModelResponse>();
      const iterator = {
        next: () => locked.promise,
        [Symbol.asyncIterator]() {
          return this;
        },
      };
      Object.defineProperty(stream, Symbol.asyncIterator, {
        value: () => iterator,
      });
      return stream;
    },
  };

  const { result } = await settleRun(
    runAgentLoop({
      messages: [user()],
      model,
      tools: new ToolRegistry(),
      maxSteps: 1,
      signal: new AbortController().signal,
    }),
  );
  await locked.creatorObservation;

  expect(result).toMatchObject({
    status: "failed",
    error: { code: "MODEL_ASYNC_VALUE_UNOBSERVABLE" },
  });
});

test("classifies a locked native stream.result Promise as unobservable", async () => {
  const locked = creatorObservedLockedRejection("locked result rejection");
  const model: CourseModel = {
    stream() {
      const stream = new EventStream<CourseModelChunk, CourseModelResponse>();
      const iterator = {
        next: async () => ({ done: true as const, value: undefined }),
        [Symbol.asyncIterator]() {
          return this;
        },
      };
      Object.defineProperties(stream, {
        result: { value: locked.promise },
        [Symbol.asyncIterator]: { value: () => iterator },
      });
      return stream;
    },
  };

  const { result } = await settleRun(
    runAgentLoop({
      messages: [user()],
      model,
      tools: new ToolRegistry(),
      maxSteps: 1,
      signal: new AbortController().signal,
    }),
  );
  await locked.creatorObservation;

  expect(result).toMatchObject({
    status: "failed",
    error: { code: "MODEL_ASYNC_VALUE_UNOBSERVABLE" },
  });
});

test("locked cleanup Promise cannot replace the primary model failure", async () => {
  const locked = creatorObservedLockedRejection("locked cleanup rejection");
  const model: CourseModel = {
    stream() {
      const stream = new EventStream<CourseModelChunk, CourseModelResponse>();
      const iterator = {
        next: async () => ({ done: false as const, value: null }),
        return: () => locked.promise,
        [Symbol.asyncIterator]() {
          return this;
        },
      };
      Object.defineProperty(stream, Symbol.asyncIterator, {
        value: () => iterator,
      });
      return stream;
    },
  };

  const { result } = await settleRun(
    runAgentLoop({
      messages: [user()],
      model,
      tools: new ToolRegistry(),
      maxSteps: 1,
      signal: new AbortController().signal,
    }),
  );
  await locked.creatorObservation;

  expect(result).toMatchObject({
    status: "failed",
    error: { code: "MODEL_PROTOCOL_ERROR" },
  });
});

test("rejects a Proxy-wrapped Promise while the creator observes its target", async () => {
  const target = Promise.reject(new Error("creator-owned proxy rejection"));
  const creatorObservation = Reflect.apply(Promise.prototype.then, target, [
    undefined,
    () => undefined,
  ]);
  const proxy = new Proxy(target, {});
  const model: CourseModel = {
    stream() {
      return proxy as unknown as EventStream<
        CourseModelChunk,
        CourseModelResponse
      >;
    },
  };

  const { result } = await settleRun(
    runAgentLoop({
      messages: [user()],
      model,
      tools: new ToolRegistry(),
      maxSteps: 1,
      signal: new AbortController().signal,
    }),
  );
  await creatorObservation;

  expect(result).toMatchObject({
    status: "failed",
    error: {
      code: "MODEL_PROTOCOL_ERROR",
      message: expect.stringContaining("Proxy-wrapped Promise"),
    },
  });
});

test("counts one Unicode code point when a surrogate pair spans text deltas", async () => {
  const prefix = "a".repeat(65_535);
  const finalText = `${prefix}😀`;
  const model: CourseModel = {
    stream(request) {
      const stream = new EventStream<CourseModelChunk, CourseModelResponse>();
      stream.push({
        type: "textDelta",
        requestId: request.id,
        delta: prefix,
      });
      stream.push({
        type: "textDelta",
        requestId: request.id,
        delta: "\ud83d",
      });
      stream.push({
        type: "textDelta",
        requestId: request.id,
        delta: "\ude00",
      });
      stream.finish(
        responseFor(
          request.id,
          "response-split-surrogate-boundary",
          [{ type: "text", text: finalText }],
          "stop",
        ),
      );
      return stream;
    },
  };

  const { result } = await settleRun(
    runAgentLoop({
      messages: [user()],
      model,
      tools: new ToolRegistry(),
      maxSteps: 1,
      signal: new AbortController().signal,
    }),
  );

  expect(result).toMatchObject({ status: "completed", finalText });
});

test("counts one Unicode code point when a surrogate pair spans terminal text blocks", async () => {
  const prefix = "a".repeat(65_535);
  const finalText = `${prefix}😀`;
  const model: CourseModel = {
    stream(request) {
      const stream = new EventStream<CourseModelChunk, CourseModelResponse>();
      for (const delta of [prefix, "\ud83d", "\ude00"]) {
        stream.push({ type: "textDelta", requestId: request.id, delta });
      }
      stream.finish(
        responseFor(
          request.id,
          "response-split-surrogate-block-boundary",
          [
            { type: "text", text: `${prefix}\ud83d` },
            { type: "text", text: "" },
            { type: "text", text: "\ude00" },
          ],
          "stop",
        ),
      );
      return stream;
    },
  };

  const { result } = await settleRun(
    runAgentLoop({
      messages: [user()],
      model,
      tools: new ToolRegistry(),
      maxSteps: 1,
      signal: new AbortController().signal,
    }),
  );

  expect(result).toMatchObject({ status: "completed", finalText });
});

test("a Tool-call chunk breaks surrogate adjacency before an overflowing low surrogate", async () => {
  const prefix = "a".repeat(65_535);
  const toolCall = call("bounded", "call-surrogate-separator-overflow");
  const model: CourseModel = {
    stream(request) {
      const stream = new EventStream<CourseModelChunk, CourseModelResponse>();
      for (const delta of [prefix, "\ud83d"]) {
        stream.push({ type: "textDelta", requestId: request.id, delta });
      }
      stream.push({ type: "toolCall", requestId: request.id, toolCall });
      stream.push({
        type: "textDelta",
        requestId: request.id,
        delta: "\ude00",
      });
      stream.finish(
        responseFor(
          request.id,
          "response-surrogate-separator-overflow",
          [
            { type: "text", text: `${prefix}\ud83d` },
            toolCall,
            { type: "text", text: "\ude00" },
          ],
          "toolCall",
        ),
      );
      return stream;
    },
  };

  const { events, result } = await settleRun(
    runAgentLoop({
      messages: [user()],
      model,
      tools: new ToolRegistry(),
      maxSteps: 1,
      signal: new AbortController().signal,
    }),
  );

  expect(result).toMatchObject({
    status: "failed",
    error: { code: "MODEL_PROTOCOL_ERROR" },
  });
  const chunks = events
    .filter((event) => event.type === "model.chunk")
    .map((event) => event.payload.chunk);
  expect(chunks).toHaveLength(3);
  expect(chunks[2]).toMatchObject({ type: "toolCall" });
  expect(
    chunks.some(
      (chunk) => chunk.type === "textDelta" && chunk.delta === "\ude00",
    ),
  ).toBe(false);
});

test("accepts the text budget boundary when a Tool call separates surrogates", async () => {
  const prefix = "a".repeat(65_534);
  const toolCall = call("bounded", "call-surrogate-separator-boundary");
  let executions = 0;
  const tools = new ToolRegistry([
    defineTool({
      name: "bounded",
      description: "Separate streamed text.",
      validate: () => ({ ok: true as const, value: undefined }),
      execute: async () => {
        executions += 1;
        return "ok";
      },
    }),
  ]);
  const model: CourseModel = {
    stream(request) {
      const stream = new EventStream<CourseModelChunk, CourseModelResponse>();
      for (const delta of [prefix, "\ud83d"]) {
        stream.push({ type: "textDelta", requestId: request.id, delta });
      }
      stream.push({ type: "toolCall", requestId: request.id, toolCall });
      stream.push({
        type: "textDelta",
        requestId: request.id,
        delta: "\ude00",
      });
      stream.finish(
        responseFor(
          request.id,
          "response-surrogate-separator-boundary",
          [
            { type: "text", text: `${prefix}\ud83d` },
            toolCall,
            { type: "text", text: "\ude00" },
          ],
          "toolCall",
        ),
      );
      return stream;
    },
  };

  const { events, result } = await settleRun(
    runAgentLoop({
      messages: [user()],
      model,
      tools,
      maxSteps: 1,
      signal: new AbortController().signal,
    }),
  );

  expect(result.status).toBe("maxSteps");
  expect(events.filter((event) => event.type === "model.chunk")).toHaveLength(
    4,
  );
  expect(executions).toBe(1);
});

test("applies split-surrogate text budgets to initial assistant blocks", async () => {
  const prefix = "a".repeat(65_535);
  const boundaryAssistant = {
    id: "message-initial-split-boundary",
    role: "assistant" as const,
    content: [
      { type: "text" as const, text: `${prefix}\ud83d` },
      { type: "text" as const, text: "" },
      { type: "text" as const, text: "\ude00" },
    ],
  };
  const model = new ScriptedModel([
    scriptedResponse(
      "response-after-initial-split-boundary",
      [{ type: "text", text: "done" }],
      "stop",
    ),
  ]);
  await expect(
    runAgentLoop({
      messages: [user(), boundaryAssistant],
      model,
      tools: new ToolRegistry(),
      maxSteps: 1,
      signal: new AbortController().signal,
    }).result,
  ).resolves.toMatchObject({ status: "completed", finalText: "done" });

  const overBudgetModel = new ScriptedModel();
  await expect(
    runAgentLoop({
      messages: [
        user(),
        {
          ...boundaryAssistant,
          id: "message-initial-split-overflow",
          content: [
            { type: "text" as const, text: `${"a".repeat(65_536)}\ud83d` },
            { type: "text" as const, text: "\ude00" },
          ],
        },
      ],
      model: overBudgetModel,
      tools: new ToolRegistry(),
      maxSteps: 1,
      signal: new AbortController().signal,
    }).result,
  ).resolves.toMatchObject({
    status: "failed",
    error: { code: "INVALID_TRANSCRIPT" },
  });
  expect(overBudgetModel.callCount).toBe(0);
});

test("keeps a split surrogate pair pending across empty text deltas", async () => {
  const prefix = "a".repeat(65_535);
  const finalText = `${prefix}😀`;
  const model: CourseModel = {
    stream(request) {
      const stream = new EventStream<CourseModelChunk, CourseModelResponse>();
      for (const delta of [prefix, "\ud83d", "", "\ude00"]) {
        stream.push({ type: "textDelta", requestId: request.id, delta });
      }
      stream.finish(
        responseFor(
          request.id,
          "response-split-surrogate-empty-delta",
          [{ type: "text", text: finalText }],
          "stop",
        ),
      );
      return stream;
    },
  };

  const { result } = await settleRun(
    runAgentLoop({
      messages: [user()],
      model,
      tools: new ToolRegistry(),
      maxSteps: 1,
      signal: new AbortController().signal,
    }),
  );

  expect(result).toMatchObject({ status: "completed", finalText });
});

test("rejects 65,537 Unicode code points even with a split surrogate pair", async () => {
  const prefix = "a".repeat(65_536);
  const model: CourseModel = {
    stream(request) {
      const stream = new EventStream<CourseModelChunk, CourseModelResponse>();
      for (const delta of [prefix, "\ud83d", "\ude00"]) {
        stream.push({ type: "textDelta", requestId: request.id, delta });
      }
      stream.finish(
        responseFor(
          request.id,
          "response-split-surrogate-overflow",
          [{ type: "text", text: `${prefix}😀` }],
          "stop",
        ),
      );
      return stream;
    },
  };

  const { events, result } = await settleRun(
    runAgentLoop({
      messages: [user()],
      model,
      tools: new ToolRegistry(),
      maxSteps: 1,
      signal: new AbortController().signal,
    }),
  );

  expect(result).toMatchObject({
    status: "failed",
    error: { code: "MODEL_PROTOCOL_ERROR" },
  });
  expect(events.filter((event) => event.type === "model.chunk")).toHaveLength(
    1,
  );
});

test("preserves a dangling high surrogate at the exact text boundary", async () => {
  const finalText = `${"a".repeat(65_535)}\ud83d`;
  const model = new ScriptedModel([
    scriptedResponse(
      "response-dangling-surrogate",
      [{ type: "text", text: finalText }],
      "stop",
    ),
  ]);

  const { result } = await settleRun(
    runAgentLoop({
      messages: [user()],
      model,
      tools: new ToolRegistry(),
      maxSteps: 1,
      signal: new AbortController().signal,
    }),
  );

  expect(result).toMatchObject({ status: "completed", finalText });
});

test("bounds raw terminal assistant blocks before snapshot materialization", async () => {
  expect(MAX_MODEL_BLOCKS_PER_STEP).toBe(1024);
  const tooManyBlocks: CourseAssistantBlock[] = Array.from(
    { length: 1026 },
    (_, index) => ({ type: "text", text: index === 0 ? "x" : "" }),
  );
  const model: CourseModel = {
    stream(request) {
      const stream = new EventStream<CourseModelChunk, CourseModelResponse>();
      stream.push({ type: "textDelta", requestId: request.id, delta: "x" });
      stream.finish(
        responseFor(
          request.id,
          "response-terminal-block-overflow",
          tooManyBlocks,
          "stop",
        ),
      );
      return stream;
    },
  };

  const { result } = await settleRun(
    runAgentLoop({
      messages: [user()],
      model,
      tools: new ToolRegistry(),
      maxSteps: 1,
      signal: new AbortController().signal,
    }),
  );

  expect(result).toMatchObject({
    status: "failed",
    error: { code: "MODEL_PROTOCOL_ERROR" },
  });
});

test("bounds terminal and initial assistant text before snapshot retention", async () => {
  const oversizedText = "a".repeat(MAX_MODEL_TEXT_CODE_POINTS + 1);
  const model: CourseModel = {
    stream(request) {
      const stream = new EventStream<CourseModelChunk, CourseModelResponse>();
      stream.push({ type: "textDelta", requestId: request.id, delta: "x" });
      stream.finish(
        responseFor(
          request.id,
          "response-terminal-text-overflow",
          [{ type: "text", text: oversizedText }],
          "stop",
        ),
      );
      return stream;
    },
  };
  await expect(
    runAgentLoop({
      messages: [user()],
      model,
      tools: new ToolRegistry(),
      maxSteps: 1,
      signal: new AbortController().signal,
    }).result,
  ).resolves.toMatchObject({
    status: "failed",
    error: { code: "MODEL_PROTOCOL_ERROR" },
  });

  const unusedModel = new ScriptedModel();
  await expect(
    runAgentLoop({
      messages: [
        user(),
        {
          id: "message-initial-text-overflow",
          role: "assistant",
          content: [{ type: "text", text: oversizedText }],
        },
      ],
      model: unusedModel,
      tools: new ToolRegistry(),
      maxSteps: 1,
      signal: new AbortController().signal,
    }).result,
  ).resolves.toMatchObject({
    status: "failed",
    error: { code: "INVALID_TRANSCRIPT" },
  });
  expect(unusedModel.callCount).toBe(0);
});

test("accepts exactly the terminal assistant block boundary", async () => {
  const boundaryBlocks: CourseAssistantBlock[] = Array.from(
    { length: MAX_MODEL_BLOCKS_PER_STEP },
    (_, index) => ({ type: "text", text: index === 0 ? "x" : "" }),
  );
  const model: CourseModel = {
    stream(request) {
      const stream = new EventStream<CourseModelChunk, CourseModelResponse>();
      stream.push({ type: "textDelta", requestId: request.id, delta: "x" });
      stream.finish(
        responseFor(
          request.id,
          "response-terminal-block-boundary",
          boundaryBlocks,
          "stop",
        ),
      );
      return stream;
    },
  };

  const { result } = await settleRun(
    runAgentLoop({
      messages: [user()],
      model,
      tools: new ToolRegistry(),
      maxSteps: 1,
      signal: new AbortController().signal,
    }),
  );
  expect(result).toMatchObject({ status: "completed", finalText: "x" });
});

test("rejects oversized initial assistant blocks and Tool arguments", async () => {
  const model = new ScriptedModel();
  const oversizedBlocks = Array.from({ length: 1025 }, () => ({
    type: "text" as const,
    text: "",
  }));
  const oversizedCall = call("bounded", "call-initial-oversized", {
    x: "a".repeat(4096),
  });
  const cases = [
    [
      user(),
      {
        id: "message-initial-block-overflow",
        role: "assistant" as const,
        content: oversizedBlocks,
      },
    ],
    [
      user(),
      {
        id: "message-initial-arguments-overflow",
        role: "assistant" as const,
        content: [oversizedCall],
      },
      {
        id: "message-initial-result",
        role: "toolResult" as const,
        toolCallId: oversizedCall.id,
        toolName: oversizedCall.name,
        content: "ignored",
        isError: false,
      },
    ],
  ];

  for (const messages of cases) {
    await expect(
      runAgentLoop({
        messages,
        model,
        tools: new ToolRegistry(),
        maxSteps: 1,
        signal: new AbortController().signal,
      }).result,
    ).resolves.toMatchObject({
      status: "failed",
      error: { code: "INVALID_TRANSCRIPT" },
    });
  }
  expect(model.callCount).toBe(0);
});

test("enforces bounded plain JSON Tool arguments before model.chunk", async () => {
  expect(MAX_TOOL_ARGUMENT_DEPTH).toBe(32);
  expect(MAX_TOOL_ARGUMENT_NODES).toBe(257);
  expect(MAX_TOOL_ARGUMENT_ENTRIES).toBe(256);
  expect(MAX_TOOL_ARGUMENT_STRING_CODE_POINTS).toBe(4096);

  let deepArguments: Record<string, unknown> = {};
  for (let depth = 0; depth <= MAX_TOOL_ARGUMENT_DEPTH; depth += 1) {
    deepArguments = { x: deepArguments };
  }
  const cases: CourseToolCall[] = [
    call("bounded", "call-string-overflow", { x: "a".repeat(4096) }),
    call("bounded", "call-entry-overflow", {
      x: Array.from({ length: 256 }, () => 0),
    }),
    call(
      "bounded",
      "call-depth-overflow",
      deepArguments as CourseToolCall["arguments"],
    ),
  ];

  for (const toolCall of cases) {
    const model: CourseModel = {
      stream(request) {
        const stream = new EventStream<CourseModelChunk, CourseModelResponse>();
        stream.push({ type: "toolCall", requestId: request.id, toolCall });
        stream.finish(
          responseFor(
            request.id,
            `response-${toolCall.id}`,
            [toolCall],
            "toolCall",
          ),
        );
        return stream;
      },
    };
    const { events, result } = await settleRun(
      runAgentLoop({
        messages: [user()],
        model,
        tools: new ToolRegistry(),
        maxSteps: 1,
        signal: new AbortController().signal,
      }),
    );
    expect(result).toMatchObject({
      status: "failed",
      error: { code: "MODEL_PROTOCOL_ERROR" },
    });
    expect(events.some((event) => event.type === "model.chunk")).toBe(false);
  }
});

test("rejects Proxy, accessor, exotic, sparse, and undefined Tool arguments", async () => {
  let accessorReads = 0;
  const accessorArguments = Object.defineProperty({}, "x", {
    enumerable: true,
    get() {
      accessorReads += 1;
      return 1;
    },
  });
  let proxyTraps = 0;
  const proxyArguments = new Proxy(
    {},
    {
      ownKeys() {
        proxyTraps += 1;
        return [];
      },
    },
  );
  const sparseArguments: unknown[] = [];
  sparseArguments.length = 1;
  const invalidArguments: unknown[] = [
    proxyArguments,
    accessorArguments,
    { x: new Date(0) },
    { x: sparseArguments },
    { x: undefined },
  ];

  for (let index = 0; index < invalidArguments.length; index += 1) {
    const toolCall = call(
      "bounded",
      `call-json-shape-${index}`,
      invalidArguments[index] as CourseToolCall["arguments"],
    );
    const model: CourseModel = {
      stream(request) {
        const stream = new EventStream<CourseModelChunk, CourseModelResponse>();
        stream.push({ type: "toolCall", requestId: request.id, toolCall });
        stream.finish(
          responseFor(
            request.id,
            `response-json-shape-${index}`,
            [toolCall],
            "toolCall",
          ),
        );
        return stream;
      },
    };
    const { events, result } = await settleRun(
      runAgentLoop({
        messages: [user()],
        model,
        tools: new ToolRegistry(),
        maxSteps: 1,
        signal: new AbortController().signal,
      }),
    );
    expect(result).toMatchObject({
      status: "failed",
      error: { code: "MODEL_PROTOCOL_ERROR" },
    });
    expect(events.some((event) => event.type === "model.chunk")).toBe(false);
  }
  expect(accessorReads).toBe(0);
  expect(proxyTraps).toBe(0);
});

test("accepts null-prototype JSON Tool arguments at the boundary", async () => {
  const values = Object.setPrototypeOf([0], null) as unknown[];
  const argumentsValue = Object.assign(Object.create(null), {
    values,
  }) as CourseToolCall["arguments"];
  const toolCall = call("bounded", "call-null-prototype", argumentsValue);
  let executions = 0;
  const model = new ScriptedModel([
    scriptedResponse("response-null-prototype", [toolCall], "toolCall"),
  ]);
  const tools = new ToolRegistry([
    defineTool({
      name: "bounded",
      description: "Accept JSON.",
      validate: (input: unknown) => ({ ok: true as const, value: input }),
      execute: async () => {
        executions += 1;
        return "ok";
      },
    }),
  ]);

  const { result } = await settleRun(
    runAgentLoop({
      messages: [user()],
      model,
      tools,
      maxSteps: 1,
      signal: new AbortController().signal,
    }),
  );
  expect(result.status).toBe("maxSteps");
  expect(executions).toBe(1);
});

test("accepts exact Tool argument string, depth, node, and entry boundaries", async () => {
  let depthBoundary: Record<string, unknown> = {};
  for (let depth = 0; depth < MAX_TOOL_ARGUMENT_DEPTH; depth += 1) {
    depthBoundary = { x: depthBoundary };
  }
  const entryBoundary = Array.from({ length: 255 }, () => 0);
  const boundaryCalls = [
    call("bounded", "call-string-boundary", { x: "a".repeat(4095) }),
    call(
      "bounded",
      "call-depth-boundary",
      depthBoundary as CourseToolCall["arguments"],
    ),
    call("bounded", "call-entry-boundary", { x: entryBoundary }),
  ];
  let executions = 0;
  const registry = new ToolRegistry([
    defineTool({
      name: "bounded",
      description: "Accept bounded arguments.",
      validate: (input: unknown) => ({ ok: true as const, value: input }),
      execute: async () => {
        executions += 1;
        return "ok";
      },
    }),
  ]);
  const model = new ScriptedModel([
    scriptedResponse("response-argument-boundaries", boundaryCalls, "toolCall"),
  ]);

  const { result } = await settleRun(
    runAgentLoop({
      messages: [user()],
      model,
      tools: registry,
      maxSteps: 1,
      signal: new AbortController().signal,
    }),
  );

  expect(result.status).toBe("maxSteps");
  expect(executions).toBe(3);
});
