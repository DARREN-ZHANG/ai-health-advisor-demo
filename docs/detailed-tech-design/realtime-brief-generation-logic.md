# 实时简报（Homepage Summary）生成逻辑

## 文件索引

| 模块 | 文件路径 | 职责 |
|------|----------|------|
| **API 路由** | `apps/agent-api/src/modules/ai/routes.ts` | 接收 HTTP 请求，触发数据同步，调度 orchestrator |
| **请求编排** | `apps/agent-api/src/services/ai-orchestrator.ts` | 缓存查询/写入，调用 agent-core 执行 |
| **运行时总入口** | `packages/agent-core/src/runtime/agent-runtime.ts` | 14 步主流程：上下文构建 → 规则评估 → 工具编排 → LLM 调用 → 输出解析 → 安全审核 |
| **上下文构建** | `packages/agent-core/src/context/context-builder.ts` | 从 request + deps 组装 `AgentContext`（数据窗口、profile、信号） |
| **上下文包构建** | `packages/agent-core/src/context/context-packet-builder.ts` | 将 `AgentContext` + 规则结果打包为 `TaskContextPacket`，含 recentEvents / latest24h / trend7d |
| **上下文包类型** | `packages/agent-core/src/context/context-packet.ts` | `TaskContextPacket` 等所有 packet 类型定义 |
| **上下文包渲染** | `packages/agent-core/src/prompts/context-packet-renderer.ts` | 将 packet 渲染为 prompt 文本 |
| **规则引擎** | `packages/agent-core/src/rules/homepage-rules.ts` | 5 条 homepage 规则（HRV / 睡眠 / 血氧 / 压力 / 活动量）+ chart token 建议 |
| **工具编排** | `packages/agent-core/src/runtime/realtime-brief-tool-orchestrator.ts` | 策略驱动的工具调用计划 → 执行 → 证据注入 prompt |
| **咖啡因工具** | `packages/agent-core/src/tools/estimate-caffeine-sleep-impact.ts` | 估算咖啡因半衰期衰减 & 睡眠影响等级 |
| **Prompt 构建** | `packages/agent-core/src/prompts/task-builder.ts` | 拼接模板 + 风格 + 约束 + packet 渲染 + 输出格式 |
| **Prompt 模板** | `data/sandbox/prompts/homepage/template.md` | 首页简报核心指令：3 段结构、数据引用规则、statusColor 规则、写作红线 |
| **中文风格** | `data/sandbox/prompts/homepage/style/zh.md` | 中文沟通风格：人称、语气、比喻、建议风格 |
| **事件识别** | `packages/sandbox/src/helpers/event-recognition.ts` | 从设备事件中识别结构化事件（睡眠、运动、咖啡因等） |
| **咖啡因检测** | `packages/sandbox/src/helpers/caffeine-detector.ts` | 基于 HR↑ / RMSSD↓ / 压力↑ / 低活动量 的咖啡因摄入检测 |
| **输出解析** | `packages/agent-core/src/output/response-parser.ts` | 解析 LLM JSON 输出为 `AgentResponseEnvelope` |
| **Token 校验** | `packages/agent-core/src/output/token-validator.ts` | 校验 chartTokens 只来自白名单 |
| **安全清洗** | `packages/agent-core/src/output/safety-cleaner.ts` | 清除缺失数据的编造内容 |
| **确定性验证** | `packages/agent-core/src/output/verifier.ts` | 同步确定性校验，生成 VerificationReport |
| **前端组件** | `apps/web/src/components/homepage/MorningBriefCard.tsx` | 简报卡片 UI 渲染 |
| **前端 Hook** | `apps/web/src/app/page.tsx` | 首页入口，调用 `useMorningBrief` 获取数据 |
| **SSE 事件契约** | `packages/shared/src/schemas/brief-stream.ts` | BriefStreamEvent Zod schema（前后端共用） |
| **summary 增量提取** | `packages/agent-core/src/output/streaming-summary-extractor.ts` | @streamparser/json 增量解析，只释放 `$.summary` |
| **SSE route** | `apps/agent-api/src/modules/ai/routes.ts` → `/ai/morning-brief/stream` | SSE 流式端点 |
| **SSE writer** | `apps/agent-api/src/utils/sse-writer.ts` | 帧序列化 + 背压 + exactly-one-terminal |
| **Web SSE client** | `apps/web/src/lib/brief-stream-client.ts` | fetch ReadableStream + eventsource-parser |
| **draft store** | `apps/web/src/stores/brief-stream.store.ts` | profile/request scoped provisional summary |

