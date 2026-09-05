import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import matter from "gray-matter";

const RELEASE_COMMIT = "107d79f11072bbc8a3a757ed7fd69596bee7d68c";
const GUIDE_PATHS = {
  en: new URL("../content/en/how-to/run-pi-evals.md", import.meta.url),
  vi: new URL("../content/vi/how-to/run-pi-evals.md", import.meta.url),
};
const EXACT_CHECKOUT = `git clone https://github.com/earendil-works/pi.git
cd pi
git checkout ${RELEASE_COMMIT}
npm install`;
const PINNED_SOURCE_PATHS = [
  "packages/evals/README.md",
  "packages/evals/src/smoke.eval.ts",
  "packages/evals/src/pi-harness.ts",
  "packages/evals/src/vitest-evals/reporter.ts",
  "packages/evals/src/vitest-evals/artifacts.ts",
  "packages/evals/src/vitest-evals/summary.ts",
];
const PINNED_SOURCE_URLS = PINNED_SOURCE_PATHS.map(
  (path) =>
    `https://github.com/earendil-works/pi/blob/${RELEASE_COMMIT}/${path}`,
);
const EXPECTED_SHELL_COMMANDS = [
  EXACT_CHECKOUT,
  "npm run eval -- --provider openai --model gpt-5.6-sol src/smoke.eval.ts",
  'npm run eval -- --provider openai --model gpt-5.6-sol src/smoke.eval.ts -t "runs a basic prompt end to end"',
  "npm run eval -- --provider openai --model gpt-5.6-sol src/extensions.eval.ts",
  "npm run clean --workspace=@earendil-works/pi-evals",
];

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

function normalizeLineEndings(value) {
  return value.replaceAll("\r\n", "\n");
}

function normalizeShellFenceBody(value) {
  return normalizeLineEndings(value).replace(/\n$/, "");
}

