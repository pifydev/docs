import {
  MAX_AGENT_STEPS,
  MAX_INITIAL_MESSAGES,
  MAX_MODEL_CHUNKS_PER_STEP,
  runAgentLoop,
  type CourseModel,
} from "./agent-loop";
import { EventStream } from "./event-stream";
import {
  assistantMessage,
  toolResultMessage,
  userMessage,
  validateTranscript,
} from "./messages";
import type {
  AgentEvent,
  CourseMessage,
  CourseUserMessage,
  RunResult,
} from "./protocol";
import { ToolRegistry } from "./tool";

const reflectApply = Reflect.apply;
const nativePromiseThen = Promise.prototype.then;
const nativePromiseConstructor = Promise;
const nativePromiseDescriptor = Object.freeze({
  configurable: true,
  enumerable: false,
  value: nativePromiseConstructor,
  writable: true,
});
const queueMicrotaskStable = queueMicrotask;
const abortSignalAbortedGetter = Object.getOwnPropertyDescriptor(
  AbortSignal.prototype,
  "aborted",
)?.get;
const abortSignalReasonGetter = Object.getOwnPropertyDescriptor(
  AbortSignal.prototype,
  "reason",
)?.get;
const snapshotToolRegistry = ToolRegistry.prototype.snapshot;

/** Bound retained work so an idle caller cannot grow the queue indefinitely. */
export const MAX_AGENT_QUEUED_MESSAGES = 256;
/** Agent-owned transcripts remain valid inputs to the low-level loop. */
export const MAX_AGENT_MESSAGES = MAX_INITIAL_MESSAGES;

export type AgentOptions = Readonly<{
  model: CourseModel;
  tools?: ToolRegistry;
  maxSteps?: number;
  messages?: readonly CourseMessage[];
}>;

export type AgentSubscriber = (
  event: AgentEvent,
  signal: AbortSignal,
) => void | Promise<void>;

export type AgentSubscriberError = Readonly<{
  eventType: AgentEvent["type"];
  listenerId: number;
  message: string;
}>;

type PendingMessage = Readonly<{
  order: number;
  kind: "steering" | "followUp";
  message: CourseUserMessage;
}>;

type ActiveRun = {
  token: object;
  controller: AbortController;
  output: EventStream<AgentEvent, RunResult>;
  terminalSelected: boolean;
};

type LogicalRunState = {
  sequence: number;
  turns: number;
};

/** Stable error used when a caller tries to overlap transcript ownership. */
export class AgentBusyError extends Error {
  public readonly code = "AGENT_BUSY" as const;

  public constructor() {
    super("Agent is already running");
    this.name = "AgentBusyError";
    Object.freeze(this);
  }
}

/** Stable capacity error for transcript and retained queue projections. */
export class AgentMessageLimitError extends Error {
  public readonly code = "AGENT_MESSAGE_LIMIT" as const;

  public constructor(message: string) {
    super(message);
    this.name = "AgentMessageLimitError";
    Object.freeze(this);
  }
}

/**
 * Stateful owner around the course's stateless Agent Loop.
 *
 * One low-level invocation represents one Turn. This wrapper therefore gets a
 * deterministic boundary at which it may accept one steering message. It only
 * checks follow-up work after a model response would otherwise end the run.
 */
export class Agent {
  readonly #model: CourseModel;
  readonly #tools: ToolRegistry;
  readonly #maxSteps: number;
  readonly #listeners = new Map<number, AgentSubscriber>();
  readonly #steeringQueue: PendingMessage[] = [];
  readonly #followUpQueue: PendingMessage[] = [];
  readonly #subscriberFailures: AgentSubscriberError[] = [];

  #transcript: readonly CourseMessage[];
  #activeRun: ActiveRun | undefined;
  #nextListenerId = 1;
  #nextMessageNumber = 1;
  #nextQueueOrder = 1;

