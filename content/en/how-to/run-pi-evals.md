---
title: Run Pi evals from a pinned source checkout
description: Run smoke and comparative Pi coding-agent evals, interpret judges and telemetry, and handle artifacts safely.
translation_key: how-to-run-pi-evals
language: en
source_url: "https://docs.pify.dev/en/how-to/run-pi-evals"
official_refs:
  - "https://github.com/earendil-works/pi/blob/f07218c4d4bbc12bef056a7058c3dd49dfe41abe/packages/evals/README.md"
  - "https://github.com/earendil-works/pi/blob/f07218c4d4bbc12bef056a7058c3dd49dfe41abe/packages/evals/evals/smoke.eval.ts"
  - "https://github.com/earendil-works/pi/blob/f07218c4d4bbc12bef056a7058c3dd49dfe41abe/packages/evals/src/harness.ts"
  - "https://github.com/earendil-works/pi/blob/f07218c4d4bbc12bef056a7058c3dd49dfe41abe/packages/evals/src/plan.ts"
  - "https://github.com/earendil-works/pi/blob/f07218c4d4bbc12bef056a7058c3dd49dfe41abe/packages/evals/src/report.ts"
  - "https://github.com/earendil-works/pi/blob/f07218c4d4bbc12bef056a7058c3dd49dfe41abe/packages/evals/src/cli.ts"
terms_used:
  - harness
  - judge
  - verdict
  - fixture
  - held-out evaluation
  - fail-closed
status: reviewed
reviewed_by: Pify maintainers
last_updated: '2026-09-23'
translator: Pify maintainers
---

Pi's eval package measures end-to-end Coding Agent behavior against real models. It adapts a real `AgentSession` to `vitest-evals`, creates an isolated temporary project and agent directory for every run, and retains native Pi session evidence after the temporary workspace is removed.

`packages/evals` is a private monorepo package, not an npm install target. Run it only from a Pi source checkout pinned to the release below. Do not add `@earendil-works/pi-evals` to an application dependency list or assume its internal modules are public SDK contracts.

## Outcome

By the end of this guide, you will be able to:

- run the release's one-case smoke eval against an explicitly selected provider and model;
- explain what the Pi coding-agent harness isolates, records, and cleans up;
- use a deterministic judge for machine-checkable behavior and reserve a model-backed judge for subjective criteria;
- compare a baseline with a candidate over deliberate repetitions;
- separate an infrastructure error from a task verdict;
- interpret token, latency, estimated-cost telemetry and inspect artifacts without exposing them;
- remove the default generated artifact directory through the pinned package's own cleanup script.

:::caution[Optional model-backed execution, cost, and sensitive evidence]

Model-backed execution is optional in your project; keep deterministic unit and integration tests as the required offline gate. Each executed harness run can spend provider cost, and a model-backed judge can add another request. The generated directory contains sensitive session artifacts: prompts, responses, source code, Tool input, and Tool output may include credentials or proprietary data. Use synthetic fixtures, set a budget, restrict access, inspect before sharing, and redact or delete raw evidence when retention is not required.

:::

## 1. Check out the exact release source

Use Node.js `>=22.19.0`. The following block is the complete checkout boundary for this guide:

```bash
git clone https://github.com/earendil-works/pi.git
cd pi
git checkout f07218c4d4bbc12bef056a7058c3dd49dfe41abe
npm install
```

The root install hydrates the monorepo workspaces and their lockfile. At this commit, `packages/evals/package.json` declares `private: true`. Its relevant scripts are `eval`, `eval:host`, `eval:docs`, `test`, and `clean`. The commands below use npm's `-w packages/evals` workspace selector from the repository root so the execution mode stays explicit.

Before spending a provider request, confirm `git rev-parse HEAD` prints `f07218c4d4bbc12bef056a7058c3dd49dfe41abe`. If it does not, stop: flags, report formats, and artifact behavior from another commit are outside this guide's release contract.

