import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import mermaid from "astro-mermaid";

export default defineConfig({
  site: "https://pifydev.github.io",
  base: "/docs",
  trailingSlash: "ignore",
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
            "zh-CN":  "关于",
          },
          items: [{ label: "Introduction", link: "" }],
        },
        {
          label: "章节目录",
          translations: {
            en: "Chapters",
            vi: "Các chương",
            "zh-CN":  "章节目录",
          },
          items: [
            { slug: "quickstart" },
            { slug: "glossary" },
          ],
        },
        {
          label: "How-to Guides",
          translations: {
            en: "How-to Guides",
            vi: "Hướng dẫn",
            "zh-CN": "操作指南",
          },
          items: [
            { slug: "how-to/add-custom-tool" },
            { slug: "how-to/plug-new-model" },
            { slug: "how-to/stream-output" },
            { slug: "how-to/persist-sessions" },
            { slug: "how-to/customize-system-prompt" },
          ],
        },
        {
          label: "Reference",
          translations: {
            en: "Reference",
            vi: "Tham khảo",
            "zh-CN": "参考",
          },
          items: [
            { slug: "reference/api" },
            { slug: "reference/configuration" },
            { slug: "reference/environment-variables" },
          ],
        },
        {
          label: "Chapters",
          translations: {
            en: "Chapters",
            vi: "Các chương",
            "zh-CN": "章节目录",
          },
          items: [
            {
              slug: "ch01-overview",
              label: "1. Introduction",
              translations: {
                en: "1. Introduction",
                vi: "1. Mở đầu",
                "zh-CN":  "第1章 开篇",
              },
            },
            {
              slug: "ch02-three-layer-arch",
              label: "2. Three-Layer Architecture",
              translations: {
                en: "2. Three-Layer Architecture",
                vi: "2. Kiến trúc ba lớp",
                "zh-CN":  "第2章 三层架构",
              },
            },
            {
              slug: "ch03-agent-loop",
              label: "3. Agent Loop",
              translations: {
                en: "3. Agent Loop",
                vi: "3. Agent Loop",
                "zh-CN":  "第3章 Agent Loop",
              },
            },
            {
              slug: "ch04-model-invocation",
              label: "4. Model Invocation",
              translations: {
                en: "4. Model Invocation",
                vi: "4. Gọi model",
                "zh-CN":  "第4章 模型调用",
              },
            },
            {
              slug: "ch05-tool-system",
              label: "5. Tool System",
              translations: {
                en: "5. Tool System",
                vi: "5. Hệ thống Tool",
                "zh-CN":  "第5章 工具系统",
              },
            },
            {
              slug: "ch06-messages",
              label: "6. Message System",
              translations: {
                en: "6. Message System",
                vi: "6. Hệ thống Message",
                "zh-CN":  "第6章 消息系统",
              },
            },
            {
              slug: "ch07-event-driven",
              label: "7. Event-Driven",
              translations: {
                en: "7. Event-Driven",
                vi: "7. Hướng sự kiện",
                "zh-CN":  "第7章 事件驱动",
              },
            },
            {
              slug: "ch08-context-engineering",
              label: "8. Context Engineering",
              translations: {
                en: "8. Context Engineering",
                vi: "8. Context Engineering",
                "zh-CN":  "第8章 上下文工程",
              },
            },
            {
              slug: "ch09-compaction",
              label: "9. Context Compaction",
              translations: {
                en: "9. Context Compaction",
                vi: "9. Nén ngữ cảnh",
                "zh-CN":  "第9章 上下文压缩",
              },
            },
            {
              slug: "ch10-session",
              label: "10. Session Management",
              translations: {
                en: "10. Session Management",
                vi: "10. Quản lý Session",
                "zh-CN":  "第10章 会话管理",
              },
            },
          ],
        },
        {
          label: "Help",
          translations: {
            en: "Help",
            vi: "Hỗ trợ",
            "zh-CN": "帮助",
          },
          items: [
            { slug: "help/faq" },
            { slug: "changelog" },
          ],
        },
      ],
      customCss: ["/src/styles/custom.css"],
      lastUpdated: true,
      components: {
        Header: './src/components/Header.astro',
        Footer: './src/components/Footer.astro',
      },
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
