# Wave 3 完成审查 — 2026-04-11

## 1. 审查范围

审查 Wave 3 全部任务（BE-001 ~ BE-027，含 BE-025A），验证实现是否满足以下标准：

- `docs/full-project-task-backlog.md` 中每条任务的 DoD
- `docs/source-of-truth/ARCHITECTURE.md` 和 `PRD.md` 中的系统级约束
- 代码质量、测试覆盖、类型安全

**审查基线**：commit `59deac3 feat(wave-3.3): God-Mode API and integration tests`

---

## 2. 总体评价

| 维度 | 评价 |
|------|------|
| 架构设计 | 良好 — 模块化清晰，职责边界分明 |
| 任务覆盖 | 28/29 项 P0 任务已完成，1 项 P1（BE-021 SSE）顺延 |
| 测试状态 | 14 个测试文件，110 个测试用例，全部通过 |
| 类型安全 | typecheck 通过，无错误 |
| 代码量 | ~2,950 行 TypeScript，14 个测试文件 |

**结论：Wave 3 核心目标达成，可进入 Wave 4，但需先修复下文标注的 CRITICAL 和 HIGH 级问题。**

---

## 3. 逐任务 DoD 核查

### Wave 3.1 — App Shell / Runtime

| ID | Task | 状态 | 核查说明 |
|----|------|------|----------|
| BE-001 | 环境变量 schema 与加载器 | **PASS** | Zod schema 覆盖 PORT/NODE_ENV/LLM_\*/AI_TIMEOUT_MS/ENABLE_GOD_MODE/FALLBACK_ONLY_MODE/LOG_LEVEL/DATA_DIR；非 fallback-only 模式强制要求 API_KEY |
| BE-002 | logger 基础封装 | **PASS** | Pino 结构化日志，dev 环境用 pino-pretty，日志含 requestId/route/latency/statusCode |
| BE-003 | request-context 插件 | **PASS** | 每个请求自动注入 requestId/sessionId/profileId，记录 startTime |
| BE-004 | 统一错误处理插件 | **PASS** | Zod 错误→400、TimeoutError→504、404、未知→500，全部使用 createErrorResponse |
| BE-005 | CORS 与安全头 | **PASS** | @fastify/cors + @fastify/helmet，dev 模式允许 localhost:3000/5173 |
| BE-006 | metrics 插件 | **PASS** | 内存态计数器：API latency / AI timeout / fallback / provider error |
| BE-008 | runtime registry | **PASS** | 组装 sandbox/session/override/scenario/agent/prompt/fallback 为统一 registry |
| BE-009 | session store | **PASS** | 封装 InMemorySessionMemoryStore，提供 clearOnProfileSwitch/evictExpired |
| BE-010 | override store | **PASS** | 支持 profile 切换、metric override、event inject、四种粒度 reset，不可变返回 |
| BE-011 | scenario registry | **PASS** | 从 manifest.json 加载场景，支持 list/getById |
| BE-012 | /health 路由 | **PASS** | 返回 status/env/provider/profilesLoaded/uptime，统一 envelope |
| BE-013 | profiles 模块与只读路由 | **PASS** | GET /profiles 列表 + GET /profiles/:profileId 详情，404 兜底 |

### Wave 3.2 — Read-only + AI API

| ID | Task | 状态 | 核查说明 |
|----|------|------|----------|
| BE-014 | profile timeline 只读路由 | **PASS** | GET /profiles/:profileId/timeline，支持 timeframe/custom date range |
| BE-015 | data-center 只读数据路由 | **PASS** | GET /profiles/:profileId/data，按 tab/timeframe 返回图表数据；stress tab 返回 StressTimelineResponse |
| BE-016 | chart-data 专用路由 | **PASS** | GET /profiles/:profileId/chart-data，token 白名单校验 |
| BE-017 | AI orchestration service | **PASS** | AiOrchestrator 封装 executeAgent + timeout + metrics 采集 |
| BE-018 | /ai/morning-brief | **PASS** | pageContext 校验 → AgentTaskType.HOMEPAGE_SUMMARY → agent 执行 → 统一 envelope |
| BE-019 | /ai/view-summary | **PASS** | 支持 tab/timeframe 透传 |
| BE-020 | /ai/chat | **PASS** | 支持 userMessage/smartPromptId/visibleChartIds |
| BE-021 | /ai/chat/stream SSE | **SKIP (P1)** | 未实现，符合预期 |

