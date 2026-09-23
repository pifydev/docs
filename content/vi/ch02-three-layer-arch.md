---
title: 'Chương 2: Kiến trúc ba lớp'
description: Cách Pi tách model transport, Agent runtime và ứng dụng coding agent mà không ép mọi package vào đúng ba ô.
translation_key: ch02-three-layer-arch
language: vi
chapter: 2
source_url: 'https://www.dgzhuya.com/modules/ch02-three-layer-arch'
official_refs:
  - 'https://github.com/earendil-works/pi/tree/f07218c4d4bbc12bef056a7058c3dd49dfe41abe/packages'
  - 'https://github.com/earendil-works/pi/blob/f07218c4d4bbc12bef056a7058c3dd49dfe41abe/packages/client/README.md'
  - 'https://github.com/earendil-works/pi/blob/f07218c4d4bbc12bef056a7058c3dd49dfe41abe/packages/protocol/README.md'
  - 'https://github.com/earendil-works/pi/blob/f07218c4d4bbc12bef056a7058c3dd49dfe41abe/packages/server/README.md'
terms_used:
  - Model
  - Provider
  - Message
  - Agent
  - Agent Loop
  - AgentMessage
  - AgentTool
  - Coding Agent
  - Tool
  - TUI
  - Extension
  - Session
  - SDK
  - monorepo
  - npm workspaces
  - TypeScript
  - TypeBox
  - TSchema
status: reviewed
last_updated: '2026-09-23'
translator: Pify maintainers
reviewed_by: Pify maintainers
---
> Chương này lùi lại khỏi từng function để nhìn toàn bộ kiến trúc package của Pi: code nằm ở đâu, package nào sở hữu từng quyết định, dependency hướng về đâu và type nhận thêm năng lực thế nào khi đi qua mỗi lớp. Tấm bản đồ ấy sẽ giúp bạn không mất phương hướng trong các chương đọc source tiếp theo.

---

## 1. Bạn vừa mở một codebase Agent

Giả sử bạn vừa clone repository Pi tại revision `f07218c` rồi mở thư mục `packages/`. Phần cây thư mục liên quan trông như sau:

```text
repo/
├── packages/
│   ├── ai/                 ← @earendil-works/pi-ai
│   ├── agent/              ← @earendil-works/pi-agent-core
│   ├── coding-agent/       ← @earendil-works/pi-coding-agent
│   ├── tui/                ← @earendil-works/pi-tui
│   ├── server/             ← boundary service thử nghiệm
│   ├── client/             ← @earendil-works/pi-client (thử nghiệm)
│   ├── protocol/           ← @earendil-works/pi-protocol (thử nghiệm)
│   ├── chord/
│   ├── durable/
│   ├── telemetry/
│   ├── evals/
│   └── session-backends/
├── package.json            ← workspace gốc và thứ tự build
└── tsconfig.json
```

Ba package đầu tạo thành mô hình hướng dependency được trình bày trong chương này. `pi-tui` là thư viện UI trực giao. Các package client, protocol và server tạo thành một boundary thử nghiệm, tùy chọn và nằm ngang hàng; những thư mục còn lại hỗ trợ Chord service, durable execution, telemetry, evaluation và session backend. Vì vậy monorepo có nhiều hơn năm package, dù năm vai trò vẫn là một cách vào bài dễ hiểu cho chuyến tham quan kiến trúc đầu tiên.

Tài liệu Pi cũ có thể nhắc tới `pi-web-ui` hoặc `pi-orchestrator`. Cả hai đều không phải workspace tại revision đã ghim. Cụ thể, nhận định cũ rằng một `pi-orchestrator` thử nghiệm nằm trên coding-agent không còn mô tả đúng cây source này. Thay vào đó, Mục 2.5 lập bản đồ boundary client/protocol/server tùy chọn và ghi rõ trạng thái thử nghiệm của nó.

Pi dùng npm workspaces. Manifest gốc bao gồm `packages/*`, các subpackage session backend và một số ví dụ Extension của coding-agent có dependency riêng. Workspace giúp các package local build cùng nhau; việc cùng nằm trong workspace không biến chúng thành một lớp kiến trúc duy nhất.

Câu hỏi hữu ích nên hẹp hơn “tại sao có đúng năm package?”. Hãy hỏi quyết định nào thuộc model transport, quyết định nào thuộc Agent runtime có thể tái sử dụng và quyết định nào thuộc sản phẩm coding. Sau đó xem UI cùng service boundary kết nối ở đâu mà không cần ép chúng vào stack ba lớp ấy.

---

## 2. Năm vai trò package, mỗi vai trò một việc

Tạm gác mũi tên dependency sang một bên. Hãy đọc từng package từ public surface và manifest của chính nó.

### 2.1 pi-ai: phụ trách “gọi model”

`@earendil-works/pi-ai`, nằm trong `packages/ai/`, trả lời câu hỏi: làm sao một ứng dụng có thể gọi model từ nhiều provider qua các type và streaming contract dùng chung?

Manifest mô tả package này là “Unified LLM API with automatic model discovery and provider configuration”. Tại revision `f07218c`, package sở hữu bốn nhóm khái niệm liên quan:

1. `Model<TApi>` mô tả một model cụ thể, gồm provider, API protocol, input mode, context window, token limit, chi phí, header và thiết lập tương thích.
2. `Provider<TApi>` sở hữu provider ID, cách xác thực, model catalog đồng bộ, hành vi refresh tùy chọn cùng implementation của `stream()` và `streamSimple()`.
3. `Models` là collection lúc runtime. Nó tra provider và model, giải quyết xác thực, refresh catalog động rồi chuyển request tới provider sở hữu `Model` đã chọn.
4. `Message`, `Context`, `Tool` và `AssistantMessageEventStream` tạo thành contract request/response không phụ thuộc provider cụ thể.

Root entry được giữ side-effect free có chủ đích. Provider factory nằm sau package subpath, còn `createModels()` và các domain type dùng chung nằm ở root:

```typescript
// packages/ai/src/index.ts (một số export tại f07218c)
export type { Static, TSchema } from "typebox";
export { Type } from "typebox";
export * from "./models.ts";
export * from "./types.ts";
export * from "./utils/event-stream.ts";

// Code ứng dụng chọn provider một cách tường minh.
import { createModels } from "@earendil-works/pi-ai";
import { anthropicProvider } from "@earendil-works/pi-ai/providers/anthropic";
```

Boundary này không chứa Agent Loop hoặc policy của coding session. Pi AI biết cách biểu diễn, xác thực, gửi và stream một model request. Nó không quyết định khi nào phải bắt đầu model turn tiếp theo, cũng không quyết định coding transcript sẽ được lưu ở đâu.

### 2.2 pi-agent-core: phụ trách “chạy vòng lặp”

`@earendil-works/pi-agent-core`, nằm trong `packages/agent/`, trả lời câu hỏi: làm sao LLM liên tục tạo message, yêu cầu Tool, nhận kết quả rồi tiếp tục cho tới khi run kết thúc?

Manifest gọi đây là “General-purpose agent with transport abstraction, state management, and attachment support”. Tính general-purpose chính là boundary. Runtime không mặc định Tool phải đọc file, chạy Bash hay sửa source code. Nó sở hữu:

- `Agent` và control flow cấp thấp `agentLoop()`;
- `AgentState`, gồm system prompt, `Model` đã chọn, thinking level, `AgentTool[]`, `AgentMessage[]`, streaming state và các Tool call đang chờ;
- hàng đợi steering và follow-up;
- hook `transformContext` cùng `convertToLlm` giữa application message và `Message[]` dành cho model;
- event ở cấp Agent, turn, message và quá trình thực thi Tool;
- các thành phần tái sử dụng cho session, compaction, prompt, Skill và môi trường Tool được quản lý.

Public entry point phản ánh sự phân chia đó:

```typescript
// packages/agent/src/index.ts (một số export tại f07218c)
export * from "./agent.ts";
export * from "./agent-loop.ts";
export * from "./harness/compaction/compaction.ts";
export * from "./harness/session/index.ts";
export * from "./harness/tools/index.ts";
export * from "./types.ts";
```

Vòng lặp nhận một `StreamFn`. `models.streamSimple.bind(models)` thỏa contract đó, nên Agent Core có thể chạy trên collection `Models` đã được cấu hình mà không cần tự khám phá provider factory. Điểm injection này tách việc “chạy state machine” khỏi việc “chọn và xác thực provider”.

### 2.3 pi-coding-agent: phụ trách “sản phẩm thực tế”

`@earendil-works/pi-coding-agent`, nằm trong `packages/coding-agent/`, trả lời câu hỏi: làm sao các thành phần lớp dưới trở thành coding assistant `pi`?

Manifest mô tả “Coding agent CLI with read, bash, edit, write tools and session management”. Package này sở hữu product policy và khâu lắp ráp:

- phân tích CLI cùng các entry path interactive, print, JSON, RPC và SDK;
- definition của bảy Tool tích hợp `read`, `bash`, `edit`, `write`, `grep`, `find` và `ls`;
- `AgentSession`, `SessionManager`, session entry, branching, tích hợp compaction và lựa chọn persistence;
- credential, setting, model resolution, project trust và việc nạp chỉ dẫn ở cấp project/global;
- Extension, Skill, prompt template, theme, Pi Package và resource discovery;
- TUI component cùng adapter render Agent event và Tool result.

Executable entry vẫn rất ngắn:

```typescript
// packages/coding-agent/src/cli.ts (một số dòng được chọn)
#!/usr/bin/env node
import { main } from "./main.ts";

main(process.argv.slice(2));
```

Phần việc phía sau đi qua nhiều component do sản phẩm sở hữu:

```text
bạn nhập: pi "Giúp tôi sửa lỗi này"
│
├── cli.ts                  phân tích argv
├── main.ts                 chọn mode interactive, print, JSON hoặc RPC
├── thiết lập resource/model nạp chỉ dẫn, Extension, Skill và Model
├── AgentSession            lắp Tool, setting và lịch sử session
├── Agent                   sở hữu state trực tiếp và hàng đợi
└── agentLoop()             stream output model và thực thi Tool
```

