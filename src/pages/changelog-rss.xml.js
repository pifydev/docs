import rss from "@astrojs/rss";
import { getCollection } from "astro:content";

export async function GET(context) {
  const base = context.site ?? "https://pifydev.github.io";
  const items = [
    {
      title: "Quickstart, Glossary, Changelog, How-to, Reference, FAQ",
      pubDate: new Date("2026-08-21"),
      description:
        "Added 12 new pages covering Tutorial, How-to, Reference, and FAQ — completing the four Diataxis content types.",
      link: "/changelog/",
    },
    {
      title: "Sidebar reorganised into 6 groups",
      pubDate: new Date("2026-08-21"),
      description:
        "Reorganised sidebar: About, Getting Started, How-to Guides, Reference, Chapters, Help.",
      link: "/changelog/",
    },
    {
      title: "Version footer per chapter",
      pubDate: new Date("2026-08-21"),
      description:
        "Every chapter now carries a 'Version note' (this docs baseline is Pi v0.80.2) and a 'Next up' link.",
      link: "/changelog/",
    },
    {
      title: "Initial 10 chapters translated to English and Vietnamese",
      pubDate: new Date("2026-08-20"),
      description:
        "Source-code reading notes for the Pi Agent SDK, in English and Vietnamese. Chinese is the canonical source.",
      link: "/ch01-overview/",
    },
  ];

  return rss({
    title: "Pify Agent Book changelog",
    description: "Updates to the Pify Agent Book docs site.",
    site: base,
    items,
    customData: `<language>en-us</language>`,
  });
}
