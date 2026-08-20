---
chapter: 6
slug: ch06-messages
title_zh: "第6章：消息系统: Agent 的记忆如何组织与传递"
title_en: "Chapter 6: Message System: How Agent Memory Is Organized and Passed"
title_vi: "Chương 6: Hệ thống Message: Bộ nhớ của Agent được tổ chức và truyền đi ra sao"
source_url: https://www.dgzhuya.com/modules/ch06-messages
language: vi
version_pairs:
 zh: zh/src/ch06-messages.md
 en: en/src/ch06-messages.md
 vi: vi/src/ch06-messages.md
original_chars: 4947
code_lines: 181
reading_minutes: 25
translator: hypnguyen1209
reviewed_by: null
last_updated: 2026-08-20
status: translated
official_refs: []
terms_used: []
code_blocks: 17
mermaid_blocks: 0
---

# Chương 6: Hệ thống Message: Bộ nhớ của Agent được tổ chức và truyền đi ra sao

Chương trước ta đã học hệ thống tool: model nói "đọc file", Agent Loop thực thi tool `read` qua pipeline 5 bước, cuối cùng sinh ra một `ToolResultMessage`. Nhưng bạn có để ý không: ta nói "message" khắp nơi, mà chưa bao giờ thực sự mở nó ra xem trông thế nào.

`UserMessage`, `AssistantMessage`, `ToolResultMessage`: ba cái tên này xuất hiện đi xuất hiện lại trong 5 chương đầu. Chương 3 nói "message chảy trong Loop", Chương 4 nói "message gửi cho model", Chương 5 nói "kết quả tool là một message".

Nhưng rốt cuộc message là gì? Cấu trúc dữ liệu của nó ra sao? Message nội bộ của Agent có giống message gửi cho model không?

Chương này trả lời những câu hỏi đó. Bạn sẽ thấy thiết kế cốt lõi nhất của hệ thống message Pi: **hai lớp message**: format phong phú dùng tự do bên trong Agent, dịch về format chuẩn chặt chẽ ở biên giới LLM.

---

## 1. Mở đầu: hành trình message của một lệnh Bash

Hãy bắt đầu bằng một tình huống cụ thể.

Bạn gõ lệnh Bash `!ls -la` trong terminal Pi rồi nhấn Enter. Lệnh chạy xong, xuất ra một đống danh sách file.

Thông tin của lệnh này, bên trong Pi, sẽ trở thành một **BashExecutionMessage**: nó có trường `command` ghi lại lệnh gốc, trường `output` ghi lại nội dung output, trường `exitCode` ghi lại exit code. Những trường có cấu trúc này cho phép UI dùng renderer chuyên dụng để hiển thị đẹp mắt output terminal.

Nhưng vấn đề là: khi Agent Loop chuẩn bị gọi LLM, API của LLM không hiểu `BashExecutionMessage` là gì. Nó chỉ hiểu ba format message: `user` (người dùng nói), `assistant` (AI trả lời), `toolResult` (tool trả về). BashExecutionMessage không thuộc bất kỳ loại nào trong ba cái này.

Vậy message này được LLM nhìn thấy bằng cách nào? Giữa chừng đã có những thay đổi gì?

Trong chương này, ta sẽ theo dấu BashExecutionMessage này từ lúc ra đời đến khoảnh khắc LLM nhìn thấy nó.

---

## 2. Lớp một: LLM chỉ biết ba loại message

Trước khi hiểu message biến đổi thế nào, hãy làm rõ "mục tiêu của sự biến đổi" trông ra sao. Format message mà LLM hiểu được, trong Pi gọi là kiểu **Message**, định nghĩa ở tầng thấp nhất `packages/ai/src/types.ts`.

Nó chỉ có ba thành viên:

```
Message 联合类型（LLM 标准格式）
│
├── UserMessage        ← 用户说的话 / 发的图片
├── AssistantMessage   ← LLM 的回复（含思考、工具调用）
└── ToolResultMessage  ← 工具执行后的结果
```


### Cấu trúc dữ liệu cụ thể của mỗi loại

**UserMessage**: đơn giản nhất, là input của người dùng:

```
{
    role: "user",
    content: string | (TextContent | ImageContent)[],  // 纯文本或内容块数组
    timestamp: number                                    // Unix 毫秒时间戳
}
```


content có thể là một chuỗi thuần, hoặc một mảng content block. Điều này có nghĩa là message người dùng có thể gửi cả text lẫn hình ảnh.

**AssistantMessage**: phản hồi của LLM, có nhiều trường nhất:

