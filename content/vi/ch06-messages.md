---
title: "Chương 6: Message qua các ranh giới giữa model, Agent và session"
description: Cách Pi biểu diễn message dành cho model, mở rộng AgentMessage, dựng lại session entry và chuyển đổi context trước mỗi lời gọi provider.
translation_key: ch06-messages
language: vi
chapter: 6
source_url: "https://www.dgzhuya.com/modules/ch06-messages"
official_refs:
  - "https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/ai/src/types.ts"
  - "https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/agent/src/types.ts"
  - "https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/agent/src/agent-loop.ts"
  - "https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/coding-agent/src/core/messages.ts"
  - "https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/coding-agent/src/core/session-manager.ts"
terms_used:
  - Message
  - AgentMessage
  - SessionEntry
  - ToolCall
  - ToolResultMessage
status: reviewed
last_updated: "2026-08-24"
translator: Pify maintainers
reviewed_by: Pify maintainers
---

Chương 5 kết thúc bằng một `ToolResultMessage`: model yêu cầu dùng Tool, Agent core xác thực rồi thực thi Tool, sau đó đưa kết quả trở lại hội thoại. Trong lời giải thích ấy, từ _message_ xuất hiện ở nhiều ranh giới khác nhau. Yêu cầu gửi tới provider, transcript đang chạy của Agent, giao diện terminal của Coding Agent và session JSONL được khôi phục không dùng chung một dạng biểu diễn cho mọi việc.

Chương này theo dõi một lệnh Bash qua các ranh giới đó. Luồng đi cho thấy một cách thiết kế có thể áp dụng ở nơi khác: giữ dạng dữ liệu nguồn giàu thông tin nhất mà ứng dụng cần, rồi chỉ tạo dạng hẹp hơn dành cho model ngay trước khi gọi. Pi `0.84.2` hiện thực cách làm này bằng `Message`, `AgentMessage` có thể mở rộng, các bản ghi `SessionEntry` của Coding Agent, `transformContext` và `convertToLlm`.

## 1. Mở đầu: theo dõi một Bash message

Giả sử người dùng nhập `!ls -la` trong terminal của Coding Agent. Lệnh này không đi qua giao thức Tool của model. Coding Agent thực thi nó như một thao tác của sản phẩm rồi tạo `BashExecutionMessage` có cấu trúc trong `packages/coding-agent/src/core/messages.ts`:

```typescript
interface BashExecutionMessage {
  role: "bashExecution";
  command: string;
  output: string;
  exitCode: number | undefined;
  cancelled: boolean;
  truncated: boolean;
  fullOutputPath?: string;
  timestamp: number;
  excludeFromContext?: boolean;
}
```

TUI có thể hiển thị riêng `command`, `output`, trạng thái hủy, trạng thái cắt bớt và mã thoát. Lớp session có thể lưu các trường đó rồi khôi phục đúng message có cấu trúc sau khi tiến trình khởi động lại. Tuy nhiên, model provider không chấp nhận role tùy chỉnh `"bashExecution"`. Trước lời gọi kế tiếp, Coding Agent chuyển bản ghi này thành một message `user`, hoặc lọc nó nếu `excludeFromContext` là true.

Đây là phép chiếu dữ liệu. Đối tượng có cấu trúc vẫn nằm trong trạng thái Agent và, nếu bật lưu trữ, trong một session message entry. Chỉ model context dành cho lời gọi hiện tại nhận bản đã làm phẳng. Muốn theo dõi bản sao đó, ta cần đi qua ba ranh giới:

```text
Coding Agent session entries
  -> reconstructed AgentMessage[]
  -> transformContext()          // AgentMessage[] -> AgentMessage[]
  -> convertToLlm()              // AgentMessage[] -> Message[]
  -> Pi AI provider conversion   // Message[] -> provider wire payload
```

## 2. Lớp một: `Message` hướng tới provider

`@earendil-works/pi-ai` sở hữu contract đã chuẩn hóa ở lớp model. Union `Message` có ba role:

```typescript
export type Message = UserMessage | AssistantMessage | ToolResultMessage;
```

“Hướng tới provider” không có nghĩa là “giống hệt đối tượng request của Anthropic, OpenAI hay Google”. Mọi phần triển khai API trong Pi AI đều nhận cùng một `Context.messages: Message[]`. Sau đó, phần triển khai API đã chọn mới tuần tự hóa mảng này sang wire format của provider, kể cả các quy tắc riêng về Tool result, phát lại reasoning, hình ảnh, block rỗng và thứ tự role.

### Cấu trúc chính xác của message và content

Interface hoàn chỉnh sau lấy từ `packages/ai/src/types.ts` tại commit được ghim `a470b121` và cho thấy cấu trúc phía người dùng:

```typescript
export interface UserMessage {
  role: "user";
  content: string | (TextContent | ImageContent)[];
  timestamp: number;
}
```

Chuỗi là dạng rút gọn cho văn bản. Dạng mảng có thể xen kẽ `TextContent` và `ImageContent`. `timestamp` là Unix timestamp tính bằng mili giây; đây là metadata của ứng dụng, không phải cam kết rằng mọi API từ xa đều truyền thời gian này.

Content của assistant dùng ba loại block. Đoạn trích bám sát source sau là toàn bộ định nghĩa, chỉ bỏ phần chú thích:

