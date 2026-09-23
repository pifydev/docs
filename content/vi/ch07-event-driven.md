---
title: 'Chương 7: Hệ thống chạy theo sự kiện'
description: Vòng đời Agent, điểm chờ khi báo sự kiện cho bên đăng ký, tiến độ Tool, sự kiện cấp sản phẩm, hook Extension và tích hợp UI.
translation_key: ch07-event-driven
language: vi
chapter: 7
source_url: 'https://www.dgzhuya.com/modules/ch07-event-driven'
official_refs:
  - 'https://github.com/earendil-works/pi/blob/f07218c4d4bbc12bef056a7058c3dd49dfe41abe/packages/agent/README.md#event-flow'
  - 'https://github.com/earendil-works/pi/blob/f07218c4d4bbc12bef056a7058c3dd49dfe41abe/packages/coding-agent/docs/extensions.md#events'
  - 'https://github.com/earendil-works/pi/blob/f07218c4d4bbc12bef056a7058c3dd49dfe41abe/packages/coding-agent/src/core/extensions/runner.ts'
terms_used:
  - Event
  - Agent
  - Tool
  - Stream
status: reviewed
last_updated: '2026-09-23'
translator: Pify maintainers
reviewed_by: Pify maintainers
---
Sáu chương đầu đã lần theo dữ liệu qua model, vòng lặp Agent, Tool và các ranh giới của message. Sự kiện xuất hiện ở mọi bước, nhưng còn ba câu hỏi: thay đổi trạng thái được chuyển tới mã bên ngoài ra sao, thành phần nào nhận thay đổi đó, và khi nào Agent phải chờ thành phần nhận xử lý xong?

Chương này trả lời các câu hỏi đó qua ba lớp API của Pi 0.85.0:

- `AgentEvent` trong `@earendil-works/pi-agent-core` mô tả một lượt chạy ở cấp thấp;
- `AgentSessionEvent` trong `@earendil-works/pi-coding-agent` bổ sung trạng thái cấp sản phẩm như retry và compaction;
- sự kiện Extension cho phép quan sát và cung cấp hook riêng để chặn hoặc tiền xử lý dữ liệu.

Chương 1–6 giải thích cách hệ thống vận hành. Chương 7 mở đầu phần kỹ thuật nâng cao, đi sâu vào thời điểm công việc được xem là hoàn tất, thay đổi tại chỗ và ranh giới xử lý lỗi mà UI ở môi trường vận hành phải nắm rõ.

## 1. Vì sao cần hệ thống sự kiện

### Trực giác từ việc theo dõi đơn giao hàng

Ứng dụng giao hàng không bắt khách liên tục hỏi nhà hàng, tài xế và dịch vụ thanh toán. Ứng dụng phát các thay đổi trạng thái: nhà hàng đã nhận đơn, tài xế đã lấy hàng và đơn đã được giao. Mỗi bên nhận chỉ phản ứng với thay đổi mà mình cần.

Một lượt chạy của Agent cũng có dạng đó. Provider trả phản hồi theo luồng, nhiều lời gọi Tool có thể chạy, và một prompt có thể kéo dài qua nhiều turn. Nếu chỉ trả về chuỗi cuối cùng, UI không thể hiện văn bản đang tạo, Tool đang chờ, lỗi hoặc lần retry. Sự kiện phát các thay đổi này khi lượt chạy còn hoạt động. Đây là giao thức trực tiếp khi hệ thống vận hành, không phải định dạng session để lưu bền vững.

### Thêm bên nhận mà không sửa lõi Agent

Giả sử ứng dụng cần ghi một dòng kiểm toán cho mỗi Tool. Nếu chèn mã quanh mọi lời gọi `tool.execute()` trong Agent, tính năng này sẽ phụ thuộc vào chi tiết thực thi và dễ xung đột khi Pi thay đổi. Bên đăng ký nhận sự kiện có thể nằm hoàn toàn ngoài đoạn mã đó:

```typescript
import type { Agent } from "@earendil-works/pi-agent-core";

export function logToolResults(agent: Agent): () => void {
  return agent.subscribe((event) => {
    if (event.type === "tool_execution_end") {
      const status = event.isError ? "failed" : "succeeded";
      console.log(`[tool] ${event.toolName}: ${status}`);
    }
  });
}
```

Hàm trả về sẽ gỡ listener vừa đăng ký. Hãy giữ hàm đó và gọi khi giao diện, yêu cầu hoặc tích hợp kết thúc.

### So sánh pub/sub với lời gọi trực tiếp

Cách gọi trực tiếp buộc bên phát phải biết mọi bên nhận. Với pub/sub, hợp đồng sự kiện trở thành phần phụ thuộc chung:

```text
lời gọi trực tiếp
Agent ──> bộ hiển thị terminal
      ├─> bộ lưu bền vững
      └─> bộ xuất telemetry

phát/đăng ký
Agent ──> AgentEvent ──> bộ hiển thị terminal
                     ├─> bộ lưu bền vững
                     ├─> bộ xuất telemetry
                     └─> bên nhận thêm sau này mà Agent không cần biết
```

Bên trong, Pi vẫn gọi listener. Sự tách rời nằm ở quyền sở hữu: lõi Agent sở hữu kiểu sự kiện và vòng lặp phân phối, còn ứng dụng sở hữu tập listener. Thêm một bên quan sát không khiến package lõi phụ thuộc vào terminal, cơ sở dữ liệu hay hệ thống phân tích.

## 2. Giao thức sự kiện và ranh giới package

### Mười discriminant của `AgentEvent`

`AgentEvent` có mười giá trị `type`. Vòng đời Agent và turn chỉ có cặp `start`/`end`; vòng đời message và thực thi Tool có thêm `update`.

| Nhóm | Discriminant | Payload ngoài trường `type` |
| --- | --- | --- |
| Lượt chạy | `agent_start` | không có |
| Lượt chạy | `agent_end` | `messages: AgentMessage[]` |
| Turn | `turn_start` | không có |
| Turn | `turn_end` | `message: AgentMessage`, `toolResults: ToolResultMessage[]` |
| Message | `message_start` | `message: AgentMessage` |
| Message | `message_update` | `message: AgentMessage`, `assistantMessageEvent: AssistantMessageEvent` |
| Message | `message_end` | `message: AgentMessage` |
| Tool | `tool_execution_start` | `toolCallId`, `toolName`, `args` |
| Tool | `tool_execution_update` | `toolCallId`, `toolName`, `args`, `partialResult` |
| Tool | `tool_execution_end` | `toolCallId`, `toolName`, `result`, `isError` |

