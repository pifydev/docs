import { readFile } from "node:fs/promises";

const WORD_PATTERN = /[\p{L}\p{N}]+(?:[’'-][\p{L}\p{N}]+)*/gu;
const FRONTMATTER_START = /^\uFEFF?---\s*$/;
const FRONTMATTER_END = /^(?:---|\.\.\.)\s*$/;
const HEADING_PATTERN = /^\s{0,3}(#{2,4})(?:\s+|$)/;
const FENCE_PATTERN = /^\s{0,3}(`{3,}|~{3,})(.*)$/;
const FENCE_END_PATTERN = /^\s{0,3}([`~]{3,})\s*$/;
const MANIFEST_LABEL = "preservation-manifest.json";
const VALID_HEADING_DEPTHS = new Set([2, 3, 4]);
const VALID_HEADING_KEYS = new Set(["2", "3", "4"]);
const VALID_DELETION_METRICS = new Set([
  "words",
  "headings",
  "codeFences",
  "mermaidBlocks",
  "tables",
]);

function withoutFrontmatter(source) {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  if (!FRONTMATTER_START.test(lines[0] ?? "")) return lines;

  const end = lines.findIndex(
    (line, index) => index > 0 && FRONTMATTER_END.test(line),
  );
  return end === -1 ? lines : lines.slice(end + 1);
}

function tableSeparator(line) {
  if (!line.includes("|")) return false;
  const cells = line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|");
  return (
    cells.length > 0 && cells.every((cell) => /^\s*:?-{3,}:?\s*$/.test(cell))
  );
}

function tableRow(line) {
  return line.includes("|") && line.trim().length > 0;
}

function scan(source) {
  const lines = withoutFrontmatter(source);
  const headings = [];
  const codeFences = [];
  const proseLines = [];
  let mermaidBlocks = 0;
  let fence = null;

  for (const line of lines) {
    if (fence) {
      const closing = line.match(FENCE_END_PATTERN);
      if (
        closing &&
        closing[1][0] === fence.character &&
        closing[1].length >= fence.length
      ) {
        fence = null;
      }
      continue;
    }

    const opening = line.match(FENCE_PATTERN);
    if (opening && !(opening[1][0] === "`" && opening[2].includes("`"))) {
      const language = opening[2].trim().split(/\s+/, 1)[0] ?? "";
      codeFences.push(language);
      if (language.toLowerCase() === "mermaid") mermaidBlocks += 1;
      fence = {
        character: opening[1][0],
        length: opening[1].length,
      };
      continue;
    }

    const heading = line.match(HEADING_PATTERN);
    if (heading) headings.push(heading[1].length);
    proseLines.push(line);
  }

  let tables = 0;
  const prose = [];
  for (let index = 0; index < proseLines.length; index += 1) {
    if (
      tableRow(proseLines[index]) &&
      tableSeparator(proseLines[index + 1] ?? "")
    ) {
      tables += 1;
      index += 1;
      while (tableRow(proseLines[index + 1] ?? "")) index += 1;
      continue;
    }
    if (!HEADING_PATTERN.test(proseLines[index])) prose.push(proseLines[index]);
  }

  return {
    words: prose.join("\n").match(WORD_PATTERN)?.length ?? 0,
    headings,
    codeFences,
    mermaidBlocks,
    tables,
  };
}

export function contentMetrics(source) {
  if (typeof source !== "string")
    throw new TypeError("source must be a string");
  return scan(source);
}

function approvedAmount(rule, metric, depth) {
  return (rule.approvedDeletions ?? []).reduce((total, deletion) => {
    if (!deletion || deletion.metric !== metric) return total;
    if (metric === "headings" && !VALID_HEADING_DEPTHS.has(deletion.depth)) {
      return total;
    }
    if (
      depth !== undefined &&
      deletion.depth !== undefined &&
      deletion.depth !== depth
    ) {
      return total;
    }
    const amount = Number(deletion.amount ?? 0);
    return Number.isFinite(amount) && amount > 0 ? total + amount : total;
  }, 0);
}

function displayNumber(value) {
  return Number.isInteger(value)
    ? String(value)
    : value.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
}

export function preservationErrors(relativePath, actual, rule) {
  const errors = [];
  const path = String(relativePath);
  const words = Number(actual.words ?? 0);
  const baselineWords = Number(rule.baselineWords);
  const ratio = Number(rule.minimumWordRatio);

  if (Number.isFinite(baselineWords) && Number.isFinite(ratio)) {
    const minimumWords = Math.max(
      0,
      baselineWords * ratio - approvedAmount(rule, "words"),
    );
    if (words < minimumWords) {
      errors.push(
        `${path}: words ${words} below minimum ${displayNumber(minimumWords)} (${displayNumber(ratio)} of baseline ${baselineWords})`,
      );
    }
  }

  const headingCounts = rule.minimumHeadingCounts ?? {};
  for (const [depthText, minimumValue] of Object.entries(headingCounts)) {
    const depth = Number(depthText);
    const minimum = Number(minimumValue);
    if (!Number.isFinite(depth) || !Number.isFinite(minimum)) continue;
    const count = (actual.headings ?? []).filter(
      (heading) => heading === depth,
    ).length;
    const adjustedMinimum = Math.max(
      0,
      minimum - approvedAmount(rule, "headings", depth),
    );
    if (count < adjustedMinimum) {
      errors.push(
        `${path}: H${depth} headings ${count} below minimum ${adjustedMinimum}`,
      );
    }
  }

  const countRules = [
    ["code fences", "codeFences", "minimumCodeFences", "codeFences"],
    [
      "Mermaid blocks",
      "mermaidBlocks",
      "minimumMermaidBlocks",
      "mermaidBlocks",
    ],
    ["tables", "tables", "minimumTables", "tables"],
  ];
  for (const [label, actualKey, ruleKey, allowanceMetric] of countRules) {
    const minimum = Number(rule[ruleKey]);
    if (!Number.isFinite(minimum)) continue;
    const count =
      actualKey === "codeFences"
        ? (actual.codeFences ?? []).length
        : Number(actual[actualKey] ?? 0);
    const adjustedMinimum = Math.max(
      0,
      minimum - approvedAmount(rule, allowanceMetric),
    );
    if (count < adjustedMinimum) {
      errors.push(
        `${path}: ${label} ${count} below minimum ${adjustedMinimum}`,
      );
    }
  }

  return errors;
}

function finiteNonnegative(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function requiredFiniteNonnegative(errors, field, value) {
  if (!finiteNonnegative(value)) {
    errors.push(
      `${MANIFEST_LABEL}: ${field} must be a finite nonnegative number`,
    );
  }
}

function isLocaleRelativePath(path) {
  if (
    typeof path !== "string" ||
    !path ||
    path.includes("\\") ||
    path.includes("%")
  ) {
    return false;
  }
  if (!/^(?:en|vi)\/(?:[^/]+\/)*[^/]+\.(?:md|mdx)$/.test(path)) {
    return false;
  }
  return !path
    .split("/")
    .some((segment) => segment === "." || segment === "..");
}

function validateApprovedDeletions(errors, field, deletions) {
  if (!Array.isArray(deletions)) {
    errors.push(`${MANIFEST_LABEL}: ${field} must be an array`);
    return;
  }

  deletions.forEach((deletion, index) => {
    const prefix = `${field}[${index}]`;
    if (!deletion || typeof deletion !== "object" || Array.isArray(deletion)) {
      errors.push(`${MANIFEST_LABEL}: ${prefix} must be an object`);
      return;
    }
    for (const required of ["section", "reason", "evidence"]) {
      if (
        typeof deletion[required] !== "string" ||
        !deletion[required].trim()
      ) {
        errors.push(`${MANIFEST_LABEL}: ${prefix}.${required} is required`);
      }
    }
    if (!VALID_DELETION_METRICS.has(deletion.metric)) {
      errors.push(
        `${MANIFEST_LABEL}: ${prefix}.metric must be one of ${[...VALID_DELETION_METRICS].join(", ")}`,
      );
    }
    if (!finiteNonnegative(deletion.amount) || deletion.amount === 0) {
      errors.push(
        `${MANIFEST_LABEL}: ${prefix}.amount must be a finite positive number`,
      );
    }
    if (deletion.metric === "headings") {
      if (!VALID_HEADING_DEPTHS.has(deletion.depth)) {
        errors.push(
          `${MANIFEST_LABEL}: ${prefix}.depth must be 2, 3, or 4 for heading allowances`,
        );
      }
    } else if (deletion.depth !== undefined) {
      errors.push(
        `${MANIFEST_LABEL}: ${prefix}.depth is only valid for heading allowances`,
      );
    }
  });
}

function validateManifest(manifest) {
  const errors = [];
  const validIndices = new Set();
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    return {
      errors: [`${MANIFEST_LABEL}: manifest must be an object`],
      validIndices,
    };
  }
  if (manifest.version !== 1) {
    errors.push(`${MANIFEST_LABEL}: version must be 1`);
  }
  if (!Array.isArray(manifest.pages) || manifest.pages.length === 0) {
    errors.push(`${MANIFEST_LABEL}: pages must be a non-empty array`);
    return { errors, validIndices };
  }

  const paths = new Map();
  manifest.pages.forEach((rule, index) => {
    const prefix = `pages[${index}]`;
    const pageStart = errors.length;
    const pageErrors = [];
    const path = rule?.path;
    if (typeof path !== "string" || !path) {
      pageErrors.push(`${prefix}.path is required`);
    } else if (!isLocaleRelativePath(path)) {
      pageErrors.push(`${prefix}.path must be a locale-relative Markdown path`);
    } else if (paths.has(path)) {
      pageErrors.push(
        `${prefix}.path duplicates pages[${paths.get(path)}].path`,
      );
    } else {
      paths.set(path, index);
    }

    if (!rule || typeof rule !== "object" || Array.isArray(rule)) {
      errors.push(
        ...pageErrors.map((error) => `${MANIFEST_LABEL}: ${error}`),
        `${MANIFEST_LABEL}: ${prefix} must be an object`,
      );
      return;
    }
    requiredFiniteNonnegative(
      errors,
      `${prefix}.baselineWords`,
      rule.baselineWords,
    );
    if (
      typeof rule.minimumWordRatio !== "number" ||
      !Number.isFinite(rule.minimumWordRatio) ||
      rule.minimumWordRatio < 0 ||
      rule.minimumWordRatio > 1
    ) {
      errors.push(
        `${MANIFEST_LABEL}: ${prefix}.minimumWordRatio must be a number from 0 through 1`,
      );
    }

    const headingField = `${prefix}.minimumHeadingCounts`;
    if (
      !rule.minimumHeadingCounts ||
      typeof rule.minimumHeadingCounts !== "object" ||
      Array.isArray(rule.minimumHeadingCounts)
    ) {
      errors.push(`${MANIFEST_LABEL}: ${headingField} must be an object`);
    } else {
      for (const [depth, minimum] of Object.entries(
        rule.minimumHeadingCounts,
      )) {
        if (!VALID_HEADING_KEYS.has(depth)) {
          errors.push(
            `${MANIFEST_LABEL}: ${headingField}.${depth} must use heading depth 2, 3, or 4`,
          );
        } else if (!finiteNonnegative(minimum)) {
          errors.push(
            `${MANIFEST_LABEL}: ${headingField}.${depth} must be a finite nonnegative number`,
          );
        }
      }
    }

    for (const field of [
      "minimumCodeFences",
      "minimumMermaidBlocks",
      "minimumTables",
    ]) {
      requiredFiniteNonnegative(errors, `${prefix}.${field}`, rule[field]);
    }
    validateApprovedDeletions(
      errors,
      `${prefix}.approvedDeletions`,
      rule.approvedDeletions,
    );
    errors.push(...pageErrors.map((error) => `${MANIFEST_LABEL}: ${error}`));
    if (errors.length === pageStart && pageErrors.length === 0) {
      validIndices.add(index);
    }
  });
  return { errors, validIndices };
}

export function preservationManifestCoverageErrors(translations, manifest) {
  const expectedPages = (translations?.pages ?? []).flatMap((page) => [
    { key: page.key, path: `en/${page.en}` },
    { key: page.key, path: `vi/${page.vi}` },
  ]);
  const manifestPages = manifest?.pages ?? [];
  const errors = [];

  expectedPages.forEach((expected, index) => {
    const actual = manifestPages[index];
    if (!actual) {
      errors.push(
        `${MANIFEST_LABEL}: missing pages[${index}] for translation key ${expected.key} (${expected.path})`,
      );
      return;
    }
    if (actual.key !== expected.key) {
      errors.push(
        `${MANIFEST_LABEL}: pages[${index}].key must match translation key ${expected.key}`,
      );
    }
    if (actual.path !== expected.path) {
      errors.push(
        `${MANIFEST_LABEL}: pages[${index}].path must match translation path ${expected.path}`,
      );
    }
  });

  for (
    let index = expectedPages.length;
    index < manifestPages.length;
    index += 1
  ) {
    errors.push(`${MANIFEST_LABEL}: pages[${index}] has no translation entry`);
  }

  return errors;
}

export async function validatePreservation(rootURL, manifest) {
  const validation = validateManifest(manifest);
  const errors = validation.errors;
  if (
    !manifest ||
    typeof manifest !== "object" ||
    !Array.isArray(manifest.pages)
  ) {
    return errors;
  }
  const contentRoot = new URL("content/", rootURL);
  const pages = manifest.pages;
  const seen = new Set();
  for (const [index, rule] of pages.entries()) {
    const relativePath = rule?.path;
    if (
      !validation.validIndices.has(index) ||
      !isLocaleRelativePath(relativePath) ||
      seen.has(relativePath)
    ) {
      continue;
    }
    seen.add(relativePath);
    try {
      const source = await readFile(new URL(relativePath, contentRoot), "utf8");
      errors.push(
        ...preservationErrors(relativePath, contentMetrics(source), rule),
      );
    } catch (error) {
      errors.push(
        `${relativePath}: unable to read page (${error.code ?? error.message})`,
      );
    }
  }
  return errors;
}
