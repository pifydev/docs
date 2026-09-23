---
title: Chạy Pi eval từ source checkout đã pin
description: Chạy smoke và comparative eval cho Pi Coding Agent, đọc judge và telemetry, đồng thời xử lý artifact an toàn.
translation_key: how-to-run-pi-evals
language: vi
source_url: "https://docs.pify.dev/vi/how-to/run-pi-evals"
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
- xóa artifact directory mặc định được sinh bằng chính cleanup script của package đã pin.

:::caution[Model-backed execution tùy chọn, chi phí và bằng chứng nhạy cảm]

Model-backed execution là tùy chọn, không bắt buộc trong project của bạn; hãy giữ deterministic unit test và integration test làm offline gate bắt buộc. Mỗi harness run được thực thi có thể phát sinh chi phí provider, còn model-backed judge có thể thêm một request khác. Directory được sinh chứa session artifact nhạy cảm: prompt, response, source code, Tool input và Tool output có thể chứa credential hoặc dữ liệu độc quyền. Hãy dùng fixture tổng hợp, đặt budget, giới hạn quyền truy cập, kiểm tra trước khi chia sẻ, đồng thời redact hoặc xóa bằng chứng thô khi không cần lưu giữ.

:::

## 1. Checkout đúng source của bản phát hành

Dùng Node.js `>=22.19.0`. Block sau là toàn bộ checkout boundary cho hướng dẫn này:

```bash
git clone https://github.com/earendil-works/pi.git
cd pi
git checkout f07218c4d4bbc12bef056a7058c3dd49dfe41abe
npm install
```

Lệnh install ở root hydrate các monorepo workspace theo lockfile. Tại commit này, `packages/evals/package.json` khai báo `private: true`. Các script liên quan là `eval`, `eval:host`, `eval:docs`, `test` và `clean`. Các lệnh bên dưới dùng workspace selector `-w packages/evals` của npm từ repository root để execution mode luôn tường minh.

Trước khi tốn một provider request, hãy xác nhận `git rev-parse HEAD` in ra `f07218c4d4bbc12bef056a7058c3dd49dfe41abe`. Nếu không đúng, hãy dừng lại: flag, định dạng report và hành vi artifact từ commit khác nằm ngoài release contract của hướng dẫn này.

## 2. Chạy một smoke eval

Host smoke eval đã pin tại `evals/smoke.eval.ts` sẽ tắt toàn bộ Tool và hỏi thủ đô nước Pháp. Nó hard-assert câu trả lời sau khi trim phải đúng `Paris`, harness-error list rỗng, provider/model đúng lựa chọn và token count dương. Trước tiên chỉ chạy file đó:

```bash
PI_PROVIDER=openai-codex PI_MODEL=gpt-5.6-sol npm run eval:host -w packages/evals -- evals/smoke.eval.ts
```

Thay environment pair bằng cặp có trong `ModelRuntime` thông thường của Pi. Harness yêu cầu cả `PI_PROVIDER` và `PI_MODEL` khi không cấu hình model tường minh. Authentication đến từ Pi subscription credential đã lưu hoặc API-key environment variable thông thường của provider; eval package không định nghĩa credential store riêng.

Host runner chuyển file filter và test filter cho Vitest. Để chọn đúng smoke case cùng file của nó, dùng:

```bash
PI_PROVIDER=openai-codex PI_MODEL=gpt-5.6-sol npm run eval:host -w packages/evals -- evals/smoke.eval.ts -t "returns the expected answer"
```

Host path này chạy Vitest trực tiếp và không tạo paired documentation-comparison report được mô tả ở phần sau. Command exit khác 0 nghĩa là smoke run chưa thỏa hard assertion hoặc infrastructure contract; đó không tự động là bằng chứng documentation treatment có điểm thấp.

## 3. Hiểu Pi coding-agent harness

Pi coding-agent harness đến từ `createPiCodingAgentHarness(...)`, bridge riêng của Pi sang `vitest-evals`. Mỗi suite `describeEval(...)` sở hữu một harness. Implementation trong bản phát hành thực hiện các boundary sau cho từng run:

1. resolve model `{ provider, id }` tường minh của harness hoặc cặp default `PI_PROVIDER`/`PI_MODEL`;
2. tạo root tạm mới với các vị trí `workspace`, `agent`, `sessions` tách biệt;
3. dựng `ModelRuntime`, in-memory settings, services, `SessionManager` và `AgentSession` thật;
4. từ chối Extension được preload ngoài dự kiến để user configuration xung quanh không làm nhiễu fixture;
5. nhận một prompt hoặc chuỗi step `prompt`/`reload`, rồi bắt buộc có assistant message cuối với `stopReason` là `"stop"` hoặc `"toolUse"`; chỉ trường hợp `"stop"` mới phải có text không rỗng;
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

