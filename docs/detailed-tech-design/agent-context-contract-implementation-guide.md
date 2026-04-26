# Agent 上下文契约优化实施指南

## 1. 文档定位

本文档面向准备接手 Agent 上下文优化的初级工程师，目标是把上一轮「上下文契约」审查意见转成可以逐步落地的工程任务。

这不是一份新的产品需求，也不是 prompt 文案优化清单。它要解决的问题是：

- Agent 在回答前到底看到了哪些事实；
- 哪些事实可以被引用，哪些只能作为背景；
- 缺失数据应该如何进入 prompt；
- 当前页面和图表如何变成可靠上下文；
- evidence scorer 如何知道输出是否有证据来源；
- profile 切换时 memory 如何避免串用。

本次优化的核心方向是建立稳定的 task-specific context contract。也就是说，先用代码生成结构化上下文包，再由 prompt builder 渲染成自然语言 prompt。

配套阅读：

- `docs/detailed-tech-design/agent-optimization-guidelines.md`
- `docs/detailed-tech-design/agent-quality-evaluation-design.md`
- `docs/ops/agent-eval-baseline-runbook.md`
- `docs/INDEX.md`

## 2. 背景问题

当前主链路大致是：

```text
executeAgent()
  -> buildAgentContext()
  -> evaluateRules()
  -> buildSystemPrompt()
  -> buildTaskPrompt()
  -> HealthAgent.invoke()
  -> parseAgentResponse()
  -> validateChartTokens()
  -> cleanSafetyIssues()
  -> write memory
```

现在的 `buildTaskPrompt()` 直接拼接自然语言 section，例如：

- `## 数据窗口`
- `## 最近发生的事件`
- `## 过去24小时状态`
- `## 核心指标概览`
- `## 预处理信号`
- `## 对话历史`

这些 section 有一定帮助，但它们不是稳定契约。LLM 不知道哪些字段是必须引用的事实，哪些是缺失数据，哪些来自当前页面，哪些可以被 scorer 追溯验证。

本次不要通过继续堆 prompt 文案解决问题。正确方向是新增一个结构化中间层：

```text
AgentContext
  + RuleEvaluationResult
  -> TaskContextPacket
  -> renderTaskContextPacket()
  -> buildTaskPrompt()
```

`TaskContextPacket` 是本轮优化的核心产物。

## 3. 实施总目标

完成后，Agent prompt 中应该稳定包含以下信息：

| 类型 | 作用 |
|------|------|
| `task` | 说明当前任务、页面、tab、timeframe、用户问题 |
| `userContext` | 说明用户 profile、tags、baseline |
| `dataWindow` | 说明数据窗口、记录数、数据完整度 |
| `missingData` | 说明缺什么、缺在哪、影响什么、必须如何披露 |
| `evidence` | 给每个可验证事实分配 id、来源和 derivation |
| `visibleCharts` | 把当前可见 tab 转成真实 chart token 和数据摘要 |
| `homepage` | 首页晨报专用事实包 |
| `viewSummary` | Data Center 视图总结专用事实包 |
| `advisorChat` | Advisor Chat 专用问题意图和相关事实 |

完成后，prompt builder 不应该再在多个位置临时计算指标摘要。指标摘要、缺失数据、chart token、证据来源都应该先在 packet builder 中统一生成。

## 4. 推荐文件拆分

建议新增或调整以下文件。

| 文件 | 责任 |
|------|------|
| `packages/agent-core/src/context/context-packet.ts` | 定义 `TaskContextPacket` 相关类型 |
| `packages/agent-core/src/context/context-packet-builder.ts` | 对外入口 `buildTaskContextPacket()` |
| `packages/agent-core/src/context/metric-summary.ts` | 指标序列、均值、趋势、异常点、完整度计算 |
| `packages/agent-core/src/context/evidence-packet.ts` | evidence fact 生成和 id 命名 |
| `packages/agent-core/src/context/missing-data-packet.ts` | 结构化缺失数据分析 |
| `packages/agent-core/src/context/visible-chart-packet.ts` | tab/timeframe 到 chart token 和图表摘要的映射 |
| `packages/agent-core/src/context/advisor-intent.ts` | Advisor Chat 问题意图解析 |
| `packages/agent-core/src/prompts/context-packet-renderer.ts` | 把 packet 渲染成 markdown |
| `packages/agent-core/src/prompts/task-builder.ts` | 改为消费 packet renderer，移除散落的指标计算 |
| `packages/agent-core/src/prompts/system-builder.ts` | 注入 profile tags 和结构化数据质量约束 |
| `packages/agent-core/src/runtime/agent-runtime.ts` | 保存 eval artifacts 需要的 packet snapshot |
| `packages/agent-core/src/evals/` | scorer/report 读取 packet/evidence artifacts |