  public constructor(options: AgentOptions) {
    if (typeof options !== "object" || options === null) {
      throw new TypeError("Agent options must be an object");
    }

    const suppliedModel = options.model;
    const suppliedTools = options.tools;
    const suppliedMaxSteps = options.maxSteps;
    const suppliedMessages = options.messages;

    this.#model = snapshotModel(suppliedModel);
    if (
      suppliedTools !== undefined &&
      !(suppliedTools instanceof ToolRegistry)
    ) {
      throw new TypeError("Agent tools must be a ToolRegistry");
    }
    this.#tools = reflectApply(
      snapshotToolRegistry,
      suppliedTools ?? new ToolRegistry(),
      [],
    );
    this.#maxSteps = suppliedMaxSteps ?? MAX_AGENT_STEPS;
    assertMaxSteps(this.#maxSteps);
    this.#transcript = snapshotTranscript(suppliedMessages ?? []);
    this.#nextMessageNumber = nextGeneratedMessageNumber(this.#transcript);
  }

  /** A fresh frozen top-level copy; every nested message is already frozen. */
  public get messages(): readonly CourseMessage[] {
    return Object.freeze(this.#transcript.slice());
  }

  public get isRunning(): boolean {
    return this.#activeRun !== undefined;
  }

  /**
   * Subscriber failures never affect Agent state or later subscribers. They
   * are reduced to immutable diagnostics instead of being rethrown.
   */
  public get subscriberErrors(): readonly AgentSubscriberError[] {
    return Object.freeze(this.#subscriberFailures.slice());
  }

  public subscribe(listener: AgentSubscriber): () => void {
    if (typeof listener !== "function") {
      throw new TypeError("Agent subscriber must be a function");
    }
    const listenerId = this.#nextListenerId;
    this.#nextListenerId += 1;
    this.#listeners.set(listenerId, listener);
    let subscribed = true;
    return () => {
      if (!subscribed) return;
      subscribed = false;
      this.#listeners.delete(listenerId);
    };
  }

  /** Add a user message and begin one serialized logical run. */
  public prompt(content: string): EventStream<AgentEvent, RunResult> {
    this.#assertIdle();
    this.#assertPromptReservation();
    const hasIdleSteering = this.#steeringQueue.length > 0;
    const message = this.#createUserMessage(content);
    this.#transcript = Object.freeze([...this.#transcript, message]);
    const accepted = [message];
    if (hasIdleSteering) {
      if (!this.#appendNextQueuedMessage(this.#steeringQueue, accepted)) {
        throw new Error("Agent steering queue changed during prompt setup");
      }
    }
    return this.#startRun(accepted);
  }

  /**
   * Continue from owned state. Steering has priority at the initial safe
   * boundary. An assistant tail otherwise requires queued follow-up work.
   */
  public continue(): EventStream<AgentEvent, RunResult> {
    this.#assertIdle();
    const tail = this.#transcript.at(-1);
    if (tail === undefined) {
      throw new Error("Cannot continue without transcript messages");
    }
    this.#assertContinueReservation(tail);

    const accepted: CourseUserMessage[] = [];
    if (this.#appendNextQueuedMessage(this.#steeringQueue, accepted)) {
      // Steering owns the initial safe boundary.
    } else if (tail.role === "assistant") {
      if (!this.#appendNextQueuedMessage(this.#followUpQueue, accepted)) {
        throw new Error(
          "Cannot continue from an assistant message without queued work",
        );
      }
    }

    return this.#startRun(accepted);
  }

  /** Queue one explicit user message for the next completed Turn boundary. */
  public steer(content: string): CourseUserMessage {
    return this.#enqueue("steering", content);
  }

  /** Queue one explicit user message after the loop would otherwise finish. */
  public followUp(content: string): CourseUserMessage {
    return this.#enqueue("followUp", content);
  }

  /** Abort the current run once. A terminal or idle race returns false. */
  public cancel(reason = "Agent run cancelled"): boolean {
    if (typeof reason !== "string" || reason.length === 0) {
      throw new TypeError(
        "Agent cancellation reason must be a non-empty string",
      );
    }
    const active = this.#activeRun;
    if (
      active === undefined ||
      active.terminalSelected ||
      readSignalAborted(active.controller.signal)
    ) {
      return false;
    }
    active.controller.abort(reason);
    return true;
  }

  #assertIdle(): void {
    if (this.#activeRun !== undefined) throw new AgentBusyError();
  }

  #assertTranscriptCapacity(additional: number): void {
    if (this.#transcript.length + additional <= MAX_AGENT_MESSAGES) return;
    throw new AgentMessageLimitError(
      `Agent transcript must not exceed ${MAX_AGENT_MESSAGES} messages`,
    );
  }

  #assertProjectedCapacity(projected: number): void {
    if (projected <= MAX_AGENT_MESSAGES) return;
    throw new AgentMessageLimitError(
      `Agent transcript and queued work must not exceed ${MAX_AGENT_MESSAGES} messages`,
    );
  }

  #assertPromptReservation(): void {
    const steering = this.#steeringQueue.length;
    const followUp = this.#followUpQueue.length;
    const queued = steering + followUp;
    // One idle steering item shares the prompted model Turn. With no steering,
    // the prompt itself owns an additional assistant terminal.
    const projected =
      this.#transcript.length + 1 + 2 * queued + (steering === 0 ? 1 : 0);
    this.#assertProjectedCapacity(projected);
  }

