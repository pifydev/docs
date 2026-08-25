---
title: Host một Pi session runtime có thể thay thế
description: Xây host tuần tự hóa quanh Pi 0.84.3 để thay session an toàn qua thao tác new, resume, fork, clone và import.
translation_key: how-to-host-session-runtime
language: vi
source_url: "https://docs.pify.dev/vi/how-to/host-session-runtime"
official_refs:
  - "https://github.com/earendil-works/pi/blob/4e58f324fae8ebfa98a3d45181fb248072a2afac/packages/coding-agent/src/core/agent-session.ts"
  - "https://github.com/earendil-works/pi/blob/4e58f324fae8ebfa98a3d45181fb248072a2afac/packages/coding-agent/src/core/agent-session-runtime.ts"
  - "https://github.com/earendil-works/pi/blob/4e58f324fae8ebfa98a3d45181fb248072a2afac/packages/coding-agent/src/core/agent-session-services.ts"
  - "https://github.com/earendil-works/pi/blob/4e58f324fae8ebfa98a3d45181fb248072a2afac/packages/coding-agent/src/core/sdk.ts"
terms_used:
  - composition root
  - fail-closed
  - harness
status: reviewed
reviewed_by: Pify maintainers
last_updated: '2026-08-25'
translator: Pify maintainers
---

Một server chạy lâu, desktop shell hoặc RPC process không thể coi `AgentSession` là cố định khi người dùng có thể tạo session mới, resume project khác, fork lịch sử, clone một branch hoặc import JSONL. Pi `0.84.3` cung cấp `AgentSessionRuntime` làm boundary thay thế: nó sở hữu session hiện tại cùng các service gắn với cwd, còn host chịu trách nhiệm tuần tự hóa, subscription, diagnostic và failure policy.

Hướng dẫn này xây boundary đó chỉ bằng public export từ `@earendil-works/pi-coding-agent@0.84.3`. Toàn bộ TypeScript shape được compile-check trong repository tài liệu này. Code nhận dependency thay vì tạo resource thật trong lúc kiểm tra.

## Kết quả

Sau hướng dẫn này, bạn có thể:

- chọn giữa factory một session và runtime có thể thay thế;
- tách intent dùng chung cho process khỏi service phải dựng lại cho cwd đích;
- tuần tự hóa mọi thao tác thay thế qua một host lock;
- gỡ listener trước khi session cũ mất hiệu lực, bind Extension lifecycle của replacement, rồi mới cài host listener;
- ngừng công khai runtime nếu bước tạo thất bại sau teardown;
- xác minh cwd, diagnostic, persistence và disposal tại host boundary.

## 1. Chọn `createAgentSession()` hay `createAgentSessionRuntime()`

Dùng lifecycle owner nhỏ nhất phù hợp với ứng dụng.

| Nhu cầu | `createAgentSession()` | `createAgentSessionRuntime()` |
| --- | --- | --- |
| Một cwd cố định và một vòng đời session | Nên dùng | Tạo thêm abstraction không cần thiết |
| Host restart để mở session khác | Đủ dùng | Tùy chọn |
| New, resume, fork, clone hoặc import ngay trong process | Host phải tự dựng lại và swap mọi thành phần | Boundary thay thế phù hợp |
| Dựng lại settings, resource, Extension, model scope và Tool khi cwd đổi | Làm thủ công | Factory được gọi với cwd hiệu lực |
| Rebind listener của UI, RPC, telemetry hoặc persistence | Làm thủ công | Dùng `setBeforeSessionInvalidate()` và `setRebindSession()` |

`createAgentSession()` trả về session cùng dữ liệu Extension và model fallback. Caller vẫn sở hữu session đó và phải dispose nó. `createAgentSessionRuntime()` gọi typed factory lần đầu, rồi trả về `AgentSessionRuntime` tái sử dụng chính factory đó cho các lần thay thế sau.

Runtime là lifecycle coordinator, không phải concurrency lock hay transactional database. Hãy thêm host wrapper khi command có thể đến đồng thời hoặc khi replacement thất bại phải đưa process về trạng thái fail-closed.

