---
chapter: 7
slug: ch07-event-driven
title_zh: "第7章：事件驱动 —— Agent 的神经系统"
title_en: "Chapter 7: Event-Driven — Agent's Nervous System"
title_vi: "Chương 7: Hướng sự kiện — Hệ thần kinh của Agent"
source_url: https://www.dgzhuya.com/modules/ch07-event-driven
language: en
version_pairs:
  zh: zh/src/ch07-event-driven.md
  en: en/src/ch07-event-driven.md
  vi: vi/src/ch07-event-driven.md
original_chars: 3423
code_lines: 164
reading_minutes: 18
translator: hypnguyen1209
reviewed_by: null
last_updated: 2026-08-20
status: translated
official_refs: []
terms_used: []
code_blocks: 15
mermaid_blocks: 0
---

# Chapter 7: Event-Driven — Agent's Nervous System

In the previous six chapters, one thing kept appearing but we never dug into in depth — **events**.

Chapter 3 said "Agent Loop emits an event at every step to let the UI update in real time". Chapter 5 said "when the tool executes it emits the `tool_execution_start`, `tool_execution_update`, `tool_execution_end` events". In Chapter 6, events everywhere carried `AgentMessage`.

But we never answered: how do events actually get transmitted from inside the Agent to the outside? Who is listening? Why does the Agent "wait" for listeners to finish processing before continuing?

This chapter opens the Agent's "nervous system".

> From this chapter on are the advanced chapters. The first six chapters built a holistic understanding of Pi-Agent's running mechanism; starting from here we dive into engineering topics.

---

## 1. Why do we need an event system?

### An intuition: starting from food delivery tracking

You ordered a delivery on Meituan. After you placed the order, the App pushes you a sequence of status updates: "restaurant accepted" -> "rider picked up" -> "rider 500m away" -> "delivered". Every status update is an **event** — it tells you "something happened". You don't need to keep staring at the rider's position; you only need to take a peek when an event arrives.

Pi-Agent's event system is exactly this idea: during the Agent's run, snapshots of "something happened" are continuously produced — a message started, a message updated, a tool started executing — and these snapshots are then pushed to everyone who cares about them.

### What happens without events?

Suppose you want to add a "tool call log" feature to the Agent: each time a tool is called, print a line `[LOG] called read, args: main.ts`.

**Without an event system**: you have to modify the Agent source code, adding `console.log` before and after `tool.execute()`. Then Pi is updated, and when you merge the upstream code you find conflicts — your added logs collide with new logic upstream. Manually resolving conflicts, next week Pi is updated again, more conflicts...

**With an event system**:

```
session.subscribe((event) => {
    if (event.type === "tool_execution_end") {
        console.log(`[LOG] 调用了 ${event.toolName}，结果：${event.isError ? "失败" : "成功"}`);
    }
});
```


Six lines of code. Not a single line modified in the Agent source. When the Agent updates, you only need `npm update`, and the log logic is unaffected.

This is the most core value of event-driven: **completely separate "what happened" from "who cares about what"**. The Agent only emits events; it neither knows nor cares who is listening.

### Pub-sub vs direct call

In programming terminology, event-driven implements the **pub-sub pattern** (publish-subscribe, đăng-nhận theo kiểu nhà xuất bản-người đăng ký). Compare it to a direct function call:

```
直接调用（打电话）：
  Agent ──调用──→ 终端渲染
       ──调用──→ 文件存储
       ──调用──→ 日志记录
  Agent 需要知道所有消费者的存在，每加一个新功能就要改 Agent

发布-订阅（广播）：
  Agent ──emit事件──→ 📡 事件总线
                          ├──→ 终端渲染（订阅了）
                          ├──→ 文件存储（订阅了）
                          ├──→ 日志记录（订阅了）
                          └──→ （新功能只需订阅，Agent 不需要知道）
```


One sentence: **direct call is "I personally come to you"; pub-sub is "I shouted into the air, whoever hears it, counts"**. In Pi, "shouting into the air" is `emit(event)`, "whoever hears it" is `subscribe(listener)`.

---

## 2. 10 kinds of events, 4 layers of nesting

The Agent core layer defines 10 kinds of `AgentEvent`. Together they form the Agent's complete "pulse":

10 events, 4 layers of nesting

