---
title: "Chương 4: Gọi model: một dòng, nhiều provider"
description: Cách Models định tuyến request qua auth thuộc provider, API adapter và một event protocol đã chuẩn hóa.
translation_key: ch04-model-invocation
language: vi
chapter: 4
source_url: "https://www.dgzhuya.com/modules/ch04-model-invocation"
official_refs:
  - "https://github.com/earendil-works/pi/blob/107d79f11072bbc8a3a757ed7fd69596bee7d68c/packages/ai/README.md"
  - "https://github.com/earendil-works/pi/blob/107d79f11072bbc8a3a757ed7fd69596bee7d68c/packages/ai/src/types.ts"
terms_used:
  - Model
  - Provider
  - Provider Adapter
  - Stream
status: reviewed
last_updated: "2026-09-04"
translator: Pify maintainers
reviewed_by: Pify maintainers
---

Chương 3 đã theo dõi Agent Loop qua các bước chọn model, streaming, thực thi Tool và quyết định có chạy tiếp hay không. Boundary gọi model vẫn có thể được viết bằng một dòng.

Pseudocode: `model`, `context` và `options` là input do caller sở hữu.

```typescript
const stream = models.streamSimple(model, context, options);
```

Dòng này đi qua một boundary lớn. Pi AI phải tìm provider sở hữu model, resolve credential, chuyển message và Tool của Pi sang request format của provider, đọc streaming dialect của provider rồi trả về một event protocol ổn định. Ở revision Pi `0.85.0` được ghim, implementation chia công việc này cho `Models` collection, các object `Provider` và các API implementation. Global descriptor/translator registry cũ chỉ còn trong compatibility entry point; phần sau sẽ nhắc đến nó trong ngữ cảnh migration.

Chương này mở đầy đủ boundary đó. Nội dung bắt đầu từ khác biệt giữa các provider, đi theo dispatch path hiện tại, rồi xem xét streaming, reasoning, cache, abort, retry và phần việc cần làm khi thêm provider.

## 1. Vấn đề: một cuộc hội thoại, nhiều provider dialect

Agent Loop làm việc với các type `Context`, `Message` và `Tool` của Pi. Provider không nhận trực tiếp các type đó qua wire. Anthropic Messages, OpenAI Chat Completions hoặc Responses, Google Generative AI và Amazon Bedrock Converse mô tả cùng một lượt hội thoại bằng role, block name, field và continuity metadata khác nhau.

Giả sử người dùng yêu cầu Agent đọc `main.ts`. Pi có thể lưu user turn đó bằng format không phụ thuộc provider:

```json
{
  "role": "user",
  "content": "Đọc main.ts và giải thích các function được export.",
  "timestamp": 1748697600000
}
```

Bốn payload fragment dưới đây là pseudocode. Mỗi fragment chỉ giữ phần message cần để cho thấy khác biệt cấu trúc; chúng không phải provider request hoàn chỉnh.

Anthropic biểu diễn text bằng các content block có type:

```json
{
  "role": "user",
  "content": [
    {
      "type": "text",
      "text": "Đọc main.ts và giải thích các function được export."
    }
  ]
}
```

OpenAI Chat Completions chấp nhận string cho plain user turn này, còn Tool result ở các turn sau trở thành message có role `tool` riêng:

```json
{
  "role": "user",
  "content": "Đọc main.ts và giải thích các function được export."
}
```

Google đặt nội dung message trong `parts` của một entry thuộc `contents`:

```json
{
  "role": "user",
  "parts": [
    {
      "text": "Đọc main.ts và giải thích các function được export."
    }
  ]
}
```

Bedrock Converse dùng content block nhưng không có discriminator `type: "text"` như Anthropic:

```json
{
  "role": "user",
  "content": [
    {
      "text": "Đọc main.ts và giải thích các function được export."
    }
  ]
}
```

Các fragment này khá giống nhau vì turn chỉ có text. Tool call, Tool result, image, thinking signature, response ID, system instruction và việc replay message qua provider khác tạo ra khác biệt đáng kể hơn. Adapter phải giữ lại provider metadata có ích, đồng thời ngăn raw provider payload trở thành application state.

### Bốn chiều khác biệt xuất hiện cùng lúc

Chuyển đổi message chỉ là một phần của boundary. Streaming, reasoning và cache control cũng khác nhau, đồng thời tương tác trong cùng một request.

| Chiều                      | Input hoặc output chung của Pi                                                                             | Phần việc riêng theo provider                                                                                                                  |
| -------------------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Format của message và Tool | `Context`, `Message`, `Tool` cùng các block `text`, `thinking`, `toolCall` và image mà các type này hỗ trợ | Role, block name, vị trí JSON Schema, cách nhóm Tool result, opaque signature và response identifier                                           |
| Streaming                  | `AssistantMessageEventStream` với 12 event type                                                            | Parse raw SSE, lặp qua SDK chunk, đọc WebSocket hoặc Bedrock event, ghép partial JSON, usage và ánh xạ stop reason                             |
| Reasoning                  | `streamSimple(..., { reasoning })` cùng capability metadata của model                                      | Anthropic adaptive effort hoặc token budget, OpenAI reasoning effort, Google thinking level hoặc budget và output limit riêng                  |
| Cache control              | `cacheRetention` nhận `"none"`, `"short"` hoặc `"long"`, cùng `sessionId` tùy chọn                         | Content marker của Anthropic, cache-point block của Bedrock, request field của OpenAI hoặc không có explicit marker khi provider bỏ qua option |

