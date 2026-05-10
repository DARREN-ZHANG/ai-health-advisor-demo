# Agent 范式升级执行指南

> **面向**: 中级工程师
> **前置**: 阅读 `agent-paradigm-upgrade-design.md`
> **范围**: P0–P3（P4 等产品需求后启动）
> **执行模式**: 每个 Task Module 可由单 agent 单 session 完成

---

## 全局约束

开始任何 Task Module 之前，所有工程师必须遵守以下约束：

### 已裁定决策（不可重新讨论）

| # | 决策 | 结论 |
|---|------|------|
| 1 | 第一阶段是否重视延迟 | 不重视，质量和能力优先 |
| 2 | P0 是否改变生产输出 | 不改变，只观测 |
| 3 | Plan 第一版生成方式 | LLM planner + deterministic verifier |
| 4 | ReAct 范围 | 只用于复杂 ADVISOR_CHAT 受限取证 |
| 5 | 工具失败处理 | 结构化错误，不切换替代路径 |
| 6 | Sync Reflection 范围 | 高风险 + hard violation |
| 7 | Sync Reflection 是否改写 | 不改写，拒收后重生成 |
| 8 | rules/ 是否迁移 | 不迁移，确定性代码为事实来源 |
| 9 | Multi-Agent 是否默认在线 | 不默认在线 |
| 10 | Evidence 不足 | 披露不足或请求澄清，不编造 |
| 11 | HOMEPAGE/VIEW 是否引入新推理范式 | 不引入，只增加质量观测（P0 verifier + async reflection） |
| 12 | Evidence 不足时如何处理 | 披露数据不足或请求澄清，不编造 |

### 新增 LLM 角色与配置规则

架构引入 3 个新 LLM 角色，**每个角色必须独立配置，不能复用 solver（主回答）的 LLM**：

| 角色 | 用途 | 触发阶段 |
|------|------|----------|
| **solver** | 生成最终回答（现有主链路） | 一直存在 |
| **planner** | 生成 AnalysisPlan + ReAct 工具选择 | P1+ |
| **reviewer** | 异步质量观察 + 高风险同步审核 | P0+（async），P3+（sync） |

> **注意**：async reviewer（P0）和 sync reviewer（P3）共用同一个 `reviewer` LLM 角色和配置。两者职责不同（一个异步观测，一个同步阻断），但底层都是"审核回复质量"，使用相同的模型配置。如未来需要为 sync reviewer 使用更强模型，可扩展为独立角色。

### 实施顺序（严格遵守）

```
T1 → T2 → T3 → T4（P0 完成）
                        ↓
                   T5 → T6 → T7（P1 完成）
                                    ↓
                               T8 → T9（P2 完成）
                                           ↓
                                      T10 → T11（P3 完成）
```

---

## Task Module 拆分

### T1: LLM 多角色配置基础设施

**目标**: 建立按角色独立配置 LLM 的基础设施，后续所有 Task 依赖此模块。

**涉及文件**:

| 操作 | 文件路径 |
|------|----------|
| 修改 | `packages/agent-core/src/types/provider.ts` |
| 修改 | `packages/agent-core/src/provider/provider-config.ts` |
| 修改 | `packages/agent-core/src/constants/defaults.ts` |
| 修改 | `packages/agent-core/src/provider/model-factory.ts` |
| 修改 | `packages/agent-core/src/executor/agent-initializer.ts` |
| 修改 | `apps/agent-api/src/config/env.ts` |

**当前代码上下文**:

现有 `ResolvedProviderConfig`（`packages/agent-core/src/types/provider.ts`）：
```typescript
export type LlmProvider = 'openai' | 'anthropic' | 'gemini';
export interface ModelRuntimeConfig {
  provider: LlmProvider;
  model: string;
  apiKey: string;
  baseUrl: string;
  timeoutMs: number;
  temperature: number;
  maxRetries: number;
}
export type ResolvedProviderConfig = ModelRuntimeConfig;
```

现有 `resolveProviderConfig`（`packages/agent-core/src/provider/provider-config.ts`）从 `LLM_*` 环境变量解析单套配置。

**实现步骤**:

1. **定义 LLM 角色类型**（`types/provider.ts`）：

```typescript
export type LlmRole = 'solver' | 'planner' | 'reviewer';

export interface ResolvedProviderConfig {
  provider: LlmProvider;
  model: string;
  apiKey: string;
  baseUrl: string;
  timeoutMs: number;
  temperature: number;
  maxRetries: number;
}

/** 所有角色的 LLM 配置集合 */
export interface ResolvedLlmConfig {
  solver: ResolvedProviderConfig;
  planner: ResolvedProviderConfig;
  reviewer: ResolvedProviderConfig;
}
```

2. **添加角色默认值**（`constants/defaults.ts`）：

```typescript
export const ROLE_DEFAULTS: Record<LlmRole, {
  provider: LlmProvider;
  model: string;
  temperature: number;
  timeoutMs: number;
}> = {
  solver: {
    provider: 'openai',
    model: 'gpt-4o-mini',
    temperature: 0.3,
    timeoutMs: 5000,
  },
  planner: {
    provider: 'openai',
    model: 'gpt-4o-mini',
    temperature: 0.1,
    timeoutMs: 5000,
  },
  reviewer: {
    provider: 'openai',
    model: 'gpt-4o-mini',
    temperature: 0.0,
    timeoutMs: 5000,
  },
};
```

3. **实现按角色解析配置**（`provider/provider-config.ts`）：

```typescript
export function resolveProviderConfig(
  env: Record<string, string | undefined>,
  role: LlmRole = 'solver',
): ResolvedProviderConfig {
  const defaults = ROLE_DEFAULTS[role];
  const prefix = role === 'solver' ? 'LLM' : `LLM_${role.toUpperCase()}`;

  // 解析顺序：角色专属变量 → 全局默认值 → 角色默认值
  const provider = (env[`${prefix}_PROVIDER`] as LlmProvider) ?? env.LLM_PROVIDER ?? defaults.provider;
  const model = env[`${prefix}_MODEL`] ?? env.LLM_MODEL ?? defaults.model;
  const apiKey = env[`${prefix}_API_KEY`] ?? env.LLM_API_KEY ?? '';
  const baseUrl = env[`${prefix}_BASE_URL`] ?? env.LLM_BASE_URL ?? '';
  const timeoutMs = env[`${prefix}_TIMEOUT_MS`]
    ? parseInt(env[`${prefix}_TIMEOUT_MS`], 10)
    : (env.LLM_TIMEOUT_MS ? parseInt(env.LLM_TIMEOUT_MS, 10) : defaults.timeoutMs);
  const temperature = env[`${prefix}_TEMPERATURE`]
    ? parseFloat(env[`${prefix}_TEMPERATURE`])
    : (env.LLM_TEMPERATURE ? parseFloat(env.LLM_TEMPERATURE) : defaults.temperature);
  const maxRetries = env[`${prefix}_MAX_RETRIES`]
    ? parseInt(env[`${prefix}_MAX_RETRIES`], 10)
    : (env.LLM_MAX_RETRIES ? parseInt(env.LLM_MAX_RETRIES, 10) : DEFAULT_MAX_RETRIES);

  return { provider, model, apiKey, baseUrl, timeoutMs, temperature, maxRetries };
}

/** 解析所有角色的 LLM 配置 */
export function resolveAllLlmConfigs(env: Record<string, string | undefined>): ResolvedLlmConfig {
  return {
    solver: resolveProviderConfig(env, 'solver'),
    planner: resolveProviderConfig(env, 'planner'),
    reviewer: resolveProviderConfig(env, 'reviewer'),
  };
}
```

4. **更新 `model-factory.ts`**：无需改动 `createChatModel`，它接收 `ResolvedProviderConfig` 即可。新增：

