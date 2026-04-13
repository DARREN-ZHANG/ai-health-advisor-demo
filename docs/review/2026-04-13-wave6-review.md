# Wave 6 完成审查 — 2026-04-13

## 1. 审查范围

- 审查提交：`c09dbdc feat(god-mode): implement end-to-end god-mode vertical slice`
- 对照文档：
  - `docs/full-project-task-backlog.md`
  - `docs/source-of-truth/PRD.md`
  - `docs/source-of-truth/ARCHITECTURE.md`
  - `docs/detailed-tech-design/frontend-detailed-implementation-plan.md`
  - `docs/detailed-tech-design/backend-detailed-implementation-plan.md`
  - `docs/detailed-tech-design/others-detailed-implementation-plan.md`
- 本次未执行额外本地测试，主要基于代码与文档契约审查。

## 2. 总体结论

当前提交把 God-Mode 面板和前端动作接上了，但 **Wave 6 还不能判定为完成**。

主要阻塞点有三条：

- `/god-mode/state` 返回的 scenario 结构与前端消费字段不一致，真实 scenario 按钮会传出 `undefined`
- 面板把所有 scenario 都走 `demo-script/run`，与文档要求的 `scenario/apply` / `demo-script/run` 双链路不一致，绝大多数预置 scenario 无法执行
- inject event 后的 Active Sensing 横幅没有按正式协议消费，GM-004 事实上没有落地

## 3. 发现的问题

### C-1: `/god-mode/state` 的 scenario 字段名消费错误，真实场景按钮会失效

**相关任务**：GM-009, GM-010

**代码位置**：

- `apps/web/src/hooks/use-god-mode-actions.ts:10-15`
- `apps/web/src/components/god-mode/GodModePanel.tsx:145-150`

**现状**：

- 前端把 `availableScenarios` 声明成 `{ id, label, icon?, type }[]`。
- 但当前后端与 `data/sandbox/scenarios/manifest.json` 使用的是 `scenarioId`，不是 `id`。
- 面板渲染时继续读取 `s.id` 作为 React key、选中态判断和点击入参。

**影响**：

- 一旦 `/god-mode/state` 成功返回真实数据，`s.id` 就是 `undefined`。
- scenario 按钮会出现重复 key，且点击后会调用 `runDemoScript(undefined)`，真实场景链路无法工作。
- 这会直接阻断 Wave 6 的 scenario / demo-script 演示路径。

### C-2: 面板把所有 scenario 都当成 demo script 触发，和文档要求的双接口模型不一致

**相关任务**：GM-009, GM-010

**代码位置**：

- `apps/web/src/components/god-mode/GodModePanel.tsx:34-40`
- `apps/web/src/components/god-mode/GodModePanel.tsx:145-150`

**现状**：

- 当前 `handleScenarioRun()` 无论场景类型为何，都直接调用 `runDemoScript(id)`。
- 但 `data/sandbox/scenarios/manifest.json` 中大多数条目是 `profile_switch` / `event_inject` / `metric_override` / `reset`，只有少数是 `demo_script`。
- 设计文档明确区分 `POST /god-mode/scenario/apply` 与 `POST /god-mode/demo-script/run` 两条正式链路。

**影响**：

- 在当前数据下，绝大多数 scenario 都会被后端按“不是 demo_script”拒绝。
- 这意味着 GM-009 的“一键恢复预设演示态”并没有真正实现，面板里的场景入口大部分都不可用。

### C-3: inject event 后没有按正式响应协议展示 Active Sensing 横幅

**相关任务**：GM-003, GM-004

**代码位置**：

- `apps/web/src/hooks/use-god-mode-actions.ts:56-63`

**现状**：

- `injectEventMutation` 只在响应里存在 `data.banner` 时才调用 `showBanner()`。
- 但当前后端 `/god-mode/inject-event` 返回的是 `{ injected: ... }`，文档里的正式协议也定义为返回 `GodModeStateResponse`（其中包含 `activeSensing`），都不是 `banner` 字段。

**影响**：

- 这段分支在当前代码库下不会命中，注入事件后顶部横幅不会出现。
- 因而 Wave 6.1 的 GM-004 “无论当前视图为何，顶部都能强制下拉横幅” 实际上没有被满足。

## 4. 建议结论

建议先修复以上 3 个阻塞项，再将 Wave 6 标记为完成；否则当前提交更接近“God-Mode 面板接线版”，还不是文档要求的可演示闭环。
