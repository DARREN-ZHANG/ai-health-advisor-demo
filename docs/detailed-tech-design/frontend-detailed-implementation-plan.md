# AI Health Advisor Web Demo

# Frontend 子模块详细技术实现方案

## 1. 文档定位

本文档用于定义 `apps/web` 的详细技术实现方案。

本文档的角色是：

- 以技术架构文档为唯一系统级基线
- 以 PRD 作为页面交互与演示效果约束参考
- 将前端应用从“系统级模块”下钻到“可开发、可联调、可测试、可交付”的实现级设计

本文档不重复展开 Agent Runtime 和 Backend 应用内部实现；相关能力分别以前一阶段完成的 Agent / Backend 子模块方案为准。本文档重点说明 Web 前端如何组织页面、消费数据、渲染图表、落地 AI UI 协议，并承接 God-Mode 演示交互。

---

## 2. 目标与边界

## 2.1 Frontend 的目标

`apps/web` 需要完成以下目标：

1. 以 Next.js 15 App Router 形式实现 Demo 的全部前端界面
2. 完整承载 Homepage、Data Center、AI Advisor、God-Mode UI 四类前端体验
3. 消费后端结构化响应，稳定渲染 AI 文案、状态色、micro tips 与 chart token
4. 支持 Mobile / Tablet / Desktop 响应式布局
5. 支持 6 秒 AI 请求超时后的统一超时状态、取消等待与后端 fallback 渲染
6. 保证演示态切换平滑，不因 profile 切换、事件注入或局部 override 破坏主流程

## 2.2 Frontend 的范围内职责

Frontend 负责：

- 页面路由与布局编排
- 深色主题、状态色系统与视觉层级实现
- UI 组件装配与页面交互控制
- 基于共享 schema 消费后端 API
- 图表渲染与图表 token -> 组件映射
- Loading / Skeleton / Empty / Error / Fallback 的 UI 呈现
- 全局与局部客户端状态管理
- 响应式适配
- God-Mode 面板与演示态交互触发
- 前端 E2E 可测性与联调友好性

## 2.3 Frontend 的范围外职责

Frontend 不负责：

- 直接调用 LLM Provider
- Prompt 组装
- Session memory 管理
- Fallback 文案生成逻辑
- Agent 输出合法性校验
- 数据库与持久化
- 前端监控平台建设
- 医疗诊断级规则判断

---

## 3. 设计原则

1. **前端只消费结构，不猜语义**  
   页面状态、状态色、图表 token、fallback 标识、micro tips、元信息，都必须来自后端显式结构或共享协议，不从自然语言里反向猜测。

2. **Demo 优先稳定、次优先精致**  
   所有设计优先保证演示过程不翻车：状态切换要平滑、请求失败要可降级、数据缺失要可显示、组件重绘要可控。

3. **页面与数据解耦**  
   页面组件不直接依赖原始 JSON 文件；只依赖 API 和共享类型。这样可以支持 UI-only mock、联调、fallback-only 三种运行模式。

4. **状态分层，不把所有状态塞进一个 store**  
   远程数据使用 TanStack Query；跨页面 UI 状态与演示态使用 Zustand；局部表单和瞬时交互尽量使用组件内状态。

5. **图表是受控组件，不是自由画布**  
   图表类型、参数、配色、阈值、基准线、异常点语义应由共享协议约束，而不是在页面里随意拼装。

6. **响应式优先从布局骨架设计开始**  
   不是在桌面端完成后再“压缩成移动端”，而是在布局层级上预先定义 mobile/tablet/desktop 的卡片堆叠、抽屉行为和触控区域。

---

## 4. Frontend 在总体架构中的位置

```text
Browser
  └─ apps/web
      ├─ App Router pages
      ├─ Layout system
      ├─ Feature modules
      ├─ Zustand stores
      ├─ TanStack Query hooks
      ├─ packages/ui
      ├─ packages/charts
      └─ packages/shared
              |
              v
        apps/agent-api
```

前端不是被动“展示层”，而是：

- 用户可见交互的唯一承载层
- 演示流程的主要节奏控制层
- chart token 与结构化 AI 响应的解释执行层
- God-Mode 演示效果的最终呈现层

但前端仍然不是业务真相来源。系统真相来自后端响应与共享协议。

---

## 5. 与 Monorepo 其他包的依赖边界

## 5.1 允许依赖

### `packages/shared`

用于放置：

- 前后端共享 TypeScript types
- Zod schemas
- API request / response 协议
- chart token 类型定义
- 状态色枚举、tab/timeframe 枚举
- error code 与 fallback source 常量

### `packages/ui`

用于放置：

- 通用基础 UI 组件
- 设计系统 token 封装
- 状态徽标、卡片、按钮、抽屉、sheet、tabs 等复用组件
- Skeleton、Empty、Inline Error、Badge、Pill、Section Header 等通用部件

### `packages/charts`

用于放置：

- ECharts React 封装
- 图表 option builder
- 时间序列标准化工具
- chart token -> chart renderer registry
- 微型图表与标准图表组件

## 5.2 不允许依赖方向

