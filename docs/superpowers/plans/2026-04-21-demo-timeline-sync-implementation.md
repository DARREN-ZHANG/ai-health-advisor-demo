# Demo Timeline + Device Sync 实施计划

> **For implementers:** 这是一份可直接派发给前后端研发团队的执行计划。任务使用 `- [ ]` 复选框跟踪。每个 Task 都包含明确文件范围、实现目标、验收标准与推荐提交边界。

**Goal:** 将 `docs/detailed-tech-design/demo-timeline-device-sync-plan.md` 落地为一条完整的 Demo 主链路：主时间轴推进、设备缓存与同步、God Mode 片段注入、首页晨间同步、数据分析页承担历史趋势展示，以及可维护的 mock 数据生成方案。

**Source of Truth:**

- 方案设计：`docs/detailed-tech-design/demo-timeline-device-sync-plan.md`
- 当前实现索引：`docs/INDEX.md`
- 当前详细实现方案：`docs/detailed-tech-design/*.md`

**执行结果应覆盖：**

1. God Mode 新增主时间轴控制、同步触发、时间轴 reset、活动片段追加
2. 首页移除历史趋势图表，并把趋势展示并入数据分析页面
3. mock 数据方案升级为“冻结历史聚合 + 当前活动日原始流”
4. 数据分析页面继续支持 `day/week/month` 维度切换
5. 首页与 AI 只消费“已同步可见数据”

**非目标:**

- 不在本轮实现完整的数据库持久化
- 不在本轮实现秒级实时流 UI
- 不在本轮为所有历史日期都构建可推进原始流

---

## 0. 实施原则

- [ ] 主时间轴是唯一推进基准，任何运行时 append 都必须发生在当前时间之后
- [ ] `meal_intake` 是可识别事件，`recent_meal_30m` 是派生状态，不是新的识别类别
- [ ] 历史天数据使用冻结 `DailyRecord[]`
- [ ] 当前活动日使用 `ActivitySegment + DeviceEvent + SyncSession`
- [ ] 首页和 AI 严禁读取未同步事件
- [ ] 保留现有 read-only 查询能力，但数据源改为“冻结历史 + 当前活动日聚合”的混合模型

---

## Wave A — Shared Contract + Data 资产冻结

**目标:** 先冻结协议和 mock 资产边界，避免前后端各自猜测数据结构。

### Task A1: 扩展 shared 类型与 schema

**Files:**

- Modify: `packages/shared/src/types/sandbox.ts`
- Modify: `packages/shared/src/schemas/sandbox.ts`
- Modify: `packages/shared/src/types/god-mode.ts`
- Modify: `packages/shared/src/schemas/god-mode.ts`
- Modify: `packages/shared/src/index.ts`
- Modify: `packages/shared/src/__tests__/schemas.test.ts`

- [ ] 增加时间轴与原始流相关类型
  - `DemoClock`
  - `ActivitySegment`
  - `DeviceEvent`
  - `DeviceBufferState`
  - `SyncSession`
  - `RecognizedEvent`
  - `DerivedTemporalState`

- [ ] 收紧可识别事件类型
  - `meal_intake`
  - `steady_cardio`
  - `prolonged_sedentary`
  - `intermittent_exercise`
  - `walk`
  - `sleep`

- [ ] 增加 God Mode 新动作协议
  - `timeline_append`
  - `sync_trigger`
  - `advance_clock`
  - `reset_profile_timeline`

- [ ] 为新协议补齐 Zod schema 与 schema 测试

**DoD:**

- `packages/shared` typecheck 通过
- schema 测试覆盖新增 payload
- 所有新增类型从 `packages/shared/src/index.ts` 导出

- [ ] **推荐提交**

```bash
git commit -m "feat(shared): add timeline sync contracts"
```

---

### Task A2: 重组 data/sandbox 目录并新增历史资产

**Files:**

- Create: `data/sandbox/history/profile-a-daily-records.json`
- Create: `data/sandbox/history/profile-b-daily-records.json`
- Create: `data/sandbox/history/profile-c-daily-records.json`
- Create: `data/sandbox/timeline-scripts/profile-a-day-1.json`
- Create: `data/sandbox/timeline-scripts/profile-b-day-1.json`
- Create: `data/sandbox/timeline-scripts/profile-c-day-1.json`
- Modify: `data/sandbox/profiles/profile-a.json`
- Modify: `data/sandbox/profiles/profile-b.json`
- Modify: `data/sandbox/profiles/profile-c.json`
- Modify: `data/sandbox/scenarios/manifest.json`
- Modify: `data/README.md`
- Modify: `data/validate.ts`

