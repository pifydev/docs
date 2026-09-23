---
title: 'Hướng dẫn nhanh: Tạo Pi agent đầu tiên'
description: >-
  Tạo một chương trình TypeScript nhỏ để nhận phản hồi streaming qua Pi AI API
  hiện tại.
translation_key: quickstart
language: vi
status: reviewed
reviewed_by: Pify maintainers
last_updated: '2026-09-23'
---
Hướng dẫn này dùng [release Pi `0.87.1` chính thức](https://github.com/earendil-works/pi/releases/tag/v0.87.1), được review tại [`f07218c`](https://github.com/earendil-works/pi/commit/f07218c4d4bbc12bef056a7058c3dd49dfe41abe), để tạo một chương trình TypeScript nhỏ nhận phản hồi streaming từ model. Bạn sẽ cài `@earendil-works/pi-ai`, đăng ký các provider có sẵn, chọn một model và xử lý luồng sự kiện. Bạn không cần biết Pi từ trước.

:::tip[Kết quả]

Một file TypeScript gọi model qua `Models.streamSimple()`. Từ đây, bạn có thể bổ sung Tool, xử lý sự kiện, lưu phiên làm việc và xây dựng vòng lặp Agent.

:::

## Trước khi bắt đầu

Ví dụ bên dưới vẫn dùng Anthropic Claude Sonnet để lần chạy đầu tiên gọn và dễ theo dõi. Nếu chọn một direct API-key route mới trong catalog `0.87.1`, hãy dùng đúng provider/model ID và credential tương ứng:

| Provider/model ID | Tên trong catalog | Credential trong environment |
|---|---|---|
| `anthropic/claude-opus-5-5` | `Claude Opus 5.5` | `ANTHROPIC_API_KEY` |
| `openai/gpt-6-sol` | `GPT-6 Sol` | `OPENAI_API_KEY` |
| `openai/gpt-6-luna` | `GPT-6 Luna` | `OPENAI_API_KEY` |
| `xai/grok-4.7` | `Grok 4.7` | `XAI_API_KEY` |

Đây là danh sách chọn lọc, không phải toàn bộ generated catalog. Pi Coding Agent còn cung cấp subscription route cho Claude Opus 5.5 và GPT-6 Sol/Luna, nhưng ví dụ SDK độc lập phải nhận credential qua authentication path đã cấu hình.

Bạn cần:

- **Node.js 22.19 trở lên** - kiểm tra bằng `node --version`
- **API key của một provider** - ví dụ Anthropic, OpenAI, Google hoặc local proxy tương thích với OpenAI Chat Completions. Ví dụ dưới đây dùng Anthropic.
- **Terminal** đang mở tại một thư mục rỗng

:::caution[Chi phí và an toàn]

Hướng dẫn này gọi API thật. Hãy đặt giới hạn chi tiêu thấp trên tài khoản provider và tuyệt đối không commit API key.

:::

## 1. Khởi tạo dự án

```bash
mkdir pi-quickstart && cd pi-quickstart
npm init -y
npm pkg set type=module
npm install @earendil-works/pi-ai@0.87.1
npm install --save-dev tsx
```

Bạn sẽ có:

- `package.json` được cấu hình để dùng ECMAScript modules
- `@earendil-works/pi-ai` và TypeScript loader `tsx` trong `node_modules`

## 2. Thêm API key

Tạo file `.env` trong cùng thư mục:

```bash title=".env"
ANTHROPIC_API_KEY=sk-ant-...
```

:::note[Vì sao dùng `.env` thay vì hardcode]

Provider đọc key khi chương trình chạy. Thêm `.env` vào `.gitignore` để key không lọt vào source control.

:::

Thêm `.env` vào `.gitignore`:

```bash title=".gitignore"
node_modules
.env
```

## 3. Viết agent

Tạo `agent.ts`:

```ts title="agent.ts"
import { builtinModels } from "@earendil-works/pi-ai/providers/all";

const models = builtinModels();
const model = models.getModel("anthropic", "claude-sonnet-4-5");
if (!model) throw new Error("Model not found");

const stream = models.streamSimple(model, {
  systemPrompt: "You are a concise assistant. Reply in one sentence.",
  messages: [
    {
      role: "user",
      content: "What is the capital of France?",
      timestamp: Date.now(),
    },
  ],
});

for await (const event of stream) {
  if (event.type === "text_delta") {
    process.stdout.write(event.delta);
  } else if (event.type === "done") {
    console.log("\n[done] reason:", event.reason);
  } else if (event.type === "error") {
    console.error("\n[error] reason:", event.reason);
    process.exitCode = 1;
  }
}
```

Bốn bước diễn ra trong file này:

1. `builtinModels()` tạo một `Models` collection và đăng ký các provider có sẵn.
2. `models.getModel("anthropic", "claude-sonnet-4-5")` lấy model descriptor từ collection đó.
3. `models.streamSimple(model, context)` mở request streaming và trả về một async iterable.
4. Vòng `for await` xử lý sự kiện cho đến khi stream kết thúc. `text_delta` chứa từng phần văn bản; `done` và `error` là các sự kiện cuối. Lỗi setup hoặc xác thực có thể đến qua `error`, vì vậy ví dụ báo lỗi và đặt exit code thất bại cho process.

## 4. Nạp key và chạy

Provider đọc `ANTHROPIC_API_KEY` từ environment của process. Node có thể nạp trực tiếp file `.env`:

```bash
node --env-file=.env --import tsx agent.ts
```

:::tip[Thêm npm script]

Thêm cấu hình sau vào `package.json` nếu bạn muốn dùng lệnh ngắn hơn:

```json title="package.json"
{
  "scripts": {
    "start": "node --env-file=.env --import tsx agent.ts"
  }
}
```

Sau đó chạy `npm start`.

:::

Kết quả sẽ tương tự:

```
The capital of France is Paris.
[done] reason: stop
```

Nếu thấy vậy, bạn đã có một Pi agent hoạt động.

## 5. Thử một biến thể

Đổi user message và chạy lại:

```ts title="agent.ts" {6}
const stream = models.streamSimple(model, {
  systemPrompt: "You are a concise assistant. Reply in one sentence.",
  messages: [
    {
      role: "user",
      content: "Name three Pi SDK packages.",
      timestamp: Date.now(),
    },
  ],
});
```

Metadata `{6}` yêu cầu code renderer của Fumadocs làm nổi bật dòng 6.

## Tiếp theo

Bạn đã có một lệnh `Models.streamSimple()` hoạt động. Chọn nội dung tiếp theo theo mục tiêu của bạn:

| Mục tiêu | Đọc |
|---|---|
| Hiểu toàn bộ vòng lặp Agent, không chỉ một model call | [Chương 3: Vòng lặp Agent](ch03-agent-loop.md) |
| Thêm một Tool mà model có thể gọi | [Thêm Tool tùy chỉnh](how-to/add-custom-tool.md) |
| Tích hợp model provider không có sẵn trong SDK | [Tích hợp model mới](how-to/plug-new-model.md) |
| Lưu cuộc hội thoại qua nhiều lần chạy | [Lưu phiên làm việc](how-to/persist-sessions.md) |

## Khắc phục sự cố

**`Error: ANTHROPIC_API_KEY is not set`**

Provider không tìm thấy key. Xác nhận `.env` nằm trong thư mục hiện tại và bạn đã chạy Node với `--env-file=.env`.

**`Error: model not found`**

`models.getModel()` không tìm thấy descriptor. Kiểm tra provider ID và model ID. Xem [Tham khảo cấu hình](reference/configuration.md#models).

**`SyntaxError: Cannot use import statement outside a module`**

`package.json` của bạn thiếu `"type": "module"`. Chạy `npm pkg set type=module` rồi thử lại.
