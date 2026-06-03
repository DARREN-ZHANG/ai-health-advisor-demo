# Advisor Chat Web Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 Advisor Chat 只在 planner 显式声明 `webSearchNeeds` 时调用 Tavily Web Search，并把外部搜索结果作为受控 evidence 注入 solver prompt。

**Architecture:** `AnalysisPlan` 增加可选 `webSearchNeeds`，runtime 在 planner 成功后、solver 调用前执行项目内部 `webSearchTool`，并追加 `## Web Search Evidence`。`@langchain/tavily` 只存在于工具实现和 API registry 注入层，solver、ReAct loop 和前端不直接访问网络能力。

**Tech Stack:** TypeScript, Zod, Vitest, pnpm, `@langchain/tavily`, existing `ToolDefinition<TInput, TOutput>`, existing Advisor Chat planner/runtime tests.

---

## Context Summary

设计来源：`docs/superpowers/specs/2026-06-03-advisor-chat-web-search-design.md`。

已确认产品决策：

- `WEB_SEARCH_ENABLED=false` 时不创建 WebSearch Tool，且不要求 `TAVILY_API_KEY`。
- `WEB_SEARCH_ENABLED=true` 时必须提供 `TAVILY_API_KEY`。
- 当 planner 输出 `required=true` 的 `webSearchNeeds`，但 runtime 未注入 `webSearchTool`、搜索失败或搜索空结果时，runtime 直接返回安全说明，不调用 solver。
- 当 planner 输出 `required=false` 的 `webSearchNeeds`，但搜索失败或搜索空结果时，runtime 继续调用 solver，并在 prompt 中注入 `状态: unavailable`。
- 第一版不把 `webSearchTool` 加入 `reactTools`，不做关键词启发式联网，不实现 citation UI。

现有上下文：

- `packages/agent-core/src/planner/analysis-plan.ts` 定义 `AnalysisPlanSchema`，当前已有 `knowledgeNeeds` 和 `productNeeds`，还没有 `webSearchNeeds`。
- `data/sandbox/prompts/advisor-plan.md` 是 planner system prompt，当前 schema 示例没有 WebSearch 字段。
- `packages/agent-core/src/runtime/agent-runtime.ts` 在 planner 成功后执行本地 evidence resolution/ReAct，然后通过 `appendPlanContextToPrompt()` 追加分析计划，再调用 solver。
- `packages/agent-core/src/tools/tool-types.ts` 定义 `ToolDefinition<TInput, TOutput>` 和 `ToolResult<T>`，现有工具以 Zod schema + `execute(input, ctx)` 形式实现。
- `apps/agent-api/src/config/env.ts` 使用 Zod 解析配置，已有 `envBool` 布尔解析器。
- `apps/agent-api/src/runtime/registry.ts` 创建 planner、ReAct tools、sync reviewer 和 runtime deps。
- 官方 LangChain JS 文档说明 `TavilySearch` 来自 `@langchain/tavily`，实例化支持 `maxResults`、`topic`、`searchDepth`、`timeRange`、`includeDomains`、`excludeDomains`，调用方式为 `tool.invoke({ query, ... })`。

## File Structure

创建：

- `packages/agent-core/src/runtime/web-search-evidence.ts` - 负责执行 `webSearchNeeds`、生成 unavailable 状态、格式化 `## Web Search Evidence` prompt 区块。
- `packages/agent-core/src/runtime/__tests__/web-search-evidence.test.ts` - 覆盖 WebSearch evidence helper 的成功、未配置、失败和 prompt 格式。
- `packages/agent-core/src/tools/web-search.ts` - Tavily-backed WebSearch Tool factory、输入输出 schema、稳定输出转换。
- `packages/agent-core/src/tools/__tests__/web-search.test.ts` - 覆盖 Tavily 返回转换、空结果和异常。
- `packages/agent-core/src/planner/__tests__/advisor-plan-prompt.test.ts` - 读取 `data/sandbox/prompts/advisor-plan.md`，断言 WebSearch 触发边界存在。

修改：

- `packages/agent-core/package.json` - 增加 `@langchain/tavily` 依赖。
- `packages/agent-core/src/planner/analysis-plan.ts` - 增加 `WebSearchNeedSchema`、相关枚举和 `webSearchNeeds`。
- `packages/agent-core/src/planner/__tests__/analysis-plan.test.ts` - 增加 `webSearchNeeds` schema 测试。
- `packages/agent-core/src/planner/__tests__/advisor-plan-builder.test.ts` - 增加 planner 能解析 `webSearchNeeds` 的测试。
- `data/sandbox/prompts/advisor-plan.md` - 更新 JSON schema 示例和 WebSearch 输出规则。
- `packages/agent-core/src/tools/index.ts` - 导出 WebSearch tool 类型和 factory。
- `packages/agent-core/src/index.ts` - 导出 WebSearch 类型、factory 和 runtime helper 类型。
- `packages/agent-core/src/runtime/agent-runtime.ts` - 扩展 deps/observer，集成 WebSearch evidence 执行和 prompt 注入。
- `packages/agent-core/src/runtime/__tests__/advisor-chat-runtime.test.ts` - 覆盖 required/optional 搜索路径和不触发搜索回归。
- `apps/agent-api/src/config/env.ts` - 增加 Tavily/WebSearch 配置和校验规则。
- `apps/agent-api/src/__tests__/config/env.test.ts` - 覆盖 WebSearch 配置校验。
- `apps/agent-api/src/runtime/registry.ts` - 按配置创建 `webSearchTool`，不加入 `reactTools`。
- `apps/agent-api/src/__tests__/runtime/registry.test.ts` - 覆盖 registry 注入和 ReAct 白名单排除。
- `pnpm-lock.yaml` - 由 `pnpm add @langchain/tavily --filter @health-advisor/agent-core` 更新。

## 模块 1：Planner 搜索需求契约

**目标：** 让 planner 输出结构化、可验证的 `webSearchNeeds`，并把搜索触发边界写进 prompt 和测试。

**依赖：** 无。

**涉及文件：**

- 修改：`packages/agent-core/src/planner/analysis-plan.ts`
- 修改：`packages/agent-core/src/planner/__tests__/analysis-plan.test.ts`
- 修改：`packages/agent-core/src/planner/__tests__/advisor-plan-builder.test.ts`
- 创建：`packages/agent-core/src/planner/__tests__/advisor-plan-prompt.test.ts`
- 修改：`data/sandbox/prompts/advisor-plan.md`

**产出：**

- [ ] `AnalysisPlanSchema` 接受合法 `webSearchNeeds` 并拒绝非法查询。
- [ ] planner prompt 明确禁止关键词启发式搜索，要求本地健康数据和本地知识优先。
- [ ] planner builder 能解析包含 `webSearchNeeds` 的 plan。

### 任务 1.1：扩展 AnalysisPlan Schema

**所属模块：** 模块 1 - Planner 搜索需求契约

**目标：** 在 `AnalysisPlan` 中加入可选 `webSearchNeeds`，并导出 WebSearch need 相关类型。

**前置条件：**

- 无。

**涉及文件：**

- 修改：`packages/agent-core/src/planner/analysis-plan.ts`
- 修改：`packages/agent-core/src/planner/__tests__/analysis-plan.test.ts`

**上下文：**

`AnalysisPlanSchema` 当前是一个单一 Zod object。`knowledgeNeeds` 和 `productNeeds` 已经是 optional 字段，`webSearchNeeds` 应使用相同风格加入 object 内部。`webSearchNeeds` 不能替代 `evidenceNeeds`，它只描述外部网页搜索需求。

**实现步骤：**

- [ ] **步骤 1：写 schema 失败测试**

在 `packages/agent-core/src/planner/__tests__/analysis-plan.test.ts` 中追加以下测试，并把 `WebSearchNeedSchema` 导入到现有 import：

```ts
import { AnalysisPlanSchema, MetricType, TimeScope, ActionIntent, SafetyConstraint, WebSearchNeedSchema } from '../analysis-plan';
```

追加测试：

```ts
describe('webSearchNeeds', () => {
  it('接受合法 webSearchNeeds', () => {
    const result = AnalysisPlanSchema.safeParse(createValidPlan({
      evidenceNeeds: [],
      webSearchNeeds: [
        {
          query: 'latest caffeine sleep research 2026',
          reason: '用户询问最新公开研究，现有本地健康数据无法覆盖',
          required: true,
          topic: 'general',
          timeRange: 'year',
          includeDomains: ['nih.gov'],
          excludeDomains: ['example.com'],
        },
      ],
    }));

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.webSearchNeeds).toHaveLength(1);
      expect(result.data.webSearchNeeds?.[0]?.query).toBe('latest caffeine sleep research 2026');
    }
  });

  it('缺少 webSearchNeeds 时仍保持向后兼容', () => {
    const result = AnalysisPlanSchema.safeParse(createValidPlan());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.webSearchNeeds).toBeUndefined();
    }
  });

  it('拒绝过短 query', () => {
    const result = WebSearchNeedSchema.safeParse({
      query: 'ai',
      reason: 'query 过短',
      required: true,
    });

    expect(result.success).toBe(false);
  });

  it('拒绝非法 topic 和 timeRange', () => {
    const result = AnalysisPlanSchema.safeParse(createValidPlan({
      webSearchNeeds: [
        {
          query: 'recent sleep guideline',
          reason: '用户询问外部指南',
          required: false,
          topic: 'finance',
          timeRange: 'hour',
        },
      ],
    }));

    expect(result.success).toBe(false);
  });
});
```

