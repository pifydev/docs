import { types as nodeUtilTypes } from "node:util";

import { EventStream } from "./event-stream";
import {
  assistantMessage,
  textFromAssistant,
  toolResultMessage,
  userMessage,
  validateTranscript,
} from "./messages";
import type {
  AgentEvent,
  CourseAssistantBlock,
  CourseAssistantMessage,
  CourseJsonArray,
  CourseJsonObject,
  CourseJsonValue,
  CourseMessage,
  CourseModelChunk,
  CourseModelRequest,
  CourseModelResponse,
  CourseToolCall,
  RunResult,
} from "./protocol";
import { executeToolCall, ToolRegistry } from "./tool";

/** Hard run ceiling; it also bounds buffered EventStream growth. */
export const MAX_AGENT_STEPS = 64;
/** Maximum starting transcript entries copied synchronously. */
export const MAX_INITIAL_MESSAGES = 4096;
/** Maximum streamed chunks accepted from one model turn. */
export const MAX_MODEL_CHUNKS_PER_STEP = 1024;
/** Maximum streamed text per model turn, counted in Unicode code points. */
export const MAX_MODEL_TEXT_CODE_POINTS = 65_536;
/** Maximum raw content blocks accepted in one assistant response. */
export const MAX_MODEL_BLOCKS_PER_STEP = 1024;
/** Maximum nested levels accepted in Tool-call argument JSON. */
export const MAX_TOOL_ARGUMENT_DEPTH = 32;
/** Maximum JSON values, including the root, in Tool-call arguments. */
export const MAX_TOOL_ARGUMENT_NODES = 257;
/** Maximum object fields plus array slots in Tool-call arguments. */
export const MAX_TOOL_ARGUMENT_ENTRIES = 256;
/** Combined Tool-argument key/string budget in Unicode code points. */
export const MAX_TOOL_ARGUMENT_STRING_CODE_POINTS = 4096;

const reflectApply = Reflect.apply;
const nativePromiseConstructor = Promise;
const nativePromiseResolve = Promise.resolve;
const nativePromiseThen = Promise.prototype.then;
const nativePromiseDescriptor = Object.freeze({
  configurable: true,
  enumerable: false,
  value: nativePromiseConstructor,
  writable: true,
});
const abortSignalAbortedGetter = Object.getOwnPropertyDescriptor(
  AbortSignal.prototype,
  "aborted",
)?.get;
const abortSignalReasonGetter = Object.getOwnPropertyDescriptor(
  AbortSignal.prototype,
  "reason",
)?.get;
const eventTargetAddEventListener = EventTarget.prototype.addEventListener;
const eventTargetRemoveEventListener =
  EventTarget.prototype.removeEventListener;
const snapshotToolRegistry = ToolRegistry.prototype.snapshot;
const nodeIsProxy = nodeUtilTypes.isProxy;
const nodeIsPromise = nodeUtilTypes.isPromise;

/** Minimal model boundary consumed by the course-only Agent Loop. */
export type CourseModel = Readonly<{
  stream: (
    request: CourseModelRequest,
    signal: AbortSignal,
  ) => EventStream<CourseModelChunk, CourseModelResponse>;
}>;

export type RunAgentLoopOptions = Readonly<{
  messages: readonly CourseMessage[];
  model: CourseModel;
  tools: ToolRegistry;
  maxSteps: number;
  signal: AbortSignal;
  /** Zero-based request number already consumed by an owning lifecycle. */
  requestSequenceStart?: number;
}>;

class ModelProtocolError extends Error {
  public constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ModelProtocolError";
  }
}

class ModelStreamFailure extends Error {
  public constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ModelStreamFailure";
  }
}

class ModelAsyncValueUnobservableError extends Error {
  public constructor(context: string) {
    super(
      `${context} returned a genuine native Promise whose locked hostile constructor/species prevents intrinsic observation. The malformed model implementation or creator must observe this Promise before returning it`,
    );
    this.name = "ModelAsyncValueUnobservableError";
  }
}

class ToolPhaseFailure extends Error {
  public constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ToolPhaseFailure";
  }
}

class SignalAccessError extends Error {
  public constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "SignalAccessError";
  }
}

type ModelTurn = Readonly<{
  response: CourseModelResponse;
  chunks: readonly CourseModelChunk[];
}>;

type SequenceCounter = { value: number };

type UnicodeCodePointCounter = {
  count: number;
  pendingHighSurrogate: boolean;
};

type JsonTraversalFrame =
  | Readonly<{ type: "value"; value: unknown; depth: number }>
  | Readonly<{ type: "exit"; value: object }>;

type JsonTraversalState = {
  nodes: number;
  entries: number;
  stringCodePoints: number;
  readonly ancestors: WeakSet<object>;
};

type AssistantContentBudget = UnicodeCodePointCounter;

type ModelIteratorHandle = Readonly<{
  iterator: object;
  next: () => unknown;
}>;

type InspectedIteratorStep =
  Readonly<{ done: true }> | Readonly<{ done: false; value: unknown }>;

type OperationBox = Readonly<{ value: unknown }>;

type AsyncObservation =
  "native" | "thenable" | "proxy" | "unobservablePromise" | "none";

type NormalizedResponseBlock =
  | Readonly<{ type: "text"; text: string }>
  | Readonly<{ type: "toolCall"; toolCall: CourseToolCall }>;

/**
 * Run a deterministic, provider-neutral Agent Loop for the workshop.
 *
 * The function snapshots the starting transcript synchronously. The returned
 * EventStream always settles with a RunResult; model/runtime failures are data,
 * while invalid construction options throw before any work starts.
 */
