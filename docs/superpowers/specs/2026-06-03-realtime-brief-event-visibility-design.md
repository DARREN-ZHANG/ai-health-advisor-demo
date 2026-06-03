# Realtime Brief Event Visibility Design

> 日期：2026-06-03
> 状态：待用户 review

## 背景

首页实时简报已经支持最近事件、事件窗口指标、事件生理摘要和 actions 候选。当前实现为了让 LLM 理解连续事件，会把最近 2 个事件都放入 context，并在 prompt 中说明“默认只聚焦最近的 2 个事件”。

这个策略能提升连续事件分析能力，但也带来两个问题：

1. LLM 容易在用户可见文案里同时提到两个事件。产品期望是：前一事件可参与分析，但 summary 和 actions 只允许明确提及最近一次事件。
2. actions 主要按当前单个事件类型生成，缺少对前一事件的行动抑制。例如用户刚完成运动后，不应再建议“去散步”作为下一步动作。

本设计将“可分析上下文”和“可展示上下文”拆开。LLM 仍可拿到最近两次事件形成更完整判断，但输出契约只允许明确呈现最近一次事件。

## 目标

- 保留最近 2 个事件作为实时简报分析输入。
- 用户可见 summary 只能明确提及最近一次事件。
- 前一事件只能通过当前事件的生理结果间接影响表达，不能出现前一事件类型、时间、动作或“上一轮/之前”等显式回溯。
- actions 需要结合最近两次事件判断，避免建议用户重复刚完成或刚经历过的动作。
- 约束应通过结构化 context、prompt contract、确定性测试和 verifier/eval 保护实现，而不是输出后正则清洗。

## 非目标

- 不重写 timeline 事件识别算法。
- 不把首页简报改成硬编码模板。
- 不用字符串后处理删除前一事件。
- 不引入新的 LLM tool。
- 不改变前端 `MorningBriefCard` 的展示结构。
- 不扩展真实提醒、实时监控或运动计划等尚未实现的产品能力。

## 设计原则

### 分析和展示分离

最近 2 个事件都可以进入 Agent 分析上下文，但每个事件必须带明确展示权限。没有展示权限的事件只能影响当前事件的解释和行动策略，不能被自然语言直接引用。

### 结构化约束优先

前一事件不应只靠 prompt 提醒“不要提”。代码层需要把事件角色、mention policy、transition context 和 action suppression 建模出来，让 renderer 能清楚区分可展示事实和内部分析事实。

### 不做文案补丁

如果输出泄漏了前一事件，应通过 context 契约、prompt、eval 或 verifier 修正源头，而不是在最终 summary 上做关键词替换。

## 推荐方案

采用“事件展示权限 + 事件转场上下文 + actions 抑制策略”的结构化方案。

`recentEvents` 仍保留最多 2 个事件。`eventInsights` 继续逐事件构建，但最近事件标记为可展示，前一事件标记为仅分析。然后新增一个挂在最近事件上的 `transitionContext`，把前一事件对当前事件的影响转写成内部结构化结论。

例如“久坐后有氧运动”：

- Context 可分析：前一事件是长时间静止，当前事件是有氧运动。
- LLM 可用结论：当前运动改善了低活动后的循环激活和疲劳感。
- 用户可见表达：这次运动后身体疲劳值正在消除，活力被重新拉起。
- 禁止表达：刚才久坐、之前坐太久、上一轮事件、久坐后去运动。

## 类型设计

### Mention Policy

在 `HomepageEventInsight` 增加展示权限：

```ts
export interface HomepageEventMentionPolicy {
  summary: 'allowed' | 'forbidden';
  actions: 'allowed' | 'forbidden';
  reason: string;
}
```

规则：

- `eventInsights[0]` 是最近事件，`summary/actions` 均为 `allowed`。
- `eventInsights[1]` 是前一事件，`summary/actions` 均为 `forbidden`。
- 后续如果持续影响事件需要可见表达，必须另行建模为 `ongoingEffect`，不能绕过 mention policy。

### Transition Context

在最近事件 insight 上增加转场上下文：

