#!/usr/bin/env python3
"""Fetch a dgzhuya.com chapter and convert HTML body to Markdown.

Usage:
    python fetch_chapter.py <slug>     # e.g. ch01-overview
    python fetch_chapter.py --all      # all 10 chapters

Outputs the converted Markdown to stdout, wrapped in BEGIN/END markers.
META lines (key=value) come between the BEGIN marker and the body.
The PowerShell wrapper (fetch-zh.ps1) splits on those markers.
"""

from __future__ import annotations

import argparse
import re
import sys
import urllib.error
import urllib.request

from bs4 import BeautifulSoup, NavigableString, Tag

BASE_URL = "https://www.dgzhuya.com/modules/"
CHAPTERS = [
    "ch01-overview",
    "ch02-three-layer-arch",
    "ch03-agent-loop",
    "ch04-model-call",
    "ch05-tools",
    "ch06-messages",
    "ch07-event-driven",
    "ch08-context-engineering",
    "ch09-compaction",
    "ch10-session",
]


def fetch_html(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": "pi-docs-bot/1.0"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read().decode("utf-8", errors="replace")


def article_body(html: str) -> Tag:
    """Return the inner <article> element (skips header, scripts, nav)."""
    soup = BeautifulSoup(html, "html.parser")
    prose = soup.select_one(".prose")
    if prose is None:
        raise RuntimeError("article body (.prose) not found in HTML")
    article = prose.select_one("article")
    if article is None:
        raise RuntimeError("article element not found inside .prose")
    return article


def article_meta(html: str) -> dict:
    """Extract (original_chars, code_lines, reading_minutes) from the prose header."""
    soup = BeautifulSoup(html, "html.parser")
    header = soup.select_one(".prose .module-header")
    out: dict = {}
    if header is None:
        return out
    text = header.get_text(" ", strip=True)
    m = re.search(r"(\d+)\s*\u5b57", text)
    if m: out["original_chars"] = int(m.group(1))
    m = re.search(r"\u542b\s*(\d+)\s*\u884c\u4ee3\u7801", text)
    if m: out["code_lines"] = int(m.group(1))
    m = re.search(r"\u7ea6\s*(\d+)\s*\u5206\u949f", text)
    if m: out["reading_minutes"] = int(m.group(1))
    return out


def render_inline(el) -> str:
    if isinstance(el, NavigableString):
        return str(el)
    if not isinstance(el, Tag):
        return ""
    name = el.name or ""
    inner = "".join(render_inline(c) for c in el.children)
    if name in ("strong", "b"):
        return f"**{inner}**"
    if name in ("em", "i"):
        return f"*{inner}*"
    if name == "code":
        return f"`{inner.replace('`', '``')}`"
    if name == "a":
        href = el.get("href", "")
        return f"[{inner}]({href})"
    if name == "br":
        return "  \n"
    return inner


def render_block(el, out: list) -> None:
    if isinstance(el, NavigableString):
        txt = str(el).strip()
        if txt:
            out.append(txt)
        return
    if not isinstance(el, Tag):
        return
    name = el.name or ""
    if name in ("h1", "h2", "h3", "h4", "h5", "h6"):
        level = int(name[1])
        text = "".join(render_inline(c) for c in el.children).strip()
        out.append("")
        out.append("#" * level + " " + text)
        out.append("")
        return
    if name == "p":
        text = "".join(render_inline(c) for c in el.children).strip()
        if text:
            out.append("")
            out.append(text)
            out.append("")
        return
    if name == "pre":
        code = el.find("code")
        lang = ""
        if code is not None:
            for c in (code.get("class") or []):
                mm = re.match(r"language-(\S+)", c)
                if mm:
                    lang = mm.group(1)
            body = code.get_text()
        else:
            body = el.get_text()
        body = body.rstrip("\n")
        out.append("")
        out.append(f"```{lang}")
        out.append(body)
        out.append("```")
        out.append("")
        return
    if name == "ul":
        for li in el.find_all("li", recursive=False):
            txt = "".join(render_inline(c) for c in li.children).strip()
            out.append("- " + txt)
        out.append("")
        return
    if name == "ol":
        for i, li in enumerate(el.find_all("li", recursive=False), start=1):
            txt = "".join(render_inline(c) for c in li.children).strip()
            out.append(f"{i}. " + txt)
        out.append("")
        return
    if name == "table":
        head_cells = []
        body_rows = []
        thead = el.find("thead")
        tbody = el.find("tbody")
        if thead:
            tr = thead.find("tr")
            if tr:
                head_cells = [
                    "".join(render_inline(c) for c in th.children).strip()
                    for th in tr.find_all(["th", "td"])
                ]
        rows = tbody.find_all("tr") if tbody else el.find_all("tr")
        for tr in rows:
            cells = [
                "".join(render_inline(c) for c in c.children).strip()
                for c in tr.find_all(["td", "th"])
            ]
            if cells == head_cells:
                continue
            if not head_cells:
                head_cells = cells
                continue
            body_rows.append(cells)
        if head_cells:
            out.append("")
            out.append("| " + " | ".join(head_cells) + " |")
            out.append("| " + " | ".join(["---"] * len(head_cells)) + " |")
            for row in body_rows:
                while len(row) < len(head_cells):
                    row.append("")
                row = row[: len(head_cells)]
                out.append("| " + " | ".join(row) + " |")
            out.append("")
        return
    if name == "blockquote":
        text = "".join(render_inline(c) for c in el.children).strip()
        out.append("")
        for line in text.splitlines() or [text]:
            out.append("> " + line)
        out.append("")
        return
    if name == "hr":
        out.append("")
        out.append("---")
        out.append("")
        return
    if name in ("script", "style", "noscript"):
        return
    if name in ("div", "section", "article"):
        for c in el.children:
            render_block(c, out)
        return
    text = "".join(render_inline(c) for c in el.children).strip()
    if text:
        out.append("")
        out.append(text)
        out.append("")


def clean(node) -> str:
    out: list = []
    for child in node.children:
        render_block(child, out)
    md = "\n".join(out)
    md = re.sub(r"\n{3,}", "\n\n", md)
    return md.strip() + "\n"


def count_code_blocks(md: str) -> tuple:
    rx = re.compile(r"(?ms)^```(\w*)\r?\n(.*?)\r?\n```")
    code_blocks = 0
    code_lines = 0
    mermaid_blocks = 0
    for m in rx.finditer(md):
        lang = m.group(1) or ""
        body = m.group(2)
        if body:
            nlines = body.count("\n") + (0 if body.endswith("\n") else 1)
        else:
            nlines = 0
        code_blocks += 1
        if lang == "mermaid":
            mermaid_blocks += 1
        else:
            code_lines += nlines
    return code_blocks, code_lines, mermaid_blocks


def fetch_one(slug: str):
    url = BASE_URL + slug
    html = fetch_html(url)
    body = article_body(html)
    meta = article_meta(html)
    md = clean(body)
    cb, cl, mb = count_code_blocks(md)
    meta["code_blocks"] = cb
    meta["code_lines"] = cl
    meta["mermaid_blocks"] = mb
    return md, meta


def main(argv) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("slug", nargs="?")
    ap.add_argument("--all", action="store_true")
    args = ap.parse_args(argv)

    if args.all:
        slugs = CHAPTERS
    elif args.slug:
        if args.slug not in CHAPTERS:
            print(f"unknown slug: {args.slug}", file=sys.stderr)
            return 2
        slugs = [args.slug]
    else:
        ap.print_help()
        return 1

    failures = []
    for slug in slugs:
        try:
            md, meta = fetch_one(slug)
            sys.stdout.write(f"\n=====BEGIN:{slug}=====\n")
            for k in ("original_chars", "code_lines", "reading_minutes", "code_blocks", "mermaid_blocks"):
                if k in meta:
                    sys.stdout.write(f"META:{k}={meta[k]}\n")
            sys.stdout.write(md)
            sys.stdout.write(f"=====END:{slug}=====\n")
        except Exception as exc:
            failures.append((slug, str(exc)))
            print(f"FAIL {slug}: {exc}", file=sys.stderr)

    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))


