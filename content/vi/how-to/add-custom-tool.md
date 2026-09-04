---
title: Thêm custom Tool
description: Định nghĩa Tool có type, đăng ký với agent core hoặc Coding Agent, rồi kiểm soát validation, progress, hủy tác vụ, quyền và lỗi.
translation_key: how-to-add-custom-tool
language: vi
official_refs:
  - "https://github.com/earendil-works/pi/blob/107d79f11072bbc8a3a757ed7fd69596bee7d68c/packages/agent/README.md#tools"
  - "https://github.com/earendil-works/pi/blob/107d79f11072bbc8a3a757ed7fd69596bee7d68c/packages/coding-agent/docs/extensions.md#custom-tools"
terms_used:
  - AgentTool
  - ToolDefinition
  - ExtensionContext
  - AbortSignal
status: reviewed
reviewed_by: Pify maintainers
last_updated: "2026-09-04"
---

Hướng dẫn này tạo Tool `get_weather` có type để model gọi trong một turn. Ví dụ dùng một tập dữ liệu nhỏ trong bộ nhớ, nên bạn có thể kiểm thử Tool mà không cần dịch vụ bên ngoài. Contract thực thi này cũng dùng được với database hoặc HTTP client, miễn là bạn chuyển tiếp tín hiệu hủy và không đưa credential vào output mà model nhìn thấy.

:::tip[Kết quả sau khi hoàn thành]

Bạn sẽ có schema TypeBox, `AgentTool` bốn đối số cho agent core, `ToolDefinition` năm đối số cho Coding Agent và các cách đăng ký bằng `customTools` hoặc `pi.registerTool()`. Kết quả cuối trở thành `ToolResultMessage` cho lần gọi model tiếp theo; các progress update chỉ là event ở runtime.

:::

## Chọn cách tích hợp

| Cách | Khi nào nên dùng | Cách đăng ký |
| --- | --- | --- |
| Agent core | Ứng dụng tự quản lý model runtime, transcript và policy hook. | Đặt một `AgentTool` vào `Agent.state.tools` hoặc `initialState.tools`. |
| Coding Agent SDK | Cần `AgentSession`, persistence, resource loading và các Tool dựng sẵn. | Truyền một `ToolDefinition` qua `customTools`. |
| Coding Agent Extension | Tool cần được phát hiện cùng Extension và dùng context hiện tại của session hoặc UI. | Gọi `pi.registerTool()` khi Extension được load. |

Chỉ chọn một cách đăng ký ở tầng sản phẩm. Coding Agent session kết hợp `customTools` với các Tool do Extension đăng ký, nhưng đăng ký cùng một tên qua cả hai cách khiến quyền sở hữu không còn rõ ràng.

## Điều kiện cần

Pi `0.85.0` yêu cầu Node.js `>=22.19.0`. Tạo một dự án TypeScript dùng ESM và cài từng package được import trực tiếp trong ví dụ:

```bash
npm init -y
npm pkg set type=module
npm install @earendil-works/pi-ai@0.85.0 @earendil-works/pi-agent-core@0.85.0 @earendil-works/pi-coding-agent@0.85.0 @earendil-works/pi-server@0.85.0
npm install --save-dev typescript tsx @types/node
```

Workaround cho lỗi đóng gói của Pi `0.85.0`: manifest Coding Agent đã phát hành thiếu runtime dependency này dù public root export có load nó. Workaround này chỉ áp dụng cho phiên bản này, không phải quy tắc dependency cố định cho các phiên bản Pi sau.

```json title="tsconfig.json"
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "types": ["node"]
  },
  "include": ["**/*.ts"]
}
```

Thiết lập credential của provider theo [Quickstart](../quickstart.md) trước khi chạy bất kỳ cách nào có gọi model. `@earendil-works/pi-ai` re-export `Type` và `Static` từ TypeBox, vì vậy các file này không cần thêm một import path khác cho schema.

## 1. Định nghĩa Tool và handler

Định nghĩa các field mà model nhìn thấy cùng handler thực thi trong một object có type. Model nhìn thấy `name`, `description` và `parameters`; runtime và UI còn dùng `label`. Giữ tên protocol ổn định và cụ thể. Viết description như một quy tắc lựa chọn: nêu khi nào cần gọi Tool, Tool nhận gì và trả gì.

