---
chapter: 10
slug: ch10-session
title_zh: "第10章：会话管理 —— 对话的存储、恢复与分叉"
title_en: "Chapter 10: Session Management — Storing, Resuming, and Forking Conversations"
title_vi: "Chương 10: Quản lý Session — Lưu trữ, khôi phục và phân nhánh cuộc hội thoại"
source_url: https://www.dgzhuya.com/modules/ch10-session
language: vi
version_pairs:
  zh: zh/src/ch10-session.md
  en: en/src/ch10-session.md
  vi: vi/src/ch10-session.md
original_chars: 6407
code_lines: 187
reading_minutes: 33
translator: hypnguyen1209
reviewed_by: null
last_updated: 2026-08-20
status: translated
official_refs: []
terms_used: []
code_blocks: 30
mermaid_blocks: 0
---

# Chuong 10: Quan ly phien — Luu tru, phuc hoi va phan nhanh hoi thoai

Khi ban ve thuat toan nen o Chuong 9, ta cu nhac di nhac lai mot khai niem — Session Tree. Ket qua nen (CompactionEntry) duoc luu tren Session Tree; `buildSessionContext()` xay context ma LLM can tu Session Tree.

Chuong nay tra loi: Session Tree rot cung la gi?

Nhung truoc khi giai thich Session Tree, phai tra loi mot cau hoi co ban hon — **du lieu phien thuc su duoc luu the nao?** Bai goc da bo qua cau hoi nay, nhung no moi la diem khoi dau that su cua chuong.

---

## 1. Van de: du lieu phien luu the nao?

8 chuong dau ta cu lam viec voi `context.messages` — no la mot mang luu hoi thoai cua luot hien tai. Nhung moi khi Agent khoi dong, mang nay tu dau den? Dong xong roi di ve dau?

Cau hoi nay dua den bai toan ky thuat co ban nhat: **du lieu phien duoc luu the nao?**

Cau hoi nay thuc te chua **hai bai toan con doc lap**, can tach ra:

- **Bai toan con A: luu o dau?** (moi truong luu tru)
- **Bai toan con B: hinh dang ra sao?** (cau truc du lieu)

Hai chieu nay truc giao — ban co the "dung mysql luu mang tuyen tinh", cung co the "dung file JSONL luu mot cay". Tron lan chung se khien thao luan sau bi lung tung. Ta trien khai tung cai rieng.

### Bai toan con A: luu o dau? (moi truong)

Neu ban da lam backend, phan ung dau tien co the la mysql / postgres dang database quan he — mot bang `messages` voi `user_id + role + content + timestamp`, group theo session id.

coding-agent cua Pi **khong di huong nay**. No chon **file JSONL cuc bo** — moi phien mot file `.jsonl`, luu trong thu muc du an cuc bo cua user. Mot dong mot entry, text thuan.

Tai sao chon file thay vi database? Dieu nay lien quan den dinh vi san pham cua coding-agent:

- **Mot user, chay cuc bo**: coding-agent la cong cu CLI, chay tren may cua user, khong co nhu cau "nhieu user dong thoi" hay "truy van xa may"; dong concurrency/indexing/transaction cua database la qua thiet ke
- **Phien theo du an**: `cd /project-a` mo lich su phien cua project a, `cd /project-b` mo lich su phien cua project b — thu muc `.pi/sessions/` cua moi du an chinh la luu tru hoi thoai cua du an do
- **Zero dependency, zero ops**: khong can cai mysql, khong can chay service, mo hop la dung duoc
- **Doc duoc, debug duoc**: JSONL la text thuan, co the `cat` / `grep` / mo thang trong editor, debug nhin ngay

Nhung Pi khong han chet duong nay. Tang agent-core cung cap interface `SessionStorage` (`harness/types.ts:440`), cho phep ung dung khac tu cai dat phien ban database. agent-core kem hai cai dat: `JsonlSessionStorage` (file) va `InMemorySessionStorage` (trong bo nho, de test). **Chu y**: `SessionManager` cua coding-agent (`session-manager.ts:758`) **khong cai dat** interface `SessionStorage` cua agent-core — chung la **hai cai dat doc lap**, coding-agent truc tiep doc ghi file JSONL cua no, khong qua tang truu tuong cua agent-core. Kieu sap xep "interface co nhung khong bat buoc tai su dung" nay la mot vi du that su ve khop noi long (loose coupling) giua cac goi ben trong Pi.

> Hien thuc: interface `SessionStorage` trong `packages/agent/src/harness/types.ts:440`; `JsonlSessionStorage` trong `packages/agent/src/harness/session/jsonl-storage.ts`; `SessionManager` doc lap cua coding-agent trong `packages/coding-agent/src/core/session-manager.ts:758` (khong cai dat cai truoc)

Vay lua chon tang "luu o dau": **coding-agent chon file JSONL cuc bo, nhung interface cho phep ung dung khac the database**. Tang nay giai quyet xong, tang tiep theo moi de ban.

### Bai toan con B: hinh dang ra sao? (cau truc)

Luu o dau da giai, nhung con mot cau hoi sau hon: **hinh thai logic cua du lieu hoi thoai la gi?**

Cau tra loi truc giac nhat: **mang tuyen tinh**. `messages = [msg1, msg2, msg3, ...]`, mot cai noi tiep mot cai. Cau truc nay don gian nhat, cung la dang mac dinh cua bang `messages` kieu mysql.

Nhung trong kich ban su dung that, hoi thoai **khong luon luon tuyen tinh**:

- **Thu lai**: Phan hoi cua Agent chang tot, ban muon "lui ve luot truoc" sinh lai
- **Phan nhanh**: ban muon tai mot node nao do thu hai cach khac nhau, so sanh ket qua
- **Lui lai**: di mot duong phat hien khong dung, muon quay ve ngo reo truoc

