---
title: Run Pi evals from a pinned source checkout
description: Run smoke and comparative Pi coding-agent evals, interpret judges and telemetry, and handle artifacts safely.
translation_key: how-to-run-pi-evals
language: en
source_url: "https://docs.pify.dev/en/how-to/run-pi-evals"
official_refs:
  - "https://github.com/earendil-works/pi/blob/107d79f11072bbc8a3a757ed7fd69596bee7d68c/packages/evals/README.md"
  - "https://github.com/earendil-works/pi/blob/107d79f11072bbc8a3a757ed7fd69596bee7d68c/packages/evals/src/smoke.eval.ts"
  - "https://github.com/earendil-works/pi/blob/107d79f11072bbc8a3a757ed7fd69596bee7d68c/packages/evals/src/pi-harness.ts"
  - "https://github.com/earendil-works/pi/blob/107d79f11072bbc8a3a757ed7fd69596bee7d68c/packages/evals/src/vitest-evals/reporter.ts"
  - "https://github.com/earendil-works/pi/blob/107d79f11072bbc8a3a757ed7fd69596bee7d68c/packages/evals/src/vitest-evals/artifacts.ts"
  - "https://github.com/earendil-works/pi/blob/107d79f11072bbc8a3a757ed7fd69596bee7d68c/packages/evals/src/vitest-evals/summary.ts"
terms_used:
  - harness
  - judge
  - verdict
  - fixture
  - held-out evaluation
  - fail-closed
status: reviewed
reviewed_by: Pify maintainers
last_updated: '2026-09-04'
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
git checkout 107d79f11072bbc8a3a757ed7fd69596bee7d68c
npm install
```

The root install hydrates the monorepo workspaces and their lockfile. At this commit, `packages/evals/package.json` declares `private: true` and exposes exactly three package scripts: `eval`, `test`, and `clean`. The repository root delegates `npm run eval` to that workspace, so the remaining commands run from the repository root.

Before spending a provider request, confirm `git rev-parse HEAD` prints `107d79f11072bbc8a3a757ed7fd69596bee7d68c`. If it does not, stop: flags, report formats, and artifact behavior from another commit are outside this guide's release contract.

## 2. Run one smoke eval

The pinned smoke eval in `src/smoke.eval.ts` disables all Tools and asks for the capital of France. It hard-asserts the exact trimmed answer `Paris`, an empty harness-error list, the selected provider and model, and a positive token count. Run only that file first:

```bash
npm run eval -- --provider openai --model gpt-5.6-sol src/smoke.eval.ts
```

Replace the provider/model pair with one available through Pi's normal `ModelRuntime`. The two values are atomic: the runner rejects a CLI invocation that supplies only `--provider` or only `--model`. Authentication comes from Pi subscription credentials or the provider's normal API-key environment variable; the eval package does not define a separate credential store.

Arguments not consumed as `--provider` or `--model` are forwarded to Vitest. To select the exact smoke case as well as its file, use:

```bash
npm run eval -- --provider openai --model gpt-5.6-sol src/smoke.eval.ts -t "runs a basic prompt end to end"
```

The runner prints `default-model=<provider>/<model>` and the resolved artifact directory before Vitest starts. A non-zero command exit means the run did not satisfy its hard assertions or infrastructure contract; it is not automatically evidence that a candidate behavior scored poorly.

## 3. Understand the Pi coding-agent harness

The Pi coding-agent harness comes from `createPiCodingAgentHarness(...)`, the Pi-specific bridge to `vitest-evals`. One `describeEval(...)` suite owns one harness. The release implementation performs these boundaries for every run:

1. resolve either the harness's explicit `{ provider, id }` model or the paired `PI_PROVIDER`/`PI_MODEL` default;
2. create a new temporary root with separate `workspace`, `agent`, and `sessions` locations;
3. construct `ModelRuntime`, in-memory settings, services, `SessionManager`, and a real `AgentSession`;
4. reject unexpected preloaded Extensions so ambient user configuration cannot contaminate the fixture;
5. accept one prompt or a sequence of `prompt` and `reload` steps, then require a final assistant message with `stopReason: "stop"` and non-empty text;
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

The Pi release uses `createJudge(...)` and returns `1` only when all required conditions hold. A minimal form is:

```typescript
import { createJudge } from "vitest-evals";

