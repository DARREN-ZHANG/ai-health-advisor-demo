# AI Health Advisor 子模块详细技术实现方案（Others）

## 1. 文档定位

本文档用于定义除 **Agent / Backend / Frontend** 三个主体子模块之外，仍然必须落地的其余技术部分的详细实现方案。

本文件覆盖的对象包括：

- Monorepo 工程化与仓库治理
- `packages/shared`
- `packages/sandbox`
- `packages/ui`
- `packages/charts`
- `packages/config`
- `data/sandbox`
- `data/fallback`
- `data/prompts`
- `infra/docker`
- `infra/scripts`
- 测试基建、质量门禁、Demo 运行保障

本文档不重复展开 Agent Runtime、Fastify 应用本体或 Next.js 页面实现细节；这些内容分别以前述三个子模块方案为准。

---

## 2. 设计目标

Others 部分的目标不是增加新业务能力，而是把系统基线中已经明确存在、但不适合归入 agent/backend/frontend 单体文档的基础设施与共享层做成可执行方案。

其交付目标为：

1. 为前后端提供稳定、一致、可复用的共享协议层。
2. 为 Demo 提供可控、可演示、可回放的数据与 fallback 资产。
3. 为图表、多模态 token、共享 UI 与主题能力建立统一复用基座。
4. 为 monorepo 提供明确的依赖边界、脚本体系和开发约束。
5. 为本地开发、联调、fallback-only 演示、容器化部署提供可操作的运行基础。
6. 为测试、验收和 demo 稳定性提供统一工程护栏。

---

## 3. Source of Truth 继承约束

Others 设计必须继承系统级架构中的以下硬约束，不再讨论替代方案：

- 仓库形态固定为 `pnpm workspace + Turborepo`
- 系统采用前后端分离的最小双应用架构
- 前端为 Next.js，后端为 Fastify
- Agent Runtime 位于 Fastify 后端内部
- 数据源固定为 JSON 沙盒 + 内存 overrides
- 图表库固定为 ECharts
- 仅建设后端最小可观测性
- 本阶段不引入数据库、Redis、原生 LangGraph 显式图编排、多 Agent 编排

因此，Others 的职责是把这些既定决策落地为工程规则，而不是继续做架构层 trade-off。

---

## 4. 范围定义

### 4.1 范围内

- workspace 组织、package 命名、依赖规则
- TypeScript 基座与共享 schema
- 沙盒数据读写规范、覆写合并逻辑、演示场景管理
- 共享图表定义、图表 token 注册表、图表 option 生成器
- 共享 UI 原子组件与主题 token
- lint / format / tsconfig / test config 统一配置
- Docker / 脚本 / 环境文件模板 / runbook
- 样例数据、fallback 文案、prompt 模板的文件组织
- 统一测试工具链和 CI 级别质量门禁

### 4.2 范围外

- 页面视觉稿
- Agent prompt 具体文案调优过程
- Fastify 路由内部实现
- Next 页面/feature 组件内部实现
- 真实生产级 secret 管理、集群运维、数据库迁移体系

---

## 5. 仓库级结构与依赖边界

### 5.1 目标目录结构

```text
ai-health-advisor/
├── apps/
│   ├── web/
│   └── agent-api/
├── packages/
│   ├── shared/
│   ├── ui/
│   ├── charts/
│   ├── sandbox/
│   ├── agent-core/
│   └── config/
├── data/
│   ├── sandbox/
│   ├── fallback/
│   └── prompts/
├── infra/
│   ├── docker/
│   └── scripts/
├── package.json
├── pnpm-workspace.yaml
├── turbo.json
└── tsconfig.base.json
```

### 5.2 依赖方向规则

必须遵循单向依赖，避免跨层反向污染：

- `apps/web` 可依赖：`shared`、`ui`、`charts`、`config`
- `apps/agent-api` 可依赖：`shared`、`sandbox`、`agent-core`、`config`
- `packages/charts` 可依赖：`shared`
- `packages/ui` 可依赖：`shared`
- `packages/sandbox` 可依赖：`shared`
- `packages/agent-core` 可依赖：`shared`、`sandbox`
- `packages/shared` 不依赖任何业务包
- `packages/config` 不依赖任何业务包

### 5.3 明确禁止

- `apps/web` 直接依赖 `agent-core`
- `packages/ui` 依赖 `next/*` 或 `fastify/*`
- `packages/shared` 引入 React、Fastify、LangChain
- `packages/charts` 直接读取磁盘上的 sandbox JSON
- `packages/sandbox` 感知页面、路由或 HTTP 语义
- 任何 package 从 `apps/*` 反向引用代码

---

## 6. `packages/shared` 详细设计

`packages/shared` 是前后端共同消费的协议层，只承载 **类型、schema、常量、轻量纯函数**。

### 6.1 子目录结构

