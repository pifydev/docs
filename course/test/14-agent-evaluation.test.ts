import { access, readFile } from "node:fs/promises";

import { expect, test } from "vitest";

import {
  EvaluationInfrastructureError,
  MAX_EVALUATION_RUNS,
  MAX_EVIDENCE_ITEMS,
  MAX_REPORT_METRICS,
  MAX_SOURCE_METRICS,
  compareEvaluations,
  deterministicEvaluationJudge,
  loadEvaluationTasks,
  runEvaluation,
  serializeEvaluationReport,
  type EvaluationCandidate,
  type EvaluationReport,
  type EvaluationRuntime,
  type EvaluationWorkspaceFactory,
} from "../src/index";

type Deferred<Value> = Readonly<{
  promise: Promise<Value>;
  resolve: (value: Value | PromiseLike<Value>) => void;
  reject: (reason?: unknown) => void;
}>;

function deferred<Value>(): Deferred<Value> {
  let resolvePromise!: (value: Value | PromiseLike<Value>) => void;
  let rejectPromise!: (reason?: unknown) => void;
  const promise = new Promise<Value>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return { promise, resolve: resolvePromise, reject: rejectPromise };
}

async function fixture(): Promise<unknown> {
  return JSON.parse(
    await readFile(
      new URL("../fixtures/eval-tasks.json", import.meta.url),
      "utf8",
    ),
  ) as unknown;
}

function completedRuntime(
  evidenceFor: (prompt: string) => readonly string[],
  onDispose: () => void = () => undefined,
): EvaluationRuntime {
  return {
    run: ({ prompt }) => ({
      status: "completed",
      publicEvidence: evidenceFor(prompt),
      publicMetrics: { modelTurns: 1 },
    }),
    dispose: () => {
      onDispose();
    },
  };
}

function fixtureCandidate(id = "candidate-a"): EvaluationCandidate {
  return {
    id,
    createRuntime: () =>
      completedRuntime((prompt) =>
        prompt.includes("20 and 22") ? ["42"] : ["16"],
      ),
  };
}

function singleTask(id: string, expected: readonly string[] = ["42"]): unknown {
  return {
    schemaVersion: 1,
    tasks: [
      {
        id,
        split: "held-out",
        prompt: id,
        expectedPublicEvidence: { includes: expected },
        candidatePublicEvidence: ["42"],
        expectedVerdict: "pass",
      },
    ],
  };
}

test("loads the held-out fixture as an immutable unknown-data snapshot", async () => {
  const source = (await fixture()) as {
    tasks: Array<{ prompt: string; candidatePublicEvidence: string[] }>;
  };
  const tasks = loadEvaluationTasks(source);

  source.tasks[0].prompt = "mutated";
  source.tasks[0].candidatePublicEvidence[0] = "secret mutation";

  expect(tasks.map((task) => task.id)).toEqual([
    "held-out-arithmetic-pass",
    "held-out-arithmetic-fail",
  ]);
  expect(tasks[0].prompt).toContain("20 and 22");
  expect(tasks[0].candidatePublicEvidence).toEqual(["42"]);
  expect(Object.isFrozen(tasks)).toBe(true);
  expect(Object.isFrozen(tasks[0])).toBe(true);
  expect(Object.isFrozen(tasks[0].expectedPublicEvidence)).toBe(true);
  expect(Object.isFrozen(tasks[0].candidatePublicEvidence)).toBe(true);

  expect(() =>
    loadEvaluationTasks({
      schemaVersion: 1,
      tasks: [
        {
          id: "training-data",
          split: "train",
          prompt: "leak",
          expectedPublicEvidence: { includes: ["secret"] },
          candidatePublicEvidence: ["secret"],
          expectedVerdict: "pass",
        },
      ],
    }),
  ).toThrow(/held-out/u);

  const sparse = new Array(1);
  expect(() =>
    loadEvaluationTasks({ schemaVersion: 1, tasks: sparse }),
  ).toThrow(/dense/u);
});

