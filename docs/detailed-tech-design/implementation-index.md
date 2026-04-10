# AI Health Advisor — Implementation Index

## 1. 文档定位

本文档不是新的总设计文档，也不替代已完成的四份模块方案。

它的唯一职责是作为 **执行导航索引**，帮助团队明确：

- 四个模块之间的前置依赖关系
- 真正合理的编码顺序
- 哪些任务可以并行，哪些必须串行
- 每一阶段的交付门槛和 handoff 条件
- 如何用最小返工完成一个可演示、可联调、可 fallback 的 Web Demo

本文档应与以下四份模块文档配套使用：

1. `agent-detailed-implementation-plan.md`
2. `backend-detailed-implementation-plan.md`
3. `frontend-detailed-implementation-plan.md`
4. `others-detailed-implementation-plan.md`

---

## 2. 如何使用这份 Index

### 2.1 文档阅读顺序

如果是技术负责人、架构 owner、TL 或需要先建立整体理解的人，建议按以下顺序阅读：

1. `docs/source-of-truth/ARCHITECTURE.md`
2. `docs/source-of-truth/PRD.md`
3. `agent-detailed-implementation-plan.md`
4. `backend-detailed-implementation-plan.md`
5. `frontend-detailed-implementation-plan.md`
6. `others-detailed-implementation-plan.md`
7. `implementation-index.md`（本文）

这个顺序用于建立认知。

### 2.2 实际执行顺序

真正合理的实现顺序 **不是** 简单机械地按 Agent → Backend → Frontend → Others 整体完成，而应按“依赖先行、垂直切片落地”的方式推进。

推荐执行顺序为：

1. **Wave 0：仓库与工程基座（Others）**
2. **Wave 1：共享协议、数据与复用包基座（Others）**
3. **Wave 2：Agent Core 基座（Agent）**
4. **Wave 3：Backend 应用壳层与只读/AI/God-Mode API（Backend）**
5. **Wave 4：Frontend 应用壳层与页面骨架（Frontend）**
6. **Wave 5：AI 垂直切片联通（Agent + Backend + Frontend）**
7. **Wave 6：God-Mode 垂直切片联通（Others + Backend + Frontend）**
8. **Wave 7：Hardening、观测、Demo 运行保障（All）**

也就是说：

- **模块文档的产出顺序** 可以是 Agent → Backend → Frontend → Others
- **代码的实施顺序** 应是 Others foundation → Agent → Backend → Frontend → cross-cutting vertical slices

---

## 3. 不可违反的执行原则

### 3.1 先共享协议，再各自实现

只要涉及以下内容，就必须先在 `packages/shared` 中定义，再分别落到前后端：

- API request / response DTO
- `ApiSuccess` / `ApiError` transport envelope
- Agent 结构化响应协议
- chart token 类型
- status color 枚举
- page context / tab / timeframe 枚举
- session carrier 规则
- 首页读侧组合协议
- God-Mode request / response 协议
- sandbox schema

### 3.2 先数据可读，再 AI 可说

AI 的任何输出都依赖可预测、可选择、可校验的数据窗口。
因此必须先完成：

- sandbox loader
- range selector
- override merge
- chart 数据标准化
- rules 的输入数据整形

否则 Agent 会过早与脏数据或未定型协议耦合。

### 3.3 前端只消费结构，不消费 Agent 内部细节

Frontend 只能依赖：

- Backend API
- `packages/shared`
- `packages/ui`
- `packages/charts`

Frontend 不应直接感知：

- Prompt builder
- Session memory 内部结构
- Provider adapter
- Response parser 内部策略

### 3.4 演示保底优先于“完整度”

若某阶段时间紧，应优先保证：

1. 读数据
2. 切 profile
3. 首页晨报可返回
4. Data Center 图表可切换
5. AI Advisor 至少可非流式返回
6. 6 秒 fallback 可生效
7. God-Mode 至少支持 profile switch / inject event / reset

