---
title: Test Pi Agent theo cách deterministic
description: Dựng test faux-provider offline để chứng minh contract của request, Tool, transcript, cancellation và queue exhaustion.
translation_key: how-to-test-agent-deterministically
language: vi
source_url: "https://docs.pify.dev/vi/how-to/test-agent-deterministically"
official_refs:
  - "https://github.com/earendil-works/pi/blob/4e58f324fae8ebfa98a3d45181fb248072a2afac/packages/ai/src/providers/faux.ts"
  - "https://github.com/earendil-works/pi/blob/4e58f324fae8ebfa98a3d45181fb248072a2afac/packages/agent/src/agent.ts"
  - "https://github.com/earendil-works/pi/blob/4e58f324fae8ebfa98a3d45181fb248072a2afac/packages/agent/src/agent-loop.ts"
  - "https://github.com/earendil-works/pi/blob/4e58f324fae8ebfa98a3d45181fb248072a2afac/packages/agent/test/e2e.test.ts"
terms_used:
  - test double
  - fixture
  - harness
  - Agent Loop
  - Tool
  - ToolCall
  - ToolResultMessage
status: reviewed
reviewed_by: Pify maintainers
last_updated: '2026-08-25'
translator: Pify maintainers
---

Hướng dẫn này dựng một test deterministic quanh faux provider công khai của Pi. Test chạy `Agent` thật và `AgentTool` thật, nhưng thay model bên ngoài bằng một hàng đợi hữu hạn gồm các assistant response cục bộ. Vì vậy, test không cần API key, không tạo network request và cung cấp bằng chứng chính xác khi Agent Loop, Tool contract hoặc transcript thay đổi.

## Kết quả

Sau khi hoàn thành, một Node.js test độc lập sẽ chứng minh ba hành vi:

1. provider request dẫn đến một calculator `ToolCall`, `ToolResultMessage` liên kết với nó và assistant answer cuối;
2. `AbortController` do host sở hữu hủy một Agent run đang hoạt động và tạo `stopReason: "aborted"`;
3. hàng đợi faux response đã cạn được kết thúc thành assistant error result thay vì treo hoặc tạo request thật.

Test còn ghi lại lifecycle event, kiểm tra cả hai provider request, xác minh chính xác Tool argument, rồi xóa provider và các model của nó trong `finally`.

## Điều kiện tiên quyết và phiên bản package chính xác

Dùng Node.js `22.19.0` hoặc bản Node 22 mới hơn, ESM và các package Pi `0.84.3` đã phát hành:

```bash
npm install --save-dev @earendil-works/pi-ai@0.84.3 @earendil-works/pi-agent-core@0.84.3 tsx typescript @types/node
```

Lưu toàn bộ ví dụ bên dưới thành `deterministic-agent.test.ts`, rồi chạy:

```bash
node --import tsx --test deterministic-agent.test.ts
```

Các phiên bản package được khóa chính xác có chủ đích. Tên helper và hành vi trong trang này đã được kiểm chứng với Pi tag `v0.84.3`, commit `4e58f324fae8ebfa98a3d45181fb248072a2afac`.

## 1. Tạo Models collection cô lập và faux provider

`createModels()` tạo một registry do test này sở hữu thay vì sửa default dùng chung cho toàn process. `fauxProvider()` cung cấp provider definition và một model cục bộ. Đăng ký provider bằng `models.setProvider()`, resolve model qua `models.getModel()`, rồi truyền `models.streamSimple.bind(models)` vào `Agent`.

Provider ID và model ID là identifier của fixture; chúng không cần tồn tại bên ngoài test. `fauxProvider()` tiêu thụ response trong memory theo thứ tự request bắt đầu. Nó không bao giờ đọc credential của provider và cũng không tự chuyển sang provider khác khi hàng đợi đã cạn.

Các chunk cố định hai token tương đương xấp xỉ tám ký tự trong faux implementation của Pi: `tokenSize` đếm đơn vị token và faux mở rộng mỗi đơn vị thành bốn ký tự. Cùng với `tokensPerSecond: 1_000`, cấu hình này tạo một streaming window quan sát được cho cancellation mà không làm test chậm. Assertion vẫn nhắm đến message đã reconstruct và lifecycle boundary, không nhắm đến số lượng chunk.

## 2. Định nghĩa calculator Tool deterministic

