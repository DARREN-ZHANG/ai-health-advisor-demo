# AI Health Advisor — Agent 子模块详细技术实现方案

## 1. 文档定位

本文档定义 Health Advisor Web Demo 中 **Agent 子模块** 的详细技术实现方案。

本方案严格以《技术架构文档》为系统级 source of truth，仅在其既定约束内展开 Agent 层详细设计；《PRD》仅作为任务形态、交互结果和文案约束的补充参考。

**本文件目标**：让执行团队可以直接开始实现 `packages/agent-core` 与 `apps/agent-api` 中和 Agent Runtime 相关的代码，而不再停留在概念讨论层。

---

## 2. 设计边界

## 2.1 已确定前提

以下事项视为已确定，不在本方案中重新讨论：

- Agent 框架使用 **LangChain JS `createAgent`**
- Agent Runtime 运行于 **Fastify 后端内部**
- 数据源为 **JSON 沙盒 + 进程内 runtime overrides**
- Agent 对前端只输出 **结构化响应**
- 图表通过 **chart token** 协议交付，由前端渲染 ECharts
- 必须支持 **6 秒超时降级**
- 不引入数据库、Redis、向量库、长期记忆、多 Agent、原生 LangGraph 显式状态图

## 2.2 本子模块负责内容

Agent 子模块负责：

- 统一承载 Health Advisor 的所有 LLM 能力
- 管理 system prompt、task prompt 与上下文注入
- 管理最小短期记忆
- 执行确定性规则抽取
- 调用模型并约束输出为结构化协议
- 校验图表 token 与输出合法性
- 在异常情况下触发 fallback

## 2.3 本子模块不负责内容

Agent 子模块不负责：

- 页面 UI 渲染
- 图表视觉布局与交互
- God-Mode 面板 UI
- 沙盒文件编辑工具
- 长期用户记忆
- 复杂任务编排系统
- 诊断级医疗决策

---

## 3. Agent 目标与任务类型

系统中仅存在一个主 Agent：`HealthAdvisorAgent`。

它统一处理四类任务：

1. **Homepage Brief**
   - 生成首页 AI 晨报
   - 生成 micro tips
   - 输出状态色

2. **View Summary**
   - 对 Data Center 当前 tab + timeframe + 当前图表上下文进行总结
   - 可携带图表 token

3. **Advisor Chat**
   - 响应用户自由提问
   - 结合短期会话历史、当前 profile、近期数据与事件进行回答

4. **Lightweight Insight**
   - 为局部模块提供短文本提示
   - 用于轻量级建议或预警

> 说明：虽然任务类型不同，但仍由一个统一 Agent Runtime 处理；差异通过 `taskType`、上下文窗口和输出 schema 分流。

---

## 4. 设计原则

## 4.1 以确定性包裹生成式

Agent 不是“自由聊天层”，而是“确定性上下文 + 受控生成 + 严格解析”的组合体。

实现原则：

- 数据先结构化，再喂给模型
- 规则先执行，再让模型解释
- 模型输出必须受 schema 约束
- 非法输出不得直接透传给前端

## 4.2 结构化优先于自然语言解析

前端不能从自由文本里猜状态、猜图表、猜建议类型。所有结构必须由后端显式给出。

## 4.3 失败可控优先于“尽量智能”

Demo 场景下，稳定性优先于上限。宁可触发 fallback，也不接受：

- 6 秒以上悬挂
- 非法 JSON
- 越权医学诊断
- 对缺失数据胡乱补全
- 输出与页面上下文不一致

## 4.4 单 Agent，但内部模块化

不做多 Agent 编排，但内部实现保持模块分层，以便后续扩展。

---

## 5. 运行时总览

