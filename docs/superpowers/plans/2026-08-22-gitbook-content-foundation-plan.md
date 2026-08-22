# GitBook Content Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tạo cây nội dung GitBook Anh/Việt có Git Sync, manifest ghép cặp và quality gates độc lập, đồng thời giữ nguyên bản Astro hiện tại làm rollback.

**Architecture:** `src/content/docs` tiếp tục phục vụ Astro trong giai đoạn chuyển tiếp. Một migration script có kiểm thử tạo `content/en`, `content/vi` và `source/zh`; hai thư mục xuất bản dùng chung một manifest 23 trang và được kiểm tra bằng Node scripts trước khi Git Sync chạy.

**Tech Stack:** Node.js 24, npm, `node:test`, `gray-matter`, `yaml`, Markdown, GitBook Git Sync, Mermaid CLI, GitHub Actions.

---

## Dependency and boundary

- Thực hiện plan này trong repository `pifydev/docs` trước ba plan còn lại.
- Không xóa Astro, Starlight, `src/content/docs`, workflow GitHub Pages hay deployment hiện tại.
- Không biên tập sâu bản dịch trong plan này; chỉ chuyển đổi định dạng và sửa lỗi cấu trúc bắt buộc.
- GitBook spaces được tạo ở Task 8 sau khi toàn bộ kiểm tra local và CI đã xanh.

## File map

| File | Responsibility |
| --- | --- |
| `content/translation-manifest.json` | Danh sách canonical của 23 cặp trang và nguồn Trung tùy chọn |
| `scripts/lib/gitbook-content.mjs` | Pure functions để đổi path, frontmatter, link và MDX home |
| `scripts/migrate-gitbook-content.mjs` | One-time reproducible migration từ Astro tree sang GitBook tree |
| `scripts/validate-gitbook-content.mjs` | Schema, parity, SUMMARY, link, code-fence và Mermaid checks |
| `scripts/gitbook-content.test.mjs` | Unit tests cho migration và validator |
| `content/en/.gitbook.yaml` | GitBook config của English project directory |
| `content/vi/.gitbook.yaml` | GitBook config của Vietnamese project directory |
| `content/en/SUMMARY.md` | English navigation |
| `content/vi/SUMMARY.md` | Vietnamese navigation |
| `content/en/README.md` | English documentation home |
| `content/vi/README.md` | Vietnamese documentation home |
| `source/zh/**` | Chinese reference, excluded from Git Sync publishing |
| `.github/workflows/content-quality.yml` | PR checks for the target GitBook content tree |

### Task 1: Add the canonical translation manifest

**Files:**
- Create: `content/translation-manifest.json`
- Create: `scripts/gitbook-content.test.mjs`

- [ ] **Step 1: Write the failing manifest test**

Create `scripts/gitbook-content.test.mjs`:

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const manifestURL = new URL("../content/translation-manifest.json", import.meta.url);

test("translation manifest contains 23 unique EN/VI pairs", async () => {
  const manifest = JSON.parse(await readFile(manifestURL, "utf8"));
  assert.equal(manifest.version, 1);
  assert.equal(manifest.pages.length, 23);
  assert.equal(new Set(manifest.pages.map((page) => page.key)).size, 23);
  assert.equal(new Set(manifest.pages.map((page) => page.en)).size, 23);
  assert.equal(new Set(manifest.pages.map((page) => page.vi)).size, 23);
  for (const page of manifest.pages) {
    assert.match(page.key, /^[a-z0-9][a-z0-9-]*$/);
    assert.ok(page.en.endsWith(".md"));
    assert.ok(page.vi.endsWith(".md"));
    assert.equal(page.en, page.vi);
  }
});

