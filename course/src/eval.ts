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

const MAX_TASKS = 1_000;
const MAX_REPETITIONS = 100;
const MAX_CONCURRENCY = 8;
const MAX_EVIDENCE_ITEMS = 256;
const MAX_METRICS = 64;
const MAX_TEXT_LENGTH = 100_000;
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
  | "EVALUATION_CLEANUP_FAILED";

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
  dispose: EvaluationRuntime["dispose"];
}>;

type CapturedWorkspace = Readonly<{
  path: string;
  cleanup: EvaluationWorkspace["cleanup"];
}>;

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
    let matched = 0;
    for (
      let requiredIndex = 0;
      requiredIndex < required.length;
      requiredIndex += 1
    ) {
      const expected = required[requiredIndex];
      let found = false;
      for (
        let candidateIndex = 0;
        candidateIndex < candidate.length;
        candidateIndex += 1
      ) {
        if (candidate[candidateIndex].includes(expected)) {
          found = true;
          break;
        }
      }
      if (found) matched += 1;
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

  const work = createWorkItems(captured.tasks, captured.repetitions);
  const results = new Array<EvaluationRunReport | undefined>(work.length);
  const failures: FailureRecord[] = [];
  let nextIndex = 0;
  let stopping = false;

  const worker = async () => {
    while (!stopping) {
      const index = nextIndex;
      if (index >= work.length) return;
      nextIndex += 1;
      try {
        throwIfCancelled(captured.signal);
        results[index] = await runOne(captured, work[index]);
      } catch (error) {
        stopping = true;
        failures.push(
          Object.freeze({
            index,
            error: normalizeInfrastructureError(error),
          }),
        );
      }
    }
  };

  const workers: Promise<void>[] = [];
  const workerCount = Math.min(captured.concurrency, work.length);
  for (let index = 0; index < workerCount; index += 1) workers.push(worker());
  await NativePromise.all(workers);

  if (failures.length > 0) {
    failures.sort((left, right) => left.index - right.index);
    throw failures[0].error;
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
  const baseline = snapshotReport(baselineInput, "Baseline evaluation");
  const candidate = snapshotReport(candidateInput, "Candidate evaluation");
  if (baseline.runs.length !== candidate.runs.length) {
    throw new TypeError("Evaluation reports must contain the same run count");
  }

  const runs: EvaluationComparisonRun[] = [];
  let improvedRuns = 0;
  let regressedRuns = 0;
  let unchangedRuns = 0;
  for (let index = 0; index < baseline.runs.length; index += 1) {
    const baselineRun = baseline.runs[index];
    const candidateRun = candidate.runs[index];
    if (
      baselineRun.taskId !== candidateRun.taskId ||
      baselineRun.runId !== candidateRun.runId
    ) {
      throw new TypeError(`Evaluation reports are not aligned at run ${index}`);
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
  const report = snapshotReport(input, "Evaluation report");
  const runs: Record<string, unknown>[] = [];
  for (let index = 0; index < report.runs.length; index += 1) {
    const run = report.runs[index];
    runs.push({
      taskId: run.taskId,
      runId: run.runId,
      candidateId: run.candidateId,
      verdict: run.verdict,
      publicMetrics: orderedMetrics(run.publicMetrics),
      durationMs: run.durationMs,
      errorCode: run.errorCode,
    });
  }
  return JSON.stringify({
    candidateId: report.candidateId,
    runs,
    publicMetrics: {
      totalRuns: report.publicMetrics.totalRuns,
      passedRuns: report.publicMetrics.passedRuns,
      failedRuns: report.publicMetrics.failedRuns,
      errorRuns: report.publicMetrics.errorRuns,
      passRate: report.publicMetrics.passRate,
      failRate: report.publicMetrics.failRate,
      errorRate: report.publicMetrics.errorRate,
    },
  });
}

async function runOne(
  options: CapturedOptions,
  item: WorkItem,
): Promise<EvaluationRunReport> {
  const started = readClock(options.now);
  let workspace: CapturedWorkspace | undefined;
  let runtime: CapturedRuntime | undefined;
  let selected: Omit<EvaluationRunReport, "durationMs"> | undefined;
  let primary: EvaluationInfrastructureError | undefined;

  try {
    workspace = await createWorkspace(options, item);
    throwIfCancelled(options.signal);
    runtime = await createRuntime(options, item, workspace.path);
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
        publicMetrics: mergeMetrics(
          output.publicMetrics,
          judgement.publicMetrics,
        ),
        errorCode: null,
      });
    }
  } catch (error) {
    primary = normalizeInfrastructureError(error);
  }

  const cleanupFailures: unknown[] = [];
  if (runtime !== undefined) {
    try {
      await observeAsync(runtime.dispose());
    } catch (error) {
      cleanupFailures.push(error);
    }
  }
  if (workspace !== undefined) {
    try {
      await observeAsync(workspace.cleanup());
    } catch (error) {
      cleanupFailures.push(error);
    }
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

async function createWorkspace(
  options: CapturedOptions,
  item: WorkItem,
): Promise<CapturedWorkspace> {
  const input = Object.freeze({
    candidateId: options.candidateId,
    taskId: item.task.id,
    runId: item.runId,
    repetition: item.repetition,
  });
  let value: unknown;
  try {
    value = await observeAsync(options.createWorkspace(input));
    return snapshotWorkspace(value);
  } catch (error) {
    throwIfCancelled(options.signal);
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
    const value = await observeAsync(options.createRuntime(input));
    return snapshotRuntime(value);
  } catch (error) {
    throwIfCancelled(options.signal);
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
    return snapshotRuntimeOutput(value);
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

  return Object.freeze({
    candidateId,
    createRuntime,
    tasks: loadEvaluationTasks(tasksValue),
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

function snapshotWorkspace(input: unknown): CapturedWorkspace {
  const workspace = requireRecord(input, "Evaluation workspace");
  const path = requireBoundedString(
    readProperty(workspace, "path", "Evaluation workspace"),
    "Evaluation workspace path",
    false,
  );
  const cleanup = requireFunction(
    readProperty(workspace, "cleanup", "Evaluation workspace"),
    "Evaluation workspace cleanup",
  );
  return Object.freeze({
    path,
    cleanup: () => reflectApply(cleanup, workspace, []),
  });
}

function snapshotRuntime(input: unknown): CapturedRuntime {
  const runtime = requireRecord(input, "Evaluation runtime");
  const run = requireFunction(
    readProperty(runtime, "run", "Evaluation runtime"),
    "Evaluation runtime run",
  );
  const dispose = requireFunction(
    readProperty(runtime, "dispose", "Evaluation runtime"),
    "Evaluation runtime dispose",
  );
  return Object.freeze({
    run: (runInput) =>
      reflectApply(run, runtime, [runInput]) as ReturnType<
        EvaluationRuntime["run"]
      >,
    dispose: () => reflectApply(dispose, runtime, []),
  });
}

function snapshotRuntimeOutput(input: unknown): CapturedRuntimeOutput {
  const output = requireRecord(input, "Evaluation runtime output");
  const status = readProperty(output, "status", "Evaluation runtime output");
  const metricsValue = readOptionalProperty(output, "publicMetrics", {});
  const publicMetrics = snapshotMetrics(
    metricsValue,
    "Evaluation runtime output public metrics",
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
  if (rawRuns.length === 0 || rawRuns.length > MAX_TASKS * MAX_REPETITIONS) {
    throw new TypeError(`${label} runs has an invalid length`);
  }
  const runs: EvaluationRunReport[] = [];
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

function mergeMetrics(
  first: Readonly<Record<string, number>>,
  second: Readonly<Record<string, number>>,
): Readonly<Record<string, number>> {
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
  return frozenMetrics(merged);
}

function snapshotMetrics(
  input: unknown,
  label: string,
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
  if (keys.length > MAX_METRICS) {
    throw new TypeError(`${label} must not exceed ${MAX_METRICS} metrics`);
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
  return snapshotMetrics(input, "Public metrics");
}

function orderedMetrics(
  metrics: Readonly<Record<string, number>>,
): Record<string, number> {
  const ordered: Record<string, number> = {};
  const keys = Object.keys(metrics).sort();
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    ordered[key] = metrics[key];
  }
  return ordered;
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
      requireBoundedString(raw[index], `${label}[${index}]`, false),
    );
  }
  return Object.freeze(evidence);
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
): string {
  if (
    typeof input !== "string" ||
    (!allowEmpty && input.length === 0) ||
    input.length > MAX_TEXT_LENGTH
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
