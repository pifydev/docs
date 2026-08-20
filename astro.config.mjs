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
          items: [{ autogenerate: { directory: "ch01-overview" } }],
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