```ts title="tools/get-weather-core.ts"
import { Type, type Static } from "@earendil-works/pi-ai";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { setTimeout as delay } from "node:timers/promises";

export const weatherParameters = Type.Object(
  {
    city: Type.String({
      description: "City name. This demo supports Paris and Tokyo.",
      minLength: 1,
      maxLength: 80,
    }),
    unit: Type.Optional(
      Type.Union([Type.Literal("celsius"), Type.Literal("fahrenheit")]),
    ),
  },
  { additionalProperties: false },
);

export type WeatherParameters = Static<typeof weatherParameters>;

export interface WeatherDetails {
  phase: "lookup" | "done";
  city: string;
  unit: "celsius" | "fahrenheit";
  temperature?: number;
}

const celsiusByCity: Record<string, number> = {
  paris: 18,
  tokyo: 24,
};

export const getWeatherTool: AgentTool<
  typeof weatherParameters,
  WeatherDetails
> = {
  name: "get_weather",
  label: "Get weather",
  description:
    "Return the demo temperature for Paris or Tokyo. Use only for a weather or temperature question about one of those cities.",
  parameters: weatherParameters,
  executionMode: "parallel",
  async execute(_toolCallId, params, signal, onUpdate) {
    signal?.throwIfAborted();

    const city = params.city.trim();
    const unit = params.unit ?? "celsius";
    const celsius = celsiusByCity[city.toLowerCase()];
    if (celsius === undefined) {
      throw new Error(`Unsupported city: ${city}`);
    }

    onUpdate?.({
      content: [{ type: "text", text: `Checking ${city}...` }],
      details: { phase: "lookup", city, unit },
    });

    await delay(200, undefined, { signal });
    const temperature =
      unit === "celsius" ? celsius : Math.round((celsius * 9) / 5 + 32);

    return {
      content: [
        {
          type: "text",
          text: `${city}: ${temperature} degrees ${unit}`,
        },
      ],
      details: { phase: "done", city, unit, temperature },
    };
  },
};
```

TypeBox có hai nhiệm vụ ở đây. `Static<typeof weatherParameters>` tạo type cho parameters của handler khi biên dịch. Pi còn kiểm tra từng object chứa đối số do model tạo theo schema trước khi chạy `execute`. Quy tắc nghiệp vụ vẫn thuộc về mã ứng dụng: một chuỗi hợp lệ vẫn có thể chứa tên thành phố mà dịch vụ không hỗ trợ. Tool này đã triển khai `execute`; bước tiếp theo tách riêng contract của handler để giải thích trước khi đăng ký.

## 2. Hiểu contract thực thi của handler

Contract cấp thấp của `AgentTool.execute` có đúng bốn đối số. Đoạn trích giữ nguyên chữ ký dưới đây lấy từ `packages/agent/src/types.ts` tại commit đã ghim:

```ts title="Chữ ký AgentTool.execute (tham khảo; không phải file hoàn chỉnh)"
execute: (
  toolCallId: string,
  params: Static<TParameters>,
  signal?: AbortSignal,
  onUpdate?: AgentToolUpdateCallback<TDetails>,
) => Promise<AgentToolResult<TDetails>>;
```

`params` đã qua schema validation. Chuyển tiếp `signal` tới các thao tác I/O có thể hủy và kiểm tra tín hiệu quanh những bước không nhận signal. Gọi `onUpdate` bằng một `AgentToolResult` tạm thời đầy đủ: cả `content` lẫn `details` đều bắt buộc. Callback này tạo event `tool_execution_update`; chỉ kết quả cuối được trả về mới chuyển tới model.

Ném `Error` khi thực thi thất bại. Agent core bắt lỗi, phát `tool_execution_end` với `isError: true` và tạo một `ToolResultMessage` lỗi. Chỉ trả content bình thường khi thành công. Thông báo lỗi sẽ được model nhìn thấy, nên hãy bỏ credential, header, đường dẫn riêng tư và body nguyên gốc từ upstream trước khi ném lỗi.

## 3. Đăng ký Tool với agent

### Agent core

Agent core nhận trực tiếp `AgentTool` bốn đối số. `builtinModels()` quản lý việc tìm provider và streaming; `Agent` quản lý loop cùng event stream.

