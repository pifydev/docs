---
title: Test a Pi Agent deterministically
description: Build an offline faux-provider test that proves request, Tool, transcript, cancellation, and queue-exhaustion contracts.
translation_key: how-to-test-agent-deterministically
language: en
source_url: "https://docs.pify.dev/en/how-to/test-agent-deterministically"
official_refs:
  - "https://github.com/earendil-works/pi/blob/107d79f11072bbc8a3a757ed7fd69596bee7d68c/packages/ai/src/providers/faux.ts"
  - "https://github.com/earendil-works/pi/blob/107d79f11072bbc8a3a757ed7fd69596bee7d68c/packages/agent/src/agent.ts"
  - "https://github.com/earendil-works/pi/blob/107d79f11072bbc8a3a757ed7fd69596bee7d68c/packages/agent/src/agent-loop.ts"
  - "https://github.com/earendil-works/pi/blob/107d79f11072bbc8a3a757ed7fd69596bee7d68c/packages/agent/test/e2e.test.ts"
terms_used:
  - test double
  - fixture
  - harness
  - Agent Loop
  - Tool
  - ToolCall
  - ToolResultMessage
status: reviewed
reviewed_by: Pify maintainers
last_updated: '2026-09-04'
translator: Pify maintainers
---

This guide builds one deterministic test around Pi's public faux provider. The test drives a real `Agent` and a real `AgentTool`, but replaces the external model with a finite queue of local assistant responses. It therefore needs no API key, performs no network request, and gives exact evidence when the Agent Loop, Tool contract, or transcript changes.

## Outcome

At the end, one self-contained Node.js test proves three behaviors:

1. a provider request leads to a calculator `ToolCall`, its linked `ToolResultMessage`, and a final assistant answer;
2. a host-owned `AbortController` cancels an active Agent run and produces `stopReason: "aborted"`;
3. an exhausted faux-response queue settles as an assistant error result instead of hanging or making a real request.

The test also captures lifecycle events, inspects both provider requests, verifies the exact Tool arguments, and removes the provider and its models in `finally`.

## Prerequisites and exact package versions

Use Node.js `22.19.0` or a newer Node 22 release, ESM, and the published Pi `0.85.0` packages:

```bash
npm install --save-dev @earendil-works/pi-ai@0.85.0 @earendil-works/pi-agent-core@0.85.0 tsx typescript @types/node
```

Save the complete example below as `deterministic-agent.test.ts`, then run:

```bash
node --import tsx --test deterministic-agent.test.ts
```

The package versions are deliberately exact. The helper names and behavior shown here are verified against Pi tag `v0.85.0`, commit `107d79f11072bbc8a3a757ed7fd69596bee7d68c`.

## 1. Create an isolated Models collection and faux provider

`createModels()` creates a registry owned by this test instead of mutating a process-wide default. `fauxProvider()` supplies a provider definition and one local model. Register that provider with `models.setProvider()`, resolve the model through `models.getModel()`, and pass `models.streamSimple.bind(models)` into the `Agent`.

The provider ID and model ID are fixture identifiers; they do not need to exist outside the test. `fauxProvider()` consumes responses from memory in request-start order. It never reads provider credentials and never falls through to another provider when its queue is empty.

The fixed two-token chunks are roughly eight characters each in Pi's faux implementation: `tokenSize` counts token units, and faux expands each unit to four characters. Together with `tokensPerSecond: 1_000`, they create an observable streaming window for cancellation without making the test slow. Assertions still target reconstructed messages and lifecycle boundaries, not the number of chunks.

## 2. Define a deterministic calculator Tool

The calculator uses Pi's public `AgentTool` contract and a TypeBox parameter schema. Its `execute()` method records the `toolCallId` and validated arguments before returning one `fauxText()` block. That record proves which arguments actually reached the Tool; asserting only the final sentence could hide a malformed call or a hard-coded answer.

Keep deterministic Tools free of clocks, random values, shared files, and ambient environment state. If a production Tool needs those dependencies, inject a local implementation into the fixture and assert its boundary separately.

