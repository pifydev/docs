---
title: "Chương 2: Kiến trúc ba lớp: Bộ xương của Pi-Agent"
chapter: 2
slug: vi/ch02-three-layer-arch
title_zh: "第2章：三层架构: Pi-Agent 项目的骨骼"
title_en: "Chapter 2: Three-Layer Architecture: Pi-Agent Project Skeleton"
title_vi: "Chương 2: Kiến trúc ba lớp: Bộ xương của Pi-Agent"
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
last_updated: "2026-08-20"
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

# Chương 2: Kiến trúc ba lớp: Bộ xương của Pi-Agent

> Trong chương này, chúng ta đứng từ trên cao nhìn xuống toàn bộ kiến trúc của Pi: code nằm ở đâu, các package phụ thuộc lẫn nhau ra sao, và kiểu dữ liệu chảy giữa các lớp như thế nào. Khi đã có bức tranh toàn cảnh này, việc đào sâu vào bất kỳ module nào sau này cũng không làm bạn lạc.

---

## 1. Bạn vừa mở một codebase Agent

Giả sử bạn vừa clone kho chứa (repository) của Pi và gõ `ls` trong terminal. Đây là cấu trúc thư mục bạn sẽ thấy:

```
repo/
├── packages/
│ ├── ai/ ← @earendil-works/pi-ai
│ ├── agent/ ← @earendil-works/pi-agent-core
│ ├── coding-agent/ ← @earendil-works/pi-coding-agent
│ ├── orchestrator/ ← @earendil-works/pi-orchestrator(thực nghiệm, nhiều Agent Sắp xếp)
│ └── tui/ ← @earendil-works/pi-tui
├── package.json ← cấu hình gốc, npm workspaces
└── tsconfig.json
```

Năm package, xếp thẳng hàng gọn gàng.

> Ghi chú 1: Trước đây từng có package `pi-web-ui` (thư viện component Lit cho trình duyệt), nhưng nó đã bị xoá khỏi workspace tại commit `b141e1fa` ngày 2026-05-20; kho chứa hiện tại không còn chứa package đó nữa.
> Ghi chú 2: `pi-orchestrator` là package điều phối thử nghiệm, được thêm vào v0.80.x. Nó phụ thuộc vào `pi-coding-agent` và xử lý việc phối hợp đa Agent, giao tiếp giữa các tiến trình qua RPC, và giám sát bằng Supervisor. Nó thuộc về **lớp điều phối ngoài**, không nằm trong lộ trình học "bộ ba lõi", và sẽ được mô tả riêng ở cuối module này.

Nếu bạn đã từng làm dự án Node.js, chắc hẳn bạn đã dùng monorepo (nhiều package được quản lý trong cùng một kho chứa). Pi dùng cách tiếp cận npm workspaces tiêu chuẩn: `package.json` gốc khai báo `"workspaces": ["packages/*"]`, và npm sẽ tự động coi mỗi thư mục con dưới `packages/` là một package độc lập.

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

1. **Định nghĩa các kiểu dữ liệu thống nhất (unified types)**: dù bạn dùng OpenAI, Anthropic, Google hay AWS Bedrock, định dạng thông điệp đều giống nhau: `UserMessage`, `AssistantMessage`, `ToolResultMessage`, và định nghĩa mô hình là `Model<TApi>`.
2. **Hợp nhất luồng gọi (unify streaming calls)**: mọi luồng gọi tới các nhà cung cấp được gom về một hàm `streamSimple()` duy nhất, trả về `AssistantMessageEventStream` (một stream bạn có thể đọc từng token).
3. **Thích ứng với hơn 30 nhà cung cấp**: hỗ trợ trên 30 nhà cung cấp, từ OpenAI, Claude, Gemini tới DeepSeek, Groq, Xiaomi, v.v., mỗi nhà cung cấp có một file adapter riêng.

Chỉ cần nhìn những gì `index.ts` của nó export là rõ:

```
// packages/ai/src/index.ts(v0.80.x đoạn trích)
// Bình luận hàng đầu nói rõ ràng: Core only, side-effect free: no generated catalogs,
// no provider factories, no api-registry, no OAuth implementations, no compat.
// tình hình chung API Đăng ký, stream/complete Các chức năng, v.v. đã được chuyển đến ./compat.ts(packages/ai/src/compat.ts)
export type { Static, TSchema } from "typebox";
export { Type } from "typebox";
export * from "./api/lazy.ts" // mỗi Provider API Mục tải chậm
export * from "./auth/context.ts" // Bối cảnh xác thực
export * from "./auth/credential-store.ts"
export * from "./auth/helpers.ts"
export * from "./auth/types.ts"
export * from "./images-models.ts"
export * from "./models.ts" // Định nghĩa mô hình(KnownProvider 35 một)
export * from "./types.ts" // loại thống nhất
export * from "./utils/event-stream.ts" // lớp cơ sở luồng sự kiện
// Lối vào cuộc gọi trực tuyến(stream / streamSimple)thực sự nằm ở ./compat.ts
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
// packages/agent/src/index.ts(đoạn trích)
export * from "./agent.js" // Agent lớp học
export * from "./agent-loop.js" // chức năng vòng lặp
export * from "./harness/session/..." // Quản lý phiên
export * from "./harness/compaction/..." // Nén ngữ cảnh
export * from "./types.js" // định nghĩa kiểu
```

Không có "read" (đọc file), không có "bash" (chạy lệnh), không có "edit" (sửa code). Nó không quan tâm Agent làm gì cụ thể, chỉ quan tâm "làm sao để chạy một Agent".

### 2.3 pi-coding-agent: phụ trách "sản phẩm thực tế"

`@earendil-works/pi-coding-agent` (source ở `packages/coding-agent/`) trả lời câu hỏi: **làm sao để xây một coding assistant?**

Mô tả trong `package.json` của nó là:

> "Coding agent CLI with read, bash, edit, write tools and session management"

Lớp này "dày" nhất: hơn một trăm file source, nhiều hơn tổng hai lớp trên cộng lại. Bởi nó biết hết mọi thứ cụ thể:

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
bạn vào: pi "Giúp tôi thay đổi nó bug"
│
├── cli.ts ← Phân tích các tham số dòng lệnh
│ └── main.ts ← Tạo phiên, Chọn chế độ vận hành(sự tương tác/In/RPC)
│ └── AgentSession ← Dụng cụ lắp ráp, Tải tiện ích mở rộng
│ └── Agent ← Tình trạng quản lý, Chạy vòng lặp
│ └── agentLoop() ← vòng lặp cốt lõi bắt đầu
```

### 2.4 pi-tui: phụ trách "hiển thị"

Package cuối cùng là lớp UI:

- **pi-tui**: thư viện UI terminal, chịu trách nhiệm render Markdown, tô màu cú pháp, và hiển thị sai phân (differential display) trong terminal. `dependencies` của nó **không chứa package nào liên quan tới AI**: runtime chỉ có `marked` (render Markdown) cộng `get-east-asian-width` (tính độ rộng ký tự Đông Á); `chalk` và `@xterm/headless` nằm trong devDependencies và không được đóng gói lúc runtime.

Package này không liên quan tới "Agent hoạt động thế nào". Nó chỉ render những gì Agent đang làm để người dùng nhìn thấy. Sau này trong sách chúng ta sẽ không đào sâu vào lớp này.

### 2.5 pi-orchestrator: phụ trách "điều phối đa Agent" (thử nghiệm)

`@earendil-works/pi-orchestrator` (source ở `packages/orchestrator/`) là một package **thử nghiệm** được thêm vào v0.80.x. Nó trả lời: **làm sao để nhiều thể hiện (instance) coding-agent phối hợp với nhau?**

Phần lõi của nó gồm vài file:

- `supervisor.ts`: supervisor quản lý vòng đời của các Agent con
- `rpc-process.ts`: giao tiếp giữa các tiến trình dựa trên RPC
- `radius.ts`: kiểm soát phạm vi/ranh giới cho việc điều phối
- `serve.ts` / `storage.ts`: phơi bày dịch vụ và bền vững hoá trạng thái

Lưu ý vị trí của nó: nó **phụ thuộc vào `pi-coding-agent`** và nằm trên coding-agent. Bản thân nó không hiện thực bất kỳ logic lõi nào của Agent (vòng lặp, trạng thái, compaction vẫn do agent-core cung cấp). Nó chỉ "dệt" nhiều thể hiện coding-agent lại với nhau để chúng có thể phân chia công việc, giao tiếp và được giám sát.

> ⚠️ Khả năng này đang thử nghiệm; cả API lẫn bố cục file đều có thể thay đổi. Lộ trình học chỉ đề cập tới bộ ba lõi (ai / agent-core / coding-agent); orchestrator có thể để dành cho phần nâng cao.

---

## 3. Sau khi đọc năm package, bạn đã có một trực giác

Sau khi đọc phần trên, có lẽ bạn đã có một bức tranh trong đầu rồi:

```
┌─────────────────────────────────────────────┐
│ pi-coding-agent: Tôi biết cách viết mã │ ← Biết rõ nhất về kinh doanh
│ (Công cụ, Mở rộng, CLI, Sự kiên trì của phiên) │
├─────────────────────────────────────────────┤
│ pi-agent-core: tôi biết cách chạy Agent │ ← Chỉ hiểu khuôn khổ
│ (vòng lặp, Trạng thái, sự kiện, nén) │
├─────────────────────────────────────────────┤
│ pi-ai: Tôi biết cách gọi model │ ← Chỉ hiểu mô hình
│ (thống nhất API, Truyền trực tuyến cuộc gọi, 30+ Sự thích ứng của nhà cung cấp) │
└─────────────────────────────────────────────┘