Coding package export `AgentSession`, `createAgentSession()`, các type Extension, Tool factory, resource loader và session type. Nó không export type mang tên `CodingAgentMessage`. Coding Agent tiếp tục dùng `AgentMessage`; message riêng của ứng dụng gia nhập union đó qua declaration merging của `CustomAgentMessages`, rồi được chuyển thành `Message[]` của model layer trước khi gọi provider.

### 2.4 pi-tui: phụ trách “hiển thị”

`@earendil-works/pi-tui`, nằm trong `packages/tui/`, là thư viện terminal UI có differential rendering. Nó export các component như `Markdown`, `Text`, `Editor`, `SelectList`, `ScrollView`, stack, terminal abstraction, xử lý bàn phím, render ảnh và tiện ích chuỗi có tính tới độ rộng ký tự.

Runtime dependency tại revision đã ghim chỉ gồm `marked` và `get-east-asian-width`. Package không có runtime dependency tới `pi-ai`, `pi-agent-core` hoặc `pi-coding-agent`. Coding Agent phụ thuộc TUI và chuyển runtime event thành component, nhưng package TUI không biết Agent, Model, Provider hay session là gì. Vì vậy nó trực giao với mô hình dependency ba lớp, không phải lớp thứ tư nằm trên cùng.

### 2.5 pi-server: một service boundary thử nghiệm

Vai trò thứ năm là một service boundary tùy chọn trải trên ba package. `@earendil-works/pi-client` export `Client` trung lập với transport: ứng dụng cung cấp một byte transport có thứ tự, còn client thực hiện version handshake, theo dõi live route và ghép request với response. `createClientServiceTransport()` chuyển server target hoặc Session target được resolve lười thành Chord transport; bản thân `Client` không dựng typed service proxy và không diễn giải contract của ứng dụng.

`@earendil-works/pi-protocol` định nghĩa `PROTOCOL_VERSION`, routed envelope nghiêm ngặt, definite-length CBOR encoding và byte-stream framing với length prefix bốn byte. Server request nhắm tới `{ serverId }`; Session request nhắm tới durable identity kèm live presentation capability `{ serverId, sessionId, attachmentId }`. Envelope schema từ chối field không biết và yêu cầu opaque payload là strict JSON. Chúng cố ý không hiểu grammar bên trong payload.

Boundary về ngữ nghĩa đó thuộc về Chord và ứng dụng. Chord sở hữu service call, control parsing, binding, catalogue, subscription, snapshot và update, cùng Delta codec dùng cho replicated state. Ứng dụng quyết định ý nghĩa của service—chẳng hạn management, transcript hoặc model catalogue—còn `pi-protocol` chỉ vận chuyển value dưới dạng strict JSON opaque.

`@earendil-works/pi-server` route service phạm vi server qua `RoutedServerServiceHost` do ứng dụng cung cấp và route service phạm vi Session qua `RoutedSessionHandle` được lấy cho một presentation attachment. Server validate route trước khi forward opaque invocation. `Session` thật và Agent Harness vẫn ở trong process: không JavaScript object nào đi qua protocol boundary, còn host giữ policy vòng đời cho Session, worker và Harness.

Policy về disconnect, dispose và retry được để lộ có chủ đích. Disconnect hoặc dispose làm pending work reject ở phía local và xóa live attachment route, nhưng công việc đã được chấp nhận vẫn có thể hoàn tất ở remote trước khi server giải phóng attachment đó. Không có automatic reconnect hay request replay; ứng dụng phải reconnect, attach lại qua management service và chỉ lặp những thao tác mà nó biết là an toàn.

> **Boundary thử nghiệm:** Các package này đang thử nghiệm và không bảo đảm tương thích. Đây là integration boundary tùy chọn nằm ngang hàng, không phải layer SDK bắt buộc thứ tư, không phải sản phẩm server end-to-end ổn định và không phải multi-Agent orchestrator cũ.

Các package telemetry, evaluation và SQLite session backend còn làm rõ những boundary khác. Chúng có ý nghĩa khi contract tương ứng đi vào thiết kế, nhưng không xóa bỏ mô hình học ba lớp.

---

## 3. Mô hình kiến trúc ban đầu

Core stack giờ có hình dạng dễ nhận ra:

```text
┌──────────────────────────────────────────────────────────┐
│ @earendil-works/pi-coding-agent                          │
│ product policy: CLI, session, resource, Tool, UI         │
├──────────────────────────────────────────────────────────┤
│ @earendil-works/pi-agent-core                            │
│ runtime mechanics: Agent state, loop, queue, event       │
├──────────────────────────────────────────────────────────┤
│ @earendil-works/pi-ai                                    │
│ model boundary: Models, Provider, Model, Message, stream │
└──────────────────────────────────────────────────────────┘

Nằm cạnh stack:
  @earendil-works/pi-tui       terminal UI tái sử dụng được
  pi-client/protocol/server    service boundary thử nghiệm, tùy chọn
```

