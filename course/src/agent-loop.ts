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

type ModelTurn = Readonly<{
  response: CourseModelResponse;
  chunks: readonly CourseModelChunk[];
}>;

type SequenceCounter = { value: number };

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

  if (!Number.isSafeInteger(maxSteps) || maxSteps <= 0) {
    throw new TypeError("maxSteps must be a positive safe integer");
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
    tools,
    maxSteps,
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
      const request = requestSnapshot(step, transcript);
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
        const resultMessage = await executeToolCall(
          context.tools,
          toolCall,
          context.signal,
        );
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
    if (context.signal.aborted) {
      result = cancelledResult(
        currentMessages,
        cancellationReason(context.signal, error),
      );
    } else if (error instanceof ModelProtocolError) {
      result = failedResult(
        currentMessages,
        "MODEL_PROTOCOL_ERROR",
        error.message,
      );
    } else if (error instanceof ModelStreamFailure) {
      result = failedResult(
        currentMessages,
        "MODEL_STREAM_FAILED",
        error.message,
      );
    } else {
      result = failedResult(
        currentMessages,
        "TOOL_EXECUTION_FAILED",
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
  let stream: EventStream<CourseModelChunk, CourseModelResponse>;
  try {
    stream = Reflect.apply(streamModel, model, [request, signal]);
  } catch (error) {
    throwIfAborted(signal);
    throw new ModelStreamFailure(
      errorMessage(error, "Model stream could not be opened"),
      { cause: error },
    );
  }
  if (!(stream instanceof EventStream)) {
    throw new ModelProtocolError("model.stream must return an EventStream");
  }

  const chunks: CourseModelChunk[] = [];
  const iterator = stream[Symbol.asyncIterator]();
  let iteratorFinished = false;
  try {
    while (true) {
      throwIfAborted(signal);
      let step: IteratorResult<CourseModelChunk>;
      try {
        step = await iterator.next();
      } catch (error) {
        throwIfAborted(signal);
        throw new ModelStreamFailure(
          errorMessage(error, "Model stream failed"),
          { cause: error },
        );
      }
      throwIfAborted(signal);
      if (step.done) {
        iteratorFinished = true;
        break;
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
      throwIfAborted(signal);
      chunks.push(chunk);
      emitModelChunk(output, sequence.value, chunk);
      sequence.value += 1;
    }

    let rawResponse: CourseModelResponse;
    try {
      rawResponse = await stream.result;
    } catch (error) {
      throwIfAborted(signal);
      throw new ModelStreamFailure(errorMessage(error, "Model stream failed"), {
        cause: error,
      });
    }
    throwIfAborted(signal);
    const response = snapshotResponse(rawResponse, request.id);
    assertChunksMatchResponse(chunks, response.message);
    return Object.freeze({
      response,
      chunks: Object.freeze(chunks.slice()),
    });
  } finally {
    if (!iteratorFinished) await closeIteratorQuietly(iterator);
  }
}

function snapshotTranscript(
  value: readonly CourseMessage[],
): readonly CourseMessage[] {
  if (!Array.isArray(value)) {
    throw new TypeError("messages must be an array");
  }
  const result: CourseMessage[] = [];
  const length = value.length;
  for (let index = 0; index < length; index += 1) {
    if (!Object.hasOwn(value, index)) {
      throw new TypeError(`messages[${index}] must not be sparse`);
    }
    const message = value[index];
    const role = message.role;
    if (role === "user") {
      result.push(userMessage({ id: message.id, content: message.content }));
    } else if (role === "assistant") {
      result.push(
        assistantMessage({ id: message.id, content: message.content }),
      );
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

function snapshotChunk(
  value: CourseModelChunk,
  requestId: string,
): CourseModelChunk {
  if (typeof value !== "object" || value === null) {
    throw new ModelProtocolError("Model chunk must be an object");
  }
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
  value: CourseModelResponse,
  requestId: string,
): CourseModelResponse {
  if (typeof value !== "object" || value === null) {
    throw new ModelProtocolError("Model response must be an object");
  }
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
    const message = assistantMessage({
      id: rawMessage.id,
      content: rawMessage.content,
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
  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index];
    if (chunk.type === "textDelta") {
      appendNormalizedText(blocks, chunk.delta);
    } else {
      blocks.push(
        Object.freeze({ type: "toolCall", toolCall: chunk.toolCall }),
      );
    }
  }
  return Object.freeze(blocks);
}

function normalizeAssistantBlocks(
  content: readonly CourseAssistantBlock[],
): readonly NormalizedResponseBlock[] {
  const blocks: NormalizedResponseBlock[] = [];
  for (let index = 0; index < content.length; index += 1) {
    const block = content[index];
    if (block.type === "text") {
      appendNormalizedText(blocks, block.text);
    } else {
      blocks.push(Object.freeze({ type: "toolCall", toolCall: block }));
    }
  }
  return Object.freeze(blocks);
}

function appendNormalizedText(
  blocks: NormalizedResponseBlock[],
  text: string,
): void {
  const prior = blocks.at(-1);
  if (prior?.type === "text") {
    blocks[blocks.length - 1] = Object.freeze({
      type: "text",
      text: prior.text + text,
    });
  } else {
    blocks.push(Object.freeze({ type: "text", text }));
  }
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
  return errorMessage(signal.reason ?? fallback, "The run was cancelled");
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
  if (!signal.aborted) return;
  throw (
    signal.reason ?? new DOMException("The operation was aborted", "AbortError")
  );
}

async function closeIteratorQuietly(
  iterator: AsyncIterator<CourseModelChunk>,
): Promise<void> {
  if (typeof iterator.return !== "function") return;
  try {
    await iterator.return();
  } catch {
    // Cleanup must not replace the already selected terminal result.
  }
}
