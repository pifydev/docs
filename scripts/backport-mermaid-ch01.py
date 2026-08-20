#!/usr/bin/env python3
"""
Backport mermaid diagram from en ch01-overview.md to zh ch01-overview.md.

The ASCII-art diagram in zh is followed immediately by prose.
The en/vi versions insert a ```mermaid``` block in between.

We insert the (Chinese-labeled) mermaid after the ASCII close fence (``` line)
and before the prose "这四层里" paragraph.
"""
from pathlib import Path

ROOT = Path(r"E:\project\pi-docs")
ZH = ROOT / "zh" / "src" / "ch01-overview.md"

text = ZH.read_text(encoding="utf-8")

# The ASCII close is the 14th ``` line (we counted earlier).
# Find the ASCII block close: ``` on its own line followed by blank then "这四层里".
needle = "└──────────────────────────────────────────┘\n```\n\n这四层里"
replacement = (
    "└──────────────────────────────────────────┘\n```\n\n"
    "```mermaid\n"
    "%% Pi-Agent 四层架构\n"
    "graph TB\n"
    "    subgraph TOP[\"顶层: 完整 CLI 产品 + SDK\"]\n"
    "        PCA[\"pi-coding-agent<br/>系统提示词 · 内置工具 · 会话管理 · 扩展\"]\n"
    "    end\n"
    "    subgraph MID[\"中层: Agent 引擎 + 正交 UI\"]\n"
    "        PAC[\"pi-agent-core<br/>AgentLoop · 工具系统 · 事件流\"]\n"
    "        TUI[\"pi-tui<br/>差分渲染 · 组件系统\"]\n"
    "    end\n"
    "    BOT[\"pi-ai<br/>统一 API · 上下文交接 · 流式 · Token 追踪\"]\n"
    "    PCA --> PAC\n"
    "    PCA --> BOT\n"
    "    PCA --> TUI\n"
    "    PAC --> BOT\n"
    "    classDef top fill:#fff4d6,stroke:#d4a017,color:#000\n"
    "    classDef mid fill:#e6f3ff,stroke:#1976d2,color:#000\n"
    "    classDef bot fill:#e8f5e9,stroke:#388e3c,color:#000\n"
    "    class PCA top\n"
    "    class PAC,TUI mid\n"
    "    class BOT bot\n"
    "```\n\n"
    "这四层里"
)

if needle not in text:
    raise SystemExit("ERROR: needle not found in zh ch01")

count = text.count(needle)
if count != 1:
    raise SystemExit(f"ERROR: needle matched {count} times, expected 1")

new_text = text.replace(needle, replacement)

# Bump code_blocks from 7 to 8, mermaid_blocks from 0 to 1 in frontmatter.
new_text = new_text.replace("code_blocks: 7\n", "code_blocks: 8\n")
new_text = new_text.replace("mermaid_blocks: 0\n", "mermaid_blocks: 1\n")

ZH.write_text(new_text, encoding="utf-8")
print(f"OK: wrote {ZH} ({len(new_text)} chars)")
