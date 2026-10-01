import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { createModels } from "@earendil-works/pi-ai/models";
import {
  createRegistry,
  Harness,
  MemoryStorage,
  type Conversation,
} from "@earendil-works/pi-durable";

export async function verifyPi0992DurableContracts(): Promise<number> {
  const context = BACKGROUND_CONTEXT;
  const harness = await Harness.open(
    new MemoryStorage(),
    {
      models: createModels(),
      registry: createRegistry(),
    },
    context,
  );

  try {
    const root: Conversation = await harness.root(context);
    await root.setCompaction(
      {
        enabled: true,
        reserveTokens: 16_384,
        keepRecentTokens: 20_000,
        backgroundTokens: 32_768,
      },
      context,
    );
    const view = await root.viewState(context);
    try {
      void view.value;
    } finally {
      view.dispose();
    }
    return root.id;
  } finally {
    await harness.close(context);
  }
}
