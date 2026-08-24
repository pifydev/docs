---
title: "Chương 5: Hệ thống Tool"
description: Cách Pi định nghĩa, chuyển đổi, validate, điều phối, thực thi và ghi lại Tool call.
translation_key: ch05-tool-system
language: vi
chapter: 5
source_url: "https://www.dgzhuya.com/modules/ch05-tool-system"
official_refs:
  - "https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/agent/README.md#tools"
  - "https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/coding-agent/docs/extensions.md#custom-tools"
terms_used:
  - Tool
  - ToolCall
  - ToolResultMessage
  - AgentTool
  - ToolDefinition
status: reviewed
last_updated: "2026-08-24"
translator: Pify maintainers
reviewed_by: Pify maintainers
---

Chương 3 đã theo dõi một turn của Agent từ model response sang bước thực thi Tool rồi quay lại conversation. Chương 4 dừng ở phía bên kia của boundary đó: provider adapter đã chuẩn hóa yêu cầu của model thành một block `ToolCall` như sau.

```json
{
  "type": "toolCall",
  "id": "call_abc123",
  "name": "read",
  "arguments": { "path": "src/main.ts" }
}
```

Block này không cấp quyền thực hiện operation và cũng không chứa code có thể chạy. Runtime vẫn phải tìm đúng Tool theo tên, chuẩn bị và validate arguments không đáng tin cậy, áp dụng product policy, tôn trọng cancellation, chạy effect, báo progress, chốt result rồi tạo `ToolResultMessage` tương ứng. Khi một message có cả batch, runtime còn phải trả lời một câu hỏi khác: những effect nào có thể chạy đồng thời mà không làm hỏng shared state?

Pi `0.84.2` giải quyết các yêu cầu đó bằng ba type layer có liên hệ với nhau và một execution path chia thành nhiều stage. Mô hình giảng dạy năm bước trước đây vẫn hữu ích—prepare, validate, pre-hook, execute, post-hook—nhưng implementation hiện tại còn định nghĩa scheduling, event ordering, cancellation boundary, cách tạo result và điều kiện terminate cho cả batch. Chương này đi qua toàn bộ đường dẫn đó theo commit được ghim `a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c`.

## 1. Ba type layer giữ dependency đúng chiều

### Layer 1: `Tool` mô tả capability dành cho provider

Model layer chỉ cần đủ thông tin để công bố một capability có thể gọi. Layer này không cần biết application sẽ thực thi hay render capability đó ra sao. Đoạn trích trung thành với source dưới đây là toàn bộ interface `Tool` trong `packages/ai/src/types.ts` tại commit đã ghim:

```typescript
export interface Tool<TParameters extends TSchema = TSchema> {
  name: string;
  description: string;
  parameters: TParameters;
  constrainedSampling?: false | ConstrainedSamplingConfig;
}
```

`name` là protocol identifier được chép vào `ToolCall.name`. `description` và `parameters` cho model biết khi nào nên dùng Tool và argument object cần tạo có shape nào. `parameters` là một TypeBox `TSchema`. Field tùy chọn `constrainedSampling` yêu cầu provider tương thích áp dụng JSON Schema hoặc grammar-constrained sampling; giá trị `false` tắt yêu cầu này một cách tường minh.

Layer này chỉ mô tả điều gì có thể được yêu cầu. Nó không có method `execute`, display label, UI renderer, quyền truy cập session hay cancellation signal. Provider adapter chỉ serialize những field trong declaration mà provider hỗ trợ. Nhờ boundary đó, một application gọi model trực tiếp vẫn dùng được `@earendil-works/pi-ai` mà không cần Agent runtime.

### Layer 2: `AgentTool` bổ sung execution contract

Agent core phải biến normalized call thành effect và normalized result. Nó mở rộng `Tool<TParameters>` thay vì tạo thêm một provider declaration khác. Đoạn trích trung thành, có lược bớt comment sau lấy từ `packages/agent/src/types.ts` tại cùng commit; generic signature và member được giữ nguyên:

```typescript
export interface AgentToolResult<T> {
  content: (TextContent | ImageContent)[];
  details: T;
  usage?: Usage;
  addedToolNames?: string[];
  terminate?: boolean;
}

export type AgentToolUpdateCallback<T = any> = (
  partialResult: AgentToolResult<T>,
) => void;

export interface AgentTool<
  TParameters extends TSchema = TSchema,
  TDetails = any,
> extends Tool<TParameters> {
  label: string;
  prepareArguments?: (args: unknown) => Static<TParameters>;
  execute: (
    toolCallId: string,
    params: Static<TParameters>,
    signal?: AbortSignal,
    onUpdate?: AgentToolUpdateCallback<TDetails>,
  ) => Promise<AgentToolResult<TDetails>>;
  executionMode?: ToolExecutionMode;
}
```

`label` dành cho người đọc; nó có thể là `Read file` trong khi protocol name vẫn là `read`. `prepareArguments` xử lý một wire shape cũ hoặc sai lệch đã biết trước khi validation diễn ra. `execute` nhận validated parameters, call ID, `AbortSignal` tùy chọn của run và progress callback tùy chọn. `executionMode` nhận `"parallel"` hoặc `"sequential"`.

Result phục vụ hai nhóm người dùng. `content` chứa text hoặc image block dành cho model. `details` chứa structured application data để render, ghi log hoặc tái tạo state. Final result cũng có thể báo `usage` của Tool lồng bên trong, ghi tên Tool mới được thêm, hoặc đồng ý early termination. Interface TypeScript yêu cầu `details`, kể cả khi giá trị phù hợp của nó là `{}` hoặc `undefined` thông qua detail type tương ứng.

Ví dụ `AgentTool` low-level dưới đây có thể sao chép. Nó truyền đủ hai generic parameter để giữ type cho `params.path` và progress details. Code kiểm tra cancellation trước và sau filesystem operation; một filesystem wrapper dùng trong production cũng có thể truyền signal vào operation bên dưới.

```typescript
import { Type } from "@earendil-works/pi-ai";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { readFile } from "node:fs/promises";

const readTextParameters = Type.Object({
  path: Type.String({ description: "Path to a UTF-8 text file" }),
});

interface ReadTextDetails {
  path: string;
  phase: "reading" | "done";
  bytes?: number;
}

export const readText: AgentTool<
  typeof readTextParameters,
  ReadTextDetails
> = {
  name: "read_text",
  label: "Read text",
  description: "Read one UTF-8 text file",
  parameters: readTextParameters,
  executionMode: "parallel",
  async execute(_toolCallId, params, signal, onUpdate) {
    if (signal?.aborted) throw new Error("Read cancelled before it started");

    onUpdate?.({
      content: [{ type: "text", text: `Reading ${params.path}` }],
      details: { path: params.path, phase: "reading" },
    });

    const text = await readFile(params.path, "utf8");
    if (signal?.aborted) throw new Error(`Read cancelled: ${params.path}`);

    return {
      content: [{ type: "text", text }],
      details: {
        path: params.path,
        phase: "done",
        bytes: Buffer.byteLength(text),
      },
    };
  },
};
```

