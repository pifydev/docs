import { i18n } from "@/lib/i18n";
import { baseOptions } from "@/lib/layout.shared";
import { isLocale } from "@/lib/routes";
import { source } from "@/lib/source";
import { DocsLayout } from "fumadocs-ui/layouts/docs";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

export default async function DocumentationLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (!isLocale(lang) || !i18n.languages.includes(lang)) notFound();

  return (
    <DocsLayout tree={source.getPageTree(lang)} {...baseOptions(lang)}>
      {children}
    </DocsLayout>
  );
}
