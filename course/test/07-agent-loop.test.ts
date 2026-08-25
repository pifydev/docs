import { expect, test } from "vitest";

import {
  EventStream,
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
}>;

function deferred<Value>(): Deferred<Value> {
  let resolve!: (value: Value | PromiseLike<Value>) => void;
  const promise = new Promise<Value>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
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
  const eventsPromise = collect(stream);

  await enteredWait.promise;
  controller.abort("caller stopped the run");

  const result = await stream.result;
  const events = await eventsPromise;
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
