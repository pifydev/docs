---
chapter: 9
slug: ch09-compaction
title_zh: "第9章：上下文压缩: 当对话太长怎么办"
title_en: "Chapter 9: Context Compaction: When the Conversation Gets Too Long"
title_vi: "Chương 9: Nén ngữ cảnh: Khi cuộc hội thoại quá dài"
source_url: https://www.dgzhuya.com/modules/ch09-compaction
language: vi
version_pairs:
 zh: zh/src/ch09-compaction.md
 en: en/src/ch09-compaction.md
 vi: vi/src/ch09-compaction.md
original_chars: 3944
code_lines: 183
reading_minutes: 20
translator: hypnguyen1209
reviewed_by: null
last_updated: 2026-08-20
status: translated
official_refs: []
terms_used: []
code_blocks: 20
mermaid_blocks: 0
---

# Chương 9: Context compaction: Hội thoại quá dài thì làm sao

Chương 8 đã xem toàn cảnh context engineering: trong đó `transformContext` chỉ là extension point; cơ chế cốt lõi "ra tay nén" thực sự là Compaction. Khi hội thoại ngày càng dài, message ngày càng nhiều, cuối cùng sẽ vượt context window của model (Claude 200K, GPT 128K). Lúc đó cần một việc quyết liệt hơn: **nén lịch sử hội thoại**.

Chương này xem Pi làm sao khi context window sắp đầy, nén 50 lượt hội thoại thành một đoạn tóm tắt, để Agent tiếp tục "nhớ" được trước đó đã xảy ra chuyện gì.

---

## 1. Vấn đề: hội thoại ngày càng dài, cửa sổ chứa không nổi

Hội thoại giữa Agent và LLM là "có trạng thái": mỗi lượt đều gửi toàn bộ lịch sử trước đó cho model. Bạn chat với Agent 50 lượt, mỗi lượt có thể có mấy nghìn token kết quả tool. Tính nhanh: 50 lượt x 3000 token/lượt trung bình = 150.000 token. Claude Sonnet có context window 200.000 token. Sắp đầy.

So sánh lượng token trước và sau khi nén

**Chú thích hình:** bên trái, thanh đỏ: 185K token gần đầy cửa sổ 200K. Bên phải, xanh lá: sau khi nén chỉ còn 60K (10K tóm tắt + 50K message gần đây), giải phóng 140K để tiếp tục chat. Phía dưới ghi chú nén có mất mát nhưng giữ thông tin có cấu trúc như mục tiêu, ràng buộc, quyết định.

Đầy thì sao? API báo lỗi: "prompt is too long". Hội thoại bị cắt ngang.

Cách giải trực giác nhất là xóa message cũ: quăng 30 lượt đầu, chỉ giữ 20 lượt gần nhất. Nhưng vậy thì Agent bị "mất trí nhớ": nó không nhớ ban đầu bạn bảo nó làm gì, những quyết định đã đưa ra trước đó, file nào đã sửa.

Cách giải của Pi là **Compaction (nén)**: biến message cũ thành một đoạn tóm tắt có cấu trúc, dùng tóm tắt thay thế message thô. Như vậy vừa giải phóng không gian, vừa giữ thông tin then chốt.

```
压缩前（185,000 token）：
┌── 第1-30轮（135,000 token）──┬── 第31-50轮（50,000 token）──┐
│  原始消息（大量工具结果）      │  原始消息（最近的上下文）      │
└──────────────────────────┴──────────────────────────┘

压缩后（约 60,000 token）：
┌── 摘要（约 10,000 token）──┬── 第31-50轮（50,000 token）──┐
│  结构化总结（目标、进度、     │  原始消息（完整保留）          │
│  决策、文件跟踪……）          │                              │
└────────────────────────┴──────────────────────────┘
```


Agent vẫn "nhớ" 30 lượt đầu đã làm gì: chỉ là ký ức đổi từ "bản ghi thô" thành "sổ tay tóm tắt".

### Một mốc thời gian then chốt: việc nén xảy ra giữa hai lượt hội thoại

