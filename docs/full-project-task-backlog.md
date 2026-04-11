# AI Health Advisor — Full Project Task-Level Backlog

## 1. 文档定位

本文档用于把既有的系统级架构、PRD、四份模块详细实现方案与 implementation index 进一步下钻到 **可派发、可追踪、可验收** 的任务粒度。

它不替代模块设计文档；它的用途是供 TL / EM / 开发人员直接按任务执行。

## 2. 使用方式

- 每条任务都带有唯一 ID，可直接映射为 Jira / Linear issue。
- `Depends On` 表示建议的前置任务；若为空则表示可立即开始。
- `Owner` 是建议的角色类型，不代表必须由单人完成。
- `Deliverable / DoD` 是最小完成定义，默认要求同时满足 typecheck、lint、相关测试通过。
- Priority 解释：`P0` = 核心必做；`P1` = 建议在主路径完成后补齐。

## 3. 推荐执行顺序

按 implementation index，推荐的实际编码顺序仍然是：
`Wave 0 -> Wave 1 -> Wave 2 -> Wave 3 -> Wave 4 -> Wave 5 -> Wave 6 -> Wave 7`

但从 Wave 2 开始，建议把每个 Wave 再拆成 2-3 个 Part，作为实际派发、验收与进度跟踪单元：

- Wave 2：`2.1 Runtime/Foundation -> 2.2 Rules/Prompt/Output -> 2.3 Fallback/Facade/Test`
- Wave 3：`3.1 App Shell/Runtime -> 3.2 Read-only + AI API -> 3.3 God-Mode API/Test`
- Wave 4：`4.1 App Shell/Stores -> 4.2 Homepage + Data Center -> 4.3 Advisor + God-Mode + QA`
- Wave 5：`5.1 Homepage + View Summary -> 5.2 Advisor Chat -> 5.3 Guardrails + Refresh + E2E`
- Wave 6：`6.1 Profile Switch + Active Sensing -> 6.2 Override/Scenario/Demo Script -> 6.3 Gating + Concurrency + E2E`
- Wave 7：`7.1 Runtime Hardening/Observability -> 7.2 Delivery/CI -> 7.3 Frontend Resilience/Demo Ops`

其中：

- Wave 0/1 是全局前置依赖。
- Wave 2/3/4 仍可部分并行，但建议优先完成各自 Part 1，再进入更高耦合的 Part 2/3。
- Wave 5/6 是跨模块垂直切片，建议按“单条用户旅程闭环”分 Part 推进，避免一次联调面过大。
- Wave 7 是 demo 交付前的硬化与保障阶段，建议按运行时、交付链路、演示保障三段收口。

## 4. Backlog 总量

当前 backlog 共 **188** 条任务。

## Wave 0 — 仓库与工程基座

**目标**：让 monorepo 可以安装、编译、lint、测试、启动，并建立 apps/packages 空壳。

| ID      | Priority | Module   | Task                                            | Depends On                         | Owner       | Deliverable / DoD                                                                     |
| ------- | -------- | -------- | ----------------------------------------------- | ---------------------------------- | ----------- | ------------------------------------------------------------------------------------- |
| OTH-001 | P0       | Others   | 初始化 monorepo 根目录与 workspace 清单         | -                                  | Platform    | 根目录存在 package.json、pnpm-workspace.yaml；workspace 能识别 apps/_ 与 packages/_。 |
| OTH-002 | P0       | Others   | 配置 Turbo pipeline 与基础 task graph           | OTH-001                            | Platform    | turbo.json 可运行 dev/build/lint/test/typecheck；缓存键合理。                         |
| OTH-003 | P0       | Others   | 建立 tsconfig.base.json 与 package 级 TS 继承链 | OTH-001                            | Platform    | apps 与 packages 都可共享 TS 基座；路径别名可用。                                     |
| OTH-004 | P0       | Others   | 创建 packages/config 包骨架                     | OTH-001, OTH-003                   | Platform    | config 包可输出 ESLint/Prettier/Vitest/Playwright/TS 配置。                           |
| OTH-005 | P0       | Others   | 配置根级 .gitignore / .editorconfig / npmrc     | OTH-001                            | Platform    | 仓库忽略规则、换行、包管理约束固定。                                                  |
| OTH-006 | P0       | Others   | 建立根级脚本约定                                | OTH-001, OTH-002                   | Platform    | 根 package.json 暴露 dev/build/lint/test/typecheck/clean 脚本。                       |
| OTH-007 | P0       | Backend  | 初始化 apps/agent-api 空壳                      | OTH-001, OTH-003                   | Backend     | Fastify 应用可启动并返回基础 health 响应。                                            |
| OTH-008 | P0       | Frontend | 初始化 apps/web 空壳                            | OTH-001, OTH-003                   | Frontend    | Next.js App Router 应用可启动并显示占位页。                                           |
| OTH-009 | P0       | Others   | 补齐 .env.example 与环境变量说明                | OTH-007, OTH-008                   | Platform    | web 与 agent-api 环境变量模板完整，字段名与架构文档一致。                             |
| OTH-010 | P0       | Others   | 落地 ESLint 统一配置                            | OTH-004, OTH-007, OTH-008          | Platform    | pnpm lint 可跑通；apps/packages 使用统一规则。                                        |
| OTH-011 | P0       | Others   | 落地 Prettier 统一配置                          | OTH-004                            | Platform    | pnpm format/check 可执行；仓库格式一致。                                              |
| OTH-012 | P0       | Others   | 落地 Vitest 基础配置                            | OTH-004, OTH-007, OTH-008          | Platform    | 包级与应用级单测可运行；coverage 输出正常。                                           |
| OTH-013 | P0       | Others   | 落地 Playwright 基础配置                        | OTH-004, OTH-008                   | QA/Frontend | Playwright 可启动 web 并执行 smoke spec。                                             |
| OTH-014 | P0       | Others   | 建立 CI skeleton                                | OTH-006, OTH-010, OTH-012, OTH-013 | Platform    | CI 至少执行 install/typecheck/lint/test/build；失败能阻断合并。                       |

## Wave 1 — 共享协议、数据与复用包基座

**目标**：冻结跨模块协议，建立 sandbox/data/ui/charts 可复用基础。

