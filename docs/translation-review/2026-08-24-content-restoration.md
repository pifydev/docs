# Content restoration review — 2026-08-24

## Baseline and contract

- Historical structural/depth baseline: `b10130f6d1b5ced0e8d890882d985c2ba4dbdfdf`.
- Technical authority: pinned upstream commit `a470b121` (Pi 0.84.2).
- This ledger records metrics calculated with `contentMetrics()` from the historical files. The runtime preservation gate reads only `content/preservation-manifest.json`; it never requires Git history.
- Every listed locale page must retain at least 80% of the baseline prose words and the measured baseline H2, H3, H4, fenced-code, Mermaid, and table coverage unless a future, evidenced deletion allowance is approved. This task records no deletion allowances.

## Translation review ledger

Metric format: `words; H2/H3/H4; fences; tables; Mermaid`. Outcome counts track restoration review decisions; language and rendering states remain `pending` until reviewed.

| Translation key                 | EN baseline                                                  | VI baseline                                                  | Restored | Merged | Technically invalid | Duplicate | English  | Vietnamese | Render  |
| ------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------ | -------: | -----: | ------------------: | --------: | -------- | ---------- | ------- |
| home                            | 297 words; H2/H3/H4 3/0/0; fences 0; tables 0; Mermaid 0     | 349 words; H2/H3/H4 3/0/0; fences 0; tables 0; Mermaid 0     |        0 |      0 |                   0 |         0 | reviewed | reviewed   | checked |
| quickstart                      | 484 words; H2/H3/H4 8/0/0; fences 8; tables 1; Mermaid 0     | 494 words; H2/H3/H4 8/0/0; fences 8; tables 1; Mermaid 0     |        2 |      0 |                   0 |         0 | reviewed | reviewed   | checked |
| glossary                        | 799 words; H2/H3/H4 22/0/0; fences 0; tables 0; Mermaid 0    | 851 words; H2/H3/H4 22/0/0; fences 0; tables 0; Mermaid 0    |        0 |      0 |                   1 |         0 | reviewed | reviewed   | checked |
| how-to-add-custom-tool          | 403 words; H2/H3/H4 6/0/0; fences 4; tables 0; Mermaid 0     | 413 words; H2/H3/H4 6/0/0; fences 4; tables 0; Mermaid 0     |        0 |      0 |                   0 |         0 | pending  | pending    | pending |
| how-to-plug-new-model           | 388 words; H2/H3/H4 8/0/0; fences 5; tables 0; Mermaid 0     | 377 words; H2/H3/H4 8/0/0; fences 5; tables 0; Mermaid 0     |        0 |      0 |                   0 |         0 | pending  | pending    | pending |
| how-to-stream-output            | 441 words; H2/H3/H4 8/0/0; fences 5; tables 1; Mermaid 0     | 444 words; H2/H3/H4 8/0/0; fences 5; tables 1; Mermaid 0     |        0 |      0 |                   0 |         0 | pending  | pending    | pending |
| how-to-persist-sessions         | 485 words; H2/H3/H4 8/0/0; fences 5; tables 0; Mermaid 0     | 489 words; H2/H3/H4 8/0/0; fences 5; tables 0; Mermaid 0     |        0 |      0 |                   0 |         0 | pending  | pending    | pending |
| how-to-customize-system-prompt  | 536 words; H2/H3/H4 9/0/0; fences 6; tables 0; Mermaid 0     | 565 words; H2/H3/H4 9/0/0; fences 6; tables 0; Mermaid 0     |        0 |      0 |                   0 |         0 | pending  | pending    | pending |
| reference-api                   | 239 words; H2/H3/H4 4/16/0; fences 13; tables 3; Mermaid 0   | 271 words; H2/H3/H4 4/16/0; fences 13; tables 3; Mermaid 0   |        0 |      0 |                   0 |         0 | pending  | pending    | pending |
| reference-configuration         | 382 words; H2/H3/H4 11/13/0; fences 7; tables 2; Mermaid 0   | 432 words; H2/H3/H4 11/13/0; fences 7; tables 2; Mermaid 0   |        0 |      0 |                   0 |         0 | pending  | pending    | pending |
| reference-environment-variables | 525 words; H2/H3/H4 7/10/0; fences 4; tables 2; Mermaid 0    | 601 words; H2/H3/H4 7/10/0; fences 4; tables 2; Mermaid 0    |        0 |      0 |                   0 |         0 | pending  | pending    | pending |
| ch01-overview                   | 3941 words; H2/H3/H4 7/15/0; fences 8; tables 4; Mermaid 1   | 4791 words; H2/H3/H4 7/15/0; fences 8; tables 4; Mermaid 1   |        0 |      0 |                   0 |         0 | pending  | pending    | pending |
| ch02-three-layer-arch           | 2489 words; H2/H3/H4 8/18/0; fences 16; tables 1; Mermaid 0  | 3062 words; H2/H3/H4 8/18/0; fences 16; tables 1; Mermaid 0  |        0 |      0 |                   0 |         0 | pending  | pending    | pending |
| ch03-agent-loop                 | 3059 words; H2/H3/H4 6/25/6; fences 37; tables 7; Mermaid 0  | 3312 words; H2/H3/H4 6/25/6; fences 37; tables 7; Mermaid 0  |        0 |      0 |                   0 |         0 | pending  | pending    | pending |
| ch04-model-invocation           | 3418 words; H2/H3/H4 7/13/0; fences 22; tables 2; Mermaid 0  | 3915 words; H2/H3/H4 7/13/0; fences 22; tables 2; Mermaid 0  |        0 |      0 |                   0 |         0 | pending  | pending    | pending |
| ch05-tool-system                | 4564 words; H2/H3/H4 7/28/0; fences 29; tables 5; Mermaid 0  | 5048 words; H2/H3/H4 7/28/0; fences 29; tables 5; Mermaid 0  |        0 |      0 |                   0 |         0 | pending  | pending    | pending |
| ch06-messages                   | 3192 words; H2/H3/H4 10/12/0; fences 17; tables 3; Mermaid 0 | 3475 words; H2/H3/H4 10/12/0; fences 17; tables 3; Mermaid 0 |        0 |      0 |                   0 |         0 | pending  | pending    | pending |
| ch07-event-driven               | 2339 words; H2/H3/H4 9/16/0; fences 15; tables 0; Mermaid 0  | 2672 words; H2/H3/H4 9/16/0; fences 15; tables 0; Mermaid 0  |        0 |      0 |                   0 |         0 | pending  | pending    | pending |
| ch08-context-engineering        | 3524 words; H2/H3/H4 9/21/0; fences 16; tables 5; Mermaid 0  | 4043 words; H2/H3/H4 9/21/0; fences 16; tables 5; Mermaid 0  |        0 |      0 |                   0 |         0 | pending  | pending    | pending |
| ch09-compaction                 | 2846 words; H2/H3/H4 9/20/0; fences 20; tables 1; Mermaid 0  | 3237 words; H2/H3/H4 9/20/0; fences 20; tables 1; Mermaid 0  |        0 |      0 |                   0 |         0 | pending  | pending    | pending |
| ch10-session                    | 3972 words; H2/H3/H4 9/28/0; fences 30; tables 8; Mermaid 0  | 4617 words; H2/H3/H4 9/28/0; fences 30; tables 8; Mermaid 0  |        0 |      0 |                   0 |         0 | pending  | pending    | pending |
| faq                             | 498 words; H2/H3/H4 4/15/0; fences 0; tables 0; Mermaid 0    | 555 words; H2/H3/H4 4/15/0; fences 0; tables 0; Mermaid 0    |        0 |      0 |                   1 |         0 | reviewed | reviewed   | checked |
| changelog                       | 139 words; H2/H3/H4 2/0/0; fences 0; tables 0; Mermaid 0     | 162 words; H2/H3/H4 2/0/0; fences 0; tables 0; Mermaid 0     |        0 |      2 |                   0 |         0 | reviewed | reviewed   | checked |