如果某些类型未来需要跨前后端共享，再移动到 `packages/shared`。第一版建议先放在 `agent-core` 内部，避免过早扩大公共 API。

## 5. 核心类型设计

### 5.1 TaskContextPacket

建议先定义一个顶层 packet。示例类型如下，实际字段可以按现有类型名微调。

```ts
export interface TaskContextPacket {
  task: TaskPacket;
  userContext: UserContextPacket;
  dataWindow: DataWindowPacket;
  missingData: MissingDataItem[];
  evidence: EvidenceFact[];
  visibleCharts: VisibleChartPacket[];
  homepage?: HomepageContextPacket;
  viewSummary?: ViewSummaryContextPacket;
  advisorChat?: AdvisorChatContextPacket;
}
```

设计原则：

- 所有可被 LLM 引用的事实都应尽量出现在 `evidence` 中。
- 任务专用字段只放在对应 task packet 中，例如 `homepage`、`viewSummary`、`advisorChat`。
- `missingData` 是全局约束，不要只藏在 system prompt 中。
- `visibleCharts` 里必须是真实 `ChartTokenId`，不能继续使用 `hrv`、`sleep` 这类 tab id 伪装 chart id。

### 5.2 EvidenceFact

Evidence 是给事实可验证性服务的，不是给用户看的。

```ts
export interface EvidenceFact {
  id: string;
  source: 'daily_records' | 'timeline_sync' | 'profile' | 'rules' | 'memory';
  dateRange?: {
    start: string;
    end: string;
  };
  metric?: string;
  value?: number | string | boolean;
  unit?: string;
  derivation: string;
}
```

id 命名建议使用稳定规则：

```text
latest_sleep_total
latest_sleep_deep
latest_hrv
trend7d_hrv_avg
trend7d_sleep_avg
baseline_hrv
missing_sleep_latest24h
visible_chart_hrv_7days
```

注意事项：

- id 不要包含随机数。
- id 不要包含数组下标，除非该下标来自排序后稳定序列。
- `derivation` 要说明事实怎么来的，例如 `latest record in selected window`。
- 如果 value 来自计算结果，要说明计算窗口，例如 `average of non-missing hrv values in selected 7-day window`。

### 5.3 MetricSummary

所有指标 tab 都应共用同一套摘要结构。

```ts
export interface MetricSummary {
  metric: 'hrv' | 'sleep' | 'activity' | 'stress' | 'spo2' | 'resting-hr';
  latest?: MetricValue;
  average?: MetricValue;
  min?: MetricValue;
  max?: MetricValue;
  baseline?: MetricValue;
  deltaPctVsBaseline?: number;
  trendDirection: 'up' | 'down' | 'stable' | 'unknown';
  anomalyPoints: MetricAnomalyPoint[];
  missing: MissingDataCoverage;
  evidenceIds: string[];
}

export interface MetricValue {
  value: number;
  unit: string;
  date?: string;
}

export interface MissingDataCoverage {
  missingCount: number;
  totalCount: number;
  completenessPct: number;
}
```

趋势方向不要靠 prompt 里的文字判断。应在 `metric-summary.ts` 中用明确算法计算，并覆盖单元测试。

建议第一版趋势算法：

- 取当前窗口内该指标的非缺失值；
- 少于 3 个点时返回 `unknown`；
- 比较后半段均值和前半段均值；
- 差异绝对值低于该指标阈值时返回 `stable`；
- 高于阈值时按方向返回 `up` 或 `down`。

阈值应集中配置，不要散落在 prompt builder 中。

### 5.4 MissingDataItem

当前只暴露缺失字段名，信息太粗。需要改成结构化缺失数据。

```ts
export interface MissingDataItem {
  metric: string;
  scope: 'latest24h' | 'selectedWindow' | 'trend7d' | 'visibleChart';
  missingCount: number;
  totalCount: number;
  lastAvailableDate?: string;
  impact: string;
  requiredDisclosure?: string;
  evidenceId: string;
}
```

示例：

```text
metric: sleep
scope: latest24h
missingCount: 1
totalCount: 1
lastAvailableDate: 2026-04-23
impact: cannot assess last-night sleep
requiredDisclosure: 必须说明昨晚睡眠数据不足
```

