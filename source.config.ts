import { remarkAdmonition, remarkMdxMermaid } from "fumadocs-core/mdx-plugins";
import { defineConfig } from "fumadocs-mdx/config";

import { remarkCodeLanguage } from "./lib/code-language";

export default defineConfig({
  mdxOptions: {
    rehypeCodeOptions: {
      themes: {
        light: "catppuccin-latte",
        dark: "catppuccin-mocha",
      },
      addLanguageClass: true,
      fallbackLanguage: "plaintext",
    },
    remarkPlugins: [
      remarkCodeLanguage,
      [
        remarkAdmonition,
        {
          typeMap: {
            caution: "warning",
            danger: "error",
            info: "info",
            note: "info",
            tip: "info",
            warn: "warning",
            warning: "warning",
          },
        },
      ],
      remarkMdxMermaid,
    ],
  },
});
