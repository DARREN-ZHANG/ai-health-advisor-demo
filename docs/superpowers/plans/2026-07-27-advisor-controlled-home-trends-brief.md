# AI Advisor 可控首页 Trends Brief 实施文档

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` when executing independent tasks in the current session, or `superpowers:executing-plans` when executing this plan task-by-task. Track progress with checkbox syntax.

**Goal:** 在首页 Timeline 与 LifeLog 之间增加固定高度的 Sleep/Activity Trends Brief 卡片，并允许 AI Advisor Chat 通过强类型指令展示 Sleep、展示 Activity 或隐藏卡片。

**Architecture:** 使用 `@health-advisor/shared` 定义封闭枚举的请求 UI 上下文和响应 UI 指令；Advisor Planner 负责语义识别，runtime 只执行经过 schema 与 verifier 校验的计划，不从自然语言回复或 `chartTokens` 推断副作用。Web 端使用按 Profile 分区、仅内存的 Zustand store 保存显示状态，Chat 在请求中上报当前状态并在成功响应后应用合法指令，首页以独立展示组件消费 typed mock 数据。

**Tech Stack:** TypeScript、Zod、Fastify、现有 Advisor Planner/runtime、Next.js 15、React 19、Zustand 5、Framer Motion、next-intl、Vitest、Testing Library、Playwright、Tailwind v4、Valo CSS tokens。

---

## Context Summary

设计来源：2026-07-27 当前 Codex 对话中的《首页 AI 可控 Trends Brief 模块》方案。

已确认产品与技术决策：

- 首页保持 `Timeline → Trends Brief → LifeLog` 的现有内容顺序，只在 Timeline 与 LifeLog 之间插入新模块。
- 初始状态为 `hidden`；状态按 Profile 分区、仅保存在当前浏览器内存，刷新页面后重置。
- 第一版只支持 `hidden`、`sleep`、`activity` 三种状态，不开放任意组件名、props 或脚本。
- Sleep 和 Activity 使用 typed mock 数据，不连接 Trends 查询 API，也不从 Trends 静态 PNG 中裁剪内容。
- 卡片外框固定为 `192px`；Sleep/Activity 切换只替换内部内容，隐藏状态不占页面布局。
- Chat 不自动关闭，不因指令导航到 Trends 页面。
- 不解析用户消息关键词，不解析 assistant `summary`，不把 `chartTokens` 当作 UI 控制信号。
- 只有 Planner 计划通过 schema/verifier 且最终响应 `finishReason === 'complete'` 时，Web 才应用 `uiDirectives`。
- fallback、timeout、clarification、网络错误和非法指令都不得改变首页状态。
- 纯 UI 控制由 Planner 确认后生成确定性双语回复，不调用健康 solver；混合健康问答继续调用 solver，并由 runtime 附加 Planner 已验证的指令。

现有代码事实：

- `apps/web/src/app/page.tsx:259-360` 先渲染 `data-valo-timeline-stack`，随后渲染 `LifeLogPanel`，是新模块的准确插入点。
- `apps/web/src/app/data-center/page.tsx` 当前使用 Sleep/Activity 静态图片；旧的 data-backed detail 组件和 query hook 仍存在但未被 Trends 页面消费。
- `apps/web/src/components/advisor/AIAdvisorDrawer.tsx:97-169` 构造 `/ai/chat` 请求并处理 `AgentResponseEnvelope`，目前只把回复加入消息 store。
- `packages/shared/src/types/agent.ts:80-98` 和 `packages/shared/src/schemas/agent.ts:102-118` 是 Chat 响应公共契约。
- `packages/agent-core/src/planner/analysis-plan.ts`、`analysis-plan-verifier.ts` 和 `data/sandbox/prompts/advisor-plan.md` 共同定义 Advisor 的语义计划协议。
- `packages/agent-core/src/runtime/agent-runtime.ts:228-292` 当前在 Planner 之前执行 low-data fallback，纯 UI 控制必须调整这一顺序。
- `apps/web/src/stores/life-log.store.ts` 已提供“按 Profile 分区、不持久化”的 Zustand 参考模式。
- 计划制定时 `@health-advisor/shared`、`@health-advisor/agent-core`、`@health-advisor/web` 的 `typecheck` 均通过。

---

## File Structure

创建：

- `apps/web/src/stores/home-trend-card.store.ts` - 按 Profile 保存 `hidden | sleep | activity`。
- `apps/web/src/stores/home-trend-card.store.test.ts` - 覆盖默认值、Profile 隔离和状态更新。
- `apps/web/src/components/homepage/home-trend-card.mock.ts` - Sleep/Activity typed mock 数据。
- `apps/web/src/components/homepage/HomeTrendCard.tsx` - 192px 固定高度展示组件和迷你趋势 SVG。
- `apps/web/src/components/homepage/HomeTrendCard.test.tsx` - 覆盖两种内容、固定高度和 Valo 合同。
- `apps/web/src/components/homepage/HomeTrendCardSlot.tsx` - 连接 Profile/store，并负责显隐和切换动画。
- `apps/web/src/components/homepage/HomeTrendCardSlot.test.tsx` - 覆盖 hidden、show、switch。
- `apps/web/src/lib/advisor-ui-directives.ts` - 校验并应用 Chat 返回的 UI 指令。
- `apps/web/src/lib/advisor-ui-directives.test.ts` - 覆盖 complete/fallback/profile mismatch/非法指令。
- `apps/web/e2e/home-trend-card.spec.ts` - Chat 到首页卡片的确定性端到端测试。
- `packages/agent-core/src/__tests__/types/agent-request.test.ts` - 覆盖 AgentRequest 的 UI context schema。

修改：

- `packages/shared/src/types/agent.ts` - 新增 UI 状态、请求上下文、响应指令类型。
- `packages/shared/src/schemas/agent.ts` - 新增对应 Zod schema 并扩展 envelope。
- `packages/shared/src/index.ts` - 导出新增类型和 schema。
- `packages/shared/src/__tests__/schemas.test.ts` - 覆盖公共协议。
- `packages/agent-core/src/types/agent-request.ts` - Chat agent request 接受 `uiContext`。
- `packages/agent-core/src/planner/analysis-plan.ts` - Planner 支持 `control_ui` 和 `clientAction`。
- `packages/agent-core/src/planner/analysis-plan-verifier.ts` - 验证纯 UI 与混合意图约束。
- `packages/agent-core/src/planner/advisor-plan-builder.ts` - 把当前 UI 状态传入 Planner prompt。
- `packages/agent-core/src/planner/__tests__/analysis-plan.test.ts` - 覆盖 UI 计划 schema。
- `packages/agent-core/src/planner/__tests__/analysis-plan-verifier.test.ts` - 覆盖 UI 计划业务约束。
- `packages/agent-core/src/planner/__tests__/advisor-plan-builder.test.ts` - 覆盖 UI context 和计划解析。
- `packages/agent-core/src/planner/__tests__/advisor-plan-prompt.test.ts` - 锁定语义边界。
- `packages/agent-core/src/runtime/agent-runtime.ts` - 调整 low-data 顺序并生成/附加 UI 指令。
- `packages/agent-core/src/runtime/__tests__/advisor-chat-runtime.test.ts` - 覆盖纯 UI、混合意图和失败边界。
- `data/sandbox/prompts/advisor-plan.md` - 描述 UI 控制计划格式和正反例。
- `apps/agent-api/src/modules/ai/routes.ts` - 接收并校验 `uiContext`。
- `apps/agent-api/src/__tests__/modules/ai/routes.test.ts` - 覆盖合法与非法 UI context。
- `apps/web/src/hooks/use-ai-query.ts` - 扩展 `ChatRequest`。
- `apps/web/src/components/advisor/AIAdvisorDrawer.tsx` - 上报当前状态并应用响应指令。
- `apps/web/src/components/advisor/AIAdvisorDrawer.test.tsx` - 覆盖请求和响应联动。
- `apps/web/src/app/page.tsx` - 插入 `HomeTrendCardSlot`。
- `apps/web/src/messages/zh.json` - 增加中文卡片文案。
- `apps/web/src/messages/en.json` - 增加英文卡片文案。

---

## 模块 1：强类型 UI 指令契约

**目标：** 建立前后端共用、可运行时校验的 UI 状态与指令协议，并把当前 UI 状态贯通到 AgentRequest。

**依赖：** 无。

**涉及文件：**

- 修改：`packages/shared/src/types/agent.ts`
- 修改：`packages/shared/src/schemas/agent.ts`
- 修改：`packages/shared/src/index.ts`
- 修改：`packages/shared/src/__tests__/schemas.test.ts`
- 修改：`packages/agent-core/src/types/agent-request.ts`
- 修改：`apps/agent-api/src/modules/ai/routes.ts`
- 修改：`apps/agent-api/src/__tests__/modules/ai/routes.test.ts`
- 修改：`apps/web/src/hooks/use-ai-query.ts`

**产出：**

- [ ] shared 暴露 `HomeTrendCardDisplay`、`ClientUiContext`、`UiDirective` 及对应 schema。
- [ ] `/ai/chat` 接受合法 `uiContext`，拒绝非法状态。
- [ ] `AgentResponseEnvelope` 向后兼容没有 `uiDirectives` 的现有响应。

### 任务 1.1：定义并验证公共 UI 协议

**所属模块：** 模块 1 - 强类型 UI 指令契约

**目标：** 在 `@health-advisor/shared` 中建立唯一合法的首页 Trends Brief 状态和响应指令类型。

**前置条件：**

- 当前分支 `@health-advisor/shared` typecheck 通过。

**涉及文件：**

- 修改：`packages/shared/src/types/agent.ts:10-22,80-98`
- 修改：`packages/shared/src/schemas/agent.ts:18-45,102-118`
- 修改：`packages/shared/src/index.ts:56-68,164-174`
- 测试：`packages/shared/src/__tests__/schemas.test.ts`

**上下文：**

公共契约必须只表达三种互斥状态，不能使用 `{ visible: boolean, tab?: string }`，因为该结构允许 `visible=true` 但没有 tab 等非法组合。响应使用数组是为了保留未来增加其他 UI 指令的扩展点，但本功能通过 `.max(1)` 限制每次最多一个指令。

新增类型签名：

```ts
export type HomeTrendCardDisplay = 'hidden' | 'sleep' | 'activity';

