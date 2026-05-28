# Homepage Realtime Brief 优化设计

> 日期：2026-05-28
> 状态：待拆分实施计划

## 概述

本设计用于把首页实时简报从“基于指标窗口的通用健康总结”推进到“基于实时事件的连续生理叙事”。

`docs/profile-case-sample.xlsx` 中的 good example 展示了一个更理想的交互体验：用户每发生一个关键事件，系统不只是复述指标，而是解释这个事件正在如何改变身体状态，并给出下一步行动选择。核心范式是：

```text
最近事件
→ 事件内生理特征
→ 与 24h 恢复背景、7d 趋势交叉
→ 得到当前身体张力
→ 输出具体建议和 actions
```

当前代码已经具备 `summary + actions`、`TaskContextPacket`、首页工具编排、结构化输出解析和前端渲染能力。本轮优化不推翻现有架构，而是在现有链路中补齐“事件生理语义层”和“输出质量约束”，让 LLM 有足够的结构化信息写出稳定、可泛化的实时简报。

## 背景与现状

### 样例结论

Excel case example 包含两层参考：

1. **人群画像与传感器解释**
   - 不同 profile 的 PPG、六轴加速度、NTC 温度、SpO2 表现不同。
   - 回复需要结合用户画像判断同一个指标变化的含义，例如运动人群的低静息心率和久坐人群的高静息心率不应被同样解释。

2. **连续事件下的实时简报**
   - 事件包括睡眠、早餐、咖啡+专注、午餐、久坐工作、休息、训练、饮酒晚餐、准备入睡等。
   - good example 每条都包含 `AI Insight` 和 2-3 个 `Action Suggestion`。
   - 优秀回复不是硬模板，而是围绕当前事件形成一段“身体为什么这样反应、现在该做什么”的叙事。

### 当前实现

当前首页简报链路如下：

```text
POST /ai/morning-brief
→ AiOrchestrator 缓存与调度
→ executeAgent()
→ buildAgentContext()
→ low-data fallback
→ evaluateHomepageRules()
→ buildTaskContextPacket()
→ buildSystemPrompt() + buildTaskPrompt()
→ RealtimeBriefToolOrchestrator
→ LLM
→ parseAgentResponse()
→ chart token 校验
→ cleanSafetyIssues()
→ verifyOutput()
→ 写回 memory/cache
→ MorningBriefCard 渲染
```

重要文件：

| 模块 | 文件 | 当前职责 |
| --- | --- | --- |
| Runtime | `packages/agent-core/src/runtime/agent-runtime.ts` | 首页简报主流程 |
| Packet 构建 | `packages/agent-core/src/context/context-packet-builder.ts` | 构建 recentEvents / latest24h / trend7d |
| Packet 类型 | `packages/agent-core/src/context/context-packet.ts` | 定义 TaskContextPacket |
| Prompt 渲染 | `packages/agent-core/src/prompts/context-packet-renderer.ts` | 将 packet 转为 prompt 文本 |
| Prompt 模板 | `data/sandbox/prompts/homepage/template.md` | 首页简报写作约束 |
| 风格模板 | `data/sandbox/prompts/homepage/style/zh.md` | 中文语气、比喻、actions 分工 |
| Tool 编排 | `packages/agent-core/src/runtime/realtime-brief-tool-orchestrator.ts` | 事件驱动工具调用 |
| 输出解析 | `packages/agent-core/src/output/response-parser.ts` | 解析 summary/actions |
| 输出验证 | `packages/agent-core/src/output/verifier.ts` | 确定性验证报告 |
| 前端渲染 | `apps/web/src/components/homepage/MorningBriefCard.tsx` | 渲染 summary/actions |

### 当前主要缺口

1. **recentEvents 太薄**
   - 当前事件只包含 `type/start/end/duration/confidence/syncState`。
   - LLM 看不到事件内的心率峰值、恢复斜率、静止时长、皮温变化、血氧波动、运动强度等关键信息。

2. **缺少事件生理语义层**
   - LLM 需要自己把事件、24h 指标、7d 趋势拼成判断。
   - 这会导致回复不稳定：有时像流水账，有时泛泛建议，有时过度引用 baseline。

