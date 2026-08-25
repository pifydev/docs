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

function changingProperty(
  target: object,
  key: PropertyKey,
  firstValue: unknown,
  laterValue: unknown,
): () => number {
  let reads = 0;
  Object.defineProperty(target, key, {
    configurable: true,
    enumerable: true,
    get(): unknown {
      reads += 1;
      return reads === 1 ? firstValue : laterValue;
    },
  });
  return () => reads;
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

test("uses trusted indexed traversal instead of caller-controlled array methods", () => {
  const transcript = [
    { id: "message-user-indexed", role: "user", content: "Hello." },
  ];
  Object.defineProperty(transcript, "entries", {
    value(): never {
      throw new Error("caller-controlled entries");
    },
  });
  expect(validateTranscript(transcript)).toEqual([]);

  const content = [{ type: "text", text: "Indexed content." }];
  Object.defineProperty(content, Symbol.iterator, {
    value(): never {
      throw new Error("caller-controlled iterator");
    },
  });
  expect(
    validateTranscript([
      { id: "message-assistant-indexed", role: "assistant", content },
    ]),
  ).toEqual([]);

  const nested = ["first", "second"];
  Object.defineProperty(nested, "map", { value: undefined });
  const message = assistantMessage({
    id: "message-assistant-nested-indexed",
    content: [
      {
        type: "toolCall",
        id: "call-nested-indexed",
        name: "inspect",
        arguments: { nested },
      },
    ],
  });
  expect(message.content[0]).toMatchObject({
    type: "toolCall",
    arguments: { nested: ["first", "second"] },
  });
});

test("rejects sparse assistant content and nested JSON arrays", () => {
  const sparseContent = new Array<CourseAssistantBlock>(1);
  expect(() =>
    assistantMessage({
      id: "message-assistant-sparse-content",
      content: sparseContent,
    }),
  ).toThrow("assistantMessage: content[0] must not be sparse");
  expect(
    errorCodes([
      {
        id: "message-assistant-sparse-content",
        role: "assistant",
        content: sparseContent,
      },
    ]),
  ).toEqual(["INVALID_MESSAGE"]);

  const sparseNested = new Array<unknown>(1);
  expect(() =>
    assistantMessage({
      id: "message-assistant-sparse-arguments",
      content: [
        {
          type: "toolCall",
          id: "call-sparse-arguments",
          name: "inspect",
          arguments: { values: sparseNested },
        } as CourseAssistantBlock,
      ],
    }),
  ).toThrow(
    "assistantMessage: content[0].arguments.values[0] must not be sparse",
  );
  expect(
    errorCodes([
      {
        id: "message-assistant-sparse-arguments",
        role: "assistant",
        content: [
          {
            type: "toolCall",
            id: "call-sparse-arguments",
            name: "inspect",
            arguments: { values: sparseNested },
          },
        ],
      },
    ]),
  ).toEqual(["INVALID_TOOL_ARGUMENTS"]);
});

test("constructors snapshot every caller property with exactly one read", () => {
  const rawUser = {};
  const userIdReads = changingProperty(rawUser, "id", "message-user-once", " ");
  const userContentReads = changingProperty(
    rawUser,
    "content",
    "Read once.",
    42,
  );
  expect(
    userMessage(rawUser as Parameters<typeof userMessage>[0]),
  ).toMatchObject({ id: "message-user-once", content: "Read once." });
  expect([userIdReads(), userContentReads()]).toEqual([1, 1]);

  const argumentsInput = {};
  const argumentPathReads = changingProperty(
    argumentsInput,
    "path",
    "README.md",
    "LICENSE",
  );
  const rawBlock = {};
  const blockTypeReads = changingProperty(rawBlock, "type", "toolCall", "text");
  const callIdReads = changingProperty(rawBlock, "id", "call-once", " ");
  const callNameReads = changingProperty(rawBlock, "name", "read", " ");
  const callArgumentsReads = changingProperty(
    rawBlock,
    "arguments",
    argumentsInput,
    null,
  );
  const assistantContent = [rawBlock as CourseAssistantBlock];
  const rawAssistant = {};
  const assistantIdReads = changingProperty(
    rawAssistant,
    "id",
    "message-assistant-once",
    " ",
  );
  const assistantContentReads = changingProperty(
    rawAssistant,
    "content",
    assistantContent,
    null,
  );
  const assistant = assistantMessage(
    rawAssistant as Parameters<typeof assistantMessage>[0],
  );
  expect(assistant.content[0]).toMatchObject({
    type: "toolCall",
    id: "call-once",
    name: "read",
    arguments: { path: "README.md" },
  });
  expect([
    assistantIdReads(),
    assistantContentReads(),
    blockTypeReads(),
    callIdReads(),
    callNameReads(),
    callArgumentsReads(),
    argumentPathReads(),
  ]).toEqual([1, 1, 1, 1, 1, 1, 1]);

  const rawResult = {};
  const resultReadCounts = [
    changingProperty(rawResult, "id", "message-result-once", " "),
    changingProperty(rawResult, "toolCallId", "call-once", " "),
    changingProperty(rawResult, "toolName", "read", " "),
    changingProperty(rawResult, "content", "contents", 42),
    changingProperty(rawResult, "isError", false, "bad"),
  ];
  expect(
    toolResultMessage(rawResult as Parameters<typeof toolResultMessage>[0]),
  ).toMatchObject({
    id: "message-result-once",
    toolCallId: "call-once",
    toolName: "read",
    content: "contents",
    isError: false,
  });
  expect(resultReadCounts.map((readCount) => readCount())).toEqual([
    1, 1, 1, 1, 1,
  ]);
});

test("validator snapshots changing message, block, and result properties once", () => {
  const rawCall = {};
  const callReadCounts = [
    changingProperty(rawCall, "type", "toolCall", "text"),
    changingProperty(rawCall, "id", "call-validator-once", " "),
    changingProperty(rawCall, "name", "read", " "),
    changingProperty(rawCall, "arguments", { path: "README.md" }, null),
  ];
  const rawAssistant = {};
  const assistantReadCounts = [
    changingProperty(rawAssistant, "id", "message-assistant-validator", " "),
    changingProperty(rawAssistant, "role", "assistant", "bogus"),
    changingProperty(rawAssistant, "content", [rawCall], null),
  ];
  const rawResult = {};
  const resultReadCounts = [
    changingProperty(rawResult, "id", "message-result-validator", " "),
    changingProperty(rawResult, "role", "toolResult", "bogus"),
    changingProperty(rawResult, "toolCallId", "call-validator-once", " "),
    changingProperty(rawResult, "toolName", "read", " "),
    changingProperty(rawResult, "content", "contents", 42),
    changingProperty(rawResult, "isError", false, "bad"),
  ];

  expect(validateTranscript([rawAssistant, rawResult])).toEqual([]);
  expect(
    [...assistantReadCounts, ...callReadCounts, ...resultReadCounts].map(
      (readCount) => readCount(),
    ),
  ).toEqual([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
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

test("enforces one Tool result per call with deterministic duplicate diagnostics", () => {
  const call = {
    id: "message-assistant-duplicate-result",
    role: "assistant",
    content: [
      {
        type: "toolCall",
        id: "call-duplicate-result",
        name: "read",
        arguments: { path: "README.md" },
      },
    ],
  };
  const firstResult = {
    id: "message-tool-result-first",
    role: "toolResult",
    toolCallId: "call-duplicate-result",
    toolName: "read",
    content: "first",
    isError: false,
  };
  const secondResult = {
    ...firstResult,
    id: "message-tool-result-second",
    content: "second",
  };

  expect(validateTranscript([call, firstResult, secondResult])).toContainEqual({
    code: "DUPLICATE_TOOL_RESULT",
    messageIndex: 2,
    message: 'Tool call "call-duplicate-result" has more than one result',
  });

  const beforeCallErrors = validateTranscript([
    firstResult,
    secondResult,
    call,
  ]);
  expect(beforeCallErrors).toContainEqual({
    code: "DUPLICATE_TOOL_RESULT",
    messageIndex: 1,
    message: 'Tool call "call-duplicate-result" has more than one result',
  });
  expect(
    beforeCallErrors.filter(({ code }) => code === "TOOL_RESULT_BEFORE_CALL"),
  ).toHaveLength(2);
  expect(errorCodes([firstResult, secondResult, call])).toContain(
    "MISSING_TOOL_RESULT",
  );
});

test("suppresses ambiguous linkage diagnostics when Tool call IDs are duplicated", () => {
  const duplicateCalls = [
    {
      id: "message-assistant-call-first",
      role: "assistant",
      content: [
        {
          type: "toolCall",
          id: "call-ambiguous",
          name: "read",
          arguments: { path: "README.md" },
        },
      ],
    },
    {
      id: "message-assistant-call-second",
      role: "assistant",
      content: [
        {
          type: "toolCall",
          id: "call-ambiguous",
          name: "write",
          arguments: { path: "README.md", content: "changed" },
        },
      ],
    },
  ];
  const duplicateResults = [
    {
      id: "message-tool-ambiguous-first",
      role: "toolResult",
      toolCallId: "call-ambiguous",
      toolName: "bogus",
      content: "first",
      isError: false,
    },
    {
      id: "message-tool-ambiguous-second",
      role: "toolResult",
      toolCallId: "call-ambiguous",
      toolName: "bogus",
      content: "second",
      isError: false,
    },
  ];

  expect(errorCodes([...duplicateCalls, ...duplicateResults])).toEqual([
    "DUPLICATE_TOOL_CALL_ID",
    "DUPLICATE_TOOL_RESULT",
  ]);
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
      code: "INVALID_MESSAGE",
      messageIndex: 0,
      message: "Transcript entry could not be inspected safely",
    },
  ]);
  expect(Object.isFrozen(adversarialErrors)).toBe(true);
  expect(Object.isFrozen(adversarialErrors[0])).toBe(true);

  const revocableTranscript = Proxy.revocable<unknown[]>([], {});
  revocableTranscript.revoke();
  expect(() => validateTranscript(revocableTranscript.proxy)).not.toThrow();
  const revokedProxyErrors = validateTranscript(revocableTranscript.proxy);
  expect(revokedProxyErrors).toEqual([
    {
      code: "INVALID_TRANSCRIPT",
      messageIndex: -1,
      message: "Transcript could not be inspected safely",
    },
  ]);
  expect(Object.isFrozen(revokedProxyErrors)).toBe(true);
  expect(Object.isFrozen(revokedProxyErrors[0])).toBe(true);
});

test("reports every malformed normalized message shape without throwing", () => {
  const malformedTranscripts: readonly Readonly<{
    label: string;
    transcript: unknown;
    expectedCodes: readonly TranscriptValidationErrorCode[];
  }>[] = [
    {
      label: "user without required fields",
      transcript: [{ role: "user" }],
      expectedCodes: ["INVALID_MESSAGE"],
    },
    {
      label: "user with non-string content",
      transcript: [{ id: "message-user-invalid", role: "user", content: 42 }],
      expectedCodes: ["INVALID_MESSAGE"],
    },
    {
      label: "assistant text block without text",
      transcript: [
        {
          id: "message-assistant-missing-text",
          role: "assistant",
          content: [{ type: "text" }],
        },
      ],
      expectedCodes: ["INVALID_MESSAGE"],
    },
    {
      label: "assistant with an unsupported block type",
      transcript: [
        {
          id: "message-assistant-bogus-block",
          role: "assistant",
          content: [{ type: "image", url: "file.png" }],
        },
      ],
      expectedCodes: ["INVALID_MESSAGE"],
    },
    {
      label: "Tool result without required fields",
      transcript: [
        {
          id: "message-tool-invalid",
          role: "toolResult",
          toolCallId: "call-invalid-result",
        },
      ],
      expectedCodes: ["EMPTY_TOOL_NAME", "INVALID_MESSAGE"],
    },
    {
      label: "Tool result with an invalid message ID",
      transcript: [
        {
          id: " ",
          role: "toolResult",
          toolCallId: "call-invalid-message-id",
          toolName: "read",
          content: "contents",
          isError: false,
        },
      ],
      expectedCodes: ["INVALID_MESSAGE"],
    },
  ];

  for (const { label, transcript, expectedCodes } of malformedTranscripts) {
    expect(
      () => validateTranscript(transcript),
      `${label} must not throw`,
    ).not.toThrow();

    const errors = validateTranscript(transcript);
    expect(
      errors.map(({ code }) => code),
      `${label} must report its structural error`,
    ).toEqual(expect.arrayContaining([...expectedCodes]));
    expect(errors.every(({ messageIndex }) => messageIndex === 0)).toBe(true);
    expect(Object.isFrozen(errors)).toBe(true);
    expect(
      errors.every((validationError) => Object.isFrozen(validationError)),
    ).toBe(true);
  }
});

test("does not cascade malformed calls or results into linkage errors", () => {
  const malformedCallWithResult = [
    {
      id: "message-assistant-malformed-call",
      role: "assistant",
      content: [
        {
          type: "toolCall",
          id: "call-malformed",
          name: "read",
          arguments: [],
        },
      ],
    },
    {
      id: "message-tool-for-malformed-call",
      role: "toolResult",
      toolCallId: "call-malformed",
      toolName: "read",
      content: "contents",
      isError: false,
    },
  ];
  const validCallWithMalformedResult = [
    {
      id: "message-assistant-valid-call",
      role: "assistant",
      content: [
        {
          type: "toolCall",
          id: "call-malformed-result",
          name: "read",
          arguments: { path: "README.md" },
        },
      ],
    },
    {
      id: "message-tool-malformed-result",
      role: "toolResult",
      toolCallId: "call-malformed-result",
      toolName: "read",
      content: 42,
      isError: false,
    },
  ];

  expect(errorCodes(malformedCallWithResult)).toEqual([
    "INVALID_TOOL_ARGUMENTS",
  ]);
  expect(errorCodes(validCallWithMalformedResult)).toEqual(["INVALID_MESSAGE"]);
});

test("isolates hostile entries and blocks while preserving earlier diagnostics", () => {
  const hostileEntry = Object.defineProperty({}, "role", {
    get(): never {
      throw new Error("hostile message role");
    },
  });
  const entryErrors = validateTranscript([
    { id: "message-user-malformed", role: "user", content: 42 },
    hostileEntry,
  ]);
  expect(
    entryErrors.map(({ code, messageIndex }) => ({ code, messageIndex })),
  ).toEqual([
    { code: "INVALID_MESSAGE", messageIndex: 0 },
    { code: "INVALID_MESSAGE", messageIndex: 1 },
  ]);
  expect(
    errorCodes([
      { id: "message-user-malformed", role: "user", content: 42 },
      hostileEntry,
    ]),
  ).not.toContain("INVALID_TRANSCRIPT");

  const hostileBlock = Object.defineProperty({}, "type", {
    get(): never {
      throw new Error("hostile block type");
    },
  });
  const blockErrors = validateTranscript([
    {
      id: "message-assistant-hostile-block",
      role: "assistant",
      content: [{ type: "text" }, hostileBlock],
    },
  ]);
  expect(
    blockErrors.map(({ code, messageIndex }) => ({ code, messageIndex })),
  ).toEqual([
    { code: "INVALID_MESSAGE", messageIndex: 0 },
    { code: "INVALID_MESSAGE", messageIndex: 0 },
  ]);
  expect(Object.isFrozen(blockErrors)).toBe(true);
  expect(
    blockErrors.every((validationError) => Object.isFrozen(validationError)),
  ).toBe(true);
});

test("retains readable call IDs before later Tool properties throw", () => {
  const hostileCall = {
    type: "toolCall",
    id: "call-hostile-name",
    arguments: { path: "README.md" },
  };
  Object.defineProperty(hostileCall, "name", {
    enumerable: true,
    get(): never {
      throw new Error("hostile Tool call name");
    },
  });
  const callErrors = validateTranscript([
    {
      id: "message-assistant-hostile-name",
      role: "assistant",
      content: [hostileCall],
    },
    {
      id: "message-tool-after-hostile-call",
      role: "toolResult",
      toolCallId: "call-hostile-name",
      toolName: "read",
      content: "contents",
      isError: false,
    },
  ]);
  const callCodes = callErrors.map(({ code }) => code);
  expect(callCodes).toEqual(["INVALID_MESSAGE"]);
  expect(callCodes).not.toContain("ORPHAN_TOOL_RESULT");

  const hostileResult = {
    id: "message-tool-hostile-name",
    role: "toolResult",
    toolCallId: "call-hostile-result-name",
    content: "contents",
    isError: false,
  };
  Object.defineProperty(hostileResult, "toolName", {
    enumerable: true,
    get(): never {
      throw new Error("hostile Tool result name");
    },
  });
  const resultErrors = validateTranscript([
    {
      id: "message-assistant-before-hostile-result",
      role: "assistant",
      content: [
        {
          type: "toolCall",
          id: "call-hostile-result-name",
          name: "read",
          arguments: { path: "README.md" },
        },
      ],
    },
    hostileResult,
  ]);
  const resultCodes = resultErrors.map(({ code }) => code);
  expect(resultCodes).toEqual(["INVALID_MESSAGE"]);
  expect(resultCodes).not.toContain("MISSING_TOOL_RESULT");
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
