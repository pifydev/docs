<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="public/pify-on-dark-128.png">
    <source media="(prefers-color-scheme: light)" srcset="public/pify-on-light-128.png">
    <img src="public/pify-on-light-128.png" width="96" height="96" alt="Pify logo">
  </picture>
</p>

<h1 align="center">Pify Agent Book</h1>

<p align="center">
  An English–Vietnamese reading companion and practical handbook for the
  <a href="https://github.com/earendil-works/pi">Pi Agent SDK</a>.
</p>

<p align="center">
  <a href="https://docs.pify.dev/en"><strong>Read in English</strong></a>
  ·
  <a href="https://docs.pify.dev/vi"><strong>Đọc bằng Tiếng Việt</strong></a>
</p>

<p align="center">
  <a href="https://github.com/pifydev/docs/actions/workflows/deploy.yml"><img src="https://github.com/pifydev/docs/actions/workflows/deploy.yml/badge.svg?branch=main" alt="Next.js application build"></a>
  <a href="https://github.com/pifydev/docs/actions/workflows/content-quality.yml"><img src="https://github.com/pifydev/docs/actions/workflows/content-quality.yml/badge.svg?branch=main" alt="Content quality"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-GPL--3.0--only-111827" alt="GNU GPL v3.0 only"></a>
</p>

Pify Agent Book turns source-code reading notes into a navigable set of
tutorials, architecture chapters, task-oriented guides, and API references. The
site publishes only English and Vietnamese; both editions share the same
structure and are reviewed as one documentation set.

