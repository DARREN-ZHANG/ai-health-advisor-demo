# Agent 范式升级代码复审报告（第四轮）

> **审查日期**: 2026-05-09
> **审查类型**: 独立复审（不以前三轮结果为基线）
> **审查范围**: T1–T11（P0–P3）全部代码
> **审查 Agent**: 5 个并行 agent（端到端数据流、错误路径韧性、Prompt 工程、状态安全与并发、跨包边界配置）
> **已知延期项**: 第三轮 H-9（共享常量）、H-10（sync gate 测试）、H-11（独立单元测试）、H-13（SafetyConstraint 映射）

---

## 1. 执行摘要

| 统计 | 数量 |
|------|------|
| CRITICAL | 5 |
| HIGH | 11 |
| MEDIUM | 10 |
| LOW | 4 |

**核心结论**: 本轮从全新维度审查，发现了之前所有轮次均未捕获的严重问题。最关键的是 **prompt 与代码之间的枚举不一致**：`advisor-plan.md` 中 `riskLevel` 缺少 `potential_risk` 选项、`SafetyConstraint` 使用省略号隐藏了 3 个关键约束。这些直接影响 LLM 的输出质量和安全审核的触发准确性。另外，`resolveEvidenceByPlan` 无 try-catch 保护，P2 失败会级联为整个请求 fallback。

---

## 2. CRITICAL 问题（必须修复）

### C-1: advisor-plan.md 中 riskLevel 枚举缺少 `potential_risk`

- **发现者**: Prompt 工程审查
- **文件**: `data/sandbox/prompts/advisor-plan.md:21`
- **问题**: prompt 中 `riskLevel` 仅列出 `<general|safety_boundary>` 两个值，但 Zod schema（`analysis-plan.ts:31`）定义了三个值（含 `potential_risk`）。`shouldTriggerSyncGate` 依赖 `potential_risk` 触发同步审核。
- **影响**: LLM 无法输出 `potential_risk`，中间风险场景被错误标记为 `general`，高风险场景可能绕过安全审核。
- **修复**: 将 prompt 改为 `<general|potential_risk|safety_boundary>`，增加 `potential_risk` 使用场景说明。

### C-2: advisor-plan.md 中 SafetyConstraint 使用省略号，隐藏 3 个关键约束

- **发现者**: Prompt 工程审查
- **文件**: `data/sandbox/prompts/advisor-plan.md:34`
- **问题**: prompt 示例为 `["no_diagnosis", "no_medication_advice", ...]`，使用 `...` 省略。实际 schema 有 5 个精确值，其中 `no_treatment_promise`、`disclose_missing_data`、`recommend_doctor_when_critical` 在 prompt 中完全缺失。
- **影响**: `disclose_missing_data` 是 `shouldTriggerSyncGate` 条件 5 的触发依据。LLM 不知道这个约束存在，不会在 plan 中包含它，sync gate 条件 5 永远无法通过此路径触发。
- **修复**: 完整列出所有 5 个枚举值，并为每个约束提供适用场景说明。

### C-3: resolveEvidenceByPlan 无 try-catch，P2 失败级联为整体 fallback

- **发现者**: 错误路径审查
- **文件**: `packages/agent-core/src/runtime/agent-runtime.ts:192-193`
- **问题**: `resolveEvidenceByPlan` 没有内部 try-catch。如果它抛出异常（如 `packet.evidence` 格式异常），异常传播到外层 catch（第 448 行），返回通用的 `provider_error` fallback。
- **影响**: 本应只是缺少额外证据（P2 失败），solver 仍可基于已有 prompt 工作。但实际上整个请求被降级为 fallback 响应——从"稍差的分析"跳变为"完全无法分析"。
- **修复**: 包裹 try-catch，捕获异常时将 `resolvedEvidence` 设为 undefined，让后续流程继续执行。P2 失败不应阻断主链路。

### C-4: ReAct collectedEvidence 类型声明缺少 metric 字段

- **发现者**: 错误路径审查
- **文件**: `packages/agent-core/src/executor/react-loop.ts:66`
- **问题**: `collectedEvidence` 类型声明为 `Array<{ data: unknown; evidenceIds: string[] }>`，不含 `metric`。但第 120 行实际 push 的对象包含 `metric: targetMetric`。runtime 层第 219 行访问 `e.metric` 依赖了类型系统中不存在的字段。
- **影响**: 当 `targetMetric` 为 undefined（toolInput 中无 metric 字段）时，`e.metric` 为 undefined，精确匹配失败，回退到 `unresolved[0]!`，evidence 被错误关联。
- **修复**: 修改类型声明为 `Array<{ data: unknown; evidenceIds: string[]; metric?: string }>`。