Model call không thể chứa toàn bộ các nhánh này trong code của Agent Loop. Pi giữ loop độc lập với provider và giao các khác biệt cho model boundary.

## 2. Ba boundary, mỗi boundary có một trách nhiệm

Implementation lịch sử dùng global API registry và gọi các API file là translator. Pi `0.85.0` biểu diễn ownership rõ ràng hơn. Ứng dụng dựng `Models` collection từ provider factory. Mỗi `Provider` sở hữu model catalog, cơ chế auth và stream dispatch. API implementation sở hữu wire protocol cùng việc chuẩn hóa dữ liệu. Pseudocode: boundary map này mô tả architecture, không phải executable syntax.

```text
Agent Loop hoặc application
  -> Models collection: tìm model owner và áp dụng auth
  -> Provider: sở hữu catalog và chọn API implementation của model
  -> API implementation: chuyển request, đọc response, phát Pi event
  -> AssistantMessageEventStream: event chuẩn hóa và AssistantMessage cuối
```

Phép so sánh với công ty phiên dịch vẫn hữu ích khi giới hạn của nó được nêu rõ. `Models` là bộ phận điều phối, normalized event type là delivery contract, còn API implementation xử lý một wire dialect cụ thể. Provider còn sở hữu catalog và credential; một provider cũng có thể dispatch model đến nhiều API implementation.

### Boundary 1: `Models` collection

`createModels()` trả về một mutable collection rỗng. `models.setProvider(anthropicProvider())` thêm một provider; `builtinModels()` từ `@earendil-works/pi-ai/providers/all` thêm mọi built-in provider và là entry point nặng hơn theo chủ ý. Các phép đọc như `getProviders()`, `getModels()` và `getModel()` chạy đồng bộ trên catalog gần nhất. Dynamic provider refresh qua thao tác async tường minh `models.refresh()`.

Dispatch bắt đầu bằng `model.provider`, không phải `model.api`. Collection tìm provider đó, resolve auth, áp dụng `baseUrl` lấy từ auth nếu có, merge request option rồi gọi provider. Provider do `createProvider()` tạo tiếp tục chọn một API implementation duy nhất hoặc entry trong map có key bằng `model.api`.

Đoạn source không self-contained sau được lấy từ `packages/ai/src/models.ts` tại commit `107d79f11072bbc8a3a757ed7fd69596bee7d68c`. Đây là body chính xác của `ModelsImpl.streamSimple()` và nó phụ thuộc vào private method cùng type được import trong file đó.

```typescript
streamSimple(model: Model<Api>, context: Context, options?: ModelsSimpleStreamOptions): AssistantMessageEventStream {
  return lazyStream(model, async () => {
    const provider = this.requireProvider(model);
    const { requestModel, requestOptions } = await this.applyAuth(model, options);
    return provider.streamSimple(requestModel, context, requestOptions as SimpleStreamOptions);
  });
}
```

`lazyStream()` giải thích một chi tiết quan trọng của public surface: `Models.stream*()` trả event stream theo cách đồng bộ dù provider lookup, auth và lazy module loading có thể chạy async. Setup failure được chuyển thành cùng terminal error protocol dùng cho failure xảy ra sau khi HTTP request bắt đầu.

### Boundary 2: event protocol

Mọi chat API implementation đều phát cùng 12 variant của `AssistantMessageEvent`. Pseudocode: protocol sketch này dùng chính xác tên event và terminal reason:

```text
start
text_start       -> text_delta       -> text_end
thinking_start   -> thinking_delta   -> thinking_end
toolcall_start   -> toolcall_delta   -> toolcall_end
done  (reason: stop | length | toolUse | deferred)
error (reason: error | aborted)
```

Ba nhóm content khớp với discriminator chính xác của block trong Pi: `text`, `thinking` và `toolCall`. Event `start` mang assistant message `partial` ban đầu. Content event mang `contentIndex` và `partial` hiện tại; delta event còn có string fragment mới. `toolcall_end` mang `ToolCall` đã hoàn tất.

Terminal event có shape khác theo chủ ý. `done` mang `message`, còn `error` mang `error`; cả hai terminal variant đều không có `partial`. Vì vậy claim cũ rằng mọi event đều mang `partial` sẽ làm discriminated-union consumer không an toàn. `stream.result()` resolve thành terminal `AssistantMessage` trong cả hai trường hợp.

Provider có capability tương ứng có thể kết thúc submission phase bằng `done(reason: "deferred")`. `AssistantMessage` của event đó có `stopReason: "deferred"` cùng durable `deferred` handle chứa `provider`, `modelId`, `api`, `id` và dữ liệu tùy chọn về expiry, polling hoặc reconstruction. Hãy persist message hoặc toàn bộ handle nếu công việc phải sống qua lần process restart. Pseudocode: public collection flow là:

```text
streamSimple(..., { deferred: true })
  -> done(message.stopReason = deferred, message.deferred = DeferredHandle)
  -> persist message hoặc toàn bộ handle
  -> models.fetchDeferred(model, handle)
  -> một deferred message khác, hoặc AssistantMessage cuối
  -> models.cancelDeferred(model, handle) khi không còn cần kết quả
```

`ProviderStreams.fetchDeferred?()` và `cancelDeferred?()` là optional vì API implementation sở hữu capability này. `Models.fetchDeferred()` resolve qua `lazyStream()`: nếu provider không implement fetch, promise trả về normalized error `AssistantMessage`. `Models.cancelDeferred()` không có result stream, nên provider không hỗ trợ sẽ làm method reject bằng `ModelsError`. Caller thực hiện polling nên dùng `pollAfterMs` để lên lịch và không giả định handle còn hiệu lực sau `expiresAt` khi có các field đó.

Provider có thể xen kẽ update của nhiều block. UI có thể nhận `text_delta`, rồi `toolcall_start`, rồi một `text_delta` khác. Consumer phải dùng `contentIndex`, update block tương ứng từ `event.partial`, và không giả định mỗi chuỗi start/delta/end luôn liền mạch.

### Boundary 3: trách nhiệm của provider và API adapter

Provider và API implementation chia một model call thành năm giai đoạn. Pseudocode: sequence này tóm tắt các lần hand-off qua boundary:

```text
1. Models resolve provider auth và request header
2. Provider chọn API implementation cho model.api
3. API implementation chuyển Context, message, Tool và option
4. Provider SDK, HTTP stream, WebSocket hoặc Bedrock command trả frame
5. API implementation update AssistantMessage và phát done hoặc error
```

Giai đoạn 3 và 5 chứa phần lớn logic riêng theo provider. Request conversion chuẩn hóa content không được hỗ trợ hoặc đến từ provider khác trước khi tạo wire body. Response conversion dựng Pi block, parse partial Tool argument, ghi usage và diagnostic, ánh xạ raw stop reason, đồng thời giữ opaque continuity data như thinking signature và response ID trên normalized message type.

Path Anthropic cho thấy phép ánh xạ hai chiều. Pseudocode: source-derived map này dùng tên response, SSE và Pi event hiện tại nhưng lược bỏ chi tiết content state:

```text
HTTP response accepted; onResponse completes      -> start
message_start                                      -> responseId, model, initial usage and cost state
content_block_start(type: text)                    -> text_start
content_block_delta(type: text_delta)              -> text_delta
content_block_start(type: thinking)                -> thinking_start
content_block_delta(type: thinking_delta)          -> thinking_delta
content_block_start(type: tool_use)                -> toolcall_start
content_block_delta(type: input_json_delta)        -> toolcall_delta
content_block_stop                                 -> matching *_end
message_delta                                      -> stop reason, final usage and cost state
message_stop, then validated SSE exhaustion        -> done
```

Pi phát `start` trước khi bắt đầu iterate SSE body. `message_start` khởi tạo response metadata và usage; event này không phát Pi `start`. `message_delta` update normalized stop reason cùng usage state nhưng không phát `done`. Adapter chỉ phát `done` sau khi iteration đi qua một `message_stop` hợp lệ, body kết thúc và terminal stop reason vượt qua validation. Phép ánh xạ còn sanitize text, normalize Tool-call ID khi API yêu cầu và tính cost từ normalized usage. Đây là trách nhiệm của adapter; Agent Loop không nên cài lại chúng.

### Contract mà API implementation phải tuân theo

Đoạn source-faithful abridgement không self-contained sau chứa chính xác các stream member bắt buộc từ `packages/ai/src/types.ts` tại commit `107d79f11072bbc8a3a757ed7fd69596bee7d68c`. Type được import và các deferred method tùy chọn đã mô tả ở trên nằm ngoài excerpt này.

```typescript
export interface ProviderStreams {
  stream(
    model: Model<Api>,
    context: Context,
    options?: StreamOptions,
  ): AssistantMessageEventStream;
  streamSimple(
    model: Model<Api>,
    context: Context,
    options?: SimpleStreamOptions,
  ): AssistantMessageEventStream;
}

export type StreamFunction<
  TApi extends Api = Api,
  TOptions extends StreamOptions = StreamOptions,
> = (
  model: Model<TApi>,
  context: Context,
  options?: TOptions,
) => AssistantMessageEventStream;
```

Contract này dẫn đến ba hệ quả. Implementation nhận một `Model`, một `Context` không phụ thuộc provider và option type tương ứng. Return value khi thành công là `AssistantMessageEventStream`, bất kể transport bên dưới. Request, model và runtime failure xảy ra sau lần return đó phải nằm trong stream dưới dạng terminal `error` event; final message có `stopReason: "error"` hoặc `"aborted"` cùng `errorMessage`.

`Models.stream*()` còn gọi provider bên trong setup của `lazyStream()`. Wrapper này chuyển provider lookup, auth, lazy import và synchronous provider-call failure thành outer-stream error. Direct import từ `@earendil-works/pi-ai/api/*` nằm ở level thấp hơn: nó bỏ qua auth của `Models`, và một số implementation reject request credential bị thiếu theo cách đồng bộ trước khi trả stream. Ứng dụng cần normalized setup-error contract nên gọi qua `Models`.

