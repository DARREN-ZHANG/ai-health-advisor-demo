# Wave 5 完成审查 — 2026-04-12

## 1. 审查范围

- 审查提交：
  - `e1f44c8 feat(frontend): connect homepage and data center to ai agent api`
  - `0f454b4 feat(frontend): implement full ai advisor chat with chart token rendering`
  - `6c6616a feat(frontend): add guardrails, toast system, active sensing and e2e tests`
- 对照文档：
  - `docs/full-project-task-backlog.md`
  - `docs/source-of-truth/PRD.md`
  - `docs/source-of-truth/ARCHITECTURE.md`
  - `docs/detailed-tech-design/frontend-detailed-implementation-plan.md`
  - `docs/detailed-tech-design/backend-detailed-implementation-plan.md`
  - `docs/detailed-tech-design/agent-detailed-implementation-plan.md`
- 本地校验：
  - `pnpm --filter @health-advisor/web typecheck`
  - `pnpm --filter @health-advisor/web test`

## 2. 总体结论

当前版本已经把 Homepage / Data Center / Advisor 的基础 AI 入口接起来了，但 **Wave 5 还不能判定完成**。

阻塞点不是样式细节，而是几条直接影响验收的核心链路：

- Data Center 在同一 `timeframe` 下切换非 `stress` tab 时会复用错误缓存
- chart token 数据链路前后端协议不一致，消息内微图表存在运行时崩溃风险
- 前端 6 秒超时实现为直接中断请求并报错，和文档要求的“timeout state 与后端 fallback 收敛”相反
- `sessionId` 的签发、复用、profile switch 语义与设计文档相反

建议至少修完下文 `CRITICAL` 和 `HIGH` 项后，再将 Wave 5 标记为完成。

## 3. 发现的问题

### CRITICAL

#### C-1: Data Center 的 query key 漏掉 `tab`，非 `stress` tab 会读到错误缓存

**相关任务**：AI-005

**代码位置**：

- `apps/web/src/hooks/use-data-query.ts:21-44`
- `apps/web/src/lib/query-keys.ts:12-19`

**现状**：

- `useDataCenterQuery()` 只有 `stress` 走独立 key。
- 其他 `hrv` / `sleep` / `resting-hr` / `activity` / `spo2` 共用 `queryKeys.dataCenter.timeline(profileId, timeframe)`。
- query string 虽然带了 `tab`，但缓存 key 没带，React Query 不会把不同 tab 视为不同查询。

**文档要求**：

- `docs/full-project-task-backlog.md:278` 要求 “按 tab/timeframe 切换可看到真实数据图表”。

**影响**：

- 用户在同一个 `timeframe` 下切换非 `stress` tab 时，前端会复用上一个 tab 的缓存结果。
- 图表标题会变，数据未必变，属于直接的功能错误。

**建议修复**：

- 把 `tab` 纳入 query key，例如 `timeline(profileId, tab, timeframe)`。
- 相关单测/E2E 需要覆盖同一 `timeframe` 下跨 tab 切换。

#### C-2: Chart token 渲染链路前后端数据形状不一致，消息内微图表存在运行时崩溃风险

**相关任务**：AI-012

**代码位置**：

- `apps/web/src/hooks/use-data-query.ts:47-64`
- `apps/web/src/components/advisor/ChartTokenRenderer.tsx:37-62`
- `apps/agent-api/src/modules/data/chart-service.ts:22-50`
- `packages/charts/src/registry/token-registry.ts:15-35`
- `packages/charts/src/utils/normalize.ts:7-29`

**现状**：

- 前端把 `/profiles/:profileId/chart-data` 声明成 `StandardTimeSeries`。
- 后端实际返回的是 `ChartDataResponse[]`，其中每个元素只有 `timeline`。
- `ChartTokenRenderer` 直接把这个响应传给 `builder(data)`。
- chart builder 期望的是 `{ dates, series }`，会直接访问 `data.series[...]`。

**文档要求**：

- `docs/full-project-task-backlog.md:292` 要求消息内 `chartTokens` 能嵌入微图表。
- `docs/detailed-tech-design/implementation-index.md:386-388` 明确要求完成 chart token 渲染链路。

**影响**：

- 一旦 chat 返回合法 `chartTokens` 且请求成功，这段代码很可能在运行时直接抛错，而不是稳定渲染微图表。
- 即使不抛错，也不会得到设计要求的真实图表结果。

**建议修复**：

- 统一 `/chart-data` 正式响应协议。
- 若后端继续返回 `timeline`，前端必须先做 `toTimeSeries(response[0].timeline)` 再交给 builder。
- 更稳妥的是把 shared 类型冻结成正式协议，避免前后端各自猜测。