3. **prompt 残留 baseline 诱导**
   - 活跃模板仍出现 “baseline 对比”“baseline 偏差”等字样。
   - 目标是内部可用 baseline，用户可见和 prompt 强诱导层统一使用“平时水平/个人参考水平/通常水平”。

4. **actions 只有 schema 校验**
   - parser 只校验字段完整。
   - 没有确定性校验 action 是否具体、是否重复刚完成的事件、是否承诺未实现能力。

5. **eval case 与样例范式覆盖不足**
   - 现有 homepage eval 覆盖基础状态，但对“连续事件实时反馈”的样例场景不足。
   - 后续改 prompt 或 packet 时，缺少针对写作范式的回归保护。

## 产品目标

优化完成后，首页实时简报应满足：

1. **事件优先**
   - 有最近事件时，summary 主体围绕最近 1-2 个核心事件。
   - 24h 状态和 7d 趋势只作为交叉验证，不抢占主体。

2. **解释身体张力**
   - 每条简报回答“为什么现在要注意这件事”。
   - 示例：专注工作不是只说“工作了 2 小时”，而是解释长时间静止、HRV 压缩和心率滞留如何提示认知负荷累积。

3. **建议具体可执行**
   - 建议包含动作、时长或时间点。
   - 禁止“多喝水”“注意休息”“保持规律”等泛泛建议。

4. **actions 真实可信**
   - 每次尽量输出 2-3 个 actions。
   - `aiPromise` 只能承诺当前产品真实支持的行为。若只能记录选择，就明确写“我会记录你的选择并用于本次建议上下文”。

5. **数据忠实**
   - 只引用上下文明确提供或上游算法明确计算的数字。
   - 不为了贴近样例编造半衰期、深睡损失比例、步数缺口、提醒时间、代谢斜率。

6. **术语转译**
   - 内部可以继续使用 baseline。
   - prompt 与用户可见文案不使用 “baseline / 基线 / 基准线 / 偏离基线” 这类分析术语。

## 非目标

本轮不做：

- 重写传感器事件识别算法。
- 引入医学诊断、治疗建议或药物建议。
- 把首页实时简报改成开放式 ReAct 流程。
- 做长期个性化学习或跨用户模型训练。
- 添加真实提醒、实时监控、模式切换等尚未实现的产品能力。
- 通过输出后正则替换清洗文案问题。
- 用硬编码模板替代通用事件生理算法。

## 设计原则

### 1. 从源头建模，不做文案补丁

如果 LLM 写不出好简报，优先检查输入信息是否足够结构化。不要用正则后处理、关键词替换、字符串拼接去“修文案”。这些方式会掩盖根因，也无法泛化到新事件。

### 2. 事件解释必须由可追溯数据支持

每个高影响判断都应该能追溯到：

- recent event
- latest24h metric
- trend7d metric
- rules insight
- tool evidence

如果证据不足，文案应该明确说数据不足，而不是补出一个看似自然的结论。

### 3. LLM 负责表达，代码负责结构

代码不应生成完整自然语言回复，但应该给 LLM 提供稳定的结构化中间语义：

- 事件类型和时间
- 事件内生理特征
- 与恢复背景的冲突或匹配
- 建议方向
- actions 候选约束

LLM 负责把这些语义写成自然、有温度的中文。

### 4. 可扩展事件类型

设计不能只服务 Excel 中已出现的事件。至少要能扩展到：

- 睡眠结束
- 餐后
- 专注/久坐
- 运动后
- 压力上升
- 可能咖啡因摄入
- 可能饮酒
- 准备入睡
- timeline pending
- 数据缺失

## 方案选择

### 方案 A：只改 prompt

做法：继续使用当前 packet，只强化 `homepage/template.md` 和 style guide。

优点：

- 改动小。
- 可快速提升语气和结构。

缺点：

- LLM 仍缺少事件内生理特征。
- 容易泛泛建议或自行推断。
- 对不同事件无法稳定泛化。

结论：不推荐作为主方案，只适合做配套清理。

### 方案 B：为每类事件写硬编码模板

做法：为睡眠、早餐、工作、运动、饮酒等事件写固定模板，再让 LLM 改写。

优点：

- 短期输出稳定。
- 对 demo 样例还原度高。

缺点：

- 不符合通用算法原则。
- 新事件组合会快速爆炸。
- 容易把数据解释写死，产生错误建议。

结论：不推荐。

