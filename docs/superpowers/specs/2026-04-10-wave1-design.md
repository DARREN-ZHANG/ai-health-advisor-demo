# Wave 0 修复 + Wave 1 — 共享协议、数据与复用包基座设计

## 1. 概述

本文档覆盖两阶段工作：

- **Wave 0 修复**：补齐遗留 P0/P1 缺陷（config 包、coverage、CI skeleton）
- **Wave 1**：冻结跨模块协议，构建 sandbox/data/ui/charts 可复用基座

执行顺序：Wave 0 修复 → SHR（共享协议）→ SAN + DAT（数据路径，并行）→ UI + CHT（视觉路径，并行）

## 2. Wave 0 修复

### 2.1 OTH-004：完善 packages/config

当前 `packages/config/` 仅有空壳 `package.json`。需补齐以下配置文件：

| 配置类型   | 文件                       | 内容                                  |
| ---------- | -------------------------- | ------------------------------------- |
| TypeScript | `tsconfig.react.json`      | 继承 tsconfig.base.json，加 JSX 支持  |
| TypeScript | `tsconfig.node.json`       | 继承 tsconfig.base.json，加 Node 类型 |
| ESLint     | `eslint.config.base.mjs`   | 扁平配置基线，export 配置数组         |
| Prettier   | `prettier.config.base.mjs` | 基础格式规则，export 配置对象         |
| Vitest     | `vitest.config.base.ts`    | 基础测试配置，含 coverage 设置        |

根级和 app 级配置改为引用 `@health-advisor/config` 导出的配置。

### 2.2 OTH-012：Vitest coverage 配置

在 `vitest.config.base.ts` 中添加：

```ts
coverage: {
  provider: 'v8',
  reporter: ['text', 'lcov'],
  reportsDirectory: './coverage',
  include: ['src/**/*.ts'],
  thresholds: { lines: 80, branches: 80, functions: 80, statements: 80 }
}
```

`apps/agent-api` 补齐 `vitest.config.ts` 继承基础配置。

### 2.3 OTH-014：CI skeleton

创建 `.github/workflows/ci.yml`：

- 触发：push to main、PR to main
- 步骤：install → typecheck → lint → test → build
- 失败阻断合并（`concurrency` + required status check）

## 3. packages/shared (@health-advisor/shared)

### 3.1 包结构

```
packages/shared/
├── src/
│   ├── types/
│   │   ├── sandbox.ts       # SandboxProfile, DailyRecord, ActivityData, SleepData, VitalSignsData
│   │   ├── agent.ts         # AgentTaskType, PageContext, DataTab, Timeframe, AgentResponseEnvelope
│   │   ├── chart-token.ts   # ChartTokenId enum
│   │   ├── god-mode.ts      # ProfileSwitch, EventInject, MetricOverride, Reset, Scenario payloads
│   │   ├── api.ts           # ApiResponse<T>, ErrorCode, ApiMeta
│   │   └── stress.ts        # StressTimelineResponse, StressTimelinePoint, StressSummaryStats
│   ├── schemas/
│   │   ├── sandbox.ts       # Zod schemas for sandbox types
│   │   ├── agent.ts         # Zod schemas for agent types
│   │   ├── chart-token.ts   # Zod schema for ChartTokenId
│   │   ├── god-mode.ts      # Zod schemas for god-mode DTOs
│   │   ├── api.ts           # Zod schemas for API envelope
│   │   └── stress.ts        # Zod schemas for stress types
│   ├── constants/
│   │   ├── status-colors.ts # status → color mapping
│   │   ├── chart-tokens.ts  # token metadata (label, unit, color)
│   │   └── timeframes.ts    # timeframe constants
│   ├── utils/
│   │   ├── date-range.ts    # 日期范围计算
│   │   ├── timeframe.ts     # 时间窗口工具
│   │   ├── chart-token.ts   # token 查找/验证
│   │   └── page-context.ts  # 页面上下文工具
│   └── index.ts             # barrel export
├── vitest.config.ts
├── tsconfig.json
└── package.json
```

