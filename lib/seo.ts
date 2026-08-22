import manifest from "@/content/translation-manifest.json";
import type { Locale } from "@/lib/i18n";
import { switchLocale, toPublicPath } from "@/lib/routes";
import type { Metadata, MetadataRoute } from "next";

export const SITE_ORIGIN = "https://docs.pify.dev";

export function absoluteUrl(pathname: string): string {
  return new URL(pathname, SITE_ORIGIN).toString();
}

export function buildPublicPagePaths(): string[] {
  return manifest.pages.flatMap((page) => [
    toPublicPath("en", page.en),
    toPublicPath("vi", page.vi),
  ]);
}

export function buildLanguageAlternates(pathname: string) {
  const englishPath = switchLocale(pathname, "en");
  const vietnamesePath = switchLocale(pathname, "vi");

  return {
    en: absoluteUrl(englishPath),
    vi: absoluteUrl(vietnamesePath),
    "x-default": absoluteUrl(englishPath),
  };
}

export function buildPageMetadata({
  locale,
  pathname,
  title,
  description,
}: {
  locale: Locale;
  pathname: string;
  title: string;
  description: string;
}): Metadata {
  const canonical = absoluteUrl(pathname);

  return {
    title,
    description,
    alternates: {
      canonical,
      languages: buildLanguageAlternates(pathname),
    },
    openGraph: {
      type: "article",
      locale: locale === "vi" ? "vi_VN" : "en_US",
      title,
      description,
      url: canonical,
      images: [
        {
          url: absoluteUrl("/og-image.png"),
          width: 1200,
          height: 630,
          alt: "Pify Agent Book",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [absoluteUrl("/og-image.png")],
    },
  };
}

export function buildSitemapEntries(): MetadataRoute.Sitemap {
  return buildPublicPagePaths().map((pathname) => {
    const alternates = buildLanguageAlternates(pathname);

    return {
      url: absoluteUrl(pathname),
      alternates: {
        languages: {
          en: alternates.en,
          vi: alternates.vi,
        },
      },
    };
  });
}
