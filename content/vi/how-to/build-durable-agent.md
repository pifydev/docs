---
title: Xây dựng Durable Agent thử nghiệm
description: Xây dựng host Durable Agent nhỏ bằng Pi 0.99.2 với boundary chính xác cho recovery, replay, ownership, quan sát và storage.
translation_key: how-to-build-durable-agent
language: vi
official_refs:
  - "https://github.com/earendil-works/pi/blob/005af57d88ee23b33778f343a9595b32e67ff788/packages/durable/README.md"
  - "https://github.com/earendil-works/pi/blob/005af57d88ee23b33778f343a9595b32e67ff788/packages/durable/src/index.ts"
  - "https://github.com/earendil-works/pi/blob/005af57d88ee23b33778f343a9595b32e67ff788/packages/durable/src/harness/harness.ts"
  - "https://github.com/earendil-works/pi/blob/005af57d88ee23b33778f343a9595b32e67ff788/packages/durable/src/harness/types.ts"
  - "https://github.com/earendil-works/pi/blob/005af57d88ee23b33778f343a9595b32e67ff788/packages/durable/src/tasks.ts"
  - "https://github.com/earendil-works/pi/blob/005af57d88ee23b33778f343a9595b32e67ff788/packages/durable/src/storage/memory.ts"
  - "https://github.com/earendil-works/pi/blob/005af57d88ee23b33778f343a9595b32e67ff788/packages/durable/src/storage/sqlite/node.ts"
  - "https://github.com/earendil-works/pi/blob/005af57d88ee23b33778f343a9595b32e67ff788/packages/durable/src/storage/jsonl/node.ts"
  - "https://github.com/earendil-works/pi/blob/005af57d88ee23b33778f343a9595b32e67ff788/packages/chord/src/context/index.ts"
  - "https://github.com/earendil-works/pi/blob/005af57d88ee23b33778f343a9595b32e67ff788/packages/durable/package.json"
terms_used:
  - Harness
  - Conversation
  - Entry
  - Commit
  - Document
  - Task
  - Submission
  - Registry
status: reviewed
reviewed_by: Pify maintainers
last_updated: '2026-10-01'
---

# Xây dựng Durable Agent thử nghiệm

> **Experimental.** `@earendil-works/pi-durable` có thể thay đổi mà không báo trước giữa các release. Hãy ghim version, test recovery với đúng version đó và coi mỗi lần nâng cấp là một migration.

Pi Durable là agent harness có storage làm nền tảng. Nó commit Conversation, model turn, Tool call và state của ứng dụng trước khi công khai chúng, rồi tiếp tục work đã được nhận sau khi process khởi động lại. Hướng dẫn này xây dựng host hữu ích nhỏ nhất nhưng vẫn giữ đúng các boundary về replay và cancellation.

## Trạng thái và thời điểm sử dụng

Dùng Durable khi một run phải sống qua worker crash hoặc lần restart có kế hoạch, khi transcript và state của ứng dụng phải hiển thị cùng nhau theo cách nguyên tử, hoặc khi child work cần ownership tường minh. Nó cũng phù hợp với host cần structural view đã commit thay vì dựng lại state từ callback tạm thời.

Đừng thêm Durable chỉ để bọc một model request ngắn hạn, và đừng nhầm durability với khả năng exactly-once cho side effect bên ngoài. Package thử nghiệm này không bắt buộc thay thế Agent Core hoặc `SessionManager`; hai lựa chọn đó vẫn phù hợp khi contract bạn cần là agent loop trong process và session tree của chúng. Durable là một runtime riêng cho scheduling và recovery có persistence.

## Mô hình tư duy: Harness, Conversation và run

- **Harness** sở hữu một storage đang mở, tuần tự hóa các Commit nguyên tử và schedule durable work.
- **Conversation** là handle không giữ state cho một transcript; hãy so sánh handle bằng `id`. Các **Entry** bất biến của nó gồm user input, assistant output, Tool result, thay đổi system, reset marker và kind do ứng dụng định nghĩa.
- **Commit** là đơn vị publication. Nó có thể đồng thời append Entry, cập nhật state JSON có type trong **Document** và tạo **Task** bền vững.
- Task là state machine có checkpoint. Mọi Task đều thuộc về một Conversation hoặc một Task khác; chỉ Conversation mới có thể là ownerless.
- **Submission** là input hoặc thao tác ghi Entry thụ động đã được nhận bền vững; host có thể inspect, wait, abort khi còn trong queue hoặc tìm lại theo ID.
- **Registry** cung cấp định nghĩa Tool, định nghĩa Task, các section của system prompt, hook và setup theo Conversation. Work mới dùng state Registry đang được publish.

