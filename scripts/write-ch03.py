"""Write the ch03 translations file using Python to avoid PowerShell encoding issues."""
import sys
from pathlib import Path

OUT = Path(r"E:\project\pi-docs\scripts/translations/ch03.py")

# Each entry is (index, en, vi)
ENTRIES = [
    (0, """# Chapter 3: Agent Loop \u2014 The Engine That Spins the Model

> The previous chapter walked through Pi's layered architecture. The architecture is just the "skeleton" \u2014 the real vitality of an Agent comes from the "loop." This chapter, we start from the most basic questions: **why do we need a loop? how does it spin? when does it stop?** Then we trace the complete journey of a user message to see every heartbeat of the Agent Loop.

---

## 1. Prelude: three ways to use an LLM

Before talking about the Agent Loop, let's step back and see how many modes "using an LLM" itself has. This is essential for understanding "why we need a loop."

### Mode 1: direct call \u2014 "model, answer me"

The most primitive and intuitive usage. You build a prompt, call the API once, get the result, done.""",
         """# Ch\u01b0\u01a1ng 3: Agent Loop \u2014 \u0110\u1ed9ng c\u01a1 quay m\u00f4 h\u00ecnh

> Ch\u01b0\u01a1ng tr\u01b0\u1edbc \u0111\u00e3 xem ki\u1ebfn tr\u00fac ph\u00e2n l\u1edbp c\u1ee7a Pi. Ki\u1ebfn tr\u00fac ch\u1ec9 l\u00e0 "b\u1ed9 x\u01b0\u01a1ng" \u2014 s\u1ee9c s\u1ed1ng th\u1eadt s\u1ef1 c\u1ee7a m\u1ed9t Agent \u0111\u1ebfn t\u1eeb "v\u00f2ng l\u1eb7p" (loop). Ch\u01b0\u01a1ng n\u00e0y, ta b\u1eaft \u0111\u1ea7u t\u1eeb nh\u1eefng c\u00e2u h\u1ecfi c\u01a1 b\u1ea3n nh\u1ea5t: **t\u1ea1i sao c\u1ea7n v\u00f2ng l\u1eb7p? n\u00f3 quay nh\u01b0 th\u1ebf n\u00e0o? khi n\u00e0o d\u1eebng?** R\u1ed3i ta truy v\u1ebft h\u00e0nh tr\u00ecnh \u0111\u1ea7y \u0111\u1ee7 c\u1ee7a m\u1ed9t message ng\u01b0\u1eddi d\u00f9ng \u0111\u1ec3 th\u1ea5y t\u1eebng nh\u1ecbp \u0111\u1eadp c\u1ee7a Agent Loop.

---

## 1. M\u1edf \u0111\u1ea7u: ba c\u00e1ch d\u00f9ng LLM

Tr\u01b0\u1edbc khi b\u00e0n v\u1ec1 Agent Loop, ta l\u00f9i m\u1ed9t b\u01b0\u1edbc xem b\u1ea3n th\u00e2n vi\u1ec7c "d\u00f9ng LLM" c\u00f3 bao nhi\u00eau ki\u1ec3u. \u0110i\u1ec1u n\u00e0y r\u1ea5t quan tr\u1ecdng \u0111\u1ec3 hi\u1ec3u "t\u1ea1i sao c\u1ea7n v\u00f2ng l\u1eb7p".

### Ki\u1ec3u 1: g\u1ecdi tr\u1ef1c ti\u1ebfp \u2014 "model, tr\u1ea3 l\u1eddi \u0111i"

C\u00e1ch d\u00f9ng nguy\u00ean th\u1ee7y v\u00e0 tr\u1ef1c quan nh\u1ea5t. B\u1ea1n d\u1ef1ng prompt, g\u1ecdi API m\u1ed9t l\u1ea7n, l\u1ea5y k\u1ebft qu\u1ea3, xong."""),

    (2, "\nThe code roughly looks like this:\n",
         "\nCode ki\u1ec3u th\u1ebf n\u00e0y:\n"),

    (4, """\n**The core work is "build the prompt."** A good prompt gives a good result. One call, one output, no back-and-forth.

Applicable scenarios: translation, summarization, Q&A, code completion \u2014 anything a "one-question-one-answer" can handle.

### Mode 2: Workflow \u2014 "model, you do step one first; I check, then you do step two"

When the task gets complex, you find it hard to get a satisfactory result in one go. So you break the big task into steps, calling the model once per step, with **your code** controlling the flow between steps.""",
         """\n**C\u00f4ng vi\u1ec7c c\u1ed1t l\u00f5i l\u00e0 "d\u1ef1ng prompt" (build the prompt).** Prompt t\u1ed1t th\u00ec k\u1ebft qu\u1ea3 t\u1ed1t. M\u1ed9t l\u1ea7n g\u1ecdi, m\u1ed9t l\u1ea7n output, kh\u00f4ng qua l\u1ea1i.

T\u00ecnh hu\u1ed1ng \u00e1p d\u1ee5ng: d\u1ecbch, t\u00f3m t\u1eaft, h\u1ecfi \u0111\u00e1p, ho\u00e0n thi\u1ec7n code \u2014 b\u1ea5t c\u1ee9 th\u1ee9 g\u00ec "m\u1ed9t c\u00e2u h\u1ecfi m\u1ed9t c\u00e2u tr\u1ea3 l\u1eddi" x\u1eed l\u00fd \u0111\u01b0\u1ee3c.

### Ki\u1ec3u 2: Workflow \u2014 "model, l\u00e0m b\u01b0\u1edbc m\u1ed9t tr\u01b0\u1edbc; t\u00f4i ki\u1ec3m tra, r\u1ed3i l\u00e0m b\u01b0\u1edbc hai"

Khi task ph\u1ee9c t\u1ea1p l\u00ean, b\u1ea1n th\u1ea5y kh\u00f3 c\u00f3 k\u1ebft qu\u1ea3 t\u1ed1t trong m\u1ed9t l\u1ea7n. V\u1eady l\u00e0 b\u1ea1n chia task l\u1edbn th\u00e0nh nhi\u1ec1u b\u01b0\u1edbc, m\u1ed7i b\u01b0\u1edbc g\u1ecdi model m\u1ed9t l\u1ea7n, gi\u1eefa c\u00e1c b\u01b0\u1edbc **code c\u1ee7a b\u1ea1n** \u0111i\u1ec1u khi\u1ec3n lu\u1ed3ng."""),
]

lines = ["# ch03-agent-loop prose translations\n", "# Style: direct English prose; vi keeps English technical terms.\n", "T = {}\n"]

for idx, en, vi in ENTRIES:
    lines.append(f"T[{idx}] = {{\n")
    lines.append(f'    "en": {en!r},\n')
    lines.append(f'    "vi": {vi!r},\n')
    lines.append("}\n\n")

OUT.write_text("".join(lines), encoding="utf-8")
print(f"OK: wrote {OUT} ({len(ENTRIES)} entries)")