Documentation eval đã tag dùng `StructuredOutputJudge(...)` và `ToolCallJudge(...)` từ `vitest-evals`. Một strict judge nhỏ có thể so sánh JSON-safe projection từ harness:

```typescript
import { StructuredOutputJudge } from "vitest-evals";

const ExactAnswerJudge = StructuredOutputJudge({
  expected: { answer: "Paris" },
  match: "strict",
  allowExtras: false,
});
```

Dùng hard assertion `expect(...)` cho tính toàn vẹn của fixture và infrastructure contract, không dùng nó để thay scoring. `expect.soft(...)` vẫn làm Vitest task fail; nó không tạo judge observation.

### Model-backed judge tùy chọn

Model-backed judge chỉ phù hợp khi rubric cần chất lượng ngữ nghĩa mà deterministic predicate không thể biểu đạt đáng tin cậy, chẳng hạn giải thích có đúng nguồn, hữu ích và đầy đủ hay không. Model-backed evaluation là tùy chọn: bắt đầu bằng rubric đã review và held-out evaluation set nhỏ, hiệu chỉnh theo human verdict, pin judge model cùng setting, rồi ghi version của chúng với run.

Pi package cung cấp Coding Agent harness và import judge implementation từ `vitest-evals`; custom hoặc model-backed judge thuộc library đó hoặc evaluation code của bạn. Đừng tự bịa một Pi API cho nó. Judge request nhận output có thể nhạy cảm và làm tăng nondeterminism, latency, cost, vì vậy đừng bao giờ dùng nó làm fail-closed safety check duy nhất. Khi có thể, kết hợp deterministic contract check với subjective score và định kỳ review lại các case bất đồng.

## 5. So sánh baseline và candidate bằng repetitions

Pi 0.87.1 có documentation comparison riêng thay vì yêu cầu mỗi eval file tự dựng bảng baseline/candidate. Runner build hai image: `without_docs` là control và `with_docs` là treatment. Cả hai cài cùng local workspace package, rồi chạy cùng các case `*.docs.eval.ts` đã discover với cùng provider/model và judge definition. Treatment giữ tài liệu Pi; control loại các bề mặt tài liệu của coding-agent và section tương ứng trong default prompt.

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

`createPiDocumentationEvalHarness()` chỉ hợp lệ bên trong isolated container runner. Mặc định nó expose `read`, `write`, `edit`, `grep`, `find` và `ls`, không expose shell hay Tool web-search không giới hạn. Discovery phải tạo cohort case giống nhau trong cả hai image. Plan sau đó mở rộng từng case thành task `(case, variant, model, runNumber)` và luân phiên thứ tự variant theo run number để giảm order bias.

Giữ `judgeThreshold: null` cho comparison suite. Valid score thấp vẫn là task observation thay vì khiến arm fail như infrastructure. `--runs-per-variant` phải là số nguyên dương và mặc định bằng `1`; chỉ tăng có chủ đích vì mỗi giá trị lập lịch lại cả hai variant.

Chạy Extension documentation comparison đã pin sau host smoke case:

```bash
npm run eval:docs -w packages/evals -- evals/extensions.docs.eval.ts --provider openai-codex --model gpt-5.6-sol --runs-per-variant 5
```

CLI yêu cầu `--provider` và `--model` đi cùng khi một trong hai flag xuất hiện; nếu không, nó đọc cặp `PI_PROVIDER`/`PI_MODEL`. CLI chỉ nhận file `*.docs.eval.ts` cùng discovery filter `-t`/`--testNamePattern`. Giữ exact release source, case identity, model, run number và protocol digest với kết quả. Đừng so các ad hoc run không liên quan hoặc âm thầm bỏ một arm bị blocked.

## 6. Tách task verdict khỏi infrastructure error

Task verdict trả lời “Agent có thỏa rubric không?”. Infrastructure error trả lời “có observation hợp lệ để chấm hay không?”. Việc tách hai loại này ngăn provider outage hoặc cleanup failure trở thành điểm 0 giả cho product behavior.