## 2. Run one smoke eval

The pinned host smoke eval in `evals/smoke.eval.ts` disables all Tools and asks for the capital of France. It hard-asserts the exact trimmed answer `Paris`, an empty harness-error list, the selected provider and model, and a positive token count. Run only that file first:

```bash
PI_PROVIDER=openai-codex PI_MODEL=gpt-5.6-sol npm run eval:host -w packages/evals -- evals/smoke.eval.ts
```

Replace the environment pair with one available through Pi's normal `ModelRuntime`. Both `PI_PROVIDER` and `PI_MODEL` are required by the harness when no explicit model is configured. Authentication comes from Pi's stored subscription credential or the provider's normal API-key environment variable; the eval package does not define a separate credential store.

The host runner forwards file and test filters to Vitest. To select the exact smoke case as well as its file, use:

```bash
PI_PROVIDER=openai-codex PI_MODEL=gpt-5.6-sol npm run eval:host -w packages/evals -- evals/smoke.eval.ts -t "returns the expected answer"
```

This host path runs Vitest directly and does not produce the paired documentation-comparison report described later. A non-zero command exit means the smoke run did not satisfy its hard assertions or infrastructure contract; it is not automatically evidence that a documentation treatment scored poorly.

## 3. Understand the Pi coding-agent harness

The Pi coding-agent harness comes from `createPiCodingAgentHarness(...)`, the Pi-specific bridge to `vitest-evals`. One `describeEval(...)` suite owns one harness. The release implementation performs these boundaries for every run:

1. resolve either the harness's explicit `{ provider, id }` model or the paired `PI_PROVIDER`/`PI_MODEL` default;
2. create a new temporary root with separate `workspace`, `agent`, and `sessions` locations;
3. construct `ModelRuntime`, in-memory settings, services, `SessionManager`, and a real `AgentSession`;
4. reject unexpected preloaded Extensions so ambient user configuration cannot contaminate the fixture;
5. accept one prompt or a sequence of `prompt` and `reload` steps, then require a final assistant message whose `stopReason` is `"stop"` or `"toolUse"`; only the `"stop"` case must contain non-empty text;
6. normalize messages, Tool calls, and Tool results into trace events, and report usage and elapsed time;
7. snapshot the native session JSONL, dispose the session, and recursively remove the temporary root even when execution fails.

Harness options have intentionally narrow roles:

| Option | Use | Reproducibility rule |
| --- | --- | --- |
| `name` | Stable identity in reports and comparisons | Make names unique within one eval set; do not include timestamps |
| `model` | Explicit `{ provider, id }` selection | Prefer it when baseline and candidate intentionally use different models |
| `noTools` | Pi Tool-disable configuration | Disable unrelated Tools so they cannot change the experiment |
| `transformSystemPrompt` | Transform the complete default System Prompt | Keep the transform pure and version-controlled |
| `output` | Produce a JSON-safe domain result from response and session | Expose only fields the judge needs; keep raw evidence in artifacts |

An input can contain `reload` between prompts. That is useful when the first prompt creates an Extension, Skill, or setting and the next prompt must observe the reloaded runtime. The harness still owns the same isolated run and records the full linked session.

## 4. Choose a judge before looking at results

A judge converts one harness result into a score and optional rationale. Define the judge and its acceptance boundary before inspecting the candidate output; otherwise the rubric can overfit the same observations it is supposed to assess.

### Deterministic judge

Prefer a deterministic judge whenever correctness can be derived from JSON-safe output or the normalized trace. It is cheap, repeatable, reviewable, and appropriate for exact output, schema validity, Tool name and arguments, created files, loader errors, or other machine-checkable invariants.

The tagged documentation evals use `StructuredOutputJudge(...)` and `ToolCallJudge(...)` from `vitest-evals`. A small strict judge can compare a JSON-safe projection from the harness:

