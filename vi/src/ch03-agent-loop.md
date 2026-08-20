---
chapter: 3
slug: ch03-agent-loop
title_zh: "第3章：Agent Loop : 让模型转动起来的引擎"
title_en: "Chapter 3: Agent Loop : The Engine That Spins the Model"
title_vi: "Chương 3: Agent Loop : Động cơ quay mô hình"
source_url: https://www.dgzhuya.com/modules/ch03-agent-loop
language: vi
version_pairs:
 zh: zh/src/ch03-agent-loop.md
 en: en/src/ch03-agent-loop.md
 vi: vi/src/ch03-agent-loop.md
original_chars: 6859
code_lines: 385
reading_minutes: 35
translator: hypnguyen1209
reviewed_by: null
last_updated: 2026-08-20
status: translated
official_refs: []
terms_used: []
code_blocks: 37
mermaid_blocks: 0
---

# Chương 3: Agent Loop : Động cơ quay mô hình

> Chương trước đã xem kiến trúc phân lớp của Pi. Kiến trúc chỉ là "bộ xương" : sức sống thật sự của một Agent đến từ "vòng lặp" (loop). Chương này, ta bắt đầu từ những câu hỏi cơ bản nhất: **tại sao cần vòng lặp? nó quay như thế nào? khi nào dừng?** Rồi ta truy vết hành trình đầy đủ của một message người dùng để thấy từng nhịp đập của Agent Loop.

---

## 1. Mở đầu: ba cách dùng LLM

Trước khi bàn về Agent Loop, ta lùi một bước xem bản thân việc "dùng LLM" có bao nhiêu kiểu. Điều này rất quan trọng để hiểu "tại sao cần vòng lặp".

### Kiểu 1: gọi trực tiếp : "model, trả lời đi"

Cách dùng nguyên thủy và trực quan nhất. Bạn dựng prompt, gọi API một lần, lấy kết quả, xong.

```
用户输入 → 构建提示词 → 调模型 → 模型输出 → 展示结果
```


Code kiểu thế này:


```
const response = await llm.chat({
  messages: [
    { role: "system", content: "你是一个翻译助手" },
    { role: "user", content: "把这段代码翻译成 Python" },
  ],
});
console.log(response.content);
```


**Công việc cốt lõi là "dựng prompt" (build the prompt).** Prompt tốt thì kết quả tốt. Một lần gọi, một lần output, không qua lại.

Tình huống áp dụng: dịch, tóm tắt, hỏi đáp, hoàn thiện code : bất cứ thứ gì "một câu hỏi một câu trả lời" xử lý được.

### Kiểu 2: Workflow : "model, làm bước một trước; tôi kiểm tra, rồi làm bước hai"

Khi task phức tạp lên, bạn thấy khó có kết quả tốt trong một lần. Vậy là bạn chia task lớn thành nhiều bước, mỗi bước gọi model một lần, giữa các bước **code của bạn** điều khiển luồng.

```
用户输入 → [步骤1: 调模型分析] → [你的代码: 提取关键信息]
         → [步骤2: 调模型生成草稿] → [你的代码: 检查质量]
         → [步骤3: 调模型润色] → 最终输出
```


Mỗi bước model chỉ làm phần việc của mình, **quyền quyết định nằm trong tay bạn** : bạn biết khi nào nên sang bước tiếp; model chỉ là một mắt xích trên dây chuyền.

Tình huống áp dụng: pipeline tạo tài liệu, tự động review code, RAG (Retrieval-Augmented Generation : sinh tăng cường truy xuất).

### Kiểu 3: Agent Loop : "model, tự quyết đi"

Ở chế độ Agent, bạn giao quyền quyết định cho model.

```
用户输入 → 调模型 → 模型说"我需要读文件" → 执行读文件 → 模型看结果
         → 模型说"还需要搜索代码" → 执行搜索 → 模型看结果
         → 模型说"我知道了，答案是..." → 输出 → 结束
```


Khác biệt cốt lõi: luồng giữa các bước không còn do bạn viết cứng nữa; nó được dẫn dắt bởi nội dung output của model. Code của bạn chỉ làm hai việc:

1. Đưa input người dùng và kết quả thực thi tool cho model
2. Nếu output của model có chứa yêu cầu gọi tool, thì thực thi nó; nếu không, coi như task xong

Còn gọi tool nào, gọi mấy lần : những thứ đó do nội dung output model quyết. Khi nào dừng : đây là quy tắc do con người định nghĩa: khi một lần output của model không còn chứa lệnh gọi tool, ta coi như vòng lặp kết thúc.

Bảng so sánh làm rõ ba kiểu:

| Chiều | Gọi trực tiếp | Workflow | Agent Loop |
| --- | --- | --- | --- |
| Người quyết định | Người dùng | Code của bạn | Model |
| Số lần gọi model | 1 | N (do code kiểm soát) | Không chắc (do model kiểm soát) |
| Việc cốt lõi | Viết prompt | Thiết kế flow | Định nghĩa tool và vòng lặp |
| Vai trò model | Người thi hành | Mắt xích pipeline | Người quyết định tự chủ |
| Tình huống điển hình | Dịch, tóm tắt | Pipeline tài liệu, RAG | Trợ lý lập trình, tự động hóa task |

---

## 2. Hai khái niệm cần nắm trước: Trace và Turn

Trước khi đào sâu source, có hai khái niệm bắt buộc phân biệt. Chúng hay bị dùng lẫn, nhưng trong code Pi mỗi cái có nghĩa chính xác riêng.

### Trace (một lần chạy đầy đủ)

Trace là toàn bộ quá trình từ lúc người dùng nhấn Enter, cho đến khi Agent dừng hẳn và phát ra sự kiện agent_end. Một Trace gồm nhiều Turn.