Đoạn dưới đây bám sát mã nguồn [`packages/agent/src/types.ts`](https://github.com/earendil-works/pi/blob/107d79f11072bbc8a3a757ed7fd69596bee7d68c/packages/agent/src/types.ts). Đoạn trích chỉ dàn lại thành nhiều dòng, không lược bỏ trường nào:

```typescript
export type AgentEvent =
  | { type: "agent_start" }
  | { type: "agent_end"; messages: AgentMessage[] }
  | { type: "turn_start" }
  | {
      type: "turn_end";
      message: AgentMessage;
      toolResults: ToolResultMessage[];
    }
  | { type: "message_start"; message: AgentMessage }
  | {
      type: "message_update";
      message: AgentMessage;
      assistantMessageEvent: AssistantMessageEvent;
    }
  | { type: "message_end"; message: AgentMessage }
  | {
      type: "tool_execution_start";
      toolCallId: string;
      toolName: string;
      args: any;
    }
  | {
      type: "tool_execution_update";
      toolCallId: string;
      toolName: string;
      args: any;
      partialResult: any;
    }
  | {
      type: "tool_execution_end";
      toolCallId: string;
      toolName: string;
      result: any;
      isError: boolean;
    };
```

Một turn gồm phản hồi của assistant cùng các lời gọi Tool và kết quả do phản hồi đó tạo ra. Một lượt chạy có thể gồm nhiều turn khi Tool, steering message hoặc follow-up message khiến vòng lặp tiếp tục. Ví dụ dưới đây là một lượt chạy có một message người dùng trong prompt, một lời gọi Tool, rồi một lần gọi model cuối:

```text
agent_start
├─ turn_start
│  ├─ message_start                 message người dùng trong prompt
│  ├─ message_end                   message người dùng trong prompt
│  ├─ message_start                 phản hồi của assistant
│  ├─ message_update*               phản hồi assistant truyền theo luồng
│  ├─ message_end                   phản hồi của assistant
│  ├─ tool_execution_start          Tool được yêu cầu
│  ├─ tool_execution_update*        tiến độ của Tool được yêu cầu
│  ├─ tool_execution_end            Tool được yêu cầu
│  ├─ message_start                 ToolResultMessage
│  ├─ message_end                   ToolResultMessage
│  └─ turn_end
├─ turn_start                       lần gọi model tiếp theo
│  ├─ message_start                 phản hồi của assistant
│  ├─ message_update*               phản hồi assistant truyền theo luồng
│  ├─ message_end                   phản hồi của assistant
│  └─ turn_end
└─ agent_end
```

Mỗi message người dùng có trong prompt hoặc được chèn vào đều có `message_start` và `message_end` riêng. Chỉ message của assistant được truyền theo luồng mới có `message_update`. Phần 7 sẽ trình bày chi tiết thứ tự Tool khi có nhiều lời gọi tuần tự hoặc song song.

### `AssistantMessageEvent` lồng bên trong

`message_update` giữ lại sự kiện Pi AI làm phát sinh lần cập nhật. Các discriminant chính xác từ `@earendil-works/pi-ai` gồm:

| Giai đoạn | Sự kiện và payload |
| --- | --- |
| Luồng | `start { partial }` |
| Văn bản | `text_start { contentIndex, partial }`, `text_delta { contentIndex, delta, partial }`, `text_end { contentIndex, content, partial }` |
| Suy luận | `thinking_start { contentIndex, partial }`, `thinking_delta { contentIndex, delta, partial }`, `thinking_end { contentIndex, content, partial }` |
| Lời gọi Tool | `toolcall_start { contentIndex, partial }`, `toolcall_delta { contentIndex, delta, partial }`, `toolcall_end { contentIndex, toolCall, partial }` |
| Kết thúc | `done { reason, message }`, `error { reason, error }` |

Lõi Agent ánh xạ chín biến thể start/update/end của văn bản, suy luận và lời gọi Tool thành `message_update`. `start` ở lớp ngoài của Pi AI trở thành `message_start`; `done` hoặc `error` trở thành `message_end`. `done.reason` nhận `stop`, `length`, `toolUse` hoặc `deferred`; `error.reason` nhận `aborted` hoặc `error`.

```typescript
import type { AgentEvent } from "@earendil-works/pi-agent-core";

export function logTextDelta(event: AgentEvent): void {
  if (
    event.type === "message_update" &&
    event.assistantMessageEvent.type === "text_delta"
  ) {
    const { contentIndex, delta } = event.assistantMessageEvent;
    console.log(contentIndex, delta);
  }
}
```

Hãy kiểm tra discriminant lồng bên trong trước khi đọc `delta`. Không phải `text_start`, `text_end` hay mọi biến thể suy luận và lời gọi Tool đều có trường này.

### `AgentSessionEvent`: vòng đời lõi và trạng thái sản phẩm

`AgentSession` chuyển tiếp mười discriminant của lõi, đổi `agent_end` để thêm `willRetry: boolean`, rồi bổ sung 13 discriminant cấp sản phẩm. Tính cả các giá trị kế thừa và giá trị cấp sản phẩm, session có 23 loại sự kiện riêng biệt.

| Sự kiện sản phẩm | Payload chính xác |
| --- | --- |
| `agent_settled` | không có |
| `queue_update` | `steering: readonly string[]`, `followUp: readonly string[]` |
| `compaction_start` | `reason: "manual" \| "threshold" \| "overflow"` |
| `compaction_end` | `reason`, `result`, `aborted`, `willRetry`, `errorMessage` không bắt buộc |
| `entry_appended` | `entry: SessionEntry` |
| `session_info_changed` | `name: string \| undefined` |
| `thinking_level_changed` | `level: ThinkingLevel` |
| `auto_retry_start` | `attempt`, `maxAttempts`, `delayMs`, `errorMessage` |
| `auto_retry_end` | `success`, `attempt`, `finalError` không bắt buộc |
| `summarization_retry_scheduled` | `attempt`, `maxAttempts`, `delayMs`, `errorMessage` |
| `summarization_retry_attempt_start` | `source: "branchSummary"`, hoặc `source: "compaction"` kèm `reason` |
| `summarization_retry_finished` | không có |
| `bash_execution_update` | `id` không bắt buộc, `delta: string` |

Danh sách chuẩn hóa dưới đây dựa trên [`packages/coding-agent/src/core/agent-session.ts`](https://github.com/earendil-works/pi/blob/107d79f11072bbc8a3a757ed7fd69596bee7d68c/packages/coding-agent/src/core/agent-session.ts). Danh sách tham chiếu lại union lõi và gộp cách xuống dòng. Đây không phải đoạn trích nguyên văn:

```typescript
type AgentSessionEvent =
  | Exclude<AgentEvent, { type: "agent_end" }>
  | { type: "agent_end"; messages: AgentMessage[]; willRetry: boolean }
  | { type: "agent_settled" }
  | { type: "queue_update"; steering: readonly string[]; followUp: readonly string[] }
  | { type: "compaction_start"; reason: "manual" | "threshold" | "overflow" }
  | { type: "entry_appended"; entry: SessionEntry }
  | { type: "session_info_changed"; name: string | undefined }
  | { type: "thinking_level_changed"; level: ThinkingLevel }
  | { type: "compaction_end"; reason: "manual" | "threshold" | "overflow"; result: CompactionResult | undefined; aborted: boolean; willRetry: boolean; errorMessage?: string }
  | { type: "auto_retry_start"; attempt: number; maxAttempts: number; delayMs: number; errorMessage: string }
  | { type: "auto_retry_end"; success: boolean; attempt: number; finalError?: string }
  | { type: "summarization_retry_scheduled"; attempt: number; maxAttempts: number; delayMs: number; errorMessage: string }
  | { type: "summarization_retry_attempt_start"; source: "branchSummary" }
  | { type: "summarization_retry_attempt_start"; source: "compaction"; reason: "manual" | "threshold" | "overflow" }
  | { type: "summarization_retry_finished" }
  | { type: "bash_execution_update"; id?: string; delta: string };
```

`agent_end` kết thúc một lượt chạy Agent ở cấp thấp. Coding Agent vẫn có thể thử lại, compact hoặc tiếp tục công việc trong hàng đợi. `agent_settled` đánh dấu ranh giới cấp sản phẩm sau khi mọi bước tiếp diễn tự động đã dừng. `bash_execution_update` mô tả lệnh `!` hoặc `!!` do session thực thi trực tiếp; sự kiện này khác với `tool_execution_update` của Tool do LLM yêu cầu.

### Sự kiện Extension có hợp đồng riêng

`pi.on()` không nhận trực tiếp `AgentSessionEvent`. `ExtensionEvent` là hợp đồng rộng hơn của Coding Agent:

| Nhóm | Discriminant chính xác |
| --- | --- |
| Khởi động và tài nguyên | `project_trust`, `resources_discover` |
| Phiên | `session_start`, `session_info_changed`, `session_before_switch`, `session_before_fork`, `session_before_compact`, `session_compact`, `session_compact_failed`, `session_before_tree`, `session_tree`, `session_shutdown` |
| Agent và provider | `before_agent_start`, `agent_start`, `agent_end`, `agent_settled`, `turn_start`, `turn_end`, `message_start`, `message_update`, `message_end`, `tool_execution_start`, `tool_execution_update`, `tool_execution_end`, `context`, `before_provider_request`, `before_provider_headers`, `after_provider_response`, `cache_warming_decision` |
| Prompt UI của Extension | `ui_prompt_start`, `ui_prompt_end` |
| Model | `model_select`, `thinking_level_select` |
| Tool, Bash và dữ liệu vào | `tool_call`, `tool_result`, `user_bash`, `input` |

Một số tên trùng với sự kiện lõi, nhưng payload và bảo đảm do Extension API định nghĩa. Chẳng hạn, `turn_start` của Extension thêm `turnIndex` và `timestamp`; `agent_end` của Extension không có `willRetry` như sự kiện mà session gửi tới bên đăng ký; `tool_call` và `context` có thể thay đổi quá trình thực thi, còn `tool_execution_start` và `message_update` chỉ thông báo trạng thái vòng đời.

`pi.on()` trả về hàm unsubscribe để gỡ registration. Trước khi bắt đầu dispatch, Pi chụp snapshot các handler của event. Handler được thêm hoặc xóa trong một dispatch không thay đổi snapshot đang được xử lý; thay đổi đó chỉ có hiệu lực ở các dispatch sau.

```ts title="unsubscribe-extension-handler.ts"
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function temporaryInputHandler(pi: ExtensionAPI) {
  const unsubscribe = pi.on("input", async (event) => {
    void event;
    return { action: "continue" };
  });

  unsubscribe();
}
```

Extension cũng có thể gọi model lồng nhau qua `ctx.modelRegistry.stream()` với option riêng của API, hoặc `ctx.modelRegistry.streamSimple()` với option trung lập với provider. Cả hai đường đều dùng provider đã cấu hình và authentication đã được resolve tại thời điểm gửi request. Extension không cần tự đọc `auth.json` hay chép API key vào handler.

| Ranh giới API | Quy ước runtime |
|---|---|
| `ctx.modelRegistry.stream()` | `configured provider → resolved authentication` |
| `ctx.modelRegistry.streamSimple()` | `configured provider → resolved authentication` |
| `pi.on()` | `returns () => void` |
| `dispatch` | `handler snapshot → registration changes apply to later dispatches` |

Ở baseline Pi `0.87.1`, `cache_warming_decision` chạy trước mỗi lần refresh prompt cache đã được lên lịch trong cả phase `streaming` đang hoạt động lẫn phase `idle` tùy chọn. Handler có thể trả `{ action: "warm" }` hoặc `{ action: "stop" }`; action cuối cùng được trả về sẽ quyết định lần refresh đó. Hook này chỉ đổi việc có gửi refresh hay không, không đổi cache lifetime do model công bố hay hành vi cache của provider.

Pi 0.85.0 export các kiểu sự kiện prompt sau từ package root:

```typescript
type UIPromptKind =
  "select" | "confirm" | "input" | "editor" | "custom";

interface UIPromptStartEvent {
  type: "ui_prompt_start";
  reason: "ui_prompt";
  kind: UIPromptKind;
  title?: string;
}

interface UIPromptEndEvent {
  type: "ui_prompt_end";
  reason: "ui_prompt";
  kind: UIPromptKind;
  title?: string;
}
```

Các lời gọi hướng tới người dùng và có tính chặn gồm `ctx.ui.select()`, `ctx.ui.confirm()`, `ctx.ui.input()`, `ctx.ui.editor()` và `ctx.ui.custom()` tạo cặp notification trạng thái `ui_prompt_start` và `ui_prompt_end` cho thời gian Pi chờ prompt. Cả hai payload luôn mang `reason: "ui_prompt"` cùng `kind` chính xác; `title` chỉ có mặt khi prompt cung cấp tiêu đề. Nhờ vậy, host phân biệt được trạng thái “đang chờ người dùng” với công việc Agent đang chạy mà không xem notification này như hook điều khiển.

Việc phân phối là best-effort và không được chờ. Các prompt lồng nhau hoặc chồng lấp được gộp thành một khoảng chờ ngoài cùng; Pi dùng `queueMicrotask` để xếp lịch một `ui_prompt_start` và một `ui_prompt_end` tương ứng quanh khoảng prompt ngoài cùng có tính chặn. Các notification này không phải rào cản thứ tự: observer có thể chạy sau lần chuyển trạng thái UI tương ứng. Vì thế observer chậm hoặc lỗi không thể trì hoãn dialog; integration nên dùng cặp sự kiện làm gợi ý trạng thái, không phải ranh giới audit bền vững.

Payload lỗi chính xác không chỉ là một tên trong danh mục:

```typescript
type SessionCompactFailedEvent = {
  type: "session_compact_failed";
  reason: "manual" | "threshold" | "overflow";
  errorMessage?: string;
  aborted: boolean;
  willRetry: boolean;
  fromExtension: boolean;
};
```

`errorMessage` có mặt với lỗi không phải abort và bị bỏ qua khi hủy hoặc gặp `AbortError`; `aborted` biểu diễn rõ khác biệt đó. `fromExtension` cho biết nội dung compaction do Extension cung cấp đang được dùng khi lần chạy lỗi, chứ không chỉ cho biết có đăng ký handler `session_before_compact`. Đây là sự kiện kết thúc nên `willRetry` bằng `false` ngay cả khi `reason` là `"overflow"` và một lần compaction thành công lẽ ra sẽ thử lại lượt bị ngắt.

Pi phát đồng bộ sự kiện session `compaction_end` trước, sau đó `session_compact_failed` mới được phân phối và được chờ hoàn tất sau `compaction_end`. Vì vậy, failed hook hoàn tất trước khi promise của `compact()` thủ công reject hoặc đường tự động trả `false`.

Với lần chạy thủ công, `compact()` chỉ reject sau khi các handler `session_compact_failed` hoàn tất; với lỗi tự động sau khi bắt đầu và có phát sự kiện này, vòng lặp compaction chỉ trả `false` sau khi các handler đó hoàn tất. Cả hai đường kết thúc đều không ghi thêm mục compaction mới. Đường tự động tự xử lý thao tác hủy, abort và lỗi tạo summary thông thường đã bắt đầu thay vì ném các kết quả đó cho caller. Trường hợp không có model, không thể chuẩn bị hoặc lỗi authentication trước `compaction_start` có thể trả `false` mà không phát `compaction_end` hay `session_compact_failed`.

Lỗi compaction thông thường đã bắt đầu đi theo chuỗi `compaction_start`, rồi `compaction_end`, cuối cùng là hook `session_compact_failed` được chờ hoàn tất.

Phục hồi overflow đã dùng hết là một đường kết thúc riêng. Không có `compaction_start` mới, Pi phát `compaction_end` rồi chờ `session_compact_failed` hoàn tất. Sự kiện kết thúc có `result: undefined`; cả hai mang `reason: "overflow"`, `errorMessage` là `Context overflow recovery failed after one compact-and-retry attempt. Try reducing context or switching to a larger-context model.` hoặc `Truncated response recovery failed after one compact-and-retry attempt.`, `aborted: false` và `willRetry: false`; sự kiện lỗi của Extension còn mang `fromExtension: false`.

## 3. Phân phối, thứ tự listener và thời điểm hoàn tất

### `Agent.subscribe()` là đăng ký có chờ

API lõi nhận listener đồng bộ hoặc bất đồng bộ rồi trả về hàm unsubscribe:

```typescript
import type { Agent } from "@earendil-works/pi-agent-core";

export function attachFinalFlush(
  agent: Agent,
  flush: (signal: AbortSignal) => Promise<void>,
): () => void {
  return agent.subscribe(async (event, signal) => {
    if (event.type === "agent_end") {
      await flush(signal);
    }
  });
}
```

Pi duyệt tập `Set` chứa các listener theo thứ tự đăng ký. Pi chờ một listener xong rồi mới gọi listener kế tiếp cho cùng sự kiện. Vì vậy, listener chậm sẽ trì hoãn cả listener phía sau lẫn giai đoạn phát sự kiện tiếp theo.

### Trạng thái được cập nhật trước khi bên đăng ký nhận sự kiện

`Agent.processEvents()` cập nhật trạng thái công khai của Agent trước, rồi mới gọi listener. Đoạn dưới là pseudocode rút gọn từ [`packages/agent/src/agent.ts`](https://github.com/earendil-works/pi/blob/107d79f11072bbc8a3a757ed7fd69596bee7d68c/packages/agent/src/agent.ts):

```typescript
// Pseudocode: omitted cases retain the same state-before-delivery order.
async function processEvents(event: AgentEvent) {
  if (event.type === "message_update") state.streamingMessage = event.message;
  if (event.type === "message_end") {
    state.streamingMessage = undefined;
    state.messages.push(event.message);
  }
  if (event.type === "tool_execution_start") pending.add(event.toolCallId);
  if (event.type === "tool_execution_end") pending.delete(event.toolCallId);

  for (const listener of listeners) {
    await listener(event, activeAbortSignal);
  }
}
```

Mã nguồn thực tế thay `pendingToolCalls` bằng một `Set` mới ở sự kiện bắt đầu và kết thúc. Listener nhận `message_end` có thể đọc message hoàn chỉnh từ `agent.state.messages`; listener nhận `tool_execution_start` sẽ thấy ID của lời gọi trong `agent.state.pendingToolCalls`.

### Sự kiện vòng đời tạo thành điểm chờ

Phần lớn sự kiện trong vòng lặp được phát và chờ ngay tại chỗ:

```text
cập nhật trạng thái Agent
  -> listener 1 hoàn tất
  -> listener 2 hoàn tất
  -> lời gọi emit hoàn tất
  -> giai đoạn phát tiếp theo bắt đầu
```

Thứ tự này tạo ra các điểm chờ cụ thể. Việc phân phối `message_end` của assistant phải xong trước khi bắt đầu khâu preflight của Tool. Mỗi `tool_execution_start` phải xong trước khi chuẩn bị đối số, kiểm tra tính hợp lệ và chạy `beforeToolCall`. `tool_execution_end` phải xong trước khi bắt đầu vòng đời của `ToolResultMessage` tương ứng.

`agent_end` là sự kiện cuối của vòng lặp, nhưng listener của nó vẫn thuộc lượt chạy đang hoạt động. `await agent.prompt(...)` và `await agent.waitForIdle()` chỉ hoàn tất sau khi các listener này xử lý xong và `finishRun()` dọn trạng thái truyền luồng do hệ thống quản lý.

### Tiến độ Tool có thể phân phối chồng lấp rồi hội tụ tại điểm chờ

Tài liệu Pi cũ nói listener của `tool_execution_update` không bao giờ được chờ. Pi 0.85.0 xử lý theo hai giai đoạn. Callback đồng bộ `onUpdate` của Tool khởi chạy việc phân phối nhưng không chờ, nên Tool có thể báo cập nhật tiếp theo khi bên đăng ký còn xử lý cập nhật trước. Pi giữ lại mọi promise phân phối và chờ tất cả hoàn tất trước khi hậu xử lý kết quả.

Đoạn dưới là pseudocode theo đúng thứ tự trong [`executePreparedToolCall()`](https://github.com/earendil-works/pi/blob/107d79f11072bbc8a3a757ed7fd69596bee7d68c/packages/agent/src/agent-loop.ts#L677-L718):

```typescript
// Pseudocode: exact ordering, abbreviated payload construction.
const updateEvents: Promise<void>[] = [];
let acceptingUpdates = true;

const result = await tool.execute(id, args, signal, (partialResult) => {
  if (!acceptingUpdates) return;
  updateEvents.push(Promise.resolve(emit({
    type: "tool_execution_update",
    toolCallId: id,
    toolName,
    args: originalArgs,
    partialResult,
  })));
});

acceptingUpdates = false;
await Promise.all(updateEvents);
// afterToolCall -> tool_execution_end -> ToolResultMessage comes later
```

Trong một lần cập nhật, các listener trực tiếp của `Agent.subscribe()` vẫn chạy theo thứ tự đăng ký. Những lần phân phối riêng biệt có thể chồng lên nhau, nên cập nhật N có thể hoàn tất sau cập nhật N+1. Cờ `acceptingUpdates` bỏ callback đến sau khi `tool.execute()` đã hoàn tất. Nếu promise phân phối tiến độ bị reject, `Promise.all` sẽ nhận lỗi đó; lỗi không bị bỏ quên trong tác vụ nền.

### Luồng cấp thấp, `Agent` và `AgentSession` có mốc hoàn tất khác nhau

| Giao diện | Dạng listener | Cách xử lý công việc bất đồng bộ |
| --- | --- | --- |
| `agentLoop()` / `agentLoopContinue()` | async iterator của `AgentEvent` | Phía nhận đọc luồng để quan sát; việc đọc không tạo điểm chờ cho bên phát |
| `Agent.subscribe()` | `(event, signal) => void \| Promise<void>` | Promise của listener được chờ theo thứ tự đăng ký |
| `AgentSession.subscribe()` | `(event) => void` | Listener chạy đồng bộ theo thứ tự trong mảng; promise trả về không được theo dõi |
| `pi.on()` | Extension handler có `ExtensionContext` | Quy tắc chờ và ý nghĩa của giá trị trả về tùy từng hook |

`AgentSession` đăng ký một listener nội bộ bất đồng bộ với `Agent`. Với sự kiện lõi được chuyển qua session, handler này chờ handler vòng đời của Extension, gọi các bên đăng ký với session theo cách đồng bộ, rồi lưu bền vững message hoàn chỉnh tại `message_end`. Toàn bộ handler nội bộ là một listener của `Agent` và được chờ; tuy nhiên, hàm `async` truyền vào `AgentSession.subscribe()` nằm ngoài điểm chờ vì kiểu listener của session trả về `void`.

```typescript
import type { AgentSession } from "@earendil-works/pi-coding-agent";

export function observeSession(session: AgentSession): () => void {
  return session.subscribe((event) => {
    if (event.type === "agent_end" && event.willRetry) {
      console.log("The low-level run ended; Coding Agent will retry.");
    }
    if (event.type === "agent_settled") {
      console.log("No automatic continuation remains.");
    }
  });
}
```

Hãy dùng `Agent.subscribe()` cho công việc bắt buộc phải hoàn tất trong một lượt chạy ở cấp thấp. Dùng `AgentSession.waitForIdle()` hoặc sự kiện cấp sản phẩm `agent_settled` nếu mốc hoàn tất phải bao gồm retry, compaction và chính sách tiếp tục hàng đợi. Khi listener của session khởi động công việc bất đồng bộ, ứng dụng phải tự theo dõi và chờ công việc đó.

## 4. Lỗi, cô lập và hủy tác vụ

### Lỗi từ bên đăng ký trực tiếp ảnh hưởng đến lượt chạy

`Agent.processEvents()` không bọc `catch` quanh từng listener. Khi listener 1 ném lỗi hoặc promise của nó bị reject, các listener phía sau không nhận sự kiện đó. Lỗi đi tới `runWithLifecycle()`, nơi thường chuyển lỗi của lượt chạy thành message lỗi của assistant rồi phát `message_start`, `message_end`, `turn_end` và `agent_end` cho message ấy. Nếu listener tiếp tục lỗi trong chuỗi sự kiện lỗi tổng hợp này, `prompt()` có thể reject.

Hãy bắt lỗi mà ứng dụng có thể phục hồi ngay trong hàm đăng ký nhận sự kiện. Chỉ ném lỗi tiếp nếu mất bản ghi kiểm toán, dữ liệu lưu bền vững hoặc hành động chính sách phải khiến lượt chạy thất bại rõ ràng:

```typescript
import type { Agent, AgentMessage } from "@earendil-works/pi-agent-core";

export function attachAudit(
  agent: Agent,
  writeAuditRecord: (
    message: AgentMessage,
    signal: AbortSignal,
  ) => Promise<void>,
  reportAuditFailure: (error: unknown) => void,
): () => void {
  return agent.subscribe(async (event, signal) => {
    if (event.type !== "message_end") return;

    try {
      await writeAuditRecord(event.message, signal);
    } catch (error) {
      reportAuditFailure(error);
      // Add `throw error` when losing this record must fail the run.
    }
  });
}
```

Các hàm trong ví dụ này đại diện cho mã ứng dụng. Có thể sao chép kiểu sự kiện và cách dùng `AbortSignal`; ứng dụng phải tự quyết định chính sách lỗi.

### Lỗi provider, Tool và yêu cầu hủy giữ đúng phạm vi

Pi AI kết thúc luồng provider bị lỗi bằng `AssistantMessageEvent.error`. Lõi Agent hoàn tất message của assistant với `stopReason: "error"` hoặc `"aborted"`, rồi phát các sự kiện kết thúc message, turn và lượt chạy như bình thường. Lỗi khi tìm Tool, kiểm tra đối số, chạy `beforeToolCall`, thực thi Tool hoặc chạy `afterToolCall` sẽ trở thành kết quả Tool báo lỗi tại nơi lõi bắt lỗi. Vòng đời Tool vẫn kết thúc với `isError: true`, sau đó là `ToolResultMessage` để model ở turn tiếp theo đọc.

```text
lỗi provider: message_end(error/aborted) -> turn_end -> agent_end
lỗi Tool:     tool_execution_end(isError=true)
           -> message_start/end(ToolResultMessage)
           -> turn_end
```

Mỗi bên đăng ký trực tiếp với Agent nhận `AbortSignal` của lượt chạy đang hoạt động. `agent.abort()` hủy signal đó. Provider, Tool và công việc của bên đăng ký chỉ dừng nhanh nếu tuân theo signal. Sau khi hủy, Tool cũng không thể phát tiến độ vô hạn: cờ `acceptingUpdates` nói trên sẽ bỏ các cập nhật đến muộn.

### Mỗi hook Extension có cách cô lập lỗi riêng

Bộ chạy Extension của Coding Agent bắt và báo lỗi cho hoạt động quan sát vòng đời thông thường, cũng như các handler nối tiếp như `context`, `input`, `message_end` và `tool_result`. Một handler quan sát bị lỗi không chặn các handler Extension phía sau. Giá trị trả về có thể thay đổi hành vi sẽ được chờ theo thứ tự nạp Extension.

`tool_call` được nối vào `beforeToolCall` của lõi Agent. Nếu handler này ném lỗi, khâu preflight của lõi bắt lỗi và tạo kết quả Tool báo lỗi thay vì thực thi Tool. Lỗi từ bên đăng ký với session đi theo đường khác: `_emit()` không `catch`, nên lỗi đồng bộ trong sự kiện lõi được chuyển qua session sẽ làm listener nội bộ của Agent reject và ảnh hưởng đến lượt chạy.

Mỗi sự kiện định nghĩa ranh giới này riêng. Không nên mặc định mọi thứ mang tên “listener” đều dùng cùng một chính sách lỗi.

## 5. Quan sát, chặn, tiền xử lý và UI

### Quan sát một lượt chạy

Bên đăng ký chỉ đọc có thể thu thập thời gian, telemetry hoặc dấu vết Tool ngắn. Hãy liên kết Tool bằng `toolCallId`; chỉ dùng tên Tool thì không đủ để phân biệt từng lời gọi.

```typescript
import type { AgentSession } from "@earendil-works/pi-coding-agent";

export function logToolTimings(session: AgentSession): () => void {
  const started = new Map<string, number>();

  return session.subscribe((event) => {
    if (event.type === "tool_execution_start") {
      started.set(event.toolCallId, Date.now());
    }
    if (event.type === "tool_execution_end") {
      const beganAt = started.get(event.toolCallId);
      const elapsedMs =
        beganAt === undefined ? undefined : Date.now() - beganAt;
      console.log({
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        elapsedMs,
        isError: event.isError,
      });
      started.delete(event.toolCallId);
    }
  });
}
```

Không ghi API key, prompt chưa che dữ liệu nhạy cảm, bí mật của Tool hoặc thông tin xác thực dạng thô vào log sự kiện dùng chung. Định danh của lượt chạy, turn, provider, model và lời gọi Tool thường đã đủ để liên kết dữ liệu.

### Chặn lời gọi Tool qua Extension API

Sự kiện vòng đời dùng để quan sát không trả về giá trị để chặn thực thi. Hợp đồng này nằm ở hook `tool_call`. Hook chạy sau `tool_execution_start` và sau khi đối số được kiểm tra hợp lệ, nhưng trước khi Tool thực thi. Handler trước có thể sửa `event.input` tại chỗ; handler sau nhìn thấy giá trị đã sửa, và Pi không kiểm tra lại.

```typescript
import {
  isToolCallEventType,
  type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";

export default function protectProduction(pi: ExtensionAPI) {
  pi.on("tool_call", (event) => {
    if (
      isToolCallEventType("bash", event) &&
      event.input.command.includes("rm -rf")
    ) {
      return {
        block: true,
        reason: "Recursive deletion is disabled by this extension.",
        terminate: true,
      };
    }
  });
}
```

Ở đây, `terminate` áp dụng cho lời gọi bị chặn. Theo [`shouldTerminateToolBatch()`](https://github.com/earendil-works/pi/blob/107d79f11072bbc8a3a757ed7fd69596bee7d68c/packages/agent/src/agent-loop.ts#L589-L590) ở bản mã nguồn đã pin, Pi chỉ quyết định kết thúc sau khi đã hoàn tất mọi kết quả của nhóm hiện tại. Nếu nhóm có kết quả và mọi kết quả đều có `terminate: true`, quyết định `terminate` cho nhóm nhận giá trị `true`; cờ này không dừng sớm công việc đang chạy trong nhóm.

### Tiền xử lý ngữ cảnh model mà không đổi lịch sử

Sự kiện Extension `context` chạy trước mỗi lần gọi model. Pi bắt đầu bằng một bản sao sâu, lần lượt truyền mảng `messages` được trả về theo thứ tự nạp Extension và không sửa lịch sử gốc của session.

```typescript
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function hideEphemeralStatus(pi: ExtensionAPI) {
  pi.on("context", (event) => ({
    messages: event.messages.filter(
      (message) =>
        message.role !== "custom" ||
        message.customType !== "ephemeral-status",
    ),
  }));
}
```

Các hook chuyển đổi khác nằm ở những ranh giới riêng: `input` có thể biến đổi hoặc tự xử lý dữ liệu đầu vào thô; `before_agent_start` có thể chèn message hoặc thay system prompt của turn; `before_provider_request` có thể thay payload đã tuần tự hóa cho provider; `before_provider_headers` sửa header tại chỗ; `message_end` có thể thay message hoàn chỉnh nhưng phải giữ nguyên role; `tool_result` có thể sửa kết quả trước sự kiện kết thúc.

### Chuyển văn bản tới UI trên trình duyệt

Máy chủ có thể ánh xạ sự kiện session thành một hợp đồng SSE nhỏ hơn. Nếu trình duyệt cần giữ kết nối qua lần retry tự động hoặc compaction, hãy kết thúc luồng HTTP tại `agent_settled` thay vì `agent_end`.

```typescript
import type { ServerResponse } from "node:http";
import type { AgentSession } from "@earendil-works/pi-coding-agent";

export function forwardText(
  session: AgentSession,
  response: ServerResponse,
): () => void {
  const unsubscribe = session.subscribe((event) => {
    if (
      event.type === "message_update" &&
      event.assistantMessageEvent.type === "text_delta"
    ) {
      response.write(
        `data: ${JSON.stringify({ type: "text_delta", delta: event.assistantMessageEvent.delta })}\n\n`,
      );
    }
    if (event.type === "agent_settled") response.end();
  });

  response.on("close", unsubscribe);
  return unsubscribe;
}
```

Bộ hiển thị trên trình duyệt nên gom các lần vẽ theo tần số quét của màn hình khi delta từ provider đến nhanh hơn khả năng vẽ của UI. Việc gom này nằm sau bên đăng ký với session; nếu đổi cách Agent phân phối, quy tắc hoàn tất của mọi bên nhận khác cũng thay đổi.

## 6. Hành trình đầy đủ của `text_delta`

### Từ provider tới UI

Giả sử adapter nhận một mảnh dữ liệu chứa `"Hel"`. Chuỗi xử lý đi qua các ranh giới package mà không làm phẳng sự kiện ở lớp dưới:

```text
byte phản hồi từ provider
  -> bộ điều hợp @earendil-works/pi-ai cập nhật AssistantMessage tích lũy
  -> AssistantMessageEvent { type: "text_delta", contentIndex, delta: "Hel", partial }
  -> agent-loop thay `partial` hiện tại trong ngữ cảnh
  -> AgentEvent { type: "message_update", message, assistantMessageEvent }
  -> Agent.processEvents gán state.streamingMessage
  -> chờ các listener của Agent theo thứ tự đăng ký
  -> AgentSession chờ handler Extension message_update
  -> các bên đăng ký đồng bộ với AgentSession
  -> TUI vẽ lại, phép chiếu JSON/RPC hoặc tầng truyền dữ liệu của ứng dụng
```

`AgentSession` không lưu bền vững `message_update`. Việc lưu diễn ra tại `message_end`, sau khi message hoàn chỉnh của assistant đã thay partial.

### Delta và partial tích lũy phục vụ các mục đích khác nhau

`assistantMessageEvent.delta` chứa mảnh văn bản mới. `event.message` và `assistantMessageEvent.partial` chứa trạng thái tích lũy của assistant tại thời điểm đó. Terminal có thể nối thêm `delta`; bộ hiển thị có cấu trúc có thể thay khối hiện tại bằng trạng thái tích lũy.

```typescript
import type { AssistantMessage } from "@earendil-works/pi-ai";
import type { AgentSession } from "@earendil-works/pi-coding-agent";

export function renderAssistantStream(
  session: AgentSession,
  appendText: (contentIndex: number, delta: string) => void,
  renderPartialToolCall: (
    contentIndex: number,
    partial: AssistantMessage,
  ) => void,
): () => void {
  return session.subscribe((event) => {
    if (event.type !== "message_update") return;

    const update = event.assistantMessageEvent;
    if (update.type === "text_delta") {
      appendText(update.contentIndex, update.delta);
    } else if (update.type === "toolcall_delta") {
      renderPartialToolCall(update.contentIndex, update.partial);
    }
  });
}
```

Provider Pi AI thường tạo `AssistantMessage` tích lũy bằng cách sửa `content` tại chỗ khi có mảnh dữ liệu mới. Vòng lặp Agent chỉ sao chép nông object biểu diễn message ở cấp ngoài cùng khi phát sự kiện, không sao chép sâu mọi khối nội dung. Vì vậy, object sự kiện không có bảo đảm bất biến sâu. Hãy đọc dữ liệu cần thiết ngay trong callback, hoặc tạo bản sao sâu cho dữ liệu phải giữ nguyên qua các delta tiếp theo.

### Bước hoàn tất có thể giữ nguyên định danh của object

Khi Pi AI phát `done` hoặc `error`, vòng lặp Agent lấy `response.result()`, thay partial trong ngữ cảnh rồi phát `message_end`. `Agent.processEvents()` xóa `streamingMessage` và thêm object cuối vào `state.messages` trước khi bên đăng ký nhận sự kiện.

Sau đó Coding Agent chạy handler Extension `message_end`. Giá trị thay thế hợp lệ phải giữ nguyên `role` của message. `AgentSession` sửa tại chỗ object đã lưu, nhờ vậy trạng thái Agent, payload `turn_end` và `agent_end` về sau, các bên đăng ký với session và dữ liệu lưu bền vững đều trỏ tới cùng một object và thấy cùng nội dung. Đây là thay đổi có chủ ý; bên quan sát không nên coi object sự kiện là bất biến hoặc giữ nó như một bản chụp lịch sử không đổi.

## 7. Tiến độ Tool và thứ tự kết quả

### Một lời gọi Tool

Với một lời gọi Tool vượt qua preflight, vòng đời hiện tại đặt bước chuẩn bị và biến đổi kết quả vào các vị trí chính xác:

```text
điểm chờ message_end của assistant
điểm chờ tool_execution_start
prepareArguments -> kiểm tra hợp lệ -> beforeToolCall
Tool thực thi -> tool_execution_update* -> chờ mọi lần phân phối tiến độ
chờ afterToolCall / Extension tool_result
điểm chờ tool_execution_end
message_start của ToolResultMessage
message_end của ToolResultMessage
turn_end
```

`tool_execution_start.args` là object đối số gốc của lời gọi Tool. `prepareArguments` hoặc Extension `tool_call` có thể đổi đối số dùng để thực thi sau đó. Tool tự định nghĩa `tool_execution_update.partialResult`; các Tool tích hợp sẵn có streaming thường phát kết quả hiển thị tích lũy, còn Tool tùy chỉnh phải ghi rõ hợp đồng cho `details`.

### Thực thi tuần tự và song song trong một nhóm lời gọi

Ở chế độ tuần tự, Pi xử lý xong kết quả preflight tức thời hoặc toàn bộ pipeline đã chuẩn bị của một lời gọi, phát sự kiện kết thúc và vòng đời của message kết quả, rồi mới bắt đầu lời gọi tiếp theo. Trong bản mã nguồn đã pin, [`executeToolCallsParallel()`](https://github.com/earendil-works/pi/blob/107d79f11072bbc8a3a757ed7fd69596bee7d68c/packages/agent/src/agent-loop.ts#L489-L552) tách lượt quét theo thứ tự xuất hiện khỏi các pipeline đã chuẩn bị chạy đồng thời:

1. Pi phát `tool_execution_start` và chạy preflight tuần tự theo thứ tự lời gọi Tool trong message của assistant. Lỗi tra cứu, chuẩn bị, kiểm tra hợp lệ, hook hoặc abort trở thành kết quả tức thời, nên `tool_execution_end` của lỗi đó cũng được phát ngay trong lượt quét. Pi vẫn quét các lời gọi phía sau trừ khi phát hiện abort.
2. Sau lượt quét, các Tool đã chuẩn bị bắt đầu chạy đồng thời. Mỗi pipeline bình thường phải chờ `tool.execute()`, mọi lần phân phối tiến độ đã thu thập và bước hoàn tất `afterToolCall` trước khi phát `tool_execution_end`.
3. Vì vậy, `tool_execution_end` bình thường đi theo thời điểm toàn pipeline hoàn tất, không nhất thiết theo thời điểm `tool.execute()` trả về. Sự kiện tiến độ và `tool_execution_end` của các lời gọi đã chuẩn bị có thể xen kẽ.
4. Sau khi mọi kết quả tức thời hoặc đã chuẩn bị đều hoàn tất, các cặp `message_start`/`message_end` của `ToolResultMessage` được phát theo thứ tự lời gọi Tool ban đầu trong message của assistant.
5. Sau các vòng đời của message kết quả đó, Pi mới tổng hợp `terminate` từ mọi kết quả để quyết định có tiếp tục sau nhóm hay không; quyết định này không hủy công việc bên trong nhóm.
6. Sau đó, `turn_end.toolResults` dùng cùng thứ tự xuất hiện ban đầu.

```text
lời gọi từ assistant:       A (lỗi preflight), B, C
quét theo thứ tự xuất hiện: tool_execution_start A -> tool_execution_end A(error)
                            -> tool_execution_start B -> tool_execution_start C
pipeline đã chuẩn bị:       tool_execution_update C -> tool.execute() B trả về
                            -> tool.execute() C trả về
sự kiện hoàn tất:           tool_execution_end C -> tool_execution_end B
                            (afterToolCall của B hoàn tất muộn hơn)
ToolResultMessage kết quả:  A -> B -> C
terminate của nhóm:         gộp mọi kết quả đã hoàn tất (quyết định sau nhóm)
turn_end.toolResults:       [A, B, C]
```

Hãy liên kết cả ba loại sự kiện Tool bằng `toolCallId`. Vị trí trong mảng, thời điểm `tool.execute()` hoàn tất và thứ tự `tool_execution_end` sau bước hoàn tất là ba quy tắc khác nhau.

## 8. Quyết định thiết kế và bài học áp dụng

### Tách quan sát khỏi điều khiển

Dùng sự kiện vòng đời để quan sát trạng thái sau khi cập nhật. Dùng hook có tên rõ ràng để đổi hành vi: `beforeToolCall` hoặc Extension `tool_call` để chặn; `afterToolCall` hoặc `tool_result` để đổi kết quả; `transformContext` hoặc Extension `context` để chuẩn bị dữ liệu cho model; `message_end` để thay message cuối nhưng giữ nguyên role. Cách tách này làm rõ ý nghĩa của giá trị trả về, tránh để một bên quan sát bất kỳ âm thầm điều khiển lượt chạy.

### Đặt điểm chờ tại ranh giới cần bảo đảm tính nhất quán

Lõi Agent chờ việc phân phối sự kiện vòng đời vì khâu preflight của Tool, bên đọc trạng thái và thao tác flush bắt buộc cần thấy một chuyển đổi nhất quán. Tiến độ Tool khởi chạy nhiều lượt phân phối đồng thời để không chặn callback, rồi chờ tất cả trước khi hoàn tất kết quả. Các bên đăng ký qua API công khai của Coding Agent chạy đồng bộ để điều phối UI, còn hook Extension được chờ tại nơi giá trị trả về có thể thay đổi quá trình thực thi.

Khi thiết kế hệ thống khác, hãy xác định giai đoạn muộn nhất cần nhìn thấy công việc của bên nhận và đặt điểm hội tụ rõ ràng tại đó. Công việc nền không có thành phần chịu trách nhiệm dễ gây lỗi promise không được xử lý, ghi sai thứ tự hoặc khiến tiến trình thoát trước khi flush xong.

### Giữ chính sách cấp sản phẩm bên ngoài lõi

Mười sự kiện lõi mô tả mọi lượt chạy Agent. Retry, compaction, tên session, các lần retry khi tóm tắt, đầu ra Bash trực tiếp và mốc hoàn tất cuối của sản phẩm thuộc Coding Agent. Mức tin cậy của dự án, khám phá tài nguyên, payload của provider và dữ liệu người dùng nhập trong phiên tương tác thuộc hợp đồng Extension. Ranh giới package này giúp Agent cấp thấp hoạt động mà không cần import sản phẩm CLI.

Khi áp dụng thiết kế hướng sự kiện cho hệ thống khác, hãy kiểm tra năm điểm:

1. Mỗi discriminant có đúng một thành phần sở hữu và payload được ghi rõ.
2. Thời điểm trạng thái trở nên khả kiến trước khi phân phối được xác định rõ.
3. Thứ tự listener, cách hoàn tất công việc bất đồng bộ và cách unsubscribe được mô tả riêng cho từng giao diện.
4. Sự kiện cập nhật tần suất cao có điểm hội tụ rõ ràng trước bước hoàn tất.
5. Quan sát, can thiệp, thay đổi tại chỗ, lưu bền vững, lỗi và hủy là các hợp đồng riêng.

## 9. Chương tiếp theo

Sự kiện cho biết khi nào ngữ cảnh được chuẩn bị, message đang truyền theo luồng và kết quả Tool đã trở về. Sự kiện không quyết định chỉ dẫn, lịch sử, tài nguyên hay đầu ra Tool nào đi vào lần gọi model kế tiếp. [Chương 8](ch08-context-engineering.md) sẽ đi theo quy trình kỹ thuật ngữ cảnh đó, từ xây dựng system prompt và giới hạn đầu ra Tool tới compaction và branch summary.

> **Chỉ mục mã nguồn đã pin:** Pi `0.85.0`, commit `107d79f11072bbc8a3a757ed7fd69596bee7d68c`: [`packages/ai/src/types.ts`](https://github.com/earendil-works/pi/blob/107d79f11072bbc8a3a757ed7fd69596bee7d68c/packages/ai/src/types.ts#L527-L551), [`packages/agent/src/types.ts`](https://github.com/earendil-works/pi/blob/107d79f11072bbc8a3a757ed7fd69596bee7d68c/packages/agent/src/types.ts), [`packages/agent/src/agent-loop.ts`](https://github.com/earendil-works/pi/blob/107d79f11072bbc8a3a757ed7fd69596bee7d68c/packages/agent/src/agent-loop.ts#L281), [`packages/agent/src/agent.ts`](https://github.com/earendil-works/pi/blob/107d79f11072bbc8a3a757ed7fd69596bee7d68c/packages/agent/src/agent.ts#L240-L253), [`packages/coding-agent/src/core/agent-session.ts`](https://github.com/earendil-works/pi/blob/107d79f11072bbc8a3a757ed7fd69596bee7d68c/packages/coding-agent/src/core/agent-session.ts#L142-L185), [`packages/coding-agent/src/core/extensions/types.ts`](https://github.com/earendil-works/pi/blob/107d79f11072bbc8a3a757ed7fd69596bee7d68c/packages/coding-agent/src/core/extensions/types.ts), và [`packages/coding-agent/src/core/extensions/runner.ts`](https://github.com/earendil-works/pi/blob/107d79f11072bbc8a3a757ed7fd69596bee7d68c/packages/coding-agent/src/core/extensions/runner.ts#L801).
