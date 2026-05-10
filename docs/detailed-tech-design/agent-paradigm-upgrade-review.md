# Agent 范式升级代码审查报告

> **审查日期**: 2026-05-09
> **审查范围**: T1–T11（P0–P3）全部代码 + 设计文档 vs 执行指南 gap 分析
> **审查基准**: `agent-paradigm-upgrade-design.md` + `agent-paradigm-upgrade-execution-guide.md`

---

## 1. 执行摘要

| 统计 | 数量 |
|------|------|
| CRITICAL | 2 |
| HIGH | 3 |
| MEDIUM | 16 |
| LOW | 20 |
| SUGGESTION | 5 |

**整体评价**: 架构设计清晰，代码结构合理，测试基础扎实。但存在 **2 个 CRITICAL 问题**阻塞验收：
1. T1 `toProviderEnv` 缺失角色环境变量映射，导致 planner/reviewer 独立配置在运行时完全不生效
2. P2 ReAct Loop + Evidence Resolver 未接入 Runtime，P2 能力在生产中不可用

此外有 3 个 HIGH 级别问题和 16 个 MEDIUM 问题需要关注。

---

## 2. 必须修复（CRITICAL + HIGH）

### CRITICAL-1: `toProviderEnv` 缺失 planner/reviewer 环境变量映射

- **来源**: T1 代码审查
- **文件**: `apps/agent-api/src/runtime/registry.ts:282-292`
- **问题**: `toProviderEnv` 只映射了 `LLM_*` 全局变量，没有映射 `PLANNER_LLM_*` 和 `REVIEWER_LLM_*`。即使用户配置了 `PLANNER_LLM_MODEL=gpt-4o`，经转换后这些值也会丢失。planner 和 reviewer 角色永远无法使用独立配置，全部 fallback 到 `LLM_*` 全局值。
- **修复**: 在 `toProviderEnv` 中补充所有 `PLANNER_LLM_*` 和 `REVIEWER_LLM_*` 字段的映射：
  ```typescript
  // 补充 planner 独立配置
  if (config.PLANNER_LLM_PROVIDER) env.PLANNER_LLM_PROVIDER = config.PLANNER_LLM_PROVIDER;
  if (config.PLANNER_LLM_MODEL) env.PLANNER_LLM_MODEL = config.PLANNER_LLM_MODEL;
  // ... 其余 PLANNER_LLM_* 字段
  // 补充 reviewer 独立配置
  if (config.REVIEWER_LLM_PROVIDER) env.REVIEWER_LLM_PROVIDER = config.REVIEWER_LLM_PROVIDER;
  // ... 其余 REVIEWER_LLM_* 字段
  ```

### CRITICAL-2: P2 ReAct Loop + Evidence Resolver 未接入 Runtime

- **来源**: P2 代码审查
- **文件**: `packages/agent-core/src/runtime/agent-runtime.ts`
- **问题**: `resolveEvidenceByPlan` 和 `runConstrainedReAct` 已实现并通过测试，但 `executeAgent` 中没有任何地方引用它们。P2 的"受限取证"能力在生产中完全不可用。
- **修复**: 在 `executeAgent` 的 ADVISOR_CHAT 路径中，plan 成功后：
  1. 调用 `resolveEvidenceByPlan(analysisPlan, packet)` 解析证据
  2. 当 `unresolved.length > 0` 时调用 `runConstrainedReAct` 收集额外证据
  3. 将收集到的证据注入 task prompt
  4. 在 `AgentRuntimeDeps` 中增加 ReAct 相关依赖
  5. 在 `AgentRuntimeObserver` 中增加 `onReActStep` 和 `onEvidenceResolved` 回调

### HIGH-1: 缺失 `createChatModelForRole` 单元测试

- **来源**: T1 代码审查
- **文件**: 缺失测试文件
- **问题**: 执行指南验收标准明确要求"createChatModelForRole 有对应单元测试"，当前完全缺失。
- **修复**: 新增测试，验证为每个角色创建对应的 ChatModel。