test("evaluates pass and fail fixtures deterministically with a fresh cleaned runtime", async () => {
  const runtimePaths: string[] = [];
  const runtimeObjects: EvaluationRuntime[] = [];
  let disposals = 0;
  let active = 0;
  let maximumActive = 0;
  const candidate: EvaluationCandidate = {
    id: "candidate-a",
    createRuntime: async ({ workspacePath }) => {
      await access(workspacePath);
      runtimePaths.push(workspacePath);
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      const runtime = completedRuntime(
        (prompt) => (prompt.includes("20 and 22") ? ["42"] : ["16"]),
        () => {
          disposals += 1;
          active -= 1;
        },
      );
      runtimeObjects.push(runtime);
      return runtime;
    },
  };

  const first = await runEvaluation({
    candidate,
    tasks: await fixture(),
    repetitions: 2,
  });
  const second = await runEvaluation({
    candidate,
    tasks: await fixture(),
    repetitions: 2,
  });

  expect(first.runs.map((run) => run.verdict)).toEqual([
    "pass",
    "pass",
    "fail",
    "fail",
  ]);
  expect(second.runs.map((run) => run.verdict)).toEqual(
    first.runs.map((run) => run.verdict),
  );
  expect(first.publicMetrics).toEqual(second.publicMetrics);
  expect(first.publicMetrics).toEqual({
    totalRuns: 4,
    passedRuns: 2,
    failedRuns: 2,
    errorRuns: 0,
    passRate: 0.5,
    failRate: 0.5,
    errorRate: 0,
  });
  expect(first.runs.map((run) => run.runId)).toEqual([
    "run-000001",
    "run-000002",
    "run-000003",
    "run-000004",
  ]);
  expect(new Set(runtimeObjects).size).toBe(8);
  expect(new Set(runtimePaths).size).toBe(8);
  expect(disposals).toBe(8);
  expect(maximumActive).toBe(1);
  for (const path of runtimePaths) {
    await expect(access(path)).rejects.toMatchObject({ code: "ENOENT" });
  }
});

test("keeps hidden task material out of candidate inputs and exact report fields", async () => {
  const inputs: unknown[] = [];
  const candidate: EvaluationCandidate = {
    id: "isolated-candidate",
    createRuntime: (input) => {
      inputs.push(input);
      return {
        run: (runInput) => {
          inputs.push(runInput);
          return { status: "completed", publicEvidence: ["42"] };
        },
        dispose: () => undefined,
      };
    },
  };
  const report = await runEvaluation({
    candidate,
    tasks: {
      schemaVersion: 1,
      tasks: [
        {
          id: "held-out-secret",
          split: "held-out",
          prompt: "public prompt",
          expectedPublicEvidence: { includes: ["private rubric"] },
          candidatePublicEvidence: ["fixture-only output"],
          expectedVerdict: "fail",
        },
      ],
    },
  });

  expect(JSON.stringify(inputs)).not.toContain("private rubric");
  expect(JSON.stringify(inputs)).not.toContain("fixture-only output");
  expect(JSON.stringify(inputs)).not.toContain("expectedVerdict");
  expect(Object.keys(report.runs[0])).toEqual([
    "taskId",
    "runId",
    "candidateId",
    "verdict",
    "publicMetrics",
    "durationMs",
    "errorCode",
  ]);
  const serialized = serializeEvaluationReport(report);
  expect(serialized).not.toContain("public prompt");
  expect(serialized).not.toContain("private rubric");
  expect(serialized).not.toContain("fixture-only output");
  expect(serialized).not.toContain("42");
});

test("distinguishes a reported task error from infrastructure failure", async () => {
  const taskFailure = await runEvaluation({
    candidate: {
      id: "task-failure",
      createRuntime: () => ({
        run: () => ({
          status: "failed",
          errorCode: "MODEL_TIMEOUT",
          publicMetrics: { attempts: 2 },
        }),
        dispose: () => undefined,
      }),
    },
    tasks: await fixture(),
    repetitions: 1,
  });
  expect(taskFailure.runs).toHaveLength(2);
  expect(taskFailure.runs[0]).toMatchObject({
    verdict: "error",
    errorCode: "MODEL_TIMEOUT",
    publicMetrics: { attempts: 2 },
  });
  expect(taskFailure.publicMetrics.errorRate).toBe(1);

  await expect(
    runEvaluation({
      candidate: {
        id: "broken-host",
        createRuntime: () => {
          throw Object.assign(new Error("credential must remain private"), {
            code: "HOST_BROKEN",
          });
        },
      },
      tasks: await fixture(),
    }),
  ).rejects.toMatchObject({
    name: "EvaluationInfrastructureError",
    code: "EVALUATION_RUNTIME_FACTORY_FAILED",
  });
});

