# Contributing to Pify Docs

Pify Docs publishes paired English and Vietnamese documentation for the Pi Agent
SDK. Keep changes technically accurate, concise, and consistent across both
public locales.

## What to edit

- English pages live in `content/en/`.
- Vietnamese pages live in `content/vi/`.
- `content/translation-manifest.json` pairs equivalent pages.
- Locale `meta.json` files define sidebar labels and page order.
- `source/zh/` is internal provenance for the original translated chapters. It
  is not a public locale and must not be added to routing or navigation.
- `GLOSSARY.md` records technical terms that stay in English.

Use a pull request for contributions. Small wording corrections should stay
focused. Larger translation or application changes should explain the affected
routes and include the relevant validation output.

## Authoring workflow

1. Find the page pair in `content/translation-manifest.json`.
2. Edit the matching file under `content/en/` or `content/vi/`.
3. Preserve `translation_key` and `language` frontmatter.
4. Keep the heading hierarchy, code-fence languages, code samples, and Mermaid
   structure aligned with the paired page.
5. Update both pages when a structural change affects navigation or examples.
6. Update the relevant `meta.json` when adding, removing, or reordering a page.
7. Run the local quality gate and open a pull request.

For a new public page, create both locale files and add one unique manifest
entry. The English and Vietnamese paths should remain identical unless there is
a documented routing reason not to do so.

## Frontmatter

Every public page needs at least:

```yaml
---
title: Build your first Pi agent
description: A short, concrete summary for navigation and search.
translation_key: quickstart
language: en
---
```

Numbered chapters also retain their translation provenance and validation
metadata:

```yaml
---
title: "Chapter 1: Introduction: Why Pi-Agent Is Worth Your Time"
translation_key: ch01-overview
language: en
chapter: 1
source_url: https://www.dgzhuya.com/modules/ch01-overview
status: translated
last_updated: "2026-08-20"
translator: pi-docs-bot
reviewed_by: null
code_blocks: 8
code_lines: 89
mermaid_blocks: 1
---
```

Do not add a level-one Markdown heading to the body. The documentation layout
renders the frontmatter title as the page heading.

## Translation style

1. Do not translate code, API names, file paths, package names, environment
   variables, or configuration keys.
2. Define unfamiliar terminology on first use, then use the same term
   consistently. Follow `GLOSSARY.md` for preserved English terms.
3. Translate code comments only when that improves understanding. Never change
   identifiers while translating prose.
4. Keep links and source references intact unless the target is obsolete.
5. Preserve table shape, code-fence language, Mermaid structure, and heading
   depth across the pair.
6. Prefer short, direct technical sentences. Remove filler, promotional claims,
   emojis, and unnecessary repetition.
7. Use natural English and Vietnamese. Do not mirror source-language word order
   when it makes the result harder to read.

When the prose and the current Pi source disagree, treat the current source code
and official Pi documentation as authoritative and note the correction in the
pull request.

## Local validation

Use Node.js 22 and npm:

```bash
npm ci
npm run test:content
npm run test:unit
npm run lint
npm run typecheck
npm run build
```

The individual content checks are also available:

- `npm run lint:sync` compares all 23 public EN/VI page pairs.
- `npm run lint:frontmatter` validates all 46 public files.
- `npm run lint:content` checks the manifest, navigation, links, headings, and
  retired authoring syntax.
- `npm run lint:mermaid` validates every public Mermaid block.
- `npm run lint:app` runs the Next.js ESLint rules.

For UI changes, run the browser suite after installing Chromium:

```bash
npx playwright install chromium
npm run test:e2e
```

Pull requests receive a Vercel Preview deployment. Check both locales, desktop
and mobile layouts, light and dark themes, search, and any changed content
primitives before requesting review.

## Reporting issues

Include the affected public URL, locale, file path, expected behavior, actual
behavior, and a minimal reproduction when possible. For translation mismatches,
link both files in the pair.

## License

Contributions are licensed under the repository's GNU General Public License
v3.0 only (`GPL-3.0-only`).
