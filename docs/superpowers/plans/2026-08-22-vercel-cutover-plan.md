# Pify Docs Vercel Cutover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Đưa public GPLv3 GitBook renderer lên Vercel tại `https://docs.pify.dev`, kiểm chứng đầy đủ EN/VI trước khi đổi DNS, rồi chuyển GitHub Pages cũ thành lớp redirect có thể rollback.

**Architecture:** Vercel Git integration build `packages/gitbook` từ monorepo `pifydev/gitbook`. Preview dùng deployment hostname làm canonical tạm thời; Production dùng `https://docs.pify.dev`. DNS chỉ được gắn sau khi cùng một production deployment vượt qua smoke, Playwright và kiểm tra thủ công. Astro GitHub Pages tiếp tục chạy trong bảy ngày quan sát rồi mới được thay bằng redirect-only artifact.

**Tech Stack:** Vercel CLI 50.37.3, Vercel Git integration, Next.js 16, Bun 1.3.7, Playwright, PowerShell, GitHub Actions, GitHub Pages, DNS and TLS.

---

## Dependency and authority boundary

- Chỉ bắt đầu sau khi content-foundation, bilingual-editorial và renderer plans đã hoàn tất toàn bộ completion gate.
- Renderer operations chạy trong public repository `pifydev/gitbook`; legacy redirect chạy trong `pifydev/docs` tại `E:\project\pi-docs`.
- Không thay đổi DNS cho tới khi Preview và pre-domain Production cùng vượt qua acceptance gate.
- Không ghi Vercel token, GitBook token, environment dump hoặc `.vercel/` vào Git.
- `docs.pify.dev` trả về NXDOMAIN tại thời điểm viết plan ngày 2026-08-22; executor phải kiểm tra lại ngay trước cutover và coi kết quả mới là nguồn sự thật.
- Redirect tại `pify.dev/docs/*` chỉ được thay đổi trong repository/platform của landing page sau khi xác nhận đúng owner và routing hiện tại. Nó không phải điều kiện để đưa subdomain mới lên production.

## Deployment state

| Surface | Before cutover | Target | Rollback |
| --- | --- | --- | --- |
| GitBook origins | Two unlisted public sites | Continue serving renderer lookups | Keep unchanged |
| Renderer Preview | No Pify deployment | Vercel PR deployment | Delete or ignore failed preview |
| `docs.pify.dev` | NXDOMAIN when planned | Current accepted Vercel Production | Vercel rollback; detach DNS only for provider-wide failure |
| Legacy docs | `https://pifydev.github.io/docs` Astro | Seven-day observation, then redirect-only Pages | Redeploy tagged final Astro commit |
| Landing page | `https://pify.dev/` | Unchanged; optional `/docs/*` redirects | Revert landing redirect commit |

## File map

| Repository | File | Responsibility |
| --- | --- | --- |
| `pifydev/gitbook` | `packages/gitbook/scripts/pify-smoke.ts` | HTTP cutover probe |
| `pifydev/gitbook` | `packages/gitbook/scripts/pify-smoke.test.ts` | Parser and leak-detection tests |
| `pifydev/gitbook` | `packages/gitbook/package.json` | `smoke:pify` command |
| `pifydev/docs` | `scripts/legacy-redirect.test.mjs` | Legacy path-mapping tests |
| `pifydev/docs` | `legacy-pages/redirect.js` | Browser redirect logic |
| `pifydev/docs` | `legacy-pages/index.html` | Root redirect shell |
| `pifydev/docs` | `legacy-pages/404.html` | Deep-link redirect shell |
| `pifydev/docs` | `.github/workflows/deploy.yml` | Switch Pages from Astro build to redirect artifact after observation |
| `pifydev/docs` | `docs/operations/2026-08-22-docs-cutover.md` | Auditable deployment and rollback record populated with actual values |

### Task 1: Freeze and verify every prerequisite

**Files:**
- Verify: renderer repository working tree
- Verify: `content/en/**`
- Verify: `content/vi/**`
- Verify: GitBook publication settings

- [ ] **Step 1: Verify repository identities before any remote mutation**

Run in each clone:

```powershell
git remote -v
git status --short
gh repo view --json nameWithOwner,isFork,parent,visibility,licenseInfo
```

Expected:

- Renderer reports `pifydev/gitbook`, `isFork: true`, public visibility and GPL-3.0 licensing.
- Content reports `pifydev/docs` and a clean tracked worktree; unrelated local untracked files may remain untouched.
- Stop before remote writes if either owner/name differs.

- [ ] **Step 2: Run both repositories' final local gates**

