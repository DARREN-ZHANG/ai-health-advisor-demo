# AI Health Advisor Web Demo
# Backend 子模块详细技术实现方案

## 1. 文档定位

本文档用于定义 `apps/agent-api` 的详细技术实现方案。

本文档的角色是：

- 以技术架构文档为唯一系统级基线
- 以 PRD 作为交互与业务约束参考
- 将后端应用从“系统级模块”下钻到“可开发、可联调、可测试、可交付”的实现级设计

本文档**不重复展开 Agent 内部推理模块的详细实现**；Agent Runtime 的细节以已完成的 Agent 子模块方案为准。本文档重点说明 Backend 应用如何承载、编排并对外暴露这些能力。

---

## 2. 目标与边界

## 2.1 Backend 的目标

`apps/agent-api` 需要完成以下目标：

1. 作为 Web Demo 的唯一后端应用，对外提供稳定、可预测的 HTTP / SSE 接口
2. 承载单 Agent Runtime，并向前端输出结构化响应
3. 作为沙盒数据与运行时 override 的统一访问入口
4. 支撑 Homepage、Data Center、AI Advisor、God-Mode 的所有后端交互
5. 在 6 秒超时、Provider 异常、输出非法、数据不足时可靠 fallback
6. 提供最小可观测性、错误追踪与联调能力

## 2.2 Backend 的范围内职责

Backend 负责：

- Fastify 应用启动与插件注册
- 路由定义与请求校验
- Profile / Sandbox 数据读取
- Runtime overrides 管理
- Agent 请求编排与超时控制
- 规则引擎、fallback、response parser 的接入
- Session 级短期记忆托管
- God-Mode 运行时控制
- 统一响应协议、统一错误协议
- 后端日志、Sentry、基础 metrics

## 2.3 Backend 的范围外职责

Backend 不负责：

- 页面渲染与 UI 状态管理
- 图表具体布局与视觉呈现
- 数据库持久化
- Redis、消息队列、任务系统
- 多 Agent 编排
- 原生 LangGraph 显式状态图
- 长期用户记忆
- 医疗诊断级规则或合规判断

---

## 3. 设计原则

1. **后端是唯一可信编排层**  
   所有 LLM 访问、context 组装、fallback、chart token 校验都必须在后端完成。

2. **前端只消费结构，不消费隐式语义**  
   后端必须输出可直接映射为页面 / 卡片 / 消息的结构化数据。

3. **运行时状态只存在内存中**  
   当前阶段不引入数据库，不做跨进程一致性，不追求重启后恢复。

4. **模块单向依赖**  
   `apps/agent-api` 依赖 `packages/shared`、`packages/sandbox`、`packages/agent-core`，但不得反向渗透业务逻辑到 shared 层。

5. **先确定性，后生成式**  
   能由 schema、规则引擎、token 白名单、fallback 模板保证的能力，不交给模型“猜”。

6. **Demo 优先稳定性**  
   所有接口设计优先联调稳定、演示抗翻车、排障清晰，而非通用平台化抽象。

---

## 4. Backend 在总体架构中的位置

```text
apps/web
  ├─ 调用只读数据接口（profile / timeline / charts）
  ├─ 调用 AI 接口（morning-brief / view-summary / chat）
  └─ 调用 God-Mode 接口（switch / inject / override / reset）

apps/agent-api
  ├─ Fastify app / plugins / routes
  ├─ Application services
  ├─ Runtime state containers
  ├─ packages/sandbox
  ├─ packages/agent-core
  ├─ packages/shared
  └─ data/*
```

Backend 不是“薄代理层”，而是：

- Web 与 Agent Runtime 之间的编排层
- Web 与 JSON sandbox 之间的统一访问层
- Demo 运行时状态的唯一维护层

---

## 5. 与 Monorepo 其他包的依赖边界

## 5.1 允许依赖

### `packages/shared`

用于放置：

- 前后端共享 TypeScript types
- Zod schemas
- 枚举与常量
- API request / response 协议
- chart token 定义
- error code 定义

### `packages/sandbox`

用于放置：

- sandbox JSON 读取
- profile 查询
- baseline / dailyRecords 访问工具
- override merge 逻辑
- timeline / date-window selector
- 缺失数据保留语义的 helper

### `packages/agent-core`

用于放置：

- Agent Runtime 初始化
- Context builder
- Memory manager
- Rule engine
- Prompt builder
- Response parser
- Fallback engine
- Provider adapter

## 5.2 不允许依赖方向

- `packages/shared` 不得依赖 `apps/agent-api`
- `packages/sandbox` 不得依赖 `apps/agent-api`
- `packages/agent-core` 不得依赖 Fastify 实例本身
- `apps/web` 不得直接读取 `data/sandbox/*`
- `apps/web` 不得直接调用 LLM Provider

## 5.3 Backend 自身保留内容

以下内容必须保留在 `apps/agent-api`：

- Fastify bootstrap
- route handlers
- plugin 注册
- request lifecycle hook
- auth-less demo session strategy
- SSE 输出适配
- app-level runtime registry
- observability wiring
- DI / service assembly

---

## 6. Backend 应用目录设计

建议目录：