Trước khi đọc mọi chi tiết phía sau, hãy khắc một mốc thời gian cốt lõi vào đầu: **nén không được kích hoạt trong lúc hội thoại đang diễn ra, nó xảy ra giữa hai lượt hội thoại**:

```
用户问 → Agent 回答 → (Agent 这一轮结束，发 agent_end 事件)
                              │
                              ▼
                     检查 token：超阈值了吗？
                              │
                   ┌──────────┴──────────┐
                   ▼                     ▼
                没超 → 等下一轮       超了 → 立刻压缩
                                       ├─ 找切割点
                                       ├─ 生成摘要
                                       └─ 把 CompactionEntry 写进 Session Tree
                                              │
                                              ▼
                              下一轮用户开始问时：
                              buildSessionContext() 从 Session Tree 重建上下文
                              → CompactionSummaryMessage 替代旧消息
                              → LLM 看到的是"摘要 + 近期消息"
```


**Đây là chìa khóa để hiểu cả chương**: mọi chi tiết (khi nào kích hoạt, cắt ở đâu, sinh tóm tắt thế nào, kết quả có hiệu lực ra sao) đều xoay quanh mốc "giữa hai lượt" này. Mỗi mục phía sau là một mắt xích cụ thể của tuyến chính đó.

```
function shouldCompact(contextTokens, contextWindow, settings): boolean {
    if (!settings.enabled) return false;
    return contextTokens > contextWindow - settings.reserveTokens;
}
```


---

## 2. Khi nào nén: đèn đỏ bật

### Điều kiện kích hoạt

Việc nén không được kích hoạt tùy tiện: nó có một "vạch đỏ" rõ ràng:

Thay số cụ thể vào: `contextWindow = 200.000`, `reserveTokens = 16.384`.

Khi `contextTokens > 200.000 - 16.384 = 183.616`, nén được kích hoạt.

`reserveTokens` là không gian dành cho phản hồi LLM: bạn không thể nhồi context window đầy đến 200.000, nếu không model không còn chỗ để trả lời.

### Ước lượng token: không chính xác nhưng đủ dùng

Câu hỏi then chốt: làm sao biết hiện tại có bao nhiêu token? Tính chính xác cần dùng tokenizer, nhưng model khác nhau có tokenizer khác nhau, và chi phí tính toán lớn. Pi dùng cách thô sơ:

```
// 实际签名（compaction.ts:256-296）：estimateTokens(message: AgentMessage): number
// 对每个 message 取其文本字符数 chars，然后 return Math.ceil(chars / 4)
function estimateTokens(message: AgentMessage): number {
    let chars = 0;
    // ...按 message.role 分别累加 text/thinking/toolCall/command/output/summary 的字符数
    return Math.ceil(chars / 4);  // chars / 4
}
```


Mot ky tu tieng Anh khoang 0,25 token (4 ky tu xap xi 1 token, uoc luong gan voi thuc te). **Tieng Viet/Trung la lech nguoc**: 1 chu Han thuc te khoang 1-2 token, nhung `chars/4` chi tinh la 0,25 token: **danh gia thap nghiem trong** doan hoi thoai co nhieu chu Han. Nghia la trong kich ban thuan Han, Pi thay "chua toi nguong nen" trong khi token thuc da gan gioi han tren. Day la van do do chinh xac da biet, nhung `chars/4` du chinh xac khi tieng Anh chiem chu dao, va hien thuc cuc ky don gian.

**Tai sao dung uoc luong khong chinh xac?** Vi than uoc cao con hon uoc thap. Uoc cao, te nhat la nen them mot lan (vo hai); uoc thap thi API bao loi (co hai). Day la "chien luoc bao thu": danh doi do chinh xac lay an toan.

### Hai kich ban kich hoat

| Kich ban | Khi nao kich hoat | Y nghia |
| --- | --- | --- |
| **Nen phong ngua** | Token vuot nguong (183.616) nhung chua loi | Nen truoc, tranh API bao loi |
| **Nen khan cap** | API tra ve loi tran context | Bien phap khac phuc, nen truoc roi thu lai |