实现要求：

- `scope` 必须说明缺失影响的是哪个回答范围。
- `lastAvailableDate` 应从窗口内或窗口前最近可用记录计算。
- `requiredDisclosure` 用于 prompt 明确约束 LLM 如何表达不确定性。
- 缺失数据也要生成 evidence fact，方便 eval 验证。

### 5.5 VisibleChartPacket

当前 `visibleChartIds` 里传入的是 `hrv`、`sleep` 这类 tab id，不是真正的 `ChartTokenId`。这会让 LLM 只知道当前页面是 HRV tab，却不知道图上有什么。

需要改成：

```ts
export interface VisibleChartPacket {
  chartToken: ChartTokenId;
  metric: MetricSummary['metric'];
  timeframe: Timeframe;
  visible: boolean;
  dataSummary: MetricSummary;
  evidenceIds: string[];
}
```

第一版映射可以复用 `view-summary-rules.ts` 中已有的 tab 到 token 关系：

| tab | chartToken |
|-----|------------|
| `hrv` | `HRV_7DAYS` |
| `sleep` | `SLEEP_7DAYS` |
| `resting-hr` | `RESTING_HR_7DAYS` |
| `activity` | `ACTIVITY_7DAYS` |
| `spo2` | `SPO2_7DAYS` |
| `stress` | `STRESS_LOAD_7DAYS` |
| `overview` | 多个核心 token |

不要把非法 chart id 传给 LLM 后再指望 `validateChartTokens()` 清理。`validateChartTokens()` 是输出校验，不是上下文修复机制。

## 6. buildTaskContextPacket 入口

新增入口建议如下：

```ts
export function buildTaskContextPacket(
  context: AgentContext,
  rulesResult: RuleEvaluationResult,
): TaskContextPacket {
  const evidence = createEvidenceCollector();
  const missingData = buildMissingDataPacket(context, evidence);
  const visibleCharts = buildVisibleChartPackets(context, evidence);

  const base = {
    task: buildTaskPacket(context),
    userContext: buildUserContextPacket(context, evidence),
    dataWindow: buildDataWindowPacket(context),
    missingData,
    evidence: evidence.items,
    visibleCharts,
  };

  switch (context.task.type) {
    case AgentTaskType.HOMEPAGE_SUMMARY:
      return {
        ...base,
        homepage: buildHomepagePacket(context, rulesResult, evidence),
      };
    case AgentTaskType.VIEW_SUMMARY:
      return {
        ...base,
        viewSummary: buildViewSummaryPacket(context, rulesResult, visibleCharts, evidence),
      };
    case AgentTaskType.ADVISOR_CHAT:
      return {
        ...base,
        advisorChat: buildAdvisorChatPacket(context, rulesResult, visibleCharts, evidence),
      };
  }
}
```

注意：上面只是结构示例。实际实现时要以现有 `AgentTaskType` 类型为准，并保证 TypeScript exhaustiveness。

## 7. Homepage 需要补齐的上下文

当前 homepage 已经注入最近事件、24 小时状态和 7 天均值，但事实结构不完整。

### 7.1 目标结构

```ts
export interface HomepageContextPacket {
  recentEvents: RecentEventPacket[];
  latest24h: Latest24hPacket;
  trend7d: MetricSummary[];
  rulesInsights: RuleInsightPacket[];
  suggestedChartTokens: ChartTokenId[];
}
```

### 7.2 recentEvents

从 `context.timelineSync.recognizedEvents` 和 injected events 生成。

每个事件至少包含：

- `type`
- `start`
- `end`
- `durationMin`
- `confidence`
- `syncState`
- `evidenceIds`

排序规则：

1. 按开始时间倒序；
2. 同一时间下优先 `timeline_sync` 识别事件；
3. 最多保留 prompt 所需的最近若干条，数量上限配置化。

`syncState` 应包含：

- `lastSyncedMeasuredAt`
- `pendingEventCount`
- 当前事件是否来自已同步窗口。

### 7.3 latest24h

当前只包含睡眠、活动、压力、心率均值。需要补齐：

- sleep total；
- deep sleep；
- REM；
- HRV；
- resting HR；
- SpO2；
- stress load；
- steps；
- active minutes；
- 相对 baseline 的 delta；
- status。

示例：