Một request thông thường giúp ranh giới trở nên cụ thể. Coding Agent đọc input và project resource, sau đó yêu cầu Agent Core chạy prompt. Agent Core áp dụng `transformContext`, chuyển `AgentMessage[]` thành `Message[]` cho model rồi gọi `StreamFn` đã được inject. Pi AI tìm provider sở hữu `Model` được chọn, giải quyết auth và mở stream. Agent Core nhận event rồi thực thi `AgentTool` mà model yêu cầu. Coding Agent render event và ghi session entry. Payload riêng của provider dừng trong Pi AI; policy UI cùng storage dừng trong Coding Agent.

Hình dạng ấy giống một stack dưới-giữa-trên gọn gàng. Manifest của package để lộ một chi tiết mà hình vẽ chỉ cho phép phụ thuộc lớp kề sẽ che mất.

---

## 4. Mở package.json ra, mọi thứ không đơn giản như vậy

> **Lộ trình đọc:** Mục 4 và 5 đi sâu vào hướng dependency cùng type trong TypeScript. Hãy đọc trước khi xây trên SDK. Nếu chỉ cần chọn package cho một Agent nhỏ, Mục 6 có bảng quyết định thực dụng.

Coding package phụ thuộc trực tiếp vào cả ba package nền tảng trong mô hình phân lớp đang xét. Đoạn manifest chọn lọc dưới đây cho thấy các dependency ấy:

```jsonc
{
  "dependencies": {
    // Các dependency nền tảng được chọn từ package.json tại f07218c.
    "@earendil-works/pi-agent-core": "^0.87.1",
    "@earendil-works/pi-ai": "^0.87.1",
    "@earendil-works/pi-tui": "^0.87.1"
  }
}
```

Manifest đầy đủ còn liệt kê `@earendil-works/pi-client` và `@earendil-works/pi-protocol`. Chúng phục vụ các ranh giới client/protocol nằm ngoài mô hình ba lớp đang xét; đoạn trích trên không phải toàn bộ object `dependencies`.

`pi-coding-agent` đi xuyên qua lớp giữa để dùng `pi-ai`. Điều này hợp lệ. Kiến trúc cam kết dependency một chiều, không giới hạn import ở lớp kề.

### Câu trả lời nằm trong hệ thống type

Một số direct import tồn tại vì public API của sản phẩm nhắc đến `Model`, `Provider`, `Usage`, `Context`, `ImageContent` và các type Pi AI khác. TypeScript vẫn phải resolve những type đó ngay cả khi import cụ thể biến mất khỏi JavaScript được emit.

Dependency cũng tồn tại lúc runtime. Coding Agent so sánh model, lấy text từ nội dung message, tạo ID, retry assistant call và hiện thực `ModelRuntime` cùng `ModelRegistry` trên contract của Pi AI. Mô tả cạnh này là “chỉ re-export type” sẽ sai ở revision `f07218c`.

Agent Core cho thấy nền tảng được mở rộng dần rõ nhất:

```typescript
// packages/agent/src/types.ts (lược bớt import, f07218c)
import type {
  Api,
  AssistantMessageEventStream,
  ImageContent,
  JsonValue,
  Message,
  Model,
  SimpleStreamOptions,
  TextContent,
  Tool,
  ToolResultMessage,
  TranscriptContext,
  Usage,
} from "@earendil-works/pi-ai";
```

`Message`, `Model`, `Tool` và `TranscriptContext` đã normalize là các nguyên tử dùng để phát biểu contract của Agent runtime. Agent Core thêm state, execution, queue và event của nó. Coding Agent có thể dùng cả hai nhóm vì nó đảm nhiệm việc lắp ráp sản phẩm.

### Vậy quy tắc phân lớp thực sự là gì?

> **Code lớp dưới không được tham chiếu symbol của lớp trên.**

Quy tắc tạo ra ba phép kiểm tra cụ thể:

- Pi AI không được import Agent Core hoặc Coding Agent.
- Agent Core có thể import Pi AI, nhưng không được import product policy của Coding Agent.
- Coding Agent có thể import cả hai package lớp dưới và thư viện TUI trực giao.

Truy cập trực tiếp từ lớp trên tới lớp dưới vẫn giữ đúng hướng. Một vi phạm sẽ trông như `packages/ai/src/index.ts` import `AgentState`, hoặc Agent Core tự chọn session directory và permission UI của Coding Agent.

Các mũi tên dependency bên dưới đi từ dependency tái sử dụng được tới package sử dụng nó:

```text
@earendil-works/pi-ai ───────→ @earendil-works/pi-agent-core
          │                                │
          └────────────────────────────────┼──→ @earendil-works/pi-coding-agent
                                           │
@earendil-works/pi-tui ────────────────────┘

@earendil-works/pi-protocol ──→ @earendil-works/pi-client
@earendil-works/pi-protocol ──→ @earendil-works/pi-server
@earendil-works/pi-agent-core ─→ @earendil-works/pi-server
@earendil-works/pi-client ─────→ @earendil-works/pi-coding-agent
@earendil-works/pi-protocol ───→ @earendil-works/pi-coding-agent
```

