---
chapter: 8
slug: ch08-context-engineering
title_zh: "第8章：上下文工程: 让有限窗口装下无限对话"
title_en: "Chapter 8: Context Engineering: Fitting Infinite Dialogue Into a Finite Window"
title_vi: "Chương 8: Context Engineering: Nhồi cuộc hội thoại vô hạn vào cửa sổ hữu hạn"
source_url: https://www.dgzhuya.com/modules/ch08-context-engineering
language: vi
version_pairs:
 zh: zh/src/ch08-context-engineering.md
 en: en/src/ch08-context-engineering.md
 vi: vi/src/ch08-context-engineering.md
original_chars: 5631
code_lines: 215
reading_minutes: 29
translator: hypnguyen1209
reviewed_by: null
last_updated: 2026-08-20
status: translated
official_refs: []
terms_used: []
code_blocks: 16
mermaid_blocks: 0
---

# Chương 8: Context engineering: Nhét cuộc hội thoại vô hạn vào cửa sổ hữu hạn

Chương 6 khi bàn về hệ thống message ta từng nói: bên trong Agent tự do diễn đạt qua 7 loại `AgentMessage`, nhưng trước khi gọi LLM nó đi qua một biên giới dịch `convertToLlm`, dịch thành 3 loại `Message` chuẩn. Chương 7 khi bàn về event-driven ta cũng từng nhắc: sau event `agent_end`, một "kiểm tra context" được kích hoạt.

Đằng sau hai chuyện này thực ra là cùng một vấn đề cốt lõi: **cửa sổ context của LLM là cố định, nhưng hội thoại của coding-agent lại tăng không giới hạn**.

Chương này ta sẽ mở toàn cảnh "context engineering" của Pi. Bạn sẽ thấy: việc nén context (mà bạn có thể đã thấy ở [Chương 9](ch09-compaction.md)) chỉ là phần nổi của tảng băng. Pi thực ra bố trí phòng thủ ở cả hai khâu **đầu vào và lịch sử**, mỗi tầng ứng với một bài toán kỹ thuật cụ thể.

---

## 1. Vấn đề: cửa sổ cố định, hội thoại tăng trưởng

Nếu liệt kê tất cả "nguồn thông tin" của một phiên coding-agent, bạn sẽ nhận ra vấn đề nghiêm trọng cỡ nào:

```
一次会话送进 LLM 的内容
├── 系统提示词（工具说明、guidelines、pi 文档路径）
├── 项目上下文文件（CLAUDE.md / AGENTS.md，可能多层嵌套）
├── Skills 列表（每个 skill 一段描述）
├── 工具定义（每个工具的 JSON schema）
├── 对话历史（每一轮 user / assistant / toolResult）
│   ├── 用户输入
│   ├── LLM 回复（含 thinking、toolCall）
│   └── 工具结果（read 文件、bash 输出、grep 命中……）
└── 当前轮的新输入
```


Chọn bừa một cái cũng có thể nổ tung:

- stderr của một lần chạy `npm install` có thể cả chục KB
- `read` một file nguồn 5000 dòng có thể tới 80KB
- `grep` một từ khóa trong toàn repo, trúng hàng trăm dòng
- Cộng dồn nhiều lượt gọi tool, mấy chục lượt dễ vượt 100K token

Còn cửa sổ của LLM là **giới hạn cứng**: vượt là nó báo lỗi ngay `prompt is too long`, hội thoại đứt.

**Context engineering** là discipline kỹ thuật để ứng phó vấn đề này: trước khi nội dung được đưa vào LLM, **nhiều lớp cắt tỉa, lọc, nén, tổ chức**, để cửa sổ giới hạn chứa nổi "thông tin có giá trị nhất cho nhiệm vụ hiện tại".

Pi hiện thực **4 kỹ thuật bổ trợ lẫn nhau** ở khâu này. Chương này ta xem lần lượt từng cái.

---

## 2. Bản đồ: hai lớp phòng thủ

Trước khi đào vào từng kỹ thuật, hãy dựng một bức tranh tổng. Context engineering của Pi phân bố trên hai khâu:

```
┌──────────────────────────────────────────────────────────────┐
│                       输入侧（送进 LLM 之前）                 │
│  ① 工具输出截断: bash/read/grep 结果按行/字节裁剪            │
│  ② 系统提示词组装: 多层 CLAUDE.md 向上递归 + Skills 懒加载   │
└──────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────┐
│                  历史侧（长对话管理）                         │
│  ③ Compaction: 阈值触发，把旧消息变成结构化摘要             │
│  ④ 分支摘要    : 切换会话树分支时，给"被放弃的分支"做摘要   │
└──────────────────────────────────────────────────────────────┘
```


| Tầng | Vấn đề giải quyết | Tần suất kích hoạt |
| --- | --- | --- |
| 1. Cắt output của tool | Một kết quả tool quá lớn | **Mỗi lần gọi tool** |
| 2. Lắp ráp system prompt | Quy tắc dự án cần đưa vào context nhưng người dùng không phải lặp lại | Mỗi lượt prompt |
| 3. Compaction (nén) | Hội thoại dài tích lũy vượt cửa sổ | Kích hoạt theo ngưỡng |
| 4. Tóm tắt nhánh | Chuyển nhánh trong cây phiên, nhánh cũ không được bỏ | Khi người dùng chuyển nhánh |