```ts
export interface Latest24hMetric {
  metric: string;
  value?: number;
  unit: string;
  baseline?: number;
  deltaPctVsBaseline?: number;
  status: 'normal' | 'attention' | 'missing';
  evidenceId?: string;
}
```

status 的计算必须在代码中完成，不要要求 LLM 自己判断数值是否异常。

### 7.4 trend7d

不能只给周均值。每个趋势项应包含：

- `average`
- `latest`
- `baseline`
- `deltaPctVsBaseline`
- `trendDirection`
- `dataCompleteness`
- `evidenceIds`

首页至少生成：

- sleep；
- activity；
- stress；
- HRV；
- resting HR；
- SpO2。

如果某项数据不足，要返回 `trendDirection: 'unknown'`，并在 `missingData` 中说明原因。

### 7.5 userContext

`context.profile.tags` 已存在，但当前 system prompt 没有注入。需要在 `userContext` 和 system prompt 中体现：

- profile id；
- name；
- age；
- tags；
- baselines；
- 长期目标或画像标签。

LLM 可以用这些信息做个性化，但不能用它们替代当前数据事实。

## 8. View Summary 需要补齐的上下文

当前只有 `overview` tab 会注入核心指标概览。单指标 tab 事实不足，是本轮最重要的修复点之一。

### 8.1 目标结构

```ts
export interface ViewSummaryContextPacket {
  tab: DataTab;
  timeframe: Timeframe;
  selectedMetric?: MetricSummary;
  overviewMetrics?: MetricSummary[];
  visibleCharts: VisibleChartPacket[];
  rulesInsights: RuleInsightPacket[];
  suggestedChartTokens: ChartTokenId[];
}
```

### 8.2 单指标 tab 必须生成 selectedMetric

以下 tab 都必须生成完整 `selectedMetric`：

- `hrv`
- `sleep`
- `activity`
- `stress`
- `spo2`
- `resting-hr`

每个 selectedMetric 至少包含：

- latest；
- average；
- min；
- max；
- baseline；
- deltaPctVsBaseline；
- trendDirection；
- anomalyPoints；
- missing；
- evidenceIds；
- chartToken。

示例渲染结果：

```text
selectedMetric:
  tab: hrv
  timeframe: week
  chartToken: HRV_7DAYS
  latest: 102 ms on 2026-04-24
  average: 96 ms
  baseline: 95 ms
  deltaPctVsBaseline: +1%
  trendDirection: stable
  anomalyPoints: []
  missing:
    missingCount: 0
    totalCount: 7
```

### 8.3 overview tab

`overview` 不能只生成自然语言概览。它应该生成 `overviewMetrics`，每个元素都是 `MetricSummary`。

第一版包含：

- HRV；
- sleep；
- resting HR；
- activity；
- SpO2；
- stress。

overview 的 prompt 渲染可以摘要化，但 packet 中必须保留结构化事实。

### 8.4 指标取值规则

请在 `metric-summary.ts` 集中实现指标取值，避免每个 prompt section 自己读 JSON。

建议映射：

| metric | DailyRecord 字段 | unit |
|--------|------------------|------|
| `hrv` | `record.hrv` | `ms` |
| `sleep` | `record.sleep.totalMinutes` | `min` |
| `activity` | `record.activity.steps` | `steps` |
| `stress` | `record.stress.load` | `score` |
| `spo2` | `record.spo2` | `%` |
| `resting-hr` | 优先真实静息心率字段；当前没有时按已约定字段统一封装 | `bpm` |

如果当前数据模型没有独立 resting HR 字段，不要在多个地方临时取 `hr[0]`。应先在一个 helper 中明确封装当前约定，并用测试锁住行为。后续模型升级时只改这一个 helper。

## 9. Advisor Chat 需要补齐的上下文

Advisor Chat 当前上下文最弱。它有用户问题、对话历史、历史分析和 visibleChartIds，但缺少和问题相关的健康事实。

### 9.1 目标结构

```ts
export interface AdvisorChatContextPacket {
  userMessage: string;
  questionIntent: QuestionIntentPacket;
  currentPage: CurrentPagePacket;
  relevantFacts: RelevantFactPacket[];
  recentConversation: ConversationPacket[];
  constraints: AdvisorConstraintPacket[];
}
```

### 9.2 questionIntent

需要解析：

- `metricFocus`：问题关注哪些指标；
- `timeScope`：今天、昨天、本周、本月、自定义范围；
- `actionIntent`：解释图表、能否运动、状态总结、追问原因等；
- `riskLevel`：普通建议、潜在风险、必须安全边界。

