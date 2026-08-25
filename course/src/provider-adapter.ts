import { EventStream } from "./event-stream";
import { assistantMessage } from "./messages";
import type {
  CourseAssistantBlock,
  CourseModelChunk,
  CourseModelRequest,
  CourseModelResponse,
  CourseModelUsage,
  CourseToolCall,
} from "./protocol";

export type FixtureProviderErrorCode =
  | "PROVIDER_INVALID_FIXTURE"
  | "PROVIDER_EXHAUSTED"
  | "PROVIDER_UNKNOWN_EVENT"
  | "PROVIDER_INVALID_EVENT"
  | "PROVIDER_MISSING_START"
  | "PROVIDER_DUPLICATE_START"
  | "PROVIDER_MISSING_TERMINAL"
  | "PROVIDER_DUPLICATE_TERMINAL"
  | "PROVIDER_RESPONSE_MISMATCH"
  | "PROVIDER_INVALID_TERMINAL"
  | "PROVIDER_TRANSPORT_ERROR";

export type FixtureProviderErrorMetadata = Readonly<{
  recordIndex?: number;
  providerCode?: string;
}>;

/** A stable, course-owned error boundary for fixture transport failures. */
export class FixtureProviderError extends Error {
  public readonly code: FixtureProviderErrorCode;
  public readonly recordIndex: number | undefined;
  public readonly providerCode: string | undefined;

  public constructor(
    code: FixtureProviderErrorCode,
    message: string,
    metadata: FixtureProviderErrorMetadata = {},
  ) {
    super(message);
    this.name = "FixtureProviderError";
    this.code = code;
    this.recordIndex = metadata.recordIndex;
    this.providerCode = metadata.providerCode;
  }
}

type ArrayRecordSource = Readonly<{
  kind: "array";
  records: readonly unknown[];
}>;

type AsyncRecordSource = Readonly<{
  kind: "async";
  target: object;
  iteratorFactory: (this: object) => unknown;
}>;

type RecordSource = ArrayRecordSource | AsyncRecordSource;

type RecordCursor = Readonly<{
  next: () => Promise<IteratorResult<unknown>>;
  closeQuietly: () => void;
}>;

type ParseState = {
  responseId: string | undefined;
  readonly content: CourseAssistantBlock[];
  readonly toolCallIds: Set<string>;
  terminal: CourseModelResponse | undefined;
};

const claimedAsyncSources = new WeakSet<object>();

/**
 * Converts deterministic provider transport fixtures into the course model
 * protocol. It deliberately has no network client: every record comes from
 * constructor-owned fixture data or an explicitly supplied async record source.
 */
export class FixtureProviderAdapter {
  private readonly responses: RecordSource[];
  private attemptedCalls = 0;

  public constructor(fixture: unknown) {
    this.responses = snapshotFixture(fixture);
  }

  public get callCount(): number {
    return this.attemptedCalls;
  }

  public get pendingResponseCount(): number {
    return this.responses.length;
  }

  public stream(
    request: CourseModelRequest,
    signal: AbortSignal,
  ): EventStream<CourseModelChunk, CourseModelResponse> {
    const requestId = snapshotRequestId(request);
    this.attemptedCalls += 1;

    const stream = new EventStream<CourseModelChunk, CourseModelResponse>();
    void this.produce(stream, requestId, signal).catch((error: unknown) => {
      stream.fail(error);
    });
    return stream;
  }

  private async produce(
    stream: EventStream<CourseModelChunk, CourseModelResponse>,
    requestId: string,
    signal: AbortSignal,
  ): Promise<void> {
    throwIfAborted(signal);

    const source = this.responses.shift();
    if (source === undefined) {
      throw new FixtureProviderError(
        "PROVIDER_EXHAUSTED",
        `No fixture response remains for request "${requestId}"`,
      );
    }

    const cursor = createRecordCursor(source);
    const state: ParseState = {
      responseId: undefined,
      content: [],
      toolCallIds: new Set(),
      terminal: undefined,
    };
    let sourceFinished = false;
    let recordIndex = 0;

    try {
      while (true) {
        throwIfAborted(signal);
        let step: IteratorResult<unknown>;
        try {
          step = await waitForAbort(cursor.next(), signal);
        } catch (error) {
          if (signal.aborted) throw abortReason(signal);
          if (error instanceof FixtureProviderError) throw error;
          throw invalidFixture("Async fixture record source failed");
        }
        throwIfAborted(signal);

        if (step.done) {
          sourceFinished = true;
          break;
        }

        const record = snapshotTransportRecord(step.value, recordIndex);
        const chunk = processRecord(record, recordIndex, requestId, state);
        if (chunk !== undefined) {
          throwIfAborted(signal);
          stream.push(chunk);
        }
        recordIndex += 1;
      }

      if (state.terminal === undefined) {
        throw new FixtureProviderError(
          "PROVIDER_MISSING_TERMINAL",
          "Fixture response ended without a response_end record",
          { recordIndex },
        );
      }

      throwIfAborted(signal);
      stream.finish(state.terminal);
    } finally {
      if (!sourceFinished) cursor.closeQuietly();
    }
  }
}