## 3. Queue a Tool call followed by a final answer

`faux.setResponses()` replaces the pending queue. The first response factory sees the actual provider `TranscriptContext`, captures a data-only snapshot, and returns `fauxAssistantMessage()` with explanatory text plus `fauxToolCall()`. Its `stopReason` is `"toolUse"`, so the Agent Loop executes the Tool and continues.

The second factory receives the next request, which must already contain the leading system message, user message, assistant Tool call, and Tool result. It returns the final text response. Two factories are preferable to one opaque fixture because each can observe the exact context at its protocol boundary.

## 4. Run Agent and capture events and transcript

Subscribe before `prompt()`. This example records event types rather than stream chunk contents: semantic order matters, while faux-provider token chunk sizes are not part of the Agent contract. After the run, `agent.state.messages` is the complete transcript visible to the host.

The provider request snapshots contain messages, roles, the current system prompt, and transcript Tool names. Clone only `TranscriptContext.messages`; executable `AgentTool` definitions remain Agent-owned and are not part of this provider context.

## 5. Assert the complete round-trip contract

The important assertions cross boundaries instead of checking only one layer:

- provider call count is exactly two and the response queue is empty;
- the first request has roles `system`, `user`, exposes the configured system prompt, and advertises `add`;
- the second request has roles `system`, `user`, `assistant`, `toolResult`;
- the Tool received `{ left: 20, right: 22 }` for call `sum-1`;
- the Tool result links back through both `toolCallId: "sum-1"` and `toolName: "add"`;
- the transcript order is `system`, `user`, `assistant`, `toolResult`, `assistant`;
- final content is `The total is 42.` with `stopReason: "stop"`;
- Tool execution starts before it ends, and the Agent run is bracketed by `agent_start` and `agent_end`.

These assertions localize regressions. A wrong Tool argument is not reported as a vague answer failure, and a correct final string cannot conceal a broken result link.

## Complete compile-checked test

The function below is compiled in this documentation repository against the exact public `0.85.0` dependencies. The same code is shown in the Vietnamese edition.

