import assert from "node:assert/strict";

import {
  createModels,
  fauxAssistantMessage,
  fauxProvider,
  fauxText,
  fauxToolCall,
  getCurrentSystemPrompt,
  getCurrentTools,
  Type,
  type AnthropicMessagesCompat,
  type GoogleApiThinkingLevel,
  type GoogleOptions,
  type OpenAICompletionsCompat,
  type OpenAIResponsesCompat,
  type ResolvedGoogleThinkingLevel,
  type TranscriptContext,
} from "@earendil-works/pi-ai";
import {
  Agent,
  type AgentEvent,
  type AgentTool,
  type FinishTurn,
} from "@earendil-works/pi-agent-core";
import {
  type AgentBeforeSettleEvent,
  type AgentSession,
  type AgentSessionRuntime,
  type AgentSessionRuntimeDiagnostic,
  type ContextEditEntry,
  type CreateAgentSessionRuntimeFactory,
  type CreateAgentSessionServicesOptions,
  createAgentSession,
  createAgentSessionFromServices,
  createAgentSessionRuntime,
  createAgentSessionServices,
  createPowerShellTool,
  detectSupportedImageMimeTypeFromFile,
  type FileEntry,
  type PowerShellOperations,
  type PowerShellToolOptions,
  SessionManager,
  type TurnEndEvent,
  type UIPromptEndEvent,
  type UIPromptKind,
  type UIPromptStartEvent,
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
const anthropicCompat = {
  supportsMidConvoEffort: true,
} satisfies AnthropicMessagesCompat;
const completionsCompat = {
  vllmPriority: -1,
} satisfies OpenAICompletionsCompat;
const responsesCompat = {
  supportsMaxOutputTokens: false,
} satisfies OpenAIResponsesCompat;
const promptKind: UIPromptKind = "custom";
const promptStart: UIPromptStartEvent = {
  type: "ui_prompt_start",
  reason: "ui_prompt",
  kind: promptKind,
};
const promptEnd: UIPromptEndEvent = {
  type: "ui_prompt_end",
  reason: "ui_prompt",
  kind: promptKind,
};
const imageMimeDetector =
  detectSupportedImageMimeTypeFromFile satisfies typeof detectSupportedImageMimeTypeFromFile;

const finishAfterNormalResponse: FinishTurn = ({ message }) => {
  if (message.stopReason === "error" || message.stopReason === "aborted") {
    return undefined;
  }
  return { action: "end" };
};

const boundaryTypes = {
  beforeSettle: undefined as AgentBeforeSettleEvent | undefined,
  turnEnd: undefined as TurnEndEvent | undefined,
};

export function omitEntryFromFutureContext(
  manager: SessionManager,
  targetId: string,
): ContextEditEntry["id"] {
  return manager.appendContextEdit(targetId, null);
}

export function restoreExternalSessionEntries(
  sessionId: string,
  entries: FileEntry[],
  cwd = process.cwd(),
): SessionManager {
  return SessionManager.inMemory(cwd, { id: sessionId }, entries);
}

async function verifyDeterministicAgentRoundTrip(): Promise<void> {
  type ProviderRequestSummary = {
    roles: Array<TranscriptContext["messages"][number]["role"]>;
    systemPrompt: string;
    toolNames: string[];
    messages: TranscriptContext["messages"];
  };
  const requests: ProviderRequestSummary[] = [];
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
          fauxText("I will use the add Tool."),
          fauxToolCall("add", { left: 20, right: 22 }, { id: "add-1" }),
        ],
        { stopReason: "toolUse" },
      );
    },
    (context) => {
      captureTranscriptRequest(requests, context);
      return fauxAssistantMessage(fauxText("The total is 42."));
    },
  ]);

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

  let agent: Agent | undefined;
  try {
    const model = models.getModel("chapter-11-faux", "chapter-11-model");
    assert.ok(
      model,
      "the isolated Models collection must expose the faux model",
    );

    agent = new Agent({
      streamFn: models.streamSimple.bind(models),
      initialState: {
        systemPrompt: "Use the add Tool for arithmetic.",
        model,
        thinkingLevel: "off",
        tools: [addTool],
      },
    });

    await awaitWithFailureWatchdog(
      agent.prompt("What is 20 + 22?"),
      "Chapter 11 Agent run",
      () => agent?.abort(),
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

    const requestToolResult = requests[1]?.messages[3];
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
      ["system", "user", "assistant", "toolResult", "assistant"],
    );
    const finalMessage = agent.state.messages.at(-1);
    assert.equal(finalMessage?.role, "assistant");
    if (finalMessage?.role !== "assistant") {
      throw new Error("transcript must end with an assistant response");
    }
    assert.equal(finalMessage.stopReason, "stop");
    assert.deepEqual(finalMessage.content, [fauxText("The total is 42.")]);
  } finally {
    try {
      agent?.abort();
      if (agent) {
        await awaitWithFailureWatchdog(
          agent.waitForIdle(),
          "Chapter 11 Agent cleanup",
          () => agent?.abort(),
        );
      }
    } finally {
      models.deleteProvider(faux.provider.id);
      assert.equal(models.getProvider(faux.provider.id), undefined);
    }
  }
}

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