In `pifydev/docs`:

```powershell
npm ci
npm run test:content
npm run lint
npm run build
```

In `pifydev/gitbook`:

```powershell
bun install --frozen-lockfile
bun run format:check
bun run lint
bun run typecheck
bun run unit
bun run build
```

Expected: every command exits 0.

- [ ] **Step 3: Verify origin publications from operator input**

```powershell
$gitBookEnOrigin = (Read-Host 'Exact public English GitBook origin URL').TrimEnd('/')
$gitBookViOrigin = (Read-Host 'Exact public Vietnamese GitBook origin URL').TrimEnd('/')
foreach ($origin in @($gitBookEnOrigin, $gitBookViOrigin)) {
    $response = Invoke-WebRequest -Uri $origin -MaximumRedirection 5
    if ($response.StatusCode -ne 200) { throw "Origin failed: $origin" }
}
```

In the GitBook UI confirm both sites are published as **Unlisted**, Git Sync points to `content/en` and `content/vi` respectively, Mermaid is enabled, and a push from `pifydev/docs` has synchronized successfully. Record the exact origin URLs locally for Tasks 4-7; never substitute a Preview/editor URL.

- [ ] **Step 4: Recheck DNS without changing it**

```powershell
$existingDocsDns = Resolve-DnsName docs.pify.dev -ErrorAction SilentlyContinue
$existingDocsDns | Format-Table Name,Type,TTL,IPAddress,NameHost
```

Expected at the planned baseline: no record. If a record now exists, capture its complete type, name, value and TTL in the cutover record before proceeding; do not overwrite an unexplained target.

### Task 2: Neutralize upstream-only deployment automation

**Files:**
- Verify: `.github/workflows/ci.yaml`
- Verify: `.github/workflows/css-browser-compatibility.yaml`
- Remote state: GitHub Actions workflows in `pifydev/gitbook`

- [ ] **Step 1: Disable workflows that require GitBook internal credentials**

```powershell
gh workflow disable deploy-preview.yaml --repo pifydev/gitbook
gh workflow disable deploy-staging.yaml --repo pifydev/gitbook
gh workflow disable deploy-production.yaml --repo pifydev/gitbook
gh workflow disable publish.yaml --repo pifydev/gitbook
gh workflow list --all --repo pifydev/gitbook
```

Expected: the four upstream operational workflows show `disabled_manually`; `ci.yaml` and CSS compatibility remain enabled.

- [ ] **Step 2: Verify fork CI on the renderer head**

After the renderer head is pushed, watch the CI run created by that push:

```powershell
$rendererHead = git rev-parse HEAD
$rendererRunId = gh run list --workflow ci.yaml --repo pifydev/gitbook --branch main --commit $rendererHead --limit 1 --json databaseId --jq '.[0].databaseId'
if (-not $rendererRunId) { throw 'Renderer CI run was not found' }
gh run watch $rendererRunId --repo pifydev/gitbook --exit-status
```

Expected: format, lint, unit, build and typecheck jobs pass without GitBook internal secrets.

- [ ] **Step 3: Document the remote workflow state**

Add the disabled workflow names and the successful CI run URL to `PIFY_PATCHES.md`, then commit:

```powershell
git add PIFY_PATCHES.md
git commit -m "docs(pify): record fork automation policy"
git push origin main
```

### Task 3: Add a deterministic HTTP smoke probe

**Files:**
- Create: `packages/gitbook/scripts/pify-smoke.ts`
- Create: `packages/gitbook/scripts/pify-smoke.test.ts`
- Modify: `packages/gitbook/package.json`

- [ ] **Step 1: Write failing parser tests**

Create `pify-smoke.test.ts`:

```ts
import { describe, expect, it } from 'bun:test';
import { inspectPifyHTML } from './pify-smoke';

describe('inspectPifyHTML', () => {
    const html = `<!doctype html><html><head>
        <link rel="canonical" href="https://docs.pify.dev/en/ch01-overview">
        <link rel="alternate" hreflang="en" href="https://docs.pify.dev/en/ch01-overview">
        <link rel="alternate" hreflang="vi" href="https://docs.pify.dev/vi/ch01-overview">
        <link rel="alternate" hreflang="x-default" href="https://docs.pify.dev/en/ch01-overview">
        </head><body><a href="/en/ch02-three-layer-arch">Next</a><span>Pify Docs</span></body></html>`;

    it('accepts exact canonical and bilingual alternates', () => {
        expect(
            inspectPifyHTML(html, {
                canonical: 'https://docs.pify.dev/en/ch01-overview',
                alternates: {
                    en: 'https://docs.pify.dev/en/ch01-overview',
                    vi: 'https://docs.pify.dev/vi/ch01-overview',
                    'x-default': 'https://docs.pify.dev/en/ch01-overview',
                },
                forbiddenHosts: ['pify.gitbook.io'],
            }),
        ).toEqual([]);
    });

    it('reports canonical, alternate and origin leaks', () => {
        const errors = inspectPifyHTML(
            html.replace('/en/ch02-three-layer-arch', 'https://pify.gitbook.io/docs-en/ch02-three-layer-arch'),
            {
                canonical: 'https://docs.pify.dev/vi/ch01-overview',
                alternates: { vi: 'https://docs.pify.dev/vi/ch01-overview' },
                forbiddenHosts: ['pify.gitbook.io'],
            },
        );
        expect(errors).toContain('canonical mismatch');
        expect(errors).toContain('alternate vi mismatch');
        expect(errors).toContain('forbidden origin leak: pify.gitbook.io');
    });
});
```

Run `bun test packages/gitbook/scripts/pify-smoke.test.ts`; expected FAIL because the module does not exist.

- [ ] **Step 2: Implement the parser and executable probe**

Create `pify-smoke.ts`:

```ts
type Inspection = {
    canonical: string;
    alternates: Record<string, string>;
    forbiddenHosts: string[];
};

function linkTags(html: string): string[] {
    return html.match(/<link\b[^>]*>/gi) ?? [];
}

function attr(tag: string, name: string): string | null {
    const match = tag.match(new RegExp(`\\b${name}=["']([^"']+)["']`, 'i'));
    return match?.[1] ?? null;
}

export function inspectPifyHTML(html: string, expected: Inspection): string[] {
    const errors: string[] = [];
    const links = linkTags(html);
    const canonical = links.find((tag) => attr(tag, 'rel') === 'canonical');
    if (!canonical || attr(canonical, 'href') !== expected.canonical) errors.push('canonical mismatch');
    for (const [locale, url] of Object.entries(expected.alternates)) {
        const alternate = links.find(
            (tag) => attr(tag, 'rel') === 'alternate' && attr(tag, 'hreflang') === locale,
        );
        if (!alternate || attr(alternate, 'href') !== url) errors.push(`alternate ${locale} mismatch`);
    }
    for (const host of expected.forbiddenHosts) {
        if (html.toLowerCase().includes(host.toLowerCase())) errors.push(`forbidden origin leak: ${host}`);
    }
    if (!html.includes('Pify Docs')) errors.push('Pify branding missing');
    return errors;
}

async function requireResponse(url: string, expectedStatus: number, init?: RequestInit): Promise<Response> {
    const response = await fetch(url, { redirect: 'manual', ...init });
    if (response.status !== expectedStatus) {
        throw new Error(`${url}: expected ${expectedStatus}, received ${response.status}`);
    }
    return response;
}

async function verifyPage(
    baseURL: string,
    canonicalOrigin: string,
    path: string,
    forbiddenHosts: string[],
) {
    const response = await requireResponse(`${baseURL}${path}`, 200);
    if (response.url.includes('gitbook.io') || response.url.includes('gitbook.com')) {
        throw new Error(`${path}: response escaped to GitBook origin`);
    }
    const locale = path.split('/')[1];
    const suffix = path.split('/').slice(2).join('/');
    const canonical = `${canonicalOrigin}/${locale}/${suffix}`.replace(/\/$/, '');
    const alternates = {
        en: `${canonicalOrigin}/en/${suffix}`.replace(/\/$/, ''),
        vi: `${canonicalOrigin}/vi/${suffix}`.replace(/\/$/, ''),
        'x-default': `${canonicalOrigin}/en/${suffix}`.replace(/\/$/, ''),
    };
    const errors = inspectPifyHTML(await response.text(), { canonical, alternates, forbiddenHosts });
    if (errors.length) throw new Error(`${path}: ${errors.join('; ')}`);
}

export async function runPifySmoke() {
    const baseURL = process.env.PIFY_SMOKE_BASE_URL?.replace(/\/$/, '');
    const canonicalOrigin = (process.env.PIFY_SMOKE_CANONICAL_ORIGIN ?? baseURL)?.replace(/\/$/, '');
    const forbiddenHosts = (process.env.PIFY_SMOKE_FORBIDDEN_HOSTS ?? '')
        .split(',')
        .map((host) => host.trim())
        .filter(Boolean);
    if (!baseURL || !canonicalOrigin) throw new Error('PIFY_SMOKE_BASE_URL is required');
    const parsed = new URL(baseURL);
    if (parsed.protocol !== 'https:' && parsed.hostname !== 'localhost') {
        throw new Error('Smoke target must use HTTPS outside localhost');
    }

    const root = await requireResponse(`${baseURL}/`, 302, {
        headers: { 'accept-language': 'en-US,en;q=0.9' },
    });
    if (new URL(root.headers.get('location') ?? '', baseURL).toString() !== `${baseURL}/en/`) {
        throw new Error('root locale redirect mismatch');
    }

    for (const path of ['/en/', '/vi/', '/en/ch01-overview', '/vi/ch01-overview']) {
        await verifyPage(baseURL, canonicalOrigin, path, forbiddenHosts);
    }
    for (const path of ['/en/llms.txt', '/vi/llms.txt', '/en/sitemap.xml', '/vi/sitemap.xml']) {
        const response = await requireResponse(`${baseURL}${path}`, 200);
        const body = await response.text();
        for (const host of forbiddenHosts) {
            if (body.toLowerCase().includes(host.toLowerCase())) {
                throw new Error(`${path}: forbidden origin leak: ${host}`);
            }
        }
    }

    const missing = await requireResponse(`${baseURL}/vi/khong-ton-tai`, 404);
    if (!(await missing.text()).includes('Không tìm thấy trang')) throw new Error('localized 404 missing');
    const health = await requireResponse(`${baseURL}/~pify/health`, 200);
    const payload = (await health.json()) as { status?: string };
    if (payload.status !== 'ready') throw new Error('health endpoint is not ready');
}

if (import.meta.main) {
    await runPifySmoke();
    console.log('Pify smoke checks passed');
}
```

