---
title: "Chương 5: Hệ thống Tool"
description: Cách Pi định nghĩa, chuyển đổi, xác thực, lập lịch, thực thi và ghi lại các lời gọi Tool.
translation_key: ch05-tool-system
language: vi
chapter: 5
source_url: "https://www.dgzhuya.com/modules/ch05-tool-system"
official_refs:
  - "https://github.com/earendil-works/pi/blob/4e58f324fae8ebfa98a3d45181fb248072a2afac/packages/agent/README.md#tools"
  - "https://github.com/earendil-works/pi/blob/4e58f324fae8ebfa98a3d45181fb248072a2afac/packages/coding-agent/docs/extensions.md#custom-tools"
terms_used:
  - Tool
  - ToolCall
  - ToolResultMessage
  - AgentTool
  - ToolDefinition
status: reviewed
last_updated: "2026-08-25"
translator: Pify maintainers
reviewed_by: Pify maintainers
---

Chương 3 theo dõi một lượt của Agent: từ phản hồi của model, qua bước thực thi Tool, rồi trở lại hội thoại. Chương 4 dừng ở phía còn lại của ranh giới ấy, nơi adapter của provider chuẩn hóa yêu cầu từ model thành khối `ToolCall` sau.

```json
{
  "type": "toolCall",
  "id": "call_abc123",
  "name": "read",
  "arguments": { "path": "src/main.ts" }
}
```

Khối này không cấp quyền thực hiện thao tác và cũng không chứa mã có thể chạy. Runtime vẫn phải tìm đúng Tool theo tên, chuẩn bị và xác thực các đối số không đáng tin cậy, áp dụng chính sách của sản phẩm, xử lý yêu cầu hủy, chạy thao tác, báo tiến độ, chốt kết quả rồi tạo `ToolResultMessage` tương ứng. Khi một thông điệp chứa cả lô, runtime còn phải xác định những thao tác nào có thể chạy đồng thời mà không làm hỏng trạng thái dùng chung.

Pi `0.84.3` giải quyết các yêu cầu đó bằng ba lớp kiểu có liên hệ với nhau và một luồng thực thi gồm nhiều giai đoạn. Mô hình giảng dạy năm bước trước đây vẫn hữu ích—chuẩn bị, xác thực, hook trước, thực thi, hook sau—nhưng phần triển khai hiện tại còn quy định cách lập lịch, thứ tự sự kiện, ranh giới hủy, cách tạo kết quả và điều kiện dừng cho cả lô. Chương này đi qua toàn bộ luồng đó theo commit được ghim `4e58f324fae8ebfa98a3d45181fb248072a2afac`.

## 1. Ba lớp kiểu giữ hướng phụ thuộc về phía lõi

### Lớp 1: `Tool` mô tả khả năng mà provider công bố

Ở lớp model, hệ thống chỉ cần đủ thông tin để công bố một khả năng có thể gọi. Lớp này không cần biết ứng dụng sẽ thực thi hay hiển thị khả năng đó ra sao. Đoạn trích nguyên vẹn dưới đây là toàn bộ interface `Tool` trong `packages/ai/src/types.ts` tại commit đã ghim:

```typescript
export interface Tool<TParameters extends TSchema = TSchema> {
  name: string;
  description: string;
  parameters: TParameters;
  constrainedSampling?: false | ConstrainedSamplingConfig;
}
```

`name` là định danh giao thức được chép vào `ToolCall.name`. `description` và `parameters` cho model biết khi nào nên dùng Tool và đối tượng đối số cần có cấu trúc nào. `parameters` là một TypeBox `TSchema`. Trường tùy chọn `constrainedSampling` yêu cầu provider tương thích áp dụng JSON Schema hoặc lấy mẫu có ràng buộc bằng ngữ pháp; giá trị `false` tắt yêu cầu này một cách tường minh.

Lớp này chỉ mô tả yêu cầu mà model có thể gửi. Nó không có phương thức `execute`, nhãn hiển thị, bộ kết xuất UI, quyền truy cập session hay tín hiệu hủy. Adapter của provider chỉ tuần tự hóa những trường khai báo mà provider hỗ trợ. Nhờ ranh giới đó, ứng dụng gọi model trực tiếp vẫn dùng được `@earendil-works/pi-ai` mà không cần Agent runtime.

### Lớp 2: `AgentTool` bổ sung ràng buộc thực thi

Agent core phải biến lời gọi đã chuẩn hóa thành một thao tác và một kết quả đã chuẩn hóa. Nó mở rộng `Tool<TParameters>` thay vì tạo thêm một khai báo khác dành cho provider. Đoạn trích sau lấy từ `packages/agent/src/types.ts` tại cùng commit; phần chú thích được lược bỏ, còn chữ ký generic và các thành viên được giữ nguyên:

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

`label` dành cho người dùng; nó có thể là `Read file` trong khi tên giao thức vẫn là `read`. `prepareArguments` xử lý một cấu trúc dữ liệu cũ hoặc sai lệch đã biết trên đường truyền trước khi xác thực. `execute` nhận các tham số đã xác thực, ID của lời gọi, `AbortSignal` tùy chọn của lượt chạy và callback tiến độ tùy chọn. `executionMode` nhận `"parallel"` hoặc `"sequential"`.

Kết quả phục vụ hai phía. `content` chứa các khối văn bản hoặc hình ảnh dành cho model. `details` chứa dữ liệu có cấu trúc của ứng dụng để hiển thị, ghi log hoặc tái tạo trạng thái. Kết quả cuối còn có thể báo `usage` của Tool lồng bên trong, ghi tên Tool mới được thêm hoặc yêu cầu dừng sớm. Interface TypeScript bắt buộc có `details`, kể cả khi kiểu chi tiết tương ứng cho phép giá trị `{}` hoặc `undefined`.

Ví dụ `AgentTool` cấp thấp dưới đây có thể sao chép. Nó truyền đủ hai tham số generic để giữ kiểu cho `params.path` và dữ liệu chi tiết về tiến độ. Mã kiểm tra yêu cầu hủy trước và sau thao tác với hệ thống tệp; lớp bọc dùng trong thực tế cũng có thể truyền `signal` xuống thao tác bên dưới.

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

### Lớp 3: Extension `ToolDefinition` bổ sung phần việc của sản phẩm

Coding Agent cần nội dung đóng góp vào prompt, phần hiển thị trên terminal và ngữ cảnh session hiện tại cho extension. `ToolDefinition` công khai của Extension bổ sung các phần việc đó mà không khiến Agent core phụ thuộc vào TUI hoặc trình quản lý session. Đoạn trích không độc lập sau lấy từ `packages/coding-agent/src/core/extensions/types.ts` tại commit đã ghim. Các kiểu generic và kiểu hàm được giữ chính xác, còn phần chú thích tài liệu được lược bỏ:

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

`promptSnippet` đưa Tool vào danh sách Tool khả dụng rút gọn trong system prompt mặc định. `promptGuidelines` thêm hướng dẫn riêng khi Tool đang hoạt động. Mỗi hướng dẫn phải ghi rõ tên Tool vì Coding Agent nối các gạch đầu dòng vào cùng một mục. `renderCall` và `renderResult` tạo thành phần TUI; `TState` định kiểu trạng thái dùng chung giữa các vị trí kết xuất. `renderShell: "self"` báo rằng bộ kết xuất tự cung cấp phần khung hiển thị.

Đối số thứ năm của `execute` là Extension `ctx`. Nó cung cấp thư mục làm việc hiện tại, chế độ, khả năng UI, trình quản lý session chỉ đọc, bộ đăng ký model, model hiện tại, các model trong phạm vi, mức suy luận, `signal` hiện tại và các thao tác có kiểm soát như `abort()`, `compact()` cùng `getSystemPrompt()`. Đây là trách nhiệm của Coding Agent, không thuộc Agent core.