Protocol boundary cho phép Anthropic, OpenAI, Google và Bedrock tuân theo cùng input/output và termination contract dù chúng dùng rất ít conversion code chung.

## 3. Từ một call thông thường đến provider mới

Public API hỗ trợ hai công việc khác nhau. Phần lớn ứng dụng ghép các provider factory đã có rồi gọi một model hiện hữu. Provider integration phải định nghĩa thêm catalog, auth và wire behavior.

### Kịch bản 1: gọi một model hiện có

Ví dụ này là application code self-contained cho `@earendil-works/pi-ai` `0.85.0`. Code dùng một provider factory có thể tree-shake và chỉ import public export.

```typescript
import { createModels, type Context } from "@earendil-works/pi-ai";
import { anthropicProvider } from "@earendil-works/pi-ai/providers/anthropic";

const models = createModels();
models.setProvider(anthropicProvider());

const model = models.getModel("anthropic", "claude-sonnet-4-5");
if (!model) throw new Error("Configured Anthropic model was not found");

const context: Context = {
  systemPrompt:
    "Answer from the supplied conversation and identify uncertainty.",
  messages: [
    {
      role: "user",
      content:
        "Explain why SSE consumers buffer incomplete JSON tool arguments.",
      timestamp: Date.now(),
    },
  ],
  tools: [],
};

const stream = models.streamSimple(model, context, {
  reasoning: "medium",
  cacheRetention: "short",
});

for await (const event of stream) {
  if (event.type === "text_delta") process.stdout.write(event.delta);
}

const response = await stream.result();
if (response.stopReason === "error" || response.stopReason === "aborted") {
  console.error(response.errorMessage);
}
```

Dùng `streamSimple()` khi `SimpleStreamOptions` đã bao quát request: reasoning không phụ thuộc provider, Tool choice, cache retention, sampling, timeout, retry, abort, header, callback và các shared setting liên quan. `completeSimple()` chờ cùng final message nhưng không expose incremental event.

Dùng `stream()` hoặc `complete()` khi cần API-specific option. Model lấy từ `getModel()` có type `Model<Api>`; hãy narrow bằng `hasApi(model, "anthropic-messages")` hoặc API ID chính xác khác trước khi truyền option như `thinkingBudgetTokens` của Anthropic. Boundary tường minh này giữ provider-specific parameter tại đúng chỗ và vẫn cho TypeScript kiểm tra request.

### Authentication và model configuration

Mỗi provider factory tự định nghĩa cách resolve credential. Built-in Anthropic kiểm tra stored credential rồi đến các ambient variable được hỗ trợ, gồm `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_OAUTH_TOKEN` và `ANTHROPIC_API_KEY`; factory khác sở hữu rule tương ứng của nó. `createModels()` dùng in-memory credential store trừ khi ứng dụng inject một `CredentialStore` có persistence.

Pi merge request theo thứ tự chính xác sau. Pseudocode: các mũi tên tóm tắt độ ưu tiên field, không phải executable assignment:

```text
stored credential hoặc provider ambient auth
  -> model.headers
  -> options.apiKey và options.headers được truyền tường minh
  -> Models-only transformHeaders callback
  -> Provider.stream() hoặc Provider.streamSimple()
```

`apiKey` truyền riêng cho request có độ ưu tiên cao nhất. Stored credential sở hữu provider của nó, nên một lần refresh stored OAuth thất bại sẽ không âm thầm fallback sang environment key. `models.getAuth()` có thể kiểm tra resolution mà không mở request; khi được gọi trực tiếp, lỗi credential storage hoặc OAuth refresh sẽ reject bằng `ModelsError`. Path `Models.stream*()` bắt các setup failure đó trong `lazyStream()` rồi phát normalized error result.

`getModel(provider, id)` là catalog lookup đồng bộ và trả `undefined` nếu hiện không có registered provider nào expose ID đó. Hàm không fetch catalog và cũng không chứng minh auth đã được cấu hình. `getAvailable()` áp dụng auth check, còn dynamic provider update last-known model list qua `refresh()`.

Một `Model` ghi cả hai routing key. `provider` đặt tên collection owner; `api` đặt tên wire implementation của provider. Record còn mang `id`, `name`, `baseUrl`, input capability, reasoning support, token limit, cost rate, compatibility flag, header tùy chọn và `thinkingLevelMap` riêng của model. Với custom model, hãy giữ `provider` trùng ID truyền vào `createProvider()` và đặt endpoint trên model khi API implementation được tái sử dụng đọc `model.baseUrl`.

### Kịch bản 2: thêm provider hoặc wire protocol mới

Với endpoint tương thích OpenAI, hãy dùng lại lazy API implementation hiện có và chỉ định nghĩa phần thuộc provider. Ví dụ construction self-contained này compile với public export của `0.85.0`; code tạo provider cùng catalog nhưng không gửi network request.

