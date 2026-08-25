import { AsyncLocalStorage } from "node:async_hooks";
import { constants as fileSystemConstants } from "node:fs";
import { open, realpath, stat, type FileHandle } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { types as nodeUtilTypes } from "node:util";

import type { AgentEvent } from "./protocol";
import { ToolRegistry, type RegisteredCourseTool } from "./tool";

const NativePromise = Promise;
const NativeAggregateError = AggregateError;
const NativeTextDecoder = TextDecoder;
const nativePromiseThen = Promise.prototype.then;
const reflectApply = Reflect.apply;
const structuredCloneValue = structuredClone;
const asyncLocalStorageGetStore = AsyncLocalStorage.prototype.getStore;
const asyncLocalStorageRun = AsyncLocalStorage.prototype.run;
const abortSignalAbortedGetter = Object.getOwnPropertyDescriptor(
  AbortSignal.prototype,
  "aborted",
)?.get;
const abortSignalReasonGetter = Object.getOwnPropertyDescriptor(
  AbortSignal.prototype,
  "reason",
)?.get;
const abortControllerAbort = AbortController.prototype.abort;
const eventTargetAddEventListener = EventTarget.prototype.addEventListener;
const eventTargetRemoveEventListener =
  EventTarget.prototype.removeEventListener;
const toolRegistryGet = ToolRegistry.prototype.get;
const toolRegistryRegisterMany = ToolRegistry.prototype.registerMany;
const toolRegistrySnapshot = ToolRegistry.prototype.snapshot;
const nodeIsNativeError = nodeUtilTypes.isNativeError;
const nodeIsPromise = nodeUtilTypes.isPromise;
const nodeIsProxy = nodeUtilTypes.isProxy;
const MAX_ASYNC_OBSERVATION_DEPTH = 32;
/** Maximum encoded bytes accepted by {@link ResourceLoader.loadText}. */
export const MAX_RESOURCE_TEXT_BYTES = 1024 * 1024;
const OPEN_READ_ONLY = fileSystemConstants.O_RDONLY;
const OPEN_NO_FOLLOW = fileSystemConstants.O_NOFOLLOW ?? 0;

export type ResourceErrorCode =
  | "RESOURCE_INVALID_ROOTS"
  | "DUPLICATE_RESOURCE_ROOT_ID"
  | "RESOURCE_OUTSIDE_TRUSTED_ROOTS"
  | "RESOURCE_ROOT_CHANGED"
  | "RESOURCE_NOT_FILE"
  | "RESOURCE_TOO_LARGE"
  | "RESOURCE_INVALID_UTF8"
  | "RESOURCE_IO_FAILED";

export class ResourceError extends Error {
  public readonly code: ResourceErrorCode;

  public constructor(
    code: ResourceErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "ResourceError";
    this.code = code;
    Object.freeze(this);
  }
}

export type ResourceRootDefinition = Readonly<{
  /** Stable identity used in diagnostics and Resource results. */
  id: string;
  /** Trusted directory. Earlier roots have higher precedence. */
  directory: string;
}>;

export type ResourceRoot = Readonly<{
  id: string;
  directory: string;
}>;

export type TextResource = Readonly<{
  rootId: string;
  /** Normalized path relative to the selected trusted root. */
  path: string;
  content: string;
}>;

type RootIdentity = Readonly<{
  device: number | bigint;
  inode: number | bigint;
  birthtimeMs: number | bigint;
}>;

type FileIdentity = RootIdentity &
  Readonly<{
    size: number | bigint;
    mtimeMs: number | bigint;
  }>;

type TrustedRoot = Readonly<{
  id: string;
  configuredDirectory: string;
  canonicalDirectory: string;
  identity: RootIdentity;
  publicValue: ResourceRoot;
}>;

/**
 * Reads text Resources from an ordered set of trusted roots.
 *
 * Creation captures each root's canonical identity. Every load rechecks that
 * identity and confines both the lexical and canonical target paths, so a
 * later symlink, junction, or root replacement cannot broaden trust.
 * Text is limited to {@link MAX_RESOURCE_TEXT_BYTES} encoded bytes and decoded
 * with fatal UTF-8 validation.
 */
export class ResourceLoader {
  readonly #trustedRoots: readonly TrustedRoot[];
  readonly #roots: readonly ResourceRoot[];

  private constructor(roots: readonly TrustedRoot[]) {
    this.#trustedRoots = roots;
    const publicRoots: ResourceRoot[] = [];
    for (let index = 0; index < roots.length; index += 1) {
      publicRoots.push(roots[index].publicValue);
    }
    this.#roots = Object.freeze(publicRoots);
  }

  public static async create(
    definitions: readonly ResourceRootDefinition[],
  ): Promise<ResourceLoader> {
    let values: readonly unknown[];
    try {
      values = snapshotArray(definitions, "Resource roots");
    } catch (error) {
      throw resourceFailure(
        "RESOURCE_INVALID_ROOTS",
        "Resource roots must be a dense Array",
        error,
      );
    }
    if (values.length === 0) {
      throw resourceFailure(
        "RESOURCE_INVALID_ROOTS",
        "ResourceLoader requires at least one trusted root",
      );
    }

    const seenIds = new Set<string>();
    const trusted: TrustedRoot[] = [];
    for (let index = 0; index < values.length; index += 1) {
      let definition: ResourceRootDefinition;
      try {
        definition = snapshotRootDefinition(values[index], index);
      } catch (error) {
        if (error instanceof ResourceError) throw error;
        throw resourceFailure(
          "RESOURCE_INVALID_ROOTS",
          `Resource root ${index} is invalid`,
          error,
        );
      }
      if (seenIds.has(definition.id)) {
        throw resourceFailure(
          "DUPLICATE_RESOURCE_ROOT_ID",
          `Resource root ID "${definition.id}" is duplicated`,
        );
      }
      seenIds.add(definition.id);

      const configuredDirectory = resolve(definition.directory);
      let canonicalDirectory: string;
      let rootStats: Awaited<ReturnType<typeof stat>>;
      try {
        canonicalDirectory = await realpath(configuredDirectory);
        rootStats = await stat(canonicalDirectory);
      } catch (error) {
        throw resourceFailure(
          "RESOURCE_IO_FAILED",
          `Cannot inspect Resource root "${definition.id}"`,
          error,
        );
      }
      if (!rootStats.isDirectory()) {
        throw resourceFailure(
          "RESOURCE_INVALID_ROOTS",
          `Resource root "${definition.id}" is not a directory`,
        );
      }
      const publicValue = Object.freeze({
        id: definition.id,
        directory: canonicalDirectory,
      });
      trusted.push(
        Object.freeze({
          id: definition.id,
          configuredDirectory,
          canonicalDirectory,
          identity: identityFromStats(rootStats),
          publicValue,
        }),
      );
    }

    return new ResourceLoader(Object.freeze(trusted));
  }

  public get roots(): readonly ResourceRoot[] {
    return this.#roots;
  }