| ID      | Priority | Module  | Task                                                 | Depends On                                                    | Owner           | Deliverable / DoD                                                                                                                                                                                                                 |
| ------- | -------- | ------- | ---------------------------------------------------- | ------------------------------------------------------------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SHR-001 | P0       | Shared  | 创建 packages/shared 包骨架                          | OTH-001, OTH-003                                              | Shared          | shared 包可被 web 与 agent-api 正常引用。                                                                                                                                                                                         |
| SHR-002 | P0       | Shared  | 定义 sandbox TypeScript types                        | SHR-001                                                       | Shared          | SandboxProfile/DailyRecord/ActivityData/SleepData/VitalSignsData 已导出。                                                                                                                                                         |
| SHR-003 | P0       | Shared  | 定义 Agent request/response types                    | SHR-001                                                       | Shared          | `AgentTaskType` / `PageContext` / `DataTab` / `Timeframe` 与唯一 `AgentResponseEnvelope` 已冻结；字段名固定为 `summary` / `chartTokens` / `microTips` / `meta.taskType` / `meta.pageContext` / `meta.finishReason`。              |
| SHR-004 | P0       | Shared  | 定义 chart token 类型与枚举                          | SHR-001                                                       | Shared          | 唯一 `ChartTokenId` 白名单已导出：`HRV_7DAYS` / `SLEEP_7DAYS` / `RESTING_HR_7DAYS` / `ACTIVITY_7DAYS` / `SPO2_7DAYS` / `SLEEP_STAGE_LAST_NIGHT` / `STRESS_LOAD_7DAYS` / `HRV_SLEEP_14DAYS_COMPARE`；不再定义对象 token 线缆协议。 |
| SHR-005 | P0       | Shared  | 定义 God-Mode DTO                                    | SHR-001                                                       | Shared          | profile switch/event inject/metric override/reset/scenario payload 已导出。                                                                                                                                                       |
| SHR-006 | P0       | Shared  | 定义 API envelope、error code 与 meta 协议           | SHR-001                                                       | Shared          | 统一成功/失败响应结构与 error code 已冻结。                                                                                                                                                                                       |
| SHR-007 | P0       | Shared  | 为 sandbox/agent/chart/god-mode/api 补齐 Zod schemas | SHR-002, SHR-003, SHR-004, SHR-005, SHR-006                   | Shared          | 共享 schema 可供前后端校验；非法输入会抛出明确错误。                                                                                                                                                                              |
| SHR-008 | P0       | Shared  | 提供 shared 常量与纯函数工具                         | SHR-007                                                       | Shared          | status color、page context、timeframe、date-range、chart-token utils 可复用。                                                                                                                                                     |
| SHR-009 | P0       | Shared  | 为 shared 协议增加单元测试                           | SHR-007, SHR-008                                              | Shared          | 关键 schema parse/serialize 与 helper 测试通过。                                                                                                                                                                                  |
| SHR-010 | P0       | Shared  | 定义 stress derived view model 与 schema             | SHR-002, SHR-007                                              | Shared          | `StressTimelineResponse` / `StressTimelinePoint` / `StressSummaryStats` 与 0-100 `stressLoadScore` 推导公式已冻结。                                                                                                               |
| SAN-001 | P0       | Sandbox | 创建 packages/sandbox 包骨架                         | OTH-001, OTH-003                                              | Shared/Sandbox  | sandbox 包可被 backend/agent/web mock 引用。                                                                                                                                                                                      |
| SAN-002 | P0       | Sandbox | 实现 sandbox 文件加载器                              | SAN-001, SHR-002, SHR-007                                     | Sandbox         | 可从 data/sandbox 读取 JSON 并完成 schema 校验。                                                                                                                                                                                  |
| SAN-003 | P0       | Sandbox | 实现 profile selector                                | SAN-002                                                       | Sandbox         | 可按 profileId 获取 profile；找不到返回明确错误。                                                                                                                                                                                 |
| SAN-004 | P0       | Sandbox | 实现 date range/window selector                      | SAN-002, SHR-008                                              | Sandbox         | 支持 day/week/month/year/custom 时间窗筛选。                                                                                                                                                                                      |
| SAN-005 | P0       | Sandbox | 实现 runtime override merge                          | SAN-002, SHR-005                                              | Sandbox         | 基础记录与 override 合并正确；不回写源文件。                                                                                                                                                                                      |
| SAN-006 | P0       | Sandbox | 实现 event merge 与 injected events 叠加策略         | SAN-002, SAN-005                                              | Sandbox         | 基础 events 与注入 events 可并存；去重/顺序规则明确。                                                                                                                                                                             |
| SAN-007 | P0       | Sandbox | 实现 missing-value semantics helpers                 | SAN-002, SHR-002                                              | Sandbox         | 缺失值显式保留；不做幻觉补齐。                                                                                                                                                                                                    |
| SAN-008 | P0       | Sandbox | 实现用于图表的 timeline normalization helpers        | SAN-004, SAN-007                                              | Sandbox         | 输出适合 chart builder 的标准时间序列结构，并提供 stress load 推导所需的 rolling median / missing-value 语义输入。                                                                                                                |
| SAN-009 | P0       | Sandbox | 为 sandbox 包补齐单元测试                            | SAN-002, SAN-003, SAN-004, SAN-005, SAN-006, SAN-007, SAN-008 | Sandbox         | loader/selector/merge/window/missing helpers 全部覆盖。                                                                                                                                                                           |
| UI-001  | P0       | UI      | 创建 packages/ui 包骨架                              | OTH-001, OTH-003                                              | Frontend/UI     | ui 包可被 web 引用。                                                                                                                                                                                                              |
| UI-002  | P0       | UI      | 定义设计 token 与主题语义常量                        | UI-001, SHR-008                                               | Frontend/UI     | 深色主题、状态色、间距、圆角、阴影 token 固化。                                                                                                                                                                                   |
| UI-003  | P0       | UI      | 封装基础布局组件                                     | UI-001, UI-002                                                | Frontend/UI     | Container/Section/Card/Grid 等基础组件可复用。                                                                                                                                                                                    |
| UI-004  | P0       | UI      | 封装状态类基础组件                                   | UI-002                                                        | Frontend/UI     | StatusBadge/Pill/InlineHint/MicroTip 可复用。                                                                                                                                                                                     |
| UI-005  | P0       | UI      | 封装交互类基础组件                                   | UI-002                                                        | Frontend/UI     | Button/IconButton/Tabs/Drawer/Sheet/Modal 可复用。                                                                                                                                                                                |
| UI-006  | P0       | UI      | 封装反馈类基础组件                                   | UI-002                                                        | Frontend/UI     | Skeleton/EmptyState/InlineError/LoadingDots 统一可复用。                                                                                                                                                                          |
| UI-007  | P1       | UI      | 为 ui 包增加可视化 smoke stories 或 demo page        | UI-003, UI-004, UI-005, UI-006                                | Frontend/UI     | 关键公共组件有最小验证页面或 story。                                                                                                                                                                                              |
| CHT-001 | P0       | Charts  | 创建 packages/charts 包骨架                          | OTH-001, OTH-003                                              | Frontend/Charts | charts 包可被 web 引用。                                                                                                                                                                                                          |
| CHT-002 | P0       | Charts  | 封装 ECharts React 基础适配层                        | CHT-001                                                       | Frontend/Charts | 统一的 ChartRoot 组件可稳定挂载/销毁图表实例。                                                                                                                                                                                    |
| CHT-003 | P0       | Charts  | 实现时间序列标准化工具                               | CHT-001, SHR-004                                              | Frontend/Charts | 基于 shared 中冻结的图表 view model 规范化统一图表输入；不直接依赖 sandbox 代码。                                                                                                                                                 |
| CHT-004 | P0       | Charts  | 实现标准图表 option builders                         | CHT-002, CHT-003, SHR-004                                     | Frontend/Charts | sleep/hrv/resting-hr/activity/spo2/stress/compare option builder 可用。                                                                                                                                                           |
| CHT-005 | P0       | Charts  | 实现微型图表组件                                     | CHT-002, CHT-004                                              | Frontend/Charts | 消息气泡内嵌微图表可渲染。                                                                                                                                                                                                        |
| CHT-006 | P0       | Charts  | 实现 chart token registry                            | CHT-004, SHR-004                                              | Frontend/Charts | shared `ChartTokenId` -> renderer 映射集中管理，前端页面不再私拼，也不消费对象 token。                                                                                                                                            |
| CHT-007 | P0       | Charts  | 为 charts 包补齐单元测试                             | CHT-003, CHT-004, CHT-006                                     | Frontend/Charts | option builder、token registry、normalize helpers 测试通过。                                                                                                                                                                      |
| DAT-001 | P0       | Data    | 建立 data/sandbox 目录结构与文件命名规范             | SHR-002, SAN-001                                              | Data            | profile 数据文件、manifest、README 结构固定。                                                                                                                                                                                     |
| DAT-002 | P0       | Data    | 制作 Profile A sandbox 数据                          | DAT-001, SAN-002                                              | Data            | 至少覆盖 homepage/data-center/advisor 所需字段与事件。                                                                                                                                                                            |
| DAT-003 | P0       | Data    | 制作 Profile B sandbox 数据                          | DAT-001, SAN-002                                              | Data            | 与 Profile A 在状态与趋势上明显不同。                                                                                                                                                                                             |
| DAT-004 | P0       | Data    | 制作 Profile C sandbox 数据                          | DAT-001, SAN-002                                              | Data            | 用于演示异常/压力/睡眠差等情境。                                                                                                                                                                                                  |
| DAT-005 | P0       | Data    | 编写 fallback 文案资产                               | DAT-001, SHR-003                                              | Data/Agent      | homepage/view-summary/advisor-chat 场景 fallback 资产可按 profile/task 加载，且以 `summary/chartTokens/microTips` 结构化字段组织。                                                                                                |
| DAT-006 | P0       | Data    | 编写 prompts 模板资产                                | DAT-001, SHR-003                                              | Data/Agent      | system/homepage/view-summary/advisor-chat prompt 模板存在于 data/prompts。                                                                                                                                                        |
| DAT-007 | P0       | Data    | 定义 God-Mode 场景清单与 scenario manifests          | DAT-001, SHR-005                                              | Data            | 场景包含 profile switch、event inject、metric override、reset 脚本。                                                                                                                                                              |
| DAT-008 | P0       | Data    | 实现 sandbox 资产校验脚本                            | DAT-002, DAT-003, DAT-004, DAT-005, DAT-006, DAT-007          | Data/Platform   | 脚本能校验 schema、必填字段、日期连续性与引用正确性。                                                                                                                                                                             |