第一版不要引入 LLM 意图识别。可以先用明确、可测试、集中维护的规则解析：

- 规则表集中在 `advisor-intent.ts`；
- 每条规则有名称、匹配条件、输出字段；
- 禁止在 prompt builder 中散写 `includes()`；
- 每类意图都必须有测试样例。

### 9.3 currentPage

从 `context.task.pageContext`、`context.task.tab`、`context.task.timeframe` 和 `visibleCharts` 生成。

至少包含：

- page；
- tab；
- timeframe；
- visibleChartTokens；
- visible chart data summary。

如果用户在 Data Center 的 HRV tab 问“这个图说明什么”，即使用户问题没有直接写 HRV，也必须把当前 HRV selectedMetric 放入 `relevantFacts`。

### 9.4 relevantFacts

`relevantFacts` 是 Advisor Chat 质量的关键。它应该由问题意图和当前页面共同决定。

建议第一版规则：

| 场景 | 必须加入的事实 |
|------|----------------|
| 用户问今天状态 | latest24h 核心指标 |
| 用户问昨天睡眠 | latest sleep summary 和 missingData |
| 用户问最近/这一周 | selected window metric summaries |
| 当前在 Data Center 单指标 tab | selectedMetric 和 visibleChart |
| 用户问能否运动 | sleep、HRV、stress、activity readiness facts |
| 用户问图表说明 | visibleCharts 中当前图表摘要 |
| 用户问缺失指标 | missingData 和 lastAvailableDate |

每个 relevant fact 必须引用 evidence id：

```ts
export interface RelevantFactPacket {
  label: string;
  factType: 'metric' | 'trend' | 'missing-data' | 'chart' | 'event' | 'memory';
  summary: string;
  evidenceIds: string[];
}
```

### 9.5 recentConversation

对话历史必须先通过 profile 校验。只有当前 `sessionId` 下 profile 一致的消息才能进入 packet。

不要在 Advisor Chat 中无条件注入旧会话消息。

## 10. Missing Data 实施细节

当前 `detectMissingFields()` 只返回字段名。它可以继续保留给旧逻辑使用，但本轮需要新增结构化缺失分析。

### 10.1 缺失范围

至少支持四种 scope：

- `latest24h`：最新记录是否缺；
- `selectedWindow`：当前窗口内缺多少；
- `trend7d`：趋势计算是否受影响；
- `visibleChart`：当前可见图表是否受影响。

### 10.2 影响描述

`impact` 要写给工程和 eval 使用，可以是英文稳定短句，例如：

- `cannot assess last-night sleep`
- `weekly hrv trend has partial missing data`
- `visible sleep chart has incomplete data`

`requiredDisclosure` 写给 prompt 使用，例如：

- `必须说明昨晚睡眠数据不足`
- `必须说明本周 HRV 趋势只有部分数据`

### 10.3 lastAvailableDate

实现时不要只看当前窗口。用户问“昨晚睡眠缺失”时，给出最近可用日期很有价值。

建议输入需要包含：

- 当前 window records；
- profile 全量 records；
- metric accessor。

查找规则：

1. 先按日期倒序；
2. 找到该 metric 非缺失的最近记录；
3. 如果不存在，省略 `lastAvailableDate`。

## 11. Evidence 和 Eval Artifacts

### 11.1 Prompt 中如何使用 evidence

Prompt 不一定要把 evidence id 展示给用户，但应该把 evidence id 放在上下文块中，供 LLM 和 eval trace 使用。

渲染示例：

```text
## Evidence Facts
- latest_sleep_total: daily_records, 2026-04-24, sleep.totalMinutes = 481 min, latest record in selected window
- trend7d_hrv_avg: daily_records, 2026-04-18 ~ 2026-04-24, hrv = 96 ms, average of non-missing values
- missing_sleep_latest24h: daily_records, 2026-04-24, sleep missing, latest24h sleep unavailable
```

Prompt 约束应明确：

- summary 只能基于 evidence facts 和当前 task packet；
- 如果 evidence 缺失，不得补全；
- 重要建议必须能回溯到至少一个 evidence fact；
- missingData 中的 requiredDisclosure 必须遵守。

### 11.2 Eval report 需要保存什么

建议 eval artifacts 增加：

- `contextPacket`;
- `evidence`;
- `missingData`;
- `visibleCharts`;
- `memoryScope`;
- 渲染后的 prompt。

这样失败时可以判断：