---

## 4. 顶层依赖图

```text
                        ┌──────────────────────┐
                        │ source-of-truth docs │
                        └──────────┬───────────┘
                                   │
                                   v
                    ┌────────────────────────────────┐
                    │ Others / Shared Foundation     │
                    │ - packages/shared              │
                    │ - packages/config              │
                    │ - packages/sandbox             │
                    │ - data/*                       │
                    │ - infra/*                      │
                    └──────────┬───────────┬────────┘
                               │           │
                               │           └──────────────────────┐
                               v                                  v
                 ┌────────────────────────┐            ┌─────────────────────┐
                 │ Agent Core             │            │ Frontend Shared Base│
                 │ - context              │            │ - packages/ui       │
                 │ - memory               │            │ - packages/charts   │
                 │ - rules                │            └──────────┬──────────┘
                 │ - prompt               │                       │
                 │ - parser/fallback      │                       │
                 └──────────┬─────────────┘                       │
                            │                                     │
                            v                                     │
                 ┌────────────────────────┐                       │
                 │ Backend App            │<──────────────────────┘
                 │ - routes               │
                 │ - services             │
                 │ - runtime stores       │
                 │ - AI orchestration     │
                 │ - God-Mode APIs        │
                 └──────────┬─────────────┘
                            │
                            v
                 ┌────────────────────────┐
                 │ Frontend App           │
                 │ - pages/layout         │
                 │ - stores/query         │
                 │ - chart rendering      │
                 │ - advisor UI           │
                 │ - God-Mode UI          │
                 └────────────────────────┘
```

核心结论：

- `Others` 中的 **shared/sandbox/config/data/infra** 是全局前置依赖。
- `Agent` 依赖 `shared + sandbox + prompts + fallback assets`。
- `Backend` 依赖 `shared + sandbox + agent-core`。
- `Frontend` 依赖 `shared + ui + charts + backend contract`。
- `God-Mode` 是贯穿前后端与 sandbox 的横切能力，不能最后才“补”。

---

## 5. 模块级依赖矩阵

| 模块                    | 直接依赖                                        | 可并行开始条件                             | 阻塞它的前置项                                 | 它产出的下游依赖                                   |
| ----------------------- | ----------------------------------------------- | ------------------------------------------ | ---------------------------------------------- | -------------------------------------------------- |
| Others / config         | 无                                              | 立即开始                                   | 无                                             | 所有 workspace 包                                  |
| Others / shared         | config                                          | 立即开始                                   | 无                                             | Agent / Backend / Frontend / charts / ui / sandbox |
| Others / sandbox        | shared                                          | shared 初版完成后                          | 若 sandbox schema 未冻结则阻塞                 | Agent / Backend / Frontend mock                    |
| Others / data assets    | shared + sandbox                                | shared/sandbox schema 初版后               | 若 schema 未冻结则阻塞                         | Agent / Backend / Frontend                         |
| Others / ui             | shared + config                                 | shared 初版后                              | 若 design token / enums 未冻结则阻塞           | Frontend                                           |
| Others / charts         | shared + config                                 | chart token 初版后                         | 若 chart token 未冻结则阻塞                    | Frontend                                           |
| Agent                   | shared + sandbox + data/prompts + data/fallback | shared/sandbox 初版后                      | 若 Agent request/response 协议未冻结则阻塞     | Backend AI 接口                                    |
| Backend                 | shared + sandbox + agent-core + config          | shared/sandbox 初版后                      | 若 route DTO / runtime store 未冻结则阻塞      | Frontend 集成                                      |
| Frontend                | shared + ui + charts + backend DTO              | shared/ui/charts/back-end read APIs 初版后 | 若页面 contract 未冻结则阻塞                   | Demo 可见体验                                      |
| God-Mode vertical slice | shared + sandbox + backend + frontend           | profile/override DTO 定后                  | 若 override API contract 未冻结则阻塞          | 演示主流程                                         |
| Demo hardening          | 全部                                            | 基础功能可跑通后                           | 若 E2E / observability / fallback 未就绪则阻塞 | 最终可演示交付                                     |

