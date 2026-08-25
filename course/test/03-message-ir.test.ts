import { expect, test } from "vitest";

import {
  assistantMessage,
  textFromAssistant,
  toolResultMessage,
  userMessage,
  validateTranscript,
  type CourseAssistantBlock,
  type CourseMessage,
  type TranscriptValidationErrorCode,
} from "../src/index";

function errorCodes(
  transcript: unknown,
): readonly TranscriptValidationErrorCode[] {
  return validateTranscript(transcript).map(({ code }) => code);
}

test("constructs a valid Tool round-trip and extracts only assistant text", () => {
  const transcript = [
    userMessage({ id: "message-user-001", content: "Read package.json." }),
    assistantMessage({
      id: "message-assistant-001",
      content: [
        { type: "text", text: "I will inspect it. " },
        {
          type: "toolCall",
          id: "call-read-001",
          name: "read",
          arguments: { path: "package.json" },
        },
        { type: "text", text: "Then I will summarize it." },
      ],
    }),
    toolResultMessage({
      id: "message-tool-001",
      toolCallId: "call-read-001",
      toolName: "read",
      content: '{"name":"pify-docs"}',
      isError: false,
    }),
  ] as const;

  expect(validateTranscript(transcript)).toEqual([]);
  expect(textFromAssistant(transcript[1])).toBe(
    "I will inspect it. Then I will summarize it.",
  );
  expect(transcript).toMatchObject([
    { id: "message-user-001", role: "user" },
    { id: "message-assistant-001", role: "assistant" },
    {
      id: "message-tool-001",
      role: "toolResult",
      toolCallId: "call-read-001",
      toolName: "read",
      isError: false,
    },
  ]);
});

test("snapshots and deeply freezes caller-owned assistant input", () => {
  const argumentsInput = {
    path: "README.md",
    options: { lineNumbers: true },
    ranges: [1, { label: "tail" }],
  };
  const contentInput: CourseAssistantBlock[] = [
    { type: "text", text: "Reading." },
    {
      type: "toolCall",
      id: "call-read-immutable",
      name: "read",
      arguments: argumentsInput,
    },
  ];

  const message = assistantMessage({
    id: "message-assistant-immutable",
    content: contentInput,
  });

  contentInput.push({ type: "text", text: "late mutation" });
  argumentsInput.path = "LICENSE";
  argumentsInput.options.lineNumbers = false;
  argumentsInput.ranges[1] = { label: "mutated" };

  expect(message.content).toHaveLength(2);
  expect(message.content[1]).toEqual({
    type: "toolCall",
    id: "call-read-immutable",
    name: "read",
    arguments: {
      path: "README.md",
      options: { lineNumbers: true },
      ranges: [1, { label: "tail" }],
    },
  });
  expect(Object.isFrozen(message)).toBe(true);
  expect(Object.isFrozen(message.content)).toBe(true);
  expect(Object.isFrozen(message.content[1])).toBe(true);

  const toolCall = message.content[1];
  if (toolCall.type !== "toolCall") {
    throw new Error("expected a Tool call");
  }

  expect(Object.isFrozen(toolCall.arguments)).toBe(true);
  expect(Object.isFrozen(toolCall.arguments.options)).toBe(true);
  expect(Object.isFrozen(toolCall.arguments.ranges)).toBe(true);
});

test("reports duplicate Tool call IDs with a stable code and message index", () => {
  const transcript = [
    assistantMessage({
      id: "message-assistant-duplicate",
      content: [
        {
          type: "toolCall",
          id: "call-duplicate",
          name: "read",
          arguments: { path: "README.md" },
        },
        {
          type: "toolCall",
          id: "call-duplicate",
          name: "read",
          arguments: { path: "LICENSE" },
        },
      ],
    }),
    toolResultMessage({
      id: "message-tool-duplicate",
      toolCallId: "call-duplicate",
      toolName: "read",
      content: "contents",
    }),
  ];

  expect(validateTranscript(transcript)).toContainEqual({
    code: "DUPLICATE_TOOL_CALL_ID",
    messageIndex: 0,
    message: 'Tool call ID "call-duplicate" is not unique',
  });
});

test("reports orphan results, result-before-call order, and missing results", () => {
  const orphan = toolResultMessage({
    id: "message-tool-orphan",
    toolCallId: "call-missing",
    toolName: "read",
    content: "contents",
  });
  const futureCall = assistantMessage({
    id: "message-assistant-future",
    content: [
      {
        type: "toolCall",
        id: "call-future",
        name: "read",
        arguments: { path: "README.md" },
      },
      {
        type: "toolCall",
        id: "call-unanswered",
        name: "write",
        arguments: { path: "notes.txt", content: "hello" },
      },
    ],
  });

  expect(errorCodes([orphan])).toContain("ORPHAN_TOOL_RESULT");
  expect(
    errorCodes([
      toolResultMessage({
        id: "message-tool-early",
        toolCallId: "call-future",
        toolName: "read",
        content: "contents",
      }),
      futureCall,
    ]),
  ).toEqual(
    expect.arrayContaining(["TOOL_RESULT_BEFORE_CALL", "MISSING_TOOL_RESULT"]),
  );
  expect(errorCodes([futureCall])).toEqual([
    "MISSING_TOOL_RESULT",
    "MISSING_TOOL_RESULT",
  ]);
});