- [ ] **步骤 2：运行测试确认失败**

```bash
pnpm --filter @health-advisor/agent-core test -- src/planner/__tests__/analysis-plan.test.ts
```

预期结果：测试失败，失败信息包含 `WebSearchNeedSchema` 未导出或 `webSearchNeeds` 不在 schema 中。

- [ ] **步骤 3：实现 schema 和类型导出**

在 `packages/agent-core/src/planner/analysis-plan.ts` 中加入：

```ts
export const WebSearchTopic = z.enum(['general', 'news']);
export const WebSearchTimeRange = z.enum(['day', 'week', 'month', 'year']);

export const WebSearchNeedSchema = z.object({
  query: z.string().min(3),
  reason: z.string().min(1),
  required: z.boolean(),
  topic: WebSearchTopic.optional(),
  timeRange: WebSearchTimeRange.optional(),
  includeDomains: z.array(z.string().min(1)).optional(),
  excludeDomains: z.array(z.string().min(1)).optional(),
});
```

在 `AnalysisPlanSchema` 的 `productNeeds` 后、`safetyConstraints` 前加入：

```ts
  webSearchNeeds: z.array(WebSearchNeedSchema).optional(),
```

在文件底部导出类型：

```ts
export type WebSearchNeed = z.infer<typeof WebSearchNeedSchema>;
export type WebSearchTopicEnum = z.infer<typeof WebSearchTopic>;
export type WebSearchTimeRangeEnum = z.infer<typeof WebSearchTimeRange>;
```

- [ ] **步骤 4：运行测试确认通过**

```bash
pnpm --filter @health-advisor/agent-core test -- src/planner/__tests__/analysis-plan.test.ts
```

预期结果：`AnalysisPlanSchema` 测试全部通过。

**验证方式：**

```bash
pnpm --filter @health-advisor/agent-core test -- src/planner/__tests__/analysis-plan.test.ts
pnpm --filter @health-advisor/agent-core typecheck
```

预期结果：两个命令均通过。

**提交说明：**

```bash
git add packages/agent-core/src/planner/analysis-plan.ts packages/agent-core/src/planner/__tests__/analysis-plan.test.ts
git commit -m "feat(agent-core): add advisor web search plan schema"
```

### 任务 1.2：更新 Planner Prompt 和 Planner 解析测试

**所属模块：** 模块 1 - Planner 搜索需求契约

**目标：** 让 planner prompt 清楚表达 WebSearch 触发边界，并验证 planner builder 能解析包含 `webSearchNeeds` 的 JSON plan。

**前置条件：**

- 任务 1.1 已完成。

**涉及文件：**

- 修改：`data/sandbox/prompts/advisor-plan.md`
- 修改：`packages/agent-core/src/planner/__tests__/advisor-plan-builder.test.ts`
- 创建：`packages/agent-core/src/planner/__tests__/advisor-plan-prompt.test.ts`

**上下文：**

planner prompt 当前只描述本地健康数据 evidence。WebSearch 只能由 planner 显式输出 `webSearchNeeds` 触发，不能用关键词启发式触发。用户只询问本地睡眠、HRV、压力、活动、SpO2、静息心率时，不输出 `webSearchNeeds`。

**实现步骤：**

- [ ] **步骤 1：写 planner builder 失败测试**

在 `packages/agent-core/src/planner/__tests__/advisor-plan-builder.test.ts` 的 `createValidPlanJson()` 返回对象中不需要默认加入 `webSearchNeeds`。在 `describe('buildAnalysisPlan', ...)` 内追加测试：

```ts
  it('解析包含 webSearchNeeds 的合法 plan', async () => {
    const planWithSearch = {
      ...createValidPlanJson(),
      evidenceNeeds: [],
      webSearchNeeds: [
        {
          query: 'recent caffeine sleep research',
          reason: '用户询问最近公开研究，现有本地数据无法回答外部研究进展',
          required: true,
          topic: 'general',
          timeRange: 'year',
        },
      ],
    };
    const agent = createMockAgent(JSON.stringify(planWithSearch));
    const result = await buildAnalysisPlan(createDeps(agent), createValidInput());

    expect(result.success).toBe(true);
    expect(result.plan?.webSearchNeeds).toHaveLength(1);
    expect(result.plan?.webSearchNeeds?.[0]?.required).toBe(true);
  });
```

- [ ] **步骤 2：创建 planner prompt 边界测试**

创建 `packages/agent-core/src/planner/__tests__/advisor-plan-prompt.test.ts`：

```ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const promptPath = resolve(process.cwd(), '../../data/sandbox/prompts/advisor-plan.md');

describe('advisor planner prompt web search rules', () => {
  it('documents the webSearchNeeds schema and explicit trigger boundary', () => {
    const prompt = readFileSync(promptPath, 'utf-8');

    expect(prompt).toContain('"webSearchNeeds"');
    expect(prompt).toContain('"query"');
    expect(prompt).toContain('"required"');
    expect(prompt).toContain('只有当用户问题需要外部最新信息、公开研究、指南或非本地知识时才输出 webSearchNeeds');
    expect(prompt).toContain('用户只询问自己的睡眠、HRV、压力、活动、SpO2、静息心率等本地数据时，不输出 webSearchNeeds');
    expect(prompt).toContain('本地编译知识或产品 facts 能回答时，优先使用本地知识，不搜索');
    expect(prompt).toContain('不要用关键词启发式触发搜索');
  });

  it('documents safety limits for diagnosis and medication questions', () => {
    const prompt = readFileSync(promptPath, 'utf-8');

    expect(prompt).toContain('对诊断、用药、治疗问题');
    expect(prompt).toContain('只能用于一般性背景说明');
    expect(prompt).toContain('不能支持个性化医疗指令');
  });
});
```

- [ ] **步骤 3：运行测试确认失败**

```bash
pnpm --filter @health-advisor/agent-core test -- src/planner/__tests__/advisor-plan-builder.test.ts src/planner/__tests__/advisor-plan-prompt.test.ts
```

预期结果：prompt 测试失败，因为 `advisor-plan.md` 尚未包含 WebSearch schema 和规则。

- [ ] **步骤 4：更新 planner prompt**

在 `data/sandbox/prompts/advisor-plan.md` 的 JSON schema 示例中，在 `productNeeds` 后、`safetyConstraints` 前加入：

```json
  "webSearchNeeds": [
    {
      "query": "外部搜索查询",
      "reason": "为什么必须搜索外部资料",
      "required": true,
      "topic": "general",
      "timeRange": "year",
      "includeDomains": ["nih.gov"],
      "excludeDomains": ["example.com"]
    }
  ],
```

在规则区追加以下规则文本：

```md
8. WebSearch 只能由 planner 显式声明：
   - 只有当用户问题需要外部最新信息、公开研究、指南或非本地知识时才输出 webSearchNeeds
   - 用户只询问自己的睡眠、HRV、压力、活动、SpO2、静息心率等本地数据时，不输出 webSearchNeeds
   - 本地编译知识或产品 facts 能回答时，优先使用本地知识，不搜索
   - 不要用关键词启发式触发搜索
9. 对诊断、用药、治疗问题，WebSearch 只能用于一般性背景说明，不能支持个性化医疗指令。
10. webSearchNeeds.required=true 表示缺少外部搜索结果时不应生成最终实质回答；required=false 表示外部资料只是补充背景。
```

- [ ] **步骤 5：运行测试确认通过**

```bash
pnpm --filter @health-advisor/agent-core test -- src/planner/__tests__/advisor-plan-builder.test.ts src/planner/__tests__/advisor-plan-prompt.test.ts
```

预期结果：planner builder 和 prompt 测试均通过。

**验证方式：**

```bash
pnpm --filter @health-advisor/agent-core test -- src/planner/__tests__/advisor-plan-builder.test.ts src/planner/__tests__/advisor-plan-prompt.test.ts
pnpm --filter @health-advisor/agent-core typecheck
```

预期结果：两个命令均通过。

**提交说明：**

```bash
git add data/sandbox/prompts/advisor-plan.md packages/agent-core/src/planner/__tests__/advisor-plan-builder.test.ts packages/agent-core/src/planner/__tests__/advisor-plan-prompt.test.ts
git commit -m "feat(agent-core): document advisor web search planning rules"
```