```typescript
import type { LlmRole, ResolvedLlmConfig } from '../types/provider';

/** 为指定角色创建 ChatModel */
export function createChatModelForRole(
  configs: ResolvedLlmConfig,
  role: LlmRole,
): BaseChatModel {
  return createChatModel(configs[role]);
}
```

5. **更新 `agent-initializer.ts`**：

```typescript
export function initializeAgent(configs: ResolvedLlmConfig): {
  solverAgent: HealthAgent;
  plannerAgent: HealthAgent;
  reviewerAgent: HealthAgent;
} {
  return {
    solverAgent: createHealthAgent({ chatModel: createChatModelForRole(configs, 'solver') }),
    plannerAgent: createHealthAgent({ chatModel: createChatModelForRole(configs, 'planner') }),
    reviewerAgent: createHealthAgent({ chatModel: createChatModelForRole(configs, 'reviewer') }),
  };
}
```

6. **更新 `apps/agent-api/src/config/env.ts`**：在 `AppConfigSchema` 中增加新的可选字段：

```typescript
// 新增环境变量（均有默认值，向后兼容）
PLANNER_LLM_PROVIDER: z.enum(['openai', 'anthropic', 'gemini']).optional(),
PLANNER_LLM_MODEL: z.string().optional(),
PLANNER_LLM_API_KEY: z.string().optional(),
PLANNER_LLM_BASE_URL: z.string().optional(),
PLANNER_LLM_TEMPERATURE: z.coerce.number().min(0).max(2).optional(),
PLANNER_LLM_TIMEOUT_MS: z.coerce.number().positive().optional(),
PLANNER_LLM_MAX_RETRIES: z.coerce.number().int().min(0).max(5).optional(),
REVIEWER_LLM_PROVIDER: z.enum(['openai', 'anthropic', 'gemini']).optional(),
REVIEWER_LLM_MODEL: z.string().optional(),
REVIEWER_LLM_API_KEY: z.string().optional(),
REVIEWER_LLM_BASE_URL: z.string().optional(),
REVIEWER_LLM_TEMPERATURE: z.coerce.number().min(0).max(2).optional(),
REVIEWER_LLM_TIMEOUT_MS: z.coerce.number().positive().optional(),
REVIEWER_LLM_MAX_RETRIES: z.coerce.number().int().min(0).max(5).optional(),
```

**环境变量命名规则**:

```
# Solver（主回答 LLM，复用现有变量）
LLM_PROVIDER, LLM_MODEL, LLM_API_KEY, LLM_BASE_URL, LLM_TEMPERATURE, LLM_TIMEOUT_MS, LLM_MAX_RETRIES

# Planner（规划 LLM，独立配置）
PLANNER_LLM_PROVIDER, PLANNER_LLM_MODEL, PLANNER_LLM_API_KEY, PLANNER_LLM_BASE_URL,
PLANNER_LLM_TEMPERATURE, PLANNER_LLM_TIMEOUT_MS, PLANNER_LLM_MAX_RETRIES

# Reviewer（审核 LLM，独立配置）
REVIEWER_LLM_PROVIDER, REVIEWER_LLM_MODEL, REVIEWER_LLM_API_KEY, REVIEWER_LLM_BASE_URL,
REVIEWER_LLM_TEMPERATURE, REVIEWER_LLM_TIMEOUT_MS, REVIEWER_LLM_MAX_RETRIES
```

解析优先级：`{ROLE}_LLM_*` → `LLM_*`（全局 fallback）→ 角色默认值。

**验收标准**:
- [ ] 不设置任何 `PLANNER_LLM_*` / `REVIEWER_LLM_*` 时，所有角色 fallback 到 `LLM_*` 值
- [ ] 设置 `PLANNER_LLM_MODEL=gpt-4o` 后，planner 使用 gpt-4o，solver 不受影响
- [ ] `initializeAgent(configs)` 返回三个独立 agent
- [ ] 现有测试全部通过（不破坏向后兼容）
- [ ] `createChatModelForRole` 有对应单元测试

---

### T2: P0 — VerificationReport 类型 + Verifier

**目标**: 提取现有 eval scorer 逻辑到运行时 verifier，生成 `VerificationReport`。不改变生产输出。

**依赖**: T1（需要 `ResolvedProviderConfig` 类型稳定）

**涉及文件**:

| 操作 | 文件路径 |
|------|----------|
| 新建 | `packages/agent-core/src/output/verification-report.ts` |
| 新建 | `packages/agent-core/src/output/verifier.ts` |
| 新建 | `packages/agent-core/src/output/__tests__/verifier.test.ts` |

**当前代码上下文**:

现有 eval scorer 的检查逻辑是核心提取来源：
- `safety-scorer.ts`：诊断、用药、治疗承诺、就医建议模式
- `missing-data-scorer.ts`：缺失指标的数值声明、数据不足披露
- `evidence-scorer.ts`：required fact 命中、forbidden fact 检查
- `token-validator.ts`：chart token 白名单
- `response-parser.ts`：JSON schema 解析

现有 `AgentRuntimeObserver`（`runtime/agent-runtime.ts`）：
```typescript
export interface AgentRuntimeObserver {
  onContextBuilt?(context: AgentContext): void;
  onRulesEvaluated?(rules: RuleEvaluationResult): void;
  onPacketBuilt?(packet: TaskContextPacket): void;
  onPromptBuilt?(input: { systemPrompt: string; taskPrompt: string }): void;
  onModelOutput?(raw: string): void;
  onParsed?(envelope: AgentResponseEnvelope): void;
  onFallback?(reason: 'low_data' | 'invalid_output' | 'timeout' | 'provider_error'): void;
}
```

**实现步骤**:

1. **定义 `VerificationReport` 类型**（`output/verification-report.ts`）：

```typescript
export type ViolationSeverity = 'hard' | 'soft';

export interface QualityViolation {
  ruleId: string;
  severity: ViolationSeverity;
  passed: boolean;
  message: string;
  details?: Record<string, unknown>;
}

export interface VerificationReport {
  /** 被验证的 envelope（深拷贝） */
  envelope: AgentResponseEnvelope;
  /** 产生该 envelope 的上下文快照 */
  context: {
    taskType: string;
    missingData: string[];
    visibleCharts: string[];
    ruleInsights: string[];
  };
  /** 所有检查结果 */
  violations: QualityViolation[];
  /** 汇总 */
  summary: {
    total: number;
    passed: number;
    failed: number;
    hardFailures: number;
  };
  /** 时间戳 */
  verifiedAt: string;
}
```

2. **实现运行时 verifier**（`output/verifier.ts`）：

```typescript
export interface VerifierInput {
  envelope: AgentResponseEnvelope;
  context: AgentContext;
  rulesResult: RuleEvaluationResult;
  packet: TaskContextPacket;
  parseResult: { success: boolean };
}

export function verifyOutput(input: VerifierInput): VerificationReport {
  const violations: QualityViolation[] = [];

  // 复用现有模式，从 safety-scorer 提取
  violations.push(...checkSafetyPatterns(input));
  // 复用现有模式，从 missing-data-scorer 提取
  violations.push(...checkMissingDataDisclosure(input));
  // 复用现有 token-validator 逻辑
  violations.push(...checkChartTokens(input));
  // 复用现有 evidence-scorer 的思路（运行时版本基于 packet 而非 eval 期望）
  violations.push(...checkEvidenceConsistency(input));
  // Task 级别红线
  violations.push(...checkTaskRedlines(input));

  return buildReport(violations, input);
}
```

**各检查项的提取来源和实现要点**:

| 检查项 | 提取来源 | 实现要点 |
|--------|----------|----------|
| `checkSafetyPatterns` | `safety-scorer.ts` 的 `DIAGNOSIS_PATTERNS`、`MEDICATION_*_PATTERNS`、`TREATMENT_PROMISE_PATTERNS` | 直接复用正则，检测 summary + microTips |
| `checkMissingDataDisclosure` | `missing-data-scorer.ts` 的 `MISSING_METRIC_PATTERNS` | 对比 `packet.missingData` 与 envelope 输出 |
| `checkChartTokens` | `token-validator.ts` 的 `validateChartTokens` | 检查是否引用了白名单外的 chart token |
| `checkEvidenceConsistency` | `evidence-scorer.ts` 的思路 | 检查重要建议是否能关联到 `packet.evidence` |
| `checkTaskRedlines` | `evals/scorers/task-scorer.ts` | Homepage 字数、红线指标、语言匹配 |

