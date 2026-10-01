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

    expect(paths).toHaveLength(92);
    expect(new Set(paths).size).toBe(92);
    expect(paths.filter((path) => path.startsWith("/en"))).toHaveLength(46);
    expect(paths.filter((path) => path.startsWith("/vi"))).toHaveLength(46);
    expect(paths).toContain("/en/how-to/use-codemode-and-mcp");
    expect(paths).toContain("/vi/how-to/route-virtual-models");
    expect(paths).toContain("/vi/how-to/build-durable-agent");
    expect(paths.filter((path) => path === "/en/course")).toHaveLength(1);
    expect(
      paths.filter((path) => path === "/vi/course/14-agent-evaluation"),
    ).toHaveLength(1);
    expect(paths.some((path) => path.startsWith("/zh"))).toBe(false);
  });

  it("builds absolute canonical language alternates for paired pages", () => {
    expect(buildLanguageAlternates("/vi/ch03-agent-loop")).toEqual({
      en: `${SITE_ORIGIN}/en/ch03-agent-loop`,
      vi: `${SITE_ORIGIN}/vi/ch03-agent-loop`,
      "x-default": `${SITE_ORIGIN}/en/ch03-agent-loop`,
    });
    expect(buildLanguageAlternates("/en/course")).toEqual({
      en: `${SITE_ORIGIN}/en/course`,
      vi: `${SITE_ORIGIN}/vi/course`,
      "x-default": `${SITE_ORIGIN}/en/course`,
    });
  });

  it("adds paired alternates to every sitemap entry", () => {
    const sitemap = buildSitemapEntries();
    const quickstart = sitemap.find(
      (entry) => entry.url === `${SITE_ORIGIN}/en/quickstart`,
    );
    const finalCheckpoint = sitemap.find(
      (entry) => entry.url === `${SITE_ORIGIN}/vi/course/14-agent-evaluation`,
    );

    expect(sitemap).toHaveLength(92);
    expect(quickstart?.alternates?.languages).toEqual({
      en: `${SITE_ORIGIN}/en/quickstart`,
      vi: `${SITE_ORIGIN}/vi/quickstart`,
    });
    expect(finalCheckpoint?.alternates?.languages).toEqual({
      en: `${SITE_ORIGIN}/en/course/14-agent-evaluation`,
      vi: `${SITE_ORIGIN}/vi/course/14-agent-evaluation`,
    });
    expect(sitemap.some((entry) => entry.url.includes("gitbook"))).toBe(false);
    expect(sitemap.some((entry) => entry.url.includes("/zh"))).toBe(false);
  });
});