```typescript
import { StructuredOutputJudge } from "vitest-evals";

const ExactAnswerJudge = StructuredOutputJudge({
  expected: { answer: "Paris" },
  match: "strict",
  allowExtras: false,
});
```

Use hard `expect(...)` assertions for fixture integrity and infrastructure contracts, not as a scoring substitute. `expect.soft(...)` still fails a Vitest task; it does not create a judge observation.

### Optional model-backed judge

A model-backed judge is appropriate only when the rubric needs semantic quality that a deterministic predicate cannot express reliably, such as whether an explanation is faithful, useful, and complete. Model-backed evaluation is optional: start with a reviewed rubric and a small held-out evaluation set, calibrate it against human verdicts, pin the judge model and settings, and record its version with the run.

The Pi package supplies the Coding Agent harness and imports judge implementations from `vitest-evals`; a custom or model-backed judge belongs to that library or your evaluation code. Do not invent a Pi API for it. A judge request receives potentially sensitive output and adds nondeterminism, latency, and cost, so never make it the only fail-closed safety check. Where possible, combine deterministic contract checks with the subjective score and periodically re-review disagreement cases.

## 5. Compare baseline and candidate with repetitions

Pi 0.87.1 has a dedicated documentation comparison instead of asking each eval file to build its own baseline/candidate table. The runner builds two images: `without_docs` is the control and `with_docs` is the treatment. Both install the same local workspace packages and run the same discovered `*.docs.eval.ts` cases with the same provider/model and judge definitions. The treatment keeps Pi documentation; the control removes the coding-agent documentation surfaces and the corresponding default-prompt section.

```typescript
const harness = createPiDocumentationEvalHarness({
  output: ({ response, session }) => ({
    response,
    toolCalls: session.getSessionStats().toolCalls,
  }),
});

describeEval(
  "target skill effectiveness",
  {
    harness,
    judges: [TargetTaskJudge],
    judgeThreshold: null,
  },
  (it) => {
    it("completes the target task", async ({ run }) => {
      await run("Complete the target task.");
    });
  },
);
```

`createPiDocumentationEvalHarness()` is valid only inside the isolated container runner. It exposes `read`, `write`, `edit`, `grep`, `find`, and `ls` by default, not shell or unrestricted web-search Tools. Discovery must produce identical case cohorts in both images. The plan then expands each case into `(case, variant, model, runNumber)` tasks and alternates variant order by run number to reduce order bias.

Keep `judgeThreshold: null` for comparison suites. A valid low score remains a task observation instead of failing the arm as infrastructure. `--runs-per-variant` must be a positive integer and defaults to `1`; increase it deliberately because each value schedules both variants again.

Run the pinned Extension documentation comparison after the host smoke case:

```bash
npm run eval:docs -w packages/evals -- evals/extensions.docs.eval.ts --provider openai-codex --model gpt-5.6-sol --runs-per-variant 5
```

The CLI requires `--provider` and `--model` together when either appears; otherwise it reads the paired `PI_PROVIDER`/`PI_MODEL` variables. It accepts only `*.docs.eval.ts` files plus `-t`/`--testNamePattern` discovery filters. Keep the exact release source, case identity, model, run number, and protocol digest with the result. Do not compare unrelated ad hoc runs or silently discard a blocked arm.

## 6. Separate task verdicts from infrastructure errors

A task verdict answers “did the Agent satisfy the rubric?” An infrastructure error answers “was there a valid observation to score?” Keeping them separate prevents a provider outage or cleanup failure from becoming a false zero for the product behavior.

| Signal | Classification | Action |
| --- | --- | --- |
| Deterministic or model-backed judge returns a valid low score | Task verdict | Keep the observation; inspect rationale and compare paired pass rates |
| Model is absent, credential resolution fails, run aborts, or assistant has an unexpected stop reason | Infrastructure error | Fix the environment and rerun; do not score it as task failure |
| Harness returns `errors` or cleanup throws | Infrastructure error | Preserve diagnostics, repair the fixture or runtime, then rerun |
| An expected arm is missing or duplicated, or its outcome is `unscored`, `skipped`, `pending`, or `errored` | Blocked pair | Do not infer lift from that eval set; investigate the named arm |
| A hard suite-invariant assertion fails | Infrastructure/fixture contract failure | Correct the eval definition before interpreting candidate quality |