### Layer 3: Extension `ToolDefinition` bổ sung concern của product

Coding Agent cần prompt contribution, terminal rendering và live session context dành cho extension. `ToolDefinition` công khai của Extension thêm các concern đó mà không khiến Agent core phụ thuộc vào TUI hoặc session manager. Đoạn trích không độc lập sau đây lấy trung thành từ `packages/coding-agent/src/core/extensions/types.ts` tại commit đã ghim. Generic và function type được giữ chính xác, còn documentation comment được lược bỏ:

```typescript
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

`promptSnippet` đưa Tool vào danh sách available Tools ngắn trong default system prompt. `promptGuidelines` thêm guidance riêng của Tool khi Tool đó đang active. Mỗi guideline phải ghi rõ tên Tool vì Coding Agent nối các bullet vào cùng một section phẳng. `renderCall` và `renderResult` tạo TUI component; `TState` định kiểu state dùng chung giữa các render slot. `renderShell: "self"` báo rằng renderer tự cung cấp phần khung hiển thị.

Argument thứ năm của `execute` là Extension `ctx`. Nó cung cấp working directory hiện tại, mode, UI capability, read-only session manager, model registry, model hiện tại, scoped models, thinking level, signal hiện tại và các action có kiểm soát như `abort()`, `compact()` cùng `getSystemPrompt()`. Đây là trách nhiệm của Coding Agent chứ không thuộc Agent core.

### `defineTool()` và `pi.registerTool()` phục vụ hai thời điểm khác nhau

Object literal truyền trực tiếp vào `pi.registerTool()` nhận contextual typing từ `ExtensionAPI.registerTool<TParams, TDetails, TState>()`. Một definition được gán vào variable trước đó có thể mất khả năng suy luận parameter type khi chưa đến method này. `defineTool()` là identity function có return intersection giữ lại inference cho variable và array. Đây là toàn bộ implementation trong `packages/coding-agent/src/core/extensions/types.ts` tại commit đã ghim:

```typescript
export function defineTool<
  TParams extends TSchema,
  TDetails = unknown,
  TState = any,
>(
  tool: ToolDefinition<TParams, TDetails, TState>,
): ToolDefinition<TParams, TDetails, TState> & AnyToolDefinition {
  return tool as ToolDefinition<TParams, TDetails, TState> & AnyToolDefinition;
}
```

`defineTool()` không register hay wrap bất kỳ thứ gì ở runtime. `pi.registerTool()` lưu definition theo tên và refresh Tool registry của session. Registration và activation tách biệt khi có allowlist: một SDK session được tạo với array `tools` phải chứa tên custom Tool, còn extension có thể đọc hoặc đổi danh sách active bằng `pi.getActiveTools()` và `pi.setActiveTools(names)`. `setActiveTools()` bỏ qua tên chưa được register.

Extension hoàn chỉnh dưới đây có thể sao chép. Code truyền detail type tường minh cho `defineTool()`, register kết quả qua `pi.registerTool()`, báo một progress update, dùng `ctx.cwd`, truyền run signal vào `readFile` và throw lỗi có path cho một failure đã biết.

```typescript
import { Type } from "@earendil-works/pi-ai";
import {
  defineTool,
  type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const inspectTextParameters = Type.Object({
  path: Type.String({ description: "Project-relative UTF-8 file path" }),
});

interface InspectTextDetails {
  path: string;
  phase: "reading" | "done";
  bytes?: number;
}

const inspectText = defineTool<
  typeof inspectTextParameters,
  InspectTextDetails
>({
  name: "inspect_text",
  label: "Inspect text",
  description: "Report the byte length of one UTF-8 project file",
  promptSnippet: "Inspect the byte length of a UTF-8 project file",
  promptGuidelines: [
    "Use inspect_text when the byte length of a text file is needed.",
  ],
  parameters: inspectTextParameters,
  executionMode: "parallel",
  async execute(_toolCallId, params, signal, onUpdate, ctx) {
    const absolutePath = resolve(ctx.cwd, params.path);
    onUpdate?.({
      content: [{ type: "text", text: `Reading ${params.path}` }],
      details: { path: params.path, phase: "reading" },
    });

    try {
      const text = await readFile(absolutePath, { encoding: "utf8", signal });
      return {
        content: [
          {
            type: "text",
            text: `${params.path} contains ${Buffer.byteLength(text)} bytes`,
          },
        ],
        details: {
          path: params.path,
          phase: "done",
          bytes: Buffer.byteLength(text),
        },
      };
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        throw new Error(`File does not exist: ${params.path}`);
      }
      throw error;
    }
  },
});

export default function register(pi: ExtensionAPI): void {
  pi.registerTool(inspectText);
}
```

### Bridge đưa `ExtensionContext` vào mà không mở rộng Agent core

Agent Loop nhận `AgentTool`; product registry lưu `ToolDefinition`. `wrapToolDefinition()` chuyển dạng sau thành dạng trước. Implementation hoàn chỉnh dưới đây nằm trong `packages/coding-agent/src/core/tools/tool-definition-wrapper.ts` tại commit đã ghim:

```typescript
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
```

Wrapper chép các protocol field và runtime field, giữ prompt cùng rendering field ở Coding Agent, rồi chuyển đổi `execute`. Implementation của wrapper chấp nhận một context thứ năm tùy chọn ở nội bộ; Agent core thông thường chỉ truyền bốn argument, vì vậy wrapper gọi `ctxFactory()` rồi cung cấp `ExtensionContext` nhận được.

Tool được extension register dùng `() => runner.createContext()` làm factory. `createContext()` tạo object với lazy getter được bảo vệ và method được resolve tại thời điểm gọi. Vì vậy Tool thấy session, model, Tool set, signal và UI state hiện tại thay vì giá trị bị đóng băng từ lúc load extension. Một runner cũ sẽ từ chối truy cập sau reload hoặc session replacement. Agent Loop không import `ExtensionContext` và không thể truy cập trực tiếp API session của Coding Agent.

Đảm bảo đó áp dụng cho definition được register qua Extension runner. Built-in definition cũng được wrap trực tiếp nhưng không truyền factory; implementation của chúng coi giá trị thứ năm là tùy chọn tại nơi sử dụng. Extension cần `ctx` nên register qua `pi.registerTool()` hoặc ResourceLoader path được hỗ trợ, không nên gọi internal wrapper mà thiếu context factory.

Pseudocode kiến trúc sau tóm tắt bridge mà vẫn giữ rõ ownership; đây không phải API có thể import:

```text
pi-ai Tool declaration
  -> pi-agent-core AgentTool execution contract
  -> Coding Agent ToolDefinition prompt, rendering, and session contract
  -> wrapToolDefinition copies shared fields
  -> execute closure obtains a fresh ExtensionContext
  -> Agent Loop still invokes the four-argument AgentTool contract
