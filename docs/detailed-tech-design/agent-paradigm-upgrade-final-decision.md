# Agent 架构范式升级最终设计

> **文档状态**: 最终设计文档  
> **适用范围**: `packages/agent-core` + `apps/agent-api`  
> **定版日期**: 2026-05-08  
> **目标**: 合并前序方案、交叉评审和最终架构意见，形成唯一权威设计文档

---

## 1. 最终结论

当前阶段的核心目标是 **Agent 能力扩展和回复质量优化**。延迟、调用次数和 token 成本不是第一优先级。架构设计应优先保证：

- 开放式健康问答能被结构化规划。
- 所有关键事实可回溯到确定性 evidence。
- 高风险输出可被明确审核和拒收。
- 新增推理能力全程可观测、可回放、可进入 eval。

最终采用以下渐进路线：

1. **P0: Observability Verifier + Async Reflection**
2. **P1: LLM-driven AnalysisPlan for `ADVISOR_CHAT`**
3. **P2: Plan-driven Evidence Resolver + Constrained ReAct**
4. **P3: Sync Reflection Gate for high-risk cases**
5. **P4: Heavyweight Plan and Solve + Selective Multi-Agent**

这五个阶段不是四种范式的简单堆叠，而是按职责边界渐进扩展当前 Agent：

- **Reflection** 先作为观测层，后作为高风险同步闸门。
- **Plan and Solve** 第一阶段落为轻量 `AnalysisPlan`，远期才用于深度报告 DAG。
- **ReAct** 只作为 `AnalysisPlan` 之后的受限取证机制。
- **Multi-Agent** 不进入默认在线主链路，先用于离线评审、高风险审查和未来深度报告。

---

## 2. 已裁定决策

以下决策已经收敛，后续实施不再重新讨论：

| # | 决策项 | 最终结论 |
|---|--------|----------|
| 1 | 第一阶段是否重视延迟 | 不重视，质量和能力优先 |
| 2 | P0 是否改变生产输出 | 不改变，只观测 |
| 3 | `AnalysisPlan` 第一版生成方式 | LLM planner 生成，deterministic verifier 校验 |
| 4 | ReAct 使用范围 | 只用于复杂 `ADVISOR_CHAT` 的受限取证 |
| 5 | 工具失败处理 | 结构化错误，不切换到不透明替代路径 |
| 6 | Sync Reflection 使用范围 | 高风险场景、严重异常和 hard violation |
| 7 | Sync Reflection 是否改写答案 | 不改写，拒收后基于原始 plan 和 evidence 重生成 |
| 8 | `rules/` 是否迁移到模型层 | 不迁移，确定性代码保留为事实来源 |
| 9 | Multi-Agent 是否默认在线 | 不默认在线，先离线和高风险审查 |
| 10 | 重型 Plan and Solve 何时做 | 有明确 `COMPREHENSIVE_REPORT` 产品需求后 |
| 11 | HOMEPAGE/VIEW 是否引入新推理范式 | 不引入，只增加质量观测 |
| 12 | Evidence 不足时如何处理 | 披露数据不足或请求澄清，不编造 |

---

## 3. 当前架构定位

当前 Agent 主链路是单次 LLM 调用：

```text
request
  -> buildAgentContext()
  -> evaluateRules()
  -> buildTaskContextPacket()
  -> buildSystemPrompt() + buildTaskPrompt()
  -> agent.invoke()
  -> parseAgentResponse()
  -> validateChartTokens()
  -> cleanSafetyIssues()
  -> writeSessionMemory() + writeAnalyticalMemory()
```

当前架构的优势：

- 数据窗口、规则、chart token、missing data 等由确定性代码控制。
- 链路短，易于测试和定位问题。
- `HOMEPAGE_SUMMARY` 和 `VIEW_SUMMARY` 的固定场景已经比较适配当前模式。

当前架构的核心短板集中在 `ADVISOR_CHAT`：

