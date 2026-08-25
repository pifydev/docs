---
title: Chạy Pi eval từ source checkout đã pin
description: Chạy smoke và comparative eval cho Pi Coding Agent, đọc judge và telemetry, đồng thời xử lý artifact an toàn.
translation_key: how-to-run-pi-evals
language: vi
source_url: "https://docs.pify.dev/vi/how-to/run-pi-evals"
official_refs:
  - "https://github.com/earendil-works/pi/blob/4e58f324fae8ebfa98a3d45181fb248072a2afac/packages/evals/README.md"
  - "https://github.com/earendil-works/pi/blob/4e58f324fae8ebfa98a3d45181fb248072a2afac/packages/evals/src/smoke.eval.ts"
  - "https://github.com/earendil-works/pi/blob/4e58f324fae8ebfa98a3d45181fb248072a2afac/packages/evals/src/pi-harness.ts"
  - "https://github.com/earendil-works/pi/blob/4e58f324fae8ebfa98a3d45181fb248072a2afac/packages/evals/src/vitest-evals/reporter.ts"
  - "https://github.com/earendil-works/pi/blob/4e58f324fae8ebfa98a3d45181fb248072a2afac/packages/evals/src/vitest-evals/artifacts.ts"
  - "https://github.com/earendil-works/pi/blob/4e58f324fae8ebfa98a3d45181fb248072a2afac/packages/evals/src/vitest-evals/summary.ts"
terms_used:
  - harness
  - judge
  - verdict
  - fixture
  - held-out evaluation
  - fail-closed
status: reviewed
reviewed_by: Pify maintainers
last_updated: '2026-08-25'
translator: Pify maintainers
---

Eval package của Pi đo hành vi Coding Agent end-to-end với model thật. Package này nối một `AgentSession` thật vào `vitest-evals`, tạo project directory và agent directory tạm thời, cô lập cho từng run, rồi giữ lại bằng chứng session gốc của Pi sau khi xóa workspace tạm.

`packages/evals` là một private monorepo package, không phải npm install target. Chỉ chạy package này từ Pi source checkout đã pin vào bản phát hành bên dưới. Đừng thêm `@earendil-works/pi-evals` vào dependency list của application hoặc xem các module nội bộ của nó là public SDK contract.

## Kết quả

Sau hướng dẫn này, bạn có thể:

- chạy smoke eval một case của bản phát hành với provider và model được chọn tường minh;
- giải thích Pi coding-agent harness cô lập, ghi nhận và cleanup những gì;
- dùng deterministic judge cho hành vi có thể kiểm tra bằng máy và chỉ dùng model-backed judge cho tiêu chí chủ quan;
- so sánh baseline với candidate qua số repetitions có chủ đích;
- tách infrastructure error khỏi task verdict;
- đọc telemetry về token, latency, estimated cost và kiểm tra artifact mà không làm lộ dữ liệu;
- xóa artifact directory đã sinh bằng chính cleanup script của package đã pin.

:::caution[Model-backed execution tùy chọn, chi phí và bằng chứng nhạy cảm]

Model-backed execution là tùy chọn, không bắt buộc trong project của bạn; hãy giữ deterministic unit test và integration test làm offline gate bắt buộc. Mỗi harness run được thực thi có thể phát sinh chi phí provider, còn model-backed judge có thể thêm một request khác. Directory được sinh chứa session artifact nhạy cảm: prompt, response, source code, Tool input và Tool output có thể chứa credential hoặc dữ liệu độc quyền. Hãy dùng fixture tổng hợp, đặt budget, giới hạn quyền truy cập, kiểm tra trước khi chia sẻ, đồng thời redact hoặc xóa bằng chứng thô khi không cần lưu giữ.

:::

## 1. Checkout đúng source của bản phát hành

Dùng Node.js `>=22.19.0`. Block sau là toàn bộ checkout boundary cho hướng dẫn này:

```bash
git clone https://github.com/earendil-works/pi.git
cd pi
git checkout 4e58f324fae8ebfa98a3d45181fb248072a2afac
npm install
```

