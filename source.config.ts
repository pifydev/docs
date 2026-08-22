import { remarkAdmonition, remarkMdxMermaid } from "fumadocs-core/mdx-plugins";
import { defineConfig } from "fumadocs-mdx/config";

export default defineConfig({
  mdxOptions: {
    remarkPlugins: [
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