```text
packages/shared/
├── src/
│   ├── types/
│   │   ├── sandbox.ts
│   │   ├── agent.ts
│   │   ├── god-mode.ts
│   │   ├── api.ts
│   │   └── chart.ts
│   ├── schemas/
│   │   ├── sandbox.schema.ts
│   │   ├── agent.schema.ts
│   │   ├── god-mode.schema.ts
│   │   ├── api.schema.ts
│   │   └── chart.schema.ts
│   ├── constants/
│   │   ├── status-color.ts
│   │   ├── page-context.ts
│   │   ├── timeframe.ts
│   │   ├── chart-token.ts
│   │   ├── agent-response.ts
│   │   └── env.ts
│   ├── utils/
│   │   ├── date-range.ts
│   │   ├── number-format.ts
│   │   ├── nullability.ts
│   │   └── chart-token.ts
│   └── index.ts
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

### 6.2 主要职责

1. 定义 `SandboxProfile / DailyRecord / ActivityData / SleepData / VitalSignsData`
2. 定义 API DTO、会话承载规则与响应 envelope
3. 定义结构化 Agent 输出 schema
4. 定义 God-Mode request / response schema
5. 定义 chart token schema 与 token 白名单
6. 定义时间范围、页面上下文、状态色等枚举
7. 提供少量纯函数工具，但不得带副作用

### 6.3 关键对象

#### Sandbox 协议

与 PRD 的数据沙盒协议完全对齐，尤其是：

- `dailyRecords` 连续记录
- `events` 可被注入
- `spo2` 允许保留字符串格式
- 缺失值显式表达，不做隐式补齐

命名约束：

- PRD 定义的 `SandboxProfile.userId` 是沙盒数据内部唯一标识符
- 在所有 API DTO（request / response）中，统一使用 `profileId: string` 表达同一标识符
- `profileId` 在运行时等价于 `SandboxProfile.userId`，不做二次映射或转换

#### Agent Response 协议

统一定义：

```ts
type AgentTaskType =
  | 'homepage_brief'
  | 'view_summary'
  | 'advisor_chat'
  | 'micro_insight';

type PageContext = 'homepage' | 'data_center' | 'ai_advisor';

type DataTab = 'overview' | 'sleep' | 'heart_rate' | 'activity' | 'stress' | 'vitals';

type Timeframe = 'day' | 'week' | 'month' | 'year' | 'custom';

type StatusColor = 'green' | 'yellow' | 'red';

type ChartTokenId =
  | 'HRV_7DAYS'
  | 'SLEEP_7DAYS'
  | 'RESTING_HR_7DAYS'
  | 'ACTIVITY_7DAYS'
  | 'SPO2_7DAYS'
  | 'SLEEP_STAGE_LAST_NIGHT'
  | 'STRESS_LOAD_7DAYS'
  | 'HRV_SLEEP_14DAYS_COMPARE';

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
    taskType: AgentTaskType;
    pageContext: PageContext;
    promptVersion: string;
    latencyMs: number;
    fallbackTriggered: boolean;
    finishReason?: 'stop' | 'timeout' | 'provider_error' | 'invalid_output' | 'low_data';
    provider?: string;
    model?: string;
  };
}
```

该 envelope 是 `packages/shared`、`packages/agent-core`、`apps/agent-api` 与 `apps/web` 之间唯一正式 AI 线缆协议，不再允许并存 `task` / `taskType`、`charts` / `chartTokens`、对象 token / 字符串 token 的双轨定义。

#### HTTP Transport 协议

后端所有 HTTP 接口都必须复用同一套 transport envelope，定义放在 `packages/shared/src/types/api.ts` 与 `packages/shared/src/schemas/api.schema.ts`。

```ts
type ApiErrorCode =
  | 'BAD_REQUEST'
  | 'NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'AI_TIMEOUT'
  | 'PROVIDER_ERROR'
  | 'OUTPUT_INVALID'
  | 'DATA_INSUFFICIENT'
  | 'GOD_MODE_DISABLED'
  | 'INTERNAL_ERROR';

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

interface ApiError {
  ok: false;
  requestId: string;
  error: {
    code: ApiErrorCode;
    message: string;
    details?: unknown;
  };
}
```

约束：

- 所有路由正式返回值只能是 `ApiSuccess<T>` 或 `ApiError`
- `T` 必须是 shared 中导出的正式 DTO，不允许 route 文件内再定义一份”近似结构”
- 前端服务层和后端路由层都必须复用 shared schema，不允许分别维护两套 envelope

#### SSE 事件协议（预留，P1）

若 SSE 在后续阶段启用，前后端需共享以下事件类型定义。当前仅作为预留声明，不在 Wave 1-6 中实现。

```ts
type SseEventType = 'meta' | 'partial' | 'final' | 'error';

interface SseEvent<T = unknown> {
  event: SseEventType;
  data: T;
}
```

约束：SSE 实现前，须在 shared 中补齐完整的 SSE 事件 Zod schema，再由 Backend 和 Frontend 引用。

#### Session 承载协议

会话由后端统一解析和签发，前端不得本地生成 `sessionId`。

正式规则：

- `sessionId` 的解析优先级固定为：`x-session-id` 请求头 > `ha_demo_session` cookie > 后端新签发
- 后端是唯一权威 session issuer；若生成了新 session，必须同时回写 cookie，并在 `ApiSuccess.meta.sessionId` 中返回规范化后的 `sessionId`
- 前端允许把后端返回的 `sessionId` 缓存在 `sessionStorage`，但这只是 transport cache，不是会话真相来源
- 所有读取或修改 session state 的接口，都必须在成功响应里返回 `meta.sessionId`
- profile switch 不重置 `sessionId`；它只清空该 session 在旧 profile 下的 memory 与 analytical memory

#### 只读与首页组合协议

首页不是一个独立的“超大 DTO”接口，而是由正式只读接口拼装：

- `GET /api/v1/health`
- `GET /api/v1/profiles`
- `GET /api/v1/profiles/:profileId`
- `GET /api/v1/profiles/:profileId/timeline`
- `POST /api/v1/ai/morning-brief`

因此 shared 里必须冻结以下 DTO：

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

约束：

- 不定义 `HomepageDataResponse` 这种聚合型私有协议；Homepage 由上述正式接口组合
- `GET /api/v1/profiles/:profileId` 的正式返回值为 `ApiSuccess<CurrentProfileResponse>`
- `GET /api/v1/profiles/:profileId/timeline` 的正式返回值为 `ApiSuccess<TimelineResponse | StressTimelineResponse>`

#### API Request / Query DTO

所有前后端交互的 request / query DTO 必须在 `packages/shared` 中定义并冻结。Backend 文档中的接口定义仅为 shared DTO 的"摘录与使用说明"，不承担协议首发职责。

落位：

- `packages/shared/src/types/api.ts`
- `packages/shared/src/schemas/api.schema.ts`

```ts
/** GET /api/v1/profiles/:profileId/timeline query 参数 */
interface TimelineQuery {
  tab: 'overview' | 'sleep' | 'heart_rate' | 'activity' | 'stress' | 'vitals';
  rangeType: 'day' | 'week' | 'month' | 'year' | 'custom';
  startDate: string;
  endDate: string;
}

