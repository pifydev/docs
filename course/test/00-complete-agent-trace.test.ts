import { expect, test } from "vitest";

import { runPrologue } from "../src/index";

const expectedEventTypes = [
  "user_message_accepted",
  "model_stream_opened",
  "tool_call_completed",
  "tool_execution_started",
  "tool_result_appended",
  "model_stream_opened",
  "final_text_completed",
  "agent_ended",
] as const;

test("follows one complete Agent trace in exact event order", () => {
  const run = runPrologue();

  expect(run.events.map(({ type }) => type)).toEqual(expectedEventTypes);

  const toolCall = run.events[2];
  const toolResult = run.events[4];

  expect(toolCall).toMatchObject({
    type: "tool_call_completed",
    toolCallId: "call-add-001",
  });
  expect(toolResult).toMatchObject({
    type: "tool_result_appended",
    toolCallId: "call-add-001",
  });
  expect(toolResult.toolCallId).toBe(toolCall.toolCallId);

  expect(run.result).toEqual({
    status: "completed",
    finalText: "The sum is 42.",
  });
});
