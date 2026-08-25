import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { types as nodeUtilTypes } from "node:util";

const NativeAggregateError = AggregateError;
const NativePromise = Promise;
const nativePromiseResolve = Promise.resolve;
const nativePromiseThen = Promise.prototype.then;
const reflectApply = Reflect.apply;
const nodeIsProxy = nodeUtilTypes.isProxy;
const objectHasOwn = Object.prototype.hasOwnProperty;
const eventTargetAddEventListener = EventTarget.prototype.addEventListener;
const eventTargetRemoveEventListener =
  EventTarget.prototype.removeEventListener;
const abortSignalAbortedGetter = Object.getOwnPropertyDescriptor(
  AbortSignal.prototype,
  "aborted",
)?.get;

const MAX_TASKS = 256;
const MAX_REPETITIONS = 64;
const MAX_CONCURRENCY = 8;
/** Hard ceiling across tasks multiplied by repetitions. */
export const MAX_EVALUATION_RUNS = 4_096;
/** Per-side evidence-item cap for fixtures, runtimes, and judges. */
export const MAX_EVIDENCE_ITEMS = 32;
/** Runtime and judge metrics each receive this independent allowance. */
export const MAX_SOURCE_METRICS = 64;
/** Merged per-run report metrics may contain both source allowances. */
export const MAX_REPORT_METRICS = 128;
export const MAX_EVIDENCE_ITEM_CODE_POINTS = 4_096;
export const MAX_TASK_EVIDENCE_CODE_POINTS = 65_536;
const MAX_PROMPT_CODE_UNITS = 100_000;
const ID_PATTERN = /^[a-z0-9](?:[a-z0-9._-]{0,63})$/u;
const ERROR_CODE_PATTERN = /^[A-Z][A-Z0-9_:-]{0,63}$/u;
const METRIC_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/u;

export type EvaluationVerdict = "pass" | "fail" | "error";

export type EvaluationTask = Readonly<{
  id: string;
  split: "held-out";
  prompt: string;
  expectedPublicEvidence: Readonly<{ includes: readonly string[] }>;
  /** Fixture-only candidate output. It is never supplied to a candidate. */
  candidatePublicEvidence: readonly string[];
  /** Fixture oracle for workshop tests. It is never used to select a verdict. */
  expectedVerdict: "pass" | "fail";
}>;

export type EvaluationRuntimeInput = Readonly<{
  prompt: string;
  signal: AbortSignal;
}>;

export type EvaluationCompletedOutput = Readonly<{
  status: "completed";
  publicEvidence: readonly string[];
  publicMetrics?: Readonly<Record<string, number>>;
}>;

export type EvaluationFailedOutput = Readonly<{
  status: "failed";
  errorCode: string;
  publicMetrics?: Readonly<Record<string, number>>;
}>;

export type EvaluationRuntimeOutput =
  EvaluationCompletedOutput | EvaluationFailedOutput;

export type EvaluationRuntime = Readonly<{
  run: (
    input: EvaluationRuntimeInput,
  ) => EvaluationRuntimeOutput | PromiseLike<EvaluationRuntimeOutput>;
  dispose: () => unknown | PromiseLike<unknown>;
}>;

export type EvaluationRuntimeFactoryInput = Readonly<{
  candidateId: string;
  taskId: string;
  runId: string;
  repetition: number;
  workspacePath: string;
  signal: AbortSignal;
}>;

export type EvaluationCandidate = Readonly<{
  id: string;
  createRuntime: (
    input: EvaluationRuntimeFactoryInput,
  ) => EvaluationRuntime | PromiseLike<EvaluationRuntime>;
}>;

export type EvaluationJudgeInput = Readonly<{
  taskId: string;
  runId: string;
  prompt: string;
  expectedPublicEvidence: Readonly<{ includes: readonly string[] }>;
  candidatePublicEvidence: readonly string[];
  signal: AbortSignal;
}>;

export type EvaluationJudgeResult = Readonly<{
  verdict: "pass" | "fail";
  publicMetrics?: Readonly<Record<string, number>>;
}>;

export type EvaluationJudge = Readonly<{
  judge: (
    input: EvaluationJudgeInput,
  ) => EvaluationJudgeResult | PromiseLike<EvaluationJudgeResult>;
}>;

export type EvaluationWorkspace = Readonly<{
  path: string;
  cleanup: () => unknown | PromiseLike<unknown>;
}>;

export type EvaluationWorkspaceFactoryInput = Readonly<{
  candidateId: string;
  taskId: string;
  runId: string;
  repetition: number;
  signal: AbortSignal;
}>;

export type EvaluationWorkspaceFactory = (
  input: EvaluationWorkspaceFactoryInput,
) => EvaluationWorkspace | PromiseLike<EvaluationWorkspace>;

export type EvaluationClock = Readonly<{ now: () => number }>;

export type EvaluationRunReport = Readonly<{
  taskId: string;
  runId: string;
  candidateId: string;
  verdict: EvaluationVerdict;
  publicMetrics: Readonly<Record<string, number>>;
  durationMs: number;
  errorCode: string | null;
}>;

export type EvaluationAggregateMetrics = Readonly<{
  totalRuns: number;
  passedRuns: number;
  failedRuns: number;
  errorRuns: number;
  passRate: number;
  failRate: number;
  errorRate: number;
}>;

export type EvaluationReport = Readonly<{
  candidateId: string;
  runs: readonly EvaluationRunReport[];
  publicMetrics: EvaluationAggregateMetrics;
}>;

export type EvaluationComparisonRun = Readonly<{
  taskId: string;
  runId: string;
  baselineVerdict: EvaluationVerdict;
  candidateVerdict: EvaluationVerdict;
  outcome: "improved" | "regressed" | "unchanged";
}>;

export type EvaluationComparison = Readonly<{
  baselineCandidateId: string;
  candidateCandidateId: string;
  runs: readonly EvaluationComparisonRun[];
  publicMetrics: Readonly<{
    passRateDelta: number;
    failRateDelta: number;
    errorRateDelta: number;
    improvedRuns: number;
    regressedRuns: number;
    unchangedRuns: number;
  }>;
}>;

export type RunEvaluationOptions = Readonly<{
  candidate: EvaluationCandidate;
  tasks: unknown;
  repetitions?: number;
  judge?: EvaluationJudge;
  signal?: AbortSignal;
  concurrency?: number;
  clock?: EvaluationClock;
  workspaceFactory?: EvaluationWorkspaceFactory;
}>;

export type EvaluationInfrastructureErrorCode =
  | "EVALUATION_INVALID_OPTIONS"
  | "EVALUATION_CANCELLED"
  | "EVALUATION_WORKSPACE_FAILED"
  | "EVALUATION_RUNTIME_FACTORY_FAILED"
  | "EVALUATION_RUNTIME_FAILED"
  | "EVALUATION_JUDGE_FAILED"
  | "EVALUATION_CLOCK_FAILED"
  | "EVALUATION_CLEANUP_FAILED"
  | "EVALUATION_INVALID_REPORT";

export class EvaluationInfrastructureError extends Error {
  public readonly code: EvaluationInfrastructureErrorCode;

  public constructor(
    code: EvaluationInfrastructureErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "EvaluationInfrastructureError";
    this.code = code;
    Object.freeze(this);
  }
}

