---
title: 'Chapter 2: The three-layer architecture'
description: How Pi separates provider transport, the agent runtime, and the coding-agent application.
translation_key: ch02-three-layer-arch
language: en
chapter: 2
source_url: 'https://www.dgzhuya.com/modules/ch02-three-layer-arch'
official_refs:
  - 'https://github.com/badlogic/pi-mono/tree/main/packages'
terms_used:
  - Model
  - Provider
  - Agent
  - Coding Agent
  - TUI
status: reviewed
last_updated: '2026-08-24'
translator: Pify maintainers
reviewed_by: Pify maintainers
---
Pi separates three responsibilities: communicating with models, running an agent, and delivering a coding product. The package graph enforces that separation through dependency direction rather than naming alone.

## 1. The three layers

| Layer | Package | Owns |
| --- | --- | --- |
| Model | `@earendil-works/pi-ai` | Models, provider registration, messages, tools, authentication, streaming |
| Agent | `@earendil-works/pi-agent-core` | State, the model/tool loop, queues, context transforms, runtime events |
| Application | `@earendil-works/pi-coding-agent` | CLI, project context, managed tools, sessions, extensions, skills |

`@earendil-works/pi-tui` is an orthogonal presentation package. The coding agent uses it, but the model and agent packages do not.

## 2. Layer 1: model transport

The model layer answers one question: how can an application call different providers through one typed interface?

It defines the common `Model`, `Message`, `Tool`, `Context`, and stream event types. Provider factories register model catalogs and the functions that implement `stream()` and `streamSimple()`.

```typescript
import { createModels } from "@earendil-works/pi-ai";
import { openAIProvider } from "@earendil-works/pi-ai/providers/openai";

const models = createModels();
models.setProvider(openAIProvider());

const model = models.getModel("openai", "gpt-5-mini");
if (!model) throw new Error("Model not found");
```

Nothing in this code knows about sessions, a terminal, or an agent loop. The result is a model descriptor and a collection capable of streaming requests.

## 3. Layer 2: agent runtime

The agent layer adds state and control flow. It owns:

- the current system prompt, model, tools, messages, and thinking level;
- the loop that alternates model calls with tool execution;
- `transformContext` and `convertToLlm` boundaries;
- steering and follow-up queues;
- lifecycle events for application consumers.

The runtime receives the model stream function through configuration:

```typescript
const agent = new Agent({
  initialState: { systemPrompt, model, tools },
  streamFn: models.streamSimple.bind(models),
});
```

This injection keeps the runtime independent of a specific provider registry and makes the boundary testable.

## 4. Layer 3: coding-agent application

The coding-agent package turns the runtime into the `pi` product. It decides application policy:

- which project and global instruction files to load;
- which Tool implementations to expose;
- how to store credentials, settings, and sessions;
- how to render events in the TUI;
- how extensions, skills, prompt templates, themes, and packages are discovered.

These decisions belong above the agent runtime because another product may need different storage, permissions, or presentation.

## 5. The data path

A normal interactive request crosses the layers in this order:

1. The coding agent reads user input and project context.
2. The agent runtime appends a user message and prepares the next model context.
3. `transformContext` may prune or inject agent messages.
4. `convertToLlm` produces the model-layer `Message[]`.
5. Pi AI selects the registered provider and opens a model stream.
6. The runtime updates state from stream events and executes any requested tools.
7. The coding agent renders events and persists the resulting session entries.

The return path uses the same boundaries in reverse. Provider-specific payloads stop inside Pi AI; the coding agent receives normalized events and agent messages.

## 6. Dependency rules

The architecture stays understandable when these rules hold:

### 6.1 Lower layers do not import product policy

Pi AI must not import coding-agent settings or terminal components. Agent core must not assume a particular session directory or permission UI.

### 6.2 Pass behavior through narrow interfaces

The agent receives `streamFn`, context transforms, hooks, and Tool implementations as values. This is clearer than teaching the runtime how to discover every application service.

### 6.3 Preserve protocol identifiers at boundaries

Types such as `ToolCall`, `ToolResultMessage`, provider IDs, model IDs, and event names are contracts. Translate explanations around them, not the identifiers themselves.

## 7. Choosing the right layer

| Change | Correct layer |
| --- | --- |
| Add a provider-specific request header | Pi AI provider adapter |
| Filter UI-only messages before a call | Agent `convertToLlm` |
| Block a dangerous shell command | Tool policy or coding-agent extension |
| Add a new terminal panel | Coding agent or Pi TUI |
| Store sessions in another backend | Application/session integration |

When a change crosses several layers, define the shared type in the lowest layer that owns the concept and keep policy in the highest layer that needs it.

## 8. Next step

[Chapter 3](ch03-agent-loop.md) follows the agent runtime through one complete prompt, including streaming, tool calls, queued messages, and termination.