```typescript
import {
  createModels,
  createProvider,
  type Model,
} from "@earendil-works/pi-ai";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";

const localModel: Model<"openai-completions"> = {
  id: "llama-3.1-8b",
  name: "Llama 3.1 8B (local)",
  api: "openai-completions",
  provider: "local-openai",
  baseUrl: "http://localhost:11434/v1",
  reasoning: false,
  input: ["text"],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 128000,
  maxTokens: 32000,
};

const localProvider = createProvider({
  id: "local-openai",
  name: "Local OpenAI-compatible server",
  auth: {
    apiKey: {
      name: "Local server",
      resolve: async () => ({
        auth: { apiKey: "local-placeholder" },
        source: "non-secret local placeholder",
      }),
    },
  },
  models: [localModel],
  api: openAICompletionsApi(),
});

const models = createModels();
models.setProvider(localProvider);

const configured = models.getModel("local-openai", "llama-3.1-8b");
if (!configured) throw new Error("Local model registration failed");
console.log(configured.name);
```

Mọi provider đều khai báo auth semantics. `openAICompletionsApi()` còn validate rằng request đã resolve có API key hoặc authorization header trước khi dựng OpenAI client, kể cả với local URL. Vì vậy ví dụ truyền giá trị không bí mật `local-placeholder`; hãy cấu hình local endpoint để chấp nhận hoặc bỏ qua bearer value đó. Adapter chỉ dùng placeholder này để vượt qua credential guard, và giá trị không cấp quyền truy cập. Keyed proxy có thể dùng public helper `envApiKeyAuth()` thay thế. Mixed provider truyền một map từ giá trị `model.api` đến `ProviderStreams`; `createProvider()` dispatch mỗi model qua entry tương ứng và tạo stream error nếu không có entry.

Wire protocol hoàn toàn mới đòi hỏi nhiều việc hơn đăng ký model. Pseudocode: integration sequence này không chứa exported helper call.

```text
định nghĩa API ID và typed option
  -> implement ProviderStreams.stream và streamSimple
  -> chuyển Context, message, Tool và option thành wire request
  -> chuyển mọi response path thành normalized Pi event
  -> bọc implementation bằng lazy loading khi SDK load tốn kém
  -> createProvider({ id, auth, models, api })
  -> models.setProvider(provider)
  -> test streaming, usage, abort, empty output, overflow, Tool và replay
```

Một contribution vào upstream Pi đặt API implementation trong `packages/ai/src/api/`, provider factory trong `packages/ai/src/providers/`, còn stable catalog nằm cạnh factory. Application code cũng có thể implement public contract `ProviderStreams` tại chỗ. Trong cả hai trường hợp, việc thêm provider không được buộc Agent Loop, session storage hoặc Tool execution thay đổi; các layer đó tiếp tục dùng normalized message và event.

Path `registerApiProvider()` cũ thuộc `@earendil-works/pi-ai/compat`. Nó hỗ trợ migration cho code viết theo global registry, nhưng integration mới nên dựng provider bằng `createProvider()`, thêm provider vào `Models` collection và gọi qua collection đó.

## 4. Bên trong API adapter: streaming và reasoning dialect

Public protocol che giấu khác biệt transport, nhưng adapter author vẫn phải xử lý rõ từng trường hợp. Code hiện tại không ép mọi provider đi qua cùng một SDK hoặc transport.

Người đọc chỉ gọi built-in provider có thể xem phần này như implementation reference. Provider và adapter author cần chi tiết về event family cùng reasoning để giữ đúng public contract của Pi.

### Streaming dialect

Pseudocode: data-flow sketch này dùng tên chính xác của event hoặc chunk family trong upstream hiện tại và lược bỏ provider request field.

```text
Anthropic HTTP body -> iterateSseMessages() -> content_block_* / message_delta -> Pi events
OpenAI SDK          -> AsyncIterable<ChatCompletionChunk> -> choices[0].delta -> Pi events
Google SDK          -> generateContentStream() -> GenerateContentResponse parts -> Pi events
Bedrock SDK         -> ConverseStreamCommand output events -> Pi events
```

Anthropic adapter import official SDK để dựng request và auth header, sau đó tự lặp qua SSE frame trong response body. Adapter validate event name đã biết, parse từng record `data` và ánh xạ event start, delta, stop của content block. OpenAI Chat Completions dùng structured chunk của SDK rồi tích lũy `choices[0].delta.content`, reasoning field và Tool-call fragment có index. Google lặp qua structured response part; function call không stream argument fragment theo cùng cơ chế, nên adapter phát một `toolcall_delta` hoàn chỉnh rồi đến `toolcall_end`.

Các khác biệt đó ảnh hưởng cả failure và finalization path. Adapter phải đóng content block còn dang dở, xóa streaming scratch field như partial Tool JSON, giữ partial content khi abort và chỉ phát một terminal event. Adapter cũng phải ghi provider usage dù dữ liệu đó có thể đến lúc bắt đầu, trong final metadata chunk hoặc trong một SDK field riêng.

Sau khi SDK parse transport byte, provider event shape và semantics vẫn khác nhau. Pi chuẩn hóa application-facing protocol, còn từng adapter xử lý upstream protocol thật sự của nó.

### Reasoning level và phép chuyển đổi theo provider

Shared option `reasoning` diễn tả semantics. API implementation chuyển option đó sang control riêng. Pseudocode: các adapter output đại diện sau lược bỏ phần còn lại của từng request object.

