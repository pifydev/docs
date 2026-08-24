---
title: "Chương 3: Vòng lặp Agent"
description: Cách Pi biến một prompt thành các model turn, batch Tool, chỉ dẫn trong hàng chờ và một run đã settle.
translation_key: ch03-agent-loop
language: vi
chapter: 3
source_url: "https://www.dgzhuya.com/modules/ch03-agent-loop"
official_refs:
  - "https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/agent/src/agent-loop.ts"
  - "https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/agent/src/agent.ts"
  - "https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/agent/src/types.ts"
terms_used:
  - Agent Loop
  - Trace
  - Turn
  - Tool
  - Event
  - Steering
  - Follow-up
status: reviewed
last_updated: "2026-08-24"
translator: Pify maintainers
reviewed_by: Pify maintainers
---

Chương 2 đã tách model transport, Agent runtime và sản phẩm coding. Agent Loop là phần chuyển động bên trong kiến trúc đó. Chương này bắt đầu từ lý do cần vòng lặp, rồi theo một message qua Pi 0.84.2: chuẩn bị context, streaming, thực thi Tool, chỉ dẫn trong hàng chờ, termination, event và thời điểm run settle hoàn toàn.

## 1. Mở đầu: ba cách dùng LLM

Mức quyền quyết định được giao cho model phân biệt direct call, Workflow và Agent Loop. Cả ba có thể dùng cùng provider và model; control flow của chúng khác nhau.

### Kiểu 1: gọi trực tiếp, “model, hãy trả lời”

Direct call gửi một context đã chuẩn bị và nhận một response:

```text
user input -> dựng Context -> models.streamSimple() -> AssistantMessage hoàn chỉnh
```

Entry point Pi AI hiện tại là một collection `Models`. Ví dụ đầy đủ này đăng ký một provider rồi gọi model một lần:

```typescript
import { createModels, type Context } from "@earendil-works/pi-ai";
import { anthropicProvider } from "@earendil-works/pi-ai/providers/anthropic";

const models = createModels();
models.setProvider(anthropicProvider());

const model = models.getModel("anthropic", "claude-sonnet-4-6");
if (!model) throw new Error("Model not found");

const context: Context = {
  systemPrompt: "You are a translation assistant.",
  messages: [
    {
      role: "user",
      content: "Translate this TypeScript function into Python.",
      timestamp: Date.now(),
    },
  ],
};

const stream = models.streamSimple(model, context);
const response = await stream.result();
console.log(response.content);
```

Việc chính của ứng dụng là dựng prompt và xử lý response. Dịch, extraction, classification và câu hỏi có phạm vi hẹp thường phù hợp với cách này.

### Kiểu 2: Workflow, “làm theo các bước do ứng dụng định sẵn”

Workflow gọi model nhiều lần, nhưng code ứng dụng cố định thứ tự và quyết định một bước đã đạt yêu cầu hay chưa:

```text
input
  -> model: trích yêu cầu
  -> code: kiểm tra các field bắt buộc
  -> model: viết bản thay đổi
  -> code: chạy test
  -> model: giải thích lỗi hoặc viết summary
```

Model đưa ra phán đoán bên trong từng stage. Ứng dụng sở hữu state machine. Pipeline tài liệu, RAG, review gate và approval flow lặp lại được thường cần tính dự đoán đó.

### Kiểu 3: Agent Loop, “tự chọn thao tác tiếp theo”

Agent cung cấp một tập Tool và để mỗi assistant response chọn thao tác kế tiếp:

```text
user: "Giải thích vì sao test này fail"
  -> model yêu cầu read(test file)
  -> ứng dụng chạy read và thêm ToolResultMessage
  -> model yêu cầu grep(symbol)
  -> ứng dụng chạy grep và thêm ToolResultMessage
  -> model trả lời mà không có ToolCall
  -> run chạm một boundary ổn định
```

Ứng dụng vẫn kiểm soát Tool nào được cung cấp, permission, validation, stop hook, queue và error policy. Model chỉ chọn trong các thao tác đã được cho phép. Pi lặp lại model turn và Tool turn cho tới một exit boundary tường minh.

Sự phân quyền này có tác dụng trực tiếp. Model không thể chạy một function bất kỳ chỉ bằng cách gọi tên nó: Agent Core resolve tên trong `AgentContext.tools`, normalize và validate argument, rồi có thể block call trước khi code sản phẩm chạy. Model cũng không thể giữ process sống chỉ bằng một câu “hãy tiếp tục”. Turn kế tiếp cần một Tool batch, steering message hoặc follow-up message được runtime chấp nhận.

| Chiều so sánh          | Direct call                | Workflow                         | Agent Loop                              |
| ---------------------- | -------------------------- | -------------------------------- | --------------------------------------- |
| Ai chọn bước tiếp theo | Caller                     | State machine của ứng dụng       | Model output trong các rule của runtime |
| Số model call          | Thường là một              | Biết trước hoặc bị code giới hạn | Phụ thuộc Tool request và queue         |
| Việc thiết kế chính    | Context và output handling | Stage, transition và validation  | Tool, loop policy, event và termination |
| Vai trò của model      | Tạo câu trả lời            | Chuyên gia bên trong một stage   | Chọn trong các thao tác được cho phép   |
| Trường hợp phù hợp     | Dịch hoặc extraction       | RAG hoặc review pipeline         | Coding assistant hoặc automation mở     |

## 2. Hai khái niệm đầu tiên: Trace và Turn

Tên event public của Pi làm rõ sự khác biệt. Một run nằm giữa `agent_start` và `agent_end`. Một Turn nằm giữa `turn_start` và `turn_end`.

### Trace: một run hoàn chỉnh

Chương này dùng Trace để chỉ toàn bộ run do một lần gọi `Agent.prompt()` hoặc `Agent.continue()` khởi động. “Trace” là thuật ngữ giảng giải ở đây, không phải type được Pi export.