Nen phong ngua la thong le: xu ly van de truoc khi no xay ra. Nen khan cap la phong tuyen cuoi: phong khi uoc luong lech va API da bao loi, van con mot lop bao ve.

---

## 3. Cat o dau: thuat toan diem cat

Biet can nen roi, nhung cat "dao" o dau? Khong the cat tuy tien: co vi tri cat se pha vo tinh toan ven du lieu.

Thuat toan diem cat cho viec nen

**Chu thich hinh:** dai message (entry 0-9), moi entry ghi nhan kieu. Cong don token lui tu moi nhat, cat sau toolResult la khong duoc (do X), cat sau user / assistant la duoc (xanh check). Cuoi cung chon entry 7 (assistant) lam diem cat: ben trai 0-6 bi nen thanh CompactionSummaryMessage, ben phai 7-9 duoc giu. Chu y: cat o assistant se chia cat Turn gom entry 4 (user) va 5-7 (assistant + toolResult), kich hoat xu ly turnPrefix (section 5 noi chi tiet).

### Khong phai cho nao cung cat duoc

Lich su hoi thoai LLM co rang buoc cau truc chat. Vi du message `ToolResult` phai di lien ngay sau `AssistantMessage` (chua ToolCall) da kich hoat no. Neu ban de ToolCall o "vung giu" ma ToolResult sang "vung nen", model se thay "toi goi tool read, nhung ket qua o dau?": context dut.

Vay diem cat phai la **diem cat hop le**: khong pha vi vi cap message.

```
entry: 0     1     2      3       4     5      6       7      8
       ┌─────┬─────┬──────┬───────┬─────┬──────┬───────┬──────┬─────┐
       │ hdr │ usr │ ass  │ tool  │ usr │ ass  │ tool  │ ass  │tool │
       └─────┴─────┴──────┴───────┴─────┴──────┴───────┴──────┴─────┘

有效切割点 = [1(usr), 2(ass), 4(usr), 5(ass), 7(ass)]
                                                       ↑
                                          注意：3(tool)、6(tool)、8(tool) 全部被排除
```


Source findValidCutPoints co quy tac ro rang: **`user` va `assistant` deu la diem cat hop le, `toolResult` thi khong**. Ghi chu then chot trong comment la:

> When we cut at an assistant message with tool calls, its tool results follow it and will be kept.

### Nghia diem cat: diem bat dau cua vung giu

De hieu diem cat, nam mot chia khoa: **diem cat khong phai la "message cuoi cung bi cat di", ma la "message dau tien cua vung giu"**. Nghia nay rat quan trong va se lam sang to moi thac mac tiep theo cua ban.

Diem cat la `user`, nghia la gi? Ban than user vao vung giu, **assistant va toolResult di theo sau no cung vao vung giu**: ca Turn mo dau bang user nay deu duoc giu. Bi nen la nhung message **truoc** user do.

```
例子：切点选 entry 4 (usr)
entry: 0     1     2      3       4     5      6       7      8
       hdr   usr   ass   tool    [usr]  ass   tool    ass   tool
       └──────── 压缩区 ────────┘  └────── 保留区 ──────────────┘
                                   ↑
                              切点 = 保留区第一条
                              user + 后面的 ass + tool 全部保留
                              → 这个 Turn 完整！
```


Nen cat sau `user` la **lua chon an toan nhat**: von dam bao Turn tron ven, vi assistant va toolResult theo sau `user` deu vao vung giu.

### Duyet nguoc: bao ve thu quan trong nhat

Sau khi xac dinh diem cat hop le, cat tu dau? Chien luoc cua Pi la **cong don nguoc** (findCutPoint L392-454):

Tai sao lui tu sau? Vi **context gan nhat la quan trong nhat**. Model can biet "vua lam gi", "vua doc file nao", "user vua noi gi". Di nguoc cho den khi cong du token (20.000), dam bao giu du context gan day.

```
从最新消息往回走，累积 token 数。
当累积量 >= keepRecentTokens（20,000）时，停止。
在停止位置之后找最近的有效切割点:那里就是切刀。
```


