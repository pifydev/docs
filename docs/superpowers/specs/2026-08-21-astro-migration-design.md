# Astro + Starlight Migration Spec

**Date:** 2026-08-21
**Status:** Draft
**Author:** Pi Docs Contributors
**Replaces:** mdBook 0.5.4 + mdbook-mermaid + PowerShell scripts

## Goal

Move the Pify Agent Book docs site from mdBook to **Astro 7 + Starlight** while preserving URL structure, branding, and the en/vi language swap. Keep Markdown as the source format.

## Non-goals

- Change the canonical source (Chinese chapters from dgzhuya.com remain the source of truth).
- Migrate content off this repository (everything stays in pifydev/docs).
- Replace the GitHub Pages deployment target (still pifydev.github.io/docs/).
- Drop the Vietnamese translation (vi/ stays a first-class locale).
- Adopt a custom domain (can be added later).

## Current state

| Concern | Today |
| --- | --- |
| Generator | mdBook 0.5.4, one instance per language |
| Structure | en/, vi/, zh/ — each with own book.toml, src/, theme/ |
| Build | scripts/build-all.ps1 runs mdbook build 3x, copies to dist/{en,vi,zh}/ |
| Mermaid | mdbook-mermaid plugin, client-side via mermaid.min.js |
| Frontmatter | Per-chapter YAML (chapter, slug, title_*, version_pairs, etc.); mdBook does not strip it, custom Python preprocessor handles that |
| i18n routing | None built-in; custom theme/lang-switcher.js rewrites /en/ <-> /vi/ |
| Validation | PowerShell: validate-frontmatter.ps1, sync-check.ps1, validate-mermaid.ps1 |
| Branding | Inline-SVG hero in index.md, theme CSS for theme-aware swap, Pify logo pack |
| CI | .github/workflows/deploy.yml (mdBook install + Python install + mdbook build x3) |
| Deploy | GitHub Pages from dist/ |

30 chapter files, 10 chapters x 3 languages, plus 3 index pages, 3 SUMMARY.md files, 3 themes, README/CONTRIBUTING/GLOSSARY, plus helper scripts.

## Target architecture

A single **Astro 7** project at the repo root, with **Starlight** as the documentation integration. The three mdBook instances collapse into one Astro project that uses Starlight built-in i18n routing.

```
pifydev/docs/
+-- astro.config.mjs               # Starlight config: title, locales, Mermaid, custom CSS
+-- package.json                   # Node deps: astro, @astrojs/starlight, astro-mermaid
+-- tsconfig.json
+-- src/
|   +-- content.config.ts          # docs + i18n content collections (Zod schemas)
|   +-- content/
|   |   +-- docs/
|   |   |   +-- zh/ch01-overview.md ... zh/ch10-session.md
|   |   |   +-- en/ch01-overview.md ... en/ch10-session.md
|   |   |   +-- vi/ch01-overview.md ... vi/ch10-session.md
|   |   +-- i18n/
|   |       +-- en.json            # UI string overrides (search.noResults, etc.)
|   |       +-- vi.json
|   +-- assets/
|   |   +-- logo-light-bg.svg
|   |   +-- logo-dark-bg.svg
|   |   +-- favicon.svg
|   |   +-- og-image.png
|   +-- styles/
|       +-- custom.css             # Pify hero, brand colors, lang-switcher overrides
+-- public/                        # static assets copied verbatim
|   +-- favicon.ico
+-- docs/superpowers/{specs,plans}/
+-- scripts/                       # build helpers (Node-based)
|   +-- build.mjs                  # wrapper around astro build
|   +-- sync-check.mjs             # port of sync-check.ps1
|   +-- validate-frontmatter.mjs   # port of validate-frontmatter.ps1
|   +-- validate-mermaid.mjs       # port of validate-mermaid.mjs (still uses mermaid-cli)
+-- README.md                      # updated tech stack + commands
+-- CONTRIBUTING.md                # updated local dev steps
+-- .github/workflows/deploy.yml   # withastro/action@v6 + Node 24
```