```
{
    role: "assistant",
    content: (TextContent | ThinkingContent | ToolCall)[],  // 三种内容块
    api: Api,                   // 使用的 API 类型（如 "anthropic-messages"）
    provider: ProviderId,       // 提供商（如 "anthropic"）
    model: string,              // 模型名（如 "claude-sonnet-4-6"）
    usage: Usage,               // token 用量统计
    stopReason: StopReason,     // 停止原因（第3章讲过的5种值）
    errorMessage?: string,      // 错误信息
    timestamp: number
}
```


Chỗ đáng chú ý nhất là trường content: nó không phải chuỗi, mà là **mảng content block** có thể chứa ba thứ:

```
AssistantMessage 的 content 内容块
│
├── TextContent       ← 普通文本
│     { type: "text", text: "..." }
│
├── ThinkingContent   ← 思考过程（第3章讲过，模型"在想"但不直接告诉用户的部分）
│     { type: "thinking", thinking: "..." }
│
└── ToolCall          ← 工具调用（第5章讲过，触发五步管道的入口）
      { type: "toolCall", id: "...", name: "read", arguments: { path: "..." } }
```


**Một message assistant có thể chứa cả text và tool call.** Ví dụ, LLM vừa nói "để tôi xem file này cho bạn" vừa phát ra một tool call Read: hai nội dung này được đặt trong cùng mảng `AssistantMessage.content`. "Phản hồi model có chứa ToolCall" được nhắc đến trong Chương 3 chính là cấu trúc này.

> **Chi tiết nâng cao**: trong content block còn có một số trường `*Signature` (`textSignature`, `thinkingSignature`, v.v.), là những ID chữ ký mờ đục mà một số provider (OpenAI, Google) yêu cầu, phải gửi nguyên văn trong request tiếp theo. Nội dung bị chỉnh sửa bởi bộ lọc an toàn cũng nằm ở đây. Hiểu biết hàng ngày không cần đào sâu; biết rằng đó là "cơ chế liên tục ngữ cảnh giữa các provider" là đủ.

**ToolResultMessage**: kết quả của việc thực thi tool (sản phẩm cuối của pipeline 5 bước ở Chương 5):

```
{
    role: "toolResult",
    toolCallId: string,                             // 对应哪个 ToolCall
    toolName: string,                               // 工具名
    content: (TextContent | ImageContent)[],        // 结果内容
    details?: TDetails,                             // 结构化详情（给 UI 看的）
    isError: boolean,                               // 是否执行失败（第5章的"永不抛出"产物）
    timestamp: number
}
```


`ToolResultMessage` liên kết với `ToolCall` trong `AssistantMessage` thông qua trường `toolCallId`. Chương 3 đã nhắc "kết quả tool phải liên kết chính xác về yêu cầu gọi": chính là dựa vào trường này. Trường `details` mang thông tin có cấu trúc để UI render; LLM thường không cần nhìn trường này.

### Một ví dụ hội thoại hoàn chỉnh

Ghép ba loại message lại, một đoạn hội thoại điển hình trông thế này:

```
messages 数组：
│
├── [0] UserMessage
│       role: "user"
│       content: "帮我看看 auth.ts"
│
├── [1] AssistantMessage
│       role: "assistant"
│       content: [
│           { type: "text", text: "让我帮你看看这个文件" },
│           { type: "toolCall", id: "tc_001", name: "read", arguments: { path: "auth.ts" } }
│       ]
│       stopReason: "toolUse"     ← 第3章讲过：调了工具，循环继续
│
├── [2] ToolResultMessage
│       role: "toolResult"
│       toolCallId: "tc_001"      ← 和上面的 id 对应
│       content: [{ type: "text", text: "import { auth } from '...' ..." }]
│       isError: false            ← 第5章讲过：正常结果
│
└── [3] AssistantMessage
        role: "assistant"
        content: [{ type: "text", text: "auth.ts 是一个认证模块..." }]
        stopReason: "stop"        ← 没调工具，循环结束
```


Đây là thế giới LLM hiểu được: người dùng nói gì, AI trả lời gì, tool trả về gì, chỉ có ba thứ đó.

---

## 3. Nghịch lý: message trong Agent không chỉ có ba loại

Tốt, giờ quay lại tình huống mở đầu. Bạn chạy `!ls -la`, và Pi cần ghi lại thông tin lần thực thi này bên trong.

Ở đây thực ra ẩn một vấn đề phổ biến hơn: **ngoài chuyện "hội thoại LLM", Agent bên trong còn có rất nhiều dữ liệu chức năng cần quản lý**: bản ghi thực thi lệnh Bash, tóm tắt sau khi nén context, bản ghi chuyển nhánh Git, metadata tệp đính kèm do người dùng tải lên...