- `apps/web` 不得直接读取 `data/sandbox/*`
- `apps/web` 不得直接依赖 `packages/agent-core`
- `packages/ui` 不得依赖 `apps/web`
- `packages/charts` 不得依赖具体页面组件
- 页面组件不得各自私有实现一套 chart token 解析规则

## 5.3 Frontend 自身保留内容

以下内容必须保留在 `apps/web`：

- App Router 页面与 layout
- 路由级 loading / error / not-found
- TanStack Query provider 与客户端配置
- Zustand store 装配
- feature 级 hooks
- 页面组合组件
- God-Mode feature module
- AI Advisor 容器与消息流交互
- 与后端 API 的请求适配层

---

## 6. Frontend 应用目录设计

建议目录：

```text
apps/web/
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx                       # Homepage
│   │   ├── data-center/
│   │   │   └── page.tsx
│   │   ├── advisor/
│   │   │   └── page.tsx                   # 可选独立入口；主入口仍可由全局气泡触发
│   │   ├── globals.css
│   │   ├── loading.tsx
│   │   ├── error.tsx
│   │   └── not-found.tsx
│   ├── providers/
│   │   ├── app-providers.tsx
│   │   ├── query-provider.tsx
│   │   ├── theme-provider.tsx
│   │   └── motion-provider.tsx
│   ├── lib/
│   │   ├── env.ts
│   │   ├── api-client.ts
│   │   ├── fetcher.ts
│   │   ├── query-keys.ts
│   │   ├── time.ts
│   │   ├── numbers.ts
│   │   ├── text.ts
│   │   ├── chart-token.ts
│   │   ├── responsive.ts
│   │   └── cn.ts
│   ├── stores/
│   │   ├── profile.store.ts
│   │   ├── god-mode.store.ts
│   │   ├── ai-advisor.store.ts
│   │   ├── data-center.store.ts
│   │   ├── ui.store.ts
│   │   └── active-sensing.store.ts
│   ├── services/
│   │   ├── profile.service.ts
│   │   ├── ai.service.ts
│   │   ├── data-center.service.ts
│   │   └── god-mode.service.ts
│   ├── hooks/
│   │   ├── use-profile.ts
│   │   ├── use-homepage.ts
│   │   ├── use-data-center.ts
│   │   ├── use-view-summary.ts
│   │   ├── use-ai-chat.ts
│   │   ├── use-god-mode.ts
│   │   ├── use-chart-renderer.ts
│   │   ├── use-responsive-shell.ts
│   │   └── use-ai-timeout.ts
│   ├── features/
│   │   ├── shell/
│   │   │   ├── app-shell.tsx
│   │   │   ├── top-nav.tsx
│   │   │   ├── page-container.tsx
│   │   │   └── floating-ai-entry.tsx
│   │   ├── homepage/
│   │   │   ├── homepage-screen.tsx
│   │   │   ├── morning-brief-card.tsx
│   │   │   ├── active-sensing-banner.tsx
│   │   │   ├── micro-insights-row.tsx
│   │   │   ├── historical-trends-grid.tsx
│   │   │   └── trend-card.tsx
│   │   ├── data-center/
│   │   │   ├── data-center-screen.tsx
│   │   │   ├── tab-switcher.tsx
│   │   │   ├── timeframe-switcher.tsx
│   │   │   ├── overview-brief.tsx
│   │   │   ├── chart-panel.tsx
│   │   │   ├── anomaly-legend.tsx
│   │   │   └── summarize-current-view-fab.tsx
│   │   ├── ai-advisor/
│   │   │   ├── advisor-shell.tsx
│   │   │   ├── advisor-drawer.tsx
│   │   │   ├── advisor-bottom-sheet.tsx
│   │   │   ├── message-list.tsx
│   │   │   ├── message-item.tsx
│   │   │   ├── chart-message-block.tsx
│   │   │   ├── smart-prompts.tsx
│   │   │   ├── physiological-tags.tsx
│   │   │   └── chat-composer.tsx
│   │   ├── god-mode/
│   │   │   ├── god-mode-panel.tsx
│   │   │   ├── profile-switcher.tsx
│   │   │   ├── event-injector.tsx
│   │   │   ├── metric-override-editor.tsx
│   │   │   ├── scene-reset.tsx
│   │   │   └── demo-script-trigger.tsx
│   │   └── feedback/
│   │       ├── skeletons.tsx
│   │       ├── empty-state.tsx
│   │       ├── inline-error.tsx
│   │       └── offline-fallback.tsx
│   ├── types/
│   │   └── ui-models.ts
│   └── tests/
│       ├── unit/
│       ├── integration/
│       └── e2e/
├── public/
└── package.json
```

---

## 7. 路由与页面骨架设计

## 7.1 路由设计

建议保留最小路由集：

- `/`：Homepage
- `/data-center`：Data Center
- `/advisor`：可选独立 advisor 页面入口，便于桌面演示与调试

AI Advisor 的主要形态仍然是全局浮动入口，而不是完全依赖独立页面。独立 `/advisor` 只用于：

- 全屏调试
- E2E 稳定定位
- 演示场景备用入口

## 7.2 统一布局骨架

根布局 `app/layout.tsx` 应统一提供：

- 深色背景与基础 typography
- Query Provider
- Theme / Motion Provider
- 全局浮动 AI 气泡入口
- 全局 God-Mode 面板挂载点（仅开启环境变量时）
- Active Sensing Banner 全局挂载点
- Toast / transient feedback 挂载点