## 模块 2：WebSearch Tool 稳定输出层

**目标：** 新增 Tavily-backed WebSearch Tool，并把 Tavily 原始返回转换为项目内部稳定结构。

**依赖：** 模块 1 的 schema 命名可以并行开发；runtime 集成前必须完成本模块。

**涉及文件：**

- 修改：`packages/agent-core/package.json`
- 修改：`pnpm-lock.yaml`
- 创建：`packages/agent-core/src/tools/web-search.ts`
- 创建：`packages/agent-core/src/tools/__tests__/web-search.test.ts`
- 修改：`packages/agent-core/src/tools/index.ts`
- 修改：`packages/agent-core/src/index.ts`

**产出：**

- [ ] WebSearch input/output schema 可独立校验。
- [ ] `createWebSearchTool()` 能使用 Tavily `invoke()` 返回稳定 `WebSearchOutput`。
- [ ] 空结果返回 `success: true` 和空数组。
- [ ] Tavily 异常返回 `success: false` 且错误码为 `web_search_error`。

### 任务 2.1：安装 Tavily 依赖并定义 Tool Contract

**所属模块：** 模块 2 - WebSearch Tool 稳定输出层

**目标：** 安装 `@langchain/tavily`，新增 WebSearch schema 和类型契约。

**前置条件：**

- 无。

**涉及文件：**

- 修改：`packages/agent-core/package.json`
- 修改：`pnpm-lock.yaml`
- 创建：`packages/agent-core/src/tools/web-search.ts`
- 修改：`packages/agent-core/src/tools/index.ts`
- 修改：`packages/agent-core/src/index.ts`

**上下文：**

官方 LangChain JS 文档显示安装包为 `@langchain/tavily`，实例化类为 `TavilySearch`，调用方式为 `tool.invoke({ query })`。本任务只提交 schema/type contract，不提交 WebSearch 执行函数；真实 Tavily 调用在任务 2.2 中实现。

**实现步骤：**

- [ ] **步骤 1：安装依赖**

```bash
pnpm add @langchain/tavily --filter @health-advisor/agent-core
```

预期结果：`packages/agent-core/package.json` 增加 `@langchain/tavily`，`pnpm-lock.yaml` 更新。

- [ ] **步骤 2：创建 WebSearch contract**

创建 `packages/agent-core/src/tools/web-search.ts`：

```ts
import { z } from 'zod';

export const WebSearchInputSchema = z.object({
  query: z.string().min(3),
  maxResults: z.number().int().positive().max(10).optional(),
  topic: z.enum(['general', 'news']).optional(),
  searchDepth: z.enum(['basic', 'advanced']).optional(),
  timeRange: z.enum(['day', 'week', 'month', 'year']).optional(),
  includeDomains: z.array(z.string().min(1)).optional(),
  excludeDomains: z.array(z.string().min(1)).optional(),
});

export type WebSearchInput = z.infer<typeof WebSearchInputSchema>;

export const WebSearchResultSchema = z.object({
  title: z.string(),
  url: z.string(),
  content: z.string(),
  score: z.number().optional(),
  publishedDate: z.string().optional(),
});

export const WebSearchOutputSchema = z.object({
  results: z.array(WebSearchResultSchema),
});

export type WebSearchResult = z.infer<typeof WebSearchResultSchema>;
export type WebSearchOutput = z.infer<typeof WebSearchOutputSchema>;

export interface TavilySearchInvoker {
  invoke(input: Record<string, unknown>): Promise<unknown>;
}

export interface CreateWebSearchToolOptions {
  maxResults: number;
  timeoutMs: number;
  tavilySearch?: TavilySearchInvoker;
}
```

- [ ] **步骤 4：导出 contract**

在 `packages/agent-core/src/tools/index.ts` 追加：

```ts
export {
  WebSearchInputSchema,
  WebSearchOutputSchema,
} from './web-search';
export type {
  WebSearchInput,
  WebSearchOutput,
  WebSearchResult,
  TavilySearchInvoker,
  CreateWebSearchToolOptions,
} from './web-search';
```

在 `packages/agent-core/src/index.ts` 的 Tools 区域追加同样导出：

```ts
export {
  WebSearchInputSchema,
  WebSearchOutputSchema,
} from './tools/web-search';
export type {
  WebSearchInput,
  WebSearchOutput,
  WebSearchResult,
  TavilySearchInvoker,
  CreateWebSearchToolOptions,
} from './tools/web-search';
```

**验证方式：**

```bash
pnpm --filter @health-advisor/agent-core typecheck
```

预期结果：typecheck 通过。

**提交说明：**

```bash
git add packages/agent-core/package.json pnpm-lock.yaml packages/agent-core/src/tools/web-search.ts packages/agent-core/src/tools/index.ts packages/agent-core/src/index.ts
git commit -m "feat(agent-core): add web search tool contract"
```

### 任务 2.2：实现 Tavily 输出转换和 Tool 单元测试

**所属模块：** 模块 2 - WebSearch Tool 稳定输出层

**目标：** 把 Tavily `invoke()` 返回转换为 `{ results }`，并实现异常路径。

**前置条件：**

- 任务 2.1 已完成。

**涉及文件：**

- 修改：`packages/agent-core/src/tools/web-search.ts`
- 创建：`packages/agent-core/src/tools/__tests__/web-search.test.ts`

**上下文：**

Tavily 返回可能包含 `results` 数组。项目只保留 `title`、`url`、`content`、`score`、`publishedDate`。`raw_content`、`answer`、`images` 不进入输出。`evidenceIds` 必须使用 `web:<url>`。

**实现步骤：**

- [ ] **步骤 1：写失败测试**

创建 `packages/agent-core/src/tools/__tests__/web-search.test.ts`：

```ts
import { describe, expect, it, vi } from 'vitest';
import type { ToolExecutionContext } from '../tool-types';
import { createWebSearchTool, WebSearchInputSchema, WebSearchOutputSchema } from '../web-search';

const ctx = {} as ToolExecutionContext;

describe('webSearchTool', () => {
  it('validates input and output schemas', () => {
    expect(WebSearchInputSchema.safeParse({
      query: 'latest sleep guideline',
      maxResults: 3,
      topic: 'general',
      searchDepth: 'basic',
      timeRange: 'year',
      includeDomains: ['nih.gov'],
      excludeDomains: ['example.com'],
    }).success).toBe(true);

    expect(WebSearchInputSchema.safeParse({ query: 'ai' }).success).toBe(false);
    expect(WebSearchOutputSchema.safeParse({ results: [{ title: 'A', url: 'https://a.test', content: 'snippet' }] }).success).toBe(true);
  });

  it('converts Tavily results into stable output and web evidence ids', async () => {
    const invoke = vi.fn(async () => ({
      query: 'latest sleep guideline',
      answer: 'ignored answer',
      images: ['ignored image'],
      results: [
        {
          title: 'Sleep guideline',
          url: 'https://example.com/sleep',
          content: 'Public guideline snippet',
          raw_content: 'ignored raw content',
          score: 0.92,
          publishedDate: '2026-05-01',
        },
      ],
    }));
    const tool = createWebSearchTool({
      maxResults: 3,
      timeoutMs: 10000,
      tavilySearch: { invoke },
    });

    const result = await tool.execute({
      query: 'latest sleep guideline',
      topic: 'general',
      searchDepth: 'basic',
      timeRange: 'year',
      includeDomains: ['nih.gov'],
      excludeDomains: ['example.com'],
    }, ctx);

    expect(result.success).toBe(true);
    expect(invoke).toHaveBeenCalledWith({
      query: 'latest sleep guideline',
      maxResults: 3,
      topic: 'general',
      searchDepth: 'basic',
      timeRange: 'year',
      includeDomains: ['nih.gov'],
      excludeDomains: ['example.com'],
    });
    if (result.success) {
      expect(result.data.results).toEqual([
        {
          title: 'Sleep guideline',
          url: 'https://example.com/sleep',
          content: 'Public guideline snippet',
          score: 0.92,
          publishedDate: '2026-05-01',
        },
      ]);
      expect(result.evidenceIds).toEqual(['web:https://example.com/sleep']);
    }
  });

  it('returns an empty success result when Tavily returns no results', async () => {
    const tool = createWebSearchTool({
      maxResults: 3,
      timeoutMs: 10000,
      tavilySearch: { invoke: vi.fn(async () => ({ results: [] })) },
    });

    const result = await tool.execute({ query: 'recent caffeine sleep research' }, ctx);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.results).toEqual([]);
      expect(result.evidenceIds).toEqual([]);
    }
  });

  it('returns web_search_error when Tavily throws', async () => {
    const tool = createWebSearchTool({
      maxResults: 3,
      timeoutMs: 10000,
      tavilySearch: { invoke: vi.fn(async () => { throw new Error('Tavily unavailable'); }) },
    });

    const result = await tool.execute({ query: 'recent caffeine sleep research' }, ctx);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('web_search_error');
      expect(result.error.message).toContain('Tavily unavailable');
    }
  });
});
```

