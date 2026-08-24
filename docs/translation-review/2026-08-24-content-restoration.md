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
| ch05-tool-system                | 4564 words; H2/H3/H4 7/28/0; fences 29; tables 5; Mermaid 0  | 5048 words; H2/H3/H4 7/28/0; fences 29; tables 5; Mermaid 0  |       77 |      2 |                  21 |         0 | reviewed | reviewed   | checked |
| ch06-messages                   | 3192 words; H2/H3/H4 10/12/0; fences 17; tables 3; Mermaid 0 | 3475 words; H2/H3/H4 10/12/0; fences 17; tables 3; Mermaid 0 |       70 |      1 |                  16 |         0 | reviewed | reviewed   | checked |
| ch07-event-driven               | 2339 words; H2/H3/H4 9/16/0; fences 15; tables 0; Mermaid 0  | 2672 words; H2/H3/H4 9/16/0; fences 15; tables 0; Mermaid 0  |       65 |      4 |                  14 |         0 | reviewed | reviewed   | checked |
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

The final English page has 3,314 prose words, 96.96% of its 3,418-word baseline. The final Vietnamese page has 3,741 prose words, 95.56% of its 3,915-word baseline. Both pages have H2/H3/H4 `7/13/0`, 23 paired fences with languages `typescript`, `json`, `json`, `json`, `json`, `json`, `text`, `typescript`, `text`, `text`, `text`, `text`, `typescript`, `typescript`, `text`, `typescript`, `text`, `text`, `typescript`, `text`, `typescript`, `typescript`, `text`, two tables, and no Mermaid block. No preservation-manifest deletion allowance is needed.

Technical review used these pinned files:

- [`packages/ai/src/models.ts`](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/ai/src/models.ts) for `Models`, `Provider`, collection routing, `createModels()`, `createProvider()`, auth application, model lookup/refresh, API dispatch, deferred fetch/cancel behavior, and thinking-level support.
- [`packages/ai/src/types.ts`](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/ai/src/types.ts) and [`utils/event-stream.ts`](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/ai/src/utils/event-stream.ts) for exact message/content-block names, options, `DeferredHandle`, required and optional `ProviderStreams` methods, the 12 event variants, terminal shapes, and `result()`.
- [`packages/ai/src/providers/all.ts`](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/ai/src/providers/all.ts) and [`providers/anthropic.ts`](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/ai/src/providers/anthropic.ts) for built-in collection construction, provider factories, catalog ownership, lazy API wiring, and Anthropic credential resolution.
- [`packages/ai/src/api/lazy.ts`](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/ai/src/api/lazy.ts) and [`api/simple-options.ts`](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/ai/src/api/simple-options.ts) for asynchronous setup inside a synchronous stream handle, setup-error normalization, context/token clamping, and standard reasoning budgets.
- [`packages/ai/src/api/anthropic-messages.ts`](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/ai/src/api/anthropic-messages.ts), [`openai-completions.ts`](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/ai/src/api/openai-completions.ts), [`openai-responses.ts`](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/ai/src/api/openai-responses.ts), [`google-generative-ai.ts`](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/ai/src/api/google-generative-ai.ts), and [`bedrock-converse-stream.ts`](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/ai/src/api/bedrock-converse-stream.ts) for provider message conversion, response/SSE sequencing, local-adapter auth validation, Tool-call assembly, reasoning translation, cache placement, usage, stop-reason mapping, and terminal errors.
- [`packages/ai/src/auth/resolve.ts`](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/ai/src/auth/resolve.ts), [`utils/provider-env.ts`](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/ai/src/utils/provider-env.ts), [`utils/headers.ts`](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/ai/src/utils/headers.ts), [`utils/provider-retry.ts`](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/ai/src/utils/provider-retry.ts), and [`utils/overflow.ts`](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/ai/src/utils/overflow.ts) for credential ownership and errors, provider-env precedence, raw callback-header copying, exact request-retry behavior, and the three overflow-detection modes.
- [`packages/ai/src/compat.ts`](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/ai/src/compat.ts), the pinned [Pi AI README](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/ai/README.md), and the [package manifest](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/ai/package.json) for the migration-only global API, public import paths/examples, package version `0.84.2`, and Node.js `>=22.19.0`.

### Baseline H2–H4 outcomes

The baseline has no H4 heading. Every entry applies to the matching English and Vietnamese heading pair; the baseline and final pages both have 20 H2–H4 headings.

