# Fumadocs and Vercel Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Astro and GitBook delivery with a bilingual Next.js/Fumadocs application deployed directly from `pifydev/docs` to Vercel.

**Architecture:** Fumadocs MDX loads `content/en` and `content/vi` with directory-based i18n and renders them through locale-prefixed Next.js App Router routes. Vercel hosts the Next.js runtime and multilingual search endpoint, while GitHub Actions validates content and builds but does not deploy. Existing translation provenance and the EN/VI manifest remain authoritative.

**Tech Stack:** Node.js 22, npm, Next.js 16.3.2, React 19.2.8, Fumadocs Core/UI 16.15.0, Fumadocs MDX 15.3.1, Tailwind CSS 4.3.3, Vitest 4.1.11, Playwright 1.62.1, Vercel

---

### Task 1: Record rollback and lock the migration contract

**Files:**
- Create: `scripts/fumadocs-migration.test.mjs`
- Modify: `package.json`

- [ ] **Step 1: Verify the current Astro baseline before tagging it**

Run:

```powershell
npm ci
npm run test:content
npm run lint
npm run build
npm run check
```

Expected: content tests and lint pass, Astro builds 71 pages, and Astro check reports zero errors.

- [ ] **Step 2: Create the annotated rollback tag on the verified baseline**

```powershell
$baseline = git rev-parse origin/main
git tag -a astro-starlight-final $baseline -m "Final Astro Starlight rollback before Fumadocs migration"
git push origin refs/tags/astro-starlight-final
```

Expected: the remote tag resolves to the pre-migration `main` SHA. If the tag already exists, verify it points to the same SHA instead of moving it.

- [ ] **Step 3: Add a failing filesystem contract for the target repository**

Create `scripts/fumadocs-migration.test.mjs` with tests that read files relative to the repository root and assert:

```js
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const exists = async (path) => access(new URL(path, root)).then(() => true, () => false);

test("repository uses Next.js and Fumadocs without Astro", async () => {
  const pkg = JSON.parse(await readFile(new URL("package.json", root), "utf8"));
  assert.ok(pkg.dependencies.next);
  assert.ok(pkg.dependencies["fumadocs-core"]);
  assert.ok(pkg.dependencies["fumadocs-ui"]);
  assert.ok(pkg.dependencies["fumadocs-mdx"]);
  assert.equal(pkg.dependencies.astro, undefined);
  assert.equal(await exists("astro.config.mjs"), false);
  assert.equal(await exists("next.config.mjs"), true);
});

test("content exposes only directory-based English and Vietnamese locales", async () => {
  const manifest = JSON.parse(
    await readFile(new URL("content/translation-manifest.json", root), "utf8"),
  );
  assert.equal(manifest.pages.length, 23);
  assert.equal(manifest.pages[0].en, "index.mdx");
  assert.equal(manifest.pages[0].vi, "index.mdx");
  for (const locale of ["en", "vi"]) {
    assert.equal(await exists(`content/${locale}/index.mdx`), true);
    assert.equal(await exists(`content/${locale}/meta.json`), true);
    assert.equal(await exists(`content/${locale}/README.md`), false);
    assert.equal(await exists(`content/${locale}/SUMMARY.md`), false);
    assert.equal(await exists(`content/${locale}/.gitbook.yaml`), false);
  }
});

test("public app registers only en and vi", async () => {
  const source = await readFile(new URL("lib/i18n.ts", root), "utf8");
  assert.match(source, /languages:\s*\[\s*["']en["'],\s*["']vi["']\s*\]/);
  assert.doesNotMatch(source, /["']zh["']/);
});
```

Add the file to `test:content` in `package.json`.

- [ ] **Step 4: Run the migration contract and confirm RED**

```powershell
node --test scripts/fumadocs-migration.test.mjs
```

Expected: all three tests fail because the repository still uses Astro, the home files still use `README.md`, and `lib/i18n.ts` does not exist.

