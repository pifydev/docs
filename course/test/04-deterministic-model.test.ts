import { expect, test } from "vitest";

import {
  ScriptedModel,
  ScriptedModelError,
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

function requestWithToolArguments(): CourseModelRequest {
  return {
    id: "request-001",
    messages: [
      { id: "message-user-001", role: "user", content: "Add 20 and 22." },
      {
        id: "message-assistant-001",
        role: "assistant",
        content: [
          {
            type: "toolCall",
            id: "call-add-001",
            name: "add",
            arguments: { operands: [20, 22] },
          },
        ],
      },
      {
        id: "message-tool-001",
        role: "toolResult",
        toolCallId: "call-add-001",
        toolName: "add",
        content: "42",
        isError: false,
      },
    ],
  };
}

function responseFor(
  requestId: string,
  text: string,
  id = "response-001",
): CourseModelResponse {
  return {
    id,
    requestId,
    message: {
      id: `message-${id}`,
      role: "assistant",
      content: [{ type: "text", text }],
    },
    stopReason: "stop",
    usage: { inputTokens: 12, outputTokens: 5 },
  };
}

function textFactory(text: string, id: string): ScriptedResponseFactory {
  return async function* (request) {
    yield { type: "textDelta", requestId: request.id, delta: text };
    return responseFor(request.id, text, id);
  };
}

async function collect<Value>(source: AsyncIterable<Value>): Promise<Value[]> {
  const values: Value[] = [];
  for await (const value of source) values.push(value);
  return values;
}

async function runText(model: ScriptedModel, requestId: string) {
  const stream = model.stream(
    {
      id: requestId,
      messages: [
        { id: `message-${requestId}`, role: "user", content: requestId },
      ],
    },
    new AbortController().signal,
  );
  const chunks = await collect(stream);
  const response = await stream.result;
  return { chunks, response };
}

test("captures an exact deeply immutable request before caller mutation", async () => {
  let factoryRequest: CourseModelRequest | undefined;
  const model = new ScriptedModel([
    async function* (request) {
      factoryRequest = request;
      return responseFor(request.id, "captured");
    },
  ]);
  const request = requestWithToolArguments();
  const stream = model.stream(request, new AbortController().signal);

  const mutableRequest = request as unknown as {
    id: string;
    messages: Array<{
      content?: unknown;
      [key: string]: unknown;
    }>;
  };
  mutableRequest.id = "mutated-request";
  mutableRequest.messages[0].content = "mutated content";
  const toolArguments = (
    mutableRequest.messages[1].content as Array<{
      arguments: { operands: number[] };
    }>
  )[0].arguments;
  toolArguments.operands[0] = 999;

  await expect(collect(stream)).resolves.toEqual([]);
  await expect(stream.result).resolves.toMatchObject({
    requestId: "request-001",
  });

  expect(factoryRequest).toEqual(requestWithToolArguments());
  expect(model.requests).toEqual([requestWithToolArguments()]);
  expect(Object.isFrozen(factoryRequest)).toBe(true);
  expect(Object.isFrozen(factoryRequest?.messages)).toBe(true);
  expect(
    Object.isFrozen(
      factoryRequest?.messages[1].role === "assistant"
        ? factoryRequest.messages[1].content[0]
        : undefined,
    ),
  ).toBe(true);
  expect(
    Object.isFrozen(
      factoryRequest?.messages[1].role === "assistant" &&
        factoryRequest.messages[1].content[0].type === "toolCall"
        ? factoryRequest.messages[1].content[0].arguments.operands
        : undefined,
    ),
  ).toBe(true);
  expect(Object.isFrozen(model.requests)).toBe(true);
});

test("streams text and Tool-call chunks in order and snapshots the final response", async () => {
  const mutableArguments = { left: 20, right: 22 };
  const textChunk: CourseModelChunk = {
    type: "textDelta",
    requestId: "request-ordered",
    delta: "I will add them. ",
  };
  const toolChunk: CourseModelChunk = {
    type: "toolCall",
    requestId: "request-ordered",
    toolCall: {
      type: "toolCall",
      id: "call-add-ordered",
      name: "add",
      arguments: mutableArguments,
    },
  };
  const response = responseFor(
    "request-ordered",
    "I will add them.",
    "response-ordered",
  );
  const model = new ScriptedModel([
    async function* () {
      yield textChunk;
      yield toolChunk;
      return response;
    },
  ]);
  const stream = model.stream(
    {
      id: "request-ordered",
      messages: [{ id: "message-ordered", role: "user", content: "Add them." }],
    },
    new AbortController().signal,
  );

  const chunks = await collect(stream);
  const finalResponse = await stream.result;
  mutableArguments.left = 999;
  (response.message.content as Array<{ type: "text"; text: string }>)[0].text =
    "mutated";
  (response.usage as { inputTokens: number }).inputTokens = 999;

  expect(chunks).toEqual([
    textChunk,
    {
      type: "toolCall",
      requestId: "request-ordered",
      toolCall: {
        type: "toolCall",
        id: "call-add-ordered",
        name: "add",
        arguments: { left: 20, right: 22 },
      },
    },
  ]);
  expect(chunks.every(Object.isFrozen)).toBe(true);
  expect(
    chunks[1].type === "toolCall" &&
      Object.isFrozen(chunks[1].toolCall.arguments),
  ).toBe(true);
  expect(finalResponse).toEqual(
    responseFor("request-ordered", "I will add them.", "response-ordered"),
  );
  expect(Object.isFrozen(finalResponse)).toBe(true);
  expect(Object.isFrozen(finalResponse.message.content)).toBe(true);
  expect(Object.isFrozen(finalResponse.usage)).toBe(true);
});

test("replaces and appends pending response factories while tracking calls", async () => {
  const model = new ScriptedModel([textFactory("unused", "response-unused")]);

  model.setResponses([textFactory("replacement", "response-replacement")]);
  model.appendResponse(textFactory("appended", "response-appended"));

  await expect(runText(model, "request-replacement")).resolves.toMatchObject({
    chunks: [{ delta: "replacement" }],
    response: { id: "response-replacement" },
  });
  await expect(runText(model, "request-appended")).resolves.toMatchObject({
    chunks: [{ delta: "appended" }],
    response: { id: "response-appended" },
  });
  expect(model.callCount).toBe(2);
  expect(model.pendingResponseCount).toBe(0);
});

test("fails closed with SCRIPT_EXHAUSTED instead of inventing a response", async () => {
  const model = new ScriptedModel();
  const stream = model.stream(
    {
      id: "request-exhausted",
      messages: [
        { id: "message-exhausted", role: "user", content: "One more." },
      ],
    },
    new AbortController().signal,
  );

  await expect(collect(stream)).rejects.toMatchObject({
    code: "SCRIPT_EXHAUSTED",
  });
  await expect(stream.result).rejects.toEqual(
    expect.objectContaining({
      name: "ScriptedModelError",
      code: "SCRIPT_EXHAUSTED",
    }),
  );
  expect(model.callCount).toBe(1);
  expect(model.requests).toHaveLength(1);
});

test("cancellation before streaming does not consume a queued response", async () => {
  let factoryCalled = false;
  const model = new ScriptedModel([
    async function* (request) {
      factoryCalled = true;
      return responseFor(request.id, "retry succeeds");
    },
  ]);
  const controller = new AbortController();
  controller.abort();
  const stream = model.stream(
    {
      id: "request-aborted-before",
      messages: [
        { id: "message-aborted-before", role: "user", content: "Stop." },
      ],
    },
    controller.signal,
  );

  await expect(collect(stream)).rejects.toMatchObject({ name: "AbortError" });
  await expect(stream.result).rejects.toMatchObject({ name: "AbortError" });
  expect(factoryCalled).toBe(false);
  expect(model.pendingResponseCount).toBe(1);

  await expect(runText(model, "request-retry")).resolves.toMatchObject({
    response: { requestId: "request-retry" },
  });
});

test("cancellation interrupts a response blocked between chunks without a timer", async () => {
  const releaseSecondChunk = deferred<void>();
  const model = new ScriptedModel([
    async function* (request) {
      yield { type: "textDelta", requestId: request.id, delta: "first" };
      await releaseSecondChunk.promise;
      yield { type: "textDelta", requestId: request.id, delta: "second" };
      return responseFor(request.id, "firstsecond");
    },
  ]);
  const controller = new AbortController();
  const stream = model.stream(
    {
      id: "request-aborted-during",
      messages: [
        {
          id: "message-aborted-during",
          role: "user",
          content: "Stream twice.",
        },
      ],
    },
    controller.signal,
  );
  const iterator = stream[Symbol.asyncIterator]();

  await expect(iterator.next()).resolves.toEqual({
    done: false,
    value: {
      type: "textDelta",
      requestId: "request-aborted-during",
      delta: "first",
    },
  });
  const pendingChunk = iterator.next();
  const resultRejection = expect(stream.result).rejects.toMatchObject({
    name: "AbortError",
  });
  controller.abort();

  await expect(pendingChunk).rejects.toMatchObject({ name: "AbortError" });
  await resultRejection;
  releaseSecondChunk.resolve();
});

test("propagates response-factory failures through events and result", async () => {
  const failure = new Error("script fixture failed");
  const model = new ScriptedModel([
    async function* () {
      throw failure;
    },
  ]);
  const stream = model.stream(
    {
      id: "request-factory-failure",
      messages: [
        {
          id: "message-factory-failure",
          role: "user",
          content: "Fail deterministically.",
        },
      ],
    },
    new AbortController().signal,
  );

  await expect(collect(stream)).rejects.toBe(failure);
  await expect(stream.result).rejects.toBe(failure);
});

test("ScriptedModelError exposes a stable readonly exhaustion code", () => {
  const error = new ScriptedModelError(
    "SCRIPT_EXHAUSTED",
    "No scripted response remains",
  );

  expect(error).toMatchObject({
    name: "ScriptedModelError",
    code: "SCRIPT_EXHAUSTED",
    message: "No scripted response remains",
  });
});