export function runAgentLoop(
  options: RunAgentLoopOptions,
): EventStream<AgentEvent, RunResult> {
  const messages = options.messages;
  const model = options.model;
  const tools = options.tools;
  const maxSteps = options.maxSteps;
  const signal = options.signal;
  const requestSequenceStart = options.requestSequenceStart ?? 0;

  if (!Number.isSafeInteger(maxSteps) || maxSteps <= 0) {
    throw new TypeError("maxSteps must be a positive safe integer");
  }
  if (maxSteps > MAX_AGENT_STEPS) {
    throw new TypeError(`maxSteps must not exceed ${MAX_AGENT_STEPS}`);
  }
  if (
    !Number.isSafeInteger(requestSequenceStart) ||
    requestSequenceStart < 0 ||
    requestSequenceStart >= MAX_AGENT_STEPS ||
    requestSequenceStart + maxSteps > MAX_AGENT_STEPS
  ) {
    throw new TypeError(
      `requestSequenceStart must be a non-negative safe integer whose requested steps do not exceed ${MAX_AGENT_STEPS}`,
    );
  }
  if (typeof model !== "object" || model === null) {
    throw new TypeError("model must implement the CourseModel contract");
  }
  const modelStream = model.stream;
  if (typeof modelStream !== "function") {
    throw new TypeError("model.stream must be a function");
  }
  if (!(tools instanceof ToolRegistry)) {
    throw new TypeError("tools must be a ToolRegistry");
  }
  if (!(signal instanceof AbortSignal)) {
    throw new TypeError("signal must be an AbortSignal");
  }

  const toolSnapshot = Reflect.apply(snapshotToolRegistry, tools, []);

  const output = new EventStream<AgentEvent, RunResult>();
  let transcript: readonly CourseMessage[];
  try {
    transcript = snapshotTranscript(messages);
  } catch (error) {
    finishRun(
      output,
      0,
      failedResult(
        Object.freeze([]),
        "INVALID_TRANSCRIPT",
        errorMessage(error, "Starting transcript is invalid"),
      ),
    );
    return output;
  }

  const transcriptErrors = validateTranscript(transcript);
  if (transcriptErrors.length > 0) {
    finishRun(
      output,
      0,
      failedResult(
        transcript,
        "INVALID_TRANSCRIPT",
        transcriptErrors[0].message,
      ),
    );
    return output;
  }

  const context = Object.freeze({
    model,
    modelStream,
    tools: toolSnapshot,
    maxSteps,
    requestSequenceStart,
    signal,
  });
  void produceRun(output, transcript, context).catch((error: unknown) => {
    // produceRun owns terminal settlement. Reaching this handler means its own
    // terminal bookkeeping failed, so EventStream failure is the only honest
    // remaining outcome. EventStream observes result rejection internally.
    output.fail(error);
  });
  return output;
}

async function produceRun(
  output: EventStream<AgentEvent, RunResult>,
  startingTranscript: readonly CourseMessage[],
  context: Readonly<{
    model: CourseModel;
    modelStream: CourseModel["stream"];
    tools: ToolRegistry;
    maxSteps: number;
    requestSequenceStart: number;
    signal: AbortSignal;
  }>,
): Promise<void> {
  const transcript: CourseMessage[] = startingTranscript.slice();
  const sequence: SequenceCounter = { value: 0 };

  try {
    throwIfAborted(context.signal);
    for (let index = 0; index < transcript.length; index += 1) {
      throwIfAborted(context.signal);
      emitMessageAccepted(output, sequence.value, transcript[index]);
      sequence.value += 1;
    }

    for (let step = 1; step <= context.maxSteps; step += 1) {
      throwIfAborted(context.signal);
      const request = requestSnapshot(
        context.requestSequenceStart + step,
        transcript,
      );
      const turn = await invokeModel(
        output,
        sequence,
        request,
        context.model,
        context.modelStream,
        context.signal,
      );
      throwIfAborted(context.signal);

      assertResponseCanExtendTranscript(transcript, turn.response.message);
      transcript.push(turn.response.message);

      if (turn.response.stopReason === "stop") {
        const result = completedResult(
          transcript,
          textFromAssistant(turn.response.message),
        );
        throwIfAborted(context.signal);
        finishRun(output, sequence.value, result);
        return;
      }

      const toolCalls = toolCallsFrom(turn.response.message);
      for (let callIndex = 0; callIndex < toolCalls.length; callIndex += 1) {
        throwIfAborted(context.signal);
        const toolCall = toolCalls[callIndex];
        emitToolStarted(output, sequence.value, toolCall);
        sequence.value += 1;

        throwIfAborted(context.signal);
        let resultMessage: Extract<
          CourseMessage,
          Readonly<{ role: "toolResult" }>
        >;
        try {
          resultMessage = await executeToolCall(
            context.tools,
            toolCall,
            context.signal,
          );
        } catch (error) {
          throwIfAborted(context.signal);
          throw new ToolPhaseFailure(
            errorMessage(error, "Tool execution failed"),
            { cause: error },
          );
        }
        throwIfAborted(context.signal);
        transcript.push(resultMessage);
        emitToolFinished(output, sequence.value, resultMessage);
        sequence.value += 1;
      }

      const linkageErrors = validateTranscript(transcript);
      if (linkageErrors.length > 0) {
        throw new ModelProtocolError(
          `Model Tool round trip is invalid: ${linkageErrors[0].message}`,
        );
      }

      if (step === context.maxSteps) {
        throwIfAborted(context.signal);
        finishRun(
          output,
          sequence.value,
          maxStepsResult(transcript, context.maxSteps),
        );
        return;
      }
    }

    throw new Error("Agent Loop exhausted an unreachable control path");
  } catch (error) {
    const currentMessages = freezeMessages(transcript);
    let result: RunResult;
    let aborted = false;
    let signalFailure: SignalAccessError | undefined;
    try {
      aborted = readSignalAborted(context.signal);
    } catch (signalError) {
      signalFailure = normalizeSignalAccessError(signalError);
    }

    if (error instanceof SignalAccessError || signalFailure !== undefined) {
      const failure =
        error instanceof SignalAccessError ? error : signalFailure;
      result = failedResult(
        currentMessages,
        "SIGNAL_ACCESS_FAILED",
        failure?.message ?? "AbortSignal could not be inspected safely",
      );
    } else if (aborted) {
      try {
        result = cancelledResult(
          currentMessages,
          cancellationReason(context.signal, error),
        );
      } catch (signalError) {
        const failure = normalizeSignalAccessError(signalError);
        result = failedResult(
          currentMessages,
          "SIGNAL_ACCESS_FAILED",
          failure.message,
        );
      }
    } else if (error instanceof ModelProtocolError) {
      result = failedResult(
        currentMessages,
        "MODEL_PROTOCOL_ERROR",
        error.message,
      );
    } else if (error instanceof ModelAsyncValueUnobservableError) {
      result = failedResult(
        currentMessages,
        "MODEL_ASYNC_VALUE_UNOBSERVABLE",
        error.message,
      );
    } else if (error instanceof ModelStreamFailure) {
      result = failedResult(
        currentMessages,
        "MODEL_STREAM_FAILED",
        error.message,
      );
    } else if (error instanceof ToolPhaseFailure) {
      result = failedResult(
        currentMessages,
        "TOOL_EXECUTION_FAILED",
        error.message,
      );
    } else {
      result = failedResult(
        currentMessages,
        "AGENT_RUNTIME_FAILED",
        errorMessage(error, "Agent Loop execution failed"),
      );
    }
    finishRun(output, sequence.value, result);
  }
}

