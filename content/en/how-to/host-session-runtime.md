---
title: Host a replaceable Pi session runtime
description: Build a serialized host around Pi 0.99.2 that safely replaces sessions across new, resume, fork, clone, and import operations.
translation_key: how-to-host-session-runtime
language: en
source_url: "https://docs.pify.dev/en/how-to/host-session-runtime"
official_refs:
  - "https://github.com/earendil-works/pi/blob/005af57d88ee23b33778f343a9595b32e67ff788/packages/coding-agent/src/core/agent-session.ts"
  - "https://github.com/earendil-works/pi/blob/005af57d88ee23b33778f343a9595b32e67ff788/packages/coding-agent/src/core/agent-session-runtime.ts"
  - "https://github.com/earendil-works/pi/blob/005af57d88ee23b33778f343a9595b32e67ff788/packages/coding-agent/src/core/agent-session-services.ts"
  - "https://github.com/earendil-works/pi/blob/005af57d88ee23b33778f343a9595b32e67ff788/packages/coding-agent/src/core/sdk.ts"
terms_used:
  - composition root
  - fail-closed
  - harness
status: reviewed
reviewed_by: Pify maintainers
last_updated: '2026-10-01'
translator: Pify maintainers
---

A long-running server, desktop shell, or RPC process cannot treat an `AgentSession` as permanent when users can start a new session, resume another project, fork history, clone a branch, or import JSONL. Pi `0.99.2` provides `AgentSessionRuntime` as the replacement boundary: it owns the current session and its cwd-bound services, while the host remains responsible for serialization, subscriptions, diagnostics, and failure policy.

This guide builds that host boundary with only public exports originally documented for `@earendil-works/pi-coding-agent@0.99.2`. The complete TypeScript shape is synchronized with `tests/fixtures/pi-sdk-0992.contract.ts` and compile-checked against the installed `@earendil-works/pi-coding-agent@0.99.2` declarations. It accepts dependencies instead of constructing real resources during the check.

Before importing that public root on Node.js `>=22.19.0`, install the SDK with `npm install @earendil-works/pi-coding-agent@0.99.2`. This guide was audited against Pi `v0.99.2`, commit `005af57d88ee23b33778f343a9595b32e67ff788`.

For RPC prompts, a handled input is resolved before any streaming queue decision and produces disposition `handled` without starting or queueing a run. An unhandled prompt received while streaming must set `streamingBehavior` to `steer` or `followUp`; the authoritative preflight disposition then distinguishes `started` from `queued`. Extension commands and input handlers therefore keep their interception boundary, and the response acknowledges prompt acceptance rather than completion of the resulting Agent run.

For replacement, `abort()` stops the active run and the runtime awaits it to settle before replacement teardown continues, preserving the aborted turn and completed Tool results in the outgoing session. The boundary is non-transactional: a replacement failure after teardown has no rollback to the disposed old session. A host that must not expose a half-replaced runtime therefore needs the fail-closed wrapper described below.

## Outcome

By the end, you will be able to:

- choose between a one-session factory and a replaceable runtime;
- keep process-global intent separate from services that must be rebuilt for a target cwd;
- serialize every replacement operation through one host lock;
- detach listeners before the old session becomes invalid, bind the replacement's Extension lifecycle, and only then install host listeners;
- stop exposing the runtime if creation fails after teardown;
- verify cwd, diagnostics, persistence, and disposal behavior at the host boundary.

## 1. Choose `createAgentSession()` or `createAgentSessionRuntime()`

Use the smallest lifecycle owner that matches the application.

| Requirement | `createAgentSession()` | `createAgentSessionRuntime()` |
| --- | --- | --- |
| One fixed cwd and one session lifetime | Preferred | Unnecessary indirection |
| Host restarts to open a different session | Sufficient | Optional |
| In-process new, resume, fork, clone, or import | Host must rebuild and swap everything itself | Preferred replacement boundary |
| Recreate settings, resources, Extensions, model scope, and Tools for a changed cwd | Manual | Factory is invoked with the effective cwd |
| Rebind UI, RPC, telemetry, or persistence listeners | Manual | Use `setBeforeSessionInvalidate()` and `setRebindSession()` |

