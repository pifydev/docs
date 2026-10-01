---
title: Sử dụng Codemode và MCP
description: Cấu hình Codemode và MCP của Pi 0.99.2, gồm discovery, authentication, Extension, permission, kết quả và ranh giới retry.
translation_key: how-to-use-codemode-and-mcp
language: vi
official_refs:
  - "https://github.com/earendil-works/pi/blob/005af57d88ee23b33778f343a9595b32e67ff788/packages/coding-agent/docs/mcp.md"
  - "https://github.com/earendil-works/pi/blob/005af57d88ee23b33778f343a9595b32e67ff788/packages/coding-agent/docs/cli.md"
  - "https://github.com/earendil-works/pi/blob/005af57d88ee23b33778f343a9595b32e67ff788/packages/coding-agent/src/extensions/codemode/index.ts"
  - "https://github.com/earendil-works/pi/blob/005af57d88ee23b33778f343a9595b32e67ff788/packages/coding-agent/src/extensions/codemode/tool.ts"
  - "https://github.com/earendil-works/pi/blob/005af57d88ee23b33778f343a9595b32e67ff788/packages/coding-agent/src/core/extensions/types.ts"
  - "https://github.com/earendil-works/pi/blob/005af57d88ee23b33778f343a9595b32e67ff788/packages/coding-agent/src/core/mcp-servers.ts"
  - "https://github.com/earendil-works/pi/blob/005af57d88ee23b33778f343a9595b32e67ff788/packages/coding-agent/CHANGELOG.md"
terms_used:
  - Codemode
  - MCP
  - QuickJS
  - Tool exposure
  - tool_search
  - structuredContent
status: reviewed
reviewed_by: Pify maintainers
last_updated: '2026-10-01'
---

# Sử dụng Codemode và MCP

Pi `0.99.2` có thể kết nối MCP server và cho model phối hợp các Tool call trong `codemode`. Hướng dẫn này bao quát toàn bộ ranh giới vận hành chứ không chỉ bước cài đặt: model khám phá được gì, khi nào server làm chậm prompt, authentication được lưu ở đâu, permission hook nào vẫn chạy và Pi retry lỗi nào.

## Mô hình tư duy

Hãy tách biệt ba tầng:

| Tầng | Chức năng | Không cấp |
| --- | --- | --- |
| `codemode` | Đánh giá JavaScript do model viết trong QuickJS sandbox mới và expose các Tool được chọn qua `tools` | Quyền truy cập trực tiếp Node.js, filesystem, network, timer hay process |
| Pi Tool pipeline | Validate đối số, chạy hook `tool_call` và `tool_result`, áp dụng permission policy rồi ghi nhận Tool event | Sự an toàn chỉ vì call xuất phát từ sandbox |
| MCP connection | Khám phá Tool và resource từ xa hoặc local qua stdio hay streamable HTTP | Authorization để thực hiện mọi thao tác do server quảng bá |

QuickJS cô lập JavaScript do model viết khỏi host process, nhưng Tool được gọi vẫn dùng filesystem, network, credential và process permission của host. Script chỉ tiếp cận các capability đó qua Tool, nhưng những call này là thật: side effect đã hoàn tất không được rollback nếu một statement sau đó thất bại.

Nested call từ Codemode đi qua cùng validation, hook và permission check như call do model phát ra. Hãy xem sandbox là ranh giới ngôn ngữ/runtime, còn Tool pipeline là ranh giới security policy.

## Chọn cách model tiếp cận Tool

Extension Tool có năm giá trị exposure. Giữ bảng này tách khỏi MCP server exposure vì chỉ contract Tool tổng quát mới có `model-only`.

| Tool exposure | Được khai báo cho model | Được Tool khác gọi | Trường hợp dùng |
| --- | --- | --- | --- |
| `direct` | Khi active | Khi active | Tool thông thường mà model có thể gọi trực tiếp |
| `model-only` | Khi active | Không bao giờ | Orchestrator hoặc Tool tương tác không được đệ quy |
| `codemode` | Chỉ khi được activate rõ ràng | Bất cứ khi nào đã register | Tool thường được gọi từ Codemode script |
| `deferred` | Sau khi `tool_search` load kết quả khớp | Bất cứ khi nào đã register | Catalog Tool lớn hoặc ít dùng |
| `hidden` | Không bao giờ | Không bao giờ | Đã register nhưng chủ động để unreachable |