type CapturedRuntime = Readonly<{
  run: EvaluationRuntime["run"];
}>;

type OwnedCleanup = () => unknown | PromiseLike<unknown>;

type WorkItem = Readonly<{
  task: EvaluationTask;
  repetition: number;
  runId: string;
  index: number;
}>;

type CapturedOptions = Readonly<{
  candidateId: string;
  createRuntime: EvaluationCandidate["createRuntime"];
  tasks: readonly EvaluationTask[];
  repetitions: number;
  judge: EvaluationJudge["judge"];
  signal: AbortSignal;
  concurrency: number;
  now: () => number;
  createWorkspace: EvaluationWorkspaceFactory;
}>;

type CapturedCompletedOutput = Readonly<{
  status: "completed";
  publicEvidence: readonly string[];
  publicMetrics: Readonly<Record<string, number>>;
}>;

type CapturedFailedOutput = Readonly<{
  status: "failed";
  errorCode: string;
  publicMetrics: Readonly<Record<string, number>>;
}>;

type CapturedRuntimeOutput = CapturedCompletedOutput | CapturedFailedOutput;

type FailureRecord = Readonly<{
  index: number;
  error: EvaluationInfrastructureError;
}>;

type SharedCancellation = Readonly<{
  signal: AbortSignal;
  abort: () => void;
  unlink: () => void;
}>;

type UnknownFunction = (...arguments_: never[]) => unknown;

const defaultClock: EvaluationClock = Object.freeze({ now: () => 0 });

const defaultWorkspaceFactory: EvaluationWorkspaceFactory = async () => {
  const path = await mkdtemp(join(tmpdir(), "pify-agent-eval-"));
  let cleaned = false;
  return Object.freeze({
    path,
    cleanup: async () => {
      if (cleaned) return;
      cleaned = true;
      await rm(path, { force: true, recursive: true });
    },
  });
};

export const deterministicEvaluationJudge: EvaluationJudge = Object.freeze({
  judge(input: EvaluationJudgeInput): EvaluationJudgeResult {
    const required = input.expectedPublicEvidence.includes;
    const candidate = input.candidatePublicEvidence;
    const candidateSet = new Set<string>();
    for (let index = 0; index < candidate.length; index += 1) {
      throwIfCancelled(input.signal);
      candidateSet.add(candidate[index]);
    }
    let matched = 0;
    for (let index = 0; index < required.length; index += 1) {
      throwIfCancelled(input.signal);
      if (candidateSet.has(required[index])) matched += 1;
    }
    return Object.freeze({
      verdict: matched === required.length ? "pass" : "fail",
      publicMetrics: frozenMetrics({
        requiredEvidence: required.length,
        matchedEvidence: matched,
      }),
    });
  },
});

/** Validate, snapshot, and freeze the JSON fixture before any evaluation starts. */
export function loadEvaluationTasks(
  source: unknown,
): readonly EvaluationTask[] {
  const fixture = requireRecord(source, "Evaluation fixture");
  const schemaVersion = readProperty(
    fixture,
    "schemaVersion",
    "Evaluation fixture",
  );
  const tasksValue = readProperty(fixture, "tasks", "Evaluation fixture");
  if (schemaVersion !== 1) {
    throw new TypeError("Evaluation fixture schemaVersion must be 1");
  }
  const rawTasks = requireDenseArray(tasksValue, "Evaluation fixture tasks");
  if (rawTasks.length === 0 || rawTasks.length > MAX_TASKS) {
    throw new TypeError(
      `Evaluation fixture tasks must contain 1-${MAX_TASKS} held-out tasks`,
    );
  }

  const tasks: EvaluationTask[] = [];
  const ids = new Set<string>();
  for (let index = 0; index < rawTasks.length; index += 1) {
    const raw = requireRecord(rawTasks[index], `Evaluation task ${index}`);
    const id = requireId(
      readProperty(raw, "id", `Evaluation task ${index}`),
      `Evaluation task ${index} id`,
    );
    const split = readProperty(raw, "split", `Evaluation task ${index}`);
    const prompt = requireBoundedString(
      readProperty(raw, "prompt", `Evaluation task ${index}`),
      `Evaluation task ${index} prompt`,
      false,
    );
    const expectedValue = requireRecord(
      readProperty(raw, "expectedPublicEvidence", `Evaluation task ${index}`),
      `Evaluation task ${index} expectedPublicEvidence`,
    );
    const includes = snapshotEvidence(
      readProperty(
        expectedValue,
        "includes",
        `Evaluation task ${index} expectedPublicEvidence`,
      ),
      `Evaluation task ${index} expectedPublicEvidence.includes`,
      false,
    );
    const candidatePublicEvidence = snapshotEvidence(
      readProperty(raw, "candidatePublicEvidence", `Evaluation task ${index}`),
      `Evaluation task ${index} candidatePublicEvidence`,
      true,
    );
    assertUniqueRequiredEvidence(includes, `Evaluation task ${index}`);
    assertTaskEvidenceBudget(
      includes,
      candidatePublicEvidence,
      `Evaluation task ${index}`,
    );
    const expectedVerdict = readProperty(
      raw,
      "expectedVerdict",
      `Evaluation task ${index}`,
    );

    if (split !== "held-out") {
      throw new TypeError(
        `Evaluation task ${index} must use the held-out split`,
      );
    }
    if (expectedVerdict !== "pass" && expectedVerdict !== "fail") {
      throw new TypeError(
        `Evaluation task ${index} expectedVerdict must be pass or fail`,
      );
    }
    if (ids.has(id)) throw new TypeError(`Duplicate evaluation task id: ${id}`);
    ids.add(id);

    tasks.push(
      Object.freeze({
        id,
        split,
        prompt,
        expectedPublicEvidence: Object.freeze({ includes }),
        candidatePublicEvidence,
        expectedVerdict,
      }),
    );
  }
  return Object.freeze(tasks);
}

export async function runEvaluation(
  options: RunEvaluationOptions,
): Promise<EvaluationReport> {
  let captured: CapturedOptions;
  try {
    captured = captureOptions(options);
  } catch (error) {
    if (error instanceof EvaluationInfrastructureError) throw error;
    throw infrastructureFailure(
      "EVALUATION_INVALID_OPTIONS",
      "Evaluation options or fixtures are invalid",
      error,
    );
  }
  throwIfCancelled(captured.signal);

  const shared = createSharedCancellation(captured.signal);
  const activeOptions = Object.freeze({ ...captured, signal: shared.signal });
  try {
    return await executeEvaluation(activeOptions, shared);
  } finally {
    shared.unlink();
  }
}

