#!/usr/bin/env python3
"""
Read a zh chapter and emit a JSON worksheet containing every prose segment
plus the full code-block list (for verbatim reuse).
Output: scripts/worksheets/<chapter>.json
"""
import json
import sys
from pathlib import Path

ROOT = Path(r"E:\project\pi-docs")
OUT = ROOT / "scripts" / "worksheets"
OUT.mkdir(parents=True, exist_ok=True)


def extract(text):
    if text.startswith("---"):
        end = text.find("\n---", 3)
        if end != -1:
            fm = text[:end+4]
            body = text[end+4:].lstrip("\n")
        else:
            fm = "---"
            body = text
    else:
        fm = "---"
        body = text

    segments = []
    lines = body.splitlines()
    i = 0
    current_prose = []

    def flush_prose():
        if current_prose:
            segments.append({"type": "prose", "text": "\n".join(current_prose)})
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
                code_lines.append(lines[i])
                i += 1
            segments.append({"type": "code", "lang": lang, "text": "\n".join(code_lines)})
        else:
            current_prose.append(line)
            i += 1

    flush_prose()
    return fm, segments


if __name__ == "__main__":
    chapter_path = Path(sys.argv[1])
    chapter = chapter_path.stem
    text = chapter_path.read_text(encoding="utf-8")
    fm, segs = extract(text)

    out = {
        "chapter": chapter,
        "frontmatter": fm,
        "segments": [
            {"index": i, **s, "en": "", "vi": ""} if s["type"] == "prose" else {"index": i, **s}
            for i, s in enumerate(segs)
        ],
    }

    out_path = OUT / f"{chapter}.json"
    out_path.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    prose_count = sum(1 for s in segs if s["type"] == "prose")
    code_count = sum(1 for s in segs if s["type"] == "code")
    print(f"OK: {chapter} -> {out_path}")
    print(f"  {prose_count} prose segments, {code_count} code blocks")
