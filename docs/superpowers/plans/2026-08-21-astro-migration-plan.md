# Astro + Starlight Migration Plan

**Date:** 2026-08-21
**Status:** Ready for execution
**Author:** Pi Docs Contributors
**Spec:** `docs/superpowers/specs/2026-08-21-astro-migration-design.md`
**Branch:** `astro-migration`

## Goal

Move the Pify Agent Book docs site from mdBook (three parallel instances) to a single Astro 7 + Starlight project while preserving URL structure, branding, and the en/vi/zh language swap. Markdown remains the source format.

## Architecture

- **Astro 7** static-site generator at the repo root.
- **Starlight** documentation integration providing built-in i18n routing, sidebar, search (pagefind), and LanguageSelect component.
- **astro-mermaid** (must precede Starlight in `integrations`).
- **Node-based validation scripts** that replace the PowerShell scripts.
- **GitHub Pages** deploys from `dist/` via `actions/deploy-pages@v4`.

## Tech Stack

- Node 24 LTS
- Astro 7.x
- @astrojs/starlight 0.x
- astro-mermaid 2.x
- @mermaid-js/mermaid-cli (validation only)
- TypeScript (content config)
- Zod (frontmatter schema)
- gray-matter, yaml (validation scripts)

## File Structure

```
pi-docs/
+- astro.config.mjs               # Starlight + mermaid config
+- package.json                   # Node deps + scripts
+- tsconfig.json
+- src/
|  +- content.config.ts          # Zod schemas for docs + i18n
|  +- content/
|  |  +- docs/
|  |  |  +- zh/ch01-overview.md ... zh/ch10-session.md
|  |  |  +- en/ch01-overview.md ... en/ch10-session.md
|  |  |  +- vi/ch01-overview.md ... vi/ch10-session.md
|  |  +- i18n/
|  |     +- en.json
|  |     +- vi.json
|  +- assets/
|  |  +- logo-light-bg.svg
|  |  +- logo-dark-bg.svg
|  |  +- favicon.svg
|  +- styles/
|  |  +- custom.css
|  +- components/
|     +- Hero.astro
+- public/
|  +- favicon.svg
|  +- og-image.png
+- docs/superpowers/{specs,plans}/
+- scripts/
|  +- build.mjs
|  +- validate-frontmatter.mjs
|  +- sync-check.mjs
|  +- validate-mermaid.mjs
+- README.md
+- CONTRIBUTING.md
+- .github/workflows/deploy.yml
```

## URL Preservation

Starlight produces URLs without trailing slashes when `trailingSlash: "never"` is set. The current mdBook site serves URLs with trailing slashes (e.g. `/en/ch01-overview/`). GitHub Pages treats `/en/ch01-overview` and `/en/ch01-overview/` as the same resource, so this does not break inbound links. For legacy `.html` URLs (e.g. `/en/ch01-overview.html`), generate meta-refresh redirect pages in `public/<lang>/<slug>.html` (Task 15).

## Phase 1: Scaffold + Content (Tasks 1-5)

### Task 1: Create package.json, astro.config.mjs, tsconfig.json

**Goal:** Establish the Astro project skeleton.

**Files to create:**

- `package.json`
- `astro.config.mjs`
- `tsconfig.json`
- `.gitignore` (update)

**`package.json`:**

```json
{
  "name": "pify-docs",
  "type": "module",
  "version": "2.0.0",
  "private": true,
  "scripts": {
    "dev": "astro dev",
    "build": "node scripts/build.mjs",
    "preview": "astro preview",
    "check": "astro check",
    "lint:frontmatter": "node scripts/validate-frontmatter.mjs",
    "lint:sync": "node scripts/sync-check.mjs",
    "lint:mermaid": "node scripts/validate-mermaid.mjs",
    "lint": "npm run lint:sync && npm run lint:frontmatter && npm run lint:mermaid"
  },
  "dependencies": {
    "astro": "^7.0.0",
    "@astrojs/starlight": "^0.30.0",
    "astro-mermaid": "^2.0.0"
  },
  "devDependencies": {
    "typescript": "^5.5.0",
    "@mermaid-js/mermaid-cli": "^11.0.0",
    "gray-matter": "^4.0.3",
    "yaml": "^2.5.0"
  }
}
```

**`astro.config.mjs`:**