```text
Trace
├─ agent_start
├─ Turn 1: assistant yêu cầu read + grep; cả hai Tool settle
├─ Turn 2: assistant yêu cầu edit; Tool settle
├─ Turn 3: assistant trả lời mà không có ToolCall
└─ agent_end
```

Trace cũng có thể kết thúc sau một Turn, khi provider gặp hard failure, sau `shouldStopAfterTurn` hoặc tại deferred-response boundary. Các subscriber được `Agent` await vẫn thuộc quá trình settlement dù event `agent_end` đã được phát.

### Turn: một assistant response cùng Tool batch của nó

Một Turn chứa đúng một assistant model response và mọi Tool call mà Pi chấp nhận từ response đó. Ba Tool call chạy parallel vẫn nằm trong một Turn:

```text
turn_start
  -> một lần gọi streamFn(model, context, options)
  -> một AssistantMessage hoàn chỉnh
  -> không hoặc nhiều Tool execution từ message đó
  -> không hoặc nhiều ToolResultMessage
turn_end
```

Model call tiếp theo mở Turn khác. User prompt đầu tiên được phát bên trong Turn đầu, trước khi assistant streaming bắt đầu. Steering và follow-up message cũng được phát khi vòng lặp inject chúng trước một assistant response sau đó.

`turn_end.toolResults` chứa các Tool result message đã finalize cho assistant response ấy. Turn không có call mang một array rỗng. Response có nhiều call vẫn chỉ phát một `turn_end` sau khi cả batch settle; Pi không đóng rồi mở lại Turn quanh từng Tool. Boundary này cho session persistence và telemetry một đơn vị ổn định mà vẫn giữ event tiến độ chi tiết của từng Tool.

### Quan hệ giữa Trace và Turn

```text
một Trace
│
├─ Turn 1
│  ├─ AssistantMessage: ToolCall(read), ToolCall(grep)
│  └─ ToolResultMessage(read), ToolResultMessage(grep)
│
├─ Turn 2
│  ├─ AssistantMessage: ToolCall(edit)
│  └─ ToolResultMessage(edit)
│
└─ Turn 3
   └─ AssistantMessage: text, không có ToolCall
```

Phân biệt này tránh hai lỗi đếm phổ biến: coi từng Tool trong một parallel batch là một Turn, hoặc coi cả prompt nhiều Turn là một Turn duy nhất.

## 3. Toàn cảnh: hành trình message và vòng lặp

### Hành trình đầy đủ

Đường đi đầy đủ của `agent.prompt("Read src/main.ts and explain it")` là:

```text
string input
  -> UserMessage đã normalize
  -> agent_start, turn_start, user message_start/message_end
  -> transformContext(AgentMessage[])
  -> convertToLlm(AgentMessage[]) -> Message[]
  -> streamFn(model, Context, options)
  -> assistant message_start/message_update*/message_end
  -> chọn ToolCall block từ AssistantMessage.content
  -> Tool preflight và execution
  -> event ToolResultMessage và append transcript
  -> turn_end
  -> prepareNextTurn
  -> shouldStopAfterTurn
  -> drain steering queue
  -> Turn khác, outer loop follow-up hoặc agent_end
```

Trong một Tool turn bình thường, transcript tăng theo thứ tự hội thoại. Artifact này chỉ hiển thị các field được chọn, không phải protocol object đầy đủ:

```json
[
  { "role": "user", "content": "Read src/main.ts" },
  {
    "role": "assistant",
    "content": [{ "type": "toolCall", "id": "call_1", "name": "read" }]
  },
  {
    "role": "toolResult",
    "toolCallId": "call_1",
    "toolName": "read",
    "isError": false
  }
]
```

`AgentState.streamingMessage` expose assistant message tạm thời trong lúc nó được dựng. `AgentState.pendingToolCalls` theo dõi Tool call ID giữa `tool_execution_start` và `tool_execution_end`. Message hoàn chỉnh đi vào `AgentState.messages` tại `message_end`.

Vòng lặp còn giữ `newMessages`, một collector cục bộ của run được raw stream trả về và gắn vào `agent_end`. Với prompt run, collector bắt đầu bằng input message; với continuation run, nó bắt đầu rỗng. Sau đó nó nhận assistant output, Tool result và queue message đã inject. Vì vậy session bên ngoài có thể phân biệt context cũ với artifact sinh trong invocation hiện tại khi quyết định lưu hay render gì.

### Điều gì làm vòng lặp chạy tiếp, và điều gì kết thúc nó

Implementation cũ dễ bị tóm tắt quá mức thành “kiểm tra `stopReason`”. Pi 0.84.2 dùng nhiều mảnh state:

```text
assistant response
  ├─ error / aborted ------------------------------> hard exit
  ├─ ToolCall block -------------------------------> Tool batch
  │    ├─ batch không terminate -------------------> tự động mở Turn tiếp
  │    └─ mọi result terminate=true ---------------> không tự tiếp tục vì Tool
  ├─ shouldStopAfterTurn=true ---------------------> graceful exit trước queue
  ├─ steering message -----------------------------> Turn tiếp trong inner loop
  ├─ follow-up message tại boundary ổn định -------> mở lại inner loop
  └─ không có điều kiện trên ----------------------> agent_end
```

`StopReason` vẫn ghi lại lý do provider streaming kết thúc:

| Final reason        | Cách Agent Core xử lý                                                                     |
| ------------------- | ----------------------------------------------------------------------------------------- |
| `toolUse`           | Thực thi `ToolCall` block thật trong content; label này một mình không làm loop tiếp tục  |
| `stop`              | Khi không có Tool call, đi tới queue check và có thể thoát bình thường                    |
| `length`            | Không chạy Tool call từ response bị cắt; phát error result cho từng call để model gọi lại |
| `deferred`          | Đi qua post-Turn path không có Tool bình thường; loop không poll `DeferredHandle`         |
| `error` / `aborted` | Phát `turn_end` và `agent_end` ngay, bỏ qua turn hook cùng cả hai queue                   |