```text
apps/agent-api/
├── src/
│   ├── app.ts
│   ├── server.ts
│   ├── env/
│   │   ├── env.schema.ts
│   │   └── load-env.ts
│   ├── plugins/
│   │   ├── request-context.ts
│   │   ├── sentry.ts
│   │   ├── error-handler.ts
│   │   ├── metrics.ts
│   │   ├── cors.ts
│   │   └── sse.ts
│   ├── lib/
│   │   ├── logger.ts
│   │   ├── timers.ts
│   │   ├── ids.ts
│   │   ├── http-response.ts
│   │   └── fastify-augments.ts
│   ├── runtime/
│   │   ├── runtime-registry.ts
│   │   ├── session-store.ts
│   │   ├── override-store.ts
│   │   ├── profile-state.ts
│   │   └── scenario-registry.ts
│   ├── modules/
│   │   ├── health/
│   │   │   └── health.routes.ts
│   │   ├── profiles/
│   │   │   ├── profiles.routes.ts
│   │   │   ├── profiles.controller.ts
│   │   │   └── profiles.service.ts
│   │   ├── data-center/
│   │   │   ├── data-center.routes.ts
│   │   │   ├── data-center.controller.ts
│   │   │   └── data-center.service.ts
│   │   ├── ai/
│   │   │   ├── ai.routes.ts
│   │   │   ├── ai.controller.ts
│   │   │   ├── ai.service.ts
│   │   │   ├── ai.orchestrator.ts
│   │   │   └── ai.streamer.ts
│   │   └── god-mode/
│   │       ├── god-mode.routes.ts
│   │       ├── god-mode.controller.ts
│   │       └── god-mode.service.ts
│   ├── assemblers/
│   │   ├── profile.vm.ts
│   │   ├── chart-data.vm.ts
│   │   ├── ai-response.vm.ts
│   │   └── god-mode.vm.ts
│   └── tests/
│       ├── integration/
│       └── contract/
├── package.json
└── tsconfig.json
```

说明：

- `runtime/` 负责内存态运行时对象，不与 Fastify 路由强耦合
- `modules/` 负责按业务能力切分路由与 service
- `assemblers/` 专门做“领域数据 -> 前端协议”的映射，避免 controller 内部直接拼对象

---

## 7. Backend 分层设计

## 7.1 Layer 1：Transport Layer

职责：

- 接收 HTTP / SSE 请求
- 做 schema 校验
- 绑定 request context
- 调用 application service
- 输出统一 HTTP 响应 / 错误响应

对应文件：

- `*.routes.ts`
- `*.controller.ts`
- Fastify plugins / hooks

## 7.2 Layer 2：Application Layer

职责：

- 编排一次完整用例
- 协调 sandbox、agent-core、runtime store
- 做 timeout、fallback、日志与 metrics 标记
- 返回可序列化结果

对应文件：

- `profiles.service.ts`
- `data-center.service.ts`
- `ai.service.ts`
- `god-mode.service.ts`
- `ai.orchestrator.ts`

## 7.3 Layer 3：Domain Utilities Layer

职责：

- 不关心 Fastify
- 提供可复用的纯逻辑能力
- 负责 merge、derive、normalize、guard、select

来源：

- `packages/sandbox`
- `packages/agent-core`
- `packages/shared`

## 7.4 Layer 4：Runtime State Layer

职责：

- 保存 demo 运行中的内存态状态
- 管理 session memory / profile state / overrides / scenario 快照

对应文件：

- `session-store.ts`
- `override-store.ts`
- `profile-state.ts`
- `scenario-registry.ts`

---

## 8. 运行时状态设计

由于当前阶段不使用数据库或 Redis，后端的所有可变状态均为进程内状态。

## 8.1 状态分类

### A. Immutable Data

- `data/sandbox/*.json`
- `data/fallback/*.json`
- `data/prompts/*.md`

启动后可缓存到内存。

### B. Mutable Runtime State

- 当前 session 的 profile 选择
- session 对话记忆
- runtime overrides
- 注入事件
- 演示场景快照

## 8.2 核心运行时对象

### `SessionStore`

维护：

```ts
interface SessionState {
  sessionId: string;
  currentProfileId: string;
  messageHistory: ChatTurn[];
  analyticalMemory: {
    latestHomepageBrief?: string;
    latestViewSummaryByScope?: Record<string, string>;
    latestRuleSummary?: string;
  };
  lastAccessAt: number;
}
```

策略：

- LRU 或按 `lastAccessAt` 清理
- 单 session 只保留最近 6 轮消息（即最多 12 条 user/assistant 消息），与 Agent 侧 `MAX_TURNS` 一致
- Analytical memory 只保留最新结果

### `OverrideStore`

维护：

```ts
interface ProfileOverrideState {
  profileId: string;
  metricOverridesByDate: Record<string, MetricOverridePatch>;
  injectedEventsByDate: Record<string, string[]>;
  updatedAt: number;
}
```

策略：

- override 永远不回写 sandbox 文件
- 合并发生在读路径
- reset 时直接丢弃 profile 对应 override

### `ScenarioRegistry`

维护预定义 demo 场景：

```ts
interface DemoScenario {
  scenarioId: string;
  profileId: string;
  description: string;
  eventPatches: Array<{ date: string; events: string[] }>;
  metricPatches: Array<{ date: string; patch: MetricOverridePatch }>;
}
```

用途：

- 一键恢复投资人 demo 场景
- 让 God-Mode 不需要人工逐条输入复杂 patch

## 8.3 多用户与会话策略

当前阶段建议：

- 使用无鉴权 demo session 模式
- sessionId 由后端统一解析与签发
- 如前端已持有 sessionId，则透传 `x-session-id`
- 不做真正用户登录，不绑定真实身份

优先级：

1. 请求头 `x-session-id`
2. Cookie `ha_demo_session`
3. 后端新生成并回写

补充约束：

- 前端不得本地生成 `sessionId`
- 若后端解析或创建了 session，所有成功响应都应在 `ApiSuccess.meta.sessionId` 中返回规范化后的 `sessionId`
- `sessionStorage` 只允许缓存后端已签发的 `sessionId`，不能作为 session 真相来源

---

## 9. API 设计总览

建议统一前缀：`/api/v1`