```typescript
export interface TextContent {
  type: "text";
  text: string;
  textSignature?: string;
}

export interface ThinkingContent {
  type: "thinking";
  thinking: string;
  thinkingSignature?: string;
  redacted?: boolean;
}

export interface ToolCall {
  type: "toolCall";
  id: string;
  name: string;
  arguments: Record<string, any>;
  thoughtSignature?: string;
  namespace?: string;
}
```

Các discriminant chính xác là `"text"`, `"thinking"`, `"image"` và `"toolCall"`; kiểu dùng chung của Pi không có block `"tool_use"`, `"reasoning"` hay `"tool_call"`. Vị trí hợp lệ của từng loại cũng khác nhau:

| Loại content                          | Các trường chính                                           | Có thể nằm trong content của message dùng chung |
| ------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------- |
| `TextContent`, `type: "text"`         | `text`, `textSignature` tùy chọn                           | User, assistant, Tool result                    |
| `ThinkingContent`, `type: "thinking"` | `thinking`, `thinkingSignature` và `redacted` tùy chọn     | Chỉ assistant                                   |
| `ImageContent`, `type: "image"`       | `data` dạng base64, `mimeType`                             | User và Tool result                             |
| `ToolCall`, `type: "toolCall"`        | `id`, `name`, `arguments`, signature và namespace tùy chọn | Chỉ assistant                                   |

`AssistantMessage` chứa cả content theo đúng thứ tự và kết quả đã chuẩn hóa của lượt provider. Đoạn trích bám sát source dưới đây lấy từ cùng tệp, bỏ phần chú thích nhưng giữ đủ mọi trường:

```typescript
export interface AssistantMessage {
  role: "assistant";
  content: (TextContent | ThinkingContent | ToolCall)[];
  api: Api;
  provider: ProviderId;
  model: string;
  responseModel?: string;
  responseId?: string;
  diagnostics?: AssistantMessageDiagnostic[];
  usage: Usage;
  stopReason: StopReason;
  deferred?: DeferredHandle;
  errorMessage?: string;
  rawStopReason?: string;
  endTurn?: boolean;
  timestamp: number;
}
```

`stopReason` nhận chính xác `"pending" | "stop" | "length" | "toolUse" | "error" | "aborted" | "deferred"`. Message tạm trong khi stream bắt đầu với `"pending"`; message đã chốt sẽ thay nó trong trạng thái Agent. Lỗi provider hoặc runtime trả qua giao thức stream kết thúc bằng `"error"` hoặc `"aborted"` cùng `errorMessage`. Phản hồi bị hoãn cũng mang một `DeferredHandle` khi provider hỗ trợ hoàn tất về sau.

Các giá trị dùng để duy trì ngữ cảnh giữa nhiều lượt phải được giữ nguyên. `textSignature`, `thinkingSignature`, `thoughtSignature` và `responseId` có thể mã hóa trạng thái của provider mà lượt sau cần phát lại. Code ứng dụng không nên phân tích hay dịch chúng, trừ khi phần triển khai Pi AI sở hữu giá trị đó có tài liệu về format. Thứ tự content cũng quan trọng vì cùng lý do: đưa Tool call lên trước reasoning hoặc text có thể làm thay đổi cả dữ liệu phát lại cho provider lẫn nội dung UI hiển thị.

Tool result khép lại liên kết định danh do `ToolCall.id` tạo ra. Đây là interface hoàn chỉnh hiện tại, chỉ bỏ phần chú thích:

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

`toolCallId` phải khớp với `ToolCall.id` đã tạo yêu cầu. `details` vẫn phục vụ runtime và UI, còn encoder của provider dựng Tool result từ content và các trường liên kết. `usage` có thể ghi lượng tài nguyên do chính Tool dùng. `addedToolNames` đánh dấu những Tool bắt đầu khả dụng tại vị trí này trong transcript; provider có cơ chế nạp Tool trễ dùng trường đó, còn provider khác bỏ qua.

### Một lượt trao đổi Tool hoàn chỉnh

Ba role tạo thành một chuỗi nhân quả. Mảng có thể sao chép sau dùng đủ các trường bắt buộc thay vì thay metadata của provider bằng dấu ba chấm:

```typescript
import type { Message } from "@earendil-works/pi-ai";

const zeroUsage = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

export const exchange: Message[] = [
  { role: "user", content: "Read auth.ts", timestamp: 1_748_568_000_000 },
  {
    role: "assistant",
    content: [
      { type: "text", text: "I will inspect that file." },
      {
        type: "toolCall",
        id: "call_read_001",
        name: "read",
        arguments: { path: "auth.ts" },
      },
    ],
    api: "anthropic-messages",
    provider: "anthropic",
    model: "claude-sonnet-4-6",
    usage: zeroUsage,
    stopReason: "toolUse",
    timestamp: 1_748_568_000_100,
  },
  {
    role: "toolResult",
    toolCallId: "call_read_001",
    toolName: "read",
    content: [{ type: "text", text: "export function authorize() {}" }],
    isError: false,
    timestamp: 1_748_568_000_200,
  },
];
```

Assistant có thể đặt text, thinking và nhiều Tool call trong cùng một mảng content có thứ tự. Agent core có thể thực thi một lô Tool song song, nhưng các message `toolResult` cuối vẫn theo thứ tự Tool call trong assistant. Thứ tự ổn định này giữ đúng từng cặp lời gọi/kết quả ngay cả khi sự kiện hoàn tất đến theo thứ tự khác.