```

### Tại sao ba layer này đáng được giữ riêng

Đưa mọi field vào một interface sẽ đảo ngược dependency. Provider adapter sẽ phải hiểu terminal `Component`. Agent core sẽ cần session manager chỉ để chạy một Tool in-memory đơn giản. Browser Agent sẽ kéo theo concern của Node và TUI dù không dùng đến chúng.

Chuỗi type hiện tại chỉ thêm capability tại owner có thể implement nó. Pi AI mô tả request. Agent core thực thi và điều phối. Coding Agent bổ sung prompt, rendering, registry cùng session behavior của product. Wrapper đủ hẹp để audit: mọi field được chép và bước context injection đều hiện rõ trong một function.

## 2. Execution pipeline biến request thành result

### Gọi trực tiếp làm thiếu policy và protocol contract

Tra Tool rồi gọi ngay `await tool.execute()` sẽ bỏ qua nhiều contract có thể quan sát. Model có thể gọi tên một Tool không active. Session được resume có thể chứa argument shape cũ. Required field có thể bị thiếu. Policy hook có thể cần chặn một request nguy hiểm. Người dùng có thể cancel trong khi process chạy lâu. Một exception vẫn cần result liên kết với call ban đầu để provider transcript giữ đúng cấu trúc.

Call không hợp lệ dưới đây phù hợp hơn ví dụ lịch sử `path: 12345`. Validation hiện tại thực hiện primitive conversion được hỗ trợ, nên một number có thể trở thành string. Required property bị thiếu thì không thể thỏa schema này:

```json
{
  "type": "toolCall",
  "id": "call_missing_path",
  "name": "read",
  "arguments": { "offset": 20 }
}
```

Application authorization cũng nằm ngoài model. Việc model yêu cầu chạy shell command chỉ biểu thị intent, không phải permission. Pre-hook kiểm tra effective arguments đã validate với host policy trước khi effect bắt đầu.

### Pipeline hiện tại bao gồm event và batch control

Năm processing stage về mặt khái niệm nằm trong event path và scheduling path lớn hơn. Pseudocode sau bám sát implementation trong `packages/agent/src/agent-loop.ts` tại commit đã ghim:

```text
assistant ToolCall in source order
  -> emit tool_execution_start with raw arguments
  -> resolve active AgentTool by name
  -> prepareArguments when present
  -> validateToolArguments on the prepared call
  -> beforeToolCall with validated args and the run signal
  -> schedule the allowed execute effect
  -> execute with AbortSignal and onUpdate
  -> wait for accepted update-event emissions
  -> afterToolCall patch
  -> emit tool_execution_end with final result and isError
  -> construct ToolResultMessage
  -> emit message_start and message_end for that result
  -> append result to the conversation after the batch returns
```

Tool không tồn tại, preparation error, validation error, cancellation được thấy trong preparation và call bị block đều tạo immediate outcome. Chúng bỏ qua `execute` cùng `afterToolCall`, nhưng call đã finalize vẫn phát `tool_execution_end` và result-message event. Response dừng vì `length` còn nghiêm ngặt hơn: mọi Tool call trong assistant message đó đều thất bại mà không chạy vì streamed arguments có thể đã bị cắt một cách âm thầm.

### Bước 1: `prepareArguments` chuyển đổi shape lịch sử đã biết

`prepareArguments(args: unknown)` chỉ chạy khi Tool đã resolve có định nghĩa hook này. Output của nó thay raw arguments trong bước validation và execution. Built-in Tool `edit` hiện dùng hook để tương thích với model và session: parse `edits` dạng JSON string, bọc một edit object thành array, và chuyển dạng cũ có `oldText`/`newText` ở top level sang array hiện tại.

Input và output minh họa dựa trên compatibility rule đó:

```jsonc
// Raw arguments from an older stored call
{ "path": "app.ts", "oldText": "v1", "newText": "v2" }

// Effective arguments returned for current validation
{
  "path": "app.ts",
  "edits": [{ "oldText": "v1", "newText": "v2" }]
}
```

Preparation là deterministic computation tại boundary này. Network request, permission prompt, write và thay đổi shared state thuộc `beforeToolCall` hoặc `execute`, nơi cancellation và ordering đã được định nghĩa. Giữ public schema ở dạng hiện tại cũng tránh việc quảng bá deprecated field cho model chỉ để resume một transcript cũ.

### Bước 2: validation clone, normalize, convert rồi mới check

`validateToolArguments()` được export công khai từ Pi AI và nằm trong `packages/ai/src/utils/validation.ts`. Function dùng `structuredClone()` cho prepared arguments, coi `null` như omission đối với optional property không nullable, áp dụng TypeBox `Value.Convert`, sau đó check bằng validator được cache. Serialized plain JSON Schema có thêm một đường primitive coercion tương thích AJV.

Conversion step làm thay đổi khẳng định cũ rằng mọi primitive type sai đều phải fail. Test hiện tại chứng minh các case như `"42"` được đổi thành `42` cho number schema và `true` thành `"true"` cho string schema. Validation vẫn từ chối value không thể thỏa schema sau supported conversion. Failure text ghi tên Tool, format từng schema path kèm localized message, và đính kèm arguments ban đầu. Khi thiếu `path`, message có shape như sau:

```text
Validation failed for tool "read":
  - path: Expected required property

