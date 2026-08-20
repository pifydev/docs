import { defineCollection, z } from "astro:content";
import { docsLoader, i18nLoader } from "@astrojs/starlight/loaders";
import { docsSchema, i18nSchema } from "@astrojs/starlight/schema";

const versionPairs = z.object({
  zh: z.string(),
  en: z.string(),
  vi: z.string(),
});

const chapterFrontmatter = z.object({
  chapter: z.number().int().min(1).max(10),
  slug: z.string().regex(/^ch[0-9]{2}-[a-z0-9-]+$/),
  title_zh: z.string(),
  title_en: z.string(),
  title_vi: z.string(),
  source_url: z.string().url(),
  language: z.enum(["zh", "en", "vi"]),
  version_pairs: versionPairs,
  original_chars: z.number().int().nonnegative(),
  code_lines: z.number().int().nonnegative(),
  reading_minutes: z.number().int().nonnegative(),
  translator: z.string(),
  reviewed_by: z.string().nullable(),
  last_updated: z.string(),
  status: z.enum(["draft", "translated", "reviewed", "published"]),
  official_refs: z.array(z.string().url()),
  terms_used: z.array(z.string()),
  mermaid_blocks: z.number().int().nonnegative(),
  code_blocks: z.number().int().nonnegative(),
});

export const collections = {
  docs: defineCollection({
    loader: docsLoader(),
    schema: docsSchema({
      extend: () => chapterFrontmatter,
    }),
  }),
  i18n: defineCollection({
    loader: i18nLoader(),
    schema: i18nSchema(),
  }),
};
