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
| ch03-agent-loop                 | 3059 words; H2/H3/H4 6/25/6; fences 37; tables 7; Mermaid 0  | 3312 words; H2/H3/H4 6/25/6; fences 37; tables 7; Mermaid 0  |       83 |      1 |                  16 |         0 | reviewed | reviewed   | checked |
| ch04-model-invocation           | 3418 words; H2/H3/H4 7/13/0; fences 22; tables 2; Mermaid 0  | 3915 words; H2/H3/H4 7/13/0; fences 22; tables 2; Mermaid 0  |       61 |      1 |                  20 |         0 | reviewed | reviewed   | checked |
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

## Reviewed mapping appendix: Chapter 3

This appendix compares the Chapter 3 pair at `b10130f` with the restored English and Vietnamese pages. It records 100 pair-level decisions: 37 baseline H2–H4 headings and 63 unique artifacts or arguments. They reconcile as `83 restored + 1 merged + 16 technically-invalid + 0 duplicate = 100`. No item was deleted for brevity.

The final English page has 2,690 prose words, 87.94% of its 3,059-word baseline. The final Vietnamese page has 2,941 prose words, 88.80% of its 3,312-word baseline. Both pages have H2/H3/H4 `6/25/6`, 42 paired fences with an identical language sequence, 10 tables, and no Mermaid block. The additional fences and tables split dense historical diagrams and distinguish current control states; they do not reduce any baseline artifact. No preservation-manifest deletion allowance is needed.

Technical review used these pinned files:

- [`packages/agent/src/agent-loop.ts`](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/agent/src/agent-loop.ts) for entry signatures, the inner and outer loops, streaming replacement, queue order, truncated calls, Tool scheduling, hooks, termination, and events.
- [`packages/agent/src/agent.ts`](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/agent/src/agent.ts) for `Agent` construction, snapshots, queues, subscriptions, state reduction, abort, continuation, and settlement.
- [`packages/agent/src/types.ts`](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/agent/src/types.ts) for `StreamFn`, `AgentLoopConfig`, hook contracts, `AgentState`, Tool execution modes, and `AgentEvent`.
- [`packages/agent/src/stream-fn.ts`](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/agent/src/stream-fn.ts) for explicit/default stream-function behavior.
- [`packages/ai/src/types.ts`](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/ai/src/types.ts) and [`packages/ai/src/utils/event-stream.ts`](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/ai/src/utils/event-stream.ts) for `StopReason`, deferred handles, assistant stream events, and `EventStream.result()`.
- [`packages/coding-agent/src/core/sdk.ts`](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/coding-agent/src/core/sdk.ts), [`messages.ts`](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/coding-agent/src/core/messages.ts), and [`agent-session.ts`](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/coding-agent/src/core/agent-session.ts) for Coding Agent’s `StreamFn` wrapper, message conversion, context transformation, next-Turn refresh, steering, follow-up, settings, and session behavior.

### Baseline H2–H4 outcomes

Every entry applies to the matching English and Vietnamese heading pair. The baseline and final pages both have 37 H2–H4 headings.