Ngoài ra còn có một cái riêng bên cạnh UI gói: 
┌──────────┐
│ pi-tui │ ← Chỉ hiển thị
└──────────┘
```

Phân lớp rất trực giác: tầng dưới gọi mô hình, tầng giữa chạy vòng lặp, tầng trên lo business. Đúng không?

Nhưng khoan :

---

## 4. Mở package.json ra, mọi thứ không đơn giản như vậy

> **Gợi ý đường đọc**: Mục 4–5 là **phần kiến trúc nâng cao**, đi sâu vào chi tiết quan hệ phụ thuộc và luồng kiểu dữ liệu. Mục 4 sửa lại hiểu lầm thường gặp về "phân lớp chặt" và làm rõ hướng phụ thuộc: **bắt buộc đọc nếu bạn dự định xây dựng trên SDK**. Mục 5 mở rộng sự tiến hoá kiểu dữ liệu qua ba lớp; phần này nghiêng về chi tiết hệ thống kiểu, bạn có thể quên tên trường mà không ảnh hưởng tới việc học sau này. **Nếu chỉ muốn lập và chạy nhanh, bạn có thể bỏ qua hai mục này và nhảy thẳng tới Mục 6 để xem "lời hứa phân lớp được giữ thế nào".**

Nếu trực giác phân lớp của bạn là "tầng trên chỉ được phép phụ thuộc vào tầng dưới kề nó", thì khi mở `packages/coding-agent/package.json` và nhìn vào trường `dependencies`, bạn sẽ thấy một chi tiết bất ngờ:

```
// packages/coding-agent/package.json
"dependencies": {
 "@earendil-works/pi-agent-core": "^0.80.2", // ← Phụ thuộc vào lớp giữa, hợp lý
 "@earendil-works/pi-ai": "^0.80.2", // ← Cũng phụ thuộc trực tiếp vào cơ sở？
 "@earendil-works/pi-tui": "^0.80.2",
 // ... Các phụ thuộc khác
}
```

pi-coding-agent phụ thuộc vào **cả** tầng giữa (pi-agent-core) **và** tầng dưới cùng (pi-ai). Trông như vi phạm "phân lớp chặt", nhưng thực ra đó là lựa chọn thiết kế có chủ đích.

### Câu trả lời nằm trong hệ thống kiểu dữ liệu

Một câu `import` ở đầu file `.ts` không phải là cách duy nhất một package "phụ thuộc" vào package khác. Với hệ thống kiểu cấu trúc (structural type system) của TypeScript, **tham chiếu kiểu cũng là phụ thuộc**, kể cả khi không có lời gọi runtime nào.

Lý do pi-coding-agent "với tay" sang pi-ai là ở cấp độ kiểu:

- pi-coding-agent cần **phơi bày các kiểu của pi-ai trong API công khai của chính nó** (ví dụ `Model`, `Provider`, `Usage`, `StopReason`).
- Những kiểu này sau đó được re-export để các Extension bên thứ ba có thể tạo đối tượng model mà không cần phụ thuộc trực tiếp vào pi-ai.

Nói ngắn gọn, pi-coding-agent **dùng** pi-agent-core lúc runtime (để chạy vòng lặp Agent) nhưng chỉ **re-export kiểu từ** pi-ai (để Extensions có một mặt phẳng import duy nhất).

Bạn có thể kiểm chứng bằng cách mở `packages/agent/src/types.ts`: hầu như mọi kiểu nền tảng mà pi-agent-core cần đều đến từ pi-ai:

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

Các định nghĩa kiểu của pi-agent-core import rất nhiều kiểu nền tảng từ pi-ai: `Message`, `Model`, `ImageContent`, `Tool`... Đây là những "khái niệm nguyên tử" của cả hệ thống: như các nguyên tố hoá học, mọi tầng đều cần định nghĩa của các "nguyên tử".

### Vậy quy tắc phân lớp thực sự là gì?

Ngừng nghĩ phân lớp là "chỉ được phép phụ thuộc tầng kề". Quy tắc thực sự là một chiều:

> **Code tầng dưới không được tham chiếu bất kỳ ký hiệu nào ở tầng trên.**

Tức là:

- pi-ai không được import bất cứ thứ gì từ pi-agent-core hay pi-coding-agent.
- pi-agent-core không được import bất cứ thứ gì từ pi-coding-agent.
- pi-coding-agent có thể import bất cứ thứ gì ở phía dưới nó (và nó làm vậy).

Sự bất đối xứng được cho phép vì "phụ thuộc tầng dưới" lúc runtime chỉ là trường hợp rõ ràng nhất; quy tắc hướng phụ thuộc quan tâm tới chuyện "tầng dưới không được biết tầng trên".

> Phản ví dụ: nếu `index.ts` của pi-ai chứa `import { AgentState } from "@earendil-works/pi-agent-core"`, đó sẽ là vi phạm phân lớp. Nhưng pi-ai chưa bao giờ mang bất kỳ import nào như vậy: có thể kiểm chứng bằng `grep -r "@earendil-works/pi-agent-core\|@earendil-works/pi-coding-agent" packages/ai/src/`, lệnh này trả về không kết quả.

Vậy quy tắc phân lớp không phải "chỉ tầng kề". Nó là "**nghiêm ngặt một chiều: tầng dưới không biết tầng trên**".

Minh hoạ hướng phụ thuộc:

```
pi-ai(Tầng trệt)
 ↑ ↑
 │ │
 │ pi-agent-core(lớp giữa)
 │ ↑
 │ │
 └─── pi-coding-agent(cấp cao nhất)
 ↑
 │
 pi-orchestrator(Lớp điều phối ngoại vi thử nghiệm, Tùy chọn)