- [ ] **Step 3: Register, test and commit the probe**

Add to `packages/gitbook/package.json`:

```json
{
  "smoke:pify": "bun scripts/pify-smoke.ts"
}
```

Then run:

```powershell
bun test packages/gitbook/scripts/pify-smoke.test.ts
bun --cwd packages/gitbook typecheck
git add packages/gitbook/scripts/pify-smoke.ts packages/gitbook/scripts/pify-smoke.test.ts packages/gitbook/package.json
git commit -m "test(pify): add deployment smoke probe"
git push origin main
```

Expected: parser tests and typecheck PASS.

### Task 4: Create and configure the Vercel project

**Remote state:**
- Create/link: Vercel project `pify-docs`
- Connect: Git repository `pifydev/gitbook`
- Configure: Build root, Bun install/build commands, Preview and Production variables

- [ ] **Step 1: Authenticate, link and connect Git**

Run from the renderer repository root:

```powershell
bunx vercel@50.37.3 login
bunx vercel@50.37.3 link --yes --project pify-docs
bunx vercel@50.37.3 git connect --yes
bunx vercel@50.37.3 project inspect pify-docs
```

Expected: the linked project is `pify-docs` and its Git repository is `pifydev/gitbook`. Verify `.vercel/` remains ignored by Git.

- [ ] **Step 2: Set exact monorepo build settings in Vercel**

In Project Settings → Build and Deployment configure:

| Setting | Exact value |
| --- | --- |
| Framework Preset | Next.js |
| Root Directory | `packages/gitbook` |
| Include source files outside Root Directory | Enabled |
| Install Command | `cd ../.. && bun install --frozen-lockfile` |
| Build Command | `bun run build` |
| Output Directory | Next.js default; no override |
| Node.js Version | 22.x |
| Production Branch | `main` |

Keep automatic Git deployments enabled. Set Preview Deployment Protection to Off for this public documentation project so Playwright can verify PR previews without a bypass secret.

- [ ] **Step 3: Configure Preview variables**

Reuse `$gitBookEnOrigin` and `$gitBookViOrigin` from Task 1:

```powershell
'true' | bunx vercel@50.37.3 env add PIFY_DOCS_ENABLED preview --force
$gitBookEnOrigin | bunx vercel@50.37.3 env add PIFY_GITBOOK_EN_ORIGIN preview --force
$gitBookViOrigin | bunx vercel@50.37.3 env add PIFY_GITBOOK_VI_ORIGIN preview --force
'vercel' | bunx vercel@50.37.3 env add GITBOOK_RUNTIME preview --force
'true' | bunx vercel@50.37.3 env add GITBOOK_DISABLE_TRACKING preview --force
bunx vercel@50.37.3 env ls preview
```

`PIFY_CANONICAL_ORIGIN` must be absent from Preview so the renderer uses the deployment's `VERCEL_URL`. If `vercel env ls preview` shows it, remove it with `bunx vercel@50.37.3 env rm PIFY_CANONICAL_ORIGIN preview --yes`.