## Wave 2 — Agent Core 基座

**目标**：完成 packages/agent-core 的可调用 Runtime，不依赖 UI。

### Wave 2.1 — Runtime/Foundation

**本段目标**：先把 provider、memory、context builder 这些底座收敛，确保后续规则与 prompt 有稳定依赖。

| ID      | Priority | Module | Task                                    | Depends On                                           | Owner | Deliverable / DoD                                                                                 |
| ------- | -------- | ------ | --------------------------------------- | ---------------------------------------------------- | ----- | ------------------------------------------------------------------------------------------------- |
| AGT-001 | P0       | Agent  | 创建 packages/agent-core 包骨架         | OTH-001, OTH-003                                     | Agent | agent-core 包可被 backend 引用。                                                                  |
| AGT-002 | P0       | Agent  | 实现 provider 配置与模型选择适配层      | AGT-001                                              | Agent | 可通过 env 选择 provider/model；接口统一。                                                        |
| AGT-003 | P0       | Agent  | 封装 LangChain createAgent 初始化器     | AGT-001, AGT-002                                     | Agent | createAgent wrapper 可按配置创建单 Agent 实例。                                                   |
| AGT-004 | P0       | Agent  | 定义 Agent 内部任务路由与 taskType 分流 | AGT-001, SHR-003                                     | Agent | homepage_brief/view_summary/advisor_chat/micro_insight 流转清晰。                                 |
| AGT-005 | P0       | Agent  | 实现 session memory 存储抽象            | AGT-001, SHR-003                                     | Agent | 支持当前会话最近 N 轮消息读写；同一 `sessionId` 在 profile switch 后必须硬失效旧 profile memory。 |
| AGT-006 | P0       | Agent  | 实现 analytical memory 存储抽象         | AGT-001, SHR-003                                     | Agent | 支持最近摘要/最近视图总结/最近规则输出读写，并在 profile switch / override 大改动后失效。         |
| AGT-007 | P0       | Agent  | 定义 AgentContext 领域模型              | AGT-004, SHR-002, SHR-003                            | Agent | 上下文字段与 page/task/window/profile/tags/events/rules 对齐。                                    |
| AGT-008 | P0       | Agent  | 实现 context builder                    | AGT-007, SAN-003, SAN-004, SAN-005, SAN-006, SAN-007 | Agent | 给定 request 与 runtime state 可产出完整 AgentContext。                                           |

### Wave 2.2 — Rules/Prompt/Structured Output

**本段目标**：在底座稳定后冻结规则、prompt 与结构化输出，避免后面 facade 一直返工。

| ID      | Priority | Module | Task                                | Depends On                | Owner | Deliverable / DoD                                                                                                                           |
| ------- | -------- | ------ | ----------------------------------- | ------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| AGT-009 | P0       | Agent  | 实现 insight rule engine 基础框架   | AGT-007, SAN-004         | Agent | 规则执行器可输出结构化 insights/signals。                                                                                                   |
| AGT-010 | P0       | Agent  | 实现首页晨报相关规则                | AGT-009                  | Agent | 可抽取状态色、近期异常点、建议候选。                                                                                                        |
| AGT-011 | P0       | Agent  | 实现视图总结相关规则                | AGT-009, SHR-010         | Agent | 可按 tab/timeframe 抽取趋势、异常、对比信息，并支持 stress load 的解释性信号。                                                              |
| AGT-012 | P0       | Agent  | 实现 prompt 资产加载器              | AGT-001, DAT-006         | Agent | 可加载 system/task prompt 模板并缓存。                                                                                                      |
| AGT-013 | P0       | Agent  | 实现 system prompt builder          | AGT-012, AGT-007         | Agent | 固定 persona/constraints 能被可靠注入。                                                                                                     |
| AGT-014 | P0       | Agent  | 实现 task prompt builder            | AGT-012, AGT-004, AGT-008 | Agent | 按 taskType 注入不同任务说明、上下文与 task constraints。                                                                                   |
| AGT-015 | P0       | Agent  | 定义结构化输出 schema 并接入 parser | AGT-003, SHR-003, SHR-007 | Agent | 模型输出会被 parse 成唯一 AgentResponseEnvelope，字段名固定为 `chartTokens: ChartTokenId[]` / `microTips: string[]` / `meta.finishReason`。 |
| AGT-016 | P0       | Agent  | 实现 chart token 白名单校验器       | AGT-015, SHR-004         | Agent | 仅允许 shared `ChartTokenId[]`；非法 token 或对象 token 被过滤或触发 fallback。                                                             |
| AGT-017 | P0       | Agent  | 实现 safety cleaner                 | AGT-015                  | Agent | 越权诊断、缺失数据幻觉、非法字段会被清洗或降级。                                                                                            |

### Wave 2.3 — Fallback/Facade/Test

**本段目标**：最后组装运行时总入口，并把 fallback、timeout、测试一次收口。