Ket qua cat chia message thanh hai nhom: vung giu (entry 7 tro di) va vung nen (entry 6 tro ve truoc). Moi ben duoc xu ly khac nhau.

Tai sao lui tu sau? Vi **context gan nhat la quan trong nhat**. Model can biet "vua lam gi", "vua doc file nao", "user vua noi gi". Di nguoc cho den khi cong du token (20.000), dam bao giu du context gan day.

```
function findCutPoint(entries, keepRecentTokens) {
    const cutPoints = findValidCutPoints(entries);  // 排除 toolResult

    let accumulated = 0;
    for (let i = entries.length - 1; i >= 0; i--) {
        accumulated += estimateTokens(entries[i]);
        if (accumulated >= keepRecentTokens) {
            // 找到第一个 >= i 的有效切割点
            return 第一个 >= i 的 cutPoint;
        }
    }
    return 最早的 cutPoint;  // 全部需要压缩
}
```


Ket qua cat chia message thanh hai nhom:

```
切割点之前的消息 → messagesToSummarize（被压缩）
切割点之后的消息 → kept（保留）
```


---

## 4. Phan bi cat di xu ly the nao: tom tat co cau truc

Vai chuc luot hoi thoai bi nen khong bi nem di truc tiep; chung tro thanh mot **tom tat co cau truc**.

### Dinh dang tom tat: khong phai text tu do, dien bang

Pi khong yeu cau LLM "cu viet tom tat di": no yeu cau LLM dien mot bang dinh dang co dinh, 6 section:

```
## Goal                    ← 用户最初要做什么
## Constraints & Preferences  ← 有什么约束
## Progress                ← 做了什么（Done / In Progress / Blocked）
## Key Decisions           ← 关键决策
## Next Steps              ← 下一步做什么
## Critical Context        ← 不能忘记的关键信息
```


Tai sao dung dinh dang co cau truc? Vi text tu do de bo sot thong tin: LLM co the danh mot doan dai de mo ta mot chi tiet ky thuat thu vi, lai quen ghi lai yeu cau cot loi cua nguoi dung. Section co dinh ep LLM phai quet qua tung chieu, giam thieu viec bo sot.

### Sinh tom tat: mot lan goi LLM

Qua trinh sinh tom tat: truoc het serialize message thanh text, roi goi LLM sinh tom tat.

```
原始消息（AgentMessage[]）
    │
    ▼ 序列化
"[User]: 帮我修 auth.ts
 [Assistant tool calls]: read(path=\"auth.ts\")
 [Tool result]: export function authenticate() {...}
 [Assistant]: 找到问题了，缺少 salt..."
    │
    ▼ LLM 调用（用摘要 prompt）
    │
结构化摘要
    ## Goal
    Fix authentication bug in auth.ts
    ## Progress
    ### Done
    - [x] Read auth.ts, identified missing salt
    ...
```


### Cap nhat tang dan: khong phai moi lan tu dau

Neu mot hoi thoai dai bi nen nhieu lan (lan mot nen luot 1-30, lan hai nen luot 31-50), lan nen thu hai nhan tom tat lan truoc lam `previousSummary`:

```
第一次压缩：
  输入：第1-30轮原始消息
  输出：摘要 A

第二次压缩：
  输入：摘要 A + 第31-50轮原始消息
  输出：摘要 B（在 A 的基础上合并新信息）
```


Cai nay khien LLM lam **cap nhat chu khong viet lai**: Goal/Constraints da co duoc giu, Progress moi duoc them vao. On dinh hon nhieu so voi moi lan tu dau viet tom tat.

### Theo doi file: nen khong chi la text tom tat

Voi coding Agent, "file nao da sua" la thong tin cuc ky quan trong. Tom tat cua Pi con duy tri mot danh sach theo doi file:

```
<read-files>
src/auth.ts
src/utils/hash.ts
</read-files>

<modified-files>
src/auth.ts
</modified-files>
```


