import { access, readFile } from "node:fs/promises";

import { expect, test } from "vitest";

import {
  EvaluationInfrastructureError,
  compareEvaluations,
  deterministicEvaluationJudge,
  loadEvaluationTasks,
  runEvaluation,
  serializeEvaluationReport,
  type EvaluationCandidate,
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
  expect(() => serializeEvaluationReport(unsafe)).toThrow(/finite/u);

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
  ).toThrow(/metrics/u);
});