| ID      | Priority | Module | Task                        | Depends On                                                                                                                   | Owner | Deliverable / DoD                                            |
| ------- | -------- | ------ | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ----- | ------------------------------------------------------------ |
| AGT-018 | P0       | Agent  | 实现 fallback engine        | AGT-004, DAT-005                                                                                                             | Agent | 超时、provider error、invalid output、low-data 场景能给出稳定响应。 |
| AGT-019 | P0       | Agent  | 实现 timeout controller     | AGT-003, AGT-018                                                                                                             | Agent | AI 执行可在 6 秒阈值内被中断并转 fallback。                  |
| AGT-020 | P0       | Agent  | 组装 Agent Runtime facade   | AGT-003, AGT-004, AGT-005, AGT-006, AGT-008, AGT-010, AGT-011, AGT-013, AGT-014, AGT-015, AGT-016, AGT-017, AGT-018, AGT-019 | Agent | backend 可通过单一 executeAgent(request, runtimeDeps) 调用。 |
| AGT-021 | P0       | Agent  | 为 agent-core 补齐单元测试  | AGT-008, AGT-009, AGT-010, AGT-011, AGT-015, AGT-018, AGT-019, AGT-020                                                       | Agent | context/rules/parser/fallback/timeout 覆盖到位。             |

## Wave 3 — Backend 应用壳层与只读/AI/God-Mode API

**目标**：完成 apps/agent-api 的 Fastify 应用、状态容器与所有对外接口。

### Wave 3.1 — App Shell/Runtime

**本段目标**：先把 Fastify 外壳、日志、运行时容器与基础只读能力立住。

| ID     | Priority | Module  | Task                                    | Depends On              | Owner   | Deliverable / DoD                                                                                         |
| ------ | -------- | ------- | --------------------------------------- | ----------------------- | ------- | --------------------------------------------------------------------------------------------------------- |
| BE-001 | P0       | Backend | 实现 agent-api 环境变量 schema 与加载器 | OTH-007, OTH-009       | Backend | PORT/NODE_ENV/LLM_*/AI_TIMEOUT_MS/ENABLE_GOD_MODE 校验通过。                                              |
| BE-002 | P0       | Backend | 实现 logger 基础封装                    | OTH-007                | Backend | 结构化日志可输出 requestId、route、latency、error。                                                       |
| BE-003 | P0       | Backend | 实现 request-context 插件               | BE-001, BE-002         | Backend | 每个请求自动注入 requestId/sessionId/profileId 上下文。                                                   |
| BE-004 | P0       | Backend | 实现统一错误处理插件                    | BE-001, SHR-006        | Backend | schema 错误、业务错误、未知错误按统一 envelope 返回。                                                     |
| BE-005 | P0       | Backend | 实现 CORS 与基础安全头配置              | BE-001                 | Backend | web 本地联调正常；不影响 demo 运行。                                                                      |
| BE-006 | P0       | Backend | 实现 metrics 插件                       | BE-001, BE-002         | Backend | API latency/AI timeout/fallback/provider error 可记录。                                                   |
| BE-007 | P1       | Backend | 实现 Sentry 插件接线                    | BE-001                 | Backend | 后端异常可上报；本地可关闭。                                                                              |
| BE-008 | P0       | Backend | 实现 runtime registry                   | BE-001                 | Backend | 应用启动时组装 sandbox/agent/services/runtime stores。                                                    |
| BE-009 | P0       | Backend | 实现 session store                      | BE-008                 | Backend | 支持 demo 期内按 sessionId 保存短期会话记忆；profile switch 时清空旧 profile 的 session / analytical memory。 |
| BE-010 | P0       | Backend | 实现 override store                     | BE-008, SHR-005        | Backend | 支持 profile switch、event inject、metric override、reset 的内存态存储。                                  |
| BE-011 | P0       | Backend | 实现 scenario registry                  | BE-008, DAT-007        | Backend | 可按 scenarioId 读取 God-Mode 场景脚本。                                                                  |
| BE-012 | P0       | Backend | 实现 /health 路由                       | BE-001, BE-004         | Backend | 可返回应用、env、provider readiness 基础信息。                                                            |
| BE-013 | P0       | Backend | 实现 profiles 模块与基础只读路由        | BE-008, SAN-003        | Backend | 可列出 profile 清单，并提供 `GET /profiles/:profileId` 的基础信息读取能力。                               |

### Wave 3.2 — Read-only + AI API

**本段目标**：在 runtime 稳定后完成正式只读接口和 AI 接口，供前端联调使用。

| ID     | Priority | Module  | Task                                    | Depends On                                  | Owner   | Deliverable / DoD                                                                                                                 |
| ------ | -------- | ------- | --------------------------------------- | ------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------- |
| BE-014 | P0       | Backend | 实现 profile timeline 只读路由          | BE-008, SAN-003, SAN-004, SAN-005           | Backend | 提供 `GET /profiles/:profileId/timeline`；Homepage 与 Data Center 均通过正式只读接口组合数据，不新增独立 homepage 聚合 endpoint。 |
| BE-015 | P0       | Backend | 实现 data-center 只读数据路由           | BE-008, SAN-003, SAN-004, SAN-005, SAN-008, SHR-010 | Backend | 可按 tab/timeframe/dateRange 返回图表数据与元信息；`stress` tab 必须返回 `StressTimelineResponse`。                               |
| BE-016 | P0       | Backend | 实现 chart-data 专用路由或服务          | BE-015, SHR-004                             | Backend | 统一输出 shared `ChartTokenId` 对应的图表系列数据。                                                                               |
| BE-017 | P0       | Backend | 实现 AI orchestration service           | BE-008, AGT-020                             | Backend | backend 内部可统一调用 Agent Runtime 并处理 timeout/fallback/meta.finishReason。                                                  |
| BE-018 | P0       | Backend | 实现 /ai/morning-brief 路由             | BE-017, BE-013, BE-014                      | Backend | 首页晨报接口按 profile/pageContext 返回结构化响应。                                                                               |
| BE-019 | P0       | Backend | 实现 /ai/view-summary 路由              | BE-017, BE-015                              | Backend | Data Center 当前视图总结接口可按 tab/timeframe 工作。                                                                             |
| BE-020 | P0       | Backend | 实现 /ai/chat 路由                      | BE-017                                      | Backend | AI Advisor 聊天接口支持 userMessage、smartPromptId、visibleChartIds；ChatRequest 字段与 shared 协议一致。                         |
| BE-021 | P1       | Backend | 实现 /ai/chat/stream SSE 路由           | BE-017                                      | Backend | 如启用流式，前端可按 SSE 接收消息块；未启用不影响主流程。                                                                         |

### Wave 3.3 — God-Mode API/Test

**本段目标**：把 God-Mode 能力和接口一致性、集成测试一起收尾，避免只完成半套管理面。 

