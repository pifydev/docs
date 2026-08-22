#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import matter from "gray-matter";

import { codeFenceLanguages, headingShape } from "./lib/markdown.mjs";

const locales = ["en", "vi"];

export function compareOptionalTermSets(termSets) {
  const defined = Object.entries(termSets).filter(
    ([, value]) => Array.isArray(value) && value.length > 0,
  );
  if (defined.length < 2) return [];

  const [baseLanguage, baseTerms] = defined[0];
  const expected = [...baseTerms].sort();

  return defined
    .slice(1)
    .flatMap(([language, terms]) =>
      JSON.stringify([...terms].sort()) === JSON.stringify(expected)
        ? []
        : [`terms_used differs (${baseLanguage} vs ${language})`],
    );
}

function same(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export async function checkSync(rootURL) {
  const root = fileURLToPath(rootURL);
  const manifest = JSON.parse(
    await readFile(
      path.join(root, "content/translation-manifest.json"),
      "utf8",
    ),
  );
  const errors = [];

  for (const page of manifest.pages) {
    const parsed = {};

    for (const locale of locales) {
      const filePath = path.join(root, "content", locale, page[locale]);
      parsed[locale] = matter(await readFile(filePath, "utf8"));

      if (parsed[locale].data.translation_key !== page.key) {
        errors.push(`${page.key}: ${locale} translation_key differs`);
      }
    }

    const enHeadings = headingShape(parsed.en.content);
    const viHeadings = headingShape(parsed.vi.content);
    if (!same(enHeadings, viHeadings)) {
      errors.push(
        `${page.key}: heading structure differs (en=${enHeadings.join(",")}; vi=${viHeadings.join(",")})`,
      );
    }

    const enFences = codeFenceLanguages(parsed.en.content);
    const viFences = codeFenceLanguages(parsed.vi.content);
    if (!same(enFences, viFences)) {
      errors.push(
        `${page.key}: code fences differ (en=${enFences.join(",")}; vi=${viFences.join(",")})`,
      );
    }

    for (const error of compareOptionalTermSets({
      en: parsed.en.data.terms_used,
      vi: parsed.vi.data.terms_used,
    })) {
      errors.push(`${page.key}: ${error}`);
    }
  }

  return { count: manifest.pages.length, errors };
}

async function main() {
  const result = await checkSync(new URL("../", import.meta.url));
  console.log(`Checked ${result.count} EN/VI page pairs`);

  if (result.errors.length > 0) {
    console.error("\nERRORS:");
    for (const error of result.errors) console.error(`  - ${error}`);
    process.exitCode = 1;
    return;
  }

  console.log("All public translations are in sync");
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
