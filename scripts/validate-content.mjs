#!/usr/bin/env node
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import matter from "gray-matter";

const locales = ["en", "vi"];

const navigation = {
  en: {
    root: [
      "index",
      "quickstart",
      "glossary",
      "---How-to guides---",
      "how-to",
      "---Reference---",
      "reference",
      "---Chapters---",
      "ch01-overview",
      "ch02-three-layer-arch",
      "ch03-agent-loop",
      "ch04-model-invocation",
      "ch05-tool-system",
      "ch06-messages",
      "ch07-event-driven",
      "ch08-context-engineering",
      "ch09-compaction",
      "ch10-session",
      "---Help---",
      "help",
      "changelog",
    ],
    "how-to": [
      "add-custom-tool",
      "plug-new-model",
      "stream-output",
      "persist-sessions",
      "customize-system-prompt",
    ],
    reference: ["api", "configuration", "environment-variables"],
    help: ["faq"],
  },
  vi: {
    root: [
      "index",
      "quickstart",
      "glossary",
      "---Hướng dẫn---",
      "how-to",
      "---Tham khảo---",
      "reference",
      "---Các chương---",
      "ch01-overview",
      "ch02-three-layer-arch",
      "ch03-agent-loop",
      "ch04-model-invocation",
      "ch05-tool-system",
      "ch06-messages",
      "ch07-event-driven",
      "ch08-context-engineering",
      "ch09-compaction",
      "ch10-session",
      "---Hỗ trợ---",
      "help",
      "changelog",
    ],
    "how-to": [
      "add-custom-tool",
      "plug-new-model",
      "stream-output",
      "persist-sessions",
      "customize-system-prompt",
    ],
    reference: ["api", "configuration", "environment-variables"],
    help: ["faq"],
  },
};

function fences(content) {
  return [...content.matchAll(/^```([^\s]*)[^\n]*\n[\s\S]*?^```\s*$/gm)].map(
    (match) => match[1],
  );
}

function headingShape(content) {
  return [...content.matchAll(/^(#{1,6})\s+.+$/gm)].map(
    (match) => match[1].length,
  );
}

function localMarkdownLinks(content) {
  return [
    ...content.matchAll(
      /\[[^\]]*\]\((?!https?:|mailto:|#)([^)#?]+)(?:[?#][^)]*)?\)/g,
    ),
  ].map((match) => decodeURIComponent(match[1]));
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJSON(filePath, errors, label) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    errors.push(`${label}: invalid or missing JSON (${error.message})`);
    return null;
  }
}

function sameArray(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export async function validateRepository(rootURL) {
  const root = fileURLToPath(rootURL);
  const errors = [];
  const manifestPath = path.join(root, "content/translation-manifest.json");
  const manifest = await readJSON(manifestPath, errors, "translation-manifest.json");

  if (!manifest) return errors;
  if (manifest.version !== 1) errors.push("translation-manifest.json: version must be 1");
  if (!Array.isArray(manifest.pages) || manifest.pages.length !== 23) {
    errors.push("translation-manifest.json: exactly 23 page pairs are required");
    return errors;
  }

  const keys = new Set();
  const localePaths = { en: new Set(), vi: new Set() };

  for (const page of manifest.pages) {
    if (keys.has(page.key)) errors.push(`${page.key}: duplicate translation key`);
    keys.add(page.key);

    const parsed = {};
    for (const locale of locales) {
      const relativePath = page[locale];
      if (typeof relativePath !== "string" || !/\.(?:md|mdx)$/.test(relativePath)) {
        errors.push(`${page.key}: ${locale} path must be Markdown or MDX`);
        continue;
      }
      if (localePaths[locale].has(relativePath)) {
        errors.push(`${locale}/${relativePath}: duplicate manifest path`);
      }
      localePaths[locale].add(relativePath);

      const filePath = path.join(root, "content", locale, relativePath);
      if (!(await exists(filePath))) {
        errors.push(`${locale}/${relativePath}: missing file`);
        continue;
      }

      parsed[locale] = matter(await readFile(filePath, "utf8"));
      if (parsed[locale].data.translation_key !== page.key) {
        errors.push(`${locale}/${relativePath}: translation_key must be ${page.key}`);
      }
      if (parsed[locale].data.language !== locale) {
        errors.push(`${locale}/${relativePath}: language must be ${locale}`);
      }
      if (!parsed[locale].data.title) {
        errors.push(`${locale}/${relativePath}: title is required`);
      }
      if (/\{%\s*(?:hint|endhint)\b/.test(parsed[locale].content)) {
        errors.push(`${locale}/${relativePath}: GitBook hint syntax is not allowed`);
      }

      for (const href of localMarkdownLinks(parsed[locale].content)) {
        const linkedPath = path.resolve(path.dirname(filePath), href);
        if (!(await exists(linkedPath))) {
          errors.push(`${locale}/${relativePath}: broken link ${href}`);
        }
      }
    }

    if (parsed.en && parsed.vi) {
      const enFences = fences(parsed.en.content);
      const viFences = fences(parsed.vi.content);
      if (!sameArray(enFences, viFences)) {
        errors.push(
          `${page.key}: code-fence languages differ EN=${JSON.stringify(enFences)} VI=${JSON.stringify(viFences)}`,
        );
      }
      const enHeadings = headingShape(parsed.en.content);
      const viHeadings = headingShape(parsed.vi.content);
      if (!sameArray(enHeadings, viHeadings)) {
        errors.push(
          `${page.key}: heading structure differs EN=${JSON.stringify(enHeadings)} VI=${JSON.stringify(viHeadings)}`,
        );
      }
    }
  }

  for (const locale of locales) {
    for (const retired of ["README.md", "SUMMARY.md", ".gitbook.yaml"]) {
      if (await exists(path.join(root, "content", locale, retired))) {
        errors.push(`${locale}: retired GitBook file remains: ${retired}`);
      }
    }

    for (const directory of ["root", "how-to", "reference", "help"]) {
      const relative = directory === "root" ? "meta.json" : `${directory}/meta.json`;
      const meta = await readJSON(
        path.join(root, "content", locale, relative),
        errors,
        `${locale}/${relative}`,
      );
      if (meta && !sameArray(meta.pages, navigation[locale][directory])) {
        errors.push(`${locale}/${relative}: pages do not match the approved order`);
      }
    }
  }

  return errors;
}

const invokedPath = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : "";

if (invokedPath === import.meta.url) {
  const errors = await validateRepository(new URL("..", import.meta.url));
  if (errors.length > 0) {
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }
  console.log("Fumadocs content validation passed: 23 EN/VI page pairs.");
}
