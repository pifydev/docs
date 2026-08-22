# Pify Docs: Fumadocs and Vercel Migration

## Context

Pify Docs currently contains three overlapping delivery models: the retained
Astro/Starlight site, GitBook-oriented English and Vietnamese content trees, and
a separate fork of the GitBook renderer. The GitBook route requires two external
published sites before the renderer can start, which adds operational steps that
do not serve the documentation itself.

The replacement will use one repository, one content source, and one Vercel
project. `pifydev/docs` will become a Next.js application using Fumadocs UI and
Fumadocs MDX. GitBook will no longer be part of authoring, rendering, search, or
deployment.

## Goals

- Publish English and Vietnamese documentation at `https://docs.pify.dev`.
- Preserve locale-prefixed URLs such as `/en/ch01-overview` and
  `/vi/ch01-overview`.
- Provide a clean, highly readable documentation interface with first-class
  mobile behavior, dark mode, navigation, table of contents, and search.
- Keep Markdown in Git as the canonical content source.
- Deploy Preview and Production builds directly from `pifydev/docs` on Vercel.
- Remove external GitBook publication and origin URL requirements.

## Non-goals

- Hosting or reproducing the GitBook editor, API, or renderer.
- Publishing Chinese documentation. `source/zh` remains internal translation
  provenance and is never registered as a public locale.
- Changing the `pify.dev` landing page or apex DNS records.
- Changing the repository license from MIT.
- Deleting or archiving `pifydev/gitbook`; it simply stops being a production
  dependency.

## Chosen approach

The migration is performed in place in `pifydev/docs`. A parallel application or
another renderer repository would preserve the same coordination burden that the
migration is intended to remove. The repository history and an annotated
pre-migration tag provide rollback without keeping two active frontend stacks.

The runtime uses the normal Next.js deployment model on Vercel. Documentation
pages are generated from local MDX and prerendered where possible. The search
route remains server-capable so built-in multilingual search does not require an
external search vendor.

## Application architecture

```text
docs.pify.dev
    |
    +-- Vercel project: pify-docs
            |
            +-- Next.js App Router
            |     +-- /                     locale redirect
            |     +-- /[lang]/[[...slug]]  Fumadocs pages
            |     +-- /api/search          multilingual search
            |     +-- /sitemap.xml
            |     +-- /robots.txt
            |
            +-- Fumadocs UI
            +-- Fumadocs MDX
            +-- content/
                  +-- en/
                  +-- vi/
                  +-- translation-manifest.json
```

### Framework and runtime

- Next.js App Router is the only application framework.
- Fumadocs UI provides the docs layout primitives.
- Fumadocs MDX compiles local Markdown and MDX into type-safe page data.
- Node.js 22 is used locally, in GitHub Actions, and on Vercel.
- npm remains the package manager and `package-lock.json` remains authoritative.
- TypeScript strict mode is enabled.

Astro, Starlight, `astro-mermaid`, Astro components, and Astro configuration are
removed after the Fumadocs route and content parity tests pass.

## Content model

`content/en` and `content/vi` remain the canonical public content directories.
Fumadocs uses directory-based locale parsing with `en` as the default language
and `vi` as the second language.

For each locale:

- `README.md` becomes `index.mdx` so the locale root is a real page.
- `SUMMARY.md` is replaced by Fumadocs `meta.json` navigation files.
- `.gitbook.yaml` is removed.
- Existing Markdown pages keep their current relative paths and slugs.
- GitBook-only syntax is rejected by validation.

`content/translation-manifest.json` continues to pair equivalent English and
Vietnamese routes. It drives parity checks, language-switch targets, `hreflang`
metadata, and tests that prevent a locale from silently losing a page.

The migration does not expose `source/zh`. The source directory remains available
to translation maintainers, while public loaders, navigation, sitemap, search,
and metadata accept only `en` and `vi`.

## Routing and locale behavior

- `/en` and `/vi` are the two locale roots.
- All documentation pages retain their existing locale-prefixed slugs.
- `/` redirects to the locale cookie when valid, otherwise to Vietnamese when
  the browser prefers Vietnamese, otherwise to English.
- The language switcher retains the current paired page. If a route is not in
  the translation manifest, it falls back to the target locale root.
- Unsupported locale prefixes return a real 404 and never expose Chinese pages.
- Trailing-slash handling is consistent and produces one canonical URL per page.

Fumadocs i18n is configured with visible locale prefixes for both languages.
Hiding the default prefix is not used because explicit `/en` and `/vi` URLs make
language switching, caching, analytics, and SEO deterministic.

## Visual system

The interface is documentation-first rather than a marketing landing page.

### Layout

- A compact top bar contains the Pify logo, search trigger, English/Vietnamese
  switcher, theme control, and GitHub link.
- Desktop uses a three-column reading layout: navigation sidebar, main article,
  and on-page table of contents.
- Article measure stays between 720 and 780 pixels for long-form readability.
- Mobile collapses navigation and table of contents into accessible drawers
  without horizontal document scrolling.