- [ ] 为每个 profile 拆出两类资产
  - `history/*.json`: 冻结历史 `DailyRecord[]`
  - `timeline-scripts/*.json`: 当前活动日 baseline 活动片段

- [ ] 将 profile 基础文件收敛到以下职责
  - 画像基础字段
  - baseline 指标
  - 初始 demo 时刻
  - 关联 history 与 timeline script 元数据

- [ ] 重写 scenario manifest
  - 保留 `profile_switch`
  - 新增 timeline 相关场景
  - `profile-a` 至少覆盖：
    - `meal_intake`
    - `steady_cardio`
    - `prolonged_sedentary`
    - `intermittent_exercise`
    - `walk`
    - `sleep`
    - `reset_profile_timeline`

- [ ] 扩展 `data/validate.ts`
  - 校验 history 文件存在且日期连续
  - 校验 timeline script 中片段不重叠
  - 校验初始时刻与 baseline 脚本关系正确
  - 校验 scenario 引用的 segmentType 合法

**DoD:**

- `pnpm validate` 通过
- 新数据目录结构有 README 描述
- `profile-a` 的当前活动日脚本可完整表达“晨间初始状态 + 白天可追加片段”

- [ ] **推荐提交**

```bash
git commit -m "feat(data): add timeline scripts and history archives"
```

---

### Task A3: 落地 deterministic mock 数据生成脚本

**Files:**

- Create: `data/generate-history.ts`
- Create: `data/generate-timeline-script.ts`
- Modify: `package.json` 或根脚本入口
- Modify: `data/README.md`

- [ ] 提供可重复生成的脚本
  - `history` 生成器：生成冻结历史 `DailyRecord[]`
  - `timeline script` 生成器：生成当前活动日 baseline 片段

- [ ] 生成器必须是确定性算法
  - 输入固定 seed / profile 参数
  - 输出固定
  - 不依赖手工微调后的补丁值

- [ ] 在 README 中写清使用方式
  - 如何重生成
  - 什么时候需要重生成
  - 人工可编辑边界

**DoD:**

- 可以通过脚本重建 history / timeline script 资产
- 生成结果能通过 `data/validate.ts`

- [ ] **推荐提交**

```bash
git commit -m "feat(data): add deterministic mock data generators"
```

---

## Wave B — Sandbox Engine + Runtime 读模型

**目标:** 把当前 `DailyRecord -> SensorSample` 的派生路径升级成“原始事件 + 同步 + 聚合”的运行时引擎。

### Task B1: 新增 sandbox loader 与状态构建器

**Files:**

- Modify: `packages/sandbox/src/loader.ts`
- Modify: `packages/sandbox/src/index.ts`
- Create: `packages/sandbox/src/helpers/history-archive.ts`
- Create: `packages/sandbox/src/helpers/timeline-script.ts`
- Create: `packages/sandbox/src/helpers/demo-clock.ts`
- Create: `packages/sandbox/src/__tests__/helpers/history-archive.test.ts`
- Create: `packages/sandbox/src/__tests__/helpers/timeline-script.test.ts`

- [ ] 让 sandbox 能加载三类资产
  - profile base
  - history archive
  - current-day timeline script

- [ ] 提供当前 profile 初始状态构建器
  - 初始 `DemoClock`
  - 初始活动片段集合
  - 初始设备缓存边界
  - 初始同步会话列表

**DoD:**

- `loadProfile()` 可返回扩展后的 profile 结构
- 测试能验证 profile 绑定的 history 与 timeline script 被正确加载

---

### Task B2: 实现活动片段生成器与原始事件仓库

**Files:**

- Create: `packages/sandbox/src/helpers/activity-generators.ts`
- Create: `packages/sandbox/src/helpers/raw-event-repository.ts`
- Create: `packages/sandbox/src/helpers/timeline-append.ts`
- Create: `packages/sandbox/src/__tests__/helpers/activity-generators.test.ts`
- Create: `packages/sandbox/src/__tests__/helpers/timeline-append.test.ts`

- [ ] 实现片段到原始事件的生成器
  - `generateMealIntakeEvents`
  - `generateSteadyCardioEvents`
  - `generateProlongedSedentaryEvents`
  - `generateIntermittentExerciseEvents`
  - `generateWalkEvents`
  - `generateSleepEvents`

- [ ] 提供 append 逻辑
  - 默认从 `currentTime` 之后开始
  - `offsetMinutes` 只能非负
  - 禁止与已有片段重叠
  - append 后推进 `currentTime`

