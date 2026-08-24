---
title: 'Chương 5: Hệ thống Tool'
description: Tool schema, runtime execution, hook, progress event, lỗi và parallel batch trong Pi.
translation_key: ch05-tool-system
language: vi
chapter: 5
source_url: 'https://www.dgzhuya.com/modules/ch05-tool-system'
official_refs:
  - 'https://github.com/badlogic/pi-mono/blob/main/packages/agent/README.md#tools'
terms_used:
  - Tool
  - ToolCall
  - ToolResultMessage
  - AgentTool
status: reviewed
last_updated: '2026-08-24'
translator: Pify maintainers
reviewed_by: Pify maintainers
---
Tool là capability có kiểu mà model có thể yêu cầu. Pi tách định nghĩa Tool gửi cho model khỏi runtime implementation chịu trách nhiệm validate arguments, thực hiện effect, báo tiến độ và trả content.

## 1. Định nghĩa Tool và runtime implementation

Ở model layer, `Tool<TParameters>` có ba field:

- `name`: protocol identifier dùng trong `ToolCall.name`;
- `description`: giải thích cho model khi nào nên dùng Tool;
- `parameters`: TypeBox schema cho arguments.

Agent core mở rộng shape đó bằng `AgentTool`:

```typescript
interface AgentTool<TParameters extends TSchema, TDetails>
  extends Tool<TParameters> {
  label: string;
  prepareArguments?: (args: unknown) => Static<TParameters>;
  execute: (
    toolCallId: string,
    params: Static<TParameters>,
    signal?: AbortSignal,
    onUpdate?: AgentToolUpdateCallback<TDetails>,
  ) => Promise<AgentToolResult<TDetails>>;
  executionMode?: "parallel" | "sequential";
}
```

`label`, `execute`, progress detail và execution mode là runtime concern. Chúng không được gửi cho model như một phần của Tool schema.

## 2. Định nghĩa một Tool

Ví dụ sau đọc một file UTF-8 rồi báo đường dẫn và kích thước cho UI:

```typescript
import { Type } from "@earendil-works/pi-ai";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { readFile } from "node:fs/promises";

const readTextFile: AgentTool = {
  name: "read_text_file",
  label: "Read text file",
  description: "Read a UTF-8 text file from the current project",
  parameters: Type.Object({
    path: Type.String({ description: "Project-relative file path" }),
  }),
  executionMode: "parallel",
  execute: async (_toolCallId, params, signal, onUpdate) => {
    if (signal?.aborted) throw new Error("Tool execution aborted");

    onUpdate?.({
      content: [{ type: "text", text: `Reading ${params.path}` }],
      details: { path: params.path, phase: "reading" },
    });

    const text = await readFile(params.path, "utf8");
    return {
      content: [{ type: "text", text }],
      details: { path: params.path, bytes: Buffer.byteLength(text) },
    };
  },
};
```

Mảng `content` được gửi cho model. `details` là application metadata dành cho log hoặc UI và không nằm trong LLM transcript thông thường.

## 3. Execution pipeline

Mỗi `ToolCall` đi qua cùng các stage:

1. Phát `tool_execution_start`.
2. Tìm `AgentTool` theo `ToolCall.name`.
3. Áp dụng `prepareArguments` nếu có.
4. Validate effective arguments bằng TypeBox schema.
5. Chạy `beforeToolCall`; hook này có thể cho phép hoặc chặn execution.
6. Gọi `execute()` và chuyển progress thành `tool_execution_update`.
7. Chạy `afterToolCall` rồi phát `tool_execution_end`.
8. Thêm `ToolResultMessage` được liên kết bằng `toolCallId`.

Tool không tồn tại, arguments không hợp lệ, call bị chặn và exception đều vẫn tạo Tool result. Nhờ đó transcript luôn hợp lệ: mọi call đều có result để model xử lý.

## 4. Tương thích arguments

`prepareArguments` là compatibility shim cho raw model output trước schema validation. Chỉ dùng nó cho phép chuẩn hóa xác định được, chẳng hạn đổi legacy field name sang field hiện tại.

Không dùng hook này để bỏ qua validation hoặc thực hiện external effect. Object trả về phải thỏa schema đã khai báo.

## 5. Hook

`beforeToolCall` chạy sau argument validation và có thể áp dụng application policy:

```typescript
agent.beforeToolCall = async ({ toolCall, args }) => {
  if (toolCall.name === "bash" && String(args.command).includes("rm -rf")) {
    return { block: true, reason: "Destructive command blocked" };
  }
};
```

`afterToolCall` chạy sau execution và có thể thay content, details, error state, usage, tên Tool mới được thêm hoặc termination hint. Dùng hook này cho redaction, audit metadata và chuẩn hóa result.

Hook là policy boundary. Tool implementation vẫn phải validate domain assumption và tôn trọng `AbortSignal`.

## 6. Lỗi

Hãy throw `Error` khi execution thất bại. Agent core bắt exception rồi tạo `ToolResultMessage` có `isError: true`.

Không trả content thành công nhưng chỉ ghi rằng operation đã lỗi. Cách đó che failure khỏi runtime và làm UI, retry cùng audit behavior thiếu tin cậy.

## 7. Parallel batch và sequential batch

Agent core mặc định chạy tool call song song. Đặt `toolExecution: "sequential"` trên agent để tuần tự hóa mọi call, hoặc đặt `executionMode: "sequential"` trên một `AgentTool` khi Tool đó không thể chạy đồng thời an toàn.

Nếu bất kỳ Tool nào trong batch yêu cầu sequential execution, Pi chạy tuần tự toàn bộ batch. Trong parallel mode:

- các call có thể hoàn tất theo thứ tự bất kỳ;
- completion event được phát khi từng call hoàn tất;
- record `ToolResultMessage` được lưu theo source order trong assistant message.

Chọn sequential mode cho shared mutable resource, interactive prompt hoặc operation mà thứ tự làm thay đổi ý nghĩa.

## 8. Kết thúc sớm

`execute()`, `beforeToolCall` đã block hoặc `afterToolCall` có thể trả `terminate: true`. Hint này yêu cầu vòng lặp bỏ qua model call tự động sau batch.

Termination chỉ có hiệu lực khi mọi result đã hoàn tất trong batch đều đặt hint. Mixed batch vẫn tiếp tục để model xử lý tất cả result.

## 9. Quy tắc bảo mật

Tool là boundary từ model output sang application effect. Hãy xem input tại đây là không đáng tin cậy:

1. Giữ schema hẹp và từ chối shape không xác định.
2. Resolve path bên trong approved root trước khi truy cập file.
3. Tách capability chỉ đọc khỏi capability có thể mutate.
4. Áp dụng timeout, output limit và cancellation.
5. Redact secret trước khi trả content hoặc ghi log.
6. Ghi đủ metadata để audit effect nhưng không lưu credential.

Quyết định gọi Tool của model không phải là authorization. Authorization thuộc application policy.

## 10. Result contract

`ToolResultMessage` giữ `toolCallId`, `toolName`, content, details và usage tùy chọn, `isError` cùng timestamp. Provider adapter chuyển normalized result này thành wire format mà model call tiếp theo yêu cầu.

[Chương 6](ch06-messages.md) mô tả các message type mang tool call và result qua model layer và agent layer.