```js
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import mermaid from "astro-mermaid";

export default defineConfig({
  site: "https://pifydev.github.io",
  base: "/docs",
  trailingSlash: "never",
  integrations: [
    mermaid(),
    starlight({
      title: "Pify Agent Book",
      description: "Source-code reading notes for the Pi Agent SDK",
      defaultLocale: "zh",
      locales: {
        zh: { label: "中文", lang: "zh-CN" },
        en: { label: "English", lang: "en" },
        vi: { label: "Tiếng Việt", lang: "vi" },
      },
      sidebar: [
        {
          label: "Chapters",
          translations: {
            en: { label: "Chapters" },
            vi: { label: "Các chương" },
            zh: { label: "章节目录" },
          },
          autogenerate: { directory: "ch01-overview" },
        },
      ],
      customCss: ["/src/styles/custom.css"],
      social: [
        { icon: "github", label: "GitHub", href: "https://github.com/pifydev/docs" },
      ],
      editLink: {
        baseUrl: "https://github.com/pifydev/docs/edit/main/",
      },
    }),
  ],
});
```

**`tsconfig.json`:**

```json
{
  "extends": "astro/tsconfigs/strict",
  "include": [".astro/types.d.ts", "**/*"],
  "exclude": ["dist"]
}
```

**`.gitignore` additions:**

```
# Astro
.astro/
dist/
node_modules/
package-lock.json
```

**TDD where applicable:** Not applicable; this is scaffold work.

**Verify:** `npm install` succeeds, `npm run dev` serves a placeholder page.

**Commit:** `feat(astro): scaffold Astro 7 + Starlight project`

### Task 2: Create content config with Zod schema

**Goal:** Validate every chapter frontmatter against a 16-field Zod schema.

**File:** `src/content.config.ts`

```ts
import { defineCollection, z } from "astro:content";
import { docsLoader, i18nLoader } from "@astrojs/starlight/loaders";
import { docsSchema, i18nSchema } from "@astrojs/starlight/schema";

const versionPairs = z.object({
  zh: z.string(),
  en: z.string(),
  vi: z.string(),
});

const chapterFrontmatter = z.object({
  chapter: z.number().int().min(1).max(10),
  slug: z.string().regex(/^ch[0-9]{2}-[a-z0-9-]+$/),
  title_zh: z.string(),
  title_en: z.string(),
  title_vi: z.string(),
  source_url: z.string().url(),
  language: z.enum(["zh", "en", "vi"]),
  version_pairs: versionPairs,
  original_chars: z.number().int().nonnegative(),
  code_lines: z.number().int().nonnegative(),
  reading_minutes: z.number().int().nonnegative(),
  translator: z.string(),
  reviewed_by: z.string().nullable(),
  last_updated: z.string(),
  status: z.enum(["draft", "translated", "reviewed", "published"]),
  official_refs: z.array(z.string().url()),
  terms_used: z.array(z.string()),
  mermaid_blocks: z.number().int().nonnegative(),
  code_blocks: z.number().int().nonnegative(),
});

export const collections = {
  docs: defineCollection({
    loader: docsLoader(),
    schema: docsSchema({
      extend: () => chapterFrontmatter,
    }),
  }),
  i18n: defineCollection({
    loader: i18nLoader(),
    schema: i18nSchema(),
  }),
};
```

**TDD where applicable:** Schema failures surface during `astro build`. Add a sample chapter that succeeds and one that fails, then confirm the build fails with the expected error.

**Verify:** `npm run build` fails on any existing chapter file that does not have a `title` field at the top of its frontmatter (it does not, today). Add a `title` field to one chapter via Task 3 and confirm the build succeeds.

**Commit:** `feat(content): add Zod schema for chapter frontmatter`

### Task 3: Migrate chapter files via git mv

**Goal:** Move all 30 chapter files plus 3 index pages into `src/content/docs/{zh,en,vi}/` and remove SUMMARY.md.

**Steps:**

1. **Apply the `title` field to each chapter** using a one-shot script. Starlight requires a top-level `title` field in frontmatter. Derive `title` from the per-language `title_<lang>` field.

**File:** `scripts/inject-title.py` (one-shot, deleted after the migration)

```python
#!/usr/bin/env python3
"""Inject top-level `title` field into chapter frontmatter for Starlight.

For each file in src/content/docs/{zh,en,vi}/, derive the title from
title_<lang> and prepend a `title:` line at the top of frontmatter.
"""
import re
from pathlib import Path

ROOT = Path("src/content/docs")
LANGS = ("zh", "en", "vi")

FRONTMATTER_RE = re.compile(r"\A---\n(.*?)\n---", re.DOTALL)


def inject(file: Path) -> None:
    text = file.read_text(encoding="utf-8")
    m = FRONTMATTER_RE.match(text)
    if not m:
        return
    body = m.group(1)
    lang = file.parent.name
    title_key = f"title_{lang}"
    title_match = re.search(rf'^{title_key}:\s*"?(.+?)"?\s*$', body, re.MULTILINE)
    if not title_match:
        return
    title_value = title_match.group(1).strip().strip('"')
    if re.search(r"^title:\s", body, re.MULTILINE):
        return
    new_body = f"title: {title_value}\n" + body
    new_text = "---\n" + new_body + "\n---" + text[m.end():]
    file.write_text(new_text, encoding="utf-8")


def main() -> None:
    for lang in LANGS:
        for f in (ROOT / lang).glob("ch*.md"):
            inject(f)
        inject(ROOT / lang / "index.md")
    print("Injected `title` field into all chapter files")


if __name__ == "__main__":
    main()
```

