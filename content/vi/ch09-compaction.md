---
title: 'Chương 9: Nén ngữ cảnh'
description: Cách Pi tóm tắt phần hội thoại cũ nhưng vẫn giữ message gần đây và lịch sử phân nhánh.
translation_key: ch09-compaction
language: vi
chapter: 9
source_url: 'https://www.dgzhuya.com/modules/ch09-compaction'
official_refs:
  - 'https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/compaction.md'
terms_used:
  - Context Compaction
  - CompactionEntry
  - BranchSummaryEntry
  - Session
status: reviewed
last_updated: '2026-08-24'
translator: Pify maintainers
reviewed_by: Pify maintainers
---
Nén ngữ cảnh (context compaction) thay phần history cũ bằng một summary có cấu trúc, đồng thời giữ nguyên các message gần đây. Pi dùng cơ chế này để tiếp tục session dài mà không gửi toàn bộ transcript trong mỗi model call.

## 1. Ngưỡng kích hoạt

Automatic compaction chạy khi lượng context ước tính vượt boundary sau:

```text
contextTokens > contextWindow - reserveTokens
```

`reserveTokens` chừa chỗ cho model response tiếp theo. Giá trị mặc định hiện tại là 16.384 token. Người dùng cũng có thể chạy thủ công `/compact [instructions]`.

Provider overflow có thể kích hoạt compaction và retry dù ước tính token local vẫn thấp hơn threshold.

## 2. Chọn cut point

Pi đi ngược từ message mới nhất và cộng token ước tính cho tới `keepRecentTokens`, mặc định là 20.000. Message sau cut point được giữ nguyên; message cũ hơn được tóm tắt.

```text
history cũ                           recent tail
[user][assistant][tool result] | [user][assistant][tool result]
                                 ^
                          firstKeptEntryId
```

Cut point hợp lệ phải giữ message semantics. Pi có thể cắt tại boundary của user, assistant, bash-execution, custom-message hoặc branch-summary. Nó không cắt tại một Tool result đứng riêng vì như vậy result sẽ tách khỏi call tương ứng.

## 3. Split turn

Một turn bắt đầu bằng user message và bao gồm các assistant message cùng Tool message tiếp theo cho tới user message kế tiếp. Thông thường, Pi cắt giữa hai turn.

Một turn lớn có thể tự vượt `keepRecentTokens`. Khi đó Pi giữ phần mới nhất của turn và tạo summary riêng cho prefix cũ. Summary cuối ghép:

1. history trước đó, bao gồm compaction summary cũ nếu có;
2. prefix của turn hiện tại bị quá dài.

Cách này giữ quan hệ giữa user request đang hoạt động, tool call và các result gần đây.

## 4. Tạo summary có cấu trúc

Pi serialize các message được chọn thành text có label trước khi tóm tắt. Tool output được truncate trong bước serialization để summary request không vượt budget.

Summary mặc định ghi:

- mục tiêu và constraint của người dùng;
- phần việc đã xong, đang làm và bị chặn;
- decision quan trọng cùng rationale;
- bước tiếp theo;
- identifier và context thiết yếu;
- file đã đọc và file đã sửa.

Summary hữu ích phải giữ state cần để tiếp tục. Nó không nên kể lại mọi message hoặc tự bịa rationale còn thiếu.

## 5. Thêm compaction entry

Summary được thêm vào session dưới dạng entry mới; entry cũ không bị xóa.

```typescript
interface CompactionEntry<T = unknown> {
  type: "compaction";
  id: string;
  parentId: string;
  timestamp: number;
  summary: string;
  firstKeptEntryId: string;
  tokensBefore: number;
  usage?: Usage;
  fromHook?: boolean;
  details?: T;
}
```

`firstKeptEntryId` xác định vị trí bắt đầu của verbatim tail. Session format mới hơn có thể lưu thêm materialized retained tail để compaction trở thành self-contained checkpoint.

`usage` ghi model work dùng để tạo summary. `details` mặc định theo dõi file đã đọc và file đã sửa.

## 6. Dựng lại model context

Cho request tiếp theo, session logic tạo:

```text
system prompt
+ compaction summary
+ retained recent messages
+ messages appended after compaction
```

Toàn bộ JSONL history vẫn còn để navigation và audit. Compaction thay active model context, không thay historical record.

## 7. Compaction lặp lại

Trong lần compaction sau, Pi đưa summary trước vào iterative context và tóm tắt từ kept boundary cũ. Nhờ đó, message sống sót qua một lần compaction không bị tách vĩnh viễn khỏi summary kế tiếp.

Giá trị `tokensBefore` mới được tính từ rebuilt context sắp bị thay, không tính từ raw size của session file.

## 8. Branch summarization

Navigation trong session tree giải quyết một vấn đề liên quan. Khi `/tree` chuyển từ branch này sang branch khác, Pi có thể tóm tắt branch sắp rời rồi thêm `BranchSummaryEntry` tại target path.

```text
        B -- C -- D     branch sắp rời
       /
A ----+
       \
        E -- F -- [summary của B, C, D]
```

Pi tìm common ancestor sâu nhất, thu thập abandoned path, tạo summary có cấu trúc rồi gắn sau target leaf. Cách này mang phần việc hữu ích qua branch khác mà không merge raw transcript.

Compaction và branch summarization đều tích lũy file-operation metadata từ summary trước.

## 9. Setting và extension hook

Cấu hình automatic compaction trong global setting hoặc project setting:

```json
{
  "compaction": {
    "enabled": true,
    "reserveTokens": 16384,
    "keepRecentTokens": 20000
  }
}
```

Extension có thể quan sát hoặc thay process qua `session_before_compact`, xử lý terminal failure qua `session_compact_failed` và tùy chỉnh tree navigation qua `session_before_tree`.

Custom summary phải trả boundary hợp lệ và details có thể serialize thành JSON. Giữ supplied abort signal và ghi usage khi một model khác tạo summary.

## 10. Kiểm soát failure và chất lượng

Compaction làm mất thông tin, vì vậy cần test nó như một state-transfer operation:

1. Xác nhận active goal, constraint, decision và pending work vẫn còn.
2. Giữ chính xác path, command, error message và identifier khi chúng quan trọng.
3. Không giữ secret chỉ vì secret từng xuất hiện trong transcript.
4. Xác nhận mọi Tool result được giữ lại vẫn có đủ context để hiểu.
5. Theo dõi summary-generation failure tách biệt khỏi agent run ban đầu.
6. Cho phép manual compaction ngay cả khi automatic compaction bị tắt.

[Chương 10](ch10-session.md) giải thích JSONL tree lưu message, compaction checkpoint, summary, label và branch.