### 方案 C：新增事件生理语义层

做法：在 `TaskContextPacket` 中新增首页专属的 `eventInsights` 结构。代码基于已有 daily records、timeline events、profile baselines、rules 和 tool evidence 计算结构化语义，再由 prompt 渲染给 LLM。

优点：

- 保留 LLM 自然表达能力。
- 关键判断由代码结构化，稳定可测。
- 可扩展到新事件类型。
- 可通过 eval 和 verifier 约束输出质量。

缺点：

- 需要新增一层类型、构建器、渲染器和测试。
- 第一版需要谨慎定义字段，避免过度建模。

结论：推荐采用方案 C，并配套做 prompt 清理、输出验证和 eval 扩展。

## 推荐架构

新增一个首页事件语义层，位于 `buildTaskContextPacket()` 和 `renderTaskContextPacket()` 之间。

```text
AgentContext
  ├─ timelineSync.recognizedEvents
  ├─ dataWindow.records
  ├─ profile.baselines
  └─ rulesResult

buildHomepagePacket()
  ├─ recentEvents
  ├─ latest24h
  ├─ trend7d
  ├─ rulesInsights
  └─ eventInsights       ← 新增

renderHomepage()
  ├─ 渲染最近事件
  ├─ 渲染 eventInsights  ← 新增主输入
  ├─ 压缩 latest24h/trend7d
  └─ 渲染 rules/chart hints

LLM
  └─ 输出 summary + actions + actionsSectionTitle
```

## 数据模型设计

### HomepageEventInsight

新增首页专属结构：

```ts
export interface HomepageEventInsight {
  eventId: string;
  eventType: string;
  priority: 'high' | 'medium' | 'low';
  timeRelation: string;
  headline: string;
  physiology: EventPhysiologySummary[];
  recoveryContext: RecoveryContextSummary[];
  tension: EventBodyTension;
  recommendedFocus: RecommendedFocus[];
  actionIntents: ActionIntentCandidate[];
  evidenceIds: string[];
}
```

字段说明：

| 字段 | 说明 |
| --- | --- |
| `eventId` | 对应 recent event 的稳定 id |
| `eventType` | 事件类型，如 `sleep`, `work_focus`, `work_sedentary`, `hiit`, `possible_alcohol_intake` |
| `priority` | 给 LLM 的篇幅权重 |
| `timeRelation` | 与当前时间的关系，如 “刚结束 12 min” |
| `headline` | 事件级摘要，不是最终用户文案 |
| `physiology` | 事件内生理特征 |
| `recoveryContext` | 与 24h / 7d 背景的交叉点 |
| `tension` | 当前身体张力判断 |
| `recommendedFocus` | 建议方向 |
| `actionIntents` | actions 候选意图 |
| `evidenceIds` | 可追溯证据 |

### EventPhysiologySummary

```ts
export interface EventPhysiologySummary {
  metric:
    | 'heart_rate'
    | 'hrv'
    | 'spo2'
    | 'skin_temperature'
    | 'motion'
    | 'sleep'
    | 'stress'
    | 'activity';
  value?: number;
  unit?: string;
  qualifier: 'low' | 'normal' | 'elevated' | 'compressed' | 'volatile' | 'recovering' | 'missing';
  interpretation: string;
  evidenceId?: string;
}
```

设计约束：

- `interpretation` 是给 LLM 的语义，不是完整用户文案。
- `value` 只能来自已有数据或上游显式计算。
- 没有数据时使用 `qualifier: 'missing'`，不要补值。

### RecoveryContextSummary

```ts
export interface RecoveryContextSummary {
  source: 'latest24h' | 'trend7d' | 'profile';
  metric: string;
  relation: 'supports' | 'conflicts' | 'neutral' | 'missing';
  summary: string;
  evidenceId?: string;
}
```

示例：

```ts
{
  source: 'latest24h',
  metric: 'sleep_total',
  relation: 'supports',
  summary: '昨晚睡眠时长充足，可作为上午高强度认知输出的恢复底子',
  evidenceId: 'latest24h_sleep_total_2026-04-21'
}
```

### EventBodyTension

```ts
export interface EventBodyTension {
  level: 'positive' | 'watch' | 'high' | 'critical';
  summary: string;
  reason: string;
}
```

含义：

