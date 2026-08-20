#!/usr/bin/env node
import { writeFile, mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";

const LANGS = ["zh", "en", "vi"];
const PUBLIC = "public";

async function generate() {
  for (const lang of LANGS) {
    const srcDir = join("src/content/docs", lang);
    let files;
    try {
      files = await readdir(srcDir);
    } catch {
      continue;
    }
    for (const name of files) {
      if (!name.endsWith(".md")) continue;
      const base = name.replace(/\.md$/, "");
      if (base === "index") continue;
      const target = `/${lang}/${base}`;
      const html = `<!DOCTYPE html>
<html>
<head>
  <meta http-equiv="refresh" content="0; url=${target}">
  <link rel="canonical" href="${target}">
  <meta charset="utf-8">
  <title>Redirecting...</title>
</head>
<body>
  <p>Redirecting to <a href="${target}">${target}</a></p>
</body>
</html>
`;
      const dir = join(PUBLIC, lang);
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, `${base}.html`), html, "utf-8");
    }
  }
  const rootIndex = `<!DOCTYPE html>
<html>
<head>
  <meta http-equiv="refresh" content="0; url=/en/">
  <link rel="canonical" href="/en/">
  <meta charset="utf-8">
  <title>Redirecting...</title>
</head>
<body>
  <p>Redirecting to <a href="/en/">/en/</a></p>
</body>
</html>
`;
  await writeFile(join(PUBLIC, "index.html"), rootIndex, "utf-8");
  console.log("Generated redirect pages");
}

await generate();