  public async loadText(
    resourcePath: string,
  ): Promise<TextResource | undefined> {
    const normalizedPath = normalizeResourcePath(resourcePath);

    for (let index = 0; index < this.#trustedRoots.length; index += 1) {
      const root = this.#trustedRoots[index];
      await verifyRootIdentity(root);
      const lexicalTarget = resolve(root.canonicalDirectory, normalizedPath);
      if (!isWithin(root.canonicalDirectory, lexicalTarget)) {
        throw resourceFailure(
          "RESOURCE_OUTSIDE_TRUSTED_ROOTS",
          `Resource path "${resourcePath}" escapes trusted roots`,
        );
      }

      let canonicalTarget: string;
      try {
        canonicalTarget = await realpath(lexicalTarget);
      } catch (error) {
        if (
          isFileSystemCode(error, "ENOENT") ||
          isFileSystemCode(error, "ENOTDIR")
        ) {
          continue;
        }
        throw resourceFailure(
          "RESOURCE_IO_FAILED",
          `Cannot resolve Resource "${normalizedPath}" in root "${root.id}"`,
          error,
        );
      }
      if (!isWithin(root.canonicalDirectory, canonicalTarget)) {
        throw resourceFailure(
          "RESOURCE_OUTSIDE_TRUSTED_ROOTS",
          `Resource path "${resourcePath}" resolves outside root "${root.id}"`,
        );
      }

      const loaded = await readTrustedText(
        canonicalTarget,
        normalizedPath,
        root.id,
      );

      await verifyRootIdentity(root);
      let afterCanonical: string;
      let after: Awaited<ReturnType<typeof stat>>;
      try {
        afterCanonical = await realpath(lexicalTarget);
        after = await stat(afterCanonical);
      } catch (error) {
        throw resourceFailure(
          "RESOURCE_ROOT_CHANGED",
          `Resource "${normalizedPath}" changed while it was being read`,
          error,
        );
      }
      if (
        afterCanonical !== canonicalTarget ||
        !sameFileIdentity(loaded.identity, fileIdentityFromStats(after))
      ) {
        throw resourceFailure(
          "RESOURCE_ROOT_CHANGED",
          `Resource "${normalizedPath}" changed while it was being read`,
        );
      }

      return Object.freeze({
        rootId: root.id,
        path: normalizedPath.split(sep).join("/"),
        content: loaded.content,
      });
    }
    return undefined;
  }
}

export type ExtensionErrorCode =
  | "EXTENSION_INVALID_OPTIONS"
  | "INVALID_EXTENSION_DEFINITION"
  | "DUPLICATE_EXTENSION_ID"
  | "EXTENSION_NOT_FOUND"
  | "EXTENSION_ALREADY_ACTIVE"
  | "EXTENSION_ACTIVATION_FAILED"
  | "EXTENSION_ACTIVATION_ROLLBACK_FAILED"
  | "EXTENSION_CANCELLED"
  | "EXTENSION_HOST_DISPOSED"
  | "EXTENSION_REENTRANT_OPERATION"
  | "EXTENSION_DISPOSAL_FAILED"
  | "INVALID_AGENT_EVENT";

export class ExtensionError extends Error {
  public readonly code: ExtensionErrorCode;

  public constructor(
    code: ExtensionErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "ExtensionError";
    this.code = code;
    Object.freeze(this);
  }
}

export type ExtensionEventHook = (
  event: AgentEvent,
) => unknown | PromiseLike<unknown>;

export type ExtensionDisposer = () => unknown | PromiseLike<unknown>;

export type ExtensionContext = Readonly<{
  resources: ResourceLoader;
  signal: AbortSignal;
  registerTool: (definition: unknown) => void;
  onAgentEvent: (hook: ExtensionEventHook) => void;
  onDispose: (disposer: ExtensionDisposer) => void;
}>;

export type ExtensionInstance = Readonly<{
  activate: (context: ExtensionContext) => unknown | PromiseLike<unknown>;
  dispose?: ExtensionDisposer;
}>;

export type ExtensionDefinition = Readonly<{
  /** Stable ID used for explicit activation and deterministic ordering. */
  id: string;
  /** Lazy factory. Discovery records this function but never calls it. */
  create: () => ExtensionInstance | PromiseLike<ExtensionInstance>;
}>;

export type ExtensionStatus =
  "discovered" | "activating" | "active" | "failed" | "disposed";

export type ExtensionMetadata = Readonly<{
  id: string;
  status: ExtensionStatus;
}>;

export type ExtensionHookFailure = Readonly<{
  extensionId: string;
  hookIndex: number;
  message: string;
}>;

export type ExtensionHostOptions = Readonly<{
  resources: ResourceLoader;
  tools?: ToolRegistry | readonly unknown[];
}>;

type StoredDefinition = Readonly<{
  id: string;
  create: ExtensionDefinition["create"];
}>;

type HookRecord = Readonly<{
  extensionId: string;
  index: number;
  hook: ExtensionEventHook;
}>;

type ActiveExtension = Readonly<{
  id: string;
  tools: readonly RegisteredCourseTool[];
  hooks: readonly HookRecord[];
  disposers: readonly ExtensionDisposer[];
  instanceDispose?: ExtensionDisposer;
}>;

type StagedContribution = {
  open: boolean;
  tools: unknown[];
  hooks: ExtensionEventHook[];
  disposers: ExtensionDisposer[];
};

type CallbackExecutionContext = {
  readonly hostToken: symbol;
  active: boolean;
};

type CallbackInvocation = Readonly<{
  value: unknown;
  context: CallbackExecutionContext;
}>;

type CallbackInvoker = (
  callback: unknown,
  argumentsValue: readonly unknown[],
) => CallbackInvocation;

type CallbackObserver = (
  invocation: CallbackInvocation,
  label: string,
  onSelected?: () => void,
) => Promise<unknown>;

/**
 * Metadata-only discovery and explicit, serialized Extension activation.
 * Contributions are staged and fully validated before one atomic registry
 * replacement. Hook failures are returned in order and never stop later hooks.
 */
export class ExtensionHost {
  readonly #resources: ResourceLoader;
  readonly #definitions = new Map<string, StoredDefinition>();
  readonly #statuses = new Map<string, ExtensionStatus>();
  readonly #active = new Map<string, ActiveExtension>();
  readonly #activationOrder: string[] = [];
  readonly #baseTools: ToolRegistry;
  readonly #callbackContext = new AsyncLocalStorage<CallbackExecutionContext>();
  readonly #callbackToken = Symbol("ExtensionHost callback context");
  #liveTools: ToolRegistry;
  #tail: Promise<unknown> = NativePromise.resolve();
  #state: "open" | "disposing" | "disposed" = "open";
  #currentController: AbortController | undefined;
  #disposePromise: Promise<void> | undefined;

