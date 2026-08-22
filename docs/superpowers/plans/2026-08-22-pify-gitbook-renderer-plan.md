# Pify GitBook Renderer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tạo public GPLv3 fork của GitBook renderer, phục vụ hai origin GitBook tại `docs.pify.dev/en` và `/vi` với Pify branding, locale switch, canonical metadata và giao diện editorial sạch.

**Architecture:** Một locale proxy adapter đứng trước URL lookup hiện có, ánh xạ public path sang hai unlisted GitBook origins nhưng thay linker/canonical trở lại public domain. Pify-specific modules nằm trong `packages/gitbook/src/lib/pify` và `packages/gitbook/src/components/Pify`; upstream components chỉ có các điểm nối nhỏ, có test bảo vệ.

**Tech Stack:** GitBook Open, Next.js 16, React 19, TypeScript, Bun 1.3, Tailwind CSS 4, Playwright, Vercel runtime, GPLv3, Geist Sans/Mono.

---

## Dependency and repository boundary

- Bắt đầu sau khi hai unlisted origin sites của content-foundation plan hoạt động.
- Thực hiện trong public repository `pifydev/gitbook`, không phải `pifydev/docs`.
- Tạo isolated worktree bằng `superpowers:using-git-worktrees` khi bắt đầu execution.
- Baseline upstream được pin bằng commit SHA tại thời điểm fork; plan này đã khảo sát upstream commit `49c993f`, nhưng executor phải ghi SHA thực tế vào `PIFY_PATCHES.md`.
- Không sửa API client hoặc tự triển khai backend GitBook.

## File map

| File | Responsibility |
| --- | --- |
| `packages/gitbook/src/lib/pify/config.ts` | Validate Pify environment configuration |
| `packages/gitbook/src/lib/pify/routing.ts` | Pure locale selection, path mapping and canonical helpers |
| `packages/gitbook/src/lib/pify/routing.test.ts` | Routing and SEO URL contract tests |
| `packages/gitbook/src/components/Pify/PifyLocaleSwitch.tsx` | Accessible EN/VI switcher and locale cookie |
| `packages/gitbook/src/components/Pify/PifyHeaderActions.tsx` | GitHub, theme and locale controls |
| `packages/gitbook/src/components/Pify/PifyLogo.tsx` | Theme-aware supplied logo and wordmark |
| `packages/gitbook/src/components/Pify/pify.css` | Scoped brand tokens and editorial layout |
| `packages/gitbook/public/pify/**` | Logo and self-hosted Geist assets |
| `packages/gitbook/src/middleware.ts` | Integrate Pify route mapping before and after upstream lookup |
| `packages/gitbook/src/lib/context.ts` | Preserve public URL while fetching origin content |
| `packages/gitbook/src/components/SitePage/SitePage.tsx` | Canonical and `hreflang` metadata |
| `packages/gitbook/e2e/pify.spec.ts` | Desktop, mobile, language and SEO acceptance |
| `PIFY_PATCHES.md` | Upstream divergence and rebase notes |

### Task 1: Create and verify the public fork baseline

**Files:**
- Modify: `README.md`
- Create: `PIFY_PATCHES.md`

- [ ] **Step 1: Fork, clone and register upstream**

Create public GitHub fork `pifydev/gitbook`, then run:

```powershell
git clone https://github.com/pifydev/gitbook.git E:\project\pify-gitbook
Set-Location E:\project\pify-gitbook
git remote add upstream https://github.com/GitbookIO/gitbook.git
git remote -v
git rev-parse HEAD
```

Expected: public `origin`, official `upstream`, and unchanged GPLv3 `LICENSE`.

- [ ] **Step 2: Verify the untouched upstream baseline**

```powershell
bun install --frozen-lockfile
bun run format:check
bun run lint
bun run typecheck
bun run unit
bun run build
```

Expected: all commands exit 0 before Pify changes begin.

- [ ] **Step 3: Declare the fork in README**

Insert near the top of `README.md`:

```markdown
## Pify renderer fork

This public GPLv3 fork renders the documentation published at `https://docs.pify.dev`. The content lives in `https://github.com/pifydev/docs`; this repository contains only the renderer and Pify-specific presentation and routing changes.

Upstream: `https://github.com/GitbookIO/gitbook`
```

- [ ] **Step 4: Create the patch ledger**

Create `PIFY_PATCHES.md`:

```markdown
# Pify patches

| Area | Pify module | Upstream integration point | Reason |
| --- | --- | --- | --- |
| Locale proxy | `src/lib/pify/routing.ts` | `src/middleware.ts` | Map `/en` and `/vi` to separate GitBook origins |
| Public linker | `src/lib/context.ts` | URL-derived site context | Keep navigation and metadata on `docs.pify.dev` |
| Language switch | `src/components/Pify` | Header and mobile sidebar | Switch matching paths across independent spaces |
| Brand system | `src/components/Pify/pify.css` | Root layout | Apply Pify logo, typography and indigo tokens |
| SEO | `src/components/SitePage/SitePage.tsx` | Metadata generation | Emit EN/VI and x-default alternates |
| Errors | `src/lib/pify/error-response.ts` | Middleware error boundary | Return localized safe 404/503 pages |

Every production release records the exact upstream commit and Pify commit deployed to Vercel.
```

- [ ] **Step 5: Commit baseline documentation**

```powershell
git add README.md PIFY_PATCHES.md
git commit -m "docs: declare Pify GPLv3 renderer fork"
```

### Task 2: Add environment validation and pure route mapping

**Files:**
- Create: `packages/gitbook/src/lib/pify/config.ts`
- Create: `packages/gitbook/src/lib/pify/routing.ts`
- Create: `packages/gitbook/src/lib/pify/routing.test.ts`
- Create: `packages/gitbook/src/lib/pify/index.ts`

- [ ] **Step 1: Write failing routing tests**

Create `packages/gitbook/src/lib/pify/routing.test.ts`:

```ts
import { describe, expect, it } from 'bun:test';
import {
    alternateLocaleURL,
    mapPifyRequest,
    pickPreferredLocale,
    type PifyRoutingConfig,
} from './routing';

const config: PifyRoutingConfig = {
    enabled: true,
    canonicalOrigin: 'https://docs.pify.dev',
    origins: {
        en: 'https://pify.gitbook.io/docs-en',
        vi: 'https://pify.gitbook.io/docs-vi',
    },
};