- [ ] **步骤 2：运行测试确认失败**

```bash
pnpm --filter @health-advisor/agent-core test -- src/tools/__tests__/web-search.test.ts
```

预期结果：测试失败，因为 `createWebSearchTool` 尚未导出，且 Tavily 输出转换逻辑尚未实现。

- [ ] **步骤 3：实现 Tavily 调用和稳定转换**

在 `packages/agent-core/src/tools/web-search.ts` 顶部加入 imports：

```ts
import { TavilySearch } from '@langchain/tavily';
import type { ToolDefinition, ToolExecutionContext, ToolResult } from './tool-types';
```

在同一文件中加入 `createWebSearchTool()` 和 helper：

```ts
export function createWebSearchTool(
  options: CreateWebSearchToolOptions,
): ToolDefinition<WebSearchInput, WebSearchOutput> {
  const tavilySearch = options.tavilySearch ?? new TavilySearch({
    maxResults: options.maxResults,
    topic: 'general',
    includeAnswer: false,
    includeRawContent: false,
    includeImages: false,
  });

  return {
    name: 'webSearch',
    description: 'Search public web pages through Tavily and return URL-backed snippets.',
    inputSchema: WebSearchInputSchema,
    outputSchema: WebSearchOutputSchema,
    async execute(input, _ctx: ToolExecutionContext): Promise<ToolResult<WebSearchOutput>> {
      return executeWebSearch(input, tavilySearch, options);
    },
  };
}
```

加入执行和转换逻辑：

```ts
async function executeWebSearch(
  input: WebSearchInput,
  tavilySearch: TavilySearchInvoker,
  options: CreateWebSearchToolOptions,
): Promise<ToolResult<WebSearchOutput>> {
  try {
    const raw = await tavilySearch.invoke({
      query: input.query,
      maxResults: input.maxResults ?? options.maxResults,
      topic: input.topic ?? 'general',
      ...(input.searchDepth ? { searchDepth: input.searchDepth } : {}),
      ...(input.timeRange ? { timeRange: input.timeRange } : {}),
      ...(input.includeDomains ? { includeDomains: input.includeDomains } : {}),
      ...(input.excludeDomains ? { excludeDomains: input.excludeDomains } : {}),
    });

    const results = normalizeTavilyResults(raw);

    return {
      success: true,
      data: { results },
      evidenceIds: results.map((result) => `web:${result.url}`),
    };
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'web_search_error',
        message: error instanceof Error ? error.message : 'Tavily search failed',
      },
    };
  }
}

function normalizeTavilyResults(raw: unknown): WebSearchResult[] {
  if (!isRecord(raw) || !Array.isArray(raw.results)) return [];

  return raw.results.flatMap((item): WebSearchResult[] => {
    if (!isRecord(item)) return [];
    if (typeof item.title !== 'string') return [];
    if (typeof item.url !== 'string') return [];
    if (typeof item.content !== 'string') return [];

    return [{
      title: item.title,
      url: item.url,
      content: item.content,
      ...(typeof item.score === 'number' ? { score: item.score } : {}),
      ...(typeof item.publishedDate === 'string' ? { publishedDate: item.publishedDate } : {}),
    }];
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
```

在 `packages/agent-core/src/tools/index.ts` 的 WebSearch export 中加入 `createWebSearchTool`：

```ts
export {
  createWebSearchTool,
  WebSearchInputSchema,
  WebSearchOutputSchema,
} from './web-search';
```

在 `packages/agent-core/src/index.ts` 的 WebSearch export 中加入 `createWebSearchTool`：

```ts
export {
  createWebSearchTool,
  WebSearchInputSchema,
  WebSearchOutputSchema,
} from './tools/web-search';
```

- [ ] **步骤 4：运行测试确认通过**

```bash
pnpm --filter @health-advisor/agent-core test -- src/tools/__tests__/web-search.test.ts
```

预期结果：WebSearch tool 测试全部通过。

**验证方式：**

```bash
pnpm --filter @health-advisor/agent-core test -- src/tools/__tests__/web-search.test.ts
pnpm --filter @health-advisor/agent-core typecheck
```

预期结果：两个命令均通过。

**提交说明：**

```bash
git add packages/agent-core/src/tools/web-search.ts packages/agent-core/src/tools/__tests__/web-search.test.ts packages/agent-core/src/tools/index.ts packages/agent-core/src/index.ts
git commit -m "feat(agent-core): normalize tavily web search results"
```

## 模块 3：Advisor Chat Runtime 编排与 Prompt 注入

**目标：** 在 planner 成功后执行 WebSearch，按 required 规则决定是否调用 solver，并把结果注入 solver prompt。

**依赖：** 任务 1.1、任务 2.2。

**涉及文件：**

- 创建：`packages/agent-core/src/runtime/web-search-evidence.ts`
- 创建：`packages/agent-core/src/runtime/__tests__/web-search-evidence.test.ts`
- 修改：`packages/agent-core/src/runtime/agent-runtime.ts`
- 修改：`packages/agent-core/src/runtime/__tests__/advisor-chat-runtime.test.ts`
- 修改：`packages/agent-core/src/index.ts`

**产出：**

- [ ] WebSearch evidence helper 能格式化 success 和 unavailable prompt 区块。
- [ ] `required=true` 且搜索未启用、失败或空结果时不调用 solver。
- [ ] `required=false` 且搜索失败或空结果时继续调用 solver。
- [ ] `webSearchTool` 不存在时不会静默生成缺外部证据的 required 回答。

### 任务 3.1：新增 WebSearch Evidence Helper

**所属模块：** 模块 3 - Advisor Chat Runtime 编排与 Prompt 注入

**目标：** 用独立 helper 管理 WebSearch 执行结果、unavailable 状态和 prompt 格式。

**前置条件：**

- 任务 1.1 已完成。
- 任务 2.2 已完成。

**涉及文件：**

- 创建：`packages/agent-core/src/runtime/web-search-evidence.ts`
- 创建：`packages/agent-core/src/runtime/__tests__/web-search-evidence.test.ts`
- 修改：`packages/agent-core/src/index.ts`

**上下文：**

`appendPlanContextToPrompt()` 仍负责本地 plan/evidence。WebSearch helper 只负责外部搜索 evidence，并且必须在 prompt 中写明外部搜索只作为背景资料，用户本地健康数据优先。

**实现步骤：**

- [ ] **步骤 1：写 helper 失败测试**

创建 `packages/agent-core/src/runtime/__tests__/web-search-evidence.test.ts`：