```typescript
anthropicAdaptive.output_config = { effort: "high" };
anthropicBudget.thinking = { type: "enabled", budget_tokens: 16384 };
openAIResponses.reasoning = { effort: "high" };
googleThinking.thinkingConfig = {
  includeThoughts: true,
  thinkingLevel: "HIGH",
};
```

Pi 0.85.0 export hai type riêng cho Google từ package root không có side effect; kiểu chữ của chúng đánh dấu hai ranh giới semantics khác nhau. `GoogleApiThinkingLevel` là union kiểu enum hướng API `"THINKING_LEVEL_UNSPECIFIED" | "MINIMAL" | "LOW" | "MEDIUM" | "HIGH"`; type này dùng cho `GoogleOptions.thinking.level` và `GoogleVertexOptions.thinking.level`. `ResolvedGoogleThinkingLevel` là union đã chuẩn hóa trong adapter `"minimal" | "low" | "medium" | "high"`, được tạo sau khi Pi resolve `ModelThinkingLevel` mang semantics của model. Type này chủ động loại `off`, `xhigh` và `max` vì bước resolution ánh xạ hoặc từ chối chúng trước khi dựng request.

```typescript
import type {
  GoogleApiThinkingLevel,
  GoogleOptions,
  ResolvedGoogleThinkingLevel,
} from "@earendil-works/pi-ai";

const requestLevel: GoogleApiThinkingLevel = "HIGH";
const googleOptions = {
  thinking: { enabled: true, level: requestLevel },
} satisfies GoogleOptions;

const adapterLevel: ResolvedGoogleThinkingLevel = "high";
void [googleOptions, adapterLevel];
```

`supportsMidConvoEffort` thuộc `AnthropicMessagesCompat` và mặc định là `false`. Với model tích hợp sẵn trong generated catalog của Pi 0.85.0, automatic detection chuyển `modelId` thành chữ thường trước, sau đó bỏ một prefix tùy chọn khớp `^~?anthropic/` (`anthropic/` hoặc `~anthropic/`). Pi chỉ tự động bật cờ khi `provider` chính xác là `anthropic` hoặc `openrouter`. ID đã chuẩn hóa phải khớp chính xác `^claude-opus-5(?:-\d{8})?$` hoặc `^claude-(?:fable|mythos)-5(?:[.-]1)(?:-\d{8})?$`. Đúng model được hỗ trợ vẫn phải chạy trên transport Anthropic Messages trung thực; điều này không có nghĩa mọi provider tương thích Anthropic hoặc API chỉ bắt chước hình dạng Messages đều được hỗ trợ.

Các biến thể ID đã chuẩn hóa được chấp nhận gồm `claude-opus-5`, có thể kèm `-YYYYMMDD`; `claude-fable-5.1` hoặc `claude-fable-5-1`, mỗi ID có thể kèm ngày; và `claude-mythos-5.1` hoặc `claude-mythos-5-1`, mỗi ID có thể kèm ngày.

Với custom `Model` dùng `anthropic-messages`, hãy dùng cấu hình `compat.supportsMidConvoEffort: true` chỉ sau khi xác minh transport Anthropic Messages là trung thực và model thuộc đúng Claude family tương thích nói trên. Provider name nằm ngoài allowlist của generated catalog không tự nó cấm manual configuration; không bao giờ khái quát ngoại lệ này sang provider hoặc model tương thích Anthropic tùy ý.

Khi cờ này được bật, Pi lưu effort native của từng response và khôi phục các effort-only system messages trong request về sau. Pi cũng gửi thinking binding control `prefix_mismatch_behavior: "drop_block"`, nhờ đó prefix mismatch sẽ loại an toàn signed thinking block cũ thay vì gây lỗi 400 lặp lại.

`vllmPriority` thuộc `OpenAICompletionsCompat`. Giá trị thấp hơn được xử lý sớm hơn, nhưng field này chỉ có ý nghĩa khi vLLM chạy với `--scheduling-policy priority`; mặc định của server là `0`. Tính năng tắt theo mặc định và không được đặt trong generated model catalog, vì vậy chỉ thêm nó vào metadata của model cho endpoint đã cấu hình scheduler đó.

`supportsMaxOutputTokens` lại thuộc `OpenAIResponsesCompat` và mặc định là `true`. Hãy đặt thành `false` cho gateway tương thích Responses nhưng từ chối `max_output_tokens`; khi đó Pi bỏ request field này. Đây không phải compatibility switch của Chat Completions.

Model Anthropic có adaptive thinking dùng effort; model cũ có reasoning capability dùng token budget. OpenAI API dùng reasoning-effort field với API-specific option name. Tùy họ model, Gemini dùng thinking level rời rạc hoặc token budget. Bedrock đi theo model family được chọn và có thể mang Anthropic reasoning content trong Converse block. `streamSimple()` sở hữu các phép ánh xạ này, còn `stream()` expose full option của từng API sau khi model được narrow.

Pi hiện có bảy model capability level, không còn là thang năm cấp trong tài liệu cũ. Pseudocode: ladder này ghép standard token budget với các level có budget đó:

```text
off -> minimal -> low -> medium -> high -> xhigh -> max
       1,024     2,048   8,192    16,384   provider-specific
```

