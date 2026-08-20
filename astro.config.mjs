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
      defaultLocale: "zh",
      locales: {
        zh: { label: "中文", lang: "zh-CN" },
        en: { label: "English", lang: "en" },
        vi: { label: "Tiếng Việt", lang: "vi" },
      },
      sidebar: [
        {
          label: "About",
          translations: {
            en: { label: "About" },
            vi: { label: "Giới thiệu" },
            zh: { label: "关于" },
          },
          items: [{ label: "Introduction", link: "" }],
        },
        {
          label: "Chapters",
          translations: {
            en: { label: "Chapters" },
            vi: { label: "Các chương" },
            zh: { label: "章节目录" },
          },
          autogenerate: { directory: "ch01-overview" },
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
          property: "og:image",
          content: "https://pifydev.github.io/docs/og-image.png",
        },
        {
          tag: "meta",
          name: "twitter:card",
          content: "summary_large_image",
        },
      ],
    }),
  ],
});
