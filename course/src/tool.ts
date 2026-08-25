import { assistantMessage, toolResultMessage } from "./messages";
import type {
  CourseJsonObject,
  CourseTool,
  CourseToolCall,
  CourseToolExecutionContext,
  CourseToolResultMessage,
} from "./protocol";

/** The serialized Tool-result cap in Unicode code points, marker included. */
export const COURSE_TOOL_OUTPUT_CAP_CHARACTERS = 4096;
export const COURSE_TOOL_TRUNCATION_MARKER = "\n[Tool output truncated]";
/** Maximum nested object/array levels inspected by the course serializer. */
export const COURSE_TOOL_SERIALIZATION_MAX_DEPTH = 32;
/** Maximum values inspected by the course serializer. */
export const COURSE_TOOL_SERIALIZATION_MAX_NODES = 128;
/** Maximum own properties or array slots inspected across one output. */
export const COURSE_TOOL_SERIALIZATION_MAX_COLLECTION_ENTRIES = 256;
/** Maximum Unicode code points consumed from keys and string values. */
export const COURSE_TOOL_SERIALIZATION_MAX_STRING_CHARACTERS = 4096;
/** Maximum accepted BigInt magnitude in binary bits before decimal conversion. */
export const COURSE_TOOL_SERIALIZATION_MAX_BIGINT_BITS = 4096;

const ownedToolContractErrors = new WeakSet<object>();
const reflectApply = Reflect.apply;
const weakSetAdd = WeakSet.prototype.add;
const weakSetHas = WeakSet.prototype.has;
const nonRecoverableRegistryKey = Symbol.for(
  "pify.course.NonRecoverableToolError.provenance.v1",
);
const sharedNonRecoverableToolErrors = loadNonRecoverableToolErrorRegistry();
const nativePromiseConstructor = Promise;
const nativePromiseResolve = Promise.resolve;
const nativePromiseThen = Promise.prototype.then;
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
const maximumSerializableBigIntMagnitude =
  BigInt(1) << BigInt(COURSE_TOOL_SERIALIZATION_MAX_BIGINT_BITS);

export type ToolContractErrorCode =
  | "INVALID_TOOL_DEFINITION"
  | "INVALID_TOOL_BATCH"
  | "DUPLICATE_TOOL_NAME"
  | "INVALID_TOOL_CALL";

export class ToolContractError extends Error {
  public readonly code: ToolContractErrorCode;

  public constructor(
    code: ToolContractErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "ToolContractError";
    this.code = code;
    Object.freeze(this);
  }
}

/** Throw this only for an invariant/programmer failure that must stop the run. */
export class NonRecoverableToolError extends Error {
  public readonly code = "NON_RECOVERABLE_TOOL_ERROR" as const;
  public readonly nonRecoverable = true as const;

  public constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "NonRecoverableToolError";
    reflectApply(weakSetAdd, sharedNonRecoverableToolErrors, [this]);
  }
}

export type RegisteredCourseTool = Readonly<{
  name: string;
  description: string;
  validate: (input: unknown) => unknown;
  execute: (input: unknown, context: CourseToolExecutionContext) => unknown;
}>;

type ValidationDecision =
  | Readonly<{ ok: true; value: unknown }>
  | Readonly<{ ok: false; error: string }>;

type UnexpectedAsyncObservation = Readonly<{
  detected: boolean;
  error?: unknown;
}>;

type ToolResultErrorCode =
  | "TOOL_NOT_FOUND"
  | "TOOL_ARGUMENTS_INVALID"
  | "TOOL_VALIDATION_FAILED"
  | "TOOL_EXECUTION_FAILED"
  | "TOOL_OUTPUT_SERIALIZATION_FAILED";

export function defineTool<Input, Output>(
  definition: CourseTool<Input, Output>,
): CourseTool<Input, Output> {
  return snapshotToolDefinition(definition) as CourseTool<Input, Output>;
}

export class ToolRegistry {
  readonly #tools = new Map<string, RegisteredCourseTool>();

  public constructor(definitions: readonly unknown[] = []) {
    this.registerMany(definitions);
  }

  public get size(): number {
    return this.#tools.size;
  }

