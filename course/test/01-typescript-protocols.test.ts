import { expect, test } from "vitest";

import {
  assertNever,
  type AgentEvent,
  type CourseAssistantBlock,
  type CourseJsonArray,
  type CourseJsonObject,
  type CourseMessage,
  type CourseModelChunk,
  type CourseModelRequest,
  type CourseModelResponse,
  type CourseTool,
  type CourseToolCall,
  type FailedRunResult,
  type RunResult,
} from "../src/index";

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <
    Value,
  >() => Value extends Right ? 1 : 2
    ? true
    : false;
type Expect<Value extends true> = Value;

type MessageRoles = CourseMessage["role"];
type AssistantBlockTypes = CourseAssistantBlock["type"];
type ModelChunkTypes = CourseModelChunk["type"];
type EventTypes = AgentEvent["type"];
type RunStatuses = RunResult["status"];

const protocolTypeChecks: readonly [
  Expect<Equal<MessageRoles, "user" | "assistant" | "toolResult">>,
  Expect<Equal<AssistantBlockTypes, "text" | "toolCall">>,
  Expect<Equal<ModelChunkTypes, "textDelta" | "toolCall">>,
  Expect<
    Equal<
      EventTypes,
      | "message.accepted"
      | "model.chunk"
      | "tool.started"
      | "tool.finished"
      | "run.finished"
    >
  >,
  Expect<Equal<RunStatuses, "completed" | "cancelled" | "maxSteps" | "failed">>,
] = [true, true, true, true, true];

const userMessage: CourseMessage = {
  id: "message-user-001",
  role: "user",
  content: "Add 20 and 22.",
};

const assistantMessage: CourseMessage = {
  id: "message-assistant-001",
  role: "assistant",
  content: [
    { type: "text", text: "I will use the add Tool." },
    {
      type: "toolCall",
      id: "call-add-001",
      name: "add",
      arguments: { left: 20, right: 22 },
    },
  ],
};

const toolResultMessage: CourseMessage = {
  id: "message-tool-001",
  role: "toolResult",
  toolCallId: "call-add-001",
  toolName: "add",
  content: "42",
  isError: false,
};

const request: CourseModelRequest = {
  id: "request-001",
  messages: [userMessage, assistantMessage, toolResultMessage],
};

const chunks: readonly CourseModelChunk[] = [
  {
    type: "textDelta",
    requestId: request.id,
    delta: "The sum ",
  },
  {
    type: "toolCall",
    requestId: request.id,
    toolCall: {
      type: "toolCall",
      id: "call-add-002",
      name: "add",
      arguments: { left: 20, right: 22 },
    },
  },
];

const response: CourseModelResponse = {
  id: "response-001",
  requestId: request.id,
  message: {
    id: "message-assistant-002",
    role: "assistant",
    content: [{ type: "text", text: "The sum is 42." }],
  },
  stopReason: "stop",
  usage: { inputTokens: 20, outputTokens: 6 },
};

const addTool: CourseTool<
  Readonly<{ left: number; right: number }>,
  Readonly<{ sum: number }>
> = {
  name: "add",
  description: "Add two numbers.",
  validate(input) {
    if (
      typeof input === "object" &&
      input !== null &&
      "left" in input &&
      typeof input.left === "number" &&
      "right" in input &&
      typeof input.right === "number"
    ) {
      return { ok: true, value: { left: input.left, right: input.right } };
    }

    return { ok: false, error: "left and right must be numbers" };
  },
  async execute(input) {
    return { sum: input.left + input.right };
  },
};

function describeMessage(message: CourseMessage): string {
  switch (message.role) {
    case "user":
      return message.content;
    case "assistant":
      return message.content.map(describeAssistantBlock).join("");
    case "toolResult":
      return `${message.toolName}:${message.content}`;
    default:
      return assertNever(message);
  }
}

function describeAssistantBlock(block: CourseAssistantBlock): string {
  switch (block.type) {
    case "text":
      return block.text;
    case "toolCall":
      return `${block.name}:${block.id}`;
    default:
      return assertNever(block);
  }
}

function describeChunk(chunk: CourseModelChunk): string {
  switch (chunk.type) {
    case "textDelta":
      return chunk.delta;
    case "toolCall":
      return chunk.toolCall.id;
    default:
      return assertNever(chunk);
  }
}

function describeRun(result: RunResult): string {
  switch (result.status) {
    case "completed":
      return result.finalText;
    case "cancelled":
      return result.reason;
    case "maxSteps":
      return String(result.maxSteps);
    case "failed":
      return result.error.code;
    default:
      return assertNever(result);
  }
}

test("keeps message, model, event, and result discriminants stable at runtime", () => {
  expect(protocolTypeChecks).toEqual([true, true, true, true, true]);
  expect(describeMessage(userMessage)).toBe("Add 20 and 22.");
  expect(describeMessage(assistantMessage)).toContain("add:call-add-001");
  expect(describeMessage(toolResultMessage)).toBe("add:42");
  expect(chunks.map(describeChunk)).toEqual(["The sum ", "call-add-002"]);
  expect(response).toMatchObject({
    id: "response-001",
    requestId: "request-001",
    stopReason: "stop",
  });

  const events: readonly AgentEvent[] = [
    {
      type: "message.accepted",
      sequence: 0,
      payload: { message: userMessage },
    },
    {
      type: "model.chunk",
      sequence: 1,
      payload: { chunk: chunks[0] },
    },
    {
      type: "tool.started",
      sequence: 2,
      payload: {
        toolCall: {
          type: "toolCall",
          id: "call-add-001",
          name: "add",
          arguments: { left: 20, right: 22 },
        },
      },
    },
    {
      type: "tool.finished",
      sequence: 3,
      payload: { message: toolResultMessage },
    },
    {
      type: "run.finished",
      sequence: 4,
      payload: {
        result: {
          status: "completed",
          messages: request.messages,
          finalText: "The sum is 42.",
        },
      },
    },
  ];

  expect(events.map(({ type, sequence }) => ({ type, sequence }))).toEqual([
    { type: "message.accepted", sequence: 0 },
    { type: "model.chunk", sequence: 1 },
    { type: "tool.started", sequence: 2 },
    { type: "tool.finished", sequence: 3 },
    { type: "run.finished", sequence: 4 },
  ]);
});