| level | 用途 |
| --- | --- |
| `positive` | 事件与身体状态匹配，适合延续当前计划 |
| `watch` | 有轻度冲突，需要微调 |
| `high` | 负荷明显，建议降级或重置 |
| `critical` | 出现严重异常或安全边界，建议停止高负荷并就医/观察 |

### RecommendedFocus

```ts
export interface RecommendedFocus {
  category:
    | 'movement_reset'
    | 'breathing_reset'
    | 'nutrition'
    | 'hydration'
    | 'training_adjustment'
    | 'sleep_protection'
    | 'posture'
    | 'data_quality'
    | 'medical_attention';
  action: string;
  durationMin?: number;
  timing?: string;
  rationale: string;
}
```

要求：

- `action` 必须是具体动作。
- `durationMin` 或 `timing` 至少有一个存在，除非 category 是 `medical_attention`。
- `rationale` 必须解释为什么适合当前事件张力。

### ActionIntentCandidate

```ts
export interface ActionIntentCandidate {
  id: string;
  emoji: string;
  title: string;
  description: string;
  aiPromise: string;
  productCapability: 'record_choice' | 'contextual_followup';
}
```

当前阶段只允许：

- `record_choice`
- `contextual_followup`

不允许：

- `start_timer`
- `send_reminder`
- `switch_mode`
- `live_monitoring`

这些能力等产品真实支持后再扩展。

## 事件语义生成策略

### 输入来源

第一版只使用当前仓库已有信息：

- `context.timelineSync.recognizedEvents`
- `context.signals.events`
- `context.dataWindow.records`
- `context.profile.baselines`
- `rulesResult.insights`
- `packet.latest24h`
- `packet.trend7d`
- 实时简报 tool evidence

不新增外部依赖，不引入模型推断，不读取 Excel 作为运行时数据。

### 事件类型归一化

新增纯函数把 timeline event type 归一化为首页语义类型：

```ts
type HomepageSemanticEventType =
  | 'sleep_end'
  | 'meal'
  | 'work_focus'
  | 'work_sedentary'
  | 'rest_break'
  | 'cardio_workout'
  | 'hiit_workout'
  | 'possible_caffeine_intake'
  | 'possible_alcohol_intake'
  | 'stress_spike'
  | 'prepare_sleep'
  | 'unknown';
```

规则：

- 不用字符串猜测用户没有明确发生的事件。
- 只能从已识别 event type、activity segment type 或注入事件中映射。
- 未识别类型使用 `unknown`，只做保守摘要。

### 生理特征提取

第一版按事件时间窗口从 daily/timeline 数据中提取能稳定获得的摘要：

| 事件类型 | 可提取特征 |
| --- | --- |
| 睡眠结束 | 总睡眠、深睡、REM、静息心率、HRV、SpO2 |
| 餐后 | 事件时间、最近心率/HRV 状态、活动建议窗口 |
| 专注/久坐 | 静止时长、心率状态、HRV 状态、压力负荷 |
| 运动后 | 持续时间、运动类型、心率状态、恢复建议 |
| 咖啡因 | 事件置信度、工具估算结果 |
| 饮酒 | 心率/HRV/温度/睡眠保护建议 |
| 准备入睡 | 当前心率/HRV/温度、睡眠风险 |
| 数据缺失 | 缺失范围、影响、佩戴/同步建议 |

如果当前数据源无法提供某项特征，不补值；只在 `missingData` 或 `physiology.qualifier='missing'` 中表达。

### 身体张力计算

张力不是医学判断，而是对“事件是否与恢复状态匹配”的产品级分级。

第一版使用确定性规则：

- 睡眠充足 + HRV 稳定 + 最新事件为运动准备/上午工作 → `positive`
- 最近事件为久坐/专注，且 HRV attention 或 stress warning → `watch` 或 `high`
- 最近事件为高强度运动，且睡眠不足/HRV attention → `high`
- 可能饮酒/咖啡因出现在晚间且工具提示睡眠影响 → `watch` 或 `high`
- SpO2 critical 或规则 critical → `critical`

这些规则应独立于自然语言 prompt，并有单元测试覆盖。

## Prompt 设计

### 活跃 prompt 清理

需要清理：