Nhung danh sach nay cong don qua cac lan nen: lan nen thu hai gop danh sach file trong `previousSummary` vao tom tat moi. Bang cach nay, ke ca qua nhieu luot nen, Agent van biet trong toan bo phien da doc va sua nhung file nao.

---

## 5. Truong hop bien: chia Turn

Section 3 noi ca hai diem cat user va assistant deu hop le. Nhung tinh chat cua chung khac nhau:

- **diem cat user**: dam bao Turn tron ven mot cach tu nhien (assistant + toolResult theo sau user cung vao vung giu)
- **diem cat assistant**: **se chia cat Turn**: user tuong ung voi assistant nay o vung nen trong khi assistant ban than o vung giu

Source findCutPoint L444-453 logic phan dinh:

**Diem cat la user -> chac chan khong phai split turn**. **Diem cat la assistant (hoac bashExecution / custom v.v.) -> co the la split turn**: di toi de tim diem bat dau user cua Turn nay, rieng xu ly cac message giua diem bat dau user va diem cat (chuoi assistant + toolResult).

### Tai sao cho phep diem cat assistant?

Cau hoi truc giac nhat la: vi diem cat assistant se chia cat Turn, sao khong chi cat o user? The la tranh hoan toan split turn?

Cau tra loi nam o do chinh xac cua viec kiem soat token. Xem kich ban nay:

```
const isUserMessage = cutEntry.message.role === "user";
const turnStartIndex = isUserMessage ? -1: findTurnStartIndex(entries, cutIndex, startIndex);
isSplitTurn: !isUserMessage && turnStartIndex !== -1,
```


Gia su cong don lui den entry 6, tong cong vua dat `keepRecentTokens` (20K). Luc nay can tim mot diem cat hop le "tai hoac sau 6":

- Neu **chi cho phep diem cat user**: user gan nhat la entry 1: nghia la vung giu bat dau tu entry 1, giu entry 1-8 (tong cong 8 entry). Nhung ngan sach token co the chi du cho 2-3 entry. **Nen that bai**: khong nen duoc.
- Neu **cho phep diem cat assistant**: chon entry 6 lam diem cat, vung giu chi co entry 6-8 (3 entry), **kiem soat chinh xac so token**.

Day la mot **su doi can**:

- Chi cho phep diem cat user -> vung giu luon qua lon, nen khong hieu qua hoac tham chi that bai
- Cho phep diem cat assistant -> kiem soat token chinh xac, nhung chia cat Turn -> dung co che turnPrefix de bu dap

Pi chon cach sau: **truoc het dam bao nen co hieu luc**, roi dung tom tat turnPrefix de bu dap cho mat mat tinh tron ven cua Turn.

```
entry: 1     2      3      4      5     6      7     8
       usr   ass   tool   ass   tool   ass   tool   ass
                                          ↑
                                    向后累积到这里 token 预算用完
```


### Co che turnPrefix: Turn bi cat doi xu ly the nao?

Source goi phan nay la **turnPrefixMessages** (compaction.ts:698-705): dung mot TURN_PREFIX_SUMMARIZATION_PROMPT chuyen dung de doc lap sinh mot tom tat tien to, sinh song song voi tom tat chinh (L784-813 dung Promise.all), cuoi cung gop vao mot text tom tat.

Chu y phan cong giua tom tat chinh va tom tat turnPrefix:

- **Tom tat chinh** bao phu "lich su tron ven" da nen (nhieu Turn tron ven) -> dung dinh dang co cau truc 6 section
- **Tom tat turnPrefix** bao phu "nua Turn" bi cat (user trong tom tat chinh, assistant trong vung giu) -> dung dinh dang 3 doan nhe hon (Original Request / Early Progress / Context for Suffix)

Hai tom tat gop lai sau do duoc luu trong cung CompactionEntry; lan buildSessionContext sau cung inject chung cung nhau. Nhung LLM thay la mien tron ven "truoc khi nen da xay ra gi + tien to cua nua Turn".

