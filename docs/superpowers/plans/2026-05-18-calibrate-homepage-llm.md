# 首页 LLM 回复风格精校准 — 实施计划 v2

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将首页晨报回复从"书面正式、单段、隐藏数值"风格，转变为"温暖有个性、多段结构、数据透明、含交互选项"的风格。

**设计文档:** `docs/superpowers/plans/2026-05-18-homepage-style-calibration-design.md` — 包含 4 个完整的"当前 vs 期望"回复样例、表达语法分析和 5 个架构决策记录。**每个任务开始前应先阅读设计文档中对应章节。**

---

## Pipeline 位置图

所有改动发生在 `executeAgent()` 的 11 步 pipeline 中。每个 Task 标注了它所处的步骤位置：

```
executeAgent() 11 步 pipeline:
 ┌─ Step 1  buildAgentContext()          ← 不改
 │  Step 2  lowDataFallbackCheck()       ← 不改
 │  Step 3  evaluateRules()              ← 不改
 │  Step 4  buildTaskContextPacket()     ← Module C 改动点
 │                                     (context-packet-renderer.ts)
 │  Step 5  buildPrompt()               ← Module D 改动点
 │                                     (system-builder, task-builder,
 │                                      template.md, style/zh.md, system.md)
 │  Step 6  invokeLLM()                  ← 不改
 │  Step 7  parseAgentResponse()         ← Module B 改动点
 │                                     (response-parser.ts)
 │  Step 8  validateChartTokens()        ← 不改
 │  Step 9  cleanSafetyIssues()          ← Module B 改动点
 │                                     (safety-cleaner.ts, agent-runtime.ts)
 │  Step 10 writeSessionMemory()         ← 不改
 └─ Step 11 writeAnalyticalMemory()      ← 不改

独立于 pipeline:
 Module A  输出契约 (shared 包)
 Module E  Fallback 配置
 Module F  前端渲染 (web 应用)
 Module G  Eval 对齐 (评分器 + 测试用例)
```

## Monorepo 构建依赖

```
packages/shared    ← 底层类型/Zod schema，被其他所有包引用
  ↑
packages/agent-core  ← AI 逻辑核心，依赖 shared 的类型
  ↑
apps/agent-api      ← Fastify 后端，依赖 agent-core
apps/web            ← Next.js 前端，依赖 shared 的类型

重要：修改 packages/shared 后，需先构建 shared 才能在 agent-core 中使用新类型：
  pnpm --filter @health-advisor/shared build

本项目的 pnpm workspace 已配置 turbo 管道自动构建，
全量构建命令：pnpm build（从 repo root）
单包测试命令：npx vitest run packages/shared/
```

## 双语工具函数 `t()`

多个文件使用了统一的国际化辅助函数 `t(locale, zh, en)`：
```typescript
function t(locale: Locale, zh: string, en: string): string {
  return locale === 'zh' ? zh : en;
}
```
该函数已存在于以下文件中（不需要新建）：
- `packages/agent-core/src/prompts/context-packet-renderer.ts` (第 22 行)
- `packages/agent-core/src/prompts/system-builder.ts` (第 8 行)
- `packages/agent-core/src/prompts/task-builder.ts` (第 16 行)

---

## 模块总览与依赖关系

```
Module A (输出契约)
  ↓
Module B (Pipeline 后端)
  ↓
Module C (数据透明化)
  ↓
Module D (Prompt 重写)
  ↓
Module E (Fallback)
  ↓
Module F (前端)
  ↓
Module G (Eval 对齐)
```

| 模块 | 任务数 | 可并行 | 前置依赖 |
|------|--------|--------|----------|
| A: 输出契约 | 1 | — | 无 |
| B: Pipeline 后端 | 2 | B1→B2 顺序 | Module A |
| C: 数据透明化 | 2 | C1, C2 可并行 | 无（与 A 独立） |
| D: Prompt 重写 | 4 | D1,D2 可并行; D3→D4 顺序 | Module C, Module B |
| E: Fallback | 1 | — | Module B |
| F: 前端 | 3 | F1 先行; F2→F3 顺序 | Module A |
| G: Eval 对齐 | 5 | G1,G2,G3 可并行; G4→G5 顺序 | Module D, Module F |

---

## Module A: 输出契约扩展

> **Pipeline 位置:** 独立于 pipeline，位于 `packages/shared` 底层包
> **目标:** 新增 `ActionOption` 类型，`microTips` 改为可选，`actions` 可选字段
> **前置:** 无

---

### Task A1: 扩展 shared 类型和 Zod schema

**任务卡**

```
┌──────────────────────────────────────────────────────┐
│ Task A1: 扩展 shared 类型和 Zod schema              │
├──────────────────────────────────────────────────────┤
│ 模块: A (输出契约)                                    │
│ Pipeline 步骤: 独立                                   │
│ 前置依赖: 无                                          │
│ 后续解锁: B1, B2, F1, F2, F3                         │
│ 设计文档参考: §4.1 交互选项归属, §4.3 microTips 处理  │
├──────────────────────────────────────────────────────┤
│ 目标:                                                 │
│   1. 定义 ActionOption 接口                           │
│   2. AgentResponseEnvelope 新增 actions? 字段         │
│   3. microTips 从必填改为可选                         │
│   4. Zod schema 同步更新                              │
│   5. 确保新类型从 shared/index.ts 导出                │
└──────────────────────────────────────────────────────┘
```

**Files:**
- Modify: `packages/shared/src/types/agent.ts`
- Modify: `packages/shared/src/schemas/agent.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/src/__tests__/schemas.test.ts`

- [ ] **Step 1: 写失败测试**

在 `packages/shared/src/__tests__/schemas.test.ts` 中添加：

```typescript
describe('AgentResponseEnvelopeSchema — actions & microTips optional', () => {
  // 构造一个合法的 pageContext 用于测试
  const validPageContext = {
    profileId: 'test-profile',
    page: 'home',
    timeframe: 'week',
  };

  it('accepts valid actions array', () => {
    const envelope = {
      summary: '测试摘要',
      source: 'llm',
      statusColor: 'good',
      chartTokens: [],
      microTips: [],
      actions: [
        {
          id: 'opt-1',
          emoji: '🚶',
          title: '餐后漫步',
          description: '去外面走 15 分钟',
          aiPromise: '我会记录你的选择并用于本次建议上下文',
        },
      ],
      meta: { taskType: 'homepage_summary', pageContext: validPageContext, finishReason: 'complete' },
    };
    const result = AgentResponseEnvelopeSchema.safeParse(envelope);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.actions).toHaveLength(1);
      expect(result.data.actions?.[0]?.id).toBe('opt-1');
    }
  });

  it('accepts envelope without actions (optional)', () => {
    const envelope = {
      summary: '测试摘要',
      source: 'llm',
      statusColor: 'good',
      chartTokens: [],
      microTips: [],
      meta: { taskType: 'homepage_summary', pageContext: validPageContext, finishReason: 'complete' },
    };
    const result = AgentResponseEnvelopeSchema.safeParse(envelope);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.actions).toBeUndefined();
    }
  });

  it('accepts envelope without microTips (optional)', () => {
    const envelope = {
      summary: '测试摘要',
      source: 'llm',
      statusColor: 'good',
      chartTokens: [],
      meta: { taskType: 'homepage_summary', pageContext: validPageContext, finishReason: 'complete' },
    };
    const result = AgentResponseEnvelopeSchema.safeParse(envelope);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.microTips).toBeUndefined();
    }
  });

  it('rejects actions with more than 3 items', () => {
    const actions = Array.from({ length: 4 }, (_, i) => ({
      id: `opt-${i}`,
      emoji: '🏃',
      title: `选项${i}`,
      description: `描述${i}`,
      aiPromise: `承诺${i}`,
    }));
    const envelope = {
      summary: '测试摘要',
      source: 'llm',
      statusColor: 'good',
      chartTokens: [],
      actions,
      meta: { taskType: 'homepage_summary', pageContext: validPageContext, finishReason: 'complete' },
    };
    const result = AgentResponseEnvelopeSchema.safeParse(envelope);
    expect(result.success).toBe(false);
  });

  it('rejects action with missing required fields', () => {
    const envelope = {
      summary: '测试摘要',
      source: 'llm',
      statusColor: 'good',
      chartTokens: [],
      actions: [{ id: 'opt-1', emoji: '🚶' }], // 缺少 title, description, aiPromise
      meta: { taskType: 'homepage_summary', pageContext: validPageContext, finishReason: 'complete' },
    };
    const result = AgentResponseEnvelopeSchema.safeParse(envelope);
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npx vitest run packages/shared/src/__tests__/schemas.test.ts
```

Expected: FAIL — 当前 schema 没有 `actions` 字段，`microTips` 不可选

- [ ] **Step 3: 定义 ActionOption 类型**

在 `packages/shared/src/types/agent.ts` 中，在 `AgentResponseEnvelope` 之前新增：

```typescript
export interface ActionOption {
  id: string;
  emoji: string;
  title: string;
  description: string;
  aiPromise: string;
}
```

修改 `AgentResponseEnvelope`（当前位于第 23-35 行）：

```typescript
export interface AgentResponseEnvelope {
  summary: string;
  source: string;
  statusColor: AgentStatusColor;
  chartTokens: ChartTokenId[];
  microTips?: string[];       // 改为可选
  actions?: ActionOption[];    // 新增
  meta: {
    taskType: AgentTaskType;
    pageContext: PageContext;
    finishReason: 'complete' | 'fallback' | 'timeout' | 'cached';
    sessionId?: string;
  };
}
```

- [ ] **Step 4: 更新 Zod schema**

在 `packages/shared/src/schemas/agent.ts` 中，在 `AgentResponseEnvelopeSchema` 之前新增：

```typescript
export const ActionOptionSchema = z.object({
  id: z.string().min(1),
  emoji: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  aiPromise: z.string().min(1),
});
```

修改 `AgentResponseEnvelopeSchema`（当前位于第 34-46 行）：

```typescript
export const AgentResponseEnvelopeSchema = z.object({
  summary: z.string().min(1),
  source: z.string().min(1),
  statusColor: z.enum(['good', 'warning', 'error']),
  chartTokens: z.array(ChartTokenIdSchema),
  microTips: z.array(z.string()).optional(),       // 改为可选
  actions: z.array(ActionOptionSchema).max(3).optional(),  // 新增
  meta: z.object({
    taskType: AgentTaskTypeSchema,
    pageContext: PageContextSchema,
    finishReason: z.enum(['complete', 'fallback', 'timeout', 'cached']),
    sessionId: z.string().optional(),
  }),
});
```

- [ ] **Step 5: 更新导出**

在 `packages/shared/src/index.ts` 第 54 行附近，将 `ActionOption` 加入类型导出：

```typescript
export type { DataTab, Timeframe, PageContext, AgentResponseEnvelope, ActionOption } from './types/agent';
```

在第 131-136 行附近，将 `ActionOptionSchema` 加入 schema 导出：

```typescript
export {
  AgentTaskTypeSchema,
  DataTabSchema,
  TimeframeSchema,
  PageContextSchema,
  AgentResponseEnvelopeSchema,
  ActionOptionSchema,
} from './schemas/agent';
```

- [ ] **Step 6: 构建并运行测试**

```bash
pnpm --filter @health-advisor/shared build
npx vitest run packages/shared/
```