---

## 6. 推荐执行波次（Waves）

## Wave 0：仓库与工程基座

**目标**：让 monorepo 可以安装、编译、lint、测试、启动。

### 必做内容

- 建立 `pnpm-workspace.yaml`、`turbo.json`、根 `package.json`
- 建立 `tsconfig.base.json`
- 建立 `packages/config`
- 建立基础 lint / format / Vitest / Playwright 配置
- 建立 `apps/web` 与 `apps/agent-api` 的空壳可启动项目
- 建立 `.env.example` 与运行脚本

### 完成标志

- `pnpm install` 成功
- `pnpm dev` 能同时拉起 web / agent-api 空壳
- `pnpm lint` / `pnpm test` / `pnpm typecheck` 可运行

### Owner

- 优先由 Others owner 负责
- Backend / Frontend owner 同步参与各自 app shell 初始化

---

## Wave 1：共享协议、数据与复用包基座

**目标**：把所有后续模块都依赖的“系统真相”先固化下来。

### 必做内容

#### 1) `packages/shared`

- sandbox types / zod schemas
- agent request / response contracts
- transport envelope / session carrier contract
- chart token contracts
- God-Mode DTO
- read-side DTO（profile / timeline / chart payload）
- error codes / enums / constants

#### 2) `packages/sandbox`

- file loader
- profile selector
- date-range selector
- override merge
- event merge
- missing-value semantics

#### 3) `data/*`

- `data/sandbox`：多 profile 示例数据
- `data/fallback`：首页 / view summary / chat fallback 模板
- `data/prompts`：system / task 模板

### 完成标志

- shared DTO 已冻结到可联调程度
- sandbox 能读取 profile 并应用 override
- 至少 2–3 个 profile 的数据可用于首页 / Data Center / AI Advisor 演示

### 阻塞关系

- 未完成本波次前，Agent / Backend / Frontend 都不应深入业务实现

---

## Wave 2：Agent Core 基座

**目标**：把 `packages/agent-core` 做成可被 backend 调用的独立能力层。

### 必做内容

- request normalization
- context builder
- session memory manager
- analytical memory manager
- insight rule engine
- prompt builder
- provider adapter
- `createAgent` executor
- response parser
- chart token validator
- fallback engine
- timeout wrapper

### 完成标志

- 给定标准 `AgentRequest`，能产出结构化 `AgentResponseEnvelope`
- timeout / invalid output / provider error / low-data 场景均可 fallback
- chart token 输出受白名单与 schema 控制

### 依赖关系

- 必须依赖 Wave 1 的 shared / sandbox / prompts / fallback 资产
- 完成后 Backend AI 路由才可稳定接入

### 可并行内容

- Backend 可以同时做非 AI 的 health / profiles / read-only data routes
- Frontend 可以同时做纯 UI 壳层与静态页面骨架

---

## Wave 3：Backend 应用壳层与只读/AI/God-Mode API

**目标**：把 Fastify 应用做成真正可联调的后端服务，而不仅是 Agent 调用入口。

### 必做内容

- app bootstrap / plugin registration
- env loading / validation
- logger / error handler / request context
- runtime stores（session / overrides / profile state / scenario registry）
- health routes
- profiles routes
- read-only data-center routes
- chart data view model
- AI controller / service / orchestrator 壳层
- God-Mode controller / service 壳层
- Sentry / metrics / structured logs

### 完成标志

- `/health` 可用
- `/profiles` / `/profiles/:profileId/timeline` / chart payload API 可用
- `/ai/*` 接口可返回 mock/fallback 或真实 Agent 结果
- `/god-mode/*` 可切 profile / inject / override / reset

