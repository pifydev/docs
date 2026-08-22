---
title: "How to persist sessions"
description: "Lưu cuộc hội thoại từng turn lên đĩa, resume sau, và rẽ nhánh lịch sử."
template: doc
sidebar:
  label: "Lưu session"
  order: 4
---

Hướng dẫn này chỉ cách persist một cuộc hội thoại qua nhiều lần chạy. Sau khi xong bạn sẽ có thể khởi động agent, lưu session, tắt tiến trình, và resume ở lần chạy sau với context đầy đủ được khôi phục.

:::tip[Khi nào cần]
- Một task chạy lâu phải sống qua restart
- Người dùng đóng laptop và mở lại project ngày mai
- Một cây hội thoại rẽ nhánh từ một điểm chung
:::

## Mô hình session

Một session Pi là một thư mục chứa một file JSONL mỗi turn và một `metadata.json` với resolved model, working directory, và parent session id. Vị trí mặc định là `~/.pi/agent/sessions/`. Bạn có thể override root bằng `PI_HOME`.

## 1. Bắt đầu session

Agent loop nhận tuỳ chọn `sessionId`. Nếu không đặt, SDK tạo UUID.

```ts title="agent.ts"
import { agentLoop, getModel, Session } from "@pi-agent-core";
import { homedir } from "node:os";
import { join } from "node:path";

const sessionsRoot = join(homedir(), ".pi", "agent", "sessions");
const session = new Session({
  root: sessionsRoot,
  // Không id: session mới được tạo khi save lần đầu.
});

const model = getModel("anthropic", "claude-sonnet-4-5");

const events: unknown[] = [];
for await (const event of agentLoop({
  model,
  session,
  messages: [{ role: "user", content: "Start a refactor plan." }],
})) {
  events.push(event);
  if (event.type === "done") break;
}

await session.save(events);
console.log("saved as", session.id);
```

Sau khi chạy, `~/.pi/agent/sessions/<id>/turn-0.jsonl` và `metadata.json` tồn tại trên disk.

## 2. Resume session

Ở lần chạy tiếp theo, load session theo id:

```ts title="agent.ts" {4}
import { Session } from "@pi-agent-core";
import { join } from "node:path";
import { homedir } from "node:os";

const session = await Session.load({
  root: join(homedir(), ".pi", "agent", "sessions"),
  id: "a1b2c3-...", // id từ lần chạy trước
});
```

`Session.load` đọc `metadata.json` và các file turn, theo thứ tự, và tái dựng message history. Model và provider được khôi phục từ metadata, không phải từ `getModel`.

:::caution[Kiểm tra model vẫn khả dụng]
Nếu model gốc không còn trong catalog, resume thất bại. Pin model bằng `Session.load({ ..., pinModel: true })` để tiếp tục dùng descriptor gốc ngay cả khi catalog thay đổi.
:::

## 3. Rẽ nhánh session

Branching rẽ cuộc hội thoại tại một turn cụ thể. Session gốc không đổi; một session mới được tạo với `parentId`:

```ts title="agent.ts"
const branch = await Session.branch({
  root: sessionsRoot,
  parentId: "a1b2c3-...",
  fromTurn: 4, // copy turn 0..4 sang session mới
  newId: "d4e5f6-...",
});

// branch.messages chứa các turn đã copy.
// Ghi tiếp theo đi vào branch, không phải parent.
```

Session mới có thể tách ra từ turn 5 trở đi. Parent giữ read-only.

## 4. Duyệt cây

Session tạo thành cây qua `parentId`. Để liệt kê lịch sử của user:

```ts title="agent.ts"
import { listSessions } from "@pi-agent-core";

const all = await listSessions({ root: sessionsRoot });
for (const meta of all) {
  console.log(meta.id, meta.parentId, meta.title);
}
```

CLI dùng cái này để render session picker.

## 5. Riêng tư và cleanup

Session là JSONL thuần trên disk. Chúng chứa mọi user message và mọi tool result. Trước khi ship một build có tạo session, quyết định:

- Root ở đâu (mặc định `~/.pi/agent/sessions` ổn cho dùng cá nhân; deployment nhiều user muốn root theo từng user)
- Giữ bao lâu (Pi có setting retention; xem [Reference: Configuration](/vi/reference/configuration/))
- Có redact secret trước khi ghi không (một hook `Session.redact` chạy trước mỗi lần save)

```ts title="agent.ts"
const session = new Session({
  root: sessionsRoot,
  redact: (event) => {
    if (event.type === "tool_result" && event.output.includes("sk-")) {
      return { ...event, output: "[redacted]" };
    }
    return event;
  },
});
```

## Pitfalls

**Quên gọi `save`**

Event được buffer trong bộ nhớ cho đến khi bạn save. Crash trước khi save mất turn. Bọc loop trong `try/finally` và gọi `save` cả khi có lỗi.

**Ghi vào sai root**

Tuỳ chọn `root` là theo `Session`. Nếu bạn tạo `Session` mới với root khác do nhầm, hai nửa cuộc hội thoại sẽ không liên kết.

**Load session với phiên bản model khác**

Pi SDK có thể bump message shape giữa các version nhỏ. Một session từ 0.78 có thể không load trên 0.84 nếu schema lệch. File session có field `schemaVersion`; hãy kiểm tra trong loader của bạn và đưa ra lỗi rõ ràng khi lệch.

## Tiếp theo

- [Chapter 10: Session Management](/vi/ch10-session/) cho session tree đầy đủ và schema metadata.
- [Reference: Configuration](/vi/reference/configuration/#sessions) cho các setting retention và redacting.