async function executeEvaluation(
  captured: CapturedOptions,
  shared: SharedCancellation,
): Promise<EvaluationReport> {
  const work = createWorkItems(captured.tasks, captured.repetitions);
  const results = new Array<EvaluationRunReport | undefined>(work.length);
  const failures: FailureRecord[] = [];
  let initiatingFailure: EvaluationInfrastructureError | undefined;
  let nextIndex = 0;
  let stopping = false;

  const selectFailure = (failure: EvaluationInfrastructureError) => {
    if (initiatingFailure === undefined) initiatingFailure = failure;
    shared.abort();
  };

  const worker = async () => {
    while (!stopping) {
      const index = nextIndex;
      if (index >= work.length) return;
      nextIndex += 1;
      try {
        throwIfCancelled(captured.signal);
        results[index] = await runOne(captured, work[index], selectFailure);
      } catch (error) {
        const failure = normalizeInfrastructureError(error);
        selectFailure(failure);
        const firstFailure = !stopping;
        stopping = true;
        failures.push(
          Object.freeze({
            index,
            error: failure,
          }),
        );
        if (firstFailure) shared.abort();
      }
    }
  };

  const workers: Promise<void>[] = [];
  const workerCount = Math.min(captured.concurrency, work.length);
  for (let index = 0; index < workerCount; index += 1) workers.push(worker());
  await NativePromise.allSettled(workers);

  if (failures.length > 0) {
    const primary = initiatingFailure ?? failures[0].error;
    const cleanupFailures: EvaluationInfrastructureError[] = [];
    for (let index = 0; index < failures.length; index += 1) {
      const failure = failures[index].error;
      if (failure.code === "EVALUATION_CLEANUP_FAILED" && failure !== primary) {
        cleanupFailures.push(failure);
      }
    }
    if (cleanupFailures.length > 0) {
      throw infrastructureFailure(
        "EVALUATION_CLEANUP_FAILED",
        "Evaluation failed and peer cleanup also failed",
        new NativeAggregateError(
          [primary, ...cleanupFailures],
          "Evaluation failure and peer cleanup failures",
        ),
      );
    }
    throw primary;
  }
  throwIfCancelled(captured.signal);

  const completed: EvaluationRunReport[] = [];
  for (let index = 0; index < results.length; index += 1) {
    const result = results[index];
    if (result === undefined) {
      throw infrastructureFailure(
        "EVALUATION_RUNTIME_FAILED",
        "Evaluation did not produce every scheduled result",
      );
    }
    completed.push(result);
  }
  const frozenRuns = Object.freeze(completed);
  return Object.freeze({
    candidateId: captured.candidateId,
    runs: frozenRuns,
    publicMetrics: aggregateMetrics(frozenRuns),
  });
}

export function compareEvaluations(
  baselineInput: EvaluationReport,
  candidateInput: EvaluationReport,
): EvaluationComparison {
  const baseline = captureReport(baselineInput, "Baseline evaluation");
  const candidate = captureReport(candidateInput, "Candidate evaluation");
  if (baseline.runs.length !== candidate.runs.length) {
    throw invalidReport("Evaluation reports must contain the same run count");
  }

  const candidateRuns = new Map<string, EvaluationRunReport>();
  for (let index = 0; index < candidate.runs.length; index += 1) {
    const run = candidate.runs[index];
    candidateRuns.set(reportIdentity(run), run);
  }

  const runs: EvaluationComparisonRun[] = [];
  let improvedRuns = 0;
  let regressedRuns = 0;
  let unchangedRuns = 0;
  for (let index = 0; index < baseline.runs.length; index += 1) {
    const baselineRun = baseline.runs[index];
    const candidateRun = candidateRuns.get(reportIdentity(baselineRun));
    if (candidateRun === undefined) {
      throw invalidReport(
        "Evaluation reports do not contain identical run sets",
      );
    }
    const baselineRank = verdictRank(baselineRun.verdict);
    const candidateRank = verdictRank(candidateRun.verdict);
    const outcome =
      candidateRank > baselineRank
        ? "improved"
        : candidateRank < baselineRank
          ? "regressed"
          : "unchanged";
    if (outcome === "improved") improvedRuns += 1;
    else if (outcome === "regressed") regressedRuns += 1;
    else unchangedRuns += 1;
    runs.push(
      Object.freeze({
        taskId: baselineRun.taskId,
        runId: baselineRun.runId,
        baselineVerdict: baselineRun.verdict,
        candidateVerdict: candidateRun.verdict,
        outcome,
      }),
    );
  }

  return Object.freeze({
    baselineCandidateId: baseline.candidateId,
    candidateCandidateId: candidate.candidateId,
    runs: Object.freeze(runs),
    publicMetrics: Object.freeze({
      passRateDelta:
        candidate.publicMetrics.passRate - baseline.publicMetrics.passRate,
      failRateDelta:
        candidate.publicMetrics.failRate - baseline.publicMetrics.failRate,
      errorRateDelta:
        candidate.publicMetrics.errorRate - baseline.publicMetrics.errorRate,
      improvedRuns,
      regressedRuns,
      unchangedRuns,
    }),
  });
}

/** Serialize only the public report projection in a stable property order. */
export function serializeEvaluationReport(input: EvaluationReport): string {
  const report = captureReport(input, "Evaluation report");
  let runs = "[";
  for (let index = 0; index < report.runs.length; index += 1) {
    const run = report.runs[index];
    if (index > 0) runs += ",";
    runs +=
      `{"taskId":${encodeJsonString(run.taskId)}` +
      `,"runId":${encodeJsonString(run.runId)}` +
      `,"candidateId":${encodeJsonString(run.candidateId)}` +
      `,"verdict":${encodeJsonString(run.verdict)}` +
      `,"publicMetrics":${encodeMetrics(run.publicMetrics)}` +
      `,"durationMs":${encodeFiniteNumber(run.durationMs)}` +
      `,"errorCode":${run.errorCode === null ? "null" : encodeJsonString(run.errorCode)}}`;
  }
  runs += "]";
  return (
    `{"candidateId":${encodeJsonString(report.candidateId)}` +
    `,"runs":${runs}` +
    `,"publicMetrics":{"totalRuns":${encodeFiniteNumber(report.publicMetrics.totalRuns)}` +
    `,"passedRuns":${encodeFiniteNumber(report.publicMetrics.passedRuns)}` +
    `,"failedRuns":${encodeFiniteNumber(report.publicMetrics.failedRuns)}` +
    `,"errorRuns":${encodeFiniteNumber(report.publicMetrics.errorRuns)}` +
    `,"passRate":${encodeFiniteNumber(report.publicMetrics.passRate)}` +
    `,"failRate":${encodeFiniteNumber(report.publicMetrics.failRate)}` +
    `,"errorRate":${encodeFiniteNumber(report.publicMetrics.errorRate)}}}`
  );
}

function encodeMetrics(metrics: Readonly<Record<string, number>>): string {
  const keys = Object.keys(metrics).sort();
  let encoded = "{";
  for (let index = 0; index < keys.length; index += 1) {
    if (index > 0) encoded += ",";
    const key = keys[index];
    encoded += `${encodeJsonString(key)}:${encodeFiniteNumber(metrics[key])}`;
  }
  return `${encoded}}`;
}

function encodeFiniteNumber(value: number): string {
  if (!Number.isFinite(value)) {
    throw invalidReport("Evaluation report contains a non-finite number");
  }
  return Object.is(value, -0) ? "0" : String(value);
}

