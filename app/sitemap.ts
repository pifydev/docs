import { buildSitemapEntries } from "@/lib/seo";
import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  return buildSitemapEntries();
}