- H01 — H2 `Prelude: three ways to use an LLM` / `Mở đầu: ba cách dùng LLM` — `restored` with the same direct-call, Workflow, and Agent Loop progression.
- H02 — H3 `Mode 1: direct call` / `Kiểu 1: gọi trực tiếp` — `restored` with the current `Models.streamSimple()` API.
- H03 — H3 `Mode 2: Workflow` / `Kiểu 2: Workflow` — `restored` with application-owned state-machine control.
- H04 — H3 `Mode 3: Agent Loop` / `Kiểu 3: Agent Loop` — `restored` with model-selected Tools bounded by runtime policy.
- H05 — H2 `Two concepts to clarify first: Trace and Turn` / `Hai khái niệm cần nắm trước: Trace và Turn` — `restored`.
- H06 — H3 `Trace (one complete run)` / `Trace (một lần chạy đầy đủ)` — `restored` while labeling Trace as a teaching term rather than an exported Pi type.
- H07 — H3 `Turn (one round)` / `Turn (một vòng)` — `restored` with the current event contract: one assistant response plus its Tool batch.
- H08 — H3 `relationship between Trace and Turn` / `quan hệ giữa Trace và Turn` — `restored` with the nested three-Turn example.
- H09 — H2 `Big picture: how a message journeys, and how the loop spins` / `Toàn cảnh: hành trình một message, và vòng lặp quay ra sao` — `restored`.
- H10 — H3 `Full flow` / `Flow toàn cảnh` — `restored` with the full prompt-to-settlement route.
- H11 — H3 `How the loop spins: stopReason: the only signal` / `stopReason: đèn tín hiệu duy nhất` — `technically-invalid`; `StopReason` at the pin also includes `pending` and `deferred`, and loop control depends on Tool blocks, truncated-call handling, batch termination, `shouldStopAfterTurn`, and queues. It is replaced in place by `What keeps the loop moving, and what ends it` / `Điều gì làm vòng lặp chạy tiếp, và điều gì kết thúc nó`.
- H12 — H3 `One rule drives the entire loop` / `Một quy tắc dẫn dắt cả vòng lặp` — `restored` as the narrower, defensible rule for ordinary continuation.
- H13 — H3 `Minimal Loop` / `Vòng lặp tối thiểu` — `restored` with an explicitly labeled pseudocode kernel.
- H14 — H3 `All exit paths of the loop` / `Mọi đường thoát của vòng lặp` — `restored` and expanded with deferred and thrown-callback boundaries.
- H15 — H2 `Source walkthrough: base Loop and the layering design of coding-agent` / `Đi sâu source: Loop nền và thiết kế lớp phủ của coding-agent` — `restored`.
- H16 — H3 `What coding-agent layers on top` / `coding-agent phủ lên trên những gì` — `technically-invalid` as an ownership claim; queues, turn hooks, and Tool scheduling now live in Agent Core. The final section preserves the product-layering lesson and separates reusable mechanisms from Coding Agent policy.
- H17 — H3 `4.1 Entry: what runAgentLoop() receives` / `4.1 Đầu vào: runAgentLoop() nhận gì` — `restored` as the current public entries `Agent`, `agentLoop()`, and `agentLoopContinue()`, followed by the internal snapshots they create.
- H18 — H3 `4.2 Skeleton of runLoop(): core first, then layering` / `Bộ xương của runLoop(): lõi trước, lớp phủ sau` — `restored`.
- H19 — H4 `Core: the inner loop` / `Lõi: inner loop` — `restored` with both continuation operands and a source-faithful abridgement that uses only symbols present in pinned `agent-loop.ts`.
- H20 — H4 `Layering: coding-agent adds two outer shells` / `Lớp phủ: coding-agent thêm hai vỏ ngoài` — `restored` as Agent Core’s outer queue shell plus the stateful `Agent` wrapper, with Coding Agent policy above both.
- H21 — H3 `4.3 steering message injection` / `4.3 steering message injection` — `restored` with exact poll timing and queue modes.
- H22 — H3 `4.4 streamAssistantResponse(): calling the LLM` / `4.4 streamAssistantResponse(): gọi LLM` — `restored` as the current model boundary.
- H23 — H4 `Phase A: context preprocessing` / `Pha A: tiền xử lý context` — `restored` with `transformContext` scope and fallback contract.
- H24 — H4 `Phase B: AgentMessage to Message conversion` / `Pha B: chuyển AgentMessage thành Message` — `restored` with actual Coding Agent message roles and lossy conversion.
- H25 — H4 `Phase C: build Context and call the model` / `Pha C: dựng Context và gọi model` — `restored` with current `StreamFn` injection.
- H26 — H4 `Phase D: stream the response: in-place replacement` / `Pha D: xử lý streaming response: thay tại chỗ` — `restored` with all stream event families and the no-`start` fallback.
- H27 — H3 `4.5 check stopReason` / `4.5 kiểm tra stopReason` — `technically-invalid` as a complete label; the final `Stop and termination checks` / `Kiểm tra stop và termination` retains the hard-stop branch and adds Tool, length, hook, queue, and deferred state.
- H28 — H3 `4.6 executeToolCalls(): execute tools` / `4.6 executeToolCalls(): thực thi tool` — `restored` with current parallel and sequential pipelines.
- H29 — H3 `4.7 turn_end + hooks + recheck steering` / `4.7 turn_end + hook + kiểm tra lại steering` — `restored` with exact `prepareNextTurn` then `shouldStopAfterTurn` order.
- H30 — H3 `4.8 Back to top of the loop` / `4.8 Quay về đầu vòng lặp` — `restored`.
- H31 — H3 `4.9 outer loop: followUp life-extension` / `outer loop: cơ chế kéo dài của followUp` — `restored` without the baseline’s metaphorical wording.
- H32 — H3 `4.10 steering vs followUp` / `steering vs followUp` — `restored` with separate poll points, queue modes, and error behavior.
- H33 — H2 `Summary: four core Loop designs` / `Tổng kết: bốn thiết kế cốt lõi` — `technically-invalid` because the baseline contains only three summary subsections. The final heading says three and preserves all three.
- H34 — H3 `ReAct loop pattern` / `Mô hình vòng lặp ReAct` — `restored`.
- H35 — H3 `stopReason-driven mechanism` / `Cơ chế dẫn dắt bởi stopReason` — `technically-invalid`; replaced by state-based termination covering all current signals.
- H36 — H3 `Core + layering architecture approach` / `Tư duy kiến trúc lõi + lớp phủ` — `restored` with an ownership table.
- H37 — H2 `Next stop` / `Trạm tiếp theo` — `restored` with the Chapter 4 hand-off.