### Task 2: Replace the application toolchain with Next.js and Fumadocs

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `tsconfig.json`
- Modify: `.gitignore`
- Create: `next.config.mjs`
- Create: `postcss.config.mjs`
- Create: `eslint.config.mjs`
- Create: `source.config.ts`
- Generate: `next-env.d.ts`
- Create: `app/global.css`
- Create: `components/mdx.tsx`
- Create: `components/mdx/mermaid.tsx`
- Create: `lib/i18n.ts`
- Create: `lib/source.ts`

- [ ] **Step 1: Replace framework dependencies using npm**

```powershell
npm uninstall @astrojs/check @astrojs/rss @astrojs/starlight astro astro-mermaid
npm install next@16.3.2 react@19.2.8 react-dom@19.2.8 fumadocs-core@16.15.0 fumadocs-ui@16.15.0 fumadocs-mdx@15.3.1 lucide-react@1.33.0 beautiful-mermaid@1.1.3 next-themes@0.4.6
npm install --save-dev @tailwindcss/postcss@4.3.3 @types/mdx@2.0.14 @types/node@22.20.1 @types/react@19.2.18 @types/react-dom@19.2.4 eslint@9.39.5 eslint-config-next@16.3.2 postcss@8.5.26 tailwindcss@4.3.3 typescript@6.0.3 vitest@4.1.11 @playwright/test@1.62.1 prettier@3.9.6
```

Expected: `package-lock.json` resolves without peer dependency errors.

- [ ] **Step 2: Define the application scripts and Node contract**

Set these package fields while retaining the content validation commands that are still relevant:

```json
{
  "engines": { "node": ">=22 <23" },
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "postinstall": "fumadocs-mdx",
    "typecheck": "next typegen && tsc --noEmit",
    "lint:app": "eslint .",
    "test:unit": "vitest run",
    "test:content": "node --test scripts/gitbook-content.test.mjs scripts/ci-config.test.mjs scripts/fumadocs-migration.test.mjs",
    "test:e2e": "playwright test",
    "format:check": "prettier --check .",
    "lint:frontmatter": "node scripts/validate-frontmatter.mjs",
    "lint:sync": "node scripts/sync-check.mjs",
    "lint:mermaid": "node scripts/validate-mermaid.mjs",
    "lint:content": "node scripts/validate-content.mjs",
    "lint": "npm run lint:sync && npm run lint:frontmatter && npm run lint:content && npm run lint:mermaid && npm run lint:app"
  }
}
```

- [ ] **Step 3: Add the base Next.js and Fumadocs configuration**

`next.config.mjs`:

```js
import { createMDX } from "fumadocs-mdx/next";

const withMDX = createMDX();

export default withMDX({
  reactStrictMode: true,
  poweredByHeader: false,
});
```

`postcss.config.mjs`:

```js
export default {
  plugins: { "@tailwindcss/postcss": {} },
};
```

`eslint.config.mjs`:

```js
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypeScript,
  globalIgnores([
    ".next/**",
    ".source/**",
    "dist/**",
    "playwright-report/**",
    "test-results/**",
  ]),
]);
```

`source.config.ts`:

```ts
import { remarkMdxMermaid } from "fumadocs-core/mdx-plugins";
import { defineConfig } from "fumadocs-mdx/config";

export default defineConfig({
  mdxOptions: {
    remarkPlugins: [remarkMdxMermaid],
  },
});
```

`lib/i18n.ts`:

```ts
import { defineI18n } from "fumadocs-core/i18n";

export const i18n = defineI18n({
  defaultLanguage: "en",
  languages: ["en", "vi"],
  parser: "dir",
  fallbackLanguage: null,
});

export type Locale = (typeof i18n.languages)[number];
```

`lib/source.ts`:

```ts
import { i18n } from "@/lib/i18n";
import { loader } from "fumadocs-core/source";
import { defineDocs } from "fumadocs-mdx/macro";

const docs = defineDocs({
  dir: "content",
  docs: {
    postprocess: { includeProcessedMarkdown: true },
  },
});

export const source = loader({
  baseUrl: "/",
  source: docs.toFumadocsSource(),
  i18n,
});
```

