# Advisor Chat ReAct 实现文档

## 文件索引

### 核心实现

| 文件路径 | 说明 |
|---------|------|
| `packages/agent-core/src/executor/react-loop.ts` | ReAct 循环主逻辑（`runConstrainedReAct`） |
| `packages/agent-core/src/runtime/agent-runtime.ts` | Agent Runtime 总入口，编排 ReAct 调用链 |
| `packages/agent-core/src/executor/create-agent.ts` | HealthAgent 工厂，定义 Agent 调用接口 |
| `packages/agent-core/src/planner/advisor-plan-builder.ts` | AnalysisPlan 生成器（带重试） |
| `packages/agent-core/src/planner/analysis-plan.ts` | AnalysisPlan Zod Schema 定义 |
| `packages/agent-core/src/planner/evidence-resolver.ts` | 证据解析器，从 TaskContextPacket 匹配已有数据 |

### 工具定义

| 文件路径 | 工具名 | 说明 |
|---------|--------|------|
| `packages/agent-core/src/tools/tool-types.ts` | — | ToolDefinition / ToolResult / ReActStep 类型定义 |
| `packages/agent-core/src/tools/index.ts` | — | 工具统一导出 |
| `packages/agent-core/src/tools/query-metric-summary.ts` | `queryMetricSummary` | 查询指标汇总数据（avg/max/min/latest） |
| `packages/agent-core/src/tools/query-visible-chart-facts.ts` | `queryVisibleChartFacts` | 查询当前页面可见图表的数据事实 |
| `packages/agent-core/src/tools/query-missing-data.ts` | `queryMissingData` | 查询指标缺失数据状态及完整度 |
| `packages/agent-core/src/tools/query-timeline-events.ts` | `queryTimelineEvents` | 查询时间线事件（运动、睡眠等） |
| `packages/agent-core/src/tools/estimate-caffeine-sleep-impact.ts` | `estimateCaffeineSleepImpact` | 基于咖啡因摄入事件估算对睡眠的影响 |

### Prompt 模板

| 文件路径 | 说明 |
|---------|------|
| `data/sandbox/prompts/react-tool-select.md` | ReAct 工具选择系统 prompt |
| `data/sandbox/prompts/advisor-plan.md` | Planner 生成 AnalysisPlan 的系统 prompt |
| `data/sandbox/prompts/advisor-chat.md` | Advisor Chat 主系统 prompt |

### 依赖注入 & 路由

| 文件路径 | 说明 |
|---------|------|
| `apps/agent-api/src/runtime/registry.ts` | Runtime 注册中心，组装 ReAct 依赖并注入 AgentRuntime |
| `apps/agent-api/src/modules/ai/routes.ts` | API 路由（`/ai/chat` 等端点） |
| `apps/agent-api/src/services/ai-orchestrator.ts` | AI 请求编排层 |

### 测试

| 文件路径 | 说明 |
|---------|------|
| `packages/agent-core/src/executor/__tests__/react-loop.test.ts` | ReAct 循环单元测试 |
| `packages/agent-core/src/__tests__/runtime/react-loop-integration.test.ts` | ReAct 集成测试 |

---

## 架构概述

Advisor Chat 的 ReAct 是一个**受限 ReAct（Constrained ReAct）** 实现，嵌入在多阶段 Agent 编排链路中。与开放式 ReAct 不同，它具有严格的安全边界：

- **最大 3 步**（硬编码限制，不可配置）
- **工具白名单**（仅允许 5 个预定义工具）
- **Schema 校验**（Zod schema 验证所有输入输出）
- **证据精确匹配**（通过 metric 名称关联 need 和 evidence）
- **优雅降级**（ReAct 失败不阻断主链路）

---

## 完整调用链路

