import assert from "node:assert/strict";

import {
  createModels,
  fauxAssistantMessage,
  fauxProvider,
  fauxText,
  fauxToolCall,
  Type,
  type Context,
  type GoogleApiThinkingLevel,
  type GoogleOptions,
  type ResolvedGoogleThinkingLevel,
} from "@earendil-works/pi-ai";
import {
  Agent,
  type AgentEvent,
  type AgentTool,
} from "@earendil-works/pi-agent-core";
import {
  createAgentSession,
  createAgentSessionRuntime,
  createPowerShellTool,
  type PowerShellOperations,
  type PowerShellToolOptions,
} from "@earendil-works/pi-coding-agent";

const agentConstructor = Agent satisfies typeof Agent;
const fauxProviderFactory = fauxProvider satisfies typeof fauxProvider;
const fauxAssistantMessageFactory =
  fauxAssistantMessage satisfies typeof fauxAssistantMessage;
const fauxTextFactory = fauxText satisfies typeof fauxText;
const fauxToolCallFactory = fauxToolCall satisfies typeof fauxToolCall;
const sessionFactory = createAgentSession satisfies typeof createAgentSession;
const sessionRuntimeFactory =
  createAgentSessionRuntime satisfies typeof createAgentSessionRuntime;
const powerShellToolFactory =
  createPowerShellTool satisfies typeof createPowerShellTool;
const googleApiThinkingLevel: GoogleApiThinkingLevel = "HIGH";
const googleApiOptions = {
  thinking: { enabled: true, level: googleApiThinkingLevel },
} satisfies GoogleOptions;
const normalizedGoogleThinkingBudgets: Record<
  ResolvedGoogleThinkingLevel,
  number
> = {
  minimal: 1_024,
  low: 2_048,
  medium: 8_192,
  high: 16_384,
};
const powerShellOperations: PowerShellOperations = {
  async exec(command, cwd, { onData, signal, timeout, env }) {
    void [command, cwd, timeout, env];
    if (signal?.aborted) return { exitCode: null };
    onData(Buffer.from("compile-only PowerShell operations"));
    return { exitCode: 0 };
  },
};
const powerShellToolOptions: PowerShellToolOptions = {
  operations: powerShellOperations,
  exposeSessionEnvironment: false,
  spawnHook: (context) => ({
    ...context,
    env: { ...context.env, PI_CONTRACT_FIXTURE: "1" },
  }),
};
const customizedPowerShellTool = createPowerShellTool(
  "C:\\workspace",
  powerShellToolOptions,
);

async function verifyDeterministicAgentRoundTrip(): Promise<void> {
  const requests: Array<{
    roles: Array<Context["messages"][number]["role"]>;
    toolNames: string[];
    messages: Context["messages"];
  }> = [];
  const models = createModels();
  const faux = fauxProvider({
    provider: "chapter-11-faux",
    models: [{ id: "chapter-11-model", reasoning: false }],
  });
  models.setProvider(faux.provider);

  const addParameters = Type.Object({
    left: Type.Number(),
    right: Type.Number(),
  });
  const addTool: AgentTool<typeof addParameters, { total: number }> = {
    name: "add",
    label: "Add two numbers",
    description: "Return the sum of two numbers",
    parameters: addParameters,
    async execute(toolCallId, { left, right }) {
      assert.equal(toolCallId, "add-1");
      const total = left + right;
      return { content: [fauxText(String(total))], details: { total } };
    },
  };

  const captureRequest = (context: Context) => {
    requests.push({
      roles: context.messages.map((message) => message.role),
      toolNames: context.tools?.map((tool) => tool.name) ?? [],
      messages: structuredClone(context.messages),
    });
  };

  faux.setResponses([
    (context) => {
      captureRequest(context);
      return fauxAssistantMessage(
        [
          fauxText("I will use the add Tool."),
          fauxToolCall("add", { left: 20, right: 22 }, { id: "add-1" }),
        ],
        { stopReason: "toolUse" },
      );
    },
    (context) => {
      captureRequest(context);
      return fauxAssistantMessage(fauxText("The total is 42."));
    },
  ]);

  try {
    const model = models.getModel("chapter-11-faux", "chapter-11-model");
    assert.ok(
      model,
      "the isolated Models collection must expose the faux model",
    );

    const agent = new Agent({
      streamFn: models.streamSimple.bind(models),
      initialState: {
        systemPrompt: "Use the add Tool for arithmetic.",
        model,
        thinkingLevel: "off",
        tools: [addTool],
      },
    });

    await agent.prompt("What is 20 + 22?");

    assert.equal(faux.state.callCount, 2);
    assert.equal(faux.getPendingResponseCount(), 0);
    assert.deepEqual(requests[0]?.roles, ["user"]);
    assert.deepEqual(requests[0]?.toolNames, ["add"]);
    assert.deepEqual(requests[1]?.roles, ["user", "assistant", "toolResult"]);

    const requestToolResult = requests[1]?.messages[2];
    assert.equal(requestToolResult?.role, "toolResult");
    if (requestToolResult?.role !== "toolResult") {
      throw new Error("second provider request must contain a Tool result");
    }
    assert.equal(requestToolResult.toolCallId, "add-1");
    assert.equal(requestToolResult.toolName, "add");
    assert.equal(requestToolResult.isError, false);
    assert.deepEqual(requestToolResult.content, [fauxText("42")]);

    assert.deepEqual(
      agent.state.messages.map((message) => message.role),
      ["user", "assistant", "toolResult", "assistant"],
    );
    const finalMessage = agent.state.messages.at(-1);
    assert.equal(finalMessage?.role, "assistant");
    if (finalMessage?.role !== "assistant") {
      throw new Error("transcript must end with an assistant response");
    }
    assert.equal(finalMessage.stopReason, "stop");
    assert.deepEqual(finalMessage.content, [fauxText("The total is 42.")]);
  } finally {
    models.deleteProvider(faux.provider.id);
    assert.equal(models.getProvider(faux.provider.id), undefined);
  }
}