Những dữ liệu chức năng này có **hai người đọc độc lập**, và nhu cầu của hai người đọc này xung đột:

- **Phía UI** cần trường có cấu trúc: để render Bash cho đẹp, nó cần lấy riêng `command`, `output`, `exitCode`, `cancelled`, `truncated`, rồi hiển thị trong terminal (lệnh syntax highlight, output font monospace, exit code đánh màu)
- **Phía LLM** chỉ cần một đoạn text phẳng: "người dùng chạy `ls -la`, output là `file1.txt
file2.txt
...`", đoạn text này nhét vào `UserMessage.content` là đủ

Xung đột ở chỗ nào? **Nếu vì LLM mà làm phẳng các trường trước rồi nhét vào `UserMessage`, UI sẽ không bao giờ lấy lại được dữ liệu có cấu trúc**: bạn đã khuấy thành một nồi lẩu rồi. Ngược lại, nếu chỉ lưu custom message có cấu trúc, không đưa vào context của LLM, thì LLM sẽ mất trí nhớ: vòng sau nó không biết người dùng vừa chạy gì.

Thiết kế của Pi **không thỏa hiệp bên nào**: **lưu dạng có cấu trúc vào `context.messages`** (thỏa mãn UI/persistence), **làm một lần dịch ở biên giới gọi LLM** (thỏa mãn LLM). Bằng cách này UI luôn có dữ liệu có cấu trúc đầy đủ, LLM cũng thấy được phiên bản phẳng nó cần. Việc dịch xảy ra ở khoảnh khắc cuối cùng, có mất mát, một chiều: những trường có cấu trúc bị mất khi dịch, UI đã dùng rồi, không sao.

**Cách giải của Pi là: cho phép ứng dụng định nghĩa custom message type.** `pi-agent-core` dành sẵn một extension point (gọi là `CustomAgentMessages`, mục sau sẽ mở rộng cách cài đặt) trong kiểu union `AgentMessage`. Ứng dụng inject kiểu message riêng qua TypeScript declaration merging. Mỗi ứng dụng chỉ đăng ký cái nó cần: gói lõi zero dependency, tầng ứng dụng có type safety toàn bộ.

Lấy coding-agent đi kèm Pi làm ví dụ, nó định nghĩa 4 loại custom message trong [packages/coding-agent/src/core/messages.ts](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/src/core/messages.ts):

```
coding-agent 的自定义消息类型
│
├── BashExecutionMessage       ← Bash 命令执行记录
├── CustomMessage              ← 扩展注入的通用消息
├── BranchSummaryMessage       ← 分支切换时的摘要
└── CompactionSummaryMessage   ← 上下文压缩后的摘要
```


Mỗi loại có trường có cấu trúc riêng. Lấy `BashExecutionMessage` làm ví dụ:

```
{
    role: "bashExecution",
    command: string,          // 命令原文："ls -la"
    output: string,           // 输出内容："file1.txt\nfile2.txt\n..."
    exitCode: number | undefined,  // 退出码：0
    cancelled: boolean,       // 是否被取消
    truncated: boolean,       // 输出是否被截断
    fullOutputPath?: string,  // 截断时的完整输出文件路径
    timestamp: number,
    excludeFromContext?: boolean  // 是否排除在 LLM 上下文之外
}
```


Mọi trường có cấu trúc đều được giữ lại. Nhưng ở đây cần dừng lại nhấn mạnh: **custom message không chỉ là "format trung gian để dịch cho LLM", chính nó mang đến ba khả năng độc lập**:

**1. Render chuyên dụng cho UI.** UI phân phối theo trường `role`: `bashExecution` render theo kiểu terminal, `compactionSummary` render theo kiểu thẻ tóm tắt. Lệnh, output, exit code mỗi thứ một dòng, không can thiệp lẫn nhau. Không có custom message, UI chỉ lấy được một đoạn text phẳng, mọi mánh render đều phải quay về "tất cả là khối text lớn".

**2. Phục hồi qua persistence.** File session lưu dữ liệu có cấu trúc đầy đủ. Khi bạn khởi động lại Agent lần sau, UI có thể tái tạo chính xác trạng thái render lần trước: exit code vẫn có màu, lệnh vẫn syntax highlight, dấu hiệu truncate vẫn còn. Nếu chỉ lưu text phẳng đã dịch, những thông tin này sẽ mất vĩnh viễn sau khi khởi động lại.

**3. Kiểm soát khả năng hiển thị chi tiết.** Vì custom message có `role` riêng, có thể xử lý đặc biệt trong lúc dịch `convertToLlm`: ví dụ thêm một trường `excludeFromContext = true`, LLM sẽ hoàn toàn không thấy message này, nhưng UI vẫn render bình thường. **Standard message không làm được điều này**: một khi đã vào mảng `messages`, `convertToLlm` chắc chắn sẽ dịch rồi gửi cho LLM, không có chỗ cho kiểu "thấy được với UI nhưng không thấy được với LLM".

Vậy khi §5 sau nói về dịch `convertToLlm` và §7 nói về lọc `excludeFromContext`, xin nhớ: **hai chuyện này không phải "rắc rối" do custom message mang đến, ngược lại: chúng là khả năng được custom message trao cho**. Dịch là để LLM thấy phiên bản phẳng, lọc là để một số message ẩn với LLM. Không có custom message, hai chuyện này đều không làm được.

Nhưng có một câu hỏi nền tảng: **kiểu union Message là đóng: chỉ có `UserMessage`, `AssistantMessage`, `ToolResultMessage`**. 4 loại custom message này không thuộc kiểu Message. Vậy chúng được hệ thống Agent chấp nhận và xử lý thế nào?

---

## 4. Lớp hai: `AgentMessage`: trong giàu ngoài nghiêm, thiết kế hai lớp

Đây là thiết kế cốt lõi của hệ thống message Pi: **không dùng một format để cai trị hết, mà dùng hai lớp: bên trong phong phú, bên ngoài chặt chẽ**.

**Chú thích hình:** phía trên kiểu union `AgentMessage` tách thành hai: nhánh trái `Message` (3 chuẩn), nhánh phải `CustomAgentMessages` (4 mở rộng). Đường đứt đỏ ở giữa là biên giới dịch `convertToLlm()`. Phía dưới, LLM chỉ thấy 3 message chuẩn; custom message hoặc bị lọc hoặc bị dịch thành `UserMessage`.

### Kiểu union `AgentMessage`

Có một dòng code then chốt tại `packages/agent/src/types.ts:314`:

```
export type AgentMessage = Message | CustomAgentMessages[keyof CustomAgentMessages];
```


Dịch ra tiếng thường: **`AgentMessage` = message chuẩn LLM + custom message**. Nó là kiểu union của `Message` (ba format chuẩn) và `CustomAgentMessages` (mở rộng tùy biến).

Nhìn qua hình ảnh là rõ nhất:

```
AgentMessage（Agent 内部使用的消息格式）
│
├── Message（可直接发送给 LLM 的标准消息）
│   │
│   ├── UserMessage          ← role: "user"
│   ├── AssistantMessage     ← role: "assistant"
│   └── ToolResultMessage    ← role: "toolResult"
│
└── CustomAgentMessages（仅 Agent 内部使用的扩展消息）
    │
    ├── BashExecutionMessage      ← role: "bashExecution"
    ├── CustomMessage             ← role: "custom"
    ├── BranchSummaryMessage      ← role: "branchSummary"
    └── CompactionSummaryMessage  ← role: "compactionSummary"
