# GitHub Actions Workflow Cleanup

## Context

`pifydev/docs` is the source repository for the English and Vietnamese GitBook
spaces. The public GitBook renderer lives in `pifydev/gitbook` and deploys to
Vercel. The Astro site in this repository is retained only as buildable rollback
source until the Vercel cutover is accepted.

The current workflows overlap. Every pull request can run the same sync,
frontmatter, and Mermaid checks more than once. Pushes to `main` also attempt a
GitHub Pages deployment even though Pages is not enabled, so a successful build
ends as a failed workflow.

## Decisions

### GitBook content quality

`.github/workflows/content-quality.yml` becomes the single content quality gate.
It uses Node.js 24 and runs:

1. `npm ci`
2. `npm run test:content`
3. `npm run lint:gitbook`
4. `npm run lint`

Pull requests and pushes to `main` trigger the gate when GitBook content, source
material, Astro rollback content, validation scripts, dependency manifests, or
any workflow file changes. Manual dispatch remains available. The workflow uses
read-only repository permissions, a bounded timeout, and cancellation of stale
runs for the same ref.

### Astro rollback build

`.github/workflows/deploy.yml` keeps its filename to avoid unnecessary workflow
identity churn, but its displayed name and behavior change to `Astro Rollback
Build`. It validates that the retained Astro site remains buildable with Node.js
24, `npm ci`, and `npm run build`.

It does not request Pages or OIDC write permissions, upload a Pages artifact, or
call `actions/deploy-pages`. Automatic deployment belongs to the Vercel-connected
renderer repository. GitHub Pages can be introduced later only through a
separate, explicit decision that first enables Pages at repository level.

### Remove the duplicate PR workflow

`.github/workflows/sync-check.yml` is removed. Its checks are fully covered by
the content quality gate, so retaining it would add runner time without adding a
distinct invariant.

## Failure behavior

- Content validation failures block the content quality workflow with the
  failing npm command visible in the job log.
- Astro compilation failures block the rollback build workflow.
- A missing external deployment configuration cannot make this repository red,
  because neither workflow performs an external deployment.

## Regression coverage

`scripts/ci-config.test.mjs` verifies that:

- the content workflow watches all workflow files, uses Node.js 24, and runs the
  complete validation pipeline;
- the rollback workflow builds Astro but contains no GitHub Pages deployment or
  write permissions;
- the duplicate sync workflow no longer exists;
- Mermaid validation continues to use its CI Puppeteer configuration.

Verification before pushing consists of `npm run test:content`,
`npm run lint:gitbook`, `npm run lint`, `npm run build`, `npm run check`, YAML
parsing for every remaining workflow, and `git diff --check`.

## Non-goals

- Enabling GitHub Pages.
- Changing the Vercel project or the `pifydev/gitbook` renderer.
- Changing documentation content, translation rules, or the GitBook space
  configuration.