Sơ đồ cho thấy hai giới hạn. Thứ nhất, ba lớp mô tả hướng dependency của các trách nhiệm model, runtime và coding product; chúng không phân loại mọi package trong monorepo. Thứ hai, các dependency trực tiếp từ client và protocol phục vụ phần tích hợp service thử nghiệm của Coding Agent; các package client/protocol/server thử nghiệm không nằm trên Coding Agent như một layer nữa. Chúng route traffic của Chord service dưới dạng opaque tới capability ở trong process và do ứng dụng sở hữu.

---

## 5. Type tiến hóa giữa các lớp: từ nguyên tử tới phân tử và vật liệu

Mũi tên dependency cho biết ai được phép biết ai. Type definition cho biết mỗi lớp bổ sung điều gì.

### Lớp 1: pi-ai định nghĩa các nguyên tử

Pi AI khai báo các shape nhỏ nhất không phụ thuộc provider cụ thể. Đoạn sau đã rút gọn, nhưng mọi member được hiển thị đều khớp source đã ghim:

```typescript
type Message = UserMessage | AssistantMessage | ToolResultMessage;

interface Model<TApi extends Api> {
  id: string;
  name: string;
  api: TApi;
  provider: ProviderId;
  baseUrl: string;
  reasoning: boolean;
  input: ("text" | "image")[];
  contextWindow: number;
  maxTokens: number;
}

interface Tool<TParameters extends TSchema = TSchema> {
  name: string;
  description: string;
  parameters: TParameters;
  constrainedSampling?: false | ConstrainedSamplingConfig;
}
```

`Tool` mô tả schema mà model có thể gọi. Nó không có method `execute()` và cũng không có terminal renderer. `Message` là union đóng dành cho LLM. `Model` xác định cả provider lẫn API protocol, nhờ vậy `Models` có thể chuyển stream tới đúng `Provider`.

### Lớp 2: pi-agent-core ghép nguyên tử thành phân tử

Agent Core giữ các nguyên tử đó rồi thêm năng lực runtime:

```typescript
type AgentMessage =
  | Message
  | CustomAgentMessages[keyof CustomAgentMessages];

interface AgentTool<
  TParameters extends TSchema = TSchema,
  TDetails = any,
> extends Tool<TParameters> {
  label: string;
  prepareArguments?: (args: unknown) => Static<TParameters>;
  execute(
    toolCallId: string,
    params: Static<TParameters>,
    signal?: AbortSignal,
    onUpdate?: AgentToolUpdateCallback<TDetails>,
  ): Promise<AgentToolResult<TDetails>>;
  executionMode?: "sequential" | "parallel";
}
```

`AgentMessage` mở transcript cho message do ứng dụng định nghĩa qua declaration merging. Trước khi gọi LLM, `convertToLlm` phải chuyển union rộng hơn ấy về `Message[]` của Pi AI. `AgentTool` mở rộng schema hướng model bằng label, bước chuẩn bị argument tùy chọn, execution, streaming update và execution mode riêng cho từng Tool. Agent Loop giờ có thể chạy điều model yêu cầu.

### Lớp 3: pi-coding-agent kết hợp phân tử thành vật liệu

Coding Agent lắp các type quanh một workflow hoàn chỉnh cho người dùng. `AgentSession` điều phối Agent đang chạy với setting, model runtime, resource loading, Extension và `SessionManager`. Session entry giữ message cùng model change, thinking-level change, compaction record, branch summary và custom entry. `ResolvedResource` cùng diagnostic liên quan ghi lại Skill, prompt template, theme và file chỉ dẫn đến từ đâu.

Với Tool, `ToolDefinition` hướng sản phẩm được tách hẳn khỏi `AgentTool`. Metadata dành cho model của hai type có phần trùng nhau, nhưng execution signature thì khác: `ToolDefinition.execute` bắt buộc có tham số thứ năm `ctx: ExtensionContext`. Vì vậy không thể truyền trực tiếp một `ToolDefinition` cho Agent Core dưới dạng `AgentTool`.

```typescript
// Các field và signature được trích chính xác từ extensions/types.ts tại f07218c.
export interface ToolDefinition<
  TParams extends TSchema = TSchema,
  TDetails = unknown,
  TState = any,
> {
  name: string;
  label: string;
  description: string;
  promptSnippet?: string;
  promptGuidelines?: string[];
  parameters: TParams;
  constrainedSampling?: false | ConstrainedSamplingConfig;
  renderShell?: "default" | "self";
  prepareArguments?: (args: unknown) => Static<TParams>;
  executionMode?: ToolExecutionMode;
  execute(
    toolCallId: string,
    params: Static<TParams>,
    signal: AbortSignal | undefined,
    onUpdate: AgentToolUpdateCallback<TDetails> | undefined,
    ctx: ExtensionContext,
  ): Promise<AgentToolResult<TDetails>>;
  renderCall?: (
    args: Static<TParams>,
    theme: Theme,
    context: ToolRenderContext<TState, Static<TParams>>,
  ) => Component;
  renderResult?: (
    result: AgentToolResult<TDetails>,
    options: ToolRenderResultOptions,
    theme: Theme,
    context: ToolRenderContext<TState, Static<TParams>>,
  ) => Component;
}
```

Product boundary trở thành runtime Tool qua adapter tường minh trong `packages/coding-agent/src/core/tools/tool-definition-wrapper.ts`:

```typescript
// Trích từ tool-definition-wrapper.ts tại f07218c.
export function wrapToolDefinition<TDetails = unknown>(
  definition: ToolDefinition<any, TDetails>,
  ctxFactory?: () => ExtensionContext,
): AgentTool<any, TDetails> {
  return {
    name: definition.name,
    label: definition.label,
    description: definition.description,
    parameters: definition.parameters,
    constrainedSampling: definition.constrainedSampling,
    prepareArguments: definition.prepareArguments,
    executionMode: definition.executionMode,
    execute: (toolCallId, params, signal, onUpdate, ctx?: ExtensionContext) =>
      definition.execute(
        toolCallId,
        params,
        signal,
        onUpdate,
        ctx ?? (ctxFactory?.() as ExtensionContext),
      ),
  };
}

// extensions/wrapper.ts, bên trong wrapRegisteredTool():
const tool = wrapToolDefinition(registeredTool.definition, () =>
  runner.createContext(),
);
```

Adapter sao chép các field của `AgentTool` rồi thay `execute` bằng function có nhiệm vụ cung cấp `ExtensionContext`. `wrapRegisteredTool()` truyền `runner.createContext()` cho Extension Tool; `wrapRegisteredTools()` áp dụng phép chuyển ấy cho cả danh sách. `AgentSession._refreshToolRegistry()` thu thập Tool definition từ Extension và SDK, wrap chúng rồi đặt các `AgentTool` thu được vào runtime registry. Factory tích hợp cũng dùng wrapper này cho bảy coding Tool: `read`, `bash`, `edit`, `write`, `grep`, `find` và `ls`.

Loader còn giữ các registration của từng Extension đã nạp trong một aggregate. Đây là interface hiện hành, không lược bỏ field nào:

```typescript
// packages/coding-agent/src/core/extensions/types.ts tại f07218c.
export interface Extension {
  path: string;
  resolvedPath: string;
  hidden?: boolean;
  sourceInfo: SourceInfo;
  handlers: Map<string, HandlerFn[]>;
  tools: Map<string, RegisteredTool>;
  messageRenderers: Map<string, MessageRenderer>;
  markdownTransformer?: MarkdownTransformer;
  entryRenderers?: Map<string, EntryRenderer>;
  commands: Map<string, RegisteredCommand>;
  flags: Map<string, ExtensionFlag>;
  shortcuts: Map<KeyId, ExtensionShortcut>;
}
```

`createExtension()` khởi tạo các map ấy trước khi gọi Extension factory. Sau đó, các method của `ExtensionAPI` ghi từng registration vào collection tương ứng: `pi.on()` thêm handler, `pi.registerTool()` thêm `RegisteredTool`, còn các method đăng ký renderer, command, flag và shortcut điền vào map cùng tên. Nếu factory chạy xong, `commit()` áp dụng các runtime change đang chờ rồi loader trả về aggregate. Nếu factory ném lỗi, `discard()` vô hiệu loading API và không có `Extension` nào được trả về.

Ở runtime, `ExtensionRunner` gọi event handler với context mới, resolve message renderer cùng entry renderer, cung cấp command và flag, đồng thời xử lý xung đột shortcut. Với Tool, runner trả về registration đầu tiên của mỗi tên; `AgentSession` đưa các definition ấy qua adapter vừa mô tả. Registration được tạo khi runtime đang hoạt động sẽ gọi `refreshTools()`, nhờ vậy runtime registry và active Tool set có thể được build lại mà không coi chính object `Extension` đã load là một `AgentTool`.

Không có nấc `CodingAgentMessage` trong chiếc thang này. Coding Agent dùng `AgentMessage` cho transcript đang chạy và định nghĩa các biến thể `SessionEntry` cho lịch sử sản phẩm cần lưu bền. Tách hai khái niệm giúp một storage record không bị hiểu nhầm là dữ liệu LLM có thể nhận.

### So sánh Before → After của quá trình mở rộng type

Đường đi của Tool cho ta phép so sánh từng field ngắn nhất:

```text
Before, trong pi-ai: Tool mô tả thứ model có thể gọi
────────────────────────────────────────────────────────
name + description + parameters + constrainedSampling

            ↓ Agent Core thêm năng lực runtime

After, trong pi-agent-core: AgentTool có thể chạy
────────────────────────────────────────────────────────
field của Tool + label + prepareArguments + execute + executionMode

            ↓ Coding Agent định nghĩa execution và rendering của sản phẩm

After, trong pi-coding-agent: ToolDefinition mô tả Tool của sản phẩm
────────────────────────────────────────────────────────
metadata Tool dùng chung + ExtensionContext bắt buộc
+ promptSnippet + promptGuidelines
+ renderCall + renderResult

            ↓ wrapToolDefinition() cung cấp context và chuyển execute

Bàn giao cho runtime: AgentTool đi vào Agent Core
────────────────────────────────────────────────────────
execute bốn tham số + metadata Tool dùng chung
```