```
entry: 1     2      3      4      5      6       7      8     9
       ┌─────┬──────┬──────┬──────┬──────┬───────┬──────┬─────┬──────┐
       │ usr │ ass  │ tool │ ass  │ tool │ tool  │ ass  │tool │ ass │
       └─────┴──────┴──────┴──────┴──────┴───────┴──────┴─────┴──────┘
         ↑     └────────── turnPrefixMessages ──────────┘  └─ kept ─┘
       turnStart=1            (entries 2-6)              entries 7-9

       切点在 entry 7（assistant），但 entry 1（user）是它的 Turn 起点
       → entry 1 在主摘要里压缩
       → entry 2-6 是"被切断的 Turn 前缀"，单独生成 turnPrefix 摘要
```


---

## 6. Ket qua nen co hieu luc the nao

Cuoi section 1 ta da noi ve moc thoi gian cot loi: nen xay ra giua hai luot. Muc nay trien khai viec ket qua nen tac dong den lan chay tiep theo.

Sau khi nen xong, ket qua tac dong den lan chay Agent sau the nao?

### CompactionEntry: hinh thai vat ly cua ket qua nen

Moi lan nen sinh ra mot `CompactionEntry`, duoc luu tren Session Tree (Chuong 10 noi chi tiet):

### Tai tao context

Lan Agent chay tiep theo, `buildSessionContext()` tai tao context dua tren CompactionEntry:

Nho lai he thong message o Chuong 6: `CompactionSummaryMessage` la kieu message tuy chinh cua coding-agent; `convertToLlm` dich no thanh `UserMessage` boc bang the `<summary>`. Nhung LLM thay la: "The conversation history before this point was compacted into the following summary:. .."

**Doi voi LLM, vai chuc luot hoi thoai bien thanh mot tom tat**. No khong biet chi tiet cua message tho, nhung no biet muc tieu, tien do, quyet dinh va ban ghi thao tac file: thuong du de tiep tuc lam viec.

```
{
    type: "compaction",
    summary: "## Goal\nFix auth.ts...\n## Progress\n...",   // 摘要文本
    tokensBefore: 185000,              // 压缩前 token 数（用于诊断和审计）
    firstKeptEntryId: "e30",           // 保留的起始 entry id（重建上下文时从这开始）
    details: {                         // 文件操作跟踪（来自 extractFileOperations）
        readFiles: ["src/auth.ts", "src/utils/hash.ts"],
        modifiedFiles: ["src/auth.ts"],
    },
    // ... 含 id/parentId/timestamp 等 SessionEntryBase 字段
}
```


### Tich hop nen tu dong

Viec nen tu dong duoc nhung vao handler su kien `agent_end` cua AgentSession (Chuong 7 noi ve he thong su kien):

### Hai bo su kien

Qua trinh nen phat ra hai su kien (cac su kien mo rong tang Session da noi o Chuong 7):

- `compaction_start` (reason: manual / threshold / overflow)
- `compaction_end` (mang theo ket qua nen hoac thong tin loi)

UI co the subscribe cac su kien nay de hien thi goi y tien trinh nhu "dang nen context...".

```
重建后的上下文：
├── CompactionSummaryMessage（role: "compactionSummary"）
│     content = 摘要文本
│     （第6章讲过：convertToLlm 把它翻译成 UserMessage）
│
├── 保留的原始消息（entry 30 之后的消息）
│     ├── UserMessage: "继续修复"
│     ├── AssistantMessage: ...
│     └── ...
│
└── （新的消息会在运行中追加）
```


---

## 7. On lai chuoi lien ket hoan chinh

Xau chuoi ca chuong, hanh trinh hoan chinh cua mot lan nen:

Chuoi lien ket hoan chinh cua viec nen

**Chu thich hinh:** luong ngang 6 buoc: phan dinh kich hoat -> tim diem cat -> chia cat -> sinh tom tat (diem do, tap trung) -> luu CompactionEntry -> lan chay sau tai tao context. Giua buoc 5 va buoc 6 la mui ten dut xuyen lan chay, nhan manh CompactionEntry la cay cau noi hai lan chay.

Vai tro cua moi node:

1. **Phan dinh kich hoat**: `shouldCompact` kiem tra context co vuot window - reserveTokens khong
2. **Tim diem cat**: `findCutPoint` cong don nguoc, dam bao vung giu >= `keepRecentTokens`
3. **Chia cat**: chia message thanh vung giu va vung nen, xu ly turnPrefix neu split turn
4. **Sinh tom tat**: tom tat chinh (6 section) + tom tat turnPrefix (3 section), goi LLM song song
5. **Luu CompactionEntry**: ghi vao Session Tree, san sang cho lan chay sau
6. **Lan chay sau tai tao context**: `buildSessionContext` inject CompactionSummaryMessage, message tho bien mat

Ket qua cua mot lan nen CHINH LA mot `CompactionSummaryMessage` duoc inject o ranh gioi giua vung nen va vung giu, de LLM thay: truoc diem nay la tom tat, sau diem nay la message gan day day du.

Het chuoi lien ket hoan chinh. Cac muc con lai noi ve tinh hoa thiet ke: tom tat y tuong thiet ke cua cac co che nay.

```
Agent 运行结束（agent_end 事件）
    │
    ▼
检查 shouldCompact()？
    │
    ├── 不需要 → 结束
    │
    └── 需要 → 执行压缩
         ├── findCutPoint → 找切割点
         ├── 序列化 + LLM 调用 → 生成摘要
         ├── 追加 CompactionEntry 到 Session Tree
         └── 下次运行时 buildSessionContext 使用压缩后的上下文
```


Qua trinh nen phat ra hai su kien (cac su kien mo rong tang Session da noi o Chuong 7):

- `compaction_start` (reason: "manual" / "threshold" / "overflow")
- `compaction_end` (mang theo ket qua nen hoac thong tin loi)

UI co the subscribe cac su kien nay de hien thi goi y tien trinh nhu "dang nen context...".

```
① 触发判断
   shouldCompact() → contextTokens(185K) > contextWindow(200K) - reserve(16K)
   红灯亮起，开始压缩

② 找切割点
   向后遍历 → 累积 token 到 keepRecent(20K) → 找最近的有效切割点
   排除 ToolResult 后的位置 → 保证消息对完整

③ 分割消息
   切割点之前 → messagesToSummarize（被压缩）
   切割点之后 → kept（保留）

④ 生成摘要
   序列化消息为文本 → 调 LLM 填写 6 section 结构化摘要
   传入 previousSummary 做增量更新 → 合并文件跟踪列表

⑤ 存储结果
   CompactionEntry 追加到 Session Tree

⑥ 下次运行时
   buildSessionContext() → 用 CompactionSummaryMessage 替换旧消息
   convertToLlm → 摘要翻译成 UserMessage 发给 LLM
```


---

## 8. Tinh hoa thiet ke

Nhin lai ca chuong, thuat toan nen cua Pi co ba y tuong thiet ke dang mang di. Moi y khong phai "vi hay ma hay", ma de dap lai mot rang buoc ky thuat cu the.

### 1. Duyet nguoc + diem cat hop le: bao ve thu quan trong nhat

`findCutPoint` khong phai "tim cho co the cat", ma la "tim cho dang de giu": **tu message moi nhat di lui**, cho den khi cong du `keepRecentTokens` (mac dinh 20K). Suy nghi "逆向" (nguoc chieu) phia sau la phan dinh: **context gan nhat la quan trong nhat**: model can "vua doc gi", "user vua noi gi", quan trong hon nhieu so voi "10 luot truoc thao luan gi".

Loai tru `toolResult` khoi diem cat vi rang buoc giao thuc: toolResult phai di lien ngay toolCall, neu khong model "goi tool nhung khong tim thay ket qua". Day la rang buoc cung khong the nhuong.

> Hien thuc: `findCutPoint` trong `packages/coding-agent/src/core/compaction/compaction.ts` (khoang L392)

### 2. Tom tat co cau truc: dung template co dinh chong lai "tu phat minh" cua LLM