Received arguments:
{
  "offset": 20
}
```

`prepareToolCall()` bắt string đó và đưa vào error result; `execute` không bao giờ nhận object đã bị từ chối. Bản thân preparation có thể đổi original argument object nếu custom implementation mutate input, nên custom `prepareArguments` cần trả value mới và tránh mutation.

### Bước 3: `beforeToolCall` áp dụng host policy

Hook của Agent core nhận `{ assistantMessage, toolCall, args, context }` cùng run signal tùy chọn. `args` đã qua validation. Raw `toolCall` vẫn có mặt để lấy identity và protocol metadata. Return contract hiện tại là:

| Giá trị hook trả về                                       | Tác động tại runtime                                                                                   |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `undefined` hoặc `{ block: false }`                       | Tiếp tục nếu signal chưa bị abort.                                                                     |
| `{ block: true }`                                         | Bỏ qua execution và tạo error result với text `Tool execution was blocked`.                            |
| `{ block: true, reason: "Policy denied this path" }`      | Dùng reason được cung cấp làm error text.                                                              |
| `{ block: true, reason: "Final denial", terminate: true }` | Đánh dấu result này terminate; toàn batch vẫn cần mọi result cùng terminate.                          |

Hook Agent-core sau có thể gắn vào một `Agent` hiện có để chặn shell access. Code đọc validated object theo cách phòng thủ vì public type của `BeforeToolCallContext.args` là `unknown`:

```typescript
agent.beforeToolCall = async ({ toolCall, args }, signal) => {
  if (signal?.aborted) {
    return { block: true, reason: "Operation aborted" };
  }
  if (toolCall.name !== "bash") return undefined;

  const command =
    typeof args === "object" &&
    args !== null &&
    "command" in args &&
    typeof args.command === "string"
      ? args.command
      : "";

  if (command.includes("rm -rf")) {
    return { block: true, reason: "Destructive command blocked" };
  }
  return undefined;
};
```

Coding Agent nối Extension event `tool_call` vào hook này. Extension event nhận `toolName`, `toolCallId` cùng `input` đã validate; handler có thể trả `block`, `reason` và `terminate`. Nếu `tool_call` handler throw, Agent preparation bắt error rồi tạo error result, vì vậy failure trong extension policy không vô tình cho phép effect chạy.

### Bước 4: `execute` sở hữu effect, cancellation và progress

Call contract chính xác của Agent core có thể đọc độc lập với product wrapper:

```typescript
execute: (
  toolCallId: string,
  params: Static<TParameters>,
  signal?: AbortSignal,
  onUpdate?: AgentToolUpdateCallback<TDetails>,
) => Promise<AgentToolResult<TDetails>>;
```

`toolCallId` liên kết log và UI state. `params` là value đã prepare và validate. `signal` là cancellation channel của run. Tool phải check nó và truyền nó vào filesystem, process, network hoặc timer API có hỗ trợ cancel; chỉ nhận signal không khiến một dependency bất kỳ tự biết cancel. Abort đã biết nên throw message cụ thể như `Command aborted` hoặc `Read cancelled: src/main.ts`.

`onUpdate` phát partial `AgentToolResult` để quan sát. Tool chạy lâu có thể publish partial output hữu ích trong khi final `content` vẫn là giá trị có thẩm quyền:

```typescript
onUpdate?.({
  content: [{ type: "text", text: collectedStdout }],
  details: { phase: "running", elapsedMs: Date.now() - startedAt },
});
```

Agent core bọc callback được chấp nhận thành event `tool_execution_update` có call ID, Tool name, raw call arguments và `partialResult`. Runtime ngừng nhận callback ngay khi promise của `execute` settle. Callback đến muộn từ timer hoặc process listener bị bỏ qua. Runtime cũng chờ mọi update-event promise đã nhận settle trước khi trả success hoặc encode exception. Một call vì vậy có thứ tự:

```text
tool_execution_start
  -> zero or more tool_execution_update events
  -> execute promise settles
  -> accepted update emissions settle
  -> afterToolCall settles
  -> tool_execution_end
  -> ToolResultMessage message_start
  -> ToolResultMessage message_end