- [ ] **Step 4: Configure Production variables**

```powershell
'true' | bunx vercel@50.37.3 env add PIFY_DOCS_ENABLED production --force
$gitBookEnOrigin | bunx vercel@50.37.3 env add PIFY_GITBOOK_EN_ORIGIN production --force
$gitBookViOrigin | bunx vercel@50.37.3 env add PIFY_GITBOOK_VI_ORIGIN production --force
'https://docs.pify.dev' | bunx vercel@50.37.3 env add PIFY_CANONICAL_ORIGIN production --force
'vercel' | bunx vercel@50.37.3 env add GITBOOK_RUNTIME production --force
'true' | bunx vercel@50.37.3 env add GITBOOK_DISABLE_TRACKING production --force
bunx vercel@50.37.3 env ls production
```

Expected: five Preview keys and six Production keys exist. Values are not printed into the repository.

### Task 5: Deploy and accept a Vercel Preview

**Remote state:**
- Create: Vercel Preview deployment
- Verify: HTTP smoke, Playwright, visual and origin-isolation gates

- [ ] **Step 1: Create a preview from the renderer head**

```powershell
$previewOutput = bunx vercel@50.37.3 deploy --yes
$previewUrl = ($previewOutput | Select-String -Pattern 'https://[^\s]+\.vercel\.app' -AllMatches).Matches.Value | Select-Object -Last 1
if (-not $previewUrl) { throw 'Vercel preview URL was not found' }
bunx vercel@50.37.3 inspect $previewUrl --wait
```

Expected: deployment reaches Ready. If Git integration creates a second Preview for the commit, select the deployment whose source SHA equals `git rev-parse HEAD` and record that URL.

- [ ] **Step 2: Run HTTP and browser acceptance**

```powershell
$env:PIFY_SMOKE_BASE_URL = $previewUrl
$env:PIFY_SMOKE_CANONICAL_ORIGIN = $previewUrl
$env:PIFY_SMOKE_FORBIDDEN_HOSTS = "$(([uri]$gitBookEnOrigin).Host),$(([uri]$gitBookViOrigin).Host)"
bun --cwd packages/gitbook smoke:pify
$env:PIFY_E2E_BASE_URL = $previewUrl
bun --cwd packages/gitbook e2e:pify
```

Expected: smoke and six Playwright tests PASS.

- [ ] **Step 3: Perform the visual acceptance matrix**

Inspect these exact pages at 1440×900 and 390×844:

| Locale | Home | Long article | How-to | Reference |
| --- | --- | --- | --- | --- |
| EN | `/en/` | `/en/ch06-messages` | `/en/how-to/add-custom-tool` | `/en/reference/api` |
| VI | `/vi/` | `/vi/ch06-messages` | `/vi/how-to/add-custom-tool` | `/vi/reference/api` |

For each page verify logo contrast in light/dark mode, readable line length, fixed header behavior, sidebar/TOC scrolling, code overflow, Mermaid rendering and focus-visible keyboard navigation. Search once in EN and once in VI; every result must remain inside the active locale on the Preview hostname. Reject the Preview if DevTools Network or DOM contains either origin host in a navigable URL.

- [ ] **Step 4: Inspect runtime errors**

```powershell
bunx vercel@50.37.3 logs $previewUrl --level error --since 30m
```

Expected: no Pify routing exception, origin redirect rejection or repeated content lookup failure.

### Task 6: Build Production before changing DNS

**Remote state:**
- Create: Vercel Production deployment on its generated hostname
- Do not yet create or change DNS records

- [ ] **Step 1: Deploy the accepted SHA to Production**

```powershell
$acceptedSha = git rev-parse HEAD
$productionOutput = bunx vercel@50.37.3 deploy --prod --yes
$productionUrl = ($productionOutput | Select-String -Pattern 'https://[^\s]+\.vercel\.app' -AllMatches).Matches.Value | Select-Object -Last 1
if (-not $productionUrl) { throw 'Vercel production URL was not found' }
bunx vercel@50.37.3 inspect $productionUrl --wait
```

Verify the deployment source SHA equals `$acceptedSha` in Vercel before continuing.

- [ ] **Step 2: Smoke the production deployment with future canonical metadata**

```powershell
$env:PIFY_SMOKE_BASE_URL = $productionUrl
$env:PIFY_SMOKE_CANONICAL_ORIGIN = 'https://docs.pify.dev'
$env:PIFY_SMOKE_FORBIDDEN_HOSTS = "$(([uri]$gitBookEnOrigin).Host),$(([uri]$gitBookViOrigin).Host)"
bun --cwd packages/gitbook smoke:pify
```

