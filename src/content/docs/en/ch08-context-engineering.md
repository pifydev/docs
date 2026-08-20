---
title: Chapter 8: Context Engineering: Fitting Infinite Dialogue Into a Finite Window
chapter: 8
slug: ch08-context-engineering
title_zh: "第8章：上下文工程: 让有限窗口装下无限对话"
title_en: "Chapter 8: Context Engineering: Fitting Infinite Dialogue Into a Finite Window"
title_vi: "Chương 8: Context Engineering: Nhồi cuộc hội thoại vô hạn vào cửa sổ hữu hạn"
source_url: https://www.dgzhuya.com/modules/ch08-context-engineering
language: en
version_pairs:
 zh: zh/src/ch08-context-engineering.md
 en: en/src/ch08-context-engineering.md
 vi: vi/src/ch08-context-engineering.md
original_chars: 5631
code_lines: 215
reading_minutes: 29
translator: hypnguyen1209
reviewed_by: null
last_updated: 2026-08-20
status: translated
official_refs: []
terms_used: []
code_blocks: 16
mermaid_blocks: 0
---

# Chapter 8: Context Engineering: Fitting Infinite Conversations into a Finite Window

When we talked about the message system in Chapter 6 we said: inside the Agent it expresses freely with 7 kinds of `AgentMessage`, but before calling the LLM it goes through a `convertToLlm` translation boundary and is translated into the 3 standard `Message`. When we talked about event-driven in Chapter 7 we mentioned: after the `agent_end` event, a "context check" is triggered.

Behind these two things there is the same core problem: **the LLM's context window is fixed, but a coding-agent's dialog grows without limit**.

This chapter opens Pi's full picture of "context engineering". You will see: context compaction (which you may already have seen in [Chapter 9](ch09-compaction.md)) is just the tip of the iceberg. Pi deploys defenses in both the **input and history** stages, each layer corresponding to a specific engineering problem.

---

## 1. The problem: the window is fixed, the dialog is growing

If you list all the "information sources" of a coding-agent session, you realize how serious the problem is:

```
一次会话送进 LLM 的内容
├── 系统提示词（工具说明、guidelines、pi 文档路径）
├── 项目上下文文件（CLAUDE.md / AGENTS.md，可能多层嵌套）
├── Skills 列表（每个 skill 一段描述）
├── 工具定义（每个工具的 JSON schema）
├── 对话历史（每一轮 user / assistant / toolResult）
│   ├── 用户输入
│   ├── LLM 回复（含 thinking、toolCall）
│   └── 工具结果（read 文件、bash 输出、grep 命中……）
└── 当前轮的新输入
```


Pick any one and it might explode:

- Running `npm install`'s stderr can be tens of KB
- `read`ing a 5000-line source file can be 80KB
- `grep`ing a keyword across the whole repo, hits hundreds of lines
- With multiple rounds of tool calls accumulating, dozens of turns easily break 100K tokens

And the LLM window is a **hard upper limit**: exceed it and it directly throws `prompt is too long`, dialog interrupted.

**Context Engineering** is the engineering discipline for dealing with this problem: before content is fed into the LLM, **multi-layer trimming, filtering, compaction, organization**, so that the limited window can fit "the information most valuable for the current task".

Pi implements **4 complementary techniques** at this stage. This chapter we look at each one.

---

## 2. Map: two-layer defenses

Before diving into each technique, let's build an overall picture. Pi's context engineering is distributed across two stages:

```
┌──────────────────────────────────────────────────────────────┐
│                       输入侧（送进 LLM 之前）                 │
│  ① 工具输出截断: bash/read/grep 结果按行/字节裁剪            │
│  ② 系统提示词组装: 多层 CLAUDE.md 向上递归 + Skills 懒加载   │
└──────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────┐
│                  历史侧（长对话管理）                         │
│  ③ Compaction: 阈值触发，把旧消息变成结构化摘要             │
│  ④ 分支摘要    : 切换会话树分支时，给"被放弃的分支"做摘要   │
└──────────────────────────────────────────────────────────────┘
```