Cấu hình MCP nhận bốn giá trị:

| MCP exposure | Hành vi |
| --- | --- |
| `direct` | Khai báo server Tool cho model và cho phép Codemode gọi |
| `codemode` | Mặc định; không đưa declaration vào request, khám phá/gọi từ Codemode |
| `deferred` | Không đưa declaration vào cho đến khi `tool_search` load kết quả khớp; Codemode vẫn có thể gọi |
| `hidden` | Register Tool nhưng để nó unreachable |

`toolExposure` có thể override từng MCP Tool theo tên chính xác hoặc pattern `*`. Tên chính xác thắng; nếu không có, pattern khớp đầu tiên thắng. Exposure kiểm soát khả năng discovery và callability, không phải authorization. Ngay cả Tool `direct` cũng phải qua permission policy, còn `annotations` là hint chưa được xác minh chứ không phải bằng chứng thao tác an toàn.

Bật cả hai route gián tiếp ở global hoặc trong `.pi/settings.json` của trusted project:

```json title="~/.pi/agent/settings.json"
{
  "defaultTools": ["+codemode", "+tool_search"]
}
```

Với một lần chạy, hãy nhớ `--tools` thay thế selection, vì vậy cần nêu mọi Tool mà session cần:

```bash
pi --tools read,bash,edit,write,codemode,tool_search
```

`tool_search` tìm Tool chưa được khai báo rồi inject declaration khớp vào model call kế tiếp; declaration đã load vẫn nằm trên branch của session đó. Codemode dùng `searchTools()`, `describeTool()`, `describeNamespace()` và `ALL_TOOLS` mà không inject trước toàn bộ schema vào model request. `/reload` activate các entry mới thêm vào `defaultTools`; xóa entry không tắt Tool đang active, còn Tool đã bị tắt thủ công trong session vẫn tắt trừ khi entry vừa được thêm mới. `--tools`, `--no-tools` và `--no-builtin-tools` được chỉ định rõ vẫn override setting.

## Cấu hình MCP server

Dùng cấu hình file cho server cần quay lại ở mọi session. Dùng `pi.registerMcpServer()` cho server do Extension sở hữu và chỉ tồn tại trong session hiện tại của Extension đó.

### Cấu hình global và trusted project

Pi đọc file global tại `~/.pi/agent/mcp.json` và file project tại `.pi/mcp.json`. Entry project thay thế entry global cùng tên. Pi chỉ đọc file project sau khi project trust được cấp, vì vậy hãy review command, URL, environment interpolation và project Extension trước khi trust.

Project trust không phải sandbox và cũng không phải authorization. Nó cho phép Pi load resource do project kiểm soát; nó không giới hạn stdio process đã load, HTTP server hay Tool call sau đó. Đặt server cá nhân và credential trong file global. Chỉ giữ entry project cần thiết, có thể review trong `.pi/mcp.json`.

### stdio và streamable HTTP

Cấu hình global sau khởi động một stdio server local và kết nối một streamable HTTP server:

```json title="~/.pi/agent/mcp.json"
{
  "mcpServers": {
    "workspace": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "."],
      "description": "Read approved workspace files",
      "exposure": "codemode"
    },
    "docs": {
      "url": "https://mcp.example.com/mcp",
      "description": "Search product documentation",
      "exposure": "deferred"
    }
  }
}
```

Entry stdio dùng `command`, `args`, `env` và `cwd`; `command` là một executable, không phải chuỗi shell command. Entry HTTP dùng `url`, `headers` và setting authentication. Pi hỗ trợ streamable HTTP, không hỗ trợ legacy SSE. Cả hai transport nhận `timeout`, `enabled`, `exposure`, `toolExposure` và `description`. Viết `description` thành một câu tóm tắt capability: Pi hiển thị câu đó trong phần `mcp_servers` của prompt, dùng nó để xếp hạng Tool và trả nó từ `describeNamespace()`.

CLI mặc định ghi cấu hình global; thêm `--local` hoặc `-l` để ghi `.pi/mcp.json`. `add` chỉ ghi cấu hình chứ không chứng minh kết nối, vì vậy hãy chạy tiếp `list`:

```bash
pi mcp add workspace --description "Read approved workspace files" -- npx -y @modelcontextprotocol/server-filesystem .
pi mcp add docs --url https://mcp.example.com/mcp --exposure deferred --description "Search product documentation"
pi mcp list
pi
```

Trong session, `/mcp` hiển thị state, source, số Tool, exposure hiệu lực, lỗi và phần cuối stderr của stdio server thất bại. Nó cũng hỗ trợ sign-in, sign-out, reconnect, enable/disable và đổi exposure. Sau khi sửa cấu hình bên ngoài session, hãy reload:

```text
/mcp
/mcp login docs
/mcp reconnect docs
/reload
```

Pi kết nối enabled server ở background. Prompt đầu tiên chỉ chờ tối đa mười giây cho server có Tool `direct`, vì declaration đó phải hiện diện trong request. Codemode script chờ theo nhu cầu với từng server namespace được nêu; `searchTools()` và `ALL_TOOLS`, `tool_search` và MCP resource Tool chờ mọi server liên quan.

Connection retry được giới hạn: HTTP network error và response tạm thời 408, 429, 5xx được retry hai lần; resource read và listing được retry một lần sau các lỗi HTTP tạm thời đó. Connection bị rớt chuyển sang trạng thái disconnected và reconnect ở call kế tiếp.

Tên server nhận chữ cái, chữ số, `_` và `-`. Namespace normalization thay hyphen bằng underscore, nên `mcp__dev-radius` thành `mcp__dev_radius`. Khi tên Tool sau normalize va chạm, Pi cấp stable hash suffix cho mọi Tool va chạm; tên server chỉ khác nhau ở `-` và `_` bị reject thay vì silently merging. Entry không hợp lệ được report rồi skip, còn server cấu hình bằng file chủ động override Extension registration cùng tên.

### OAuth và xác thực bằng provider token

Với MCP OAuth thông thường, bỏ `Authorization` header rồi dùng `/mcp login <server>` hoặc `pi mcp login <server>`. Pi lưu token trong `~/.pi/agent/mcp-auth.json`, refresh khi cần và xóa khi logout. Nếu server không thể dynamic client registration, hãy cấu hình client ID, secret tùy chọn, callback và scope. `oauth.clientName` đổi `client_name` dùng khi dynamic registration; hãy logout trước khi sign in lại bằng tên khác.

Pi `0.99.2` còn hỗ trợ `auth.provider`, gửi token hiện tại của `/login <provider>` dưới dạng bearer token và đọc lại ở mỗi request để token refresh có hiệu lực:

```json title="~/.pi/agent/mcp.json"
{
  "mcpServers": {
    "figma": {
      "url": "https://mcp.figma.com/mcp",
      "oauth": { "clientName": "Claude Code" }
    },
    "private-api": {
      "url": "https://mcp.example.com/private",
      "auth": { "provider": "github" }
    }
  }
}
```

Provider-token authentication bị cấm trong `.pi/mcp.json` của project; chỉ dùng nó trong file global hoặc từ Extension. Vì cơ chế này gửi provider credential đến URL đã cấu hình, `auth.provider` bắt buộc dùng HTTPS, ngoại trừ HTTP loopback host (`localhost`, `127.0.0.1` hoặc `[::1]`). OAuth callback URL là ngoại lệ theo chiều ngược lại: nó phải dùng HTTP trên một trong các loopback host đó. Không đặt client secret hay literal header trong cấu hình project.

```bash
pi mcp add figma --url https://mcp.figma.com/mcp --oauth-client-name "Claude Code"
pi mcp login figma
pi mcp logout figma
```

Với `auth.provider`, trước tiên authenticate provider đó bằng `/login <provider>`, rồi reconnect MCP server để request kế tiếp dùng token hiện tại.

## Khám phá và gọi Tool

Dùng `tool_search` khi model cần gọi trực tiếp Tool khớp sau discovery. Dùng Codemode khi cần phối hợp, chạy song song hoặc lọc nhiều call trước khi output đến model. Declaration budget của Codemode mặc định khoảng 3.000 token ước tính; Tool deferred không bao giờ đi vào description đó, còn discovery helper tìm chúng theo nhu cầu.

