---
title: Stream output của agent
description: Hiển thị text, thinking và tiến trình Tool từ event của AgentSession mà không buffer toàn bộ lượt chạy.
translation_key: how-to-stream-output
language: vi
official_refs:
  - 'https://github.com/earendil-works/pi/blob/f07218c4d4bbc12bef056a7058c3dd49dfe41abe/packages/coding-agent/src/core/agent-session.ts'
  - 'https://github.com/earendil-works/pi/blob/f07218c4d4bbc12bef056a7058c3dd49dfe41abe/packages/coding-agent/src/modes/rpc/rpc-types.ts'
  - 'https://github.com/earendil-works/pi/blob/f07218c4d4bbc12bef056a7058c3dd49dfe41abe/packages/coding-agent/src/core/model-registry.ts'
status: reviewed
reviewed_by: Pify maintainers
last_updated: '2026-09-23'
---

Subscribe vào `AgentSession` trước khi gọi `prompt()`. Các event của session cho phép CLI hoặc UI hiển thị partial output, công việc của Tool, retry và trạng thái cuối mà không phải đọc lại toàn bộ transcript.

:::tip[Khi nào cần]

- Chat UI hiển thị text trong lúc model phản hồi
- CLI báo tiến trình thinking và Tool
- Web app cần hủy một lượt chạy dài

:::

Các ví dụ dùng Node.js `>=22.19.0`, ESM và package phát hành ở phiên bản `0.87.1`:

```bash
npm install @earendil-works/pi-coding-agent@0.87.1
npm install --save-dev tsx typescript @types/node
```

## Event stream

`subscribe()` nhận listener đồng bộ `(event) => void` và trả về hàm unsubscribe. `AgentSession` gọi listener ngay lập tức; nó không await Promise được trả về. Hãy giữ callback gọn và chuyển phần render tốn thời gian sang queue hoặc batch.

| Event của session | Ý nghĩa | Thao tác UI thường dùng |
|---|---|---|
| `message_start` | Mở một message của user, assistant hoặc kết quả Tool | Tạo hàng cho message |
| `message_update` | Assistant message thay đổi | Kiểm tra `assistantMessageEvent` |
| `message_end` | Đã có message hoàn chỉnh, gồm cả `stopReason` của assistant | Commit hoặc gắn nhãn cho hàng |
| `tool_execution_start` / `update` / `end` | Một Tool bắt đầu, báo tiến trình rồi trả kết quả hoặc lỗi | Cập nhật state theo `toolCallId` |
| `agent_end` | Một attempt của agent kết thúc; `willRetry` cho biết session có retry hay không | Kết thúc attempt, chưa chắc đã kết thúc lượt chạy |
| `auto_retry_start` / `end` | Thời gian chờ hoặc kết quả retry của session | Hiển thị trạng thái retry |
| `agent_settled` | Retry và công việc continuation trong queue đã xong, session ở trạng thái idle | Bật input và đánh dấu lượt chạy hoàn tất |

Với `message_update`, hãy kiểm tra `assistantMessageEvent.type`. Text, thinking và tham số Tool đều có các phase `*_start`, `*_delta` và `*_end`. Trong agent loop hiện tại, `start` từ provider cùng `done` hoặc `error` ở cuối stream trở thành `message_start` và `message_end` bên ngoài; chúng không phải event cấp session riêng.

`prompt()` resolve sau khi session settle. Nó không chờ công việc bất đồng bộ được khởi chạy bên trong listener vì listener của session là đồng bộ.

## 1. Stream text thuần

Khi đã cấu hình model và credential, đây là consumer hoàn chỉnh cho terminal:

```ts title="stream.ts"
import {
  createAgentSession,
  ModelRuntime,
  SessionManager,
} from "@earendil-works/pi-coding-agent";

const modelRuntime = await ModelRuntime.create();
const { session } = await createAgentSession({
  modelRuntime,
  sessionManager: SessionManager.inMemory(),
});

const unsubscribe = session.subscribe((event) => {
  if (
    event.type === "message_update" &&
    event.assistantMessageEvent.type === "text_delta"
  ) {
    process.stdout.write(event.assistantMessageEvent.delta);
  }
});

try {
  await session.prompt("Write a TypeScript haiku.");
  process.stdout.write("\n");
} finally {
  unsubscribe();
  session.dispose();
}
```