Neu hoi thoai la mang tuyen tinh, cac thao tac nghia la "xoa message phia sau roi viet lai". Xoa roi la het — the neu ban muon giu ban ghi ca hai nhanh? Vi du, truoc het thu cach A di den cung, roi quay lai thu cach B — ban ghi hoi thoai cua A cung can giu de so sanh.

Mang tuyen tinh khong the "phan nhanh khong mat du lieu". Cau tra loi cua Pi la **Session Tree** — to chuc lich su hoi thoai thanh mot **cay chi them vao, khong sua, khong xoa**. Lui lai/phan nhanh khong phai "xoa du lieu" ma la "di chuyen con tro".

| Chieu | Lua chon thong thuong | Lua chon cua Pi |
| --- | --- | --- |
| Luu o dau | mysql v.v. | File JSONL cuc bo (interface cho phep database) |
| Hinh dang | Mang tuyen tinh | Cay (Session Tree) |

Tiep theo ta dung mot hoi thoai that day du lam vi du, "trong" cay nay tung buoc mot.

---

## 2. Cung mot hoi thoai that xem cay truong the nao

Noi chung chung "Session Tree la mot cay chi them vao" kho ai hieu noi. Ta dung mot kich ban cu the: **debug mot loi auth**.

Tuong tuong ban mo Pi Agent va thuc hien 8 thao tac:

```
步骤 1: 切换到 Claude 4.6 模型（你想用更聪明的模型）
步骤 2: 你问 "auth.ts 里 salt 验证为什么失败？"
步骤 3: Agent 决定调 read 工具读 auth.ts
步骤 4: read 工具返回 auth.ts 的内容
步骤 5: Agent 分析后回复 "问题在 23 行，salt 没编码"
步骤 6: 你不太满意这个回答，回退到步骤 2 重来
步骤 7: 你换思路问 "先看 hash 函数的实现"
步骤 8: Agent 调 grep + read 给出新的分析
```


Tiep theo xem 8 buoc nay lam cay phien truong tu "rong" thanh mot cay co nhanh the nao.

### Buoc 1: chuyen model, node dau tien len cay

Khi phien bat dau, dong dau tien cua file la Session Header (khong phai node cay, la metadata file). Sau do ban chuyen model, sinh ra node cay that su dau tien `ModelChangeEntry`:

```
e1: ModelChangeEntry
    parentId: null（根节点）
    payload: { model: "claude-sonnet-4-6" }
```


Cay bay gio chi co mot node:

```
e1 (model_change)
↑
leafId 在这
```


### Buoc 2: ban hoi, node UserMessage len cay

Ban go "tai sao xac minh salt trong auth.ts that bai?" — sinh ra e2 (UserMessage), voi parent tro ve e1:

```
e2: MessageEntry
    parentId: e1
    message:
      role: "user"
      content: [{ type: "text", text: "auth.ts 里 salt 验证为什么失败？" }]
```


Chu y `parentId: e1` — no tro ve "node truoc do", khong tro ve session header. Cay:

```
e1 (model_change)
 └── e2 (user message)
       ↑
     leafId
```


### Buoc 3: Agent goi tool read, node AssistantMessage len cay

Agent quyet dinh doc file truoc — sinh ra e3 (AssistantMessage co ToolCall):

```
e3: MessageEntry
    parentId: e2
    message:
      role: "assistant"
      content: [
        { type: "text", text: "让我读一下 auth.ts" },
        { type: "toolCall", id: "call_001", name: "read",
          arguments: { path: "src/auth.ts" } }
      ]
      stopReason: "toolUse"
```


AssistantMessage nay **dong thoi chua text va tool call** — chung duoc dat trong cung mot mang content, la cau truc ta da thay o Chuong 6.

```
e1 (model_change)
 └── e2 (user)
      └── e3 (assistant + ToolCall)
            ↑
          leafId
```


### Buoc 4: tool read tra ve ket qua, node ToolResult len cay

Sau khi tool thuc thi xong, mot node message ToolResult duoc sinh ra:

```
e4: MessageEntry
    parentId: e3
    message:
      role: "toolResult"
      toolCallId: "call_001"     ← 关联到 e3 里的 ToolCall
      content: [{ type: "text", text: "export function verifySalt(s) { ... }" }]
      isError: false
```


Chu y truong `toolCallId` — truong nay lien ket ToolResult nay voi ToolCall da kich hoat no. Day la "ket qua tool phai lien ket chinh xac ve yeu cau goi" da noi o Chuong 5, the hien o tang du lieu.

```
e1 (model_change)
 └── e2 (user)
      └── e3 (assistant + ToolCall)
           └── e4 (toolResult)
                 ↑
               leafId
```


### Buoc 5: Agent dua ra phan tich, lai mot AssistantMessage

Agent thay noi dung file va tra loi phan tich:

```
e5: MessageEntry
    parentId: e4
    message:
      role: "assistant"
      content: [{ type: "text", text: "问题在 23 行，salt 没编码" }]
      stopReason: "stop"
```


Den gio, 5 thao tac da sinh ra 5 node, tat ca deu nam tren mot duong thang — day la "nhanh chinh":

```
e1 (model_change)
 └── e2 (user: "salt 验证为什么失败?")
      └── e3 (assistant: read auth.ts)
           └── e4 (toolResult: auth.ts 内容)
                └── e5 (assistant: "问题在 23 行")
                      ↑
                    leafId
```


Den day ban thay "thao tac them vao" — moi buoc chi lam hai viec: tao node moi (co parentId) + di chuyen leafId. Khong co node cu nao bi sua.

### Buoc 6: lui lai — day la moc bat ngo

Ban khong hai long voi phan tich "van de o dong 23", muon thay doi cach tiep can. Luc nay ban thuc hien **lui lai** — nhung **khong co node nao bi xoa**:

```
branch(branchFromId: "e2"): void {
    this.leafId = "e2";   // 只改这一行
}
```


Thao tac chi mot dong: `leafId = "e2"`. Cay sau khi lui trong nhu the nay:

```
e1 (model_change)
 └── e2 (user: "salt 验证为什么失败?")
      ├── e3 (assistant: read auth.ts)        ← 旧分支还在
      │    └── e4 (toolResult)                     数据完整保留
      │         └── e5 (assistant: "问题在 23 行")
      │
      ↑ leafId 现在指回 e2
```


**e3, e4, e5 khong bi xoa** — chung van con tren cay, chi khong o "duong hien tai". Day la loi cot loi cua append-only: **lui lai khong phai xoa du lieu, ma la di chuyen con tro**.

Tai sao giu lai? Vi ban khong biet sau nay co muon quay lai nhanh cu khong. Co le cach moi di nua ngay khong ra ket qua, ban muon quay lai xem phan tich "van de o dong 23" ban dau. Neu lui lai ma xoa, se khong the nao khoi phuc.

### Buoc 7: doi cach, hoi lai — nhanh moi tu nhien moc

Tu diem reo e2, ban doi cau hoi, sinh node moi:

```
e6: MessageEntry
    parentId: e2   ← 跟 e3 共享同一个父！
    message:
      role: "user"
      content: [{ type: "text", text: "先看 hash 函数的实现" }]
```


Chu y — `parentId` cua e6 cung la `e2`, giong e3. Day la ban chat cua phan nhanh: **hai node cung chia mot parent la hai nhanh tren cay**.

```
e1 (model_change)
 └── e2 (user: "salt 验证为什么失败?")
      ├── e3 (assistant: read auth.ts)
      │    └── e4 (toolResult)
      │         └── e5 (assistant: "问题在 23 行")
      │
      └── e6 (user: "先看 hash 函数")    ← 新分支起点
            ↑
          leafId
```


### Buoc 8: nhanh moi tiep tuc truong

Agent tren nhanh moi goi tool grep + read, sinh ra 3 node moi (assistant + toolResult + assistant):

```
e1 (model_change)
 └── e2 (user: "salt 验证为什么失败?")
      ├── e3 (assistant: read auth.ts)
      │    └── e4 (toolResult)
      │         └── e5 (assistant: "问题在 23 行")
      │
      └── e6 (user: "先看 hash 函数")
           └── e7 (assistant: grep hash)
                └── e8 (toolResult: grep 结果)
                     └── e9 (assistant: 新分析)
                           ↑
                         leafId
```


Bay gio toan bo cay co 9 node, chia thanh hai nhanh. **Tat ca du lieu duoc bao ton tron ven** — ban co the quay lai nhanh e5 bat ky luc nao de tiep tuc, cung co the tiep tuc day tren nhanh e9.

Day la toan bo cau chuyen Session Tree: **hoi thoai la mot cay, moi message la mot node, lui lai/phan nhanh khong xoa du lieu, chi di chuyen con tro**.

Session Tree: bien doi trang thai chi them vao

**Chu thich hinh:** ba snapshot the hien su tien hoa cua cay — 1. hien tai o A2 -> 2. nguoi dung lui ve A1 (chi di chuyen leafId, node A2 van tren cay thanh dut net, O(1)) -> 3. tu A1 moc len nhanh moi B1->B2. Cac nhanh "bi bo" khong bao gio bi xoa — day la luat sat cua append-only. Chu thich phia duoi: do = vi tri leafId hien tai, xanh = nhanh moi, dut net xam = nhanh bi bo nhung van bao ton.

---

## 3. Giai phau cua node tren cay

Da xem cay truong the nao, bay gio xem chi tiet node.

### Mot MessageEntry day du trong nhu the nay

AssistantMessage o buoc 3, trong file .jsonl, la mot dong nhu the nay:

```
{
  "type": "message",
  "id": "e3",
  "parentId": "e2",
  "timestamp": "2026-07-03T10:23:45.000Z",
  "message": {
    "role": "assistant",
    "content": [
      { "type": "text", "text": "让我读一下 auth.ts" },
      { "type": "toolCall", "id": "call_001", "name": "read",
        "arguments": { "path": "src/auth.ts" } }
    ],
    "model": "claude-sonnet-4-6",
    "stopReason": "toolUse",
    "usage": { "input": 1250, "output": 80 }
  }
}
```


Đọc chuỗi JSON này bạn sẽ nắm trọn tinh hoa của Session Tree:

| Trường | Tác dụng | Động cơ thiết kế |
| --- | --- | --- |
| `type: "message"` | Phân biệt loại node | Trên cây không chỉ có message, còn có `model_change`, `compaction` và nhiều loại khác |
| `id: "e3"` | Định danh duy nhất của node | Các node khác tham chiếu đến nó qua `parentId` |
| `parentId: "e2"` | Trỏ đến node cha | **nhận cha không nhận con (认父不认子)** — node không biết mình có những node con nào |
| `timestamp` | Thời điểm tạo | Dùng để sắp xếp, debug |
| `message` | Payload message thực sự | Các trường `role` + `content` + `model` (Chương 6 đã trình bày) |

**Điểm mấu chốt: `parentId` là một chiều.** Node biết mình đến từ đâu (`parentId`), nhưng node cha không biết mình có những node con nào. Đây không phải sơ suất — đó là chủ đích thiết kế: nếu node cha phải duy trì một danh sách `children`, thì khi thêm node con mới phải sửa node cha, vi phạm nguyên tắc append-only. **Vì vậy "nhận cha không nhận con" (认父不认子) là điều kiện cần của append-only.**

### 9 loại Entry, phân nhóm theo trách nhiệm

Ví dụ ở §2 đã xuất hiện bốn loại node: `model_change`, `user`, `assistant`, `toolResult`. Thực tế Pi định nghĩa tổng cộng **9 loại Entry**. Nghe có vẻ nhiều, nhưng **chia theo "tác động lên lệnh gọi LLM" thành ba nhóm** là rõ ngay:

**Nhóm 1: Vào context của LLM (4 loại)**

4 loại này cuối cùng trở thành một phần tử trong mảng messages, được gửi cho LLM thấy:

| Loại | Sinh ra message gì | Ví dụ |
| --- | --- | --- |
| `MessageEntry` | UserMessage / AssistantMessage / ToolResultMessage | Tất cả message hội thoại ở bước 2–5 |
| `CustomMessageEntry` | CustomMessage (message tuỳ biến ở Chương 6) | Message đặc biệt do extension tiêm vào |
| `CompactionEntry` | CompactionSummaryMessage (thay thế message cũ) | Kết quả nén ở Chương 9 |
| `BranchSummaryEntry` | BranchSummaryMessage (tóm tắt nhánh bị bỏ) | Trình bày ở §4 phía sau |

**Nhóm 2: Ảnh hưởng lệnh gọi LLM sau đó (2 loại)**

2 loại này không sinh message, nhưng thay đổi tham số của các lệnh gọi LLM tiếp theo:

| Loại | Thay đổi gì | Ví dụ |
| --- | --- | --- |
| `ModelChangeEntry` | Model nào sẽ được dùng về sau | Bước 1 chuyển sang Claude 4.6 |
| `ThinkingLevelChangeEntry` | Mức độ suy nghĩ về sau | Người dùng chỉnh cường độ suy nghĩ |

**Nhóm 3: Metadata thuần, không ảnh hưởng LLM (3 loại)**

3 loại này vừa không sinh message, vừa không đổi tham số LLM — thuần tuý phục vụ UI hoặc extension:

| Loại | Làm gì |
| --- | --- |
| `LabelEntry` | Dán nhãn cho một node ("đây là điểm quan trọng") |
| `SessionInfoEntry` | Metadata của session (tên, người tạo, v.v.) |
| `CustomEntry` | Metadata do extension tự lưu |

**Sao phải chia nhỏ loại thế?** Vì `buildSessionContext()` (sẽ trình bày ở mục kế tiếp) cần phân loại để xử lý — message thì đẩy vào mảng messages, biến đổi trạng thái thì sửa biến trạng thái, metadata thì bỏ qua. Nếu chỉ có một loại, logic xử lý sẽ đầy chuỗi `if-else`, vừa khó đọc vừa khó mở rộng.

9 loại Entry trên Session Tree

Ghi đè chính sách dark mode.
  prose.css mặc định áp `invert(1) hue-rotate(180deg)` cho `.prose figure svg`.
  Khi `darkMode="native"` hoặc `"none"`, ta cần thoát khỏi filter này.
  Vì `<img src="*.svg">` được render thành phần tử `<img>` (không phải inline SVG), selector toàn cục `.prose figure svg` không khớp nó — nhưng nếu trang chủ inline SVG vào DOM thì cần ghi đè này.
  Quy tắc dưới đây thoát filter một cách chiến lược cho trường hợp inline SVG.

**Chú thích hình:** Mọi Entry đều chia sẻ các trường cơ sở (`type` / `id` / `parentId` / `timestamp`), chia theo "tác động lên lệnh gọi LLM" thành ba nhóm — ① Vào context (4 loại, đỏ, sẽ đẩy vào mảng messages); ② Ảnh hưởng trạng thái (2 loại, đen, chỉ sửa biến `model` / `thinkingLevel`); ③ Metadata thuần (3 loại, xám nét đứt, `buildSessionContext` bỏ qua). Phân loại này quyết định logic phân phối của `buildSessionContext` ở mục kế tiếp.

> Định nghĩa kiểu nằm trong union type `SessionEntry` tại `packages/agent/src/harness/types.ts`

### Vì sao "nhận cha không nhận con" (认父不认子) là điều kiện cần của append-only

Quay lại thiết kế `parentId`. Nếu đổi thành "nhận con không nhận cha" — node con không có `parentId`, nhưng node cha có danh sách `children` — thì sao?

Quay lại bước 7, bạn cần mọc nhánh mới e6 từ e2. Theo kiểu "nhận con", danh sách `children` của e2 sẽ đổi từ `[e3]` thành `[e3, e6]` — **việc này đòi hỏi sửa e2**. Nhưng append-only cấm sửa node, thế là mâu thuẫn.

Vì vậy **chỉ "nhận cha không nhận con" mới giúp thao tác thêm vào không phải sửa node cũ nào**. Nghe thì phản trực giác ("trong cây thường node cha biết node con") nhưng hoàn toàn hợp lý.

---

## 4. Ba thao tác cốt lõi + tóm tắt nhánh

Với ví dụ cụ thể ở §2, giờ có thể trình bày cùng lúc ba thao tác cốt lõi và tóm tắt nhánh.

### Thao tác 1: append — O(1), không sửa node cũ nào

Thao tác append chỉ có ba bước:


```
1. 创建新 Entry（含自己的 id、parentId 指向当前 leafId、payload）
2. 存入 byId 映射表（id → entry）
3. leafId = 新 entry 的 id
```


Quay lại bước 3 (sinh ra node e3):


```
appendEntry({ type: "message", id: "e3", parentId: "e2", message: ... });
// 内部:
//   byId.set("e3", newEntry);
//   this.leafId = "e3";
```


**e2 không hề bị sửa** — ta chỉ tạo e3 với `parentId` trỏ đến e2. e2 không hề hay biết mình có thêm một node con, nhưng tra ngược bảng `byId` sẽ tìm ra tất cả node có `parentId` trỏ đến nó. Đó chính là ý nghĩa của "nhận cha không nhận con + tra ngược qua `byId`": node cha không lưu danh sách con, chỉ mục toàn cục lo việc đó.

Chi phí? Thêm một lần `Map.has()` cho mỗi lần append. Không đáng kể. Đổi lại, mọi node cũ đều bất biến, mọi con trỏ `parentId` đều vĩnh viễn hợp lệ, và bạn có thể tua lại/phân nhánh tuỳ ý mà không phải sửa chồng lan truyền.


### Thao tác 2: lui lại — chỉ di chuyển leafId


```
branch(branchFromId: "e2"): void {
    if (!this.byId.has(branchFromId)) {
        throw new Error(`Entry ${branchFromId} not found`);
    }
    this.leafId = "e2";   // 核心就是这一行
}
```