```ts
import { describe, expect, it, vi } from 'vitest';
import type { AnalysisPlan } from '../../planner/analysis-plan';
import type { WebSearchOutput } from '../../tools/web-search';
import type { ToolDefinition, ToolExecutionContext, ToolResult } from '../../tools/tool-types';
import {
  appendWebSearchEvidenceToPrompt,
  collectWebSearchEvidence,
  hasRequiredUnavailableWebSearch,
} from '../web-search-evidence';

function makePlan(overrides: Partial<AnalysisPlan> = {}): AnalysisPlan {
  return {
    planId: 'plan-web',
    taskType: 'advisor_chat',
    userIntent: { action: 'general', riskLevel: 'general', needsClarification: false },
    evidenceNeeds: [],
    webSearchNeeds: [
      {
        query: 'recent caffeine sleep research',
        reason: '用户询问最近公开研究',
        required: true,
        topic: 'general',
        timeRange: 'year',
      },
    ],
    safetyConstraints: ['no_diagnosis', 'no_medication_advice'],
    answerShape: {
      includeMissingDataDisclosure: false,
      includeChartTokens: false,
      maxSummaryLength: 300,
      tone: 'concise',
    },
    ...overrides,
  };
}

function makeTool(result: ToolResult<WebSearchOutput>): ToolDefinition<unknown, unknown> {
  return {
    name: 'webSearch',
    description: 'test web search',
    inputSchema: { parse: (value: unknown) => value } as never,
    outputSchema: { parse: (value: unknown) => value } as never,
    execute: vi.fn(async () => result),
  };
}

const ctx = {} as ToolExecutionContext;

describe('web search evidence helper', () => {
  it('collects success evidence and renders URL-backed prompt rows', async () => {
    const tool = makeTool({
      success: true,
      data: {
        results: [
          {
            title: 'Caffeine and sleep',
            url: 'https://example.com/caffeine',
            content: 'A public research snippet.',
            score: 0.9,
            publishedDate: '2026-05-01',
          },
        ],
      },
      evidenceIds: ['web:https://example.com/caffeine'],
    });

    const evidence = await collectWebSearchEvidence(makePlan(), { webSearchTool: tool, maxResults: 3 }, ctx);
    const prompt = appendWebSearchEvidenceToPrompt('base prompt', evidence);

    expect(evidence).toHaveLength(1);
    expect(evidence[0]?.status).toBe('success');
    expect(hasRequiredUnavailableWebSearch(evidence)).toBe(false);
    expect(prompt).toContain('## Web Search Evidence');
    expect(prompt).toContain('外部搜索只作为背景资料');
    expect(prompt).toContain('[web:https://example.com/caffeine] Caffeine and sleep');
    expect(prompt).toContain('URL: https://example.com/caffeine');
    expect(prompt).toContain('摘要: A public research snippet.');
    expect(prompt).toContain('Published: 2026-05-01');
  });

  it('marks required needs as unavailable when tool is not injected', async () => {
    const evidence = await collectWebSearchEvidence(makePlan(), { webSearchTool: undefined, maxResults: 3 }, ctx);

    expect(evidence).toHaveLength(1);
    expect(evidence[0]?.status).toBe('unavailable');
    expect(evidence[0]?.required).toBe(true);
    expect(hasRequiredUnavailableWebSearch(evidence)).toBe(true);
  });

  it('marks empty required results as unavailable', async () => {
    const tool = makeTool({ success: true, data: { results: [] }, evidenceIds: [] });

    const evidence = await collectWebSearchEvidence(makePlan(), { webSearchTool: tool, maxResults: 3 }, ctx);

    expect(evidence[0]?.status).toBe('unavailable');
    expect(evidence[0]?.message).toBe('外部搜索未返回可用结果。回答时不得声称已查到外部资料。');
    expect(hasRequiredUnavailableWebSearch(evidence)).toBe(true);
  });

  it('renders optional unavailable status without marking required unavailable', async () => {
    const plan = makePlan({
      webSearchNeeds: [
        {
          query: 'sleep news',
          reason: '外部背景资料',
          required: false,
        },
      ],
    });
    const tool = makeTool({
      success: false,
      error: { code: 'web_search_error', message: 'Tavily unavailable' },
    });

    const evidence = await collectWebSearchEvidence(plan, { webSearchTool: tool, maxResults: 3 }, ctx);
    const prompt = appendWebSearchEvidenceToPrompt('base prompt', evidence);

    expect(hasRequiredUnavailableWebSearch(evidence)).toBe(false);
    expect(prompt).toContain('状态: unavailable');
    expect(prompt).toContain('说明: 外部搜索未返回可用结果。回答时不得声称已查到外部资料。');
  });
});
```

- [ ] **步骤 2：运行测试确认失败**

```bash
pnpm --filter @health-advisor/agent-core test -- src/runtime/__tests__/web-search-evidence.test.ts
```

预期结果：测试失败，因为 helper 文件尚未存在。

- [ ] **步骤 3：实现 helper**

创建 `packages/agent-core/src/runtime/web-search-evidence.ts`：

```ts
import type { AnalysisPlan, WebSearchNeed } from '../planner/analysis-plan';
import type { ToolDefinition, ToolExecutionContext } from '../tools/tool-types';
import type { WebSearchInput, WebSearchOutput, WebSearchResult } from '../tools/web-search';

export type WebSearchEvidenceStatus = 'success' | 'unavailable';

export interface WebSearchEvidence {
  need: WebSearchNeed;
  query: string;
  reason: string;
  required: boolean;
  status: WebSearchEvidenceStatus;
  results: WebSearchResult[];
  evidenceIds: string[];
  message?: string;
}

export interface CollectWebSearchEvidenceDeps {
  webSearchTool?: ToolDefinition<WebSearchInput, WebSearchOutput> | ToolDefinition<unknown, unknown>;
  maxResults: number;
}

const UNAVAILABLE_MESSAGE = '外部搜索未返回可用结果。回答时不得声称已查到外部资料。';
const NOT_CONFIGURED_MESSAGE = 'WebSearch 未启用或未配置 Tavily provider。回答时不得声称已查到外部资料。';

export async function collectWebSearchEvidence(
  plan: AnalysisPlan,
  deps: CollectWebSearchEvidenceDeps,
  ctx: ToolExecutionContext,
): Promise<WebSearchEvidence[]> {
  const needs = plan.webSearchNeeds ?? [];
  const evidence: WebSearchEvidence[] = [];

  for (const need of needs) {
    if (!deps.webSearchTool) {
      evidence.push(toUnavailableEvidence(need, NOT_CONFIGURED_MESSAGE));
      continue;
    }

    const result = await deps.webSearchTool.execute({
      query: need.query,
      maxResults: deps.maxResults,
      topic: need.topic,
      timeRange: need.timeRange,
      includeDomains: need.includeDomains,
      excludeDomains: need.excludeDomains,
    }, ctx);

    if (!result.success) {
      evidence.push(toUnavailableEvidence(need, UNAVAILABLE_MESSAGE));
      continue;
    }

    if (result.data.results.length === 0) {
      evidence.push(toUnavailableEvidence(need, UNAVAILABLE_MESSAGE));
      continue;
    }

    evidence.push({
      need,
      query: need.query,
      reason: need.reason,
      required: need.required,
      status: 'success',
      results: result.data.results,
      evidenceIds: result.evidenceIds,
    });
  }

  return evidence;
}

export function appendWebSearchEvidenceToPrompt(
  taskPrompt: string,
  evidence: WebSearchEvidence[],
): string {
  if (evidence.length === 0) return taskPrompt;

  const sections = [
    taskPrompt,
    '',
    '## Web Search Evidence',
    '',
    '外部搜索只作为背景资料。用户本地健康数据优先级高于网页信息。使用搜索信息时必须保守表达，并保留来源 URL。',
  ];

  for (const item of evidence) {
    sections.push('');
    sections.push(`搜索需求: ${item.reason}`);
    sections.push(`查询: ${item.query}`);
    sections.push(`状态: ${item.status}`);

    if (item.status === 'unavailable') {
      sections.push(`说明: ${item.message ?? UNAVAILABLE_MESSAGE}`);
      continue;
    }

    for (const result of item.results) {
      sections.push('');
      sections.push(`- [web:${result.url}] ${result.title}`);
      sections.push(`  URL: ${result.url}`);
      sections.push(`  摘要: ${result.content}`);
      if (result.publishedDate) {
        sections.push(`  Published: ${result.publishedDate}`);
      }
    }
  }

  return sections.join('\n');
}

export function hasRequiredUnavailableWebSearch(evidence: WebSearchEvidence[]): boolean {
  return evidence.some((item) => item.required && item.status === 'unavailable');
}

function toUnavailableEvidence(need: WebSearchNeed, message: string): WebSearchEvidence {
  return {
    need,
    query: need.query,
    reason: need.reason,
    required: need.required,
    status: 'unavailable',
    results: [],
    evidenceIds: [],
    message,
  };
}
```

- [ ] **步骤 4：导出 helper 类型**

在 `packages/agent-core/src/index.ts` 的 Runtime 区域追加：

```ts
export {
  appendWebSearchEvidenceToPrompt,
  collectWebSearchEvidence,
  hasRequiredUnavailableWebSearch,
} from './runtime/web-search-evidence';
export type {
  CollectWebSearchEvidenceDeps,
  WebSearchEvidence,
  WebSearchEvidenceStatus,
} from './runtime/web-search-evidence';
```

- [ ] **步骤 5：运行测试确认通过**

```bash
pnpm --filter @health-advisor/agent-core test -- src/runtime/__tests__/web-search-evidence.test.ts
```

预期结果：helper 测试全部通过。

**验证方式：**

```bash
pnpm --filter @health-advisor/agent-core test -- src/runtime/__tests__/web-search-evidence.test.ts
pnpm --filter @health-advisor/agent-core typecheck
```

预期结果：两个命令均通过。

**提交说明：**

```bash
git add packages/agent-core/src/runtime/web-search-evidence.ts packages/agent-core/src/runtime/__tests__/web-search-evidence.test.ts packages/agent-core/src/index.ts
git commit -m "feat(agent-core): build advisor web search evidence prompt"
```

### 任务 3.2：集成 Advisor Chat Runtime 执行路径

**所属模块：** 模块 3 - Advisor Chat Runtime 编排与 Prompt 注入

**目标：** 在 Advisor Chat runtime 中调用 WebSearch helper，实现 required/optional 路径，并用测试证明 solver 是否被调用。

**前置条件：**

- 任务 3.1 已完成。

**涉及文件：**

- 修改：`packages/agent-core/src/runtime/agent-runtime.ts`
- 修改：`packages/agent-core/src/runtime/__tests__/advisor-chat-runtime.test.ts`

**上下文：**

`executeAgent()` 当前在 `appendPlanContextToPrompt()` 后调用 solver。WebSearch 必须在 solver 调用前完成。`required=true` 且 unavailable 时，不调用 `deps.agent.invoke()`，不读取 `fallbackEngine`，返回安全说明。`meta.finishReason` 使用 `complete`。

