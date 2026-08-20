#!/usr/bin/env python3
"""Split a zh chapter into prose segments + code blocks (verbatim)."""
import sys
from pathlib import Path

def extract(text):
    # Skip frontmatter
    if text.startswith("---"):
        end = text.find("\n---", 3)
        if end != -1:
            body = text[end+4:].lstrip("\n")
        else:
            body = text
    else:
        body = text

    segments = []  # list of ("prose", text) or ("code", code)
    lines = body.splitlines()
    i = 0
    current_prose = []

    def flush_prose():
        if current_prose:
            segments.append(("prose", "\n".join(current_prose)))
            current_prose.clear()

    while i < len(lines):
        line = lines[i]
        if line.startswith("```"):
            flush_prose()
            lang = line[3:].strip()
            code_lines = [line]
            i += 1
            while i < len(lines) and not lines[i].startswith("```"):
                code_lines.append(lines[i])
                i += 1
            if i < len(lines):
                code_lines.append(lines[i])  # closing fence
                i += 1
            segments.append(("code", "\n".join(code_lines), lang))
        else:
            current_prose.append(line)
            i += 1

    flush_prose()
    return segments

if __name__ == "__main__":
    path = Path(sys.argv[1])
    text = path.read_text(encoding="utf-8")
    segs = extract(text)
    print(f"=== {path.name}: {len(segs)} segments ===")
    for idx, s in enumerate(segs):
        if s[0] == "prose":
            kind, content = s
            preview = content[:60].replace("\n", "\\n")
            print(f"  [{idx:02d}] prose  ({len(content)} chars): {preview!r}")
        else:
            kind, content, lang = s
            n_code = content.count("\n")
            print(f"  [{idx:02d}] code   lang={lang!r} lines={n_code}")