```text
AgentRequest
   |
   v
HealthAdvisorAgentService.executeAgent
   |
   +--> Injected Runtime Adapters
   |       +--> Sandbox Selectors
   |       +--> Override Store
   |       +--> Memory Store
   |
   +--> Session Resolver
   +--> Context Builder
   |       +--> Sandbox Reader
   |       +--> Override Merger
   |       +--> Window Selector
   |       +--> Insight Rule Engine
   |       +--> Analytical Memory Loader
   |
   +--> Prompt Builder
   |
   +--> Agent Executor (LangChain createAgent)
   |
   +--> Response Parser
   |       +--> Schema Validator
   |       +--> Chart Token Validator
   |       +--> Safety Cleaner
   |
   +--> Fallback Engine (on timeout / invalid / provider error / low-data)
   |
   +--> Session Memory Writer
   |
   v
AgentResponseEnvelope
```

---

## 6. 请求模型

Agent 层只接受统一请求模型，由 API 层在进入 Agent 之前完成协议收口。

```ts
export type AgentTaskType = 'homepage_brief' | 'view_summary' | 'advisor_chat' | 'micro_insight';

export type PageContext = 'homepage' | 'data_center' | 'ai_advisor';

export type DataTab = 'overview' | 'sleep' | 'heart_rate' | 'activity' | 'stress' | 'vitals';

export type Timeframe = 'day' | 'week' | 'month' | 'year' | 'custom';

export interface AgentRequest {
  requestId: string;
  sessionId: string;
  profileId: string;
  taskType: AgentTaskType;
  pageContext: PageContext;
  tab?: DataTab;
  timeframe?: Timeframe;
  dateRange?: {
    start: string; // YYYY-MM-DD
    end: string; // YYYY-MM-DD
  };
  userMessage?: string;
  smartPromptId?: string;
  visibleChartIds?: string[];
  viewportHints?: {
    device: 'mobile' | 'tablet' | 'desktop';
    density: 'compact' | 'regular';
  };
}
```

### 约束

- `homepage_brief` 不要求 `userMessage`
- `view_summary` 必须携带 `tab + timeframe`
- `advisor_chat` 必须携带 `userMessage`
- `micro_insight` 可由系统内部触发

---

## 7. 响应模型

Agent 层对外只返回统一结构化响应。

```ts
export type AgentResponseSource = 'llm' | 'fallback' | 'rule';
export type AgentStatusColor = 'green' | 'yellow' | 'red';

export type ChartTokenId =
  | 'HRV_7DAYS'
  | 'SLEEP_7DAYS'
  | 'RESTING_HR_7DAYS'
  | 'ACTIVITY_7DAYS'
  | 'SPO2_7DAYS'
  | 'SLEEP_STAGE_LAST_NIGHT'
  | 'STRESS_LOAD_7DAYS'
  | 'HRV_SLEEP_14DAYS_COMPARE';

export interface AgentMeta {
  requestId: string;
  sessionId: string;
  profileId: string;
  pageContext: PageContext;
  provider?: string;
  model?: string;
  latencyMs: number;
  fallbackTriggered: boolean;
  finishReason?: 'stop' | 'timeout' | 'provider_error' | 'invalid_output' | 'low_data';
  promptVersion: string;
  taskType: AgentTaskType;
}

export interface AgentResponseEnvelope {
  source: AgentResponseSource;
  statusColor: AgentStatusColor;
  summary: string;
  chartTokens?: ChartTokenId[];
  microTips?: string[];
  meta: AgentMeta;
}
```

### 输出约束

- `summary` 为最终展示文本，不允许前端再做结构提取
- `chartTokens` 最多 2 个
- `microTips` 建议最多 3 条
- 首页晨报文本推荐控制在 **80–120 字**
- 所有文本必须避免疾病诊断、治疗承诺与虚构数据

---

## 8. 内部分层设计

## 8.1 模块划分

建议在 `packages/agent-core` 中拆为以下目录：