  #assertContinueReservation(tail: CourseMessage): void {
    const steering = this.#steeringQueue.length;
    const followUp = this.#followUpQueue.length;
    const queued = steering + followUp;
    let projected = this.#transcript.length + 2 * queued;
    if (tail.role !== "assistant" && steering === 0) projected += 1;
    this.#assertProjectedCapacity(projected);
  }

  #createUserMessage(content: string): CourseUserMessage {
    if (typeof content !== "string") {
      throw new TypeError("Agent user content must be a string");
    }
    const id = `agent-user-${String(this.#nextMessageNumber).padStart(6, "0")}`;
    this.#nextMessageNumber += 1;
    return userMessage({ id, content });
  }

  #enqueue(kind: PendingMessage["kind"], content: string): CourseUserMessage {
    const pendingCount =
      this.#steeringQueue.length + this.#followUpQueue.length;
    if (pendingCount >= MAX_AGENT_QUEUED_MESSAGES) {
      throw new AgentMessageLimitError(
        `Agent queue must not exceed ${MAX_AGENT_QUEUED_MESSAGES} messages`,
      );
    }
    this.#assertEnqueueReservation(kind);
    const message = this.#createUserMessage(content);
    const pending = Object.freeze({
      order: this.#nextQueueOrder,
      kind,
      message,
    });
    this.#nextQueueOrder += 1;
    if (kind === "steering") this.#steeringQueue.push(pending);
    else this.#followUpQueue.push(pending);
    return message;
  }

  #assertEnqueueReservation(kind: PendingMessage["kind"]): void {
    const steering = this.#steeringQueue.length + (kind === "steering" ? 1 : 0);
    const followUp = this.#followUpQueue.length + (kind === "followUp" ? 1 : 0);
    const queued = steering + followUp;
    const active =
      this.#activeRun !== undefined && !this.#activeRun.terminalSelected;
    if (active) {
      // The active low-level Turn has not been adopted into #transcript yet.
      // Every accepted model chunk could be a Tool call, yielding one
      // assistant message plus one Tool-result message per chunk. Reserve that
      // full unknown output and each explicit queued user message.
      this.#assertProjectedCapacity(
        this.#transcript.length + 1 + MAX_MODEL_CHUNKS_PER_STEP + queued,
      );
      return;
    }

    let projected = this.#transcript.length + 2 * queued;
    const tail = this.#transcript.at(-1);
    if (tail === undefined) projected += steering === 0 ? 2 : 1;
    else if (tail.role !== "assistant" && steering === 0) projected += 1;
    this.#assertProjectedCapacity(projected);
  }

  #appendNextQueuedMessage(
    queue: PendingMessage[],
    accepted: CourseUserMessage[],
  ): boolean {
    const pending = queue[0];
    if (pending === undefined) return false;
    this.#assertTranscriptCapacity(1);
    this.#transcript = Object.freeze([...this.#transcript, pending.message]);
    accepted.push(pending.message);
    queue.shift();
    return true;
  }

  #startRun(
    initiallyAccepted: readonly CourseUserMessage[],
  ): EventStream<AgentEvent, RunResult> {
    this.#assertIdle();
    const output = new EventStream<AgentEvent, RunResult>();
    const active: ActiveRun = {
      token: Object.freeze({}),
      controller: new AbortController(),
      output,
      terminalSelected: false,
    };
    this.#activeRun = active;

    const owner = this.#runOwned(active, initiallyAccepted);
    void owner.catch((error: unknown) => {
      // #runOwned converts ordinary failures into RunResult data. This final
      // observer prevents a bookkeeping bug from becoming unhandled.
      try {
        output.fail(error);
      } catch {
        // The stream may already have selected its single terminal outcome.
      }
    });
    return output;
  }

  async #runOwned(
    active: ActiveRun,
    initiallyAccepted: readonly CourseUserMessage[],
  ): Promise<void> {
    const state: LogicalRunState = { sequence: 0, turns: 0 };
    let terminal: RunResult;
    try {
      terminal = await this.#produceLogicalRun(
        active,
        initiallyAccepted,
        state,
      );
    } catch (error) {
      terminal =
        error instanceof AgentMessageLimitError
          ? failedResult(this.#transcript, "AGENT_MESSAGE_LIMIT", error.message)
          : failedResult(
              this.#transcript,
              "AGENT_STATE_FAILED",
              errorMessage(error, "Stateful Agent lifecycle failed"),
            );
      terminal = this.#normalizeCancellation(active, terminal);
      this.#emitTerminal(active, state, terminal);
    } finally {
      if (this.#activeRun?.token === active.token) {
        this.#activeRun = undefined;
      }
    }
    active.output.finish(terminal);
  }

  async #produceLogicalRun(
    active: ActiveRun,
    initiallyAccepted: readonly CourseUserMessage[],
    state: LogicalRunState,
  ): Promise<RunResult> {
    for (let index = 0; index < initiallyAccepted.length; index += 1) {
      this.#emitAccepted(active, state, initiallyAccepted[index]);
    }

    while (true) {
      if (this.#transcript.length > MAX_AGENT_MESSAGES) {
        return this.#finishWith(
          active,
          state,
          failedResult(
            this.#transcript,
            "AGENT_MESSAGE_LIMIT",
            `Agent transcript exceeded ${MAX_AGENT_MESSAGES} messages`,
          ),
        );
      }

      const inner = runAgentLoop({
        messages: this.#transcript,
        model: this.#model,
        tools: this.#tools,
        maxSteps: 1,
        signal: active.controller.signal,
        requestSequenceStart: state.turns,
      });

      for await (const event of inner) {
        if (
          event.type === "message.accepted" ||
          event.type === "run.finished"
        ) {
          continue;
        }
        this.#emitForwarded(active, state, event);
      }

      const result = await inner.result;
      if (readSignalAborted(active.controller.signal)) {
        return this.#finishWith(
          active,
          state,
          cancelledResult(
            this.#transcript,
            readCancellationReason(active.controller.signal),
          ),
        );
      }
      state.turns += 1;
      if (result.messages.length > MAX_AGENT_MESSAGES) {
        return this.#finishWith(
          active,
          state,
          failedResult(
            this.#transcript,
            "AGENT_MESSAGE_LIMIT",
            `Agent transcript exceeded ${MAX_AGENT_MESSAGES} messages`,
          ),
        );
      }
      this.#transcript = snapshotTranscript(result.messages);

      if (result.status === "cancelled" || result.status === "failed") {
        return this.#finishWith(active, state, result);
      }

      if (result.status === "maxSteps") {
        if (state.turns >= this.#maxSteps) {
          return this.#finishWith(
            active,
            state,
            maxStepsResult(this.#transcript, this.#maxSteps),
          );
        }
        this.#acceptNextSteering(active, state);
        continue;
      }

      if (this.#steeringQueue.length > 0 && state.turns >= this.#maxSteps) {
        return this.#finishWith(
          active,
          state,
          maxStepsResult(this.#transcript, this.#maxSteps),
        );
      }
      const steeringAccepted = this.#acceptNextSteering(active, state);
      if (steeringAccepted) {
        continue;
      }

      if (this.#followUpQueue.length > 0 && state.turns >= this.#maxSteps) {
        return this.#finishWith(
          active,
          state,
          maxStepsResult(this.#transcript, this.#maxSteps),
        );
      }
      const accepted: CourseUserMessage[] = [];
      if (this.#appendNextQueuedMessage(this.#followUpQueue, accepted)) {
        this.#emitAccepted(active, state, accepted[0]);
        continue;
      }

      return this.#finishWith(active, state, result);
    }
  }

  #acceptNextSteering(active: ActiveRun, state: LogicalRunState): boolean {
    const accepted: CourseUserMessage[] = [];
    if (!this.#appendNextQueuedMessage(this.#steeringQueue, accepted)) {
      return false;
    }
    this.#emitAccepted(active, state, accepted[0]);
    return true;
  }

  #finishWith(
    active: ActiveRun,
    state: LogicalRunState,
    result: RunResult,
  ): RunResult {
    const ownedResult = this.#normalizeCancellation(
      active,
      snapshotRunResult(result),
    );
    this.#transcript = ownedResult.messages;
    this.#emitTerminal(active, state, ownedResult);
    return ownedResult;
  }

  #normalizeCancellation(active: ActiveRun, result: RunResult): RunResult {
    if (
      result.status === "cancelled" ||
      active.terminalSelected ||
      !readSignalAborted(active.controller.signal)
    ) {
      return result;
    }
    return cancelledResult(
      this.#transcript,
      readCancellationReason(active.controller.signal),
    );
  }

  #emitAccepted(
    active: ActiveRun,
    state: LogicalRunState,
    message: CourseUserMessage,
  ): void {
    const event: AgentEvent = Object.freeze({
      type: "message.accepted",
      sequence: state.sequence,
      payload: Object.freeze({ message }),
    });
    state.sequence += 1;
    this.#publish(active, event);
  }

  #emitForwarded(
    active: ActiveRun,
    state: LogicalRunState,
    source: Exclude<
      AgentEvent,
      Readonly<{ type: "message.accepted" | "run.finished" }>
    >,
  ): void {
    const event = Object.freeze({
      ...source,
      sequence: state.sequence,
    }) as AgentEvent;
    state.sequence += 1;
    this.#publish(active, event);
  }

  #emitTerminal(
    active: ActiveRun,
    state: LogicalRunState,
    result: RunResult,
  ): void {
    const terminalResult = this.#normalizeCancellation(active, result);
    active.terminalSelected = true;
    const event: AgentEvent = Object.freeze({
      type: "run.finished",
      sequence: state.sequence,
      payload: Object.freeze({ result: terminalResult }),
    });
    state.sequence += 1;
    this.#publish(active, event);
  }

  #publish(active: ActiveRun, event: AgentEvent): void {
    active.output.push(event);
    const subscribers = Array.from(this.#listeners.entries());
    for (let index = 0; index < subscribers.length; index += 1) {
      const [listenerId, subscriber] = subscribers[index];
      let returned: unknown;
      try {
        returned = subscriber(event, active.controller.signal);
      } catch (error) {
        this.#recordSubscriberFailure(event.type, listenerId, error);
        continue;
      }
      observeSubscriberSettlement(returned, (error) => {
        this.#recordSubscriberFailure(event.type, listenerId, error);
      });
    }
  }

  #recordSubscriberFailure(
    eventType: AgentEvent["type"],
    listenerId: number,
    error: unknown,
  ): void {
    this.#subscriberFailures.push(
      Object.freeze({
        eventType,
        listenerId,
        message: errorMessage(error, "Agent subscriber failed"),
      }),
    );
  }
}