| ID      | Priority | Module  | Task                                              | Depends On                                                                                      | Owner      | Deliverable / DoD                                                                                                          |
| ------- | -------- | ------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------- |
| BE-022  | P0       | Backend | 实现 God-Mode API：switch profile                 | BE-010, BE-009, SHR-005                                                                         | Backend    | 调用后更新当前 profile runtime state；保留 `sessionId`，但必须清空旧 profile 的 session / analytical memory；不强制页面跳转。 |
| BE-023  | P0       | Backend | 实现 God-Mode API：inject event                   | BE-010, SHR-005                                                                                 | Backend    | 调用后可写入 event override 并返回 active-sensing 所需数据。                                                               |
| BE-024  | P0       | Backend | 实现 God-Mode API：override metric                | BE-010, SHR-005                                                                                 | Backend    | 调用后目标日期/指标被局部覆盖。                                                                                            |
| BE-025  | P0       | Backend | 实现 God-Mode API：reset / restore scenario       | BE-010, BE-011, SHR-005                                                                         | Backend    | 可清空 overrides 或按 scenario 重放。                                                                                      |
| BE-025A | P0       | Backend | 实现 God-Mode API：state / demo-script run        | BE-010, BE-011, SHR-005                                                                         | Backend    | `GET /god-mode/state` 与 `POST /god-mode/demo-script/run` 可用；demo-script 必须通过正式 API 执行并返回 executed steps 摘要。 |
| BE-026  | P0       | Backend | 统一只读接口与 AI/God-Mode 接口 response envelope | BE-004, BE-013, BE-014, BE-015, BE-018, BE-019, BE-020, BE-022, BE-023, BE-024, BE-025, BE-025A | Backend    | 所有接口返回结构统一；前端无需各写一套适配。                                                                               |
| BE-027  | P0       | Backend | 为 backend 模块编写集成测试                       | BE-012, BE-013, BE-014, BE-015, BE-018, BE-019, BE-020, BE-022, BE-023, BE-024, BE-025, BE-025A | Backend/QA | health/profile/data/ai/god-mode 路由可在测试环境跑通。                                                                     |

## Wave 4 — Frontend 应用壳层与页面骨架

**目标**：完成 apps/web 基础布局、状态容器、页面骨架与公共渲染链路。

### Wave 4.1 — App Shell/Stores

**本段目标**：先完成应用壳层、API client 与核心 store，让页面骨架有统一容器。

| ID     | Priority | Module   | Task                               | Depends On       | Owner    | Deliverable / DoD                                                                  |
| ------ | -------- | -------- | ---------------------------------- | ---------------- | -------- | ---------------------------------------------------------------------------------- |
| FE-001 | P0       | Frontend | 实现 web 环境变量读取层            | OTH-008, OTH-009 | Frontend | NEXT_PUBLIC_AGENT_API_BASE_URL 与 NEXT_PUBLIC_ENABLE_GOD_MODE 可读取。             |
| FE-002 | P0       | Frontend | 实现 app-providers 组合层          | OTH-008, FE-001  | Frontend | Query/Theme/Motion/Zustand 相关 providers 在根 layout 装配。                       |
| FE-003 | P0       | Frontend | 实现全局 dark theme 与 globals.css | FE-002, UI-002   | Frontend | 暗黑模式视觉基线与基础排版可用。                                                   |
| FE-004 | P0       | Frontend | 实现根 layout 与全局页面骨架       | FE-002, UI-003   | Frontend | 顶层布局、背景、页边距、容器规则固定。                                             |
| FE-005 | P0       | Frontend | 实现 API client 与 fetcher         | FE-001, SHR-006  | Frontend | 统一处理 baseURL、headers、timeout、error mapping。                                |
| FE-006 | P0       | Frontend | 实现 TanStack Query 客户端配置     | FE-002, FE-005   | Frontend | query retry/staleTime/cache 策略合理。                                             |
| FE-007 | P0       | Frontend | 实现 query keys 约定               | FE-006           | Frontend | homepage/data-center/advisor/profile/god-mode keys 固定。                          |
| FE-008 | P0       | Frontend | 实现 profile.store                 | FE-002, BE-013   | Frontend | 当前 profileId、profile basics、切换动作本地可管理。                               |
| FE-009 | P0       | Frontend | 实现 ui.store                      | FE-002           | Frontend | 全局 Drawer/Sheet/Toast/Loading 等 UI 状态可管理。                                 |
| FE-010 | P0       | Frontend | 实现 data-center.store             | FE-002, SHR-003  | Frontend | 当前 tab/timeframe/dateRange/filter state 可管理。                                 |
| FE-011 | P0       | Frontend | 实现 ai-advisor.store              | FE-002, SHR-003  | Frontend | 聊天打开状态、消息流、本地输入态可管理，并支持 profile switch 时重置旧消息上下文。 |
| FE-012 | P0       | Frontend | 实现 god-mode.store                | FE-002, SHR-005  | Frontend | God-Mode 开关、面板状态、选中 scenario 等可管理。                                  |
| FE-013 | P0       | Frontend | 实现 active-sensing.store          | FE-002           | Frontend | active-sensing 横幅的展示/关闭/优先级可管理。                                      |

### Wave 4.2 — Homepage + Data Center

**本段目标**：把首页与数据中心的页面骨架先搭起来，尽早形成可见界面。

| ID     | Priority | Module   | Task                                | Depends On                      | Owner    | Deliverable / DoD                                                                                         |
| ------ | -------- | -------- | ----------------------------------- | ------------------------------- | -------- | --------------------------------------------------------------------------------------------------------- |
| FE-014 | P0       | Frontend | 实现 Homepage 路由骨架              | FE-004                          | Frontend | 首页可访问并显示空壳 section。                                                                            |
| FE-015 | P0       | Frontend | 实现 Morning Brief Card UI 组件     | FE-014, UI-003, UI-004, UI-006  | Frontend | 支持状态色、标题、正文、micro tips 插槽。                                                                 |
| FE-016 | P0       | Frontend | 实现 Micro-Insights Pills UI        | FE-014, UI-004                  | Frontend | 横向 pill 区可展示多条贴士。                                                                              |
| FE-017 | P0       | Frontend | 实现 Historical Trends 卡片栅格     | FE-014, UI-003                  | Frontend | 多卡片阵列在 mobile/tablet/desktop 布局合理。                                                             |
| FE-018 | P0       | Frontend | 实现 Data Center 路由骨架           | FE-004                          | Frontend | data-center 页面可访问并显示空壳 section。                                                                |
| FE-019 | P0       | Frontend | 实现 Data Center tab/timeframe 控件 | FE-018, UI-005, FE-010          | Frontend | tab 与 timeframe 切换可驱动本地状态；首阶段 timeframe 仅暴露 day/week/month/year，custom 为 P1 后续补齐。 |
| FE-020 | P0       | Frontend | 实现标准图表容器组件                | FE-018, CHT-002, UI-003, UI-006 | Frontend | 图表容器具备 loading/empty/error 外壳，并可承载 `stressLoadScore` 主图与断点数据。                        |
| FE-021 | P0       | Frontend | 实现 View Summary trigger UI        | FE-018, UI-005                  | Frontend | 右下角按钮或浮层触发入口可用。                                                                            |

### Wave 4.3 — Advisor + God-Mode + QA

**本段目标**：最后收拢聊天外壳、God-Mode 面板与基础前端验证，避免同时铺太多页面。 