Script sau thu hẹp discovery vào một MCP namespace đã normalize, đọc instruction của namespace, chạy hai call độc lập rồi trả về projection gọn:

```javascript
const matches = await searchTools("find an issue by id", {
  namespace: "mcp__issues",
  limit: 5,
});
const namespace = await describeNamespace("mcp__issues");
const declaration = await describeTool(matches[0]?.name);
const available = ALL_TOOLS.filter((tool) =>
  tool.name.startsWith("mcp__issues__"),
);

const [issue, comments] = await Promise.all([
  tools.mcp__issues__get_issue({ id: "PI-992" }),
  tools.mcp__issues__list_comments({ id: "PI-992" }),
]);

text({
  server: namespace?.description,
  described: declaration !== undefined,
  discovered: available.length,
  issue: issue.structuredContent ?? issue.content,
  comments: comments.structuredContent ?? comments.content,
});
```

`searchTools()` xếp hạng bằng BM25 và nhận `limit` cùng `namespace`. `describeTool()` trả description và declaration của một Tool. `describeNamespace()` trả summary của namespace, MCP server instruction và tên Tool. Namespace lookup nhận các dạng như `mcp__dev-radius`, `mcp__dev_radius`, `dev-radius` và `dev_radius`. Đọc `ALL_TOOLS` khám phá mọi callable Tool nhưng có thể phải chờ mọi MCP server, vì vậy hãy ưu tiên tên Tool hoặc namespace đã biết khi latency quan trọng.

Codemode script nhận đầy đủ MCP `CallToolResult`, gồm `content`, `structuredContent` và `isError`. Output trực tiếp cho model có thể bị truncate, trong khi script nhận kết quả hoàn chỉnh và có thể rút gọn trước khi gọi `text()` hay `image()`. `return` ở top-level, `text()`, `image()`, `console.*` và `exit()` tạo script output; work chưa được await sẽ bị cancel khi evaluation kết thúc.

## Đăng ký MCP từ extension

Extension có thể register server theo session và một Tool cấp cao hơn gọi server đó. Ví dụ này cũng minh họa các orchestration field được thêm trong `0.99.0`:

```typescript title=".pi/extensions/issues.ts"
import { Type } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function issuesExtension(pi: ExtensionAPI): void {
  pi.registerMcpServer("issues", {
    url: "https://mcp.example.com/issues",
    description: "Read project issues",
    exposure: "deferred",
  });

  pi.registerTool({
    name: "issue_digest",
    label: "Issue digest",
    description: "Read one issue through the issues MCP server.",
    parameters: Type.Object({ id: Type.String() }),
    outputSchema: Type.Object({
      id: Type.String(),
      summary: Type.String(),
    }),
    exposure: "direct",
    namespace: {
      name: "project_workflows",
      description: "Curated project workflows",
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    prepareLoadout(loadout) {
      const available = loadout.callable.some(
        (tool) => tool.name === "mcp__issues__get_issue",
      );
      return {
        descriptions: {
          issue_digest: available
            ? "Read one issue through the issues MCP server."
            : "The issues MCP server is not callable.",
        },
      };
    },
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const outcome = await ctx.executeTool(
        "mcp__issues__get_issue",
        { id: params.id },
        { signal },
      );
      if (outcome.isError) {
        return {
          content: outcome.result.content,
          details: { nestedTool: "mcp__issues__get_issue" },
          isError: true,
        };
      }

      const summary = outcome.result.content
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join("\n");
      const data = { id: params.id, summary };
      return {
        content: [{ type: "text", text: summary }],
        structuredContent: data,
        details: { nestedTool: "mcp__issues__get_issue" },
      };
    },
  });
}
```

`pi.registerMcpServer()` dùng cùng config shape như entry `mcpServers`, kết nối trong `session_start` khi được register lúc load và kết nối ngay nếu được register muộn hơn. Registration không được lưu. Server từ `mcp.json` cùng tên sẽ thắng; shell command `pi mcp` không load Extension nên không thấy server chỉ được register bằng Extension.

Với một Tool, `namespace` nhóm các declaration liên quan; `annotations` expose hint read-only, destructive, idempotent và open-world; `outputSchema` mô tả `structuredContent` thành công; còn `prepareLoadout()` có thể điều chỉnh description hướng model hoặc ẩn declaration khi tập active/callable thay đổi. Không field nào trong số này bỏ qua authorization.