**Toàn bộ cốt lõi chỉ là dòng `leafId = branchFromId`** (cộng thêm một kiểm tra tồn tại để tránh trỏ vào node không có). Không xóa e3, e4, e5 — chúng vẫn còn trong `byId`, vẫn còn trong file `.jsonl`. `leafId` là con trỏ duy nhất có thể thay đổi; mọi thứ khác đều bất biến. Đó là lý do `branch()` đạt O(1):

- Không phải tái cấu trúc cây
- Không phải ghi lại file
- Không phải tính "đường đi hiện tại mới" (lần append kế tiếp sẽ tự nhiên bắt đầu từ e2)

Nếu bạn chỉ muốn thử lại sạch sẽ mà không giữ gợi ý lịch sử nào, `branch()` là đủ. Nhưng Pi còn cung cấp một tuỳ chọn chu đáo hơn — sinh tóm tắt nhánh bị bỏ, treo nó lên nhánh mới để Agent biết "trước đó đã thử X, kết luận là Y":


### Thao tác 3: phân nhánh — kết quả tự nhiên của append sau khi lui lại

### Tóm tắt nhánh: BranchSummaryEntry — tuỳ chọn khi lui lại


```
branchWithSummary(fromId: "e5"): Promise<void> {
    // 1. 把 e3-e5 这段被抛弃的分支喂给 LLM 生成一份结构化摘要
    // 2. 创建一个新的 BranchSummaryEntry，其 parentId 指向 e2（与 e3-e5 同父）
    // 3. 摘要内容是结构化的（Goal / Progress / Decisions 等，跟压缩摘要格式一样）
}
```


Sau khi treo lên, cây trở thành:


```
e2 (user)
 ├── e3 (assistant: read auth.ts)
 │    └── e4 (toolResult)
 │         └── e5 (assistant: "问题在 23 行")
 │
 ├── e_BranchSummary (BranchSummaryEntry: "之前试过 read auth.ts，发现 salt 编码问题但未解决根因")
 │
 └── e6 (user: "先看 hash 函数")
      ...
```


**Khác biệt giữa `BranchSummaryEntry` và message thường**: nó là "lời trăn cuối" của nhánh bị bỏ, không phải đoạn hội thoại thực sự xảy ra. `buildSessionContext` sẽ chuyển nó thành một **`BranchSummaryMessage`** (phân biệt với `CompactionSummaryMessage` do compaction sinh ra — hai loại message khác nhau; xem `createBranchSummaryMessage` tại `session-manager.ts:397` so với `createCompactionSummaryMessage` tại `:403`; Chương 6 đã trình bày `convertToLlm` dịch cái này thành UserMessage với thẻ `<summary>`). Vậy nên Agent trên nhánh mới sẽ thấy: "Trước đó đã thử X, kết luận là Y" — nó biết lịch sử, nhưng không bị nhấn chìm trong chi tiết của nhánh cũ.

**Việc này là tuỳ chọn** — nếu thấy nhánh cũ hoàn toàn không quan trọng, cứ gọi `branch()`, không cần sinh tóm tắt. `branchWithSummary()` dành cho tình huống muốn giữ tinh hoa lịch sử mà không giữ nguyên cả đoạn hội thoại.

> Triển khai: `branchWithSummary` trong `packages/coding-agent/src/core/session-manager.ts`; phần sinh tóm tắt tái sử dụng prompt có cấu trúc từ Chương 9.

---

## 5. Từ cây sang context LLM: buildSessionContext

Cây đã mọc xong, nhưng **LLM không hiểu cây**. API của LLM chỉ nhận một **mảng `messages` tuyến tính** (Chương 6: ba loại `user` / `assistant` / `toolResult`). Vì vậy trước mỗi lần gọi LLM, phải "trải phẳng" cây thành mảng. Đó là việc của `buildSessionContext()`.

### Vì sao bước này phải tồn tại

Hãy tưởng tượng góc nhìn của LLM: bạn gửi cho nó một HTTP request, body là `messages: [...]` — một mảng. Nó không biết lịch sử hội thoại của bạn là cây hay mảng; nó chỉ thấy mảng `messages`.

Nên bất kể cấu trúc dữ liệu nội bộ phức tạp đến đâu, **tại ranh giới LLM nó phải trở thành tuyến tính**. Đây là "cửa ra" của Session Tree — dạng lưu trữ là cây, nhưng dạng xuất ra là mảng `messages` tuyến tính.

### Bước 1: duyệt đường đi — từ leaf đi ngược về root

Quay lại ví dụ của ta, `leafId` hiện tại là e9. `buildSessionContext` trước tiên đi từ e9 ngược về root, thu thập tất cả entry dọc đường đi:


```
const path: SessionEntry[] = [];
let current = byId.get(leafId);   // e9
while (current) {
    path.push(current);   // 先按 leaf → root 顺序收集
    current = current.parentId ? byId.get(current.parentId) : undefined;
}
path.reverse();           // 反转为 root → leaf 顺序
```


Sau khi đi xong, mảng `path` (theo thứ tự root → leaf) là:


```
[e1, e2, e6, e7, e8, e9]
```


**Chú ý e3, e4, e5 không có trong `path`** — chúng không nằm trên nhánh hiện tại. Đó là ý nghĩa của "đường đi hiện tại" — chỉ nhìn duy nhất một đường từ leaf về root. Dữ liệu ở các nhánh khác không được gửi cho LLM.

### Bước 2: phân phối theo loại

Mỗi entry trên đường đi được xử lý tuỳ theo loại:


```
e1 (model_change)   → 更新状态变量 model = "claude-sonnet-4-6"，不进 messages
e2 (user message)   → 推入 messages 数组
e6 (user message)   → 推入 messages 数组
e7 (assistant + ToolCall) → 推入 messages 数组
e8 (toolResult)     → 推入 messages 数组
e9 (assistant)      → 推入 messages 数组
```