### Wave 3.3 — God-Mode API / Test

| ID | Task | 状态 | 核查说明 |
|----|------|------|----------|
| BE-022 | God-Mode switch profile | **PASS\*** | 切换 profile + 清空 session memory；但 analytical memory 未清空（见问题 1） |
| BE-023 | God-Mode inject event | **PASS** | Zod 校验 → override store 写入 → 返回 injected event |
| BE-024 | God-Mode override metric | **PASS** | Zod 校验 → override store 写入 → 返回 active overrides |
| BE-025 | God-Mode reset / restore | **PASS** | 支持 profile/events/overrides/all 四种 scope |
| BE-025A | God-Mode state / demo-script | **PASS** | GET /god-mode/state 返回完整状态；POST /god-mode/demo-script/run 逐步执行并返回结果摘要 |
| BE-026 | 统一 response envelope | **PASS** | 集成测试覆盖全部 12 个端点的 success/error envelope |
| BE-027 | 集成测试 | **PASS** | api-consistency.test.ts 覆盖 health/profile/data/ai/god-mode 全部路由 |

---

## 4. 发现的问题

### CRITICAL

#### C-1: Profile switch 未清空 analytical memory

**相关任务**: BE-009, BE-022

**现状**: `GodModeService.switchProfile()` 只调用了 `sessionStore.clearOnProfileSwitch()`，未清空 `analyticalMemory`。

**DoD 要求**: BE-009 "profile switch 时清空旧 profile 的 session / analytical memory"；BE-022 "必须清空旧 profile 的 session / analytical memory"。

**ARCHITECTURE.md §12.2**: "Profile 切换触发全局状态刷新"。

**影响**: 切换 profile 后，新 profile 的 AI 请求可能读取到旧 profile 的 analytical memory（最近摘要、最近视图总结），导致跨 profile 数据泄露。

**建议修复**:
```typescript
// god-mode/service.ts → switchProfile
this.registry.sessionStore.clearOnProfileSwitch(actualSessionId);
this.registry.analyticalMemory.clear();  // 新增
```

#### C-2: Profile switch 使用合成 sessionId 而非真实 sessionId

**相关任务**: BE-022

**现状**: `god-mode/service.ts:36` — `this.registry.sessionStore.clearOnProfileSwitch('session-${Date.now()}')`

**DoD 要求**: BE-022 "保留 sessionId，但必须清空旧 profile 的 session / analytical memory"。

**影响**: 传入的是每次生成的合成 ID，不是当前请求的真实 sessionId。这意味着 `clearOnProfileSwitch` 可能无法定位到正确的旧 session memory 进行清理。

**建议修复**: 将 request context 中的 sessionId 透传到 GodModeService，或由 override store 维护当前 active sessionId。

### HIGH

#### H-1: buildMeta 函数在多个路由文件中重复

**位置**: `profiles/routes.ts`, `data/routes.ts`, `ai/routes.ts`, `god-mode/routes.ts`, `health.ts`

**现状**: 5 处完全相同的 `buildMeta` 函数实现。

**建议**: 提取到 `src/utils/meta.ts` 或 `src/plugins/request-context.ts` 统一导出。

#### H-2: Service 实例在每次请求中重复创建

**位置**: 所有路由文件中的 `new ProfileService(app.runtime)`, `new DataService(app.runtime)` 等

**现状**: 每次请求都 `new` 一个 Service 实例，但 Service 内部只依赖 registry（单例），无状态。

**影响**: 不影响正确性，但增加了不必要的 GC 压力。

**建议**: 在路由注册时创建 Service 单例，或改用无构造函数的纯函数。

#### H-3: Stress Load Proxy 推导逻辑可能产出全零

**相关任务**: BE-015

**位置**: `data/service.ts:84-104`

**现状**: `buildStressTimelineResponse` 从 `timeline[i].values['stress.load']` 读取值。但 ARCHITECTURE.md §9.3 明确规定 "stress 不作为 raw sandbox 字段落盘；其值由后端基于沙盒数据在读取时推导"。如果 `normalizeTimeline` 不支持从 `DailyRecord` 推导 `stress.load`，则所有 `stressLoadScore` 将为 0。

