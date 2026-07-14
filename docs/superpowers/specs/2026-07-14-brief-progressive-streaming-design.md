# 晨间简报渐进式流式渲染设计

> 续作于 [2026-07-13 首页实时简报流式传输](../plans/2026-07-13-homepage-realtime-brief-streaming.md)。
> 前作只流式 `summary`，actions/futureSuggestions 在 `brief.completed` 一次性传输；本设计把它们也改成渐进式出现。

## 问题

当前 `summary` 能逐字流式，但卡片（actions）与预测（futureSuggestions）必须等 LLM 输出完整 JSON、终态校验通过后才在 `brief.completed` 一次性渲染。用户感知到"首段打完字 → 长时间空白 → 卡片和预测同时蹦出来"，空白期无反馈、两块内容同时出现缺乏节奏感。

根因贯穿全栈：`StreamingSummaryExtractor` 只配 `paths: ['$.summary']`，actions/futureSuggestions 的 token 被忽略；`BriefStreamEvent` 只有 `brief.summary.delta` 一种 delta；前端 store 只存 `draftSummary`；`page.tsx` 的 actions/futureSuggestions 始终来自 React Query cache（注释明确"终态后原子替换"）。

## 目标

1. 保持 `summary` 的 token 级逐字流式（现状不变）。
2. 卡片区域在 summary 流式期间就显示 Skeleton 占位；每张 action 卡片在 JSON 中解析完整后**立刻**渲染，不再等全部完成。
3. 卡片全部就绪后，预测区域显示 Skeleton；每条预测的结构化字段（timePoint/action）解析完整后立刻渲染，其核心说明文本（predictedState + rationale）用**前端打字机动画**逐字 reveal，营造与 summary 一致的阅读节奏。
4. 协议层保持简洁：卡片与预测在协议上对称（都是"元素就绪"事件），打字机是预测组件的内部行为，不污染协议。

## 非目标

- **不做后端 token 级结构化流式**。预测的逐字效果由前端打字机实现，后端只推"元素就绪"。理由：futureSuggestion 的说明文本是短文本，真 token 流式与打字机的体验差异极小，但后端提取器/协议/前端累积的复杂度差异巨大；打字机把复杂度隔离在前端组件内。
- 不改变 LLM prompt 的字段顺序（仍 `summary → actions → futureSuggestions`）。渐进式体验依赖此顺序，prompt 已约束、JSON 字段天然保持插入序，前提可靠。
- 不改 `/ai/morning-brief`（JSON 端点）、不改 fallback/cache 路径、不改 abort 机制、不改 SseWriter 协议契约（started → delta* → 终态唯一）。
- 不做预测区"逐字"以外的动画（不做 fade-in、不做 height collapse）；卡片区不做逐张入场动画。

## 关键假设与风险

- **LLM 按字段顺序输出 JSON**：prompt 约束 `summary → actions → futureSuggestions`，JSON 序列化保持插入序，GPT 类模型几乎总是遵守。若偶发乱序，提取器按到达顺序释放元素，前端按 index 容器化放置，视觉上仍正确（只是出现顺序可能不严格自上而下），不影响正确性。
- **streamparser 数组元素就绪回调**：`@streamparser/json` 的 `paths` 是否支持 `$.actions[*]`、`$.futureSuggestions[*]` 并在每个元素完整解析时触发 `onValue`（key 为数组 index），需在实现阶段用探针验证。若不支持 `[*]`，退化方案：监听 `$.actions` / `$.futureSuggestions` 整个数组的 partial value，自行 diff 出新增完整元素。本设计以"`[*]` 可用"为基线，diff 方案为兜底。
- **stream 分支触发条件不变**：仍是 `HOMEPAGE_SUMMARY + onSummaryDelta`。route 层总是同时提供全部回调；结构提取器在 stream 分支内随 summary 提取器一起运行。

## 体验时间轴