**Diagram caption:** from outside to inside, 4 layers of nesting — Agent (Trace) -> Turn -> Message -> Tool Execution. Each layer is the pair "start -> update (×N) -> end". Note that Turn 2 has no ToolCall, so there is no Layer 4 nesting. The legend at the bottom shows each layer's event count (2+2+3+3 = 10 kinds).

```
export type AgentEvent =
  // 第1层：Agent 生命周期（整个运行）
  | { type: "agent_start" }
  | { type: "agent_end"; messages: AgentMessage[] }

  // 第2层：Turn 生命周期（一轮模型调用 + 工具执行）
  | { type: "turn_start" }
  | { type: "turn_end"; message: AgentMessage; toolResults: ToolResultMessage[] }

  // 第3层：Message 生命周期（一条消息）
  | { type: "message_start"; message: AgentMessage }
  | { type: "message_update"; message: AgentMessage; assistantMessageEvent: AssistantMessageEvent }
  | { type: "message_end"; message: AgentMessage }

  // 第4层：Tool Execution 生命周期（一次工具执行）
  | { type: "tool_execution_start"; toolCallId: string; toolName: string; args: any }
  | { type: "tool_execution_update"; toolCallId: string; toolName: string; args: any; partialResult: any }
  | { type: "tool_execution_end"; toolCallId: string; toolName: string; result: any; isError: boolean };
```


10 kinds sounds like a lot, but the pattern is clear — they are a **4-layer nested lifecycle (vòng đời 4 tầng lồng nhau)**, each layer has the "start -> update -> end" pair:

```
Agent 运行
├── agent_start ───────────────────── Agent 开始
│
├── Turn 1（第3章讲过：一次模型调用 + 它触发的工具执行）
│   ├── turn_start ────────────────── Turn 开始
│   │
│   ├── Message（LLM 的响应）
│   │   ├── message_start
│   │   ├── message_update ×N ────── 流式增量（逐 token 更新）
│   │   └── message_end
│   │
│   ├── Tool Execution（工具执行）
│   │   ├── tool_execution_start
│   │   ├── tool_execution_update ×N  工具进度（如 Bash 的输出）
│   │   └── tool_execution_end
│   │
│   └── turn_end ──────────────────── Turn 结束
│
├── Turn 2 ...
│
└── agent_end ──────────────────────── Agent 结束
```


Recall the concept from Chapter 3: **a Turn = one model call + all the tool executions triggered by that call**. From `turn_start` to `turn_end`, the model is called exactly once.

**Why 4 layers?** Because different consumers care about different granularities. TUI (terminal UI) needs to render text token by token, so it subscribes to `message_update`; the Session manager only cares whether a turn of dialog finished, so it only watches `turn_end`. 4 layers of nesting let each consumer respond at just the right granularity.

---

## 3. emit is not "notification", it's "synchronization barrier"

Now that we have met the 10 kinds of events, let's see how they are emitted. This section contains the most important design decision of Pi's event system.

```
export type AgentEventSink = (event: AgentEvent) => Promise<void> | void;
```


Note the return value — `Promise<void>`. emit can be async.

If you have written Node.js's `EventEmitter`, you know that emit is synchronous and fire-and-forget (phát đi rồi thôi, không chờ) — emit and move on, never mind who's listening. But in Pi's Agent Loop every call to emit carries an `await`:

### Every event emit carries an await

Synchronization barrier vs Fire-and-Forget

**Diagram caption:** horizontal contrast — top arrow: traditional EventEmitter (fire-and-forget), bottom arrow: Pi's `await` barrier (waits for all listeners). The two arrows both reach `next step`, but the lower one waits for all consumers to finish first.

```
await emit({ type: "agent_start" });
await emit({ type: "turn_start" });
await emit({ type: "message_start", ... });
await emit({ type: "message_update", ... });
await emit({ type: "message_end", ... });
```


Every `await` says: **"wait until this event is fully processed, then continue"**.

This is different from traditional pub-sub — where traditionally "I shouted and walked away". Pi refuses to do that: it emits every event, then stands and waits for everyone to finish, only then takes the next step.

Why? We'll explain next.

### processEvents: first update state, then wait for listeners

The implementation of `emit` is the Agent class's `processEvents` method, which does three things:

```
private async processEvents(event: AgentEvent): Promise<void> {
    // 第一步：根据事件类型更新内部状态
    switch (event.type) {
        case "message_start":
            this._state.streamingMessage = event.message;   // 开始追踪流式消息
            break;
        case "message_update":
            this._state.streamingMessage = event.message;   // 更新流式消息内容
            break;
        case "message_end":
            this._state.streamingMessage = undefined;       // 清空临时工位
            this._state.messages.push(event.message);       // 搬入正式档案
            break;
        // ... tool_execution_start/end 更新 pendingToolCalls 等
    }

    // 第二步：拿 AbortSignal
    const signal = this.activeRun?.abortController.signal;

    // 第三步：同步等待所有监听器完成
    for (const listener of this.listeners) {
        await listener(event, signal);   // ← 一个一个等！
    }
}
```


The key is the third step: **Agent awaits every listener in subscription order, one by one**.

You may ask: how is this different from "calling functions in a loop"? The difference is that **Agent's `this.listeners` is an external Set, and it doesn't know who is in it**. Agent is only responsible for "iterate and wait", and who is in the Set, who is not — this is completely controlled from outside via `subscribe()`. There is not a single line of `updateTerminal()` or `appendToFile()` in the Agent's core code — it does not even know the TUI or the file storage exist.

### Why do we insist on await?

Suppose we don't await. See what would happen:

```
假设 emit 是 fire-and-forget（不等待）：

Agent Loop:  emit(start)  emit(update)  emit(end)
                ↓             ↓              ↓
TUI 监听器:   [开始渲染...]  [还没处理完    [三个事件堆在一起了]
                              start...]

问题：TUI 还没处理完 message_start，message_update 就来了。
      UI 可能显示空消息，也可能显示过时的内容——状态不一致。
```




```
实际设计（await，同步屏障）：

Agent Loop:  emit(start)──await──→  emit(update)──await──→  emit(end)──await──→
                ↓                      ↓                       ↓
TUI 监听器:    [处理完毕，返回]       [处理完毕，返回]          [处理完毕，返回]

保证：Agent 在监听器返回前不会发出下一个事件。
```


One-sentence summary: **`await` is not for "notification", it is for "synchronization negotiation"** — ensuring all consumers are caught up before the Agent takes the next step. This is what "synchronization barrier" means.

The cost is performance (must wait for the slowest consumer); the reward is correctness (state is always consistent).

### One exception: tool_execution_update does not wait

If every event must await, what about `tool_execution_update`? During tool execution there might be a lot of progress output (each line output during a Bash execution), wouldn't awaiting every time be too slow?

Indeed Pi has special handling for this kind of high-frequency event — **collect first, then batch-wait**:

```
const updateEvents: Promise<void>[] = [];   // 收集箱
let acceptingUpdates = true;

const result = await tool.execute(id, args, signal, (partialResult) => {
    if (!acceptingUpdates) return;   // 工具已结束，丢弃迟到 update
    // 不 await！先把 emit 的 Promise 收集起来
    updateEvents.push(emit({ type: "tool_execution_update", ... }));
});

acceptingUpdates = false;             // 关闭闸门
await Promise.all(updateEvents);      // 一次性等所有 update 处理完
```


This doesn't contradict the previous rule. **The synchronization barrier rule stays firm, but a carve-out is opened for progress-update-class events**. Progress updates are "high-frequency, low-value, mergeable" — sending one more or one less doesn't affect the final state. Lifecycle events (start/end) are "low-frequency, high-value" — if you miss `message_start`, you lose your chance.

There is one more design detail: the `acceptingUpdates` gate. The tool's `execute` is an `async` function; its internal progress callback may still fire asynchronously after the Promise resolves (leftover timers/delayed callbacks). Without this gate, late `partialResult`s would emit `tool_execution_update` again after `tool_execution_end`, making listeners see the confused sequence "tool has already ended but is still updating".

---

## 4. Error handling: listener exceptions bubble up directly

There is an easy-to-overlook detail in `processEvents`'s listener loop: **no try-catch**.

```
for (const listener of this.listeners) {
    await listener(event, signal);   // 没有 try-catch！
}
```


If some listener throws, the exception bubbles up all the way to `runWithLifecycle`, triggering the entire Agent run failure. **A UI rendering bug can take down the Agent.** Sounds dangerous.

Why no try-catch?

