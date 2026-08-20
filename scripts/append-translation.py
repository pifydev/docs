#!/usr/bin/env python3
"""Append translations to a chapter JSON file.

Usage:
  python scripts/append-translation.py <chapter> --add KEY1 --en "..." --vi "..." [--add KEY2 --en "..." --vi "..." ...]

Reads existing scripts/translations/<chapter>.json (or creates one),
adds the entries, and writes back.
"""
import argparse
import json
import sys
from pathlib import Path

ROOT = Path(r"E:\project\pi-docs")

def main():
    args_list = sys.argv[1:]
    if not args_list:
        print("Usage: append-translation.py <chapter> --add KEY --en ... --vi ...")
        sys.exit(1)

    chapter = args_list[0]
    args_list = args_list[1:]

    path = ROOT / "scripts" / "translations" / f"{chapter}.json"
    if path.exists():
        data = json.loads(path.read_text(encoding="utf-8"))
    else:
        data = {}

    # parse --add KEY --en VAL --vi VAL groups
    i = 0
    while i < len(args_list):
        if args_list[i] != "--add":
            print(f"ERROR: expected --add at position {i}, got {args_list[i]}")
            sys.exit(1)
        i += 1
        if i >= len(args_list):
            print("ERROR: --add needs a key argument")
            sys.exit(1)
        key = args_list[i]
        i += 1
        en = None
        vi = None
        while i < len(args_list) and args_list[i] in ("--en", "--vi"):
            flag = args_list[i]
            i += 1
            if i >= len(args_list):
                print(f"ERROR: {flag} needs a value")
                sys.exit(1)
            val = args_list[i]
            i += 1
            if flag == "--en":
                en = val
            elif flag == "--vi":
                vi = val
        if en is None or vi is None:
            print(f"ERROR: --add {key} needs both --en and --vi")
            sys.exit(1)
        data[key] = {"en": en, "vi": vi}
        print(f"  + key {key} ({len(en)} en, {len(vi)} vi)")

    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"OK: wrote {path} ({len(data)} entries total)")

if __name__ == "__main__":
    main()