```text
GET    /api/v1/health
GET    /api/v1/profiles
GET    /api/v1/profiles/:profileId
GET    /api/v1/profiles/:profileId/timeline
GET    /api/v1/profiles/:profileId/charts/:chartToken
POST   /api/v1/ai/morning-brief
POST   /api/v1/ai/view-summary
POST   /api/v1/ai/chat
POST   /api/v1/ai/chat/stream
GET    /api/v1/god-mode/state
POST   /api/v1/god-mode/profile/switch
POST   /api/v1/god-mode/events/inject
POST   /api/v1/god-mode/metrics/override
POST   /api/v1/god-mode/scenario/apply
POST   /api/v1/god-mode/demo-script/run
POST   /api/v1/god-mode/reset
```

说明：

- `GET /profiles/:id/charts/:chartToken` 用于给前端获取 token 对应的结构化图表 payload，不让前端自行推导复杂数据选择逻辑
- SSE 为按需启用，不作为 MVP 唯一路径
- 所有写操作仅 God-Mode 可用，并受 `ENABLE_GOD_MODE` 控制

---

## 10. 统一协议设计

从本节开始出现的 interface 都视为 `packages/shared` 中正式定义的摘录。`apps/agent-api` 代码实现必须直接 import shared types / zod schema，不允许在 route 或 service 文件内再定义一份近似 DTO。

## 10.1 成功响应协议

```ts
interface ApiSuccess<T> {
  ok: true;
  requestId: string;
  data: T;
  meta?: {
    sessionId?: string;
    latencyMs?: number;
    fallbackTriggered?: boolean;
  };
}
```

## 10.2 错误响应协议

```ts
interface ApiError {
  ok: false;
  requestId: string;
  error: {
    code:
      | 'BAD_REQUEST'
      | 'NOT_FOUND'
      | 'VALIDATION_ERROR'
      | 'AI_TIMEOUT'
      | 'PROVIDER_ERROR'
      | 'OUTPUT_INVALID'
      | 'DATA_INSUFFICIENT'
      | 'GOD_MODE_DISABLED'
      | 'INTERNAL_ERROR';
    message: string;
    details?: unknown;
  };
}
```

## 10.3 AI 响应协议

后端对前端的 AI 结果统一输出：

```ts
interface AgentResponseEnvelope {
  source: 'llm' | 'fallback' | 'rule';
  statusColor: 'green' | 'yellow' | 'red';
  summary: string;
  chartTokens?: ChartTokenId[];
  microTips?: string[];
  meta: {
    requestId: string;
    sessionId: string;
    profileId: string;
    pageContext: 'homepage' | 'data_center' | 'ai_advisor';
    taskType:
      | 'homepage_brief'
      | 'view_summary'
      | 'advisor_chat'
      | 'micro_insight';
    promptVersion: string;
    provider?: string;
    model?: string;
    latencyMs: number;
    fallbackTriggered: boolean;
    finishReason?:
      | 'stop'
      | 'timeout'
      | 'provider_error'
      | 'invalid_output'
      | 'low_data';
  };
}
```

这一定义必须放在 `packages/shared`，由前后端共同使用。

AI 相关 HTTP 路由的正式响应体为 `ApiSuccess<AgentResponseEnvelope>`；前端服务层负责先解包 `data`，再把 `AgentResponseEnvelope` 投影到 UI 消息模型。

---

## 11. 路由与用例详细设计

## 11.1 Health 模块

### `GET /api/v1/health`

用途：

- 健康检查
- 前端 / 部署平台探活
- 展示当前 provider 配置是否完整

正式 shared DTO：

```ts
interface HealthResponse {
  status: 'ok';
  app: 'agent-api';
  env: 'development' | 'production' | 'test';
  godModeEnabled: boolean;
  aiEnabled: boolean;
  provider?: string;
  model?: string;
}
```

---

## 11.2 Profiles 模块

### `GET /api/v1/profiles`

用途：

- 提供所有可演示 profile 列表
- 给 God-Mode 与页面初始化使用

仅返回轻量摘要，不返回全量 daily records。

```ts
interface ProfileListItem {
  profileId: string;
  name: string;
  age: number;
  tags: string[];
  availableDateRange: {
    start: string;
    end: string;
  };
  currentStatusColor?: 'green' | 'yellow' | 'red';
}
```

### `GET /api/v1/profiles/:profileId`

用途：

- 获取单 profile 基本资料
- 获取当前已合并 override 的摘要状态

正式 shared DTO：

```ts
interface CurrentProfileResponse {
  profileId: string;
  basicInfo: {
    name: string;
    age: number;
    tags: string[];
  };
  baselines: {
    restingHR: number;
    hrv: number;
  };
  availableDateRange: {
    start: string;
    end: string;
  };
  currentStatusColor?: 'green' | 'yellow' | 'red';
  currentRuntimeFlags: {
    hasMetricOverrides: boolean;
    hasInjectedEvents: boolean;
    activeScenarioId?: DemoScenarioId;
  };
  activeInjectedEvents: Array<{
    date: string;
    events: string[];
  }>;
}
```

该接口正式返回 `ApiSuccess<CurrentProfileResponse>`。

Homepage 读侧组合规则固定为：

- `GET /api/v1/profiles/:profileId` 读取 profile 基础信息与运行态摘要
- `GET /api/v1/profiles/:profileId/timeline` 读取首页历史趋势卡片需要的数据窗口
- `POST /api/v1/ai/morning-brief` 读取首页 AI 晨报

不再定义单独的 `/homepage` 聚合接口，也不再定义 `HomepageDataResponse` 私有协议。

### `GET /api/v1/profiles/:profileId/timeline`

用途：

- Data Center 获取指定时间范围的数据
- Homepage 获取最近 7/14 天卡片数据
- chart token 数据源复用

正式 query contract：

- `tab`: `overview | sleep | heart_rate | activity | stress | vitals`
- `rangeType`: `day | week | month | year | custom`
- `startDate`
- `endDate`

响应返回已规范化的时间窗口数据，不直接回传原始 sandbox 结构。