async function invokeModel(
  output: EventStream<AgentEvent, RunResult>,
  sequence: SequenceCounter,
  request: CourseModelRequest,
  model: CourseModel,
  streamModel: CourseModel["stream"],
  signal: AbortSignal,
): Promise<ModelTurn> {
  throwIfAborted(signal);
  let returnedStream: unknown;
  try {
    returnedStream = Reflect.apply(streamModel, model, [request, signal]);
  } catch (error) {
    throwIfAborted(signal);
    throw new ModelStreamFailure(
      errorMessage(error, "Model stream could not be opened"),
      { cause: error },
    );
  }
  if (!(returnedStream instanceof EventStream)) {
    const observation = observeAsyncValue(returnedStream);
    if (observation === "unobservablePromise") {
      throw new ModelAsyncValueUnobservableError("model.stream");
    }
    if (observation === "proxy") {
      throw new ModelProtocolError(
        "model.stream returned a Proxy-wrapped Promise; the loop cannot observe its hidden Promise target, so its creator must observe that target",
      );
    }
    throw new ModelProtocolError("model.stream must return an EventStream");
  }
  const stream = returnedStream;

  const chunks: CourseModelChunk[] = [];
  const iterator = acquireModelIterator(stream);
  let iteratorFinished = false;
  const textCodePoints: UnicodeCodePointCounter = {
    count: 0,
    pendingHighSurrogate: false,
  };
  try {
    while (true) {
      throwIfAborted(signal);
      let pendingStep: unknown;
      try {
        pendingStep = iterator.next();
      } catch (error) {
        throwIfAborted(signal);
        throw new ModelStreamFailure(
          errorMessage(error, "Model stream failed"),
          { cause: error },
        );
      }

      let rawStep: unknown;
      try {
        rawStep = await waitForAbort(
          pendingStep,
          signal,
          "Model iterator.next",
        );
      } catch (error) {
        if (error instanceof ModelAsyncValueUnobservableError) throw error;
        if (error instanceof ModelProtocolError) throw error;
        if (error instanceof SignalAccessError) throw error;
        throwIfAborted(signal);
        throw new ModelStreamFailure(
          errorMessage(error, "Model stream failed"),
          { cause: error },
        );
      }
      throwIfAborted(signal);
      const step = inspectIteratorStep(rawStep);
      if (step.done) {
        iteratorFinished = true;
        break;
      }

      if (chunks.length >= MAX_MODEL_CHUNKS_PER_STEP) {
        throw new ModelProtocolError(
          `Model turn exceeded ${MAX_MODEL_CHUNKS_PER_STEP} chunks`,
        );
      }

      let chunk: CourseModelChunk;
      try {
        chunk = snapshotChunk(step.value, request.id);
      } catch (error) {
        if (error instanceof ModelProtocolError) throw error;
        throw new ModelProtocolError(
          errorMessage(error, "Model chunk could not be inspected safely"),
          { cause: error },
        );
      }
      if (chunk.type === "textDelta") {
        addTextDeltaCodePoints(textCodePoints, chunk.delta);
      } else {
        // Tool calls separate streamed text blocks just as they do in the
        // terminal assistant message. A pending high surrogate was already
        // counted as one code point; clear adjacency before later text.
        finishTextCodePointCounter(textCodePoints);
      }
      throwIfAborted(signal);
      chunks.push(chunk);
      emitModelChunk(output, sequence.value, chunk);
      sequence.value += 1;
    }

    let pendingResponse: unknown;
    try {
      pendingResponse = Reflect.get(stream, "result");
    } catch (error) {
      throw new ModelProtocolError("Model stream result is not accessible", {
        cause: error,
      });
    }
    let rawResponse: unknown;
    try {
      rawResponse = await waitForAbort(
        pendingResponse,
        signal,
        "Model stream.result",
      );
    } catch (error) {
      if (error instanceof ModelAsyncValueUnobservableError) throw error;
      if (error instanceof ModelProtocolError) throw error;
      if (error instanceof SignalAccessError) throw error;
      throwIfAborted(signal);
      throw new ModelStreamFailure(errorMessage(error, "Model stream failed"), {
        cause: error,
      });
    }
    throwIfAborted(signal);
    finishTextCodePointCounter(textCodePoints);
    const response = snapshotResponse(rawResponse, request.id);
    assertChunksMatchResponse(chunks, response.message);
    return Object.freeze({
      response,
      chunks: Object.freeze(chunks.slice()),
    });
  } finally {
    if (!iteratorFinished) closeIteratorQuietly(iterator.iterator);
  }
}

function acquireModelIterator(
  stream: EventStream<CourseModelChunk, CourseModelResponse>,
): ModelIteratorHandle {
  try {
    const createIterator = Reflect.get(stream, Symbol.asyncIterator);
    if (typeof createIterator !== "function") {
      throw new TypeError("Model stream is not async iterable");
    }
    const iterator = Reflect.apply(createIterator, stream, []);
    if (!isObjectLike(iterator)) {
      throw new TypeError("Model stream iterator must be an object");
    }
    const next = Reflect.get(iterator, "next");
    if (typeof next !== "function") {
      throw new TypeError("Model stream iterator.next must be a function");
    }
    return Object.freeze({
      iterator,
      next: () => Reflect.apply(next, iterator, []),
    });
  } catch (error) {
    throw new ModelProtocolError(
      errorMessage(error, "Model stream iterator is invalid"),
      { cause: error },
    );
  }
}

function inspectIteratorStep(value: unknown): InspectedIteratorStep {
  if (!isObjectLike(value)) {
    throw new ModelProtocolError("Model iterator result must be an object");
  }
  try {
    const done = Reflect.get(value, "done");
    if (typeof done !== "boolean") {
      throw new TypeError("Model iterator result.done must be a boolean");
    }
    if (done) return Object.freeze({ done: true });
    const entry = Reflect.get(value, "value");
    return Object.freeze({ done: false, value: entry });
  } catch (error) {
    if (error instanceof ModelProtocolError) throw error;
    throw new ModelProtocolError(
      errorMessage(error, "Model iterator result is invalid"),
      { cause: error },
    );
  }
}

function snapshotTranscript(
  value: readonly CourseMessage[],
): readonly CourseMessage[] {
  if (!Array.isArray(value)) {
    throw new TypeError("messages must be an array");
  }
  const result: CourseMessage[] = [];
  const observedLength: unknown = Reflect.get(value, "length");
  if (
    typeof observedLength !== "number" ||
    !Number.isSafeInteger(observedLength) ||
    observedLength < 0
  ) {
    throw new TypeError("messages.length must be a non-negative safe integer");
  }
  if (observedLength > MAX_INITIAL_MESSAGES) {
    throw new TypeError(
      `messages.length must not exceed ${MAX_INITIAL_MESSAGES}`,
    );
  }
  const length = observedLength;
  for (let index = 0; index < length; index += 1) {
    if (!Object.hasOwn(value, index)) {
      throw new TypeError(`messages[${index}] must not be sparse`);
    }
    const message = value[index];
    const role = message.role;
    if (role === "user") {
      result.push(userMessage({ id: message.id, content: message.content }));
    } else if (role === "assistant") {
      const id = message.id;
      const content = message.content;
      assertBoundedAssistantContent(content, `messages[${index}].content`);
      result.push(assistantMessage({ id, content }));
    } else if (role === "toolResult") {
      result.push(
        toolResultMessage({
          id: message.id,
          toolCallId: message.toolCallId,
          toolName: message.toolName,
          content: message.content,
          isError: message.isError,
        }),
      );
    } else {
      throw new TypeError(`messages[${index}] has an unsupported role`);
    }
  }
  return Object.freeze(result);
}

