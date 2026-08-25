import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import matter from "gray-matter";

const RELEASE_COMMIT = "4e58f324fae8ebfa98a3d45181fb248072a2afac";
const GUIDE_PATHS = {
  en: new URL("../content/en/how-to/run-pi-evals.md", import.meta.url),
  vi: new URL("../content/vi/how-to/run-pi-evals.md", import.meta.url),
};
const EXACT_CHECKOUT = `git clone https://github.com/earendil-works/pi.git
cd pi
git checkout ${RELEASE_COMMIT}
npm install`;

function extractCommandFences(source) {
  return [
    ...source.matchAll(/```(?:bash|sh|shell|powershell)\s*\n([\s\S]*?)```/gi),
  ].map((match) => match[1]);
}

function extractWarningCallouts(source) {
  return [...source.matchAll(/^:::caution[^\n]*\n([\s\S]*?)^:::\s*$/gm)].map(
    (match) => match[1],
  );
}

function markdownShape(source) {
  return {
    headings: [...source.matchAll(/^(#{2,6})\s+/gm)].map(
      (match) => match[1].length,
    ),
    fenceLanguages: [...source.matchAll(/^```([^\s`]*)/gm)].map(
      (match) => match[1],
    ),
    tables: (source.match(/^\|.*\|$/gm) ?? []).length,
    warnings: extractWarningCallouts(source).length,
    links: [...source.matchAll(/\]\(([^)]+)\)/g)].map((match) => match[1]),
  };
}

const localeContracts = {
  en: {
    privatePackage:
      /`packages\/evals`[^.]*private monorepo package[^.]*not an npm install target/i,
    smoke: /smoke eval/i,
    harness: /(?:Pi )?coding-agent harness|`pi-harness\.ts`/i,
    deterministicJudge: /deterministic judge/i,
    modelJudge: /model-backed judge/i,
    comparison: /baseline[^.]*candidate|candidate[^.]*baseline/i,
    repetitions: /repetitions?/i,
    telemetry: /telemetry/i,
    artifacts: /artifacts?/i,
    cleanup: /cleanup|clean up/i,
    optionalModelExecution:
      /model-backed (?:execution|evaluation)[^.]*optional|optional[^.]*model-backed (?:execution|evaluation)/i,
    infraVsVerdict:
      /infrastructure (?:error|failure)[^.]*task verdict|task verdict[^.]*infrastructure (?:error|failure)/i,
    redaction: /redact(?:ion|ed|ing)?/i,
    warningCost: /cost/i,
    warningSensitive: /sensitive (?:session )?artifacts?/i,
  },
  vi: {
    privatePackage:
      /`packages\/evals`[^.\n]*private monorepo package[^.\n]*(?:không phải|không là)[^.\n]*npm install target/i,
    smoke: /smoke eval/i,
    harness: /(?:Pi )?coding-agent harness|`pi-harness\.ts`/i,
    deterministicJudge: /deterministic judge/i,
    modelJudge: /model-backed judge/i,
    comparison: /baseline[^.\n]*candidate|candidate[^.\n]*baseline/i,
    repetitions: /repetitions?/i,
    telemetry: /telemetry/i,
    artifacts: /artifacts?/i,
    cleanup: /cleanup|dọn dẹp/i,
    optionalModelExecution:
      /model-backed (?:execution|evaluation)[^.\n]*(?:tùy chọn|không bắt buộc)|(?:tùy chọn|không bắt buộc)[^.\n]*model-backed (?:execution|evaluation)/i,
    infraVsVerdict:
      /(?:infrastructure error|lỗi hạ tầng)[^.\n]*task verdict|task verdict[^.\n]*(?:infrastructure error|lỗi hạ tầng)/i,
    redaction: /redact|che(?: đi)? dữ liệu|loại bỏ dữ liệu nhạy cảm/i,
    warningCost: /chi phí|cost/i,
    warningSensitive: /artifact[^.\n]*nhạy cảm|nhạy cảm[^.\n]*artifact/i,
  },
};

test("the paired Pi eval guides satisfy the release-pinned workflow contract", async () => {
  const documents = await Promise.all(
    Object.entries(GUIDE_PATHS).map(async ([locale, url]) => {
      const source = await readFile(url, "utf8");
      return { locale, source, frontmatter: matter(source).data };
    }),
  );

  for (const { locale, source, frontmatter } of documents) {
    const contract = localeContracts[locale];
    assert.equal(frontmatter.translation_key, "how-to-run-pi-evals");
    assert.equal(frontmatter.language, locale);
    assert.equal(frontmatter.status, "reviewed");
    assert.equal(frontmatter.reviewed_by, "Pify maintainers");
    assert.equal(frontmatter.last_updated, "2026-08-25");
    assert.deepEqual(frontmatter.terms_used, [
      "harness",
      "judge",
      "verdict",
      "fixture",
      "held-out evaluation",
      "fail-closed",
    ]);
    assert.equal(
      source.includes(RELEASE_COMMIT),
      true,
      `${locale}: exact release commit`,
    );
    assert.equal(
      source.includes(EXACT_CHECKOUT),
      true,
      `${locale}: exact source checkout commands`,
    );
    for (const [name, pattern] of Object.entries(contract)) {
      assert.match(source, pattern, `${locale}: ${name}`);
    }

    const commandFences = extractCommandFences(source);
    assert.ok(
      commandFences.length >= 4,
      `${locale}: runnable command examples`,
    );
    for (const command of commandFences) {
      assert.doesNotMatch(
        command,
        /(?:npm|pnpm|yarn|bun)(?:\s+\S+)*\s+(?:add|install|i)\b[^\n]*@earendil-works\/pi-evals/i,
        `${locale}: @earendil-works/pi-evals must not be installed from npm`,
      );
    }

    const warnings = extractWarningCallouts(source);
    assert.ok(warnings.length >= 1, `${locale}: visual warning callout`);
    assert.ok(
      warnings.some(
        (warning) =>
          contract.warningCost.test(warning) &&
          contract.warningSensitive.test(warning),
      ),
      `${locale}: one warning must cover cost and sensitive artifacts together`,
    );

    const pinnedSourcePaths = [
      "packages/evals/README.md",
      "packages/evals/src/smoke.eval.ts",
      "packages/evals/src/pi-harness.ts",
      "packages/evals/src/vitest-evals/reporter.ts",
      "packages/evals/src/vitest-evals/artifacts.ts",
      "packages/evals/src/vitest-evals/summary.ts",
    ];
    for (const path of pinnedSourcePaths) {
      assert.match(
        source,
        new RegExp(
          `https://github\\.com/earendil-works/pi/blob/${RELEASE_COMMIT}/${path.replaceAll("/", "\\/").replaceAll(".", "\\.")}`,
        ),
        `${locale}: pinned source map link for ${path}`,
      );
    }
  }

  assert.deepEqual(
    markdownShape(documents[0].source),
    markdownShape(documents[1].source),
    "English and Vietnamese guides must have identical structural depth, fences, tables, warnings, and links",
  );
});