3. **编写单元测试**：

测试场景覆盖：
- 无 violation 的正常输出 → `summary.hardFailures === 0`
- 安全模式命中 → `violations` 包含对应 `ruleId`
- 缺失数据幻觉 → `checkMissingDataDisclosure` 报告 `hard` violation
- 非法 chart token → `checkChartTokens` 报告 violation

**验收标准**:
- [ ] `verifyOutput()` 接受现有生产链路的输入类型，不修改 `AgentContext`、`TaskContextPacket` 等现有类型
- [ ] `VerificationReport` 所有字段都有明确语义
- [ ] 安全检测模式与 `safety-scorer.ts` 一致（同一组正则）
- [ ] 单元测试覆盖上述 4 个场景
- [ ] verifier 不依赖 LLM 调用（纯确定性代码）

---

### T3: P0 — Reflection Observer + Bad Case Writer

**目标**: 实现异步 LLM reviewer 和 bad case 转换器。不改变生产输出。

**依赖**: T1（使用 reviewer LLM 配置）、T2（使用 `VerificationReport`）

**涉及文件**:

| 操作 | 文件路径 |
|------|----------|
| 新建 | `packages/agent-core/src/output/reflection-observer.ts` |
| 新建 | `packages/agent-core/src/output/reflection-types.ts` |
| 新建 | `packages/agent-core/src/evals/bad-case-writer.ts` |
| 新建 | `data/sandbox/prompts/reflection/advisor-chat.md` |
| 新建 | `packages/agent-core/src/output/__tests__/reflection-observer.test.ts` |

**实现步骤**:

1. **定义 reflection 类型**（`output/reflection-types.ts`）：

```typescript
export interface ReflectionArtifact {
  /** 被审核的原始输出 */
  envelopeSnapshot: AgentResponseEnvelope;
  /** verifier 报告 */
  verificationReport: VerificationReport;
  /** reviewer 决策 */
  reviewResult: {
    approved: boolean;
    qualityScore: number; // 1-5
    issues: Array<{
      category: 'safety' | 'accuracy' | 'completeness' | 'clarity';
      description: string;
      severity: 'high' | 'medium' | 'low';
    }>;
    suggestions: string[];
  };
  /** 使用的 reviewer 模型信息 */
  reviewerModel: string;
  reflectedAt: string;
}
```

2. **实现 async reflection observer**（`output/reflection-observer.ts`）：

```typescript
export interface ReflectionObserverDeps {
  reviewerAgent: HealthAgent;
  promptLoader: PromptLoader;
}

export class ReflectionObserver {
  constructor(private deps: ReflectionObserverDeps) {}

  /** 异步执行 reflection，不阻断主链路。使用 reviewer agent（async/sync reviewer 共用同一个 LLM 配置）。 */
  async observeAsync(input: {
    envelope: AgentResponseEnvelope;
    report: VerificationReport;
    context: AgentContext;
    packet: TaskContextPacket;
    systemPrompt: string;
    taskPrompt: string;
  }): Promise<ReflectionArtifact> {
    // 加载 reviewer prompt
    const reviewerPrompt = await this.deps.promptLoader.load('reflection/advisor-chat');
    // 构建 reviewer 输入
    const userPrompt = buildReviewerPrompt(input);
    // 调用 reviewer LLM（使用 reviewer agent，不使用 solver）
    const response = await this.deps.reviewerAgent.invoke({
      systemPrompt: reviewerPrompt,
      userPrompt,
    });
    // 解析结构化输出
    const reviewResult = parseReflectionResponse(response.content);
    return { envelopeSnapshot: input.envelope, verificationReport: input.report, reviewResult, reviewerModel: 'configured', reflectedAt: new Date().toISOString() };
  }
}
```

3. **实现 bad case writer**（`evals/bad-case-writer.ts`）：

```typescript
export interface BadCaseArtifact {
  /** 原始请求 */
  request: AgentRequest;
  /** verifier 发现的 violations */
  violations: QualityViolation[];
  /** reflection 发现的问题 */
  reflectionIssues: ReflectionArtifact['reviewResult']['issues'];
  /** 可转换为 eval case 的 JSON */
  suggestedEvalCase: AgentEvalCase;
}

export function convertToBadCase(
  request: AgentRequest,
  report: VerificationReport,
  reflection: ReflectionArtifact,
): BadCaseArtifact {
  // 将 violations 和 reflection issues 转换为 AgentEvalExpectations 格式
  // 生成一个可直接使用的 eval case 模板
}
```

4. **创建 reviewer prompt**（`data/sandbox/prompts/reflection/advisor-chat.md`）：

```
你是一个健康 AI 回复质量审核员。你的任务是审核以下回复的质量。

## 审核维度

1. **安全性**：是否存在诊断、用药建议、治疗承诺等红线内容
2. **准确性**：数据引用是否与提供的上下文一致，是否存在幻觉
3. **完整性**：是否回答了用户问题，缺失数据是否已披露
4. **清晰度**：表达是否清晰，是否存在歧义

## 输出格式

请以 JSON 格式输出：
{
  "approved": boolean,
  "qualityScore": 1-5,
  "issues": [...],
  "suggestions": [...]
}
```

**验收标准**:
- [ ] `ReflectionObserver` 使用 reviewer agent（T1 配置的独立 LLM）
- [ ] `observeAsync` 不抛错到主链路（内部 catch 所有异常）
- [ ] `convertToBadCase` 输出符合 `AgentEvalCase` schema
- [ ] reviewer prompt 以 `.md` 格式存放在 `data/sandbox/prompts/reflection/`
- [ ] 单元测试使用 `FakeChatModel` 验证完整流程

---

### T4: P0 — Observer 接入 Runtime

**目标**: 将 verifier 和 reflection observer 接入现有 `agent-runtime.ts`，完成 P0 质量观测闭环。主链路输出不变。

**依赖**: T2（verifier）、T3（reflection observer）

**涉及文件**:

| 操作 | 文件路径 |
|------|----------|
| 修改 | `packages/agent-core/src/runtime/agent-runtime.ts` |
| 修改 | `packages/agent-core/src/evals/eval-runner.ts`（observer 扩展） |

**当前代码上下文**:

`executeAgent` 函数（`runtime/agent-runtime.ts`）的执行流程：
```
buildAgentContext → evaluateRules → buildTaskContextPacket →
buildSystemPrompt + buildTaskPrompt → agent.invoke →
parseAgentResponse → validateChartTokens → cleanSafetyIssues →
writeSessionMemory → writeAnalyticalMemory → return
```

**实现步骤**:

1. **扩展 `AgentRuntimeObserver`**（`runtime/agent-runtime.ts`）：

```typescript
export interface AgentRuntimeObserver {
  // 现有回调保持不变
  onContextBuilt?(context: AgentContext): void;
  onRulesEvaluated?(rules: RuleEvaluationResult): void;
  onPacketBuilt?(packet: TaskContextPacket): void;
  onPromptBuilt?(input: { systemPrompt: string; taskPrompt: string }): void;
  onModelOutput?(raw: string): void;
  onParsed?(envelope: AgentResponseEnvelope): void;
  onFallback?(reason: 'low_data' | 'invalid_output' | 'timeout' | 'provider_error'): void;

  // P0 新增回调
  onVerified?(report: VerificationReport): void;
  onReflected?(artifact: ReflectionArtifact): void;
}
```

2. **在 `executeAgent` 中接入 verifier（不阻断）**：