```text
packages/agent-core/
├── src/
│   ├── index.ts
│   ├── constants/
│   │   ├── agent.ts
│   │   ├── limits.ts
│   │   └── charts.ts
│   ├── schemas/
│   │   ├── request.ts
│   │   ├── response.ts
│   │   ├── llm-output.ts
│   │   └── memory.ts
│   ├── prompts/
│   │   ├── system.ts
│   │   ├── task-templates.ts
│   │   └── prompt-version.ts
│   ├── context/
│   │   ├── build-agent-context.ts
│   │   ├── select-window.ts
│   │   ├── derive-page-scope.ts
│   │   └── sanitize-context.ts
│   ├── memory/
│   │   ├── session-memory-store.ts
│   │   ├── analytical-memory-store.ts
│   │   ├── memory-policy.ts
│   │   └── serialize-memory.ts
│   ├── rules/
│   │   ├── insight-rule-engine.ts
│   │   ├── status-color.ts
│   │   ├── anomaly-detection.ts
│   │   ├── trend-summary.ts
│   │   └── low-data-check.ts
│   ├── executor/
│   │   ├── create-health-agent.ts
│   │   ├── execute-agent.ts
│   │   ├── model-factory.ts
│   │   ├── timeout.ts
│   │   └── middleware.ts
│   ├── parser/
│   │   ├── parse-agent-output.ts
│   │   ├── validate-chart-tokens.ts
│   │   ├── clean-summary.ts
│   │   └── normalize-response.ts
│   ├── fallback/
│   │   ├── fallback-engine.ts
│   │   ├── fallback-catalog.ts
│   │   └── build-rule-fallback.ts
│   ├── services/
│   │   └── health-advisor-agent-service.ts
│   └── observability/
│       ├── trace-agent.ts
│       └── log-agent-event.ts
```

---

## 9. Context Management 详细设计

## 9.1 目标

Context Builder 的职责不是“把所有数据塞给模型”，而是构建一个 **当前任务刚好需要的、可解释的、长度受控的上下文包**。

## 9.2 输入

Context Builder 输入：

- `AgentRequest`
- profile 基础信息
- merged daily records
- runtime overrides
- session memory
- analytical memory
- rule engine 结果

## 9.3 输出

```ts
export interface AgentContext {
  profile: {
    profileId: string; // 等价于 SandboxProfile.userId，在 API 层统一使用 profileId
    name: string;
    age: number;
    tags: string[];
    baselines: {
      restingHR: number;
      hrv: number;
    };
  };
  task: {
    type: AgentTaskType;
    pageContext: PageContext;
    tab?: DataTab;
    timeframe?: Timeframe;
    dateRange?: { start: string; end: string };
    userMessage?: string;
  };
  dataWindow: {
    start: string;
    end: string;
    records: unknown[];
    missingFields: string[];
  };
  signals: {
    overallStatus: AgentStatusColor;
    anomalies: string[];
    trends: string[];
    events: string[];
    lowData: boolean;
  };
  memory: {
    recentMessages: Array<{ role: 'user' | 'assistant'; text: string }>;
    latestViewSummary?: string;
    latestRuleSummary?: string;
  };
}
```

## 9.4 窗口选择策略

不同任务使用不同上下文窗口：

### homepage_brief

- 默认最近 **14 天**（与 PRD §4.1 "过去 14 天完整数据" 及 Backend morning-brief 流程一致）
- 若当天或窗口内数据缺失，保留原 14 天窗口并显式记录缺失语义；不得静默平移到另一段“最近有数据”的窗口
- 若缺失导致当前任务不可稳定生成，则由 fallback / rule 路径返回结构化结果
- 聚焦：睡眠、HR、HRV、活动、事件

### view_summary

- 由 `timeframe + dateRange` 决定
- 必须与 Data Center 当前视图一致
- 只突出当前 tab 相关指标，其他维度作为辅助解释

### advisor_chat

- 默认最近 **14 天**
- 若用户问题显式提及“这一个月/最近一年/昨天”，则可扩展或缩小窗口
- 禁止无限拉长上下文，避免 prompt 膨胀

### micro_insight

- 默认最近 **3–7 天**
- 以短时状态变化为主

## 9.5 上下文裁剪原则

必须裁剪的内容：

- 与当前任务无关的历史长尾数据
- 与当前 tab 无关的冗余字段
- 重复事件描述
- 超过记忆上限的历史消息

必须保留的内容：

- 当前 profile tags
- 当前窗口数据摘要
- 明确异常点
- 事件注入记录
- 缺失字段说明

---

## 10. Memory Management 详细设计

## 10.1 总体原则

只做 **最小短期记忆**，不做长期用户记忆。