### HIGH-2: `queryMetricSummary` 中 evidenceIds 取值来源可能错误

- **来源**: P2 代码审查
- **文件**: `packages/agent-core/src/tools/query-metric-summary.ts:63`
- **问题**: 当数据来源为 `chartMatch.dataSummary` 时，`evidenceIds` 使用 `summary.evidenceIds`（MetricSummary 维度），而非 `chartMatch.evidenceIds`（图表维度）。测试用例恰好掩盖了这个问题。
- **修复**: 明确 evidenceIds 的来源语义，选择正确的维度并在注释中说明。

### HIGH-3: `onParsed` 回调时序在 verifier/reflection 之后

- **来源**: P0 代码审查
- **文件**: `packages/agent-core/src/runtime/agent-runtime.ts:350`
- **问题**: `onParsed` 在第 350 行触发，位于 verifier 和 reflection 代码之后。理想时序应为 `onParsed → onVerified → onReflected`，使 observer 回调顺序更清晰。
- **修复**: 将 `onParsed` 调用移到 result 构建完成后、verifier 调用之前。

---

## 3. 建议修复（MEDIUM）

### MEDIUM-1: 执行指南中 prefix 模板代码与实际实现不一致（环境变量命名）

- **来源**: 文档 gap 分析 + T1 代码审查
- **文件**: `packages/agent-core/src/provider/provider-config.ts:18`
- **问题**: 执行指南步骤 3 代码模板写 `LLM_${role.toUpperCase()}`（即 `LLM_PLANNER_*`），实际实现写 `${role.toUpperCase()}_LLM`（即 `PLANNER_LLM_*`）。实现与 env.ts 一致，是执行指南有笔误。
- **修复**: 更新执行指南步骤 3 的 prefix 为 `${role.toUpperCase()}_LLM`。

### MEDIUM-2: `env.ts` Zod 默认值会覆盖角色默认 temperature

- **来源**: T1 代码审查
- **文件**: `apps/agent-api/src/config/env.ts:20` + `packages/agent-core/src/constants/defaults.ts`
- **问题**: `LLM_TEMPERATURE` 在 env.ts 中有 Zod 默认值 `0.3`。当未设置 `PLANNER_LLM_TEMPERATURE` 时，fallback 到 `LLM_TEMPERATURE=0.3`，覆盖了 planner 角色默认的 `0.1`。reviewer 的 `0.0` 也会被覆盖。
- **修复**: 方案有二：(a) `toProviderEnv` 只传递用户显式设置的值；(b) `env.ts` 中 `LLM_TEMPERATURE` 使用 optional + 无默认值。推荐方案 (a)。

### MEDIUM-3: `initializeAgent` 函数签名与执行指南不同

- **来源**: T1 代码审查
- **文件**: `packages/agent-core/src/executor/agent-initializer.ts:6-9`
- **问题**: 执行指南定义 `initializeAgent(configs: ResolvedLlmConfig)`，实际实现保留了旧签名 `initializeAgent(providerConfig)`，新增了 `initializeAgents`（复数）。设计决策合理（向后兼容），但与执行指南不符。
- **修复**: 在执行指南中记录此偏差。

### MEDIUM-4: `registry.ts` 中 `FALLBACK_ONLY_MODE` 分支冗余

- **来源**: T1 代码审查
- **文件**: `apps/agent-api/src/runtime/registry.ts:133-141`
- **问题**: FALLBACK_ONLY_MODE 下手动调用三次 `resolveProviderConfig` 构造 `ResolvedLlmConfig`，然后又用 `FakeChatModel` 创建新 agent，前面的 `initializeAgents` 完全浪费。
- **修复**: 统一使用 `resolveAllLlmConfigs(providerEnv)`，或在 fallback 模式下跳过 `initializeAgents`。

### MEDIUM-5: `env.ts` 中 `LLM_MAX_RETRIES` 默认值与 `DEFAULT_MAX_RETRIES` 不一致