Calculator dùng public contract `AgentTool` của Pi và parameter schema TypeBox. Method `execute()` ghi lại `toolCallId` cùng argument đã được validate trước khi trả về một block `fauxText()`. Bản ghi đó chứng minh argument nào thực sự đến Tool; nếu chỉ assert câu trả lời cuối, test có thể bỏ sót call sai cấu trúc hoặc một đáp án bị hard-code.

Hãy giữ Tool deterministic không phụ thuộc clock, giá trị random, file dùng chung hay ambient environment state. Nếu Tool production cần các dependency đó, hãy inject implementation cục bộ vào fixture và assert riêng tại boundary của nó.

## 3. Xếp hàng một Tool call rồi đến final answer

`faux.setResponses()` thay thế hàng đợi đang chờ. Response factory đầu tiên nhận đúng `Context` của provider, ghi data-only snapshot và trả về `fauxAssistantMessage()` gồm phần giải thích cùng `fauxToolCall()`. `stopReason` của nó là `"toolUse"`, nên Agent Loop thực thi Tool rồi tiếp tục.

Factory thứ hai nhận request kế tiếp; request này phải chứa sẵn user message, assistant Tool call và Tool result. Factory trả về final text response. Hai factory tốt hơn một fixture không quan sát được vì mỗi factory có thể kiểm tra đúng context tại protocol boundary tương ứng.

## 4. Chạy Agent và ghi event cùng transcript

Hãy subscribe trước `prompt()`. Ví dụ ghi loại event thay vì nội dung từng stream chunk: thứ tự semantic là phần quan trọng, còn kích thước token chunk của faux provider không thuộc Agent contract. Sau khi run kết thúc, `agent.state.messages` là transcript hoàn chỉnh mà host nhìn thấy.

Provider request snapshot chỉ chứa message, role và tên Tool. Không `structuredClone()` toàn bộ `Context`: Tool definition trong đó có function thực thi nên không thể structured-clone.

## 5. Assert toàn bộ round-trip contract

Các assertion quan trọng đi xuyên qua nhiều boundary thay vì chỉ kiểm tra một layer:

- provider call count chính xác là hai và hàng đợi response đã rỗng;
- request đầu chứa user và quảng bá `add`;
- request thứ hai có các role `user`, `assistant`, `toolResult`;
- Tool nhận `{ left: 20, right: 22 }` cho call `sum-1`;
- Tool result liên kết ngược qua cả `toolCallId: "sum-1"` và `toolName: "add"`;
- thứ tự transcript là `user`, `assistant`, `toolResult`, `assistant`;
- nội dung cuối là `The total is 42.` với `stopReason: "stop"`;
- Tool execution bắt đầu trước khi kết thúc, còn Agent run được bao bởi `agent_start` và `agent_end`.

Các assertion này giúp định vị regression. Tool argument sai không bị báo chung chung thành lỗi câu trả lời, và final string đúng không thể che một result link bị hỏng.

## Test hoàn chỉnh đã được compile-check

Function bên dưới được compile trong repository tài liệu này với đúng public dependency `0.84.3`. Code cũng hoàn toàn giống bản tiếng Anh.