test("uses only an injected judge contract and observes custom thenables", async () => {
  const seen: unknown[] = [];
  const report = await runEvaluation({
    candidate: fixtureCandidate("judge-candidate"),
    tasks: await fixture(),
    judge: {
      judge(input) {
        seen.push(input);
        return {
          then(resolve: (value: unknown) => void) {
            queueMicrotask(() =>
              resolve({
                verdict: input.candidatePublicEvidence.includes("42")
                  ? "pass"
                  : "fail",
                publicMetrics: { customJudge: 1 },
              }),
            );
          },
        } as PromiseLike<{
          verdict: "pass" | "fail";
          publicMetrics: Readonly<Record<string, number>>;
        }>;
      },
    },
  });

  expect(seen).toHaveLength(2);
  expect(report.runs[0].publicMetrics).toEqual({
    modelTurns: 1,
    customJudge: 1,
  });
  expect(report.runs.map((run) => run.verdict)).toEqual(["pass", "fail"]);
  expect(deterministicEvaluationJudge).toBeTypeOf("object");
});

test("compares aligned baseline and candidate reports without timing noise", async () => {
  const baseline = await runEvaluation({
    candidate: {
      id: "baseline",
      createRuntime: () => completedRuntime(() => ["42", "15"]),
    },
    tasks: await fixture(),
    clock: {
      now: (() => {
        let tick = 0;
        return () => (tick += 1);
      })(),
    },
  });
  const candidate = await runEvaluation({
    candidate: fixtureCandidate("candidate"),
    tasks: await fixture(),
    clock: {
      now: (() => {
        let tick = 100;
        return () => (tick += 7);
      })(),
    },
  });

  const comparison = compareEvaluations(baseline, candidate);
  expect(comparison.baselineCandidateId).toBe("baseline");
  expect(comparison.candidateCandidateId).toBe("candidate");
  expect(comparison.runs).toEqual([
    {
      taskId: "held-out-arithmetic-pass",
      runId: "run-000001",
      baselineVerdict: "pass",
      candidateVerdict: "pass",
      outcome: "unchanged",
    },
    {
      taskId: "held-out-arithmetic-fail",
      runId: "run-000002",
      baselineVerdict: "pass",
      candidateVerdict: "fail",
      outcome: "regressed",
    },
  ]);
  expect(comparison.publicMetrics).toEqual({
    passRateDelta: -0.5,
    failRateDelta: 0.5,
    errorRateDelta: 0,
    improvedRuns: 0,
    regressedRuns: 1,
    unchangedRuns: 1,
  });
});

test("supports deterministic duration injection while comparison ignores duration", async () => {
  const readings = [10, 17];
  const report = await runEvaluation({
    candidate: {
      id: "clocked",
      createRuntime: () => completedRuntime(() => ["42"]),
    },
    tasks: {
      schemaVersion: 1,
      tasks: [
        {
          id: "held-out-clock",
          split: "held-out",
          prompt: "clock",
          expectedPublicEvidence: { includes: ["42"] },
          candidatePublicEvidence: ["42"],
          expectedVerdict: "pass",
        },
      ],
    },
    clock: { now: () => readings.shift() ?? 17 },
  });

  expect(report.runs[0].durationMs).toBe(7);
  expect(() =>
    compareEvaluations(report, {
      ...report,
      candidateId: "other-clock",
      runs: report.runs.map((run) => ({
        ...run,
        candidateId: "other-clock",
        durationMs: 999,
      })),
    }),
  ).not.toThrow();
});

test("defaults to serialized execution and safely bounds optional concurrency", async () => {
  let active = 0;
  let maximum = 0;
  const gate = deferred<void>();
  let entered = 0;
  const makeCandidate = (id: string): EvaluationCandidate => ({
    id,
    createRuntime: () => ({
      async run() {
        active += 1;
        entered += 1;
        maximum = Math.max(maximum, active);
        if (entered === 2) gate.resolve();
        await gate.promise;
        active -= 1;
        return { status: "completed", publicEvidence: ["42", "15"] };
      },
      dispose: () => undefined,
    }),
  });

  await runEvaluation({
    candidate: makeCandidate("parallel"),
    tasks: await fixture(),
    concurrency: 2,
  });
  expect(maximum).toBe(2);

  await expect(
    runEvaluation({
      candidate: fixtureCandidate(),
      tasks: await fixture(),
      concurrency: 9,
    }),
  ).rejects.toMatchObject({ code: "EVALUATION_INVALID_OPTIONS" });
});