- `data/sandbox/prompts/homepage/template.md`
- `data/sandbox/prompts/homepage/style/zh.md`
- `packages/agent-core/src/prompts/task-builder.ts` 中 homepage JSON 示例
- `packages/agent-core/src/prompts/context-packet-renderer.ts` 的首页渲染文案

要求：

1. 不再使用 `baseline`、`基线`、`基准线` 作为给 LLM 的显性写作术语。
2. 将“baseline 对比”改为“个人参考水平 / 平时水平 / 通常水平”。
3. 输出示例移除 `microTips` 的主导地位，强调 `summary + actions + actionsSectionTitle`。
4. 英文示例也不得出现会污染中文输出的旧表达，例如 “returned to baseline”。

### eventInsights 渲染

在 `renderHomepage()` 中新增区段：

```md
## 事件生理摘要（优先引用）
- [high] work_focus, 刚结束约 10 min
  - 事件摘要：连续专注 120 min，身体保持低位移
  - 生理特征：heart_rate elevated 72bpm；HRV compressed 55ms
  - 恢复背景：昨晚睡眠充足，支持上午高认知输出
  - 当前张力：watch，认知负荷已累积，需要短暂重置
  - 建议方向：movement_reset 10 min；nutrition 午餐选择清淡蛋白
  - actions 候选：短走重置 / 午餐蓄能 / 闭目休息
```

Prompt 明确要求：

- `eventInsights` 优先于 raw latest24h 指标。
- raw metrics 只作证据，不逐项展开。
- summary 不复制 `eventInsights` 的列表结构，而是自然转写。
- actions 应优先从 `actionIntents` 转写，不自行承诺新能力。

## 输出协议与校验

### AgentResponseEnvelope

当前结构可继续使用：

```ts
interface AgentResponseEnvelope {
  summary: string;
  source: string;
  statusColor: 'good' | 'warning' | 'error';
  chartTokens: ChartTokenId[];
  microTips?: string[];
  actions?: ActionOption[];
  actionsSectionTitle?: string;
  meta: ...
}
```

本轮不新增前端必需字段，避免 UI 迁移成本。

### Parser

`parseAgentResponse()` 保持字段完整性校验。新增校验不放在 parser 中，避免 parser 承担业务质量规则。

### Verifier

在 `verifyOutput()` 或独立 helper 中新增 homepage action 质量验证：

1. homepage LLM 输出若 `source=llm`，建议至少 2 个 actions。
2. action title 不使用命令式泛词，如“改善睡眠”“保持健康”。
3. action description 必须包含具体动作，且至少包含时长、时间点或场景之一。
4. action aiPromise 不得包含未实现能力：
   - “我会提醒”
   - “我会开启模式”
   - “我会实时监控”
   - “我会调整监测逻辑”
5. action 不应重复刚完成的事件类型：
   - 刚完成高强度运动，不建议继续高强度运动。
   - 刚完成休息，不建议再做同类型休息作为唯一选项。
6. summary 和 actions 不得包含 `baseline / 基线 / 基准线 / 偏离基线`。

这些校验先作为 verification report violation，不直接硬 fallback。是否升级为 hard failure 由后续 eval 结果决定。

## Eval 设计

新增或扩展 homepage eval cases，覆盖 Excel 样例中的关键事件范式：

| Case | 目标 |
| --- | --- |
| `homepage-sleep-recovery-prime` | 睡眠恢复良好，输出上午高效窗口和训练绿灯 |
| `homepage-breakfast-metabolic-transition` | 餐后代谢切换，建议轻活动和咖啡时机 |
| `homepage-focus-caffeine-reset` | 咖啡+专注后，建议认知/身体重置 |
| `homepage-sedentary-fatigue-pivot` | 久坐工作后，调整晚间训练计划 |
| `homepage-post-workout-recovery` | 运动后补给、降温、睡眠保护 |
| `homepage-alcohol-dinner-sleep-risk` | 晚餐+饮酒后，解释睡眠风险和降负荷建议 |
| `homepage-pre-sleep-cooling` | 准备入睡时，解释心率缓冲和温度干预 |
| `homepage-data-missing-event` | 数据不足时不编造事件和指标 |

每个 case 至少验证：

- summary 聚焦最近事件。
- 不出现 baseline 术语。
- 引用数字均来自上下文。
- actions 数量与字段完整。
- actions 不承诺未实现能力。
- statusColor 与张力等级一致。
- chartTokens 来自允许集合。