function extractH2Sections(body) {
  const headings = [...body.matchAll(/^## ([^\r\n]+)\r?$/gm)];
  return headings.map((heading, index) => {
    const contentStart = heading.index + heading[0].length;
    const contentEnd = headings[index + 1]?.index ?? body.length;
    return {
      title: heading[1].trim(),
      body: body.slice(contentStart, contentEnd),
    };
  });
}

function requireH2Section(sections, titlePattern, label) {
  const section = sections.find(({ title }) => titlePattern.test(title));
  assert.ok(section, `${label} section is required`);
  return section;
}

function assertMatches(source, pattern, label) {
  assert.match(source, pattern, label);
}

function assertSectionCommands(section, expected, label) {
  assert.deepEqual(
    extractCommandFences(section.body).map(normalizeShellFenceBody),
    expected,
    `${label} shell commands must be exact`,
  );
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
    customCleanupCaveat: [
      /only removes[^.]*default[^.]*packages\/evals\/\.eval/i,
      /does not remove[^.]*PI_EVAL_ARTIFACT_DIR/i,
      /relative[^.]*absolute|absolute[^.]*relative/i,
      /separate[^.]*explicit[^.]*validated cleanup/i,
      /retention policy/i,
    ],
    optionalModelExecution:
      /model-backed (?:execution|evaluation)[^.]*optional|optional[^.]*model-backed (?:execution|evaluation)/i,
    infraVsVerdict: [/infrastructure (?:error|failure)/i, /task verdict/i],
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
    customCleanupCaveat: [
      /chỉ xóa[^.]*mặc định[^.]*packages\/evals\/\.eval/i,
      /không xóa[^.]*PI_EVAL_ARTIFACT_DIR/i,
      /tương đối[^.]*tuyệt đối|relative[^.]*absolute/i,
      /cleanup[^.]*riêng[^.]*tường minh[^.]*validate/i,
      /retention policy/i,
    ],
    optionalModelExecution:
      /model-backed (?:execution|evaluation)[^.\n]*(?:tùy chọn|không bắt buộc)|(?:tùy chọn|không bắt buộc)[^.\n]*model-backed (?:execution|evaluation)/i,
    infraVsVerdict: [/(?:infrastructure error|lỗi hạ tầng)/i, /task verdict/i],
    redaction: /redact|che(?: đi)? dữ liệu|loại bỏ dữ liệu nhạy cảm/i,
    warningCost: /chi phí|cost/i,
    warningSensitive: /artifact[^.\n]*nhạy cảm|nhạy cảm[^.\n]*artifact/i,
  },
};

function validateGuideDocument(source, locale) {
  const parsed = matter(source);
  const frontmatter = parsed.data;
  const body = parsed.content;
  const contract = localeContracts[locale];
  assert.equal(frontmatter.translation_key, "how-to-run-pi-evals");
  assert.equal(frontmatter.language, locale);
  assert.equal(frontmatter.status, "reviewed");
  assert.equal(frontmatter.reviewed_by, "Pify maintainers");
  assert.equal(frontmatter.last_updated, "2026-09-04");
  assert.deepEqual(frontmatter.terms_used, [
    "harness",
    "judge",
    "verdict",
    "fixture",
    "held-out evaluation",
    "fail-closed",
  ]);
  const sections = extractH2Sections(body);
  const firstH2Index = body.search(/^## /m);
  assert.ok(
    firstH2Index >= 0,
    `${locale}: at least one H2 section is required`,
  );
  const preamble = body.slice(0, firstH2Index);
  const outcome = requireH2Section(
    sections,
    locale === "en" ? /^Outcome$/ : /^Kết quả$/,
    `${locale}: outcome`,
  );
  const numbered = Object.fromEntries(
    Array.from({ length: 9 }, (_, index) => {
      const number = index + 1;
      return [
        number,
        requireH2Section(
          sections,
          new RegExp(`^${number}\\.`),
          `${locale}: section ${number}`,
        ),
      ];
    }),
  );

  assertMatches(
    `${preamble}\n${outcome.body}`,
    contract.privatePackage,
    `${locale}: private package in the introduction/outcome`,
  );
  assertMatches(
    numbered[2].body,
    contract.smoke,
    `${locale}: section 2 smoke eval`,
  );
  assertMatches(
    numbered[3].body,
    contract.harness,
    `${locale}: section 3 Pi harness`,
  );
  assertMatches(
    numbered[4].body,
    contract.deterministicJudge,
    `${locale}: section 4 deterministic judge`,
  );
  assertMatches(
    numbered[4].body,
    contract.modelJudge,
    `${locale}: section 4 model-backed judge`,
  );
  assertMatches(
    numbered[5].body,
    contract.comparison,
    `${locale}: section 5 baseline/candidate comparison`,
  );
  assertMatches(
    numbered[5].body,
    contract.repetitions,
    `${locale}: section 5 repetitions`,
  );
  for (const pattern of contract.infraVsVerdict) {
    assertMatches(
      numbered[6].body,
      pattern,
      `${locale}: section 6 infrastructure error versus task verdict`,
    );
  }
  assertMatches(
    numbered[7].body,
    contract.telemetry,
    `${locale}: section 7 telemetry`,
  );
  assertMatches(
    numbered[8].body,
    contract.artifacts,
    `${locale}: section 8 artifacts`,
  );
  assertMatches(
    numbered[8].body,
    contract.redaction,
    `${locale}: section 8 redaction`,
  );
  assertMatches(
    numbered[9].body,
    contract.cleanup,
    `${locale}: section 9 cleanup`,
  );
  for (const pattern of contract.customCleanupCaveat) {
    assertMatches(
      numbered[9].body,
      pattern,
      `${locale}: section 9 custom artifact cleanup caveat`,
    );
  }
  assertMatches(
    outcome.body,
    contract.optionalModelExecution,
    `${locale}: outcome marks model-backed execution optional`,
  );

  assert.equal(
    numbered[1].body.includes(RELEASE_COMMIT),
    true,
    `${locale}: section 1 exact release commit`,
  );
  assertSectionCommands(numbered[1], [EXACT_CHECKOUT], `${locale}: section 1`);
  assertSectionCommands(
    numbered[2],
    EXPECTED_SHELL_COMMANDS.slice(1, 3),
    `${locale}: section 2`,
  );
  assertSectionCommands(
    numbered[5],
    [EXPECTED_SHELL_COMMANDS[3]],
    `${locale}: section 5`,
  );
  assertSectionCommands(
    numbered[9],
    [EXPECTED_SHELL_COMMANDS[4]],
    `${locale}: section 9`,
  );

  const commandFences = extractCommandFences(body);
  assert.deepEqual(
    commandFences.map(normalizeShellFenceBody),
    EXPECTED_SHELL_COMMANDS,
    `${locale}: ordered shell commands must be exact`,
  );
  for (const command of commandFences) {
    assert.doesNotMatch(
      command,
      /(?:npm|pnpm|yarn|bun)(?:\s+\S+)*\s+(?:add|install|i)\b[^\n]*@earendil-works\/pi-evals/i,
      `${locale}: @earendil-works/pi-evals must not be installed from npm`,
    );
  }

  const warnings = extractWarningCallouts(outcome.body);
  assert.ok(warnings.length >= 1, `${locale}: visual warning callout`);
  assert.ok(
    warnings.some(
      (warning) =>
        contract.warningCost.test(warning) &&
        contract.warningSensitive.test(warning),
    ),
    `${locale}: one warning must cover cost and sensitive artifacts together`,
  );

  const sourceMap = requireH2Section(
    sections,
    /^Source map\b/i,
    `${locale}: source map`,
  );
  const sourceMapUrls = [
    ...sourceMap.body.matchAll(/\]\((https:\/\/github\.com\/[^)]+)\)/g),
  ].map((match) => match[1]);
  assert.deepEqual(
    sourceMapUrls,
    PINNED_SOURCE_URLS,
    `${locale}: source map URLs must be exact and release-pinned`,
  );

  return { body, commandFences, frontmatter };
}

