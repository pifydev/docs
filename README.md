# Pify Agent Book

English and Vietnamese source-code reading notes and practical guides for the
[Pi Agent SDK](https://github.com/earendil-works/pi).

- English: [docs.pify.dev/en](https://docs.pify.dev/en)
- Tiếng Việt: [docs.pify.dev/vi](https://docs.pify.dev/vi)

## Stack

- Next.js App Router
- Fumadocs UI, Core, and MDX
- TypeScript and Tailwind CSS
- Local Geist and Geist Mono fonts
- Vercel for Preview and Production deployments
- GitHub Actions for read-only validation

The supported runtime is Node.js 22 and npm. `package-lock.json` is the
authoritative dependency lockfile.

## Repository layout

```text
app/                         Next.js routes, metadata, search, and LLM endpoints
components/                  Pify and MDX presentation components
content/en/                  Public English documentation
content/vi/                  Public Vietnamese documentation
content/translation-manifest.json
                             Stable EN/VI page pairing
lib/                         Locale, routing, source, and SEO helpers
public/                      Logo, social image, favicon, and local fonts
scripts/                     Content and CI validation
source/zh/                   Internal translation provenance, never published
tests/                       Unit and browser journeys
```

Only `en` and `vi` are public locales. Every public page must be present in both
locale directories and registered in `content/translation-manifest.json`.
Navigation order is defined by the locale-specific `meta.json` files.

## Local development

```bash
npm ci
npm run dev
```

Open `http://localhost:3000`. The root route selects English or Vietnamese from
the locale cookie and browser language. You can also open `/en` or `/vi`
directly.

Run the complete local quality gate before requesting review:

```bash
npm run test:content
npm run test:unit
npm run lint
npm run typecheck
npm run build
```

Browser tests require Chromium once:

```bash
npx playwright install chromium
npm run test:e2e
```

## Deployment

Vercel builds the Next.js application from the repository root. Branches and
pull requests receive Preview deployments; `main` is the Production branch.
GitHub Actions validates the same source with Node.js 22 but does not deploy it.

The canonical origin is `https://docs.pify.dev`. The application also publishes
localized search, `/sitemap.xml`, `/robots.txt`, `/en/llms.txt`,
`/vi/llms.txt`, and the corresponding `llms-full.txt` files.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the authoring and translation rules.

## License

MIT. See [LICENSE](LICENSE).

## References

- Original Chinese source: https://www.dgzhuya.com/
- Official Pi documentation: https://pi.dev/docs/latest
- Pi source code: https://github.com/earendil-works/pi
