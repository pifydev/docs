---
title: 'Chương 8: Kỹ thuật ngữ cảnh'
description: Cách Pi giới hạn đầu ra Tool, ghép tài nguyên trusted và untrusted, rồi nén lịch sử dài hoặc phân nhánh cho mỗi model call.
translation_key: ch08-context-engineering
language: vi
chapter: 8
source_url: 'https://www.dgzhuya.com/modules/ch08-context-engineering'
official_refs:
  - 'https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/coding-agent/src/core/resource-loader.ts'
  - 'https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/coding-agent/src/core/tools/truncate.ts'
  - 'https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/coding-agent/src/core/compaction/compaction.ts'
terms_used:
  - Context
  - Context Engineering
  - System Prompt
  - transformContext
  - convertToLlm
status: reviewed
last_updated: '2026-08-24'
translator: Pify maintainers
reviewed_by: Pify maintainers
---

Chương 6 đã đi theo các record `AgentMessage` giàu dữ liệu tới ranh giới `convertToLlm`. Chương 7 đã theo dõi các event phát ra khi những record đó thay đổi. Cả hai con đường đều gặp một giới hạn: model chỉ nhận context hữu hạn, trong khi một coding session có thể tiếp tục thu thập instruction, định nghĩa Tool, message, nội dung file, log lệnh và evidence truy xuất.

Kỹ thuật ngữ cảnh quyết định dữ liệu nào đi vào một model call, theo thứ tự nào và dưới hình thức gì. Pi áp dụng nhiều cơ chế tại các ranh giới khác nhau. Giới hạn 50 KiB của đầu ra Tool đo byte UTF-8. Cửa sổ model đo token. `transformContext` tạo projection của message cho một lần gọi. Compaction thay đổi góc nhìn của active session bằng cách thêm summary entry. Nếu coi các thao tác này là một, ta sẽ che mất failure mode mà từng thao tác xử lý.

## 1. Vấn đề: cửa sổ cố định, hội thoại tiếp tục dài ra

Một request của Pi AI có `systemPrompt`, `messages` và `tools`. Package coding-agent điền các field đó từ nhiều nguồn hơn vẻ ngoài gọn gàng của interface:

```text
Một model request
├─ system prompt
│  ├─ prompt mặc định hoặc prompt thay thế
│  ├─ phần prompt nối thêm
│  ├─ context file AGENTS.md / CLAUDE.md
│  └─ metadata của skill hiển thị cho model
├─ message trên active session
│  ├─ user message và assistant message
│  ├─ Tool call và Tool result
│  ├─ compaction summary
│  └─ branch summary tùy chọn
├─ định nghĩa và parameter schema của Tool đang active
└─ user input hiện tại cùng context được truy xuất
```

Bất kỳ nhánh nào cũng có thể phình lớn. Một lần build có thể in hàng nghìn dòng. File sinh tự động có thể đặt hàng chục kilobyte trên một dòng. Tool schema chiếm context trước khi model trả lời. Session dài giữ lại các quyết định và thử nghiệm thất bại trước đó. Khi chuyển nhánh, kết quả điều tra hữu ích có thể nằm lại trên một đường dẫn không còn active.

`contextWindow` của model là token budget cứng, dùng chung cho input và response. Vì vậy, Pi giới hạn một số Tool result trước khi chúng vào history, ghép instruction ổn định để người dùng không phải nhắc lại, chỉ chiếu active session path và tóm tắt history cũ hoặc history bị bỏ lại khi workflow tương ứng yêu cầu.

## 2. Bản đồ: phòng thủ tại ranh giới input, request và history

Thiết kế gốc chia thành hai phía lớn là input và history. Pi hiện tại còn phơi bày một ranh giới hữu ích ở giữa: projection message theo từng request trước khi đổi thành Pi AI message.

```text
Ranh giới tài nguyên và Tool
  giới hạn một số built-in Tool output; tìm instruction và skill
                              │
                              ▼
Ranh giới request
  dựng system prompt; chạy context hook; đổi AgentMessage[] thành Message[]
                              │
                              ▼
Ranh giới history
  chiếu active branch; compact history cũ; tùy chọn tóm tắt nhánh vừa rời
```

| Cơ chế | Đơn vị và phạm vi | Thời điểm kích hoạt | Việc cơ chế không làm |
| --- | --- | --- | --- |
| Cắt đầu ra Tool | Dòng, byte UTF-8 và độ dài string của grep | Trong lúc một số built-in Tool chạy | Không tính token hoặc rút ngắn history đã có |
| Ghép system prompt | File, resource record và string | Khi reload resource và dựng lại prompt | Không biến instruction trong repository thành trusted code |
| `transformContext` và `convertToLlm` | Message cho một model call | Trước mỗi assistant response | Tự chúng không persist compaction entry |
| Compaction | Token ước lượng hoặc token do provider báo trên active branch | Manual request, threshold hoặc khôi phục overflow | Không cắt một Tool result quá lớn ngay khi Tool chạy |
| Branch summary | Entry trên đường dẫn vừa rời | Khi tree navigation yêu cầu tóm tắt | Không chạy trong mọi lần chuyển nhánh |