正式 shared DTO：

```ts
interface TimelineResponse {
  profileId: string;
  tab: 'overview' | 'sleep' | 'heart_rate' | 'activity' | 'stress' | 'vitals';
  range: {
    startDate: string;
    endDate: string;
    rangeType: 'day' | 'week' | 'month' | 'year' | 'custom';
  };
  summaryStats: Record<string, string | number | null>;
  points: Array<Record<string, string | number | null>>;
  annotations: Array<{
    date: string;
    type: 'event' | 'anomaly' | 'baseline';
    label: string;
  }>;
}
```

其中 `stress` tab 必须收口为固定 view model，而不是占位页：

```ts
interface StressTimelineResponse extends TimelineResponse {
  tab: 'stress';
  summaryStats: {
    avgStressLoadScore: number | null;
    peakStressLoadScore: number | null;
    highStressDays: number;
    strongestContributor:
      | 'hrv'
      | 'resting_hr'
      | 'sleep_duration'
      | 'deep_sleep'
      | null;
  };
  points: Array<{
    date: string;
    stressLoadScore: number | null;
    level: 'low' | 'medium' | 'high' | null;
    contributors: {
      hrvPenalty: number | null;
      restingHrPenalty: number | null;
      sleepDebtPenalty: number | null;
      deepSleepPenalty: number | null;
    };
    supportingEvents: string[];
  }>;
}
```

推导规则与 shared 协议保持一致：

- `stress` 为 derived proxy，不新增 raw sandbox 字段，不宣称医学压力诊断
- `hrvPenalty = clamp01((baseline.hrv - vitals.hrv.avgMs) / baseline.hrv)`
- `restingHrPenalty = clamp01((vitals.heartRate.minBpm - baseline.restingHR) / baseline.restingHR)`
- `sleepDebtPenalty = clamp01((rollingMedian14d(timeAsleepMin) - sleep.timeAsleepMin) / rollingMedian14d(timeAsleepMin))`
- `deepSleepPenalty = clamp01((rollingMedian14d(deepSleepMin) - sleep.stages.deepSleepMin) / rollingMedian14d(deepSleepMin))`
- `stressLoadScore = round(100 * mean(all available penalties))`
- 若可用 penalty 少于 2 项，则该日返回 `stressLoadScore = null`，前端以断点展示
- `events` 只作为 `supportingEvents` 注释，不参与打分

### `GET /api/v1/profiles/:profileId/charts/:chartToken`

用途：

- 返回 chart token 对应的结构化图表 payload
- 图表数据选窗、聚合与注释构造逻辑由后端统一维护

好处：

- 避免前端自己解析 token 后重复实现数据选择规则
- chart token 只是一种“被授权的数据视图标识”
- `chartToken` 必须来自 shared 中冻结的 `ChartTokenId` 白名单

正式 query contract：

```ts
interface GetChartPayloadQuery {
  mode: 'dashboard-card' | 'detail-chart' | 'chat-inline' | 'compact-pill';
  pageContext?: 'homepage' | 'data_center' | 'ai_advisor';
  tab?: 'overview' | 'sleep' | 'heart_rate' | 'activity' | 'stress' | 'vitals';
  rangeType?: 'day' | 'week' | 'month' | 'year' | 'custom';
  startDate?: string;
  endDate?: string;
}
```

正式返回 shared 中冻结的 `ChartRenderPayload`：

- `chartToken`
- `mode`
- `range`
- `series`
- `annotations`
- `summaryStats?`

后端负责把 token 变成结构化图表数据；前端与 `packages/charts` 只负责把该 payload 渲染成 ECharts。

---

## 11.3 AI 模块

AI 模块是 Backend 的核心。

### `POST /api/v1/ai/morning-brief`

对应页面：Homepage

正式 request DTO：

```ts
interface MorningBriefRequest {
  profileId: string;
  date?: string;
  viewport?: 'mobile' | 'tablet' | 'desktop';
}
```

后端流程：

1. 读取 session
2. 确定当前 profile
3. 取最近 14 天窗口数据并合并 runtime overrides
4. 调用 Agent Runtime 的 `homepage_brief` task，传入完整窗口数据
5. Agent Context Builder 负责窗口裁剪与缺失字段标记；若当天或窗口内数据缺失，保留原窗口并显式传递缺失语义，不静默平移到另一段“最近有数据”的窗口
6. 后端不做二次窗口选择，由 Agent 统一负责
7. 解析结构化输出
8. 输出 `AgentResponseEnvelope`
9. 将结果写入 analytical memory

约束：

- 文本长度目标 80-120 字
- 输出需适配首页晨报卡片
- 允许带少量 micro tips
- 不必默认带 chart token

### `POST /api/v1/ai/view-summary`

对应页面：Data Center

正式 request DTO：

```ts
interface ViewSummaryRequest {
  profileId: string;
  tab: 'overview' | 'sleep' | 'heart_rate' | 'activity' | 'stress' | 'vitals';
  rangeType: 'day' | 'week' | 'month' | 'year' | 'custom';
  startDate?: string;
  endDate?: string;
}
```

后端流程：

1. 根据 tab + range 选择数据窗口
2. 提取 summary stats 和异常点
3. 运行规则引擎
4. 调用 Agent Runtime 的 `view_summary` task
5. 校验 chart token 是否与当前 tab / range 合法对应
6. 返回结构化总结

### `POST /api/v1/ai/chat`

对应页面：AI Advisor

正式 request DTO：

```ts
interface ChatRequest {
  profileId: string;
  userMessage: string;
  pageContext?: 'homepage' | 'data_center' | 'ai_advisor';
  tab?: 'overview' | 'sleep' | 'heart_rate' | 'activity' | 'stress' | 'vitals';
  rangeType?: 'day' | 'week' | 'month' | 'year' | 'custom';
  startDate?: string;
  endDate?: string;
  smartPromptId?: string;
  visibleChartIds?: string[];
}
```

