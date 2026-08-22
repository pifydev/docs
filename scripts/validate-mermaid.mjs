#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { extractMermaidBlocks } from "./lib/gitbook-content.mjs";

const errors = [];
let total = 0;

const manifest = JSON.parse(await readFile("content/translation-manifest.json", "utf8"));
const mmdc = join("node_modules", "@mermaid-js", "mermaid-cli", "src", "cli.js");
const puppeteerConfig = join("scripts", "puppeteer-ci.json");

const tmpDir = await mkdtemp(join(tmpdir(), "pi-docs-mermaid-"));

try {
  for (const locale of ["en", "vi"]) {
    for (const page of manifest.pages) {
      const relativePath = page[locale];
      const content = await readFile(join("content", locale, relativePath), "utf8");
      for (const block of extractMermaidBlocks(content)) {
        total++;
        const mmdFile = join(tmpDir, `block-${total}.mmd`);
        const svgFile = join(tmpDir, `block-${total}.svg`);
        await writeFile(mmdFile, block, "utf8");
        const result = await new Promise((resolve) => {
          const browserArgs = process.env.CI ? ["-p", puppeteerConfig] : [];
          const proc = spawn(
            process.execPath,
            [mmdc, ...browserArgs, "-i", mmdFile, "-o", svgFile, "-q"],
            { stdio: "inherit" },
          );
          proc.once("error", (error) => resolve({ code: null, error }));
          proc.once("close", (code) => resolve({ code, error: null }));
        });
        if (result.error) {
          errors.push(`${locale}/${relativePath} block ${total}: ${result.error.message}`);
        } else if (result.code !== 0) {
          errors.push(`${locale}/${relativePath} block ${total}: mmdc failed`);
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
