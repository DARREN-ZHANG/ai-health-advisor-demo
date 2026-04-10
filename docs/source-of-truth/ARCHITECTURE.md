# AI Health Advisor 技术架构文档

## 1. 文档定位

本文档是 AI Health Advisor Web Demo 的技术架构基线文档，用于统一执行团队对系统边界、模块划分、技术栈、运行方式和交付目标的理解。

本文档只描述系统级架构，不进入子系统或子模块的详细技术设计。

---

## 2. 系统目标

系统需实现以下目标：

- 以 Web Demo 形式完整呈现 Health Advisor 的核心产品逻辑
- 支持多用户数据沙盒切换与 God-Mode 演示控制
- 支持 Homepage、Data Center、AI Advisor 三大核心界面
- 支持基于用户历史数据和当前视图上下文的 Agent 式 AI 交互
- 支持多模态 AI 回复中的图表内嵌渲染
- 支持 6 秒超时降级与离线演示容错
- 支持 Mobile、Tablet、Desktop 的响应式体验

---

## 3. 系统范围

### 3.1 范围内

- Web 前端应用
- 独立 Agent 后端服务
- JSON 沙盒数据读取与运行时覆写
- AI Agent 运行时
- 图表渲染
- God-Mode 控制能力
- 后端最小可观测性
- 本地开发与 Demo 部署

### 3.2 范围外

- 真实硬件设备直连
- 长期生产化能力
- 数据库与持久化会话系统
- 长期用户记忆和向量检索
- 多 Agent 编排
- 原生 LangGraph 显式状态图编排
- 前端监控与前端可观测性平台
- 医疗诊断级合规系统

---

## 4. 总体架构

系统采用前后端分离的最小双应用架构。

```text
[Browser]
   |
   v
[Next.js Web App]
  - Homepage
  - Data Center
  - AI Advisor
  - God-Mode UI
  - Chart Renderer
  - Client State
   |
   | HTTP / SSE
   v
[Fastify Agent Backend]
  - Sandbox Loader
  - Runtime Override Store
  - Context Manager
  - Memory Manager
  - Insight Rule Engine
  - Prompt Builder
  - LangChain Agent Runtime
  - Response Parser
  - Fallback Engine
  - God-Mode APIs
   |
   v
[LLM Provider]
  - OpenAI / Anthropic / Gemini
```

---

## 5. 技术选型

### 5.1 前端

- Framework: Next.js 15（App Router）
- Language: TypeScript
- UI: React 19
- Styling: Tailwind CSS
- Component Primitive: Radix UI
- Animation: Framer Motion
- Charts: Apache ECharts
- Client State: Zustand
- Data Fetching: TanStack Query
- Validation: Zod

### 5.2 后端

- Framework: Fastify
- Language: TypeScript
- Runtime: Node.js 22 LTS
- Validation: Zod
- Streaming: SSE（按需启用）

### 5.3 Agent 框架

- Framework: LangChain JS `createAgent`
- Agent Runtime Placement: Fastify 后端内部
- Provider Switching: 通过环境变量切换模型提供方与模型名

### 5.4 数据层

- Primary Data Source: JSON 沙盒文件
- Runtime Mutation Store: 进程内内存态 overrides
- 不引入数据库
- 不引入 Redis

### 5.5 工程化

- Monorepo: pnpm workspace + Turborepo
- Lint: ESLint
- Format: Prettier
- Unit Test: Vitest
- E2E: Playwright
- Error Tracking: Sentry（仅后端）

---

## 6. 前端架构

前端负责界面展示、交互控制、图表渲染、状态管理和对后端结构化响应的消费。

### 6.1 页面与核心模块

#### Homepage

负责实时状态与行动指南展示，包含：

- AI 晨报卡片
- Active Sensing 横幅
- Contextual Micro-Insights
- Historical Trends 卡片阵列

#### Data Center