```

Tất cả mũi tên đều chỉ lên. **Tầng dưới không bao giờ biết về sự tồn tại của tầng trên**: không có import nào trong code pi-ai trỏ tới pi-agent-core hay pi-coding-agent; orchestrator cũng không xâm nhập ngược vào bên trong coding-agent. Đó mới là quy tắc thực sự của phân lớp: **không giới hạn chiều sâu tham chiếu, mà đảm bảo hướng phụ thuộc nghiêm ngặt đi lên.**

---

## 5. Sự tiến hoá kiểu dữ liệu giữa các lớp: từ nguyên tử tới phân tử

Bây giờ quy tắc phụ thuộc đã rõ, ta có thể dùng hệ thống kiểu để làm cho sự tiến hoá giữa các lớp cụ thể hơn nữa.

### Lớp 1: pi-ai định nghĩa các nguyên tử

Trong pi-ai, một `Tool` là đơn vị tool nhỏ nhất có thể: chỉ đủ trường để mô tả tool đó là gì:

```
// packages/ai/src/types.ts(đoạn trích)
// Loại tin nhắn cơ bản nhất:tất cả LLM Một định dạng mà mọi người đều nhận ra
type Message = UserMessage | AssistantMessage | ToolResultMessage

// Định nghĩa mô hình:mô tả một LLM Tất cả thông tin của
interface Model<TApi> {
 id: string // Chẳng hạn như "claude-sonnet-4-6"
 name: string
 api: TApi // Chẳng hạn như "anthropic-messages"
 contextWindow: number // Chẳng hạn như 200000
 // ... Thêm trường
}

// Định nghĩa công cụ:Mô tả một công cụ schema
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
// packages/agent/src/types.ts(đoạn trích)
import type {
 Message, Model, Tool, ImageContent, ...
} from "@earendil-works/pi-ai";

// tin nhắn mở rộng: Ngoài tiêu chuẩn LLM tin tức, Bạn cũng có thể có tin nhắn tùy chỉnh
type AgentMessage = Message | CustomAgentMessages[keyof CustomAgentMessages]