## 2. Tách input dùng chung cho process khỏi input gắn với cwd

Resolve intent dùng chung cho process đúng một lần tại composition root. Giữ các resource path tường minh ở dạng absolute để lần đổi cwd sau không diễn giải lại chúng.

| Vòng đời | Ví dụ | Quy tắc |
| --- | --- | --- |
| Dùng chung cho process | `agentDir`, shutdown `AbortSignal`, CLI Tool allowlist, extra resource path tuyệt đối, telemetry sink, host persistence adapter, project-trust policy | Capture hoặc inject vào runtime factory |
| Gắn với cwd | `SettingsManager`, `ResourceLoader`, Extension và provider registration của project, model/Tool resolution hiệu lực, `SessionManager`, `AgentSession` | Dựng hoặc resolve lại trong factory cho mỗi cwd hiệu lực |

`createAgentSessionServices()` tạo một bộ service gắn với cwd nhất quán. Sau đó `createAgentSessionFromServices()` tạo session dựa trên các service đó và `SessionManager` đã chọn. API hai giai đoạn này ngăn settings hoặc Extension ở thư mục startup rò sang session được resume từ project khác.

Project trust cũng phải được đánh giá theo cwd đích. Ví dụ inject `authorizeProject(...)`; host production có thể dùng `projectTrustContext` của factory để hỏi qua UI hoặc policy layer của chính nó trước khi load resource do project kiểm soát.

## 3. Cài đặt `CreateAgentSessionRuntimeFactory` có type đầy đủ

Function dưới đây là compile-only host shape hoàn chỉnh. `CreateAgentSessionRuntimeFactory` buộc factory trả về session mới, các service tương ứng và diagnostic như một kết quả nhất quán. Fixture không gọi `createSerializedSessionRuntimeHost()`, nên bước compile không đọc credential, scan project hay mở session file.