负责多维数据复盘与 AI 视图总结，包含：

- 顶层 Tabs
- 时间轴筛选
- 综合简报
- 指标图表
- AI 总结当前视图入口

#### AI Advisor

负责全局 AI 对话能力，包含：

- 浮动入口
- ChatBox / Drawer / Bottom Sheet
- Smart Prompts
- 生理标签展示
- 消息内嵌微型图表渲染

#### God-Mode UI

负责演示态控制，包含：

- Profile 切换
- 事件注入
- 指标覆写
- 场景恢复
- 演示脚本触发入口

### 6.2 前端职责边界

前端负责：

- 页面路由与布局
- 响应式适配
- 深色主题与状态色系统
- 图表渲染
- Loading / Skeleton 状态
- 局部和全局 UI 状态管理
- 消费后端返回的结构化 Agent 响应
- 根据后端返回的图表 token 渲染对应图表组件

前端不负责：

- LLM 直接调用
- Prompt 组装
- Memory 管理
- Fallback 内容生成
- Agent 运行时编排

---

## 7. 后端架构

后端是系统的 Agent Runtime 承载层，负责数据装载、上下文构造、Agent 调用、响应解析和演示态运行时控制。

### 7.1 后端模块

#### Sandbox Loader

负责加载和校验沙盒 JSON 数据，提供 profile 基础读取能力。

#### Runtime Override Store

负责保存 God-Mode 引起的运行时数据变更，并在读取时与基础沙盒数据合并。

#### Context Manager

负责根据请求场景构造 Agent 上下文。上下文输入包括：

- 当前 profile 基础信息
- 用户 tags
- 当前时间范围
- 当前页面 / 当前视图
- 当前窗口期 daily records
- 注入 events
- runtime overrides
- 规则引擎输出

#### Memory Manager

负责最小会话记忆，包含：

- Session Memory：当前会话最近 N 轮对话
- Analytical Memory：最近一次摘要、最近一次视图总结、最近一次规则输出

#### Insight Rule Engine

负责从当前数据窗口中抽取结构化洞察和状态信号，为 Agent 和 fallback 提供确定性辅助。

#### Prompt Builder

负责将系统角色、当前任务和上下文数据组装为 Agent 输入。

#### LangChain Agent Runtime

负责初始化与调用 `createAgent`，并串联：

- system prompt
- middleware
- tools
- model selection
- structured output handling

#### Response Parser

负责校验 Agent 输出结构、校验图表 token、清洗非法输出，并生成统一响应。

#### Fallback Engine

负责在超时、Provider 异常、输出非法或数据不足时返回场景化降级内容。

#### God-Mode APIs

负责对外提供演示控制相关接口。

### 7.2 后端职责边界

后端负责：

- 管理 Agent Runtime
- 管理 session memory
- 组装上下文
- 执行规则引擎
- 调用 LLM Provider
- 解析结构化输出
- 执行 fallback
- 处理 God-Mode 引起的运行态变化
- 输出前端可直接消费的数据结构

后端不负责：

- 页面渲染
- 图表可视化布局
- 前端视觉状态持久化

---

## 8. Agent Runtime 架构

系统中的 LLM 能力统一按单 Agent Runtime 组织。

### 8.1 Agent 定义

系统中存在一个主 Agent：Health Advisor Agent。

该 Agent 负责：

- 首页晨报生成
- 当前视图总结生成
- 聊天问答生成
- 微贴士与轻量建议生成

### 8.2 Agent 组成

Agent Runtime 包含以下固定组成：

- System Prompt Injection
- Context Management
- Session Memory
- Analytical Memory
- Tool-like Internal Modules
- Middleware
- Structured Output Parsing
- Fallback Handling

### 8.3 Agent 输入来源

Agent 输入由以下内容组成：