### Unique artifact and argument outcomes

- A01 — Opening hand-off from Chapter 2 and the questions “why loop, how, when stop” — `restored` in direct prose.
- A02 — Direct-call plain-text journey — `restored` with `Models.streamSimple()`.
- A03 — Direct-call code sample — `restored` as a valid `createModels()` plus `anthropicProvider()` example.
- A04 — Direct-call responsibilities and use cases — `restored`.
- A05 — Workflow multi-stage diagram — `restored`.
- A06 — Workflow decision-ownership and use-case argument — `restored`.
- A07 — Agent read/search/answer journey — `restored` with explicit `ToolResultMessage` steps.
- A08 — The application’s two core loop duties — `restored` and expanded with Tool resolution, validation, permissions, queues, and stop policy.
- A09 — Five-row direct/Workflow/Agent comparison table — `restored` with all five baseline dimensions and current control terminology.
- A10 — Three-Turn Trace diagram — `restored`.
- A11 — Inner-iteration Turn skeleton — `restored` with one `streamFn` call and one Tool batch.
- A12 — Three Tool calls in one Turn argument — `restored` with parallel-batch event semantics.
- A13 — Nested Trace/Turn diagram — `restored`.
- A14 — First-Turn event note and full user-message journey — `restored` with the current `runAgentLoop` emission order.
- A15 — Separate provider and framework `stopReason` tables — `merged` into one current final-reason table plus a precise `pending` explanation; no value or source distinction was dropped.
- A16 — Claim that only `stop`, `length`, `toolUse`, `error`, and `aborted` exist — `technically-invalid`; pinned `StopReason` also includes `pending` and `deferred`.
- A17 — Simplified code/comment saying “any tool terminate then stop” — `technically-invalid`; pinned `shouldTerminateToolBatch()` uses non-empty `every` over finalized results.
- A18 — Gas/brake diagram driven solely by `stopReason` — `technically-invalid`; replaced by a state diagram spanning Tool blocks, hooks, queues, errors, abort, and deferred ownership.
- A19 — Minimal-loop rationale and Agent-versus-Workflow distinction — `restored` without claiming Tool presence is the only production signal.
- A20 — Exit-path table — `restored` and expanded from four to six evidenced paths; the deferred row distinguishes host-owned `DeferredHandle` handling from the loop's ordinary `turn_end` and next-Turn hooks, then records that steering and follow-up are polled only when `shouldStopAfterTurn` is falsy.
- A21 — Simplest-loop pseudocode branching on `response.stopReason !== "toolUse"` — `technically-invalid` for current Pi; replaced by explicitly labeled pseudocode that selects complete Tool calls from content.
- A22 — Coding Agent layering table assigning steering, follow-up, and turn hooks to Coding Agent — `technically-invalid` at the pin; the final table separates Agent Core mechanism from Coding Agent policy.
- A23 — Argument that a small Agent can omit coding-product policy — `restored` with `Agent` as the reusable boundary.
- A24 — Entry chain from prompt to loop — `restored` with `Agent.prompt()`, `Agent.continue()`, `agentLoop()`, and `agentLoopContinue()`.
- A25 — `runAgentLoop()` sample with an optional generic `streamFn` fallback — `technically-invalid` as public guidance; current copyable examples pass `models.streamSimple.bind(models)` and current low-level signatures require `StreamFn`.
- A26 — Prompt message data shape — `restored`.
- A27 — Context data and snapshot explanation — `restored` with separate `Agent` and low-level ownership rules.
- A28 — Config and callback inventory — `restored` across the entry example and the source sections.
- A29 — Entry preparation and initial event sequence — `restored`.
- A30 — Before/after context and run-local message collector — `restored` as the `newMessages` explanation.
- A31 — Core inner-loop skeleton — `restored` with current Tool and queue operands.
- A32 — Combined inner/outer loop skeleton — `restored` and placed inside the `Agent` state shell.
- A33 — Steering scenario and injection code — `restored` with no claim of mid-Tool interruption.
- A34 — `transformContext` snippet — `restored` with its no-throw contract and per-request scope.
- A35 — `convertToLlm` boundary call — `restored`.
- A36 — Two-layer message-system explanation and coding-specific roles — `restored` with the pinned inline conversions for `bashExecution`, `custom`, `branchSummary`, and `compactionSummary`; no invented conversion helpers remain.
- A37 — Default converter code — `restored` in the low-level config and explained against `Agent` defaults.
- A38 — Before/after message conversion diagram — `restored` with actual `bashExecution`, `custom`, and summary behavior.
- A39 — Fresh `Context` construction — `restored`.
- A40 — `streamFn || streamSimple` fallback call — `technically-invalid` as active guidance; replaced by injected `models.streamSimple.bind(models)` and a source-faithful Coding Agent `ModelRuntime.streamSimple()` wrapper with inline timeout, retry, attribution-header, and Extension-header settings.
- A41 — Per-Turn Context wrapper and changing/stable fields — `restored` in a four-row table.
- A42 — Anthropic cache table tied to obsolete source line numbers — `technically-invalid` as pinned evidence; replaced in place by a provider-neutral stability/cache-ownership table.
- A43 — Rolling-prefix cache teaching point — `restored` as the rule that provider-visible content and adapter semantics, not JavaScript object identity, determine caching.
- A44 — Tool definitions as a separate provider request field and provider-specific cache behavior — `restored` without stale OpenAI field claims.
- A45 — In-place streaming replacement code — `restored` from pinned `streamAssistantResponse()`.
- A46 — Empty/partial/final assistant-message evolution diagram — `restored`.
- A47 — Hard `error`/`aborted` source branch — `restored` with exact skipped phases.
- A48 — Tool-call extraction from `AssistantMessage.content` — `restored`.
- A49 — Sequential-versus-parallel selection — `restored` with per-Tool `executionMode` override.
- A50 — Three-stage parallel scheduling diagram — `restored` as a stage/order table and explanatory prose.
- A51 — Claim that blocking call B prevents call C from executing — `technically-invalid`; pinned parallel preparation records immediate failures but continues preparing later calls unless abort is observed.
- A52 — Tool result message shape and transcript append — `restored` with normalization and event timing.
- A53 — Batch-wide `terminate` using `every` — `restored` and expanded with hook override semantics and the fact that the flag is not serialized into `ToolResultMessage`.
- A54 — `turn_end`, `prepareNextTurn`, `shouldStopAfterTurn`, and steering sequence — `restored` with the exact pinned order and update semantics.
- A55 — Model/context/thinking replacement scenarios — `restored` as `AgentLoopTurnUpdate` behavior and Coding Agent next-Turn refresh.
- A56 — Inner condition and return-to-top explanation — `restored`.
- A57 — Follow-up outer-loop code and same-run behavior — `restored`, with `Agent.continue()` distinguished as a new run.
- A58 — Steering/follow-up comparison table, timing example, and visual description — `restored` as a six-row mirrored table without the meeting/mailbox analogy.
- A59 — ReAct summary — `restored` with a compact message/Tool/result diagram.
- A60 — Summary claim that `stopReason` drives termination — `technically-invalid`; replaced by the complete state decision.
- A61 — Core-plus-layering summary — `restored` in a four-boundary Agent Core/Coding Agent table.
- A62 — Pi `v0.80.2` version note — `technically-invalid`; pinned package manifests report `0.84.2` and Node.js `>=22.19.0`.
- A63 — `Next up` link to Chapter 4 — `restored`.