### `defineTool()` và `pi.registerTool()` phục vụ hai thời điểm khác nhau

Object literal truyền trực tiếp vào `pi.registerTool()` nhận cách định kiểu theo ngữ cảnh từ `ExtensionAPI.registerTool<TParams, TDetails, TState>()`. Một định nghĩa được gán vào biến trước đó có thể mất khả năng suy luận kiểu tham số trước khi đến phương thức này. `defineTool()` là hàm đồng nhất có kiểu giao cắt ở giá trị trả về, nhờ đó giữ được khả năng suy luận cho biến và mảng. Đây là toàn bộ phần triển khai trong `packages/coding-agent/src/core/extensions/types.ts` tại commit đã ghim:

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

`defineTool()` không đăng ký hay bọc bất kỳ thứ gì ở runtime. `pi.registerTool()` lưu định nghĩa theo tên và làm mới bộ đăng ký Tool của session. Việc đăng ký và kích hoạt tách biệt khi dùng danh sách cho phép: một session do SDK tạo với mảng `tools` phải chứa tên Tool tùy chỉnh, còn extension có thể đọc hoặc đổi danh sách đang hoạt động bằng `pi.getActiveTools()` và `pi.setActiveTools(names)`. `setActiveTools()` bỏ qua tên chưa được đăng ký.

Extension hoàn chỉnh dưới đây có thể sao chép. Mã truyền kiểu chi tiết tường minh cho `defineTool()`, đăng ký kết quả qua `pi.registerTool()`, giới hạn đích đang tồn tại trong thư mục gốc chuẩn hóa của dự án, chỉ báo tiến độ sau bước kiểm tra đó, truyền `signal` của lượt chạy vào `readFile` và ném lỗi có đường dẫn cho trường hợp thất bại đã biết.

```typescript
import { Type } from "@earendil-works/pi-ai";
import {
  defineTool,
  type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";
import { readFile, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

const inspectTextParameters = Type.Object({
  path: Type.String({ description: "Project-relative UTF-8 file path" }),
});

interface InspectTextDetails {
  path: string;
  phase: "reading" | "done";
  bytes?: number;
}

function isWithinRoot(root: string, candidate: string): boolean {
  const pathFromRoot = relative(root, candidate);
  return (
    pathFromRoot === "" ||
    (pathFromRoot !== ".." &&
      !pathFromRoot.startsWith(`..${sep}`) &&
      !isAbsolute(pathFromRoot))
  );
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
    if (signal?.aborted) throw new Error(`Read cancelled: ${params.path}`);
    if (isAbsolute(params.path)) {
      throw new Error(`Path must be project-relative: ${params.path}`);
    }

    const projectRoot = await realpath(ctx.cwd);
    const candidatePath = resolve(projectRoot, params.path);
    if (!isWithinRoot(projectRoot, candidatePath)) {
      throw new Error(`Path leaves project root: ${params.path}`);
    }

    try {
      const absolutePath = await realpath(candidatePath);
      if (!isWithinRoot(projectRoot, absolutePath)) {
        throw new Error(`Symlink target leaves project root: ${params.path}`);
      }
      if (signal?.aborted) throw new Error(`Read cancelled: ${params.path}`);

      onUpdate?.({
        content: [{ type: "text", text: `Reading ${params.path}` }],
        details: { path: params.path, phase: "reading" },
      });

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

Kiểm tra ở mức chuỗi đường dẫn từ chối đầu vào là đường dẫn tuyệt đối, đường dẫn thoát bằng `..` và đích nằm trên ổ đĩa khác. Sau đó, `realpath()` phân giải đích đang tồn tại: symlink chỉ được phép khi đường dẫn thực của đích vẫn nằm dưới thư mục gốc đã chuẩn hóa của dự án. Lỗi `ENOENT` trong lúc phân giải hoặc đọc được chuyển thành lỗi thiếu tệp có kèm đường dẫn. Tool đọc đích đã phân giải thay vì đường dẫn symlink ban đầu.

Giữa `realpath()` và `readFile()` vẫn có một điều kiện tranh chấp trên hệ thống tệp: kẻ tấn công có quyền thay thư mục có thể chuyển đích sau bước kiểm tra. Hệ thống tệp dùng chung với bên không đáng tin cậy cần thêm sandbox của hệ điều hành hoặc API hệ thống tệp dựa trên descriptor bên cạnh việc giới hạn bằng đường dẫn đã chuẩn hóa.

### Bộ chuyển đổi cung cấp `ExtensionContext` mà không mở rộng Agent core

Agent Loop nhận `AgentTool`, còn bộ đăng ký của sản phẩm lưu `ToolDefinition`. `wrapToolDefinition()` chuyển dạng sau thành dạng trước. Phần triển khai hoàn chỉnh dưới đây nằm trong `packages/coding-agent/src/core/tools/tool-definition-wrapper.ts` tại commit đã ghim:

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

Lớp bọc chép các trường thuộc giao thức và runtime, giữ các trường về prompt và hiển thị ở Coding Agent, rồi chuyển đổi `execute`. Phần triển khai của lớp bọc chấp nhận một ngữ cảnh thứ năm tùy chọn ở nội bộ. Agent core thông thường chỉ truyền bốn đối số, vì vậy lớp bọc gọi `ctxFactory()` rồi cung cấp `ExtensionContext` nhận được.

Tool do extension đăng ký dùng `() => runner.createContext()` làm hàm tạo ngữ cảnh. `createContext()` tạo một đối tượng với getter có kiểm soát, chỉ được tính khi truy cập, cùng các phương thức được phân giải tại thời điểm gọi. Vì vậy, Tool thấy session, model, tập Tool, `signal` và trạng thái UI hiện tại thay vì các giá trị bị đóng băng từ lúc nạp extension. Trình chạy cũ sẽ từ chối truy cập sau khi extension được nạp lại hoặc session bị thay thế. Agent Loop không import `ExtensionContext` và không thể truy cập trực tiếp API session của Coding Agent.

Ranh giới này áp dụng cho định nghĩa được đăng ký qua trình chạy Extension. Các định nghĩa dựng sẵn cũng được bọc trực tiếp nhưng không truyền hàm tạo ngữ cảnh; phần triển khai của chúng coi giá trị thứ năm là tùy chọn tại nơi sử dụng. Extension cần `ctx` nên đăng ký qua `pi.registerTool()` hoặc luồng ResourceLoader được hỗ trợ, không nên gọi lớp bọc nội bộ khi thiếu hàm tạo ngữ cảnh.

Mã giả kiến trúc sau tóm tắt bước chuyển đổi và vẫn cho thấy rõ thành phần nào sở hữu phần việc nào. Đây không phải API có thể import:

```text
pi-ai Tool declaration
  -> pi-agent-core AgentTool execution contract
  -> Coding Agent ToolDefinition prompt, rendering, and session contract
  -> wrapToolDefinition copies shared fields
  -> execute closure obtains a fresh ExtensionContext
  -> Agent Loop still invokes the four-argument AgentTool contract
