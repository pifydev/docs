---
title: Glossary
description: Canonical Pi terms used throughout the English and Vietnamese documentation.
translation_key: glossary
language: en
status: reviewed
reviewed_by: Pify maintainers
last_updated: '2026-08-24'
---
These definitions follow the current Pi packages. Code identifiers, package names, commands, paths, configuration keys, and environment variables are always preserved exactly.

:::note[Why a glossary]

Pi uses a small technical vocabulary consistently across its packages. These definitions make the source faster to read and keep the English and Vietnamese pages aligned. Preserve exact identifiers and package names. If a term is not listed here, read it as ordinary English unless the source defines it more narrowly. The Vietnamese edition may translate a general concept after giving its canonical English term on first use.

:::

## Agent

The runtime that sends context to a model, exposes tools, processes tool calls, and tracks state. The core implementation is published as `@earendil-works/pi-agent-core`.

## Agent Loop

The repeated `prompt -> model response -> tool calls -> tool results -> model response` sequence that drives an agent turn. Pi exposes typed events while this loop runs.

## Block

A typed item inside message content. Common block types include `text`, `thinking`, and `toolCall`. A `toolResult` message returns the output of a tool call.

## Coding Agent

The Pi command-line application published as `@earendil-works/pi-coding-agent`. It adds the terminal UI, project context, managed tools, sessions, extensions, skills, and configuration around the agent runtime.

## Compaction

The process of replacing older conversation context with a structured summary while keeping recent messages verbatim. Compaction lets a session continue before it exceeds the model's context window. See [Chapter 9: Context Compaction](ch09-compaction.md).

## Context Window

The maximum number of tokens a model can process in one request. Pi estimates current usage and can compact older context before the request exceeds this limit.

## Descriptor

A structured `Model` record containing the provider ID, model ID, API, capabilities, context limits, and pricing metadata. `Models.getModel(provider, id)` resolves one from a registered model collection.

## Event

A typed update emitted by a model stream or the agent runtime. Model-stream events include `start`, `text_start`, `text_delta`, `text_end`, `toolcall_start`, `toolcall_delta`, `toolcall_end`, `done`, and `error`.

## Extension

A TypeScript module loaded inside the coding-agent process. Extensions can register tools and commands, subscribe to lifecycle events, and customize behavior through the documented extension API.

## Managed Tools

The built-in `read`, `write`, `edit`, and `bash` tools supplied to the coding agent by default. Additional read-only tools such as `grep`, `find`, and `ls` can be enabled through tool options.

## Message

A typed record passed through the model and agent layers. The Pi AI package defines `UserMessage`, `AssistantMessage`, and `ToolResultMessage`; provider adapters translate these records to each provider's wire format.

## Model Provider

The service that handles a model request, such as Anthropic, OpenAI, Google, Bedrock, or a compatible local server. A provider registration supplies models, authentication, and streaming functions to a `Models` collection.

## Pi

The open-source agent toolkit maintained in `badlogic/pi-mono` and mirrored at `earendil-works/pi`. Lowercase `pi` refers to the coding-agent CLI command.

## Session

A persisted conversation history. The coding agent stores sessions as JSONL, supports branching, and can resume a previous branch. See [Chapter 10: Session Management](ch10-session.md).

## Skill

A reusable instruction file discovered from configured skill directories. A skill describes when it applies and provides task-specific guidance to the agent.

## Stream

An `AssistantMessageEventStream`, which is both an async iterable of typed events and a handle for retrieving the final result.

## Subagent

An agent launched to perform a bounded task on behalf of another agent. Pi supports subagent workflows through extensions and example implementations rather than treating one orchestration policy as part of the core loop.

## System Prompt

The instruction text sent with model context. The coding agent assembles it from its defaults, project context files, command-line options, and extension contributions. See [Chapter 8: Context Engineering](ch08-context-engineering.md).

## Tool

A function exposed to the model with a name, description, and TypeBox parameter schema. When the model returns a `ToolCall`, the agent validates the arguments, runs the matching implementation, and adds a `ToolResultMessage`.

## Tool Use

The protocol sequence in which an assistant message contains a `ToolCall` and a later `ToolResultMessage` references that call by ID.

## Provider Adapter

The provider-specific implementation that converts Pi messages and options to a provider request, then converts the provider response stream back to Pi events.

## Turn

One user request and the model/tool work required to reach the next stable agent state. A turn may contain multiple model calls when the model invokes tools.