| ID     | Priority | Module   | Task                                     | Depends On                     | Owner       | Deliverable / DoD                                                                          |
| ------ | -------- | -------- | ---------------------------------------- | ------------------------------ | ----------- | ------------------------------------------------------------------------------------------ |
| FE-022 | P0       | Frontend | 实现 AI Advisor 浮动入口                 | FE-004, UI-005                 | Frontend    | 右下角气泡菜单可在各页面常驻。                                                             |
| FE-023 | P0       | Frontend | 实现 AI Advisor Drawer/Bottom Sheet 容器 | FE-022, UI-005, FE-011         | Frontend    | 移动端与桌面端形态自适应。                                                                 |
| FE-024 | P0       | Frontend | 实现消息列表与消息气泡组件               | FE-023, UI-003                 | Frontend    | 支持 user/assistant/system 消息展示。                                                      |
| FE-025 | P0       | Frontend | 实现 chart token renderer                | FE-024, CHT-006, SHR-004       | Frontend    | 消息内 `ChartTokenId[]` 可映射成对应图表组件；前端只消费字符串 token，不再兼容对象 token。 |
| FE-026 | P0       | Frontend | 实现 Smart Prompts 与生理标签面板 UI     | FE-023, UI-004, UI-005         | Frontend    | 顶部快捷指令与标签展示区可用。                                                             |
| FE-027 | P0       | Frontend | 实现 God-Mode 面板壳层                   | FE-004, FE-012, UI-005         | Frontend    | 在开关开启时可打开隐藏面板。                                                               |
| FE-028 | P0       | Frontend | 实现响应式断点与布局行为                 | FE-014, FE-018, FE-023, FE-027 | Frontend    | Homepage/Data Center/Advisor/God-Mode 在三端表现符合设计边界。                             |
| FE-029 | P1       | Frontend | 补齐前端基础单元测试                     | FE-015, FE-019, FE-025, FE-028 | Frontend/QA | 关键 store、token renderer、核心组件测试通过。                                             |
| FE-030 | P1       | Frontend | 为 Historical Trends 补齐拖拽排序能力    | FE-017                         | Frontend    | 首页趋势卡支持正式拖拽排序；实现不破坏响应式布局与卡片图表稳定性。                         |

## Wave 5 — AI 垂直切片联通

**目标**：把 Agent + Backend + Frontend 连成用户可见的 AI 体验。

### Wave 5.1 — Homepage + View Summary

**本段目标**：先打通首页晨报与视图总结两条较短路径，快速建立 AI 体验基线。

| ID     | Priority | Module   | Task                                    | Depends On                     | Owner                  | Deliverable / DoD                                                                             |
| ------ | -------- | -------- | --------------------------------------- | ------------------------------ | ---------------------- | --------------------------------------------------------------------------------------------- |
| AI-001 | P0       | AI Slice | 联通 Morning Brief 全链路               | BE-018, FE-015, FE-016, FE-017 | Frontend/Backend/Agent | 首页加载后可看到真实结构化晨报响应。                                                          |
| AI-002 | P0       | AI Slice | 实现 Homepage 请求 hook 与 query        | AI-001, FE-006, FE-007         | Frontend               | 首页可基于当前 profile 拉取 AI 晨报与只读数据。                                               |
| AI-003 | P0       | AI Slice | 实现 Homepage loading skeleton 与微文案 | AI-001, UI-006                 | Frontend               | 等待 AI 返回的 1-5 秒有统一 Skeleton 状态。                                                   |
| AI-004 | P0       | AI Slice | 实现 Homepage fallback 渲染路径         | AI-001, AGT-018                | Frontend/Backend       | 当 source=fallback 时仍按统一卡片协议渲染。                                                   |
| AI-005 | P0       | AI Slice | 联通 Data Center 只读图表数据链路       | BE-015, BE-016, FE-019, FE-020 | Frontend/Backend       | 按 tab/timeframe 切换可看到真实数据图表，包含 `stress` tab 的 `StressTimelineResponse` 渲染。 |
| AI-006 | P0       | AI Slice | 联通 View Summary 全链路                | BE-019, FE-021                 | Frontend/Backend/Agent | 点击总结按钮可获取当前视图 AI 总结。                                                          |
| AI-007 | P0       | AI Slice | 实现 View Summary loading/fallback 状态 | AI-006, UI-006                 | Frontend               | 视图总结等待态与 fallback 态统一。                                                            |

### Wave 5.2 — Advisor Chat

**本段目标**：在首页路径稳定后单独收敛聊天闭环，避免三条 AI 旅程同时联调。 

| ID     | Priority | Module   | Task                                            | Depends On              | Owner                  | Deliverable / DoD                                                                   |
| ------ | -------- | -------- | ----------------------------------------------- | ----------------------- | ---------------------- | ----------------------------------------------------------------------------------- |
| AI-008 | P0       | AI Slice | 联通 Advisor Chat 发送消息全链路                | BE-020, FE-023, FE-024  | Frontend/Backend/Agent | 用户可发送消息并收到结构化回答。                                                    |
| AI-009 | P0       | AI Slice | 实现 Advisor Chat 请求上下文转发                | AI-008, FE-010, FE-008  | Frontend               | pageContext/tab/timeframe/visibleChartIds 会随请求送往后端。                        |
| AI-010 | P0       | AI Slice | 实现 Advisor Chat loading / assistant typing UI | AI-008, UI-006          | Frontend               | 发送消息后有等待状态且不会阻塞输入。                                                |
| AI-011 | P0       | AI Slice | 实现 Advisor Chat fallback 渲染路径             | AI-008, AGT-018         | Frontend/Backend       | provider error/timeout/invalid output 时可统一显示 fallback 回答。                  |
| AI-012 | P0       | AI Slice | 打通消息内 chart token 渲染                     | AI-008, FE-025, AGT-016 | Frontend/Agent         | 带 `chartTokens: ChartTokenId[]` 的消息能嵌入微图表。                               |
| AI-013 | P0       | AI Slice | 统一渲染状态色、source 与 meta                  | AI-001, AI-006, AI-008  | Frontend               | Morning Brief/View Summary/Chat 均能消费统一 meta 字段。                            |
| AI-014 | P0       | AI Slice | 打通 Smart Prompt 执行链路                      | BE-020, FE-026          | Frontend/Backend       | 点击快捷指令可直接生成聊天请求。                                                    |
| AI-015 | P0       | AI Slice | 打通 session memory 在 chat 中的连续性          | BE-009, AGT-005, AI-008 | Backend/Agent          | 同 `sessionId` 且同 `profileId` 的多轮对话上下文连续；profile switch 后旧记忆失效。 |
| AI-016 | P1       | AI Slice | 接入 analytical memory 读写                     | AGT-006, BE-017, AI-006, AI-008 | Backend/Agent    | 最近一次总结/规则输出可被后续请求复用。                                             |

### Wave 5.3 — Guardrails + Refresh + E2E

**本段目标**：最后补齐数据守护、profile 切换重取与端到端验证，作为 AI 联调收口。 

