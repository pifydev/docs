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
| glossary                        | 799 words; H2/H3/H4 22/0/0; fences 0; tables 0; Mermaid 0    | 851 words; H2/H3/H4 22/0/0; fences 0; tables 0; Mermaid 0    |        1 |      0 |                   1 |         0 | reviewed | reviewed   | checked |
| how-to-add-custom-tool          | 403 words; H2/H3/H4 6/0/0; fences 4; tables 0; Mermaid 0     | 413 words; H2/H3/H4 6/0/0; fences 4; tables 0; Mermaid 0     |        0 |      0 |                   0 |         0 | pending  | pending    | pending |
| how-to-plug-new-model           | 388 words; H2/H3/H4 8/0/0; fences 5; tables 0; Mermaid 0     | 377 words; H2/H3/H4 8/0/0; fences 5; tables 0; Mermaid 0     |        0 |      0 |                   0 |         0 | pending  | pending    | pending |
| how-to-stream-output            | 441 words; H2/H3/H4 8/0/0; fences 5; tables 1; Mermaid 0     | 444 words; H2/H3/H4 8/0/0; fences 5; tables 1; Mermaid 0     |        0 |      0 |                   0 |         0 | pending  | pending    | pending |
| how-to-persist-sessions         | 485 words; H2/H3/H4 8/0/0; fences 5; tables 0; Mermaid 0     | 489 words; H2/H3/H4 8/0/0; fences 5; tables 0; Mermaid 0     |        0 |      0 |                   0 |         0 | pending  | pending    | pending |
| how-to-customize-system-prompt  | 536 words; H2/H3/H4 9/0/0; fences 6; tables 0; Mermaid 0     | 565 words; H2/H3/H4 9/0/0; fences 6; tables 0; Mermaid 0     |        0 |      0 |                   0 |         0 | pending  | pending    | pending |
| reference-api                   | 239 words; H2/H3/H4 4/16/0; fences 13; tables 3; Mermaid 0   | 271 words; H2/H3/H4 4/16/0; fences 13; tables 3; Mermaid 0   |        0 |      0 |                   0 |         0 | pending  | pending    | pending |
| reference-configuration         | 382 words; H2/H3/H4 11/13/0; fences 7; tables 2; Mermaid 0   | 432 words; H2/H3/H4 11/13/0; fences 7; tables 2; Mermaid 0   |        0 |      0 |                   0 |         0 | pending  | pending    | pending |
| reference-environment-variables | 525 words; H2/H3/H4 7/10/0; fences 4; tables 2; Mermaid 0    | 601 words; H2/H3/H4 7/10/0; fences 4; tables 2; Mermaid 0    |        0 |      0 |                   0 |         0 | pending  | pending    | pending |
| ch01-overview                   | 3941 words; H2/H3/H4 7/15/0; fences 8; tables 4; Mermaid 1   | 4791 words; H2/H3/H4 7/15/0; fences 8; tables 4; Mermaid 1   |       48 |      5 |                   4 |         0 | reviewed | reviewed   | checked |
| ch02-three-layer-arch           | 2489 words; H2/H3/H4 8/18/0; fences 16; tables 1; Mermaid 0  | 3062 words; H2/H3/H4 8/18/0; fences 16; tables 1; Mermaid 0  |       64 |      1 |                   5 |         0 | reviewed | reviewed   | checked |
| ch03-agent-loop                 | 3059 words; H2/H3/H4 6/25/6; fences 37; tables 7; Mermaid 0  | 3312 words; H2/H3/H4 6/25/6; fences 37; tables 7; Mermaid 0  |        0 |      0 |                   0 |         0 | pending  | pending    | pending |
| ch04-model-invocation           | 3418 words; H2/H3/H4 7/13/0; fences 22; tables 2; Mermaid 0  | 3915 words; H2/H3/H4 7/13/0; fences 22; tables 2; Mermaid 0  |        0 |      0 |                   0 |         0 | pending  | pending    | pending |
| ch05-tool-system                | 4564 words; H2/H3/H4 7/28/0; fences 29; tables 5; Mermaid 0  | 5048 words; H2/H3/H4 7/28/0; fences 29; tables 5; Mermaid 0  |        0 |      0 |                   0 |         0 | pending  | pending    | pending |
| ch06-messages                   | 3192 words; H2/H3/H4 10/12/0; fences 17; tables 3; Mermaid 0 | 3475 words; H2/H3/H4 10/12/0; fences 17; tables 3; Mermaid 0 |        0 |      0 |                   0 |         0 | pending  | pending    | pending |
| ch07-event-driven               | 2339 words; H2/H3/H4 9/16/0; fences 15; tables 0; Mermaid 0  | 2672 words; H2/H3/H4 9/16/0; fences 15; tables 0; Mermaid 0  |        0 |      0 |                   0 |         0 | pending  | pending    | pending |
| ch08-context-engineering        | 3524 words; H2/H3/H4 9/21/0; fences 16; tables 5; Mermaid 0  | 4043 words; H2/H3/H4 9/21/0; fences 16; tables 5; Mermaid 0  |        0 |      0 |                   0 |         0 | pending  | pending    | pending |
| ch09-compaction                 | 2846 words; H2/H3/H4 9/20/0; fences 20; tables 1; Mermaid 0  | 3237 words; H2/H3/H4 9/20/0; fences 20; tables 1; Mermaid 0  |        0 |      0 |                   0 |         0 | pending  | pending    | pending |
| ch10-session                    | 3972 words; H2/H3/H4 9/28/0; fences 30; tables 8; Mermaid 0  | 4617 words; H2/H3/H4 9/28/0; fences 30; tables 8; Mermaid 0  |        0 |      0 |                   0 |         0 | pending  | pending    | pending |
| faq                             | 498 words; H2/H3/H4 4/15/0; fences 0; tables 0; Mermaid 0    | 555 words; H2/H3/H4 4/15/0; fences 0; tables 0; Mermaid 0    |        0 |      0 |                   1 |         0 | reviewed | reviewed   | checked |
| changelog                       | 139 words; H2/H3/H4 2/0/0; fences 0; tables 0; Mermaid 0     | 162 words; H2/H3/H4 2/0/0; fences 0; tables 0; Mermaid 0     |        9 |      2 |                   6 |         0 | reviewed | reviewed   | checked |

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
- Glossary rationale/translation-rule callout (`note`) — `restored` in both locales. It now explains why Pi's small vocabulary is defined, tells readers to interpret unlisted terms as ordinary English unless the source narrows them, and retains the exact-identifier and first-use translation rules.