### C-5: ReAct 超时中断后 evidence 可能处于不一致状态

- **发现者**: 端到端数据流审查
- **文件**: `packages/agent-core/src/runtime/agent-runtime.ts:200-230`
- **问题**: ReAct 循环被 setTimeout 超时 abort 时，`collectedEvidence` 可能包含部分证据但 need 消除未完成。这些不完整证据仍被追加到 `resolvedEvidence`（第 216-227 行），且因 metric 可能缺失被关联到错误的 need。
- **影响**: 被中断的 ReAct 循环产生的部分证据可能导致 solver 基于错误的证据关联给出不准确的分析。
- **修复**: ReAct 被中断时不应将 `collectedEvidence` 追加到 `resolvedEvidence`，或在追加时验证 evidence 的完整性。

---

## 3. HIGH 问题（强烈建议修复）

### H-1: planner prompt 缺少 basePacket 数据上下文

- **发现者**: 端到端数据流审查
- **文件**: `packages/agent-core/src/planner/advisor-plan-builder.ts:120-156`
- **问题**: `buildPlannerUserPrompt` 只使用 `userMessage`、`pageContext`、`supportedMetrics`、`availableDateRange`。`basePacket`（TaskContextPacket）完全未传入 prompt。planner 不知道哪些指标有数据、数据完整度如何。
- **影响**: planner 为无数据的指标生成 evidenceNeed，后续 verifier 规则 6 捕获并触发重试，浪费 LLM 调用。
- **修复**: 在 prompt 中加入 basePacket 关键信息摘要：有数据的 metric 列表、数据窗口完整度、当前可见图表。

### H-2: evidence-resolver 不利用 advisorChat.relevantFacts 数据源

- **发现者**: 端到端数据流审查
- **文件**: `packages/agent-core/src/planner/evidence-resolver.ts:45-105`
- **问题**: resolver 只从 `packet.evidence`、`visibleCharts`、`homepage.trend7d` 三个路径查找。对 ADVISOR_CHAT 请求，`packet.advisorChat.relevantFacts` 是丰富的精确数据源，但完全被忽略。且 `homepage` 在 ADVISOR_CHAT 中为 undefined，第 3 路径永远无效。
- **影响**: ADVISOR_CHAT 请求只有 2 个有效数据源路径，本可解析的证据被标记为 unresolved，不必要地触发 ReAct 循环。
- **修复**: 增加第 4 数据源路径，从 `packet.advisorChat?.relevantFacts` 中查找匹配 metric 的事实。

### H-3: verifier chart token 校验范围与 runtime 不一致

- **发现者**: 端到端数据流审查
- **文件**: `packages/agent-core/src/output/verifier.ts:152-188` vs `agent-runtime.ts:265-277`
- **问题**: runtime 的 `allowedTokens` 包含 `visibleCharts` + `homepage.suggestedChartTokens` + `viewSummary.suggestedChartTokens` 三个来源，但 verifier 只检查 `visibleCharts`。来自 `suggestedChartTokens` 的合法 token 会被 verifier 标记为违规。
- **影响**: 合法的 suggestedChartToken 产生 false positive hard violation，可能触发不必要的 sync gate 审核。
- **修复**: 在 `checkChartTokens` 中使用与 runtime 一致的 allowed token 集合。

### H-4: evidence-resolver 第一路径不按 timeScope 过滤

- **发现者**: 端到端数据流审查
- **文件**: `packages/agent-core/src/planner/evidence-resolver.ts:49-64`
- **问题**: 第一个数据源路径只按 `e.metric === need.metric` 过滤，不考虑 `need.timeScope`。第二个路径（visibleCharts）正确加入了 `isTimeScopeCompatible` 检查，但第一个完全没有时间范围过滤。
- **影响**: resolved evidence 可能包含不需要的时间范围数据。
- **修复**: 在第一个路径中加入基于 `need.timeScope` 的过滤。

### H-5: selectTool 中空 toolName 导致 break 而非 continue