Cuối cùng, mảng `messages` được dựng lên trông như sau:


```
[
  { role: "user", content: "auth.ts 里 salt 验证为什么失败?" },        // e2
  { role: "user", content: "先看 hash 函数的实现" },                    // e6
  { role: "assistant", content: [{ text: ... }, { toolCall: grep ...}] }, // e7
  { role: "toolResult", toolCallId: "call_002", content: ... },        // e8
  { role: "assistant", content: [{ text: "新分析..." }] }              // e9
]
```


Có một điểm tinh tế: **e2 và e6 đều là user message — hai user liên tiếp**. Giao thức API của LLM có cho phép vậy không? Hầu hết provider cho phép, nhưng có cái yêu cầu gộp. Pi xử lý việc gộp này ở tầng `convertToLlm` (quy tắc chuyển đổi đã trình bày ở Chương 6).

### Biến trạng thái: trích theo kiểu ghi đè

`model_change` và `thinkingLevel_change` không đi vào mảng `messages`, nhưng chúng ảnh hưởng "gọi LLM bằng tham số gì". Cách trích là **kiểu ghi đè** — đi dọc đường từ root đến leaf, gặp biến đổi thì ghi đè:


```
e1 (model_change: "claude-sonnet-4-6")  → model 变量 = "claude-sonnet-4-6"
e2-e9（没有 model_change）              → model 变量保持不变
```


Nếu trên đường đi có nhiều `model_change` (ví dụ chuyển sang 4.6 trước, rồi 4.5, rồi lại 4.6), thì cái cuối cùng thắng — khớp với ngữ nghĩa "cái viết sau cùng có hiệu lực".

> **Giá trị khởi tạo dự phòng:** trong `buildSessionContext`, biến trạng thái `model` khởi tạo bằng `null` (`session-manager.ts:367`). Nếu trên đường đi **không hề có node `model_change` nào** (ví dụ chưa từng chuyển model), hàm trả về `model: null`; phía gọi (`agent-session-runtime`) sẽ dùng model khởi tạo lúc bắt đầu session làm dự phòng. Bản thân assistant message không mang thông tin "được sinh bởi model nào" — model hoàn toàn do các node `model_change` quyết định.

**Đó chính là lý do Pi lưu "chuyển model" thành node thay vì biến trạng thái** — node ghi lại đầy đủ "khi nào chuyển, tại vị trí nào", còn biến trạng thái chỉ giữ được giá trị cuối. Nếu bạn tua lại trước thời điểm chuyển model, đường đi của `buildSessionContext` không chứa `model_change` đó, nên `model` tự động quay về giá trị trước khi chuyển. **Biến trạng thái dạng node khiến thao tác tua lại tự nhiên đúng.**


### Xử lý đặc biệt CompactionEntry: thu thập chọn lọc


```
e1 (user)              ← 这之前是早期对话（已被压缩）
e2 (assistant)         ← 被压缩
e3 (assistant)         ← 被压缩
e4 (compaction)        ← 压缩节点，记录了 firstKeptEntryId = "e3"
e5 (user)              ← 压缩后保留的近期消息
e6 (assistant)
```


Khi `buildSessionContext` đi qua e4, nó **không đơn giản là "ngừng thu thập message trước đó"**, mà là **thu thập chọn lọc theo `firstKeptEntryId`**:

1. Trước tiên sinh một `CompactionSummaryMessage` (từ trường `summary` của e4) rồi đẩy lên đầu mảng `messages`
2. Trong các entry **trước** e4, chỉ thu thập những entry **từ `firstKeptEntryId` (e3) trở đi** — e1, e2 bị loại, e3 được giữ
3. Mọi entry **sau** e4 đều được thu thập bình thường

Mảng `messages` kết quả:


```
[
  CompactionSummaryMessage (从 e4 生成),   // 替换了 e1、e2
  { role: "assistant", ... },              // e3（保留区第一个）
  { role: "user", ... },                    // e5
  { role: "assistant", ... },              // e6
]
```


## 6. Chi tiết lưu trữ JSONL

### Định dạng: một Entry một dòng

**Đây chính là cách triển khai cụ thể của "kết quả nén thay thế message cũ" mà Chương 9 đã đề cập** — không thực sự xoá e1 và e2 (append-only cấm xoá); thay vào đó, `buildSessionContext` "nhảy qua" chúng khi duyệt dựa trên `firstKeptEntryId`. Lần sau nếu bạn tua lại trước e4, đường đi của `buildSessionContext` không chứa e4, và e1–e3 lại xuất hiện như message bình thường — nén không phá huỷ, nó chỉ là "góc nhìn trên đường đi hiện tại".

Chú ý `firstKeptEntryId` là trường do chính `CompactionEntry` ghi lại — nó đã được tính ngay khi compaction diễn ra: "giữ lại những message gần đây nào". Logic "tìm điểm cắt" ở Chương 9 chính là để xác định `firstKeptEntryId` này.

> Triển khai: `buildSessionContext` trong `packages/coding-agent/src/core/session-manager.ts` — lõi logic duyệt đường đi và phân phối theo loại.


```
{"type":"session","version":3,"id":"UUIDv7","cwd":"/project","timestamp":"2026-07-03T10:00:00Z"}
{"type":"model_change","id":"e1","parentId":null,"provider":"anthropic","modelId":"claude-sonnet-4-6","timestamp":"2026-07-03T10:00:05Z"}
{"type":"message","id":"e2","parentId":"e1","message":{"role":"user","content":[{"type":"text","text":"auth.ts 里 salt 验证为什么失败?"}]},"timestamp":"2026-07-03T10:23:00Z"}
{"type":"message","id":"e3","parentId":"e2","message":{"role":"assistant","content":[{"type":"text","text":"让我读一下 auth.ts"},{"type":"toolCall","id":"call_001","name":"read","arguments":{"path":"src/auth.ts"}}],"stopReason":"toolUse"},"timestamp":"2026-07-03T10:23:30Z"}
{"type":"message","id":"e4","parentId":"e3","message":{"role":"toolResult","toolCallId":"call_001","content":[{"type":"text","text":"export function verifySalt(s) { ... }"}],"isError":false},"timestamp":"2026-07-03T10:23:31Z"}
{"type":"message","id":"e5","parentId":"e4","message":{"role":"assistant","content":[{"type":"text","text":"问题在 23 行，salt 没编码"}],"stopReason":"stop"},"timestamp":"2026-07-03T10:24:00Z"}
{"type":"message","id":"e6","parentId":"e2","message":{"role":"user","content":[{"type":"text","text":"先看 hash 函数的实现"}]},"timestamp":"2026-07-03T10:30:00Z"}
{"type":"message","id":"e7","parentId":"e6",...}
```


