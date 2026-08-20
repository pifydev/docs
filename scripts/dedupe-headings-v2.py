"""Remove duplicate and near-duplicate heading lines."""
import json
from pathlib import Path

PATH = Path(r"E:\project\pi-docs/scripts/translations/ch03-agent-loop.json")
data = json.loads(PATH.read_text(encoding="utf-8"))


def normalize(s):
    """Normalize heading text for comparison."""
    return s.lower().strip().rstrip(".").rstrip(":").rstrip("?")


def dedupe(text):
    lines = text.split("\n")
    seen_normalized = {}  # normalized -> first occurrence index
    out = []
    for line in lines:
        s = line.strip()
        if s.startswith("#"):
            norm = normalize(s)
            # Check if this normalized heading has been seen
            if norm in seen_normalized:
                continue  # skip duplicate
            seen_normalized[norm] = len(out)
        out.append(line)
    return "\n".join(out)


for k in data.keys():
    for lang in ("en", "vi"):
        original = data[k][lang]
        deduped = dedupe(original)
        if deduped != original:
            removed = len(original.split("\n")) - len(deduped.split("\n"))
            print(f"  {k}.{lang}: removed {removed} duplicate heading lines")
        data[k][lang] = deduped

PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"OK: wrote {PATH}")