## 3. Agent cần message giàu thông tin hơn

Một sản phẩm Agent còn có những bên đọc dữ liệu khác ngoài provider. Terminal cần lệnh, output, trạng thái và thông tin cắt bớt. Bộ nén context cần một bản ghi tóm tắt có cấu trúc. Thao tác chuyển nhánh cần nhớ điểm xuất phát. Extension có thể cần dữ liệu được lưu lâu dài nhưng không bao giờ đi vào prompt.

Nếu làm phẳng tất cả thành `UserMessage.content` ngay lúc tạo, lời gọi model sẽ thuận tiện nhưng mọi bên đọc về sau mất dữ liệu. UI sau khi khôi phục session không thể lấy lại exit code ban đầu hoặc chọn cách hiển thị summary. Nếu chỉ giữ đối tượng tùy chỉnh thì lại không thể gọi model, vì Pi AI chỉ chấp nhận ba role dùng chung.

Vì vậy, Pi giữ message runtime giàu thông tin hơn rồi chỉ chiếu sang dạng hẹp ở cuối. Trong Coding Agent `0.84.2`, `packages/coding-agent/src/core/messages.ts` khai báo bốn role của ứng dụng:

```text
AgentMessage
├─ Message from @earendil-works/pi-ai
│  ├─ user
│  ├─ assistant
│  └─ toolResult
└─ Coding Agent additions
   ├─ bashExecution
   ├─ custom
   ├─ branchSummary
   └─ compactionSummary
```

Bốn role này mô tả Coding Agent hiện tại, không phải giới hạn cố định của `AgentMessage`. Ứng dụng khác có thể thêm role khác. Ngay trong Coding Agent cũng có các loại session entry chỉ dành cho lưu trữ, hoàn toàn không phải message. Vì thế, “bảy loại message” chỉ là ảnh chụp hữu ích của package augmentation hiện tại, không phải định nghĩa của lớp Agent.

Custom role mang lại ba khả năng độc lập. Thứ nhất, UI có thể phân nhánh theo `role` để hiển thị từng trường có cấu trúc. Thứ hai, sản phẩm có thể quy định cách tuần tự hóa và nâng cấp dữ liệu rõ ràng. Thứ ba, `convertToLlm` có thể chuyển đổi hoặc bỏ từng role mà không sửa đối tượng đang lưu. Declaration merging chỉ đưa type vào bước biên dịch; nó không tự triển khai bất kỳ chính sách runtime nào trong ba phần trên.

## 4. Lớp hai: `AgentMessage` và khe mở rộng

`@earendil-works/pi-agent-core` sở hữu kiểu transcript đang chạy. Trạng thái của nó công khai `messages: AgentMessage[]`; prompt, steering message, follow-up message, kết quả của vòng lặp và sự kiện message đều dùng union này.

### Kiểu union `AgentMessage`

Định nghĩa trong `packages/agent/src/types.ts` chỉ có một dòng:

```typescript
export type AgentMessage =
  Message | CustomAgentMessages[keyof CustomAgentMessages];
```

Indexed access đưa giá trị của mọi thuộc tính đã đăng ký trên `CustomAgentMessages` vào union. Message chuẩn đi qua vì `Message` vốn đã là một nhánh. Custom message cần discriminant riêng, thường là `role`, để transform, converter, bên đăng ký sự kiện và renderer có thể thu hẹp kiểu an toàn.

Package lõi phụ thuộc vào Pi AI, nhưng không phụ thuộc Coding Agent hay một ứng dụng sử dụng cụ thể. Hướng phụ thuộc này cho phép Agent tổng quát hoạt động mà không cần lệnh terminal, thẻ compaction, branch summary hay session manager.

### `CustomAgentMessages` mặc định là interface rỗng

Khe mở rộng không chứa role dựng sẵn nào:

```typescript
export interface CustomAgentMessages {
  // Empty by default - apps extend via declaration merging
}
```

Interface rỗng cho phép phía sử dụng mở rộng package mà không sửa package đó. Điều này cũng có nghĩa là chỉ import Agent core sẽ không tự thêm bốn role của Coding Agent. Chính `core/messages.ts` trong Coding Agent thực hiện augmentation ấy như một phần triển khai của ứng dụng.

Cơ chế này có một giới hạn rõ ràng. TypeScript declaration merging biến mất ở runtime. Nó không xác thực JSON đã deserialize, cũng không đăng ký converter, renderer hay persistence adapter. Một custom role chỉ hoàn chỉnh khi ứng dụng quy định hành vi tại từng ranh giới runtime đó.

### Declaration merging bổ sung role của ứng dụng với type safety

Ví dụ có thể sao chép sau đăng ký một thông báo UI không được đưa vào model context:

```typescript
import type { AgentMessage } from "@earendil-works/pi-agent-core";

export interface NotificationMessage {
  role: "notification";
  text: string;
  level: "info" | "warning";
  timestamp: number;
}

declare module "@earendil-works/pi-agent-core" {
  interface CustomAgentMessages {
    notification: NotificationMessage;
  }
}

export const reconnecting: AgentMessage = {
  role: "notification",
  text: "Reconnecting to the provider",
  level: "warning",
  timestamp: Date.now(),
};
```