Expected: content is reachable from the generated hostname while canonical and alternate tags already point to `https://docs.pify.dev`. This temporary mismatch is acceptable because the generated production hostname is not announced or indexed.

- [ ] **Step 3: Capture the deployment rollback anchor**

```powershell
bunx vercel@50.37.3 list pify-docs --prod
bunx vercel@50.37.3 inspect $productionUrl
```

Record the accepted SHA, production deployment ID/URL and timestamp in the operations record. If there is a prior good production deployment, record its ID as the first rollback target.

### Task 7: Attach `docs.pify.dev` and complete DNS cutover

**Remote state:**
- Add: custom domain to Vercel project
- Add: the exact DNS record Vercel requests
- Verify: DNS propagation and managed TLS

- [ ] **Step 1: Add and inspect the domain without guessing DNS values**

```powershell
bunx vercel@50.37.3 domains add docs.pify.dev pify-docs
bunx vercel@50.37.3 domains inspect docs.pify.dev
```

Copy the exact record type, name and value returned by `domains inspect`. Do not hard-code a generic Vercel CNAME: Vercel may provide a project-specific target.

- [ ] **Step 2: Apply the single delegated DNS record**

At the authoritative DNS provider for `pify.dev`, add only the `docs` record requested by Vercel. Do not change apex, `www`, mail or landing-page records. Use TTL 300 during launch when the provider permits it. Capture a screenshot or provider change ID in the operations record.

- [ ] **Step 3: Wait for DNS and certificate readiness**

```powershell
Resolve-DnsName docs.pify.dev
bunx vercel@50.37.3 domains inspect docs.pify.dev
$tls = Invoke-WebRequest -Uri 'https://docs.pify.dev/~pify/health' -MaximumRedirection 0
if ($tls.StatusCode -ne 200) { throw 'Production health check failed after DNS cutover' }
```

Expected: DNS resolves to the Vercel-provided target, Vercel reports the domain verified, HTTPS presents a valid certificate for `docs.pify.dev`, and health returns 200. Do not continue on certificate warnings.

- [ ] **Step 4: Run the complete production gate**

```powershell
$env:PIFY_SMOKE_BASE_URL = 'https://docs.pify.dev'
$env:PIFY_SMOKE_CANONICAL_ORIGIN = 'https://docs.pify.dev'
$env:PIFY_SMOKE_FORBIDDEN_HOSTS = "$(([uri]$gitBookEnOrigin).Host),$(([uri]$gitBookViOrigin).Host)"
bun --cwd packages/gitbook smoke:pify
$env:PIFY_E2E_BASE_URL = 'https://docs.pify.dev'
bun --cwd packages/gitbook e2e:pify
bunx vercel@50.37.3 logs --environment production --level error --since 30m
```

Expected: smoke and Playwright PASS; production logs contain no routing/origin errors.

### Task 8: Record launch evidence and verify public behavior

**Files:**
- Create: `docs/operations/2026-08-22-docs-cutover.md`

- [ ] **Step 1: Create the operations record with actual values**

The file must contain:

- accepted renderer commit SHA and public GitHub commit URL;
- Vercel project, Preview URL, Production deployment ID/URL and deployment timestamp;
- GitBook EN/VI origin hosts marked as unlisted, without tokens or query strings;
- DNS provider change ID, exact record, TTL, verification time and TLS verification time;
- output summary for renderer CI, content CI, HTTP smoke and Playwright;
- link to the final Astro GitHub Pages deployment used as fallback;
- rollback commands and the last known good Vercel deployment ID.

Populate every field from command output collected in Tasks 1-7. Do not commit empty fields, template markers or credentials.

- [ ] **Step 2: Check public and SEO surfaces independently**

```powershell
$publicChecks = @(
    'https://docs.pify.dev/',
    'https://docs.pify.dev/en/',
    'https://docs.pify.dev/vi/',
    'https://docs.pify.dev/en/ch01-overview',
    'https://docs.pify.dev/vi/ch01-overview',
    'https://docs.pify.dev/en/llms.txt',
    'https://docs.pify.dev/vi/llms.txt',
    'https://docs.pify.dev/en/sitemap.xml',
    'https://docs.pify.dev/vi/sitemap.xml'
)
foreach ($url in $publicChecks) {
    $response = Invoke-WebRequest -Uri $url -MaximumRedirection 5
    [pscustomobject]@{ Url = $url; Status = $response.StatusCode; Final = $response.BaseResponse.RequestMessage.RequestUri }
}
```