### `faq`

- H2 `Pi itself` / `Về Pi`, `Reading this book` / `Đọc cuốn sách này`, `Contributing` / `Đóng góp`, and `Common pitfalls` / `Lỗi hay gặp` — all four are `retained`; the Vietnamese labels are edited to `Đọc tài liệu` and `Lỗi thường gặp`.
- H3 `What is Pi?`, `How is Pi different from Claude Code or Codex?`, `Which model providers does Pi support?`, `Is Pi free?`, `Should I read the chapters in order?`, `Why are some code snippets in TypeScript and others in JavaScript?`, `Can I copy the snippets into my own project?`, `How do I report a translation error?`, `Can I add a chapter?`, `Where is the editorial style guide?`, `My tool result is not reaching the model.`, `My session does not resume.`, `The TUI renders oddly over SSH.`, and `The model returns 429 even though I have a valid key.` — all 14 are `retained` in both locales, with natural heading edits and current API terminology.
- H3 `The English chapters say "v0.80.2" in the version note. Is that still current?` — `technically-invalid`; it is replaced by `Which Pi revision does this documentation describe?` and its Vietnamese pair. The pinned [`@earendil-works/pi-ai` package manifest](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/ai/package.json) is version `0.84.2`, while the current answer records the exact review commit instead of preserving the stale `v0.80.2` framing. No preservation allowance is needed because the version-scope question and answer remain present.
- The baseline contains no table, code-fence, Mermaid, or callout artifact on this page.

### `changelog`

- H2 `Unreleased` — `merged` into the dated `2026-08-22` and `2026-08-24` entries after those documentation changes shipped.
- H2 `2026-08-20` — `retained` as a dated history section.
- Site-versus-SDK note callout — `merged` into the opening paragraph, which still directs Pi release readers to the upstream release history.
- The baseline contains no table, code-fence, or Mermaid artifact on this page.

Every fact below applies to the matching English and Vietnamese baseline bullet. Restored facts were added to both current locale files with parallel dated structure.

#### Baseline `Unreleased` facts

| Baseline fact (EN / VI)                                                                                                | Outcome               | Current destination or evidence                                                                                                                                                                                                                                |
| ---------------------------------------------------------------------------------------------------------------------- | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Quickstart, Glossary, and Changelog added / thêm Quickstart, glossary và changelog                                     | `restored`            | The current `2026-08-22` entry in both locales now records all three published pages.                                                                                                                                                                          |
| Sidebar reorganized as Getting Started / How-to / Reference / Chapters / Help / sidebar được tổ chức theo năm nhóm đó  | `technically-invalid` | `content/en/meta.json` and `content/vi/meta.json` now expose index, Quickstart, and Glossary before the grouped How-to, Reference, Chapters, and Help sections; there is no current `Getting Started` group.                                                   |
| `lastUpdated` enabled in the site footer / bật `lastUpdated` ở footer                                                  | `technically-invalid` | `app/[lang]/(docs)/[[...slug]]/page.tsx` renders title, description, page actions, and body; `app/[lang]/(docs)/layout.tsx` supplies the Fumadocs layout without a last-updated footer. The `last_updated` review field is metadata, not rendered footer text. |
| Code-block titles / tiêu đề code block                                                                                 | `restored`            | The current `2026-08-22` entry records this Fumadocs behavior; titled fences remain in both Quickstart files and other guides.                                                                                                                                 |
| Line highlighting / line highlighting                                                                                  | `restored`            | The current `2026-08-22` entry records this behavior; both Quickstart files retain the `{6}` highlighted-line example and explanation.                                                                                                                         |
| Tabs for multi-language snippets / Tabs cho snippet đa ngôn ngữ                                                        | `technically-invalid` | `components/mdx.tsx` registers the Fumadocs MDX components plus `Mermaid`, but the current `content/en` and `content/vi` trees contain no `Tabs` or `Tab` nodes or multi-language tabbed snippet.                                                              |
| Five task-oriented How-to guides / 5 hướng dẫn theo tác vụ                                                             | `restored`            | The current `2026-08-22` entry records the five-guide collection in both locales.                                                                                                                                                                              |
| API, configuration, and environment-variable Reference pages / các trang Reference về API, cấu hình và biến môi trường | `restored`            | The current `2026-08-22` entry names all three reference areas in both locales.                                                                                                                                                                                |
| FAQ page / trang FAQ                                                                                                   | `restored`            | The current `2026-08-22` entry records the FAQ in both locales.                                                                                                                                                                                                |