## 10.2 Session Memory

### 用途

仅服务 `advisor_chat` 的多轮连续对话。

### 存储形态

进程内 `Map<string, SessionConversationMemory>`，key 为 `sessionId`。一条 memory 永远只绑定当前 session 的单一 profile；若读取或写入时发现 `memory.profileId !== currentProfileId`，必须先删除旧记录再继续。

```ts
export interface SessionConversationMemory {
  sessionId: string;
  profileId: string;
  messages: Array<{
    role: 'user' | 'assistant';
    text: string;
    createdAt: number;
  }>;
  updatedAt: number;
}
```

### 策略

- 仅保留最近 **6 轮**（即最多 12 条 user/assistant 消息）
- 仅保留文本摘要，不存原始完整结构响应
- God-Mode `profile switch` 必须调用 `clearMemoryOnProfileSwitch(sessionId, fromProfileId, toProfileId)`
- 即使前端复用同一个 `sessionId`，profile 切换后也不得复用旧 profile 的会话记忆
- session 超过 TTL 后自动淘汰

### 建议默认值

- `MAX_TURNS = 6`
- `SESSION_TTL_MS = 30 * 60 * 1000`

## 10.3 Analytical Memory

### 用途

缓存最近一次“可复用分析结果”，减少重复推理与 prompt 体积。

### 存储内容

- 最近一次首页晨报摘要
- 最近一次当前视图总结
- 最近一次规则引擎摘要

```ts
export interface AnalyticalMemory {
  sessionId: string;
  profileId: string;
  latestHomepageBrief?: string;
  latestViewSummaryByScope?: Record<string, string>;
  latestRuleSummary?: string;
  updatedAt: number;
}
```

### 注意

- Analytical Memory 不是缓存最终 API 响应，而是缓存可被 prompt 重用的分析摘要
- profile 切换、场景恢复、override 大改动后应失效
- profile switch 时必须与 Session Memory 一起原子清空，避免同一 `sessionId` 读取到旧 profile 摘要

---

## 11. Insight Rule Engine 详细设计

## 11.1 定位

规则引擎是 Agent 的确定性骨架。

模型负责组织语言与给出建议；规则引擎负责先把“异常、趋势、状态、低数据”算出来。

## 11.2 输出

```ts
export interface RuleEngineResult {
  statusColor: AgentStatusColor;
  anomalies: Array<{
    type: string;
    metric: string;
    date?: string;
    message: string;
    severity: 'low' | 'medium' | 'high';
  }>;
  trends: Array<{
    metric: string;
    direction: 'up' | 'down' | 'flat' | 'volatile';
    message: string;
  }>;
  correlations: Array<{
    left: string;
    right: string;
    message: string;
  }>;
  events: Array<{
    date: string;
    label: string;
  }>;
  lowData: boolean;
  ruleSummary: string;
}
```

## 11.3 首期规则范围

建议首期仅做以下规则，避免过度复杂：

### 睡眠类

- 最近 3 天平均睡眠时长低于个人窗口均值显著阈值
- 深睡分钟数连续下降
- 睡眠起止时间明显漂移

### 心率 / HRV 类

- 平均 HR 高于个人基线显著阈值
- HRV 低于个人基线显著阈值
- HRV 波动剧烈

### 活动类

- 步数显著上升或下降
- 卡路里消耗与活动走势一致 / 背离

### 事件类

- 有事件注入的日期出现在异常窗口内
- 事件标签与异常同时出现时，输出“可能相关”级别的 deterministic signal

### 低数据类

- 当前窗口有效记录数量不足
- 当前 tab 核心字段缺失比例过高

## 11.4 状态色计算

建议由规则引擎先给出默认状态色，模型不可任意越权改色。

策略：

- 高严重度异常存在：`red`
- 中严重度异常为主：`yellow`
- 无明显异常：`green`

模型只允许在 prompt 中解释颜色原因，不负责自由定义颜色。

---

## 12. Prompt Builder 详细设计

## 12.1 Prompt 组成

Prompt Builder 负责把以下内容组装成模型输入：

