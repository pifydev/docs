# Pify Docs: GitBook Self-hosted Redesign

**Date:** 2026-08-22
**Status:** Design approved; pending specification review
**Owners:** Pify maintainers
**Supersedes:** The deployment and UI decisions in `2026-08-21-astro-migration-design.md`
**Retains:** The source-verification and terminology principles in `2026-08-20-pi-docs-translation-design.md`

## 1. Decision summary

Pify Docs will move from Astro/Starlight on GitHub Pages to a public GPLv3 fork of the current GitBook renderer deployed on Vercel.

| Concern | Decision |
| --- | --- |
| Landing page | Keep `https://pify.dev/` separate and unchanged |
| Documentation domain | `https://docs.pify.dev` |
| Public routes | `/en/*` and `/vi/*` only |
| Renderer | Public fork of `GitbookIO/gitbook`, kept under GPLv3 |
| Renderer hosting | Vercel, using the upstream Next.js runtime |
| Content source | Existing public `pifydev/docs` repository |
| Content publishing | Two GitBook spaces synced from two project directories in the same repository |
| Chinese material | Retained as an unpublished reference source |
| UI direction | Minimal editorial layout using the supplied Pify logo system |
| Migration | Two-phase preview and cutover; Astro remains live until acceptance checks pass |

The open-source repository is the frontend renderer for published GitBook content, not the deprecated standalone GitBook static-site generator. It therefore remains connected to published GitBook content and runs as a Next.js application on Vercel.

## 2. Goals

- Publish clean, readable English and Vietnamese documentation at `docs.pify.dev`.
- Rewrite all current English and Vietnamese prose to publication quality.
- Keep the two languages structurally paired without mixing their navigation or search results.
- Preserve stable semantic page slugs wherever a corresponding page already exists.
- Make language switching predictable and page-aware.
- Apply Pify branding without turning documentation pages into marketing pages.
- Keep renderer customizations small, isolated, tested, and easy to rebase on upstream.
- Retain Markdown and Git pull requests as the content-authoring workflow.
- Cut over without an avoidable documentation outage or silent SEO break.

## 3. Non-goals

- Hosting documentation under `pify.dev/docs`.
- Publishing Chinese as a selectable language.
- Producing a static GitHub Pages export from the GitBook renderer.
- Replacing GitBook's editor, Git Sync service, content API, or search backend.
- Adding paid GitBook site sections, variants, AI answers, or custom-domain features.
- Redesigning the `pify.dev` landing page in this project.
- Rewriting or translating source-code identifiers, API names, commands, paths, or environment variables.
- Maintaining two independent copies of the renderer.

## 4. Current-state audit

The repository currently uses Astro 7, Starlight 0.41, and `astro-mermaid`. It contains:

- 23 English pages and the same 23 Vietnamese pages.
- 10 translated chapters in each published language.
- 11 Chinese reference pages: the home page plus chapters 1 through 10.
- Custom Astro header, footer, callouts, navigation, hero styling, and a custom 404 page.

The audit found four classes of problems that the migration must address:

1. **Editorial quality:** English contains literal machine-translation artifacts, especially in the model-invocation chapter. Vietnamese chapters 9 and 10 contain long unaccented passages, and some pages mix Vietnamese, English, and residual Chinese unnaturally.
2. **Readability:** Long-form pages are cramped between oversized navigation regions, headings are too dominant, and decorative elements compete with the text.
3. **Localization:** Some shared UI is English-only, the Vietnamese home page contains English UI copy, and the custom 404 locale conflicts with the site's current default.
4. **Validation:** The current sync check accidentally classifies `changelog.md` as a numbered chapter and compares optional Chinese `terms_used` metadata as though it were required.

Astro also reports a duplicate 404 route and the repository does not currently include `@astrojs/check`, even though a `check` script exists. These issues remain relevant during the transition but do not justify carrying Astro into the target architecture.

## 5. Target system architecture

```text
Reader
  |
  v
docs.pify.dev on Vercel
  |
  +-- /en/* -- locale proxy adapter -- English GitBook publication
  |
  +-- /vi/* -- locale proxy adapter -- Vietnamese GitBook publication
  |
  +-- /      -- locale preference redirect

pifydev/docs (public content repository)
  |
  +-- content/en -- Git Sync project directory -- English space
  +-- content/vi -- Git Sync project directory -- Vietnamese space
  +-- source/zh  -- reference only, not published

pifydev/gitbook (public GPLv3 renderer fork)
  |
  +-- upstream GitBook renderer
  +-- Pify routing, locale, brand, and UI override layer
```