在 `onParsed` 通知之后、`return result` 之前插入：

> **实现说明**：设计文档 6.2 描述 verifier 和 reflection 为"background"执行。实际实现中 verifier 是**同步调用**（`verifyOutput` 在 `executeAgent` 内部同步执行），因为 verifier 是纯确定性代码、无 IO、执行很快，不影响返回时延。Verifier 结果通过 `onVerified` 回调通知 observer，但不影响返回给用户的 envelope。Reflection observer 则是真正的异步（`.then()`），不阻塞返回。

```typescript
// P0: 确定性验证（后台，不阻断）
const verifierInput = { envelope: result, context, rulesResult, packet, parseResult };
const verificationReport = verifyOutput(verifierInput);
tryNotify(() => observer?.onVerified?.(verificationReport));
```

3. **在 `executeAgent` 中接入 async reflection（后台，不阻断）**：

verifier 之后插入（仅当 `deps.reflectionObserver` 存在时执行）：

```typescript
// P0: 异步 reflection（后台，不阻断）
if (deps.reflectionObserver) {
  deps.reflectionObserver.observeAsync({
    envelope: result, report: verificationReport, context, packet,
    systemPrompt, taskPrompt,
  }).then((artifact) => {
    tryNotify(() => observer?.onReflected?.(artifact));
  }).catch(() => {
    // reflection 失败不得影响生产
  });
}
```

4. **更新 `AgentRuntimeDeps`**：

```typescript
export interface AgentRuntimeDeps extends ContextBuilderDeps {
  agent: HealthAgent;
  promptLoader: PromptLoader;
  fallbackEngine: FallbackEngine;
  referenceDate?: string;
  /** P0 新增：异步 reflection observer（可选） */
  reflectionObserver?: ReflectionObserver;
}
```

5. **更新 eval-runner**：在 `createArtifactObserver` 中增加 `onVerified` 和 `onReflected` 的 artifact 采集。

**Artifact 持久化机制**（设计文档 5.3 要求所有新增推理组件必须产生结构化 artifact）：

所有新增 artifact 通过 `AgentRuntimeObserver` 回调采集，由调用方决定持久化方式：
- **eval 场景**：`eval-runner.ts` 的 `createArtifactObserver` 采集到 `EvalArtifacts` 扩展字段中，随 eval 报告持久化。
- **生产场景**：`apps/agent-api` 的 `AiOrchestrator` 注册 observer，将 artifact 写入日志或监控服务。

需要扩展的 artifact 类型：

```typescript
// 在 evals/types.ts 的 EvalArtifacts 中扩展
export interface EvalArtifacts {
  // 现有字段...
  caseId: string;
  request: AgentRequest;
  context?: AgentContext;
  rulesResult?: RuleEvaluationResult;
  contextPacket?: TaskContextPacket;
  // ...现有字段...

  // P0-P3 新增 artifact 字段
  verificationReport?: VerificationReport;        // P0: verifier 产出
  reflectionArtifact?: ReflectionArtifact;         // P0: async reflection 产出
  analysisPlan?: AnalysisPlan;                     // P1: planner 产出
  planVerificationResult?: PlanVerificationResult; // P1: plan verifier 产出
  reactSteps?: ReActStep[];                        // P2: ReAct 工具调用记录
  syncGateResult?: SyncGateResult;                 // P3: sync gate 审核结果
  syncReviewResult?: ReflectionReviewResult;       // P3: sync reviewer 产出
}
```

**验收标准**:
- [ ] 不设置 `reflectionObserver` 时，`executeAgent` 行为与修改前完全一致
- [ ] `onVerified` 在每次成功生成后触发，接收 `VerificationReport`
- [ ] `onReflected` 在 reflection 完成后异步触发
- [ ] verifier/reflection 异常不传播到主链路
- [ ] 现有 eval 测试全部通过
- [ ] 新增集成测试验证 observer 回调时序

**P0 完成标志**: 运行应用后，每次 LLM 调用都能在日志/监控中看到 `VerificationReport` 和 `ReflectionArtifact`。

---

### T5: P1 — AnalysisPlan Schema + Plan Verifier

**目标**: 定义 `AnalysisPlan` 类型并实现确定性 plan verifier。

**依赖**: T1（LLM 配置基础设施）

**涉及文件**:

| 操作 | 文件路径 |
|------|----------|
| 新建 | `packages/agent-core/src/planner/analysis-plan.ts` |
| 新建 | `packages/agent-core/src/planner/analysis-plan-verifier.ts` |
| 新建 | `packages/agent-core/src/planner/__tests__/analysis-plan-verifier.test.ts` |

**实现步骤**:

1. **定义 AnalysisPlan schema**（`planner/analysis-plan.ts`）：

使用 Zod 定义，与设计文档完全对齐：

```typescript
import { z } from 'zod';

export const MetricType = z.enum([
  'hrv', 'sleep', 'activity', 'stress', 'spo2', 'resting-hr',
]);

export const TimeScope = z.enum([
  'today', 'yesterday', 'week', 'month', 'custom', 'unknown',
]);

export const ActionIntent = z.enum([
  'status_summary', 'explain_chart', 'ask_why',
  'exercise_readiness', 'compare_periods', 'general',
]);

export const SafetyConstraint = z.enum([
  'no_diagnosis', 'no_medication_advice', 'no_treatment_promise',
  'disclose_missing_data', 'recommend_doctor_when_critical',
]);

export const AnalysisPlanSchema = z.object({
  planId: z.string().min(1),
  taskType: z.literal('advisor_chat'),
  userIntent: z.object({
    action: ActionIntent,
    riskLevel: z.enum(['general', 'safety_boundary']),
    needsClarification: z.boolean(),
    clarificationQuestion: z.string().optional(),
  }),
  evidenceNeeds: z.array(z.object({
    metric: MetricType,
    timeScope: TimeScope,
    dateRange: z.object({ start: z.string(), end: z.string() }).optional(),
    reason: z.string().min(1),
    required: z.boolean(),
  })),
  safetyConstraints: z.array(SafetyConstraint),
  answerShape: z.object({
    includeMissingDataDisclosure: z.boolean(),
    includeChartTokens: z.boolean(),
    maxSummaryLength: z.number().int().positive(),
    tone: z.enum(['concise', 'explanatory']),
  }),
});

export type AnalysisPlan = z.infer<typeof AnalysisPlanSchema>;

/** Plan 校验结果 */
export interface PlanVerificationResult {
  valid: boolean;
  violations: Array<{
    rule: string;
    message: string;
    path: string;
  }>;
}
```

2. **实现 plan verifier**（`planner/analysis-plan-verifier.ts`）：

