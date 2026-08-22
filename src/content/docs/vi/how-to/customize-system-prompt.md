---
title: "How to customize the system prompt"
description: "Xếp lớp AGENTS.md, SYSTEM.md, CLI flag, và extension thành một prompt mạch lạc mà model thấy."
template: doc
sidebar:
  label: "Tuỳ biến system prompt"
  order: 5
---

Hướng dẫn này cho thấy Pi compose system prompt từ CLI flag, project file, và extension contribution. Sau khi xong bạn sẽ biết cần edit file nào để có tác dụng gì và cách debug prompt cuối cùng mà model thật sự thấy.

:::tip[Khi nào cần]
- Rule riêng cho project ("không dùng `any` trong `src/`")
- Quy ước team encode một lần, áp dụng mọi nơi
- Debug vì sao model theo hoặc không theo một rule
:::

## Thứ tự composition

Pi đọc các nguồn system prompt theo thứ tự này, cái trên thắng:

1. `--system-prompt <text>` CLI flag
2. `--append-system-prompt <text>` CLI flag
3. Project file `./SYSTEM.md` (gần cwd nhất)
4. Project file `./AGENTS.md` (gần cwd nhất)
5. Extension contribution qua `pi.registerSystemPrompt()`
6. Default Pi system prompt

Mỗi layer sau thấy prompt đã được sửa bởi các layer trước. CLI flag ghi đè tất cả bên dưới.

## 1. Thêm rule project trong AGENTS.md

Tạo `AGENTS.md` ở root project:

```md title="AGENTS.md"
# Project rules

- Use TypeScript strict mode everywhere.
- Prefer `unknown` over `any`. Cast only at the boundary.
- Tests live next to the code as `*.test.ts`.
- Do not edit files under `vendor/`.
```

Pi đọc file này ở mọi session mở trong project. File được resolve bằng cách đi ngược lên từ working directory.

:::note[File gần nhất thắng]
Nếu cả `./apps/web/AGENTS.md` và `./AGENTS.md` tồn tại, Pi dùng `./apps/web/AGENTS.md` vì nó gần cwd hơn. Điều này cho phép có rule toàn repo cộng với override theo từng app.
:::

## 2. Thêm block system prompt tường minh với SYSTEM.md

`SYSTEM.md` được coi là prose bắt buộc, trong khi `AGENTS.md` là hướng dẫn. Dùng `SYSTEM.md` khi model phải tuân theo rule, `AGENTS.md` khi đó là preference.

```md title="SYSTEM.md"
You are working inside the Pify monorepo.

Constraints:
- Never run `git push` without explicit user confirmation.
- Never delete files outside the working directory.
- Always read a file before editing it.
```

Sự phân biệt quan trọng vì Pi budget token space khác nhau cho hai cái: `SYSTEM.md` không bao giờ bị cắt trong compaction, `AGENTS.md` có thể bị.

## 3. Truyền chỉ dẫn một lần từ CLI

Cho override ad-hoc mà không edit file nào:

```bash
pi --append-system-prompt "Reply in Japanese for this session."
```

`--system-prompt` thay thế hoàn toàn default Pi prompt (cẩn thận khi dùng). `--append-system-prompt` thêm vào bất cứ gì đã compose bên dưới.

## 4. Thêm prompt expansion qua extension

Một extension Pi có thể đóng góp vào system prompt theo lập trình:

```ts title="extensions/team-roles.ts"
import { registerExtension } from "@pi-coding-agent";

registerExtension({
  name: "team-roles",
  systemPrompt: () => `
You are a staff engineer.
When reviewing code, focus on:
- API contract changes
- Backward compatibility
- Test coverage of new branches
`,
});
```

Hàm chạy lúc session bắt đầu. Nó thấy working directory hiện tại và resolved model, và trả về chuỗi. Chuỗi được append sau các project file và trước default prompt.

## 5. Inspect prompt cuối

Khi model hành xử lạ, bước debug nhanh nhất là log composed prompt. Pi làm điều này khi bạn truyền `--log-prompts`:

```bash
pi --log-prompts
# bắt đầu agent, log final system prompt ra stderr ở mỗi turn
```

Log gồm nguồn của mỗi section, vì vậy bạn có thể biết một rule thiếu đến từ `AGENTS.md` hay từ extension cũ.

## 6. Override default prompt của model

Một số model có framing riêng của vendor trong default Pi prompt. Để opt out:

```bash
pi --no-default-system-prompt --system-prompt "You are a focused coding agent."
```

Hữu ích khi bạn muốn toàn quyền kiểm soát và không muốn tone hoặc guidance của Pi rò rỉ vào cuộc hội thoại.

## Pitfalls

**Edit `AGENTS.md` mà không thấy tác dụng**

File được đọc lúc session bắt đầu. Nếu agent đang chạy, hãy restart. Hot-reload `AGENTS.md` không được hỗ trợ trong các bản stable.

**Đặt secret trong system prompt**

Bất cứ thứ gì trong `SYSTEM.md` hoặc `AGENTS.md` đều được gửi đến model provider ở mỗi turn. Coi cả hai file là công khai với provider bạn gọi.

**Rule xung đột giữa AGENTS.md và SYSTEM.md**

`SYSTEM.md` thắng cho hard constraint, `AGENTS.md` cho soft guidance. Nếu chúng mâu thuẫn và model chọn sai, chuyển rule từ `AGENTS.md` sang `SYSTEM.md`.

## Tiếp theo

- [Chapter 8: Context Engineering](/vi/ch08-context-engineering/) trình bày cách system prompt vừa với context budget rộng hơn.
- [Reference: Environment Variables](/vi/reference/environment-variables/) liệt kê các núm chỉnh ảnh hưởng đến việc load prompt.