function requestSnapshot(
  step: number,
  transcript: readonly CourseMessage[],
): CourseModelRequest {
  return Object.freeze({
    id: `request-${String(step).padStart(3, "0")}`,
    messages: freezeMessages(transcript),
  });
}

function snapshotChunk(value: unknown, requestId: string): CourseModelChunk {
  assertModelChunkObject(value);
  const type = value.type;
  if (type === "textDelta") {
    const chunkRequestId = value.requestId;
    const delta = value.delta;
    assertCorrelatedRequest("chunk", chunkRequestId, requestId);
    if (typeof delta !== "string") {
      throw new ModelProtocolError("Model text delta must be a string");
    }
    return Object.freeze({ type, requestId: chunkRequestId, delta });
  }
  if (type === "toolCall") {
    const chunkRequestId = value.requestId;
    const rawToolCall = value.toolCall;
    assertCorrelatedRequest("chunk", chunkRequestId, requestId);
    let toolCall: CourseToolCall;
    try {
      assertBoundedAssistantBlock(
        rawToolCall,
        "Model Tool-call chunk.toolCall",
        { count: 0, pendingHighSurrogate: false },
      );
      const snapshot = assistantMessage({
        id: "message-model-chunk-snapshot",
        content: [rawToolCall],
      }).content[0];
      if (snapshot.type !== "toolCall") {
        throw new TypeError("Chunk does not contain a Tool call");
      }
      toolCall = snapshot;
    } catch (error) {
      throw new ModelProtocolError("Model Tool-call chunk is invalid", {
        cause: error,
      });
    }
    return Object.freeze({
      type,
      requestId: chunkRequestId,
      toolCall,
    });
  }
  throw new ModelProtocolError("Model chunk has an unsupported type");
}

function snapshotResponse(
  value: unknown,
  requestId: string,
): CourseModelResponse {
  assertModelResponseObject(value);
  try {
    const id = value.id;
    const responseRequestId = value.requestId;
    const rawMessage = value.message;
    const stopReason = value.stopReason;
    const rawUsage = value.usage;
    if (typeof id !== "string" || id.trim().length === 0) {
      throw new TypeError("Response ID must be a non-empty string");
    }
    assertCorrelatedRequest("response", responseRequestId, requestId);
    if (rawMessage.role !== "assistant") {
      throw new TypeError("Response message must be an assistant message");
    }
    const messageId = rawMessage.id;
    const messageContent = rawMessage.content;
    assertBoundedAssistantContent(
      messageContent,
      "Model response.message.content",
    );
    const message = assistantMessage({
      id: messageId,
      content: messageContent,
    });
    if (stopReason !== "stop" && stopReason !== "toolCall") {
      throw new TypeError('Response stopReason must be "stop" or "toolCall"');
    }
    const inputTokens = rawUsage.inputTokens;
    const outputTokens = rawUsage.outputTokens;
    assertTokenCount(inputTokens, "response.usage.inputTokens");
    assertTokenCount(outputTokens, "response.usage.outputTokens");

    const calls = toolCallsFrom(message);
    if (stopReason === "stop" && calls.length > 0) {
      throw new TypeError("A stop response must not contain Tool calls");
    }
    if (stopReason === "toolCall" && calls.length === 0) {
      throw new TypeError("A toolCall response must contain a Tool call");
    }

    return Object.freeze({
      id,
      requestId: responseRequestId,
      message,
      stopReason,
      usage: Object.freeze({ inputTokens, outputTokens }),
    });
  } catch (error) {
    if (error instanceof ModelProtocolError) throw error;
    throw new ModelProtocolError(
      errorMessage(error, "Model response is invalid"),
      { cause: error },
    );
  }
}

function assertBoundedAssistantContent(
  value: unknown,
  path: string,
): asserts value is readonly CourseAssistantBlock[] {
  if (isProxyValue(value)) {
    throw new TypeError(`${path} must not be a Proxy`);
  }
  if (!Array.isArray(value)) {
    throw new TypeError(`${path} must be an array`);
  }
  assertArrayPrototype(value, path);
  const length = readOwnArrayLength(value, path, MAX_MODEL_BLOCKS_PER_STEP);
  const budget: AssistantContentBudget = {
    count: 0,
    pendingHighSurrogate: false,
  };
  for (let index = 0; index < length; index += 1) {
    const block = readOwnDataProperty(
      value,
      String(index),
      `${path}[${index}]`,
    );
    assertBoundedAssistantBlock(block, `${path}[${index}]`, budget);
  }
  finishTextCodePointCounter(budget);
}

function assertBoundedAssistantBlock(
  value: unknown,
  path: string,
  budget: AssistantContentBudget,
): asserts value is CourseAssistantBlock {
  assertPlainRecord(value, path);
  const type = readOwnDataProperty(value, "type", `${path}.type`);
  if (type === "text") {
    const text = readOwnDataProperty(value, "text", `${path}.text`);
    if (typeof text !== "string") {
      throw new TypeError(`${path}.text must be a string`);
    }
    addAssistantTextCodePoints(budget, text, `${path}.text`);
    return;
  }
  if (type !== "toolCall") {
    throw new TypeError(`${path}.type must be "text" or "toolCall"`);
  }
  // A Tool call breaks text adjacency in the assistant block protocol.
  finishTextCodePointCounter(budget);

  const id = readOwnDataProperty(value, "id", `${path}.id`);
  const name = readOwnDataProperty(value, "name", `${path}.name`);
  if (typeof id !== "string" || id.trim().length === 0) {
    throw new TypeError(`${path}.id must be a non-empty string`);
  }
  if (typeof name !== "string" || name.trim().length === 0) {
    throw new TypeError(`${path}.name must be a non-empty string`);
  }
  const argumentsValue = readOwnDataProperty(
    value,
    "arguments",
    `${path}.arguments`,
  );
  assertBoundedToolArguments(argumentsValue, `${path}.arguments`);
}