```
一个 Trace（一次 agent_start 到 agent_end）
│
├── Turn 1：调模型 → 模型返回 toolUse（要读文件）→ 执行 read 工具
│
├── Turn 2：带着工具结果再调模型 → 模型返回 toolUse（还要改文件）→ 执行 edit 工具
│
└── Turn 3：带着工具结果再调模型 → 模型返回 stop（改好了，没有工具调用）→ agent_end
```


### Turn (một vòng)

Định nghĩa của Turn rất chính xác: một lần gọi model + tất cả tool execution được kích hoạt bởi lần gọi đó.

Mỗi Turn được bọc bởi một cặp sự kiện turn_start và turn_end. Điểm mấu chốt: một Turn chỉ có đúng một lần gọi model. Model trả về toolUse, thực thi cụm tool đó, phát turn_end, Turn này kết thúc. Lấy kết quả tool feed lại để gọi model lần nữa : đó là Turn tiếp theo.

Đọc code sẽ thấy rõ hơn. Cấu trúc mỗi vòng của inner loop (sẽ nói kỹ sau):

```
while (hasMoreToolCalls || ...) {
    if (!firstTurn) emit(turn_start);    // ← 新 Turn 开始

    处理 pendingMessages
    streamAssistantResponse()             // ← 一次模型调用
    检查 stopReason
    executeToolCalls()                    // ← 执行这个 Turn 触发的一批工具
    emit(turn_end);                       // ← 这个 Turn 结束

    prepareNextTurn / shouldStopAfterTurn / 检查 steering
}
```


Một vòng inner loop = một Turn = một turn_start → một lần gọi model → thực thi tool → một turn_end.

Nếu model trong một Turn gọi một lúc 3 tool (read + grep + find), thì cả 3 tool đó đều chạy trong cùng Turn : vì chúng đều là sản phẩm của cùng một lần gọi model. Nhưng khoảnh khắc kết quả được feed lại và model được gọi tiếp, ta đã ở Turn tiếp theo rồi.

### Vậy quan hệ giữa Trace và Turn là

```
Trace（一次完整运行）
│  agent_start
│
├── Turn 1
│   │  turn_start
│   ├── 调模型 → toolUse → 执行工具（read + grep）
│   │  turn_end
│   │
├── Turn 2
│   │  turn_start
│   ├── 调模型 → toolUse → 执行工具（edit）
│   │  turn_end
│   │
├── Turn 3
│   │  turn_start
│   ├── 调模型 → stop → 没有工具
│   │  turn_end
│   │
│   agent_end
```

## 3. Toàn cảnh: hành trình một message, và vòng lặp quay ra sao

### Flow toàn cảnh


> Lưu ý: turn_start của Turn đầu tiên được phát ra ngay ở đầu vào runAgentLoop(), sau đó bên trong runLoop() dùng cờ firstTurn để bỏ qua turn_start ở vòng đầu, tránh phát trùng.

Mô tả hình: vỏ ngoài Trace bao 3 Turn; mỗi Turn là vòng kín gọi model + thực thi tool. Lưu ý Turn 3 không có ToolCall (khung nét đứt); stopReason = stop của nó kích hoạt vòng lặp thoát ra.

```
你按下回车："帮我读一下 src/main.ts"
│
│  ① 你的输入变成一条消息
│
UserMessage { role: "user", content: "帮我读一下 src/main.ts" }
│
│  ② 进入循环（agentLoop 入口）: agent_start（一个 Trace 开始了）
│
└── runLoop()
    │
    │  ③ 消息转换（AgentMessage → LLM 认识的 Message）
    │
    │  ┌── Turn 1 ──────────────────────────────────────────┐
    │  │  turn_start                                         │
    │  │  ④ 调用 Model（每 Turn 仅一次模型调用）               │
    │  │  streamSimple(model, { systemPrompt, messages })    │
    │  │       ↓ 逐 token 流式返回                            │
    │  │  AssistantMessage {                                  │
    │  │      content: [ ..., ToolCall { name: "read", ... } ],│
    │  │      stopReason: "toolUse"  ← 有工具调用，继续转      │
    │  │  }                                                  │
    │  │  ⑤ 执行 Tool（工具的五步管道，详见第5章）              │
    │  │  ToolResultMessage { content: [{ text: "文件内容" }] }│
    │  │  turn_end                                            │
    │  └─────────────────────────────────────────────────────┘
    │
    │  循环判断：stopReason 是 toolUse → hasMoreToolCalls = true → 继续
    │
    │  ┌── Turn 2 ──────────────────────────────────────────┐
    │  │  turn_start                                         │
    │  │  ⑥ 第二次调用 Model（工具结果已追加到消息列表）         │
    │  │  streamSimple(model, { messages: [..., toolResult] })│
    │  │       ↓ 模型看到文件内容，开始解释                      │
    │  │  AssistantMessage {                                  │
    │  │      content: [ TextContent { text: "这个文件..." } ],│
    │  │      stopReason: "stop"  ← 没有工具调用，准备停        │
    │  │  }                                                  │
    │  │  turn_end                                            │
    │  └─────────────────────────────────────────────────────┘
    │
    │  循环判断：hasMoreToolCalls = false，pendingMessages 为空
    │  → 内层循环退出
    │  → 外层循环检查 followUp → 空 → 外层循环退出
    │
    └── agent_end（一个 Trace 结束，共 2 个 Turn）
```

### Vòng lặp quay ra sao: stopReason : đèn tín hiệu duy nhất



Ga và phanh của vòng lặp gói gọn trong một field: stopReason. Mỗi AssistantMessage model trả về đều mang theo nó.