后端流程：

1. 读取 session message history
2. 组装当前问题的页面上下文
3. 读取必要数据窗口（默认最近 14 天，可根据问题扩展）
4. 运行 rule engine
5. 调用 Agent Runtime 的 `advisor_chat` task
6. 解析结构化输出
7. 写回 session memory
8. 返回结构化响应

注意：

- 不允许前端把整个历史记录作为可信上下文直接上传；最终 memory 以服务端 session state 为准
- 如用户当前在 Data Center，前端只传”当前筛选条件”，具体上下文展开由后端决定
- Backend 在组装 `AgentRequest` 时需将 HTTP DTO 映射为 Agent 内部模型，关键映射规则：
  - `MorningBriefRequest.viewport` -> `AgentRequest.viewportHints`：`mobile -> { device: 'mobile', density: 'compact' }`，`tablet -> { device: 'tablet', density: 'regular' }`，`desktop -> { device: 'desktop', density: 'regular' }`
  - `ViewSummaryRequest.tab + rangeType + startDate/endDate` -> `AgentRequest.tab + timeframe + dateRange`
  - `ChatRequest.tab + rangeType + startDate/endDate` -> `AgentRequest.tab + timeframe + dateRange`

### `POST /api/v1/ai/chat/stream`

说明：

- 该接口为 SSE 版本
- 当前阶段建议作为可选实现
- 若实现，则输出事件必须稳定且易于前端消费

事件建议：

```text
event: meta
event: partial
event: final
event: error
```

但注意：

- 即使流式输出，最终仍需生成完整结构化结果
- 若结构化解析只能在最终完成，则中间 partial 仅作为 UI 体验增强，不作为可信结构数据源

---

## 11.4 God-Mode 模块

所有 God-Mode 接口必须受 `ENABLE_GOD_MODE` 控制。

### `GET /api/v1/god-mode/state`

正式返回 DTO：

```ts
interface GodModeStateResponse {
  sessionId: string;
  currentProfileId?: string;
  activeScenarioId?: DemoScenarioId;
  activeSensing: ActiveSensingState | null;
  eventInjectionsByDate: Record<string, string[]>;
  metricOverridesByDate: Record<string, MetricOverridePatch>;
}
```

该接口正式返回 `ApiSuccess<GodModeStateResponse>`。

### `POST /api/v1/god-mode/profile/switch`

请求：

```ts
interface SwitchProfileRequest {
  profileId: string;
}
```

行为：

- 更新当前 session 的 `currentProfileId`
- 保留 `sessionId` 作为浏览器会话标识，不强制生成新 session
- 必须原子清空该 `sessionId` 在旧 profile 下的 session memory 与 analytical memory
- 任何后续 `advisor_chat` 读取到 `memory.profileId !== currentProfileId` 时，也必须执行硬失效而不是继续拼接旧历史
- 不强制页面跳转；前端根据返回刷新 UI

响应：

- 返回 `ApiSuccess<GodModeStateResponse>`

### `POST /api/v1/god-mode/events/inject`

请求：

```ts
interface InjectEventsRequest {
  profileId: string;
  date: string;
  events: string[];
  priority?: 'normal' | 'high';
  surface?: 'banner' | 'data-only';
}
```

行为：

- 写入 override store
- 返回最新 active sensing 建议状态
- 用于触发首页顶部横幅或全局横幅

响应：

- 返回 `ApiSuccess<GodModeStateResponse>`

### `POST /api/v1/god-mode/metrics/override`

请求：

```ts
interface MetricOverrideRequest {
  profileId: string;
  date: string;
  patch: MetricOverridePatch;
}
```

行为：

- 只允许 `MetricOverridePatch` 中冻结的白名单字段
- 禁止 patch 破坏 schema 完整性
- 更新后返回 recalculated snapshot

响应：

- 返回 `ApiSuccess<GodModeStateResponse>`

### `POST /api/v1/god-mode/scenario/apply`

正式 request DTO：

```ts
interface ApplyScenarioRequest {
  profileId: string;
  scenarioId: DemoScenarioId;
}
```

用途：

- 一键应用预置剧情
- 减少 demo 现场手工操作成本

响应：

- 返回 `ApiSuccess<GodModeStateResponse>`

### `POST /api/v1/god-mode/demo-script/run`

请求：

```ts
interface RunDemoScriptRequest {
  scriptId: string;
  profileId?: string;
}
```

```ts
interface DemoScriptRunResponse {
  state: GodModeStateResponse;
  executedSteps: Array<{
    type: 'profile_switch' | 'scenario_apply' | 'event_inject' | 'metric_override' | 'reset';
    ok: boolean;
    summary: string;
  }>;
}
```

行为：

- 服务端按受控脚本定义顺序执行 profile switch / scenario / event inject / metric override / reset
- 所有步骤复用同一个 `sessionId` 与 runtime store
- 返回最终 runtime state 与已执行步骤摘要
- 前端不得本地拼装脚本效果，只负责触发与展示结果

Demo Script 数据格式建议：

```json
{
  "scriptId": "investor_demo_01",
  "description": "投资人演示主流程",
  "steps": [
    { "type": "profile_switch", "profileId": "profile-athlete" },
    { "type": "event_inject", "profileId": "profile-athlete", "date": "2026-03-15", "events": ["高强度有氧"], "priority": "high", "surface": "banner" },
    { "type": "metric_override", "profileId": "profile-athlete", "date": "2026-03-15", "patch": { "vitals": { "hrv": { "avgMs": 25 } } } },
    { "type": "scenario_apply", "profileId": "profile-athlete", "scenarioId": "simulate_high_stress" },
    { "type": "reset", "mode": "session-all" }
  ]
}
```

建议存放位置：`data/sandbox/demo-scripts/`，每个脚本独立文件。