- 用户问题开放，正则意图解析不足以覆盖复杂表达。
- 模型一次性承担意图理解、证据选择、安全判断和自然语言生成。
- 上下文偏预加载，复杂问题无法按需补充证据。
- 输出质量依赖 prompt、解析、token 校验和安全清洗，缺少结构化质量闸门。

因此，升级重点不是替换当前确定性数据链路，而是重构 `ADVISOR_CHAT` 的推理入口、取证机制和质量审核机制。

---

## 4. 目标架构

### 4.1 全局形态

所有任务共享确定性数据层和质量观测层：

```text
request
  -> deterministic context/rules/packet
  -> task-specific reasoning layer
  -> response generation
  -> parse + deterministic validation
  -> quality observation / quality gate
  -> memory write
```

任务差异：

| Task | 目标形态 |
|------|----------|
| `HOMEPAGE_SUMMARY` | 保持当前单次生成模式，只增加 verifier 和 async reflection 观测 |
| `VIEW_SUMMARY` | 保持当前单次生成模式，只增加 verifier 和 async reflection 观测 |
| `ADVISOR_CHAT` | 增加 `AnalysisPlan`、plan verifier、evidence resolver，并在复杂问题中启用 constrained ReAct |

### 4.2 `ADVISOR_CHAT` 目标链路

```text
request
  -> buildAgentContext()
  -> evaluateRules()
  -> buildBaseTaskContextPacket()
  -> planner.invoke() generates AnalysisPlan
  -> verifyAnalysisPlan()
  -> if plan invalid: retry planner once with verifier violations
  -> if still invalid: return clarification or safe inability response
  -> resolveEvidenceByPlan()
  -> optional constrained ReAct for unresolved required evidence
  -> buildTaskPrompt(plan + resolved evidence)
  -> solver.invoke()
  -> parseAgentResponse()
  -> deterministic verifier
  -> async reflection observation
  -> optional sync reflection gate in high-risk cases
  -> write memory
```

注意：Plan 校验失败时不绕过 planner 直接回答复杂问题；Evidence 无法满足时不编造结论。

### 4.3 职责分层

| 层 | 职责 | 实现原则 |
|----|------|----------|
| Context Layer | profile、数据窗口、缺失字段、memory、timeline sync | 确定性代码 |
| Rule Layer | 基础规则、状态、suggested chart tokens | 确定性代码 |
| Planner Layer | 识别用户意图、风险、证据需求、回答结构 | LLM 优先，schema 输出 |
| Plan Verifier | 校验 plan 是否只引用允许指标和合法范围 | 确定性代码 |
| Evidence Resolver | 按 plan 收集 evidence packet | 确定性代码 |
| ReAct Layer | 复杂问题的受限补充取证 | 白名单工具 + schema |
| Solver Layer | 生成 `AgentResponseEnvelope` | LLM |
| Quality Layer | 输出验证、异步观察、高风险同步审核 | Deterministic verifier + LLM reviewer |

---

## 5. 架构红线

### 5.1 确定性代码保留为事实来源

以下职责必须继续由代码负责：

- 数据窗口选择。
- profile 与 session 隔离。
- overrides 和 timeline event 合并。
- missing data 检测。
- metric summary、trend、baseline 计算。
- rule insights 生成。
- chart token 白名单。
- evidence packet 生成。
- response schema 解析。

LLM 不应成为事实来源。LLM 的职责是规划、解释、组织、表达和审查。

### 5.2 不新增隐式替代路径

新架构不引入不透明路径切换：

- 工具失败不切换成全量上下文回答。
- Plan 校验失败不绕过 planner 直接回答复杂问题。
- Reflection 拒绝后不做字符串替换。
- Evidence 不足时必须披露数据不足或请求澄清。

### 5.3 新增推理能力必须可观测

任何新增推理组件都必须产生结构化 artifact：

- planner 输入、输出、校验结果。
- tool action、observation、错误码。
- solver 输入、输出。
- verifier report。
- reviewer decision。