1. 固定 system prompt
2. task-specific instruction
3. sanitized context
4. short memory
5. output schema instruction

## 12.2 System Prompt 基本要求

System Prompt 需显式约束：

- 角色：顶尖运动医学专家与私人健康助理
- 风格：知性、直截了当
- 信号：遵循红黄绿逻辑
- 禁止：疾病诊断、处方建议、虚构缺失数据
- 输出：必须服从结构化 JSON 协议
- 图表：只能输出允许的 chart token

## 12.3 Task Prompt 模板

建议按任务拆模板：

- `homepage-brief.prompt.ts`
- `view-summary.prompt.ts`
- `advisor-chat.prompt.ts`
- `micro-insight.prompt.ts`

### homepage_brief 要求

- 输出 80–120 字
- 必须包含状态定调、数据循证、行动建议
- 最多 3 条 micro tips

### view_summary 要求

- 必须围绕当前 tab 与 timeframe
- 要指出趋势、可能相关因素、下一步建议
- 可输出 0–2 个图表 token

### advisor_chat 要求

- 必须回答用户问题本身
- 可跨维度引用历史数据
- 禁止脱离数据空谈

### micro_insight 要求

- 简短
- 以单点提醒为主
- 不扩展成长文

## 12.4 Prompt 版本化

必须为 prompt 维护版本号，例如：

```ts
export const PROMPT_VERSION = 'agent.v1';
```

所有响应元信息必须带回 `promptVersion`，便于调试和回归。

---

## 13. LangChain Agent Executor 详细设计

## 13.1 设计目标

虽然框架层采用 `createAgent`，但在本 Demo 中不把它用成“开放式工具代理”，而是用成 **受控的单轮/短多轮结构化生成执行器**。

## 13.2 createAgent 使用策略

建议：

- 工具数量保持极少
- 不依赖复杂 ReAct 多步推理
- 主要通过结构化上下文完成回答
- tool-like modules 更偏内部 helper，而不是开放互联网工具

## 13.3 建议工具范围

首期仅允许内部只读工具或内部 helper：

1. `get_metric_window_summary`
2. `get_event_context`
3. `get_latest_view_memory`

> 但这些能力也可以直接在进入模型前完成，不强制暴露为 LangChain tool。首期建议优先实现为运行时预处理模块，而不是让模型主动多步调用。

## 13.4 模型工厂

```ts
export interface ModelRuntimeConfig {
  provider: 'openai' | 'anthropic' | 'gemini';
  model: string;
  apiKey: string;
  timeoutMs: number;
}
```

模型工厂职责：

- 读取环境变量
- 按 provider 构造对应 chat model
- 统一配置 timeout / retries / temperature

建议默认：

- `temperature`: 0.2–0.4
- `maxRetries`: 0 或 1
- 由外层统一控制 6 秒总超时

## 13.5 超时控制

必须使用外层总超时包裹整个执行链，而不是只包裹 provider 请求。

原因：

- Context Builder
- Agent 调用
- Response Parser
- Fallback

共同构成用户感知延迟。

建议：

- Agent 服务总 SLA：6000ms
- 内部可给模型调用预留约 4500–5000ms
- 留出解析和 fallback 空间

---

## 14. Structured Output 详细设计

## 14.1 LLM 原始输出 schema

模型不直接输出最终前端响应，而是输出 **LLM Raw Structured Output**，再由 parser 二次收口。

```ts
export interface LlmRawAgentOutput {
  statusColor: 'green' | 'yellow' | 'red';
  summary: string;
  chartTokens?: ChartTokenId[];
  microTips?: string[];
}
```

## 14.2 为什么不让模型直接输出最终协议

因为最终协议中的：

- `source`
- `meta.latencyMs`
- `meta.provider`
- `meta.fallbackTriggered`
- `finishReason`

属于运行时事实，应由系统层填充，而不是由模型生成。

## 14.3 Chart Token 协议

首期采用 **单段式字符串 token 协议**：