// Công cụ mở rộng: Ngoại trừ schema, Ngoài ra còn có tiền xử lý tham số, Chức năng thực thi và chế độ thực thi(types.ts:371-394)
interface AgentTool<TParameters extends TSchema = TSchema, TDetails = any> extends Tool<TParameters> {
 label: string // tên hiển thị
 prepareArguments?: (args: unknown) => Static<TParameters> // Tiền xử lý tham số
 execute: (toolCallId: string, params, signal?: AbortSignal, onUpdate?: AgentToolUpdateCallback<TDetails>) => Promise<AgentToolResult<TDetails>>
 executionMode?: ToolExecutionMode // "sequential" | "parallel"
}
```

`AgentTool` là một "phân tử": nó vẫn có `name`, `description`, và `parameters`, nhưng thêm khả năng **chạy thực sự**. Vòng lặp Agent sẽ duyệt qua `AgentTool[]`, gọi `execute` của từng tool, và đưa kết quả ngược về mô hình.

### Lớp 3: pi-coding-agent kết hợp phân tử thành vật liệu

Trong pi-coding-agent, `ToolDefinition` cuối cùng bao bọc `AgentTool` với mọi thứ liên quan tới UI / phân quyền:

```
// packages/coding-agent/src/core/extensions/types.ts:435-482(đoạn trích)
// Định nghĩa công cụ(Quan điểm sản phẩm):Giao diện hoàn chỉnh là 10+ lĩnh vực, Các trường chính được liệt kê dưới đây
// Lưu ý: ToolDefinition trong TypeScript cấp độ độc lập interface trình bày lại, 
// với AgentTool Có"Tương thích về mặt kiến trúc"thay vì sử dụng extends sự kế thừa(Xem chi tiết types.ts:435)
interface ToolDefinition<TParams extends TSchema, TDetails = unknown, TState = any> {
 name: string
 label: string // UI tên hiển thị
 description: string
 promptSnippet?: string // Tự động đánh vần system prompt mảnh công cụ
 promptGuidelines?: string[] // Hướng dẫn sử dụng công cụ
 parameters: TParams
 renderShell?: "default" | "self" // Chế độ kết xuất
 prepareArguments?: (args: unknown) => Static<TParams> // Móc tiền xử lý tham số
 executionMode?: ToolExecutionMode // Song song/nối tiếp
 execute: (toolCallId, params, signal, onUpdate, ctx: ExtensionContext) => Promise<AgentToolResult<TDetails>> // Phần mở rộng chữ ký: hơn AgentTool.execute nhiều ctx thông số
 renderCall?: ... // Kết xuất cuộc gọi tùy chỉnh
 // ... Và trình kết xuất, UI Các thành phần và thuộc tính kinh doanh khác
}

// định nghĩa mở rộng(tổng hợp thời gian chạy, types.ts:1585-1595)
interface Extension {
 path: string // Đường dẫn mở rộng
 resolvedPath: string // Đường dẫn tuyệt đối đã được giải quyết
 sourceInfo: SourceInfo // Thông tin nguồn
 handlers: Map<string, HandlerFn[]> // Các loại bộ xử lý
 tools: Map<string, RegisteredTool> // Công cụ đã đăng ký(Map, Không Record)
 messageRenderers: Map<string, MessageRenderer> // trình kết xuất tin nhắn
 commands: Map<string, RegisteredCommand> // Lệnh đã đăng ký(Map, Không Record)
 flags: Map<string, ExtensionFlag> // cờ mở rộng
 shortcuts: Map<KeyId, ExtensionShortcut> // Ràng buộc phím tắt
}
```

Đây là hình dạng mà 7 tool thực tế của pi-coding-agent hiện thực (`read`, `bash`, `edit`, `write`, `grep`, `find`, `ls`).

### So sánh Before → After của sự tiến hoá kiểu dữ liệu

Để sự tiến hoá cụ thể hơn, đây là chuỗi mở rộng kiểu dữ liệu theo từng lớp:

```
Before(pi-ai lớp): Tool chỉ biết"nó trông như thế nào"
────────────────────────────────────────────
interface Tool<TSchema> {
 name: string
 description: string
 parameters: TSchema
}

 ↓ agent-core Mở rộng

