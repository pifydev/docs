---
chapter: 6
slug: ch06-messages
title_zh: "第6章：消息系统 : Agent 的记忆如何组织与传递"
title_en: "Chapter 6: Message System : How Agent Memory Is Organized and Passed"
title_vi: "Chương 6: Hệ thống Message : Bộ nhớ của Agent được tổ chức và truyền đi ra sao"
source_url: https://www.dgzhuya.com/modules/ch06-messages
language: en
version_pairs:
 zh: zh/src/ch06-messages.md
 en: en/src/ch06-messages.md
 vi: vi/src/ch06-messages.md
original_chars: 4947
code_lines: 181
reading_minutes: 25
translator: hypnguyen1209
reviewed_by: null
last_updated: 2026-08-20
status: translated
official_refs: []
terms_used: []
code_blocks: 17
mermaid_blocks: 0
---

# Chapter 6: Message System : How Agent Memory Is Organized and Passed

Last chapter we learned the tool system : the model says "read the file", Agent Loop executes the `read` tool through a five-step pipeline, and finally produces a `ToolResultMessage`. But have you noticed: we have been saying "message" all along, yet we never opened it up to see what it looks like.

`UserMessage`, `AssistantMessage`, `ToolResultMessage` : these three names appear again and again in the first five chapters. Chapter 3 says "messages flow in the Loop", Chapter 4 says "messages are sent to the model", Chapter 5 says "a tool result is a message".

But what exactly is a message? What does its data structure look like? Are the messages inside the Agent the same as those sent to the model?

This chapter answers these questions. You will see the most core design of Pi's message system : **two layers of messages**: rich formats used freely inside the Agent, translated back to strict standard format at the LLM boundary.

---

## 1. Opening: the journey of a Bash command's message

Let us start with a concrete scenario.

You typed a Bash command `!ls -la` in Pi's terminal and hit Enter. The command ran and output a bunch of file listings.

This command's information, inside Pi, will become a **BashExecutionMessage** : it has a `command` field recording the original command, an `output` field recording the output content, an `exitCode` field recording the exit code. These structured fields let the UI use dedicated renderers to beautifully display the terminal output.

But the question is: when Agent Loop is ready to call the LLM, the LLM's API does not understand any `BashExecutionMessage` at all. It only understands three message formats: `user` (what the user said), `assistant` (AI's reply), `toolResult` (what the tool returned). BashExecutionMessage does not belong to any of these three.

So how does this message get seen by the LLM? What changes happen in between?

In this chapter, we follow this BashExecutionMessage from its birth to the moment the LLM sees it.

---

## 2. Layer one: the LLM only knows three kinds of messages

Before understanding how messages transform, let us clarify what the "target of the transformation" looks like. The message format the LLM understands is called the **Message** type in Pi, defined in the lowest-level `packages/ai/src/types.ts`.

It has only three members:

```
Message 联合类型（LLM 标准格式）
│
├── UserMessage        ← 用户说的话 / 发的图片
├── AssistantMessage   ← LLM 的回复（含思考、工具调用）
└── ToolResultMessage  ← 工具执行后的结果
```


### The specific data structure of each kind

**UserMessage** : the simplest kind, user input:

```
{
    role: "user",
    content: string | (TextContent | ImageContent)[],  // 纯文本或内容块数组
    timestamp: number                                    // Unix 毫秒时间戳
}
```


content can be a plain string, or an array of content blocks. This means user messages can send both text and images.

**AssistantMessage** : LLM's reply, with the most fields:

```
{
    role: "assistant",
    content: (TextContent | ThinkingContent | ToolCall)[],  // 三种内容块
    api: Api,                   // 使用的 API 类型（如 "anthropic-messages"）
    provider: ProviderId,       // 提供商（如 "anthropic"）
    model: string,              // 模型名（如 "claude-sonnet-4-6"）
    usage: Usage,               // token 用量统计
    stopReason: StopReason,     // 停止原因（第3章讲过的5种值）
    errorMessage?: string,      // 错误信息
    timestamp: number
}
```