```

### Vì sao nên giữ riêng ba lớp

Đưa mọi trường vào một interface sẽ đảo ngược hướng phụ thuộc. Adapter của provider sẽ phải hiểu `Component` trên terminal. Agent core sẽ cần trình quản lý session chỉ để chạy một Tool đơn giản trong bộ nhớ. Agent chạy trên trình duyệt sẽ kéo theo phần việc của Node và TUI dù không dùng đến chúng.

Chuỗi kiểu hiện tại chỉ bổ sung khả năng tại lớp có thể triển khai nó. Pi AI mô tả yêu cầu. Agent core thực thi và lập lịch. Coding Agent bổ sung prompt, phần hiển thị, bộ đăng ký và hành vi session của sản phẩm. Lớp bọc đủ hẹp để kiểm tra: mọi trường được chép và bước truyền ngữ cảnh đều hiện rõ trong một hàm.

## 2. Quy trình thực thi biến yêu cầu thành kết quả

### Gọi trực tiếp bỏ qua ràng buộc về chính sách và giao thức

Tra Tool rồi gọi ngay `await tool.execute()` sẽ bỏ qua nhiều ràng buộc có thể quan sát. Model có thể gọi tên một Tool chưa hoạt động. Session được khôi phục có thể chứa cấu trúc đối số cũ. Trường bắt buộc có thể bị thiếu. Hook chính sách có thể cần chặn một yêu cầu nguy hiểm. Người dùng có thể hủy trong khi tiến trình chạy lâu. Ngoại lệ vẫn cần một kết quả liên kết với lời gọi ban đầu để transcript của provider giữ đúng cấu trúc.

Lời gọi không hợp lệ dưới đây phù hợp hơn ví dụ lịch sử `path: 12345`. Bước xác thực hiện tại thực hiện các phép chuyển đổi kiểu nguyên thủy được hỗ trợ, nên một số có thể trở thành chuỗi. Thuộc tính bắt buộc bị thiếu thì không thể thỏa schema này:

```json
{
  "type": "toolCall",
  "id": "call_missing_path",
  "name": "read",
  "arguments": { "offset": 20 }
}
```

Quyền do ứng dụng cấp cũng nằm ngoài model. Việc model yêu cầu chạy lệnh shell chỉ biểu thị ý định, không phải quyền thực thi. Hook trước kiểm tra các đối số hiệu lực đã được xác thực theo chính sách của host trước khi thao tác bắt đầu.

### Quy trình hiện tại còn bao gồm sự kiện và điều khiển lô

Năm giai đoạn xử lý về mặt khái niệm nằm trong một luồng sự kiện và lập lịch lớn hơn. Mã giả sau bám sát phần triển khai trong `packages/agent/src/agent-loop.ts` tại commit đã ghim:

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

Tool không tồn tại, lỗi chuẩn bị, lỗi xác thực, yêu cầu hủy được phát hiện trong lúc chuẩn bị và lời gọi bị chặn đều tạo kết quả ngay lập tức. Chúng bỏ qua `execute` cùng `afterToolCall`, nhưng lời gọi đã được chốt vẫn phát `tool_execution_end` và sự kiện của thông điệp kết quả. Phản hồi dừng vì `length` còn nghiêm ngặt hơn: mọi lời gọi Tool trong thông điệp của assistant đó đều thất bại mà không chạy vì các đối số truyền theo luồng có thể đã bị cắt mà không có dấu hiệu rõ ràng.

### Bước 1: `prepareArguments` chuyển đổi cấu trúc cũ đã biết

`prepareArguments(args: unknown)` chỉ chạy khi Tool đã được phân giải có định nghĩa hook này. Giá trị trả về thay thế các đối số thô trong bước xác thực và thực thi. Tool `edit` dựng sẵn hiện dùng hook để tương thích với model và session: phân tích `edits` ở dạng chuỗi JSON, bọc một đối tượng edit thành mảng và chuyển dạng cũ có `oldText`/`newText` ở cấp cao nhất sang mảng hiện tại.

Đầu vào và đầu ra sau minh họa quy tắc tương thích đó:

```jsonc
// Raw arguments from an older stored call
{ "path": "app.ts", "oldText": "v1", "newText": "v2" }

// Effective arguments returned for current validation
{
  "path": "app.ts",
  "edits": [{ "oldText": "v1", "newText": "v2" }]
}
```

Bước chuẩn bị là phép tính xác định tại ranh giới này. Yêu cầu mạng, lời nhắc xin quyền, thao tác ghi và thay đổi trạng thái dùng chung thuộc về `beforeToolCall` hoặc `execute`, nơi hành vi hủy và thứ tự đã được quy định. Giữ schema công khai ở dạng hiện tại cũng tránh quảng bá trường đã lỗi thời cho model chỉ để khôi phục một transcript cũ.

### Bước 2: xác thực sao chép, chuẩn hóa, chuyển đổi rồi mới kiểm tra

`validateToolArguments()` được export công khai từ Pi AI và nằm trong `packages/ai/src/utils/validation.ts`. Hàm dùng `structuredClone()` để sao chép các đối số đã chuẩn bị, coi `null` như giá trị bị bỏ qua đối với thuộc tính tùy chọn không nhận `null`, áp dụng TypeBox `Value.Convert`, rồi kiểm tra bằng validator được lưu đệm. JSON Schema thuần sau khi tuần tự hóa có thêm một nhánh ép kiểu nguyên thủy tương thích với AJV.

Bước chuyển đổi bác bỏ khẳng định cũ rằng mọi kiểu nguyên thủy sai đều phải thất bại. Các kiểm thử hiện tại chứng minh những trường hợp như `"42"` được đổi thành `42` cho schema số và `true` thành `"true"` cho schema chuỗi. Bước xác thực vẫn từ chối giá trị không thể thỏa schema sau các phép chuyển đổi được hỗ trợ. Nội dung lỗi ghi tên Tool, định dạng từng đường dẫn trong schema kèm thông báo cục bộ hóa và đính kèm các đối số ban đầu. Khi thiếu `path`, thông điệp có dạng sau:

```text
Validation failed for tool "read":
  - path: Expected required property

