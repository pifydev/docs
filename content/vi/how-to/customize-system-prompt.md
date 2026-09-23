---
title: Tùy chỉnh system prompt
description: Ghép context file, prompt file, nguồn CLI và extension thành prompt mà Pi gửi đến model.
translation_key: how-to-customize-system-prompt
language: vi
status: reviewed
reviewed_by: Pify maintainers
last_updated: '2026-09-23'
---

Pi tách riêng project context, prompt nền đã chọn, phần prompt bổ sung và thay đổi theo từng lượt của extension. Hướng dẫn này chỉ ra nguồn của từng lớp và cách kiểm tra kết quả mà không dựa vào một quy tắc ưu tiên ngầm.

:::tip[Khi nào cần]

- Áp dụng quy ước của repository cho mọi session mở bên dưới một directory.
- Thay hoặc mở rộng base role của Pi cho một project hay một lần chạy CLI.
- Tìm nguyên nhân khiến một chỉ dẫn bị thiếu, lặp lại, chưa reload hoặc không được tin cậy.

:::

## Thứ tự ghép prompt

`DefaultResourceLoader.reload()` resolve file và nguồn tường minh. Sau đó `AgentSession` dựng prompt theo các giai đoạn sau:

| Giai đoạn | Cách chọn hoặc thứ tự |
|---|---|
| Prompt nền | Nguồn CLI `--system-prompt`; nếu không có thì dùng `.pi/SYSTEM.md` của project đã trust; tiếp theo là `~/.pi/agent/SYSTEM.md` global; cuối cùng là prompt built-in của Pi |
| Prompt bổ sung | Các nguồn CLI `--append-system-prompt` theo thứ tự flag; nếu không có thì dùng `.pi/APPEND_SYSTEM.md` của project đã trust; tiếp theo là `~/.pi/agent/APPEND_SYSTEM.md` global |
| Phần builder thêm | Context file, skill đủ điều kiện, rồi current working directory |
| Thay đổi theo lượt | Các handler `before_agent_start`, nối tiếp theo thứ tự extension |

Chuỗi prompt nền chọn đúng một nguồn. Chuỗi append được discover cũng chọn một file, nhưng các CLI append flag lặp lại tạo thành danh sách có thứ tự và thay thế tập nguồn append được discover. Builder vẫn thêm context file và các skill đủ điều kiện khi tool `read` đang bật; thay prompt nền không loại bỏ chúng.

Project trust áp dụng cho prompt file, settings, extension và các resource được bảo vệ khác trong `.pi` của project. Nó **không** chặn `AGENTS.override.md`, `AGENTS.md` hay `CLAUDE.md`: context file vẫn được load cho project chưa trust trừ khi đặt `--no-context-files`.

## 1. Thêm quy tắc project bằng AGENTS.md

Tạo `AGENTS.md` ở root của repository:

```md title="AGENTS.md"
# Project conventions

- Use TypeScript strict mode.
- Prefer `unknown` over `any`; cast only at a boundary.
- Keep tests next to code as `*.test.ts`.
- Do not edit files under `vendor/`.
```

Pi load context file global trước, sau đó load một context file từ mỗi ancestor directory phù hợp, theo thứ tự từ filesystem root đến current directory. Tất cả các file này đều được xếp lớp; file gần nhất không loại bỏ các file cha.

Trong cùng một directory, candidate tồn tại đầu tiên sẽ thắng: `AGENTS.override.md`, rồi `AGENTS.md`, `AGENTS.MD`, `CLAUDE.md` hoặc `CLAUDE.MD`. Vì vậy, `apps/web/AGENTS.override.md` chỉ thay `apps/web/AGENTS.md` hoặc `CLAUDE.md`; `AGENTS.md` ở root vẫn có hiệu lực.

Dùng các file này cho command, convention, thông tin repository và hướng dẫn an toàn. Viết nội dung đủ cụ thể để kiểm chứng, và dùng `--no-context-files` khi không muốn chỉ dẫn do repository cung cấp đi vào model context.

## 2. Đặt prompt nền bằng SYSTEM.md

Đặt prompt nền của project tại `.pi/SYSTEM.md`, không phải `./SYSTEM.md`:

```md title=".pi/SYSTEM.md"
You are working inside the Pify monorepo.

Constraints:
- Never run `git push` without explicit user confirmation.
- Never delete files outside the working directory.
- Read a file before editing it.
```

Nếu project đã được trust, file này thay cả file global và prompt built-in của Pi. Khi không có file project đã trust, Pi lần lượt dùng `~/.pi/agent/SYSTEM.md` rồi prompt built-in.