---

## 1. 整体架构

```
用户打开首页
    │
    ▼
POST /ai/morning-brief  ──────────────────────────────────┐
    │                                                      │
    ▼                                                      │
[数据同步] pending events → app_open sync                  │
    │                                                      │
    ▼                                                      │
[AiOrchestrator.execute()]                                 │
    ├── 缓存命中？ → 直接返回                               │
    │                                                      │
    ▼                                                      │
[agent-core: executeAgent()]                               │
    │                                                      │
    ├── Step 1:  加载持久化记忆                             │
    ├── Step 2:  构建 AgentContext                         │
    ├── Step 3:  low-data 快速 fallback                    │
    ├── Step 4:  规则引擎评估                              │
    ├── Step 5:  构建 TaskContextPacket                    │
    ├── Step 6:  构建 system prompt + task prompt          │
    ├── Step 6.5: 实时简报工具编排 ← 仅 HOMEPAGE_SUMMARY    │
    ├── Step 7:  调用 LLM                                 │
    ├── Step 8:  解析结构化输出                             │
    ├── Step 9:  校验 chartTokens                          │
    ├── Step 10: 安全清洗                                  │
    ├── Step 11: 写回 session memory                       │
    ├── Step 12: 写回 analytical memory                    │
    ├── Step 13: 确定性验证（异步观测）                      │
    ├── Step 14: 返回 AgentResponseEnvelope                │
    │                                                      │
    ▼                                                      │
[缓存写入 TTL=2h]                                          │
    │                                                      │
    ▼                                                      │
前端 MorningBriefCard 渲染  ◄──────────────────────────────┘
```

---

## 1.1 流式传输数据流（Homepage Summary Streaming）

首页 morning brief 已从"完整 JSON 一次返回"升级为"SSE 流式传输"：`summary`
随 LLM 生成逐步推送到前端，其余结构化字段（actions / statusColor /
chartTokens / meta）只在完整校验通过后随 `brief.completed` 一次发布。

### 端到端数据流

```
upstream Chat Completions (stream=true, GPT-5.6)
    │  choices[].delta.content 增量 token
    ▼
@streamparser/json 增量解析 $.summary
    │  StreamingSummaryExtractor 只释放 summary 字段片段
    ▼
HealthAgent.stream() → agent-runtime onSummaryDelta callback
    │  每个 delta 透传给 orchestrator（不阻塞模型迭代）
    ▼
AiOrchestrator.execute({ onSummaryDelta, signal })
    │  包装计时（llmFirstTokenMs / streamChunkCount / streamDurationMs）
    ▼
Fastify SSE route /ai/morning-brief/stream
    │  SseWriter.writeEvent(brief.summary.delta)
    │  hijack reply.raw，text/event-stream + no-transform + X-Accel-Buffering:no
    ▼
fetch ReadableStream（浏览器，非 EventSource）
    │  reader.read() + TextDecoder 增量解码
    ▼
eventsource-parser 分帧（与后端 SseWriter 序列化格式对称）
    │  BriefStreamEventSchema 校验每个事件 + requestId 一致性
    ▼
streamMorningBrief onEvent → useBriefStreamStore.append
    │  provisional draft 存入独立 store（不进 React Query cache）
    ▼
BriefTimeline 渲染 draftSummary（aria-busy=true，逐步增长）
    │  旧 actions/statusColor/futureSuggestions 保留（来自旧 cache）
    ▼
[brief.completed] → React Query cache 原子替换 → 清除 draft
    │  完整 envelope 通过 parse + token whitelist + safety + customer policy
    │  后才写 memory / 后端 cache / React Query cache
```

### 协议契约

| 事件 | 载荷 | 时机 |
|------|------|------|
| `brief.started` | `{ requestId }` | SSE 连接建立后立即发送 |
| `brief.summary.delta` | `{ requestId, delta }` | cache miss 时，每个 summary 片段（delta 非空） |
| `brief.completed` | `{ requestId, response: AgentResponseEnvelope }` | 完整输出通过所有校验后，终态 |
| `brief.failed` | `{ requestId, error: { code, message } }` | 任何失败路径（异常/非 complete/parse error），终态 |

