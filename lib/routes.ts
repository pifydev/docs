import manifest from "@/content/translation-manifest.json";
import type { Locale } from "@/lib/i18n";

const publicLocales = ["en", "vi"] as const;

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && publicLocales.includes(value as Locale);
}

function negotiatedLocale(acceptLanguage?: string): Locale {
  if (!acceptLanguage) return "en";

  const preferences = acceptLanguage
    .split(",")
    .map((entry, index) => {
      const [tag = "", ...parameters] = entry.trim().split(";");
      const qualityParameter = parameters.find((parameter) =>
        parameter.trim().startsWith("q="),
      );
      const quality = qualityParameter
        ? Number.parseFloat(qualityParameter.trim().slice(2))
        : 1;

      return {
        locale: tag.toLowerCase().split("-")[0],
        quality: Number.isFinite(quality) ? quality : 0,
        index,
      };
    })
    .sort((left, right) => right.quality - left.quality || left.index - right.index);

  for (const preference of preferences) {
    if (isLocale(preference.locale) && preference.quality > 0) {
      return preference.locale;
    }
  }

  return "en";
}

export function selectLocale(
  cookieLocale?: string,
  acceptLanguage?: string,
): Locale {
  if (isLocale(cookieLocale)) return cookieLocale;
  return negotiatedLocale(acceptLanguage);
}

export function toPublicPath(locale: Locale, sourcePath: string): string {
  const normalized = sourcePath.replaceAll("\\", "/").replace(/^\/+/, "");
  const withoutExtension = normalized.replace(/\.(?:md|mdx)$/i, "");
  const slug = withoutExtension === "index" ? "" : withoutExtension;
  return slug ? `/${locale}/${slug}` : `/${locale}`;
}

export function switchLocale(path: string, targetLocale: Locale): string {
  const suffixIndex = path.search(/[?#]/);
  const pathname = suffixIndex === -1 ? path : path.slice(0, suffixIndex);
  const suffix = suffixIndex === -1 ? "" : path.slice(suffixIndex);
  const currentLocale = pathname.split("/").filter(Boolean)[0];

  if (!isLocale(currentLocale)) return `/${targetLocale}`;

  const page = manifest.pages.find(
    (candidate) =>
      toPublicPath(currentLocale, candidate[currentLocale]) ===
      pathname.replace(/\/$/, ""),
  );

  if (!page) return `/${targetLocale}`;
  return `${toPublicPath(targetLocale, page[targetLocale])}${suffix}`;
}
