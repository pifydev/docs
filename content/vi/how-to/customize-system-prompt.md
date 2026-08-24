---
title: Tùy chỉnh system prompt
description: Chọn context file, prompt thay thế, prompt bổ sung, CLI flag hoặc SDK override đúng với phạm vi sử dụng.
translation_key: how-to-customize-system-prompt
language: vi
status: reviewed
reviewed_by: Pify maintainers
last_updated: '2026-08-24'
---

Pi tách hướng dẫn của project khỏi system prompt nền. Hãy chọn cơ chế có phạm vi hẹp nhất nhưng vẫn đáp ứng đúng mục tiêu.

## Chọn nguồn phù hợp

| Mục tiêu | Nguồn |
|---|---|
| Chia sẻ quy ước của project | `AGENTS.md` hoặc `CLAUDE.md` |
| Ghi đè hướng dẫn cho một directory | `AGENTS.override.md` |
| Thay system prompt mặc định của Pi | `.pi/SYSTEM.md` hoặc `~/.pi/agent/SYSTEM.md` |
| Bổ sung vào prompt mặc định | `.pi/APPEND_SYSTEM.md` hoặc file global tương ứng |
| Ghi đè cho một lần chạy | `--system-prompt` hoặc `--append-system-prompt` |
| Nhúng Pi với prompt được cấu hình bằng code | `DefaultResourceLoader` |

## Thêm hướng dẫn cho project

Tạo `AGENTS.md` trong repository:

```md title="AGENTS.md"
# Project conventions

- Use TypeScript strict mode.
- Run `npm test` before reporting completion.
- Do not edit generated files under `dist/`.
- Treat migrations as backward-compatible changes.
```

Pi đọc file global rồi đi từ các parent directory đến current working directory. Nếu một directory có `AGENTS.override.md`, file này chỉ thay thế `AGENTS.md` hoặc `CLAUDE.md` trong chính directory đó.

Dùng context file cho command, convention, safety rule và thông tin về repository. Nội dung nên ngắn gọn, có thể kiểm chứng. Dùng `--no-context-files` để tắt discovery khi xử lý checkout chưa đáng tin cậy.

## Thay hoặc bổ sung prompt nền

Dùng `.pi/SYSTEM.md` khi ứng dụng cần một base role khác. Dùng `.pi/APPEND_SYSTEM.md` khi vẫn cần giữ hướng dẫn tích hợp của Pi về tool và environment.

```md title=".pi/APPEND_SYSTEM.md"
## Release policy

Never publish a package without showing the exact version and tag to the user.
```

Resource `.pi` trong project cần project trust. Chế độ interactive sẽ hỏi người dùng; chế độ non-interactive dùng `defaultProjectTrust` trừ khi có `--approve` hoặc `--no-approve`.

## Ghi đè từ CLI

```bash
pi --system-prompt "You review API compatibility. Return a concise report."
pi --append-system-prompt "Do not modify files in this run."
```

`--system-prompt` thay base prompt, nhưng context file và skill đã discover vẫn được thêm vào. `--append-system-prompt` giữ base prompt và bổ sung nội dung được truyền vào.

## Ghi đè từ SDK

```ts title="custom-prompt.ts"
import {
  createAgentSession,
  DefaultResourceLoader,
} from "@earendil-works/pi-coding-agent";

const loader = new DefaultResourceLoader({
  systemPromptOverride: () =>
    "You are a concise API compatibility reviewer. Cite files and symbols.",
});
await loader.reload();

const { session } = await createAgentSession({ resourceLoader: loader });
await session.prompt("Review the public exports.");
```

Dùng `appendSystemPromptOverride` nếu cần biến đổi danh sách các prompt section được bổ sung mà không thay base prompt.

## Kiểm tra prompt thực tế

Trong tích hợp SDK, kiểm tra `session.agent.state.systemPrompt` sau khi tạo session. Khi debug CLI, trước tiên hãy giảm số nguồn chồng lấp và xác nhận working directory cùng quyết định project trust.

Không đưa API key, access token hoặc dữ liệu riêng tư của người dùng vào prompt file vì provider được chọn sẽ nhận context kết quả.