```typescript title="deterministic-agent.test.ts"
import assert from "node:assert/strict";
import test from "node:test";

import {
  createModels,
  fauxAssistantMessage,
  fauxProvider,
  fauxText,
  fauxToolCall,
  getCurrentSystemPrompt,
  getCurrentTools,
  Type,
  type TranscriptContext,
} from "@earendil-works/pi-ai";
import {
  Agent,
  type AgentEvent,
  type AgentTool,
} from "@earendil-works/pi-agent-core";

export async function verifyDeterministicAgentTestingGuide(): Promise<void> {
  type ProviderRequestSummary = {
    roles: Array<TranscriptContext["messages"][number]["role"]>;
    systemPrompt: string;
    toolNames: string[];
    messages: TranscriptContext["messages"];
  };
  const requests: ProviderRequestSummary[] = [];
  const executedCalls: Array<{
    toolCallId: string;
    args: { left: number; right: number };
  }> = [];
  const eventTypes: Array<AgentEvent["type"]> = [];
  const agents: Agent[] = [];
  const models = createModels();
  const faux = fauxProvider({
    provider: "deterministic-guide-faux",
    models: [{ id: "calculator-model", reasoning: false }],
    tokenSize: { min: 2, max: 2 },
    tokensPerSecond: 1_000,
  });
  models.setProvider(faux.provider);

  const parameters = Type.Object({
    left: Type.Number(),
    right: Type.Number(),
  });
  const calculator: AgentTool<typeof parameters, { total: number }> = {
    name: "add",
    label: "Add two numbers",
    description: "Return left + right",
    parameters,
    async execute(toolCallId, args) {
      executedCalls.push({ toolCallId, args: { ...args } });
      const total = args.left + args.right;
      return { content: [fauxText(String(total))], details: { total } };
    },
  };

  const model = models.getModel("deterministic-guide-faux", "calculator-model");
  assert.ok(model, "the isolated Models collection must expose the faux model");

  const createAgent = () => {
    const agent = new Agent({
      streamFn: models.streamSimple.bind(models),
      initialState: {
        systemPrompt: "Use the add Tool for arithmetic.",
        model,
        thinkingLevel: "off",
        tools: [calculator],
      },
    });
    agents.push(agent);
    return agent;
  };

  const WATCHDOG_MS = 2_000;
  const awaitWithFailureWatchdog = async <T>(
    operation: Promise<T>,
    label: string,
    onTimeout: () => void,
  ): Promise<T> => {
    let watchdog: ReturnType<typeof setTimeout> | undefined;
    const timeoutFailure = new Promise<never>((_, reject) => {
      watchdog = setTimeout(() => {
        const message = `${label} did not settle within ${WATCHDOG_MS} ms`;
        try {
          onTimeout();
        } catch (cause) {
          reject(new Error(`${message}; timeout cleanup failed`, { cause }));
          return;
        }
        reject(new Error(message));
      }, WATCHDOG_MS);
    });

    try {
      return await Promise.race([operation, timeoutFailure]);
    } finally {
      if (watchdog !== undefined) clearTimeout(watchdog);
    }
  };

  let unsubscribe: (() => void) | undefined;
  try {
    const agent = createAgent();
    unsubscribe = agent.subscribe((event) => {
      eventTypes.push(event.type);
    });
    function captureTranscriptRequest(
      requests: ProviderRequestSummary[],
      context: TranscriptContext,
    ): void {
      requests.push({
        roles: context.messages.map((message) => message.role),
        systemPrompt: getCurrentSystemPrompt(context.messages),
        toolNames: getCurrentTools(context.messages).map((tool) => tool.name),
        messages: structuredClone(context.messages),
      });
    }

    faux.setResponses([
      (context) => {
        captureTranscriptRequest(requests, context);
        return fauxAssistantMessage(
          [
            fauxText("I will call the add Tool."),
            fauxToolCall("add", { left: 20, right: 22 }, { id: "sum-1" }),
          ],
          { stopReason: "toolUse" },
        );
      },
      (context) => {
        captureTranscriptRequest(requests, context);
        return fauxAssistantMessage(fauxText("The total is 42."));
      },
    ]);

    await awaitWithFailureWatchdog(
      agent.prompt("What is 20 + 22?"),
      "calculator Agent run",
      () => agent.abort(),
    );

    assert.equal(faux.state.callCount, 2);
    assert.equal(faux.getPendingResponseCount(), 0);
    assert.deepEqual(requests[0]?.roles, ["system", "user"]);
    assert.equal(requests[0]?.systemPrompt, "Use the add Tool for arithmetic.");
    assert.deepEqual(requests[0]?.toolNames, ["add"]);
    assert.deepEqual(requests[1]?.toolNames, ["add"]);
    assert.deepEqual(requests[1]?.roles, [
      "system",
      "user",
      "assistant",
      "toolResult",
    ]);
    assert.deepEqual(executedCalls, [
      { toolCallId: "sum-1", args: { left: 20, right: 22 } },
    ]);

    const requestToolResult = requests[1]?.messages[3];
    assert.equal(requestToolResult?.role, "toolResult");
    if (requestToolResult?.role !== "toolResult") {
      throw new Error("the second provider request must contain a Tool result");
    }
    assert.equal(requestToolResult.toolCallId, "sum-1");
    assert.equal(requestToolResult.toolName, "add");
    assert.equal(requestToolResult.isError, false);
    assert.deepEqual(requestToolResult.content, [fauxText("42")]);

    assert.deepEqual(
      agent.state.messages.map((message) => message.role),
      ["system", "user", "assistant", "toolResult", "assistant"],
    );
    const finalMessage = agent.state.messages.at(-1);
    assert.equal(finalMessage?.role, "assistant");
    if (finalMessage?.role !== "assistant") {
      throw new Error("the transcript must end with an assistant message");
    }
    assert.equal(finalMessage.stopReason, "stop");
    assert.deepEqual(finalMessage.content, [fauxText("The total is 42.")]);
    const toolStartIndex = eventTypes.indexOf("tool_execution_start");
    const toolEndIndex = eventTypes.indexOf("tool_execution_end");
    assert.ok(toolStartIndex >= 0, "Tool execution start event is required");
    assert.ok(toolEndIndex >= 0, "Tool execution end event is required");
    assert.ok(toolStartIndex < toolEndIndex);
    assert.equal(eventTypes.at(0), "agent_start");
    assert.equal(eventTypes.at(-1), "agent_end");

    unsubscribe();
    unsubscribe = undefined;

    const cancelledAgent = createAgent();
    faux.setResponses([
      fauxAssistantMessage("one two three four five six seven eight nine ten"),
    ]);
    let resolveAssistantStart!: () => void;
    const assistantStarted = new Promise<void>((resolve) => {
      resolveAssistantStart = resolve;
    });
    const unsubscribeCancelled = cancelledAgent.subscribe((event) => {
      if (
        event.type === "message_start" &&
        event.message.role === "assistant"
      ) {
        resolveAssistantStart();
      }
    });
    const cancellation = new AbortController();
    const abortAgent = () => cancelledAgent.abort();
    cancellation.signal.addEventListener("abort", abortAgent, { once: true });
    try {
      const cancelledRun = cancelledAgent.prompt("Count slowly to ten.");
      await awaitWithFailureWatchdog(
        assistantStarted,
        "assistant stream start",
        () => cancelledAgent.abort(),
      );
      cancellation.abort();
      await awaitWithFailureWatchdog(cancelledRun, "cancelled Agent run", () =>
        cancelledAgent.abort(),
      );
    } finally {
      unsubscribeCancelled();
      cancellation.signal.removeEventListener("abort", abortAgent);
    }
    const cancelledMessage = cancelledAgent.state.messages.at(-1);
    assert.equal(cancelledMessage?.role, "assistant");
    if (cancelledMessage?.role !== "assistant") {
      throw new Error("cancellation must settle with an assistant message");
    }
    assert.equal(cancelledMessage.stopReason, "aborted");
    assert.equal(cancelledMessage.errorMessage, "Request was aborted");

    const exhaustedAgent = createAgent();
    faux.setResponses([]);
    await awaitWithFailureWatchdog(
      exhaustedAgent.prompt("This request has no scripted response."),
      "exhausted faux-response run",
      () => exhaustedAgent.abort(),
    );
    const exhaustedMessage = exhaustedAgent.state.messages.at(-1);
    assert.equal(exhaustedMessage?.role, "assistant");
    if (exhaustedMessage?.role !== "assistant") {
      throw new Error("queue exhaustion must settle with an assistant message");
    }
    assert.equal(exhaustedMessage.stopReason, "error");
    assert.equal(
      exhaustedMessage.errorMessage,
      "No more faux responses queued",
    );
  } finally {
    unsubscribe?.();
    for (const agent of agents) agent.abort();
    try {
      await awaitWithFailureWatchdog(
        Promise.all(agents.map((agent) => agent.waitForIdle())),
        "Agent cleanup",
        () => {
          for (const agent of agents) agent.abort();
        },
      );
    } finally {
      models.deleteProvider(faux.provider.id);
      assert.equal(models.getProvider(faux.provider.id), undefined);
      assert.equal(
        models.getModel("deterministic-guide-faux", "calculator-model"),
        undefined,
      );
    }
  }
}

test(
  "runs a deterministic Agent without network access",
  verifyDeterministicAgentTestingGuide,
);
```