After(pi-agent-core lớp): AgentTool biết"Cách thực hiện"
────────────────────────────────────────────
interface AgentTool<TSchema> extends Tool<TSchema> {
 label: string ← Mới
 execute: (...) => Promise<AgentToolResult> ← Mới
 executionMode?: "sequential" | "parallel" ← Mới
}

 ↓ coding-agent Mở rộng

After(pi-coding-agent lớp): ToolDefinition cộng thêm"Cách hiển thị"
────────────────────────────────────────────
interface ToolDefinition {
 // sự kế thừa AgentTool Tất cả các lĩnh vực của
 // + Trình kết xuất, Các thuộc tính kinh doanh như kiểm soát quyền
}
```

---

## 6. Khi viết Agent của riêng tôi, tôi có thực sự cần ba lớp không?

Bạn có thể thắc mắc: kiến trúc phân lớp của Pi trông hay đấy, nhưng liệu nó có quá thiết kế cho dự án Agent của riêng bạn?

Hãy thực sự đi qua ba kịch bản để xem.

### Kịch bản A: không phân lớp, tất cả gom vào một file

```
// giả thuyết: không xếp lớp Agent
import OpenAI from "openai";

const client = new OpenAI();
const messages = [];

while (true) {
 const response = await client.chat.completions.create({
 model: "gpt-4o",
 messages,
 });
 // Cuộc gọi công cụ phân tích cú pháp, thi hành, nối thêm vào messages ...
}
```

Chạy được cho dự án rất nhỏ, nhưng ngay khi Agent vượt quá ~1000 dòng, mỗi lần sửa sẽ thành ác mộng: đổi màu UI thì động vào logic vòng lặp, đổi nhà cung cấp LLM thì động vào phần thực thi tool. Conflict khi merge cứ chồng chất.

### Kịch bản B: chỉ hai lớp (bỏ lớp coding-agent)

```
// Chỉ sử dụng lớp dưới cùng + lớp giữa
import { Agent, agentLoop } from "@earendil-works/pi-agent-core";
import { streamSimple } from "@earendil-works/pi-ai";
```

Tốt hơn, nhưng bạn phải tự viết lại phần phân tích tham số CLI và quản lý session mỗi lần. Và các tool của bạn sẽ bị ghép chặt với kịch bản Agent cụ thể: chúng không thể được các Agent khác tái sử dụng.

### Kịch bản C: chỉ một lớp (chỉ pi-ai)

```
// Chỉ sử dụng lớp dưới cùng
import { streamSimple } from "@earendil-works/pi-ai";

const stream = streamSimple(model, context);
for await (const event of stream) {
 console.log(event);
}
```

Cũng hoàn toàn ổn. Bản thân pi-ai đã là một package độc lập: gọi LLM, streaming kết quả, không cần framework Agent nào.

Nhưng khi đó bạn sẽ phải tự viết vòng lặp, tự quản lý trạng thái thông điệp, và tự xử lý các lời gọi tool. Đó chính là lý do pi-agent-core tồn tại: **nó làm phần khó nhất của một Agent (vòng lặp, trạng thái, sự kiện, nén) thay bạn, bạn chỉ cần nói với nó dùng những tool nào.**

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

**Nó là gì**: sau khi thiết kế xong mỗi lớp, làm một bài test đơn giản: bỏ tầng trên đi, lớp này còn hoạt động được không?

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

Nhưng ta vẫn chưa trả lời một câu hỏi nền tảng hơn: Agent thực sự chạy thế nào? LLM cứ suy nghĩ, gọi tool, đọc kết quả, lại suy nghĩ: như thế nào? "Vòng lặp Agent" nổi tiếng kia trông ra sao?

Ở chương sau, ta đào vào trung tâm của Agent: **Vòng lặp Agent**. Ta sẽ hiểu vì sao cần một vòng lặp (thay vì gọi một lần là xong), rồi truy ngược hành trình đầy đủ của một thông điệp người dùng từ lúc nhấn Enter cho tới khi Agent nói "tôi đã xong".

---

> **Về cấu trúc cuốn sách**: các chương 1–6 (Chương 1 Mở đầu → Chương 6 Hệ thống Message) xây dựng sự hiểu biết hoàn chỉnh về cơ chế lõi của Pi-Agent; nên đọc theo thứ tự. Từ Chương 7 (Event-Driven, Context Engineering, Context Compaction, Quản lý Session, v.v.) trở đi, các chủ đề trở thành những vấn đề kỹ thuật nâng cao; mỗi chương tương đối độc lập và có thể đọc theo nhu cầu.
