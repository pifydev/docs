#!/usr/bin/env node
import { build } from "astro";

await build({
  outDir: "dist",
});
console.log("Build complete. Output: dist/");