/** GET /api/v1/profiles/:profileId/charts/:chartToken query 参数 */
interface GetChartPayloadQuery {
  mode: 'dashboard-card' | 'detail-chart' | 'chat-inline' | 'compact-pill';
  pageContext?: 'homepage' | 'data_center' | 'ai_advisor';
  tab?: 'overview' | 'sleep' | 'heart_rate' | 'activity' | 'stress' | 'vitals';
  rangeType?: 'day' | 'week' | 'month' | 'year' | 'custom';
  startDate?: string;
  endDate?: string;
}

/** POST /api/v1/ai/morning-brief request body */
interface MorningBriefRequest {
  profileId: string;
  date?: string;
  viewport?: 'mobile' | 'tablet' | 'desktop';
}

/** POST /api/v1/ai/view-summary request body */
interface ViewSummaryRequest {
  profileId: string;
  tab: 'overview' | 'sleep' | 'heart_rate' | 'activity' | 'stress' | 'vitals';
  rangeType: 'day' | 'week' | 'month' | 'year' | 'custom';
  startDate?: string;
  endDate?: string;
}

/** POST /api/v1/ai/chat request body */
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

约束：

- 任何前后端交互接口，都能在 `packages/shared` 章节中找到唯一正式的 request / query / response 定义
- Backend 路由层只引用 shared 中冻结的 DTO，不得在 route 文件中自行定义 request / query schema
- 若需新增或变更 DTO，必须先在 shared 中更新并走兼容性评估，再落到 backend / frontend

#### Chart Token 协议

采用“显式注册制”，不允许自由拼接任意 token。

```ts
type ChartTokenId =
  | 'HRV_7DAYS'
  | 'SLEEP_7DAYS'
  | 'RESTING_HR_7DAYS'
  | 'ACTIVITY_7DAYS'
  | 'SPO2_7DAYS'
  | 'SLEEP_STAGE_LAST_NIGHT'
  | 'STRESS_LOAD_7DAYS'
  | 'HRV_SLEEP_14DAYS_COMPARE';
```

约束：

- 模块边界上的唯一正式 token 格式是 `ChartTokenId[]`
- 不允许 `{ type, metric, range }` 结构化 token 在 shared / agent / backend / frontend 之间流动
- 前端 registry、后端 guard、Agent parser 与 fallback 资产必须复用同一份白名单

#### Agent Response 数量限制常量

以下限制常量定义在 `packages/shared/src/constants/agent-response.ts`，由 Agent parser、Backend guard 与 Frontend 渲染层共同消费：

```ts
// 单次 AI 响应中允许的最大 chart token 数量
export const MAX_CHART_TOKENS_PER_RESPONSE = 2;

// 单次 AI 响应中建议的最大 microTips 数量
export const MAX_MICRO_TIPS_PER_RESPONSE = 3;
```

- Agent parser 在结构化输出阶段截断超出部分
- Backend guard 在校验 token 合法性时同步校验数量
- 前端按实际数量渲染，不做二次截断

#### Chart Render Payload 协议

token 对应的图表数据由后端选窗并返回结构化 payload，前端与 `packages/charts` 只负责渲染。

```ts
interface ChartRenderPayload {
  chartToken: ChartTokenId;
  mode: 'dashboard-card' | 'detail-chart' | 'chat-inline' | 'compact-pill';
  range: {
    startDate: string;
    endDate: string;
    rangeType: 'day' | 'week' | 'month' | 'year' | 'custom';
  };
  series: Array<Record<string, string | number | null>>;
  annotations?: Array<{
    date: string;
    type: 'event' | 'anomaly' | 'baseline';
    label: string;
  }>;
  summaryStats?: Record<string, string | number | null>;
}
```

约束：

- `ChartRenderPayload` 必须定义在 `packages/shared`
- payload 由 backend read API 生成，不由前端根据 raw sandbox 自行拼装
- `packages/charts` 负责把 payload 转成 ECharts option，不负责重新做日期窗口裁剪或指标聚合

#### Stress 衍生视图协议

`stress` tab 不是占位页，也不是 raw sandbox 字段，而是基于现有生理数据推导出的 **Stress Load Proxy**。它必须有稳定的数据契约，且明确声明“仅用于演示态的压力负荷代理，不是医学诊断结论”。

```ts
interface StressTimelinePoint {
  date: string;
  stressLoadScore: number | null; // 0-100
  level: 'low' | 'medium' | 'high' | null;
  contributors: {
    hrvPenalty: number | null;
    restingHrPenalty: number | null;
    sleepDebtPenalty: number | null;
    deepSleepPenalty: number | null;
  };
  supportingEvents: string[];
}

interface StressSummaryStats {
  avgStressLoadScore: number | null;
  peakStressLoadScore: number | null;
  highStressDays: number;
  strongestContributor:
    | 'hrv'
    | 'resting_hr'
    | 'sleep_duration'
    | 'deep_sleep'
    | null;
}

interface StressTimelineResponse extends TimelineResponse {
  tab: 'stress';
  summaryStats: StressSummaryStats;
  points: StressTimelinePoint[];
}
```

