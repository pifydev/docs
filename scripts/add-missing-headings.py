"""Prepend missing headings to existing ch03 translation entries."""
import json
from pathlib import Path

PATH = Path(r"E:\project\pi-docs/scripts/translations/ch03-agent-loop.json")
data = json.loads(PATH.read_text(encoding="utf-8"))

# (segment_id, heading_to_prepend_en, heading_to_prepend_vi)
HEADINGS = {
    "14": ("## 3. Big picture: how a message journeys, and how the loop spins\n\n### Full flow\n",
            "## 3. Toàn cảnh: hành trình một message, và vòng lặp quay ra sao\n\n### Flow toàn cảnh\n"),
    "16": ("### How the loop spins: stopReason — the only signal\n",
            "### Vòng lặp quay ra sao: stopReason — đèn tín hiệu duy nhất\n"),
    "18": ("### One rule drives the entire loop\n",
            "### Một quy tắc dẫn dắt cả vòng lặp\n"),
    "20": ("## 4. Source walkthrough: base Loop and coding-agent layering\n\n### Minimal Loop: lowest common denominator of all Agents\n",
            "## 4. Đi sâu source: Loop nền và lớp phủ của coding-agent\n\n### Vòng lặp tối thiểu: mẫu số chung nhỏ nhất của mọi Agent\n"),
    "22": ("### What coding-agent layers on top\n",
            "### coding-agent phủ lên trên những gì\n"),
    "34": ("### 4.2 Skeleton of runLoop(): core first, then layering\n\n#### Core: the inner loop\n",
            "### 4.2 Bộ xương của runLoop(): lõi trước, lớp phủ sau\n\n#### Lõi: inner loop\n"),
    "36": ("#### Layering: coding-agent adds two outer shells\n",
            "#### Lớp phủ: coding-agent thêm hai vỏ ngoài\n"),
    "38": ("### 4.3 [Layering 1 · Step A] steering message injection\n",
            "### 4.3 [Lớp phủ 1 · Bước A] steering message injection\n"),
    "40": ("### 4.4 [Core · Step B] streamAssistantResponse() — calling the LLM\n\n#### Phase A: context preprocessing (optional)\n",
            "### 4.4 [Lõi · Bước B] streamAssistantResponse() — gọi LLM\n\n#### Pha A: tiền xử lý context (tùy chọn)\n"),
    "42": ("#### Phase B: AgentMessage to Message conversion (two-layer message boundary)\n",
            "#### Pha B: chuyển AgentMessage thành Message (ranh giới hai tầng message)\n"),
    "48": ("#### Phase C: build Context and call the model\n",
            "#### Pha C: dựng Context và gọi model\n"),
    "52": ("#### Phase D: stream the response — the cleverness of in-place replacement\n",
            "#### Pha D: xử lý streaming response — cái hay của việc thay tại chỗ\n"),
    "56": ("### 4.5 [Core · Step C] check stopReason\n",
            "### 4.5 [Lõi · Bước C] kiểm tra stopReason\n"),
    "58": ("### 4.6 [Core · Step D] executeToolCalls() — execute tools\n",
            "### 4.6 [Lõi · Bước D] executeToolCalls() — thực thi tool\n"),
    "68": ("### 4.7 [Core + Layering · Steps E-F] turn_end + hooks + recheck steering\n",
            "### 4.7 [Lõi + Lớp phủ · Bước E~F] turn_end + hook + kiểm tra lại steering\n"),
    "70": ("### 4.8 Back to top of the loop\n",
            "### 4.8 Quay về đầu vòng lặp\n"),
    "72": ("### 4.9 [Layering 2 · Step G] outer loop: followUp life-extension\n",
            "### 4.9 [Lớp phủ 2 · Bước G] outer loop: cơ chế kéo dài thở của followUp\n"),
    "74": ("### 4.10 steering vs followUp: a table to see both interventions\n\n## 5. Summary: four core Loop designs\n\n### 1. ReAct loop pattern\n",
            "### 4.10 steering vs followUp: một bảng nhìn rõ hai can thiệp\n\n## 5. Tổng kết: bốn thiết kế cốt lõi của Loop\n\n### 1. Mô hình vòng lặp ReAct\n"),
}

for seg_id, (en_h, vi_h) in HEADINGS.items():
    if seg_id not in data:
        print(f"  SKIP {seg_id}: not in data")
        continue
    # Strip leading newline from current text if any
    cur_en = data[seg_id]["en"].lstrip("\n")
    cur_vi = data[seg_id]["vi"].lstrip("\n")
    # Only prepend if not already there
    if not cur_en.startswith(en_h.strip()):
        data[seg_id]["en"] = en_h + "\n" + cur_en
    if not cur_vi.startswith(vi_h.strip()):
        data[seg_id]["vi"] = vi_h + "\n" + cur_vi
    print(f"  + {seg_id}: prepended heading")

# Special: append more headings to segment 74
if "74" in data:
    extra_en = "\n### 2. stopReason-driven mechanism\n\n### 3. Core + layering architecture approach\n\n## 6. Next stop\n"
    extra_vi = "\n### 2. Cơ chế dẫn dắt bởi stopReason\n\n### 3. Tư duy kiến trúc lõi + lớp phủ\n\n## 6. Trạm tiếp theo\n"
    data["74"]["en"] = data["74"]["en"] + extra_en
    data["74"]["vi"] = data["74"]["vi"] + extra_vi
    print("  + 74: appended summary headings")

PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"OK: updated {PATH}")