```
用户消息 → /ai/chat
  → AiOrchestrator.execute()
    → AgentRuntime.executeAgent()
      │
      ├─ P1: PlanBuilder 生成 AnalysisPlan
      │     └─ plannerAgent + advisor-plan.md prompt
      │
      ├─ P2: EvidenceResolver 解析已有证据
      │     ├─ packet.evidence（按 metric 匹配）
      │     ├─ packet.visibleCharts（按 metric + timeframe 匹配）
      │     ├─ packet.homepage.trend7d（按 metric + 7d 匹配）
      │     └─ packet.advisorChat.relevantFacts（按 metric 匹配）
      │
      ├─ P2: ReAct Loop（仅在有 unresolved required needs 时触发）
      │     └─ runConstrainedReAct()
      │         ├─ selectTool() ← plannerAgent + react-tool-select.md
      │         ├─ tool.execute() ← Zod schema 校验 → 执行工具
      │         ├─ 收集 evidence + 消除 satisfied need
      │         └─ 循环 ≤3 步，直到所有 needs 满足
      │
      ├─ 构建 prompt（plan + evidence 上下文追加到 taskPrompt）
      │
      ├─ Solver Agent 生成回复
      │
      ├─ P0: 确定性验证（Verifier）
      ├─ P3: 同步审核闸门（仅高风险）
      └─ P0: 异步 Reflection（不阻断）
```

---

## 阶段详解

### P1: Plan 生成（AnalysisPlan）

当 `taskType === ADVISOR_CHAT` 且 `deps.planBuilder` 已配置时，系统调用 `buildAnalysisPlanWithRetry()`：

1. 构建 planner user prompt（用户消息 + 页面上下文 + 数据概况）
2. 调用 `plannerAgent` 生成 JSON 格式的 `AnalysisPlan`
3. Zod Schema 校验 + 业务规则校验（`verifyAnalysisPlan`）
4. 首次校验失败时，将 violations 反馈给 planner 重试一次

**AnalysisPlan 结构**：

```typescript
{
  planId: string,
  taskType: 'advisor_chat',
  userIntent: {
    action: 'status_summary' | 'explain_chart' | 'ask_why'
           | 'exercise_readiness' | 'compare_periods' | 'general',
    riskLevel: 'general' | 'potential_risk' | 'safety_boundary',
    needsClarification: boolean,
    clarificationQuestion?: string,
  },
  evidenceNeeds: Array<{
    metric: 'hrv' | 'sleep' | 'activity' | 'stress' | 'spo2' | 'resting-hr',
    timeScope: 'today' | 'yesterday' | 'week' | 'month' | 'custom' | 'unknown',
    dateRange?: { start: string, end: string },
    reason: string,
    required: boolean,
  }>,
  safetyConstraints: Array<SafetyConstraint>,
  answerShape: {
    includeMissingDataDisclosure: boolean,
    includeChartTokens: boolean,
    maxSummaryLength: number,
    tone: 'concise' | 'explanatory',
  },
}
```

### P2: Evidence 解析

`resolveEvidenceByPlan()` 按优先级从 `TaskContextPacket` 中尝试满足每个 evidence need：

| 优先级 | 数据源 | 匹配规则 |
|--------|--------|---------|
| 1 | `packet.evidence` | metric 精确匹配 + timeScope 兼容性校验 |
| 2 | `packet.visibleCharts` | metric 匹配 + timeframe 兼容性校验 |
| 3 | `packet.homepage.trend7d` | metric 匹配 + timeScope 与 `7d` 兼容性 |
| 4 | `packet.advisorChat.relevantFacts` | factType 为 metric/trend/chart 且 summary 包含目标 metric |

- `required: true` 且未找到 → 加入 `unresolved`（进入 ReAct）
- `required: false` 且未找到 → 忽略（不影响流程）

### P2: ReAct 循环

**触发条件**：`resolutionResult.unresolved.length > 0 && deps.reactLoop` 已配置

**`runConstrainedReAct()` 流程**：