`SimpleStreamOptions.reasoning` nhận từ `minimal` đến `max`; option này không nhận `off`. Hãy bỏ `reasoning` khi không yêu cầu reasoning. `ModelThinkingLevel` thêm `off` cho capability map và adapter logic.

Token budget chuẩn đến `high` lần lượt là 1.024, 2.048, 8.192 và 16.384, trừ khi caller truyền `thinkingBudgets`. `xhigh` và `max` là model level opt-in, cần entry khác `null` trong `thinkingLevelMap`. `getSupportedThinkingLevels()` báo các level của model cụ thể. Nếu level được yêu cầu không khả dụng, `clampThinkingLevel()` tìm lên trước rồi mới tìm xuống. Simple adapter còn chừa token cho câu trả lời và clamp output theo context window của model; payload chính xác vẫn thuộc API implementation.

## 5. Cache control, error, retry và cancellation

Semantic boundary tương tự cũng áp dụng cho performance và failure behavior. Shared option diễn tả ý định của caller, còn adapter chỉ implement cơ chế mà API của nó hỗ trợ.

### Cache control đi theo semantics của provider

Các turn của Agent thường gửi lại một conversation prefix ngày càng dài. Prompt caching có thể tránh tính lại provider-visible prefix không đổi, nhưng mỗi provider expose control khác nhau. Pi cung cấp một preference có source declaration chính xác như sau:

```typescript
export type CacheRetention = "none" | "short" | "long";
```

Declaration source-faithful này nằm trong `packages/ai/src/types.ts` tại commit `107d79f11072bbc8a3a757ed7fd69596bee7d68c`. Resolution có ba bước: option `cacheRetention` tường minh có độ ưu tiên cao nhất; nếu thiếu option, compatibility override `PI_CACHE_RETENTION=long` chọn `long`; nếu cả hai đều thiếu, adapter dùng `short`. Giá trị provider-scoped trong `options.env` có độ ưu tiên cao hơn `process.env`. Preference `long` sau khi resolve chỉ được giữ khi model và API compatibility metadata hỗ trợ.

| Adapter family                     | `none`                                                                      | `short`                                                                                                                                             | `long` và vị trí                                                                                                                 |
| ---------------------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Anthropic Messages                 | Không có `cache_control`                                                    | `cache_control: { type: "ephemeral" }`                                                                                                              | Thêm `ttl: "1h"` cho model hỗ trợ long retention; đánh dấu system prompt, Tool definition cuối và user block phù hợp cuối cùng   |
| Bedrock Converse                   | Không có explicit `cachePoint`                                              | Chỉ chèn `cachePoint: { type: DEFAULT }` cho cấu hình Claude được hỗ trợ hoặc có force-cache, và khi converted message cuối là user message phù hợp | Thêm `ttl: ONE_HOUR`; cache point nằm sau system block và converted user message phù hợp cuối đó                                 |
| OpenAI Responses                   | Bỏ prompt cache key và có thể yêu cầu explicit no-cache mode nếu API hỗ trợ | Dùng `sessionId` đã clamp làm `prompt_cache_key` khi có                                                                                             | Thêm `prompt_cache_retention: "24h"` nếu compatibility metadata cho phép                                                         |
| OpenAI-compatible Chat Completions | Bỏ `prompt_cache_key` và marker kiểu Anthropic                              | Dùng `sessionId` đã truyền làm `prompt_cache_key` trên OpenAI; endpoint tương thích có thể dùng marker Anthropic                                    | Thêm `prompt_cache_retention: "24h"` khi được hỗ trợ, hoặc `ttl: "1h"` trong Anthropic-marker mode; vị trí marker theo hàng trên |

Bảng này mô tả adapter behavior, không bảo đảm provider sẽ trả cache hit. Hit phụ thuộc serialized prefix mà provider nhìn thấy cùng eligibility rule của service. Việc dựng lại object `Context` trong JavaScript tự nó không phá content-prefix cache. Thay system prompt, Tool definition, converted message block, compatibility mode hoặc session key có thể làm dữ liệu provider nhận được thay đổi.

Tỷ lệ giá cố định và ước tính tiết kiệm trong baseline không thuộc API contract của Pi nên không được giữ. Usage hiện tại ghi `cacheRead`, `cacheWrite` và cost được tính từ catalog rate của từng model; ứng dụng có thể đo mức tiết kiệm thật từ các field đó.

### Error, retry boundary, abort và overflow

Đoạn source không self-contained sau được lấy từ `packages/ai/src/api/lazy.ts` tại commit `107d79f11072bbc8a3a757ed7fd69596bee7d68c`. Nó cho thấy setup-error path chính xác; `setup`, `forwardStream`, `createSetupErrorMessage` và `outer` được định nghĩa trong function bao quanh.

```typescript
setup()
  .then((inner) => forwardStream(outer, inner))
  .catch((error) => {
    const message = createSetupErrorMessage(model, error);
    outer.push({ type: "error", reason: "error", error: message });
    outer.end(message);
  });
```

