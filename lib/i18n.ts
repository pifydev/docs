import { defineI18n } from "fumadocs-core/i18n";

export const i18n = defineI18n({
  defaultLanguage: "en",
  languages: ["en", "vi"],
  parser: "dir",
  fallbackLanguage: null,
});

export type Locale = (typeof i18n.languages)[number];