#### C-3: 6 秒超时被实现成前端直接 abort + 报错，无法与后端 fallback 收敛

**相关任务**：AI-004, AI-007, AI-011

**代码位置**：

- `apps/web/src/lib/api-client.ts:34-59, 91-95`
- `apps/web/src/app/page.tsx:19-31`
- `apps/web/src/app/data-center/page.tsx:107-133`
- `apps/web/src/components/advisor/AIAdvisorDrawer.tsx:87-110`

**现状**：

- `api-client` 在 6 秒后直接 `AbortController.abort()`。
- timeout 会被包装成 `ApiError(code='TIMEOUT')`。
- Homepage 只会 toast 报错；Data Center 只会显示 “无法获取总结内容”；Advisor 会插入一条 `system` 错误消息。

**文档要求**：

- `docs/source-of-truth/PRD.md:152-159`
- `docs/detailed-tech-design/frontend-detailed-implementation-plan.md:1034-1048`

这些文档都明确要求：

- 前端 6 秒边界只结束本地等待态
- 正式 fallback 仍由后端返回
- timeout state 需要与后端 fallback 收敛，前端不能把它改造成另一套“失败消息协议”

**影响**：

- 当前实现把“慢请求”直接变成“请求失败”，正式 fallback 根本没有机会被前端消费。
- Wave 5 的 fallback 体验不符合 PRD，也无法支撑演示场景。

**建议修复**：

- 把“结束 loading UI”与“中断网络请求”分开。
- 前端需要显式 timeout state，而不是把 timeout 直接翻译成系统错误消息。

### HIGH

#### H-1: `sessionId` 协议与设计文档相反，profile switch 还会主动清掉它

**相关任务**：AI-015, AI-018

**代码位置**：

- `apps/web/src/lib/api-client.ts:8-20, 46-49`
- `apps/web/src/stores/profile.store.ts:7-10, 25-36`
- `apps/agent-api/src/utils/meta.ts:6-12`
- `packages/shared/src/types/api.ts:11-31`

**现状**：

- 前端本地用 `crypto.randomUUID()` 生成 `sessionId`。
- profile switch 时调用 `clearSessionId()`，主动删除浏览器中的 session。
- 后端响应元信息没有 `sessionId`，也没有“后端签发并回写”的链路。

**文档要求**：

- `docs/detailed-tech-design/frontend-detailed-implementation-plan.md:507-516`
- `docs/detailed-tech-design/backend-detailed-implementation-plan.md:399-414`
- `docs/full-project-task-backlog.md:295,305`

这些文档要求：

- `sessionId` 由后端统一解析/签发
- 前端不得本地生成
- profile switch 后 `sessionId` 可续用，但旧 profile memory 必须由后端失效

**影响**：

- 当前实现无法验证真正的 session continuity。
- AI-015 的“同 session 多轮连续对话”与 AI-018 的“切 profile 后可续用 sessionId”都没有按正式协议落地。

**建议修复**：

- 让后端在成功响应中返回规范化 `sessionId`。
- 前端只缓存后端签发的值。
- profile switch 时清 UI / invalidation，不清 `sessionId`。

#### H-2: Homepage 仍然使用 mock trends，且状态/source 不是按正式结构化协议消费

**相关任务**：AI-001, AI-002, AI-004, AI-013

**代码位置**：

- `apps/web/src/app/page.tsx:25-40`
- `docs/detailed-tech-design/frontend-detailed-implementation-plan.md:522-557`
- `docs/detailed-tech-design/implementation-index.md:377-382`

**现状**：

- 首页历史趋势仍然是 `mockTrends`。
- 晨报状态色被硬编码成：
  - `finishReason === 'fallback' -> warning`
  - 否则一律 `good`
- 页面副标题也只是用 `finishReason` 推断“离线受限模式”。

**影响**：

- 首页没有完成“AI 晨报 + 只读数据”的真实闭环。
- `statusColor` / `source` / `meta` 并未按统一协议驱动 UI。
- 这会直接削弱 Wave 5.1 的演示可信度。

**建议修复**：

- 用真实只读数据驱动 `HistoricalTrendsGrid`。
- 正式把 `source` / `statusColor` 纳入共享协议后再渲染晨报状态，而不是在页面里硬推断。

#### H-3: 共享 `AgentResponseEnvelope` 缺失 `source` / `statusColor`，Wave 5 的统一渲染协议实际上无法成立

**相关任务**：AI-013

**代码位置**：