Lệnh install ở root hydrate các monorepo workspace theo lockfile. Tại commit này, `packages/evals/package.json` khai báo `private: true` và chỉ expose ba package script: `eval`, `test`, `clean`. Repository root chuyển tiếp `npm run eval` vào workspace đó, vì vậy các lệnh còn lại được chạy từ repository root.

Trước khi tốn một provider request, hãy xác nhận `git rev-parse HEAD` in ra `4e58f324fae8ebfa98a3d45181fb248072a2afac`. Nếu không đúng, hãy dừng lại: flag, định dạng report và hành vi artifact từ commit khác nằm ngoài release contract của hướng dẫn này.

## 2. Chạy một smoke eval

Smoke eval đã pin tại `src/smoke.eval.ts` sẽ tắt toàn bộ Tool và hỏi thủ đô nước Pháp. Nó hard-assert câu trả lời sau khi trim phải đúng `Paris`, harness-error list rỗng, provider/model đúng lựa chọn và token count dương. Trước tiên chỉ chạy file đó:

```bash
npm run eval -- --provider openai --model gpt-5.6-sol src/smoke.eval.ts
```

Thay cặp provider/model bằng cặp có trong `ModelRuntime` thông thường của Pi. Hai giá trị là một lựa chọn nguyên tử: runner từ chối CLI invocation chỉ có `--provider` hoặc chỉ có `--model`. Authentication đến từ Pi subscription credential hoặc API-key environment variable thông thường của provider; eval package không định nghĩa credential store riêng.

Argument không được `--provider` hoặc `--model` tiêu thụ sẽ được chuyển tiếp cho Vitest. Để chọn đúng smoke case cùng file của nó, dùng:

```bash
npm run eval -- --provider openai --model gpt-5.6-sol src/smoke.eval.ts -t "runs a basic prompt end to end"
```

Runner in `default-model=<provider>/<model>` và artifact directory đã resolve trước khi Vitest khởi động. Command exit khác 0 nghĩa là run chưa thỏa hard assertion hoặc infrastructure contract; đó không tự động là bằng chứng candidate behavior có điểm thấp.

## 3. Hiểu Pi coding-agent harness

Pi coding-agent harness đến từ `createPiCodingAgentHarness(...)`, bridge riêng của Pi sang `vitest-evals`. Mỗi suite `describeEval(...)` sở hữu một harness. Implementation trong bản phát hành thực hiện các boundary sau cho từng run:

1. resolve model `{ provider, id }` tường minh của harness hoặc cặp default `PI_PROVIDER`/`PI_MODEL`;
2. tạo root tạm mới với các vị trí `workspace`, `agent`, `sessions` tách biệt;
3. dựng `ModelRuntime`, in-memory settings, services, `SessionManager` và `AgentSession` thật;
4. từ chối Extension được preload ngoài dự kiến để user configuration xung quanh không làm nhiễu fixture;
5. nhận một prompt hoặc chuỗi step `prompt`/`reload`, rồi bắt buộc có assistant message cuối với `stopReason: "stop"` và text không rỗng;
6. normalize message, Tool call và Tool result thành trace event, đồng thời report usage và elapsed time;
7. snapshot session JSONL gốc, dispose session và xóa đệ quy root tạm kể cả khi execution thất bại.

Mỗi harness option có vai trò hẹp và rõ ràng:

| Option | Cách dùng | Quy tắc reproducibility |
| --- | --- | --- |
| `name` | Identity ổn định trong report và comparison | Tên phải duy nhất trong một eval set; không gắn timestamp |
| `model` | Lựa chọn `{ provider, id }` tường minh | Nên dùng khi baseline và candidate cố ý chạy model khác nhau |
| `noTools` | Cấu hình disable Tool của Pi | Disable Tool không liên quan để chúng không đổi experiment |
| `transformSystemPrompt` | Biến đổi toàn bộ System Prompt mặc định | Giữ transform thuần và đưa vào version control |
| `output` | Tạo domain result JSON-safe từ response và session | Chỉ expose field judge cần; để bằng chứng thô trong artifact |

Input có thể chứa `reload` giữa các prompt. Cách này hữu ích khi prompt đầu tạo Extension, Skill hoặc setting và prompt sau phải quan sát runtime sau reload. Harness vẫn sở hữu cùng một isolated run và ghi lại toàn bộ session liên kết.