Nhưng trước hết phải làm rõ một điểm then chốt: model không bao giờ nói tôi xong rồi. Model chỉ là bộ dự đoán token : cho context, đoán token tiếp theo, lặp lại. Nó không biết task đã xong hay chưa. Dù field stopReason được gắn trên giá trị trả về của model, giá trị của nó đến từ hai nơi khác nhau:

Ba giá trị model API thật sự trả về:

| stopReason | Ý nghĩa |
| --- | --- |
| toolUse | Model output JSON gọi tool; API phát hiện và trả về |
| stop | Sinh kết thúc tự nhiên (gặp stop token), không có tool call |
| length | Số token chạm trần maxTokens, bị cắt |

Hai giá trị do tầng streaming của framework tiêm vào (bản thân model API không bao giờ trả về):

| stopReason | Ý nghĩa | Ai tiêm |
| --- | --- | --- |
| error | Exception trong lúc gọi (mạng rớt, API lỗi, v.v.) | Khối catch của tầng streaming: output.stopReason = error |
| aborted | Người dùng chủ động hủy (AbortSignal kích hoạt) | Khối catch của tầng streaming: output.stopReason = aborted |

> Bằng chứng code (packages/ai/src/): khi lệnh gọi API bên trong streamSimple ném exception, khối catch thực thi output.stopReason = options?.signal?.aborted ? aborted : error. Đây không phải model nói, mà là framework chữa cháy thay.

Thực ra vòng lặp chỉ nhìn một thứ : output của model có chứa tool call hay không. Đằng sau là một quy ước kỹ thuật do con người định:

> Nếu một lần output của model không có tool call, thì vòng này không cần làm thêm gì nữa; vòng lặp có thể dừng.

Đây không phải quyết định thông minh của model. Nói cách khác: không phải model đang nói tôi xong rồi, mà là ta đang nói mày không xin tool, thì coi như mày xong.

```
// 简化逻辑（实际见 agent-loop.ts:202-216）
const toolCalls = message.content.filter(c => c.type === "toolCall");
hasMoreToolCalls = false;
if (toolCalls.length > 0) {
  const executedToolBatch = await executeToolCalls(...);
  hasMoreToolCalls = !executedToolBatch.terminate;  // 任何一个工具 terminate 则停止
}
```

### Một quy tắc dẫn dắt cả vòng lặp


> Lưu ý: thứ thật sự điều khiển vòng lặp không phải stopReason === toolUse, mà là độ dài mảng toolCalls > 0 && !terminate. Nghĩa là: dù stopReason === length (bị cắt), miễn là trong content có khối toolCall, vòng lặp vẫn thực thi tool; ngược lại, dù stopReason === toolUse, nếu mọi kết quả tool đều đặt terminate: true, vòng lặp cũng dừng.

Điều kiện inner loop là while (hasMoreToolCalls || pendingMessages.length > 0):

- Model trả toolCall và tool không terminate → hasMoreToolCalls = true → tiếp tục quay: thực thi tool, feed kết quả lại, gọi model lần nữa
- stopReason === stop hoặc length và không có toolCall → hasMoreToolCalls = false → chuẩn bị dừng (xem có pending message không)
- stopReason === error hoặc aborted → dừng cứng: thoát ngay cả vòng lặp, không kiểm tra followUp

```
         ┌──────────────────────────────────┐
         │                                  │
         ▼                                  │
    ┌─────────┐  toolUse   ┌──────────┐    │
    │ 调模型   │ ─────────→ │ 执行工具  │    │
    └─────────┘            └──────────┘    │
         │                      │          │
         │ stop / length        │ 结果追加  │
         │                      ▼ 到消息    │
         ▼                 重新调模型 ──────┘
    ┌─────────┐
    │ 准备停   │   ← 不是模型决定的，是我们的规则
    └─────────┘

    error / aborted → 直接跳出整个循环（硬停止）
```

### Vòng lặp tối thiểu: mẫu số chung nhỏ nhất của mọi Agent


Sao không để code khéo léo hơn trong việc đoán task đã xong chưa? Vì đây chính là khác biệt cốt lõi giữa Agent và Workflow. Trong Workflow bạn biết flow có mấy bước, có thể dùng code đánh giá tiến độ. Nhưng ở chế độ Agent, bạn không biết model cần đọc bao nhiêu file, sửa bao nhiêu chỗ : tín hiệu duy nhất có thể tin cậy là: output có tool call hay không. Đây vừa là giới hạn, vừa là sự thanh nhã : không cần logic đánh giá độ hoàn thành task nào cả; code chỉ làm lớp phán đoán đơn giản nhất.

### Mọi đường thoát của vòng lặp

Mô tả hình: năm giá trị stopReason được xử lý theo ba nhánh : toolUse giữ vòng lặp quay tiếp; stop/length chuẩn bị dừng bình thường (vẫn kiểm tra followUp); error/aborted dừng cứng (không kiểm tra followUp). Lưu ý hai nguồn của stopReason: ba từ model API, hai là fallback do tầng streaming của framework tiêm.

| Đường thoát | Điều kiện kích hoạt | Lý do |
| --- | --- | --- |
| Thoát bình thường | stop / length + không có followUp + không có pending message | Phổ biến nhất. Model không xin tool và không có task nối tiếp |
| Dừng cứng | error / aborted | Bản thân lệnh gọi model đã lỗi; chạy tiếp vô nghĩa; bỏ qua followUp |
| Hook ngoài dừng | shouldStopAfterTurn() trả về true | Context sắp đầy, đạt số Turn tối đa, v.v. |
| Tool tự kết thúc | Cụm tool đều trả về terminate: true | Tất cả tool đều đồng ý dừng (every, không phải some) |

---

## 4. Đi sâu source: Loop nền và thiết kế lớp phủ của coding-agent