describe('mapPifyRequest', () => {
    it('maps English content without leaking the origin path', () => {
        expect(mapPifyRequest(new URL('https://docs.pify.dev/en/ch03-agent-loop?x=1'), config)).toEqual({
            kind: 'content',
            locale: 'en',
            lookupURL: 'https://pify.gitbook.io/docs-en/ch03-agent-loop?x=1',
            originBaseURL: 'https://pify.gitbook.io/docs-en',
            publicBaseURL: 'https://docs.pify.dev/en',
            canonicalURL: 'https://docs.pify.dev/en/ch03-agent-loop',
        });
    });

    it('maps localized GitBook service routes', () => {
        expect(mapPifyRequest(new URL('https://preview.vercel.app/vi/~gitbook/search'), config)).toMatchObject({
            kind: 'content',
            locale: 'vi',
            lookupURL: 'https://pify.gitbook.io/docs-vi/~gitbook/search',
        });
    });

    it('redirects root, rejects unsupported locale and preserves upstream development routes', () => {
        expect(mapPifyRequest(new URL('https://docs.pify.dev/'), config)).toEqual({ kind: 'locale-root' });
        expect(mapPifyRequest(new URL('https://docs.pify.dev/fr/guide'), config)).toEqual({ kind: 'not-found' });
        expect(mapPifyRequest(new URL('https://docs.pify.dev/url/gitbook.com/docs'), config)).toEqual({ kind: 'pass' });
        expect(mapPifyRequest(new URL('https://docs.pify.dev/~pify/health'), config)).toEqual({ kind: 'pass' });
    });
});

it('chooses cookie, then Vietnamese Accept-Language, then English', () => {
    expect(pickPreferredLocale('vi', 'en-US,en;q=0.9')).toBe('vi');
    expect(pickPreferredLocale(undefined, 'vi-VN,vi;q=0.9,en;q=0.8')).toBe('vi');
    expect(pickPreferredLocale(undefined, 'fr-FR,fr;q=0.9')).toBe('en');
});

it('switches locale while preserving the semantic path', () => {
    expect(alternateLocaleURL('https://docs.pify.dev/vi/ch04-model-invocation', 'en')).toBe(
        'https://docs.pify.dev/en/ch04-model-invocation',
    );
});
```

- [ ] **Step 2: Run tests and verify failure**

```powershell
bun test packages/gitbook/src/lib/pify/routing.test.ts
```

Expected: FAIL because Pify routing modules do not exist.

- [ ] **Step 3: Implement pure routing**

Create `packages/gitbook/src/lib/pify/routing.ts`:

```ts
export type PifyLocale = 'en' | 'vi';

export type PifyRoutingConfig = {
    enabled: boolean;
    canonicalOrigin: string;
    origins: Record<PifyLocale, string>;
};

export type PifyRoute =
    | { kind: 'pass' }
    | { kind: 'locale-root' }
    | { kind: 'not-found' }
    | {
          kind: 'content';
          locale: PifyLocale;
          lookupURL: string;
          originBaseURL: string;
          publicBaseURL: string;
          canonicalURL: string;
      };

const PASSTHROUGH_PREFIXES = ['/url/', '/~space/', '/~site/', '/~pify/', '/_next/', '/~gitbook/static/'];

function joinURL(base: string, suffix: string, search = ''): string {
    const result = new URL(base);
    result.pathname = `${result.pathname.replace(/\/$/, '')}/${suffix.replace(/^\//, '')}`.replace(/\/$/, '');
    result.search = search;
    return result.toString().replace(/\/$/, '');
}

export function mapPifyRequest(requestURL: URL, config: PifyRoutingConfig): PifyRoute {
    if (!config.enabled) return { kind: 'pass' };
    if (PASSTHROUGH_PREFIXES.some((prefix) => requestURL.pathname.startsWith(prefix))) return { kind: 'pass' };
    if (requestURL.pathname === '/') return { kind: 'locale-root' };
    const match = requestURL.pathname.match(/^\/(en|vi)(?:\/(.*))?$/);
    if (!match) return { kind: 'not-found' };
    const locale = match[1] as PifyLocale;
    const remainder = match[2] ?? '';
    const publicBaseURL = joinURL(config.canonicalOrigin, locale);
    return {
        kind: 'content',
        locale,
        lookupURL: joinURL(config.origins[locale], remainder, requestURL.search),
        originBaseURL: config.origins[locale],
        publicBaseURL,
        canonicalURL: joinURL(publicBaseURL, remainder),
    };
}

export function pickPreferredLocale(cookieLocale: string | undefined, acceptLanguage: string | null): PifyLocale {
    if (cookieLocale === 'en' || cookieLocale === 'vi') return cookieLocale;
    const vietnamese = (acceptLanguage ?? '')
        .split(',')
        .map((entry) => entry.split(';')[0]?.trim().toLowerCase())
        .some((entry) => entry === 'vi' || entry?.startsWith('vi-'));
    return vietnamese ? 'vi' : 'en';
}

export function alternateLocaleURL(url: string, locale: PifyLocale): string {
    const parsed = new URL(url);
    parsed.pathname = parsed.pathname.replace(/^\/(en|vi)(?=\/|$)/, `/${locale}`);
    return parsed.toString().replace(/\/$/, '');
}

export function pifyLocaleFromURL(url: string | null | undefined): PifyLocale | null {
    if (!url) return null;
    const match = new URL(url).pathname.match(/^\/(en|vi)(?:\/|$)/);
    return match ? (match[1] as PifyLocale) : null;
}

```

- [ ] **Step 4: Implement server-only environment validation**

Create `packages/gitbook/src/lib/pify/config.ts`:

```ts
import 'server-only';
import type { PifyRoutingConfig } from './routing';

function httpsURL(name: string, value: string | undefined): string {
    if (!value) throw new Error(`${name} is required when PIFY_DOCS_ENABLED=true`);
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:' && parsed.hostname !== 'localhost') {
        throw new Error(`${name} must use https outside localhost`);
    }
    parsed.pathname = parsed.pathname.replace(/\/$/, '');
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString().replace(/\/$/, '');
}