- **发现者**: Prompt 工程审查
- **文件**: `packages/agent-core/src/executor/react-loop.ts:78` + `data/sandbox/prompts/react-tool-select.md:16`
- **问题**: prompt 规则 4 告知 LLM"无合适工具时输出空 toolName"，但 `selectTool` 返回 `{ success: false }` 后循环直接 `break`，终止所有后续 need 处理。本应继续尝试下一个 need。
- **影响**: 部分需要无法匹配工具时，所有剩余需要也被跳过，ReAct 循环过早终止。
- **修复**: 将 `break` 改为 `continue`，跳过当前需要继续处理下一个。

### H-6: buildToolSelectionPrompt 不包含工具的 input schema 信息

- **发现者**: Prompt 工程审查
- **文件**: `packages/agent-core/src/executor/react-loop.ts:208-213`
- **问题**: prompt 只输出工具名和 description，没有告知 LLM 每个工具接受的 input 字段名和类型。LLM 不知道 `input` 里该填什么。
- **影响**: LLM 输出错误的 input 字段名或遗漏必填字段，导致工具执行结果不对，需要无法被消除。
- **修复**: 为每个工具输出 inputSchema 的字段名和类型摘要。

### H-7: reloadProfiles 存在竞态条件

- **发现者**: 状态安全审查
- **文件**: `apps/agent-api/src/runtime/registry.ts:251-257`
- **问题**: `reloadProfiles()` 先 `profiles.clear()` 再逐个 `profiles.set()`。在 clear 到重新填充完成之间的时间窗口，并发请求可能读到空或不完整的 profiles Map。
- **影响**: 高并发场景下请求可能读到空 profiles，导致运行时错误或不正确的分析结果。
- **修复**: 使用原子引用替换：先构建新 Map，再一次性替换引用。

### H-8: selectTool 静默吞掉 JSON 解析错误

- **发现者**: 错误路径审查
- **文件**: `packages/agent-core/src/executor/react-loop.ts:164-184`
- **问题**: 空 `catch {}` 捕获所有 JSON 解析和 schema 校验异常，返回 `{ success: false }` 导致循环 break，无诊断信息。
- **影响**: LLM 返回格式异常时 ReAct 循环立即终止且无诊断信息，调试困难。
- **修复**: 在 catch 中记录错误信息到 steps 或新增 `abortedReason` 字段。

### H-9: Sync Gate 超时预算失控

- **发现者**: 错误路径审查 + 状态安全审查
- **文件**: `packages/agent-core/src/runtime/agent-runtime.ts:329-417`
- **问题**: Sync gate 流程包含最多 3 次额外 LLM 调用（审核 + 重生成 + 再审核），只有重生成有 `withTimeout`，reviewer 调用无超时控制。总耗时可达 `3 × timeoutMs`。
- **影响**: 高风险请求处理时间可能大幅超出 SLA。
- **修复**: 为整个 Sync Gate 流程创建共享 AbortController，传递剩余时间给每次调用。

### H-10: ReAct tool input 无 schema 验证

- **发现者**: 错误路径审查
- **文件**: `packages/agent-core/src/executor/react-loop.ts:81-84`
- **问题**: `ToolCallSchema` 只验证 toolName 和 input 是任意键值对。`ToolDefinition.inputSchema` 未在执行前调用 safeParse 验证。
- **影响**: 格式错误的 tool input 可能导致工具执行异常。
- **修复**: 在执行前增加 `tool.inputSchema.safeParse(toolInput)` 验证。

### H-11: reflection prompt 缺少原始 systemPrompt 的安全规则

- **发现者**: Prompt 工程审查
- **文件**: `packages/agent-core/src/output/reflection-observer.ts:94-152`
- **问题**: `buildReviewerUserPrompt` 不使用 `systemPrompt` 和 `taskPrompt` 字段（标注"预留"但从未使用）。reviewer 无法看到原始安全指令（如"不要做诊断"），无法判断回复是否违反了系统规则。
- **影响**: reviewer 缺少判断"回复是否遵循了系统指令"的依据，审核维度不完整。
- **修复**: 在 prompt 中注入 systemPrompt 的安全相关规则摘要。

---

## 4. MEDIUM 问题（建议修复）

### M-1: temperature 全局值覆盖角色默认值，与注释意图矛盾

