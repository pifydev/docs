import type {
  CourseAssistantBlock,
  CourseAssistantMessage,
  CourseJsonObject,
  CourseJsonValue,
  CourseMessageId,
  CourseToolCallId,
  CourseToolResultMessage,
  CourseUserMessage,
} from "./protocol";

export type UserMessageInput = Readonly<{
  id: CourseMessageId;
  content: string;
}>;

export type AssistantMessageInput = Readonly<{
  id: CourseMessageId;
  content: readonly CourseAssistantBlock[];
}>;

export type ToolResultMessageInput = Readonly<{
  id: CourseMessageId;
  toolCallId: CourseToolCallId;
  toolName: string;
  content: string;
  isError?: boolean;
}>;

export type TranscriptValidationErrorCode =
  | "INVALID_TRANSCRIPT"
  | "INVALID_MESSAGE"
  | "DUPLICATE_TOOL_CALL_ID"
  | "DUPLICATE_TOOL_RESULT"
  | "ORPHAN_TOOL_RESULT"
  | "TOOL_RESULT_BEFORE_CALL"
  | "MISSING_TOOL_RESULT"
  | "TOOL_NAME_MISMATCH"
  | "EMPTY_TOOL_NAME"
  | "INVALID_TOOL_ARGUMENTS";

export type TranscriptValidationError = Readonly<{
  code: TranscriptValidationErrorCode;
  messageIndex: number;
  message: string;
}>;

type ObservedToolCall = Readonly<{
  id: CourseToolCallId;
  name: string;
  messageIndex: number;
}>;

type ObservedToolResult = Readonly<{
  toolCallId: CourseToolCallId;
  toolName: string;
  messageIndex: number;
}>;

type ObservedToolResultGroup = {
  readonly results: ObservedToolResult[];
  latestMessageIndex: number;
};

type TranscriptState = Readonly<{
  errors: TranscriptValidationError[];
  callsById: Map<CourseToolCallId, ObservedToolCall[]>;
  resultsByCallId: Map<CourseToolCallId, ObservedToolResultGroup>;
  malformedCallIds: Set<CourseToolCallId>;
  malformedResultCallIds: Set<CourseToolCallId>;
}>;

export function userMessage(input: UserMessageInput): CourseUserMessage {
  const id = input.id;
  const content = input.content;
  assertNonEmptyString(id, "userMessage: id");
  assertString(content, "userMessage: content");
  return Object.freeze({ id, role: "user", content });
}

export function assistantMessage(
  input: AssistantMessageInput,
): CourseAssistantMessage {
  const id = input.id;
  const inputContent = input.content;
  assertNonEmptyString(id, "assistantMessage: id");
  if (!Array.isArray(inputContent)) {
    throw new TypeError("assistantMessage: content must be an array");
  }

  const contentLength = snapshotArrayLength(
    inputContent,
    "assistantMessage: content",
  );
  const content: CourseAssistantBlock[] = [];
  for (let blockIndex = 0; blockIndex < contentLength; blockIndex += 1) {
    if (!Object.hasOwn(inputContent, blockIndex)) {
      throw new TypeError(
        `assistantMessage: content[${blockIndex}] must not be sparse`,
      );
    }
    const block = inputContent[blockIndex];
    content.push(snapshotAssistantBlock(block, blockIndex));
  }

  return Object.freeze({
    id,
    role: "assistant",
    content: Object.freeze(content),
  });
}

export function toolResultMessage(
  input: ToolResultMessageInput,
): CourseToolResultMessage {
  const id = input.id;
  const toolCallId = input.toolCallId;
  const toolName = input.toolName;
  const content = input.content;
  const inputIsError = input.isError;

  assertNonEmptyString(id, "toolResultMessage: id");
  assertNonEmptyString(toolCallId, "toolResultMessage: toolCallId");
  assertNonEmptyString(toolName, "toolResultMessage: toolName");
  assertString(content, "toolResultMessage: content");
  const isError = inputIsError ?? false;
  if (typeof isError !== "boolean") {
    throw new TypeError("toolResultMessage: isError must be a boolean");
  }

  return Object.freeze({
    id,
    role: "toolResult",
    toolCallId,
    toolName,
    content,
    isError,
  });
}