## 6. Cancel through AbortController

`Agent` owns the `AbortController` for its active run and exposes `agent.abort()`. A host often owns a different signal—for example, an HTTP request, job, or UI lifetime. The example bridges that host signal to `agent.abort()` with a one-shot listener, starts `prompt()`, waits for the assistant `message_start`, aborts the active provider stream, and still awaits settlement. Waiting on an event is deterministic; an arbitrary sequencing sleep would make the test sensitive to machine speed.

`awaitWithFailureWatchdog()` does not decide when to abort. It is a failure-only bound around each asynchronous wait. If the expected event or Agent settlement never arrives, the watchdog aborts the affected Agent and rejects with a label and elapsed bound. Its `finally` always clears the timer, including normal completion and early rejection.

Do not treat cancellation as a rejected `prompt()` promise. At this release boundary, the faux stream ends with an assistant message whose `stopReason` is `"aborted"` and whose `errorMessage` is `Request was aborted`. Awaiting the run proves it is idle before cleanup. Remove the bridge listener even though `{ once: true }` was used, so the ownership rule remains correct if the test changes before aborting.

## 7. Treat an exhausted queue as an error result

After `faux.setResponses([])`, the next provider call has no scripted step. Pi's faux provider returns an assistant result with `stopReason: "error"` and `errorMessage: "No more faux responses queued"`. The Agent appends that result and settles normally; the test therefore inspects the transcript rather than expecting `prompt()` to reject. The same failure-only watchdog bounds this `prompt()` so a regression cannot leave `node:test` waiting forever.