function encodeJsonString(value: string): string {
  const hex = "0123456789abcdef";
  let encoded = '"';
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code === 0x22) encoded += '\\"';
    else if (code === 0x5c) encoded += "\\\\";
    else if (code === 0x08) encoded += "\\b";
    else if (code === 0x09) encoded += "\\t";
    else if (code === 0x0a) encoded += "\\n";
    else if (code === 0x0c) encoded += "\\f";
    else if (code === 0x0d) encoded += "\\r";
    else if (
      code < 0x20 ||
      (code >= 0xd800 && code <= 0xdfff) ||
      code === 0x2028 ||
      code === 0x2029
    ) {
      encoded +=
        "\\u" +
        hex[(code >>> 12) & 0x0f] +
        hex[(code >>> 8) & 0x0f] +
        hex[(code >>> 4) & 0x0f] +
        hex[code & 0x0f];
    } else {
      encoded += value[index];
    }
  }
  return `${encoded}"`;
}

async function runOne(
  options: CapturedOptions,
  item: WorkItem,
  selectInfrastructureFailure: (failure: EvaluationInfrastructureError) => void,
): Promise<EvaluationRunReport> {
  const started = readClock(options.now);
  let workspaceCleanup: OwnedCleanup | undefined;
  let runtimeDispose: OwnedCleanup | undefined;
  let runtime: CapturedRuntime | undefined;
  let selected: Omit<EvaluationRunReport, "durationMs"> | undefined;
  let primary: EvaluationInfrastructureError | undefined;

  try {
    const workspacePath = await createWorkspace(options, item, (cleanup) => {
      workspaceCleanup = cleanup;
    });
    throwIfCancelled(options.signal);
    runtime = await createRuntime(options, item, workspacePath, (dispose) => {
      runtimeDispose = dispose;
    });
    throwIfCancelled(options.signal);
    const output = await runRuntime(options, item, runtime);
    if (output.status === "failed") {
      selected = Object.freeze({
        taskId: item.task.id,
        runId: item.runId,
        candidateId: options.candidateId,
        verdict: "error",
        publicMetrics: output.publicMetrics,
        errorCode: output.errorCode,
      });
    } else {
      const judgement = await judgeOutput(options, item, output.publicEvidence);
      selected = Object.freeze({
        taskId: item.task.id,
        runId: item.runId,
        candidateId: options.candidateId,
        verdict: judgement.verdict,
        publicMetrics: mergeJudgeMetrics(
          output.publicMetrics,
          judgement.publicMetrics,
        ),
        errorCode: null,
      });
    }
  } catch (error) {
    primary = normalizeInfrastructureError(error);
    selectInfrastructureFailure(primary);
  }

  const cleanupFailures: unknown[] = [];
  if (runtimeDispose !== undefined) {
    await settleOwnedCleanup(runtimeDispose, options.signal, cleanupFailures);
  }
  if (workspaceCleanup !== undefined) {
    await settleOwnedCleanup(workspaceCleanup, options.signal, cleanupFailures);
  }

  if (cleanupFailures.length > 0) {
    const causes =
      primary === undefined ? cleanupFailures : [primary, ...cleanupFailures];
    throw infrastructureFailure(
      "EVALUATION_CLEANUP_FAILED",
      "Evaluation runtime or workspace cleanup failed",
      new NativeAggregateError(causes, "Evaluation cleanup failed"),
    );
  }
  if (primary !== undefined) throw primary;
  if (selected === undefined) {
    throw infrastructureFailure(
      "EVALUATION_RUNTIME_FAILED",
      "Evaluation run did not select a result",
    );
  }
  throwIfCancelled(options.signal);
  const finished = readClock(options.now);
  const durationMs = finished - started;
  if (!Number.isFinite(durationMs) || durationMs < 0) {
    throw infrastructureFailure(
      "EVALUATION_CLOCK_FAILED",
      "Evaluation clock must be finite and monotonic",
    );
  }
  return Object.freeze({
    taskId: selected.taskId,
    runId: selected.runId,
    candidateId: selected.candidateId,
    verdict: selected.verdict,
    publicMetrics: selected.publicMetrics,
    durationMs,
    errorCode: selected.errorCode,
  });
}

async function settleOwnedCleanup(
  cleanup: OwnedCleanup,
  signal: AbortSignal,
  failures: unknown[],
): Promise<void> {
  let value: unknown;
  try {
    value = cleanup();
  } catch (error) {
    failures.push(error);
    return;
  }
  try {
    await awaitAbortable(value, signal);
  } catch (error) {
    if (!isCancellation(error)) failures.push(error);
  }
}

async function createWorkspace(
  options: CapturedOptions,
  item: WorkItem,
  registerCleanup: (cleanup: OwnedCleanup) => void,
): Promise<string> {
  const input = Object.freeze({
    candidateId: options.candidateId,
    taskId: item.task.id,
    runId: item.runId,
    repetition: item.repetition,
    signal: options.signal,
  });
  try {
    const value = await invokeFactoryAbortable(
      () => options.createWorkspace(input),
      options.signal,
      cleanupLateWorkspace,
    );
    return snapshotWorkspace(value, registerCleanup);
  } catch (error) {
    if (isCancellation(error)) throw error;
    throw infrastructureFailure(
      "EVALUATION_WORKSPACE_FAILED",
      "Evaluation workspace creation failed",
      error,
    );
  }
}

async function createRuntime(
  options: CapturedOptions,
  item: WorkItem,
  workspacePath: string,
  registerDispose: (dispose: OwnedCleanup) => void,
): Promise<CapturedRuntime> {
  const input = Object.freeze({
    candidateId: options.candidateId,
    taskId: item.task.id,
    runId: item.runId,
    repetition: item.repetition,
    workspacePath,
    signal: options.signal,
  });
  try {
    const value = await invokeFactoryAbortable(
      () => options.createRuntime(input),
      options.signal,
      cleanupLateRuntime,
    );
    return snapshotRuntime(value, registerDispose);
  } catch (error) {
    if (isCancellation(error)) throw error;
    throw infrastructureFailure(
      "EVALUATION_RUNTIME_FACTORY_FAILED",
      "Candidate runtime construction failed",
      error,
    );
  }
}

async function runRuntime(
  options: CapturedOptions,
  item: WorkItem,
  runtime: CapturedRuntime,
): Promise<CapturedRuntimeOutput> {
  const input = Object.freeze({
    prompt: item.task.prompt,
    signal: options.signal,
  });
  try {
    const value = await invokeAbortable(
      () => runtime.run(input),
      options.signal,
    );
    const output = snapshotRuntimeOutput(value);
    if (output.status === "completed") {
      assertTaskEvidenceBudget(
        item.task.expectedPublicEvidence.includes,
        output.publicEvidence,
        `Evaluation runtime output for ${item.task.id}`,
      );
    }
    return output;
  } catch (error) {
    if (isCancellation(error)) throw error;
    throw infrastructureFailure(
      "EVALUATION_RUNTIME_FAILED",
      "Candidate runtime execution failed",
      error,
    );
  }
}

async function judgeOutput(
  options: CapturedOptions,
  item: WorkItem,
  candidatePublicEvidence: readonly string[],
): Promise<
  Readonly<{
    verdict: "pass" | "fail";
    publicMetrics: Readonly<Record<string, number>>;
  }>