Because Pi's design philosophy is: **a listener erroring -> the run stops -> the problem is immediately visible**. If you silently swallow the exception, the Agent appears to run "normally", but the UI is already messed up — you'll be hunting for the issue during debugging with no way to find it.

It's like a fuse in a circuit — when the fuse blows, you immediately know something is wrong. If every component has its own protection but never reports errors, the entire system appears "normal" but might be half broken.

**Practical recommendation**: if you write your own UI/extension listeners based on Pi, **be sure to try-catch inside the listener yourself** — the Agent does not catch for you.

But there is one exception: **the extension system**. The framework itself does try-catch isolation on third-party extension callbacks, so a single extension crashing won't drag down the entire session. The principle is — for trusted inner-layer listeners (your own code), let exceptions be exposed; for untrusted outer-layer listeners (third-party extensions), the framework isolates them.
---

## 5. What can you do with the event system?

The previous sections talked about the mechanism. After understanding the mechanism, the real question is: **what can you build on top of this event system?**

Here are some representative scenarios:

### Scenario 1: real-time observe what the Agent is doing



```
session.subscribe((event) => {
    if (event.type === "tool_execution_start") {
        console.log(`🔧 ${event.toolName}(${JSON.stringify(event.args).slice(0, 50)})`);
    }
    if (event.type === "tool_execution_end") {
        console.log(`   └─ ${event.isError ? "❌ 失败" : "✅ 成功"}`);
    }
});
```

Pi's TUI is itself an observation panel implemented by subscribing to events. All the terminal output you see comes from event consumption.

### Scenario 2: tool call interception

Through the extension system's `tool_call` event, an extension can return `{ block: true, reason: "destructive operations forbidden in production" }`, and the tool will not be executed. The 3rd step in the five-step pipeline from Chapter 5, `beforeToolCall`, is implemented exactly by this mechanism.

### Scenario 3: context pre-processing

Extensions can modify the message list before the LLM call — inject the current time, Git status, or the previous turn's summary. This is how the `transformContext` hook mentioned in Chapter 6 is implemented.

### Scenario 4: stream forwarding to the Web frontend



```
// 服务端
session.subscribe((event) => {
    if (event.type === "message_update") {
        res.write(`data: ${JSON.stringify({ type: "delta", text: extractText(event.message) })}\n\n`);
    }
    if (event.type === "agent_end") {
        res.end();
    }
});
```

Agent runs on the server, the user accesses it through a browser. Subscribe to the event stream and push it through SSE to the browser — this is the core of Web integration.

### Summary

These scenarios share one common trait: **adding any new feature does not require modifying the Agent core**. You only `subscribe`, and then in the callback you do what you want. The true power of event-driven architecture is not the "notification mechanism", but **the open extension mechanism**.

---

## 6. Case study: tracking the complete journey of a text_delta

Stringing together what we've learned, let's trace a `text_delta` event — from the first character returned by the LLM to your terminal screen.

The complete cross-layer journey of a text_delta

**Diagram caption:** 5-layer data flow — LLM SSE -> AI-layer EventStream.push -> Agent Loop converts to `message_update` -> `Agent.processEvents` synchronization barrier -> TUI listener writes terminal. Each layer only cares about its own conversion.

Suppose the LLM is generating the two characters "hello". A single 'h' character, from creation to display, goes through 5 steps:

```
触发端：LLM SSE 网络流
  │  data: {"type":"text_delta","delta":"你",...}
  │
  ▼ 中转1：AI 层 EventStream.push()
  │  异步队列，AssistantMessageEvent { type: "text_delta", delta: "你" }
  │  （第4章讲过的12种事件之一）
  │
  ▼ 中转2：Agent Loop 事件转换
  │  AI 层 text_delta → Agent 层 message_update
  │  原始事件通过 assistantMessageEvent 字段透传
  │
  ▼ 中转3：Agent.processEvents()（同步屏障）
  │  更新 streamingMessage 内部状态
  │  await 所有 listeners
  │
  ▼ 中转4：AgentSession._handleAgentEvent()
  │  通知扩展系统 → 分发给 Session 监听器 → 持久化
  │
  ▼ 终点：TUI 监听器
  │  提取 delta "你" → 渲染到终端
  │
  ▼
你看到了 "你" 字出现
```


