---
title: "Quickstart: Xây Pi agent đầu tiên của bạn"
description: "Tutorial 10 phút đưa bạn từ thư mục rỗng đến một Pi agent hoạt động, stream phản hồi từ model."
template: doc
sidebar:
  label: "Quickstart"
  order: 1
---

Tutorial này đưa bạn từ một thư mục rỗng đến một Pi agent hoạt động, có khả năng stream phản hồi từ model. Bạn sẽ cài `@pi-ai/core`, gắn một model vào, và chạy một script 5 dòng. Không yêu cầu kiến thức nền tảng về Pi.

:::tip[Bạn sẽ có gì ở cuối tutorial]
Một file TypeScript gọi model thông qua cùng interface `streamSimple` mà chính Pi agent sử dụng. Từ đó bạn có thể xếp thêm tool, event, session, và toàn bộ agent loop.
:::

## Trước khi bắt đầu

Bạn cần:

- **Node.js 20 trở lên** — kiểm tra bằng `node --version`
- **API key của một provider** — Anthropic, OpenAI, Google, hoặc bất kỳ local proxy nào nói chuyện được theo giao thức OpenAI Chat Completions. Snippet dưới dùng Anthropic.
- **Một terminal** trong một thư mục rỗng

:::caution[Chi phí và an toàn]
Tutorial này gọi API thật. Đặt spend limit thấp trên tài khoản provider trước khi tiếp tục, và đừng commit key vào bất kỳ file nào.
:::

## 1. Khởi tạo project

```bash
mkdir pi-quickstart && cd pi-quickstart
npm init -y
npm pkg set type=module
npm install @pi-ai/core
```

Bạn sẽ có:

- một `package.json` với `"type": "module"` để file `.ts` và `.mjs` chạy không cần flag
- `@pi-ai/core` đã cài trong `node_modules`

## 2. Thêm API key

Tạo file `.env` trong cùng thư mục:

```bash title=".env"
ANTHROPIC_API_KEY=sk-ant-...
```

:::note[Vì sao dùng file `.env` chứ không hardcode]
Key được SDK đọc lúc runtime. Giữ key trong `.env` nghĩa là bạn có thể `.gitignore` nó và không bao giờ để lộ key trong source control.
:::

Thêm `.env` vào `.gitignore`:

```bash title=".gitignore"
node_modules
.env
```

## 3. Viết agent

Tạo `agent.ts`:

```ts title="agent.ts"
import { getModel, streamSimple } from "@pi-ai/core";

const model = getModel("anthropic", "claude-sonnet-4-5");

const stream = streamSimple(model, {
  systemPrompt: "You are a concise assistant. Reply in one sentence.",
  messages: [{ role: "user", content: "What is the capital of France?" }],
});

for await (const event of stream) {
  if (event.type === "text_delta") {
    process.stdout.write(event.delta);
  } else if (event.type === "done") {
    console.log("\n[done] reason:", event.reason);
  }
}
```

Ba thứ xảy ra trong file này:

1. `getModel("anthropic", "claude-sonnet-4-5")` tra cứu một model descriptor từ catalog. Descriptor biết provider, URL, và request shape.
2. `streamSimple(model, context)` mở một streaming request. Nó trả về một async iterable của các event.
3. Vòng `for await` kéo event cho đến khi stream kết thúc. `text_delta` chứa các token chunk; `done` là event kết thúc.

## 4. Load key và chạy

SDK đọc API key từ `process.env.ANTHROPIC_API_KEY`. Để đưa giá trị từ `.env` vào environment, dùng một loader một lần:

```bash
npm install --save-dev dotenv
node --env-file=.env --import tsx agent.ts
```

:::tip[Hoặc dùng script]
Nếu bạn thích setup vĩnh viễn, thêm vào `package.json`:

```json title="package.json"
{
  "scripts": {
    "start": "node --env-file=.env --import tsx agent.ts"
  }
}
```

Sau đó `npm start` làm cùng điều đó.
:::

Bạn sẽ thấy gì đó như:

```
The capital of France is Paris.
[done] reason: stop
```

Nếu thấy vậy, bạn đã có một Pi agent hoạt động.

## 5. Thử một biến thể

Đổi user message và chạy lại:

```ts title="agent.ts" {6}
const stream = streamSimple(model, {
  systemPrompt: "You are a concise assistant. Reply in one sentence.",
  messages: [{ role: "user", content: "Name three Pi SDK packages." }],
});
```

`{6}` sau language tag là Expressive Code line highlighting. Dòng 6 giờ được gọi ra trực quan trong code block đã render.

## Tiếp theo

Bạn đã có một lệnh `streamSimple` hoạt động. Phần còn lại của cuốn sách xếp lên trên primitive này:

| Mục tiêu | Đọc |
|---|---|
| Hiểu toàn bộ agent loop, không chỉ một model call | [Chapter 3: Agent Loop](/vi/ch03-agent-loop/) |
| Thêm một tool model có thể gọi | [How to add a custom tool](/vi/how-to/add-custom-tool/) |
| Gắn một model provider SDK không có sẵn | [How to plug in a new model](/vi/how-to/plug-new-model/) |
| Lưu cuộc hội thoại qua nhiều lần chạy | [How to persist sessions](/vi/how-to/persist-sessions/) |

## Troubleshooting

**`Error: ANTHROPIC_API_KEY is not set`**

SDK không tìm thấy key. Xác nhận `.env` tồn tại trong thư mục hiện tại và bạn đã launch Node với `--env-file=.env`.

**`Error: model not found`**

`getModel` không resolve được model descriptor. Kiểm tra chính tả. Các canonical ID được liệt kê trong [Reference: Models](/vi/reference/configuration/#models).

**`SyntaxError: Cannot use import statement outside a module`**

`package.json` của bạn thiếu `"type": "module"`. Chạy `npm pkg set type=module` rồi thử lại.