**依赖验证**: 需确认 `@health-advisor/sandbox` 的 `normalizeTimeline` 是否为 `stress.load` 提供了推导逻辑。如果未提供，则 `stress tab` 将显示全零数据。

**建议**: 如果 sandbox 不推导 `stress.load`，应在 `buildStressTimelineResponse` 中直接基于 `HRV`/静息心率/睡眠时长/深睡时长计算 `stressLoadScore`，而不是从 `timeline.values` 中读取。

### MEDIUM

#### M-1: CORS origin 硬编码，未支持 CORS_ORIGIN 环境变量

**相关**: ARCHITECTURE.md §14.2 列出 CORS_ORIGIN 为可选变量

**现状**: `plugins/cors.ts` 硬编码了 `localhost:3000` 和 `localhost:5173`，生产模式直接 `false`。

**建议**: 支持 `CORS_ORIGIN` 环境变量以允许配置化。

#### M-2: env.ts 残留 SENTRY_DSN 字段

**位置**: `config/env.ts:22`

**现状**: `SENTRY_DSN: z.string().optional()` 仍然存在，但根据 git 历史 `fbe2739` 和 `26b5a0c` 已明确移除了 Sentry 依赖。

**建议**: 删除 `SENTRY_DSN` 字段。

#### M-3: God-Mode 路由未受 ENABLE_GOD_MODE 环境变量保护

**相关**: ARCHITECTURE.md §12, backlog GM-011

**现状**: 所有 God-Mode 端点无条件暴露。虽然 env-gating 是 Wave 6 的 GM-011 任务，但建议在 Wave 3 阶段至少添加基础检查，避免前端联调期间误调用。

**建议**: 在 `godModeRoutes` 注册前检查 `config.ENABLE_GOD_MODE`，若为 false 则跳过注册或返回 403。

#### M-4: request-context 中 sessionId/profileId 来自 header 但未在 AI 路由中使用

**位置**: `ai/routes.ts:57,86,124`

**现状**: AI 路由中的 sessionId 来自 `request.ctx.sessionId`（header），但在 sessionId 为空时 fallback 为 `session-${Date.now()}`。这个 fallback ID 无法与 God-Mode profile switch 清理的 session 关联。

**建议**: 统一 sessionId 管理，确保 AI 请求和 God-Mode 操作使用相同的 session 标识。

### LOW

#### L-1: /health 返回的 version 为硬编码 '0.0.0'

**建议**: 从 package.json 读取或通过环境变量注入。

#### L-2: 缺少 BE-007 任务编号

**说明**: Backlog 中 BE-007 被跳过（从 BE-006 直接到 BE-008），不影响实现完整性。

---

## 5. 测试覆盖评估

### 测试文件清单

| 测试文件 | 测试数 | 覆盖范围 |
|----------|--------|----------|
| config/env.test.ts | 10 | 环境变量解析、默认值、校验 |
| plugins/request-context.test.ts | - | requestId/sessionId 注入 |
| plugins/error-handler.test.ts | - | Zod/Timeout/404/Unknown 错误处理 |
| plugins/metrics.test.ts | - | 指标计数、latency 记录 |
| runtime/registry.test.ts | 87 | registry 初始化、profile 加载 |
| runtime/override-store.test.ts | 91 | override/inject/reset 隔离性 |
| runtime/scenario-registry.test.ts | - | 场景加载和查询 |
| modules/profiles/routes.test.ts | 80 | profile 列表/详情/404 |
| modules/data/routes.test.ts | - | timeline/data/chart-data 路由 |
| modules/ai/routes.test.ts | - | morning-brief/view-summary/chat |
| modules/god-mode/routes.test.ts | 17 | switch/inject/override/reset/state/demo-script |
| services/ai-orchestrator.test.ts | 116 | agent 执行/timeout/fallback metrics |
| integration/api-consistency.test.ts | 275 | 全端点 envelope 一致性 |
| routes/health.test.ts | 64 | health 端点结构 |
| **合计** | **110** | |

### 测试覆盖缺口