Kế thừa sẽ buộc hệ thống phân cấp class của ứng dụng dính vào một union gồm các đối tượng dữ liệu thuần. Truyền message generic qua mọi API của Agent sẽ làm rộng nhiều chữ ký vốn không cần biết gì về ứng dụng. Declaration merging giữ phụ thuộc một chiều và vẫn cho phép thu hẹp kiểu đầy đủ trong phạm vi biên dịch của ứng dụng.

Package augmentation có hiệu lực trong toàn bộ lần biên dịch. Hai thư viện đăng ký cùng một property key với kiểu không tương thích sẽ xung đột. Vì thế, package công khai custom message nên chọn key ổn định, có namespace nếu dễ đụng tên. Giá trị `role` tại runtime cũng cần ổn định qua các phiên bản dữ liệu đã lưu.

## 5. Ranh giới chuyển đổi: `convertToLlm`

Agent core không dạy provider adapter cách xử lý role tùy ý của ứng dụng. Ngay trước mỗi lời gọi model, nó yêu cầu ứng dụng trả về Pi AI `Message[]`. Tại đây, custom message trở thành văn bản model đọc được hoặc bị loại khỏi lời gọi đó.

### Thời điểm chuyển đổi và đường đi của lỗi

`AgentLoopConfig.convertToLlm` là trường bắt buộc và chấp nhận kết quả đồng bộ hoặc bất đồng bộ. `AgentOptions.convertToLlm` là tùy chọn vì class `Agent` có converter mặc định chỉ giữ `user`, `assistant` và `toolResult`. Mặc định này an toàn với role chỉ dành cho UI, nhưng đồng thời khiến custom role vô hình với model nếu ứng dụng không cung cấp phép chuyển đổi.

Contract cấp thấp quy định `convertToLlm` không được throw hay reject. Hàm cần trả về fallback an toàn, thường là những message chuẩn mà nó xác định chắc chắn hợp lệ. Nếu ném lỗi, hàm sẽ ngắt Agent Loop cấp thấp trước khi vòng lặp tạo được chuỗi sự kiện provider bình thường.

Ở lớp cao hơn, class `Agent` bắt lỗi của lượt chạy rồi phát một assistant message báo lỗi đã chuẩn hóa với `stopReason: "error"` hoặc `"aborted"`, tiếp theo là `message_start`, `message_end`, `turn_end` và `agent_end`. Bên gọi trực tiếp `runAgentLoop()` cấp thấp nhận promise bị reject. Lỗi request, model hoặc runtime của provider tuân theo contract khác: sau khi được gọi, `StreamFunction` phải mã hóa chúng trong event stream và `AssistantMessage` cuối, thay vì ném ra ngoài.

### Quy tắc chuyển đổi của Coding Agent

Coding Agent export `convertToLlm` từ `@earendil-works/pi-coding-agent`; các định nghĩa role và helper định dạng nằm trong `core/messages.ts` nội bộ. SDK của package bọc converter này để thay hình ảnh nếu bật setting `blockImages`. Code sử dụng package nên import root export, không deep-import các interface message nội bộ.

Tại commit đã ghim, converter nền của Coding Agent áp dụng các quy tắc sau:

| Role đầu vào                      | Kết quả trong model context                                                                      |
| --------------------------------- | ------------------------------------------------------------------------------------------------ |
| `user`, `assistant`, `toolResult` | Truyền nguyên đối tượng `Message`                                                                |
| `bashExecution`                   | Bỏ nếu có `excludeFromContext`; nếu không, tạo một `UserMessage` chứa output lệnh đã định dạng   |
| `custom`                          | Một `UserMessage`; content dạng chuỗi thành một `TextContent`, content dạng mảng được giữ nguyên |
| `branchSummary`                   | Một `UserMessage` gồm `BRANCH_SUMMARY_PREFIX`, summary và thẻ đóng `</summary>`                  |
| `compactionSummary`               | Một `UserMessage` gồm `COMPACTION_SUMMARY_PREFIX`, summary và thẻ đóng `</summary>`              |

Đoạn trích bám sát source dưới đây lấy từ `packages/coding-agent/src/core/messages.ts` và giữ đủ mọi nhánh role đã được mô tả; nó chỉ bỏ bước kiểm tra tính đầy đủ ở nhánh `default` phòng vệ và rút gọn cách trình bày object:

```typescript
export function convertToLlm(messages: AgentMessage[]): Message[] {
  return messages
    .map((m): Message | undefined => {
      switch (m.role) {
        case "bashExecution":
          if (m.excludeFromContext) return undefined;
          return {
            role: "user",
            content: [{ type: "text", text: bashExecutionToText(m) }],
            timestamp: m.timestamp,
          };
        case "custom":
          return {
            role: "user",
            content:
              typeof m.content === "string"
                ? [{ type: "text", text: m.content }]
                : m.content,
            timestamp: m.timestamp,
          };
        case "branchSummary":
          return {
            role: "user",
            content: [
              {
                type: "text",
                text: BRANCH_SUMMARY_PREFIX + m.summary + BRANCH_SUMMARY_SUFFIX,
              },
            ],
            timestamp: m.timestamp,
          };
        case "compactionSummary":
          return {
            role: "user",
            content: [
              {
                type: "text",
                text:
                  COMPACTION_SUMMARY_PREFIX +
                  m.summary +
                  COMPACTION_SUMMARY_SUFFIX,
              },
            ],
            timestamp: m.timestamp,
          };
        case "user":
        case "assistant":
        case "toolResult":
          return m;
      }
    })
    .filter((m) => m !== undefined);
}
```