- **来源**: T1 代码审查
- **文件**: `apps/agent-api/src/config/env.ts:22` + `packages/agent-core/src/constants/defaults.ts:7`
- **问题**: env.ts 默认值 `2`，defaults.ts 中 `DEFAULT_MAX_RETRIES = 0`。两套默认值不一致。
- **修复**: 统一默认值，建议 `DEFAULT_MAX_RETRIES = 2`。

### MEDIUM-6: envelope 的"深拷贝"实际是浅拷贝

- **来源**: P0 代码审查
- **文件**: `packages/agent-core/src/output/verifier.ts:324`
- **问题**: 注释标注"深拷贝"，但 `{ ...input.envelope }` 是浅拷贝。如果 envelope 中引用类型字段后续被修改，report 中的快照也会受影响。
- **修复**: 使用 `structuredClone(input.envelope)` 做真深拷贝，或修改注释为"浅拷贝快照"。

### MEDIUM-7: `ReflectionObserverDeps` 未使用 PromptLoader 接口

- **来源**: P0 代码审查
- **文件**: `packages/agent-core/src/output/reflection-observer.ts:8-13`
- **问题**: 执行指南要求通过 PromptLoader 加载 prompt，实际实现直接注入 `reviewerPrompt: string`。与 plan-builder 一致，但偏离执行指南。
- **修复**: 在执行指南中记录此偏差，统一为直接注入模式。

### MEDIUM-8: `ReflectionArtifact.reviewerModel` 硬编码为 `'configured'`

- **来源**: P0 代码审查
- **文件**: `packages/agent-core/src/output/reflection-observer.ts:76`
- **问题**: 无法从 artifact 中获知实际使用的审核模型名称，降低了可观测性。
- **修复**: 从配置中获取实际模型名称，注入到 `ReflectionObserverDeps` 中。

### MEDIUM-9: `bad-case-writer` 中 `forbiddenPatterns` 使用了自然语言描述

- **来源**: P0 代码审查
- **文件**: `packages/agent-core/src/evals/bad-case-writer.ts:78`
- **问题**: `safety.forbiddenPatterns` 被设置为 issues 的 description（自然语言），但 `forbiddenPatterns` 期望正则表达式字符串。自然语言作为正则永远不会匹配，safety expectation 实际无效。
- **修复**: 从 issues 中提取可正则化的模式，或使用不同的 expectations 字段（如 `mustNotMention`）。

### MEDIUM-10: verifier 测试缺少 `checkTaskRedlines` 和 `checkEvidenceConsistency` 覆盖

- **来源**: P0 代码审查
- **文件**: `packages/agent-core/src/__tests__/output/verifier.test.ts`
- **问题**: 5 个检查项中 2 个没有测试覆盖（homepage 字数红线、parse failure、evidence consistency）。
- **修复**: 补充测试用例覆盖这些场景。

### MEDIUM-11: 异步 reflection 的 `.catch()` 完全吞掉错误信息

- **来源**: P0 代码审查
- **文件**: `packages/agent-core/src/runtime/agent-runtime.ts:345-347`
- **问题**: `.catch(() => {})` 完全吞掉错误，无法发现和排查 reflection 问题。
- **修复**: 至少添加 warning 级别日志。

### MEDIUM-12: Verifier 规则 2 和规则 6 产生重复 violation

- **来源**: P1 代码审查
- **文件**: `packages/agent-core/src/planner/analysis-plan-verifier.ts:76-86`
- **问题**: 不支持的 metric 同时触发 `unsupported_metric` 和 `required_evidence_unresolvable`，冗余 violations 可能造成重试时 planner 困惑。
- **修复**: 规则 6 排除已被规则 2 覆盖的情况，或在注释中说明双重报告的意图。

### MEDIUM-13: `PlanBuilderDeps` 接口与执行指南不一致

- **来源**: P1 代码审查
- **文件**: `packages/agent-core/src/planner/advisor-plan-builder.ts:9-13`
- **问题**: 执行指南要求 `promptLoader: PromptLoader`，实际使用 `plannerPrompt: string` 直接注入。
- **修复**: 在执行指南中记录此偏差，与 MEDIUM-7 统一。