`createAgentSession()` returns a session plus extension and model-fallback data. The caller still owns that session and must dispose it. `createAgentSessionRuntime()` first invokes a typed factory, then returns an `AgentSessionRuntime` that reuses the same factory for subsequent replacements.

The runtime is a lifecycle coordinator, not a concurrency lock or a transactional database. Add a host wrapper when commands can arrive concurrently or when a failed replacement must make the process fail-closed.

## 2. Separate process-global inputs from cwd-bound inputs

Resolve process-global intent once in the composition root. Keep explicit resource paths absolute so a later cwd switch does not reinterpret them.

| Lifetime | Examples | Rule |
| --- | --- | --- |
| Process-global | `agentDir`, shutdown `AbortSignal`, CLI Tool allowlist, absolute extra resource paths, telemetry sink, host persistence adapter, project-trust policy | Close over or inject these into the runtime factory |
| Cwd-bound | `SettingsManager`, `ResourceLoader`, project Extensions and provider registrations, effective model/Tool resolution, `SessionManager`, `AgentSession` | Recreate or resolve these inside the factory for every effective cwd |

`createAgentSessionServices()` creates coherent cwd-bound services. `createAgentSessionFromServices()` then creates the session against those services and the selected `SessionManager`. This two-stage API prevents settings or Extensions from the startup directory leaking into a resumed session from another project.

Project trust is also evaluated for the target cwd. The example injects `authorizeProject(...)`; a production host can use the factory's `projectTrustContext` to ask through its own UI or policy layer before loading project-controlled resources.

## 3. Implement a typed `CreateAgentSessionRuntimeFactory`

The code below is the complete compile-only host shape. `CreateAgentSessionRuntimeFactory` forces the factory to return the new session, its matching services, and diagnostics as one coherent result. `bindSerializedSessionRuntimeHost()` owns lifecycle policy through a narrow `Pick<AgentSessionRuntime, ...>` port; a real `AgentSessionRuntime` satisfies it, while tests can inject an in-memory fake. Neither exported function is invoked by the compile fixture, so compilation does not read credentials, scan a project, or open a session file.

```typescript title="replaceable-session-runtime.ts"
import {
  type AgentSession,
  type AgentSessionRuntime,
  type AgentSessionRuntimeDiagnostic,
  type CreateAgentSessionRuntimeFactory,
  type CreateAgentSessionServicesOptions,
  createAgentSessionFromServices,
  createAgentSessionRuntime,
  createAgentSessionServices,
} from "@earendil-works/pi-coding-agent";

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
```

The factory deliberately returns a copy of `services.diagnostics`. Add host-specific diagnostics, model selection, custom Tools, and trust results before returning, but keep them associated with that exact `services` and `session` pair.

## 4. Create the initial runtime

The caller supplies an initial `cwd`, `agentDir`, and `SessionManager` through the `initial` argument. In a real composition root, create the manager only after deciding whether startup means a fresh session, an in-memory session, a recent session, or a specific file. The manager's effective cwd must exist; `createAgentSessionRuntime()` validates that boundary before invoking the factory.

Initial creation is atomic from the caller's perspective: the helper returns only after the factory has produced a complete `AgentSessionRuntime`, `bindExtensions(...)` has completed the initial Extension lifecycle, and the first host subscription has been bound. If authorization, service loading, Extension binding, or session creation rejects, no wrapper is returned.

Do not resolve project settings or relative Extension paths before the effective session cwd is known. A resume or import can select a session whose cwd differs from `process.cwd()`.

## 5. Bind host subscriptions to the current `AgentSession`

`bindings.extensionBindings(session)` returns the public options shape through `Parameters<AgentSession["bindExtensions"]>[0]`; the guide does not need to import Pi's non-top-level `ExtensionBindings` type. Supply the mode, UI context, command actions, abort/shutdown handlers, and error listener required by your host. The callbacks may close over the wrapper's serialized operations, but they must not bypass its lock.

