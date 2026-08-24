import { Mermaid } from "@/components/mdx/mermaid";
import type { Locale } from "@/lib/i18n";
import { resolveContentHref } from "@/lib/routes";
import { Accordion, Accordions } from "fumadocs-ui/components/accordion";
import defaultMdxComponents from "fumadocs-ui/mdx";
import type { MDXComponents } from "mdx/types";
import type { ComponentProps } from "react";

export function createLocalizedMarkdownLink(
  locale: Locale,
  sourcePath: string,
) {
  const Link = defaultMdxComponents.a ?? "a";

  return function LocalizedMarkdownLink({
    href,
    ...props
  }: ComponentProps<"a">) {
    return (
      <Link
        href={href ? resolveContentHref(locale, sourcePath, href) : href}
        {...props}
      />
    );
  };
}

export function getMDXComponents(components?: MDXComponents) {
  return {
    ...defaultMdxComponents,
    Accordion,
    Accordions,
    Mermaid,
    ...components,
  } satisfies MDXComponents;
}

export const useMDXComponents = getMDXComponents;

declare global {
  type MDXProvidedComponents = ReturnType<typeof getMDXComponents>;
}