- [ ] **Step 4: Add MDX rendering and server-side Mermaid**

`components/mdx/mermaid.tsx` renders diagrams on the server and preserves the
source as an accessible fallback:

```tsx
import { renderMermaidSVG } from "beautiful-mermaid";
import { CodeBlock, Pre } from "fumadocs-ui/components/codeblock";

export function Mermaid({ chart }: { chart: string }) {
  try {
    const svg = renderMermaidSVG(chart, {
      bg: "var(--color-fd-background)",
      fg: "var(--color-fd-foreground)",
      transparent: true,
    });

    return (
      <figure className="pify-mermaid" aria-label="Diagram">
        <div dangerouslySetInnerHTML={{ __html: svg }} />
        <details>
          <summary>View diagram source</summary>
          <CodeBlock>
            <Pre>{chart}</Pre>
          </CodeBlock>
        </details>
      </figure>
    );
  } catch {
    return (
      <CodeBlock>
        <Pre>{chart}</Pre>
      </CodeBlock>
    );
  }
}
```

`components/mdx.tsx` merges `fumadocs-ui/mdx`, the Mermaid component, and caller overrides.

The exported MDX component map must be:

```tsx
import { Mermaid } from "@/components/mdx/mermaid";
import defaultMdxComponents from "fumadocs-ui/mdx";
import type { MDXComponents } from "mdx/types";

export function getMDXComponents(components?: MDXComponents) {
  return { ...defaultMdxComponents, Mermaid, ...components } satisfies MDXComponents;
}

export const useMDXComponents = getMDXComponents;
```

- [ ] **Step 5: Configure strict TypeScript, lint, generated files, and base CSS**

Use this strict TypeScript configuration:

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "react-jsx",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": [
    "next-env.d.ts",
    ".next/types/**/*.ts",
    ".source/**/*.ts",
    "**/*.ts",
    "**/*.tsx"
  ],
  "exclude": ["node_modules"]
}
```

Generate `next-env.d.ts` with Next.js rather than hand-editing it. Add `.next`,
`.source`, `playwright-report`, and `test-results` to `.gitignore`.

`app/global.css` begins with:

```css
@import "tailwindcss";
@import "fumadocs-ui/css/neutral.css";
@import "fumadocs-ui/css/preset.css";

@font-face {
  font-family: "Geist";
  src: url("/fonts/Geist-Regular.ttf") format("truetype");
  font-weight: 400;
  font-display: swap;
}

@font-face {
  font-family: "Geist Mono";
  src: url("/fonts/GeistMono-Regular.ttf") format("truetype");
  font-weight: 400;
  font-display: swap;
}
```

- [ ] **Step 6: Generate Fumadocs types and verify the scaffold compiles far enough to expose missing content routes**

```powershell
npm run postinstall
npm run typecheck
```

Expected: Fumadocs generation succeeds; typecheck may still fail only for route files not added until Task 4. Resolve dependency or configuration errors now rather than carrying them forward.

- [ ] **Step 7: Commit the toolchain**

```powershell
git add -- package.json package-lock.json tsconfig.json .gitignore next.config.mjs postcss.config.mjs eslint.config.mjs source.config.ts next-env.d.ts app/global.css components lib
git commit -m "feat: scaffold bilingual Fumadocs app"
```

### Task 3: Convert GitBook content conventions to Fumadocs

**Files:**
- Rename: `content/en/README.md` → `content/en/index.mdx`
- Rename: `content/vi/README.md` → `content/vi/index.mdx`
- Delete: `content/en/SUMMARY.md`
- Delete: `content/vi/SUMMARY.md`
- Delete: `content/en/.gitbook.yaml`
- Delete: `content/vi/.gitbook.yaml`
- Create: `content/en/meta.json`
- Create: `content/vi/meta.json`
- Create: `content/en/how-to/meta.json`
- Create: `content/vi/how-to/meta.json`
- Create: `content/en/reference/meta.json`
- Create: `content/vi/reference/meta.json`
- Create: `content/en/help/meta.json`
- Create: `content/vi/help/meta.json`
- Modify: `content/translation-manifest.json`
- Rename: `scripts/validate-gitbook-content.mjs` → `scripts/validate-content.mjs`
- Rename: `scripts/gitbook-content.test.mjs` → `scripts/content.test.mjs`

- [ ] **Step 1: Write the Fumadocs content contract before moving files**

Rename the test file to `scripts/content.test.mjs`, update `test:content` to use
the new path, and require `index.mdx`, locale `meta.json` ordering, paired routes,
valid relative links, equal code-fence languages, equal heading shapes, and
absence of `{% hint %}`, `.gitbook.yaml`, and `SUMMARY.md`. Run it and confirm it
fails against the GitBook-shaped tree.

- [ ] **Step 2: Rename the two home pages and update their syntax**

Use `git mv` for the home files. Replace each GitBook hint pair with an MDX callout:

```mdx
<Callout type="info">
  New here? Start with the [Quickstart](quickstart.md) and you will have a working
  Pi agent in ten minutes.