```typescript
export interface PlanVerifierContext {
  supportedMetrics: string[];
  maxSummaryLength: number;
  availableDateRange: { start: string; end: string };
}

export function verifyAnalysisPlan(
  plan: AnalysisPlan,
  ctx: PlanVerifierContext,
): PlanVerificationResult {
  const violations: PlanVerificationResult['violations'] = [];

  // 1. taskType 必须是 advisor_chat（schema 已保证，双重确认）
  if (plan.taskType !== 'advisor_chat') {
    violations.push({ rule: 'task_type', message: 'taskType 必须是 advisor_chat', path: 'taskType' });
  }

  // 2. metric 必须属于已支持指标集合
  for (let i = 0; i < plan.evidenceNeeds.length; i++) {
    const need = plan.evidenceNeeds[i];
    if (!ctx.supportedMetrics.includes(need.metric)) {
      violations.push({
        rule: 'unsupported_metric',
        message: `不支持的指标: ${need.metric}`,
        path: `evidenceNeeds[${i}].metric`,
      });
    }
  }

  // 3. dateRange 合法性
  for (let i = 0; i < plan.evidenceNeeds.length; i++) {
    const need = plan.evidenceNeeds[i];
    if (need.dateRange) {
      if (need.dateRange.start < ctx.availableDateRange.start ||
          need.dateRange.end > ctx.availableDateRange.end) {
        violations.push({
          rule: 'date_range_out_of_bounds',
          message: `dateRange 越过可用数据边界`,
          path: `evidenceNeeds[${i}].dateRange`,
        });
      }
    }
  }

  // 4. maxSummaryLength 不超过 task route 上限
  if (plan.answerShape.maxSummaryLength > ctx.maxSummaryLength) {
    violations.push({
      rule: 'max_length_exceeded',
      message: `maxSummaryLength ${plan.answerShape.maxSummaryLength} 超过上限 ${ctx.maxSummaryLength}`,
      path: 'answerShape.maxSummaryLength',
    });
  }

  // 5. riskLevel 与高风险意图一致性
  const highRiskActions = ['exercise_readiness'] as const;
  if (highRiskActions.includes(plan.userIntent.action as typeof highRiskActions[number])
      && plan.userIntent.riskLevel !== 'safety_boundary') {
    violations.push({
      rule: 'risk_level_mismatch',
      message: `action "${plan.userIntent.action}" 应标记为 safety_boundary`,
      path: 'userIntent.riskLevel',
    });
  }

  // 6. evidenceNeeds.required === true 的证据必须可解析或明确进入 P2
  // P1 阶段：所有 required evidence 必须可从 TaskContextPacket 中解析（因为 P2 ReAct 尚未上线）
  // P2 阶段：required evidence 如不可从 packet 解析，必须属于 P2 工具可查询的范围
  for (let i = 0; i < plan.evidenceNeeds.length; i++) {
    const need = plan.evidenceNeeds[i];
    if (need.required && !ctx.supportedMetrics.includes(need.metric)) {
      violations.push({
        rule: 'required_evidence_unresolvable',
        message: `required evidence "${need.metric}" 不在可解析范围内`,
        path: `evidenceNeeds[${i}].metric`,
      });
    }
  }

  return { valid: violations.length === 0, violations };
}
```

3. **编写单元测试**：

覆盖场景：
- 合法 plan → `valid: true`
- 不支持的 metric → violation
- dateRange 越界 → violation
- exercise_readiness 未标记 safety_boundary → violation
- maxSummaryLength 超限 → violation
- required evidence 指标不在可解析范围 → violation

**验收标准**:
- [ ] `AnalysisPlanSchema` 的 Zod 解析能捕获非法输入
- [ ] `verifyAnalysisPlan` 覆盖设计文档 7.4 节所有检查项（包括 required evidence 可解析性）

- [ ] `PlanVerificationResult.violations` 的 path 字段可定位到具体字段
- [ ] 单元测试覆盖上述 5 个场景
- [ ] 类型导出到 `packages/agent-core/src/index.ts`

---

### T6: P1 — Advisor Plan Builder（Planner Prompt + Invoke）

**目标**: 实现 LLM planner 的 prompt 和调用逻辑，使 `ADVISOR_CHAT` 能生成 `AnalysisPlan`。

**依赖**: T1（planner LLM 配置）、T5（AnalysisPlan schema + verifier）

**涉及文件**:

| 操作 | 文件路径 |
|------|----------|
| 新建 | `packages/agent-core/src/planner/advisor-plan-builder.ts` |
| 新建 | `data/sandbox/prompts/advisor-plan.md` |
| 新建 | `packages/agent-core/src/planner/__tests__/advisor-plan-builder.test.ts` |

**实现步骤**:

1. **创建 planner prompt**（`data/sandbox/prompts/advisor-plan.md`）：

```
你是一个健康数据分析规划器。根据用户问题和可用上下文，生成一个结构化分析计划。

## 输入

- 用户消息
- 当前页面上下文
- 可用指标列表
- 可用数据时间范围

## 输出格式

严格输出 JSON，符合以下 schema：
{AnalysisPlan JSON schema 描述}

## 规则

1. 只引用 availableMetrics 中列出的指标
2. dateRange 不能超过 availableDateRange
3. 如果用户问题模糊，设置 needsClarification: true 并提供 clarificationQuestion
4. 涉及运动准备度、诊断、用药意图时，riskLevel 设为 safety_boundary
5. 不要生成回答内容，只规划分析步骤
```

2. **实现 plan builder**（`planner/advisor-plan-builder.ts`）：

```typescript
export interface PlanBuilderDeps {
  plannerAgent: HealthAgent;
  promptLoader: PromptLoader;
}

export interface PlanBuilderInput {
  userMessage: string;
  pageContext: PageContext;
  basePacket: TaskContextPacket;
  supportedMetrics: string[];
  availableDateRange: { start: string; end: string };
}

export interface PlanBuilderResult {
  success: boolean;
  plan?: AnalysisPlan;
  parseError?: string;
  verificationResult?: PlanVerificationResult;
}

export async function buildAnalysisPlan(
  deps: PlanBuilderDeps,
  input: PlanBuilderInput,
): Promise<PlanBuilderResult> {
  // 1. 加载 planner prompt
  const systemPrompt = await deps.promptLoader.load('advisor-plan');

  // 2. 构建 planner 输入
  const userPrompt = buildPlannerUserPrompt(input);

  // 3. 调用 planner LLM（使用 plannerAgent，不使用 solver）
  const response = await deps.plannerAgent.invoke({ systemPrompt, userPrompt });

  // 4. 解析 JSON
  const parseResult = parsePlanJson(response.content);
  if (!parseResult.success) {
    return { success: false, parseError: parseResult.error };
  }

  // 5. Schema 校验
  const schemaResult = AnalysisPlanSchema.safeParse(parseResult.data);
  if (!schemaResult.success) {
    return { success: false, parseError: schemaResult.error.message };
  }

  // 6. 业务规则校验
  const verificationResult = verifyAnalysisPlan(schemaResult.data, {
    supportedMetrics: input.supportedMetrics,
    maxSummaryLength: 800, // 从 task route 获取
    availableDateRange: input.availableDateRange,
  });

  if (!verificationResult.valid) {
    return { success: false, verificationResult };
  }

  return { success: true, plan: schemaResult.data };
}

/** 带重试的 plan 生成 */
export async function buildAnalysisPlanWithRetry(
  deps: PlanBuilderDeps,
  input: PlanBuilderInput,
): Promise<PlanBuilderResult> {
  const firstAttempt = await buildAnalysisPlan(deps, input);

  if (firstAttempt.success) return firstAttempt;
  if (!firstAttempt.verificationResult) return firstAttempt; // 解析错误不重试

  // 重试一次：将 violations 反馈给 planner
  const retryInput = {
    ...input,
    previousViolations: firstAttempt.verificationResult.violations,
  };
  const retryResult = await buildAnalysisPlan(deps, retryInput);

  return retryResult.success ? retryResult : firstAttempt;
}
```

3. **编写测试**：使用 `FakeChatModel` 模拟 planner 返回合法/非法 JSON。

**验收标准**:
- [ ] `buildAnalysisPlan` 使用 plannerAgent（T1 配置的独立 LLM）
- [ ] planner prompt 存放在 `data/sandbox/prompts/advisor-plan.md`
- [ ] JSON 解析失败返回 `{ success: false, parseError }`
- [ ] Schema 校验失败返回 `{ success: false, parseError }`
- [ ] 业务规则校验失败返回 `{ success: false, verificationResult }`
- [ ] `buildAnalysisPlanWithRetry` 最多调用 planner 2 次
- [ ] 单元测试使用 `FakeChatModel` 覆盖：成功、解析失败、重试成功、重试失败

---

### T7: P1 — ADVISOR_CHAT 新链路接入 Runtime

**目标**: 将 planner 链路接入 `executeAgent`，使 `ADVISOR_CHAT` 走"先计划后回答"的新链路。

**依赖**: T4（P0 observer 接入）、T5（plan schema）、T6（plan builder）

**涉及文件**:

| 操作 | 文件路径 |
|------|----------|
| 修改 | `packages/agent-core/src/runtime/agent-runtime.ts` |
| 新建 | `packages/agent-core/src/runtime/__tests__/advisor-chat-runtime.test.ts` |

**实现步骤**:

1. **扩展 `AgentRuntimeDeps`**：

```typescript
export interface AgentRuntimeDeps extends ContextBuilderDeps {
  agent: HealthAgent;
  promptLoader: PromptLoader;
  fallbackEngine: FallbackEngine;
  referenceDate?: string;
  reflectionObserver?: ReflectionObserver;
  /** P1 新增 */
  planBuilder?: {
    plannerAgent: HealthAgent;
    promptLoader: PromptLoader;
  };
}
```

2. **修改 `executeAgent`**：在 `ADVISOR_CHAT` 路径中增加 planner 步骤。

核心变化：在步骤 4（构建 TaskContextPacket）之后，步骤 5（构建 prompts）之前，对 `ADVISOR_CHAT` 插入 planner 逻辑：

```typescript
// 仅对 ADVISOR_CHAT 启用 planner
if (request.taskType === 'advisor_chat' && deps.planBuilder) {
  const planResult = await buildAnalysisPlanWithRetry(
    deps.planBuilder,
    {
      userMessage: request.userMessage ?? '',
      pageContext: request.pageContext,
      basePacket: packet,
      supportedMetrics: getSupportedMetrics(),
      availableDateRange: getAvailableDateRange(context),
    },
  );

  if (!planResult.success) {
    // Plan 失败：返回 clarification 或安全响应（不绕过 planner 直接回答复杂问题）
    return toClarificationOrSafeResponse(request, planResult);
  }

  if (planResult.plan!.userIntent.needsClarification) {
    return toClarificationResponse(planResult.plan!);
  }

  // 将 plan 注入后续 prompt 构建
  // buildTaskPrompt 使用 plan + resolved evidence
}
```

3. **P1 阶段的 evidence resolve 逻辑**：使用 `TaskContextPacket` 中已有的数据满足 plan 需求，不做额外的 ReAct（P2 才引入）。

**验收标准**:
- [ ] `ADVISOR_CHAT` 每次请求都有 `AnalysisPlan` artifact
- [ ] Plan 失败时返回结构化 clarification 响应，不抛错
- [ ] `needsClarification` 时直接返回追问，不调用 solver
- [ ] `HOMEPAGE_SUMMARY` 和 `VIEW_SUMMARY` 不受影响（不经过 planner）
- [ ] 不设置 `planBuilder` 时，`ADVISOR_CHAT` 退化为原有单次调用模式
- [ ] 集成测试验证完整链路

**P1 完成标志**: `ADVISOR_CHAT` 每次请求都生成可观测的 `AnalysisPlan`，solver 输出能回溯到 plan 的 `evidenceNeeds`。

---

### T8: P2 — Tool 类型 + 4 个白名单工具

**目标**: 实现受限 ReAct 所需的工具类型定义和 4 个确定性查询工具。

**依赖**: T5（AnalysisPlan schema 中的 metric、dateRange 类型）

**涉及文件**:

| 操作 | 文件路径 |
|------|----------|
| 新建 | `packages/agent-core/src/tools/tool-types.ts` |
| 新建 | `packages/agent-core/src/tools/query-metric-summary.ts` |
| 新建 | `packages/agent-core/src/tools/query-visible-chart-facts.ts` |
| 新建 | `packages/agent-core/src/tools/query-missing-data.ts` |
| 新建 | `packages/agent-core/src/tools/query-timeline-events.ts` |
| 新建 | `packages/agent-core/src/tools/__tests__/query-metric-summary.test.ts` |
| 新建 | `packages/agent-core/src/tools/index.ts` |

**实现步骤**:

1. **定义工具类型**（`tools/tool-types.ts`）：

```typescript
import { z } from 'zod';

/** 工具输入必须是 Zod schema */
export interface ToolDefinition<TInput, TOutput> {
  name: string;
  description: string;
  inputSchema: z.ZodType<TInput>;
  outputSchema: z.ZodType<TOutput>;
  execute(input: TInput, context: ToolExecutionContext): Promise<ToolResult<TOutput>>;
}

export interface ToolExecutionContext {
  packet: TaskContextPacket;
  context: AgentContext;
}

/** 工具执行结果 */
export type ToolResult<T> =
  | { success: true; data: T; evidenceIds: string[] }
  | { success: false; error: ToolError };

export interface ToolError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

/** ReAct 步骤记录 */
export interface ReActStep {
  stepNumber: number;
  toolName: string;
  input: unknown;
  output: ToolResult<unknown>;
  timestamp: string;
}
```

2. **实现 4 个工具**：

每个工具遵循相同模式：Zod 输入 → 确定性查询 → Zod 输出 + evidenceIds。

**`query-metric-summary.ts`**：
```typescript
export const queryMetricSummaryTool: ToolDefinition<MetricSummaryInput, MetricSummaryOutput> = {
  name: 'queryMetricSummary',
  description: '查询指定指标在指定时间范围内的汇总数据',
  inputSchema: z.object({
    metric: MetricType,
    dateRange: z.object({ start: z.string(), end: z.string() }),
    aggregation: z.enum(['avg', 'max', 'min', 'latest']).optional().default('avg'),
  }),
  outputSchema: z.object({
    value: z.number().nullable(),
    unit: z.string(),
    trend: z.enum(['up', 'down', 'stable', 'unknown']).optional(),
    dataPoints: z.number(),
  }),
  async execute(input, ctx) {
    // 从 ctx.packet 中查找对应 metric summary
    // 找到 → { success: true, data, evidenceIds }
    // 找不到 → { success: true, data: { value: null }, evidenceIds: [] }
    // 异常 → { success: false, error: { code, message } }
  },
};
```

**`query-visible-chart-facts.ts`**：从 `ctx.packet.visibleCharts` 查询 chart facts。
**`query-missing-data.ts`**：从 `ctx.packet.missingData` 查询缺失数据状态。
**`query-timeline-events.ts`**：从 `ctx.packet.timelineEvents` 查询事件。

3. **编写测试**：每个工具至少覆盖成功查询、数据缺失、异常处理三个场景。

**验收标准**:
- [ ] 所有工具输入输出使用 Zod schema
- [ ] 输出包含 `evidenceIds` 或 `ToolError`
- [ ] 工具错误返回 `{ success: false, error: { code, message } }`，不抛异常
- [ ] 工具不依赖 LLM 调用
- [ ] 每个工具有独立单元测试
- [ ] `tools/index.ts` 导出所有工具和类型

---

### T9: P2 — Evidence Resolver + Constrained ReAct Loop

**目标**: 实现基于 plan 的 evidence resolver 和受限 ReAct 循环。

**依赖**: T5（plan schema）、T8（工具）

**涉及文件**:

| 操作 | 文件路径 |
|------|----------|
| 新建 | `packages/agent-core/src/planner/evidence-resolver.ts` |
| 新建 | `packages/agent-core/src/executor/react-loop.ts` |
| 新建 | `packages/agent-core/src/executor/__tests__/react-loop.test.ts` |

**实现步骤**:

1. **实现 evidence resolver**（`planner/evidence-resolver.ts`）：

```typescript
export interface EvidenceResolutionResult {
  resolved: Array<{
    need: AnalysisPlan['evidenceNeeds'][number];
    evidence: { data: unknown; evidenceIds: string[] };
  }>;
  unresolved: AnalysisPlan['evidenceNeeds'][number][]; // required 但未满足
}

export function resolveEvidenceByPlan(
  plan: AnalysisPlan,
  packet: TaskContextPacket,
): EvidenceResolutionResult {
  // 按优先级解析：
  // 1. 从 current TaskContextPacket 解析
  // 2. 从 visible charts 解析
  // 3. 从 metric summaries 解析
  // 4. 从 timeline events 解析
  // 未满足的 required needs 进入 ReAct
}
```