test("requires the Tool result name to match its call", () => {
  const transcript = [
    assistantMessage({
      id: "message-assistant-name",
      content: [
        {
          type: "toolCall",
          id: "call-name",
          name: "read",
          arguments: { path: "README.md" },
        },
      ],
    }),
    toolResultMessage({
      id: "message-tool-name",
      toolCallId: "call-name",
      toolName: "write",
      content: "contents",
    }),
  ];

  expect(validateTranscript(transcript)).toContainEqual({
    code: "TOOL_NAME_MISMATCH",
    messageIndex: 1,
    message: 'Tool result name "write" does not match call name "read"',
  });
});

test("inspection never throws and reports empty names and invalid arguments", () => {
  const invalidTranscripts: readonly Readonly<{
    transcript: unknown;
    code: TranscriptValidationErrorCode;
  }>[] = [
    {
      transcript: [
        {
          id: "message-assistant-empty-name",
          role: "assistant",
          content: [
            {
              type: "toolCall",
              id: "call-empty-name",
              name: "   ",
              arguments: {},
            },
          ],
        },
      ],
      code: "EMPTY_TOOL_NAME",
    },
    {
      transcript: [
        {
          id: "message-tool-empty-name",
          role: "toolResult",
          toolCallId: "call-missing",
          toolName: "",
          content: "",
          isError: false,
        },
      ],
      code: "EMPTY_TOOL_NAME",
    },
    ...([null, [], "bad"] as const).map((argumentsValue) => ({
      transcript: [
        {
          id: "message-assistant-invalid-arguments",
          role: "assistant",
          content: [
            {
              type: "toolCall",
              id: `call-${String(argumentsValue)}`,
              name: "read",
              arguments: argumentsValue,
            },
          ],
        },
      ],
      code: "INVALID_TOOL_ARGUMENTS" as const,
    })),
  ];

  for (const { transcript, code } of invalidTranscripts) {
    expect(() => validateTranscript(transcript)).not.toThrow();
    expect(errorCodes(transcript)).toContain(code);
  }

  expect(validateTranscript(null)).toEqual([
    {
      code: "INVALID_TRANSCRIPT",
      messageIndex: -1,
      message: "Transcript must be an array",
    },
  ]);

  const adversarialEntry = Object.defineProperty({}, "role", {
    get(): never {
      throw new Error("hostile getter");
    },
  });
  const adversarialErrors = validateTranscript([adversarialEntry]);
  expect(adversarialErrors).toEqual([
    {
      code: "INVALID_TRANSCRIPT",
      messageIndex: -1,
      message: "Transcript could not be inspected safely",
    },
  ]);
  expect(Object.isFrozen(adversarialErrors)).toBe(true);
  expect(Object.isFrozen(adversarialErrors[0])).toBe(true);
});

test("constructors reject malformed direct input with precise errors", () => {
  expect(() =>
    assistantMessage({
      id: "message-assistant-empty-name",
      content: [
        {
          type: "toolCall",
          id: "call-empty-name",
          name: " ",
          arguments: {},
        },
      ],
    }),
  ).toThrow("assistantMessage: content[0].name must be a non-empty string");

  for (const argumentsValue of [null, [], "bad"] as const) {
    expect(() =>
      assistantMessage({
        id: "message-assistant-invalid-arguments",
        content: [
          {
            type: "toolCall",
            id: "call-invalid-arguments",
            name: "read",
            arguments: argumentsValue,
          } as unknown as CourseAssistantBlock,
        ],
      }),
    ).toThrow(
      "assistantMessage: content[0].arguments must be a non-null object and not an array",
    );
  }
});

test("JSON round-trip preserves message and block discriminants and IDs", () => {
  const transcript: readonly CourseMessage[] = [
    userMessage({ id: "message-user-json", content: "Inspect." }),
    assistantMessage({
      id: "message-assistant-json",
      content: [
        { type: "text", text: "Inspecting." },
        {
          type: "toolCall",
          id: "call-json",
          name: "read",
          arguments: { path: "README.md" },
        },
      ],
    }),
    toolResultMessage({
      id: "message-tool-json",
      toolCallId: "call-json",
      toolName: "read",
      content: "contents",
    }),
  ];

  const restored = JSON.parse(JSON.stringify(transcript)) as CourseMessage[];

  expect(restored.map(({ id, role }) => ({ id, role }))).toEqual([
    { id: "message-user-json", role: "user" },
    { id: "message-assistant-json", role: "assistant" },
    { id: "message-tool-json", role: "toolResult" },
  ]);
  expect(restored[1]).toMatchObject({
    role: "assistant",
    content: [{ type: "text" }, { type: "toolCall", id: "call-json" }],
  });
  expect(restored[2]).toMatchObject({
    role: "toolResult",
    toolCallId: "call-json",
  });
  expect(validateTranscript(restored)).toEqual([]);
});