export function getPifyRoutingConfig(): PifyRoutingConfig {
    const enabled = process.env.PIFY_DOCS_ENABLED === 'true';
    if (!enabled) return { enabled: false, canonicalOrigin: '', origins: { en: '', vi: '' } };
    return {
        enabled: true,
        canonicalOrigin: httpsURL(
            'PIFY_CANONICAL_ORIGIN',
            process.env.PIFY_CANONICAL_ORIGIN ??
                (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined),
        ),
        origins: {
            en: httpsURL('PIFY_GITBOOK_EN_ORIGIN', process.env.PIFY_GITBOOK_EN_ORIGIN),
            vi: httpsURL('PIFY_GITBOOK_VI_ORIGIN', process.env.PIFY_GITBOOK_VI_ORIGIN),
        },
    };
}
```

Create `packages/gitbook/src/lib/pify/index.ts`:

```ts
export * from './config';
export * from './routing';
```

- [ ] **Step 5: Run focused tests and commit**

```powershell
bun test packages/gitbook/src/lib/pify/routing.test.ts
bun --cwd packages/gitbook typecheck
git add packages/gitbook/src/lib/pify
git commit -m "feat(pify): map bilingual public routes"
```

Expected: tests and typecheck PASS before commit.

### Task 3: Integrate origin lookup and public linker

**Files:**
- Modify: `packages/gitbook/src/middleware.ts`
- Modify: `packages/gitbook/src/lib/context.ts`
- Modify: `packages/gitbook/src/lib/pify/routing.test.ts`

- [ ] **Step 1: Add a failing canonical-adapter test**

Append to `routing.test.ts`:

```ts
import { adaptPublishedContent } from './routing';

it('replaces origin bases while retaining identity and pathname', () => {
    const adapted = adaptPublishedContent(
        {
            organization: 'org',
            site: 'site',
            basePath: '/docs-en',
            siteBasePath: '/docs-en',
            canonicalUrl: 'https://pify.gitbook.io/docs-en/ch03-agent-loop',
            pathname: '/ch03-agent-loop',
        },
        {
            kind: 'content',
            locale: 'en',
            lookupURL: 'https://pify.gitbook.io/docs-en/ch03-agent-loop',
            originBaseURL: 'https://pify.gitbook.io/docs-en',
            publicBaseURL: 'https://docs.pify.dev/en',
            canonicalURL: 'https://docs.pify.dev/en/ch03-agent-loop',
        },
    );
    expect(adapted).toMatchObject({
        pathname: '/ch03-agent-loop',
        basePath: '/en',
        siteBasePath: '/en',
        canonicalUrl: 'https://docs.pify.dev/en/ch03-agent-loop',
        pifyPublicBaseURL: 'https://docs.pify.dev/en',
    });
});
```

- [ ] **Step 2: Implement the canonical adapter**

Add to `routing.ts`:

```ts
export function adaptPublishedContent<T extends Record<string, unknown>>(
    content: T,
    route: Extract<PifyRoute, { kind: 'content' }>,
): T & { pifyPublicBaseURL: string } {
    return {
        ...content,
        basePath: `/${route.locale}`,
        siteBasePath: `/${route.locale}`,
        canonicalUrl: route.canonicalURL,
        pifyPublicBaseURL: route.publicBaseURL,
    };
}
```

Run `bun test packages/gitbook/src/lib/pify/routing.test.ts`; expected PASS for the adapter assertion.

- [ ] **Step 3: Carry the public base through `SiteURLData`**

Add to `SiteURLData` in `context.ts`:

```ts
    /** Public Pify locale root used instead of the GitBook origin URL. */
    pifyPublicBaseURL?: string;
```

Add `pifyPublicBaseURL?: string` to the `ids` parameter of `fetchSiteContextByIds`, pass it from `fetchSiteContextByURLLookup`, and replace published-linker construction with:

```ts
    const publishedURL = ids.pifyPublicBaseURL ?? site.urls.published;
    const siteLinker = publishedURL
        ? linkerForPublishedURL(spaceContext.linker, publishedURL)
        : spaceContext.linker;
    const publicSite = ids.pifyPublicBaseURL
        ? { ...site, urls: { ...site.urls, published: ids.pifyPublicBaseURL } }
        : site;
```

Return `site: publicSite` in the final context.

- [ ] **Step 4: Map Pify requests before upstream lookup**

Import `PifyRoute`, `adaptPublishedContent`, `getPifyRoutingConfig`, `mapPifyRequest` and `pickPreferredLocale` in `middleware.ts`. Declare `let activePifyRoute: PifyRoute = { kind: 'pass' };` immediately before the `try`. Immediately after creating `requestURL`, assign `activePifyRoute = mapPifyRequest(requestURL, getPifyRoutingConfig())` and handle the two terminal cases:

```ts
        activePifyRoute = mapPifyRequest(requestURL, getPifyRoutingConfig());
        if (activePifyRoute.kind === 'locale-root') {
            const locale = pickPreferredLocale(
                request.cookies.get('pify-docs-locale')?.value,
                request.headers.get('accept-language'),
            );
            return NextResponse.redirect(new URL(`/${locale}/`, requestURL), 302);
        }
        if (activePifyRoute.kind === 'not-found') {
            return new Response('Page not found', {
                status: 404,
                headers: { 'content-type': 'text/plain; charset=utf-8' },
            });
        }
```

Replace the handler loop with explicit calls so only `serveSiteRoutes` receives Pify routing state:

```ts
        const siteResponse = await serveSiteRoutes(requestURL, request, activePifyRoute);
        if (siteResponse) return siteResponse;
        const pdfResponse = await serveSpacePDFRoutes(requestURL, request);
        if (pdfResponse) return pdfResponse;
```

Change `serveSiteRoutes` to accept `pifyRoute: PifyRoute`. Replace its initial match assignment with:

```ts
    const match =
        pifyRoute.kind === 'content'
            ? { url: new URL(pifyRoute.lookupURL), mode: 'url-host' as const }
            : getSiteURLFromRequest(request);
```

Rename the direct lookup result to `lookupResult`. Immediately after `throwIfDataError`, normalize content results and content redirects before assigning `siteURLData`:

```ts
        const siteURLData =
            pifyRoute.kind !== 'content'
                ? lookupResult
                : 'redirect' in lookupResult
                  ? publicizePifyRedirect(lookupResult, pifyRoute)
                  : adaptPublishedContent(lookupResult, pifyRoute);
```

Append these redirect tests to `routing.test.ts`:

```ts
import { publicizePifyRedirect } from './routing';

const redirectRoute = mapPifyRequest(new URL('https://docs.pify.dev/en/old'), config);
if (redirectRoute.kind !== 'content') throw new Error('Expected content route fixture');

it('rewrites an origin content redirect to the public locale base', () => {
    expect(
        publicizePifyRedirect(
            {
                redirect: 'https://pify.gitbook.io/docs-en/new-page?from=old#section',
                target: 'content',
            },
            redirectRoute,
        ),
    ).toEqual({
        redirect: 'https://docs.pify.dev/en/new-page?from=old#section',
        target: 'content',
    });
});

