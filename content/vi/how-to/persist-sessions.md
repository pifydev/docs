---
title: Lưu session
description: Tạo, resume, kiểm tra, rẽ nhánh và lưu giữ an toàn session JSONL chỉ ghi thêm.
translation_key: how-to-persist-sessions
language: vi
status: reviewed
reviewed_by: Pify maintainers
last_updated: '2026-08-25'
---

Dùng `SessionManager` khi hội thoại phải tồn tại lâu hơn process hiện tại. Manager này sở hữu session file và append trạng thái trong lúc `AgentSession` chạy.

:::tip[Khi nào cần cách này]

- Resume tác vụ coding sau khi khởi động lại CLI, service hoặc worker
- Giữ lịch sử hội thoại và Tool để kiểm tra lại
- Rewind trong một lịch sử hoặc tách path đã chọn thành session mới

:::

Các ví dụ dùng Node.js `>=22.19.0`, ESM và `@earendil-works/pi-coding-agent@0.84.2`. Cài bằng `npm install @earendil-works/pi-coding-agent@0.84.2`; thêm `tsx`, TypeScript và Node types để chạy các lệnh bên dưới.

## Mô hình session

Một persistent session là **một file JSONL chỉ ghi thêm**, không phải một file cho mỗi turn. Record đầu là header gồm session `id`, timestamp, `cwd`, version định dạng và `parentSession` tùy chọn. Các record sau là tree entry. Mỗi entry có `id`, `parentId` và timestamp riêng; message, thay đổi model, compaction, label và trạng thái extension vì thế có thể cùng nằm trong một lịch sử.

`parentId` nối các entry bên trong một file. `parentSession` ghi lại quan hệ nguồn giữa những file được tạo bằng extraction hoặc fork. Đọc ID hiện tại bằng `getSessionId()`; đừng tự đặt filename hay sửa hai quan hệ này.

Mặc định, file do SDK tạo nằm dưới `~/.pi/agent/sessions/<encoded-cwd>/`. `SessionManager.create(cwd, sessionDir)` và `continueRecent(cwd, sessionDir)` dùng đối số thứ hai khi được truyền; nếu không, chúng dùng vị trí mặc định. `SessionManager.inMemory(cwd)` giữ nguyên tree API nhưng không ghi file.

## 1. Bắt đầu session

Khi model và credential đã được cấu hình, hãy tạo manager trước rồi truyền đúng instance đó vào agent:

```ts title="start-session.ts"
import {
  createAgentSession,
  ModelRuntime,
  SessionManager,
} from "@earendil-works/pi-coding-agent";

const cwd = process.cwd();
const sessionDir = process.env.APP_SESSION_DIR;
const sessionManager = SessionManager.create(cwd, sessionDir);
const modelRuntime = await ModelRuntime.create();
const { session } = await createAgentSession({
  cwd,
  modelRuntime,
  sessionManager,
});

try {
  await session.prompt("Create a refactoring plan for this project.");
  console.log(sessionManager.getSessionFile());
} finally {
  session.dispose();
}
```

Chạy bằng `npx tsx start-session.ts`. Agent tự append message đã hoàn tất và các thay đổi trạng thái; không có lệnh `save()`. Manager mới có thể trả về path dự kiến ngay, nhưng Pi trì hoãn việc tạo file đến khi nhận assistant message đầu tiên. Vì vậy, response đầu tiên còn đang chạy chưa được lưu bền vững.

## 2. Resume session

`continueRecent(cwd, sessionDir?)` mở session mới nhất có `cwd` khớp, hoặc chuẩn bị session mới khi không có session khớp. Khi truyền custom `sessionDir`, hàm lọc các header ứng viên theo `cwd` đã lưu; thư mục encoded-CWD mặc định vốn đã giới hạn theo project:

```ts title="resume-session.ts"
import {
  createAgentSession,
  ModelRuntime,
  SessionManager,
} from "@earendil-works/pi-coding-agent";

const cwd = process.cwd();
const sessionDir = process.env.APP_SESSION_DIR;
const sessionManager = SessionManager.continueRecent(cwd, sessionDir);
const modelRuntime = await ModelRuntime.create();
const { session, modelFallbackMessage } = await createAgentSession({
  cwd,
  modelRuntime,
  sessionManager,
});

if (modelFallbackMessage) console.warn(modelFallbackMessage);

try {
  await session.prompt("Continue with the first safe change.");
} finally {
  session.dispose();
}
```

