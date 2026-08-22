import { i18n } from "@/lib/i18n";
import { buildLlmsFull } from "@/lib/llms";
import { isLocale } from "@/lib/routes";
import { notFound } from "next/navigation";

export const dynamic = "force-static";

export function generateStaticParams() {
  return i18n.languages.map((lang) => ({ lang }));
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ lang: string }> },
) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();

  return new Response(await buildLlmsFull(lang), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=86400",
    },
  });
}
