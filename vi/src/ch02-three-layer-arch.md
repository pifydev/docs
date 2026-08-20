---
chapter: 2
slug: ch02-three-layer-arch
title_zh: "第2章：三层架构 : Pi-Agent 项目的骨骼"
title_en: "Chapter 2: Three-Layer Architecture : Pi-Agent Project Skeleton"
title_vi: "Chương 2: Kiến trúc ba lớp : Bộ xương của Pi-Agent"
source_url: https://www.dgzhuya.com/modules/ch02-three-layer-arch
language: vi
version_pairs:
 zh: zh/src/ch02-three-layer-arch.md
 en: en/src/ch02-three-layer-arch.md
 vi: vi/src/ch02-three-layer-arch.md
original_chars: 4215
code_lines: 203
reading_minutes: 22
translator: pi-docs-bot
reviewed_by: null
last_updated: 2026-08-20
status: translated
official_refs:
 - https://pi.dev/docs/latest/index
 - https://pi.dev/docs/latest/quickstart
 - https://pi.dev/docs/latest/usage
 - https://pi.dev/docs/latest/providers
 - https://pi.dev/docs/latest/settings
 - https://pi.dev/docs/latest/extensions
 - https://pi.dev/docs/latest/skills
 - https://pi.dev/docs/latest/packages
 - https://pi.dev/docs/latest/models
 - https://pi.dev/docs/latest/security
 - https://pi.dev/docs/latest/keybindings
 - https://pi.dev/docs/latest/sessions
 - https://pi.dev/docs/latest/compaction
terms_used:
 - Pi Agent
 - Agent Loop
 - Tool System
 - Tool
 - TUI
 - MCP
 - Provider
 - KnownProvider
 - Skills
 - Extensions
 - Pi Package
 - Theme
 - SDK
 - DAG
 - Hot Reload
 - pi-ai
 - pi-agent-core
 - pi-coding-agent
 - pi-tui
 - pi-orchestrator
 - monorepo
 - npm workspaces
 - TypeScript
 - TypeBox
 - Static
 - TSchema
code_blocks: 16
mermaid_blocks: 0
---

# Chương 2: Kiến trúc ba lớp : Bộ xương của Pi-Agent

> Trong chương này, chúng ta đứng từ trên cao nhìn xuống toàn bộ kiến trúc của Pi : code nằm ở đâu, các package phụ thuộc lẫn nhau ra sao, và kiểu dữ liệu chảy giữa các lớp như thế nào. Khi đã có bức tranh toàn cảnh này, việc đào sâu vào bất kỳ module nào sau này cũng không làm bạn lạc.

---

## 1. Bạn vừa mở một codebase Agent

Giả sử bạn vừa clone kho chứa (repository) của Pi và gõ `ls` trong terminal. Đây là cấu trúc thư mục bạn sẽ thấy:

```
repo/
├── packages/
│   ├── ai/              ← @earendil-works/pi-ai
│   ├── agent/           ← @earendil-works/pi-agent-core
│   ├── coding-agent/    ← @earendil-works/pi-coding-agent
│   ├── orchestrator/    ← @earendil-works/pi-orchestrator（实验性，多 Agent 编排）
│   └── tui/             ← @earendil-works/pi-tui
├── package.json         ← 根配置，npm workspaces
└── tsconfig.json
```

Năm package, xếp thẳng hàng gọn gàng.

> Ghi chú 1: Trước đây từng có package `pi-web-ui` (thư viện component Lit cho trình duyệt), nhưng nó đã bị xoá khỏi workspace tại commit `b141e1fa` ngày 2026-05-20; kho chứa hiện tại không còn chứa package đó nữa.
> Ghi chú 2: `pi-orchestrator` là package điều phối thử nghiệm, được thêm vào v0.80.x. Nó phụ thuộc vào `pi-coding-agent` và xử lý việc phối hợp đa Agent, giao tiếp giữa các tiến trình qua RPC, và giám sát bằng Supervisor. Nó thuộc về **lớp điều phối ngoài**, không nằm trong lộ trình học "bộ ba lõi", và sẽ được mô tả riêng ở cuối module này.

Nếu bạn đã từng làm dự án Node.js, chắc hẳn bạn đã dùng monorepo (nhiều package được quản lý trong cùng một kho chứa). Pi dùng cách tiếp cận npm workspaces tiêu chuẩn : `package.json` gốc khai báo `"workspaces": ["packages/*"]`, và npm sẽ tự động coi mỗi thư mục con dưới `packages/` là một package độc lập.