### 依赖关系

- read-only routes 依赖 shared + sandbox
- AI routes 依赖 agent-core
- God-Mode 依赖 override store + sandbox merge + shared DTO

---

## Wave 4：Frontend 应用壳层与页面骨架

**目标**：先不依赖真实 AI，把页面骨架、状态层、图表层和响应式壳层落地。

### 必做内容

- App Router layout
- providers（theme/query/motion）
- app shell / navigation / floating AI entry
- Zustand stores 基础骨架
- TanStack Query client
- Homepage read-only 页面
- Data Center read-only 页面
- chart panels + token renderer registry
- UI skeleton / empty / inline error
- Mobile / Tablet / Desktop 响应式行为

### 完成标志

- 可切 profile 并刷新页面数据
- Homepage / Data Center 在无 AI 能力下仍可展示可用内容
- chart 基础组件和异常/缺失显示可用
- AI Advisor 容器 UI 可打开，但可先接 mock

### 依赖关系

- 依赖 shared / ui / charts / backend read APIs
- AI 真正联调不是本波次阻塞项

---

## Wave 5：AI 垂直切片联通

**目标**：完成系统最核心的闭环：后端组装上下文 → Agent 生成结构化输出 → 前端稳定渲染。

### 必做内容

#### Homepage

- morning brief API
- status color 映射
- micro tips
- fallback 渲染统一协议

#### Data Center

- summarize current view API
- tab / timeframe / chart context 注入
- view summary chart token 渲染

#### AI Advisor

- chat request / response
- smart prompts
- physiological tags
- chart message block
- loading skeleton / timeout fallback

### 完成标志

- 三个 AI 场景全部可返回结构化响应
- chart token 能从消息中稳定渲染成图表
- 6 秒 timeout 在前后端均符合预期
- fallback 与正常结果共享同一套渲染协议

### 说明

这是第一个真正“像产品”的阶段，也是最关键的可演示里程碑。

---

## Wave 6：God-Mode 垂直切片联通

**目标**：完成 Demo 的演示控制能力。

### 必做内容

- profile switch
- inject event
- metric override
- scenario reset
- demo script run
- Active Sensing 顶部中断横幅
- 首页局部红黄绿状态变化
- Data Center 原位刷新
- 当前视图不跳转、不破坏主流程

### 完成标志

- God-Mode 操作都能在当前页内平滑触发对应表现
- override 不回写基础 JSON
- 重置后系统恢复到原始 sandbox 状态

### 说明

God-Mode 不应等到最后才做。它是演示主流程的核心控制能力，应在 AI 垂直切片基本通后立即接入。

---

## Wave 7：Hardening、观测、Demo 运行保障

**目标**：把系统从“能跑”提升到“能演示、能排障、能保底”。

### 必做内容

- timeout fallback 全链路校验
- provider error fallback
- invalid structured output fallback
- empty-data UI / chart gap handling
- requestId / sessionId / profileId 日志贯通
- Sentry 后端异常追踪
- E2E：profile switch / homepage / data-center / AI / timeout / God-Mode
- fallback-only demo mode
- Docker compose / 单机演示脚本
- 运行手册 / demo checklist

### 完成标志

- 没有真实 LLM 的情况下 Demo 仍能走通主要流程
- 网络波动 / provider 异常下不会卡死主流程
- 关键演示脚本可以重复执行

---

## 7. 推荐里程碑

### M1：Foundation Ready

包含：Wave 0 + Wave 1

判定标准：

- monorepo 可跑
- shared 协议冻结到 v1
- sandbox / fallback / prompt 资产可用
- ui 基础组件与 charts token registry 可被 web 引用

### M2：Core Runtime Ready

包含：Wave 2 + Backend 中非 AI 壳层

判定标准：

- agent-core 可独立通过单测
- backend 基础接口与 runtime store 可用

### M3：Read-only Demo Ready

