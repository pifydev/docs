---
title: Định tuyến request bằng Virtual Model
description: Đăng ký và vận hành Virtual Model của Pi 0.99.2 với dispatch, retry, state, context và accounting chính xác.
translation_key: how-to-route-virtual-models
language: vi
official_refs:
  - "https://github.com/earendil-works/pi/blob/005af57d88ee23b33778f343a9595b32e67ff788/packages/coding-agent/docs/virtual-models.md"
  - "https://github.com/earendil-works/pi/blob/005af57d88ee23b33778f343a9595b32e67ff788/packages/coding-agent/src/core/virtual-models.ts"
  - "https://github.com/earendil-works/pi/blob/005af57d88ee23b33778f343a9595b32e67ff788/packages/coding-agent/src/core/extensions/types.ts"
  - "https://github.com/earendil-works/pi/blob/005af57d88ee23b33778f343a9595b32e67ff788/packages/ai/src/models.ts"
  - "https://github.com/earendil-works/pi/blob/005af57d88ee23b33778f343a9595b32e67ff788/packages/coding-agent/CHANGELOG.md"
terms_used:
  - Virtual Model
  - ModelRouteReason
  - router state
  - physical model
  - classifier
status: reviewed
reviewed_by: Pify maintainers
last_updated: '2026-10-01'
---


Virtual Model là một entry có thể chọn trong catalog; router của nó chọn một physical chat model cho từng request. Cơ chế này phù hợp khi việc định tuyến cần dựa trên dạng task, cost, thinking level đã chọn hoặc state cục bộ của branch trong khi người dùng vẫn giữ nguyên một model selection. Hướng dẫn này trình bày contract vận hành của Pi `0.99.2`; router là policy do bạn chịu trách nhiệm, không phải bộ máy tự động biết model nào tốt nhất.

## Selection và dispatch

Cặp được chọn gồm virtual provider/model cùng virtual thinking level và luôn tách biệt với cặp dispatch theo từng request, vốn gồm physical provider/model cùng physical thinking level. Virtual thinking level là input của router policy; nó không nhất thiết bằng reasoning budget gửi tới physical model.

Pi lưu virtual selection trong các entry `model_change` và `thinking_level_change`. Selection hiện tại vẫn hiển thị qua `/model`, `ctx.model`, `ctx.thinkingLevel`, `PI_MODEL` và `PI_REASONING_LEVEL`, còn footer có thể hiển thị physical route hiện tại bên cạnh selection đó.

Provider request chỉ nhận physical model và thinking level đã dispatch; mọi assistant message do dispatch đó tạo ra đều ghi lại physical model qua các field `provider`, `api`, `model` và `thinkingLevel`. Virtual catalog entry không bao giờ tới provider. Tuy nhiên, nếu routing thất bại trước dispatch thì error assistant message vẫn giữ virtual model. Sự tách biệt này giúp replay qua nhiều physical model hoạt động giống như khi đổi model tường minh, đồng thời biến transcript thành audit trail của các dispatch thực tế.

## Đăng ký Virtual Model

Đăng ký từ extension bằng `registerVirtualModel`. Ví dụ sau được đồng bộ với phần Virtual Model trong contract fixture của Pi `0.99.2` đã được compile-check:

```typescript
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

type RouterState = {
  phase: "plan" | "build";
};

export default function (pi: ExtensionAPI): void {
  pi.registerVirtualModel<RouterState>({
    provider: "router",
    id: "auto",
    name: "Auto",
    thinkingLevels: ["low", "high"],
    route(request, ctx) {
      const sticky = request.failed ?? request.previous;
      if (request.reason !== "user" && sticky) {
        return {
          model: sticky.model,
          thinkingLevel: sticky.thinkingLevel ?? "medium",
          state: request.state,
        };
      }

      const model = ctx.modelRegistry.find("openai", "gpt-6.1-sol");
      if (!model) {
        throw new Error("openai/gpt-6.1-sol is unavailable");
      }
      const state: RouterState = request.state ?? { phase: "plan" };
      return { model, thinkingLevel: "medium", state };
    },
  });
}
```

Các registration field quyết định cả cách hiển thị trong catalog lẫn routing behavior:

| Field | Ý nghĩa vận hành |
| --- | --- |
| `provider`, `id`, `name` | Vị trí entry được liệt kê và định danh. `id` không được trùng với physical chat model thuộc provider đó; nếu catalog về sau xuất hiện physical model trùng ID thì virtual entry sẽ che nó. |
| `thinkingLevels` | Các level dành cho virtual selection; mặc định là `['off']`. |
| `contextWindow`, `maxTokens` | Giới hạn tạm dùng để hiển thị trước khi có physical response; nếu bỏ trống thì giới hạn chưa biết. |
| `input` | Các input được quảng bá ở selection; mặc định là text và image. Physical model được route nhưng không hỗ trợ image sẽ nhận placeholder. |
| `route(request, ctx)` | Public extension callback trả về physical `model`, `thinkingLevel` của nó và router `state` tùy chọn. Callback có thể là async. |