- `packages/shared/src/types/agent.ts:21-30`
- `apps/web/src/components/advisor/MessageBubble.tsx:44-60`
- `apps/web/src/app/page.tsx:25-31`
- `apps/web/src/app/data-center/page.tsx:107-133`

**现状**：

- shared 里的 `AgentResponseEnvelope` 只有 `summary` / `chartTokens` / `microTips` / `meta.finishReason`。
- 文档要求的 `source`、`statusColor`、更完整的 `meta` 并不存在。
- 所以前端只能靠 `finishReason` 和本地硬编码来拼 UI。

**文档要求**：

- `docs/detailed-tech-design/agent-detailed-implementation-plan.md:202-224`
- `docs/detailed-tech-design/frontend-detailed-implementation-plan.md:738-760`

**影响**：

- Morning Brief / View Summary / Chat 不可能真正做到“统一渲染状态色、source 与 meta”。
- 当前页面层所有 fallback / source / status 行为都建立在非正式推断上。

**建议修复**：

- 先冻结 shared 协议，再统一 backend / agent-core / frontend 的字段。
- 在协议没补全前，不建议宣称 AI-013 已完成。

#### H-4: Advisor Chat 请求上下文转发不完整，Smart Prompt 也没有正式走 `smartPromptId`

**相关任务**：AI-009, AI-014

**代码位置**：

- `apps/web/src/hooks/use-ai-query.ts:8-14`
- `apps/web/src/components/advisor/AIAdvisorDrawer.tsx:79-93`
- `apps/web/src/components/advisor/SmartPrompts.tsx:5-29`

**现状**：

- `ChatRequest` 类型里有 `smartPromptId` 和 `visibleChartIds`。
- 实际发送时只传了 `profileId + pageContext + userMessage`。
- `SmartPrompts` 也只返回一段纯文本，没有 prompt id。
- `pageContext.page` 在 Data Center 下会发成 `data-center`，与设计文档里的 `data_center` 口径不一致。

**文档要求**：

- `docs/full-project-task-backlog.md:289,294`
- `docs/detailed-tech-design/frontend-detailed-implementation-plan.md:692-694, 762-767`

**影响**：

- 后端/Agent 无法拿到当前可见图表上下文。
- Smart Prompt 目前只是“快捷填词”，不是正式的 prompt chain。

**建议修复**：

- Smart Prompt 组件返回 `{ id, text }`。
- Chat 请求补齐 `smartPromptId` 和 `visibleChartIds`。
- `pageContext.page` 统一成 shared 约束值。

#### H-5: View Summary 只接了最浅的一层，缺少 chart token/source/status/meta，也没有正确的 refetch loading 态

**相关任务**：AI-006, AI-007, AI-013

**代码位置**：

- `apps/web/src/hooks/use-ai-query.ts:39-66`
- `apps/web/src/app/data-center/page.tsx:34-44, 98-144`
- `docs/detailed-tech-design/implementation-index.md:384-388`
- `docs/detailed-tech-design/frontend-detailed-implementation-plan.md:688-694`

**现状**：

- `useViewSummary()` 默认 `enabled: !!profileId`，页面加载就会请求，而不是明确的点击触发。
- Modal 里只渲染了 `summary` 和 `microTips`。
- 没有渲染 `chartTokens`。
- 没有消费 `source` / `statusColor` / 完整 meta。
- UI 只看 `isLoading`，refetch 时不会进入设计里的 loading skeleton。

**影响**：

- “点击后获取当前视图总结”的产品语义被削弱。
- View Summary chart token 渲染这一条明确 DoD 没有完成。
- 刷新当前视图总结时，用户可能看到旧内容而不是明确的等待态。

**建议修复**：

- 将首请求改成明确的按需触发。
- 渲染 chart token block。
- 用 `isFetching`/显式状态机处理 refetch loading 与 timeout state。

### MEDIUM

#### M-1: 新增 E2E 没有覆盖 Wave 5 核心验收点

**相关任务**：AI-020

**代码位置**：

- `apps/web/e2e/advisor.spec.ts:8-50`
- `apps/web/e2e/guardrails.spec.ts:8-33`

**现状**：

- Advisor E2E 只验证 Drawer 打开、用户消息插入、本地清空历史。
- Guardrails E2E 只验证页面切换和弹窗打开。
- 没有断言：
  - 首页晨报真实返回
  - View Summary 正式结果
  - chat fallback / timeout
  - chart token 渲染
  - profile switch 后 AI 结果与 memory 失效

**文档要求**：

- `docs/full-project-task-backlog.md:307` 要求 “首页晨报、视图总结、聊天、fallback、图表 token 端到端可验证”。