**实现步骤：**

- [ ] **步骤 1：写 runtime 失败测试**

在 `packages/agent-core/src/runtime/__tests__/advisor-chat-runtime.test.ts` 中导入 WebSearch 类型：

```ts
import type { ToolDefinition, ToolResult } from '../../tools/tool-types';
import type { WebSearchInput, WebSearchOutput } from '../../tools/web-search';
```

修改 `makeDeps()` 签名，允许传入 WebSearch deps：

```ts
function makeDeps(
  agentOverrides: Partial<HealthAgent> = {},
  planBuilder?: PlanBuilderDeps,
  webSearch?: {
    tool?: ToolDefinition<WebSearchInput, WebSearchOutput>;
    maxResults?: number;
  },
): AgentRuntimeDeps {
```

在返回对象中加入：

```ts
    webSearchTool: webSearch?.tool,
    webSearchConfig: webSearch ? { enabled: Boolean(webSearch.tool), maxResults: webSearch.maxResults ?? 3 } : undefined,
```

在测试 helper 区加入：

```ts
function makeWebSearchTool(
  result: ToolResult<WebSearchOutput>,
): ToolDefinition<WebSearchInput, WebSearchOutput> {
  return {
    name: 'webSearch',
    description: 'test web search',
    inputSchema: { parse: (value: WebSearchInput) => value } as never,
    outputSchema: { parse: (value: WebSearchOutput) => value } as never,
    execute: vi.fn(async () => result),
  };
}
```

追加测试：

```ts
  describe('Advisor Chat WebSearch runtime', () => {
    it('webSearchNeeds 成功时调用 tool 并把结果注入 solver prompt', async () => {
      const plan = makeAnalysisPlan({
        evidenceNeeds: [],
        webSearchNeeds: [
          {
            query: 'recent caffeine sleep research',
            reason: '用户询问最近公开研究',
            required: true,
            topic: 'general',
            timeRange: 'year',
          },
        ],
      });
      const { deps: planBuilder } = makePlanBuilderDeps({ success: true, plan });
      const tool = makeWebSearchTool({
        success: true,
        data: {
          results: [
            {
              title: 'Caffeine and sleep',
              url: 'https://example.com/caffeine',
              content: 'Research snippet.',
              publishedDate: '2026-05-01',
            },
          ],
        },
        evidenceIds: ['web:https://example.com/caffeine'],
      });
      const solverInvoke = vi.fn(async () => ({
        content: JSON.stringify({ summary: '已结合外部资料保守说明。', chartTokens: [], microTips: [] }),
      }));
      const onPromptBuilt = vi.fn();
      const onWebSearchEvidence = vi.fn();

      const result = await executeAgent(
        makeAdvisorChatRequest({ userMessage: '最近有什么关于咖啡因和睡眠的研究？' }),
        makeDeps({ invoke: solverInvoke }, planBuilder, { tool, maxResults: 3 }),
        undefined,
        { onPromptBuilt, onWebSearchEvidence },
      );

      expect(result.summary).toBe('已结合外部资料保守说明。');
      expect(tool.execute).toHaveBeenCalledTimes(1);
      expect(solverInvoke).toHaveBeenCalledTimes(1);
      expect(onWebSearchEvidence).toHaveBeenCalledTimes(1);
      const promptInput = onPromptBuilt.mock.calls[0]![0];
      expect(promptInput.taskPrompt).toContain('## Web Search Evidence');
      expect(promptInput.taskPrompt).toContain('[web:https://example.com/caffeine] Caffeine and sleep');
    });

    it('required=true 且 tool 未注入时返回安全说明并且不调用 solver', async () => {
      const plan = makeAnalysisPlan({
        evidenceNeeds: [],
        webSearchNeeds: [
          {
            query: 'latest public sleep guideline',
            reason: '用户要求最新外部指南',
            required: true,
          },
        ],
      });
      const { deps: planBuilder } = makePlanBuilderDeps({ success: true, plan });
      const solverInvoke = vi.fn(async () => ({
        content: JSON.stringify({ summary: '不应该被调用', chartTokens: [], microTips: [] }),
      }));
      const onWebSearchEvidence = vi.fn();

      const result = await executeAgent(
        makeAdvisorChatRequest({ userMessage: '最新睡眠指南怎么说？' }),
        makeDeps({ invoke: solverInvoke }, planBuilder),
        undefined,
        { onWebSearchEvidence },
      );

      expect(result.summary).toContain('当前无法获取外部资料');
      expect(result.source).toBe('planner');
      expect(result.meta.finishReason).toBe('complete');
      expect(solverInvoke).not.toHaveBeenCalled();
      expect(onWebSearchEvidence).toHaveBeenCalledTimes(1);
    });

    it('required=true 且搜索空结果时不调用 solver', async () => {
      const plan = makeAnalysisPlan({
        evidenceNeeds: [],
        webSearchNeeds: [{ query: 'latest public sleep guideline', reason: '用户要求最新外部指南', required: true }],
      });
      const { deps: planBuilder } = makePlanBuilderDeps({ success: true, plan });
      const tool = makeWebSearchTool({ success: true, data: { results: [] }, evidenceIds: [] });
      const solverInvoke = vi.fn(async () => ({
        content: JSON.stringify({ summary: '不应该被调用', chartTokens: [], microTips: [] }),
      }));

      const result = await executeAgent(
        makeAdvisorChatRequest({ userMessage: '最新睡眠指南怎么说？' }),
        makeDeps({ invoke: solverInvoke }, planBuilder, { tool }),
      );

      expect(result.summary).toContain('当前无法获取外部资料');
      expect(solverInvoke).not.toHaveBeenCalled();
    });

    it('required=false 且搜索失败时继续调用 solver 并注入 unavailable', async () => {
      const plan = makeAnalysisPlan({
        evidenceNeeds: [],
        webSearchNeeds: [{ query: 'recent sleep news', reason: '补充外部背景资料', required: false }],
      });
      const { deps: planBuilder } = makePlanBuilderDeps({ success: true, plan });
      const tool = makeWebSearchTool({ success: false, error: { code: 'web_search_error', message: 'Tavily unavailable' } });
      const solverInvoke = vi.fn(async () => ({
        content: JSON.stringify({ summary: '基于本地上下文回答。', chartTokens: [], microTips: [] }),
      }));
      const onPromptBuilt = vi.fn();

      const result = await executeAgent(
        makeAdvisorChatRequest({ userMessage: '最近睡眠新闻有哪些？' }),
        makeDeps({ invoke: solverInvoke }, planBuilder, { tool }),
        undefined,
        { onPromptBuilt },
      );

      expect(result.summary).toBe('基于本地上下文回答。');
      expect(solverInvoke).toHaveBeenCalledTimes(1);
      const promptInput = onPromptBuilt.mock.calls[0]![0];
      expect(promptInput.taskPrompt).toContain('状态: unavailable');
      expect(promptInput.taskPrompt).toContain('不得声称已查到外部资料');
    });

    it('plan 没有 webSearchNeeds 时不调用 webSearchTool', async () => {
      const plan = makeAnalysisPlan({ webSearchNeeds: undefined });
      const { deps: planBuilder } = makePlanBuilderDeps({ success: true, plan });
      const tool = makeWebSearchTool({ success: true, data: { results: [] }, evidenceIds: [] });

      await executeAgent(
        makeAdvisorChatRequest({ userMessage: '我最近的睡眠怎么样？' }),
        makeDeps({}, planBuilder, { tool }),
      );

      expect(tool.execute).not.toHaveBeenCalled();
    });
  });
```

- [ ] **步骤 2：运行测试确认失败**

```bash
pnpm --filter @health-advisor/agent-core test -- src/runtime/__tests__/advisor-chat-runtime.test.ts
```

预期结果：测试失败，因为 `AgentRuntimeDeps` 和 observer 尚未支持 WebSearch。

- [ ] **步骤 3：扩展 runtime deps 和 observer**

在 `packages/agent-core/src/runtime/agent-runtime.ts` import：

```ts
import type { ToolDefinition } from '../tools/tool-types';
import type { WebSearchInput, WebSearchOutput } from '../tools/web-search';
import {
  appendWebSearchEvidenceToPrompt,
  collectWebSearchEvidence,
  hasRequiredUnavailableWebSearch,
} from './web-search-evidence';
import type { WebSearchEvidence } from './web-search-evidence';
```

如果文件里已有 `ToolDefinition` 或 `ReActStep` import，合并 import，避免重复。

在 `AgentRuntimeDeps` 中加入：

```ts
  webSearchTool?: ToolDefinition<WebSearchInput, WebSearchOutput>;
  webSearchConfig?: {
    enabled: boolean;
    maxResults: number;
  };
```

在 `AgentRuntimeObserver` 中加入：