- H01 — H2 `Problem: same dialog, different models demand different "translations"` / `Vấn đề: cùng một đoạn hội thoại, model khác nhau đòi format "dịch" khác nhau` — `restored` as one conversation crossing multiple provider dialects.
- H02 — H3 `Not just message format: all four dimensions differ` / `Không chỉ format message: bốn chiều đều khác nhau` — `restored` with message/Tool conversion, streaming, reasoning, and cache control tied to exact current Pi types and options.
- H03 — H2 `Solution: three layers, each owning one thing` / `Giải pháp: kiến trúc ba lớp, mỗi lớp phụ trách một việc` — `restored` as three current boundaries: `Models`, provider/API implementation, and the normalized stream contract.
- H04 — H3 `Layer 1: Unified entry` / `Lớp 1: Entry thống nhất` — `technically-invalid` as a global-registry description. At the pin, [`ModelsImpl.stream*()`](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/ai/src/models.ts) routes first by `model.provider`, applies auth, and then lets `Provider` dispatch by `model.api`; the final heading preserves the entry-layer lesson as `Boundary 1: the Models collection` / `Boundary 1: Models collection`.
- H05 — H3 `Layer 2: Event protocol` / `Lớp 2: Event protocol` — `restored` with the exact 12-event union, interleaving, `contentIndex`, terminal-event shapes, and the durable deferred handle/fetch/cancel lifecycle.
- H06 — H3 `Layer 3: Translator` / `Lớp 3: Translator` — `technically-invalid` as current ownership and terminology. [`Provider`](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/ai/src/models.ts) owns catalog/auth/stream dispatch, while modules under [`packages/ai/src/api`](https://github.com/badlogic/pi-mono/tree/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/ai/src/api) implement wire conversion. It is replaced by `Boundary 3: provider and API-adapter responsibilities` / `Boundary 3: trách nhiệm của provider và API adapter`.
- H07 — H3 `StreamFunction: Translator's "onboarding requirements"` / `StreamFunction: "Yêu cầu nhập môn" của translator` — `restored` as the actual required `ProviderStreams`/`StreamFunction` contracts, optional deferred methods, and exact limits on pre-stream versus in-stream failures.
- H08 — H2 `How to use: from call to plugging in a new model` / `Cách dùng: từ gọi đến thêm model mới` — `restored` as ordinary model calls plus the distinct provider/new-wire-protocol integration path.
- H09 — H3 `Scenario 1: Call the model` / `Kịch bản 1: Gọi model` — `restored` with a copyable `createModels()`, `anthropicProvider()`, model lookup, `Models.streamSimple()`, event iteration, and `result()` example.
- H10 — H3 `Scenario 2: Plug in a new model` / `Kịch bản 2: Thêm một model mới` — `technically-invalid` as a three-step global-registry procedure. The final section separates reusing a current API implementation through `createProvider()` from implementing a genuinely new `ProviderStreams` wire protocol, satisfies the reused OpenAI adapter's credential validation with a documented non-secret local placeholder, then registers the result through `models.setProvider()`.
- H11 — H2 `[Advanced] Inside the translator: SSE parsing and thinking-mode dialects` / `[Nâng cao] Bên trong translator: SSE parsing và các dialect của thinking mode` — `technically-invalid` in name and scope. It is replaced by `Inside the API adapter: streaming and reasoning dialects` / `Bên trong API adapter: streaming và reasoning dialect`, supported by the pinned API modules.
- H12 — H3 `Streaming: Why do Anthropic and OpenAI parse so differently?` / `Streaming: Tại sao Anthropic và OpenAI lại parse khác nhau hoàn toàn?` — `restored` with exact current Anthropic response-acceptance/SSE/final-validation order, OpenAI SDK chunks, Google response parts, and Bedrock Converse events.
- H13 — H3 `Thinking mode: four kinds of "thinking", four parameters` / `Thinking mode: bốn kiểu "suy nghĩ", bốn tham số` — `restored` as model-family-specific adaptive effort, token budgets, discrete levels, and API option translation.
- H14 — H3 `How Pi unifies: ThinkingLevel 5-tier scale` / `Pi thống nhất thế nào: thang ThinkingLevel 5 cấp` — `technically-invalid`; [`types.ts`](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/ai/src/types.ts) defines six request levels through `max`, and `ModelThinkingLevel` adds `off`. The final section documents all seven capability levels, exact standard budgets, opt-in `xhigh`/`max`, and current clamp behavior.
- H15 — H2 `[Advanced] Cache control and error handling` / `[Nâng cao] Cache control và xử lý lỗi` — `restored` and expanded to include current retry and cancellation boundaries.
- H16 — H3 `Cache control: Let the model "compute less"` / `Cache control: Cho model "tính ít đi"` — `restored` with `CacheRetention`, explicit-option/compat-env/default precedence, exact adapter placement including Bedrock's final eligible user-message condition, compatibility gates, and normalized usage fields.
- H17 — H3 `Error handling: Encode into the stream, do not break the loop` / `Xử lý lỗi: Mã hóa vào stream, không làm đứt vòng lặp` — `restored` as the current `Models` setup-error wrapper, adapter terminal errors, abort outcomes, explicit request retries, higher-level retry ownership, overflow detection, and raw callback-data handling boundary.
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
- A14 — Twelve-event protocol diagram — `restored` with exact current names, `deferred` in the successful terminal reason union, and the complete durable-handle fetch/cancel flow.
- A15 — Three content families with start/delta/end progression — `restored` for `text`, `thinking`, and `toolCall`, including interleaving and `contentIndex`.
- A16 — Claim that every event carries `partial` — `technically-invalid`; pinned [`AssistantMessageEvent`](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/ai/src/types.ts) gives `message` to `done` and `error` to the terminal `error` event. The final text records both terminal shapes and `result()`.
- A17 — Five-step adapter pipeline — `restored` with `Models` auth, provider API selection, request conversion, transport, normalization, and termination.
- A18 — Argument that request and response conversion contain the provider-specific work — `restored` without unsupported universal source-length claims.
- A19 — Anthropic private-event to Pi-event map — `restored` with Pi `start` at response acceptance, `message_start` metadata/initial usage, all three content families, `content_block_stop`, and `message_delta` state updates.
- A20 — Anthropic stop-reason mapping — `restored` with `message_delta` separated from `done`, which follows completed SSE iteration, `message_stop` validation, and terminal stop-reason validation.
- A21 — `StreamFunction` signature fence — `restored` as a precisely labeled source-faithful abridgement alongside the required `ProviderStreams` members, with optional deferred methods described immediately before it.
- A22 — Three contract rules ending in an unconditional “errors never throw” claim — `technically-invalid` at the direct API subpath. Built-in simple adapters such as [`anthropic-messages.ts`](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/ai/src/api/anthropic-messages.ts) and [`google-generative-ai.ts`](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/ai/src/api/google-generative-ai.ts) synchronously validate request auth, while [`Models.stream*()`](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/ai/src/models.ts) captures those calls inside `lazyStream()`. The final page distinguishes the normal collection contract from direct low-level imports.
- A23 — `stream()` versus `streamSimple()` explanation — `restored` with API-specific typed options, provider-neutral `SimpleStreamOptions`, `hasApi()`, and both `complete` variants.
- A24 — Typical streaming call and event-consumer code — `restored` as a self-contained public-API example using `createModels()`, `anthropicProvider()`, `models.streamSimple()`, iteration, and `result()`.
- A25 — Provider-independent consumer argument — `restored` with exact event/content-block names and no provider switch.
- A26 — Three-step new-model onboarding progression — `restored` and expanded into the two current cases: reuse an existing wire API or implement a new `ProviderStreams` contract.
- A27 — Request conversion, response conversion, and error obligations for a new translator — `restored` under current API-adapter terminology.
- A28 — `registerApiProvider()` code as the active registration step — `technically-invalid`; [`compat.ts`](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/ai/src/compat.ts) retains it only for migration. The replacement uses `createProvider()` and `models.setProvider()`.
- A29 — Partial custom `Model` object presented as sufficient registration — `technically-invalid`; pinned [`Model`](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/ai/src/types.ts) also requires identity, capability, cost, context-window, and output-limit data, while a provider requires auth and API streams. The final copyable construction includes every required model field, the provider, and the non-secret placeholder required by `openAICompletionsApi()` for a local endpoint configured to accept or ignore it.
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
- A44 — Four-row provider cache-comparison table — `restored` with explicit-option/`PI_CACHE_RETENTION`/`short` precedence plus current Anthropic Messages, Bedrock final-eligible-user placement, OpenAI Responses, and compatibility-gated Chat Completions behavior.
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
- A58 — Unified cache semantics with provider-owned mechanisms — `restored` with current explicit-option/compat-env/default precedence and compatibility gates.
- A59 — Next-chapter questions about Tool-call execution, validation, and safety — `restored` and expanded to scheduling, progress, and `ToolResultMessage`.
- A60 — Key source index pointing to obsolete compat line ranges and old type locations — `technically-invalid`; the final page replaces it with current source paths, while this appendix supplies commit-pinned links for every technical area.
- A61 — Pi `v0.80.2` version note — `technically-invalid`; the pinned [Pi AI package manifest](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/ai/package.json) reports `0.84.2` and Node.js `>=22.19.0`. Both final locale pages record the full commit.
- A62 — `Next up` link to Chapter 5 — `restored` in both locale files.

The thinner pre-restoration Chapter 4 pages contained concise `Models` lookup/call examples, a provider-ownership dispatch sketch, shared request-option inventory, and custom-provider checklist. Their valid material is retained across Sections 2, 3, and 5 and expanded with the baseline teaching sequence. These are current-page artifacts rather than baseline decisions, so they do not change the 82-decision reconciliation above.

## Reviewed mapping appendix: Chapter 5

This appendix compares the Chapter 5 pair at `b10130f` with the restored English and Vietnamese pages. It records 100 pair-level decisions: 35 baseline H2–H4 headings and 65 unique artifacts or arguments. They reconcile exactly as `77 restored + 2 merged + 21 technically-invalid + 0 duplicate = 100`. Every technically invalid item was replaced in place with its current teaching equivalent; no item was deleted for brevity.

Final English has 4,566 prose words, 100.0% of its 4,564-word baseline. Final Vietnamese has 6,566 prose words, 130.1% of its 5,048-word baseline. Both pages have H2/H3/H4 `7/29/0`, 33 paired fences, five tables, and no Mermaid block. The fence-language sequence is identical in both locales:

```text
01 json
02–08 typescript
09 text
10 json
11 text
12 jsonc
13 text
14–16 typescript
17 text
18–21 typescript
22 text
23 typescript
24 text
25 typescript
26–27 text
28–30 typescript
31 text
32 typescript
33 text
```

The additional current H3 isolates `defineTool()` from `pi.registerTool()` and is outside the baseline heading decisions. No preservation-manifest deletion allowance is needed.

### Baseline section outcomes

- H01 — H2 `1. Three layers of types: why must "one tool" be defined across three layers?` / `1. Ba lớp kiểu: tại sao "một tool" phải định nghĩa qua ba lớp?` — `restored` as the same three-layer progression with current package ownership.
- H02 — H3 `Layer 1: Tool: a "name card"` / `Lớp 1: Tool: một "tấm danh thiếp"` — `technically-invalid` in its three-field claim. Current [`Tool`](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/ai/src/types.ts) also has optional `constrainedSampling`; the replacement retains the provider-facing declaration lesson with the exact four-member interface.
- H03 — H3 `Layer 2: AgentTool: "execution capability" added` / `Lớp 2: AgentTool: thêm "khả năng thực thi"` — `technically-invalid` as an exact signature. Current [`AgentTool` and `AgentToolResult`](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/agent/src/types.ts) constrain and default both generics, require `details`, and support `usage`, `addedToolNames`, and `terminate`; the replacement reproduces those contracts.
- H04 — H3 `Layer 3: ToolDefinition: product layer adds more` / `Lớp 3: ToolDefinition: tầng sản phẩm thêm tiếp` — `restored` with exact current Extension generics, prompt contributions, constrained sampling, render shell, renderers, state, and five-argument execution.
- H05 — H3 `Bridging two layers: wrapToolDefinition` / `Cầu nối hai lớp: wrapToolDefinition` — `restored` with the complete current wrapper, registered-Extension context factory, optional internal fifth argument, and built-in boundary.
- H06 — H3 `Why must we have three layers?` / `Tại sao nhất định phải chia ba lớp?` — `restored` as the dependency-direction argument across Pi AI, Agent core, and Coding Agent.
- H07 — H2 `2. Five-step pipeline: a tool call is not "just call a function"` / `2. Pipeline 5 bước: gọi tool không phải là "gọi hàm xong là xong"` — `restored` as the complete preparation-to-result path plus scheduling and event boundaries.
- H08 — H3 `Why cannot we just call the function directly?` / `Tại sao không thể gọi thẳng hàm?` — `restored` with inactive names, old argument shapes, missing fields, policy, cancellation, exceptions, and call/result pairing.
- H09 — H3 `Pi's answer: the five-step pipeline` / `Câu trả lời của Pi: pipeline 5 bước` — `restored` as implementation-faithful pseudocode from start event through ordered transcript append.
- H10 — H3 `Step 1: prepareArguments: compatibility shim` / `Bước 1: prepareArguments: miếng đệm tương thích` — `restored` with the current built-in Edit transformations and deterministic, effect-free guidance.
- H11 — H3 `Step 2: validateToolArguments: Schema validation` / `Bước 2: validateToolArguments: xác thực Schema` — `technically-invalid` in its strict pass/fail account. Current [`validateToolArguments()`](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/ai/src/utils/validation.ts) clones, normalizes optional nulls, converts supported values, applies plain-schema coercion, and only then checks; the replacement teaches that exact order and error format.
- H12 — H3 `Step 3: beforeToolCall: pre-hook (can block execution)` / `Bước 3: beforeToolCall: hook trước (có thể chặn thực thi)` — `restored` with exact core context, signal, block reason, and blocked-result termination output, plus the Coding Agent `tool_call` bridge.
- H13 — H3 `Step 4: tool.execute: actual execution` / `Bước 4: tool.execute: thực sự thực thi` — `restored` with the exact four-argument Agent signature, AbortSignal ownership, progress callback, accepted-update drain, and mutation-lock cancellation warning.
- H14 — H3 `Step 5: afterToolCall: post-hook (can modify the result)` / `Bước 5: afterToolCall: hook sau (có thể sửa kết quả)` — `restored` with exact field-level patch semantics and the narrower Extension `tool_result` contract.
- H15 — H3 `Pipeline's end: ToolResultMessage` / `Điểm kết thúc pipeline: ToolResultMessage` — `restored` with exact text/image content, details, usage, added names, error flag, timestamp, active-Tool changes, and the absence of `terminate` from the transcript.
- H16 — H2 `3. Parallel vs serial: a batch of tools is not "run them together"` / `3. Song song vs tuần tự: một batch tool không phải là "chạy chung là xong"` — `restored` as current batch scheduling, event ordering, resource queues, and termination reduction.
- H17 — H3 `Models often call multiple tools at once` / `Model thường gọi nhiều tool cùng lúc` — `restored` with a typed assistant content array containing three ordered calls.
- H18 — H3 `But parallel is not blindly Promise.all` / `Nhưng song song không phải là Promise.all một cách máy móc` — `restored` with the lost-update scenario and separate preflight/effect/finalization/transcript phases.
- H19 — H3 `Pi's scheduling strategy: one-vote veto` / `Chiến lược điều phối của Pi: một phiếu phủ quyết` — `restored` with exact global mode and per-Tool `executionMode` lookup from the pinned loop.
- H20 — H3 `Three-phase design of parallel execution` / `Thiết kế ba pha của thực thi song song` — `restored` with source-ordered preflight, concurrent allowed effects, completion-ordered end events, and source-ordered result messages.
- H21 — H2 `4. Never throw: a tool error is also a message` / `4. Không bao giờ ném: lỗi tool cũng là một message` — `technically-invalid` as author guidance. Current [`AgentTool.execute`](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/agent/src/types.ts) explicitly instructs Tools to throw on failure; the framework catches at its boundary. The replacement heading says Tool failures become model-visible result messages.
- H22 — H3 `Unified error exit: 6 kinds of errors, 1 kind of product` / `Đầu ra lỗi thống nhất: 6 loại lỗi, 1 loại sản phẩm` — `restored` with the six paths plus current abort and truncated-response safeguards.
- H23 — H3 `Key code: dual protection of tool.execute` / `Code then chốt: bảo vệ kép cho tool.execute` — `restored` with a faithful current catch excerpt and update-event settlement order.
- H24 — H3 `Exception -> message: before/after encoding comparison` / `Exception -> message: so sánh trước/sau khi mã hóa` — `restored` as a receiver-oriented exception-to-result-to-transcript diagram.
- H25 — H3 `Why is "disguising as a message" the best handling?` / `Tại sao "ngụy trang thành message" là cách xử lý tốt nhất?` — `restored` without the disguise metaphor: the current text explains structural pairing and model-directed recovery.
- H26 — H3 `Key detail: the more specific the error description, the stronger the model's self-correction` / `Chi tiết then chốt: mô tả lỗi càng cụ thể, khả năng tự sửa của model càng mạnh` — `restored` with bounded, safe, actionable error guidance.
- H27 — H3 `Pi's actual practice: two-layer error handling, layered responsibility` / `Cách làm thật của Pi: xử lý lỗi hai lớp, phân công theo lớp` — `restored` with current Read, Edit, and Bash handling plus framework fallback.
- H28 — H3 `Best practices when writing custom tools` / `Best practice khi viết custom tool` — `restored` with a typechecked Extension, signal, domain errors, file queue, policy, and progress-redaction guidance.
- H29 — H3 `One sentence summary` / `Tóm gọn một câu` — `restored` as the explicit boundary of the finalized-call error contract, including process crashes, ignored signals, and unstarted calls after cancellation.
- H30 — H2 `5. [Advanced] Operations abstraction: tool execution is not the same as system calls` / `5. [Nâng cao] Trừu tượng Operations: thực thi tool không giống gọi hệ thống` — `restored` as current public Operations interfaces and creation-time injection.
- H31 — H3 `Problem: tool code hard-codes system calls` / `Vấn đề: code tool gọi cứng system call` — `restored` with local, in-memory, remote, sandbox, and audit-backend consequences.
- H32 — H3 `Solution: tools do not call system APIs directly, they call interfaces` / `Giải pháp: tool không gọi trực tiếp API hệ thống, mà gọi interface` — `restored` with exact `ReadOperations`, the current nullish-coalescing selection, and a typechecked in-memory definition.
- H33 — H3 `Each tool defines its own minimal interface` / `Mỗi tool tự định nghĩa interface tối thiểu của mình` — `technically-invalid` only in its exact method table. Current interfaces under [`core/tools`](https://github.com/badlogic/pi-mono/tree/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/coding-agent/src/core/tools) have updated sync-or-async unions, Bash execution options, and image-MIME return values; the final table records every current public contract.
- H34 — H2 `6. Methodology distillation` / `6. Chắt lọc phương pháp luận` — `restored` as four direct design lessons and a security-review boundary map.
- H35 — H2 `7. Closing` / `7. Kết thúc` — `restored` with the full current call route and hand-off to Chapter 6.

### Unique artifact and argument outcomes

- A01 — Chapter 3 hand-off from the model's decision to the returned Tool result — `restored` and connected to Chapter 4's normalized-provider boundary.
- A02 — Opening `ToolCall` JSON with `id`, `name`, and file path — `restored` as a valid current protocol block.
- A03 — Opening wrong-arguments, dangerous-command, and thrown-exception motivation — `restored` and expanded with activation, cancellation, and transcript pairing.
- A04 — Five-step `prepare -> validate -> before -> execute -> after` teaching model — `restored` inside the wider event and scheduling route.
- A05 — `Tool` source fence with exactly three fields — `technically-invalid`; current [`types.ts`](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/ai/src/types.ts) adds `constrainedSampling`, reproduced in full.
- A06 — Base Tool as a declaration that can describe but not execute itself — `restored` under provider-facing capability terminology.
- A07 — Historical `AgentTool<TParameters, TDetails>` excerpt and old result surface — `technically-invalid`; current [`agent/src/types.ts`](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/agent/src/types.ts) supplies schema constraints, defaults, required details, usage, added names, and termination, all restored in one paired fence.
- A08 — `label`, argument preparation, execution, and execution-mode responsibilities — `restored` with cancellation and progress detail typing.
- A09 — Four-argument versus five-argument execution comparison presented as the complete bridge — `technically-invalid`; current [`wrapToolDefinition()`](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/coding-agent/src/core/tools/tool-definition-wrapper.ts) also accepts an optional internal fifth context and prefers it over `ctxFactory()`. The replacement documents both call paths.
- A10 — Product prompt and custom-rendering fields — `restored` and expanded with `promptGuidelines`, `renderShell`, `TState`, and render context.
- A11 — Historical wrapper excerpt that omitted constrained sampling and direct-context fallback — `technically-invalid`; the complete current wrapper is reproduced from the pinned source.
- A12 — Closure-based `ExtensionContext` injection that keeps Agent Loop unaware of session APIs — `restored` with [`runner.createContext()`](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/coding-agent/src/core/extensions/runner.ts) lazy getters, stale-runner checks, and call-time state.
- A13 — Dependency-scope rationale for three layers — `restored` without importing TUI or session concerns into Pi AI and Agent core.
- A14 — Pipeline section's repeated wrong-format, wrong-type, and dangerous-command list — `merged` into A03 and the direct-invocation subsection at the same explanatory depth.
- A15 — Five-box vertical pipeline diagram and error convergence — `restored` as a longer implementation-faithful text diagram including events and message construction.
- A16 — Stringified Edit array before/after example — `restored` with the current top-level legacy edit conversion and JSON-string behavior from [`edit.ts`](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/coding-agent/src/core/tools/edit.ts).
- A17 — Compatibility preparation versus correctness validation argument — `restored` with deterministic preparation and effect-placement rules.
- A18 — `path: 12345` guaranteed to fail a string schema — `technically-invalid`; current [`validation.ts`](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/ai/src/utils/validation.ts) performs supported TypeBox conversion. The replacement uses a missing required path and documents conversion examples proven by `packages/ai/test/validation.test.ts`.
- A19 — Two-row pre-hook table without signal or termination semantics — `technically-invalid` as the full current output contract; the final four-row table records default reason, custom reason, abort check, and batch termination participation from [`BeforeToolCallResult`](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/agent/src/types.ts).
- A20 — Blocked execution still yields `isError: true` content visible to the model — `restored` with exact default and custom reason behavior.
- A21 — Standalone `execute` signature and result shown without current generic/result fields — `technically-invalid`; the final signature and `AgentToolResult<TDetails>` excerpt use the exact pinned definitions.
- A22 — AbortSignal and long-task `onUpdate` explanation — `restored` with explicit Tool cooperation, partial-result shape, and progress event payload.
- A23 — `acceptingUpdates` guard against callbacks after promise settlement — `restored` together with `updateEvents` drain on both success and error.
- A24 — Post-hook table claiming one terminating result stops after the batch — `technically-invalid`; current [`shouldTerminateToolBatch()`](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/agent/src/agent-loop.ts) requires every non-empty finalized result to terminate. The replacement also separates core and Extension hook fields.
- A25 — Field-level override and no-deep-merge semantics — `restored` for `content`, `details`, `usage`, `isError`, and `terminate`.
- A26 — Successful `ToolResultMessage` object with call identity, content, details, error flag, and timestamp — `restored` with a typed current example.
- A27 — Argument that all finalized failures converge into result messages — `restored` with precise boundaries instead of an unconditional process-wide claim.
- A28 — Assistant content containing Read, Grep, and Find calls — `restored` as a typed three-call array in source order.
- A29 — Two edits losing a change when both read the same old file — `restored` as the batch-conflict diagram.
- A30 — One-sequential-Tool veto code — `restored` as a faithful excerpt from the current scheduler.
- A31 — Claim that all seven v0.80.2 built-ins default parallel while only Edit uses a file queue — `technically-invalid`; current Tool definitions still omit `executionMode`, but both [`edit.ts`](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/coding-agent/src/core/tools/edit.ts) and [`write.ts`](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/coding-agent/src/core/tools/write.ts) use the current canonical-path [`withFileMutationQueue()`](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/coding-agent/src/core/tools/file-mutation-queue.ts).
- A32 — Three-phase parallel timeline diagram — `restored` with immediate preflight outcomes, deferred allowed effects, completion-ordered end events, and source-ordered message events.
- A33 — Sequential preflight justified by potentially stateful pre-hooks — `restored`.
- A34 — Model transcript results retain assistant source order — `restored`, while progress and end events may arrive in completion order.
- A35 — Six-row failure-source table — `restored` with exact not-found, preparation, validation, block, execute, and post-hook behavior.
- A36 — `executePreparedToolCall()` catch with accepted-update flush — `restored` as a current source-faithful abridgement.
- A37 — Raw exception versus encoded-message diagram — `restored` as the Tool-to-result-to-provider route.
- A38 — Call-stack receiver versus model receiver argument — `restored` as the reason to preserve a valid call/result transcript.
- A39 — Four-scenario model recovery table — `restored` for missing files, non-unique edits, failed builds, and blocked destructive commands.
- A40 — Weak versus actionable error comparison — `restored` with Read offset and Bash exit examples plus safe-output limits.
- A41 — Read out-of-range error with total line count — `restored` from current [`read.ts`](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/coding-agent/src/core/tools/read.ts).
- A42 — Edit access failure with file path and underlying code — `restored` from current [`edit.ts`](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/coding-agent/src/core/tools/edit.ts).
- A43 — Bash abort, timeout, non-zero exit, and captured-output handling — `restored` as a faithful pinned-source abridgement.
- A44 — Repeated two-layer error-handling text diagram — `merged` into the built-in handling subsection and framework-fallback paragraph without losing either responsibility.
- A45 — `createErrorToolResult(error.message)` pass-through argument — `restored` through the exact execution catch and explicit `String(error)` fallback.
- A46 — Two custom-Tool rules for known and unknown failures — `restored` and expanded with signal, queue, output, policy, progress, and project-root confinement guidance.
- A47 — Custom example using undeclared `MyKnownErrorA`, `MyKnownErrorB`, and untyped result placeholders — `technically-invalid` as copyable code. It is replaced by a complete `defineTool()` Extension that passes strict TypeScript checking against published `0.84.2` packages and enforces lexical plus canonical project-root containment with an explicit symlink and filesystem-race policy.
- A48 — Unknown errors should retain their original message through the framework fallback — `restored` with non-`Error` handling.
- A49 — Direct `fs` call as the Operations-abstraction problem — `restored` with local, test, remote, sandbox, and audit consequences.
- A50 — Historical `ReadOperations` interface — `technically-invalid` as exact current typing because [`detectImageMimeType`](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/coding-agent/src/core/tools/read.ts) may now resolve `undefined`; the complete current interface is reproduced.
- A51 — Operations-selection excerpt using `options?.operations ? defaultReadOperations` and a five-argument Agent execution callback — `technically-invalid`; current [`createReadToolDefinition()`](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/coding-agent/src/core/tools/read.ts) uses `options?.operations ?? defaultReadOperations`, closes over it, and exposes product execution through `ToolDefinition`. The final explanation follows those exact boundaries.
- A52 — Direct-system-call versus injected-operations diagram — `restored` as local, in-memory, and authenticated-remote backend substitution.
- A53 — Local, mock, and hypothetical SSH creation examples with synchronous `access` and undeclared `sshExec` — `technically-invalid` as executable guidance. The replacement is a complete in-memory `createReadToolDefinition()` example that passes strict TypeScript checking against published `0.84.2` packages; remote use remains explicitly architectural.
- A54 — Seven-Tool Operations table with stale method signatures — `technically-invalid`; current public types exported by [`core/tools/index.ts`](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/coding-agent/src/core/tools/index.ts) include Bash signal/timeout/env, sync-or-async Grep/Find/Ls methods, nullable exit codes, and updated image detection. All seven rows are replaced in place.
- A55 — Each Tool declares only the system methods it consumes — `restored` with concrete boundary examples.
- A56 — Methodology rule for layered interface progression — `restored`.
- A57 — Methodology rule for pipeline plus hooks — `restored` with compatibility, validation, policy, effect, and final transformation separated.
- A58 — Methodology rule for errors as messages — `restored` with finalized-call and process boundaries.
- A59 — Methodology rule for Operations abstraction — `restored` together with scheduling and per-resource queue ownership.
- A60 — Closing end-to-end ToolCall-to-ToolResult diagram — `restored` with scheduling, validation conversion, events, active Tools, Operations, and batch termination.
- A61 — Conclusion that validation, hooks, Operations, and error encoding keep the loop stable — `restored` with cancellation and observability boundaries added.
- A62 — Questions leading into Tool events and message structure — `restored` as the hand-off to Chapter 6's richer transcript and provider conversion.
- A63 — Historical key-source index with obsolete line ranges and wrapper/type surfaces — `technically-invalid`; both final pages name the current paths, while this appendix links each changed contract to commit-pinned source.
- A64 — Pi `v0.80.2` version note — `technically-invalid`; the pinned [`@earendil-works/pi-agent-core`](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/agent/package.json) and [`@earendil-works/pi-coding-agent`](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/coding-agent/package.json) manifests report `0.84.2` and Node.js `>=22.19.0`.
- A65 — `Next up` link to Chapter 6 — `restored` in both locale files.

The thinner pre-restoration Chapter 5 pages contained a concise low-level `AgentTool`, a core hook example, an active security checklist, and a short result contract. Their useful current material remains across Sections 1, 2, 4, and 5 and is expanded with the baseline progression. The standalone `defineTool()`/`pi.registerTool()` H3, active-Tool allowlist rules, dynamic `addedToolNames` behavior, truncated-response safeguard, and copyable typed examples are current-source additions, so they do not alter the 100 baseline decisions above.

## Reviewed mapping appendix: Chapter 6

Chapter 6 has 22 baseline H2–H3 decisions and 65 unique artifact or argument decisions: 87 total. The reconciliation is exact: 70 `restored` + 1 `merged` + 16 `technically-invalid` + 0 `duplicate` = 87. Final-to-baseline semantic-word preservation measured by `contentMetrics()` is EN 3,270 / 3,192 = 102.4% and VI 4,273 / 3,475 = 123.0%; each ratio compares one locale only. Every technically invalid item is replaced in place with current Pi `0.84.2` behavior, so `content/preservation-manifest.json` keeps its original 80% word threshold and has no Chapter 6 deletion allowance.

### Heading outcomes

- H01 — H2 `1. Opening: the journey of a Bash command's message` / `1. Mở đầu: hành trình message của một lệnh Bash` — `restored` as the `!ls -la` journey through runtime state, session persistence, model conversion, and provider serialization.
- H02 — H2 `2. Layer one: the LLM only knows three kinds of messages` / `2. Lớp một: LLM chỉ biết ba loại message` — `restored` as provider-facing `Message`, with the distinction between Pi's normalized contract and a provider wire payload.
- H03 — H3 `The specific data structure of each kind` / `Cấu trúc dữ liệu cụ thể của mỗi loại` — `technically-invalid` only in the historical field lists. Current [`packages/ai/src/types.ts`](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/ai/src/types.ts) adds response, diagnostics, deferred, usage, dynamic-Tool, namespace, redaction, and replay fields; the final pages reproduce the current discriminants and complete or labeled abridged interfaces.
- H04 — H3 `A complete dialog example` / `Một ví dụ hội thoại hoàn chỉnh` — `restored` as a copyable, fully populated `Message[]` Tool exchange with stable call/result identity.
- H05 — H2 `3. The contradiction: messages in the Agent are more than three kinds` / `3. Nghịch lý: message trong Agent không chỉ có ba loại` — `restored` with runtime, TUI, storage, compaction, branch, and extension readers.
- H06 — H2 `4. Layer two: AgentMessage: rich inside, strict outside, the double-layer design` / `4. Lớp hai: AgentMessage: trong giàu ngoài nghiêm, thiết kế hai lớp` — `restored` in natural prose as the richer Agent layer and its open extension slot.
- H07 — H3 `The AgentMessage union type` / `Kiểu union AgentMessage` — `restored` with the exact indexed-access union from [`packages/agent/src/types.ts`](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/agent/src/types.ts).
- H08 — H3 `CustomAgentMessages: the empty-by-default extension point` / `CustomAgentMessages: extension point mặc định rỗng` — `restored` with its compile-time scope and runtime limits.
- H09 — H3 `Declaration merging: type-safe extension magic` / `Declaration merging: phép mở rộng type-safe` — `restored` without the “magic” framing as a copyable notification augmentation plus collision and persistence guidance.
- H10 — H2 `5. Translation boundary: convertToLlm: every custom message eventually becomes User` / `5. Biên giới dịch: convertToLlm: mọi custom message rốt cuộc đều thành User` — `technically-invalid` in its universal claim. [`AgentLoopConfig`](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/agent/src/types.ts) permits conversion or filtering to any valid `Message[]`; only Coding Agent's current four-role converter maps each retained custom role to `user`.
- H11 — H3 `When does the translation happen?` / `Dịch xảy ra lúc nào?` — `restored` with exact per-call order, awaited hook behavior, and low-level versus `Agent` error boundaries.
- H12 — H3 `Translation rules: all custom messages become User` / `Quy tắc dịch: mọi custom message đều thành User` — `technically-invalid` as a general rule and replaced by the exhaustive current Coding Agent role table and source-faithful switch.
- H13 — H3 `Specific example: BashExecutionMessage translation` / `Ví dụ cụ thể: dịch BashExecutionMessage` — `restored` with aligned before/after records and the exact cancellation, exit-code, and truncation text behavior.
- H14 — H2 `6. Two-stage pipeline: why are transformContext and convertToLlm separated?` / `6. Pipeline hai giai đoạn: tại sao tách transformContext và convertToLlm?` — `restored` with the exact async signatures, sequencing, fallback contract, Coding Agent Extension handler behavior, and provider boundary.
- H15 — H2 `7. Filtering mechanism: some messages the LLM should not see` / `7. Cơ chế lọc: có những message LLM không nên thấy` — `restored` and expanded to distinguish model, TUI, runtime, and storage policies.
- H16 — H3 `excludeFromContext: the filtering power of a boolean field` / `excludeFromContext: lực lọc của một trường boolean` — `restored` with the current `!`/`!!` input rule, converter branch, persisted record, and `_runAgentPrompt()` final flush after the last Agent run settles and emits `agent_end`.
- H17 — H3 `Three message visibility levels` / `Ba mức khả năng hiển thị message` — `technically-invalid` only in its unsupported Web UI `ArtifactMessage` row and one-dimensional framing. The final matrix uses current `Message`, Bash, `CustomMessage`, session-only `CustomEntry`, `BranchSummaryEntry`, and `CompactionEntry` behavior from [`session-manager.ts`](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/coding-agent/src/core/session-manager.ts).
- H18 — H2 `8. Complete data flow: from user action to messages seen by the LLM` / `8. Luồng dữ liệu hoàn chỉnh: từ thao tác người dùng đến message LLM thấy` — `restored` as aligned live-input, resume, per-call, provider, Tool-result, and persistence paths.
- H19 — H2 `9. Summary` / `9. Tóm tắt` — `restored` as direct transfer lessons rather than a repeated recap.
- H20 — H3 `One main line: data structures must serve two readers at the same time` / `Một tuyến chính: cấu trúc dữ liệu phải cùng lúc chiều hai người đọc` — `restored` and updated to the three concrete session/runtime/model views in `0.84.2`.
- H21 — H3 `Apply this main line to your own project` / `Áp dụng tuyến chính này vào dự án của bạn` — `restored` as consumer inventory, authoritative-source, conversion, runtime-pair, ordering, and failure guidance.
- H22 — H2 `10. Next stop` / `10. Trạm tiếp theo` — `restored` with the six-chapter route, a concrete self-check, and the hand-off to Chapter 7 events.

### Unique artifact and argument outcomes

- A01 — Chapter 5 hand-off from `ToolResultMessage` to the unresolved meaning of “message” — `restored` and tied to the model, runtime, TUI, and session boundaries.
- A02 — Repeated `UserMessage`/`AssistantMessage`/`ToolResultMessage` questions from earlier chapters — `restored` as the opening boundary problem.
- A03 — Two-layer “rich inside, strict outside” thesis — `restored` with the session projection added as a separate storage boundary.
- A04 — `!ls -la` terminal scenario — `restored` as the chapter's end-to-end running example.
- A05 — Bash `command`, `output`, `exitCode`, cancellation, truncation, and UI-rendering rationale — `restored` with the current complete interface.
- A06 — Provider rejection of `bashExecution` and acceptance of only shared roles — `restored`, while clarifying that Pi `Message` is normalized input to a provider implementation rather than its raw wire object.
- A07 — Structured `BashExecutionMessage` object/interface artifact — `restored` as a source-faithful current TypeScript interface.
- A08 — Three-role `Message` tree diagram — `restored` within the wider aligned boundary diagrams.
- A09 — `UserMessage` object artifact — `restored` as the complete current interface.
- A10 — String or text/image-array user content and multimodal explanation — `restored` with exact content-position rules.
- A11 — Historical `AssistantMessage` object with incomplete fields and a five-value stop-reason claim — `technically-invalid`; replaced by every current field and the seven exact `StopReason` values from [`types.ts`](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/ai/src/types.ts).
- A12 — Assistant text/thinking/Tool-call block tree — `restored` as exact discriminants and allowed-position table.
- A13 — One assistant message containing both explanatory text and a Tool call — `restored` in the copyable Tool exchange.
- A14 — Historical “signature IDs required by OpenAI and Google” aside — `technically-invalid` in attribution and field coverage; replaced by opaque `textSignature`, `thinkingSignature`, `thoughtSignature`, and `responseId` continuity rules evidenced across current Pi AI provider implementations.
- A15 — Historical `ToolResultMessage` object without `usage` or `addedToolNames` — `technically-invalid`; replaced by the complete current interface and dynamic-Tool semantics.
- A16 — `ToolCall.id` to `toolCallId` linkage and UI-oriented `details` argument — `restored` with provider serialization ownership.
- A17 — Complete user/assistant/Tool-result dialog tree — `restored` as a fully typed `Message[]` example with no omitted required metadata.
- A18 — Functional-data inventory: Bash, compaction, branch, and attachment/extension metadata — `restored` with supported current session and extension records.
- A19 — UI and model as independent readers with conflicting field needs — `restored` and expanded to storage/resume.
- A20 — Early flattening makes structured UI recovery impossible — `restored` as the source-versus-projection rule.
- A21 — Late, one-way, lossy model projection — `restored`; the final pages state explicitly that the stored/runtime source is not mutated.
- A22 — Agent core extension slot gives the core zero application dependencies and the consumer type safety — `restored` with exact package ownership.
- A23 — Four-role Coding Agent custom-message tree — `restored` as the pinned `bashExecution`, `custom`, `branchSummary`, and `compactionSummary` snapshot.
- A24 — Full Bash record fields including `excludeFromContext` — `restored` from current `core/messages.ts`.
- A25 — Claim that custom messages alone provide UI, persistence, and visibility, while standard messages have no filtering option — `technically-invalid`; declaration merging supplies only type membership, and `transformContext` or `convertToLlm` can filter shared or custom messages. Runtime and persistence policies are now separated.
- A26 — Exact `AgentMessage = Message | CustomAgentMessages[keyof CustomAgentMessages]` artifact — `restored`.
- A27 — Fixed seven-member `AgentMessage` diagram — `technically-invalid` as a general definition; restored as a scoped Coding Agent augmentation snapshot.
- A28 — `context.messages: AgentMessage[]` mixing shared and custom discriminants — `restored` as `agent.state.messages` and the per-call context snapshot.
- A29 — Empty `CustomAgentMessages` interface artifact — `restored` with its exact source comment.
- A30 — Coding Agent `declare module` artifact with four message registrations — `restored` in explanation and evidenced by pinned `core/messages.ts`; the copyable public example registers an application-owned notification instead of asking users to import internal interfaces.
- A31 — Compiler adds augmented values to `AgentMessage` and checks narrowing — `restored` with compilation-wide scope.
- A32 — Inheritance and generic-propagation trade-off argument — `restored` in direct language.
- A33 — Unverified Web UI roles `user-with-attachments` and `artifact` — `technically-invalid`; removed from active guidance and replaced with the public Coding Agent Extension `CustomMessageEntry` and `CustomEntry` paths.
- A34 — Per-call `transformContext -> convertToLlm -> Message[] -> streamFunction` diagram — `restored` and expanded with session projection and Pi AI provider conversion.
- A35 — `transformContext` before `convertToLlm` sequencing — `restored` with both `await` operations from [`agent-loop.ts`](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/agent/src/agent-loop.ts).
- A36 — Seven-role Coding Agent conversion table — `restored` with exact retained, converted, and filtered outcomes.
- A37 — Universal “all custom messages become user because providers require strict alternation” claim — `technically-invalid`; scoped to Coding Agent's converter, while Agent core permits filtering or any valid `Message[]` projection and Pi AI adapters own provider ordering repair.
- A38 — Before-conversion Bash JSON artifact — `restored`.
- A39 — After-conversion `UserMessage` JSON artifact — `restored` with the exact `Ran ...` formatter output.
- A40 — Claim that cancellation and truncation facts disappear during Bash conversion — `technically-invalid`; current `bashExecutionToText()` preserves cancellation, nonzero exit code, and recorded full-output path as text while the original typed fields remain in runtime/session data.
- A41 — Branch and compaction summaries wrapped in explanatory text and `<summary>` tags — `restored` with the current prefix/suffix constants.
- A42 — Two-stage pipeline diagram/caption argument — `restored` as the exact same-type then cross-type sequence.
- A43 — Separation of context policy from message-role conversion — `restored`.
- A44 — Replacing pruning with summary-based context management without changing the role converter — `restored`, while locating Coding Agent compaction in session reconstruction rather than claiming its Agent hook triggers compaction.
- A45 — Replacing coding roles with domain roles without changing context policy — `restored` through the notification example and application-owned converter discussion.
- A46 — Provider switches do not change `convertToLlm` because Pi AI owns the next boundary — `restored` with current API-implementation terminology instead of retired translators.
- A47 — `!!secret_cmd`/`!!command` no-context behavior — `restored` with the current interactive input parser and `excludeFromContext` field.
- A48 — `bashExecution` filter switch artifact — `restored` as a source-faithful current branch.
- A49 — Filtered Bash record remains available to UI/runtime — `restored` and expanded to persisted JSONL, extension-observation consequences, and the pending-record flush in `_runAgentPrompt()`'s `finally` after the final run's `agent_end`.
- A50 — Three-level visibility table containing an unsupported Web UI `ArtifactMessage` — `technically-invalid`; replaced with a four-boundary matrix of current public/runtime records, including the counterintuitive model-visible `display: false` custom message.
- A51 — Complete seven-step user-action-to-next-turn data-flow diagram — `restored` and expanded with live/resume inputs, the post-`agent_end` Bash flush, session projection, provider conversion, settled assistant state, ordered Tool results, and persistence.
- A52 — “Rich inside, strict outside” conclusion — `restored` without the unbounded-extension claim.
- A53 — Model-side versus functional-side needs list — `restored` as provider, TUI/runtime, and storage consumer requirements.
- A54 — Two-layer summary table fixed at seven inner message types — `technically-invalid`; replaced with the session history, live Agent transcript, and model-context table whose shapes remain extensible where the APIs allow.
- A55 — Cross-reference to Chapter 5's `Tool -> AgentTool -> ToolDefinition` layering — `restored` as a direct package-ownership comparison.
- A56 — Transfer step 1: identify the readers and their fixed versus application-owned needs — `restored` as the consumer/field inventory.
- A57 — Transfer step 2: retain structured source data and translate once at the protocol boundary — `restored` with the disposable per-call projection rule.
- A58 — Transfer step 3: pair a closed core contract with an application extension point — `restored` and extended with converter, renderer, validation, serialization, and migration counterparts.
- A59 — Six-chapter core-mechanism completion statement — `restored` as a concrete route from provider output through Tools and into the next message projection.
- A60 — Pre-advanced-section review suggestion — `restored` as a specific `ToolCall`/`ToolResultMessage`/session/hook trace in both locales.
- A61 — Questions leading from message and Tool state into events — `restored` through exact current event names and the Chapter 7 hand-off.
- A62 — Agent “nervous system” metaphor — `merged` into the concrete event-data-path hand-off; no separate metaphor is needed to teach the same transition.
- A63 — Historical source index with stale line ranges and retired repository links — `technically-invalid`; replaced by commit-pinned public and internal-glue paths, with source-faithful excerpts labeled at their actual files.
- A64 — Pi `v0.80.2` version note — `technically-invalid`; current package manifests identify `0.84.2`, and both pages pin the full `a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c` revision.
- A65 — `Next up` link to Chapter 7 — `restored` in both locale files.

The thinner pre-restoration Chapter 6 pages contained a compact content-block table, provider-conversion boundary, identity/time/opaque-metadata rules, persistence warning, and validation checklist. Their useful current material remains across Sections 2, 5, 7, 8, and 9 and is expanded with the baseline journey. Current additions include the public/default converter distinction, hook failure contracts, Extension handler settlement, image-block wrapper ownership, session-entry projection, the pending Bash flush after the final run's `agent_end`, `display: false` warning, settled-message persistence boundary, and package-ownership map. These additions do not change the 87 baseline decisions above.

## Reviewed mapping appendix: Chapter 7

Chapter 7 has 25 baseline H2–H3 decisions and 58 unique artifact or argument decisions: 83 total. The reconciliation is exact: 65 `restored` + 4 `merged` + 14 `technically-invalid` + 0 `duplicate` = 83. Final-to-baseline semantic-word preservation measured by `contentMetrics()` is EN 2,792 / 2,339 = 119.4% and VI 3,436 / 2,672 = 128.6%; each ratio compares one locale only. The final pair has mirrored H2/H3/H4 counts 9/27/0, 21 aligned fences, five aligned tables, and no Mermaid block. Every invalid historical claim is replaced in place with current Pi `0.84.2` behavior, so `content/preservation-manifest.json` keeps its original 80% word threshold and has no Chapter 7 deletion allowance.

### Heading outcomes

- H01 — H2 `1. Why do we need an event system?` / `1. Tại sao cần hệ thống sự kiện?` — `restored` as the motivation, live-state protocol, and persistence-boundary introduction.
- H02 — H3 `An intuition: starting from food delivery tracking` / `Một trực giác: bắt đầu từ theo dõi đơn giao hàng` — `restored` as the delivery-status analogy without the baseline's locale-specific product reference.
- H03 — H3 `What happens without events?` / `Không dùng event thì sao?` — `restored` as the Tool-audit change-isolation scenario and a copyable `Agent.subscribe()` example.
- H04 — H3 `Pub-sub vs direct call` / `Pub-sub (đăng-nhận) so với gọi trực tiếp` — `restored` as an aligned producer/consumer diagram and package-ownership explanation.
- H05 — H2 `2. 10 kinds of events, 4 layers of nesting` / `2. 10 loại sự kiện, 4 lớp lồng nhau` — `restored` as the exact ten `AgentEvent` discriminants and nested run/turn/message/Tool progression. The final wording corrects the claim that every layer has an update event.
- H06 — H2 `3. emit is not "notification", it's "synchronization barrier"` / `3. emit không phải "thông báo", mà là "rào chắn đồng bộ"` — `restored` as delivery, ordering, settlement, and the comparison between raw loops, `Agent`, `AgentSession`, and Extension handlers.
- H07 — H3 `Every event emit carries an await` / `Mỗi lần phát sự kiện đều có await` — `technically-invalid` as a universal statement. Current [`executePreparedToolCall()`, lines 670–710](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/agent/src/agent-loop.ts#L670-L710) starts progress deliveries from a synchronous callback, collects their promises, and joins all of them before result postprocessing.
- H08 — H3 `processEvents: first update state, then wait for listeners` / `processEvents: cập nhật state trước, rồi chờ listener` — `restored` with exact current `streamingMessage`, `messages`, `pendingToolCalls`, active-signal, and registration-order behavior.
- H09 — H3 `Why do we insist on await?` / `Tại sao nhất định phải await?` — `restored` through concrete state-visibility, Tool-preflight, Tool-result, final-flush, and idle barriers.
- H10 — H3 `One exception: tool_execution_update does not wait` / `Một ngoại lệ: tool_execution_update không chờ` — `technically-invalid`; [`executePreparedToolCall()`, lines 670–710](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/agent/src/agent-loop.ts#L670-L710) starts delivery without awaiting inside `onUpdate`, then awaits `Promise.all(updateEvents)` before result finalization. The replacement records both halves instead of calling progress entirely unawaited.
- H11 — H2 `4. Error handling: listener exceptions bubble up directly` / `4. Xử lý lỗi: listener ném ngoại lệ thẳng lên trên` — `restored` with the current synthetic failure lifecycle, repeated-listener-failure edge case, session-listener behavior, abort propagation, and Extension-hook isolation.
- H12 — H2 `5. What can you do with the event system?` / `5. Bạn có thể làm gì với hệ thống sự kiện?` — `restored` as observation, interception, preprocessing, and browser UI integration.
- H13 — H3 `Scenario 1: real-time observe what the Agent is doing` / `Kịch bản 1: quan sát real-time Agent đang làm gì` — `restored` as a copyable `toolCallId`-correlated timing subscriber and telemetry safety guidance.
- H14 — H3 `Scenario 2: tool call interception` / `Kịch bản 2: chặn lời gọi tool` — `restored` with current `isToolCallEventType()`, mutable post-validation input, block reason, and the post-batch all-results `terminate` decision.
- H15 — H3 `Scenario 3: context pre-processing` / `Kịch bản 3: tiền xử lý context` — `restored` with the current deep-cloned, chained Extension `context` hook and its non-destructive history boundary.
- H16 — H3 `Scenario 4: stream forwarding to the Web frontend` / `Kịch bản 4: chuyển tiếp stream về frontend Web` — `restored` as a copyable SSE adapter that cleans up its subscription and ends on product-level `agent_settled`.
- H17 — H3 `Summary` / `Tóm tắt nhỏ` — `merged` into Sections 5 and 8, which connect the four scenarios to explicit observation/control contracts and package ownership.
- H18 — H2 `6. Case study: tracking the complete journey of a text_delta` / `6. Case study: hành trình hoàn chỉnh của một text_delta` — `restored` as the provider-to-Pi-AI-to-loop-to-Agent-to-session-to-UI journey, including delta/cumulative-state and persistence rules.
- H19 — H2 `7. What the Session layer extends` / `7. Tầng Session mở rộng gì` — `restored` in the event-protocol section with the complete current `AgentSessionEvent` surface.
- H20 — H3 `Kernel 10 + Session 7` / `Kernel 10 + Session 7` — `technically-invalid`; pinned [`AgentSessionEvent`, lines 142–185](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/coding-agent/src/core/agent-session.ts#L142-L185) adds 13 distinct product discriminants and augments `agent_end`, for 23 distinct session discriminants in total.
- H21 — H2 `8. Summary: three design decisions` / `8. Tóm tắt: ba quyết định thiết kế` — `restored` as design decisions plus five transferable verification questions rather than a repeated chapter recap.
- H22 — H3 `Decision 1: synchronization barrier` / `Quyết định 1: rào chắn đồng bộ` — `restored` with the current split between awaited lifecycle delivery and concurrent-then-joined Tool progress.
- H23 — H3 `Decision 2: expose exceptions directly` / `Quyết định 2: phơi bày ngoại lệ trực tiếp` — `restored` with separate policies for direct Agent subscribers, synchronous session subscribers, Tool preflight, and isolated Extension handlers.
- H24 — H3 `Decision 3: two-layer events` / `Quyết định 3: event hai lớp` — `technically-invalid` only in its fixed “10 + 7” inventory. [`AgentSessionEvent`, lines 142–185](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/coding-agent/src/core/agent-session.ts#L142-L185) supplies the 13 product additions, while [`ExtensionEvent`, lines 1050–1075](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/coding-agent/src/core/extensions/types.ts#L1050-L1075) proves there is a wider third contract. The replacement package-ownership lesson records all three surfaces.
- H25 — H2 `9. Next stop` / `9. Trạm tiếp theo` — `restored` as the hand-off from event timing to Chapter 8's system-prompt, Tool-output, compaction, and branch-summary pipeline.

### Unique artifact and argument outcomes

- A01 — Chapter 3/5/6 event references and the opening questions about transmission, listeners, and waiting — `restored` as the three-surface problem statement.
- A02 — Advanced-chapters reading note — `restored` with Chapters 1–6 identified as the runtime walkthrough and Chapter 7 as the settlement/failure transition.
- A03 — Delivery-status analogy — `restored` without relying on a regional application name.
- A04 — Message-start, message-update, and Tool-start state snapshots — `restored` and expanded to the complete current discriminants.
- A05 — Source-editing and upstream-conflict cost of adding Tool logging — `restored` as the change-isolation motivation.
- A06 — Minimal Tool logging subscription — `restored` as a typed, copyable `Agent` helper that returns its unsubscribe function.
- A07 — Separation of “what happened” from consumers that care — `restored` as producer, event-contract, and consumer ownership.
- A08 — Direct-call versus pub/sub diagram — `restored` as an aligned plain-text diagram safe for Fumadocs.
- A09 — `emit(event)` and `subscribe(listener)` vocabulary — `restored` without the baseline's shouting metaphor.
- A10 — Ten core events organized across run, turn, message, and Tool-execution families — `restored` as an exact payload table.
- A11 — Claim that all four layers have `start -> update -> end` — `technically-invalid`; pinned [`AgentEvent`, lines 421–443](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/agent/src/types.ts#L421-L443) defines run and turn as start/end pairs, while only message and Tool execution add update events. The replacement table and lifecycle tree preserve that exact split.
- A12 — Full `AgentEvent` union artifact — `restored` as a precisely attributed source-faithful excerpt with every current field.
- A13 — Nested lifecycle tree — `restored`, including user/injected message events and repeated turns.
- A14 — Turn definition as one assistant response plus Tool calls/results — `restored` from current source wording.
- A15 — Claim that SessionManager only watches `turn_end` — `technically-invalid`; current [`_handleAgentEvent()`, lines 620–668](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/coding-agent/src/core/agent-session.ts#L620-L668) awaits Extension delivery, notifies public session listeners, and persists supported messages on `message_end`. The replacement documents that order.
- A16 — `AgentEventSink` synchronous-or-promise signature — `restored` through the direct Agent signature and the delivery-surface comparison.
- A17 — Node-style fire-and-forget comparison — `restored` as a producer-barrier contrast without implying raw `agentLoop()` consumers are awaited.
- A18 — Awaited lifecycle-emission sequence — `restored` as state/listener/emit/producer ordering plus concrete call-site barriers.
- A19 — Synchronization negotiation rather than passive notification — `restored` in direct settlement language.
- A20 — `processEvents()` reducer/listener-loop artifact — `restored` as attributed pseudocode, with copied `Set` behavior called out separately.
- A21 — State-before-listener guarantee — `restored` for completed messages, streaming partials, and pending Tool calls.
- A22 — Externally controlled listener `Set` and registration order — `restored`, including unsubscribe ownership.
- A23 — Separate fire-and-forget inconsistency diagram — `merged` into the lifecycle barrier diagram and the cross-surface settlement table, which carry the same ordering argument.
- A24 — Awaited barrier diagram — `restored` as the exact state-to-listener-to-producer sequence.
- A25 — Slow-consumer performance versus consistency trade-off — `restored` and scoped to each event surface.
- A26 — Claim that Tool progress listeners are never awaited — `technically-invalid`; pinned [`executePreparedToolCall()`, lines 670–710](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/agent/src/agent-loop.ts#L670-L710) joins every collected update-delivery promise before returning to `afterToolCall` and `tool_execution_end`. The replacement explains that deliveries can overlap but still meet this barrier.
- A27 — `updateEvents` batching artifact — `restored` as attributed pseudocode with exact collection and `Promise.all` order.
- A28 — `acceptingUpdates` late-callback gate — `restored`, including its close-before-join behavior.
- A29 — No per-listener catch in `Agent.processEvents()` — `restored` from current `agent.ts`.
- A30 — Direct listener failure affects the run — `restored` with synthetic failure lifecycle and repeated-failure behavior.
- A31 — Fuse analogy for visible listener failures — `merged` into the concrete failure sequence and application-policy example; the mechanism and consequence remain.
- A32 — Application-level catch recommendation — `restored` as a copyable audit subscriber whose rethrow policy is explicit.
- A33 — Blanket claim that the Extension framework isolates every third-party callback — `technically-invalid`; the generic and chained handler paths catch per-handler failures in [`runner.ts`, lines 801–929](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/coding-agent/src/core/extensions/runner.ts#L801-L929), but [`emitToolCall()`, lines 932–953](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/coding-agent/src/core/extensions/runner.ts#L932-L953) does not catch. [`prepareToolCall()`, lines 616–667](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/agent/src/agent-loop.ts#L616-L667) converts that preflight exception into an immediate error result. The replacement separates those policies.
- A34 — Four representative event-system scenarios — `restored` in the same observation-to-control-to-context-to-UI progression.
- A35 — Real-time Tool observation code — `restored` with unique call correlation, duration, error status, unsubscribe, and secret-redaction guidance.
- A36 — TUI as an event consumer — `restored` in the `text_delta` endpoint and browser/UI batching discussion.
- A37 — Extension `tool_call` blocking scenario — `restored` with exact current mutable-input rules and the all-finalized-results `terminate` decision after the current batch.
- A38 — Context preprocessing scenario — `restored` with the current Extension event, deep-clone boundary, and chained results.
- A39 — Server-to-browser SSE forwarding artifact — `restored` as a typed `AgentSession`/`ServerResponse` helper.
- A40 — New observers do not require Agent-core changes — `restored` through the package-dependency and design-decision sections.
- A41 — End-to-end `text_delta` case-study framing — `restored` with Pi AI, Agent core, Coding Agent, Extension, and UI boundaries.
- A42 — Five-layer `text_delta` diagram caption — `restored` as an eight-transition plain-text flow that names every current bridge.
- A43 — Character/chunk journey artifact — `restored` with `"Hel"`, `contentIndex`, `delta`, and cumulative `partial` instead of corrupted historical sample text.
- A44 — Claim that events are the only cross-layer communication and no layer calls another layer's internals — `technically-invalid`; the [`AgentSession` constructor, lines 382–402](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/coding-agent/src/core/agent-session.ts#L382-L402) stores the `Agent`, subscribes internally, and installs hooks. Its [`message_end` bridge, lines 721–790](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/coding-agent/src/core/agent-session.ts#L721-L790) mutates same-role replacements in place, while [`_handleAgentEvent()`, lines 620–668](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/coding-agent/src/core/agent-session.ts#L620-L668) separately dispatches and persists. The replacement describes these direct and event-mediated links.
- A45 — Mapping text/thinking/Tool-call stream updates into `message_update` while retaining `assistantMessageEvent` — `restored` with all nine exact discriminants.
- A46 — Compaction, retry, queue, and other product responsibilities above Agent core — `restored` with the complete current event families.
- A47 — Linux-kernel/Bluetooth analogy — `merged` into the concrete package-ownership test; the core-versus-product placement rule remains without the unrelated platform metaphor.
- A48 — Historical `AgentSessionEvent = core 10 + session 7` artifact — `technically-invalid`; pinned [`AgentSessionEvent`, lines 142–185](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/coding-agent/src/core/agent-session.ts#L142-L185) excludes and augments core `agent_end`, then declares 13 distinct product discriminants. The replacement reproduces that union and its 23 distinct session event types.
- A49 — Product-level events belong outside reusable Agent core — `restored` and extended to project trust, resource, provider, and input Extension events.
- A50 — Decision that lifecycle delivery forms a consistency barrier — `restored` with precise settlement points.
- A51 — Claim that a direct listener exception simply bubbles out as immediate run failure — `technically-invalid`; pinned [`runWithLifecycle()` and `handleRunFailure()`, lines 486–526](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/agent/src/agent.ts#L486-L526) catch the first failure and emit a synthetic assistant message, turn end, and agent end. Because those emissions invoke listeners again, a repeated listener failure can still reject `prompt()`. The replacement records both stages.
- A52 — Layered core/product event ownership — `restored` after correcting the product inventory and separating Extension events.
- A53 — Closing decoupling argument for UI, logs, persistence, and extensions — `restored` as explicit observation/control and ownership rules.
- A54 — Claim that Coding Agent compaction is an aggressive operation performed by `transformContext` — `technically-invalid`; pinned [`streamAssistantResponse()`, lines 281–300](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/agent/src/agent-loop.ts#L281-L300) applies `transformContext` only to the messages projected into one model call. [`AgentSession.compact()`, lines 1850–1867](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/coding-agent/src/core/agent-session.ts#L1850-L1867) identifies the separate manual and automatic compaction paths. The replacement keeps projection and session compaction distinct.
- A55 — Transition from the event system to context engineering and compaction — `restored` with current system-prompt, Tool-output, compaction, and branch-summary terms.
- A56 — Historical source index with obsolete line ranges — `technically-invalid`; the replacement index points to the pinned current definitions for [`AssistantMessageEvent`, lines 535–551](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/ai/src/types.ts#L535-L551), [`AgentEvent`, lines 421–443](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/agent/src/types.ts#L421-L443), [parallel Tool scheduling, lines 489–552](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/agent/src/agent-loop.ts#L489-L552), [Agent lifecycle delivery, lines 486–590](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/agent/src/agent.ts#L486-L590), [`AgentSessionEvent`, lines 142–188](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/coding-agent/src/core/agent-session.ts#L142-L188), and [Extension dispatch, lines 801–953](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/coding-agent/src/core/extensions/runner.ts#L801-L953).
- A57 — Pi `v0.80.2` version note — `technically-invalid`; the pinned [`pi-agent-core` manifest, lines 1–4](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/agent/package.json#L1-L4) and [`pi-coding-agent` manifest, lines 1–4](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/coding-agent/package.json#L1-L4) both report `0.84.2`. The replacement version note pins the full commit `a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c`.
- A58 — `Next up` link to Chapter 8 — `restored` in both locales.

The thinner pre-restoration Chapter 7 pages already contained the ten core event names, no-Tool and Tool lifecycle sketches, an `Agent.subscribe()` sample, state visibility, awaited `agent_end` guidance, partial-message rendering, persistence/telemetry advice, and a failure checklist. Those verified corrections remain and are expanded through the baseline progression. Current-source additions include all Pi AI stream discriminants, the complete 13-event product extension, the full Extension family inventory, raw-loop versus Agent versus AgentSession settlement, in-place final-message replacement, exact parallel Tool ordering, `agent_settled`, direct Bash progress, abort scope, and copyable UI/hook examples. These additions do not change the 83 baseline decisions above.