The separation is intentional:

- Content changes stay small and reviewable in `pifydev/docs`.
- Renderer changes inherit GitBook's GPLv3 license in a separate public repository.
- The landing page and documentation can deploy independently.
- A renderer update cannot silently rewrite source Markdown.

## 6. Content repository layout

The current Astro content will be normalized into GitBook project directories:

```text
pifydev/docs/
|-- content/
|   |-- en/
|   |   |-- .gitbook.yaml
|   |   |-- README.md
|   |   |-- SUMMARY.md
|   |   |-- quickstart.md
|   |   |-- ch01-overview.md
|   |   |-- how-to/
|   |   |-- reference/
|   |   `-- help/
|   `-- vi/
|       |-- .gitbook.yaml
|       |-- README.md
|       |-- SUMMARY.md
|       `-- ...matching pages...
|-- source/
|   `-- zh/
|       |-- README.md
|       `-- ch01-overview.md ... ch10-session.md
|-- scripts/
|-- GLOSSARY.md
|-- README.md
`-- CONTRIBUTING.md
```

Git Sync configuration:

- English space project directory: `content/en`
- Vietnamese space project directory: `content/vi`
- Each directory owns its own `.gitbook.yaml`, `README.md`, and `SUMMARY.md`.
- The two spaces are published as separate, unlisted GitBook sites so their origin URLs remain resolvable by the self-hosted renderer without creating duplicate search-engine results.
- The Mermaid integration is enabled for both spaces. Mermaid fences are migrated to the official GitBook Mermaid block representation when Git Sync requires it.

No Astro component imports remain in Markdown after migration. Content-specific presentation uses GitBook-supported Markdown and blocks.

## 7. Renderer fork and locale proxy

### 7.1 Fork policy

The renderer lives in a public repository, tentatively `pifydev/gitbook`, with:

- The upstream GPLv3 license and copyright notices preserved.
- An `upstream` remote pointing to `GitbookIO/gitbook`.
- Pify-specific code isolated under clearly named modules instead of scattered edits.
- A recorded upstream commit for every production release.
- Only free Font Awesome icons, matching the upstream self-hosting restriction.

The content repository retains its own content license; it is not automatically relicensed to GPLv3 merely because the renderer is GPLv3.

### 7.2 Request mapping contract

Upstream already recognizes an `X-GitBook-URL` request header before its other URL-resolution modes. The Pify adapter will build on that mechanism while correcting the public canonical URL.

| Public request | Content lookup |
| --- | --- |
| `/en/` | English origin root |
| `/en/ch03-agent-loop` | English origin `/ch03-agent-loop` |
| `/vi/` | Vietnamese origin root |
| `/vi/ch03-agent-loop` | Vietnamese origin `/ch03-agent-loop` |

The adapter must perform both operations below:

1. Resolve the matching GitBook publication using an origin URL stored in Vercel environment configuration.
2. Replace origin-facing canonical and base-path data with `https://docs.pify.dev/{locale}` before the renderer generates links, metadata, search results, sitemap entries, or redirects.

This avoids exposing `*.gitbook.io` links in navigation and avoids depending on GitBook's paid custom-domain feature.

Reserved upstream paths such as `~gitbook/search`, `~gitbook/icon`, image routes, Markdown routes, RSS, sitemap, and `llms.txt` remain scoped beneath the active locale and follow the same origin mapping.

### 7.3 Root behavior

`https://docs.pify.dev/` returns a temporary locale redirect:

1. Use the saved `pify-docs-locale` cookie when present.
2. Otherwise choose Vietnamese only when the browser's highest supported language is Vietnamese.
3. Otherwise use English.

The root never contains a third documentation home page. English is the `x-default` SEO locale.

## 8. Language switching

The header contains one compact control labeled `English` or `Tiếng Việt`.

Behavior:

- Switching locale preserves the page's translation key, not just its textual URL.
- `/en/ch04-model-invocation` maps to `/vi/ch04-model-invocation`.
- The selection updates the locale cookie and navigates immediately.
- Browser language detection is used only when no explicit preference exists.
- If a translation is temporarily missing, the unavailable language is disabled with a localized explanation instead of sending the reader to an unrelated home page.
- Keyboard navigation, focus state, `aria-label`, and screen-reader announcements are required.

Each page emits:

- Correct `<html lang="en">` or `<html lang="vi">`.
- A self-referencing canonical URL on `docs.pify.dev`.
- Reciprocal `hreflang="en"` and `hreflang="vi"` links when both pages exist.
- `hreflang="x-default"` pointing to English.