Nhưng đó chưa phải là điều quan trọng. Điều quan trọng là: **tại sao lại là năm package (bốn package mở rộng từ bộ ba lõi, cộng thêm một lớp điều phối ngoài)? Mối quan hệ giữa chúng là gì? Có thể gộp lại không?**

Để trả lời câu hỏi đó, ta cần tìm hiểu từng package thực sự làm gì.

---

## 2. Năm package, mỗi cái một việc

Tạm gác quan hệ phụ thuộc sang một bên. Hãy nhìn từng package từ góc nhìn của chính nó xem nó đang làm gì.

### 2.1 pi-ai: phụ trách "gọi mô hình"

`@earendil-works/pi-ai` (source ở `packages/ai/`) trả lời câu hỏi: **làm thế nào để gọi các LLM khác nhau chỉ với một codebase duy nhất?**

Mô tả một dòng trong `package.json` của nó là:

> "Unified LLM API with automatic model discovery and provider configuration."

Cụ thể, nó làm ba việc:

1. **Định nghĩa các kiểu dữ liệu thống nhất (unified types)**: dù bạn dùng OpenAI, Anthropic, Google hay AWS Bedrock, định dạng thông điệp đều giống nhau : `UserMessage`, `AssistantMessage`, `ToolResultMessage`, và định nghĩa mô hình là `Model<TApi>`.
2. **Hợp nhất luồng gọi (unify streaming calls)**: mọi luồng gọi tới các nhà cung cấp được gom về một hàm `streamSimple()` duy nhất, trả về `AssistantMessageEventStream` (một stream bạn có thể đọc từng token).
3. **Thích ứng với hơn 30 nhà cung cấp**: hỗ trợ trên 30 nhà cung cấp, từ OpenAI, Claude, Gemini tới DeepSeek, Groq, Xiaomi, v.v., mỗi nhà cung cấp có một file adapter riêng.

Chỉ cần nhìn những gì `index.ts` của nó export là rõ:

```
// packages/ai/src/index.ts（v0.80.x 节选）
// 顶部注释明确写：Core only, side-effect free: no generated catalogs,
// no provider factories, no api-registry, no OAuth implementations, no compat.
// 全局 API 注册表、stream/complete 函数等已迁至 ./compat.ts（packages/ai/src/compat.ts）
export type { Static, TSchema } from "typebox";
export { Type } from "typebox";
export * from "./api/lazy.ts"            // 各 Provider API 的懒加载入口
export * from "./auth/context.ts"        // 认证上下文
export * from "./auth/credential-store.ts"
export * from "./auth/helpers.ts"
export * from "./auth/types.ts"
export * from "./images-models.ts"
export * from "./models.ts"              // 模型定义（KnownProvider 35 个）
export * from "./types.ts"               // 统一类型
export * from "./utils/event-stream.ts"  // 事件流基类
// 流式调用入口（stream / streamSimple）实际位于 ./compat.ts
```

Không có "agent" (đại diện), không có "tool" (công cụ), không có "loop" (vòng lặp). Nó chỉ làm đúng một việc: **san phẳng sự khác biệt giữa các API LLM và phơi bày một giao diện thống nhất duy nhất**.

### 2.2 pi-agent-core: phụ trách "chạy vòng lặp"

`@earendil-works/pi-agent-core` (source ở `packages/agent/`) trả lời câu hỏi: **làm sao để LLM cứ lặp đi lặp lại việc suy nghĩ và hành động?**

Mô tả trong `package.json` của nó là:

> "General-purpose agent with transport abstraction, state management, and attachment support."

Từ khoá là **"general-purpose"** (đa dụng). Package này không biết nó đang chạy cho một coding Agent, một Agent chăm sóc khách hàng, hay bất kỳ Agent chuyên ngành nào khác. Nó chỉ biết:

- Cách duy trì trạng thái hội thoại (`AgentState` - Trạng thái Agent)
- Cách chạy một vòng lặp "gọi LLM → thực thi tool → gọi LLM lại" (`agentLoop` - vòng lặp Agent)
- Cách phát ra sự kiện trong vòng lặp để bên ngoài biết chuyện gì đang xảy ra (`AgentEvent` - sự kiện Agent)
- Cách quản lý lịch sử session và thực hiện nén ngữ cảnh (`Session`, `compact`)

Hãy nhìn những gì `index.ts` export:

```
// packages/agent/src/index.ts（节选）
export * from "./agent.js"               // Agent 类
export * from "./agent-loop.js"          // 循环函数
export * from "./harness/session/..."    // 会话管理
export * from "./harness/compaction/..." // 上下文压缩
export * from "./types.js"              // 类型定义
```

Không có "read" (đọc file), không có "bash" (chạy lệnh), không có "edit" (sửa code). Nó không quan tâm Agent làm gì cụ thể, chỉ quan tâm "làm sao để chạy một Agent".

### 2.3 pi-coding-agent: phụ trách "sản phẩm thực tế"

`@earendil-works/pi-coding-agent` (source ở `packages/coding-agent/`) trả lời câu hỏi: **làm sao để xây một coding assistant?**

Mô tả trong `package.json` của nó là:

> "Coding agent CLI with read, bash, edit, write tools and session management"

Lớp này "dày" nhất : hơn một trăm file source, nhiều hơn tổng hai lớp trên cộng lại. Bởi nó biết hết mọi thứ cụ thể:

- Bảy công cụ lập trình (read, bash, edit, write, grep, find, ls) được hiện thực như thế nào
- Hệ thống Extension tải và chạy ra sao
- Session được bền vững hoá xuống đĩa thế nào
- CLI phân tích tham số và render kết quả trên terminal ra sao
- Thông tin xác thực được lưu trữ thế nào

Điểm vào của nó là `cli.ts`, file được kích hoạt khi người dùng gõ `pi` trong terminal:

```
// packages/coding-agent/src/cli.ts
#!/usr/bin/env node
import { main } from "./main.js";
main(process.argv.slice(2));
```

Một điểm vào tí xíu, nhưng đằng sau là cả một chuỗi khởi động:

```
你输入: pi "帮我改个 bug"
│
├── cli.ts          ← 解析命令行参数
│   └── main.ts     ← 创建会话、选择运行模式（交互/打印/RPC）
│       └── AgentSession    ← 组装工具、加载扩展
│           └── Agent       ← 管理状态、跑循环
│               └── agentLoop()  ← 核心循环开始
```

### 2.4 pi-tui: phụ trách "hiển thị"

Package cuối cùng là lớp UI:

- **pi-tui**: thư viện UI terminal, chịu trách nhiệm render Markdown, tô màu cú pháp, và hiển thị sai phân (differential display) trong terminal. `dependencies` của nó **không chứa package nào liên quan tới AI** : runtime chỉ có `marked` (render Markdown) cộng `get-east-asian-width` (tính độ rộng ký tự Đông Á); `chalk` và `@xterm/headless` nằm trong devDependencies và không được đóng gói lúc runtime.

Package này không liên quan tới "Agent hoạt động thế nào". Nó chỉ render những gì Agent đang làm để người dùng nhìn thấy. Sau này trong sách chúng ta sẽ không đào sâu vào lớp này.

### 2.5 pi-orchestrator: phụ trách "điều phối đa Agent" (thử nghiệm)

`@earendil-works/pi-orchestrator` (source ở `packages/orchestrator/`) là một package **thử nghiệm** được thêm vào v0.80.x. Nó trả lời: **làm sao để nhiều thể hiện (instance) coding-agent phối hợp với nhau?**

Phần lõi của nó gồm vài file:

- `supervisor.ts` : supervisor quản lý vòng đời của các Agent con
- `rpc-process.ts` : giao tiếp giữa các tiến trình dựa trên RPC
- `radius.ts` : kiểm soát phạm vi/ranh giới cho việc điều phối
- `serve.ts` / `storage.ts` : phơi bày dịch vụ và bền vững hoá trạng thái

Lưu ý vị trí của nó: nó **phụ thuộc vào `pi-coding-agent`** và nằm trên coding-agent. Bản thân nó không hiện thực bất kỳ logic lõi nào của Agent (vòng lặp, trạng thái, compaction vẫn do agent-core cung cấp). Nó chỉ "dệt" nhiều thể hiện coding-agent lại với nhau để chúng có thể phân chia công việc, giao tiếp và được giám sát.

> ⚠️ Khả năng này đang thử nghiệm; cả API lẫn bố cục file đều có thể thay đổi. Lộ trình học chỉ đề cập tới bộ ba lõi (ai / agent-core / coding-agent); orchestrator có thể để dành cho phần nâng cao.

---

## 3. Sau khi đọc năm package, bạn đã có một trực giác

