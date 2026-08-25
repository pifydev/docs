import { readFile } from "node:fs/promises";

import { expect, test } from "vitest";

const courseRoot = new URL("../", import.meta.url);

interface ProviderFixture {
  responses: Array<{
    records: Array<{ type: string; id?: string; text?: string }>;
  }>;
  expected: { toolCallId: string; finalText: string };
}

interface EvalFixture {
  tasks: Array<{
    id: string;
    split: string;
    prompt: string;
    expectedPublicEvidence: { includes: string[] };
    expectedVerdict: string;
  }>;
}

test("the temporary workshop scaffold is offline and deterministic", async () => {
  const [readme, providerSource, evalSource] = await Promise.all([
    readFile(new URL("README.md", courseRoot), "utf8"),
    readFile(
      new URL("fixtures/provider-tool-roundtrip.json", courseRoot),
      "utf8",
    ),
    readFile(new URL("fixtures/eval-tasks.json", courseRoot), "utf8"),
  ]);

  expect(readme).toMatch(/runs entirely offline/i);
  expect(readme).toMatch(/require no API key/i);
  expect(readme).toMatch(
    /npm run test:course:checkpoint -- course\/test\/04-deterministic-model\.test\.ts/,
  );
  expect(readme).toMatch(
    /Task 2[\s\S]*Checkpoint 00[\s\S]*remove[\s\S]*`_scaffold\.test\.ts`/i,
  );

  const providerFixture = JSON.parse(providerSource) as ProviderFixture;
  expect(providerFixture.responses).toHaveLength(2);
  expect(providerFixture.responses[0].records.map(({ type }) => type)).toEqual([
    "response_start",
    "tool_call",
    "response_end",
  ]);
  expect(providerFixture.responses[1].records.map(({ type }) => type)).toEqual([
    "response_start",
    "text_delta",
    "response_end",
  ]);
  expect(providerFixture.responses[0].records[1].id).toBe(
    providerFixture.expected.toolCallId,
  );
  expect(providerFixture.responses[1].records[1].text).toBe(
    providerFixture.expected.finalText,
  );

  const evalFixture = JSON.parse(evalSource) as EvalFixture;
  expect(
    evalFixture.tasks.map(({ expectedVerdict }) => expectedVerdict),
  ).toEqual(["pass", "fail"]);
  expect(
    evalFixture.tasks.every(
      ({ id, split, prompt, expectedPublicEvidence }) =>
        typeof id === "string" &&
        split === "held-out" &&
        typeof prompt === "string" &&
        expectedPublicEvidence.includes.length > 0,
    ),
  ).toBe(true);
  expect(new Set(evalFixture.tasks.map(({ id }) => id)).size).toBe(
    evalFixture.tasks.length,
  );

  expect(`${providerSource}\n${evalSource}`).not.toMatch(
    /https?:\/\/|api[_-]?key|authorization|password|private[_-]?key/i,
  );
});
