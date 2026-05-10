# Agent 范式升级代码复审报告（第二轮）

> **审查日期**: 2026-05-09
> **审查类型**: 独立复审（不以上轮结果为基线）
> **审查范围**: T1–T11（P0–P3）全部代码
> **审查 Agent**: 6 个并行 agent（配置链路、Runtime 集成、P0 输出层、P1-P2 planner+tools、P3 sync gate+交叉检查、测试质量）

---

## 1. 执行摘要

| 统计 | 数量 |
|------|------|
| CRITICAL | 4 |
| HIGH | 10 |
| MEDIUM | 18 |
| LOW | 14 |

**核心结论**: 代码架构设计清晰，P0/P1/P3 的核心实现质量良好。但存在 **4 个 CRITICAL 问题**阻塞生产可用性，其中最严重的是 **生产 Registry 未注入 P1-P3 依赖**，导致 planner、ReAct、sync gate 在生产环境完全不可用。

---

## 2. CRITICAL 问题（必须修复）

### C-1: 生产 Registry 未注入 P1/P2/P3 依赖

- **发现者**: p3-cross-reviewer
- **文件**: `apps/agent-api/src/runtime/registry.ts:254-279`
- **问题**: `createRuntimeRegistry` 返回的 `AgentRuntimeDeps` 只设置了基础字段（agent、promptLoader、fallbackEngine），未注入 `planBuilder`（P1）、`reactLoop`（P2）、`syncReviewer`（P3）。生产环境中 ADVISOR_CHAT 任务退化为原有单次调用模式，**所有新能力均不生效**。
- **修复**: 在 registry 中使用 `agents.plannerAgent` 和 `agents.reviewerAgent` 构建 `PlanBuilderDeps`、`ReActLoopDeps`、`SyncReflectionReviewer`，注入到返回的 deps 中。

### C-2: Eval 系统无法采集 P1-P3 数据

- **发现者**: p3-cross-reviewer + runtime-reviewer
- **文件**: `packages/agent-core/src/evals/eval-runner.ts:157-191` + `packages/agent-core/src/evals/types.ts:204-228`
- **问题**: (1) `EvalArtifacts` 缺少 P2/P3 字段（`evidenceResolutionResult`、`reactSteps`、`syncGateResult`、`safetyBoundaryViolations`）；(2) `createArtifactObserver` 只注册了 P0 的回调，缺少 `onPlanBuilt`/`onPlanFailed`/`onClarification`/`onEvidenceResolved`/`onReActStep`/`onSyncGate`/`onSafetyBoundary` 共 7 个回调。eval 系统无法获取 P1-P3 的运行时 artifacts。
- **修复**: (1) 扩展 `EvalArtifacts` 类型；(2) 在 observer 中注册所有 P1-P3 回调。

### C-3: P3 重生成后 `onVerified` observer 遗漏

- **发现者**: runtime-reviewer
- **文件**: `packages/agent-core/src/runtime/agent-runtime.ts:318-363`
- **问题**: sync gate rejected 后重生成，重生成的 envelope 只经过了 sync gate 审核，但 `observer?.onVerified` 只在第一次原始结果上触发了一次。重生成的 verifier 结果未通知 observer，导致 P0 的 verifier observer 遗漏了重生成的验证结果。
- **修复**: 重生成通过后，对重生成的结果补充调用 `tryNotify(() => observer?.onVerified?.(reVerificationReport))`。

### C-4: P2 ReAct 与 Runtime 集成测试完全缺失

- **发现者**: test-quality-reviewer
- **文件**: 不存在
- **问题**: `agent-runtime.ts` 中已有 P2 ReAct 循环的集成代码（行 178-207），但没有任何 runtime 层测试验证。resolveEvidenceByPlan → runConstrainedReAct → appendPlanContextToPrompt → solver 的完整链路未经测试。
- **修复**: 新建 `react-loop-integration.test.ts`，覆盖：plan 成功 + 有 unresolved → ReAct 触发、无 unresolved → 不触发、ReAct 失败后行为、observer 回调时序。