`report.ts` pairs exactly one `without_docs` and one `with_docs` observation for the same eval set, case ID, model, and run number. Any invalid cohort becomes a blocked-pair reason rather than an invented score. If an eval set has a blocked pair, its headline pass rates and lift are withheld; if any pair is blocked, the documentation CLI exits nonzero after writing the report.

## 7. Read telemetry and comparison output

The Pi harness records provider/model identity, input and output tokens, total tokens, Tool-call count, cache token metadata, and total elapsed milliseconds. It adds `estimatedCostUsd` only when the selected model has non-zero pricing metadata. “Unavailable” is therefore different from zero cost.

| Report field | Meaning | Interpretation limit |
| --- | --- | --- |
| Pass-rate lift | `with_docs` pass rate minus `without_docs` pass rate | Published only when every planned pair in the eval set is eligible |
| Tokens | Treatment-minus-control mean `totalTokens` | Missing telemetry reduces metric-pair coverage |
| Tools | Treatment-minus-control mean Tool-call count | A lower count is not automatically a better task result |
| Latency | Treatment-minus-control mean `totalMs` | Provider load and network conditions can dominate small samples |
| Estimated cost | Treatment-minus-control mean `estimatedCostUsd` | Available only when model pricing metadata is populated |
| Blocked pairs | Missing, duplicate, errored, skipped, pending, or unscored arms | Resolve them before relying on headline correctness |

Read direction and coverage together. `report.txt` prints paired deltas plus operational totals for both variants; `report.json` preserves the schema, `protocolDigest`, comparisons, blocked pairs, and totals. A positive correctness lift may still cost more tokens or latency. Record the release SHA, provider/model IDs, documentation change, judge definition, input-set revision, repetitions, and artifact directory so another reviewer can reproduce the comparison.

## 8. Inspect, redact, and retain artifacts safely

The documentation runner creates `packages/evals/.eval/<timestamp>_<uuid>/` and prints that resolved path. Pi 0.87.1 does not expose a public CLI option for a custom artifact root. The directory contains:

| Path | Contents | Handling |
| --- | --- | --- |
| `protocol.json` | Model, image IDs, selected files, discovered cases, task plan, and `protocolDigest` | Keep it with every comparison report |
| `expected-runs.json` | Complete planned `(case, variant, model, runNumber)` cohort | Use it to account for missing or duplicate arms |
| `observations.jsonl` | Normalized outcome and available telemetry for each completed task | Inspect outcomes before reading headline lift |
| `tasks/*/vitest.json` | Native Vitest JSON produced by each isolated arm | Treat errors and raw harness evidence as sensitive |
| `<variant>/sessions/*/session.jsonl` | Native Pi session snapshot retained for an arm | Treat as sensitive transcript and Tool evidence |
| `report.json` and `report.txt` | Machine-readable and printed paired comparisons | Share only after checking blocked pairs and redaction |

The CLI creates the run directory with owner-only mode `0700`, and retained session snapshots are written with `0600` where the platform honors POSIX modes. Do not assume every Docker or report file has the same mode. Permissions reduce accidental access but are not redaction. Before sharing, copy only the evidence needed for review, remove secrets and personal or proprietary content from that copy, preserve the protocol digest and release metadata, and have a second reviewer verify the redaction. Never edit an artifact and then present it as untouched raw evidence.

Keep artifacts only for an explicit retention period. If a run processed real repository content, store retained evidence in an access-controlled location rather than committing `.eval`; the release package's `.gitignore` excludes that directory by default.

## 9. Clean up safely

