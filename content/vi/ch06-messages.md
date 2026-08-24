---
title: 'Chương 6: Message qua model layer và agent layer'
description: Message role, content block, custom agent message, bước chuyển đổi và quy tắc lưu trữ trong Pi.
translation_key: ch06-messages
language: vi
chapter: 6
source_url: 'https://www.dgzhuya.com/modules/ch06-messages'
official_refs:
  - 'https://github.com/badlogic/pi-mono/blob/main/packages/ai/src/types.ts'
  - 'https://github.com/badlogic/pi-mono/blob/main/packages/agent/README.md#agentmessage-vs-llm-message'
terms_used:
  - Message
  - AgentMessage
  - ToolCall
  - ToolResultMessage
status: reviewed
last_updated: '2026-08-24'
translator: Pify maintainers
reviewed_by: Pify maintainers
---
Pi dùng một message model không phụ thuộc provider cho LLM request và một message model rộng hơn bên trong agent runtime. Conversion boundary cho phép ứng dụng giữ UI event hoặc domain event trong agent state mà không gửi role không được hỗ trợ tới provider.

## 1. Hai message layer

```text
AgentMessage[]
  -> transformContext()
  -> AgentMessage[]
  -> convertToLlm()
  -> Message[]
  -> provider adapter
```

`Message` thuộc `@earendil-works/pi-ai`. Đây là portable transcript mà provider adapter hiểu.

`AgentMessage` thuộc `@earendil-works/pi-agent-core`. Type này bao gồm Pi AI message và có thể được mở rộng bằng application-specific role.

## 2. Pi AI message role

Model layer định nghĩa ba role:

```typescript
type Message = UserMessage | AssistantMessage | ToolResultMessage;
```

### 2.1 `UserMessage`

```typescript
interface UserMessage {
  role: "user";
  content: string | (TextContent | ImageContent)[];
  timestamp: number;
}
```

Text có thể dùng dạng string ngắn. Multimodal input dùng mảng content block có kiểu.

### 2.2 `AssistantMessage`

Assistant message chứa block `text`, `thinking` và `toolCall`, kèm provider, model, usage, timestamp và stop metadata. `stopReason` nhận một trong các giá trị `pending`, `stop`, `length`, `toolUse`, `error`, `aborted` hoặc `deferred`.

Các field như `responseId`, `thinkingSignature` và `rawStopReason` giữ thông tin cần cho debugging hoặc hội thoại nhiều lượt mà không biến raw provider response thành application state.

### 2.3 `ToolResultMessage`

```typescript
interface ToolResultMessage<TDetails = unknown> {
  role: "toolResult";
  toolCallId: string;
  toolName: string;
  content: (TextContent | ImageContent)[];
  details?: TDetails;
  isError: boolean;
  timestamp: number;
}
```

`toolCallId` phải khớp với `ToolCall.id` ban đầu. Provider adapter phụ thuộc vào liên kết này khi tạo request tiếp theo.

## 3. Content block

Field phân biệt `type` chọn shape của content block:

| Type | Payload chính | Dùng trong |
| --- | --- | --- |
| `text` | `text` | User, assistant, Tool result |
| `image` | base64 `data`, `mimeType` | User, Tool result |
| `thinking` | `thinking`, signature tùy chọn | Assistant |
| `toolCall` | `id`, `name`, `arguments` | Assistant |

Giữ content theo thứ tự khai báo. Đổi thứ tự thinking, text và tool call có thể làm thay đổi provider replay behavior và ý nghĩa người dùng nhìn thấy.

## 4. Custom agent message

Ứng dụng có thể mở rộng `AgentMessage` bằng declaration merging:

```typescript
declare module "@earendil-works/pi-agent-core" {
  interface CustomAgentMessages {
    notification: {
      role: "notification";
      text: string;
      timestamp: number;
    };
  }
}
```

Custom role này có thể nằm trong agent state và điều khiển UI. Provider vẫn không hiểu role đó, nên `convertToLlm` phải lọc bỏ hoặc chuyển đổi nó.

## 5. Transform và convert

Hai hook có trách nhiệm riêng:

### 5.1 `transformContext`

Hook này trả `AgentMessage[]`. Dùng nó để compact history, chèn retrieved context hoặc loại message không nên tham gia model call tiếp theo. Hook có thể chạy async.

### 5.2 `convertToLlm`

Hook này trả Pi AI `Message[]`. Đây là type boundary cuối trước model transport:

```typescript
const agent = new Agent({
  streamFn: models.streamSimple.bind(models),
  convertToLlm: (messages) =>
    messages.flatMap((message) =>
      message.role === "notification" ? [] : [message],
    ),
});
```

Không để custom role trong mảng trả về rồi phụ thuộc provider adapter tự bỏ qua. Mỗi adapter chỉ nên nhận shared contract của model layer.

## 6. Provider conversion

Provider adapter ánh xạ normalized message sang từng wire format. Khác biệt bao gồm:

- cách biểu diễn system instruction;
- Tool result dùng role riêng hay content block;
- cách replay reasoning signature và response ID;
- cách encode image và cache-control metadata;
- block rỗng hoặc không hợp lệ nào phải bị loại bỏ.

Conversion này thuộc Pi AI. Agent code không nên branch theo message shape của Anthropic, OpenAI hoặc Google.

## 7. Identity, thời gian và opaque metadata

Ba quy tắc bảo vệ tính toàn vẹn của transcript:

1. Giữ `ToolCall.id` qua bước execution và đưa vào `toolCallId`.
2. Giữ timestamp theo Unix millisecond khi sao chép hoặc tạo message.
3. Xem provider signature và response ID là opaque; lưu và replay nguyên trạng trừ khi adapter sở hữu chúng công bố format.

Không dịch role name, content `type`, stop reason, provider ID, model ID hoặc JSON key.

## 8. Lưu trữ

Chỉ persist message hoàn chỉnh tại state boundary ổn định. Partial assistant message trong lúc streaming hữu ích cho UI nhưng không nên thay transcript entry đã settle gần nhất.

Khi run thất bại, hãy lưu normalized assistant outcome nếu runtime tạo outcome đó. `stopReason`, `errorMessage`, diagnostics và usage giải thích sự cố mà không cần raw provider log.

Custom application message cần serialization và migration policy rõ ràng. Declaration merging chỉ bổ sung TypeScript support; nó không tự động làm custom role bền vững qua nhiều version.

## 9. Checklist kiểm tra

Trước khi gửi hoặc lưu transcript, xác nhận:

- mọi message có role và timestamp hợp lệ;
- mỗi content block khớp với discriminant;
- mọi Tool result tham chiếu một Tool call tồn tại;
- custom agent role được loại hoặc chuyển đổi trước provider boundary;
- không còn secret hoặc raw payload không cần thiết;
- thứ tự message không bị thay đổi.

[Chương 7](ch07-event-driven.md) giải thích cách runtime báo thay đổi message và Tool state mà không coupling vòng lặp với UI.
