import manifest from "@/content/translation-manifest.json";
import type { Locale } from "@/lib/i18n";
import { toPublicPath } from "@/lib/routes";
import { absoluteUrl } from "@/lib/seo";
import { source } from "@/lib/source";

const descriptions: Record<Locale, string> = {
  en: "Source-code reading notes and practical guides for the Pi Agent SDK.",
  vi: "Ghi chú đọc mã nguồn và hướng dẫn thực hành cho Pi Agent SDK.",
};

function pageFor(locale: Locale, sourcePath: string) {
  const pathname = toPublicPath(locale, sourcePath);
  const segments = pathname.split("/").filter(Boolean).slice(1);
  return source.getPage(segments.length > 0 ? segments : undefined, locale);
}

export function buildLlmsIndex(locale: Locale): string {
  const links = manifest.pages.map((entry) => {
    const page = pageFor(locale, entry[locale]);
    if (!page) throw new Error(`Missing ${locale} page: ${entry[locale]}`);

    const description = page.data.description
      ? `: ${page.data.description}`
      : "";
    return `- [${page.data.title}](${absoluteUrl(page.url)})${description}`;
  });

  return [
    "# Pify Agent Book",
    "",
    `> ${descriptions[locale]}`,
    "",
    "## Documentation",
    "",
    ...links,
    "",
  ].join("\n");
}

export async function buildLlmsFull(locale: Locale): Promise<string> {
  const sections = await Promise.all(
    manifest.pages.map(async (entry) => {
      const page = pageFor(locale, entry[locale]);
      if (!page) throw new Error(`Missing ${locale} page: ${entry[locale]}`);

      const markdown = await page.data.getText("processed");
      return [
        `# ${page.data.title}`,
        "",
        `Source: ${absoluteUrl(page.url)}`,
        "",
        markdown.trim(),
      ].join("\n");
    }),
  );

  return [
    "# Pify Agent Book",
    "",
    `> ${descriptions[locale]}`,
    "",
    ...sections,
    "",
  ].join("\n\n");
}