Dùng `.pi/APPEND_SYSTEM.md` khi cần giữ prompt nền đã chọn và chỉ thêm nội dung. File project, khi được trust, thay `~/.pi/agent/APPEND_SYSTEM.md` global trong vai trò nguồn append được discover. Pi không gán trạng thái “hard” cho `SYSTEM.md`, “soft” cho `AGENTS.md`, hay một compaction budget riêng cho hai loại file; chúng là các input của prompt với vai trò load khác nhau.

## 3. Truyền nguồn cho một lần chạy từ CLI

Cả hai flag nhận literal text hoặc nội dung của một file path đang tồn tại. `--append-system-prompt` có thể lặp lại:

```bash
pi --system-prompt ./prompts/reviewer.md
pi --append-system-prompt ./prompts/security.md \
  --append-system-prompt "Reply with a concise compatibility report."
pi --no-context-files --system-prompt "Review only the files named by the user."
```

`--system-prompt` thay prompt nền đã chọn cho process hiện tại, nhưng builder vẫn thêm append text, context file, skill đủ điều kiện và working directory. Muốn tắt context discovery, hãy đặt riêng `--no-context-files` hoặc `-nc`.

Khi có bất kỳ nguồn CLI append nào, loader dùng danh sách CLI theo đúng thứ tự thay cho việc discover `APPEND_SYSTEM.md` của project hay global. Nếu vẫn cần nội dung file đó trong lần chạy này, hãy truyền tường minh file path. Với resource `.pi` của project, `--approve` trust chúng trong một lần chạy còn `--no-approve` bỏ qua chúng; hai flag này không tắt context file thông thường.

## 4. Mở rộng prompt theo từng lượt

Extension có thể sửa prompt đã dựng đầy đủ sau khi người dùng gửi prompt và trước khi agent loop bắt đầu:

```ts title="team-roles.ts"
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function teamRoles(pi: ExtensionAPI) {
  pi.on("before_agent_start", (event) => {
    event.systemPromptOptions.promptGuidelines.push(
      "When reviewing code, check API contracts, backward compatibility, and tests.",
    );
  });
}
```

Load extension bằng `pi -e ./team-roles.ts`. `event.systemPrompt` là text được render từ trạng thái hiện tại, còn `event.systemPromptOptions` expose các prompt section có cấu trúc, Tool đã chọn, Tool snippet và guideline có thể sửa. `ctx.getSystemPrompt()` trả về đúng prompt hiện tại đã render như `event.systemPrompt`; cả hai phản ánh các thay đổi mà handler chạy trước đã thực hiện. Thay structured prompt state này cho phép Pi append transcript delta cho đúng section đã đổi, nhờ đó turn sau có thể replay prompt mà không lặp lại mọi section.

Việc trả `{ systemPrompt }` vẫn phù hợp khi một turn cần thay toàn bộ prompt bằng opaque text. Handler chạy sau nhìn thấy forced text đó và provider nhận nó làm system prompt đầu tiên, nhưng transcript vẫn ghi các structured section. Hãy ưu tiên `systemPromptOptions` khi thay đổi khớp một section, Tool selection hoặc guideline hiện có.

Dùng hook này cho chỉ dẫn phụ thuộc vào request. Không nên tự dựng lại file discovery trong extension: `event.systemPromptOptions` đã cung cấp các input nền, gồm context file và skill.

## 5. Kiểm tra prompt thực tế

Không có flag `--log-prompts`. Dùng các getter public của loader để kiểm tra source file đã chọn, sau đó đọc `session.agent.state.systemPrompt` để xem kết quả của builder trước thay đổi theo từng lượt từ extension:

```ts title="inspect-system-prompt.ts"
import {
  createAgentSession,
  DefaultResourceLoader,
  getAgentDir,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";

const cwd = process.cwd();
const agentDir = getAgentDir();
const trustProject = process.argv.includes("--trust-project");
const settingsManager = SettingsManager.create(cwd, agentDir, {
  projectTrusted: trustProject,
});
const loader = new DefaultResourceLoader({ cwd, agentDir, settingsManager });
await loader.reload();

console.log({
  base: loader.getSystemPromptSource()?.path ?? "built-in",
  append: loader.getAppendSystemPromptSources().map(({ path }) => path),
  context: loader.getAgentsFiles().agentsFiles.map(({ path }) => path),
});

const { session } = await createAgentSession({
  cwd,
  agentDir,
  resourceLoader: loader,
  settingsManager,
});
try {
  console.log(session.agent.state.systemPrompt);
} finally {
  session.dispose();
}
```

Chạy bằng `npx tsx inspect-system-prompt.ts`; ví dụ chủ ý bỏ qua resource `.pi` của project. Chỉ thêm `--trust-project` sau khi SDK host đã đưa ra quyết định trust đó. Một `SettingsManager` độc lập không tái hiện saved-trust và interactive prompt flow của CLI, còn context file vẫn xuất hiện ở cả hai chế độ. `getSystemPrompt()` và `getAppendSystemPrompt()` trả về raw text đã chọn khi bạn cần nội dung thay vì source path. Trong `before_agent_start`, hãy kiểm tra `event.systemPrompt` hoặc `ctx.getSystemPrompt()` vì chúng gồm thay đổi từ các handler chạy trước trong lượt đó. Các provider-payload rewrite do `before_provider_request` thực hiện sau này nằm ngoài những view này.