Received arguments:
{
  "offset": 20
}
```

`prepareToolCall()` bắt chuỗi đó và đưa vào kết quả lỗi; `execute` không bao giờ nhận đối tượng đã bị từ chối. Bản thân bước chuẩn bị có thể đổi đối tượng đối số ban đầu nếu phần triển khai tùy chỉnh sửa trực tiếp đầu vào, nên `prepareArguments` tùy chỉnh cần trả về giá trị mới và tránh thay đổi đối tượng cũ.

### Bước 3: `beforeToolCall` áp dụng chính sách của host

Hook của Agent core nhận `{ assistantMessage, toolCall, args, context }` cùng `signal` tùy chọn của lượt chạy. `args` đã qua xác thực. `toolCall` thô vẫn có mặt để lấy danh tính và metadata giao thức. Ràng buộc trả về hiện tại là:

| Giá trị hook trả về                                       | Tác động ở runtime                                                                                     |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `undefined` hoặc `{ block: false }`                       | Tiếp tục nếu `signal` chưa bị hủy.                                                                     |
| `{ block: true }`                                         | Bỏ qua thực thi và tạo kết quả lỗi với nội dung `Tool execution was blocked`.                          |
| `{ block: true, reason: "Policy denied this path" }`      | Dùng `reason` được cung cấp làm nội dung lỗi.                                                          |
| `{ block: true, reason: "Final denial", terminate: true }` | Đánh dấu kết quả này là dừng; toàn lô vẫn cần mọi kết quả cùng yêu cầu dừng.                           |

Hook Agent-core sau có thể gắn vào một `Agent` hiện có để chặn quyền truy cập shell. Mã đọc đối tượng đã xác thực theo cách phòng thủ vì kiểu công khai của `BeforeToolCallContext.args` là `unknown`:

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

API `beforeToolCall` tổng quát của Agent core là ràng buộc để kiểm tra và chặn. `BeforeToolCallResult` chỉ có thể trả `block`, `reason` và `terminate`; nó không có trường để thay đối số. Vì vậy, hook Agent-core dùng được ở nhiều host cần xem `args` là chỉ đọc và giữ nguyên giá trị đã xác thực.

Coding Agent chủ ý bổ sung một ràng buộc riêng cho phép thay đổi dữ liệu khi nối sự kiện Extension `tool_call` vào hook đó. Hàm xử lý nhận `toolName`, `toolCallId` và `event.input`; `event.input` chính là đối tượng đối số đã qua xác thực. Hàm xử lý có thể sửa `event.input` tại chỗ, và các hàm xử lý `tool_call` chạy sau sẽ thấy những thay đổi trước đó. Runtime không xác thực lại đối tượng trước `execute`, nên hàm xử lý thay đổi đầu vào phải giữ nguyên các bất biến của schema Tool hoặc tự kiểm tra lại. Hàm xử lý cũng có thể trả `block`, `reason` và `terminate`. Nếu hàm xử lý `tool_call` ném lỗi, bước chuẩn bị của Agent sẽ bắt lỗi rồi tạo kết quả lỗi, vì vậy lỗi trong chính sách của extension không vô tình cho phép thao tác chạy.

### Bước 4: `execute` sở hữu thao tác, hành vi hủy và tiến độ

Ràng buộc gọi chính xác của Agent core có thể đọc độc lập với wrapper của sản phẩm:

```typescript
execute: (
  toolCallId: string,
  params: Static<TParameters>,
  signal?: AbortSignal,
  onUpdate?: AgentToolUpdateCallback<TDetails>,
) => Promise<AgentToolResult<TDetails>>;
```

`toolCallId` liên kết log và trạng thái UI. `params` là giá trị đã được chuẩn bị và xác thực. `signal` là kênh báo hủy của lượt chạy. Tool phải kiểm tra nó và truyền nó vào API hệ thống tệp, tiến trình, mạng hoặc bộ hẹn giờ có hỗ trợ hủy; chỉ nhận `signal` không khiến một thành phần phụ thuộc bất kỳ tự dừng. Trường hợp hủy đã biết nên ném thông báo cụ thể như `Command aborted` hoặc `Read cancelled: src/main.ts`.

`onUpdate` phát `AgentToolResult` từng phần để bên ngoài quan sát. Tool chạy lâu có thể công bố đầu ra tạm thời hữu ích, trong khi `content` cuối vẫn là kết quả chính thức:

```typescript
onUpdate?.({
  content: [{ type: "text", text: collectedStdout }],
  details: { phase: "running", elapsedMs: Date.now() - startedAt },
});
```

Agent core bọc callback được chấp nhận thành sự kiện `tool_execution_update` có ID lời gọi, tên Tool, đối số thô của lời gọi và `partialResult`. Runtime ngừng nhận callback ngay khi promise của `execute` kết thúc. Callback đến muộn từ bộ hẹn giờ hoặc trình lắng nghe tiến trình bị bỏ qua. Runtime cũng chờ mọi promise phát sự kiện cập nhật đã nhận hoàn tất trước khi trả thành công hoặc mã hóa ngoại lệ. Vì vậy, một lời gọi có thứ tự sau:

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

Yêu cầu hủy có thể được phát hiện trước hook, sau hook hoặc bên trong Tool. Bước chuẩn bị trả `Operation aborted` khi thấy `signal` tại các điểm kiểm tra. Trong lúc thực thi, mã của Tool quyết định tốc độ dừng. Vòng lặp bắt lỗi hủy do Tool ném ra và tạo kết quả lỗi; lượt chạy Agent bao quanh dùng cùng `signal` để dừng công việc của provider và các bước lập lịch sau đó. Mã không được nhả khóa thay đổi khi thao tác ghi bên dưới vẫn có thể hoàn tất; Tool `edit` dựng sẵn kiểm tra `signal` sau các thao tác được `await` trong khi vẫn giữ hàng đợi theo tệp.

### Bước 5: `afterToolCall` áp dụng bản vá theo từng trường

Agent core chỉ gọi `afterToolCall` sau khi một Tool được phép đã trả về hoặc ném lỗi. Hook nhận thông điệp của assistant, lời gọi, các đối số đã xác thực, `AgentToolResult` hiện tại, `isError` hiện tại, ngữ cảnh của Agent và `signal` của lượt chạy. Giá trị trả về thay các trường được chọn mà không gộp sâu:

| Trường trả về | Quy tắc gộp và cách dùng                                                                                                       |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| `content`     | Thay toàn bộ mảng khối văn bản/hình ảnh; dùng để che dữ liệu hoặc chuẩn hóa kết quả.                                             |
| `details`     | Thay toàn bộ giá trị chi tiết; dùng cho kiểm toán hoặc metadata UI.                                                              |
| `isError`     | Thay cờ lỗi; hook có thể đánh dấu kết quả trả về là lỗi hoặc chủ động phục hồi lỗi thực thi.                                    |
| `usage`       | Thay mức sử dụng do Tool sở hữu, chẳng hạn số token mà một lời gọi đến model lồng bên trong đã tiêu thụ.                        |
| `terminate`   | Thay gợi ý dừng ở runtime; chỉ có hiệu lực khi mọi kết quả đã chốt trong lô đều có `terminate: true`.                            |

Hook sau che một kết quả văn bản có vẻ chứa bí mật và giữ nguyên mọi trường không được nhắc đến:

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

Nếu hook của core ném lỗi, `finalizeExecutedToolCall()` thay kết quả hiện tại bằng một kết quả lỗi dạng văn bản và đặt `isError: true`. Trong Coding Agent, hàm xử lý sự kiện Extension `tool_result` cung cấp hook sản phẩm hẹp hơn: nó có thể thay `content`, `details`, `isError` cùng `usage`, nhưng kiểu kết quả công khai không có trường `terminate`. Trình chạy Extension bắt và báo ngoại lệ của từng hàm xử lý `tool_result`, rồi tiếp tục chuỗi hàm xử lý; lỗi hàm xử lý đã được ghi log không thay kết quả Tool. Coding Agent chuẩn hóa hình ảnh trong kết quả sau chuỗi này. `afterToolCall` của core hỗ trợ `terminate`, còn Extension `tool_result` thì không.

### Quy trình kết thúc bằng `ToolResultMessage`

Kiểu transcript đã chuẩn hóa thuộc Pi AI. Đoạn trích từ `packages/ai/src/types.ts` giữ đầy đủ các trường của kiểu này:

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

`createToolResultMessage()` chép ID và tên lời gọi, chuẩn hóa `content` bị thiếu từ extension JavaScript thành `[]`, mang theo `details` cùng `usage`, chỉ thêm `addedToolNames` khi mảng không rỗng, đặt cờ lỗi đã chốt và ghi thời gian bằng `Date.now()`. Một kết quả thành công có thể có dạng sau:

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

`terminate` không có trong thông điệp này theo chủ đích. Nó điều khiển việc runtime có gọi model thêm một lần sau lô hiện tại hay không; nó không thuộc transcript của provider. `addedToolNames` phục vụ mục đích khác: trường này đánh dấu các định nghĩa bắt đầu khả dụng từ vị trí hiện tại trong transcript, giúp provider hỗ trợ nạp Tool trì hoãn ở cấp giao thức giữ đúng điểm nạp. Các provider khác dùng danh sách Tool đang hoạt động trong yêu cầu kế tiếp.

Khi một Tool của Coding Agent gọi `pi.setActiveTools()`, lớp bọc của Tool đã đăng ký sẽ so sánh tên các Tool đang hoạt động trước và sau khi thực thi. Thay đổi chỉ thêm Tool sẽ trở thành `addedToolNames` trong kết quả. Nếu cùng lời gọi đó loại một Tool vốn đang hoạt động, lớp bọc không ghi dấu cho biết có bổ sung. Khi xây dựng cơ chế khám phá Tool động, hãy đăng ký mọi Tool ứng viên trước, ban đầu chỉ kích hoạt các Tool dùng để nạp, rồi thêm các tên phù hợp mà không loại tên hiện tại.

## 3. Lập lịch theo lô tách thứ tự khỏi tính đồng thời

### Một thông điệp của assistant có thể yêu cầu nhiều thao tác

Mảng `content` của assistant có thể trộn văn bản với nhiều lời gọi. Thứ tự lời gọi vẫn theo thứ tự xuất hiện trong nguồn ngay cả khi các thao tác có thể chạy chồng lấp:

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

Lời gọi chỉ đọc thường hưởng lợi từ tính đồng thời. Thao tác thay đổi dữ liệu cần quy tắc sở hữu rõ hơn. Hai thao tác đọc-sửa-ghi có thể cùng đọc một phiên bản cũ rồi ghi đè lẫn nhau:

```text
edit call 1: read app.ts at version A -> compute version B -> write B
edit call 2: read app.ts at version A -> compute version C -> write C
final file: B or C, with one valid change lost
```

Bộ lập lịch không thể suy luận mọi xung đột chỉ từ tên Tool và các đối số JSON. Tool cơ sở dữ liệu, Tool triển khai hệ thống hoặc lời nhắc tương tác có thể dùng chung trạng thái mà Agent core không nhìn thấy.

### Thực thi song song có các giai đoạn trước và sau `Promise.all`

Pi tách bước kiểm tra trước, thao tác, bước chốt và bước phát transcript. `beforeToolCall` chạy trong bước kiểm tra trước theo thứ tự xuất hiện trong nguồn vì hàm xử lý chính sách có thể đọc hoặc cập nhật trạng thái dùng chung của ứng dụng. Các thao tác được phép sau đó mới chạy đồng thời. Mỗi kết quả vẫn qua `afterToolCall` trước sự kiện kết thúc. Các thông điệp kết quả cuối được phát theo thứ tự xuất hiện trong nguồn sau khi công việc đồng thời hoàn tất.

Kết quả tức thời có trình tự riêng. Nếu lời gọi 1 không tồn tại hoặc bị chặn trong bước kiểm tra trước của nhánh song song, `tool_execution_end` của nó được phát ngay, trước khi thao tác được phép ở lời gọi sau bắt đầu. Vòng lặp tiếp tục kiểm tra lời gọi sau trừ khi thấy yêu cầu hủy. Các `ToolResultMessage` cuối cùng vẫn được phát từ mảng kết quả đã chốt theo đúng thứ tự.

### Một Tool tuần tự khiến cả lô chạy tuần tự

Chế độ toàn cục `Agent.toolExecution` mặc định là `"parallel"`. Một Tool có thể đặt `executionMode: "sequential"`. Nếu chế độ toàn cục là tuần tự hoặc bất kỳ Tool đang hoạt động nào được gọi có cấu hình riêng đó, Pi chuyển cả lô qua bộ thực thi tuần tự. Đoạn trích sau lấy từ `packages/agent/src/agent-loop.ts` tại commit đã ghim:

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

Quy tắc bỏ phiếu thận trọng cho cả lô giúp Pi không phải tự dựng bộ phân tích xung đột. Dùng cấu hình riêng theo Tool cho tương tác, chuyển trạng thái toàn cục và thao tác có ý nghĩa phụ thuộc vào thứ tự giữa các lời gọi cùng lô. Dùng chế độ tuần tự toàn cục khi host không thể cho phép bất kỳ sự chồng lấp nào.

Bảy định nghĩa dựng sẵn của Coding Agent tại commit này đều không khai báo `executionMode`, vì vậy mặc định toàn cục cho phép chúng chạy chồng lấp. Các Tool `edit` và `write` dựng sẵn có thêm cơ chế bảo vệ chính xác hơn: `withFileMutationQueue()` tuần tự hóa toàn bộ khoảng thay đổi theo đường dẫn tệp chuẩn hóa nhưng vẫn cho phép các tệp khác chạy đồng thời. Tool tùy chỉnh có thay đổi tệp nên dùng cùng hàm hỗ trợ đã export với đường dẫn tuyệt đối của đích đã phân giải.

### Nhánh song song và nhánh tuần tự phát sự kiện theo hai trình tự

Chế độ tuần tự hoàn tất toàn bộ vòng đời của một lời gọi trước khi bắt đầu lời gọi kế tiếp. Nó phát thông điệp kết quả ngay sau sự kiện kết thúc của từng lời gọi. Nếu phát hiện yêu cầu hủy, bộ thực thi dừng mà không bắt đầu các lời gọi còn lại.

Chế độ song song trước hết phát từng sự kiện bắt đầu và chạy bước chuẩn bị theo thứ tự xuất hiện trong nguồn. Nó lưu các thao tác được phép thành hàm trì hoãn. Sau bước kiểm tra trước, `Promise.all` khởi chạy các hàm đó cùng nhau. Sự kiện kết thúc xuất hiện khi từng thao tác cùng hook sau hoàn tất; sự kiện của thông điệp kết quả chờ các kết quả có thứ tự từ `Promise.all`. Mã giả bám sát phần triển khai cho thấy rõ khác biệt:

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

Sự kiện tiến độ có thể xen kẽ giữa các lời gọi trong chế độ song song. Bên nhận phải đối chiếu bằng `toolCallId`, không dựa vào vị trí sự kiện đến. Thứ tự `ToolResultMessage` được lưu vẫn khớp với các lời gọi trong thông điệp của assistant, đúng với yêu cầu của adapter của provider khi dựng yêu cầu tiếp theo.

Điều kiện dừng cả lô được tính trên toàn bộ mảng kết quả đã chốt, không phụ thuộc vào lời gọi nào về trước. `shouldTerminateToolBatch()` chỉ trả `true` cho mảng không rỗng khi mọi `result.terminate` đều chính xác là `true`. Lời gọi bị chặn có thể tham gia qua `beforeToolCall`; lời gọi được phép có thể tham gia qua `execute` hoặc hook sau của core. Chỉ cần một kết quả không yêu cầu dừng, không hợp lệ, không tìm thấy Tool, bị hủy hoặc bình thường thì runtime vẫn thực hiện lượt model tiếp theo tự động.

## 4. Lỗi Tool trở thành thông điệp kết quả mà model nhìn thấy

### Sáu đường lỗi phổ biến cùng tạo một loại dữ liệu cho transcript

Tác giả Tool nên ném lỗi khi thực thi thất bại. Agent core bắt ngoại lệ tại ranh giới Tool, còn bước chuẩn bị và bước chốt có khối `catch` riêng. Transcript biểu diễn lỗi bằng `ToolResultMessage.isError: true` cùng nội dung văn bản. Sáu đường lỗi trong bản gốc vẫn tồn tại với chi tiết hiện tại:

| Điểm phát sinh lỗi        | Hành vi ở runtime                                                                                    | Dữ liệu cuối trong transcript                              |
| ------------------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Tên Tool không có trong danh sách hoạt động | Trả ngay `Tool <name> not found`; bỏ qua bước chuẩn bị, hook và thực thi.                   | `ToolResultMessage` lỗi                                    |
| `prepareArguments` ném lỗi | Khối `catch` của bước chuẩn bị chuyển `error.message` hoặc `String(error)`.                           | `ToolResultMessage` lỗi                                    |
| Xác thực schema thất bại  | Cùng khối `catch` đó mang theo báo cáo xác thực đã định dạng.                                         | `ToolResultMessage` lỗi                                    |
| `beforeToolCall` chặn     | Dùng `reason` hoặc nội dung chặn mặc định; sao chép gợi ý dừng nếu giá trị là `true`.                 | `ToolResultMessage` lỗi; `terminate` chỉ tồn tại ở runtime |
| `execute` ném lỗi         | Ngừng nhận cập nhật, chờ các lần phát cập nhật đã nhận, rồi tạo kết quả lỗi dạng văn bản.             | `ToolResultMessage` lỗi                                    |
| `afterToolCall` ném lỗi   | Thay kết quả thực thi bằng thông điệp của lỗi vừa ném và đặt cờ lỗi cuối.                             | `ToolResultMessage` lỗi                                    |

Yêu cầu hủy được phát hiện trong bước chuẩn bị tạo thêm một đường lỗi tức thời. Phản hồi của assistant dừng vì `length` khiến mọi lời gọi Tool thất bại mà không đi vào quy trình. Các cơ chế bảo vệ đó mở rộng bảng gốc nhưng không đổi ràng buộc lỗi-thành-kết-quả đối với lời gọi đã được chốt.

### Khối `catch` của bước thực thi dừng tiến độ trước khi mã hóa ngoại lệ

Đoạn trích có lược bớt sau lấy từ `executePreparedToolCall()` trong `packages/agent/src/agent-loop.ts` tại commit đã ghim. Nó bắt đầu sau các khai báo cục bộ của hàm bao quanh và giữ nguyên trạng thái cùng thứ tự hoàn tất:

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

Đoạn trích không độc lập vì các biến cục bộ `prepared`, `signal` và `emit` do hàm bao quanh cung cấp. Nó không thay đổi logic của mã nguồn: callback đóng khi promise của Tool kết thúc, các promise phát sự kiện đã nhận đều được chờ ở cả nhánh thành công lẫn thất bại, và ngoại lệ trở thành một giá trị `AgentToolResult`.

### Ngoại lệ và thông điệp hướng đến hai nơi nhận khác nhau

Ngoại lệ không được bắt sẽ đi lên ngăn xếp lời gọi JavaScript. `ToolResultMessage` được gửi cho model trong yêu cầu tiếp theo. Pi đổi nơi nhận tại ranh giới runtime:

```text
inside Tool
  throw Error("ENOENT: src/config.ts")
    -> executePreparedToolCall catches it
    -> AgentToolResult { content: [text], details: {} }
    -> finalized isError: true
    -> ToolResultMessage linked to the original call
    -> provider adapter serializes the result for the next model turn
