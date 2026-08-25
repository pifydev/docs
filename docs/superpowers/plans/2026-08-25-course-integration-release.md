# Pi SDK and Agent Course Integration Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate all 43 bilingual pairs and the 15-checkpoint workshop into search, clean routing, SEO, machine-readable endpoints, CI, README, changelog, GitHub `main`, and the Vercel production deployment at `docs.pify.dev`.

**Architecture:** Keep the translation manifest as the single route-pair source and Fumadocs as the content/search source. Raise all hardcoded validation expectations to 43 pairs and 86 localized URLs, add route and browser regressions around the nested course group, make CI watch the workshop directory, and release only after the local Node 22 gate, both GitHub Actions workflows, and production route probes pass.

**Tech Stack:** Next.js 16, Fumadocs, Vitest, Node test runner, Playwright Chromium, GitHub Actions, Vercel, Node.js 22.19.0, npm, Git.

---

## Plan boundaries

- Execute only after the foundation, SDK docs, workshop, and course-content plans are green.
- Do not create a second application, deployment project, package lockfile, or public locale.
- Do not push if `origin/main` contains commits that are not ancestors of the completed branch.
- Production is complete only when both GitHub workflows pass for the pushed SHA and Vercel serves that same SHA through `https://docs.pify.dev`.

## Task 1: Raise every content count to the final contract

**Files:**

- Modify: `scripts/content.test.mjs`
- Modify: `scripts/validate-content.mjs`
- Modify: `scripts/fumadocs-migration.test.mjs`
- Modify: `scripts/validate-frontmatter.test.mjs`
- Modify: `scripts/sync-check.test.mjs`
- Modify: `scripts/content-preservation.test.mjs`

- [ ] Search for stale numeric contracts:

  ```bash
  rg -n "23|46|54|27" scripts tests README.md content/en/changelog.md content/vi/changelog.md
  ```

- [ ] Write the final failing assertions first:

  - translation manifest has exactly 43 unique keys, EN paths, and VI paths;
  - validators report 43 synchronized pairs;
  - frontmatter validator reports 86 public files;
  - preservation coverage contains 86 records;
  - migration tests recognize all 43 Fumadocs pages and still reject retired GitBook authoring files.

- [ ] Run the focused Node tests and confirm any stale expectation fails.

- [ ] Update implementation messages and exact arrays to the final numbers. Do not loosen equality checks to minimums.

- [ ] Run:

  ```bash
  npm run test:content
  npm run test:preservation
  npm run lint:frontmatter
  npm run lint:sync
  npm run lint:content
  ```

  Expected result: all pass and printed counts are 43 pairs / 86 public files.

- [ ] Commit the final count contract.

  ```bash
  git add scripts
  git commit -m "test: enforce final bilingual content counts"
  ```

## Task 2: Cover course routes, locale switching, and legacy redirects

**Files:**

- Modify: `tests/routes.test.ts`
- Modify: `tests/seo.test.ts`
- Modify: `tests/e2e/docs.spec.ts`
- Verify: `lib/routes.ts`
- Verify: `lib/seo.ts`
- Verify: `proxy.ts`

- [ ] Add unit tests first for:

  - `toPublicPath("en", "course/index.mdx")` returning `/en/course`;
  - a checkpoint source path returning `/vi/course/07-agent-loop`;
  - relative course Markdown links resolving to clean localized paths;
  - `switchLocale("/en/course/14-agent-evaluation", "vi")` preserving the checkpoint;
  - legacy `/course/07-agent-loop.md`, `/en/course/index.mdx`, and `/vi/course/14-agent-evaluation.md` paths redirecting to clean routes;
  - unknown course slugs falling back only through the existing locale behavior.

- [ ] Update SEO tests from 46 to exactly 86 paths, 43 per locale, and assert both `/en/course` and `/vi/course/14-agent-evaluation` appear once with paired alternates.

- [ ] Run `npm run test:unit`. Expected result: red only if a route helper cannot handle nested index pages or new course routes.

- [ ] Make the smallest route/SEO correction required. Prefer manifest-driven behavior; do not add 32 route literals to production code.

- [ ] Add Playwright redirect cases for nested `.md` and `.mdx` course URLs.