Sau khi adapter stream bắt đầu, API implementation dùng cùng outcome cho request failure. Chúng giữ partial `AssistantMessage`, đặt `stopReason` thành `"aborted"` nếu signal đã abort hoặc `"error"` trong trường hợp còn lại, gắn `errorMessage`, phát `error` rồi kết thúc stream. Trên path thông thường qua `Models`, `stream.result()` resolve thành một outcome có thể persist và provider-specific SDK exception dừng bên trong boundary. Model không tồn tại vẫn là lookup concern vì `getModel()` đã trả `undefined` trước khi streaming bắt đầu.

Cancellation truyền qua `options.signal`. Nó ngắt HTTP hoặc SDK work được hỗ trợ cùng retry backoff; final message có thể chứa text, thinking, Tool fragment, usage và cost đã tích lũy trước lúc hủy. Caller có thể lưu aborted message đó rồi tự quyết định request sau có nên tiếp tục từ nó hay không.

`maxRetries` điều khiển adapter-level retry tại những nơi được hỗ trợ. Ở commit này, shared retry helper của OpenAI/Anthropic mặc định không retry; helper tôn trọng `x-should-retry`, retry status `408`, `409`, `429` và `5xx`, đọc server retry-delay header rồi dùng abortable exponential backoff. Server-requested delay vượt `maxRetryDelayMs` sẽ fail ngay; cap mặc định là 60 giây, còn giá trị zero tắt cap. `timeoutMs` chỉ được chuyển cho provider hoặc SDK có hỗ trợ. Các option này không hứa hẹn transport behavior giống hệt nhau ở mọi adapter.

Request-level retry này tách biệt với Agent policy ở layer cao hơn. `Models` không tự retry một assistant error đã hoàn tất sau khi stream settle. Host như Coding Agent có thể phân loại normalized error, lên lịch model call khác, báo progress hoặc dừng theo retry budget của chính nó.

Context overflow cũng cần normalized test. Hàm export `isContextOverflow()` kiểm tra error-message pattern theo provider, response thành công có input usage vượt context window được truyền vào, và kết quả `length` có output bằng zero trong khi input lấp ít nhất 99% context window. Hai phép kiểm tra sau bao quát service truncate hoặc nhận input quá lớn mà không trả error thông thường. Custom provider vẫn có thể cần pattern hoặc host-side check bổ sung.

`onPayload` có thể inspect hoặc thay provider payload. `onResponse` nhận response status cùng raw response header đã được copy vào string record; Pi không redact các value đó trước. Cả hai hook chạy trong request path, nên lỗi do hook ném ra trở thành stream error. Hãy coi input của callback là dữ liệu nhạy cảm: chỉ allowlist field cần log hoặc persist, đồng thời redact credential, cookie, request token, prompt và private Tool data thay vì giả định có thể ghi lại toàn bộ input.

## 6. Điều gì xảy ra sau model call một dòng

Toàn bộ route hiện có thể được đọc mà không cần global registry đã retired. Pseudocode: sequence cuối tóm tắt dispatch path và normalization path hiện tại:

```text
models.streamSimple(model, context, sharedOptions)
  -> Models locates model.provider
  -> Models resolves auth and final request headers
  -> Provider selects ProviderStreams for model.api
  -> streamSimple translates reasoning and shared options
  -> API adapter converts Context and sends the provider request
  -> adapter normalizes streaming blocks, usage, stop reasons, and errors
  -> AssistantMessageEventStream exposes events and result()
  -> Agent Loop consumes only Pi messages and Pi event types
```

Collection và provider layer quyết định công việc đi đâu. API adapter quyết định provider data trở thành Pi data thế nào. Event stream định nghĩa những gì caller có thể dựa vào.

### Tóm tắt thiết kế

Ba lựa chọn thiết kế có thể áp dụng ngoài Pi.

1. Định nghĩa protocol tại boundary thường thay đổi. `ProviderStreams`, `StreamFunction` và `AssistantMessageEvent` ràng buộc input, output cùng termination mà không ép các provider có implementation khác hẳn nhau phải dùng chung base class.
2. Đặt routing và configuration trong object có owner rõ ràng. `Models` collection làm rõ provider registration, catalog read, credential và dispatch; provider factory giữ SDK import cùng auth policy trong phạm vi cục bộ.
3. Chuẩn hóa ý định của caller và giữ mechanism trong adapter. Reasoning level và cache retention vẫn là các concept ổn định dù request field, limit và eligibility rule khác nhau.

Compatibility API có thể giữ call shape cũ trong giai đoạn migration, nhưng không nên định nghĩa architecture mới. Code mới nên resolve model và stream qua cùng một `Models` collection.

## 7. Trạm tiếp theo

Model boundary trả về normalized `ToolCall` block nhưng không thực thi chúng. Chương tiếp theo theo dõi một Tool call qua schema validation, scheduling, safety hook, execution, progress và `ToolResultMessage` được gửi lại cho model.

Source review của chương này được ghim tại Pi `0.85.0`, commit `107d79f11072bbc8a3a757ed7fd69596bee7d68c`. Các file chính gồm `packages/ai/src/models.ts`, `types.ts`, `api/lazy.ts`, `api/simple-options.ts`, API implementation cho Anthropic/OpenAI/Google/Bedrock, `utils/event-stream.ts`, `utils/provider-retry.ts`, `utils/overflow.ts` và các provider factory trong `packages/ai/src/providers/`.

[Chương 5: Hệ thống Tool](ch05-tool-system.md)