```

Cancellation có thể được quan sát trước pre-hook, sau hook hoặc bên trong Tool. Preparation trả `Operation aborted` khi thấy signal tại các điểm check. Trong execution, code của Tool quyết định tốc độ dừng. Loop bắt abort error do Tool throw thành error result, còn Agent run xung quanh dùng cùng signal để dừng provider work và scheduling về sau. Code không được thả mutation lock trong khi write bên dưới vẫn có thể hoàn tất; built-in `edit` check signal sau các operation được await nhưng vẫn giữ per-file queue.

### Bước 5: `afterToolCall` áp dụng field-level patch

Agent core chỉ gọi `afterToolCall` sau khi một Tool được phép đã return hoặc throw. Hook nhận assistant message, call, validated args, `AgentToolResult` hiện tại, `isError` hiện tại, Agent context và run signal. Return value patch các field được chọn mà không deep merge:

| Field trả về | Quy tắc merge và cách dùng                                                                                                      |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| `content`    | Thay toàn bộ array text/image block; dùng để redact hoặc normalize result.                                                       |
| `details`    | Thay toàn bộ details value; dùng cho audit hoặc UI metadata.                                                                     |
| `isError`    | Thay error flag; hook có thể đánh dấu returned result là lỗi hoặc chủ động phục hồi execution error.                             |
| `usage`      | Thay Tool-owned usage, chẳng hạn token do nested model call tiêu thụ.                                                            |
| `terminate`  | Thay runtime hint; chỉ có hiệu lực khi mọi finalized result trong batch kết thúc với `terminate: true`.                          |

Hook sau redact text result giống secret và giữ nguyên mọi field không được nhắc đến:

```typescript
agent.afterToolCall = async ({ toolCall, result, isError }) => {
  if (toolCall.name !== "read_secret" || isError) return undefined;

  return {
    content: result.content.map((block) =>
      block.type === "text"
        ? { type: "text" as const, text: "[REDACTED BY POLICY]" }
        : block,
    ),
  };
};
```

Nếu core hook throw, `finalizeExecutedToolCall()` thay result hiện tại bằng text error result và đặt `isError: true`. Trong Coding Agent, Extension handler `tool_result` cung cấp product hook hẹp hơn: nó có thể thay `content`, `details`, `isError` cùng `usage`, nhưng public result type không có field `terminate`. Extension runner bắt và report exception của từng `tool_result` handler rồi tiếp tục handler chain; handler failure được log đó không thay Tool result. Coding Agent normalize result image sau chain. Core `afterToolCall` hỗ trợ `terminate`; Extension `tool_result` thì không.

### Pipeline kết thúc bằng `ToolResultMessage`

Normalized transcript type thuộc Pi AI. Đoạn trích trung thành từ `packages/ai/src/types.ts` giữ toàn bộ field của type này:

```typescript
export interface ToolResultMessage<TDetails = any> {
  role: "toolResult";
  toolCallId: string;
  toolName: string;
  content: (TextContent | ImageContent)[];
  details?: TDetails;
  usage?: Usage;
  addedToolNames?: string[];
  isError: boolean;
  timestamp: number;
}
```

`createToolResultMessage()` chép call ID và name, normalize content bị thiếu từ JavaScript extension thành `[]`, mang theo details cùng usage, chỉ thêm `addedToolNames` khi array không rỗng, đặt finalized error flag và đóng timestamp bằng `Date.now()`. Một successful result có thể trông như sau:

```typescript
const resultMessage = {
  role: "toolResult",
  toolCallId: "call_abc123",
  toolName: "read",
  content: [{ type: "text", text: "export const answer = 42;" }],
  details: { path: "src/main.ts" },
  isError: false,
  timestamp: 1787533200000,
} satisfies ToolResultMessage<{ path: string }>;
```

`terminate` không có trong message này theo chủ đích. Nó điều khiển việc runtime có gọi model thêm một lần sau batch hiện tại hay không; nó không thuộc provider transcript. `addedToolNames` phục vụ mục đích khác: field này đánh dấu definition bắt đầu available từ vị trí transcript hiện tại, giúp provider có native deferred Tool loading giữ đúng load point. Provider khác dùng active Tool list hiện tại ở request kế tiếp.

Khi Coding Agent Tool gọi `pi.setActiveTools()`, registered wrapper so sánh active names trước và sau execution. Thay đổi chỉ thêm Tool sẽ trở thành `addedToolNames` trong result. Nếu cùng call loại một Tool vốn active, wrapper không ghi additive marker. Khi xây dynamic Tool discovery, hãy register mọi candidate Tool trước, chỉ để loader set active ban đầu, rồi thêm các tên phù hợp mà không loại tên hiện tại.

## 3. Batch scheduling tách ordering khỏi concurrency

### Một assistant message có thể yêu cầu nhiều effect

Assistant content array có thể trộn text với nhiều call. Call order vẫn là source order ngay cả khi các effect có thể overlap:

```typescript
const content = [
  { type: "text", text: "I will inspect the implementation and tests." },
  {
    type: "toolCall",
    id: "call_1",
    name: "read",
    arguments: { path: "src/main.ts" },
  },
  {
    type: "toolCall",
    id: "call_2",
    name: "grep",
    arguments: { pattern: "TODO", path: "src" },
  },
  {
    type: "toolCall",
    id: "call_3",
    name: "find",
    arguments: { pattern: "*.test.ts" },
  },
] satisfies AssistantMessage["content"];
```

Read-only call thường hưởng lợi từ concurrency. Mutation cần ownership rule rõ hơn. Hai effect read-modify-write có thể cùng đọc một phiên bản cũ rồi overwrite lẫn nhau:

```text
edit call 1: read app.ts at version A -> compute version B -> write B
edit call 2: read app.ts at version A -> compute version C -> write C
final file: B or C, with one valid change lost
```

Scheduler không thể suy luận mọi conflict chỉ từ Tool name và JSON arguments. Database Tool, deployment Tool hoặc interactive prompt có thể dùng chung state mà Agent core không nhìn thấy.

### Parallel execution gồm nhiều bước hơn một `Promise.all`

Pi tách preflight, effect, finalization và transcript emission. `beforeToolCall` chạy trong preflight theo source order vì policy handler có thể đọc hoặc cập nhật shared application state. Effect được phép sau đó mới chạy concurrent. Mỗi result vẫn qua `afterToolCall` trước end event. Final result message được phát theo source order sau khi concurrent work settle.

Immediate outcome có timeline riêng. Nếu call 1 không tồn tại hoặc bị block trong parallel preflight, `tool_execution_end` của nó được phát ngay, trước khi effect được phép ở call sau bắt đầu. Loop tiếp tục preflight call sau trừ khi thấy cancellation. Artifact `ToolResultMessage` cuối cùng vẫn được phát từ ordered finalized array.

### Một sequential Tool khiến cả batch chạy tuần tự

Global mode `Agent.toolExecution` mặc định là `"parallel"`. Một Tool có thể đặt `executionMode: "sequential"`. Nếu global mode là sequential hoặc bất kỳ active Tool nào được gọi mang per-Tool override đó, Pi chuyển cả batch qua sequential executor. Đoạn trích trung thành này lấy từ `packages/agent/src/agent-loop.ts` tại commit đã ghim:

```typescript
const hasSequentialToolCall = toolCalls.some(
  (tc) =>
    currentContext.tools?.find((t) => t.name === tc.name)?.executionMode ===
    "sequential",
);
if (config.toolExecution === "sequential" || hasSequentialToolCall) {
  return executeToolCallsSequential(
    currentContext,
    assistantMessage,
    toolCalls,
    config,
    signal,
    emit,
  );
}
return executeToolCallsParallel(
  currentContext,
  assistantMessage,
  toolCalls,
  config,
  signal,
  emit,
);
```

Batch vote thận trọng này tránh việc tự dựng một conflict analyzer. Dùng per-Tool override cho interaction, global state transition và operation có ý nghĩa phụ thuộc sibling order. Dùng global sequential mode khi host không thể cho phép bất kỳ overlap nào.

Bảy built-in definition của Coding Agent tại commit này đều không khai báo `executionMode`, vì vậy global default cho phép chúng overlap. Built-in `edit` và `write` thêm safeguard chính xác hơn: `withFileMutationQueue()` serialize toàn bộ mutation window theo canonical file path nhưng vẫn cho file khác chạy concurrent. Custom Tool mutate file nên dùng cùng exported helper với absolute target path đã resolve.

### Parallel path và sequential path phát timeline khác nhau

Sequential mode hoàn tất toàn bộ lifecycle của một call trước khi start call kế tiếp. Nó phát result message ngay sau end event của từng call. Nếu cancellation được thấy, executor break mà không start các call còn lại.

Parallel mode trước hết phát từng start event và chạy preparation theo source order. Nó lưu effect được phép thành deferred function. Sau preflight, `Promise.all` start các function đó cùng nhau. End event xuất hiện khi từng effect cộng post-hook hoàn tất; result-message event chờ ordered result của `Promise.all`. Pseudocode bám sát implementation cho thấy rõ khác biệt:

```text
sequential mode
  call 1 start -> prepare -> execute -> after -> end -> result message
  call 2 start -> prepare -> execute -> after -> end -> result message