Các lớp phòng thủ phối hợp với nhau. Bỏ một lớp vì đã có lớp khác sẽ mở lại failure mode ban đầu của nó.

## 3. Phòng thủ input 1: cắt đầu ra Tool

### Vấn đề: một lệnh có thể lấp đầy cửa sổ

`npm test` có thể in 8.000 dòng. Đọc minified bundle có thể trả về một dòng 100 KB. Khi lặp lại những kết quả đó trong các request sau, context bị tiêu cho output cũ thay vì quyết định hiện tại.

Chỉ cắt theo số ký tự không thể diễn tả policy Pi cần. File read thường cần phần đầu của range; command failure thường đặt stack hữu ích hoặc exit report ở cuối. Số newline kiểm soát khả năng đọc, còn số byte giới hạn payload. Implementation cũng phải nói rõ phần nào đã bị bỏ để model có thể lấy lại.

Utility dùng chung thuộc `@earendil-works/pi-coding-agent`, không thuộc Agent core hay Pi AI. Nó export `truncateHead()`, `truncateTail()`, `truncateLine()` cùng metadata kết quả. Custom Tool không tự động nhận bảo đảm từ các helper này; tác giả Tool phải tự giới hạn result hoặc gọi utility đã export.

### Hai giới hạn: dòng và byte

