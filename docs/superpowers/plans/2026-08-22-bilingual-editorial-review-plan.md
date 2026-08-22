# Bilingual Editorial Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Biên tập toàn bộ 23 cặp trang tiếng Anh và tiếng Việt thành tài liệu kỹ thuật tự nhiên, có dấu đầy đủ, đúng thuật ngữ và đã được kiểm chứng.

**Architecture:** Nội dung trong `content/en` và `content/vi` được xử lý theo sáu batch nhỏ. Automated editorial lint loại bỏ residual Chinese, mojibake, đoạn tiếng Việt dài không dấu và các cụm machine-translation đã biết; structural validator bảo vệ heading, code fence và Mermaid parity; review ledger ghi nguồn kiểm chứng và trạng thái từng trang.

**Tech Stack:** Markdown, Node.js 24, `node:test`, `gray-matter`, official Pi docs/source, GitBook Preview.

---

## Dependency and editorial contract

- Chỉ bắt đầu sau khi `2026-08-22-gitbook-content-foundation-plan.md` hoàn tất.
- Repository Markdown là nguồn duy nhất được sửa; không sửa trực tiếp trong GitBook editor.
- Mọi batch phải xem bản render GitBook thực tế trước commit.
- Không thay đổi API identifier, package name, file path, command, environment variable, JSON key hoặc type signature để làm câu văn trôi chảy hơn.
- Khi tài liệu Trung và implementation hiện tại mâu thuẫn, official Pi docs và source code hiện tại thắng.

## File map

| File | Responsibility |
| --- | --- |
| `scripts/editorial-lint.mjs` | Detect residual Chinese, mojibake, known literal-translation patterns and unaccented Vietnamese prose |
| `scripts/editorial-lint.test.mjs` | Unit tests for prose extraction and editorial rules |
| `scripts/editorial-rules.json` | Auditable allowlist and banned phrase rules |
| `docs/translation-review/2026-08-22.md` | Per-page source verification and reviewer ledger |
| `GLOSSARY.md` | Canonical terminology for both languages |
| `content/en/**` | Reviewed English publication |
| `content/vi/**` | Reviewed Vietnamese publication |

### Task 1: Add automated editorial lint

**Files:**
- Create: `scripts/editorial-rules.json`
- Create: `scripts/editorial-lint.mjs`
- Create: `scripts/editorial-lint.test.mjs`
- Modify: `package.json`

- [ ] **Step 1: Define explicit rules**

Create `scripts/editorial-rules.json`:

```json
{
  "englishBannedPatterns": [
    "Provider private format",
    "Return directly AsyncIterable",
    "inheritance Tool The three fields of",
    "Compatibility spacer",
    "Which model to use Find out who to contact",
    "one line code harness"
  ],
  "mojibakePatterns": ["Ã", "Â", "â€", "�"],
  "minimumVietnameseParagraphWords": 24
}
```

- [ ] **Step 2: Write failing unit tests**

Create `scripts/editorial-lint.test.mjs`:

```js
import assert from "node:assert/strict";
import test from "node:test";
import { inspectDocument, proseOnly } from "./editorial-lint.mjs";

test("proseOnly removes frontmatter and fenced code", () => {
  const markdown = `---
title: Test
---
Đoạn văn có dấu đầy đủ.

\`\`\`ts
const label = "中文";
\`\`\`
`;
  const prose = proseOnly(markdown);
  assert.doesNotMatch(prose, /title:/);
  assert.doesNotMatch(prose, /const label/);
  assert.match(prose, /Đoạn văn có dấu đầy đủ/);
});

test("English lint reports residual Han and literal translation", () => {
  const errors = inspectDocument(
    "Provider private format. Đây là chữ 中文 còn sót.",
    "en",
    "ch04-model-invocation.md",
  );
  assert.ok(errors.some((error) => error.rule === "residual-han"));
  assert.ok(errors.some((error) => error.rule === "literal-english"));
});

test("Vietnamese lint reports a long unaccented paragraph", () => {
  const paragraph = "Day la mot doan van tieng Viet khong dau du dai de bo kiem tra phat hien va yeu cau bien tap lai truoc khi xuat ban chinh thuc cho nguoi doc.";
  const errors = inspectDocument(paragraph, "vi", "ch09-compaction.md");
  assert.ok(errors.some((error) => error.rule === "unaccented-vietnamese"));
});