function snapshotModel(value: CourseModel): CourseModel {
  if (
    (typeof value !== "object" && typeof value !== "function") ||
    value === null
  ) {
    throw new TypeError("Agent model must implement CourseModel");
  }
  const stream = value.stream;
  if (typeof stream !== "function") {
    throw new TypeError("Agent model.stream must be a function");
  }
  return Object.freeze({
    stream: (request, signal) =>
      Reflect.apply(stream, value, [request, signal]),
  });
}

function assertMaxSteps(value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError("Agent maxSteps must be a positive safe integer");
  }
  if (value > MAX_AGENT_STEPS) {
    throw new TypeError(`Agent maxSteps must not exceed ${MAX_AGENT_STEPS}`);
  }
}

function snapshotTranscript(
  value: readonly CourseMessage[],
): readonly CourseMessage[] {
  if (!Array.isArray(value)) {
    throw new TypeError("Agent messages must be an array");
  }
  if (value.length > MAX_AGENT_MESSAGES) {
    throw new AgentMessageLimitError(
      `Agent transcript must not exceed ${MAX_AGENT_MESSAGES} messages`,
    );
  }
  const snapshots: CourseMessage[] = [];
  const length = value.length;
  for (let index = 0; index < length; index += 1) {
    if (!Object.hasOwn(value, index)) {
      throw new TypeError(`Agent messages[${index}] must not be sparse`);
    }
    snapshots.push(snapshotMessage(value[index], index));
  }
  const errors = validateTranscript(snapshots);
  if (errors.length > 0) {
    throw new TypeError(`Agent transcript is invalid: ${errors[0].message}`);
  }
  return Object.freeze(snapshots);
}