## 7.3 Page Shell 约束

统一页面壳负责：

- 顶部导航
- 页面级 header
- 安全区 padding
- max-width 控制
- responsive gutter
- 背景光晕和状态色边缘

页面本体只负责内容区，不各自重复实现壳层。

---

## 8. 运行模式与数据来源策略

前端必须支持三种运行模式：

### 8.1 UI 开发模式

- 后端不可用
- 使用 mock service 或本地 fixture
- 用于纯 UI 开发与视觉联调

### 8.2 联调模式

- 连接真实 `apps/agent-api`
- 用于完整 profile / AI / God-Mode 联调

### 8.3 演示保底模式

- 可连接 agent-api，但允许后端返回 fallback-only
- 前端本身也要在 AI 请求超时时执行 UI 降级

实现方式建议：

- 通过 `NEXT_PUBLIC_AGENT_API_BASE_URL` 判断远端目标
- 通过环境变量或 mock 开关切换 service adapter
- 所有页面只依赖 service 层，不直接 `fetch`

---

## 9. 状态管理设计

## 9.1 状态分层原则

### 使用 TanStack Query 的内容

适合远程异步、可缓存、可失效重取的数据：

- 当前 profile 详情
- Homepage 数据与晨报
- Data Center 图表数据
- AI view summary 返回
- AI chat 的远端发送动作结果
- God-Mode 操作后的刷新数据

### 使用 Zustand 的内容

适合跨组件共享、与远端 cache 不完全一致的 UI / runtime 状态：

- 当前选中的 profileId
- God-Mode 面板开关与草稿编辑态
- Data Center 当前 tab / timeframe / custom range
- AI Advisor 抽屉开关、当前输入、当前会话消息列表
- Active Sensing banner 的展示态
- 全局 UI 偏好与瞬时状态

### 使用组件内 state 的内容

适合局部、短生命周期状态：

- 表单输入焦点
- tooltip / hover
- 局部展开折叠
- 单个组件内部动画阶段

## 9.2 关键 Store 定义

### `profile.store.ts`

负责：

- `currentProfileId`
- `setCurrentProfileId`
- `resetProfileScopedUiState`

约束：

- 切换 profile 时，不强制路由跳转
- 但需要触发相关 query key 失效和页面局部刷新

### `data-center.store.ts`

负责：

- `currentTab`
- `currentTimeframe`
- `customRange`
- `setTab`
- `setTimeframe`
- `resetToDefaults`

### `ai-advisor.store.ts`

负责：

- `isOpen`
- `displayMode`（drawer / sheet / page）
- `messages`
- `composerValue`
- `isSending`
- `appendMessage`
- `replacePendingMessage`
- `clearConversation`

说明：消息列表应保存在 UI store 侧，便于即时展示 pending / fallback 气泡；但消息规范必须与后端协议一致。

### `active-sensing.store.ts`

负责：

- `banner`
- `showBanner`
- `dismissBanner`
- `queueBanner`

该 store 的优先级高于普通页面内容区。

### `god-mode.store.ts`

负责：

- `isPanelOpen`
- `draftEventInjection`
- `draftMetricOverrides`
- `lastAppliedScenario`
- `isApplying`

---

## 10. API 消费与服务层设计

## 10.1 服务层目标

前端必须通过服务层调用后端，而不是在页面里散落 `fetch`。这样便于：

- mock 与真实接口切换
- 统一错误处理
- 统一超时控制
- 请求头、sessionId、profileId 注入
- 响应 schema 校验

## 10.2 服务模块建议

### `profile.service.ts`

提供：

- `getProfiles()`
- `getProfile(profileId)`

说明：

- Homepage 不走单独的 `getHomepageData()` 聚合协议
- Homepage 数据由 `getProfile(profileId)` + `getTimeline(...)` + `createMorningBrief(...)` 组合得到

### `data-center.service.ts`

提供：

- `getTimeline(profileId, tab, timeframe, customRange?)`
- `getChartPayload(profileId, chartToken, options?)`
- `getViewSummary(payload)`

### `ai.service.ts`

提供：

- `createMorningBrief(payload)`
- `createViewSummary(payload)`
- `sendAdvisorMessage(payload)`
- `sendAdvisorMessageStream(payload)`（预留）

### `god-mode.service.ts`

提供：

- `getState()`
- `switchProfile(payload)`
- `injectEvents(payload)`
- `overrideMetric(payload)`
- `applyScenario(payload)`
- `reset(payload)`
- `runDemoScript(payload)`

## 10.3 Session 与 Request 上下文

`sessionId` 由后端统一解析与签发。前端的职责是获取、缓存并透传后端已经签发的 `sessionId`。正式规则：

- 首次请求后，优先从 `ApiSuccess.meta.sessionId` 或响应 cookie 中获取 `sessionId`
- 浏览器会话内可缓存在 `sessionStorage`
- 前端不得本地生成 `sessionId`
- profile 切换不重置 `sessionId`，但它只代表浏览器会话，不代表可跨 profile 复用的聊天记忆
- 触发 profile switch 后，前端必须假定旧 profile 的 AI 结果与对话记忆全部失效，并依赖后端清空该 `sessionId` 绑定的旧 profile memory
- 页面刷新后允许 sessionId 续用