```

Runtime vẫn báo `isError` cho UI và bên nhận sự kiện. Mã hóa lỗi thành thông điệp không làm cho lời gọi trông như đã thành công. Cách làm này giữ đúng cặp lời gọi của assistant với kết quả và đưa cho model bằng chứng cần thiết để sửa hành động kế tiếp.

### Lỗi mà model nhìn thấy hỗ trợ nhiều cách khắc phục

Host không thể chọn một quy tắc khắc phục đúng cho mọi Tool. Hội thoại chứa ý định và các quan sát trước đó để model sử dụng:

| Kết quả model nhìn thấy                                    | Hành động tiếp theo có cơ sở                                                                                      |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `read` báo `src/a.ts` không tồn tại                        | Liệt kê hoặc tìm trong thư mục, chọn tên tệp tìm được rồi đọc.                                                    |
| `edit` báo `oldText` không duy nhất                        | Đọc tệp hiện tại, thu hẹp mẫu khớp rồi gửi một yêu cầu sửa đã điều chỉnh.                                         |
| `bash` báo thiếu package trong lúc build                   | Kiểm tra manifest và lockfile, sau đó xin quyền hoặc cài đặt theo chính sách của host.                            |
| Hook trước báo lệnh phá hủy đã bị chặn                     | Chọn lệnh có phạm vi hẹp hoặc giải thích vì sao chính sách không cho phép thao tác được yêu cầu.                  |

Framework biết lời gọi đã thất bại. Nó không biết đường dẫn là lỗi gõ, giả định đã cũ hay một tệp mới có chủ ý. Bằng chứng cụ thể giúp model lập kế hoạch từ trạng thái thật trong khi vòng lặp vẫn giữ cấu trúc hợp lệ.

### Thông báo lỗi cụ thể giúp model tự sửa tốt hơn

`Operation failed` không cho model biết biến nào cần đổi. Tool `read` dựng sẵn ném lỗi kèm vị trí được yêu cầu và tổng số dòng; `edit` ghi đường dẫn cùng mã lỗi truy cập bên dưới; `bash` giữ đầu ra đã thu thập trước khi thêm trạng thái hủy, hết thời gian hoặc mã thoát.

```text
weak:     Read failed
specific: Offset 200 is beyond end of file (100 lines total)