  public constructor(options: ExtensionHostOptions) {
    let record: Record<PropertyKey, unknown>;
    let resources: unknown;
    let tools: unknown;
    try {
      record = requireObject(options, "ExtensionHost options");
      resources = readOwnValue(record, "resources");
      tools = readOptionalOwnValue(record, "tools");
    } catch (error) {
      throw extensionFailure(
        "EXTENSION_INVALID_OPTIONS",
        "ExtensionHost options are invalid",
        error,
      );
    }
    if (
      !(resources instanceof ResourceLoader) ||
      (isObjectLike(resources) && nodeIsProxy(resources))
    ) {
      throw extensionFailure(
        "EXTENSION_INVALID_OPTIONS",
        "ExtensionHost requires a non-Proxy ResourceLoader",
      );
    }
    this.#resources = resources;

    try {
      if (
        tools instanceof ToolRegistry &&
        isObjectLike(tools) &&
        !nodeIsProxy(tools)
      ) {
        this.#baseTools = reflectApply(toolRegistrySnapshot, tools, []);
      } else if (tools === undefined) {
        this.#baseTools = new ToolRegistry();
      } else if (isObjectLike(tools) && nodeIsProxy(tools)) {
        throw new TypeError("ExtensionHost Tools must not be a Proxy");
      } else {
        const values = snapshotArray(tools, "ExtensionHost Tools");
        this.#baseTools = new ToolRegistry(values);
      }
    } catch (error) {
      throw extensionFailure(
        "EXTENSION_INVALID_OPTIONS",
        "ExtensionHost Tools are invalid",
        error,
      );
    }
    this.#liveTools = reflectApply(toolRegistrySnapshot, this.#baseTools, []);
  }

  public get resources(): ResourceLoader {
    return this.#resources;
  }

  /** A detached registry snapshot; callers cannot mutate host membership. */
  public get tools(): ToolRegistry {
    return reflectApply(toolRegistrySnapshot, this.#liveTools, []);
  }

  public get extensions(): readonly ExtensionMetadata[] {
    const metadata: ExtensionMetadata[] = [];
    for (const [id] of this.#definitions) {
      metadata.push(
        Object.freeze({ id, status: this.#statuses.get(id) ?? "discovered" }),
      );
    }
    return Object.freeze(metadata);
  }

  /** Record immutable metadata only. Factories remain dormant until activate. */
  public discover(definitions: readonly ExtensionDefinition[]): void {
    this.#assertNotReentrant("discover");
    this.#assertOpen();
    let values: readonly unknown[];
    try {
      values = snapshotArray(definitions, "Extension definitions");
    } catch (error) {
      throw extensionFailure(
        "INVALID_EXTENSION_DEFINITION",
        "Extension definitions must be a dense Array",
        error,
      );
    }
    const pending: StoredDefinition[] = [];
    const pendingIds = new Set<string>();
    for (let index = 0; index < values.length; index += 1) {
      let definition: StoredDefinition;
      try {
        definition = snapshotExtensionDefinition(values[index], index);
      } catch (error) {
        if (error instanceof ExtensionError) throw error;
        throw extensionFailure(
          "INVALID_EXTENSION_DEFINITION",
          `Extension definition ${index} is invalid`,
          error,
        );
      }
      if (
        pendingIds.has(definition.id) ||
        this.#definitions.has(definition.id)
      ) {
        throw extensionFailure(
          "DUPLICATE_EXTENSION_ID",
          `Extension ID "${definition.id}" is already discovered`,
        );
      }
      pendingIds.add(definition.id);
      pending.push(definition);
    }
    for (let index = 0; index < pending.length; index += 1) {
      const definition = pending[index];
      this.#definitions.set(definition.id, definition);
      this.#statuses.set(definition.id, "discovered");
    }
  }

  public activate(id: string, signal?: AbortSignal): Promise<void> {
    if (this.#isReentrant()) {
      return observedRejection(reentrantOperationError("activate"));
    }
    let selectedSignal: AbortSignal | undefined;
    try {
      selectedSignal = validateActivationSignal(signal);
    } catch (error) {
      return observedRejection(
        error instanceof ExtensionError
          ? error
          : extensionFailure(
              "EXTENSION_INVALID_OPTIONS",
              "Extension activation signal is invalid",
              error,
            ),
      );
    }
    if (this.#state !== "open") {
      return NativePromise.reject(hostDisposedError());
    }
    return this.#enqueue(async () => {
      if (this.#state !== "open") throw hostDisposedError();
      const extensionId = requireExtensionId(id);
      const definition = this.#definitions.get(extensionId);
      if (definition === undefined) {
        throw extensionFailure(
          "EXTENSION_NOT_FOUND",
          `Extension "${extensionId}" was not discovered`,
        );
      }
      if (this.#active.has(extensionId)) {
        throw extensionFailure(
          "EXTENSION_ALREADY_ACTIVE",
          `Extension "${extensionId}" is already active`,
        );
      }
      await this.#activateDefinition(definition, selectedSignal);
    });
  }

  /**
   * Publishes an immutable Agent-event snapshot to active hooks in activation
   * order, then registration order. Sync and async hook failures are isolated
   * and returned as immutable diagnostics.
   */
  public emit(event: AgentEvent): Promise<readonly ExtensionHookFailure[]> {
    if (this.#isReentrant()) {
      return observedRejection(reentrantOperationError("emit"));
    }
    if (this.#state !== "open") {
      return NativePromise.reject(hostDisposedError());
    }
    let eventSnapshot: AgentEvent;
    try {
      eventSnapshot = snapshotAgentEvent(event);
    } catch (error) {
      return NativePromise.reject(
        extensionFailure(
          "INVALID_AGENT_EVENT",
          "Cannot snapshot Agent event for Extension hooks",
          error,
        ),
      );
    }
    return this.#enqueue(async () => {
      if (this.#state !== "open") throw hostDisposedError();
      const failures: ExtensionHookFailure[] = [];
      const hooks = this.#currentHooks();
      for (let index = 0; index < hooks.length; index += 1) {
        const record = hooks[index];
        try {
          const invocation = this.#invokeCallback(record.hook, [eventSnapshot]);
          await this.#observeCallbackResult(
            invocation,
            `Extension hook ${record.extensionId}`,
          );
        } catch (error) {
          failures.push(
            Object.freeze({
              extensionId: record.extensionId,
              hookIndex: record.index,
              message: safeErrorMessage(error),
            }),
          );
        }
      }
      return Object.freeze(failures);
    });
  }

