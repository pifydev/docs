---
title: Route requests with Virtual Models
description: Register and operate Pi 0.99.2 Virtual Models with correct dispatch, retry, state, context, and accounting behavior.
translation_key: how-to-route-virtual-models
language: en
official_refs:
  - "https://github.com/earendil-works/pi/blob/005af57d88ee23b33778f343a9595b32e67ff788/packages/coding-agent/docs/virtual-models.md"
  - "https://github.com/earendil-works/pi/blob/005af57d88ee23b33778f343a9595b32e67ff788/packages/coding-agent/src/core/virtual-models.ts"
  - "https://github.com/earendil-works/pi/blob/005af57d88ee23b33778f343a9595b32e67ff788/packages/coding-agent/src/core/extensions/types.ts"
  - "https://github.com/earendil-works/pi/blob/005af57d88ee23b33778f343a9595b32e67ff788/packages/ai/src/models.ts"
  - "https://github.com/earendil-works/pi/blob/005af57d88ee23b33778f343a9595b32e67ff788/packages/coding-agent/CHANGELOG.md"
terms_used:
  - Virtual Model
  - ModelRouteReason
  - router state
  - physical model
  - classifier
status: reviewed
reviewed_by: Pify maintainers
last_updated: '2026-10-01'
---


A Virtual Model is a selectable catalog entry whose router chooses a physical chat model for every request. It is useful when routing must depend on task shape, cost, the selected thinking level, or branch-local state while the user keeps one model selected. This guide covers the operational contract in Pi `0.99.2`; a router is policy that you own, not an automatic quality oracle.

## Selection and dispatch

The selected pair contains the virtual provider/model plus the virtual thinking level and stays separate from the per-request dispatched pair, which contains the physical provider/model plus the physical thinking level. The virtual thinking level is an input to router policy; it does not have to equal the reasoning budget sent to the physical model.

Pi stores the virtual selection in `model_change` and `thinking_level_change` entries. The current selection remains visible through `/model`, `ctx.model`, `ctx.thinkingLevel`, `PI_MODEL`, and `PI_REASONING_LEVEL`, while a footer can show the current physical route beside it.

Provider requests receive only the physical dispatched model and thinking level; every assistant message produced by that dispatch records the physical model through its `provider`, `api`, `model`, and `thinkingLevel` fields. A virtual catalog entry never reaches a provider. If routing fails before dispatch, however, the error assistant message retains the virtual model. This separation makes replay across physical models behave like explicit model switches and makes the transcript an audit trail of actual dispatches.

## Register a virtual model

Register from an extension with `registerVirtualModel`. The following example is synchronized with the Virtual Model portion of the compile-checked Pi `0.99.2` contract fixture:

```typescript
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

type RouterState = {
  phase: "plan" | "build";
};

export default function (pi: ExtensionAPI): void {
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
```

The registration fields define both catalog presentation and routing behavior:

| Field | Operational meaning |
| --- | --- |
| `provider`, `id`, `name` | Where the selectable entry appears and how it is identified. `id` must not collide with a physical chat model under that provider; a later physical collision is hidden by the virtual entry. |
| `thinkingLevels` | Levels offered for the virtual selection; the default is `['off']`. |
| `contextWindow`, `maxTokens` | Provisional limits displayed before a physical response exists; omitted values are unknown. |
| `input` | Advertised selection inputs; it defaults to text and images. A routed physical model without image support receives placeholders. |
| `route(request, ctx)` | Public extension callback that returns the physical `model`, its `thinkingLevel`, and optional router `state`. It may be async. |

Use `ctx.modelRegistry.find(provider, id)` to look up a physical chat model in the current catalog snapshot and handle `undefined` explicitly. A returned model must be physical and its provider must have usable credentials: routing from one Virtual Model to another Virtual Model is invalid. `provider` may be a standalone ID or a provider that also owns physical models; availability follows that provider's authentication when it exists.

Registration is queued during initial extension loading and otherwise takes effect immediately, following provider registration and reload behavior. Registering the same `provider` and `id` replaces the definition. `pi.unregisterVirtualModel(provider, id)` removes it; `pi.unregisterProvider()` does not. SDK integrations can call `modelRuntime.registerVirtualModel(definition)` directly.

## Route user, continuation, retry, and direct requests

The `route` callback runs before each request made through the selected Virtual Model. Its `request.reason` is the `ModelRouteReason` union with exactly four values:

| Reason | When Pi routes |
| --- | --- |
| `user` | The first request after a user-authored prompt, steering message, or follow-up. |
| `continuation` | Another request inside the agent loop, including one after Tool results or extension messages. |
| `retry` | An automatic retry after a failed physical request, including a retry after compaction for context overflow. |
| `direct` | Work outside the agent loop, such as a compaction summary or an extension call to `ctx.modelRegistry.streamSimple()`. |

The request also supplies the selected virtual `model` and `thinkingLevel`, conversation `messages` including system messages, an abort `signal`, and the routing fields described below. Pi clamps a returned thinking level to a value supported by the physical model.

## Keep sticky turns and retries correct

For `continuation`, normally return `request.previous`, the physical model and thinking level of the latest successful response still represented by `messages`. For `retry`, normally return `request.failed`, which contains the physical model, thinking level, and failed assistant `message`; that message is no longer in `messages`, and exposes `stopReason` and `errorMessage`. Routing failure itself has no `request.failed` value.

If both candidates are present, `request.failed` takes precedence over `request.previous`, as in `request.failed ?? request.previous`. Keeping a continuation on `request.previous` and a retry on `request.failed` preserves provider prompt caches and thinking signatures. Deliberately switching at one of these boundaries is allowed, for example after overload or context overflow, but can lose the prompt cache or invalidate provider-specific thinking continuity.