Mục 3 đã cho bạn toàn cảnh khái niệm: message chảy ra sao, stopReason dẫn dắt vòng lặp ra sao, khi nào dừng. Nhưng tất cả mới là là gì. Mục này đào vào code để trả lời làm bằng cách nào.

Trước khi xem source Pi, hãy làm rõ một điều: Agent Loop đơn giản nhất thật ra cực kỳ ngắn.

```
// 最简 Agent Loop（伪代码）
async function simpleLoop(messages, model, tools) {
    while (true) {
        // ① 调模型
        const response = await callModel(model, messages, tools);
        messages.push(response);

        // ② 没有工具调用 → 结束
        if (response.stopReason !== "toolUse") {
            return messages;
        }

        // ③ 有工具调用 → 执行，把结果喂回去
        for (const toolCall of response.toolCalls) {
            const result = await executeTool(toolCall);
            messages.push(result);
        }
    }
}
```

### coding-agent phủ lên trên những gì


Hơn chục dòng code. Một vòng while: gọi model, thực thi tool, gọi model lại, cho đến khi model không còn yêu cầu tool nữa. Đây là cài đặt tối thiểu của logic đã nói ở mục 3 : Agent nào cũng cần lõi này.


coding-agent của Pi là một trợ lý lập trình tương tác : người dùng nói chuyện với nó trong terminal; có khi phải đọc nhiều file, sửa code, chạy test. Bối cảnh sản phẩm này có thêm nhu cầu thật so với vòng lặp tối thiểu:

| Nhu cầu thật | Thiết kế phủ lên | Vị trí source |
| --- | --- | --- |
| Người dùng gõ thêm chỉ dẫn trong khi Agent đang làm | steering message injection: message khẩn có thể chèn ngang giữa các Turn | Đầu inner loop |
| Hệ thống muốn nối tiếp task sau khi Agent xong (ví dụ tiện thể chạy test luôn) | outer followUp loop: inner loop dừng nhưng outer có thể khởi động lại inner | Outer while(true) |
| Task phức tạp khác nhau muốn model hạng khác nhau | hook prepareNextTurn: có thể đổi model/context ở cuối mỗi Turn | Sau turn_end |
| Cửa sổ context sắp đầy, cần kích hoạt nén | hook shouldStopAfterTurn: phán đoán bên ngoài có nên dừng không | Sau prepareNextTurn |

Nhận thức then chốt: những thiết kế phủ lên này đều là lựa chọn chức năng của coding-agent, không phải quy luật phổ quát của Agent. Nếu bạn đang làm một Agent đơn giản kiểu hỏi đáp có tool, cả bảng trên đều thừa : bạn chỉ cần vòng lặp tối thiểu.

Nhưng hiểu coding-agent phủ các thiết kế này như thế nào rất có giá trị : bối cảnh sản phẩm của bạn rất có thể cần cơ chế tương tự. Tiếp theo, dùng source đầy đủ của coding-agent làm ví dụ, ta đi qua từng thiết kế này từng bước. Bám theo message đọc giúp tôi src/main.ts, đi hết hành trình từ đầu vào đến kết thúc.

### 4.1 Đầu vào: runAgentLoop() nhận gì

> Mục 3 đã trình bày toàn cảnh flow; ở đây ta bung chi tiết code : cùng một quá trình, nhìn sâu hơn.

Sau khi bạn nhấn Enter, chuỗi gọi là: Agent.prompt() → runPromptMessages() → runAgentLoop(). Dừng ở đầu vào:

```
// agent-loop.ts:95-118
async function runAgentLoop(
    prompts: AgentMessage[],     // 你的消息
    context: AgentContext,       // 当前对话上下文（快照副本）
    config: AgentLoopConfig,     // 循环配置（模型、钩子、队列回调）
    emit: AgentEventSink,        // 事件发射器
    signal?: AbortSignal,        // 中止信号
    streamFn?: StreamFn,         // 流式函数（可替换）
): Promise<AgentMessage[]>
```


Ba tham số quan trọng nhất trong sáu:

prompts : message của bạn đã được đóng gói thành định dạng chuẩn:


```
[{
  role: "user",
  content: [{ type: "text", text: "帮我读一下 src/main.ts" }],
  timestamp: 1748000000000
}]
```


context : snapshot của context hội thoại. Lưu ý là bản sao (do createContextSnapshot() ở agent.ts:414-420 tạo); mọi sửa đổi context trong khi Loop chạy không ảnh hưởng trạng thái gốc của lớp Agent:


```
{
  systemPrompt: "You are a helpful coding assistant...",
  messages: [ /* 之前的对话历史 */ ],
  tools: [
    { name: "read", description: "...", parameters: Type.Object({...}), execute: ... },
    { name: "bash", description: "...", parameters: Type.Object({...}), execute: ... },
  ]
}
```


config : cấu hình hành vi của Loop. Có một nhóm hook quan trọng (đều là hàm, không phải dữ liệu):


```
{
  model: Model,                    // 用哪个 LLM
  convertToLlm: Function,          // AgentMessage[] → Message[] 转换
  transformContext?: Function,      // 调 LLM 前的上下文预处理（如压缩）
  getSteeringMessages?: Function,   // 获取"紧急插队"消息
  getFollowUpMessages?: Function,   // 获取"追加任务"消息
  shouldStopAfterTurn?: Function,   // 每轮结束后是否该停
  beforeToolCall?: Function,        // 工具执行前钩子
  afterToolCall?: Function,         // 工具执行后钩子
  toolExecution: "parallel",        // 工具执行模式
}
```


Các hook này đều là hàm chứ không phải dữ liệu : Loop gọi chúng khi chạy để kéo trạng thái mới nhất về. Điều này khiến Loop hoàn toàn tách rời khỏi nguồn message bên ngoài.