Luôn hiển thị `modelFallbackMessage`. Thông báo này cho biết provider/model đã lưu không thể được khôi phục và, khi có thể, nêu model thay thế. API hiện tại khôi phục thay đổi model và thinking được lưu trên active branch; session không có tùy chọn `pinModel`.

Để resume một file đã chọn, truyền absolute path từ `SessionManager.list()` hoặc `listAll()` vào `SessionManager.open(path)`. `open()` thường khôi phục `cwd` trong header. Đối số thứ ba là `cwdOverride` tường minh; chỉ dùng khi bạn chủ động chuyển worktree. Hãy kiểm tra path do người dùng cung cấp nằm trong session root được phép trước khi mở.

## 3. Rẽ nhánh session

Chọn một trong hai thao tác:

- `branch(entryId)` chỉ di chuyển active leaf trong manager hiện tại. Lần append kế tiếp tạo một child khác trong **cùng file**; các entry cũ không đổi.
- `createBranchedSession(leafId)` chép path từ root đến leaf vào **file mới**. Với persistent manager, thao tác này cũng chuyển chính manager sang file và session ID mới.

```ts title="branch-session.ts"
import { isAbsolute } from "node:path";
import { SessionManager } from "@earendil-works/pi-coding-agent";

const sessionPath = process.argv[2];
const checkpointId = process.argv[3];
if (!sessionPath || !isAbsolute(sessionPath) || !checkpointId) {
  throw new Error("Usage: branch-session.ts /absolute/session.jsonl ENTRY_ID");
}

const manager = SessionManager.open(sessionPath);
if (!manager.getEntry(checkpointId)) throw new Error("Unknown entry ID");

manager.branch(checkpointId);
console.log("same-file path", manager.getBranch().map((entry) => entry.id));

const parentFile = manager.getSessionFile();
const extractedFile = manager.createBranchedSession(checkpointId);
console.log({ parentFile, extractedFile, activeFile: manager.getSessionFile() });
```

Hãy lưu `parentFile` trước khi extraction nếu caller vẫn cần file cha. `forkFrom(sourcePath, targetCwd, sessionDir)` là lựa chọn cho project khác: nó tạo file mới, chép toàn bộ lịch sử không phải header của source file và ghi source path vào `parentSession`.

## 4. Duyệt cây

`getEntries()` trả về mọi entry trừ header. `getBranch(leafId?)` trả về một path từ root đến leaf. `getTree()` cung cấp toàn bộ branch dưới dạng node có `children` và label đã được resolve.

```ts title="inspect-sessions.ts"
import { isAbsolute } from "node:path";
import {
  SessionManager,
  type SessionTreeNode,
} from "@earendil-works/pi-coding-agent";

const cwd = process.cwd();
const sessionDir = process.env.APP_SESSION_DIR;
const projectSessions = await SessionManager.list(cwd, sessionDir);
const searchableSessions = sessionDir
  ? await SessionManager.listAll(sessionDir)
  : await SessionManager.listAll();

const selected = projectSessions[0] ?? searchableSessions[0];
if (!selected || !isAbsolute(selected.path)) throw new Error("No saved session");

const manager = SessionManager.open(selected.path, sessionDir);
console.log("cwd", manager.getCwd());
console.log("entries", manager.getEntries().length);
console.log("active path", manager.getBranch().map((entry) => entry.id));

function printTree(nodes: SessionTreeNode[], depth = 0): void {
  for (const node of nodes) {
    console.log(`${"  ".repeat(depth)}${node.entry.type} ${node.entry.id}`);
    printTree(node.children, depth + 1);
  }
}

printTree(manager.getTree());
```