function snapshotFixture(fixture: unknown): RecordSource[] {
  try {
    if (!isRecord(fixture)) {
      throw invalidFixture("Fixture must be an object");
    }

    const schemaVersion = fixture.schemaVersion;
    const rawResponses = fixture.responses;
    if (schemaVersion !== 1) {
      throw invalidFixture("Fixture schemaVersion must be 1");
    }
    if (!Array.isArray(rawResponses)) {
      throw invalidFixture("Fixture responses must be an array");
    }

    const responseCount = snapshotArrayLength(
      rawResponses,
      "Fixture responses",
    );
    const responses: RecordSource[] = [];
    for (
      let responseIndex = 0;
      responseIndex < responseCount;
      responseIndex += 1
    ) {
      if (!Object.hasOwn(rawResponses, responseIndex)) {
        throw invalidFixture(
          `Fixture responses[${responseIndex}] must not be sparse`,
        );
      }
      const entry = rawResponses[responseIndex];
      if (!isRecord(entry)) {
        throw invalidFixture(
          `Fixture responses[${responseIndex}] must be an object`,
        );
      }
      const rawRecords = entry.records;
      responses.push(snapshotRecordSource(rawRecords, responseIndex));
    }
    return responses;
  } catch (error) {
    if (error instanceof FixtureProviderError) throw error;
    throw invalidFixture("Fixture could not be inspected safely");
  }
}

function snapshotRecordSource(
  value: unknown,
  responseIndex: number,
): RecordSource {
  if (Array.isArray(value)) {
    const recordCount = snapshotArrayLength(
      value,
      `Fixture responses[${responseIndex}].records`,
    );
    const records: unknown[] = [];
    for (let recordIndex = 0; recordIndex < recordCount; recordIndex += 1) {
      if (!Object.hasOwn(value, recordIndex)) {
        throw invalidFixture(
          `Fixture responses[${responseIndex}].records[${recordIndex}] must not be sparse`,
        );
      }
      records.push(
        snapshotUnknown(
          value[recordIndex],
          `Fixture responses[${responseIndex}].records[${recordIndex}]`,
          new WeakSet(),
        ),
      );
    }
    return Object.freeze({
      kind: "array",
      records: Object.freeze(records),
    });
  }

  if (typeof value === "object" && value !== null) {
    let iteratorFactory: unknown;
    try {
      iteratorFactory = value[Symbol.asyncIterator as keyof typeof value];
    } catch {
      throw invalidFixture(
        `Fixture responses[${responseIndex}].records async iterator could not be inspected`,
      );
    }
    if (typeof iteratorFactory === "function") {
      return Object.freeze({
        kind: "async",
        target: value,
        iteratorFactory: iteratorFactory as (this: object) => unknown,
      });
    }
  }

  throw invalidFixture(
    `Fixture responses[${responseIndex}].records must be an array or async iterable`,
  );
}