Sau khi đọc phần trên, có lẽ bạn đã có một bức tranh trong đầu rồi:

```
┌─────────────────────────────────────────────┐
│  pi-coding-agent：我知道怎么写代码            │  ← 最懂业务
│  （工具、扩展、CLI、会话持久化）               │
├─────────────────────────────────────────────┤
│  pi-agent-core：我知道怎么跑 Agent            │  ← 只懂框架
│  （循环、状态、事件、压缩）                    │
├─────────────────────────────────────────────┤
│  pi-ai：我知道怎么调模型                      │  ← 只懂模型
│  （统一 API、流式调用、30+ 提供商适配）        │
└─────────────────────────────────────────────┘

旁边还有一个独立的 UI 包：
┌──────────┐
│  pi-tui  │  ← 只管显示
└──────────┘
```

Phân lớp rất trực giác: tầng dưới gọi mô hình, tầng giữa chạy vòng lặp, tầng trên lo business. Đúng không?

Nhưng khoan :

---

## 4. Mở package.json ra, mọi thứ không đơn giản như vậy

> **Gợi ý đường đọc**: Mục 4–5 là **phần kiến trúc nâng cao**, đi sâu vào chi tiết quan hệ phụ thuộc và luồng kiểu dữ liệu. Mục 4 sửa lại hiểu lầm thường gặp về "phân lớp chặt" và làm rõ hướng phụ thuộc : **bắt buộc đọc nếu bạn dự định xây dựng trên SDK**. Mục 5 mở rộng sự tiến hoá kiểu dữ liệu qua ba lớp; phần này nghiêng về chi tiết hệ thống kiểu, bạn có thể quên tên trường mà không ảnh hưởng tới việc học sau này. **Nếu chỉ muốn lập và chạy nhanh, bạn có thể bỏ qua hai mục này và nhảy thẳng tới Mục 6 để xem "lời hứa phân lớp được giữ thế nào".**

Nếu trực giác phân lớp của bạn là "tầng trên chỉ được phép phụ thuộc vào tầng dưới kề nó", thì khi mở `packages/coding-agent/package.json` và nhìn vào trường `dependencies`, bạn sẽ thấy một chi tiết bất ngờ:

```
// packages/coding-agent/package.json
"dependencies": {
    "@earendil-works/pi-agent-core": "^0.80.2",   // ← 依赖中间层，合理
    "@earendil-works/pi-ai": "^0.80.2",            // ← 也直接依赖底层？
    "@earendil-works/pi-tui": "^0.80.2",
    // ... 其他依赖
}
```

pi-coding-agent phụ thuộc vào **cả** tầng giữa (pi-agent-core) **và** tầng dưới cùng (pi-ai). Trông như vi phạm "phân lớp chặt", nhưng thực ra đó là lựa chọn thiết kế có chủ đích.

### Câu trả lời nằm trong hệ thống kiểu dữ liệu

Một câu `import` ở đầu file `.ts` không phải là cách duy nhất một package "phụ thuộc" vào package khác. Với hệ thống kiểu cấu trúc (structural type system) của TypeScript, **tham chiếu kiểu cũng là phụ thuộc**, kể cả khi không có lời gọi runtime nào.

Lý do pi-coding-agent "với tay" sang pi-ai là ở cấp độ kiểu:

- pi-coding-agent cần **phơi bày các kiểu của pi-ai trong API công khai của chính nó** (ví dụ `Model`, `Provider`, `Usage`, `StopReason`).
- Những kiểu này sau đó được re-export để các Extension bên thứ ba có thể tạo đối tượng model mà không cần phụ thuộc trực tiếp vào pi-ai.

Nói ngắn gọn, pi-coding-agent **dùng** pi-agent-core lúc runtime (để chạy vòng lặp Agent) nhưng chỉ **re-export kiểu từ** pi-ai (để Extensions có một mặt phẳng import duy nhất).

Bạn có thể kiểm chứng bằng cách mở `packages/agent/src/types.ts` : hầu như mọi kiểu nền tảng mà pi-agent-core cần đều đến từ pi-ai:

```
// packages/agent/src/types.ts:1-14
import type {
    Api,
    AssistantMessage,
    AssistantMessageEvent,
    AssistantMessageEventStream,
    Context,
    ImageContent,
    Message,
    Model,
    SimpleStreamOptions,
    TextContent,
    Tool,
    ToolResultMessage,
} from "@earendil-works/pi-ai";
```