`pending` là giá trị khởi tạo hoặc tạm thời khi một số provider stream còn chạy. Nó không phải final reason thành công của event `done`. Final message có `deferred` mang một `DeferredHandle`; host phải fetch hoặc cancel qua `Models.fetchDeferred()` hay `Models.cancelDeferred()` bên ngoài Agent Loop này.

Vì vậy báo cáo termination phải nêu cả provider result lẫn runtime state. “Model trả về `stop`” chưa đủ nếu steering instruction đã nằm trong queue. “Một Tool trả `terminate: true`” chưa đủ nếu result khác trong cùng batch không trả. “Stream đã kết thúc” chưa đủ khi final message là deferred và host vẫn phải xử lý nó. Điều kiện hoàn tất quan sát được thuộc về toàn bộ run, không thuộc một field trên một message.

### Một rule dẫn dắt automatic continuation

Quyết định cốt lõi dựa vào content và state của Tool đã finalize, không dựa vào một string:

```typescript
// Abridged from packages/agent/src/agent-loop.ts at a470b121.
const toolCalls = message.content.filter((part) => part.type === "toolCall");
hasMoreToolCalls = false;

if (toolCalls.length > 0) {
  const batch =
    message.stopReason === "length"
      ? await failToolCallsFromTruncatedMessage(toolCalls, emit)
      : await executeToolCalls(currentContext, message, config, signal, emit);

  hasMoreToolCalls = !batch.terminate;
}
```

Reason `toolUse` mà không có `ToolCall` block không ép mở Turn khác. Ngược lại, Tool block hợp lệ điều khiển execution trong khi runtime vẫn phải xử lý riêng `length`, abort, hook và queue. Sau Tool execution, batch termination chỉ tắt automatic Tool continuation; steering hoặc follow-up vẫn có thể nối dài run.

### Vòng lặp tối thiểu: mẫu số chung

Có thể dạy Agent loop nhỏ nhất mà chưa cần hook riêng của Pi. Đoạn sau là pseudocode, không phải API để copy:

```typescript
// Pseudocode
while (true) {
  const assistant = await callModel(messages, tools);
  messages.push(assistant);

  const calls = getCompleteToolCalls(assistant);
  if (calls.length === 0) break;

  const results = await executeAllowedTools(calls);
  messages.push(...results);
}
```

Đó là nhịp ReAct: model reason thành một action, ứng dụng observe action bằng cách chạy Tool, rồi observation quay lại dưới dạng Tool result. Code production cần thêm cancellation, validation, event ordering, queue policy, custom message và settlement guarantee.

### Mọi đường thoát

| Đường thoát                  | Trigger                                                       | Cách xử lý queue                                                                                                     |
| ---------------------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Boundary ổn định bình thường | Không còn Tool continuation và queue message                  | Phát `agent_end`                                                                                                     |
| Hint terminate của batch     | Mọi Tool result đã finalize có `terminate: true`              | Bỏ automatic Tool continuation, sau đó vẫn kiểm tra steering và follow-up                                            |
| Graceful stop bằng hook      | `shouldStopAfterTurn` trả `true`                              | Thoát trước khi poll steering và follow-up                                                                           |
| Provider hard stop           | Final reason là `error` hoặc `aborted`                        | Bỏ `prepareNextTurn`, stop hook và queue                                                                             |
| Deferred boundary            | Final reason là `deferred` và không có Tool call              | Chạy hook; nếu stop hook falsy, poll steering rồi chỉ poll follow-up tại boundary ổn định; host xử lý DeferredHandle |
| Callback/runtime throw       | Transform, conversion hoặc hook “không được throw” lại reject | Raw low-level sequence không còn được bảo đảm; `Agent` bắt run failure và phát một failure turn tổng hợp             |

Với message `deferred` không có Tool, “không poll” chỉ nói về `DeferredHandle`. Loop vẫn phát `turn_end`, chạy `prepareNextTurn`, áp dụng update của hook rồi chạy `shouldStopAfterTurn`. Nếu hook này trả truthy, loop phát `agent_end` và return trước khi poll cả hai queue. Chỉ kết quả falsy mới cho phép poll steering; nếu steering không mở lại inner loop, loop mới poll follow-up tại boundary ổn định. Chỉ host mới fetch hoặc cancel deferred operation.

`Agent.abort()` signal provider request và Tool callback đang hoạt động. Cancellation phía provider thường thành một assistant message `aborted`. Nếu signal đến trong Tool processing, Tool đã start nhận signal; sequential preparation dừng sau khi quan sát abort, còn provider boundary tiếp theo nhận signal đã aborted. Tool phải tôn trọng signal thì cancellation mới kịp thời.

## 4. Đi qua source: loop nền và lớp của coding-agent

Loop tái sử dụng hiện nằm trong `@earendil-works/pi-agent-core`. Sản phẩm coding không duy trì một loop private khác. Nó dựng `Agent`, cung cấp wrapper `StreamFn`, convert message riêng của coding, refresh model/system prompt/Tool giữa các Turn, map terminal input thành steering hoặc follow-up, rồi lưu state được phát qua event.

Kernel khái niệm vẫn ngắn:

```typescript
// Pseudocode: conceptual kernel only.
for (;;) {
  const assistant = await streamAssistant(context);
  const batch = await executeCompleteToolCalls(assistant);
  if (!batch.needsAnotherModelTurn) break;
}
```

### Coding Agent phủ thêm những gì

