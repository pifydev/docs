#!/usr/bin/env python3
"""mdBook preprocessor: strip leading YAML frontmatter from chapter content.

Protocol:
  1. mdBook invokes the command with `supports <renderer>` as argv; we
     exit 0 to signal renderer support.
  2. mdBook pipes a 2-element JSON array `[context, book]` into stdin.
     - mdBook 0.4.x uses `sections` for the top-level list.
     - mdBook 0.5.x uses `items` for the top-level list.

Each section is `{"Chapter": {...}}`, `{"PartTitle": "..."}`, or
`{"Separator": null}`. Chapters carry `content` (markdown string) and
`sub_items` (nested sections).

We mutate `chapter["content"]` in place to remove the leading YAML
frontmatter block (delimited by `---` lines at the very start of the
file) and emit the modified book JSON on stdout.
"""
import io
import json
import re
import sys

# Force UTF-8 on stdin/stdout/stderr so CJK / emoji / etc. survive the
# mdBook preprocessor pipe on Windows (default code page would mangle them).
for _stream in (sys.stdin, sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8")
    except (AttributeError, io.UnsupportedOperation):
        # Python < 3.7 or a non-reconfigurable stream - nothing to do.
        pass

FRONTMATTER_RE = re.compile(r"\A---\r?\n.*?\r?\n---\r?\n", re.DOTALL)


def strip(content):
    if not content:
        return content
    return FRONTMATTER_RE.sub("", content, count=1)


def visit(section):
    if not isinstance(section, dict):
        return
    if "Chapter" in section:
        ch = section["Chapter"]
        if isinstance(ch, dict) and ch.get("content") is not None:
            ch["content"] = strip(ch["content"])
        for sub in ch.get("sub_items", []) or []:
            visit(sub)
    # PartTitle / Separator / draft chapters need no changes.


def main():
    if len(sys.argv) > 1 and sys.argv[1] == "supports":
        sys.exit(0)

    data = json.load(sys.stdin)
    if isinstance(data, list) and len(data) == 2:
        book = data[1]
    elif isinstance(data, dict):
        book = data
    else:
        json.dump(data, sys.stdout)
        return

    # mdBook 0.5.x uses `items`; 0.4.x uses `sections`. Visit both.
    for key in ("items", "sections"):
        for item in book.get(key, []) or []:
            visit(item)

    json.dump(book, sys.stdout)


if __name__ == "__main__":
    main()