| Layer | Problem it solves | Trigger frequency |
| --- | --- | --- |
| 1. Tool output truncation | Single tool result too big | **Every tool call** |
| 2. System prompt assembly | Project norms need to enter context but the user shouldn't repeat them | Every prompt turn |
| 3. Compaction | Long dialog accumulates past window | Threshold triggered |
| 4. Branch summary | Session tree branch switch, old branch cannot be discarded | When user switches branch |

Next we expand in this order.

---

## 3. Input-side 1: tool output truncation (truncateHead / truncateTail)

### Problem: a single bash command can blow up the window

Imagine you let the Agent run `npm test`, output 8000 lines of log; or let it `read` a 3000-line source file. **A single tool call** can produce tens of KB of output. Without control, after a few turns the context window is filled with tool results.

The most naive solution is "truncate by char count". But this immediately runs into three new problems:

1. **Wrong truncation position**: bash errors usually live at the end, truncating the tail is useful; file reading usually has the head more important, truncating the head is right
2. **Cutting multi-byte characters**: cutting directly by bytes can split an emoji into two invalid code units
3. **A single line exceeds the limit**: for example grep hits a 100KB line of compressed JS, how to cut?

Pi uses a **dual limits + boundary safety** algorithm to solve these three problems, implemented in [`truncate.ts`](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/src/core/tools/truncate.ts).

### Dual limits: lines + bytes, whichever hits first wins

Pi defines two upper-limit constants by default for all tool output (source `truncate.ts:11-13`):

- **Line limit**: `DEFAULT_MAX_LINES = 2000`
- **Byte limit**: `DEFAULT_MAX_BYTES = 50 * 1024` (50KB)
- **grep single-line length limit**: `GREP_MAX_LINE_LENGTH = 500`

Every tool output is trimmed by "**at most 2000 lines**" or "**at most 50KB**", **whichever triggers first**.

Why dual limits? Single limits each have failure modes:

- Limiting lines only: a single line can be long (compressed JS, minified CSS), 3 lines can blow the bytes
- Limiting bytes only: a 50KB source file might have only 200 lines, but you want to see the full structure; cutting by bytes might slice line 100 in half

Dual limits back each other up: lines manage "display readability", bytes manage "hard volume".

### Two strategies: truncateHead vs truncateTail

Given the same dual limits, trimming from which end is another question. Pi provides two functions, **the core difference is only the traversal direction**:

Tool output truncation: dual limits + bidirectional strategies

**Diagram caption:** the upper half shows dual limits (2000 lines + 50KB, whichever hits first wins). The lower half shows a left-right comparison: `truncateHead` keeps the head (green solid = keep, gray dashed = cut), used for `read` files (imports / interfaces have the densest info); `truncateTail` keeps the tail, used for `bash` output (error stack has the most signal). The bottom is the shared escape hatch: append `[Full output: /tmp/...]` letting the LLM read it itself.

| Function | Kept portion | Used for | Why |
| --- | --- | --- | --- |
| `truncateHead` | Head | read files | File head usually has imports / class definitions / interface signatures: **the most info-dense** |
| `truncateTail` | Tail | bash output | bash's error stack and final results live at the tail: **the tail has the most signal** |

The bash tool's description writes this in source (`bash.ts:284`):

> Output is truncated to last 2000 lines or 50KB (whichever is hit first). If truncated, full output is saved to a temp file.

The word **"last"** is key: the bash tool's contract is "keep the tail". The core logic of `truncateTail` is to pick keep-lines backward from the tail (`truncate.ts:247-266`), simplified:

```
// 伪代码：truncateTail 的核心思路
function truncateTail(content, maxLines, maxBytes) {
    const lines = content.split("\n");
    const kept = [];           // 从末尾往回收集的行
    let bytes = 0;

    for (let i = lines.length - 1; i >= 0; i--) {
        const lineBytes = byteLength(lines[i]) + 1;  // +1 是换行符
        if (kept.length >= maxLines) break;          // 行数到了，停
        if (bytes + lineBytes > maxBytes) break;     // 字节到了，停
        kept.unshift(lines[i]);                      // 插到头部，保持原顺序
        bytes += lineBytes;
    }
    return kept.join("\n");
}
```


`truncateHead` is identical, just change the `for` to "traverse from front to back", and `unshift` to `push`.

### Boundary safety: UTF-8 multi-byte characters