| Signal | Phân loại | Cách xử lý |
| --- | --- | --- |
| Deterministic hoặc model-backed judge trả về score thấp nhưng hợp lệ | Task verdict | Giữ observation; kiểm tra rationale và so paired pass rate |
| Thiếu model, credential resolution lỗi, run abort hoặc assistant có stop reason ngoài dự kiến | Infrastructure error | Sửa environment rồi rerun; không chấm thành task failure |
| Harness trả về `errors` hoặc cleanup throw | Infrastructure error | Giữ diagnostic, sửa fixture hoặc runtime rồi rerun |
| Expected arm bị thiếu hoặc trùng, hoặc outcome là `unscored`, `skipped`, `pending`, `errored` | Pair bị blocked | Không suy ra lift từ eval set đó; điều tra arm được nêu tên |
| Hard assertion về suite invariant fail | Lỗi infrastructure/fixture contract | Sửa eval definition trước khi diễn giải chất lượng candidate |

`report.ts` pair chính xác một observation `without_docs` và một observation `with_docs` cho cùng eval set, case ID, model và run number. Cohort không hợp lệ trở thành blocked-pair reason thay vì score tự bịa. Nếu eval set có pair bị blocked, headline pass rate và lift sẽ bị giữ lại; nếu bất kỳ pair nào bị blocked, documentation CLI thoát khác 0 sau khi ghi report.

## 7. Đọc telemetry và comparison output

Pi harness ghi identity của provider/model, input/output token, total token, số Tool call, cache token metadata và tổng elapsed milliseconds. Nó chỉ thêm `estimatedCostUsd` khi model đã chọn có pricing metadata khác 0. Vì vậy “unavailable” khác với chi phí bằng 0.

| Report field | Ý nghĩa | Giới hạn diễn giải |
| --- | --- | --- |
| Pass-rate lift | Pass rate `with_docs` trừ pass rate `without_docs` | Chỉ công bố khi mọi planned pair trong eval set đều eligible |
| Tokens | Mean `totalTokens` của treatment trừ control | Telemetry thiếu làm giảm metric-pair coverage |
| Tools | Mean số Tool call của treatment trừ control | Số nhỏ hơn không tự động là task result tốt hơn |
| Latency | Mean `totalMs` của treatment trừ control | Provider load và network condition có thể lấn át sample nhỏ |
| Estimated cost | Mean `estimatedCostUsd` của treatment trừ control | Chỉ có khi model pricing metadata được điền |
| Blocked pairs | Arm thiếu, trùng, lỗi, skipped, pending hoặc unscored | Giải quyết chúng trước khi tin vào headline correctness |

Đọc hướng delta cùng coverage. `report.txt` in paired delta cùng operational total cho hai variant; `report.json` giữ schema, `protocolDigest`, comparison, blocked pair và total. Correctness lift dương vẫn có thể tốn thêm token hoặc latency. Hãy ghi release SHA, provider/model ID, thay đổi tài liệu, judge definition, input-set revision, repetitions và artifact directory để reviewer khác tái tạo comparison.

## 8. Kiểm tra, redact và lưu artifact an toàn

Documentation runner tạo `packages/evals/.eval/<timestamp>_<uuid>/` và in resolved path đó. Pi 0.87.1 không expose public CLI option cho custom artifact root. Directory gồm:

| Path | Nội dung | Cách xử lý |
| --- | --- | --- |
| `protocol.json` | Model, image ID, file đã chọn, case đã discover, task plan và `protocolDigest` | Giữ nó cùng mọi comparison report |
| `expected-runs.json` | Toàn bộ cohort `(case, variant, model, runNumber)` đã lập kế hoạch | Dùng để đối chiếu arm bị thiếu hoặc trùng |
| `observations.jsonl` | Outcome đã normalize và telemetry có sẵn của từng task hoàn tất | Kiểm tra outcome trước khi đọc headline lift |
| `tasks/*/vitest.json` | Native Vitest JSON do từng isolated arm tạo ra | Xem error và raw harness evidence là dữ liệu nhạy cảm |
| `<variant>/sessions/*/session.jsonl` | Native Pi session snapshot được giữ cho một arm | Xem là transcript và bằng chứng Tool nhạy cảm |
| `report.json` và `report.txt` | Paired comparison dạng machine-readable và dạng in | Chỉ chia sẻ sau khi kiểm tra blocked pair và redaction |

CLI tạo run directory với mode chỉ owner `0700`, còn session snapshot được giữ được ghi bằng `0600` trên platform tôn trọng POSIX mode. Đừng giả định mọi Docker hoặc report file đều có cùng mode. Permission giảm truy cập vô ý nhưng không thay cho redaction. Trước khi chia sẻ, chỉ copy phần bằng chứng cần review, loại secret cùng nội dung cá nhân hoặc độc quyền khỏi bản copy, giữ protocol digest và release metadata gốc, rồi nhờ reviewer thứ hai kiểm tra redaction. Đừng sửa artifact rồi trình bày nó như bằng chứng thô chưa thay đổi.