export function throwSessionBindingFailure(
  primary: unknown,
  cleanupFailures: readonly unknown[],
  phase: string,
): never {
  if (cleanupFailures.length === 0) throw primary;
  throw new AggregateError(
    [primary, ...cleanupFailures],
    `${phase} failed and cleanup also failed`,
    { cause: primary },
  );
}

export async function bindSerializedSessionRuntimeHost(
  runtime: Pick<
    AgentSessionRuntime,
    | "session"
    | "cwd"
    | "diagnostics"
    | "setBeforeSessionInvalidate"
    | "setRebindSession"
    | "newSession"
    | "switchSession"
    | "fork"
    | "importFromJsonl"
    | "dispose"
  >,
  bindings: {
    extensionBindings(
      session: AgentSession,
    ): Parameters<AgentSession["bindExtensions"]>[0];
    subscribe(session: AgentSession): () => void;
    reportDiagnostics(
      diagnostics: readonly AgentSessionRuntimeDiagnostic[],
    ): void;
    flushPersistence(): Promise<void>;
  },
): Promise<{
  readonly cwd: string;
  readonly diagnostics: readonly AgentSessionRuntimeDiagnostic[];
  newSession(): ReturnType<AgentSessionRuntime["newSession"]>;
  resume(
    sessionPath: string,
    cwdOverride?: string,
  ): ReturnType<AgentSessionRuntime["switchSession"]>;
  fork(entryId: string): ReturnType<AgentSessionRuntime["fork"]>;
  clone(entryId: string): ReturnType<AgentSessionRuntime["fork"]>;
  importJsonl(
    inputPath: string,
    cwdOverride?: string,
  ): ReturnType<AgentSessionRuntime["importFromJsonl"]>;
  dispose(): Promise<void>;
}> {
  let tail: Promise<void> = Promise.resolve();
  let unsubscribe: (() => void) | undefined;
  let invalidationCleanupFailures: unknown[] = [];
  let replacementInFlight = false;
  let unusable = false;
  let disposed = false;

  class CapturedSessionBindingFailure {
    constructor(
      readonly primary: unknown,
      readonly cleanupFailures: unknown[],
    ) {}
  }

  const clearSubscription = () => {
    const release = unsubscribe;
    unsubscribe = undefined;
    release?.();
  };
  const clearSubscriptionAfterFailure = (cleanupFailures: unknown[]) => {
    try {
      clearSubscription();
    } catch (error) {
      cleanupFailures.push(error);
    }
  };
  const takeInvalidationCleanupFailures = () => {
    const failures = invalidationCleanupFailures;
    invalidationCleanupFailures = [];
    return failures;
  };
  const bindSession = async (session: AgentSession) => {
    try {
      clearSubscription();
      await session.bindExtensions(bindings.extensionBindings(session));
      unsubscribe = bindings.subscribe(session);
      bindings.reportDiagnostics(runtime.diagnostics);
    } catch (error) {
      const cleanupFailures: unknown[] = [];
      clearSubscriptionAfterFailure(cleanupFailures);
      throw new CapturedSessionBindingFailure(error, cleanupFailures);
    }
  };
  const disposeRuntimeFailure = async (
    error: unknown,
    phase: string,
  ): Promise<never> => {
    const captured =
      error instanceof CapturedSessionBindingFailure
        ? error
        : new CapturedSessionBindingFailure(error, []);
    replacementInFlight = true;
    unusable = true;
    const cleanupFailures = [...captured.cleanupFailures];
    try {
      clearSubscriptionAfterFailure(cleanupFailures);
      try {
        await runtime.dispose();
      } catch (disposeError) {
        cleanupFailures.push(disposeError);
      }
    } finally {
      replacementInFlight = true;
      unusable = true;
      clearSubscriptionAfterFailure(cleanupFailures);
    }
    return throwSessionBindingFailure(captured.primary, cleanupFailures, phase);
  };
  const assertAvailable = () => {
    if (disposed) throw new Error("session runtime host is disposed");
    if (unusable || replacementInFlight) {
      throw new Error("session runtime host has no usable current session");
    }
  };
  const enqueue = <T>(operation: () => Promise<T>): Promise<T> => {
    const pending = tail.then(operation);
    tail = pending.then(
      () => undefined,
      () => undefined,
    );
    return pending;
  };
  const serialize = <T>(operation: () => Promise<T>): Promise<T> =>
    enqueue(async () => {
      assertAvailable();
      try {
        return await operation();
      } catch (error) {
        if (replacementInFlight) {
          unusable = true;
          return throwSessionBindingFailure(
            error,
            takeInvalidationCleanupFailures(),
            "session replacement",
          );
        }
        throw error;
      }
    });
  const replace = <T>(operation: () => Promise<T>): Promise<T> =>
    serialize(async () => {
      const result = await operation();
      try {
        await bindings.flushPersistence();
      } catch (error) {
        return disposeRuntimeFailure(error, "replacement persistence");
      }
      return result;
    });

  runtime.setBeforeSessionInvalidate(() => {
    replacementInFlight = true;
    clearSubscriptionAfterFailure(invalidationCleanupFailures);
  });
  runtime.setRebindSession(async (session) => {
    const cleanupFailures = takeInvalidationCleanupFailures();
    if (cleanupFailures.length > 0) {
      const [primary, ...remaining] = cleanupFailures;
      return disposeRuntimeFailure(
        new CapturedSessionBindingFailure(primary, remaining),
        "replacement invalidation cleanup",
      );
    }
    try {
      await bindSession(session);
      replacementInFlight = false;
    } catch (error) {
      return disposeRuntimeFailure(error, "replacement session binding");
    }
  });

  try {
    await bindSession(runtime.session);
  } catch (error) {
    return disposeRuntimeFailure(error, "initial session binding");
  }

  const dispose = (): Promise<void> => {
    if (disposed) {
      return Promise.reject(new Error("session runtime host is disposed"));
    }
    disposed = true;
    unusable = true;
    return enqueue(async () => {
      const failures: unknown[] = [];
      try {
        await runtime.session.abort();
      } catch (error) {
        failures.push(error);
      }
      try {
        await bindings.flushPersistence();
      } catch (error) {
        failures.push(error);
      }
      let runtimeDisposeFailure: unknown;
      let runtimeDisposeFailed = false;
      try {
        await runtime.dispose();
      } catch (error) {
        runtimeDisposeFailed = true;
        runtimeDisposeFailure = error;
      }
      failures.push(...takeInvalidationCleanupFailures());
      if (runtimeDisposeFailed) failures.push(runtimeDisposeFailure);
      clearSubscriptionAfterFailure(failures);
      if (failures.length > 0) {
        const [primary, ...cleanupFailures] = failures;
        return throwSessionBindingFailure(
          primary,
          cleanupFailures,
          "final session runtime disposal",
        );
      }
    });
  };

  return {
    get cwd() {
      assertAvailable();
      return runtime.cwd;
    },
    get diagnostics() {
      assertAvailable();
      return runtime.diagnostics;
    },
    newSession: () => replace(() => runtime.newSession()),
    resume: (sessionPath, cwdOverride) =>
      replace(() => runtime.switchSession(sessionPath, { cwdOverride })),
    fork: (entryId) => replace(() => runtime.fork(entryId)),
    clone: (entryId) =>
      replace(() => runtime.fork(entryId, { position: "at" })),
    importJsonl: (inputPath, cwdOverride) =>
      replace(() => runtime.importFromJsonl(inputPath, cwdOverride)),
    dispose,
  };
}