This behavior is useful fail-closed evidence. A missing fixture response cannot silently call a hosted provider or invent an answer. If the error appears unexpectedly, compare `faux.state.callCount` with the queue length and check whether a Tool call triggered an additional continuation request.

## 8. Clean up provider and model registration

The outer `finally` unsubscribes any listener and aborts all active Agents. A bounded cleanup wait then calls `waitForIdle()` for each Agent. Its nested `finally` still calls `models.deleteProvider(faux.provider.id)` if settlement reaches the watchdog bound. Deleting the provider also removes its models from that isolated collection, which the final two assertions prove.

For a larger suite, create a fresh fixture per test and register this cleanup in your runner's `afterEach`. Never reuse a partly consumed faux queue across tests. If a test owns temporary files or processes through its Tools, release those resources in the same cleanup boundary before deleting the provider.

## Troubleshooting

| Symptom | Likely cause | Check |
| --- | --- | --- |
| `No more faux responses queued` after the Tool call | Only the Tool-call response was queued | Queue one final assistant response for the continuation turn |
| `models.getModel()` returns `undefined` | Provider was not registered, or IDs differ | Call `models.setProvider(faux.provider)` and use the exact provider/model IDs |
| Tool never executes | Assistant response did not use `stopReason: "toolUse"`, or Tool names differ | Match `fauxToolCall("add", ...)` to `calculator.name` |
| Result exists but is not linked | Test or Tool reused a different call ID | Assert `toolCallId` in execution and in the second provider request |
| Cancellation finishes as `"stop"` | The response settled before the host signal reached the Agent | Bridge the signal before `prompt()` and abort while the run is active |
| Test process stays alive | A listener, Tool resource, timer, or process was not released | Unsubscribe, abort, await `waitForIdle()`, and clean Tool fixtures in `finally`/`afterEach` |

## Acceptance checklist

- [ ] The test installs exact `@earendil-works/pi-ai@0.85.0` and `@earendil-works/pi-agent-core@0.85.0` packages.
- [ ] It creates its own `Models` collection and never reads an API key.
- [ ] The faux queue contains a `ToolCall` response and a separate final response.
- [ ] Assertions cover provider requests, Tool arguments, result linkage, transcript order, final text, and final stop reason.
- [ ] An `AbortController` path produces a settled `"aborted"` assistant message.
- [ ] An empty queue produces the documented `"error"` assistant result.
- [ ] Failure-only watchdogs bound every Agent wait, abort on timeout, and clear their timers.
- [ ] Listener, Agent, provider, and model cleanup runs even when an assertion fails.
- [ ] `node --import tsx --test deterministic-agent.test.ts` completes without network access.

## Next

- [Chapter 11: Testing and Agent evaluation](../ch11-testing-evaluation.md) places this deterministic test in a broader evidence strategy.
- [Add a custom Tool](add-custom-tool.md) expands the Tool contract and error-handling boundary.
- The next guide explains how to run Pi's private, release-pinned evaluation package when deterministic contracts are already green.