| Nhu cầu sản phẩm                         | Cơ chế tái sử dụng của Agent Core    | Policy của Coding Agent                                              |
| ---------------------------------------- | ------------------------------------ | -------------------------------------------------------------------- |
| Terminal input đến trong lúc run         | `steer()` và steering queue mode     | Interactive/RPC input chọn steering                                  |
| Một task phải đợi task hiện tại settle   | `followUp()` và outer queue check    | UI và RPC expose follow-up command                                   |
| Extension sửa context model nhìn thấy    | `transformContext` và `convertToLlm` | Extension context event, custom message conversion, image blocking   |
| Setting hoặc Extension đổi giữa các Turn | `prepareNextTurnWithContext`         | Refresh system prompt, Tool, model và thinking level                 |
| Provider retry, header và timeout        | `StreamFn` được inject               | Wrapper `ModelRuntime.streamSimple()` và provider hook của Extension |
| Session/UI update                        | Typed `AgentEvent` stream            | Persistence, render, compaction và queue display của `AgentSession`  |

Đây là một correction so với source tour cũ: steering, follow-up, turn hook và parallel Tool scheduling là tính năng Agent Core tại revision đã pin. Coding Agent đưa product policy vào qua các extension point đó.

### 4.1 Entry: `Agent`, `agentLoop()` và `agentLoopContinue()`

Phần lớn ứng dụng nên đi qua `Agent`. Model stream function hiện tại phải được bind với instance `Models` của nó:

```typescript
import { Agent } from "@earendil-works/pi-agent-core";
import { createModels } from "@earendil-works/pi-ai";
import { anthropicProvider } from "@earendil-works/pi-ai/providers/anthropic";

const models = createModels();
models.setProvider(anthropicProvider());
const model = models.getModel("anthropic", "claude-sonnet-4-6");
if (!model) throw new Error("Model not found");

const agent = new Agent({
  initialState: {
    systemPrompt: "Inspect code before making a claim.",
    model,
    tools: [],
  },
  streamFn: models.streamSimple.bind(models),
});

await agent.prompt("Explain the build scripts in package.json.");
```

Hai low-level function được export trả về `EventStream<AgentEvent, AgentMessage[]>`:

```typescript
function agentLoop(
  prompts: AgentMessage[],
  context: AgentContext,
  config: AgentLoopConfig,
  signal: AbortSignal | undefined,
  streamFn: StreamFn,
): EventStream<AgentEvent, AgentMessage[]>;
```

```typescript
function agentLoopContinue(
  context: AgentContext,
  config: AgentLoopConfig,
  signal: AbortSignal | undefined,
  streamFn: StreamFn,
): EventStream<AgentEvent, AgentMessage[]>;
```

| Entry                 | Có thêm prompt message | Ai sở hữu state/queue bền vững | Barrier cho event consumer           |
| --------------------- | ---------------------- | ------------------------------ | ------------------------------------ |
| `Agent.prompt()`      | Có                     | `Agent`                        | Await subscriber theo thứ tự đăng ký |
| `agentLoop()`         | Có                     | Caller sở hữu message trả về   | Raw stream chỉ để quan sát           |
| `agentLoopContinue()` | Không                  | Caller cung cấp context có sẵn | Raw stream chỉ để quan sát           |

`agentLoopContinue()` yêu cầu context không rỗng và message cuối không phải assistant message. Sau `convertToLlm`, tail phía provider phải là `user` hoặc `toolResult`. Path này dành cho một continuation đã được chuẩn bị; nó không tự tạo retry prompt.

Low-level caller còn phải tự sở hữu transcript persistence. `agentLoop()` tạo working message array và trả artifact sinh trong invocation qua `stream.result()`; `AgentContext` truyền vào không thay thế cho một `Agent` có state. Caller muốn chạy low-level lần độc lập khác phải tự merge result vào context của mình. Vì thế wrapper `Agent` là default an toàn hơn.

Low-level prompt input có shape `AgentMessage` bình thường:

```typescript
const prompts: AgentMessage[] = [
  {
    role: "user",
    content: "Inspect package.json.",
    timestamp: Date.now(),
  },
];
```

Loop nhận một context snapshot:

```typescript
const context: AgentContext = {
  systemPrompt: "Be precise.",
  messages: [],
  tools: [],
};
```

Behavior của nó đến từ callback và stream option:

```typescript
const config: AgentLoopConfig = {
  model,
  convertToLlm: (messages) =>
    messages.filter(
      (message) =>
        message.role === "user" ||
        message.role === "assistant" ||
        message.role === "toolResult",
    ),
  toolExecution: "parallel",
};
```

`Agent` public tạo snapshot của system prompt, message và Tool, chạy `runAgentLoop` hoặc `runAgentLoopContinue`, rồi reduce event ngược về `AgentState` đang live.

### 4.2 Bộ xương `runLoop()`: lõi trước, lớp ngoài sau

#### Lõi: inner loop

Điều kiện inner loop ở revision đã pin gồm cả automatic Tool continuation và message được inject:

```typescript
// Faithfully abridged from packages/agent/src/agent-loop.ts.
while (hasMoreToolCalls || pendingMessages.length > 0) {
  if (pendingMessages.length > 0) {
    for (const pendingMessage of pendingMessages) {
      await emit({ type: "message_start", message: pendingMessage });
      await emit({ type: "message_end", message: pendingMessage });
      currentContext.messages.push(pendingMessage);
      newMessages.push(pendingMessage);
    }
    pendingMessages = [];
  }

  const message = await streamAssistantResponse(
    currentContext,
    config,
    signal,
    emit,
    streamFunction,
  );
  newMessages.push(message);

  if (message.stopReason === "error" || message.stopReason === "aborted") {
    await emit({ type: "turn_end", message, toolResults: [] });
    await emit({ type: "agent_end", messages: newMessages });
    return;
  }

  const toolCalls = message.content.filter((part) => part.type === "toolCall");
  const toolResults: ToolResultMessage[] = [];
  hasMoreToolCalls = false;
  if (toolCalls.length > 0) {
    const executedToolBatch =
      message.stopReason === "length"
        ? await failToolCallsFromTruncatedMessage(toolCalls, emit)
        : await executeToolCalls(currentContext, message, config, signal, emit);
    toolResults.push(...executedToolBatch.messages);
    hasMoreToolCalls = !executedToolBatch.terminate;
    for (const result of toolResults) {
      currentContext.messages.push(result);
      newMessages.push(result);
    }
  }

  await emit({ type: "turn_end", message, toolResults });
  const nextTurnSnapshot = await config.prepareNextTurn?.({
    message,
    toolResults,
    context: currentContext,
    newMessages,
  });
  if (nextTurnSnapshot) {
    currentContext = nextTurnSnapshot.context ?? currentContext;
    config = {
      ...config,
      model: nextTurnSnapshot.model ?? config.model,
      reasoning:
        nextTurnSnapshot.thinkingLevel === undefined
          ? config.reasoning
          : nextTurnSnapshot.thinkingLevel === "off"
            ? undefined
            : nextTurnSnapshot.thinkingLevel,
    };
  }

  if (
    await config.shouldStopAfterTurn?.({
      message,
      toolResults,
      context: currentContext,
      newMessages,
    })
  ) {
    await emit({ type: "agent_end", messages: newMessages });
    return;
  }

  pendingMessages = (await config.getSteeringMessages?.()) || [];
}
```

`hasMoreToolCalls` bắt đầu bằng `true` để assistant response đầu tiên chạy dù không có pending message. Mỗi iteration tiếp theo ứng với một Turn mới. Bản rút gọn chỉ bỏ bookkeeping `turn_start`; mọi symbol được gọi trong đoạn trên đều tồn tại trong file đã pin.

#### Lớp ngoài: queue shell và stateful wrapper

Có hai shell quanh kernel:

```text
Agent wrapper
  ├─ public state có thể thay đổi
  ├─ subscriber được await
  ├─ AbortController và settlement promise
  └─ object steering/follow-up queue
       |
       └─ runLoop outer while(true)
            ├─ inner while(Tool continuation || pending message)
            └─ khi inner dừng: drain follow-up queue hoặc break
```

Outer `while (true)` không phải một model algorithm khác. Nó chỉ mở lại inner loop khi follow-up message tồn tại đúng lúc Agent sắp dừng.

### 4.3 Inject steering

Ứng dụng enqueue một `AgentMessage` hoàn chỉnh:

```typescript
agent.steer({
  role: "user",
  content: "Read the test fixture instead of production data.",
  timestamp: Date.now(),
});
```

Queue không ngắt provider stream đang hoạt động hoặc Tool đang chạy. Agent Core poll steering một lần trước inner-loop iteration đầu tiên và một lần sau mỗi Turn hoàn chỉnh, sau `prepareNextTurn` và `shouldStopAfterTurn`:

```typescript
if (pendingMessages.length > 0) {
  for (const message of pendingMessages) {
    await emit({ type: "message_start", message });
    await emit({ type: "message_end", message });
    currentContext.messages.push(message);
    newMessages.push(message);
  }
  pendingMessages = [];
}
```

`one-at-a-time` drain message cũ nhất ở mỗi poll. `all` drain cả queue. Vì queue được poll tại Turn boundary, “steering” có nghĩa là ưu tiên Turn kế tiếp, không phải preempt giữa lúc Tool chạy.

### 4.4 `streamAssistantResponse()`: boundary của model

#### Pha A: transform Agent context

Hook đầu tiên làm việc hoàn toàn trong domain application message giàu thông tin hơn:

```typescript
let messages = context.messages;
if (config.transformContext) {
  messages = await config.transformContext(messages, signal);
}
```

Coding Agent dùng stage này để Extension transform context. Compaction hoặc retrieval cũng có thể trả một `AgentMessage[]` khác. Contract quy định hook không được throw; khi thất bại, nó phải trả message ban đầu hoặc một fallback an toàn.

```text
AgentMessage[] bền vững
  -> transformContext()
  -> AgentMessage[] dành riêng cho Turn
```

Array trả về chỉ chuẩn bị một request. Nó không thay transcript bền vững trừ khi application policy chủ động cập nhật state ở bước riêng.

#### Pha B: convert `AgentMessage` thành `Message`

`convertToLlm` là bước bắt buộc tại low-level boundary:

```typescript
const llmMessages = await config.convertToLlm(messages);
```

Converter mặc định của `Agent` giữ role `user`, `assistant` và `toolResult`. Coding Agent còn map `bashExecution`, `custom`, `branchSummary` và `compactionSummary` thành user message; Bash message bị đánh dấu exclude sẽ bị lọc:

```typescript
// Faithfully abridged from packages/coding-agent/src/core/messages.ts.
switch (m.role) {
  case "bashExecution":
    if (m.excludeFromContext) return undefined;
    return {
      role: "user",
      content: [{ type: "text", text: bashExecutionToText(m) }],
      timestamp: m.timestamp,
    };
  case "custom": {
    const content =
      typeof m.content === "string"
        ? [{ type: "text" as const, text: m.content }]
        : m.content;
    return { role: "user", content, timestamp: m.timestamp };
  }
  case "branchSummary":
    return {
      role: "user",
      content: [
        {
          type: "text" as const,
          text: BRANCH_SUMMARY_PREFIX + m.summary + BRANCH_SUMMARY_SUFFIX,
        },
      ],
      timestamp: m.timestamp,
    };
  case "compactionSummary":
    return {
      role: "user",
      content: [
        {
          type: "text" as const,
          text:
            COMPACTION_SUMMARY_PREFIX + m.summary + COMPACTION_SUMMARY_SUFFIX,
        },
      ],
      timestamp: m.timestamp,
    };
  case "user":
  case "assistant":
  case "toolResult":
    return m;
}
```