test("Vietnamese lint accepts natural accented prose", () => {
  const paragraph = "Đây là một đoạn văn tiếng Việt có dấu, giải thích rõ cách hệ thống nén ngữ cảnh nhưng vẫn giữ lại các quyết định quan trọng của phiên làm việc.";
  assert.deepEqual(inspectDocument(paragraph, "vi", "ch09-compaction.md"), []);
});
```

- [ ] **Step 3: Run tests and verify failure**

Run:

```powershell
node --test scripts/editorial-lint.test.mjs
```

Expected: FAIL because `scripts/editorial-lint.mjs` does not exist.

- [ ] **Step 4: Implement the linter**

Create `scripts/editorial-lint.mjs`:

```js
#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import matter from "gray-matter";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rules = JSON.parse(
  await readFile(path.join(repositoryRoot, "scripts/editorial-rules.json"), "utf8"),
);

export function proseOnly(markdown) {
  const content = matter(markdown).content;
  return content
    .replace(/^```[^\n]*\n[\s\S]*?^```\s*$/gm, "")
    .replace(/`[^`]+`/g, "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\{%[\s\S]*?%\}/g, "")
    .trim();
}

function paragraphWordCount(paragraph) {
  return (paragraph.match(/[A-Za-zÀ-ỹĐđ]+/g) || []).length;
}

function hasVietnameseMarks(paragraph) {
  return /[ăâđêôơưĂÂĐÊÔƠƯáàảãạấầẩẫậắằẳẵặéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ]/i.test(paragraph);
}

export function inspectDocument(markdown, locale, relativePath) {
  const prose = proseOnly(markdown);
  const errors = [];
  if (/[㐀-䶿一-鿿]/u.test(prose)) {
    errors.push({ rule: "residual-han", path: relativePath });
  }
  for (const token of rules.mojibakePatterns) {
    if (prose.includes(token)) errors.push({ rule: "mojibake", path: relativePath, token });
  }
  if (locale === "en") {
    for (const phrase of rules.englishBannedPatterns) {
      if (prose.toLowerCase().includes(phrase.toLowerCase())) {
        errors.push({ rule: "literal-english", path: relativePath, phrase });
      }
    }
  }
  if (locale === "vi") {
    for (const paragraph of prose.split(/\r?\n\s*\r?\n/)) {
      if (
        paragraphWordCount(paragraph) >= rules.minimumVietnameseParagraphWords &&
        !hasVietnameseMarks(paragraph)
      ) {
        errors.push({ rule: "unaccented-vietnamese", path: relativePath });
      }
    }
  }
  return errors;
}

export async function lintPaths(paths) {
  const errors = [];
  for (const relativePath of paths) {
    const locale = relativePath.replace(/\\/g, "/").split("/")[1];
    const markdown = await readFile(path.join(repositoryRoot, relativePath), "utf8");
    errors.push(...inspectDocument(markdown, locale, relativePath));
  }
  return errors;
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (invokedPath === import.meta.url) {
  const manifest = JSON.parse(
    await readFile(path.join(repositoryRoot, "content/translation-manifest.json"), "utf8"),
  );
  const requested = process.argv.slice(2).filter((argument) => !argument.startsWith("--"));
  const paths = requested.length > 0
    ? requested
    : manifest.pages.flatMap((page) => [`content/en/${page.en}`, `content/vi/${page.vi}`]);
  const errors = await lintPaths(paths);
  if (errors.length > 0) {
    for (const error of errors) console.error(JSON.stringify(error));
    process.exit(1);
  }
  console.log(`Editorial lint passed for ${paths.length} files.`);
}
```

- [ ] **Step 5: Add scripts without enabling the failing whole-site gate yet**

Add to `package.json`:

```json
{
  "test:editorial": "node --test scripts/editorial-lint.test.mjs",
  "lint:editorial": "node scripts/editorial-lint.mjs"
}
```

- [ ] **Step 6: Run unit tests and capture the expected baseline debt**

Run:

```powershell
npm run test:editorial
npm run lint:editorial
```

Expected: unit tests PASS; whole-site lint FAILS and lists the current content debt. Save the console output in the pull request notes, not as a tracked log.

- [ ] **Step 7: Commit editorial tooling**

```powershell
git add scripts/editorial-rules.json scripts/editorial-lint.mjs scripts/editorial-lint.test.mjs package.json package-lock.json
git commit -m "test(i18n): add bilingual editorial lint"
```

### Task 2: Normalize the glossary and create the review ledger

**Files:**
- Modify: `GLOSSARY.md`
- Create: `docs/translation-review/2026-08-22.md`

- [ ] **Step 1: Normalize glossary entries**

For every entry in `GLOSSARY.md`, enforce these columns and decisions:

```markdown
| Canonical term | English usage | Vietnamese usage | Translate? | Verification source |
| --- | --- | --- | --- | --- |
| Agent | Agent | Agent | No | Official Pi docs |
| Agent Loop | Agent Loop | vòng lặp Agent | Explain first use | `packages/agent/docs/harness.md` |
| Tool | Tool | Tool | No | Official Pi docs |
| Provider | provider | provider | No | `providers.md` |
| Session | session | session | Explain first use | `sessions.md` |
| Context | context | ngữ cảnh | Yes in prose | `usage.md` |
| Context Compaction | context compaction | nén ngữ cảnh | Yes | `compaction.md` |
| streaming | streaming | truyền dữ liệu theo luồng (streaming) | Explain first use | API/source |
| Harness | harness | bộ khung (harness) | Explain first use | `packages/agent/docs/harness.md` |
| Prompt | prompt | prompt | No | Official Pi docs |
| Model | model | model | No | Official Pi docs |
| Message | message | message | No in type names | Source types |
```

Keep all existing API identifiers and environment-variable entries below this core table. Remove duplicate rows and contradictory Vietnamese equivalents.

- [ ] **Step 2: Create the complete review ledger**

Create `docs/translation-review/2026-08-22.md` with one row for each manifest key:

```markdown
# Pify Docs Translation Review Ledger

| Key | Batch | English | Vietnamese | Technical source checked | GitBook preview checked |
| --- | ---: | --- | --- | --- | --- |
| home | 1 | pending | pending | pending | pending |
| quickstart | 1 | pending | pending | pending | pending |
| glossary | 1 | pending | pending | pending | pending |
| faq | 1 | pending | pending | pending | pending |
| changelog | 1 | pending | pending | pending | pending |
| ch01-overview | 2 | pending | pending | pending | pending |
| ch02-three-layer-arch | 2 | pending | pending | pending | pending |
| ch03-agent-loop | 2 | pending | pending | pending | pending |
| ch04-model-invocation | 3 | pending | pending | pending | pending |
| ch05-tool-system | 3 | pending | pending | pending | pending |
| ch06-messages | 3 | pending | pending | pending | pending |
| ch07-event-driven | 4 | pending | pending | pending | pending |
| ch08-context-engineering | 4 | pending | pending | pending | pending |
| ch09-compaction | 4 | pending | pending | pending | pending |
| ch10-session | 4 | pending | pending | pending | pending |
| how-to-add-custom-tool | 5 | pending | pending | pending | pending |
| how-to-plug-new-model | 5 | pending | pending | pending | pending |
| how-to-stream-output | 5 | pending | pending | pending | pending |
| how-to-persist-sessions | 5 | pending | pending | pending | pending |
| how-to-customize-system-prompt | 5 | pending | pending | pending | pending |
| reference-api | 6 | pending | pending | pending | pending |
| reference-configuration | 6 | pending | pending | pending | pending |
| reference-environment-variables | 6 | pending | pending | pending | pending |
```

- [ ] **Step 3: Commit terminology contract and ledger**

```powershell
git add GLOSSARY.md docs/translation-review/2026-08-22.md
git commit -m "docs(i18n): define editorial review contract"
```

## Batch procedure used by Tasks 3 through 8

At the start of the first batch, record the current commit SHA of `https://github.com/earendil-works/pi` in the review ledger. Use sources in this priority order: the pinned Pi implementation, `https://pi.dev`, upstream package docs in that repository, then the Chinese Pi Agent Book at `https://www.dgzhuya.com/` as a structural/authorial reference. Never use the Chinese book to override current API behavior.

For every listed page pair, perform this exact sequence:

1. Read the English page, Vietnamese page, matching Chinese page when present, official Pi documentation, and referenced source definitions.
2. Rewrite English for idiomatic technical prose; do not preserve broken sentence structure for line-level diff similarity.
3. Rewrite Vietnamese with full diacritics and natural Vietnamese syntax; use `GLOSSARY.md` decisions consistently.
4. Verify every code block, type name, command, path and configuration key against official sources.
5. Keep heading levels, code-fence languages, Mermaid topology and example order paired.
6. Set frontmatter `status: reviewed`, set `reviewed_by: Pify maintainers`, and update `last_updated` using the execution date.
7. Run focused editorial lint on the exact files, then structural validation.
8. Open both pages in GitBook Preview at desktop and mobile width. Check heading wrap, code overflow, tables, callouts, diagrams and previous/next navigation.
9. Change the corresponding ledger row from `pending` to `reviewed` and record the primary technical source as a Markdown link.

### Task 3: Review start and help pages

**Files:**
- Modify: `content/en/README.md`
- Modify: `content/en/quickstart.md`
- Modify: `content/en/glossary.md`
- Modify: `content/en/help/faq.md`
- Modify: `content/en/changelog.md`
- Modify: matching files under `content/vi/`
- Modify: `docs/translation-review/2026-08-22.md`

- [ ] **Step 1: Apply the batch procedure to the five page pairs**

Use these content-specific corrections:

- Home: remove the claim that readers select Chinese; describe English and Vietnamese only.
- Quickstart: verify package names and imports; replace the unnecessary Vietnamese prose tokens `tutorial`, `model call`, `function call` and `system architecture` with the glossary-approved equivalents.
- Glossary: match the root `GLOSSARY.md` decisions.
- FAQ: localize every question, answer, action label and link description.
- Changelog: translate the Vietnamese page title to `Nhật ký thay đổi` and describe the GitBook migration accurately.

- [ ] **Step 2: Run focused checks**

```powershell
node scripts/editorial-lint.mjs content/en/README.md content/vi/README.md content/en/quickstart.md content/vi/quickstart.md content/en/glossary.md content/vi/glossary.md content/en/help/faq.md content/vi/help/faq.md content/en/changelog.md content/vi/changelog.md
npm run lint:gitbook
```

Expected: both commands PASS.

- [ ] **Step 3: Commit batch 1**

```powershell
git add content/en/README.md content/vi/README.md content/en/quickstart.md content/vi/quickstart.md content/en/glossary.md content/vi/glossary.md content/en/help/faq.md content/vi/help/faq.md content/en/changelog.md content/vi/changelog.md docs/translation-review/2026-08-22.md
git commit -m "docs(i18n): review start and help pages"
```

### Task 4: Review chapters 1 through 3

**Files:**
- Modify: `content/en/ch01-overview.md`
- Modify: `content/en/ch02-three-layer-arch.md`
- Modify: `content/en/ch03-agent-loop.md`
- Modify: matching files under `content/vi/`
- Modify: `docs/translation-review/2026-08-22.md`

- [ ] **Step 1: Apply the batch procedure to chapters 1 through 3**

Pay special attention to literal comments in package export examples, consistent `Agent Loop` terminology, and the distinction among AI, Agent Core and Coding Agent layers.

- [ ] **Step 2: Run focused checks**

```powershell
node scripts/editorial-lint.mjs content/en/ch01-overview.md content/vi/ch01-overview.md content/en/ch02-three-layer-arch.md content/vi/ch02-three-layer-arch.md content/en/ch03-agent-loop.md content/vi/ch03-agent-loop.md
npm run lint:gitbook
npm run lint:mermaid
```

Expected: all commands PASS.

- [ ] **Step 3: Commit batch 2**

```powershell
git add content/en/ch01-overview.md content/vi/ch01-overview.md content/en/ch02-three-layer-arch.md content/vi/ch02-three-layer-arch.md content/en/ch03-agent-loop.md content/vi/ch03-agent-loop.md docs/translation-review/2026-08-22.md
git commit -m "docs(i18n): review architecture chapters"
```

### Task 5: Review chapters 4 through 6

**Files:**
- Modify: `content/en/ch04-model-invocation.md`
- Modify: `content/en/ch05-tool-system.md`
- Modify: `content/en/ch06-messages.md`
- Modify: matching files under `content/vi/`
- Modify: `docs/translation-review/2026-08-22.md`

- [ ] **Step 1: Apply the batch procedure to chapters 4 through 6**

Required corrections include:

- Replace the broken English phrases around provider-specific request/response formats and `AsyncIterable<Chunk>`.
- Rewrite malformed English and Vietnamese code comments without altering executable tokens.
- Distinguish model/provider abstraction, Tool definition, AgentTool adaptation and Message conversion precisely.
- Replace Vietnamese literal phrases such as `Agent lớp học`, `móc tiền xử lý`, and malformed signature descriptions with natural technical Vietnamese.

- [ ] **Step 2: Run focused checks**

```powershell
node scripts/editorial-lint.mjs content/en/ch04-model-invocation.md content/vi/ch04-model-invocation.md content/en/ch05-tool-system.md content/vi/ch05-tool-system.md content/en/ch06-messages.md content/vi/ch06-messages.md
npm run lint:gitbook
npm run lint:mermaid
```

Expected: all commands PASS and none of the strings in `englishBannedPatterns` remain.

- [ ] **Step 3: Commit batch 3**

```powershell
git add content/en/ch04-model-invocation.md content/vi/ch04-model-invocation.md content/en/ch05-tool-system.md content/vi/ch05-tool-system.md content/en/ch06-messages.md content/vi/ch06-messages.md docs/translation-review/2026-08-22.md
git commit -m "docs(i18n): review model tool and message chapters"
```

### Task 6: Review chapters 7 through 10

**Files:**
- Modify: `content/en/ch07-event-driven.md`
- Modify: `content/en/ch08-context-engineering.md`
- Modify: `content/en/ch09-compaction.md`
- Modify: `content/en/ch10-session.md`
- Modify: matching files under `content/vi/`
- Modify: `docs/translation-review/2026-08-22.md`

- [ ] **Step 1: Apply the batch procedure to chapters 7 through 10**

Required corrections include:

- Remove residual `逆向` and any other Chinese from published prose.
- Rewrite all unaccented Vietnamese paragraphs in chapters 9 and 10.
- Keep Event, Context Engineering, compaction and Session terminology distinct.
- Verify session tree, compaction thresholds and persisted entry fields against official docs/source.

- [ ] **Step 2: Run focused checks**

```powershell
node scripts/editorial-lint.mjs content/en/ch07-event-driven.md content/vi/ch07-event-driven.md content/en/ch08-context-engineering.md content/vi/ch08-context-engineering.md content/en/ch09-compaction.md content/vi/ch09-compaction.md content/en/ch10-session.md content/vi/ch10-session.md
npm run lint:gitbook
npm run lint:mermaid
```

Expected: all commands PASS; no long unaccented Vietnamese paragraph is reported.

- [ ] **Step 3: Commit batch 4**

```powershell
git add content/en/ch07-event-driven.md content/vi/ch07-event-driven.md content/en/ch08-context-engineering.md content/vi/ch08-context-engineering.md content/en/ch09-compaction.md content/vi/ch09-compaction.md content/en/ch10-session.md content/vi/ch10-session.md docs/translation-review/2026-08-22.md
git commit -m "docs(i18n): review context and session chapters"
```

### Task 7: Review five how-to guides

**Files:**
- Modify: `content/en/how-to/add-custom-tool.md`
- Modify: `content/en/how-to/plug-new-model.md`
- Modify: `content/en/how-to/stream-output.md`
- Modify: `content/en/how-to/persist-sessions.md`
- Modify: `content/en/how-to/customize-system-prompt.md`
- Modify: matching files under `content/vi/how-to/`
- Modify: `docs/translation-review/2026-08-22.md`

- [ ] **Step 1: Apply the batch procedure to all how-to guides**

Each guide must use task-oriented titles, prerequisites, numbered actions, a verification step and a concise failure note. Vietnamese titles must no longer begin with untranslated `How to`.

- [ ] **Step 2: Run focused checks**

```powershell
$paths = @(rg --files content/en/how-to content/vi/how-to | Sort-Object)
node scripts/editorial-lint.mjs @paths
npm run lint:gitbook
```

Expected: both commands PASS for ten files.

- [ ] **Step 3: Commit batch 5**

```powershell
git add content/en/how-to content/vi/how-to docs/translation-review/2026-08-22.md
git commit -m "docs(i18n): review task-oriented guides"
```

### Task 8: Review three reference pages

**Files:**
- Modify: `content/en/reference/api.md`
- Modify: `content/en/reference/configuration.md`
- Modify: `content/en/reference/environment-variables.md`
- Modify: matching files under `content/vi/reference/`
- Modify: `docs/translation-review/2026-08-22.md`

- [ ] **Step 1: Apply the batch procedure to all reference pages**

Verify every public export, setting key, default, environment variable and example against current official Pi docs/source. Vietnamese table headings and descriptions must be localized while identifiers remain exact.

- [ ] **Step 2: Run focused checks**

```powershell
$paths = @(rg --files content/en/reference content/vi/reference | Sort-Object)
node scripts/editorial-lint.mjs @paths
npm run lint:gitbook
```

Expected: both commands PASS for six files.

- [ ] **Step 3: Commit batch 6**

```powershell
git add content/en/reference content/vi/reference docs/translation-review/2026-08-22.md
git commit -m "docs(i18n): review technical reference"
```

### Task 9: Enforce reviewed status in CI

**Files:**
- Modify: `scripts/validate-gitbook-content.mjs`
- Modify: `scripts/gitbook-content.test.mjs`
- Modify: `package.json`
- Modify: `.github/workflows/content-quality.yml`

- [ ] **Step 1: Add a failing assertion for final status**

Extend the validator integration test:

```js
test("all published page pairs are reviewed", async () => {
  const errors = await validateRepository(new URL("..", import.meta.url), {
    requireReviewed: true,
  });
  assert.deepEqual(errors, []);
});
```

- [ ] **Step 2: Implement the final-status option**

Change the validator signature to:

```js
export async function validateRepository(rootURL, options = {}) {
```

After parsing each published document, add:

```js
if (options.requireReviewed && parsed[locale].data.status !== "reviewed") {
  errors.push(`${locale}/${relativePath}: status must be reviewed`);
}
if (options.requireReviewed && !parsed[locale].data.reviewed_by) {
  errors.push(`${locale}/${relativePath}: reviewed_by is required`);
}
```

Add CLI flag parsing:

```js
const errors = await validateRepository(new URL("..", import.meta.url), {
  requireReviewed: process.argv.includes("--require-reviewed"),
});
```

- [ ] **Step 3: Promote editorial lint into the main gate**

Set these package scripts:

```json
{
  "lint:gitbook": "node scripts/validate-gitbook-content.mjs --require-reviewed",
  "quality:gitbook": "npm run test:content && npm run test:editorial && npm run lint:gitbook && npm run lint:editorial && npm run lint:mermaid"
}
```

The existing workflow already runs `npm run quality:gitbook`, so no additional GitHub Action step is needed.

- [ ] **Step 4: Run the final editorial gate and inspect the ledger**

```powershell
npm ci
npm run quality:gitbook
rg -n "pending" docs/translation-review/2026-08-22.md
```

Expected: quality gate PASS and `rg` returns no matches.

- [ ] **Step 5: Commit final enforcement**

```powershell
git add scripts/validate-gitbook-content.mjs scripts/gitbook-content.test.mjs package.json package-lock.json .github/workflows/content-quality.yml
git commit -m "ci(i18n): require reviewed bilingual content"
```

## Completion gate

Run:

```powershell
npm ci
npm run quality:gitbook
rg -n "[㐀-鿿]" content/en content/vi
rg -n "Provider private format|Return directly AsyncIterable|Agent lớp học|逆向" content/en content/vi
git status --short
```

Expected:

- All automated checks PASS.
- Both `rg` commands return no matches anywhere in the published EN/VI tree, including headings, tables, code comments and example strings.
- The review ledger contains 23 reviewed rows and no pending cell.
- Every page has been checked through both English and Vietnamese GitBook Preview.