- [ ] Run `npm run test:unit`. Expected result: all unit tests pass.

- [ ] Commit routing coverage.

  ```bash
  git add tests/routes.test.ts tests/seo.test.ts tests/e2e/docs.spec.ts lib/routes.ts lib/seo.ts proxy.ts
  git commit -m "test: cover clean bilingual course routes"
  ```

## Task 3: Verify search, sitemap, LLM endpoints, syntax, and Mermaid

**Files:**

- Modify: `tests/e2e/docs.spec.ts`
- Verify: `app/api/search/route.ts`
- Verify: `app/sitemap.ts`
- Verify: `app/[lang]/llms.txt/route.ts`
- Verify: `app/[lang]/llms-full.txt/route.ts`
- Verify: `lib/llms.ts`
- Verify: `source.config.ts`

- [ ] Update machine-readable E2E expectations to exactly 86 sitemap `<url>` elements and exactly 43 links in each locale's `llms.txt`.

- [ ] Add assertions that:

  - `/en/llms.txt` contains the course overview and Checkpoint 14;
  - `/vi/llms.txt` contains the localized titles for the same entries;
  - `/en/llms-full.txt` contains content unique to Chapter 11 and Checkpoint 14;
  - no machine-readable endpoint publishes a `/zh` URL;
  - every sitemap URL returns success and renders no local `.md` or `.mdx` link.

- [ ] Add a locale-scoped search test using a course-only identifier such as `SCRIPT_EXHAUSTED`. English results must stay under `/en`; Vietnamese results must stay under `/vi`; both must include Checkpoint 04.

- [ ] Add browser checks on `/en/course/07-agent-loop` for visible Shiki token spans and its Mermaid SVG. Re-run after theme toggle to preserve dual-theme highlighting.

- [ ] Run a production build and E2E:

  ```bash
  npm run build
  npm run test:e2e
  ```

  Expected result: all routes build, search is locale-scoped, sitemap has 86 entries, each LLM index has 43 entries, course syntax highlighting works, and Mermaid renders.

- [ ] If manifest-driven code already passes, commit only test changes. If not, make the smallest shared-source correction and add its regression.

  ```bash
  git add tests/e2e/docs.spec.ts app lib source.config.ts
  git commit -m "test: cover course discovery surfaces"
  ```

## Task 4: Verify responsive navigation and same-page language switching

**Files:**

- Modify: `tests/e2e/docs.spec.ts`
- Verify: `components/`
- Verify: `lib/layout.shared.tsx`
- Verify: `content/en/meta.json`
- Verify: `content/vi/meta.json`
- Verify: `content/en/course/meta.json`
- Verify: `content/vi/course/meta.json`

- [ ] Add a desktop journey that opens `/en/course/10-session-tree`, switches to Vietnamese, and asserts `/vi/course/10-session-tree` plus the localized H1.

- [ ] Add a 390×844 mobile journey that opens the sidebar, finds the localized course group between Chapter 11 and Help, expands it if required, and navigates to Checkpoint 14.

- [ ] Assert the course overview and all 15 checkpoint links appear once in the course subtree, keyboard focus remains visible, the drawer closes with Escape, and horizontal overflow stays at most one pixel.

- [ ] Run `npm run test:e2e`. Expected result: the navigation and locale journeys pass in Chromium.

- [ ] If production components require a correction, preserve the current clean visual style and make only the accessibility/navigation change proven by the failing test.

- [ ] Commit navigation coverage.

  ```bash
  git add tests/e2e/docs.spec.ts components lib/layout.shared.tsx content/en/meta.json content/vi/meta.json content/en/course/meta.json content/vi/course/meta.json
  git commit -m "test: verify bilingual course navigation"
  ```

## Task 5: Finalize CI triggers and quality commands

**Files:**

- Modify: `.github/workflows/content-quality.yml`
- Modify: `.github/workflows/deploy.yml`
- Modify: `scripts/ci-config.test.mjs`
- Modify: `package.json`
- Modify: `package-lock.json` only if dependency metadata changed

- [ ] Add or retain failing CI-config assertions that both workflow trigger sets include `course/**` and that the content workflow executes `npm run quality:content` after `npm ci`.

