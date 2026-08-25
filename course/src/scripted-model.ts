import { EventStream } from "./event-stream";
import { assistantMessage, toolResultMessage, userMessage } from "./messages";
import type {
  CourseAssistantMessage,
  CourseMessage,
  CourseModelChunk,
  CourseModelRequest,
  CourseModelResponse,
  CourseToolCall,
} from "./protocol";

export type ScriptedResponseFactory = (
  request: CourseModelRequest,
  signal: AbortSignal,
) => AsyncGenerator<CourseModelChunk, CourseModelResponse, void>;

export type ScriptedModelErrorCode = "SCRIPT_EXHAUSTED";

export class ScriptedModelError extends Error {
  public readonly code: ScriptedModelErrorCode;

  public constructor(code: ScriptedModelErrorCode, message: string) {
    super(message);
    this.name = "ScriptedModelError";
    this.code = code;
  }
}

/** A deterministic, finite model test double used only by this course. */
export class ScriptedModel {
  private responses: ScriptedResponseFactory[] = [];
  private readonly capturedRequests: CourseModelRequest[] = [];
  private attemptedCalls = 0;

  public constructor(responses: readonly ScriptedResponseFactory[] = []) {
    this.setResponses(responses);
  }

  public get callCount(): number {
    return this.attemptedCalls;
  }

  public get pendingResponseCount(): number {
    return this.responses.length;
  }

  public get requests(): readonly CourseModelRequest[] {
    return Object.freeze(this.capturedRequests.slice());
  }

  public setResponses(responses: readonly ScriptedResponseFactory[]): void {
    const replacement = snapshotFactories(responses);
    this.responses = replacement;
  }

  public appendResponse(response: ScriptedResponseFactory): void {
    assertResponseFactory(response, "response");
    this.responses.push(response);
  }

  public stream(
    request: CourseModelRequest,
    signal: AbortSignal,
  ): EventStream<CourseModelChunk, CourseModelResponse> {
    const requestSnapshot = snapshotRequest(request);
    this.capturedRequests.push(requestSnapshot);
    this.attemptedCalls += 1;

    const stream = new EventStream<CourseModelChunk, CourseModelResponse>();
    void this.produce(stream, requestSnapshot, signal).catch(
      (error: unknown) => {
        stream.fail(error);
      },
    );
    return stream;
  }

  private async produce(
    stream: EventStream<CourseModelChunk, CourseModelResponse>,
    request: CourseModelRequest,
    signal: AbortSignal,
  ): Promise<void> {
    throwIfAborted(signal);

    const factory = this.responses.shift();
    if (factory === undefined) {
      throw new ScriptedModelError(
        "SCRIPT_EXHAUSTED",
        `No scripted response remains for request "${request.id}"`,
      );
    }

    const response = factory(request, signal);
    assertResponseIterator(response);
    let responseFinished = false;

    try {
      while (true) {
        throwIfAborted(signal);
        const step = await waitForAbort(response.next(), signal);
        throwIfAborted(signal);

        if (step.done) {
          responseFinished = true;
          const finalResponse = snapshotResponse(step.value);
          throwIfAborted(signal);
          stream.finish(finalResponse);
          return;
        }

        const chunk = snapshotChunk(step.value);
        throwIfAborted(signal);
        stream.push(chunk);
      }
    } finally {
      if (!responseFinished && typeof response.return === "function") {
        void response.return(undefined as never).catch(() => undefined);
      }
    }
  }
}

function snapshotFactories(
  value: readonly ScriptedResponseFactory[],
): ScriptedResponseFactory[] {
  if (!Array.isArray(value)) {
    throw new TypeError("responses must be an array");
  }

  const length = value.length;
  const snapshot: ScriptedResponseFactory[] = [];
  for (let index = 0; index < length; index += 1) {
    if (!Object.hasOwn(value, index)) {
      throw new TypeError(`responses[${index}] must not be sparse`);
    }
    const response = value[index];
    assertResponseFactory(response, `responses[${index}]`);
    snapshot.push(response);
  }
  return snapshot;
}

function assertResponseFactory(
  value: unknown,
  path: string,
): asserts value is ScriptedResponseFactory {
  if (typeof value !== "function") {
    throw new TypeError(`${path} must be a response factory`);
  }
}

function assertResponseIterator(
  value: unknown,
): asserts value is AsyncGenerator<
  CourseModelChunk,
  CourseModelResponse,
  void
> {
  if (
    typeof value !== "object" ||
    value === null ||
    !("next" in value) ||
    typeof value.next !== "function"
  ) {
    throw new TypeError(
      "A scripted response factory must return an async generator",
    );
  }
}

