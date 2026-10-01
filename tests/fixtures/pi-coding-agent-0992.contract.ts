import { Type, type Static } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const LookupParameters = Type.Object({
  query: Type.String(),
});

const LookupOutput = Type.Object({
  matches: Type.Array(Type.String()),
});

type RouterState = {
  phase: "plan" | "build";
};

export function registerPi0992ExtensionContracts(pi: ExtensionAPI): void {
  pi.registerMcpServer("docs", {
    url: "https://docs.example.com/mcp",
    description: "Search the public documentation corpus.",
    exposure: "codemode",
    oauth: { clientName: "pi-docs-contract" },
  });

  pi.registerMcpServer("artifacts", {
    url: "https://artifacts.example.com/mcp",
    description: "Inspect authenticated build artifacts.",
    exposure: "deferred",
    auth: { provider: "openai" },
  });

  pi.registerTool({
    name: "docs_lookup",
    label: "Documentation lookup",
    description: "Look up a documentation path with the read tool.",
    parameters: LookupParameters,
    outputSchema: LookupOutput,
    exposure: "codemode",
    namespace: {
      name: "docs",
      description: "Documentation discovery tools.",
      instructions: "Use documentation lookups before relying on memory.",
    },
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
    },
    defaultActive: false,
    prepareLoadout: ({ callable }) => ({
      descriptions: {
        docs_lookup: `Look up documentation with ${callable.length} callable tools available.`,
      },
    }),
    async execute(_toolCallId, { query }, signal, _onUpdate, ctx) {
      const nested = await ctx.executeTool("read", { path: query }, { signal });
      const structuredContent = {
        matches: nested.isError ? [] : [query],
      } satisfies Static<typeof LookupOutput>;
      return {
        content: nested.result.content,
        details: { query, nested },
        structuredContent,
        isError: nested.isError,
      };
    },
  });

  pi.registerVirtualModel<RouterState>({
    provider: "router",
    id: "auto",
    name: "Auto",
    thinkingLevels: ["low", "high"],
    route(request, ctx) {
      const sticky = request.failed ?? request.previous;
      if (request.reason !== "user" && sticky) {
        return {
          model: sticky.model,
          thinkingLevel: sticky.thinkingLevel ?? "medium",
          state: request.state,
        };
      }

      const model = ctx.modelRegistry.find("openai", "gpt-6.1-sol");
      if (!model) {
        throw new Error("openai/gpt-6.1-sol is unavailable");
      }
      const state: RouterState = request.state ?? { phase: "plan" };
      return { model, thinkingLevel: "medium", state };
    },
  });
}