## 4. Chọn judge trước khi xem kết quả

Judge chuyển một harness result thành score và rationale tùy chọn. Hãy định nghĩa judge cùng acceptance boundary trước khi kiểm tra candidate output; nếu không, rubric có thể overfit chính observation mà nó cần đánh giá.

### Deterministic judge

Ưu tiên deterministic judge khi có thể suy ra correctness từ output JSON-safe hoặc normalized trace. Nó rẻ, lặp lại được, review được và phù hợp với exact output, schema validity, Tool name/argument, file được tạo, loader error hoặc invariant khác có thể kiểm tra bằng máy.

Bản phát hành Pi dùng `createJudge(...)` và chỉ trả về `1` khi tất cả điều kiện bắt buộc đều đúng. Dạng tối thiểu như sau:

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

Dùng hard assertion `expect(...)` cho tính toàn vẹn của fixture và infrastructure contract, không dùng nó để thay scoring. `expect.soft(...)` vẫn làm Vitest task fail; nó không tạo judge observation.

### Model-backed judge tùy chọn

Model-backed judge chỉ phù hợp khi rubric cần chất lượng ngữ nghĩa mà deterministic predicate không thể biểu đạt đáng tin cậy, chẳng hạn giải thích có đúng nguồn, hữu ích và đầy đủ hay không. Model-backed evaluation là tùy chọn: bắt đầu bằng rubric đã review và held-out evaluation set nhỏ, hiệu chỉnh theo human verdict, pin judge model cùng setting, rồi ghi version của chúng với run.

Pi package cung cấp Coding Agent harness và reporter integration; implementation của model-backed judge thuộc `vitest-evals` hoặc evaluation code của bạn. Đừng tự bịa một Pi API cho nó. Judge request nhận output có thể nhạy cảm và làm tăng nondeterminism, latency, cost, vì vậy đừng bao giờ dùng nó làm fail-closed safety check duy nhất. Khi có thể, kết hợp deterministic contract check với subjective score và định kỳ review lại các case bất đồng.

## 5. So sánh baseline và candidate bằng repetitions

Dùng `evalHarnessTable(...)` với `describe.for(...)` của Vitest để cùng input và judge chạy trên baseline và candidate đã khai báo. Đặt cho mỗi harness một tên duy nhất, ổn định. Một treatment dùng `candidate`; nhiều treatment dùng `candidates`, và mỗi treatment chỉ được pair với baseline đã khai báo.

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

`repetitions` phải là số nguyên dương và mặc định bằng `1`; chỉ tăng có chủ đích vì mỗi row thực thi harness thêm một lần. Grouping key kết hợp repetition với `input.id` khác rỗng, hoặc với SHA-256 hash của strict canonical JSON input khi không có ID. Input và harness name ổn định giúp reporter tạo pair hợp lệ.

Đặt `judgeThreshold: null` cho comparative suite. Khi đó judge score thấp vẫn là observation cho so sánh pass rate thay vì biến cả invocation thành infrastructure failure. Reporter xem average judge score ít nhất `1` là pass và report candidate pass-rate lift trừ baseline pass rate theo percentage point.

Bản phát hành có một experiment Extension baseline/candidate lớn hơn. Chạy riêng nó sau smoke case:

```bash
npm run eval -- --provider openai --model gpt-5.6-sol src/extensions.eval.ts
```

Đừng so một candidate run may mắn với một baseline run không liên quan. Hãy dùng cùng eval input, repetition index, judge definition và release source. Thêm repetitions khi model variance có thể đổi verdict, đồng thời giữ lại incomplete observation thay vì âm thầm bỏ nó.

## 6. Tách task verdict khỏi infrastructure error

Task verdict trả lời “Agent có thỏa rubric không?”. Infrastructure error trả lời “có observation hợp lệ để chấm hay không?”. Việc tách hai loại này ngăn provider outage hoặc cleanup failure trở thành điểm 0 giả cho product behavior.