Chạy bằng `npx tsx stream.ts`. Delta là một chunk text, không nhất thiết chỉ có một ký tự. Append từng delta khi nó đến; nếu cũng cần chuỗi cuối, hãy tích lũy chính các delta đó trong khi vẫn render tăng dần.

## 2. Stream Tool call

Tool streaming có hai lớp. Event `toolcall_*` lồng bên trong ghép tham số Tool call do model tạo. Sau đó, event `tool_execution_*` báo quá trình thực thi thật. Renderer gọn dưới đây xử lý cả hai lớp, text, trạng thái retry và lúc settle cuối cùng:

```ts title="render-output.ts"
import type {
  AgentSession,
  AgentSessionEvent,
} from "@earendil-works/pi-coding-agent";

interface OutputView {
  appendText(delta: string): void;
  startToolArguments(contentIndex: number): void;
  appendToolArguments(contentIndex: number, delta: string): void;
  commitToolCall(call: {
    id: string;
    name: string;
    arguments: Record<string, unknown>;
  }): void;
  startTool(id: string, name: string, args: unknown): void;
  updateTool(id: string, partialResult: unknown): void;
  finishTool(id: string, result: unknown, isError: boolean): void;
  finishMessage(stopReason: string, errorMessage?: string): void;
  finishAttempt(willRetry: boolean): void;
  showRetry(
    attempt: number,
    maxAttempts: number,
    delayMs: number,
    errorMessage: string,
  ): void;
  finishRetry(success: boolean, attempt: number, finalError?: string): void;
  markIdle(): void;
}

export function subscribeToOutput(
  session: AgentSession,
  view: OutputView,
): () => void {
  return session.subscribe((event: AgentSessionEvent) => {
    if (event.type === "message_update") {
      const part = event.assistantMessageEvent;
      if (part.type === "text_delta") view.appendText(part.delta);
      if (part.type === "toolcall_start") {
        view.startToolArguments(part.contentIndex);
      }
      if (part.type === "toolcall_delta") {
        view.appendToolArguments(part.contentIndex, part.delta);
      }
      if (part.type === "toolcall_end") view.commitToolCall(part.toolCall);
      return;
    }

    switch (event.type) {
      case "message_end":
        if (event.message.role === "assistant") {
          view.finishMessage(
            event.message.stopReason,
            event.message.errorMessage,
          );
        }
        break;
      case "tool_execution_start":
        view.startTool(event.toolCallId, event.toolName, event.args);
        break;
      case "tool_execution_update":
        view.updateTool(event.toolCallId, event.partialResult);
        break;
      case "tool_execution_end":
        view.finishTool(event.toolCallId, event.result, event.isError);
        break;
      case "agent_end":
        view.finishAttempt(event.willRetry);
        break;
      case "auto_retry_start":
        view.showRetry(
          event.attempt,
          event.maxAttempts,
          event.delayMs,
          event.errorMessage,
        );
        break;
      case "auto_retry_end":
        view.finishRetry(event.success, event.attempt, event.finalError);
        break;
      case "agent_settled":
        view.markIdle();
        break;
    }
  });
}
```

Các Tool có thể chạy song song. Tiến trình và event hoàn tất có thể xen kẽ, vì vậy hãy giữ state thực thi theo `toolCallId`; đừng dùng “Tool bắt đầu gần nhất” làm stack ngầm. `contentIndex` nhận diện block tham số khi model vẫn đang tạo chúng. `auto_retry_start` cung cấp thời gian chờ và lỗi kích hoạt retry; `auto_retry_end` kết thúc trạng thái này bằng kết quả thành công hoặc lỗi cuối.

## 3. Stream thinking block

Thinking là content type riêng và có thể không xuất hiện. Hãy tách nó khỏi answer text và quyết định sản phẩm của bạn nên hiển thị, thu gọn hay bỏ qua phần này.