  /**
   * Abort pending activation, then dispose active Extensions in reverse order.
   * Every disposer runs; failures are reported in one frozen AggregateError.
   */
  public dispose(): Promise<void> {
    if (this.#isReentrant()) {
      return observedRejection(reentrantOperationError("dispose"));
    }
    if (this.#disposePromise !== undefined) return this.#disposePromise;
    this.#state = "disposing";
    try {
      if (this.#currentController !== undefined) {
        reflectApply(abortControllerAbort, this.#currentController, [
          "ExtensionHost disposed",
        ]);
      }
    } catch {
      // The serialized activation will still observe the host state boundary.
    }
    const pending = this.#enqueue(async () => {
      const failures: unknown[] = [];
      for (
        let index = this.#activationOrder.length - 1;
        index >= 0;
        index -= 1
      ) {
        const id = this.#activationOrder[index];
        const active = this.#active.get(id);
        if (active === undefined) continue;
        const cleanupFailures = await cleanupExtension(
          active,
          (callback, argumentsValue) =>
            this.#invokeCallback(callback, argumentsValue),
          (invocation, label, onSelected) =>
            this.#observeCallbackResult(invocation, label, onSelected),
        );
        for (
          let failureIndex = 0;
          failureIndex < cleanupFailures.length;
          failureIndex += 1
        ) {
          failures.push(cleanupFailures[failureIndex]);
        }
        this.#active.delete(id);
        this.#statuses.set(id, "disposed");
      }
      this.#activationOrder.length = 0;
      this.#liveTools = this.#rebuildRegistry();
      this.#state = "disposed";
      if (failures.length > 0) {
        throw extensionFailure(
          "EXTENSION_DISPOSAL_FAILED",
          `${failures.length} Extension disposer(s) failed`,
          frozenAggregate(
            failures,
            `${failures.length} Extension disposer(s) failed`,
          ),
        );
      }
    });
    this.#disposePromise = pending;
    // A disposal error is still observed by the caller-facing Promise and by
    // the queue tail, so it cannot become an unhandled internal rejection.
    return pending;
  }

  async #activateDefinition(
    definition: StoredDefinition,
    externalSignal?: AbortSignal,
  ): Promise<void> {
    const controller = new AbortController();
    const detachExternal = linkAbortSignal(externalSignal, controller);
    this.#currentController = controller;
    this.#statuses.set(definition.id, "activating");
    const staged: StagedContribution = {
      open: true,
      tools: [],
      hooks: [],
      disposers: [],
    };
    let instance: ExtensionInstance | undefined;
    let instanceDispose: ExtensionDisposer | undefined;

    try {
      throwIfActivationCancelled(controller.signal, this.#state);
      const created = this.#invokeCallback(definition.create, []);
      const rawInstance = await this.#observeCallbackResult(
        created,
        `Extension factory ${definition.id}`,
      );
      instance = snapshotExtensionInstance(
        rawInstance,
        definition.id,
        (disposer) => {
          instanceDispose = disposer;
        },
      );
      throwIfActivationCancelled(controller.signal, this.#state);
      const context = createExtensionContext(
        this.#resources,
        controller.signal,
        staged,
      );
      const returned = this.#invokeCallback(instance.activate, [context]);
      await this.#observeCallbackResult(
        returned,
        `Extension activation ${definition.id}`,
        () => {
          staged.open = false;
        },
      );
      throwIfActivationCancelled(controller.signal, this.#state);

      const candidate = reflectApply(toolRegistrySnapshot, this.#liveTools, []);
      reflectApply(toolRegistryRegisterMany, candidate, [staged.tools]);
      const committedTools = snapshotNewTools(candidate, staged.tools.length);
      const hooks: HookRecord[] = [];
      for (let index = 0; index < staged.hooks.length; index += 1) {
        hooks.push(
          Object.freeze({
            extensionId: definition.id,
            index,
            hook: staged.hooks[index],
          }),
        );
      }
      const active = Object.freeze({
        id: definition.id,
        tools: committedTools,
        hooks: Object.freeze(hooks),
        disposers: Object.freeze(staged.disposers.slice()),
        ...(instanceDispose === undefined ? {} : { instanceDispose }),
      });
      // Commit all live state only after the complete contribution validates.
      this.#liveTools = candidate;
      this.#active.set(definition.id, active);
      this.#activationOrder.push(definition.id);
      this.#statuses.set(definition.id, "active");
    } catch (error) {
      staged.open = false;
      const primary = normalizeActivationFailure(
        error,
        definition.id,
        controller.signal,
        this.#state,
      );
      const cleanupFailures = await cleanupStaged(
        staged.disposers,
        instanceDispose,
        (callback, argumentsValue) =>
          this.#invokeCallback(callback, argumentsValue),
        (invocation, label, onSelected) =>
          this.#observeCallbackResult(invocation, label, onSelected),
      );
      this.#statuses.set(definition.id, "failed");
      if (cleanupFailures.length > 0) {
        throw extensionFailure(
          "EXTENSION_ACTIVATION_ROLLBACK_FAILED",
          `Extension "${definition.id}" activation and rollback failed`,
          frozenAggregate(
            [rollbackPrimaryError(error, primary), ...cleanupFailures],
            `Extension "${definition.id}" activation and rollback failed`,
          ),
        );
      }
      throw primary;
    } finally {
      staged.open = false;
      detachExternal();
      if (this.#currentController === controller) {
        this.#currentController = undefined;
      }
    }
  }

  #currentHooks(): readonly HookRecord[] {
    const hooks: HookRecord[] = [];
    for (let index = 0; index < this.#activationOrder.length; index += 1) {
      const active = this.#active.get(this.#activationOrder[index]);
      if (active === undefined) continue;
      for (let hookIndex = 0; hookIndex < active.hooks.length; hookIndex += 1) {
        hooks.push(active.hooks[hookIndex]);
      }
    }
    return hooks;
  }

  #rebuildRegistry(): ToolRegistry {
    const registry = reflectApply(toolRegistrySnapshot, this.#baseTools, []);
    for (let index = 0; index < this.#activationOrder.length; index += 1) {
      const active = this.#active.get(this.#activationOrder[index]);
      if (active === undefined) continue;
      reflectApply(toolRegistryRegisterMany, registry, [active.tools]);
    }
    return registry;
  }

  #assertOpen(): void {
    if (this.#state !== "open") throw hostDisposedError();
  }

  #assertNotReentrant(operation: string): void {
    if (this.#isReentrant()) throw reentrantOperationError(operation);
  }

  #isReentrant(): boolean {
    const context = reflectApply(
      asyncLocalStorageGetStore,
      this.#callbackContext,
      [],
    ) as CallbackExecutionContext | undefined;
    return context?.hostToken === this.#callbackToken && context.active;
  }

  #invokeCallback(
    callback: unknown,
    argumentsValue: readonly unknown[],
  ): CallbackInvocation {
    if (typeof callback !== "function") {
      throw extensionFailure(
        "INVALID_EXTENSION_DEFINITION",
        "Extension callback must be a function",
      );
    }
    const context = Object.seal({
      hostToken: this.#callbackToken,
      active: true,
    });
    try {
      const value = reflectApply(asyncLocalStorageRun, this.#callbackContext, [
        context,
        () => reflectApply(callback, undefined, argumentsValue),
      ]);
      return Object.freeze({ value, context });
    } catch (error) {
      context.active = false;
      throw error;
    }
  }

  #observeCallbackResult(
    invocation: CallbackInvocation,
    label: string,
    onSelected?: () => void,
  ): Promise<unknown> {
    try {
      return reflectApply(asyncLocalStorageRun, this.#callbackContext, [
        invocation.context,
        () =>
          adoptAsync(invocation.value, label, onSelected, () => {
            invocation.context.active = false;
          }),
      ]) as Promise<unknown>;
    } catch (error) {
      invocation.context.active = false;
      throw error;
    }
  }

  #enqueue<Value>(operation: () => Value | PromiseLike<Value>): Promise<Value> {
    const result = reflectApply(nativePromiseThen, this.#tail, [
      operation,
    ]) as Promise<Value>;
    this.#tail = reflectApply(nativePromiseThen, result, [
      () => undefined,
      () => undefined,
    ]) as Promise<void>;
    return result;
  }
}