---

## 3. HIGH 问题（强烈建议修复）

### H-1: P3 重生成仍不通过时 violations 使用了第一次审核的结果

- **发现者**: runtime-reviewer
- **文件**: `packages/agent-core/src/runtime/agent-runtime.ts:367-368`
- **问题**: `onSafetyBoundary` 使用的 `gateResult.reviewResult?.violations` 是第一次审核的 violations，而非重生成的 `reGateResult` 的 violations。用户看到的安全边界原因可能不适用于重生成的内容。
- **修复**: 优先使用 `reGateResult.reviewResult?.violations`。

### H-2: Plan Verifier 规则 6（required evidence 可解析性）是空实现

- **发现者**: p1p2-reviewer
- **文件**: `packages/agent-core/src/planner/analysis-plan-verifier.ts:77-85`
- **问题**: for 循环体内只有注释，没有任何实际校验逻辑。给了读者"检查存在"的假象。P2 evidence-resolver 已实现但此检查未补充。
- **修复**: 注入 `TaskContextPacket` 引用做精确检查，或移除空壳循环。

### H-3: queryMetricSummary 的 evidenceIds 来源需确认

- **发现者**: p1p2-reviewer
- **文件**: `packages/agent-core/src/tools/query-metric-summary.ts:64-65`
- **问题**: chartMatch 场景返回 `summary.evidenceIds`（MetricSummary 维度）而非 `chartMatch.evidenceIds`（图表维度）。`dataSummary.evidenceIds` 可能为空，丢失图表级别证据追溯。
- **修复**: 合并两个来源 `[...new Set([...(summary.evidenceIds ?? []), ...(chartMatch.evidenceIds ?? [])])]`。

### H-4: ReAct Loop 中 maxSteps 未强制上限为 3

- **发现者**: p1p2-reviewer
- **文件**: `packages/agent-core/src/executor/react-loop.ts:57`
- **问题**: `maxSteps` 完全由调用方控制，ReAct 层无硬编码上限。设计文档要求"最大步骤固定为 3"。
- **修复**: 在 `runConstrainedReAct` 内部 `const effectiveMaxSteps = Math.min(input.maxSteps, 3)`。

### H-5: Evidence Resolver 只匹配 `daily_records` 源

- **发现者**: p1p2-reviewer
- **文件**: `packages/agent-core/src/planner/evidence-resolver.ts:50-51`
- **问题**: `tryResolveFromPacket` 过滤条件 `e.source === 'daily_records'` 忽略了 `timeline_sync`、`profile`、`rules`、`memory` 等有效来源。大量可用证据被错误地标记为 unresolved。
- **修复**: 移除 source 过滤或按 metric 匹配即可。

### H-6: P3 sync gate 内部重复运行 verifier

- **发现者**: runtime-reviewer
- **文件**: `packages/agent-core/src/runtime/agent-runtime.ts:305` + `sync-reflection-gate.ts:37`
- **问题**: runtime 已运行 verifier，sync gate 内部再次运行 verifier。每次触发 sync gate 时 verifier 被调用 2 次，重生成路径调用 3 次。
- **修复**: 在 `SyncGateDeps` 中增加可选的 `precomputedVerificationReport`，跳过内部 verifier。

### H-7: output 层反向依赖 planner 层

- **发现者**: p3-cross-reviewer
- **文件**: `reflection-schema.ts:4` + `sync-reflection-gate.ts:2`
- **问题**: `output/reflection-schema.ts` 和 `output/sync-reflection-gate.ts` 直接 import `AnalysisPlan` from `../planner/analysis-plan`。output 层不应依赖 planner 层。
- **修复**: 将 `AnalysisPlan` 核心类型抽到 `types/` 目录，或改为 `unknown` 类型 + 接口约束。

### H-8: model-factory 测试只检查 `toBeDefined()`

- **发现者**: test-quality-reviewer
- **文件**: `packages/agent-core/src/__tests__/provider/model-factory.test.ts`
- **问题**: `createChatModel` 和 `createChatModelForRole` 的所有测试只断言 `toBeDefined()`，任何实现都能通过（包括返回空对象）。
- **修复**: 至少验证返回对象具有 `invoke` 方法。