Fixture tùy chọn dưới đây tạo các file độc lập, không gọi provider, đồng thời kiểm tra thứ tự context, override trong cùng directory, prompt file của project đã trust và chưa trust, cách chọn nguồn tường minh theo kiểu CLI, output thực tế của builder và `session.reload()`.

Chạy bằng `npx tsx verify-system-prompt.ts` trên Node `>=22.19.0` sau khi cài SDK bằng `npm install @earendil-works/pi-coding-agent@0.87.1`; cài thêm `tsx` và TypeScript.

<Accordions type="single">
<Accordion title="Fixture DefaultResourceLoader xác định và không cần secret">

```ts title="verify-system-prompt.ts"
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createAgentSession,
  DefaultResourceLoader,
  ModelRuntime,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";

const root = await mkdtemp(join(tmpdir(), "pi-prompt-guide-"));
const agentDir = join(root, "agent");
const projectDir = join(root, "workspace");
const cwd = join(projectDir, "apps", "web");
const projectConfigDir = join(cwd, ".pi");
const cliBaseFile = join(root, "cli-base.md");
const cliAppendFile = join(root, "cli-append.md");

async function load(options: {
  projectTrusted: boolean;
  systemPrompt?: string;
  appendSystemPrompt?: string[];
}) {
  const settingsManager = SettingsManager.inMemory(
    {},
    { projectTrusted: options.projectTrusted },
  );
  const loader = new DefaultResourceLoader({
    cwd,
    agentDir,
    settingsManager,
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    systemPrompt: options.systemPrompt,
    appendSystemPrompt: options.appendSystemPrompt,
  });
  await loader.reload();
  return { loader, settingsManager };
}

try {
  await mkdir(agentDir, { recursive: true });
  await mkdir(projectConfigDir, { recursive: true });
  await writeFile(join(agentDir, "AGENTS.md"), "GLOBAL CONTEXT");
  await writeFile(join(projectDir, "AGENTS.md"), "ROOT CONTEXT");
  await writeFile(join(cwd, "AGENTS.md"), "SHADOWED LOCAL CONTEXT");
  await writeFile(join(cwd, "AGENTS.override.md"), "LOCAL OVERRIDE");
  await writeFile(join(agentDir, "SYSTEM.md"), "GLOBAL BASE");
  await writeFile(join(agentDir, "APPEND_SYSTEM.md"), "GLOBAL APPEND");
  await writeFile(join(projectConfigDir, "SYSTEM.md"), "PROJECT BASE");
  await writeFile(
    join(projectConfigDir, "APPEND_SYSTEM.md"),
    "PROJECT APPEND",
  );
  await writeFile(cliBaseFile, "CLI BASE");
  await writeFile(cliAppendFile, "CLI APPEND ONE");

  const untrusted = await load({ projectTrusted: false });
  assert.equal(untrusted.loader.getSystemPrompt(), "GLOBAL BASE");
  assert.deepEqual(untrusted.loader.getAppendSystemPrompt(), ["GLOBAL APPEND"]);

  const context = untrusted.loader
    .getAgentsFiles()
    .agentsFiles.filter(({ path }) => path.startsWith(root));
  assert.deepEqual(
    context.map(({ content }) => content),
    ["GLOBAL CONTEXT", "ROOT CONTEXT", "LOCAL OVERRIDE"],
  );
  assert(!context.some(({ content }) => content.includes("SHADOWED")));

  const trusted = await load({ projectTrusted: true });
  assert.equal(trusted.loader.getSystemPrompt(), "PROJECT BASE");
  assert.deepEqual(trusted.loader.getAppendSystemPrompt(), ["PROJECT APPEND"]);

  const explicit = await load({
    projectTrusted: true,
    systemPrompt: cliBaseFile,
    appendSystemPrompt: [cliAppendFile, "CLI APPEND TWO"],
  });
  assert.equal(explicit.loader.getSystemPrompt(), "CLI BASE");
  assert.deepEqual(explicit.loader.getAppendSystemPrompt(), [
    "CLI APPEND ONE",
    "CLI APPEND TWO",
  ]);
  assert.deepEqual(explicit.loader.getAppendSystemPromptSources(), [
    { path: cliAppendFile },
  ]);

  const modelRuntime = await ModelRuntime.create({
    authPath: join(root, "auth.json"),
    modelsPath: null,
    refreshOnCreate: false,
  });
  const { session } = await createAgentSession({
    cwd,
    agentDir,
    modelRuntime,
    resourceLoader: explicit.loader,
    settingsManager: explicit.settingsManager,
    sessionManager: SessionManager.inMemory(cwd),
    noTools: "all",
  });

  try {
    const first = session.agent.state.systemPrompt;
    for (const marker of [
      "CLI BASE",
      "CLI APPEND ONE",
      "CLI APPEND TWO",
      "GLOBAL CONTEXT",
      "ROOT CONTEXT",
      "LOCAL OVERRIDE",
    ]) {
      assert(first.includes(marker), `missing ${marker}`);
    }
    assert(!first.includes("PROJECT BASE"));
    assert(!first.includes("SHADOWED LOCAL CONTEXT"));

    await writeFile(join(projectDir, "AGENTS.md"), "ROOT CONTEXT RELOADED");
    await session.reload();
    assert(session.agent.state.systemPrompt.includes("ROOT CONTEXT RELOADED"));
    assert(!session.agent.state.systemPrompt.includes("ROOT CONTEXT\n"));
  } finally {
    session.dispose();
  }

  console.log("system prompt fixture passed");
} finally {
  await rm(root, { recursive: true, force: true });
}
```