const ExactAnswerJudge = createJudge<string, string>(
  "ExactAnswerJudge",
  ({ output }) => ({
    score: output.trim() === "Paris" ? 1 : 0,
    metadata: {
      rationale:
        output.trim() === "Paris"
          ? "Exact answer matched."
          : "Expected exactly Paris.",
    },
  }),
);
```

Use hard `expect(...)` assertions for fixture integrity and infrastructure contracts, not as a scoring substitute. `expect.soft(...)` still fails a Vitest task; it does not create a judge observation.

### Optional model-backed judge

A model-backed judge is appropriate only when the rubric needs semantic quality that a deterministic predicate cannot express reliably, such as whether an explanation is faithful, useful, and complete. Model-backed evaluation is optional: start with a reviewed rubric and a small held-out evaluation set, calibrate it against human verdicts, pin the judge model and settings, and record its version with the run.

The Pi package supplies the Coding Agent harness and reporter integration; the model-backed judge implementation belongs to `vitest-evals` or your evaluation code. Do not invent a Pi API for it. A judge request receives potentially sensitive output and adds nondeterminism, latency, and cost, so never make it the only fail-closed safety check. Where possible, combine deterministic contract checks with the subjective score and periodically re-review disagreement cases.

## 5. Compare baseline and candidate with repetitions

Use `evalHarnessTable(...)` with Vitest's `describe.for(...)` so the same input and judge run against the declared baseline and candidate. Give each harness a stable unique name. One candidate is declared with `candidate`; multiple treatments use `candidates`, and every treatment is paired only with the declared baseline.

```typescript
const harnessTable = evalHarnessTable("target skill effectiveness", {
  baseline: withoutTargetSkillHarness,
  candidate: withTargetSkillHarness,
  repetitions: 6,
});