## 9. Translation and editorial model

### 9.1 Source hierarchy

Technical claims are checked in this order:

1. Official Pi documentation.
2. The referenced Pi source code and exported types.
3. The Chinese article retained under `source/zh`.

Chinese is a reference source, not an automatic authority when it conflicts with current official behavior.

### 9.2 Pairing model

Every published page has a stable `translation_key`. English and Vietnamese must share:

- Translation key and semantic slug.
- Navigation position and hierarchy.
- Heading intent and example order.
- Code-fence count and language identifiers, except for an explicitly documented content correction.
- Mermaid diagram identity and topology.
- Referenced APIs, commands, paths, and environment variables.

Chinese is excluded from mandatory published-page parity because it contains only the original home page and ten chapters.

### 9.3 Editorial rules

English:

- Rewrite literal translation into concise, idiomatic technical English.
- Prefer subject-verb sentences and concrete terms over noun chains.
- Remove promotional filler and unexplained metaphors.
- Use official Pi terminology and casing.

Vietnamese:

- Use fully accented, natural Vietnamese.
- Explain a retained English term on first use when it is not already familiar to the intended developer audience.
- Avoid word-for-word Chinese or English sentence order.
- Retain established product and API terms such as Agent, Tool, Provider, Session, Context, streaming, SDK, RPC, and TUI consistently according to `GLOSSARY.md`.

Both languages:

- Never translate identifiers, filenames, paths, commands, environment variables, JSON keys, or public API names.
- Translate user-facing prose inside diagrams and demonstrative snippets only when doing so cannot alter executable behavior.
- Keep executable examples valid and verify them when a runnable harness exists.
- Remove residual Chinese from published prose unless the page explicitly discusses a Chinese source phrase.
- Keep titles, descriptions, link text, image alt text, callouts, and table labels localized.

### 9.4 Review sequence

The 23 page pairs are reviewed in controlled batches:

1. Home, Quickstart, Glossary, FAQ, and Changelog.
2. Chapters 1 through 3.
3. Chapters 4 through 6.
4. Chapters 7 through 10.
5. Five how-to guides.
6. Three reference pages.

Each batch passes automated structural checks and a human-readable side-by-side diff before it is marked reviewed.

## 10. Visual system

The supplied logo pack is the sole source for the documentation identity.

| Use | Asset |
| --- | --- |
| Light header | `pify-logo-on-light.svg` |
| Dark header | `pify-logo-on-dark.svg` |
| Light favicon/app tile | `pify-logo-light-bg-rounded.svg` |
| Dark app tile | `pify-logo-dark-bg-rounded.svg` |
| Raster fallback | Matching 512px PNG variants |

The renderer copies these assets from the supplied pack into its tracked brand asset directory. SVG is preferred for interface rendering.

### 10.1 Color tokens

| Token | Light | Dark |
| --- | --- | --- |
| Page background | `#FFFFFF` | `#09090B` |
| Subtle surface | `#FAFAFA` | `#18181B` |
| Primary text | `#09090B` | `#FAFAFA` |
| Muted text | `#52525B` | `#A1A1AA` |
| Border | `#E4E4E7` | `#27272A` |
| Brand accent | `#6366F1` | `#818CF8` |

No gradients, decorative grids, glowing orbs, rainbow chapter colors, marketing statistics, or feature-pill clusters are used.

### 10.2 Typography and layout

- Use a self-hosted open-source sans-serif with strong Vietnamese coverage; Geist Sans and Geist Mono are the preferred pair, with system fallbacks.
- Track font license files in the renderer repository.
- Body copy is 16 to 18px with approximately 1.7 line height.
- Reading measure is capped near 72 characters, with a content column around 760px.
- Desktop layout uses a roughly 264px navigation column, the reading column, and a roughly 224px on-page table of contents.
- Page titles are strong but restrained; long pages use visible section rhythm instead of oversized headings.

### 10.3 Header

The sticky header is approximately 56px high and contains:

- Pify symbol plus the text `Pify Docs`.
- Search.
- GitHub source link.
- Light, dark, and system theme control.
- English/Vietnamese switcher.

The header avoids version badges and redundant decorative labels.

### 10.4 Documentation home

The home page is an entry point, not a landing-page hero. It contains:

- One concise description of the book.
- A primary Quickstart action and a secondary introduction action.
- A compact, grouped table of contents.
- Clear routes to chapters, how-to guides, and reference pages.

### 10.5 Content components