Hàm đầu vào chỉ làm ba bước chuẩn bị:

```
Step 1: 创建 newMessages 数组
        → 收集本轮 Trace 产生的所有新消息

Step 2: 把 prompts 追加到 context.messages
        → context.messages = [...context.messages, ...prompts]

Step 3: 发初始事件
        → emit("agent_start")    ← Trace 开始
        → emit("turn_start")     ← 首轮 Turn 开始（入口就发，后续 Turn 在内层循环里发）
        → 对每条 prompt：emit("message_start") + emit("message_end")
        → 调用 runLoop()
```


Dữ liệu thay đổi:


```
入口前：
  context.messages = [user1, asst1, toolResult1]    ← 之前的对话
  newMessages = []

入口后：
  context.messages = [user1, asst1, toolResult1, user2]  ← 你的消息被追加
  newMessages = [user2]                                   ← 收集器开始记录
```

### 4.2 Bộ xương của runLoop(): lõi trước, lớp phủ sau

#### Lõi: inner loop


---


Giờ ta vào runLoop() : đoạn code cốt lõi nhất của cả hệ thống. Đừng nản vì độ dài; ta xem lõi trước, rồi đến lớp phủ.


Nếu chỉ giữ lại logic vòng lặp tối thiểu, runLoop trông thế này:

```
// 只保留内核的 runLoop（伪代码）
while (hasMoreToolCalls) {
    // 步骤 B：调 LLM
    // 步骤 C：检查 stopReason → error/aborted 就退出
    // 步骤 D：执行工具
    // 步骤 E：emit turn_end
}
// 结束 → emit agent_end
```

#### Lớp phủ: coding-agent thêm hai vỏ ngoài


Đây là vòng lặp tối thiểu : gọi model, thực thi tool, turn_end, lặp lại. Điều kiện thoát hasMoreToolCalls của inner loop được dẫn dắt bởi độ dài mảng toolCalls > 0 && !terminate (đã nói ở mục 3). Đây là lõi mà mọi Agent đều cần.


Nhưng coding-agent, với vai trò trợ lý lập trình tương tác, cần thêm hai thứ bên ngoài lõi:

Lớp phủ 1: steering message injection (kiểm tra ở đầu inner loop + ở cuối mỗi vòng). Người dùng gõ thêm chỉ dẫn trong khi Agent đang làm : những message này không thể đợi task hiện tại chạy xong; chúng phải được chèn gấp ở đầu vòng tiếp theo. Nên điều kiện inner loop có thêm || pendingMessages.length > 0.

Lớp phủ 2: outer followUp loop (bọc toàn bộ inner loop). Sau khi Agent dừng tự nhiên, hệ thống có thể muốn nối tiếp task (ví dụ tiện thể chạy test). Outer loop cho phép các task nối tiếp này tiếp tục chạy trong cùng một Trace, không cần khởi động Loop mới.

Ghép lõi và hai lớp phủ lại, ta có bộ xương runLoop đầy đủ:

```
async function runLoop(currentContext, newMessages, config, signal, emit, streamFn) {

    // ① 首次 steering 检查（在进入内层循环之前！）
    let pendingMessages = (await config.getSteeringMessages?.()) || [];

    // ========== 叠加2：外层循环（followUp 续命）==========
    while (true) {
        let hasMoreToolCalls = true;
        let firstTurn = true;  // 首轮跳过 turn_start（入口已发）

        // ========== 内核 + 叠加1：内层循环 ==========
        while (hasMoreToolCalls || pendingMessages.length > 0) {
            //                                    ↑ 叠加1：steering 消息也驱动循环

            if (!firstTurn) {
                emit({ type: "turn_start" });
            }
            firstTurn = false;

            // 步骤 A：注入 pendingMessages（steering 消息）← 叠加1
            // 步骤 B：调 LLM → streamAssistantResponse()  ← 内核
            // 步骤 C：检查 stopReason                      ← 内核
            // 步骤 D：执行工具                              ← 内核
            // 步骤 E：emit turn_end                         ← 内核
            // 步骤 F：prepareNextTurn → shouldStopAfterTurn ← 叠加（钩子）
            //         → 再次检查 steering                    ← 叠加1
        }

        // ========== 内层循环结束 ==========
        // 叠加2：检查 followUp 队列
        const followUpMessages = (await config.getFollowUpMessages?.()) || [];
        if (followUpMessages.length > 0) {
            pendingMessages = followUpMessages;
            continue;  // 回到外层循环顶部，内层循环重开
        }

        break;  // 两个队列都空，真正退出
    }
}
```

### 4.3 [Lớp phủ 1 · Bước A] steering message injection


Giờ ta đi qua từng bước. Mỗi bước sẽ được gắn nhãn lõi hoặc lớp phủ để phân biệt.

---


> Steering là gì? Đây là một tính năng tương tác của coding-agent. Hãy tưởng tượng bạn nhờ Agent sửa bug, Agent đang đọc file, phân tích code. Lúc đó bạn chợt nghĩ ra một bổ sung: tiện kiểm tra luôn file test : bạn muốn chỉ dẫn này chen ngang, không phải đợi Agent làm xong task hiện tại rồi mới tính.

Steering chính là cơ chế chen ngang này. Chỉ dẫn mới người dùng gõ trong khi Agent đang làm sẽ được đưa vào hàng đợi steering. Ở đầu mỗi vòng inner loop, Loop kiểm tra hàng đợi này trước và chèn các message khẩn vào cuộc hội thoại hiện tại:

```
if (pendingMessages.length > 0) {
    for (const message of pendingMessages) {
        await emit({ type: "message_start", message });
        await emit({ type: "message_end", message });
        currentContext.messages.push(message);
        newMessages.push(message);
    }
    pendingMessages = [];  // 消费完毕，清空
}
```