</Callout>
```

Use the translated Vietnamese sentence in `content/vi/index.mdx`. Update the manifest home paths to `index.mdx`.

- [ ] **Step 3: Replace SUMMARY files with localized Fumadocs navigation**

Each locale root `meta.json` lists `index`, `quickstart`, `glossary`, localized separators, `how-to`, `reference`, all ten chapter slugs in order, and `help`. Nested meta files contain localized titles and exact page order. For example English root metadata:

```json
{
  "title": "Pify Agent Book",
  "pages": [
    "index",
    "quickstart",
    "glossary",
    "---How-to guides---",
    "how-to",
    "---Reference---",
    "reference",
    "---Chapters---",
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
    "---Help---",
    "help"
  ]
}
```

- [ ] **Step 4: Remove GitBook configuration and update validation names/messages**

Delete both `.gitbook.yaml` and `SUMMARY.md` files. Rename the validator to `validate-content.mjs`, remove GitBook config parsing, validate all eight `meta.json` files, and print:

```text
Fumadocs content validation passed: 23 EN/VI page pairs.
```

- [ ] **Step 5: Run the content and migration tests**

```powershell
npm run test:content
npm run lint:content
npm run lint:mermaid
```

Expected: the manifest contains 23 pairs, all navigation metadata resolves, two Mermaid blocks validate, and no GitBook syntax remains.

- [ ] **Step 6: Commit the content conversion**

```powershell
git add -- content scripts package.json
git commit -m "feat(content): migrate bilingual docs to Fumadocs"
```

### Task 4: Implement locale routing, docs layout, and metadata

**Files:**
- Create: `proxy.ts`
- Create: `app/[lang]/layout.tsx`
- Create: `app/[lang]/(docs)/layout.tsx`
- Create: `app/[lang]/(docs)/[[...slug]]/page.tsx`
- Create: `app/not-found.tsx`
- Create: `lib/layout.shared.tsx`
- Create: `lib/routes.ts`
- Create: `tests/routes.test.ts`

- [ ] **Step 1: Write routing tests first**

Test `isLocale`, `selectLocale`, `toPublicPath`, and paired-language switching. Required cases:

```ts
expect(selectLocale("vi", "en-US,en;q=0.9")).toBe("vi");
expect(selectLocale(undefined, "vi-VN,vi;q=0.9,en;q=0.8")).toBe("vi");
expect(selectLocale(undefined, "fr-FR,fr;q=0.9")).toBe("en");
expect(toPublicPath("en", "index.mdx")).toBe("/en");
expect(toPublicPath("vi", "how-to/add-custom-tool.md")).toBe("/vi/how-to/add-custom-tool");
expect(switchLocale("/en/ch03-agent-loop", "vi")).toBe("/vi/ch03-agent-loop");
```

Run `npm run test:unit` and confirm RED because the functions do not exist.

- [ ] **Step 2: Implement pure locale and manifest helpers**

`lib/routes.ts` accepts only `en | vi`, parses `Accept-Language` quality weights, maps `index.mdx` to a locale root, strips Markdown extensions, and switches only paths registered in `translation-manifest.json`.

- [ ] **Step 3: Implement the locale middleware**

`proxy.ts` composes Fumadocs `createI18nMiddleware(i18n)` with a matcher that excludes `/api`, Next assets, favicon, robots, sitemap, and public files. Root selection follows the valid `pify-locale` cookie, then Vietnamese browser preference, then English.

- [ ] **Step 4: Implement localized providers and navigation options**

`app/[lang]/layout.tsx` validates the locale, sets `<html lang>`, imports global CSS, and passes translated locale display names into `RootProvider`. `lib/layout.shared.tsx` returns the Pify logo, locale-root nav URL, GitHub URL, and locale-aware navigation labels.

- [ ] **Step 5: Implement the docs layout and catch-all page**

Use `DocsLayout` with `source.getPageTree(lang)`. The page calls `source.getPage(slug, lang)`, renders `DocsTitle`, `DocsDescription`, copy/view actions, `DocsBody`, relative links, previous/next navigation, and `notFound()` for missing content. `generateStaticParams()` returns every EN/VI page.

- [ ] **Step 6: Generate canonical and alternate metadata**

For each manifest-paired page, metadata uses `new URL("https://docs.pify.dev")`, a self-referencing canonical, alternates for `en`, `vi`, and `x-default`, localized Open Graph data, and `/og-image.png`. No GitBook or GitHub Pages hostname may appear.

- [ ] **Step 7: Run unit, type, and production build tests**

```powershell
npm run test:unit
npm run typecheck
npm run build
```

Expected: route tests pass, all 46 localized content routes are generated, and no unsupported locale route is emitted.

- [ ] **Step 8: Commit routing**

```powershell
git add -- app components lib proxy.ts tests
git commit -m "feat: add bilingual Fumadocs routing"
```

### Task 5: Apply the clean Pify visual system

**Files:**
- Modify: `app/global.css`
- Create: `components/pify-logo.tsx`
- Create: `components/locale-switcher.tsx` only if the built-in selector cannot retain paired paths
- Modify: `lib/layout.shared.tsx`
- Modify: `components/mdx.tsx`

- [ ] **Step 1: Invoke `design-taste-frontend` and audit the rendered default Fumadocs UI**

Start the app, inspect desktop and mobile defaults, and record only concrete layout issues relative to the approved design: reading width, header density, sidebar hierarchy, TOC prominence, mobile overflow, logo treatment, code blocks, and contrast.

- [ ] **Step 2: Implement the Pify header and logo**

Use the existing `/pify-on-light-128.png` and `/pify-on-dark-128.png` assets in a 28-pixel mark paired with the word `Pify`. The nav contains search, EN/VI, theme, and GitHub controls; it does not add marketing CTAs.

- [ ] **Step 3: Apply explicit design tokens and responsive layout**

Define light and dark variables with neutral surfaces and one blue accent:

```css
:root {
  --pify-accent: #2563eb;
  --pify-page: #fafaf9;
  --pify-panel: #ffffff;
  --pify-text: #18181b;
  --pify-muted: #71717a;
  --pify-line: #e4e4e7;
  --fd-layout-width: 1440px;
}

