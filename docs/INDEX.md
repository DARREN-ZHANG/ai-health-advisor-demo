# 项目索引 — Agent 变更导航

> 本文档帮助 Agent 在修改需求时快速定位需要阅读和变更的文件范围。
> 按功能域（Concern）组织，每个域列出：入口文件 → 核心逻辑 → 类型定义 → 测试。

---

## 一、项目拓扑概览

```
health-advisor/
├── apps/
│   ├── agent-api/          # 后端 AI 服务 (Fastify)
│   └── web/                # 前端应用 (Next.js App Router)
├── packages/
│   ├── agent-core/         # AI Agent 运行时引擎
│   ├── charts/             # 图表组件与构建器
│   ├── config/             # 共享配置 (ESLint / TS / Prettier / Vitest)
│   ├── sandbox/            # 沙箱数据加载与模拟
│   ├── shared/             # 公共类型、Schema、工具函数
│   └── ui/                 # 通用 UI 组件库
├── data/sandbox/           # 沙箱数据文件 (profiles, prompts, fallbacks, scenarios)
└── docs/                   # 项目文档
```

---

## 二、数据流总览

```
用户操作 → Next.js 页面 → API Client (lib/api-client.ts)
                              ↓
                         agent-api 路由 (src/routes/)
                              ↓
                         业务模块 (src/modules/)
                              ↓
                      agent-core 运行时 ←→ LLM Provider
                              ↓
                     sandbox 数据 ← data/sandbox/
                              ↓
                         JSON 响应 → 前端 Store (Zustand) → UI 渲染
```

---

## 三、按功能域索引

### 1. AI 智能体系统

**何时查阅**：修改 AI 对话逻辑、prompt 模板、上下文构建、记忆管理、fallback 策略。

| 层级 | 文件 | 说明 |
|------|------|------|
| API 入口 | `apps/agent-api/src/routes/ai.ts` | AI 路由定义 (morning-brief / view-summary / chat) |
| 业务编排 | `apps/agent-api/src/modules/ai/` | AI 模块目录 |
| 编排服务 | `apps/agent-api/src/services/ai-orchestrator.ts` | AI 请求编排与超时控制 |
| 运行时入口 | `packages/agent-core/src/runtime/` | Agent 执行入口、超时控制 |
| 请求路由 | `packages/agent-core/src/routing/` | 任务路由与验证 |
| Prompt 构建 | `packages/agent-core/src/prompts/` | 系统 prompt 与任务 prompt 构建器 |
| 上下文构建 | `packages/agent-core/src/context/` | 上下文组装与窗口选择 |
| 记忆管理 | `packages/agent-core/src/memory/` | 会话记忆与分析记忆 |
| 规则引擎 | `packages/agent-core/src/rules/` | 洞察规则 (AGT-009 ~ AGT-011) |
| 响应解析 | `packages/agent-core/src/output/` | 响应解析与 token 校验 |
| Fallback | `packages/agent-core/src/fallback/` | 降级响应引擎 |
| Agent 执行 | `packages/agent-core/src/executor/` | Agent 创建与初始化 |
| Provider | `packages/agent-core/src/provider/` | LLM 提供商配置与工厂 |
| 类型定义 | `packages/agent-core/src/types/` | Agent 相关类型 |
| Eval 运行时 | `packages/agent-core/src/evals/` | Agent deterministic eval runner、scorers、report writer |
| Eval Cases | `packages/agent-core/evals/cases/` | Smoke/Core/Regression 评测样本 |
| Eval 使用手册 | `docs/ops/agent-eval-baseline-runbook.md` | Baseline 建立、对比、更新和 regression 沉淀流程 |
| Eval 硬化计划 | `docs/superpowers/plans/2026-04-26-agent-eval-quality-baseline-hardening.md` | 将 fake fixture 评测升级为真实 Agent quality baseline 的实施任务 |
| Prompt 数据 | `data/sandbox/prompts/` | 系统 prompt 与任务 prompt 模板文件 |
| Fallback 数据 | `data/sandbox/fallbacks/` | 预构建的降级响应 |
| 测试 | `packages/agent-core/src/__tests__/` | Agent 核心单元测试 |
| 测试 | `apps/agent-api/src/__tests__/` | API 层 AI 路由测试 |

---

### 2. 数据中心 & 可视化

**何时查阅**：修改数据展示页面、图表组件、数据查询逻辑、时间范围选择。