### 3.2 核心类型定义

#### sandbox.ts

```ts
interface SandboxProfile {
  profileId: string;
  name: string;
  age: number;
  gender: 'male' | 'female';
  avatar: string;
  baseline: BaselineMetrics;
}

interface DailyRecord {
  date: string; // YYYY-MM-DD
  hr?: number[];
  sleep?: SleepData;
  activity?: ActivityData;
  spo2?: number;
  stress?: StressData;
}

interface SleepData {
  totalMinutes: number;
  startTime: string;
  endTime: string;
  stages: { deep: number; light: number; rem: number; awake: number }; // 分钟
  score: number; // 0-100
}

interface ActivityData {
  steps: number;
  calories: number;
  activeMinutes: number;
  distanceKm: number;
}

interface VitalSignsData {
  restingHr: number;
  hrv: number;
  spo2: number;
  stressLoad: number;
}
```

#### agent.ts

```ts
enum AgentTaskType {
  HOMEPAGE_SUMMARY = 'homepage_summary',
  VIEW_SUMMARY = 'view_summary',
  ADVISOR_CHAT = 'advisor_chat',
}

interface PageContext {
  profileId: string;
  page: string;
  dataTab?: DataTab;
  timeframe: Timeframe;
}

interface AgentResponseEnvelope {
  summary: string;
  chartTokens: ChartTokenId[];
  microTips: string[];
  meta: {
    taskType: AgentTaskType;
    pageContext: PageContext;
    finishReason: 'complete' | 'fallback' | 'timeout';
  };
}
```

#### chart-token.ts

```ts
enum ChartTokenId {
  HRV_7DAYS = 'HRV_7DAYS',
  SLEEP_7DAYS = 'SLEEP_7DAYS',
  RESTING_HR_7DAYS = 'RESTING_HR_7DAYS',
  ACTIVITY_7DAYS = 'ACTIVITY_7DAYS',
  SPO2_7DAYS = 'SPO2_7DAYS',
  SLEEP_STAGE_LAST_NIGHT = 'SLEEP_STAGE_LAST_NIGHT',
  STRESS_LOAD_7DAYS = 'STRESS_LOAD_7DAYS',
  HRV_SLEEP_14DAYS_COMPARE = 'HRV_SLEEP_14DAYS_COMPARE',
}
```

#### god-mode.ts

```ts
interface ProfileSwitchPayload {
  profileId: string;
}
interface EventInjectPayload {
  eventType: string;
  data: Record<string, unknown>;
  timestamp?: string;
}
interface MetricOverridePayload {
  metric: string;
  value: unknown;
  dateRange?: { start: string; end: string };
}
interface ResetPayload {
  scope: 'profile' | 'events' | 'overrides' | 'all';
}
interface ScenarioPayload {
  scenarioId: string;
  params?: Record<string, unknown>;
}
```

#### api.ts

```ts
interface ApiResponse<T> {
  success: boolean;
  data: T | null;
  error: { code: ErrorCode; message: string } | null;
  meta: ApiMeta;
}

enum ErrorCode {
  UNKNOWN = 'UNKNOWN',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  NOT_FOUND = 'NOT_FOUND',
  PROFILE_NOT_FOUND = 'PROFILE_NOT_FOUND',
  AGENT_TIMEOUT = 'AGENT_TIMEOUT',
  AGENT_FALLBACK = 'AGENT_FALLBACK',
  RATE_LIMITED = 'RATE_LIMITED',
}

interface ApiMeta {
  timestamp: string;
  requestId: string;
  durationMs: number;
}
```

#### stress.ts

```ts
interface StressTimelinePoint {
  date: string;
  stressLoadScore: number; // 0-100
  contributors: { hrv: number; sleep: number; activity: number };
}

interface StressSummaryStats {
  average: number;
  max: number;
  min: number;
  trend: 'improving' | 'stable' | 'declining';
}

interface StressTimelineResponse {
  points: StressTimelinePoint[];
  summary: StressSummaryStats;
}
```