export async function verifyDeterministicAgentTestingGuide(): Promise<void> {
  const requests: Array<{
    roles: Array<Context["messages"][number]["role"]>;
    messages: Context["messages"];
    toolNames: string[];
  }> = [];
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

  let unsubscribe: (() => void) | undefined;
  try {
    const agent = createAgent();
    unsubscribe = agent.subscribe((event) => {
      eventTypes.push(event.type);
    });
    const captureRequest = (context: Context) => {
      requests.push({
        roles: context.messages.map((message) => message.role),
        messages: structuredClone(context.messages),
        toolNames: context.tools?.map((tool) => tool.name) ?? [],
      });
    };

    faux.setResponses([
      (context) => {
        captureRequest(context);
        return fauxAssistantMessage(
          [
            fauxText("I will call the add Tool."),
            fauxToolCall("add", { left: 20, right: 22 }, { id: "sum-1" }),
          ],
          { stopReason: "toolUse" },
        );
      },
      (context) => {
        captureRequest(context);
        return fauxAssistantMessage(fauxText("The total is 42."));
      },
    ]);

    await agent.prompt("What is 20 + 22?");

    assert.equal(faux.state.callCount, 2);
    assert.equal(faux.getPendingResponseCount(), 0);
    assert.deepEqual(requests[0]?.roles, ["user"]);
    assert.deepEqual(requests[0]?.toolNames, ["add"]);
    assert.deepEqual(requests[1]?.roles, ["user", "assistant", "toolResult"]);
    assert.deepEqual(executedCalls, [
      { toolCallId: "sum-1", args: { left: 20, right: 22 } },
    ]);

    const requestToolResult = requests[1]?.messages[2];
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
      ["user", "assistant", "toolResult", "assistant"],
    );
    const finalMessage = agent.state.messages.at(-1);
    assert.equal(finalMessage?.role, "assistant");
    if (finalMessage?.role !== "assistant") {
      throw new Error("the transcript must end with an assistant message");
    }
    assert.equal(finalMessage.stopReason, "stop");
    assert.deepEqual(finalMessage.content, [fauxText("The total is 42.")]);
    assert.ok(
      eventTypes.indexOf("tool_execution_start") <
        eventTypes.indexOf("tool_execution_end"),
    );
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
      await assistantStarted;
      cancellation.abort();
      await cancelledRun;
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
    await exhaustedAgent.prompt("This request has no scripted response.");
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
    await Promise.all(agents.map((agent) => agent.waitForIdle()));
    models.deleteProvider(faux.provider.id);
    assert.equal(models.getProvider(faux.provider.id), undefined);
    assert.equal(
      models.getModel("deterministic-guide-faux", "calculator-model"),
      undefined,
    );
  }
}

void [
  agentConstructor,
  fauxProviderFactory,
  fauxAssistantMessageFactory,
  fauxTextFactory,
  fauxToolCallFactory,
  sessionFactory,
  sessionRuntimeFactory,
  powerShellToolFactory,
  googleApiThinkingLevel,
  googleApiOptions,
  normalizedGoogleThinkingBudgets,
  powerShellOperations,
  powerShellToolOptions,
  customizedPowerShellTool,
  verifyDeterministicAgentRoundTrip,
  verifyDeterministicAgentTestingGuide,
];
