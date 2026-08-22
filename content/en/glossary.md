---
title: Glossary
description: >-
  The terms Pi uses for itself. English originals are kept in the translations
  to keep source-code reading notes unambiguous.
translation_key: glossary
language: en
---
This glossary collects the English terms Pi uses for itself. The translations preserve these originals. A term appears here when it has a precise meaning in the Pi codebase, or when the literal translation would mislead.

:::note[Why a glossary]

Pi ships a small vocabulary and uses each word with intent. Reading the source without these definitions is possible but slow. If a chapter uses a term that is not on this list, treat it as ordinary English.

:::

## Agent

The program that drives the LLM. The agent owns the loop, the tool surface, and the session state. In Pi, the agent is split across two packages: `@pi-agent-core` holds the loop, `@pi-coding-agent` adds the CLI shell, prompt expansion, and managed tools.

## Agent Loop

The repeated sequence `prompt -> model -> tool calls -> tool results -> model` that drives a turn. Pi implements the loop in `agentLoop()` inside `@pi-agent-core`. The loop is event-driven, not callback-based; consumers subscribe to a stream of typed events.

## Block

One user-facing unit inside a turn. A turn is composed of one or more blocks. Examples of block types are `text`, `thinking`, `tool_use`, `tool_result`. Blocks flow through the message stream in declaration order.

## Coding Agent

The bundled CLI. Refers specifically to `@pi-coding-agent`, which sits on top of `@pi-agent-core` and adds the prompt expansion, permission prompts, and managed file/bash tools. Not a synonym for "agent".

## Compaction

The process of reducing a long conversation into a shorter summary so it fits the model context window. Pi implements this as a separate agent turn that summarises old blocks while keeping recent ones verbatim. See [Chapter 9: Context Compaction](ch09-compaction.md).

## Context Window

The maximum amount of text the model will read in one request, measured in tokens. Every model has a hard ceiling; Pi tracks usage per turn and triggers compaction when the ceiling is close.

## Descriptor

The structured description of a model: provider, model id, request shape, capabilities, pricing. Pi stores descriptors in a catalog under `@pi-ai/core`. `getModel(provider, id)` returns one. A descriptor is the unit of pluggability for new models.

## Event

A typed message emitted by the agent loop or a stream. Examples: `message_start`, `text_delta`, `tool_use`, `tool_result`, `message_update`, `done`. Events flow over an async iterable.

## Extension

A user-defined hook that runs inside the agent process. Pi extensions can register tools, intercept messages, add slash commands, and override theme tokens. The extension API is stable across `pi-coding-agent` versions.

## Managed Tools

The four built-in tools `read`, `bash`, `edit`, and `write`. Pi runs these with permission prompts by default and supports a YOLO mode that skips the prompts.

## Message

A typed record passed between the agent and the model. Pi uses Anthropic-shaped messages at the protocol layer, then adapts them per provider. There are two message kinds in Pi: `user` and `assistant`. Tool use and tool results are embedded inside `assistant` messages.

## Model Provider

The HTTP service the SDK talks to: Anthropic, OpenAI, Google, OpenRouter, llama.cpp, and so on. Each provider has a translator inside `@pi-ai/core` that converts between Pi messages and the provider wire format.

## Pi

The umbrella project. `Pi` with capital P always refers to the Pi Agent SDK by `earendil-works`. The lowercase `pi` is the CLI binary (`@pi-coding-agent`).

## Session

A persisted conversation tree. Sessions live on disk under the Pi home directory and are loaded by id. A session stores messages, branches, metadata, and the resolved model. See [Chapter 10: Session Management](ch10-session.md).

## Skill

A named, reusable prompt template invoked by `/skill-name` in the prompt. Skills are stored in `~/.pi/agent/skills/` or in `.pi/skills/` inside a project.

## Stream

The async iterable of events returned by `streamSimple` or by the agent loop. Streams are pull-based: the consumer awaits each event.

## Subagent

An agent launched by another agent. Pi supports subagents through the `subagent` tool and the `pi.runSubagent()` extension API. Subagents run their own loop and can return a final result or stream back.

## System Prompt

The instruction block sent at the start of every model call. Pi composes the system prompt from CLI flags, project files (`AGENTS.md`, `SYSTEM.md`), and extension contributions. See [Chapter 8: Context Engineering](ch08-context-engineering.md).

## Tool

A function the model can call. Tools are described to the model with a name, a description, and a JSON schema for the arguments. Pi dispatches tool calls to a registered handler and feeds the result back into the loop.

## Tool Use

The protocol-level message representing the model asking to call a tool. It carries the tool name, an id, and the arguments. The agent executes the matching handler and emits a paired `tool_result`.

## Translator

The per-provider adapter inside `@pi-ai/core` that converts Pi messages to the provider request format and the provider stream back to Pi events. There is one translator per provider.

## Turn

One round-trip of the agent loop, ending when the model returns a stop reason. A turn may contain zero or more tool calls. Multi-turn sessions chain turns together.
