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
    .sort(
      (left, right) => right.quality - left.quality || left.index - right.index,
    );

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

export function cleanLegacyMarkdownPath(
  pathname: string,
  fallbackLocale: Locale,
): string | undefined {
  if (!/\.(?:md|mdx)$/i.test(pathname)) return undefined;

  const normalized = pathname.replaceAll("\\", "/").replace(/^\/+/, "");
  const [firstSegment, ...remainingSegments] = normalized.split("/");

  if (isLocale(firstSegment)) {
    return toPublicPath(firstSegment, remainingSegments.join("/"));
  }

  if (/^[a-z]{2}$/i.test(firstSegment)) {
    return `/${normalized.replace(/\.(?:md|mdx)$/i, "")}`;
  }

  return toPublicPath(fallbackLocale, normalized);
}

export function toPublicPath(locale: Locale, sourcePath: string): string {
  const normalized = sourcePath.replaceAll("\\", "/").replace(/^\/+/, "");
  const withoutExtension = normalized.replace(/\.(?:md|mdx)$/i, "");
  const segments = withoutExtension.split("/").filter(Boolean);
  if (segments.at(-1) === "index") segments.pop();
  const slug = segments.join("/");
  return slug ? `/${locale}/${slug}` : `/${locale}`;
}

export function resolveContentHref(
  locale: Locale,
  sourcePath: string,
  href: string,
): string {
  if (
    href.startsWith("/") ||
    href.startsWith("#") ||
    href.startsWith("//") ||
    /^[a-z][a-z\d+.-]*:/i.test(href)
  ) {
    return href;
  }

  const suffixIndex = href.search(/[?#]/);
  const pathname = suffixIndex === -1 ? href : href.slice(0, suffixIndex);
  const suffix = suffixIndex === -1 ? "" : href.slice(suffixIndex);
  if (!/\.(?:md|mdx)$/i.test(pathname)) return href;

  const sourceSegments = sourcePath
    .replaceAll("\\", "/")
    .split("/")
    .filter(Boolean);
  sourceSegments.pop();

  for (const segment of pathname.split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      if (sourceSegments.length === 0) return href;
      sourceSegments.pop();
      continue;
    }
    sourceSegments.push(segment);
  }

  return `${toPublicPath(locale, sourceSegments.join("/"))}${suffix}`;
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