weak:     Command failed
specific: <captured output> followed by Command exited with code 2
```

Thông báo cụ thể cũng cải thiện UI, log và quá trình con người rà soát. Không đưa bí mật, toàn bộ thông tin xác thực hoặc đầu ra không giới hạn vào lỗi chỉ để tăng chi tiết. Lỗi hữu ích nên ghi thao tác đã thất bại, định danh an toàn có liên quan, ràng buộc quan sát được và cách sửa mà bên gọi có thể thử.

### Tool dựng sẵn xử lý lỗi đã biết trước khi dùng cơ chế dự phòng của framework

Tool dựng sẵn nhận diện những lỗi mà chúng có thể giải thích. `read` kiểm tra vị trí nằm ngoài phạm vi trước khi cắt dữ liệu. `edit` bọc lỗi truy cập bằng đường dẫn được yêu cầu cùng mã lỗi. `bash` tích lũy đầu ra có giới hạn rồi gắn trạng thái tiến trình. Đoạn trích dưới đây từ `packages/coding-agent/src/core/tools/bash.ts` tại commit đã ghim cho thấy khối `catch` bên trong cùng cách xử lý mã thoát hiện tại; các biến cục bộ được khai báo trong `execute` bao quanh:

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

Trường hợp đã nhận diện được bổ sung ngữ cảnh do Tool sở hữu. Ngoại lệ không nhận diện được sẽ được ném lại nguyên trạng. `executePreparedToolCall()` cung cấp lớp thứ hai: nó đưa `error.message`, hoặc `String(error)` khi giá trị bị ném không phải `Error`, vào `createErrorToolResult()`. Cơ chế dự phòng không viết lại mọi lỗi thành cùng một câu mơ hồ.

### Tool tùy chỉnh nên giữ ranh giới trách nhiệm đó

Tool tùy chỉnh nên kiểm tra quy tắc miền sau bước xác thực schema, tôn trọng `signal`, giới hạn đầu ra và chỉ bọc lỗi mà nó hiểu. Extension hoàn chỉnh trong Mục 1 tuân theo quy tắc này: `ENOENT` trở thành `File does not exist: <path>`, còn lỗi đọc không biết trước được ném lại.

Tool thay đổi dữ liệu cần thêm một quy tắc thực hành. Dùng schema hẹp và phân giải đường dẫn dưới thư mục gốc đã định, sau đó đặt toàn bộ khoảng đọc-sửa-ghi trong `withFileMutationQueue(absolutePath, fn)`. `executionMode: "sequential"` bảo vệ cả lô nhưng làm mất khả năng chạy đồng thời an toàn giữa các tệp không liên quan; hàng đợi dùng chung theo từng tệp bảo vệ đúng tài nguyên và phối hợp với `edit` cùng `write` dựng sẵn.

Chính sách bảo mật vẫn nằm ngoài phần mô tả Tool dành cho model. Dùng `beforeToolCall` hoặc Extension `tool_call` để yêu cầu mức tin cậy, xác nhận, danh sách cho phép hoặc giới hạn môi trường. Tool vẫn phải tự thực thi các bất biến của nó vì một host khác có thể không cài hook. Hãy che cả nội dung cuối lẫn chi tiết tiến độ: `onUpdate` đến UI và bên đăng ký nhận sự kiện trước khi hook sau có thể thay kết quả cuối.

### Ràng buộc lỗi kết thúc tại lời gọi Tool đã được chốt

Với lời gọi đã được chốt, lỗi Tool trở thành kết quả lỗi và không thoát ra dưới dạng ngoại lệ thô của Tool. Ràng buộc này có giới hạn: bên đăng ký nhận sự kiện Extension và callback của provider có chính sách lỗi riêng. Tool bỏ qua `AbortSignal` có thể tiếp tục công việc bên ngoài sau khi người dùng hủy. Tiến trình bị sập không thể được chuyển đổi bởi khối `catch` trong chính tiến trình đó. Lô tuần tự dừng vì yêu cầu hủy có thể để các lời gọi phía sau chưa bắt đầu thay vì tạo kết quả tổng hợp cho chúng.

Trong luồng Agent Loop thông thường, mỗi lời gọi đã được chuẩn bị và thực thi vẫn đạt một trạng thái kết thúc có thể quan sát. Model nhận nội dung lỗi cuối khi vòng lặp tiếp tục, còn host nhận các sự kiện có thứ tự ngay cả khi thao tác thất bại.

## 5. Các interface Operations tách logic Tool khỏi quyền truy cập hệ thống

### Gọi thẳng API hệ thống khiến Tool phụ thuộc vào một môi trường

Cách triển khai đọc ngắn nhất gọi trực tiếp hệ thống tệp cục bộ:

```typescript
const content = await readFile(absolutePath, "utf8");
```

Lựa chọn này hợp lệ với ứng dụng nhỏ, nhưng nó gắn việc kiểm tra đường dẫn, truy cập byte, kiểm thử và môi trường thực thi với hệ thống tệp cục bộ của Node. Workspace từ xa, kiểm thử trong bộ nhớ, bộ môi giới sandbox hoặc proxy hệ thống tệp có kiểm toán sẽ buộc phải sửa logic quyết định bên trong Tool.

Thay vào đó, Tool dựng sẵn của Coding Agent nhận một đối tượng `operations` nhỏ khi được tạo. Mặc định thông thường vẫn dùng hệ thống tệp cục bộ, tiến trình, ripgrep hoặc fd. Kiểm thử và host khác có thể cung cấp các thao tác mà Tool cần mà không thay cách xử lý đối số, cắt dữ liệu, báo tiến độ, hiển thị hay định dạng kết quả.

### Mỗi Tool dùng một interface tối thiểu được truyền vào

`ReadOperations` là ràng buộc công khai tiêu biểu. Đoạn mã nguồn hoàn chỉnh dưới đây lấy từ `packages/coding-agent/src/core/tools/read.ts` tại commit đã ghim:

```typescript
export interface ReadOperations {
  readFile: (absolutePath: string) => Promise<Buffer>;
  access: (absolutePath: string) => Promise<void>;
  detectImageMimeType?: (
    absolutePath: string,
  ) => Promise<string | null | undefined>;
}
```

`createReadToolDefinition(cwd, options)` chọn `options?.operations ?? defaultReadOperations` một lần. `ToolDefinition` trả về giữ giá trị đó trong closure. Khi thực thi, Tool phân giải đường dẫn được yêu cầu, gọi `ops.access`, gọi `ops.detectImageMimeType` nếu có, đọc qua `ops.readFile`, rồi áp dụng cùng cách xử lý hình ảnh, chọn dòng, cắt dữ liệu, dựng nội dung và tạo metadata hiển thị bất kể backend.

Mã giả kiến trúc cho thấy điểm thay thế backend:

```text
Tool policy and formatting
  -> ops.access(absolutePath)
  -> ops.detectImageMimeType(absolutePath) when provided
  -> ops.readFile(absolutePath)