What is worth paying attention to here is the content field : it is not a string, but a **content block array** that can contain three kinds of things:

```
AssistantMessage 的 content 内容块
│
├── TextContent       ← 普通文本
│     { type: "text", text: "..." }
│
├── ThinkingContent   ← 思考过程（第3章讲过，模型"在想"但不直接告诉用户的部分）
│     { type: "thinking", thinking: "..." }
│
└── ToolCall          ← 工具调用（第5章讲过，触发五步管道的入口）
      { type: "toolCall", id: "...", name: "read", arguments: { path: "..." } }
```


**An assistant message may contain both text and a tool call.** For example, the LLM may say "let me look at this file for you" while emitting a Read tool call : these two pieces of content are placed in the same `AssistantMessage.content` array. The "model reply contains a ToolCall" mentioned in Chapter 3 is exactly this structure.

> **Advanced detail**: the content blocks also contain some `*Signature` fields (`textSignature`, `thinkingSignature`, etc.), which are opaque signature IDs required by certain providers (OpenAI, Google) that must be passed back verbatim in the next request. Encrypted content edited by safety filters also lives here. You don't need to dig deep for daily understanding; know that it is "the context-continuity mechanism between providers".

**ToolResultMessage** : the result of tool execution (the end product of Chapter 5's five-step pipeline):

```
{
    role: "toolResult",
    toolCallId: string,                             // 对应哪个 ToolCall
    toolName: string,                               // 工具名
    content: (TextContent | ImageContent)[],        // 结果内容
    details?: TDetails,                             // 结构化详情（给 UI 看的）
    isError: boolean,                               // 是否执行失败（第5章的"永不抛出"产物）
    timestamp: number
}
```


`ToolResultMessage` is associated with the `ToolCall` inside `AssistantMessage` via the `toolCallId` field. Chapter 3 mentioned "the tool result must accurately link back to the call request" : that linkage is done through this field. The `details` field carries structured information for UI rendering; the LLM usually does not need to look at this field.

### A complete dialog example

Putting these three message kinds together, a typical dialog fragment looks like this:

```
messages 数组：
│
├── [0] UserMessage
│       role: "user"
│       content: "帮我看看 auth.ts"
│
├── [1] AssistantMessage
│       role: "assistant"
│       content: [
│           { type: "text", text: "让我帮你看看这个文件" },
│           { type: "toolCall", id: "tc_001", name: "read", arguments: { path: "auth.ts" } }
│       ]
│       stopReason: "toolUse"     ← 第3章讲过：调了工具，循环继续
│
├── [2] ToolResultMessage
│       role: "toolResult"
│       toolCallId: "tc_001"      ← 和上面的 id 对应
│       content: [{ type: "text", text: "import { auth } from '...' ..." }]
│       isError: false            ← 第5章讲过：正常结果
│
└── [3] AssistantMessage
        role: "assistant"
        content: [{ type: "text", text: "auth.ts 是一个认证模块..." }]
        stopReason: "stop"        ← 没调工具，循环结束
```


This is the world the LLM understands : what the user said, what the AI replied, what the tool returned, just these three.

---

## 3. The contradiction: messages in the Agent are more than three kinds

Good, now back to the opening scenario. You executed `!ls -la`, and Pi needs to record the information of this execution internally.

There is a more general problem hiding here: **besides the "LLM dialog", the Agent internally has a lot of functional data to manage** : Bash command execution records, summaries after context compression, Git branch switch records, user-uploaded attachment metadata...

These functional data have **two independent readers**, and their needs conflict:

- **The UI side** needs structured fields : to render Bash execution beautifully, it needs to grab `command`, `output`, `exitCode`, `cancelled`, `truncated` separately, then display in the terminal (commands with syntax highlighting, output with monospace font, exit codes with color)
- **The LLM side** only needs a piece of flat text : "user executed `ls -la`, output was `file1.txt
file2.txt
...`", this piece of text stuffed into `UserMessage.content` is enough

Where is the conflict? **If we pre-flatten the fields for the LLM and store them inside `UserMessage`, the UI can never get the structured data back** : you have already stirred it all into a pot. Conversely, if we only store structured custom messages without going into the LLM context, the LLM will lose memory : in the next round it won't know what the user just executed.

Pi's design **compromises neither side**: **store in structured form inside `context.messages`** (satisfying UI/persistence), **do one translation at the boundary of calling the LLM** (satisfying the LLM). This way the UI always has complete structured data available, and the LLM can also see the flat version it needs. The translation happens at the last moment, is lossy, is one-way : the structured fields lost in translation, the UI has long since used, so it does not matter.

**Pi's solution is: allow applications to define custom message types.** `pi-agent-core` reserves an extension point (called `CustomAgentMessages`, the next section will expand on its implementation) in the `AgentMessage` union type. Applications inject their own message types via TypeScript's declaration merging. Each application only registers what it needs : the core package has zero dependencies, and the application layer gets full type safety.

Taking Pi's bundled coding-agent as example, it defines 4 kinds of custom messages in [packages/coding-agent/src/core/messages.ts](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/src/core/messages.ts):

```
coding-agent 的自定义消息类型
│
├── BashExecutionMessage       ← Bash 命令执行记录
├── CustomMessage              ← 扩展注入的通用消息
├── BranchSummaryMessage       ← 分支切换时的摘要
└── CompactionSummaryMessage   ← 上下文压缩后的摘要
```


Each kind has its own structured fields. Taking `BashExecutionMessage` as example:

```
{
    role: "bashExecution",
    command: string,          // 命令原文："ls -la"
    output: string,           // 输出内容："file1.txt\nfile2.txt\n..."
    exitCode: number | undefined,  // 退出码：0
    cancelled: boolean,       // 是否被取消
    truncated: boolean,       // 输出是否被截断
    fullOutputPath?: string,  // 截断时的完整输出文件路径
    timestamp: number,
    excludeFromContext?: boolean  // 是否排除在 LLM 上下文之外
}
```


All structured fields are preserved. But here we need to stop and emphasize : **custom messages are an "intermediate format for translation to LLM", they themselves bring three independent capabilities**:

**1. UI-dedicated rendering.** The UI dispatches based on the `role` field : `bashExecution` renders with terminal styling, `compactionSummary` renders with a summary card. Command, output, exit code each get their own line, no interference. Without custom messages, the UI can only get a piece of flat text, and all rendering flair has to fall back to "all in big blocks of text".

**2. Persistence recovery.** The session file stores complete structured data. When you restart the Agent next time, the UI can precisely restore last time's render state : exit code still has color, commands still highlighted, truncation indicator still there. If only the translated flat text is stored, this information would be permanently lost after restart.

**3. Fine-grained visibility control.** Because custom messages have their own `role`, special handling can be done in `convertToLlm` translation : for example adding an `excludeFromContext = true` field, and the LLM will not see this message at all, but the UI renders it normally. **Standard messages cannot do this** : once they enter the `messages` array, `convertToLlm` will definitely translate them and send them to the LLM, with no room for "visible to UI but invisible to LLM".

So when §5 later talks about `convertToLlm` translation and §7 about `excludeFromContext` filtering, please remember: **these two things are not "troubles" brought by custom messages, but quite the opposite : they are capabilities granted by custom messages**. Translation is to let the LLM see the flat version, filtering is to let some messages be invisible to the LLM. Without custom messages, neither of these two things can be done.

But there is a fundamental question: **the Message union type is closed : only `UserMessage`, `AssistantMessage`, `ToolResultMessage`**. These 4 kinds of custom messages do not belong to the Message type. So how are they accepted and processed by the Agent system?

---

## 4. Layer two: `AgentMessage` : rich inside, strict outside, the double-layer design

This is the core design of Pi's message system: **do not use one format to rule them all, but use two layers : rich inside, strict outside**.

**Diagram caption:** at the top the `AgentMessage` union type splits into two : left branch `Message` (3 standard), right branch `CustomAgentMessages` (4 extensions). The red dashed line in the middle is the `convertToLlm()` translation boundary. At the bottom, the LLM only sees 3 standard messages; custom messages are either filtered or translated into `UserMessage`.

### The `AgentMessage` union type

There is a key line of code at `packages/agent/src/types.ts:314`:

```
export type AgentMessage = Message | CustomAgentMessages[keyof CustomAgentMessages];
```


Translated into plain language: **`AgentMessage` = LLM standard messages + custom messages**. It is a union type of `Message` (three standard formats) and `CustomAgentMessages` (custom extensions).

Looking at it with a picture is clearest:

```
AgentMessage（Agent 内部使用的消息格式）
│
├── Message（可直接发送给 LLM 的标准消息）
│   │
│   ├── UserMessage          ← role: "user"
│   ├── AssistantMessage     ← role: "assistant"
│   └── ToolResultMessage    ← role: "toolResult"
│
└── CustomAgentMessages（仅 Agent 内部使用的扩展消息）
    │
    ├── BashExecutionMessage      ← role: "bashExecution"
    ├── CustomMessage             ← role: "custom"
    ├── BranchSummaryMessage      ← role: "branchSummary"
    └── CompactionSummaryMessage  ← role: "compactionSummary"
```


The `context.messages` array inside the Agent holds `AgentMessage[]` : it can mix and store standard and custom messages. Whether a message is standard or custom, you can tell by looking at the `role` field.

### `CustomAgentMessages`: the empty-by-default extension point

The key is the `CustomAgentMessages` interface:

```
export interface CustomAgentMessages {
    // Empty by default - apps extend via declaration merging
    // 默认为空 - 应用通过声明合并扩展
}
```


Note: **this interface is empty inside the core package (`pi-agent-core`)**. The core package does not know anything about `BashExecutionMessage` or `CompactionSummaryMessage`. It only provides a "slot" for the application layer to insert into.

### Declaration merging: type-safe extension magic

How does the application layer "insert"? It relies on TypeScript's **declaration merging** (Declaration Merging). The coding-agent uses the `declare module` syntax to "inject" its 4 message types:

```
declare module "@earendil-works/pi-agent-core" {
    interface CustomAgentMessages {
        bashExecution: BashExecutionMessage;
        custom: CustomMessage;
        branchSummary: BranchSummaryMessage;
        compactionSummary: CompactionSummaryMessage;
    }
}
```


The effect of this code is: **the compiler automatically adds these 4 types into the `AgentMessage` union type**. From then on in the coding-agent project, `AgentMessage` becomes a union of 7 kinds of messages (3 standard + 4 custom), and TypeScript will do full type checking for you.

**Why not use inheritance or generics?** Because inheritance requires modifying the base class : you cannot modify the `pi-agent-core` package. Generics require passing parameters everywhere : every function signature that uses `AgentMessage` would need a generic parameter. The benefit of declaration merging is: **the core package has zero awareness of extensions (zero dependencies), yet the extension package gets full type safety**.

Different applications can have different custom messages. For example the Web UI registers its own message types (`user-with-attachments`, `artifact`). **Each application only sees the message types it needs.**

---

## 5. Translation boundary: `convertToLlm` : every custom message eventually becomes User

Now we know the Agent internally uses 7 kinds of message types to express freely. But every time the LLM is called, the LLM only accepts 3 standard formats. What to do?

**The answer is: at the last moment before calling the LLM, do one translation.** This translator is the `convertToLlm` function.

### When does the translation happen?

In the `streamAssistantResponse` function (the "call the model" step mentioned in Chapter 3), the timing of the translation is precise:

```
每次 LLM 调用前的消息处理管道：

context.messages: AgentMessage[]        ← Agent 内部的消息（最多 7 种类型）
        │
        ▼
[1] transformContext (可选)             ← AgentMessage[] → AgentMessage[]
        │                                  裁剪旧消息、注入外部上下文
        ▼
[2] convertToLlm (必须)                 ← AgentMessage[] → Message[]
        │                                  自定义消息翻译成标准格式
        ▼
llmContext.messages: Message[]          ← LLM 看到的消息（只有 3 种类型）
        │
        ▼
streamFunction(model, llmContext, ...)  ← 调用 LLM（第4章讲过）
```


Note the order: **first `transformContext` (same-layer transformation), then `convertToLlm` (cross-layer translation)**. Why two steps? We will discuss later.

### Translation rules: all custom messages become User

The core logic of coding-agent's `convertToLlm` is a `switch` statement that dispatches by the `role` field:

| role | How to handle |
| --- | --- |
| `"user"` | pass through directly, no modification |
| `"assistant"` | pass through directly |
| `"toolResult"` | pass through directly |
| `"bashExecution"` | `excludeFromContext=true` -> filter out; otherwise -> convert to `UserMessage` |
| `"custom"` | convert to `UserMessage` |
| `"branchSummary"` | convert to `UserMessage` (wrap with XML tags) |
| `"compactionSummary"` | convert to `UserMessage` (wrap with XML tags) |

Key insight: **all custom messages get converted to `user`-role messages**.

Why all become `user`? Because LLM APIs have strict requirements on role ordering : the dialog format must alternate `user -> assistant -> user ->. ..`, two consecutive `assistant`s are not allowed. Custom messages are "system-injected information" (Bash execution results, compaction summaries, branch summaries), and putting them in the `user` role is safest.

### Specific example: BashExecutionMessage translation

Back to the opening scenario. A `BashExecutionMessage` from creation to being seen by the LLM, the data structure changes like this:

**Before** : `BashExecutionMessage` (internal Agent format):

```
{
    role: "bashExecution",
    command: "ls -la",
    output: "total 32\ndrwxr-xr-x  5 user  staff  160 May 30 10:00 .\n...",
    exitCode: 0,
    cancelled: false,
    truncated: false,
    timestamp: 1748568000000
}
```


**After** : `UserMessage` (format the LLM sees):

```
{
    role: "user",
    content: [{
        type: "text",
        text: "Ran `ls -la`\n```\ntotal 32\ndrwxr-xr-x  5 user  staff  160 May 30 10:00 .\n...\n```"
    }],
    timestamp: 1748568000000
}
```


Change summary:

- `role`: `"bashExecution"` -> `"user"`
- `command`, `output`, `exitCode` and other structured fields -> formatted into a piece of text
- Lost information: `cancelled`, `truncated` and other boolean flags are merged into the text description, no longer independent fields

Other custom messages (`CompactionSummary`, `BranchSummary`) follow exactly the same translation pattern : wrap the summary text with `<summary>` tags, prefix with an explanatory sentence, and turn it into the `UserMessage.content`.

---

## 6. Two-stage pipeline: why are transformContext and convertToLlm separated?

Message processing pipeline

**Diagram caption:** horizontal data flow : `AgentMessage[7]` -> `transformContext` (same-layer transformation, type unchanged) -> `convertToLlm` (cross-layer translation) -> `Message[3]` sent to the LLM. The lower side marks the `excludeFromContext` filtering branch.

Back to the pipeline diagram, there is one design detail worth asking about: **why two steps, rather than one shot?**

The answer is **separation of concerns**:

- **`transformContext` handles AgentMessage-level operations**: trimming messages that are too old, injecting external context, triggering compaction algorithms. Before and after, it is `AgentMessage[]` : the type is unchanged.
- **`convertToLlm` handles cross-type translation**: it translates `AgentMessage` into `Message`. Before processing it is `AgentMessage[]`, after processing it is `Message[]` : the type changes.

The benefit of separation: **you can replace just one, without affecting the other**.

- When you **change the context management strategy** (e.g. from "delete the oldest message" to "compress into a summary"), only `transformContext` needs to change : it handles the "how to trim" policy. `convertToLlm` does not need to change.
- When you **change the application type** (e.g. adapting coding-agent into a Web customer-service Agent, where custom messages change from `BashExecution`/`CompactionSummary` to business messages like `TicketEvent`/`OrderNote`), only `convertToLlm` needs to change : it handles "how to translate custom messages into `UserMessage`". `transformContext` does not need to change.

There is one easily-confused point to emphasize: **when you switch the LLM provider (e.g. from Claude to GPT), `convertToLlm` does not need to change**. Why? Because the output of `convertToLlm` is the unified `Message[]` (3 standard messages), and it has already done the "custom message -> standard message" job. Further down, **translating `Message` into each provider's private format** is the job of the `pi-ai` layer (covered in Chapter 4) : that layer has its own translators (`anthropic-messages`, `openai-completions`, etc.), completely independent from `convertToLlm`. In other words: **Pi places "message type translation" and "provider protocol translation" into two different abstraction layers, with no interference**.

---

## 7. Filtering mechanism: some messages the LLM should not see

Up to now, all custom messages eventually became `UserMessage` and were seen by the LLM. But in some cases, messages should only be visible to the UI, not to the LLM.

### `excludeFromContext`: the filtering power of a boolean field

Pi's Bash tool has a feature: when you execute a command with the `!!` prefix (e.g. `!!secret_cmd`), the execution result of that command is invisible to the LLM.

The implementation is simple : `BashExecutionMessage` has an `excludeFromContext` field. In `convertToLlm`, this field is checked:

```
case "bashExecution":
    if (m.excludeFromContext) {
        return undefined;   // 直接返回 undefined，后续被 filter 掉
    }
    // ... 否则正常转换
```


Note: messages with `excludeFromContext = true` **still exist inside `context.messages`**. The UI can still see them, render them. Only at the moment of calling the LLM, this message is "invisible".

This is the "UI can see, LLM cannot" mechanism : one boolean field, filter at the translation boundary, the data itself does not need to be deleted.

### Three message visibility levels

Synthesizing the above analysis, Pi's message system has three visibility levels:

| Visibility level | LLM can see? | UI can see? | Implementation | Typical message |
| --- | --- | --- | --- | --- |
| Fully visible | Yes | Yes | `convertToLlm` normally translates | Common `BashExecution`, `User`, `Assistant` |
| Invisible to LLM | No | Yes | `excludeFromContext = true` | Bash execution with `!!` prefix |
| Persistence only | No | No | UI render skips it, `convertToLlm` also filters it out | Web UI's `ArtifactMessage` |

---

## 8. Complete data flow: from user action to messages seen by the LLM

Connecting the whole chapter, the complete path of a message from birth to being seen by the LLM:

```
用户在终端输入 !ls -la
        │
        ▼
[1] 创建消息
    BashExecutionMessage { role: "bashExecution", command: "ls -la", output: "...", ... }
        │
        ▼
[2] 存入 context.messages: AgentMessage[]
    [...原有消息, 新的 BashExecutionMessage]
        │
        ▼
[3] Agent Loop 准备调用 LLM（第3章讲过的内层循环）
        │
        ▼
[4] transformContext（可选）
    输入/输出都是 AgentMessage[]
    裁剪、注入、压缩（第8章详讲 transformContext、第9章详讲 Compaction）
        │
        ▼
[5] convertToLlm（必须）
    AgentMessage[] → Message[]
    BashExecutionMessage → UserMessage
    excludeFromContext → 过滤掉
        │
        ▼
[6] LLM 收到
    llmContext.messages = [
        ...之前的消息,
        { role: "user", content: "Ran `ls -la`\n```\n...\n```" }
    ]
        │
        ▼
[7] LLM 回复
    → 产生新的 AssistantMessage
    → 可能触发工具调用 → ToolResultMessage（第5章的五步管道）
    → 回到 [2]，继续循环
```


**Core rule**: the Agent internally expresses freely with 7 kinds of message types, but at the LLM boundary all custom messages are translated back to the 3 standard formats. This "rich inside, strict outside" design gives the Agent unlimited extension ability while never breaking LLM compatibility.

---

## 9. Summary

### One main line: data structures must serve two readers at the same time

Looking back at the whole chapter, all of Pi's message system design revolves around a simple idea : **when designing data structures, consider both what the model uses and what the functional layer uses, then customize as needed and use a sound architecture to combine the two**.

Specifically for the message system, the needs of these two "readers" are split:

- **The model's side** only needs three standard messages (`User`/`Assistant`/`ToolResult`) : this is forced by the LLM API protocol, it cannot be changed
- **The functional side** (UI, persistence, visibility control) needs rich structured fields : the more fields, the more capabilities

If we design only for the model, structured fields are all lost and the functional layer degrades; if we design only for the functional layer, the model cannot understand it, the dialog is broken. Pi's approach is **two layers each managing its own**:

| Layer | Cares about whom | Data form | How to implement |
| --- | --- | --- | --- |
| **`AgentMessage` (inner)** | Functional layer | 7 messages (3 standard + 4 custom), rich fields | Use union types + declaration merging so the core package has zero dependencies and the application layer is fully type-safe |
| **`Message` (outer)** | Model | 3 standard messages, lean fields | Do one `convertToLlm` translation at the LLM-call boundary, **lossy, one-way, at the last moment** |

All the concrete designs in this chapter : the three-layer type progression (`Tool` -> `AgentTool` -> `ToolDefinition`), the declaration-merging extension point, the `transformContext` / `convertToLlm` two-stage pipeline, the `excludeFromContext` visibility control : are all concrete implementations of this main line. **The main line is "two readers, two-layer architecture", and implementation means can vary widely.**

### Apply this main line to your own project

Next time you design a system that interfaces with an external protocol (not only Agent : any scenario where you have "an external protocol constraint and internal rich needs"), you can apply this three-step approach:

**Step 1: identify what each of the "two readers" wants.** What does the protocol specify (cannot change)? What does the functional layer need (can customize)? Write them down and clarify each one's needs.

**Step 2: let the inner structure be the "source", let the outer translation be the "flow".** Storage and the functional layer use the original, structured data (no field loss, no flattening); at the protocol boundary do one lossy translation. **Do not pre-flatten the data for protocol convenience** : once flattened, the UI and persistence can never recover the structure.

**Step 3: use the type system extension point to make a "core + application" layering.** The core package defines the protocol interface (closed) and leaves an empty extension slot; the application package injects its concrete types via declaration merging. This way the core package has zero dependencies, and the application package is fully type-safe : no inheritance needed, no generic-parameter pollution.

> The "Tool -> AgentTool -> ToolDefinition" three-layer progression (Chapter 5) covered in this chapter uses the same idea: each layer only adds the capability its own level needs, never oversteps. Identifying the "layering point" and drawing clear responsibility boundaries for each layer is the core of this design method.

---

## 10. Next stop

The first six chapters end here : you have built a complete understanding of Pi-Agent's core mechanisms.

> **Suggestion**: before entering the advanced chapters, it is recommended to review the core mechanisms of the first six chapters (message system, tool invocation, extension mechanisms, Agent Loop, etc.) and confirm that you have strung the knowledge points of each chapter together.

From Chapter 7 on, we enter the advanced chapters. Looking back at the first five chapters, there is one thing that keeps appearing but we never explored in depth: **events**. Chapter 3 says "Agent Loop emits events at every step to let the UI update in real time", Chapter 5 says "tool execution emits `tool_execution_start`, `tool_execution_update`, `tool_execution_end` events". How do these events get transmitted from inside the Agent to the outside? How does the UI subscribe to these events? Why does the Agent "synchronously wait" for listeners to finish processing after emitting an event?

In the next chapter, we open the Agent's "nervous system" : event-driven architecture.

---

> **Key source index for this chapter**:
>
> `packages/ai/src/types.ts:322-408` : Message union type + three message interfaces
> `packages/agent/src/types.ts:305-314` : `CustomAgentMessages` + `AgentMessage`
> `packages/coding-agent/src/core/messages.ts:70-77` : coding-agent declaration merging
> `packages/agent/src/agent-loop.ts:275-308` : translation pipeline (`transformContext` -> `convertToLlm`)
> `packages/coding-agent/src/core/messages.ts:82-195` : custom translation rules
> `packages/coding-agent/src/core/messages.ts:38-39` : `excludeFromContext` field