```typescript title="replaceable-session-runtime.ts"
import {
  type AgentSession,
  type AgentSessionRuntime,
  type AgentSessionRuntimeDiagnostic,
  type CreateAgentSessionRuntimeFactory,
  type CreateAgentSessionServicesOptions,
  createAgentSessionFromServices,
  createAgentSessionRuntime,
  createAgentSessionServices,
} from "@earendil-works/pi-coding-agent";

export async function createSerializedSessionRuntimeHost(
  processInputs: Pick<
    CreateAgentSessionServicesOptions,
    | "modelRuntimeSignal"
    | "extensionFlagValues"
    | "resourceLoaderOptions"
    | "resourceLoaderReloadOptions"
  > & {
    tools?: string[];
    authorizeProject?: (options: {
      cwd: string;
      projectTrustContext: Parameters<CreateAgentSessionRuntimeFactory>[0]["projectTrustContext"];
    }) => Promise<void>;
  },
  initial: Parameters<typeof createAgentSessionRuntime>[1],
  bindings: {
    extensionBindings(
      session: AgentSession,
    ): Parameters<AgentSession["bindExtensions"]>[0];
    subscribe(session: AgentSession): () => void;
    reportDiagnostics(
      diagnostics: readonly AgentSessionRuntimeDiagnostic[],
    ): void;
    flushPersistence(): Promise<void>;
  },
): Promise<{
  readonly cwd: string;
  readonly diagnostics: readonly AgentSessionRuntimeDiagnostic[];
  newSession(): ReturnType<AgentSessionRuntime["newSession"]>;
  resume(
    sessionPath: string,
    cwdOverride?: string,
  ): ReturnType<AgentSessionRuntime["switchSession"]>;
  fork(entryId: string): ReturnType<AgentSessionRuntime["fork"]>;
  clone(entryId: string): ReturnType<AgentSessionRuntime["fork"]>;
  importJsonl(
    inputPath: string,
    cwdOverride?: string,
  ): ReturnType<AgentSessionRuntime["importFromJsonl"]>;
  dispose(): Promise<void>;
}> {
  const { tools, authorizeProject, ...serviceInputs } = processInputs;
  const createRuntime: CreateAgentSessionRuntimeFactory = async ({
    cwd,
    agentDir,
    sessionManager,
    sessionStartEvent,
    projectTrustContext,
  }) => {
    await authorizeProject?.({ cwd, projectTrustContext });
    const services = await createAgentSessionServices({
      ...serviceInputs,
      cwd,
      agentDir,
    });
    const created = await createAgentSessionFromServices({
      services,
      sessionManager,
      sessionStartEvent,
      tools,
    });
    return {
      ...created,
      services,
      diagnostics: [...services.diagnostics],
    };
  };

  const runtime: AgentSessionRuntime = await createAgentSessionRuntime(
    createRuntime,
    initial,
  );
  let tail: Promise<void> = Promise.resolve();
  let unsubscribe: (() => void) | undefined;
  let replacementInFlight = false;
  let unusable = false;
  let disposed = false;

  const clearSubscription = () => {
    const release = unsubscribe;
    unsubscribe = undefined;
    release?.();
  };
  const clearSubscriptionAfterFailure = (cleanupFailures: unknown[]) => {
    try {
      clearSubscription();
    } catch (error) {
      cleanupFailures.push(error);
    }
  };
  const throwBindingFailure = (
    error: unknown,
    cleanupFailures: unknown[],
    phase: string,
  ): never => {
    if (cleanupFailures.length === 0) throw error;
    throw new AggregateError(
      [error, ...cleanupFailures],
      `${phase} failed and cleanup also failed`,
      { cause: error },
    );
  };
  const bindSession = async (session: AgentSession) => {
    clearSubscription();
    try {
      await session.bindExtensions(bindings.extensionBindings(session));
      unsubscribe = bindings.subscribe(session);
      bindings.reportDiagnostics(runtime.diagnostics);
    } catch (error) {
      const cleanupFailures: unknown[] = [];
      clearSubscriptionAfterFailure(cleanupFailures);
      return throwBindingFailure(error, cleanupFailures, "session binding");
    }
  };
  const disposeBindingFailure = async (
    error: unknown,
    phase: "initial" | "replacement",
  ): Promise<never> => {
    unusable = true;
    const cleanupFailures: unknown[] = [];
    try {
      clearSubscriptionAfterFailure(cleanupFailures);
      try {
        await runtime.dispose();
      } catch (disposeError) {
        cleanupFailures.push(disposeError);
      }
    } finally {
      replacementInFlight = true;
      unusable = true;
      clearSubscriptionAfterFailure(cleanupFailures);
    }
    return throwBindingFailure(
      error,
      cleanupFailures,
      `${phase} session binding`,
    );
  };
  const assertAvailable = () => {
    if (disposed) throw new Error("session runtime host is disposed");
    if (unusable || replacementInFlight) {
      throw new Error("session runtime host has no usable current session");
    }
  };
  const serialize = <T>(operation: () => Promise<T>): Promise<T> => {
    const pending = tail.then(async () => {
      assertAvailable();
      try {
        return await operation();
      } catch (error) {
        if (replacementInFlight) unusable = true;
        throw error;
      }
    });
    tail = pending.then(
      () => undefined,
      () => undefined,
    );
    return pending;
  };
  const replace = <T>(operation: () => Promise<T>): Promise<T> =>
    serialize(async () => {
      const result = await operation();
      await bindings.flushPersistence();
      return result;
    });

  runtime.setBeforeSessionInvalidate(() => {
    replacementInFlight = true;
    clearSubscription();
  });
  runtime.setRebindSession(async (session) => {
    try {
      await bindSession(session);
      replacementInFlight = false;
    } catch (error) {
      return disposeBindingFailure(error, "replacement");
    }
  });

  try {
    await bindSession(runtime.session);
  } catch (error) {
    return disposeBindingFailure(error, "initial");
  }

  return {
    get cwd() {
      assertAvailable();
      return runtime.cwd;
    },
    get diagnostics() {
      assertAvailable();
      return runtime.diagnostics;
    },
    newSession: () => replace(() => runtime.newSession()),
    resume: (sessionPath, cwdOverride) =>
      replace(() => runtime.switchSession(sessionPath, { cwdOverride })),
    fork: (entryId) => replace(() => runtime.fork(entryId)),
    clone: (entryId) =>
      replace(() => runtime.fork(entryId, { position: "at" })),
    importJsonl: (inputPath, cwdOverride) =>
      replace(() => runtime.importFromJsonl(inputPath, cwdOverride)),
    dispose: () =>
      serialize(async () => {
        await runtime.session.abort();
        await bindings.flushPersistence();
        await runtime.dispose();
        clearSubscription();
        replacementInFlight = false;
        disposed = true;
      }),
  };
}
```