| ID     | Priority | Module   | Task                                     | Depends On                                                               | Owner                  | Deliverable / DoD                                                                                   |
| ------ | -------- | -------- | ---------------------------------------- | ------------------------------------------------------------------------ | ---------------------- | --------------------------------------------------------------------------------------------------- |
| AI-017 | P0       | AI Slice | 实现空数据与低数据量 guardrails 全链路   | SAN-007, AGT-017, AGT-018, AI-001, AI-006, AI-008                        | Agent/Backend/Frontend | 缺失数据不幻觉，前端看到明确的降级结果。                                                            |
| AI-018 | P0       | AI Slice | 在 profile switch 后使 AI 查询失效并重取 | BE-022, BE-009, AGT-005, AGT-006, FE-008, FE-011, AI-002, AI-006, AI-008 | Frontend               | 切 profile 后首页/图表/聊天上下文刷新；`sessionId` 可续用，但旧 profile AI 结果与 memory 不得残留。 |
| AI-019 | P1       | AI Slice | 实现 SSE 聊天体验（如启用）              | BE-021, FE-023, FE-024                                                   | Frontend/Backend       | 流式消息按增量渲染；非流式仍可回退。                                                                |
| AI-020 | P0       | AI Slice | 编写 AI 核心旅程 E2E                     | AI-001, AI-006, AI-008, AI-011, AI-012                                   | QA                     | 首页晨报、视图总结、聊天、fallback、图表 token 端到端可验证。                                       |

## Wave 6 — God-Mode 垂直切片联通

**目标**：把 profile switch、event inject、metric override、reset/scenario/demo-script 落到真实演示能力。

### Wave 6.1 — Profile Switch + Active Sensing

**本段目标**：先做最核心的 profile 切换与主动感知横幅，保证演示时有最小可用闭环。

| ID     | Priority | Module   | Task                                             | Depends On             | Owner            | Deliverable / DoD                                                                                 |
| ------ | -------- | -------- | ------------------------------------------------ | ---------------------- | ---------------- | ------------------------------------------------------------------------------------------------- |
| GM-001 | P0       | God-Mode | 联通 profile switch API 与前端动作               | BE-022, FE-027, FE-008 | Frontend/Backend | 切换 profile 会刷新全局数据与 AI 结果，不触发强制跳页；保留 `sessionId` 但清空旧 profile memory。 |
| GM-002 | P0       | God-Mode | 实现 profile switch 后的 query invalidation 策略 | GM-001, FE-006, FE-007 | Frontend         | 首页、Data Center、AI Advisor 相关查询全部失效重取。                                              |
| GM-003 | P0       | God-Mode | 联通 inject event API 与前端动作                 | BE-023, FE-027         | Frontend/Backend | 从面板注入 event 后后端产生 override 并返回 active-sensing 数据。                                 |
| GM-004 | P0       | God-Mode | 实现 Active Sensing 横幅展示逻辑                 | GM-003, FE-013         | Frontend         | 无论当前视图为何，顶部都能强制下拉横幅。                                                          |
| GM-005 | P0       | God-Mode | 实现 Active Sensing 横幅关闭与状态恢复           | GM-004                 | Frontend         | 关闭横幅后底层页面状态保持不变。                                                                  |

### Wave 6.2 — Override/Scenario/Demo Script

**本段目标**：第二段聚焦演示操作面本身，把 override、scenario、demo-script 独立收口。 

| ID     | Priority | Module   | Task                              | Depends On              | Owner            | Deliverable / DoD                                                                |
| ------ | -------- | -------- | --------------------------------- | ----------------------- | ---------------- | -------------------------------------------------------------------------------- |
| GM-006 | P0       | God-Mode | 联通 metric override API 与前端动作 | BE-024, FE-027        | Frontend/Backend | 修改指标后后端 override 生效并返回受影响范围。                                   |
| GM-007 | P0       | God-Mode | 实现 metric override 后的局部重绘策略 | GM-006, FE-015, FE-020 | Frontend         | 首页卡片/图表局部更新，避免整页闪烁重载。                                        |
| GM-008 | P0       | God-Mode | 联通 reset API                    | BE-025, FE-027          | Frontend/Backend | 重置后 runtime overrides 被清空，页面恢复基础 sandbox。                          |
| GM-009 | P0       | God-Mode | 联通 restore scenario API         | BE-025, DAT-007, FE-027 | Frontend/Backend | 选择 scenario 后可一键恢复预设演示态。                                           |
| GM-010 | P0       | God-Mode | 实现演示脚本 trigger 入口         | BE-025A, GM-009         | Frontend/Backend | 面板支持通过正式 demo-script API 一步触发多个动作，不在前端本地拼接状态。        |

### Wave 6.3 — Gating + Concurrency + E2E

**本段目标**：最后处理启停控制、并发交互、动画体验与端到端验证。 

| ID     | Priority | Module   | Task                               | Depends On                     | Owner            | Deliverable / DoD                                                  |
| ------ | -------- | -------- | ---------------------------------- | ------------------------------ | ---------------- | ------------------------------------------------------------------ |
| GM-011 | P0       | God-Mode | 实现 God-Mode 开关受 env 控制      | FE-001, BE-001, FE-027         | Frontend/Backend | 生产演示可开启，其他环境可关闭。                                   |
| GM-012 | P0       | God-Mode | 处理 God-Mode 与 AI Advisor 并发交互 | GM-001, GM-003, GM-006, FE-011 | Frontend         | 在 Chat 打开时触发 God-Mode，不破坏消息面板状态。                  |
| GM-013 | P0       | God-Mode | 实现 God-Mode 交互动画平滑策略     | GM-001, GM-004, GM-007         | Frontend         | 切 profile、横幅弹出、局部更新视觉上顺滑。                         |
| GM-014 | P0       | God-Mode | 编写 God-Mode E2E                  | GM-001, GM-004, GM-007, GM-008, GM-009 | QA      | profile switch/event inject/metric override/reset/scenario 都可端到端验证。 |

## Wave 7 — Hardening、观测、Demo 运行保障

**目标**：把项目从“能跑”推进到“可演示、可排障、可交付”。

### Wave 7.1 — Runtime Hardening/Observability

**本段目标**：优先补齐运行时稳定性与可观测性，避免进入彩排后才发现根因不可见。 

| ID     | Priority | Module    | Task                                    | Depends On                     | Owner            | Deliverable / DoD                                                                                    |
| ------ | -------- | --------- | --------------------------------------- | ------------------------------ | ---------------- | ---------------------------------------------------------------------------------------------------- |
| HD-001 | P0       | Hardening | 统一 AI timeout 配置与默认值            | BE-001, AGT-019, FE-005        | Backend/Frontend | 前后端都遵循 6 秒超时策略且行为一致。                                                                |
| HD-002 | P0       | Hardening | 实现 fallback-only 运行模式             | BE-017, DAT-005                | Backend          | 在无真实 provider 时也可完整演示核心路径。                                                           |
| HD-003 | P1       | Hardening | 实现 provider 切换与模型切换 smoke 验证 | BE-001, AGT-002                | Backend          | 至少验证一个默认 provider 与一个备选 provider 配置可用。                                             |
| HD-004 | P0       | Hardening | 补齐后端 request logging 字段           | BE-002, BE-003                 | Backend          | 日志包含 requestId/route/profileId/sessionId/provider/model/latency/fallbackTriggered/finishReason。 |
| HD-005 | P0       | Hardening | 补齐 backend metrics counters           | BE-006, BE-018, BE-019, BE-020 | Backend          | API latency、AI timeout、fallback、provider error 可统计。                                           |
| HD-006 | P1       | Hardening | 验证 Sentry 上报路径                    | BE-007                         | Backend          | 错误可上报且不会泄露敏感配置。                                                                       |
| HD-007 | P0       | Hardening | 实现 sandbox 启动时资产校验             | DAT-008, BE-008                | Backend          | 服务启动时校验 sandbox/fallback/prompts/scenarios 完整性。                                           |

