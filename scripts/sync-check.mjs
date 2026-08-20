#!/usr/bin/env node
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import matter from "gray-matter";

const LANGS = ["zh", "en", "vi"];
const errors = [];
const warnings = [];
const inventory = new Map();

function countBy(content, regex) {
  return (content.match(regex) || []).length;
}

for (const lang of LANGS) {
  const dir = join("src/content/docs", lang);
  let files;
  try {
    files = await readdir(dir);
  } catch {
    continue;
  }
  for (const name of files.filter((f) => f.startsWith("ch") && f.endsWith(".md"))) {
    if (!inventory.has(name)) inventory.set(name, {});
    inventory.get(name)[lang] = join(dir, name);
  }
}

for (const [name, paths] of inventory) {
  for (const lang of LANGS) {
    if (!paths[lang]) {
      errors.push(`${name}: missing language "${lang}"`);
    }
  }
  const langs = Object.keys(paths);
  if (langs.length < LANGS.length) continue;

  const fms = {};
  const contents = {};
  for (const lang of langs) {
    const file = await readFile(paths[lang], "utf-8");
    const { data, content } = matter(file);
    fms[lang] = data;
    contents[lang] = content;
  }

  for (const lang of langs) {
    const vp = fms[lang].version_pairs;
    if (vp) {
      for (const peer of LANGS) {
        if (!vp[peer]) {
          errors.push(`${name}[${lang}]: version_pairs missing key "${peer}"`);
        }
      }
    }
  }

  const termSets = {};
  for (const lang of langs) {
    if (fms[lang].terms_used) {
      termSets[lang] = [...fms[lang].terms_used].sort();
    }
  }
  const tkeys = Object.keys(termSets);
  if (tkeys.length > 1) {
    const first = tkeys[0];
    for (const lang of tkeys) {
      if (lang === first) continue;
      const a = termSets[first];
      const b = termSets[lang];
      if (a.length !== b.length) {
        errors.push(`${name}: terms_used count differs (${first}=${a.length}, ${lang}=${b.length})`);
      } else {
        for (let i = 0; i < a.length; i++) {
          if (a[i] !== b[i]) {
            errors.push(`${name}: terms_used differs at index ${i}`);
          }
        }
      }
    }
  }

  const counts = {};
  for (const lang of langs) {
    const c = contents[lang];
    counts[lang] = {
      h: [0, 0, 0, 0, 0, 0],
      code: countBy(c, /^```/gm) / 2,
      mermaid: countBy(c, /^```mermaid\r?\n/gm),
    };
    for (let i = 1; i <= 6; i++) {
      counts[lang].h[i - 1] = countBy(c, new RegExp(`^#{${i}} `, "gm"));
    }
  }
  for (let level = 1; level <= 6; level++) {
    const values = langs.map((l) => counts[l].h[level - 1]);
    if (new Set(values).size > 1) {
      const detail = langs.map((l, i) => `${l}=${values[i]}`).join(", ");
      errors.push(`${name}: heading h${level} count differs (${detail})`);
    }
  }
}

console.log(`Checked ${inventory.size} chapters`);
if (errors.length > 0) {
  console.error("\nERRORS:");
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
if (warnings.length > 0) {
  console.warn("\nWARNINGS:");
  for (const w of warnings) console.warn(`  - ${w}`);
  process.exit(0);
}
console.log("All chapters in sync");