| 层级 | 文件 | 说明 |
|------|------|------|
| 页面入口 | `apps/web/src/app/data-center/page.tsx` | 数据中心页面 |
| 数据组件 | `apps/web/src/components/data-center/` | 数据中心专用组件 |
| 图表组件 | `packages/charts/src/` | 图表组件、构建器、注册表 |
| 图表类型 | `packages/charts/src/types.ts` | 图表接口定义 |
| 图表注册 | `packages/charts/src/registry/` | Token-based 图表注册表 |
| 图表构建 | `packages/charts/src/builders/` | 图表构建工具 |
| 微型图表 | `packages/charts/src/micro/` | 紧凑趋势指示器 |
| API 路由 | `apps/agent-api/src/routes/profiles.ts` | 数据查询路由 (timeline / data / chart-data) |
| 数据模块 | `apps/agent-api/src/modules/data/` | 数据服务与图表服务 |
| 沙箱加载 | `packages/sandbox/src/` | 数据加载、选择、合并 |
| 类型定义 | `packages/shared/src/types/chart-token.ts` | ChartToken 类型 |
| 常量 | `packages/shared/src/constants/` | 图表 Token、状态颜色等 |
| 测试 | `packages/charts/src/__tests__/` | 图表组件测试 |
| 测试 | `packages/sandbox/src/__tests__/` | 沙箱数据测试 |

---

### 3. 首页 & 晨报

**何时查阅**：修改首页布局、晨报摘要、健康趋势、快速入口。

| 层级 | 文件 | 说明 |
|------|------|------|
| 页面入口 | `apps/web/src/app/page.tsx` | 首页 |
| 首页组件 | `apps/web/src/components/homepage/` | 首页专用组件 |
| AI 摘要 | `apps/agent-api/src/routes/ai.ts` → `morning-brief` | 晨报 AI 端点 |
| 布局组件 | `apps/web/src/components/layout/` | 通用布局 (Header / Footer / Toast 等) |

---

### 4. AI 顾问 & 聊天

**何时查阅**：修改 AI 对话界面、聊天交互、建议提示。

| 层级 | 文件 | 说明 |
|------|------|------|
| 顾问组件 | `apps/web/src/components/advisor/` | AI 顾问 UI (聊天界面、建议卡片) |
| 对话 Store | `apps/web/src/stores/` | Zustand 状态管理 |
| Hooks | `apps/web/src/hooks/` | 自定义 React Hooks |
| API Client | `apps/web/src/lib/api-client.ts` | 前端 API 调用封装 |
| 聊天路由 | `apps/agent-api/src/routes/ai.ts` → `chat` | 聊天端点 |
| Provider | `apps/web/src/providers.tsx` | React Context Provider 集合 |

---

### 5. 用户档案 & 沙箱数据

**何时查阅**：修改用户档案结构、健康数据模型、添加新指标类型。

| 层级 | 文件 | 说明 |
|------|------|------|
| 档案路由 | `apps/agent-api/src/routes/profiles.ts` | 档案管理路由 |
| 档案模块 | `apps/agent-api/src/modules/profiles/` | 档案业务逻辑 |
| 沙箱加载 | `packages/sandbox/src/loader/` | 档案与清单加载 |
| 沙箱选择 | `packages/sandbox/src/selectors/` | 日期范围与数据选择 |
| 沙箱合并 | `packages/sandbox/src/merge/` | 覆盖与事件合并 |
| 沙箱工具 | `packages/sandbox/src/helpers/` | 缺值处理、时间线归一化 |
| 档案数据 | `data/sandbox/profiles/` | JSON 档案文件 (A/B/C 三人) |
| 类型定义 | `packages/shared/src/types/sandbox.ts` | 沙箱相关类型 |
| Schema | `packages/shared/src/schemas/` | Zod 验证 Schema |
| 测试 | `packages/sandbox/src/__tests__/` | 沙箱模块测试 |

---

### 6. God-Mode 演示控制

**何时查阅**：修改演示模式、场景系统、事件注入、指标覆盖。

| 层级 | 文件 | 说明 |
|------|------|------|
| API 路由 | `apps/agent-api/src/routes/god-mode.ts` | God-Mode 控制路由 |
| 业务模块 | `apps/agent-api/src/modules/god-mode/` | 演示控制逻辑 |
| 前端组件 | `apps/web/src/components/god-mode/` | God-Mode 面板 UI |
| 场景数据 | `data/sandbox/scenarios/` | 预定义演示场景 |
| 类型定义 | `packages/shared/src/types/god-mode.ts` | God-Mode 类型 |
| 状态管理 | `apps/web/src/stores/` → god-mode 相关 store | 前端状态 |