```ts title="agent-core.ts"
import { Agent } from "@earendil-works/pi-agent-core";
import { builtinModels } from "@earendil-works/pi-ai/providers/all";
import { getWeatherTool } from "./tools/get-weather-core.js";

const models = builtinModels();
const model = models.getModel("anthropic", "claude-sonnet-4-5");
if (!model) throw new Error("Configured model was not found");

const agent = new Agent({
  initialState: {
    systemPrompt: "Use get_weather for supported weather questions.",
    model,
    thinkingLevel: "off",
    tools: [getWeatherTool],
    messages: [],
  },
  streamFn: (activeModel, context, options) =>
    models.streamSimple(activeModel, context, options),
});

const unsubscribe = agent.subscribe((event) => {
  if (event.type === "message_update") {
    if (event.assistantMessageEvent.type === "text_delta") {
      process.stdout.write(event.assistantMessageEvent.delta);
    }
  } else if (event.type === "tool_execution_update") {
    const first = event.partialResult.content[0];
    if (first?.type === "text") console.error(`\n[progress] ${first.text}`);
  } else if (event.type === "tool_execution_end") {
    console.error(`\n[tool ${event.isError ? "error" : "done"}] ${event.toolName}`);
  }
});

const abort = () => agent.abort();
process.once("SIGINT", abort);

try {
  await agent.prompt("What is the weather in Tokyo?");
} finally {
  process.off("SIGINT", abort);
  unsubscribe();
}
```

Khi model phát một `ToolCall` đã chuẩn hóa cho `get_weather`, loop tìm Tool đang hoạt động, kiểm tra đối số, thực thi, thêm `ToolResultMessage` tương ứng rồi gọi lại model để model trả lời người dùng.

### Coding Agent SDK với `defineTool()` và `customTools`

`customTools` nhận các object `ToolDefinition` của Coding Agent. Phương thức `execute` của chúng có đối số thứ năm là `ExtensionContext`. Định nghĩa sau dùng lại phần thực thi ở core nhưng khai báo chữ ký ở tầng sản phẩm qua `defineTool()`:

```ts title="tools/get-weather-session.ts"
import { defineTool } from "@earendil-works/pi-coding-agent";
import {
  getWeatherTool,
  weatherParameters,
  type WeatherDetails,
} from "./get-weather-core.js";

export const getWeather = defineTool<
  typeof weatherParameters,
  WeatherDetails
>({
  name: getWeatherTool.name,
  label: getWeatherTool.label,
  description: getWeatherTool.description,
  promptSnippet: "Look up the demo temperature for Paris or Tokyo",
  parameters: weatherParameters,
  executionMode: getWeatherTool.executionMode,
  async execute(toolCallId, params, signal, onUpdate, _ctx) {
    return getWeatherTool.execute(toolCallId, params, signal, onUpdate);
  },
});
```

`defineTool()` là identity function giữ type inference, không phải registry. Sau đó Coding Agent chuyển `ToolDefinition` sang contract `AgentTool` bốn đối số. Wrapper nội bộ sao chép các trường dùng chung và truyền một `ExtensionContext` mới làm đối số thứ năm khi gọi definition. Không import wrapper nội bộ đó; hãy dùng `customTools` hoặc `pi.registerTool()` để context đến từ session đang hoạt động.

```ts title="agent-session.ts"
import {
  createAgentSession,
  ModelRuntime,
  SessionManager,
} from "@earendil-works/pi-coding-agent";
import { getWeather } from "./tools/get-weather-session.js";

const modelRuntime = await ModelRuntime.create();
const { session } = await createAgentSession({
  modelRuntime,
  sessionManager: SessionManager.inMemory(),
  customTools: [getWeather],
  tools: ["get_weather"],
});

session.subscribe((event) => {
  if (event.type === "message_update") {
    if (event.assistantMessageEvent.type === "text_delta") {
      process.stdout.write(event.assistantMessageEvent.delta);
    }
  } else if (event.type === "tool_execution_update") {
    console.error("\n[progress]", event.partialResult);
  } else if (event.type === "tool_execution_end") {
    console.error(`\n[tool ${event.isError ? "error" : "done"}] ${event.toolName}`);
  }
});

const abort = () => void session.abort();
process.once("SIGINT", abort);

try {
  await session.prompt("What is the weather in Paris?");
} finally {
  process.off("SIGINT", abort);
  session.dispose();
}
```