```
for step = 0..max(3, input.maxSteps):
  1. 检查 AbortSignal（C-3: 外层超时可中断）
  2. selectTool(deps, remainingNeeds, previousSteps)
     ├─ buildToolSelectionPrompt() 构建动态 prompt
     │   ├─ 未满足的 needs（metric + timeScope + reason + required 状态）
     │   ├─ 已执行的步骤（toolName + success/failure）
     │   ├─ 可用工具列表（name + description + inputSchema 字段信息）
     │   └─ JSON 输出格式要求
     ├─ plannerAgent.invoke(systemPrompt, userPrompt)
     ├─ extractJson() 提取 JSON
     ├─ ToolCallSchema.safeParse() 校验
     └─ 白名单校验（toolName 必须在 deps.tools 中）
  3. tool.inputSchema.safeParse(toolInput) 校验输入（H-10）
  4. tool.execute(validatedInput, context) 执行工具
  5. 记录 ReActStep（stepNumber, toolName, input, output, timestamp）
  6. 如果执行成功：
     ├─ 提取 targetMetric（从 input.metric）
     ├─ 将结果加入 collectedEvidence
     └─ 精确消除匹配的第一个 need（H-3 + H-12）
```

**返回值**：

```typescript
{
  collectedEvidence: Array<{ data, evidenceIds, metric? }>,
  steps: ReActStep[],
  stillUnresolved: boolean,  // 是否仍有未满足的 required need
}
```

---

## 工具清单

### 1. queryMetricSummary

查询指定指标在 packet 中的汇总数据。

- **输入**：`metric`（必需）、`dateRange?`、`aggregation?`（avg/max/min/latest）
- **输出**：`value`、`unit`、`trend`、`dataPoints`
- **数据源**：优先 `visibleCharts.dataSummary`，其次 `homepage.trend7d`

### 2. queryVisibleChartFacts

查询当前页面可见图表的数据事实。

- **输入**：`chartToken?`、`metric?`（至少一个）
- **输出**：`charts[]`（chartToken, metric, timeframe, latestValue, unit, trend）
- **数据源**：`packet.visibleCharts`

### 3. queryMissingData

查询指定指标的缺失数据状态。

- **输入**：`metric?`
- **输出**：`items[]`（metric, scope, missingCount, totalCount, completenessPct, impact）、`hasMissingData`
- **数据源**：`packet.missingData`

### 4. queryTimelineEvents

查询时间线事件。

- **输入**：`eventType?`、`dateRange?`
- **输出**：`events[]`（type, start, end, durationMin, confidence）
- **数据源**：`packet.homepage.recentEvents`

### 5. estimateCaffeineSleepImpact

基于 `possible_caffeine_intake` 事件估算咖啡因对目标入睡时间的影响。

- **输入**：`targetSleepTime?`（默认 23:00）
- **输出**：`hasCaffeineEvent`、`estimatedCaffeineLoad`（半衰期 5h、消除速率 k、到睡眠的小时数、剩余比例）、`sleepImpact`（riskLevel + rationale）、`advice`
- **数据源**：`packet.homepage.recentEvents`
- **计算模型**：药代动力学一级消除模型，`remainingRatio = exp(-k × hoursUntilSleep)`

---

## 依赖注入

### Runtime Registry 组装

`registry.ts` 在非 `FALLBACK_ONLY_MODE` 时组装以下依赖：

```typescript
// Planner Agent（复用于 plan 生成和 tool 选择）
planBuilder = {
  plannerAgent: agents.plannerAgent,
  plannerPrompt: loadPromptFile('advisor-plan.md'),
}

// ReAct Loop
reactLoop = {
  plannerAgent: agents.plannerAgent,  // 复用 planner agent
  tools: new Map([
    ['queryMetricSummary', queryMetricSummaryTool],
    ['queryVisibleChartFacts', queryVisibleChartFactsTool],
    ['queryMissingData', queryMissingDataTool],
    ['queryTimelineEvents', queryTimelineEventsTool],
    ['estimateCaffeineSleepImpact', estimateCaffeineSleepImpactTool],
  ]),
  reactPrompt: loadPromptFile('react-tool-select.md'),
}
```