test("Chinese references are limited to home and chapters 1 through 10", async () => {
  const manifest = JSON.parse(await readFile(manifestURL, "utf8"));
  const chinese = manifest.pages.filter((page) => page.zh).map((page) => page.key);
  assert.deepEqual(chinese, [
    "home",
    "ch01-overview",
    "ch02-three-layer-arch",
    "ch03-agent-loop",
    "ch04-model-invocation",
    "ch05-tool-system",
    "ch06-messages",
    "ch07-event-driven",
    "ch08-context-engineering",
    "ch09-compaction",
    "ch10-session",
  ]);
});
```

- [ ] **Step 2: Run the test and verify the expected failure**

Run:

```powershell
node --test scripts/gitbook-content.test.mjs
```

Expected: FAIL with `ENOENT` for `content/translation-manifest.json`.

- [ ] **Step 3: Add the complete manifest**

Create `content/translation-manifest.json`:

```json
{
  "version": 1,
  "pages": [
    { "key": "home", "group": "start", "en": "README.md", "vi": "README.md", "zh": "README.md" },
    { "key": "quickstart", "group": "start", "en": "quickstart.md", "vi": "quickstart.md" },
    { "key": "glossary", "group": "start", "en": "glossary.md", "vi": "glossary.md" },
    { "key": "how-to-add-custom-tool", "group": "how-to", "en": "how-to/add-custom-tool.md", "vi": "how-to/add-custom-tool.md" },
    { "key": "how-to-plug-new-model", "group": "how-to", "en": "how-to/plug-new-model.md", "vi": "how-to/plug-new-model.md" },
    { "key": "how-to-stream-output", "group": "how-to", "en": "how-to/stream-output.md", "vi": "how-to/stream-output.md" },
    { "key": "how-to-persist-sessions", "group": "how-to", "en": "how-to/persist-sessions.md", "vi": "how-to/persist-sessions.md" },
    { "key": "how-to-customize-system-prompt", "group": "how-to", "en": "how-to/customize-system-prompt.md", "vi": "how-to/customize-system-prompt.md" },
    { "key": "reference-api", "group": "reference", "en": "reference/api.md", "vi": "reference/api.md" },
    { "key": "reference-configuration", "group": "reference", "en": "reference/configuration.md", "vi": "reference/configuration.md" },
    { "key": "reference-environment-variables", "group": "reference", "en": "reference/environment-variables.md", "vi": "reference/environment-variables.md" },
    { "key": "ch01-overview", "group": "chapters", "en": "ch01-overview.md", "vi": "ch01-overview.md", "zh": "ch01-overview.md" },
    { "key": "ch02-three-layer-arch", "group": "chapters", "en": "ch02-three-layer-arch.md", "vi": "ch02-three-layer-arch.md", "zh": "ch02-three-layer-arch.md" },
    { "key": "ch03-agent-loop", "group": "chapters", "en": "ch03-agent-loop.md", "vi": "ch03-agent-loop.md", "zh": "ch03-agent-loop.md" },
    { "key": "ch04-model-invocation", "group": "chapters", "en": "ch04-model-invocation.md", "vi": "ch04-model-invocation.md", "zh": "ch04-model-invocation.md" },
    { "key": "ch05-tool-system", "group": "chapters", "en": "ch05-tool-system.md", "vi": "ch05-tool-system.md", "zh": "ch05-tool-system.md" },
    { "key": "ch06-messages", "group": "chapters", "en": "ch06-messages.md", "vi": "ch06-messages.md", "zh": "ch06-messages.md" },
    { "key": "ch07-event-driven", "group": "chapters", "en": "ch07-event-driven.md", "vi": "ch07-event-driven.md", "zh": "ch07-event-driven.md" },
    { "key": "ch08-context-engineering", "group": "chapters", "en": "ch08-context-engineering.md", "vi": "ch08-context-engineering.md", "zh": "ch08-context-engineering.md" },
    { "key": "ch09-compaction", "group": "chapters", "en": "ch09-compaction.md", "vi": "ch09-compaction.md", "zh": "ch09-compaction.md" },
    { "key": "ch10-session", "group": "chapters", "en": "ch10-session.md", "vi": "ch10-session.md", "zh": "ch10-session.md" },
    { "key": "faq", "group": "help", "en": "help/faq.md", "vi": "help/faq.md" },
    { "key": "changelog", "group": "help", "en": "changelog.md", "vi": "changelog.md" }
  ]
}
```

- [ ] **Step 4: Run the manifest tests**

Run:

```powershell
node --test scripts/gitbook-content.test.mjs
```

Expected: 2 tests PASS.

- [ ] **Step 5: Commit the manifest contract**

```powershell
git add content/translation-manifest.json scripts/gitbook-content.test.mjs
git commit -m "test(content): define bilingual page manifest"
```

### Task 2: Implement pure migration transforms

**Files:**
- Create: `scripts/lib/gitbook-content.mjs`
- Modify: `scripts/gitbook-content.test.mjs`

- [ ] **Step 1: Add failing tests for path, MDX and link conversion**

Append to `scripts/gitbook-content.test.mjs`:

```js
import {
  mapSourcePath,
  normalizeDocument,
  rewriteLocaleLinks,
} from "./lib/gitbook-content.mjs";

test("index MDX becomes GitBook README", () => {
  assert.equal(mapSourcePath("index.mdx"), "README.md");
  assert.equal(mapSourcePath("how-to/add-custom-tool.md"), "how-to/add-custom-tool.md");
});