test("the paired Pi eval guides satisfy the release-pinned workflow contract", async () => {
  const documents = await Promise.all(
    Object.entries(GUIDE_PATHS).map(async ([locale, url]) => {
      const source = normalizeLineEndings(await readFile(url, "utf8"));
      return { locale, source };
    }),
  );

  const validated = documents.map(({ locale, source }) =>
    validateGuideDocument(source, locale),
  );

  assert.deepEqual(
    validated[0].commandFences,
    validated[1].commandFences,
    "English and Vietnamese shell-fence bodies must be byte-identical",
  );

  assert.deepEqual(
    markdownShape(validated[0].body),
    markdownShape(validated[1].body),
    "English and Vietnamese guides must have identical structural depth, fences, tables, warnings, and links",
  );
});

test("rejects a changed shell command", async () => {
  const source = normalizeLineEndings(await readFile(GUIDE_PATHS.en, "utf8"));
  const mutated = source.replace(
    "npm run eval -- --provider openai --model gpt-5.6-sol src/smoke.eval.ts\n```",
    "npm run eval -- --provider openai --model gpt-5.6-sol src/not-smoke.eval.ts\n```",
  );
  assert.notEqual(mutated, source, "the command mutation must be applied");
  assert.throws(() => validateGuideDocument(mutated, "en"), /shell command/i);
});

test("rejects a removed shell command", async () => {
  const source = normalizeLineEndings(await readFile(GUIDE_PATHS.en, "utf8"));
  const mutated = source.replace(
    "```bash\nnpm run clean --workspace=@earendil-works/pi-evals\n```\n",
    "",
  );
  assert.notEqual(mutated, source, "the command removal must be applied");
  assert.throws(() => validateGuideDocument(mutated, "en"), /shell command/i);
});

test("rejects source links that survive only in frontmatter", async () => {
  const source = normalizeLineEndings(await readFile(GUIDE_PATHS.en, "utf8"));
  const mutated = source.replace(
    /^## Source map for Pi 0\.85\.0\n[\s\S]*?(?=^## Acceptance checklist)/m,
    "",
  );
  assert.notEqual(mutated, source, "the source-map section must be removed");
  assert.throws(() => validateGuideDocument(mutated, "en"), /source map/i);
});

test("rejects a topic token present only in frontmatter", async () => {
  const source = normalizeLineEndings(await readFile(GUIDE_PATHS.en, "utf8"));
  const parsed = matter(source);
  const mutated = source.replace(
    parsed.content,
    parsed.content.replaceAll(/telemetry/gi, "measurements"),
  );
  assert.notEqual(mutated, source, "the body mutation must be applied");
  assert.match(
    matter(mutated).data.description,
    /telemetry/i,
    "telemetry intentionally remains in frontmatter",
  );
  assert.doesNotMatch(
    matter(mutated).content,
    /telemetry/i,
    "telemetry must be absent from the Markdown body",
  );
  assert.throws(
    () => validateGuideDocument(mutated, "en"),
    /section 7.*telemetry/i,
  );
});

test("rejects removal of the custom artifact cleanup caveat", async () => {
  const source = normalizeLineEndings(await readFile(GUIDE_PATHS.en, "utf8"));
  const mutated = source.replace(
    /The fixed script only removes[\s\S]*?under your own retention policy\./,
    "The command removes every local eval run.",
  );
  assert.notEqual(mutated, source, "the cleanup caveat must be removed");
  assert.throws(
    () => validateGuideDocument(mutated, "en"),
    /section 9 custom artifact cleanup caveat/i,
  );
});