```typescript title="deterministic-agent.test.ts"
import assert from "node:assert/strict";
import test from "node:test";

import {
  createModels,
  fauxAssistantMessage,
  fauxProvider,
  fauxText,
  fauxToolCall,
  Type,
  type Context,
} from "@earendil-works/pi-ai";
import {
  Agent,
  type AgentEvent,
  type AgentTool,
} from "@earendil-works/pi-agent-core";

export async function verifyDeterministicAgentTestingGuide(): Promise<void> {
  const requests: Array<{
    roles: Array<Context["messages"][number]["role"]>;
    messages: Context["messages"];
    toolNames: string[];
  }> = [];
  const executedCalls: Array<{
    toolCallId: string;
    args: { left: number; right: number };
  }> = [];
  const eventTypes: Array<AgentEvent["type"]> = [];
  const agents: Agent[] = [];
  const models = createModels();
  const faux = fauxProvider({
    provider: "deterministic-guide-faux",
    models: [{ id: "calculator-model", reasoning: false }],
    tokenSize: { min: 2, max: 2 },
    tokensPerSecond: 1_000,
  });
  models.setProvider(faux.provider);

  const parameters = Type.Object({
    left: Type.Number(),
    right: Type.Number(),
  });
  const calculator: AgentTool<typeof parameters, { total: number }> = {
    name: "add",
    label: "Add two numbers",
    description: "Return left + right",
    parameters,
    async execute(toolCallId, args) {
      executedCalls.push({ toolCallId, args: { ...args } });
      const total = args.left + args.right;
      return { content: [fauxText(String(total))], details: { total } };
    },
  };

  const model = models.getModel("deterministic-guide-faux", "calculator-model");
  assert.ok(model, "the isolated Models collection must expose the faux model");

  const createAgent = () => {
    const agent = new Agent({
      streamFn: models.streamSimple.bind(models),
      initialState: {
        systemPrompt: "Use the add Tool for arithmetic.",
        model,
        thinkingLevel: "off",
        tools: [calculator],
      },
    });
    agents.push(agent);
    return agent;
  };

  const WATCHDOG_MS = 2_000;
  const awaitWithFailureWatchdog = async <T>(
    operation: Promise<T>,
    label: string,
    onTimeout: () => void,
  ): Promise<T> => {
    let watchdog: ReturnType<typeof setTimeout> | undefined;
    const timeoutFailure = new Promise<never>((_, reject) => {
      watchdog = setTimeout(() => {
        const message = `${label} did not settle within ${WATCHDOG_MS} ms`;
        try {
          onTimeout();
        } catch (cause) {
          reject(new Error(`${message}; timeout cleanup failed`, { cause }));
          return;
        }
        reject(new Error(message));
      }, WATCHDOG_MS);
    });

    try {
      return await Promise.race([operation, timeoutFailure]);
    } finally {
      if (watchdog !== undefined) clearTimeout(watchdog);
    }
  };

  let unsubscribe: (() => void) | undefined;
  try {
    const agent = createAgent();
    unsubscribe = agent.subscribe((event) => {
      eventTypes.push(event.type);
    });
    const captureRequest = (context: Context) => {
      requests.push({
        roles: context.messages.map((message) => message.role),
        messages: structuredClone(context.messages),
        toolNames: context.tools?.map((tool) => tool.name) ?? [],
      });
    };

    faux.setResponses([
      (context) => {
        captureRequest(context);
        return fauxAssistantMessage(
          [
            fauxText("I will call the add Tool."),
            fauxToolCall("add", { left: 20, right: 22 }, { id: "sum-1" }),
          ],
          { stopReason: "toolUse" },
        );
      },
      (context) => {
        captureRequest(context);
        return fauxAssistantMessage(fauxText("The total is 42."));
      },
    ]);

    await awaitWithFailureWatchdog(
      agent.prompt("What is 20 + 22?"),
      "calculator Agent run",
      () => agent.abort(),
    );

    assert.equal(faux.state.callCount, 2);
    assert.equal(faux.getPendingResponseCount(), 0);
    assert.deepEqual(requests[0]?.roles, ["user"]);
    assert.deepEqual(requests[0]?.toolNames, ["add"]);
    assert.deepEqual(requests[1]?.roles, ["user", "assistant", "toolResult"]);
    assert.deepEqual(executedCalls, [
      { toolCallId: "sum-1", args: { left: 20, right: 22 } },
    ]);

    const requestToolResult = requests[1]?.messages[2];
    assert.equal(requestToolResult?.role, "toolResult");
    if (requestToolResult?.role !== "toolResult") {
      throw new Error("the second provider request must contain a Tool result");
    }
    assert.equal(requestToolResult.toolCallId, "sum-1");
    assert.equal(requestToolResult.toolName, "add");
    assert.equal(requestToolResult.isError, false);
    assert.deepEqual(requestToolResult.content, [fauxText("42")]);

    assert.deepEqual(
      agent.state.messages.map((message) => message.role),
      ["user", "assistant", "toolResult", "assistant"],
    );
    const finalMessage = agent.state.messages.at(-1);
    assert.equal(finalMessage?.role, "assistant");
    if (finalMessage?.role !== "assistant") {
      throw new Error("the transcript must end with an assistant message");
    }
    assert.equal(finalMessage.stopReason, "stop");
    assert.deepEqual(finalMessage.content, [fauxText("The total is 42.")]);
    const toolStartIndex = eventTypes.indexOf("tool_execution_start");
    const toolEndIndex = eventTypes.indexOf("tool_execution_end");
    assert.ok(toolStartIndex >= 0, "Tool execution start event is required");
    assert.ok(toolEndIndex >= 0, "Tool execution end event is required");
    assert.ok(toolStartIndex < toolEndIndex);
    assert.equal(eventTypes.at(0), "agent_start");
    assert.equal(eventTypes.at(-1), "agent_end");

    unsubscribe();
    unsubscribe = undefined;

    const cancelledAgent = createAgent();
    faux.setResponses([
      fauxAssistantMessage("one two three four five six seven eight nine ten"),
    ]);
    let resolveAssistantStart!: () => void;
    const assistantStarted = new Promise<void>((resolve) => {
      resolveAssistantStart = resolve;
    });
    const unsubscribeCancelled = cancelledAgent.subscribe((event) => {
      if (
        event.type === "message_start" &&
        event.message.role === "assistant"
      ) {
        resolveAssistantStart();
      }
    });
    const cancellation = new AbortController();
    const abortAgent = () => cancelledAgent.abort();
    cancellation.signal.addEventListener("abort", abortAgent, { once: true });
    try {
      const cancelledRun = cancelledAgent.prompt("Count slowly to ten.");
      await awaitWithFailureWatchdog(
        assistantStarted,
        "assistant stream start",
        () => cancelledAgent.abort(),
      );
      cancellation.abort();
      await awaitWithFailureWatchdog(cancelledRun, "cancelled Agent run", () =>
        cancelledAgent.abort(),
      );
    } finally {
      unsubscribeCancelled();
      cancellation.signal.removeEventListener("abort", abortAgent);
    }
    const cancelledMessage = cancelledAgent.state.messages.at(-1);
    assert.equal(cancelledMessage?.role, "assistant");
    if (cancelledMessage?.role !== "assistant") {
      throw new Error("cancellation must settle with an assistant message");
    }
    assert.equal(cancelledMessage.stopReason, "aborted");
    assert.equal(cancelledMessage.errorMessage, "Request was aborted");

    const exhaustedAgent = createAgent();
    faux.setResponses([]);
    await awaitWithFailureWatchdog(
      exhaustedAgent.prompt("This request has no scripted response."),
      "exhausted faux-response run",
      () => exhaustedAgent.abort(),
    );
    const exhaustedMessage = exhaustedAgent.state.messages.at(-1);
    assert.equal(exhaustedMessage?.role, "assistant");
    if (exhaustedMessage?.role !== "assistant") {
      throw new Error("queue exhaustion must settle with an assistant message");
    }
    assert.equal(exhaustedMessage.stopReason, "error");
    assert.equal(
      exhaustedMessage.errorMessage,
      "No more faux responses queued",
    );
  } finally {
    unsubscribe?.();
    for (const agent of agents) agent.abort();
    try {
      await awaitWithFailureWatchdog(
        Promise.all(agents.map((agent) => agent.waitForIdle())),
        "Agent cleanup",
        () => {
          for (const agent of agents) agent.abort();
        },
      );
    } finally {
      models.deleteProvider(faux.provider.id);
      assert.equal(models.getProvider(faux.provider.id), undefined);
      assert.equal(
        models.getModel("deterministic-guide-faux", "calculator-model"),
        undefined,
      );
    }
  }
}

test(
  "runs a deterministic Agent without network access",
  verifyDeterministicAgentTestingGuide,
);
```