**流协议 invariant**：`started → delta* → (completed | failed)`，恰好一个终态。
schema 定义在 `packages/shared/src/schemas/brief-stream.ts`，前后端共用同一份 Zod 契约。

### 关键设计决策

| 决策 | 原因 |
|------|------|
| 只流式 `summary`，不流式 `actions`/`statusColor` | 结构化字段必须通过完整校验（token whitelist / safety / customer policy）才能发布，半成品 JSON 会暴露未完成结构 |
| provisional draft 不进 React Query cache | cache 只承载终态数据，避免结构化字段在 draft 期间被部分更新 |
| completed 时原子替换 cache + 清除 draft | 保证 UI 在终态到达瞬间从"旧 cache + draft summary"切换到"新 cache" |
| 失败时清除 draft，不发布结构化字段 | customer content policy 无法撤回已显示的 summary token，但必须阻止失败结果进入 cache |
| cache hit 直接 completed（无 delta） | 不人工切片伪造流式；缓存命中本身就是瞬时返回 |
| fetch 而非 EventSource | 需要 POST body / 自定义 headers / AbortSignal 取消，EventSource 均不支持 |
| hijack reply.raw 而非 Fastify SSE 插件 | 直接控制背压（drain）、headers（X-Accel-Buffering）、断连取消链路 |

### 相关文件

| 模块 | 文件路径 | 职责 |
|------|----------|------|
| **SSE 事件契约** | `packages/shared/src/schemas/brief-stream.ts` | BriefStreamEvent Zod schema（前后端共用） |
| **summary 增量提取** | `packages/agent-core/src/output/streaming-summary-extractor.ts` | @streamparser/json 增量解析，只释放 `$.summary` |
| **Agent stream 入口** | `packages/agent-core/src/executor/create-agent.ts` | HealthAgent.stream()，LangChain chunk → 字符串 |
| **Runtime delta 回调** | `packages/agent-core/src/runtime/agent-runtime.ts` | onSummaryDelta 透传，signal 取消 |
| **Orchestrator streaming** | `apps/agent-api/src/services/ai-orchestrator.ts` | cache/signal/timing 编排，包装 onSummaryDelta 计时 |
| **SSE route** | `apps/agent-api/src/modules/ai/routes.ts` | POST /ai/morning-brief/stream，hijack + SseWriter |
| **SSE writer** | `apps/agent-api/src/utils/sse-writer.ts` | 帧序列化 + 背压 + exactly-one-terminal 守卫 |
| **Web SSE client** | `apps/web/src/lib/brief-stream-client.ts` | fetch ReadableStream + eventsource-parser + 状态机 |
| **draft store** | `apps/web/src/stores/brief-stream.store.ts` | profile/request scoped provisional summary |
| **首页 hook** | `apps/web/src/hooks/use-ai-query.ts` | runBriefStream 生命周期管理（begin/append/complete/fail） |

### 运维观测

日志记录流式计时指标，不记录 delta 文本、完整模型正文或 secret：

- `llmFirstTokenMs`：从 agent 开始到首个 summary delta 的时延（TTFT）
- `streamChunkCount`：onSummaryDelta 被调用的总次数
- `streamDurationMs`：从 agent 开始到 executeAgent 返回的总时长

cache hit 时这三个字段均为 undefined（`cacheHit: true` 替代）。

### 部署要求

生产反向代理必须满足：

- `Content-Type: text/event-stream`（不被中间层改写）
- chunked transfer encoding（不缓冲完整 response 后才 flush）
- `Cache-Control: no-transform`（禁止中间层转换/压缩）
- `X-Accel-Buffering: no`（nginx 显式禁用缓冲）

上线门槛：真实 MoreCode GPT-5.6 probe 产生至少 2 个非空 content chunk，
首 token 时延明显小于完整生成耗时；不满足则功能不得上线。

---

## 2. 请求入口与数据同步

**入口**: `POST /ai/morning-brief`

```typescript
// apps/agent-api/src/modules/ai/routes.ts
{ profileId: string; pageContext: PageContext; bustCache?: boolean }
```

### 2.1 隐式数据同步

在调用 AI 之前，后端自动执行 `app_open` 同步：

```
pending events > 0  →  overrideStore.performSync(profileId, 'app_open')
                  →  invalidateProfile cache
```

确保简报基于最新的已同步设备数据生成。