---

## 11. Homepage 详细实现方案

Homepage 负责实时状态与行动指南展示，必须包含 AI 晨报卡片、Active Sensing 横幅、Micro-Insights 与 Historical Trends。该模块直接对应 PRD 与系统架构中对首页的要求。

## 11.1 页面组成

```text
HomepageScreen
├── ActiveSensingBanner (global mount, conditional)
├── MorningBriefCard
├── MicroInsightsRow
└── HistoricalTrendsGrid
    ├── SleepTrendCard
    ├── HeartRateTrendCard
    ├── ActivityTrendCard
    └── VitalsTrendCard
```

## 11.2 Morning Brief Card

职责：

- 展示状态色（green / yellow / red）
- 展示 80-120 字摘要文案
- 展示来源标识（llm / fallback / rule）
- 可选展示 last updated 时间

UI 要求：

- 位于首屏黄金区域
- 卡片边缘或背景 glow 使用状态色
- 文案切换使用淡出淡入，不做生硬闪烁
- loading 时显示高保真 skeleton

数据来源：

- 后端结构化返回
- 不从历史聊天里推导

## 11.3 Active Sensing Banner

职责：

- 响应 God-Mode 或实时事件注入
- 无论当前页面在哪里，都从顶部高优先级下拉显示

交互要求：

- 不触发路由跳转
- dismiss 后恢复原视图
- 若在 AI Advisor 中也必须可见

实现建议：

- 在根布局挂载一个 portal 容器
- banner 数据由 `active-sensing.store` 控制
- 使用 Framer Motion 做 enter / exit

## 11.4 Micro Insights Row

职责：

- 展示一组药丸式短提示
- 支持横向滚动
- 每个 pill 对应状态色或中性色

实现建议：

- 对于 0 项：整块区域不渲染
- 对于 >4 项：横滑，不换行堆高页面
- 文案过长时截断 + tooltip

## 11.5 Historical Trends Grid

职责：

- 展示睡眠、心率、消耗、生理指标等模块化趋势卡
- 支持拖拽排序，但拖拽能力可分阶段交付

实现建议：

- 首阶段先实现固定排序
- 二阶段再接入拖拽（如 dnd-kit）
- 每张卡片使用标准化小型 ECharts 折线图
- 缺失值使用断点展示，不强连

---

## 12. Data Center 详细实现方案

Data Center 负责深度审计与复盘，需要支持 tab、timeframe、综合简报、指标图表与“AI 总结当前视图”。

## 12.1 页面组成

```text
DataCenterScreen
├── Header
├── TabSwitcher
├── TimeframeSwitcher
├── OverviewBrief / SectionSummary
├── ChartPanel
├── AnomalyLegend
└── SummarizeCurrentViewFAB
```

## 12.2 Tab 模型

系统级固定 tab：

- `overview`
- `sleep`
- `heart_rate`
- `activity`
- `stress`
- `vitals`

`stress` 是正式 tab，不是占位页。前端必须按 shared / backend 已冻结的 `StressTimelineResponse` 渲染：

- 主图为 `stressLoadScore` 的 0-100 时间序列
- 图上断点表示当日有效 signal 少于 2 项，不允许补值
- tooltip 必须展示 `hrvPenalty / restingHrPenalty / sleepDebtPenalty / deepSleepPenalty`
- supporting events 以 marker / annotation 呈现，但不伪装成分数来源
- 顶部 summary 区消费 `avgStressLoadScore / peakStressLoadScore / highStressDays / strongestContributor`

需要强调：这个 tab 展示的是基于现有 sleep / heart rate / HRV 数据推导出的 **Stress Load Proxy**，不是医学压力诊断结果。

## 12.3 Timeframe 模型

固定值：

- `day`
- `week`
- `month`
- `year`

可预留 `custom` 以便后续扩展，但首阶段 UI 不一定必须暴露。

> **首阶段标注**：`custom` 时间范围为 P1 功能。Wave 4 的 Data Center timeframe 控件首阶段仅暴露 `day / week / month / year`；`custom` 需要额外的日期选择器 UI，在 Wave 4 之后按 P1 优先级补齐。shared DTO 中 `rangeType: 'custom'` 保持存在，不影响后端和协议层。

## 12.4 Overview Brief

职责：

- 展示当前 tab/timeframe 下的简报摘要
- 对 `overview` tab 展示全览综合简报
- 对非 overview tab 展示该维度 summary

约束：

- 该区域与晨报不同，它是“当前筛选视图”的总结
- 如果用户点击“AI 总结当前视图”，则 summary 需要可替换或在右侧 / 弹层展示新增总结

## 12.5 Chart Panel

职责：

- 渲染主图表
- 支持 tooltip
- 支持 baseline 线
- 支持 anomaly 点高亮
- 支持断点数据

实现建议：

- 统一使用 `packages/charts` 中的 option builder
- 页面只传 `series model`
- 通过共享协议控制：line / area / multi-line / marker / reference line

## 12.6 AI 总结当前视图 FAB

职责：