test("locale-root links become relative Markdown links", () => {
  const input = "Read [Quickstart](/en/quickstart/) and [API](/en/reference/api/).";
  assert.equal(
    rewriteLocaleLinks(input, "en", "how-to/add-custom-tool.md"),
    "Read [Quickstart](../quickstart.md) and [API](../reference/api.md).",
  );
});

test("home MDX becomes GitBook Markdown with stable metadata", () => {
  const input = `---
title: Pify Agent Book
description: English docs
template: splash
---

import Hero from "../../../components/Hero.astro";
import Callout from "../../../components/Callout.astro";

<Hero lang="en" />

<Callout type="tip">
Start with [Quickstart](/en/quickstart/).
</Callout>
`;
  const output = normalizeDocument(input, {
    locale: "en",
    key: "home",
    sourceRelativePath: "index.mdx",
    targetRelativePath: "README.md",
  });
  assert.match(output, /translation_key: home/);
  assert.match(output, /language: en/);
  assert.doesNotMatch(output, /template: splash/);
  assert.doesNotMatch(output, /import Hero/);
  assert.doesNotMatch(output, /<Hero/);
  assert.match(output, /\{% hint style="info" %\}/);
  assert.match(output, /\[Quickstart\]\(quickstart\.md\)/);
  assert.match(output, /\{% endhint %\}/);
});
```

- [ ] **Step 2: Run the focused tests**

Run:

```powershell
node --test --test-name-pattern="index MDX|locale-root|home MDX" scripts/gitbook-content.test.mjs
```

Expected: FAIL because `scripts/lib/gitbook-content.mjs` does not exist.

- [ ] **Step 3: Implement the transforms**

Create `scripts/lib/gitbook-content.mjs`:

```js
import path from "node:path";
import matter from "gray-matter";

const KEPT_FRONTMATTER = [
  "title",
  "description",
  "chapter",
  "source_url",
  "official_refs",
  "terms_used",
  "status",
  "last_updated",
  "translator",
  "reviewed_by",
  "code_blocks",
  "code_lines",
  "mermaid_blocks",
];

export function mapSourcePath(relativePath) {
  return relativePath === "index.mdx" ? "README.md" : relativePath.replace(/\\/g, "/");
}

function targetForLocaleURL(pathname) {
  const clean = pathname.replace(/^\/+|\/+$/g, "");
  return clean.length === 0 ? "README.md" : `${clean}.md`;
}

function relativeMarkdownHref(fromFile, targetFile) {
  const relative = path.posix.relative(path.posix.dirname(fromFile), targetFile);
  return relative.startsWith(".") ? relative : relative || "README.md";
}

export function rewriteLocaleLinks(markdown, locale, targetRelativePath) {
  const pattern = new RegExp(`\\]\\(\\/${locale}(?:\\/([^?#)]*))?\\/?([?#][^)]*)?\\)`, "g");
  return markdown.replace(pattern, (_match, pathname = "", suffix = "") => {
    const target = targetForLocaleURL(pathname);
    return `](${relativeMarkdownHref(targetRelativePath, target)}${suffix})`;
  });
}