`await session.bindExtensions(...)` applies those bindings, emits that session's `session_start` event, and lets Extensions extend the loaded resources. It must complete for the initial session and every replacement before the host publishes events from that session. `bindings.subscribe(session)` then becomes the ownership boundary for UI rendering, RPC notifications, telemetry, or transcript projection. It must return one idempotent unsubscribe function that removes every host listener installed for that session.

The shared asynchronous `bindSession()` helper enforces this order for both paths: clear any stale host subscription, await Extension binding, install the host subscription, and report diagnostics. If Extension binding, subscription installation, or diagnostic reporting throws, its catch path removes any unsubscribe handle already returned. A `subscribe(...)` adapter must itself be atomic: if it throws before returning a cleanup function, it must roll back any partial listener installation internally. Avoid caching `runtime.session` in another service; pass session-derived events through the binding adapter instead.

If initial Extension or host binding fails, the example clears any returned subscription, marks the host unavailable, disposes the just-created runtime, and rejects startup. `CapturedSessionBindingFailure` carries the original binding error and any unsubscribe failure as data while disposal runs; it is not exposed as the final error. The original binding error is rethrown when every cleanup succeeds. This is fail-closed: a host without its complete lifecycle, observation, and persistence boundaries never begins serving requests.

## 6. Serialize new, resume, fork, clone, and import

`AgentSessionRuntime` does not serialize callers. The `tail` promise in the wrapper is the host lock: every operation starts after the previous operation has fulfilled or rejected. The rejection branch resets the queue without hiding that operation's error from its caller.

| Host intent | Release API | Important result |
| --- | --- | --- |
| New | `runtime.newSession()` | May return `{ cancelled: true }` from `session_before_switch` |
| Resume | `runtime.switchSession(path, { cwdOverride })` | Recreates services for the saved session's effective cwd |
| Fork | `runtime.fork(entryId)` | Defaults to `position: "before"` and can return `selectedText` |
| Clone | `runtime.fork(entryId, { position: "at" })` | Clone is a host intent, not a separate `AgentSessionRuntime` method |
| Import | `runtime.importFromJsonl(path, cwdOverride)` | Copies and opens the JSONL in the session directory, then switches with resume semantics |

Call only the wrapper methods from request handlers. Bypassing them and invoking the underlying runtime concurrently can interleave teardown and creation, rebind listeners to the wrong session, or make one operation act on state replaced by another.

A cancelled before-event returns without invalidating the old session. It is a normal result, not a factory failure. Missing files, invalid entries, or missing cwd errors can also occur before teardown; the wrapper propagates them while retaining the current binding.

## 7. Unbind the old session and bind the replacement

The release lifecycle exposes two different callbacks for two different moments:

- `setBeforeSessionInvalidate()` runs synchronously after `session_shutdown` handlers finish but before the old session is disposed. The wrapper marks replacement as in flight and attempts to remove old listeners here. Because Pi does not await this callback, it catches an unsubscribe failure into `invalidationCleanupFailures` and always returns normally; old-session disposal and the factory must still run.
- `setRebindSession()` is awaited after the factory result has been applied. The wrapper calls the same `bindSession()` helper, which awaits `session.bindExtensions(...)` before installing the host subscription and reporting diagnostics. Only then does it mark the host available again.

The runtime updates `session`, `services`, `diagnostics`, and `modelFallbackMessage` together before the rebind callback. If synchronous invalidation cleanup was captured, rebind does not publish the replacement: it disposes the applied runtime and propagates that cleanup error as the primary failure. If `bindSession()` fails instead, the wrapper clears any returned subscription and follows the same disposal path. If the factory rejects before apply, the serialized operation combines that factory error as primary with captured invalidation cleanup errors. Every path remains terminal. The wrapper exposes cwd and diagnostics but deliberately does not expose its raw `AgentSessionRuntime`; request code therefore cannot read either a disposed old session or a failed applied replacement.

### Keep `SessionManager` canonical after replacement

Each replacement session gets its provider context from its own `SessionManager`. Restoring externally owned entries uses `SessionManager.inMemory(cwd, { id: sessionId }, entries)` during factory construction. After rebind, route context changes through public session operations instead of assigning the underlying Agent transcript.