The thinner pre-restoration Chapter 3 pages contained a compact `AgentState` interface and a five-item invariant list. Their valid state, event-barrier, Tool-result, provider-boundary, and explicit-stop material is retained across Sections 3, 4.1, 4.6, and 4.7. These are current-page artifacts rather than baseline decisions, so they do not change the 100-decision reconciliation above.

## Reviewed mapping appendix: Chapter 4

This appendix compares the Chapter 4 pair at `b10130f` with the restored English and Vietnamese pages. It records 82 pair-level decisions: 20 baseline H2–H4 headings and 62 unique artifacts or arguments. They reconcile exactly as `61 restored + 1 merged + 20 technically-invalid + 0 duplicate = 82`. Every technically invalid item was replaced in place with its current teaching equivalent; no item was deleted for brevity.

The final English page has 3,009 prose words, 88.03% of its 3,418-word baseline. The final Vietnamese page has 3,400 prose words, 86.85% of its 3,915-word baseline. Both pages have H2/H3/H4 `7/13/0`, 22 paired fences with languages `typescript`, `json`, `json`, `json`, `json`, `json`, `text`, `typescript`, `text`, `text`, `text`, `typescript`, `typescript`, `text`, `typescript`, `text`, `text`, `typescript`, `text`, `typescript`, `typescript`, `text`, two tables, and no Mermaid block. No preservation-manifest deletion allowance is needed.

Technical review used these pinned files:

