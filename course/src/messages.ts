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

export function userMessage(input: UserMessageInput): CourseUserMessage {
  assertNonEmptyString(input.id, "userMessage: id");
  assertString(input.content, "userMessage: content");
  return Object.freeze({ id: input.id, role: "user", content: input.content });
}

export function assistantMessage(
  input: AssistantMessageInput,
): CourseAssistantMessage {
  assertNonEmptyString(input.id, "assistantMessage: id");
  if (!Array.isArray(input.content)) {
    throw new TypeError("assistantMessage: content must be an array");
  }

  const content = input.content.map(snapshotAssistantBlock);
  return Object.freeze({
    id: input.id,
    role: "assistant",
    content: Object.freeze(content),
  });
}

export function toolResultMessage(
  input: ToolResultMessageInput,
): CourseToolResultMessage {
  assertNonEmptyString(input.id, "toolResultMessage: id");
  assertNonEmptyString(input.toolCallId, "toolResultMessage: toolCallId");
  assertNonEmptyString(input.toolName, "toolResultMessage: toolName");
  assertString(input.content, "toolResultMessage: content");
  const isError = input.isError ?? false;
  if (typeof isError !== "boolean") {
    throw new TypeError("toolResultMessage: isError must be a boolean");
  }

  return Object.freeze({
    id: input.id,
    role: "toolResult",
    toolCallId: input.toolCallId,
    toolName: input.toolName,
    content: input.content,
    isError,
  });
}

export function textFromAssistant(message: CourseAssistantMessage): string {
  return message.content
    .filter(
      (block): block is Extract<CourseAssistantBlock, { type: "text" }> =>
        block.type === "text",
    )
    .map(({ text }) => text)
    .join("");
}