function snapshotMessage(value: CourseMessage, index: number): CourseMessage {
  const role = value.role;
  if (role === "user") {
    const id = value.id;
    const content = value.content;
    return userMessage({ id, content });
  }
  if (role === "assistant") {
    const id = value.id;
    const content = value.content;
    return assistantMessage({ id, content });
  }
  if (role === "toolResult") {
    const id = value.id;
    const toolCallId = value.toolCallId;
    const toolName = value.toolName;
    const content = value.content;
    const isError = value.isError;
    return toolResultMessage({ id, toolCallId, toolName, content, isError });
  }
  throw new TypeError(`Agent messages[${index}] has an unsupported role`);
}

function nextGeneratedMessageNumber(
  messages: readonly CourseMessage[],
): number {
  let next = 1;
  for (let index = 0; index < messages.length; index += 1) {
    const match = messages[index].id.match(/^agent-user-(\d{6})$/u);
    if (match === null) continue;
    const candidate = Number(match[1]) + 1;
    if (candidate > next) next = candidate;
  }
  return next;
}

function snapshotRunResult(result: RunResult): RunResult {
  const messages = snapshotTranscript(result.messages);
  if (result.status === "completed") {
    return Object.freeze({
      status: "completed",
      messages,
      finalText: result.finalText,
    });
  }
  if (result.status === "cancelled") {
    return Object.freeze({
      status: "cancelled",
      messages,
      reason: result.reason,
    });
  }
  if (result.status === "maxSteps") {
    return Object.freeze({
      status: "maxSteps",
      messages,
      maxSteps: result.maxSteps,
    });
  }
  return Object.freeze({
    status: "failed",
    messages,
    error: Object.freeze({
      code: result.error.code,
      message: result.error.message,
    }),
  });
}