响应：

- 返回 `ApiSuccess<DemoScriptRunResponse>`

### `POST /api/v1/god-mode/reset`

请求：

```ts
interface ResetRequest {
  profileId?: string;
  mode: 'profile-only' | 'session-all';
}
```

行为：

- `profile-only`：清空指定 profile 的 override
- `session-all`：清空 session 的 profile 绑定、analytical memory、history、所有 override 关联状态

响应：

- 返回 `ApiSuccess<GodModeStateResponse>`

---

## 12. Backend 与 Agent 子模块的集成设计

Backend 不直接拼 prompt，不直接解析自由文本，而是通过 `packages/agent-core` 暴露的 facade 调用 Agent 能力。

建议暴露统一接口：

```ts
interface AgentRuntimeFacade {
  executeAgent(request: AgentRequest): Promise<AgentResponseEnvelope>;
}
```

Backend 只负责：

- 把 HTTP request 转成 `AgentRequest`
- 管理 request context、session store、override store 与 runtime 生命周期
- 为 agent-core 注入 sandbox selector / memory store / telemetry adapter
- 附加 timeout / telemetry / fallback 语义

Agent 侧负责：

- 通过注入的 adapter 读取 merged sandbox snapshot
- context build
- prompt build
- provider invoke
- response parse
- fallback resolve

### 12.1 Backend 侧 orchestrator 的职责

`ai.orchestrator.ts` 需要：

1. 建立 timeout 取消边界
2. 捕获 provider / parser / rule error
3. 将失败路径统一转换为 fallback reason
4. 为 logs / metrics 生成结构化事件
5. 更新 session analytical memory

### 12.2 建议的调用顺序

```text
Controller
  -> AIService
    -> AIOrchestrator
      -> SessionStore.get()
      -> Sandbox selectors / merge overrides
      -> AgentRuntimeFacade.runXxx()
      -> SessionStore.update()
      -> Assembler.toApiResponse()
```

---

## 13. 请求上下文与 Fastify Hook 设计

## 13.1 Request Context

每个请求都应生成并挂载：

```ts
interface RequestContext {
  requestId: string;
  sessionId: string;
  route: string;
  startAt: number;
  profileId?: string;
}
```

用途：

- 日志关联
- 错误追踪关联
- metrics 打点
- API 响应透传 `requestId`

## 13.2 建议 Hook

### `onRequest`

- 生成 / 读取 requestId
- 生成 / 读取 sessionId
- 绑定 logger child context

### `preValidation`

- Zod schema 校验前的基础 guard
- 判断 God-Mode 是否启用

### `preHandler`

- 把 profileId 写入 request context
- 可选做 lightweight session touch

### `onSend`

- 附加 requestId header
- 记录 latency

### `onError`

- 统一结构化错误日志
- 上报 Sentry

---

## 14. 配置与环境变量设计

## 14.1 必要环境变量

```bash
PORT=3001
NODE_ENV=development
LLM_PROVIDER=openai
LLM_MODEL=gpt-4.1-mini
LLM_API_KEY=***
AI_TIMEOUT_MS=6000
ENABLE_GOD_MODE=true
SENTRY_DSN=***
LOG_LEVEL=info
```

## 14.2 可选环境变量

```bash
FALLBACK_ONLY_MODE=false
MAX_SESSION_TURNS=6
MAX_SESSION_COUNT=200
ENABLE_SSE=false
CORS_ORIGIN=http://localhost:3000
```

## 14.3 Env 策略

- 启动时一次性校验
- 缺少关键变量时直接 fail fast
- `ENABLE_GOD_MODE=false` 时不注册 God-Mode 写接口，或返回 403
- `FALLBACK_ONLY_MODE=true` 时跳过 Provider 调用，直接走 fallback

---

## 15. Timeout、取消与 Fallback 设计

## 15.1 Timeout 策略

统一以后端为准：

- 后端默认 `AI_TIMEOUT_MS = 6000`
- 前端也应采用 6 秒边界，但该边界只用于结束本地等待态与展示 timeout UI，不构成第二套正式 fallback 判定
- 最终以“后端是否已生成可用结构化响应”为准；正式 fallback 仍以后端返回的结构化内容为唯一结果来源

## 15.2 推荐实现

- 使用 `AbortController`
- Provider 调用、流式调用、内部慢操作都应能响应取消
- 超时后不再等待模型结果回流，不做“晚到结果覆盖”

## 15.3 Fallback 决策矩阵

### 场景 1：AI Timeout

- 返回 `source: 'fallback'`
- `fallbackTriggered: true`
- `finishReason: 'timeout'`
- 使用场景模板或规则结果

### 场景 2：Provider Error

- 返回 `source: 'fallback'`
- `fallbackTriggered: true`
- `finishReason: 'provider_error'`

### 场景 3：Output Invalid

- 返回 `source: 'fallback'`
- `fallbackTriggered: true`
- `finishReason: 'invalid_output'`

### 场景 4：Data Insufficient

- 优先返回 `source: 'rule'` 或 `source: 'fallback'`
- `finishReason: 'low_data'`
- 明确提示“基于现有数据”而非编造

## 15.4 Fallback 模板分层

建议按任务分开：

```text
data/fallback/
├── homepage-brief/
├── view-summary/
└── advisor-chat/
```

每类再按 `green / yellow / red / insufficient / timeout` 区分。

---

## 16. Chart Token 后端策略

正式 chart token 线缆协议已经冻结为 `chartTokens: ChartTokenId[]`。前端不能依赖自由文本脆弱解析，Backend 也不应再制造第二套 token 表示。

## 16.1 允许的 token 来源

- Agent 输出的受控 token
- Rule engine 生成的受控 token
- Fallback 模板中内置的受控 token

## 16.2 Backend 必须完成的工作

