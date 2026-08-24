#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import matter from "gray-matter";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const rules = JSON.parse(
  await readFile(new URL("./editorial-rules.json", import.meta.url), "utf8"),
);

const hanPattern = /[\u3400-\u4dbf\u4e00-\u9fff]/u;
const controlPattern = /[\u0001-\u0008\u000b\u000c\u000e-\u001f]/u;
const fullwidthPunctuationPattern = /[！？：；，。]/u;
const vietnameseMarksPattern =
  /[ăâđêôơưĂÂĐÊÔƠƯáàảãạấầẩẫậắằẳẵặéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ]/iu;

export function proseOnly(markdown) {
  const { content } = matter(markdown);

  return content
    .replace(/^```[^\n]*\n[\s\S]*?^```\s*$/gm, "")
    .replace(/^~~~[^\n]*\n[\s\S]*?^~~~\s*$/gm, "")
    .replace(/`[^`\n]+`/g, "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/<[^>]+>/g, "")
    .trim();
}

function paragraphWordCount(paragraph) {
  return (paragraph.match(/[A-Za-zÀ-ỹĐđ]+/gu) || []).length;
}

function firstLineContaining(markdown, pattern) {
  const lines = markdown.split(/\r?\n/);
  const index = lines.findIndex((line) => pattern.test(line));
  return index >= 0 ? index + 1 : undefined;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function pushPatternErrors(errors, markdown, patterns, rule, relativePath) {
  for (const phrase of patterns) {
    const expression = new RegExp(escapeRegExp(phrase), "iu");
    if (expression.test(markdown)) {
      errors.push({
        rule,
        path: relativePath,
        line: firstLineContaining(markdown, expression),
        phrase,
      });
    }
  }
}

export function inspectDocument(markdown, locale, relativePath) {
  const prose = proseOnly(markdown);
  const errors = [];

  for (const [rule, pattern] of [
    ["residual-han", hanPattern],
    ["control-character", controlPattern],
    ["fullwidth-punctuation", fullwidthPunctuationPattern],
  ]) {
    if (pattern.test(markdown)) {
      errors.push({
        rule,
        path: relativePath,
        line: firstLineContaining(markdown, pattern),
      });
    }
  }

  for (const token of rules.mojibakePatterns) {
    if (markdown.includes(token)) {
      errors.push({
        rule: "mojibake",
        path: relativePath,
        line: firstLineContaining(markdown, new RegExp(token, "u")),
        token,
      });
    }
  }

  if (locale === "en") {
    pushPatternErrors(
      errors,
      prose,
      rules.englishBannedPatterns,
      "literal-english",
      relativePath,
    );
  }

  if (locale === "vi") {
    pushPatternErrors(
      errors,
      prose,
      rules.vietnameseBannedPatterns,
      "literal-vietnamese",
      relativePath,
    );
    for (const paragraph of prose.split(/\r?\n\s*\r?\n/)) {
      if (
        paragraphWordCount(paragraph) >=
          rules.minimumVietnameseParagraphWords &&
        !vietnameseMarksPattern.test(paragraph)
      ) {
        errors.push({
          rule: "unaccented-vietnamese",
          path: relativePath,
          line: firstLineContaining(
            markdown,
            new RegExp(escapeRegExp(paragraph.split(/\s+/)[0]), "u"),
          ),
        });
      }
    }
  }

  return errors;
}

export async function lintPaths(paths) {
  const errors = [];
  for (const relativePath of paths) {
    const normalizedPath = relativePath.replace(/\\/g, "/");
    const locale = normalizedPath.split("/")[1];
    const markdown = await readFile(
      path.join(repositoryRoot, normalizedPath),
      "utf8",
    );
    errors.push(...inspectDocument(markdown, locale, normalizedPath));
  }
  return errors;
}

const invokedPath = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : "";

if (invokedPath === import.meta.url) {
  const manifest = JSON.parse(
    await readFile(
      path.join(repositoryRoot, "content/translation-manifest.json"),
      "utf8",
    ),
  );
  const requested = process.argv
    .slice(2)
    .filter((argument) => !argument.startsWith("--"));
  const paths =
    requested.length > 0
      ? requested
      : manifest.pages.flatMap((page) => [
          `content/en/${page.en}`,
          `content/vi/${page.vi}`,
        ]);
  const errors = await lintPaths(paths);

  if (errors.length > 0) {
    for (const error of errors) console.error(JSON.stringify(error));
    process.exitCode = 1;
  } else {
    console.log(`Editorial lint passed for ${paths.length} files.`);
  }
}