Dùng `ctx.modelRegistry.find(provider, id)` để lookup physical chat model trong catalog snapshot hiện tại và xử lý `undefined` một cách tường minh. Model trả về phải là physical và provider của nó phải có credential sử dụng được: route từ một Virtual Model sang Virtual Model khác là không hợp lệ. `provider` có thể là một ID độc lập hoặc provider đồng thời sở hữu physical model; nếu provider thật tồn tại thì availability đi theo authentication của provider đó.

Registration được queue trong lúc extension load ban đầu; sau đó nó có hiệu lực ngay, theo behavior register provider và reload. Đăng ký lại cùng `provider` và `id` sẽ thay thế definition. `pi.unregisterVirtualModel(provider, id)` xóa nó; `pi.unregisterProvider()` thì không. SDK integration có thể gọi trực tiếp `modelRuntime.registerVirtualModel(definition)`.

## Định tuyến request user, continuation, retry và direct

Callback `route` chạy trước mỗi request thông qua Virtual Model đang được chọn. `request.reason` có type union `ModelRouteReason` với đúng bốn giá trị:

| Reason | Thời điểm Pi route |
| --- | --- |
| `user` | Request đầu tiên sau prompt, steering message hoặc follow-up do người dùng viết. |
| `continuation` | Request khác bên trong agent loop, gồm request sau Tool result hoặc extension message. |
| `retry` | Automatic retry sau physical request thất bại, gồm retry sau compaction vì context overflow. |
| `direct` | Công việc ngoài agent loop, chẳng hạn compaction summary hoặc extension gọi `ctx.modelRegistry.streamSimple()`. |

Request còn cung cấp virtual `model` và `thinkingLevel` đang được chọn, conversation `messages` gồm cả system message, abort `signal` và các routing field mô tả bên dưới. Pi điều chỉnh thinking level trả về thành một giá trị mà physical model hỗ trợ.

## Giữ đúng sticky turn và retry

Với `continuation`, thông thường hãy trả về `request.previous`: physical model và thinking level của successful response gần nhất vẫn được thể hiện trong `messages`. Với `retry`, thông thường hãy trả về `request.failed`: physical model, thinking level và assistant `message` của request thất bại; message đó không còn nằm trong `messages`, nhưng có `stopReason` và `errorMessage`. Nếu chính routing thất bại thì không có `request.failed`.

Khi cả hai candidate cùng tồn tại, `request.failed` có precedence cao hơn `request.previous`, như trong `request.failed ?? request.previous`. Giữ continuation trên `request.previous` và retry trên `request.failed` giúp bảo toàn provider prompt cache và thinking signature. Bạn vẫn có thể chủ ý đổi model ở các boundary này, chẳng hạn sau overload hoặc context overflow, nhưng việc đó có thể làm mất prompt cache hoặc phá vỡ thinking continuity riêng của provider.

## Duy trì JSON router state

Router state phải JSON-serializable; Pi lưu nó trên session branch để fork kế thừa state tại fork point, state sống qua compaction, và Pi lưu object đã đổi trước dispatch ngay cả khi request lỗi sau đó; chỉ return object mới khi logical state thật sự thay đổi để tránh transcript churn không cần thiết. Pi truyền giá trị gần nhất trở lại qua `request.state`. Return `undefined` hoặc chính object `request.state` sẽ giữ state đã lưu thay vì append một bản thay thế tương đương.

Direct request không có router state, vì vậy `request.state` vắng mặt và state được return cũng bị bỏ qua. Direct work không được làm tiến triển phase machine vốn thuộc agent loop.

Chỉ dùng state cho quyết định mà transcript chưa ghi lại, chẳng hạn classification đã cache hoặc transition một chiều từ `plan` sang `build`. Transcript vốn đã ghi virtual selection và từng physical dispatch; extension đọc được cả hai qua `ctx.sessionManager.getBranch()`.

## Khôi phục session và branch

Khi resume, Pi khôi phục virtual selection đã đăng ký từ entry `model_change` mới nhất dù các assistant message sau đó mang tên physical model. Điều hướng branch và fork khôi phục router state gắn với chính branch đó, nên hai branch có thể tiến triển độc lập.

Nếu Virtual Model đã chọn không còn được đăng ký, Pi không thể khôi phục virtual entry đó và thông thường fallback về model của successful physical response gần nhất. Tuy nhiên, trong implementation `0.99.2` đã ghim, `getBranchSelection()` chọn non-virtual assistant entry gần nhất mà không filter `stopReason`, nên physical response `error` hoặc `aborted` xuất hiện sau đó có thể trở thành fallback; message của routing thất bại vẫn là virtual nên bị bỏ qua. Hãy đăng ký lại các giá trị `provider` và `id` ổn định trước khi resume session phụ thuộc vào chúng.

## Tính context, compaction và cost