### MEDIUM-14: 集成测试缺少 VIEW_SUMMARY 不受影响的测试

- **来源**: P1 代码审查
- **文件**: `packages/agent-core/src/runtime/__tests__/advisor-chat-runtime.test.ts`
- **问题**: 执行指南要求验证 HOMEPAGE_SUMMARY 和 VIEW_SUMMARY 不受影响，只有 HOMEPAGE 被测试。
- **修复**: 补充 VIEW_SUMMARY + planBuilder 的测试用例。

### MEDIUM-15: ReAct Loop 中 need 消除策略过于简单

- **来源**: P2 代码审查
- **文件**: `packages/agent-core/src/executor/react-loop.ts:121`
- **问题**: `remainingNeeds.shift()` 移除第一个 need，但工具调用的 metric 可能不对应 needs[0]。导致 need 与实际收集的证据不匹配。
- **修复**: 根据工具返回的 metric/evidenceIds 与 remaining needs 做精确匹配。

### MEDIUM-16: evidence-resolver 只按 metric 匹配，未考虑 timeScope

- **来源**: P2 代码审查
- **文件**: `packages/agent-core/src/planner/evidence-resolver.ts:50-51`
- **问题**: plan 要求 `hrv` 的 `today` 数据，但 packet 中可能只有 `week` 维度数据，也会被视为已满足。
- **修复**: 至少在 visibleCharts 匹配时增加 timeframe 校验。

---

## 4. 改进建议（LOW + SUGGESTION）

### LOW-1: 设计文档已裁定决策表与执行指南不完全一致

- **来源**: 文档 gap 分析
- **问题**: 执行指南跳过了设计文档第 10 条"重型 Plan and Solve 何时做"，改为在 P4 范围说明中隐含。
- **修复**: 在执行指南已裁定决策表中补全该条目。

### LOW-2: 设计文档 P0 新增模块表缺少 `reflection-types.ts`

- **来源**: 文档 gap 分析
- **问题**: 执行指南 T3 新增了 `reflection-types.ts`，设计文档 6.3 节无对应条目。
- **修复**: 在设计文档中补充。

### LOW-3: 设计文档 P3 prompt 路径与执行指南不一致

- **来源**: 文档 gap 分析
- **问题**: 设计文档列 `advisor-chat.md`，执行指南拆为 `advisor-chat.md`（async）+ `advisor-chat-gate.md`（sync）。
- **修复**: 更新设计文档 9.5 节的 prompt 路径为 `advisor-chat-gate.md`。

### LOW-4: 设计文档要求"记录 raw output"但执行指南未明确实现

- **来源**: 文档 gap 分析
- **问题**: 设计文档 6.5 节要求记录 raw output，但 `VerificationReport` 和 `ReflectionArtifact` 中都没有。
- **修复**: 通过现有 `onModelOutput` 回调采集，或在执行指南中明确说明。

### LOW-5: Plan Verifier 中 `dateRange` 字符串比较缺少格式校验

- **来源**: P1 代码审查
- **文件**: `packages/agent-core/src/planner/analysis-plan-verifier.ts:45-46`
- **问题**: 字符串比较依赖 YYYY-MM-DD 格式，schema 未约束日期格式。
- **修复**: 在 schema 中添加 regex 校验 `^\d{4}-\d{2}-\d{2}$`。

### LOW-6: `maxSummaryLength` 硬编码为 800

- **来源**: P1 代码审查
- **文件**: `packages/agent-core/src/planner/advisor-plan-builder.ts:72`
- **修复**: 作为 `PlanBuilderInput` 的可选参数或从常量配置中读取。

### LOW-7: Plan 失败 fallback 响应未包含 `source` 标识

- **来源**: P1 代码审查
- **文件**: `packages/agent-core/src/runtime/agent-runtime.ts:552-569`
- **修复**: 添加 `source: 'planner-fallback'` 标识。

