import {
  fauxAssistantMessage,
  fauxProvider,
  fauxText,
  fauxToolCall,
  type GoogleApiThinkingLevel,
  type ResolvedGoogleThinkingLevel,
} from "@earendil-works/pi-ai";
import { Agent } from "@earendil-works/pi-agent-core";
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
const googleThinkingLevel = "HIGH" satisfies GoogleApiThinkingLevel;
const resolvedGoogleThinkingLevel =
  "high" satisfies ResolvedGoogleThinkingLevel;
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

void [
  agentConstructor,
  fauxProviderFactory,
  fauxAssistantMessageFactory,
  fauxTextFactory,
  fauxToolCallFactory,
  sessionFactory,
  sessionRuntimeFactory,
  powerShellToolFactory,
  googleThinkingLevel,
  resolvedGoogleThinkingLevel,
  powerShellOperations,
  powerShellToolOptions,
  customizedPowerShellTool,
];