### H-9: `shouldTriggerSyncGate` 中 `overallStatus === 'red'` 和 `missingDataRisk` 触发条件无测试

- **发现者**: test-quality-reviewer
- **文件**: `packages/agent-core/src/runtime/agent-runtime.ts:639-662`
- **问题**: 5 个触发条件中 2 个（overallStatus=red、missingDataRisk）没有任何测试覆盖。
- **修复**: 补充对应集成测试用例。

### H-10: Runtime 中存在魔法数字

- **发现者**: p3-cross-reviewer + runtime-reviewer
- **文件**: `agent-runtime.ts:190`（`maxSteps: 3`）和 `:661`（`missingCount >= 2`）
- **修复**: 提取为命名常量（`MAX_REACT_STEPS`、`MISSING_DATA_HIGH_RISK_THRESHOLD`）。

---

## 4. MEDIUM 问题（建议修复）

### M-1: FALLBACK_ONLY_MODE 下创建多余 agents

- **文件**: `registry.ts:133-142`
- **问题**: `initializeAgents` 的返回值在 fallback 模式下被创建但未使用，浪费资源。
- **修复**: fallback 分支跳过 `initializeAgents`。

### M-2: resolveProviderConfig truthiness 检查语义不清

- **文件**: `provider-config.ts:24-29`
- **问题**: 环境变量存在性用 truthiness 检查，对 `number` 类型的 `0` 值场景容易误解。当前因 env 值为字符串实际不会出 bug，但代码意图不清。
- **修复**: 改为 `!= null` 显式检查。

### M-3: toProviderEnv 中不同字段使用不一致的空值检查

- **文件**: `registry.ts:296-311`
- **问题**: `TEMPERATURE`/`MAX_RETRIES` 用 `!= null`，`MODEL`/`PROVIDER` 用 truthiness。代码风格不一致。
- **修复**: 统一空值检查策略。

### M-4: ROLE_DEFAULTS 缺少 maxRetries 字段

- **文件**: `defaults.ts:10-34`
- **问题**: `maxRetries` 直接使用 `DEFAULT_MAX_RETRIES`，不经过 `ROLE_DEFAULTS`，与其他字段处理模式不一致。
- **修复**: 在 `ROLE_DEFAULTS` 中增加 `maxRetries` 字段。

### M-5: P3 重生成缺少 rejection 反馈

- **文件**: `agent-runtime.ts:318-321`
- **问题**: 重生成时使用完全相同的 systemPrompt 和 taskPrompt，LLM 收不到"上次被拒绝"的反馈，大概率生成类似回复。
- **修复**: 将 violations 的 `requiredChanges` 追加到 taskPrompt 中。

### M-6: P1 plan 失败原因通过字符串匹配判断

- **文件**: `agent-runtime.ts:156-158`
- **问题**: `parseError.includes('调用失败')` 依赖硬编码中文文案，文案变更会错分错误类型。
- **修复**: 在 `PlanBuilderResult` 中增加 `errorType` 结构化字段。

### M-7: executeAgent 函数超过 300 行

- **文件**: `agent-runtime.ts:105-408`
- **问题**: P0-P3 所有逻辑集中在一个函数中，可读性和可维护性下降。
- **修复**: 提取 `executePlannerPhase()`、`executeEvidencePhase()`、`executeSyncGatePhase()` 等内部函数。

### M-8: highRiskActions 只包含 exercise_readiness

- **文件**: `analysis-plan-verifier.ts:66`
- **问题**: 与 `advisor-plan.md` 规则 4"涉及运动准备度、诊断、用药意图"不一致。
- **修复**: 扩展检查逻辑，或通过 `safetyConstraints` 中是否包含 `no_diagnosis`/`no_medication_advice` 判断。

### M-9: advisor-plan.md 中 SafetyConstraint 枚举列表不完整

