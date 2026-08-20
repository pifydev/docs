#!/usr/bin/env python3
"""
Add ```typescript language tags to zh ch01 blocks 6/7/8 (lines 346/369/391).
These are typescript code snippets; en/vi already have the tag.
"""
from pathlib import Path

ZH = Path(r"E:\project\pi-docs\zh\src\ch01-overview.md")
text = ZH.read_text(encoding="utf-8")

# Snippets that follow the bare ``` fence (used as anchor to avoid hardcoding line numbers)
anchors = [
    ("```\n// 入口在 compat 子模块", "```typescript\n// 入口在 compat 子模块"),
    ("```\n// 教学示意", "```typescript\n// 教学示意"),
    ("```\nimport { createAgentSession }", "```typescript\nimport { createAgentSession }"),
]

for old, new in anchors:
    if old not in text:
        raise SystemExit(f"ERROR: anchor not found: {old[:40]!r}")
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"ERROR: anchor matched {count} times: {old[:40]!r}")
    text = text.replace(old, new, 1)

ZH.write_text(text, encoding="utf-8")
print(f"OK: wrote {ZH}")