Tiếp theo ta triển khai theo thứ tự này.

---

## 3. Đầu vào ①: cắt output của tool (truncateHead / truncateTail)

### Vấn đề: một lệnh bash có thể phá nát cửa sổ

Hình dung bạn cho Agent chạy `npm test`, xuất 8000 dòng log; hoặc cho nó `read` một file nguồn 3000 dòng. **Một lần gọi tool** có thể sinh ra mấy chục KB output. Nếu không kiểm soát, mấy lượt là cửa sổ context chật cứng bởi kết quả tool.

Cách giải ngây thơ nhất là "cắt theo số ký tự". Nhưng cách này lập tức đụng ba vấn đề mới:

1. **Vị trí cắt sai**: lỗi bash thường ở cuối, cắt đuôi mới có ích; đọc file thường đầu quan trọng hơn, cắt đầu mới đúng
2. **Cắt đứt ký tự nhiều byte**: cắt trực tiếp theo byte có thể xé một emoji thành hai code unit vô hiệu
3. **Một dòng đã vượt giới hạn**: ví dụ grep trúng dòng JS nén 100KB, cắt sao?

Pi dùng bộ thuật toán **hai giới hạn + an toàn biên** để giải quyết ba vấn đề này, hiện thực hết trong [`truncate.ts`](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/src/core/tools/truncate.ts).

### Hai giới hạn: dòng + byte, cái nào chạm trước thắng

Pi định nghĩa sẵn hai hằng số giới hạn trên cho mọi output tool (source `truncate.ts:11-13`):

- **Giới hạn dòng**: `DEFAULT_MAX_LINES = 2000`
- **Giới hạn byte**: `DEFAULT_MAX_BYTES = 50 * 1024` (50KB)
- **Giới hạn độ dài một dòng grep**: `GREP_MAX_LINE_LENGTH = 500`

Mọi output tool đều được cắt theo "**tối đa 2000 dòng**" hoặc "**tối đa 50KB**", **cái nào kích hoạt trước thì dùng cái đó**.

Tại sao hai giới hạn? Vì giới hạn đơn lẻ đều có chế độ thất bại:

- Chỉ giới hạn dòng: một dòng có thể rất dài (JS nén, CSS minified), 3 dòng đã nổ byte
- Chỉ giới hạn byte: một file nguồn 50KB có thể chỉ 200 dòng, mà bạn muốn xem toàn bộ cấu trúc, cắt theo byte có thể chém dòng 100 làm đôi

Hai giới hạn dựa vào nhau: dòng quản "khả năng đọc", byte quản "thể tích cứng".

### Hai chiến lược: truncateHead so với truncateTail

Cùng một giới hạn kép, cắt từ đầu nào là câu hỏi khác. Pi cung cấp hai hàm, **khác biệt cốt lõi chỉ là hướng duyệt**:

Cắt output của tool: giới hạn kép + chiến lược hai chiều

**Chú thích hình:** nửa trên thể hiện giới hạn kép (2000 dòng + 50KB, cái nào chạm trước thắng). Nửa dưới đối chiếu trái-phải: `truncateHead` giữ phần đầu (xanh đậm = giữ, xám đứt = cắt), dùng cho `read` file (import / interface mật độ thông tin cao nhất); `truncateTail` giữ phần đuôi, dùng cho output `bash` (stack lỗi chứa nhiều tín hiệu nhất). Phía dưới cùng là lối thoát chung: thêm `[Full output: /tmp/...]` để LLM tự đọc.

| Hàm | Phần giữ | Dùng cho | Tại sao |
| --- | --- | --- | --- |
| `truncateHead` | Đầu | đọc file | Phần đầu file thường là import / định nghĩa class / chữ ký interface: **mật độ thông tin cao nhất** |
| `truncateTail` | Đuôi | output bash | stack lỗi và kết quả cuối của bash đều ở đuôi: **đuôi chứa nhiều tín hiệu nhất** |

Mô tả của tool bash viết rất rõ trong source (`bash.ts:284`):

> Output is truncated to last 2000 lines or 50KB (whichever is hit first). If truncated, full output is saved to a temp file.

Từ **"last"** là then chốt: hợp đồng của tool bash là "giữ phần đuôi". Logic cốt lõi của `truncateTail` là chọn các dòng giữ lại bằng cách lùi từ đuôi về trước (`truncate.ts:247-266`), đơn giản hóa:

```
// 伪代码：truncateTail 的核心思路
function truncateTail(content, maxLines, maxBytes) {
    const lines = content.split("\n");
    const kept = [];           // 从末尾往回收集的行
    let bytes = 0;

    for (let i = lines.length - 1; i >= 0; i--) {
        const lineBytes = byteLength(lines[i]) + 1;  // +1 是换行符
        if (kept.length >= maxLines) break;          // 行数到了，停
        if (bytes + lineBytes > maxBytes) break;     // 字节到了，停
        kept.unshift(lines[i]);                      // 插到头部，保持原顺序
        bytes += lineBytes;
    }
    return kept.join("\n");
}
```


`truncateHead` cũng y vậy, chỉ đổi `for` thành "duyệt từ đầu đến cuối", đổi `unshift` thành `push`.

### An toàn biên: ký tự đa byte UTF-8