- **文件**: `data/sandbox/prompts/advisor-plan.md`
- **问题**: prompt 用 `...` 省略了部分枚举值，LLM 可能输出不在枚举中的值。
- **修复**: 明确列出所有 5 个可选值。

### M-10: checkChartTokens 混合两种不同性质的违规

- **文件**: `verifier.ts:160-168`
- **问题**: 非字符串 token 和越界 token 混入同一个 `invalid` 数组，错误消息无法区分。
- **修复**: 分为两条 violation（`chart_tokens:invalid_type` + `chart_tokens:out_of_scope`）。

### M-11: NEGATION_PREFIX_PATTERNS 与 safety-scorer 存在 drift 风险

- **文件**: `verifier.ts:28-30` vs `safety-scorer.ts:22-32`
- **问题**: 两处独立维护相同正则，safety-scorer 中有重复项。
- **修复**: 提取到共享常量模块。

### M-12: forbiddenPatterns 和 forbiddenClaimPatterns 始终为空数组

- **文件**: `bad-case-writer.ts:80-81, 99`
- **问题**: 自然语言 description 不适合作为正则，自动生成的 eval case 缺少自定义模式约束。
- **修复**: 从 violation.details.matchedPatterns 提取正则源字符串。

### M-13: convertToBadCase 在无质量问题时仍生成 bad case

- **文件**: `bad-case-writer.ts:31-58`
- **问题**: violations 全 passed + issues 为空时仍生成 eval case，但 expectations 无实质约束。
- **修复**: 入口处检查，无质量问题时返回 null。

### M-14: parseReviewResponse Zod 校验失败时返回空 violations

- **文件**: `reflection-reviewer.ts:112-116`
- **问题**: 返回 `{ approved: false, violations: [] }`，下游无法知道具体原因。
- **修复**: Zod 校验失败时也返回包含描述信息的 violation。

### M-15: checkPatterns 中重复创建 RegExp 丢失 flag

- **文件**: `verifier.ts:253-271`
- **问题**: `new RegExp(source)` 丢失原始正则的 flag（如 `/i`）。当前无实际 bug，但语义危险。
- **修复**: 直接使用原始 patterns 的 `.test()` 方法。

### M-16: ReAct need 消除策略在无 metric 信息时不准确

- **文件**: `react-loop.ts:119-121`
- **问题**: `queryMissingData` 等工具执行成功后 `shift()` 移除第一个 need，可能消除错误的 need。
- **修复**: 让工具返回 `satisfiedMetrics`，或通过 ReAct 循环重新评估。

### M-17: evidence-resolver timeScope 兼容性不完整

- **文件**: `evidence-resolver.ts:110-116`
- **问题**: `isTimeScopeCompatible` 未覆盖 `yesterday`/`custom`/`unknown`。
- **修复**: 补充 `yesterday: ['day', '1d', '24h']` 映射。

### M-18: 运行时测试中 mock 辅助函数在 4 个文件间大量重复

- **文件**: agent-runtime.test.ts、p0-observer-integration.test.ts、sync-gate-integration.test.ts、advisor-chat-runtime.test.ts
- **问题**: 约 300+ 行重复的 `makeRecord`、`makeDeps` 等辅助函数。
- **修复**: 提取到共享测试工具文件。

---

## 5. LOW 问题（改进建议）