---

### 7. 后端基础设施

**何时查阅**：修改 API 配置、中间件、插件、错误处理、环境变量。

| 层级 | 文件 | 说明 |
|------|------|------|
| 应用入口 | `apps/agent-api/src/app.ts` | Fastify 应用初始化 |
| 配置 | `apps/agent-api/src/config/env.ts` | 环境变量与配置 |
| 插件 | `apps/agent-api/src/plugins/` | CORS / Helmet / 错误处理 / 指标 |
| 运行时注册 | `apps/agent-api/src/runtime/` | Agent 运行时注册 |
| 工具函数 | `apps/agent-api/src/utils/` | 通用工具 |
| Docker | `apps/agent-api/Dockerfile` | 后端容器构建 |
| Compose | `docker-compose.yml` | 服务编排 |
| 环境变量 | `apps/agent-api/.env.example` | 环境变量模板 (如存在) |
| 脚本 | `apps/agent-api/src/scripts/` | 运维脚本 |

---

### 8. 前端基础设施

**何时查阅**：修改主题、布局、全局样式、Provider、路由配置。

| 层级 | 文件 | 说明 |
|------|------|------|
| 根布局 | `apps/web/src/app/layout.tsx` | 根布局 (含 Provider 包裹) |
| Provider | `apps/web/src/providers.tsx` | QueryClient / Theme / Toast 等 |
| 全局样式 | `apps/web/src/app/globals.css` | Tailwind 全局样式 |
| 布局组件 | `apps/web/src/components/layout/` | Header / Footer / Toast / Banner |
| 状态管理 | `apps/web/src/stores/` | Zustand stores |
| Hooks | `apps/web/src/hooks/` | 自定义 Hooks |
| API Client | `apps/web/src/lib/api-client.ts` | 统一 API 调用层 |
| 应用配置 | `apps/web/src/config/` | 前端应用配置 |
| Next 配置 | `apps/web/next.config.ts` | Next.js 配置 |
| Tailwind | `apps/web/tailwind.config.ts` | Tailwind 配置 (如存在) |
| Docker | `apps/web/Dockerfile` | 前端容器构建 |

---

### 9. 共享类型 & 工具

**何时查阅**：添加新类型、修改公共 Schema、添加工具函数。

| 层级 | 文件 | 说明 |
|------|------|------|
| 类型目录 | `packages/shared/src/types/` | 所有共享类型定义 |
| Schema 目录 | `packages/shared/src/schemas/` | Zod 验证 Schema |
| 常量目录 | `packages/shared/src/constants/` | 状态颜色、Token、时间范围等常量 |
| 工具目录 | `packages/shared/src/utils/` | 页面上下文、时间范围等工具函数 |
| 包入口 | `packages/shared/src/index.ts` | 导出汇总 |

**核心类型文件速查**：
- `types/agent.ts` — Agent 请求/响应/上下文类型
- `types/sandbox.ts` — 档案/每日记录/睡眠/活动数据类型
- `types/chart-token.ts` — 图表 Token 定义
- `types/god-mode.ts` — God-Mode 操作类型
- `types/stress.ts` — 压力相关类型
- `types/api.ts` — API 通用类型

---

### 10. UI 组件库

**何时查阅**：修改通用 UI 组件、添加新组件、调整设计系统。

| 层级 | 文件 | 说明 |
|------|------|------|
| 组件目录 | `packages/ui/src/` | UI 组件源码 |
| 布局类 | `packages/ui/src/` → Card / Container / Grid / Section | 页面布局组件 |
| 状态类 | `packages/ui/src/` → Badge / Pill / MicroTip / InlineHint | 状态标识组件 |
| 交互类 | `packages/ui/src/` → Tabs / Drawer / Sheet | 交互组件 |
| 反馈类 | `packages/ui/src/` → Loading / Empty / ErrorDisplay | 反馈组件 |

---

### 11. 测试

**何时查阅**：编写或修改测试、调整测试配置。

| 层级 | 文件 | 说明 |
|------|------|------|
| Agent Core 测试 | `packages/agent-core/src/__tests__/` | 运行时/路由/记忆/上下文等测试 |
| API 测试 | `apps/agent-api/src/__tests__/` | 路由和模块测试 |
| Web E2E 测试 | `apps/web/tests/` | Playwright E2E 测试 |
| 沙箱测试 | `packages/sandbox/src/__tests__/` | 数据加载/选择/合并测试 |
| 图表测试 | `packages/charts/src/__tests__/` | 图表组件测试 |
| 共享配置 | `packages/config/vitest/` | Vitest 共享配置 |