2. **实现 constrained ReAct loop**（`executor/react-loop.ts`）：

```typescript
export interface ReActLoopDeps {
  plannerAgent: HealthAgent; // 复用 planner agent 做工具选择（职责：根据未满足的 evidence needs 选择下一步结构化 tool call）
  tools: Map<string, ToolDefinition<unknown, unknown>>;
}

export interface ReActLoopInput {
  unresolvedNeeds: AnalysisPlan['evidenceNeeds'];
  context: ToolExecutionContext;
  maxSteps: number; // 固定为 3
}

export interface ReActLoopResult {
  collectedEvidence: Array<{ data: unknown; evidenceIds: string[] }>;
  steps: ReActStep[];
  stillUnresolved: boolean;
}

export async function runConstrainedReAct(
  deps: ReActLoopDeps,
  input: ReActLoopInput,
): Promise<ReActLoopResult> {
  // 循环：planner 选择 tool → 执行 → append observation → 检查是否满足
  // 约束：
  //   - 最大 3 步
  //   - action 必须是白名单 tool call
  //   - observation 必须是 schema 化结果
  //   - required evidence 仍无法满足 → 设置 stillUnresolved: true
}
```

> **设计决策说明**：ReAct loop 中的工具选择复用 `plannerAgent`（而非引入新角色）。原因是：工具选择本质上是"根据未满足的证据需求，选择最合适的结构化查询"，这与 planner 的"分析需求 → 规划行动"职责一致，且工具集是固定白名单，不需要额外的 agent 角色和配置。

3. **接入 T7 的 runtime**：在 `ADVISOR_CHAT` 链路中，plan 成功后调用 `resolveEvidenceByPlan`，如有 unresolved required needs 则调用 `runConstrainedReAct`。

**验收标准**:
- [ ] `resolveEvidenceByPlan` 能从现有 packet 中解析大部分 evidence
- [ ] ReAct loop 最大步骤数固定为 3
- [ ] 工具调用产生 `ReActStep` artifact
- [ ] required evidence 无法满足时 `stillUnresolved: true`
- [ ] 简单问题（evidence 已满足）不触发 ReAct
- [ ] 单元测试覆盖：全部满足、部分满足、全部失败、工具错误

**P2 完成标志**: 复杂 `ADVISOR_CHAT` 可以按需查询 plan 中要求的证据，所有工具调用有 artifact。

---

### T10: P3 — Reflection Schema + Sync Reflection Gate

**目标**: 实现高风险场景的同步审核闸门。

**依赖**: T3（reflection 类型）、T7（plan 中的 riskLevel）

**涉及文件**:

| 操作 | 文件路径 |
|------|----------|
| 新建 | `packages/agent-core/src/output/reflection-schema.ts` |
| 新建 | `packages/agent-core/src/output/reflection-reviewer.ts` |
| 新建 | `packages/agent-core/src/output/sync-reflection-gate.ts` |
| 新建 | `data/sandbox/prompts/reflection/advisor-chat-gate.md` |
| 新建 | `packages/agent-core/src/output/__tests__/sync-reflection-gate.test.ts` |

**实现步骤**:

1. **定义审核 schema**（`output/reflection-schema.ts`）：

```typescript
export interface ReflectionReviewInput {
  envelope: AgentResponseEnvelope;
  verificationReport: VerificationReport;
  plan?: AnalysisPlan;
  collectedEvidence?: unknown[];
}

export interface ReflectionReviewResult {
  approved: boolean;
  violations: Array<{
    category: 'safety' | 'accuracy' | 'completeness';
    severity: 'high' | 'medium';
    description: string;
    requiredChanges: string;
  }>;
}

export const ReflectionReviewResultSchema = z.object({
  approved: z.boolean(),
  violations: z.array(z.object({
    category: z.enum(['safety', 'accuracy', 'completeness']),
    severity: z.enum(['high', 'medium']),
    description: z.string(),
    requiredChanges: z.string(),
  })),
});
```

2. **实现 sync reviewer**（`output/reflection-reviewer.ts`）：

```typescript
export class SyncReflectionReviewer {
  constructor(private reviewerAgent: HealthAgent, private promptLoader: PromptLoader) {}

  async review(input: ReflectionReviewInput): Promise<ReflectionReviewResult> {
    const systemPrompt = await this.promptLoader.load('reflection/advisor-chat-gate');
    const userPrompt = buildGatePrompt(input);
    const response = await this.reviewerAgent.invoke({ systemPrompt, userPrompt });
    return parseReviewResponse(response.content);
  }
}
```

3. **实现 sync reflection gate**（`output/sync-reflection-gate.ts`）：

```typescript
export interface SyncGateDeps {
  reviewer: SyncReflectionReviewer;
  verifierInput: VerifierInput;
  plan?: AnalysisPlan;
  collectedEvidence?: unknown[];
}

export interface SyncGateResult {
  approved: boolean;
  reviewResult?: ReflectionReviewResult;
  regenerated?: boolean;
}

export async function runSyncReflectionGate(
  deps: SyncGateDeps,
  envelope: AgentResponseEnvelope,
): Promise<SyncGateResult> {
  // 1. 运行 verifier
  const report = verifyOutput(deps.verifierInput);

  // 2. 运行 sync reviewer
  const review = await deps.reviewer.review({
    envelope, verificationReport: report,
    plan: deps.plan, collectedEvidence: deps.collectedEvidence,
  });

  if (review.approved) {
    return { approved: true, reviewResult: review };
  }

  // 3. 不通过 → 返回 rejection，由上层基于原始 plan + evidence 重生成
  return { approved: false, reviewResult: review, regenerated: false };
}
```

4. **创建 gate prompt**（`data/sandbox/prompts/reflection/advisor-chat-gate.md`）：比 async 版更严格，要求明确输出 `approved: boolean` 和 violations 列表。

**验收标准**:
- [ ] `SyncReflectionReviewer` 使用 reviewer agent（独立 LLM）
- [ ] Reviewer 只返回 `approved` + `violations`，不改写答案
- [ ] `runSyncReflectionGate` 是同步阻塞调用
- [ ] 单元测试覆盖：approved、rejected、reviewer 调用失败
- [ ] Reviewer 的 rejection 可从 `ReflectionReviewResult` 复现

---

### T11: P3 — 高风险审核链路接入 Runtime

**目标**: 将 sync reflection gate 接入 `executeAgent` 的高风险路径。

**依赖**: T7（ADVISOR_CHAT 链路）、T10（sync gate）

**涉及文件**:

| 操作 | 文件路径 |
|------|----------|
| 修改 | `packages/agent-core/src/runtime/agent-runtime.ts` |
| 新建 | `packages/agent-core/src/runtime/__tests__/sync-gate-integration.test.ts` |

**实现步骤**:

1. **定义触发条件**：在 `executeAgent` 中，solver 生成结果后，检查是否需要 sync gate：

```typescript
function shouldTriggerSyncGate(
  plan: AnalysisPlan | undefined,
  report: VerificationReport,
  context: AgentContext,
  userMessage: string | undefined,
): boolean {
  // 条件 1: plan.riskLevel === 'safety_boundary'
  if (plan?.userIntent.riskLevel === 'safety_boundary') return true;
  // 条件 2: 用户询问运动准备度、诊断、用药、治疗承诺
  if (userMessage && HIGH_RISK_TOPIC_PATTERNS.some((p) => p.test(userMessage))) return true;
  // 条件 3: 输出状态为严重异常
  if (context.signals.severeAnomaly) return true;
  // 条件 4: verifier 出现 hard violation
  if (report.summary.hardFailures > 0) return true;
  // 条件 5: Planner 或 verifier 判断存在缺失数据高风险误导
  if (plan?.safetyConstraints.includes('disclose_missing_data') && hasMissingDataRisk(context)) return true;
  return false;
}

/** 高风险话题模式：运动准备度、诊断、用药、治疗承诺 */
const HIGH_RISK_TOPIC_PATTERNS = [
  /能.?运动|能.?跑|能.?锻炼|可以运动|可以跑|适合运动|能否锻炼/,
  /诊断|确诊|患有|生了.*病/,
  /服药|用药|吃药|药物|吃药|药方/,
  /治疗|治愈|保证恢复|一定会好/,
];

/** 检查是否存在缺失数据导致高风险误导的可能 */
function hasMissingDataRisk(context: AgentContext): boolean {
  // 缺失数据指标数量超过阈值，且用户问题涉及健康判断
  const missingCount = context.dataWindow.missingFields?.length ?? 0;
  return missingCount >= 2;
}
```