Dòng đầu là Session Header (`type: "session"`), ghi lại metadata của session (`cwd`, phiên bản, v.v.). Mỗi dòng tiếp theo là một Entry.

**Một vài chi tiết đáng chú ý**:

1. **`parentId` của e6 là e2** — nhờ trường này mà nhìn vào file có thể thấy "chỗ này có phân nhánh". Chạy `grep '"parentId":"e2"'` sẽ tìm ra tất cả node con mọc ra từ e2.
2. **`timestamp` là chuỗi ISO** — con người đọc được, debug nhìn phát là biết thứ tự ngay.
3. **`id` là UUID ngắn 8 ký tự** (ví dụ `a1b2c3d4`) — tiết kiệm dung lượng so với UUID đầy đủ; xác suất trùng trong một session đủ thấp.

**Sao dùng JSONL thay vì một khối JSON duy nhất?** Vì JSONL hỗ trợ **append theo từng dòng** — Entry mới được nối thẳng vào cuối file qua `appendFileSync`, không cần đọc-sửa-ghi lại toàn bộ file. Điều này khớp hoàn hảo với thiết kế cây append-only: cây chỉ thêm, không sửa; file chỉ thêm, không viết lại.

> Triển khai: `_appendEntry` (khoảng L941) trong `packages/coding-agent/src/core/session-manager.ts`, dùng `appendFileSync`.

### Ghi lười: tránh hội thoại dở dang "có hỏi không đáp"

Có một chi tiết chính sách ghi: **việc ghi bị trì hoãn cho đến khi message assistant đầu tiên tới**. Quy tắc chia bốn trường hợp:

| Đã có assistant? | Đã flush? | Hành vi |
| --- | --- | --- |
| Không | Rồi | Append entry hiện tại ngay |
| Không | Chưa | Đánh dấu "chưa flush", **không ghi xuống đĩa** — đợi assistant |
| Có | Chưa | **Viết lại toàn bộ file** (header + mọi entry đang đệm), dùng `openSync("wx") + writeFileSync` để bảo đảm tính nguyên tử, đánh dấu đã flush |
| Có | Rồi | Append entry hiện tại ngay |

Sao lại phức tạp vậy? Để tránh để lại hội thoại dở dang kiểu "có hỏi không đáp" — người dùng hỏi một câu nhưng Agent không trả lời (mạng rớt, API lỗi, v.v.). Nếu mỗi message của người dùng đều flush ngay, lần mở sau sẽ thấy một message user lẻ loi treo đó không có câu trả lời tương ứng. Bằng cách trì hoãn ghi hàng loạt cho đến khi message assistant đầu tiên tới, bất cứ thứ gì xuống đĩa đều được bảo đảm có ít nhất một cặp user↔assistant hoàn chỉnh.

Sau đó, mọi entry đều được append ngay — khi lần flush đầu tiên đã xong, cơ chế này không còn tác dụng vì ta đã "lên đường ray".

### Thỉnh thoảng ghi lại toàn bộ file

Mặc dù thường ngày dùng `appendFileSync`, có hai tình huống kích hoạt ghi lại toàn bộ file (`writeFileSync`):

- **Tạo bản sao nhánh**: khi nhân bản session ra một file `.jsonl` mới, cần sao chép tất cả entry trên đường đi hiện tại sang
- **Sửa file session bị hỏng**: khi thấy định dạng file bất thường, ghi lại cho đúng chuẩn

Ghi lại không phá vỡ nguyên tắc append-only — ghi lại sinh ra file mới hoặc định dạng mới, dữ liệu lịch sử gốc được bảo tồn đầy đủ trong nội dung mới.

> Triển khai: `_rewriteFile` trong `packages/coding-agent/src/core/session-manager.ts`, khoảng L876.

---

## 7. Hai lớp triển khai: interface cho phép đổi cơ sở dữ liệu

Session Tree có hai lớp triển khai, hồi đáp ý "interface cho phép đổi cơ sở dữ liệu" ở §1:

|  | Tầng agent-core | Tầng coding-agent |
| --- | --- | --- |
| **Phong cách API** | Bất đồng bộ | Đồng bộ |
| **Số loại Entry** | 11 loại | 9 loại |
| **Lưu trữ** | Interface `SessionStorage` (cắm rút được) | **Triển khai độc lập**, thao tác trực tiếp trên JSONL |
| **Mục đích** | Tầng framework khái quát | Tầng sản phẩm Coding Agent |

`agent-core` cung cấp framework quản lý Session khái quát và interface `SessionStorage`. **Nhưng chú ý: SessionManager của coding-agent KHÔNG triển khai interface này** — nó là bản triển khai **hoàn toàn độc lập**, thao tác trực tiếp trên file JSONL của riêng nó. Nó tái sử dụng định nghĩa kiểu của `agent-core` (như `SessionEntry`) nhưng không tái sử dụng abstraction lưu trữ. Hai bản triển khai tồn tại song song.