| Signal | Phân loại | Cách xử lý |
| --- | --- | --- |
| Deterministic hoặc model-backed judge trả về score thấp nhưng hợp lệ | Task verdict | Giữ observation; kiểm tra rationale và so paired pass rate |
| Thiếu model, credential request lỗi, run abort hoặc assistant kết thúc không phải `stop` | Infrastructure error | Sửa environment rồi rerun; không chấm thành task failure |
| Harness trả về `errors` hoặc cleanup throw | Infrastructure error | Giữ diagnostic, sửa fixture hoặc runtime rồi rerun |
| Reporter có `missing-score`, `missing-observation`, `duplicate-observation` hoặc `harness-error` | Comparison chưa đầy đủ | Không suy ra lift từ pair thiếu; điều tra run được nêu tên |
| Hard assertion về suite invariant fail | Lỗi infrastructure/fixture contract | Sửa eval definition trước khi diễn giải chất lượng candidate |

Summary module chỉ pair một baseline observation và một candidate observation cho cùng file, test, group key, repetition. Observation errored, unscored, skipped, pending, missing hoặc duplicate trở thành diagnostic thay vì score tự bịa. Hành vi fail-closed này làm coverage luôn hiển thị.

## 7. Đọc telemetry và comparison output

Pi harness ghi identity của provider/model, input/output token, total token, số Tool call, cache token metadata và tổng elapsed milliseconds. Nó chỉ thêm `estimatedCostUsd` khi model đã chọn có pricing metadata khác 0. Vì vậy “unavailable” khác với chi phí bằng 0.

| Report field | Ý nghĩa | Giới hạn diễn giải |
| --- | --- | --- |
| Pass-rate lift | Candidate pass rate trừ baseline pass rate | Cần pair đã match và có score; bản thân nó không phải causal proof |
| Tokens | Mean `totalTokens` của candidate trừ baseline | Telemetry thiếu làm giảm eligible-pair coverage |
| Latency | Mean `totalMs` của candidate trừ baseline | Provider load và network condition có thể lấn át sample nhỏ |
| Estimated cost | Mean `estimatedCostUsd` của candidate trừ baseline | Chỉ có khi model pricing metadata được điền |
| Incomplete observations | Row thiếu, trùng, lỗi hoặc chưa có score | Giải quyết chúng trước khi tin vào comparison |

Đọc hướng delta cùng coverage. Correctness lift dương vẫn có thể hữu ích khi token hoặc latency delta tăng, nhưng trade-off phải khớp product goal. Hãy ghi release SHA, provider/model ID, thay đổi prompt hoặc Tool, judge definition, input-set revision, repetitions và artifact directory để reviewer khác tái tạo comparison.

## 8. Kiểm tra, redact và lưu artifact an toàn

Runner mặc định tạo `packages/evals/.eval/<timestamp>_<uuid>/` và in resolved path. `PI_EVAL_ARTIFACT_DIR` có thể override directory; giá trị tương đối được resolve từ `packages/evals`. Directory gồm:

| Path | Nội dung | Cách xử lý |
| --- | --- | --- |
| `runs.jsonl` | Một reporter record cho mỗi harness run hoàn tất, gồm test identity, usage, timing, error, metadata và artifact reference | Filter theo `runId`; không publish mù quáng |
| `sessions/<sha256(runId)>/session.jsonl` | Snapshot session gốc của Pi được chụp trước khi workspace tạm bị xóa | Xem là transcript và bằng chứng Tool nhạy cảm |
| `sources/<sha256(runId)>/<name>` | Source attachment tùy chọn do eval đăng ký tường minh | Review credential, private path và code độc quyền |

Runner tạo artifact directory với mode chỉ owner `0700` và ghi report/attachment file bằng `0600` trên platform tôn trọng POSIX mode. Permission giảm truy cập vô ý nhưng không thay cho redaction. Trước khi chia sẻ, chỉ copy phần bằng chứng cần review, loại secret cùng nội dung cá nhân hoặc độc quyền khỏi bản copy, giữ `runId` và release metadata gốc, rồi nhờ reviewer thứ hai kiểm tra redaction. Đừng sửa artifact rồi trình bày nó như bằng chứng thô chưa thay đổi.