Trước khi có successful physical response, context limit hiển thị lấy từ `contextWindow` và `maxTokens` tùy chọn của Virtual Model; sau khi có physical response, context usage đi theo giới hạn của successful physical model gần nhất, kể cả khi response đó có trước lúc chọn Virtual Model. Routing vẫn chạy cho từng request, và Pi kiểm tra compaction theo physical model được chọn cho dispatch đó; nếu context window quá nhỏ, Pi compact trước khi gửi mà không thay đổi lựa chọn của router.

Usage và cost thuộc về từng physical model được dispatch, không thuộc virtual catalog entry có zero cost; Context accounting đi theo giới hạn physical response sau successful response đầu tiên; Compaction được kiểm tra lại theo physical model được chọn cho từng dispatch. Vì vậy `/session` báo cost theo từng physical model, gồm cả routed call và retry.

## Dùng classifier và image operation có chủ đích

Router có thể dùng `ctx.modelRegistry.findOfType('classifier', provider, id)` và `ctx.modelRegistry.classify()` để classify structured state trước khi chọn chat model. Operation bổ sung này có thể cải thiện input của policy nhưng làm tăng latency trước first token của routed chat model; hãy cache kết quả trong `request.state` nếu phạm vi quyết định kéo dài qua nhiều request.

Classifier và image generation là các operation riêng của `ModelRuntime`, không phải chat model. Hãy dùng typed accessor như `getModelsOfType()`, `getModelOfType()` hoặc `getAvailableOfType()`, rồi gọi `classify()` hoặc `generateImages()`; `getModels()` và `getModel()` là accessor chỉ dành cho chat. `getAllModels()` và `getAllAvailable()` chủ ý bao quát cả chat, image và classifier entry. Vì vậy một upstream ID có thể định danh nhiều entry cho các operation khác nhau; đừng dispatch image hoặc classifier entry như physical chat result của `route`.

## Failure mode và checklist vận hành

Pi không bảo đảm router tạo ra lựa chọn tối ưu; Pi thực thi dispatch contract, còn chất lượng ranking, latency, cost policy, fallback order và evaluation thuộc trách nhiệm của extension author.

Request kết thúc bằng error response nếu `route()` throw, return result không hợp lệ, return một Virtual Model khác hoặc chọn physical provider không có credential. Hãy coi lookup thất bại là routing error thay vì dùng non-null assertion; đồng thời dự kiến context window quá nhỏ của model đã chọn sẽ kích hoạt compaction chứ không tự động reroute.

Trước khi deploy router:

- Xác minh mỗi target là physical chat model có credential trong từng environment.
- Xử lý cả bốn giá trị `ModelRouteReason`, đồng thời giữ sticky continuation và retry trừ khi policy đã đo lường cho thấy cần đổi.
- Giữ state nhỏ, JSON-serializable, branch-local và ổn định khi không đổi; không phụ thuộc vào state từ `direct` work.
- Kiểm thử resume khi Virtual Model có đăng ký lẫn khi vắng mặt, cùng việc điều hướng fork trước và sau compaction.
- Quy context, token và cost cho physical dispatch thực tế; đo riêng classifier latency.
- Kiểm thử callback throw, model thiếu trong catalog, thiếu credential, return Virtual Model không hợp lệ, abort, context overflow và retry fallback.

## Nguồn được ghim theo release

Hướng dẫn này được ghim tại release commit [`005af57d88ee23b33778f343a9595b32e67ff788`](https://github.com/earendil-works/pi/commit/005af57d88ee23b33778f343a9595b32e67ff788):

- [`packages/coding-agent/docs/virtual-models.md`](https://github.com/earendil-works/pi/blob/005af57d88ee23b33778f343a9595b32e67ff788/packages/coding-agent/docs/virtual-models.md)
- [`packages/coding-agent/src/core/virtual-models.ts`](https://github.com/earendil-works/pi/blob/005af57d88ee23b33778f343a9595b32e67ff788/packages/coding-agent/src/core/virtual-models.ts)
- [`packages/coding-agent/src/core/extensions/types.ts`](https://github.com/earendil-works/pi/blob/005af57d88ee23b33778f343a9595b32e67ff788/packages/coding-agent/src/core/extensions/types.ts)
- [`packages/ai/src/models.ts`](https://github.com/earendil-works/pi/blob/005af57d88ee23b33778f343a9595b32e67ff788/packages/ai/src/models.ts)
- [`packages/coding-agent/CHANGELOG.md`](https://github.com/earendil-works/pi/blob/005af57d88ee23b33778f343a9595b32e67ff788/packages/coding-agent/CHANGELOG.md)

Lịch sử release: [`v0.99.0`](https://github.com/earendil-works/pi/releases/tag/v0.99.0), [`v0.99.1`](https://github.com/earendil-works/pi/releases/tag/v0.99.1) và [`v0.99.2`](https://github.com/earendil-works/pi/releases/tag/v0.99.2).