- 用户问题或当前视图总结请求
- 当前 profile 的基础信息与 tags
- 当前时间范围和页面上下文
- 默认最近 14 天的生理数据；`view_summary` 使用当前窗口期数据，`advisor_chat` 仅在用户显式要求其他范围时扩展或缩小窗口
- 与当前数据窗口相关的事件注入
- 规则引擎生成的结构化洞察
- 当前会话短期消息历史

### 8.4 Agent 输出形式

后端对前端只输出结构化 Agent 响应。

结构化响应必须包含以下概念层字段：

- 响应来源：LLM / fallback / rule
- 状态色：green / yellow / red
- 主摘要文本
- 可选图表 token 列表
- 可选 micro tips 列表
- 调用元信息

前端不直接解析自由文本中的隐式结构。

---

## 9. 数据架构

### 9.1 数据源形态

系统唯一正式数据源为沙盒 JSON 文件。

数据源需要满足以下要求：

- 多 profile
- 连续 daily records
- 与真实 CSV 字段严格映射
- 支持事件注入
- 可被前端图表与后端 Agent 共同消费

### 9.2 核心数据实体

系统使用以下核心实体：

- `SandboxProfile`
- `DailyRecord`
- `ActivityData`
- `SleepData`
- `VitalSignsData`

### 9.3 数据处理原则

- 不引入数据库作为正式存储层
- 不将 runtime overrides 回写基础 JSON
- 缺失数据必须显式保留缺失语义
- 不对缺失数据做幻觉补全
- SpO2 等原始格式字段允许保留字符串形式
- 事件注入通过 `events` 字段表达
- `stress` tab 必须定义为基于现有 HRV、静息心率、睡眠时长和深睡时长推导出的 **Stress Load Proxy**
- `stress` 不作为 raw sandbox 字段落盘；其值由后端基于沙盒数据在读取时推导
- 当单日可用信号不足时，`stress` 结果必须显式为 `null`，前端以断点而非补值呈现
- `stress` 只用于演示态的压力负荷代理，不宣称医学压力诊断结论

### 9.4 运行时数据变更

God-Mode 引起的所有数据变更都属于运行时变更，只存在于内存态 override store 中。

运行时变更包含：

- 当前 profile 切换
- 特定日期事件注入
- 特定指标覆盖
- 场景重置

---

## 10. AI 输入输出契约

### 10.1 系统角色注入

后端必须为 Agent 注入固定角色和行为边界，包含：

- 顶尖运动医学专家与私人健康助理角色
- 知性、直截了当的表达风格
- 红黄绿状态逻辑
- 禁止疾病诊断
- 禁止对缺失数据幻觉生成
- 输出必须服从结构化协议

### 10.2 上下文注入

后端必须为 Agent 注入：

- 当前用户 tags
- 当前请求窗口的结构化生理数据
- 当前页面和当前任务上下文
- 规则引擎提取的洞察信号

Backend 与 Agent Runtime 之间的正式调用边界固定为单入口 `executeAgent(request)`；后端负责把 HTTP 请求收口为 `AgentRequest`，Agent Runtime 负责上下文构建、模型调用、输出解析与 fallback。

### 10.3 图表渲染协议

系统保留图表 token 协议。Agent 输出中允许包含受控图表 token，后端需完成合法性校验，前端根据 token 渲染对应 ECharts 组件。

正式约束如下：

- 唯一正式 AI 线缆协议为 `AgentResponseEnvelope`
- `AgentResponseEnvelope` 至少包含：`source`、`statusColor`、`summary`、可选 `chartTokens[]`、可选 `microTips[]`、`meta`
- 正式图表协议为受控 `ChartTokenId[]` 白名单，不允许对象 token 或前端自由解析自然语言
- 前端不直接消费模型原始输出，也不扫描 `[CHART:...]` 一类作者侧标记
- token 对应的数据选择与窗口裁剪由后端负责，前端只消费后端返回的结构化图表数据或当前页面已获取的结构化 view model

### 10.4 输出约束