| Host operation | Public API | Context result |
| --- | --- | --- |
| `external restore` | `SessionManager.inMemory(cwd, { id: sessionId }, entries)` | `canonical provider context` |
| `tree navigation` | `session.navigateTree(targetId)` | `refreshes canonical projection` |
| `manual append` | `session.sessionManager append operation → session.refreshContext()` | `refreshes canonical projection` |

`navigateTree()` moves the selected leaf and rebuilds the finalized context and Tool state. If a host deliberately appends through `session.sessionManager`, it must call `session.refreshContext()` before the next request. A `ContextEditEntry` changes only the future provider projection; raw transcript and UI history remain append-only. Bindings that render or persist the raw tree should therefore keep using session events and manager entries rather than treating the current projected message array as the audit record.

```mermaid
sequenceDiagram
    participant Caller as Host caller
    participant Lock as Host lock
    participant Dispose as Disposal
    participant Old as Old session
    participant Factory as Runtime factory
    participant Next as Replacement session
    participant Extensions as Extension binding
    participant Rebind as Subscription rebind
    participant Persist as Host persistence
    Caller->>Lock: enqueue new/resume/fork/clone/import
    opt final dispose requested while replacement owns the lock
        Caller->>Lock: mark terminal and enqueue final cleanup
        Note over Caller,Lock: disposal waits behind the current tail
    end
    Lock->>Dispose: begin runtime teardown
    Dispose->>Old: abort active response
    Dispose->>Old: session_shutdown
    Dispose->>Rebind: synchronous unbind before invalidation
    alt old unsubscribe succeeds
        Rebind-->>Dispose: callback returns
    else old unsubscribe fails
        Rebind-->>Lock: capture failure and return normally
    end
    Dispose->>Old: dispose()
    Lock->>Factory: create target cwd runtime
    alt factory succeeds
        Factory-->>Lock: session + services + diagnostics
        Lock->>Next: apply coherent result
        alt invalidation cleanup was captured
            Lock->>Next: dispose applied replacement
            Lock--xCaller: flat terminal cleanup failure
        else invalidation cleanup succeeded
            Lock->>Extensions: bindExtensions(replacement options)
            Extensions->>Next: session_start and extend resources
            alt Extension and host binding succeed
                Extensions-->>Lock: Extension lifecycle ready
                Lock->>Rebind: subscribe to replacement session
                Lock->>Persist: flush host persistence
                alt persistence flush succeeds
                    Persist-->>Caller: operation result
                else persistence flush fails
                    Persist--xLock: primary persistence failure
                    Lock->>Rebind: clear installed subscription
                    Lock->>Next: dispose applied replacement
                    Lock--xCaller: terminal failure
                end
            else Extension, subscribe, or diagnostics fail
                Extensions--xLock: binding failure
                Lock->>Rebind: clear returned subscription
                Lock->>Next: dispose applied replacement
                Lock->>Lock: keep host unusable in finally
                Lock--xCaller: original or aggregate failure
            end
        end
    else factory rejects after disposal
        Factory--xLock: reject
        Lock->>Lock: combine captured cleanup and mark unusable
        Lock--xCaller: factory primary and no exposed session
    end
    opt final disposal was queued
        Lock->>Next: abort current session after prior work settles
        Lock->>Persist: flush host persistence
        Lock->>Dispose: runtime.dispose()
        Dispose->>Rebind: synchronous invalidation callback
        Rebind-->>Lock: capture unsubscribe failure
        Dispose-->>Lock: resolve or reject after callback
        Lock->>Lock: drain callback failure before disposal error
        Lock-->>Caller: final result or flat failure
    end
```

## 8. Dispose old resources and flush persistence

For a replacement, Pi's internal teardown first awaits `oldSession.abort()`. This settles an active response so its aborted turn and Tool results can be written to the outgoing session. It then awaits `session_shutdown`, runs the synchronous invalidation callback, and calls `oldSession.dispose()` before invoking the factory. The old Extension runner and other session-owned resources must not be reused after that point.