Factory chủ động trả về bản sao của `services.diagnostics`. Bạn có thể thêm diagnostic của host, model selection, custom Tool và kết quả trust trước khi return, nhưng phải giữ chúng gắn với đúng cặp `services` và `session` đó.

## 4. Tạo runtime ban đầu

Caller truyền `cwd`, `agentDir` và `SessionManager` ban đầu qua argument `initial`. Trong composition root thật, chỉ tạo manager sau khi quyết định startup là session mới, session in-memory, session gần nhất hay một file cụ thể. Cwd hiệu lực của manager phải tồn tại; `createAgentSessionRuntime()` validate boundary này trước khi gọi factory.

Từ góc nhìn caller, bước tạo đầu tiên là atomic: helper chỉ return sau khi factory tạo đủ `AgentSessionRuntime`, `bindExtensions(...)` hoàn tất initial Extension lifecycle và host subscription đầu tiên đã bind. Nếu authorization, load service, Extension binding hoặc tạo session reject, wrapper không được trả về.

Không resolve project settings hoặc relative Extension path trước khi biết cwd hiệu lực của session. Resume hoặc import có thể chọn session với cwd khác `process.cwd()`.

## 5. Bind host subscription vào `AgentSession` hiện tại

`bindings.extensionBindings(session)` trả về public options shape qua `Parameters<AgentSession["bindExtensions"]>[0]`; hướng dẫn không cần import non-top-level type `ExtensionBindings` của Pi. Hãy cung cấp mode, UI context, command action, abort/shutdown handler và error listener mà host cần. Các callback có thể capture serialized operation của wrapper nhưng không được bỏ qua lock của nó.

`await session.bindExtensions(...)` apply các binding đó, phát event `session_start` của chính session và cho Extension mở rộng resource đã load. Bước này phải hoàn tất cho initial session và mọi replacement trước khi host công khai event từ session đó. Sau đó `bindings.subscribe(session)` mới là ownership boundary cho UI rendering, RPC notification, telemetry hoặc transcript projection. Nó phải trả về một unsubscribe function idempotent để gỡ mọi host listener đã cài cho session.

Helper bất đồng bộ `bindSession()` dùng chung áp đặt đúng thứ tự cho cả hai path: clear host subscription cũ, await Extension binding, cài host subscription rồi report diagnostic. Nếu Extension binding, bước cài subscription hoặc report diagnostic throw, catch path sẽ gỡ mọi unsubscribe handle đã được trả về. Adapter `subscribe(...)` phải tự bảo đảm tính atomic: nếu nó throw trước khi trả cleanup function, chính adapter phải rollback mọi listener đã cài một phần. Không cache `runtime.session` trong service khác; hãy chuyển event phát sinh từ session qua binding adapter.

Nếu initial Extension hoặc host binding thất bại, ví dụ clear mọi subscription đã trả về, đánh dấu host unavailable, dispose runtime vừa tạo rồi reject startup. Lỗi binding gốc được rethrow khi cleanup thành công. Nếu subscription cleanup hoặc runtime disposal cũng thất bại, một `AggregateError` giữ lỗi gốc làm cause và phần tử đầu thay vì che mất nó. Đây là fail-closed: host thiếu lifecycle, observation hoặc persistence boundary hoàn chỉnh sẽ không bắt đầu phục vụ request.