Mảng `tools` được khai báo rõ là allowlist áp dụng cho Tool dựng sẵn, custom Tool và Extension Tool. Ví dụ này chỉ bật `get_weather`. Bỏ `tools` để dùng thiết lập mặc định, hoặc thêm mọi tên Tool mà session cần.

### Coding Agent Extension với `pi.registerTool()`

Đặt file này trong `.pi/extensions/` để project tự phát hiện, hoặc load qua `DefaultResourceLoader`. Cùng một `ToolDefinition` có thể được đăng ký mà không cần `customTools`:

```ts title=".pi/extensions/weather.ts"
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { getWeather } from "../../tools/get-weather-session.js";

export default function weatherExtension(pi: ExtensionAPI): void {
  pi.registerTool(getWeather);
}
```

Dùng cách Extension khi `execute` cần `ctx.cwd`, `ctx.mode`, `ctx.hasUI`, metadata của session hoặc các session action có kiểm soát. Không giữ context lúc load rồi dùng lại sau khi thay session hoặc reload.

## 4. Thêm permission gate

Khai báo Tool không cấp quyền thực thi. Agent core cung cấp `beforeToolCall`; Coding Agent nối event Extension `tool_call` với hook này. Extension đầy đủ sau đăng ký Tool rồi hỏi trước mỗi lần gọi:

```ts title=".pi/extensions/weather.ts"
import {
  isToolCallEventType,
  type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";
import type { WeatherParameters } from "../../tools/get-weather-core.js";
import { getWeather } from "../../tools/get-weather-session.js";

export default function weatherExtension(pi: ExtensionAPI): void {
  pi.registerTool(getWeather);

  pi.on("tool_call", async (event, ctx) => {
    if (
      !isToolCallEventType<"get_weather", WeatherParameters>(
        "get_weather",
        event,
      )
    ) {
      return;
    }

    if (!ctx.hasUI) {
      return {
        block: true,
        reason: "get_weather requires interactive approval",
      };
    }

    const approved = await ctx.ui.confirm(
      "Run get_weather?",
      `Look up the demo weather for ${event.input.city}?`,
    );
    if (!approved) {
      return { block: true, reason: "User denied the weather lookup" };
    }
  });
}
```

API hiện tại không có trường Tool `requiresPermission`. Host phải quyết định policy trong hook và từ chối khi cần xác nhận nhưng `ctx.hasUI` là false. Lời gọi bị chặn trở thành Tool result lỗi, nhờ đó model có thể giải thích việc từ chối hoặc chọn thao tác khác. Với agent core, truyền policy tương đương của ứng dụng qua `new Agent({ beforeToolCall })`.

## Kiểm soát lifecycle và ranh giới bảo mật

### Kích hoạt, chạy đồng thời và kết thúc

Custom Tool và Extension Tool mặc định được kích hoạt trừ khi allowlist `tools` lúc tạo session hoặc `excludeTools` lọc chúng. `session.getActiveToolNames()` và `session.setActiveToolsByName(names)` thay đổi tập Tool đang hoạt động trong `AgentSession` hiện tại; tên không tồn tại hoặc đã bị lọc sẽ bị bỏ qua, system prompt được dựng lại và thay đổi có hiệu lực ở turn tiếp theo. Extension có các phương thức tương đương là `pi.getActiveTools()` và `pi.setActiveTools(names)`.

Execution mode toàn agent mặc định là `"parallel"`. Đặt `executionMode: "sequential"` cho Tool thay đổi state dùng chung và không thể chạy chồng lấp an toàn. Nếu bất kỳ Tool nào được gọi trong một batch là sequential, cả batch sẽ chạy tuần tự.

Kết quả có thể đặt `terminate: true` khi bản thân Tool là câu trả lời cuối, chẳng hạn Tool `submit_result`. Pi chỉ bỏ lần gọi model tự động tiếp theo khi mọi kết quả đã chốt trong batch đều có `terminate: true`. Tool tra cứu thời tiết không nên đặt flag vì model vẫn cần diễn đạt câu trả lời.

Dùng cơ chế điều khiển Tool đang hoạt động cho hành vi của session, không dùng nó thay cho authorization bên trong `execute`.