[`tools/truncate.ts`](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/coding-agent/src/core/tools/truncate.ts#L11-L45) định nghĩa các giá trị mặc định:

- `DEFAULT_MAX_LINES = 2000`
- `DEFAULT_MAX_BYTES = 50 * 1024`
- `GREP_MAX_LINE_LENGTH = 500`

`truncateHead()` và `truncateTail()` nhận `maxLines` cùng `maxBytes`. Chúng dừng khi chạm giới hạn đang có hiệu lực đầu tiên. Số byte dùng `Buffer.byteLength(text, "utf-8")`; số này không liên quan tới cách model tokenize.

| Thao tác | Giới hạn chính | Phần được giữ | Cách dùng hiện tại |
| --- | --- | --- | --- |
| `truncateHead()` | mặc định 2.000 dòng nguyên vẹn hoặc 50 KiB | Phần đầu | `read`; byte cap cuối cho `grep`, `find` và `ls` |
| `truncateTail()` | mặc định 2.000 dòng hoặc 50 KiB | Phần cuối | output đang stream và output hoàn tất của `bash` |
| `truncateLine()` | mặc định 500 đơn vị string JavaScript | Phần đầu một dòng | từng match hoặc context line của `grep` |

`grep` có thêm giới hạn mặc định 100 match. Sau đó nó cắt từng dòng hiển thị và gọi `truncateHead(rawOutput, { maxLines: Number.MAX_SAFE_INTEGER })`. Vì vậy, số row do match limit kiểm soát, còn utility dùng chung cung cấp cap 50 KiB.

### Policy giữ đầu và giữ cuối

`read` giữ các dòng nguyên vẹn từ `offset` được yêu cầu. Import, declaration và tài liệu cấp file thường nằm sớm, còn continuation marker cho biết offset kế tiếp. `bash` giữ phần cuối, nơi test summary, error stack và exit diagnostic thường xuất hiện.

Có thể tóm lược hai hướng duyệt mà không chép chi tiết implementation:

```text
Pseudocode, không phải Pi API

truncateHead: đi từ đầu → cuối; giữ từng dòng nguyên vẹn khi cả hai budget còn đủ
truncateTail: đi từ cuối → đầu; chèn từng dòng vào đầu khi cả hai budget còn đủ

Ngoại lệ: nếu riêng dòng cuối ban đầu đã vượt byte budget của tail,
truncateTail giữ suffix an toàn theo biên UTF-8 và đánh dấu dòng bị cắt một phần.
```

Giữ head hay tail là policy riêng của từng Tool. Custom Tool trả về diagnostic đầu tiên của compiler có thể chọn giữ head. Tool khác có thể trả về structured summary kèm file handle thay vì raw slice ở một trong hai phía.

### Byte UTF-8 và ranh giới string

Source dùng ba đơn vị khác nhau, vì vậy tên của chúng phải luôn rõ ràng:

| Ranh giới | Cách đo | Thuộc tính an toàn |
| --- | --- | --- |
| Byte cap cho head và tail | Byte UTF-8 | Giữ dòng nguyên vẹn, ngoại trừ edge case đã ghi rõ của tail |
| Slice dòng một phần ở tail | Byte của `Buffer` UTF-8 | Đi qua các continuation byte trước khi decode, nên slice bắt đầu tại biên UTF-8 hợp lệ |
| Line cap của grep | `String.length` và `.slice()` của JavaScript | Đếm code unit UTF-16, không đếm Unicode code point hoặc byte UTF-8 |

Ví dụ, `🙂` chiếm bốn byte UTF-8, hai code unit UTF-16 và một Unicode code point:

```text
giá trị                byte UTF-8    code unit UTF-16    code point
"A"                    1             1                   1
"é"                    2             1                   1
"🙂"                   4             2                   1
```

`truncateTail()` đổi dòng thành `Buffer`, chọn vị trí byte bắt đầu, bỏ qua continuation byte rồi decode suffix còn lại. Nó không trả về emoji bị decode một nửa. `truncateHead()` hoàn toàn không slice dòng đầu quá dài. `truncateLine()` có contract khác: `.slice()` theo 500 đơn vị có thể rơi giữa hai UTF-16 surrogate của ký tự supplementary. Không được mô tả giới hạn hiển thị của grep là an toàn theo code point.

### Khi một dòng vượt budget

Head truncation và tail truncation cố ý xử lý edge case này khác nhau.

Với `read`, nếu riêng dòng đầu được chọn đã lớn hơn 50 KiB, `truncateHead()` trả content rỗng cùng `firstLineExceedsLimit: true`. Tool đổi state đó thành result có hành động khôi phục rõ ràng:

```text
[Line 1 is 92.3KB, exceeds 50.0KB limit.
 Use bash: sed -n '1p' bundle.js | head -c 51200]
```

Với `bash`, nếu riêng dòng cuối ban đầu đã vượt byte cap, `truncateTail()` trả suffix UTF-8 hợp lệ lớn nhất có thể vừa budget và đặt `lastLinePartial: true`. Bash Tool báo cả kích thước phần được giữ lẫn dòng gốc, đồng thời trỏ tới full log đã lưu.

Sự bất đối xứng này ngăn file read giả vờ rằng dòng đầu bị cắt là source line bình thường, nhưng vẫn cho command failure một ít tail output hữu ích.

### Quy tắc 500 đơn vị của grep

[`truncateLine()`](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/coding-agent/src/core/tools/truncate.ts#L264-L275) giữ 500 đơn vị string JavaScript đầu tiên rồi nối `... [truncated]`. `grep` áp dụng hàm này cho match và optional context line. Một notice yêu cầu model dùng `read` để xem dòng đầy đủ.

Giới hạn này xử lý vấn đề hẹp hơn cap 50 KiB. Một minified line có thể lấn át danh sách match hữu ích ngay cả khi tổng output vẫn dưới 50 KiB. Giới hạn 100 match, 500 đơn vị trên mỗi dòng và 50 KiB tổng thể bảo vệ ba chiều khác nhau.

### Marker hiển thị cho người dùng và đường lấy lại dữ liệu

Output bị mất cần có provenance và hành động khôi phục. Built-in Tool hiện tại đưa các hành động đó vào chính text trở thành Tool result:

| Tool | Marker ví dụ | Đường lấy lại dữ liệu |
| --- | --- | --- |
| `read` | `[Showing lines 1-2000 of 5000. Use offset=2001 to continue.]` | gọi lại `read` với `offset` |
| `read`, chạm byte cap | `[Showing lines 1-640 of 5000 (50.0KB limit). Use offset=641 to continue.]` | tiếp tục từ dòng được báo |
| `bash` | `[Showing lines 6501-8500 of 8500. Full output: /tmp/pi-output-….log]` | đọc temporary log |
| `grep` | `[100 matches limit reached. … Some lines truncated to 500 chars. Use read tool to see full lines]` | thu hẹp pattern, tăng `limit` hoặc đọc source |

```text
Ví dụ marker cho edge case của Bash

[Showing last 49.9KB of line 1 (line is 92.3KB).
 Full output: /tmp/pi-output-1a2b3c4d.log]
```

`OutputAccumulator` decode byte đang stream bằng `TextDecoder`, duy trì display tail có giới hạn và mở temporary file khi giới hạn byte hoặc dòng đòi hỏi phải giữ bản đầy đủ. Tool result cuối vẫn dùng cùng tail policy. Temporary path thuộc cơ chế tích lũy của Bash; `read` đã có file gốc, còn `grep` hướng model trở lại source.

## 4. Phòng thủ input 2: ghép system prompt và resource

### Vấn đề: quy tắc dự án phải tới model mà không cần nhắc lại

Repository có thể bắt buộc package manager, test command, generated-file policy hoặc architecture boundary cụ thể. Đưa các quy tắc ổn định đó vào mọi user message vừa tốn token vừa dễ lệch. Pi tìm durable instruction một lần, rồi dựng lại system prompt khi active resource hoặc Tool thay đổi.

System prompt chỉ là một phần của `Context` trong Pi AI. Định nghĩa Tool thật cũng đi qua `Context.tools`; prompt chứa snippet ngắn và guideline của Tool để model chọn trong active set. Prompt template mở rộng thành user input, còn Extension context hook chạy trên message ở bước sau. Các đường này đóng góp context tại thời điểm khác nhau.

### Tìm context file và thứ tự ưu tiên

`loadProjectContextFiles()` đọc nhiều nhất một context file từ mỗi thư mục. Thứ tự candidate chính xác là:

```text
AGENTS.override.md
AGENTS.md
AGENTS.MD
CLAUDE.md
CLAUDE.MD
```

Vì vậy, `AGENTS.override.md` chỉ thắng trong chính thư mục của nó. File này không loại context file ở thư mục khác. Các biến thể viết hoa nêu trên là candidate được liệt kê rõ; quá trình tìm kiếm không phải một directory scan không phân biệt hoa thường.

Danh sách trả về bắt đầu bằng file khớp đầu tiên trong `agentDir`, thường là `~/.pi/agent/AGENTS.md`. Sau đó Pi đi từ `cwd` lên filesystem root, chèn mỗi match vào đầu để ancestor đứng trước descendant:

```text
/workspace/AGENTS.md                     # quy tắc rộng của repository
/workspace/apps/AGENTS.md                # quy tắc của application
/workspace/apps/web/AGENTS.override.md   # bản thay thế riêng cho cwd này
```

Trong linked worktree nằm bên dưới main worktree, Pi bỏ context file của main checkout nếu file đó sẽ lặp lại logical repository scope của worktree root. Cơ chế kế thừa ancestor bình thường vẫn giữ nguyên. Có thể tắt context loading bằng `--no-context-files`.

Thứ tự tạo ra chuỗi đọc từ tổng quát tới cụ thể; nó không cài một parser tự giải quyết mâu thuẫn trong prose. Khi hai file xung đột, tác giả vẫn phải nói rõ precedence.

### Project trust: ranh giới chính xác

Project trust chỉ kiểm soát việc nạp input; cơ chế này không cung cấp sandbox, authorization layer cho Tool call hay biện pháp chống prompt injection. Built-in Tool và extension của Pi chạy với quyền hệ điều hành của process Pi.

`AGENTS.override.md`, `AGENTS.md` và `CLAUDE.md` vẫn được nạp bất kể trust decision, trừ khi context loading bị tắt. Trust bảo vệ project setting cùng các kênh resource có thể chạy hoặc cấu hình hành vi; nó không đánh dấu text thông thường trong repository là an toàn.

| Nguồn | Project untrusted | Project trusted | Quy tắc chọn hoặc merge |
| --- | --- | --- | --- |
| Context file trong `agentDir` và directory chain | Nạp | Nạp | global trước, rồi filesystem ancestor tới `cwd`; một candidate mỗi thư mục |
| `~/.pi/agent/settings.json` và user resource | Nạp | Nạp | user scope luôn có thể dùng |
| `.pi/settings.json` | Bỏ qua | Nạp | deep-merge đè lên global setting |
| `.pi/extensions`, `skills`, `prompts` và `themes` | Bỏ qua | Nạp | setting có thể bật hoặc tắt entry được tìm thấy |
| project `.agents/skills` từ `cwd` đi lên | Bỏ qua | Nạp | dừng tại Git root, hoặc filesystem root khi không ở trong repo |
| project `.pi/SYSTEM.md` và `.pi/APPEND_SYSTEM.md` | Bỏ qua | Có thể chọn | chỉ tại `cwd` hiện tại; mỗi loại fallback về bản global tương ứng |
| user/global extension và temporary CLI `-e` extension khi resolve trust | Nạp | Nạp | có thể xử lý `project_trust` trước khi project extension được nạp |

Pi chỉ hỏi khi tìm thấy resource cần trust và không có decision đã lưu cho thư mục hiện tại hoặc parent. `~/.pi/agent/trust.json` lưu decision theo canonical directory. Interactive mode có thể hỏi; non-interactive mode `-p`, JSON và RPC dùng `defaultProjectTrust`. Giá trị mặc định `"ask"` được xử lý như untrusted khi không có UI để hỏi. `--approve` và `--no-approve` override cho một lần chạy.

### `DefaultResourceLoader`: discovery, phần thêm và override

[`DefaultResourceLoader`](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/coding-agent/src/core/resource-loader.ts#L159-L340) phối hợp `SettingsManager`, `DefaultPackageManager`, quá trình load Extension, context file, skill, prompt template, theme và system-prompt input.

Khi có trust resolver, flow `reload()` trước hết nạp extension set ở trạng thái untrusted. Bootstrap đó gồm user/global extension và temporary CLI extension. Sau khi resolver trả về, loader đặt `SettingsManager.projectTrusted`, reload setting theo state đó, resolve package cùng local resource đã bật, nạp từng loại resource, tìm context file rồi resolve prompt input.

Các resource root rất cụ thể:

```text
User
├─ ~/.pi/agent/{extensions,skills,prompts,themes}
└─ ~/.agents/skills

Project, sau khi trust
├─ <cwd>/.pi/{extensions,skills,prompts,themes}
└─ <cwd hoặc ancestor>/.agents/skills

Khai báo trực tiếp
└─ additionalExtensionPaths / additionalSkillPaths /
   additionalPromptTemplatePaths / additionalThemePaths
```

Các array `additional*Paths` có semantics cộng thêm. Loader merge chúng sau discovered path đã bật và loại canonical path trùng nhau. `--no-skills` tắt skill được tự động tìm, nhưng explicit additional skill path vẫn được nạp. Resource path do Extension cung cấp có thể được thêm sau qua `extendResources()`.

Callback option có semantics thay thế tại ranh giới collection. `skillsOverride(base)`, `promptsOverride(base)`, `themesOverride(base)`, `agentsFilesOverride(base)` và `extensionsOverride(base)` nhận base đã nạp rồi trả về giá trị cuối. Chúng chỉ nối thêm nếu callback tự trả lại base item cùng phần bổ sung. `systemPromptOverride(base)` trả replacement string cuối; `appendSystemPromptOverride(base)` trả array cuối. Gọi chúng là “append hook” sẽ gán cho API một behavior không tồn tại.

### Biên XML và semantics replace so với append

Nếu không có input `systemPrompt` tường minh, loader chọn `<cwd>/.pi/SYSTEM.md` khi project trusted và file tồn tại; nếu không, nó chọn `~/.pi/agent/SYSTEM.md`. Chỉ một replacement file được chọn qua discovery. `APPEND_SYSTEM.md` cũng theo quy tắc project-trước, global-fallback. Array `appendSystemPrompt` tường minh có thể chứa nhiều string hoặc file path; `AgentSession` nối các giá trị đã resolve bằng dòng trống.

`buildSystemPrompt()` cho custom prompt semantics replace có phạm vi hẹp: nó thay role mặc định, prose liệt kê Tool, guideline và block tài liệu Pi. Append text, context file, metadata của skill hiển thị và current working directory vẫn được thêm sau. Context file được bọc kèm path:

```xml
<project_context>

Project-specific instructions and guidelines:

<project_instructions path="/workspace/AGENTS.md">
Use npm and run npm test before submitting.
</project_instructions>

</project_context>
```

XML giúp model nhìn thấy biên nguồn. Nó không thực thi instruction, không cô lập process và không cấp authority. Runtime policy vẫn quản lý path, approval, credential và side effect.

### Skill nạp metadata trước, instruction theo nhu cầu

Pi tìm skill từ user root, trusted project root, package, setting và explicit `--skill` path. Nó tìm đệ quy thư mục chứa `SKILL.md`, validate frontmatter, canonicalize path, đồng thời cảnh báo khi name collision và giữ tên gặp trước.

Khi `read` đang active, `formatSkillsForPrompt()` inject metadata hiển thị cho model thay vì toàn bộ body của mọi skill:

```xml
<available_skills>
  <skill>
    <name>test-setup</name>
    <description>Run and diagnose this repository's test suites.</description>
    <location>/workspace/.agents/skills/test-setup/SKILL.md</location>
  </skill>
</available_skills>
```

Phần prompt đứng trước danh sách yêu cầu model dùng `read` khi task khớp và resolve relative reference từ skill directory. `disable-model-invocation: true` loại skill khỏi danh sách này. Skill vẫn có thể được gọi tường minh bằng `/skill:name`.

Hai đường load tạo history khác nhau. Skill do model chọn đi vào dưới dạng Tool result bình thường của `read`. `/skill:name args` đọc file ở application, bỏ frontmatter, bọc body trong `<skill name="…" location="…">`, nối argument rồi mở rộng text đó thành user message. Metadata được nạp sớm; instruction body chỉ vào context khi cần.

### Khung đầy đủ của system prompt

`buildSystemPrompt()` hiện tại không thêm ngày. Thứ tự cuối là:

```text
Đường mặc định
1. role coding assistant
2. snippet một dòng cho active Tool
3. guideline của active Tool + guideline về câu trả lời ngắn và path rõ ràng
4. path tài liệu Pi cùng quy tắc đọc
5. appendSystemPrompt, nếu có
6. các file <project_context>, theo thứ tự của loader
7. <available_skills>, chỉ khi read active và có skill hiển thị cho model
8. Current working directory

Đường custom prompt
1. customPrompt
2. appendSystemPrompt
3. project context
4. skill hiển thị, khi read được chọn
5. Current working directory
```

`AgentSession._rebuildSystemPrompt()` truyền active Tool name, snippet, guideline, prompt value từ loader, context file và skill. Tách biệt với phần prose đó, `Agent` mang Tool object thật trong Pi AI request. Ranh giới này giữ executable schema của Tool ngoài prose nhưng vẫn mô tả đúng mục đích dùng Tool.

## 5. Phòng thủ history 1: compaction

Tool truncation giới hạn result mới theo dòng và byte. Compaction phản ứng với model context đã tích lũy theo token. Nó hoạt động trên active session branch, persist `CompactionEntry` và tách biệt với projection `transformContext` của từng model call.

Giá trị hiện tại trong `DEFAULT_COMPACTION_SETTINGS` là `enabled: true`, `reserveTokens: 16384` và `keepRecentTokens: 20000`. Threshold compaction dùng đúng predicate sau:

```text
contextTokens > contextWindow - reserveTokens
```

Khi có thể, `contextTokens` lấy từ assistant usage hợp lệ mới nhất: `usage.totalTokens` gốc, hoặc `input + output + cacheRead + cacheWrite`. Message sau usage đó được ước lượng. Đường error và usage toàn số 0 ước lượng đủ trailing context để không làm mất accounting. Token estimate này không có phép đổi cố định sang giới hạn Tool 50 KiB.

Automatic check chạy sau `agent_end` và trước khi submit prompt. Có ba trường hợp: overflow có thể khôi phục với một lần compact-rồi-retry, response thành công nhưng overflow nên compact mà không retry, và vượt threshold nhưng không retry. `AgentSession.compact()` là manual entry point riêng. Cả hai đường chuẩn bị active path, cho hook `session_before_compact` quyền cancel hoặc thay result, rồi mới gọi compactor cấp thấp dùng chung nếu cần.

```text
các entry trên active branch
      │
      ├─ tìm compaction boundary mới nhất
      ├─ đi ngược để giữ khoảng keepRecentTokens
      ├─ tóm tắt các message cũ đủ điều kiện
      └─ append CompactionEntry
             ├─ summary
             ├─ firstKeptEntryId
             └─ tokensBefore

lần buildSessionContext() kế tiếp
      └─ CompactionSummaryMessage + entry được giữ + entry đến sau
```

Cut point có thể là user message hoặc assistant message, nhưng không bao giờ là Tool-result entry. Nếu cắt giữa turn, Pi ghi turn-prefix summary riêng. Các lần compact sau cập nhật summary trước thay vì chồng lại toàn bộ raw history. [Chương 9](ch09-compaction.md) sẽ phân tích quy tắc cut point và structured summary.

`CompactionEntry` đã persist vẫn là session record. `buildSessionContext()` chiếu nó thành `CompactionSummaryMessage`, bỏ các entry cũ đã được tóm tắt và đưa recent tail vào. Sau đó `convertToLlm()` đổi custom role này thành Pi AI message có dạng user, nằm giữa marker dành cho compaction summary.

## 6. Phòng thủ history 2: branch summary tùy chọn

Session là cây nối bằng parent. Quay lại entry cũ rồi tiếp tục sẽ tạo active path từ root tới leaf khác. History trên path vừa rời không còn xuất hiện trên path mới, trừ khi thao tác navigation mang nó sang.

```text
root
├─ điều tra phương án A
│  └─ tìm ra lý do A thất bại       ← leaf cũ
└─ phương án B                       ← path mới sau navigation
```

### Vấn đề: công việc hữu ích có thể nằm lại trên nhánh vừa rời

Chép toàn bộ path cũ sang branch mới sẽ phá các giới hạn kích thước. Bỏ hẳn có thể khiến model lặp lại thí nghiệm thất bại. `AgentSession.navigateTree(targetId, { summarize: true })` cung cấp lựa chọn thứ ba: tóm tắt entry riêng của path vừa rời và gắn summary tại navigation target.

Summarization là tùy chọn. Khi `summarize` không có hoặc là false, Pi chuyển leaf mà không tạo branch summary. Extension hook `session_before_tree` có thể cancel navigation, đổi instruction cùng label hoặc cung cấp summary riêng khi người dùng đã yêu cầu tóm tắt.

### LCA: xác định điểm phân nhánh

`collectEntriesForBranchSummary()` tìm common ancestor sâu nhất giữa leaf cũ và target:

```text
Pseudocode, khớp với thuật toán nối bằng parent hiện tại

oldIds = Set(getBranch(oldLeafId).map(entry => entry.id))
targetPath = getBranch(targetId)                  # root đứng trước
common = entry sâu nhất trong targetPath cũng có trong oldIds

current = oldLeafId
while current tồn tại và current != common:
  thu thập getEntry(current)
  current = entry.parentId

đảo ngược các entry đã thu thập                    # theo thứ tự thời gian
```

Đó là lowest common ancestor (LCA) của hai path được chọn. Bản thân LCA không được tóm tắt. Quá trình thu thập không dừng tại compaction boundary cũ; compaction entry hoặc branch-summary entry trên abandoned path đóng góp summary của nó làm context.

### Sinh summary dùng lại đường compaction

Branch summarizer đổi record đủ điều kiện thành `AgentMessage`, chuẩn bị subset mới-nhất-trước trong budget `model.contextWindow - reserveTokens`, rồi khôi phục thứ tự thời gian. Plain Tool-result entry bị bỏ qua khi đổi entry thành message, trong khi Tool call và file-operation tracking giữ evidence hữu ích.

Sau đó generator dùng `convertToLlm()`, `serializeConversation()` cùng `SUMMARIZATION_SYSTEM_PROMPT` dùng chung. Serialization bọc hội thoại cũ như dữ liệu để summarizer không tiếp tục cuộc hội thoại đó. Branch reserve mặc định là 16.384 token, context window fallback là 128.000 khi model không báo, và cap cho summary response là 2.048 token.

### Template của branch khác compaction

Template branch hiện tại yêu cầu constraint và preference, ba progress state, decision cùng next step. Nó không có phần `Critical Context` của compaction. Các Markdown label của template phải nằm trong fence của summarizer, không đi vào navigation của trang:

```text
## Goal
[What was the user trying to accomplish in this branch?]

## Constraints & Preferences
- [Constraints or "(none)"]

## Progress
### Done
- [x] [Completed work]
### In Progress
- [ ] [Started work]
### Blocked
- [Blocking issues]

## Key Decisions
- **[Decision]**: [Rationale]

## Next Steps
1. [Next action]
```

Theo mặc định, custom instruction được nối dưới nhãn `Additional focus`. `replaceInstructions: true` cho phép chúng thay template. Built-in result nhận preamble nói rằng người dùng đã khám phá branch khác, cộng với danh sách `<read-files>` và `<modified-files>` được suy ra từ Tool activity.

### Inject: entry trước, message khi tạo projection

Pi persist `BranchSummaryEntry` với `parentId` là navigation target, `fromId` là leaf cũ (hoặc `"root"`), summary text, optional details, usage và hook provenance. `BranchSummaryMessage` chỉ tồn tại dưới dạng projection gửi cho model.

```text
Session entry đã persist                Projection theo từng request
BranchSummaryEntry                      BranchSummaryMessage
├─ parentId: navigation target          └─ convertToLlm()
├─ fromId: leaf cũ                         └─ Message dạng user với
├─ summary                                  prefix/suffix của branch summary
└─ details / usage / fromHook
```

`buildSessionContext()` đi trên active path mới và đổi entry tại vị trí của nó trên path. Vì vậy, summary được gắn vào branch mới, còn vị trí trên path quyết định thứ tự của nó trong mọi context về sau.

### So sánh compaction và branch summary

| Khía cạnh | Compaction | Branch summary |
| --- | --- | --- |
| Trigger | manual call, threshold hoặc khôi phục overflow | tree navigation với `summarize: true` |
| Vùng được chọn | phần cũ hơn của active path | entry từ leaf cũ đi ngược tới nhưng không gồm LCA |
| Context gần đây | giữ khoảng `keepRecentTokens` theo cut point hợp lệ | giữ target branch theo cách bình thường |
| Record persist | `CompactionEntry` | `BranchSummaryEntry` |
| Projection cho model | `CompactionSummaryMessage` | `BranchSummaryMessage` |
| Response budget mặc định | tối đa `min(0.8 × reserveTokens, model.maxTokens)` | 2.048 token |
| Mục đích chính | giúp active history dài vừa cửa sổ | mang công việc hữu ích từ path bị bỏ sang branch mới |

## 7. Pipeline đầy đủ: từ resource tới model call kế tiếp

Các lớp phòng thủ xuất hiện vào thời điểm khác nhau. Flow sau gồm cả Tool turn bình thường lẫn check có thể thay đổi context về sau:

```text
1. DefaultResourceLoader.reload()
   ├─ bootstrap user/CLI extension để resolve trust
   ├─ resolve trust; reload global setting + project setting đủ điều kiện
   ├─ tìm resource đã bật và explicit additional path
   ├─ nạp context file bất kể trust
   └─ resolve SYSTEM.md / APPEND_SYSTEM.md theo trust rule

2. AgentSession dựng lại system prompt
   └─ default hoặc custom + append + project_context + skill list + cwd

3. SessionManager.buildSessionContext()
   └─ active path từ root tới leaf, hiểu compaction, có branch summary

4. Agent loop chuẩn bị một assistant response
   ├─ Extension context hook / transformContext: AgentMessage[] → AgentMessage[]
   ├─ convertToLlm: AgentMessage[] → Pi AI Message[]
   └─ Pi AI request: systemPrompt + messages + active Tool schema

5. Model gọi Tool
   ├─ read: policy giữ head
   ├─ bash: policy giữ streamed tail + có thể có full-output file
   └─ grep: giới hạn match + dòng + tổng byte

6. ToolResultMessage đi vào Agent và session history
   └─ Tool turn kế tiếp lặp lại bước 4–6

7. Sau agent_end hoặc trước prompt về sau
   └─ check threshold/overflow có thể append CompactionEntry

8. Khi tree navigation về sau có summarize: true
   └─ chọn theo LCA có thể append BranchSummaryEntry tại target
```

| Stage | Package hoặc class sở hữu | Có durable mutation không? |
| --- | --- | --- |
| Giới hạn byte/dòng của Tool | Implementation của built-in Tool trong Coding Agent | Tool result có giới hạn và đôi khi có temporary full-output file |
| Resource discovery và prompt input | `DefaultResourceLoader` + `SettingsManager` | resource set trong memory; setting store và trust store là file riêng |
| Projection active path | `SessionManager.buildSessionContext()` | không; derive message từ session entry |
| Lọc theo lần gọi | Agent `transformContext` / Extension `context` hook | không; làm việc trên request projection |
| Đổi role | Coding Agent `convertToLlm()` | không; tạo Pi AI `Message[]` |
| Compaction | `AgentSession` + module compaction của Coding Agent | có; append `CompactionEntry` |
| Branch summary | `AgentSession.navigateTree()` + branch summarizer | có khi được yêu cầu; append `BranchSummaryEntry` |

Ownership map này ngăn hai lỗi phổ biến: đặt session compaction trong request hook dùng một lần, và cho rằng Tool result đã giới hạn byte đồng nghĩa toàn bộ token context chắc chắn vừa cửa sổ.

## 8. Bài học thiết kế

### 1. Xếp lớp phòng thủ theo failure mode

Pi dùng nhiều policy nhỏ vì các failure có đơn vị và lifetime khác nhau. Dòng giữ output dễ đọc. Byte giới hạn Tool payload. Token bảo vệ model request. Active-path projection tôn trọng session tree. Trust quyết định kênh resource do project kiểm soát nào có thể tác động lúc startup.

Mỗi policy cần contract nhìn thấy được. Tool result nói phần nào bị bỏ và cách lấy lại. Compaction entry ghi retained boundary. Branch summary ghi nơi nó đến từ. Resource record mang source path. Các marker này giúp kiểm tra được thao tác làm mất dữ liệu.

Custom surface vẫn giữ trách nhiệm riêng. `truncate.ts` không thể bảo vệ custom Tool chưa từng gọi nó, và project trust không thể authorize path nguy hiểm chỉ vì một instruction yêu cầu như vậy.

### 2. Phép cộng và phép trừ cùng định hình request

System-prompt append text, context file, skill metadata, compaction summary và branch summary thêm thông tin có cấu trúc. Tool truncation, active-branch selection, request hook và compaction loại hoặc thay volume có giá trị thấp hơn.

Invariant hữu ích là provenance qua từng phép biến đổi:

```text
source record
  → quy tắc chọn
  → representation có giới hạn hoặc có cấu trúc
  → marker nêu tên nguồn hoặc vùng bị bỏ
  → model request kế tiếp
```

Chỉ thêm mà không có budget sẽ tạo noise. Chỉ bớt mà không có marker sẽ tạo sự tự tin sai. Summary giữ path, constraint, decision, thử nghiệm thất bại và phần việc chưa xong mang nhiều actionable state hơn một narrative recap có cùng kích thước.

Trước khi handoff context pipeline, hãy test năm ranh giới cụ thể:

1. Đưa vào một dòng lớn hơn byte cap và đặt text multi-byte tại điểm cắt.
2. Tạo global, ancestor, current-directory, replacement và append instruction xung đột; ghi lại thứ tự kết quả.
3. Lặp lại resource test khi từ chối project trust; xác nhận context file vẫn nạp còn protected project resource thì không.
4. Vượt token threshold một lần bằng provider usage và một lần bằng trailing message ước lượng; kiểm tra retained entry boundary.
5. Navigate giữa hai sibling leaf một lần không tóm tắt và một lần có tóm tắt; kiểm tra `fromId`, `parentId` cùng projected message.

### 3. Tool call cung cấp context theo nhu cầu

Progressive disclosure của skill, continuation offset của `read`, việc thu hẹp grep và full-output file của Bash có cùng pattern: giữ default request nhỏ và cho model cách lấy thêm thật chính xác.

```text
Đẩy mọi resource có thể cần             Công bố index nhỏ + đường truy xuất
───────────────────────────             ────────────────────────────────
prompt cố định lớn                      tên / mô tả / vị trí của skill
phần lớn body không liên quan           model chỉ chọn read khi khớp
không có quyết định truy xuất           body đã lấy trở thành history có thể truy vết
```

| Khía cạnh | Đẩy sẵn | Kéo theo nhu cầu |
| --- | --- | --- |
| Token cost ban đầu | trả cho mọi resource | chỉ trả cho metadata |
| Lựa chọn | application dự đoán toàn bộ relevance | model hoặc user chọn source có tên |
| Dấu vết | content có thể hòa vào prompt lớn | Tool result hoặc skill wrapper ghi path |
| Phù hợp nhất | instruction bắt buộc, ổn định | workflow tùy chọn, file dài và diagnostic hiếm gặp |

Quy tắc bắt buộc vẫn nên nằm trong context file hoặc system prompt. Kiến thức tùy chọn phù hợp với index và retrieval Tool. Handoff phải giữ cả hai nửa: description đủ để tìm thấy và path mà active Tool set thật sự đọc được.

## 9. Trạm tiếp theo

[Chương 9](ch09-compaction.md) mở hộp đen compaction: token estimate, cut point hợp lệ, split turn, incremental summary, file tracking và cách dựng lại từ `CompactionEntry`. Sau đó [Chương 10](ch10-session.md) đi theo parent-linked session tree, nền tảng của active-path projection và branch summary dựa trên LCA.

Các implementation reference của chương này được pin theo Pi `0.84.2` tại `a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c`:

- [Tool truncation và ranh giới Unicode](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/coding-agent/src/core/tools/truncate.ts#L11-L275)
- [Continuation marker của `read`](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/coding-agent/src/core/tools/read.ts#L271-L317) và [giới hạn của `grep`](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/coding-agent/src/core/tools/grep.ts#L321-L361)
- [Context-file discovery và `DefaultResourceLoader`](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/coding-agent/src/core/resource-loader.ts#L71-L193)
- [Resource root được trust gate bảo vệ](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/coding-agent/src/core/package-manager.ts#L2360-L2515) và [ranh giới trust](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/coding-agent/docs/security.md#L3-L37)
- [Ghép system prompt](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/coding-agent/src/core/system-prompt.ts#L28-L161) và [format metadata của skill](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/coding-agent/src/core/skills.ts#L347-L380)
- [Giá trị mặc định và threshold của compaction](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/coding-agent/src/core/compaction/compaction.ts#L126-L237)
- [Thu thập và sinh branch summary](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/coding-agent/src/core/compaction/branch-summarization.ts#L96-L378)
- [Projection của session context](https://github.com/badlogic/pi-mono/blob/a470b121bf683b4c2b9fc0b3a7c807de7e0cfe9c/packages/coding-agent/src/core/session-manager.ts#L380-L469)

> **Đọc tiếp:** [Chương 9: Nén ngữ cảnh](ch09-compaction.md)