### Wave 7.2 — Delivery/CI

**本段目标**：第二段聚焦本地联调、部署与质量门禁，把交付链路固定下来。 

| ID     | Priority | Module    | Task                            | Depends On                         | Owner       | Deliverable / DoD                                            |
| ------ | -------- | --------- | ------------------------------- | ---------------------------------- | ----------- | ------------------------------------------------------------ |
| HD-008 | P1       | Hardening | 实现开发期 reset/seed 脚本      | DAT-002, DAT-003, DAT-004, DAT-007 | Platform    | 可快速恢复 demo 数据与 runtime state。                       |
| HD-009 | P0       | Hardening | 实现 Docker Compose 本地联调方案 | OTH-007, OTH-008, OTH-009          | Platform    | web + agent-api 可通过 docker compose 跑通。                 |
| HD-010 | P1       | Hardening | 编写轻量部署清单或容器脚本      | HD-009                             | Platform    | 支持单机容器部署或轻量云部署的最小脚本。                     |
| HD-011 | P0       | Hardening | 固化根级质量门禁 pipeline       | OTH-014, FE-029, AGT-021, BE-027   | Platform    | merge 前必须通过 typecheck/lint/test/build。                 |
| HD-012 | P1       | Hardening | 配置基础 coverage 门槛          | OTH-012, FE-029, AGT-021, BE-027   | Platform/QA | 关键包覆盖率门槛固定并纳入 CI。                              |

### Wave 7.3 — Frontend Resilience/Demo Ops

**本段目标**：最后收拢前端兜底体验、runbook、彩排和最终验收，便于按演示视角收尾。 

| ID     | Priority | Module    | Task                                        | Depends On             | Owner       | Deliverable / DoD                                                    |
| ------ | -------- | --------- | ------------------------------------------- | ---------------------- | ----------- | -------------------------------------------------------------------- |
| HD-013 | P0       | Hardening | 补齐前端路由级 loading/error/not-found 页面 | FE-004, UI-006         | Frontend    | 异常路由和页面级加载态有统一兜底表现。                               |
| HD-014 | P0       | Hardening | 补齐断网/后端不可用时的前端错误体验         | FE-005, FE-009, UI-006 | Frontend    | 用户可见明确错误与重试入口，不出现白屏。                             |
| HD-015 | P0       | Hardening | 编写核心 smoke runbook                      | AI-020, GM-014, HD-009 | QA/Platform | 开发人员可按步骤验证首页、Data Center、Advisor、God-Mode、fallback。 |
| HD-016 | P1       | Hardening | 编写离线演示 runbook                        | HD-002, HD-009         | Platform    | 在断网或 provider 不可用时可按指引切到 fallback-only。               |
| HD-017 | P1       | Hardening | 组织 bug bash 与修复回合                    | AI-020, GM-014, HD-015 | All         | 核心演示路径问题被记录、修复、回归验证。                             |
| HD-018 | P0       | Hardening | 冻结 release candidate 分支与环境变量集合   | HD-011, HD-017         | Platform/EM | RC 环境配置与依赖版本冻结。                                          |
| HD-019 | P0       | Hardening | 完成最终 demo rehearsal 清单                | HD-015, HD-016, HD-018 | EM/QA       | 彩排覆盖正常路径、fallback 路径、God-Mode 路径。                     |
| HD-020 | P0       | Hardening | 生成交付验收清单                            | HD-019                 | EM          | 可按清单逐项验收系统目标与 PRD 核心能力。                            |

## 5. 建议的派发策略

### 5.1 适合按 owner lane 并行

- Platform / Others：OTH-001 ~ OTH-014、SHR-001 ~ DAT-008、HD-007 ~ HD-012
- Agent：优先按 `Wave 2.1 -> 2.2 -> 2.3` 派发 `AGT-001 ~ AGT-021`。
- Backend：优先按 `Wave 3.1 -> 3.2 -> 3.3` 派发 `BE-001 ~ BE-027`（含 `BE-025A`）。
- Frontend：优先按 `Wave 4.1 -> 4.2 -> 4.3` 派发 `FE-001 ~ FE-030`。
- Vertical Slice / QA：把 `Wave 5/6/7` 的各 Part 作为单独联调包派发，避免一次接手整条大 Wave。

### 5.2 推荐的派发粒度

- 优先把每个 Part 控制在 **一个 owner 可在 2-5 天内收口** 的范围内，而不是直接领取整个 Wave。
- 每次派发尽量围绕“一个稳定依赖面 + 一个可验收结果”，例如 `Wave 5.1` 先只收晨报/视图总结，不混入 Chat。
- 垂直切片类任务（Wave 5/6）建议固定一个主 owner 收口，并在 issue 中列出协作 owner，避免联调阶段责任漂移。

### 5.3 最容易阻塞全局的任务

- `SHR-002 ~ SHR-010`：共享协议未冻结会同时阻塞 Agent / Backend / Frontend。
- `SAN-002 ~ SAN-008`：sandbox 能力未完成会阻塞规则、只读接口与图表。
- `Wave 3.2`：只读接口与 AI API 未 ready，前端无法进入真实联调。
- `Wave 4.3` 中的 `FE-025`：chart token renderer 未完成会阻塞多模态 AI 体验。
- `Wave 6.1 ~ 6.2`：God-Mode 主路径不建议拖到最后，否则演示能力会在末期集中爆雷。
- `AI-020` 与 `GM-014`：没有端到端用例，demo 风险难以控制。

## 6. 建议的里程碑完成定义

### M1 — Foundation Ready

完成 Wave 0 + Wave 1，且 shared/sandbox/data/ui/charts 已可被引用。

### M2 — Core Runtime Ready

完成 `Wave 2.1 ~ 2.3` 与 `Wave 3.1`，且 agent-core 可独立通过单测、backend 基础接口与 runtime store 可用。

### M3 — Read-only Demo Ready

完成 `Wave 3.2 ~ 3.3` 与 `Wave 4.1 ~ 4.3`，且 profile 可切、Homepage / Data Center 可渲染、图表与响应式骨架可用。

### M4 — AI Demo Ready

完成 `Wave 5.1 ~ 5.3`，且 Homepage / Data Center / Advisor 的 AI 路径可真实演示。

### M5 — God-Mode Demo Ready

完成 `Wave 6.1 ~ 6.3`，且 profile switch / inject event / override / reset / scenario / demo-script 可演示。

### M6 — Final Demo Ready

完成 `Wave 7.1 ~ 7.3`，且 fallback-only、runbook、CI、核心 E2E 与彩排全部通过。

## 7. 维护规则

- 不要在 backlog 文档中直接修改系统级架构决策；架构变更应先回到 architecture.md。
- 新增任务优先挂到既有 wave 下，避免随意创建新的执行阶段。
- 任务关闭前至少补齐：代码、测试、文档/注释、联调记录。
- 对跨模块任务，必须在 issue 中指定主 owner 与协作 owner，避免无人收口。
