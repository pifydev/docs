"""Fix literal \\n (backslash + n) in JSON values to actual newlines."""
import json
from pathlib import Path

ROOT = Path(r"E:\project\pi-docs/scripts/translations")

def fix_value(v):
    if isinstance(v, str):
        # Convert literal backslash-n sequences to actual newlines
        return v.replace("\\n", "\n").replace("\\t", "\t").replace("\\\"", "\"")
    if isinstance(v, dict):
        return {k: fix_value(val) for k, val in v.items()}
    if isinstance(v, list):
        return [fix_value(x) for x in v]
    return v

for p in ROOT.glob("*.json"):
    data = json.loads(p.read_text(encoding="utf-8"))
    fixed = fix_value(data)
    p.write_text(json.dumps(fixed, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"fixed {p.name}")
print("Done.")
