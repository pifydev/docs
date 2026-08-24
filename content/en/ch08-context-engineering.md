---
title: 'Chapter 8: Context engineering'
description: How Pi assembles system instructions, project context, messages, tools, and retrieved data for each model call.
translation_key: ch08-context-engineering
language: en
chapter: 8
source_url: 'https://www.dgzhuya.com/modules/ch08-context-engineering'
official_refs:
  - 'https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/usage.md#context-files'
  - 'https://github.com/badlogic/pi-mono/blob/main/packages/agent/README.md#message-flow'
terms_used:
  - Context
  - Context Engineering
  - System Prompt
  - transformContext
  - convertToLlm
status: reviewed
last_updated: '2026-08-24'
translator: Pify maintainers
reviewed_by: Pify maintainers
---
Context engineering is the work of selecting the instructions, messages, Tool definitions, and external information included in a model request. Good context is relevant, ordered, auditable, and small enough to leave room for the response.

## 1. The request context

A Pi AI `Context` contains three explicit parts:

```typescript
interface Context {
  systemPrompt?: string;
  messages: Message[];
  tools?: Tool[];
}
```

The coding agent builds those parts from several application sources before Agent core hands them to the model layer.

## 2. System-prompt sources

Pi starts with its default coding-agent prompt. Users can replace or extend it through:

- `.pi/SYSTEM.md` for a project;
- `~/.pi/agent/SYSTEM.md` globally;
- `APPEND_SYSTEM.md` in either location to append instructions;
- `--system-prompt` or `--append-system-prompt` for one invocation;
- extension contributions.

Replacement and append operations have different semantics. Use replacement only when you intend to own the full instruction contract.

## 3. Project context files

At startup, Pi discovers `AGENTS.md` or `CLAUDE.md` from the directory hierarchy plus `~/.pi/agent/AGENTS.md` for global instructions. If one directory contains `AGENTS.override.md`, that file replaces `AGENTS.md` or `CLAUDE.md` from the same directory.

Context files are appropriate for:

- build and test commands;
- repository conventions;
- safety constraints;
- architectural boundaries;
- response preferences specific to the project.

Keep them factual and stable. Task-specific details belong in the current user message or a referenced file.

## 4. Project trust

Project-local settings, extensions, packages, prompts, skills, and themes can execute code or influence behavior. Pi applies its project-trust flow before loading those resources.

Non-interactive modes cannot display a trust prompt. They use `defaultProjectTrust` unless the caller supplies `--approve` or `--no-approve`.

Treat context discovery as an input boundary. Review instructions from an unfamiliar repository before allowing them to trigger tools or extensions.

## 5. Message-history transformation

Agent core exposes two stages:

```typescript
const agent = new Agent({
  streamFn: models.streamSimple.bind(models),
  transformContext: async (messages, signal) => {
    return selectRelevantMessages(messages, { signal });
  },
  convertToLlm: (messages) => {
    return messages.filter(isModelMessage);
  },
});
```

`transformContext` works with `AgentMessage[]`. Use it for retrieval, pruning, or application-specific compaction.

`convertToLlm` creates the final Pi AI `Message[]`. Use it to remove or convert custom agent roles. Provider-specific conversion happens later inside Pi AI.

## 6. Tools are context

Every Tool name, description, and parameter schema consumes context and affects model behavior. Expose only Tools relevant to the current task.

Tool descriptions should state:

- what the Tool does;
- when it should be used;
- constraints the model must know before calling it;
- precise argument meanings.

Authorization and path validation still belong to runtime policy. A prompt instruction is not a security boundary.

## 7. Skills, prompt templates, and extensions

These mechanisms contribute context at different times:

| Mechanism | Role |
| --- | --- |
| Prompt template | Expands a named Markdown workflow into a user prompt |
| Skill | Supplies reusable task-specific instructions and resources |
| Extension | Can register Tools, commands, hooks, and dynamic context |

Use static Markdown when the information is stable. Use an extension when context depends on runtime state or an external system.

## 8. Retrieved and generated context

Retrieved context should include its source and enough surrounding text to be understood. Prefer a few high-confidence passages over a large undifferentiated dump.

Generated summaries must preserve decisions, constraints, unfinished work, and identifiers needed to continue. They should not invent facts to make the narrative smoother.

Tool output is another context source. Truncate or summarize large output before repeated model calls, but retain the exact evidence needed for the current decision.

## 9. Token budget and compaction

Allocate the context window among:

1. system and project instructions;
2. recent conversation messages;
3. Tool definitions;
4. retrieved or generated context;
5. reserved space for the model response.

When the conversation approaches the configured threshold, Pi compacts older history and keeps a recent tail. Compaction is a lossy operation, so it should preserve actionable state rather than every sentence. [Chapter 9](ch09-compaction.md) covers the algorithm.

## 10. Context quality checklist

Before a request, check:

- relevance: each item helps the current task;
- authority: source and precedence are clear;
- consistency: instructions do not conflict silently;
- recency: version-sensitive data is current or pinned;
- safety: untrusted text cannot grant itself authority;
- size: the request leaves enough space for a useful response;
- traceability: important facts can be traced back to files, messages, or Tool results.

Context engineering works best as a deterministic pipeline. Log which sources were selected and why, while redacting secrets and private content.