- Agent 输出、Backend 校验、Frontend 渲染共同使用 `ChartTokenId[]`
- 正式线缆格式只允许字符串 token，不允许 `{ type, metric, range }` 对象继续向后流动
- `summary` 中不得残留 `[CHART:...]` 协议串；若 prompt/fallback 资产中存在作者侧标记，Parser 必须在 Agent 层将其收口为 `chartTokens[]` 并清除原文本

受支持 token：

- `HRV_7DAYS`
- `SLEEP_7DAYS`
- `RESTING_HR_7DAYS`
- `ACTIVITY_7DAYS`
- `SPO2_7DAYS`
- `SLEEP_STAGE_LAST_NIGHT`
- `STRESS_LOAD_7DAYS`
- `HRV_SLEEP_14DAYS_COMPARE`

## 14.4 token 合法性校验

Parser 必须检查：

- token 是否属于白名单
- token 对应指标在当前窗口中是否存在足够数据
- token 数量是否超限
- token 是否与当前 taskType / tab 严重不一致

非法 token 处理策略：

- 单个非法：删除该 token，保留其他输出
- 大量非法或 summary 严重不可信：触发 fallback

---

## 15. Response Parser 详细设计

## 15.1 责任边界

Response Parser 是最后一道安全闸门。

职责包括：

- 解析模型输出
- schema 校验
- 文本清洗
- chart token 解析与校验
- micro tips 截断
- 输出标准化

## 15.2 文本清洗规则

至少处理以下问题：

- 删除“作为 AI 我...”之类元话语
- 删除医学诊断式结论
- 删除对缺失数据的虚构描述
- 删除未闭合 token
- 删除明显超长、跑题或重复段落

## 15.3 summary 长度控制

建议：

- `homepage_brief`: 80–120 字优先，超长则裁切并重新收尾
- `view_summary`: 120–220 字
- `advisor_chat`: 120–300 字
- `micro_insight`: 20–60 字

---

## 16. Fallback Engine 详细设计

## 16.1 触发条件

以下情况必须 fallback：

1. 总超时
2. Provider 报错
3. 输出无法解析
4. 输出 schema 非法
5. 数据不足，无法稳定生成
6. 输出明显越权（诊断、幻觉、非法 token）

## 16.2 fallback 来源优先级

### 第一优先：Rule-based fallback

如果规则引擎已有足够确定性信号，则优先基于规则生成自然语言 fallback。

优点：

- 更贴近当前数据
- 稳定
- 可解释

### 第二优先：Scenario preset fallback

若规则也不足，则从 `data/fallback/` 中按 taskType + statusColor + pageContext 选择预设文案。

## 16.3 fallback 输出要求

fallback 的响应协议必须与正常 LLM 响应完全一致，仅 `source` 和 `meta` 不同。

示例：

```ts
{
  source: 'fallback',
  statusColor: 'yellow',
  summary: '最近几天你的恢复指标略有波动，今晚建议优先保证睡眠并降低晚间刺激性活动。',
  chartTokens: [],
  microTips: [],
  meta: {
    requestId: 'req_demo_001',
    sessionId: 'sess_demo_001',
    profileId: 'profile_a',
    pageContext: 'homepage',
    latencyMs: 5820,
    fallbackTriggered: true,
    finishReason: 'timeout',
    promptVersion: 'agent.v1',
    taskType: 'homepage_brief'
  }
}
```

---

## 17. Safety 与输出边界

## 17.1 明确禁止输出

- 疾病诊断
- 医疗结论性判断
- 处方级建议
- 对未提供指标的硬性解释
- 虚构 event
- 假装看到不存在的图表

## 17.2 推荐表达风格

- “从最近几天的数据看”
- “这更像是需要关注的恢复信号”
- “建议优先从睡眠/活动节律调整入手”
- “目前更适合理解为趋势提醒，而不是医学结论”

## 17.3 缺失数据策略

若缺失关键字段：

- 显式承认缺失
- 使用现有指标给出有限建议
- 不得猜测体温、睡眠评分等不存在字段

---

## 18. 与 Agent API 的集成边界

虽然本文聚焦 Agent 子模块，但需要明确与 `apps/agent-api` 的接口边界。

## 18.1 Agent Service 对外接口

