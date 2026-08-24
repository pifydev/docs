# Content Depth Restoration Design

**Date:** 2026-08-24  
**Status:** Approved for planning  
**Baseline:** `b10130f6d1b5ced0e8d890882d985c2ba4dbdfdf`  
**Technical source:** Pi upstream `a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c` (`0.84.2`)

## Context

The bilingual editorial pass reduced the public documentation from roughly 124,422 words to 32,202 words. Chapters 1–10 retained only 13–23% of their previous word count. The pass removed bad translation and stale APIs, but it also removed valid explanations, examples, diagrams, and supporting detail.

The restoration must preserve the clearer Fumadocs interface, corrected routes, favicon, syntax highlighting, deployment configuration, and existing quality tooling. It changes documentation content and preservation checks only.

## Goal

Restore the depth, structure, and scope of the English and Vietnamese documentation while correcting inaccurate technical claims and unnatural translation. Content may be removed only when it is demonstrably wrong or duplicated.

## Non-goals

- Reverting the Fumadocs application or visual design.
- Restoring GitBook authoring files or `.md` public URLs.
- Reintroducing the retired `@pi-ai/core`, `@pi-agent-core`, or `@pi-coding-agent` APIs as current guidance.
- Padding pages to reach an arbitrary word count.
- Translating code identifiers, package names, event names, type names, or established IT terms that are clearer in English.

## Preservation-first source model

Each page has three inputs:

1. The `b10130f` version defines the intended structure, subject coverage, examples, and explanatory depth.
2. The current reviewed version supplies verified corrections, terminology decisions, and modern API patterns.
3. The pinned Pi upstream revision is authoritative for package names, signatures, events, configuration, storage formats, and runtime behavior.

The baseline is a content skeleton, not a source of truth for technical details. The upstream revision is a technical source, not a replacement outline for Pify documentation.

## Preservation contract

For every public page pair:

- Map every baseline H2–H4 section to a retained, merged, corrected, or removed outcome.
- Preserve unique explanations, diagrams, tables, scenarios, warnings, and examples that remain useful.
- Preserve the order and learning progression unless a move fixes a concrete comprehension problem.
- Update examples in place when package names, API shapes, file paths, settings, or events have changed.
- Merge repeated passages only when they teach the same fact at the same level of detail.
- Remove a section only when the review ledger records one of two reasons: `technically-invalid` or `duplicate`.
- Do not treat shorter wording as sufficient reason to remove a concept, edge case, or example.

Word count is a diagnostic, not the acceptance criterion. A materially shorter page requires an explicit deletion record and reviewer justification.

## Bilingual editorial contract

English is the canonical technical edition. It should read as direct developer documentation, with complete reasoning where the baseline teaches a mechanism or trade-off.

Vietnamese mirrors the English section hierarchy, code fences, examples, and factual scope. Vietnamese prose should be natural and fully accented. The following remain in English when used as technical terms or exact identifiers:

- package names, import paths, functions, methods, classes, interfaces, types, fields, events, settings, commands, and environment variables;
- established terms such as model, provider, prompt, context, token, tool, stream, runtime, session, message, event, callback, schema, adapter, middleware, retry, fallback, cache, queue, branch, and compaction when translation would be less precise;
- code, filenames, CLI flags, JSON keys, and literal protocol values.

The surrounding sentence must still follow Vietnamese grammar. English terminology must not become an excuse for untranslated prose.

## Technical accuracy

Technical claims are checked against Pi `0.84.2` at the pinned upstream commit. Each restored page records its relevant upstream files in the translation-review ledger.

When the baseline conflicts with upstream:

1. keep the teaching goal and section position;
2. replace the obsolete mechanism with the current one;
3. update every paired example and cross-reference;
4. record the correction when it changes the meaning materially.

Compatibility notes may mention old APIs only to explain migration and must label them as retired or compat-only.

## Review ledger

The restoration ledger extends the existing translation review record with:

- baseline section count;
- restored/merged/removed section count;
- baseline and final code-fence count;
- deletion reason and evidence;
- upstream source paths;
- English review, Vietnamese review, and render status.

A page cannot be marked `reviewed` until all baseline sections have an outcome and both languages pass structural comparison.

## Automated safeguards

The content quality gate will add preservation checks that compare the final page against a committed baseline manifest. The manifest stores structural metrics rather than full copyrighted text:

- expected H2–H4 coverage identifiers;
- minimum code-fence count after approved removals;
- required diagrams, tables, and named examples;
- approved deletions with reasons.

The gate fails when a required section or example disappears, when paired EN/VI structures diverge, or when a page shrinks materially without an approved deletion record. Existing checks for frontmatter, editorial artifacts, links, Mermaid, formatting, application lint, and rendering remain active.

## Delivery sequence

Work proceeds in reviewable batches:

1. preservation manifest and failing tests;
2. start, glossary, FAQ, and changelog;
3. chapters 1–3;
4. chapters 4–6;
5. chapters 7–10;
6. five How-to guides;
7. three Reference pages;
8. final cross-page terminology, link, build, E2E, and production checks.

Each content batch is formatted, linted, built, render-tested, and committed before the next batch.

## Acceptance criteria

- All 23 EN/VI page pairs retain the baseline's valid semantic coverage.
- Every baseline H2–H4 section has a documented outcome.
- Every removed section is proven wrong or duplicate in the ledger.
- Current package names and Pi `0.84.2` APIs are used in active examples.
- Vietnamese prose is natural and accented while exact technical identifiers remain unchanged.
- EN/VI heading structure and code-fence languages match.
- All 46 pages retain reviewed metadata.
- Content tests, editorial tests, unit tests, lint, typecheck, production build, formatting, and E2E pass.
- The GitHub Actions runs for the final `main` commit pass, and production serves the restored content in both locales.