**影响**：

- 当前测试即使全部通过，也不能证明 Wave 5 已达到交付标准。

**建议修复**：

- 用稳定 mock/fixture 覆盖 5 条核心旅程。
- 至少补齐：morning brief、view summary、advisor fallback、chart token、profile switch invalidation。

## 4. Wave 5 DoD 状态汇总

| ID | 状态 | 说明 |
|----|------|------|
| AI-001 | PARTIAL | 首页能显示 AI 摘要，但未按正式结构化协议消费完整字段。 |
| AI-002 | PARTIAL | Homepage 只接了晨报，历史趋势仍是 mock 数据。 |
| AI-004 | FAIL | fallback/timeout 未按统一协议收敛。 |
| AI-005 | FAIL | Data Center 非 `stress` tab 存在错误缓存复用。 |
| AI-006 | PARTIAL | 能弹出总结，但链路只打通到文本显示。 |
| AI-007 | FAIL | View Summary 缺少正式 loading/fallback 收敛。 |
| AI-009 | FAIL | `visibleChartIds` 未透传。 |
| AI-012 | FAIL | chart token 渲染链路协议不一致。 |
| AI-013 | FAIL | `source/statusColor/meta` 未形成统一协议。 |
| AI-014 | FAIL | Smart Prompt 未走正式 `smartPromptId`。 |
| AI-015 | FAIL | session continuity 语义与文档不一致。 |
| AI-018 | FAIL | profile switch 会清除 `sessionId`，与规范相反。 |
| AI-020 | FAIL | E2E 未覆盖核心 AI 旅程。 |

### M-2: `hideBanner` 只设 `isVisible: false` 但不清空 `activeBanner`

**状态**：DONE（已修复）

**相关任务**：AI-017, GM-004

**代码位置**：`apps/web/src/stores/active-sensing.store.ts:22`

**原问题**：`hideBanner: () => set({ isVisible: false })` 不清空 `activeBanner`。

**影响**：`ActiveSensingBanner` 组件中 `if (!activeBanner) return null` 永远不会命中，因为 banner 只是隐藏而未被清空。组件持续保留退出动画节点，且后续重新 `showBanner` 时如果 payload 相同，React 可能不会正确触发 AnimatePresence 重入。

**修复结果**：`hideBanner` 已同时清空 `activeBanner`，并在组件侧保留退出动画所需的最后一帧 banner 快照。

### M-3: `ActiveSensingBanner` 位置与 PRD 描述不一致

**状态**：DONE（已修复）

**相关任务**：GM-004

**代码位置**：`apps/web/src/components/layout/ActiveSensingBanner.tsx:25`

**原问题**：横幅定位为 `fixed bottom-24`（底部弹出卡片样式）。

**文档要求**：PRD §2.2 "全局最高优先级横幅。运动触发时在**页面顶部**顺滑下拉（覆盖当前视图顶部）。"

**修复结果**：已改为顶部下拉横幅，挂在 navbar 下方，从顶部方向进入和退出。

### M-4: Data Center 底部指标卡片硬编码文案

**状态**：DONE（已修复）

**代码位置**：`apps/web/src/app/data-center/page.tsx:88-96`

**原问题**：
- "最后更新" 固定显示 "今天"
- "状态" 固定显示 "已连接"

**影响**：后端不可用时仍显示 "已连接"，误导用户。

**修复结果**：
- "状态" 已按 query error 动态显示 `连接异常 / 已连接`
- "最后更新" 已改为基于当前图表数据的最后一个日期推断，而不是固定写死 "今天"

### M-5: `useDataChartOption` 自建 option builder 绕过 `@health-advisor/charts` 包

**状态**：DONE（已修复）

**相关任务**：AI-005

**代码位置**：`apps/web/src/hooks/use-data-chart-option.ts`

**原问题**：完全自建 ECharts option 构建逻辑（tooltip/grid/series/areaStyle），未使用 `@health-advisor/charts` 中的 `getChartBuilder` 等标准化工具。

**文档约束**：ARCHITECTURE.md §13.1 `packages/charts：图表封装`。Backlog CHT-004 "实现标准图表 option builders"。

**影响**：
1. Data Center 图表样式与 Advisor Chat MicroChart 不一致（后者使用 `getChartBuilder`）
2. 双重维护成本
3. sleep 分钟转小时的硬编码逻辑应属于 charts 包

**修复结果**：已改为 `DataTab -> ChartTokenId -> getChartBuilder()` 的标准链路，Data Center 与 Advisor 微图表复用同一套 charts builder。