function createExtensionContext(
  resources: ResourceLoader,
  signal: AbortSignal,
  staged: StagedContribution,
): ExtensionContext {
  const assertOpen = () => {
    if (!staged.open) {
      throw extensionFailure(
        "EXTENSION_ACTIVATION_FAILED",
        "Extension activation context is closed",
      );
    }
  };
  const registerTool = (definition: unknown) => {
    assertOpen();
    staged.tools.push(definition);
  };
  const onAgentEvent = (hook: ExtensionEventHook) => {
    assertOpen();
    if (typeof hook !== "function") {
      throw extensionFailure(
        "INVALID_EXTENSION_DEFINITION",
        "Extension event hook must be a function",
      );
    }
    staged.hooks.push(hook);
  };
  const onDispose = (disposer: ExtensionDisposer) => {
    assertOpen();
    if (typeof disposer !== "function") {
      throw extensionFailure(
        "INVALID_EXTENSION_DEFINITION",
        "Extension disposer must be a function",
      );
    }
    staged.disposers.push(disposer);
  };
  return Object.freeze({
    resources,
    signal,
    registerTool: Object.freeze(registerTool),
    onAgentEvent: Object.freeze(onAgentEvent),
    onDispose: Object.freeze(onDispose),
  });
}

function snapshotNewTools(
  registry: ToolRegistry,
  count: number,
): readonly RegisteredCourseTool[] {
  if (count === 0) return Object.freeze([]);
  const names = registry.names;
  const tools: RegisteredCourseTool[] = [];
  for (let index = names.length - count; index < names.length; index += 1) {
    const tool = reflectApply(toolRegistryGet, registry, [names[index]]) as
      RegisteredCourseTool | undefined;
    if (tool === undefined) {
      throw extensionFailure(
        "EXTENSION_ACTIVATION_FAILED",
        "Validated Tool contribution disappeared before commit",
      );
    }
    tools.push(tool);
  }
  return Object.freeze(tools);
}

async function cleanupStaged(
  disposers: readonly ExtensionDisposer[],
  instanceDispose: ExtensionDisposer | undefined,
  invoke: CallbackInvoker,
  observe: CallbackObserver,
): Promise<readonly unknown[]> {
  const failures: unknown[] = [];
  for (let index = disposers.length - 1; index >= 0; index -= 1) {
    try {
      const invocation = invoke(disposers[index], []);
      await observe(invocation, "Extension rollback disposer");
    } catch (error) {
      failures.push(error);
    }
  }
  if (instanceDispose !== undefined) {
    try {
      const invocation = invoke(instanceDispose, []);
      await observe(invocation, "Extension instance disposer");
    } catch (error) {
      failures.push(error);
    }
  }
  return Object.freeze(failures);
}

function cleanupExtension(
  active: ActiveExtension,
  invoke: CallbackInvoker,
  observe: CallbackObserver,
): Promise<readonly unknown[]> {
  return cleanupStaged(
    active.disposers,
    active.instanceDispose,
    invoke,
    observe,
  );
}

function snapshotExtensionDefinition(
  value: unknown,
  index: number,
): StoredDefinition {
  const record = requireObject(value, `Extension definition ${index}`);
  const id = readOwnValue(record, "id");
  const create = readOwnValue(record, "create");
  if (typeof id !== "string" || id.trim() === "" || id !== id.trim()) {
    throw extensionFailure(
      "INVALID_EXTENSION_DEFINITION",
      `Extension definition ${index} has an invalid ID`,
    );
  }
  if (typeof create !== "function") {
    throw extensionFailure(
      "INVALID_EXTENSION_DEFINITION",
      `Extension "${id}" factory must be a function`,
    );
  }
  return Object.freeze({ id, create: create as ExtensionDefinition["create"] });
}

function snapshotExtensionInstance(
  value: unknown,
  extensionId: string,
  captureDisposer: (disposer: ExtensionDisposer) => void,
): ExtensionInstance {
  const record = requireObject(value, `Extension "${extensionId}" instance`);
  const dispose = readOptionalOwnValue(record, "dispose");
  if (dispose !== undefined && typeof dispose !== "function") {
    throw extensionFailure(
      "INVALID_EXTENSION_DEFINITION",
      `Extension "${extensionId}" dispose must be a function`,
    );
  }
  if (typeof dispose === "function")
    captureDisposer(dispose as ExtensionDisposer);
  const activate = readOwnValue(record, "activate");
  if (typeof activate !== "function") {
    throw extensionFailure(
      "INVALID_EXTENSION_DEFINITION",
      `Extension "${extensionId}" activate must be a function`,
    );
  }
  return Object.freeze({
    activate: activate as ExtensionInstance["activate"],
    ...(dispose === undefined ? {} : { dispose: dispose as ExtensionDisposer }),
  });
}

function snapshotRootDefinition(
  value: unknown,
  index: number,
): ResourceRootDefinition {
  const record = requireObject(value, `Resource root ${index}`);
  const id = readOwnValue(record, "id");
  const directory = readOwnValue(record, "directory");
  if (typeof id !== "string" || id.trim() === "" || id !== id.trim()) {
    throw resourceFailure(
      "RESOURCE_INVALID_ROOTS",
      `Resource root ${index} has an invalid ID`,
    );
  }
  if (
    typeof directory !== "string" ||
    directory.length === 0 ||
    directory.includes("\0")
  ) {
    throw resourceFailure(
      "RESOURCE_INVALID_ROOTS",
      `Resource root "${id}" has an invalid directory`,
    );
  }
  return Object.freeze({ id, directory });
}

function snapshotArray(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value) || nodeIsProxy(value)) {
    throw new TypeError(`${label} must be a non-Proxy Array`);
  }
  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
  if (
    lengthDescriptor === undefined ||
    !("value" in lengthDescriptor) ||
    typeof lengthDescriptor.value !== "number"
  ) {
    throw new TypeError(`${label} has an invalid length`);
  }
  const length = lengthDescriptor.value;
  const snapshot: unknown[] = [];
  for (let index = 0; index < length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (descriptor === undefined || !("value" in descriptor)) {
      throw new TypeError(
        `${label} contains a missing or accessor item at ${index}`,
      );
    }
    snapshot.push(descriptor.value);
  }
  return Object.freeze(snapshot);
}

function requireObject(
  value: unknown,
  label: string,
): Record<PropertyKey, unknown> {
  if (
    (typeof value !== "object" && typeof value !== "function") ||
    value === null
  ) {
    throw new TypeError(`${label} must be an object`);
  }
  if (nodeIsProxy(value)) throw new TypeError(`${label} must not be a Proxy`);
  return value as Record<PropertyKey, unknown>;
}

function isObjectLike(value: unknown): value is object {
  return (
    (typeof value === "object" || typeof value === "function") && value !== null
  );
}

function readOwnValue(
  value: Record<PropertyKey, unknown>,
  key: PropertyKey,
): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (descriptor === undefined || !("value" in descriptor)) {
    throw new TypeError(`Property ${String(key)} must be an own data property`);
  }
  return descriptor.value;
}