- 点击后基于当前 profile、tab、timeframe、图表窗口发起 view summary 请求
- 展示 loading skeleton 和科技感微文案
- 6 秒超时后结束等待态，并切换到统一 timeout state；最终仍只消费后端返回的结构化 fallback 或错误结果

形态建议：

- 移动端：底部悬浮按钮
- 桌面端：右下悬浮按钮
- 返回结果：可选择 drawer/modal/inline summary card

---

## 13. AI Advisor 详细实现方案

AI Advisor 是全局悬浮气泡，用户可在任何页面打开。它必须支持对话、多模态消息、Smart Prompts 与生理标签展示。

## 13.1 展示形态

- Mobile：Bottom Sheet
- Tablet：较窄 Drawer 或大号 Sheet
- Desktop：右侧 Drawer

必须通过统一容器 `advisor-shell.tsx` 决定具体渲染策略，而不是在每个页面分别判断。

## 13.2 页面结构

```text
AdvisorShell
├── Header
│   ├── Title
│   ├── PhysiologicalTags
│   └── Close / Expand
├── SmartPrompts
├── MessageList
│   ├── UserMessageItem
│   ├── AssistantMessageItem
│   ├── ChartMessageBlock
│   ├── MessageSkeleton
│   └── FallbackMessageBlock
└── ChatComposer
```

## 13.3 消息模型

前端消息模型建议与后端结构化协议一一对应：

```ts
interface AdvisorUiMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  status: 'complete' | 'pending' | 'failed';
  source?: 'llm' | 'fallback' | 'rule';
  statusColor?: 'green' | 'yellow' | 'red';
  summary?: string;
  chartTokens?: ChartTokenId[];
  microTips?: string[];
  meta?: {
    requestId?: string;
    sessionId?: string;
    taskType?: 'homepage_brief' | 'view_summary' | 'advisor_chat' | 'micro_insight';
    pageContext?: 'homepage' | 'data_center' | 'ai_advisor';
    latencyMs?: number;
    finishReason?: 'stop' | 'timeout' | 'provider_error' | 'invalid_output' | 'low_data';
    timestamp?: string;
  };
}
```

其中 assistant 的 `complete` 消息应是 `AgentResponseEnvelope` 的 UI 投影。后端正式使用 `ApiSuccess<T>` 包装，因此服务层必须先按 shared schema 解包 `data`，再进入 UI 状态。

## 13.4 Smart Prompts

职责：

- 提供一组快捷提问入口
- 点击后将 prompt 注入输入框或直接发送

建议首批模板：

- “总结我最近一周的恢复情况”
- “为什么我这几天 HRV 下降了？”
- “给我今晚的行动建议”
- “比较最近 7 天和之前 7 天”

## 13.5 Physiological Tags

职责：

- 展示 profile 对应 tags
- 作为对话上下文辅助信息

表现建议：

- 不要占据太大高度
- 2-4 个 pill 优先展示
- 超出数量折叠

## 13.6 Chat Composer

职责：

- 输入文本
- Enter 发送，Shift+Enter 换行
- 发送后立即插入用户消息与 assistant pending skeleton

约束：

- 当请求进行中，仍允许编辑下一条输入，但应禁用连续并发发送，除非明确支持队列
- 空文本不允许发送

## 13.7 Streaming 兼容策略

架构允许 HTTP / SSE。前端首阶段应支持非流式完整消息返回；同时保留 SSE 兼容层：

- 无流式：pending -> replace complete
- 有流式：token chunk -> partial message -> finalize

不要让消息 UI 与传输层强耦合。

---

## 14. God-Mode UI 详细实现方案

God-Mode 是正式架构的一部分，不是临时 debug 面板。前端需要为演示者提供可控但不破坏流程的控制界面。

## 14.1 开启条件

由 `NEXT_PUBLIC_ENABLE_GOD_MODE` 控制。关闭时：

- 不渲染入口
- 不暴露相关快捷键
- 不加载重型编辑器依赖

## 14.2 面板内容

- Profile 切换
- 事件注入
- 指标局部覆盖
- 场景恢复
- 演示脚本触发

## 14.3 交互规则

### Profile 切换

- 切换后不跳页面
- 失效相关 query
- 重置 profile-scoped UI 状态
- Homepage/Data Center 原地丝滑刷新

### 瞬时事件注入

- 调用接口成功后立即弹出 Active Sensing Banner
- 不关闭当前页面或 ChatBox

### 指标覆盖

- 成功后触发局部重绘
- 若当前页面为 Homepage，晨报卡片颜色和文案做平滑过渡

### 场景恢复

- 恢复到 profile 基础态
- 清理 event / metric override 造成的派生 UI 状态

## 14.4 安全护栏

即便是 Demo 面板，也要有基本护栏：

- 输入值走 schema 校验
- 提交按钮防重复点击
- 失败时可重试
- 显示“只影响当前运行时，不回写基础数据”说明

---

## 15. 图表系统详细实现方案

图表是本前端的核心能力之一。系统要求图表既能用于页面主图，又能嵌入 AI 消息中的微图表。

## 15.1 分层设计

### `packages/charts` 负责

- `BaseEChart` React 包装
- resize 处理
- loading / empty / error overlay
- option builders
- 消费后端返回的结构化 chart payload / timeline view model
- 多种 health chart 模板
- 基于 shared 白名单的 chart renderer registry