Bug âm hiểm nhất của cắt cấp byte là cắt đứt ký tự đa byte. Một emoji 😀 trong UTF-8 là 4 byte; nếu bạn cắt ở byte thứ 2, hai byte còn lại biến thành ký tự vô hiệu ``.

Pi dùng `truncateStringToBytesFromEnd` (`truncate.ts:295`) để giải: **cộng dồn byte theo từng ký tự**, dừng khi "thêm ký tự tiếp theo là vượt ngân sách byte". Code xử lý đặc biệt surrogate pair: gặp ký tự 4 byte là emoji, coi như một khối không thể chia: hoặc giữ trọn, hoặc bỏ hẳn.

Thêm `replaceUnpairedSurrogates` (**chú ý**: hàm này...15 tokens đã bị cắt...truncate.ts đơn giản hóa hiện thực, dùng thẳng `Buffer.byteLength + slice`, không giữ hàm đó) xử lý trường hợp biên: input bản thân đã hỏng (chứa surrogate chưa cặp); thay bằng `` để tránh lỗi mã hóa sau. Đây đều là "việc tỉ mỉ" ở biên byte: không nổi bật nhưng cần thiết.

### Một dòng vượt giới hạn: lưới an toàn cho dòng một phần

`truncateTail` còn một logic biên (`truncate.ts:255-260`): nếu **dòng đầu tiên (dòng dài nhất) chỉ riêng nó đã vượt maxBytes**, bạn không thể trả về rỗng: lúc đó kết quả tool thành trống. Nó lấy **maxBytes byte cuối** của dòng đó và đặt cờ `lastLinePartial: true`.

Tool bash phía sau render một gợi ý đặc biệt (`bash.ts:366-368`):

```
[Showing last 49.5KB of line 1 (line is 92.3KB). Full output: /tmp/pi-bash-xxx.log]
```


Bằng cách này LLM ít nhất thấy phần cuối của dòng đó và biết output đầy đủ ở file nào: có thể dùng `read` lấy theo nhu cầu.

### Giới hạn một dòng: quy tắc 500 ký tự của grep

Tool grep còn một phép cắt độc lập: `truncateLine` (`truncate.ts:336`), mặc định `GREP_MAX_LINE_LENGTH = 500`. grep thường trúng file nén hoặc code minified: một dòng có thể cả chục nghìn ký tự. Hàm này cắt dòng quá dài xuống 500 ký tự và thêm hậu tố `... [truncated]`, tránh một dòng nuốt hàng nghìn token.

### Gợi ý sau khi cắt: cho LLM biết chuyện gì đã xảy ra

Bản thân việc cắt là có mất mát, nhưng Pi không làm lén. Cấu trúc `TruncationResult` (`truncate.ts:15-38`) ghi lại đầy đủ metadata: có cắt không (`truncated`), giới hạn nào kích hoạt (`truncatedBy: "lines" | "bytes" | null`), số dòng/byte gốc (`totalLines` / `totalBytes`), số dòng/byte output (`outputLines` / `outputBytes`), dòng cuối có bị cắt một phần không (`lastLinePartial`), v.v.

Tool bash dựa trên đó thêm một dòng gợi ý vào cuối output (`bash.ts:362-374`):

```
[Showing lines 6501-8500 of 8500. Full output: /tmp/pi-bash-xxx.log]
```


Dòng này **cũng vào context LLM**: báo cho model biết "nếu muốn xem output đầy đủ, hãy đọc file này". Đây là "lối thoát" của cơ chế cắt: mặc định cắt để tiết kiệm token, cần thì LLM tự lấy nội dung đầy đủ.

> **Phần bổ sung streaming output**: lệnh bash xuất theo dòng (stdout nhỏ từng dòng một, có thể kéo dài vài phút). Pi có class [`OutputAccumulator`](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/src/core/tools/output-accumulator.ts) chịu trách nhiệm thu gom real-time, kiểm soát bộ nhớ, ghi phần vượt giới hạn ra file tạm: nhưng phép cắt cuối cùng vẫn chạy qua thuật toán `truncateTail` ở trên. Bản thân việc gom streaming là chi tiết hiện thực kỹ thuật, không thuộc cơ chế cốt lõi của "context engineering", không triển khai ở đây; bạn đọc cần đào sâu có thể xem thẳng source.

> **Tóm tắt nhỏ**: giới hạn kép + chiến lược hai chiều + an toàn biên + lưới an toàn lối thoát: đây là bộ bốn của Pi cho việc cắt output tool. Mỗi lần gọi tool đều qua cửa này.

---

## 4. Đầu vào ②: lắp ráp system prompt động

### Vấn đề: quy tắc dự án phải vào context, nhưng người dùng không thể lặp lại mỗi lần

Cắt output của tool là "phép trừ": thu nhỏ thứ quá lớn. Nhưng context engineering còn có vấn đề "phép cộng": **làm sao để LLM tự động biết quy ước của dự án?**

Ví dụ người dùng dev trong monorepo, muốn LLM biết: "subproject này xài pnpm không phải npm", "test xài vitest". Nếu mỗi cuộc hội thoại đều phải tự nói, trải nghiệm rất tệ.

Giải pháp của Pi nằm trong [`system-prompt.ts`](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/src/core/system-prompt.ts) và [`resource-loader.ts`](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/src/core/resource-loader.ts): cốt lõi là hai việc: **đệ quy đa lớp CLAUDE.md** + **Skills lazy load**.