Throughout this chain, each layer only cares about its own thing: the AI layer only parses SSE and builds messages; Agent Loop only emits events and handles tools; Agent only updates state and awaits listeners; Session only dispatches and persists; TUI only renders. **No layer directly calls the internal methods of another layer — the only communication protocol between them is "events"**.

There is one key data transformation worth noting: **the AI layer's many delta events (`text_delta`, `thinking_delta`, `toolcall_delta`) are uniformly mapped to the Agent layer's `message_update`**. The AI layer's raw events are attached to `message_update` via the `assistantMessageEvent` field and passed through transparently. Agent Loop doesn't care about the specific type of delta — it only knows "the message updated". But consumers might care, so the raw events are preserved rather than discarded.

---

## 7. What the Session layer extends

The previous six sections talked about the Agent core's event system — 10 kinds of events. But Pi has more than the Agent layer; above it is an `AgentSession` (product-session layer).

`AgentSession` has to handle far more things than the Agent core: context compaction, auto-retry, queue state management... These concepts don't exist in the Agent core. Just like you don't find "Bluetooth connected" notifications in the Linux kernel — the kernel only handles process scheduling and memory management; Bluetooth is the upper layer's job.

### Kernel 10 + Session 7

`AgentSession` extends events via a union type:

```
AgentSessionEvent =
    基础 10 种（agent_end 被重载，增加 willRetry 字段）
  + Session 新增 7 种：
      queue_update           ← steering/followUp 队列变化
      compaction_start/end   ← 上下文压缩（第9章详讲）
      auto_retry_start/end   ← LLM 调用失败自动重试
      session_info_changed   ← 会话名称变更
      thinking_level_changed ← 思考深度切换
```


These events only have to do with "product-level experience", and nothing to do with "Agent core logic". So they are placed in the Session layer rather than the Agent layer.

**This is the "two-layer events" design idea: the kernel only handles kernel things (lifecycle), the product extends above on demand (user experience)**. The judgment criterion is simple: if the kernel can still run normally after removing some event, that event belongs to the outer layer.

---

## 8. Summary: three design decisions

### Decision 1: synchronization barrier

`processEvents` awaits every listener, not fire-and-forget. Ensures consumers always see consistent state. The cost is performance, but the "collect first then batch-wait" strategy for `tool_execution_update` alleviates the performance issue for high-frequency events.

### Decision 2: expose exceptions directly

The listener loop has no try-catch. Listener errors -> run failure -> problems immediately visible. For trusted inner-layer listeners (your own code) no protection; for untrusted outer-layer listeners (third-party extensions) the framework isolates.

### Decision 3: two-layer events

The Agent core only defines 10 kinds of events across the 4 lifecycle layers. The Session layer extends 7 product-level events via union type. If the kernel can still run normally after removing some event, it belongs to the outer layer.

---

## 9. Next stop

This chapter we saw that the event system completely decouples the Agent from the outside world — UI, logs, persistence, extensions — all work by subscribing to events.

But there is one mechanism closely related to events that we only mentioned in passing: **`transformContext`**. Chapter 6 talked about the message system and said it executes before `convertToLlm`, in charge of trimming old messages and injecting external context. When the conversation gets longer and longer, messages get more and more, eventually exceeding the model's context window. At this point `transformContext` needs to do one more aggressive thing — **compact the dialog history**.

The next two chapters we open Pi's full context engineering picture. Chapter 8 first talks about the overall view — from input-side tool output truncation, system prompt assembly, to history-side Compaction and branch summaries, letting you see the defenses Pi deploys at multiple stages; Chapter 9 then dives into the most core compression algorithm (Compaction), seeing how Pi compresses 50 turns of dialog into a structured summary when the context window is almost full, letting the Agent continue to "remember" what happened before.

---

> **Key source index for this chapter**:
>
> `packages/agent/src/types.ts:413-428` — definition of 10 kinds of `AgentEvent`
> `packages/agent/src/agent-loop.ts:25` — `AgentEventSink` type (emit signature)
> `packages/agent/src/agent.ts:509-556` — `processEvents` (synchronization barrier implementation)
> `packages/agent/src/agent.ts:168,231-233` — `subscribe` and `listeners`
> `packages/agent/src/agent-loop.ts:628-669` — `executePreparedToolCall` (update special handling)
> `packages/coding-agent/src/core/agent-session.ts:126-150` — `AgentSessionEvent` (17 kinds of events)