- LLM 已看到事实但没有使用；
- LLM 没看到事实；
- packet 生成错了；
- prompt 渲染丢字段；
- scorer 规则过粗；
- memory scope 不正确。

### 11.3 Scorer 后续增强

Evidence scorer 不应只靠文本 pattern。后续可以基于 artifacts 做更稳定判断：

- required evidence id 是否存在于 packet；
- 输出中的关键 claim 是否能映射到 evidence；
- 输出是否引用了 missingData 禁止补全的指标；
- chart token 是否来自 visibleCharts 或 rules suggested tokens。

第一版可以先保存 artifacts，不必一次完成复杂 claim extraction。

## 12. Memory Isolation 修复

当前 `context-builder.ts` 读取 memory 时只按 `sessionId`：

```ts
deps.sessionMemory.getRecentMessages(request.sessionId)
deps.analyticalMemory.get(request.sessionId)
```

但 profile 切换清理发生在 append 或 set 阶段。这意味着构建 prompt 时可能先读到旧 profile 的 memory。

### 12.1 正确读取方式

`context-builder.ts` 应改为先取完整 memory，再检查 profile：

```ts
const sessionMemory = deps.sessionMemory.get(request.sessionId);
const recentMessages =
  sessionMemory?.profileId === request.profileId
    ? sessionMemory.messages.slice(-MAX_MESSAGES)
    : [];

const analytical = deps.analyticalMemory.get(request.sessionId);
const scopedAnalytical =
  analytical?.profileId === request.profileId ? analytical : undefined;
```

实际代码不要复制上面的 `MAX_MESSAGES`，应复用现有 `MAX_TURNS` 或封装 store 方法。

### 12.2 Store API 建议

可以给 store 新增 profile-aware 方法：

```ts
getRecentMessagesForProfile(sessionId: string, profileId: string, maxTurns?: number): ConversationMessage[];
getForProfile(sessionId: string, profileId: string): AnalyticalMemory | undefined;
```

这样 context builder 不需要知道裁剪细节。

### 12.3 测试要求

必须新增或更新：

- `packages/agent-core/src/__tests__/context/context-builder.test.ts`
- `packages/agent-core/src/__tests__/memory/session-memory-store.test.ts`
- `packages/agent-core/src/__tests__/memory/analytical-memory-store.test.ts`

覆盖场景：

- 同一 session 下 profile A 的消息不会进入 profile B 的 prompt；
- analytical memory 的 latest view summary 不会跨 profile 使用；
- append 阶段仍然会清理旧 profile memory；
- override invalidation 不影响 profile 校验。

## 13. Prompt Builder 改造

### 13.1 当前问题

`task-builder.ts` 同时做了三件事：

1. 加载任务模板；
2. 计算业务事实；
3. 拼 prompt 文案。

这让指标逻辑散落，难以测试，也让不同任务看到的事实不一致。

### 13.2 改造目标

改造后：

```text
task-builder.ts
  -> load template
  -> render constraints
  -> renderTaskContextPacket(packet)
  -> render output schema
```

所有业务事实计算都移到 context packet builder。

### 13.3 renderTaskContextPacket

新增 renderer：

```ts
export function renderTaskContextPacket(packet: TaskContextPacket): string {
  const sections: string[] = [];
  sections.push(renderTaskPacket(packet.task));
  sections.push(renderUserContext(packet.userContext));
  sections.push(renderDataWindow(packet.dataWindow));
  sections.push(renderMissingData(packet.missingData));
  sections.push(renderVisibleCharts(packet.visibleCharts));
  sections.push(renderEvidence(packet.evidence));

  if (packet.homepage) sections.push(renderHomepage(packet.homepage));
  if (packet.viewSummary) sections.push(renderViewSummary(packet.viewSummary));
  if (packet.advisorChat) sections.push(renderAdvisorChat(packet.advisorChat));

  return sections.filter(Boolean).join('\n\n');
}
```

Renderer 只做格式化，不做计算。

### 13.4 输出约束

保留现有 JSON 输出格式约束，但要补充：

- `chartTokens` 只能从 `visibleCharts.chartToken` 或 `suggestedChartTokens` 中选择；
- 缺失数据相关回答必须遵守 `missingData.requiredDisclosure`；
- 不要输出 evidence id 给用户，除非未来产品明确需要。

## 14. System Prompt 改造

`system-builder.ts` 需要做两类小改造：

1. 注入 profile tags；
2. 用结构化 missingData 替代粗粒度 missing fields。