推导算法固定为：

- `hrvPenalty = clamp01((baseline.hrv - vitals.hrv.avgMs) / baseline.hrv)`
- `restingHrPenalty = clamp01((vitals.heartRate.minBpm - baseline.restingHR) / baseline.restingHR)`
- `sleepDebtPenalty = clamp01((rollingMedian14d(timeAsleepMin) - sleep.timeAsleepMin) / rollingMedian14d(timeAsleepMin))`
- `deepSleepPenalty = clamp01((rollingMedian14d(deepSleepMin) - sleep.stages.deepSleepMin) / rollingMedian14d(deepSleepMin))`
- `stressLoadScore = round(100 * mean(all available penalties))`
- 若当日可用 penalty 少于 2 项，则 `stressLoadScore = null`
- `supportingEvents` 只作为注释与解释线索，不直接参与分数计算
- `level` 按 `0-33 / 34-66 / 67-100` 映射到 `low / medium / high`

#### God-Mode 协议

God-Mode 的正式 request / response contract 也必须全部放在 shared；前端 UI、backend controller、sandbox merge 只能围绕这一套协议实现。

```ts
type DemoScenarioId =
  | 'simulate_poor_sleep'
  | 'simulate_alcohol_night'
  | 'simulate_start_workout'
  | 'simulate_high_stress'
  | 'restore_default';

interface MetricOverridePatch {
  activity?: {
    steps?: number;
    calories?: number;
  };
  sleep?: {
    timeAsleepMin?: number;
    stages?: {
      awakeMin?: number;
      remMin?: number;
      lightSleepMin?: number;
      deepSleepMin?: number;
    };
  };
  vitals?: {
    heartRate?: {
      avgBpm?: number;
      minBpm?: number;
      maxBpm?: number;
    };
    hrv?: {
      avgMs?: number;
      minMs?: number;
      maxMs?: number;
    };
    spo2?: {
      avgRatio?: string;
      minRatio?: string;
      maxRatio?: string;
    };
  };
}

interface ActiveSensingState {
  visible: boolean;
  priority: 'normal' | 'high';
  surface: 'banner' | 'data-only';
  date: string;
  events: string[];
}

interface GodModeStateResponse {
  sessionId: string;
  currentProfileId?: string;
  activeScenarioId?: DemoScenarioId;
  activeSensing: ActiveSensingState | null;
  eventInjectionsByDate: Record<string, string[]>;
  metricOverridesByDate: Record<string, MetricOverridePatch>;
}

interface SwitchProfileRequest {
  profileId: string;
}

interface InjectEventsRequest {
  profileId: string;
  date: string;
  events: string[];
  priority?: 'normal' | 'high';
  surface?: 'banner' | 'data-only';
}

interface MetricOverrideRequest {
  profileId: string;
  date: string;
  patch: MetricOverridePatch;
}

interface ApplyScenarioRequest {
  profileId: string;
  scenarioId: DemoScenarioId;
}

interface RunDemoScriptRequest {
  scriptId: string;
  profileId?: string;
}

interface ResetRequest {
  profileId?: string;
  mode: 'profile-only' | 'session-all';
}

interface DemoScriptRunResponse {
  state: GodModeStateResponse;
  executedSteps: Array<{
    type: 'profile_switch' | 'scenario_apply' | 'event_inject' | 'metric_override' | 'reset';
    ok: boolean;
    summary: string;
  }>;
}
```

约束：

- 正式对外线缆协议固定为 `MetricOverridePatch`，不允许前后端直接传 `{ path, value }`
- `GET /api/v1/god-mode/state` 返回 `ApiSuccess<GodModeStateResponse>`
- `POST /api/v1/god-mode/profile/switch`、`events/inject`、`metrics/override`、`scenario/apply`、`reset` 都返回 `ApiSuccess<GodModeStateResponse>`
- `POST /api/v1/god-mode/demo-script/run` 返回 `ApiSuccess<DemoScriptRunResponse>`
- 对外 patch 白名单只包含 `MetricOverridePatch` 中列出的字段；`date`、`events`、sleep 时间戳类字段不允许通过 metric override 修改

### 6.4 实现原则

- 所有对外输入都先过 Zod schema
- TypeScript type 与 Zod schema 同源导出
- 不在 shared 中出现“猜测型默认值”
- 所有 enum 统一集中定义，避免 web/backend 各自硬编码

---

## 7. `packages/sandbox` 详细设计

`packages/sandbox` 是系统唯一正式数据访问与 merge 层，主要服务后端上下文构造、运行时 merge 与数据校验脚本；`apps/web` 运行时不直接依赖它。

### 7.1 子目录结构

```text
packages/sandbox/
├── src/
│   ├── loader/
│   │   ├── file-loader.ts
│   │   ├── profile-loader.ts
│   │   └── index.ts
│   ├── merge/
│   │   ├── apply-overrides.ts
│   │   ├── merge-events.ts
│   │   ├── merge-record-fields.ts
│   │   └── index.ts
│   ├── selectors/
│   │   ├── get-profile.ts
│   │   ├── get-daily-record.ts
│   │   ├── get-records-by-range.ts
│   │   ├── get-latest-record.ts
│   │   ├── get-baseline.ts
│   │   └── get-chart-series.ts
│   ├── scenarios/
│   │   ├── scenario-types.ts
│   │   ├── apply-scenario.ts
│   │   └── reset-scenario.ts
│   ├── validation/
│   │   ├── validate-sandbox.ts
│   │   └── validate-scenario.ts
│   ├── fixtures/
│   │   └── example-overrides.ts
│   └── index.ts
├── package.json
└── vitest.config.ts
```