function createRecordCursor(source: RecordSource): RecordCursor {
  if (source.kind === "array") {
    let index = 0;
    return {
      next: () => {
        if (index >= source.records.length) {
          return Promise.resolve({ done: true, value: undefined });
        }
        const value = source.records[index];
        index += 1;
        return Promise.resolve({ done: false, value });
      },
      closeQuietly: () => undefined,
    };
  }

  if (claimedAsyncSources.has(source.target)) {
    throw invalidFixture("An async fixture record source may be consumed once");
  }
  claimedAsyncSources.add(source.target);

  let iterator: unknown;
  try {
    iterator = source.iteratorFactory.call(source.target);
  } catch {
    throw invalidFixture("Async fixture record source could not be opened");
  }
  if (!isRecord(iterator)) {
    throw invalidFixture("Async fixture record source returned no iterator");
  }

  let nextMethod: unknown;
  try {
    nextMethod = iterator.next;
  } catch {
    closeIteratorQuietly(iterator);
    throw invalidFixture(
      "Async fixture iterator next() could not be inspected",
    );
  }
  if (typeof nextMethod !== "function") {
    closeIteratorQuietly(iterator);
    throw invalidFixture("Async fixture iterator must expose next()");
  }

  return {
    next: async () => {
      let rawStep: unknown;
      try {
        rawStep = await nextMethod.call(iterator);
      } catch (error) {
        throw error;
      }
      return snapshotIteratorStep(rawStep);
    },
    closeQuietly: () => closeIteratorQuietly(iterator),
  };
}

function snapshotIteratorStep(value: unknown): IteratorResult<unknown> {
  try {
    if (!isRecord(value)) {
      throw invalidFixture("Async fixture iterator returned an invalid step");
    }
    const done = value.done;
    if (done === true) return { done: true, value: undefined };
    if (done !== false && done !== undefined) {
      throw invalidFixture("Async fixture iterator step.done must be boolean");
    }
    const stepValue = value.value;
    return { done: false, value: stepValue };
  } catch (error) {
    if (error instanceof FixtureProviderError) throw error;
    throw invalidFixture("Async fixture iterator step could not be inspected");
  }
}

function closeIteratorQuietly(
  iterator: Record<string | symbol, unknown>,
): void {
  let returnMethod: unknown;
  try {
    returnMethod = iterator.return;
  } catch {
    return;
  }
  if (typeof returnMethod !== "function") return;

  let cleanup: unknown;
  try {
    cleanup = returnMethod.call(iterator);
  } catch {
    return;
  }
  void Promise.resolve(cleanup).catch(() => undefined);
}

function snapshotTransportRecord(
  value: unknown,
  recordIndex: number,
): Record<string, unknown> {
  try {
    const snapshot = snapshotUnknown(
      value,
      `Transport record[${recordIndex}]`,
      new WeakSet(),
    );
    if (!isPlainRecord(snapshot)) {
      throw new FixtureProviderError(
        "PROVIDER_INVALID_EVENT",
        `Transport record[${recordIndex}] must be an object`,
        { recordIndex },
      );
    }
    return snapshot;
  } catch (error) {
    if (error instanceof FixtureProviderError) throw error;
    throw new FixtureProviderError(
      "PROVIDER_INVALID_EVENT",
      `Transport record[${recordIndex}] could not be inspected safely`,
      { recordIndex },
    );
  }
}

function processRecord(
  record: Record<string, unknown>,
  recordIndex: number,
  requestId: string,
  state: ParseState,
): CourseModelChunk | undefined {
  const type = record.type;
  if (typeof type !== "string" || type.trim().length === 0) {
    throw invalidEvent(recordIndex, "Transport record type must be a string");
  }

  if (state.terminal !== undefined) {
    if (type === "response_end") {
      throw new FixtureProviderError(
        "PROVIDER_DUPLICATE_TERMINAL",
        "Fixture response contains more than one response_end record",
        { recordIndex },
      );
    }
    throw new FixtureProviderError(
      "PROVIDER_INVALID_TERMINAL",
      `Transport record "${type}" appears after response_end`,
      { recordIndex },
    );
  }

  if (type === "response_start") {
    processResponseStart(record, recordIndex, state);
    return undefined;
  }
  if (type === "transport_error") {
    processTransportError(record, recordIndex);
  }
  if (
    type !== "text_delta" &&
    type !== "tool_call" &&
    type !== "response_end"
  ) {
    throw new FixtureProviderError(
      "PROVIDER_UNKNOWN_EVENT",
      `Unknown provider transport record type "${type}"`,
      { recordIndex },
    );
  }
  if (state.responseId === undefined) {
    throw new FixtureProviderError(
      "PROVIDER_MISSING_START",
      `Transport record "${type}" appeared before response_start`,
      { recordIndex },
    );
  }

  if (type === "text_delta") {
    const text = record.text;
    if (typeof text !== "string") {
      throw invalidEvent(recordIndex, "text_delta.text must be a string");
    }
    state.content.push(Object.freeze({ type: "text", text }));
    return Object.freeze({ type: "textDelta", requestId, delta: text });
  }

  if (type === "tool_call") {
    const toolCall = snapshotProviderToolCall(record, recordIndex);
    if (state.toolCallIds.has(toolCall.id)) {
      throw invalidEvent(
        recordIndex,
        `Tool-call ID "${toolCall.id}" must be unique within a response`,
      );
    }
    state.toolCallIds.add(toolCall.id);
    state.content.push(toolCall);
    return Object.freeze({ type: "toolCall", requestId, toolCall });
  }

  state.terminal = snapshotTerminal(record, recordIndex, requestId, state);
  return undefined;
}