export function textFromAssistant(message: CourseAssistantMessage): string {
  const content = message.content;
  const contentLength = snapshotArrayLength(
    content,
    "textFromAssistant: content",
  );
  let text = "";
  for (let blockIndex = 0; blockIndex < contentLength; blockIndex += 1) {
    if (!Object.hasOwn(content, blockIndex)) {
      throw new TypeError(
        `textFromAssistant: content[${blockIndex}] must not be sparse`,
      );
    }
    const block = content[blockIndex];
    const blockType = block.type;
    if (blockType === "text") {
      const blockText = block.text;
      text += blockText;
    }
  }
  return text;
}

/** Inspect untrusted transcript data without throwing. */
export function validateTranscript(
  transcript: unknown,
): readonly TranscriptValidationError[] {
  try {
    if (!Array.isArray(transcript)) {
      return freezeErrors([
        error("INVALID_TRANSCRIPT", -1, "Transcript must be an array"),
      ]);
    }
    const transcriptLength = snapshotArrayLength(transcript, "Transcript");
    return inspectTranscript(transcript, transcriptLength);
  } catch {
    return freezeErrors([
      error(
        "INVALID_TRANSCRIPT",
        -1,
        "Transcript could not be inspected safely",
      ),
    ]);
  }
}

function inspectTranscript(
  transcript: readonly unknown[],
  transcriptLength: number,
): readonly TranscriptValidationError[] {
  const state: TranscriptState = {
    errors: [],
    callsById: new Map(),
    resultsByCallId: new Map(),
    malformedCallIds: new Set(),
    malformedResultCallIds: new Set(),
  };

  for (
    let messageIndex = 0;
    messageIndex < transcriptLength;
    messageIndex += 1
  ) {
    try {
      if (!Object.hasOwn(transcript, messageIndex)) {
        addError(
          state.errors,
          "INVALID_MESSAGE",
          messageIndex,
          "Transcript entry must not be sparse",
        );
        continue;
      }
      const message = transcript[messageIndex];
      inspectMessage(message, messageIndex, state);
    } catch {
      addError(
        state.errors,
        "INVALID_MESSAGE",
        messageIndex,
        "Transcript entry could not be inspected safely",
      );
    }
  }

  inspectLinkage(state);
  return freezeErrors(state.errors);
}

function inspectMessage(
  value: unknown,
  messageIndex: number,
  state: TranscriptState,
): void {
  if (!isRecord(value)) {
    addError(
      state.errors,
      "INVALID_MESSAGE",
      messageIndex,
      "Transcript entry must be a message object",
    );
    return;
  }

  const role = value.role;
  const id = value.id;
  if (typeof role !== "string") {
    addError(
      state.errors,
      "INVALID_MESSAGE",
      messageIndex,
      "Message role must be a string",
    );
    return;
  }
  if (!isNonEmptyString(id)) {
    addError(
      state.errors,
      "INVALID_MESSAGE",
      messageIndex,
      "Message ID must be a non-empty string",
    );
    return;
  }

  if (role === "user") {
    const content = value.content;
    if (typeof content !== "string") {
      addError(
        state.errors,
        "INVALID_MESSAGE",
        messageIndex,
        "User message content must be a string",
      );
    }
    return;
  }

  if (role === "assistant") {
    const content = value.content;
    inspectAssistantContent(content, messageIndex, state);
    return;
  }

  if (role === "toolResult") {
    inspectToolResult(value, messageIndex, state);
    return;
  }

  addError(
    state.errors,
    "INVALID_MESSAGE",
    messageIndex,
    `Unsupported message role "${role}"`,
  );
}