```
T0  请求发出
T1  brief.started
    → summary 区：开始流式逐字（现状）
    → 卡片区：显示 Skeleton（固定 2 张占位，与 summary 流式并行）
    → 预测区：不渲染

T2  brief.summary.delta 持续到达
    → summary 区逐字增长；卡片区持续 Skeleton

T3  brief.action.ready { index:0, action }
    → 第 1 张卡片渲染（替换第 1 个 Skeleton 位），其余 Skeleton 保留

T4  更多 brief.action.ready 到达（index 递增）
    → 卡片逐张替换 Skeleton；若 LLM 生成 >2 张，超出部分追加到 Skeleton 之后

T5  brief.forecast.started
    → forecast.started 表示 actions 数组已闭合（JSON 顺序保证，不会再有新卡片）；
      卡片区剩余 Skeleton 纯为占位凑数，等待 completed 时移除
    → 预测区开始显示 Skeleton（固定 2 条占位）

T6  brief.future_suggestion.ready { index:0, suggestion }
    → 第 1 条预测渲染：timePoint 与 action 卡片立即显示；
      predictedState + rationale 开始打字机逐字 reveal
    → 第 1 条预测位替换 Skeleton，其余 Skeleton 保留

T7  更多 brief.future_suggestion.ready 到达
    → 预测逐条出现（每条独立打字机）

T8  brief.completed { response: 完整 envelope }
    → React Query cache 原子写入终态；store 清理全部 draft（summary/actions/forecast）
    → 打字机若未完成立即补全（显示完整文本）；Skeleton 移除
    → 最终由 effectiveData 驱动渲染（终态 = 真实张数/条数）
```

### Skeleton 张数策略

actions 与 futureSuggestions 的数组长度由 LLM 决定（actions 1-4，futureSuggestions 0-2），前端在流式期间无法预知最终数量。策略：

- 流式中 Skeleton 固定 **2 个占位**（对齐 prompt 示例的常见数量）。
- 元素就绪时按 index 替换对应 Skeleton 位；若就绪数 >2，超出部分追加在 Skeleton 之后。
- `brief.completed` 到达后由终态 envelope 驱动（Skeleton 全部移除，显示真实数量）。若 LLM 实际只生成 1 张，completed 时从 2 位缩为 1 张——这是"完成"信号，配合 draft 清理与 cache 原子替换，视觉上是即时对齐而非跳变。

## 协议事件设计

在现有 4 种事件（started / summary.delta / completed / failed）基础上新增 3 种。所有事件仍经 `BriefStreamEventSchema` 校验，SseWriter 的 exactly-one-terminal invariant 不变（只有 completed/failed 是终态）。

### 新增事件

```text
event: brief.action.ready
data: {"requestId":"req-1","index":0,"action":{...ActionOption}}

event: brief.forecast.started
data: {"requestId":"req-1"}

event: brief.future_suggestion.ready
data: {"requestId":"req-1","index":0,"suggestion":{...FutureSuggestion}}
```

- `brief.action.ready`：单个 action 元素在 JSON 中解析完整（对象闭合）时发。`index` 是数组下标（从 0 起，递增）。`action` 必须通过 `ActionOptionSchema`。
- `brief.forecast.started`：无 payload（只 requestId）。标记 LLM 输出进入 `futureSuggestions` 字段，前端据此把预测区从"不渲染"切到"Skeleton"。即使后续 LLM 输出空数组（`futureSuggestions: []`），此事件仍发（前端在 completed 时按终态修正）。
- `brief.future_suggestion.ready`：单个 futureSuggestion 元素完整时发。`suggestion` 必须通过 `FutureSuggestionSchema`。

### 事件顺序 invariant

```
started → summary.delta* → action.ready* → forecast.started → future_suggestion.ready* → (completed | failed)
```

- `forecast.started` 必须在所有 `action.ready` 之后、所有 `future_suggestion.ready` 之前。
- 任意元素就绪事件到达时 `completed`/`failed` 尚未发送。
- 校验在 `BriefStreamEventSchema` 层面是结构性的（字段类型）；顺序 invariant 由后端 route + 提取器保证，前端做防御性容错（乱序不崩，按 index 放置）。

### cache hit / fallback 的简化路径

- **cache hit**（`finishReason='cached'`）：不发任何 delta/ready/forecast 事件，直接 `started → completed`。前端无 Skeleton 流程，瞬时渲染终态。
- **fallback / 非 complete finishReason**：`started → failed`（按现有路由约定，fallback/timeout 不发 completed）。前端清 draft、显示错误或旧值。
- **provider 异常 / abort**：`started → failed`，同上。

