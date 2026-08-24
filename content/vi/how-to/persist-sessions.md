---
title: Lưu và tiếp tục session
description: Lưu session dạng JSONL, tiếp tục công việc gần nhất, mở file cụ thể và rẽ nhánh lịch sử hội thoại.
translation_key: how-to-persist-sessions
language: vi
status: reviewed
reviewed_by: Pify maintainers
last_updated: '2026-08-24'
---

Pi lưu mỗi persistent session trong một file JSONL. Các entry tạo thành cây qua `id` và `parentId`, nên một file có thể giữ nhiều nhánh hội thoại.

## Tạo persistent session

```ts title="new-session.ts"
import {
  createAgentSession,
  ModelRuntime,
  SessionManager,
} from "@earendil-works/pi-coding-agent";

const cwd = process.cwd();
const modelRuntime = await ModelRuntime.create();
const { session } = await createAgentSession({
  modelRuntime,
  sessionManager: SessionManager.create(cwd),
});

await session.prompt("Create a refactoring plan for this project.");
console.log(session.sessionFile);
session.dispose();
```

`SessionManager.create(cwd)` tạo persistent session mới cho working directory đó. Pi tự append entry khi hội thoại thay đổi; bạn không cần gọi `save()` riêng.

Dùng `SessionManager.inMemory(cwd)` cho test hoặc công việc tạm thời không được ghi xuống disk.

## Tiếp tục session gần nhất

```ts title="continue-session.ts"
import {
  createAgentSession,
  ModelRuntime,
  SessionManager,
} from "@earendil-works/pi-coding-agent";

const cwd = process.cwd();
const modelRuntime = await ModelRuntime.create();
const { session, modelFallbackMessage } = await createAgentSession({
  modelRuntime,
  sessionManager: SessionManager.continueRecent(cwd),
});

if (modelFallbackMessage) console.warn(modelFallbackMessage);
await session.prompt("Continue with the first safe change.");
```

Thông báo fallback cần được xử lý: model đã lưu có thể không còn khả dụng và session được khôi phục có thể chọn model thay thế.

## Mở hoặc liệt kê session đã lưu

```ts
const sessions = await SessionManager.list(process.cwd());
const allSessions = await SessionManager.listAll(process.cwd());

const manager = SessionManager.open("/absolute/path/to/session.jsonl");
const { session } = await createAgentSession({ sessionManager: manager });
```

`list()` giới hạn theo working directory. `listAll()` tìm trong mọi project đã biết của Pi agent directory đang được cấu hình.

## Di chuyển và rẽ nhánh trên cây

```ts
const manager = SessionManager.open("/absolute/path/to/session.jsonl");
const entries = manager.getEntries();
const currentPath = manager.getPath();

const checkpoint = entries.find((entry) => manager.getLabel(entry.id) === "checkpoint");
if (checkpoint) manager.branch(checkpoint.id);
```

`branch(id)` đổi active leaf trong cùng file. Prompt mới sau đó sẽ tạo một child khác. Dùng `createBranchedSession(leafId)` khi muốn tách path đã chọn thành session file riêng.

## Lưu trữ và an toàn

Root mặc định là `~/.pi/agent/sessions/`, được nhóm theo working directory. Có thể ghi đè bằng `--session-dir`, sau đó là `PI_CODING_AGENT_SESSION_DIR`, rồi `sessionDir` trong `settings.json`, theo đúng thứ tự ưu tiên này.

Session file có thể chứa prompt, tham số và output của tool, file path cùng dữ liệu extension. Hãy áp dụng cùng chính sách access control, retention và backup như đối với source code và operational log.