| # | 问题 | 文件 |
|---|------|------|
| L-1 | Gemini provider 缺少 timeout 配置 | `model-factory.ts:19-25` |
| L-2 | Anthropic provider 未实现但 enum 包含 | `model-factory.ts:27` |
| L-3 | registry.test.ts 的 DATA_DIR 路径在 monorepo 中不可靠 | `registry.test.ts:11` |
| L-4 | MetricType 与 MetricName 枚举重复定义 | `analysis-plan.ts:4-6` vs `context-packet.ts:7` |
| L-5 | 4 个未使用的枚举类型导出别名 | `analysis-plan.ts:64-71` |
| L-6 | appendPlanContextToPrompt 的 `_packet` 参数未使用 | `agent-runtime.ts:539` |
| L-7 | extractJsonBlock 在 4 个文件中重复实现 | 多文件 |
| L-8 | async reflection 使用 console.warn | `agent-runtime.ts:393-395` |
| L-9 | clampScore 的 0 与合法范围 1-5 混淆 | `reflection-observer.ts:203-206` |
| L-10 | verifier 测试未覆盖 medication_recommendation 区分和 treatment_promise | `verifier.test.ts` |
| L-11 | bad-case-writer 无独立测试文件 | 缺失 |
| L-12 | FakeChatModel 未覆盖空字符串和截断 JSON 场景 | 多个测试文件 |
| L-13 | hasNumericClaims 正则缺少 mmHg、kg 等单位 | `verifier.ts:313-316` |
| L-14 | HIGH_RISK_TOPIC_PATTERNS 正则中间字符只匹配单个 | `agent-runtime.ts:632-636` |

---

## 6. 各阶段验收状态

| 阶段 | 验收状态 | 阻塞问题 |
|------|---------|---------|
| T1 基础设施 | **基本通过** | FALLBACK_ONLY_MODE 冗余创建（M-1）、ROLE_DEFAULTS 不一致（M-4） |
| P0（T2-T4） | **通过** | checkChartTokens 混合违规（M-10）、正则 drift 风险（M-11） |
| P1（T5-T7） | **有条件通过** | 规则 6 空实现（H-2）、highRiskActions 不完整（M-8） |
| P2（T8-T9） | **未通过** | evidence 源过滤（H-5）、maxSteps 未强制（H-4）、need 消除（M-16）、集成测试缺失（C-4） |
| P3（T10-T11） | **未通过** | 生产 registry 未注入依赖（C-1）、重生成 observer 遗漏（C-3）、violations 来源错误（H-1） |
| 跨阶段 | **未通过** | eval 系统缺失（C-2）、反向依赖（H-7）、mock 重复（M-18） |

---

## 7. 修复优先级

### 第一优先级（阻塞生产可用性）

| # | 问题 | 类型 | 工作量估算 |
|---|------|------|-----------|
| C-1 | Registry 注入 P1-P3 依赖 | CRITICAL | 中 |
| C-2 | EvalArtifacts + observer 补全 P1-P3 | CRITICAL | 中 |
| C-3 | 重生成 onVerified observer | CRITICAL | 小 |
| C-4 | P2 ReAct 集成测试 | CRITICAL | 中 |

### 第二优先级（影响正确性）

| # | 问题 | 类型 | 工作量估算 |
|---|------|------|-----------|
| H-1 | Safety boundary violations 来源 | HIGH | 小 |
| H-2 | Plan verifier 规则 6 空实现 | HIGH | 小 |
| H-3 | queryMetricSummary evidenceIds | HIGH | 小 |
| H-4 | ReAct maxSteps 强制上限 | HIGH | 小 |
| H-5 | Evidence resolver 源过滤 | HIGH | 小 |
| H-6 | Sync gate 重复 verifier | HIGH | 小 |
| H-9 | shouldTriggerSyncGate 测试补全 | HIGH | 中 |

### 第三优先级（改进质量）

- H-7 反向依赖、H-8 测试质量、H-10 魔法数字
- 所有 MEDIUM 问题
- LOW 问题可后续迭代

---

## 8. 测试质量评估

**信心等级**: 中高（7/10）

**充分验证的模块**:
- P0 Verifier + Reflection Observer -- 15 个集成测试，回调时序验证精确
- P1 Planner 链路 -- 16 个集成测试 + 6 个 verifier 测试 + 14 个 builder 测试
- P3 Sync Gate -- 14 个集成测试，覆盖 approved/rejected/重生成/异常
- P2 单元测试 -- evidence-resolver 9 个、react-loop 7 个、4 个工具各 4 个

**关键缺口**:
1. P2 ReAct 与 Runtime 的端到端集成测试（C-4）
2. `shouldTriggerSyncGate` 2/5 触发条件未测试（H-9）
3. model-factory / agent-initializer 测试质量低（H-8）
