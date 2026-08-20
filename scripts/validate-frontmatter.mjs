#!/usr/bin/env node
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import matter from "gray-matter";

const ROOT = "src/content/docs";
const LANGS = ["zh", "en", "vi"];
const REQUIRED = ["chapter", "slug", "language", "source_url", "status"];
const STATUS = ["draft", "translated", "reviewed", "published"];

const errors = [];
let fileCount = 0;

function countMermaid(content) {
  return (content.match(/^```mermaid\r?\n/gm) || []).length;
}

function countCodeBlocks(content) {
  return Math.floor((content.match(/^```/gm) || []).length / 2);
}

function countCodeLines(content) {
  const blocks = content.matchAll(/^```(\w*)\r?\n([\s\S]*?)\r?\n```/gm);
  let total = 0;
  for (const m of blocks) {
    if (m[1] !== "mermaid") total += m[2].split("\n").length;
  }
  return total;
}

for (const lang of LANGS) {
  const dir = join(ROOT, lang);
  let files;
  try {
    files = await readdir(dir);
  } catch {
    continue;
  }
  for (const name of files.filter((f) => f.startsWith("ch") && f.endsWith(".md"))) {
    fileCount++;
    const path = join(dir, name);
    const file = await readFile(path, "utf-8");
    const { data: fm, content } = matter(file);
    const label = `${lang}/${name}`;

    for (const req of REQUIRED) {
      if (fm[req] === undefined || fm[req] === null) {
        errors.push(`${label}: missing required field ${req}`);
      }
    }
    if (fm.chapter !== undefined && (fm.chapter < 1 || fm.chapter > 10)) {
      errors.push(`${label}: chapter must be 1..10 (got ${fm.chapter})`);
    }
    if (fm.language !== undefined && !LANGS.includes(fm.language)) {
      errors.push(`${label}: language must be zh|en|vi (got "${fm.language}")`);
    }
    if (fm.language !== undefined && fm.language !== lang) {
      errors.push(`${label}: language "${fm.language}" does not match directory "${lang}"`);
    }
    if (fm.slug !== undefined && !/^ch[0-9]{2}-[a-z0-9-]+$/.test(fm.slug)) {
      errors.push(`${label}: slug "${fm.slug}" does not match pattern`);
    }
    if (fm.status !== undefined && !STATUS.includes(fm.status)) {
      errors.push(`${label}: status must be ${STATUS.join("|")} (got "${fm.status}")`);
    }
    if (fm.source_url !== undefined && !/^https?:\/\//.test(fm.source_url)) {
      errors.push(`${label}: source_url must be http(s) URL`);
    }
    if (fm.status !== "draft") {
      const actualCode = countCodeBlocks(content);
      const actualMermaid = countMermaid(content);
      const actualLines = countCodeLines(content);
      if (fm.code_blocks !== undefined && fm.code_blocks !== actualCode) {
        errors.push(`${label}: code_blocks ${fm.code_blocks} != actual ${actualCode}`);
      }
      if (fm.mermaid_blocks !== undefined && fm.mermaid_blocks !== actualMermaid) {
        errors.push(`${label}: mermaid_blocks ${fm.mermaid_blocks} != actual ${actualMermaid}`);
      }
      if (fm.code_lines !== undefined && fm.code_lines !== actualLines) {
        errors.push(`${label}: code_lines ${fm.code_lines} != actual ${actualLines}`);
      }
    }
  }
}

console.log(`Validated ${fileCount} chapter files`);
if (errors.length > 0) {
  console.error("\nERRORS:");
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log("All files OK");