- [ ] 保证 `DeviceEvent` 的时间顺序和 deterministic 生成

**DoD:**

- 测试能验证不同片段生成的事件序列特征
- append 违反时间约束时会抛出明确错误

---

### Task B3: 实现同步引擎与 pending/synced 查询

**Files:**

- Create: `packages/sandbox/src/helpers/sync-engine.ts`
- Modify: `packages/sandbox/src/helpers/device-stream.ts`
- Create: `packages/sandbox/src/__tests__/helpers/sync-engine.test.ts`
- Update: `packages/sandbox/src/__tests__/helpers/device-stream.test.ts`

- [ ] 将现有 `device-stream` 降级为兼容视图聚合器
  - 输入改为 raw events
  - 不再从 `DailyRecord` 直接造分钟流

- [ ] 实现同步能力
  - `syncOnAppOpen`
  - `syncOnManualRefresh`
  - `getPendingEvents`
  - `getSyncedEvents`
  - `summarizeSyncSessions`

- [ ] 严格执行水位线模型
  - 同步只接受 `measuredAt <= currentTime`
  - 不支持回填早于水位线的历史事件

**DoD:**

- pending/synced 查询与 sync session 计数可测试
- 原始事件在同步前后可见性变化正确

---

### Task B4: 实现识别器、派生状态与 DailyRecord 聚合器

**Files:**

- Create: `packages/sandbox/src/helpers/event-recognition.ts`
- Create: `packages/sandbox/src/helpers/derived-temporal-state.ts`
- Create: `packages/sandbox/src/helpers/raw-to-daily.ts`
- Create: `packages/sandbox/src/__tests__/helpers/event-recognition.test.ts`
- Create: `packages/sandbox/src/__tests__/helpers/derived-temporal-state.test.ts`
- Create: `packages/sandbox/src/__tests__/helpers/raw-to-daily.test.ts`

- [ ] 基于已同步事件识别
  - `meal_intake`
  - `steady_cardio`
  - `prolonged_sedentary`
  - `intermittent_exercise`
  - `walk`
  - `sleep`

- [ ] 实现派生状态
  - `recent_meal_30m`

- [ ] 将当前活动日的已同步原始事件聚合为 `DailyRecord`

**DoD:**

- `meal_intake -> recent_meal_30m` 测试通过
- 当前活动日可聚合出日级兼容视图

- [ ] **推荐提交**

```bash
git commit -m "feat(sandbox): add timeline sync runtime engine"
```

---

## Wave C — Backend Runtime + API 改造

**目标:** 后端成为主时间轴、同步状态、God Mode 新动作和混合查询的唯一可信编排层。

### Task C1: 将 override-store 升级为 demo-state-store

**Files:**

- Modify: `apps/agent-api/src/runtime/override-store.ts`
- Modify: `apps/agent-api/src/runtime/registry.ts`
- Modify: `apps/agent-api/src/__tests__/runtime/override-store.test.ts`
- Update: `apps/agent-api/src/__tests__/runtime/registry.test.ts`

- [ ] 评估两种实现方式并选择其一
  - 方案 1：重命名/重构 `override-store` 为 `demo-state-store`
  - 方案 2：保留 `override-store` 作为兼容层，新增 `demo-state-store`

- [ ] 状态至少包含
  - current profile
  - profile 级 `DemoClock`
  - 运行时追加片段
  - 初始 baseline 片段
  - 当前活动日原始事件缓存
  - `lastSyncedMeasuredAt`
  - sync history

- [ ] 提供 reset 能力
  - `reset_profile_timeline(profileId)`
  - 恢复初始晨间状态

**DoD:**

- runtime store 测试覆盖 profile 隔离、append、sync、reset

---

### Task C2: God Mode API 升级

**Files:**

- Modify: `apps/agent-api/src/modules/god-mode/service.ts`
- Modify: `apps/agent-api/src/modules/god-mode/routes.ts`
- Modify: `apps/agent-api/src/__tests__/modules/god-mode/routes.test.ts`

- [ ] 保留已有能力
  - `profile_switch`
  - `reset`

- [ ] 新增 timeline 相关动作
  - `timeline_append`
  - `sync_trigger`
  - `advance_clock`
  - `reset_profile_timeline`

- [ ] 扩展 `GET /god-mode/state` 返回
  - 当前时间轴时刻
  - 最近同步会话
  - pending 事件数
  - 最近识别事件
  - 最近派生状态