Expected: locale content and machine-readable surfaces return 200; `/` resolves by preference to `/en/` or `/vi/`; no final URL uses a GitBook origin hostname.

- [ ] **Step 3: Commit and publish the launch record**

```powershell
git add docs/operations/2026-08-22-docs-cutover.md
git commit -m "docs(ops): record docs.pify.dev cutover"
git push origin main
```

### Task 9: Observe for seven days, then replace Astro Pages with redirects

**Files:**
- Create: `legacy-pages/redirect.js`
- Create: `legacy-pages/index.html`
- Create: `legacy-pages/404.html`
- Create: `legacy-pages/.nojekyll`
- Create: `scripts/legacy-redirect.test.mjs`
- Modify: `.github/workflows/deploy.yml`

- [ ] **Step 1: Tag the recoverable Astro fallback before changing Pages**

After seven consecutive days with successful health checks and no unresolved production incident:

```powershell
git tag -a astro-github-pages-final -m "Final Astro GitHub Pages fallback before GitBook redirect cutover"
git push origin astro-github-pages-final
```

Verify `https://pifydev.github.io/docs/en/` and `/vi/` still return 200 at the tagged deployment.

- [ ] **Step 2: Write failing legacy path tests**

Create `scripts/legacy-redirect.test.mjs`:

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { mapLegacyURL } from '../legacy-pages/redirect.js';

test('preserves English and Vietnamese semantic paths', () => {
  assert.equal(mapLegacyURL('/docs/en/ch03-agent-loop', '?x=1', '#loop', 'en'), 'https://docs.pify.dev/en/ch03-agent-loop?x=1#loop');
  assert.equal(mapLegacyURL('/docs/vi/how-to/add-custom-tool', '', '', 'en'), 'https://docs.pify.dev/vi/how-to/add-custom-tool');
});

test('maps retired Chinese and unprefixed paths to English', () => {
  assert.equal(mapLegacyURL('/docs/zh/ch04-model-invocation', '', '', 'vi'), 'https://docs.pify.dev/en/ch04-model-invocation');
  assert.equal(mapLegacyURL('/docs/changelog', '', '', 'vi'), 'https://docs.pify.dev/en/changelog');
});

test('uses the preferred locale only for the legacy root', () => {
  assert.equal(mapLegacyURL('/docs/', '', '', 'vi'), 'https://docs.pify.dev/vi/');
  assert.equal(mapLegacyURL('/docs', '', '', 'en'), 'https://docs.pify.dev/en/');
});
```

Run `node --test scripts/legacy-redirect.test.mjs`; expected FAIL because the redirect module does not exist.

- [ ] **Step 3: Implement the redirect-only artifact**

Create `legacy-pages/redirect.js`:

```js
export function mapLegacyURL(pathname, search = '', hash = '', preferredLocale = 'en') {
  const stripped = pathname.replace(/^\/docs(?=\/|$)/, '') || '/';
  let targetPath;
  if (/^\/zh(?=\/|$)/.test(stripped)) targetPath = stripped.replace(/^\/zh(?=\/|$)/, '/en');
  else if (/^\/(en|vi)(?=\/|$)/.test(stripped)) targetPath = stripped;
  else if (stripped === '/') targetPath = `/${preferredLocale === 'vi' ? 'vi' : 'en'}/`;
  else targetPath = `/en${stripped.startsWith('/') ? stripped : `/${stripped}`}`;
  return `https://docs.pify.dev${targetPath}${search}${hash}`;
}

if (typeof window !== 'undefined') {
  const preferredLocale = /^vi(?:-|$)/i.test(navigator.language) ? 'vi' : 'en';
  window.location.replace(mapLegacyURL(location.pathname, location.search, location.hash, preferredLocale));
}
```

Create identical `index.html` and `404.html` shells:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="robots" content="noindex">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta http-equiv="refresh" content="2;url=https://docs.pify.dev/en/">
    <title>Pify Docs moved</title>
    <script type="module" src="/docs/redirect.js"></script>
  </head>
  <body>
    <p>Pify Docs moved to <a href="https://docs.pify.dev/en/">docs.pify.dev</a>.</p>
  </body>
</html>
```

Create the empty `legacy-pages/.nojekyll` file with `apply_patch`.

- [ ] **Step 4: Replace the Pages workflow only after tests pass**

Replace `.github/workflows/deploy.yml` with:

```yaml
name: Deploy legacy redirects

on:
  push:
    branches: [main]
    paths:
      - legacy-pages/**
      - .github/workflows/deploy.yml
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/upload-pages-artifact@v3
        with:
          path: legacy-pages
      - id: deployment
        uses: actions/deploy-pages@v4
```

