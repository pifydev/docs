---
title: 'Chương 10: Lưu trữ và phân nhánh session'
description: Session JSONL, entry type, parent link, context reconstruction và SessionManager API trong Pi.
translation_key: ch10-session
language: vi
chapter: 10
source_url: 'https://www.dgzhuya.com/modules/ch10-session'
official_refs:
  - 'https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/sessions.md'
  - 'https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/session-format.md'
terms_used:
  - Session
  - Session Tree
  - SessionManager
  - CompactionEntry
  - BranchSummaryEntry
status: reviewed
last_updated: '2026-08-24'
translator: Pify maintainers
reviewed_by: Pify maintainers
---
Pi lưu hội thoại dưới dạng session JSONL append-only; các entry tạo thành một tree. Format này hỗ trợ tiếp tục công việc, phân nhánh từ entry cũ, compact active context và giữ abandoned path mà không rewrite transcript ban đầu.

## 1. Lưu trữ session

Coding agent mặc định lưu session trong `~/.pi/agent/sessions/` và nhóm chúng theo working directory.

```bash
pi -c                  # Continue the most recent session
pi -r                  # Browse previous sessions
pi --no-session        # Run without persistence
pi --name "my task"    # Set a display name
pi --session <path|id> # Open a specific session
pi --fork <path|id>    # Copy one branch into a new session
```

Dùng `/session` để xem active file, session ID, message count, token usage và cost.

## 2. JSONL append-only

Dòng đầu là session header. Mỗi dòng sau là một entry được encode thành JSON.

```json
{"type":"session","version":3,"id":"session-id","timestamp":"2026-08-24T00:00:00.000Z","cwd":"/project"}
{"type":"message","id":"entry-1","parentId":null,"timestamp":"2026-08-24T00:00:01.000Z","message":{"role":"user","content":"Inspect the tests","timestamp":1787529601000}}
{"type":"message","id":"entry-2","parentId":"entry-1","timestamp":"2026-08-24T00:00:02.000Z","message":{"role":"assistant","content":[],"provider":"anthropic","model":"claude-sonnet-4-6","usage":{},"stopReason":"stop","timestamp":1787529602000}}
```

Timestamp của session entry dùng persisted format do session schema định nghĩa. Pi AI message lồng bên trong vẫn giữ timestamp Unix millisecond riêng.

Append giúp tránh rewrite transcript đang tăng sau mỗi turn. Final line bị ghi dở có thể được phát hiện và xử lý mà không làm hỏng entry trước đó.

## 3. Entry type

Session format lưu nhiều loại dữ liệu ngoài message:

| Entry | Mục đích |
| --- | --- |
| `message` | User, assistant, Tool result hoặc agent message |
| `model_change` | Đổi provider/model cho entry tiếp theo |
| `thinking_level_change` | Đổi reasoning level |
| `compaction` | Summary checkpoint cho active context |
| `branch_summary` | Summary của branch bị rời khi navigation |
| `custom` | Extension state không đi vào model context |
| `custom_message` | Extension content có đi vào model context |
| `label` | Bookmark một entry tồn tại |
| `session_info` | Session metadata như display name |

Consumer nên switch theo `type` và giữ unknown entry khi migrate, trừ khi format version quy định khác.

## 4. Parent link tạo thành tree

Mỗi entry ngoài header có `id` riêng và `parentId`. Entry đầu của branch dùng `parentId: null`; mỗi entry sau trỏ tới entry đứng trước nó trên branch đó.

```text
entry-1 -- entry-2 -- entry-3 -- entry-4
                      \
                       entry-5 -- entry-6   current leaf
```

Entry chỉ lưu parent pointer. Child list được suy ra bằng cách index toàn bộ entry theo `parentId`. Cách này giữ mỗi lần append cục bộ và không phải rewrite row cũ khi tạo branch.

**Leaf** hiện tại xác định vị trí active. Active branch là path thu được khi đi theo parent link từ leaf về root rồi đảo thứ tự.

## 5. Branching và navigation

Các interactive command thao tác với tree:

| Command | Tác dụng |
| --- | --- |
| `/tree` | Chuyển current leaf tới entry khác, có thể tóm tắt branch sắp rời |
| `/fork` | Tạo session mới từ vị trí user-message cũ |
| `/clone` | Copy active branch sang session mới |
| `/resume` | Chọn session đã tồn tại |
| `/new` | Bắt đầu session mới |

Branching không xóa child entry cũ. Nó thay active path rồi append entry mới bên dưới vị trí đã chọn.

## 6. Dựng active context

`buildContextEntries()` đi qua active path và áp dụng session checkpoint. Sau đó `buildSessionContext()` tạo message, selected model và thinking level cho model call tiếp theo.

Khi path chứa compaction:

1. raw message cũ trong active context được thay bằng compaction summary;
2. retained tail được thêm;
3. entry append sau compaction vẫn giữ đúng thứ tự;
4. bản thân JSONL history không đổi.

Entry `custom` dành cho extension nhưng không đi vào model context. Entry `custom_message` thì có.

## 7. Compaction và branch summary

`CompactionEntry` xác định summary và retained boundary. Entry format mới có thể chứa materialized `retainedTail`, biến checkpoint thành self-contained record.

`BranchSummaryEntry` ghi path bị rời trong `/tree` navigation và gắn summary vào target branch. Cả hai entry type có thể chứa usage và extension-specific details.

Các summary này ảnh hưởng context reconstruction; chúng không merge hoặc xóa branch bên dưới.

## 8. SessionManager API

`SessionManager` cung cấp method tạo, liệt kê, append, duyệt tree và dựng context:

```typescript
import { SessionManager } from "@earendil-works/pi-coding-agent";

const session = SessionManager.create(process.cwd());

session.appendMessage({
  role: "user",
  content: "Review the authentication flow.",
  timestamp: Date.now(),
});

const context = session.buildSessionContext();
console.log(context.messages.length);
```

Các static entry point khác gồm `open()`, `continueRecent()`, `inMemory()` và `forkFrom()`. Tree method gồm `getBranch()`, `getTree()`, `getChildren()`, `branch()` và `createBranchedSession()`.

Dùng `SessionManager.inMemory()` cho test hoặc công việc tạm thời không được tạo file.

## 9. Quy tắc format và migration

Session file là application data. Hãy xử lý thận trọng:

1. Kiểm tra header version trước khi diễn giải entry field.
2. Parse một JSON object trên mỗi dòng và báo line number khi lỗi.
3. Giữ ID, parent link, Tool-call link và entry order.
4. Giữ unknown extension data ở dạng có thể serialize thành JSON.
5. Viết migration thành transform rõ ràng giữa từng version.
6. Không dịch role name, entry type, field name, provider ID hoặc model ID.

Copy file thủ công có thể mang theo working directory và credential context không phù hợp môi trường mới. Ưu tiên command fork và export trong tài liệu.

## 10. An toàn vận hành

Session file có thể chứa source code, prompt, Tool output, file path, model reasoning và extension data. Hãy bảo vệ chúng như record có thể nhạy cảm.

- Giới hạn filesystem access vào session directory.
- Redact secret trước khi ghi custom entry hoặc log.
- Không upload session trước khi review nội dung.
- Dùng atomic append và flush behavior phù hợp storage backend.
- Backup trước migration hoặc bulk rewrite.

Session tree là durable record; active model context là derived view được tạo từ một branch cùng summary và compaction checkpoint của branch đó.