1. **Profile switch 后 analytical memory 是否被清空** — 无测试验证
2. **stress tab 在 `stress.load` 不存在时的行为** — 无测试验证全零场景
3. **sessionId 一致性** — 无测试验证 AI 请求与 God-Mode 操作的 session 关联
4. **并发 God-Mode 操作** — 无测试验证

---

## 6. 架构合规性核查

| 架构约束 | 合规 | 说明 |
|----------|------|------|
| Fastify 框架 | ✅ | |
| Zod 校验 | ✅ | env/route/query/body 全面覆盖 |
| Agent Runtime 单入口 `executeAgent` | ✅ | AiOrchestrator 统一调用 |
| 统一 `AgentResponseEnvelope` | ✅ | AI 路由返回结构化响应 |
| `ChartTokenId[]` 白名单 | ✅ | chart-data 路由做白名单校验 |
| stress 为后端推导 | ⚠️ | 需确认 sandbox 包是否支持 `stress.load` 推导 |
| 6 秒超时 | ✅ | env.AI_TIMEOUT_MS 默认 6000ms |
| fallback-only 模式 | ✅ | FALLBACK_ONLY_MODE 使用 FakeChatModel |
| 不回写 JSON 文件 | ✅ | override store 全内存态 |
| God-Mode 演示脚本通过正式 API | ✅ | POST /god-mode/demo-script/run |
| Homepage 读侧组合接口 | ✅ | timeline + morning-brief，无独立聚合 endpoint |
| 后端最小可观测性 | ✅ | requestId/route/profileId/sessionId/latency/fallback/error |

---

## 7. 建议的修复优先级

| 优先级 | 问题 | 建议动作 |
|--------|------|----------|
| P0 (阻塞 Wave 4) | C-1: analytical memory 未清空 | 在 switchProfile 中添加 analyticalMemory.clear() |
| P0 (阻塞 Wave 4) | C-2: 合成 sessionId | 透传真实 sessionId 或在 override store 中维护 |
| P0 (阻塞 Wave 5) | H-3: stress.load 推导验证 | 确认 sandbox 是否支持，否则在 service 中自行计算 |
| P1 (Wave 4 前) | H-1: buildMeta 重复 | 提取到共享模块 |
| P1 (Wave 4 前) | H-2: Service 重复创建 | 改为单例 |
| P2 | M-1 ~ M-4 | 在后续迭代中逐步修复 |
| P3 | L-1 ~ L-2 | 低优先级清理 |

---

## 8. 里程碑评估

Wave 3 对应 **M2（Core Runtime Ready）** 和 **M3（Read-only Demo Ready）** 的后端部分。

- **M2 评估**: agent-core 可独立运行（Wave 2 已通过），backend 基础接口与 runtime store 可用。**达成，附条件**（需修复 C-1/C-2）。
- **M3 评估（后端部分）**: profile 可切、只读数据接口可用、AI 接口可用、God-Mode 接口可用、统一 envelope。**基本达成**，stress tab 需确认（H-3）。

---

## 9. 总结

Wave 3 的实现质量整体较高，架构设计清晰，模块化程度好，测试覆盖全面。主要风险集中在两个 CRITICAL 级问题（analytical memory 未清空、sessionId 不一致），这两个问题会在 Wave 5/6 的垂直切片联调中暴露为跨 profile 数据泄露。建议在进入 Wave 4 前修复这两个问题，并确认 stress 推导逻辑的正确性。

---

## 10. 第二轮独立补充发现（基于当前工作树）

> 本节为独立复核新增问题，重点关注当前代码里第一轮 review 之外、仍会影响 Wave 3 可用性的缺陷。

### I-1: HRV / resting-hr 时间线把 `hr` 数组直接交给 `normalizeTimeline`，结果全为 `null`

**位置**:

- `apps/agent-api/src/modules/data/service.ts`
- `apps/agent-api/src/modules/data/chart-service.ts`
- `packages/sandbox/src/helpers/timeline.ts`

**现状**:

- `TAB_METRICS.hrv = ['hr']`
- `TAB_METRICS['resting-hr'] = ['hr']`
- `TOKEN_CONFIG.HRV_7DAYS = ['hr']`
- `TOKEN_CONFIG.RESTING_HR_7DAYS = ['hr']`

