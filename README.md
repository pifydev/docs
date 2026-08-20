# Pi Docs — Pi Agent Book Translations

Multilingual translations of the [Pi Agent Book](https://www.dgzhuya.com/) — source-code reading notes for the [Pi Agent SDK](https://github.com/earendil-works/pi). Companion to the official [pi.dev](https://pi.dev) docs.

## Available Languages

| Language | Folder | Status |
|---|---|---|
| 中文 (canonical) | `zh/` | In progress |
| English | `en/` | In progress |
| Tiếng Việt | `vi/` | In progress |

## Tech Stack

- [mdBook](https://rust-lang.github.io/mdBook/) — generates static HTML sites from Markdown
- [mdbook-mermaid](https://github.com/badboy/mdbook-mermaid) — renders Mermaid diagrams to SVG
- GitHub Actions — CI/CD build & deploy to GitHub Pages
- PowerShell 7+ — validation scripts (cross-platform via `pwsh`)

## Repository Layout

```text
pi-docs/
- zh/, en/, vi/ — parallel mdBook projects (one per language)
- scripts/ — PowerShell validation + fetch scripts
- GLOSSARY.md — preserved technical terms (English-only)
- docs/superpowers/specs/ — design specs
- docs/superpowers/plans/ — implementation plans
```

## Local Development

Prerequisites: [`mdbook`](https://rust-lang.github.io/mdBook/), [`mdbook-mermaid`](https://github.com/badboy/mdbook-mermaid), and [`pwsh`](https://learn.microsoft.com/powershell/scripting/install/installing-powershell) (PowerShell 7+).

```powershell
# Build all three languages
pwsh scripts/build-all.ps1

# Serve one language locally for preview
cd en && mdbook serve --open
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT — see [LICENSE](LICENSE).

## References

- Original Chinese source: https://www.dgzhuya.com/
- Official Pi docs: https://pi.dev/docs/latest
- Pi source code: https://github.com/earendil-works/pi
