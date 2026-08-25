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

test("returns a deeply immutable Agent trace", () => {
  const run = runPrologue();
  const toolCall = run.events[2];

  expect(Object.isFrozen(run)).toBe(true);
  expect(Object.isFrozen(run.events)).toBe(true);
  expect(run.events.every((event) => Object.isFrozen(event))).toBe(true);
  expect(Object.isFrozen(toolCall.arguments)).toBe(true);
  expect(Object.isFrozen(run.result)).toBe(true);

  const mutableEvents = run.events as unknown as Array<
    (typeof run.events)[number]
  >;
  const mutableArguments = toolCall.arguments as {
    left: number;
    right: number;
  };
  const mutableResult = run.result as {
    status: "completed";
    finalText: string;
  };

  expect(() => mutableEvents.pop()).toThrow(TypeError);
  expect(() => {
    mutableArguments.left = 0;
  }).toThrow(TypeError);
  expect(() => {
    mutableResult.finalText = "mutated";
  }).toThrow(TypeError);

  expect(run.events).toHaveLength(8);
  expect(toolCall.arguments).toEqual({ left: 20, right: 22 });
  expect(run.result.finalText).toBe("The sum is 42.");
});