function maxStepsResult(
  messages: readonly CourseMessage[],
  maxSteps: number,
): RunResult {
  return Object.freeze({
    status: "maxSteps",
    messages: Object.freeze(messages.slice()),
    maxSteps,
  });
}

function cancelledResult(
  messages: readonly CourseMessage[],
  reason: string,
): RunResult {
  return Object.freeze({
    status: "cancelled",
    messages: Object.freeze(messages.slice()),
    reason,
  });
}

function failedResult(
  messages: readonly CourseMessage[],
  code: string,
  message: string,
): RunResult {
  return Object.freeze({
    status: "failed",
    messages: Object.freeze(messages.slice()),
    error: Object.freeze({ code, message }),
  });
}

function errorMessage(error: unknown, fallback: string): string {
  if (typeof error === "string" && error.length > 0) return error;
  if (typeof error !== "object" || error === null) return fallback;
  try {
    const message = Reflect.get(error, "message");
    return typeof message === "string" && message.length > 0
      ? message
      : fallback;
  } catch {
    return fallback;
  }
}

function readSignalAborted(signal: AbortSignal): boolean {
  if (abortSignalAbortedGetter === undefined) {
    throw new Error("AbortSignal.aborted is unavailable");
  }
  return reflectApply(abortSignalAbortedGetter, signal, []) as boolean;
}

