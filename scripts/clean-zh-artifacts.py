#!/usr/bin/env python3
"""Strip FAIL artifact lines from end of zh chapter files."""
from pathlib import Path

ROOT = Path(r"E:\project\pi-docs") / "zh" / "src"
for p in sorted(ROOT.glob("*.md")):
    text = p.read_text(encoding="utf-8")
    lines = text.splitlines()
    # find first FAIL line and truncate there
    cleaned = []
    for line in lines:
        if line.startswith("FAIL ") and "article body" in line:
            break
        cleaned.append(line)
    # also strip trailing blank lines
    while cleaned and cleaned[-1].strip() == "":
        cleaned.pop()
    if len(cleaned) != len(lines):
        new_text = "\n".join(cleaned) + "\n"
        p.write_text(new_text, encoding="utf-8")
        print(f"cleaned {p.name}: {len(lines)} -> {len(cleaned)} lines")
print("Done.")