### 2.2 缓存策略

- **缓存维度**: `profileId + pageContext + promptVersion + modelVersion + locale`
- **TTL**: 2 小时
- **失效**: `bustCache=true`（手动刷新）或 pending events 同步后自动失效
- **仅缓存**: `HOMEPAGE_SUMMARY` 和 `VIEW_SUMMARY`（`ADVISOR_CHAT` 不缓存）

---

## 3. 上下文构建

### 3.1 AgentContext

`buildAgentContext()` 将 request + deps 组装为运行时上下文，包含：

| 字段 | 来源 | 说明 |
|------|------|------|
| `profile` | ProfileStore | 用户基本信息 + 基线值 |
| `dataWindow` | DailyRecordStore | 时间窗口内的日记录（默认 7 天） |
| `task` | request | 任务类型 + 页面上下文 |
| `signals` | 信号计算 | lowData / overallStatus / anomalies / events |
| `timelineSync` | OverrideStore | 已识别事件 + 同步元数据 |
| `memory` | SessionMemory + AnalyticalMemory | 对话历史 + 派生分析缓存 |
| `locale` | request | 语言 |

### 3.2 TaskContextPacket

`buildTaskContextPacket()` 针对不同 taskType 构建差异化 packet。对 `HOMEPAGE_SUMMARY`，packet 结构为：

```typescript
{
  task: TaskPacket,                    // 任务元数据
  userContext: UserContextPacket,      // 用户画像 + 基线
  dataWindow: DataWindowPacket,        // 时间窗口 + 完整度
  missingData: MissingDataPacket,      // 缺失数据分析
  evidence: EvidenceItem[],            // 可追溯证据链
  visibleCharts: VisibleChartPacket[], // 可见图表摘要
  homepage: HomepageContextPacket {    // ← 首页专属
    recentEvents: RecentEventPacket[],  // 最近 5 条识别事件 + 注入事件
    latest24h: Latest24hPacket,         // 最近一天指标 vs 基线
    trend7d: MetricSummary[],           // 7 天趋势摘要
    rulesInsights: RuleInsightPacket[], // 规则引擎洞察
    suggestedChartTokens: ChartTokenId[] // 建议图表
  }
}
```

#### recentEvents 构建

1. **Timeline 同步事件**: 从 `context.timelineSync.recognizedEvents` 取最近 5 条，按时间倒序排列，每条注册 evidence
2. **注入事件**: 从 `context.signals.events` 解析 `"date | eventType"` 格式，confidence=1，标记 `fromSyncedWindow: false`

#### latest24h 指标计算

从最近一条 DailyRecord 提取，与个人基线对比计算偏差百分比：

| 指标 | 字段 | 基线 | 偏差阈值 |
|------|------|------|----------|
| 睡眠总时长 | `sleep.totalMinutes` | `avgSleepMinutes` | ±20% |
| HRV | `hrv` | `baselines.hrv` | ±20% |
| 静息心率 | `hr[0]` | `restingHR` | ±20% |
| 血氧 | `spo2` | `baselines.spo2` | 绝对阈值（<95 attention, <90 critical） |
| 步数 | `activity.steps` | `avgSteps` | ±20% |
| 压力负荷 | `stress.load` | — | — |

SpO2 特殊：采用绝对临床阈值（<85 严重低氧、<90 低氧血症、<95 偏低），覆盖相对偏差逻辑。

---

## 4. 规则引擎

`evaluateHomepageRules()` 执行 5 条规则，每条规则产生 0~N 个 `InsightSignal`：

| 规则 | 触发条件 | 严重度 | 示例消息 |
|------|----------|--------|----------|
| **HRV 绝对值** | 最新 HRV < 20ms | critical | 心率变异性极低，身体恢复能力严重受阻 |
| **HRV 趋势** | ≥3 条记录，趋势 < -15% | warning | 心率变异性显著下降 |
| **睡眠时长** | < 基线 60% | warning | 睡眠时长严重不足 |
| **睡眠时长** | < 基线 75% | info | 睡眠不足，建议补觉 |
| **深睡比例** | 深睡 / 总睡眠 < 15% | warning | 深睡比例偏低 |
| **血氧** | 均值 < 93% | critical | 血氧饱和度持续偏低 |
| **血氧** | 均值 < 95% | warning | 血氧饱和度略低 |
| **压力** | ≥3 条记录，均值 ≥ 70 | warning | 压力负荷持续偏高 |
| **活动量** | ≥3 条记录，日均步数 < 4000 | info | 建议增加日常活动量 |