Các định nghĩa kiểu của pi-agent-core import rất nhiều kiểu nền tảng từ pi-ai: `Message`, `Model`, `ImageContent`, `Tool`... Đây là những "khái niệm nguyên tử" của cả hệ thống : như các nguyên tố hoá học, mọi tầng đều cần định nghĩa của các "nguyên tử".

### Vậy quy tắc phân lớp thực sự là gì?

Ngừng nghĩ phân lớp là "chỉ được phép phụ thuộc tầng kề". Quy tắc thực sự là một chiều:

> **Code tầng dưới không được tham chiếu bất kỳ ký hiệu nào ở tầng trên.**

Tức là:

- pi-ai không được import bất cứ thứ gì từ pi-agent-core hay pi-coding-agent.
- pi-agent-core không được import bất cứ thứ gì từ pi-coding-agent.
- pi-coding-agent có thể import bất cứ thứ gì ở phía dưới nó (và nó làm vậy).

Sự bất đối xứng được cho phép vì "phụ thuộc tầng dưới" lúc runtime chỉ là trường hợp rõ ràng nhất; quy tắc hướng phụ thuộc quan tâm tới chuyện "tầng dưới không được biết tầng trên".

> Phản ví dụ: nếu `index.ts` của pi-ai chứa `import { AgentState } from "@earendil-works/pi-agent-core"`, đó sẽ là vi phạm phân lớp. Nhưng pi-ai chưa bao giờ mang bất kỳ import nào như vậy : có thể kiểm chứng bằng `grep -r "@earendil-works/pi-agent-core\|@earendil-works/pi-coding-agent" packages/ai/src/`, lệnh này trả về không kết quả.

Vậy quy tắc phân lớp không phải "chỉ tầng kề". Nó là "**nghiêm ngặt một chiều: tầng dưới không biết tầng trên**".

Minh hoạ hướng phụ thuộc:

```
pi-ai（底层）
  ↑         ↑
  │         │
  │    pi-agent-core（中间层）
  │         ↑
  │         │
  └─── pi-coding-agent（顶层）
            ↑
            │
       pi-orchestrator（实验性外围编排层，可选）
```

Tất cả mũi tên đều chỉ lên. **Tầng dưới không bao giờ biết về sự tồn tại của tầng trên** : không có import nào trong code pi-ai trỏ tới pi-agent-core hay pi-coding-agent; orchestrator cũng không xâm nhập ngược vào bên trong coding-agent. Đó mới là quy tắc thực sự của phân lớp: **không giới hạn chiều sâu tham chiếu, mà đảm bảo hướng phụ thuộc nghiêm ngặt đi lên.**

---

## 5. Sự tiến hoá kiểu dữ liệu giữa các lớp: từ nguyên tử tới phân tử

Bây giờ quy tắc phụ thuộc đã rõ, ta có thể dùng hệ thống kiểu để làm cho sự tiến hoá giữa các lớp cụ thể hơn nữa.

### Lớp 1: pi-ai định nghĩa các nguyên tử

Trong pi-ai, một `Tool` là đơn vị tool nhỏ nhất có thể : chỉ đủ trường để mô tả tool đó là gì:

```
// packages/ai/src/types.ts（节选）
// 最基础的消息类型:所有 LLM 都认的格式
type Message = UserMessage | AssistantMessage | ToolResultMessage

// 模型定义:描述一个 LLM 的全部信息
interface Model<TApi> {
    id: string           // 如 "claude-sonnet-4-6"
    name: string
    api: TApi            // 如 "anthropic-messages"
    contextWindow: number // 如 200000
    // ... 更多字段
}

// 工具定义:描述一个工具的 schema
interface Tool<TSchema> {
    name: string
    description: string
    parameters: TSchema
}
```

Chỉ vậy thôi. Không có `execute`, không có UI hint, không có `approval`. Nó chỉ là một **mô tả ở cấp kiểu dữ liệu**.

### Lớp 2: pi-agent-core gộp các nguyên tử thành phân tử

Trong pi-agent-core, `AgentTool` được xây dựng trên `Tool`, với một hàm thực thi được thêm vào:

```
// packages/agent/src/types.ts（节选）
import type {
    Message, Model, Tool, ImageContent, ...
} from "@earendil-works/pi-ai";

// 扩展消息：除了标准 LLM 消息，还可以有自定义消息
type AgentMessage = Message | CustomAgentMessages[keyof CustomAgentMessages]

// 扩展工具：除了 schema，还有参数预处理、执行函数和执行模式（types.ts:371-394）
interface AgentTool<TParameters extends TSchema = TSchema, TDetails = any> extends Tool<TParameters> {
    label: string                                    // 显示名称
    prepareArguments?: (args: unknown) => Static<TParameters>   // 参数预处理
    execute: (toolCallId: string, params, signal?: AbortSignal, onUpdate?: AgentToolUpdateCallback<TDetails>) => Promise<AgentToolResult<TDetails>>
    executionMode?: ToolExecutionMode                 // "sequential" | "parallel"
}
```

`AgentTool` là một "phân tử" : nó vẫn có `name`, `description`, và `parameters`, nhưng thêm khả năng **chạy thực sự**. Vòng lặp Agent sẽ duyệt qua `AgentTool[]`, gọi `execute` của từng tool, và đưa kết quả ngược về mô hình.

### Lớp 3: pi-coding-agent kết hợp phân tử thành vật liệu

Trong pi-coding-agent, `ToolDefinition` cuối cùng bao bọc `AgentTool` với mọi thứ liên quan tới UI / phân quyền:

```
// packages/coding-agent/src/core/extensions/types.ts:435-482（节选）
// 工具定义（产品视角）:完整接口有 10+ 个字段，下面列出关键字段
// 注意：ToolDefinition 在 TypeScript 层面是独立 interface 重新声明，
// 与 AgentTool 是"结构兼容"而非用 extends 继承（详见 types.ts:435）
interface ToolDefinition<TParams extends TSchema, TDetails = unknown, TState = any> {
    name: string
    label: string                         // UI 展示名
    description: string
    promptSnippet?: string                // 自动拼到 system prompt 的工具片段
    promptGuidelines?: string[]           // 工具使用守则
    parameters: TParams
    renderShell?: "default" | "self"      // 渲染模式
    prepareArguments?: (args: unknown) => Static<TParams>   // 参数预处理钩子
    executionMode?: ToolExecutionMode     // 并行/串行
    execute: (toolCallId, params, signal, onUpdate, ctx: ExtensionContext) => Promise<AgentToolResult<TDetails>>  // 签名扩展：比 AgentTool.execute 多 ctx 参数
    renderCall?: ...                      // 自定义调用渲染
    // ... 还有渲染器、UI 组件等业务属性
}

// 扩展定义（运行时聚合体，types.ts:1585-1595）
interface Extension {
    path: string                                       // 扩展路径
    resolvedPath: string                               // 解析后的绝对路径
    sourceInfo: SourceInfo                             // 来源信息
    handlers: Map<string, HandlerFn[]>                 // 各类处理器
    tools: Map<string, RegisteredTool>                 // 注册的工具（Map，非 Record）
    messageRenderers: Map<string, MessageRenderer>     // 消息渲染器
    commands: Map<string, RegisteredCommand>           // 注册的命令（Map，非 Record）
    flags: Map<string, ExtensionFlag>                  // 扩展标志
    shortcuts: Map<KeyId, ExtensionShortcut>           // 快捷键绑定
}
```

Đây là hình dạng mà 7 tool thực tế của pi-coding-agent hiện thực (`read`, `bash`, `edit`, `write`, `grep`, `find`, `ls`).

### So sánh Before → After của sự tiến hoá kiểu dữ liệu

Để sự tiến hoá cụ thể hơn, đây là chuỗi mở rộng kiểu dữ liệu theo từng lớp:

```
Before（pi-ai 层）：Tool 只知道"长什么样"
────────────────────────────────────────────
interface Tool<TSchema> {
    name: string
    description: string
    parameters: TSchema
}

         ↓ agent-core 扩展

After（pi-agent-core 层）：AgentTool 知道"怎么执行"
────────────────────────────────────────────
interface AgentTool<TSchema> extends Tool<TSchema> {
    label: string                              ← 新增
    execute: (...) => Promise<AgentToolResult> ← 新增
    executionMode?: "sequential" | "parallel"  ← 新增
}

         ↓ coding-agent 扩展

After（pi-coding-agent 层）：ToolDefinition 加上"怎么显示"
────────────────────────────────────────────
interface ToolDefinition {
    // 继承 AgentTool 的全部字段
    // + 渲染器、权限控制等业务属性
}
```

---

## 6. Khi viết Agent của riêng tôi, tôi có thực sự cần ba lớp không?