- Code blocks expose copy, optional filename, syntax highlighting, line wrapping control, and visible focus states.
- Callouts use one coherent icon set and localized labels, never emoji as structural icons.
- Active sidebar state uses the indigo accent without a heavy filled pill.
- Tables remain horizontally usable on small screens.
- Previous/next navigation uses translated page titles.
- The footer and page-action menu are fully localized.
- The 404 and upstream-error states are branded and localized.

### 10.6 Responsive and accessibility behavior

- At small widths the sidebar becomes a drawer and the on-page table of contents becomes a disclosure.
- Search and language selection remain available without opening multiple nested menus.
- All interactive controls work by keyboard and expose visible focus.
- Text and controls meet WCAG 2.2 AA contrast targets.
- Motion is subtle and disabled or reduced under `prefers-reduced-motion`.
- Content remains usable at 200% zoom and at a 320px viewport.

## 11. Search, metadata, and machine-readable docs

- Search executes against only the active locale's GitBook site.
- Search-result links are normalized back to `docs.pify.dev/{locale}`.
- Sitemap, RSS, Markdown, and `llms.txt` endpoints remain available per locale when upstream supplies them.
- The two GitBook origin sites are published as `unlisted`; `docs.pify.dev` is the indexable public surface.
- Open Graph titles, descriptions, locale metadata, and images use the active translation.
- The rounded Pify logo is used for favicon and app metadata; a dedicated social preview may be added later without blocking cutover.

## 12. Runtime, caching, and failure handling

The renderer is deployed as a Next.js application, not `output: export`.

- Vercel Preview deployments are created for renderer pull requests.
- Production uses `docs.pify.dev` only after preview acceptance.
- Public origin URLs are Vercel environment variables, separate for preview and production.
- Any API token that becomes necessary is server-only and stored in Vercel environment secrets.
- Static renderer responses use upstream caching and Vercel's CDN behavior.
- Locale routing is part of the cache key so English and Vietnamese responses cannot collide.

Failure behavior:

| Failure | Response |
| --- | --- |
| Unknown locale | Localized 404 with links to both documentation homes |
| Missing translated page | Keep current page; disable unavailable locale option |
| GitBook origin lookup failure | Branded 503, never a misleading permanent 404 |
| Stale cached page available | Serve stale content when the platform cache policy safely permits it |
| Invalid redirect from origin | Reject cross-origin or malformed target and log the event |
| Missing required environment variable | Fail deployment health check before domain promotion |

No secret, origin token, internal error object, or stack trace is rendered to readers.

## 13. CI and quality gates

### 13.1 Content repository

Pull requests must run:

- GitBook structure validation for both `.gitbook.yaml` and `SUMMARY.md` files.
- Exact EN/VI translation-key and slug parity.
- Frontmatter schema validation.
- Local link and asset validation.
- Code-fence and Mermaid structural comparison.
- Mermaid syntax validation and preview rendering.
- Residual Chinese detection in published prose with an explicit allowlist.
- Markdown linting.
- A smoke import or Git Sync preview for both project directories.

The old sync-check bugs are removed by matching numbered chapters with an anchored pattern such as `^ch\d{2}-`, and by comparing optional metadata only between files that define it.

### 13.2 Renderer repository

Pull requests must run:

- Upstream lint, typecheck, unit, and build tasks.
- Unit tests for public-to-origin path mapping and reserved routes.
- Unit tests for canonical URLs, `hreflang`, locale cookies, and root redirect behavior.
- Component tests for the language switcher and missing-translation state.
- Browser tests at desktop and mobile breakpoints.
- Light and dark visual-regression snapshots for the home page, a long chapter, search, a code-heavy page, 404, and 503.
- Accessibility checks for keyboard order, labels, landmarks, and contrast.

### 13.3 Production smoke checks

Before DNS promotion, verify at minimum:

- `/`, `/en/`, `/vi/`, one nested page per locale, and a nonexistent route.
- Page-aware switching in both directions.
- Search returns only the active language and opens public-domain URLs.
- Canonical, `hreflang`, sitemap, robots, and `llms.txt` output.
- Logo and favicon in both themes.
- Mobile navigation, code copy, table overflow, and reduced-motion behavior.
- No request navigates a reader to the GitBook origin hostname.

## 14. Deployment and cutover

### Phase A: content normalization

- Create `content/en`, `content/vi`, and `source/zh`.
- Convert Astro-specific MDX and frontmatter to GitBook-compatible Markdown.
- Create and validate both summaries and Git Sync configurations.
- Keep the existing Astro production deployment unchanged.