这些 artifact 必须可进入 eval 回放。

---

## 6. P0: Observability Verifier + Async Reflection

### 6.1 目标

建立质量观测和验证基础设施，但不改变当前生产输出。

P0 的重点是让团队知道 Agent 在哪里犯错、为什么犯错、哪些错误可被确定性检测、哪些错误需要模型 reviewer 识别。

### 6.2 运行方式

```text
candidate envelope
  -> existing parse/token/safety steps
  -> return current result to user
  -> [background] deterministic verifier
  -> [background] reflection reviewer
  -> [background] write quality observation artifacts
```

P0 明确不阻断当前输出，不把新发现的 violation 直接变成用户可见行为。

### 6.3 新增模块

| 模块 | 路径 | 作用 |
|------|------|------|
| `output/verifier.ts` | `packages/agent-core/src/output/verifier.ts` | 运行时确定性验证器 |
| `output/verification-report.ts` | `packages/agent-core/src/output/verification-report.ts` | `VerificationReport`、`QualityViolation` 类型 |
| `output/reflection-observer.ts` | `packages/agent-core/src/output/reflection-observer.ts` | 异步 LLM reviewer 调用与记录 |
| `evals/bad-case-writer.ts` | `packages/agent-core/src/evals/bad-case-writer.ts` | 将 violation 转换为 eval case 候选 |

### 6.4 Verifier 检查项

| 检查项 | 处理方式 |
|--------|----------|
| JSON schema | 复用现有 parse 结果 |
| Chart token 白名单 | 复用现有 token validator |
| Missing data disclosure | 检查输出是否基于缺失指标作具体判断 |
| Safety pattern | 检查诊断、用药、治疗承诺、绝对化表述 |
| Evidence consistency | 检查重要建议是否能关联 evidence |
| Task redline | 检查 homepage 字数、红线指标表达、语言匹配 |

### 6.5 执行动作

1. 提取现有 eval scorer 的关键逻辑到 `output/verifier.ts`。
2. 扩展 `AgentRuntimeObserver`，增加 `onVerified` 和 `onReflected` 回调。
3. 在 `agent-runtime.ts` 中接入 verifier 和 async reflection observer。
4. 记录 raw output、parsed envelope、context packet、rules、missing data、visible charts、violations。
5. 支持从 bad case artifact 生成 eval case 候选。

### 6.6 验收标准

- 主链路输出和用户可见行为不变。
- 每次 LLM 输出后可生成 `VerificationReport`。
- async reflection 能记录完整质量 artifact。
- bad case artifact 可转换为 eval case 候选。

---

## 7. P1: LLM-driven AnalysisPlan for `ADVISOR_CHAT`

### 7.1 目标

将 `ADVISOR_CHAT` 从单次自由生成升级为“先计划、后回答”。

第一版 `AnalysisPlan` 使用 **LLM planner + deterministic verifier**。相比纯规则 planner，LLM planner 更适合开放问题、多语言表达、隐含意图和复杂健康咨询。

### 7.2 AnalysisPlan Schema

```typescript
export interface AnalysisPlan {
  planId: string;
  taskType: 'advisor_chat';
  userIntent: {
    action:
      | 'status_summary'
      | 'explain_chart'
      | 'ask_why'
      | 'exercise_readiness'
      | 'compare_periods'
      | 'general';
    riskLevel: 'general' | 'safety_boundary';
    needsClarification: boolean;
    clarificationQuestion?: string;
  };
  evidenceNeeds: Array<{
    metric: 'hrv' | 'sleep' | 'activity' | 'stress' | 'spo2' | 'resting-hr';
    timeScope: 'today' | 'yesterday' | 'week' | 'month' | 'custom' | 'unknown';
    dateRange?: { start: string; end: string };
    reason: string;
    required: boolean;
  }>;
  safetyConstraints: Array<
    | 'no_diagnosis'
    | 'no_medication_advice'
    | 'no_treatment_promise'
    | 'disclose_missing_data'
    | 'recommend_doctor_when_critical'
  >;
  answerShape: {
    includeMissingDataDisclosure: boolean;
    includeChartTokens: boolean;
    maxSummaryLength: number;
    tone: 'concise' | 'explanatory';
  };
}
```

