import { describe, expect, it } from "vitest";

import {
  SITE_ORIGIN,
  buildLanguageAlternates,
  buildPublicPagePaths,
  buildSitemapEntries,
} from "@/lib/seo";

describe("public documentation SEO", () => {
  it("publishes exactly one English and Vietnamese URL per source page", () => {
    const paths = buildPublicPagePaths();

    expect(paths).toHaveLength(54);
    expect(new Set(paths).size).toBe(54);
    expect(paths.filter((path) => path.startsWith("/en"))).toHaveLength(27);
    expect(paths.filter((path) => path.startsWith("/vi"))).toHaveLength(27);
    expect(paths.some((path) => path.startsWith("/zh"))).toBe(false);
  });

  it("builds absolute canonical language alternates for paired pages", () => {
    expect(buildLanguageAlternates("/vi/ch03-agent-loop")).toEqual({
      en: `${SITE_ORIGIN}/en/ch03-agent-loop`,
      vi: `${SITE_ORIGIN}/vi/ch03-agent-loop`,
      "x-default": `${SITE_ORIGIN}/en/ch03-agent-loop`,
    });
  });

  it("adds paired alternates to every sitemap entry", () => {
    const sitemap = buildSitemapEntries();
    const quickstart = sitemap.find(
      (entry) => entry.url === `${SITE_ORIGIN}/en/quickstart`,
    );

    expect(sitemap).toHaveLength(54);
    expect(quickstart?.alternates?.languages).toEqual({
      en: `${SITE_ORIGIN}/en/quickstart`,
      vi: `${SITE_ORIGIN}/vi/quickstart`,
    });
    expect(sitemap.some((entry) => entry.url.includes("gitbook"))).toBe(false);
    expect(sitemap.some((entry) => entry.url.includes("/zh"))).toBe(false);
  });
});