## Persist JSON router state

Router state must be JSON-serializable; Pi stores it on the session branch so forks inherit the state at their fork point, it survives compaction, and Pi stores a changed object before dispatch even if the request later fails; return a new object only when the logical state changes to avoid unnecessary transcript churn. Pi passes the latest value back as `request.state`. Returning `undefined` or the same `request.state` object keeps the stored state rather than appending an equivalent replacement.

A direct request has no router state, so its `request.state` is absent and any returned state is ignored. Direct work must not advance a phase machine that belongs to the agent loop.

Use state only for decisions that the transcript does not already capture, such as a cached classification or a one-way `plan` to `build` transition. The transcript already records the virtual selection and every physical dispatch, available to extensions through `ctx.sessionManager.getBranch()`.

## Restore sessions and branches

On resume, Pi restores a registered virtual selection from the latest `model_change` entry even though later assistant messages name physical models. Branch navigation and forks restore the router state attached to their own branch, so two branches can advance independently.

If the selected Virtual Model is no longer registered, Pi cannot restore that virtual entry and normally falls back to the model from the latest successful physical response. At the pinned `0.99.2` implementation, `getBranchSelection()` chooses the latest non-virtual assistant entry without filtering its `stopReason`, so a later physical `error` or `aborted` response can become the fallback; a failed routing message remains virtual and is skipped. Re-register stable `provider` and `id` values before resuming sessions that depend on them.

## Account for context, compaction, and cost

Before any successful physical response exists, displayed context limits come from the Virtual Model's optional `contextWindow` and `maxTokens`; after a physical response exists, context usage follows the latest successful physical model's limits, even if that response predates selection of the Virtual Model. Routing still runs per request, and Pi checks compaction against the physical model selected for that dispatch; if its context window is too small, Pi compacts before sending without changing the router's choice.

Usage and cost belong to each dispatched physical model, never the zero-cost virtual catalog entry; Context accounting follows the physical response limits after the first successful response; Compaction is checked again against the physical model selected for each dispatch. `/session` therefore reports cost per physical model, including routed calls and retries.

## Use classifier and image operations deliberately

A router can use `ctx.modelRegistry.findOfType('classifier', provider, id)` and `ctx.modelRegistry.classify()` to classify structured state before choosing a chat model. That extra operation can improve policy inputs but adds latency before the routed chat model produces its first token, so cache the result in `request.state` when its decision scope spans multiple requests.

Classifier and image generation are separate `ModelRuntime` operations, not chat models. Use typed accessors such as `getModelsOfType()`, `getModelOfType()`, or `getAvailableOfType()` and then `classify()` or `generateImages()`; `getModels()` and `getModel()` are chat-only accessors. `getAllModels()` and `getAllAvailable()` intentionally span chat, image, and classifier entries. An upstream ID may therefore identify distinct entries for distinct operations; do not dispatch an image or classifier entry as the physical chat result of `route`.

## Failure modes and operational checklist

Pi does not guarantee that a router makes an optimal choice; Pi enforces the dispatch contract, while ranking quality, latency, cost policy, fallback order, and evaluation remain the extension author's responsibility.

The request ends with an error response if `route()` throws, returns an invalid result, returns another Virtual Model, or selects a physical provider without credentials. Treat a failed lookup as a routing error instead of using a non-null assertion, and expect a too-small selected context window to trigger compaction rather than automatic rerouting.

Before deploying a router:

- Verify every target is a physical chat model with credentials in each environment.
- Handle all four `ModelRouteReason` values and preserve sticky continuations and retries unless a measured policy justifies a switch.
- Keep state small, JSON-serializable, branch-local, and stable when unchanged; never depend on state from `direct` work.
- Exercise resume with the Virtual Model both registered and absent, plus fork navigation before and after compaction.
- Attribute context, tokens, and cost to the actual physical dispatch, and measure any classifier latency separately.
- Test thrown callbacks, missing catalog models, missing credentials, invalid Virtual Model returns, aborts, context overflow, and retry fallback.

## Release-pinned sources

This guide is pinned to release commit [`005af57d88ee23b33778f343a9595b32e67ff788`](https://github.com/earendil-works/pi/commit/005af57d88ee23b33778f343a9595b32e67ff788):

- [`packages/coding-agent/docs/virtual-models.md`](https://github.com/earendil-works/pi/blob/005af57d88ee23b33778f343a9595b32e67ff788/packages/coding-agent/docs/virtual-models.md)
- [`packages/coding-agent/src/core/virtual-models.ts`](https://github.com/earendil-works/pi/blob/005af57d88ee23b33778f343a9595b32e67ff788/packages/coding-agent/src/core/virtual-models.ts)
- [`packages/coding-agent/src/core/extensions/types.ts`](https://github.com/earendil-works/pi/blob/005af57d88ee23b33778f343a9595b32e67ff788/packages/coding-agent/src/core/extensions/types.ts)
- [`packages/ai/src/models.ts`](https://github.com/earendil-works/pi/blob/005af57d88ee23b33778f343a9595b32e67ff788/packages/ai/src/models.ts)
- [`packages/coding-agent/CHANGELOG.md`](https://github.com/earendil-works/pi/blob/005af57d88ee23b33778f343a9595b32e67ff788/packages/coding-agent/CHANGELOG.md)

Release history: [`v0.99.0`](https://github.com/earendil-works/pi/releases/tag/v0.99.0), [`v0.99.1`](https://github.com/earendil-works/pi/releases/tag/v0.99.1), and [`v0.99.2`](https://github.com/earendil-works/pi/releases/tag/v0.99.2).