test("cancels before and between runs without constructing later runtimes", async () => {
  const before = new AbortController();
  before.abort("stop");
  let constructed = 0;
  await expect(
    runEvaluation({
      candidate: {
        id: "cancel-before",
        createRuntime: () => {
          constructed += 1;
          return completedRuntime(() => ["42"]);
        },
      },
      tasks: await fixture(),
      signal: before.signal,
    }),
  ).rejects.toMatchObject({ code: "EVALUATION_CANCELLED" });
  expect(constructed).toBe(0);

  const between = new AbortController();
  await expect(
    runEvaluation({
      candidate: {
        id: "cancel-between",
        createRuntime: () => {
          constructed += 1;
          return completedRuntime(
            () => ["42"],
            () => {
              between.abort("between");
            },
          );
        },
      },
      tasks: await fixture(),
      signal: between.signal,
    }),
  ).rejects.toMatchObject({ code: "EVALUATION_CANCELLED" });
  expect(constructed).toBe(1);
});

test("cancels during runtime and judge, then disposes and cleans exactly once", async () => {
  for (const phase of ["runtime", "judge"] as const) {
    const controller = new AbortController();
    const entered = deferred<void>();
    const operation = deferred<never>();
    let disposed = 0;
    let cleaned = 0;
    const workspaceFactory: EvaluationWorkspaceFactory = () => ({
      path: `/virtual/${phase}`,
      cleanup: () => {
        cleaned += 1;
      },
    });
    const evaluation = runEvaluation({
      candidate: {
        id: `cancel-${phase}`,
        createRuntime: () => ({
          run: () => {
            if (phase === "runtime") {
              entered.resolve();
              return operation.promise;
            }
            return { status: "completed", publicEvidence: ["42"] };
          },
          dispose: () => {
            disposed += 1;
          },
        }),
      },
      tasks: {
        schemaVersion: 1,
        tasks: [
          {
            id: `held-out-${phase}`,
            split: "held-out",
            prompt: phase,
            expectedPublicEvidence: { includes: ["42"] },
            candidatePublicEvidence: ["42"],
            expectedVerdict: "pass",
          },
        ],
      },
      judge: {
        judge: () => {
          if (phase === "judge") {
            entered.resolve();
            return operation.promise;
          }
          return { verdict: "pass" };
        },
      },
      signal: controller.signal,
      workspaceFactory,
    });
    await entered.promise;
    controller.abort(`${phase} cancellation`);
    await expect(evaluation).rejects.toMatchObject({
      code: "EVALUATION_CANCELLED",
    });
    expect(disposed).toBe(1);
    expect(cleaned).toBe(1);
  }
});

test("adopts delayed workspace and runtime factories before cancellation cleanup", async () => {
  for (const phase of ["workspace", "factory"] as const) {
    const controller = new AbortController();
    const entered = deferred<void>();
    const gate = deferred<unknown>();
    let disposed = 0;
    let cleaned = 0;
    const runtime: EvaluationRuntime = {
      run: () => ({ status: "completed", publicEvidence: ["42"] }),
      dispose: () => {
        disposed += 1;
      },
    };
    const workspace = {
      path: `/virtual/delayed-${phase}`,
      cleanup: () => {
        cleaned += 1;
      },
    };
    const evaluation = runEvaluation({
      candidate: {
        id: `delayed-${phase}`,
        createRuntime: () => {
          if (phase === "factory") {
            entered.resolve();
            return gate.promise as Promise<EvaluationRuntime>;
          }
          return runtime;
        },
      },
      tasks: {
        schemaVersion: 1,
        tasks: [
          {
            id: `held-out-delayed-${phase}`,
            split: "held-out",
            prompt: phase,
            expectedPublicEvidence: { includes: ["42"] },
            candidatePublicEvidence: ["42"],
            expectedVerdict: "pass",
          },
        ],
      },
      signal: controller.signal,
      workspaceFactory: () => {
        if (phase === "workspace") {
          entered.resolve();
          return gate.promise as Promise<typeof workspace>;
        }
        return workspace;
      },
    });

    await entered.promise;
    controller.abort(`cancel delayed ${phase}`);
    gate.resolve(phase === "workspace" ? workspace : runtime);
    await expect(evaluation).rejects.toMatchObject({
      code: "EVALUATION_CANCELLED",
    });
    expect(cleaned).toBe(1);
    expect(disposed).toBe(phase === "factory" ? 1 : 0);
  }
});