---

## 四、常见变更场景速查

| 场景 | 需要阅读的文件 | 需要变更的文件 |
|------|----------------|----------------|
| **添加新的 AI 端点** | `routes/ai.ts` → `modules/ai/` → `agent-core/src/routing/` → `agent-core/src/prompts/` | 路由文件 + 模块文件 + prompt 模板 + 类型定义 |
| **修改图表样式** | `packages/charts/src/builders/` → `packages/charts/src/registry/` | 对应 builder 文件 |
| **添加新健康指标** | `packages/shared/src/types/sandbox.ts` → `data/sandbox/profiles/*.json` → `packages/sandbox/src/` | 类型 + 数据文件 + 加载逻辑 |
| **修改 AI Prompt** | `data/sandbox/prompts/` → `agent-core/src/prompts/` | prompt 模板文件 + prompt 构建器 |
| **添加新页面** | `apps/web/src/app/` → `apps/web/src/components/` → `packages/shared/src/types/api.ts` | 页面目录 + 组件 + API 类型 |
| **修改 API 响应格式** | `packages/shared/src/types/api.ts` → `packages/shared/src/schemas/` → 对应路由和模块 | 类型 + Schema + 路由 + 前端 API Client |
| **添加新 God-Mode 功能** | `routes/god-mode.ts` → `modules/god-mode/` → `shared/src/types/god-mode.ts` → 前端组件 | 路由 + 模块 + 类型 + UI |
| **修改 LLM Provider** | `agent-core/src/provider/` → `agent-core/src/config/` | provider 配置和工厂文件 |
| **修改主题/样式** | `apps/web/src/app/globals.css` → `packages/ui/` | 样式文件和 UI 组件 |
| **添加新图表类型** | `packages/charts/src/types.ts` → `packages/charts/src/registry/` → `packages/charts/src/builders/` → `packages/shared/src/types/chart-token.ts` | 类型 + 注册表 + builder + Token 定义 |

---

## 五、关键配置文件

| 文件 | 用途 |
|------|------|
| `package.json` (根) | monorepo 脚本 (dev / build / test) |
| `pnpm-workspace.yaml` | workspace 配置 |
| `turbo.json` | Turborepo 构建配置 |
| `docker-compose.yml` | 容器编排 |
| `tsconfig.json` (根) | TypeScript 基础配置 |
| `apps/agent-api/src/config/env.ts` | 后端环境变量 |
| `apps/web/next.config.ts` | Next.js 配置 |
| `packages/config/` | 共享 lint / ts / prettier / vitest 配置 |

---

## 六、依赖关系图

```
apps/web
  ├── @health-advisor/shared     (类型 + 工具)
  ├── @health-advisor/charts      (图表组件)
  ├── @health-advisor/ui          (UI 组件)
  └── @health-advisor/sandbox     (数据加载) [可选]

apps/agent-api
  ├── @health-advisor/shared      (类型 + Schema)
  ├── @health-advisor/agent-core  (AI 引擎)
  └── @health-advisor/sandbox     (数据加载)

packages/agent-core
  └── @health-advisor/shared      (类型)

packages/charts
  └── @health-advisor/shared      (类型)

packages/sandbox
  └── @health-advisor/shared      (类型 + Schema)
```

> **规则**：变更 `packages/shared` 的类型会影响所有依赖包，需全量检查。
> 变更 `packages/agent-core` 主要影响 `apps/agent-api`。
> 变更 `packages/ui` 或 `packages/charts` 主要影响 `apps/web`。

---

## 七、沙箱数据文件结构

```
data/sandbox/
├── manifest.json              # 档案清单与元数据
├── profiles/                  # 用户档案数据
│   ├── profile-a.json         # "张健康" — 32岁男性，健康基线
│   ├── profile-b.json         # "李普通" — 45岁女性，数据缺失
│   └── profile-c.json         # "王压力" — 28岁男性，高压力
├── prompts/                   # AI Prompt 模板
│   ├── system/                # 系统 prompt
│   └── tasks/                 # 任务 prompt (morning-brief / view-summary / chat)
├── fallbacks/                 # 预构建降级响应
└── scenarios/                 # 演示场景脚本
```

---

*本索引最后更新：2026-04-14。当项目结构发生重大变更时请同步更新本文件。*
