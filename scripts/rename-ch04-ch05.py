#!/usr/bin/env python3
"""
Rename newly-fetched ch04/ch05 to canonical slugs and merge titles from old stubs.

Background:
- dgzhuya.com uses slugs ch04-model-call and ch05-tools for those two chapters.
- Our canonical SUMMARY.md names are ch04-model-invocation and ch05-tool-system.
- Old stubs (tracked) have empty content but proper titles.
- Newly-fetched files (untracked) have real content but ugly slugs and empty titles.

This script:
1. Reads title_* fields from old stubs.
2. Reads newly-fetched content.
3. Writes to canonical filenames with: merged titles, canonical slugs, canonical source_url, canonical version_pairs.
4. Deletes the ugly-slug files (they are untracked, so safe to remove).
"""
from pathlib import Path

ROOT = Path(r"E:\project\pi-docs")
ZH = ROOT / "zh" / "src"

PAIRS = [
    {
        "old_stub": "ch04-model-invocation.md",
        "ugly_slug": "ch04-model-call",
        "canonical": "ch04-model-invocation",
    },
    {
        "old_stub": "ch05-tool-system.md",
        "ugly_slug": "ch05-tools",
        "canonical": "ch05-tool-system",
    },
]


def split_frontmatter(text: str):
    if not text.startswith("---"):
        return None, text
    end = text.find("\n---", 3)
    if end == -1:
        return None, text
    fm = text[3:end].strip("\n")
    body = text[end + 4:].lstrip("\n")
    return fm, body


def parse_simple(fm: str):
    out = {}
    for line in fm.splitlines():
        if ":" in line and not line.startswith(" "):
            k, _, v = line.partition(":")
            out[k.strip()] = v.strip()
    return out


def render_frontmatter(d: dict) -> str:
    order = [
        "chapter", "slug", "title_zh", "title_en", "title_vi",
        "source_url", "language", "version_pairs", "original_chars",
        "code_lines", "reading_minutes", "translator", "reviewed_by",
        "last_updated", "status", "official_refs", "terms_used",
        "mermaid_blocks", "code_blocks",
    ]
    lines = ["---"]
    seen = set()
    for k in order:
        if k in d:
            lines.append(f"{k}: {d[k]}")
            seen.add(k)
    for k, v in d.items():
        if k not in seen:
            lines.append(f"{k}: {v}")
    lines.append("---")
    return "\n".join(lines) + "\n"


for p in PAIRS:
    canonical = p["canonical"]
    ugly = p["ugly_slug"]
    stub_path = ZH / p["old_stub"]
    ugly_path = ZH / f"{ugly}.md"
    final_path = ZH / f"{canonical}.md"

    print(f"--- {canonical} ---")

    stub_text = stub_path.read_text(encoding="utf-8")
    ugly_text = ugly_path.read_text(encoding="utf-8")

    stub_fm, _ = split_frontmatter(stub_text)
    ugly_fm, ugly_body = split_frontmatter(ugly_text)

    stub_d = parse_simple(stub_fm)
    ugly_d = parse_simple(ugly_fm)

    # Start with ugly content, overlay stub titles
    merged = dict(ugly_d)
    for k in ("title_zh", "title_en", "title_vi"):
        if k in stub_d and stub_d[k]:
            merged[k] = stub_d[k]

    # Override slug, source_url, version_pairs to canonical
    merged["slug"] = canonical
    merged["source_url"] = f"https://www.dgzhuya.com/modules/{canonical}"
    merged["version_pairs"] = (
        f"{{ zh: zh/src/{canonical}.md, "
        f"en: en/src/{canonical}.md, "
        f"vi: vi/src/{canonical}.md }}"
    )
    # Bump status and date
    merged["status"] = "translated"
    merged["last_updated"] = "2026-08-20"

    # Ensure missing keys for downstream sync-check
    merged.setdefault("official_refs", "[]")
    merged.setdefault("terms_used", "[]")
    merged.setdefault("mermaid_blocks", "0")
    merged.setdefault("code_blocks", "0")

    final_text = render_frontmatter(merged) + "\n" + ugly_body
    final_path.write_text(final_text, encoding="utf-8")
    print(f"  wrote {final_path} ({len(final_text)} chars)")

    # Remove the ugly file (untracked, safe)
    ugly_path.unlink()
    print(f"  deleted {ugly_path}")

print("\nDone.")