```


Mảng `context.messages` bên trong Agent chứa `AgentMessage[]`: nó có thể trộn lẫn lưu trữ message chuẩn và custom. Một message là chuẩn hay custom, nhìn trường `role` là biết.

### `CustomAgentMessages`: extension point mặc định rỗng

Then chốt là interface `CustomAgentMessages`:

```
export interface CustomAgentMessages {
    // Empty by default - apps extend via declaration merging
    // 默认为空 - 应用通过声明合并扩展
}
```


Chú ý: **interface này bên trong gói lõi (`pi-agent-core`) là rỗng**. Gói lõi hoàn toàn không biết có `BashExecutionMessage` hay `CompactionSummaryMessage` gì cả. Nó chỉ cung cấp một "khe cắm" để tầng ứng dụng nhét vào.

### Declaration merging: phép mở rộng type-safe

Tầng ứng dụng "nhét" bằng cách nào? Dựa vào **declaration merging** của TypeScript. Coding-agent dùng cú pháp `declare module` để "inject" 4 loại message của mình:

```
declare module "@earendil-works/pi-agent-core" {
    interface CustomAgentMessages {
        bashExecution: BashExecutionMessage;
        custom: CustomMessage;
        branchSummary: BranchSummaryMessage;
        compactionSummary: CompactionSummaryMessage;
    }
}
```


Hiệu ứng của đoạn code này là: **compiler tự động thêm 4 kiểu này vào kiểu union `AgentMessage`**. Từ đó trong dự án coding-agent, `AgentMessage` trở thành union của 7 loại message (3 chuẩn + 4 custom), TypeScript sẽ làm type checking đầy đủ cho bạn.

**Tại sao không dùng thẳng kế thừa hoặc generic?** Vì kế thừa đòi hỏi sửa base class: bạn không sửa được gói `pi-agent-core`. Generic đòi hỏi truyền tham số khắp nơi: mỗi chữ ký hàm dùng `AgentMessage` đều phải thêm tham số generic. Lợi ích của declaration merging là: **gói lõi hoàn toàn không biết sự tồn tại của extension (zero dependency), mà gói extension lại có type safety đầy đủ**.

Các ứng dụng khác nhau có thể có custom message khác nhau. Ví dụ Web UI đăng ký kiểu message riêng (`user-with-attachments`, `artifact`). **Mỗi ứng dụng chỉ thấy kiểu message nó cần.**

---

## 5. Biên giới dịch: `convertToLlm`: mọi custom message rốt cuộc đều thành User

Giờ ta biết Agent bên trong dùng 7 loại message để tự do diễn đạt. Nhưng mỗi lần gọi LLM, LLM chỉ chấp nhận 3 format chuẩn. Làm sao?

**Câu trả lời là: ở khoảnh khắc cuối cùng trước khi gọi LLM, làm một lần dịch.** Bộ dịch này là hàm `convertToLlm`.

### Dịch xảy ra lúc nào?

Trong hàm `streamAssistantResponse` (bước "gọi model" đã nhắc ở Chương 3), thời điểm dịch rất chính xác:

```
每次 LLM 调用前的消息处理管道：

