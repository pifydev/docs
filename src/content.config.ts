import { defineCollection, z } from "astro:content";
import { docsLoader, i18nLoader } from "@astrojs/starlight/loaders";
import { docsSchema, i18nSchema } from "@astrojs/starlight/schema";

const versionPairs = z.object({
  zh: z.string(),
  en: z.string(),
  vi: z.string(),
});

const chapterFrontmatter = z.object({
  chapter: z.number().int().min(1).max(10).optional(),
  slug: z.string().regex(/^[a-z]{2}\/ch[0-9]{2}-[a-z0-9-]+$/).optional(),
  title_zh: z.string().optional(),
  title_en: z.string().optional(),
  title_vi: z.string().optional(),
  source_url: z.string().url().optional(),
  language: z.enum(["zh", "en", "vi"]).optional(),
  version_pairs: versionPairs.optional(),
  original_chars: z.number().int().nonnegative().optional(),
  code_lines: z.number().int().nonnegative().optional(),
  reading_minutes: z.number().int().nonnegative().optional(),
  translator: z.union([z.string(), z.null()]).optional(),
  reviewed_by: z.union([z.string(), z.null()]).optional(),
  last_updated: z.string().optional(),
  status: z.enum(["draft", "translated", "reviewed", "published"]).optional(),
  official_refs: z.array(z.string().url()).optional(),
  terms_used: z.array(z.string()).optional(),
  mermaid_blocks: z.number().int().nonnegative().optional(),
  code_blocks: z.number().int().nonnegative().optional(),
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