Quy tắc cũ “mọi custom message đều thành User” mô tả converter cụ thể này của Coding Agent, không phải contract của Agent core. Ứng dụng có thể lọc một role, chuyển nó thành nhiều message dùng chung hoặc gộp với context lân cận. Kết quả vẫn chỉ được chứa thành viên của `Message` và phải giữ các ràng buộc thứ tự cần thiết cho hội thoại của provider.

### Bản ghi Bash trước và sau khi chuyển đổi

Bản ghi phía ứng dụng giữ những trường mà terminal và session có thể dùng:

```json
{
  "role": "bashExecution",
  "command": "ls -la",
  "output": "total 32\ndrwxr-xr-x 5 user staff 160 .",
  "exitCode": 0,
  "cancelled": false,
  "truncated": false,
  "timestamp": 1748568000000
}
```

Phép chiếu dành cho model context là một user message chuẩn:

````json
{
  "role": "user",
  "content": [
    {
      "type": "text",
      "text": "Ran `ls -la`\n```\ntotal 32\ndrwxr-xr-x 5 user staff 160 .\n```"
    }
  ],
  "timestamp": 1748568000000
}
````

`bashExecutionToText()` còn ghi `(command cancelled)` khi lệnh bị hủy, một câu báo exit code khác 0 và đường dẫn tới output đầy đủ nếu bản ghi bị cắt có lưu đường dẫn. Các dữ kiện này trở thành văn bản trong bản dành cho model; chúng vẫn là trường có kiểu trong message gốc. Phép chuyển đổi không sửa hay thay đối tượng gốc.

## 6. Xử lý hai giai đoạn: `transformContext` trước `convertToLlm`

Hai hook của Agent giải quyết hai phần việc khác nhau. `transformContext` làm việc trong kiểu giàu thông tin và trả `AgentMessage[]`; `convertToLlm` đi qua ranh giới sang union đóng của lớp model rồi trả `Message[]`.

Thứ tự thực thi nằm ngay trong `streamAssistantResponse()` ở `packages/agent/src/agent-loop.ts`. Đoạn trích bám sát source sau lấy tại commit đã ghim:

```typescript
let messages = context.messages;
if (config.transformContext) {
  messages = await config.transformContext(messages, signal);
}

const llmMessages = await config.convertToLlm(messages);

const llmContext: Context = {
  systemPrompt: context.systemPrompt,
  messages: llmMessages,
  tools: context.tools,
};

const response = await streamFunction(config.model, llmContext, {
  ...config,
  apiKey: resolvedApiKey,
  signal,
});
```

`transformContext` là tùy chọn và chữ ký public của nó trả `Promise<AgentMessage[]>`; vòng lặp luôn `await` hook này. Nó có thể cắt history, chèn context truy xuất từ nguồn khác hoặc áp dụng chính sách context của ứng dụng trong lúc các trường tùy chỉnh vẫn còn nguyên. Contract yêu cầu trả message ban đầu hoặc một fallback an toàn khác thay vì reject.

Coding Agent dùng hook này cho các Extension handler của sự kiện `context`. `ExtensionRunner.emitContext()` bắt đầu từ một structured clone, chờ từng handler theo thứ tự đăng ký, đưa mảng `messages` mà handler trả về cho handler tiếp theo, đồng thời bắt lỗi riêng của từng extension để phần còn lại của pipeline tiếp tục. Compaction của Coding Agent thuộc bước dựng lại session: `CompactionEntry` quyết định những entry lịch sử nào trở thành transcript runtime tiếp theo trước khi hook này chạy.

`convertToLlm` cũng có thể chạy bất đồng bộ, và vòng lặp chờ nó sau bước transform. Tại đó, ứng dụng quyết định khả năng hiển thị đối với model và thực hiện phép đổi role có mất dữ liệu. Việc chọn provider diễn ra sau nữa. Khi đổi từ Anthropic sang OpenAI, converter cho role của ứng dụng không cần thay đổi vì Pi AI sở hữu bước chuyển `Message[]` sang wire format.

Việc tách hai giai đoạn giữ chính sách ở đúng package. Có thể đổi cách chọn context mà không viết lại cách định dạng custom role. Có thể đổi role của ứng dụng mà không đưa compaction hay truy xuất dữ liệu vào code provider. Adapter của provider cũng có thể thay đổi mà không cần biết role chỉ dành cho terminal.

## 7. Phạm vi hiển thị, lọc và ranh giới session

Khả năng hiển thị không phải một cờ dùng chung cho model, TUI và lưu trữ. Mỗi ranh giới tự đưa ra quyết định. Một role có thể được lưu nhưng không xuất hiện trong runtime context, có trong runtime context nhưng bị lọc khỏi model, hoặc được gửi tới model trong khi TUI không hiển thị.

### `excludeFromContext` lọc Bash output tại ranh giới model cuối

Terminal tương tác ánh xạ `!command` thành bản ghi Bash thông thường và `!!command` thành bản ghi có `excludeFromContext: true`. Converter thực hiện bước lọc:

```typescript
case "bashExecution":
  if (m.excludeFromContext) {
    return undefined;
  }
  return {
    role: "user",
    content: [{ type: "text", text: bashExecutionToText(m) }],
    timestamp: m.timestamp,
  };
```