function assertBoundedToolArguments(
  value: unknown,
  path: string,
): asserts value is CourseJsonObject {
  if (Array.isArray(value) || !isObjectLike(value)) {
    throw new TypeError(`${path} must be a non-null JSON object, not an array`);
  }

  const state: JsonTraversalState = {
    nodes: 0,
    entries: 0,
    stringCodePoints: 0,
    ancestors: new WeakSet<object>(),
  };
  const stack: JsonTraversalFrame[] = [{ type: "value", value, depth: 0 }];

  while (stack.length > 0) {
    const frame = stack.pop();
    if (frame === undefined) break;
    if (frame.type === "exit") {
      state.ancestors.delete(frame.value);
      continue;
    }

    state.nodes += 1;
    if (state.nodes > MAX_TOOL_ARGUMENT_NODES) {
      throw new TypeError(
        `${path} exceeds ${MAX_TOOL_ARGUMENT_NODES} JSON values`,
      );
    }

    const item = frame.value;
    if (item === null || typeof item === "boolean") continue;
    if (typeof item === "number") {
      if (!Number.isFinite(item)) {
        throw new TypeError(`${path} must contain only finite JSON numbers`);
      }
      continue;
    }
    if (typeof item === "string") {
      addBoundedJsonStringCodePoints(state, item, path);
      continue;
    }
    if (!isObjectLike(item) || typeof item === "function") {
      throw new TypeError(`${path} must contain only JSON-compatible values`);
    }
    if (frame.depth > MAX_TOOL_ARGUMENT_DEPTH) {
      throw new TypeError(
        `${path} exceeds JSON depth ${MAX_TOOL_ARGUMENT_DEPTH}`,
      );
    }
    if (isProxyValue(item)) {
      throw new TypeError(`${path} must not contain Proxy values`);
    }
    if (state.ancestors.has(item)) {
      throw new TypeError(`${path} must not contain circular references`);
    }
    state.ancestors.add(item);
    stack.push({ type: "exit", value: item });

    if (Array.isArray(item)) {
      assertArrayPrototype(item, path);
      const length = readOwnArrayLength(item, path, MAX_TOOL_ARGUMENT_ENTRIES);
      addJsonEntries(state, length, path);
      assertNoExtraEnumerableArrayProperties(item, length, path);
      for (let index = length - 1; index >= 0; index -= 1) {
        stack.push({
          type: "value",
          value: readOwnDataProperty(item, String(index), `${path}[${index}]`),
          depth: frame.depth + 1,
        });
      }
      continue;
    }

    assertObjectPrototype(item, path);
    let inspectedKeys = 0;
    for (const key in item as Record<string, unknown>) {
      inspectedKeys += 1;
      if (inspectedKeys > MAX_TOOL_ARGUMENT_ENTRIES + 1) {
        throw new TypeError(`${path} has too many enumerable properties`);
      }
      const descriptor = Object.getOwnPropertyDescriptor(item, key);
      if (descriptor === undefined || !descriptor.enumerable) continue;
      if (!("value" in descriptor)) {
        throw new TypeError(`${path}.${key} must not be an accessor`);
      }
      addJsonEntries(state, 1, path);
      addBoundedJsonStringCodePoints(state, key, path);
      stack.push({
        type: "value",
        value: descriptor.value,
        depth: frame.depth + 1,
      });
    }
  }
}

function addJsonEntries(
  state: JsonTraversalState,
  amount: number,
  path: string,
): void {
  if (amount > MAX_TOOL_ARGUMENT_ENTRIES - state.entries) {
    throw new TypeError(
      `${path} exceeds ${MAX_TOOL_ARGUMENT_ENTRIES} JSON entries`,
    );
  }
  state.entries += amount;
}

function assertPlainRecord(
  value: unknown,
  path: string,
): asserts value is Record<string, unknown> {
  if (!isObjectLike(value) || typeof value === "function") {
    throw new TypeError(`${path} must be an object`);
  }
  if (isProxyValue(value)) {
    throw new TypeError(`${path} must not be a Proxy`);
  }
  if (Array.isArray(value)) {
    throw new TypeError(`${path} must be an object, not an array`);
  }
  assertObjectPrototype(value, path);
}

function assertObjectPrototype(value: object, path: string): void {
  const prototype = Object.getPrototypeOf(value) as unknown;
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError(`${path} must use a plain or null prototype`);
  }
}

function assertArrayPrototype(value: readonly unknown[], path: string): void {
  const prototype = Object.getPrototypeOf(value) as unknown;
  if (prototype !== Array.prototype && prototype !== null) {
    throw new TypeError(
      `${path} must use the standard or null Array prototype`,
    );
  }
}

function readOwnArrayLength(
  value: readonly unknown[],
  path: string,
  maximum: number,
): number {
  const descriptor = Object.getOwnPropertyDescriptor(value, "length");
  if (descriptor === undefined || !("value" in descriptor)) {
    throw new TypeError(`${path}.length must be an own data property`);
  }
  const length = descriptor.value as unknown;
  if (
    typeof length !== "number" ||
    !Number.isSafeInteger(length) ||
    length < 0
  ) {
    throw new TypeError(`${path}.length must be a non-negative safe integer`);
  }
  if (length > maximum) {
    throw new TypeError(`${path}.length must not exceed ${maximum}`);
  }
  return length;
}

function readOwnDataProperty(
  value: object,
  key: PropertyKey,
  path: string,
): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (descriptor === undefined) {
    throw new TypeError(`${path} must be an own property`);
  }
  if (!("value" in descriptor)) {
    throw new TypeError(`${path} must not be an accessor`);
  }
  return descriptor.value as unknown;
}

function assertNoExtraEnumerableArrayProperties(
  value: readonly unknown[],
  length: number,
  path: string,
): void {
  let inspectedKeys = 0;
  for (const key in value) {
    inspectedKeys += 1;
    if (inspectedKeys > MAX_TOOL_ARGUMENT_ENTRIES + 1) {
      throw new TypeError(`${path} has too many enumerable properties`);
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !descriptor.enumerable) continue;
    const index = canonicalArrayIndex(key);
    if (index === undefined || index >= length) {
      throw new TypeError(`${path} must not have extra enumerable properties`);
    }
    if (!("value" in descriptor)) {
      throw new TypeError(`${path}[${index}] must not be an accessor`);
    }
  }
}

function canonicalArrayIndex(value: string): number | undefined {
  if (value === "0") return 0;
  if (value.length === 0 || value.charCodeAt(0) === 0x30) return undefined;
  let result = 0;
  for (let index = 0; index < value.length; index += 1) {
    const digit = value.charCodeAt(index) - 0x30;
    if (digit < 0 || digit > 9) return undefined;
    result = result * 10 + digit;
    if (!Number.isSafeInteger(result)) return undefined;
  }
  return result;
}

function assertModelChunkObject(
  value: unknown,
): asserts value is CourseModelChunk {
  if (typeof value !== "object" || value === null) {
    throw new ModelProtocolError("Model chunk must be an object");
  }
}

function assertModelResponseObject(
  value: unknown,
): asserts value is CourseModelResponse {
  if (typeof value !== "object" || value === null) {
    throw new ModelProtocolError("Model response must be an object");
  }
}