/** Inspect untrusted transcript data without throwing. */
export function validateTranscript(
  transcript: unknown,
): readonly TranscriptValidationError[] {
  if (!Array.isArray(transcript)) {
    return freezeErrors([
      error("INVALID_TRANSCRIPT", -1, "Transcript must be an array"),
    ]);
  }

  try {
    return inspectTranscript(transcript);
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
): readonly TranscriptValidationError[] {
  const errors: TranscriptValidationError[] = [];
  const callsById = new Map<CourseToolCallId, ObservedToolCall[]>();
  const results: ObservedToolResult[] = [];

  for (const [messageIndex, message] of transcript.entries()) {
    if (!isRecord(message) || typeof message.role !== "string") {
      addError(
        errors,
        "INVALID_MESSAGE",
        messageIndex,
        "Transcript entry must be a message object",
      );
      continue;
    }

    if (message.role === "assistant") {
      inspectAssistant(message, messageIndex, callsById, errors);
    } else if (message.role === "toolResult") {
      inspectToolResult(message, messageIndex, results, errors);
    } else if (message.role !== "user") {
      addError(
        errors,
        "INVALID_MESSAGE",
        messageIndex,
        `Unsupported message role "${message.role}"`,
      );
    }
  }

  for (const result of results) {
    const calls = callsById.get(result.toolCallId);
    if (calls === undefined) {
      addError(
        errors,
        "ORPHAN_TOOL_RESULT",
        result.messageIndex,
        `Tool result references unknown call ID "${result.toolCallId}"`,
      );
      continue;
    }

    const call = calls.find(
      (candidate) => candidate.messageIndex < result.messageIndex,
    );
    if (call === undefined) {
      addError(
        errors,
        "TOOL_RESULT_BEFORE_CALL",
        result.messageIndex,
        `Tool result for "${result.toolCallId}" appears before its call`,
      );
    } else if (call.name !== result.toolName) {
      addError(
        errors,
        "TOOL_NAME_MISMATCH",
        result.messageIndex,
        `Tool result name "${result.toolName}" does not match call name "${call.name}"`,
      );
    }
  }

  for (const calls of callsById.values()) {
    for (const call of calls) {
      const hasLaterResult = results.some(
        (result) =>
          result.toolCallId === call.id &&
          result.messageIndex > call.messageIndex,
      );
      if (!hasLaterResult) {
        addError(
          errors,
          "MISSING_TOOL_RESULT",
          call.messageIndex,
          `Tool call "${call.id}" has no later result`,
        );
      }
    }
  }

  return freezeErrors(errors);
}

function inspectAssistant(
  message: Record<string, unknown>,
  messageIndex: number,
  callsById: Map<CourseToolCallId, ObservedToolCall[]>,
  errors: TranscriptValidationError[],
): void {
  if (!Array.isArray(message.content)) {
    addError(
      errors,
      "INVALID_MESSAGE",
      messageIndex,
      "Assistant message content must be an array",
    );
    return;
  }

  for (const block of message.content) {
    if (!isRecord(block) || block.type !== "toolCall") continue;

    if (typeof block.name !== "string" || block.name.trim().length === 0) {
      addError(
        errors,
        "EMPTY_TOOL_NAME",
        messageIndex,
        "Tool call name must be a non-empty string",
      );
    }
    if (!isValidJsonObject(block.arguments)) {
      addError(
        errors,
        "INVALID_TOOL_ARGUMENTS",
        messageIndex,
        "Tool call arguments must be a non-null JSON object and not an array",
      );
    }
    if (typeof block.id !== "string" || block.id.length === 0) {
      addError(
        errors,
        "INVALID_MESSAGE",
        messageIndex,
        "Tool call ID must be a non-empty string",
      );
      continue;
    }

    const call: ObservedToolCall = {
      id: block.id,
      name: typeof block.name === "string" ? block.name : "",
      messageIndex,
    };
    const priorCalls = callsById.get(call.id);
    if (priorCalls === undefined) {
      callsById.set(call.id, [call]);
    } else {
      addError(
        errors,
        "DUPLICATE_TOOL_CALL_ID",
        messageIndex,
        `Tool call ID "${call.id}" is not unique`,
      );
      priorCalls.push(call);
    }
  }
}

function inspectToolResult(
  message: Record<string, unknown>,
  messageIndex: number,
  results: ObservedToolResult[],
  errors: TranscriptValidationError[],
): void {
  if (
    typeof message.toolName !== "string" ||
    message.toolName.trim().length === 0
  ) {
    addError(
      errors,
      "EMPTY_TOOL_NAME",
      messageIndex,
      "Tool result name must be a non-empty string",
    );
  }
  if (
    typeof message.toolCallId !== "string" ||
    message.toolCallId.length === 0
  ) {
    addError(
      errors,
      "INVALID_MESSAGE",
      messageIndex,
      "Tool result call ID must be a non-empty string",
    );
    return;
  }

  results.push({
    toolCallId: message.toolCallId,
    toolName: typeof message.toolName === "string" ? message.toolName : "",
    messageIndex,
  });
}

function snapshotAssistantBlock(
  value: CourseAssistantBlock,
  blockIndex: number,
): CourseAssistantBlock {
  if (!isRecord(value)) {
    throw new TypeError(
      `assistantMessage: content[${blockIndex}] must be an object`,
    );
  }
  if (value.type === "text") {
    assertString(value.text, `assistantMessage: content[${blockIndex}].text`);
    return Object.freeze({ type: "text", text: value.text });
  }
  if (value.type !== "toolCall") {
    throw new TypeError(
      `assistantMessage: content[${blockIndex}].type must be "text" or "toolCall"`,
    );
  }

  assertNonEmptyString(value.id, `assistantMessage: content[${blockIndex}].id`);
  assertNonEmptyString(
    value.name,
    `assistantMessage: content[${blockIndex}].name`,
  );
  if (!isRecord(value.arguments)) {
    throw new TypeError(
      `assistantMessage: content[${blockIndex}].arguments must be a non-null object and not an array`,
    );
  }

  return Object.freeze({
    type: "toolCall",
    id: value.id,
    name: value.name,
    arguments: snapshotJsonObject(
      value.arguments,
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
    const entries = Object.entries(value).map(
      ([key, item]) =>
        [key, snapshotJsonValue(item, `${path}.${key}`, ancestors)] as const,
    );
    return Object.freeze(Object.fromEntries(entries) as CourseJsonObject);
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
    if (ancestors.has(value)) {
      throw new TypeError(`${path} must not contain circular references`);
    }
    ancestors.add(value);
    try {
      return Object.freeze(
        value.map((item, index) =>
          snapshotJsonValue(item, `${path}[${index}]`, ancestors),
        ),
      );
    } finally {
      ancestors.delete(value);
    }
  }
  if (isRecord(value)) {
    return snapshotJsonObject(value, path, ancestors);
  }
  throw new TypeError(`${path} must contain only JSON-compatible values`);
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

function hasJsonObjectPrototype(value: object): boolean {
  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