function removeHomeComponents(content) {
  return content
    .replace(/^import\s+.+?;\s*$/gm, "")
    .replace(/^<Hero\s+[^>]*\/>\s*$/gm, "")
    .replace(/<Callout\s+type="tip">/g, "{% hint style=\"info\" %}")
    .replace(/<\/Callout>/g, "{% endhint %}")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function normalizeDocument(source, options) {
  const { locale, key, sourceRelativePath, targetRelativePath } = options;
  const parsed = matter(source);
  const metadata = {
    title: parsed.data.title,
    ...(parsed.data.description ? { description: parsed.data.description } : {}),
    translation_key: key,
    language: locale,
  };
  for (const field of KEPT_FRONTMATTER) {
    if (field !== "title" && field !== "description" && parsed.data[field] !== undefined) {
      metadata[field] = parsed.data[field];
    }
  }

  const withoutComponents = sourceRelativePath === "index.mdx"
    ? removeHomeComponents(parsed.content)
    : parsed.content.trim();
  const content = rewriteLocaleLinks(withoutComponents, locale, targetRelativePath);
  return matter.stringify(`${content}\n`, metadata);
}
```

- [ ] **Step 4: Run all transform tests**

Run:

```powershell
node --test scripts/gitbook-content.test.mjs
```

Expected: 5 tests PASS.

- [ ] **Step 5: Commit the transform module**

```powershell
git add scripts/lib/gitbook-content.mjs scripts/gitbook-content.test.mjs
git commit -m "feat(content): add GitBook migration transforms"
```

### Task 3: Add and run the reproducible migration

**Files:**
- Create: `scripts/migrate-gitbook-content.mjs`
- Create: `content/en/**`
- Create: `content/vi/**`
- Create: `source/zh/**`

- [ ] **Step 1: Write the migration runner**

Create `scripts/migrate-gitbook-content.mjs`:

```js
#!/usr/bin/env node
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mapSourcePath, normalizeDocument } from "./lib/gitbook-content.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(
  await readFile(path.join(repositoryRoot, "content/translation-manifest.json"), "utf8"),
);
const force = process.argv.includes("--force");

async function writeTarget(target, content) {
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, content, { encoding: "utf8", flag: force ? "w" : "wx" });
}

for (const locale of ["en", "vi"]) {
  for (const page of manifest.pages) {
    const targetRelativePath = page[locale];
    const sourceRelativePath = targetRelativePath === "README.md" ? "index.mdx" : targetRelativePath;
    const sourcePath = path.join(repositoryRoot, "src/content/docs", locale, sourceRelativePath);
    const targetPath = path.join(repositoryRoot, "content", locale, targetRelativePath);
    const source = await readFile(sourcePath, "utf8");
    const normalized = normalizeDocument(source, {
      locale,
      key: page.key,
      sourceRelativePath,
      targetRelativePath: mapSourcePath(sourceRelativePath),
    });
    await writeTarget(targetPath, normalized);
  }
}

for (const page of manifest.pages.filter((entry) => entry.zh)) {
  const sourceRelativePath = page.zh === "README.md" ? "index.mdx" : page.zh;
  const sourcePath = path.join(repositoryRoot, "src/content/docs/zh", sourceRelativePath);
  const targetPath = path.join(repositoryRoot, "source/zh", page.zh);
  if (sourceRelativePath === "index.mdx") {
    const source = await readFile(sourcePath, "utf8");
    await writeTarget(
      targetPath,
      normalizeDocument(source, {
        locale: "zh",
        key: page.key,
        sourceRelativePath,
        targetRelativePath: page.zh,
      }),
    );
  } else {
    await mkdir(path.dirname(targetPath), { recursive: true });
    await cp(sourcePath, targetPath, { errorOnExist: !force, force });
  }
}

console.log("Migrated 23 English pages, 23 Vietnamese pages, and 11 Chinese references.");
```

- [ ] **Step 2: Run migration without force**

Run:

```powershell
node scripts/migrate-gitbook-content.mjs
```

Expected: `Migrated 23 English pages, 23 Vietnamese pages, and 11 Chinese references.`

- [ ] **Step 3: Verify inventory and absence of Astro components**

Run:

```powershell
$en = @(rg --files content/en | rg "\.md$")
$vi = @(rg --files content/vi | rg "\.md$")
$zh = @(rg --files source/zh | rg "\.md$")
"en=$($en.Count) vi=$($vi.Count) zh=$($zh.Count)"
rg -n "\.astro|<Hero|<Callout|/en/|/vi/" content/en content/vi
```

Expected: `en=23 vi=23 zh=11`; the second command returns no matches.

- [ ] **Step 4: Prove the runner refuses accidental overwrite**

Run:

```powershell
node scripts/migrate-gitbook-content.mjs
```

Expected: FAIL with `EEXIST`; do not run with `--force` after editorial work begins.

- [ ] **Step 5: Commit the migrated tree**

```powershell
git add scripts/migrate-gitbook-content.mjs content/en content/vi source/zh
git commit -m "feat(content): create GitBook source trees"
```

### Task 4: Add GitBook navigation and project configuration

**Files:**
- Create: `content/en/.gitbook.yaml`
- Create: `content/vi/.gitbook.yaml`
- Create: `content/en/SUMMARY.md`
- Create: `content/vi/SUMMARY.md`

- [ ] **Step 1: Add both GitBook configurations**

Create the same content in `content/en/.gitbook.yaml` and `content/vi/.gitbook.yaml`:

```yaml
root: ./
structure:
  readme: README.md
  summary: SUMMARY.md
```

- [ ] **Step 2: Add the complete English navigation**

Create `content/en/SUMMARY.md`:

```markdown
# Table of contents

## Start here

* [Pify Agent Book](README.md)
* [Quickstart](quickstart.md)
* [Glossary](glossary.md)

## How-to guides

* [Add a custom tool](how-to/add-custom-tool.md)
* [Plug in a new model](how-to/plug-new-model.md)
* [Stream output](how-to/stream-output.md)
* [Persist sessions](how-to/persist-sessions.md)
* [Customize the system prompt](how-to/customize-system-prompt.md)

## Reference

* [API](reference/api.md)
* [Configuration](reference/configuration.md)
* [Environment variables](reference/environment-variables.md)

## Chapters

* [1. Introduction](ch01-overview.md)
* [2. Three-Layer Architecture](ch02-three-layer-arch.md)
* [3. Agent Loop](ch03-agent-loop.md)
* [4. Model Invocation](ch04-model-invocation.md)
* [5. Tool System](ch05-tool-system.md)
* [6. Message System](ch06-messages.md)
* [7. Event-Driven Architecture](ch07-event-driven.md)
* [8. Context Engineering](ch08-context-engineering.md)
* [9. Context Compaction](ch09-compaction.md)
* [10. Session Management](ch10-session.md)

## Help

* [FAQ](help/faq.md)
* [Changelog](changelog.md)
```

- [ ] **Step 3: Add the complete Vietnamese navigation**

Create `content/vi/SUMMARY.md`:

```markdown
# Mục lục

## Bắt đầu

* [Pify Agent Book](README.md)
* [Bắt đầu nhanh](quickstart.md)
* [Thuật ngữ](glossary.md)

## Hướng dẫn

* [Thêm Tool tùy chỉnh](how-to/add-custom-tool.md)
* [Tích hợp model mới](how-to/plug-new-model.md)
* [Truyền phát đầu ra](how-to/stream-output.md)
* [Lưu Session](how-to/persist-sessions.md)
* [Tùy chỉnh system prompt](how-to/customize-system-prompt.md)

## Tham khảo

* [API](reference/api.md)
* [Cấu hình](reference/configuration.md)
* [Biến môi trường](reference/environment-variables.md)

## Các chương

* [1. Mở đầu](ch01-overview.md)
* [2. Kiến trúc ba lớp](ch02-three-layer-arch.md)
* [3. Agent Loop](ch03-agent-loop.md)
* [4. Gọi model](ch04-model-invocation.md)
* [5. Hệ thống Tool](ch05-tool-system.md)
* [6. Hệ thống Message](ch06-messages.md)
* [7. Kiến trúc hướng sự kiện](ch07-event-driven.md)
* [8. Context Engineering](ch08-context-engineering.md)
* [9. Nén ngữ cảnh](ch09-compaction.md)
* [10. Quản lý Session](ch10-session.md)

## Hỗ trợ

* [Câu hỏi thường gặp](help/faq.md)
* [Nhật ký thay đổi](changelog.md)
```

- [ ] **Step 4: Commit GitBook configuration**

```powershell
git add content/en/.gitbook.yaml content/vi/.gitbook.yaml content/en/SUMMARY.md content/vi/SUMMARY.md
git commit -m "feat(content): configure bilingual GitBook navigation"
```

### Task 5: Add structural and local-link validation

**Files:**
- Create: `scripts/validate-gitbook-content.mjs`
- Modify: `scripts/gitbook-content.test.mjs`
- Modify: `package.json`

- [ ] **Step 1: Add a failing integration test**

Append to `scripts/gitbook-content.test.mjs`:

```js
import { validateRepository } from "./validate-gitbook-content.mjs";

test("migrated repository satisfies the GitBook content contract", async () => {
  const errors = await validateRepository(new URL("..", import.meta.url));
  assert.deepEqual(errors, []);
});
```

- [ ] **Step 2: Run the integration test**

Run:

```powershell
node --test --test-name-pattern="content contract" scripts/gitbook-content.test.mjs
```

Expected: FAIL because `scripts/validate-gitbook-content.mjs` does not exist.

- [ ] **Step 3: Implement the validator**

Create `scripts/validate-gitbook-content.mjs`:

```js
#!/usr/bin/env node
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import matter from "gray-matter";
import YAML from "yaml";

function fences(content) {
  return [...content.matchAll(/^```([^\s]*)[^\n]*\n[\s\S]*?^```\s*$/gm)].map((match) => match[1]);
}

function headingShape(content) {
  return [...content.matchAll(/^(#{1,6})\s+.+$/gm)].map((match) => match[1].length);
}

function localMarkdownLinks(content) {
  return [...content.matchAll(/\[[^\]]*\]\((?!https?:|mailto:|#)([^)#?]+)(?:[?#][^)]*)?\)/g)]
    .map((match) => decodeURIComponent(match[1]));
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function validateRepository(rootURL) {
  const root = fileURLToPath(rootURL);
  const errors = [];
  const manifest = JSON.parse(await readFile(path.join(root, "content/translation-manifest.json"), "utf8"));

  for (const locale of ["en", "vi"]) {
    const configPath = path.join(root, "content", locale, ".gitbook.yaml");
    const config = YAML.parse(await readFile(configPath, "utf8"));
    if (config.root !== "./") errors.push(`${locale}: .gitbook.yaml root must be ./`);
    if (config.structure?.readme !== "README.md") errors.push(`${locale}: readme must be README.md`);
    if (config.structure?.summary !== "SUMMARY.md") errors.push(`${locale}: summary must be SUMMARY.md`);
  }

  for (const page of manifest.pages) {
    const parsed = {};
    for (const locale of ["en", "vi"]) {
      const relativePath = page[locale];
      const filePath = path.join(root, "content", locale, relativePath);
      if (!(await exists(filePath))) {
        errors.push(`${locale}/${relativePath}: missing file`);
        continue;
      }
      parsed[locale] = matter(await readFile(filePath, "utf8"));
      if (parsed[locale].data.translation_key !== page.key) {
        errors.push(`${locale}/${relativePath}: translation_key must be ${page.key}`);
      }
      if (parsed[locale].data.language !== locale) {
        errors.push(`${locale}/${relativePath}: language must be ${locale}`);
      }
      if (!parsed[locale].data.title) errors.push(`${locale}/${relativePath}: title is required`);

      for (const href of localMarkdownLinks(parsed[locale].content)) {
        const linkedPath = path.resolve(path.dirname(filePath), href);
        if (!(await exists(linkedPath))) errors.push(`${locale}/${relativePath}: broken link ${href}`);
      }
    }

    if (parsed.en && parsed.vi) {
      const enFences = fences(parsed.en.content);
      const viFences = fences(parsed.vi.content);
      if (JSON.stringify(enFences) !== JSON.stringify(viFences)) {
        errors.push(`${page.key}: code-fence languages differ EN=${JSON.stringify(enFences)} VI=${JSON.stringify(viFences)}`);
      }
      const enHeadings = headingShape(parsed.en.content);
      const viHeadings = headingShape(parsed.vi.content);
      if (JSON.stringify(enHeadings) !== JSON.stringify(viHeadings)) {
        errors.push(`${page.key}: heading structure differs EN=${JSON.stringify(enHeadings)} VI=${JSON.stringify(viHeadings)}`);
      }
    }
  }

  for (const locale of ["en", "vi"]) {
    const summary = await readFile(path.join(root, "content", locale, "SUMMARY.md"), "utf8");
    const linked = localMarkdownLinks(summary);
    const expected = manifest.pages.map((page) => page[locale]);
    if (JSON.stringify(linked) !== JSON.stringify(expected)) {
      errors.push(`${locale}: SUMMARY order does not match translation-manifest.json`);
    }
  }

  return errors;
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (invokedPath === import.meta.url) {
  const errors = await validateRepository(new URL("..", import.meta.url));
  if (errors.length > 0) {
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }
  console.log("GitBook content validation passed: 23 EN/VI page pairs.");
}
```

- [ ] **Step 4: Add package scripts**

Add these keys to `package.json` under `scripts` without removing the Astro commands:

```json
{
  "test:content": "node --test scripts/gitbook-content.test.mjs",
  "lint:gitbook": "node scripts/validate-gitbook-content.mjs",
  "quality:gitbook": "npm run test:content && npm run lint:gitbook && npm run lint:mermaid"
}
```

- [ ] **Step 5: Run the complete content gate**

Run:

```powershell
npm run quality:gitbook
```

Expected: tests PASS, `GitBook content validation passed: 23 EN/VI page pairs.`, and Mermaid validation PASS.

- [ ] **Step 6: Commit the target validator**

```powershell
git add scripts/validate-gitbook-content.mjs scripts/gitbook-content.test.mjs package.json package-lock.json
git commit -m "feat(content): validate GitBook page parity"
```

### Task 6: Repair shared validation checks without changing production output

**Files:**
- Modify: `scripts/sync-check.mjs`
- Modify: `scripts/validate-frontmatter.mjs`
- Modify: `scripts/sync-check.test.mjs`
- Modify: `scripts/validate-frontmatter.test.mjs`
- Modify: `scripts/lib/gitbook-content.mjs`
- Modify: `scripts/gitbook-content.test.mjs`
- Modify: `scripts/validate-mermaid.mjs`
- Modify: `package.json`

- [ ] **Step 1: Add regression tests for the two audit findings**

In the existing test files, add fixtures asserting:

```js
assert.equal(/^ch\d{2}-[a-z0-9-]+\.md$/.test("changelog.md"), false);
assert.equal(/^ch\d{2}-[a-z0-9-]+\.md$/.test("ch01-overview.md"), true);
assert.deepEqual(compareOptionalTermSets({ en: ["Agent"], vi: ["Agent"] }), []);
assert.deepEqual(compareOptionalTermSets({ zh: undefined, en: ["Agent"], vi: ["Agent"] }), []);
```

Export `compareOptionalTermSets` from `scripts/sync-check.mjs` for the regression test.

Append this target-tree regression to `scripts/gitbook-content.test.mjs`:

```js
import { extractMermaidBlocks } from "./lib/gitbook-content.mjs";

test("Mermaid extraction covers blocks outside numbered chapters", () => {
  const markdown = "# Guide\n\n```mermaid\ngraph TD\n  A --> B\n```\n";
  assert.deepEqual(extractMermaidBlocks(markdown), ["graph TD\n  A --> B"]);
});
```

- [ ] **Step 2: Run the focused regression tests**

Run:

```powershell
node --test scripts/sync-check.test.mjs scripts/validate-frontmatter.test.mjs scripts/gitbook-content.test.mjs
```

Expected: the new assertions FAIL against the current filename filter, unexported helper or missing Mermaid extractor.

- [ ] **Step 3: Anchor numbered-chapter discovery and compare only defined term sets**

Use this constant in both scripts:

```js
const CHAPTER_FILE = /^ch\d{2}-[a-z0-9-]+\.md$/;
```

Replace every `startsWith("ch") && endsWith(".md")` filter with:

```js
files.filter((file) => CHAPTER_FILE.test(file));
```

Implement and call:

```js
export function compareOptionalTermSets(termSets) {
  const defined = Object.entries(termSets).filter(([, value]) => Array.isArray(value));
  if (defined.length < 2) return [];
  const [baseLanguage, baseTerms] = defined[0];
  const expected = [...baseTerms].sort();
  const errors = [];
  for (const [language, terms] of defined.slice(1)) {
    const actual = [...terms].sort();
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      errors.push(`terms_used differs (${baseLanguage} vs ${language})`);
    }
  }
  return errors;
}
```

- [ ] **Step 4: Validate Mermaid in every target page**

Add this pure helper to `scripts/lib/gitbook-content.mjs`:

```js
export function extractMermaidBlocks(markdown) {
  return [...markdown.matchAll(/^```mermaid\s*\r?\n([\s\S]*?)\r?\n```\s*$/gm)]
    .map((match) => match[1]);
}
```

In `scripts/validate-mermaid.mjs`, remove `readdir` and the root-only numbered-chapter loop. Import `extractMermaidBlocks`, read `content/translation-manifest.json`, and use this complete discovery loop while retaining the existing temporary-directory, `mmdc`, error collection and cleanup behavior:

```js
const manifest = JSON.parse(await readFile("content/translation-manifest.json", "utf8"));

for (const locale of ["en", "vi"]) {
  for (const page of manifest.pages) {
    const relativePath = page[locale];
    const content = await readFile(join("content", locale, relativePath), "utf8");
    for (const block of extractMermaidBlocks(content)) {
      total++;
      const mmdFile = join(tmpDir, `block-${total}.mmd`);
      const svgFile = join(tmpDir, `block-${total}.svg`);
      await writeFile(mmdFile, block, "utf8");
      const code = await new Promise((resolve) => {
        const proc = spawn("npx", ["mmdc", "-i", mmdFile, "-o", svgFile, "-q"], {
          stdio: "inherit",
        });
        proc.on("close", resolve);
      });
      if (code !== 0) errors.push(`${locale}/${relativePath} block ${total}: mmdc failed`);
    }
  }
}
```

- [ ] **Step 5: Install the missing Astro checker explicitly**

Run:

```powershell
npm install --save-dev @astrojs/check
```

Expected: `package.json` and `package-lock.json` include `@astrojs/check`.

- [ ] **Step 6: Verify the transition baseline**

Run:

```powershell
npm run lint
npm run check
npm run build
```

Expected: lint and check complete non-interactively, Mermaid CLI validates every block discovered across all 46 target pages, and build succeeds. Record the existing duplicate-404 warning for removal during final retirement, but do not delete the route in this plan.

- [ ] **Step 7: Commit validation repairs**

```powershell
git add scripts/sync-check.mjs scripts/validate-frontmatter.mjs scripts/sync-check.test.mjs scripts/validate-frontmatter.test.mjs scripts/lib/gitbook-content.mjs scripts/gitbook-content.test.mjs scripts/validate-mermaid.mjs package.json package-lock.json
git commit -m "fix(ci): repair content validation coverage"
```

### Task 7: Add GitBook content CI

**Files:**
- Create: `.github/workflows/content-quality.yml`

- [ ] **Step 1: Add the workflow**

Create `.github/workflows/content-quality.yml`:

```yaml
name: GitBook Content Quality

on:
  pull_request:
    paths:
      - "content/**"
      - "source/**"
      - "scripts/**"
      - "package.json"
      - "package-lock.json"
      - ".github/workflows/content-quality.yml"
  push:
    branches: [main]
    paths:
      - "content/**"
      - "source/**"
      - "scripts/**"
      - "package.json"
      - "package-lock.json"
      - ".github/workflows/content-quality.yml"
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: gitbook-content-${{ github.ref }}
  cancel-in-progress: true

jobs:
  quality:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npm run quality:gitbook
```

- [ ] **Step 2: Validate workflow syntax and run its local equivalent**

Run:

```powershell
npx --yes action-validator .github/workflows/content-quality.yml
npm ci
npm run quality:gitbook
```

Expected: workflow validation exits 0 and the content gate passes.

- [ ] **Step 3: Commit CI**

```powershell
git add .github/workflows/content-quality.yml
git commit -m "ci(content): gate GitBook source changes"
```

### Task 8: Connect two GitBook spaces

**Files:**
- Modify: `README.md`
- Modify: `CONTRIBUTING.md`

- [ ] **Step 1: Push the content-foundation branch and open a pull request**

Run:

```powershell
git push -u origin HEAD
```

Expected: the GitBook Content Quality and existing Astro checks pass on the pull request.

- [ ] **Step 2: Create the English space**

In GitBook:

1. Create a space named `Pify Docs English` and set its language to English.
2. Enable Git Sync with `pifydev/docs`.
3. Set Project directory to `content/en`.
4. Confirm GitBook reads `content/en/.gitbook.yaml` and `content/en/SUMMARY.md`.
5. Enable the official Mermaid integration for this space.
6. Publish a docs site with visibility `Unlisted`.
7. Record the origin URL in the pull request deployment notes; do not commit it as a secret.

Expected: the origin renders 23 pages and does not expose Vietnamese results in search.

- [ ] **Step 3: Create the Vietnamese space**

Repeat the English procedure with:

- Space name: `Pify Docs Tiếng Việt`
- Language: Vietnamese
- Project directory: `content/vi`
- Visibility: `Unlisted`

Expected: the origin renders 23 pages, uses GitBook's Vietnamese UI translation, and search contains only Vietnamese pages.

- [ ] **Step 4: Verify Mermaid and Git Sync round-trip without editing from GitBook**

For each space:

1. Open chapter 2 and chapter 4 on the published origin.
2. Confirm every Mermaid block renders as a diagram.
3. Confirm code blocks retain syntax labels and copy controls.
4. Confirm Git Sync reports the repository branch as current.
5. Do not edit content in the GitBook editor; repository Markdown remains authoritative.

- [ ] **Step 5: Document the source workflow**

Add this section to `README.md`:

```markdown
## GitBook source directories

- `content/en` is synced to the English GitBook space.
- `content/vi` is synced to the Vietnamese GitBook space.
- `source/zh` is reference material and is not published.
- `src/content/docs` remains the temporary Astro rollback source until the Vercel cutover is accepted.

Run `npm run quality:gitbook` before pushing content changes. Edit Markdown in this repository; do not create divergent edits in the GitBook editor.
```

Add this gate to `CONTRIBUTING.md`:

````markdown
Before requesting review, run:

```powershell
npm ci
npm run quality:gitbook
```

Every published page must keep the same `translation_key` and relative path in `content/en` and `content/vi`.
````

- [ ] **Step 6: Commit workflow documentation**

```powershell
git add README.md CONTRIBUTING.md
git commit -m "docs(content): document bilingual Git Sync workflow"
```

## Completion gate

Run:

```powershell
npm ci
npm run quality:gitbook
npm run lint
npm run check
npm run build
git status --short
```

Expected:

- The GitBook gate reports 23 paired pages.
- Existing Astro validation and build remain green.
- English and Vietnamese unlisted origin URLs both render.
- `git status --short` contains no plan-created uncommitted files.
- User-owned untracked debug files remain untouched.
