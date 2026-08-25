export type CourseMessageId = string;
export type CourseModelRequestId = string;
export type CourseModelResponseId = string;
export type CourseToolCallId = string;

// Protocol aliases are recursively readonly at compile time. Later parser and
// snapshot layers remain responsible for validating and cloning runtime input.
export type CourseJsonPrimitive = string | number | boolean | null;
export type CourseJsonValue =
  CourseJsonPrimitive | CourseJsonObject | CourseJsonArray;
export type CourseJsonObject = {
  readonly [key: string]: CourseJsonValue;
};
export type CourseJsonArray = readonly CourseJsonValue[];

export type CourseTextBlock = Readonly<{
  type: "text";
  text: string;
}>;

export type CourseToolCall = Readonly<{
  type: "toolCall";
  id: CourseToolCallId;
  name: string;
  arguments: CourseJsonObject;
}>;

export type CourseAssistantBlock = CourseTextBlock | CourseToolCall;

export type CourseUserMessage = Readonly<{
  id: CourseMessageId;
  role: "user";
  content: string;
}>;

export type CourseAssistantMessage = Readonly<{
  id: CourseMessageId;
  role: "assistant";
  content: readonly CourseAssistantBlock[];
}>;

export type CourseToolResultMessage = Readonly<{
  id: CourseMessageId;
  role: "toolResult";
  toolCallId: CourseToolCallId;
  toolName: string;
  content: string;
  isError: boolean;
}>;

export type CourseMessage =
  CourseUserMessage | CourseAssistantMessage | CourseToolResultMessage;

export type CourseModelRequest = Readonly<{
  id: CourseModelRequestId;
  messages: readonly CourseMessage[];
}>;

export type CourseTextDeltaChunk = Readonly<{
  type: "textDelta";
  requestId: CourseModelRequestId;
  delta: string;
}>;

export type CourseToolCallChunk = Readonly<{
  type: "toolCall";
  requestId: CourseModelRequestId;
  toolCall: CourseToolCall;
}>;

export type CourseModelChunk = CourseTextDeltaChunk | CourseToolCallChunk;

export type CourseModelUsage = Readonly<{
  inputTokens: number;
  outputTokens: number;
}>;

export type CourseModelResponse = Readonly<{
  id: CourseModelResponseId;
  requestId: CourseModelRequestId;
  message: CourseAssistantMessage;
  stopReason: "stop" | "toolCall";
  usage: CourseModelUsage;
}>;

export type CourseToolValidation<Input> =
  Readonly<{ ok: true; value: Input }> | Readonly<{ ok: false; error: string }>;

export type CourseToolExecutionContext = Readonly<{
  signal: AbortSignal;
  toolCallId: CourseToolCallId;
}>;

export type CourseTool<Input = unknown, Output = unknown> = {
  readonly name: string;
  readonly description: string;
  readonly validate: (input: unknown) => CourseToolValidation<Input>;
  readonly execute: (
    input: Input,
    context: CourseToolExecutionContext,
  ) => Promise<Output>;
};

export type CompletedRunResult = Readonly<{
  status: "completed";
  messages: readonly CourseMessage[];
  finalText: string;
}>;

export type CancelledRunResult = Readonly<{
  status: "cancelled";
  messages: readonly CourseMessage[];
  reason: string;
}>;

export type MaxStepsRunResult = Readonly<{
  status: "maxSteps";
  messages: readonly CourseMessage[];
  maxSteps: number;
}>;

export type FailedRunResult = Readonly<{
  status: "failed";
  messages: readonly CourseMessage[];
  error: Readonly<{
    code: string;
    message: string;
  }>;
}>;

export type RunResult =
  CompletedRunResult | CancelledRunResult | MaxStepsRunResult | FailedRunResult;

export type AgentEvent =
  | Readonly<{
      type: "message.accepted";
      sequence: number;
      payload: Readonly<{ message: CourseMessage }>;
    }>
  | Readonly<{
      type: "model.chunk";
      sequence: number;
      payload: Readonly<{ chunk: CourseModelChunk }>;
    }>
  | Readonly<{
      type: "tool.started";
      sequence: number;
      payload: Readonly<{ toolCall: CourseToolCall }>;
    }>
  | Readonly<{
      type: "tool.finished";
      sequence: number;
      payload: Readonly<{ message: CourseToolResultMessage }>;
    }>
  | Readonly<{
      type: "run.finished";
      sequence: number;
      payload: Readonly<{ result: RunResult }>;
    }>;

export function assertNever(value: never): never {
  throw new Error(`Unexpected protocol value: ${String(value)}`);
}