  public get names(): readonly string[] {
    return Object.freeze(Array.from(this.#tools.keys()));
  }

  public get(name: string): RegisteredCourseTool | undefined {
    return this.#tools.get(name);
  }

  public register(definition: unknown): void {
    this.registerMany([definition]);
  }

  public registerMany(definitions: readonly unknown[]): void {
    const batch = snapshotDefinitionBatch(definitions);
    const pendingNames = new Set<string>();

    for (let index = 0; index < batch.length; index += 1) {
      const tool = batch[index];
      if (pendingNames.has(tool.name) || this.#tools.has(tool.name)) {
        throw createToolContractError(
          "DUPLICATE_TOOL_NAME",
          `Tool name "${tool.name}" is already registered`,
        );
      }
      pendingNames.add(tool.name);
    }

    for (let index = 0; index < batch.length; index += 1) {
      const tool = batch[index];
      this.#tools.set(tool.name, tool);
    }
  }
}

export async function executeToolCall(
  registry: ToolRegistry,
  inputToolCall: CourseToolCall,
  signal: AbortSignal,
): Promise<CourseToolResultMessage> {
  throwIfAborted(signal);
  if (!(registry instanceof ToolRegistry)) {
    throw createToolContractError(
      "INVALID_TOOL_CALL",
      "executeToolCall requires a ToolRegistry",
    );
  }
  let toolCall: CourseToolCall;
  try {
    toolCall = snapshotToolCall(inputToolCall);
  } catch (error) {
    throwIfAborted(signal);
    throw error;
  }
  throwIfAborted(signal);

  const tool = registry.get(toolCall.name);
  if (tool === undefined) {
    return createErrorResult(
      toolCall,
      "TOOL_NOT_FOUND",
      `Unknown Tool "${toolCall.name}"`,
    );
  }

  throwIfAborted(signal);
  let rawValidation: unknown;
  let asyncValidation: UnexpectedAsyncObservation | undefined;
  try {
    rawValidation = tool.validate(toolCall.arguments);
    asyncValidation = observeUnexpectedAsyncValidation(rawValidation);
  } catch (error) {
    propagateExceptionalFailure(error, signal);
    return createErrorResult(
      toolCall,
      "TOOL_VALIDATION_FAILED",
      failureMessage(error, "Tool validation failed"),
    );
  }
  throwIfAborted(signal);

  if (asyncValidation?.detected === true) {
    return createErrorResult(
      toolCall,
      "TOOL_VALIDATION_FAILED",
      failureMessage(
        asyncValidation.error,
        "Tool validation must return synchronously",
      ),
    );
  }

  let validation: ValidationDecision;
  try {
    validation = snapshotValidation(rawValidation);
  } catch (error) {
    propagateExceptionalFailure(error, signal);
    return createErrorResult(
      toolCall,
      "TOOL_VALIDATION_FAILED",
      failureMessage(error, "Tool validation returned an invalid decision"),
    );
  }
  throwIfAborted(signal);
  if (!validation.ok) {
    return createErrorResult(
      toolCall,
      "TOOL_ARGUMENTS_INVALID",
      validation.error,
    );
  }

  throwIfAborted(signal);
  const context = Object.freeze({ signal, toolCallId: toolCall.id });
  let pendingOutput: Promise<unknown>;
  try {
    pendingOutput = resolveWithCapturedPromise(
      tool.execute(validation.value, context),
    );
  } catch (error) {
    propagateExceptionalFailure(error, signal);
    return createErrorResult(
      toolCall,
      "TOOL_EXECUTION_FAILED",
      failureMessage(error, "Tool execution failed"),
    );
  }

  let output: unknown;
  try {
    output = await waitForAbort(pendingOutput, signal);
  } catch (error) {
    propagateExceptionalFailure(error, signal);
    return createErrorResult(
      toolCall,
      "TOOL_EXECUTION_FAILED",
      failureMessage(error, "Tool execution failed"),
    );
  }
  throwIfAborted(signal);

  let serialized: string;
  try {
    serialized = serializeSafely(output);
  } catch (error) {
    propagateExceptionalFailure(error, signal);
    return createErrorResult(
      toolCall,
      "TOOL_OUTPUT_SERIALIZATION_FAILED",
      failureMessage(error, "Tool output could not be serialized safely"),
    );
  }
  throwIfAborted(signal);

  return createResult(toolCall, serialized, false);
}

function snapshotDefinitionBatch(
  definitions: readonly unknown[],
): RegisteredCourseTool[] {
  let isArray: boolean;
  try {
    isArray = Array.isArray(definitions);
  } catch (cause) {
    throw createToolContractError(
      "INVALID_TOOL_BATCH",
      "Tool definition batch could not be inspected",
      { cause },
    );
  }
  if (!isArray) {
    throw createToolContractError(
      "INVALID_TOOL_BATCH",
      "Tool definitions must be an array",
    );
  }

  let length: unknown;
  try {
    length = Reflect.get(definitions, "length");
  } catch (cause) {
    throw createToolContractError(
      "INVALID_TOOL_BATCH",
      "Tool definition batch length could not be inspected",
      { cause },
    );
  }
  if (!Number.isSafeInteger(length) || (length as number) < 0) {
    throw createToolContractError(
      "INVALID_TOOL_BATCH",
      "Tool definition batch length must be a non-negative safe integer",
    );
  }

  const batchLength = length as number;
  const batch: RegisteredCourseTool[] = [];
  for (let index = 0; index < batchLength; index += 1) {
    let hasEntry: boolean;
    let definition: unknown;
    try {
      hasEntry = Object.hasOwn(definitions, index);
    } catch (cause) {
      throw createToolContractError(
        "INVALID_TOOL_BATCH",
        `Tool definition at index ${index} could not be inspected`,
        { cause },
      );
    }
    if (!hasEntry) {
      throw createToolContractError(
        "INVALID_TOOL_BATCH",
        `Tool definition batch must not be sparse at index ${index}`,
      );
    }
    try {
      definition = Reflect.get(definitions, index);
    } catch (cause) {
      throw createToolContractError(
        "INVALID_TOOL_BATCH",
        `Tool definition at index ${index} could not be read`,
        { cause },
      );
    }
    batch.push(snapshotToolDefinition(definition));
  }
  return batch;
}

function snapshotToolDefinition(value: unknown): RegisteredCourseTool {
  if (!isObjectLike(value)) {
    throw createToolContractError(
      "INVALID_TOOL_DEFINITION",
      "Tool definition must be an object",
    );
  }

  const name = readOwnToolField(value, "name");
  const description = readOwnToolField(value, "description");
  const validate = readOwnToolField(value, "validate");
  const execute = readOwnToolField(value, "execute");
  if (typeof name !== "string" || name.trim().length === 0) {
    throw createToolContractError(
      "INVALID_TOOL_DEFINITION",
      "Tool name must be a non-empty string",
    );
  }
  if (typeof description !== "string" || description.trim().length === 0) {
    throw createToolContractError(
      "INVALID_TOOL_DEFINITION",
      `Tool "${name}" description must be a non-empty string`,
    );
  }
  if (typeof validate !== "function") {
    throw createToolContractError(
      "INVALID_TOOL_DEFINITION",
      `Tool "${name}" validate must be a function`,
    );
  }
  if (typeof execute !== "function") {
    throw createToolContractError(
      "INVALID_TOOL_DEFINITION",
      `Tool "${name}" execute must be a function`,
    );
  }

  return Object.freeze({
    name,
    description,
    validate(input: unknown): unknown {
      return Reflect.apply(validate, undefined, [input]);
    },
    execute(input: unknown, context: CourseToolExecutionContext): unknown {
      return Reflect.apply(execute, undefined, [input, context]);
    },
  });
}

function readOwnToolField(
  definition: object,
  key: "name" | "description" | "validate" | "execute",
): unknown {
  let hasField: boolean;
  try {
    hasField = Object.hasOwn(definition, key);
  } catch (cause) {
    throw createToolContractError(
      "INVALID_TOOL_DEFINITION",
      `Tool definition ${key} could not be inspected`,
      { cause },
    );
  }
  if (!hasField) {
    throw createToolContractError(
      "INVALID_TOOL_DEFINITION",
      `Tool definition must have an own ${key} field`,
    );
  }
  try {
    return Reflect.get(definition, key);
  } catch (cause) {
    throw createToolContractError(
      "INVALID_TOOL_DEFINITION",
      `Tool definition ${key} could not be read`,
      { cause },
    );
  }
}

function snapshotToolCall(value: unknown): CourseToolCall {
  try {
    return inspectToolCall(value);
  } catch (cause) {
    throw createToolContractError(
      "INVALID_TOOL_CALL",
      "Tool call could not be inspected safely",
      { cause },
    );
  }
}

function inspectToolCall(value: unknown): CourseToolCall {
  if (!isObjectLike(value)) {
    throw createToolContractError(
      "INVALID_TOOL_CALL",
      "Tool call must be an object",
    );
  }

  let type: unknown;
  let id: unknown;
  let name: unknown;
  let argumentsValue: unknown;
  try {
    type = readOwn(value, "type");
    id = readOwn(value, "id");
    name = readOwn(value, "name");
    argumentsValue = readOwn(value, "arguments");
  } catch (cause) {
    throw createToolContractError(
      "INVALID_TOOL_CALL",
      "Tool call fields could not be inspected",
      { cause },
    );
  }

  if (type !== "toolCall") {
    throw createToolContractError(
      "INVALID_TOOL_CALL",
      'Tool call type must be "toolCall"',
    );
  }
  if (typeof id !== "string" || id.trim().length === 0) {
    throw createToolContractError(
      "INVALID_TOOL_CALL",
      "Tool call ID must be a non-empty string",
    );
  }
  if (typeof name !== "string" || name.trim().length === 0) {
    throw createToolContractError(
      "INVALID_TOOL_CALL",
      "Tool call name must be a non-empty string",
    );
  }
  if (!isCourseJsonObjectCandidate(argumentsValue)) {
    throw createToolContractError(
      "INVALID_TOOL_CALL",
      `Tool call "${id}" arguments must be an object`,
    );
  }

  try {
    const message = assistantMessage({
      id: "tool-call-snapshot",
      content: [{ type, id, name, arguments: argumentsValue }],
    });
    const block = message.content[0];
    if (block.type !== "toolCall") {
      throw new TypeError("Tool call snapshot did not contain a Tool call");
    }
    return block;
  } catch (cause) {
    throw createToolContractError(
      "INVALID_TOOL_CALL",
      `Tool call "${id}" arguments are invalid`,
      { cause },
    );
  }
}

function snapshotValidation(value: unknown): ValidationDecision {
  if (!isObjectLike(value)) {
    throw new TypeError("Tool validation must return a decision object");
  }

  const ok = readOwn(value, "ok");
  if (ok === true) {
    return Object.freeze({ ok, value: readOwn(value, "value") });
  }
  if (ok === false) {
    const error = readOwn(value, "error");
    if (typeof error !== "string" || error.trim().length === 0) {
      throw new TypeError(
        "A rejected Tool validation must include a non-empty error",
      );
    }
    return Object.freeze({ ok, error });
  }
  throw new TypeError("Tool validation ok must be a boolean");
}

function observeUnexpectedAsyncValidation(
  value: unknown,
): UnexpectedAsyncObservation {
  if (!isObjectLike(value)) return { detected: false };
  if (observeNativePromise(value)) return { detected: true };

  let then: unknown;
  try {
    then = Reflect.get(value, "then");
  } catch (error) {
    return { detected: true, error };
  }
  if (typeof then !== "function") return { detected: false };

  try {
    const returned = reflectApply(then, value, [
      ignoreSettlement,
      ignoreSettlement,
    ]);
    observeReturnedThenable(returned);
    return { detected: true };
  } catch (error) {
    return { detected: true, error };
  }
}

function observeReturnedThenable(value: unknown): void {
  if (!isObjectLike(value)) return;
  if (observeNativePromise(value)) return;

  let then: unknown;
  try {
    then = Reflect.get(value, "then");
  } catch {
    return;
  }
  if (typeof then !== "function") return;
  try {
    const returned = reflectApply(then, value, [
      ignoreSettlement,
      ignoreSettlement,
    ]);
    if (returned !== value && isObjectLike(returned)) {
      observeNativePromise(returned);
    }
  } catch {
    // The validator is invalid either way; observation must never escape.
  }
}

function observeNativePromise(value: object): boolean {
  try {
    reflectApply(nativePromiseThen, value, [
      ignoreSettlement,
      ignoreSettlement,
    ]);
    return true;
  } catch {
    return false;
  }
}

function resolveWithCapturedPromise(value: unknown): Promise<unknown> {
  return reflectApply(nativePromiseResolve, nativePromiseConstructor, [
    value,
  ]) as Promise<unknown>;
}

function ignoreSettlement(): void {
  // Intentionally consume asynchronous validator settlements.
}

function createErrorResult(
  toolCall: CourseToolCall,
  code: ToolResultErrorCode,
  message: string,
): CourseToolResultMessage {
  return createResult(
    toolCall,
    serializeSafely({ error: { code, message } }),
    true,
  );
}

function createResult(
  toolCall: CourseToolCall,
  content: string,
  isError: boolean,
): CourseToolResultMessage {
  return toolResultMessage({
    id: `tool-result-${toolCall.id}`,
    toolCallId: toolCall.id,
    toolName: toolCall.name,
    content,
    isError,
  });
}

function serializeSafely(value: unknown): string {
  const state: SerializationState = {
    writer: new BoundedOutputWriter(),
    ancestors: new WeakSet<object>(),
    nodesVisited: 0,
    collectionEntriesVisited: 0,
    stringCharactersVisited: 0,
  };
  writeSerializedValue(value, 0, state);
  return state.writer.finish();
}

type SerializationState = {
  readonly writer: BoundedOutputWriter;
  readonly ancestors: WeakSet<object>;
  nodesVisited: number;
  collectionEntriesVisited: number;
  stringCharactersVisited: number;
};

class BoundedOutputWriter {
  #text = "";
  #characters = 0;
  #truncated = false;

  public get truncated(): boolean {
    return this.#truncated;
  }

  public append(value: string): boolean {
    let index = 0;
    while (index < value.length) {
      if (this.#characters >= COURSE_TOOL_OUTPUT_CAP_CHARACTERS) {
        this.#truncated = true;
        return false;
      }
      const width = unicodeCodePointWidth(value, index);
      this.#text += value.slice(index, index + width);
      this.#characters += 1;
      index += width;
    }
    return true;
  }

  public truncate(): void {
    this.#truncated = true;
  }

  public finish(): string {
    if (!this.#truncated) return this.#text;
    const prefixCharacters =
      COURSE_TOOL_OUTPUT_CAP_CHARACTERS -
      countUnicodeCharacters(COURSE_TOOL_TRUNCATION_MARKER);
    return (
      takeUnicodePrefix(this.#text, prefixCharacters) +
      COURSE_TOOL_TRUNCATION_MARKER
    );
  }
}

function writeSerializedValue(
  value: unknown,
  depth: number,
  state: SerializationState,
): void {
  if (state.writer.truncated) return;
  if (state.nodesVisited >= COURSE_TOOL_SERIALIZATION_MAX_NODES) {
    state.writer.truncate();
    return;
  }
  state.nodesVisited += 1;

  if (value === null) {
    state.writer.append("null");
    return;
  }
  if (typeof value === "string") {
    writeQuotedString(value, state, true);
    return;
  }
  if (typeof value === "boolean") {
    state.writer.append(value ? "true" : "false");
    return;
  }
  if (typeof value === "number") {
    state.writer.append(
      Number.isFinite(value)
        ? Object.is(value, -0)
          ? "0"
          : String(value)
        : "null",
    );
    return;
  }
  if (typeof value === "bigint") {
    if (
      value >= maximumSerializableBigIntMagnitude ||
      value <= -maximumSerializableBigIntMagnitude
    ) {
      state.writer.truncate();
      return;
    }
    writeQuotedString(`${value}n`, state, true);
    return;
  }
  if (typeof value === "undefined") {
    writeQuotedString("[Undefined]", state, false);
    return;
  }
  if (typeof value === "symbol") {
    writeQuotedString("[Symbol]", state, false);
    return;
  }
  if (typeof value === "function") {
    writeQuotedString("[Function]", state, false);
    return;
  }

  if (depth > COURSE_TOOL_SERIALIZATION_MAX_DEPTH) {
    state.writer.truncate();
    return;
  }
  if (state.ancestors.has(value)) {
    writeQuotedString("[Circular]", state, false);
    return;
  }

  const isArray = Array.isArray(value);
  const prototype = Object.getPrototypeOf(value);
  if (isArray) {
    if (!isSupportedArrayPrototype(prototype)) {
      throw new TypeError("Tool output arrays must use a plain prototype");
    }
  } else if (!isSupportedObjectPrototype(prototype)) {
    throw new TypeError(
      "Tool output objects must be plain or have a null prototype",
    );
  }

  state.ancestors.add(value);
  try {
    if (isArray) {
      writeSerializedArray(value, depth, state);
    } else {
      writeSerializedObject(value, depth, state);
    }
  } finally {
    state.ancestors.delete(value);
  }
}

function isSupportedObjectPrototype(prototype: object | null): boolean {
  if (prototype === null || prototype === Object.prototype) return true;
  if (Object.getPrototypeOf(prototype) !== null) return false;
  return (
    hasStandardConstructor(prototype, "Object") &&
    hasOwnDataFunction(prototype, "hasOwnProperty") &&
    hasOwnDataFunction(prototype, "propertyIsEnumerable") &&
    hasOwnDataFunction(prototype, "toString") &&
    hasOwnDataFunction(prototype, "valueOf")
  );
}

function isSupportedArrayPrototype(prototype: object | null): boolean {
  if (prototype === null || prototype === Array.prototype) return true;
  const parent = Object.getPrototypeOf(prototype);
  return (
    isSupportedObjectPrototype(parent) &&
    hasStandardConstructor(prototype, "Array") &&
    hasOwnDataFunction(prototype, "push") &&
    hasOwnDataFunction(prototype, Symbol.iterator)
  );
}

function hasStandardConstructor(
  prototype: object,
  expectedName: "Object" | "Array",
): boolean {
  const descriptor = Object.getOwnPropertyDescriptor(prototype, "constructor");
  if (
    descriptor === undefined ||
    !("value" in descriptor) ||
    typeof descriptor.value !== "function"
  ) {
    return false;
  }
  const name = Object.getOwnPropertyDescriptor(descriptor.value, "name");
  const constructorPrototype = Object.getOwnPropertyDescriptor(
    descriptor.value,
    "prototype",
  );
  return (
    name !== undefined &&
    "value" in name &&
    name.value === expectedName &&
    constructorPrototype !== undefined &&
    "value" in constructorPrototype &&
    constructorPrototype.value === prototype
  );
}

function hasOwnDataFunction(value: object, key: PropertyKey): boolean {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return (
    descriptor !== undefined &&
    "value" in descriptor &&
    typeof descriptor.value === "function"
  );
}

function writeSerializedArray(
  value: object,
  depth: number,
  state: SerializationState,
): void {
  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
  const length = lengthDescriptor?.value;
  if (!Number.isSafeInteger(length) || (length as number) < 0) {
    throw new TypeError("Tool output array has an invalid length");
  }

  if (!state.writer.append("[")) return;
  const arrayLength = length as number;
  for (let index = 0; index < arrayLength; index += 1) {
    if (!visitCollectionEntry(state)) return;
    if (index > 0 && !state.writer.append(",")) return;
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (descriptor === undefined) {
      writeQuotedString("[Empty]", state, false);
    } else if ("value" in descriptor) {
      writeSerializedValue(descriptor.value, depth + 1, state);
    } else {
      writeQuotedString("[Accessor omitted]", state, false);
    }
    if (state.writer.truncated) return;
  }
  state.writer.append("]");
}

function writeSerializedObject(
  value: object,
  depth: number,
  state: SerializationState,
): void {
  if (!state.writer.append("{")) return;
  // JSON object semantics: enumerable own string keys only. Symbols and
  // non-enumerable properties are ignored, and accessors are never invoked.
  const fields: Array<
    Readonly<{ key: string; descriptor: PropertyDescriptor }>
  > = [];
  for (const key in value) {
    if (!Object.hasOwn(value, key)) continue;
    if (!visitCollectionEntry(state)) return;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined) {
      throw new TypeError("Tool output property disappeared during inspection");
    }
    if (descriptor.enumerable === true && "value" in descriptor) {
      fields.push({ key, descriptor });
    }
  }
  fields.sort((left, right) =>
    left.key < right.key ? -1 : left.key > right.key ? 1 : 0,
  );

  for (let index = 0; index < fields.length; index += 1) {
    if (index > 0 && !state.writer.append(",")) return;
    const field = fields[index];
    writeQuotedString(field.key, state, true);
    if (!state.writer.append(":")) return;
    writeSerializedValue(field.descriptor.value, depth + 1, state);
    if (state.writer.truncated) return;
  }
  state.writer.append("}");
}

function visitCollectionEntry(state: SerializationState): boolean {
  if (
    state.collectionEntriesVisited >=
    COURSE_TOOL_SERIALIZATION_MAX_COLLECTION_ENTRIES
  ) {
    state.writer.truncate();
    return false;
  }
  state.collectionEntriesVisited += 1;
  return true;
}

function writeQuotedString(
  value: string,
  state: SerializationState,
  consumeBudget: boolean,
): void {
  if (!state.writer.append('"')) return;
  let index = 0;
  while (index < value.length) {
    if (
      consumeBudget &&
      state.stringCharactersVisited >=
        COURSE_TOOL_SERIALIZATION_MAX_STRING_CHARACTERS
    ) {
      state.writer.truncate();
      return;
    }
    const width = unicodeCodePointWidth(value, index);
    const first = value.charCodeAt(index);
    const validPair = width === 2;
    let encoded: string;
    if (validPair) {
      encoded = value.slice(index, index + 2);
    } else if ((first >= 0xd800 && first <= 0xdfff) || first < 0x20) {
      encoded = `\\u${first.toString(16).padStart(4, "0")}`;
    } else if (first === 0x22) {
      encoded = '\\"';
    } else if (first === 0x5c) {
      encoded = "\\\\";
    } else {
      encoded = value[index];
    }
    if (consumeBudget) state.stringCharactersVisited += 1;
    if (!state.writer.append(encoded)) return;
    index += width;
  }
  state.writer.append('"');
}

function unicodeCodePointWidth(value: string, index: number): 1 | 2 {
  const first = value.charCodeAt(index);
  if (first < 0xd800 || first > 0xdbff) return 1;
  const second = value.charCodeAt(index + 1);
  return second >= 0xdc00 && second <= 0xdfff ? 2 : 1;
}

function countUnicodeCharacters(value: string): number {
  let count = 0;
  let index = 0;
  while (index < value.length) {
    index += unicodeCodePointWidth(value, index);
    count += 1;
  }
  return count;
}

function takeUnicodePrefix(value: string, characters: number): string {
  let count = 0;
  let index = 0;
  while (index < value.length && count < characters) {
    index += unicodeCodePointWidth(value, index);
    count += 1;
  }
  return value.slice(0, index);
}

function propagateExceptionalFailure(
  error: unknown,
  signal: AbortSignal,
): void {
  throwIfAborted(signal);
  if (isNonRecoverableToolError(error)) throw error;
}

function isNonRecoverableToolError(
  value: unknown,
): value is NonRecoverableToolError {
  return (
    isObjectLike(value) &&
    (reflectApply(weakSetHas, sharedNonRecoverableToolErrors, [
      value,
    ]) as boolean)
  );
}

function createToolContractError(
  code: ToolContractErrorCode,
  message: string,
  options?: ErrorOptions,
): ToolContractError {
  const error = new ToolContractError(code, message, options);
  ownedToolContractErrors.add(error);
  return error;
}

function loadNonRecoverableToolErrorRegistry(): WeakSet<object> {
  const existing = Object.getOwnPropertyDescriptor(
    globalThis,
    nonRecoverableRegistryKey,
  );
  if (existing === undefined) {
    const errors = new WeakSet<object>();
    const registry = Object.freeze({
      version: 1 as const,
      errors,
    });
    Object.defineProperty(globalThis, nonRecoverableRegistryKey, {
      configurable: false,
      enumerable: false,
      value: registry,
      writable: false,
    });
    return errors;
  }

  if (
    existing.configurable !== false ||
    existing.writable !== false ||
    !isObjectLike(existing.value) ||
    !Object.isFrozen(existing.value)
  ) {
    throw new TypeError(
      "Shared NonRecoverableToolError registry has an invalid shape",
    );
  }
  const version = Object.getOwnPropertyDescriptor(existing.value, "version");
  const errors = Object.getOwnPropertyDescriptor(existing.value, "errors");
  if (
    version === undefined ||
    !("value" in version) ||
    version.value !== 1 ||
    errors === undefined ||
    !("value" in errors) ||
    !isWeakSet(errors.value)
  ) {
    throw new TypeError(
      "Shared NonRecoverableToolError registry has incompatible data",
    );
  }
  return errors.value;
}

function isWeakSet(value: unknown): value is WeakSet<object> {
  if (!isObjectLike(value)) return false;
  try {
    reflectApply(weakSetHas, value, [{}]);
    return true;
  } catch {
    return false;
  }
}

function failureMessage(error: unknown, fallback: string): string {
  if (typeof error === "string" && error.length > 0) return error;
  if (!isObjectLike(error)) return fallback;

  try {
    const descriptor = Object.getOwnPropertyDescriptor(error, "message");
    if (
      descriptor !== undefined &&
      "value" in descriptor &&
      typeof descriptor.value === "string" &&
      descriptor.value.length > 0
    ) {
      return descriptor.value;
    }
  } catch {
    return fallback;
  }
  return fallback;
}

function readOwn(value: object, key: PropertyKey): unknown {
  if (!Object.hasOwn(value, key)) {
    throw new TypeError(`Expected own property ${String(key)}`);
  }
  return Reflect.get(value, key);
}

function isObjectLike(value: unknown): value is object {
  return (
    (typeof value === "object" && value !== null) || typeof value === "function"
  );
}

function isCourseJsonObjectCandidate(
  value: unknown,
): value is CourseJsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function throwIfAborted(signal: AbortSignal): void {
  if (!readSignalAborted(signal)) return;
  throw readSignalAbortReason(signal);
}

function waitForAbort<Value>(
  pending: Promise<Value>,
  signal: AbortSignal,
): Promise<Value> {
  return new Promise<Value>((resolve, reject) => {
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
        // Cleanup cannot replace the already selected terminal outcome.
      }
    };

    const settle = (outcome: "resolve" | "reject", value: Value | unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (outcome === "resolve") {
        resolve(value as Value);
      } else {
        reject(value);
      }
    };

    const onAbort = () => {
      let reason: unknown;
      try {
        reason = readSignalAbortReason(signal);
      } catch (error) {
        reason = error;
      }
      settle("reject", reason);
    };

    const observation = reflectApply(nativePromiseThen, pending, [
      (value: Value) => {
        try {
          if (readSignalAborted(signal)) {
            onAbort();
          } else {
            settle("resolve", value);
          }
        } catch (error) {
          settle("reject", error);
        }
      },
      (error: unknown) => {
        try {
          if (readSignalAborted(signal)) {
            onAbort();
          } else {
            settle("reject", error);
          }
        } catch (signalError) {
          settle("reject", signalError);
        }
      },
    ]) as Promise<void>;
    reflectApply(nativePromiseThen, observation, [undefined, ignoreSettlement]);

    try {
      if (readSignalAborted(signal)) {
        onAbort();
        return;
      }
      listening = true;
      Reflect.apply(eventTargetAddEventListener, signal, [
        "abort",
        onAbort,
        { once: true },
      ]);
      if (readSignalAborted(signal)) onAbort();
    } catch (error) {
      settle("reject", error);
    }
  });
}

function readSignalAborted(signal: AbortSignal): boolean {
  if (abortSignalAbortedGetter === undefined) {
    throw new TypeError("AbortSignal.aborted is unavailable");
  }
  return Reflect.apply(abortSignalAbortedGetter, signal, []) as boolean;
}

function readSignalAbortReason(signal: AbortSignal): unknown {
  if (abortSignalReasonGetter === undefined) {
    return new DOMException("The operation was aborted", "AbortError");
  }
  const reason = Reflect.apply(abortSignalReasonGetter, signal, []);
  return reason ?? new DOMException("The operation was aborted", "AbortError");
}
