import { AsyncLocalStorage } from "node:async_hooks";
import type { BigIntStats } from "node:fs";
import {
  lstat,
  mkdir,
  open,
  readFile,
  realpath,
  rmdir,
  stat,
  unlink,
} from "node:fs/promises";
import {
  dirname,
  isAbsolute,
  posix,
  relative,
  resolve,
  win32,
} from "node:path";
import { types as nodeUtilTypes } from "node:util";

import { Agent, type AgentOptions } from "./agent";
import type { CourseModel } from "./agent-loop";
import {
  createNodeProcessTool,
  createReadTool,
  createWriteTool,
} from "./coding-tools";
import type { CourseMessage, AgentEvent } from "./protocol";
import {
  ExtensionHost,
  ResourceLoader,
  type ExtensionDefinition,
  type ExtensionHostOptions,
  type ResourceRootDefinition,
} from "./resources";
import { SessionStore, SessionTree, type SessionStoreOptions } from "./session";
import { ToolRegistry } from "./tool";

const NativeAggregateError = AggregateError;
const NativePromise = Promise;
const nativePromiseResolve = Promise.resolve;
const nativePromiseThen = Promise.prototype.then;
const reflectApply = Reflect.apply;
const asyncLocalStorageGetStore = AsyncLocalStorage.prototype.getStore;
const asyncLocalStorageRun = AsyncLocalStorage.prototype.run;
const nodeIsProxy = nodeUtilTypes.isProxy;
const toolRegistryGet = ToolRegistry.prototype.get;
const toolRegistryRegisterMany = ToolRegistry.prototype.registerMany;
const toolRegistrySnapshot = ToolRegistry.prototype.snapshot;
const sessionStoreFlush = SessionStore.prototype.flush;
const sessionStoreCanonicalPathOf = SessionStore.canonicalPathOf;
const sessionTreeAppend = SessionTree.prototype.append;
const agentCancel = Agent.prototype.cancel;
const agentSubscribe = Agent.prototype.subscribe;
const extensionHostDispose = ExtensionHost.prototype.dispose;
const extensionHostEmit = ExtensionHost.prototype.emit;
const processCwd = process.cwd.bind(process);

export type CourseRuntimeErrorCode =
  | "RUNTIME_INVALID_OPTIONS"
  | "RUNTIME_CONSTRUCTION_FAILED"
  | "RUNTIME_ROOT_CHANGED"
  | "RUNTIME_EVENT_FAILED"
  | "RUNTIME_SESSION_DIVERGED"
  | "RUNTIME_REENTRANT_OPERATION"
  | "RUNTIME_DISPOSED"
  | "RUNTIME_DISPOSAL_FAILED"
  | "RUNTIME_SESSION_ROLLBACK_FAILED"
  | "RUNTIME_REPLACEMENT_CLEANUP_FAILED";

export class CourseRuntimeError extends Error {
  public readonly code: CourseRuntimeErrorCode;

  public constructor(
    code: CourseRuntimeErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "CourseRuntimeError";
    this.code = code;
    Object.freeze(this);
  }
}

export type CourseRuntimeSessionMode = "create" | "resume";

export type CourseRuntimeSessionOptions = Readonly<{
  /** Relative paths are resolved below the effective workspace root. */
  path: string;
  mode: CourseRuntimeSessionMode;
  options?: SessionStoreOptions;
}>;

export type CourseRuntimeWorkspaceOptions = Readonly<{
  cwd: string;
  session: CourseRuntimeSessionOptions;
}>;

export type CourseRuntimeWorkspace = Readonly<{
  root: string;
  sessionPath: string;
  sessionMode: CourseRuntimeSessionMode;
}>;

type WorkspaceIdentity = Readonly<{
  configuredRoot: string;
  canonicalRoot: string;
  device: number | bigint;
  inode: number | bigint;
  birthtimeMs: number | bigint;
  publicValue: CourseRuntimeWorkspace;
}>;

export type CourseRuntimeToolsFactoryInput = Readonly<{
  workspace: CourseRuntimeWorkspace;
  baseTools: ToolRegistry;
}>;

export type CourseRuntimeResourcesFactoryInput = Readonly<{
  workspace: CourseRuntimeWorkspace;
  roots: readonly ResourceRootDefinition[];
}>;

export type CourseRuntimeSessionFactoryInput = Readonly<{
  workspace: CourseRuntimeWorkspace;
  options: SessionStoreOptions;
}>;

export type CourseRuntimeExtensionsFactoryInput = Readonly<{
  workspace: CourseRuntimeWorkspace;
  resources: ResourceLoader;
  tools: ToolRegistry;
  definitions: readonly ExtensionDefinition[];
}>;

export type CourseRuntimeAgentFactoryInput = Readonly<{
  workspace: CourseRuntimeWorkspace;
  model: CourseModel;
  tools: ToolRegistry;
  messages: readonly CourseMessage[];
  maxSteps?: number;
}>;

type RuntimeFallback<Input, Output> = (input: Input) => Promise<Output>;
type RuntimeFactory<Input, Output> = (
  input: Input,
  fallback: RuntimeFallback<Input, Output>,
) => Output | PromiseLike<Output>;

/**
 * Optional composition seams for deterministic hosts and tests. Each fallback
 * is memoized: calling it more than once returns the same selected operation.
 */
export type CourseRuntimeFactoryOverrides = Readonly<{
  createTools?: RuntimeFactory<CourseRuntimeToolsFactoryInput, ToolRegistry>;
  createResources?: RuntimeFactory<
    CourseRuntimeResourcesFactoryInput,
    ResourceLoader
  >;
  createSession?: RuntimeFactory<
    CourseRuntimeSessionFactoryInput,
    SessionStore
  >;
  createExtensions?: RuntimeFactory<
    CourseRuntimeExtensionsFactoryInput,
    ExtensionHost
  >;
  createAgent?: RuntimeFactory<CourseRuntimeAgentFactoryInput, Agent>;
}>;

export type CourseRuntimeOptions = CourseRuntimeWorkspaceOptions &
  Readonly<{
    model: CourseModel;
    maxSteps?: number;
    tools?: readonly unknown[];
    resourceRoots?: readonly ResourceRootDefinition[];
    extensions?: readonly ExtensionDefinition[];
    factories?: CourseRuntimeFactoryOverrides;
  }>;

export type CourseRuntimeState = "open" | "failed" | "disposing" | "disposed";

export type CourseRuntime = Readonly<{
  workspace: CourseRuntimeWorkspace;
  agent: Agent;
  session: SessionTree;
  tools: ToolRegistry;
  extensions: ExtensionHost;
  readonly state: CourseRuntimeState;
  flush: () => Promise<void>;
  dispose: () => Promise<void>;
}>;

export type CourseRuntimeManagerState = "open" | "disposing" | "disposed";

type CapturedWorkspaceOptions = Readonly<{
  cwd: string;
  sessionPath: string;
  sessionMode: CourseRuntimeSessionMode;
  sessionOptions: SessionStoreOptions;
}>;

type CapturedSharedOptions = Readonly<{
  model: CourseModel;
  maxSteps?: number;
  baseTools: ToolRegistry;
  resourceRoots: readonly ResourceRootDefinition[];
  extensions: readonly ExtensionDefinition[];
  factories: CourseRuntimeFactoryOverrides;
}>;

type CapturedRuntimeOptions = Readonly<{
  workspace: CapturedWorkspaceOptions;
  shared: CapturedSharedOptions;
}>;

type RunGate = Readonly<{
  promise: Promise<void>;
  resolve: () => void;
}>;

type RuntimeOperationContext = {
  readonly token: symbol;
  active: boolean;
};

type CreatedSessionIdentity = Readonly<{
  path: string;
  parent: string;
  workspaceRoot: string;
  device: bigint;
  inode: bigint;
  birthtimeNs: bigint;
  contentsBase64: string;
}>;