Expected: ALL PASS

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src/types/agent.ts packages/shared/src/schemas/agent.ts packages/shared/src/index.ts packages/shared/src/__tests__/schemas.test.ts
git commit -m "feat(shared): add ActionOption type and make microTips optional"
```

---

## Module B: Pipeline 后端适配

> **Pipeline 位置:** Step 7 (解析), Step 9 (安全清洗)
> **目标:** parser 支持 actions 解析，runtime/safety-cleaner 适配可选 microTips 和 actions 清洗
> **前置:** Module A 完成

---

### Task B1: 更新 response-parser 支持 actions

**任务卡**

```
┌──────────────────────────────────────────────────────┐
│ Task B1: 更新 response-parser 支持 actions           │
├──────────────────────────────────────────────────────┤
│ 模块: B (Pipeline 后端)                              │
│ Pipeline 步骤: Step 7 parseAgentResponse()           │
│ 文件: packages/agent-core/src/output/response-parser │
│       .ts (当前 155 行)                               │
│ 前置依赖: A1 (新类型)                                │
│ 后续解锁: B2                                         │
│ 设计文档参考: §4.1 交互选项归属                       │
├──────────────────────────────────────────────────────┤
│ 目标:                                                 │
│   1. 新增 MAX_ACTIONS 常量 (limits.ts)               │
│   2. 解析 actions 字段，严格校验每个字段              │
│   3. microTips 改为可选                               │
│   4. 不截断 actions (与 chartTokens 不同)，严格 reject│
│                                                      │
│ 核心设计决策:                                         │
│   actions 缺失 → 可接受 (返回 undefined)              │
│   actions 字段不完整 → 整体 reject → 走 fallback     │
│   actions 数量超限 → 整体 reject → 走 fallback       │
│   不做静默截断/补字段/过滤，避免隐藏 LLM 输出问题     │
└──────────────────────────────────────────────────────┘
```

**Files:**
- Modify: `packages/agent-core/src/constants/limits.ts` (当前 18 行)
- Modify: `packages/agent-core/src/output/response-parser.ts` (当前 155 行)
- Test: `packages/agent-core/src/__tests__/output/response-parser.test.ts`

- [ ] **Step 1: 新增 MAX_ACTIONS 常量**

在 `packages/agent-core/src/constants/limits.ts` 末尾添加：

```typescript
/** 单次响应最大 action 选项数 */
export const MAX_ACTIONS = 3;
```

- [ ] **Step 2: 写失败测试**

在 `packages/agent-core/src/__tests__/output/response-parser.test.ts` 中添加：

```typescript
describe('actions parsing', () => {
  const validMeta = {
    taskType: AgentTaskType.HOMEPAGE_SUMMARY,
    pageContext: {
      profileId: 'test-profile',
      page: 'home',
      timeframe: 'week',
    },
  };

  it('parses valid actions from LLM output', () => {
    const raw = JSON.stringify({
      source: 'llm',
      statusColor: 'good',
      summary: '测试摘要',
      chartTokens: [],
      microTips: [],
      actions: [
        { id: 'opt-1', emoji: '🚶', title: '餐后漫步', description: '走15分钟', aiPromise: '记录选择' },
        { id: 'opt-2', emoji: '🧘', title: '深度充电', description: '冥想20分钟', aiPromise: '记录选择' },
      ],
    });
    const result = parseAgentResponse(raw, validMeta);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.envelope.actions).toHaveLength(2);
      expect(result.envelope.actions?.[0]?.emoji).toBe('🚶');
    }
  });

  it('tolerates missing actions field', () => {
    const raw = JSON.stringify({
      source: 'llm',
      statusColor: 'good',
      summary: '测试摘要',
      chartTokens: [],
      microTips: [],
    });
    const result = parseAgentResponse(raw, validMeta);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.envelope.actions).toBeUndefined();
    }
  });

  it('tolerates missing microTips field', () => {
    const raw = JSON.stringify({
      source: 'llm',
      statusColor: 'good',
      summary: '测试摘要',
      chartTokens: [],
    });
    const result = parseAgentResponse(raw, validMeta);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.envelope.microTips).toBeUndefined();
    }
  });

  it('rejects actions above max 3', () => {
    const actions = Array.from({ length: 5 }, (_, i) => ({
      id: `opt-${i}`,
      emoji: '🏃',
      title: `选项${i}`,
      description: `描述${i}`,
      aiPromise: `承诺${i}`,
    }));
    const raw = JSON.stringify({
      source: 'llm',
      statusColor: 'good',
      summary: '测试摘要',
      chartTokens: [],
      actions,
    });
    const result = parseAgentResponse(raw, validMeta);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('actions');
    }
  });

  it('rejects actions with incomplete fields', () => {
    const raw = JSON.stringify({
      source: 'llm',
      statusColor: 'good',
      summary: '测试摘要',
      chartTokens: [],
      actions: [{ id: 'opt-1', emoji: '🚶' }],
    });
    const result = parseAgentResponse(raw, validMeta);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('actions');
    }
  });

  it('rejects actions when not an array', () => {
    const raw = JSON.stringify({
      source: 'llm',
      statusColor: 'good',
      summary: '测试摘要',
      chartTokens: [],
      actions: 'not-an-array',
    });
    const result = parseAgentResponse(raw, validMeta);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('actions');
    }
  });
});
```

- [ ] **Step 3: 运行测试确认失败**

```bash
npx vitest run packages/agent-core/src/__tests__/output/response-parser.test.ts
```

Expected: FAIL — 当前 parser 不处理 actions

- [ ] **Step 4: 修改 response-parser.ts**

在 `response-parser.ts` 中，修改 import 和解析逻辑：

```typescript
// 第 4 行，添加 MAX_ACTIONS import
import { MAX_CHART_TOKENS, MAX_MICRO_TIPS, MAX_ACTIONS } from '../constants/limits';
```

在第 73-77 行（microTips 截断之后，statusColor 解析之前），新增 actions 解析：

```typescript
// microTips 截断（适配可选）
const rawTips = Array.isArray(obj.microTips)
  ? obj.microTips.filter((t): t is string => typeof t === 'string')
  : [];
const tips = rawTips.slice(0, MAX_MICRO_TIPS);