default operations -> local Node filesystem
test operations    -> in-memory buffers
remote operations  -> authenticated workspace service
```

Ví dụ có thể sao chép sau tạo một `ToolDefinition` Read dựng sẵn thật với một `Map` trong bộ nhớ làm backend. Mã cung cấp đúng ràng buộc Operations bất đồng bộ và không cần tệp tạm:

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

Backend SSH hoặc container có thể triển khai cùng interface, nhưng phải giữ ràng buộc: đường dẫn tuyệt đối, từ chối truy cập đích không đọc được, byte thô từ `readFile`, cơ chế hủy trong transport riêng nếu được hỗ trợ, thời gian thực thi có giới hạn và cách xử lý thông tin xác thực an toàn. Chỉ riêng interface không tạo ra sandbox.

### Bash và PowerShell là các phiên shell-tool riêng biệt

Pi `0.84.3` đã publish cung cấp `powershell` như một built-in tùy chọn cho command Windows native. Đây là Tool riêng với `bash`: `bash` resolve shell tương thích Bash và dùng prompt `bash`, còn `powershell` ưu tiên resolve `pwsh.exe`, sau đó đến `powershell.exe`, khởi động bằng các flag non-interactive và dùng prompt `PS>`. Chọn Tool này không viết lại command cho Tool kia và cũng không đổi shell đã khởi chạy Pi.

Hai Tool chia sẻ metadata của Pi session hiện tại, chứ không được bảo đảm chia sẻ một child-shell process persistent. Các operations Bash và PowerShell cục bộ mặc định khởi động một child process riêng cho mỗi Tool call. Custom operations thay vào đó ủy quyền cho backend đã cấu hình và không nhất thiết tạo local child process; backend đó quyết định persistence semantics. Trước khi một trong hai loại backend chạy, Tool wrapper resolve các giá trị mới nhất của `PI_SESSION_ID`, `PI_SESSION_FILE`, `PI_PROVIDER`, `PI_MODEL` và `PI_REASONING_LEVEL`, rồi truyền chúng trong execution environment. Với operations cục bộ mặc định, thay đổi trên filesystem tồn tại qua nhiều call, còn shell-local variable, function và thay đổi working directory thì không, trừ khi command persist chúng ở nơi khác.

`powershell` có thể được chọn qua `defaultTools`, lựa chọn tool của CLI/SDK hoặc public factory. Nó **không** thuộc tập `defaultTools` mặc định trong Pi `0.84.3`: bỏ setting này chỉ bật `read`, `bash`, `edit` và `write`. Vì vậy cấu hình Windows phải chọn `powershell` tường minh khi model cần dùng PowerShell native thay cho, hoặc cùng với, Bash.

`createPowerShellTool()` nhận một object `PowerShellToolOptions` tùy chọn. Các option công khai là `operations`, `exposeSessionEnvironment` và `spawnHook`; `commandPrefix` cùng `shellPath` chỉ dành cho Bash, không phải PowerShell option. Factory và type `PowerShellOperations` được export từ package root:

```typescript
import {
  createPowerShellTool,
  type PowerShellOperations,
} from "@earendil-works/pi-coding-agent";

const operations: PowerShellOperations = {
  async exec(command, cwd, { onData, signal, timeout, env }) {
    void [cwd, timeout, env];
    if (signal?.aborted) return { exitCode: null };
    onData(Buffer.from(`[compile-only] ${command}`));
    return { exitCode: 0 };
  },
};