### 多 Agent 角色配置

通过环境变量可独立配置各角色的 LLM：

| 环境变量前缀 | 角色 | 用途 |
|-------------|------|------|
| `LLM_*` | solverAgent | 生成最终回复 |
| `PLANNER_LLM_*` | plannerAgent | 生成 AnalysisPlan + 选择工具 |
| `REVIEWER_LLM_*` | reviewerAgent | 同步审核 + 异步 Reflection |

---

## 安全与容错

### 超时控制（C-3/C-5）

- ReAct 循环共享外层 `AbortController`，超时时中断循环
- 被中断时不追加不完整 evidence，避免错误关联

### 输入校验（H-10）

- 每个 tool 执行前用 `inputSchema.safeParse()` 校验输入
- Schema 校验失败时记录失败步骤并 `continue`

### 优雅降级

| 场景 | 行为 |
|------|------|
| Plan 生成失败 | 返回安全 fallback 响应 |
| Evidence 解析异常 | `resolvedEvidence = undefined`，Solver 仅基于 prompt |
| ReAct 异常/超时 | 不追加 evidence，Solver 使用已有上下文 |
| Tool 选择失败 | `continue` 跳过当前 need |
| Tool 执行失败 | 记录失败步骤，不收集 evidence |

### 白名单机制

- `selectTool()` 返回的 toolName 必须存在于 `deps.tools` Map 中
- 不在白名单中的 tool 会被拒绝并记录 warning

### Need 消除（H-3 + H-12）

- 使用 `filter` 精确匹配消除第一个 metric 相同的 need
- 不盲目移除：无 metric 信息时不消除任何 need
- 支持同一 metric 多个 needs 的场景（仅移除第一个匹配项）

---

## Observer 事件钩子

AgentRuntime 支持 observer 回调，用于测试和 eval 追踪：

| 钩子 | 触发时机 |
|------|---------|
| `onPlanBuilt` | AnalysisPlan 生成成功后 |
| `onPlanVerified` | Plan 校验通过后 |
| `onPlanFailed` | Plan 生成/校验失败 |
| `onEvidenceResolved` | Evidence 解析完成 |
| `onReActStep` | 每个 ReAct 步骤完成 |
| `onClarification` | 用户意图不明确，返回追问 |
| `onParsed` | 结构化输出解析完成 |
| `onVerified` | 确定性验证完成 |
| `onSyncGate` | 同步审核完成 |
| `onSafetyBoundary` | 安全边界触发 |

---

## 设计决策标注（代码中的 H/C 标记）

| 标记 | 含义 |
|------|------|
| H-1 | planner prompt 包含 packet 数据概况，避免为无数据指标生成 need |
| H-2 | metric 精确匹配：evidence 关联和 need 消除都基于 metric |
| H-3 | filter 代替 splice，支持多 needs 同 metric 精确消除 |
| H-4 | 最大步骤硬编码 3，不可配置 |
| H-5 | planner 无法选择 tool 时跳过当前 need |
| H-6 | tool 选择 prompt 包含 input schema 字段信息 |
| H-8 | 白名单/Schema 校验失败时记录诊断 warning |
| H-10 | 执行前 Zod schema 校验 + 防御性检查 |
| H-12 | 精确消除避免误删无关 need |
| H-14 | 结构化 failureType 替代字符串匹配 |
| C-1 | P0/P1/P2/P3 依赖仅在非 fallback 模式创建 |
| C-2 | verifier 使用 packet 实际有数据的 metric 集合 |
| C-3 | try-catch 包裹，P2 失败不阻断主链路 |
| C-5 | 超时中断时不追加不完整 evidence |