## Reviewed mapping appendix: start and help pages

The mappings below compare `b10130f` with the current English and Vietnamese pair. English and Vietnamese headings are shown together when their wording differs. Outcome counts in the ledger are pair-level review decisions, not duplicate counts for each locale.

### `home`

- H2 `How to read` / `Cách đọc` — `retained`.
- H2 `Sections` / `Mục lục` — `retained`.
- H2 `Feedback` / `Phản hồi` — `retained`.
- Info callout directing new readers to Quickstart or the numbered chapters — `retained`; the current copy removes the obsolete ten-minute promise and keeps both reading paths.

### `quickstart`

- H2 `Before you start` / `Trước khi bắt đầu` — `retained` in English and `restored` in Vietnamese. The Vietnamese provider prerequisite again includes a local proxy compatible with OpenAI Chat Completions.
- H2 `1. Initialize the project` / `1. Khởi tạo project` — `retained` as `1. Khởi tạo dự án`; the commands now install `@earendil-works/pi-ai` and `tsx`.
- H2 `2. Add your API key` / `2. Thêm API key` — `retained`.
- H2 `3. Write the agent` / `3. Viết agent` — `retained`; the example now uses `builtinModels()` and `models.streamSimple()`.
- H2 `4. Load the key and run` / `4. Load key và chạy` — `retained` as `4. Nạp key và chạy`; Node loads `.env` directly.
- H2 `5. Try one variation` / `5. Thử một biến thể` — `retained`.
- H2 `Where to go next` / `Tiếp theo` — `retained`.
- H2 `Troubleshooting` — `retained` as `Troubleshooting` / `Khắc phục sự cố`.
- Code examples: project initialization (`bash`), `.env` (`bash`), `.gitignore` (`bash`), `agent.ts` (`ts`), run command (`bash`), `package.json` (`json`), sample output (plain fence), and the `agent.ts` variation (`ts`) — all eight are `retained` in the same order and with aligned fence languages.
- Goal/reading table — `retained` in English and `restored` in Vietnamese. The restored cells keep the distinctions between an Agent Loop and one model call, and between a bundled provider and a provider not shipped by the SDK.
- Callouts: final result (`tip`), cost and key safety (`caution`), `.env` rationale (`note`), and npm script (`tip`) — all four are `retained`.