Bạn có thể thắc mắc: kiến trúc phân lớp của Pi trông hay đấy, nhưng liệu nó có quá thiết kế cho dự án Agent của riêng bạn?

Hãy thực sự đi qua ba kịch bản để xem.

### Kịch bản A: không phân lớp, tất cả gom vào một file

```
// 假设：不分层的 Agent
import OpenAI from "openai";

const client = new OpenAI();
const messages = [];

while (true) {
    const response = await client.chat.completions.create({
        model: "gpt-4o",
        messages,
    });
    // 解析工具调用、执行、追加到 messages ...
}
```

Chạy được cho dự án rất nhỏ, nhưng ngay khi Agent vượt quá ~1000 dòng, mỗi lần sửa sẽ thành ác mộng: đổi màu UI thì động vào logic vòng lặp, đổi nhà cung cấp LLM thì động vào phần thực thi tool. Conflict khi merge cứ chồng chất.

### Kịch bản B: chỉ hai lớp (bỏ lớp coding-agent)

```
// 只用底层 + 中间层
import { Agent, agentLoop } from "@earendil-works/pi-agent-core";
import { streamSimple } from "@earendil-works/pi-ai";
```

Tốt hơn, nhưng bạn phải tự viết lại phần phân tích tham số CLI và quản lý session mỗi lần. Và các tool của bạn sẽ bị ghép chặt với kịch bản Agent cụ thể : chúng không thể được các Agent khác tái sử dụng.

### Kịch bản C: chỉ một lớp (chỉ pi-ai)

```
// 只用底层
import { streamSimple } from "@earendil-works/pi-ai";

const stream = streamSimple(model, context);
for await (const event of stream) {
    console.log(event);
}
```

Cũng hoàn toàn ổn. Bản thân pi-ai đã là một package độc lập : gọi LLM, streaming kết quả, không cần framework Agent nào.

Nhưng khi đó bạn sẽ phải tự viết vòng lặp, tự quản lý trạng thái thông điệp, và tự xử lý các lời gọi tool. Đó chính là lý do pi-agent-core tồn tại : **nó làm phần khó nhất của một Agent (vòng lặp, trạng thái, sự kiện, nén) thay bạn, bạn chỉ cần nói với nó dùng những tool nào.**

### Phân lớp không phải giáo điều; kiểm soát hướng phụ thuộc mới là

Ba kịch bản trên ngụ ý:

| Kịch bản | Phù hợp khi | Bạn tự làm gì |
|---|---|---|
| Chỉ pi-ai | Bạn chỉ cần gọi LLM, không cần vòng lặp Agent | Tự quản lý trạng thái, tự viết vòng lặp (nếu cần) |
| pi-ai + pi-agent-core | Bạn cần năng lực Agent đầy đủ nhưng có kịch bản business riêng | Tự viết các tool, tự viết điểm vào của mình |
| Cả ba lớp | Đang xây một coding assistant cùng đẳng cấp với Pi | Dùng trực tiếp, hoặc viết Extension |

Số lượng lớp tuỳ thuộc vào độ phức tạp của bạn. Nhưng dù bao nhiêu lớp đi nữa, có một quy tắc không được phép phá vỡ:

**Code tầng dưới không được chứa bất kỳ tham chiếu nào tới tầng trên.**

pi-ai không được import bất cứ thứ gì từ pi-agent-core. pi-agent-core không được import bất cứ thứ gì từ pi-coding-agent. Quy tắc này đảm bảo bạn có thể thay bất kỳ lớp nào bằng hiện thực của riêng mình mà không động đến các lớp khác. Ví dụ, bạn có thể thay pi-ai bằng lớp gọi mô hình của riêng bạn, và cả pi-agent-core lẫn pi-coding-agent đều không cần đổi.

---

## 7. Ba phương pháp có thể mang đi

Từ thiết kế phân lớp của Pi, tôi rút ra ba phương pháp có thể tái sử dụng cho dự án Agent của chính bạn.

### Phương pháp 1: "phễu phụ thuộc" (dependency funnel)

**Nó là gì**: khi thiết kế cấu trúc package, vẽ mũi tên phụ thuộc trước. Tầng dưới là "không biết gì về thế giới bên ngoài", tầng giữa là "biết tầng dưới nhưng không biết business", tầng trên là "biết tất cả".

**Cách làm**:

1. Tìm phần code "hoàn toàn không phụ thuộc bất kỳ tri thức bên ngoài nào" → tầng dưới
2. Tìm phần "phụ thuộc tầng dưới nhưng không biết business cụ thể" → tầng giữa
3. Tìm phần "biết người dùng muốn gì" → tầng trên
4. Kiểm tra: nếu thứ gì ở tầng trên bị tầng dưới import, phân lớp của bạn đang có vấn đề

**Cách kiểm chứng**: tự hỏi "nếu bỏ tầng trên đi, tầng dưới này còn chạy được không?" Nếu có, hướng phụ thuộc đúng. Nếu không, tầng trên đã rò rỉ xuống tầng dưới.

### Phương pháp 2: pattern "tiến hoá kiểu dữ liệu từng bước"

**Nó là gì**: tầng dưới định nghĩa interface kiểu nhỏ nhất; tầng trên mở rộng qua union types (`|`) và kế thừa (`extends`) thay vì sửa các kiểu của tầng dưới.

**Cách làm**:

1. Tầng dưới định nghĩa kiểu nguyên tử (ví dụ `Tool = { name, description, parameters }`)
2. Tầng giữa mở rộng bằng kế thừa (ví dụ `AgentTool extends Tool`, thêm trường `execute`)
3. Tầng trên xếp chồng các thuộc tính business (ví dụ `ToolDefinition`, thêm renderer)
4. Mỗi tầng chỉ thêm những thứ nó quan tâm; không sửa tầng dưới

**Lợi ích**: tầng dưới có thể được phát hành và tái sử dụng độc lập. Người khác có thể tham chiếu các kiểu tầng dưới của bạn mà không kéo theo cả framework Agent.

### Phương pháp 3: test "có thể dùng độc lập"

**Nó là gì**: sau khi thiết kế xong mỗi lớp, làm một bài test đơn giản : bỏ tầng trên đi, lớp này còn hoạt động được không?

Cả ba lớp của Pi đều vượt qua bài test này:

- Bỏ pi-agent-core và pi-coding-agent, pi-ai vẫn có thể tự gọi LLM.
- Bỏ pi-coding-agent, pi-ai + pi-agent-core vẫn chạy được một Agent tuỳ biến.
- Cả ba cùng dùng sẽ là một coding assistant hoàn chỉnh.

**Cách làm**: trong `package.json` của bạn, tạm thời gỡ các phụ thuộc tầng trên và xem package tầng dưới còn compile và test qua không. Nếu lỗi, tầng dưới của bạn đã làm rò rỉ một phụ thuộc tầng trên.

---

## 8. Bước tiếp theo: đào vào trung tâm của Agent

Trong chương này chúng ta đã nhìn từ bên ngoài vào toàn bộ kiến trúc của Pi. Bạn đã biết:

- Pi được phân ba lớp: pi-ai (lo mô hình) → pi-agent-core (lo vòng lặp) → pi-coding-agent (lo business)
- Quy tắc phân lớp cốt lõi là **phụ thuộc một chiều, tầng dưới không biết gì về tầng trên**
- Kiểu dữ liệu mở rộng dần từ dưới lên trên: `Tool` → `AgentTool` → `ToolDefinition`
- Ba lớp không phải là bắt buộc; số lớp tuỳ thuộc vào độ phức tạp. Nhưng kiểm soát hướng phụ thuộc là bắt buộc.

Nhưng ta vẫn chưa trả lời một câu hỏi nền tảng hơn: Agent thực sự chạy thế nào? LLM cứ suy nghĩ, gọi tool, đọc kết quả, lại suy nghĩ : như thế nào? "Vòng lặp Agent" nổi tiếng kia trông ra sao?

Ở chương sau, ta đào vào trung tâm của Agent : **Vòng lặp Agent**. Ta sẽ hiểu vì sao cần một vòng lặp (thay vì gọi một lần là xong), rồi truy ngược hành trình đầy đủ của một thông điệp người dùng từ lúc nhấn Enter cho tới khi Agent nói "tôi đã xong".

---

> **Về cấu trúc cuốn sách**: các chương 1–6 (Chương 1 Mở đầu → Chương 6 Hệ thống Message) xây dựng sự hiểu biết hoàn chỉnh về cơ chế lõi của Pi-Agent; nên đọc theo thứ tự. Từ Chương 7 (Event-Driven, Context Engineering, Context Compaction, Quản lý Session, v.v.) trở đi, các chủ đề trở thành những vấn đề kỹ thuật nâng cao; mỗi chương tương đối độc lập và có thể đọc theo nhu cầu.