export interface ClientUiContext {
  homepageTrendCard: HomeTrendCardDisplay;
}

export interface HomeTrendCardSetDirective {
  type: 'homepage.trend-card.set';
  display: HomeTrendCardDisplay;
}

export type UiDirective = HomeTrendCardSetDirective;
```

在 `AgentResponseEnvelope` 中新增：

```ts
uiDirectives?: UiDirective[];
```

新增并导出的 schema 名称：

```ts
HomeTrendCardDisplaySchema
ClientUiContextSchema
HomeTrendCardSetDirectiveSchema
UiDirectiveSchema
```

`AgentResponseEnvelopeSchema` 中的字段必须是：

```ts
uiDirectives: z.array(UiDirectiveSchema).max(1).optional()
```

`ClientUiContextSchema` 和 `UiDirectiveSchema` 必须使用 strict object，拒绝协议之外的额外字段。

**实现步骤：**

- [ ] **步骤 1：先写协议失败测试**

在 `packages/shared/src/__tests__/schemas.test.ts` 增加以下用例：

- `ClientUiContextSchema` 接受 `hidden`、`sleep`、`activity`。
- `ClientUiContextSchema` 拒绝 `overview`、空字符串和缺失 `homepageTrendCard`。
- `UiDirectiveSchema` 只接受 `type: 'homepage.trend-card.set'`。
- `AgentResponseEnvelopeSchema` 接受一条合法指令。
- `AgentResponseEnvelopeSchema` 拒绝两条指令。
- 现有不含 `uiDirectives` 的 envelope 仍通过。

- [ ] **步骤 2：运行测试确认失败**

```bash
pnpm --filter @health-advisor/shared test -- src/__tests__/schemas.test.ts
```

预期结果：新增测试因 schema/type 尚未导出而失败。

- [ ] **步骤 3：实现类型、schema 和 barrel exports**

按本卡给出的签名修改 `types/agent.ts`、`schemas/agent.ts` 和 `index.ts`。不为未知指令增加 catch-all 分支，不允许字符串形式的组件 id。

- [ ] **步骤 4：运行 shared 验证**

```bash
pnpm --filter @health-advisor/shared test -- src/__tests__/schemas.test.ts
pnpm --filter @health-advisor/shared typecheck
```

预期结果：schema 测试与 typecheck 全部通过。

**验证方式：**

```bash
pnpm --filter @health-advisor/shared test -- src/__tests__/schemas.test.ts
pnpm --filter @health-advisor/shared typecheck
```

预期结果：两个命令退出码均为 0；合法 envelope 解析后保留 `uiDirectives`，无指令 envelope 不增加该字段。

**提交说明：**

```bash
git add packages/shared/src/types/agent.ts packages/shared/src/schemas/agent.ts packages/shared/src/index.ts packages/shared/src/__tests__/schemas.test.ts
git commit -m "feat(shared): add homepage trend card directives"
```

### 任务 1.2：贯通 Chat 请求 UI 上下文

**所属模块：** 模块 1 - 强类型 UI 指令契约

**目标：** 让 Web Chat 请求、Fastify route 和 AgentRequest 使用同一个 `ClientUiContext` 契约。

**前置条件：**

- 任务 1.1 已完成并导出 `ClientUiContext`、`ClientUiContextSchema`。

**涉及文件：**

- 修改：`packages/agent-core/src/types/agent-request.ts:1-28`
- 创建：`packages/agent-core/src/__tests__/types/agent-request.test.ts`
- 修改：`apps/agent-api/src/modules/ai/routes.ts:1-39,397-448`
- 测试：`apps/agent-api/src/__tests__/modules/ai/routes.test.ts`
- 修改：`apps/web/src/hooks/use-ai-query.ts:11-24`

**上下文：**

`ChatBody` 目前只包含 profile、pageContext、userMessage、smartPromptId 和 visibleChartIds。Fastify 的 TypeScript interface 不提供运行时安全，最终必须由 `AgentRequestSchema` 使用 `ClientUiContextSchema.optional()` 校验。字段保持 optional，以兼容旧 Web 客户端。

目标请求片段：

```ts
interface ChatBody {
  profileId: string;
  pageContext: PageContext;
  userMessage: string;
  smartPromptId?: string;
  visibleChartIds?: string[];
  uiContext?: ClientUiContext;
}
```

`ChatRequest` 和 `AgentRequestSchema` 使用相同 optional 字段。Route 从 body 解构 `uiContext`，存在时原样放入 `agentRequest`，禁止 route 自行修正非法值。

**实现步骤：**

- [ ] **步骤 1：增加 route 与 AgentRequest 失败测试**

覆盖：

- `AgentRequestSchema` 接受 `uiContext.homepageTrendCard='sleep'`。
- `/ai/chat` 将合法 `uiContext` 原样传给 `orchestrator.execute`。
- `/ai/chat` 收到 `homepageTrendCard='overview'` 时返回 400 `VALIDATION_ERROR`。
- 请求不带 `uiContext` 时沿用现有成功路径。

- [ ] **步骤 2：运行测试确认失败**

```bash
pnpm --filter @health-advisor/agent-core test -- src/__tests__/types/agent-request.test.ts
pnpm --filter @health-advisor/agent-api test -- src/__tests__/modules/ai/routes.test.ts
```

预期结果：新增 UI context 断言失败。

- [ ] **步骤 3：实现三层请求类型贯通**

修改 `AgentRequestSchema`、Fastify `ChatBody`/route 和 Web `ChatRequest`。本任务只贯通类型与 payload，不在 `AIAdvisorDrawer` 中读取 store；该调用行为由任务 4.1 完成。

- [ ] **步骤 4：运行类型与 route 验证**

```bash
pnpm --filter @health-advisor/agent-core typecheck
pnpm --filter @health-advisor/agent-api test -- src/__tests__/modules/ai/routes.test.ts
pnpm --filter @health-advisor/agent-api typecheck
pnpm --filter @health-advisor/web typecheck
```

预期结果：所有命令通过；非法 UI 状态不会进入 orchestrator。

**验证方式：**

```bash
pnpm --filter @health-advisor/agent-api test -- src/__tests__/modules/ai/routes.test.ts
pnpm --filter @health-advisor/agent-core typecheck
pnpm --filter @health-advisor/agent-api typecheck
pnpm --filter @health-advisor/web typecheck
```

预期结果：命令退出码均为 0。

**提交说明：**

```bash
git add packages/agent-core/src/types/agent-request.ts packages/agent-core/src/__tests__/types/agent-request.test.ts apps/agent-api/src/modules/ai/routes.ts apps/agent-api/src/__tests__/modules/ai/routes.test.ts apps/web/src/hooks/use-ai-query.ts
git commit -m "feat(ai): thread advisor ui context through chat"
```

---

## 模块 2：Advisor 意图规划与执行

**目标：** 让 Planner 可靠区分界面控制与健康问答，并由 runtime 生成或附加经过验证的 UI 指令。

**依赖：** 模块 1。

**涉及文件：**

- 修改：`packages/agent-core/src/planner/analysis-plan.ts`
- 修改：`packages/agent-core/src/planner/analysis-plan-verifier.ts`
- 修改：`packages/agent-core/src/planner/advisor-plan-builder.ts`
- 修改：`data/sandbox/prompts/advisor-plan.md`
- 修改：Planner 和 runtime 测试
- 修改：`packages/agent-core/src/runtime/agent-runtime.ts`

**产出：**

- [ ] Planner 能表达纯 UI 控制和“健康问答 + UI 控制”混合意图。
- [ ] 普通 Sleep/Activity 健康问题不产生 UI 指令。
- [ ] low-data 不阻断纯 UI 指令；失败响应不携带可执行指令。

### 任务 2.1：扩展 Planner UI 意图协议和 verifier

**所属模块：** 模块 2 - Advisor 意图规划与执行

**目标：** 让 AnalysisPlan 以结构化字段表达 UI 控制，并用确定性 verifier 拒绝冲突计划。

**前置条件：**

- 任务 1.1 已完成。

**涉及文件：**

- 修改：`packages/agent-core/src/planner/analysis-plan.ts:13-78`
- 修改：`packages/agent-core/src/planner/analysis-plan-verifier.ts:16-97`
- 修改：`packages/agent-core/src/planner/advisor-plan-builder.ts:15-30,120-161`
- 修改：`data/sandbox/prompts/advisor-plan.md`
- 测试：`packages/agent-core/src/planner/__tests__/analysis-plan.test.ts`
- 测试：`packages/agent-core/src/planner/__tests__/analysis-plan-verifier.test.ts`
- 测试：`packages/agent-core/src/planner/__tests__/advisor-plan-builder.test.ts`
- 测试：`packages/agent-core/src/planner/__tests__/advisor-plan-prompt.test.ts`

**上下文：**

在 `ActionIntent` 中加入 `'control_ui'`，并在 `AnalysisPlanSchema` 顶层加入：

```ts
clientAction: UiDirectiveSchema.nullable().optional()
```

`clientAction` 与 `userIntent.action` 的规则：

- 纯 UI 请求：`action='control_ui'`、`clientAction` 必填、`riskLevel='general'`、`evidenceNeeds=[]`、`webSearchNeeds` 为空或缺失。
- 混合请求：保留实际健康 action，并允许同时输出一个 `clientAction`；健康证据规则照常执行。
- 需要澄清时：`needsClarification=true` 且 `clientAction` 必须为空，避免在澄清前产生副作用。
- 普通“分析我的睡眠”“今天活动怎么样”是健康问答，`clientAction` 必须为空。
- “在首页展示睡眠卡片”“切换成 Activity”“隐藏首页趋势卡片”是 UI 控制。
- “显示趋势”且上下文无法确定 Sleep/Activity 时，Planner 必须请求澄清，不得自行选择。

`PlanBuilderInput` 新增 optional `uiContext?: ClientUiContext`，`buildPlannerUserPrompt()` 以独立区块传入：

```text
## 当前客户端 UI 状态
homepageTrendCard: hidden
```

Planner prompt 必须说明这是语义分类，不允许基于 `sleep` 或 `activity` 单个词直接触发。

**实现步骤：**

- [ ] **步骤 1：写 schema 与 verifier 失败测试**

至少覆盖：

- 合法纯 UI sleep/activity/hidden 计划。
- 合法混合计划。
- `control_ui` 缺少 `clientAction` 被拒绝。
- `control_ui` 携带 evidence 或 webSearch 被拒绝。
- clarification 同时携带 `clientAction` 被拒绝。
- 非 `control_ui` 的健康计划保持兼容。

- [ ] **步骤 2：写 Planner prompt/builder 失败测试**

断言：

- builder user prompt 包含当前 `homepageTrendCard` 状态。
- system prompt 同时包含 UI 正例和“分析睡眠不控制 UI”的反例。
- fake planner 返回 `clientAction` 时，builder 能解析并通过 verifier。

- [ ] **步骤 3：运行 Planner 测试确认失败**

```bash
pnpm --filter @health-advisor/agent-core test -- src/planner/__tests__/analysis-plan.test.ts src/planner/__tests__/analysis-plan-verifier.test.ts src/planner/__tests__/advisor-plan-builder.test.ts src/planner/__tests__/advisor-plan-prompt.test.ts
```

预期结果：新增用例因 `control_ui`、`clientAction` 和 UI context 尚不存在而失败。

- [ ] **步骤 4：实现 schema、verifier、builder 和 prompt**

严格实现本卡列出的约束。Verifier violation 使用稳定 rule：

- `ui_action_required`
- `ui_control_has_evidence`
- `ui_control_risk_mismatch`
- `ui_action_during_clarification`

- [ ] **步骤 5：运行 Planner 验证**

```bash
pnpm --filter @health-advisor/agent-core test -- src/planner/__tests__/analysis-plan.test.ts src/planner/__tests__/analysis-plan-verifier.test.ts src/planner/__tests__/advisor-plan-builder.test.ts src/planner/__tests__/advisor-plan-prompt.test.ts
pnpm --filter @health-advisor/agent-core typecheck
```

预期结果：所有新增和既有 Planner 测试通过。

**验证方式：**

```bash
pnpm --filter @health-advisor/agent-core test -- src/planner/__tests__/analysis-plan.test.ts src/planner/__tests__/analysis-plan-verifier.test.ts src/planner/__tests__/advisor-plan-builder.test.ts src/planner/__tests__/advisor-plan-prompt.test.ts
pnpm --filter @health-advisor/agent-core typecheck
```

预期结果：命令退出码均为 0。

**提交说明：**

```bash
git add packages/agent-core/src/planner/analysis-plan.ts packages/agent-core/src/planner/analysis-plan-verifier.ts packages/agent-core/src/planner/advisor-plan-builder.ts packages/agent-core/src/planner/__tests__/analysis-plan.test.ts packages/agent-core/src/planner/__tests__/analysis-plan-verifier.test.ts packages/agent-core/src/planner/__tests__/advisor-plan-builder.test.ts packages/agent-core/src/planner/__tests__/advisor-plan-prompt.test.ts data/sandbox/prompts/advisor-plan.md
git commit -m "feat(agent-core): plan homepage trend card controls"
```

### 任务 2.2：在 runtime 执行已验证的 UI 计划

**所属模块：** 模块 2 - Advisor 意图规划与执行

**目标：** 纯 UI 请求使用确定性回复快速完成，混合请求仅在正常完成时附加 Planner 已验证的指令。

**前置条件：**

- 任务 1.2 已完成，`AgentRequest.uiContext` 可用。
- 任务 2.1 已完成，`AnalysisPlan.clientAction` 和 `control_ui` 可用。

**涉及文件：**

- 修改：`packages/agent-core/src/runtime/agent-runtime.ts:224-292,530-590,680-720,976-996`
- 测试：`packages/agent-core/src/runtime/__tests__/advisor-chat-runtime.test.ts`

**上下文：**

当前 low-data fallback 在 Planner 之前。目标控制流：

1. 非 `ADVISOR_CHAT` 继续保持现有 low-data 快速 fallback。
2. `ADVISOR_CHAT` 即使 low-data 也先执行规则、packet 和 Planner。
3. Planner 失败或需要澄清时返回现有安全响应，不包含 `uiDirectives`。
4. `action='control_ui'` 且 `clientAction` 合法时，不调用 solver，直接返回确定性 envelope。
5. 不是纯 UI 且 low-data 时返回现有 low-data fallback，不执行混合指令。
6. 正常健康 solver 成功时，由 runtime 从 `analysisPlan.clientAction` 附加指令；忽略模型原始 JSON 中自行生成的任何 UI 字段。

纯 UI 确定性回复：

| display | zh summary | en summary |
|---|---|---|
| `sleep` | 已在首页展示睡眠趋势简报。 | The Sleep trends brief is now shown on Home. |
| `activity` | 已在首页展示活动趋势简报。 | The Activity trends brief is now shown on Home. |
| `hidden` | 已隐藏首页趋势简报。 | The Home trends brief is now hidden. |

纯 UI envelope 固定：

```ts
{
  source: 'planner',
  statusColor: 'good',
  chartTokens: [],
  uiDirectives: [analysisPlan.clientAction],
  meta: {
    taskType: AgentTaskType.ADVISOR_CHAT,
    pageContext: request.pageContext,
    finishReason: 'complete',
  },
}
```

纯 UI 分支必须调用现有 `writeSessionMemory()`，保证后续“隐藏它”能读取本轮会话。正常 solver 主路径和 sync-regeneration 成功路径都必须使用同一个 `attachVerifiedUiDirective()` helper；fallback、timeout、clarification、安全边界和 customer-policy 返回不调用该 helper。

**实现步骤：**

- [ ] **步骤 1：写 runtime 失败测试**

覆盖：

- pure sleep/activity/hidden：solver 未调用、summary 固定、指令存在。
- pure UI 在 low-data profile 下仍成功。
- pure UI 写入一条 user 和一条 assistant session message。
- mixed 健康计划正常调用 solver，并附加 Planner 指令。
- 模型自行输出 UI 字段、Planner 无 `clientAction` 时，结果不含指令。
- Planner clarification、planner failure、low-data 健康请求、solver fallback 不含指令。
- sync-regeneration 成功结果附加 Planner 指令。
- homepage/view-summary low-data 行为不变。

- [ ] **步骤 2：运行 runtime 测试确认失败**

```bash
pnpm --filter @health-advisor/agent-core test -- src/runtime/__tests__/advisor-chat-runtime.test.ts
```

预期结果：纯 UI 和 mixed UI 新用例失败。

- [ ] **步骤 3：调整 low-data 与 Planner 顺序**

只对 `ADVISOR_CHAT` 延后 low-data 判断。把 `request.uiContext` 传给 `buildAnalysisPlanWithRetry()`；无 `planBuilder` 的 low-data Advisor 仍返回原有 fallback。

- [ ] **步骤 4：实现确定性回复和成功结果附加 helper**

新增局部 helper：

```ts
function attachVerifiedUiDirective(
  envelope: AgentResponseEnvelope,
  plan: AnalysisPlan | undefined,
): AgentResponseEnvelope
```

仅当 `envelope.meta.finishReason === 'complete'` 且 `plan?.clientAction` 存在时返回带一条指令的新对象。不得从 raw solver output 读取 UI 指令。

- [ ] **步骤 5：运行 runtime 全量相关验证**

```bash
pnpm --filter @health-advisor/agent-core test -- src/runtime/__tests__/advisor-chat-runtime.test.ts src/__tests__/runtime/agent-runtime.test.ts src/runtime/__tests__/sync-gate-integration.test.ts
pnpm --filter @health-advisor/agent-core typecheck
```

预期结果：Planner、normal solver、sync gate 和 low-data 回归全部通过。

**验证方式：**

```bash
pnpm --filter @health-advisor/agent-core test -- src/runtime/__tests__/advisor-chat-runtime.test.ts src/__tests__/runtime/agent-runtime.test.ts src/runtime/__tests__/sync-gate-integration.test.ts
pnpm --filter @health-advisor/agent-core typecheck
```

预期结果：命令退出码均为 0；测试明确证明 fallback 不携带指令。

**提交说明：**

```bash
git add packages/agent-core/src/runtime/agent-runtime.ts packages/agent-core/src/runtime/__tests__/advisor-chat-runtime.test.ts
git commit -m "feat(agent-core): execute verified ui control plans"
```

---

## 模块 3：首页 Trends Brief 展示能力

**目标：** 交付独立可测的 Profile 状态、mock 数据和固定高度 Sleep/Activity 卡片。

**依赖：** 模块 1 的公共 display 类型。

**涉及文件：**

- 创建：`apps/web/src/stores/home-trend-card.store.ts`
- 创建：`apps/web/src/stores/home-trend-card.store.test.ts`
- 创建：`apps/web/src/components/homepage/home-trend-card.mock.ts`
- 创建：`apps/web/src/components/homepage/HomeTrendCard.tsx`
- 创建：`apps/web/src/components/homepage/HomeTrendCard.test.tsx`
- 创建：`apps/web/src/components/homepage/HomeTrendCardSlot.tsx`
- 创建：`apps/web/src/components/homepage/HomeTrendCardSlot.test.tsx`
- 修改：首页与双语 messages

**产出：**

- [ ] 每个 Profile 有独立、默认 hidden、刷新即重置的显示状态。
- [ ] Sleep/Activity 在相同 192px 外框中展示 brief 数据。
- [ ] 首页 DOM 顺序为 Timeline → Trends Brief → LifeLog。

### 任务 3.1：实现 Profile 状态和 typed mock

**所属模块：** 模块 3 - 首页 Trends Brief 展示能力

**目标：** 提供不持久化的 Zustand 状态和具备判别联合类型的 mock 数据。

**前置条件：**

- 任务 1.1 已完成，`HomeTrendCardDisplay` 可从 shared 导入。

**涉及文件：**

- 创建：`apps/web/src/stores/home-trend-card.store.ts`
- 测试：`apps/web/src/stores/home-trend-card.store.test.ts`
- 创建：`apps/web/src/components/homepage/home-trend-card.mock.ts`

**上下文：**

Store 参照 `life-log.store.ts` 的 Profile 分区与非持久化模式，不使用 `persist` middleware，不写 localStorage。接口固定为：

```ts
export interface HomeTrendCardState {
  displayByProfile: Readonly<Record<string, HomeTrendCardDisplay>>;
  setDisplay: (profileId: string, display: HomeTrendCardDisplay) => void;
  clearForProfile: (profileId: string) => void;
  reset: () => void;
}