包含：Wave 3 + Wave 4

判定标准：

- profile 可切
- Homepage / Data Center 可渲染
- 图表与响应式骨架可用

### M4：AI Demo Ready

包含：Wave 5

判定标准：

- Homepage brief / view summary / AI chat 三条 AI 闭环打通
- chart token 渲染打通
- fallback 打通

### M5：God-Mode Demo Ready

包含：Wave 6

判定标准：

- profile / inject / override / reset / scenario 恢复 / demo-script 触发均打通
- Active Sensing 中断横幅可演示

### M6：Final Demo Ready

包含：Wave 7

判定标准：

- E2E 通过
- fallback-only 演示模式可用
- 观测与排障最小集可用
- 演示脚本可复现

---

## 8. 关键 handoff 清单

## 8.1 Others → Agent / Backend / Frontend

必须先交付：

- `packages/shared` v1
- `packages/sandbox` v1
- `data/sandbox` v1
- `data/fallback` v1
- `data/prompts` v1
- `packages/config` v1

若这些未冻结，后三个模块不应开始深层联调。

## 8.2 Agent → Backend

必须先交付：

- `executeAgent(request): Promise<AgentResponseEnvelope>`
- 统一错误模型
- timeout/fallback 行为约定
- chart token validator
- request/response schema tests

Backend 不应直接依赖 Agent 内部模块细节，只依赖稳定 facade。

## 8.3 Backend → Frontend

必须先交付：

- profiles list / current profile 读取协议
- Homepage 组合协议（由 `current profile + timeline + morning-brief` 组成，不新增独立 homepage 聚合 endpoint）
- data-center read APIs
- chart token -> chart payload API
- summarize-current-view API
- advisor chat API
- god-mode state API
- god-mode APIs
- god-mode demo script API
- error envelope / fallback envelope

Frontend 在此之前应主要使用 mock adapter，而不是等待后端完成后才开工。

## 8.4 Charts / UI → Frontend Feature 开发

必须先交付：

- chart renderer registry
- time series 基础组件
- micro chart 组件
- app card / badge / pill / skeleton / drawer / sheet / tabs 等基础 UI

否则 feature 组件会被迫各自造轮子，后期收口成本很高。

---

## 9. 哪些任务可以并行

## 9.1 可以高度并行的部分

### A. 在 Wave 1 之后

- Agent owner 做 `packages/agent-core`
- Backend owner 做 Fastify 壳层 / health / profiles / data-center read APIs
- Frontend owner 做 shell / Homepage / Data Center 静态骨架
- Others owner 做 `packages/ui` / `packages/charts` / Docker / scripts

### B. 在 Backend read APIs 与 shared DTO 稳定之后

- Frontend 可全面推进 read-only 联调
- Backend 可单独推进 AI / God-Mode 接口
- Agent 可独立做 parser / fallback / prompt tuning / rule engine

### C. 在 AI contract 稳定之后

- Frontend AI Advisor UI
- Backend AI orchestration
- Agent chart token / structured output

可以并行，但需要使用同一版 DTO 与 token registry。

## 9.2 不建议并行的部分

以下内容若协议未冻结就并行，后期返工会很大：

- shared DTO 与 frontend API adapter 同时随意改
- chart token 命名与前端 renderer 各自发展
- God-Mode override payload 未定时先做 UI 表单
- Agent response schema 未定时先做消息渲染模型
- sandbox schema 未定时先做数据选择器与图表 option builder

---

## 10. 关键阻塞点（必须提前管理）

## Blocker 1：shared 协议迟迟不冻结

影响：所有模块都被阻塞，尤其前后端联调会反复重写。

处理：

- 在 Wave 1 结束时冻结 DTO v1
- 后续变更必须走兼容性评估

## Blocker 2：sandbox 数据质量不足

影响：Agent、图表、God-Mode 都无法稳定演示。

处理：