context.messages: AgentMessage[]        ← Agent 内部的消息（最多 7 种类型）
        │
        ▼
[1] transformContext (可选)             ← AgentMessage[] → AgentMessage[]
        │                                  裁剪旧消息、注入外部上下文
        ▼
[2] convertToLlm (必须)                 ← AgentMessage[] → Message[]
        │                                  自定义消息翻译成标准格式
        ▼
llmContext.messages: Message[]          ← LLM 看到的消息（只有 3 种类型）
        │
        ▼
streamFunction(model, llmContext, ...)  ← 调用 LLM（第4章讲过）
```


Chú ý thứ tự: **trước `transformContext` (biến đổi cùng tầng), sau `convertToLlm` (dịch xuyên tầng)**. Tại sao hai bước? Sẽ bàn sau.

### Quy tắc dịch: mọi custom message đều thành User

Logic cốt lõi của `convertToLlm` trong coding-agent là một câu lệnh `switch`, phân phối theo trường `role`:

| role | Xử lý thế nào |
| --- | --- |
| `"user"` | truyền thẳng, không sửa |
| `"assistant"` | truyền thẳng |
| `"toolResult"` | truyền thẳng |
| `"bashExecution"` | `excludeFromContext=true` -> lọc bỏ; nếu không -> dịch thành `UserMessage` |
| `"custom"` | dịch thành `UserMessage` |
| `"branchSummary"` | dịch thành `UserMessage` (bọc bằng thẻ XML) |
| `"compactionSummary"` | dịch thành `UserMessage` (bọc bằng thẻ XML) |

Nhận xét then chốt: **mọi custom message đều được dịch thành message vai `user`**.

Tại sao đều thành `user`? Vì LLM API có yêu cầu chặt về thứ tự vai: format hội thoại phải xen kẽ `user -> assistant -> user ->. ..`, không được có hai `assistant` liên tiếp. Custom message về bản chất là "thông tin do hệ thống tiêm vào" (kết quả thực thi Bash, tóm tắt compression, tóm tắt nhánh), đặt vào vai `user` là an toàn nhất.

### Ví dụ cụ thể: dịch BashExecutionMessage

Quay lại tình huống mở đầu. Một `BashExecutionMessage` từ lúc tạo đến lúc LLM thấy, cấu trúc dữ liệu thay đổi thế này:

**Before**: `BashExecutionMessage` (format nội bộ Agent):

```
{
    role: "bashExecution",
    command: "ls -la",
    output: "total 32\ndrwxr-xr-x  5 user  staff  160 May 30 10:00 .\n...",
    exitCode: 0,
    cancelled: false,
    truncated: false,
    timestamp: 1748568000000
}
```


**After**: `UserMessage` (format LLM thấy):

```
{
    role: "user",
    content: [{
        type: "text",
        text: "Ran `ls -la`\n```\ntotal 32\ndrwxr-xr-x  5 user  staff  160 May 30 10:00 .\n...\n```"
    }],
    timestamp: 1748568000000
}
```


Tóm tắt thay đổi:

- `role`: `"bashExecution"` -> `"user"`
- `command`, `output`, `exitCode` và các trường có cấu trúc khác -> được format thành một đoạn text
- Thông tin bị mất: `cancelled`, `truncated` và cờ boolean khác được hòa vào mô tả text, không còn là trường độc lập

Custom message khác (`CompactionSummary`, `BranchSummary`) theo đúng cùng pattern dịch: bọc text tóm tắt bằng thẻ `<summary>`, phía trước thêm một câu giải thích, biến thành `UserMessage.content`.

---

## 6. Pipeline hai giai đoạn: tại sao tách transformContext và convertToLlm?

Pipeline xử lý message

**Chú thích hình:** luồng dữ liệu theo chiều ngang: `AgentMessage[7]` -> `transformContext` (biến đổi cùng tầng, kiểu không đổi) -> `convertToLlm` (dịch xuyên tầng) -> `Message[3]` gửi cho LLM. Phía dưới đánh dấu nhánh lọc `excludeFromContext`.

Quay lại sơ đồ pipeline, có một chi tiết thiết kế đáng hỏi: **tại sao hai bước, mà không phải một phát ăn ngay?**

Câu trả lời là **phân tách trách nhiệm**:

- **`transformContext` xử lý thao tác cấp AgentMessage**: cắt bớt message quá cũ, inject context bên ngoài, kích hoạt thuật toán nén. Trước và sau đều là `AgentMessage[]`, kiểu không đổi.
- **`convertToLlm` xử lý dịch xuyên kiểu**: dịch `AgentMessage` thành `Message`. Trước xử lý là `AgentMessage[]`, sau xử lý là `Message[]`, kiểu đã đổi.

Lợi ích của việc tách rời: **bạn chỉ có thể thay một cái mà không ảnh hưởng cái kia**.

- Khi bạn **đổi chiến lược quản lý context** (ví dụ từ "xóa message cũ nhất" sang "nén thành tóm tắt"), chỉ cần sửa `transformContext`: nó xử lý chính sách "cắt thế nào". `convertToLlm` không cần đụng.
- Khi bạn **đổi kiểu ứng dụng** (ví dụ biến coding-agent thành một Web customer-service Agent, custom message đổi từ `BashExecution`/`CompactionSummary` thành message nghiệp vụ kiểu `TicketEvent`/`OrderNote`), chỉ cần sửa `convertToLlm`: nó xử lý "làm sao dịch custom message thành `UserMessage`". `transformContext` không cần đụng.

Có một điểm dễ nhầm cần nhấn mạnh: **khi đổi LLM provider (ví dụ từ Claude sang GPT), `convertToLlm` không cần đụng**. Tại sao? Vì output của `convertToLlm` là `Message[]` thống nhất (3 message chuẩn), nó đã làm xong việc "custom message -> message chuẩn". Tiếp theo, **dịch `Message` thành format riêng của từng provider** là việc của tầng `pi-ai` (đã bàn Chương 4): tầng đó có translator riêng (`anthropic-messages`, `openai-completions`, v.v.), hoàn toàn độc lập với `convertToLlm`. Nói cách khác: **Pi đặt "dịch kiểu message" và "dịch giao thức provider" vào hai tầng trừu tượng khác nhau, không can thiệp lẫn nhau**.

---

## 7. Cơ chế lọc: có những message LLM không nên thấy

Tới giờ, mọi custom message rốt cuộc đều biến thành `UserMessage` được LLM thấy. Nhưng có những trường hợp, message chỉ nên để UI xem, không cho LLM xem.

### `excludeFromContext`: lực lọc của một trường boolean

Tool Bash của Pi có một tính năng: khi bạn dùng prefix `!!` để chạy lệnh (ví dụ `!!secret_cmd`), kết quả thực thi của lệnh đó LLM không thấy.

Cách làm rất đơn giản: `BashExecutionMessage` có một trường `excludeFromContext`. Trong `convertToLlm`, kiểm tra trường này:

```
case "bashExecution":
    if (m.excludeFromContext) {
        return undefined;   // 直接返回 undefined，后续被 filter 掉
    }
    // ... 否则正常转换