## 6. Tuần tự hóa new, resume, fork, clone và import

`AgentSessionRuntime` không tuần tự hóa caller. Promise `tail` trong wrapper chính là host lock: mỗi thao tác chỉ bắt đầu sau khi thao tác trước fulfill hoặc reject. Nhánh reject reset queue nhưng không che lỗi của thao tác khỏi caller tương ứng.

| Ý định của host | Release API | Kết quả quan trọng |
| --- | --- | --- |
| New | `runtime.newSession()` | Có thể trả `{ cancelled: true }` từ `session_before_switch` |
| Resume | `runtime.switchSession(path, { cwdOverride })` | Dựng lại service theo cwd hiệu lực của saved session |
| Fork | `runtime.fork(entryId)` | Mặc định `position: "before"` và có thể trả `selectedText` |
| Clone | `runtime.fork(entryId, { position: "at" })` | Clone là ý định của host, không phải method riêng trên `AgentSessionRuntime` |
| Import | `runtime.importFromJsonl(path, cwdOverride)` | Copy/mở JSONL trong session directory rồi switch theo resume semantics |

Request handler chỉ được gọi method trên wrapper. Nếu bỏ qua wrapper và gọi runtime bên dưới đồng thời, teardown và creation có thể xen kẽ, listener có thể rebind vào sai session, hoặc một operation có thể hành động trên state vừa bị operation khác thay thế.

Before-event bị cancel sẽ return mà không vô hiệu session cũ. Đây là kết quả bình thường, không phải factory failure. Missing file, entry không hợp lệ hoặc missing cwd cũng có thể xảy ra trước teardown; wrapper propagate chúng nhưng giữ binding hiện tại.

## 7. Unbind session cũ và bind session thay thế

Release lifecycle cung cấp hai callback cho hai thời điểm khác nhau:

- `setBeforeSessionInvalidate()` chạy đồng bộ sau khi handler `session_shutdown` hoàn tất nhưng trước khi session cũ bị dispose. Wrapper đánh dấu replacement đang diễn ra và gỡ listener cũ tại đây.
- `setRebindSession()` được await sau khi kết quả factory đã apply. Wrapper gọi cùng helper `bindSession()`, await `session.bindExtensions(...)` trước khi cài host subscription và report diagnostic. Chỉ sau đó nó mới đánh dấu host available trở lại.

Runtime cập nhật `session`, `services`, `diagnostics` và `modelFallbackMessage` cùng lúc trước callback rebind. Nếu `bindSession()` sau đó thất bại, Pi đã apply replacement đó. Wrapper lập tức đánh dấu chính nó unusable, clear mọi subscription đã trả về, thử `runtime.dispose()` trên applied replacement và dùng `finally` để giữ cả `replacementInFlight` lẫn `unusable` trước khi propagate lỗi gốc hoặc lỗi aggregate. Wrapper công khai cwd và diagnostic nhưng chủ động không công khai raw `AgentSessionRuntime`; nhờ vậy request code không thể đọc session cũ đã dispose hoặc applied replacement bị lỗi.

```mermaid
sequenceDiagram
    participant Caller as Host caller
    participant Lock as Host lock
    participant Dispose as Disposal
    participant Old as Old session
    participant Factory as Runtime factory
    participant Next as Replacement session
    participant Extensions as Extension binding
    participant Rebind as Subscription rebind
    Caller->>Lock: enqueue new/resume/fork/clone/import
    Lock->>Dispose: begin runtime teardown
    Dispose->>Old: abort active response
    Dispose->>Old: session_shutdown
    Dispose->>Rebind: unbind before invalidation
    Dispose->>Old: dispose()
    Lock->>Factory: create target cwd runtime
    alt factory succeeds
        Factory-->>Lock: session + services + diagnostics
        Lock->>Next: apply coherent result
        Lock->>Extensions: bindExtensions(replacement options)
        Extensions->>Next: session_start and extend resources
        alt Extension and host binding succeed
            Extensions-->>Lock: Extension lifecycle ready
            Lock->>Rebind: subscribe to replacement session
            Rebind-->>Caller: operation result
        else Extension, subscribe, or diagnostics fail
            Extensions--xLock: binding failure
            Lock->>Rebind: clear returned subscription
            Lock->>Next: dispose applied replacement
            Lock->>Lock: keep host unusable in finally
            Lock--xCaller: original or aggregate failure
        end
    else factory rejects after disposal
        Factory--xLock: reject
        Lock->>Lock: mark host unusable
        Lock--xCaller: propagate error and expose no session
    end
```