- [`packages/ai/src/models.ts`](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/ai/src/models.ts) for `Models`, `Provider`, collection routing, `createModels()`, `createProvider()`, auth application, model lookup/refresh, API dispatch, and thinking-level support.
- [`packages/ai/src/types.ts`](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/ai/src/types.ts) and [`utils/event-stream.ts`](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/ai/src/utils/event-stream.ts) for exact message/content-block names, options, `ProviderStreams`, `StreamFunction`, the 12 event variants, terminal shapes, and `result()`.
- [`packages/ai/src/providers/all.ts`](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/ai/src/providers/all.ts) and [`providers/anthropic.ts`](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/ai/src/providers/anthropic.ts) for built-in collection construction, provider factories, catalog ownership, lazy API wiring, and Anthropic credential resolution.
- [`packages/ai/src/api/lazy.ts`](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/ai/src/api/lazy.ts) and [`api/simple-options.ts`](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/ai/src/api/simple-options.ts) for asynchronous setup inside a synchronous stream handle, setup-error normalization, context/token clamping, and standard reasoning budgets.
- [`packages/ai/src/api/anthropic-messages.ts`](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/ai/src/api/anthropic-messages.ts), [`openai-completions.ts`](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/ai/src/api/openai-completions.ts), [`openai-responses.ts`](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/ai/src/api/openai-responses.ts), [`google-generative-ai.ts`](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/ai/src/api/google-generative-ai.ts), and [`bedrock-converse-stream.ts`](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/ai/src/api/bedrock-converse-stream.ts) for provider message conversion, streaming dialects, Tool-call assembly, reasoning translation, cache placement, usage, stop-reason mapping, and terminal errors.
- [`packages/ai/src/auth/resolve.ts`](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/ai/src/auth/resolve.ts), [`utils/provider-retry.ts`](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/ai/src/utils/provider-retry.ts), and [`utils/overflow.ts`](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/ai/src/utils/overflow.ts) for credential ownership and errors, exact request-retry defaults/statuses/backoff/abort behavior, and the three overflow-detection modes.
- [`packages/ai/src/compat.ts`](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/ai/src/compat.ts), the pinned [Pi AI README](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/ai/README.md), and the [package manifest](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/ai/package.json) for the migration-only global API, public import paths/examples, package version `0.84.2`, and Node.js `>=22.19.0`.

### Baseline H2–H4 outcomes

The baseline has no H4 heading. Every entry applies to the matching English and Vietnamese heading pair; the baseline and final pages both have 20 H2–H4 headings.

