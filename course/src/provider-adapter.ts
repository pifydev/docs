import { EventStream } from "./event-stream";
import { claimIteratorOnce } from "./iterator-ownership";
import { assistantMessage } from "./messages";
import type {
  CourseAssistantBlock,
  CourseJsonArray,
  CourseJsonObject,
  CourseJsonValue,
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
  | "PROVIDER_ITERATOR_REUSED"
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
  open: () => unknown;
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

const ownedProviderErrors = new WeakSet<FixtureProviderError>();

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
      throw providerError(
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
          if (isOwnedProviderError(error)) throw error;
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
        throw providerError(
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
    assertOrdinaryJsonObject(fixture, "Fixture");

    const schemaVersion = readOwnProperty(
      fixture,
      "schemaVersion",
      "Fixture.schemaVersion",
    );
    const responsesProperty = readOwnProperty(
      fixture,
      "responses",
      "Fixture.responses",
    );
    if (!schemaVersion.present || schemaVersion.value !== 1) {
      throw invalidFixture("Fixture schemaVersion must be 1");
    }
    const rawResponses = responsesProperty.value;
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
      const entryProperty = readOwnProperty(
        rawResponses,
        String(responseIndex),
        `Fixture responses[${responseIndex}]`,
      );
      if (!entryProperty.present) {
        throw invalidFixture(
          `Fixture responses[${responseIndex}] must not be sparse`,
        );
      }
      const entry = entryProperty.value;
      if (!isRecord(entry)) {
        throw invalidFixture(
          `Fixture responses[${responseIndex}] must be an object`,
        );
      }
      assertOrdinaryJsonObject(entry, `Fixture responses[${responseIndex}]`);
      const recordsProperty = readOwnProperty(
        entry,
        "records",
        `Fixture responses[${responseIndex}].records`,
      );
      responses.push(
        snapshotRecordSource(recordsProperty.value, responseIndex),
      );
    }
    return responses;
  } catch {
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
      const recordProperty = readOwnProperty(
        value,
        String(recordIndex),
        `Fixture responses[${responseIndex}].records[${recordIndex}]`,
      );
      if (!recordProperty.present) {
        throw invalidFixture(
          `Fixture responses[${responseIndex}].records[${recordIndex}] must not be sparse`,
        );
      }
      records.push(
        snapshotUnknown(
          recordProperty.value,
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
      iteratorFactory = Reflect.get(value, Symbol.asyncIterator);
    } catch {
      throw invalidFixture(
        `Fixture responses[${responseIndex}].records async iterator could not be inspected`,
      );
    }
    if (typeof iteratorFactory === "function") {
      return Object.freeze({
        kind: "async",
        open: () => Reflect.apply(iteratorFactory, value, []),
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

  let iterator: unknown;
  try {
    iterator = source.open();
  } catch {
    throw invalidFixture("Async fixture record source could not be opened");
  }
  if (!isRecord(iterator)) {
    throw invalidFixture("Async fixture record source returned no iterator");
  }
  if (!claimIteratorOnce(iterator)) {
    throw providerError(
      "PROVIDER_ITERATOR_REUSED",
      "An async fixture iterator may be consumed once",
    );
  }

  let nextMethod: unknown;
  try {
    nextMethod = Reflect.get(iterator, "next");
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
        rawStep = await Reflect.apply(nextMethod, iterator, []);
      } catch {
        throw invalidFixture("Async fixture record source failed");
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
    const doneProperty = readOwnProperty(
      value,
      "done",
      "Async fixture iterator step.done",
    );
    if (doneProperty.present && doneProperty.value === true) {
      return { done: true, value: undefined };
    }
    if (
      doneProperty.present &&
      doneProperty.value !== false &&
      doneProperty.value !== undefined
    ) {
      throw invalidFixture("Async fixture iterator step.done must be boolean");
    }
    const valueProperty = readOwnProperty(
      value,
      "value",
      "Async fixture iterator step.value",
    );
    return { done: false, value: valueProperty.value };
  } catch {
    throw invalidFixture("Async fixture iterator step could not be inspected");
  }
}

function closeIteratorQuietly(iterator: object): void {
  let returnMethod: unknown;
  try {
    returnMethod = Reflect.get(iterator, "return");
  } catch {
    return;
  }
  if (typeof returnMethod !== "function") return;

  let cleanup: unknown;
  try {
    cleanup = Reflect.apply(returnMethod, iterator, []);
  } catch {
    return;
  }
  void Promise.resolve(cleanup).catch(() => undefined);
}

function snapshotTransportRecord(
  value: unknown,
  recordIndex: number,
): Record<string, unknown> {
  let snapshot: unknown;
  try {
    snapshot = snapshotUnknown(
      value,
      `Transport record[${recordIndex}]`,
      new WeakSet(),
    );
  } catch {
    throw providerError(
      "PROVIDER_INVALID_EVENT",
      `Transport record[${recordIndex}] could not be inspected safely`,
      { recordIndex },
    );
  }
  if (!isRecord(snapshot) || Array.isArray(snapshot)) {
    throw providerError(
      "PROVIDER_INVALID_EVENT",
      `Transport record[${recordIndex}] must be an object`,
      { recordIndex },
    );
  }
  return snapshot;
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
      throw providerError(
        "PROVIDER_DUPLICATE_TERMINAL",
        "Fixture response contains more than one response_end record",
        { recordIndex },
      );
    }
    throw providerError(
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
    throw providerError(
      "PROVIDER_UNKNOWN_EVENT",
      `Unknown provider transport record type "${type}"`,
      { recordIndex },
    );
  }
  if (state.responseId === undefined) {
    throw providerError(
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
    throw providerError(
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
  throw providerError("PROVIDER_TRANSPORT_ERROR", message, {
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

  let argumentsSnapshot: CourseJsonObject;
  try {
    argumentsSnapshot = parseCourseJsonObject(
      argumentsValue,
      `tool_call[${recordIndex}].arguments`,
      new WeakSet(),
    );
  } catch {
    throw invalidEvent(
      recordIndex,
      "tool_call.arguments must be a non-null JSON object",
    );
  }
  return Object.freeze({
    type: "toolCall",
    id,
    name,
    arguments: argumentsSnapshot,
  });
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
    throw providerError(
      "PROVIDER_RESPONSE_MISMATCH",
      `response_end ID "${responseId}" does not match response_start ID "${state.responseId}"`,
      { recordIndex },
    );
  }

  const stopReason = normalizeStopReason(rawStopReason, recordIndex);
  const usage = normalizeUsage(rawUsage, recordIndex);
  const hasToolCall = state.toolCallIds.size > 0;
  if (stopReason === "toolCall" && !hasToolCall) {
    throw providerError(
      "PROVIDER_INVALID_TERMINAL",
      "A tool_call terminal must contain at least one Tool call",
      { recordIndex },
    );
  }
  if (stopReason === "stop" && hasToolCall) {
    throw providerError(
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

  const camelInput = readOwnProperty(
    value,
    "inputTokens",
    "response_end.usage.inputTokens",
  );
  const camelOutput = readOwnProperty(
    value,
    "outputTokens",
    "response_end.usage.outputTokens",
  );
  const snakeInput = readOwnProperty(
    value,
    "input_tokens",
    "response_end.usage.input_tokens",
  );
  const snakeOutput = readOwnProperty(
    value,
    "output_tokens",
    "response_end.usage.output_tokens",
  );
  if (
    (camelInput.present && snakeInput.present) ||
    (camelOutput.present && snakeOutput.present)
  ) {
    throw invalidEvent(
      recordIndex,
      "response_end.usage must not mix duplicate token fields",
    );
  }
  const inputTokens = camelInput.present ? camelInput.value : snakeInput.value;
  const outputTokens = camelOutput.present
    ? camelOutput.value
    : snakeOutput.value;
  if (!isTokenCount(inputTokens) || !isTokenCount(outputTokens)) {
    throw invalidEvent(
      recordIndex,
      "response_end.usage token counts must be non-negative safe integers",
    );
  }
  return Object.freeze({ inputTokens, outputTokens });
}

function snapshotRequestId(request: CourseModelRequest): string {
  let idProperty: OwnPropertyValue;
  try {
    if (!isRecord(request)) {
      throw new TypeError("request must be an object");
    }
    idProperty = readOwnProperty(request, "id", "request.id");
  } catch {
    throw new TypeError("request.id could not be inspected");
  }
  const id = idProperty.value;
  if (!isNonEmptyString(id)) {
    throw new TypeError("request.id must be a non-empty string");
  }
  return id;
}

type OwnPropertyValue =
  | Readonly<{ present: false; value: undefined }>
  | Readonly<{ present: true; value: unknown }>;

const MISSING_OWN_PROPERTY: OwnPropertyValue = Object.freeze({
  present: false,
  value: undefined,
});

function readOwnProperty(
  target: object,
  key: PropertyKey,
  path: string,
): OwnPropertyValue {
  const descriptor = Object.getOwnPropertyDescriptor(target, key);
  if (descriptor === undefined) return MISSING_OWN_PROPERTY;
  return Object.freeze({
    present: true,
    value: valueFromOwnDescriptor(target, descriptor, path),
  });
}

function valueFromOwnDescriptor(
  target: object,
  descriptor: PropertyDescriptor,
  path: string,
): unknown {
  if (Object.hasOwn(descriptor, "value")) return descriptor.value;
  const getter = descriptor.get;
  if (getter === undefined) return undefined;
  try {
    return Reflect.apply(getter, target, []);
  } catch {
    throw new TypeError(`${path} getter could not be evaluated safely`);
  }
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
        const item = readOwnProperty(value, String(index), `${path}[${index}]`);
        if (!item.present) {
          throw new TypeError(`${path}[${index}] must not be sparse`);
        }
        snapshot.push(
          snapshotUnknown(item.value, `${path}[${index}]`, ancestors),
        );
      }
      return Object.freeze(snapshot);
    }

    assertOrdinaryJsonObject(value, path);
    const snapshot: Record<string, unknown> = Object.create(null);
    const keys = Reflect.ownKeys(value);
    const keyCount = keys.length;
    for (let index = 0; index < keyCount; index += 1) {
      const key = keys[index];
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor === undefined || !descriptor.enumerable) continue;
      if (typeof key !== "string") {
        throw new TypeError(`${path} must not contain enumerable symbol keys`);
      }
      const propertyValue = valueFromOwnDescriptor(
        value,
        descriptor,
        `${path}.${key}`,
      );
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
  const lengthProperty = readOwnProperty(value, "length", `${path}.length`);
  const length = lengthProperty.value;
  if (
    typeof length !== "number" ||
    !Number.isSafeInteger(length) ||
    length < 0
  ) {
    throw new TypeError(`${path} has an invalid length`);
  }
  return length;
}

function parseCourseJsonObject(
  value: unknown,
  path: string,
  ancestors: WeakSet<object>,
): CourseJsonObject {
  if (!isRecord(value) || Array.isArray(value)) {
    throw new TypeError(`${path} must be an object and not an array`);
  }
  return parseCourseJsonObjectValue(value, path, ancestors);
}

function parseCourseJsonObjectValue(
  value: Record<string, unknown>,
  path: string,
  ancestors: WeakSet<object>,
): CourseJsonObject {
  assertOrdinaryJsonObject(value, path);
  if (ancestors.has(value)) {
    throw new TypeError(`${path} must not contain cycles`);
  }
  ancestors.add(value);

  try {
    const snapshot: Record<string, CourseJsonValue> = Object.create(null);
    const keys = Reflect.ownKeys(value);
    const keyCount = keys.length;
    for (let index = 0; index < keyCount; index += 1) {
      const key = keys[index];
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor === undefined || !descriptor.enumerable) continue;
      if (typeof key !== "string") {
        throw new TypeError(`${path} must not contain enumerable symbol keys`);
      }
      const item = valueFromOwnDescriptor(value, descriptor, `${path}.${key}`);
      Object.defineProperty(snapshot, key, {
        configurable: false,
        enumerable: true,
        value: parseCourseJsonValue(item, `${path}.${key}`, ancestors),
        writable: false,
      });
    }
    return Object.freeze(snapshot);
  } finally {
    ancestors.delete(value);
  }
}

function assertOrdinaryJsonObject(value: object, path: string): void {
  let prototype: unknown;
  try {
    prototype = Object.getPrototypeOf(value);
  } catch {
    throw new TypeError(`${path} prototype could not be inspected safely`);
  }
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError(
      `${path} must use Object.prototype or a null prototype`,
    );
  }
}

function parseCourseJsonValue(
  value: unknown,
  path: string,
  ancestors: WeakSet<object>,
): CourseJsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return parseCourseJsonArray(value, path, ancestors);
  if (isRecord(value)) {
    return parseCourseJsonObjectValue(value, path, ancestors);
  }
  throw new TypeError(`${path} must contain only JSON-compatible values`);
}

function parseCourseJsonArray(
  value: readonly unknown[],
  path: string,
  ancestors: WeakSet<object>,
): CourseJsonArray {
  if (ancestors.has(value)) {
    throw new TypeError(`${path} must not contain cycles`);
  }
  ancestors.add(value);

  try {
    const length = snapshotArrayLength(value, path);
    const snapshot: CourseJsonValue[] = [];
    for (let index = 0; index < length; index += 1) {
      const item = readOwnProperty(value, String(index), `${path}[${index}]`);
      if (!item.present) {
        throw new TypeError(`${path}[${index}] must not be sparse`);
      }
      snapshot.push(
        parseCourseJsonValue(item.value, `${path}[${index}]`, ancestors),
      );
    }
    return Object.freeze(snapshot);
  } finally {
    ancestors.delete(value);
  }
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

function providerError(
  code: FixtureProviderErrorCode,
  message: string,
  metadata: FixtureProviderErrorMetadata = {},
): FixtureProviderError {
  const error = new FixtureProviderError(code, message, metadata);
  ownedProviderErrors.add(error);
  return error;
}

function isOwnedProviderError(error: unknown): error is FixtureProviderError {
  return (
    error instanceof FixtureProviderError && ownedProviderErrors.has(error)
  );
}

function invalidFixture(message: string): FixtureProviderError {
  return providerError("PROVIDER_INVALID_FIXTURE", message);
}

function invalidEvent(
  recordIndex: number,
  message: string,
): FixtureProviderError {
  return providerError("PROVIDER_INVALID_EVENT", message, {
    recordIndex,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isTokenCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