function readCancellationReason(signal: AbortSignal): string {
  if (abortSignalReasonGetter === undefined) return "Agent run cancelled";
  const reason = reflectApply(abortSignalReasonGetter, signal, []);
  return errorMessage(reason, "Agent run cancelled");
}

function observeSubscriberSettlement(
  value: unknown,
  onRejected: (reason: unknown) => void,
): void {
  if (!isObjectLike(value)) return;
  if (attachNativePromise(value, onRejected)) return;

  let then: unknown;
  try {
    then = Reflect.get(value, "then");
  } catch (error) {
    deferSubscriberFailure(onRejected, error);
    return;
  }
  if (typeof then !== "function") return;

  let settled = false;
  const fulfill = () => {
    if (settled) return;
    settled = true;
  };
  const reject = (reason: unknown) => {
    if (settled) return;
    settled = true;
    deferSubscriberFailure(onRejected, reason);
  };
  try {
    reflectApply(then, value, [fulfill, reject]);
  } catch (error) {
    reject(error);
  }
}

function attachNativePromise(
  value: object,
  onRejected: (reason: unknown) => void,
): boolean {
  let continuation: unknown;
  try {
    continuation = reflectApply(nativePromiseThen, value, [
      undefined,
      onRejected,
    ]);
  } catch {
    continuation = attachNativePromiseWithStableSpecies(value, onRejected);
    if (continuation === undefined) return false;
  }
  observePromiseContinuation(continuation);
  return true;
}

function attachNativePromiseWithStableSpecies(
  value: object,
  onRejected: (reason: unknown) => void,
): unknown | undefined {
  try {
    const prior = Object.getOwnPropertyDescriptor(value, "constructor");
    if (prior !== undefined && !prior.configurable) return undefined;
    Object.defineProperty(value, "constructor", nativePromiseDescriptor);
    try {
      return reflectApply(nativePromiseThen, value, [undefined, onRejected]);
    } finally {
      if (prior === undefined) Reflect.deleteProperty(value, "constructor");
      else Object.defineProperty(value, "constructor", prior);
    }
  } catch {
    return undefined;
  }
}

function observePromiseContinuation(value: unknown): void {
  if (!isObjectLike(value)) return;
  try {
    reflectApply(nativePromiseThen, value, [
      ignoreSettlement,
      ignoreSettlement,
    ]);
  } catch {
    // The source already owns both reactions; continuation metadata is hostile.
  }
}

function deferSubscriberFailure(
  onRejected: (reason: unknown) => void,
  reason: unknown,
): void {
  reflectApply(queueMicrotaskStable, undefined, [() => onRejected(reason)]);
}

function ignoreSettlement(): void {
  // Intentionally observe a continuation without joining Agent lifecycle.
}

function isObjectLike(value: unknown): value is object {
  return (
    (typeof value === "object" && value !== null) || typeof value === "function"
  );
}
