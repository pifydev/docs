import { expect, test } from "vitest";

import {
  Agent,
  AgentBusyError,
  AgentMessageLimitError,
  EventStream,
  MAX_AGENT_MESSAGES,
  MAX_MODEL_CHUNKS_PER_STEP,
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
  const cancellationResultPromises: Promise<RunResult>[] = [];
  agent.subscribe((event) => {
    if (event.type === "run.finished") {
      terminalCancellation = agent.cancel("too late");
    }
  });
  agent.subscribe(async (event) => {
    if (event.type === "run.finished") await cancellationResultPromises[0];
  });
  const run = agent.prompt("wait");
  cancellationResultPromises.push(run.result);
  await entered.promise;
  const retainedFollowUp = agent.followUp("resume after cancellation");

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

  model.appendResponse(
    scriptedResponse("response-after-cancel", [
      { type: "text", text: "resumed" },
    ]),
  );
  model.appendResponse(
    scriptedResponse("response-retained-follow-up", [
      { type: "text", text: "follow-up complete" },
    ]),
  );
  await expect(agent.continue().result).resolves.toMatchObject({
    status: "completed",
    finalText: "follow-up complete",
  });
  expect(model.requests.at(-1)?.messages.at(-1)).toEqual(retainedFollowUp);
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
  expect(model.requests.map((request) => request.id)).toEqual([
    "request-001",
    "request-002",
    "request-003",
  ]);
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

test("subscriber Promises never block later listeners or Agent settlement", async () => {
  const model = new ScriptedModel([
    scriptedResponse("response-no-listener-deadlock-1", [
      { type: "text", text: "first" },
    ]),
    scriptedResponse("response-no-listener-deadlock-2", [
      { type: "text", text: "second" },
    ]),
  ]);
  const agent = new Agent({ model });
  const invocations: string[] = [];
  let activeResult: Promise<RunResult>;
  agent.subscribe(async (event) => {
    if (event.type !== "model.chunk") return;
    invocations.push("pending-first");
    await activeResult;
  });
  agent.subscribe((event) => {
    if (event.type === "model.chunk") invocations.push("second");
  });

  const first = agent.prompt("first");
  activeResult = first.result;
  await expect(first.result).resolves.toMatchObject({ status: "completed" });
  expect(invocations).toEqual(["pending-first", "second"]);
  expect(agent.isRunning).toBe(false);

  const second = agent.prompt("second");
  activeResult = second.result;
  await expect(second.result).resolves.toMatchObject({ status: "completed" });
  expect(invocations).toEqual([
    "pending-first",
    "second",
    "pending-first",
    "second",
  ]);
  expect(agent.subscriberErrors).toEqual([]);
});

test("an accepted cancellation wins the completed-result adoption race", async () => {
  const model = new ScriptedModel([
    scriptedResponse("response-cancel-race", [
      { type: "text", text: "must not commit" },
    ]),
  ]);
  const agent = new Agent({ model });
  const cancellationAccepted = deferred<boolean>();
  agent.subscribe((event) => {
    if (event.type !== "model.chunk") return;
    queueMicrotask(() => {
      cancellationAccepted.resolve(agent.cancel("race cancellation"));
    });
  });

  const run = agent.prompt("race");
  await expect(cancellationAccepted.promise).resolves.toBe(true);
  const { events, result } = await settle(run);

  expect(result).toMatchObject({
    status: "cancelled",
    reason: "race cancellation",
  });
  expect(events.filter((event) => event.type === "run.finished")).toHaveLength(
    1,
  );
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
  class HostileRegistry extends ToolRegistry {
    public override snapshot(): ToolRegistry {
      return this;
    }
  }
  const tools = new HostileRegistry();
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

test("enforces maxSteps across subloops and emits one terminal event", async () => {
  const repeatedCall = (number: number) =>
    scriptedResponse(
      `response-max-${number}`,
      [
        {
          type: "toolCall" as const,
          id: `call-max-${number}`,
          name: "ping",
          arguments: {},
        },
      ],
      "toolCall",
    );
  const model = new ScriptedModel([repeatedCall(1), repeatedCall(2)]);
  const tools = new ToolRegistry([
    defineTool({
      name: "ping",
      description: "Return pong.",
      validate: () => ({ ok: true as const, value: undefined }),
      execute: async () => "pong",
    }),
  ]);
  const agent = new Agent({ model, tools, maxSteps: 2 });

  const { events, result } = await settle(agent.prompt("loop"));

  expect(result).toMatchObject({ status: "maxSteps", maxSteps: 2 });
  expect(model.requests.map((request) => request.id)).toEqual([
    "request-001",
    "request-002",
  ]);
  expect(events.filter((event) => event.type === "run.finished")).toHaveLength(
    1,
  );
});

test("rejects impossible queued work before stranding it at the message cap", async () => {
  const initialMessages = Array.from(
    { length: MAX_AGENT_MESSAGES - 2 },
    (_, index) => ({
      id: `initial-${index + 1}`,
      role: "user" as const,
      content: `message ${index + 1}`,
    }),
  );
  const release = deferred<void>();
  const entered = deferred<void>();
  const model = new ScriptedModel([
    async function* (request) {
      entered.resolve();
      await release.promise;
      yield { type: "textDelta", requestId: request.id, delta: "complete" };
      return responseFor(
        request,
        "response-at-cap",
        [{ type: "text", text: "complete" }],
        "stop",
      );
    },
  ]);
  const agent = new Agent({ model, messages: initialMessages });
  const run = agent.prompt("message 4095");
  await entered.promise;

  expect(() => agent.followUp("would be stranded")).toThrow(
    AgentMessageLimitError,
  );
  expect(() => agent.followUp("still impossible")).toThrowError(
    expect.objectContaining({ code: "AGENT_MESSAGE_LIMIT" }),
  );
  release.resolve();

  await expect(run.result).resolves.toMatchObject({ status: "completed" });
  expect(agent.messages).toHaveLength(MAX_AGENT_MESSAGES);
  expect(agent.isRunning).toBe(false);
  expect(() => agent.steer("cannot fit later")).toThrowError(
    expect.objectContaining({ code: "AGENT_MESSAGE_LIMIT" }),
  );
});

test("rejects follow-up at tool.finished when unknown Tool results can consume the cap", async () => {
  const initialMessages = Array.from(
    { length: MAX_AGENT_MESSAGES - 6 },
    (_, index) => ({
      id: `tool-cap-initial-${index + 1}`,
      role: "user" as const,
      content: `message ${index + 1}`,
    }),
  );
  const toolCalls = Array.from({ length: 4 }, (_, index) => ({
    type: "toolCall" as const,
    id: `call-cap-${index + 1}`,
    name: "cap-tool",
    arguments: {},
  }));
  const model = new ScriptedModel([
    scriptedResponse("response-tool-cap", toolCalls, "toolCall"),
  ]);
  const tools = new ToolRegistry([
    defineTool({
      name: "cap-tool",
      description: "Return one bounded result.",
      validate: () => ({ ok: true as const, value: undefined }),
      execute: async () => "done",
    }),
  ]);
  const agent = new Agent({
    model,
    tools,
    maxSteps: 1,
    messages: initialMessages,
  });
  let enqueueFailure: unknown;
  let attempted = false;
  agent.subscribe((event) => {
    if (attempted || event.type !== "tool.finished") return;
    attempted = true;
    try {
      agent.followUp("must not become stranded");
    } catch (error) {
      enqueueFailure = error;
    }
  });

  const { events, result } = await settle(agent.prompt("fill final slots"));

  expect(enqueueFailure).toBeInstanceOf(AgentMessageLimitError);
  expect(enqueueFailure).toMatchObject({ code: "AGENT_MESSAGE_LIMIT" });
  expect(result).toMatchObject({ status: "maxSteps", maxSteps: 1 });
  expect(result.messages).toHaveLength(MAX_AGENT_MESSAGES);
  expect(events.filter((event) => event.type === "run.finished")).toHaveLength(
    1,
  );
  expect(() => agent.continue()).toThrow(AgentMessageLimitError);
});

test("accepts exactly one active queue item when worst-case reservation fits", async () => {
  const activeTranscriptLength =
    MAX_AGENT_MESSAGES - (1 + MAX_MODEL_CHUNKS_PER_STEP) - 1;
  const initialMessages = Array.from(
    { length: activeTranscriptLength - 1 },
    (_, index) => ({
      id: `reservation-initial-${index + 1}`,
      role: "user" as const,
      content: `message ${index + 1}`,
    }),
  );
  const entered = deferred<void>();
  const release = deferred<void>();
  const model = new ScriptedModel([
    async function* (request) {
      entered.resolve();
      await release.promise;
      yield { type: "textDelta", requestId: request.id, delta: "first" };
      return responseFor(
        request,
        "response-reservation-first",
        [{ type: "text", text: "first" }],
        "stop",
      );
    },
    scriptedResponse("response-reservation-follow-up", [
      { type: "text", text: "queued work completed" },
    ]),
  ]);
  const agent = new Agent({ model, messages: initialMessages });
  const run = agent.prompt("active boundary");
  await entered.promise;

  const accepted = agent.followUp("fits exactly");
  expect(() => agent.steer("one beyond reservation")).toThrowError(
    expect.objectContaining({ code: "AGENT_MESSAGE_LIMIT" }),
  );
  release.resolve();

  await expect(run.result).resolves.toMatchObject({
    status: "completed",
    finalText: "queued work completed",
  });
  expect(model.requests.at(-1)?.messages.at(-1)).toEqual(accepted);
});