`SessionManager` appends Pi's JSONL records through its own session operations; there is no public asynchronous `flush()` method on `AgentSessionRuntime`. The example's `flushPersistence()` is explicitly for host-owned persistence, event projection, or durable queues. It runs after each successful rebind. If that flush rejects, the installed replacement is not safe to publish: the adapter becomes terminal, clears its subscription, attempts `runtime.dispose()`, and rejects the operation.

Pi `0.99.2` also closes four replacement edge cases. Imported JSONL with the same filename receives a numeric suffix instead of overwriting an existing session file, and concurrent session shares do not overwrite one another. A fork retains its compaction boundary. For an in-memory fork requested before the active turn settles, runtime teardown awaits `abort()` before mutating the shared manager, so the fork sees the settled outgoing turn. These are targeted collision and ordering guarantees, not general transaction guarantees or full schema validation of imported JSONL.

Final shutdown is also serialized, but it is requestable while a healthy replacement already owns the host lock. The first `host.dispose()` call does not run `assertAvailable()` or reject merely because `replacementInFlight` is set. It atomically sets `disposed` and `unusable`, then enqueues cleanup behind the current `tail`. The in-flight operation settles first; already queued or later operations reach the terminal guard without invoking another runtime method. Getters reject immediately. A repeated `dispose()` call rejects with the defined disposed-state error and never schedules duplicate cleanup.

Final cleanup attempts `runtime.session.abort()`, host persistence flush, `runtime.dispose()`, and an explicit unsubscribe fallback independently, so one failure cannot skip later steps. Pi's `runtime.dispose()` itself invokes `setBeforeSessionInvalidate()` synchronously. The adapter therefore drains `invalidationCleanupFailures` after `runtime.dispose()` on both resolve and reject. A callback unsubscribe failure is recorded before a later runtime-disposal rejection, matching their actual occurrence; neither can be lost. The first failure remains primary and later failures are appended to one flat `AggregateError`. Await the result before closing process-global resources such as database pools or telemetry exporters. Access remains terminal even when cleanup fails.

## 9. Handle factory failure without a half-replaced session

Replacement in Pi `0.99.2` is not rollback-transactional. `AgentSessionRuntime` disposes the old session before awaiting the new factory. If that factory rejects, it propagates the error and does not call its internal apply or rebind steps; the old object is already invalid and there is no usable replacement.

The wrapper detects this exact boundary because `setBeforeSessionInvalidate()` set `replacementInFlight`, while a successful `setRebindSession()` clears it only after Extension and host binding complete. The synchronous callback never throws: unsubscribe failure is retained for the awaited boundary. A factory rejection occurs before apply and leaves no replacement to dispose, so it is propagated as primary with that retained cleanup failure appended. An invalidation-cleanup, `bindExtensions(...)`, host-subscription, diagnostic-reporting, or post-rebind persistence rejection after apply disposes the installed replacement before propagating. `finally` keeps the wrapper unusable even if disposal fails. No raw session is public, and later operations or state getters reject. This is the required no-half-replacement, fail-closed policy.

Cleanup failure never replaces or nests the primary evidence. `disposeRuntimeFailure()` starts with captured cleanup failures, appends later failures in occurrence order, and calls `throwSessionBindingFailure()` exactly once. Final disposal keeps a runtime-disposal rejection aside until it has drained failures captured inside that call's synchronous invalidation callback; it then appends the later rejection. With no additional failures, the helper rethrows the original primary. Otherwise, it throws one `AggregateError` whose `.errors` are `[primary, ...cleanupFailures]` and whose `.cause` is `primary`. Log that flat aggregate structure without serializing session content, and treat every member as an operational incident.

Do not catch that error and continue serving through a cached session. Record the operation, target path or cwd, and error without logging transcript content or secrets. Then terminate the owning worker, or build a new host from an explicit safe startup target. Automatic retry is acceptable only if the host remains unavailable and each attempt builds a complete new runtime.

Errors raised before invalidation are different. For example, an Extension can cancel a switch or fork, and file/cwd validation can fail before teardown. In those cases the old session remains current; the wrapper propagates the result or error but does not poison itself.