### M-6: `useChartDataQuery` queryKey 未复用 `queryKeys` 约定

**状态**：DONE（已修复）

**代码位置**：`apps/web/src/hooks/use-data-query.ts:53`

**原问题**：`queryKey: [...queryKeys.dataCenter.all, 'chart-data', profileId, tokens.join(','), timeframe]`，手动拼接而非使用 query-keys.ts 中的 key builder。

**修复结果**：`queryKeys.dataCenter.chartData(...)` 已补齐，`useChartDataQuery` 已改为统一复用该 builder。

### M-7: `DataCenterResponse` 类型在前端 hooks 中重新定义

**状态**：DONE（已修复）

**代码位置**：`apps/web/src/hooks/use-data-query.ts:10-19`

**原问题**：前端自行定义了 `DataCenterResponse` 接口，而非复用 `@health-advisor/shared` 导出的类型。

**影响**：后端修改响应结构时，前端本地类型不会同步更新。

**修复结果**：`DataCenterResponse` 已提升到 `@health-advisor/shared`，前后端改为共用同一类型定义。

### M-8: `useViewSummary` 请求体含冗余字段

**状态**：DONE（已修复）

**代码位置**：`apps/web/src/hooks/use-ai-query.ts:56-61`

**原问题**：`pageContext` 已含 `dataTab` 和 `timeframe`，外层又重复传了 `tab` 和 `timeframe`。

**修复结果**：`useViewSummary` 已仅发送 `profileId + pageContext`，移除冗余顶层字段。

---

## 6. 架构合规性核查

| 架构约束 | 合规 | 说明 |
|----------|------|------|
| 前端不直接调用 LLM | ✅ | 所有 AI 请求走 apiClient → backend |
| 消费后端结构化响应 | ⚠️ | 晨报未消费 `statusColor`（H-2/H-3） |
| 前端不伪造 fallback 文案 | ❌ | error 时自行生成文案（C-3） |
| `ChartTokenId[]` 白名单渲染 | ⚠️ | 链路存在数据形状不一致（C-2） |
| 6 秒超时 | ❌ | 前端直接 abort，未与后端 fallback 收敛（C-3） |
| X-Session-Id 注入 | ⚠️ | 本地生成 sessionId 与文档要求不一致（H-1） |
| Profile switch 清空上下文 | ⚠️ | 清了 sessionId，与文档"可续用"语义相反（H-1） |
| 使用 @health-advisor/charts | ⚠️ | Data Center 自建 option builder（M-5） |
| 响应式三端适配 | ✅ | Drawer/Sheet/Bottom Sheet 三态 |
| Active Sensing 顶部横幅 | ⚠️ | 当前为底部卡片，与 PRD 不一致（M-3） |

## 7. 校验记录

- `pnpm --filter @health-advisor/web typecheck`：通过
- `pnpm --filter @health-advisor/web test`：通过

说明：

- 当前通过的类型检查和单测主要覆盖基础 store / api-client。
- 它们没有触达本次 review 中暴露出的协议错位、query key 设计错误和运行时图表链路问题。

## 8. 与 Wave 3 后端 Review 问题的关联

Wave 3 review 中发现的若干后端问题会直接影响 Wave 5 前端联调：

| Wave 3 问题 | 对 Wave 5 的影响 |
|-------------|-----------------|
| C-1: Profile switch 未清空 analytical memory | 切 profile 后前端可能收到旧 profile 的 AI 分析结果 |
| C-2: 合成 sessionId | 前端 sessionId 与后端 session store 不匹配 |
| I-1: HRV/resting-hr 时间线全 null | Data Center 的 HRV/静息心率 tab 将显示空图表 |
| I-4: stress contributors 固定 50/50/50 | 压力负荷图表的贡献项无意义 |
| H-3: stress.load 推导验证 | stress tab 可能显示全零数据 |

## 9. 结论

**不建议将 Wave 5 标记为完成。**

最少需要优先修复以下 4 项后，再进入下一轮验收：

1. 修复 Data Center query key 与 tab 缓存错误
2. 修复 chart token `/chart-data` 正式协议与前端渲染链路
3. 重做 timeout/fallback 收敛逻辑
4. 按文档修正 `sessionId` 签发与 profile switch 语义

此外，建议在进入 Wave 6 前同时处理以下 HIGH 级问题：
- 补齐 shared 协议中缺失的 `source`/`statusColor` 字段（H-3）
- 首页 Historical Trends 接入真实数据（H-2）
- Advisor Chat 补齐 `visibleChartIds` 和 `smartPromptId` 透传（H-4）
- View Summary 改为按需触发并完整渲染（H-5）