- 尽早准备 2–3 个高质量 profile
- 每个 profile 至少覆盖正常 / 警示 / 异常场景
- 关键日期必须有人为事件标注

## Blocker 3：chart token 协议不稳定

影响：AI message 渲染、view summary、微型图表全部受阻。

处理：

- 只允许注册制 token
- 首版 token 集合尽量少而稳定

## Blocker 4：God-Mode 太晚接入

影响：演示流程后期大范围返工，页面刷新与 runtime override 逻辑容易失控。

处理：

- 在 AI 闭环打通后立即做 God-Mode 垂直切片
- override store 与 sandbox merge 逻辑尽早单测覆盖

## Blocker 5：fallback 只在最后补

影响：临近交付时最容易在网络或 provider 波动中翻车。

处理：

- 从 Wave 2 就实现 fallback engine
- 从 Wave 4 起前端就接入 timeout fallback UI

---

## 11. 推荐团队分工

## 11.1 最佳情况：4 个 owner

### Owner A — Others / Shared Foundation

负责：

- monorepo
- config
- shared
- sandbox
- data assets
- infra / scripts
- test foundation

### Owner B — Agent

负责：

- agent-core
- prompt / rules / parser / fallback
- structured output
- provider adapter

### Owner C — Backend

负责：

- Fastify app
- runtime stores
- routes / controllers / services
- AI orchestration
- God-Mode APIs
- observability

### Owner D — Frontend

负责：

- Next app shell
- Homepage / Data Center / AI Advisor / God-Mode UI
- stores / query / chart rendering / responsive

## 11.2 只有 2–3 人时的压缩策略

### 2 人

- Person 1：Others + Agent + Backend
- Person 2：Frontend

### 3 人

- Person 1：Others + shared/sandbox/infra
- Person 2：Agent + Backend AI/God-Mode
- Person 3：Frontend

在 2–3 人团队下，最重要的是 **先完成 shared/sandbox，再推进其余内容**。

---

## 12. 推荐执行节奏（非常实用版）

### Step 1

先把 `packages/shared + packages/sandbox + data/* + packages/config` 做出来。

### Step 2

并行推进：

- Agent core
- Backend app shell
- Frontend app shell
- UI/charts 基础

### Step 3

先打通 **read-only vertical slice**：

- profile switch
- Homepage 数据展示
- Data Center tab/timeframe/chart

### Step 4

再打通 **AI vertical slice**：

- morning brief
- summarize current view
- advisor chat

### Step 5

接入 **God-Mode vertical slice**：

- inject / override / reset
- Active Sensing
- 局部与全局刷新策略

### Step 6

最后集中做：

- fallback-only mode
- observability
- E2E
- runbook
- demo script

这就是最稳的推进顺序。

---

## 13. 最终建议（管理层一句话版本）

**文档保持分模块，实施按波次推进。**

也就是：

- **理解系统**：按 Agent → Backend → Frontend → Others 的文档顺序理解
- **落地代码**：按 Others foundation → Agent core → Backend shell → Frontend shell → AI vertical slice → God-Mode vertical slice → Hardening 的顺序执行

如果执行团队严格遵守这个顺序，可以显著降低：

- DTO 反复改动
- 前后端联调返工
- chart token 协议失配
- God-Mode 后期硬插导致的状态混乱
- demo 临门一脚时才发现 fallback 不可用

---

## 14. 本文档与四份模块文档的关系

- **Agent 方案**：回答“Agent 内部怎么做”
- **Backend 方案**：回答“后端应用怎么承载它”
- **Frontend 方案**：回答“前端页面和 UI 怎么消费它”
- **Others 方案**：回答“共享层、工程层、数据层、运行层怎么支撑它”
- **Implementation Index（本文）**：回答“这些东西先做什么、后做什么、谁依赖谁、哪里能并行、哪里会卡住”

本文档只做执行导航，不替代任何模块详细设计文档。
