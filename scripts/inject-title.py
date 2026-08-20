#!/usr/bin/env python3
"""Inject top-level `title` field into chapter frontmatter for Starlight.

For each file in src/content/docs/{zh,en,vi}/, derive the title from
title_<lang> and prepend a `title:` line at the top of frontmatter.
"""
import re
from pathlib import Path

ROOT = Path("src/content/docs")
LANGS = ("zh", "en", "vi")

FRONTMATTER_RE = re.compile(r"\A---\n(.*?)\n---", re.DOTALL)


def inject(file: Path) -> None:
    text = file.read_text(encoding="utf-8")
    m = FRONTMATTER_RE.match(text)
    if not m:
        return
    body = m.group(1)
    lang = file.parent.name
    title_key = f"title_{lang}"
    title_match = re.search(rf'^{title_key}:\s*"?(.+?)"?\s*$', body, re.MULTILINE)
    if not title_match:
        return
    title_value = title_match.group(1).strip().strip('"')
    if re.search(r"^title:\s", body, re.MULTILINE):
        return
    new_body = f"title: {title_value}\n" + body
    new_text = "---\n" + new_body + "\n---" + text[m.end():]
    file.write_text(new_text, encoding="utf-8")


def main() -> None:
    for lang in LANGS:
        for f in (ROOT / lang).glob("ch*.md"):
            inject(f)
        inject(ROOT / lang / "index.md")
    print("Injected `title` field into all chapter files")


if __name__ == "__main__":
    main()