export function selectHomeTrendCardDisplay(
  state: HomeTrendCardState,
  profileId: string,
): HomeTrendCardDisplay;
```

Selector 对未知 Profile 返回 `hidden`。`clearForProfile` 删除或重置指定 Profile，不影响其他 Profile；`reset` 只用于测试和显式会话重置。

Mock 数据使用判别联合：

```ts
export type HomeTrendCardMock =
  | {
      display: 'sleep';
      primaryValue: '7h 42m';
      score: 82;
      deepSleep: '1h 35m';
      efficiency: '92%';
      trend: readonly [7.1, 7.4, 6.9, 7.6, 7.8, 7.3, 7.7];
    }
  | {
      display: 'activity';
      primaryValue: '8,426';
      distance: '5.8 km';
      calories: '420 kcal';
      activeMinutes: '52 min';
      trend: readonly [6200, 7800, 5100, 9300, 8600, 7400, 8426];
    };
```

**实现步骤：**

- [ ] **步骤 1：写 store 失败测试**

覆盖默认 hidden、同 Profile 更新、两个 Profile 隔离、clearForProfile、reset。测试直接使用 `useHomeTrendCardStore.setState()` 清理，不能依赖测试执行顺序。

- [ ] **步骤 2：运行测试确认失败**

```bash
pnpm --filter @health-advisor/web test -- home-trend-card.store
```

预期结果：测试因 store 文件尚不存在而失败。

- [ ] **步骤 3：实现 store 和 mock**

Store 的每次更新创建新的 `displayByProfile` 对象，保证 Zustand selector 能观察变化。Mock 使用 `as const satisfies` 校验，不包含动态日期和随机数。

- [ ] **步骤 4：运行 Web 验证**

```bash
pnpm --filter @health-advisor/web test -- home-trend-card.store
pnpm --filter @health-advisor/web typecheck
```

预期结果：store 测试和 Web typecheck 通过。

**验证方式：**

```bash
pnpm --filter @health-advisor/web test -- home-trend-card.store
pnpm --filter @health-advisor/web typecheck
```

预期结果：命令退出码均为 0。

**提交说明：**

```bash
git add apps/web/src/stores/home-trend-card.store.ts apps/web/src/stores/home-trend-card.store.test.ts apps/web/src/components/homepage/home-trend-card.mock.ts
git commit -m "feat(web): add profile scoped trend card state"
```

### 任务 3.2：实现固定高度卡片并插入首页

**所属模块：** 模块 3 - 首页 Trends Brief 展示能力

**目标：** 渲染 Sleep/Activity brief，提供显隐动画，并保持首页准确顺序。

**前置条件：**

- 任务 3.1 已完成。

**涉及文件：**

- 创建：`apps/web/src/components/homepage/HomeTrendCard.tsx`
- 测试：`apps/web/src/components/homepage/HomeTrendCard.test.tsx`
- 创建：`apps/web/src/components/homepage/HomeTrendCardSlot.tsx`
- 测试：`apps/web/src/components/homepage/HomeTrendCardSlot.test.tsx`
- 修改：`apps/web/src/app/page.tsx:352-360`
- 修改：`apps/web/src/messages/zh.json:50-101`
- 修改：`apps/web/src/messages/en.json:50-101`

**上下文：**

`HomeTrendCard` 是纯展示组件：

```ts
export interface HomeTrendCardProps {
  display: Exclude<HomeTrendCardDisplay, 'hidden'>;
}
```

视觉合同：

- 根节点使用 `ValoCard as="section"`、`h-48`、`overflow-hidden`。
- 根节点设置 `data-valo-home-trend-card={display}`。
- 颜色只使用 `var(--valo-*)`，不写 slate/blue/hex 颜色。
- 标题是 Sleep 或 Activity，副标为本地化的“7 日简报”。
- Sleep 主数值 `7h 42m`，显示 Score、Deep Sleep、Efficiency。
- Activity 主数值 `8,426`，显示 Distance、Calories、Active Minutes。
- 迷你趋势使用内联语义无关 SVG，`aria-hidden="true"`；通用归一化函数把 7 个值映射到固定 viewBox，最大值等于最小值时映射到垂直中线。
- 不添加点击、导航或手势交互。

`HomeTrendCardSlot` 读取当前 Profile 和 store，使用 `AnimatePresence initial={false}`：

- `hidden` 返回无卡片 DOM。
- `sleep/activity` 用 display 作为 motion key。
- show/hide 使用 opacity + y；Sleep/Activity 切换不动画外框高度。

`page.tsx` 把 `<HomeTrendCardSlot />` 放在 timeline stack 的闭合 `</div>` 后、LifeLog 注释前。

双语 key 位于 `homepage.trendBrief`，包含：

- `sleepTitle`、`activityTitle`、`period`
- `sleepDuration`、`score`、`deepSleep`、`efficiency`
- `steps`、`distance`、`calories`、`activeMinutes`

**实现步骤：**

- [ ] **步骤 1：写纯组件失败测试**

覆盖 Sleep/Activity 文案与指标、`h-48`、data anchor、SVG `aria-hidden`、根 section label 和无按钮/链接。

- [ ] **步骤 2：写 Slot 失败测试**

覆盖未知 Profile hidden、store 切到 sleep 后显示、切到 activity 后内容替换、切回 hidden 后 DOM 移除。

- [ ] **步骤 3：运行组件测试确认失败**

```bash
pnpm --filter @health-advisor/web test -- HomeTrendCard
```

预期结果：测试因组件尚不存在而失败。

- [ ] **步骤 4：实现组件、Slot、i18n 和首页插入**

沿用 `homepage/intl-test-helper.tsx` 的 next-intl 测试模式。不要引入 ECharts 或真实数据 query。

- [ ] **步骤 5：运行组件与消息验证**

```bash
pnpm --filter @health-advisor/web test -- HomeTrendCard messages
pnpm --filter @health-advisor/web typecheck
```

预期结果：组件、i18n 消息一致性和 typecheck 通过。

**验证方式：**

```bash
pnpm --filter @health-advisor/web test -- HomeTrendCard messages
pnpm --filter @health-advisor/web typecheck
```

预期结果：命令退出码均为 0；hidden 时不存在 `[data-valo-home-trend-card]`。

**提交说明：**

```bash
git add apps/web/src/components/homepage/HomeTrendCard.tsx apps/web/src/components/homepage/HomeTrendCard.test.tsx apps/web/src/components/homepage/HomeTrendCardSlot.tsx apps/web/src/components/homepage/HomeTrendCardSlot.test.tsx apps/web/src/app/page.tsx apps/web/src/messages/zh.json apps/web/src/messages/en.json
git commit -m "feat(web): add homepage trends brief card"
```

---

## 模块 4：Chat 联动与验收

**目标：** 在 Web 网络边界安全应用 UI 指令，并用端到端测试证明完整行为与视觉合同。

**依赖：** 模块 1、模块 2、模块 3。

**涉及文件：**

- 创建：`apps/web/src/lib/advisor-ui-directives.ts`
- 创建：`apps/web/src/lib/advisor-ui-directives.test.ts`
- 修改：`apps/web/src/components/advisor/AIAdvisorDrawer.tsx`
- 修改：`apps/web/src/components/advisor/AIAdvisorDrawer.test.tsx`
- 创建：`apps/web/e2e/home-trend-card.spec.ts`
- 修改：`apps/web/e2e/advisor.spec.ts`

**产出：**

- [ ] Chat 请求携带发送时的 UI 状态。
- [ ] 合法 complete 指令按响应 Profile 更新 store，迟到响应不污染当前 Profile。
- [ ] E2E 覆盖 Sleep → Activity → hidden、普通问答不误触发和布局顺序。

### 任务 4.1：在 Chat 客户端校验并应用指令

**所属模块：** 模块 4 - Chat 联动与验收

**目标：** 把 Chat request/response 与首页 store 连接，并在客户端网络边界再次执行运行时校验。

**前置条件：**

- 任务 1.2 已完成，`ChatRequest.uiContext` 可用。
- 任务 3.1 已完成，首页卡片 store 可用。

**涉及文件：**

- 创建：`apps/web/src/lib/advisor-ui-directives.ts`
- 测试：`apps/web/src/lib/advisor-ui-directives.test.ts`
- 修改：`apps/web/src/components/advisor/AIAdvisorDrawer.tsx:97-169`
- 测试：`apps/web/src/components/advisor/AIAdvisorDrawer.test.tsx`

**上下文：**

新增函数：

```ts
export function applyAdvisorUiDirectives(
  response: AgentResponseEnvelope,
  requestProfileId: string,
): void;
```

执行前必须同时满足：

- `response.meta.taskType === AgentTaskType.ADVISOR_CHAT`
- `response.meta.finishReason === 'complete'`
- `response.meta.pageContext.profileId === requestProfileId`
- `response.uiDirectives` 长度为 1
- 指令再次通过 `UiDirectiveSchema.safeParse`

满足后调用：

```ts
useHomeTrendCardStore
  .getState()
  .setDisplay(requestProfileId, directive.display);
