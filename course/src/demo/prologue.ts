const toolCallId = "call-add-001";
const finalText = "The sum is 42.";

const events = Object.freeze([
  Object.freeze({
    type: "user_message_accepted",
    sequence: 0,
    text: "What is 20 + 22?",
  }),
  Object.freeze({
    type: "model_stream_opened",
    sequence: 1,
    streamId: "model-stream-001",
  }),
  Object.freeze({
    type: "tool_call_completed",
    sequence: 2,
    toolCallId,
    toolName: "add",
    arguments: Object.freeze({ left: 20, right: 22 }),
  }),
  Object.freeze({
    type: "tool_execution_started",
    sequence: 3,
    toolCallId,
    toolName: "add",
  }),
  Object.freeze({
    type: "tool_result_appended",
    sequence: 4,
    toolCallId,
    result: 42,
  }),
  Object.freeze({
    type: "model_stream_opened",
    sequence: 5,
    streamId: "model-stream-002",
  }),
  Object.freeze({
    type: "final_text_completed",
    sequence: 6,
    text: finalText,
  }),
  Object.freeze({
    type: "agent_ended",
    sequence: 7,
    status: "completed",
  }),
] as const);

const result = Object.freeze({
  status: "completed",
  finalText,
} as const);

const completedPrologue = Object.freeze({ events, result });

export function runPrologue() {
  return completedPrologue;
}