type CreatedSessionParentIdentity = Readonly<{
  path: string;
  realPath: string;
  workspaceRoot: string;
  device: bigint;
  inode: bigint;
  birthtimeNs: bigint;
}>;

type CreatedSessionParents = Readonly<{
  directories: readonly CreatedSessionParentIdentity[];
}>;

type ConstructionOwnershipRecord = {
  readonly label: string;
  readonly value: object;
  readonly resourceKey?: string;
  readonly cleanup?: () => unknown | PromiseLike<unknown>;
  state: "owned" | "cleaned" | "committed";
};

const createdSessionIdentities = new WeakMap<
  SessionStore,
  CreatedSessionIdentity
>();

/** Build one independently owned runtime for one canonical workspace root. */
export function createCourseRuntime(
  options: CourseRuntimeOptions,
): Promise<CourseRuntime> {
  let captured: CapturedRuntimeOptions;
  try {
    captured = captureRuntimeOptions(options);
  } catch (error) {
    return rejected(
      runtimeFailure(
        "RUNTIME_INVALID_OPTIONS",
        "Course runtime options are invalid",
        error,
      ),
    );
  }
  return buildCourseRuntime(captured.workspace, captured.shared);
}

/**
 * Owns one public runtime reference and serializes workspace replacement.
 * Shared model/config/factory dependencies are captured once at creation.
 */
export class CourseRuntimeManager {
  readonly #shared: CapturedSharedOptions;
  #current: CourseRuntime;
  #state: CourseRuntimeManagerState = "open";
  #tail: Promise<void> = NativePromise.resolve();
  #disposePromise: Promise<void> | undefined;
  readonly #operationContext = new AsyncLocalStorage<RuntimeOperationContext>();
  readonly #operationToken = Symbol("CourseRuntimeManager operation");

  private constructor(shared: CapturedSharedOptions, current: CourseRuntime) {
    this.#shared = shared;
    this.#current = current;
  }

  public static async create(
    options: CourseRuntimeOptions,
  ): Promise<CourseRuntimeManager> {
    let captured: CapturedRuntimeOptions;
    try {
      captured = captureRuntimeOptions(options);
    } catch (error) {
      throw runtimeFailure(
        "RUNTIME_INVALID_OPTIONS",
        "Course runtime manager options are invalid",
        error,
      );
    }
    const current = await buildCourseRuntime(
      captured.workspace,
      captured.shared,
    );
    return new CourseRuntimeManager(captured.shared, current);
  }

  public get state(): CourseRuntimeManagerState {
    return this.#state;
  }

  public get current(): CourseRuntime {
    if (this.#state !== "open") throw disposedFailure();
    return this.#current;
  }

  public replace(
    workspace: CourseRuntimeWorkspaceOptions,
  ): Promise<CourseRuntime> {
    let captured: CapturedWorkspaceOptions;
    try {
      this.#assertNotReentrant("replace");
      this.#assertOpen();
      captured = captureWorkspaceOptions(workspace);
    } catch (error) {
      return rejected(normalizeManagerBoundaryError(error));
    }

    return this.#enqueue(async () => {
      this.#assertOpen();
      const candidate = await buildCourseRuntime(captured, this.#shared);
      if (this.#state !== "open") {
        const cleanupFailures = await collectCleanupFailure(() =>
          candidate.dispose(),
        );
        if (cleanupFailures.length > 0) {
          throw runtimeFailure(
            "RUNTIME_DISPOSAL_FAILED",
            "Replacement was cancelled and candidate cleanup failed",
            frozenAggregate(
              [disposedFailure(), ...cleanupFailures],
              "Replacement cancellation and candidate cleanup failed",
            ),
          );
        }
        throw disposedFailure();
      }

      const previous = this.#current;
      this.#current = candidate;
      try {
        await previous.dispose();
      } catch (error) {
        throw runtimeFailure(
          "RUNTIME_REPLACEMENT_CLEANUP_FAILED",
          "The new runtime is live, but the previous runtime failed to dispose",
          error,
        );
      }
      return candidate;
    });
  }

  public flush(): Promise<void> {
    try {
      this.#assertNotReentrant("flush");
      this.#assertOpen();
    } catch (error) {
      return rejected(normalizeManagerBoundaryError(error));
    }
    return this.#enqueue(async () => {
      this.#assertOpen();
      await this.#current.flush();
    });
  }

  public dispose(): Promise<void> {
    if (this.#isReentrant()) {
      return rejected(reentrantFailure("manager.dispose"));
    }
    if (this.#disposePromise !== undefined) return this.#disposePromise;
    this.#state = "disposing";
    const disposal = this.#enqueue(async () => {
      try {
        await this.#current.dispose();
      } finally {
        this.#state = "disposed";
      }
    });
    this.#disposePromise = disposal;
    return disposal;
  }

  #assertOpen(): void {
    if (this.#state !== "open") throw disposedFailure();
  }

  #assertNotReentrant(operation: string): void {
    if (this.#isReentrant()) throw reentrantFailure(`manager.${operation}`);
  }

  #isReentrant(): boolean {
    const context = reflectApply(
      asyncLocalStorageGetStore,
      this.#operationContext,
      [],
    ) as RuntimeOperationContext | undefined;
    return context?.token === this.#operationToken && context.active;
  }

  #enqueue<Value>(operation: () => Promise<Value>): Promise<Value> {
    const result = reflectApply(nativePromiseThen, this.#tail, [
      () => {
        const context: RuntimeOperationContext = {
          token: this.#operationToken,
          active: true,
        };
        return reflectApply(asyncLocalStorageRun, this.#operationContext, [
          context,
          async () => {
            try {
              return await operation();
            } finally {
              context.active = false;
            }
          },
        ]) as Promise<Value>;
      },
    ]) as Promise<Value>;
    this.#tail = reflectApply(nativePromiseThen, result, [
      () => undefined,
      () => undefined,
    ]) as Promise<void>;
    return result;
  }
}

export function createCourseRuntimeManager(
  options: CourseRuntimeOptions,
): Promise<CourseRuntimeManager> {
  return CourseRuntimeManager.create(options);
}

class OwnedCourseRuntime implements CourseRuntime {
  public readonly workspace: CourseRuntimeWorkspace;
  public readonly agent: Agent;
  public readonly session: SessionTree;
  public readonly tools: ToolRegistry;
  public readonly extensions: ExtensionHost;

  readonly #identity: WorkspaceIdentity;
  readonly #store: SessionStore;
  readonly #persistedMessages: CourseMessage[];
  #state: CourseRuntimeState = "open";
  #eventTail: Promise<void> = NativePromise.resolve();
  #eventFailure: CourseRuntimeError | undefined;
  #unsubscribe: (() => void) | undefined;
  #runGate: RunGate | undefined;
  #disposePromise: Promise<void> | undefined;
  readonly #operationContext = new AsyncLocalStorage<RuntimeOperationContext>();
  readonly #operationToken = Symbol("CourseRuntime operation");