Agent 输出必须满足：

- 可被后端结构化解析
- 可直接映射为前端消息模型
- 不依赖前端对任意自然语言做脆弱解析
- `summary` 中不得残留作者侧协议标记

---

## 11. 容错与降级

### 11.1 超时策略

AI 请求超时时间为 6 秒。

### 11.2 降级原则

当发生以下情况时，后端必须执行 fallback：

- LLM 超时
- Provider 报错
- 输出格式非法
- 数据缺失导致当前任务不可稳定生成

### 11.3 降级来源

fallback 可来自：

- 场景预设文案
- 规则引擎确定性输出

### 11.4 前端表现要求

前端必须支持：

- Loading Skeleton
- AI 响应等待微文案
- 降级结果与正常结果的统一渲染协议
- 数据缺失时的断点图展示
- 超时后的统一 timeout UI
- 前端不得在超时后伪造一条“source=fallback”的本地 AI 文案；只有后端返回的结构化 fallback 才能作为正式 AI 结果显示

---

## 12. God-Mode 运行时边界

God-Mode 是系统正式架构的一部分，用于演示态控制。

### 12.1 支持的控制类型

- 全局 profile 切换
- 瞬时事件注入
- 指标局部覆盖
- 场景恢复
- 演示脚本触发

### 12.2 行为边界

- Profile 切换触发全局状态刷新，但不强制页面跳转
- 瞬时事件注入可打断当前视图并触发高优先级横幅
- 指标覆盖只触发局部重绘
- 演示脚本触发本质上是受控的多步 God-Mode 动作序列，必须通过正式 API 执行，而不是前端本地拼接状态
- 所有 God-Mode 行为不得破坏当前演示主流程

---

## 13. Monorepo 仓库结构

系统采用 monorepo 组织。

```text
ai-health-advisor/
├── apps/
│   ├── web/                       # Next.js 前端
│   └── agent-api/                 # Fastify 后端
│
├── packages/
│   ├── shared/                    # types / zod schema / constants
│   ├── ui/                        # 公共 UI 组件
│   ├── charts/                    # 图表封装
│   ├── sandbox/                   # sandbox 读取与 merge 逻辑
│   ├── agent-core/                # agent runtime 相关公共能力
│   └── config/                    # tsconfig / eslint / prettier
│
├── data/
│   ├── sandbox/                   # 多用户沙盒 JSON
│   ├── fallback/                  # fallback 文案模板
│   └── prompts/                   # system prompt / templates
│
├── infra/
│   ├── docker/
│   └── scripts/
│
├── package.json
├── pnpm-workspace.yaml
├── turbo.json
└── tsconfig.base.json
```

### 13.1 目录边界

- `apps/web`：只放前端应用代码
- `apps/agent-api`：只放后端应用代码
- `packages/shared`：只放前后端共享协议
- `packages/sandbox`：只放沙盒数据访问和 merge 逻辑
- `packages/agent-core`：只放 Agent Runtime 公共能力

---

## 14. 本地运行方式

### 14.1 环境要求

- Node.js 22+
- pnpm 9+
- Docker（仅在容器化联调时需要）

### 14.2 环境变量

#### Web

- `NEXT_PUBLIC_AGENT_API_BASE_URL`
- `NEXT_PUBLIC_ENABLE_GOD_MODE`

#### Agent API

- `PORT`
- `NODE_ENV`
- `LLM_PROVIDER`
- `LLM_MODEL`
- `LLM_API_KEY`
- `AI_TIMEOUT_MS`
- `ENABLE_GOD_MODE`
- `SENTRY_DSN`
- `LOG_LEVEL`

Agent API 可选变量（完整列表以 Backend 子模块方案为准）：

- `FALLBACK_ONLY_MODE`
- `MAX_SESSION_TURNS`
- `MAX_SESSION_COUNT`
- `ENABLE_SSE`
- `CORS_ORIGIN`