但 `normalizeTimeline()` 的 `extractMetricValue()` 只接受最终值为 `number` 的路径；而 `DailyRecord.hr` 的实际类型是 `number[]`。因此：

- `GET /profiles/:profileId/data?tab=hrv`
- `GET /profiles/:profileId/data?tab=resting-hr`
- `GET /profiles/:profileId/chart-data?tokens=HRV_7DAYS`
- `GET /profiles/:profileId/chart-data?tokens=RESTING_HR_7DAYS`

返回的时间线值都会是 `null`。

**复核验证**:

```ts
normalizeTimeline(records, ['hr'])
// => { values: { hr: null } }
```

**影响**: HRV / resting-hr 两个核心图表在当前实现下实际上不可用，前端会拿到整列空值。

---

### I-2: God-Mode 覆盖数据后未失效 analytical memory，下一次 AI 请求会继续读取旧摘要

**位置**:

- `apps/agent-api/src/modules/god-mode/service.ts`
- `packages/agent-core/src/prompts/task-builder.ts`

**现状**:

`overrideMetric()` / `injectEvent()` / `reset()` 都没有接入当前 `sessionId`，也没有调用 `analyticalMemory.invalidateOnOverride()`。而 `task-builder.ts` 会把 `latestViewSummary` / `latestRuleSummary` 直接拼进下一次 prompt。

**复核验证**:

1. 用同一 `x-session-id` 调一次 `/ai/view-summary`
2. 再调 `/god-mode/override-metric`
3. `app.runtime.analyticalMemory.get(sessionId)` 中旧的 `latestViewSummaryByScope` / `latestRuleSummary` 仍然保留

**影响**: God-Mode 改完数据后，下一次 AI 仍会参考旧视图总结和旧规则结论，导致 prompt 与当前 sandbox 状态不一致。

---

### I-3: `timeframe=custom` 缺少日期范围时被错误映射成 404 Profile not found

**位置**:

- `apps/agent-api/src/modules/data/routes.ts`

**现状**:

三个只读数据接口都先通过了 `TimeframeSchema('custom')`，但没有校验 `startDate/endDate` 是否同时存在；后续 `timeframeToDateRange()` 抛出的 `"customDateRange is required"` 被外层 `catch` 吞掉，并统一返回：

- `404`
- `PROFILE_NOT_FOUND`

**复核验证**:

`GET /profiles/profile-a/timeline?timeframe=custom` 当前返回 404，而不是 400 validation error。

**影响**: 前端无法区分“参数错误”和“profile 不存在”，会把请求构造问题误判成数据缺失。

---

### I-4: stress tab 的 contributors 永远退化为默认值 50/50/50

**位置**:

- `apps/agent-api/src/modules/data/service.ts`

**现状**:

`stress` tab 的 timeline 只按 `['stress.load']` 生成，但 `buildStressTimelineResponse()` 却从 `p.values['hr']`、`p.values['sleep.totalMinutes']`、`p.values['activity.steps']` 读取贡献项。由于这些 key 根本没有被放进 timeline，contributors 会稳定落到默认值 50。

**复核验证**:

`GET /profiles/profile-a/data?tab=stress&timeframe=week` 返回的 `points[*].contributors` 当前为固定 `50/50/50`。

**影响**: stress 页面虽然有“贡献项拆解”，但内容与真实数据无关，属于稳定错误输出。

---

### I-5: 当前 demo-script 的 `profile_switch` 步骤仍未透传真实 sessionId

**位置**:

- `apps/agent-api/src/modules/god-mode/service.ts`

**现状**:

当前工作树已经为单独的 `/god-mode/switch-profile` 路由补传了 `request.ctx.sessionId`，但 `runDemoScript() -> executeStep('profile_switch')` 仍调用 `this.switchProfile(payload.profileId as string)`，没有把真实 sessionId 透传进去。

**复核验证**:

1. 用 `x-session-id=sess-1` 先调一次 `/ai/chat` 写入 session memory
2. 再调 `/god-mode/demo-script/run` 执行带 `profile_switch` 的脚本
3. `app.runtime.sessionStore.store.get('sess-1')` 仍保留旧 profile 的会话内容

**影响**: demo-script 触发的 profile switch 与单独 API 的行为不一致，仍然会留下旧 profile 的对话/分析记忆。
