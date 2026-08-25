#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import matter from "gray-matter";

import { codeFenceLanguages, extractMermaidBlocks } from "./lib/markdown.mjs";

const locales = ["en", "vi"];
const statuses = ["draft", "translated", "reviewed", "published"];

function countCodeLines(content) {
  let total = 0;
  for (const match of content.matchAll(
    /^```([^\s]*)[^\n]*\r?\n([\s\S]*?)\r?\n```\s*$/gm,
  )) {
    if (match[1] !== "mermaid") total += match[2].split(/\r?\n/).length;
  }
  return total;
}

export async function validateFrontmatter(rootURL) {
  const root = fileURLToPath(rootURL);
  const manifest = JSON.parse(
    await readFile(
      path.join(root, "content/translation-manifest.json"),
      "utf8",
    ),
  );
  const errors = [];
  let count = 0;

  for (const page of manifest.pages) {
    for (const locale of locales) {
      count++;
      const relativePath = page[locale];
      const label = `${locale}/${relativePath}`;
      const file = await readFile(
        path.join(root, "content", locale, relativePath),
        "utf8",
      );
      const { data, content } = matter(file);

      for (const field of ["title", "translation_key", "language"]) {
        if (
          data[field] === undefined ||
          data[field] === null ||
          data[field] === ""
        ) {
          errors.push(`${label}: missing required field ${field}`);
        }
      }

      if (data.translation_key !== page.key) {
        errors.push(`${label}: translation_key must be ${page.key}`);
      }
      if (data.language !== locale) {
        errors.push(`${label}: language must be ${locale}`);
      }

      const isChapter = /^ch\d{2}-/.test(page.key);
      if (isChapter) {
        for (const field of ["chapter", "source_url", "status"]) {
          if (
            data[field] === undefined ||
            data[field] === null ||
            data[field] === ""
          ) {
            errors.push(`${label}: chapter page requires ${field}`);
          }
        }
      }

      if (
        data.chapter !== undefined &&
        (!Number.isInteger(data.chapter) ||
          data.chapter < 1 ||
          data.chapter > 11)
      ) {
        errors.push(`${label}: chapter must be an integer from 1 through 11`);
      }
      if (data.status !== undefined && !statuses.includes(data.status)) {
        errors.push(`${label}: status must be ${statuses.join("|")}`);
      }
      if (
        data.source_url !== undefined &&
        !/^https?:\/\//.test(data.source_url)
      ) {
        errors.push(`${label}: source_url must be an HTTP(S) URL`);
      }

      const actual = {
        code_blocks: codeFenceLanguages(content).length,
        code_lines: countCodeLines(content),
        mermaid_blocks: extractMermaidBlocks(content).length,
      };
      for (const [field, value] of Object.entries(actual)) {
        if (data[field] !== undefined && data[field] !== value) {
          errors.push(`${label}: ${field} ${data[field]} != actual ${value}`);
        }
      }
    }
  }

  return { count, errors };
}

async function main() {
  const result = await validateFrontmatter(new URL("../", import.meta.url));
  console.log(`Validated ${result.count} public content files`);

  if (result.errors.length > 0) {
    console.error("\nERRORS:");
    for (const error of result.errors) console.error(`  - ${error}`);
    process.exitCode = 1;
    return;
  }

  console.log("All frontmatter is valid");
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