test("promotes dispose and workspace cleanup failures to aggregated infrastructure errors", async () => {
  const workspaceFactory: EvaluationWorkspaceFactory = () => ({
    path: "/virtual/cleanup",
    cleanup: () => {
      throw Object.assign(new Error("cleanup path secret"), {
        code: "CLEANUP_SECRET",
      });
    },
  });
  let disposed = 0;
  const evaluation = runEvaluation({
    candidate: {
      id: "cleanup-failure",
      createRuntime: () => ({
        run: () => {
          throw new Error("runtime secret");
        },
        dispose: () => {
          disposed += 1;
          throw new Error("dispose secret");
        },
      }),
    },
    tasks: await fixture(),
    workspaceFactory,
  });

  await expect(evaluation).rejects.toSatisfy((error: unknown) => {
    expect(error).toBeInstanceOf(EvaluationInfrastructureError);
    expect(error).toMatchObject({ code: "EVALUATION_CLEANUP_FAILED" });
    expect((error as Error).cause).toBeInstanceOf(AggregateError);
    return true;
  });
  expect(disposed).toBe(1);
});

test("serializes a deterministic allowlist and rejects unsafe metrics", async () => {
  const report = await runEvaluation({
    candidate: fixtureCandidate("serializer"),
    tasks: await fixture(),
  });
  const withSecrets = {
    ...report,
    prompt: "do not serialize",
    transcript: ["do not serialize"],
    toolOutput: "do not serialize",
    fileContents: "do not serialize",
    runs: report.runs.map((run) => ({
      ...run,
      prompt: "do not serialize",
      transcript: ["do not serialize"],
      toolOutput: "do not serialize",
      fileContents: "do not serialize",
    })),
  };
  const first = serializeEvaluationReport(withSecrets);
  const second = serializeEvaluationReport(withSecrets);
  expect(first).toBe(second);
  expect(first).not.toContain("do not serialize");
  expect(Object.keys(JSON.parse(first) as object)).toEqual([
    "candidateId",
    "runs",
    "publicMetrics",
  ]);

  const unsafe = {
    ...report,
    runs: [
      {
        ...report.runs[0],
        publicMetrics: { unsafe: Number.NaN },
      },
    ],
  };
  expect(() => serializeEvaluationReport(unsafe)).toThrowError(
    expect.objectContaining({ code: "EVALUATION_INVALID_REPORT" }),
  );

  const hostileMetrics = Object.create(null) as Record<string, number>;
  Object.defineProperty(hostileMetrics, "secret", {
    enumerable: true,
    get() {
      throw new Error("getter secret");
    },
  });
  expect(() =>
    serializeEvaluationReport({
      ...report,
      runs: [{ ...report.runs[0], publicMetrics: hostileMetrics }],
    }),
  ).toThrowError(
    expect.objectContaining({ code: "EVALUATION_INVALID_REPORT" }),
  );
});