### 3.3 Zod Schema 策略

- 每个类型文件对应一个 schema 文件，schema 从类型推断但独立定义
- 导出 `parse`/`safeParse` 工具函数供运行时校验
- Schema 既用于输入验证，也用于 sandbox JSON 数据验证

### 3.4 工具函数

- `date-range.ts`：计算给定 Timeframe 的起止日期
- `timeframe.ts`：Timeframe 枚举/类型 + 预设窗口（7d/14d/30d）
- `chart-token.ts`：token 查找、验证、元数据获取
- `page-context.ts`：页面上下文构建/验证

## 4. packages/sandbox (@health-advisor/sandbox)

### 4.1 包结构

```
packages/sandbox/
├── src/
│   ├── loader.ts             # 从 data/sandbox 加载 JSON
│   ├── selectors/
│   │   ├── profile.ts        # 按 profileId 获取 profile
│   │   └── date-range.ts     # 按时间窗口过滤 dailyRecords
│   ├── merge/
│   │   ├── override.ts       # 运行时 override 合并
│   │   └── event.ts          # 注入事件叠加
│   ├── helpers/
│   │   ├── missing-value.ts  # 缺失值语义
│   │   └── timeline.ts       # 时间线标准化（供图表使用）
│   └── index.ts
├── vitest.config.ts
├── tsconfig.json
└── package.json
```

### 4.2 核心逻辑

**loader.ts**：

- 接收 dataDir 路径，读取所有 profile JSON
- 使用 Zod schema 验证数据完整性
- 返回 `Map<profileId, SandboxProfile & { records: DailyRecord[] }>`

**selectors/profile.ts**：

- `getProfile(profileId)` → profile 或明确错误
- `listProfiles()` → 所有 profile 摘要

**selectors/date-range.ts**：

- `selectByRange(records, timeframe)` → 过滤后的 records
- 支持 day/week/month/year/custom 窗口

**merge/override.ts**：

- `applyOverrides(baseRecords, overrides)` → 新数组（不修改原数据）
- override 值覆盖对应日期的对应指标

**merge/event.ts**：

- `mergeEvents(baseEvents, injected)` → 合并后的 events
- 规则：按时间排序，同时间戳 injected 优先

**helpers/missing-value.ts**：

- `isMissing(value)` → 明确判断缺失值
- `fillMissing(points, strategy)` → 支持 null/forward-fill/interpolate

**helpers/timeline.ts**：

- `normalizeTimeline(records, metrics)` → 标准时间序列
- 输出 `{ date, values: Record<metric, number | null> }[]`
- 支持滚动中位数、缺失值填充

### 4.3 设计约束

- 所有 merge/select 操作返回新对象（不可变）
- loader 不缓存——由调用方决定缓存策略
- 纯函数为主，无副作用

## 5. packages/ui (@health-advisor/ui)

### 5.1 包结构

```
packages/ui/
├── src/
│   ├── tokens/
│   │   ├── colors.ts         # 颜色 token 常量
│   │   ├── spacing.ts        # 间距 scale
│   │   ├── typography.ts     # 字体/字号
│   │   ├── borders.ts        # border-radius, shadow
│   │   └── index.ts
│   ├── components/
│   │   ├── layout/           # Container, Section, Card, Grid
│   │   ├── status/           # StatusBadge, Pill, InlineHint, MicroTip
│   │   ├── interactive/      # Button, IconButton, Tabs, Drawer, Sheet, Modal
│   │   └── feedback/         # Skeleton, EmptyState, InlineError, LoadingDots
│   └── index.ts
├── vitest.config.ts
├── tsconfig.json
└── package.json
```

### 5.2 设计 Token 策略

**JS 常量导出**（类型安全）：

```ts
// tokens/colors.ts
export const colors = {
  status: {
    good: '#22c55e',
    warning: '#f59e0b',
    alert: '#ef4444',
    neutral: '#6b7280',
  },
  surface: {
    primary: '#0f172a',
    secondary: '#1e293b',
    elevated: '#334155',
  },
  text: {
    primary: '#f8fafc',
    secondary: '#94a3b8',
    muted: '#64748b',
  },
} as const;
```