### Astro config (astro.config.mjs)

```js
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import mermaid from "astro-mermaid";

export default defineConfig({
  site: "https://pifydev.github.io",
  base: "/docs",
  integrations: [
    mermaid(),                    // must precede starlight
    starlight({
      title: "Pify Agent Book",
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
    }),
  ],
});
```

### Frontmatter schema

Current per-chapter frontmatter has 16 fields. Starlight built-in docsSchema() covers title and description; everything else moves to a **custom Zod schema** in src/content.config.ts.

```ts
import { defineCollection, z } from "astro:content";
import { docsLoader, i18nLoader } from "@astrojs/starlight/loaders";
import { docsSchema, i18nSchema } from "@astrojs/starlight/schema";

const chapterFrontmatter = z.object({
  chapter: z.number().int().min(1).max(10),
  slug: z.string().regex(/^ch[0-9]{2}-[a-z0-9-]+$/),
  title_zh: z.string(),
  title_en: z.string(),
  title_vi: z.string(),
  source_url: z.string().url(),
  language: z.enum(["zh", "en", "vi"]),
  version_pairs: z.object({
    zh: z.string(),
    en: z.string(),
    vi: z.string(),
  }),
  original_chars: z.number().int().optional(),
  code_lines: z.number().int().optional(),
  reading_minutes: z.number().int().optional(),
  translator: z.string().optional(),
  reviewed_by: z.string().nullable().optional(),
  last_updated: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status: z.enum(["draft", "translated", "reviewed", "published"]),
  official_refs: z.array(z.string().url()).optional(),
  terms_used: z.array(z.string()).optional(),
  mermaid_blocks: z.number().int(),
  code_blocks: z.number().int(),
});

export const collections = {
  docs: defineCollection({
    loader: docsLoader(),
    schema: docsSchema({ extend: chapterFrontmatter }),
  }),
  i18n: defineCollection({
    loader: i18nLoader(),
    schema: i18nSchema(),
  }),
};
```

Starlight uses slug field for URL by default — we already have matching slugs (ch01-overview, etc.) so URLs stay identical.

### URL preservation

Old (mdBook) URLs under pifydev.github.io/docs/:

| Old | New (Astro) | Notes |
| --- | --- | --- |
| /docs/en/ | /docs/en/ | Same |
| /docs/en/ch01-overview.html | /docs/en/ch01-overview/ | trailing slash; **behavioral break** |
| /docs/en/print.html | not generated by default | drop |
| /docs/en/topic/... | matches if topic dir matches | depends on slug |
| /docs/dist/index.html redirect -> /en/ | /docs/en/ directly via root locale, or kept as index.html redirect | can keep redirect page |

The trailing-slash difference is the main URL break. **Mitigation:** set Starlight trailingSlash: "never" so URLs stay .html-free and match mdBook URLs without the slash. Google indexing will normalize either way.

### Mermaid

Use astro-mermaid integration (client-side rendering). astro-mermaid registers a remark transform that converts triple-backtick mermaid code blocks into pre.mermaid blocks that mermaid.js renders in the browser, matching today behavior.

The current validate-mermaid.ps1 validates every Mermaid block by rendering it to SVG via @mermaid-js/mermaid-cli. We keep that as a Node script (scripts/validate-mermaid.mjs) — same dependency, same behavior.

### Branding

The hero inline SVG, favicon, social preview, and dark-mode-aware logo pack all migrate to Astro:

- src/assets/*.svg — referenced from the homepage via an Astro component
- src/styles/custom.css — overrides Starlight CSS variables for the brand accent color and hero styling
- The hero is a custom **Hero Astro component** placed in src/content/docs/{en,vi,zh}/index.md frontmatter or as an Astro page that wraps the markdown

### Language switcher

Starlight has a built-in LanguageSelect component. With three locales configured, it renders automatically in the header — **replaces our hand-rolled lang-switcher.js**. Built-in component handles:
- Locale detection from URL
- Native i18n routing
- Accessibility (aria, keyboard)
- Theme awareness (uses Starlight CSS variables)

We override LanguageSelect only if we want a custom dropdown style. Otherwise it ships as-is.

### Validation scripts

PowerShell scripts port to Node (the rest of the project will be Node-based):

| Old | New |
| --- | --- |
| scripts/validate-frontmatter.ps1 | scripts/validate-frontmatter.mjs — reads every file under src/content/docs/, parses YAML, validates against the Zod schema |
| scripts/sync-check.ps1 | scripts/sync-check.mjs — pairs chapters across en/, vi/, zh/ by chapter+slug, checks version_pairs, mermaid/code block counts |
| scripts/validate-mermaid.ps1 | scripts/validate-mermaid.mjs — same logic, shelled out via npx mmdc |
| scripts/build-all.ps1 | scripts/build.mjs — wraps astro build, sets outDir: dist |

### CI / CD

.github/workflows/deploy.yml becomes:

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
    if: github.event_name == "pull_request"
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 24, cache: npm }
      - run: npm ci
      - run: node scripts/sync-check.mjs
      - run: node scripts/validate-frontmatter.mjs
      - run: npm run lint:mermaid

  build:
    needs: lint
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 24, cache: npm }
      - run: npm ci
      - run: node scripts/build.mjs
      - uses: actions/upload-pages-artifact@v3
        with: { path: dist }

  deploy:
    if: github.event_name == "push" && github.ref == "refs/heads/main"
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

PowerShell is no longer needed in CI.

### Out of scope (yet)

- i18n for the UI strings (search, sidebar, etc.) beyond English defaults — can add later via src/content/i18n/{en,vi}.json.
- Versioning / release branches — Starlight supports it but we do not need it yet.
- Algolia/DocSearch — Starlight default pagefind works out of the box; keep it.
- Custom domain — out of scope.

## Risk register

| Risk | Severity | Mitigation |
| --- | --- | --- |
| Trailing-slash URL difference breaks inbound links | Medium | trailingSlash: "never" + GitHub Pages 200s |
| mdBook -> Astro frontmatter field mismatch | Medium | Custom Zod schema matches all 16 current fields; build fails on any violation |
| astro-mermaid Satteri compatibility (Astro 7 default) | Low | Pin to astro-mermaid ^2 which supports Satteri, or opt into unified() if issues |
| Chinese full-width colon : in titles gets mangled | Low | astro-mermaid does not touch text content; same em-dash-to-colon rule from current site already applied |
| GitHub Pages subpath /docs breaks absolute URLs | Low | Configure base: "/docs" in astro.config.mjs; tested in deploy.yml preview |
| Validation script drift between PS1 and MJS during migration | Medium | Cut over validation scripts in one PR before removing PS1 |
| Old en/ch01-overview.html URLs 404 after cutover | Medium | Add meta http-equiv refresh redirect pages for one release; or 301 via GitHub Pages _redirects (only on Netlify — not GH Pages, so use HTML redirects) |

## Open questions for the user

1. **Branch strategy.** Single main branch with phased rollout, or feature branch astro-migration?
2. **Cutover.** Big-bang PR (delete mdBook artifacts + add Astro in one shot), or two-phase (add Astro behind a flag, then flip default, then remove mdBook)?
3. **Drop the print.html page?** mdBook generates /lang/print.html (single-page printable). Starlight has no equivalent built-in. Drop or write a small script?
4. **Keep PowerShell scripts?** CI moves to Node, but local devs might still want PS1 for convenience. Keep them as a fallback or remove?

Defaults: feature branch astro-migration, two-phase cutover, drop print page, keep PS1 for one release.