function readOptionalOwnValue(
  value: Record<PropertyKey, unknown>,
  key: PropertyKey,
): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (descriptor === undefined) return undefined;
  if (!("value" in descriptor)) {
    throw new TypeError(`Property ${String(key)} must be an own data property`);
  }
  return descriptor.value;
}

function normalizeResourcePath(value: string): string {
  if (typeof value !== "string" || value.length === 0 || value.includes("\0")) {
    throw resourceFailure(
      "RESOURCE_OUTSIDE_TRUSTED_ROOTS",
      "Resource path must be a non-empty relative path",
    );
  }
  const portable = value.replaceAll("\\", "/");
  if (
    portable.startsWith("/") ||
    portable.includes(":") ||
    /^[A-Za-z]:/.test(portable)
  ) {
    throw resourceFailure(
      "RESOURCE_OUTSIDE_TRUSTED_ROOTS",
      `Resource path "${value}" is not portable and relative`,
    );
  }

  const normalized: string[] = [];
  const segments = portable.split("/");
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      if (normalized.length === 0) {
        throw resourceFailure(
          "RESOURCE_OUTSIDE_TRUSTED_ROOTS",
          `Resource path "${value}" escapes trusted roots`,
        );
      }
      normalized.pop();
      continue;
    }
    if (segment.endsWith(".") || segment.endsWith(" ")) {
      throw resourceFailure(
        "RESOURCE_OUTSIDE_TRUSTED_ROOTS",
        `Resource path segment "${segment}" has a non-portable trailing character`,
      );
    }
    if (isWindowsReservedBasename(segment)) {
      throw resourceFailure(
        "RESOURCE_OUTSIDE_TRUSTED_ROOTS",
        `Resource path segment "${segment}" is reserved on Windows`,
      );
    }
    normalized.push(segment);
  }
  if (normalized.length === 0) {
    throw resourceFailure(
      "RESOURCE_OUTSIDE_TRUSTED_ROOTS",
      `Resource path "${value}" does not identify a file`,
    );
  }
  return normalized.join(sep);
}

function isWindowsReservedBasename(segment: string): boolean {
  const dot = segment.indexOf(".");
  const basename = (dot === -1 ? segment : segment.slice(0, dot)).toUpperCase();
  return /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/.test(basename);
}

function isWithin(root: string, target: string): boolean {
  const remainder = relative(root, target);
  return (
    remainder === "" ||
    (!remainder.startsWith(`..${sep}`) &&
      remainder !== ".." &&
      !isAbsolute(remainder))
  );
}

async function readTrustedText(
  canonicalTarget: string,
  normalizedPath: string,
  rootId: string,
): Promise<Readonly<{ content: string; identity: FileIdentity }>> {
  let handle: FileHandle;
  try {
    handle = await openReadNoFollow(canonicalTarget);
  } catch (error) {
    throw resourceFailure(
      "RESOURCE_IO_FAILED",
      `Cannot open Resource "${normalizedPath}" from root "${rootId}"`,
      error,
    );
  }

  let primaryFailure: unknown;
  try {
    const before = await handle.stat();
    if (!before.isFile()) {
      throw resourceFailure(
        "RESOURCE_NOT_FILE",
        `Resource "${normalizedPath}" in root "${rootId}" is not a file`,
      );
    }
    if (before.size > MAX_RESOURCE_TEXT_BYTES) {
      throw resourceFailure(
        "RESOURCE_TOO_LARGE",
        `Resource "${normalizedPath}" exceeds ${MAX_RESOURCE_TEXT_BYTES} bytes`,
      );
    }

    // Size is validated before this bounded allocation. Reading one extra byte
    // detects a file that grows past the cap after fstat.
    const bytes = Buffer.allocUnsafe(MAX_RESOURCE_TEXT_BYTES + 1);
    let byteCount = 0;
    while (byteCount < bytes.length) {
      const result = await handle.read(
        bytes,
        byteCount,
        bytes.length - byteCount,
        byteCount,
      );
      if (result.bytesRead === 0) break;
      byteCount += result.bytesRead;
    }
    if (byteCount > MAX_RESOURCE_TEXT_BYTES) {
      throw resourceFailure(
        "RESOURCE_TOO_LARGE",
        `Resource "${normalizedPath}" exceeds ${MAX_RESOURCE_TEXT_BYTES} bytes`,
      );
    }

    const after = await handle.stat();
    const beforeIdentity = fileIdentityFromStats(before);
    const afterIdentity = fileIdentityFromStats(after);
    if (
      !sameFileIdentity(beforeIdentity, afterIdentity) ||
      after.size !== byteCount
    ) {
      throw resourceFailure(
        "RESOURCE_ROOT_CHANGED",
        `Resource "${normalizedPath}" changed while it was being read`,
      );
    }

    let content: string;
    try {
      const decoder = new NativeTextDecoder("utf-8", { fatal: true });
      content = decoder.decode(bytes.subarray(0, byteCount));
    } catch (error) {
      throw resourceFailure(
        "RESOURCE_INVALID_UTF8",
        `Resource "${normalizedPath}" is not valid UTF-8`,
        error,
      );
    }
    return Object.freeze({ content, identity: afterIdentity });
  } catch (error) {
    primaryFailure = error;
    if (error instanceof ResourceError) throw error;
    throw resourceFailure(
      "RESOURCE_IO_FAILED",
      `Cannot read Resource "${normalizedPath}" from root "${rootId}"`,
      error,
    );
  } finally {
    try {
      await handle.close();
    } catch (error) {
      if (primaryFailure === undefined) {
        throw resourceFailure(
          "RESOURCE_IO_FAILED",
          `Cannot close Resource "${normalizedPath}" from root "${rootId}"`,
          error,
        );
      }
    }
  }
}

async function openReadNoFollow(path: string): Promise<FileHandle> {
  if (OPEN_NO_FOLLOW === 0) return open(path, OPEN_READ_ONLY);
  try {
    return await open(path, OPEN_READ_ONLY | OPEN_NO_FOLLOW);
  } catch (error) {
    if (
      isFileSystemCode(error, "EINVAL") ||
      isFileSystemCode(error, "ENOTSUP") ||
      isFileSystemCode(error, "ENOSYS")
    ) {
      return open(path, OPEN_READ_ONLY);
    }
    throw error;
  }
}

function identityFromStats(
  value: Awaited<ReturnType<typeof stat>>,
): RootIdentity {
  return Object.freeze({
    device: value.dev,
    inode: value.ino,
    birthtimeMs: value.birthtimeMs,
  });
}

function fileIdentityFromStats(
  value: Awaited<ReturnType<typeof stat>>,
): FileIdentity {
  return Object.freeze({
    ...identityFromStats(value),
    size: value.size,
    mtimeMs: value.mtimeMs,
  });
}

function sameIdentity(left: RootIdentity, right: RootIdentity): boolean {
  return (
    left.device === right.device &&
    left.inode === right.inode &&
    left.birthtimeMs === right.birthtimeMs
  );
}

function sameFileIdentity(left: FileIdentity, right: FileIdentity): boolean {
  return (
    sameIdentity(left, right) &&
    left.size === right.size &&
    left.mtimeMs === right.mtimeMs
  );
}