Sau khi được chèn, message nằm trong `agent.state.messages`, được hiển thị như một lượt chạy Bash và được `SessionManager.appendMessage()` lưu nếu session có persistence. Coding Agent chèn và lưu ngay khi không có lượt Agent nào đang chạy. Nếu lệnh hoàn tất trong lúc Agent đang stream, `recordBashResult()` đưa nó vào `_pendingBashMessages`. Listener `agent_end` không flush hàng đợi này. Trước hết, `_runAgentPrompt()` chờ `agent.prompt()` và mọi lượt chạy tiếp nối sau đó; chỉ tới khối `finally`, sau khi lượt Agent cuối đã kết thúc và phát `agent_end`, hàm mới gọi `_flushPendingBashMessages()` để chèn và lưu các bản ghi đang chờ. Ranh giới này ngăn thao tác của sản phẩm chen giữa thứ tự assistant Tool-call/Tool-result mà provider yêu cầu.

Lọc khỏi model context không tự tạo ranh giới bảo mật. Output vẫn có thể xuất hiện trên màn hình và trong tệp JSONL của session; extension cũng có thể quan sát sự kiện của sản phẩm. Không đưa secret vào message chỉ vì `convertToLlm` sẽ bỏ message đó.

### Model, TUI và lưu trữ có chính sách riêng

Hành vi hiện tại của Coding Agent cho thấy rõ sự tách biệt:

| Bản ghi                                                | Agent/runtime context                         | Model sau chuyển đổi | Hội thoại trên TUI                  | Session được lưu                                  |
| ------------------------------------------------------ | --------------------------------------------- | -------------------- | ----------------------------------- | ------------------------------------------------- |
| `Message` chuẩn                                        | Có                                            | Có                   | Có                                  | `SessionMessageEntry` sau sự kiện message đã chốt |
| `BashExecutionMessage` thông thường                    | Có; nếu đang chờ thì sau bước flush cuối lượt | Một `UserMessage`    | Có                                  | `SessionMessageEntry` tại cùng ranh giới chèn     |
| Bash có `excludeFromContext`                           | Có; nếu đang chờ thì sau bước flush cuối lượt | Không                | Có                                  | `SessionMessageEntry` tại cùng ranh giới chèn     |
| `CustomMessage`, `display: true`                       | Có                                            | Một `UserMessage`    | Có, với cách hiển thị riêng         | `CustomMessageEntry`                              |
| `CustomMessage`, `display: false`                      | Có                                            | Một `UserMessage`    | Ẩn                                  | `CustomMessageEntry`                              |
| Extension `CustomEntry` từ `pi.appendEntry()`          | Không tạo message                             | Không                | Không có message hội thoại mặc định | `CustomEntry` dành cho trạng thái extension       |
| Branch hoặc compaction entry trên nhánh đang hoạt động | Dựng lại thành summary message                | Một `UserMessage`    | Hiển thị summary theo sản phẩm      | `BranchSummaryEntry` hoặc `CompactionEntry`       |

`display: false` không có nghĩa là “loại khỏi model”. Cờ này ẩn `CustomMessage` của Coding Agent trên TUI, trong khi `buildSessionContext()` vẫn dựng lại message và `convertToLlm()` vẫn chuyển nó thành content `user`. Dùng `pi.appendEntry()` cho trạng thái extension cần lưu nhưng không đi vào model context. Với ứng dụng tự sở hữu runtime, có thể định nghĩa một custom `AgentMessage` rõ ràng rồi lọc nó trong converter.

Phần lưu trữ session dùng schema khác cả hai message union. Khi bật persistence, `SessionManager` lưu một cây `SessionEntry` dạng append-only trong JSONL. Mọi entry có `id`, `parentId` và timestamp dạng ISO. Message entry bọc một `AgentMessage`; compaction, branch summary, đổi model, đổi thinking level, label, thông tin session, trạng thái tùy chỉnh và custom message đều có cấu trúc riêng.

Khi resume, `buildSessionContext()` chọn đường đi từ gốc tới leaf đang hoạt động, áp dụng ranh giới compaction mới nhất, dựng lại runtime message, đồng thời khôi phục model và thinking level riêng. Đoạn trích bám sát source sau từ `packages/coding-agent/src/core/session-manager.ts` cho thấy phép chiếu thành message:

```typescript
export function sessionEntryToContextMessages(
  entry: SessionEntry,
): AgentMessage[] {
  if (entry.type === "message") return [entry.message];
  if (entry.type === "custom_message") {
    return [
      createCustomMessage(
        entry.customType,
        entry.content ?? [],
        entry.display,
        entry.details,
        entry.timestamp,
      ),
    ];
  }
  if (entry.type === "branch_summary" && entry.summary) {
    return [
      createBranchSummaryMessage(entry.summary, entry.fromId, entry.timestamp),
    ];
  }
  if (entry.type === "compaction") {
    return [
      createCompactionSummaryMessage(
        entry.summary,
        entry.tokensBefore,
        entry.timestamp,
      ),
    ];
  }
  return [];
}
```

Hàm thật còn chuẩn hóa `content` bị thiếu trong message chuẩn cũ, message từ fork hoặc tệp bị sửa thủ công thành mảng rỗng. `SessionManager`, `buildSessionContext`, `buildContextEntries` và `sessionEntryToContextMessages` đều được export công khai từ package root của `@earendil-works/pi-coding-agent`. Các lời gọi lưu `message_end`, trì hoãn chèn Bash và gán message đã dựng lại vào trạng thái Agent là code tích hợp nội bộ của Coding Agent, không phải hành vi do declaration merging hay Agent core tự cung cấp.