### Đối số, đường dẫn, lệnh và secret

Coi đối số từ model là dữ liệu không tin cậy ngay cả sau schema validation. TypeBox kiểm tra shape, giới hạn và literal; nó không quyết định một customer ID, đường dẫn, URL hay shell command có được phép hay không. Kiểm tra lại các quy tắc đó ngay cạnh thao tác tạo side effect. Handler của Extension `tool_call` có thể sửa `event.input`, và Pi không kiểm tra schema lại sau thay đổi này, nên handler sửa input phải giữ hoặc tự kiểm tra lại các bất biến của schema.

Đừng suy ra working directory cố định từ đối số của built-in Tool factory. Trong Pi 0.85.0, `bash`, `edit`, `find`, `grep`, `ls`, `read` và `write` dùng `ctx.cwd` của lời gọi hiện tại để xác định working directory và phân giải relative path; `cwd` truyền vào factory chỉ là fallback khi không có execution context, nên các Tool này không bị cố định vĩnh viễn tại thời điểm load. Custom Tool vẫn phải tự bảo vệ ranh giới authorization: dùng context hiện tại không khiến một path bất kỳ trở nên an toàn.

Với Tool đọc một file đã tồn tại trong project, phân giải cả thư mục gốc lẫn file đích bằng `realpath()` rồi kiểm tra containment. Đoạn sau là mã ứng dụng, không phải helper của Pi:

```ts title="tools/project-path.ts"
import { realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

export async function resolveExistingPathInsideRoot(
  cwd: string,
  input: string,
): Promise<string> {
  if (isAbsolute(input)) throw new Error("Path must be project-relative");

  const root = await realpath(cwd);
  const target = await realpath(resolve(root, input));
  const fromRoot = relative(root, target);
  const escapes =
    fromRoot === ".." ||
    fromRoot.startsWith(`..${sep}`) ||
    isAbsolute(fromRoot);

  if (escapes) throw new Error("Path leaves the project root");
  return target;
}
```

Cách này xử lý symlink tới đích đã tồn tại nhưng không loại bỏ race time-of-check/time-of-use trên filesystem dùng chung có tác nhân thù địch. Với threat model đó, hãy dùng OS sandbox hoặc API filesystem thao tác tương đối qua descriptor. Khi chạy lệnh, truyền executable cố định và mảng đối số thay vì nội suy text từ model vào chuỗi shell. Giữ secret trong cấu hình của host, không đưa vào `description`, progress content, final content hoặc thông báo lỗi.

## Kiểm thử và debug

Trước tiên, kiểm thử contract thực thi mà không cần model. Ví dụ sau bao phủ parameters có type, progress, kết quả cuối, lỗi quy tắc nghiệp vụ và việc hủy:

```ts title="test/get-weather.test.ts"
import assert from "node:assert/strict";
import test from "node:test";
import { getWeatherTool } from "../tools/get-weather-core.js";

test("get_weather reports progress and returns a typed result", async () => {
  const updates: string[] = [];
  const result = await getWeatherTool.execute(
    "test-call",
    { city: "Paris", unit: "celsius" },
    undefined,
    (update) => {
      const first = update.content[0];
      if (first?.type === "text") updates.push(first.text);
    },
  );

  assert.deepEqual(updates, ["Checking Paris..."]);
  assert.equal(result.details.temperature, 18);
});

test("get_weather rejects an unsupported city", async () => {
  await assert.rejects(
    getWeatherTool.execute("test-call", { city: "Oslo" }),
    /Unsupported city: Oslo/,
  );
});

test("get_weather observes cancellation", async () => {
  const controller = new AbortController();
  controller.abort();

  await assert.rejects(
    getWeatherTool.execute("test-call", { city: "Tokyo" }, controller.signal),
    { name: "AbortError" },
  );
});
```

Hai lệnh kiểm tra dùng chung dưới đây không gọi provider:

```bash
npx tsc --noEmit
npx tsx --test test/get-weather.test.ts
```

Sau khi hai lệnh này chạy thành công, chỉ chọn một cách đăng ký. Cả ba cách đều đăng ký tên `get_weather`, vì vậy không cần chạy tất cả.

### Cách dùng Agent core