> {
  const input: EvaluationJudgeInput = Object.freeze({
    taskId: item.task.id,
    runId: item.runId,
    prompt: item.task.prompt,
    expectedPublicEvidence: item.task.expectedPublicEvidence,
    candidatePublicEvidence,
    signal: options.signal,
  });
  try {
    const value = await invokeAbortable(
      () => options.judge(input),
      options.signal,
    );
    return snapshotJudgeResult(value);
  } catch (error) {
    if (isCancellation(error)) throw error;
    throw infrastructureFailure(
      "EVALUATION_JUDGE_FAILED",
      "Evaluation judge failed",
      error,
    );
  }
}

function captureOptions(options: RunEvaluationOptions): CapturedOptions {
  const raw = requireRecord(options, "Evaluation options");
  const candidateValue = readProperty(raw, "candidate", "Evaluation options");
  const tasksValue = readProperty(raw, "tasks", "Evaluation options");
  const repetitionsValue = readOptionalProperty(raw, "repetitions", 1);
  const judgeValue = readOptionalProperty(
    raw,
    "judge",
    deterministicEvaluationJudge,
  );
  const signalValue = readOptionalProperty(
    raw,
    "signal",
    new AbortController().signal,
  );
  const concurrencyValue = readOptionalProperty(raw, "concurrency", 1);
  const clockValue = readOptionalProperty(raw, "clock", defaultClock);
  const workspaceFactoryValue = readOptionalProperty(
    raw,
    "workspaceFactory",
    defaultWorkspaceFactory,
  );

  const candidate = requireRecord(candidateValue, "Evaluation candidate");
  const candidateId = requireId(
    readProperty(candidate, "id", "Evaluation candidate"),
    "Evaluation candidate id",
  );
  const createRuntime = requireFunction(
    readProperty(candidate, "createRuntime", "Evaluation candidate"),
    "Evaluation candidate createRuntime",
  ) as EvaluationCandidate["createRuntime"];
  const judge = requireRecord(judgeValue, "Evaluation judge");
  const judgeFunction = requireFunction(
    readProperty(judge, "judge", "Evaluation judge"),
    "Evaluation judge judge",
  ) as EvaluationJudge["judge"];
  const clock = requireRecord(clockValue, "Evaluation clock");
  const now = requireFunction(
    readProperty(clock, "now", "Evaluation clock"),
    "Evaluation clock now",
  ) as () => number;
  const createWorkspace = requireFunction(
    workspaceFactoryValue,
    "Evaluation workspaceFactory",
  ) as EvaluationWorkspaceFactory;

  if (
    !Number.isSafeInteger(repetitionsValue) ||
    typeof repetitionsValue !== "number" ||
    repetitionsValue < 1 ||
    repetitionsValue > MAX_REPETITIONS
  ) {
    throw new TypeError(
      `Evaluation repetitions must be an integer from 1 to ${MAX_REPETITIONS}`,
    );
  }
  if (
    !Number.isSafeInteger(concurrencyValue) ||
    typeof concurrencyValue !== "number" ||
    concurrencyValue < 1 ||
    concurrencyValue > MAX_CONCURRENCY
  ) {
    throw new TypeError(
      `Evaluation concurrency must be an integer from 1 to ${MAX_CONCURRENCY}`,
    );
  }
  if (!(signalValue instanceof AbortSignal) || isProxy(signalValue)) {
    throw new TypeError("Evaluation signal must be a native AbortSignal");
  }
  const tasks = loadEvaluationTasks(tasksValue);
  const totalRuns = tasks.length * repetitionsValue;
  if (totalRuns > MAX_EVALUATION_RUNS) {
    throw new TypeError(
      `Evaluation must not exceed ${MAX_EVALUATION_RUNS} total runs`,
    );
  }

  return Object.freeze({
    candidateId,
    createRuntime,
    tasks,
    repetitions: repetitionsValue,
    judge: judgeFunction,
    signal: signalValue,
    concurrency: concurrencyValue,
    now,
    createWorkspace,
  });
}

function createWorkItems(
  tasks: readonly EvaluationTask[],
  repetitions: number,
): readonly WorkItem[] {
  const items: WorkItem[] = [];
  for (let taskIndex = 0; taskIndex < tasks.length; taskIndex += 1) {
    for (let repetition = 1; repetition <= repetitions; repetition += 1) {
      const index = items.length;
      items.push(
        Object.freeze({
          task: tasks[taskIndex],
          repetition,
          runId: `run-${String(index + 1).padStart(6, "0")}`,
          index,
        }),
      );
    }
  }
  return Object.freeze(items);
}

function snapshotWorkspace(
  input: unknown,
  registerCleanup: (cleanup: OwnedCleanup) => void,
): string {
  const workspace = requireRecord(input, "Evaluation workspace");
  const cleanup = captureOwnedMethod(
    workspace,
    "cleanup",
    "Evaluation workspace cleanup",
  );
  registerCleanup(cleanup);
  const path = requireBoundedString(
    readProperty(workspace, "path", "Evaluation workspace"),
    "Evaluation workspace path",
    false,
  );
  return path;
}

function snapshotRuntime(
  input: unknown,
  registerDispose: (dispose: OwnedCleanup) => void,
): CapturedRuntime {
  const runtime = requireRecord(input, "Evaluation runtime");
  const dispose = captureOwnedMethod(
    runtime,
    "dispose",
    "Evaluation runtime dispose",
  );
  registerDispose(dispose);
  const run = requireFunction(
    readProperty(runtime, "run", "Evaluation runtime"),
    "Evaluation runtime run",
  );
  return Object.freeze({
    run: (runInput) =>
      reflectApply(run, runtime, [runInput]) as ReturnType<
        EvaluationRuntime["run"]
      >,
  });
}

function cleanupLateWorkspace(input: unknown): unknown {
  return cleanupLateOwnedValue(input, "cleanup", "Late evaluation workspace");
}

function cleanupLateRuntime(input: unknown): unknown {
  return cleanupLateOwnedValue(input, "dispose", "Late evaluation runtime");
}

function cleanupLateOwnedValue(
  input: unknown,
  key: "cleanup" | "dispose",
  label: string,
): unknown {
  let cleanup: OwnedCleanup;
  try {
    const owner = requireRecord(input, label);
    cleanup = captureOwnedMethod(owner, key, `${label} ${key}`);
  } catch {
    // A late malformed value has no safely discoverable ownership hook.
    return undefined;
  }
  return cleanup();
}

function snapshotRuntimeOutput(input: unknown): CapturedRuntimeOutput {
  const output = requireRecord(input, "Evaluation runtime output");
  const status = readProperty(output, "status", "Evaluation runtime output");
  const metricsValue = readOptionalProperty(output, "publicMetrics", {});
  const publicMetrics = snapshotMetrics(
    metricsValue,
    "Evaluation runtime output public metrics",
    MAX_SOURCE_METRICS,
  );
  if (status === "completed") {
    const publicEvidence = snapshotEvidence(
      readProperty(output, "publicEvidence", "Evaluation runtime output"),
      "Evaluation runtime output publicEvidence",
      true,
    );
    return Object.freeze({ status, publicEvidence, publicMetrics });
  }
  if (status === "failed") {
    const rawCode = readProperty(
      output,
      "errorCode",
      "Evaluation runtime output",
    );
    return Object.freeze({
      status,
      errorCode: sanitizeErrorCode(rawCode, "TASK_FAILED"),
      publicMetrics,
    });
  }
  throw new TypeError(
    "Evaluation runtime output status must be completed or failed",
  );
}