Chỉ lưu message đã chốt, không lưu snapshot tạm của stream. Trong lúc stream, `agent.state.streamingMessage` công khai đối tượng assistant tạm để UI cập nhật. Agent core thay đối tượng tạm bằng `AssistantMessage` cuối trước `message_end`; Coding Agent lưu tại `message_end`. Message cuối giữ `stopReason`, `errorMessage`, usage, diagnostics, ID và signature cần để giải thích rồi tiếp tục session.

## 8. Luồng dữ liệu đầy đủ: từ thao tác người dùng tới provider payload rồi quay lại

Đường đi trực tiếp và đường resume gặp nhau tại `AgentMessage[]`. Mã giả: sơ đồ này dùng đúng tên type và method hiện tại, nhưng bỏ qua bên đăng ký sự kiện, chính sách retry, chi tiết lô Tool và các trường payload riêng của provider.

```text
LIVE INPUT
  user enters !ls -la
    -> Coding Agent executes Bash
    -> BashExecutionMessage
    -> if no Agent run is active:
         insert into agent.state.messages
         persist with SessionManager.appendMessage()
    -> if the Agent is streaming:
         queue in _pendingBashMessages
         -> final Agent run settles and emits agent_end
         -> _runAgentPrompt() finally calls _flushPendingBashMessages()
         -> insert into agent.state.messages and persist

RESUME INPUT
  JSONL SessionEntry tree
    -> active root-to-leaf path
    -> latest compaction boundary
    -> sessionEntryToContextMessages()
    -> agent.state.messages: AgentMessage[]

EACH MODEL CALL
  snapshot Agent context
    -> await transformContext(messages, signal)
       AgentMessage[] -> AgentMessage[]
    -> await convertToLlm(messages)
       BashExecutionMessage -> UserMessage, or filter
       branch/compaction/custom -> UserMessage
       standard Message -> pass through
    -> Context { systemPrompt, messages: Message[], tools }
    -> streamFunction(model, context, options)
    -> Pi AI API implementation converts Message[] to provider wire data
    -> provider stream becomes one settled AssistantMessage
    -> optional ToolCall batch becomes ordered ToolResultMessage[]
    -> message_end persistence
    -> next turn repeats conversion from the rich runtime transcript
```

Mỗi mũi tên có một chủ sở hữu. Coding Agent sở hữu bản ghi terminal, session entry và converter cụ thể. Agent core sở hữu thứ tự Agent Loop và union runtime có thể mở rộng. Pi AI sở hữu kiểu message/content đã chuẩn hóa cùng bước tuần tự hóa cho provider. Chuyển một trách nhiệm qua sai ranh giới package thường tạo phụ thuộc ngược chiều.

Luồng này cũng xác định đường đi của lỗi. Việc phân tích và dựng lại session xảy ra trước lượt chạy Agent. Hook context và conversion phải trả fallback thay vì reject. Class `Agent` chuẩn hóa lỗi bất ngờ của lượt chạy thành kết quả assistant, còn bên gọi cấp thấp nhận lỗi trực tiếp. Sau khi provider stream đã tồn tại, lỗi provider thuộc về event và assistant message cuối của stream. Listener persistence sau đó có thể ghi đúng kết quả đã chốt mà UI vừa quan sát.

Trước khi chấp nhận một luồng custom message, hãy kiểm tra các bất biến sau:

1. Mọi role và content block dùng chung đều dùng đúng discriminant và đủ trường bắt buộc.
2. Mọi Tool result giữ call ID và đứng sau assistant request đã tạo ra nó.
3. Context transformation để lại `AgentMessage[]` hợp lệ; conversion chỉ trả `Message[]`.
4. Bước lọc không làm các message còn lại đổi thứ tự thành một hội thoại không hợp lệ.
5. Phạm vi hiển thị trên UI, với model và trong phần lưu trữ được rà soát riêng.
6. Dữ liệu tùy chỉnh đã lưu có chính sách phiên bản và chuyển đổi; trường provider cần giữ nguyên không bị sửa.
7. Trạng thái assistant tạm chỉ dùng để hiển thị, rồi được thay bằng message đã chốt trước khi lưu.

## 9. Tổng kết và bài học thiết kế

### Dữ liệu nguồn và phép chiếu cho model phục vụ các bên đọc khác nhau

Bản cũ mô tả “hai bên đọc”: model và lớp chức năng. Pi `0.84.2` làm rõ thêm ranh giới lưu trữ, vì vậy có thể tách thành ba dạng dữ liệu:

| Dạng dữ liệu                   | Bên đọc chính                                       | Cấu trúc                        | Có thể mất dữ liệu?                                                   |
| ------------------------------ | --------------------------------------------------- | ------------------------------- | --------------------------------------------------------------------- |
| Lịch sử session                | resume, branching, compaction, trạng thái extension | Cây `SessionEntry`              | Không; phải giữ những trường cần để dựng lại trạng thái sản phẩm      |
| Transcript đang chạy của Agent | vòng lặp, hàng đợi, sự kiện, UI                     | `AgentMessage[]` có thể mở rộng | Được dựng từ nhánh session đã chọn nhưng vẫn giữ dữ liệu của ứng dụng |
| Context dành cho model         | Pi AI và provider đã chọn                           | `Message[]` đóng                | Có; lọc hoặc làm phẳng role của ứng dụng ngay trước lời gọi           |