function assertChunksMatchResponse(
  chunks: readonly CourseModelChunk[],
  message: CourseAssistantMessage,
): void {
  const streamed = normalizeChunks(chunks);
  const terminal = normalizeAssistantBlocks(message.content);
  if (streamed.length !== terminal.length) {
    throw new ModelProtocolError(
      "Streamed chunks do not match the final assistant message",
    );
  }
  for (let index = 0; index < streamed.length; index += 1) {
    const left = streamed[index];
    const right = terminal[index];
    if (left.type !== right.type) {
      throw new ModelProtocolError(
        "Streamed chunk order does not match the final assistant message",
      );
    }
    if (left.type === "text" && right.type === "text") {
      if (left.text !== right.text) {
        throw new ModelProtocolError(
          "Streamed text does not match the final assistant message",
        );
      }
    } else if (
      left.type === "toolCall" &&
      right.type === "toolCall" &&
      !toolCallsEqual(left.toolCall, right.toolCall)
    ) {
      throw new ModelProtocolError(
        "Streamed Tool call does not match the final assistant message",
      );
    }
  }
}

function normalizeChunks(
  chunks: readonly CourseModelChunk[],
): readonly NormalizedResponseBlock[] {
  const blocks: NormalizedResponseBlock[] = [];
  let textParts: string[] = [];
  let hasText = false;
  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index];
    if (chunk.type === "textDelta") {
      textParts.push(chunk.delta);
      hasText = true;
    } else {
      if (hasText) {
        blocks.push(Object.freeze({ type: "text", text: textParts.join("") }));
        textParts = [];
        hasText = false;
      }
      blocks.push(
        Object.freeze({ type: "toolCall", toolCall: chunk.toolCall }),
      );
    }
  }
  if (hasText) {
    blocks.push(Object.freeze({ type: "text", text: textParts.join("") }));
  }
  return Object.freeze(blocks);
}

function normalizeAssistantBlocks(
  content: readonly CourseAssistantBlock[],
): readonly NormalizedResponseBlock[] {
  const blocks: NormalizedResponseBlock[] = [];
  let textParts: string[] = [];
  let hasText = false;
  for (let index = 0; index < content.length; index += 1) {
    const block = content[index];
    if (block.type === "text") {
      textParts.push(block.text);
      hasText = true;
    } else {
      if (hasText) {
        blocks.push(Object.freeze({ type: "text", text: textParts.join("") }));
        textParts = [];
        hasText = false;
      }
      blocks.push(Object.freeze({ type: "toolCall", toolCall: block }));
    }
  }
  if (hasText) {
    blocks.push(Object.freeze({ type: "text", text: textParts.join("") }));
  }
  return Object.freeze(blocks);
}

function toolCallsEqual(left: CourseToolCall, right: CourseToolCall): boolean {
  return (
    left.id === right.id &&
    left.name === right.name &&
    jsonObjectsEqual(left.arguments, right.arguments)
  );
}

function jsonObjectsEqual(
  left: CourseJsonObject,
  right: CourseJsonObject,
): boolean {
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  if (leftKeys.length !== rightKeys.length) return false;
  for (let index = 0; index < leftKeys.length; index += 1) {
    const key = leftKeys[index];
    if (key !== rightKeys[index]) return false;
    if (!jsonValuesEqual(left[key], right[key])) return false;
  }
  return true;
}

function jsonValuesEqual(
  left: CourseJsonValue,
  right: CourseJsonValue,
): boolean {
  if (Object.is(left, right)) return true;
  if (isJsonArray(left) && isJsonArray(right)) {
    return jsonArraysEqual(left, right);
  }
  if (isJsonObject(left) && isJsonObject(right)) {
    return jsonObjectsEqual(left, right);
  }
  return false;
}

function isJsonArray(value: CourseJsonValue): value is CourseJsonArray {
  return Array.isArray(value);
}

function isJsonObject(value: CourseJsonValue): value is CourseJsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function jsonArraysEqual(
  left: CourseJsonArray,
  right: CourseJsonArray,
): boolean {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (!jsonValuesEqual(left[index], right[index])) return false;
  }
  return true;
}

function assertResponseCanExtendTranscript(
  transcript: readonly CourseMessage[],
  message: CourseAssistantMessage,
): void {
  const candidate: CourseMessage[] = [...transcript, message];
  const calls = toolCallsFrom(message);
  for (let index = 0; index < calls.length; index += 1) {
    const toolCall = calls[index];
    candidate.push(
      toolResultMessage({
        id: `protocol-result-${index + 1}-${toolCall.id}`,
        toolCallId: toolCall.id,
        toolName: toolCall.name,
        content: "",
        isError: false,
      }),
    );
  }
  const errors = validateTranscript(candidate);
  if (errors.length > 0) {
    throw new ModelProtocolError(
      `Model response cannot extend the transcript: ${errors[0].message}`,
    );
  }
}

function toolCallsFrom(
  message: CourseAssistantMessage,
): readonly CourseToolCall[] {
  const calls: CourseToolCall[] = [];
  for (let index = 0; index < message.content.length; index += 1) {
    const block = message.content[index];
    if (block.type === "toolCall") calls.push(block);
  }
  return Object.freeze(calls);
}

function assertCorrelatedRequest(
  kind: "chunk" | "response",
  actual: unknown,
  expected: string,
): asserts actual is string {
  if (actual === expected) return;
  throw new ModelProtocolError(
    `Model ${kind} requestId must equal active request "${expected}"`,
  );
}