#### Baseline `2026-08-20` facts

| Baseline fact (EN / VI)                                                                                                                      | Outcome               | Current destination or evidence                                                                                                                                                                                   |
| -------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| First 10 English chapters translated from the canonical Chinese Pi Agent Book / 10 chương tiếng Anh đầu tiên dịch từ nguồn tiếng Trung chuẩn | `restored`            | The current `2026-08-20` entry now retains the Chinese-source provenance in both locales while later pages continue to prefer pinned upstream Pi for changed implementation details.                              |
| Vietnamese translations for all 10 chapters / bản dịch tiếng Việt cho cả 10 chương                                                           | `retained`            | The current `2026-08-20` entry already records the first 10 English and Vietnamese chapters.                                                                                                                      |
| English, Vietnamese, and Chinese public language support / hỗ trợ công khai ba ngôn ngữ Anh, Việt, Trung                                     | `technically-invalid` | `lib/i18n.ts` defines only `languages: ["en", "vi"]`, and the public translation manifest contains only English and Vietnamese paths. Chinese remains source provenance, not a public locale.                     |
| Search index via Pagefind / search index qua Pagefind                                                                                        | `technically-invalid` | `app/api/search/route.ts` builds search with `createFromSource` from `fumadocs-core/search/server`; `package.json` has no Pagefind dependency.                                                                    |
| Hero landing page on `/en` with a chapter grid / hero tại `/en` với chapter grid                                                             | `technically-invalid` | `app/[lang]/(docs)/[[...slug]]/page.tsx` serves the locale root as a normal Fumadocs `DocsPage` backed by `content/en/index.mdx`; the current page has reading paths and section links, not the former hero grid. |
| Custom 404 page / trang 404 tùy chỉnh                                                                                                        | `restored`            | The current `2026-08-20` entries now retain this history; `app/not-found.tsx` is the current custom implementation.                                                                                               |
| Sitemap generation / tạo sitemap                                                                                                             | `restored`            | The current `2026-08-20` entries now retain this history; `app/sitemap.ts` returns the generated bilingual route set.                                                                                             |

## Reviewed mapping appendix: Chapter 1

This appendix compares the Chapter 1 pair at `b10130f` with the restored English and Vietnamese pages. The ledger counts 57 pair-level decisions: 22 heading decisions and 35 unique artifact or argument decisions. They reconcile as `48 restored + 5 merged + 4 technically-invalid + 0 duplicate = 57`. Both final pages have H2/H3/H4 `7/15/0`, eight paired fences with languages `text`, `mermaid`, `bash`, `bash`, `json`, `typescript`, `typescript`, `typescript`, four tables, and one Mermaid block. No preservation-manifest deletion allowance is needed because every invalid claim was replaced in place with the current teaching equivalent.

### Baseline H2–H4 outcomes

The baseline has no H4 heading. Every H2 and H3 below applies to the matching English and Vietnamese heading pair.