function inspectAssistantContent(
  value: unknown,
  messageIndex: number,
  state: TranscriptState,
): void {
  if (!Array.isArray(value)) {
    addError(
      state.errors,
      "INVALID_MESSAGE",
      messageIndex,
      "Assistant message content must be an array",
    );
    return;
  }

  const contentLength = snapshotArrayLength(value, "Assistant message content");
  for (let blockIndex = 0; blockIndex < contentLength; blockIndex += 1) {
    try {
      if (!Object.hasOwn(value, blockIndex)) {
        addError(
          state.errors,
          "INVALID_MESSAGE",
          messageIndex,
          `Assistant content[${blockIndex}] must not be sparse`,
        );
        continue;
      }
      const block = value[blockIndex];
      inspectAssistantBlock(block, blockIndex, messageIndex, state);
    } catch {
      addError(
        state.errors,
        "INVALID_MESSAGE",
        messageIndex,
        `Assistant content[${blockIndex}] could not be inspected safely`,
      );
    }
  }
}

function inspectAssistantBlock(
  value: unknown,
  blockIndex: number,
  messageIndex: number,
  state: TranscriptState,
): void {
  let callId: CourseToolCallId | undefined;
  try {
    if (!isRecord(value)) {
      addError(
        state.errors,
        "INVALID_MESSAGE",
        messageIndex,
        `Assistant content[${blockIndex}] must be an object`,
      );
      return;
    }

    const blockType = value.type;
    if (blockType === "text") {
      const text = value.text;
      if (typeof text !== "string") {
        addError(
          state.errors,
          "INVALID_MESSAGE",
          messageIndex,
          `Assistant content[${blockIndex}].text must be a string`,
        );
      }
      return;
    }

    if (blockType !== "toolCall") {
      addError(
        state.errors,
        "INVALID_MESSAGE",
        messageIndex,
        `Assistant content[${blockIndex}] has an unsupported type`,
      );
      return;
    }

    const rawCallId = value.id;
    callId = isNonEmptyString(rawCallId) ? rawCallId : undefined;
    const rawName = value.name;
    const argumentsValue = value.arguments;
    const callName = isNonEmptyString(rawName) ? rawName : undefined;
    let valid = true;

    if (callId === undefined) {
      valid = false;
      addError(
        state.errors,
        "INVALID_MESSAGE",
        messageIndex,
        "Tool call ID must be a non-empty string",
      );
    }
    if (callName === undefined) {
      valid = false;
      addError(
        state.errors,
        "EMPTY_TOOL_NAME",
        messageIndex,
        "Tool call name must be a non-empty string",
      );
    }
    if (!isValidJsonObject(argumentsValue)) {
      valid = false;
      addError(
        state.errors,
        "INVALID_TOOL_ARGUMENTS",
        messageIndex,
        "Tool call arguments must be a non-null JSON object and not an array",
      );
    }

    if (callId === undefined) return;
    if (!valid || callName === undefined) {
      state.malformedCallIds.add(callId);
      return;
    }

    const call: ObservedToolCall = {
      id: callId,
      name: callName,
      messageIndex,
    };
    const priorCalls = state.callsById.get(callId);
    if (priorCalls === undefined) {
      state.callsById.set(callId, [call]);
    } else {
      addError(
        state.errors,
        "DUPLICATE_TOOL_CALL_ID",
        messageIndex,
        `Tool call ID "${callId}" is not unique`,
      );
      priorCalls.push(call);
    }
  } catch (cause) {
    if (callId !== undefined) state.malformedCallIds.add(callId);
    throw cause;
  }
}