`list(cwd, sessionDir?)` giới hạn theo project. Khi không truyền đối số, `listAll()` tìm trong mọi thư mục project đã mã hóa dưới session root mặc định của Pi. Đối số string của hàm này là **session directory**, không phải `cwd`; đừng viết `listAll(process.cwd())` trừ khi working directory thực sự là thư mục lưu session.

Fixture tùy chọn dưới đây không cần secret và kiểm tra các thao tác lưu trữ mà không gọi provider. Nó assert việc trì hoãn tạo file, create/open/continue/list, tree branch, path extraction, `forkFrom()` và việc manager đổi sang file mới sau extraction. Chạy bằng `npx tsx verify-sessions.ts`.

<Accordions type="single">
<Accordion title="Fixture SessionManager tất định, tùy chọn">

```ts title="verify-sessions.ts"
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import { SessionManager } from "@earendil-works/pi-coding-agent";

type StoredMessage = Parameters<SessionManager["appendMessage"]>[0];

function user(text: string): StoredMessage {
  return { role: "user", content: text, timestamp: Date.now() };
}

function assistant(text: string): StoredMessage {
  return {
    role: "assistant",
    content: [{ type: "text", text }],
    api: "openai-completions",
    provider: "fixture",
    model: "fixture",
    usage: {
      input: 1,
      output: 1,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 2,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: "stop",
    timestamp: Date.now(),
  };
}

const root = await mkdtemp(join(tmpdir(), "pi-session-fixture-"));
try {
  const cwd = join(root, "project");
  const sessionDir = join(root, "sessions");
  await mkdir(cwd);

  const manager = SessionManager.create(cwd, sessionDir);
  const sessionFile = manager.getSessionFile();
  assert.ok(sessionFile && isAbsolute(sessionFile));
  assert.equal(existsSync(sessionFile), false);

  const firstUser = manager.appendMessage(user("question"));
  const firstAssistant = manager.appendMessage(assistant("answer"));
  manager.appendMessage(user("main follow-up"));
  manager.appendMessage(assistant("main answer"));
  assert.equal(existsSync(sessionFile), true);

  const projectSessions = await SessionManager.list(cwd, sessionDir);
  const customDirSessions = await SessionManager.listAll(sessionDir);
  assert.equal(projectSessions[0]?.path, sessionFile);
  assert.equal(customDirSessions[0]?.path, sessionFile);

  const opened = SessionManager.open(sessionFile);
  assert.equal(opened.getCwd(), cwd);
  assert.equal(opened.getEntries().length, 4);
  assert.deepEqual(
    opened.getBranch().map((entry) => entry.id),
    opened.getEntries().map((entry) => entry.id),
  );

  opened.branch(firstAssistant);
  const alternateUser = opened.appendMessage(user("alternate follow-up"));
  const alternateLeaf = opened.appendMessage(assistant("alternate answer"));
  assert.deepEqual(
    opened.getBranch().map((entry) => entry.id),
    [firstUser, firstAssistant, alternateUser, alternateLeaf],
  );
  assert.equal(opened.getTree()[0]?.children[0]?.children.length, 2);

  const nonmatchingCwd = join(root, "other-project");
  await mkdir(nonmatchingCwd);
  const nonmatching = SessionManager.create(nonmatchingCwd, sessionDir);
  nonmatching.appendMessage(user("other question"));
  nonmatching.appendMessage(assistant("other answer"));
  const nonmatchingFile = nonmatching.getSessionFile();
  assert.ok(nonmatchingFile);
  const future = new Date(Date.now() + 60_000);
  await utimes(nonmatchingFile, future, future);

  const continued = SessionManager.continueRecent(cwd, sessionDir);
  assert.equal(continued.getSessionFile(), sessionFile);
  assert.equal(continued.getCwd(), cwd);

  const missingCwd = join(root, "missing-project");
  await mkdir(missingCwd);
  const noMatch = SessionManager.continueRecent(missingCwd, sessionDir);
  assert.equal(noMatch.getEntries().length, 0);
  assert.equal(noMatch.getCwd(), missingCwd);
  assert.notEqual(noMatch.getSessionFile(), nonmatchingFile);

  const parentFile = continued.getSessionFile();
  const parentId = continued.getSessionId();
  assert.ok(parentFile);
  const extractedFile = continued.createBranchedSession(alternateLeaf);
  assert.ok(extractedFile && extractedFile !== parentFile);
  assert.equal(continued.getSessionFile(), extractedFile);
  assert.notEqual(continued.getSessionId(), parentId);
  assert.equal(continued.getHeader()?.parentSession, parentFile);
  assert.equal(continued.getBranch().length, 4);

  const forkCwd = join(root, "fork-project");
  const forkDir = join(root, "fork-sessions");
  await mkdir(forkCwd);
  const forked = SessionManager.forkFrom(parentFile, forkCwd, forkDir);
  assert.equal(forked.getCwd(), forkCwd);
  assert.equal(forked.getHeader()?.parentSession, parentFile);
  assert.equal(SessionManager.inMemory(cwd).getSessionFile(), undefined);

  console.log("session fixture passed");
} finally {
  await rm(root, { recursive: true, force: true });
}
```