`bashExecutionToText()` cùng hai cặp hằng prefix/suffix cho summary được khai báo trong chính file đã pin. Đoạn trích giữ đủ bốn nhánh role riêng của coding thay vì dùng helper chuyển đổi không tồn tại.

Type transition này cố ý làm mất thông tin:

```text
AgentMessage[]                           Message[]
├─ user ------------------------------> user
├─ assistant -------------------------> assistant
├─ toolResult ------------------------> toolResult
├─ compactionSummary -----------------> user summary
├─ bashExecution(excluded) -----------> bị loại
└─ custom ----------------------------> user content
```

Provider adapter không cần hiểu message type của storage hoặc UI trong Coding Agent.

Thứ tự hai hook là một phần của contract. `transformContext` có thể xử lý application-only type trước khi dữ liệu bị loại. Sau đó `convertToLlm` mới projection lần cuối sang provider union. Nếu đảo thứ tự, compaction hoặc Extension logic sẽ không thấy message không được gửi thẳng cho model nhưng vẫn mang state hữu ích của ứng dụng.

#### Pha C: dựng `Context` và gọi model đã chọn

Loop tạo một provider-facing wrapper mới cho mỗi Turn:

```typescript
// Faithfully abridged from packages/agent/src/agent-loop.ts at a470b121.
const llmContext: Context = {
  systemPrompt: context.systemPrompt,
  messages: llmMessages,
  tools: context.tools,
};
```

Nó resolve API key hiện hành rồi gọi function đã inject:

```typescript
// Faithfully abridged from packages/agent/src/agent-loop.ts at a470b121.
const response = await streamFunction(config.model, llmContext, {
  ...config,
  apiKey: resolvedApiKey,
  signal,
});
```

Với ứng dụng Agent Core thông thường, hãy truyền method của model collection hiện tại kèm receiver:

```typescript
const streamFn = models.streamSimple.bind(models);
```

Coding Agent bọc cùng contract thay vì truyền `Models` trực tiếp:

```typescript
// Faithfully abridged from packages/coding-agent/src/core/sdk.ts.
streamFn: async (model, context, options) => {
  const providerRetrySettings = settingsManager.getProviderRetrySettings();
  const httpIdleTimeoutMs = settingsManager.getHttpIdleTimeoutMs();
  const effectiveTimeoutMs =
    httpIdleTimeoutMs === 0 ? 2147483647 : httpIdleTimeoutMs;
  const timeoutMs =
    options?.timeoutMs ?? providerRetrySettings.timeoutMs ?? effectiveTimeoutMs;
  const websocketConnectTimeoutMs =
    options?.websocketConnectTimeoutMs ??
    settingsManager.getWebSocketConnectTimeoutMs();
  const headerRunner = extensionRunnerRef.current;

  return modelRuntime.streamSimple(model, context, {
    ...options,
    timeoutMs,
    websocketConnectTimeoutMs,
    maxRetries: options?.maxRetries ?? providerRetrySettings.maxRetries,
    maxRetryDelayMs:
      options?.maxRetryDelayMs ?? providerRetrySettings.maxRetryDelayMs,
    transformHeaders: async (requestHeaders) => {
      const headers = mergeProviderAttributionHeaders(
        model,
        settingsManager,
        options?.sessionId,
        requestHeaders,
      );
      return headerRunner?.hasHandlers("before_provider_headers")
        ? headerRunner.emitBeforeProviderHeaders(headers ?? {})
        : (headers ?? {});
    },
  });
},
```

Scope bao quanh trong `sdk.ts` cung cấp `settingsManager`, `extensionRunnerRef`, `mergeProviderAttributionHeaders` và `modelRuntime`. Wrapper áp dụng setting timeout và retry, provider attribution cùng Extension header hook. Việc resolve credential vẫn thuộc Agent Loop qua `getApiKey`; loop chỉ nhìn thấy `StreamFn`.

| Thành phần Context | Độ ổn định thường gặp giữa các Turn | Vì sao vẫn có thể đổi                              |
| ------------------ | ----------------------------------- | -------------------------------------------------- |
| `systemPrompt`     | Thường ổn định                      | `prepareNextTurn` hoặc product setting có thể thay |
| `tools`            | Thường ổn định                      | Extension hoặc Tool result có thể đổi availability |
| `messages`         | Tăng sau mỗi Turn                   | Assistant và Tool result message được append       |
| `model`            | Thường ổn định                      | `prepareNextTurn` có thể chọn model khác           |

Provider adapter sở hữu cách serialize cache control. Việc dựng lại object `Context` nhỏ không tự quyết định cache hit; content provider nhìn thấy và cache semantics của provider mới quyết định.

#### Pha D: stream và thay assistant message tại chỗ

`streamAssistantResponse()` dành một slot transcript ở event `start`, thay slot đó bằng từng partial, rồi thay lần cuối bằng message hoàn chỉnh:

```typescript
// Faithfully abridged from packages/agent/src/agent-loop.ts at a470b121.
case "start":
  partialMessage = event.partial;
  context.messages.push(partialMessage);
  await emit({ type: "message_start", message: { ...partialMessage } });
  break;

case "text_delta":
case "toolcall_delta":
case "thinking_delta":
  partialMessage = event.partial;
  context.messages[context.messages.length - 1] = partialMessage;
  await emit({ type: "message_update", message: { ...partialMessage }, assistantMessageEvent: event });
  break;

case "done":
case "error":
  finalMessage = await response.result();
  context.messages[context.messages.length - 1] = finalMessage;
  await emit({ type: "message_end", message: finalMessage });
  return finalMessage;
```