parallel mode
  call 1 start -> prepare
  call 2 start -> prepare
  call 3 start -> prepare
  execute allowed calls concurrently
  call 2 after -> end
  call 1 after -> end
  call 3 after -> end
  emit result messages for call 1, call 2, call 3
```

Progress event có thể xen kẽ giữa các call trong parallel mode. Consumer phải correlate bằng `toolCallId`, không dựa vào vị trí event đến. Thứ tự `ToolResultMessage` được persist vẫn khớp với call trong assistant message, đúng với yêu cầu của provider adapter khi dựng request tiếp theo.

Batch termination cũng là ordered reduction chứ không phải race. `shouldTerminateToolBatch()` chỉ trả true cho finalized array không rỗng mà mọi `result.terminate` đều chính xác là `true`. Blocked call có thể tham gia qua `beforeToolCall`; allowed call tham gia qua `execute` hoặc core post-hook. Chỉ một result không terminate, invalid, unknown, cancelled hoặc thông thường cũng giữ automatic follow-up model turn.

## 4. Tool failure trở thành result message mà model nhìn thấy

### Sáu failure path phổ biến dùng chung một transcript product

Tool author nên throw khi execution thất bại. Agent core bắt exception tại Tool boundary, còn preparation và finalization có catch riêng. Transcript biểu diễn failure bằng `ToolResultMessage.isError: true` cùng text content. Sáu path trong baseline vẫn tồn tại với chi tiết hiện tại:

| Điểm failure              | Runtime behavior                                                                                     | Transcript product cuối                                    |
| ------------------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Tool name không active    | Trả ngay `Tool <name> not found`; bỏ qua preparation, hook và execution.                              | Error `ToolResultMessage`                                  |
| `prepareArguments` throw  | Preparation catch chuyển `error.message` hoặc `String(error)`.                                       | Error `ToolResultMessage`                                  |
| Schema validation fail    | Cùng catch đó mang theo formatted validation report.                                                 | Error `ToolResultMessage`                                  |
| `beforeToolCall` block    | Dùng reason hoặc default blocked text; chép termination hint bằng true.                               | Error `ToolResultMessage`; terminate chỉ ở runtime          |
| `execute` throw           | Ngừng nhận update, chờ update emission đã nhận, rồi tạo text error result.                            | Error `ToolResultMessage`                                  |
| `afterToolCall` throw     | Thay executed result bằng thrown message và đặt final error flag.                                    | Error `ToolResultMessage`                                  |

Abort được thấy trong preparation tạo thêm immediate error route, còn assistant response dừng vì `length` làm mọi Tool call fail mà không đi vào pipeline. Các safeguard đó mở rộng bảng baseline nhưng không đổi error-as-result contract cho call đã finalize.

### Execution catch đóng progress trước khi encode exception

Đoạn trích trung thành có lược bớt sau lấy từ `executePreparedToolCall()` trong `packages/agent/src/agent-loop.ts` tại commit đã ghim. Nó bắt đầu sau các local declaration thuộc function bao quanh và giữ nguyên state cùng settlement order:

```typescript
const updateEvents: Promise<void>[] = [];
let acceptingUpdates = true;

try {
  const result = await prepared.tool.execute(
    prepared.toolCall.id,
    prepared.args as never,
    signal,
    (partialResult) => {
      if (!acceptingUpdates) return;
      updateEvents.push(
        Promise.resolve(
          emit({
            type: "tool_execution_update",
            toolCallId: prepared.toolCall.id,
            toolName: prepared.toolCall.name,
            args: prepared.toolCall.arguments,
            partialResult,
          }),
        ),
      );
    },
  );
  acceptingUpdates = false;
  await Promise.all(updateEvents);
  return { result, isError: false };
} catch (error) {
  acceptingUpdates = false;
  await Promise.all(updateEvents);
  return {
    result: createErrorToolResult(
      error instanceof Error ? error.message : String(error),
    ),
    isError: true,
  };
} finally {
  acceptingUpdates = false;
}
```

Đoạn trích không độc lập vì local `prepared`, `signal` và `emit` do function bao quanh cung cấp. Nó không đổi các quyết định của source: callback đóng khi Tool promise settle, accepted event promise được drain ở cả success lẫn failure, và exception trở thành value `AgentToolResult`.

### Exception và message có receiver khác nhau

Uncaught exception hướng tới JavaScript call stack. `ToolResultMessage` hướng tới model trong request tiếp theo. Pi đổi receiver tại runtime boundary:

```text
inside Tool
  throw Error("ENOENT: src/config.ts")
    -> executePreparedToolCall catches it
    -> AgentToolResult { content: [text], details: {} }
    -> finalized isError: true
    -> ToolResultMessage linked to the original call
    -> provider adapter serializes the result for the next model turn
```

Runtime vẫn báo `isError` cho UI và event consumer. Encode failure thành message không giả vờ rằng call thành công. Cách làm này giữ đúng cặp assistant-call/result và đưa cho model bằng chứng cần thiết để sửa action kế tiếp.

### Error mà model nhìn thấy hỗ trợ nhiều recovery path

Host không thể chọn một recovery rule đúng cho mọi Tool. Conversation chứa intent và observation trước đó để model sử dụng:

| Result model nhìn thấy                                      | Action tiếp theo có cơ sở                                                                                         |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `read` báo `src/a.ts` không tồn tại                         | List hoặc search directory, chọn filename tìm được rồi read.                                                      |
| `edit` báo `oldText` không unique                           | Read file hiện tại, thu hẹp match rồi gửi một edit đã sửa.                                                        |
| `bash` báo thiếu package trong lúc build                    | Kiểm tra manifest và lockfile, sau đó xin permission hoặc install theo host policy.                               |
| Pre-hook báo destructive command đã bị block               | Chọn command có phạm vi hẹp hoặc giải thích vì sao policy không cho phép effect được yêu cầu.                     |

Framework biết call đã fail. Nó không biết path là typo, assumption cũ hay một file mới có chủ ý. Evidence cụ thể giúp model lập kế hoạch từ state thật trong khi loop vẫn giữ cấu trúc hợp lệ.

### Error text cụ thể giúp model tự sửa tốt hơn

`Operation failed` không cho model biết variable nào cần đổi. Built-in Tool `read` throw requested offset cùng tổng số dòng; `edit` ghi path và access code bên dưới; `bash` giữ captured output trước khi thêm abort, timeout hoặc exit status.

```text
weak:     Read failed
specific: Offset 200 is beyond end of file (100 lines total)