## 迁移顺序

建议按以下顺序拆任务：

1. **Prompt 残留清理**
   - 清理活跃 homepage template、style、task-builder 示例中的 baseline 诱导和 microTips 旧示例。
   - 这是低风险独立任务。

2. **事件语义类型与构建器**
   - 在 `context-packet.ts` 中新增类型。
   - 新建首页事件语义构建 helper。
   - 单元测试覆盖语义类型映射和张力计算。

3. **Packet 接入与渲染**
   - `buildHomepagePacket()` 增加 `eventInsights`。
   - `renderHomepage()` 增加“事件生理摘要”区段。
   - 测试 prompt 渲染不含 baseline 术语。

4. **Action 候选与约束**
   - 从 `RecommendedFocus` 生成 `ActionIntentCandidate`。
   - Prompt 要求 LLM 优先转写候选。
   - 不把 action 文案写死在业务规则中。

5. **Verifier 扩展**
   - 增加 homepage action 质量规则。
   - 增加 baseline 术语禁用规则。
   - 先进入 report，不立即中断生产链路。

6. **Eval 扩展**
   - 将 Excel 中代表性事件转为 eval cases。
   - 更新 scorer 让 actions 参与匹配。

7. **端到端验证**
   - 跑 agent-core 单测。
   - 跑 homepage eval。
   - 手动打开首页验证卡片分段和 actions 渲染。

## 测试策略

### 单元测试

覆盖：

- 事件类型归一化。
- 每类事件的 `HomepageEventInsight` 构建。
- `EventBodyTension` 分级。
- `ActionIntentCandidate` 能力边界。
- `renderHomepage()` 的 eventInsights 渲染。
- prompt 中不出现禁用 baseline 术语。

### 集成测试

覆盖：

- `executeAgent()` 对 homepage_summary 仍能完成主流程。
- 有 caffeine event 时，tool evidence 与 eventInsights 不冲突。
- parser 能接受 actionsSectionTitle/actions。
- verifier 能报告 action 质量问题。

### Eval

覆盖：

- 样例事件范式。
- 缺失数据。
- timeline pending。
- possible caffeine/alcohol 的概率性表达。
- safety boundary。

## 风险与对策

| 风险 | 影响 | 对策 |
| --- | --- | --- |
| eventInsights 字段过多 | prompt 变长，LLM 注意力下降 | 只渲染最近 1-2 个高优先级事件，raw metrics 压缩 |
| 语义层变成硬模板 | 泛化差 | 语义字段只描述判断和建议方向，不生成完整用户文案 |
| action 候选过度承诺 | 用户看到未实现能力 | `productCapability` 限制 + verifier 检查禁用承诺 |
| baseline 术语反复出现 | 用户文案工程感强 | prompt 源头清理 + verifier/eval 双重约束 |
| 数据不足时 LLM 编造 | 健康建议不可信 | missingData 明确渲染 + 禁止补值 + eval 覆盖 |
| 与现有 caffeine tool 重叠 | prompt 信息冲突 | tool evidence 只作为 eventInsights 的证据来源，不让两套结论并列竞争 |

## 验收标准

技术验收：

- `HomepageContextPacket` 包含可测试的事件语义结构。
- 首页 prompt 渲染中不包含用户可见诱导术语 `baseline / 基线 / 基准线 / 偏离基线`。
- 首页 LLM 输出协议继续兼容现有前端。
- verifier 能报告 action 质量问题和禁用术语问题。
- 新增 homepage eval cases 能覆盖至少 6 类代表事件。

产品验收：

- 有最近事件时，summary 第一段明确切入最近事件。
- summary 能解释“事件为什么影响当前身体状态”。
- 建议具体，有动作、时长或时间点。
- actions 可选、温和、不命令用户。
- actions 不承诺未实现的提醒、模式切换或实时监控。
- 数字引用可追溯，不编造样例风格数字。

## 后续计划拆分建议

这份设计适合拆成一份实施计划，按以下模块分组：

1. Prompt cleanup
2. Event insight data model
3. Event insight builder
4. Homepage packet renderer
5. Action intent candidates
6. Output verifier
7. Eval cases and scorers
8. End-to-end validation

每个模块都可以独立提交，且应遵循测试先行：先写当前行为或目标行为测试，再实现对应功能。