Một turn là một model response cùng các Tool call của response đó; một run kéo dài qua mọi turn từ input được nhận đến final answer. Conversation ở trạng thái busy trong suốt run, vì vậy input đến sau phải đi qua busy boundary của inbox thay vì race với turn đang chạy.

Mọi lời gọi Durable bất đồng bộ đều nhận một Chord `Context`. `BACKGROUND_CONTEXT` không bao giờ bị cancel. Cancel một wait chỉ hủy wait đó và không bao giờ hủy durable work; hãy gọi `Submission.abort()`, `Conversation.abort()` hoặc `Harness.abortTask()` khi thực sự muốn hủy work đã được nhận. Task invocation nhận Context có boundary riêng, vì vậy code không được giữ invocation-bound handle sau khi invocation kết thúc.

## Mở Harness trong bộ nhớ

Hãy bắt đầu bằng `MemoryStorage` để học lifecycle và chạy test deterministic. Ví dụ dưới đây đồng bộ từng byte với contract fixture Pi `0.99.2` đã được compile-check. `createRegistry()` chứa sẵn các Durable Task và Conversation setup built-in; `createModels()` chủ động chưa cấu hình provider, nên ví dụ có thể mở, cấu hình, quan sát và đóng mà không cần provider hay network.

```ts
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { createModels } from "@earendil-works/pi-ai/models";
import {
  createRegistry,
  Harness,
  MemoryStorage,
  type Conversation,
} from "@earendil-works/pi-durable";

export async function verifyPi0992DurableContracts(): Promise<number> {
  const context = BACKGROUND_CONTEXT;
  const harness = await Harness.open(
    new MemoryStorage(),
    {
      models: createModels(),
      registry: createRegistry(),
    },
    context,
  );

  try {
    const root: Conversation = await harness.root(context);
    await root.setCompaction(
      {
        enabled: true,
        reserveTokens: 16_384,
        keepRecentTokens: 20_000,
        backgroundTokens: 32_768,
      },
      context,
    );
    const view = await root.viewState(context);
    try {
      void view.value;
    } finally {
      view.dispose();
    }
    return root.id;
  } finally {
    await harness.close(context);
  }
}
```

`Harness.open()` điều hòa các Task còn ở trạng thái `running` thành pending work có thể recover. `root()` tạo root ID `1` dành riêng trong một Commit nếu chưa tồn tại, hoặc trả về root cũ sau khi mở lại. Luôn đóng trong `finally`: close chặn admission mới, join các Task invocation hiện tại rồi đóng storage, nhưng không xóa durable work chưa hoàn tất.

## Gửi input và commit Entry bất biến

Hãy cấu hình model và provider trước một submission thật. Với input idle và inbox rỗng, admission Commit tạo theo cách nguyên tử `UserEntry`, placed `Submission`, Task generation do Conversation sở hữu và live run. Input gửi khi busy được queue; khi boundary đặt input đó, boundary append user Entry rồi bắt đầu run trong cùng commit nguyên tử. Task generation sử dụng input đã commit, gọi model, sở hữu các Tool Task của turn và cuối cùng settle Submission thành `done` hoặc `unanswered`. Pattern ở host dưới đây tách admission khỏi việc sử dụng kết quả:

```ts
import { AssistantEntry } from "@earendil-works/pi-durable";

const submission = await root.submit(
  {
    type: "input",
    content: "What is the capital of France?",
    requestId: "capital-france-1",
  },
  context,
);
const settled = await submission.wait(context);
if (settled.status === "done" && settled.type === "input") {
  const answer = await root.commit(
    (tx) => tx.entry(AssistantEntry, settled.answer),
    context,
  );
  console.log(answer?.model?.[0]);
}
```

Entry không bao giờ thay đổi sau publication. Commit có tính nguyên tử: observer hoặc thấy toàn bộ Entry, Document và Task vừa commit, hoặc không phần nào trong số đó. UI, event adapter hay worker không được công khai state trung gian của transaction trước khi storage chấp nhận Commit.

Ví dụ chủ động ghi thêm một `AssistantEntry` để minh họa cách tạo typed Entry; UI production thường render assistant Entry mà Task generation đã commit thay vì nhân đôi nó.

## Lưu bền vững Document và Task theo cách nguyên tử

