# Fumadocs on Vercel release record

## Cutover

- Released at: 2026-08-22 15:46 ICT
- Source commit: `eae21d52ec0d8b101cfff0d9e2725812e21aa2f7`
- Vercel project: `nguyen-van-hieps-projects/pify-docs`
- Deployment ID: `dpl_GAoUnh9NL4TXuX2WziFgJmAbjqwt`
- Immutable deployment URL: `https://pify-docs-if4j6xlw7-nguyen-van-hieps-projects.vercel.app`
- Production URL: `https://docs.pify.dev`
- Runtime: Node.js 22, Next.js, `npm ci`, `npm run build`
- Domain status: active on the Vercel edge; `docs.pify.dev` resolves by CNAME to Vercel

## Verification

- Vercel generated all 55 application and machine-readable routes.
- All 46 sitemap documentation URLs returned HTTP 200 with matching canonical URLs and `en`, `vi`, and `x-default` alternates.
- Locale routing, locale-scoped search, robots, sitemap, LLM text endpoints, and unsupported-locale 404 behavior passed production smoke tests.
- GitHub Actions `Content Quality` and `Next.js Application Build` completed successfully for the source commit.

## Rollback

The annotated tag `astro-starlight-final` points to commit
`1d6a091124935112885b8f63311f238f265d6881`, the final Astro/Starlight state
before this cutover. Roll back by deploying that tag as a new Vercel production
deployment; do not rewrite `main`.

## Follow-up

The production deployment was created with the authenticated Vercel CLI. Vercel
could not connect the GitHub repository because its GitHub App does not currently
have access to `pifydev/docs`. Grant the Vercel GitHub App access to that repository,
then run:

```powershell
npx vercel@50.37.3 git connect https://github.com/pifydev/docs --yes
```

Until that permission is granted, releases can still be deployed safely from the
linked project with `npx vercel@50.37.3 deploy --prod --yes`.