### `apps/web` 负责

- 选择何时渲染哪种图表
- 提供 profile / timeframe / current tab 上下文
- 消息气泡中的布局约束

## 15.2 图表类型建议

首阶段至少实现：

- `MetricLineChart`
- `DualMetricLineChart`
- `SleepStageStackChart`（若数据适合）
- `MiniTrendChart`
- `ComparisonMiniChart`

## 15.3 chart token 渲染协议

系统要求后端返回受控 chart token，前端根据 token 渲染对应组件。

建议实现：

```ts
interface ChartTokenDefinition {
  type: ChartTokenId;
  component: React.ComponentType<ChartRenderPayload>;
}
```

典型 token：

- `HRV_7DAYS`
- `SLEEP_7DAYS`
- `RESTING_HR_7DAYS`
- `ACTIVITY_7DAYS`
- `SPO2_7DAYS`
- `SLEEP_STAGE_LAST_NIGHT`
- `STRESS_LOAD_7DAYS`
- `HRV_SLEEP_14DAYS_COMPARE`

完整白名单与 `packages/shared` 中冻结的 `ChartTokenId` 一致，共计 8 个 token。

前端不解析任意字符串，而是：

1. 接收后端 `chartTokens: ChartTokenId[]`
2. 按白名单 registry 查找
3. 通过后端 chart API 或当前页面已加载的结构化 view model 获取 `ChartRenderPayload`
4. 对 payload 做 schema 校验后渲染对应 chart block

约束：

- 前端不直接读取 raw sandbox
- 前端不根据 token 自己做日期窗口推导或指标聚合
- token 只表示“允许展示的图表类型”，不表示前端可自行发明数据选择逻辑

## 15.4 断点与异常点处理

架构与 PRD 均要求：

- 缺失数据不能幻觉补全
- 图表需支持断点显示
- 异常点需要可视标记
- baseline 线需要受控渲染

因此 option builder 必须内建：

- `connectNulls: false` 或等效断点策略
- anomaly marker 生成
- reference line builder

---

## 16. 设计系统与视觉规范落地

## 16.1 主题

PRD 已固定全局暗黑模式，因此前端不做浅色主题切换。

建议主题层次：

- 页面背景：近黑蓝 / 深灰
- 卡片背景：较浅一级深色
- 文本：高对比灰白
- 状态色：green / yellow / red 三套 token

## 16.2 状态色系统

所有状态色应来自统一 token，而不是页面写死十几种近似颜色。

建议：

- `health.green.*`
- `health.yellow.*`
- `health.red.*`
- `health.neutral.*`

作用范围：

- 晨报卡片边缘与 glow
- micro tips pill
- AI 消息中的状态徽标
- anomaly 点与告警边框
- button emphasis

## 16.3 动效原则

- 页面级切换轻量，不做复杂转场
- 卡片文案更新使用 opacity + y 轴轻微过渡
- Banner 与 Drawer 使用 Framer Motion 统一动效
- 图表区域不做过度动画，避免“抖动感”

---

## 17. Loading / Empty / Error / Fallback 设计

## 17.1 Loading

系统必须支持以下 loading：

- 首页晨报 loading skeleton
- Data Center summary loading skeleton
- Data Center 主图表 loading skeleton
- AI Advisor pending message skeleton
- God-Mode 执行中按钮 loading

## 17.2 Empty

适用场景：

- 某个 tab 在当前 timeframe 内几乎没有数据
- 某 profile 缺少某类指标
- AI chart token 无法在当前上下文解析

空态文案必须明确说明“数据不足”而非“系统异常”。

## 17.3 Error

适用场景：

- 服务不可达
- schema 校验失败
- God-Mode 操作失败

策略：

- 页面级错误尽量少，优先局部错误块
- 不在 Demo 中将技术栈错误直接暴露给观众

## 17.4 Fallback

前端必须严格区分 **timeout state** 与 **fallback content**：

### 后端 fallback

后端正常返回 `source = fallback` 的结构化内容，前端按正常 assistant message / summary card 渲染。

### 前端 timeout state

当请求超过 6 秒：

- 结束本地等待态与 typing / skeleton 动画，并切换到 timeout state
- 渲染统一的 timeout hint / retry UI
- 该 6 秒边界只影响前端展示状态，不构成第二套 fallback 判定
- 不在前端生成伪造的 assistant 文案或 `source = fallback` 消息
- 只有当后端真正返回结构化 fallback 内容时，才按 fallback assistant message 渲染；timeout state 与后端 fallback 必须能收敛到同一条正式结果

---

## 18. 响应式实现方案

系统必须支持 Mobile、Tablet、Desktop。

## 18.1 断点建议

- Mobile: `< 768px`
- Tablet: `768px - 1279px`
- Desktop: `>= 1280px`

## 18.2 Homepage 响应式

- Mobile：单列卡片流
- Tablet：晨报全宽 + 趋势 2 列
- Desktop：晨报主卡 + 趋势网格 2-3 列

## 18.3 Data Center 响应式

- Mobile：tab 可横滑、timeframe 紧凑、图表单列
- Tablet：summary + chart 纵向堆叠
- Desktop：summary 与 chart 更宽布局，可保留右下 FAB