```


Chú ý: message có `excludeFromContext = true` **vẫn tồn tại trong `context.messages`**. UI vẫn thấy nó, render nó. Chỉ ở khoảnh khắc gọi LLM, message này mới bị "ẩn đi".

Đây là cơ chế "UI thấy được, LLM không thấy": một trường boolean, lọc ở biên giới dịch, bản thân dữ liệu không cần xóa.

### Ba mức khả năng hiển thị message

Tổng hợp những phân tích ở trên, hệ thống message của Pi thực ra có ba mức khả năng hiển thị:

| Mức khả năng hiển thị | LLM có thấy không | UI có thấy không | Cách hiện thực | Message tiêu biểu |
| --- | --- | --- | --- | --- |
| Thấy toàn bộ | Có | Có | `convertToLlm` dịch bình thường | `BashExecution`, `User`, `Assistant` thường |
| LLM không thấy | Không | Có | `excludeFromContext = true` | Thực thi Bash với prefix `!!` |
| Chỉ lưu trữ | Không | Không | UI render bỏ qua, `convertToLlm` cũng lọc bỏ | `ArtifactMessage` của Web UI |

---

## 8. Luồng dữ liệu hoàn chỉnh: từ thao tác người dùng đến message LLM thấy

Nối hết cả chương lại, đường đi hoàn chỉnh của một message từ khi ra đời đến khi LLM thấy:

```
用户在终端输入 !ls -la
        │
        ▼