Run and commit:

```powershell
node --test scripts/legacy-redirect.test.mjs
npm run test:content
npm run lint
git add legacy-pages scripts/legacy-redirect.test.mjs .github/workflows/deploy.yml
git commit -m "chore(pages): redirect legacy docs to docs.pify.dev"
git push origin main
$pagesHead = git rev-parse HEAD
$pagesRunId = gh run list --workflow deploy.yml --repo pifydev/docs --branch main --commit $pagesHead --limit 1 --json databaseId --jq '.[0].databaseId'
if (-not $pagesRunId) { throw 'Legacy Pages deployment run was not found' }
gh run watch $pagesRunId --repo pifydev/docs --exit-status
```

Expected: old EN/VI deep links redirect to the same path on `docs.pify.dev`; retired ZH and unprefixed paths redirect to English; the redirect page is `noindex`.

- [ ] **Step 5: Add an optional landing-page redirect only on the verified landing repository**

If `https://pify.dev/docs` currently exists or inbound links use it, implement these exact mappings in the landing deployment:

| Source | Destination | Status |
| --- | --- | --- |
| `/docs` | `https://docs.pify.dev/` | 308 |
| `/docs/:path*` | `https://docs.pify.dev/:path*` | 308 |

Test the landing page `/` before and after; it must remain 200 and visually unchanged. Test both redirect URLs with `curl.exe -I`. If the landing repository or platform cannot be proven from local/remote metadata, skip this optional step and record the dependency instead of guessing.

### Task 10: Exercise both rollback paths and close the cutover

**Remote state:**
- Verify: Vercel deployment rollback
- Verify: DNS/provider rollback information
- Verify: GitHub Pages Astro recovery tag

- [ ] **Step 1: Verify application rollback without causing an incident**

Use `bunx vercel@50.37.3 list pify-docs --prod` to identify the current and previous healthy deployment. Do not run rollback on live traffic solely as a drill. Verify the exact recovery command is recorded:

```powershell
$rollbackTarget = (Read-Host 'Healthy Vercel deployment ID or URL recorded in Task 6').Trim()
if (-not $rollbackTarget) { throw 'A recorded rollback target is required' }
bunx vercel@50.37.3 rollback $rollbackTarget
```

Do not execute this command during a healthy-production drill; retain it as the verified incident command.

- [ ] **Step 2: Verify DNS/provider rollback information**

Record how to remove or restore the `docs` record at the authoritative provider, including the provider change ID and the pre-cutover state from Task 1. Because the observed baseline is NXDOMAIN, provider-wide Vercel failure rollback means removing the new `docs` record and directing users to the still-available `https://pifydev.github.io/docs` fallback through the landing page/status communication; do not point a bare CNAME at GitHub Pages without configuring GitHub's custom-domain and TLS flow.

- [ ] **Step 3: Verify Astro Pages can be restored from the tag**

Create a temporary branch from `astro-github-pages-final`, run `npm ci`, `npm run lint` and `npm run build`, and confirm `dist` is produced. Do not force-push it. The recorded emergency procedure is to revert the redirect-workflow commit or restore the tagged workflow/content in a reviewed commit, then deploy through GitHub Actions.

- [ ] **Step 4: Final production verification**

```powershell
$env:PIFY_SMOKE_BASE_URL = 'https://docs.pify.dev'
$env:PIFY_SMOKE_CANONICAL_ORIGIN = 'https://docs.pify.dev'
bun --cwd packages/gitbook smoke:pify
$env:PIFY_E2E_BASE_URL = 'https://docs.pify.dev'
bun --cwd packages/gitbook e2e:pify
git status --short
```

Expected: both suites PASS; tracked worktrees are clean; unrelated pre-existing untracked files remain untouched.

## Completion gate

The cutover is complete only when:

- Vercel Git integration builds the public `pifydev/gitbook` fork with the declared monorepo settings.
- Upstream secret-dependent deploy/publish workflows are disabled while fork CI remains green.
- Preview and pre-domain Production pass smoke, Playwright, responsive visual review, search and origin-leak checks.
- `docs.pify.dev` resolves to the exact Vercel-issued DNS target with valid TLS.
- Production `/en/*`, `/vi/*`, locale redirect, 404, health, `llms.txt` and sitemap surfaces pass.
- The cutover record contains real commit, deployment, DNS, test and rollback evidence without secrets.
- Astro GitHub Pages remains available for seven healthy days, then legacy deep links redirect to the matching new locale/path.
- A real Vercel rollback target and the `astro-github-pages-final` recovery tag are verified.