function snapshotJudgeResult(input: unknown): Readonly<{
  verdict: "pass" | "fail";
  publicMetrics: Readonly<Record<string, number>>;
}> {
  const result = requireRecord(input, "Evaluation judge result");
  const verdict = readProperty(result, "verdict", "Evaluation judge result");
  const metricsValue = readOptionalProperty(result, "publicMetrics", {});
  if (verdict !== "pass" && verdict !== "fail") {
    throw new TypeError("Evaluation judge verdict must be pass or fail");
  }
  return Object.freeze({
    verdict,
    publicMetrics: snapshotMetrics(
      metricsValue,
      "Evaluation judge result public metrics",
      MAX_SOURCE_METRICS,
    ),
  });
}

function snapshotReport(input: unknown, label: string): EvaluationReport {
  const report = requireRecord(input, label);
  const candidateId = requireId(
    readProperty(report, "candidateId", label),
    `${label} candidateId`,
  );
  const rawRuns = requireDenseArray(
    readProperty(report, "runs", label),
    `${label} runs`,
  );
  if (rawRuns.length === 0 || rawRuns.length > MAX_EVALUATION_RUNS) {
    throw new TypeError(`${label} runs has an invalid length`);
  }
  const runs: EvaluationRunReport[] = [];
  const identities = new Set<string>();
  const runIds = new Set<string>();
  for (let index = 0; index < rawRuns.length; index += 1) {
    const rawRun = requireRecord(rawRuns[index], `${label} run ${index}`);
    const taskId = requireId(
      readProperty(rawRun, "taskId", `${label} run ${index}`),
      `${label} run ${index} taskId`,
    );
    const runId = requireId(
      readProperty(rawRun, "runId", `${label} run ${index}`),
      `${label} run ${index} runId`,
    );
    const runCandidateId = requireId(
      readProperty(rawRun, "candidateId", `${label} run ${index}`),
      `${label} run ${index} candidateId`,
    );
    const verdict = readProperty(rawRun, "verdict", `${label} run ${index}`);
    const publicMetrics = snapshotMetrics(
      readProperty(rawRun, "publicMetrics", `${label} run ${index}`),
      `${label} run ${index} public metrics`,
      MAX_REPORT_METRICS,
    );
    const durationMs = readProperty(
      rawRun,
      "durationMs",
      `${label} run ${index}`,
    );
    const errorCode = readProperty(
      rawRun,
      "errorCode",
      `${label} run ${index}`,
    );
    const identity = `${taskId}\u0000${runId}`;
    if (identities.has(identity) || runIds.has(runId)) {
      throw new TypeError(`${label} contains a duplicate run identity`);
    }
    identities.add(identity);
    runIds.add(runId);
    if (runCandidateId !== candidateId) {
      throw new TypeError(
        `${label} run ${index} candidateId does not match report`,
      );
    }
    if (verdict !== "pass" && verdict !== "fail" && verdict !== "error") {
      throw new TypeError(`${label} run ${index} verdict is invalid`);
    }
    if (
      typeof durationMs !== "number" ||
      !Number.isFinite(durationMs) ||
      durationMs < 0
    ) {
      throw new TypeError(`${label} run ${index} duration must be finite`);
    }
    if (
      errorCode !== null &&
      (typeof errorCode !== "string" || !ERROR_CODE_PATTERN.test(errorCode))
    ) {
      throw new TypeError(`${label} run ${index} error code is invalid`);
    }
    if ((verdict === "error") !== (errorCode !== null)) {
      throw new TypeError(
        `${label} run ${index} error verdict and error code must agree`,
      );
    }
    runs.push(
      Object.freeze({
        taskId,
        runId,
        candidateId: runCandidateId,
        verdict,
        publicMetrics,
        durationMs,
        errorCode,
      }),
    );
  }
  const frozenRuns = Object.freeze(runs);
  const suppliedAggregate = snapshotMetrics(
    readProperty(report, "publicMetrics", label),
    `${label} public metrics`,
    MAX_REPORT_METRICS,
  );
  const aggregate = aggregateMetrics(frozenRuns);
  for (const key of Object.keys(aggregate) as Array<
    keyof EvaluationAggregateMetrics
  >) {
    if (suppliedAggregate[key] !== aggregate[key]) {
      throw new TypeError(`${label} aggregate metric ${key} is inconsistent`);
    }
  }
  return Object.freeze({
    candidateId,
    runs: frozenRuns,
    publicMetrics: aggregate,
  });
}

function captureReport(input: unknown, label: string): EvaluationReport {
  try {
    return snapshotReport(input, label);
  } catch (error) {
    if (
      error instanceof EvaluationInfrastructureError &&
      error.code === "EVALUATION_INVALID_REPORT"
    ) {
      throw error;
    }
    throw invalidReport(`${label} is invalid`, error);
  }
}

function reportIdentity(run: EvaluationRunReport): string {
  return `${run.taskId}\u0000${run.runId}`;
}

function aggregateMetrics(
  runs: readonly EvaluationRunReport[],
): EvaluationAggregateMetrics {
  let passedRuns = 0;
  let failedRuns = 0;
  let errorRuns = 0;
  for (let index = 0; index < runs.length; index += 1) {
    const verdict = runs[index].verdict;
    if (verdict === "pass") passedRuns += 1;
    else if (verdict === "fail") failedRuns += 1;
    else errorRuns += 1;
  }
  const totalRuns = runs.length;
  return Object.freeze({
    totalRuns,
    passedRuns,
    failedRuns,
    errorRuns,
    passRate: passedRuns / totalRuns,
    failRate: failedRuns / totalRuns,
    errorRate: errorRuns / totalRuns,
  });
}

function mergeJudgeMetrics(
  first: Readonly<Record<string, number>>,
  second: Readonly<Record<string, number>>,
): Readonly<Record<string, number>> {
  try {
    const merged: Record<string, number> = Object.create(null) as Record<
      string,
      number
    >;
    const firstKeys = Object.keys(first);
    for (let index = 0; index < firstKeys.length; index += 1) {
      const key = firstKeys[index];
      merged[key] = first[key];
    }
    const secondKeys = Object.keys(second);
    for (let index = 0; index < secondKeys.length; index += 1) {
      const key = secondKeys[index];
      if (reflectApply(objectHasOwn, merged, [key])) {
        throw new TypeError(`Duplicate public metric: ${key}`);
      }
      merged[key] = second[key];
    }
    return snapshotMetrics(
      merged,
      "Merged evaluation public metrics",
      MAX_REPORT_METRICS,
    );
  } catch (error) {
    throw infrastructureFailure(
      "EVALUATION_JUDGE_FAILED",
      "Judge metrics could not be composed with runtime metrics",
      error,
    );
  }
}