.dark {
  --pify-accent: #60a5fa;
  --pify-page: #0b0b0c;
  --pify-panel: #111113;
  --pify-text: #f4f4f5;
  --pify-muted: #a1a1aa;
  --pify-line: #27272a;
}
```

Keep article width at `min(100%, 48rem)`, body line height at `1.72`, desktop sidebars flat, focus rings visible, tables horizontally scrollable, and mobile controls at least 44 pixels high. Do not use gradients, glass, heavy shadows, nested cards, or decorative animation.

- [ ] **Step 4: Verify MDX primitives visually**

Inspect callouts, Mermaid, tables, inline code, fenced code, headings, anchors, external links, and previous/next controls in both themes and both locales. Fix global styles rather than patching individual content pages.

- [ ] **Step 5: Commit the visual system**

```powershell
git add -- app/global.css components lib/layout.shared.tsx
git commit -m "feat(ui): apply clean Pify docs theme"
```

### Task 6: Add multilingual search, SEO, and machine-readable output

**Files:**
- Create: `app/api/search/route.ts`
- Create: `app/robots.ts`
- Create: `app/sitemap.ts`
- Create: `app/[lang]/llms.txt/route.ts`
- Create: `app/[lang]/llms-full.txt/route.ts`
- Create: `lib/seo.ts`
- Create: `tests/seo.test.ts`

- [ ] **Step 1: Write SEO and output tests first**

Assert 46 unique canonical URLs, paired `hreflang`, no `zh`, no GitBook hostname, `/en/llms.txt` and `/vi/llms.txt` locale isolation, and sitemap coverage for all manifest pages. Run `npm run test:unit` and confirm RED.

- [ ] **Step 2: Add built-in multilingual search**

Expose `createFromSource(source)` from `app/api/search/route.ts`. Configure Fumadocs search UI with the current locale so results never mix languages.

- [ ] **Step 3: Add canonical, robots, and sitemap helpers**

`lib/seo.ts` owns the constant `https://docs.pify.dev`, route normalization, alternates, and sitemap records. `robots.ts` allows crawling and references the canonical sitemap. `sitemap.ts` maps both locales from the manifest.