export const powerShellTool = createPowerShellTool("C:\\workspace", {
  operations,
  exposeSessionEnvironment: false,
  spawnHook: (context) => ({
    ...context,
    env: { ...context.env, CI: "1" },
  }),
});
```

Ví dụ này là backend không tạo process nhưng vẫn được kiểm tra type: nó minh họa customization mà không giả làm executor production. Ràng buộc operations chính xác được chia sẻ với Bash vì `PowerShellOperations` là public alias của `BashOperations`:

```typescript
interface PowerShellOperations {
  exec: (
    command: string,
    cwd: string,
    options: {
      onData: (data: Buffer) => void;
      signal?: AbortSignal;
      timeout?: number;
      env?: NodeJS.ProcessEnv;
    },
  ) => Promise<{ exitCode: number | null }>;
}
```

Shell Tool wrapper tích lũy byte được stream, giới hạn output mà model nhìn thấy theo `DEFAULT_MAX_LINES` hoặc `DEFAULT_MAX_BYTES`, đồng thời lưu toàn bộ output đã bị cắt vào file tạm. Custom operations backend vẫn phải tuân theo `signal` và `timeout`, dừng toàn bộ remote hoặc local process tree, ngừng gọi `onData` sau khi settle, đồng thời giải phóng child handle, transport, timer và abort listener trong `finally`. Giá trị `{ exitCode: null }` biểu diễn command đã bị kill; exit code khác 0 trở thành command failure mà model nhìn thấy. Cơ chế truncation của wrapper bảo vệ context, không thay cho resource limit hay cleanup trong backend.

### Tám Tool dựng sẵn chỉ khai báo thao tác mà chúng dùng

Các interface công khai hiện tại vẫn tách theo từng Tool thay vì tạo một hệ điều hành ảo lớn:

| Tool  | Interface Operations | Phương thức bắt buộc và cấu trúc trả về chính xác                                                                               |
| ----- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Read  | `ReadOperations`     | `readFile(): Promise<Buffer>`, `access(): Promise<void>`, và `detectImageMimeType()` bất đồng bộ, tùy chọn                       |
| Write | `WriteOperations`    | `writeFile(absolutePath, content)` và `mkdir(dir)` bất đồng bộ                                                                   |
| Edit  | `EditOperations`     | `readFile(): Buffer`, `writeFile(absolutePath, content)` và `access()` bất đồng bộ                                                |
| Bash  | `BashOperations`     | `exec(command, cwd, { onData, signal, timeout, env }): Promise<{ exitCode: number \| null }>`                                     |
| PowerShell | `PowerShellOperations` | Cùng ràng buộc `exec` dạng stream với `BashOperations`; backend mặc định resolve PowerShell native trên Windows           |
| Grep  | `GrepOperations`     | `isDirectory(absolutePath)` và `readFile(absolutePath): string`, đồng bộ hoặc bất đồng bộ                                        |
| Find  | `FindOperations`     | `exists(absolutePath)` và `glob(pattern, cwd, { ignore, limit }): string[]`, đồng bộ hoặc bất đồng bộ                            |
| Ls    | `LsOperations`       | `exists`, `stat` có `isDirectory()`, và `readdir(): string[]`, đồng bộ hoặc bất đồng bộ                                          |

Read không thể ghi. Write không cần liệt kê thư mục. Grep và Find giữ đầu vào riêng cho thao tác tìm kiếm. Bash sở hữu byte truyền theo luồng, môi trường, thời gian chờ, `signal` và mã thoát. Interface nhỏ giúp bản giả lập trong kiểm thử ngắn gọn và ngăn Tool âm thầm dùng thao tác mà ràng buộc chưa từng khai báo.

Operations và cơ chế lập lịch của Agent giải quyết hai vấn đề khác nhau. Đối tượng Operations chọn cách một thao tác tiếp cận tài nguyên. `executionMode` cùng `withFileMutationQueue()` quyết định nhiều thao tác chồng lấp ra sao. `beforeToolCall` quyết định thao tác có được phép hay không. Tách các lựa chọn này giúp kiểm thử từng phần độc lập.

## 6. Bài học thiết kế từ hệ thống Tool

Toàn bộ đường dẫn cho thấy bốn quyết định có thể dùng lại.

1. Mở rộng kiểu tại lớp sở hữu khả năng mới. Khai báo của provider, bước thực thi của Agent và phần hiển thị của sản phẩm có giới hạn phụ thuộc khác nhau. Một adapter nhỏ có thể nối chúng mà không buộc lớp dưới import lớp trên.
2. Tách tương thích, xác thực, chính sách, thao tác và chuyển đổi kết quả. `prepareArguments` xử lý cấu trúc đã biết, bước xác thực thiết lập ràng buộc tham số ở runtime, hook trước áp dụng chính sách của host, `execute` sở hữu thao tác, còn hook sau vá kết quả.
3. Giữ lỗi dưới dạng thông tin có kiểu. Tác giả Tool ném lỗi cụ thể; Agent core chuyển lỗi thành kết quả liên kết với lời gọi. Model có thể thử lại, đổi đầu vào hoặc giải thích ranh giới chính sách mà không làm hỏng transcript.
4. Quy định rõ tính đồng thời và quyền truy cập tài nguyên. Cơ chế lập lịch theo lô quy định thứ tự sự kiện và transcript. Chế độ thực thi theo từng Tool xử lý xung đột ở mức thô. Interface Operations tối thiểu và hàng đợi theo từng tài nguyên xử lý ranh giới hệ thống thật.

Các quyết định này cũng chỉ ra nơi cần rà soát. Schema và mã chuẩn bị thuộc phạm vi bảo mật đầu vào. `beforeToolCall` là chính sách cấp quyền. `execute` là ranh giới của tác dụng phụ và hành vi hủy. Sự kiện tiến độ là ranh giới quan sát có thể làm lộ dữ liệu. `afterToolCall` là điểm che dữ liệu cuối đối với nội dung model nhìn thấy. `ToolResultMessage` là dữ liệu giao thức bền vững được giao cho lời gọi tiếp theo đến provider.

## 7. Kết thúc: theo dõi một lời gọi từ đầu đến cuối

Lời gọi `read` ở đầu chương giờ đã có luồng hoàn chỉnh. Đây là mã giả kiến trúc gắn với phần triển khai hiện tại:

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

Việc thực thi Tool là một giao thức có kiểm soát bao quanh thao tác. Schema giới hạn ngôn ngữ đối số, bước chuẩn bị giữ cho lời gọi cũ còn dùng được, hook thực thi chính sách của sản phẩm, `signal` truyền yêu cầu hủy, tiến độ giúp quan sát công việc chạy lâu, cơ chế lập lịch bảo vệ thứ tự, còn thông điệp kết quả giữ lại lỗi để model xử lý.

Chương 6 sẽ theo dõi các thông điệp đó qua transcript Agent giàu thông tin hơn và ranh giới chuyển đổi của provider. Chương tiếp theo cũng giải thích vì sao `details` của Tool có thể phục vụ UI trong khi chỉ nội dung văn bản và hình ảnh đi vào kết quả thông thường dành cho model.

Việc rà soát mã nguồn cho chương này dùng Pi `0.84.3` tại commit `4e58f324fae8ebfa98a3d45181fb248072a2afac`. Các đường dẫn chính gồm `packages/ai/src/types.ts`, `packages/ai/src/utils/validation.ts`, `packages/agent/src/types.ts`, `packages/agent/src/agent-loop.ts`, `packages/agent/src/agent.ts`, `packages/coding-agent/src/core/extensions/types.ts`, `packages/coding-agent/src/core/extensions/runner.ts`, `packages/coding-agent/src/core/extensions/wrapper.ts`, `packages/coding-agent/src/core/extensions/loader.ts`, `packages/coding-agent/src/core/agent-session.ts` và các phần triển khai Tool trong `packages/coding-agent/src/core/tools/`.

[Chương 6: Hệ thống thông điệp](ch06-messages.md)