weak:     Command failed
specific: <captured output> followed by Command exited with code 2
```

Message cụ thể cũng cải thiện UI, log và human review. Không đưa secret, toàn bộ credential hoặc output không giới hạn vào error chỉ để tăng chi tiết. Error hữu ích nên ghi failed operation, safe identifier liên quan, constraint quan sát được và hướng sửa mà caller có thể thử.

### Built-in Tool xử lý chủ động rồi mới dùng framework fallback

Built-in Tool nhận diện failure mà chúng có thể giải thích. `read` check offset ngoài range trước khi slice. `edit` bọc access failure bằng requested path cùng error code. `bash` tích lũy output có giới hạn rồi gắn process status. Đoạn trích trung thành dưới đây từ `packages/coding-agent/src/core/tools/bash.ts` tại commit đã ghim cho thấy inner catch cùng exit handling hiện tại; local variable được khai báo trong `execute` bao quanh:

```typescript
try {
  const result = await ops.exec(spawnContext.command, spawnContext.cwd, {
    onData: handleData,
    signal,
    timeout,
    env: spawnContext.env,
  });
  exitCode = result.exitCode;
} catch (err) {
  const snapshot = await finishOutput();
  const { text } = formatOutput(snapshot, "");
  if (err instanceof Error && err.message === "aborted") {
    throw new Error(appendStatus(text, "Command aborted"));
  }
  if (err instanceof Error && err.message.startsWith("timeout:")) {
    const timeoutSecs = err.message.split(":")[1];
    throw new Error(
      appendStatus(text, `Command timed out after ${timeoutSecs} seconds`),
    );
  }
  throw err;
}

const snapshot = await finishOutput();
const { text: outputText, details } = formatOutput(snapshot);
if (exitCode !== 0 && exitCode !== null) {
  throw new Error(
    appendStatus(outputText, `Command exited with code ${exitCode}`),
  );
}
return { content: [{ type: "text", text: outputText }], details };
```

Case đã nhận diện nhận thêm context do Tool sở hữu. Exception không nhận diện được được rethrow nguyên trạng. `executePreparedToolCall()` cung cấp layer thứ hai: nó đưa `error.message`, hoặc `String(error)` cho non-`Error` throw, vào `createErrorToolResult()`. Fallback không viết lại mọi failure thành cùng một câu mơ hồ.

### Custom Tool nên giữ cách phân chia trách nhiệm đó

Custom Tool nên validate domain rule sau schema validation, tôn trọng signal, giới hạn output và chỉ bọc error mà nó hiểu. Extension hoàn chỉnh trong Section 1 theo đúng rule này: `ENOENT` trở thành `File does not exist: <path>`, còn read failure không biết trước được rethrow.

Tool có mutation cần thêm một practice. Dùng schema hẹp và resolve path dưới intended root, sau đó đặt toàn bộ read-modify-write window trong `withFileMutationQueue(absolutePath, fn)`. `executionMode: "sequential"` bảo vệ cả batch nhưng làm mất safe concurrency giữa file không liên quan; shared per-file queue bảo vệ đúng resource và phối hợp với built-in `edit` cùng `write`.

Security policy vẫn nằm ngoài model-facing description của Tool. Dùng `beforeToolCall` hoặc Extension `tool_call` để yêu cầu trust, confirmation, allowlist hay environment restriction. Tool vẫn phải enforce invariant riêng vì một host khác có thể không cài hook. Hãy redact cả final content lẫn progress details: `onUpdate` đến UI và event subscriber trước khi post-hook có thể thay final result.

### Error contract kết thúc tại Tool call đã finalize

Với call đã finalize, Tool failure trở thành error result và không thoát ra như raw Tool exception. Khẳng định đó có boundary. Extension event subscriber và provider callback có error policy riêng. Tool bỏ qua `AbortSignal` có thể tiếp tục external work sau khi người dùng cancel. Process crash không thể được chuyển đổi bởi in-process catch. Sequential batch dừng vì cancellation có thể để call phía sau chưa start thay vì tổng hợp result cho chúng.

Trong Agent loop path thông thường, mỗi call đã prepare và execute vẫn đạt một end state nhìn thấy được. Model nhận final error content khi loop tiếp tục, còn host nhận event có thứ tự ngay cả khi effect fail.

## 5. Operations interface tách Tool logic khỏi system access

### System call hard-code gắn behavior với một environment

Read implementation ngắn nhất gọi local filesystem trực tiếp:

```typescript
const content = await readFile(absolutePath, "utf8");
```

Lựa chọn này hợp lệ với application nhỏ, nhưng nó gắn path check, byte access, test và execution environment với local filesystem của Node. Remote workspace, in-memory test, sandbox broker hoặc audited filesystem proxy sẽ buộc phải sửa decision logic bên trong Tool.

Built-in Tool của Coding Agent thay vào đó nhận object `operations` nhỏ khi được tạo. Default thông thường vẫn dùng local filesystem, process, ripgrep hoặc fd. Test và host khác có thể cung cấp operation mà Tool cần mà không thay argument handling, truncation, progress, rendering hay result formatting.

### Mỗi Tool gọi một interface tối thiểu được inject

`ReadOperations` là public contract tiêu biểu. Đoạn source hoàn chỉnh dưới đây lấy từ `packages/coding-agent/src/core/tools/read.ts` tại commit đã ghim:

```typescript
export interface ReadOperations {
  readFile: (absolutePath: string) => Promise<Buffer>;
  access: (absolutePath: string) => Promise<void>;
  detectImageMimeType?: (
    absolutePath: string,
  ) => Promise<string | null | undefined>;
}
```

`createReadToolDefinition(cwd, options)` chọn `options?.operations ?? defaultReadOperations` một lần. `ToolDefinition` được trả về đóng trên value đó. Khi execution, Tool resolve requested path, gọi `ops.access`, gọi `ops.detectImageMimeType` nếu có, đọc qua `ops.readFile`, sau đó áp dụng cùng image processing, line selection, truncation, content construction và rendering metadata bất kể backend.

Pseudocode kiến trúc cho thấy substitution point:

```text
Tool policy and formatting
  -> ops.access(absolutePath)
  -> ops.detectImageMimeType(absolutePath) when provided
  -> ops.readFile(absolutePath)

default operations -> local Node filesystem
test operations    -> in-memory buffers
remote operations  -> authenticated workspace service
```

Ví dụ có thể sao chép sau tạo một built-in Read `ToolDefinition` thật với in-memory map làm backend. Code cung cấp đúng async operations contract và không cần file tạm:

```typescript
import {
  createReadToolDefinition,
  type ReadOperations,
} from "@earendil-works/pi-coding-agent";
import { resolve } from "node:path";