test("shares cancellation across concurrent workers and fails fast without hanging", async () => {
  const peerEntered = deferred<void>();
  let peerAborted = false;
  const disposed: string[] = [];
  const cleaned: string[] = [];
  const signals: AbortSignal[] = [];
  const workspaceSignals: AbortSignal[] = [];
  const evaluation = runEvaluation({
    candidate: {
      id: "fail-fast",
      createRuntime: ({ taskId, signal }) => {
        signals.push(signal);
        return {
          async run({ signal: runSignal }) {
            expect(runSignal).toBe(signal);
            if (taskId.endsWith("first")) {
              await peerEntered.promise;
              throw new Error("primary infrastructure failure");
            }
            peerEntered.resolve();
            signal.addEventListener(
              "abort",
              () => {
                peerAborted = true;
              },
              { once: true },
            );
            await Promise.resolve();
            await Promise.resolve();
            return { status: "completed", publicEvidence: ["42"] };
          },
          dispose: () => {
            disposed.push(taskId);
            return new Promise<never>(() => undefined);
          },
        };
      },
    },
    tasks: {
      schemaVersion: 1,
      tasks: [
        {
          id: "held-out-first",
          split: "held-out",
          prompt: "first",
          expectedPublicEvidence: { includes: ["42"] },
          candidatePublicEvidence: ["42"],
          expectedVerdict: "pass",
        },
        {
          id: "held-out-peer",
          split: "held-out",
          prompt: "peer",
          expectedPublicEvidence: { includes: ["42"] },
          candidatePublicEvidence: ["42"],
          expectedVerdict: "pass",
        },
      ],
    },
    concurrency: 2,
    workspaceFactory: ({ taskId, signal }) => {
      workspaceSignals.push(signal);
      return {
        path: `/virtual/${taskId}`,
        cleanup: () => {
          cleaned.push(taskId);
          return new Promise<never>(() => undefined);
        },
      };
    },
  });

  await expect(evaluation).rejects.toMatchObject({
    code: "EVALUATION_RUNTIME_FAILED",
  });
  expect(peerAborted).toBe(true);
  expect(signals).toHaveLength(2);
  expect(signals[0]).toBe(signals[1]);
  expect(workspaceSignals).toEqual(signals);
  expect(signals[0].aborted).toBe(true);
  expect(disposed.sort()).toEqual(["held-out-first", "held-out-peer"]);
  expect(cleaned.sort()).toEqual(["held-out-first", "held-out-peer"]);
});

test("external cancellation settles ignored factories promptly and cleans late values", async () => {
  for (const phase of ["workspace", "runtime"] as const) {
    const controller = new AbortController();
    const entered = deferred<void>();
    const gate = deferred<unknown>();
    const lateCleanup = deferred<void>();
    let cleaned = 0;
    let disposed = 0;
    const workspace = {
      path: `/virtual/late-${phase}`,
      cleanup: () => {
        cleaned += 1;
        lateCleanup.resolve();
      },
    };
    const runtime: EvaluationRuntime = {
      run: () => ({ status: "completed", publicEvidence: ["42"] }),
      dispose: () => {
        disposed += 1;
        lateCleanup.resolve();
      },
    };
    const evaluation = runEvaluation({
      candidate: {
        id: `late-${phase}`,
        createRuntime: () => {
          if (phase === "runtime") {
            entered.resolve();
            return gate.promise as Promise<EvaluationRuntime>;
          }
          return runtime;
        },
      },
      tasks: singleTask(`held-out-late-${phase}`),
      signal: controller.signal,
      workspaceFactory: () => {
        if (phase === "workspace") {
          entered.resolve();
          return gate.promise as Promise<typeof workspace>;
        }
        return workspace;
      },
    });

    await entered.promise;
    controller.abort(`stop ${phase}`);
    let settled = false;
    void evaluation.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );
    await new Promise<void>((resolve) => setImmediate(resolve));
    const settledBeforeFactory = settled;
    gate.resolve(phase === "workspace" ? workspace : runtime);
    await expect(evaluation).rejects.toMatchObject({
      code: "EVALUATION_CANCELLED",
    });
    await lateCleanup.promise;
    expect(settledBeforeFactory).toBe(true);
    expect(cleaned).toBe(1);
    expect(disposed).toBe(phase === "runtime" ? 1 : 0);
  }
});

test("registers cleanup ownership before validating workspace and runtime shape", async () => {
  let invalidWorkspaceCleaned = 0;
  await expect(
    runEvaluation({
      candidate: fixtureCandidate("invalid-workspace"),
      tasks: singleTask("held-out-invalid-workspace"),
      workspaceFactory: () => ({
        path: "",
        cleanup: () => {
          invalidWorkspaceCleaned += 1;
        },
      }),
    }),
  ).rejects.toMatchObject({ code: "EVALUATION_WORKSPACE_FAILED" });
  expect(invalidWorkspaceCleaned).toBe(1);

  let invalidRuntimeDisposed = 0;
  let runtimeWorkspaceCleaned = 0;
  await expect(
    runEvaluation({
      candidate: {
        id: "invalid-runtime",
        createRuntime: () =>
          ({
            run: 42,
            dispose: () => {
              invalidRuntimeDisposed += 1;
            },
          }) as unknown as EvaluationRuntime,
      },
      tasks: singleTask("held-out-invalid-runtime"),
      workspaceFactory: () => ({
        path: "/virtual/invalid-runtime",
        cleanup: () => {
          runtimeWorkspaceCleaned += 1;
        },
      }),
    }),
  ).rejects.toMatchObject({ code: "EVALUATION_RUNTIME_FACTORY_FAILED" });
  expect(invalidRuntimeDisposed).toBe(1);
  expect(runtimeWorkspaceCleaned).toBe(1);
});