### 7.2 核心职责

1. 读取 `data/sandbox/*.json`
2. 校验 profile 数据合法性
3. 基于内存 override 生成“当前有效视图数据”
4. 提供按 profile / 日期范围 / 视图上下文的 selector
5. 提供场景注入与恢复能力
6. 为 charts 和 agent-core 提供统一数据接口

### 7.3 数据访问模型

#### 原始层

- 从磁盘加载基础 JSON
- 启动时缓存到进程内只读对象
- 保留原始字段，不做业务推断

#### 运行时层

- 基于当前 profile + overrides 生成运行时视图
- 所有 God-Mode 改动只存在运行时层
- 重置场景时丢弃运行时改动并回退到基础层

#### 选择器层

- 返回给上游的永远是已 merge 完的只读快照
- 选择器必须无副作用
- 避免让上游感知 merge 细节

### 7.4 Override 结构

```ts
interface RuntimeOverrides {
  activeProfileId?: string;
  activeScenarioByProfile: Record<string, DemoScenarioId | null>;
  activeSensing: ActiveSensingState | null;
  eventInjections: Array<{
    profileId: string;
    date: string;
    events: string[];
  }>;
  metricOverrides: Array<{
    profileId: string;
    date: string;
    path: MetricOverridePath;
    value: string | number;
  }>;
}

type MetricOverridePath =
  | 'activity.steps'
  | 'activity.calories'
  | 'sleep.timeAsleepMin'
  | 'sleep.stages.awakeMin'
  | 'sleep.stages.remMin'
  | 'sleep.stages.lightSleepMin'
  | 'sleep.stages.deepSleepMin'
  | 'vitals.heartRate.avgBpm'
  | 'vitals.heartRate.minBpm'
  | 'vitals.heartRate.maxBpm'
  | 'vitals.hrv.avgMs'
  | 'vitals.hrv.minMs'
  | 'vitals.hrv.maxMs'
  | 'vitals.spo2.avgRatio'
  | 'vitals.spo2.minRatio'
  | 'vitals.spo2.maxRatio';
```

### 7.5 关键规则

- 同一日期多次 event 注入应合并去重
- 外部 `MetricOverridePatch` 进入 sandbox 层后，必须先被标准化为 `MetricOverridePath + value`
- 指标覆写按最后写入生效
- 若覆写路径不存在，直接返回校验错误，不静默创建新字段
- 不允许覆写 schema 外字段
- 不允许把 overrides 落盘回写到 `data/sandbox`

### 7.6 Scenario 机制

为了支撑演示流，`packages/sandbox` 需要内置“场景动作模板”：

- `simulate_poor_sleep`
- `simulate_alcohol_night`
- `simulate_start_workout`
- `simulate_high_stress`
- `restore_default`

场景模板本质上是对 event 与 metrics override 的组合 patch。

---

## 8. `packages/charts` 详细设计

`packages/charts` 负责把 **shared 中冻结的图表 view model** 转成 **前端可渲染图表定义**，并统一 chart token -> option builder 的映射。

### 8.1 子目录结构

```text
packages/charts/
├── src/
│   ├── registry/
│   │   ├── token-registry.ts
│   │   └── supported-tokens.ts
│   ├── builders/
│   │   ├── hrv-7days.ts
│   │   ├── sleep-7days.ts
│   │   ├── resting-hr-7days.ts
│   │   ├── activity-7days.ts
│   │   ├── spo2-7days.ts
│   │   ├── sleep-stage-last-night.ts
│   │   ├── stress-load-7days.ts
│   │   └── hrv-sleep-14days-compare.ts
│   ├── transforms/
│   │   ├── to-line-series.ts
│   │   ├── to-bar-series.ts
│   │   ├── to-tooltip-model.ts
│   │   └── mark-anomalies.ts
│   ├── themes/
│   │   ├── dark-theme.ts
│   │   └── status-colors.ts
│   ├── types.ts
│   └── index.ts
├── package.json
└── vitest.config.ts
```

### 8.2 核心职责

1. 接收 backend read API 返回的标准化图表 payload / timeline view model
2. 根据 token 生成 ECharts option
3. 统一 tooltip、baseline、异常点、空数据断点规则
4. 为主页大卡片、Data Center 主图、Chat 内嵌微图提供不同尺寸模式

### 8.3 三层设计

#### Token Registry

基于 `packages/shared` 中冻结的 `ChartTokenId` 白名单，定义前端渲染层如何为每个 token 选择 builder 与 mode；它不是第二套正式协议来源。

#### Option Builder

每个 token 对应一个 builder，输入是标准化 chart context，输出是 ECharts option。

#### Theme Adapter

负责暗黑模式、红黄绿状态和不同尺寸密度下的视觉参数，不在 web 中散落硬编码。

### 8.4 图表模式

- `dashboard-card`
- `detail-chart`
- `chat-inline`
- `compact-pill`

相同 token 在不同 mode 下可复用数据层，但 option 配置不同。

### 8.5 空数据与异常

- 缺失数据使用断点，不补零
- 异常点标红逻辑由 transform 层统一处理
- baseline 线为浅色对照线，由 builder 决定是否显示
- 若 token 合法但数据不足，返回“可渲染空态配置”而不是抛异常

---

## 9. `packages/ui` 详细设计

`packages/ui` 只放与业务弱耦合的共享 UI 基座，不放页面级 feature 组件。

### 9.1 子目录结构