  public constructor(input: {
    identity: WorkspaceIdentity;
    agent: Agent;
    session: SessionTree;
    store: SessionStore;
    tools: ToolRegistry;
    extensions: ExtensionHost;
  }) {
    this.#identity = input.identity;
    this.workspace = input.identity.publicValue;
    this.agent = input.agent;
    this.session = input.session;
    this.#store = input.store;
    this.tools = input.tools;
    this.extensions = input.extensions;
    this.#persistedMessages = [...input.session.activeMessages];

    const listener = (event: AgentEvent) => this.#acceptEvent(event);
    this.#unsubscribe = reflectApply(agentSubscribe, this.agent, [
      listener,
    ]) as () => void;
    Object.freeze(this);
  }

  public get state(): CourseRuntimeState {
    return this.#state;
  }

  public flush(): Promise<void> {
    if (this.#isReentrant()) return rejected(reentrantFailure("runtime.flush"));
    if (this.#state === "disposing" || this.#state === "disposed") {
      return rejected(disposedFailure());
    }
    if (this.#eventFailure !== undefined) {
      return rejected(this.#eventFailure);
    }
    return this.#enqueueEvent(async () => {
      await assertWorkspaceIdentity(this.#identity);
      this.#assertCoherentState();
      await reflectApply(sessionStoreFlush, this.#store, []);
      this.#assertCoherentState();
      await assertWorkspaceIdentity(this.#identity);
    });
  }

  public dispose(): Promise<void> {
    if (this.#isReentrant()) {
      return rejected(reentrantFailure("runtime.dispose"));
    }
    if (this.#disposePromise !== undefined) return this.#disposePromise;
    this.#state = "disposing";
    const disposal = this.#performDispose();
    this.#disposePromise = disposal;
    return disposal;
  }

  #acceptEvent(event: AgentEvent): Promise<void> {
    if (this.#state === "disposed") return rejected(disposedFailure());
    const transcript =
      event.type === "message.accepted"
        ? this.agent.messages
        : event.type === "run.finished"
          ? event.payload.result.messages
          : undefined;

    if (event.type !== "run.finished" && this.#runGate === undefined) {
      this.#runGate = createRunGate();
    }

    const operation = this.#enqueueEvent(async () => {
      await assertWorkspaceIdentity(this.#identity);
      if (transcript !== undefined) await this.#reconcileTranscript(transcript);
      const hookFailures = await this.#emitExtensions(event);
      if (hookFailures.length > 0) {
        throw runtimeFailure(
          "RUNTIME_EVENT_FAILED",
          `${hookFailures.length} Extension event hook(s) failed`,
          frozenAggregate(
            hookFailures.map(
              (failure) =>
                new Error(
                  `${failure.extensionId}[${failure.hookIndex}]: ${failure.message}`,
                ),
            ),
            `${hookFailures.length} Extension event hook(s) failed`,
          ),
        );
      }
      await assertWorkspaceIdentity(this.#identity);
    });

    if (event.type === "run.finished") {
      const gate = this.#runGate;
      this.#runGate = undefined;
      if (gate !== undefined) {
        void reflectApply(nativePromiseThen, operation, [
          gate.resolve,
          gate.resolve,
        ]);
      }
    }
    return operation;
  }

  #enqueueEvent(operation: () => Promise<void>): Promise<void> {
    const result = reflectApply(nativePromiseThen, this.#eventTail, [
      async () => {
        if (this.#eventFailure !== undefined) throw this.#eventFailure;
        try {
          await operation();
        } catch (error) {
          const failure = normalizeEventFailure(error);
          this.#eventFailure = failure;
          if (this.#state === "open") this.#state = "failed";
          throw failure;
        }
      },
    ]) as Promise<void>;
    this.#eventTail = reflectApply(nativePromiseThen, result, [
      () => undefined,
      () => undefined,
    ]) as Promise<void>;
    return result;
  }

  #emitExtensions(event: AgentEvent): Promise<
    readonly Readonly<{
      extensionId: string;
      hookIndex: number;
      message: string;
    }>[]
  > {
    return this.#runOwnedCallback(() =>
      reflectApply(extensionHostEmit, this.extensions, [event]),
    );
  }

  #runOwnedCallback<Value>(
    operation: () => Value | PromiseLike<Value>,
  ): Promise<Value> {
    const context: RuntimeOperationContext = {
      token: this.#operationToken,
      active: true,
    };
    return reflectApply(asyncLocalStorageRun, this.#operationContext, [
      context,
      async () => {
        try {
          return await adoptAsync(operation());
        } finally {
          context.active = false;
        }
      },
    ]) as Promise<Value>;
  }

  #isReentrant(): boolean {
    const context = reflectApply(
      asyncLocalStorageGetStore,
      this.#operationContext,
      [],
    ) as RuntimeOperationContext | undefined;
    return context?.token === this.#operationToken && context.active;
  }

  async #reconcileTranscript(
    transcript: readonly CourseMessage[],
  ): Promise<void> {
    const active = this.session.activeMessages;
    if (!messageArraysEqual(active, this.#persistedMessages)) {
      throw runtimeFailure(
        "RUNTIME_SESSION_DIVERGED",
        "The runtime-owned Session branch changed outside the composition root",
      );
    }
    if (transcript.length < this.#persistedMessages.length) {
      throw runtimeFailure(
        "RUNTIME_SESSION_DIVERGED",
        "Agent transcript moved behind the persisted Session branch",
      );
    }
    for (let index = 0; index < this.#persistedMessages.length; index += 1) {
      if (!messagesEqual(this.#persistedMessages[index], transcript[index])) {
        throw runtimeFailure(
          "RUNTIME_SESSION_DIVERGED",
          `Agent and Session transcripts diverged at message ${index}`,
        );
      }
    }
    for (
      let index = this.#persistedMessages.length;
      index < transcript.length;
      index += 1
    ) {
      const message = transcript[index];
      await reflectApply(sessionTreeAppend, this.session, [message]);
      this.#persistedMessages.push(message);
    }
  }

  #assertCoherentState(): void {
    const activeMessages = this.session.activeMessages;
    const agentMessages = this.agent.messages;
    if (
      !messageArraysEqual(activeMessages, this.#persistedMessages) ||
      !messageArraysEqual(agentMessages, this.#persistedMessages)
    ) {
      throw runtimeFailure(
        "RUNTIME_SESSION_DIVERGED",
        "Agent and Session branches diverged from runtime-owned persistence",
      );
    }
  }

  async #performDispose(): Promise<void> {
    const failures: unknown[] = [];
    try {
      if (this.agent.isRunning) {
        try {
          reflectApply(agentCancel, this.agent, ["Course runtime disposed"]);
        } catch (error) {
          failures.push(error);
        }
        const gate = this.#runGate;
        if (gate !== undefined) await gate.promise;
      }

      try {
        await this.#eventTail;
      } catch (error) {
        failures.push(error);
      }
      if (
        this.#eventFailure !== undefined &&
        !failures.includes(this.#eventFailure)
      ) {
        failures.push(this.#eventFailure);
      }

      this.#unsubscribe?.();
      this.#unsubscribe = undefined;

      // Persistence is attempted before any Extension-owned resource cleanup.
      try {
        this.#assertCoherentState();
      } catch (error) {
        if (!failures.includes(error)) failures.push(error);
      }
      try {
        await reflectApply(sessionStoreFlush, this.#store, []);
      } catch (error) {
        failures.push(error);
      }
      try {
        await this.#runOwnedCallback(() =>
          reflectApply(extensionHostDispose, this.extensions, []),
        );
      } catch (error) {
        failures.push(error);
      }
    } finally {
      this.#state = "disposed";
    }

    if (failures.length > 0) {
      throw runtimeFailure(
        "RUNTIME_DISPOSAL_FAILED",
        `${failures.length} runtime cleanup operation(s) failed`,
        frozenAggregate(failures, "Course runtime disposal failed"),
      );
    }
  }
}

class ConstructionOwnershipLedger {
  readonly #records: ConstructionOwnershipRecord[] = [];

  public mark(): number {
    return this.#records.length;
  }

  public register(label: string, value: unknown): void {
    if (typeof value !== "object" || value === null) return;
    for (let index = this.#records.length - 1; index >= 0; index -= 1) {
      const record = this.#records[index];
      if (record.value === value && record.state === "owned") return;
    }
    const cleanup = constructionCleanup(label, value);
    const resourceKey = constructionResourceKey(label, value);
    this.#records.push({
      label,
      value,
      ...(resourceKey === undefined ? {} : { resourceKey }),
      ...(cleanup === undefined ? {} : { cleanup }),
      state: "owned",
    });
  }

  public async discardUnselected(
    start: number,
    selected: unknown,
  ): Promise<unknown[]> {
    const failures: unknown[] = [];
    let selectedResourceKey: string | undefined;
    for (let index = this.#records.length - 1; index >= start; index -= 1) {
      const record = this.#records[index];
      if (record.state === "owned" && record.value === selected) {
        selectedResourceKey = record.resourceKey;
        break;
      }
    }
    for (let index = this.#records.length - 1; index >= start; index -= 1) {
      const record = this.#records[index];
      if (record.state !== "owned" || record.value === selected) continue;
      if (
        record.resourceKey !== undefined &&
        record.resourceKey === selectedResourceKey
      ) {
        continue;
      }
      const failure = await cleanupConstructionRecord(record);
      if (failure !== undefined) failures.push(failure);
    }
    return failures;
  }

  public async rollback(): Promise<unknown[]> {
    const failures: unknown[] = [];
    for (let index = this.#records.length - 1; index >= 0; index -= 1) {
      const record = this.#records[index];
      if (record.state !== "owned") continue;
      const failure = await cleanupConstructionRecord(record);
      if (failure !== undefined) failures.push(failure);
    }
    return failures;
  }

  public commitAll(): void {
    for (let index = 0; index < this.#records.length; index += 1) {
      const record = this.#records[index];
      if (record.state === "owned") record.state = "committed";
    }
  }
}

function constructionResourceKey(
  label: string,
  value: object,
): string | undefined {
  if (label !== "Session" || !(value instanceof SessionStore)) return undefined;
  return `Session:${reflectApply(sessionStoreCanonicalPathOf, SessionStore, [value]) as string}`;
}

function constructionCleanup(
  label: string,
  value: object,
): (() => unknown | PromiseLike<unknown>) | undefined {
  if (label === "SessionParents" && isCreatedSessionParents(value)) {
    return async () => {
      const failures = await cleanupCreatedSessionParents(value.directories);
      if (failures.length > 0) {
        throw runtimeFailure(
          "RUNTIME_SESSION_ROLLBACK_FAILED",
          "Cannot remove created Session parent directories",
          frozenAggregate(
            failures,
            "Created Session parent directory rollback failed",
          ),
        );
      }
    };
  }
  if (label === "Extensions" && value instanceof ExtensionHost) {
    return () => reflectApply(extensionHostDispose, value, []);
  }
  if (label === "Session" && value instanceof SessionStore) {
    const identity = createdSessionIdentities.get(value);
    if (identity !== undefined) return () => rollbackCreatedSession(identity);
  }
  return undefined;
}

function isCreatedSessionParents(
  value: object,
): value is CreatedSessionParents {
  try {
    return Array.isArray(Reflect.get(value, "directories"));
  } catch {
    return false;
  }
}

async function cleanupCreatedSessionParents(
  directories: readonly CreatedSessionParentIdentity[],
): Promise<unknown[]> {
  const failures: unknown[] = [];
  for (let index = directories.length - 1; index >= 0; index -= 1) {
    const identity = directories[index];
    try {
      const metadata = await lstat(identity.path, { bigint: true });
      const canonical = await realpath(identity.path);
      if (
        !metadata.isDirectory() ||
        metadata.isSymbolicLink() ||
        canonical !== identity.realPath ||
        !isWithin(identity.workspaceRoot, canonical) ||
        metadata.dev !== identity.device ||
        metadata.ino !== identity.inode ||
        metadata.birthtimeNs !== identity.birthtimeNs
      ) {
        failures.push(
          runtimeFailure(
            "RUNTIME_SESSION_ROLLBACK_FAILED",
            "Created Session parent changed before rollback; refusing to remove it",
          ),
        );
        continue;
      }
      await rmdir(identity.path);
    } catch (error) {
      if (!isFileSystemCode(error, "ENOENT")) {
        failures.push(
          error instanceof CourseRuntimeError
            ? error
            : runtimeFailure(
                "RUNTIME_SESSION_ROLLBACK_FAILED",
                "Cannot remove an owned Session parent during rollback",
                error,
              ),
        );
      }
    }
  }
  return failures;
}

async function cleanupConstructionRecord(
  record: ConstructionOwnershipRecord,
): Promise<unknown | undefined> {
  if (record.state !== "owned") return undefined;
  record.state = "cleaned";
  if (record.cleanup === undefined) return undefined;
  try {
    await adoptAsync(record.cleanup());
    return undefined;
  } catch (error) {
    return error;
  }
}

async function rollbackCreatedSession(
  identity: CreatedSessionIdentity,
): Promise<void> {
  let metadata: BigIntStats;
  let canonicalParent: string;
  let contentsBase64: string;
  try {
    canonicalParent = await realpath(identity.parent);
    metadata = await lstat(identity.path, { bigint: true });
    contentsBase64 = (await readFile(identity.path)).toString("base64");
  } catch (error) {
    if (isFileSystemCode(error, "ENOENT")) return;
    throw runtimeFailure(
      "RUNTIME_SESSION_ROLLBACK_FAILED",
      "Cannot inspect the create-mode Session during rollback",
      error,
    );
  }
  if (
    !isWithin(identity.workspaceRoot, canonicalParent) ||
    !metadata.isFile() ||
    metadata.isSymbolicLink() ||
    metadata.dev !== identity.device ||
    metadata.ino !== identity.inode ||
    metadata.birthtimeNs !== identity.birthtimeNs ||
    contentsBase64 !== identity.contentsBase64
  ) {
    throw runtimeFailure(
      "RUNTIME_SESSION_ROLLBACK_FAILED",
      "Create-mode Session changed before rollback; refusing to remove it",
    );
  }
  try {
    await unlink(identity.path);
    await syncDirectory(identity.parent);
  } catch (error) {
    throw runtimeFailure(
      "RUNTIME_SESSION_ROLLBACK_FAILED",
      "Cannot remove the owned create-mode Session during rollback",
      error,
    );
  }
}

async function syncDirectory(path: string): Promise<void> {
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    handle = await open(path, "r");
    await handle.sync();
  } catch (error) {
    if (
      !isFileSystemCode(error, "EINVAL") &&
      !isFileSystemCode(error, "ENOTSUP") &&
      !isFileSystemCode(error, "EPERM")
    ) {
      throw error;
    }
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

async function buildCourseRuntime(
  capturedWorkspace: CapturedWorkspaceOptions,
  shared: CapturedSharedOptions,
): Promise<CourseRuntime> {
  const ownership = new ConstructionOwnershipLedger();
  let identity: WorkspaceIdentity;
  try {
    identity = await captureWorkspace(capturedWorkspace);
  } catch (error) {
    if (error instanceof CourseRuntimeError) throw error;
    throw runtimeFailure(
      "RUNTIME_INVALID_OPTIONS",
      "Cannot capture the Course runtime workspace",
      error,
    );
  }

  try {
    const sessionParents = await prepareSessionParents(identity);
    ownership.register("SessionParents", sessionParents);
    const toolsInput = Object.freeze({
      workspace: identity.publicValue,
      baseTools: snapshotRegistry(shared.baseTools),
    });
    const baseTools = await invokeFactory(
      "Tools",
      shared.factories.createTools,
      toolsInput,
      defaultCreateTools,
      identity,
      ownership,
    );
    assertFactoryProduct(baseTools, isToolRegistry, "Tools");

    const roots = Object.freeze([
      Object.freeze({ id: "workspace", directory: identity.canonicalRoot }),
      ...shared.resourceRoots,
    ]);
    const resourcesInput = Object.freeze({
      workspace: identity.publicValue,
      roots,
    });
    const resources = await invokeFactory(
      "Resources",
      shared.factories.createResources,
      resourcesInput,
      defaultCreateResources,
      identity,
      ownership,
    );
    assertFactoryProduct(resources, isResourceLoader, "Resources");

    const sessionInput = Object.freeze({
      workspace: identity.publicValue,
      options: capturedWorkspace.sessionOptions,
    });
    const store = await invokeFactory(
      "Session",
      shared.factories.createSession,
      sessionInput,
      defaultCreateSession,
      identity,
      ownership,
    );
    assertFactoryProduct(store, isSessionStore, "Session");
    const session = new SessionTree(store);

    const extensionsInput = Object.freeze({
      workspace: identity.publicValue,
      resources,
      tools: baseTools,
      definitions: shared.extensions,
    });
    const extensions = await invokeFactory(
      "Extensions",
      shared.factories.createExtensions,
      extensionsInput,
      defaultCreateExtensions,
      identity,
      ownership,
    );
    assertFactoryProduct(extensions, isExtensionHost, "Extensions");
    const tools = extensions.tools;

    const agentInput = Object.freeze({
      workspace: identity.publicValue,
      model: shared.model,
      tools,
      messages: session.activeMessages,
      ...(shared.maxSteps === undefined ? {} : { maxSteps: shared.maxSteps }),
    });
    const agent = await invokeFactory(
      "Agent",
      shared.factories.createAgent,
      agentInput,
      defaultCreateAgent,
      identity,
      ownership,
    );
    assertFactoryProduct(agent, isAgent, "Agent");
    await assertWorkspaceIdentity(identity);
    if (!messageArraysEqual(agent.messages, session.activeMessages)) {
      throw runtimeFailure(
        "RUNTIME_SESSION_DIVERGED",
        "Constructed Agent transcript does not match the active Session branch",
      );
    }

    const runtime = new OwnedCourseRuntime({
      identity,
      agent,
      session,
      store,
      tools,
      extensions,
    });
    ownership.commitAll();
    return runtime;
  } catch (error) {
    const cleanupFailures = await ownership.rollback();
    if (error instanceof CourseRuntimeError && cleanupFailures.length === 0) {
      throw error;
    }
    const cause =
      cleanupFailures.length === 0
        ? error
        : frozenAggregate(
            [error, ...cleanupFailures],
            "Runtime construction and rollback failed",
          );
    throw runtimeFailure(
      "RUNTIME_CONSTRUCTION_FAILED",
      cleanupFailures.length === 0
        ? "Course runtime construction failed"
        : "Course runtime construction and rollback failed",
      cause,
    );
  }
}

async function invokeFactory<Input, Output>(
  label: string,
  override: RuntimeFactory<Input, Output> | undefined,
  input: Input,
  defaultFactory: (input: Input) => Output | PromiseLike<Output>,
  identity: WorkspaceIdentity,
  ownership: ConstructionOwnershipLedger,
): Promise<Output> {
  const ownershipStart = ownership.mark();
  let fallbackPromise: Promise<Output> | undefined;
  const fallback: RuntimeFallback<Input, Output> = () => {
    if (fallbackPromise !== undefined) return fallbackPromise;
    fallbackPromise = (async () => {
      await assertWorkspaceIdentity(identity);
      if (label === "Session") await assertFinalSessionParent(identity);
      const output = await adoptAsync(defaultFactory(input));
      ownership.register(label, output);
      if (label === "Session") await assertFinalSessionParent(identity);
      await assertWorkspaceIdentity(identity);
      return output;
    })();
    void reflectApply(nativePromiseThen, fallbackPromise, [
      () => undefined,
      () => undefined,
    ]);
    return fallbackPromise;
  };
  Object.freeze(fallback);

  await assertWorkspaceIdentity(identity);
  if (label === "Session") await assertFinalSessionParent(identity);
  let selected: Output | PromiseLike<Output>;
  try {
    selected =
      override === undefined
        ? fallback(input)
        : reflectApply(override, undefined, [input, fallback]);
  } catch (error) {
    return await rethrowAfterFallback(
      new Error(`${label} factory threw`, { cause: error }),
      fallbackPromise,
      label,
    );
  }
  let output: Output;
  try {
    output = await adoptAsync(selected);
  } catch (error) {
    return await rethrowAfterFallback(error, fallbackPromise, label);
  }
  ownership.register(label, output);
  try {
    if (fallbackPromise !== undefined) await fallbackPromise;
  } catch (error) {
    return await rethrowAfterFallback(error, fallbackPromise, label);
  }
  const selectionFailures = await ownership.discardUnselected(
    ownershipStart,
    output,
  );
  if (selectionFailures.length > 0) {
    throw frozenAggregate(
      selectionFailures,
      `${label} factory selection cleanup failed`,
    );
  }
  if (label === "Session") await assertFinalSessionParent(identity);
  await assertWorkspaceIdentity(identity);
  return output;
}

async function rethrowAfterFallback<Output>(
  primary: unknown,
  fallbackPromise: Promise<Output> | undefined,
  label: string,
): Promise<never> {
  if (fallbackPromise !== undefined) {
    try {
      await fallbackPromise;
    } catch (fallbackError) {
      if (fallbackError !== primary) {
        throw frozenAggregate(
          [primary, fallbackError],
          `${label} factory and fallback failed`,
        );
      }
    }
  }
  throw primary;
}

function defaultCreateTools(
  input: CourseRuntimeToolsFactoryInput,
): ToolRegistry {
  const registry = new ToolRegistry([
    createReadTool(input.workspace.root),
    createWriteTool(input.workspace.root),
    createNodeProcessTool(input.workspace.root),
  ]);
  const definitions = toolsFromRegistry(input.baseTools);
  reflectApply(toolRegistryRegisterMany, registry, [definitions]);
  return registry;
}

function defaultCreateResources(
  input: CourseRuntimeResourcesFactoryInput,
): Promise<ResourceLoader> {
  return ResourceLoader.create(input.roots);
}

async function defaultCreateSession(
  input: CourseRuntimeSessionFactoryInput,
): Promise<SessionStore> {
  if (input.workspace.sessionMode === "resume") {
    return SessionStore.load(input.workspace.sessionPath, input.options);
  }

  let absent = false;
  try {
    await lstat(input.workspace.sessionPath);
  } catch (error) {
    if (!isFileSystemCode(error, "ENOENT")) throw error;
    absent = true;
  }
  const store = await SessionStore.create(
    input.workspace.sessionPath,
    input.options,
  );
  if (absent) {
    const contentsBase64 = Buffer.from(
      `${JSON.stringify(store.header)}\n`,
      "utf8",
    ).toString("base64");
    const metadata = await lstat(input.workspace.sessionPath, { bigint: true });
    if (
      !metadata.isFile() ||
      metadata.isSymbolicLink() ||
      metadata.size !== BigInt(Buffer.from(contentsBase64, "base64").byteLength)
    ) {
      throw runtimeFailure(
        "RUNTIME_SESSION_ROLLBACK_FAILED",
        "Created Session path is not an owned regular file",
      );
    }
    createdSessionIdentities.set(
      store,
      Object.freeze({
        path: input.workspace.sessionPath,
        parent: dirname(input.workspace.sessionPath),
        workspaceRoot: input.workspace.root,
        device: metadata.dev,
        inode: metadata.ino,
        birthtimeNs: metadata.birthtimeNs,
        contentsBase64,
      }),
    );
  }
  return store;
}

async function defaultCreateExtensions(
  input: CourseRuntimeExtensionsFactoryInput,
): Promise<ExtensionHost> {
  const options: ExtensionHostOptions = {
    resources: input.resources,
    tools: input.tools,
  };
  const host = new ExtensionHost(options);
  try {
    host.discover(input.definitions);
    for (let index = 0; index < input.definitions.length; index += 1) {
      await host.activate(input.definitions[index].id);
    }
    return host;
  } catch (error) {
    const cleanupFailures = await collectCleanupFailure(() => host.dispose());
    if (cleanupFailures.length === 0) throw error;
    throw frozenAggregate(
      [error, ...cleanupFailures],
      "Extension construction and rollback failed",
    );
  }
}

function defaultCreateAgent(input: CourseRuntimeAgentFactoryInput): Agent {
  const options: AgentOptions = {
    model: input.model,
    tools: input.tools,
    messages: input.messages,
    ...(input.maxSteps === undefined ? {} : { maxSteps: input.maxSteps }),
  };
  return new Agent(options);
}

function captureRuntimeOptions(value: unknown): CapturedRuntimeOptions {
  const callCwd = processCwd();
  const record = exactDataRecord(value, [
    "cwd",
    "model",
    "session",
    "maxSteps",
    "tools",
    "resourceRoots",
    "extensions",
    "factories",
  ]);
  const workspace = captureWorkspaceOptions(
    {
      cwd: requireString(record.cwd, "cwd"),
      session: captureSessionInput(record.session),
    },
    callCwd,
  );
  const model = snapshotModel(record.model);
  const maxSteps = optionalPositiveInteger(record.maxSteps, "maxSteps");
  const baseDefinitions = snapshotDenseArray(record.tools ?? [], "tools");
  const baseTools = new ToolRegistry(baseDefinitions);
  const resourceRoots = snapshotResourceRoots(
    record.resourceRoots ?? [],
    callCwd,
  );
  const extensions = snapshotExtensionDefinitions(record.extensions ?? []);
  const factories = snapshotFactories(record.factories);
  return Object.freeze({
    workspace,
    shared: Object.freeze({
      model,
      ...(maxSteps === undefined ? {} : { maxSteps }),
      baseTools,
      resourceRoots,
      extensions,
      factories,
    }),
  });
}

function captureWorkspaceOptions(
  value: unknown,
  callCwd = processCwd(),
): CapturedWorkspaceOptions {
  const record = exactDataRecord(value, ["cwd", "session"]);
  const cwd = requireString(record.cwd, "cwd");
  const session = captureSessionInput(record.session);
  return Object.freeze({
    cwd: resolve(callCwd, cwd),
    sessionPath: session.path,
    sessionMode: session.mode,
    sessionOptions: snapshotSessionStoreOptions(session.options),
  });
}

function captureSessionInput(value: unknown): CourseRuntimeSessionOptions {
  const record = exactDataRecord(value, ["path", "mode", "options"]);
  const path = normalizeSessionRelativePath(
    requireString(record.path, "session.path"),
  );
  const mode = record.mode;
  if (mode !== "create" && mode !== "resume") {
    throw new TypeError('session.mode must be "create" or "resume"');
  }
  return Object.freeze({
    path,
    mode,
    ...(record.options === undefined
      ? {}
      : { options: record.options as never }),
  });
}

function snapshotSessionStoreOptions(value: unknown): SessionStoreOptions {
  if (value === undefined) return Object.freeze({});
  const record = exactDataRecord(value, [
    "sessionId",
    "clock",
    "idFactory",
    "fileSystem",
  ]);
  return Object.freeze({
    ...(record.sessionId === undefined
      ? {}
      : {
          sessionId: requireString(
            record.sessionId,
            "session.options.sessionId",
          ),
        }),
    ...(record.clock === undefined
      ? {}
      : {
          clock: requireFunction<readonly [], string>(
            record.clock,
            "session.options.clock",
          ),
        }),
    ...(record.idFactory === undefined
      ? {}
      : {
          idFactory: requireFunction<readonly [], string>(
            record.idFactory,
            "session.options.idFactory",
          ),
        }),
    ...(record.fileSystem === undefined
      ? {}
      : { fileSystem: record.fileSystem as SessionStoreOptions["fileSystem"] }),
  });
}

function snapshotFactories(value: unknown): CourseRuntimeFactoryOverrides {
  if (value === undefined) return Object.freeze({});
  const record = exactDataRecord(value, [
    "createTools",
    "createResources",
    "createSession",
    "createExtensions",
    "createAgent",
  ]);
  return Object.freeze({
    ...optionalFactory(record, "createTools"),
    ...optionalFactory(record, "createResources"),
    ...optionalFactory(record, "createSession"),
    ...optionalFactory(record, "createExtensions"),
    ...optionalFactory(record, "createAgent"),
  }) as CourseRuntimeFactoryOverrides;
}

function optionalFactory(
  record: Record<string, unknown>,
  key: keyof CourseRuntimeFactoryOverrides,
): Record<string, unknown> {
  const value = record[key];
  if (value === undefined) return {};
  return { [key]: requireFunction(value, `factories.${key}`) };
}

function snapshotResourceRoots(
  value: unknown,
  callCwd: string,
): readonly ResourceRootDefinition[] {
  const values = snapshotDenseArray(value, "resourceRoots");
  const roots: ResourceRootDefinition[] = [];
  const ids = new Set<string>(["workspace"]);
  for (let index = 0; index < values.length; index += 1) {
    const record = exactDataRecord(values[index], ["id", "directory"]);
    const id = requireString(record.id, `resourceRoots[${index}].id`);
    if (ids.has(id))
      throw new TypeError(`Resource root ID "${id}" is duplicated`);
    ids.add(id);
    roots.push(
      Object.freeze({
        id,
        directory: resolve(
          callCwd,
          requireString(record.directory, `resourceRoots[${index}].directory`),
        ),
      }),
    );
  }
  return Object.freeze(roots);
}

function snapshotExtensionDefinitions(
  value: unknown,
): readonly ExtensionDefinition[] {
  const values = snapshotDenseArray(value, "extensions");
  const definitions: ExtensionDefinition[] = [];
  const ids = new Set<string>();
  for (let index = 0; index < values.length; index += 1) {
    const record = exactDataRecord(values[index], ["id", "create"]);
    const id = requireString(record.id, `extensions[${index}].id`);
    if (ids.has(id)) throw new TypeError(`Extension ID "${id}" is duplicated`);
    ids.add(id);
    definitions.push(
      Object.freeze({
        id,
        create: requireFunction<
          readonly [],
          ReturnType<ExtensionDefinition["create"]>
        >(record.create, `extensions[${index}].create`),
      }),
    );
  }
  return Object.freeze(definitions);
}

async function captureWorkspace(
  input: CapturedWorkspaceOptions,
): Promise<WorkspaceIdentity> {
  const configuredRoot = resolve(input.cwd);
  let canonicalRoot: string;
  let metadata: Awaited<ReturnType<typeof stat>>;
  try {
    canonicalRoot = await realpath(configuredRoot);
    metadata = await stat(canonicalRoot);
  } catch (error) {
    throw runtimeFailure(
      "RUNTIME_INVALID_OPTIONS",
      "Workspace root cannot be inspected",
      error,
    );
  }
  if (!metadata.isDirectory()) {
    throw runtimeFailure(
      "RUNTIME_INVALID_OPTIONS",
      "Workspace root must be a directory",
    );
  }
  const sessionPath = resolve(canonicalRoot, ...input.sessionPath.split("/"));
  if (!isWithin(canonicalRoot, sessionPath) || sessionPath === canonicalRoot) {
    throw runtimeFailure(
      "RUNTIME_INVALID_OPTIONS",
      "Session path must name a file inside the workspace root",
    );
  }
  await assertNearestSessionParentConfined(canonicalRoot, sessionPath);
  const publicValue = Object.freeze({
    root: canonicalRoot,
    sessionPath,
    sessionMode: input.sessionMode,
  });
  return Object.freeze({
    configuredRoot,
    canonicalRoot,
    device: metadata.dev,
    inode: metadata.ino,
    birthtimeMs: metadata.birthtimeMs,
    publicValue,
  });
}

async function assertNearestSessionParentConfined(
  canonicalRoot: string,
  sessionPath: string,
): Promise<void> {
  let candidate = dirname(sessionPath);
  while (true) {
    try {
      const metadata = await lstat(candidate);
      const canonical = await realpath(candidate);
      const canonicalMetadata = await stat(canonical);
      if (
        !metadata.isDirectory() ||
        !canonicalMetadata.isDirectory() ||
        !isWithin(canonicalRoot, canonical)
      ) {
        throw runtimeFailure(
          "RUNTIME_INVALID_OPTIONS",
          "Session parent resolves outside the workspace root",
        );
      }
      return;
    } catch (error) {
      if (!isFileSystemCode(error, "ENOENT")) {
        if (error instanceof CourseRuntimeError) throw error;
        throw runtimeFailure(
          "RUNTIME_INVALID_OPTIONS",
          "Session parent cannot be inspected safely",
          error,
        );
      }
    }
    const parent = dirname(candidate);
    if (parent === candidate) {
      throw runtimeFailure(
        "RUNTIME_INVALID_OPTIONS",
        "Session path has no existing confined parent",
      );
    }
    candidate = parent;
  }
}

async function prepareSessionParents(
  identity: WorkspaceIdentity,
): Promise<CreatedSessionParents> {
  const finalParent = dirname(identity.publicValue.sessionPath);
  const missing: string[] = [];
  let candidate = finalParent;
  while (true) {
    try {
      const metadata = await lstat(candidate);
      if (!metadata.isDirectory()) {
        throw runtimeFailure(
          "RUNTIME_INVALID_OPTIONS",
          "Session parent path contains a non-directory entry",
        );
      }
      break;
    } catch (error) {
      if (!isFileSystemCode(error, "ENOENT")) throw error;
      missing.push(candidate);
      const parent = dirname(candidate);
      if (parent === candidate) {
        throw runtimeFailure(
          "RUNTIME_INVALID_OPTIONS",
          "Session parent cannot be created safely",
        );
      }
      candidate = parent;
    }
  }

  if (identity.publicValue.sessionMode === "resume" && missing.length > 0) {
    throw runtimeFailure(
      "RUNTIME_INVALID_OPTIONS",
      "Resume-mode Session parent must already exist",
    );
  }

  const created: CreatedSessionParentIdentity[] = [];
  try {
    for (let index = missing.length - 1; index >= 0; index -= 1) {
      const directory = missing[index];
      let createdHere = false;
      try {
        await mkdir(directory);
        createdHere = true;
      } catch (error) {
        if (!isFileSystemCode(error, "EEXIST")) throw error;
      }
      const canonical = await realpath(directory);
      const metadata = await lstat(directory, { bigint: true });
      const canonicalMetadata = await stat(canonical, { bigint: true });
      if (
        !metadata.isDirectory() ||
        metadata.isSymbolicLink() ||
        !canonicalMetadata.isDirectory() ||
        canonicalMetadata.dev !== metadata.dev ||
        canonicalMetadata.ino !== metadata.ino ||
        !isWithin(identity.canonicalRoot, canonical)
      ) {
        throw runtimeFailure(
          "RUNTIME_INVALID_OPTIONS",
          "Created Session parent escaped the workspace root",
        );
      }
      if (createdHere) {
        created.push(
          Object.freeze({
            path: directory,
            realPath: canonical,
            workspaceRoot: identity.canonicalRoot,
            device: metadata.dev,
            inode: metadata.ino,
            birthtimeNs: metadata.birthtimeNs,
          }),
        );
      }
      await assertWorkspaceIdentity(identity);
    }
    const finalCanonical = await realpath(finalParent);
    if (!isWithin(identity.canonicalRoot, finalCanonical)) {
      throw runtimeFailure(
        "RUNTIME_INVALID_OPTIONS",
        "Final Session parent escaped the workspace root",
      );
    }
    return Object.freeze({ directories: Object.freeze(created.slice()) });
  } catch (error) {
    const cleanupFailures = await cleanupCreatedSessionParents(created);
    if (cleanupFailures.length === 0) throw error;
    throw runtimeFailure(
      "RUNTIME_SESSION_ROLLBACK_FAILED",
      "Session parent preparation and rollback failed",
      frozenAggregate(
        [error, ...cleanupFailures],
        "Session parent preparation and rollback failed",
      ),
    );
  }
}

async function assertFinalSessionParent(
  identity: WorkspaceIdentity,
): Promise<void> {
  try {
    const parent = dirname(identity.publicValue.sessionPath);
    const canonical = await realpath(parent);
    const metadata = await stat(canonical);
    if (
      !metadata.isDirectory() ||
      !isWithin(identity.canonicalRoot, canonical)
    ) {
      throw runtimeFailure(
        "RUNTIME_INVALID_OPTIONS",
        "Final Session parent resolves outside the workspace root",
      );
    }
    await assertWorkspaceIdentity(identity);
  } catch (error) {
    if (error instanceof CourseRuntimeError) throw error;
    throw runtimeFailure(
      "RUNTIME_INVALID_OPTIONS",
      "Final Session parent cannot be inspected safely",
      error,
    );
  }
}

async function assertWorkspaceIdentity(
  identity: WorkspaceIdentity,
): Promise<void> {
  try {
    const canonical = await realpath(identity.configuredRoot);
    const metadata = await stat(canonical);
    if (
      canonical !== identity.canonicalRoot ||
      !metadata.isDirectory() ||
      metadata.dev !== identity.device ||
      metadata.ino !== identity.inode ||
      metadata.birthtimeMs !== identity.birthtimeMs
    ) {
      throw new Error("Workspace identity changed");
    }
  } catch (error) {
    if (
      error instanceof CourseRuntimeError &&
      error.code === "RUNTIME_ROOT_CHANGED"
    ) {
      throw error;
    }
    throw runtimeFailure(
      "RUNTIME_ROOT_CHANGED",
      "Workspace root changed after runtime construction began",
      error,
    );
  }
}

function assertFactoryProduct<Output extends object>(
  value: unknown,
  guard: (candidate: object) => candidate is Output,
  label: string,
): asserts value is Output {
  if (
    typeof value !== "object" ||
    value === null ||
    nodeIsProxy(value) ||
    !guard(value)
  ) {
    throw new TypeError(`${label} factory returned an invalid product`);
  }
}

function isToolRegistry(value: object): value is ToolRegistry {
  return value instanceof ToolRegistry;
}

function isResourceLoader(value: object): value is ResourceLoader {
  return value instanceof ResourceLoader;
}

function isSessionStore(value: object): value is SessionStore {
  return value instanceof SessionStore;
}

function isExtensionHost(value: object): value is ExtensionHost {
  return value instanceof ExtensionHost;
}

function isAgent(value: object): value is Agent {
  return value instanceof Agent;
}

function toolsFromRegistry(registry: ToolRegistry): readonly unknown[] {
  const definitions: unknown[] = [];
  const names = registry.names;
  for (let index = 0; index < names.length; index += 1) {
    const tool = reflectApply(toolRegistryGet, registry, [names[index]]);
    if (tool !== undefined) definitions.push(tool);
  }
  return Object.freeze(definitions);
}

function snapshotRegistry(registry: ToolRegistry): ToolRegistry {
  return reflectApply(toolRegistrySnapshot, registry, []) as ToolRegistry;
}

function createRunGate(): RunGate {
  let resolveGate!: () => void;
  const promise = new NativePromise<void>((resolveValue) => {
    resolveGate = resolveValue;
  });
  let selected = false;
  return Object.freeze({
    promise,
    resolve: () => {
      if (selected) return;
      selected = true;
      resolveGate();
    },
  });
}

function messageArraysEqual(
  left: readonly CourseMessage[],
  right: readonly CourseMessage[],
): boolean {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (!messagesEqual(left[index], right[index])) return false;
  }
  return true;
}

function messagesEqual(left: CourseMessage, right: CourseMessage): boolean {
  if (left.role !== right.role || left.id !== right.id) return false;
  if (left.role === "user" && right.role === "user") {
    return left.content === right.content;
  }
  if (left.role === "toolResult" && right.role === "toolResult") {
    return (
      left.toolCallId === right.toolCallId &&
      left.toolName === right.toolName &&
      left.content === right.content &&
      left.isError === right.isError
    );
  }
  if (left.role !== "assistant" || right.role !== "assistant") return false;
  if (left.content.length !== right.content.length) return false;
  for (let index = 0; index < left.content.length; index += 1) {
    const leftBlock = left.content[index];
    const rightBlock = right.content[index];
    if (leftBlock.type !== rightBlock.type) return false;
    if (leftBlock.type === "text" && rightBlock.type === "text") {
      if (leftBlock.text !== rightBlock.text) return false;
      continue;
    }
    if (leftBlock.type !== "toolCall" || rightBlock.type !== "toolCall") {
      return false;
    }
    if (
      leftBlock.id !== rightBlock.id ||
      leftBlock.name !== rightBlock.name ||
      !jsonEqual(leftBlock.arguments, rightBlock.arguments)
    ) {
      return false;
    }
  }
  return true;
}

function jsonEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) return false;
    for (let index = 0; index < left.length; index += 1) {
      if (!jsonEqual(left[index], right[index])) return false;
    }
    return true;
  }
  if (!isRecord(left) || !isRecord(right)) return false;
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  if (leftKeys.length !== rightKeys.length) return false;
  for (let index = 0; index < leftKeys.length; index += 1) {
    if (
      leftKeys[index] !== rightKeys[index] ||
      !jsonEqual(left[leftKeys[index]], right[rightKeys[index]])
    ) {
      return false;
    }
  }
  return true;
}