function snapshotMetrics(
  input: unknown,
  label: string,
  maximum: number,
): Readonly<Record<string, number>> {
  const metrics = requireRecord(input, label);
  let keys: string[];
  try {
    keys = Object.keys(metrics);
  } catch (error) {
    throw new TypeError(`${label} could not be inspected safely`, {
      cause: error,
    });
  }
  if (keys.length > maximum) {
    throw new TypeError(`${label} must not exceed ${maximum} metrics`);
  }
  keys.sort();
  const snapshot: Record<string, number> = Object.create(null) as Record<
    string,
    number
  >;
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    if (!METRIC_NAME_PATTERN.test(key)) {
      throw new TypeError(`${label} contains an invalid metric name`);
    }
    let value: unknown;
    try {
      value = Reflect.get(metrics, key);
    } catch (error) {
      throw new TypeError(`${label} metrics could not be read safely`, {
        cause: error,
      });
    }
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new TypeError(`${label} metric ${key} must be finite`);
    }
    snapshot[key] = value;
  }
  return Object.freeze(snapshot);
}

function frozenMetrics(
  input: Readonly<Record<string, number>>,
): Readonly<Record<string, number>> {
  return snapshotMetrics(input, "Public metrics", MAX_SOURCE_METRICS);
}

function snapshotEvidence(
  input: unknown,
  label: string,
  allowEmpty: boolean,
): readonly string[] {
  const raw = requireDenseArray(input, label);
  if ((!allowEmpty && raw.length === 0) || raw.length > MAX_EVIDENCE_ITEMS) {
    throw new TypeError(
      `${label} must contain ${allowEmpty ? "0" : "1"}-${MAX_EVIDENCE_ITEMS} items`,
    );
  }
  const evidence: string[] = [];
  for (let index = 0; index < raw.length; index += 1) {
    evidence.push(
      requireBoundedString(
        raw[index],
        `${label}[${index}]`,
        false,
        MAX_EVIDENCE_ITEM_CODE_POINTS * 2,
      ),
    );
    if (
      countCodePoints(evidence[evidence.length - 1]) >
      MAX_EVIDENCE_ITEM_CODE_POINTS
    ) {
      throw new TypeError(
        `${label}[${index}] must not exceed ${MAX_EVIDENCE_ITEM_CODE_POINTS} code points`,
      );
    }
  }
  return Object.freeze(evidence);
}

function assertUniqueRequiredEvidence(
  evidence: readonly string[],
  label: string,
): void {
  const unique = new Set<string>();
  for (let index = 0; index < evidence.length; index += 1) {
    if (unique.has(evidence[index])) {
      throw new TypeError(`${label} contains duplicate required evidence`);
    }
    unique.add(evidence[index]);
  }
}

function assertTaskEvidenceBudget(
  expected: readonly string[],
  candidate: readonly string[],
  label: string,
): void {
  let total = 0;
  for (let index = 0; index < expected.length; index += 1) {
    total += countCodePoints(expected[index]);
  }
  for (let index = 0; index < candidate.length; index += 1) {
    total += countCodePoints(candidate[index]);
  }
  if (total > MAX_TASK_EVIDENCE_CODE_POINTS) {
    throw new TypeError(
      `${label} evidence must not exceed ${MAX_TASK_EVIDENCE_CODE_POINTS} code points`,
    );
  }
}

function countCodePoints(value: string): number {
  let count = 0;
  let index = 0;
  while (index < value.length) {
    const first = value.charCodeAt(index);
    if (first >= 0xd800 && first <= 0xdbff && index + 1 < value.length) {
      const second = value.charCodeAt(index + 1);
      index += second >= 0xdc00 && second <= 0xdfff ? 2 : 1;
    } else {
      index += 1;
    }
    count += 1;
  }
  return count;
}

function readClock(now: () => number): number {
  let value: unknown;
  try {
    value = now();
  } catch (error) {
    throw infrastructureFailure(
      "EVALUATION_CLOCK_FAILED",
      "Evaluation clock failed",
      error,
    );
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw infrastructureFailure(
      "EVALUATION_CLOCK_FAILED",
      "Evaluation clock must return a finite number",
    );
  }
  return value;
}

function verdictRank(verdict: EvaluationVerdict): number {
  if (verdict === "pass") return 2;
  if (verdict === "fail") return 1;
  return 0;
}

function sanitizeErrorCode(input: unknown, fallback: string): string {
  if (typeof input !== "string" || !ERROR_CODE_PATTERN.test(input)) {
    return fallback;
  }
  return input;
}

function requireRecord(input: unknown, label: string): Record<string, unknown> {
  if (
    (typeof input !== "object" && typeof input !== "function") ||
    input === null ||
    isProxy(input) ||
    Array.isArray(input)
  ) {
    throw new TypeError(`${label} must be a non-Proxy object`);
  }
  return input as Record<string, unknown>;
}

function requireDenseArray(input: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(input) || isProxy(input)) {
    throw new TypeError(`${label} must be a non-Proxy array`);
  }
  const length = input.length;
  if (!Number.isSafeInteger(length)) {
    throw new TypeError(`${label} length is invalid`);
  }
  const snapshot: unknown[] = [];
  for (let index = 0; index < length; index += 1) {
    if (!reflectApply(objectHasOwn, input, [index])) {
      throw new TypeError(`${label} must be dense`);
    }
    snapshot.push(input[index]);
  }
  return snapshot;
}

function readProperty(
  input: Record<string, unknown>,
  key: string,
  label: string,
): unknown {
  try {
    return Reflect.get(input, key);
  } catch (error) {
    throw new TypeError(`${label}.${key} could not be read safely`, {
      cause: error,
    });
  }
}

function readOptionalProperty(
  input: Record<string, unknown>,
  key: string,
  fallback: unknown,
): unknown {
  const value = readProperty(input, key, "Evaluation options");
  return value === undefined ? fallback : value;
}

function requireId(input: unknown, label: string): string {
  if (typeof input !== "string" || !ID_PATTERN.test(input)) {
    throw new TypeError(`${label} must be a stable lowercase identifier`);
  }
  return input;
}

function requireBoundedString(
  input: unknown,
  label: string,
  allowEmpty: boolean,
  maximumCodeUnits = MAX_PROMPT_CODE_UNITS,
): string {
  if (
    typeof input !== "string" ||
    (!allowEmpty && input.length === 0) ||
    input.length > maximumCodeUnits
  ) {
    throw new TypeError(`${label} must be a bounded string`);
  }
  return input;
}

function requireFunction(input: unknown, label: string): UnknownFunction {
  if (typeof input !== "function" || isProxy(input)) {
    throw new TypeError(`${label} must be a non-Proxy function`);
  }
  return input as UnknownFunction;
}

function captureOwnedMethod(
  owner: Record<string, unknown>,
  key: "cleanup" | "dispose",
  label: string,
): OwnedCleanup {
  let descriptor: PropertyDescriptor | undefined;
  try {
    descriptor = Object.getOwnPropertyDescriptor(owner, key);
  } catch (error) {
    throw new TypeError(`${label} ownership could not be inspected safely`, {
      cause: error,
    });
  }
  if (descriptor === undefined) {
    throw new TypeError(`${label} must be an own function`);
  }
  let value: unknown;
  try {
    value = "value" in descriptor ? descriptor.value : Reflect.get(owner, key);
  } catch (error) {
    throw new TypeError(`${label} could not be read safely`, { cause: error });
  }
  const method = requireFunction(value, label);
  let called = false;
  return () => {
    if (called) return undefined;
    called = true;
    return reflectApply(method, owner, []);
  };
}