### LOW-8: `appendPlanContextToPrompt` 的 `_packet` 参数未使用

- **来源**: P1 代码审查
- **文件**: `packages/agent-core/src/runtime/agent-runtime.ts:489-528`
- **修复**: 当前不需要可移除，P2 集成时再添加。

### LOW-9: `MetricTypeEnum` 等未使用的类型导出

- **来源**: P1 代码审查
- **文件**: `packages/agent-core/src/planner/analysis-plan.ts:64-71`
- **修复**: 如无外部使用需求，移除。

### LOW-10: safety-scorer 中 `NEGATION_PREFIX_PATTERNS` 有重复项

- **来源**: P0 代码审查
- **文件**: `packages/agent-core/src/evals/scorers/safety-scorer.ts:22-32`
- **问题**: `/不建议/` 出现两次。verifier 和 safety-scorer 各自维护副本，存在 drift 风险。
- **修复**: 提取共享正则模式到公共模块。

### LOW-11: 测试文件路径与执行指南不一致

- **来源**: P0 代码审查
- **问题**: 执行指南指定 `output/__tests__/`，实际在 `__tests__/output/`。
- **修复**: 统一或更新执行指南。

### LOW-12: `checkChartTokens` 对空白名单时的行为未注释

- **来源**: P0 代码审查
- **文件**: `packages/agent-core/src/output/verifier.ts:153-188`
- **修复**: 添加注释说明空白名单时跳过校验的理由。

### LOW-13: `ReflectionObserverInput` 类型过于简化

- **来源**: P0 代码审查
- **文件**: `packages/agent-core/src/output/reflection-observer.ts:17-46`
- **问题**: 使用内联结构体代替完整的 `AgentContext`/`TaskContextPacket`，字段变化时不会产生编译错误。
- **修复**: 考虑直接使用完整类型。

### LOW-14: `parseReflectionResponse` 中 `qualityScore: 0` 超出声明范围

- **来源**: P0 代码审查
- **文件**: `packages/agent-core/src/output/reflection-observer.ts:157-178`
- **问题**: catch 块中返回 `qualityScore: 0`，但注释声明 1-5 范围。
- **修复**: 统一默认值为 1，或在注释中明确 0 表示解析失败。

### LOW-15: `queryVisibleChartFacts` 输出 schema 中 metric 用 `z.string()` 而非 `MetricType`

- **来源**: P2 代码审查
- **文件**: `packages/agent-core/src/tools/query-visible-chart-facts.ts:17`
- **修复**: 改为 `MetricType` 保持一致。

### LOW-16: `queryTimelineEvents` 数据源在 ADVISOR_CHAT 中可能为空

- **来源**: P2 代码审查
- **文件**: `packages/agent-core/src/tools/query-timeline-events.ts:32`
- **问题**: 只从 `homepage?.recentEvents` 获取，ADVISOR_CHAT 中 homepage 通常为 undefined。
- **修复**: 扩展数据源或明确说明工具限制。

### LOW-17: `shouldTriggerSyncGate` 条件 3 使用 `overallStatus` 与执行指南不一致

- **来源**: P2 代码审查
- **文件**: `packages/agent-core/src/runtime/agent-runtime.ts:591`
- **问题**: 执行指南写 `context.signals.severeAnomaly`，实现用 `overallStatus === 'red'`。
- **修复**: 更新执行指南以反映实际字段名。

### LOW-18: ReAct Loop 中存在白名单校验死代码

- **来源**: P2 代码审查
- **文件**: `packages/agent-core/src/executor/react-loop.ts:79-88`
- **问题**: `selectTool` 内部已做白名单校验，外层第 79-88 行永远不执行。
- **修复**: 移除死代码。

### LOW-19: Sync Gate 重生成审核结果缺少"第几次"标识

- **来源**: P2 代码审查
- **文件**: `packages/agent-core/src/output/sync-reflection-gate.ts:62`
- **修复**: 增加 `attemptNumber` 或 `isRegenerated` 字段。

