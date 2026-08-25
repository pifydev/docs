import { assistantMessage, toolResultMessage } from "./messages";
import type {
  CourseJsonObject,
  CourseTool,
  CourseToolCall,
  CourseToolExecutionContext,
  CourseToolResultMessage,
} from "./protocol";

/** The serialized Tool-result cap, including the truncation marker. */
export const COURSE_TOOL_OUTPUT_CAP_CHARACTERS = 4096;
export const COURSE_TOOL_TRUNCATION_MARKER = "\n[Tool output truncated]";

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
  }
}

/** Throw this only for an invariant/programmer failure that must stop the run. */
export class NonRecoverableToolError extends Error {
  public readonly code = "NON_RECOVERABLE_TOOL_ERROR" as const;
  public readonly nonRecoverable = true as const;

  public constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "NonRecoverableToolError";
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
        throw new ToolContractError(
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
    throw new ToolContractError(
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
  try {
    rawValidation = tool.validate(toolCall.arguments);
  } catch (error) {
    propagateExceptionalFailure(error, signal);
    return createErrorResult(
      toolCall,
      "TOOL_VALIDATION_FAILED",
      failureMessage(error, "Tool validation failed"),
    );
  }
  throwIfAborted(signal);

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
    pendingOutput = Promise.resolve(tool.execute(validation.value, context));
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
  if (!Array.isArray(definitions)) {
    throw new ToolContractError(
      "INVALID_TOOL_BATCH",
      "Tool definitions must be an array",
    );
  }

  let length: unknown;
  try {
    length = Reflect.get(definitions, "length");
  } catch (cause) {
    throw new ToolContractError(
      "INVALID_TOOL_BATCH",
      "Tool definition batch length could not be inspected",
      { cause },
    );
  }
  if (!Number.isSafeInteger(length) || (length as number) < 0) {
    throw new ToolContractError(
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
      if (!hasEntry) {
        throw new ToolContractError(
          "INVALID_TOOL_BATCH",
          `Tool definition batch must not be sparse at index ${index}`,
        );
      }
      definition = Reflect.get(definitions, index);
    } catch (cause) {
      if (isToolContractError(cause)) throw cause;
      throw new ToolContractError(
        "INVALID_TOOL_BATCH",
        `Tool definition at index ${index} could not be inspected`,
        { cause },
      );
    }
    batch.push(snapshotToolDefinition(definition));
  }
  return batch;
}

function snapshotToolDefinition(value: unknown): RegisteredCourseTool {
  if (!isObjectLike(value)) {
    throw new ToolContractError(
      "INVALID_TOOL_DEFINITION",
      "Tool definition must be an object",
    );
  }

  const name = readOwnToolField(value, "name");
  const description = readOwnToolField(value, "description");
  const validate = readOwnToolField(value, "validate");
  const execute = readOwnToolField(value, "execute");
  if (typeof name !== "string" || name.trim().length === 0) {
    throw new ToolContractError(
      "INVALID_TOOL_DEFINITION",
      "Tool name must be a non-empty string",
    );
  }
  if (typeof description !== "string" || description.trim().length === 0) {
    throw new ToolContractError(
      "INVALID_TOOL_DEFINITION",
      `Tool "${name}" description must be a non-empty string`,
    );
  }
  if (typeof validate !== "function") {
    throw new ToolContractError(
      "INVALID_TOOL_DEFINITION",
      `Tool "${name}" validate must be a function`,
    );
  }
  if (typeof execute !== "function") {
    throw new ToolContractError(
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
  try {
    if (!Object.hasOwn(definition, key)) {
      throw new ToolContractError(
        "INVALID_TOOL_DEFINITION",
        `Tool definition must have an own ${key} field`,
      );
    }
    return Reflect.get(definition, key);
  } catch (cause) {
    if (isToolContractError(cause)) throw cause;
    throw new ToolContractError(
      "INVALID_TOOL_DEFINITION",
      `Tool definition ${key} could not be inspected`,
      { cause },
    );
  }
}

function snapshotToolCall(value: unknown): CourseToolCall {
  if (!isObjectLike(value)) {
    throw new ToolContractError(
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
    throw new ToolContractError(
      "INVALID_TOOL_CALL",
      "Tool call fields could not be inspected",
      { cause },
    );
  }

  if (type !== "toolCall") {
    throw new ToolContractError(
      "INVALID_TOOL_CALL",
      'Tool call type must be "toolCall"',
    );
  }
  if (typeof id !== "string" || id.trim().length === 0) {
    throw new ToolContractError(
      "INVALID_TOOL_CALL",
      "Tool call ID must be a non-empty string",
    );
  }
  if (typeof name !== "string" || name.trim().length === 0) {
    throw new ToolContractError(
      "INVALID_TOOL_CALL",
      "Tool call name must be a non-empty string",
    );
  }
  if (!isCourseJsonObjectCandidate(argumentsValue)) {
    throw new ToolContractError(
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
    throw new ToolContractError(
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
    content: truncateOutput(content),
    isError,
  });
}

function serializeSafely(value: unknown): string {
  return serializeValue(value, new WeakSet<object>());
}

function serializeValue(value: unknown, ancestors: WeakSet<object>): string {
  if (value === null) return "null";
  if (typeof value === "string") return quote(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    return Number.isFinite(value) ? quoteNumber(value) : "null";
  }
  if (typeof value === "bigint") return quote(`${value}n`);
  if (typeof value === "undefined") return quote("[Undefined]");
  if (typeof value === "symbol") return quote("[Symbol]");
  if (typeof value === "function") return quote("[Function]");

  if (ancestors.has(value)) return quote("[Circular]");
  ancestors.add(value);
  try {
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (Array.isArray(value)) {
      return serializeArray(descriptors, ancestors);
    }
    return serializeObject(descriptors, ancestors);
  } finally {
    ancestors.delete(value);
  }
}

function serializeArray(
  descriptors: PropertyDescriptorMap,
  ancestors: WeakSet<object>,
): string {
  const length = descriptors.length?.value;
  if (!Number.isSafeInteger(length) || (length as number) < 0) {
    throw new TypeError("Tool output array has an invalid length");
  }

  const items: string[] = [];
  for (let index = 0; index < length; index += 1) {
    const descriptor = descriptors[String(index)];
    if (descriptor === undefined) {
      items.push(quote("[Empty]"));
    } else if ("value" in descriptor) {
      items.push(serializeValue(descriptor.value, ancestors));
    } else {
      items.push(quote("[Accessor omitted]"));
    }
  }
  return `[${items.join(",")}]`;
}

function serializeObject(
  descriptors: PropertyDescriptorMap,
  ancestors: WeakSet<object>,
): string {
  const keys = Object.keys(descriptors)
    .filter((key) => descriptors[key].enumerable === true)
    .sort();
  const fields: string[] = [];
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    const descriptor = descriptors[key];
    const serialized =
      "value" in descriptor
        ? serializeValue(descriptor.value, ancestors)
        : quote("[Accessor omitted]");
    fields.push(`${quote(key)}:${serialized}`);
  }
  return `{${fields.join(",")}}`;
}

function quote(value: string): string {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) {
    throw new TypeError("A string could not be serialized");
  }
  return serialized;
}

function quoteNumber(value: number): string {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) {
    throw new TypeError("A number could not be serialized");
  }
  return serialized;
}

function truncateOutput(value: string): string {
  if (countUnicodeCharacters(value) <= COURSE_TOOL_OUTPUT_CAP_CHARACTERS) {
    return value;
  }

  const prefixLimit =
    COURSE_TOOL_OUTPUT_CAP_CHARACTERS -
    countUnicodeCharacters(COURSE_TOOL_TRUNCATION_MARKER);
  let prefixEnd = 0;
  let count = 0;
  while (prefixEnd < value.length && count < prefixLimit) {
    const first = value.charCodeAt(prefixEnd);
    const isHighSurrogate = first >= 0xd800 && first <= 0xdbff;
    const second = value.charCodeAt(prefixEnd + 1);
    const hasLowSurrogate = second >= 0xdc00 && second <= 0xdfff;
    prefixEnd += isHighSurrogate && hasLowSurrogate ? 2 : 1;
    count += 1;
  }
  return value.slice(0, prefixEnd) + COURSE_TOOL_TRUNCATION_MARKER;
}

function countUnicodeCharacters(value: string): number {
  let count = 0;
  let index = 0;
  while (index < value.length) {
    const first = value.charCodeAt(index);
    const isHighSurrogate = first >= 0xd800 && first <= 0xdbff;
    const second = value.charCodeAt(index + 1);
    const hasLowSurrogate = second >= 0xdc00 && second <= 0xdfff;
    index += isHighSurrogate && hasLowSurrogate ? 2 : 1;
    count += 1;
  }
  return count;
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
  try {
    return value instanceof NonRecoverableToolError;
  } catch {
    return false;
  }
}

function isToolContractError(value: unknown): value is ToolContractError {
  try {
    return value instanceof ToolContractError;
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