Phép chiếu dành cho model chỉ là dữ liệu tạm. Hãy tính lại nó cho từng lời gọi sau khi chính sách context chạy. Nếu dùng mảng đã làm phẳng làm nguồn lưu trữ duy nhất, hệ thống sẽ mất cấu trúc nhánh, trường tùy chỉnh, trạng thái hiển thị, metadata compaction và dữ liệu chỉ dành cho extension. Theo chiều ngược lại, gửi thẳng session entry sẽ làm lộ role và trường mà không provider contract nào chấp nhận.

Union cùng declaration merging giữ package tổng quát ở trạng thái mở mà không khiến nó phụ thuộc mọi ứng dụng. Hàm conversion đóng ranh giới lại. Phép chiếu session bổ sung chiều thời gian: ứng dụng chỉ dựng nhánh đang hoạt động và thay lịch sử cũ bằng compaction summary, trong khi vẫn giữ bản ghi append-only.

Chuỗi `Tool -> AgentTool -> ToolDefinition` ở Chương 5 áp dụng cùng một quy tắc ranh giới cho khả năng thay vì message. Pi AI sở hữu khai báo dành cho provider, Agent core bổ sung bước thực thi, còn Coding Agent thêm context và cách hiển thị của sản phẩm. Trong cả hai hệ thống, package phía dưới công khai contract hẹp; lớp ứng dụng chỉ thêm các trường và hành vi mà nó sở hữu.

### Áp dụng cách thiết kế này vào một ranh giới giao thức khác

Trước hết, liệt kê các bên đọc cùng những trường mỗi bên cần. Provider có thể cần role, content theo thứ tự, định danh Tool và signature để phát lại. UI có thể cần trạng thái, metadata của lệnh, cập nhật tạm thời và cờ hiển thị. Lớp lưu trữ có thể cần ID, liên kết cha, phiên bản chuyển đổi và dữ liệu chi tiết của ứng dụng.

Giữ dạng biểu diễn giàu thông tin và có thẩm quyền nhất tại lớp sở hữu nó. Không làm phẳng trường từ sớm chỉ để tiện cho giao thức. Tạo giá trị giao thức hẹp qua một phép chuyển đổi có tên và thể hiện rõ phần mất dữ liệu trong kiểu trả về. Chữ ký `AgentMessage[] -> Message[]` của Pi cho biết nhiều hơn một hàm định dạng trả `unknown`: custom role không thể vô tình đi qua, còn output vẫn được kiểm tra kiểu khi biên dịch.

Sau đó, ghép mỗi type mở rộng với phần runtime tương ứng. Type được thêm bằng declaration merging cần converter. Message cần hiển thị phải có renderer. Message cần tồn tại lâu phải có bước tuần tự hóa, xác thực và chuyển đổi dữ liệu. Message bị lọc cần được rà soát về bảo mật vì việc model không thấy không nói gì về log, UI, sự kiện hay ổ đĩa.

Cuối cùng, kiểm thử thứ tự và hành vi lỗi tại ranh giới. `transform` bất đồng bộ phải hoàn tất theo thứ tự dự kiến. Fallback an toàn phải giữ transcript hợp lệ. Định danh giữa Tool call và result phải sống sót qua bước lọc. Conversion riêng của provider phải nằm dưới contract `Message` dùng chung. Các phép kiểm tra này cho phép dạng biểu diễn nội bộ phát triển mà không làm yếu giao thức bên ngoài.

## 10. Trạm tiếp theo

Sáu chương đầu đã nối được luồng lõi: bước dispatch model tạo assistant content đã chuẩn hóa, Agent core thực thi Tool call, Tool result quay lại transcript, rồi pipeline message chọn dữ liệu mà request tiếp theo tới provider được phép thấy.

Cùng luồng đó phát `message_start`, `message_update`, `message_end`, các sự kiện thực thi Tool, sự kiện của từng turn và vòng đời Agent. Bên đăng ký sự kiện hiển thị output tạm, lưu message đã chốt, và thứ tự hoàn tất của chúng ảnh hưởng thời điểm runtime trở về trạng thái rảnh. [Chương 7](ch07-event-driven.md) sẽ đi theo luồng sự kiện này.

> Trước khi đọc tiếp, hãy lần theo một `ToolCall` qua `ToolResultMessage` có thứ tự tương ứng, bước lưu session, `transformContext` và lượt `convertToLlm` kế tiếp. Khi chủ sở hữu và ranh giới của từng bước đã rõ, chuỗi sự kiện trong Chương 7 sẽ gắn với một đường đi dữ liệu cụ thể.

Phần rà soát source của chương được ghim vào Pi `0.84.2` tại commit `a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c`. Các đường dẫn chính gồm `packages/ai/src/types.ts`, `packages/ai/src/api/transform-messages.ts`, các phần triển khai provider dưới `packages/ai/src/api/`, `packages/agent/src/types.ts`, `packages/agent/src/agent-loop.ts`, `packages/agent/src/agent.ts`, `packages/coding-agent/src/core/messages.ts`, `packages/coding-agent/src/core/session-manager.ts`, `packages/coding-agent/src/core/sdk.ts`, `packages/coding-agent/src/core/agent-session.ts` và `packages/coding-agent/src/core/extensions/runner.ts`.