- **文件**: `packages/agent-core/src/provider/provider-config.ts:27-29`
- **问题**: `resolveProviderConfig` 的 temperature fallback 链为 `{ROLE}_LLM_TEMPERATURE` → `LLM_TEMPERATURE` → `ROLE_DEFAULTS.temperature`。设置全局 `LLM_TEMPERATURE=0.3` 会覆盖 planner 的 0.1 和 reviewer 的 0.0。
- **修复**: temperature 的 fallback 链应跳过 `LLM_TEMPERATURE`，直接使用 `ROLE_DEFAULTS`。

### M-2: Gemini provider 未传入 baseUrl 配置

- **文件**: `packages/agent-core/src/provider/model-factory.ts:19-25`
- **问题**: `ChatGoogleGenerativeAI` 支持 `baseUrl` 参数，但 gemini 分支没有传入。
- **修复**: 添加 `...(config.baseUrl ? { baseUrl: config.baseUrl } : {})`。

### M-3: evidence data 通过 JSON.stringify 注入 solver prompt，对 LLM 不友好

- **文件**: `packages/agent-core/src/runtime/agent-runtime.ts:608`
- **问题**: 直接 `JSON.stringify(evidence.data)` 将完整嵌套对象注入 prompt，大量 JSON 占用 token 预算且 LLM 难以理解结构。
- **修复**: 对 evidence data 做摘要提取，只保留关键字段。

### M-4: sync-gate.md 缺少详细审核指引

- **文件**: `data/sandbox/prompts/sync-gate.md`
- **问题**: 实际加载的 `sync-gate.md` 审核规则只有一行描述，而未使用的 `advisor-chat-gate.md` 有详细的"必须拒绝"和"可以通过"场景说明。
- **修复**: 合并详细规则到 `sync-gate.md`，或 registry 改为加载 `advisor-chat-gate.md`。

### M-5: appendPlanContextToPrompt 不含 plan 的推理链

- **文件**: `packages/agent-core/src/runtime/agent-runtime.ts:584-635`
- **问题**: `AnalysisPlan` 没有 `reasoning` 字段，planner 的推理过程未传递给 solver，solver 可能偏离 plan 的分析意图。
- **修复**: 在 `AnalysisPlan` schema 中增加 `reasoning?: string` 字段。

### M-6: appendPlanContextToPrompt 不使用 _packet 参数

- **文件**: `packages/agent-core/src/runtime/agent-runtime.ts:584`
- **问题**: `_packet: TaskContextPacket` 参数完全未使用，`advisorChat.relevantFacts` 等关键数据未被注入到 plan context。
- **修复**: 使用 packet 中的 advisorChat 数据丰富 plan context，或移除该参数。

### M-7: registry 返回的对象完全可变

- **文件**: `apps/agent-api/src/runtime/registry.ts:305-337`
- **问题**: 返回的对象无 `Object.freeze` 保护，调用者可修改 `syncReviewer`、`reactLoop.tools` 等关键依赖。
- **修复**: 对返回对象和嵌套的敏感对象进行深度冻结。

### M-8: verifier 输入缺少 plan 信息

- **文件**: `packages/agent-core/src/output/verifier.ts:7-13`
- **问题**: `VerifierInput` 不含 `AnalysisPlan`，verifier 无法检查输出是否遵循 plan 的 `safetyConstraints`。
- **修复**: 增加可选的 `plan?: AnalysisPlan` 字段。

### M-9: buildGateUserPrompt 不提供 evidence 内容

- **文件**: `packages/agent-core/src/output/reflection-reviewer.ts:88-91`
- **问题**: gate prompt 只输出 evidence 数量（`可用证据数量: N 条`），不含具体内容。reviewer 无法判断数据引用是否与证据一致。
- **修复**: 注入 evidence 的摘要信息（metric、值、时间范围）。

### M-10: AnalysisPlan.evidenceNeeds.dateRange 未被 evidence-resolver 使用

- **文件**: `packages/agent-core/src/planner/analysis-plan.ts:38` + `evidence-resolver.ts:45-105`
- **问题**: `dateRange` 是可选字段但 resolver 完全不按 dateRange 过滤，只按 metric 和 timeScope 匹配。
- **修复**: 在 `tryResolveFromPacket` 中加入 dateRange 过滤逻辑。

---

## 5. LOW 问题（改进建议）