describe.for(harnessTable)(
  "$name repetition $repetition",
  ({ harness }) => {
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
  },
);
```

`repetitions` must be a positive integer and defaults to `1`; increase it deliberately because each row executes the harness again. The grouping key combines the repetition with a non-empty `input.id`, or with a SHA-256 hash of strict canonical JSON input when no ID exists. Stable inputs and harness names let the reporter form valid pairs.

Set `judgeThreshold: null` for comparative suites. A low judge score then remains an observation for pass-rate comparison rather than turning the whole invocation into an infrastructure failure. The reporter treats an average judge score of at least `1` as passing and reports candidate pass-rate lift minus baseline pass rate in percentage points.

The release includes a larger baseline/candidate Extension experiment. Run it separately after the smoke case:

```bash
npm run eval -- --provider openai --model gpt-5.6-sol src/extensions.eval.ts
```

Do not compare one lucky candidate run with one unrelated baseline run. Use the same eval input, repetition index, judge definition, and release source. Add repetitions when model variance could change the verdict, and retain incomplete observations instead of silently dropping them.

## 6. Separate task verdicts from infrastructure errors

A task verdict answers “did the Agent satisfy the rubric?” An infrastructure error answers “was there a valid observation to score?” Keeping them separate prevents a provider outage or cleanup failure from becoming a false zero for the product behavior.

| Signal | Classification | Action |
| --- | --- | --- |
| Deterministic or model-backed judge returns a valid low score | Task verdict | Keep the observation; inspect rationale and compare paired pass rates |
| Model is absent, credential request fails, run aborts, or assistant ends without `stop` | Infrastructure error | Fix the environment and rerun; do not score it as task failure |
| Harness returns `errors` or cleanup throws | Infrastructure error | Preserve diagnostics, repair the fixture or runtime, then rerun |
| Reporter has `missing-score`, `missing-observation`, `duplicate-observation`, or `harness-error` | Incomplete comparison | Do not infer lift from the missing pair; investigate the named run |
| A hard suite-invariant assertion fails | Infrastructure/fixture contract failure | Correct the eval definition before interpreting candidate quality |

The summary module only pairs one baseline and one candidate observation for the same file, test, group key, and repetition. An errored, unscored, skipped, pending, missing, or duplicate observation becomes a diagnostic rather than an invented score. This fail-closed behavior keeps coverage visible.

## 7. Read telemetry and comparison output

The Pi harness records provider/model identity, input and output tokens, total tokens, Tool-call count, cache token metadata, and total elapsed milliseconds. It adds `estimatedCostUsd` only when the selected model has non-zero pricing metadata. “Unavailable” is therefore different from zero cost.

| Report field | Meaning | Interpretation limit |
| --- | --- | --- |
| Pass-rate lift | Candidate pass rate minus baseline pass rate | Needs matched, scored pairs; it is not causal proof by itself |
| Tokens | Candidate-minus-baseline mean `totalTokens` | Missing telemetry reduces eligible-pair coverage |
| Latency | Candidate-minus-baseline mean `totalMs` | Provider load and network conditions can dominate small samples |
| Estimated cost | Candidate-minus-baseline mean `estimatedCostUsd` | Available only when model pricing metadata is populated |
| Incomplete observations | Missing, duplicate, errored, or unscored rows | Resolve them before relying on the comparison |

Read direction and coverage together. A positive correctness lift may be useful even if token or latency deltas increase, but the trade-off must match the product goal. Record the release SHA, provider/model IDs, prompt or Tool change, judge definition, input-set revision, repetitions, and artifact directory so another reviewer can reproduce the comparison.

## 8. Inspect, redact, and retain artifacts safely

The runner creates `packages/evals/.eval/<timestamp>_<uuid>/` by default and prints the resolved path. `PI_EVAL_ARTIFACT_DIR` can override the directory; a relative value is resolved from `packages/evals`. The directory contains:

| Path | Contents | Handling |
| --- | --- | --- |
| `runs.jsonl` | One reporter record per completed harness run, including test identity, usage, timings, errors, metadata, and artifact references | Filter by `runId`; do not publish blindly |
| `sessions/<sha256(runId)>/session.jsonl` | Native Pi session snapshot captured before the temporary workspace is removed | Treat as sensitive transcript and Tool evidence |
| `sources/<sha256(runId)>/<name>` | Optional source attachment explicitly registered by an eval | Review for credentials, private paths, and proprietary code |

The runner creates artifact directories with owner-only mode `0700` and writes report/attachment files with `0600` where the platform honors POSIX modes. Permissions reduce accidental access but are not redaction. Before sharing, copy only the evidence needed for review, remove secrets and personal or proprietary content from that copy, preserve the original `runId` and release metadata, and have a second reviewer verify the redaction. Never edit an artifact and then present it as untouched raw evidence.

Keep artifacts only for an explicit retention period. If a run processed real repository content, store retained evidence in an access-controlled location rather than committing `.eval`; the release package's `.gitignore` excludes that directory by default.

## 9. Clean up safely

First finish inspection or copy the intentionally retained, redacted evidence. Then run the private workspace's pinned cleanup script from the repository root:

```bash
npm run clean --workspace=@earendil-works/pi-evals
```

At the pinned commit this delegates to `shx rm -rf .eval` with `packages/evals` as the workspace. The fixed script only removes the default `packages/evals/.eval` directory. It does not remove a relative or absolute directory selected through `PI_EVAL_ARTIFACT_DIR`. The harness has already removed each temporary project/agent root; this command removes only the default durable report and attachment directory.

Custom relative or absolute paths require separate, explicit, validated cleanup under your own retention policy. Resolve the configured value to an exact path, confirm that target is the intended eval artifact directory, and use a platform-appropriate command only after validation. Never pass an unresolved environment value, repository root, home directory, or broad parent directory to recursive deletion.

For automation, clean up in a final step that runs on both success and failure, but upload only approved redacted outputs. Do not log session contents or secret-bearing environment variables as part of cleanup diagnostics.

## Source map for Pi 0.85.0

Every link below is pinned to release commit `107d79f11072bbc8a3a757ed7fd69596bee7d68c`:

| Source | What to verify |
| --- | --- |
| [`packages/evals/README.md`](https://github.com/earendil-works/pi/blob/107d79f11072bbc8a3a757ed7fd69596bee7d68c/packages/evals/README.md) | Supported runner commands, harness options, comparative methodology, and artifact warning |
| [`src/smoke.eval.ts`](https://github.com/earendil-works/pi/blob/107d79f11072bbc8a3a757ed7fd69596bee7d68c/packages/evals/src/smoke.eval.ts) | One end-to-end smoke prompt and hard infrastructure assertions |
| [`src/pi-harness.ts`](https://github.com/earendil-works/pi/blob/107d79f11072bbc8a3a757ed7fd69596bee7d68c/packages/evals/src/pi-harness.ts) | Model resolution, isolated session lifecycle, traces, telemetry, snapshot, and temporary cleanup |
| [`src/vitest-evals/reporter.ts`](https://github.com/earendil-works/pi/blob/107d79f11072bbc8a3a757ed7fd69596bee7d68c/packages/evals/src/vitest-evals/reporter.ts) | `runs.jsonl`, harness observations, incomplete diagnostics, and printed comparisons |
| [`src/vitest-evals/artifacts.ts`](https://github.com/earendil-works/pi/blob/107d79f11072bbc8a3a757ed7fd69596bee7d68c/packages/evals/src/vitest-evals/artifacts.ts) | Session/source attachment categories, hashed paths, and file modes |
| [`src/vitest-evals/summary.ts`](https://github.com/earendil-works/pi/blob/107d79f11072bbc8a3a757ed7fd69596bee7d68c/packages/evals/src/vitest-evals/summary.ts) | Pair eligibility, pass-rate lift, telemetry deltas, and diagnostic reasons |

## Acceptance checklist

- [ ] The checkout is at exact commit `107d79f11072bbc8a3a757ed7fd69596bee7d68c` and Node.js is `>=22.19.0`.
- [ ] The eval runs from the Pi monorepo; no application attempts to install the private eval workspace as a public package.
- [ ] Provider and model are supplied together, with credentials scoped to the run.
- [ ] The smoke eval passes before a broader or comparative suite runs.
- [ ] Harness names, inputs, judge definition, and repetition count are stable and recorded.
- [ ] Deterministic judges cover machine-checkable contracts; any optional model-backed judge has a reviewed rubric and budget.
- [ ] Comparative suites keep `judgeThreshold: null` and distinguish a task verdict from an infrastructure error.
- [ ] Telemetry is interpreted with eligible-pair coverage and unavailable values, not only the headline delta.
- [ ] Sensitive artifacts are access-controlled, reviewed, redacted before sharing, and assigned a retention period.
- [ ] Default `.eval` cleanup and any custom artifact-path cleanup are validated separately after the required evidence has been retained safely.