- H01 — H2 `Problem: same dialog, different models demand different "translations"` / `Vấn đề: cùng một đoạn hội thoại, model khác nhau đòi format "dịch" khác nhau` — `restored` as one conversation crossing multiple provider dialects.
- H02 — H3 `Not just message format: all four dimensions differ` / `Không chỉ format message: bốn chiều đều khác nhau` — `restored` with message/Tool conversion, streaming, reasoning, and cache control tied to exact current Pi types and options.
- H03 — H2 `Solution: three layers, each owning one thing` / `Giải pháp: kiến trúc ba lớp, mỗi lớp phụ trách một việc` — `restored` as three current boundaries: `Models`, provider/API implementation, and the normalized stream contract.
- H04 — H3 `Layer 1: Unified entry` / `Lớp 1: Entry thống nhất` — `technically-invalid` as a global-registry description. At the pin, [`ModelsImpl.stream*()`](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/ai/src/models.ts) routes first by `model.provider`, applies auth, and then lets `Provider` dispatch by `model.api`; the final heading preserves the entry-layer lesson as `Boundary 1: the Models collection` / `Boundary 1: Models collection`.
- H05 — H3 `Layer 2: Event protocol` / `Lớp 2: Event protocol` — `restored` with the exact 12-event union, `deferred` success, interleaving, `contentIndex`, and terminal-event shapes.
- H06 — H3 `Layer 3: Translator` / `Lớp 3: Translator` — `technically-invalid` as current ownership and terminology. [`Provider`](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/ai/src/models.ts) owns catalog/auth/stream dispatch, while modules under [`packages/ai/src/api`](https://github.com/badlogic/pi-mono/tree/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/ai/src/api) implement wire conversion. It is replaced by `Boundary 3: provider and API-adapter responsibilities` / `Boundary 3: trách nhiệm của provider và API adapter`.
- H07 — H3 `StreamFunction: Translator's "onboarding requirements"` / `StreamFunction: "Yêu cầu nhập môn" của translator` — `restored` as the actual `ProviderStreams` and `StreamFunction` contracts, with exact limits on pre-stream versus in-stream failures.
- H08 — H2 `How to use: from call to plugging in a new model` / `Cách dùng: từ gọi đến thêm model mới` — `restored` as ordinary model calls plus the distinct provider/new-wire-protocol integration path.
- H09 — H3 `Scenario 1: Call the model` / `Kịch bản 1: Gọi model` — `restored` with a copyable `createModels()`, `anthropicProvider()`, model lookup, `Models.streamSimple()`, event iteration, and `result()` example.
- H10 — H3 `Scenario 2: Plug in a new model` / `Kịch bản 2: Thêm một model mới` — `technically-invalid` as a three-step global-registry procedure. The final section separates reusing a current API implementation through `createProvider()` from implementing a genuinely new `ProviderStreams` wire protocol, then registers the result through `models.setProvider()`.
- H11 — H2 `[Advanced] Inside the translator: SSE parsing and thinking-mode dialects` / `[Nâng cao] Bên trong translator: SSE parsing và các dialect của thinking mode` — `technically-invalid` in name and scope. It is replaced by `Inside the API adapter: streaming and reasoning dialects` / `Bên trong API adapter: streaming và reasoning dialect`, supported by the pinned API modules.
- H12 — H3 `Streaming: Why do Anthropic and OpenAI parse so differently?` / `Streaming: Tại sao Anthropic và OpenAI lại parse khác nhau hoàn toàn?` — `restored` with exact current Anthropic raw-body SSE, OpenAI SDK chunk, Google response-part, and Bedrock Converse paths.
- H13 — H3 `Thinking mode: four kinds of "thinking", four parameters` / `Thinking mode: bốn kiểu "suy nghĩ", bốn tham số` — `restored` as model-family-specific adaptive effort, token budgets, discrete levels, and API option translation.
- H14 — H3 `How Pi unifies: ThinkingLevel 5-tier scale` / `Pi thống nhất thế nào: thang ThinkingLevel 5 cấp` — `technically-invalid`; [`types.ts`](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/ai/src/types.ts) defines six request levels through `max`, and `ModelThinkingLevel` adds `off`. The final section documents all seven capability levels, exact standard budgets, opt-in `xhigh`/`max`, and current clamp behavior.
- H15 — H2 `[Advanced] Cache control and error handling` / `[Nâng cao] Cache control và xử lý lỗi` — `restored` and expanded to include current retry and cancellation boundaries.
- H16 — H3 `Cache control: Let the model "compute less"` / `Cache control: Cho model "tính ít đi"` — `restored` with `CacheRetention`, default `short`, exact adapter placement, compatibility gates, and normalized usage fields.
- H17 — H3 `Error handling: Encode into the stream, do not break the loop` / `Xử lý lỗi: Mã hóa vào stream, không làm đứt vòng lặp` — `restored` as the current `Models` setup-error wrapper, adapter terminal errors, abort outcomes, explicit request retries, higher-level retry ownership, and overflow detection.
- H18 — H2 `Back to that one line of code` / `Quay lại dòng code đó` — `restored` as the full `Models → Provider → API implementation → AssistantMessageEventStream` route.
- H19 — H3 `Design essence` / `Tinh hoa thiết kế` — `restored` as three direct design rules covering protocol boundaries, owned routing/configuration, and semantic options.
- H20 — H2 `Next stop` / `Trạm tiếp theo` — `restored` with the hand-off from normalized `ToolCall` blocks to Chapter 5's Tool pipeline.

### Unique artifact and argument outcomes

- A01 — Chapter 3 hand-off and the opening one-line `streamSimple` call — `restored` with a `Models` instance and an explicit pseudocode label.
- A02 — Claim that the API directory contains ten translators, each over one thousand lines, serving more than 30 models — `technically-invalid` as a volatile and false universal size claim; the pinned [`api`](https://github.com/badlogic/pi-mono/tree/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/ai/src/api) and [`providers`](https://github.com/badlogic/pi-mono/tree/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/ai/src/providers) trees now contain separate API implementations, lazy wrappers, provider factories, and catalogs of varied sizes. The final opening states the auditable responsibilities without a transient count.
- A03 — Provider-neutral serialized user-message example — `restored` with the exact `UserMessage` fields `role`, `content`, and `timestamp`.
- A04 — Four separate Anthropic, OpenAI, Google, and Bedrock request-shape examples — `restored` as clearly labeled payload pseudocode retaining the field/block differences.
- A05 — Four-card provider-format diagram caption and highlighted differences — `restored` as the four adjacent payload fences plus direct explanation of Tool results, signatures, IDs, and replay.
- A06 — Four-dimension comparison table — `restored` with all baseline dimensions and current shared inputs/options.
- A07 — Combinatorial-difference motivation and the requirement that Agent Loop avoid provider branches — `restored`.
- A08 — Plain-text three-layer architecture diagram — `restored` with `Models`, `Provider`, API implementation, and `AssistantMessageEventStream` ownership.
- A09 — Translation-company coordinator/report/translator analogy — `restored` with its limits stated and provider catalog/auth ownership added.
- A10 — Separate four-layer diagram caption repeating the directory, entry, protocol, and translator flow — `merged` into A08's current route. The final map and surrounding prose retain every boundary and both request/response directions without duplicating the obsolete global directory.
- A11 — `compat.ts` `stream()` excerpt calling `resolveApiProvider(model.api)` as active entry guidance — `technically-invalid`; current code uses [`ModelsImpl.streamSimple()`](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/ai/src/models.ts), reproduced and precisely labeled in place, while the old function remains migration-only in [`compat.ts`](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/ai/src/compat.ts).
- A12 — `BUILTIN_APIS` global registry excerpt as the current provider directory — `technically-invalid`; [`providers/all.ts`](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/ai/src/providers/all.ts) now constructs provider factories and installs them in a `Models` collection. The registration/catalog teaching remains in Sections 2 and 3.
- A13 — Claim that the entry layer is only a router and owns no business logic — `technically-invalid`; [`ModelsImpl.applyAuth()`](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/ai/src/models.ts) resolves credentials, merges headers/env, applies `transformHeaders`, and may replace `baseUrl` before dispatch. The final page documents this exact boundary.
- A14 — Twelve-event protocol diagram — `restored` with exact current names and `deferred` in the successful terminal reason union.
- A15 — Three content families with start/delta/end progression — `restored` for `text`, `thinking`, and `toolCall`, including interleaving and `contentIndex`.
- A16 — Claim that every event carries `partial` — `technically-invalid`; pinned [`AssistantMessageEvent`](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/ai/src/types.ts) gives `message` to `done` and `error` to the terminal `error` event. The final text records both terminal shapes and `result()`.
- A17 — Five-step adapter pipeline — `restored` with `Models` auth, provider API selection, request conversion, transport, normalization, and termination.
- A18 — Argument that request and response conversion contain the provider-specific work — `restored` without unsupported universal source-length claims.
- A19 — Anthropic private-event to Pi-event map — `restored` with `message_start`, all three content families, `content_block_stop`, and `message_delta`.
- A20 — Anthropic stop-reason mapping — `restored` and placed inside the broader terminal protocol.
- A21 — `StreamFunction` signature fence — `restored` as a precisely labeled source-faithful abridgement alongside the current `ProviderStreams` interface.
- A22 — Three contract rules ending in an unconditional “errors never throw” claim — `technically-invalid` at the direct API subpath. Built-in simple adapters such as [`anthropic-messages.ts`](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/ai/src/api/anthropic-messages.ts) and [`google-generative-ai.ts`](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/ai/src/api/google-generative-ai.ts) synchronously validate request auth, while [`Models.stream*()`](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/ai/src/models.ts) captures those calls inside `lazyStream()`. The final page distinguishes the normal collection contract from direct low-level imports.
- A23 — `stream()` versus `streamSimple()` explanation — `restored` with API-specific typed options, provider-neutral `SimpleStreamOptions`, `hasApi()`, and both `complete` variants.
- A24 — Typical streaming call and event-consumer code — `restored` as a self-contained public-API example using `createModels()`, `anthropicProvider()`, `models.streamSimple()`, iteration, and `result()`.
- A25 — Provider-independent consumer argument — `restored` with exact event/content-block names and no provider switch.
- A26 — Three-step new-model onboarding progression — `restored` and expanded into the two current cases: reuse an existing wire API or implement a new `ProviderStreams` contract.
- A27 — Request conversion, response conversion, and error obligations for a new translator — `restored` under current API-adapter terminology.
- A28 — `registerApiProvider()` code as the active registration step — `technically-invalid`; [`compat.ts`](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/ai/src/compat.ts) retains it only for migration. The replacement uses `createProvider()` and `models.setProvider()`.
- A29 — Partial custom `Model` object presented as sufficient registration — `technically-invalid`; pinned [`Model`](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/ai/src/types.ts) also requires identity, capability, cost, context-window, and output-limit data, while a provider requires auth and API streams. The final copyable construction includes every required model field and the provider.
- A30 — Claim that Agent Loop, events, sessions, and compaction need no provider-specific changes — `restored` with the bounded requirement that the integration first emits valid normalized Pi messages/events.
- A31 — Advanced-section reader guidance for non-adapter authors — `restored` before the streaming/reasoning implementation details.
- A32 — Anthropic raw-SSE versus OpenAI SDK-chunk explanation — `restored` with the current nuance that Anthropic uses the official SDK for request/client work and parses the raw response body through `iterateSseMessages()`.
- A33 — Two streaming-parser chains — `restored` and expanded to current Anthropic, OpenAI, Google, and Bedrock chains.
- A34 — Rationale for normalizing after provider SDK/transport parsing — `restored` without claiming SDK maturity is the deciding factor.
- A35 — Anthropic, OpenAI, and Google reasoning-parameter examples — `restored` as explicitly labeled payload pseudocode.
- A36 — Anthropic adaptive-thinking versus budget-thinking distinction — `restored` from the pinned Anthropic adapter.
- A37 — Thinking-level visual covering levels, provider mappings, and clamp fallback — `restored` across the provider-output fence, exact level fence, and adjacent clamp explanation.
- A38 — “Five-tier” claim, six displayed levels, and `xhigh` as a generic model maximum — `technically-invalid`; current [`ThinkingLevel`](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/ai/src/types.ts) has six request values through `max`, with `off` added by `ModelThinkingLevel`; `xhigh` and `max` are separately opt-in. The replacement documents all seven capability states.
- A39 — Per-model `thinkingLevelMap` argument — `restored` with null/opt-in semantics and current model metadata ownership.
- A40 — Upward-then-downward `clampThinkingLevel()` fallback — `restored` exactly from pinned [`models.ts`](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/ai/src/models.ts).
- A41 — `streamSimple()` reasoning translation and output-token adjustment — `restored` with standard budgets, answer-room protection, context clamping, and provider-specific final payloads.
- A42 — Growing-conversation-prefix cache motivation — `restored` without a fixed turn count.
- A43 — `CacheRetention` type fence — `restored` as an exact, pinned one-line declaration.
- A44 — Four-row provider cache-comparison table — `restored` with current Anthropic Messages, Bedrock Converse, OpenAI Responses, and compatibility-gated Chat Completions behavior.
- A45 — Cache evidence linked to mutable `main` line numbers — `technically-invalid` as reproducibility evidence; the final ledger pins every relevant adapter to `a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c` and the page labels source excerpts with exact paths and pin.
- A46 — Four distinct cache-protocol mechanism explanations — `restored` directly in the comparison table and placement prose without the sticky-note, road-sign, membership-card, and “naive vendor” metaphors.
- A47 — Rebuilding `Context` does not by itself break provider prefix caching — `restored` with the provider-visible serialization and mutation conditions that do affect the prefix.
- A48 — Claim that Anthropic always allows four breakpoints and that the three selected positions are provably optimal — `technically-invalid` as an unpinned external-service claim. The final page records only the exact pinned adapter positions: system prompt, final Tool definition, and last eligible user block.
- A49 — Fixed one-tenth cache price and 90% savings for a 200K-token conversation — `technically-invalid` because pricing is provider/model/time dependent and absent from the pinned API contract. The replacement directs readers to normalized `cacheRead`, `cacheWrite`, and catalog-derived cost fields.
- A50 — Adapter try/catch terminal-error code fence — `restored` as the exact pinned `lazyStream()` setup-error path plus the adapter terminal behavior.
- A51 — `error`/`aborted` injection and partial-result preservation — `restored` with exact final message fields and cancellation semantics.
- A52 — Claim that Agent Loop may retry/degrade after the event while “the loop does not stop” — `technically-invalid` as automatic model-layer behavior. The stream terminates on `error`; [`Models`](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/ai/src/models.ts) does not automatically retry a settled assistant error. The final section assigns higher-level retry decisions to the host and documents request-level `maxRetries` separately.
- A53 — Three-mode context-overflow detection — `restored` with exact error-pattern, usage-over-window, and zero-output/99%-full length-stop checks from pinned [`overflow.ts`](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/ai/src/utils/overflow.ts).
- A54 — Final one-line-call end-to-end diagram — `restored` with current collection, auth, provider, API implementation, normalization, stream, and Agent Loop stages.
- A55 — Agent Loop sees only normalized events and messages — `restored`.
- A56 — Protocol-over-inheritance argument and absence of a shared `BaseProvider` requirement — `restored` with current interfaces and provider factories.
- A57 — Unified reasoning enum plus per-model mapping strategy — `restored` with the current seven capability states and opt-in extended levels.
- A58 — Unified cache semantics with provider-owned mechanisms — `restored` with current option defaults and compatibility gates.
- A59 — Next-chapter questions about Tool-call execution, validation, and safety — `restored` and expanded to scheduling, progress, and `ToolResultMessage`.
- A60 — Key source index pointing to obsolete compat line ranges and old type locations — `technically-invalid`; the final page replaces it with current source paths, while this appendix supplies commit-pinned links for every technical area.
- A61 — Pi `v0.80.2` version note — `technically-invalid`; the pinned [Pi AI package manifest](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/ai/package.json) reports `0.84.2` and Node.js `>=22.19.0`. Both final locale pages record the full commit.
- A62 — `Next up` link to Chapter 5 — `restored` in both locale files.

The thinner pre-restoration Chapter 4 pages contained concise `Models` lookup/call examples, a provider-ownership dispatch sketch, shared request-option inventory, and custom-provider checklist. Their valid material is retained across Sections 2, 3, and 5 and expanded with the baseline teaching sequence. These are current-page artifacts rather than baseline decisions, so they do not change the 82-decision reconciliation above.
