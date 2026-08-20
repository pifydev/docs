# Pify Agent Book

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="src/assets/logo-dark-bg.svg">
    <img src="src/assets/logo-light-bg.svg" alt="Pify Agent Book" width="160">
  </picture>
</p>

Translations of the [Pi Agent Book](https://www.dgzhuya.com/) source-code reading notes. This site covers the [Pi Agent SDK](https://github.com/earendil-works/pi); Chinese is the canonical source. See also the [pi.dev](https://pi.dev) docs.

## Available Languages

| Language | Folder | Status |
|---|---|---|
| 中文 (canonical) | `src/content/docs/zh/` | In progress |
| English | `src/content/docs/en/` | In progress |
| Tiếng Việt | `src/content/docs/vi/` | In progress |

## Tech Stack

- [Astro 7](https://astro.build/): static-site generator
- [Starlight](https://starlight.astro.build/): documentation integration with built-in i18n
- [astro-mermaid](https://github.com/lin-stephanie/astro-mermaid): renders Mermaid diagrams to SVG
- Node 24: validation scripts and build
- GitHub Actions: CI/CD build and deploy to GitHub Pages

## Repository Layout

```text
pi-docs/
- src/content/docs/{zh,en,vi}/: chapters (one folder per language)
- src/content.config.ts: Zod schema for chapter frontmatter
- src/styles/custom.css: Starlight theme overrides
- src/components/Hero.astro: homepage hero
- scripts/: Node validation scripts (validate-frontmatter, sync-check, validate-mermaid, build)
- public/: static assets (favicon, OG image)
- GLOSSARY.md: preserved technical terms (English-only)
- docs/superpowers/specs/: design specs
- docs/superpowers/plans/: implementation plans
```

## Local Development

Prerequisites: [Node 24+](https://nodejs.org/) and [npm](https://www.npmjs.com/).

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Build the site
npm run build

# Run validation
npm run lint
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT: see [LICENSE](LICENSE).

## References

- Original Chinese source: https://www.dgzhuya.com/
- Official Pi docs: https://pi.dev/docs/latest
- Pi source code: https://github.com/earendil-works/pi