## 8. Dispose resource cũ và flush persistence

Khi replacement, teardown nội bộ của Pi trước hết await `oldSession.abort()`. Bước này settle response đang hoạt động để aborted turn và Tool result của nó có thể được ghi vào session sắp rời đi. Sau đó runtime await `session_shutdown`, chạy invalidation callback đồng bộ và gọi `oldSession.dispose()` trước khi gọi factory. Không được tái sử dụng Extension runner cũ hay resource do session sở hữu sau thời điểm đó.

`SessionManager` append record JSONL của Pi qua chính session operation; `AgentSessionRuntime` không có public method `flush()` bất đồng bộ. `flushPersistence()` trong ví dụ chỉ dành cho persistence, event projection hoặc durable queue do host sở hữu. Nó chạy sau mỗi replacement thành công và, khi dispose cuối cùng, sau `runtime.session.abort()` nhưng trước `runtime.dispose()`.

Final shutdown cũng được tuần tự hóa. Ngừng nhận command mới, await `host.dispose()`, rồi mới đóng resource dùng chung cho process như database pool hoặc telemetry exporter. Gọi wrapper method sau dispose sẽ reject thay vì chạm vào session không còn hợp lệ.

## 9. Xử lý factory failure mà không để lộ half-replaced session

Replacement trong Pi `0.84.3` không phải rollback transaction. `AgentSessionRuntime` dispose session cũ trước khi await factory mới. Nếu factory reject, runtime propagate error và không chạy bước apply hoặc rebind nội bộ; object cũ đã mất hiệu lực còn replacement dùng được chưa tồn tại.

Wrapper phát hiện đúng boundary này vì `setBeforeSessionInvalidate()` đã đặt `replacementInFlight`, còn `setRebindSession()` thành công chỉ xóa flag sau khi cả Extension binding lẫn host binding hoàn tất. Factory rejection xảy ra trước apply nên không có replacement cần dispose. Rejection từ `bindExtensions(...)`, host subscription hoặc diagnostic reporting xảy ra sau apply, vì vậy rebind catch clear subscription đã trả về và dispose applied replacement trước khi propagate. Finally path giữ wrapper unusable ngay cả khi disposal thất bại. Subscription cũ đã được gỡ, không có raw session nào được public, và operation hay state getter sau đó đều reject. Đây là policy no-half-replacement, fail-closed bắt buộc.

Cleanup failure không bao giờ thay thế bằng chứng chính. `throwBindingFailure()` rethrow lỗi binding gốc khi cleanup thành công; nếu không, nó throw `AggregateError` có phần tử đầu và `cause` là lỗi gốc, theo sau bởi lỗi unsubscribe hoặc disposal. Hãy log cấu trúc aggregate nhưng không serialize session content, đồng thời xem từng phần tử là một operational incident.

Không catch lỗi rồi tiếp tục phục vụ qua một session đã cache. Hãy ghi operation, target path hoặc cwd và error nhưng không log transcript content hay secret. Sau đó kết thúc worker đang sở hữu runtime, hoặc dựng host mới từ một safe startup target tường minh. Chỉ retry tự động khi host vẫn unavailable và mỗi attempt dựng một runtime mới hoàn chỉnh.

Lỗi phát sinh trước invalidation là trường hợp khác. Ví dụ Extension có thể cancel switch hoặc fork, còn file/cwd validation có thể thất bại trước teardown. Khi đó session cũ vẫn là session hiện tại; wrapper propagate result hoặc error nhưng không tự poison.