## 18.4 AI Advisor 响应式

- Mobile：Bottom Sheet，默认占屏 70-85% 高度
- Tablet：宽 Sheet 或中等 Drawer
- Desktop：右侧 Drawer，宽度固定区间

## 18.5 God-Mode 响应式

- Mobile：仅保留隐藏入口或极简面板，不作为主演示形态
- Desktop：侧边浮层或抽屉，是主控制形态

---

## 19. 前端与共享协议的契约要求

前端必须依赖 `packages/shared` 中的 schema 和 type，不允许自行定义一份近似接口。

关键共享契约包括：

- `SandboxProfile`
- `DailyRecord`
- `ApiSuccess<T>`
- `AgentResponseEnvelope`
- `CurrentProfileResponse`
- `TimelineResponse`
- `StressTimelineResponse`
- `ChartTokenId`
- `StatusColor`
- `DataTab`
- `Timeframe`
- `GodModeStateResponse`
- `MetricOverridePatch`
- `ApiError`

建议所有服务层响应在进入 UI 前再次走一层 Zod parse，以尽早暴露联调错误。

---

## 20. 前端测试策略

## 20.1 单元测试

覆盖重点：

- store 行为
- chart token resolver
- AI timeout state hook
- formatter / mapper / selector
- 消息模型转换器

## 20.2 组件测试

覆盖重点：

- MorningBriefCard 状态色切换
- ActiveSensingBanner 显示 / dismiss
- DataCenter tab/timeframe 切换
- Advisor 消息列表与 pending 消息替换
- God-Mode 表单校验

## 20.3 集成测试

覆盖重点：

- profile 切换引发相关 query 失效与局部刷新
- view summary 调用与结果展示
- chart token -> 组件渲染链路
- AI timeout state 与后端 fallback 收敛链路

## 20.4 E2E 测试

最少覆盖：

1. Homepage 晨报展示
2. Data Center 切换 tab 与 timeframe
3. AI Advisor 正常问答
4. AI Advisor 6 秒 fallback
5. profile 切换不跳页面但数据刷新
6. God-Mode 事件注入触发顶部横幅
7. chart token 在消息中被渲染成微图表

---

## 21. 性能与可维护性要求

## 21.1 性能要求

- 非首屏模块延迟加载
- ECharts 组件尽量按需加载
- God-Mode 重型编辑模块按需加载
- drawer / sheet 关闭时可选择卸载非关键内容

## 21.2 避免的反模式

- 页面组件直接 `fetch`
- 一个 store 管所有状态
- 在组件里手写图表 option 巨对象
- 通过解析 assistant 自然语言提取状态色
- profile 切换后全站强刷
- 未区分 loading / empty / error / fallback

## 21.3 可维护性要求

- feature-first 组织页面模块
- 共用 UI 必须抽入 `packages/ui`
- 图表逻辑必须抽入 `packages/charts`
- hooks 按业务语义命名，而非按 HTTP 动作命名

---

## 22. 与 Backend / Agent 的联调边界

前端需要明确知道哪些事情由后端负责，哪些由前端负责。

## 22.1 后端负责，前端不得接管

- LLM 调用
- system prompt / task prompt
- session memory
- response parser 与 token 合法性校验
- fallback 文案生成

## 22.2 前端负责，后端不应侵入

- Drawer / Sheet / FAB / Banner 具体呈现
- chart token 的最终视觉组件映射
- loading skeleton 与动效
- profile 切换后的 UI reset 细节
- AI 消息列表和 pending 状态管理

## 22.3 联调约束

- 后端返回的结构缺字段时，前端应显式暴露开发错误而不是静默吞掉
- chart token 未注册时，渲染受控的 Unsupported Chart Block
- 新增 tab / timeframe / chart token 时，必须先更新 shared 协议

---

## 23. 实施顺序建议

## 阶段 1：壳层与基础设施

- 根布局
- Provider 装配
- API client
- Query / Store 基础设施
- 全局主题与状态色 token

## 阶段 2：Homepage

- 晨报卡片
- micro insights
- trend cards
- active sensing banner

## 阶段 3：Data Center

- tabs / timeframe
- overview summary
- chart panel
- current view summary

## 阶段 4：AI Advisor

- floating entry
- responsive drawer / sheet
- message list
- smart prompts
- chart token rendering

## 阶段 5：God-Mode

- panel shell
- profile switch
- event injection
- metric override
- scene reset

## 阶段 6：Fallback / polish / E2E

- AI timeout state
- empty / error / retry
- motion polish
- end-to-end 场景测试

---

## 24. 可直接分配的开发任务拆分

以下任务以“sub coding task”粒度拆分，可直接进入执行。

### A. 基础设施与壳层

1. 初始化 `apps/web` 的 App Router 根布局
2. 集成 Query Provider
3. 集成 Zustand store 装配
4. 创建前端环境变量读取模块
5. 创建统一 API client 与 fetch wrapper
6. 创建 query key 工具
7. 创建根级 shell 组件
8. 创建顶部导航组件
9. 创建页面容器与 max-width 布局组件
10. 创建全局 portal 挂载点

### B. 设计系统与通用组件