### Schema 改动（packages/shared）

`types/brief-stream.ts` 与 `schemas/brief-stream.ts` 同步新增 3 个事件 interface + zod object，并入 `BriefStreamEvent` discriminated union 与 `BriefStreamEventSchema`。`ActionOptionSchema` / `FutureSuggestionSchema` 已存在于 `schemas/agent.ts`，直接复用。

## 后端提取器改造

### 新建 StreamingStructureExtractor

不修改已稳定的 `StreamingSummaryExtractor`（职责单一、已有充分的 streamparser 探针验证与 surrogate/fence 守卫）。新建 `packages/agent-core/src/output/streaming-structure-extractor.ts`，专注 actions/futureSuggestions 元素就绪与阶段切换。

**职责**：
- 内部一个 `JSONParser` 实例，`paths` 配置覆盖 `$.actions[*]` 与 `$.futureSuggestions[*]`（基线）或 `$.actions` / `$.futureSuggestions`（diff 兜底），实现时探针决定。
- `push(chunk)` 返回结构化信号数组：
  ```typescript
  type StructureSignal =
    | { kind: 'action'; index: number; action: ActionOption }
    | { kind: 'forecastStarted' }
    | { kind: 'suggestion'; index: number; suggestion: FutureSuggestion };
  ```
- 每个 LLM chunk 喂入后，解析出的完整元素与阶段切换以信号形式释放。
- `forecastStarted` 在检测到 `futureSuggestions` 字段开始解析时释放一次（去重：只释放一次）。
- 不做 `ActionOptionSchema`/`FutureSuggestionSchema` 的完整 zod 校验（那是终态 parser 的职责），只做最小结构判断（对象闭合、必要字段存在），把完整校验留给 `parseAgentResponse`。理由：流式期校验失败无法回退已发事件，且 streamparser 已保证 JSON 结构合法。单元素的业务级校验在 route 层做（见下文"错误、兜底与边界"）。
- 复用 `StreamingSummaryExtractor` 的两个关键守卫：
  - **surrogate pair 安全**：chunk 边界切断 UTF-16 surrogate pair 会破坏 streamparser，需同样的 `pendingSurrogateTail` 缓冲。
  - **markdown fence 检测**：前导 `` ` `` 抛错（与 summary 提取器一致）。
  这两个守卫逻辑应抽到一个共享 helper（如 `chunk-safety.ts`），避免两个提取器各写一份漂移。

### obtainRawOutput stream 分支扩展

`agent-runtime.ts` 的 stream 分支当前只跑 summary 提取器。改为同时跑两个：

```typescript
const summaryExtractor = new StreamingSummaryExtractor();
const structureExtractor = new StreamingStructureExtractor();
// 每个 chunk:
const summaryDeltas = summaryExtractor.push(chunk.content);
const structureSignals = structureExtractor.push(chunk.content);
for (const delta of summaryDeltas) await onSummaryDelta(delta);
for (const signal of structureSignals) {
  if (signal.kind === 'action') await onActionReady?.(signal.index, signal.action);
  else if (signal.kind === 'forecastStarted') await onForecastStarted?.();
  else await onFutureSuggestionReady?.(signal.index, signal.suggestion);
}
```

两个提取器独立实例、独立 parser，每个 chunk 喂两次。JSONParser 轻量，双解析成本可接受；换得提取器职责分离、可独立测试。

### AgentExecutionOptions 扩展

```typescript
export interface AgentExecutionOptions {
  signal?: AbortSignal;
  onSummaryDelta?: (delta: string) => void | Promise<void>;
  onActionReady?: (index: number, action: ActionOption) => void | Promise<void>;
  onForecastStarted?: () => void | Promise<void>;
  onFutureSuggestionReady?: (index: number, suggestion: FutureSuggestion) => void | Promise<void>;
}
```

所有新回调可选。stream 分支触发条件不变（`HOMEPAGE_SUMMARY + onSummaryDelta`）。**当且仅当至少一个结构回调（`onActionReady`/`onForecastStarted`/`onFutureSuggestionReady`）提供时，才构造 `StreamingStructureExtractor` 并对每个 chunk 双解析**；三者全缺则只跑 summary 提取器（省一次解析，等价于当前行为）。route 层总是同时提供全部回调，故实际运行总是双解析。

### AiOrchestrator + route 透传

`AiOrchestrator.execute` 的 options 透传新增三个回调到 `runtime.execute`。route handler（`apps/agent-api/src/modules/ai/routes.ts` 的 `/ai/morning-brief/stream`）在 `orchestrator.execute` 调用处增加：

```typescript
onActionReady: async (index, action) => {
  if (!writer.isClosed) {
    await writer.writeEvent({ type: 'brief.action.ready', requestId, index, action });
  }
},
onForecastStarted: async () => {
  if (!writer.isClosed) {
    await writer.writeEvent({ type: 'brief.forecast.started', requestId });
  }
},
onFutureSuggestionReady: async (index, suggestion) => {
  if (!writer.isClosed) {
    await writer.writeEvent({ type: 'brief.future_suggestion.ready', requestId, index, suggestion });
  }
},
```

与现有 `onSummaryDelta` 完全对称：writer 未关闭才写、await 传 backpressure。

## 前端改造

### brief-stream store 扩展

`BriefStreamEntry` 增加字段：

```typescript
export interface BriefStreamEntry {
  requestId: string;
  phase: BriefStreamPhase;
  draftSummary: string;                          // 已有
  draftActions: ActionOption[];                  // 新增：按 index 顺序累积
  forecastStarted: boolean;                      // 新增：收到 forecast.started
  draftFutureSuggestions: FutureSuggestion[];    // 新增
}
```

新增方法：
- `appendAction(profileId, requestId, index, action)`：按 index 放入 `draftActions[index]`（覆盖式，防御重复/乱序）。
- `markForecastStarted(profileId, requestId)`：置 `forecastStarted = true`。
- `appendFutureSuggestion(profileId, requestId, index, suggestion)`：同 appendAction。

`begin` 初始化新字段（空数组 / false）。`complete` / `fail` 清理整个 entry（已有逻辑，无需改——entry 整体移除）。

`append*` 方法仍做 requestId 守护（stale 拒绝），与现有 `append` 一致。

### use-ai-query 事件分发

`runBriefStream` 的 `onEvent` 增加 3 个分支：

```typescript
onEvent: (event) => {
  const store = useBriefStreamStore.getState();
  switch (event.type) {
    case 'brief.summary.delta':
      store.append(profileId, requestId, event.delta);
      break;
    case 'brief.action.ready':
      store.appendAction(profileId, requestId, event.index, event.action);
      break;
    case 'brief.forecast.started':
      store.markForecastStarted(profileId, requestId);
      break;
    case 'brief.future_suggestion.ready':
      store.appendFutureSuggestion(profileId, requestId, event.index, event.suggestion);
      break;
    // started/completed/failed 仍由外层处理
  }
},
```

### page.tsx 渲染逻辑

阶段与渲染数据推导（从 store entry 推导，无显式状态机字段）：

```typescript
const draftEntry = useBriefStreamStore((s) => s.entries[profileId]);
const isStreaming = draftEntry?.phase === 'streaming';

