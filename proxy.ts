import { i18n } from "@/lib/i18n";
import { cleanLegacyMarkdownPath, isLocale, selectLocale } from "@/lib/routes";
import { createI18nMiddleware } from "fumadocs-core/i18n/middleware";
import type { NextFetchEvent, NextRequest } from "next/server";
import { NextResponse } from "next/server";

const fumadocsI18n = createI18nMiddleware(i18n);

export default function proxy(request: NextRequest, event: NextFetchEvent) {
  const { pathname } = request.nextUrl;
  const firstSegment = pathname.split("/").filter(Boolean)[0];
  const legacyPath = cleanLegacyMarkdownPath(
    pathname,
    selectLocale(
      request.cookies.get("pify-locale")?.value,
      request.headers.get("accept-language") ?? undefined,
    ),
  );

  if (legacyPath) {
    const target = request.nextUrl.clone();
    target.pathname = legacyPath;
    return NextResponse.redirect(target);
  }

  if (pathname === "/") {
    const locale = selectLocale(
      request.cookies.get("pify-locale")?.value,
      request.headers.get("accept-language") ?? undefined,
    );
    const target = request.nextUrl.clone();
    target.pathname = `/${locale}`;
    const response = NextResponse.redirect(target);
    response.cookies.set("pify-locale", locale, {
      maxAge: 60 * 60 * 24 * 365,
      path: "/",
      sameSite: "lax",
    });
    return response;
  }

  if (isLocale(firstSegment)) {
    const response = NextResponse.next();
    response.cookies.set("pify-locale", firstSegment, {
      maxAge: 60 * 60 * 24 * 365,
      path: "/",
      sameSite: "lax",
    });
    return response;
  }

  if (firstSegment && /^[a-z]{2}$/i.test(firstSegment)) {
    return NextResponse.next();
  }

  return fumadocsI18n(request, event);
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|favicon.svg|icon.svg|robots.txt|sitemap.xml|og-image.png|fonts/|pify-).*)",
  ],
};
