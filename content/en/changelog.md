---
title: Changelog
description: Changes to the Pify documentation site, separate from the Pi SDK changelog.
translation_key: changelog
language: en
status: reviewed
reviewed_by: Pify maintainers
last_updated: '2026-08-24'
---
This page records changes to the Pify documentation site. For Pi releases, use the [upstream release history](https://github.com/earendil-works/pi/releases).

## 2026-08-24

- Added an automated bilingual editorial lint for residual Han characters, control characters, full-width punctuation, mojibake, known literal translations, and long Vietnamese prose without diacritics.
- Defined a canonical English/Vietnamese terminology contract and a review ledger pinned to a specific upstream Pi commit.
- Began the full editorial and technical review of all 23 English/Vietnamese page pairs.

## 2026-08-22

- Replaced the previous Astro and GitBook delivery experiments with a self-hosted Fumadocs application on Vercel.
- Added English and Vietnamese routing, localized navigation, search, SEO metadata, syntax highlighting, Mermaid rendering, and bilingual end-to-end tests.
- Published the Quickstart, Glossary, Changelog, five task-oriented How-to guides, API/configuration/environment reference pages, and FAQ.
- Added code-block titles and line highlighting through the Fumadocs renderer.
- Fixed localized documentation links so clean routes no longer expose `.md` filenames.
- Added the Pify logo, adaptive favicon, GPLv3 license, contribution guide, and deployment documentation.

## 2026-08-20

- Imported the first 10 English and Vietnamese chapters from the Pi Agent Book translation project; the original Chinese Pi Agent Book was the canonical source for that first translation.
- Added the initial documentation navigation and source-provenance records.
- Added a custom 404 page and generated sitemap.