```ts title="thinking.ts"
import type { AgentSession } from "@earendil-works/pi-coding-agent";

interface ThinkingView {
  open(contentIndex: number): void;
  append(delta: string): void;
  close(content: string): void;
}

export function subscribeToThinking(
  session: AgentSession,
  view: ThinkingView,
): () => void {
  return session.subscribe((event) => {
    if (event.type !== "message_update") return;

    const part = event.assistantMessageEvent;
    if (part.type === "thinking_start") view.open(part.contentIndex);
    if (part.type === "thinking_delta") view.append(part.delta);
    if (part.type === "thinking_end") view.close(part.content);
  });
}
```

Đừng suy luận khả năng thinking từ tên provider. Hãy kiểm tra model đã chọn và xem việc không có thinking event là kết quả hợp lệ. Không nên log thinking theo mặc định nếu nó có thể chứa context nhạy cảm.

## 4. Hủy lượt chạy đang hoạt động

Hãy await `session.abort()`. Hàm này hủy retry đang hoạt động và core agent, sau đó chờ tới khi session idle:

```ts title="cancel.ts"
import type { AgentSession } from "@earendil-works/pi-coding-agent";

export function wireCancel(
  session: AgentSession,
  cancelButton: HTMLButtonElement,
  onError: (error: unknown) => void = console.error,
): () => void {
  const onCancel = () => {
    cancelButton.disabled = true;
    void (async () => {
      try {
        await session.abort();
      } finally {
        cancelButton.disabled = false;
      }
    })().catch(onError);
  };

  cancelButton.addEventListener("click", onCancel);
  return () => cancelButton.removeEventListener("click", onCancel);
}
```

Giữ lại partial output đã render. Nếu có assistant response đang hoạt động, nó kết thúc qua `message_end` với `stopReason: "aborted"`, rồi tới event kết thúc attempt và settle. API này bảo đảm thao tác hủy cục bộ và trạng thái idle; nó không đưa ra cam kết tính phí cho provider bên ngoài.

RPC headless tách thao tác hủy khỏi việc dọn queue. Đây là shape chính xác của request `clear_queue` và response thành công công khai:

```ts title="rpc-clear-queue.ts"
{ id?: string; type: "clear_queue" }
{
  id?: string;
  type: "response";
  command: "clear_queue";
  success: true;
  data: { steering: string[]; followUp: string[] };
}
```

RPC `abort` hủy thao tác đang hoạt động—kể cả compaction thủ công đang chạy ở Pi 0.85.0—và chờ tới khi session idle rồi mới phản hồi. Công việc steering hoặc follow-up trong queue vẫn có thể tiếp tục trừ khi `clear_queue` loại bỏ nó, nên chỉ riêng response của abort không có nghĩa queue đã bị xóa.

Đối với Escape tương tác, hãy gửi `clear_queue` trước `abort`, rồi khôi phục text `steering` và `followUp` được trả về trong editor phía client nếu phù hợp. Đảo thứ tự có thể khiến công việc trong queue bắt đầu khi `abort` còn đang chờ trạng thái idle.

Hướng dẫn tiêu thụ sự kiện này trung lập với transport: tiến trình RPC truyền command và event bằng JSON Lines, còn ứng dụng có thể chiếu event của session qua SSE, WebSocket hoặc kênh khác. Không phải mọi provider đều dùng SSE, vì vậy bản sửa OpenAI Codex trong Pi 0.85.0 cho terminal SSE event không có dòng trống theo sau là chi tiết của adapter, không phải quy tắc framing cho renderer này.

## 5. Batch công việc UI; đừng kỳ vọng backpressure

Listener của `AgentSession` không phải async iterator. Việc trả về Promise hoặc await trong async listener không làm chậm quá trình phát event. Browser client nên gom delta thành batch và flush khi chạm ngưỡng đã chọn:

```ts title="browser-batcher.ts"
import type { AgentSession } from "@earendil-works/pi-coding-agent";

const FLUSH_THRESHOLD_CHARS = 64 * 1024;

export function subscribeBatchedText(
  session: AgentSession,
  append: (text: string) => void,
): () => void {
  let pending = "";
  let frame: number | undefined;

  const flush = () => {
    frame = undefined;
    if (pending.length === 0) return;
    const batch = pending;
    pending = "";
    append(batch);
  };

  const unsubscribe = session.subscribe((event) => {
    if (
      event.type !== "message_update" ||
      event.assistantMessageEvent.type !== "text_delta"
    ) {
      return;
    }

    pending += event.assistantMessageEvent.delta;
    if (pending.length >= FLUSH_THRESHOLD_CHARS) {
      if (frame !== undefined) cancelAnimationFrame(frame);
      flush();
    } else if (frame === undefined) {
      frame = requestAnimationFrame(flush);
    }
  });

  return () => {
    unsubscribe();
    if (frame !== undefined) cancelAnimationFrame(frame);
    flush();
  };
}
```

Một delta có thể vượt quá ngưỡng, còn `flush()` vẫn gọi `append()` đồng bộ. Ngưỡng này kiểm soát kích thước batch trong browser; nó không phải giới hạn cứng cho công việc bất đồng bộ. Với server hoặc worker, thay `requestAnimationFrame` bằng queue có giới hạn và một consumer. Hãy quyết định rõ khi quá tải thì sẽ tạm dừng công việc upstream ở bên ngoài listener, gộp cập nhật UI hay hủy session; không bao giờ để queue tăng mà không có giới hạn.

## 6. Stream model call lồng trong Extension

Extension đã có `ExtensionContext` có thể mở provider stream trực tiếp mà không cần dựng thêm `AgentSession`. Dùng `ctx.modelRegistry.stream()` cho request option riêng của API và `ctx.modelRegistry.streamSimple()` cho option trung lập với provider; cả hai method gọi provider đã cấu hình với authentication đã được resolve tại thời điểm gửi request. Consume `AssistantMessageEventStream` trả về bằng cùng pattern `for await` của Pi AI, rồi await `.result()` khi cần assistant message đầy đủ và usage.

Nested stream đó thuộc Extension. Low-level Pi AI event của nó không tự động được chép vào `AgentSessionEvent` stream của session cha. Chỉ forward UI state mà Extension sở hữu, đồng thời đưa usage của nested call vào custom Tool result khi Tool contract yêu cầu session accounting.

## Các lỗi thường gặp

- **Làm mất event mà không nhận ra:** log event type chưa xử lý trong lúc phát triển. Nhóm event mới của session không nên làm renderer crash.
- **Chỉ render ở cuối:** tích lũy text cuối nếu cần, nhưng vẫn append các chunk `text_delta` ngay lập tức.
- **Coi `agent_end` là idle:** kiểm tra `willRetry`; dùng `agent_settled` hoặc await `prompt()` / `abort()` làm ranh giới cuối.
- **Rò rỉ listener:** giữ hàm unsubscribe. Khi hoàn toàn không dùng session nữa, unsubscribe rồi gọi `session.dispose()`.
- **Giữ subscription của runtime cũ:** flow new, switch, fork, clone và import có thể thay `runtime.session`. Hãy bind lại vào object mới:

```ts title="runtime-binding.ts"
import type {
  AgentSession,
  AgentSessionEventListener,
  AgentSessionRuntime,
} from "@earendil-works/pi-coding-agent";

export async function followRuntime(
  runtime: AgentSessionRuntime,
  listener: AgentSessionEventListener,
): Promise<() => void> {
  let unsubscribe: (() => void) | undefined;

  const bind = async (session: AgentSession) => {
    unsubscribe?.();
    unsubscribe = session.subscribe(listener);
  };

  runtime.setRebindSession(bind);
  await bind(runtime.session);

  return () => {
    runtime.setRebindSession(undefined);
    unsubscribe?.();
  };
}
```

Runtime abort và dispose session cũ trước khi áp dụng session thay thế, rồi gọi callback rebind. Đừng tiếp tục dùng session cũ đã capture.

## Tiếp theo

- [Chương 6: Hệ thống message](../ch06-messages.md) giải thích các kiểu message được event mang theo.
- [Tham chiếu: API event](../reference/api.md#event) liệt kê các nhóm event công khai và field của chúng.