## 6. Hủy qua AbortController

`Agent` sở hữu `AbortController` cho run đang hoạt động và công khai `agent.abort()`. Host thường sở hữu một signal khác, chẳng hạn lifetime của HTTP request, job hoặc UI. Ví dụ nối host signal đó với `agent.abort()` bằng listener one-shot, bắt đầu `prompt()`, chờ assistant `message_start`, abort provider stream đang hoạt động rồi vẫn await đến khi settled. Việc chờ event là deterministic; một sequencing sleep tùy ý sẽ khiến test phụ thuộc tốc độ máy.

`awaitWithFailureWatchdog()` không quyết định thời điểm abort. Nó chỉ là failure bound quanh từng asynchronous wait. Nếu event hoặc Agent settlement dự kiến không đến, watchdog abort Agent tương ứng và reject với label cùng giới hạn thời gian. Khối `finally` của helper luôn clear timer khi hoàn tất bình thường lẫn khi reject sớm.

Không xem cancellation là một `prompt()` promise bị reject. Ở release boundary này, faux stream kết thúc bằng assistant message có `stopReason` là `"aborted"` và `errorMessage` là `Request was aborted`. Await run chứng minh Agent đã idle trước cleanup. Vẫn xóa bridge listener dù đã dùng `{ once: true }`, để ownership rule tiếp tục đúng nếu sau này test thay đổi và không phát abort.