function processResponseStart(
  record: Record<string, unknown>,
  recordIndex: number,
  state: ParseState,
): void {
  if (state.responseId !== undefined) {
    throw new FixtureProviderError(
      "PROVIDER_DUPLICATE_START",
      "Fixture response contains more than one response_start record",
      { recordIndex },
    );
  }
  const responseId = record.responseId;
  const role = record.role;
  if (!isNonEmptyString(responseId)) {
    throw invalidEvent(
      recordIndex,
      "response_start.responseId must be a non-empty string",
    );
  }
  if (role !== "assistant") {
    throw invalidEvent(recordIndex, 'response_start.role must be "assistant"');
  }
  state.responseId = responseId;
}

function processTransportError(
  record: Record<string, unknown>,
  recordIndex: number,
): never {
  const providerCode = record.code;
  const message = record.message;
  if (!isNonEmptyString(providerCode) || !isNonEmptyString(message)) {
    throw invalidEvent(
      recordIndex,
      "transport_error code and message must be non-empty strings",
    );
  }
  throw new FixtureProviderError("PROVIDER_TRANSPORT_ERROR", message, {
    recordIndex,
    providerCode,
  });
}

function snapshotProviderToolCall(
  record: Record<string, unknown>,
  recordIndex: number,
): CourseToolCall {
  const id = record.id;
  const name = record.name;
  const argumentsValue = record.arguments;
  if (!isNonEmptyString(id)) {
    throw invalidEvent(recordIndex, "tool_call.id must be a non-empty string");
  }
  if (!isNonEmptyString(name)) {
    throw invalidEvent(
      recordIndex,
      "tool_call.name must be a non-empty string",
    );
  }

  try {
    const message = assistantMessage({
      id: `fixture-tool-${recordIndex}`,
      content: [
        {
          type: "toolCall",
          id,
          name,
          arguments: argumentsValue,
        } as CourseToolCall,
      ],
    });
    const block = message.content[0];
    if (block.type !== "toolCall") {
      throw new TypeError("Expected a Tool-call block");
    }
    return block;
  } catch {
    throw invalidEvent(
      recordIndex,
      "tool_call.arguments must be a non-null JSON object",
    );
  }
}

function snapshotTerminal(
  record: Record<string, unknown>,
  recordIndex: number,
  requestId: string,
  state: ParseState,
): CourseModelResponse {
  const responseId = record.responseId;
  const rawStopReason = record.stopReason;
  const rawUsage = record.usage;
  if (!isNonEmptyString(responseId)) {
    throw invalidEvent(
      recordIndex,
      "response_end.responseId must be a non-empty string",
    );
  }
  if (responseId !== state.responseId) {
    throw new FixtureProviderError(
      "PROVIDER_RESPONSE_MISMATCH",
      `response_end ID "${responseId}" does not match response_start ID "${state.responseId}"`,
      { recordIndex },
    );
  }

  const stopReason = normalizeStopReason(rawStopReason, recordIndex);
  const usage = normalizeUsage(rawUsage, recordIndex);
  const hasToolCall = state.toolCallIds.size > 0;
  if (stopReason === "toolCall" && !hasToolCall) {
    throw new FixtureProviderError(
      "PROVIDER_INVALID_TERMINAL",
      "A tool_call terminal must contain at least one Tool call",
      { recordIndex },
    );
  }
  if (stopReason === "stop" && hasToolCall) {
    throw new FixtureProviderError(
      "PROVIDER_INVALID_TERMINAL",
      "A stop terminal must not contain Tool calls",
      { recordIndex },
    );
  }

  const message = assistantMessage({
    id: `message-${responseId}`,
    content: state.content,
  });
  return Object.freeze({
    id: responseId,
    requestId,
    message,
    stopReason,
    usage,
  });
}