```

不满足时函数保持 store 不变，不抛异常，不显示成功 toast。该“忽略非法网络数据”是协议校验，不是自然语言降级或启发式。

`handleSendMessage()` 在 await 前捕获：

```ts
const requestProfileId = currentProfileId;
const homepageTrendCard = selectHomeTrendCardDisplay(
  useHomeTrendCardStore.getState(),
  requestProfileId,
);
```

请求增加：

```ts
uiContext: { homepageTrendCard }
```

响应到达后先加入 assistant message，再调用 `applyAdvisorUiDirectives(response, requestProfileId)`。即使等待期间用户切换到另一个 Profile，也只更新原请求 Profile 的分区。

**实现步骤：**

- [ ] **步骤 1：写 helper 失败测试**

覆盖合法 sleep/activity/hidden、fallback、timeout、非 Advisor task、profile mismatch、未知 directive type 和非法 display。

- [ ] **步骤 2：写 Drawer 失败测试**

覆盖：

- 请求 payload 携带发送时的 `uiContext`。
- complete sleep 响应更新对应 Profile。
- fallback 响应不更新。
- 请求期间 Profile 从 A 切到 B，A 的迟到响应只更新 A。
- 清空聊天不清空 Trends Brief 状态。

- [ ] **步骤 3：运行测试确认失败**

```bash
pnpm --filter @health-advisor/web test -- advisor-ui-directives AIAdvisorDrawer
```

预期结果：新增 helper 和 payload 断言失败。

- [ ] **步骤 4：实现 helper 和 Drawer 集成**

不要把 `uiDirectives` 写入 `Message`，因为它是一次性副作用，不是消息渲染数据。不要在组件 render 阶段执行 store mutation。

- [ ] **步骤 5：运行 Web 单测与类型检查**

```bash
pnpm --filter @health-advisor/web test -- advisor-ui-directives AIAdvisorDrawer
pnpm --filter @health-advisor/web typecheck
```

预期结果：所有命令通过，迟到响应测试证明 Profile 隔离。

**验证方式：**

```bash
pnpm --filter @health-advisor/web test -- advisor-ui-directives AIAdvisorDrawer
pnpm --filter @health-advisor/web typecheck
```

预期结果：命令退出码均为 0。

**提交说明：**

```bash
git add apps/web/src/lib/advisor-ui-directives.ts apps/web/src/lib/advisor-ui-directives.test.ts apps/web/src/components/advisor/AIAdvisorDrawer.tsx apps/web/src/components/advisor/AIAdvisorDrawer.test.tsx
git commit -m "feat(web): apply advisor homepage ui directives"
```

### 任务 4.2：补齐端到端、视觉和全量回归

**所属模块：** 模块 4 - Chat 联动与验收

**目标：** 用确定性 mock API 验证完整交互，并完成跨 package 回归。

**前置条件：**

- 任务 2.2 已完成。
- 任务 3.2 已完成。
- 任务 4.1 已完成。

**涉及文件：**

- 创建：`apps/web/e2e/home-trend-card.spec.ts`
- 修改：`apps/web/e2e/advisor.spec.ts:15-27`

**上下文：**

现有 `advisor.spec.ts` 的 mock meta 使用非正式值 `taskType: 'chat'`、`finishReason: 'stop'`。本任务统一改为：

```ts
meta: {
  taskType: 'advisor_chat',
  pageContext: {
    profileId: 'profile-a',
    page: 'homepage',
    timeframe: 'week',
  },
  finishReason: 'complete',
}
```

新 E2E 使用 `page.route('**/ai/chat**')` 读取请求 body，并按 userMessage 返回确定性指令。测试不调用真实 LLM。

端到端场景：

1. 首次首页没有 `[data-valo-home-trend-card]`。
2. Chat 发送“在首页展示睡眠趋势简报”，响应 sleep 指令；关闭 Chat 后出现 sleep 卡片。
3. 再次打开 Chat 发送“切换成活动趋势简报”，请求 body 的 `uiContext.homepageTrendCard` 必须是 `sleep`；响应后同一固定高度位置显示 activity。
4. 发送“隐藏首页趋势简报”，请求 context 为 `activity`；响应后卡片 DOM 消失。
5. 普通“分析我昨晚的睡眠”响应没有指令，状态保持不变。
6. fallback 响应即使 mock body 含指令，状态保持不变。
7. 显示卡片时 DOM 顺序满足 timeline stack 在前、trend card 居中、life-log panel 在后。
8. 402×874 和 1440×1000 两个视口均满足 `document.documentElement.scrollWidth === window.innerWidth`，卡片计算高度为 `192px`。

**实现步骤：**

- [ ] **步骤 1：修正既有 Advisor mock envelope**

把 `advisor.spec.ts` 默认 meta 改成合法公共契约，保证已有用例继续通过。

- [ ] **步骤 2：创建完整 E2E**

复用 `gotoAndWait()`，mock `/ai/morning-brief**` 和 `/ai/chat**`。使用现有稳定 data anchors，不依赖中文按钮以外的非稳定 DOM 层级。

- [ ] **步骤 3：运行定向 E2E**

```bash
pnpm --filter @health-advisor/web exec playwright test e2e/advisor.spec.ts e2e/home-trend-card.spec.ts --workers=1
```

预期结果：Advisor 既有用例和新 Trends Brief 用例全部通过。

- [ ] **步骤 4：运行全量静态与单元回归**

```bash
pnpm typecheck
pnpm test
pnpm --filter @health-advisor/web build
```

预期结果：所有 workspace typecheck、unit/integration tests 和 Next.js production build 通过。

- [ ] **步骤 5：运行 Valo 关键交互回归**

```bash
pnpm --filter @health-advisor/web exec playwright test e2e/valo-ui.spec.ts e2e/smoke.spec.ts e2e/home-trend-card.spec.ts --workers=1
```

预期结果：无横向溢出、底部导航冲突、Chat 回归或首页关键控件失败。

**验证方式：**

```bash
pnpm typecheck
pnpm test
pnpm --filter @health-advisor/web build
pnpm --filter @health-advisor/web exec playwright test e2e/advisor.spec.ts e2e/valo-ui.spec.ts e2e/smoke.spec.ts e2e/home-trend-card.spec.ts --workers=1
```

预期结果：四条命令全部退出码为 0。

**提交说明：**

```bash
git add apps/web/e2e/advisor.spec.ts apps/web/e2e/home-trend-card.spec.ts
git commit -m "test(web): cover advisor controlled trend card"
```

---

## 执行顺序

### 依赖关系

| 任务 | blockedBy | 说明 |
|---|---|---|
| 1.1 定义并验证公共 UI 协议 | - | 所有模块共用的类型与 schema 根节点 |
| 1.2 贯通 Chat 请求 UI 上下文 | 1.1 | AgentRequest、route 和 Web request 使用 shared schema |
| 2.1 扩展 Planner UI 意图协议和 verifier | 1.1 | AnalysisPlan 的 `clientAction` 使用 shared directive |
| 2.2 在 runtime 执行已验证的 UI 计划 | 1.2, 2.1 | 同时依赖请求 UI context 和 Planner 计划 |
| 3.1 实现 Profile 状态和 typed mock | 1.1 | Store 使用 shared display 类型 |
| 3.2 实现固定高度卡片并插入首页 | 3.1 | Slot 和组件依赖 store 与 mock |
| 4.1 在 Chat 客户端校验并应用指令 | 1.2, 3.1 | 依赖请求字段和 Web store；可用 mock response 独立开发 |
| 4.2 补齐端到端、视觉和全量回归 | 2.2, 3.2, 4.1 | 需要 Agent 行为、首页 UI 和 Chat 集成都完成 |

### 执行阶段

**Phase 1：**

- 任务 1.1：定义并验证公共 UI 协议

**Phase 2（可并行）：**

- 任务 1.2：贯通 Chat 请求 UI 上下文
- 任务 2.1：扩展 Planner UI 意图协议和 verifier
- 任务 3.1：实现 Profile 状态和 typed mock

**Phase 3（可并行）：**

- 任务 2.2：在 runtime 执行已验证的 UI 计划
- 任务 3.2：实现固定高度卡片并插入首页
- 任务 4.1：在 Chat 客户端校验并应用指令

**Phase 4：**

- 任务 4.2：补齐端到端、视觉和全量回归

### 关键路径

存在五条等长关键路径：

```text
1.1 → 1.2 → 2.2 → 4.2
1.1 → 2.1 → 2.2 → 4.2
1.1 → 3.1 → 3.2 → 4.2
1.1 → 1.2 → 4.1 → 4.2
1.1 → 3.1 → 4.1 → 4.2
```

任务 4.1 虽不阻塞任务 2.2/3.2 的开发，但与它们共同阻塞最终 E2E。

---

## Acceptance Criteria

- [ ] 初次访问或刷新首页时 Trends Brief 不存在且不占布局。
- [ ] 合法 Chat 指令能依次展示 Sleep、切换 Activity、隐藏卡片。
- [ ] 卡片高度在 Sleep 和 Activity 下均为 192px。
- [ ] 首页 DOM 顺序为 Timeline → Trends Brief → LifeLog。
- [ ] Sleep 与 Activity mock 指标和 7 日趋势均按本计划固定值展示。
- [ ] 状态按 Profile 隔离；A 的迟到响应不改变 B 当前看到的卡片。
- [ ] 刷新页面后所有 Profile 的卡片状态回到 hidden。
- [ ] 普通睡眠/活动健康问答不改变卡片。
- [ ] fallback、timeout、clarification、网络错误、非法指令不改变卡片。
- [ ] 纯 UI 控制不调用健康 solver，并写入 session conversation memory。
- [ ] mixed 健康问答仅在正常 complete 响应中附加 Planner 指令。
- [ ] Web 不解析 summary、用户关键词或 chartTokens 来执行 UI 副作用。
- [ ] 中英文文案完整，SVG 不被辅助技术重复朗读，卡片无伪交互控件。
- [ ] 402×874 与 1440×1000 无横向溢出，底部导航不遮挡卡片。
- [ ] `pnpm typecheck`、`pnpm test`、Web production build 和目标 Playwright suites 全部通过。