function isProxy(input: object): boolean {
  try {
    return reflectApply(nodeIsProxy, undefined, [input]);
  } catch {
    return true;
  }
}

function throwIfCancelled(signal: AbortSignal): void {
  if (!readAborted(signal)) return;
  throw infrastructureFailure(
    "EVALUATION_CANCELLED",
    "Evaluation was cancelled",
  );
}

function readAborted(signal: AbortSignal): boolean {
  if (abortSignalAbortedGetter === undefined) {
    throw infrastructureFailure(
      "EVALUATION_INVALID_OPTIONS",
      "AbortSignal.aborted is unavailable",
    );
  }
  try {
    return reflectApply(abortSignalAbortedGetter, signal, []) as boolean;
  } catch (error) {
    throw infrastructureFailure(
      "EVALUATION_INVALID_OPTIONS",
      "AbortSignal could not be inspected",
      error,
    );
  }
}

function createSharedCancellation(external: AbortSignal): SharedCancellation {
  const controller = new AbortController();
  let linked = false;
  const abort = () => {
    if (!readAborted(controller.signal)) controller.abort("Evaluation stopped");
  };
  const onExternalAbort = () => abort();
  if (readAborted(external)) {
    abort();
  } else {
    reflectApply(eventTargetAddEventListener, external, [
      "abort",
      onExternalAbort,
      { once: true },
    ]);
    linked = true;
    if (readAborted(external)) abort();
  }
  return Object.freeze({
    signal: controller.signal,
    abort,
    unlink: () => {
      if (!linked) return;
      linked = false;
      try {
        reflectApply(eventTargetRemoveEventListener, external, [
          "abort",
          onExternalAbort,
        ]);
      } catch {
        // The shared controller already owns the terminal state.
      }
    },
  });
}

function invokeFactoryAbortable(
  operation: () => unknown,
  signal: AbortSignal,
  cleanupLateValue: (value: unknown) => unknown,
): Promise<unknown> {
  throwIfCancelled(signal);
  let value: unknown;
  try {
    value = operation();
  } catch (error) {
    return NativePromise.reject(error);
  }
  let observed: Promise<unknown>;
  try {
    observed = observeAsync(value);
  } catch (error) {
    return NativePromise.reject(error);
  }
  return new NativePromise<unknown>((resolve, reject) => {
    let settled = false;
    let listening = false;
    const cleanupListener = () => {
      if (!listening) return;
      listening = false;
      try {
        reflectApply(eventTargetRemoveEventListener, signal, [
          "abort",
          onAbort,
        ]);
      } catch {
        // The selected terminal result is already observed.
      }
    };
    const settle = (kind: "resolve" | "reject", result: unknown) => {
      if (settled) return;
      settled = true;
      cleanupListener();
      if (kind === "resolve") resolve(result);
      else reject(result);
    };
    const onAbort = () => {
      settle(
        "reject",
        infrastructureFailure(
          "EVALUATION_CANCELLED",
          "Evaluation was cancelled",
        ),
      );
    };
    const continuation = reflectApply(nativePromiseThen, observed, [
      (result: unknown) => {
        if (!settled) {
          settle("resolve", result);
          return;
        }
        observeLateCleanup(() => cleanupLateValue(result));
      },
      (error: unknown) => {
        if (!settled) settle("reject", error);
      },
    ]) as Promise<unknown>;
    void reflectApply(nativePromiseThen, continuation, [
      () => undefined,
      () => undefined,
    ]);
    try {
      if (readAborted(signal)) {
        onAbort();
        return;
      }
      reflectApply(eventTargetAddEventListener, signal, [
        "abort",
        onAbort,
        { once: true },
      ]);
      listening = true;
      if (readAborted(signal)) onAbort();
    } catch (error) {
      settle("reject", error);
    }
  });
}

function observeLateCleanup(operation: () => unknown): void {
  let value: unknown;
  try {
    value = operation();
  } catch {
    return;
  }
  const observed = observeAsync(value);
  void reflectApply(nativePromiseThen, observed, [
    () => undefined,
    () => undefined,
  ]);
}

function invokeAbortable(
  operation: () => unknown,
  signal: AbortSignal,
): Promise<unknown> {
  throwIfCancelled(signal);
  let value: unknown;
  try {
    value = operation();
  } catch (error) {
    return NativePromise.reject(error);
  }
  return awaitAbortable(value, signal);
}

function awaitAbortable(value: unknown, signal: AbortSignal): Promise<unknown> {
  let observed: Promise<unknown>;
  try {
    observed = reflectApply(nativePromiseResolve, NativePromise, [
      value,
    ]) as Promise<unknown>;
  } catch (error) {
    return NativePromise.reject(error);
  }
  return new NativePromise<unknown>((resolve, reject) => {
    let settled = false;
    let listening = false;
    const cleanup = () => {
      if (!listening) return;
      listening = false;
      try {
        reflectApply(eventTargetRemoveEventListener, signal, [
          "abort",
          onAbort,
        ]);
      } catch {
        // The selected terminal result is already observed.
      }
    };
    const settle = (kind: "resolve" | "reject", result: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (kind === "resolve") resolve(result);
      else reject(result);
    };
    const onAbort = () => {
      settle(
        "reject",
        infrastructureFailure(
          "EVALUATION_CANCELLED",
          "Evaluation was cancelled",
        ),
      );
    };
    const continuation = reflectApply(nativePromiseThen, observed, [
      (result: unknown) => settle("resolve", result),
      (error: unknown) => settle("reject", error),
    ]) as Promise<unknown>;
    void reflectApply(nativePromiseThen, continuation, [
      () => undefined,
      () => undefined,
    ]);
    try {
      if (readAborted(signal)) {
        onAbort();
        return;
      }
      reflectApply(eventTargetAddEventListener, signal, [
        "abort",
        onAbort,
        { once: true },
      ]);
      listening = true;
      if (readAborted(signal)) onAbort();
    } catch (error) {
      settle("reject", error);
    }
  });
}

function observeAsync(value: unknown): Promise<unknown> {
  try {
    return reflectApply(nativePromiseResolve, NativePromise, [
      value,
    ]) as Promise<unknown>;
  } catch (error) {
    return NativePromise.reject(error);
  }
}

function isCancellation(error: unknown): boolean {
  return (
    error instanceof EvaluationInfrastructureError &&
    error.code === "EVALUATION_CANCELLED"
  );
}

function normalizeInfrastructureError(
  error: unknown,
): EvaluationInfrastructureError {
  return error instanceof EvaluationInfrastructureError
    ? error
    : infrastructureFailure(
        "EVALUATION_RUNTIME_FAILED",
        "Evaluation infrastructure failed",
        error,
      );
}

function infrastructureFailure(
  code: EvaluationInfrastructureErrorCode,
  message: string,
  cause?: unknown,
): EvaluationInfrastructureError {
  return new EvaluationInfrastructureError(
    code,
    message,
    cause === undefined ? undefined : { cause },
  );
}

function invalidReport(
  message: string,
  cause?: unknown,
): EvaluationInfrastructureError {
  return infrastructureFailure("EVALUATION_INVALID_REPORT", message, cause);
}