async function verifyRootIdentity(root: TrustedRoot): Promise<void> {
  try {
    const canonical = await realpath(root.configuredDirectory);
    const currentStats = await stat(canonical);
    if (
      canonical !== root.canonicalDirectory ||
      !currentStats.isDirectory() ||
      !sameIdentity(root.identity, identityFromStats(currentStats))
    ) {
      throw resourceFailure(
        "RESOURCE_ROOT_CHANGED",
        `Trusted Resource root "${root.id}" was replaced`,
      );
    }
  } catch (error) {
    if (error instanceof ResourceError) throw error;
    throw resourceFailure(
      "RESOURCE_ROOT_CHANGED",
      `Trusted Resource root "${root.id}" is no longer available`,
      error,
    );
  }
}

function isFileSystemCode(value: unknown, code: string): boolean {
  if (
    (typeof value !== "object" && typeof value !== "function") ||
    value === null
  ) {
    return false;
  }
  try {
    return Reflect.get(value, "code") === code;
  } catch {
    return false;
  }
}

function requireExtensionId(value: string): string {
  if (
    typeof value !== "string" ||
    value.trim() === "" ||
    value !== value.trim()
  ) {
    throw extensionFailure(
      "EXTENSION_NOT_FOUND",
      "Extension ID must be a non-empty trimmed string",
    );
  }
  return value;
}

function validateActivationSignal(
  value: AbortSignal | undefined,
): AbortSignal | undefined {
  if (value === undefined) return undefined;
  if (!(value instanceof AbortSignal) || nodeIsProxy(value)) {
    throw extensionFailure(
      "EXTENSION_INVALID_OPTIONS",
      "Extension activation signal must be a non-Proxy AbortSignal",
    );
  }
  try {
    if (readSignalAborted(value)) readSignalReason(value);
  } catch (error) {
    throw extensionFailure(
      "EXTENSION_INVALID_OPTIONS",
      "Extension activation signal has no valid AbortSignal internal slot",
      error,
    );
  }
  return value;
}

function linkAbortSignal(
  external: AbortSignal | undefined,
  controller: AbortController,
): () => void {
  if (external === undefined) return () => undefined;
  if (!(external instanceof AbortSignal) || nodeIsProxy(external)) {
    throw extensionFailure(
      "EXTENSION_INVALID_OPTIONS",
      "Extension activation signal must be a non-Proxy AbortSignal",
    );
  }
  const abort = () => {
    try {
      reflectApply(abortControllerAbort, controller, [
        readSignalReason(external),
      ]);
    } catch {
      reflectApply(abortControllerAbort, controller, []);
    }
  };
  try {
    if (readSignalAborted(external)) {
      abort();
      return () => undefined;
    }
    reflectApply(eventTargetAddEventListener, external, [
      "abort",
      abort,
      { once: true },
    ]);
  } catch (error) {
    throw extensionFailure(
      "EXTENSION_INVALID_OPTIONS",
      "Extension activation signal became invalid",
      error,
    );
  }
  return () => {
    try {
      reflectApply(eventTargetRemoveEventListener, external, ["abort", abort]);
    } catch {
      // Listener cleanup cannot replace the selected activation outcome.
    }
  };
}

function throwIfActivationCancelled(
  signal: AbortSignal,
  hostState: "open" | "disposing" | "disposed",
): void {
  let aborted: boolean;
  let reason: unknown;
  try {
    aborted = readSignalAborted(signal);
    reason = aborted ? readSignalReason(signal) : undefined;
  } catch (error) {
    throw extensionFailure(
      "EXTENSION_INVALID_OPTIONS",
      "Extension activation signal became invalid",
      error,
    );
  }
  if (aborted || hostState !== "open") {
    throw extensionFailure(
      "EXTENSION_CANCELLED",
      "Extension activation was cancelled",
      reason,
    );
  }
}

function readSignalAborted(signal: AbortSignal): boolean {
  if (abortSignalAbortedGetter === undefined) {
    throw new TypeError("AbortSignal.aborted intrinsic is unavailable");
  }
  return reflectApply(abortSignalAbortedGetter, signal, []) as boolean;
}

function readSignalReason(signal: AbortSignal): unknown {
  if (abortSignalReasonGetter === undefined) return undefined;
  return reflectApply(abortSignalReasonGetter, signal, []);
}

function snapshotAgentEvent(value: AgentEvent): AgentEvent {
  const clone = structuredCloneValue(value) as AgentEvent;
  if (
    typeof clone !== "object" ||
    clone === null ||
    typeof clone.type !== "string" ||
    typeof clone.sequence !== "number" ||
    !Number.isSafeInteger(clone.sequence) ||
    clone.sequence < 0
  ) {
    throw new TypeError("Agent event has invalid metadata");
  }
  return deepFreeze(clone, new WeakSet()) as AgentEvent;
}

function deepFreeze(value: unknown, seen: WeakSet<object>): unknown {
  if (
    (typeof value !== "object" && typeof value !== "function") ||
    value === null
  ) {
    return value;
  }
  if (seen.has(value)) return value;
  seen.add(value);
  const keys = Reflect.ownKeys(value);
  for (let index = 0; index < keys.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, keys[index]);
    if (descriptor !== undefined && "value" in descriptor) {
      deepFreeze(descriptor.value, seen);
    }
  }
  return Object.freeze(value);
}

/**
 * Adopt caller-controlled async values without conflating outer selection
 * with recursive settlement. Generic resolve(pending) selects immediately,
 * while final settlement waits for the selected value's complete adoption.
 */
function adoptAsync(
  value: unknown,
  label: string,
  onSelected?: () => void,
  onFinalSettled?: () => void,
): Promise<unknown> {
  return new NativePromise<unknown>((resolvePromise, rejectPromise) => {
    const state = { seen: new WeakSet<object>() };
    let outerSelected = false;
    let finalSettled = false;
    const selectOuter = () => {
      if (outerSelected) return;
      outerSelected = true;
      onSelected?.();
    };
    const selectFinal = () => {
      if (finalSettled) return;
      finalSettled = true;
      onFinalSettled?.();
    };
    const rejectBoundaryFailure = (error: unknown) => {
      try {
        selectFinal();
      } catch (finalError) {
        rejectPromise(finalError);
        return;
      }
      rejectPromise(error);
    };
    const fulfill = (result: unknown) => {
      try {
        selectOuter();
        selectFinal();
        resolvePromise(result);
      } catch (error) {
        rejectBoundaryFailure(error);
      }
    };
    const reject = (reason: unknown) => {
      try {
        selectOuter();
        selectFinal();
      } catch (error) {
        rejectBoundaryFailure(error);
        return;
      }
      rejectPromise(reason);
    };
    adoptValue(value, label, 0, state, fulfill, reject, selectOuter);
  });
}