1. 接收 Agent Runtime 已收口的 `chartTokens[]`
2. 用 shared 白名单校验 token 是否合法
3. 校验 token 与当前 taskType / tab / window 是否匹配
4. 确保返回给前端的 `summary` 中不残留协议串

也就是说，前端最终不应再从自由文本里扫描 `[CHART:...]`；它只消费：

```ts
{
  summary: '你过去一周的 HRV 波动较大，建议今晚早睡。',
  chartTokens: ['HRV_7DAYS']
}
```

## 16.3 Token registry 建议

放在 `packages/shared`：

```ts
const CHART_TOKEN_REGISTRY = {
  HRV_7DAYS: { tab: 'vitals', minWindowDays: 7 },
  SLEEP_7DAYS: { tab: 'sleep', minWindowDays: 7 },
  RESTING_HR_7DAYS: { tab: 'heart_rate', minWindowDays: 7 },
  ACTIVITY_7DAYS: { tab: 'activity', minWindowDays: 7 },
  SPO2_7DAYS: { tab: 'vitals', minWindowDays: 7 },
  SLEEP_STAGE_LAST_NIGHT: { tab: 'sleep', minWindowDays: 1 },
  STRESS_LOAD_7DAYS: { tab: 'stress', minWindowDays: 7 },
  HRV_SLEEP_14DAYS_COMPARE: { tab: 'overview', minWindowDays: 14 },
};
```

Backend 在返回 token 时同时验证：

- 当前任务是否允许该 token
- 当前 profile 是否有足够数据
- 当前页面上下文是否合理

---

## 17. 数据读取与组装策略

## 17.1 Sandbox 读取策略

- 启动时加载全部 sandbox JSON 并校验 schema
- 内存缓存 profile map
- 所有查询走 selector，不允许散落式手写数组操作

## 17.2 Override 合并策略

读路径合并顺序：

```text
base sandbox record
  -> apply injected events
  -> apply metric overrides
  -> derive summary fields
```

## 17.3 只读数据接口返回什么

Backend 返回的是：

- 适合页面展示的 normalized shape
- 适合图表的 point array
- 适合 AI 的 selected context window

Backend 不直接向前端透出所有原始 CSV 风格字段，除非该页面明确需要。

## 17.4 异常与缺失语义

- 缺失字段返回 `null`，不擅自补默认值
- annotations 中区分 `missing` 与 `anomaly`
- 对于 SpO2 继续保留字符串形式，但在统计摘要中可额外提供已清洗数值字段给图表使用

---

## 18. Observability 设计

## 18.1 日志字段

每个关键日志事件建议至少包含：

- `requestId`
- `sessionId`
- `route`
- `profileId`
- `provider`
- `model`
- `latencyMs`
- `fallbackTriggered`
- `finishReason`
- `errorCode`

## 18.2 日志事件分类

- `api.request.received`
- `api.request.completed`
- `ai.invoke.started`
- `ai.invoke.completed`
- `ai.invoke.timeout`
- `ai.invoke.failed`
- `godmode.override.applied`
- `godmode.reset.completed`
- `sandbox.profile.loaded`

## 18.3 Metrics 建议

最小指标：

- API request count
- API latency histogram
- AI timeout count
- fallback count
- provider error count
- invalid output count
- active session count

当前阶段可先以 log-based metrics 实现，不强制引入完整 metrics backend。

## 18.4 Sentry 策略

上报：

- 未捕获异常
- provider 调用异常
- parser 异常
- schema mismatch

附加 tags：

- `route`
- `provider`
- `profileId`
- `task`

---

## 19. 错误处理模型

## 19.1 错误分层

### 用户输入错误

例如：

- 非法 profileId
- 非法日期范围
- 非法 chart token

返回 400 / 404。

### 系统可恢复错误

例如：

- AI 超时
- Provider 临时失败
- 输出解析失败

优先返回 200 + `source=fallback` 的可展示结果，而不是把错误直接暴露给前端。

### 系统不可恢复错误

例如：

- sandbox 文件损坏
- 启动时关键依赖缺失
- 关键 assembler 逻辑 crash

返回 500，并记录完整错误。

## 19.2 何时返回 fallback，何时返回 error

### 返回 fallback

- AI 相关接口里的可恢复失败
- 规则可补位的数据不足场景

### 返回 error

- 非 AI 路由的校验失败
- God-Mode 非法 patch
- profile 不存在
- app 自身结构损坏

---

## 20. 安全与输入约束

当前阶段不做正式 auth，但仍应做最低限度保护。

## 20.1 输入白名单

- profileId 必须来自 sandbox profile 列表
- chart token 必须在 registry 中
- override patch 仅允许白名单字段
- events 为字符串数组，长度和单项字符数限制

## 20.2 Prompt / 输出安全边界

- 前端传入的 `userMessage` 必须视为不可信输入
- 后端不可直接把前端 message 原样拼进 system prompt，不做边界区分
- response parser 必须拒绝越权字段、长文本污染、非法 token

## 20.3 Demo 环境保护

- God-Mode 仅在 env 开启时暴露
- 可选增加简单 header guard，例如 `x-demo-admin-key`
- 防止公开环境被任意注入 override

---

## 21. SSE 设计建议

虽然架构文档允许 SSE 按需启用，但当前阶段建议：

- 普通 AI 请求先实现同步 JSON
- SSE 作为增强项单独落地
- 不让首页晨报或 view summary 依赖 SSE

如果实现 SSE，建议规则：

1. 中间 `partial` 事件只用于打字机效果
2. 最终仍以 `final` 事件承载完整结构化结果
3. 发生 timeout / provider error 时发送 `final` fallback，而不是悬空断流

---

## 22. 测试策略

## 22.1 单元测试

Backend 自身新增单元测试范围：