### 4.4 [Lõi · Bước B] streamAssistantResponse() : gọi LLM

#### Pha A: tiền xử lý context (tùy chọn)


Đoạn code này chèn các message khẩn lần lượt vào context và bộ thu thập message.

Nguồn đầu tiên của pendingMessages là lần kiểm tra steering đầu tiên khi runLoop vào (agent-loop.ts:167). Sao phải kiểm tra trước khi vào vòng lặp? Vì người dùng có thể đã gõ thêm nội dung trong khi đợi phản hồi LLM đầu tiên : lúc đó message đã được hàng đợi bên ngoài nhận vào, nhưng vòng lặp chưa bắt đầu; nếu ta không lấy trước, cụm message đó sẽ bị bỏ mất.

```
let messages = context.messages;
if (config.transformContext) {
    messages = await config.transformContext(messages, signal);
}
```


Nếu transformContext được cấu hình (ví dụ thuật toán nén), tiền xử lý message ở đây. Không cấu hình thì bỏ qua.



```
const llmMessages = await config.convertToLlm(messages);
```

#### Pha B: chuyển AgentMessage thành Message (ranh giới của hai tầng message)

Dòng này đứng trên ranh giới giữa lõi Agent và LLM. Để hiểu vì sao nó tồn tại, phải biết trước thiết kế hai tầng message.

Khi Agent duy trì lịch sử hội thoại bên trong, nó cần ghi lại không chỉ người dùng nói gì, AI trả lời gì : mà còn trạng thái nội bộ của chính nó. Ví dụ, coding-agent ghi: context đã được nén (CompactionSummaryMessage), chi tiết thực thi lệnh Bash (BashExecutionMessage), record chuyển nhánh (BranchSummaryMessage). Đây là ngôn ngữ nội bộ của Agent, và LLM hoàn toàn không nhận dạng các kiểu message này : nó chỉ nhận ba kiểu chuẩn: UserMessage, AssistantMessage, ToolResultMessage.

convertToLlm là người phiên dịch đứng ở ranh giới này: dịch ngôn ngữ nội bộ của Agent sang giao thức LLM hiểu được. Cài đặt mặc định chỉ là một. filter() : giữ lại ba kiểu chuẩn:

```
function defaultConvertToLlm(messages: AgentMessage[]): Message[] {
    return messages.filter(
        (message) => message.role === "user"
                  || message.role === "assistant"
                  || message.role === "toolResult",
    );
}
```


Biến đổi dữ liệu:


```
转换前（AgentMessage[]）：
[
  { role: "user", content: "帮我读一下 src/main.ts", ... },    ← 保留
  { role: "assistant", content: [...], ... },                   ← 保留
  { role: "compactionSummary", summary: "之前的对话摘要..." },   ← 过滤掉
  { role: "toolResult", content: [...], ... },                  ← 保留
]

转换后（Message[]）：
[
  { role: "user", content: "帮我读一下 src/main.ts", ... },
  { role: "assistant", content: [...], ... },
  { role: "toolResult", content: [...], ... },
]
```

#### Pha C: dựng Context và gọi model


> Thiết kế đầy đủ của hệ thống hai tầng message được trình bày chi tiết ở Chương 6: Hệ thống Message.



```
const llmContext: Context = {
    systemPrompt: context.systemPrompt,
    messages: llmMessages,
    tools: context.tools,
};

const streamFunction = streamFn || streamSimple;
const resolvedApiKey =
    (config.getApiKey ? await config.getApiKey(config.model.provider) : undefined)
    || config.apiKey;

const response = await streamFunction(config.model, llmContext, {
    ...config,
    apiKey: resolvedApiKey,
    signal,
});
```


Dựng Context là luồng chính của bước này. Lưu ý llmContext là một đối tượng hoàn toàn mới, được dựng lại mỗi vòng của inner loop. Nó gồm ba phần:

- systemPrompt : dùng lại trực tiếp system prompt từ context của Agent, bảo model mày là ai, phải theo rule nào
- messages : chính là llmMessages đã được lọc bởi convertToLlm ở bước trước, chỉ gồm ba kiểu chuẩn LLM nhận
- tools : danh sách tool (kèm định nghĩa schema), để model biết lần này có những tool nào

Lưu ý một chi tiết: llmContext.tools = context.tools là gán tham chiếu : mỗi vòng có bọc một wrapper object mới, nhưng bản thân mảng tools là cùng một tham chiếu, nội dung ổn định ở cấp byte. systemPrompt cũng vậy. Chỉ có messages thật sự dài ra (mỗi vòng thêm một ToolResultMessage mới).

Vậy sao vẫn dựng lại wrapper llmContext mỗi vòng? Vì có những Turn thật sự thay đổi một trong ba thứ đó: hook prepareNextTurn (§4.7) có thể đổi model hoặc sửa systemPrompt; hệ thống extension (§5) có thể đăng ký tool mới lúc chạy. Chi phí dựng lại wrapper không đáng kể (một object JS), nhưng đảm bảo không bị ô nhiễm trạng thái khó truy vết do tham chiếu chung.

Vậy có vỡ prompt cache không? Không. prompt cache của Anthropic là content-addressed (đánh địa chỉ theo nội dung) : nó nhìn vào byte gửi đi, không phải identity của request. Gửi object mới hay cũ không quan trọng; miễn là byte của system + tools không đổi, cache sẽ hit. Pi gắn cache_control: { type: ephemeral } rõ ràng ở ba vị trí trong anthropic-messages.ts:

| Vị trí | Dòng source | Tác dụng |
| --- | --- | --- |
| Cuối system prompt | L922/929/938 | Cả system prompt làm prefix có thể cache |
| Tool cuối cùng | L1208 | Cả danh sách tools làm prefix có thể cache |
| User message cuối | L1157-1178 | rolling cache : mỗi Turn đẩy breakpoint cache lên message mới nhất |

