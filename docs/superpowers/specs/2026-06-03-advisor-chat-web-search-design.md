# Advisor Chat Web Search Design

## 背景

Advisor Chat 当前已有 planner、受限 ReAct、结构化工具和本地知识库链路。第一版 WebSearch 需要在不破坏现有健康数据分析主链路的前提下，引入外部网页搜索能力，用于回答本地数据和已编译知识无法覆盖的“最新信息、外部研究、指南、公开资料”类问题。

本设计采用 `@langchain/tavily` 作为第一版搜索实现。后续如果需要替换 Tavily 或自研 HTTP provider，应保持运行时和 solver 只依赖项目内部稳定输出结构。

## 目标

- Advisor Chat 能在 planner 明确声明搜索需求时调用 Tavily 搜索。
- 搜索结果作为受控 evidence 注入 solver prompt，而不是直接替代本地健康数据。
- 第一版不把 WebSearch 加入 ReAct 自动选择流程，避免隐式联网。
- WebSearch 调用失败时行为可预测，不静默退化成通用 fallback。
- 所有外部搜索证据都带 URL，便于后续 citation UI、eval 和审计。

## 非目标

- 不实现浏览器抓取、全文爬取或网页正文清洗。
- 不实现 citation UI。
- 不让 solver 直接自由调用网络。
- 不支持多个搜索 provider 的运行时切换；只保留输出结构上的抽象空间。
- 不用关键词启发式触发搜索。

## 推荐方案

第一版使用“planner 显式触发”。

Planner 在 `AnalysisPlan` 中输出 `webSearchNeeds`。Runtime 在 planner 成功后检查这些需求；如果 WebSearch 已启用，则逐条调用 `webSearchTool`，把结构化结果追加到 solver prompt 的 `## Web Search Evidence` 区块。Solver 仍然按照现有健康安全约束生成最终 `AgentResponseEnvelope`。

工具实现仍然使用现有 `ToolDefinition<TInput, TOutput>` 形态，便于测试和未来接入 ReAct，但第一版不注册到 ReAct 白名单。

## 配置

在 `apps/agent-api/src/config/env.ts` 增加：

```ts
TAVILY_API_KEY: z.string().optional(),
WEB_SEARCH_ENABLED: envBool,
WEB_SEARCH_MAX_RESULTS: z.coerce.number().int().positive().max(10).default(3),
WEB_SEARCH_TIMEOUT_MS: z.coerce.number().positive().default(10000),
```

配置规则：

- `WEB_SEARCH_ENABLED=false` 时，不创建 WebSearch Tool，不要求 `TAVILY_API_KEY`。
- `WEB_SEARCH_ENABLED=true` 时，`TAVILY_API_KEY` 必须存在，否则启动配置校验失败。
- 第一版默认 `WEB_SEARCH_ENABLED=false`，避免开发环境无意联网。

## Plan Schema

扩展 `packages/agent-core/src/planner/analysis-plan.ts`：

```ts
webSearchNeeds: z.array(z.object({
  query: z.string().min(3),
  reason: z.string().min(1),
  required: z.boolean(),
  topic: z.enum(['general', 'news']).optional(),
  timeRange: z.enum(['day', 'week', 'month', 'year']).optional(),
  includeDomains: z.array(z.string()).optional(),
  excludeDomains: z.array(z.string()).optional(),
})).optional(),
```

Planner prompt 更新规则：

- 只有当用户问题需要外部最新信息、公开研究、指南或非本地知识时才输出 `webSearchNeeds`。
- 用户只询问自己的睡眠、HRV、压力、活动、SpO2、静息心率等本地数据时，不输出 `webSearchNeeds`。
- 本地编译知识或产品 facts 能回答时，优先使用本地知识，不搜索。
- 对诊断、用药、治疗问题，搜索只能用于一般性背景说明，不能支持个性化医疗指令。

## Tool 设计

新增 `packages/agent-core/src/tools/web-search.ts`。

输入 schema：

```ts
{
  query: string;
  maxResults?: number;
  topic?: 'general' | 'news';
  searchDepth?: 'basic' | 'advanced';
  timeRange?: 'day' | 'week' | 'month' | 'year';
  includeDomains?: string[];
  excludeDomains?: string[];
}
```

输出 schema：

```ts
{
  results: Array<{
    title: string;
    url: string;
    content: string;
    score?: number;
    publishedDate?: string;
  }>;
}
```

实现约束：