function exactDataRecord(
  value: unknown,
  allowedKeys: readonly string[],
): Record<string, unknown> {
  if (
    typeof value !== "object" ||
    value === null ||
    nodeIsProxy(value) ||
    (Object.getPrototypeOf(value) !== Object.prototype &&
      Object.getPrototypeOf(value) !== null)
  ) {
    throw new TypeError("Expected an ordinary options object");
  }
  const allowed = new Set(allowedKeys);
  const result: Record<string, unknown> = Object.create(null) as Record<
    string,
    unknown
  >;
  const keys = Reflect.ownKeys(value);
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    if (typeof key !== "string" || !allowed.has(key)) {
      throw new TypeError(`Unexpected option ${String(key)}`);
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined) throw new TypeError(`Option ${key} vanished`);
    if ("value" in descriptor) result[key] = descriptor.value;
    else if (typeof descriptor.get === "function") {
      result[key] = reflectApply(descriptor.get, value, []);
    } else {
      throw new TypeError(`Option ${key} is unreadable`);
    }
  }
  return result;
}

function snapshotDenseArray(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value) || nodeIsProxy(value)) {
    throw new TypeError(`${label} must be an Array`);
  }
  const descriptor = Object.getOwnPropertyDescriptor(value, "length");
  if (
    descriptor === undefined ||
    !("value" in descriptor) ||
    !Number.isSafeInteger(descriptor.value) ||
    descriptor.value < 0
  ) {
    throw new TypeError(`${label}.length is invalid`);
  }
  const output: unknown[] = [];
  for (let index = 0; index < descriptor.value; index += 1) {
    const item = Object.getOwnPropertyDescriptor(value, String(index));
    if (item === undefined || !("value" in item)) {
      throw new TypeError(`${label}[${index}] must be a data property`);
    }
    output.push(item.value);
  }
  return Object.freeze(output);
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0 || value.includes("\0")) {
    throw new TypeError(`${label} must be a non-empty string`);
  }
  return value;
}