- [ ] **Step 4: Add localized LLM endpoints**

The localized routes call `source.getPages(lang)`, export page title, public URL, and processed Markdown, and set `Content-Type: text/plain; charset=utf-8`. They never include pages from the other locale.

- [ ] **Step 5: Run unit tests and build**

```powershell
npm run test:unit
npm run typecheck
npm run build
```

Expected: SEO tests pass and the build includes robots, sitemap, search, and localized LLM routes.

- [ ] **Step 6: Commit search and SEO**

```powershell
git add -- app lib tests
git commit -m "feat: add localized search and SEO"
```

### Task 7: Remove Astro/GitBook application artifacts and update CI

**Files:**
- Delete: `astro.config.mjs`
- Delete: `src/**`
- Delete: `scripts/build.mjs`
- Delete: `scripts/migrate-gitbook-content.mjs`
- Delete: `scripts/lib/gitbook-content.mjs`
- Delete: `scripts/screenshot/**`
- Modify: `.github/workflows/content-quality.yml`
- Modify: `.github/workflows/deploy.yml`
- Modify: `scripts/ci-config.test.mjs`
- Modify: `README.md`
- Modify: `CONTRIBUTING.md`

- [ ] **Step 1: Update workflow tests before changing workflows**

Require Node.js 22 in both workflows. Content quality must run `npm ci`, content tests, unit tests, content lint, Mermaid lint, and app lint. `deploy.yml` is renamed in the UI to `Next.js Application Build` and runs `npm ci`, typecheck, and build with read-only permissions. Confirm the test fails against the Astro workflow.

- [ ] **Step 2: Replace the two workflow bodies**

Both workflows use `actions/checkout@v4`, `actions/setup-node@v4` with Node 22 and npm cache, `permissions: contents: read`, a 20-minute timeout, and cancellation of stale runs. Neither workflow calls Vercel or GitHub Pages.

- [ ] **Step 3: Remove the obsolete tracked application files safely**

Resolve and verify the exact worktree paths for `src` and `scripts/screenshot`, confirm both are inside the current worktree, then remove only the tracked Astro paths listed above with `git rm`. Recovery remains available at `astro-starlight-final`.

- [ ] **Step 4: Rewrite repository documentation**

README and CONTRIBUTING describe Fumadocs authoring under `content/en` and `content/vi`, Node 22 setup, `npm run dev`, validation commands, Preview deployments, and Vercel production. Remove instructions for GitBook spaces, Astro, and GitHub Pages.

- [ ] **Step 5: Run the complete local gate**

```powershell
npm ci
npm run test:content
npm run test:unit
npm run lint
npm run typecheck
npm run build
npm run format:check
git diff --check
```

Expected: all commands exit zero and no tracked Astro or GitBook runtime configuration remains.