`SUMMARIZATION_PROMPT` ep LLM dien 6 section co dinh: Goal / Constraints & Preferences / Progress (ba muc con: Done / In Progress / Blocked) / Key Decisions / Next Steps / Critical Context. Trong do muc con Blocked cua Progress chuyen ghi nhan "thu bi mac": LLM luot sau thay dong nay co the uu tien thu mo khoa.

Tai sao khong viet "xin tom tat hoi thoai"? Vi tom tat text tu do co mot che do that bai: LLM co xu huong bi "noi dung thu vi" hap dan, danh mot doan dai mo ta chi tiet ky thuat, **quen ghi lai yeu cau cot loi cua nguoi dung**. Section co dinh ep LLM it nhat quet qua tung chieu mot lan, bien "de bo sot" thanh "bat buoc dien".

Them cap nhat tang dan (UPDATE_SUMMARIZATION_PROMPT): nhieu lan nen tom tat moi duoc cap nhat tren tom tat cu, khong viet lai tu dau. Cai nay tranh sai so cong don "moi lan nen tom tat truot di mot chut".

**Day la vi du chong lai lech nhan thuc cua LLM bang thiet ke prompt**: template co dinh + cap nhat tang dan = kha nang LLM "nho" va "to chuc" thong tin mot lan duoc giu rang buoc co cau truc.

> Hien thuc: SUMMARIZATION_PROMPT trong `compaction.ts` (khoang L460) va UPDATE_SUMMARIZATION_PROMPT (khoang L493)

### 3. Cong don theo doi file: kien thuc mien cu the cua coding Agent

`extractFileOperations` cong don danh sach file tu hai nguon:

1. `details.readFiles` / `modifiedFiles` cua lan nen truoc
2. File lien quan den tat ca tool call trong message vua nen (tool read -> readFiles, tool edit/write -> modifiedFiles)

Cuoi cung `formatFileOperations` boc hai danh sach nay bang the `<read-files>...</read-files>` va `<modified-files>...</modified-files>` roi them vao cuoi tom tat.

Tai sao theo doi file rieng? Vi voi coding Agent, "file nao da sua" la meta-info cuc ky quan trong: chinh xac hon va co the xac minh hon so voi "trong hoi thoai thao luan gi". LLM thay danh sach nay, biet nhung file nao da bi du an dong vao, tranh doc lai, tranh ghi de len thay doi cua nguoi khac. Day la cach "kien thuc mien nhung vao co che tong quat": thuat toan nen ban than la tong quat, nhung truong `details` mang theo thong tin mien cu the.

> Hien thuc: `extractFileOperations` (khoang L41); dinh dang the trong `formatFileOperations` trong `utils.ts`

---

## 9. Tram tiep theo

Chuong nay ta da thay thuat toan nen hoat dong the nao: tu phan dinh kich hoat den tinh diem cat den sinh tom tat. Nhung co mot khai niem ta cu nhac di nhac lai ma chua trien khai: **Session Tree** (cay phien). Ket qua nen (CompactionEntry) duoc luu tren Session Tree; `buildSessionContext()` dung Session Tree de xay dung context ma LLM can.

Session Tree rot cung la cau truc gi? Tai sao lich su hoi thoai la mot cay chu khong phai mot mang tuyen tinh? Nhanh la chuyen gi?

Chuong toi: quan ly phien: tra loi nhung cau hoi nay.

---

> **Chi muc source then chot cua chuong nay**:
>
> `packages/coding-agent/src/core/compaction/compaction.ts`: thuat toan cot loi (findCutPoint, prepareCompaction, shouldCompact)
> `packages/coding-agent/src/core/compaction/compaction.ts:256-296`: `estimateTokens` (uoc luong theo chars/4)
> `packages/coding-agent/src/core/compaction/utils.ts`: cac ham tien ich khac (serialize message v.v.)
> `packages/coding-agent/src/core/session-manager.ts`: dinh nghia CompactionEntry + buildSessionContext
> `packages/coding-agent/src/core/messages.ts`: CompactionSummaryMessage
> `packages/coding-agent/src/core/agent-session.ts`: tich hop nen tu dong (kich hoat sau agent_end)