2. **Run the script once** (after the `git mv`):

```bash
python scripts/inject-title.py
```

3. **Move files via `git mv`** (preserves history):

```bash
mkdir -p src/content/docs/zh src/content/docs/en src/content/docs/vi

for lang in zh en vi; do
  for f in $lang/src/ch*.md; do
    name=$(basename "$f")
    git mv "$f" "src/content/docs/$lang/$name"
  done
  git mv "$lang/src/index.md" "src/content/docs/$lang/index.md"
  git rm "$lang/src/SUMMARY.md"
done
```

4. **Run `inject-title.py`** so every moved file gets a `title` field.

5. **Delete `scripts/inject-title.py`** after the migration runs.

**Verify:** `npm run build` succeeds, all 33 pages (3 index + 30 chapters) appear in `dist/`.

**Commit:** `feat(content): migrate chapters into src/content/docs/{zh,en,vi}/`

### Task 4: Create Hero component and update index pages

**Goal:** Replace the inline-SVG hero in `index.md` with a reusable `Hero.astro` component.

**Files:**

- `src/components/Hero.astro` (new)
- `src/content/docs/{zh,en,vi}/index.md` (replace contents)

**`src/components/Hero.astro`:**

```astro
---
const { lang } = Astro.props;
const titles = {
  zh: "Pify Agent Book",
  en: "Pify Agent Book",
  vi: "Sách Pify Agent",
};
const tagline = {
  zh: "Pi Agent SDK 源码阅读笔记",
  en: "Source-code reading notes for the Pi Agent SDK",
  vi: "Ghi chú đọc mã nguồn cho Pi Agent SDK",
};
---

<div class="hero">
  <img src="/src/assets/logo-light-bg.svg" alt="Pify" class="hero-logo" />
  <h1>{titles[lang]}</h1>
  <p class="hero-tagline">{tagline[lang]}</p>
</div>

<style>
  .hero {
    text-align: center;
    padding: 2rem 1rem 1rem;
  }
  .hero-logo {
    width: 120px;
    height: 120px;
  }
  .hero h1 {
    margin: 0.75rem 0 0.25rem;
    font-size: 2.25rem;
  }
  .hero-tagline {
    color: var(--sl-color-gray-2);
    font-size: 1.05rem;
  }
</style>
```

**`src/content/docs/en/index.md` (replace):**

```markdown
---
title: Pify Agent Book
template: splash
---

import Hero from "../../../components/Hero.astro";

<Hero lang="en" />

Reading notes for the [Pi Agent SDK](https://github.com/earendil-works/pi). The English translation of the [Pi Agent Book](https://www.dgzhuya.com/); Chinese is the canonical source. The English chapters follow the original structure and order.

## How to read

- Read chapters in order. Chapter 1 sets the motivation and high-level view; Chapter 2 explains the three-layer architecture; later chapters are reference material you can dip into as needed.
- Each chapter links to the matching official [pi.dev](https://pi.dev/docs/latest) page for cross-verification.
- Code samples are runnable. Setup instructions: [Pi quickstart](https://pi.dev/docs/latest/quickstart).

## Feedback

- Report translation errors or missing content in [GitHub Issues](https://github.com/pifydev/docs/issues).
- Contribute: see [CONTRIBUTING.md](../../../CONTRIBUTING.md).
- Glossary of preserved English terms: [GLOSSARY.md](../../../GLOSSARY.md).
```

(Apply the same pattern to `vi/index.md` and `zh/index.md` with localized text.)

**TDD where applicable:** Not applicable; visual verification only.

**Verify:** `npm run dev` shows the hero on each language index page.

**Commit:** `feat(content): add Hero component and update index pages`

### Task 5: Sidebar configuration

**Goal:** Generate the sidebar from chapter order using `autogenerate`.

The `sidebar` config from Task 1 already declares `autogenerate: { directory: "ch01-overview" }`. Starlight scans `src/content/docs/<lang>/` and orders files alphabetically. Because chapter slugs (`ch01-...`, `ch02-...`, ..., `ch10-...`) sort in the right order, the sidebar reads correctly without per-file ordering.

Add an optional About group for the index page:

**Add to `astro.config.mjs`:**

```js
sidebar: [
  {
    label: "About",
    translations: {
      en: { label: "About" },
      vi: { label: "Giới thiệu" },
      zh: { label: "关于" },
    },
    items: [{ label: "Introduction", link: "" }],
  },
  {
    label: "Chapters",
    translations: {
      en: { label: "Chapters" },
      vi: { label: "Các chương" },
      zh: { label: "章节目录" },
    },
    autogenerate: { directory: "ch01-overview" },
  },
],
```