function requireFunction<Arguments extends readonly unknown[], Result>(
  value: unknown,
  label: string,
): (...argumentsValue: Arguments) => Result {
  if (typeof value !== "function" || nodeIsProxy(value)) {
    throw new TypeError(`${label} must be a non-Proxy function`);
  }
  return value as (...argumentsValue: Arguments) => Result;
}

function snapshotModel(value: unknown): CourseModel {
  if (
    (typeof value !== "object" && typeof value !== "function") ||
    value === null ||
    nodeIsProxy(value)
  ) {
    throw new TypeError("model must implement CourseModel");
  }
  let stream: unknown;
  try {
    stream = Reflect.get(value, "stream");
  } catch (error) {
    throw new TypeError("model.stream could not be captured", { cause: error });
  }
  if (typeof stream !== "function" || nodeIsProxy(stream)) {
    throw new TypeError("model.stream must be a non-Proxy function");
  }
  return Object.freeze({
    stream: (request, signal) => reflectApply(stream, value, [request, signal]),
  });
}

function optionalPositiveInteger(
  value: unknown,
  label: string,
): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw new TypeError(`${label} must be a positive safe integer`);
  }
  return value as number;
}

function normalizeSessionRelativePath(value: string): string {
  if (
    isAbsolute(value) ||
    posix.isAbsolute(value) ||
    win32.isAbsolute(value) ||
    value.includes(":") ||
    value.startsWith("\\\\") ||
    /^[A-Za-z]:/u.test(value)
  ) {
    throw new TypeError("session.path must be a portable relative path");
  }
  const segments = value.replaceAll("\\", "/").split("/");
  const normalized: string[] = [];
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    if (segment === "" || segment === "." || segment === "..") {
      throw new TypeError("session.path contains an invalid segment");
    }
    if (
      /[. ]$/u.test(segment) ||
      /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(segment)
    ) {
      throw new TypeError("session.path contains a device-like segment");
    }
    normalized.push(segment);
  }
  return normalized.join("/");
}