| # | 问题 | 文件 |
|---|------|------|
| L-1 | env.ts 未验证跨 provider API key 一致性 | `apps/agent-api/src/config/env.ts:55-58` |
| L-2 | required/optional need 未在 prompt 中排序，LLM 可能先处理 optional | `react-loop.ts:197` |
| L-3 | planner 重试时 violations 格式为纯文本，LLM 可能重复犯错 | `advisor-plan-builder.ts:148-153` |
| L-4 | FALLBACK_ONLY_MODE 下仍执行 toProviderEnv 无用计算 | `registry.ts:145-151` |

---

## 6. 各阶段验收状态

| 阶段 | 验收状态 | 阻塞问题 |
|------|---------|---------|
| T1 基础设施 | **基本通过** | temperature 覆盖（M-1）、Gemini baseUrl（M-2）、reloadProfiles 竞态（H-7） |
| P0（T2-T4） | **基本通过** | verifier chart token 范围不一致（H-3）、reflection prompt 缺少规则（H-11） |
| P1（T5-T7） | **未通过** | prompt 枚举不完整（C-1, C-2）、planner 缺少数据上下文（H-1） |
| P2（T8-T9） | **未通过** | resolveEvidenceByPlan 无保护（C-3）、evidence 数据源不全（H-2）、ReAct 多重缺陷（C-4, C-5, H-5, H-6, H-8, H-10） |
| P3（T10-T11） | **未通过** | Sync Gate 超时失控（H-9）、gate prompt 不完整（M-4, M-9） |
| 跨阶段 | **未通过** | prompt 枚举不一致（C-1, C-2）、evidence 流转缺陷（H-2, H-3, H-4） |

---

## 7. 修复优先级

### 第一优先级（阻塞生产可用性）

| # | 问题 | 类型 | 工作量 |
|---|------|------|--------|
| C-1 | advisor-plan.md 补充 potential_risk | CRITICAL | 小 |
| C-2 | advisor-plan.md 完整列出 SafetyConstraint | CRITICAL | 小 |
| C-3 | resolveEvidenceByPlan 增加 try-catch | CRITICAL | 小 |
| C-4 | collectedEvidence 类型补充 metric | CRITICAL | 小 |
| C-5 | ReAct 超时中断后跳过不完整 evidence | CRITICAL | 中 |

### 第二优先级（影响正确性）

| # | 问题 | 类型 | 工作量 |
|---|------|------|--------|
| H-1 | planner prompt 加入 basePacket 上下文 | HIGH | 中 |
| H-2 | evidence-resolver 增加 advisorChat 数据源 | HIGH | 中 |
| H-3 | verifier chart token 范围对齐 | HIGH | 小 |
| H-5 | 空 toolName 改 break 为 continue | HIGH | 小 |
| H-6 | buildToolSelectionPrompt 加入 input schema | HIGH | 小 |
| H-7 | reloadProfiles 改为原子引用替换 | HIGH | 小 |
| H-8 | selectTool 添加诊断信息 | HIGH | 小 |
| H-9 | Sync Gate 共享 AbortController | HIGH | 中 |

### 第三优先级（改进质量）

- 所有 MEDIUM 问题
- LOW 问题可后续迭代
- 第三轮延期项（H-9 共享常量、H-10 测试补全、H-11 独立单元测试、H-13 SafetyConstraint 映射）

---

## 8. 本轮与前几轮的差异说明

本轮从 5 个全新维度切入，发现之前所有轮次均未捕获的问题：

| 本轮新发现 | 为何之前遗漏 |
|-----------|--------------|
| prompt 中 riskLevel 缺少 potential_risk（C-1） | 之前关注代码中枚举一致性，未深入审查 prompt 文件内容 |
| SafetyConstraint 省略号问题（C-2） | 需要同时比对 prompt 文件和 Zod schema |
| resolveEvidenceByPlan 无 try-catch（C-3） | 之前关注了 phase 级别的错误处理，但未检查具体函数的异常边界 |
| evidence-resolver 不用 advisorChat 数据源（H-2） | 需要理解 ADVISOR_CHAT 和其他 taskType 的 packet 构建差异 |
| reloadProfiles 竞态条件（H-7） | 需要从并发安全角度审查 registry 的运行时行为 |
| temperature 覆盖角色默认值（M-1） | 需要完整追踪 fallback 链并与注释意图对比 |

**关键洞察**: Prompt 文件是系统行为的"隐式配置"，之前的审查主要集中在代码层面，对 prompt 与代码的一致性关注不足。本轮证明 prompt 文件需要与 Zod schema 一样严格的版本控制和一致性检查。