### chart token 建议

基于触发的规则 metric 映射图表 token：

- HRV / 压力 → `HRV_7DAYS`
- 睡眠 → `SLEEP_7DAYS`
- 血氧 → `SPO2_7DAYS`
- 活动量 → `ACTIVITY_7DAYS`
- 无触发 + ≥3 条记录 → 默认 `HRV_7DAYS` + `SLEEP_7DAYS`

---

## 5. 实时简报工具编排

**文件**: `packages/agent-core/src/runtime/realtime-brief-tool-orchestrator.ts`

这是首页简报独有的步骤（Step 6.5），在 prompt 构建后、LLM 调用前执行。

### 5.1 架构

```
Policy（触发策略）
    │  when(packet) → boolean
    │  buildInput(packet) → input
    ▼
ToolInvocationPlan
    │  过滤匹配策略 → 排序 by priority desc → 最多 3 个
    ▼
Tool Execution
    │  inputSchema.safeParse → tool.execute → ToolResult
    ▼
Evidence Packet
    │  成功: data + evidenceIds
    │  失败: error message
    ▼
appendRealtimeBriefToolEvidenceToPrompt()
    │  注入到 taskPrompt 末尾的 "## 工具证据包" 区段
```

### 5.2 当前工具：咖啡因睡眠影响估算

**策略 ID**: `caffeine-sleep-impact-on-possible-caffeine`
**触发条件**: packet.task.type === `homepage_summary` 且 recentEvents 中存在 `possible_caffeine_intake`
**优先级**: 80

**计算逻辑**:

```
半衰期 = 5h（固定默认值）
消除速率常数 k = ln(2) / 5 = 0.139
距入睡小时数 = (targetSleepTime - eventStart) / 3600000
剩余比例 = exp(-k × hoursUntilSleep)

风险等级:
  < 25%  → low
  25-50% → moderate
  > 50%  → high
```

**输出注入到 prompt 的格式**:

```markdown
## 工具证据包
以下结果来自实时简报 Tool Orchestrator...

### estimateCaffeineSleepImpact
- policyId: caffeine-sleep-impact-on-possible-caffeine
- status: success
- priority: 80
- 事件: possible_caffeine_intake, start=..., confidence=72%
- 估算咖啡因剩余比例: 38%
- 估算依据: physiological_proxy, measuredChemically=false
- 睡眠影响等级: moderate
- 支持型建议: ...
- 写作要求: 如果 summary 提到该结果，必须说"估算咖啡因剩余比例"...
```

### 5.3 扩展新工具

添加新工具只需：

1. 实现 `ToolDefinition<Input, Output>` 接口
2. 注册到 `createDefaultRealtimeBriefTools()`
3. 添加 `RealtimeBriefToolTriggerPolicy` 到 `createDefaultRealtimeBriefToolPolicies()`
4. 在 `renderSuccessfulToolEvidence()` 中添加渲染逻辑

---

## 6. Prompt 构建

**文件**: `packages/agent-core/src/prompts/task-builder.ts`

Task prompt 由以下区段依次拼接：

```
1. 模板内容            ← data/sandbox/prompts/homepage/template.md
2. 语言风格            ← data/sandbox/prompts/homepage/style/zh.md
3. 任务约束            ← 长度限制、输出格式、模拟时间
4. TaskContextPacket 渲染 ← renderTaskContextPacket() 序列化为文本
5. 预处理信号          ← 规则引擎 insights
6. 建议关联图表        ← suggestedChartTokens
7. 持久化记忆          ← 用户已确认的事实
8. 派生分析缓存        ← 上次首页摘要 / 视图总结 / 规则分析
9. 输出字段说明        ← source / statusColor 含义
10. 输出格式           ← JSON 示例（含 summary \\n\\n 三段示例 + actions 结构）
11. 工具证据包         ← 实时简报工具编排结果（仅 HOMEPAGE_SUMMARY）
```

### 模板核心指令

`template.md` 定义了简报的严格结构：

**三段式 summary（必须用 `\n\n` 分隔）**:
- 段落 1：以用户姓名 + 逗号开头，与最高权重事件相关的即时观察
- 段落 2：围绕最高权重事件展开分析，引用具体数据交叉验证
- 段落 3：1-2 个具体建议 + 引导用户做出选择