- env schema
- request / response assembler
- session store LRU / trim
- override 白名单校验
- API 参数解析
- fallback reason 映射
- chart token registry guard

## 22.2 集成测试

使用 Fastify inject：

- `GET /profiles` 返回 profile 列表
- `GET /timeline` 在不同 range 下返回规范数据
- `POST /ai/morning-brief` 正常返回结构化响应
- `POST /ai/chat` 超时后返回 fallback
- `POST /god-mode/metrics/override` patch 生效
- `POST /god-mode/demo-script/run` 可重复执行受控脚本
- `POST /god-mode/reset` 状态恢复

## 22.3 契约测试

目的：保证前后端协议不漂移。

建议：

- 所有 request / response schema 由 `packages/shared` 导出
- backend response 通过 schema parse
- web 端 mock fixtures 直接来自 backend contract samples

## 22.4 E2E 支撑要求

Backend 为 Playwright E2E 提供：

- 固定 profile 数据
- 固定 scenario seed
- fallback-only 模式
- 可控 timeout 模式

---

## 23. 实施顺序建议

### Phase 1：App Skeleton

- 搭起 Fastify app
- env 校验
- logger / error handler / request context
- health route

### Phase 2：Read APIs

- profiles 模块
- timeline / charts 只读接口
- sandbox cache + selectors

### Phase 3：Runtime State

- session store
- override store
- scenario registry
- God-Mode state APIs

### Phase 4：AI Integration

- ai.service / orchestrator
- 接入 agent-core facade
- timeout / fallback / parser 打通

### Phase 5：Observability & Hardening

- Sentry
- structured logs
- metrics logs
- contract tests / integration tests

### Phase 6：Optional SSE

- chat stream
- 前端联调

---

## 24. 可执行任务拆分

以下任务按 Backend 子模块交付拆分。

## A. 基础工程

1. 初始化 `apps/agent-api` 目录与 tsconfig
2. 配置 Fastify 启动入口 `server.ts`
3. 实现 `app.ts` 作为测试可复用 app factory
4. 接入 ESLint / Prettier / Vitest
5. 编写 env schema 与启动时校验
6. 封装 logger 工具
7. 实现统一 error handler plugin
8. 实现 request context plugin
9. 实现 CORS plugin
10. 实现 requestId / sessionId 生成工具

## B. 运行时状态

11. 实现 `SessionStore`
12. 实现 `SessionStore` trim / cleanup 机制
13. 实现 profile switch 时的 memory invalidation
14. 实现 `OverrideStore`
15. 实现 override merge adapter
16. 实现 `ScenarioRegistry`
17. 定义 runtime state 类型
18. 编写 runtime state 单元测试

## C. Profiles 与只读数据接口

19. 实现 `GET /health`
20. 实现 `GET /profiles`
21. 实现 `GET /profiles/:profileId`
22. 实现 `GET /profiles/:profileId/timeline`
23. 实现 `GET /profiles/:profileId/charts/:chartToken`
24. 编写 profile / timeline assembler
25. 实现 stress timeline derivation
26. 编写 timeline 参数校验 schema
27. 编写 chart token guard

## D. AI 接口

28. 实现 `ai.service.ts`
29. 实现 `ai.orchestrator.ts`
30. 接入 `AgentRuntimeFacade`
31. 实现 `POST /ai/morning-brief`
32. 实现 `POST /ai/view-summary`
33. 实现 `POST /ai/chat`
34. 实现 AI timeout cancel 机制
35. 实现 finish reason mapping
36. 实现 AI 响应 assembler
37. 写回 session analytical memory
38. 写回 session message history

## E. God-Mode 接口

39. 实现 God-Mode enable guard
40. 实现 `GET /god-mode/state`
41. 实现 `POST /god-mode/profile/switch`
42. 实现 `POST /god-mode/events/inject`
43. 实现 `POST /god-mode/metrics/override`
44. 实现 `POST /god-mode/scenario/apply`
45. 实现 `POST /god-mode/demo-script/run`
46. 实现 `POST /god-mode/reset`
47. 实现 override patch 白名单校验
48. 编写 God-Mode 集成测试

## F. 可观测性

49. 接入 Sentry plugin
50. 增加 API request / completion logs
51. 增加 AI invoke lifecycle logs
52. 增加 fallback / timeout / provider error counters
53. 增加 request latency 记录

## G. 测试与联调

54. 编写 Fastify inject 集成测试骨架
55. 编写 response contract tests
56. 提供 frontend 联调 sample payloads
57. 提供 fallback-only 模式联调方案
58. 提供 timeout 模式联调方案

## H. 可选增强

59. 实现 SSE plugin
60. 实现 `POST /ai/chat/stream`
61. 实现 stream final event contract
62. 编写 SSE 集成测试

---

## 25. 交付完成判定

Backend 子模块完成时，应满足以下判定标准：

1. `apps/agent-api` 可独立启动，并通过 health check
2. 可返回 profile 列表、timeline 数据与 chart token 对应的结构化图表数据
3. AI 三类核心任务可返回结构化响应
4. 6 秒内无法完成时，可稳定返回 fallback
5. God-Mode 可完成 profile 切换、事件注入、指标 override、场景恢复与 demo script 执行
6. 日志中可追踪 requestId、sessionId、profileId、latency、fallback reason
7. 核心接口具备集成测试与契约测试
8. backend 与已完成的 Agent 方案可以无缝拼接

---

## 26. 与下一步 Frontend 设计的接口预告

下一份 Frontend 详细方案需要直接消费本方案中的以下契约：

- `ApiSuccess<T>` / `ApiError`
- `AgentResponseEnvelope`
- profile list / profile detail / timeline / chart token APIs
- God-Mode 写接口
- AI 三类任务接口
- fallback 与 normal response 的统一渲染语义

因此，Frontend 方案必须以本 Backend 方案为接口基线，而不是自行重新设计 API。