First finish inspection or copy the intentionally retained, redacted evidence. Then run the private workspace's pinned cleanup script from the repository root:

```bash
npm run clean --workspace=@earendil-works/pi-evals
```

At the pinned commit this delegates to `shx rm -rf .eval` with `packages/evals` as the workspace. The fixed script only removes `packages/evals/.eval`. It does not accept a custom artifact path. The harness has already removed each temporary project/agent root; this command removes the durable protocol, observations, reports, task output, and retained session snapshots under the fixed run root.

Finish review and copy only approved, redacted evidence before running cleanup. Apply your retention policy to those copies separately. Do not replace the pinned script with a recursive command aimed at an unresolved environment value, repository root, home directory, or broad parent directory.

For automation, clean up in a final step that runs on both success and failure, but upload only approved redacted outputs. Do not log session contents or secret-bearing environment variables as part of cleanup diagnostics.

## Source map for Pi 0.87.1

Every link below is pinned to release commit `f07218c4d4bbc12bef056a7058c3dd49dfe41abe`:

| Source | What to verify |
| --- | --- |
| [`packages/evals/README.md`](https://github.com/earendil-works/pi/blob/f07218c4d4bbc12bef056a7058c3dd49dfe41abe/packages/evals/README.md) | Host/documentation runner commands, isolation model, results, and artifact warning |
| [`evals/smoke.eval.ts`](https://github.com/earendil-works/pi/blob/f07218c4d4bbc12bef056a7058c3dd49dfe41abe/packages/evals/evals/smoke.eval.ts) | End-to-end host smoke prompt and hard infrastructure assertions |
| [`src/harness.ts`](https://github.com/earendil-works/pi/blob/f07218c4d4bbc12bef056a7058c3dd49dfe41abe/packages/evals/src/harness.ts) | Model resolution, isolated session lifecycle, traces, telemetry, snapshot, and temporary cleanup |
| [`src/plan.ts`](https://github.com/earendil-works/pi/blob/f07218c4d4bbc12bef056a7058c3dd49dfe41abe/packages/evals/src/plan.ts) | Variant identities, case parsing, repeated task planning, and alternating order |
| [`src/report.ts`](https://github.com/earendil-works/pi/blob/f07218c4d4bbc12bef056a7058c3dd49dfe41abe/packages/evals/src/report.ts) | Observation validation, blocked pairs, telemetry deltas, session retention, and report formatting |
| [`src/cli.ts`](https://github.com/earendil-works/pi/blob/f07218c4d4bbc12bef056a7058c3dd49dfe41abe/packages/evals/src/cli.ts) | CLI validation, Docker orchestration, protocol/artifact writing, and nonzero blocked-pair exit |

## Acceptance checklist

- [ ] The checkout is at exact commit `f07218c4d4bbc12bef056a7058c3dd49dfe41abe` and Node.js is `>=22.19.0`.
- [ ] The eval runs from the Pi monorepo; no application attempts to install the private eval workspace as a public package.
- [ ] Host evals receive the paired `PI_PROVIDER`/`PI_MODEL`; documentation CLI flags `--provider`/`--model` are also supplied together.
- [ ] The host smoke eval passes before the containerized documentation comparison runs.
- [ ] Case IDs, variant, model, judge definition, run number, and protocol digest are stable and recorded.
- [ ] Deterministic judges cover machine-checkable contracts; any optional model-backed judge has a reviewed rubric and budget.
- [ ] Documentation suites keep `judgeThreshold: null`, use `without_docs`/`with_docs`, and distinguish a task verdict from an infrastructure error.
- [ ] Telemetry is interpreted with eligible-pair coverage and unavailable values, not only the headline delta.
- [ ] Sensitive artifacts are access-controlled, reviewed, redacted before sharing, and assigned a retention period.
- [ ] Fixed-root `.eval` cleanup runs only after the required evidence has been retained safely under the chosen retention policy.