**CSS custom properties**（主题切换）：

组件内通过 Tailwind `theme()` 或直接 CSS var 引用 token 值。

### 5.3 组件设计原则

- 所有组件使用 Tailwind CSS class + token 常量
- 接受 `className` prop 支持外部覆盖
- 使用 `forwardRef` 暴露 ref
- 暗黑主题为默认，不额外实现亮色主题
- 每个组件有对应 Vitest 测试

## 6. packages/charts (@health-advisor/charts)

### 6.1 包结构

```
packages/charts/
├── src/
│   ├── core/
│   │   ├── chart-root.tsx    # ECharts React wrapper
│   │   └── types.ts          # 图表通用类型
│   ├── builders/
│   │   ├── sleep.ts          # SLEEP_7DAYS, SLEEP_STAGE_LAST_NIGHT
│   │   ├── hrv.ts            # HRV_7DAYS, HRV_SLEEP_14DAYS_COMPARE
│   │   ├── resting-hr.ts     # RESTING_HR_7DAYS
│   │   ├── activity.ts       # ACTIVITY_7DAYS
│   │   ├── spo2.ts           # SPO2_7DAYS
│   │   └── stress.ts         # STRESS_LOAD_7DAYS
│   ├── micro/
│   │   └── micro-chart.tsx   # 内嵌微图表组件
│   ├── registry/
│   │   └── token-registry.ts # ChartTokenId → option builder 映射
│   ├── utils/
│   │   └── normalize.ts      # 时间序列标准化
│   └── index.ts
├── vitest.config.ts
├── tsconfig.json
└── package.json
```

### 6.2 ECharts React 封装

自定义轻量 wrapper（不用 echarts-for-react）：

```tsx
function ChartRoot({ option, width, height, className }: ChartRootProps) {
  // useRef 持有 ECharts 实例
  // useEffect 初始化实例 + 监听 option 变化（setOption）
  // useEffect cleanup dispose
  // ResizeObserver 响应容器尺寸变化
}
```

关键特性：

- 自动 dispose 防止内存泄漏
- option diff 更新（notMerge: false）
- 响应式尺寸

### 6.3 Option Builder 模式

每个 builder 是纯函数：`(data: StandardTimeSeries) => EChartsOption`

```ts
type ChartBuilder = (data: StandardTimeSeries) => EChartsOption;
```

Builder 职责：

- 将标准时间序列转换为 ECharts option
- 统一暗黑主题样式（颜色、字体、背景）
- 统一 tooltip/legend/grid 配置

### 6.4 Token Registry

```ts
const chartTokenRegistry: Record<ChartTokenId, ChartBuilder> = {
  [ChartTokenId.HRV_7DAYS]: buildHrv7Days,
  [ChartTokenId.SLEEP_7DAYS]: buildSleep7Days,
  // ...
};
```

前端页面通过 `ChartTokenId` 查找对应 builder，不直接引用 builder 函数。

## 7. data/sandbox

### 7.1 目录结构

```
data/
├── sandbox/
│   ├── manifest.json         # profile 列表 + 元数据
│   ├── profiles/
│   │   ├── profile-a.json    # Profile A 完整数据
│   │   ├── profile-b.json    # Profile B 完整数据
│   │   └── profile-c.json    # Profile C（边缘场景）
│   ├── fallbacks/
│   │   ├── homepage.json     # 首页 fallback
│   │   ├── view-summary.json # 数据摘要 fallback
│   │   └── advisor-chat.json # 顾问对话 fallback
│   ├── prompts/
│   │   ├── system.md         # 系统提示词
│   │   ├── homepage.md       # 首页分析提示词
│   │   ├── view-summary.md   # 数据摘要提示词
│   │   └── advisor-chat.md   # 顾问对话提示词
│   └── scenarios/
│       └── manifest.json     # God-Mode 场景列表
├── README.md
└── validate.ts               # 数据验证脚本
```

