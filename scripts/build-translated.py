#!/usr/bin/env python3
"""Build en/vi chapter files from a worksheet JSON + translations JSON.

Usage:
  python scripts/build-translated.py scripts/worksheets/ch03-agent-loop.json

Reads:
  - worksheets/<chapter>.json : segments + frontmatter
  - translations/<chapter>.json: {"<index>": {"en": "...", "vi": "..."}, ...}

Writes:
  - en/src/<chapter>.md
  - vi/src/<chapter>.md
"""
import json
import sys
from pathlib import Path

ROOT = Path(r"E:\project\pi-docs")
WORKSHEETS = ROOT / "scripts" / "worksheets"
TRANSLATIONS = ROOT / "scripts" / "translations"


def build_language(worksheet, translations, lang):
    fm = worksheet["frontmatter"]
    lines = fm.splitlines()
    new_lines = []
    for line in lines:
        s = line.strip()
        if s == "language: zh":
            new_lines.append(f"language: {lang}")
        elif s == "translator: null":
            new_lines.append("translator: hypnguyen1209")
        elif s.startswith("status:"):
            new_lines.append("status: translated")
        else:
            new_lines.append(line)
    fm_out = "\n".join(new_lines)

    body_parts = [fm_out]
    for seg in worksheet["segments"]:
        idx = seg["index"]
        if seg["type"] == "code":
            body_parts.append(seg["text"])
        else:
            tr = translations.get(str(idx), {}).get(lang, "")
            if not tr:
                raise SystemExit(f"ERROR: missing translation for {worksheet['chapter']} segment {idx} ({lang})")
            body_parts.append(tr)

    return "\n\n".join(body_parts) + "\n"


def main():
    ws_path = Path(sys.argv[1])
    chapter = ws_path.stem
    tr_path = TRANSLATIONS / f"{chapter}.json"

    if not tr_path.exists():
        raise SystemExit(f"ERROR: missing translations file {tr_path}")

    ws = json.loads(ws_path.read_text(encoding="utf-8"))
    tr = json.loads(tr_path.read_text(encoding="utf-8"))

    en_text = build_language(ws, tr, "en")
    vi_text = build_language(ws, tr, "vi")

    en_out = ROOT / "en" / "src" / f"{chapter}.md"
    vi_out = ROOT / "vi" / "src" / f"{chapter}.md"

    en_out.write_text(en_text, encoding="utf-8")
    vi_out.write_text(vi_text, encoding="utf-8")
    print(f"OK: wrote {en_out} ({len(en_text)} chars)")
    print(f"OK: wrote {vi_out} ({len(vi_text)} chars)")


if __name__ == "__main__":
    main()
