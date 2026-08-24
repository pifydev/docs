import { readFile } from "node:fs/promises";

const WORD_PATTERN = /[\p{L}\p{N}]+(?:[’'-][\p{L}\p{N}]+)*/gu;
const FRONTMATTER_START = /^\uFEFF?---\s*$/;
const FRONTMATTER_END = /^(?:---|\.\.\.)\s*$/;
const HEADING_PATTERN = /^\s{0,3}(#{2,4})(?:\s+|$)/;
const FENCE_PATTERN = /^\s{0,3}(`{3,}|~{3,})(.*)$/;
const FENCE_END_PATTERN = /^\s{0,3}([`~]{3,})\s*$/;

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
    if (
      depth !== undefined &&
      deletion.depth !== undefined &&
      Number(deletion.depth) !== depth
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

export async function validatePreservation(rootURL, manifest) {
  const pages = Array.isArray(manifest) ? manifest : (manifest?.pages ?? []);
  const errors = [];
  for (const rule of pages) {
    const relativePath = rule?.path;
    if (!relativePath) {
      errors.push(": manifest entry is missing path");
      continue;
    }
    try {
      const source = await readFile(new URL(relativePath, rootURL), "utf8");
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