Chỉ giữ artifact theo retention period tường minh. Nếu run xử lý nội dung repository thật, hãy lưu bằng chứng cần giữ ở nơi có access control thay vì commit `.eval`; `.gitignore` của release package đã loại directory này theo mặc định.

## 9. Cleanup an toàn

Trước tiên hoàn tất kiểm tra hoặc copy phần bằng chứng đã redact mà bạn chủ ý lưu. Sau đó chạy cleanup script đã pin của private workspace từ repository root:

```bash
npm run clean --workspace=@earendil-works/pi-evals
```

Tại commit đã pin, lệnh này chuyển tiếp sang `shx rm -rf .eval` với `packages/evals` là workspace. Nó xóa toàn bộ local eval run trong package đó, không chỉ run mới nhất, vì vậy hãy kiểm tra printed path và retention decision trước khi thực thi. Harness đã xóa root project/agent tạm của từng run; command này xóa report directory và attachment directory bền hơn.

Trong automation, đặt cleanup ở final step chạy cả khi success lẫn failure, nhưng chỉ upload output đã redact và được duyệt. Đừng log session content hoặc environment variable chứa secret trong cleanup diagnostic.

## Source map cho Pi 0.84.3

Mọi link dưới đây đều pin vào release commit `4e58f324fae8ebfa98a3d45181fb248072a2afac`:

| Source | Nội dung cần kiểm tra |
| --- | --- |
| [`packages/evals/README.md`](https://github.com/earendil-works/pi/blob/4e58f324fae8ebfa98a3d45181fb248072a2afac/packages/evals/README.md) | Runner command được hỗ trợ, harness option, comparative methodology và artifact warning |
| [`src/smoke.eval.ts`](https://github.com/earendil-works/pi/blob/4e58f324fae8ebfa98a3d45181fb248072a2afac/packages/evals/src/smoke.eval.ts) | Một smoke prompt end-to-end và hard infrastructure assertion |
| [`src/pi-harness.ts`](https://github.com/earendil-works/pi/blob/4e58f324fae8ebfa98a3d45181fb248072a2afac/packages/evals/src/pi-harness.ts) | Model resolution, isolated session lifecycle, trace, telemetry, snapshot và temporary cleanup |
| [`src/vitest-evals/reporter.ts`](https://github.com/earendil-works/pi/blob/4e58f324fae8ebfa98a3d45181fb248072a2afac/packages/evals/src/vitest-evals/reporter.ts) | `runs.jsonl`, harness observation, incomplete diagnostic và printed comparison |
| [`src/vitest-evals/artifacts.ts`](https://github.com/earendil-works/pi/blob/4e58f324fae8ebfa98a3d45181fb248072a2afac/packages/evals/src/vitest-evals/artifacts.ts) | Loại session/source attachment, hashed path và file mode |
| [`src/vitest-evals/summary.ts`](https://github.com/earendil-works/pi/blob/4e58f324fae8ebfa98a3d45181fb248072a2afac/packages/evals/src/vitest-evals/summary.ts) | Điều kiện pair, pass-rate lift, telemetry delta và diagnostic reason |

## Acceptance checklist

- [ ] Checkout ở đúng commit `4e58f324fae8ebfa98a3d45181fb248072a2afac` và Node.js là `>=22.19.0`.
- [ ] Eval chạy từ Pi monorepo; không application nào cố cài private eval workspace như public package.
- [ ] Provider và model được truyền cùng nhau, credential chỉ có scope cần thiết cho run.
- [ ] Smoke eval pass trước khi chạy suite rộng hơn hoặc comparative suite.
- [ ] Harness name, input, judge definition và repetition count ổn định, có ghi lại.
- [ ] Deterministic judge kiểm tra contract có thể xác minh bằng máy; model-backed judge tùy chọn có rubric và budget đã review.
- [ ] Comparative suite giữ `judgeThreshold: null` và phân biệt task verdict với infrastructure error.
- [ ] Telemetry được diễn giải cùng eligible-pair coverage và giá trị unavailable, không chỉ headline delta.
- [ ] Sensitive artifact được access-control, review, redact trước khi chia sẻ và có retention period.
- [ ] Chỉ chạy cleanup sau khi bằng chứng cần thiết đã được giữ an toàn.