- [ ] Assert `quality:content` includes exactly these new gates in addition to existing gates: `test:release`, `test:evals-guide`, and `test:course`.

- [ ] Keep the application workflow command list `npm ci`, `npm run typecheck`, `npm run build`; course TypeScript is included through `tsconfig.json` and workshop tests run in Content Quality.

- [ ] Ensure both workflows remain read-only, use Node 22 with npm cache, have bounded timeouts, and contain no Vercel credentials or deployment steps.

- [ ] Run `node --test scripts/ci-config.test.mjs` and `npm run quality:content`. Expected result: all pass.

- [ ] Commit CI integration.

  ```bash
  git add .github/workflows scripts/ci-config.test.mjs package.json package-lock.json
  git commit -m "ci: validate Agent workshop and course"
  ```

## Task 6: Complete README and bilingual changelog

**Files:**

- Modify: `README.md`
- Modify: `content/en/changelog.md`
- Modify: `content/vi/changelog.md`
- Modify: `scripts/content.test.mjs`

- [ ] Add failing README/content assertions for the final public counts, Chapter 11, three new How-to guides, 15-checkpoint workshop, root `course/` directory, `test:course`, and one pedagogical research-reference bullet.

- [ ] Update README's included-content summary to:

  - eleven Pi SDK chapters;
  - eight How-to guides;
  - the separate overview plus 15-checkpoint Build Your Own course;
  - 43 synchronized pairs and 86 public documents;
  - the offline workshop and its focused test command.

- [ ] Add `course/` to the repository structure and `npm run test:course` plus `npm run test:course:checkpoint -- course/test/04-deterministic-model.test.ts` to validation guidance.

- [ ] Add one concise source bullet under `Sources and attribution`:

  ```markdown
  - Pedagogical research reference: [hahhforest/pi-textbook](https://github.com/hahhforest/pi-textbook), consulted at commit `20dd3a7d791c2470a87c5172aa0729c3963a6b18`.
  ```

  Do not add a translation/adaptation notice, per-page attribution, NOTICE file, or separate license.

- [ ] Add matching dated changelog entries in English and Vietnamese describing the Pi `0.84.3` refresh, SDK testing/eval/runtime docs, original bilingual course, offline workshop, and 43-pair result.

- [ ] Run `npm run test:content`, `npm run test:editorial`, and `npm run test:preservation`. Expected result: all pass; if changelog baselines need to grow, growth passes without lowering any minimum.

- [ ] Commit project documentation.

  ```bash
  git add README.md content/en/changelog.md content/vi/changelog.md scripts/content.test.mjs content/preservation-manifest.json
  git commit -m "docs: document Pi SDK and Agent course expansion"
  ```

## Task 7: Run the final local release gate on Node 22.19.0

**Files:**

- Verify the full repository.
- Modify only files implicated by a failing command, with a regression test whenever behavior changes.

- [ ] Set the exact local Node version and print it:

  ```powershell
  $env:PATH = "C:\Users\Admin\AppData\Local\nvm\v22.19.0;$env:PATH"
  node --version
  npm --version
  ```

  Expected Node output: `v22.19.0`.

- [ ] Confirm the worktree contains no unrelated changes: `git status --short` and `git diff --stat origin/main HEAD`.

- [ ] Reinstall from the authoritative root lockfile:

  ```bash
  npm ci
  ```

- [ ] Run every release gate in this order:

  ```bash
  npm run test:release
  npm run test:evals-guide
  npm run test:course
  npm run test:content
  npm run test:preservation
  npm run test:editorial
  npm run test:unit
  npm run lint
  npm run format:check
  npm run typecheck
  npm run build
  npm run test:e2e
  git diff --check
  ```

  Expected result: every command exits zero.

- [ ] Confirm exact repository invariants:

  ```bash
  rg --files course/test | Measure-Object
  rg -n "0\\.84\\.2|a470b121" content README.md
  rg -n -i "pi-textbook|translated and adapted|source_commit|cc by" content/en/course content/vi/course
  Get-ChildItem course -Filter package-lock.json -Recurse
  ```

  Expected results: 15 test files; no stale release pins; no per-page research/adaptation notice; no nested lockfile.

- [ ] Inspect the generated production route list and confirm `/en/course`, `/vi/course`, all 30 checkpoint routes, the eight new SDK routes, locale LLM endpoints, sitemap, robots, and API search are present.