Đường đi của message khác một chút: `Message` trở thành union `AgentMessage` rộng hơn, sau đó Coding Agent lưu nó trong session entry và render biến thể tùy chỉnh. Type có thể tiến hóa bằng inheritance, union, composition hoặc adapter tường minh. Invariant nằm ở quyền sở hữu: mỗi lớp chỉ thêm thông tin cần cho trách nhiệm của nó, rồi chuyển dữ liệu về contract mà lớp dưới yêu cầu.

---

## 6. Khi viết Agent riêng, tôi có thực sự cần ba lớp không?

Câu trả lời phụ thuộc sản phẩm bạn đang xây. Ba kịch bản sau làm rõ đánh đổi.

### Kịch bản A: không phân lớp, tất cả gom vào một file

```typescript
// Pseudocode minh họa: một Agent cố ý không phân lớp.
import OpenAI from "openai";

const client = new OpenAI();
const messages = [];

while (true) {
  const response = await client.chat.completions.create({
    model: "gpt-4o",
    messages,
  });
  // Phân tích Tool call, thực thi, nối kết quả rồi tiếp tục.
}
```

Cách này đủ cho một thử nghiệm nhỏ. Khi provider request, Tool execution, state, storage và UI tích tụ trong cùng module, thay đổi ở một mối quan tâm buộc người đọc kiểm tra tất cả phần còn lại. Merge conflict chỉ là triệu chứng; chi phí sâu hơn là không thành phần nào có contract độc lập.

### Kịch bản B: chỉ hai lớp, không dùng sản phẩm coding-agent

```typescript
import { Agent } from "@earendil-works/pi-agent-core";
import { createModels } from "@earendil-works/pi-ai";
import { anthropicProvider } from "@earendil-works/pi-ai/providers/anthropic";

const models = createModels();
models.setProvider(anthropicProvider());

const model = models.getModel("anthropic", "claude-sonnet-4-6");
if (!model) throw new Error("Model not found");

const agent = new Agent({
  initialState: { systemPrompt: "Hãy hỗ trợ người vận hành.", model },
  streamFn: models.streamSimple.bind(models),
});
```

Đây là lựa chọn phù hợp cho Agent theo domain riêng. Agent Core cung cấp state, vòng lặp, Tool execution, queue và event. Ứng dụng của bạn cung cấp `AgentTool`, entry point, session policy, permission và UI riêng. Bạn không phải nhận product policy của coding assistant khi sản phẩm không cần nó.

### Kịch bản C: chỉ một lớp, pi-ai

```typescript
import { createModels } from "@earendil-works/pi-ai";
import { anthropicProvider } from "@earendil-works/pi-ai/providers/anthropic";

const models = createModels();
models.setProvider(anthropicProvider());

const model = models.getModel("anthropic", "claude-sonnet-4-6");
if (!model) throw new Error("Model not found");

const stream = models.streamSimple(model, {
  messages: [{ role: "user", content: "Giải thích hướng dependency.", timestamp: Date.now() }],
});

for await (const event of stream) {
  if (event.type === "text_delta") process.stdout.write(event.delta);
}
```

Pi AI hoạt động độc lập khi bạn cần một lượt trao đổi với model hoặc muốn tự viết control flow. Bạn sẽ tự quản lý message state, các turn lặp lại, Tool execution, queue và điều kiện kết thúc.

### Hướng dependency quan trọng hơn số lượng lớp

Ba kịch bản dẫn tới một lựa chọn thực dụng:

| Kịch bản | Phù hợp nhất khi | Phần code của bạn vẫn phải sở hữu |
| --- | --- | --- |
| Chỉ Pi AI | Gọi model mà không cần Agent Loop tái sử dụng | State, loop, Tool execution, điều kiện kết thúc |
| Pi AI + Agent Core | Agent theo domain riêng | Product Tool, entry point, storage, permission, UI |
| Cả ba lớp | Coding assistant hoặc Pi Extension | Thay đổi và tích hợp riêng của sản phẩm |

Dù chọn hình dạng nào, hãy giữ package lớp dưới không biết product knowledge của lớp trên. Agent Core không nên import ứng dụng đang nhúng nó, còn Pi AI không nên import Agent Core hay ứng dụng ấy. Những điểm injection như `streamFn`, context transform, hook và Tool implementation cho phép lớp trên cung cấp hành vi mà không đẩy policy xuống dưới.

Quy tắc này không hứa rằng bạn có thể thay mọi package lớp dưới mà không cần adapter. Public contract của Agent Core dùng trực tiếp `Model`, `Message`, `TranscriptContext` đã normalize và stream type từ Pi AI. Nó bảo đảm rằng khi bỏ sản phẩm lớp trên, dependency lớp dưới vẫn dùng độc lập được.

Bảng chọn vị trí dựa trên cùng quy tắc cũng hữu ích khi review code:

| Thay đổi | Boundary sở hữu |
| --- | --- |
| Thêm request header riêng cho provider | Pi AI provider hoặc request transform |
| Lọc message riêng của ứng dụng trước model call | Boundary `convertToLlm` của Agent |
| Chặn shell command nguy hiểm | Coding Tool policy hoặc Extension |
| Thêm terminal panel | Coding Agent, dùng primitive của Pi TUI |
| Lưu session bằng backend khác | Tích hợp application/session |

---