function isWithin(root: string, target: string): boolean {
  const path = relative(root, target);
  return (
    path !== ".." &&
    !path.startsWith("../") &&
    !path.startsWith("..\\") &&
    !isAbsolute(path)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFileSystemCode(value: unknown, code: string): boolean {
  if (typeof value !== "object" || value === null) return false;
  try {
    return Reflect.get(value, "code") === code;
  } catch {
    return false;
  }
}

function normalizeEventFailure(error: unknown): CourseRuntimeError {
  if (error instanceof CourseRuntimeError) return error;
  return runtimeFailure(
    "RUNTIME_EVENT_FAILED",
    "Agent event persistence failed",
    error,
  );
}

function normalizeManagerBoundaryError(error: unknown): CourseRuntimeError {
  if (error instanceof CourseRuntimeError) return error;
  return runtimeFailure(
    "RUNTIME_INVALID_OPTIONS",
    "Runtime replacement options are invalid",
    error,
  );
}

function disposedFailure(): CourseRuntimeError {
  return runtimeFailure(
    "RUNTIME_DISPOSED",
    "Course runtime is disposing or disposed",
  );
}

function reentrantFailure(operation: string): CourseRuntimeError {
  return runtimeFailure(
    "RUNTIME_REENTRANT_OPERATION",
    `${operation} cannot run from its own serialized callback`,
  );
}

function runtimeFailure(
  code: CourseRuntimeErrorCode,
  message: string,
  cause?: unknown,
): CourseRuntimeError {
  return new CourseRuntimeError(
    code,
    message,
    cause === undefined ? undefined : { cause },
  );
}

async function collectCleanupFailure(
  cleanup: () => unknown | PromiseLike<unknown>,
): Promise<unknown[]> {
  try {
    await adoptAsync(cleanup());
    return [];
  } catch (error) {
    return [error];
  }
}

function frozenAggregate(
  errors: readonly unknown[],
  message: string,
): AggregateError {
  const values = Object.freeze(errors.slice());
  const aggregate = new NativeAggregateError(values, message, {
    cause: values[0],
  });
  Object.freeze(aggregate);
  return aggregate;
}

function adoptAsync<Value>(value: Value | PromiseLike<Value>): Promise<Value> {
  return reflectApply(nativePromiseResolve, NativePromise, [
    value,
  ]) as Promise<Value>;
}

function rejected<Value = never>(error: unknown): Promise<Value> {
  const promise = new NativePromise<Value>((_resolveValue, rejectValue) => {
    rejectValue(error);
  });
  // The caller-facing Promise remains rejectable, while this detached branch
  // ensures a fire-and-forget misuse cannot become an internal rejection.
  void reflectApply(nativePromiseThen, promise, [undefined, () => undefined]);
  return promise;
}