- [ ] If a correction was necessary, rerun the focused failing command and then this full gate from the start. Commit corrections with a narrow message.

## Task 8: Review the completed branch before release

**Files:**

- Review all changes from `origin/main` to `HEAD`.

- [ ] Review the diff by subsystem: release pins, SDK docs, workshop, EN course, VI course, application/tests, CI, README/changelog.

- [ ] Verify no existing page lost unique content by comparing preservation output and reviewing any `approvedDeletions` entry. Every deletion must name either `technically-invalid` or `duplicate` evidence.

- [ ] Verify all active SDK source links resolve to release tag `v0.84.3` or commit `4e58f324`; any audited-main reference is labeled unreleased.

- [ ] Verify course-to-workshop links exist and every displayed focused command passes.

- [ ] Verify `LICENSE` remains `GPL-3.0-only`, no NOTICE file was added, and README is the only place that names the pedagogical research reference.

- [ ] Run `git status --short`. Expected result: clean.

## Task 9: Fast-forward production through `main`

**Files:**

- Git remote state only.

- [ ] Fetch the latest production branch without modifying files:

  ```bash
  git fetch origin main
  git merge-base --is-ancestor origin/main HEAD
  ```

  Expected result: the ancestry command exits zero. If it fails, stop and reconcile new remote commits before pushing.

- [ ] Record the release SHA:

  ```powershell
  $releaseSha = git rev-parse HEAD
  $releaseSha
  ```

- [ ] Push the reviewed commit directly to `main` as previously approved:

  ```bash
  git push origin HEAD:main
  ```

- [ ] Read back the remote SHA:

  ```bash
  git ls-remote origin refs/heads/main
  ```

  Expected result: it matches `$releaseSha` exactly.

## Task 10: Monitor GitHub Actions and Vercel production

**Files:**

- External read-only verification after the authorized push.

- [ ] Locate both GitHub Actions runs for `$releaseSha`:

  ```powershell
  gh run list --commit $releaseSha --limit 10
  ```

- [ ] Watch the `Content Quality` and `Next.js Application Build` runs to terminal success. If either fails, inspect its logs, fix locally with a regression, rerun the complete local gate, push the new SHA, and restart monitoring.

- [ ] Wait for the Vercel production deployment triggered from `main`. Read its deployment metadata and confirm the Git commit SHA equals the latest remote `main` SHA and the environment is Production.

- [ ] Probe these production URLs and require HTTP success plus the expected localized H1 or content marker:

  ```text
  https://docs.pify.dev/en/ch11-testing-evaluation
  https://docs.pify.dev/vi/ch11-testing-evaluation
  https://docs.pify.dev/en/how-to/test-agent-deterministically
  https://docs.pify.dev/en/how-to/run-pi-evals
  https://docs.pify.dev/en/how-to/host-session-runtime
  https://docs.pify.dev/en/course
  https://docs.pify.dev/vi/course
  https://docs.pify.dev/en/course/00-complete-agent-trace
  https://docs.pify.dev/vi/course/14-agent-evaluation
  https://docs.pify.dev/sitemap.xml
  https://docs.pify.dev/en/llms.txt
  https://docs.pify.dev/vi/llms-full.txt
  ```

- [ ] Verify production sitemap contains exactly 86 URLs and both locale LLM indexes contain exactly 43 entries.

- [ ] Verify one nested legacy URL redirects cleanly: `https://docs.pify.dev/en/course/07-agent-loop.md` must redirect to `/en/course/07-agent-loop`.

- [ ] In a browser, verify same-checkpoint language switching, locale-scoped course search, mobile sidebar order, syntax highlighting, Mermaid rendering, theme toggle, and favicon on production.

- [ ] Report the final SHA, both successful GitHub Actions run URLs, the Vercel Production deployment URL/alias, and the principal live course URLs.

## Completion criteria

The suite is complete only when local verification is green, `origin/main` points to the reviewed release SHA, both GitHub Actions workflows succeed for that SHA, and Vercel Production serves all 86 localized docs routes with working search, language switching, clean links, syntax highlighting, Mermaid, sitemap, and LLM endpoints.