```ts
  onWebSearchEvidence?(evidence: WebSearchEvidence[]): void;
```

- [ ] **步骤 4：在 solver 调用前收集 WebSearch evidence**

在 `executeAgent()` 中 `let resolvedEvidence` 附近加入：

```ts
    let webSearchEvidence: WebSearchEvidence[] = [];
```

在本地 evidence resolution/ReAct 之后、构建 prompts 之前加入：

```ts
    if (analysisPlan && analysisPlan.webSearchNeeds && analysisPlan.webSearchNeeds.length > 0) {
      webSearchEvidence = await collectWebSearchEvidence(
        analysisPlan,
        {
          webSearchTool: deps.webSearchTool,
          maxResults: deps.webSearchConfig?.maxResults ?? 3,
        },
        { packet, context },
      );
      tryNotify(() => observer?.onWebSearchEvidence?.(webSearchEvidence));

      if (hasRequiredUnavailableWebSearch(webSearchEvidence)) {
        return toRequiredWebSearchUnavailableResponse(request);
      }
    }
```

在 `appendPlanContextToPrompt()` 后加入：

```ts
      taskPrompt = appendWebSearchEvidenceToPrompt(taskPrompt, webSearchEvidence);
```

- [ ] **步骤 5：添加 required unavailable 安全响应**

在 `toClarificationResponse()` 前加入：

```ts
function toRequiredWebSearchUnavailableResponse(
  request: AgentRequest,
): AgentResponseEnvelope {
  return {
    summary: '当前无法获取外部资料，因此我不能可靠回答这个需要最新外部信息的问题。你可以稍后重试，或改问基于本地健康数据的问题。',
    source: 'planner',
    statusColor: 'warning',
    chartTokens: [],
    microTips: [],
    meta: {
      taskType: request.taskType,
      pageContext: request.pageContext,
      finishReason: 'complete',
      sessionId: request.sessionId,
    },
  };
}
```

- [ ] **步骤 6：运行测试确认通过**

```bash
pnpm --filter @health-advisor/agent-core test -- src/runtime/__tests__/advisor-chat-runtime.test.ts
```

预期结果：Advisor Chat runtime 测试全部通过。

**验证方式：**

```bash
pnpm --filter @health-advisor/agent-core test -- src/runtime/__tests__/advisor-chat-runtime.test.ts src/runtime/__tests__/web-search-evidence.test.ts
pnpm --filter @health-advisor/agent-core typecheck
```

预期结果：两个命令均通过。

**提交说明：**

```bash
git add packages/agent-core/src/runtime/agent-runtime.ts packages/agent-core/src/runtime/__tests__/advisor-chat-runtime.test.ts
git commit -m "feat(agent-core): run advisor web search before solving"
```

## 模块 4：API 配置、Registry 注入与回归验证

**目标：** 通过 API 配置控制 WebSearch 是否启用，在 runtime registry 注入 tool，并确认不进入 ReAct 白名单。

**依赖：** 任务 2.2、任务 3.2。

**涉及文件：**

- 修改：`apps/agent-api/src/config/env.ts`
- 修改：`apps/agent-api/src/__tests__/config/env.test.ts`
- 修改：`apps/agent-api/src/runtime/registry.ts`
- 修改：`apps/agent-api/src/__tests__/runtime/registry.test.ts`

**产出：**

- [ ] `WEB_SEARCH_ENABLED=false` 不要求 `TAVILY_API_KEY`。
- [ ] `WEB_SEARCH_ENABLED=true` 且无 `TAVILY_API_KEY` 时配置校验失败。
- [ ] `WEB_SEARCH_ENABLED=true` 且有 key 时 registry 注入 `webSearchTool`。
- [ ] registry 的 `reactLoop.tools` 不包含 `webSearch`。

### 任务 4.1：增加 WebSearch 配置校验

**所属模块：** 模块 4 - API 配置、Registry 注入与回归验证

**目标：** 在 API env schema 中加入 Tavily/WebSearch 配置和测试。

**前置条件：**

- 无。

**涉及文件：**

- 修改：`apps/agent-api/src/config/env.ts`
- 修改：`apps/agent-api/src/__tests__/config/env.test.ts`

**上下文：**

`envBool` 已在 `env.ts` 定义，当前用于 `ENABLE_GOD_MODE`、`FALLBACK_ONLY_MODE`、`MEMORY_EXTRACTION_ENABLED`。`WEB_SEARCH_ENABLED` 使用同一解析器，默认 false。

**实现步骤：**

- [ ] **步骤 1：写配置失败测试**

在 `apps/agent-api/src/__tests__/config/env.test.ts` 追加：

```ts
  it('defaults web search to disabled without requiring Tavily API key', () => {
    const config = loadConfig({ FALLBACK_ONLY_MODE: 'true' });

    expect(config.WEB_SEARCH_ENABLED).toBe(false);
    expect(config.TAVILY_API_KEY).toBeUndefined();
    expect(config.WEB_SEARCH_MAX_RESULTS).toBe(3);
    expect(config.WEB_SEARCH_TIMEOUT_MS).toBe(10000);
  });

  it('requires TAVILY_API_KEY when WEB_SEARCH_ENABLED=true', () => {
    expect(() => loadConfig({
      ...validEnv,
      WEB_SEARCH_ENABLED: 'true',
    })).toThrow(/TAVILY_API_KEY/);
  });

  it('accepts Tavily config when web search is enabled', () => {
    const config = loadConfig({
      ...validEnv,
      WEB_SEARCH_ENABLED: 'true',
      TAVILY_API_KEY: 'tvly-test',
      WEB_SEARCH_MAX_RESULTS: '5',
      WEB_SEARCH_TIMEOUT_MS: '15000',
    });

    expect(config.WEB_SEARCH_ENABLED).toBe(true);
    expect(config.TAVILY_API_KEY).toBe('tvly-test');
    expect(config.WEB_SEARCH_MAX_RESULTS).toBe(5);
    expect(config.WEB_SEARCH_TIMEOUT_MS).toBe(15000);
  });

  it('rejects WEB_SEARCH_MAX_RESULTS greater than 10', () => {
    expect(() => loadConfig({
      ...validEnv,
      WEB_SEARCH_ENABLED: 'true',
      TAVILY_API_KEY: 'tvly-test',
      WEB_SEARCH_MAX_RESULTS: '11',
    })).toThrow();
  });
```

- [ ] **步骤 2：运行测试确认失败**

```bash
pnpm --filter @health-advisor/agent-api test -- src/__tests__/config/env.test.ts
```

预期结果：测试失败，因为 config 还没有 WebSearch 字段。

- [ ] **步骤 3：实现 env schema**

在 `apps/agent-api/src/config/env.ts` 的 `AppConfigSchema` 中加入：

```ts
  TAVILY_API_KEY: z.string().optional(),
  WEB_SEARCH_ENABLED: envBool,
  WEB_SEARCH_MAX_RESULTS: z.coerce.number().int().positive().max(10).default(3),
  WEB_SEARCH_TIMEOUT_MS: z.coerce.number().positive().default(10000),
```

在现有 `.refine()` 链中追加：

```ts
).refine(
  (data) => !data.WEB_SEARCH_ENABLED || Boolean(data.TAVILY_API_KEY),
  { message: 'TAVILY_API_KEY is required when WEB_SEARCH_ENABLED is true', path: ['TAVILY_API_KEY'] },
);
```

如果追加后括号结构冲突，把现有 `.refine()` 链整理为连续调用，最终必须包含 LLM、Supabase、Tavily 三个 refine。

- [ ] **步骤 4：运行测试确认通过**

```bash
pnpm --filter @health-advisor/agent-api test -- src/__tests__/config/env.test.ts
```

预期结果：env 测试全部通过。

**验证方式：**

```bash
pnpm --filter @health-advisor/agent-api test -- src/__tests__/config/env.test.ts
pnpm --filter @health-advisor/agent-api typecheck
```

预期结果：两个命令均通过。

**提交说明：**

```bash
git add apps/agent-api/src/config/env.ts apps/agent-api/src/__tests__/config/env.test.ts
git commit -m "feat(agent-api): validate web search configuration"
```

### 任务 4.2：在 Runtime Registry 注入 WebSearch Tool

**所属模块：** 模块 4 - API 配置、Registry 注入与回归验证

**目标：** 按配置创建 `webSearchTool` 并传入 `AgentRuntimeDeps`，同时确认 ReAct tools 不包含 WebSearch。

**前置条件：**

- 任务 2.2 已完成。
- 任务 4.1 已完成。

**涉及文件：**

- 修改：`apps/agent-api/src/runtime/registry.ts`
- 修改：`apps/agent-api/src/__tests__/runtime/registry.test.ts`

**上下文：**