- 内部用 `@langchain/tavily` 的 `TavilySearch`。
- 输出只保留 title、url、content/snippet、score、publishedDate。
- 第一版不把 raw page content 注入 solver prompt。
- `evidenceIds` 使用 `web:<url>`。
- 空结果返回 `success: true` 和空数组，不伪造结果。
- Tavily 抛错时返回 `success: false`，错误码使用 `web_search_error`。

## Runtime 调用

在 `packages/agent-core/src/runtime/agent-runtime.ts` 的 Advisor Chat planner 成功后执行：

1. 保持现有本地 evidence resolution 和 ReAct 补证逻辑。
2. 如果 `analysisPlan.webSearchNeeds` 非空且 runtime deps 提供 `webSearchTool`，逐条执行搜索。
3. 将搜索结果收集为 `WebSearchEvidence`。
4. 在 `appendPlanContextToPrompt()` 后追加 `## Web Search Evidence`。
5. Solver prompt 明确说明：
   - 外部搜索只作为背景资料。
   - 用户本地健康数据优先级高于网页信息。
   - 使用搜索信息时必须保守表达，并保留来源 URL。

`required` 处理：

- `required=true` 且搜索失败或无结果：返回安全说明，说明“当前无法获取外部资料”，不调用 solver 生成可能缺证据的回答。
- `required=false` 且搜索失败或无结果：继续用本地上下文回答，并在 prompt 中披露外部搜索未取得可用结果。

## Runtime 依赖注入

扩展 `AgentRuntimeDeps`：

```ts
webSearchTool?: ToolDefinition<WebSearchInput, WebSearchOutput>;
webSearchConfig?: {
  enabled: boolean;
  maxResults: number;
};
```

在 `apps/agent-api/src/runtime/registry.ts` 中：

- `WEB_SEARCH_ENABLED=true` 时创建 `TavilySearch` 和 `webSearchTool`。
- `WEB_SEARCH_ENABLED=false` 时不注入。
- 不把 `webSearchTool` 加入 `reactTools`，第一版保持显式 planner 调用。

## Prompt 注入格式

Solver prompt 追加示例：

```md
## Web Search Evidence

搜索需求: <reason>
查询: <query>
状态: success

- [web:https://example.com/article] <title>
  URL: https://example.com/article
  摘要: <content>
  Published: <publishedDate>
```

失败或空结果示例：

```md
## Web Search Evidence

搜索需求: <reason>
查询: <query>
状态: unavailable
说明: 外部搜索未返回可用结果。回答时不得声称已查到外部资料。
```

## 安全边界

- 不允许 WebSearch 结果生成诊断结论。
- 不允许 WebSearch 结果生成个性化用药建议。
- 不允许把网页说法写成设备测得的用户事实。
- 不允许搜索结果覆盖 `TaskContextPacket` 中的用户本地健康数据。
- 对高风险问题，仍沿用现有 safety cleaner、verifier 和 sync gate 规则。

## 测试策略

单元测试：

- `AnalysisPlanSchema` 接受合法 `webSearchNeeds`。
- planner prompt 中包含 WebSearch 触发边界。
- `webSearchTool` 将 Tavily 返回转换成稳定输出结构。
- `webSearchTool` 对 Tavily 异常返回 `success:false`。
- runtime 在 `webSearchNeeds` 存在时调用 tool 并注入 solver prompt。
- `required=true` 搜索失败时不调用 solver。
- `required=false` 搜索失败时继续调用 solver，并注入 unavailable 状态。

路由/配置测试：

- `WEB_SEARCH_ENABLED=false` 时无需 `TAVILY_API_KEY`。
- `WEB_SEARCH_ENABLED=true` 且无 `TAVILY_API_KEY` 时配置校验失败。
- `WEB_SEARCH_ENABLED=true` 且有 key 时 runtime registry 注入 tool。

回归测试：

- 普通“我最近睡眠怎么样”不触发 WebSearch。
- “最近有什么关于咖啡因和睡眠的研究”触发 WebSearch。
- 搜索失败不会误走通用 fallback。

## 已定边界

- 第一版不设置默认搜索域名白名单，只允许 planner 按需设置 `includeDomains`。
- 第一版不改前端消息 UI。URL 进入 solver prompt 和最终 summary 文本；结构化 citation UI 另行设计。
- 第一版不扩展 eval report 格式。搜索 evidence 至少通过 runtime observer 和测试断言可见。