it('rejects a content redirect outside the configured origin base', () => {
    expect(() =>
        publicizePifyRedirect(
            { redirect: 'https://attacker.example/new-page', target: 'content' },
            redirectRoute,
        ),
    ).toThrow('Pify content redirect escaped its configured origin');
});

it('leaves an explicitly external redirect unchanged', () => {
    const redirect = { redirect: 'https://github.com/pifydev/docs', target: 'external' };
    expect(publicizePifyRedirect(redirect, redirectRoute)).toEqual(redirect);
});
```

Run the focused test; expected FAIL because the helper is missing. Then add to `routing.ts`:

```ts
export function publicizePifyRedirect<T extends { redirect: string; target: string }>(
    lookup: T,
    route: Extract<PifyRoute, { kind: 'content' }>,
): T {
    if (lookup.target !== 'content') return lookup;
    const originBase = new URL(route.originBaseURL);
    const target = new URL(lookup.redirect);
    const originBasePath = originBase.pathname.replace(/\/$/, '');
    const insideOrigin =
        target.origin === originBase.origin &&
        (target.pathname === originBasePath || target.pathname.startsWith(`${originBasePath}/`));
    if (!insideOrigin) throw new Error('Pify content redirect escaped its configured origin');

    const suffix = target.pathname.slice(originBasePath.length).replace(/^\//, '');
    const publicTarget = new URL(route.publicBaseURL);
    publicTarget.pathname = `${publicTarget.pathname.replace(/\/$/, '')}/${suffix}`.replace(/\/$/, '');
    publicTarget.search = target.search;
    publicTarget.hash = target.hash;
    return { ...lookup, redirect: publicTarget.toString().replace(/\/$/, '') };
}
```

This preserves path suffix, query and fragment, leaves explicit external redirects unchanged, and rejects malformed or escaping content targets into the branded 503 path added in Task 7.

Add this property to `stableSiteURLData`:

```ts
            pifyPublicBaseURL:
                pifyRoute.kind === 'content' ? pifyRoute.publicBaseURL : undefined,
```

- [ ] **Step 5: Run regression checks and commit**

```powershell
bun test packages/gitbook/src/lib/pify/routing.test.ts
bun --cwd packages/gitbook typecheck
bun --cwd packages/gitbook unit
git add packages/gitbook/src/middleware.ts packages/gitbook/src/lib/context.ts packages/gitbook/src/lib/pify
git commit -m "feat(pify): proxy locale origins behind public URLs"
```

Expected: all commands PASS; the existing upstream URL-mode regression tests stay green.

### Task 4: Add bilingual canonical metadata

**Files:**
- Modify: `packages/gitbook/src/lib/pify/routing.test.ts`
- Modify: `packages/gitbook/src/components/SitePage/SitePage.tsx`

- [ ] **Step 1: Add and run a failing alternate-map assertion**

Append:

```ts
import { pifyLanguageAlternates } from './routing';

it('emits English, Vietnamese and x-default URLs', () => {
    expect(pifyLanguageAlternates('https://docs.pify.dev/vi/ch09-compaction')).toEqual({
        en: 'https://docs.pify.dev/en/ch09-compaction',
        vi: 'https://docs.pify.dev/vi/ch09-compaction',
        'x-default': 'https://docs.pify.dev/en/ch09-compaction',
    });
});
```

Run `bun test packages/gitbook/src/lib/pify/routing.test.ts`; expected FAIL because `pifyLanguageAlternates` does not exist.

- [ ] **Step 2: Implement the alternate helper and merge it into metadata**

Add to `routing.ts`:

```ts
export function pifyLanguageAlternates(url: string): Record<string, string> | null {
    if (!pifyLocaleFromURL(url)) return null;
    const en = alternateLocaleURL(url, 'en');
    return { en, vi: alternateLocaleURL(url, 'vi'), 'x-default': en };
}
```

Import `pifyLanguageAlternates` in `SitePage.tsx`. After calculating `canonical`, add:

```ts
    const pifyAlternates = pifyLanguageAlternates(canonical);
```

Set metadata languages to:

```ts
            languages: pifyAlternates ?? alternates?.languages,
```

- [ ] **Step 3: Verify and commit**

```powershell
bun test packages/gitbook/src/lib/pify/routing.test.ts
bun --cwd packages/gitbook typecheck
git add packages/gitbook/src/lib/pify/routing.test.ts packages/gitbook/src/components/SitePage/SitePage.tsx
git commit -m "feat(pify): emit bilingual canonical metadata"
```

Expected: PASS.

### Task 5: Add supplied logo, licensed fonts and Pify header controls

**Files:**
- Create: `packages/gitbook/public/pify/**`
- Create: `packages/gitbook/src/components/Pify/PifyLogo.tsx`
- Create: `packages/gitbook/src/components/Pify/PifyLocaleSwitch.tsx`
- Create: `packages/gitbook/src/components/Pify/PifyHeaderActions.tsx`
- Create: `packages/gitbook/src/components/Pify/index.ts`
- Modify: `packages/gitbook/src/components/Header/HeaderLogo.tsx`
- Modify: `packages/gitbook/src/components/Header/Header.tsx`
- Modify: `packages/gitbook/src/components/SpaceLayout/SpaceLayout.tsx`
- Modify: `packages/gitbook/src/components/SiteLayout/SiteLayout.tsx`

- [ ] **Step 1: Copy exact brand assets and the font license**

```powershell
$assetRoot = 'packages\gitbook\public\pify'
New-Item -ItemType Directory -Force -Path $assetRoot, "$assetRoot\fonts" | Out-Null
Copy-Item -LiteralPath 'C:\Users\Admin\Downloads\pify-logo-pack\pify-logo-on-light.svg' -Destination "$assetRoot\logo-on-light.svg"
Copy-Item -LiteralPath 'C:\Users\Admin\Downloads\pify-logo-pack\pify-logo-on-dark.svg' -Destination "$assetRoot\logo-on-dark.svg"
Copy-Item -LiteralPath 'C:\Users\Admin\Downloads\pify-logo-pack\pify-logo-light-bg-rounded.svg' -Destination "$assetRoot\logo-light-rounded.svg"
Copy-Item -LiteralPath 'C:\Users\Admin\Downloads\pify-logo-pack\pify-logo-dark-bg-rounded.svg' -Destination "$assetRoot\logo-dark-rounded.svg"
Copy-Item -LiteralPath 'E:\project\pi-docs\public\fonts\Geist-Regular.ttf' -Destination "$assetRoot\fonts\Geist-Regular.ttf"
Copy-Item -LiteralPath 'E:\project\pi-docs\public\fonts\Geist-Medium.ttf' -Destination "$assetRoot\fonts\Geist-Medium.ttf"
Copy-Item -LiteralPath 'E:\project\pi-docs\public\fonts\Geist-SemiBold.ttf' -Destination "$assetRoot\fonts\Geist-SemiBold.ttf"
Copy-Item -LiteralPath 'E:\project\pi-docs\public\fonts\GeistMono-Regular.ttf' -Destination "$assetRoot\fonts\GeistMono-Regular.ttf"
Copy-Item -LiteralPath 'E:\project\pi-docs\public\fonts\GeistMono-Medium.ttf' -Destination "$assetRoot\fonts\GeistMono-Medium.ttf"
Invoke-WebRequest -Uri 'https://raw.githubusercontent.com/vercel/geist-font/main/LICENSE.txt' -OutFile "$assetRoot\fonts\LICENSE.txt"
```

Expected: four SVGs, five TTFs and an SIL OFL 1.1 license are present.

- [ ] **Step 2: Add the logo component**

Create `PifyLogo.tsx`:

```tsx
import type { PifyLocale } from '@/lib/pify';

export function PifyLogo({ locale }: { locale: PifyLocale }) {
    return (
        <a className="pify-logo" href={`/${locale}/`} aria-label="Pify Docs home">
            <picture>
                <source media="(prefers-color-scheme: dark)" srcSet="/pify/logo-on-dark.svg" />
                <img src="/pify/logo-on-light.svg" alt="" width={28} height={28} />
            </picture>
            <span>Pify Docs</span>
        </a>
    );
}
```

- [ ] **Step 3: Add the native accessible language switch**

Create `PifyLocaleSwitch.tsx`:

```tsx
'use client';

import { usePathname } from 'next/navigation';
import type { ChangeEvent } from 'react';
import type { PifyLocale } from '@/lib/pify';

export function PifyLocaleSwitch({ locale }: { locale: PifyLocale }) {
    const pathname = usePathname();
    const label = locale === 'vi' ? 'Chọn ngôn ngữ' : 'Choose language';
    const onChange = (event: ChangeEvent<HTMLSelectElement>) => {
        const nextLocale = event.target.value as PifyLocale;
        const secure = window.location.protocol === 'https:' ? '; Secure' : '';
        document.cookie = `pify-docs-locale=${nextLocale}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
        const nextPath = pathname.replace(/^\/(en|vi)(?=\/|$)/, `/${nextLocale}`);
        window.location.assign(`${nextPath}${window.location.search}${window.location.hash}`);
    };
    return (
        <label className="pify-locale-switch">
            <span className="sr-only">{label}</span>
            <select value={locale} onChange={onChange} aria-label={label}>
                <option value="en">English</option>
                <option value="vi">Tiếng Việt</option>
            </select>
        </label>
    );
}
```

- [ ] **Step 4: Add GitHub, theme and locale controls**

Create `PifyHeaderActions.tsx`:

```tsx
import { ThemeToggler } from '../ThemeToggler';
import { Button } from '../primitives';
import { PifyLocaleSwitch } from './PifyLocaleSwitch';
import type { PifyLocale } from '@/lib/pify';

export function PifyHeaderActions({ locale }: { locale: PifyLocale }) {
    return (
        <div className="pify-header-actions">
            <Button
                href="https://github.com/pifydev/docs"
                target="_blank"
                variant="blank"
                size="small"
                label={locale === 'vi' ? 'Mã nguồn trên GitHub' : 'Source on GitHub'}
            >
                GitHub
            </Button>
            <ThemeToggler />
            <PifyLocaleSwitch locale={locale} />
        </div>
    );
}
```

Create `packages/gitbook/src/components/Pify/index.ts`:

```ts
export * from './PifyHeaderActions';
export * from './PifyLocaleSwitch';
export * from './PifyLogo';
```

- [ ] **Step 5: Connect Pify components without changing non-Pify sites**

In `HeaderLogo.tsx`, calculate `pifyLocaleFromURL(context.site.urls.published)` and return `<PifyLogo locale={pifyLocale} />` before upstream customization rendering when non-null.

In `Header.tsx`, calculate the same locale, include `Boolean(pifyLocale)` in the `HeaderLinks` visibility condition, render:

```tsx
{pifyLocale ? <PifyHeaderActions locale={pifyLocale} /> : null}
```

Suppress the upstream `TranslationsDropdown` when `pifyLocale` is non-null. In the mobile header inside `SpaceLayout.tsx`, render `PifyLocaleSwitch` when Pify is active and retain the existing translations dropdown otherwise.

- [ ] **Step 6: Use supplied rounded icons in metadata**

In `generateSiteLayoutMetadata`, calculate the Pify locale and set:

```ts
    const pifyIcons = pifyLocale
        ? {
              icon: [
                  { url: '/pify/logo-light-rounded.svg', type: 'image/svg+xml', media: '(prefers-color-scheme: light)' },
                  { url: '/pify/logo-dark-rounded.svg', type: 'image/svg+xml', media: '(prefers-color-scheme: dark)' },
              ],
              apple: [{ url: '/pify/logo-light-rounded.svg', type: 'image/svg+xml' }],
          }
        : null;
```

Use `icons: pifyIcons ?? { icon: icons, apple: appIcons }` in the returned metadata.

- [ ] **Step 7: Verify and commit brand/header changes**

```powershell
rg -n "#6366f1|#818cf8|#09090b|#ffffff" packages/gitbook/public/pify/*.svg
rg -n "SIL OPEN FONT LICENSE Version 1.1" packages/gitbook/public/pify/fonts/LICENSE.txt
bun --cwd packages/gitbook typecheck
bun test packages/gitbook/src/components/SpaceLayout/SpaceLayout.test.ts
git add packages/gitbook/public/pify packages/gitbook/src/components/Pify packages/gitbook/src/components/Header packages/gitbook/src/components/SpaceLayout/SpaceLayout.tsx packages/gitbook/src/components/SiteLayout/SiteLayout.tsx
git commit -m "feat(pify): add official brand and bilingual header"
```

Expected: checks PASS and non-Pify header tests remain green.

### Task 6: Apply the scoped clean editorial visual system

**Files:**
- Create: `packages/gitbook/src/components/Pify/pify.css`
- Modify: `packages/gitbook/src/components/RootLayout/globals.css`
- Modify: `packages/gitbook/src/components/RootLayout/CustomizationRootLayout.tsx`

- [ ] **Step 1: Mark Pify pages at the body root**

Import `pifyLocaleFromURL`, calculate the active locale, and replace only the body opening tag with:

```tsx
<body
    data-pify-docs={pifyLocale ?? undefined}
    className={tcls(bodyClassName, 'sheet-open:overflow-hidden')}
>
```

Import `../Pify/pify.css` after `prose.css` in `globals.css`.

- [ ] **Step 2: Create the full scoped stylesheet**

Create `pify.css`:

```css
@font-face {
  font-family: "Geist";
  src: url("/pify/fonts/Geist-Regular.ttf") format("truetype");
  font-weight: 400;
  font-display: swap;
}
@font-face {
  font-family: "Geist";
  src: url("/pify/fonts/Geist-Medium.ttf") format("truetype");
  font-weight: 500;
  font-display: swap;
}
@font-face {
  font-family: "Geist";
  src: url("/pify/fonts/Geist-SemiBold.ttf") format("truetype");
  font-weight: 600 800;
  font-display: swap;
}
@font-face {
  font-family: "Geist Mono";
  src: url("/pify/fonts/GeistMono-Regular.ttf") format("truetype");
  font-weight: 400;
  font-display: swap;
}
@font-face {
  font-family: "Geist Mono";
  src: url("/pify/fonts/GeistMono-Medium.ttf") format("truetype");
  font-weight: 500 700;
  font-display: swap;
}

body[data-pify-docs] {
  --pify-bg: #ffffff;
  --pify-surface: #fafafa;
  --pify-text: #09090b;
  --pify-muted: #52525b;
  --pify-border: #e4e4e7;
  --pify-accent: #6366f1;
  background: var(--pify-bg);
  color: var(--pify-text);
  font: 16px/1.7 "Geist", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  text-rendering: optimizeLegibility;
}
.dark body[data-pify-docs] {
  --pify-bg: #09090b;
  --pify-surface: #18181b;
  --pify-text: #fafafa;
  --pify-muted: #a1a1aa;
  --pify-border: #27272a;
  --pify-accent: #818cf8;
}
body[data-pify-docs] [data-gb-site-header] {
  min-height: 56px;
  border-bottom: 1px solid var(--pify-border);
  background: color-mix(in srgb, var(--pify-bg) 92%, transparent);
  box-shadow: none;
  backdrop-filter: blur(14px);
}
body[data-pify-docs] [data-gb-header-content] {
  min-height: 56px;
  padding-block: 8px;
}
.pify-logo {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  color: var(--pify-text);
  font-size: 16px;
  font-weight: 600;
  letter-spacing: -0.02em;
  text-decoration: none;
}
.pify-logo img { display: block; width: 28px; height: 28px; }
.pify-header-actions { display: flex; align-items: center; gap: 8px; }
.pify-locale-switch select {
  min-height: 34px;
  border: 1px solid var(--pify-border);
  border-radius: 8px;
  background: var(--pify-bg);
  color: var(--pify-text);
  padding: 0 30px 0 10px;
  font: 500 13px/1 "Geist", sans-serif;
}
.pify-locale-switch select:focus-visible {
  outline: 2px solid var(--pify-accent);
  outline-offset: 2px;
}
body[data-pify-docs] [data-gb-table-of-contents] {
  width: 264px;
  margin-right: 48px;
  border-color: var(--pify-border);
}
body[data-pify-docs] .prose {
  max-width: 72ch;
  color: var(--pify-text);
  font-size: 1.0625rem;
  line-height: 1.72;
}
body[data-pify-docs] .prose h1,
body[data-pify-docs] .prose h2,
body[data-pify-docs] .prose h3,
body[data-pify-docs] .prose h4 {
  color: var(--pify-text);
  font-weight: 650;
  letter-spacing: -0.025em;
  text-wrap: balance;
}
body[data-pify-docs] .prose h1 { font-size: clamp(2rem, 4vw, 2.625rem); }
body[data-pify-docs] .prose h2 { margin-top: 2.75em; font-size: clamp(1.45rem, 2.4vw, 1.8rem); }
body[data-pify-docs] .prose a { color: var(--pify-accent); text-underline-offset: 3px; }
body[data-pify-docs] .prose :not(pre) > code,
body[data-pify-docs] pre,
body[data-pify-docs] code {
  font-family: "Geist Mono", ui-monospace, "SFMono-Regular", Consolas, monospace;
}
body[data-pify-docs] pre {
  border: 1px solid var(--pify-border);
  border-radius: 10px;
  box-shadow: none;
}
body[data-pify-docs] table { border-color: var(--pify-border); font-size: 0.9375rem; }
body[data-pify-docs] [data-active="true"] { color: var(--pify-accent); }

@media (max-width: 1023px) {
  body[data-pify-docs] [data-gb-table-of-contents] { width: min(86vw, 320px); margin-right: 0; }
  .pify-header-actions [role="radiogroup"] { display: none; }
  body[data-pify-docs] .prose { max-width: 100%; font-size: 1rem; line-height: 1.68; }
}
@media (prefers-reduced-motion: reduce) {
  body[data-pify-docs] *,
  body[data-pify-docs] *::before,
  body[data-pify-docs] *::after {
    scroll-behavior: auto !important;
    transition-duration: 0.01ms !important;
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
  }
}
```

- [ ] **Step 3: Run visual-system checks and commit**

```powershell
bun --cwd packages/gitbook check:css-browser-compatibility
bun run format
bun run lint
bun run typecheck
bun run build
git add packages/gitbook/src/components/Pify/pify.css packages/gitbook/src/components/RootLayout
git commit -m "style(pify): apply clean editorial documentation theme"
```

Expected: all commands PASS and Pify rules stay scoped under `data-pify-docs`.

### Task 7: Add localized safe 404 and 503 responses

**Files:**
- Create: `packages/gitbook/src/lib/pify/error-response.ts`
- Create: `packages/gitbook/src/lib/pify/error-response.test.ts`
- Modify: `packages/gitbook/src/lib/pify/index.ts`
- Modify: `packages/gitbook/src/middleware.ts`

- [ ] **Step 1: Write a failing response test**

```ts
import { expect, it } from 'bun:test';
import { pifyErrorResponse } from './error-response';

it('returns a localized safe 503 page', async () => {
    const response = pifyErrorResponse(503, 'vi');
    expect(response.status).toBe(503);
    const html = await response.text();
    expect(html).toContain('Tài liệu tạm thời không khả dụng');
    expect(html).not.toContain('stack');
});
```

Run `bun test packages/gitbook/src/lib/pify/error-response.test.ts`; expected FAIL.

- [ ] **Step 2: Implement the response factory**

Create `error-response.ts`:

```ts
import type { PifyLocale } from './routing';

const copy = {
    en: {
        404: ['Page not found', 'The requested documentation page does not exist.', 'Back to English docs'],
        503: ['Docs temporarily unavailable', 'Please try again in a few minutes.', 'Back to English docs'],
    },
    vi: {
        404: ['Không tìm thấy trang', 'Trang tài liệu bạn yêu cầu không tồn tại.', 'Về tài liệu tiếng Việt'],
        503: ['Tài liệu tạm thời không khả dụng', 'Vui lòng thử lại sau ít phút.', 'Về tài liệu tiếng Việt'],
    },
} as const;

export function pifyErrorResponse(status: 404 | 503, locale: PifyLocale): Response {
    const [title, message, action] = copy[locale][status];
    const html = `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${title} | Pify Docs</title><style>body{margin:0;background:#fff;color:#09090b;font:16px/1.6 system-ui,sans-serif}main{max-width:640px;margin:15vh auto;padding:24px}img{width:40px;height:40px}h1{font-size:32px;letter-spacing:-.03em}a{color:#6366f1;font-weight:600}</style></head><body><main><img src="/pify/logo-on-light.svg" alt=""><h1>${title}</h1><p>${message}</p><a href="/${locale}/">${action}</a></main></body></html>`;
    return new Response(html, {
        status,
        headers: {
            'content-type': 'text/html; charset=utf-8',
            'cache-control': status === 503 ? 'no-store' : 'public, max-age=60',
        },
    });
}
```

- [ ] **Step 3: Integrate errors without changing upstream behavior**

Export the function from `lib/pify/index.ts`. Replace the Task 3 plain unsupported-path response with:

```ts
            return pifyErrorResponse(
                404,
                pickPreferredLocale(undefined, request.headers.get('accept-language')),
            );
```

Change the middleware catch block to derive the active locale and Pify state without parsing an origin URL:

```ts
    } catch (error) {
        const pifyLocale =
            activePifyRoute.kind === 'content'
                ? activePifyRoute.locale
                : pickPreferredLocale(
                      request.cookies.get('pify-docs-locale')?.value,
                      request.headers.get('accept-language'),
                  );
        return serveErrorResponse(error as Error, pifyLocale, activePifyRoute.kind !== 'pass');
    }
```

Replace `serveErrorResponse` with:

```ts
function serveErrorResponse(error: Error, locale: PifyLocale, isPifyRequest: boolean) {
    if (isPifyRequest) {
        if (error instanceof DataFetcherError && error.code === 404) {
            return pifyErrorResponse(404, locale);
        }
        console.error('Pify renderer request failed', {
            name: error.name,
            code: error instanceof DataFetcherError ? error.code : 500,
        });
        return pifyErrorResponse(503, locale);
    }
    if (error instanceof DataFetcherError) {
        return new Response(error.message, {
            status: error.code,
            headers: { 'content-type': 'text/plain' },
        });
    }
    throw error;
}
```

Import `PifyLocale`. This makes rejected/malformed origin redirects and lookup failures safe 503 responses, keeps genuine Pify not-found responses at 404, logs no origin URL/token/stack, and preserves upstream plain error behavior for non-Pify hosts.

- [ ] **Step 4: Verify and commit**

```powershell
bun test packages/gitbook/src/lib/pify
bun --cwd packages/gitbook typecheck
git add packages/gitbook/src/lib/pify packages/gitbook/src/middleware.ts
git commit -m "feat(pify): add localized safe error pages"
```

Expected: PASS.

### Task 8: Add an operational health route

**Files:**
- Modify: `packages/gitbook/src/lib/pify/routing.test.ts`
- Create: `packages/gitbook/src/app/~pify/health/route.ts`

- [ ] **Step 1: Confirm the route bypasses GitBook content lookup**

The failing assertion for `/~pify/health` was added in Task 2. Run it before adding `/~pify/` to `PASSTHROUGH_PREFIXES`; expected FAIL. Run it again after the routing change; expected PASS.

- [ ] **Step 2: Implement a non-secret health response**

Create `route.ts`:

```ts
import { NextResponse } from 'next/server';
import { getPifyRoutingConfig } from '@/lib/pify';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const config = getPifyRoutingConfig();
        const ready = config.enabled && Boolean(config.origins.en) && Boolean(config.origins.vi);
        return NextResponse.json(
            {
                service: 'pify-docs',
                status: ready ? 'ready' : 'disabled',
                locales: ready ? ['en', 'vi'] : [],
            },
            {
                status: ready ? 200 : 503,
                headers: { 'cache-control': 'no-store' },
            },
        );
    } catch {
        return NextResponse.json(
            { service: 'pify-docs', status: 'misconfigured', locales: [] },
            { status: 503, headers: { 'cache-control': 'no-store' } },
        );
    }
}
```

Do not include origin URLs, environment values or error messages in the response.

- [ ] **Step 3: Verify and commit**

```powershell
bun test packages/gitbook/src/lib/pify/routing.test.ts
bun --cwd packages/gitbook typecheck
bun --cwd packages/gitbook build
git add packages/gitbook/src/app/~pify packages/gitbook/src/lib/pify
git commit -m "feat(pify): expose renderer readiness endpoint"
```

Expected: PASS; with Pify variables configured, `GET /~pify/health` returns 200 and only the public readiness payload.

### Task 9: Add Pify browser acceptance coverage

**Files:**
- Create: `packages/gitbook/e2e/pify.spec.ts`
- Modify: `packages/gitbook/package.json`
- Modify: `packages/gitbook/src/components/Pify/PifyLocaleSwitch.tsx`

- [ ] **Step 1: Add a stable test hook to the locale control**

Add `data-testid="pify-locale-switch"` to the `<select>` in `PifyLocaleSwitch`. This is an acceptance-test contract, not a styling selector.

- [ ] **Step 2: Write the browser tests**

Create `pify.spec.ts`:

```ts
import { expect, test } from '@playwright/test';

const baseURL = process.env.PIFY_E2E_BASE_URL;
if (!baseURL) throw new Error('PIFY_E2E_BASE_URL is required');

const pagePath = 'ch01-overview';

test('redirects the locale root from browser preference', async ({ page }) => {
    await page.context().setExtraHTTPHeaders({ 'accept-language': 'vi-VN,vi;q=0.9,en;q=0.8' });
    await page.goto(`${baseURL}/`);
    await expect(page).toHaveURL(new RegExp('/vi/$'));
});

test('renders branded bilingual metadata without origin leaks', async ({ page }) => {
    await page.goto(`${baseURL}/en/${pagePath}`);
    await expect(page.getByRole('link', { name: 'Pify Docs home' })).toBeVisible();
    await expect(page.getByTestId('pify-locale-switch')).toHaveValue('en');
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
        'href',
        `${baseURL}/en/${pagePath}`,
    );
    await expect(page.locator('link[rel="alternate"][hreflang="vi"]')).toHaveAttribute(
        'href',
        `${baseURL}/vi/${pagePath}`,
    );
    const leakedLinks = await page.locator('a[href*="gitbook.io"], a[href*="gitbook.com"]:not([href*="github.com/GitbookIO"])').count();
    expect(leakedLinks).toBe(0);
});

test('switches language and retains path, query and fragment', async ({ page }) => {
    await page.goto(`${baseURL}/en/${pagePath}?source=e2e#main-content`);
    await page.getByTestId('pify-locale-switch').selectOption('vi');
    await expect(page).toHaveURL(`${baseURL}/vi/${pagePath}?source=e2e#main-content`);
    await expect(page.getByTestId('pify-locale-switch')).toHaveValue('vi');
});

test('keeps the article readable on a narrow viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${baseURL}/vi/${pagePath}`);
    const article = page.locator('main article').first();
    await expect(article).toBeVisible();
    const box = await article.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);
});

test('returns localized 404 and a healthy readiness response', async ({ page, request }) => {
    const missing = await page.goto(`${baseURL}/vi/khong-ton-tai`);
    expect(missing?.status()).toBe(404);
    await expect(page.getByRole('heading', { name: 'Không tìm thấy trang' })).toBeVisible();
    const health = await request.get(`${baseURL}/~pify/health`);
    expect(health.status()).toBe(200);
    await expect(health.json()).resolves.toEqual({
        service: 'pify-docs',
        status: 'ready',
        locales: ['en', 'vi'],
    });
});

test('keeps search results inside the active locale', async ({ page }) => {
    for (const locale of ['en', 'vi'] as const) {
        await page.goto(`${baseURL}/${locale}/`);
        const input = page.getByTestId('search-input');
        await input.fill('agent');
        const results = page.getByTestId('search-page-result');
        await expect(results.first()).toBeVisible({ timeout: 10_000 });
        for (const result of await results.all()) {
            const href = await result.getAttribute('href');
            expect(href).not.toBeNull();
            expect(new URL(href!, baseURL).pathname.startsWith(`/${locale}/`)).toBe(true);
        }
        await page.keyboard.press('Escape');
    }
});
```

- [ ] **Step 3: Register and run the focused suite**

Add this package script:

```json
{
    "e2e:pify": "playwright test e2e/pify.spec.ts --project=chromium --reporter=list"
}
```

With a configured renderer already running, execute:

```powershell
$env:PIFY_E2E_BASE_URL = 'http://localhost:3000'
bun --cwd packages/gitbook e2e:pify
```

Expected: six tests PASS on Chromium.

- [ ] **Step 4: Commit acceptance coverage**

```powershell
git add packages/gitbook/e2e/pify.spec.ts packages/gitbook/package.json packages/gitbook/src/components/Pify/PifyLocaleSwitch.tsx
git commit -m "test(pify): cover bilingual renderer journeys"
```

### Task 10: Run the full renderer gate and record the patch surface

**Files:**
- Modify: `PIFY_PATCHES.md`

- [ ] **Step 1: Run every repository-level gate**

```powershell
bun run format:check
bun run lint
bun run typecheck
bun run unit
bun run build
```

Expected: every command exits 0. Fix failures in the owning task and rerun the complete sequence from the first command.

- [ ] **Step 2: Run the live Pify acceptance suite**

Start the built renderer with the five Pify environment variables, wait for `http://localhost:3000/~pify/health` to return 200, and then run:

```powershell
$env:PIFY_E2E_BASE_URL = 'http://localhost:3000'
bun --cwd packages/gitbook e2e:pify
```

Expected: all browser tests PASS in both desktop and narrow-viewport assertions.

- [ ] **Step 3: Record every maintained divergence**

Update `PIFY_PATCHES.md` with one row per patch area:

| Patch area | Files | Upstream seam | Regression test |
|---|---|---|---|
| Locale route mapping | `src/lib/pify/*`, `src/middleware.ts` | URL lookup and rewrite | `routing.test.ts`, `pify.spec.ts` |
| Public canonical linker | `src/lib/context.ts`, `SitePage.tsx` | site context and metadata | `routing.test.ts`, `pify.spec.ts` |
| Pify identity controls | `src/components/Pify/*`, header/layout files | header composition | `pify.spec.ts` |
| Editorial theme | `src/components/Pify/pify.css`, root layout | scoped CSS import and body marker | CSS compatibility check, `pify.spec.ts` |
| Safe operations | error helper and health route | middleware error boundary and Next route | unit tests, `pify.spec.ts` |

Include upstream baseline `49c993f`, the GPLv3 preservation rule, and the rebase procedure: fetch upstream, create a rebase branch, rebase onto the selected upstream commit, run the full gate, inspect each patch-area diff, then fast-forward only after review.

- [ ] **Step 4: Commit the verified renderer**

```powershell
git add PIFY_PATCHES.md
git commit -m "docs(pify): record maintained GitBook patch surface"
git status --short
```

Expected: the fork worktree is clean and all commits remain GPLv3.

## Completion gate

The renderer plan is complete only when:

- The public fork visibly retains GitBook's GPLv3 license and attribution.
- `/en/*` and `/vi/*` render from separate GitBook origins without exposing either origin in canonical URLs, alternates, redirects or internal links.
- `/` chooses EN or VI from the locale cookie and browser preference; unsupported paths return a localized 404.
- The supplied Pify logo, Geist typography, theme control and native EN/VI switch work in desktop and mobile layouts.
- `GET /~pify/health` returns a non-secret readiness payload.
- Unit, type, lint, build, CSS compatibility and all six Pify Playwright journeys pass.
- `PIFY_PATCHES.md` identifies the exact maintained divergence from upstream.