```ts
export interface HealthAdvisorAgentService {
  executeAgent(request: AgentRequest): Promise<AgentResponseEnvelope>;
}
```

## 18.2 API 层职责

API 层负责：

- 解析 HTTP 请求
- 注入 requestId / sessionId
- 组装 `AgentRequest`
- 注入 runtime store / sandbox selector / memory adapter 等依赖
- 调用 agent service
- 记录日志与错误
- 返回 HTTP 响应

API 层不负责：

- 手写上下文拼装细节
- 拼 prompt
- 直接解析 LLM 返回
- 自行构造 fallback 文本

---

## 19. God-Mode 对 Agent 的影响

God-Mode 不直接改 Agent 逻辑，但会影响 Agent 输入。

## 19.1 影响路径

- profile 切换 -> context 重建 + memory 失效
- 事件注入 -> rule engine 新增 event signal
- 指标 override -> data window 重算 +状态色可能变化
- 场景恢复 -> analytical memory 失效 + overrides 清空

## 19.2 一致性要求

Agent 每次运行必须基于 **merged sandbox snapshot**，不能一部分看原始 JSON，一部分看 override 后数据。

---

## 20. 可观测性设计

Agent 层必须输出最小可观测事件，供 API 层统一记录。

## 20.1 建议日志字段

```ts
{
  (requestId,
    sessionId,
    profileId,
    taskType,
    pageContext,
    provider,
    model,
    promptVersion,
    latencyMs,
    usedFallback,
    finishReason,
    chartTokenCount,
    lowData,
    errorReason);
}
```

## 20.2 建议埋点时机

- context build start / end
- model invoke start / end
- parser start / end
- fallback triggered
- memory write done

---

## 21. 测试方案

## 21.1 单元测试

必须覆盖：

1. `build-agent-context`
   - 不同 taskType 的窗口选择
   - 缺失数据显式保留
   - profile 切换后的上下文隔离

2. `insight-rule-engine`
   - HRV 下降规则
   - 睡眠下降规则
   - 事件与异常关联
   - low-data 判定

3. `parse-agent-output`
   - 合法 JSON
   - 非法 JSON
   - 超长 summary
   - 非法 token

4. `fallback-engine`
   - timeout fallback
   - provider error fallback
   - low-data fallback

5. `session-memory-store`
   - turn limit
   - TTL 回收
   - profile 切换清空

## 21.2 集成测试

必须覆盖：

- `homepage_brief` 正常返回
- `view_summary` 正常返回
- `advisor_chat` 多轮会话记忆生效
- timeout -> fallback
- invalid output -> fallback
- event injection 后状态变化反映到响应

## 21.3 E2E 验收点（与前后端联调）

- 首页晨报能稳定返回结构化响应
- Data Center 当前视图总结与当前 tab/timeframe 一致
- AI Chat 提问能引用近期历史数据
- chart token 能被前端正确渲染
- 模型异常时前端仍显示统一协议 fallback

---

## 22. 文件与代码落位建议

## 22.1 packages/shared

放：

- AgentRequest / AgentResponseEnvelope 类型
- chart token 枚举
- task type 枚举
- 通用 zod schema

## 22.2 packages/sandbox

放：

- profile 读取
- merged snapshot 生成
- date range 过滤

## 22.3 packages/agent-core

放：

- 本文定义的所有 Agent 运行时核心能力

## 22.4 apps/agent-api

放：

- HTTP routes
- request / response adapter
- observability integration
- env config

---

## 23. 分阶段实施顺序

## Phase 1 — Contract First

目标：先把协议和假数据流打通。

交付：

- `AgentRequest` / `AgentResponseEnvelope` schema
- chart token 白名单
- fallback engine v1
- fake rule engine
- fake executor（不接 LLM）

## Phase 2 — Context + Rules

目标：让 Agent 拿到正确上下文。

交付：

- context builder v1
- window selector
- session memory store
- analytical memory store
- rule engine v1

## Phase 3 — Real LLM Runtime

目标：接入真实模型并完成结构化响应。

交付：

- model factory
- `createAgent` runtime
- prompt builder v1
- response parser v1
- timeout wrapper