```text
packages/ui/
├── src/
│   ├── components/
│   │   ├── card/
│   │   ├── button/
│   │   ├── badge/
│   │   ├── pill/
│   │   ├── drawer/
│   │   ├── dialog/
│   │   ├── tabs/
│   │   ├── segmented-control/
│   │   ├── skeleton/
│   │   ├── chart-frame/
│   │   ├── status-ring/
│   │   └── empty-state/
│   ├── theme/
│   │   ├── tokens.ts
│   │   ├── semantic-colors.ts
│   │   ├── spacing.ts
│   │   └── radii.ts
│   ├── hooks/
│   │   ├── use-breakpoint.ts
│   │   └── use-reduced-motion.ts
│   └── index.ts
├── package.json
└── tsconfig.json
```

### 9.2 核心职责

- 提供深色主题下的共享组件
- 提供响应式断点 hook
- 提供 Skeleton、状态色、容器样式基件
- 提供 chart 容器、空态容器、错误提示基件

### 9.3 组件边界

可以放：

- 通用 Card / Drawer / Skeleton / Badge / Pill / Tabs
- 与业务无关的 ChartFrame
- 统一按钮、输入容器、状态指示器

不可以放：

- HomepageMorningBriefCard
- DataCenterSummaryPanel
- ChatComposer
- GodModePanel

这些属于 `apps/web` 内的 feature 组件，不进共享 UI 包。

---

## 10. `packages/config` 详细设计

`packages/config` 负责统一工程配置，避免每个 app/package 自己维护一套配置副本。

### 10.1 内容范围

- `tsconfig` 基座
- ESLint flat config
- Prettier config
- Vitest 基础配置
- Playwright 共享配置片段
- 共享环境变量约束

### 10.2 子目录结构

```text
packages/config/
├── eslint/
│   ├── base.mjs
│   ├── next.mjs
│   └── node.mjs
├── prettier/
│   └── prettier.config.cjs
├── typescript/
│   ├── base.json
│   ├── react-library.json
│   ├── next-app.json
│   └── node-service.json
├── vitest/
│   ├── base.ts
│   ├── node.ts
│   └── react.ts
├── playwright/
│   └── base.ts
└── package.json
```

### 10.3 关键规则

- 严格开启 `strict`
- 不允许默认导出类型与实现混乱
- import path 统一 alias
- package 构建输出统一 `dist`
- `noUncheckedIndexedAccess`、`exactOptionalPropertyTypes` 建议开启
- CI 中 lint/typecheck/test 必须按包与 app 统一执行

---

## 11. `data/` 资产层详细设计

### 11.1 `data/sandbox`

用于存放正式演示数据，不是测试 fixture，也不是临时 mock。

建议结构：

```text
data/sandbox/
├── profiles.index.json
├── profile-athlete.json
├── profile-office-worker.json
├── profile-poor-sleeper.json
├── scenarios/
│   ├── simulate_poor_sleep.json
│   ├── simulate_alcohol_night.json
│   ├── simulate_high_stress.json
│   └── simulate_start_workout.json
├── demo-scripts/
│   ├── investor_demo_01.json
│   └── README.md
└── README.md
```

#### 规则

- 每个 profile 独立文件，避免巨型单文件难维护
- `profiles.index.json` 提供 profile 元数据清单
- 场景模板也作为数据资产单独存放，可被 God-Mode 调用
- README 说明字段来源、样本跨度、剧情注入原则

### 11.2 `data/fallback`

用于存放各场景 fallback 模板。

```text
data/fallback/
├── homepage-brief/
│   ├── green.json
│   ├── yellow.json
│   └── red.json
├── view-summary/
│   ├── overview.json
│   ├── sleep.json
│   ├── heart-rate.json
│   ├── activity.json
│   ├── stress.json
│   └── vitals.json
├── advisor-chat/
│   ├── generic.json
│   ├── insufficient-data.json
│   └── timeout.json
└── README.md
```

#### 规则

- fallback 文案数据化，不写死在 web/backend 代码里
- 模板中允许变量占位，如 `{{name}}`、`{{statusColor}}`
- agent-api 负责生成正式 fallback 结果；web 仅可在 mock / fallback-only 本地模式下复用这些资产，不得在真实超时路径中伪造正式 AI 消息

### 11.3 `data/prompts`

用于存放系统 prompt 与任务模板，不放历史实验 prompt。

```text
data/prompts/
├── system/
│   ├── base.md
│   ├── safety.md
│   └── style.md
├── tasks/
│   ├── homepage-brief.md
│   ├── view-summary.md
│   ├── advisor-chat.md
│   └── micro-insight.md
└── README.md
```

#### 规则

- prompt 文件版本化管理
- 支持按任务组合注入
- prompt 模板中的变量占位要有明确清单
- 实际拼装逻辑仍属于 `agent-core`，这里只存资产

---

## 12. `infra/docker` 详细设计

### 12.1 目标

为本地联调和 demo 发布提供最小可用容器化支撑，不追求复杂生产运维能力。

### 12.2 文件建议

```text
infra/docker/
├── web.Dockerfile
├── agent-api.Dockerfile
├── docker-compose.local.yml
├── docker-compose.demo.yml
├── .env.web.example
├── .env.agent-api.example
└── README.md
```

### 12.3 容器策略

#### web.Dockerfile

- 多阶段构建
- builder 安装 workspace 依赖
- runtime 只保留 Next 运行所需文件

#### agent-api.Dockerfile

- 多阶段构建
- 构建后以 Node runtime 启动 Fastify 服务
- 支持注入 `LLM_PROVIDER / LLM_MODEL / AI_TIMEOUT_MS / ENABLE_GOD_MODE`

#### compose 模式

- `local`: 用于开发联调
- `demo`: 用于演示保底环境