### 14.3 启动方式

统一通过 monorepo 根目录执行：

```bash
pnpm install
pnpm dev
```

也支持按应用分别启动：

```bash
pnpm --filter web dev
pnpm --filter agent-api dev
```

### 14.4 本地运行模式

系统支持以下运行模式：

- UI 开发模式：仅前端 + mock 数据
- 联调模式：前端 + Agent API + 真实 LLM
- 演示保底模式：前端 + Agent API + fallback-only / timeout fallback

---

## 15. 部署方式

### 15.1 推荐部署方式

#### 方案一：轻量云部署

- Web：Vercel
- Agent API：Railway / Render / Fly.io

#### 方案二：单机容器部署

- web
- agent-api

### 15.2 部署要求

- Web 与 Agent API 独立部署
- Agent API 必须可配置 Provider 与模型
- Demo 环境必须启用 fallback 能力
- Demo 环境必须可启用 God-Mode

---

## 16. 可观测性

系统只建设后端最小可观测性。

### 16.1 日志

后端必须记录：

- requestId
- route
- profileId
- sessionId
- provider
- model
- latencyMs
- fallback 是否触发
- error reason

### 16.2 错误追踪

- 使用 Sentry 记录后端异常

### 16.3 基础指标

后端必须暴露或记录以下指标：

- API latency
- AI timeout count
- fallback count
- provider error count

---

## 17. 测试范围

技术架构层只定义最低测试范围。

### 17.1 单元测试范围

- schema 校验
- context builder
- insight rule engine
- response parser
- fallback engine

### 17.2 E2E 测试范围

- profile 切换
- 首页晨报展示
- Data Center 切换 tab 和 timeframe
- AI chat 正常返回
- timeout fallback 生效
- God-Mode 事件注入触发横幅

---

## 18. 交付基线

执行团队应以以下内容作为当前阶段交付基线：

- 一个可运行的 Next.js 前端应用
- 一个可运行的 Fastify Agent Backend
- 一个基于 LangChain `createAgent` 的单 Agent Runtime
- 一套可被前后端共同消费的沙盒数据协议
- 一套 God-Mode 运行时控制能力
- 一套结构化 Agent 输出协议
- 一套 6 秒超时 fallback 机制
- 一套最小后端可观测性能力
- 一套本地运行与 Demo 部署能力

---

## 19. Source of Truth 约束

从本文件开始，以下事项在后续设计阶段默认视为已确定，不再重复做架构层讨论：

- 前端框架为 Next.js
- 后端框架为 Fastify
- Agent 框架为 LangChain `createAgent`
- 数据源为 JSON 沙盒 + 内存 overrides
- 图表库为 ECharts
- 仓库形态为 pnpm + Turborepo monorepo
- 可观测性只做后端
- 正式 AI 线缆协议固定为 `AgentResponseEnvelope`
- Backend 与 Agent Runtime 的正式调用入口固定为单入口 `executeAgent(request)`
- 正式 chart token 协议固定为受控 `ChartTokenId[]` 白名单
- chart token 的数据选择与窗口裁剪由后端负责，前端只消费结构化图表数据
- fallback 的正式结果由后端生成并返回；前端只负责 timeout UI，不伪造 AI 结果
- `advisor_chat` 默认上下文窗口固定为最近 14 天；只有用户显式要求其他时间范围时才扩展或缩小窗口
- Homepage 读侧固定由 `GET /profiles/:profileId` + `GET /profiles/:profileId/timeline` + `POST /ai/morning-brief` 组合，不新增独立 homepage 聚合 endpoint
- `stress` tab 固定为后端推导的 `Stress Load Proxy`
- God-Mode 必须包含演示脚本触发能力，且通过正式 API 执行
- 本阶段不引入数据库、Redis、原生 LangGraph 显式图编排

后续所有子系统和子模块技术方案设计，均以本文档为系统级基线。