## Phase 4 — Hardening

目标：把 Demo 稳定性做出来。

交付：

- fallback catalog
- observability
- integration tests
- prompt tuning
- invalid output hardening

---

## 24. 执行任务拆分（可直接进开发）

## 24.1 协议层

1. 定义 `AgentTaskType`、`PageContext`、`Timeframe`
2. 定义 `AgentRequest` zod schema
3. 定义 `AgentResponseEnvelope` zod schema
4. 定义 `ChartTokenId` schema
5. 定义 `LlmRawAgentOutput` schema

## 24.2 Context 层

6. 实现 `selectWindowByTask()`
7. 实现 `extractVisibleMetricsForTab()`
8. 实现 `buildAgentContext()`
9. 实现 `sanitizeContextForPrompt()`
10. 实现 `detectMissingFields()`

## 24.3 Memory 层

11. 实现 `SessionMemoryStore`
12. 实现 `AnalyticalMemoryStore`
13. 实现 `clearMemoryOnProfileSwitch()`
14. 实现 `trimConversationTurns()`
15. 实现 `evictExpiredSessions()`

## 24.4 Rules 层

16. 实现 `computeStatusColor()`
17. 实现 `detectSleepSignals()`
18. 实现 `detectHeartRateSignals()`
19. 实现 `detectHrvSignals()`
20. 实现 `detectActivitySignals()`
21. 实现 `detectStressSignals()`
22. 实现 `detectEventAssociations()`
23. 实现 `buildRuleSummary()`
24. 实现 `isLowDataWindow()`

## 24.5 Prompt 层

25. 编写 `systemPrompt`
26. 编写 `homepageBriefPrompt`
27. 编写 `viewSummaryPrompt`
28. 编写 `advisorChatPrompt`
29. 编写 `microInsightPrompt`
30. 实现 `buildPromptInput()`

## 24.6 Executor 层

31. 实现 `createModelFromEnv()`
32. 实现 `createHealthAgent()`
33. 实现 `executeAgentOnce()`
34. 实现 `withTotalTimeout()`
35. 实现 provider error normalization

## 24.7 Parser / Fallback 层

36. 实现 `parseRawOutput()`
37. 实现 `normalizeChartTokens()`
38. 实现 `validateChartTokens()`
39. 实现 `cleanSummary()`
40. 实现 `normalizeAgentResponseEnvelope()`
41. 实现 `buildRuleBasedFallback()`
42. 实现 `buildPresetFallback()`
43. 实现 `fallbackEngine()`

## 24.8 Service / Integration 层

44. 实现 `HealthAdvisorAgentService.executeAgent()`
45. 接入 sandbox merged snapshot
46. 接入 request logging
47. 接入 memory write-back
48. 接入 profile switch invalidation hook

## 24.9 测试层

50. 编写 context builder 单测
51. 编写 rule engine 单测
52. 编写 parser 单测
53. 编写 fallback 单测
54. 编写 service 集成测试
55. 编写 timeout 场景测试

---

## 25. 建议的首版完成定义（Definition of Done）

Agent 子模块首版可以视为完成，当且仅当满足：

1. 已有统一 `AgentRequest -> AgentResponseEnvelope` 协议
2. 首页晨报、当前视图总结、AI Chat 三类任务都能走通
3. 输出已严格结构化，不依赖前端文本解析
4. chart token 已白名单化并可校验
5. 6 秒超时一定可 fallback
6. profile 切换和 override 变化会体现在新上下文中
7. session memory 已支持短多轮聊天
8. 单测与核心集成测试通过

---

## 26. 推荐结论

对当前项目而言，Agent 子模块最重要的不是“把 LangChain 用得多花”，而是把它压缩成一个 **可控、稳定、可回退、可观测** 的运行时。

因此首版实现建议坚持以下路线：

- 单 Agent
- 规则先行
- 上下文严格裁剪
- 输出强 schema
- fallback 一定可用
- memory 只做最小短期
- 不做任何会拖慢 Demo 稳定性的复杂编排

这条路线与当前技术架构文档完全一致，也最适合快速进入后续 backend 详细设计阶段。