function inspectToolResult(
  value: Record<string, unknown>,
  messageIndex: number,
  state: TranscriptState,
): void {
  let toolCallId: CourseToolCallId | undefined;
  try {
    const rawToolCallId = value.toolCallId;
    toolCallId = isNonEmptyString(rawToolCallId) ? rawToolCallId : undefined;
    const rawToolName = value.toolName;
    const content = value.content;
    const isError = value.isError;
    const toolName = isNonEmptyString(rawToolName) ? rawToolName : undefined;
    let valid = true;

    if (toolCallId === undefined) {
      valid = false;
      addError(
        state.errors,
        "INVALID_MESSAGE",
        messageIndex,
        "Tool result call ID must be a non-empty string",
      );
    }
    if (toolName === undefined) {
      valid = false;
      addError(
        state.errors,
        "EMPTY_TOOL_NAME",
        messageIndex,
        "Tool result name must be a non-empty string",
      );
    }
    if (typeof content !== "string") {
      valid = false;
      addError(
        state.errors,
        "INVALID_MESSAGE",
        messageIndex,
        "Tool result content must be a string",
      );
    }
    if (typeof isError !== "boolean") {
      valid = false;
      addError(
        state.errors,
        "INVALID_MESSAGE",
        messageIndex,
        "Tool result isError must be a boolean",
      );
    }

    if (toolCallId === undefined) return;
    if (!valid || toolName === undefined) {
      state.malformedResultCallIds.add(toolCallId);
      return;
    }

    const result: ObservedToolResult = {
      toolCallId,
      toolName,
      messageIndex,
    };
    const group = state.resultsByCallId.get(toolCallId);
    if (group === undefined) {
      state.resultsByCallId.set(toolCallId, {
        results: [result],
        latestMessageIndex: messageIndex,
      });
    } else {
      addError(
        state.errors,
        "DUPLICATE_TOOL_RESULT",
        messageIndex,
        `Tool call "${toolCallId}" has more than one result`,
      );
      group.results.push(result);
      group.latestMessageIndex = Math.max(
        group.latestMessageIndex,
        messageIndex,
      );
    }
  } catch (cause) {
    if (toolCallId !== undefined) {
      state.malformedResultCallIds.add(toolCallId);
    }
    throw cause;
  }
}

function inspectLinkage(state: TranscriptState): void {
  for (const [toolCallId, resultGroup] of state.resultsByCallId) {
    const calls = state.callsById.get(toolCallId);
    if (calls === undefined) {
      if (state.malformedCallIds.has(toolCallId)) continue;
      const resultCount = resultGroup.results.length;
      for (let resultIndex = 0; resultIndex < resultCount; resultIndex += 1) {
        const result = resultGroup.results[resultIndex];
        addError(
          state.errors,
          "ORPHAN_TOOL_RESULT",
          result.messageIndex,
          `Tool result references unknown call ID "${toolCallId}"`,
        );
      }
      continue;
    }

    if (calls.length !== 1 || state.malformedCallIds.has(toolCallId)) continue;
    const call = calls[0];
    const resultCount = resultGroup.results.length;
    for (let resultIndex = 0; resultIndex < resultCount; resultIndex += 1) {
      const result = resultGroup.results[resultIndex];
      if (result.messageIndex <= call.messageIndex) {
        addError(
          state.errors,
          "TOOL_RESULT_BEFORE_CALL",
          result.messageIndex,
          `Tool result for "${toolCallId}" appears before its call`,
        );
      } else if (result.toolName !== call.name) {
        addError(
          state.errors,
          "TOOL_NAME_MISMATCH",
          result.messageIndex,
          `Tool result name "${result.toolName}" does not match call name "${call.name}"`,
        );
      }
    }
  }

  for (const [toolCallId, calls] of state.callsById) {
    if (calls.length !== 1 || state.malformedCallIds.has(toolCallId)) continue;
    const call = calls[0];
    const latestResultIndex =
      state.resultsByCallId.get(toolCallId)?.latestMessageIndex;
    const hasLaterResult =
      latestResultIndex !== undefined && latestResultIndex > call.messageIndex;
    if (!hasLaterResult && !state.malformedResultCallIds.has(toolCallId)) {
      addError(
        state.errors,
        "MISSING_TOOL_RESULT",
        call.messageIndex,
        `Tool call "${toolCallId}" has no later result`,
      );
    }
  }
}