Chỉ giữ artifact theo retention period tường minh. Nếu run xử lý nội dung repository thật, hãy lưu bằng chứng cần giữ ở nơi có access control thay vì commit `.eval`; `.gitignore` của release package đã loại directory này theo mặc định.

## 9. Cleanup an toàn

Trước tiên hoàn tất kiểm tra hoặc copy phần bằng chứng đã redact mà bạn chủ ý lưu. Sau đó chạy cleanup script đã pin của private workspace từ repository root:

```bash
npm run clean --workspace=@earendil-works/pi-evals
```

Tại commit đã pin, lệnh này chuyển tiếp sang `shx rm -rf .eval` với `packages/evals` là workspace. Script cố định này chỉ xóa `packages/evals/.eval`. Nó không nhận custom artifact path. Harness đã xóa root project/agent tạm của từng run; command này xóa protocol, observation, report, task output và session snapshot được giữ dưới fixed run root.

Hoàn tất review và chỉ copy phần bằng chứng đã redact, được duyệt trước khi cleanup. Áp dụng retention policy cho các bản copy đó một cách riêng biệt. Đừng thay pinned script bằng recursive command nhắm vào environment value chưa resolve, repository root, home directory hoặc parent directory quá rộng.

Trong automation, đặt cleanup ở final step chạy cả khi success lẫn failure, nhưng chỉ upload output đã redact và được duyệt. Đừng log session content hoặc environment variable chứa secret trong cleanup diagnostic.

## Source map cho Pi 0.87.1

Mọi link dưới đây đều pin vào release commit `f07218c4d4bbc12bef056a7058c3dd49dfe41abe`:

| Source | Nội dung cần kiểm tra |
| --- | --- |
| [`packages/evals/README.md`](https://github.com/earendil-works/pi/blob/f07218c4d4bbc12bef056a7058c3dd49dfe41abe/packages/evals/README.md) | Command cho host/documentation runner, isolation model, result và artifact warning |
| [`evals/smoke.eval.ts`](https://github.com/earendil-works/pi/blob/f07218c4d4bbc12bef056a7058c3dd49dfe41abe/packages/evals/evals/smoke.eval.ts) | Host smoke prompt end-to-end và hard infrastructure assertion |
| [`src/harness.ts`](https://github.com/earendil-works/pi/blob/f07218c4d4bbc12bef056a7058c3dd49dfe41abe/packages/evals/src/harness.ts) | Model resolution, isolated session lifecycle, trace, telemetry, snapshot và temporary cleanup |
| [`src/plan.ts`](https://github.com/earendil-works/pi/blob/f07218c4d4bbc12bef056a7058c3dd49dfe41abe/packages/evals/src/plan.ts) | Variant identity, case parsing, repeated task plan và alternating order |
| [`src/report.ts`](https://github.com/earendil-works/pi/blob/f07218c4d4bbc12bef056a7058c3dd49dfe41abe/packages/evals/src/report.ts) | Observation validation, blocked pair, telemetry delta, session retention và report formatting |
| [`src/cli.ts`](https://github.com/earendil-works/pi/blob/f07218c4d4bbc12bef056a7058c3dd49dfe41abe/packages/evals/src/cli.ts) | CLI validation, Docker orchestration, ghi protocol/artifact và nonzero blocked-pair exit |

## Acceptance checklist

- [ ] Checkout ở đúng commit `f07218c4d4bbc12bef056a7058c3dd49dfe41abe` và Node.js là `>=22.19.0`.
- [ ] Eval chạy từ Pi monorepo; không application nào cố cài private eval workspace như public package.
- [ ] Host eval nhận cặp `PI_PROVIDER`/`PI_MODEL`; documentation CLI flag `--provider`/`--model` cũng được truyền cùng nhau.
- [ ] Host smoke eval pass trước khi chạy containerized documentation comparison.
- [ ] Case ID, variant, model, judge definition, run number và protocol digest ổn định, có ghi lại.
- [ ] Deterministic judge kiểm tra contract có thể xác minh bằng máy; model-backed judge tùy chọn có rubric và budget đã review.
- [ ] Documentation suite giữ `judgeThreshold: null`, dùng `without_docs`/`with_docs` và phân biệt task verdict với infrastructure error.
- [ ] Telemetry được diễn giải cùng eligible-pair coverage và giá trị unavailable, không chỉ headline delta.
- [ ] Sensitive artifact được access-control, review, redact trước khi chia sẻ và có retention period.
- [ ] Fixed-root `.eval` cleanup chỉ chạy sau khi bằng chứng cần thiết đã được giữ an toàn theo retention policy đã chọn.