**statusColor 规则**:
- `good`：事件与身体状态匹配良好
- `warning`：事件与 24h 恢复状态轻度冲突 / 单一指标偏离
- `error`：事件加重身体负担且恢复指标严重不足

**数据引用红线**:
- 咖啡因/酒精必须用概率性语言（"可能"、"倾向于"）
- 不得编造半衰期、百分比损失、步数缺口
- 工具证据优先使用，缺失时不得自行补造
- 禁止泛泛建议、医学诊断、markdown 格式

---

## 7. 输出处理流水线

```
LLM 原始输出
    │
    ▼
parseAgentResponse()           → 解析 JSON，提取 summary/actions/chartTokens/statusColor
    │
    ▼
validateChartTokens()          → 过滤非法 chartTokens，只保留白名单
    │
    ▼
cleanSafetyIssues()            → 清除缺失数据编造内容
    │
    ▼
verifyOutput()                 → 确定性验证（生成 VerificationReport，不阻断）
    │
    ▼
writeSessionMemory()           → 写入对话历史
    │
    ▼
writeAnalyticalMemory()        → 缓存摘要供后续请求引用
    │
    ▼
返回 AgentResponseEnvelope
```

### 最终输出结构

```typescript
interface AgentResponseEnvelope {
  source: 'llm' | 'fallback' | 'planner' | 'sync-gate';
  statusColor: 'good' | 'warning' | 'error';
  summary: string;              // 220-420 字，3 段 \n\n 分隔
  actions: ActionOption[];      // 2-3 个行动方案
  actionsSectionTitle?: string; // actions 区段标题（建议式用语）
  chartTokens: string[];        // 校验后的图表 token
  microTips?: string[];         // 可选微贴士
  meta: {
    taskType: string;
    pageContext: PageContext;
    finishReason: 'complete' | 'timeout' | 'fallback' | 'cached';
    sessionId?: string;
  };
}
```

---

## 8. Fallback 与降级

| 场景 | finishReason | 行为 |
|------|-------------|------|
| 数据不足（lowData 信号） | `fallback` | 跳过 LLM，直接返回 fallback 模板 |
| LLM 超时 | `timeout` | 返回 fallback + timeout 标记 |
| 输出解析失败 | `fallback` | 返回 fallback 模板 |
| Provider 异常 | `fallback` | 返回 fallback 模板 |
| 缓存命中 | `cached` | 直接返回缓存结果（meta 中标记） |

---

## 9. 事件检测管线（上游依赖）

简报的事件数据来自上游的事件识别管线：

```
设备原始数据（timeline scripts）
    │
    ▼
event-recognition.ts :: recognizeEvents()
    │  ├── 段落分类（睡眠、运动、用餐等）
    │  ├── 咖啡因检测（caffeine-detector.ts）
    │  │    基线窗口: t0-60min ~ t0-15min
    │  │    响应窗口: t0+15min ~ t0+120min
    │  │    指标: HR↑≥8bpm, RMSSD↓≥15%, 压力↑≥10, 低活动量
    │  │    置信度阈值: ≥0.72
    │  └── 酒精检测（alcohol-detector.ts）
    │
    ▼
OverrideStore（pending → synced）
    │
    ▼
AgentContext.timelineSync.recognizedEvents
    │
    ▼
context-packet-builder :: buildRecentEvents()
    │
    ▼
TaskContextPacket.homepage.recentEvents
```

---

## 10. 关键设计决策

| 决策 | 原因 |
|------|------|
| 工具编排先于 LLM 调用 | 工具产生的证据需要作为 prompt 的一部分输入 LLM，而非 ReAct 循环中实时调用 |
| 缓存在 orchestrator 层而非 runtime 层 | 缓存是请求级别的关注点，runtime 保持纯函数式 |
| Evidence 追踪链 | 每个 data point 都有 evidenceId，支持输出可审计性 |
| 确定性验证不阻断 | verifier 生成报告用于异步观测，不影响用户响应延迟 |
| SpO2 绝对阈值优先于相对偏差 | 血氧有明确临床阈值，相对偏差可能掩盖真实风险 |
| summary 严格三段 + 纯文本 | 保证前端卡片渲染一致性和可预测的阅读体验 |