registry 当前只把本地结构化工具加入 `reactTools`。WebSearch 第一版不能加入 ReAct 白名单，只能由 planner 显式 `webSearchNeeds` 触发。LangChain Tavily JS 文档使用 `TAVILY_API_KEY` 环境变量作为 credential 渠道；`loadConfig(process.env)` 时真实运行已有该环境变量，测试用显式 env object 时 registry 需要把配置值写入 `process.env.TAVILY_API_KEY` 再实例化 Tavily tool。

**实现步骤：**

- [ ] **步骤 1：写 registry 失败测试**

在 `apps/agent-api/src/__tests__/runtime/registry.test.ts` 中追加：

```ts
  it('does not inject webSearchTool when WEB_SEARCH_ENABLED=false', () => {
    const config = loadConfig({
      FALLBACK_ONLY_MODE: 'true',
      DATA_DIR,
      WEB_SEARCH_ENABLED: 'false',
    });
    const registryWithoutSearch = createRuntimeRegistry(config, registry.metrics);

    expect(registryWithoutSearch.webSearchTool).toBeUndefined();
  });

  it('injects webSearchTool when WEB_SEARCH_ENABLED=true and keeps it out of react tools', () => {
    const config = loadConfig({
      FALLBACK_ONLY_MODE: 'false',
      LLM_API_KEY: 'sk-test',
      WEB_SEARCH_ENABLED: 'true',
      TAVILY_API_KEY: 'tvly-test',
      WEB_SEARCH_MAX_RESULTS: '4',
      WEB_SEARCH_TIMEOUT_MS: '12000',
      DATA_DIR,
    });

    const registryWithSearch = createRuntimeRegistry(config, registry.metrics);

    expect(registryWithSearch.webSearchTool?.name).toBe('webSearch');
    expect(registryWithSearch.webSearchConfig).toEqual({ enabled: true, maxResults: 4 });
    expect(registryWithSearch.reactLoop?.tools.has('webSearch')).toBe(false);
  });
```

- [ ] **步骤 2：运行测试确认失败**

```bash
pnpm --filter @health-advisor/agent-api test -- src/__tests__/runtime/registry.test.ts
```

预期结果：测试失败，因为 registry 尚未注入 `webSearchTool`。

- [ ] **步骤 3：实现 registry 注入**

在 `apps/agent-api/src/runtime/registry.ts` 从 `@health-advisor/agent-core` import 增加：

```ts
  createWebSearchTool,
```

在 `createRuntimeRegistry()` 中、`if (!config.FALLBACK_ONLY_MODE)` 之前加入：

```ts
  let webSearchTool: AgentRuntimeDeps['webSearchTool'];
  const webSearchConfig = {
    enabled: config.WEB_SEARCH_ENABLED,
    maxResults: config.WEB_SEARCH_MAX_RESULTS,
  };

  if (config.WEB_SEARCH_ENABLED) {
    process.env.TAVILY_API_KEY = config.TAVILY_API_KEY;
    webSearchTool = createWebSearchTool({
      maxResults: config.WEB_SEARCH_MAX_RESULTS,
      timeoutMs: config.WEB_SEARCH_TIMEOUT_MS,
    });
  }
```

在 `return` 的 `AgentRuntimeDeps` 字段中加入：

```ts
    webSearchTool,
    webSearchConfig,
```

确认 `reactTools` 只包含：

```ts
queryMetricSummaryTool
queryVisibleChartFactsTool
queryMissingDataTool
queryTimelineEventsTool
estimateCaffeineSleepImpactTool
```

不要向 `reactTools` 添加 `webSearchTool`。

- [ ] **步骤 4：运行测试确认通过**

```bash
pnpm --filter @health-advisor/agent-api test -- src/__tests__/runtime/registry.test.ts
```

预期结果：registry 测试全部通过。

**验证方式：**

```bash
pnpm --filter @health-advisor/agent-api test -- src/__tests__/runtime/registry.test.ts
pnpm --filter @health-advisor/agent-api typecheck
```

预期结果：两个命令均通过。

**提交说明：**

```bash
git add apps/agent-api/src/runtime/registry.ts apps/agent-api/src/__tests__/runtime/registry.test.ts
git commit -m "feat(agent-api): inject advisor web search tool"
```

## 执行顺序

### 依赖关系

| 任务 | blockedBy | 说明 |
|------|-----------|------|
| 1.1 扩展 AnalysisPlan Schema | - | 可立即启动，定义 `webSearchNeeds` 类型契约。 |
| 1.2 更新 Planner Prompt 和 Planner 解析测试 | 1.1 | 依赖 `webSearchNeeds` schema 可被 planner builder 解析。 |
| 2.1 安装 Tavily 依赖并定义 Tool Contract | - | 可立即启动，创建 WebSearch schema 和类型契约。 |
| 2.2 实现 Tavily 输出转换和 Tool 单元测试 | 2.1 | 依赖 WebSearch schema 和类型契约。 |
| 3.1 新增 WebSearch Evidence Helper | 1.1, 2.2 | 依赖 `WebSearchNeed` 类型和 `WebSearchOutput` tool contract。 |
| 3.2 集成 Advisor Chat Runtime 执行路径 | 3.1 | 依赖 helper 函数和 evidence 类型。 |
| 4.1 增加 WebSearch 配置校验 | - | 可立即启动，只修改 API config。 |
| 4.2 在 Runtime Registry 注入 WebSearch Tool | 2.2, 3.2, 4.1 | 依赖 tool factory、runtime deps 字段和配置字段。 |

### 执行阶段

**Phase 1（可并行）：**

- 任务 1.1：扩展 AnalysisPlan Schema
- 任务 2.1：安装 Tavily 依赖并定义 Tool Contract
- 任务 4.1：增加 WebSearch 配置校验

**Phase 2（可并行）：**

- 任务 1.2：更新 Planner Prompt 和 Planner 解析测试
- 任务 2.2：实现 Tavily 输出转换和 Tool 单元测试

**Phase 3：**

- 任务 3.1：新增 WebSearch Evidence Helper

**Phase 4：**

- 任务 3.2：集成 Advisor Chat Runtime 执行路径

**Phase 5：**

- 任务 4.2：在 Runtime Registry 注入 WebSearch Tool

### 关键路径

`2.1 -> 2.2 -> 3.1 -> 3.2 -> 4.2 -> 集成验证`

该链路定义 tool contract、runtime helper、runtime deps 和 API 注入，是最长串行依赖。任务 1.1 和 4.1 应优先并行完成，避免阻塞 Phase 2 和 Phase 5。

### 最终验证命令

```bash
pnpm --filter @health-advisor/agent-core test -- src/planner/__tests__/analysis-plan.test.ts src/planner/__tests__/advisor-plan-builder.test.ts src/planner/__tests__/advisor-plan-prompt.test.ts src/tools/__tests__/web-search.test.ts src/runtime/__tests__/web-search-evidence.test.ts src/runtime/__tests__/advisor-chat-runtime.test.ts
pnpm --filter @health-advisor/agent-api test -- src/__tests__/config/env.test.ts src/__tests__/runtime/registry.test.ts
pnpm --filter @health-advisor/agent-core typecheck
pnpm --filter @health-advisor/agent-api typecheck
```

预期结果：四个命令均通过。

## Acceptance Criteria

- [ ] `AnalysisPlanSchema` 支持可选 `webSearchNeeds`，且 query、reason、required、topic、timeRange、includeDomains、excludeDomains 校验符合设计。
- [ ] planner prompt 明确区分本地健康数据、本地知识和外部搜索，且禁止关键词启发式触发搜索。
- [ ] `webSearchTool` 使用 `@langchain/tavily`，输出只包含 `title`、`url`、`content`、`score`、`publishedDate`。
- [ ] `webSearchTool` 对空结果返回 `success: true` 和空数组，对 Tavily 异常返回 `success: false` 和 `web_search_error`。
- [ ] Runtime 在 `webSearchNeeds` 存在且 tool 可用时调用 `webSearchTool`，并把结果追加到 `## Web Search Evidence`。
- [ ] `required=true` 且搜索未启用、失败或空结果时，solver 不被调用，最终返回“当前无法获取外部资料”的安全说明。
- [ ] `required=false` 且搜索失败或空结果时，solver 被调用，prompt 中包含 `状态: unavailable` 和不得声称已查到外部资料的说明。
- [ ] `WEB_SEARCH_ENABLED=false` 时 registry 不注入 `webSearchTool`，且不要求 `TAVILY_API_KEY`。
- [ ] `WEB_SEARCH_ENABLED=true` 且无 `TAVILY_API_KEY` 时 `loadConfig()` 抛出配置错误。
- [ ] `WEB_SEARCH_ENABLED=true` 且有 key 时 registry 注入 `webSearchTool`，但 `reactLoop.tools` 不包含 `webSearch`。
- [ ] 不修改前端消息 UI，不新增浏览器抓取，不让 solver 或 ReAct loop 自由调用网络。