// summary（现状不变）
const displayedSummary = draftEntry?.draftSummary || effectiveData?.summary || '';

// actions：流式中用 draft，否则用终态
const actions = isStreaming && draftEntry
  ? draftEntry.draftActions
  : (effectiveData?.actions ?? []);

// futureSuggestions：流式中用 draft，否则用终态
const futureSuggestions = isStreaming && draftEntry
  ? draftEntry.draftFutureSuggestions
  : (effectiveData?.futureSuggestions ?? []);

// 预测区是否进入 Skeleton（forecast.started 已到 + 还在流式）
const forecastVisible = isStreaming && draftEntry?.forecastStarted;
```

**卡片区渲染**（新增 Skeleton 逻辑）：
- 流式中：渲染 `draftActions` 的真实卡片，补足到 2 个 Skeleton 位（即 `max(2, draftActions.length)` 个位置，前 N 个是真实卡片，后 `max(0, 2 - N)` 个是 Skeleton）。
- 非流式：只渲染 `effectiveData.actions`（终态真实数量，无 Skeleton）。

**预测区渲染**：
- `!forecastVisible && !futureSuggestions.length`：不渲染预测区。
- `forecastVisible`：渲染预测容器，内含真实 `draftFutureSuggestions`（每条 FutureTimelineBlock）+ 补足到 2 个 Skeleton 位。
- 非流式：只渲染 `effectiveData.futureSuggestions`（终态，无 Skeleton）。

### FutureTimelineBlock 打字机

组件新增打字机能力（不影响现有"一次性渲染完整 suggestion"的用法，新增 `animate` prop 控制）：

```typescript
export interface FutureTimelineBlockProps {
  suggestion: FutureSuggestion;
  /** 是否启用打字机逐字 reveal（predictedState + rationale） */
  animate?: boolean;
  /** 流是否已结束（completed/非流式）——true 时立即显示全文 */
  done?: boolean;
}
```

行为：
- `animate=false` 或 `done=true`：直接显示完整 predictedState + rationale（现状）。
- `animate=true && !done`：
  - timePoint、action 卡片立即完整显示（结构化字段不打字机）。
  - predictedState 与 rationale 各自从空字符串开始，按定时器（约 25-35ms/字符，实现时定）逐字追加。
  - 定时器在组件卸载或 `done` 变 true 时清除并立即补全全文。
- 打字机是纯前端 `setInterval`/`requestAnimationFrame`，不依赖后端事件。

page.tsx 调用处：流式中 `animate={true} done={false}`，completed 后（非流式分支）`animate={false}` 或 `done={true}`。

**关键**：completed 到达时 store 清理 entry，`isStreaming` 变 false，组件切到"终态分支"，`done={true}` 让正在打的字立即补全。这保证流结束瞬间不会出现"打了一半的文本卡住"。

### 新增 Skeleton 组件

卡片 Skeleton（`ActionCardSkeleton` 或在卡片区内联）：复用现有设计系统的灰色占位条（参考 `BriefTimeline` 的 isLoading skeleton 风格），尺寸近似真实卡片（emoji 圆圈 + 标题条 + 描述条）。

预测 Skeleton（`FutureTimelineBlockSkeleton`）：近似真实预测块（时间点标签 + 两行文本条）。

## 错误、兜底与边界

- **LLM 输出畸形 JSON**：StreamingStructureExtractor 遇到解析异常应吞掉（不抛），已释放的 action/suggestion 保留在 draft；summary 提取器仍按现有契约可能抛 `StreamingSummaryParseError`，runtime 走 fallback 路径，route 发 `brief.failed`，前端清 draft 显示错误。结构提取器的错误不污染 summary 提取器（独立实例）。
- **单元素业务校验**：route 层的 `onActionReady`/`onFutureSuggestionReady` 在构造 SSE 事件前，对 action/suggestion 各做一次 `ActionOptionSchema.safeParse`/`FutureSuggestionSchema.safeParse`，失败则跳过该事件（不写给 writer、记一条 warn 日志），流不中断。这保证 SseWriter 的 `BriefStreamEventSchema.safeParse` 不会因嵌套对象字段非法而抛错。跨字段的终态约束（如 action.id 与 futureSuggestions.action.id 不得重复）仍由 `parseAgentResponse` 在 completed 前统一校验，失败处理见下条。
- **元素就绪后终态校验失败**：已发的 `action.ready`/`future_suggestion.ready` 无法撤回。route 在终态校验失败时仍发 `brief.failed`，前端清 draft（连同已就绪的卡片/预测一起清），显示错误。这与 summary 流式后失败的语义一致（provisional 数据不保证成为终态）。
- **LLM 不生成 futureSuggestions**：`forecast.started` 不发，预测区永不渲染。终态 envelope 的 futureSuggestions 为空/缺省，正确。
- **LLM 生成空数组 `futureSuggestions: []`**：streamparser 触及字段但无元素。`forecast.started` 发（预测区显示 Skeleton），无 `future_suggestion.ready`。completed 到达时终态无预测，store 清理，预测区消失。短暂 Skeleton 闪烁可接受（或前端在 completed 后用 CSS transition 平滑移除）。
- **断连/abort**：现有 abortController 机制不变。已就绪的卡片/预测保留在 draft（store 未 complete/fail 时不清理），用户看到部分内容。React Query cache 仍是旧值。
- **快速连点/profile 切换**：store 的 requestId 守护对 `appendAction`/`markForecastStarted`/`appendFutureSuggestion` 同样生效，stale 事件不覆盖新 entry。

## 测试策略

### 后端单元（agent-core）

- `StreamingStructureExtractor`：
  - 喂入完整的 actions+futureSuggestions JSON 流（单 chunk 与多 chunk 切分），验证释放的信号序列（action × N → forecastStarted → suggestion × M）。
  - index 递增、元素结构正确。
  - surrogate pair 跨 chunk 边界（复用 summary 提取器的测试矩阵）。
  - markdown fence 前导抛错。
  - 畸形 JSON 中途：已释放信号保留，不抛（吞错）。
  - futureSuggestions 缺省 / 空数组两种场景的 forecastStarted 行为。
- `obtainRawOutput` stream 分支：模拟 LLM token 流，验证 summary delta + structure 信号都正确释放、backpressure await 生效。
- `AgentExecutionOptions` 新回调的可选性（缺失不崩）。

### 后端集成（agent-api）

- `/ai/morning-brief/stream` 全流程：started → summary.delta+ → action.ready+ → forecast.started → future_suggestion.ready+ → completed，事件顺序符合 invariant。
- cache hit：started → completed（无中间事件）。
- fallback：started → failed。
- 终态校验失败（mock parser 抛错）：started → (已发的 action.ready) → failed，前端语义。
- BriefStreamEventSchema 对 3 种新事件的校验（合法通过、缺字段拒绝、action/suggestion 结构非法拒绝）。
- 断连：已有测试不变，验证 action.ready 已发后断连不重复发 completed。

### 前端单元（web）

- `brief-stream.store`：
  - `appendAction` 按 index 放置（乱序到达也正确）。
  - `markForecastStarted` 幂等。
  - requestId 守卫（stale 拒绝）。
  - `begin` 初始化新字段；`complete`/`fail` 清理。
- `use-ai-query` 的 `onEvent` 分发：4 种事件各走正确 store 方法。
- `page.tsx` 渲染推导：各阶段（summary 流式 / actions 渐进 / forecast Skeleton / 预测渐进 / completed）的 actions/futureSuggestions/forecastVisible 取值。
- `FutureTimelineBlock` 打字机：animate=true 逐字增长、done=true 立即补全、卸载清定时器。

### 前端 E2E（Playwright）

- 首页流式：summary 逐字 → 卡片逐张替换 Skeleton → 预测 Skeleton → 预测打字机 → completed 全量。
- 断连：部分内容可见，不崩。

## 改动文件清单（预估）

**packages/shared**
- `src/types/brief-stream.ts`：3 个新事件 interface + union 扩展
- `src/schemas/brief-stream.ts`：3 个新 zod object + discriminatedUnion 扩展

**packages/agent-core**
- `src/output/streaming-structure-extractor.ts`：**新建**
- `src/output/chunk-safety.ts`：**新建**（抽 surrogate + fence 守卫，供两个提取器复用）
- `src/output/streaming-summary-extractor.ts`：改为复用 chunk-safety（最小改动）
- `src/runtime/agent-runtime.ts`：stream 分支双提取器、AgentExecutionOptions 扩展

**apps/agent-api**
- `src/modules/ai/routes.ts`：stream route 新增 3 个回调透传
- `src/services/ai-orchestrator.ts`：options 透传

**apps/web**
- `src/stores/brief-stream.store.ts`：entry 扩展 + 3 个新方法
- `src/hooks/use-ai-query.ts`：onEvent 分发扩展
- `src/app/page.tsx`：渲染推导 + Skeleton 逻辑
- `src/components/homepage/FutureTimelineBlock.tsx`：打字机
- `src/components/homepage/ActionCardSkeleton.tsx`：**新建**（或内联在 page.tsx）
- `src/components/homepage/FutureTimelineBlockSkeleton.tsx`：**新建**（或内联）

**测试**
- 上述各层对应测试文件