- H2 `1. Opening: three questions, one answer` / `1. Mở đầu: ba câu hỏi, một đáp án` — `restored` with the same three reader motives and the three-identity answer.
- H2 `2. What is Pi: a single diagram` / `2. Pi là gì: một sơ đồ là đủ` — `restored`.
- H3 `One-sentence definition` / `Định nghĩa một câu` — `restored` as `One-sentence definition` / `Định nghĩa trong một câu`; the definition keeps upstream's minimal terminal shell position.
- H3 `Key numbers` / `Những con số chính` — `restored` as a stable pinned snapshot. Volatile star, provider-count, and source-line claims were replaced with version, runtime, Tool, package-boundary, execution-path, and session-shape facts.
- H3 `Four core packages, each with a job` / `Bốn package cốt lõi, mỗi cái một việc` — `restored` as the four foundational package roles, with exact active package names.
- H2 `3. View 1: as a coding agent: a daily tool that is good` / `3. Góc nhìn 1: với tư cách coding agent: một công cụ hằng ngày thực sự tốt` — `restored` with a natural heading edit.
- H3 `3.1 What Pi is: building blocks, not a finished car` / `3.1 Pi là gì: khối xếp hình (building blocks), không phải chiếc xe hoàn chỉnh` — `restored`; the car analogy, usable default assembly, ownership argument, and audience check remain.
- H3 `3.2 Five customization levers: any feature Pi lacks, you can build yourself` / `3.2 Năm cần điều chỉnh: tính năng Pi thiếu, bạn có thể tự xây` — `restored`; the five levers remain Extensions, Skills, Prompt Templates, Themes, and Pi Packages.
- H3 `3.3 The everyday dividend: the default config is already great` / `3.3 Lợi ích hằng ngày: cấu hình mặc định đã tốt rồi` — `restored` as useful defaults without unsupported benchmark or token-count claims.
- H3 `3.4 Up and running in one minute` / `3.4 Lên sóng trong một phút` — `restored` with the current package and Node.js requirement.
- H3 `3.5 Not via environment variables: define third-party models with models.json` / `3.5 Không qua biến môi trường: định nghĩa model bên thứ ba bằng models.json` — `technically-invalid`; it is replaced by `Model definitions and credentials: configure models.json` / `Định nghĩa Model và credential: cấu hình models.json`. The pinned [custom-model documentation](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/coding-agent/docs/models.md#provider-configuration) states that `apiKey` may be omitted when `/login`/`auth.json` or `--api-key` supplies auth and documents environment interpolation, while the [Pi AI auth documentation](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/ai/README.md#auth) confirms provider-owned environment-variable resolution. The replacement preserves the distinction between Model definitions and credentials.
- H2 `4. View 2: as a learning resource: a textbook for Agent design` / `4. Góc nhìn 2: với tư cách tài liệu học tập: giáo trình thiết kế Agent` — `restored`.
- H3 `4.1 Why Pi? Because it is small enough to read` / `4.1 Tại sao là Pi? Vì nó đủ nhỏ để đọc hết` — `restored` as a readable end-to-end code path, without unsupported line or benchmark figures.
- H3 `4.2 What this tutorial covers` / `4.2 Tutorial này sẽ trình bày gì` — `restored` with the full ten-chapter learning progression.
- H3 `4.3 Pi's philosophy of subtraction: the real lesson is in the trade-offs` / `4.3 “Triết lý trừ” của Pi: bài học thật sự nằm trong đánh đổi` — `restored` with the six omissions, substitutes, costs, and transferable lessons.
- H2 `5. View 3: as an SDK: build your own Agent` / `5. Góc nhìn 3: với tư cách SDK: xây Agent của riêng bạn` — `restored`.
- H3 `5.1 SDK stack: three-layer architecture plus one orthogonal UI library` / `5.1 Stack SDK: kiến trúc ba lớp cộng một thư viện UI trực giao` — `restored` with current `Models`, `Agent`, and `createAgentSession()` APIs.
- H3 `5.2 Extension system: let the Agent modify its own capabilities` / `5.2 Hệ thống Extension: để Agent tự sửa năng lực của mình` — `restored`; the reload lifecycle is corrected against the pinned Extension docs.
- H3 `5.3 Four run modes` / `5.3 Bốn chế độ chạy` — `restored` with upstream's interactive, print-or-JSON, RPC, and SDK grouping.
- H3 `5.4 Open-source projects are already using it` / `5.4 Các dự án mã nguồn mở đã sử dụng` — `restored` as `Ecosystem examples from the upstream tree` / `Ví dụ hệ sinh thái trong upstream tree`, using pinned Extension and SDK examples rather than a volatile external project count.
- H2 `6. Pi's opposite: two opposing philosophies` / `6. Mặt đối lập của Pi: hai triết lý ngược nhau` — `restored` as a comparison between integrated-product and building-block philosophies without volatile competitor metrics.
- H2 `7. Summary` / `7. Tổng kết` — `restored` with the tool, learning-resource, and SDK identities plus a concrete path to chapters 2 and 3.

### Unique artifact and argument outcomes

- Opening blockquote naming Pi's three identities — `restored` in both locales.
- Three-question ordered list — `restored` in the same order and with the same reader motives.
- Key-numbers table — `restored` as a seven-row pinned snapshot; the teaching function remains while volatile popularity and line-count rows are replaced.
- Baseline blockquote reconciling old marketing numbers — `merged` into the stable-snapshot note, which explains why stars, catalog size, and source-line totals are poor architectural invariants.
- Plain-text four-package architecture diagram — `restored` with exact scoped package names.
- Mermaid package/dependency diagram — `restored` with the current valid `flowchart TB` syntax and paired localized labels.
- Experimental `pi-orchestrator` note — `technically-invalid`; the pinned [packages tree](https://github.com/badlogic/pi-mono/tree/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages) contains no orchestrator package. The replacement identifies the current protocol, client, telemetry, SQLite backend, and server packages, and the pinned [`pi-server` manifest](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/server/package.json) labels that server package experimental.
- Finished-car versus building-block comparison and audience check — `restored` without claiming one workflow is universally better.
- Pasquale ownership quotation — `merged` into the unattributed ownership lesson blockquote; the current text retains first-result polish versus long-term workflow control without depending on an unpinned community quotation.
- Rushi Extension-capability quotation — `merged` into the capability list and pinned upstream example discussion.
- Five-lever explanations for Extensions, Skills, Prompt Templates, Themes, and Pi Packages — `restored`, including progressive disclosure and distribution roles.
- Pi Package install-command fence — `restored` and updated with pinned npm/git examples plus a local-path example.
- Baseline lever-summary note — `merged` into the section's closing upgrade-path paragraph.
- Clean-context/default-Tool argument — `restored` using inspectable resource and Tool boundaries instead of unsupported prompt-token totals.
- Transparency argument — `restored` with visible resources, transcripts, Tool calls, JSONL/HTML exports, cost, and token usage.
- Model-choice argument — `restored` with provider-owned catalogs, `/model`, `Ctrl+L`, scoped cycling, and cross-provider hand-off.
- Tree-shaped-session argument — `restored` with `id`/`parentId`, `/tree`, `/fork`, `/clone`, and the distinction between full history and compacted active context.
- Default execution and safety argument — `restored`; it now distinguishes project trust, per-command approval, version-control recovery, and container/VM isolation.
- One-minute installation fence — `restored` with `@earendil-works/pi-coding-agent`, `--ignore-scripts`, and Node.js `>=22.19.0`.
- `models.json` example fence — `restored` as valid JSON with supported protocol, environment interpolation, Model metadata, and a narrow `compat` override.
- `models.json` field, selection, defaults, `modelOverrides`, and `compat` explanation — `restored` with current `/model`, `--list-models [search]`, and credential-resolution behavior.
- Ten-chapter tutorial table — `restored` with all ten rows and the same foundation-to-advanced progression.
- Roadmap callout — `restored` inside the reading-path callout as explicit follow-on topics outside the published ten chapters.
- Reading-advice callout — `merged` into the same reading-path callout: chapters 1–6 remain sequential, while chapters 7–10 work as focused references.
- Six-row philosophy-of-subtraction table — `restored`; the unsupported MCP token figure is replaced by upstream's current rationale while all six substitutes remain.
- Pi AI TypeScript example — `restored` with `createModels()`, `anthropicProvider()`, `models.stream()`, and `stream.result()`.
- Agent Core TypeScript example — `restored` with current `Agent` initial state and injected `models.streamSimple`.
- Coding Agent TypeScript example — `restored` with `ModelRuntime.create()`, `SessionManager.inMemory()`, and the `{ session }` return from `createAgentSession()`.
- Orthogonal TUI argument — `restored` from the pinned package dependency boundary and absence of sibling Pi imports, without volatile source-line totals.
- Extension capability list and self-modification lesson — `restored`; `/reload`, `ctx.reload()`, immediate dynamic registration, and Theme hot reload are distinguished explicitly.
- Four-mode table — `restored` with exact CLI flags `-p`, `--mode json`, and `--mode rpc`, plus `createAgentSession()` for SDK use.
- OpenClaw production-adoption claim — `technically-invalid` for this pinned review because the upstream README and docs at `a470b121` do not identify that external project or establish its production status. The replacement uses the auditable [Extension examples](https://github.com/badlogic/pi-mono/tree/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/coding-agent/examples/extensions) and [SDK examples](https://github.com/badlogic/pi-mono/tree/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/coding-agent/examples/sdk).
- Opposing-philosophies comparison — `restored` without unsupported competitor star or system-prompt counts; the integrated-product and replaceable-building-block trade-offs remain.
- Three-part summary — `restored` with the coding-tool, learning-resource, and SDK takeaways.
- Baseline `v0.80.2` version note — `technically-invalid`; the four pinned package manifests, including [`@earendil-works/pi-coding-agent`](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/coding-agent/package.json), report version `0.84.2` and Node.js `>=22.19.0`. The final note records both the current version and exact commit.

## Reviewed mapping appendix: Chapter 2

This appendix compares the Chapter 2 pair at `b10130f` with the restored English and Vietnamese pages. The ledger counts 70 pair-level decisions: 26 heading decisions and 44 unique artifact or argument decisions. They reconcile as `64 restored + 1 merged + 5 technically-invalid + 0 duplicate = 70`. Both final pages have H2/H3/H4 `8/18/0`, 18 paired fences with languages `text`, `typescript`, `typescript`, `typescript`, `text`, `text`, `jsonc`, `typescript`, `text`, `typescript`, `typescript`, `typescript`, `typescript`, `typescript`, `text`, `typescript`, `typescript`, `typescript`, two tables, and no Mermaid block. No preservation-manifest deletion allowance is needed because each invalid claim was replaced in place with a current teaching equivalent.

### Baseline H2–H4 outcomes

The baseline has no H4 heading. Every H2 and H3 below applies to the matching English and Vietnamese heading pair.

- H2 `1. You just opened an Agent codebase` / `1. Bạn vừa mở một codebase Agent` — `restored` with the pinned workspace tree, current scoped package names, and the distinction between the three-layer model and the larger monorepo.
- H2 `2. Five packages, each with a job` / `2. Năm package, mỗi cái một việc` — `restored` as `Five package roles, each with a job` / `Năm vai trò package, mỗi vai trò một việc`; the heading now describes five teaching roles without claiming that the repository contains only five packages.
- H3 `2.1 pi-ai: in charge of "calling models"` / `2.1 pi-ai: phụ trách "gọi mô hình"` — `restored` as `calling models` / `gọi model`, with the current `Models`, `Provider`, `Model`, `Message`, `Context`, and stream boundary.
- H3 `2.2 pi-agent-core: in charge of "running the loop"` / `2.2 pi-agent-core: phụ trách "chạy vòng lặp"` — `restored` with `Agent`, `AgentState`, `AgentMessage`, `AgentTool`, queues, events, context conversion, reusable session support, and compaction.
- H3 `2.3 pi-coding-agent: in charge of "the actual product"` / `2.3 pi-coding-agent: phụ trách "sản phẩm thực tế"` — `restored` with the CLI, `AgentSession`, sessions, Extensions, Skills, coding Tools, resources, and TUI adapters.
- H3 `2.4 pi-tui: in charge of "display"` / `2.4 pi-tui: phụ trách "hiển thị"` — `restored` as an orthogonal terminal UI library whose runtime manifest has no dependency on the three Agent packages.
- H3 `2.5 pi-orchestrator: in charge of "multi-Agent orchestration" (experimental)` / `2.5 pi-orchestrator: phụ trách "điều phối đa Agent" (thử nghiệm)` — `technically-invalid`; the pinned [packages tree](https://github.com/badlogic/pi-mono/tree/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages) has no orchestrator workspace. It is replaced in place by `pi-server: an experimental service boundary` / `pi-server: một service boundary thử nghiệm`. The [`pi-server` manifest](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/server/package.json) labels the package experimental, and its [README](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/server/README.md) says applications supply `PiServerService`; it provides no standalone CLI or coding-agent service.
- H2 `3. After reading five packages, you have an intuition` / `3. Sau khi đọc năm package, bạn đã có một trực giác` — `restored` as `A first architectural model` / `Mô hình kiến trúc ban đầu`, preserving the core-stack model and placing TUI and server beside it.
- H2 `4. Open package.json, things are not so simple` / `4. Mở package.json ra, mọi thứ không đơn giản như vậy` — `restored` with the current direct dependencies and the adjacency-versus-direction complication.
- H3 `The answer is hiding in the type system` / `Câu trả lời nằm trong hệ thống kiểu dữ liệu` — `restored` as `type system` / `hệ thống type`; it retains type-level dependency teaching and adds the runtime evidence required by the pinned code.
- H3 `So what is the actual layering rule?` / `Vậy quy tắc phân lớp thực sự là gì?` — `restored` with the one-way lower-to-upper rule and concrete import checks.
- H2 `5. Type progression between layers: from atoms to molecules` / `5. Sự tiến hoá kiểu dữ liệu giữa các lớp: từ nguyên tử tới phân tử` — `restored` as a progression through atoms, molecules, and product materials.
- H3 `Layer 1: pi-ai defines the atoms` / `Lớp 1: pi-ai định nghĩa các nguyên tử` — `restored` with exact current members of `Message`, `Model`, and `Tool`.
- H3 `Layer 2: pi-agent-core composes the atoms into molecules` / `Lớp 2: pi-agent-core gộp các nguyên tử thành phân tử` — `restored` with the actual `AgentMessage` union and `AgentTool extends Tool` contract.
- H3 `Layer 3: pi-coding-agent builds molecules into materials` / `Lớp 3: pi-coding-agent kết hợp phân tử thành vật liệu` — `restored` with `AgentSession`, `SessionEntry`, `ResolvedResource`, the loaded `Extension` aggregate, and the explicit adapter from `ToolDefinition` to `AgentTool`. The current package exports no invented `CodingAgentMessage` type.
- H3 `Before → After comparison of the type extension` / `So sánh Before → After của sự tiến hoá kiểu dữ liệu` — `restored` with the three layer-owned shapes plus the required `wrapToolDefinition()` handoff back to the Agent Core contract.
- H2 `6. Do I need three layers when writing my own Agent?` / `6. Khi viết Agent của riêng tôi, tôi có thực sự cần ba lớp không?` — `restored` as `When writing my own Agent` / `Khi viết Agent riêng`, retaining all three adoption scenarios.
- H3 `Scenario A: no layering, everything in one file` / `Kịch bản A: không phân lớp, tất cả gom vào một file` — `restored` with the single-file conceptual example and coupling costs.
- H3 `Scenario B: only two layers (drop the coding-agent layer)` / `Kịch bản B: chỉ hai lớp (bỏ lớp coding-agent)` — `restored` as `without the coding-agent product` / `không dùng sản phẩm coding-agent`, using current `Agent`, `createModels()`, provider factory, and injected `streamFn` APIs.
- H3 `Scenario C: only one layer (only pi-ai)` / `Kịch bản C: chỉ một lớp (chỉ pi-ai)` — `restored` with a valid standalone Pi AI streaming example.
- H3 `Layering is not dogma; dependency-direction control is` / `Phân lớp không phải giáo điều; kiểm soát hướng phụ thuộc mới là` — `restored` as `Dependency direction matters more than the number of layers` / `Hướng dependency quan trọng hơn số lượng lớp`, retaining the decision rule without a slogan-shaped contrast.
- H2 `7. Three portable methods` / `7. Ba phương pháp có thể mang đi` — `restored` as methods that can move to another project.
- H3 `Method 1: the "dependency funnel"` / `Phương pháp 1: "phễu phụ thuộc" (dependency funnel)` — `restored` as `dependency funnel` / `phễu dependency`, with the four-step placement and import-audit procedure.
- H3 `Method 2: the "progressive type extension" pattern` / `Phương pháp 2: pattern "tiến hoá kiểu dữ liệu từng bước"` — `restored` with union, inheritance, composition, explicit adapters, and the downward conversion requirement.
- H3 `Method 3: the "independently usable" test` / `Phương pháp 3: test "có thể dùng độc lập"` — `restored` with package-isolation checks for Pi AI, Agent Core, Pi TUI, and the assembled Coding Agent.
- H2 `8. Next step: drill into the Agent's heart` / `8. Bước tiếp theo: đào vào trung tâm của Agent` — `restored` as `go into` / `đi vào`, with the same hand-off to the full Agent Loop journey.

### Unique artifact and argument outcomes

- Opening blockquote explaining the chapter's architecture map and its value during later source tours — `restored` in both locales.
- Plain-text repository tree — `restored` with active scoped package names, current `server`, `client`, `protocol`, `telemetry`, `evals`, and `session-backends` directories, and no retired active package.
- Historical `pi-web-ui` note — `merged` into the pinned-version boundary paragraph. The final text preserves the warning that older material may name the package while making only the auditable current claim that it is not a workspace at `a470b121`.
- npm workspaces explanation and the opening architectural question — `restored`; the root [`package.json`](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/package.json) shows `packages/*`, session backends, and selected Extension examples, so workspace membership is separated from architectural layering.
- Core-three versus auxiliary-boundary argument — `restored` with the model/runtime/product teaching stack plus orthogonal UI, experimental service, and support packages.
- Pi AI manifest description and responsibility list — `restored` with current `Models`, `Provider`, `Model`, auth, catalog, `Message`, `Context`, `Tool`, and stream roles.
- Pi AI `index.ts` export fence — `restored` from the pinned [root entry](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/ai/src/index.ts), including side-effect-free root exports and the explicit provider-factory subpath.
- Pi AI negative boundary argument — `restored`; model transport owns neither the Agent Loop nor coding-session persistence.
- Agent Core manifest description and responsibility list — `restored` with state, loop, queues, context conversion, events, sessions, compaction, prompts, Skills, and managed Tool environments.
- Agent Core `index.ts` export fence — `restored` against the pinned [entry point](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/agent/src/index.ts).
- Coding Agent manifest description and product-capability list — `restored` with CLI modes, seven coding Tools, session lifecycle, credentials/settings/trust, Extensions, Skills, resources, and TUI adapters.
- Coding Agent CLI fence — `restored` as selected exact lines from the current [`cli.ts`](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/coding-agent/src/cli.ts).
- Plain-text CLI-to-loop startup chain — `restored` with current resource/model setup and mode selection between `main.ts` and `AgentSession`.
- TUI dependency and orthogonality argument — `restored`; the pinned [`pi-tui` manifest](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/tui/package.json) lists only `marked` and `get-east-asian-width` as runtime dependencies and no sibling Pi package.
- Baseline orchestrator supervisor/RPC/radius/serve/storage description and warning — `technically-invalid`; no orchestrator package exists at the pin. The replacement documents `PiServer`, `PiServerService`, authenticated listeners, protocol DTO adapters, and the explicit experimental warning supported by the server manifest and README, without presenting it as multi-Agent orchestration.
- Plain-text three-layer intuition diagram with separate UI — `restored` and extended in place with the experimental server boundary beside the stack.
- Advanced reading-path callout for dependency and type details — `restored`, still directing package-choice readers to Section 6.
- Coding Agent dependency-manifest fence — `restored` as a JSONC excerpt of the three selected foundational dependencies, with exact package names and version `^0.84.2` from the pinned [`package.json`](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/coding-agent/package.json). The accompanying text records that the full manifest also contains `@earendil-works/pi-client` and `@earendil-works/pi-protocol`.
- Direct dependency on both Agent Core and Pi AI, plus the adjacent-layer surprise — `restored` as the question that motivates the one-way rule.
- TypeScript structural-type dependency argument and public Pi AI type examples — `restored` without treating type imports as runtime calls.
- Claim that Coding Agent “only re-exports types from” Pi AI — `technically-invalid`; pinned files such as [`main.ts`](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/coding-agent/src/main.ts), [`agent-session.ts`](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/coding-agent/src/core/agent-session.ts), and compaction code import runtime values including `modelsAreEqual`, `contentText`, retry helpers, and `uuidv7`. The final pages explain both the type and runtime edges.
- Agent Core base-type import fence — `restored` with the current Pi AI types used by `packages/agent/src/types.ts`.
- One-way dependency rule blockquote and three package checks — `restored` in both locales.
- Counterexample showing an upward `AgentState` import into Pi AI as a violation — `restored`, together with the product-policy examples for session paths and permission UI.
- Plain-text dependency-direction diagram — `restored` with direct Pi AI-to-Coding Agent and TUI-to-Coding Agent edges, plus the separate Pi AI/protocol-to-server edges.
- Pi AI atom fence — `restored` with exact current members of `Message`, `Model<TApi>`, and `Tool<TParameters>`; omitted members are clearly described as an abridgement.
- Agent Core molecule fence — `restored` with `AgentMessage`, `AgentTool`, `prepareArguments`, `execute`, Tool updates, and sequential/parallel execution.
- Coding Agent `ToolDefinition` fence — `restored` as an explicitly abridged product interface with prompt and rendering hooks plus the required fifth `ctx: ExtensionContext` execution parameter. The final text states that this signature is not directly assignable to the four-argument `AgentTool.execute` contract.
- Tool-definition adapter boundary — `restored` from the pinned [`tool-definition-wrapper.ts`](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/coding-agent/src/core/tools/tool-definition-wrapper.ts) and [`extensions/wrapper.ts`](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/coding-agent/src/core/extensions/wrapper.ts). `wrapToolDefinition()` constructs an `AgentTool` and supplies the product context to `ToolDefinition.execute`; `wrapRegisteredTool()` passes `runner.createContext()` as the factory used for Extension Tools.
- Loaded `Extension` aggregate example — `restored` with every current field from pinned [`extensions/types.ts`](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/coding-agent/src/core/extensions/types.ts): paths, visibility, source metadata, handlers, Tools, message renderers, optional Markdown and entry renderers, commands, flags, and shortcuts. The pinned [`loader.ts`](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/coding-agent/src/core/extensions/loader.ts) initializes the collections and writes `ExtensionAPI` registrations into them; `ExtensionRunner` dispatches or resolves the registrations, while `AgentSession._refreshToolRegistry()` wraps registered Tool definitions into the Agent Core runtime registry.
- Seven built-in coding-Tool example list (`read`, `bash`, `edit`, `write`, `grep`, `find`, `ls`) — `restored`.
- Plain-text Before → After comparison — `restored` with all three layer-owned shapes, their field additions, and a fourth adapter handoff showing the four-argument `AgentTool` that enters Agent Core.
- Scenario A single-file OpenAI fence and coupling argument — `restored` as clearly labeled conceptual pseudocode.
- Scenario B two-layer fence and ownership argument — `restored` with current scoped imports, provider registration, model lookup, and `streamFn` injection.
- Scenario C Pi AI-only fence and ownership argument — `restored` with `Models.streamSimple()` and a valid `UserMessage` shape.
- Three-row scenario decision table — `restored` with the same one-, two-, and three-layer choices and explicit responsibilities left to the application.
- Claim that the dependency rule lets Pi AI be replaced without changing Agent Core or Coding Agent — `technically-invalid`; Agent Core's pinned [`types.ts`](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/agent/src/types.ts) explicitly imports Pi AI contracts. The replacement states the defensible guarantee: upper consumers can be removed while lower packages remain usable, and alternative streaming behavior enters through `StreamFn` while preserving its Pi AI-shaped contract.
- Dependency-funnel definition, four-step procedure, and removal question — `restored` with source-import auditing as the concrete check.
- Progressive-type-extension definition, four-step procedure, and reuse benefit — `restored`; it now covers union, inheritance, composition, explicit adapters, the lossy `convertToLlm` message boundary, and the `wrapToolDefinition()` Tool boundary.
- Independently-usable definition, package examples, and manifest-removal procedure — `restored` with isolated build/test guidance that avoids monorepo dependency masking.
- Next-step summary of the three layers, dependency rule, type progression, and optional package choices — `restored` and updated with current names, types, TUI, and server scope.
- Book-structure callout — `restored`; Chapters 1–6 remain sequential, while Chapter 7 onward can be read as focused advanced references.
- Baseline Pi `v0.80.2` version note — `technically-invalid`; the pinned manifests for [Pi AI](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/ai/package.json), [Agent Core](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/agent/package.json), [Coding Agent](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/coding-agent/package.json), and [Pi TUI](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/tui/package.json) report `0.84.2`. The final note records that version and the full commit.
- `Next up` callout linking Chapter 3 — `restored` in both locales.

The thinner pre-restoration Chapter 2 pages also contained a seven-step request data path and a five-row change-placement table. Those current artifacts are retained inside Sections 3 and 6 respectively. They are outside the 70 baseline decisions above and therefore do not alter the ledger outcome counts.