建议渲染：

```text
## 用户信息
- 姓名：...
- 年龄：...
- 标签：耐力训练、睡眠改善

## 基线参考值
- 静息心率：...
- HRV 基线：...
- SpO2 基线：...
- 平均睡眠：...
- 平均步数：...

## 数据质量约束
- sleep 在 latest24h 缺失：必须说明昨晚睡眠数据不足
- spo2 在 selectedWindow 缺失 2/7：只能说明可用日期的观察，不得推断整周血氧
```

如果 `buildSystemPrompt()` 暂时无法直接拿到 packet，可以先让 `buildTaskPrompt()` 渲染完整 missingData。最终更推荐让 prompt 构建阶段同时拿到 `context` 和 `packet`。

## 15. Frontend 和 API 的 visible chart 调整

当前前端在 data-center 页传：

```ts
visibleChartIds: pageContext.page === 'data-center' ? [activeTab] : undefined
```

这不是可靠事实来源。需要改造成两个层次：

### 15.1 请求层

前端仍然可以传当前 tab，因为 tab 是页面状态：

```ts
pageContext: {
  page: 'data-center',
  dataTab: activeTab,
  timeframe
}
```

不要要求前端自己计算 chart token 和数据摘要。chart token 应由后端或 agent-core 根据共享映射生成。

### 15.2 Agent context 层

`AgentContext.task.visibleChartIds` 建议逐步替换为：

```ts
visibleChartHints?: string[];
```

然后在 `visible-chart-packet.ts` 里生成真实：

```ts
VisibleChartPacket[]
```

如果短期内保留 `visibleChartIds` 字段，也必须在 prompt 中改名渲染为 `visibleChartHints`，避免误导 LLM 认为它们是合法 chart token。

## 16. 测试计划

### 16.1 单元测试

新增测试文件：

- `packages/agent-core/src/__tests__/context/context-packet-builder.test.ts`
- `packages/agent-core/src/__tests__/context/metric-summary.test.ts`
- `packages/agent-core/src/__tests__/context/missing-data-packet.test.ts`
- `packages/agent-core/src/__tests__/context/visible-chart-packet.test.ts`
- `packages/agent-core/src/__tests__/context/advisor-intent.test.ts`
- `packages/agent-core/src/__tests__/prompts/context-packet-renderer.test.ts`

重点断言：

- homepage packet 包含 latest24h、trend7d、recentEvents、missingData；
- view summary 的每个单指标 tab 都包含 selectedMetric；
- advisor chat 在 HRV tab 问图表时包含 HRV visible chart facts；
- missing sleep 不会生成 sleep value evidence；
- visible chart token 必须是 `ChartTokenId`；
- renderer 不做指标计算，只渲染输入 packet；
- memory profile 不匹配时不进入 packet。

### 16.2 Eval case 更新

优先更新以下质量 case：

- `quality-view-hrv-drop.json`
- `quality-view-sleep-missing.json`
- `quality-chat-yesterday-sleep.json`
- `quality-chat-visible-sleep-chart.json`
- `quality-chat-can-i-run.json`
- `quality-chat-profile-switch.json`
- `quality-homepage-missing-sleep.json`
- `quality-homepage-hrv-decline.json`

每个 case 应能通过 report 看到：

- context packet snapshot；
- evidence packet；
- missing data packet；
- chart token availability；
- memory scope。

### 16.3 回归命令

完成代码后至少运行：

```bash
pnpm --filter @health-advisor/agent-core test
```

如果修改 shared 类型或前后端 request contract，还要运行相关包测试：

```bash
pnpm --filter @health-advisor/shared test
pnpm --filter @health-advisor/agent-api test
pnpm --filter @health-advisor/web test
```

以仓库实际 package name 为准；如果命令不存在，先查看对应 `package.json`。

## 17. 推荐实施顺序

### Phase 1：结构化 packet 骨架

目标：先把结构搭起来，不追求所有字段完美。

任务：

1. 新增 `context-packet.ts` 类型；
2. 新增 `context-packet-builder.ts`；
3. 生成 base packet：task、userContext、dataWindow；
4. 新增 renderer；
5. 改 `task-builder.ts` 使用 renderer；
6. 保持现有 prompt 输出行为尽量不变；
7. 添加基础单元测试。

验收：

- 所有现有 prompt 测试通过；
- 新增 packet builder 测试通过；
- prompt 中能看到稳定的 `Task Context Packet` section。