Cái thứ ba đặc biệt tinh tế: cache breakpoint không cố định ở message đầu tiên; nó chạy theo user message mới nhất. Như vậy, prefix cũ tiếp tục hit, nội dung mới thêm vào cũng được ghi vào, cả lịch sử hội thoại đều hưởng lợi từ cache. Chuỗi hit đại khái là:

```
Turn 1: 写入 [system + tools] → 写入 [messages §1]
Turn 2: 命中 [system + tools] → 命中 [messages §1] → 写入 [messages §2]
Turn 3: 命中 [system + tools] → 命中 [messages §1+§2] → 写入 [messages §3]
```

#### Pha D: xử lý streaming response : cái hay của việc thay tại chỗ


Thêm một điểm dễ hiểu sai: tools không bị nhét vào cuối messages. Trong giao thức API của Anthropic, tools là một field top-level độc lập (đặt trước messages); bản thân thiết kế giao thức đã tính đến cache : tools ổn định phía trước, messages biến động phía sau; prefix càng dài, tiết kiệm càng nhiều.

OpenAI đi hướng khác (openai-completions.ts:554): prompt_cache_key: sessionId, backend OpenAI tự khớp prefix theo session. DeepSeek, Qwen, v.v., thông qua field tương thích cacheControlFormat: anthropic, cũng có thể dùng lại marker kiểu Anthropic cache_control (applyAnthropicCacheControl ở L593).


```
for await (const event of response) {
    switch (event.type) {
        case "start":
            // 拿到一个"空壳"消息，直接 push 到 context
            partialMessage = event.partial;
            context.messages.push(partialMessage);
            emit({ type: "message_start", ... });
            break;

        case "text_delta":       // 文本增量
        case "toolcall_delta":   // 工具调用增量
        case "thinking_delta":   // 思考增量
            partialMessage = event.partial;            // 更新后的部分消息
            context.messages[last] = partialMessage;    // ★ 原地替换！
            emit({ type: "message_update", ... });      // UI 收到增量更新
            break;

        case "done":
        case "error":
            finalMessage = await response.result();
            context.messages[last] = finalMessage;       // ★ 用最终完整消息替换
            emit({ type: "message_end", ... });
            return finalMessage;
    }
}
```


Sao push vỏ rỗng trước rồi thay tại chỗ? Lưu ý ý nghĩa của thay tại chỗ : không phải đẩy mục mới vào mảng context.messages; mà là sửa các khối nội dung của message cuối cùng tại chỗ. Chunk streaming response lần lượt đến; ta chưa có toàn bộ message. Ta push trước một AssistantMessage rỗng để bộ thu thập đã có sẵn chỗ cho kết quả cuối cùng. Sau đó mỗi chunk streaming sẽ mutate message này tại chỗ : miễn là sau khi response xong, bộ thu thập duyệt messages, nó sẽ thấy message đã hoàn chỉnh.

```
start    → { role: "assistant", content: [] }                    ← 空壳 push
text_delta → { content: [{ type:"text", text:"好的..." }] }       ← 文字在长
toolcall   → { content: [{ text:"好的..." },                        ← 工具调用出现
                         { type:"toolCall", name:"read", arguments:{file_path:"src/main.ts"} }] }
done     → { content: [...], stopReason:"toolUse", usage:{...} } ← 最终完整消息替换
```

### 4.5 [Lõi · Bước C] kiểm tra stopReason


---


Mục 3 đã nói kỹ về stopReason. Ở đây ta xem code thật:

```
// agent-loop.ts:196-200
if (message.stopReason === "error" || message.stopReason === "aborted") {
    await emit({ type: "turn_end", message, toolResults: [] });
    await emit({ type: "agent_end", messages: newMessages });
    return;   // ← 直接退出整个 runLoop，不检查 followUp
}
```

### 4.6 [Lõi · Bước D] executeToolCalls() : thực thi tool


error và aborted là dừng cứng : lập tức phát turn_end + agent_end, return thẳng. Không thực thi tool, cũng không kiểm tra followUp. Đây là chiến lược fail fast (thất bại nhanh): vì bản thân lệnh gọi model đã thất bại (lỗi mạng hoặc người dùng hủy), chạy tiếp là vô nghĩa.

```
const toolCalls = message.content.filter((c) => c.type === "toolCall");
```


Rồi quyết định cụm tool này chạy song song hay nối tiếp:


```
if (config.toolExecution === "sequential" || hasSequentialToolCall) {
    return executeToolCallsSequential(...);   // 串行
}
return executeToolCallsParallel(...);         // 并行
```


Chiến lược phủ quyết: miễn là bất kỳ một tool nào trong cụm khai báo executionMode: sequential, toàn bộ cụm phải chạy nối tiếp. Đây là lựa chọn bảo thủ : khi một tool cần thao tác trên kết quả của tool trước, không còn cách nào khác ngoài chạy tuần tự.

```
串行模式：
  ToolCall A: 准备 → 验证 → beforeHook → 执行 → afterHook → emit end
  ToolCall B: 准备 → 验证 → beforeHook → 执行 → afterHook → emit end
  （一个完全结束，才开始下一个）

并行模式（三阶段设计）：
  阶段1 - 准备（顺序）：  A 准备 → B 准备 → C 准备
      ↑ prepareToolCall 含验证和 beforeHook，必须顺序执行
  阶段2 - 执行（并行）：  A、B、C 同时执行（Promise.all）
      ↑ 只有 tool.execute 并行，省时间
  阶段3 - 事件（有序）：  end 按完成顺序发；result 按调用顺序发
      ↑ result 消息保持和 ToolCall 一致的顺序，LLM 收到的上下文才是正确的
```