export async function createSerializedSessionRuntimeHost(
  processInputs: Pick<
    CreateAgentSessionServicesOptions,
    | "modelRuntimeSignal"
    | "extensionFlagValues"
    | "resourceLoaderOptions"
    | "resourceLoaderReloadOptions"
  > & {
    tools?: string[];
    authorizeProject?: (options: {
      cwd: string;
      projectTrustContext: Parameters<CreateAgentSessionRuntimeFactory>[0]["projectTrustContext"];
    }) => Promise<void>;
  },
  initial: Parameters<typeof createAgentSessionRuntime>[1],
  bindings: {
    extensionBindings(
      session: AgentSession,
    ): Parameters<AgentSession["bindExtensions"]>[0];
    subscribe(session: AgentSession): () => void;
    reportDiagnostics(
      diagnostics: readonly AgentSessionRuntimeDiagnostic[],
    ): void;
    flushPersistence(): Promise<void>;
  },
): Promise<{
  readonly cwd: string;
  readonly diagnostics: readonly AgentSessionRuntimeDiagnostic[];
  newSession(): ReturnType<AgentSessionRuntime["newSession"]>;
  resume(
    sessionPath: string,
    cwdOverride?: string,
  ): ReturnType<AgentSessionRuntime["switchSession"]>;
  fork(entryId: string): ReturnType<AgentSessionRuntime["fork"]>;
  clone(entryId: string): ReturnType<AgentSessionRuntime["fork"]>;
  importJsonl(
    inputPath: string,
    cwdOverride?: string,
  ): ReturnType<AgentSessionRuntime["importFromJsonl"]>;
  dispose(): Promise<void>;
}> {
  const { tools, authorizeProject, ...serviceInputs } = processInputs;
  const createRuntime: CreateAgentSessionRuntimeFactory = async ({
    cwd,
    agentDir,
    sessionManager,
    sessionStartEvent,
    projectTrustContext,
  }) => {
    await authorizeProject?.({ cwd, projectTrustContext });
    const services = await createAgentSessionServices({
      ...serviceInputs,
      cwd,
      agentDir,
    });
    const created = await createAgentSessionFromServices({
      services,
      sessionManager,
      sessionStartEvent,
      tools,
    });
    return {
      ...created,
      services,
      diagnostics: [...services.diagnostics],
    };
  };

  const runtime: AgentSessionRuntime = await createAgentSessionRuntime(
    createRuntime,
    initial,
  );
  return bindSerializedSessionRuntimeHost(runtime, bindings);
}

void [
  finishAfterNormalResponse,
  boundaryTypes,
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
  anthropicCompat,
  completionsCompat,
  responsesCompat,
  promptKind,
  promptStart,
  promptEnd,
  imageMimeDetector,
  restoreExternalSessionEntries,
  verifyDeterministicAgentRoundTrip,
  verifyDeterministicAgentTestingGuide,
  createSerializedSessionRuntimeHost,
];