### 7.3 流程

```text
userMessage + pageContext + base packet
  -> planner LLM
  -> parse AnalysisPlan
  -> verifyAnalysisPlan()
  -> if invalid: retry planner once with verifier violations
  -> if still invalid: return clarification or safe inability response
  -> if needsClarification: return clarification response
  -> resolve evidence
  -> solver LLM generates AgentResponseEnvelope
```

### 7.4 Plan Verifier

`AnalysisPlan` 由 LLM 生成，但不能直接信任。`analysis-plan-verifier.ts` 至少需要验证：

- `taskType` 必须是 `advisor_chat`。
- `metric` 必须属于已支持指标集合。
- `dateRange` 必须合法，不能越过当前可用数据边界。
- `riskLevel` 与用户问题中的诊断、用药、运动准备度等高风险意图一致。
- `evidenceNeeds.required === true` 的证据必须可解析或明确进入 P2。
- `maxSummaryLength` 不能超过 task route 上限。

### 7.5 新增模块

| 模块 | 路径 |
|------|------|
| `planner/analysis-plan.ts` | `packages/agent-core/src/planner/analysis-plan.ts` |
| `planner/advisor-plan-builder.ts` | `packages/agent-core/src/planner/advisor-plan-builder.ts` |
| `planner/analysis-plan-verifier.ts` | `packages/agent-core/src/planner/analysis-plan-verifier.ts` |
| `prompts/advisor-plan.md` | `data/sandbox/prompts/advisor-plan.md` |

### 7.6 验收标准

- `ADVISOR_CHAT` 每次生成都有可观察的 `AnalysisPlan`。
- Solver 输出能回溯到 `AnalysisPlan.evidenceNeeds`。
- 复杂意图覆盖率高于现有 `advisor-intent.ts` 正则。
- `riskLevel: safety_boundary` 可被 P3 同步审核使用。
- Plan 生成或校验失败时有结构化 artifact 和明确用户响应。

---

## 8. P2: Plan-driven Evidence Resolver + Constrained ReAct

### 8.1 目标

让 `ADVISOR_CHAT` 基于 `AnalysisPlan` 动态补充证据，减少无关上下文干扰，并提高复杂问题回答质量。

P2 的 ReAct 是受限工具编排，不是开放式自由 agent loop。

### 8.2 Evidence Resolver

在进入 ReAct 之前，先用确定性 resolver 尽量满足 `AnalysisPlan.evidenceNeeds`：

```text
AnalysisPlan.evidenceNeeds
  -> resolve from current TaskContextPacket
  -> resolve from visible charts
  -> resolve from metric summaries
  -> resolve from timeline events
  -> unresolved required needs enter constrained ReAct
```

### 8.3 工具集

第一版工具只支持确定性查询：

| 工具 | 输入 | 输出 |
|------|------|------|
| `queryMetricSummary` | metric, date range, aggregation | `MetricSummary` + evidence ids |
| `queryVisibleChartFacts` | chart token | chart facts + evidence ids |
| `queryMissingData` | metric, scope | missing data packet |
| `queryTimelineEvents` | date range, event types | recognized events + evidence ids |

工具必须满足：

- 输入输出使用 Zod schema。
- 输出必须包含 evidence ids 或明确的 missing-data reason。
- 工具错误返回结构化错误。
- 工具错误不触发不透明路径切换。

### 8.4 Constrained ReAct Loop

```text
unresolved evidence needs
  -> planner selects next structured tool call
  -> execute tool
  -> append schema observation
  -> stop when evidence is sufficient or max steps reached
```

约束：