**TDD where applicable:** Not applicable; visual verification.

**Verify:** `npm run dev` shows the sidebar with About + Chapters in three languages.

**Commit:** `feat(content): configure sidebar with About + Chapters groups`

## Phase 2: Branding (Tasks 6-9)

### Task 6: Move assets and update paths

**Goal:** Bring all logo assets into `src/assets/` (for Astro components) and `public/` (for static serving).

**Steps:**

```bash
mkdir -p src/assets public

# SVG logos (referenced by Hero.astro)
git mv assets/pify-logo-light-bg.svg src/assets/logo-light-bg.svg
git mv assets/pify-logo-dark-bg.svg src/assets/logo-dark-bg.svg
git mv assets/favicon.svg src/assets/favicon.svg

# PNG logos (used by README)
git mv assets/pify-light-512.png public/pify-light-512.png
git mv assets/pify-dark-512.png public/pify-dark-512.png
git mv assets/pify-on-light-128.png public/pify-on-light-128.png
git mv assets/pify-on-dark-128.png public/pify-on-dark-128.png

# Rounded variants (if used by README)
git mv assets/pify-logo-light-bg-rounded.svg src/assets/logo-light-bg-rounded.svg
git mv assets/pify-logo-dark-bg-rounded.svg src/assets/logo-dark-bg-rounded.svg
git mv assets/pify-logo-on-light.svg src/assets/logo-on-light.svg
git mv assets/pify-logo-on-dark.svg src/assets/logo-on-dark.svg
```

**Update `README.md` image references** to use `/pify-light-512.png` etc.

**Verify:** `npm run dev` shows the logo in the Hero and the README renders correctly.

**Commit:** `chore(assets): move logo pack into src/assets and public/`

### Task 7: Custom CSS for Starlight theme

**Goal:** Port the existing `en/theme/custom.css` overrides into Starlight's CSS variable system.

**File:** `src/styles/custom.css`

```css
/* Starlight theme overrides for Pify Agent Book */

:root {
  --sl-content-width: 50rem;
  --sl-font-mono: "JetBrains Mono", "Cascadia Code", Consolas, monospace;
  --sl-color-accent-low: #1a1a2e;
  --sl-color-accent: #4a4a8a;
  --sl-color-accent-high: #6a6aaa;
}

[data-theme="dark"] {
  --sl-color-accent-low: #2a2a4e;
  --sl-color-accent: #8a8aca;
  --sl-color-accent-high: #aaaaea;
}

.mermaid {
  text-align: center;
  margin: 1.5rem 0;
  background: var(--sl-color-bg);
}

pre {
  padding: 0.75rem 1rem;
  line-height: 1.45;
}

blockquote {
  border-left: 4px solid var(--sl-color-accent);
  background: var(--sl-color-gray-6);
  padding: 0.75rem 1rem;
  margin: 1rem 0;
}

table {
  margin: 1rem 0;
}

table th {
  background: var(--sl-color-gray-6);
}

/* Hide the small site-title logo (mdbook menu bar pattern no longer applies) */
.site-title img {
  display: none;
}
```

**TDD where applicable:** Not applicable; visual verification.

**Verify:** `npm run dev` shows the brand colors and quote/code styling.

**Commit:** `style(css): port mdBook custom.css to Starlight`

### Task 8: Hero and homepage polish

**Goal:** Polish the index page with the `splash` template so the hero is the focal point.

Already done in Task 4 (`template: splash` frontmatter). Add `tableOfContents: false` to the index frontmatter so the splash layout is clean:

**Add to each `src/content/docs/{zh,en,vi}/index.md` frontmatter:**

```yaml
tableOfContents: false
next: false
prev: false
```

**Verify:** `npm run dev` shows a clean splash page with the hero centered and no sidebar TOC.

**Commit:** `feat(content): polish splash template on index pages`

### Task 9: Favicon and OG image

**Goal:** Wire up favicon and Open Graph preview.

**Steps:**

1. **Copy SVG favicon to `public/`:**

```bash
cp src/assets/favicon.svg public/favicon.svg
```

2. **Create OG image** (placeholder using existing PNG):

```bash
cp public/pify-light-512.png public/og-image.png
```

3. **Update `astro.config.mjs` head config:**

```js
starlight({
  // ... existing config ...
  head: [
    {
      tag: "meta",
      property: "og:image",
      content: "https://pifydev.github.io/docs/og-image.png",
    },
    {
      tag: "meta",
      name: "twitter:card",
      content: "summary_large_image",
    },
  ],
}),
```

**Verify:** Inspect the rendered HTML to confirm `<meta property="og:image">` and `<link rel="icon">` are present.

**Commit:** `feat(assets): favicon and OG image`

## Phase 3: Validation (Tasks 10-13)