### File context đa cấp: đệ quy đi lên từ thư mục hiện tại

Pi tìm `AGENTS.md` hoặc `CLAUDE.md` (không phân biệt hoa thường) trong mỗi thư mục, rồi đệ quy từ `cwd` đi lên đến thư mục gốc, **gộp tất cả file quy tắc của các thư mục dọc đường**.

Đệ quy đa lớp CLAUDE.md + Skills lazy load

**Chú thích hình:** bên trái là cây thư mục monorepo, mũi tên đứt đỏ bò từ `src/` (cwd) đi lên gốc, thu gom CLAUDE.md mỗi tầng dọc đường. Bên phải là thứ tự gộp: 1. global (user-level `~/.pi/`) -> 2. ancestor (từ gốc xuống trên cwd một tầng) -> 3. project (chính cwd, cụ thể nhất, ghi đè lên trên). Cuối cùng bọc trong XML `<project_instructions path="...">` đưa vào system prompt. Phía dưới đối chiếu push-mode và pull-mode: full text 10 skill nhồi tốn 50K token, chỉ để danh sách và để LLM tự đọc chỉ tốn 500 token.

Tại sao đệ quy đi lên? Vì dự án hiện đại thường là cấu trúc monorepo lồng nhau:

```
/myorg
├── CLAUDE.md          ← 全组织规范（通用）
└── teams
    └── teamA
        ├── CLAUDE.md  ← 团队 A 规范（细化）
        └── projects
            └── app1
                ├── CLAUDE.md  ← 项目规范（最具体）
                └── src/       ← cwd 在这里
```


Khởi chạy Agent ở thư mục `src/`, nó tìm lên trên và thấy 3 file `CLAUDE.md` khác nhau, **được gộp theo thứ tự "từ ngoài vào trong"**: quy tắc của thư mục tổ tiên ở phía trước (khái quát nhất), quy tắc của thư mục dự án ở phía sau (cụ thể nhất). Như vậy LLM đọc giống như một cuốn sổ tay quy tắc nhiều lớp: đọc nguyên tắc chung trước, rồi đến chi tiết.

Ngoài đệ quy đi lên, còn có **context global**: một file được đọc từ `agentDir` (thư mục cấu hình `.pi` dưới home của user). Thứ tự tra cứu đầy đủ:

```
┌──────────────────────────────────────────────────────┐
│  系统提示词组装顺序                                   │
├──────────────────────────────────────────────────────┤
│  1. agentDir/CLAUDE.md   ← 全局（用户级）            │
│  2. 祖先目录/CLAUDE.md   ← 从 / 到 cwd 上一层        │
│  3. cwd/CLAUDE.md        ← 当前项目                  │
└──────────────────────────────────────────────────────┘
```


Source là hàm `loadProjectContextFiles` trong `resource-loader.ts:85-123`.

### Bọc XML: cho LLM hiểu "đây là chỉ thị của dự án"

Sau khi tìm được các file context, `buildSystemPrompt` (`system-prompt.ts:154-161`) bọc chúng bằng thẻ XML:

```
<project_context>

Project-specific instructions and guidelines:

<project_instructions path="/myorg/CLAUDE.md">
全组织规范：所有项目使用 TypeScript strict 模式...
</project_instructions>

<project_instructions path="/myorg/teams/teamA/projects/app1/CLAUDE.md">
本项目使用 pnpm，测试用 vitest...
</project_instructions>

</project_context>
```


Tại sao XML mà không phải Markdown?

1. **XML có biên rõ ràng**: `</project_instructions>` là thẻ đóng rõ ràng, LLM không lẫn quy tắc với chỉ thị bên ngoài
2. **Có thuộc tính path**: LLM thấy nội dung đến từ file nào, phân biệt được "quy tắc cấp tổ chức" với "quy tắc cấp dự án" theo thứ tự ưu tiên

Đây là kỹ thuật chuẩn của prompt engineering: các LLM phổ biến đều xử lý tốt cấu trúc thẻ XML.

### Skills lazy load: đưa danh sách vào prompt, nội dung đọc theo nhu cầu

Skills (hướng dẫn thao tác riêng của dự án) có một thiết kế tinh tế khác. Mỗi skill là một file `SKILL.md`, có thể vài nghìn chữ. Nếu nhồi toàn bộ text của mọi skill vào system prompt, chi phí token rất lớn và phần lớn chẳng dùng đến.

Cách làm của Pi là `formatSkillsForPrompt` (`skills.ts:335-361`): **chỉ để danh sách nhẹ, nội dung đầy đủ đọc theo nhu cầu**:

```
传统方式（推模式）              Pi 的方式（拉模式）
─────────────────────          ─────────────────────
系统提示词 ←─ 全文塞进           系统提示词 ←─ 只放清单
                                  │
                                  ▼
                               LLM 看清单，判断需要哪个
                                  │
                                  ▼
                               LLM 主动调 read 工具
                                  │
                                  ▼
                               SKILL.md 全文进入后续上下文
```


Cuối cùng trong system prompt trông như thế này:

```
<available_skills>
  <skill>
    <name>test-setup</name>
    <description>How to run tests for this project</description>
    <location>/path/to/skills/test-setup/SKILL.md</location>
  </skill>
</available_skills>
```


