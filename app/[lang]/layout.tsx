import "@/app/global.css";

import { i18n } from "@/lib/i18n";
import { isLocale } from "@/lib/routes";
import { i18nProvider } from "fumadocs-ui/i18n";
import { RootProvider } from "fumadocs-ui/provider/next";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { translations } from "@/lib/layout.shared";

export const metadata: Metadata = {
  metadataBase: new URL("https://docs.pify.dev"),
  title: {
    default: "Pify Agent Book",
    template: "%s - Pify Agent Book",
  },
  description:
    "Source-code reading notes for the Pi Agent SDK in English and Vietnamese.",
};

export function generateStaticParams() {
  return i18n.languages.map((lang) => ({ lang }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();

  return (
    <html lang={lang} suppressHydrationWarning>
      <body className="flex min-h-screen flex-col">
        <RootProvider i18n={i18nProvider(translations, lang)}>
          {children}
        </RootProvider>
      </body>
    </html>
  );
}
