#!/usr/bin/env python3
"""Print just the prose segments of a chapter worksheet for translation."""
import json
import sys
from pathlib import Path

ws = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
print(f"# {ws['chapter']} - prose segments ({len([s for s in ws['segments'] if s['type']=='prose'])} total)")
print()
for seg in ws["segments"]:
    if seg["type"] != "prose":
        continue
    print(f"## --- segment {seg['index']} ---")
    print(seg["text"])
    print()