11. 在 `packages/ui` 中落地深色主题 token
12. 实现状态色 badge / pill 组件
13. 实现通用 card 容器
14. 实现 skeleton 组件集
15. 实现 inline error / empty state 组件
16. 实现 drawer / sheet 外壳封装
17. 实现 FAB 按钮组件
18. 实现 section header 组件

### C. 状态管理

19. 实现 `profile.store.ts`
20. 实现 `data-center.store.ts`
21. 实现 `ai-advisor.store.ts`
22. 实现 `god-mode.store.ts`
23. 实现 `active-sensing.store.ts`
24. 实现 profile 切换时的 UI reset 流程

### D. 服务层与 hooks

25. 实现 `profile.service.ts`
26. 实现 `data-center.service.ts`
27. 实现 `ai.service.ts`
28. 实现 `god-mode.service.ts`
29. 实现 `use-profile`
30. 实现 `use-homepage`
31. 实现 `use-data-center`
32. 实现 `use-view-summary`
33. 实现 `use-ai-chat`
34. 实现 `use-god-mode`
35. 实现 `use-ai-timeout`

### E. Homepage

36. 实现 `homepage-screen.tsx`
37. 实现 `morning-brief-card.tsx`
38. 实现 `micro-insights-row.tsx`
39. 实现 `historical-trends-grid.tsx`
40. 实现四类趋势卡片的组合层
41. 实现 `active-sensing-banner.tsx`
42. 接入 profile 切换后的首页平滑刷新

### F. Data Center

43. 实现 `data-center-screen.tsx`
44. 实现 `tab-switcher.tsx`
45. 实现 `timeframe-switcher.tsx`
46. 实现 `overview-brief.tsx`
47. 实现 `chart-panel.tsx`
48. 实现 `anomaly-legend.tsx`
49. 实现 `summarize-current-view-fab.tsx`
50. 实现 view summary 结果展示容器
51. 接入 stress tab 视图模型、局部刷新与 skeleton

### G. 图表系统

52. 在 `packages/charts` 中实现 `BaseEChart`
53. 实现时间序列 line chart builder
54. 实现 anomaly point builder
55. 实现 baseline line builder
56. 实现 mini trend chart 组件
57. 实现 chart token registry
58. 实现 `use-chart-renderer`
59. 实现 AI 消息内微图表 block
60. 实现缺失数据断点展示策略

### H. AI Advisor

61. 实现全局 floating AI entry
62. 实现 `advisor-shell.tsx`
63. 实现 desktop drawer 版本
64. 实现 mobile bottom sheet 版本
65. 实现 `message-list.tsx`
66. 实现 `message-item.tsx`
67. 实现 pending message skeleton
68. 实现 fallback message block
69. 实现 `smart-prompts.tsx`
70. 实现 `physiological-tags.tsx`
71. 实现 `chat-composer.tsx`
72. 接入正常问答与 pending -> complete 替换
73. 接入 AI timeout state 策略

### I. God-Mode

74. 实现 God-Mode 入口与面板壳
75. 实现 profile switcher
76. 实现 event injector
77. 实现 metric override editor
78. 实现 scene reset 操作
79. 实现 demo script trigger
80. 实现事件注入后强制展示 Active Sensing Banner
81. 实现 metric override 后首页局部重绘动画

### J. 测试与收尾

82. 为 store 编写单元测试
83. 为 chart token resolver 编写单元测试
84. 为 AI timeout state hook 编写单元测试
85. 为 MorningBriefCard 编写组件测试
86. 为 Data Center 切换编写组件测试
87. 为 Advisor 消息流编写集成测试
88. 编写 Homepage E2E
89. 编写 Data Center E2E
90. 编写 Advisor E2E
91. 编写 AI timeout / backend fallback E2E
92. 编写 God-Mode 事件注入 E2E
93. 做一轮响应式手工验收
94. 做一轮演示链路手工 rehearsal

---

## 25. 交付完成判定

当前阶段 frontend 完成的判定标准：

1. `apps/web` 可独立启动并正常渲染三大核心页面
2. 前端能够稳定消费后端结构化响应
3. Homepage、Data Center、AI Advisor、God-Mode UI 均可联调
4. chart token 能够被正确映射为 ECharts 组件
5. 6 秒超时后能够执行可见、可控、统一的 timeout 呈现，并正确消费后端 fallback
6. profile 切换、事件注入、局部覆盖不破坏演示主流程
7. Mobile / Tablet / Desktop 三类尺寸下体验可用
8. 核心 E2E 流程通过

---

## 26. Source of Truth 约束复述

在本文档之后，Frontend 详细设计阶段默认以下事项已确定，不再重复讨论：

- 前端框架固定为 Next.js 15 App Router
- 状态管理固定为 Zustand + TanStack Query 分层协作
- 图表库固定为 Apache ECharts
- UI 形态固定包含 Homepage、Data Center、AI Advisor、God-Mode
- AI 响应只消费后端结构化结果
- chart token 由前端受控渲染
- 当前阶段不引入前端监控平台
- 当前阶段不引入数据库、Redis、原生 LangGraph 显式状态图

`packages/shared`、`packages/ui`、`packages/charts`、`packages/sandbox`、工程化配置与 Demo 部署配套方案已在 Others 子模块方案中完成设计。