```ts
export interface HomepageEventTransitionContext {
  currentEventId: string;
  priorEventId?: string;
  priorEventType?: HomepageSemanticEventType;
  relation:
    | 'post_sedentary_activation'
    | 'post_workout_recovery'
    | 'post_intake_sleep_risk'
    | 'same_category_repeat'
    | 'neutral';
  internalFinding: string;
  allowedUserFacingAngle: string;
  forbiddenMentions: string[];
  actionSuppressions: ActionSuppression[];
}
```

字段含义：

- `internalFinding`：给 LLM 的内部分析结论，可包含前一事件类型。
- `allowedUserFacingAngle`：允许转写给用户的角度，只能落在当前事件结果上。
- `forbiddenMentions`：前一事件相关的禁止词和禁止表达方向。
- `actionSuppressions`：用于抑制不合适 action 的结构化规则。

### Action Suppression

新增行动抑制结构：

```ts
export interface ActionSuppression {
  category?: RecommendedFocus['category'];
  interactionType?: string;
  reason: string;
}
```

第一版只需要抑制明确重复动作，不做复杂偏好学习：

- 当前事件是 `cardio_workout` 或 `hiit_workout`：禁止生成新的 `movement_reset` 作为主要 action；允许补水、恢复营养、拉伸、冷身和睡眠保护。
- 当前原始事件是 `walk`，并被语义归一为 `cardio_workout`：禁止“去散步/轻走活动”作为下一步；如需冷身，应使用“低强度冷身拉伸”或“放松腿部”。
- 前一事件是运动类，当前事件不是运动恢复：避免再次建议运动，优先恢复、补水、呼吸或睡眠保护。
- 连续同类事件：禁止建议再次执行同类动作。

## 数据流

### 1. 构建 recentEvents

`buildRecentEvents()` 继续按时间倒序保留最多 2 个事件。这个行为不变。

### 2. 构建 eventInsights

`buildHomepageEventInsights()` 在 map 事件前先计算序列关系：

```text
recentEvents[0] = current displayable event
recentEvents[1] = prior analysis-only event
```

然后：

- 给每个 insight 写入 `mentionPolicy`。
- 只给当前事件写入 `transitionContext`。
- 在 `buildRecommendedFocus()` 之前根据 `transitionContext.actionSuppressions` 调整候选方向。

### 3. 渲染 prompt context

`context-packet-renderer.ts` 需要把首页事件区拆成两个语义区块：

```md
## 当前可提及事件

只包含最近一次事件和它的事件窗口指标。

## 内部分析上下文（禁止显式提及）

包含前一事件派生出的 transitionContext。
这些事实只用于解释当前事件影响，不得在 summary/actions 里直接提及。
```

前一事件不再出现在“最近发生的事件（分析主体）”这种用户可见倾向强的区块里。

### 4. Prompt 模板约束

`data/sandbox/prompts/homepage/template.md` 需要把现有“默认只聚焦最近的 2 个事件”替换为：

- 分析可以参考最近 2 个事件。
- summary 只能明确提及 `当前可提及事件`。
- actions 只能围绕当前事件之后的下一步。
- `内部分析上下文（禁止显式提及）` 只能作为推理依据，不得出现其事件名、时间、动作或“前一次/之前/上一轮”等回溯表达。

## Actions 设计

### 生成入口

将当前签名：

```ts
buildRecommendedFocus(eventType, tension, demoNow, eventStart)
```

调整为对象参数：

```ts
buildRecommendedFocus({
  currentEventType,
  priorEventType,
  tension,
  transitionContext,
  demoNow,
  eventStart,
})
```

这样行动策略可以同时看当前事件和前一事件，但输出仍只围绕当前事件。

### 运动后动作边界

刚做完运动时，默认 actions 应优先：

- 小口补水。
- 补充恢复营养。
- 低强度冷身拉伸。
- 观察心率自然回落。
- 晚间高强度运动后保护睡眠窗口。

刚做完运动时，默认 actions 不应出现：

- 去散步。
- 起身轻走活动。
- 再做一次轻松有氧。
- 继续运动来恢复精神。

如果当前产品仍需要保留“运动后慢走冷身”，必须把它建模为 `post_workout_cooldown`，不要复用 `movement_reset` 或 `micro_short_walk`，避免和“散步建议”混淆。

## 输出约束