Lưu ý sự tinh tế của chế độ song song: pha chuẩn bị luôn tuần tự (vì validate và kiểm tra quyền không thể chạy song song : nếu B bị chặn thì C không nên chạy). Chỉ sau khi mọi tool đã validate xong thì mới thật sự chạy song song.

```
工具执行后：
  context.messages = [..., user2, assistantMessage, {
    role: "toolResult", toolCallId: "toolu_01", toolName: "read",
    content: [{ text: "文件内容..." }], isError: false
  }]
```


Cơ chế terminate: tool có thể đặt terminate: true trong kết quả trả về, nghĩa là tôi nghĩ nên dừng. Nếu tất cả tool trong cụm đều đồng ý terminate (code dùng every, không phải some), vòng lặp dừng.

```
// ① emit turn_end : 通知外部"这一轮结束了"（内核）
await emit({ type: "turn_end", message, toolResults });

// ② prepareNextTurn : 给外部一个机会"改装"下一轮（叠加）
// 返回值可包含 context / model / thinkingLevel 三者之一的覆盖
const nextTurnSnapshot = await config.prepareNextTurn?.({...});
if (nextTurnSnapshot) {
    currentContext = nextTurnSnapshot.context ?? currentContext;
    config.model = nextTurnSnapshot.model ?? config.model;
    // thinkingLevel 也在此处覆盖（详见 agent-loop.ts 中 prepareNextTurn 处理逻辑）
}

// ③ shouldStopAfterTurn : 外部判断是否该停了（叠加）
if (await config.shouldStopAfterTurn?.({...})) {
    await emit({ type: "agent_end", messages: newMessages });
    return;
}

// ④ 再次检查 steering : 有没有新的紧急消息？（叠加1）
pendingMessages = (await config.getSteeringMessages?.()) || [];
```

### 4.7 [Lõi + Lớp phủ · Bước E~F] turn_end + hook + kiểm tra lại steering


prepareNextTurn : đây là extension point dễ bị bỏ qua nhưng rất mạnh. Sau mỗi turn_end và trước vòng tiếp theo, Loop gọi hàm này để cho bên ngoài cơ hội đổi model hoặc sửa context:

```
场景：按任务复杂度切换模型

Turn 1: 用户问了一个简单问题 → 模型用 Haiku（快、便宜）
        turn_end → prepareNextTurn 检查到问题很简单
        → 返回 { model: haiku } → 下一轮继续用 Haiku

场景：中途发现任务变复杂了

Turn 1: 用户让"重构这个模块" → Haiku 开始读文件
        turn_end → prepareNextTurn 发现要改的文件很多
        → 返回 { model: opus } → 下一轮自动切到 Opus（强、贵）
```

### 4.8 Quay về đầu vòng lặp


Ngoài đổi model, nó còn có thể đổi context (ví dụ tiêm thông tin context mới) và thinkingLevel (cường độ suy luận). Giá trị trả về cho biết Turn tiếp theo có nên chạy nữa hay không, nên nó cũng có thể làm van an toàn.

```
while (hasMoreToolCalls || pendingMessages.length > 0)
```

### 4.9 [Lớp phủ 2 · Bước G] outer loop: cơ chế kéo dài thở của followUp


Một trong hai điều kiện đúng thì vòng lặp tiếp tục. hasMoreToolCalls do output của model có khối toolCall hay không (và chưa tất cả đều terminate) quyết định; pendingMessages.length > 0 nghĩa là có message đang chờ từ steering hoặc nguồn khác.


```
const followUpMessages = (await config.getFollowUpMessages?.()) || [];
if (followUpMessages.length > 0) {
    pendingMessages = followUpMessages;   // 塞进 pending，触发新 Turn
    continue;                              // 回到外层循环顶部
}
break;  // 两个队列都空了，真正退出
```

### 4.10 steering vs followUp: một bảng nhìn rõ hai can thiệp

## 5. Tổng kết: bốn thiết kế cốt lõi của Loop

### 1. Mô hình vòng lặp ReAct


Nếu có message followUp, chúng được đẩy vào pendingMessages, và continue nhảy về đầu outer loop. Đây là cơ chế kéo dài thở : inner loop xong rồi nhưng outer loop vẫn có thể giữ Agent làm tiếp.

Giờ so sánh hai cơ chế can thiệp : steering vs followUp : trong một bảng:

| Chiều | steering | followUp |
| --- | --- | --- |
| Thời điểm chèn | Trước khi inner loop bắt đầu + ở cuối mỗi vòng của inner loop | Sau khi inner loop kết thúc hoàn toàn |
| Ngữ nghĩa | Chen ngang khẩn : chèn vào khoảng trống khi tool đang thực thi | Xếp hàng chờ gọi : đợi task hiện tại làm xong hẳn |
| Tình huống điển hình | Người dùng gõ thêm chỉ dẫn trong khi Agent đang làm | Hệ thống nối tiếp tiện chạy test luôn sau khi Agent xong |

Ví đời thường: steering là bạn đang họp, có người gõ cửa đưa một tờ giấy : khẩn, xem cái này trước. followUp là tan họp bạn lật hộp thư : không gấp, nhưng cần xử lý.

Mô tả hình: đối chiếu trái đỏ phải xanh : steering kiểm tra ở đầu và cuối mỗi vòng inner loop và chen ngang; followUp kiểm tra sau khi inner loop kết thúc hoàn toàn và kéo dài lần chạy. Phía dưới liệt kê thời điểm, nguồn, tác động và tình huống điển hình của mỗi cái.
### 2. Cơ chế dẫn dắt bởi stopReason

### 3. Tư duy kiến trúc lõi + lớp phủ

## 6. Trạm tiếp theo