const projectRoot = resolve("/virtual/project");
const files = new Map<string, Buffer>([
  [resolve(projectRoot, "README.md"), Buffer.from("# Demo\n")],
]);

const operations: ReadOperations = {
  async access(absolutePath) {
    if (!files.has(absolutePath)) {
      throw new Error(`Virtual file does not exist: ${absolutePath}`);
    }
  },
  async readFile(absolutePath) {
    const value = files.get(absolutePath);
    if (!value) {
      throw new Error(`Virtual file does not exist: ${absolutePath}`);
    }
    return value;
  },
  async detectImageMimeType() {
    return null;
  },
};

export const virtualRead = createReadToolDefinition(projectRoot, {
  autoResizeImages: false,
  operations,
});
```

Backend SSH hoặc container có thể implement cùng interface, nhưng phải giữ contract: absolute path, rejected access cho target không đọc được, raw bytes từ `readFile`, cancellation trong transport riêng nếu có hỗ trợ, bounded execution và credential handling an toàn. Chỉ riêng interface không tạo ra sandbox.

### Bảy built-in chỉ khai báo operation mà chúng dùng

Public interface hiện tại vẫn tách theo từng Tool thay vì tạo một virtual operating system lớn:

| Tool  | Operations interface | Required method và return shape chính xác                                                                                       |
| ----- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Read  | `ReadOperations`     | `readFile(): Promise<Buffer>`, `access(): Promise<void>`, optional async `detectImageMimeType()`                                 |
| Write | `WriteOperations`    | async `writeFile(absolutePath, content)` và `mkdir(dir)`                                                                         |
| Edit  | `EditOperations`     | async `readFile(): Buffer`, `writeFile(absolutePath, content)` và `access()`                                                      |
| Bash  | `BashOperations`     | `exec(command, cwd, { onData, signal, timeout, env }): Promise<{ exitCode: number | null }>`                                     |
| Grep  | `GrepOperations`     | sync hoặc async `isDirectory(absolutePath)` và `readFile(absolutePath): string`                                                   |
| Find  | `FindOperations`     | sync hoặc async `exists(absolutePath)` và `glob(pattern, cwd, { ignore, limit }): string[]`                                      |
| Ls    | `LsOperations`       | sync hoặc async `exists`, `stat` có `isDirectory()`, và `readdir(): string[]`                                                     |

Read không thể write. Write không cần list directory. Grep và Find giữ input riêng của search. Bash sở hữu streaming bytes, environment, timeout, signal và exit code. Interface nhỏ giúp fake ngắn và ngăn Tool âm thầm dùng operation mà contract chưa từng khai báo.

Operations capture và Agent scheduling giải quyết hai vấn đề khác nhau. Operations object chọn cách một effect chạm resource. `executionMode` cùng `withFileMutationQueue()` quyết định nhiều effect overlap ra sao. `beforeToolCall` quyết định effect có được phép hay không. Tách các lựa chọn này giúp test từng phần độc lập.

## 6. Bài học thiết kế từ hệ thống Tool

Toàn bộ đường dẫn cho thấy bốn quyết định có thể dùng lại.

1. Mở rộng type tại layer sở hữu capability mới. Provider declaration, Agent execution và product rendering có dependency budget khác nhau. Adapter nhỏ có thể nối chúng mà không bắt lower layer import upper layer.
2. Tách compatibility, validation, policy, effect và result transformation. `prepareArguments` xử lý shape đã biết, validation thiết lập runtime parameter contract, pre-hook áp dụng host policy, `execute` sở hữu effect, còn post-hook patch result.
3. Giữ error dưới dạng typed information. Tool author throw failure cụ thể; Agent core chuyển chúng thành error result liên kết với call. Model có thể retry, đổi input hoặc giải thích policy boundary mà không làm hỏng transcript.
4. Làm rõ concurrency và resource access. Batch scheduling định nghĩa event cùng transcript order. Per-Tool execution mode xử lý conflict ở mức thô. Minimal Operations interface và per-resource queue xử lý system boundary thật.

Các quyết định này cũng chỉ ra nơi cần review. Schema và preparation code là input security. `beforeToolCall` là authorization policy. `execute` là side-effect và cancellation boundary. Progress event là observability boundary có thể làm lộ data. `afterToolCall` là điểm redact cuối cho model-visible content. `ToolResultMessage` là durable protocol được giao cho provider call kế tiếp.

## 7. Kết thúc: theo một call từ đầu đến cuối

Call `read` mở đầu giờ đã có đường dẫn hoàn chỉnh. Đây là pseudocode kiến trúc gắn với implementation hiện tại:

```text
AssistantMessage contains ToolCall("read", { path: "src/main.ts" })
  -> batch scheduler chooses sequential or parallel path
  -> tool_execution_start exposes raw call metadata
  -> active AgentTool lookup resolves "read"
  -> prepareArguments adapts a known legacy shape when defined
  -> validateToolArguments clones, normalizes, converts, and checks
  -> beforeToolCall may block with a model-visible reason
  -> execute receives validated params, AbortSignal, and onUpdate
  -> ReadOperations reaches the configured filesystem backend
  -> accepted progress events settle
  -> afterToolCall may replace content, details, usage, error, or termination
  -> tool_execution_end carries the finalized runtime result
  -> ToolResultMessage records call identity, content, details, and isError
  -> ordered result enters conversation history
  -> the batch-wide termination vote decides whether another model turn starts
```

Tool execution là một controlled protocol bao quanh effect. Schema giới hạn argument language, preparation giữ old call dùng được, hook enforce product policy, signal mang cancellation, progress làm long-running work quan sát được, scheduling bảo vệ order, còn result message giữ failure cho model xử lý.

Chương 6 sẽ theo dõi các message đó qua Agent transcript giàu thông tin hơn và provider conversion boundary. Chương tiếp theo cũng giải thích vì sao Tool details có thể phục vụ UI trong khi chỉ text và image content đi vào model-facing result thông thường.

Source review cho chương này được ghim tại Pi `0.84.2`, commit `a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c`. Các file chính gồm `packages/ai/src/types.ts` và `utils/validation.ts`; `packages/agent/src/types.ts`, `agent-loop.ts` cùng `agent.ts`; `packages/coding-agent/src/core/extensions/types.ts`, `runner.ts`, `wrapper.ts` cùng `loader.ts`; `core/agent-session.ts`; và các Tool implementation trong `packages/coding-agent/src/core/tools/`.

[Chương 6: Hệ thống Message](ch06-messages.md)