### 允许表达

允许把前一事件影响转写成当前事件结果：

- “这次运动让身体从低活跃状态重新被带动起来。”
- “运动后的疲劳感正在回落，活力被重新拉起。”
- “这次恢复动作帮助身体从当前负荷里平稳下来。”

### 禁止表达

禁止在 summary 和 actions 里出现：

- 前一事件类型，例如久坐、专注、进餐、饮酒、咖啡因、上一段运动。
- 前一事件时间，例如刚才、之前、上一轮、前一个事件。
- 前一事件动作链路，例如“久坐后去有氧”“运动后吃饭”“咖啡后专注”。
- 基于前一事件的重复行动建议，例如运动后再建议去散步。

## 验证策略

### 单元测试

新增或更新 `homepage-event-insights.test.ts`：

- `sedentary -> cardio`：当前 cardio insight 有 `transitionContext.relation = post_sedentary_activation`。
- `sedentary -> cardio`：前一 sedentary insight 的 `mentionPolicy.summary = forbidden`。
- `cardio` 当前事件：actions 不包含 `movement_reset`、`micro_short_walk` 或“散步/轻走活动”。
- 连续同类事件：actions 不建议重复同类动作。

新增或更新 `context-packet-renderer.test.ts`：

- 当前事件出现在 `## 当前可提及事件`。
- 前一事件不出现在可提及事件区。
- 前一事件只以 `transitionContext` 形式出现在 `## 内部分析上下文（禁止显式提及）`。

### Eval Case

新增首页 core case：`homepage-sedentary-cardio-visibility.json`。

输入场景：

```text
前一事件：prolonged_sedentary
当前事件：steady_cardio 或 walk
```

期望：

- summary 必须提当前运动后的疲劳/活力/循环变化。
- summary 不得提“久坐”“之前”“上一轮”“刚才坐”等表达。
- actions 不得建议“散步”“轻走活动”。

### Verifier

在确定性验证中增加 forbidden mention leak 检查：

- 读取 `mentionPolicy.summary = forbidden` 的事件。
- 读取当前事件 `transitionContext.forbiddenMentions`。
- 如果 summary 命中这些明确禁止表达，生成 verification warning 或 failure。

这个检查只用于发现契约破坏，不负责修正文案。

## 文件影响

| 文件 | 变更 |
| --- | --- |
| `packages/agent-core/src/context/context-packet.ts` | 增加 mention policy、transition context、action suppression 类型。 |
| `packages/agent-core/src/context/homepage-event-insights.ts` | 计算事件展示权限、事件转场关系和 actions 抑制。 |
| `packages/agent-core/src/prompts/context-packet-renderer.ts` | 拆分当前可提及事件和内部分析上下文。 |
| `data/sandbox/prompts/homepage/template.md` | 修改多事件写作契约和 actions 边界。 |
| `packages/agent-core/src/output/verifier.ts` | 可选增加 forbidden event mention 检查。 |
| `packages/agent-core/src/__tests__/context/homepage-event-insights.test.ts` | 覆盖 mention policy、transition context 和 action suppression。 |
| `packages/agent-core/src/__tests__/prompts/context-packet-renderer.test.ts` | 覆盖 prompt 渲染隔离。 |
| `packages/agent-core/evals/cases/core/homepage/*.json` | 增加连续事件泄漏防护 case。 |

## 迁移顺序

1. 增加类型和 failing tests。
2. 实现 `mentionPolicy` 和基础 `transitionContext`。
3. 改 renderer，把前一事件移入内部分析上下文。
4. 改 `buildRecommendedFocus()`，引入当前/前一事件的 actions 抑制。
5. 更新 homepage prompt 模板。
6. 增加 eval case 和 verifier leak 检查。
7. 跑 agent-core 单元测试和 homepage eval 子集。

## 成功标准

- 连续事件场景下，LLM 能利用前一事件改善当前事件解释。
- summary 只明确提最近一次事件。
- 前一事件不以事件名、时间或动作链路出现在用户可见文案中。
- 用户刚运动完时，actions 不再建议散步或继续运动。
- 所有新增行为都有单元测试或 eval case 覆盖。
- 没有输出后正则清洗或本地文案替换补丁。
