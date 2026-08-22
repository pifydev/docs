import { getMDXComponents } from "@/components/mdx";
import manifest from "@/content/translation-manifest.json";
import { isLocale, switchLocale, toPublicPath } from "@/lib/routes";
import { source } from "@/lib/source";
import { createRelativeLink } from "fumadocs-ui/mdx";
import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
  EditOnGitHub,
  ViewOptionsPopover,
} from "fumadocs-ui/layouts/docs/page";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

const origin = "https://docs.pify.dev";

type DocumentationPageProps = {
  params: Promise<{ lang: string; slug?: string[] }>;
};

export default async function DocumentationPage({
  params,
}: DocumentationPageProps) {
  const { lang, slug } = await params;
  if (!isLocale(lang)) notFound();

  const page = source.getPage(slug, lang);
  if (!page) notFound();

  const Content = page.data.body;
  const publicPath = slug?.length ? `/${lang}/${slug.join("/")}` : `/${lang}`;
  const manifestPage = manifest.pages.find(
    (candidate) => toPublicPath(lang, candidate[lang]) === publicPath,
  );
  const sourcePath = manifestPage?.[lang] ?? page.path;
  const markdownUrl = `/${lang}/llms-full.txt`;
  const githubUrl = `https://github.com/pifydev/docs/blob/main/content/${lang}/${sourcePath}`;

  return (
    <DocsPage toc={page.data.toc} className="pify-docs-page">
      <DocsTitle className="pify-page-title">{page.data.title}</DocsTitle>
      <DocsDescription className="pify-page-description">
        {page.data.description}
      </DocsDescription>
      <div className="pify-page-actions">
        <ViewOptionsPopover markdownUrl={markdownUrl} githubUrl={githubUrl} />
        <EditOnGitHub href={githubUrl}>Edit on GitHub</EditOnGitHub>
      </div>
      <DocsBody className="pify-docs-body">
        <Content
          components={getMDXComponents({
            a: createRelativeLink(source, page),
          })}
        />
      </DocsBody>
    </DocsPage>
  );
}

export function generateStaticParams() {
  return source.generateParams();
}

export async function generateMetadata({
  params,
}: DocumentationPageProps): Promise<Metadata> {
  const { lang, slug } = await params;
  if (!isLocale(lang)) notFound();

  const page = source.getPage(slug, lang);
  if (!page) notFound();

  const pathname = slug?.length ? `/${lang}/${slug.join("/")}` : `/${lang}`;
  const englishPath = switchLocale(pathname, "en");
  const vietnamesePath = switchLocale(pathname, "vi");
  const title = page.data.title ?? "Pify Agent Book";
  const description = page.data.description ?? metadataDescription(lang);

  return {
    title,
    description,
    alternates: {
      canonical: new URL(pathname, origin),
      languages: {
        en: new URL(englishPath, origin),
        vi: new URL(vietnamesePath, origin),
        "x-default": new URL(englishPath, origin),
      },
    },
    openGraph: {
      type: "article",
      locale: lang === "vi" ? "vi_VN" : "en_US",
      title,
      description,
      url: new URL(pathname, origin),
      images: [{ url: "/og-image.png", width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ["/og-image.png"],
    },
  };
}

function metadataDescription(lang: "en" | "vi") {
  return lang === "vi"
    ? "Ghi chú đọc mã nguồn cho Pi Agent SDK."
    : "Source-code reading notes for the Pi Agent SDK.";
}