### Phase 2：View Summary 单指标事实

目标：修复当前事实缺口最大的路径。

任务：

1. 新增 `metric-summary.ts`；
2. 为 6 个单指标 tab 生成 selectedMetric；
3. 为 overview 生成 overviewMetrics；
4. 生成 visibleCharts；
5. 更新 view-summary prompt 测试；
6. 更新相关 eval case。

验收：

- HRV、sleep、activity、stress、spo2、resting-hr tab 的 prompt 都包含 selectedMetric；
- selectedMetric 包含 latest、average、baseline、trendDirection、missing；
- chart token 是合法 `ChartTokenId`。

### Phase 3：Homepage 事实补齐

目标：让晨报同时具备最新状态、趋势、事件和用户画像。

任务：

1. 生成 recentEvents；
2. 补齐 latest24h；
3. 补齐 trend7d；
4. 注入 profile tags；
5. 把缺失数据以结构化方式渲染；
6. 更新 homepage eval case。

验收：

- homepage prompt 包含 HRV、SpO2、resting HR 的最新值和 baseline 对比；
- trend7d 包含方向和完整度；
- missing data 不再只是字段名。

### Phase 4：Advisor Chat relevantFacts

目标：让聊天回答基于当前问题和页面事实。

任务：

1. 新增 `advisor-intent.ts`；
2. 生成 questionIntent；
3. 生成 currentPage；
4. 按意图选择 relevantFacts；
5. 强制当前 Data Center tab 的 selectedMetric 进入 relevantFacts；
6. 更新 advisor chat eval case。

验收：

- 用户问当前图表时，prompt 包含当前 chart token 和数据摘要；
- 用户问能否运动时，prompt 包含 sleep、HRV、stress、activity readiness facts；
- 用户问缺失数据时，prompt 包含 missingData 和 lastAvailableDate。

### Phase 5：Evidence artifacts 和 scorer 准备

目标：让失败分析能区分事实缺失、模型未使用事实、scorer 不足。

任务：

1. 保存 context packet snapshot；
2. 保存 evidence facts；
3. 保存 missingData；
4. 保存 visibleCharts；
5. report 中展示 artifacts；
6. 为 evidence scorer 后续升级预留输入。

验收：

- eval report 中可以看到完整 packet；
- 每个核心 metric claim 都有 evidence id；
- missing data claim 有对应 evidence id。

### Phase 6：Memory isolation

目标：修复 profile 切换后 prompt 读取旧 memory 的风险。

任务：

1. 新增 profile-aware memory 读取 API，或在 context builder 中校验 profile；
2. 修改 `buildAgentContext()` 的 memory 读取；
3. 更新 memory/context 测试；
4. 更新 `quality-chat-profile-switch.json`。

验收：

- profile B 的 prompt 不包含 profile A 的对话；
- analytical memory 不跨 profile；
- eval case 能稳定覆盖该问题。

## 18. 不要做的事

本轮不要做以下改动：

- 不要直接把审查意见复制进 prompt 模板；
- 不要在 response parser 里补写或改写事实；
- 不要让 LLM 自己根据零散数值判断趋势；
- 不要把 tab id 当 chart token；
- 不要把缺失字段名包装成“数据完整”；
- 不要通过输出后处理隐藏模型编造问题；
- 不要引入 ReAct 或 tool loop 来绕过上下文不足；
- 不要在多个文件中重复实现同一个指标取值逻辑；
- 不要让 memory 在未校验 profile 的情况下进入 prompt。

如果发现需要新增字段但数据模型当前不支持，应先明确记录字段来源和计算约定，再实现集中 helper 和测试。不要在 prompt builder 中临时拼一个看起来可用的值。

## 19. 完成标准

本轮优化完成后，应满足：

- 每个 Agent task 都有明确 `TaskContextPacket`；
- prompt builder 主要负责渲染，不负责业务事实计算；
- view summary 单指标 tab 有完整 selectedMetric；
- advisor chat 有 questionIntent 和 relevantFacts；
- missingData 是结构化对象；
- visibleCharts 使用真实 `ChartTokenId`；
- evidence facts 有稳定 id、source、dateRange、derivation；
- eval report 能保存 packet 和 evidence artifacts；
- memory 读取阶段校验 profile；
- 相关单元测试和 eval case 已更新。

一句话验收标准：

```text
当 Agent 答错时，工程师可以从 eval report 判断它是没看到事实、看到了没用、事实生成错了，还是 scorer 规则不够。
```