function snapshotRequest(value: CourseModelRequest): CourseModelRequest {
  const id = value.id;
  const messages = value.messages;
  assertNonEmptyString(id, "request.id");
  if (!Array.isArray(messages)) {
    throw new TypeError("request.messages must be an array");
  }

  const messageCount = messages.length;
  const messageSnapshots: CourseMessage[] = [];
  for (let index = 0; index < messageCount; index += 1) {
    if (!Object.hasOwn(messages, index)) {
      throw new TypeError(`request.messages[${index}] must not be sparse`);
    }
    messageSnapshots.push(snapshotMessage(messages[index], index));
  }

  return Object.freeze({
    id,
    messages: Object.freeze(messageSnapshots),
  });
}

function snapshotMessage(value: CourseMessage, index: number): CourseMessage {
  const role = value.role;
  if (role === "user") {
    const id = value.id;
    const content = value.content;
    return userMessage({ id, content });
  }
  if (role === "assistant") {
    const id = value.id;
    const content = value.content;
    return assistantMessage({ id, content });
  }
  if (role === "toolResult") {
    const id = value.id;
    const toolCallId = value.toolCallId;
    const toolName = value.toolName;
    const content = value.content;
    const isError = value.isError;
    return toolResultMessage({ id, toolCallId, toolName, content, isError });
  }
  throw new TypeError(`request.messages[${index}] has an unsupported role`);
}

function snapshotChunk(value: CourseModelChunk): CourseModelChunk {
  const type = value.type;
  if (type === "textDelta") {
    const requestId = value.requestId;
    const delta = value.delta;
    assertNonEmptyString(requestId, "chunk.requestId");
    assertString(delta, "chunk.delta");
    return Object.freeze({ type, requestId, delta });
  }
  if (type === "toolCall") {
    const requestId = value.requestId;
    const toolCall = value.toolCall;
    assertNonEmptyString(requestId, "chunk.requestId");
    return Object.freeze({
      type,
      requestId,
      toolCall: snapshotToolCall(toolCall),
    });
  }
  throw new TypeError("A scripted chunk has an unsupported type");
}

function snapshotToolCall(value: CourseToolCall): CourseToolCall {
  const message = assistantMessage({
    id: "scripted-model-tool-call-snapshot",
    content: [value],
  });
  const block = message.content[0];
  if (block.type !== "toolCall") {
    throw new TypeError("A Tool-call chunk must contain a Tool call");
  }
  return block;
}

function snapshotResponse(value: CourseModelResponse): CourseModelResponse {
  const id = value.id;
  const requestId = value.requestId;
  const messageValue = value.message;
  const stopReason = value.stopReason;
  const usageValue = value.usage;
  assertNonEmptyString(id, "response.id");
  assertNonEmptyString(requestId, "response.requestId");
  if (messageValue.role !== "assistant") {
    throw new TypeError("response.message must be an assistant message");
  }
  if (stopReason !== "stop" && stopReason !== "toolCall") {
    throw new TypeError("response.stopReason must be stop or toolCall");
  }

  const messageId = messageValue.id;
  const messageContent = messageValue.content;
  const message: CourseAssistantMessage = assistantMessage({
    id: messageId,
    content: messageContent,
  });
  const inputTokens = usageValue.inputTokens;
  const outputTokens = usageValue.outputTokens;
  assertTokenCount(inputTokens, "response.usage.inputTokens");
  assertTokenCount(outputTokens, "response.usage.outputTokens");

  return Object.freeze({
    id,
    requestId,
    message,
    stopReason,
    usage: Object.freeze({ inputTokens, outputTokens }),
  });
}

function assertTokenCount(
  value: unknown,
  path: string,
): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new TypeError(`${path} must be a non-negative safe integer`);
  }
}

function assertString(value: unknown, path: string): asserts value is string {
  if (typeof value !== "string") {
    throw new TypeError(`${path} must be a string`);
  }
}

function assertNonEmptyString(
  value: unknown,
  path: string,
): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${path} must be a non-empty string`);
  }
}

function throwIfAborted(signal: AbortSignal): void {
  if (!signal.aborted) return;
  throw (
    signal.reason ?? new DOMException("The operation was aborted", "AbortError")
  );
}

function waitForAbort<Value>(
  pending: Promise<Value>,
  signal: AbortSignal,
): Promise<Value> {
  throwIfAborted(signal);

  return new Promise<Value>((resolve, reject) => {
    let settled = false;
    const onAbort = () => {
      if (settled) return;
      settled = true;
      reject(
        signal.reason ??
          new DOMException("The operation was aborted", "AbortError"),
      );
    };

    signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted) onAbort();

    void pending.then(
      (value) => {
        if (settled) return;
        settled = true;
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error: unknown) => {
        if (settled) return;
        settled = true;
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}