Document là state JSON có type được lưu bên cạnh transcript. Dùng `defineDoc()` hoặc `defineDocFamily()` để khai báo kind, version, scope, history behavior, fork behavior và initializer. Chỉ cập nhật nó qua Commit và đọc qua snapshot hoặc Document state đã attach. Chỉ chọn `history: "rewindable"` khi cần snapshot lịch sử; `latest` tránh giữ nội dung cũ.

Hãy tạo Entry, sửa Document và tạo Task trong cùng transaction khi chúng mô tả một business transition. Ví dụ, thao tác nhận job có thể cùng lúc append audit Entry, đổi job Document và tạo Task xử lý; nếu bất kỳ bước nào lỗi thì không phần nào được lưu. Commit từ Conversation dùng Conversation đó làm owner mặc định cho Task, còn Task ownership tường minh liên kết child work với parent.

Định nghĩa application Task bằng `defineTask()`, đăng ký chúng trước recovery và để mỗi phase commit checkpoint kế tiếp hoặc terminal outcome. Trạng thái waiting liệt kê Task ID trong `on` rồi chọn `allSettled` hoặc `failFast`. `on` có thể tham chiếu Task bất kỳ, kể cả Task đã terminal hoặc Task mà waiter không sở hữu. Task không được sở hữu bắt buộc dùng `allSettled`; `failFast` chỉ hợp lệ khi mọi Task được nêu đều là child do waiter sở hữu. Waiter resume sau khi mọi Task trong `on` đều terminal. Task đã hoàn tất vẫn ở `completing` cho tới khi ordinary work nó sở hữu drain xong. Đây là durable structured concurrency, không phải queue Promise tách rời.

## Khôi phục work và loại bỏ request trùng lặp

Sau crash hoặc close đúng trình tự, persistent storage vẫn giữ input đã nhận, Entry, Document, Submission và Task chưa hoàn tất; hãy mở lại cùng backend, khởi động scheduler rồi chủ động resume bằng `resume()`. `submit()`, `Submission.wait()`, `waitForTask()` và các idle wait cũng tự resume scheduling.

Dùng `requestId` ổn định mỗi khi host có thể gửi lại cùng request; trong một Conversation, ID đó trả về Submission đã có và không bắt đầu run thứ hai. Hãy giữ ID trong durable record của caller, vì đổi ID sau timeout sẽ làm deduplication mất tác dụng. ID này có scope trong một Conversation; nó không phải global idempotency key cho external service.

Persist `Submission.id` khi caller sẽ reconnect. `harness.submission(id, context)` tìm lại Submission sau khi mở lại, còn `status()` quan sát mà không chờ. Nếu thiếu định nghĩa Task, version quá cũ hoặc migration lỗi, `inspect()` sẽ công khai blocked work; đừng ngầm coi trạng thái đó là thành công.

## Khai báo policy replay cho Tool

Mỗi Tool call là một durable Task. Intent của nó được commit trước khi `execute()` chạy, nhưng chỉ Tool khai báo `replay: "safe"` mới được chạy lại sau gián đoạn. Mặc định là `unsafe`; lúc recovery, call unsafe bị gián đoạn trở thành error Tool result và giữ lại output đã commit. Chỉ đánh dấu safe khi toàn bộ execution có thể lặp lại hoặc Tool tự thực thi durable idempotency protocol.

Giả sử Tool đã trừ tiền thẻ rồi process crash trước khi kết quả thành công được ghi lại; persistence của Tool intent không thể biến side effect đó thành safe vì replay có thể trừ tiền lần nữa. Hãy dùng provider idempotency key ổn định và reconcile kết quả từ provider, hoặc giữ `replay` ở unsafe rồi yêu cầu recovery tường minh. Lưu thêm local state không tạo được bảo đảm exactly-once cho một remote effect tùy ý.

Progress và terminal state dùng các commit riêng: `api.output()`, `api.details()` và `api.diagnostic()` stream progress có throttle vào `pi.live` trong execution. Ngược lại, result diagnostics và usage do `execute()` trả về chỉ được ghi trong terminal `pi.tool-result` Commit; Commit đó cũng cộng Tool usage vào `pi.usage`. Error bị throw trở thành error result cho model. Trả về `control.terminate` có thể kết thúc run, còn handoff yêu cầu reset; cả hai không làm thay đổi replay classification của side effect bên ngoài.

## Lập lịch inbox và reset context