test("requires Tool validation before async execution", async () => {
  const validation = addTool.validate({ left: 20, right: 22 });
  expect(validation.ok).toBe(true);

  if (!validation.ok) {
    throw new Error(validation.error);
  }

  await expect(
    addTool.execute(validation.value, {
      signal: new AbortController().signal,
      toolCallId: "call-add-001",
    }),
  ).resolves.toEqual({ sum: 42 });
});

test("narrows every terminal RunResult status exhaustively", () => {
  const messages = [userMessage] as const;
  const results: readonly RunResult[] = [
    { status: "completed", messages, finalText: "Done." },
    { status: "cancelled", messages, reason: "caller aborted" },
    { status: "maxSteps", messages, maxSteps: 4 },
    {
      status: "failed",
      messages,
      error: { code: "MODEL_FAILED", message: "model unavailable" },
    },
  ];

  expect(results.map(describeRun)).toEqual([
    "Done.",
    "caller aborted",
    "4",
    "MODEL_FAILED",
  ]);
});

test("assertNever fails closed when unvalidated input reaches an exhaustive branch", () => {
  expect(() => assertNever("unexpected" as never)).toThrow(
    "Unexpected protocol value: unexpected",
  );
});

// Compile-time regression assertions. This function is intentionally not
// called; `tsc` still proves that the protocol surface is readonly and closed.
function compileTimeChecks(): void {
  // @ts-expect-error Course messages expose immutable identities.
  userMessage.id = "message-user-002";

  // @ts-expect-error CourseMessage roles form a closed discriminated union.
  const invalidRole: CourseMessage["role"] = "system";
  void invalidRole;

  if (assistantMessage.role === "assistant") {
    // @ts-expect-error Assistant content is a readonly array.
    assistantMessage.content.push({ type: "text", text: "late mutation" });
    // @ts-expect-error Assistant content cannot be reassigned.
    assistantMessage.content = [];
  }

  // @ts-expect-error A model request exposes an immutable message snapshot.
  request.messages.push(userMessage);

  const acceptedEvent: AgentEvent = {
    type: "message.accepted",
    sequence: 0,
    payload: { message: userMessage },
  };
  // @ts-expect-error Event payload fields cannot be replaced.
  acceptedEvent.payload.message = toolResultMessage;

  const failedRun: FailedRunResult = {
    status: "failed",
    messages: [userMessage],
    error: { code: "MODEL_FAILED", message: "model unavailable" },
  };
  // @ts-expect-error Nested terminal error data is readonly.
  failedRun.error.code = "MUTATED";

  const immutableToolCall: CourseToolCall = {
    type: "toolCall",
    id: "call-readonly-001",
    name: "inspect",
    arguments: {
      path: "README.md",
      options: { lineNumbers: true },
      ranges: [1, 4, { label: "tail" }],
    },
  };
  // @ts-expect-error Tool-call argument objects are readonly at the top level.
  immutableToolCall.arguments.path = "LICENSE";

  const nestedOptions = immutableToolCall.arguments.options as CourseJsonObject;
  // @ts-expect-error Nested Tool-call argument objects remain readonly.
  nestedOptions.lineNumbers = false;

  const nestedRanges = immutableToolCall.arguments.ranges as CourseJsonArray;
  // @ts-expect-error Nested Tool-call argument arrays remain readonly.
  nestedRanges.push(8);

  const narrowValidationTool: CourseTool<Readonly<{ value: number }>> = {
    name: "narrow-validation",
    description: "Invalid validator parameter variance.",
    // @ts-expect-error Validation must accept unknown input before narrowing it.
    validate: (input: Readonly<{ value: number }>) => ({
      ok: true,
      value: input,
    }),
    execute: async () => undefined,
  };
  void narrowValidationTool;

  type DirectionInput =
    Readonly<{ direction: "left" }> | Readonly<{ direction: "right" }>;
  const narrowExecutionTool: CourseTool<DirectionInput> = {
    name: "narrow-execution",
    description: "Invalid execution parameter variance.",
    validate: () => ({ ok: false, error: "not relevant" }),
    // @ts-expect-error Execution must accept every member of its declared Input.
    execute: async (input: Readonly<{ direction: "left" }>) => input.direction,
  };
  void narrowExecutionTool;

  const synchronousTool: CourseTool = {
    name: "sync",
    description: "Invalid synchronous Tool.",
    validate: () => ({ ok: true, value: undefined }),
    // @ts-expect-error Tool execution must remain asynchronous.
    execute: () => undefined,
  };
  void synchronousTool;

  // @ts-expect-error RunResult is a closed terminal-status union.
  const invalidRun: RunResult = { status: "running", messages: [] };
  void invalidRun;
}

void compileTimeChecks;
