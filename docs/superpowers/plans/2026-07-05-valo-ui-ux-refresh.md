# Valo UI/UX、Demo Control 与 Switch Status 实施文档

> **For agentic workers:** 执行时将 Chrome 取证/验收任务交给 Chrome Agent，将仓库实现任务交给 Implementation Agent。所有任务使用 checkbox 跟踪，禁止调用 Figma MCP。

**Goal:** 在保留现有 AI、健康数据、Profile 和 Timeline 演示能力的前提下，将 Web UI/UX 更新为 Valo App Demo 的设计语言，并补齐响应式、双语、可访问性和确定性测试。

**Architecture:** Chrome Agent 先将 Figma 画板固化为设计清单、参考截图和独立装饰素材；Implementation Agent 仅消费这些仓库内产物实施页面。Timeline Control 迁移到独立 Demo Control 抽屉，Profile Switch 由首页 Avatar 打开，Switch Status 只能通过首页中央状态圆环打开。

**Tech Stack:** Next.js 15 App Router、React 19、TypeScript、Tailwind CSS 4、Zustand、TanStack Query、Framer Motion、ECharts、Vitest、Playwright。

---

## Context Summary

- 设计来源：[Valo App Demo](https://www.figma.com/design/xRPTN25efPZD6q4QxBKxvp/Valo-App-Demo?node-id=0-1&p=f&t=aYfghM7MGr98xCrM-0)。
- 禁止使用 Figma MCP；设计读取、素材导出和视觉对比只能使用 Chrome。
- Figma 主要提供 402px 移动端稿。移动端严格对齐设计，平板和桌面沿同一设计系统进行响应式扩展。
- 保留中英双语，不改为单语应用。
- Life Log 是交互原型：数据仅保存在前端内存中，按 Profile 隔离，刷新页面后清空。
- Trends 保留现有全部指标；Sleep 和 Activity 按设计重构，其他指标延续同一视觉体系。
- Profile 编辑、克隆、重置、删除的前端入口移除；后端 CRUD API 保留。
- 当前工作区已有不相关改动，执行任务时不得修改、暂存或提交这些文件。

## Core Interaction Contracts

### 首页四态

| AI 状态 | Hero 状态 | 主色 |
|---|---|---|
| 无简报 | Prime Readiness | 紫 |
| `good` | Active Recovery | 绿 |
| `warning` | Metabolic Sluggish | 橙 |
| `error` | Glycogen Depleted | 红 |

- `HealthVisualState` 固定为 `prime-readiness | active-recovery | metabolic-sluggish | glycogen-depleted`。
- 手动切换即时覆盖 Hero；TanStack Query 的 `dataUpdatedAt` 变化后清除覆盖并同步最新 AI 状态。
- 已有简报重新获取期间保持当前 Hero；只有首次没有简报时使用 Prime Readiness。

### Switch Status

- `HealthHero` 中完整状态圆环必须直接实现为语义化 `button`，禁止额外覆盖透明点击层。
- 圆环支持鼠标、触摸、Enter 和 Space，并设置 `aria-haspopup="dialog"`、`aria-expanded`、`aria-controls`。
- 点击圆环后，移动端打开 Bottom Sheet，桌面端打开居中、约 420px 宽的 Dialog。
- 弹窗使用原生 radio group 展示四种状态。
- 选择任一状态后立即调用 `setManualState(state)`、更新 Hero、关闭弹窗并将焦点返回圆环。
- Avatar、Demo Control、My 页面和全局导航不得提供第二个 Switch Status 入口。

### 首页左上角入口

```text
[Avatar] [Demo Control]
    │            │
    │            └─ Timeline Control Drawer
    └─ Profile Switch Sheet

中央状态圆环
    └─ Switch Status Sheet / Dialog
```

### Demo Control

- 仅当 `NEXT_PUBLIC_ENABLE_GOD_MODE=true` 时渲染入口和抽屉。
- 移动端使用约 `92dvh` Bottom Sheet；桌面端使用 `480px` 右侧 Drawer。
- 完整保留当前演示时间、事件数量与明细、13 类 Timeline 片段、`+1h` 和重置。
- 片段固定分为：
  - 日常节律：进餐、步行、睡眠、小憩、专注、放松。
  - 运动训练：有氧、HIIT、力量训练。
  - 状态与摄入：久坐、焦虑、咖啡因、酒精。
- 片段卡点击后直接执行；同一时间只允许一个 Timeline 变更请求。
- 当前卡显示 loading，其他片段、时钟和重置同步禁用。
- 咖啡因和酒精继续走概率事件注入及 Active Sensing 确认链路。
- 重置必须经过 Valo 风格确认弹层。
- 成功后刷新 God Mode、首页和 Trends；失败显示 Toast 并保持抽屉打开。

### Action 与计时器

- `ActionOption` 驱动 Yes/Not Now 卡片；`microTips` 作为 Now 内非交互提示。
- 两个按钮点击后均收起卡片。
- 有 `durationMinutes` 的 `micro_event` 先启动 Timer；自然完成或“立即完成”后追加事件并刷新简报。
- Stop 取消计时，不追加事件、不刷新简报。
- 不可由传感器识别的动作只记录选择，不刷新简报。
- Calendar 只记录当前会话确认，不打开外部应用。

---

## File Structure

```text
docs/ui/valo/                                  # Chrome 设计证据和视觉验收
apps/web/public/valo/                          # 独立装饰素材
apps/web/src/components/valo/                  # Valo 通用视觉组件
apps/web/src/components/demo-control/          # Timeline Control 新入口和抽屉
apps/web/src/components/homepage/              # Hero、Switch Status、简报
apps/web/src/components/life-log/              # Life Log 会话原型
apps/web/src/components/data-center/            # Trends 页面组件
apps/web/src/components/settings/               # My 与 Profile Switch
apps/web/src/stores/health-status.store.ts      # 四态自动/手动状态
apps/web/src/stores/life-log.store.ts           # Profile 隔离的会话数据
apps/web/e2e/valo-ui.spec.ts                    # Valo 主流程 E2E
apps/web/e2e/demo-control.spec.ts               # Demo Control E2E
```

---

## 模块 C1：Chrome 设计证据与素材

### 任务 C1.1：固化设计清单

**执行者：** Chrome Agent
**blockedBy：** 无

**涉及文件：**

- 创建 `docs/ui/valo/design-manifest.md`
- 创建 `docs/ui/valo/frame-matrix.md`

**实现步骤：**

- [ ] 使用 Chrome 遍历四态首页、Life Log、Trends、AI Chat、My、账户切换、Timer 和 Appointment 画板。
- [ ] 记录画板尺寸、颜色、字体、间距、圆角、遮罩和弹层层级。
- [ ] 建立“Figma 画板 → 路由 → 组件 → 状态 → 验收视口”矩阵。
- [ ] 明确状态圆环是 Switch Status 唯一入口，正文和控件必须保持 HTML。

**验证方式：**

```bash
rg "Prime Readiness|Active Recovery|Metabolic Sluggish|Glycogen Depleted" docs/ui/valo
rg "Switch Status|Demo Control|402.*874" docs/ui/valo
```

**提交说明：**

```bash
git add docs/ui/valo
git commit -m "docs(ui): capture Valo design specification"
```

### 任务 C1.2：导出独立装饰素材

**执行者：** Chrome Agent
**blockedBy：** C1.1

**涉及文件：**

- 创建 `apps/web/public/valo/hero/*.png`
- 创建 `apps/web/public/valo/asset-manifest.json`
- 创建 `docs/ui/valo/references/*.png`

**实现步骤：**

- [ ] 导出四态 Hero 的独立装饰层，不导出带正文或按钮的整屏图片作为生产素材。
- [ ] 固定命名为 `prime-readiness.png`、`active-recovery.png`、`metabolic-sluggish.png`、`glycogen-depleted.png`。
- [ ] 在 asset manifest 中记录来源画板、倍率、尺寸和用途。
- [ ] 整屏截图只存入 references，供视觉验收使用。

**提交说明：**

```bash
git add apps/web/public/valo docs/ui/valo
git commit -m "assets(web): add Valo visual assets"
```

---

## 模块 I1：设计系统与响应式应用壳

### 任务 I1.1：建立 Valo 视觉基础

**执行者：** Implementation Agent
**blockedBy：** C1.2

**涉及文件：**

- 修改 `apps/web/src/app/globals.css`
- 创建 `apps/web/src/lib/valo-theme.ts`
- 创建 `apps/web/src/components/valo/ValoCard.tsx`

**实现步骤：**

- [ ] 定义背景、表面、四态色、文字、边框、阴影和层级变量。
- [ ] 接入 design manifest 指定的正文字体和展示字体。
- [ ] 统一卡片、状态节点、玻璃表面、禁用态、焦点环和最小 40px 触控尺寸。
- [ ] 组件只引用主题变量，不复制散落色值。

**验证方式：**

```bash
pnpm --filter @health-advisor/web typecheck
pnpm --filter @health-advisor/web lint
```

**提交说明：**

```bash
git add apps/web/src/app/globals.css apps/web/src/lib/valo-theme.ts apps/web/src/components/valo
git commit -m "feat(web): establish Valo design foundation"
```

### 任务 I1.2：实现通用 Sheet 与 Dialog

**执行者：** Implementation Agent
**blockedBy：** I1.1

**涉及文件：**

- 修改 `apps/web/src/app/layout.tsx`
- 创建 `apps/web/src/components/valo/ValoSheet.tsx`
- 创建 `apps/web/src/components/valo/ValoDialog.tsx`
- 创建 `apps/web/src/components/valo/ValoConfirmDialog.tsx`
- 创建 `apps/web/src/components/layout/AppShell.tsx`

**实现步骤：**

- [ ] 支持移动 Bottom Sheet、移动全屏弹层、桌面右侧 Drawer 和桌面居中 Dialog。
- [ ] 实现焦点锁、焦点返回、Escape、遮罩关闭、滚动锁和安全区。
- [ ] 通过明确视口断点选择弹层形态，不使用运行时宽度猜测。
- [ ] 保留现有 Providers、Toast 和错误边界。

**验证方式：**

```bash
pnpm --filter @health-advisor/web test
pnpm --filter @health-advisor/web typecheck
```

**提交说明：**

```bash
git add apps/web/src/app/layout.tsx apps/web/src/components/valo apps/web/src/components/layout/AppShell.tsx
git commit -m "feat(web): add responsive Valo application shell"
```

---

## 模块 I2：Demo Control 与 Timeline Control 迁移

### 任务 I2.1：抽离 Timeline 领域配置并清理旧 UI

**执行者：** Implementation Agent
**blockedBy：** I1.2

**涉及文件：**

- 创建 `apps/web/src/components/demo-control/timeline-segments.ts`
- 创建 `apps/web/src/components/demo-control/types.ts`
- 删除 `apps/web/src/components/homepage/ConfigArea.tsx`
- 删除 `apps/web/src/components/god-mode/ProfileEditor.tsx`
- 删除 `apps/web/src/hooks/use-profile-actions.ts`
- 修改 `apps/web/src/app/page.tsx`

**实现步骤：**

- [ ] 将 13 类片段配置和事件显示映射从 ConfigArea 抽离。
- [ ] 按三组固定顺序导出只读配置，并测试每个 segment type 只出现一次。
- [ ] 删除旧桌面 Config 侧栏和移动 Config Drawer。
- [ ] 保留 Profile CRUD 后端路由、Schema、服务和后端测试。

**验证方式：**

```bash
pnpm --filter @health-advisor/web test
pnpm --filter @health-advisor/web typecheck
```

**提交说明：**

```bash
git add apps/web/src/components/demo-control apps/web/src/app/page.tsx
git add -u apps/web/src/components/homepage/ConfigArea.tsx apps/web/src/components/god-mode/ProfileEditor.tsx apps/web/src/hooks/use-profile-actions.ts
git commit -m "refactor(web): isolate timeline control domain"
```

### 任务 I2.2：实现 Demo Control 入口和抽屉

**执行者：** Implementation Agent
**blockedBy：** I2.1

**涉及文件：**

- 创建 `apps/web/src/components/demo-control/DemoControlTrigger.tsx`
- 创建 `apps/web/src/components/demo-control/DemoControlDrawer.tsx`
- 创建 `apps/web/src/components/demo-control/TimelineSegmentCard.tsx`
- 创建 `apps/web/src/components/demo-control/RecentEventsDisclosure.tsx`
- 修改 `apps/web/src/stores/god-mode.store.ts`

**实现步骤：**

- [ ] Trigger 使用时间轴/调节器图标、紫色脉冲点和双语 Tooltip。
- [ ] `isEnabled=false` 时 Trigger 与 Drawer 均不渲染。
- [ ] Header 显示 Demo Control、LIVE 和关闭按钮。
- [ ] 摘要区显示 `currentDemoTime`、事件数量和点击展开的事件明细。
- [ ] 三组片段使用双列卡片；帮助按钮展开说明且不触发片段。
- [ ] 底部固定 `+1h` 和重置操作。

**提交说明：**

```bash
git add apps/web/src/components/demo-control apps/web/src/stores/god-mode.store.ts
git commit -m "feat(web): add Valo demo control drawer"
```

### 任务 I2.3：接通 Timeline 操作与反馈

**执行者：** Implementation Agent
**blockedBy：** I2.2

**涉及文件：**

- 修改 `apps/web/src/hooks/use-god-mode-actions.ts`
- 创建 `apps/web/src/components/demo-control/TimelineResetDialog.tsx`
- 创建 `apps/web/src/components/demo-control/DemoControlDrawer.test.tsx`

**实现步骤：**

- [ ] 普通片段调用 `appendTimeline`。
- [ ] 咖啡因和酒精调用 `injectEvent` 并设置 `pendingProbabilisticAction`。
- [ ] `+1h` 调用 `advanceClock(60)`。
- [ ] 重置确认后调用 `resetTimeline({ profileId })`。
- [ ] 记录当前 mutation 的 segment type，只在对应卡片显示 loading。
- [ ] 成功失效 God Mode、首页和数据中心 Query；失败显示全局 Toast。

**验证方式：**

```bash
pnpm --filter @health-advisor/web test
pnpm --filter @health-advisor/web typecheck
```

**提交说明：**

```bash
git add apps/web/src/hooks/use-god-mode-actions.ts apps/web/src/components/demo-control
git commit -m "feat(web): connect demo control timeline actions"
```

---

## 模块 I3：首页四态、Switch Status、简报与 Life Log

### 任务 I3.1：实现四态 Hero 与 Switch Status

**执行者：** Implementation Agent
**blockedBy：** I1.2

**涉及文件：**

- 创建 `apps/web/src/lib/health-visual-state.ts`
- 创建 `apps/web/src/stores/health-status.store.ts`
- 创建 `apps/web/src/components/homepage/HealthHero.tsx`
- 创建 `apps/web/src/components/homepage/SwitchStatusDialog.tsx`
- 创建 `apps/web/src/components/homepage/HomeHeader.tsx`

**实现步骤：**

- [ ] 建立四态名称、素材、颜色和 API 状态的穷尽映射。
- [ ] 将完整状态圆环直接实现为 `<button type="button">`。
- [ ] 移动端使用 `ValoSheet`，桌面端使用约 420px 的 `ValoDialog`。
- [ ] 使用原生 radio group 渲染四个状态。
- [ ] 状态选择后立即应用、关闭并将焦点返回圆环。
- [ ] 监听 `dataUpdatedAt`，新简报到达时清除手动覆盖。
- [ ] 确保 Avatar、Demo Control 和全局导航中没有状态切换入口。

**验证方式：**

- Enter/Space 打开弹窗，Escape 关闭。
- 选择状态后 Hero 即时变化。
- 同色新简报也会清除手动覆盖。
- 页面中只有一个 `aria-haspopup="dialog"` 的状态圆环入口。

```bash
pnpm --filter @health-advisor/web test
pnpm --filter @health-advisor/web typecheck
```

**提交说明：**

```bash
git add apps/web/src/lib/health-visual-state.ts apps/web/src/stores/health-status.store.ts apps/web/src/components/homepage
git commit -m "feat(web): add ring-triggered status switching"
```

### 任务 I3.2：重构简报、Action 卡与 Timer

**执行者：** Implementation Agent
**blockedBy：** I3.1

**涉及文件：**

- 修改 `apps/web/src/app/page.tsx`
- 修改 `apps/web/src/hooks/use-action-interactions.ts`
- 创建 `apps/web/src/components/homepage/BriefTimeline.tsx`
- 创建 `apps/web/src/components/homepage/ActionCard.tsx`
- 创建 `apps/web/src/components/homepage/ActionTimerSheet.tsx`
- 创建 `apps/web/src/components/homepage/AppointmentSheet.tsx`

**实现步骤：**

- [ ] `summary` 和 `microTips` 显示在 Now；`microTips` 不推断 interaction。
- [ ] `actions` 渲染 Yes/Not Now 卡片，交互后收起。
- [ ] 有 duration 的 micro event 打开 Timer，无 duration 时沿用立即提交。
- [ ] Timer 支持暂停、恢复、Stop、自然完成和立即完成，并保证只提交一次。
- [ ] Appointment 只记录当前会话确认。
- [ ] Afternoon/Night 使用 Figma 示例的固定双语文案，不标记为 Agent 输出。

**提交说明：**

```bash
git add apps/web/src/app/page.tsx apps/web/src/hooks/use-action-interactions.ts apps/web/src/components/homepage
git commit -m "feat(web): implement Valo brief action flows"
```

### 任务 I3.3：实现 Profile 隔离的 Life Log

**执行者：** Implementation Agent
**blockedBy：** I3.2

**涉及文件：**

- 创建 `apps/web/src/stores/life-log.store.ts`
- 创建 `apps/web/src/lib/life-log.ts`
- 创建 `apps/web/src/components/life-log/`

**实现步骤：**

- [ ] 定义 caffeine、alcohol、hydration 三类配置和 `LifeLogEntry`。
- [ ] Store 使用内存状态并按 `profileId` 分区，不使用 persist middleware。
- [ ] 支持快捷新增、自定义数量、时间选择、编辑和删除。
- [ ] 固定单位为咖啡因 `50mg/杯`、酒精 `14g/杯`、饮水 `250ml`。
- [ ] Profile 切换展示对应数据，浏览器刷新后清空。

**提交说明：**

```bash
git add apps/web/src/stores/life-log.store.ts apps/web/src/lib/life-log.ts apps/web/src/components/life-log
git commit -m "feat(web): add profile-scoped life log prototype"
```

---

## 模块 I4：Trends 全指标体验

### 任务 I4.1：重构 Trends 页面骨架

**执行者：** Implementation Agent
**blockedBy：** I1.2

**涉及文件：**

- 修改 `apps/web/src/app/data-center/page.tsx`
- 修改 `apps/web/src/components/data-center/DataCenterControls.tsx`
- 创建 `apps/web/src/components/data-center/ReflectionSection.tsx`

**实现步骤：**

- [ ] 保留 `/data-center`、现有查询 hooks 和 Zustand 状态。
- [ ] 页面名称改为 Trends，采用设计稿日期头、指标导航、Reflection 和卡片布局。
- [ ] Reflection 继续由 `useViewSummary` 驱动。
- [ ] 保留 Overview、Sleep、HRV、Resting HR、Activity、SpO2 和 Stress。

**提交说明：**

```bash
git add apps/web/src/app/data-center apps/web/src/components/data-center
git commit -m "feat(trends): rebuild Trends page structure"
```

### 任务 I4.2：落地 Sleep、Activity 和其他指标

**执行者：** Implementation Agent
**blockedBy：** I4.1

**涉及文件：**

- 修改 `apps/agent-api/src/modules/data/service.ts`
- 修改 `apps/web/src/components/data-center/`
- 修改 `apps/agent-api/src/__tests__/modules/data/routes.test.ts`

**实现步骤：**

- [ ] Activity 响应加入现有底层字段 `activity.distanceKm`。
- [ ] Sleep 展示时长、个人参考完成度、睡眠阶段、效率和 score。
- [ ] Activity 展示步数、距离、卡路里和活跃分钟。
- [ ] 其他指标继续使用现有数据和图表，只替换视觉。
- [ ] 不用 sleep score 冒充一致性，不生成不存在的数据。

**验证方式：**

```bash
pnpm --filter @health-advisor/agent-api test -- src/__tests__/modules/data/routes.test.ts
pnpm --filter @health-advisor/web test
pnpm --filter @health-advisor/web typecheck
```

**提交说明：**

```bash
git add apps/agent-api/src/modules/data apps/agent-api/src/__tests__/modules/data apps/web/src/components/data-center
git commit -m "feat(trends): add data-backed sleep and activity views"
```

---

## 模块 I5：AI Chat

### 任务 I5.1：重构聊天容器

**执行者：** Implementation Agent
**blockedBy：** I1.2

**涉及文件：**

- 修改 `apps/web/src/components/advisor/AIAdvisorDrawer.tsx`
- 修改 `apps/web/src/components/advisor/AIAdvisorTrigger.tsx`
- 修改 `apps/web/src/components/advisor/SmartPrompts.tsx`

**实现步骤：**

- [ ] 移动端使用全高 Chat Sheet，桌面端使用右侧面板。
- [ ] 还原 Valo 欢迎标题、建议问题和输入框。
- [ ] 保留真实 Chat API、pending prompt、加载、超时和清空会话。
- [ ] AI Trigger 与底部导航及 Demo Control 不发生遮挡。

**提交说明：**

```bash
git add apps/web/src/components/advisor
git commit -m "feat(web): align AI advisor with Valo design"
```

### 任务 I5.2：统一消息与错误状态

**执行者：** Implementation Agent
**blockedBy：** I5.1

**涉及文件：**

- 修改 `apps/web/src/components/advisor/MessageBubble.tsx`
- 修改 `apps/web/src/components/advisor/PhysiologicalTags.tsx`
- 修改 `apps/web/e2e/advisor.spec.ts`

**实现步骤：**

- [ ] 统一用户、助手、系统、图表和记忆卡片视觉。
- [ ] 保留 status color、chart token 和 memory candidate 行为。
- [ ] 为发送、失败、加载、清空和 Profile 切换添加稳定测试定位符。

**提交说明：**

```bash
git add apps/web/src/components/advisor apps/web/e2e/advisor.spec.ts
git commit -m "test(web): harden Valo advisor interactions"
```

---

## 模块 I6：My、Avatar Profile Switch 与导航

### 任务 I6.1：实现 My、Avatar 和账户切换

**执行者：** Implementation Agent
**blockedBy：** I2.2

**涉及文件：**

- 创建 `apps/web/src/app/my/page.tsx`
- 创建 `apps/web/src/components/settings/MyScreen.tsx`
- 创建 `apps/web/src/components/settings/AccountSwitcherSheet.tsx`
- 创建 `apps/web/src/hooks/use-profiles-query.ts`
- 修改 `apps/web/src/components/homepage/HomeHeader.tsx`

**实现步骤：**

- [ ] Avatar 只打开 AccountSwitcherSheet。
- [ ] 使用 `GET /profiles` 展示真实 Profile。
- [ ] 切换调用现有 `switchProfile`，保持后端运行时与前端缓存同步。
- [ ] Avatar 旁渲染独立 DemoControlTrigger。
- [ ] My 页 Account 复用同一 Sheet，Language 复用语言切换。
- [ ] 其他菜单保持可见但使用真实 disabled 和 `aria-disabled`。

**提交说明：**

```bash
git add apps/web/src/app/my apps/web/src/components/settings apps/web/src/hooks/use-profiles-query.ts apps/web/src/components/homepage/HomeHeader.tsx
git commit -m "feat(web): add avatar profile switching and My screen"
```

### 任务 I6.2：统一 Home、Trends、My 导航

**执行者：** Implementation Agent
**blockedBy：** I6.1

**涉及文件：**

- 修改 `apps/web/src/components/layout/BottomNav.tsx`
- 修改 `apps/web/src/components/layout/Navbar.tsx`
- 修改 `apps/web/src/app/layout.tsx`

**实现步骤：**

- [ ] 移动端底部导航固定为 Home、Trends、My。
- [ ] 桌面端使用相同信息架构。
- [ ] AI Trigger 保持右下角，Demo Control 保持 Hero 左上角。
- [ ] 不增加任何额外 Switch Status 入口。

**提交说明：**

```bash
git add apps/web/src/components/layout apps/web/src/app/layout.tsx
git commit -m "feat(web): introduce Valo global navigation"
```

---

## 模块 I7：双语、测试与验收修复

### 任务 I7.1：补齐双语、可访问性和单元测试

**执行者：** Implementation Agent
**blockedBy：** I2.3、I3.3、I4.2、I5.2、I6.2

**涉及文件：**

- 修改 `apps/web/src/messages/en.json`
- 修改 `apps/web/src/messages/zh.json`
- 创建或修改 `apps/web/src/**/*.test.ts(x)`

**测试场景：**

- [ ] 四态映射、圆环唯一入口、手动覆盖和新简报同步。
- [ ] Switch Status 移动/桌面形态、键盘操作和焦点返回。
- [ ] 13 个 Timeline 片段分组和概率事件链路。
- [ ] Drawer 请求互斥、失败 Toast 和重置确认。
- [ ] Timer 自然完成、立即完成、Stop 和单次提交。
- [ ] Life Log Profile 隔离和 Demo Control 环境开关。
- [ ] Avatar Profile Switch 与禁用菜单。

**提交说明：**

```bash
git add apps/web/src/messages apps/web/src
git commit -m "test(web): cover Valo and demo control rules"
```

### 任务 I7.2：建立确定性 E2E 与构建基线

**执行者：** Implementation Agent
**blockedBy：** I7.1

**涉及文件：**

- 创建 `apps/web/e2e/valo-ui.spec.ts`
- 创建 `apps/web/e2e/demo-control.spec.ts`
- 修改受影响的现有 `apps/web/e2e/*.spec.ts`

**实现步骤：**

- [ ] 使用 Playwright route mock 固定 Profiles、morning brief、data、chat 和 God Mode 响应。
- [ ] 覆盖圆环 Switch Status、Demo Drawer、13 类片段、概率事件、推进时钟和重置。
- [ ] 覆盖 Life Log、Timer、Trends、My、账户切换和 Chat。
- [ ] 分别验证中文和英文，不依赖真实 LLM。

**验证方式：**

```bash
pnpm --filter @health-advisor/web test
pnpm --filter @health-advisor/web test:e2e
pnpm build
pnpm lint
pnpm typecheck
pnpm test
```

**提交说明：**

```bash
git add apps/web/e2e
git commit -m "test(web): add deterministic Valo demo coverage"
```

### 任务 I7.3：修复视觉验收差异

**执行者：** Implementation Agent
**blockedBy：** C2.1

**实现步骤：**

- [ ] 只处理 `docs/ui/valo/visual-acceptance.md` 明确记录的差异。
- [ ] 禁止整屏截图覆盖正文、视口特判和 JavaScript 像素补偿。
- [ ] 每组独立差异使用单独 Conventional Commit。

**验证方式：**

```bash
pnpm --filter @health-advisor/web test
pnpm --filter @health-advisor/web test:e2e
pnpm --filter @health-advisor/web typecheck
```

**提交说明：**

```bash
git commit -m "fix(web): resolve Valo visual acceptance gaps"
```

---

## 模块 C2：Chrome 跨视口视觉验收

### 任务 C2.1：首轮视觉比对

**执行者：** Chrome Agent
**blockedBy：** I7.2

**涉及文件：**

- 创建 `docs/ui/valo/visual-acceptance.md`
- 创建 `docs/ui/valo/qa/first-pass/*.png`

**验收视口：** 390×844、402×874、768×1024、1440×1000。

**重点场景：**

- [ ] 点击状态圆环才打开 Switch Status。
- [ ] 点击 Avatar 或 Demo Control 不打开 Switch Status。
- [ ] 移动端使用 Bottom Sheet，桌面端使用居中 Dialog。
- [ ] 状态选择后立即切换、关闭并返回焦点。
- [ ] Demo Control 三组片段、事件展开、loading、错误和确认弹层。
- [ ] Life Log、Timer、Appointment、Sleep、Activity、AI Chat 和 My。

**提交说明：**

```bash
git add docs/ui/valo
git commit -m "docs(ui): record Valo visual acceptance findings"
```

### 任务 C2.2：最终复验

**执行者：** Chrome Agent
**blockedBy：** I7.3

**实现步骤：**

- [ ] 重跑全部视口和交互矩阵。
- [ ] 确认 P0/P1 差异为零。
- [ ] 确认无横向溢出、底部导航冲突、弹层遮挡、文字裁切和不可操作控件。
- [ ] 在验收报告中记录最终结果和实现提交。

**提交说明：**

```bash
git add docs/ui/valo
git commit -m "docs(ui): finalize Valo visual acceptance"
```

---

## 执行顺序

### 依赖关系

| 任务 | blockedBy | 说明 |
|---|---|---|
| C1.1 | - | Chrome 设计取证可立即启动 |
| C1.2 | C1.1 | 依赖画板与素材清单 |
| I1.1 | C1.2 | 依赖固化的视觉规范和素材 |
| I1.2 | I1.1 | 依赖主题变量和基础样式 |
| I2.1 | I1.2 | 依赖新壳层，迁移旧 Config UI |
| I2.2 | I2.1 | 依赖 Timeline 配置和类型 |
| I2.3 | I2.2 | 依赖 Drawer 和片段组件 |
| I3.1 | I1.2 | 依赖 Sheet、Dialog 和主题 |
| I3.2 | I3.1 | 依赖 Hero、HomeHeader 和状态 Store |
| I3.3 | I3.2 | 依赖新版首页结构 |
| I4.1 | I1.2 | 可与首页、Demo、Chat 并行 |
| I4.2 | I4.1 | 依赖新版 Trends 骨架 |
| I5.1 | I1.2 | 可与首页、Demo、Trends 并行 |
| I5.2 | I5.1 | 依赖新版聊天容器 |
| I6.1 | I2.2 | 依赖 Demo Trigger，以完成首页左上角组合 |
| I6.2 | I6.1 | 依赖 My 和 Account Sheet |
| I7.1 | I2.3、I3.3、I4.2、I5.2、I6.2 | 依赖所有功能完成 |
| I7.2 | I7.1 | 依赖稳定接口和测试定位符 |
| C2.1 | I7.2 | 依赖可运行的完整应用 |
| I7.3 | C2.1 | 依赖明确视觉差异清单 |
| C2.2 | I7.3 | 依赖全部视觉修复 |

### 执行阶段

1. Phase 1：C1.1
2. Phase 2：C1.2
3. Phase 3：I1.1
4. Phase 4：I1.2
5. Phase 5（可并行）：I2.1、I3.1、I4.1、I5.1
6. Phase 6（可并行）：I2.2、I3.2、I4.2、I5.2
7. Phase 7（可并行）：I2.3、I3.3、I6.1
8. Phase 8：I6.2
9. Phase 9：I7.1
10. Phase 10：I7.2
11. Phase 11：C2.1
12. Phase 12：I7.3
13. Phase 13：C2.2

### 关键路径

`C1.1 → C1.2 → I1.1 → I1.2 → I2.1 → I2.2 → I6.1 → I6.2 → I7.1 → I7.2 → C2.1 → I7.3 → C2.2`

---

## Acceptance Criteria

- [ ] 状态圆环是 Switch Status 唯一入口。
- [ ] Switch Status 移动端使用 Bottom Sheet，桌面端使用居中 Dialog。
- [ ] 状态选择立即应用、关闭并返回焦点。
- [ ] 下一次 AI 简报更新自动恢复 API 状态。
- [ ] Avatar、Demo Control、Switch Status 和 AI Trigger 职责互不混用。
- [ ] 新版页面不再渲染旧 ConfigArea 或 ProfileEditor。
- [ ] Demo Control 完整覆盖当前 Timeline Control 的时间、事件、13 类片段、概率事件、推进和重置能力。
- [ ] Demo Control 在 God Mode 关闭时完全不渲染。
- [ ] Timeline 请求具有明确 loading、互斥和失败反馈。
- [ ] Profile Switch 通过 Avatar 和 My Account 进入。
- [ ] Life Log 三类 CRUD 正常、按 Profile 隔离、刷新后重置。
- [ ] Trends 保留全部现有指标，Sleep 和 Activity 不展示无数据依据的指标。
- [ ] AI Chat 保留现有真实请求、图表和记忆能力。
- [ ] 中英文、移动端、平板和桌面端通过自动化及视觉验收。
- [ ] Build、lint、typecheck、unit 和 E2E 全部通过。
- [ ] 不修改或暂存现有无关 `data/sandbox`、`.agents` 和 `docs/review` 内容。

## Assumptions

- Life Log 仅作为前端会话原型，不新增持久化 API。
- Afternoon/Night 使用 Figma 示例静态双语内容，后续由单独的结构化 Agent 能力替换。
- Profile CRUD 后端 API 暂时保留，以避免扩大兼容性变更。
- `/data-center` URL 保持不变，只将用户可见名称更新为 Trends。
- Chrome Agent 和 Implementation Agent 不同时修改同一文件；Chrome 产物先提交，实现任务再开始。
