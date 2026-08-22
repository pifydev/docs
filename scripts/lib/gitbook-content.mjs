import path from "node:path";

import matter from "gray-matter";

const KEPT_FRONTMATTER = [
  "title",
  "description",
  "chapter",
  "source_url",
  "official_refs",
  "terms_used",
  "status",
  "last_updated",
  "translator",
  "reviewed_by",
  "code_blocks",
  "code_lines",
  "mermaid_blocks",
];

export function mapSourcePath(relativePath) {
  return relativePath === "index.mdx" ? "README.md" : relativePath.replace(/\\/g, "/");
}

function targetForLocaleURL(pathname) {
  const clean = pathname.replace(/^\/+|\/+$/g, "");
  return clean.length === 0 ? "README.md" : `${clean}.md`;
}

function relativeMarkdownHref(fromFile, targetFile) {
  const relative = path.posix.relative(path.posix.dirname(fromFile), targetFile);
  return relative.startsWith(".") ? relative : relative || "README.md";
}

export function rewriteLocaleLinks(markdown, locale, targetRelativePath) {
  const pattern = new RegExp(`\\]\\(\\/${locale}(?:\\/([^?#)]*))?\\/?([?#][^)]*)?\\)`, "g");
  return markdown.replace(pattern, (_match, pathname = "", suffix = "") => {
    const target = targetForLocaleURL(pathname);
    return `](${relativeMarkdownHref(targetRelativePath, target)}${suffix})`;
  });
}

function removeHomeComponents(content) {
  return content
    .replace(/^import\s+.+?;\s*$/gm, "")
    .replace(/^<Hero\s+[^>]*\/>\s*$/gm, "")
    .replace(/<Callout\s+type="tip">/g, "{% hint style=\"info\" %}")
    .replace(/<\/Callout>/g, "{% endhint %}")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function normalizeDocument(source, options) {
  const { locale, key, sourceRelativePath, targetRelativePath } = options;
  const parsed = matter(source);
  const metadata = {
    title: parsed.data.title,
    ...(parsed.data.description ? { description: parsed.data.description } : {}),
    translation_key: key,
    language: locale,
  };

  for (const field of KEPT_FRONTMATTER) {
    if (field !== "title" && field !== "description" && parsed.data[field] !== undefined) {
      metadata[field] = parsed.data[field];
    }
  }

  const withoutComponents = sourceRelativePath === "index.mdx"
    ? removeHomeComponents(parsed.content)
    : parsed.content.trim();
  const content = rewriteLocaleLinks(withoutComponents, locale, targetRelativePath);
  return matter.stringify(`${content}\n`, metadata);
}
