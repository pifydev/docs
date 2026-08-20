#!/usr/bin/env node
import { readFile, readdir, mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

const LANGS = ["en", "vi"];
const errors = [];
let total = 0;

const tmpDir = await mkdtemp(join(tmpdir(), "pi-docs-mermaid-"));

try {
  for (const lang of LANGS) {
    const dir = join("src/content/docs", lang);
    let files;
    try {
      files = await readdir(dir);
    } catch {
      continue;
    }
    for (const name of files.filter((f) => f.startsWith("ch") && f.endsWith(".md"))) {
      const content = await readFile(join(dir, name), "utf-8");
      const rx = /```mermaid\r?\n([\s\S]*?)\r?\n```/g;
      let m;
      while ((m = rx.exec(content)) !== null) {
        total++;
        const mmdFile = join(tmpDir, `block-${total}.mmd`);
        const svgFile = join(tmpDir, `block-${total}.svg`);
        await writeFile(mmdFile, m[1], "utf-8");
        const code = await new Promise((resolve) => {
          const proc = spawn("npx", ["mmdc", "-i", mmdFile, "-o", svgFile, "-q"], {
            stdio: "inherit",
          });
          proc.on("close", resolve);
        });
        if (code !== 0) {
          errors.push(`${lang}/${name} block ${total}: mmdc failed`);
        }
      }
    }
  }
} finally {
  await rm(tmpDir, { recursive: true, force: true });
}

console.log(`Validated ${total} mermaid block(s)`);
if (errors.length > 0) {
  console.error("\nERRORS:");
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log("All mermaid blocks valid");