### 7.2 Profile 数据格式

```json
{
  "profileId": "profile-a",
  "name": "张健康",
  "age": 32,
  "gender": "male",
  "avatar": "👨‍💻",
  "baseline": {
    "restingHr": 62,
    "hrv": 58,
    "spo2": 98,
    "avgSleepMinutes": 420,
    "avgSteps": 8500
  },
  "records": [
    {
      "date": "2026-04-03",
      "hr": [62, 58, 65, ...],
      "sleep": { "totalMinutes": 420, "startTime": "23:00", "endTime": "06:00", "stages": { "deep": 90, "light": 180, "rem": 120, "awake": 30 }, "score": 85 },
      "activity": { "steps": 8500, "calories": 2200, "activeMinutes": 45, "distanceKm": 6.2 },
      "spo2": 98,
      "stress": { "load": 35 }
    }
  ]
}
```

### 7.3 三个 Profile 特征

| 特征     | Profile A    | Profile B     | Profile C     |
| -------- | ------------ | ------------- | ------------- |
| 整体状态 | 健康、规律   | 一般、波动    | 较差、压力高  |
| 睡眠     | 7h、评分 85+ | 5-6h、评分 60 | 4-5h、评分 40 |
| HRV      | 55-65、稳定  | 35-50、波动   | 25-35、下降   |
| 运动     | 每日 8000+步 | 不规律        | 久坐          |
| Stress   | 低、稳定     | 中等波动      | 高、持续上升  |
| 数据量   | 14 天完整    | 14 天有缺失   | 14 天部分缺失 |

### 7.4 Fallback 格式

```json
{
  "homepage": {
    "summary": "...",
    "chartTokens": ["HRV_7DAYS", "SLEEP_7DAYS"],
    "microTips": ["...", "..."]
  }
}
```

与 `AgentResponseEnvelope` 结构一致。

### 7.5 验证脚本

`data/validate.ts`：

- 验证所有 profile JSON 符合 Zod schema
- 检查日期连续性（无缺口）
- 检查引用完整性（scenario 引用的 profile 存在）
- 输出验证报告

## 8. 依赖关系图

```
packages/shared ← packages/sandbox
                ← packages/ui (tokens/constants)
                ← packages/charts (chart tokens/types)
                ← data/sandbox (via sandbox loader)

packages/sandbox ← data/sandbox (加载 JSON)
packages/charts ← packages/shared (无 sandbox 依赖)

apps/web ← packages/ui, packages/charts, packages/shared
apps/agent-api ← packages/shared, packages/sandbox
```

## 9. 测试策略

| 包      | 测试类型 | 重点                                       |
| ------- | -------- | ------------------------------------------ |
| shared  | 单元测试 | Zod schema parse/serialize，工具函数       |
| sandbox | 单元测试 | loader/select/merge/missing-value/timeline |
| ui      | 单元测试 | 组件渲染快照，props 变化                   |
| charts  | 单元测试 | option builder 输出，token registry 映射   |
| data    | 脚本验证 | schema 符合性，日期连续性                  |

## 10. Wave 1 DoD

- [ ] `packages/config` 导出 ESLint/Prettier/Vitest/TS 配置
- [ ] CI workflow 阻断合并
- [ ] `packages/shared` 可被 agent-api 和 web 导入
- [ ] 所有 shared 类型有对应 Zod schema
- [ ] `packages/sandbox` 可加载 data/sandbox JSON 并执行 select/merge
- [ ] `packages/ui` 提供 Container/Card/StatusBadge/Button/Skeleton 等基础组件
- [ ] `packages/charts` 可通过 ChartTokenId 渲染对应图表
- [ ] `data/sandbox` 包含 3 个完整 profile + fallback + prompts
- [ ] 所有包测试通过，coverage ≥ 80%
- [ ] `pnpm build` 通过
- [ ] `pnpm lint` 通过
- [ ] `pnpm typecheck` 通过
- [ ] `pnpm test` 通过