Đầu danh sách còn có một câu chỉ dẫn: "**Use the read tool to load a skill's file when the task matches its description**": đây là hợp đồng lazy load: dùng mới trả token, không dùng thì không mất.

Đối chiếu với "nhồi full text vào system prompt":

| Cách làm | Chi phí token | Mật độ thông tin |
| --- | --- | --- |
| Nhồi full text | 10 skill x 2000 chữ ≈ 50K token | Phần lớn không liên quan |
| Lazy load | 10 skill x 4 dòng ≈ 500 token | Trúng chính xác mới bung ra |

**Đây là paradigm "dùng gọi tool để load context theo nhu cầu"**: đưa sự chủ động của LLM vào context engineering. §8 sau sẽ triển khai sâu mẫu thiết kế này.

### Khung đầy đủ của system prompt

Nối tất cả các yếu tố trên lại, cấu trúc prompt đầy đủ mà `buildSystemPrompt` sinh ra là:

```
1. 角色定位
   "You are an expert coding assistant operating inside pi..."
2. 工具列表
   "- read: Read a file\n- bash: Execute...\n- edit: ..."
3. 通用 guidelines
   "- Be concise in your responses\n- Show file paths clearly..."
4. Pi 文档路径（让 LLM 能 read 自身文档）
5. [可选] appendSystemPrompt（追加内容）
6. <project_context>... CLAUDE.md 内容 ...</project_context>
7. <available_skills>... Skills 清单 ...</available_skills>
8. Current date: 2026-07-03
9. Current working directory: /path/to/cwd
```


**Cuối cùng** mới đến `Current date` và `cwd`: hai thông tin tưởng chừng đơn giản này thực ra là "metadata cơ bản" của context engineering. LLM cần biết "hôm nay là ngày nào" (để xử lý thời gian tương đối như "hôm qua", "tuần trước"), "đang ở thư mục nào" (để xử lý đường dẫn tương đối).

> **Tóm tắt nhỏ**: lắp ráp system prompt là context engineering kiểu "phép cộng": qua **đệ quy đa lớp file + cấu trúc hóa XML + Skills lazy load**, để LLM tự động nhận quy tắc dự án mà người dùng không phải lặp lại.

---

## 5. Lịch sử ③: Compaction (liên kết Chương 9)

Hội thoại dài rồi sẽ vượt giới hạn cửa sổ. Compaction là thuật toán nén cốt lõi của Pi: **biến message cũ thành tóm tắt có cấu trúc**, dùng tóm tắt thay message thô, giải phóng không gian mà vẫn giữ thông tin then chốt.

Vấn đề này quan trọng và phức tạp đủ để có hẳn một chương riêng:

**👉 [Chương 9: Context Compaction: hội thoại quá dài thì làm sao](ch09-compaction.md)**

Chương đó trình bày chi tiết:

- **Điều kiện kích hoạt**: `shouldCompact` dùng `contextWindow - reserveTokens` làm ngưỡng
- **Thuật toán điểm cắt**: `findCutPoint` cộng dồn token từ sau ra trước, loại trừ toolResult
- **Tóm tắt có cấu trúc**: template 6 section (Goal / Constraints / Progress / Key Decisions / Next Steps / Critical Context)
- **Cập nhật tăng dần**: nhiều lần nén dùng `UPDATE_SUMMARIZATION_PROMPT` cập nhật trên tóm tắt cũ
- **Theo dõi file**: thêm danh sách `<read-files>` và `<modified-files>` ở cuối tóm tắt
- **Trường hợp biên**: chia Turn và tóm tắt turnPrefix

Chương này §7 (chuỗi liên kết toàn cảnh) sẽ tích hợp Compaction vào; ở đây không lặp lại. **Chỉ nhớ một sự thật then chốt là đủ**: `CompactionSummaryMessage` do Compaction sinh ra sẽ xuất hiện trong `context.messages` của hội thoại tiếp theo, như một context mới.

```
对话树：
        root
         │
       [探索方案 A]
         │
       [A 的实现]
         │
        leaf_1 ← 用户当前在这里

用户：从 root 重新分叉探索方案 B
        root
         │
       [探索方案 A]  ← 这部分还在，但被"放弃"了
         │
       [A 的实现]
         │
        leaf_1（旧叶子）

用户切换到：
        root
         │
       [探索方案 B]  ← 新分支
         │
        leaf_2 ← 用户现在在这里
```


---

## 6. Lịch sử ④: tóm tắt nhánh (Branch Summarization)

Compaction giải quyết "hội thoại tuyến tính quá dài". Nhưng Pi còn một tính năng độc đáo khác: **cây phiên** (session tree) (Chương 10 sẽ bàn chi tiết). Nói ngắn gọn, hội thoại không phải đường thẳng mà là một cây: người dùng có thể "phân nhánh" một hội thoại mới từ một node lịch sử nào đó.

Cấu trúc này tạo ra một vấn đề context engineering mới: **khi người dùng chuyển nhánh, thành quả khám phá trên nhánh cũ không được bỏ**.

### Vấn đề: sau khi chuyển nhánh, xử lý nội dung nhánh cũ thế nào?

Lấy một tình huống cụ thể:

Sau khi chuyển, **context mà LLM thấy là đường root -> leaf_2**: nó không biết gì về những gì đã được khám phá trên nhánh leaf_1. Nếu nhánh đó có phát hiện quan trọng ("đã thử cách A nhưng không được, vì X, Y, Z"), LLM sẽ mất trí nhớ.