function adoptValue(
  value: unknown,
  label: string,
  depth: number,
  state: { seen: WeakSet<object> },
  fulfill: (value: unknown) => void,
  reject: (reason: unknown) => void,
  selectOuter: () => void,
): void {
  if (
    (typeof value !== "object" && typeof value !== "function") ||
    value === null
  ) {
    fulfill(value);
    return;
  }
  if (depth > MAX_ASYNC_OBSERVATION_DEPTH) {
    reject(new TypeError(`${label} exceeded async observation depth`));
    return;
  }
  if (state.seen.has(value)) {
    reject(new TypeError(`${label} returned a thenable cycle`));
    return;
  }
  state.seen.add(value);

  if (nodeIsPromise(value)) {
    if (!attachNativePromise(value, fulfill, reject)) {
      reject(new TypeError(`${label} returned an unobservable Promise`));
    }
    return;
  }
  if (nodeIsProxy(value)) {
    reject(new TypeError(`${label} returned a Proxy-wrapped async value`));
    return;
  }

  let then: unknown;
  try {
    then = Reflect.get(value, "then");
  } catch (error) {
    reject(error);
    return;
  }
  if (typeof then !== "function") {
    fulfill(value);
    return;
  }

  let selected = false;
  let returned: unknown;
  try {
    returned = reflectApply(then, value, [
      (nested: unknown) => {
        if (selected) return;
        selected = true;
        if (depth === 0) {
          try {
            selectOuter();
          } catch (error) {
            reject(error);
            return;
          }
        }
        adoptValue(
          nested,
          label,
          depth + 1,
          state,
          fulfill,
          reject,
          selectOuter,
        );
      },
      (reason: unknown) => {
        if (selected) return;
        selected = true;
        if (depth === 0) {
          try {
            selectOuter();
          } catch (error) {
            reject(error);
            return;
          }
        }
        reject(reason);
      },
    ]);
  } catch (error) {
    if (!selected) reject(error);
    return;
  }
  if (returned !== value) observeDetached(returned, depth + 1, state);
}

function attachNativePromise(
  value: object,
  fulfill: (value: unknown) => void,
  reject: (reason: unknown) => void,
): boolean {
  let continuation: unknown;
  try {
    continuation = reflectApply(nativePromiseThen, value, [fulfill, reject]);
  } catch {
    if (nodeIsProxy(value)) return false;
    try {
      const prior = Object.getOwnPropertyDescriptor(value, "constructor");
      if (prior !== undefined && !prior.configurable) return false;
      Object.defineProperty(value, "constructor", {
        configurable: true,
        value: NativePromise,
        writable: true,
      });
      try {
        continuation = reflectApply(nativePromiseThen, value, [
          fulfill,
          reject,
        ]);
      } finally {
        if (prior === undefined) Reflect.deleteProperty(value, "constructor");
        else Object.defineProperty(value, "constructor", prior);
      }
    } catch {
      return false;
    }
  }
  observeNativeContinuation(continuation);
  return true;
}

function observeDetached(
  value: unknown,
  depth: number,
  state: { seen: WeakSet<object> },
): void {
  if (
    (typeof value !== "object" && typeof value !== "function") ||
    value === null
  ) {
    return;
  }
  if (depth > MAX_ASYNC_OBSERVATION_DEPTH || state.seen.has(value)) return;
  if (nodeIsPromise(value)) {
    attachNativePromise(
      value,
      () => undefined,
      () => undefined,
    );
    return;
  }
  if (nodeIsProxy(value)) return;
  state.seen.add(value);
  let then: unknown;
  try {
    then = Reflect.get(value, "then");
  } catch {
    return;
  }
  if (typeof then !== "function") return;
  try {
    const returned = reflectApply(then, value, [
      (nested: unknown) => observeDetached(nested, depth + 1, state),
      (nested: unknown) => observeDetached(nested, depth + 1, state),
    ]);
    if (returned !== value) observeDetached(returned, depth + 1, state);
  } catch {
    // Detached errors are consumed by design.
  }
}

function observeNativeContinuation(value: unknown): void {
  if (
    (typeof value !== "object" && typeof value !== "function") ||
    value === null
  ) {
    return;
  }
  try {
    reflectApply(nativePromiseThen, value, [() => undefined, () => undefined]);
  } catch {
    // Source callbacks do not throw, so a hostile species cannot leak work.
  }
}

function safeErrorMessage(value: unknown): string {
  if (nodeIsNativeError(value)) {
    try {
      return value.message || value.name || "Extension callback failed";
    } catch {
      return "Extension callback failed";
    }
  }
  if (typeof value === "string") return value;
  return "Extension callback failed";
}

function normalizeActivationFailure(
  error: unknown,
  extensionId: string,
  signal: AbortSignal,
  hostState: "open" | "disposing" | "disposed",
): ExtensionError {
  let cancelled = hostState !== "open";
  try {
    cancelled ||= readSignalAborted(signal);
  } catch (signalError) {
    return extensionFailure(
      "EXTENSION_INVALID_OPTIONS",
      `Extension "${extensionId}" activation signal became invalid`,
      signalError,
    );
  }
  if (cancelled) {
    if (
      error instanceof ExtensionError &&
      error.code === "EXTENSION_CANCELLED"
    ) {
      return error;
    }
    return extensionFailure(
      "EXTENSION_CANCELLED",
      `Extension "${extensionId}" activation was cancelled`,
      error,
    );
  }
  if (error instanceof ExtensionError) return error;
  return extensionFailure(
    "EXTENSION_ACTIVATION_FAILED",
    `Extension "${extensionId}" activation failed: ${safeErrorMessage(error)}`,
    error,
  );
}

function rollbackPrimaryError(
  original: unknown,
  normalized: ExtensionError,
): unknown {
  if (
    normalized.code === "EXTENSION_ACTIVATION_FAILED" &&
    !(original instanceof ExtensionError)
  ) {
    return original;
  }
  return normalized;
}

function frozenAggregate(
  values: readonly unknown[],
  message: string,
): AggregateError {
  const errors: unknown[] = [];
  for (let index = 0; index < values.length; index += 1) {
    errors.push(values[index]);
  }
  Object.freeze(errors);
  const aggregate = new NativeAggregateError(errors, message);
  Object.freeze(aggregate.errors);
  return Object.freeze(aggregate);
}

function reentrantOperationError(operation: string): ExtensionError {
  return extensionFailure(
    "EXTENSION_REENTRANT_OPERATION",
    `Extension callback cannot call ExtensionHost.${operation} reentrantly`,
  );
}

/** Return a rejected Promise whose source rejection already has an observer. */
function observedRejection(error: unknown): Promise<never> {
  const pending = new NativePromise<never>((_resolve, reject) => reject(error));
  const observation = reflectApply(nativePromiseThen, pending, [
    undefined,
    () => undefined,
  ]);
  observeNativeContinuation(observation);
  return pending;
}

function hostDisposedError(): ExtensionError {
  return extensionFailure(
    "EXTENSION_HOST_DISPOSED",
    "ExtensionHost is disposing or disposed",
  );
}

function resourceFailure(
  code: ResourceErrorCode,
  message: string,
  cause?: unknown,
): ResourceError {
  return new ResourceError(
    code,
    message,
    cause === undefined ? undefined : { cause },
  );
}

function extensionFailure(
  code: ExtensionErrorCode,
  message: string,
  cause?: unknown,
): ExtensionError {
  return new ExtensionError(
    code,
    message,
    cause === undefined ? undefined : { cause },
  );
}
