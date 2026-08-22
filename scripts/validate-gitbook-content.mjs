#!/usr/bin/env node
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import matter from "gray-matter";
import YAML from "yaml";

function fences(content) {
  return [...content.matchAll(/^```([^\s]*)[^\n]*\n[\s\S]*?^```\s*$/gm)].map((match) => match[1]);
}

function headingShape(content) {
  return [...content.matchAll(/^(#{1,6})\s+.+$/gm)].map((match) => match[1].length);
}

function localMarkdownLinks(content) {
  return [...content.matchAll(/\[[^\]]*\]\((?!https?:|mailto:|#)([^)#?]+)(?:[?#][^)]*)?\)/g)]
    .map((match) => decodeURIComponent(match[1]));
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function validateRepository(rootURL) {
  const root = fileURLToPath(rootURL);
  const errors = [];
  const manifest = JSON.parse(await readFile(path.join(root, "content/translation-manifest.json"), "utf8"));

  for (const locale of ["en", "vi"]) {
    const configPath = path.join(root, "content", locale, ".gitbook.yaml");
    const config = YAML.parse(await readFile(configPath, "utf8"));
    if (config.root !== "./") errors.push(`${locale}: .gitbook.yaml root must be ./`);
    if (config.structure?.readme !== "README.md") errors.push(`${locale}: readme must be README.md`);
    if (config.structure?.summary !== "SUMMARY.md") errors.push(`${locale}: summary must be SUMMARY.md`);
  }

  for (const page of manifest.pages) {
    const parsed = {};
    for (const locale of ["en", "vi"]) {
      const relativePath = page[locale];
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
      if (!parsed[locale].data.title) errors.push(`${locale}/${relativePath}: title is required`);

      for (const href of localMarkdownLinks(parsed[locale].content)) {
        const linkedPath = path.resolve(path.dirname(filePath), href);
        if (!(await exists(linkedPath))) errors.push(`${locale}/${relativePath}: broken link ${href}`);
      }
    }

    if (parsed.en && parsed.vi) {
      const enFences = fences(parsed.en.content);
      const viFences = fences(parsed.vi.content);
      if (JSON.stringify(enFences) !== JSON.stringify(viFences)) {
        errors.push(`${page.key}: code-fence languages differ EN=${JSON.stringify(enFences)} VI=${JSON.stringify(viFences)}`);
      }
      const enHeadings = headingShape(parsed.en.content);
      const viHeadings = headingShape(parsed.vi.content);
      if (JSON.stringify(enHeadings) !== JSON.stringify(viHeadings)) {
        errors.push(`${page.key}: heading structure differs EN=${JSON.stringify(enHeadings)} VI=${JSON.stringify(viHeadings)}`);
      }
    }
  }

  for (const locale of ["en", "vi"]) {
    const summary = await readFile(path.join(root, "content", locale, "SUMMARY.md"), "utf8");
    const linked = localMarkdownLinks(summary);
    const expected = manifest.pages.map((page) => page[locale]);
    if (JSON.stringify(linked) !== JSON.stringify(expected)) {
      errors.push(`${locale}: SUMMARY order does not match translation-manifest.json`);
    }
  }

  return errors;
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (invokedPath === import.meta.url) {
  const errors = await validateRepository(new URL("..", import.meta.url));
  if (errors.length > 0) {
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }
  console.log("GitBook content validation passed: 23 EN/VI page pairs.");
}