Switch thật còn xử lý event `*_start` và `*_end`. Nếu stream hoàn tất mà không phát `start`, implementation append final message và tự phát `message_start` trước `message_end`.

```text
start          messages[last] = AssistantMessage rỗng/ban đầu
text_delta     messages[last] = AssistantMessage partial mới hơn
toolcall_end   messages[last] = partial có ToolCall hoàn chỉnh
done/error     messages[last] = AssistantMessage cuối
```

Một slot tránh lưu mỗi token delta thành conversation message. Subscriber vẫn nhận từng typed update để render.

### 4.5 Kiểm tra stop và termination

Hard-stop check chạy trước bước chọn Tool:

```typescript
// Faithfully abridged from packages/agent/src/agent-loop.ts at a470b121.
if (message.stopReason === "error" || message.stopReason === "aborted") {
  await emit({ type: "turn_end", message, toolResults: [] });
  await emit({ type: "agent_end", messages: newMessages });
  return;
}
```

Với mọi final reason khác, loop kiểm tra Tool block thật. `length` là safety branch riêng: argument có thể parse được nhưng chưa đầy đủ, nên Pi phát failed Tool result cho từng call và không thực thi call nào. Sau một Turn bình thường, `prepareNextTurn` chạy trước; rồi `shouldStopAfterTurn` có thể kết thúc run trước khi đọc một trong hai queue.

### 4.6 Thực thi Tool call

Hai mode giữ conversation order theo cách khác nhau:

| Stage                | Sequential mode | Parallel mode                                            |
| -------------------- | --------------- | -------------------------------------------------------- |
| Preflight            | Từng call một   | Theo source order, trước khi execution được phép bắt đầu |
| Execution            | Từng call một   | Các call đã prepare và được phép chạy đồng thời          |
| `tool_execution_end` | Source order    | Completion order                                         |
| `ToolResultMessage`  | Source order    | Source order sau khi batch settle                        |

Nếu bất kỳ Tool được gọi nào khai báo `executionMode: "sequential"`, toàn bộ assistant batch chạy sequential. Preflight resolve Tool, áp dụng `prepareArguments`, validate schema rồi gọi `beforeToolCall`:

```typescript
// Faithfully abridged from packages/agent/src/agent-loop.ts at a470b121.
const preparedToolCall = prepareToolCallArguments(tool, toolCall);
const validatedArgs = validateToolArguments(tool, preparedToolCall);
const beforeResult = await config.beforeToolCall?.(
  { assistantMessage, toolCall, args: validatedArgs, context: currentContext },
  signal,
);
```

Tool không tồn tại, argument sai, preflight code throw, call bị block và abort đã được quan sát đều trở thành immediate error result. `afterToolCall` chỉ chạy sau khi một Tool được phép đã thực thi; hook có thể thay `content`, `details`, `usage`, `isError` hoặc `terminate` trước final event:

```typescript
// Faithfully abridged from packages/agent/src/agent-loop.ts at a470b121.
const afterResult = await config.afterToolCall?.(
  {
    assistantMessage,
    toolCall,
    args,
    result,
    isError,
    context: currentContext,
  },
  signal,
);

result = {
  ...result,
  content: afterResult?.content ?? result.content,
  details: afterResult?.details ?? result.details,
  usage: afterResult?.usage ?? result.usage,
  terminate: afterResult?.terminate ?? result.terminate,
};
isError = afterResult?.isError ?? isError;
```

Với mỗi call đã finalize, Pi phát `tool_execution_end` rồi một cặp `message_start`/`message_end` cho `ToolResultMessage` đã normalize. Trong batch không bị abort, mỗi call có một result. Nếu abort được quan sát khi đang prepare batch, các source call phía sau có thể chưa từng start.

Batch termination dùng `every`:

```typescript
// Faithfully abridged from packages/agent/src/agent-loop.ts at a470b121.
const terminate =
  finalizedCalls.length > 0 &&
  finalizedCalls.every((entry) => entry.result.terminate === true);
```

Mixed batch vẫn tiếp tục. Result bị `beforeToolCall` block chỉ tham gia termination khi đặt cả `block: true` và `terminate: true`. `afterToolCall` có thể thêm hoặc bỏ termination hint của executed result.

Parallel mode cố ý tách preparation khỏi execution. Pi prepare call theo source order của assistant và ghi immediate failure trước khi launch đồng thời các call được phép. Vì thế `tool_execution_end` có thể phản ánh completion order thật, còn Tool result message đợi mọi work đã launch settle rồi quay về source order. Model nhìn thấy transcript deterministic dù UI cho thấy Tool này hoàn thành trước Tool kia.

Flag `terminate` chỉ tồn tại trong runtime. `createToolResultMessage()` copy content, details, usage, tên Tool mới được thêm, error state và field nhận dạng, nhưng không copy `terminate`. Provider request kế tiếp không nhận một termination field ngoài protocol. Agent Core tiêu thụ hint này khi quyết định có cần automatic continuation hay không.

### 4.7 `turn_end`, hook, event và steering

Thứ tự sau Turn được cố định:

```text
turn_end
  -> prepareNextTurn({ message, toolResults, context, newMessages })
  -> áp dụng context/model/thinkingLevel được trả về
  -> shouldStopAfterTurn(snapshot đã update)
  -> nếu true: agent_end
  -> nếu không: getSteeringMessages()
```

`prepareNextTurn` không tự ép mở Turn khác; nó chuẩn bị state phòng khi Tool continuation hoặc pending message cần Turn mới. Coding Agent cài `prepareNextTurnWithContext` để refresh system prompt, Tool registry, model đã chọn và thinking level từ session state đang live.

Event path của một Tool Turn là:

| Thứ tự | Event                                                                       |
| -----: | --------------------------------------------------------------------------- |
|      1 | `turn_start`                                                                |
|      2 | Assistant `message_start`, không hoặc nhiều `message_update`, `message_end` |
|      3 | `tool_execution_start`, update tùy chọn, `tool_execution_end`               |
|      4 | `message_start` và `message_end` của Tool result                            |
|      5 | `turn_end`                                                                  |