</Accordion>
</Accordions>

## 5. Riêng tư và cleanup

Hãy coi session file như source code cộng với operational log. File có thể chứa prompt, model output, tham số và kết quả Tool, local path, image và dữ liệu extension. Chỉ cấp quyền truy cập thư mục lưu trữ cho application account, kiểm tra path tại trust boundary, mã hóa backup khi phù hợp và không bao giờ commit session hoặc credential vào repository.

Lịch retention, redaction và backup thuộc trách nhiệm của host application hoặc operator; `SessionManager` không có `redact()` hay retention hook như guide cũ. Hãy dừng và dispose session trước khi bảo trì bên ngoài. Trong selector `/resume` ở chế độ interactive, nhấn `Ctrl+D` rồi xác nhận để xóa session đã chọn; Pi dùng lệnh trash của hệ thống khi có. Với SDK cleanup, chỉ xóa resolved file do `getSessionFile()` trả về sau khi xác minh nó nằm trong session directory dự kiến.

Hãy backup file trước khi nâng cấp hoặc cleanup hàng loạt. Loader tự migrate v1 lên v2 rồi v2 lên v3 khi mở session cũ hợp lệ, đồng thời ghi lại theo định dạng hiện tại. Để `SessionManager.open()` thực hiện migration; đừng tự parse, sửa hoặc ghi `version`.

## Các lỗi thường gặp

- **Gọi `save()`:** API hiện tại không có bước save. `AgentSession` append event đã hoàn tất qua manager.
- **Chờ file quá sớm:** persistent session mới được giữ trong memory cho đến assistant message đầu tiên. Crash có thể làm mất response đang chạy đó. Các entry hoàn tất sau này được append đồng bộ, còn dòng JSONL lỗi—kể cả phần đuôi dở dang—bị bỏ qua khi reload; đây là cơ chế phục hồi, không phải bảo đảm atomic durability.
- **Nhiều writer dùng chung một file:** implementation không có inter-process lock. Chỉ dùng một manager/process đang hoạt động cho mỗi file và đừng sửa file khi nó đang mở. Kết luận này dựa trên các đường append và rewrite đồng bộ, không phải concurrency contract.
- **Nhầm quy tắc lưu trữ của CLI và SDK:** CLI xét `--session-dir`, rồi `PI_CODING_AGENT_SESSION_DIR`, rồi `sessionDir` trong `settings.json`. Lời gọi SDK trực tiếp không đọc chuỗi ưu tiên này; hãy truyền `sessionDir` tường minh hoặc dùng mặc định.
- **Truyền project path vào `listAll()`:** đối số string đầu tiên là storage directory. Dùng `list(cwd)` cho một project hoặc `listAll()` không đối số cho mọi thư mục project mặc định.
- **Vô tình override `cwd`:** ưu tiên absolute `SessionInfo.path` do các hàm list trả về và để `open()` khôi phục working directory trong header.

## Tiếp theo

- [Chương 10: Quản lý session](../ch10-session.md) giải thích JSONL tree, phép chiếu có xét compaction, rewind và các ranh giới rewrite.
- [Tham chiếu: Cấu hình](../reference/configuration.md) liệt kê các thiết lập session và resource hiện tại.