- [ ] **Step 6: Commit cleanup**

```powershell
git add -A
git commit -m "chore: retire Astro and GitBook delivery"
```

### Task 8: Verify browser behavior and accessibility

**Files:**
- Create: `playwright.config.ts`
- Create: `tests/e2e/docs.spec.ts`

- [ ] **Step 1: Invoke the browser skill and write end-to-end journeys**

Cover `/`, `/en`, `/vi`, concept/how-to/reference pages, paired language switching, locale-scoped search, desktop sidebar, mobile drawer, theme toggle, keyboard focus, Mermaid visibility, 404, canonical metadata, and absence of horizontal overflow at 390×844 and 1440×900.

- [ ] **Step 2: Run the production server journeys**

```powershell
npm run build
npm run start -- --hostname 127.0.0.1 --port 3010
npm run test:e2e
```

Expected: all journeys pass in Chromium. Stop only the server process started from this worktree; do not touch unrelated ports.

- [ ] **Step 3: Perform visual inspection**

Use the browser at desktop and mobile sizes to verify the approved visual system in English, Vietnamese, light, and dark modes. Capture screenshots for the home, long chapter, reference table, and Mermaid page. Correct any overflow, low contrast, unreadable line length, or control collision and rerun affected journeys.

- [ ] **Step 4: Commit browser coverage**

```powershell
git add -- playwright.config.ts tests/e2e app components
git commit -m "test: cover bilingual docs journeys"
```

### Task 9: Deploy Preview, Production, and `docs.pify.dev`

**Files:**
- Create locally but do not commit: `.vercel/project.json`
- Verify: Vercel project `pify-docs`

- [ ] **Step 1: Rebase and rerun the full verification gate**

```powershell
git fetch origin main
git rebase origin/main
npm ci
npm run test:content
npm run test:unit
npm run lint
npm run typecheck
npm run build
npm run test:e2e
git diff --check origin/main...HEAD
```

Expected: the branch is current and every local gate passes after the rebase.

- [ ] **Step 2: Push a Preview branch and connect Vercel to `pifydev/docs`**

Push the migration branch, link the repository root to the existing `pify-docs` project, set root directory to the repository root, Node 22.x, `npm ci`, `npm run build`, and Next.js default output. Connect the Git integration to `pifydev/docs` without exposing credentials.

- [ ] **Step 3: Remove obsolete GitBook environment variables**

List environment variable names only. Remove `PIFY_GITBOOK_EN_ORIGIN` and `PIFY_GITBOOK_VI_ORIGIN` from Preview and Production if present. Do not print secret values.

- [ ] **Step 4: Create and verify a Vercel Preview deployment**

Deploy the branch without `--prod`. Verify `/`, `/en`, `/vi`, representative pages, search, robots, sitemap, LLM endpoints, canonical URLs, responsive layouts, and that the deployment source SHA matches the branch head.

- [ ] **Step 5: Fast-forward the accepted commit to main and deploy Production**

After Preview acceptance:

```powershell
git fetch origin main
git merge-base --is-ancestor origin/main HEAD
git push origin HEAD:main
bunx vercel@50.37.3 --prod --yes
```

Expected: no force push, Production source equals local HEAD, and the generated Vercel hostname passes the same smoke checks.

- [ ] **Step 6: Attach `docs.pify.dev` without changing the landing page**

Add `docs.pify.dev` to `pify-docs`, inspect the exact DNS record requested by Vercel, and change only the `docs` record at the authoritative DNS provider. Verify DNS, TLS, and `https://docs.pify.dev/en` before announcing cutover. If DNS credentials are unavailable, stop after reporting the exact required record; do not alter apex, `www`, mail, or unrelated records.

- [ ] **Step 7: Verify cloud checks and record the release**

Confirm GitHub Actions and Vercel are green for the production SHA, no GitBook or GitHub Pages workflow runs, and all acceptance URLs remain on `docs.pify.dev`. Record the deployment URL, ID, SHA, timestamp, domain status, and rollback tag in the repository operations documentation.