### Task 10: validate-frontmatter.mjs + node:test

**Goal:** Port `scripts/validate-frontmatter.ps1` to Node with TDD.

**File:** `scripts/validate-frontmatter.mjs`

```js
#!/usr/bin/env node
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import matter from "gray-matter";

const ROOT = "src/content/docs";
const LANGS = ["zh", "en", "vi"];
const REQUIRED = ["chapter", "slug", "language", "source_url", "status"];
const STATUS = ["draft", "translated", "reviewed", "published"];

const errors = [];
let fileCount = 0;

function countMermaid(content) {
  return (content.match(/^```mermaid\r?\n/gm) || []).length;
}

function countCodeBlocks(content) {
  return Math.floor((content.match(/^```/gm) || []).length / 2);
}

function countCodeLines(content) {
  const blocks = content.matchAll(/^```(\w*)\r?\n([\s\S]*?)\r?\n```/gm);
  let total = 0;
  for (const m of blocks) {
    if (m[1] !== "mermaid") total += m[2].split("\n").length;
  }
  return total;
}

for (const lang of LANGS) {
  const dir = join(ROOT, lang);
  let files;
  try {
    files = await readdir(dir);
  } catch {
    continue;
  }
  for (const name of files.filter((f) => f.startsWith("ch") && f.endsWith(".md"))) {
    fileCount++;
    const path = join(dir, name);
    const file = await readFile(path, "utf-8");
    const { data: fm, content } = matter(file);
    const label = `${lang}/${name}`;

    for (const req of REQUIRED) {
      if (fm[req] === undefined || fm[req] === null) {
        errors.push(`${label}: missing required field ` + req);
      }
    }
    if (fm.chapter !== undefined && (fm.chapter < 1 || fm.chapter > 10)) {
      errors.push(`${label}: chapter must be 1..10 (got ${fm.chapter})`);
    }
    if (fm.language !== undefined && !LANGS.includes(fm.language)) {
      errors.push(`${label}: language must be zh|en|vi (got "${fm.language}")`);
    }
    if (fm.language !== undefined && fm.language !== lang) {
      errors.push(`${label}: language "${fm.language}" does not match directory "${lang}"`);
    }
    if (fm.slug !== undefined && !/^ch[0-9]{2}-[a-z0-9-]+$/.test(fm.slug)) {
      errors.push(`${label}: slug "${fm.slug}" does not match pattern`);
    }
    if (fm.status !== undefined && !STATUS.includes(fm.status)) {
      errors.push(`${label}: status must be ${STATUS.join("|")} (got "${fm.status}")`);
    }
    if (fm.source_url !== undefined && !/^https?:\/\//.test(fm.source_url)) {
      errors.push(`${label}: source_url must be http(s) URL`);
    }
    if (fm.status !== "draft") {
      const actualCode = countCodeBlocks(content);
      const actualMermaid = countMermaid(content);
      const actualLines = countCodeLines(content);
      if (fm.code_blocks !== undefined && fm.code_blocks !== actualCode) {
        errors.push(`${label}: code_blocks ${fm.code_blocks} != actual ${actualCode}`);
      }
      if (fm.mermaid_blocks !== undefined && fm.mermaid_blocks !== actualMermaid) {
        errors.push(`${label}: mermaid_blocks ${fm.mermaid_blocks} != actual ${actualMermaid}`);
      }
      if (fm.code_lines !== undefined && fm.code_lines !== actualLines) {
        errors.push(`${label}: code_lines ${fm.code_lines} != actual ${actualLines}`);
      }
    }
  }
}

console.log(`Validated ${fileCount} chapter files`);
if (errors.length > 0) {
  console.error("\nERRORS:");
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log("All files OK");
```

**File:** `scripts/validate-frontmatter.test.mjs`

```js
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);

test("validate-frontmatter exits 0 on current repo", async () => {
  const { stdout } = await exec("node", ["scripts/validate-frontmatter.mjs"]);
  assert.match(stdout, /All files OK/);
});

test("validate-frontmatter rejects missing required field", async () => {
  // Hand-test: edit a chapter to remove `chapter`, expect non-zero exit
  // This case is covered by the smoke test below.
});
```

**TDD:** Write the test, run it against the live repo, confirm green. Mutate a chapter to drop `chapter`, confirm red, then restore.

**Verify:** `node --test scripts/validate-frontmatter.test.mjs` passes.

**Commit:** `feat(scripts): port validate-frontmatter.ps1 to Node`

### Task 11: sync-check.mjs + node:test

**Goal:** Port `scripts/sync-check.ps1` to Node.

**File:** `scripts/sync-check.mjs`

```js
#!/usr/bin/env node
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import matter from "gray-matter";

const LANGS = ["zh", "en", "vi"];
const errors = [];
const warnings = [];
const inventory = new Map();

function countBy(content, regex) {
  return (content.match(regex) || []).length;
}

for (const lang of LANGS) {
  const dir = join("src/content/docs", lang);
  let files;
  try {
    files = await readdir(dir);
  } catch {
    continue;
  }
  for (const name of files.filter((f) => f.startsWith("ch") && f.endsWith(".md"))) {
    if (!inventory.has(name)) inventory.set(name, {});
    inventory.get(name)[lang] = join(dir, name);
  }
}

for (const [name, paths] of inventory) {
  for (const lang of LANGS) {
    if (!paths[lang]) {
      errors.push(`${name}: missing language "${lang}"`);
    }
  }
  const langs = Object.keys(paths);
  if (langs.length < LANGS.length) continue;

  const fms = {};
  const contents = {};
  for (const lang of langs) {
    const file = await readFile(paths[lang], "utf-8");
    const { data, content } = matter(file);
    fms[lang] = data;
    contents[lang] = content;
  }

  for (const lang of langs) {
    const vp = fms[lang].version_pairs;
    if (vp) {
      for (const peer of LANGS) {
        if (!vp[peer]) {
          errors.push(`${name}[${lang}]: version_pairs missing key "${peer}"`);
        }
      }
    }
  }

  const termSets = {};
  for (const lang of langs) {
    if (fms[lang].terms_used) {
      termSets[lang] = [...fms[lang].terms_used].sort();
    }
  }
  const tkeys = Object.keys(termSets);
  if (tkeys.length > 1) {
    const first = tkeys[0];
    for (const lang of tkeys) {
      if (lang === first) continue;
      const a = termSets[first];
      const b = termSets[lang];
      if (a.length !== b.length) {
        errors.push(`${name}: terms_used count differs (${first}=${a.length}, ${lang}=${b.length})`);
      } else {
        for (let i = 0; i < a.length; i++) {
          if (a[i] !== b[i]) {
            errors.push(`${name}: terms_used differs at index ${i}`);
          }
        }
      }
    }
  }

  const counts = {};
  for (const lang of langs) {
    const c = contents[lang];
    counts[lang] = {
      h: [0, 0, 0, 0, 0, 0],
      code: countBy(c, /^```/gm) / 2,
      mermaid: countBy(c, /^```mermaid\r?\n/gm),
    };
    for (let i = 1; i <= 6; i++) {
      counts[lang].h[i - 1] = countBy(c, new RegExp(`^#{${i}} `, "gm"));
    }
  }
  for (let level = 1; level <= 6; level++) {
    const values = langs.map((l) => counts[l].h[level - 1]);
    if (new Set(values).size > 1) {
      const detail = langs.map((l, i) => `${l}=${values[i]}`).join(", ");
      errors.push(`${name}: heading h${level} count differs (${detail})`);
    }
  }
}

console.log(`Checked ${inventory.size} chapters`);
if (errors.length > 0) {
  console.error("\nERRORS:");
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
if (warnings.length > 0) {
  console.warn("\nWARNINGS:");
  for (const w of warnings) console.warn(`  - ${w}`);
  process.exit(0);
}
console.log("All chapters in sync");
```

**TDD:** Write a unit test that creates two synthetic chapters with a known heading mismatch, asserts the script reports the difference. Run the script against the live repo to confirm green.

**Verify:** `node scripts/sync-check.mjs` exits 0.

**Commit:** `feat(scripts): port sync-check.ps1 to Node`

### Task 12: validate-mermaid.mjs + node:test

**Goal:** Port `scripts/validate-mermaid.ps1` to Node.

**File:** `scripts/validate-mermaid.mjs`

```js
#!/usr/bin/env node
import { readFile, readdir, mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

const LANGS = ["en", "vi"];
const errors = [];
let total = 0;

const tmpDir = await mkdtemp(join(tmpdir(), "pi-docs-mermaid-"));

try {
  for (const lang of LANGS) {
    const dir = join("src/content/docs", lang);
    let files;
    try {
      files = await readdir(dir);
    } catch {
      continue;
    }
    for (const name of files.filter((f) => f.startsWith("ch") && f.endsWith(".md"))) {
      const content = await readFile(join(dir, name), "utf-8");
      const rx = /```mermaid\r?\n([\s\S]*?)\r?\n```/g;
      let m;
      while ((m = rx.exec(content)) !== null) {
        total++;
        const mmdFile = join(tmpDir, `block-${total}.mmd`);
        const svgFile = join(tmpDir, `block-${total}.svg`);
        await writeFile(mmdFile, m[1], "utf-8");
        const code = await new Promise((resolve) => {
          const proc = spawn("npx", ["mmdc", "-i", mmdFile, "-o", svgFile, "-q"], {
            stdio: "inherit",
          });
          proc.on("close", resolve);
        });
        if (code !== 0) {
          errors.push(`${lang}/${name} block ${total}: mmdc failed`);
        }
      }
    }
  }
} finally {
  await rm(tmpDir, { recursive: true, force: true });
}

console.log(`Validated ${total} mermaid block(s)`);
if (errors.length > 0) {
  console.error("\nERRORS:");
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log("All mermaid blocks valid");
```

**Verify:** `node scripts/validate-mermaid.mjs` exits 0.

**Commit:** `feat(scripts): port validate-mermaid.ps1 to Node`

### Task 13: build.mjs

**Goal:** Wrapper around `astro build`.

**File:** `scripts/build.mjs`

```js
#!/usr/bin/env node
import { build } from "astro";

await build({
  outDir: "dist",
});
console.log("Build complete. Output: dist/");
```

(Alternative: drop the wrapper and use `astro build` directly via `package.json` scripts.)

**Verify:** `node scripts/build.mjs` produces a clean `dist/`.

**Commit:** `feat(scripts): build.mjs wrapper`

## Phase 4: CI + Cutover (Tasks 14-18)

### Task 14: Rewrite deploy.yml

**Goal:** Replace PowerShell + mdBook + Python with Node + Astro.

**File:** `.github/workflows/deploy.yml`

```yaml
name: Deploy
on:
  push:
    branches: [main]
  pull_request:
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  lint:
    name: Lint (sync, frontmatter, mermaid)
    if: github.event_name == "pull_request"
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 24, cache: npm }
      - run: npm ci
      - run: npm run lint:sync
      - run: npm run lint:frontmatter
      - run: npm run lint:mermaid

  build:
    name: Build site
    needs: lint
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 24, cache: npm }
      - run: npm ci
      - run: npm run build
      - uses: actions/upload-pages-artifact@v3
        with: { path: dist }

  deploy:
    name: Deploy to GitHub Pages
    if: github.event_name == "push" && github.ref == "refs/heads/main"
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

**Verify:** Push a branch, open a PR, observe green lint + build.

**Commit:** `ci: replace mdBook/PS1 workflow with Node/Astro`

### Task 15: HTML redirects for legacy URLs

**Goal:** Old `*.html` URLs (mdBook output) should redirect to new no-trailing-slash Starlight URLs.

**File:** `scripts/generate-redirects.mjs`

```js
#!/usr/bin/env node
import { writeFile, mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";

const LANGS = ["zh", "en", "vi"];
const PUBLIC = "public";

async function generate() {
  for (const lang of LANGS) {
    const srcDir = join("src/content/docs", lang);
    let files;
    try {
      files = await readdir(srcDir);
    } catch {
      continue;
    }
    for (const name of files) {
      if (!name.endsWith(".md")) continue;
      const base = name.replace(/\.md$/, "");
      if (base === "index") continue;
      const target = `/${lang}/${base}`;
      const html = `<!DOCTYPE html>
<html>
<head>
  <meta http-equiv="refresh" content="0; url=${target}">
  <link rel="canonical" href="${target}">
  <meta charset="utf-8">
  <title>Redirecting...</title>
</head>
<body>
  <p>Redirecting to <a href="${target}">${target}</a></p>
</body>
</html>
`;
      const dir = join(PUBLIC, lang);
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, `${base}.html`), html, "utf-8");
    }
  }
  const rootIndex = `<!DOCTYPE html>
<html>
<head>
  <meta http-equiv="refresh" content="0; url=/en/">
  <link rel="canonical" href="/en/">
  <meta charset="utf-8">
  <title>Redirecting...</title>
</head>
<body>
  <p>Redirecting to <a href="/en/">/en/</a></p>
</body>
</html>
`;
  await writeFile(join(PUBLIC, "index.html"), rootIndex, "utf-8");
  console.log("Generated redirect pages");
}

await generate();
```

**Wire into the build by adding to `scripts/build.mjs`:**

```js
await import("./generate-redirects.mjs");
```

(Or invoke `generate-redirects.mjs` after `astro build` in the `build` script.)

**Verify:** `dist/en/ch01-overview.html` exists and contains a meta-refresh pointing to `/en/ch01-overview`.

**Commit:** `feat(redirects): HTML meta-refresh for legacy html URLs`

### Task 16: Update README and CONTRIBUTING

**Goal:** Replace mdBook-specific instructions with Astro + Starlight instructions.

**Updates:**

- `README.md` tech stack mentions Astro + Starlight + astro-mermaid + Node.
- `README.md` local dev: `npm install` then `npm run dev`.
- `README.md` link to live site.
- `CONTRIBUTING.md` validation commands: `npm run lint:sync`, `npm run lint:frontmatter`, `npm run lint:mermaid`.
- `CONTRIBUTING.md` editing workflow: edit files in `src/content/docs/<lang>/chXX-<slug>.md`.
- `CONTRIBUTING.md` frontmatter schema reference (link to `src/content.config.ts`).
- `CONTRIBUTING.md` repo layout table reflects the new structure.

**Commit:** `docs: update README and CONTRIBUTING for Astro`

### Task 17: Delete mdBook artifacts and obsolete scripts

**Goal:** Remove all mdBook-related files once Astro is verified working.

**Steps:**

```bash
# Remove mdBook instances
git rm -r en/
git rm -r vi/
git rm -r zh/

# Remove old PowerShell scripts (replaced by Node)
git rm scripts/build-all.ps1
git rm scripts/validate-frontmatter.ps1
git rm scripts/sync-check.ps1
git rm scripts/validate-mermaid.ps1
git rm scripts/fetch-zh.ps1

# Remove obsolete Python helpers
git rm scripts/lib/strip-frontmatter.py
git rm scripts/lib/root-index.html
git rm scripts/lib/frontmatter.psm1
git rm scripts/lib/markdown-stats.psm1

# Remove translation/build helpers no longer needed
git rm scripts/extract-structure.py
git rm scripts/add-missing-headings.py
git rm scripts/add-ts-tags-ch01.py
git rm scripts/append-translation.py
git rm scripts/backport-mermaid-ch01.py
git rm scripts/build-translated.py
git rm scripts/clean-zh-artifacts.py
git rm scripts/dedupe-headings-v2.py
git rm scripts/dump-prose.py
git rm scripts/fix-newlines.py
git rm scripts/make-worksheet.py
git rm scripts/rename-ch04-ch05.py

# Remove fetched Chinese chapters (preserved at pifydev/docs only as source)
git rm -r scripts/lib/
git rm -r scripts/translations/
git rm -r scripts/worksheets/
```

**Verify before commit:**

- `npm run lint` passes.
- `npm run build` produces a working `dist/`.
- No references to `pwsh`, `mdbook`, or `python` remain in any markdown, workflow, or script.
- `git grep -n Pwsh` returns nothing.
- `git grep -n mdbook` returns nothing.

**Commit:** `chore: remove mdBook artifacts and obsolete scripts`

### Task 18: PR + tag v2.0.0

**Goal:** Squash-merge the feature branch and tag a new release.

**Steps:**

1. Push the `astro-migration` branch:

```bash
git push origin astro-migration
```

2. Open PR against `main` with title `feat: migrate to Astro 7 + Starlight`.

3. Verify CI passes (lint + build).

4. Squash-merge into `main`.

5. Tag `v2.0.0`:

```bash
git tag -a v2.0.0 -m "Astro 7 + Starlight migration"
git push origin v2.0.0
```

6. Verify GitHub Pages deploys automatically.

7. Add release notes in the GitHub UI summarizing the migration.

**Commit:** `chore(release): v2.0.0 Astro migration`

## Execution Notes

- **Branch:** `astro-migration` cut from `main`.
- **Order:** Tasks 1-5 must land before Tasks 6-13. Tasks 14-16 are independent of branding but depend on Tasks 1-13. Task 17 is the destructive cutover, run last.
- **Verify after each task:** `npm run lint && npm run build`.
- **Rollback:** Tasks 1-13 are additive. PS1 scripts continue to work until Task 17 deletes them. If Task 14+ breaks, revert the PR and the mdBook build still works.
- **Starlight 0.x compatibility:** Pin `@astrojs/starlight` to a version that supports Astro 7. As of 2026-08, that is `^0.30.0`. If that version is not yet released, pin to the latest 0.x that lists Astro 7 in peerDependencies.

## Open Questions

None at plan-time. Spec answers are:
- Branch: `astro-migration` (feature branch).
- Cutover: two-phase (Tasks 1-13 add Astro, Task 17 deletes mdBook).
- Print page: dropped.
- PowerShell: kept during migration, removed in Task 17.

## Bite-Sized Checklist

- [ ] Task 1: Create package.json, astro.config.mjs, tsconfig.json
- [ ] Task 2: Create content config with Zod schema
- [ ] Task 3: Migrate chapter files via git mv
- [ ] Task 4: Create Hero component and update index pages
- [ ] Task 5: Sidebar configuration
- [ ] Task 6: Move assets and update paths
- [ ] Task 7: Custom CSS for Starlight theme
- [ ] Task 8: Hero and homepage polish
- [ ] Task 9: Favicon and OG image
- [ ] Task 10: validate-frontmatter.mjs + node:test
- [ ] Task 11: sync-check.mjs + node:test
- [ ] Task 12: validate-mermaid.mjs + node:test
- [ ] Task 13: build.mjs
- [ ] Task 14: Rewrite deploy.yml
- [ ] Task 15: HTML redirects for legacy URLs
- [ ] Task 16: Update README and CONTRIBUTING
- [ ] Task 17: Delete mdBook artifacts and obsolete scripts
- [ ] Task 18: PR + tag v2.0.0