### 12.4 容器环境要求

- web 与 agent-api 独立服务
- demo compose 默认开启 fallback 能力
- 支持关闭真实 LLM 调用，仅保留 fallback-only 演示模式
- 不引入数据库容器与 Redis 容器

---

## 13. `infra/scripts` 详细设计

### 13.1 目标

用脚本把“容易靠口头约定但容易失控”的工作流程固化下来。

### 13.2 建议脚本

```text
infra/scripts/
├── validate-sandbox.ts
├── validate-fallback.ts
├── validate-chart-tokens.ts
├── sync-profile-index.ts
├── seed-demo-scenarios.ts
├── smoke-run.ts
├── start-demo-mode.sh
├── start-fallback-only.sh
└── README.md
```

### 13.3 重点脚本

#### `validate-sandbox.ts`

- 校验所有 profile JSON 的 schema
- 校验日期连续性
- 校验 required 字段是否缺失
- 校验 events 是否为字符串数组

#### `validate-fallback.ts`

- 校验 fallback 模板字段完整性
- 校验变量占位没有未解析项

#### `validate-chart-tokens.ts`

- 校验 shared 中声明的 token 是否都在 charts registry 有实现
- 校验 charts registry 不存在未声明 token

#### `smoke-run.ts`

- 启动后端最小 smoke 请求
- 检查 homepage brief / view summary / chat / god-mode 基本链路是否返回 200

---

## 14. 测试基建与质量门禁

### 14.1 测试分层

#### 单元测试

覆盖：

- shared schema
- sandbox merge/selectors
- charts builders
- config 关键导出
- fallback 模板解析

#### 集成测试

覆盖：

- data assets + sandbox selectors
- chart token -> option 生成
- fallback 模板加载
- scenario 注入与 reset 行为

#### E2E

由 web + agent-api 联合执行，但 Others 需提供底层基建：

- 稳定的 demo data
- 稳定的 fallback data
- 稳定的 chart token registry
- demo mode 启动脚本

### 14.2 质量门禁