`ctx.executeTool()` chạy nested call qua validation, hook `tool_call` và `tool_result`, permission check cùng execution event. Nested event mang `parentToolCallId`; transcript không nhận Tool message riêng cho chúng, nhưng parent result giữ record `nestedCalls` có giới hạn. `AgentToolCallOutcome` report Tool failure qua `isError` thay vì reject chỉ vì nested Tool thất bại.

## Giữ nguyên permission boundary

Áp dụng policy tại thao tác tạo side effect:

| Ranh giới | Control bắt buộc |
| --- | --- |
| Project load | Review `.pi/mcp.json` và Extension trước khi cấp trust |
| Tool selection | Dùng exposure để giới hạn discovery, không dùng nó làm quyết định permission |
| Tool execution | Gate call nhạy cảm trong `tool_call`; fail closed khi không có approval UI |
| Arguments | Xem path, URL, command và identifier do model tạo là dữ liệu không tin cậy sau schema validation |
| Credentials | Resolve ở host; không đặt trong description, `content` hướng model, log hay project config |
| Side effects | Giả định nested call trước đó vẫn committed nếu call sau hoặc script thất bại |

QuickJS loại direct host API khỏi script, nhưng không thể giảm authority của Tool được triển khai trong host process. Filesystem Tool vẫn có thể ghi file, shell Tool vẫn có thể khởi động process và MCP Tool vẫn có thể mutate remote service bằng credential cấp cho server.

Permission handler nhìn thấy cả direct call lẫn nested call. Hãy kiểm tra tên Tool hiệu lực, đối số đã normalize, context session hiện tại và annotation được khai báo; đừng chấp nhận `readOnlyHint` hay `idempotentHint` nếu chưa trust Tool hoặc server cung cấp chúng. Giữ Tool destructive ở `hidden` trừ khi workflow cần, sau đó yêu cầu approval rõ ràng gần call.

## Xử lý kết quả, lỗi và retry

Tool result có ba tầng riêng biệt:

| Field | Consumer | Ý nghĩa |
| --- | --- | --- |
| `content` | Model và UI | Block text/image giải thích kết quả |
| `structuredContent` | Programmatic caller | Giá trị machine-readable khớp `outputSchema`; không được gửi đến model như tầng riêng |
| `isError` | Agent loop và caller | Đánh dấu failure trong khi vẫn giữ `content`, details và structured data nếu có |

Codemode thường resolve Tool có `outputSchema` thành `structuredContent`; Tool khác resolve thành text đã ghép. MCP Tool là trường hợp riêng: script nhận đầy đủ `CallToolResult`, kể cả error result. Nested call không phải MCP mà failed, blocked, unknown hoặc invalid sẽ thành Error trong script, còn script failed vẫn giữ partial output trước `Script error:`. Call thành công trước đó không được undo.

MCP Tool call không được retry vì side effect có thể đã xảy ra. Chỉ các path connection và resource-read đã được document mới dùng bounded transient retry nêu trên. Đừng bọc mutation chưa rõ trong application retry mù; trước hết hãy thiết lập idempotency bằng operation key hoặc đọc lại state.

Các trường hợp vận hành thường gặp:

| Triệu chứng | Kiểm tra và xử lý |
| --- | --- |
| `pi mcp list` thoát với `1` | Sửa entry không hợp lệ hoặc enabled server không kết nối; dùng `/mcp` để xem lỗi đầy đủ và phần cuối stderr của stdio |
| Tool non-direct không bao giờ được gọi | Bảo đảm `codemode` hoặc `tool_search` active, kiểm tra exposure hiệu lực trong `/mcp`, rồi search namespace dự kiến |
| OAuth lặp sau khi đổi `oauth.clientName` | Logout để xóa registration cũ, rồi login lại |
| `auth.provider` trả unauthorized | Chạy `/login <provider>`, kiểm tra cấu hình global/Extension và HTTPS URL, rồi reconnect |
| Script timeout sau mutation | Kiểm tra `nestedCalls` và remote state; đừng giả định rollback hay replay toàn bộ script |
| Kết quả quá lớn | Lọc bên trong Codemode; dùng kết quả đầy đủ ở đó và chỉ trả projection cần cho model |
| Server bị rớt | Để call kế tiếp reconnect; dùng `/mcp reconnect <server>` khi chẩn đoán lỗi kéo dài |