## 10. Xác minh cwd, diagnostic và acceptance criteria

Test wrapper bằng một harness inject binding giả và runtime factory có kiểm soát. Production compile contract chứng minh compatibility với public type; behavioral test còn phải quan sát sequencing và failure state mà không dùng provider thật.

Xác minh các invariant sau:

- [ ] `host.cwd` bằng cwd hiệu lực của `runtime.services` hiện tại, không nhất thiết bằng `process.cwd()` lúc startup.
- [ ] Absolute resource path dùng chung cho process giữ nguyên ý nghĩa sau resume hoặc import.
- [ ] Mỗi replacement thành công tạo đúng một bộ session/services/diagnostics khớp nhau và report diagnostic mới đúng một lần.
- [ ] Call new, resume, fork, clone và import không bao giờ overlap, kể cả sau khi command trước reject.
- [ ] Clone gọi `fork(entryId, { position: "at" })`; fork giữ semantics mặc định `"before"`.
- [ ] Subscription cũ được gỡ trước disposal; mỗi replacement await `bindExtensions(...)` trước khi cài host subscription và trước khi host available.
- [ ] Cancellation hoặc pre-validation failure vẫn giữ binding cũ dùng được.
- [ ] Factory rejection sau invalidation không công khai session nào; binding failure sau apply cũng clear subscription và dispose applied replacement. Cả hai vĩnh viễn reject operation sau đó trên wrapper này.
- [ ] Nếu unsubscribe hoặc replacement disposal thất bại, `AggregateError` được propagate vẫn giữ lỗi binding gốc ở đầu và report cleanup failure riêng.
- [ ] Final disposal abort response đang hoạt động, flush host persistence, phát shutdown qua runtime, unbind và reject access sau đó.
- [ ] Diagnostic output redact secret và định danh operation cùng target cwd hoặc session path.

Với acceptance run thật, tạo session trong hai thư mục cwd tạm, switch qua lại và assert project-local settings cùng resource đến từ cwd đã chọn. Dùng in-memory hoặc faux provider để lifecycle evidence không phụ thuộc network hay credential.

## Bản đồ nguồn cho Pi 0.84.3

Mọi claim ở trên đều được khóa tại release commit `4e58f324fae8ebfa98a3d45181fb248072a2afac`:

| Nguồn | Contract được xác minh |
| --- | --- |
| [`agent-session.ts`](https://github.com/earendil-works/pi/blob/4e58f324fae8ebfa98a3d45181fb248072a2afac/packages/coding-agent/src/core/agent-session.ts) | Parameter public của `AgentSession.bindExtensions(...)`, apply Extension binding, `session_start` và thứ tự mở rộng resource |
| [`agent-session-runtime.ts`](https://github.com/earendil-works/pi/blob/4e58f324fae8ebfa98a3d45181fb248072a2afac/packages/coding-agent/src/core/agent-session-runtime.ts) | Factory/result type, getter, method new/resume/fork/import, callback order, teardown-before-create, apply, thay diagnostic và disposal |
| [`agent-session-services.ts`](https://github.com/earendil-works/pi/blob/4e58f324fae8ebfa98a3d45181fb248072a2afac/packages/coding-agent/src/core/agent-session-services.ts) | Tạo service gắn với cwd, diagnostic và tạo session từ bộ service nhất quán |
| [`sdk.ts`](https://github.com/earendil-works/pi/blob/4e58f324fae8ebfa98a3d45181fb248072a2afac/packages/coding-agent/src/core/sdk.ts) | Contract trực tiếp của `createAgentSession()` và các public re-export dùng trong hướng dẫn |

## Bước tiếp theo

- [Lưu session](persist-sessions.md) giải thích session JSONL tree và thao tác `SessionManager` trực tiếp.
- [Test Agent theo cách deterministic](test-agent-deterministically.md) cung cấp provider fixture không cần network cho lifecycle test.
- [Chương 11: Testing và Agent evaluation](../ch11-testing-evaluation.md) đặt runtime acceptance test trong chiến lược evidence rộng hơn.