[1] 创建消息
    BashExecutionMessage { role: "bashExecution", command: "ls -la", output: "...", ... }
        │
        ▼
[2] 存入 context.messages: AgentMessage[]
    [...原有消息, 新的 BashExecutionMessage]
        │
        ▼
[3] Agent Loop 准备调用 LLM（第3章讲过的内层循环）
        │
        ▼
[4] transformContext（可选）
    输入/输出都是 AgentMessage[]
    裁剪、注入、压缩（第8章详讲 transformContext、第9章详讲 Compaction）
        │
        ▼
[5] convertToLlm（必须）
    AgentMessage[] → Message[]
    BashExecutionMessage → UserMessage
    excludeFromContext → 过滤掉
        │
        ▼
[6] LLM 收到
    llmContext.messages = [
        ...之前的消息,
        { role: "user", content: "Ran `ls -la`\n```\n...\n```" }
    ]
        │
        ▼
[7] LLM 回复
    → 产生新的 AssistantMessage
    → 可能触发工具调用 → ToolResultMessage（第5章的五步管道）
    → 回到 [2]，继续循环
```


**Quy luật cốt lõi**: Agent bên trong dùng 7 kiểu message để tự do diễn đạt, nhưng đến biên giới LLM, mọi custom message đều được dịch ngược về 3 format chuẩn. Thiết kế "trong giàu ngoài nghiêm" này cho Agent khả năng mở rộng vô hạn, đồng thời không bao giờ phá vỡ tính tương thích LLM.

---

## 9. Tóm tắt

### Một tuyến chính: cấu trúc dữ liệu phải cùng lúc chiều hai người đọc

Nhìn lại cả chương, mọi thiết kế của hệ thống message Pi đều xoay quanh một tư tưởng giản dị: **khi thiết kế cấu trúc dữ liệu, vừa phải nghĩ đến cái mà model cần, vừa nghĩ đến cái mà tầng chức năng cần, sau đó tùy nhu cầu mà tự định nghĩa, dùng kiến trúc hợp lý để kết hợp hai thứ lại**.

Cụ thể với hệ thống message, nhu cầu của hai "người đọc" này bị phân liệt:

- **Phía model** chỉ cần ba message chuẩn (`User`/`Assistant`/`ToolResult`): đây là thứ giao thức API LLM ép buộc, không sửa được
- **Phía chức năng** (UI, persistence, kiểm soát khả năng hiển thị) cần trường có cấu trúc phong phú: mỗi trường thêm là một khả năng thêm

Nếu chỉ thiết kế cho model, mọi trường có cấu trúc đều mất, tầng chức năng suy thoái; nếu chỉ thiết kế cho tầng chức năng, model đọc không hiểu, đoạn hội thoại đứt. Cách làm của Pi là **hai tầng mỗi tầng lo việc mình**:

| Tầng | Quan tâm ai | Dạng dữ liệu | Hiện thực thế nào |
| --- | --- | --- | --- |
| **`AgentMessage` (tầng trong)** | Tầng chức năng | 7 message (3 chuẩn + 4 custom), trường phong phú | Dùng kiểu union + declaration merging để gói lõi zero dependency, tầng ứng dụng type-safe toàn bộ |
| **`Message` (tầng ngoài)** | Model | 3 message chuẩn, trường gọn | Ở biên giới gọi LLM làm một lần dịch `convertToLlm`, **có mất mát, một chiều, khoảnh khắc cuối cùng** |

Mọi thiết kế cụ thể của chương này: bước tiến kiểu ba tầng (`Tool` -> `AgentTool` -> `ToolDefinition`), extension point declaration merging, pipeline hai giai đoạn `transformContext` / `convertToLlm`, kiểm soát khả năng hiển thị `excludeFromContext`: đều là hiện thực cụ thể của tuyến chính này. **Tuyến chính là "hai người đọc, kiến trúc hai lớp", phương tiện hiện thực có thể muôn hình vạn trạng.**

### Áp dụng tuyến chính này vào dự án của bạn

Lần tới khi bạn thiết kế một hệ thống đối thoại với giao thức bên ngoài (không chỉ Agent: bất kỳ kịch bản nào "bên ngoài có ràng buộc giao thức, bên trong có nhu cầu phong phú"), có thể áp ba bước này:

**Bước 1: nhận diện "hai người đọc" mỗi người cần gì.** Giao thức quy định cái gì (phần không sửa được)? Tầng chức năng cần cái gì (phần tự định nghĩa được)? Liệt kê ra, làm rõ nhu cầu của từng bên.

**Bước 2: lấy cấu trúc tầng trong làm "nguồn", lấy dịch tầng ngoài làm "dòng".** Tầng lưu trữ và chức năng dùng dữ liệu gốc, có cấu trúc (không mất trường, không làm phẳng); đến biên giới giao thức mới làm một lần dịch có mất mát. **Đừng vì tiện cho giao thức mà làm phẳng dữ liệu trước**: một khi đã làm phẳng, UI và persistence sẽ không bao giờ lấy lại được cấu trúc.

**Bước 3: dùng extension point của hệ thống kiểu để chia lớp "lõi + ứng dụng".** Gói lõi định nghĩa giao diện giao thức (đóng), để trống một khe cắm mở rộng; gói ứng dụng inject kiểu cụ thể của mình qua declaration merging. Như vậy gói lõi zero dependency, gói ứng dụng type-safe toàn bộ: không cần kế thừa, không cần generic-parameter làm ô nhiễm mọi nơi.

> Bước tiến ba tầng "Tool -> AgentTool -> ToolDefinition" (Chương 5) được bàn trong chương này cũng có cùng tư tưởng: mỗi tầng chỉ thêm khả năng mà cấp của nó cần, không vượt biên. Nhận diện "điểm phân tầng", vạch rõ biên giới trách nhiệm cho từng tầng, là cốt lõi của cách thiết kế này.

---

## 10. Trạm tiếp theo

Sáu chương đầu đến đây kết thúc: bạn đã xây được sự hiểu biết hoàn chỉnh về cơ chế lõi của Pi-Agent.

> **Gợi ý**: trước khi vào chương nâng cao, nên ôn lại cơ chế lõi của sáu chương đầu (hệ thống message, gọi tool, cơ chế mở rộng, Agent Loop, v.v.), xác nhận rằng bạn đã xâu chuỗi được điểm kiến thức giữa các chương.

Từ Chương 7 trở đi là phần nâng cao. Nhìn lại năm chương đầu, có một thứ cứ lặp đi lặp lại mà ta chưa đào sâu: **sự kiện** (events). Chương 3 nói "Agent Loop mỗi bước đều phát event để UI cập nhật real time", Chương 5 nói "khi thực thi tool phát ra event `tool_execution_start`, `tool_execution_update`, `tool_execution_end`". Mấy event này được truyền từ bên trong Agent ra ngoài kiểu gì? UI subscribe event bằng cách nào? Tại sao Agent phát event xong còn "đồng bộ chờ" listener xử lý xong?

Chương tới, ta mở "hệ thần kinh" của Agent: kiến trúc hướng sự kiện.

---

> **Chỉ mục source code then chốt của chương này**:
>
> `packages/ai/src/types.ts:322-408`: kiểu union Message + ba interface message
> `packages/agent/src/types.ts:305-314`: `CustomAgentMessages` + `AgentMessage`
> `packages/coding-agent/src/core/messages.ts:70-77`: declaration merging của coding-agent
> `packages/agent/src/agent-loop.ts:275-308`: pipeline dịch (`transformContext` -> `convertToLlm`)
> `packages/coding-agent/src/core/messages.ts:82-195`: quy tắc dịch custom
> `packages/coding-agent/src/core/messages.ts:38-39`: trường `excludeFromContext`
