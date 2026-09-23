---
title: 'Chapter 8: Context engineering'
description: How Pi bounds Tool output, assembles trusted and untrusted resources, and compresses long or branched history for each model call.
translation_key: ch08-context-engineering
language: en
chapter: 8
source_url: 'https://www.dgzhuya.com/modules/ch08-context-engineering'
official_refs:
  - 'https://github.com/earendil-works/pi/blob/f07218c4d4bbc12bef056a7058c3dd49dfe41abe/packages/coding-agent/src/core/resource-loader.ts'
  - 'https://github.com/earendil-works/pi/blob/f07218c4d4bbc12bef056a7058c3dd49dfe41abe/packages/coding-agent/src/core/tools/truncate.ts'
  - 'https://github.com/earendil-works/pi/blob/f07218c4d4bbc12bef056a7058c3dd49dfe41abe/packages/coding-agent/src/core/compaction/compaction.ts'
  - 'https://github.com/earendil-works/pi/blob/f07218c4d4bbc12bef056a7058c3dd49dfe41abe/packages/coding-agent/src/core/tools/index.ts'
terms_used:
  - Context
  - Context Engineering
  - System Prompt
  - transformContext
  - convertToLlm
status: reviewed
last_updated: '2026-09-23'
translator: Pify maintainers
reviewed_by: Pify maintainers
---

Chapter 6 followed rich `AgentMessage` records to the `convertToLlm` boundary. Chapter 7 followed the events emitted while those records change. Both paths meet the same constraint: a model accepts a finite context, while a coding session can keep collecting instructions, Tool definitions, messages, file contents, command logs, and retrieved evidence.

Context engineering decides what reaches one model call, in what order, and in what form. Pi applies several mechanisms at different boundaries. A 50 KiB Tool-output limit measures UTF-8 bytes. A model window measures tokens. `transformContext` projects messages for one call. Compaction rewrites the active session view by adding a summary entry. Treating those operations as interchangeable hides the failure each one handles.

## 1. The problem: the window is fixed, the dialogue keeps growing

A Pi AI request exposes `systemPrompt`, `messages`, and `tools`. The coding-agent package fills those fields from more sources than that compact interface suggests:

```text
One model request
├─ system prompt
│  ├─ default or replacement prompt
│  ├─ appended prompt text
│  ├─ AGENTS.md / CLAUDE.md context files
│  └─ visible skill metadata
├─ active session messages
│  ├─ user and assistant messages
│  ├─ Tool calls and Tool results
│  ├─ compaction summaries
│  └─ optional branch summaries
├─ active Tool definitions and parameter schemas
└─ current user input and retrieved context
```

Any branch can become large. A build can print thousands of lines. A generated file can put tens of kilobytes on one line. Tool schemas consume context before the model answers. Long sessions retain prior decisions and failed attempts. A branch switch can leave useful investigation on a path that is no longer active.

The model's `contextWindow` is a hard token budget shared by input and response. Pi therefore limits some Tool results before they enter history, assembles stable instructions rather than asking the user to repeat them, projects only the active session path, and summarizes older or abandoned history when requested by the relevant workflow.

## 2. Map: defenses at input, request, and history boundaries

The historical design can be read as two broad sides, input and history. Current Pi exposes a useful middle boundary too: a per-request message projection before conversion to Pi AI messages.

```text
Resource and Tool boundary
  bound selected built-in Tool outputs; discover instructions and skills
                              │
                              ▼
Request boundary
  build system prompt; run context hooks; convert AgentMessage[] to Message[]
                              │
                              ▼
History boundary
  project the active branch; compact old history; optionally summarize a left branch
```

| Mechanism | Unit and scope | Trigger | What it does not do |
| --- | --- | --- | --- |
| Tool-output truncation | Lines, UTF-8 bytes, and grep string length | During selected built-in Tool execution | It does not calculate tokens or shorten earlier history |
| System-prompt assembly | Files, resource records, and strings | Resource reload and prompt rebuild | It does not make repository instructions safe, authoritative, or permitted; project trust controls resource loading, not authorization or sandboxing |
| `transformContext` and `convertToLlm` | Messages for one model call | Before each assistant response | They do not persist a compaction entry by themselves |
| Compaction | Estimated or provider-reported tokens on the active branch | Manual request, threshold, or overflow recovery | It does not truncate a single oversized Tool result at execution time |
| Branch summary | Entries on the path being left | Tree navigation with summarization requested | It does not run for every branch switch |

These defenses compose. Removing one because another exists opens its original failure mode again.

## 3. Input defense 1: Tool-output truncation

### Problem: one command can fill the window

`npm test` may print 8,000 lines. Reading a minified bundle may return one 100 KB line. Repeating either result in later requests spends context on old output instead of the current decision.