- Locale home pages provide a short introduction and direct navigation into the
  quickstart, concepts, how-to guides, and reference sections.

### Typography and color

- Existing local Geist and Geist Mono assets are reused.
- Body copy uses calm line height and restrained heading scale.
- Surfaces are neutral and flat with thin borders; gradients, glass effects,
  oversized shadows, and nested cards are not used.
- A single Pify blue accent is reserved for links, focus, active navigation, and
  selected controls.
- Light and dark themes meet WCAG AA contrast for text and interactive states.

### Content rendering

- Code blocks provide copy controls and use Geist Mono.
- Mermaid diagrams render from fenced blocks without requiring a browser during
  page requests.
- Tables remain scrollable on small screens.
- Heading anchors, callouts, steps, tabs, and link cards use Fumadocs primitives
  with Pify styling rather than custom incompatible MDX components.

## Search

The built-in Fumadocs search endpoint indexes both locales from the same local
source. The active locale is supplied to the client so English searches do not
mix Vietnamese results and vice versa. Search results always use public
`docs.pify.dev` locale URLs.

The initial release does not add Algolia, AI answers, or another paid search
service.

## SEO and machine-readable surfaces

Every public page emits:

- a self-referencing canonical URL on `https://docs.pify.dev`;
- `hreflang` entries for `en`, `vi`, and `x-default` when a paired page exists;
- localized title, description, Open Graph, and Twitter metadata;
- a stable sitemap entry.

`robots.txt`, `sitemap.xml`, localized `llms.txt` files, favicon, and social image
are generated from the same application. No metadata or navigation link points
to GitBook or the old GitHub Pages hostname.

## Deployment

The existing Vercel project `pify-docs` is reused because it has no Preview or
Production deployment to preserve.

Its settings become:

| Setting | Value |
| --- | --- |
| Git repository | `pifydev/docs` |
| Production branch | `main` |
| Root directory | repository root |
| Framework | Next.js |
| Node.js | 22.x |
| Install command | `npm ci` |
| Build command | `npm run build` |
| Output directory | Next.js default |

Pull requests create Preview deployments. Production deployment occurs from an
accepted commit on `main`. `docs.pify.dev` is attached only after the generated
Production hostname passes route, search, metadata, responsive, and locale smoke
tests. Only the `docs` DNS record may be changed; apex, mail, and landing-page
records remain untouched.

No GitBook environment variables are created. Any stale
`PIFY_GITBOOK_*_ORIGIN` variables are removed before Production deployment.

## CI and quality gates

The existing workflow cleanup remains conceptually intact but changes commands
for the new stack:

1. install dependencies with `npm ci`;
2. validate bilingual content and the translation manifest;
3. validate Markdown, links, frontmatter, and Mermaid blocks;
4. run unit tests;
5. run TypeScript and lint checks;
6. run the Next.js production build.

After the annotated rollback tag is created, `.github/workflows/deploy.yml` stops
building Astro and becomes a Next.js application build workflow. Vercel becomes
the only deployment system; GitHub Actions validates but does not deploy
production.

## Testing and acceptance

### Automated tests

- Every manifest entry resolves to one English and one Vietnamese page.
- Route generation preserves all current English and Vietnamese slugs.
- Root locale selection covers cookie, Vietnamese browser preference, and default
  English behavior.
- Language switching preserves paired paths.
- Public loaders reject `zh`.
- Search results are locale-scoped.
- Canonical and alternate metadata use `docs.pify.dev`.
- The content and application build workflows parse and execute their required
  commands.
- Next.js typecheck, lint, and production build complete without errors.

### Browser journeys

- Open `/`, `/en`, `/vi`, and representative concept, how-to, and reference
  pages.
- Switch language from the same page in both directions.
- Search in English and Vietnamese and open a result.
- Navigate with desktop sidebar, mobile drawer, keyboard, and visible focus.
- Toggle light and dark themes without layout shift.
- Confirm code, Mermaid, tables, headings, previous/next links, and 404 rendering.

### Production acceptance

- Vercel reports the deployed source SHA expected from `main`.
- `docs.pify.dev` resolves to the exact Vercel-issued DNS target with valid TLS.
- Public pages and machine-readable endpoints return 200.
- No final URL, canonical, alternate, search result, or navigation item references
  GitBook or GitHub Pages.
- No Chinese route is publicly reachable.

## Rollback

Before removing Astro, create the annotated tag `astro-starlight-final`. If the
Fumadocs Preview fails acceptance, do not attach the domain. If Production fails
after cutover, redeploy the last healthy Vercel deployment or temporarily deploy
the tagged Astro source from a recovery branch while the Fumadocs issue is fixed.

Rollback never requires force-pushing `main` or modifying unrelated DNS records.

## References

- [Fumadocs MDX](https://www.fumadocs.dev/docs/mdx)
- [Fumadocs Next.js internationalization](https://www.fumadocs.dev/docs/internationalization/next)
- [Fumadocs page and i18n conventions](https://www.fumadocs.dev/docs/page-conventions)
- [Fumadocs static and server deployment](https://www.fumadocs.dev/docs/deploying/static)