- 最大工具调用次数固定为 3。
- action 必须是结构化 tool call。
- observation 必须是 schema 化结果。
- final answer 只能引用 collected evidence。
- 如果 required evidence 仍无法满足，回答必须披露数据不足或请求澄清。

### 8.5 新增模块

| 模块 | 路径 |
|------|------|
| `tools/tool-types.ts` | `packages/agent-core/src/tools/tool-types.ts` |
| `tools/query-metric-summary.ts` | `packages/agent-core/src/tools/query-metric-summary.ts` |
| `tools/query-visible-chart-facts.ts` | `packages/agent-core/src/tools/query-visible-chart-facts.ts` |
| `tools/query-missing-data.ts` | `packages/agent-core/src/tools/query-missing-data.ts` |
| `tools/query-timeline-events.ts` | `packages/agent-core/src/tools/query-timeline-events.ts` |
| `executor/react-loop.ts` | `packages/agent-core/src/executor/react-loop.ts` |
| `planner/evidence-resolver.ts` | `packages/agent-core/src/planner/evidence-resolver.ts` |

### 8.6 验收标准

- 复杂 `ADVISOR_CHAT` 可以按需查询 plan 中要求的证据。
- 工具调用 artifact 可被 observer 捕获。
- 工具错误有结构化记录和用户可理解的输出路径。
- 任何最终回答中的关键事实都来自 collected evidence。
- 简单问题如果 evidence 已满足，不触发 ReAct。

---

## 9. P3: Sync Reflection Gate for High-Risk Cases

### 9.1 目标

对高风险健康回答建立阻塞式质量闸门。

P3 之前的 async reflection 只观测。P3 开始，部分高风险场景允许 reviewer 阻断候选输出。

### 9.2 触发条件

任一条件满足即触发 sync reflection：

- `AnalysisPlan.userIntent.riskLevel === 'safety_boundary'`
- 用户询问运动准备度、诊断、用药、治疗承诺。
- 输出状态为严重异常。
- deterministic verifier 出现 hard violation。
- Planner 或 verifier 判断存在缺失数据高风险误导。

### 9.3 审核流程

```text
candidate envelope
  -> deterministic verifier
  -> sync reflection reviewer
    -> approved: return
    -> rejected: return violation list
  -> solver regenerates from original AnalysisPlan + collected evidence
  -> re-run verifier/reviewer
  -> if still rejected: return safety-boundary response
```

### 9.4 关键原则

- Reviewer 不直接改写用户答案。
- Reviewer 只返回 `approved`、`violations`、`requiredChanges`。
- 被拒绝的候选输出作废。
- 重生成必须基于原始 `AnalysisPlan + collected evidence`。
- 最多重生成 1 次，仍不通过则返回安全边界说明。

### 9.5 新增模块

| 模块 | 路径 |
|------|------|
| `output/sync-reflection-gate.ts` | `packages/agent-core/src/output/sync-reflection-gate.ts` |
| `output/reflection-reviewer.ts` | `packages/agent-core/src/output/reflection-reviewer.ts` |
| `output/reflection-schema.ts` | `packages/agent-core/src/output/reflection-schema.ts` |
| `prompts/reflection/advisor-chat.md` | `data/sandbox/prompts/reflection/advisor-chat.md` |

### 9.6 验收标准

- 高风险回答能生成审核 artifact。
- Reviewer 的 rejection 可被复现和评测。
- 重生成后通过率可观测。
- 不通过时返回安全边界说明，而不是不透明文本修补。

---

## 10. P4: Heavyweight Plan and Solve + Selective Multi-Agent

### 10.1 目标

支持未来复杂健康报告、离线多角色评审和选择性在线多 Agent。

P4 不是当前主链路升级的前置条件。

### 10.2 前置条件

进入 P4 必须同时满足：

1. 产品有明确的 `COMPREHENSIVE_REPORT` 需求文档。
2. P0-P3 的 eval 数据显示当前架构无法满足该需求。
3. 离线 reviewer 数据证明多角色评审有明确质量收益。