- [ ] 为 `profile-a` demo script 提供顺序推进能力

**DoD:**

- God Mode 路由测试覆盖新增动作
- 非法 append 时返回 400 validation error

---

### Task C3: 数据模块切换到“冻结历史 + 当前活动日聚合”

**Files:**

- Modify: `apps/agent-api/src/modules/data/service.ts`
- Modify: `apps/agent-api/src/modules/data/routes.ts`
- Modify: `apps/agent-api/src/modules/data/chart-service.ts`
- Modify: `apps/agent-api/src/__tests__/modules/data/routes.test.ts`

- [ ] `day` 查询
  - 读取当前活动日已同步原始事件聚合结果

- [ ] `week/month` 查询
  - 组合 history archive 与当前活动日聚合结果

- [ ] 保持现有 API 契约尽可能稳定
  - `timeline`
  - `data`
  - `chart-data`

- [ ] 保留 device sync 只读接口，但数据源切到 runtime state

**DoD:**

- 数据分析页所需 read-only 接口在 `day/week/month` 均可工作
- 周/月图表不会因首页去趋势卡而失去数据

---

### Task C4: 首页晨间同步编排

**Files:**

- Modify: `apps/agent-api/src/modules/ai/routes.ts`
- Modify: `apps/agent-api/src/services/ai-orchestrator.ts`
- Modify: `apps/agent-api/src/services/brief-cache.ts`
- Modify: `packages/agent-core/src/context/context-builder.ts`
- Update: `apps/agent-api/src/__tests__/modules/ai/routes.test.ts`

- [ ] 明确首页首次打开链路
  - 先同步
  - 再聚合
  - 再调用 LLM

- [ ] 方案二选一并固定
  - 方案 A：前端显式先调 `sync_trigger`，再拉首页与晨报
  - 方案 B：后端在首页 AI 路由内隐式触发一次 `app_open` sync

- [ ] Agent context 增加
  - `recognizedEvents`
  - `syncMetadata`
  - `derivedTemporalStates`

- [ ] 失效缓存策略
  - sync 后刷新 homepage brief 缓存
  - append / reset 后失效相关 analytical memory

**DoD:**

- 首页晨报读取到的是同步后的昨夜数据
- 未同步事件不会提前进入 LLM context

- [ ] **推荐提交**

```bash
git commit -m "feat(agent-api): add timeline sync god mode flow"
```

---

## Wave D — Frontend 页面与交互改造

**目标:** 完成首页与数据分析页面职责重组，以及 God Mode 新交互面板。

### Task D1: 首页移除历史趋势图表

**Files:**

- Modify: `apps/web/src/app/page.tsx`
- Modify: `apps/web/src/components/homepage/MorningBriefCard.tsx`
- Modify/Delete: `apps/web/src/components/homepage/HistoricalTrendsGrid.tsx`
- Modify: `apps/web/src/hooks/use-ai-query.ts`

- [ ] 从首页移除历史趋势图表区
- [ ] 首页保留
  - 晨报
  - 状态摘要
  - 必要的轻量提示

- [ ] 若 `HistoricalTrendsGrid` 不再复用，直接删除

**DoD:**

- 首页只承担“同步 + 晨间总结”入口
- 首页代码中不再查询历史趋势图表数据

---

### Task D2: 数据分析页面合并历史趋势展示

**Files:**

- Modify: `apps/web/src/app/data-center/page.tsx`
- Modify: `apps/web/src/hooks/use-data-query.ts`
- Modify: `apps/web/src/hooks/use-data-chart-option.ts`
- Modify: `apps/web/src/stores/data-center.store.ts`
- Create/Modify: `apps/web/src/components/data-center/*` 如有目录则复用；否则在现有页面组件内拆分

- [ ] 将首页历史趋势区域并入数据分析页
- [ ] 页面结构调整为
  - 当前 tab 主图
  - 趋势汇总区
  - 历史趋势/对比区
  - AI 解读入口

- [ ] 保持 `day/week/month` 维度切换
- [ ] 若 `day` 使用当前活动日派生视图，需对 empty/loading 状态做明确处理

**DoD:**

- 数据分析页能承担原首页历史趋势图职责
- `day/week/month` 切换均可用

---

### Task D3: God Mode 面板新增主时间轴控制

**Files:**

- Modify: `apps/web/src/components/god-mode/GodModePanel.tsx`
- Modify: `apps/web/src/components/god-mode/GodModePanel.test.tsx`
- Modify: `apps/web/src/hooks/use-god-mode-actions.ts`
- Modify: `apps/web/src/stores/god-mode.store.ts`
- Modify: `apps/web/src/stores/profile.store.ts`