### LOW-20: `parseInt`/`parseFloat` 对非法值容错不足

- **来源**: T1 代码审查
- **文件**: `packages/agent-core/src/provider/provider-config.ts:24-29`
- **问题**: `parseInt('abc')` 返回 NaN，不报错但后续行为不可预期。
- **修复**: 添加 isNaN 检查。

### SUGGESTION-1: `needsClarification` 路径不触发 `onPlanBuilt`

- **来源**: P1 代码审查
- **文件**: `packages/agent-core/src/runtime/agent-runtime.ts:158-163`
- **问题**: 验收标准要求每次请求都有 plan artifact，但 clarification 路径跳过。
- **修复**: 在返回前触发 `onPlanBuilt`。

### SUGGESTION-2: Plan Builder 测试未验证 userPrompt 完整内容

- **来源**: P1 代码审查
- **修复**: 补充测试验证 prompt 包含指标列表、时间范围等。

### SUGGESTION-3: `apiKey` fallback 为空字符串而非报错

- **来源**: T1 代码审查
- **文件**: `packages/agent-core/src/provider/provider-config.ts:22`
- **修复**: 可增加 strict 模式参数，非 fallback 模式下 apiKey 为空时抛错。

### SUGGESTION-4: P0 设计文档中 evidence consistency 检查缺少 P0 阶段实现策略

- **来源**: 文档 gap 分析
- **问题**: P0 没有 AnalysisPlan，evidence consistency 检查缺乏明确输入来源。
- **修复**: 在执行指南中明确 P0 阶段的简化实现策略。

### SUGGESTION-5: 设计文档 artifact 回放机制未展开

- **来源**: 文档 gap 分析
- **问题**: 设计文档要求 artifact 可进入 eval 回放，但执行指南未说明具体回放路径。
- **修复**: 在 T4 中补充 artifact 存储格式和查询接口说明。

---

## 5. 各阶段验收状态

| 阶段 | 验收状态 | 阻塞问题 |
|------|---------|---------|
| T1 基础设施 | **未通过** | CRITICAL-1（toProviderEnv 缺失映射）、HIGH-1（缺失测试）、MEDIUM-2（temperature 覆盖） |
| P0（T2-T4） | **基本通过** | 需补充 verifier 测试覆盖、修复 onParsed 时序 |
| P1（T5-T7） | **基本通过** | 需补充 VIEW_SUMMARY 测试、记录 PlanBuilderDeps 偏差 |
| P2（T8-T9） | **未通过** | CRITICAL-2（未接入 Runtime）、need 消除策略、timeScope 匹配 |
| P3（T10-T11） | **基本通过** | collectedEvidence 依赖 P2 集成后修复 |

---

## 6. 修复优先级建议

### 第一优先级（阻塞验收，必须立即修复）

1. **CRITICAL-1**: 修复 `toProviderEnv` 角色变量映射
2. **CRITICAL-2**: 完成 P2 ReAct + Evidence Resolver 的 Runtime 集成
3. **HIGH-1**: 补充 `createChatModelForRole` 单元测试

### 第二优先级（影响正确性，建议本次修复）

4. **HIGH-2**: 修复 `queryMetricSummary` evidenceIds 来源
5. **HIGH-3**: 调整 `onParsed` 回调时序
6. **MEDIUM-2**: 修复 temperature 默认值覆盖链路
7. **MEDIUM-5**: 统一 `maxRetries` 默认值
8. **MEDIUM-9**: 修复 bad-case-writer forbiddenPatterns 误用
9. **MEDIUM-10**: 补充 verifier 测试覆盖
10. **MEDIUM-14**: 补充 VIEW_SUMMARY 测试
11. **MEDIUM-15**: 修复 ReAct need 消除策略
12. **MEDIUM-16**: evidence-resolver 增加 timeScope 匹配

### 第三优先级（改进质量，可后续迭代）

- 其余 MEDIUM、LOW、SUGGESTION 级别问题