PR 合并前至少通过：

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm validate:data
```

### 14.3 `package.json` 根脚本建议

```json
{
  "scripts": {
    "dev": "turbo run dev --parallel",
    "build": "turbo run build",
    "lint": "turbo run lint",
    "typecheck": "turbo run typecheck",
    "test": "turbo run test",
    "test:e2e": "pnpm --filter web test:e2e",
    "validate:data": "tsx infra/scripts/validate-sandbox.ts && tsx infra/scripts/validate-fallback.ts && tsx infra/scripts/validate-chart-tokens.ts",
    "smoke": "tsx infra/scripts/smoke-run.ts"
  }
}
```

---

## 15. Demo 运行模式与保障机制

### 15.1 UI 开发模式

- web 直接消费 mock API 或本地静态数据
- agent-api 可不启动
- charts / ui / shared / sandbox 仍需可本地联编

### 15.2 联调模式

- web + agent-api 同时运行
- 使用真实 LLM
- 使用真实 sandbox data 与 runtime overrides

### 15.3 fallback-only 演示模式

- web + agent-api 同时运行
- agent-api 可跳过真实 provider 调用
- 直接返回规则引擎或 fallback 模板
- 用于断网、限流或演示保底场景

### 15.4 关键保障点

- fallback 资产必须完整覆盖 Homepage / View Summary / Chat 三类入口
- sandbox 中至少准备 3 个剧情鲜明的 profile
- scenario 模板必须可一键恢复现场
- chart token 与图表 builder 需要 100% 对齐

---

## 16. 版本治理与协作规则

### 16.1 包版本策略

本项目为单仓 demo 项目，优先采用 workspace 内部同步版本，不做独立发包。

### 16.2 分支协作规则

建议：

- `main`: 可演示分支
- `dev`: 日常集成分支
- feature 分支按子模块划分，如：
  - `feat/shared-schema`
  - `feat/sandbox-scenarios`
  - `feat/charts-registry`
  - `feat/demo-infra`

### 16.3 Code Ownership 建议

- shared / sandbox / charts：偏平台能力 owner
- ui：偏前端 owner
- data assets：产品+前端+后端共同评审
- infra/scripts：全栈 owner

---

## 17. 实施顺序

建议按以下顺序推进 Others：

### 阶段 1：共享基座先行

1. 建立 `packages/config`
2. 建立 `packages/shared`
3. 建立 workspace 根脚本与 turbo pipeline

### 阶段 2：数据与资产落地

4. 建立 `data/sandbox`
5. 建立 `data/fallback`
6. 建立 `data/prompts`
7. 建立 `packages/sandbox`

### 阶段 3：前端共享基础

8. 建立 `packages/ui`
9. 建立 `packages/charts`
10. 建立 chart token registry 与 builders

### 阶段 4：运行与质量保障

11. 建立 `infra/docker`
12. 建立 `infra/scripts`
13. 接入 validate/data/smoke 脚本
14. 完成 Others 范围测试

---

## 18. 可直接执行的开发任务拆分

以下任务可直接进入 issue / ticket 系统。

### A. Monorepo 与配置

1. 初始化 `pnpm-workspace.yaml`
2. 初始化 `turbo.json`
3. 建立根 `package.json` 脚本
4. 建立根 `tsconfig.base.json`
5. 建立 `packages/config`
6. 输出 `typescript/base.json`
7. 输出 `typescript/react-library.json`
8. 输出 `typescript/next-app.json`
9. 输出 `typescript/node-service.json`
10. 输出 `eslint/base.mjs`
11. 输出 `eslint/next.mjs`
12. 输出 `eslint/node.mjs`
13. 输出 `prettier.config.cjs`
14. 输出 `vitest/base.ts`
15. 输出 `playwright/base.ts`

### B. Shared 协议层

16. 建立 `packages/shared` 目录结构
17. 定义 sandbox TypeScript types
18. 定义 sandbox Zod schema
19. 定义 agent response types
20. 定义 agent response schema
21. 定义 API DTO types
22. 定义 API DTO schema
23. 定义 God-Mode types
24. 定义 God-Mode schema
25. 定义 chart token types
26. 定义 chart token schema
27. 定义状态色常量
28. 定义页面上下文常量
29. 定义 timeframe 常量
30. 实现 chart token parser 纯函数
31. 输出 shared barrel file
32. 为 shared 补齐单元测试

### C. Sandbox 数据层

33. 建立 `data/sandbox` 目录结构
34. 产出 `profiles.index.json`
35. 产出至少 3 个正式演示 profile
36. 产出至少 4 个 scenario 模板
37. 为 sandbox 数据写 README
38. 建立 `packages/sandbox` 目录结构
39. 实现 file loader
40. 实现 profile loader
41. 实现 sandbox schema validation
42. 实现 override 数据结构
43. 实现 events merge
44. 实现 metric override merge
45. 实现 profile selector
46. 实现 date-range selector
47. 实现 latest-record selector
48. 实现 chart-series selector
49. 实现场景 apply
50. 实现场景 reset
51. 为 sandbox 包补齐单元测试
52. 为 scenario 行为补齐集成测试

### D. Charts 共享层

53. 建立 `packages/charts` 目录结构
54. 建立 supported tokens 清单
55. 建立 token registry
56. 实现 `HRV_7DAYS` builder
57. 实现 `SLEEP_7DAYS` builder
58. 实现 `RESTING_HR_7DAYS` builder
59. 实现 `ACTIVITY_7DAYS` builder
60. 实现 `SPO2_7DAYS` builder
61. 实现 `SLEEP_STAGE_LAST_NIGHT` builder
62. 实现 `STRESS_LOAD_7DAYS` builder
63. 实现 `HRV_SLEEP_14DAYS_COMPARE` builder
64. 实现 line/bar transform 工具
65. 实现 anomaly marker 工具
66. 实现 dark theme 配置
67. 实现 chart mode 差异化配置
68. 编写 charts 单元测试
69. 编写 token-registry 对齐测试

### E. UI 共享层

69. 建立 `packages/ui` 目录结构
70. 实现 theme tokens
71. 实现 semantic colors
72. 实现 Card 组件
73. 实现 Button 组件
74. 实现 Badge / Pill 组件
75. 实现 Drawer / Dialog 基件
76. 实现 Tabs / SegmentedControl 基件
77. 实现 Skeleton 基件
78. 实现 ChartFrame 基件
79. 实现 EmptyState 基件
80. 实现 useBreakpoint hook
81. 实现 useReducedMotion hook
82. 编写 ui 包 smoke 测试

### F. Data Assets

83. 建立 `data/fallback` 目录结构
84. 产出 homepage-brief fallback 模板
85. 产出 view-summary fallback 模板
86. 产出 advisor-chat fallback 模板
87. 为 fallback 写 README
88. 建立 `data/prompts` 目录结构
89. 产出 base/system/style/safety prompt 文件
90. 产出 homepage-brief/view-summary/advisor-chat task prompt 文件
91. 为 prompts 写 README

### G. Infra 与脚本

92. 建立 `infra/docker` 目录结构
93. 编写 `web.Dockerfile`
94. 编写 `agent-api.Dockerfile`
95. 编写 `docker-compose.local.yml`
96. 编写 `docker-compose.demo.yml`
97. 编写 `.env.web.example`
98. 编写 `.env.agent-api.example`
99. 建立 `infra/scripts` 目录结构
100. 实现 `validate-sandbox.ts`
101. 实现 `validate-fallback.ts`
102. 实现 `validate-chart-tokens.ts`
103. 实现 `sync-profile-index.ts`
104. 实现 `smoke-run.ts`
105. 实现 `start-demo-mode.sh`
106. 实现 `start-fallback-only.sh`
107. 编写 infra README

### H. 验收与稳定性

108. 在 CI 接入 lint/typecheck/test/validate:data
109. 补齐 Others 范围 smoke 测试
110. 验证 fallback-only 模式可运行
111. 验证 scenario reset 后数据恢复正确
112. 验证 charts token 全量可渲染
113. 验证多 profile 切换数据一致性
114. 输出 Others 模块验收清单

---

## 19. 验收标准

Others 完成后，应至少满足以下验收条件：

1. 所有 workspace 包能独立 build / typecheck。
2. `shared` 能作为唯一协议来源被 web 与 agent-api 同时消费。
3. `sandbox` 能稳定完成 profile 读取、range 查询、override merge、scenario reset。
4. `charts` 能根据合法 token 输出对应 ECharts option。
5. `ui` 能提供前端需要的共享暗黑主题基础件。
6. `data/sandbox`、`data/fallback`、`data/prompts` 均具备可校验、可维护的目录规范。
7. `docker-compose.local.yml` 能完成最小联调启动。
8. `start-fallback-only.sh` 能跑起演示保底环境。
9. `validate:data` 和 `smoke` 脚本可执行并稳定通过。
10. Others 层不破坏既定架构边界，不向系统引入数据库、Redis 或额外运行时。

---

## 20. 一句话落地原则

Others 不是“杂项”，而是把系统里所有 **共享协议、共享资产、共享工程基座、共享运行保障** 做成可持续执行的那一层；它决定的是这个 Demo 能不能在多人协作、快速迭代和高压演示环境下稳定工作。