- [ ] 面板显示新增状态
  - 当前时间
  - 最近同步时间
  - pending 事件数
  - 最近识别事件
  - 最近派生状态

- [ ] 面板新增动作
  - append 片段
  - advance clock
  - sync now
  - reset timeline

- [ ] `profile-a` 片段操作按顺序排列，适合 demo 演示

**DoD:**

- God Mode 可以完整驱动一天中的活动推进
- reset 后 UI 与后端状态一致恢复

---

### Task D4: 首页首次打开同步策略接入

**Files:**

- Modify: `apps/web/src/app/page.tsx`
- Modify: `apps/web/src/hooks/use-god-mode-actions.ts`
- Modify: `apps/web/src/lib/query-keys.ts`
- Modify: `apps/web/src/stores/profile.store.ts`

- [ ] 按 C4 选定的方案接入首页同步
  - 若显式同步：页面加载先调 `sync_trigger(app_open)`
  - 若隐式同步：确保首页请求链路无需额外前端动作

- [ ] 同步完成后刷新
  - homepage brief
  - 当前 profile 的 data queries
  - God Mode 状态

**DoD:**

- 首次打开首页能稳定拿到同步后数据
- 刷新页面不会产生错乱的重复状态

- [ ] **推荐提交**

```bash
git commit -m "feat(web): merge homepage trends into data center"
```

---

## Wave E — QA、联调与交付验收

**目标:** 形成研发团队可直接验收的闭环。

### Task E1: 后端测试补齐

**Files:**

- Modify: `apps/agent-api/src/__tests__/modules/god-mode/routes.test.ts`
- Modify: `apps/agent-api/src/__tests__/modules/data/routes.test.ts`
- Modify: `apps/agent-api/src/__tests__/modules/ai/routes.test.ts`
- Modify: `apps/agent-api/src/__tests__/integration/api-consistency.test.ts` 如存在

- [ ] 覆盖以下链路
  - 初次打开首页触发同步
  - append 后未同步前 AI 不可见
  - manual refresh 后可见
  - reset 回到初始晨间状态
  - `day/week/month` 混合查询可用

---

### Task E2: 前端测试与交互回归

**Files:**

- Modify: `apps/web/src/components/god-mode/GodModePanel.test.tsx`
- Add/Modify: `apps/web/src/app/page` 相关测试
- Add/Modify: `apps/web/src/app/data-center/page` 相关测试

- [ ] 覆盖以下交互
  - 首页不再显示历史趋势图
  - 数据分析页显示合并后的趋势区
  - God Mode 面板显示时间轴与同步状态
  - reset timeline 会刷新页面状态

---

### Task E3: Demo 彩排清单更新

**Files:**

- Modify: `docs/ops/demo-rehearsal-checklist.md`
- Modify: `docs/ops/smoke-runbook.md`
- Modify: `docs/ops/offline-demo-runbook.md` 如有影响

- [ ] 更新彩排步骤
  - 首页首次打开触发同步
  - 通过 God Mode 追加片段
  - 手动同步后首页/数据分析页变化
  - reset timeline 恢复

**DoD:**

- QA 可以按 runbook 独立验收主链路

- [ ] **推荐提交**

```bash
git commit -m "test: cover timeline sync demo flow"
```

---

## 建议执行顺序

- [ ] A1 → A2 → A3
- [ ] B1 → B2 → B3 → B4
- [ ] C1 → C2 → C3 → C4
- [ ] D1 → D2 → D3 → D4
- [ ] E1 → E2 → E3

可并行部分：

- A2 与 A3 可并行，但 A3 输出必须满足 A2 的验证约束
- B4 可在 B2 基础上与 B3 并行
- D1/D2 与 C2/C3 可平行推进，但联调前必须锁定 read-only 接口

---

## 最终验收标准

- [ ] God Mode 支持 `profile_switch / timeline_append / sync_trigger / advance_clock / reset_profile_timeline`
- [ ] 首页首次打开只展示同步后的晨间信息，不再展示历史趋势图
- [ ] 数据分析页承接历史趋势展示，并支持 `day/week/month`
- [ ] mock 数据采用“冻结历史聚合 + 当前活动日原始流”
- [ ] `meal_intake` 可识别，`recent_meal_30m` 以派生状态进入上下文
- [ ] reset 后当前 profile 能恢复到初始晨间状态
- [ ] 所有新增 shared/sandbox/backend/web 相关测试通过