`Agent.processEvents()` reduce state trước khi gọi listener. Listener được await theo thứ tự subscription, nên assistant `message_end` là một barrier: `beforeToolCall` nhìn thấy `Agent.state.messages` đã chứa assistant request. Raw `agentLoop()` stream giữ event order nhưng không biến asynchronous consumer work thành producer barrier.

Settlement kéo dài qua thời điểm phát event. `agent_end` bảo đảm loop không phát event sau đó, nhưng `Agent.state.isStreaming` vẫn là true khi listener `agent_end` được await. Chỉ `finishRun()` mới xóa streaming state và pending Tool ID, resolve `waitForIdle()` rồi gỡ active run. Nhờ vậy subscriber có thể flush session hoặc telemetry buffer trước khi `await agent.prompt()` trả về.

### 4.8 Quay lại đầu vòng lặp

```typescript
// Faithfully abridged from packages/agent/src/agent-loop.ts at a470b121.
while (hasMoreToolCalls || pendingMessages.length > 0) {
  // one assistant response and its Tool batch
}
```

Automatic continuation đến từ Tool batch không terminate. Steering continuation đến từ pending message. Nếu cả hai đều false, inner loop kết thúc. `shouldStopAfterTurn` có thể thoát sớm hơn ngay cả khi một trong hai điều kiện lẽ ra mở Turn khác.

### 4.9 Outer loop follow-up

Tại boundary ổn định, Agent Core chỉ poll follow-up queue:

```typescript
// Faithfully abridged from packages/agent/src/agent-loop.ts at a470b121.
const followUpMessages = (await config.getFollowUpMessages?.()) || [];
if (followUpMessages.length > 0) {
  pendingMessages = followUpMessages;
  continue;
}
break;
```

Outer `continue` quay lại inner loop, nơi follow-up message nhận message event bình thường trước assistant call tiếp theo. Chúng vẫn thuộc cùng run `agent_start`/`agent_end`. Path hard `error`/`aborted` hoặc `shouldStopAfterTurn` return trước lần poll này.

`Agent.continue()` là public action riêng sau khi một run đã settle. Khi tail là user hoặc Tool result, nó bắt đầu run mới từ transcript state có sẵn. Khi tail là assistant, nó có thể dùng steering hoặc follow-up message đã nằm trong queue; nếu cả hai queue rỗng thì call bị reject. Mọi path được chấp nhận đều phát `agent_start` mới. Không nên nhầm nó với outer loop kéo dài run hiện tại.

### 4.10 Steering và follow-up

| Chiều so sánh                 | Steering                                             | Follow-up                                                |
| ----------------------------- | ---------------------------------------------------- | -------------------------------------------------------- |
| API enqueue                   | `agent.steer(message)`                               | `agent.followUp(message)`                                |
| Điểm poll                     | Trước inner iteration đầu và sau mỗi Turn hoàn chỉnh | Chỉ sau khi inner loop sắp dừng                          |
| Tác dụng                      | Ảnh hưởng Turn sớm nhất còn có thể chạy              | Mở Turn khác sau khi work hiện tại chạm boundary ổn định |
| Có ngắt Tool đang chạy không  | Không                                                | Không                                                    |
| Queue mode                    | `one-at-a-time` hoặc `all`                           | `one-at-a-time` hoặc `all`                               |
| Khi hard error hoặc stop hook | Không được poll                                      | Không được poll                                          |

Coding Agent map input nhập khi streaming vào một trong hai queue và expose mode qua setting. Steering phù hợp với “hãy dùng fixture thay thế”. Follow-up phù hợp với “sau đó hãy tóm tắt diff”.

## 5. Tổng kết: ba thiết kế vòng lặp cần giữ

### 1. ReAct là nhịp cốt lõi

```text
Reason trong AssistantMessage
  -> Act qua ToolCall
  -> Observe qua ToolResultMessage
  -> Reason lần nữa
```

Một Turn chứa một assistant response cùng Tool batch của nó. Một run có thể chứa nhiều Turn.

### 2. Termination là quyết định trên state

`stopReason` mô tả cách provider hoàn tất, nhưng control còn phụ thuộc Tool block, an toàn khi call bị cắt, `terminate` trên toàn batch, `shouldStopAfterTurn`, steering, follow-up, abort, error và quyền sở hữu deferred response. Runtime chỉ kết thúc tại boundary đã định nghĩa; nó không yêu cầu model chứng nhận task đã hoàn tất.

### 3. Giữ kernel nhỏ và đặt product policy thành lớp ngoài

| Boundary    | Agent Core sở hữu                                | Coding Agent bổ sung                                   |
| ----------- | ------------------------------------------------ | ------------------------------------------------------ |
| Model       | Contract `StreamFn` và call theo Turn            | Models runtime setting, retry, header, credential      |
| Message     | Transform, conversion boundary, transcript event | Conversion và persistence cho message riêng của coding |
| Tool        | Validation, hook, scheduling, result             | Coding Tool, permission policy, Extension wrapping     |
| Interaction | Steering/follow-up queue và lifecycle event      | Terminal/RPC mapping, UI, session behavior             |

Cách tách này cho phép một domain Agent nhỏ dùng `Agent` trực tiếp, trong khi coding assistant đầy đủ giữ policy phong phú hơn trong `AgentSession` và Extension.

## 6. Trạm tiếp theo

[Chương 4](ch04-model-invocation.md) mở boundary `StreamFn`: model collection, provider registration, request conversion, normalized streaming event và error handling.

> Version boundary: phần walkthrough này theo Pi `0.84.2` tại commit `a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c` và Node.js `>=22.19.0`.