### Phase B: GitBook publications

- Connect the two project directories to separate GitBook spaces.
- Enable Mermaid for both spaces.
- Publish both origin sites as unlisted.
- Record their public origin URLs in Vercel Preview configuration.

### Phase C: renderer fork

- Create the public GPLv3 fork.
- Implement locale proxying, canonical correction, language switching, Pify branding, and localized UI.
- Keep the patch surface isolated and document the upstream rebase process.

### Phase D: editorial review

- Complete all six content batches.
- Block production promotion until all 23 EN/VI pairs reach reviewed status.
- Preview content through the actual self-hosted renderer, not only Markdown diffs.

### Phase E: preview acceptance

- Deploy the renderer to a Vercel Preview URL.
- Run automated and manual acceptance checks.
- Test DNS and domain behavior without replacing the current docs deployment.

### Phase F: production cutover

- Attach `docs.pify.dev` to the accepted Vercel project.
- Confirm TLS, redirects, canonical metadata, and production smoke tests.
- Add redirects from any controlled `pify.dev/docs/*` routes to matching `docs.pify.dev/*` routes.
- Keep the old GitHub Pages Astro site available for a short observation period, then replace it with redirect stubs or retire it only after traffic and inbound links are accounted for.

Rollback consists of detaching or reverting the documentation DNS target and restoring the previous production target while keeping both GitBook origin sites intact.

## 15. Operations and upstream maintenance

- Check upstream GitBook releases and security updates on a regular schedule.
- Rebase in a dedicated branch; never merge upstream directly into production.
- Run the complete renderer suite and visual snapshots before promotion.
- Maintain a short `PIFY_PATCHES.md` explaining every intentional divergence from upstream.
- Use Vercel runtime logs and deployment health checks for initial operations; add a paid monitoring service only if traffic or reliability requirements justify it.
- Treat an upstream content API incompatibility as a production incident because the renderer is coupled to GitBook's publishing platform.

## 16. Risks and mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Upstream renderer changes rapidly | Rebase conflicts or runtime breakage | Small Pify override layer, pinned releases, full preview suite |
| GitBook changes its content API or publication model | Self-hosted renderer may stop resolving content | Track upstream, retain rollback target, avoid unsupported API reimplementation |
| Origin URLs leak into links or metadata | Duplicate content and broken brand/domain continuity | Canonical/base-path adapter plus explicit browser and SEO tests |
| Two locales enter the same cache or search scope | Readers see mixed-language results | Locale-specific origin, path, cache key, and test fixtures |
| Editorial rewrite changes technical meaning | Incorrect documentation | Source hierarchy, glossary, structural checks, human side-by-side review |
| Mermaid blocks do not survive Git Sync | Missing diagrams | Official Mermaid integration, format conversion, preview-render gate |
| GPL obligations are overlooked | License noncompliance | Public renderer fork, preserved notices, documented source link |
| Vercel or GitBook origin is unavailable | Documentation outage | CDN caching where valid, branded 503, rollback procedure |

## 17. Acceptance criteria

The migration is complete only when:

- `docs.pify.dev/en/*` and `/vi/*` serve through the self-hosted Vercel renderer.
- The renderer fork is public and GPLv3 notices are preserved.
- All 23 English/Vietnamese page pairs are reviewed and pass structural validation.
- Chinese does not appear in the public language switcher or navigation.
- Search, navigation, canonical metadata, and language switching stay on `docs.pify.dev`.
- The supplied Pify logo variants render correctly in light and dark modes.
- The agreed clean editorial layout passes desktop, mobile, keyboard, contrast, and reduced-motion checks.
- Production smoke tests pass after domain attachment.
- A tested rollback path exists until the observation period ends.
- The prior Astro site is retired only after redirect coverage is confirmed.

## 18. References

- [GitBook open-source renderer](https://github.com/GitbookIO/gitbook)
- [Git Sync](https://gitbook.com/docs/getting-started/git-sync)
- [GitBook monorepo project directories](https://gitbook.com/docs/getting-started/git-sync/monorepos)
- [GitBook content configuration](https://gitbook.com/docs/getting-started/git-sync/content-configuration)
- [GitBook public and unlisted publishing](https://gitbook.com/docs/publishing-documentation/publish-a-docs-site/public-publishing)
- [GitBook Mermaid troubleshooting](https://gitbook.com/docs/help-center/integrations/existing-integrations/why-is-the-mermaid-block-not-loading)
- [Vercel Next.js deployment](https://vercel.com/docs/frameworks/full-stack/nextjs)