test("manual report serialization ignores every toJSON hook and rejects proxies", async () => {
  const report = await runEvaluation({
    candidate: fixtureCandidate("manual-json"),
    tasks: await fixture(),
  });
  const objectDescriptor = Object.getOwnPropertyDescriptor(
    Object.prototype,
    "toJSON",
  );
  const arrayDescriptor = Object.getOwnPropertyDescriptor(
    Array.prototype,
    "toJSON",
  );
  let hooks = 0;
  const poisoned = { ...report } as EvaluationReport & {
    toJSON?: () => unknown;
  };
  Object.defineProperty(poisoned, "toJSON", {
    configurable: true,
    enumerable: true,
    value: () => {
      hooks += 1;
      return { transcript: "own hook leak" };
    },
  });
  try {
    Object.defineProperty(Object.prototype, "toJSON", {
      configurable: true,
      value: () => {
        hooks += 1;
        return { prompt: "prototype object leak" };
      },
    });
    Object.defineProperty(Array.prototype, "toJSON", {
      configurable: true,
      value: () => {
        hooks += 1;
        return ["prototype array leak"];
      },
    });
    const serialized = serializeEvaluationReport(poisoned);
    expect(hooks).toBe(0);
    expect(serialized).not.toContain("leak");
    expect(JSON.parse(serialized)).toMatchObject({
      candidateId: "manual-json",
    });
  } finally {
    if (objectDescriptor === undefined) {
      Reflect.deleteProperty(Object.prototype, "toJSON");
    } else {
      Object.defineProperty(Object.prototype, "toJSON", objectDescriptor);
    }
    if (arrayDescriptor === undefined) {
      Reflect.deleteProperty(Array.prototype, "toJSON");
    } else {
      Object.defineProperty(Array.prototype, "toJSON", arrayDescriptor);
    }
  }

  const proxy = new Proxy(report, {
    get() {
      throw new Error("proxy transcript leak");
    },
  });
  expect(() => serializeEvaluationReport(proxy)).toThrowError(
    expect.objectContaining({ code: "EVALUATION_INVALID_REPORT" }),
  );
});

test("rejects duplicate report identities and compares exact identity sets", async () => {
  const baseline = await runEvaluation({
    candidate: fixtureCandidate("identity-baseline"),
    tasks: await fixture(),
  });
  const duplicate = {
    candidateId: baseline.candidateId,
    runs: [baseline.runs[0], baseline.runs[0]],
    publicMetrics: {
      totalRuns: 2,
      passedRuns: 2,
      failedRuns: 0,
      errorRuns: 0,
      passRate: 1,
      failRate: 0,
      errorRate: 0,
    },
  };
  expect(() => serializeEvaluationReport(duplicate)).toThrowError(
    expect.objectContaining({ code: "EVALUATION_INVALID_REPORT" }),
  );
  expect(() => compareEvaluations(baseline, duplicate)).toThrowError(
    expect.objectContaining({ code: "EVALUATION_INVALID_REPORT" }),
  );

  const candidate = await runEvaluation({
    candidate: fixtureCandidate("identity-candidate"),
    tasks: await fixture(),
  });
  const reordered = {
    ...candidate,
    runs: [candidate.runs[1], candidate.runs[0]],
  };
  expect(
    compareEvaluations(baseline, reordered).runs.map((run) => run.runId),
  ).toEqual(["run-000001", "run-000002"]);
});