function assertTokenCount(
  value: unknown,
  path: string,
): asserts value is number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${path} must be a non-negative safe integer`);
  }
}

function emitMessageAccepted(
  output: EventStream<AgentEvent, RunResult>,
  sequence: number,
  message: CourseMessage,
): void {
  output.push(
    Object.freeze({
      type: "message.accepted",
      sequence,
      payload: Object.freeze({ message }),
    }),
  );
}

function emitModelChunk(
  output: EventStream<AgentEvent, RunResult>,
  sequence: number,
  chunk: CourseModelChunk,
): void {
  output.push(
    Object.freeze({
      type: "model.chunk",
      sequence,
      payload: Object.freeze({ chunk }),
    }),
  );
}

function emitToolStarted(
  output: EventStream<AgentEvent, RunResult>,
  sequence: number,
  toolCall: CourseToolCall,
): void {
  output.push(
    Object.freeze({
      type: "tool.started",
      sequence,
      payload: Object.freeze({ toolCall }),
    }),
  );
}

function emitToolFinished(
  output: EventStream<AgentEvent, RunResult>,
  sequence: number,
  message: Extract<CourseMessage, Readonly<{ role: "toolResult" }>>,
): void {
  output.push(
    Object.freeze({
      type: "tool.finished",
      sequence,
      payload: Object.freeze({ message }),
    }),
  );
}

function finishRun(
  output: EventStream<AgentEvent, RunResult>,
  sequence: number,
  result: RunResult,
): void {
  output.push(
    Object.freeze({
      type: "run.finished",
      sequence,
      payload: Object.freeze({ result }),
    }),
  );
  output.finish(result);
}

function completedResult(
  transcript: readonly CourseMessage[],
  finalText: string,
): RunResult {
  return Object.freeze({
    status: "completed",
    messages: freezeMessages(transcript),
    finalText,
  });
}

function cancelledResult(
  messages: readonly CourseMessage[],
  reason: string,
): RunResult {
  return Object.freeze({ status: "cancelled", messages, reason });
}

function maxStepsResult(
  transcript: readonly CourseMessage[],
  maxSteps: number,
): RunResult {
  return Object.freeze({
    status: "maxSteps",
    messages: freezeMessages(transcript),
    maxSteps,
  });
}

function failedResult(
  messages: readonly CourseMessage[],
  code: string,
  message: string,
): RunResult {
  return Object.freeze({
    status: "failed",
    messages,
    error: Object.freeze({ code, message }),
  });
}

function freezeMessages(
  transcript: readonly CourseMessage[],
): readonly CourseMessage[] {
  return Object.freeze(transcript.slice());
}

function cancellationReason(signal: AbortSignal, fallback: unknown): string {
  return errorMessage(
    readSignalReason(signal) ?? fallback,
    "The run was cancelled",
  );
}

function errorMessage(error: unknown, fallback: string): string {
  if (typeof error === "string" && error.length > 0) return error;
  if (typeof error !== "object" || error === null) return fallback;
  try {
    const message = Reflect.get(error, "message");
    return typeof message === "string" && message.length > 0
      ? message
      : fallback;
  } catch {
    return fallback;
  }
}

function throwIfAborted(signal: AbortSignal): void {
  if (!readSignalAborted(signal)) return;
  throw readSignalReason(signal);
}

function readSignalAborted(signal: AbortSignal): boolean {
  if (abortSignalAbortedGetter === undefined) {
    throw new SignalAccessError("AbortSignal.aborted is unavailable");
  }
  try {
    return Reflect.apply(abortSignalAbortedGetter, signal, []);
  } catch (error) {
    throw new SignalAccessError("AbortSignal.aborted could not be read", {
      cause: error,
    });
  }
}

function readSignalReason(signal: AbortSignal): unknown {
  if (abortSignalReasonGetter === undefined) {
    return new DOMException("The operation was aborted", "AbortError");
  }
  try {
    return (
      Reflect.apply(abortSignalReasonGetter, signal, []) ??
      new DOMException("The operation was aborted", "AbortError")
    );
  } catch (error) {
    throw new SignalAccessError("AbortSignal.reason could not be read", {
      cause: error,
    });
  }
}

function normalizeSignalAccessError(error: unknown): SignalAccessError {
  return error instanceof SignalAccessError
    ? error
    : new SignalAccessError("AbortSignal could not be inspected safely", {
        cause: error,
      });
}

function waitForAbort(
  value: unknown,
  signal: AbortSignal,
  context: string,
): Promise<unknown> {
  let pending: Promise<OperationBox>;
  try {
    pending = prepareObservedOperation(value, context);
  } catch (error) {
    return nativePromiseConstructor.reject(error);
  }

  return new nativePromiseConstructor<unknown>((resolve, reject) => {
    let settled = false;
    let listening = false;

    const cleanup = () => {
      if (!listening) return;
      listening = false;
      try {
        Reflect.apply(eventTargetRemoveEventListener, signal, [
          "abort",
          onAbort,
        ]);
      } catch {
        // Cleanup cannot replace the terminal outcome selected by the race.
      }
    };

    const settle = (outcome: "resolve" | "reject", result: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (outcome === "resolve") resolve(result);
      else reject(result);
    };

    const onAbort = () => {
      try {
        settle("reject", readSignalReason(signal));
      } catch (error) {
        settle("reject", normalizeSignalAccessError(error));
      }
    };

    // Observe the pending operation before touching the signal. A late reject
    // after cancellation is therefore consumed and cannot become unhandled.
    const observation: Promise<unknown> = Reflect.apply(
      nativePromiseThen,
      pending,
      [
        (result: OperationBox) => {
          try {
            if (readSignalAborted(signal)) onAbort();
            else settle("resolve", result.value);
          } catch (error) {
            settle("reject", normalizeSignalAccessError(error));
          }
        },
        (error: unknown) => {
          try {
            if (readSignalAborted(signal)) onAbort();
            else settle("reject", error);
          } catch (signalError) {
            settle("reject", normalizeSignalAccessError(signalError));
          }
        },
      ],
    );
    attachNativePromise(observation, ignoreSettlement, ignoreSettlement);

    try {
      if (readSignalAborted(signal)) {
        onAbort();
        return;
      }
      Reflect.apply(eventTargetAddEventListener, signal, [
        "abort",
        onAbort,
        {
          once: true,
        },
      ]);
      listening = true;
      if (readSignalAborted(signal)) onAbort();
    } catch (error) {
      settle("reject", normalizeSignalAccessError(error));
    }
  });
}

function prepareObservedOperation(
  value: unknown,
  context: string,
): Promise<OperationBox> {
  let resolveBox!: (box: OperationBox) => void;
  let rejectBox!: (reason?: unknown) => void;
  const bridge = new nativePromiseConstructor<OperationBox>(
    (resolve, reject) => {
      resolveBox = resolve;
      rejectBox = reject;
    },
  );
  const fulfill = (result: unknown) => {
    resolveBox(Object.freeze({ value: result }));
  };

  if (attachNativePromise(value, fulfill, rejectBox)) {
    return resolveBridge(bridge);
  }
  if (isProxyValue(value)) {
    throw new ModelProtocolError(
      "Proxy-wrapped Promise/thenable values cannot be observed because Proxy hides the target Promise internal slots; the creator must observe the target",
    );
  }
  if (isNativePromiseValue(value)) {
    throw new ModelAsyncValueUnobservableError(context);
  }
  if (!isObjectLike(value)) {
    fulfill(value);
    return resolveBridge(bridge);
  }

  let then: unknown;
  try {
    then = Reflect.get(value, "then");
  } catch (error) {
    throw new ModelProtocolError(
      "Thenable.then could not be inspected safely",
      {
        cause: error,
      },
    );
  }
  if (typeof then !== "function") {
    fulfill(value);
    return resolveBridge(bridge);
  }

  try {
    const returned = reflectApply(then, value, [fulfill, rejectBox]);
    if (returned !== value) observeAsyncValue(returned);
  } catch (error) {
    rejectBox(error);
  }
  return resolveBridge(bridge);
}

function resolveBridge(bridge: Promise<OperationBox>): Promise<OperationBox> {
  const normalized: unknown = reflectApply(
    nativePromiseResolve,
    nativePromiseConstructor,
    [bridge],
  );
  if (
    !isObjectLike(normalized) ||
    !reflectApply(nodeIsPromise, undefined, [normalized])
  ) {
    throw new ModelProtocolError(
      "Captured Promise.resolve returned invalid data",
    );
  }
  return normalized as Promise<OperationBox>;
}

function observeAsyncValue(value: unknown): AsyncObservation {
  if (!isObjectLike(value)) return "none";
  if (attachNativePromise(value, ignoreSettlement, ignoreSettlement)) {
    return "native";
  }
  if (isProxyValue(value)) return "proxy";
  if (isNativePromiseValue(value)) return "unobservablePromise";

  let then: unknown;
  try {
    then = Reflect.get(value, "then");
  } catch {
    return "none";
  }
  if (typeof then !== "function") return "none";

  const pending = prepareObservedOperation(value, "Thenable observation");
  attachNativePromise(pending, ignoreSettlement, ignoreSettlement);
  return "thenable";
}

function attachNativePromise(
  value: unknown,
  onFulfilled: (result: unknown) => void,
  onRejected: (reason: unknown) => void,
): boolean {
  if (!isObjectLike(value)) return false;
  let observation: unknown;
  try {
    observation = reflectApply(nativePromiseThen, value, [
      onFulfilled,
      onRejected,
    ]);
  } catch {
    observation = attachNativePromiseWithStableSpecies(
      value,
      onFulfilled,
      onRejected,
    );
    if (observation === undefined) return false;
  }
  observePromiseContinuation(observation);
  return true;
}

function attachNativePromiseWithStableSpecies(
  value: object,
  onFulfilled: (result: unknown) => void,
  onRejected: (reason: unknown) => void,
): unknown | undefined {
  try {
    if (!isNativePromiseValue(value)) return undefined;
    const prior = Object.getOwnPropertyDescriptor(value, "constructor");
    // Promise.prototype.then must run SpeciesConstructor before it installs
    // reactions. Standard JavaScript has no alternate per-Promise attachment
    // API, so a locked hostile constructor makes this native Promise locally
    // unobservable. Its creator remains responsible for observing it.
    if (prior !== undefined && !prior.configurable) return undefined;
    Object.defineProperty(value, "constructor", nativePromiseDescriptor);
    try {
      return reflectApply(nativePromiseThen, value, [onFulfilled, onRejected]);
    } finally {
      if (prior === undefined) Reflect.deleteProperty(value, "constructor");
      else Object.defineProperty(value, "constructor", prior);
    }
  } catch {
    return undefined;
  }
}

function observePromiseContinuation(value: unknown): void {
  if (!isObjectLike(value)) return;
  try {
    reflectApply(nativePromiseThen, value, [
      ignoreSettlement,
      ignoreSettlement,
    ]);
  } catch {
    // The source Promise already has both reactions. The continuation is
    // fulfilled because the internal handlers above never throw.
  }
}

function isProxyValue(value: unknown): boolean {
  if (!isObjectLike(value)) return false;
  try {
    return reflectApply(nodeIsProxy, undefined, [value]);
  } catch {
    return true;
  }
}

function isNativePromiseValue(value: unknown): boolean {
  if (!isObjectLike(value)) return false;
  try {
    return reflectApply(nodeIsPromise, undefined, [value]);
  } catch {
    return false;
  }
}

function ignoreSettlement(): void {
  // Intentionally consume an asynchronous settlement.
}

function closeIteratorQuietly(iterator: object): void {
  let close: unknown;
  try {
    close = Reflect.get(iterator, "return");
  } catch {
    return;
  }
  if (typeof close !== "function") return;

  let cleanup: unknown;
  try {
    cleanup = Reflect.apply(close, iterator, []);
  } catch {
    return;
  }
  const observation = observeAsyncValue(cleanup);
  if (observation === "unobservablePromise") {
    // Cleanup only runs while another terminal outcome is already selected.
    // The creator must have observed a locked Promise before returning it;
    // cleanup metadata can never replace or delay the primary result.
    return;
  }
}

function addTextDeltaCodePoints(
  counter: UnicodeCodePointCounter,
  value: string,
): void {
  addStatefulUnicodeCodePoints(
    counter,
    value,
    MAX_MODEL_TEXT_CODE_POINTS,
    () =>
      new ModelProtocolError(
        `Model turn exceeded ${MAX_MODEL_TEXT_CODE_POINTS} streamed text code points`,
      ),
  );
}

function addAssistantTextCodePoints(
  counter: AssistantContentBudget,
  value: string,
  path: string,
): void {
  addStatefulUnicodeCodePoints(
    counter,
    value,
    MAX_MODEL_TEXT_CODE_POINTS,
    () =>
      new TypeError(
        `${path} exceeds ${MAX_MODEL_TEXT_CODE_POINTS} Unicode code points`,
      ),
  );
}

function addStatefulUnicodeCodePoints(
  counter: UnicodeCodePointCounter,
  value: string,
  maximum: number,
  overflowError: () => Error,
): void {
  let index = 0;
  if (counter.pendingHighSurrogate && value.length > 0) {
    counter.pendingHighSurrogate = false;
    if (isLowSurrogate(value.charCodeAt(0))) index = 1;
  }

  while (index < value.length) {
    const first = value.charCodeAt(index);
    counter.count += 1;
    if (counter.count > maximum) throw overflowError();
    if (isHighSurrogate(first)) {
      if (index + 1 === value.length) {
        counter.pendingHighSurrogate = true;
        index += 1;
      } else if (isLowSurrogate(value.charCodeAt(index + 1))) {
        index += 2;
      } else {
        index += 1;
      }
    } else {
      index += 1;
    }
  }
}

function finishTextCodePointCounter(counter: UnicodeCodePointCounter): void {
  // A dangling high surrogate was already reserved as one code point when its
  // delta arrived. Terminal settlement only makes that state explicit.
  counter.pendingHighSurrogate = false;
}

function addBoundedJsonStringCodePoints(
  state: JsonTraversalState,
  value: string,
  path: string,
): void {
  const remaining =
    MAX_TOOL_ARGUMENT_STRING_CODE_POINTS - state.stringCodePoints;
  const added = countUnicodeCodePointsUpTo(value, remaining);
  if (added > remaining) {
    throw new TypeError(
      `${path} exceeds ${MAX_TOOL_ARGUMENT_STRING_CODE_POINTS} Unicode code points`,
    );
  }
  state.stringCodePoints += added;
}

function countUnicodeCodePointsUpTo(value: string, maximum: number): number {
  let count = 0;
  let index = 0;
  while (index < value.length) {
    const first = value.charCodeAt(index);
    if (isHighSurrogate(first)) {
      const second = value.charCodeAt(index + 1);
      index += isLowSurrogate(second) ? 2 : 1;
    } else {
      index += 1;
    }
    count += 1;
    if (count > maximum) return count;
  }
  return count;
}

function isHighSurrogate(value: number): boolean {
  return value >= 0xd800 && value <= 0xdbff;
}

function isLowSurrogate(value: number): boolean {
  return value >= 0xdc00 && value <= 0xdfff;
}

function isObjectLike(value: unknown): value is object {
  return (
    (typeof value === "object" && value !== null) || typeof value === "function"
  );
}