Sắp xếp "interface có nhưng coding-agent không tái sử dụng" này có hai hệ quả: (1) nếu muốn làm một bản Pi Agent trên web, bạn có thể **tự mình** triển khai `SessionStorage` bằng mysql, phần còn lại của `agent-core` không cần đụng tới; (2) nhưng bạn **không thể** cứ thế lấy SessionManager của coding-agent gắn vào interface `SessionStorage` của `agent-core` — chữ ký không tương thích. Đây là cách đáp xuống đất cụ thể của "interface cho phép đổi cơ sở dữ liệu" ở §1, nhưng con đường đáp là "mỗi bên tự triển khai" chứ không phải "kế thừa thống nhất".

> Interface `SessionStorage` ở `packages/agent/src/harness/types.ts:440`; hai triển khai tham chiếu: `packages/agent/src/harness/session/jsonl-storage.ts` (file) và `memory-storage.ts` (in-memory); bản triển khai độc lập của coding-agent ở `packages/coding-agent/src/core/session-manager.ts:758`.

---

## 8. Tổng kết

### Một mạch chính: hai chiều độc lập của lưu trữ session

Nhìn lại điều cốt lõi nhất bạn có thể mang đi từ chương này — **cách lưu dữ liệu session cần tách thành hai câu hỏi độc lập**:

| Chiều | Trả lời gì | Cách làm phổ biến | Lựa chọn của Pi |
| --- | --- | --- | --- |
| **Môi trường lưu trữ** | Lưu ở đâu? | Cơ sở dữ liệu kiểu mysql | File JSONL cục bộ (interface cho phép đổi) |
| **Cấu trúc dữ liệu** | Có hình thù gì? | Mảng tuyến tính | Cây (Session Tree) |

Hai chiều này có thể chọn độc lập. Lần sau khi thiết kế bất kỳ hệ thống "lưu trữ lịch sử hội thoại" hay lưu trạng thái tương tự, hãy tự hỏi hai câu này trước, rồi mới quyết định phương án — đừng dán chúng lại thành một cục.

### Tinh hoa của Session Tree: dùng cây + append-only để đạt "tua lại không mất dữ liệu"

Sao dùng cây? Vì hội thoại không tuyến tính — người dùng tua lại, thử lại, phân nhánh.
Sao dùng append-only? Vì dữ liệu đã xoá không lấy lại được, mà nhánh lịch sử có thể có giá trị.
Sao nhận cha không nhận con? Vì append-only đòi hỏi node bất biến, nên node cha không thể duy trì danh sách `children`.
Sao duyệt đường đi? Vì LLM chỉ hiểu mảng `messages` tuyến tính, dữ liệu hình cây phải được "trải phẳng".

**Chuỗi lựa chọn thiết kế này là mạch lạc** — mỗi lựa chọn đáp lại ràng buộc do lựa chọn trước mang lại, cuối cùng tạo thành một phương án tự hợp lý.

### Ba ý tưởng có thể mang đi

**1. Tách "lưu ở đâu" và "có hình thù gì" thành hai chiều.** Khi thiết kế hệ lưu trữ, hãy nghĩ rõ hai câu hỏi này trước, rồi kết hợp. Trộn chung vào một chỗ sẽ làm không gian lựa chọn bị nén — bạn sẽ nghĩ "dùng database thì phải mảng tuyến tính" hoặc "dùng file thì phải append-only", nhưng không nhất thiết vậy.

**2. Cấu trúc dữ liệu append-only cho các tình huống "undo / tua lại / phân nhánh".** Khi hệ thống cần những khả năng này, đừng xoá dữ liệu cũ. Dùng append-only + định vị bằng con trỏ (`leafId`) để giữ lịch sử đầy đủ. Giá là dung lượng lưu trữ, nhưng đĩa rẻ, dữ liệu là vô giá.

**3. Biến trạng thái dạng node, để tua lại tự nhiên đúng.** Pi cũng lưu "chuyển model" và "chỉnh mức suy nghĩ" thành node (`ModelChangeEntry` v.v.), thay vì nhét vào một đối tượng trạng thái toàn cục. Lợi ích là khi tua lại, biến trạng thái tự động về đúng giá trị lúc đó — duyệt đường đi chỉ thấy thay đổi trên đường đi hiện tại, tự động bỏ qua thay đổi đã bị tua qua. Đây là thiết kế đáng mượn cho dự án của bạn.

---

## 9. Trạm tiếp theo

Tính đến chương này, ta đã đi sâu vào cơ chế vận hành cốt lõi của Pi: Agent Loop (Ch.3), gọi model (Ch.4), hệ thống tool (Ch.5), hệ thống message (Ch.6), hướng sự kiện (Ch.7), context engineering (Ch.8), nén ngữ cảnh (Ch.9), quản lý session (Ch.10).

Nhưng vẫn còn một khả năng quan trọng ta chưa đề cập — **hệ thống extension (mở rộng)**. Mấy chương trước cứ nhắc đi nhắc lại "extension có thể chặn lệnh gọi tool", "extension có thể sửa message", "extension có thể tiền xử lý context". Pi làm sao để thêm khả năng cho Agent mà không đụng vào source code?

> **Ghi chú về các chương sau:** Tutorial hiện chỉ phủ đến Chương 10 (Quản lý session). Hệ thống extension, test mode, tổng kết tinh hoa thiết kế và các chủ đề nâng cao khác chưa được phủ; bạn đọc quan tâm có thể tham khảo source code và tài liệu tại [repo chính thức của pi](https://github.com/earendil-works/pi).

---

> **Chỉ mục source code chính của chương này**:
>
> `packages/agent/src/harness/types.ts` — Định nghĩa kiểu `SessionEntry`, interface `SessionStorage`
> `packages/agent/src/harness/session/jsonl-storage.ts` — Triển khai `JsonlSessionStorage`
> `packages/agent/src/harness/session/memory-storage.ts` — `InMemorySessionStorage` (dùng cho test)
> `packages/coding-agent/src/core/session-manager.ts` — `SessionManager` của coding-agent (`buildSessionContext`, `appendEntry`, `branchWithSummary`, v.v.)
> `packages/coding-agent/src/core/compaction/branch-summarization.ts` — Sinh tóm tắt nhánh