test("bounds total evaluation and evidence work and rejects duplicate requirements", async () => {
  expect(MAX_EVALUATION_RUNS).toBe(4_096);
  expect(MAX_EVIDENCE_ITEMS).toBe(32);
  const tasks = Array.from({ length: 65 }, (_, index) => ({
    id: `held-out-budget-${String(index).padStart(3, "0")}`,
    split: "held-out",
    prompt: "budget",
    expectedPublicEvidence: { includes: ["42"] },
    candidatePublicEvidence: ["42"],
    expectedVerdict: "pass",
  }));
  await expect(
    runEvaluation({
      candidate: fixtureCandidate("run-budget"),
      tasks: { schemaVersion: 1, tasks },
      repetitions: 64,
    }),
  ).rejects.toMatchObject({ code: "EVALUATION_INVALID_OPTIONS" });

  expect(() =>
    loadEvaluationTasks({
      schemaVersion: 1,
      tasks: [
        {
          id: "held-out-duplicate-evidence",
          split: "held-out",
          prompt: "duplicate",
          expectedPublicEvidence: { includes: ["42", "42"] },
          candidatePublicEvidence: ["42"],
          expectedVerdict: "pass",
        },
      ],
    }),
  ).toThrow(/duplicate required evidence/u);

  await expect(
    runEvaluation({
      candidate: {
        id: "candidate-evidence-budget",
        createRuntime: () =>
          completedRuntime(() =>
            Array.from({ length: MAX_EVIDENCE_ITEMS + 1 }, () => "42"),
          ),
      },
      tasks: singleTask("held-out-candidate-budget"),
    }),
  ).rejects.toMatchObject({ code: "EVALUATION_RUNTIME_FAILED" });
});

test("default judge uses bounded set membership and observes cancellation while matching", async () => {
  const report = await runEvaluation({
    candidate: {
      id: "set-judge",
      createRuntime: () => completedRuntime(() => ["42", "42"]),
    },
    tasks: singleTask("held-out-set-judge", ["42", "15"]),
  });
  expect(report.runs[0]).toMatchObject({
    verdict: "fail",
    publicMetrics: {
      requiredEvidence: 2,
      matchedEvidence: 1,
    },
  });
});

test("composes source metric caps and classifies composition as judge infrastructure", async () => {
  expect(MAX_SOURCE_METRICS).toBe(64);
  expect(MAX_REPORT_METRICS).toBe(128);
  const runtimeMetrics = Object.fromEntries(
    Array.from({ length: MAX_SOURCE_METRICS }, (_, index) => [
      `runtime${String(index).padStart(2, "0")}`,
      index,
    ]),
  );
  const report = await runEvaluation({
    candidate: {
      id: "metric-cap",
      createRuntime: () => ({
        run: () => ({
          status: "completed",
          publicEvidence: ["42"],
          publicMetrics: runtimeMetrics,
        }),
        dispose: () => undefined,
      }),
    },
    tasks: singleTask("held-out-metric-cap"),
  });
  expect(Object.keys(report.runs[0].publicMetrics)).toHaveLength(66);
  expect(Object.keys(report.runs[0].publicMetrics)).toEqual(
    [...Object.keys(report.runs[0].publicMetrics)].sort(),
  );

  const invalidJudgeMetrics: Readonly<Record<string, number>>[] = [
    { runtime00: 1 },
    { invalid: Number.NaN },
  ];
  for (const judgeMetrics of invalidJudgeMetrics) {
    await expect(
      runEvaluation({
        candidate: {
          id: "metric-judge-failure",
          createRuntime: () => ({
            run: () => ({
              status: "completed",
              publicEvidence: ["42"],
              publicMetrics: { runtime00: 0 },
            }),
            dispose: () => undefined,
          }),
        },
        tasks: singleTask("held-out-metric-judge-failure"),
        judge: {
          judge: () => ({ verdict: "pass", publicMetrics: judgeMetrics }),
        },
      }),
    ).rejects.toMatchObject({ code: "EVALUATION_JUDGE_FAILED" });
  }

  const tooManyReportMetrics = Object.fromEntries(
    Array.from({ length: MAX_REPORT_METRICS + 1 }, (_, index) => [
      `report${String(index).padStart(3, "0")}`,
      index,
    ]),
  );
  expect(() =>
    serializeEvaluationReport({
      ...report,
      runs: [{ ...report.runs[0], publicMetrics: tooManyReportMetrics }],
    }),
  ).toThrowError(
    expect.objectContaining({ code: "EVALUATION_INVALID_REPORT" }),
  );
});