### `glossary`

- H2 `Agent`, `Agent Loop`, `Block`, `Coding Agent`, `Compaction`, `Context Window`, `Descriptor`, `Event`, `Extension`, `Managed Tools`, `Message`, `Model Provider`, `Pi`, `Session`, `Skill`, `Stream`, `Subagent`, `System Prompt`, `Tool`, `Tool Use`, and `Turn` — all 21 are `retained` in both locales with current package names and APIs.
- H2 `Translator` — `technically-invalid`; it is replaced by `Provider Adapter`. At pinned upstream commit [`a470b121`](https://github.com/badlogic/pi-mono/tree/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/ai/src), provider modules and API implementations replace the baseline's `@pi-ai/core` translator registry, and the [Pi AI README](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/ai/README.md#providers-and-models) documents `Models` collections, provider factories, and shared API implementations. No preservation allowance is needed because the replacement keeps the H2 and explanation.
- Glossary rationale/translation-rule callout (`note`) — `retained`; the current callout states the bilingual identifier policy directly.

### `faq`

- H2 `Pi itself` / `Về Pi`, `Reading this book` / `Đọc cuốn sách này`, `Contributing` / `Đóng góp`, and `Common pitfalls` / `Lỗi hay gặp` — all four are `retained`; the Vietnamese labels are edited to `Đọc tài liệu` and `Lỗi thường gặp`.
- H3 `What is Pi?`, `How is Pi different from Claude Code or Codex?`, `Which model providers does Pi support?`, `Is Pi free?`, `Should I read the chapters in order?`, `Why are some code snippets in TypeScript and others in JavaScript?`, `Can I copy the snippets into my own project?`, `How do I report a translation error?`, `Can I add a chapter?`, `Where is the editorial style guide?`, `My tool result is not reaching the model.`, `My session does not resume.`, `The TUI renders oddly over SSH.`, and `The model returns 429 even though I have a valid key.` — all 14 are `retained` in both locales, with natural heading edits and current API terminology.
- H3 `The English chapters say "v0.80.2" in the version note. Is that still current?` — `technically-invalid`; it is replaced by `Which Pi revision does this documentation describe?` and its Vietnamese pair. The pinned [`@earendil-works/pi-ai` package manifest](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/ai/package.json) is version `0.84.2`, while the current answer records the exact review commit instead of preserving the stale `v0.80.2` framing. No preservation allowance is needed because the version-scope question and answer remain present.
- The baseline contains no table, code-fence, Mermaid, or callout artifact on this page.

### `changelog`

- H2 `Unreleased` — `merged` into the dated `2026-08-22` and `2026-08-24` entries after those documentation changes shipped.
- H2 `2026-08-20` — `retained`; the current entry keeps the initial English/Vietnamese chapter import and the first navigation/provenance work while the later entry records the Fumadocs replacement.
- Site-versus-SDK note callout — `merged` into the opening paragraph, which still directs Pi release readers to the upstream release history.
- The baseline contains no table, code-fence, or Mermaid artifact on this page.
