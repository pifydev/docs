import { expect, test } from "vitest";

import {
  Agent,
  AgentBusyError,
  EventStream,
  ScriptedModel,
  ToolRegistry,
  defineTool,
  type AgentEvent,
  type CourseAssistantBlock,
  type CourseModelChunk,
  type CourseModelRequest,
  type CourseModelResponse,
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

function responseFor(
  request: CourseModelRequest,
  id: string,
  content: readonly CourseAssistantBlock[],
  stopReason: CourseModelResponse["stopReason"],
): CourseModelResponse {
  return {
    id,
    requestId: request.id,
    message: { id: `message-${id}`, role: "assistant", content },
    stopReason,
    usage: { inputTokens: 3, outputTokens: 2 },
  };
}

function scriptedResponse(
  id: string,
  content: readonly CourseAssistantBlock[],
  stopReason: CourseModelResponse["stopReason"] = "stop",
): ScriptedResponseFactory {
  return async function* (request) {
    for (const block of content) {
      const chunk: CourseModelChunk =
        block.type === "text"
          ? { type: "textDelta", requestId: request.id, delta: block.text }
          : { type: "toolCall", requestId: request.id, toolCall: block };
      yield chunk;
    }
    return responseFor(request, id, content, stopReason);
  };
}

async function collect<Value>(source: AsyncIterable<Value>): Promise<Value[]> {
  const values: Value[] = [];
  for await (const value of source) values.push(value);
  return values;
}

async function settle(stream: EventStream<AgentEvent, RunResult>) {
  const eventsPromise = collect(stream);
  const result = await stream.result;
  return { events: await eventsPromise, result };
}

test("owns prompt lifecycle state and emits one terminal event", async () => {
  const model = new ScriptedModel([
    scriptedResponse("response-001", [{ type: "text", text: "Hello." }]),
  ]);
  const agent = new Agent({ model });

  const stream = agent.prompt("Hi");
  expect(agent.isRunning).toBe(true);

  const { events, result } = await settle(stream);
  expect(result).toMatchObject({ status: "completed", finalText: "Hello." });
  expect(agent.isRunning).toBe(false);
  expect(agent.messages.map((message) => message.role)).toEqual([
    "user",
    "assistant",
  ]);
  expect(events.map((event) => event.type)).toEqual([
    "message.accepted",
    "model.chunk",
    "run.finished",
  ]);
  expect(events.map((event) => event.sequence)).toEqual([0, 1, 2]);
  expect(events.filter((event) => event.type === "run.finished")).toHaveLength(
    1,
  );
});

test("rejects a second active run deterministically", async () => {
  const entered = deferred<void>();
  const release = deferred<void>();
  const model = new ScriptedModel([
    async function* (request) {
      entered.resolve();
      await release.promise;
      yield { type: "textDelta", requestId: request.id, delta: "done" };
      return responseFor(
        request,
        "response-busy",
        [{ type: "text", text: "done" }],
        "stop",
      );
    },
  ]);
  const agent = new Agent({ model });
  const active = agent.prompt("first");
  await entered.promise;

  expect(() => agent.prompt("second")).toThrow(AgentBusyError);
  expect(() => agent.continue()).toThrowError("Agent is already running");

  release.resolve();
  await settle(active);
  expect(model.callCount).toBe(1);
});

test("exposes copied deeply immutable transcript snapshots", async () => {
  const agent = new Agent({
    model: new ScriptedModel([
      scriptedResponse("response-snapshot", [
        { type: "text", text: "immutable" },
      ]),
    ]),
  });
  await agent.prompt("snapshot").result;

  const first = agent.messages;
  const second = agent.messages;
  expect(first).not.toBe(second);
  expect(Object.isFrozen(first)).toBe(true);
  expect(Object.isFrozen(first[0])).toBe(true);
  expect(Object.isFrozen(first[1])).toBe(true);
  if (first[1].role !== "assistant") throw new Error("assistant expected");
  expect(Object.isFrozen(first[1].content)).toBe(true);
  expect(Object.isFrozen(first[1].content[0])).toBe(true);
  expect(() =>
    (first as unknown as Array<(typeof first)[number]>).push(first[0]),
  ).toThrow();
});

test("cancels an active model wait and settles exactly once", async () => {
  const entered = deferred<void>();
  const never = deferred<void>();
  const model = new ScriptedModel([
    async function* (request) {
      entered.resolve();
      await never.promise;
      return responseFor(request, "unreachable", [], "stop");
    },
  ]);
  const agent = new Agent({ model });
  let terminalCancellation: boolean | undefined;
  agent.subscribe((event) => {
    if (event.type === "run.finished") {
      terminalCancellation = agent.cancel("too late");
    }
  });
  const run = agent.prompt("wait");
  await entered.promise;

  expect(agent.cancel("user stopped the run")).toBe(true);
  expect(agent.cancel("duplicate cancellation")).toBe(false);
  const { events, result } = await settle(run);

  expect(result).toMatchObject({
    status: "cancelled",
    reason: "user stopped the run",
  });
  expect(events.at(-1)).toMatchObject({
    type: "run.finished",
    payload: { result: { status: "cancelled" } },
  });
  expect(events.filter((event) => event.type === "run.finished")).toHaveLength(
    1,
  );
  expect(terminalCancellation).toBe(false);
  expect(agent.isRunning).toBe(false);
});

test("injects each steering item at the next completed Turn boundary", async () => {
  const toolEntered = deferred<void>();
  const releaseTool = deferred<void>();
  const model = new ScriptedModel([
    scriptedResponse(
      "response-tool",
      [
        {
          type: "toolCall",
          id: "call-add-001",
          name: "add",
          arguments: { left: 20, right: 22 },
        },
      ],
      "toolCall",
    ),
    scriptedResponse("response-steered", [
      { type: "text", text: "Used the correction." },
    ]),
    scriptedResponse("response-steered-again", [
      { type: "text", text: "Both corrections applied." },
    ]),
  ]);
  const tools = new ToolRegistry([
    defineTool({
      name: "add",
      description: "Add two numbers.",
      validate: (input: unknown) => ({ ok: true as const, value: input }),
      execute: async () => {
        toolEntered.resolve();
        await releaseTool.promise;
        return { sum: 42 };
      },
    }),
  ]);
  const agent = new Agent({ model, tools, maxSteps: 3 });
  const run = agent.prompt("calculate");
  await toolEntered.promise;

  const first = agent.steer("Use integer arithmetic.");
  const second = agent.steer("Keep the answer short.");
  expect(first.id).toBe("agent-user-000002");
  expect(second.id).toBe("agent-user-000003");
  releaseTool.resolve();

  const { result } = await settle(run);
  expect(result).toMatchObject({
    status: "completed",
    finalText: "Both corrections applied.",
  });
  expect(model.requests).toHaveLength(3);
  expect(
    model.requests[1].messages
      .filter((message) => message.role === "user")
      .map((message) => message.content),
  ).toEqual(["calculate", "Use integer arithmetic."]);
  expect(model.requests[2].messages.at(-1)).toMatchObject({
    role: "user",
    id: "agent-user-000003",
    content: "Keep the answer short.",
  });
});

test("runs follow-up only after a terminal model response", async () => {
  const firstTurnReached = deferred<void>();
  const releaseFirstTurn = deferred<void>();
  const model = new ScriptedModel([
    async function* (request) {
      firstTurnReached.resolve();
      await releaseFirstTurn.promise;
      yield { type: "textDelta", requestId: request.id, delta: "first" };
      return responseFor(
        request,
        "response-first",
        [{ type: "text", text: "first" }],
        "stop",
      );
    },
    scriptedResponse("response-follow-up", [{ type: "text", text: "second" }]),
  ]);
  const agent = new Agent({ model });
  const run = agent.prompt("start");
  await firstTurnReached.promise;
  const queued = agent.followUp("Now summarize.");
  expect(queued.id).toBe("agent-user-000002");
  expect(model.callCount).toBe(1);

  releaseFirstTurn.resolve();
  const { events, result } = await settle(run);

  expect(result).toMatchObject({ status: "completed", finalText: "second" });
  expect(model.requests).toHaveLength(2);
  expect(model.requests[1].messages.at(-1)).toMatchObject({
    role: "user",
    content: "Now summarize.",
  });
  expect(events.filter((event) => event.type === "run.finished")).toHaveLength(
    1,
  );
});

test("delivers subscribers in order, isolates failures, and honors unsubscribe", async () => {
  const calls: string[] = [];
  const agent = new Agent({
    model: new ScriptedModel([
      scriptedResponse("response-subscribers", [{ type: "text", text: "ok" }]),
    ]),
  });
  const unsubscribe = agent.subscribe(async (event) => {
    calls.push(`first:${event.type}`);
    if (event.type === "message.accepted") throw new Error("listener failed");
  });
  agent.subscribe((event) => {
    calls.push(`second:${event.type}`);
    if (event.type === "message.accepted") unsubscribe();
  });

  await agent.prompt("notify").result;

  expect(calls).toEqual([
    "first:message.accepted",
    "second:message.accepted",
    "second:model.chunk",
    "second:run.finished",
  ]);
  expect(agent.subscriberErrors).toEqual([
    {
      eventType: "message.accepted",
      listenerId: 1,
      message: "listener failed",
    },
  ]);
  expect(Object.isFrozen(agent.subscriberErrors)).toBe(true);
});

test("serializes reentrant steering from a subscriber without corrupting state", async () => {
  const model = new ScriptedModel([
    scriptedResponse("response-before-reentry", [
      { type: "text", text: "first" },
    ]),
    scriptedResponse("response-after-reentry", [
      { type: "text", text: "second" },
    ]),
  ]);
  const agent = new Agent({ model });
  let steered = false;
  agent.subscribe((event) => {
    if (!steered && event.type === "model.chunk") {
      steered = true;
      agent.steer("subscriber correction");
      expect(() => agent.prompt("illegal overlap")).toThrow(AgentBusyError);
    }
  });

  const result = await agent.prompt("begin").result;

  expect(result).toMatchObject({ status: "completed", finalText: "second" });
  expect(model.requests).toHaveLength(2);
  expect(model.requests[1].messages.at(-1)).toMatchObject({
    role: "user",
    content: "subscriber correction",
  });
  expect(agent.subscriberErrors).toEqual([]);
});

test("continues queued work from an assistant tail without merging messages", async () => {
  const model = new ScriptedModel([
    scriptedResponse("response-initial", [{ type: "text", text: "idle" }]),
    scriptedResponse("response-continued", [
      { type: "text", text: "continued" },
    ]),
    scriptedResponse("response-followed", [{ type: "text", text: "followed" }]),
  ]);
  const agent = new Agent({ model });
  await agent.prompt("initial").result;
  const steering = agent.steer("first queued");
  const followUp = agent.followUp("second queued");

  const result = await agent.continue().result;

  expect(result).toMatchObject({ status: "completed", finalText: "followed" });
  expect(model.requests[1].messages.at(-1)).toEqual(steering);
  expect(model.requests[2].messages.at(-1)).toEqual(followUp);
  expect(() => agent.continue()).toThrowError(
    "Cannot continue from an assistant message without queued work",
  );
});

test("recovers after a failed run and retains queued work explicitly", async () => {
  const model = new ScriptedModel();
  const agent = new Agent({ model });
  const firstRun = agent.prompt("will fail");
  const queued = agent.steer("queued during failure");
  const firstResult = await firstRun.result;
  expect(firstResult).toMatchObject({ status: "failed" });
  expect(agent.isRunning).toBe(false);
  expect(agent.messages.at(-1)).not.toEqual(queued);

  model.appendResponse(
    scriptedResponse("response-recovery", [
      { type: "text", text: "recovered" },
    ]),
  );
  const recovered = await agent.continue().result;

  expect(recovered).toMatchObject({
    status: "completed",
    finalText: "recovered",
  });
  expect(model.requests.at(-1)?.messages.at(-1)).toEqual(queued);
});

test("snapshots model and Tool configuration at construction", async () => {
  const scripted = new ScriptedModel([
    scriptedResponse(
      "response-snapshot-tool",
      [
        {
          type: "toolCall",
          id: "call-late-001",
          name: "late",
          arguments: {},
        },
      ],
      "toolCall",
    ),
    scriptedResponse("response-snapshot-config", [
      { type: "text", text: "stable" },
    ]),
  ]);
  let streamReads = 0;
  const model = {
    get stream() {
      streamReads += 1;
      return (
        request: CourseModelRequest,
        signal: AbortSignal,
      ): EventStream<CourseModelChunk, CourseModelResponse> =>
        scripted.stream(request, signal);
    },
  };
  const tools = new ToolRegistry();
  const agent = new Agent({ model, tools, maxSteps: 2 });
  tools.register(
    defineTool({
      name: "late",
      description: "Registered after Agent construction.",
      validate: (input: unknown) => ({ ok: true as const, value: input }),
      execute: async () => "late",
    }),
  );

  const result = await agent.prompt("stable config").result;
  expect(streamReads).toBe(1);
  expect(scripted.callCount).toBe(2);
  expect(
    result.messages.find((message) => message.role === "toolResult"),
  ).toMatchObject({ role: "toolResult", toolName: "late", isError: true });
});