function snapshotAssistantBlock(
  value: unknown,
  blockIndex: number,
): CourseAssistantBlock {
  if (!isRecord(value)) {
    throw new TypeError(
      `assistantMessage: content[${blockIndex}] must be an object`,
    );
  }

  const blockType = value.type;
  if (blockType === "text") {
    const text = value.text;
    assertString(text, `assistantMessage: content[${blockIndex}].text`);
    return Object.freeze({ type: "text", text });
  }
  if (blockType !== "toolCall") {
    throw new TypeError(
      `assistantMessage: content[${blockIndex}].type must be "text" or "toolCall"`,
    );
  }

  const id = value.id;
  const name = value.name;
  const argumentsValue = value.arguments;
  assertNonEmptyString(id, `assistantMessage: content[${blockIndex}].id`);
  assertNonEmptyString(name, `assistantMessage: content[${blockIndex}].name`);
  if (!isRecord(argumentsValue)) {
    throw new TypeError(
      `assistantMessage: content[${blockIndex}].arguments must be a non-null object and not an array`,
    );
  }

  return Object.freeze({
    type: "toolCall",
    id,
    name,
    arguments: snapshotJsonObject(
      argumentsValue,
      `assistantMessage: content[${blockIndex}].arguments`,
      new WeakSet(),
    ),
  });
}

function snapshotJsonObject(
  value: Record<string, unknown>,
  path: string,
  ancestors: WeakSet<object>,
): CourseJsonObject {
  if (!hasJsonObjectPrototype(value)) {
    throw new TypeError(`${path} must contain only JSON objects and arrays`);
  }
  if (ancestors.has(value)) {
    throw new TypeError(`${path} must not contain circular references`);
  }
  ancestors.add(value);

  try {
    const keys = Object.keys(value);
    const keyCount = keys.length;
    const snapshot: Record<string, CourseJsonValue> = {};
    for (let keyIndex = 0; keyIndex < keyCount; keyIndex += 1) {
      const key = keys[keyIndex];
      const item = value[key];
      Object.defineProperty(snapshot, key, {
        configurable: false,
        enumerable: true,
        value: snapshotJsonValue(item, `${path}.${key}`, ancestors),
        writable: false,
      });
    }
    return Object.freeze(snapshot);
  } finally {
    ancestors.delete(value);
  }
}

function snapshotJsonValue(
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
  if (Array.isArray(value)) {
    return snapshotJsonArray(value, path, ancestors);
  }
  if (isRecord(value)) {
    return snapshotJsonObject(value, path, ancestors);
  }
  throw new TypeError(`${path} must contain only JSON-compatible values`);
}

function snapshotJsonArray(
  value: readonly unknown[],
  path: string,
  ancestors: WeakSet<object>,
): readonly CourseJsonValue[] {
  if (ancestors.has(value)) {
    throw new TypeError(`${path} must not contain circular references`);
  }
  ancestors.add(value);

  try {
    const itemCount = snapshotArrayLength(value, path);
    const snapshot: CourseJsonValue[] = [];
    for (let itemIndex = 0; itemIndex < itemCount; itemIndex += 1) {
      if (!Object.hasOwn(value, itemIndex)) {
        throw new TypeError(`${path}[${itemIndex}] must not be sparse`);
      }
      const item = value[itemIndex];
      snapshot.push(
        snapshotJsonValue(item, `${path}[${itemIndex}]`, ancestors),
      );
    }
    return Object.freeze(snapshot);
  } finally {
    ancestors.delete(value);
  }
}

function isValidJsonObject(value: unknown): boolean {
  if (!isRecord(value)) return false;
  try {
    snapshotJsonObject(value, "Tool call arguments", new WeakSet());
    return true;
  } catch {
    return false;
  }
}

function snapshotArrayLength(value: readonly unknown[], path: string): number {
  const length = value.length;
  if (!Number.isSafeInteger(length) || length < 0) {
    throw new TypeError(`${path} length must be a non-negative integer`);
  }
  return length;
}

function hasJsonObjectPrototype(value: object): boolean {
  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
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
  if (!isNonEmptyString(value)) {
    throw new TypeError(`${path} must be a non-empty string`);
  }
}

function addError(
  errors: TranscriptValidationError[],
  code: TranscriptValidationErrorCode,
  messageIndex: number,
  message: string,
): void {
  errors.push(error(code, messageIndex, message));
}

function error(
  code: TranscriptValidationErrorCode,
  messageIndex: number,
  message: string,
): TranscriptValidationError {
  return Object.freeze({ code, messageIndex, message });
}

function freezeErrors(
  errors: readonly TranscriptValidationError[],
): readonly TranscriptValidationError[] {
  return Object.freeze([...errors]);
}