## Checklist vận hành

- [ ] Đặt server cá nhân dùng lại và mọi cấu hình provider-token trong `~/.pi/agent/mcp.json`.
- [ ] Review MCP command và URL của project trước khi cấp project trust.
- [ ] Cấp `description` ngắn gọn cho từng server; chỉ chọn `direct` khi schema của nó phải có trong prompt đầu tiên.
- [ ] Dùng `codemode` để orchestration/filter và `tool_search` cho direct call sau discovery.
- [ ] Validate bằng `pi mcp list`, inspect bằng `/mcp`, chạy `/reload` sau khi sửa ngoài session.
- [ ] Cài permission gate `tool_call` cho thao tác filesystem, process, credential, destructive và open-world.
- [ ] Giữ `content`, `structuredContent` và `isError` nhất quán khi hook `tool_result` redact hay transform output.
- [ ] Thiết kế mutation API có idempotency; không bao giờ giả định Pi retry MCP Tool call.
- [ ] Test server mất kết nối, credential hết hạn, timeout, Codemode failure một phần, nested call bị từ chối và result quá lớn.
- [ ] Trong SDK session, thêm rõ ràng built-in Extension MCP, Codemode và Tool-search vì SDK session không tự động load chúng.

## Nguồn được ghim theo release

Mọi hành vi trong hướng dẫn này được ghim tại release commit [`005af57d88ee23b33778f343a9595b32e67ff788`](https://github.com/earendil-works/pi/commit/005af57d88ee23b33778f343a9595b32e67ff788):

| Nguồn | Bằng chứng được dùng |
| --- | --- |
| [`docs/mcp.md`](https://github.com/earendil-works/pi/blob/005af57d88ee23b33778f343a9595b32e67ff788/packages/coding-agent/docs/mcp.md) | Cấu hình, transport, exposure, discovery wait, OAuth, resource, permission, retry limit và Extension precedence |
| [`docs/cli.md`](https://github.com/earendil-works/pi/blob/005af57d88ee23b33778f343a9595b32e67ff788/packages/coding-agent/docs/cli.md) | Codemode runtime, helper, `tool_search`, `--tools` và command `pi mcp` |
| [`codemode/index.ts`](https://github.com/earendil-works/pi/blob/005af57d88ee23b33778f343a9595b32e67ff788/packages/coding-agent/src/extensions/codemode/index.ts) | Built-in Extension activation và settings wiring |
| [`codemode/tool.ts`](https://github.com/earendil-works/pi/blob/005af57d88ee23b33778f343a9595b32e67ff788/packages/coding-agent/src/extensions/codemode/tool.ts) | Ranh giới QuickJS, discovery helper, declaration budget, result mapping và hành vi Codemode loadout |
| [`extensions/types.ts`](https://github.com/earendil-works/pi/blob/005af57d88ee23b33778f343a9595b32e67ff788/packages/coding-agent/src/core/extensions/types.ts) | Năm Tool exposure, namespace/annotations/output schema, loadout, nested-call event và MCP registration API |
| [`mcp-servers.ts`](https://github.com/earendil-works/pi/blob/005af57d88ee23b33778f343a9595b32e67ff788/packages/coding-agent/src/core/mcp-servers.ts) | Bốn MCP exposure, config validation, namespace normalization, OAuth field và giới hạn transport của provider token |
| [`CHANGELOG.md`](https://github.com/earendil-works/pi/blob/005af57d88ee23b33778f343a9595b32e67ff788/packages/coding-agent/CHANGELOG.md) | Phần được giới thiệu ở `0.99.0` và các thay đổi discovery, authentication, normalization, reload trong `0.99.2` |

Đọc riêng các release page để theo dõi trình tự đã phát hành: [`v0.99.0`](https://github.com/earendil-works/pi/releases/tag/v0.99.0), [`v0.99.1`](https://github.com/earendil-works/pi/releases/tag/v0.99.1) và [`v0.99.2`](https://github.com/earendil-works/pi/releases/tag/v0.99.2).