Khi Conversation busy, Document `pi.inbox` làm cho ordering trở nên tường minh. `followUp` mặc định đợi final answer rồi bắt đầu run kế tiếp; `steer` đóng vai trò interrupt có kiểm soát chỉ sau Tool round hiện tại rồi tham gia run đang chạy; `reject` throw `ConversationBusy` và không ghi gì; `write` append Entry mà không gọi model. Follow-up mode và steering mode có thể đặt một hoặc tất cả item trong queue tại một boundary. Nếu run lỗi, item vẫn nằm trong inbox cho đến khi một submission sau đó đặt chúng theo thứ tự cũ nhất trước.

`Submission.abort()` rút mọi Submission còn trong queue, dù là input hay write; nó không thể thu hồi item đã được đặt. Ngược lại, `Conversation.abort()` chỉ rút queued input, nên queued write vẫn ở lại trong inbox. Host UI phải thể hiện các khác biệt này thay vì hiển thị mọi nút abort như cùng một thao tác.

`reset(handoff, context)` submit một Entry `pi.reset`. Model context bắt đầu từ marker đó và có thể nhận handoff như user message, nhưng Entry cũ vẫn nằm trong storage. Reset được queue lúc busy sẽ được đặt tại boundary; nếu được đặt trong Tool round, nó kết thúc run hiện tại.

## Compact mà không làm mất durable work

Compaction thay đổi model context chứ không thay đổi durable history. Nó tóm tắt các active Entry cũ thành head marker `pi.compaction` và vẫn giữ source Entry trong storage. `keepRecentTokens` ước lượng phần giữ nguyên văn, `reserveTokens` đặt blocking threshold bên dưới context window của model, còn `backgroundTokens` khởi động background work sớm hơn; đặt giá trị cuối thành zero chỉ tắt background compaction.

Nếu background compaction chưa xong tại threshold, generation chạy blocking compaction trước request. Usage cho summarization được cộng vào spend trong `pi.usage`.

Provider có thể báo context overflow. Recovery khi overflow có điều kiện: chỉ khi automatic compaction đang enabled, chưa có overflow compaction trước đó hoặc blocking compaction khác được ghi nhận, và tồn tại điểm cắt hợp lệ thì generation compact rồi retry đúng một lần; nếu không, nó ghi lại overflow và không retry. Retry boundary hẹp này không phải quyền replay side effect Tool đã hoàn tất.

`compact()` thủ công trả về Task ID. Summary chạy trong khi Conversation tiếp tục làm việc và được đặt ngay nếu idle hoặc tại turn boundary kế tiếp nếu busy. Nhiều summary đang chạy có thể thành `stale`, nên chỉ summary có điểm cắt hợp lệ được áp dụng. `beforeCompact` có thể từ chối compaction hoặc cung cấp summary; attempt đang chạy và retry backoff vẫn hiển thị trong `pi.live`.

## Quan sát view, event và hook

Dùng `viewState()` cho structural state đã commit và dispose attached state khi xong. Dùng `watch()` khi consumer phải nhận từng frame chính xác cùng các Chord operation của Commit đó theo thứ tự callback đã tuần tự hóa; nó bắt đầu từ view hiện tại và không replay frame cũ. Agent event adapter là **Experimental**: `watchEvents()` suy ra event kiểu coding-agent từ các Commit và bắt đầu bằng snapshot thay vì event-history log.

Cả hai stream đều có giới hạn. Structural watch chậm giữ tối đa 100 pending frame rồi thay chúng bằng một frame chứa newest full view; event stream chậm cũng phát snapshot mới sau 100 pending batch. Partial model output và Tool output được commit tối đa mỗi 100 ms, vì vậy crash có thể làm mất cửa sổ partial mới nhất dù các Commit trước đó vẫn hợp lệ.

Hook chạy trong phase đã định nghĩa của Task built-in, không phải global event bus. Generation hook bao phủ bước chuẩn bị request, response, final yield và Tool round đã hoàn tất; Tool hook có thể block hoặc sửa argument và thay result; compaction hook có thể từ chối hoặc cung cấp summary. Đăng ký hook với `scope: { conversationId }`, và chỉ thêm `subtree: true` khi hook scope cần gồm cả Conversation được sở hữu transitively bởi các Task của Conversation đó.

## Fork conversation và cấu trúc subagent

`fork(entryId, options, context)` tạo Conversation mới; fork đó có branch ancestry cho phép thấy Entry của parent đến hết Entry ID đã chọn. Child sau đó tiến triển độc lập và bắt đầu với setting của parent tại fork point. Entry scan có nhận biết fork sẽ đi theo ancestry này, vì vậy đừng copy visible transcript sang application log thứ hai như thể nó không có parent.