The most insidious bug in byte-level truncation is cutting through multi-byte characters. An emoji 😀 in UTF-8 is 4 bytes; if you cut at byte 2, the remaining two bytes become invalid characters ``.

Pi uses `truncateStringToBytesFromEnd` (`truncate.ts:295`) to solve this: **accumulate byte count character by character**, stopping when "adding this next character would exceed the byte budget". The code specifically handles surrogate pairs: when a character is a 4-byte emoji, it is treated as an indivisible whole: either keep it complete or drop it entirely.

Also `replaceUnpairedSurrogates` (**note**: this function...15 tokens truncated...truncate.ts simplifies the implementation, uses `Buffer.byteLength + slice` directly, without keeping that function) handles an edge case: the input itself is damaged (contains unpaired surrogates); replace them with `` to avoid subsequent encoding crashes. These are all "fine work" on byte boundaries: unassuming but necessary.

### A single line exceeds limit: partial line safety net

`truncateTail` has another edge-case logic (`truncate.ts:255-260`): if **the first line (the longest one) by itself exceeds maxBytes**, you can't return nothing: then the tool result is empty. It takes the **last maxBytes bytes** of that line and sets the `lastLinePartial: true` flag.

The downstream bash tool renders a special hint (`bash.ts:366-368`):

```
[Showing last 49.5KB of line 1 (line is 92.3KB). Full output: /tmp/pi-bash-xxx.log]
```


This way the LLM at least sees the end of this line and knows the full output is at which file: it can use `read` to fetch on demand.

### Single-line length limit: grep's 500-character rule

The grep tool has another independent truncation: `truncateLine` (`truncate.ts:336`), default `GREP_MAX_LINE_LENGTH = 500`. grep often hits compressed files or minified code: one line can be tens of thousands of characters. This function truncates over-long lines to 500 characters and appends `... [truncated]`, avoiding a single line eating thousands of tokens.

### Post-truncation hint: letting the LLM know what happened

Truncation itself is lossy, but Pi doesn't do it on the sly. The `TruncationResult` structure (`truncate.ts:15-38`) records complete metadata: was it truncated (`truncated`), which limit triggered it (`truncatedBy: "lines" | "bytes" | null`), original lines/bytes (`totalLines` / `totalBytes`), output lines/bytes (`outputLines` / `outputBytes`), whether the last line was partially truncated (`lastLinePartial`), and so on.

The bash tool appends a hint line at the end of output based on this (`bash.ts:362-374`):

```
[Showing lines 6501-8500 of 8500. Full output: /tmp/pi-bash-xxx.log]
```


This line **also enters the LLM context**: telling the model "if you want to see the full output, go read this file". This is the "escape hatch" of the truncation mechanism: default truncation saves tokens, and the LLM can pull the full content itself when needed.

> **Streaming output supplement**: bash commands stream output (stdout is emitted line by line, possibly lasting several minutes). Pi has an [`OutputAccumulator`](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/src/core/tools/output-accumulator.ts) class responsible for real-time collection, memory control, writing over-limit content to a temp file: but the final truncation still goes through this `truncateTail` algorithm above. Streaming accumulation itself is an engineering implementation detail, not part of the core "context engineering" mechanism, not elaborated here; readers who need to dig deeper can look at the source code directly.

> **Summary**: dual limits + bidirectional strategies + boundary safety + safety-net escape: this is Pi's four-piece set for tool output truncation. Every tool call passes through this gate.

---

## 4. Input-side 2: dynamic system prompt assembly

### Problem: project norms must enter context, but the user shouldn't have to say them each time

Tool output truncation is "subtraction": make things that are too big smaller. But context engineering also has an "addition" problem: **how to let the LLM automatically know the project's conventions?**

For example, a user developing in a monorepo wants the LLM to know: "this subproject uses pnpm not npm", "tests use vitest". If they have to say it manually every conversation, the experience is terrible.

Pi's solution is in [`system-prompt.ts`](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/src/core/system-prompt.ts) and [`resource-loader.ts`](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/src/core/resource-loader.ts): at the heart of it are two things: **multi-layer CLAUDE.md recursion** + **Skills lazy loading**.