Chạy `AgentTool` bốn đối số qua host `Agent` ở tầng thấp:

```bash
node --env-file=.env --import tsx agent-core.ts
```

### Cách dùng AgentSession với `customTools`

Chạy `ToolDefinition` năm đối số được truyền qua `customTools`:

```bash
node --env-file=.env --import tsx agent-session.ts
```

### Cách dùng Extension

Không chạy `agent-session.ts` cho cách này. Từ thư mục gốc của dự án, trước hết hãy review `.pi/extensions/weather.ts` vì Extension chạy với quyền của process Pi. Coding Agent CLI tạo một `DefaultResourceLoader`, và loader này chỉ phát hiện file cục bộ sau khi dự án được trust. Package đã phát hành trên npm là nguồn quyết định cho lệnh khởi chạy này: metadata của package ánh xạ executable `pi` tới `dist/cli.js`. Manifest trong source đã ghim vẫn ghi `dist/bundle/cli.js`, nhưng tarball trên npm không có đường dẫn đó. Hãy chạy local bin từ package đã phát hành và nạp `.env`:

```bash
node --env-file=.env ./node_modules/@earendil-works/pi-coding-agent/dist/cli.js "What is the weather in Tokyo?"
```

Khi CLI khởi động ở chế độ interactive, chỉ chấp nhận project-trust prompt sau khi review các resource của dự án; nếu từ chối, Pi sẽ bỏ qua Extension cục bộ. [Hướng dẫn Extensions](https://github.com/earendil-works/pi/blob/107d79f11072bbc8a3a757ed7fd69596bee7d68c/packages/coding-agent/docs/extensions.md#extension-locations) đã ghim mô tả các vị trí được phát hiện, cách reload và ranh giới trust đó.

Khi debug toàn bộ loop, hãy subscribe trước khi gọi `prompt()`. Ghi log `tool_execution_start`, `tool_execution_update` và `tool_execution_end`; che payload nếu chúng có thể chứa dữ liệu người dùng hoặc credential.

## Lỗi thường gặp

**Tool đã đăng ký nhưng model không gọi**

Kiểm tra model đã chọn có hỗ trợ Tool call, tên Tool đang hoạt động và allowlist `tools` có tên đó. Sau đó viết description hẹp hơn để phân biệt Tool này với các Tool bên cạnh. Không hướng dẫn model gọi Tool cho mọi request.

**Tool ném lỗi nhưng lỗi có thể khắc phục**

Ném một `Error` ngắn, có hướng xử lý và đã loại dữ liệu nhạy cảm. Pi mã hóa nó thành Tool result lỗi để model có thể thử lại hoặc giải thích. Trả cùng nội dung đó như kết quả thành công sẽ để `isError` là false. Không cần bọc mọi Tool exception trong `try/catch`, trừ khi bạn cần đổi lỗi tầng thấp thành thông báo an toàn hơn.

**Không thấy progress hoặc progress vẫn xuất hiện sau khi hoàn tất**

Đăng ký event subscriber trước prompt và chỉ gọi `onUpdate` được cung cấp trong lúc `execute` còn pending. Pi bỏ qua update đến sau khi promise của Tool đã hoàn tất. Mỗi update cần cả `content` lẫn `details`.

**Hủy tác vụ nhưng thao tác bên ngoài vẫn chạy**

`session.abort()` và `agent.abort()` phát tín hiệu hủy; chúng không thể hoàn tác một side effect bỏ qua `AbortSignal`. Truyền signal cho `fetch`, timer, thao tác filesystem có hỗ trợ và wrapper của child process, rồi kiểm tra tín hiệu giữa các giai đoạn không thể hủy trực tiếp.

**Kết quả chiếm quá nhiều context**

Cắt log và response body trước khi đặt vào `content`. Trả một trang có giới hạn kèm cursor, hoặc lưu toàn bộ dữ liệu ngoài transcript rồi trả summary an toàn. Progress event cũng cần giới hạn vì UI và subscriber đều nhận chúng.

## Tiếp theo

- [Chapter 5: Tool System](../ch05-tool-system.md) lần theo validation, hook, scheduling, lỗi, ranh giới adapter và việc tạo kết quả trong source đã ghim.
- [How to plug in a new model](plug-new-model.md) trình bày phía provider của một agent integration.