</Accordion>
</Accordions>

## 6. Kiểm soát toàn bộ prompt nền

Trong SDK integration, hãy override prompt nền do loader chọn bằng callback public. `cwd` và `agentDir` là option bắt buộc của constructor:

```ts title="full-system-prompt.ts"
import {
  DefaultResourceLoader,
  getAgentDir,
} from "@earendil-works/pi-coding-agent";

const loader = new DefaultResourceLoader({
  cwd: process.cwd(),
  agentDir: getAgentDir(),
  systemPromptOverride: () =>
    "You are a focused coding reviewer. Report evidence by file and symbol.",
  appendSystemPromptOverride: (base) => [
    ...base,
    "Do not modify files unless the user asks.",
  ],
});
await loader.reload();

console.log(loader.getSystemPrompt());
console.log(loader.getAppendSystemPrompt());
```

`systemPromptOverride` nhận prompt nền đã được chọn từ file hoặc CLI, có thể là `undefined`, rồi trả về nội dung thay thế. `appendSystemPromptOverride` nhận danh sách append đã chọn; trả về `[]` để loại bỏ danh sách này. Context file, skill đủ điều kiện và working directory vẫn là các phần do builder thêm. Chỉ đặt `noContextFiles: true` hoặc `noSkills: true` khi ứng dụng nhúng chủ ý tắt riêng các input đó.

CLI không có flag `--no-default-system-prompt`. Dùng `--system-prompt` để thay prompt nền trong một lần chạy, hoặc cấu hình `DefaultResourceLoader` để kiểm soát bằng code.

## Các lỗi thường gặp

**File đã sửa nhưng prompt vẫn cũ.** Pi interactive load resource lúc khởi động. Chạy `/reload`; SDK caller dùng `await session.reload()`. Reload dựng lại resource và system prompt. Nếu `/trust` thay đổi quyết định đã lưu, hãy restart Pi theo hướng dẫn của trust flow.

**Context file con dường như xóa file cha.** Các ancestor directory được xếp lớp. Chỉ `AGENTS.override.md` thay `AGENTS.md` hoặc `CLAUDE.md` trong cùng directory.

**Checkout chưa trust vẫn đưa chỉ dẫn vào prompt.** Project trust bảo vệ resource `.pi`, không bảo vệ context file. Dùng `--no-context-files` cùng sandbox cấp OS hoặc môi trường tách biệt khi không được để nội dung repository đi tới model.

**CLI append làm mất `APPEND_SYSTEM.md`.** Khi có bất kỳ nguồn `--append-system-prompt` nào, Pi bỏ qua append-file discovery trong lần chạy đó. Hãy truyền tường minh mọi file hoặc text source cần dùng.

**Các quy tắc mâu thuẫn.** Pi không áp đặt tầng hard rule của `SYSTEM.md` cao hơn `AGENTS.md`. Hãy bỏ mâu thuẫn hoặc viết rõ quy tắc có phạm vi hẹp hơn, thay vì dựa vào loại source.

**Prompt chứa secret.** Provider đã chọn nhận prompt được ghép khi có model request. Context file, append text, phần extension thêm, path và mô tả skill đều có thể xuất hiện. Không đưa API key, token, dữ liệu riêng tư của người dùng hay chi tiết nội bộ không cần thiết vào các input này; output debug cũng là dữ liệu nhạy cảm.

## Tiếp theo

- [Chương 8: Context Engineering](../ch08-context-engineering.md) giải thích cách dựng prompt trong context pipeline rộng hơn.
- [Tham chiếu: Biến môi trường](../reference/environment-variables.md) trình bày các environment input mà Pi và provider sử dụng.