### Multi-level context files: recurse upward from the current directory

Pi looks for `AGENTS.md` or `CLAUDE.md` (case-insensitive) in every directory, then recurses from `cwd` upward to the root directory, **merging all the spec files from directories along the way**.

Multi-layer CLAUDE.md recursion + Skills lazy loading

**Diagram caption:** on the left, the monorepo directory tree, red dashed arrows crawl from `src/` (cwd) upward to the root, collecting every layer's CLAUDE.md along the way. On the right, the merge order: 1. global (user-level `~/.pi/`) -> 2. ancestor (from root down to one level above cwd) -> 3. project (cwd itself, most specific, overrides on top). Finally wrapped in XML `<project_instructions path="...">` and fed into the system prompt. At the bottom is a push-mode vs pull-mode comparison: pushing 10 skills' full text costs 50K tokens, putting just the list and letting the LLM read on demand costs only 500 tokens.

Why recurse upward? Because modern projects are often monorepo nested:

```
/myorg
├── CLAUDE.md          ← 全组织规范（通用）
└── teams
    └── teamA
        ├── CLAUDE.md  ← 团队 A 规范（细化）
        └── projects
            └── app1
                ├── CLAUDE.md  ← 项目规范（最具体）
                └── src/       ← cwd 在这里
```


Starting Agent in the `src/` directory, it searches up and finds 3 different `CLAUDE.md`, **merged in "outside-to-inside" order**: the ancestor directory's specs come first (most general), the project directory's specs come last (most specific). This makes the LLM read like a layered spec manual: read the general rules first, then the specifics.

