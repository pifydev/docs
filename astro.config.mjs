import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import mermaid from "astro-mermaid";

export default defineConfig({
  site: "https://pifydev.github.io",
  base: "/docs",
  trailingSlash: "never",
  integrations: [
    mermaid(),
    starlight({
      title: "Pify Agent Book",
      description: "Source-code reading notes for the Pi Agent SDK",
      defaultLocale: "en",
      locales: {
        zh: { label: "中文", lang: "zh-CN" },
        en: { label: "English", lang: "en" },
        vi: { label: "Tiếng Việt", lang: "vi" },
      },
      sidebar: [
        {
          label: "Giới thiệu",
          translations: {
            en: "About",
            vi: "Giới thiệu",
            zh: "关于",
          },
          items: [{ label: "Introduction", link: "" }],
        },
        {
          label: "章节目录",
          translations: {
            en: "Chapters",
            vi: "Các chương",
            zh: "章节目录",
          },
          items: [
            { slug: "ch01-overview" },
            { slug: "ch02-three-layer-arch" },
            { slug: "ch03-agent-loop" },
            { slug: "ch04-model-invocation" },
            { slug: "ch05-tool-system" },
            { slug: "ch06-messages" },
            { slug: "ch07-event-driven" },
            { slug: "ch08-context-engineering" },
            { slug: "ch09-compaction" },
            { slug: "ch10-session" },
          ],
        },
      ],
      customCss: ["/src/styles/custom.css"],
      social: [
        { icon: "github", label: "GitHub", href: "https://github.com/pifydev/docs" },
      ],
      editLink: {
        baseUrl: "https://github.com/pifydev/docs/edit/main/",
      },
      head: [
        {
          tag: "meta",
          attrs: {
            property: "og:image",
            content: "https://pifydev.github.io/docs/og-image.png",
          },
        },
        {
          tag: "meta",
          attrs: {
            name: "twitter:card",
            content: "summary_large_image",
          },
        },
      ],
    }),
  ],
});