## 7. Ba phương pháp có thể mang sang dự án khác

Package graph của Pi gợi ra ba phương pháp dùng lại được trong những dự án Agent khác.

### Phương pháp 1: “phễu dependency”

Vẽ mũi tên dependency trước khi chọn tên thư mục. Đặt khái niệm không phụ thuộc provider cùng transport contract ở đầu hẹp. Đặt state và control flow tái sử dụng phía trên. Đặt policy về người dùng, storage, permission và presentation ở đầu rộng phía sản phẩm.

Thực hiện theo bốn bước:

1. Tìm code có thể hoạt động mà không cần product knowledge. Đó là ứng viên cho lớp dưới.
2. Tìm code phụ thuộc các contract ấy nhưng vẫn không biết workflow cụ thể của người dùng. Đó là ứng viên runtime.
3. Tìm code quyết định người dùng thấy gì, resource nào được nạp, permission nào áp dụng và dữ liệu nào được lưu. Phần ấy thuộc sản phẩm.
4. Tìm import package lớp trên trong source tree lớp dưới. Mỗi kết quả phải được gỡ bỏ hoặc dẫn tới một lần thiết kế lại boundary có chủ đích.

Câu hỏi kiểm chứng nhanh là: nếu ứng dụng lớp trên biến mất, package lớp dưới còn build và làm được công việc nó tuyên bố hay không? Pi AI có thể stream khi không có Agent Core. Agent Core có thể chạy Agent khi không có Coding Agent. TUI có thể render ứng dụng terminal mà không cần package AI nào.

### Phương pháp 2: pattern “mở rộng type từng bước”

Bắt đầu bằng type nhỏ nhất mà owner ở lớp thấp nhất có thể bảo vệ. Cho lớp cao hơn thêm năng lực bằng union, `extends`, composition hoặc adapter tường minh.

1. Transport layer định nghĩa nguyên tử như `Message`, `Model` và `Tool` chỉ có schema.
2. Runtime mở rộng `Message` thành `AgentMessage` rồi thêm execution để tạo `AgentTool`.
3. Sản phẩm lưu Agent message trong session record và định nghĩa Tool có prompt, `ExtensionContext` bắt buộc cùng renderer.
4. Trước khi truyền dữ liệu xuống dưới, hãy chuyển nó về contract của lớp thấp hơn. `convertToLlm` xử lý message; `wrapToolDefinition()` xử lý product Tool definition.

Cách này giữ package lớp dưới ở trạng thái có thể publish và tái sử dụng. Nó cũng đặt tên cho boundary có thể làm mất thông tin. Một application message tùy chỉnh không thể âm thầm đi tới provider; bước chuyển đổi phải lọc hoặc dịch nó.

### Phương pháp 3: test “có thể dùng độc lập”

Test từng package mà không có consumer. Gỡ dependency lớp trên khỏi môi trường test, sau đó compile và thực thi đúng công việc public của package lớp dưới.

- Pi AI phải tạo được collection `Models`, đăng ký `Provider`, chọn `Model` và stream một `Context` mà không cần Agent Core.
- Agent Core phải chạy được với streaming cùng Tool implementation được inject mà không cần Coding Agent.
- Pi TUI phải render component mà không import domain type AI.
- Coding Agent là sản phẩm đã lắp ráp, vì vậy việc nó phụ thuộc các package lớp dưới là điều dự kiến.

Hãy dùng package manifest và source-import graph làm bằng chứng. Application test chạy qua có thể che một upward dependency vì toàn bộ monorepo làm mọi workspace sẵn có. Test package cô lập sẽ phơi bày dependency đó.

---

## 8. Bước tiếp theo: đi vào trung tâm của Agent

Tấm bản đồ này cho bạn tọa độ của chuyến đọc source kế tiếp. Pi AI sở hữu `Models`, `Provider`, `Model`, `Message` và provider stream. Agent Core sở hữu `Agent`, `AgentMessage`, `AgentTool`, state, queue, event và vòng lặp. Coding Agent sở hữu session, Extension, coding Tool, resource và UI sản phẩm. Pi TUI vẫn tái sử dụng được ở cạnh stack, còn các sibling client/protocol/server thử nghiệm vận chuyển Chord service opaque tới capability trong process do ứng dụng sở hữu.

Chương 3 theo dõi một prompt đi qua Agent Loop: vì sao cần vòng lặp, streaming event cập nhật state thế nào, Tool call trở thành result ra sao, message trong queue đi vào turn tiếp theo khi nào và run kết thúc bằng cách nào.

> **Thứ tự đọc:** Chương 1–6 xây cơ chế lõi theo trình tự. Từ Chương 7 trở đi, mỗi chương tách một vấn đề kỹ thuật nâng cao và có thể dùng như tài liệu tra cứu theo chủ đề.

> **Ghi chú phiên bản:** Chương này mô tả Pi `0.87.1` tại commit `f07218c4d4bbc12bef056a7058c3dd49dfe41abe`. Tên package, export, dependency và nhãn thử nghiệm đều đã được kiểm tra theo revision đó.

> **Chương tiếp theo:** [Chương 3: Agent Loop](ch03-agent-loop.md)