### 10.3 Heavyweight Plan and Solve

```text
request
  -> report planner creates task DAG
  -> deterministic data services resolve subtask evidence
  -> subtask solvers produce structured findings
  -> synthesizer generates report
  -> verifier/reflection checks final report
```

适合场景：

- 月度健康报告。
- 跨指标相关性分析。
- 多时间窗口对比。
- 长期计划生成。

### 10.4 Selective Multi-Agent

Multi-Agent 引入顺序：

1. 离线 Safety Reviewer，用于 bad case 分析。
2. 高风险在线 Safety Guard，用于 P3 同步审核。
3. 深度报告中的 Planner + Synthesizer。
4. 有明确 eval 收益后，再考虑某些 Task 的在线多 Agent。

明确不做：

- 不默认让 `HOMEPAGE_SUMMARY` 和常规 `VIEW_SUMMARY` 走多 Agent。
- 不用模型替代 `rules/`。
- 不让 Data Analyst Agent 自由发明指标、阈值或事实。

---

## 11. 执行路线图

| 阶段 | 目标 | 主要交付 |
|------|------|----------|
| P0 | 质量观测基础设施 | `verifier.ts`、`reflection-observer.ts`、bad case artifacts |
| P1 | `ADVISOR_CHAT` 轻量规划层 | `AnalysisPlan` schema、planner、plan verifier、advisor plan prompt |
| P2 | 受限取证能力 | evidence resolver、4 个白名单工具、constrained ReAct loop |
| P3 | 高风险同步审核 | sync reflection gate、reviewer schema、高风险审核 prompt |
| P4 | 深度报告和选择性多 Agent | `COMPREHENSIVE_REPORT`、report planner、synthesizer、离线 reviewer |

实施顺序必须遵守：

1. 先 P0 观测，再改用户可见主链路。
2. 先 `ADVISOR_CHAT`，不改首页和常规视图摘要。
3. 先确定性 resolver，再受限 ReAct。
4. 先 async reflection 观测，再 sync reflection 阻断。
5. 先离线多角色评审，再考虑在线多 Agent。

---

## 12. 验收指标

### 12.1 质量指标

| 指标 | P0 | P1 | P2 | P3 |
|------|----|----|----|----|
| Safety hard violation | 可观测 | 不上升 | 不上升 | 明显下降 |
| Missing data 幻觉 | 可观测 | 不上升 | 下降 | 不上升 |
| Evidence required fact 命中率 | 可观测 | 提升 | 继续提升 | 不下降 |
| `ADVISOR_CHAT` 复杂意图覆盖率 | 可观测 | 提升 | 不下降 | 不下降 |
| 高风险 rejection 后通过率 | 不适用 | 不适用 | 不适用 | 可观测 |

### 12.2 架构指标

| 指标 | P0 | P1 | P2 | P3 |
|------|----|----|----|----|
| 每个 LLM 输出有 verification report | 是 | 是 | 是 | 是 |
| 每个 `ADVISOR_CHAT` 请求有 plan artifact | 不适用 | 是 | 是 | 是 |
| 每个工具调用有 action/observation artifact | 不适用 | 不适用 | 是 | 是 |
| 每个 reflection rejection 可回放 | 不适用 | 不适用 | 不适用 | 是 |
| Eval case 可从 bad case artifact 生成 | 是 | 是 | 是 | 是 |

### 12.3 当前非目标

当前阶段不把以下内容作为主要验收：

- 平均响应时延降低。
- LLM 调用次数减少。
- Token 成本最低。
- 首页和常规视图摘要多 Agent 化。

---

## 13. 一句话总结

最终方案是：**先用 verifier 和 async reflection 把质量问题看清楚，再用 LLM `AnalysisPlan` 重构 `ADVISOR_CHAT` 的推理入口，然后用确定性 Evidence Resolver 和受限 ReAct 做按需取证，最后只在高风险场景启用同步 Reflection；Multi-Agent 和重型报告规划保持后置。**

