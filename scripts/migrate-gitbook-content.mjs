#!/usr/bin/env node
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { mapSourcePath, normalizeDocument } from "./lib/gitbook-content.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(
  await readFile(path.join(repositoryRoot, "content/translation-manifest.json"), "utf8"),
);
const force = process.argv.includes("--force");

async function writeTarget(target, content) {
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, content, { encoding: "utf8", flag: force ? "w" : "wx" });
}

for (const locale of ["en", "vi"]) {
  for (const page of manifest.pages) {
    const targetRelativePath = page[locale];
    const sourceRelativePath = targetRelativePath === "README.md" ? "index.mdx" : targetRelativePath;
    const sourcePath = path.join(repositoryRoot, "src/content/docs", locale, sourceRelativePath);
    const targetPath = path.join(repositoryRoot, "content", locale, targetRelativePath);
    const source = await readFile(sourcePath, "utf8");
    const normalized = normalizeDocument(source, {
      locale,
      key: page.key,
      sourceRelativePath,
      targetRelativePath: mapSourcePath(sourceRelativePath),
    });
    await writeTarget(targetPath, normalized);
  }
}

for (const page of manifest.pages.filter((entry) => entry.zh)) {
  const sourceRelativePath = page.zh === "README.md" ? "index.mdx" : page.zh;
  const sourcePath = path.join(repositoryRoot, "src/content/docs/zh", sourceRelativePath);
  const targetPath = path.join(repositoryRoot, "source/zh", page.zh);
  if (sourceRelativePath === "index.mdx") {
    const source = await readFile(sourcePath, "utf8");
    await writeTarget(
      targetPath,
      normalizeDocument(source, {
        locale: "zh",
        key: page.key,
        sourceRelativePath,
        targetRelativePath: page.zh,
      }),
    );
  } else {
    await mkdir(path.dirname(targetPath), { recursive: true });
    await cp(sourcePath, targetPath, { errorOnExist: !force, force });
  }
}

console.log("Migrated 23 English pages, 23 Vietnamese pages, and 11 Chinese references.");