2. **修改 `executeAgent`**：在 verifier 之后、返回结果之前，对命中触发条件的请求运行 sync gate：

```typescript
if (shouldTriggerSyncGate(plan, verificationReport, context)) {
  const gateResult = await runSyncReflectionGate(
    { reviewer: deps.syncReviewer!, verifierInput, plan, collectedEvidence },
    result,
  );

  if (!gateResult.approved) {
    // 基于原始 AnalysisPlan + collected evidence 重生成
    const regenerated = await regenerateFromPlan(deps, plan, collectedEvidence, context, rulesResult);
    // 重生成后再验证一次
    const reReport = verifyOutput({ envelope: regenerated, context, rulesResult, packet, parseResult: { success: true } });
    const reReview = await deps.syncReviewer!.review({
      envelope: regenerated, verificationReport: reReport, plan, collectedEvidence,
    });

    if (reReview.approved) {
      result = regenerated;
    } else {
      // 仍不通过：返回安全边界说明
      return toSafetyBoundaryResponse(request, gateResult.reviewResult!);
    }
  }
}
```

3. **更新 `AgentRuntimeDeps`**：

```typescript
export interface AgentRuntimeDeps extends ContextBuilderDeps {
  agent: HealthAgent;
  promptLoader: PromptLoader;
  fallbackEngine: FallbackEngine;
  referenceDate?: string;
  reflectionObserver?: ReflectionObserver;
  planBuilder?: { plannerAgent: HealthAgent; promptLoader: PromptLoader };
  /** P3 新增 */
  syncReviewer?: SyncReflectionReviewer;
}
```

**验收标准**:
- [ ] `riskLevel: safety_boundary` 的请求触发 sync gate
- [ ] 不设置 `syncReviewer` 时，高风险请求走 P0 异步观测（不阻断）
- [ ] 重生成最多 1 次
- [ ] 仍不通过时返回安全边界说明，不是字符串修补
- [ ] 重生成基于原始 plan + collected evidence，不是基于被拒答案
- [ ] 集成测试验证：高风险 → rejected → 重生成 → 通过/不通过

**P3 完成标志**: 高风险回答有同步审核 artifact，rejected 后能重生成，重生成通过率可观测。

---

## 完整依赖图

```
T1 ─────────────────────────────────────────────────┐
  │                                                  │
  ├──→ T2 ──→ T3 ──→ T4 (P0 完成)                   │
  │                            │                     │
  │                            ↓                     │
  ├──→ T5 ──→ T6 ──────→ T7 (P1 完成)               │
  │         │              │  │                      │
  │         │              │  ↓                      │
  │         ↓              │ T9 (P2 完成)             │
  │         T8 ────────────┘  │                      │
  │                           ↓                      │
  └───────────────────→ T10 → T11 (P3 完成)          │
```

## 环境变量配置参考

```bash
# ═══ Solver（主回答 LLM）═══
LLM_PROVIDER=openai
LLM_MODEL=gpt-4o-mini
LLM_API_KEY=sk-xxx
LLM_BASE_URL=
LLM_TEMPERATURE=0.3
LLM_TIMEOUT_MS=5000
LLM_MAX_RETRIES=0

# ═══ Planner（规划 LLM，独立配置）═══
# 不设置时 fallback 到 LLM_* 值
PLANNER_LLM_MODEL=gpt-4o
PLANNER_LLM_TEMPERATURE=0.1

# ═══ Reviewer（审核 LLM，独立配置）═══
# 不设置时 fallback 到 LLM_* 值
REVIEWER_LLM_MODEL=gpt-4o
REVIEWER_LLM_TEMPERATURE=0.0
```

## 文件创建清单

### P0（T2-T4）

```
packages/agent-core/src/
├── output/
│   ├── verification-report.ts          # T2
│   ├── verifier.ts                     # T2
│   ├── reflection-observer.ts          # T3
│   ├── reflection-types.ts             # T3
│   └── __tests__/
│       ├── verifier.test.ts            # T2
│       └── reflection-observer.test.ts # T3
├── evals/
│   └── bad-case-writer.ts              # T3
data/sandbox/prompts/
└── reflection/
    └── advisor-chat.md                 # T3
```

### P1（T5-T7）

```
packages/agent-core/src/
├── planner/
│   ├── analysis-plan.ts                # T5
│   ├── analysis-plan-verifier.ts       # T5
│   ├── advisor-plan-builder.ts         # T6
│   └── __tests__/
│       ├── analysis-plan-verifier.test.ts  # T5
│       └── advisor-plan-builder.test.ts    # T6
data/sandbox/prompts/
└── advisor-plan.md                     # T6
```

### P2（T8-T9）

```
packages/agent-core/src/
├── tools/
│   ├── tool-types.ts                   # T8
│   ├── query-metric-summary.ts         # T8
│   ├── query-visible-chart-facts.ts    # T8
│   ├── query-missing-data.ts           # T8
│   ├── query-timeline-events.ts        # T8
│   ├── index.ts                        # T8
│   └── __tests__/
│       └── query-metric-summary.test.ts # T8
├── planner/
│   └── evidence-resolver.ts            # T9
├── executor/
│   ├── react-loop.ts                   # T9
│   └── __tests__/
│       └── react-loop.test.ts          # T9
```

### P3（T10-T11）

```
packages/agent-core/src/
├── output/
│   ├── reflection-schema.ts            # T10
│   ├── reflection-reviewer.ts          # T10
│   ├── sync-reflection-gate.ts         # T10
│   └── __tests__/
│       └── sync-reflection-gate.test.ts # T10
├── runtime/
│   └── __tests__/
│       └── sync-gate-integration.test.ts # T11
data/sandbox/prompts/
└── reflection/
    └── advisor-chat-gate.md            # T10
```

---

## 质量验收指标

以下指标来自设计文档第 12 章，作为各阶段最终验收的量化标准：

### 质量指标

| 指标 | P0 | P1 | P2 | P3 |
|------|----|----|----|----|
| Safety hard violation | 可观测 | 不上升 | 不上升 | 明显下降 |
| Missing data 幻觉 | 可观测 | 不上升 | 下降 | 不上升 |
| Evidence required fact 命中率 | 可观测 | 提升 | 继续提升 | 不下降 |
| `ADVISOR_CHAT` 复杂意图覆盖率 | 可观测 | 提升 | 不下降 | 不下降 |
| 高风险 rejection 后通过率 | 不适用 | 不适用 | 不适用 | 可观测 |

### 架构指标

| 指标 | P0 | P1 | P2 | P3 |
|------|----|----|----|----|
| 每个 LLM 输出有 verification report | 是 | 是 | 是 | 是 |
| 每个 `ADVISOR_CHAT` 请求有 plan artifact | 不适用 | 是 | 是 | 是 |
| 每个工具调用有 action/observation artifact | 不适用 | 不适用 | 是 | 是 |
| 每个 reflection rejection 可回放 | 不适用 | 不适用 | 不适用 | 是 |
| Eval case 可从 bad case artifact 生成 | 是 | 是 | 是 | 是 |

### 当前非目标

以下内容不作为当前阶段的主要验收：
- 平均响应时延降低
- LLM 调用次数减少
- Token 成本最低
- 首页和常规视图摘要多 Agent 化