function normalizeStopReason(
  value: unknown,
  recordIndex: number,
): "stop" | "toolCall" {
  if (value === "stop") return "stop";
  if (value === "tool_call") return "toolCall";
  throw invalidEvent(
    recordIndex,
    'response_end.stopReason must be "stop" or "tool_call"',
  );
}

function normalizeUsage(value: unknown, recordIndex: number): CourseModelUsage {
  if (!isRecord(value) || Array.isArray(value)) {
    throw invalidEvent(recordIndex, "response_end.usage must be an object");
  }

  const camelInput = value.inputTokens;
  const camelOutput = value.outputTokens;
  const snakeInput = value.input_tokens;
  const snakeOutput = value.output_tokens;
  if (
    (camelInput !== undefined && snakeInput !== undefined) ||
    (camelOutput !== undefined && snakeOutput !== undefined)
  ) {
    throw invalidEvent(
      recordIndex,
      "response_end.usage must not mix duplicate token fields",
    );
  }
  const inputTokens = camelInput ?? snakeInput;
  const outputTokens = camelOutput ?? snakeOutput;
  if (!isTokenCount(inputTokens) || !isTokenCount(outputTokens)) {
    throw invalidEvent(
      recordIndex,
      "response_end.usage token counts must be non-negative safe integers",
    );
  }
  return Object.freeze({ inputTokens, outputTokens });
}

function snapshotRequestId(request: CourseModelRequest): string {
  let id: unknown;
  try {
    id = request.id;
  } catch {
    throw new TypeError("request.id could not be inspected");
  }
  if (!isNonEmptyString(id)) {
    throw new TypeError("request.id must be a non-empty string");
  }
  return id;
}

function snapshotUnknown(
  value: unknown,
  path: string,
  ancestors: WeakSet<object>,
): unknown {
  if (typeof value !== "object" || value === null) return value;
  if (ancestors.has(value)) {
    throw new TypeError(`${path} must not contain cycles`);
  }
  ancestors.add(value);

  try {
    if (Array.isArray(value)) {
      const length = snapshotArrayLength(value, path);
      const snapshot: unknown[] = [];
      for (let index = 0; index < length; index += 1) {
        if (!Object.hasOwn(value, index)) {
          throw new TypeError(`${path}[${index}] must not be sparse`);
        }
        snapshot.push(
          snapshotUnknown(value[index], `${path}[${index}]`, ancestors),
        );
      }
      return Object.freeze(snapshot);
    }

    const prototype = Object.getPrototypeOf(value) as object | null;
    const snapshot = Object.create(prototype) as Record<string, unknown>;
    const keys = Object.keys(value);
    const keyCount = keys.length;
    for (let index = 0; index < keyCount; index += 1) {
      const key = keys[index];
      const propertyValue = (value as Record<string, unknown>)[key];
      Object.defineProperty(snapshot, key, {
        configurable: false,
        enumerable: true,
        writable: false,
        value: snapshotUnknown(propertyValue, `${path}.${key}`, ancestors),
      });
    }
    return Object.freeze(snapshot);
  } finally {
    ancestors.delete(value);
  }
}

function snapshotArrayLength(value: readonly unknown[], path: string): number {
  const length = value.length;
  if (!Number.isSafeInteger(length) || length < 0) {
    throw new TypeError(`${path} has an invalid length`);
  }
  return length;
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
      reject(abortReason(signal));
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

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw abortReason(signal);
}

function abortReason(signal: AbortSignal): unknown {
  return (
    signal.reason ?? new DOMException("The operation was aborted", "AbortError")
  );
}

function invalidFixture(message: string): FixtureProviderError {
  return new FixtureProviderError("PROVIDER_INVALID_FIXTURE", message);
}

function invalidEvent(
  recordIndex: number,
  message: string,
): FixtureProviderError {
  return new FixtureProviderError("PROVIDER_INVALID_EVENT", message, {
    recordIndex,
  });
}

function isRecord(value: unknown): value is Record<string | symbol, unknown> {
  return typeof value === "object" && value !== null;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value) || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isTokenCount(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}