## 10. Verify cwd, diagnostics, and acceptance criteria

Test the wrapper with a harness that injects fake bindings and a controlled runtime factory. The production compile contract proves public type compatibility; behavioral tests should additionally observe sequencing and failure state without using a live provider.

Verify these invariants:

- [ ] `host.cwd` equals the effective cwd of the current `runtime.services`, not necessarily startup `process.cwd()`.
- [ ] Absolute process-global resource paths keep the same meaning after resume or import.
- [ ] Each successful replacement creates a matching session/services/diagnostics set and reports the new diagnostics once.
- [ ] New, resume, fork, clone, and import calls never overlap, including after an earlier command rejects.
- [ ] Clone calls `fork(entryId, { position: "at" })`; fork keeps the default `"before"` semantics.
- [ ] Old unsubscribe failure is captured synchronously without escaping the invalidation callback; old disposal and the factory continue, then the applied replacement is disposed or a factory error is combined with the cleanup failure.
- [ ] Each replacement awaits `bindExtensions(...)` before its host subscription is installed and before the host becomes available.
- [ ] A cancelled or pre-validation failure keeps the old binding usable.
- [ ] A factory rejection after invalidation exposes no session; a binding failure after apply also clears subscriptions and disposes the applied replacement. Both permanently reject later operations on that wrapper.
- [ ] Post-rebind persistence failure marks the adapter terminal, clears the installed subscription, disposes the replacement, and rejects all later access.
- [ ] If unsubscribe or replacement disposal fails, the single propagated `AggregateError` has flat `.errors` ordered as primary then cleanup failures in occurrence order, and `.cause` is the primary failure.
- [ ] Final disposal can be requested during a healthy in-flight replacement: it becomes terminal immediately, waits behind the current tail, cleans the resulting current session, and rejects duplicate disposal requests.
- [ ] Final cleanup attempts abort, persistence flush, runtime disposal, and unsubscribe; invalidation-callback failures are drained on runtime-disposal resolve or reject and ordered before any later disposal error.
- [ ] Diagnostic output redacts secrets and identifies the operation plus target cwd or session path.

For a real acceptance run, create sessions in two temporary cwd directories, switch between them, and assert that project-local settings and resources come from the selected cwd. Use an in-memory or faux provider so lifecycle evidence does not depend on network access or credentials.

## Source map for Pi 0.99.2

All claims above are pinned to release commit `005af57d88ee23b33778f343a9595b32e67ff788`:

| Source | Contract verified |
| --- | --- |
| [`agent-session.ts`](https://github.com/earendil-works/pi/blob/005af57d88ee23b33778f343a9595b32e67ff788/packages/coding-agent/src/core/agent-session.ts) | Public `AgentSession.bindExtensions(...)` parameter, Extension binding application, `session_start`, and resource extension order |
| [`agent-session-runtime.ts`](https://github.com/earendil-works/pi/blob/005af57d88ee23b33778f343a9595b32e67ff788/packages/coding-agent/src/core/agent-session-runtime.ts) | Factory/result types, getters, new/resume/fork/import methods, callback order, teardown-before-create, apply, diagnostics replacement, and disposal |
| [`agent-session-services.ts`](https://github.com/earendil-works/pi/blob/005af57d88ee23b33778f343a9595b32e67ff788/packages/coding-agent/src/core/agent-session-services.ts) | Cwd-bound service creation, diagnostics, and session creation from coherent services |
| [`sdk.ts`](https://github.com/earendil-works/pi/blob/005af57d88ee23b33778f343a9595b32e67ff788/packages/coding-agent/src/core/sdk.ts) | Direct `createAgentSession()` contract and public re-exports used by the guide |

## Next steps

- [Persist sessions](persist-sessions.md) explains the session JSONL tree and direct `SessionManager` operations.
- [Test an Agent deterministically](test-agent-deterministically.md) supplies a network-free provider fixture for lifecycle tests.
- [Chapter 11: Testing and Agent evaluation](../ch11-testing-evaluation.md) places runtime acceptance tests in the wider evidence strategy.