This is a community-maintained learning resource. For authoritative product
behavior, cross-check the [official Pi documentation](https://pi.dev/docs/latest)
and [Pi source code](https://github.com/earendil-works/pi).

## What is included

- Eleven Pi SDK chapters covering architecture, runtime behavior, and the Agent
  Loop. Chapter 11 focuses on testing and evaluation.
- A ten-minute quickstart and eight How-to guides, including
  [Test an agent deterministically](https://docs.pify.dev/en/how-to/test-agent-deterministically),
  [Run Pi evaluations](https://docs.pify.dev/en/how-to/run-pi-evals), and
  [Host a session runtime](https://docs.pify.dev/en/how-to/host-session-runtime).
- A separate overview and 15-checkpoint Build Your Own Pi-style Agent course,
  paired with a runnable offline TypeScript workshop.
- API, configuration, and environment-variable references.
- A glossary, FAQ, changelog, Mermaid diagrams, and runnable code examples.
- 43 synchronized English/Vietnamese page pairs: 86 public documents.
- Locale-aware navigation and search, dark and light themes, responsive layouts,
  canonical metadata, sitemap, robots, and LLM-friendly text endpoints.

## Technology

| Area                   | Implementation                                                              |
| ---------------------- | --------------------------------------------------------------------------- |
| Application            | Next.js App Router, React, and TypeScript                                   |
| Documentation          | Fumadocs UI, Core, and MDX                                                  |
| Styling                | Tailwind CSS with local Geist and Geist Mono fonts                          |
| Search                 | Fumadocs server search scoped by locale                                     |
| Testing                | Node test runner, Vitest, Playwright, ESLint, and custom content validators |
| Delivery               | Vercel Preview and Production deployments                                   |
| Continuous integration | GitHub Actions on Node.js 22                                                |

Node.js 22 and npm are the supported development environment.
`package-lock.json` is the authoritative dependency lockfile.

## Quick start

```bash
git clone https://github.com/pifydev/docs.git
cd docs
npm ci
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The root route selects
English or Vietnamese using the locale cookie and browser language. Open
`/en` or `/vi` to select a locale explicitly.

No environment variables are required for local development.

## Repository structure

```text
app/                         Routes, metadata, search, and LLM endpoints
components/                  Pify layout and MDX presentation components
content/en/                  Public English documentation
content/vi/                  Public Vietnamese documentation
content/translation-manifest.json
                             Stable English/Vietnamese page pairing
course/                      Offline TypeScript workshop and checkpoint tests
lib/                         Locale, routing, source, and SEO helpers
public/                      Brand assets, social image, favicon, and fonts
scripts/                     Content and CI validators
source/zh/                   Internal translation provenance; never published
tests/                       Unit, route, SEO, and browser journeys
```

Only `en` and `vi` are public locales. Public pages are paired in
`content/translation-manifest.json`; locale-specific `meta.json` files control
sidebar labels and order. The files under `source/zh/` preserve translation
provenance and must not be exposed as a third locale.

## Authoring content

For an existing page:

1. Find its pair in `content/translation-manifest.json`.
2. Edit the matching file in `content/en/` or `content/vi/`.
3. Preserve `translation_key`, `language`, code fences, and heading structure.
4. Update both editions when navigation, examples, or document structure change.
5. Run the quality gate before opening a pull request.

New public pages require both locale files, one unique manifest entry, and the
corresponding navigation entries. See [CONTRIBUTING.md](CONTRIBUTING.md) for the
frontmatter schema, translation style, and review checklist.

## Validation

Browser journeys require Chromium once:

```bash
npx playwright install chromium
```

Run the complete local gate:

```bash
npm run quality:content
npm run typecheck
npm run build
npm run format:check
npm run test:e2e
git diff --check
```

The main commands are:

| Command                                                                        | Purpose                                                                           |
| ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| `npm run quality:content`                                                      | Run content, preservation, editorial, unit, course, release, eval, and lint gates |
| `npm run test:content`                                                         | Validate locale pairs, frontmatter, CI config, and migration invariants           |
| `npm run test:unit`                                                            | Test routes, locale behavior, and SEO helpers                                     |
| `npm run test:course`                                                          | Run all 15 offline workshop checkpoints                                           |
| `npm run test:course:checkpoint -- course/test/04-deterministic-model.test.ts` | Run one workshop checkpoint                                                       |
| `npm run lint`                                                                 | Run synchronization, content, Mermaid, and application linting                    |
| `npm run typecheck`                                                            | Generate Next.js route types and run TypeScript                                   |
| `npm run build`                                                                | Create the optimized production build                                             |
| `npm run format:check`                                                         | Check maintained files with Prettier                                              |

## Deployment

The Vercel project is connected to `pifydev/docs` at the repository root:

- Pull requests and non-production branches receive Preview deployments.
- Pushes to `main` create Production deployments for
  [docs.pify.dev](https://docs.pify.dev).
- GitHub Actions independently validates content and the Next.js production
  build; workflows do not hold deployment credentials.

The application publishes `/sitemap.xml`, `/robots.txt`, localized search,
`/[lang]/llms.txt`, and `/[lang]/llms-full.txt`. The current cutover record and
rollback procedure are documented in
[docs/operations/2026-08-22-fumadocs-vercel-release.md](docs/operations/2026-08-22-fumadocs-vercel-release.md).

## Contributing

Issues and pull requests are welcome. Use
[GitHub Issues](https://github.com/pifydev/docs/issues) for content defects,
translation mismatches, or application bugs. Include the affected URL and
locale whenever possible.

Read [CONTRIBUTING.md](CONTRIBUTING.md) before submitting changes.

## License

This repository is licensed under the
[GNU General Public License v3.0 only](LICENSE). Contributions are accepted under
the same license unless a file states otherwise.

## Sources and attribution

- Original Chinese book: [dgzhuya.com](https://www.dgzhuya.com/)
- Official Pi documentation: [pi.dev/docs/latest](https://pi.dev/docs/latest)
- Pi source code: [earendil-works/pi](https://github.com/earendil-works/pi)
- Pedagogical research reference: [hahhforest/pi-textbook](https://github.com/hahhforest/pi-textbook), consulted at commit `20dd3a7d791c2470a87c5172aa0729c3963a6b18`.