Beyond upward recursion, there is also **global context**: one piece is read from `agentDir` (the `.pi` configuration directory under the user's home). The full lookup order:

```
┌──────────────────────────────────────────────────────┐
│  系统提示词组装顺序                                   │
├──────────────────────────────────────────────────────┤
│  1. agentDir/CLAUDE.md   ← 全局（用户级）            │
│  2. 祖先目录/CLAUDE.md   ← 从 / 到 cwd 上一层        │
│  3. cwd/CLAUDE.md        ← 当前项目                  │
└──────────────────────────────────────────────────────┘
```


Source is `loadProjectContextFiles` function in `resource-loader.ts:85-123`.

### XML wrapping: let the LLM understand "this is a project instruction"

With context files found, `buildSystemPrompt` (`system-prompt.ts:154-161`) wraps them with XML tags:

```
<project_context>

Project-specific instructions and guidelines:

<project_instructions path="/myorg/CLAUDE.md">
全组织规范：所有项目使用 TypeScript strict 模式...
</project_instructions>

<project_instructions path="/myorg/teams/teamA/projects/app1/CLAUDE.md">
本项目使用 pnpm，测试用 vitest...
</project_instructions>

</project_context>
```


Why XML instead of Markdown?

1. **XML has clear boundaries**: `</project_instructions>` is a clear end tag, the LLM will not confuse specs with outer instructions
2. **With path attribute**: the LLM sees which file the content came from, can distinguish "organization-level specs" from "project-level specs" in priority

This is a standard prompt-engineering technique: mainstream LLMs all handle XML tag structure well.

### Skills lazy loading: list into the prompt, content read on demand

Skills (project-specific operation guides) have another subtle design. Each skill is a `SKILL.md` file, possibly several thousand words. If you stuff all skills' full text into the system prompt, token overhead is huge and most isn't used.

Pi's solution is `formatSkillsForPrompt` (`skills.ts:335-361`): **just put a lightweight list, full text read on demand**:

```
传统方式（推模式）              Pi 的方式（拉模式）
─────────────────────          ─────────────────────
系统提示词 ←─ 全文塞进           系统提示词 ←─ 只放清单
                                  │
                                  ▼
                               LLM 看清单，判断需要哪个
                                  │
                                  ▼
                               LLM 主动调 read 工具
                                  │
                                  ▼
                               SKILL.md 全文进入后续上下文
```


This is what it finally looks like in the system prompt:

```
<available_skills>
  <skill>
    <name>test-setup</name>
    <description>How to run tests for this project</description>
    <location>/path/to/skills/test-setup/SKILL.md</location>
  </skill>
</available_skills>
```


At the top of the list is also one instruction: "**Use the read tool to load a skill's file when the task matches its description**": this is the lazy-loading contract: pay tokens only when used, save when not used.

Compare with "stuff full text into system prompt":

| Scheme | Token overhead | Information density |
| --- | --- | --- |
| Stuff full text | 10 skills x 2000 chars ~= 50K tokens | Most is irrelevant |
| Lazy loading | 10 skills x 4 lines ~= 500 tokens | Expands precisely on hit |

**This is the "use tool calls for on-demand context loading" paradigm**: incorporating LLM's initiative into context engineering. §8 later will expand on this design pattern.

### Full skeleton of the system prompt

Stringing all of the above elements together, the complete prompt structure that `buildSystemPrompt` generates is:

```
1. 角色定位
   "You are an expert coding assistant operating inside pi..."
2. 工具列表
   "- read: Read a file\n- bash: Execute...\n- edit: ..."
3. 通用 guidelines
   "- Be concise in your responses\n- Show file paths clearly..."
4. Pi 文档路径（让 LLM 能 read 自身文档）
5. [可选] appendSystemPrompt（追加内容）
6. <project_context>... CLAUDE.md 内容 ...</project_context>
7. <available_skills>... Skills 清单 ...</available_skills>
8. Current date: 2026-07-03
9. Current working directory: /path/to/cwd
```


**At the end** come `Current date` and `cwd`: these seemingly simple pieces of info are the "basic metadata" of context engineering. The LLM needs to know "what day is today" (to handle relative time like "yesterday", "last week"), "which directory I'm in" (to handle relative paths).

> **Summary**: system prompt assembly is "addition" context engineering: through **multi-layer file recursion + XML structuring + Skills lazy loading**, letting the LLM automatically receive project specs without the user having to repeat them.

---

## 5. History-side 3: Compaction (linked to Chapter 9)

Long dialogs will eventually exceed the window limit. Compaction is Pi's core compression algorithm: **turning old messages into structured summaries**, using summaries to replace raw messages, freeing up space while retaining key information.

This problem is important and complex enough that it has its own chapter:

**👉 [Chapter 9: Context Compaction: what to do when the dialog is too long](ch09-compaction.md)**

That chapter covers in detail:

- **Trigger condition**: `shouldCompact` uses `contextWindow - reserveTokens` as the threshold
- **Cut-point algorithm**: `findCutPoint` accumulates tokens backward, excludes toolResult
- **Structured summary**: 6-section template (Goal / Constraints / Progress / Key Decisions / Next Steps / Critical Context)
- **Incremental update**: multiple compactions use `UPDATE_SUMMARIZATION_PROMPT` to update on the old summary
- **File tracking**: append `<read-files>` and `<modified-files>` lists at the end of the summary
- **Edge cases**: Turn split and turnPrefix summary

This chapter's §7 full-link pipeline will incorporate Compaction; here we don't repeat. **Remember one key fact**: the `CompactionSummaryMessage` Compaction generates will appear in the subsequent dialog's `context.messages`, as new context.

```
对话树：
        root
         │
       [探索方案 A]
         │
       [A 的实现]
         │
        leaf_1 ← 用户当前在这里

用户：从 root 重新分叉探索方案 B
        root
         │
       [探索方案 A]  ← 这部分还在，但被"放弃"了
         │
       [A 的实现]
         │
        leaf_1（旧叶子）

用户切换到：
        root
         │
       [探索方案 B]  ← 新分支
         │
        leaf_2 ← 用户现在在这里
```


---

## 6. History-side 4: branch summary (Branch Summarization)

Compaction solves "linear dialog too long". But Pi has another unique feature: **the session tree** (Chapter 10 will go into detail). In short, the dialog is not a straight line, but a tree: the user can "fork" a new dialog from some historical node.

This structure brings a new context engineering problem: **when the user switches branches, the exploration results on the old branch cannot be discarded**.

### Problem: after a branch switch, what do we do with the content of the old branch?

Take a concrete scenario:

After switching, **the context the LLM sees is the path root -> leaf_2**: it has no idea what was explored on the leaf_1 branch. If that branch has important findings ("tried plan A but it doesn't work, because of X, Y, Z"), the LLM is amnesic.

Just stuff the entire old branch into the context? That takes too much space and violates the spirit of §1.

Pi's solution is [`branch-summarization.ts`](https://github.com/earendil-works/pi/blob/main/packages/agent/src/harness/compaction/branch-summarization.ts): **generate a summary for the abandoned branch, inject it into the new branch's context**.

### LCA algorithm: find "the fork point"

The first step is to determine "what content does the abandoned branch include". This requires finding the **Lowest Common Ancestor (LCA)** of the two leaf nodes: i.e. the node where the two branches begin to diverge.

The logic of `collectEntriesForBranchSummary` (`branch-summarization.ts:67-96`), in plain terms, has three steps:

```
旧路径：root → ... → leaf_1
新路径：root → ... → leaf_2

1. 把两条路径都拿出来
2. 在新路径上从后往前找，第一个也在旧路径里的节点 = LCA（分叉点）
3. 从 leaf_1 向上爬到 LCA（不含 LCA），沿途收集的内容
   就是"被放弃的分支"
```


### Summary generation: reuse Compaction's tools

Once entries are collected, `generateBranchSummary` (`branch-summarization.ts:199-261`) uses the LLM to generate the summary. It reuses several underlying tools from Compaction:

- **`convertToLlm`**: translate messages to LLM format
- **`serializeConversation`**: serialize messages into dialog text
- **`SUMMARIZATION_SYSTEM_PROMPT`**: shared system prompt

That is, **the two summary mechanisms share the same underlying pipeline, only the prompt differs**.

### Prompt: key differences from Compaction

`BRANCH_SUMMARY_PROMPT` (`branch-summarization.ts:169-196`) is highly similar to Compaction's `SUMMARIZATION_PROMPT`: but only has **5 sections** (Goal / Constraints / Progress / Key Decisions / Next Steps), **no Critical Context** (Compaction has this section, so Compaction has 6 sections). The differences are mainly in two points:

**Difference 1: different context preamble**

```
// 这段前言精准描述了语义:"用户探索了一个不同的分支，然后回到这里"
// LLM 看到这句，知道这不是"主线历史"，而是"另一条线的探索记录"
// 对待方式会更轻量（当作参考，而不是主线）
const BRANCH_SUMMARY_PREAMBLE =
    `The user explored a different conversation branch before returning here.\nSummary of that exploration:\n\n`;
```


**Difference 2: smaller maxTokens**

Compaction's maxTokens is `min(0.8 x reserveTokens, model.maxTokens)`: possibly tens of thousands of tokens. But Branch Summary's maxTokens is hardcoded to `2048` (`branch-summarization.ts:234`).

**Why are branch summaries required to be more terse?** Because it's only auxiliary context, the main thread is the new branch. The new branch itself needs a token budget too, branch summaries cannot steal the spotlight.

### Injection of the summary: becoming BranchSummaryMessage

The generated summary is wrapped with the `BRANCH_SUMMARY_PREAMBLE` preamble and `<read-files>` / `<modified-files>` tags, stored as `BranchSummaryMessage`. Next time `buildSessionContext` runs, it appears at the head of the new branch's context:

The LLM sees this, immediately knows "we previously tried the trigger plan and gave up because of performance issues": avoiding it walking down the same dead end again.

### Compaction vs Branch Summarization comparison

| Dimension | Compaction | Branch Summarization |
| --- | --- | --- |
| **Trigger** | Threshold (contextTokens > window - reserve) | User switches session tree branch |
| **Purpose** | Prevent window overflow | Preserve abandoned-branch exploration results |
| **Cut** | `findCutPoint` algorithm (backward accumulation) | LCA algorithm (find fork point) |
| **Retained area** | Last N tokens of messages | New-branch path (fully retained) |
| **Compressed area** | Old messages (replaced by summary) | Entire old-branch path...

```
The following is a summary of a branch that this conversation came back from:

<summary>
The user explored a different conversation branch before returning here.
Summary of that exploration:

## Goal
Try approach A (PostgreSQL triggers)

## Progress
### Done
- [x] Read schema.ts, identified trigger points

### Blocked
- [x] Performance test showed 3x slowdown: abandoned this approach

## Key Decisions
- **Abandon triggers**: Too slow for high-throughput tables

<read-files>
schema.ts
benchmark/trigger-bench.ts
</read-files>
</summary>
```


replaced by summary |

| **Cost** | Filter eligible messages, exclude toolResult | Generate summary once per branch switch |
| **Output** | Single new `CompactionSummaryMessage` | One `BranchSummaryMessage` per abandoned branch |

Two mechanisms, two completely different purposes, sharing the same underlying pipeline.

---

## 7. Full-link pipeline: all the context processing a single tool call goes through

Now putting everything together, a `read` call's complete life: from the user pressing Enter, to the LLM receiving messages: every step of context engineering:

Full-link pipeline: every link of context processing

**Diagram caption:** 8-node horizontal flow: User input -> buildSessionContext (input side, multi-layer recursion, XML packaging, Skills lazy load) -> context.messages (history side: CompactionSummaryMessage + BranchSummaryMessage + raw messages) -> Agent.processEvents / transformContext -> convertToLlm -> LLM. Each node marks which context engineering technique it uses.

A few design decisions become clear:

- **Input side is "addition", history side is "subtraction"**: system prompt assembly actively adds specs; Compaction and Branch Summary actively remove
- **Skills lazy load couples input side and output side**: the light list is at the input, the LLM uses `read` to pull on demand (output side)
- **Each tool's output is independently truncated**: `truncate.ts` doesn't care whether the upstream is normal flow or Compaction-restored flow

That's it for the full-link pipeline. The remaining content: design essence: is a summary of these mechanisms' design ideas.

---

## 8. Design essence

### 1. Multi-layer defense: no silver bullet, only layer upon layer

Pi's context engineering uses **4 completely different techniques**, each solving a different problem:

- Tool output truncation solves "single tool result too big"
- System prompt assembly solves "inject project specs"
- Compaction solves "linear dialog too long"
- Branch Summarization solves "branch switch forgets"

**Each layer only solves the problem it is good at, none replaces the others**. You can tune Compaction extremely aggressively (set a huge `reserveTokens`), but a single tool output still needs truncation: because a single 80KB `read` result, without truncation, can't even survive one turn. Conversely the same is true.

This is the wisdom of engineering: **acknowledge each mechanism's capability boundary, combine**. A common newbie mistake is "once you find one trick, use it to the end" (e.g. relying on the LLM itself to handle ultra-long input), which explodes when encountering a specific scenario. Pi's approach is: each layer does the simplest, most reliable thing, multiple layers stack to form complete defense.

> Implementation: scattered in `packages/coding-agent/src/core/{tools,system-prompt,compaction}/*.ts` and `packages/agent/src/harness/`

### 2. Addition + subtraction: the bidirectional operations of context engineering

§3 is "subtraction": make things that are too big smaller. §4 is "addition": actively **add** project specs and Skills. §5–§6 both trim and "add": **add** structured summaries, add abandoned-branch exploration results.

Context engineering isn't mere "compaction", it's "**shaping**": under volume constraints, make information **more accurate, more structured, easier to understand**.

Counter-example: directly splicing 50 turns of raw dialog text and throwing it at the LLM, volume-wise fine (if total tokens don't exceed the window), but the effect is far worse than "structured summary + recent messages". The former requires the LLM to extract key points from large blocks of text itself, the latter has already organized the key points. **Same tokens, structured information density is higher**.

Pi reflects this idea in three places:

- Compaction uses the 6-section template (including Critical Context)
- Branch Summary uses the 5-section template (no Critical Context)
- System prompt assembly uses XML tags (clear semantic boundaries)

**Structure is the lever of context engineering**: with a little prompt engineering, you leverage the LLM's huge improvement in information comprehension.

### 3. Tool calls = on-demand context loading

§4's Skills lazy load reveals a deeper design pattern: **use tool calls for on-demand context loading**.

Traditional context engineering is "**push**" mode: the system decides what to show the LLM and stuffs it all into the system prompt.

Pi's Skills are "**pull**" mode: the system just provides a list (lightweight); the LLM **actively calls read** based on the current task to pull the skill's full text.

| Dimension | Push mode | Pull mode |
| --- | --- | --- |
| Token overhead | All pre-paid | Pay when used |
| Information density | Most is irrelevant | Precise hits |
| LLM initiative | Passively receives | Actively selects |
| Suitable scenarios | Must-know information | Maybe-useful information |

**Core insight**: when the LLM has tool-call capability, "tools" themselves are the carrier of context engineering: you don't need to stuff every possibly-useful piece of information into the prompt; let the LLM use tools to fetch on demand.

This idea is increasingly important in modern Agent systems. Claude Code's "Skills", Cursor's "docs", Cline's "context files": all the same mechanism with different implementations. Pi's implementation is the cleanest: XML list + read tool + path-resolution convention, three lines define the entire contract.

> Implementation: `formatSkillsForPrompt` (`skills.ts:335`) + the hint in prompt `"Use the read tool to load a skill's file when the task matches its description"`

---

## 9. Next stop

This chapter we saw the full picture of Pi's context engineering. §5's Compaction and §6's Branch Summarization both involve a concept we keep mentioning but haven't elaborated: **Session Tree**.

Compaction's result is stored as `CompactionEntry`, "appended to the Session Tree". Branch Summarization triggers when "the user switches a session tree branch". But what exactly is the structure of a Session Tree? Why is dialog history a tree rather than a linear array? What data structure does the LCA algorithm for branch switching depend on?

The next chapter: session management: answers these questions.

```
用户输入 "修复 auth.ts 的 bug"
    │
    ▼
[1] 系统提示词组装（§四）
    buildSystemPrompt()
    ├─ 找 CLAUDE.md（向上递归 + agentDir）
    ├─ 加载 Skills 清单（懒加载）
    ├─ 拼接工具列表 + guidelines
    └─ 末尾加 Current date / cwd
    │
    ▼
[2] 用户消息进入 context.messages（第6章）
    │
    ▼
[3] Agent Loop 开始（第3章五步管道）
    │
    ▼
[4] LLM 返回 toolCall: read("auth.ts")
    │
    ▼
[5] 执行工具: read auth.ts
    │
    ▼
[6] 工具输出截断（§三）
    ├─ truncateHead（read 用 head）
    │   └─ 2000 行 / 50KB 双限制
    ├─ UTF-8 边界安全
    └─ 超限返回 firstLineExceedsLimit 标志
    │
    ▼
[7] 工具结果进入 context.messages（第5章）
    │
    ▼
   ...循环...
    │
    ▼
[8] agent_end 事件触发（第7章）
    │
    ▼
[9] 检查 shouldCompact？（§五 / 第9章）
    │
    ├── 否 → 等下一轮
    │
    └── 是 → 执行 Compaction
         ├─ findCutPoint
         ├─ generateSummary（LLM 调用）
         ├─ 生成 CompactionSummaryMessage
         └─ 写入 Session Tree

    用户切换分支？
         │
         ▼
[10] Branch Summarization（§六）
     ├─ collectEntriesForBranchSummary（LCA）
     ├─ generateBranchSummary（LLM 调用）
     └─ 生成 BranchSummaryMessage
```


---

> **Key source index for this chapter**:
>
> `packages/coding-agent/src/core/tools/truncate.ts`: truncation algorithm (`truncateHead` / `truncateTail` / `truncateLine`)
> `packages/coding-agent/src/core/tools/output-accumulator.ts`: streaming accumulator (implementation details, not elaborated in this chapter)
> `packages/coding-agent/src/core/tools/bash.ts`: bash tool integration (truncation + accumulation + save-to-disk)
> `packages/coding-agent/src/core/system-prompt.ts`: system prompt assembly (`buildSystemPrompt`)
> `packages/coding-agent/src/core/resource-loader.ts:85-123`: CLAUDE.md / AGENTS.md upward recursion lookup
> `packages/coding-agent/src/core/skills.ts:335-361`: Skills lazy loading (`formatSkillsForPrompt`)
> `packages/agent/src/harness/compaction/branch-summarization.ts`: branch summary (LCA + 5-section template; a same-name file in coding-agent package has a more detailed 371-line implementation, this section references the agent-package line numbers)
> `packages/agent/src/harness/compaction/compaction.ts`: Compaction main algorithm (see Chapter 9 for details)