Tạo Conversation subagent bên trong Commit của Tool hoặc Task sở hữu nó rồi đặt `ownership: { kind: "task", taskId }`. Khi replay, hãy query theo owner trước khi tạo lại và cấp request ID ổn định cho child submission. Cách này làm cho child discovery, admission và recovery deterministic mà không cần in-memory map chưa commit.

Ownership có tính transitive: Conversation do child Task sở hữu thuộc cùng ordinary ownership scope. Conversation ownerless thay vào đó tham gia idle wait toàn Harness và cần lifecycle tường minh từ host.

## Chọn ownership foreground hoặc background

Conversation busy nghĩa là chỉ khi `pi.live.run` tồn tại; ownership và idle traversal không định nghĩa busy. Application Task có thể khiến một scope non-idle hoặc giữ Task owner ở trạng thái `completing` mà không làm Conversation busy.

Foreground owned work, khi do Task sở hữu, giữ owner ở trạng thái `completing` cho tới lúc join và tham gia ordinary idle traversal; work background bị loại khỏi ordinary idle traversal. Đây là structured concurrency: child foreground phải join trước khi Task owner thành terminal, còn Task background do Conversation sở hữu cho phép subtree nó sở hữu sống qua ordinary Conversation abort.

`background: true` chỉ hợp lệ với Task do Conversation sở hữu; child do Task sở hữu nếu dùng option này sẽ bị từ chối. Background xác định nơi ordinary abort và idle wait dừng lại; nó không phải ownership độc lập, và Task vẫn thuộc về Conversation của nó.

Task background là một abort boundary. Ordinary abort dừng non-background owned work, còn `abort(context, { background: true })` vượt qua cả background boundary đã tồn tại. Abort diễn ra từ dưới lên: các child Task mà traversal đi tới trở thành terminal và các scope Conversation được sở hữu trở thành idle trước khi abort handler của owner Task bắt đầu, để mỗi Task có thể undo effect của chính nó sau khi descendant dừng.

Dùng foreground ownership khi Tool phải trả lời bằng kết quả của child và failure cần cancel child. Dùng background anchor Task cho subagent hoặc reporter bền vững có lifecycle dài hơn một run. Host phải cung cấp stop operation riêng cho background work đó và wait nó khi shutdown cuối cùng.

## Theo dõi usage và chọn storage

`pi.usage` của mỗi Conversation ghi model total theo `provider/model` và total do Tool report theo tên Tool; attempt lỗi hoặc bị abort vẫn được tính. `harness.usage(context)` cộng usage đã commit trên toàn Session. Hãy coi cost hoặc spend limit là host policy: kiểm tra total đã commit rồi kiểm soát admission, thay vì cho rằng cancel ở provider sẽ xóa usage đã phát sinh.

`MemoryStorage` nhanh và deterministic nhưng mất mọi thứ khi process kết thúc; `openNodeSqliteStorage(file)` persist một database file và là lựa chọn Node đa dụng; `openNodeJsonlStorage(directory, context, options)` giữ các file append-only dễ inspect nhưng đòi hỏi quản lý lifecycle của directory. Cả ba cùng triển khai atomic storage contract, không có cùng failure durability.

Node SQLite dùng WAL với `synchronous = NORMAL`: Commit sống qua process crash, nhưng Commit mới nhất có thể mất khi power hoặc host failure. Node JSONL có thể dùng `fsync: true` để flush trước mỗi commit marker, đổi throughput lấy power-loss boundary mạnh hơn. Đây là property backend của release cụ thể, không phải bảo đảm database phổ quát.

Đúng một process sở hữu một storage tại một thời điểm; Durable không có cross-process locking. Đừng mở cùng SQLite file hoặc JSONL directory từ các worker cạnh tranh, dù SQLite có busy timeout riêng. Hãy dùng routing ở cấp process hoặc một service duy nhất sở hữu storage nếu nhiều client cần truy cập.

## Failure mode và checklist vận hành

Trước khi phục vụ traffic, hãy xác minh độ ổn định của `requestId`, review mọi khai báo Tool replay, truyền Chord `Context` cho mọi async call, await close khi shutdown và giữ đúng một process cho mỗi storage. Đồng thời test các trường hợp sau mà không phụ thuộc provider network:

- Dừng process sau admission, trong generation và trong Tool call; mở lại cùng backend, resume rồi quan sát Submission ban đầu.
- Chứng minh Tool unsafe tạo interrupted result, còn Tool safe dùng external idempotency key hoặc local transactional protocol.
- Cancel một wait và cho thấy Task vẫn chạy; sau đó abort riêng Submission, Task, foreground Conversation và background scope.
- Commit Entry, thay đổi Document và Task cùng nhau rồi xác minh observer không bao giờ thấy tổ hợp thiếu một phần.
- Retry một request ID ổn định và chứng minh nó trả về Submission đã có thay vì run thứ hai.
- Queue thao tác steer, follow-up, reject, write và reset khi busy rồi xác minh placement boundary.
- Ép threshold compaction và overflow compaction, tính summarization usage và giữ Entry cũ trong storage.
- Attach view/event consumer muộn hoặc chậm, xử lý replacement snapshot và dispose hoặc stop watcher.
- Restart khi thiếu hoặc có version Task mới hơn, inspect blocked work và cung cấp migration hoặc abort policy tường minh.
- Fork Conversation rồi xác minh history từ parent, setting cục bộ của fork và tiến triển độc lập.
- Abort foreground work lồng nhau rồi xác minh settlement từ dưới lên; chứng minh ordinary parent abort không vượt background Task boundary.
- Test kỳ vọng riêng của backend cho crash và power loss, bảo vệ filesystem permission, giữ backup khi cần và không bao giờ chia sẻ một storage giữa nhiều process.

Hãy log ID, Task kind, phase, outcome và retry decision, nhưng redact prompt content, Tool argument, credential và field Document có thể chứa secret. Durable transcript vẫn là dữ liệu ứng dụng nhạy cảm.

## Nguồn được ghim theo release

Source tại tag chính xác là nguồn chuẩn cho API và behavior trong hướng dẫn này. Các release page cung cấp lịch sử cho ba release đã giới thiệu rồi tinh chỉnh package; moving branch hoặc trang tài liệu không version không thể thay thế pinned code.

- [`packages/durable/README.md`](https://github.com/earendil-works/pi/blob/005af57d88ee23b33778f343a9595b32e67ff788/packages/durable/README.md)
- [`packages/durable/src/index.ts`](https://github.com/earendil-works/pi/blob/005af57d88ee23b33778f343a9595b32e67ff788/packages/durable/src/index.ts)
- [`packages/durable/src/harness/harness.ts`](https://github.com/earendil-works/pi/blob/005af57d88ee23b33778f343a9595b32e67ff788/packages/durable/src/harness/harness.ts)
- [`packages/durable/src/harness/types.ts`](https://github.com/earendil-works/pi/blob/005af57d88ee23b33778f343a9595b32e67ff788/packages/durable/src/harness/types.ts)
- [`packages/durable/src/tasks.ts`](https://github.com/earendil-works/pi/blob/005af57d88ee23b33778f343a9595b32e67ff788/packages/durable/src/tasks.ts)
- [`packages/durable/src/storage/memory.ts`](https://github.com/earendil-works/pi/blob/005af57d88ee23b33778f343a9595b32e67ff788/packages/durable/src/storage/memory.ts)
- [`packages/durable/src/storage/sqlite/node.ts`](https://github.com/earendil-works/pi/blob/005af57d88ee23b33778f343a9595b32e67ff788/packages/durable/src/storage/sqlite/node.ts)
- [`packages/durable/src/storage/jsonl/node.ts`](https://github.com/earendil-works/pi/blob/005af57d88ee23b33778f343a9595b32e67ff788/packages/durable/src/storage/jsonl/node.ts)
- [`packages/chord/src/context/index.ts`](https://github.com/earendil-works/pi/blob/005af57d88ee23b33778f343a9595b32e67ff788/packages/chord/src/context/index.ts)
- [`packages/durable/package.json`](https://github.com/earendil-works/pi/blob/005af57d88ee23b33778f343a9595b32e67ff788/packages/durable/package.json)
- [Release commit `005af57d88ee23b33778f343a9595b32e67ff788`](https://github.com/earendil-works/pi/commit/005af57d88ee23b33778f343a9595b32e67ff788)
- [Pi `v0.99.0` release](https://github.com/earendil-works/pi/releases/tag/v0.99.0)
- [Pi `v0.99.1` release](https://github.com/earendil-works/pi/releases/tag/v0.99.1)
- [Pi `v0.99.2` release](https://github.com/earendil-works/pi/releases/tag/v0.99.2)