## 7. Xem hàng đợi đã cạn là error result

Sau `faux.setResponses([])`, provider call kế tiếp không có scripted step. Faux provider của Pi trả về assistant result với `stopReason: "error"` và `errorMessage: "No more faux responses queued"`. Agent append result đó rồi settled bình thường; vì thế test kiểm tra transcript thay vì chờ `prompt()` reject. Cùng failure-only watchdog giới hạn `prompt()` này để regression không thể khiến `node:test` chờ mãi.

Hành vi này là bằng chứng fail-closed hữu ích. Một fixture response bị thiếu không thể âm thầm gọi hosted provider hoặc tự tạo câu trả lời. Nếu lỗi xuất hiện ngoài dự kiến, hãy so `faux.state.callCount` với độ dài queue và kiểm tra xem Tool call có tạo thêm continuation request hay không.

## 8. Cleanup đăng ký provider và model

Khối `finally` ngoài cùng unsubscribe mọi listener còn lại và abort các Agent đang hoạt động. Sau đó, một cleanup wait có giới hạn gọi `waitForIdle()` cho từng Agent. Khối `finally` lồng bên trong vẫn gọi `models.deleteProvider(faux.provider.id)` nếu settlement chạm giới hạn watchdog. Xóa provider cũng xóa các model của nó khỏi collection cô lập; hai assertion cuối chứng minh điều này.

Với suite lớn hơn, hãy tạo fixture mới cho mỗi test và đăng ký cleanup này trong `afterEach` của test runner. Không dùng lại một faux queue đã bị tiêu thụ một phần giữa các test. Nếu Tool của test sở hữu file tạm hoặc process, hãy giải phóng các resource đó trong cùng cleanup boundary trước khi xóa provider.

## Troubleshooting

| Triệu chứng | Nguyên nhân có thể | Cách kiểm tra |
| --- | --- | --- |
| `No more faux responses queued` sau Tool call | Chỉ response chứa Tool call được xếp hàng | Thêm một final assistant response cho continuation turn |
| `models.getModel()` trả về `undefined` | Provider chưa được đăng ký hoặc ID không khớp | Gọi `models.setProvider(faux.provider)` và dùng chính xác provider/model ID |
| Tool không chạy | Assistant response không dùng `stopReason: "toolUse"` hoặc tên Tool khác nhau | Cho `fauxToolCall("add", ...)` khớp `calculator.name` |
| Có result nhưng linkage sai | Test hoặc Tool dùng lại call ID khác | Assert `toolCallId` khi execute và trong provider request thứ hai |
| Cancellation kết thúc bằng `"stop"` | Response settled trước khi host signal đến Agent | Nối signal trước `prompt()` và abort khi run còn hoạt động |
| Test process không thoát | Listener, Tool resource, timer hoặc process chưa được giải phóng | Unsubscribe, abort, await `waitForIdle()` và cleanup Tool fixture trong `finally`/`afterEach` |

## Checklist chấp nhận

- [ ] Test cài đúng `@earendil-works/pi-ai@0.84.3` và `@earendil-works/pi-agent-core@0.84.3`.
- [ ] Test tạo `Models` collection riêng và không bao giờ đọc API key.
- [ ] Faux queue chứa một response có `ToolCall` và một final response tách biệt.
- [ ] Assertion bao phủ provider request, Tool argument, result linkage, thứ tự transcript, final text và final stop reason.
- [ ] Nhánh `AbortController` tạo assistant message `"aborted"` đã settled.
- [ ] Queue rỗng tạo assistant result `"error"` đúng tài liệu.
- [ ] Failure-only watchdog giới hạn mọi Agent wait, abort khi timeout và clear timer.
- [ ] Cleanup listener, Agent, provider và model chạy kể cả khi assertion thất bại.
- [ ] `node --import tsx --test deterministic-agent.test.ts` hoàn tất mà không cần network access.

## Tiếp theo

- [Chương 11: Testing và Agent evaluation](../ch11-testing-evaluation.md) đặt test deterministic này vào chiến lược bằng chứng rộng hơn.
- [Thêm Tool tùy chỉnh](add-custom-tool.md) mở rộng Tool contract và boundary xử lý lỗi.
- Hướng dẫn kế tiếp giải thích cách chạy evaluation package private được khóa theo release của Pi sau khi các deterministic contract đã xanh.