Nhồi nguyên nhánh cũ vào context? Tốn chỗ quá, vi phạm tinh thần §1.

Cách giải của Pi là [`branch-summarization.ts`](https://github.com/earendil-works/pi/blob/main/packages/agent/src/harness/compaction/branch-summarization.ts): **sinh tóm tắt cho nhánh bị bỏ, inject vào context của nhánh mới**.

### Thuật toán LCA: tìm "điểm phân nhánh"

Bước đầu tiên là xác định "nhánh bị bỏ chứa nội dung gì". Điều này đòi hỏi tìm **tổ tiên chung gần nhất (Lowest Common Ancestor, LCA)** của hai node lá: tức là node nơi hai nhánh bắt đầu rẽ.

Logic của `collectEntriesForBranchSummary` (`branch-summarization.ts:67-96`), nói đơn giản, có ba bước:

```
旧路径：root → ... → leaf_1
新路径：root → ... → leaf_2

1. 把两条路径都拿出来
2. 在新路径上从后往前找，第一个也在旧路径里的节点 = LCA（分叉点）
3. 从 leaf_1 向上爬到 LCA（不含 LCA），沿途收集的内容
   就是"被放弃的分支"
```


### Sinh tóm tắt: dùng lại tool của Compaction

Sau khi thu gom xong entry, `generateBranchSummary` (`branch-summarization.ts:199-261`) dùng LLM để sinh tóm tắt. Nó tái sử dụng mấy công cụ nền của Compaction:

- **`convertToLlm`**: dịch message sang format LLM
- **`serializeConversation`**: serialize message thành text hội thoại
- **`SUMMARIZATION_SYSTEM_PROMPT`**: system prompt dùng chung

Nghĩa là, **hai cơ chế tóm tắt dùng chung pipeline nền, chỉ khác prompt**.

### Prompt: khác biệt then chốt với Compaction

`BRANCH_SUMMARY_PROMPT` (`branch-summarization.ts:169-196`) rất giống `SUMMARIZATION_PROMPT` của Compaction: nhưng chỉ có **5 section** (Goal / Constraints / Progress / Key Decisions / Next Steps), **không có Critical Context** (Compaction mới có section này, nên Compaction là 6 section). Khác biệt chủ yếu ở hai điểm:

**Khác biệt 1: preamble context khác**

```
// 这段前言精准描述了语义:"用户探索了一个不同的分支，然后回到这里"
// LLM 看到这句，知道这不是"主线历史"，而是"另一条线的探索记录"
// 对待方式会更轻量（当作参考，而不是主线）
const BRANCH_SUMMARY_PREAMBLE =
    `The user explored a different conversation branch before returning here.\nSummary of that exploration:\n\n`;
```


**Khác biệt 2: maxTokens nhỏ hơn**

maxTokens của Compaction là `min(0.8 x reserveTokens, model.maxTokens)`: có thể tới cả chục nghìn token. Nhưng maxTokens của Branch Summary ghi cứng là `2048` (`branch-summarization.ts:234`).

**Tại sao tóm tắt nhánh yêu cầu gọn hơn?** Vì nó chỉ là context phụ, tuyến chính vẫn là nhánh mới. Nhánh mới cũng cần ngân sách token, tóm tắt nhánh không được chiếm sân khấu.

### Inject tóm tắt: trở thành BranchSummaryMessage

Tóm tắt sinh ra được bọc bằng preamble `BRANCH_SUMMARY_PREAMBLE` và thẻ `<read-files>` / `<modified-files>`, lưu thành `BranchSummaryMessage`. Lần `buildSessionContext` tiếp theo chạy, nó xuất hiện ở đầu context của nhánh mới:

LLM thấy thế này, lập tức biết "trước đây đã thử cách trigger rồi nhưng bỏ vì vấn đề hiệu năng": tránh cho nó lại đi vào ngõ cụt.

### So sánh Compaction và Branch Summarization

| Chiều | Compaction | Branch Summarization |
| --- | --- | --- |
| **Kích hoạt** | Ngưỡng (contextTokens > window - reserve) | Người dùng chuyển nhánh trong cây phiên |
| **Mục đích** | Tránh tràn cửa sổ | Giữ thành quả khám phá nhánh bị bỏ |
| **Cách cắt** | Thuật toán `findCutPoint` (cộng dồn từ sau) | Thuật toán LCA (tìm điểm phân nhánh) |
| **Vùng giữ** | N token gần nhất của message | Đường nhánh mới (giữ trọn) |
| **Vùng nén** | Message cũ (thay bằng tóm tắt) | Cả đường nhánh cũ...

```
The following is a summary of a branch that this conversation came back from:

<summary>
The user explored a different conversation branch before returning here.
Summary of that exploration:

## Goal
Try approach A (PostgreSQL triggers)

## Progress
### Done
- [x] Read schema.ts, identified trigger points

### Blocked
- [x] Performance test showed 3x slowdown: abandoned this approach

## Key Decisions
- **Abandon triggers**: Too slow for high-throughput tables

<read-files>
schema.ts
benchmark/trigger-bench.ts
</read-files>
</summary>
```


thay bằng tóm tắt |

| **Chi phí** | Lọc message đủ điều kiện, loại toolResult | Sinh tóm tắt một lần mỗi lần chuyển nhánh |
| **Output** | Một `CompactionSummaryMessage` mới | Một `BranchSummaryMessage` mỗi nhánh bị bỏ |

Hai cơ chế, hai mục đích hoàn toàn khác nhau, dùng chung pipeline nền.

---

## 7. Chuỗi liên kết toàn cảnh: mọi xử lý context một lần gọi tool đi qua

Giờ ghép tất cả lại, vòng đời hoàn chỉnh của một lần gọi `read`: từ khi người dùng nhấn Enter, đến khi LLM nhận message: qua từng khâu của context engineering:

Chuỗi liên kết toàn cảnh: từng mắt xích xử lý context

**Chú thích hình:** luồng ngang 8 node: User input -> buildSessionContext (phía đầu vào: đệ quy đa lớp, đóng gói XML, lazy load Skills) -> context.messages (phía lịch sử: CompactionSummaryMessage + BranchSummaryMessage + message thô) -> Agent.processEvents / transformContext -> convertToLlm -> LLM. Mỗi node đánh dấu kỹ thuật context engineering được dùng.

Một vài quyết định thiết kế trở nên rõ ràng:

- **Phía đầu vào là "phép cộng", phía lịch sử là "phép trừ"**: lắp ráp system prompt chủ động thêm quy tắc; Compaction và Branch Summary chủ động bỏ
- **Skills lazy load khớp phía đầu vào và phía đầu ra**: danh sách nhẹ ở đầu vào, LLM dùng `read` để kéo theo nhu cầu (phía đầu ra)
- **Mỗi output của tool được cắt độc lập**: `truncate.ts` không quan tâm upstream là luồng bình thường hay luồng Compaction đã khôi phục

Hết chuỗi liên kết toàn cảnh. Phần còn lại: tinh hoa thiết kế: là tổng kết các ý tưởng thiết kế của mấy cơ chế này.

---

## 8. Tinh hoa thiết kế

### 1. Đa lớp phòng thủ: không có viên đạn bạc, chỉ có lớp chồng lớp

Context engineering của Pi dùng **4 kỹ thuật hoàn toàn khác nhau**, mỗi kỹ thuật giải một vấn đề khác:

- Cắt output của tool giải "kết quả tool đơn lẻ quá lớn"
- Lắp ráp system prompt giải "inject quy tắc dự án"
- Compaction giải "hội thoại tuyến tính quá dài"
- Branch Summarization giải "chuyển nhánh bị quên"

**Mỗi tầng chỉ giải vấn đề mình giỏi, không thay thế nhau**. Bạn có thể tinh chỉnh Compaction cực kỳ mạnh (đặt `reserveTokens` rất lớn), nhưng output của một lần gọi tool vẫn cần cắt: vì kết quả `read` 80KB, không cắt thì chưa qua nổi một lượt. Ngược lại cũng vậy.

Đây là trí tuệ của kỹ thuật: **thừa nhận biên năng lực của từng cơ chế, kết hợp chúng**. Lỗi phổ biến của người mới là "tìm được một chiêu thì dùng đến cùng" (ví dụ chỉ trông vào LLM tự xử lý input quá dài), kết quả gặp kịch bản cụ thể là vỡ. Cách Pi làm: mỗi tầng làm thứ đơn giản nhất, đáng tin nhất, nhiều tầng chồng lên thành phòng thủ hoàn chỉnh.

> Hiện thực: rải rác trong `packages/coding-agent/src/core/{tools,system-prompt,compaction}/*.ts` và `packages/agent/src/harness/`

### 2. Cộng + trừ: thao tác hai chiều của context engineering

§3 là "phép trừ": thu nhỏ thứ quá lớn. §4 là "phép cộng": chủ động **thêm** quy tắc dự án và Skills. §5~§6 vừa cắt vừa "cộng": **thêm** tóm tắt có cấu trúc, thêm thành quả khám phá nhánh bị bỏ.

Context engineering không đơn thuần là "nén", mà là "**định hình**": trong ràng buộc thể tích, làm thông tin **chính xác hơn, có cấu trúc hơn, dễ hiểu hơn**.

Phản ví dụ: trực tiếp ghép 50 lượt hội thoại thô rồi ném cho LLM, về thể tích thì OK (nếu tổng token không vượt cửa sổ), nhưng hiệu quả kém xa so với "tóm tắt có cấu trúc + message gần đây". Cách trước đòi hỏi LLM tự rút điểm chính từ khối text lớn, cách sau đã sắp xếp điểm chính xong. **Cùng lượng token, thông tin có cấu trúc mật độ cao hơn**.

Pi thể hiện tư tưởng này ở ba chỗ:

- Compaction dùng template 6 section (bao gồm Critical Context)
- Branch Summary dùng template 5 section (không có Critical Context)
- Lắp ráp system prompt dùng thẻ XML (biên ngữ nghĩa rõ ràng)

**Cấu trúc là đòn bẩy của context engineering**: chỉ cần chút prompt engineering, bạn tận dụng được cải thiện khổng lồ của LLM trong việc hiểu thông tin.

### 3. Gọi tool = load context theo nhu cầu

Lazy load Skills ở §4 hé lộ một mẫu thiết kế sâu hơn: **dùng gọi tool để load context theo nhu cầu**.

Context engineering truyền thống là kiểu "**push**" (đẩy): hệ thống quyết định cho LLM thấy gì, nhồi hết vào system prompt.

Skills của Pi là kiểu "**pull**" (kéo): hệ thống chỉ đưa một danh sách (nhẹ); LLM căn cứ nhiệm vụ hiện tại **chủ động gọi read** để kéo full text của skill.

| Chiều | Push mode | Pull mode |
| --- | --- | --- |
| Chi phí token | Trả trước tất cả | Dùng mới trả |
| Mật độ thông tin | Phần lớn không liên quan | Trúng chính xác |
| Tính chủ động của LLM | Thụ động nhận | Chủ động chọn |
| Kịch bản phù hợp | Thông tin phải biết | Thông tin có thể dùng |

**Nhận xét cốt lõi**: khi LLM có khả năng gọi tool, "tool" chính là vật mang của context engineering: không cần nhồi mọi thông tin có thể dùng vào prompt, để LLM dùng tool lấy theo nhu cầu.

Tư tưởng này ngày càng quan trọng trong hệ thống Agent hiện đại. "Skills" của Claude Code, "docs" của Cursor, "context files" của Cline: bản chất đều cùng một cơ chế với các hiện thực khác nhau. Hiện thực của Pi là sạch nhất: danh sách XML + tool read + quy ước phân giải đường dẫn, ba dòng định nghĩa toàn bộ hợp đồng.

> Hiện thực: `formatSkillsForPrompt` (`skills.ts:335`) + lời nhắc trong prompt `"Use the read tool to load a skill's file when the task matches its description"`

---

## 9. Trạm tiếp theo

Chương này ta đã xem toàn cảnh context engineering của Pi. Compaction ở §5 và Branch Summarization ở §6 đều liên quan đến một khái niệm ta cứ nhắc đi nhắc lại mà chưa triển khai: **Session Tree**.

Kết quả của Compaction lưu thành `CompactionEntry`, "append vào Session Tree". Branch Summarization kích hoạt khi "người dùng chuyển nhánh cây phiên". Nhưng Session Tree rốt cuộc là cấu trúc gì? Tại sao lịch sử hội thoại là một cây chứ không phải mảng tuyến tính? Thuật toán LCA cho việc chuyển nhánh dựa vào cấu trúc dữ liệu nào?

Chương tới: quản lý phiên: trả lời những câu hỏi này.

```
用户输入 "修复 auth.ts 的 bug"
    │
    ▼
[1] 系统提示词组装（§四）
    buildSystemPrompt()
    ├─ 找 CLAUDE.md（向上递归 + agentDir）
    ├─ 加载 Skills 清单（懒加载）
    ├─ 拼接工具列表 + guidelines
    └─ 末尾加 Current date / cwd
    │
    ▼
[2] 用户消息进入 context.messages（第6章）
    │
    ▼
[3] Agent Loop 开始（第3章五步管道）
    │
    ▼
[4] LLM 返回 toolCall: read("auth.ts")
    │
    ▼
[5] 执行工具: read auth.ts
    │
    ▼
[6] 工具输出截断（§三）
    ├─ truncateHead（read 用 head）
    │   └─ 2000 行 / 50KB 双限制
    ├─ UTF-8 边界安全
    └─ 超限返回 firstLineExceedsLimit 标志
    │
    ▼
[7] 工具结果进入 context.messages（第5章）
    │
    ▼
   ...循环...
    │
    ▼
[8] agent_end 事件触发（第7章）
    │
    ▼
[9] 检查 shouldCompact？（§五 / 第9章）
    │
    ├── 否 → 等下一轮
    │
    └── 是 → 执行 Compaction
         ├─ findCutPoint
         ├─ generateSummary（LLM 调用）
         ├─ 生成 CompactionSummaryMessage
         └─ 写入 Session Tree

    用户切换分支？
         │
         ▼
[10] Branch Summarization（§六）
     ├─ collectEntriesForBranchSummary（LCA）
     ├─ generateBranchSummary（LLM 调用）
     └─ 生成 BranchSummaryMessage
```


---

> **Chỉ mục source then chốt của chương này**:
>
> `packages/coding-agent/src/core/tools/truncate.ts`: thuật toán cắt (`truncateHead` / `truncateTail` / `truncateLine`)
> `packages/coding-agent/src/core/tools/output-accumulator.ts`: bộ tích lũy streaming (chi tiết hiện thực, chương này không triển khai)
> `packages/coding-agent/src/core/tools/bash.ts`: tích hợp tool bash (cắt + tích lũy + ghi xuống đĩa)
> `packages/coding-agent/src/core/system-prompt.ts`: lắp ráp system prompt (`buildSystemPrompt`)
> `packages/coding-agent/src/core/resource-loader.ts:85-123`: tra cứu đệ quy đi lên CLAUDE.md / AGENTS.md
> `packages/coding-agent/src/core/skills.ts:335-361`: Skills lazy load (`formatSkillsForPrompt`)
> `packages/agent/src/harness/compaction/branch-summarization.ts`: tóm tắt nhánh (LCA + template 5 section; cùng tên file trong gói coding-agent có hiện thực chi tiết hơn 371 dòng, mục này tham chiếu số dòng của gói agent)
> `packages/agent/src/harness/compaction/compaction.ts`: thuật toán chính Compaction (xem Chương 9 để biết chi tiết)