Character-count truncation alone cannot express the policy Pi needs. File reads benefit from the beginning of a range; command failures often put the useful stack or exit report at the end. Newline count controls readability, while byte count bounds payload size. The implementation also has to state what was omitted so the model can recover it.

The shared utility belongs to `@earendil-works/pi-coding-agent`, not Agent core or Pi AI. It exports `truncateHead()`, `truncateTail()`, `truncateLine()`, and their result metadata. A custom Tool receives no automatic guarantee from these helpers; its author must bound its own result or call the exported utilities.

### Dual limits: lines and bytes

[`tools/truncate.ts`](https://github.com/earendil-works/pi/blob/107d79f11072bbc8a3a757ed7fd69596bee7d68c/packages/coding-agent/src/core/tools/truncate.ts#L11-L45) defines the defaults:

- `DEFAULT_MAX_LINES = 2000`
- `DEFAULT_MAX_BYTES = 50 * 1024`
- `GREP_MAX_LINE_LENGTH = 500`

`truncateHead()` and `truncateTail()` accept `maxLines` and `maxBytes`. They stop at the first active bound. The byte count uses `Buffer.byteLength(text, "utf-8")`; it is unrelated to model tokenization.

| Operation | Primary bounds | Retained side | Current use |
| --- | --- | --- | --- |
| `truncateHead()` | 2,000 complete lines or 50 KiB by default | Beginning | `read`; final byte cap for `grep`, `find`, and `ls` |
| `truncateTail()` | 2,000 lines or 50 KiB by default | End | streamed and completed `bash` output |
| `truncateLine()` | 500 JavaScript string units by default | Beginning of one line | each `grep` match or context line |

`grep` adds a separate default limit of 100 matches. It then truncates individual displayed lines and applies `truncateHead(rawOutput, { maxLines: Number.MAX_SAFE_INTEGER })`, so its row count comes from the match limit while the shared utility supplies the 50 KiB cap.

### Head and tail policies

`read` keeps complete lines from the requested `offset`. Imports, declarations, and file-level documentation normally appear early, and the continuation marker gives the next offset. `bash` keeps the tail, where test summaries, error stacks, and exit diagnostics usually appear.

The two traversal directions can be summarized without copying implementation details:

```text
Pseudocode, not a Pi API

truncateHead: walk first → last; keep each complete line while both budgets fit
truncateTail: walk last → first; prepend each line while both budgets fit

Exception: if the original final line alone exceeds the tail byte budget,
truncateTail keeps a UTF-8-safe suffix of that line and marks it partial.
```

Head versus tail is a Tool-specific policy. A custom Tool that returns a compiler's opening diagnostic may choose head retention. Another Tool may return a structured summary and a file handle instead of either raw slice.

### UTF-8 bytes and string boundaries

The source uses three different units, and their names should stay explicit:

| Boundary | Measurement | Safety property |
| --- | --- | --- |
| Head and tail byte caps | UTF-8 bytes | Complete retained lines, except the documented tail edge case |
| Tail partial-line slice | UTF-8 `Buffer` bytes | Advances past continuation bytes before decoding, so the slice starts at a valid UTF-8 boundary |
| grep line cap | JavaScript `String.length` and `.slice()` | Counts UTF-16 code units, not Unicode code points or UTF-8 bytes |

For example, `🙂` occupies four UTF-8 bytes, two UTF-16 code units, and one Unicode code point:

```text
value                  UTF-8 bytes   UTF-16 code units   code points
"A"                    1             1                   1
"é"                    2             1                   1
"🙂"                   4             2                   1
```

`truncateTail()` converts the line to a `Buffer`, chooses a byte start, skips UTF-8 continuation bytes, and decodes the remaining suffix. It does not return a half-decoded emoji. `truncateHead()` never slices a long first line at all. `truncateLine()` has a different contract: its 500-unit `.slice()` can land between the two UTF-16 surrogates of a supplementary character. That grep display limit must not be described as code-point-safe.

### When one line exceeds the budget

Head and tail truncation deliberately behave differently at this edge.

For `read`, if the selected first line alone is larger than 50 KiB, `truncateHead()` returns empty content with `firstLineExceedsLimit: true`. The Tool converts that state into a result with an explicit recovery action:

```text
[Line 1 is 92.3KB, exceeds 50.0KB limit.
 Use bash: sed -n '1p' bundle.js | head -c 51200]
```

For `bash`, if the original last line alone exceeds the byte cap, `truncateTail()` returns the largest valid UTF-8 suffix that fits and sets `lastLinePartial: true`. The Bash Tool reports both the retained and original line sizes and points to the saved full log.

This asymmetry prevents a file read from pretending that a partial first line is a normal source line, while still giving a command failure some useful tail output.

### grep's 500-unit line rule

[`truncateLine()`](https://github.com/earendil-works/pi/blob/107d79f11072bbc8a3a757ed7fd69596bee7d68c/packages/coding-agent/src/core/tools/truncate.ts) keeps the first 500 JavaScript string units and appends `... [truncated]`. `grep` applies it to matches and optional context lines. A notice tells the model to use `read` for the full line.

That limit answers a narrower problem than the 50 KiB cap. A single minified line could dominate a list of otherwise useful matches even when the aggregate output remains below 50 KiB. The 100-match limit, 500-unit per-line limit, and 50 KiB aggregate limit each guard a different dimension.

### User-visible markers and recovery paths

Lossy output needs provenance and a recovery action. Current built-in Tools expose those actions in the text that becomes the Tool result:

| Tool | Example marker | Recovery path |
| --- | --- | --- |
| `read` | `[Showing lines 1-2000 of 5000. Use offset=2001 to continue.]` | call `read` again with `offset` |
| `read`, byte-bound | `[Showing lines 1-640 of 5000 (50.0KB limit). Use offset=641 to continue.]` | continue from the reported line |
| `bash` | `[Showing lines 6501-8500 of 8500. Full output: /tmp/pi-output-….log]` | inspect the temporary log |
| `grep` | `[100 matches limit reached. … Some lines truncated to 500 chars. Use read tool to see full lines]` | refine the pattern, raise `limit`, or read the source |

```text
Example Bash edge marker

[Showing last 49.9KB of line 1 (line is 92.3KB).
 Full output: /tmp/pi-output-1a2b3c4d.log]
```

`OutputAccumulator` decodes streaming bytes with `TextDecoder`, maintains a bounded display tail, and opens a temporary file once byte or line limits require preservation. The final Tool result still uses the same tail policy. Temporary-path availability belongs to Bash accumulation; `read` already has the original file, and `grep` directs the model back to source.

Output limits constrain what enters context after a Tool runs. Pi also constrains how selected built-ins ask the model to produce their arguments: `read`, `bash`, `powershell`, `edit`, and `write` use strict-prefer JSON Schema constrained sampling by default. A capable provider enforces the schema; an incompatible provider falls back to ordinary Tool calling because the policy is “prefer,” not “require.” An Extension that deliberately replaces one of these definitions can opt out with `constrainedSampling: false`.

| Tool or replacement scope | `constrainedSampling` contract |
|---|---|
| `read` | `strict-prefer` |
| `bash` | `strict-prefer` |
| `powershell` | `strict-prefer` |
| `edit` | `strict-prefer` |
| `write` | `strict-prefer` |
| `extension replacement with explicit opt-out` | `constrainedSampling: false` |

## 4. Input defense 2: system-prompt and resource assembly

### Problem: project rules must arrive without repetition

A repository may require a particular package manager, test command, generated-file policy, or architecture boundary. Putting those stable rules in every user message wastes tokens and invites drift. Pi discovers durable instructions once, then rebuilds the system prompt when active resources or Tools change.

The system prompt is only one part of Pi AI `Context`. Actual Tool definitions also travel in `Context.tools`; the prompt contains short Tool snippets and guidelines so the model can choose among the active set. Prompt templates expand into user input, while Extension context hooks operate later on messages. These paths contribute context at different times.

### Context-file discovery and precedence

`loadProjectContextFiles()` reads at most one context file from each directory. The exact candidate order is:

```text
AGENTS.override.md
AGENTS.md
AGENTS.MD
CLAUDE.md
CLAUDE.MD
```

`AGENTS.override.md` therefore wins only within its own directory. It does not suppress a context file from another directory. The named uppercase variants are explicit candidates; the search is not a general case-insensitive directory scan.

The returned list starts with the first matching file in `agentDir`, normally `~/.pi/agent/AGENTS.md`. Pi then walks from `cwd` to the filesystem root, prepending each match so ancestors appear before descendants:

```text
/workspace/AGENTS.md                     # broad repository rule
/workspace/apps/AGENTS.md                # application rule
/workspace/apps/web/AGENTS.override.md   # cwd-specific replacement for this directory
```

In a linked worktree nested under its main worktree, Pi suppresses the main checkout's context file when it would duplicate the worktree root's logical repository scope. Normal ancestor inheritance remains. Context loading can be disabled with `--no-context-files`.

Order supplies a readable general-to-specific sequence; it does not implement a parser that resolves conflicting prose. Authors still need to make precedence explicit when two files disagree.

### Project trust: the exact boundary

Project trust decides which project resources Pi may load. It does not authorize Tool calls, sandbox the process, or defend against prompt injection. Pi's built-in Tools and extensions run with the operating-system permissions of the Pi process.

`AGENTS.override.md`, `AGENTS.md`, and `CLAUDE.md` load regardless of the trust decision unless context loading is disabled. The loader applies project-trust gating to project settings and executable or configurable resource channels; it does not label ordinary repository text as safe.

| Source | Untrusted project | Trusted project | Selection or merge rule |
| --- | --- | --- | --- |
| Context files in `agentDir` and the directory chain | Loaded | Loaded | global first, then filesystem ancestors to `cwd`; one candidate per directory |
| `~/.pi/agent/settings.json` and user resources | Loaded | Loaded | user scope remains available |
| `.pi/settings.json` | Skipped | Loaded | deep-merges over global settings |
| `.pi/extensions`, `skills`, `prompts`, and `themes` | Skipped | Loaded | settings can enable or disable discovered entries |
| project `.agents/skills` from `cwd` upward | Skipped | Loaded | stops at the Git root, or filesystem root outside a repo |
| project `.pi/SYSTEM.md` and `.pi/APPEND_SYSTEM.md` | Skipped | Eligible | current `cwd` only; each falls back to its global counterpart |
| user/global and temporary CLI `-e` extensions during trust resolution | Loaded | Loaded | may handle `project_trust` before project extensions load |

Pi asks only when it finds trust-requiring resources and no current-or-parent saved decision applies. `~/.pi/agent/trust.json` stores canonical directory decisions. Interactive mode can ask; non-interactive `-p`, JSON, and RPC modes use `defaultProjectTrust`. Its default `"ask"` behaves as untrusted when no UI can ask. `--approve` and `--no-approve` override one run.

### `DefaultResourceLoader`: discovery, additions, and overrides

[`DefaultResourceLoader`](https://github.com/earendil-works/pi/blob/107d79f11072bbc8a3a757ed7fd69596bee7d68c/packages/coding-agent/src/core/resource-loader.ts) coordinates `SettingsManager`, `DefaultPackageManager`, Extension loading, context files, skills, prompt templates, themes, and system-prompt inputs.

Its `reload()` flow first loads an untrusted extension set when a trust resolver is present. That bootstrap contains user/global and temporary CLI extensions. After the resolver returns, the loader sets `SettingsManager.projectTrusted`, reloads settings for that state, resolves enabled package and local resources, loads each resource class, discovers context files, and resolves prompt inputs.

Resource roots are concrete:

```text
User
├─ ~/.pi/agent/{extensions,skills,prompts,themes}
└─ ~/.agents/skills

Project, after trust
├─ <cwd>/.pi/{extensions,skills,prompts,themes}
└─ <cwd or ancestor>/.agents/skills

Explicit
└─ additionalExtensionPaths / additionalSkillPaths /
   additionalPromptTemplatePaths / additionalThemePaths
```

The `additional*Paths` arrays are additive. The loader merges them after the enabled discovered paths and removes canonical-path duplicates. `--no-skills` disables discovered skills but explicit additional skill paths still load. Extension-provided resource paths can be added later through `extendResources()`.

The callback options have replacement semantics at the collection boundary. `skillsOverride(base)`, `promptsOverride(base)`, `themesOverride(base)`, `agentsFilesOverride(base)`, and `extensionsOverride(base)` receive a loaded base value and return the final value. They append only if the callback returns base items plus additions. `systemPromptOverride(base)` returns the final replacement string; `appendSystemPromptOverride(base)` returns the final array. Calling them “append hooks” would invent behavior the API does not provide.

### XML boundaries and replacement versus append

If no explicit `systemPrompt` input exists, discovery checks `<cwd>/.pi/SYSTEM.md` only when the project is trusted. It selects that project file when present and otherwise falls back to `~/.pi/agent/SYSTEM.md`; only one discovered replacement file is selected. Likewise, when no explicit `appendSystemPrompt` input exists, discovery checks project `.pi/APPEND_SYSTEM.md` only for a trusted project, then falls back to the global file. An explicit `appendSystemPrompt` array bypasses that discovery and can contain several strings or file paths; `AgentSession` joins the resolved values with blank lines.

`buildSystemPrompt()` gives a custom prompt narrow replacement semantics: it replaces the default role, Tool-list prose, guidelines, and Pi-documentation block. Append text, context files, visible skill metadata, and the current working directory still follow it. Context files are wrapped with their paths:

```xml
<project_context>

Project-specific instructions and guidelines:

<project_instructions path="/workspace/AGENTS.md">
Use npm and run npm test before submitting.
</project_instructions>

</project_context>
```

XML makes source boundaries visible to the model. It does not enforce the instructions, escape the process, or confer authority. Runtime policy still owns paths, approvals, credentials, and side effects.

### Skills load metadata first and instructions on demand

Pi discovers skills from user roots, project roots enabled by project trust, packages, settings, and explicit `--skill` paths. It recursively finds directories containing `SKILL.md`, validates frontmatter, canonicalizes paths, and warns on name collisions while keeping the first name encountered.

When `read` is active, `formatSkillsForPrompt()` injects model-visible metadata rather than every skill body:

```xml
<available_skills>
  <skill>
    <name>test-setup</name>
    <description>Run and diagnose this repository's test suites.</description>
    <location>/workspace/.agents/skills/test-setup/SKILL.md</location>
  </skill>
</available_skills>
```

The preceding prompt text tells the model to use `read` when a task matches and to resolve relative references from the skill directory. `disable-model-invocation: true` removes a skill from this list. It remains available for explicit `/skill:name` use.

The two loading paths produce different history. A model-selected skill arrives as a normal `read` Tool result. `/skill:name args` reads the file in the application, strips frontmatter, wraps the body in `<skill name="…" location="…">`, appends the arguments, and expands that text into the user message. Metadata is eager; the instruction body is on demand.

### Full system-prompt skeleton

Current `buildSystemPrompt()` does not add a date. Its final order is:

```text
Default path
1. coding-assistant role
2. one-line snippets for active Tools
3. active-Tool guidelines + concise/path guidelines
4. Pi documentation paths and reading rules
5. appendSystemPrompt, when present
6. <project_context> files, in loader order
7. <available_skills>, only when read is active and skills are model-visible
8. Current working directory

Custom-prompt path
1. customPrompt
2. appendSystemPrompt
3. project context
4. visible skills, when read is selected
5. Current working directory
```

`AgentSession._rebuildSystemPrompt()` supplies active Tool names, snippets, guidelines, loader prompt values, context files, and skills. Separately, the `Agent` carries actual Tool objects in the Pi AI request. This separation keeps a Tool's executable schema out of prose while still describing its intended use.

## 5. History defense 1: compaction

Tool truncation bounds a new result in lines and bytes. Compaction responds to accumulated model context in tokens. It operates on the active session branch, persists a `CompactionEntry`, and remains separate from the per-call `transformContext` projection.

Current defaults in `DEFAULT_COMPACTION_SETTINGS` are `enabled: true`, `reserveTokens: 16384`, and `keepRecentTokens: 20000`. Threshold compaction uses this exact predicate:

```text
contextTokens > contextWindow - reserveTokens
```

`contextTokens` comes from the latest valid assistant usage when possible: native `usage.totalTokens`, or `input + output + cacheRead + cacheWrite`. Messages after that usage are estimated. Error and all-zero-usage paths estimate enough trailing context to avoid losing accounting. This token estimate has no fixed conversion to the 50 KiB Tool limit.

Automatic checks run at three boundaries: before another assistant response inside a low-level Agent run, after that run reaches `agent_end`, and before a later prompt is submitted. They cover recoverable overflow with one compact-and-retry attempt, successful overflow without retry, and threshold crossing without retry. `AgentSession.compact()` is the separate manual entry point. Both routes prepare the active path, allow the `session_before_compact` hook to cancel or replace the result, then call the shared lower-level compactor when needed.

```text
active branch entries
      │
      ├─ find latest compaction boundary
      ├─ walk backward to retain about keepRecentTokens
      ├─ summarize older eligible messages
      └─ append CompactionEntry
             ├─ summary
             ├─ firstKeptEntryId
             └─ tokensBefore

next buildSessionContext()
      └─ CompactionSummaryMessage + kept entries + later entries
```

The cut point can be a user or assistant message, never a Tool-result entry. A mid-turn cut records a separate turn-prefix summary. Later compactions update the prior summary instead of blindly stacking all raw history again. [Chapter 9](ch09-compaction.md) derives those cut-point and structured-summary rules.

The persisted `CompactionEntry` remains a session record. `buildSessionContext()` projects it to `CompactionSummaryMessage`, omits the older summarized entries, and includes the retained tail. `convertToLlm()` then turns that custom role into a user-shaped Pi AI message bounded by compaction-summary markers.

### Mid-run compaction checkpoints

Inside a Tool-using run, the lifecycle before another provider call is ordered:

1. Every Tool result in the completed batch is appended to Agent and session history.
2. Pi then performs the threshold check against that updated context.
3. If the threshold is crossed, optional compaction finishes and rebuilds the Agent messages.
4. Only then does Pi request the next assistant response.

A terminating Tool batch with no steering or follow-up message skips mid-run compaction because there is no next assistant response to protect. If a queued message keeps the loop alive, the preparation hook still runs before that response and can compact the now-larger history.

These are three complementary guards: the mid-run check prevents a large Tool result from reaching the next provider request, the check after the low-level Agent run catches terminal usage and overflow, and the check before submitting a new prompt includes an aborted last response. The post-run and pre-prompt checks remain part of the lifecycle; the new mid-run phase does not replace them.

## 6. History defense 2: optional branch summary

A session is a parent-linked tree. Rewinding to an older entry and continuing creates a different active root-to-leaf path. History from the path being left no longer appears in the new path unless the navigation operation carries it over.

```text
root
├─ investigate plan A
│  └─ discover why A fails       ← old leaf
└─ plan B                         ← new path after navigation
```

### Problem: useful work can remain on the branch being left

Copying the whole old path into the new branch defeats the size controls. Dropping it may cause the model to repeat failed experiments. `AgentSession.navigateTree(targetId, { summarize: true })` offers a third choice: summarize entries unique to the path being left and attach the summary at the navigation target.

Summarization is optional. With `summarize` absent or false, Pi moves the leaf without generating a branch summary. The `session_before_tree` Extension hook can cancel navigation, change instructions and labels, or supply its own summary when the user requested one.

### LCA: locate the fork point

`collectEntriesForBranchSummary()` finds the deepest common ancestor of the old leaf and target:

```text
Pseudocode, matching the current parent-linked algorithm

oldIds = Set(getBranch(oldLeafId).map(entry => entry.id))
targetPath = getBranch(targetId)                  # root first
common = deepest targetPath entry also in oldIds

current = oldLeafId
while current exists and current != common:
  collect getEntry(current)
  current = entry.parentId

reverse collected entries                        # chronological order
```

This is the lowest common ancestor (LCA) for the two selected paths. The LCA itself is not summarized. Collection does not stop at an earlier compaction boundary; a compaction or branch-summary entry on the abandoned path contributes its summary as context.

### Summary generation reuses the compaction path

The branch summarizer converts eligible records to `AgentMessage`, prepares a newest-first subset within `model.contextWindow - reserveTokens`, and restores chronological order. Plain Tool-result entries are skipped during entry-to-message conversion, while Tool calls and file-operation tracking retain useful evidence.

The generator then uses `convertToLlm()`, `serializeConversation()`, and the shared `SUMMARIZATION_SYSTEM_PROMPT`. Serialization wraps the old dialogue as data so the summarizer does not continue it. The default branch reserve is 16,384 tokens, the fallback context window is 128,000 when the model reports none, and the branch summary response cap is now 4,096 tokens (still bounded by a smaller positive `model.maxTokens`). This fixes the earlier 2,048-token cap, which could leave too little visible output after reasoning consumed part of the response budget.

### Reject incomplete summaries

Pi 0.85.0 applies `getSummarizationFailure` to the main history summary, a split turn-prefix summary, and a branch summary. When the provider returns `stopReason: "length"`, the generated text is incomplete: Pi reports failure and does not append or persist it as a compaction or branch-summary checkpoint. The helper is internal to the compaction module rather than a package-root export; applications observe the documented failure through the public compaction and navigation results or events.

The branch summary request uses the new 4,096-token output cap instead of the previous 2,048-token cap. That larger ceiling accurately addresses the case where reasoning consumed the old allowance, but it is not proof of completeness: `stopReason: "length"` is still rejected on the history summary, turn-prefix summary, and branch summary paths.

### The branch template differs from compaction

The current branch template asks for constraints and preferences, three progress states, decisions, and next steps. It omits compaction's `Critical Context` section. Its Markdown labels belong inside the summarizer template, not in this page's navigation:

```text
## Goal
[What was the user trying to accomplish in this branch?]

## Constraints & Preferences
- [Constraints or "(none)"]

## Progress
### Done
- [x] [Completed work]
### In Progress
- [ ] [Started work]
### Blocked
- [Blocking issues]

## Key Decisions
- **[Decision]**: [Rationale]

## Next Steps
1. [Next action]
```

Custom instructions append as `Additional focus` by default. `replaceInstructions: true` lets them replace the template. The built-in result receives a preamble explaining that the user explored another branch, plus `<read-files>` and `<modified-files>` lists derived from Tool activity.

### Injection: entry first, message during projection

Pi persists a `BranchSummaryEntry` with `parentId` set to the navigation target, `fromId` set to the old leaf (or `"root"`), summary text, optional details, usage, and hook provenance. `BranchSummaryMessage` exists only as the projected model-facing form.

```text
Persisted session entry                 Per-request projection
BranchSummaryEntry                      BranchSummaryMessage
├─ parentId: navigation target          └─ convertToLlm()
├─ fromId: old leaf                        └─ user-shaped Message with
├─ summary                                  branch-summary prefix/suffix
└─ details / usage / fromHook
```

`buildSessionContext()` walks the new active path and converts the entry at its path position. The summary is therefore attached to the new branch, and that path position determines its order in every future context.

### Compaction and branch-summary comparison

| Dimension | Compaction | Branch summary |
| --- | --- | --- |
| Trigger | manual call, threshold, or overflow recovery | tree navigation with `summarize: true` |
| Region selected | older portion of the active path | entries from old leaf back to, excluding, the LCA |
| Recent context | retains about `keepRecentTokens` using valid cut points | retains the target branch normally |
| Persisted record | `CompactionEntry` | `BranchSummaryEntry` |
| Model projection | `CompactionSummaryMessage` | `BranchSummaryMessage` |
| Default response budget | up to `min(0.8 × reserveTokens, model.maxTokens)` | up to 4,096 tokens, bounded by a smaller positive `model.maxTokens` |
| Primary purpose | make a long active history fit | carry useful abandoned-path work into a new branch |

## 7. Full pipeline: from resources to the next model call

The defenses appear at different times. The following flow includes both a normal Tool turn and the checks that can change later context:

```text
1. DefaultResourceLoader.reload()
   ├─ bootstrap user/CLI extensions for trust resolution
   ├─ resolve trust; reload global + eligible project settings
   ├─ discover enabled resources and explicit additional paths
   ├─ load context files regardless of trust
   └─ resolve SYSTEM.md / APPEND_SYSTEM.md under trust rules

2. AgentSession rebuilds the system prompt
   └─ default or custom + append + project_context + skill list + cwd

3. SessionManager.buildSessionContext()
   └─ active root-to-leaf path, compaction-aware, branch summaries included

4. Agent loop prepares one assistant response
   ├─ Extension context hook / transformContext: AgentMessage[] → AgentMessage[]
   ├─ convertToLlm: AgentMessage[] → Pi AI Message[]
   └─ Pi AI request: systemPrompt + messages + active Tool schemas

5. Model calls a Tool
   ├─ read: head policy
   ├─ bash: streamed tail policy + possible full-output file
   └─ grep: match + line + aggregate-byte limits

6. ToolResultMessage enters Agent and session history
   └─ completed Tool results are appended before any threshold decision

7. Before the next assistant response in the same run
   └─ threshold check may compact, rebuild context, then continue at step 4

8. After agent_end or before a later prompt
   └─ threshold/overflow check may append a CompactionEntry

9. On later tree navigation with summarize: true
   └─ LCA selection may append a BranchSummaryEntry at the target
```

| Stage | Owning package or class | Durable mutation? |
| --- | --- | --- |
| Tool byte/line limiting | Coding Agent built-in Tool implementations | bounded Tool result and sometimes a temporary full-output file |
| Resource discovery and prompt input | `DefaultResourceLoader` + `SettingsManager` | loaded in-memory resource set; settings and trust stores are separate files |
| Active-path projection | `SessionManager.buildSessionContext()` | no; derives messages from session entries |
| Per-call filtering | Agent `transformContext` / Extension `context` hook | no; works on the request projection |
| Role conversion | Coding Agent `convertToLlm()` | no; produces Pi AI `Message[]` |
| Compaction | `AgentSession` + Coding Agent compaction module | yes; appends `CompactionEntry` |
| Branch summary | `AgentSession.navigateTree()` + branch summarizer | yes when requested; appends `BranchSummaryEntry` |

This ownership map prevents two common mistakes: placing session compaction inside a disposable request hook, and assuming a byte-limited Tool result proves the whole token context fits.

## 8. Design lessons

### 1. Layer defenses by failure mode

Pi uses several small policies because the failures have different units and lifetimes. Lines preserve readable output. Bytes bound a Tool payload. Tokens protect the model request. Active-path projection respects the session tree. Trust decides which project-controlled resource channels can affect startup.

Each policy needs a visible contract. A Tool result says what was omitted and how to fetch it. A compaction entry records the retained boundary. A branch summary records where it came from. A resource record carries its source path. These markers make lossy operations inspectable.

Custom surfaces keep their own responsibility. `truncate.ts` cannot protect a custom Tool that never calls it, and project trust cannot authorize a dangerous path merely because an instruction requests it.

### 2. Addition and subtraction shape the request together

System-prompt append text, context files, skill metadata, compaction summaries, and branch summaries add structured information. Tool truncation, active-branch selection, request hooks, and compaction remove or replace lower-value volume.

The useful invariant is provenance per transformation:

```text
source record
  → selection rule
  → bounded or structured representation
  → marker that names the source or omitted region
  → next model request
```

Every added input consumes part of a defined byte or token budget. When content is omitted, Tool-result markers or summary-entry metadata record the omitted region or retained boundary. Summary templates retain paths, constraints, decisions, failed attempts, and unfinished work.

Before handing off a context pipeline, test five concrete boundaries:

1. Feed it one line larger than its byte cap and include multi-byte text at the cut.
2. Create conflicting global, ancestor, current-directory, replacement, and append instructions; record the resulting order.
3. Repeat the resource test with project trust declined and verify context files still load while protected project resources do not.
4. Cross the token threshold with provider usage and with estimated trailing messages; verify the retained entry boundary.
5. Navigate between sibling leaves once without summarization and once with it; verify `fromId`, `parentId`, and the projected message.

### 3. Tool calls provide on-demand context

Skill disclosure, `read` continuation offsets, grep refinement, and Bash full-output files share one pattern: keep the default request small and give the model a precise way to fetch more.

```text
Push every possible resource             Publish a small index + retrieval path
────────────────────────────             ──────────────────────────────────────
large fixed prompt                       skill name / description / location
mostly irrelevant bodies                 model chooses read only on a match
no retrieval decision                    fetched body becomes traceable history
```

| Dimension | Eager push | On-demand pull |
| --- | --- | --- |
| Initial token cost | paid for every resource | paid for metadata only |
| Selection | application predicts all relevance | model or user selects a named source |
| Trace | content may blend into a large prompt | Tool result or skill wrapper records the path |
| Best fit | mandatory, stable instructions | optional workflows, long files, and rare diagnostics |

Mandatory rules still belong in context files or the system prompt. Optional knowledge benefits from an index and a retrieval Tool. The handoff must preserve both halves: a discoverable description and a path the active Tool set can actually read.

## 9. Next stop

[Chapter 9](ch09-compaction.md) opens the compaction box: token estimation, valid cut points, split turns, incremental summaries, file tracking, and `CompactionEntry` reconstruction. [Chapter 10](ch10-session.md) then follows the parent-linked session tree that makes active-path projection and LCA-based branch summaries possible.

The implementation references for this chapter are pinned to Pi `0.85.0` at `107d79f11072bbc8a3a757ed7fd69596bee7d68c`:

- [Tool truncation and Unicode boundaries](https://github.com/earendil-works/pi/blob/107d79f11072bbc8a3a757ed7fd69596bee7d68c/packages/coding-agent/src/core/tools/truncate.ts)
- [`read` continuation markers](https://github.com/earendil-works/pi/blob/107d79f11072bbc8a3a757ed7fd69596bee7d68c/packages/coding-agent/src/core/tools/read.ts#L151-L176) and [`grep` limits](https://github.com/earendil-works/pi/blob/107d79f11072bbc8a3a757ed7fd69596bee7d68c/packages/coding-agent/src/core/tools/grep.ts#L285-L303)
- [Context-file discovery and `DefaultResourceLoader`](https://github.com/earendil-works/pi/blob/107d79f11072bbc8a3a757ed7fd69596bee7d68c/packages/coding-agent/src/core/resource-loader.ts)
- [Trust-gated resource roots](https://github.com/earendil-works/pi/blob/107d79f11072bbc8a3a757ed7fd69596bee7d68c/packages/coding-agent/src/core/package-manager.ts) and [the trust boundary](https://github.com/earendil-works/pi/blob/107d79f11072bbc8a3a757ed7fd69596bee7d68c/packages/coding-agent/docs/security.md)
- [System-prompt assembly](https://github.com/earendil-works/pi/blob/107d79f11072bbc8a3a757ed7fd69596bee7d68c/packages/coding-agent/src/core/system-prompt.ts) and [skill metadata formatting](https://github.com/earendil-works/pi/blob/107d79f11072bbc8a3a757ed7fd69596bee7d68c/packages/coding-agent/src/core/skills.ts#L347-L380)
- [Compaction defaults and threshold](https://github.com/earendil-works/pi/blob/107d79f11072bbc8a3a757ed7fd69596bee7d68c/packages/coding-agent/src/core/compaction/compaction.ts#L126-L237)
- [Branch collection and generation](https://github.com/earendil-works/pi/blob/107d79f11072bbc8a3a757ed7fd69596bee7d68c/packages/coding-agent/src/core/compaction/branch-summarization.ts)
- [Session-context projection](https://github.com/earendil-works/pi/blob/107d79f11072bbc8a3a757ed7fd69596bee7d68c/packages/coding-agent/src/core/session-manager.ts#L380-L469)

> **Next up:** [Chapter 9: Context Compaction](ch09-compaction.md)