// actions 解析（新增，严格校验）
let actions: AgentResponseEnvelope['actions'] | undefined;
if (obj.actions !== undefined) {
  if (!Array.isArray(obj.actions)) {
    return { success: false, error: 'actions 必须是数组', raw };
  }
  if (obj.actions.length > MAX_ACTIONS) {
    return { success: false, error: `actions 数量不能超过 ${MAX_ACTIONS}`, raw };
  }
  const parsedActions: NonNullable<AgentResponseEnvelope['actions']> = [];
  for (const [index, a] of obj.actions.entries()) {
    if (
      typeof a !== 'object' || a === null ||
      typeof (a as Record<string, unknown>).id !== 'string' ||
      typeof (a as Record<string, unknown>).emoji !== 'string' ||
      typeof (a as Record<string, unknown>).title !== 'string' ||
      typeof (a as Record<string, unknown>).description !== 'string' ||
      typeof (a as Record<string, unknown>).aiPromise !== 'string'
    ) {
      return { success: false, error: `actions[${index}] 字段不完整`, raw };
    }
    const action = a as Record<string, string>;
    parsedActions.push({
      id: action.id,
      emoji: action.emoji,
      title: action.title,
      description: action.description,
      aiPromise: action.aiPromise,
    });
  }
  actions = parsedActions.length > 0 ? parsedActions : undefined;
}
```

修改 envelope 构建（当前第 102-113 行）：

```typescript
const envelope: AgentResponseEnvelope = {
  summary,
  source: typeof obj.source === 'string' && obj.source.length > 0 ? obj.source : 'llm',
  statusColor,
  chartTokens: validTokens,
  microTips: tips.length > 0 ? tips : undefined,    // 改为可选
  actions,                                            // 新增
  meta: {
    taskType: meta.taskType,
    pageContext: meta.pageContext,
    finishReason: 'complete',
  },
};
```

- [ ] **Step 5: 更新旧测试中的 microTips 断言**

旧测试中如果有 `expect(envelope.microTips).toEqual([])` 的断言，需要改为 `expect(envelope.microTips).toBeUndefined()`。搜索文件中所有 `microTips` 引用，确保适配可选语义。

- [ ] **Step 6: 运行测试**

```bash
npx vitest run packages/agent-core/src/__tests__/output/response-parser.test.ts
```

Expected: ALL PASS

- [ ] **Step 7: Commit**

```bash
git add packages/agent-core/src/constants/limits.ts packages/agent-core/src/output/response-parser.ts packages/agent-core/src/__tests__/output/response-parser.test.ts
git commit -m "feat(parser): support strict actions parsing and optional microTips"
```

---

### Task B2: 更新 safety-cleaner + agent-runtime

**任务卡**

```
┌──────────────────────────────────────────────────────┐
│ Task B2: 更新 safety-cleaner + agent-runtime         │
├──────────────────────────────────────────────────────┤
│ 模块: B (Pipeline 后端)                              │
│ Pipeline 步骤: Step 9 cleanSafetyIssues()            │
│ 文件: safety-cleaner.ts (当前 128 行),               │
│       agent-runtime.ts (当前 287 行)                  │
│ 前置依赖: A1, B1                                    │
│ 后续解锁: D4, E1                                    │
│ 设计文档参考: §4.1 交互选项归属                       │
├──────────────────────────────────────────────────────┤
│ 目标:                                                 │
│   1. SafetyCleanResult 新增 cleanedActions 字段       │
│   2. cleanSafetyIssues 覆盖 actions 文本清洗          │
│   3. agent-runtime 适配 microTips 可选 + 传递 actions │
│                                                      │
│ 安全清洗范围:                                         │
│   actions 的 title/description/aiPromise 是用户可见   │
│   文本，必须和 summary/microTips 一样经过诊断语言、    │
│   药物建议、缺失数据幻觉的清洗                         │
└──────────────────────────────────────────────────────┘
```

**Files:**
- Modify: `packages/agent-core/src/output/safety-cleaner.ts` (当前 128 行)
- Modify: `packages/agent-core/src/runtime/agent-runtime.ts` (当前 287 行)
- Test: `packages/agent-core/src/__tests__/output/safety-cleaner.test.ts`
- Test: `packages/agent-core/src/__tests__/runtime/agent-runtime.test.ts`

- [ ] **Step 1: 更新 SafetyCleanResult 和 cleanSafetyIssues**

在 `safety-cleaner.ts` 中：

1. 添加 import：

```typescript
import type { ActionOption } from '@health-advisor/shared';
```

2. 修改 `SafetyCleanResult` 接口（第 7-11 行）：

```typescript
export interface SafetyCleanResult {
  cleaned: string;
  cleanedTips: string[];
  cleanedActions: ActionOption[];  // 新增
  flags: SafetyFlag[];
}
```

3. 修改 `cleanSafetyIssues` 函数签名（第 43-47 行），新增 `actions` 参数：

```typescript
export function cleanSafetyIssues(
  summary: string,
  missingMetrics: string[],
  microTips: string[] = [],
  actions: ActionOption[] = [],     // 新增
): SafetyCleanResult {
```

4. 在函数末尾（第 97-109 行，microTips 清洗之后），添加 actions 清洗：

```typescript
  // 清洗 actions（新增）
  const cleanedActions = actions.map((action) => {
    let cleanedTitle = action.title;
    let cleanedDesc = action.description;
    let cleanedPromise = action.aiPromise;

    for (const { pattern, replacement } of DIAGNOSIS_PATTERNS) {
      cleanedTitle = cleanedTitle.replace(pattern, replacement);
      cleanedDesc = cleanedDesc.replace(pattern, replacement);
      cleanedPromise = cleanedPromise.replace(pattern, replacement);
    }
    for (const { pattern, replacement } of MEDICATION_PATTERNS) {
      cleanedTitle = cleanedTitle.replace(pattern, replacement);
      cleanedDesc = cleanedDesc.replace(pattern, replacement);
      cleanedPromise = cleanedPromise.replace(pattern, replacement);
    }

    return {
      ...action,
      title: cleanedTitle,
      description: cleanedDesc,
      aiPromise: cleanedPromise,
    };
  });

  return { cleaned, cleanedTips, cleanedActions, flags };
```

- [ ] **Step 2: 写安全清洗测试**

在 `packages/agent-core/src/__tests__/output/safety-cleaner.test.ts` 中添加：

```typescript
describe('actions cleaning', () => {
  it('cleans diagnosis language in action text', () => {
    const actions: ActionOption[] = [
      {
        id: 'opt-1',
        emoji: '🏃',
        title: '确诊为疲劳',
        description: '你患有过度训练综合征',
        aiPromise: '建议服用药物缓解',
      },
    ];
    const result = cleanSafetyIssues('正常摘要', [], [], actions);
    expect(result.cleanedActions[0]?.title).toBe('检测到疲劳');
    expect(result.cleanedActions[0]?.description).toBe('你检测到过度训练综合征');
    expect(result.cleanedActions[0]?.aiPromise).toBe('建议及时就医咨询');
  });

  it('returns empty cleanedActions when no actions provided', () => {
    const result = cleanSafetyIssues('正常摘要', []);
    expect(result.cleanedActions).toEqual([]);
  });
});
```

- [ ] **Step 3: 修改 agent-runtime.ts**

修改第 133-147 行（Step 9 Safety clean 部分）：

```typescript
    // 9. Safety clean
    const cleaned = cleanSafetyIssues(
      safeEnvelope.summary,
      context.dataWindow.missingFields,
      safeEnvelope.microTips ?? [],     // 适配可选
      safeEnvelope.actions ?? [],        // 新增
    );

    const result: AgentResponseEnvelope = {
      ...safeEnvelope,
      summary: cleaned.cleaned,
      microTips: cleaned.cleanedTips.length > 0 ? cleaned.cleanedTips : undefined,  // 适配可选
      actions: cleaned.cleanedActions.length > 0 ? cleaned.cleanedActions : undefined, // 新增
      meta: {
        ...safeEnvelope.meta,
        finishReason: 'complete',
      },
    };
```

- [ ] **Step 4: 更新 agent-runtime 测试**

在 `packages/agent-core/src/__tests__/runtime/agent-runtime.test.ts` 中：
- 搜索所有引用 `microTips` 的断言，适配可选语义（`toBeUndefined()` 或可选链）
- 确认 `cleanSafetyIssues` 调用签名变更不会破坏现有 mock

- [ ] **Step 5: 运行测试**

```bash
npx vitest run packages/agent-core/src/__tests__/output/safety-cleaner.test.ts packages/agent-core/src/__tests__/runtime/agent-runtime.test.ts
```

Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
git add packages/agent-core/src/output/safety-cleaner.ts packages/agent-core/src/runtime/agent-runtime.ts packages/agent-core/src/__tests__/output/safety-cleaner.test.ts packages/agent-core/src/__tests__/runtime/agent-runtime.test.ts
git commit -m "refactor(runtime): clean action text and support optional microTips"
```

---

## Module C: 数据透明化

> **Pipeline 位置:** Step 4 (上下文数据包构建), Step 5 (system prompt 构建)
> **目标:** 移除 HRV/SpO2/静息心率的 triple lock，让 LLM 能看到具体数值
> **前置:** 无（与 Module A 独立，可与 Module A 并行执行）
> **设计文档参考:** §3.3 数据引用模式, §4.2 数据透明化

**背景知识:** 当前存在"三重锁定"阻止 Homepage 回复引用 HRV/SpO2/静息心率数值：

1. **Prompt 层** (`template.md` 第 36-40 行): "Metric Expression Red Lines" 明确禁止输出这些指标的具体值
2. **System builder 层** (`system-builder.ts` 第 39-51 行): Homepage 分支只传文字描述，不传 baseline 具体值
3. **Context packet 层** (`context-packet-renderer.ts`): `HOMEPAGE_INTERPRETATION_ONLY_METRICS` 屏蔽所有数值

本模块移除第 2、3 重锁定。第 1 重由 Module D 的 prompt 重写处理。

---

### Task C1: 解除数据屏蔽 — context-packet-renderer

**任务卡**

```
┌──────────────────────────────────────────────────────┐
│ Task C1: 解除数据屏蔽 — context-packet-renderer      │
├──────────────────────────────────────────────────────┤
│ 模块: C (数据透明化)                                 │
│ Pipeline 步骤: Step 4 buildTaskContextPacket()       │
│ 文件: context-packet-renderer.ts (当前 411 行)       │
│ 前置依赖: 无                                        │
│ 可并行: 与 C2 并行                                  │
│ 后续解锁: D1, D2, D3, D4                            │
│ 设计文档参考: §3.3, §4.2                            │
├──────────────────────────────────────────────────────┤
│ 目标:                                                │
│   移除 HOMEPAGE_INTERPRETATION_ONLY_METRICS 常量     │
│   移除 isHomepageInterpretationOnlyMetric() 函数     │
│   renderMetricSummary: 移除 interpretationOnly 分支  │
│   renderEvidence: 移除 isHomepage value 屏蔽         │
│   renderHomepage latest24h: 统一输出具体数值          │
│   renderVisibleCharts: 移除 interpretationOnly 参数  │
└──────────────────────────────────────────────────────┘
```

**Files:**
- Modify: `packages/agent-core/src/prompts/context-packet-renderer.ts` (当前 411 行)
- Test: `packages/agent-core/src/__tests__/prompts/context-packet-renderer.test.ts`

- [ ] **Step 1: 写失败测试**

在 `packages/agent-core/src/__tests__/prompts/context-packet-renderer.test.ts` 中添加：

```typescript
describe('homepage 数据透明化', () => {
  it('homepage 任务下 HRV trend7d 渲染包含具体数值', () => {
    // 构造包含 HRV 数据的 homepage packet，调用 renderTaskContextPacket
    // 验证渲染结果包含数值格式（如 "latest Xms" 或具体数字+单位）
    // 此测试当前会失败，因为 HRV 被 interpretation-only 屏蔽
  });

  it('homepage 任务下 latest24h HRV 包含具体数值', () => {
    // 构造 latest24h 中有 HRV 指标的 packet
    // 验证渲染结果不包含 "不输出具体数值" 的限制性文字
    // 验证渲染结果包含具体值和单位
  });

  it('homepage 任务下 Evidence 包含 HRV value', () => {
    // 构造 evidence 中有 HRV metric 的 fact
    // 验证渲染结果包含 value 字段
  });
});
```

注意：具体测试数据构造需要参考现有测试文件中的 helper 函数（如 `buildTestPacket` 或类似的 factory）。请先阅读现有测试文件了解测试数据构造模式。

- [ ] **Step 2: 运行测试确认失败**

```bash
npx vitest run packages/agent-core/src/__tests__/prompts/context-packet-renderer.test.ts
```

Expected: FAIL

- [ ] **Step 3: 移除 interpretation-only 屏蔽**

在 `context-packet-renderer.ts` 中依次移除以下内容：

**3a.** 删除第 16 行的常量：
```typescript
// 删除这行
const HOMEPAGE_INTERPRETATION_ONLY_METRICS = new Set(['hrv', 'spo2', 'resting_hr', 'resting-hr']);
```

**3b.** 修改 `renderTaskContextPacket`（第 35-51 行），移除 `isHomepage` 变量和参数传递：
```typescript
export function renderTaskContextPacket(packet: TaskContextPacket, locale: Locale = 'zh'): string {
  const sections: string[] = [];

  sections.push(renderTaskPacket(packet.task, locale));
  sections.push(renderUserContext(packet.userContext, locale));  // 移除 isHomepage 参数
  sections.push(renderDataWindow(packet.dataWindow, locale));
  sections.push(renderMissingData(packet.missingData, locale));
  sections.push(renderVisibleCharts(packet.visibleCharts, locale));  // 移除 isHomepage 参数
  sections.push(renderEvidence(packet.evidence));  // 移除 isHomepage 参数

  if (packet.homepage) sections.push(renderHomepage(packet.homepage, locale));
  if (packet.viewSummary) sections.push(renderViewSummary(packet.viewSummary, locale));
  if (packet.advisorChat) sections.push(renderAdvisorChat(packet.advisorChat, locale));

  return sections.filter(Boolean).join('\n\n');
}
```

**3c.** 修改 `renderUserContext`（第 74-97 行），移除 `isHomepage` 参数：
```typescript
function renderUserContext(user: UserContextPacket, locale: Locale): string {
```
将第 85-93 行的 if/else 改为统一输出（移除 Homepage 分支，所有任务都输出具体值）：
```typescript
  lines.push(`- ${t(locale, '静息心率通常水平', 'Resting HR usual level')}${c}${user.baselines.restingHR} bpm`);
  lines.push(`- ${t(locale, 'HRV 通常水平', 'HRV usual level')}${c}${user.baselines.hrv} ms`);
  lines.push(`- ${t(locale, 'SpO2 参考水平', 'SpO2 reference level')}${c}${user.baselines.spo2}%`);
```

**3d.** 修改 `renderVisibleCharts`（第 140-151 行），移除 `isHomepage` 参数和 interpretationOnly 选项：
```typescript
function renderVisibleCharts(charts: VisibleChartPacket[], locale: Locale): string {
  if (charts.length === 0) return '';

  const lines = [t(locale, '## 可见图表', '## Visible Charts')];
  for (const chart of charts) {
    lines.push(`- ${chart.chartToken} (${chart.metric}, ${chart.timeframe})`);
    lines.push(renderMetricSummary(chart.dataSummary, '  ', {}, locale));
  }
  return lines.join('\n');
}
```

**3e.** 修改 `renderEvidence`（第 157-173 行），移除 `isHomepage` 参数和屏蔽条件：
```typescript
function renderEvidence(evidence: EvidenceFact[]): string {
  if (evidence.length === 0) return '';

  const lines = ['## Evidence Facts'];
  for (const fact of evidence) {
    const parts: string[] = [`- ${fact.id}:`];
    parts.push(`source=${fact.source}`);
    if (fact.dateRange) parts.push(`${fact.dateRange.start}~${fact.dateRange.end}`);
    if (fact.metric) parts.push(`metric=${fact.metric}`);
    if (fact.value !== undefined) {  // 移除 isHomepage 屏蔽条件
      parts.push(`value=${fact.value}${fact.unit ?? ''}`);
    }
    parts.push(`derivation=${fact.derivation}`);
    lines.push(parts.join(', '));
  }
  return lines.join('\n');
}
```

**3f.** 修改 `renderHomepage`（第 179-242 行）中的 latest24h 渲染（第 198-215 行），移除 `isHomepageInterpretationOnlyMetric` 分支，统一走数值输出路径：
```typescript
      for (const m of homepage.latest24h.metrics) {
    if (m.status === 'missing') {
      lines.push(`- ${m.metric}${c}${t(locale, '数据缺失', 'data missing')}`);
    } else {
      const parts: string[] = [`- ${m.metric}${c}${m.value}${m.unit}`];
      if (m.baseline !== undefined && m.deltaPctVsBaseline !== undefined) {
        const sign = m.deltaPctVsBaseline > 0 ? '+' : '';
        parts.push(`（${t(locale, '相对平时', 'vs usual')} ${sign}${m.deltaPctVsBaseline}%）`);
      }
      if (m.status === 'attention') parts.push(`[${t(locale, '注意', 'attention')}]`);
      if (m.status === 'critical') parts.push(`[${t(locale, '异常', 'critical')}${m.clinicalNote ? `: ${m.clinicalNote}` : ''}]`);
      lines.push(parts.join(''));
    }
  }
```

同样修改 trend7d 渲染（第 218-225 行），移除 interpretationOnly 选项：
```typescript
      for (const tr of homepage.trend7d) {
    lines.push(renderMetricSummary(tr, '- ', {}, locale));
  }
```

**3g.** 修改 `renderMetricSummary`（第 348-375 行），移除 `interpretationOnly` 分支：
```typescript
function renderMetricSummary(
  ms: MetricSummary,
  prefix: string = '',
  _options: { interpretationOnly?: boolean } = {},  // 保留参数签名兼容，但不再使用
  locale: Locale = 'zh',
): string {
  const parts: string[] = [];
  parts.push(`${prefix}${ms.metric}:`);
  if (ms.latest) parts.push(`latest ${ms.latest.value}${ms.latest.unit} on ${ms.latest.date ?? 'latest'}`);
  if (ms.average) parts.push(`avg ${ms.average.value}${ms.average.unit}`);
  if (ms.baseline) {
    const delta = ms.deltaPctVsBaseline !== undefined ? ` (${ms.deltaPctVsBaseline > 0 ? '+' : ''}${ms.deltaPctVsBaseline}%)` : '';
    parts.push(`${t(locale, '通常水平', 'usual level')} ${ms.baseline.value}${ms.baseline.unit}${delta}`);
  }
  parts.push(`trend ${ms.trendDirection}`);
  if (ms.anomalyPoints.length > 0) {
    parts.push(`anomalies: ${ms.anomalyPoints.map((a) => `${a.date}=${a.value}`).join(', ')}`);
  }
  parts.push(`completeness ${ms.missing.completenessPct}% (${ms.missing.totalCount - ms.missing.missingCount}/${ms.missing.totalCount})`);
  return parts.join(', ');
}
```

**3h.** 删除第 394-396 行的辅助函数：
```typescript
// 删除这个函数
function isHomepageInterpretationOnlyMetric(metric?: string): boolean {
  return metric !== undefined && HOMEPAGE_INTERPRETATION_ONLY_METRICS.has(metric);
}
```

- [ ] **Step 4: 更新旧测试断言**

在测试文件中搜索以下断言模式并更新：
- `expect(rendered).not.toContain('latest')` → `expect(rendered).toContain('latest')`
- `expect(rendered).toContain('仅用于解读')` → `expect(rendered).not.toContain('仅用于解读')`
- `expect(rendered).not.toContain(/\d+\s*ms/)` → `expect(rendered).toMatch(/\d+\s*ms/)`
- 移除所有对 `isHomepageInterpretationOnlyMetric` 的测试

- [ ] **Step 5: 运行全部相关测试**

```bash
npx vitest run packages/agent-core/src/__tests__/prompts/
```

Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
git add packages/agent-core/src/prompts/context-packet-renderer.ts packages/agent-core/src/__tests__/prompts/context-packet-renderer.test.ts
git commit -m "refactor(context): remove interpretation-only metric masking for homepage"
```

---

### Task C2: 解除数据屏蔽 — system-builder

**任务卡**

```
┌──────────────────────────────────────────────────────┐
│ Task C2: 解除数据屏蔽 — system-builder               │
├──────────────────────────────────────────────────────┤
│ 模块: C (数据透明化)                                 │
│ Pipeline 步骤: Step 5 buildSystemPrompt()            │
│ 文件: system-builder.ts (当前 106 行)                │
│ 前置依赖: 无                                        │
│ 可并行: 与 C1 并行                                  │
│ 后续解锁: D3                                        │
│ 设计文档参考: §3.3, §4.2                            │
├──────────────────────────────────────────────────────┤
│ 目标:                                                │
│   Homepage 分支也传递 HRV/SpO2/静息心率的具体值      │
│   将"禁止输出"的措辞改为"可用但用比喻包装"的引导     │
│                                                      │
│ 当前行为 (第 39-51 行):                              │
│   Homepage → "禁止输出具体数值或相对关系"             │
│   其他任务 → "静息心率通常水平: 62 bpm"              │
│                                                      │
│ 期望行为:                                            │
│   Homepage → "静息心率通常水平: 62 bpm — 可引用但    │
│   用生活化比喻包装"                                  │
└──────────────────────────────────────────────────────┘
```

**Files:**
- Modify: `packages/agent-core/src/prompts/system-builder.ts` (当前 106 行)
- Test: `packages/agent-core/src/__tests__/prompts/system-builder.test.ts`

- [ ] **Step 1: 写失败测试**

在 `packages/agent-core/src/__tests__/prompts/system-builder.test.ts` 中添加：

```typescript
describe('homepage baseline 值可见', () => {
  it('homepage 任务下也传递 HRV/SpO2/静息心率的具体 baseline 值', () => {
    // 构造 HOMEPAGE_SUMMARY 类型的 context
    // 调用 buildSystemPrompt
    // 验证 prompt 包含具体数值（如 "62 bpm"、"110 ms"、"98%"）
    // 验证 prompt 不包含 "禁止输出具体数值"
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npx vitest run packages/agent-core/src/__tests__/prompts/system-builder.test.ts
```

Expected: FAIL

- [ ] **Step 3: 修改 system-builder.ts 第 39-56 行**

将 Homepage 分支从隐藏数值改为传递具体值：

```typescript
  if (context.task.type === AgentTaskType.HOMEPAGE_SUMMARY) {
    sections.push(`- ${t(locale, '静息心率通常水平', 'Resting HR usual level')}: ${context.profile.baselines.restingHR} bpm — ${t(locale, '可用于数据引用，但用生活化比喻包装', 'may reference in response, but wrap with relatable analogies')}`);
    sections.push(`- ${t(locale, 'HRV 通常水平', 'HRV usual level')}: ${context.profile.baselines.hrv} ms — ${t(locale, '可用于数据引用，但用生活化比喻包装', 'may reference in response, but wrap with relatable analogies')}`);
    sections.push(`- ${t(locale, 'SpO2 参考水平', 'SpO2 reference level')}: ${context.profile.baselines.spo2}% — ${t(locale, '可用于数据引用，但注意临床阈值提醒', 'may reference in response, but note clinical thresholds')}`);
  } else {
    // 其他任务保持不变
    sections.push(`- ${t(locale, '静息心率通常水平', 'Resting HR usual level')}: ${context.profile.baselines.restingHR} bpm`);
    sections.push(`- ${t(locale, 'HRV 通常水平', 'HRV usual level')}: ${context.profile.baselines.hrv} ms`);
    sections.push(`- ${t(locale, 'SpO2 参考水平', 'SpO2 reference level')}: ${context.profile.baselines.spo2}%`);
  }
```

- [ ] **Step 4: 更新旧测试断言**

搜索测试中验证"禁止输出"的断言，改为验证数值可见：
- `expect(prompt).toContain('禁止输出')` → `expect(prompt).not.toContain('禁止输出')`
- 新增 `expect(prompt).toContain('ms')` 等数值断言

- [ ] **Step 5: 运行测试**

```bash
npx vitest run packages/agent-core/src/__tests__/prompts/system-builder.test.ts
```

Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
git add packages/agent-core/src/prompts/system-builder.ts packages/agent-core/src/__tests__/prompts/system-builder.test.ts
git commit -m "refactor(prompt): expose baseline values to LLM for homepage"
```

---

## Module D: Prompt 重写

> **Pipeline 位置:** Step 5 (Prompt 构建)
> **目标:** 重写 prompt 模板实现新的回复风格
> **前置:** Module B (parser 支持 actions), Module C (数据透明化)
> **设计文档参考:** §2 回复样例对照, §3 模式分析

---

### Task D1: 重写中文风格文件

**任务卡**

```
┌──────────────────────────────────────────────────────┐
│ Task D1: 重写中文风格文件                            │
├──────────────────────────────────────────────────────┤
│ 模块: D (Prompt 重写)                               │
│ Pipeline 步骤: Step 5 buildTaskPrompt()              │
│ 文件: data/sandbox/prompts/homepage/style/zh.md     │
│       (当前 3 行)                                    │
│ 前置依赖: 无                                        │
│ 可并行: 与 D2 并行                                  │
│ 后续解锁: D4                                        │
│ 设计文档参考: §2 全部样例, §3.6 语气特征            │
├──────────────────────────────────────────────────────┤
│ 背景:                                                │
│   当前文件仅 3 行："语气知性、直截了当" + 中文要求   │
│   需要重写为完整的风格指南，覆盖人称、开场白、数据   │
│   引用、比喻、建议、summary/actions 分工              │
└──────────────────────────────────────────────────────┘
```

**Files:**
- Modify: `data/sandbox/prompts/homepage/style/zh.md` (当前 3 行)

- [ ] **Step 1: 重写 style/zh.md**

将当前 3 行内容完整替换为：

```markdown
## Communication Style

### 人称与语气
- 使用第一人称"我"自称，"你"称呼用户
- 语气温暖但不谄媚，像一个懂运动的健康伙伴在耳边低声提醒
- 自然、口语化，避免书面正式或机械罗列

### 开场白
- 以用户姓名 + 逗号开头，紧跟一句与当前事件相关的即时观察
- 示例："小明，吃得不错！检测到你的心率正在随代谢平稳回升。"
- 示例："小明，先慢下来！监测到你刚吃完饭就开始了高强度有氧。"
- 禁止使用"尊敬的用户"、"您好"等客套开场

### 数据引用
- 可以引用具体数值来增强说服力，但需要用生活化的比喻包装
- 示例："这几天的 HRV 正在悄悄'阴跌'（从 110ms 降到了 95ms）"
- 示例："你昨晚睡了快 8 小时，深睡很足"
- 避免单纯罗列数据，每个数值都要有解读或行动建议伴随
- 只能引用上下文中明确提供的数值；不要为了贴近示例编造半衰期、百分比损失、步数缺口或提醒时间
- 如果数据缺失，直接说明暂时没有足够数据，不要用个人 baseline 或常识阈值补出具体数字

### 比喻与类比
- 用日常比喻解释专业概念："高压电池"、"脑力电池"、"阴跌"
- 用拟人化动作增强画面感："HRV 在悄悄走下坡路"、"胃部供血被肌肉'抢走'"

### 建议风格
- 具体到时间和行动：不是"适度运动"，而是"去外面走 15 分钟"
- 附带理由：每个建议都要有"为什么"支撑
- 避免泛泛建议：禁止"多喝水"、"保持好习惯"等无信息量建议

### summary 与 actions 分工
- summary 只负责开场、交叉分析、建议理由和一句选择引导
- 不要在 summary 中写完整选项列表；完整选项必须输出到 actions 字段
- actions 的 aiPromise 必须匹配当前系统真实可执行能力，不能承诺尚未实现的提醒、监控或模式切换

### 安全边界（不变）
- 你不是医生，不能做出医学诊断
- 涉及严重异常时建议用户就医
- 不要对缺失数据进行推测或编造

### 语言
- You MUST respond entirely in Chinese. All summary, statusColor interpretation, action descriptions and aiPromise must be in Chinese.
```

- [ ] **Step 2: Commit**

```bash
git add data/sandbox/prompts/homepage/style/zh.md
git commit -m "feat(prompt): rewrite zh style guide for homepage"
```

---

### Task D2: 重写 Homepage Task Template

**任务卡**

```
┌──────────────────────────────────────────────────────┐
│ Task D2: 重写 Homepage Task Template                │
├──────────────────────────────────────────────────────┤
│ 模块: D (Prompt 重写)                               │
│ Pipeline 步骤: Step 5 buildTaskPrompt()              │
│ 文件: data/sandbox/prompts/homepage/template.md     │
│       (当前 63 行)                                   │
│ 前置依赖: 无                                        │
│ 可并行: 与 D1 并行                                  │
│ 后续解锁: D4                                        │
│ 设计文档参考: §2 全部样例, §3.1 段落结构            │
├──────────────────────────────────────────────────────┤
│ 背景:                                                │
│   当前 template 定义了 60/30/10 内容比例、单段摘要   │
│   标准、Metric Red Lines 等。需要全面重写为新结构。   │
│                                                      │
│ 关键变化:                                            │
│   60/30/10 比例 → 10/30/35/10/15 五段结构           │
│   单段摘要 → 多段 summary + actions 分离             │
│   Metric Red Lines → 全指标可引用规则                │
│   microTips 要求 → 移除                              │
└──────────────────────────────────────────────────────┘
```

**Files:**
- Modify: `data/sandbox/prompts/homepage/template.md` (当前 63 行)

- [ ] **Step 1: 重写 template.md**

将当前 63 行内容完整替换为：

```markdown
## 实时健康简报

基于用户的 **最近事件**、**过去 24 小时状态** 和 **过去一周趋势**，生成一份实时健康简报。

### 回复结构（严格遵循）

首页卡片由 summary 和 actions 两部分组成。summary 由以下段落按顺序输出：

**段落 1 — 开场白（~10%）**
以用户姓名 + 逗号开头，紧跟一句与当前事件相关的即时观察。要求生动、有画面感。语气随事件风险变化：正向事件先肯定，风险事件先提醒。

**段落 2 — 交叉分析（~30%）**
将最近事件与 24h 恢复状态进行交叉分析，融入周趋势。引用具体数据支撑，用生活化的比喻解释专业概念。

**段落 3 — 结构化建议（~35%）**
给出 1-2 个具体、可操作的建议。每个建议包含：
- 具体行动（做什么、做多久）
- 理由（为什么这样做对身体有好处）
- 今日目标关联（如步数缺口、训练计划调整）

**段落 4 — 选择引导（~10%）**
一句话引导用户做出选择或采取行动，例如"你想怎么做？"、"我可以这样配合你："。

完整选项不要写进 summary。请在 JSON 的 actions 字段中提供 2-3 个行动方案。

### 数据引用规则

- **所有指标均可引用具体数值**，但需结合解读，避免纯数据罗列
- HRV：可以引用趋势变化（"从 110ms 降到 95ms"），并解释含义
- 睡眠：可以引用时长（"睡了快 8 小时"）、深睡比例
- 血氧：可以引用百分比，但需注意临床阈值提醒
- 静息心率：可以引用 bpm，并解读其与恢复状态的关系
- 步数/活动：可以引用具体数值和缺口
- 咖啡因/酒精事件：必须使用概率性语言（"可能"、"倾向于"），不得说"确认摄入"
- 只能引用上下文中明确提供或由上游算法明确计算的数值
- 不得编造半衰期、深睡损失比例、步数缺口、提醒时间、代谢斜率等样例风格数字
- 如果某项数据缺失，必须说明数据暂不可用，不能用 baseline 或常识阈值补出具体值

### statusColor 规则

- **good (green)**: 最近事件与身体状态匹配良好，恢复指标正常
- **warning (yellow)**: 最近事件与 24h 恢复状态存在轻度冲突，或单一指标明显偏离个人常值
- **error (red)**: 最近事件明显加重身体负担且恢复指标严重不足，或出现急性异常信号

### chartTokens 规则

- 睡眠异常或不足 → 必须包含 "SLEEP_7DAYS"
- 运动/活动相关 → 必须包含 "ACTIVITY_7DAYS"
- 24h 压力负荷或 HRV 异常 → 必须包含 "HRV_7DAYS" 或 "STRESS_LOAD_7DAYS"
- 睡眠结构问题 → 可包含 "SLEEP_STAGE_LAST_NIGHT"

### 写作红线

1. 禁止使用泛泛建议："多喝水"、"保持好习惯"、"注意休息"
2. 禁止医学诊断："确诊"、"患有"、"需要服药"
3. 禁止输出 markdown 格式标记（##、**、- 列表等），summary 字段只包含纯文本
4. 建议中不得包含"baseline"、"参考值"、"正常范围"等分析术语
5. 禁止在 summary 中重复 actions 的完整选项列表
6. actions.aiPromise 只能承诺当前产品真实支持的行为；如果只能记录选择，就写"我会记录你的选择并用于本次建议上下文"
7. 开场白必须以用户姓名开头，禁止省略姓名或使用"你好"替代
```

- [ ] **Step 2: Commit**

```bash
git add data/sandbox/prompts/homepage/template.md
git commit -m "feat(prompt): rewrite homepage template with new structure"
```

---

### Task D3: 微调 System Prompt

**任务卡**

```
┌──────────────────────────────────────────────────────┐
│ Task D3: 微调 System Prompt                          │
├──────────────────────────────────────────────────────┤
│ 模块: D (Prompt 重写)                               │
│ Pipeline 步骤: Step 5 buildSystemPrompt()            │
│ 文件: data/sandbox/prompts/system.md (当前 12 行)    │
│ 前置依赖: C2 (system-builder 改动后需要配合)        │
│ 后续解锁: D4                                        │
│ 设计文档参考: §3.6 语气特征                         │
├──────────────────────────────────────────────────────┤
│ 改动极小：仅修改第一行角色描述                       │
│ 其余 Analysis Principles 保持完全不变                 │
└──────────────────────────────────────────────────────┘
```

**Files:**
- Modify: `data/sandbox/prompts/system.md` (当前 12 行)

- [ ] **Step 1: 更新第一行**

将：
```
You are a top-tier sports medicine expert and personal health assistant. Tone: knowledgeable, direct, no fluff.
```
改为：
```
You are a knowledgeable and warm personal health companion. You speak like a trusted friend who happens to be a sports medicine expert — direct, caring, and never preachy.
```

保留其余 `## Analysis Principles` 部分不变。

- [ ] **Step 2: Commit**

```bash
git add data/sandbox/prompts/system.md
git commit -m "feat(prompt): adjust system prompt persona"
```

---

### Task D4: 调整字数限制 + 添加 actions 输出格式

**任务卡**

```
┌──────────────────────────────────────────────────────┐
│ Task D4: 调整字数限制 + 添加 actions 输出格式        │
├──────────────────────────────────────────────────────┤
│ 模块: D (Prompt 重写)                               │
│ Pipeline 步骤: Step 5 buildTaskPrompt()              │
│ 文件: task-router.ts (当前 55 行)                    │
│       task-builder.ts (当前 182 行)                  │
│ 前置依赖: B1 (parser 支持 actions), D1, D2, D3      │
│ 后续解锁: E1                                        │
│ 设计文档参考: §4.1, §6 关键指标对比                 │
├──────────────────────────────────────────────────────┤
│ 改动点:                                              │
│   1. task-router: maxSummaryLength 120 → 420        │
│   2. task-builder: 字数约束从 80-120 改为 220-420   │
│   3. task-builder: homepage JSON 示例新增 actions    │
│   4. task-builder: 输出字段说明移除 microTips 必填   │
└──────────────────────────────────────────────────────┘
```

**Files:**
- Modify: `packages/agent-core/src/routing/task-router.ts` (当前 55 行)
- Modify: `packages/agent-core/src/prompts/task-builder.ts` (当前 182 行)
- Test: `packages/agent-core/src/__tests__/routing/task-router.test.ts`
- Test: `packages/agent-core/src/__tests__/prompts/task-builder.test.ts`

- [ ] **Step 1: 写失败测试**

```typescript
// task-router.test.ts
it('homepage maxSummaryLength 为 420', () => {
  const route = TASK_ROUTES[AgentTaskType.HOMEPAGE_SUMMARY];
  expect(route.maxSummaryLength).toBe(420);
});
```

```typescript
// task-builder.test.ts — 验证 homepage prompt 包含 actions 格式说明
it('homepage prompt 包含 actions 输出格式', () => {
  // 构造 HOMEPAGE_SUMMARY context，调用 buildTaskPrompt
  // 验证结果包含 "actions" 和 "aiPromise"
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npx vitest run packages/agent-core/src/__tests__/routing/task-router.test.ts packages/agent-core/src/__tests__/prompts/task-builder.test.ts
```

Expected: FAIL (期望 420，实际 120)

- [ ] **Step 3: 修改 task-router.ts**

在第 20 行将 `120` 改为 `420`：

```typescript
    maxSummaryLength: 420,
```

- [ ] **Step 4: 修改 task-builder.ts 字数约束**

修改第 50-55 行，homepage 分支的中文长度约束：

```typescript
  if (taskType === AgentTaskType.HOMEPAGE_SUMMARY) {
    sections.push(t(
      locale,
      `- 摘要长度控制在 220-${maxLen} 字之间；完整卡片由 summary + actions 组成，整体阅读量约 300-500 字`,
      `- Summary length must be between 150-300 words; the full card combines summary and actions`,
    ));
  }
```

- [ ] **Step 5: 修改 task-builder.ts 输出字段说明**

修改第 63-67 行，更新输出字段说明：

```typescript
  sections.push(t(
    locale,
    '- 输出格式必须为 JSON，包含 source、statusColor、summary、chartTokens 字段；microTips 可选',
    '- Output must be valid JSON with fields: source, statusColor, summary, chartTokens; microTips is optional',
  ));
```

- [ ] **Step 6: 修改 task-builder.ts 输出格式 JSON 示例**

修改第 142-162 行的输出格式部分，为 homepage 提供专属 JSON 示例：

```typescript
  // 输出格式
  sections.push('');
  sections.push(t(locale, '## 输出格式', '## Output Format'));
  sections.push(t(locale, '请严格按以下 JSON 格式输出：', 'Output strictly in the following JSON format:'));

  if (taskType === AgentTaskType.HOMEPAGE_SUMMARY) {
    sections.push('```json');
    sections.push('{');
    sections.push('  "source": "llm",');
    sections.push('  "statusColor": "good",');
    sections.push(t(locale, '  "summary": "摘要文本（220-420字，纯文本，用 \\n 分隔段落）",', '  "summary": "Summary text (use \\n for paragraph breaks)",'));
    sections.push('  "chartTokens": ["HRV_7DAYS"],');
    sections.push('  "actions": [');
    sections.push('    {');
    sections.push('      "id": "opt-1",');
    sections.push('      "emoji": "🚶",');
    sections.push(t(locale, '      "title": "行动标题（4-8字）",', '      "title": "Action title",'));
    sections.push(t(locale, '      "description": "简短描述行动内容",', '      "description": "Brief description",'));
    sections.push(t(locale, '      "aiPromise": "选择后 AI 会做什么"', '      "aiPromise": "What AI will do"'));
    sections.push('    }');
    sections.push('  ]');
    sections.push('}');
    sections.push('```');
  } else {
    sections.push('```json');
    sections.push('{');
    sections.push('  "source": "llm",');
    sections.push('  "statusColor": "good",');
    sections.push(t(locale, '  "summary": "摘要文本",', '  "summary": "Summary text",'));
    sections.push('  "chartTokens": ["CHART_TOKEN_1"],');
    sections.push(t(locale, '  "microTips": ["贴士1", "贴士2"]', '  "microTips": ["Tip 1", "Tip 2"]'));
    sections.push('}');
    sections.push('```');
  }
```

- [ ] **Step 7: 更新旧测试断言**

搜索测试中验证 homepage 字数约束包含 `"80-120"` 或 `"80-"` 的断言，改为 `"220-420"` 或 `"220-"`。

- [ ] **Step 8: 运行测试**

```bash
npx vitest run packages/agent-core/src/__tests__/routing/task-router.test.ts packages/agent-core/src/__tests__/prompts/task-builder.test.ts
```

Expected: ALL PASS

- [ ] **Step 9: Commit**

```bash
git add packages/agent-core/src/routing/task-router.ts packages/agent-core/src/prompts/task-builder.ts packages/agent-core/src/__tests__/routing/task-router.test.ts packages/agent-core/src/__tests__/prompts/task-builder.test.ts
git commit -m "feat(config): increase homepage summary limit and add actions output format"
```

---

## Module E: Fallback 配置

> **目标:** Fallback 响应新增空的 actions 字段，保持结构一致
> **前置:** Module B (parser 支持 actions)

---

### Task E1: 更新 fallback 配置

**任务卡**

```
┌──────────────────────────────────────────────────────┐
│ Task E1: 更新 fallback 配置                          │
├──────────────────────────────────────────────────────┤
│ 模块: E (Fallback)                                  │
│ 文件: homepage.json (当前 55 行)                     │
│       fallback-engine.ts (当前 162 行)               │
│ 前置依赖: B2 (runtime 适配 actions)                 │
│ 后续解锁: 无                                        │
├──────────────────────────────────────────────────────┤
│ 改动点:                                              │
│   1. homepage.json 每个 profile 新增 "actions": []   │
│   2. homepage.json summary 同步更新为新风格           │
│      (220-420字，口语化，多段)                        │
│   3. FallbackEntry 新增 actions? 字段               │
│   4. getFallback() 透传 actions                      │
│   5. GENERIC_FALLBACK 新增 actions: []               │
│                                                      │
│ 重要: fallback summary 必须同步为新风格，否则当      │
│ LLM 输出格式问题走 fallback 时，用户会看到风格突变   │
└──────────────────────────────────────────────────────┘
```

**Files:**
- Modify: `data/sandbox/fallbacks/homepage.json` (当前 55 行)
- Modify: `packages/agent-core/src/fallback/fallback-engine.ts` (当前 162 行)
- Test: `packages/agent-core/src/__tests__/fallback/fallback-engine.test.ts`

- [ ] **Step 1: 更新 homepage.json**

为所有 6 个 profile-locale 组合更新为新风格 summary 并添加 `"actions": []`。

**重要**: summary 必须使用新风格（220-420字，口语化，多段，第一人称），否则当 LLM 输出问题走 fallback 时用户会看到风格突变。

中文 profile-a 示例（参考设计文档 §2 样例风格，但 fallback 不含具体数值）：

```json
{
  "zh": {
    "profile-a": {
      "summary": "目前各项健康指标表现良好，整体状态不错。\n\n你的睡眠质量保持稳定，HRV 趋势也在正常范围内波动。日常活动量已达标，步数和运动时间都处于健康区间。\n\n建议继续保持规律的作息和适度运动。如果你想进一步优化，可以考虑今天多走 10 分钟，帮助巩固当前的恢复势头。\n\n你想怎么做？",
      "chartTokens": ["HRV_7DAYS", "SLEEP_7DAYS"],
      "microTips": [],
      "actions": []
    },
    "profile-b": {
      "summary": "最近几天你的身体数据有些波动，我注意到几个需要关注的点。\n\n睡眠时长偏短，HRV 也有下降的趋势。这通常意味着你的身体恢复还没完全到位，需要给副交感神经一点缓冲时间。\n\n建议今晚提前 30 分钟上床，并且把运动强度调低一档，改成散步或轻度拉伸。\n\n你想怎么做？",
      "chartTokens": ["SLEEP_7DAYS", "ACTIVITY_7DAYS"],
      "microTips": [],
      "actions": []
    },
    "profile-c": {
      "summary": "你的身体在发出几个需要重视的信号，我们一起来看看怎么调整。\n\n压力负荷持续偏高，睡眠也严重不足。这两个因素叠加，会让你的 HRV 持续走低，身体的"恢复电池"一直在亏电。\n\n我的建议：今天优先做两件事——第一，设定一个固定的就寝时间并坚持；第二，睡前 1 小时远离电子屏幕，做 10 分钟的深呼吸或冥想。\n\n你想怎么做？",
      "chartTokens": ["STRESS_LOAD_7DAYS", "SLEEP_7DAYS"],
      "microTips": [],
      "actions": []
    }
  },
  "en": {
    "profile-a": {
      "summary": "Your health metrics are looking good overall — nice work keeping things steady.\n\nSleep quality remains stable, and your HRV trend is within a healthy range. Daily activity is on track with both step count and exercise time in good zones.\n\nMy suggestion: keep up the routine. If you want to push further, consider adding a 10-minute walk today to solidify your recovery momentum.\n\nWhat would you like to do?",
      "chartTokens": ["HRV_7DAYS", "SLEEP_7DAYS"],
      "microTips": [],
      "actions": []
    },
    "profile-b": {
      "summary": "I've noticed some fluctuations in your recent data — let me walk you through what I see.\n\nSleep duration has been on the shorter side, and your HRV is trending downward. This usually means your body hasn't fully recovered yet and needs some buffer time.\n\nMy suggestion: try going to bed 30 minutes earlier tonight, and dial back your exercise intensity — swap in a light walk or gentle stretching instead.\n\nWhat would you like to do?",
      "chartTokens": ["SLEEP_7DAYS", "ACTIVITY_7DAYS"],
      "microTips": [],
      "actions": []
    },
    "profile-c": {
      "summary": "Your body is sending some signals we should pay attention to. Let's figure out the best adjustments together.\n\nStress levels remain elevated, and sleep is significantly lacking. When these two stack up, your HRV keeps dropping and your body's \"recovery battery\" stays depleted.\n\nMy top two recommendations: First, set a fixed bedtime and stick to it. Second, put away screens one hour before bed and do 10 minutes of deep breathing or meditation.\n\nWhat would you like to do?",
      "chartTokens": ["STRESS_LOAD_7DAYS", "SLEEP_7DAYS"],
      "microTips": [],
      "actions": []
    }
  }
}
```

- [ ] **Step 2: 更新 fallback-engine.ts**

修改 `FallbackEntry` 接口（第 5-9 行）：

```typescript
export interface FallbackEntry {
  summary: string;
  chartTokens: ChartTokenId[];
  microTips: string[];
  actions?: import('@health-advisor/shared').ActionOption[];
}
```

修改 `GENERIC_FALLBACK`（第 34-45 行），添加 `actions: []`：

```typescript
const GENERIC_FALLBACK: Record<Locale, FallbackEntry> = {
  zh: {
    summary: '健康数据正在分析中，请稍后再试。',
    chartTokens: [],
    microTips: ['如有疑问，请咨询专业医生'],
    actions: [],
  },
  en: {
    summary: 'Health data is being analyzed. Please try again later.',
    chartTokens: [],
    microTips: ['If you have concerns, please consult a healthcare professional'],
    actions: [],
  },
};
```

修改 `getFallback()` 方法（第 74-89 行），透传 actions：

```typescript
      return {
        summary: entry.summary,
        source: 'fallback',
        statusColor: 'warning',
        chartTokens: entry.chartTokens,
        microTips: entry.microTips,
        actions: entry.actions ?? [],
        meta: {
          taskType,
          pageContext: key.pageContext,
          finishReason: 'fallback',
        },
      };
```

- [ ] **Step 3: 更新测试**

确认 `fallback-engine.test.ts` 中 fallback 返回的对象包含 `actions` 字段。

```bash
npx vitest run packages/agent-core/src/__tests__/fallback/
```

Expected: ALL PASS

- [ ] **Step 4: Commit**

```bash
git add data/sandbox/fallbacks/homepage.json packages/agent-core/src/fallback/fallback-engine.ts packages/agent-core/src/__tests__/fallback/fallback-engine.test.ts
git commit -m "feat(fallback): add empty actions to homepage fallback responses"
```

---

## Module F: 前端适配

> **目标:** 前端渲染新格式 summary（支持换行），展示 actions 交互按钮
> **前置:** Module A (ActionOption 类型)

---

### Task F1: 创建 ActionOptions 组件

**任务卡**

```
┌──────────────────────────────────────────────────────┐
│ Task F1: 创建 ActionOptions 组件                     │
├──────────────────────────────────────────────────────┤
│ 模块: F (前端)                                      │
│ 文件: 新建 apps/web/src/components/homepage/         │
│       ActionOptions.tsx                              │
│ 前置依赖: A1 (ActionOption 类型)                    │
│ 可并行: 与 F2/F3 独立                               │
│ 后续解锁: F2                                        │
│ 设计文档参考: §3.5 交互选项模式                     │
├──────────────────────────────────────────────────────┤
│ 组件行为:                                            │
│   - 渲染 2-3 个 action 按钮                         │
│   - 每个按钮显示 emoji + title + description +       │
│     aiPromise                                       │
│   - 点击后显示"已记录"反馈                          │
│   - 空 actions 时返回 null                          │
│   - onSelect 回调将 action 传递给父组件              │
│                                                      │
│ UI 规格:                                             │
│   - 使用 @health-advisor/ui 的 Button 组件           │
│   - variant="outline"                                │
│   - 暗色主题，slate + emerald 配色                   │
└──────────────────────────────────────────────────────┘
```

**Files:**
- Create: `apps/web/src/components/homepage/ActionOptions.tsx`

- [ ] **Step 1: 创建组件**

```typescript
'use client';

import { Button } from '@health-advisor/ui';
import type { ActionOption } from '@health-advisor/shared';
import { useState } from 'react';

interface ActionOptionsProps {
  actions: ActionOption[];
  onSelect?: (action: ActionOption) => void;
}

export function ActionOptions({ actions, onSelect }: ActionOptionsProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (actions.length === 0) return null;

  return (
    <div className="space-y-2 pt-4 border-t border-slate-800/50">
      <p className="text-xs font-extrabold text-slate-400 uppercase tracking-widest flex items-center gap-2">
        <span className="w-1 h-3 bg-emerald-500 rounded-full" />
        行动方案
      </p>
      <div className="space-y-2">
        {actions.map((action) => (
          <Button
            key={action.id}
            variant="outline"
            aria-pressed={selectedId === action.id}
            onClick={() => {
              setSelectedId(action.id);
              onSelect?.(action);
            }}
            className="w-full text-left flex items-start gap-3 py-3 px-4
                       border-slate-700 hover:border-emerald-500/50 hover:bg-emerald-500/5
                       transition-colors group"
          >
            <span className="text-lg flex-shrink-0 mt-0.5">{action.emoji}</span>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-slate-200 group-hover:text-emerald-400 transition-colors">
                {action.title}
              </div>
              <div className="text-xs text-slate-400 mt-0.5">
                {action.description}
              </div>
              <div className="text-xs text-slate-500 mt-1 italic">
                {action.aiPromise}
              </div>
              {selectedId === action.id && (
                <div className="text-xs text-emerald-400 mt-2">
                  已记录
                </div>
              )}
            </div>
          </Button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/homepage/ActionOptions.tsx
git commit -m "feat(web): add ActionOptions component for homepage"
```

---

### Task F2: 改造 MorningBriefCard

**任务卡**

```
┌──────────────────────────────────────────────────────┐
│ Task F2: 改造 MorningBriefCard                       │
├──────────────────────────────────────────────────────┤
│ 模块: F (前端)                                      │
│ 文件: MorningBriefCard.tsx (当前 82 行)              │
│ 前置依赖: A1, F1                                    │
│ 后续解锁: F3                                        │
│ 设计文档参考: §4.5 summary 换行, §4.3 microTips     │
├──────────────────────────────────────────────────────┤
│ 改动点:                                              │
│   1. Props: 移除 microTips, 新增 actions +           │
│      onActionSelect                                  │
│   2. summary 渲染: <p> → <div className="whitespace │
│      -pre-line">                                     │
│   3. 移除 microTips 展示区域                         │
│   4. 引入 ActionOptions 组件                         │
│   5. loading skeleton 适配                           │
└──────────────────────────────────────────────────────┘
```

**Files:**
- Modify: `apps/web/src/components/homepage/MorningBriefCard.tsx` (当前 82 行)

- [ ] **Step 1: 重写 MorningBriefCard**

```typescript
'use client';

import { Card, statusColors } from '@health-advisor/ui';
import type { StatusColor } from '@health-advisor/ui';
import type { ActionOption } from '@health-advisor/shared';
import { m } from 'framer-motion';
import { ActionOptions } from './ActionOptions';

interface MorningBriefCardProps {
  status: StatusColor;
  title: string;
  summary: string;
  actions?: ActionOption[];
  onActionSelect?: (action: ActionOption) => void;
  isLoading?: boolean;
}

export function MorningBriefCard({
  status,
  title,
  summary,
  actions = [],
  onActionSelect,
  isLoading = false,
}: MorningBriefCardProps) {
  const statusColor = statusColors[status];

  if (isLoading) {
    return (
      <Card className="animate-pulse">
        <div className="h-6 w-32 bg-slate-700 rounded mb-4" />
        <div className="h-20 bg-slate-700 rounded mb-4" />
        <div className="flex gap-2">
          <div className="h-6 w-16 bg-slate-700 rounded-full" />
          <div className="h-6 w-16 bg-slate-700 rounded-full" />
        </div>
      </Card>
    );
  }

  return (
    <m.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <Card className="relative overflow-hidden border-l-4" style={{ borderLeftColor: statusColor }}>
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-slate-100">{title}</h3>
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: statusColor, boxShadow: `0 0 8px ${statusColor}` }}
            />
          </div>

          <div className="text-slate-300 leading-relaxed whitespace-pre-line">
            {summary}
          </div>

          <ActionOptions actions={actions} onSelect={onActionSelect} />
        </div>
      </Card>
    </m.div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/homepage/MorningBriefCard.tsx
git commit -m "feat(web): update MorningBriefCard with actions and line breaks"
```

---

### Task F3: 更新首页 page.tsx

**任务卡**

```
┌──────────────────────────────────────────────────────┐
│ Task F3: 更新首页 page.tsx                           │
├──────────────────────────────────────────────────────┤
│ 模块: F (前端)                                      │
│ 文件: apps/web/src/app/page.tsx (当前 143 行)        │
│ 前置依赖: F2                                        │
│ 后续解锁: 无                                        │
├──────────────────────────────────────────────────────┤
│ 改动点:                                              │
│   1. briefData 中 microTips → actions               │
│   2. 新增 onActionSelect 回调                       │
│   3. 从 @health-advisor/shared 引入 ActionOption     │
└──────────────────────────────────────────────────────┘
```

**Files:**
- Modify: `apps/web/src/app/page.tsx` (当前 143 行)

- [ ] **Step 1: 更新 briefData 和 imports**

在文件顶部 imports 中添加：

```typescript
import type { ActionOption } from '@health-advisor/shared';
```

修改第 37-42 行的 `briefData`：

```typescript
  const briefData = {
    status: mapApiStatusToUi(data?.statusColor, data?.meta.finishReason),
    title: t('realtimeBrief'),
    summary: data?.summary || (error ? t('briefNetworkError') : t('briefPreparing')),
    actions: data?.actions ?? [],
    onActionSelect: (action: ActionOption) => showToast(`${action.title}：已记录`, 'success'),
  };
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/page.tsx
git commit -m "feat(web): pass actions to MorningBriefCard from homepage"
```

---

## Module G: Eval 对齐

> **目标:** 更新所有测试和 eval 评分器以匹配新的回复风格
> **前置:** Module D (prompt 重写), Module F (前端)

---

### Task G1: 更新 eval length-scorer

**任务卡**

```
┌──────────────────────────────────────────────────────┐
│ Task G1: 更新 eval length-scorer                     │
├──────────────────────────────────────────────────────┤
│ 模块: G (Eval 对齐)                                 │
│ 文件: length-scorer.ts (当前 119 行)                │
│ 前置依赖: 无                                        │
│ 可并行: 与 G2, G3 并行                              │
│ 设计文档参考: §6 关键指标对比                       │
├──────────────────────────────────────────────────────┤
│ 改动: HOMEPAGE_DEFAULT_LENGTH_ZH 从 {80,120} →      │
│       {220,420}                                      │
│       HOMEPAGE_DEFAULT_LENGTH_EN 从 {50,100} →      │
│       {150,300}                                      │
└──────────────────────────────────────────────────────┘
```

**Files:**
- Modify: `packages/agent-core/src/evals/scorers/length-scorer.ts` (当前 119 行)

- [ ] **Step 1: 更新默认长度范围**

修改第 7 行和第 10 行：

```typescript
const HOMEPAGE_DEFAULT_LENGTH_ZH = { min: 220, max: 420 } as const;
```

```typescript
const HOMEPAGE_DEFAULT_LENGTH_EN = { min: 150, max: 300 } as const;
```

- [ ] **Step 2: 更新相关测试断言**

搜索 length-scorer 测试文件中验证旧默认值 (80-120) 的断言，更新为新值 (220-420)。

- [ ] **Step 3: Commit**

```bash
git add packages/agent-core/src/evals/scorers/length-scorer.ts
git commit -m "refactor(eval): update homepage default length range to 220-420"
```

---

### Task G2: 更新 buildMatchText 适配 actions + microTips 可选

**任务卡**

```
┌──────────────────────────────────────────────────────┐
│ Task G2: 更新 buildMatchText                         │
├──────────────────────────────────────────────────────┤
│ 模块: G (Eval 对齐)                                 │
│ 前置依赖: A1                                        │
│ 可并行: 与 G1, G3 并行                              │
├──────────────────────────────────────────────────────┤
│ 涉及 6 个 scorer 文件，每个都有 buildMatchText:      │
│   mention-scorer.ts (第 74 行)                       │
│   task-scorer.ts (第 63 行)                          │
│   safety-scorer.ts                                   │
│   evidence-scorer.ts                                 │
│   missing-data-scorer.ts                             │
│   memory-scorer.ts                                   │
│                                                      │
│ 统一改为:                                            │
│   summary + microTips? + actions(title+desc+promise) │
│                                                      │
│ 当前 mention-scorer 第 76 行:                        │
│   envelope.microTips.length > 0                      │
│ 改为:                                                │
│   envelope.microTips && envelope.microTips.length > 0│
└──────────────────────────────────────────────────────┘
```

**Files:**
- Modify: `packages/agent-core/src/evals/scorers/mention-scorer.ts` (当前 203 行)
- Modify: `packages/agent-core/src/evals/scorers/task-scorer.ts` (当前 325 行)
- Modify: `packages/agent-core/src/evals/scorers/safety-scorer.ts`
- Modify: `packages/agent-core/src/evals/scorers/evidence-scorer.ts`
- Modify: `packages/agent-core/src/evals/scorers/missing-data-scorer.ts`
- Modify: `packages/agent-core/src/evals/scorers/memory-scorer.ts`

- [ ] **Step 1: 更新所有 buildMatchText 函数**

每个文件中的 `buildMatchText` 统一改为以下模式：

```typescript
function buildMatchText(envelope: AgentResponseEnvelope): string {
  const parts = [envelope.summary];
  if (envelope.microTips && envelope.microTips.length > 0) {
    parts.push(envelope.microTips.join('\n'));
  }
  if (envelope.actions && envelope.actions.length > 0) {
    const actionTexts = envelope.actions.map((a) => `${a.title} ${a.description} ${a.aiPromise}`);
    parts.push(actionTexts.join('\n'));
  }
  return parts.join('\n');
}
```

需要修改的文件和位置：
- `mention-scorer.ts` 第 74-80 行
- `task-scorer.ts` 第 63-69 行
- `safety-scorer.ts` — 搜索 `buildMatchText` 函数
- `evidence-scorer.ts` — 搜索 `buildMatchText` 函数
- `missing-data-scorer.ts` — 搜索 `buildMatchText` 函数
- `memory-scorer.ts` — 搜索 `buildMatchText` 函数

- [ ] **Step 2: Commit**

```bash
git add packages/agent-core/src/evals/scorers/mention-scorer.ts packages/agent-core/src/evals/scorers/task-scorer.ts packages/agent-core/src/evals/scorers/safety-scorer.ts packages/agent-core/src/evals/scorers/evidence-scorer.ts packages/agent-core/src/evals/scorers/missing-data-scorer.ts packages/agent-core/src/evals/scorers/memory-scorer.ts
git commit -m "refactor(eval): include actions in match text and handle optional microTips"
```

---

### Task G3: 新增 action-scorer

**任务卡**

```
┌──────────────────────────────────────────────────────┐
│ Task G3: 新增 action-scorer                          │
├──────────────────────────────────────────────────────┤
│ 模块: G (Eval 对齐)                                 │
│ 前置依赖: A1                                        │
│ 可并行: 与 G1, G2 并行                              │
│ 设计文档参考: §3.5 交互选项模式                     │
├──────────────────────────────────────────────────────┤
│ 新增:                                                │
│   1. evals/types.ts 新增 actions expectation 类型    │
│   2. evals/case-schema.ts 新增 ActionsExpectation    │
│   3. evals/scorers/action-scorer.ts 新增评分器       │
│   4. evals/scorers/index.ts 注册到 DEFAULT_SCORERS   │
└──────────────────────────────────────────────────────┘
```

**Files:**
- Modify: `packages/agent-core/src/evals/types.ts` (当前 279 行)
- Modify: `packages/agent-core/src/evals/case-schema.ts` (当前 401 行)
- Create: `packages/agent-core/src/evals/scorers/action-scorer.ts`
- Modify: `packages/agent-core/src/evals/scorers/index.ts` (当前 48 行)
- Test: 对应测试文件

- [ ] **Step 1: 在 types.ts 中新增 actions expectation**

在 `AgentEvalExpectations` 接口中（第 87 行之后），添加：

```typescript
  actions?: {
    minCount?: number;
    maxCount?: number;
    requiredPatterns?: string[];
    forbiddenPatterns?: string[];
    requireAiPromise?: boolean;
  };
```

- [ ] **Step 2: 在 case-schema.ts 中新增 ActionsExpectationSchema**

在 `packages/agent-core/src/evals/case-schema.ts` 中，在 `MicroTipsExpectationSchema` 定义（第 201-207 行）之后，新增：

```typescript
const ActionsExpectationSchema = z.object({
  minCount: z.number().int().min(0).optional(),
  maxCount: z.number().int().min(0).optional(),
  requiredPatterns: z.array(z.string().min(1)).optional(),
  forbiddenPatterns: z.array(z.string().min(1)).optional(),
  requireAiPromise: z.boolean().optional(),
}).strict();
```

在 `AgentEvalExpectationsSchema`（第 356-367 行）中，在 `microTips` 字段之后，添加 `actions` 字段：

```typescript
const AgentEvalExpectationsSchema = z.object({
  protocol: ProtocolExpectationSchema.optional(),
  summary: SummaryExpectationSchema.optional(),
  status: StatusExpectationSchema.optional(),
  chartTokens: ChartTokensExpectationSchema.optional(),
  microTips: MicroTipsExpectationSchema.optional(),
  actions: ActionsExpectationSchema.optional(),    // 新增
  missingData: MissingDataExpectationSchema.optional(),
  evidence: EvidenceExpectationSchema.optional(),
  safety: SafetyExpectationSchema.optional(),
  memory: MemoryExpectationSchema.optional(),
  taskSpecific: TaskSpecificExpectationSchema.optional(),
}).strict();
```

> **为什么必须改 case-schema.ts**：`AgentEvalCaseSchema` 使用 `.strict()` 模式，未知字段会被 reject。如果 G4 的 eval case JSON 中包含 `actions` 期望但 schema 中没有定义，`parseAgentEvalCase()` 会直接抛出 ZodError，导致 eval runner 无法加载任何 homepage case。

- [ ] **Step 3: 创建 action-scorer.ts**

```typescript
import type { AgentResponseEnvelope } from '@health-advisor/shared';
import type { EvalCheckResult, EvalScorerInput } from '../types';

export const actionScorer = {
  id: 'action',

  score(input: EvalScorerInput): EvalCheckResult[] {
    const { evalCase, envelope } = input;
    const actionsExpect = evalCase.expectations.actions;
    const results: EvalCheckResult[] = [];

    if (!actionsExpect || !envelope) {
      return results;
    }

    const actions = envelope.actions ?? [];
    const actionText = actions.map((a) => `${a.title} ${a.description} ${a.aiPromise}`).join(' ');

    // 检查 1: 数量范围
    if (actionsExpect.minCount !== undefined || actionsExpect.maxCount !== undefined) {
      results.push(checkActionCount(evalCase.id, actions, actionsExpect));
    }

    // 检查 2: 每个字段非空
    results.push(checkActionFields(evalCase.id, actions));

    // 检查 3: requireAiPromise
    if (actionsExpect.requireAiPromise) {
      results.push(checkAiPromise(evalCase.id, actions));
    }

    // 检查 4: requiredPatterns
    if (actionsExpect.requiredPatterns && actionsExpect.requiredPatterns.length > 0) {
      results.push(checkRequiredPatterns(evalCase.id, actionText, actionsExpect.requiredPatterns));
    }

    // 检查 5: forbiddenPatterns
    if (actionsExpect.forbiddenPatterns && actionsExpect.forbiddenPatterns.length > 0) {
      results.push(checkForbiddenPatterns(evalCase.id, actionText, actionsExpect.forbiddenPatterns));
    }

    return results;
  },
} as const;

function checkActionCount(
  caseId: string,
  actions: NonNullable<AgentResponseEnvelope['actions']>,
  expect: { minCount?: number; maxCount?: number },
): EvalCheckResult {
  const count = actions.length;
  const tooFew = expect.minCount !== undefined && count < expect.minCount;
  const tooMany = expect.maxCount !== undefined && count > expect.maxCount;
  const passed = !tooFew && !tooMany;

  let message: string;
  if (tooFew) {
    message = `actions 数量不足: ${count}, 期望至少 ${expect.minCount}`;
  } else if (tooMany) {
    message = `actions 数量过多: ${count}, 期望最多 ${expect.maxCount}`;
  } else {
    message = `actions 数量合法: ${count}`;
  }

  return {
    checkId: `${caseId}:action:count`,
    severity: 'hard',
    passed,
    score: passed ? 1 : 0,
    maxScore: 1,
    message,
    details: { count, min: expect.minCount, max: expect.maxCount },
  };
}

function checkActionFields(
  caseId: string,
  actions: NonNullable<AgentResponseEnvelope['actions']>,
): EvalCheckResult {
  const incomplete = actions.filter(
    (a) => !a.id || !a.emoji || !a.title || !a.description || !a.aiPromise,
  );
  const passed = incomplete.length === 0;
  return {
    checkId: `${caseId}:action:fields`,
    severity: 'hard',
    passed,
    score: passed ? 1 : 0,
    maxScore: 1,
    message: passed
      ? '所有 actions 字段完整'
      : `${incomplete.length} 个 action 字段不完整`,
    details: passed ? undefined : { incompleteIndices: incomplete.map((a) => a.id) },
  };
}

function checkAiPromise(
  caseId: string,
  actions: NonNullable<AgentResponseEnvelope['actions']>,
): EvalCheckResult {
  const empty = actions.filter((a) => !a.aiPromise || a.aiPromise.trim().length === 0);
  const passed = empty.length === 0;
  return {
    checkId: `${caseId}:action:ai_promise`,
    severity: 'hard',
    passed,
    score: passed ? 1 : 0,
    maxScore: 1,
    message: passed
      ? '所有 actions 均包含 aiPromise'
      : `${empty.length} 个 action 缺少 aiPromise`,
  };
}

function checkRequiredPatterns(
  caseId: string,
  text: string,
  patterns: string[],
): EvalCheckResult {
  const unmatched = patterns.filter((p) => !new RegExp(p).test(text));
  const passed = unmatched.length === 0;
  return {
    checkId: `${caseId}:action:required_patterns`,
    severity: 'hard',
    passed,
    score: passed ? 1 : 0,
    maxScore: 1,
    message: passed
      ? 'actions requiredPatterns 全部匹配'
      : `actions requiredPatterns 未匹配: ${unmatched.join(', ')}`,
  };
}

function checkForbiddenPatterns(
  caseId: string,
  text: string,
  patterns: string[],
): EvalCheckResult {
  const matched = patterns.filter((p) => new RegExp(p).test(text));
  const passed = matched.length === 0;
  return {
    checkId: `${caseId}:action:forbidden_patterns`,
    severity: 'hard',
    passed,
    score: passed ? 1 : 0,
    maxScore: 1,
    message: passed
      ? '无 actions forbiddenPatterns 匹配'
      : `actions forbiddenPatterns 命中: ${matched.join(', ')}`,
  };
}
```

- [ ] **Step 4: 注册到 DEFAULT_SCORERS**

在 `packages/agent-core/src/evals/scorers/index.ts` 中：

添加 export：
```typescript
export { actionScorer } from './action-scorer';
```

添加到 `DEFAULT_SCORERS` 数组（在 `taskScorer` 之后）：
```typescript
export const DEFAULT_SCORERS: EvalScorer[] = [
  protocolScorer,
  lengthScorer,
  statusScorer,
  tokenScorer,
  mentionScorer,
  evidenceScorer,
  safetyScorer,
  missingDataScorer,
  memoryScorer,
  taskScorer,
  languageMatchScorer,
  actionScorer,    // 新增
];
```

- [ ] **Step 5: Commit**

```bash
git add packages/agent-core/src/evals/types.ts packages/agent-core/src/evals/case-schema.ts packages/agent-core/src/evals/scorers/action-scorer.ts packages/agent-core/src/evals/scorers/index.ts
git commit -m "feat(eval): add action scorer and actions expectation schema"
```

---

### Task G4: 更新 eval test cases

**任务卡**

```
┌──────────────────────────────────────────────────────┐
│ Task G4: 更新 eval test cases                        │
├──────────────────────────────────────────────────────┤
│ 模块: G (Eval 对齐)                                 │
│ 前置依赖: G1, G2, G3                                │
│ 后续解锁: G5                                        │
├──────────────────────────────────────────────────────┤
│ 涉及 21 个 JSON 文件:                                │
│   evals/cases/core/homepage/*.json (16个)            │
│   evals/cases/smoke/homepage*.json (5个)             │
│                                                      │
│ 每个 JSON 文件需要更新:                              │
│   1. summary.length 从 {min:80,max:120} →           │
│      {min:220,max:420}                               │
│   2. 移除 forbiddenPatterns 中数值禁止规则           │
│   3. 新增 actions 期望 (LLM case)                   │
│   4. modelFixture.content 的 fake JSON 需要适配新    │
│      格式（添加 actions 字段）                       │
└──────────────────────────────────────────────────────┘
```

**Files:**
- Modify: `packages/agent-core/evals/cases/core/homepage/*.json` (16 个文件)
- Modify: `packages/agent-core/evals/cases/smoke/homepage*.json` (5 个文件)

- [ ] **Step 1: 批量更新 expectations**

对每个 homepage eval case JSON 进行以下更新：

1. **长度期望**：`summary.length` 从 `{ min: 80, max: 120 }` 改为 `{ min: 220, max: 420 }`

2. **移除 interpretation-only 约束**：删除 `forbiddenPatterns` 中关于 `\d+\s*ms`、`\d+%\s*血氧`、`\d+\s*bpm` 的规则

3. **新增用户姓名提及期望**（如果 case 的 profile 是 profile-a）：
   ```json
   "mustMention": ["巅峰"]
   ```

4. **新增 actions 期望**（LLM 产出的 case 必填；fallback/低数据 case 允许 0）：
   ```json
   "actions": {
     "minCount": 2,
     "maxCount": 3,
     "requireAiPromise": true,
     "forbiddenPatterns": ["实时监控", "调整监测逻辑", "开启.*模式", "准时提醒", "无干扰模式"]
   }
   ```

5. **更新 modelFixture.content**（关键！）：
   - **必须将 fake JSON 中的 summary 扩写到 220-420 字**，使用新风格（第一人称、多段、含具体数值）
   - **必须添加 `"actions"` 字段**（2-3 个完整 action 对象，或空数组给低数据 case）
   - **移除或清空 `"microTips"` 字段**
   - 如果不更新 summary 长度，length-scorer 会因新默认值 (220-420) 判定失败

   以 `homepage-normal-health.json` 为例，modelFixture.content 应更新为类似：
   ```json
   {
     "source": "llm",
     "statusColor": "good",
     "summary": "巅峰，今天的状态看起来不错！各项指标都在健康范围内。\n\n你昨晚睡得很好，HRV 也保持在稳定水平，说明你的身体恢复到位了。日常活动量已经达标，步数和运动时间都处于健康区间。\n\n建议继续保持当前的节奏。如果你想进一步优化，可以考虑今天再加一组 10 分钟的轻度拉伸，帮助身体保持弹性。\n\n你想怎么做？",
     "chartTokens": [],
     "microTips": [],
     "actions": [
       {"id": "opt-1", "emoji": "🚶", "title": "轻松散步", "description": "出去走 10 分钟，帮身体保持活跃", "aiPromise": "我会记录你的选择并用于本次建议上下文"},
       {"id": "opt-2", "emoji": "🧘", "title": "轻度拉伸", "description": "做一组 10 分钟的拉伸，帮助身体恢复", "aiPromise": "我会记录你的选择并用于本次建议上下文"}
     ]
   }
   ```

- [ ] **Step 2: Commit**

```bash
git add packages/agent-core/evals/cases/
git commit -m "refactor(eval): update homepage cases for new response style"
```

---

### Task G5: 全量测试验证

**任务卡**

```
┌──────────────────────────────────────────────────────┐
│ Task G5: 全量测试验证                                │
├──────────────────────────────────────────────────────┤
│ 模块: G (Eval 对齐)                                 │
│ 前置依赖: 全部 Module 完成                          │
├──────────────────────────────────────────────────────┤
│ 目标: 所有测试通过，web 构建成功                     │
└──────────────────────────────────────────────────────┘
```

**Files:** 无新文件

- [ ] **Step 1: 运行 shared 包测试**

```bash
npx vitest run packages/shared/
```

Expected: ALL PASS

- [ ] **Step 2: 运行 agent-core 包测试**

```bash
npx vitest run packages/agent-core/
```

Expected: ALL PASS

- [ ] **Step 3: 运行 agent-api 测试**

```bash
npx vitest run apps/agent-api/
```

Expected: ALL PASS

- [ ] **Step 4: 运行 web 构建**

```bash
cd apps/web && npx next build
```

Expected: BUILD SUCCESS

- [ ] **Step 5: 修复并 Commit（如有问题）**

```bash
git add -A
git commit -m "fix: resolve test failures after homepage style calibration"
```

---

## 推荐执行顺序

```
Round 1 (可并行):   A1, C1, C2, D1, D2
Round 2 (顺序):     B1 → B2
Round 3 (顺序):     D3 → D4
Round 4 (顺序):     E1
Round 5 (顺序):     F1 → F2 → F3
Round 6 (可并行):   G1, G2, G3
Round 7 (顺序):     G4 → G5
```

总计 20 个任务，7 个执行轮次。

---

## 自审记录 (2026-05-18)

### 第一轮自审

发现 2 个高严重度问题和 3 个中等严重度问题，均已修复：

| 问题 | 严重度 | 状态 | 修复方式 |
|------|--------|------|----------|
| Fallback summary 仍是旧风格 (80-120字正式风格)，LLM reject 时用户看到风格突变 | 高 | 已修复 | Task E1 Step 1 中 fallback summary 全部更新为新风格 (220-420字，口语化，多段) |
| G4 未明确要求更新 modelFixture.content 中的 summary 长度，导致 length-scorer 全部失败 | 高 | 已修复 | Task G4 Step 1 第 5 点增加详细说明和完整示例 |
| 开场白使用姓名缺少负面约束 | 中 | 已修复 | Task D2 template.md 红线第 7 条新增"禁止省略姓名" |
| safety-cleaner actions 清洗缺少缺失数据幻觉清洗 | 低 | 接受 | actions 文本通常较短，且由 LLM 生成（不是用户输入），缺失数据幻觉风险低 |
| C1 renderEvidence 与 renderTaskContextPacket 联动说明不够明确 | 低 | 已修复 | C1 Step 3b 中已明确 renderTaskContextPacket 也要移除 isHomepage 参数 |

### 第二轮自审 — 设计文档全量覆盖检查

逐节对照设计文档 §1-§6，确认所有设计决策和需求均有对应 Task 覆盖。发现 1 个高严重度遗漏：

| 问题 | 严重度 | 状态 | 修复方式 |
|------|--------|------|----------|
| G3 任务卡列出 `case-schema.ts 新增 ActionsExpectation`，但实际步骤中缺少对应 Step，导致 `AgentEvalExpectationsSchema`（`.strict()` 模式）无法通过含 `actions` 字段的 JSON case | 高 | 已修复 | Task G3 新增 Step 2，在 `case-schema.ts` 中添加 `ActionsExpectationSchema` 并注册到 `AgentEvalExpectationsSchema` |

确认以下文件不需要改动（设计文档 §5.2 明确排除或与本次改动无关）：
- `language-match-scorer.ts`, `context-packet-builder.ts`, `token-validator.ts`, `protocol-scorer.ts`
- `homepage-rules.ts`（生成 `suggestedMicroTips`，microTips 可选后该字段被忽略，无需改动）

---

## Self-Review Checklist

### 1. Spec Coverage

| 需求 | 对应 Task |
|------|-----------|
| 语气从正式改为温暖有个性 | D1, D3 |
| 回复从单段改为多段结构 | D2 |
| HRV/血氧/静息心率数值透明 | C1, C2 |
| 字数限制放宽 | D4 |
| 新增 actions 交互选项 | A1, B1, B2, D4, G3 (含 case-schema) |
| 前端渲染新格式 | F1, F2, F3 |
| 测试和 eval 对齐 | G1, G2, G3, G4, G5 |
| microTips 移除 | A1, B1, B2, F2 |
| 开场白用用户姓名打招呼 | D2 (prompt 中定义) |

### 2. Placeholder Scan

- 无 "TBD"、"TODO"、"implement later" 等占位符
- 所有代码步骤都包含完整代码
- 所有测试步骤都包含具体断言

### 3. Type Consistency

- `ActionOption` 在 shared/types 定义，在 response-parser 解析，在 MorningBriefCard 使用 — 类型一致
- `microTips` 从 `string[]` 改为 `string[] | undefined`，所有消费方使用 `?? []` 或可选链 — 一致
- `MAX_ACTIONS = 3` 在 limits.ts 定义，在 response-parser 使用 — 一致
- `maxSummaryLength = 420` 在 task-router 定义，在 task-builder 使用 — 一致
