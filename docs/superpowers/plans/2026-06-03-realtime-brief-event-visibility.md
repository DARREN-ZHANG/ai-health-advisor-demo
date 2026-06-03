# Realtime Brief Event Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让首页实时简报可以用最近两次事件做分析，但用户可见 summary 和 actions 只能明确提及最近一次事件，并把 forbidden mention leak 作为 hard violation。

**Architecture:** 在 `HomepageEventInsight` 增加展示权限和转场上下文，`homepage-event-insights.ts` 负责计算当前事件与前一事件的关系和 action 抑制，renderer 将当前可提及事件与内部分析上下文拆成两个 prompt 区块。Verifier 使用 `transitionContext.forbiddenMentions` 做确定性 hard guardrail，eval case 用 fixture 防止 summary/action 泄漏和运动后散步建议复发。

**Tech Stack:** TypeScript, pnpm, Vitest, existing `@health-advisor/agent-core` context / prompt / verifier / eval stack.

---

## Context Summary

设计来源：`docs/superpowers/specs/2026-06-03-realtime-brief-event-visibility-design.md`。

当前实现要点：

- `packages/agent-core/src/context/context-packet-builder.ts` 的 `buildRecentEvents()` 已按时间倒序保留最多 2 个事件，本计划不改这个入口。
- `packages/agent-core/src/context/homepage-event-insights.ts` 当前按 `recentEvents.map()` 逐事件生成 `HomepageEventInsight`，只用 `priority: high | medium` 表示顺序，没有展示权限。
- `packages/agent-core/src/context/homepage-event-insights.ts` 当前 `buildRecommendedFocus(eventType, tension, demoNow, eventStart)` 只看单个事件类型；运动后 hydration 文案包含“轻度走动冷身”，容易被渲染成散步建议。
- `packages/agent-core/src/prompts/context-packet-renderer.ts` 当前同时渲染两个 recent events 到 `## 最近发生的事件（分析主体）`，并在 `## 事件生理摘要（优先引用）` 中完整渲染所有 eventInsights。
- `data/sandbox/prompts/homepage/template.md` 当前明确写着“默认只聚焦最近的 2 个事件”，需要改为“分析可参考最近 2 个事件，但输出只能明确提及当前可提及事件”。
- `packages/agent-core/src/evals/scorers/task-scorer.ts` 已支持 `forbidSummaryPatterns` 和 `forbidActionPatterns`，新增 eval case 不需要扩展 scorer/schema。
- 用户已确认：verifier 的 forbidden mention leak 使用 hard violation。

Repository constraints:

- 所有回复和文档说明使用中文。
- 不使用输出后正则替换、fallback、hack 或局部文案清洗来修复问题。
- 每个任务卡给出 conventional commit 命令；实际执行时尽量按小单元提交。
- 当前工作区已有未提交 `data/sandbox/*` 改动，执行本计划时不要暂存或修改这些既有改动，除非某个任务卡明确要求新增 eval case 文件。

## File Structure

| 文件 | 职责 |
| --- | --- |
| `packages/agent-core/src/context/context-packet.ts` | 定义 `HomepageEventMentionPolicy`、`HomepageEventTransitionContext`、`ActionSuppression`，并挂到 `HomepageEventInsight`。 |
| `packages/agent-core/src/context/homepage-event-insights.ts` | 计算事件展示权限、当前/前一事件转场关系、forbidden mentions、action suppression，并生成过滤后的 action intents。 |
| `packages/agent-core/src/prompts/context-packet-renderer.ts` | 渲染 `## 当前可提及事件` 与 `## 内部分析上下文（禁止显式提及）`，并过滤通用 Evidence Facts 中的前一事件证据。 |
| `data/sandbox/prompts/homepage/template.md` | 更新首页 prompt 的多事件展示契约和 action 边界。 |
| `packages/agent-core/src/output/verifier.ts` | 增加 `homepage:event_visibility:forbidden_mention` hard violation。 |
| `packages/agent-core/src/__tests__/context/homepage-event-insights.test.ts` | 覆盖 mention policy、transition context、运动后 action suppression、连续同类事件。 |
| `packages/agent-core/src/__tests__/prompts/context-packet-renderer.test.ts` | 覆盖 prompt 区块隔离和 forbidden mention 渲染。 |
| `packages/agent-core/src/__tests__/output/verifier.test.ts` | 覆盖 forbidden mention leak hard violation。 |
| `packages/agent-core/evals/cases/core/homepage/homepage-sedentary-cardio-visibility.json` | 新增连续事件 eval case。 |

---

## 模块 1：Context Contract Surface

**目标：** 增加首页事件展示权限和转场上下文类型，让后续业务逻辑有稳定的结构化契约。

**依赖：** 无。

**涉及文件：**
- 修改：`packages/agent-core/src/context/context-packet.ts`
- 测试：`packages/agent-core/src/__tests__/context/homepage-event-insights.test.ts`

**产出：**
- [ ] `HomepageEventInsight` 暴露 `mentionPolicy`。
- [ ] `HomepageEventInsight` 可选暴露 `transitionContext`。
- [ ] `ActionSuppression` 能表达 category、interaction micro event type 和文本 pattern 抑制。

### 任务 1.1：增加事件展示契约类型

**所属模块：** 模块 1 - Context Contract Surface

**目标：** 在 `context-packet.ts` 中定义并挂载展示权限、转场上下文和 action 抑制类型。

**前置条件：**
- 当前分支包含设计文档 `docs/superpowers/specs/2026-06-03-realtime-brief-event-visibility-design.md`。

**涉及文件：**
- 修改：`packages/agent-core/src/context/context-packet.ts`
- 测试：`packages/agent-core/src/__tests__/context/homepage-event-insights.test.ts`

**上下文：**

`HomepageEventInsight` 当前包含：

```ts
export interface HomepageEventInsight {
  eventId: string;
  eventType: HomepageSemanticEventType;
  priority: 'high' | 'medium' | 'low';
  timeRelation: string;
  headline: string;
  eventWindow?: HomepageEventWindowSummary;
  physiology: EventPhysiologySummary[];
  recoveryContext: RecoveryContextSummary[];
  tension: EventBodyTension;
  recommendedFocus: RecommendedFocus[];
  actionIntents: ActionIntentCandidate[];
  evidenceIds: string[];
}
```

本任务只建立类型契约，不实现转场计算。

**实现步骤：**

- [ ] **步骤 1：写入类型契约**

在 `packages/agent-core/src/context/context-packet.ts` 的 `RecommendedFocus` 和 `ActionInteraction` 附近加入：

```ts
export interface HomepageEventMentionPolicy {
  summary: 'allowed' | 'forbidden';
  actions: 'allowed' | 'forbidden';
  reason: string;
}

export interface ActionSuppression {
  category?: RecommendedFocus['category'];
  interactionMicroEventType?: string;
  textPattern?: string;
  reason: string;
}

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

- [ ] **步骤 2：扩展 `HomepageEventInsight`**

在 `HomepageEventInsight` 中加入：

```ts
  mentionPolicy: HomepageEventMentionPolicy;
  transitionContext?: HomepageEventTransitionContext;
```

- [ ] **步骤 3：临时补齐当前构建器返回值以恢复编译**

在 `packages/agent-core/src/context/homepage-event-insights.ts` 的 `buildHomepageEventInsights()` 返回对象里，先加入最小字段：

```ts
      mentionPolicy: index === 0
        ? { summary: 'allowed', actions: 'allowed', reason: 'current_latest_event' }
        : { summary: 'forbidden', actions: 'forbidden', reason: 'prior_event_analysis_only' },
```

此处只负责让类型通过，转场上下文在任务 2.1 实现。

- [ ] **步骤 4：运行类型相关测试**

```bash
pnpm --filter @health-advisor/agent-core test -- src/__tests__/context/homepage-event-insights.test.ts
pnpm --filter @health-advisor/agent-core typecheck
```

预期结果：两个命令都通过。

**验证方式：**

```bash
pnpm --filter @health-advisor/agent-core typecheck
```

预期结果：`@health-advisor/agent-core` TypeScript 编译无错误。

**提交说明：**

```bash
git add packages/agent-core/src/context/context-packet.ts packages/agent-core/src/context/homepage-event-insights.ts
git commit -m "feat(agent-core): add realtime event visibility contract"
```

---

## 模块 2：Event Transition And Action Policy

**目标：** 计算最近事件和前一事件的结构化关系，并用该关系抑制不合适的 action 候选。

**依赖：** 模块 1。

**涉及文件：**
- 修改：`packages/agent-core/src/context/homepage-event-insights.ts`
- 测试：`packages/agent-core/src/__tests__/context/homepage-event-insights.test.ts`

**产出：**
- [ ] `eventInsights[0]` 是可展示事件，带 `transitionContext`。
- [ ] `eventInsights[1]` 是仅分析事件，`mentionPolicy.summary/actions` 均为 `forbidden`。
- [ ] `sedentary -> cardio` 生成 `post_sedentary_activation`。
- [ ] 运动后不生成散步、轻走活动或继续运动 action。

### 任务 2.1：计算 mention policy 和 transition context

**所属模块：** 模块 2 - Event Transition And Action Policy

**目标：** 在 `buildHomepageEventInsights()` 内计算当前/前一事件关系，生成 `transitionContext` 和 forbidden mentions。

**前置条件：**
- 任务 1.1 已完成。

**涉及文件：**
- 修改：`packages/agent-core/src/context/homepage-event-insights.ts`
- 测试：`packages/agent-core/src/__tests__/context/homepage-event-insights.test.ts`

**上下文：**

`buildHomepageEventInsights()` 当前使用：

```ts
return homepage.recentEvents.map((event, index) => {
  const eventType = normalizeHomepageEventType(event.type);
  ...
});
```

需要在 map 前计算 `eventTypes`，让 index 0 事件知道 index 1 的语义类型。

**实现步骤：**

- [ ] **步骤 1：添加失败测试**

在 `packages/agent-core/src/__tests__/context/homepage-event-insights.test.ts` 末尾追加：

```ts
it('marks the latest event displayable and the prior event analysis-only', () => {
  const insights = buildHomepageEventInsights({
    demoNow: '2026-06-01T13:30',
    homepage: makeHomepage({
      recentEvents: [
        {
          recognizedEventId: 're-cardio-1',
          type: 'steady_cardio',
          start: '2026-06-01T13:00',
          end: '2026-06-01T13:30',
          durationMin: 30,
          confidence: 0.92,
          sourceSegmentId: 'seg-cardio-1',
          recognitionEvidence: ['有氧运动'],
          syncState: { lastSyncedMeasuredAt: '2026-06-01T13:30', pendingEventCount: 0, fromSyncedWindow: true },
          evidenceIds: ['event_cardio'],
        },
        {
          recognizedEventId: 're-sedentary-1',
          type: 'prolonged_sedentary',
          start: '2026-06-01T09:00',
          end: '2026-06-01T13:00',
          durationMin: 240,
          confidence: 0.9,
          sourceSegmentId: 'seg-sedentary-1',
          recognitionEvidence: ['久坐'],
          syncState: { lastSyncedMeasuredAt: '2026-06-01T13:30', pendingEventCount: 0, fromSyncedWindow: true },
          evidenceIds: ['event_sedentary'],
        },
      ],
    }),
  });

  expect(insights).toHaveLength(2);
  expect(insights[0]!.mentionPolicy).toEqual({
    summary: 'allowed',
    actions: 'allowed',
    reason: 'current_latest_event',
  });
  expect(insights[1]!.mentionPolicy).toEqual({
    summary: 'forbidden',
    actions: 'forbidden',
    reason: 'prior_event_analysis_only',
  });
  expect(insights[0]!.transitionContext).toEqual(expect.objectContaining({
    priorEventType: 'work_sedentary',
    relation: 'post_sedentary_activation',
  }));
  expect(insights[0]!.transitionContext?.forbiddenMentions).toEqual(expect.arrayContaining([
    '久坐',
    '之前',
    '上一轮',
    '前一个事件',
    '久坐后',
  ]));
});
```

- [ ] **步骤 2：确认测试失败**

```bash
pnpm --filter @health-advisor/agent-core test -- src/__tests__/context/homepage-event-insights.test.ts -t "marks the latest event displayable"
```

预期结果：FAIL，失败原因是 `transitionContext` 尚不存在。

- [ ] **步骤 3：添加临时 action suppression helper**

在 `homepage-event-insights.ts` 中先加入一个临时实现，让本任务可以独立编译通过。任务 2.2 会把这个函数替换成完整实现。

```ts
function buildActionSuppressions(
  _current: HomepageSemanticEventType,
  _prior: HomepageSemanticEventType | undefined,
): ActionSuppression[] {
  return [];
}
```

更新 import：

```ts
  ActionSuppression,
```

- [ ] **步骤 4：添加转场 helper**

在 `homepage-event-insights.ts` 的 `BuildHomepageEventInsightsInput` 后加入：

```ts
interface EventSequenceItem {
  eventId: string;
  rawType: string;
  eventType: HomepageSemanticEventType;
}

function buildMentionPolicy(index: number): HomepageEventInsight['mentionPolicy'] {
  return index === 0
    ? { summary: 'allowed', actions: 'allowed', reason: 'current_latest_event' }
    : { summary: 'forbidden', actions: 'forbidden', reason: 'prior_event_analysis_only' };
}

function buildTransitionContext(
  current: EventSequenceItem,
  prior: EventSequenceItem | undefined,
): HomepageEventInsight['transitionContext'] {
  if (!prior) {
    return {
      currentEventId: current.eventId,
      relation: 'neutral',
      internalFinding: '没有可用的前一事件，当前事件独立解释。',
      allowedUserFacingAngle: '只围绕当前事件解释身体状态。',
      forbiddenMentions: [],
      actionSuppressions: buildActionSuppressions(current.eventType, undefined),
    };
  }

  const relation = classifyTransitionRelation(current.eventType, prior.eventType);
  return {
    currentEventId: current.eventId,
    priorEventId: prior.eventId,
    priorEventType: prior.eventType,
    relation,
    internalFinding: buildInternalFinding(current.eventType, prior.eventType, relation),
    allowedUserFacingAngle: buildAllowedUserFacingAngle(current.eventType, relation),
    forbiddenMentions: buildForbiddenMentions(prior),
    actionSuppressions: buildActionSuppressions(current.eventType, prior.eventType),
  };
}

function classifyTransitionRelation(
  current: HomepageSemanticEventType,
  prior: HomepageSemanticEventType,
): NonNullable<HomepageEventInsight['transitionContext']>['relation'] {
  if (current === prior) {
    return 'same_category_repeat';
  }
  if ((current === 'cardio_workout' || current === 'hiit_workout') && prior === 'work_sedentary') {
    return 'post_sedentary_activation';
  }
  if (prior === 'cardio_workout' || prior === 'hiit_workout') {
    return 'post_workout_recovery';
  }
  if (prior === 'possible_caffeine_intake' || prior === 'possible_alcohol_intake') {
    return 'post_intake_sleep_risk';
  }
  return 'neutral';
}
```

- [ ] **步骤 5：添加文案角度 helper**

继续在同一文件加入：

```ts
function buildInternalFinding(
  current: HomepageSemanticEventType,
  prior: HomepageSemanticEventType,
  relation: NonNullable<HomepageEventInsight['transitionContext']>['relation'],
): string {
  switch (relation) {
    case 'post_sedentary_activation':
      return '前一事件提示低活动和静止负荷，当前运动事件可用于判断循环激活和疲劳回落。';
    case 'post_workout_recovery':
      return '前一事件是运动负荷，当前事件需要优先判断恢复而不是继续追加活动。';
    case 'post_intake_sleep_risk':
      return '前一摄入相关事件可能仍影响神经兴奋度，当前事件建议需要避免增加刺激。';
    case 'same_category_repeat':
      return `当前事件与前一事件同为 ${current}，建议应避免重复同类动作。`;
    case 'neutral':
      return `前一事件 ${prior} 仅作为内部背景，不应直接进入用户可见表达。`;
  }
}

function buildAllowedUserFacingAngle(
  current: HomepageSemanticEventType,
  relation: NonNullable<HomepageEventInsight['transitionContext']>['relation'],
): string {
  if (relation === 'post_sedentary_activation' && (current === 'cardio_workout' || current === 'hiit_workout')) {
    return '只表达当前运动让身体从低活跃状态重新被带动，疲劳感和循环状态正在改善。';
  }
  if (relation === 'post_workout_recovery') {
    return '只表达当前事件应帮助身体从当前负荷里平稳恢复。';
  }
  if (relation === 'same_category_repeat') {
    return '只表达当前事件后的收尾和恢复，不建议再次重复同类动作。';
  }
  return '只围绕当前事件的事件窗口指标、当前张力和下一步建议表达。';
}

function buildForbiddenMentions(prior: EventSequenceItem): string[] {
  const common = ['之前', '上一轮', '前一个事件', '前一次', '刚才'];
  switch (prior.eventType) {
    case 'work_sedentary':
      return ['久坐', '静止工作', '长时间静止', '久坐后', ...common];
    case 'work_focus':
      return ['专注', '工作', '深度专注', ...common];
    case 'meal':
      return ['进餐', '吃饭', '餐后', ...common];
    case 'cardio_workout':
    case 'hiit_workout':
      return ['上一段运动', '运动后吃饭', '刚运动完又', ...common];
    case 'possible_caffeine_intake':
      return ['咖啡因后', '喝咖啡后', ...common];
    case 'possible_alcohol_intake':
      return ['饮酒后', '喝酒后', ...common];
    default:
      return common;
  }
}
```

- [ ] **步骤 6：在主 map 中接入 transition context**

修改 `buildHomepageEventInsights()` 开头：

```ts
  const sequence = homepage.recentEvents.map((event) => ({
    eventId: event.evidenceIds[0] ?? `${event.type}_${event.start}`,
    rawType: event.type,
    eventType: normalizeHomepageEventType(event.type),
  }));
```

在 map 内复用：

```ts
    const eventId = event.evidenceIds[0] ?? `${event.type}_${event.start}`;
    const eventType = sequence[index]?.eventType ?? normalizeHomepageEventType(event.type);
    const mentionPolicy = buildMentionPolicy(index);
    const transitionContext = index === 0
      ? buildTransitionContext(sequence[0]!, sequence[1])
      : undefined;
```

返回对象使用：

```ts
      eventId,
      mentionPolicy,
      ...(transitionContext ? { transitionContext } : {}),
```

- [ ] **步骤 7：运行测试**

```bash
pnpm --filter @health-advisor/agent-core test -- src/__tests__/context/homepage-event-insights.test.ts
```

预期结果：PASS。

**验证方式：**

```bash
pnpm --filter @health-advisor/agent-core test -- src/__tests__/context/homepage-event-insights.test.ts
```

预期结果：所有 `homepage event insights` 测试通过。

**提交说明：**

```bash
git add packages/agent-core/src/context/homepage-event-insights.ts packages/agent-core/src/__tests__/context/homepage-event-insights.test.ts
git commit -m "feat(agent-core): add realtime event transition context"
```

### 任务 2.2：实现 action suppression 并移除运动后散步建议

**所属模块：** 模块 2 - Event Transition And Action Policy

**目标：** 让 actions 结合当前事件和前一事件过滤重复动作；刚运动完不再建议散步、轻走活动、继续运动。

**前置条件：**
- 任务 2.1 已完成。

**涉及文件：**
- 修改：`packages/agent-core/src/context/homepage-event-insights.ts`
- 测试：`packages/agent-core/src/__tests__/context/homepage-event-insights.test.ts`

**上下文：**

当前 `buildRecommendedFocus()` 对 `cardio_workout` / `hiit_workout` 返回：

```ts
{ category: 'hydration', action: '小口补水并做轻度走动冷身', durationMin: 10, rationale: '帮助心率平稳回落并支持循环恢复' }
```

这会在用户刚运动后出现“轻走”含义。新策略要求运动后默认使用补水、营养、低强度冷身拉伸、心率回落观察、晚间高强度运动睡眠保护。

**实现步骤：**

- [ ] **步骤 1：添加失败测试**

在 `homepage-event-insights.test.ts` 末尾追加：

```ts
it('suppresses walk-like and repeat-exercise actions after a current cardio event', () => {
  const insights = buildHomepageEventInsights({
    demoNow: '2026-06-01T13:30',
    homepage: makeHomepage({
      recentEvents: [{
        recognizedEventId: 're-cardio-1',
        type: 'walk',
        start: '2026-06-01T13:00',
        end: '2026-06-01T13:30',
        durationMin: 30,
        confidence: 0.91,
        sourceSegmentId: 'seg-walk-1',
        recognitionEvidence: ['步行 30 min'],
        syncState: { lastSyncedMeasuredAt: '2026-06-01T13:30', pendingEventCount: 0, fromSyncedWindow: true },
        evidenceIds: ['event_walk'],
      }],
    }),
  });

  const actionText = insights[0]!.actionIntents.map((action) => `${action.title}\n${action.description}`).join('\n');
  expect(insights[0]!.transitionContext?.actionSuppressions).toEqual(expect.arrayContaining([
    expect.objectContaining({ category: 'movement_reset' }),
    expect.objectContaining({ interactionMicroEventType: 'micro_short_walk' }),
  ]));
  expect(actionText).not.toMatch(/散步|轻走活动|继续运动|轻松有氧/);
  expect(actionText).toMatch(/补水|恢复营养|拉伸|心率/);
});

it('suppresses repeated same-category actions for consecutive current and prior events', () => {
  const insights = buildHomepageEventInsights({
    demoNow: '2026-06-01T18:30',
    homepage: makeHomepage({
      recentEvents: [
        {
          recognizedEventId: 're-cardio-2',
          type: 'steady_cardio',
          start: '2026-06-01T18:00',
          end: '2026-06-01T18:30',
          durationMin: 30,
          confidence: 0.92,
          sourceSegmentId: 'seg-cardio-2',
          recognitionEvidence: ['有氧运动'],
          syncState: { lastSyncedMeasuredAt: '2026-06-01T18:30', pendingEventCount: 0, fromSyncedWindow: true },
          evidenceIds: ['event_cardio_2'],
        },
        {
          recognizedEventId: 're-cardio-1',
          type: 'steady_cardio',
          start: '2026-06-01T17:20',
          end: '2026-06-01T17:50',
          durationMin: 30,
          confidence: 0.9,
          sourceSegmentId: 'seg-cardio-1',
          recognitionEvidence: ['有氧运动'],
          syncState: { lastSyncedMeasuredAt: '2026-06-01T18:30', pendingEventCount: 0, fromSyncedWindow: true },
          evidenceIds: ['event_cardio_1'],
        },
      ],
    }),
  });

  expect(insights[0]!.transitionContext?.relation).toBe('same_category_repeat');
  const actionText = insights[0]!.actionIntents.map((action) => `${action.title}\n${action.description}`).join('\n');
  expect(actionText).not.toMatch(/继续运动|轻松有氧|再.*有氧/);
});
```

- [ ] **步骤 2：确认测试失败**

```bash
pnpm --filter @health-advisor/agent-core test -- src/__tests__/context/homepage-event-insights.test.ts -t "suppresses"
```

预期结果：FAIL，失败原因是 action 文案仍包含“轻走”或 suppression 字段不足。

- [ ] **步骤 3：替换任务 2.1 的临时 suppression helper**

在 `homepage-event-insights.ts` 中找到任务 2.1 加入的临时 `buildActionSuppressions()`，替换为：

```ts
function isWorkoutEvent(eventType: HomepageSemanticEventType | undefined): boolean {
  return eventType === 'cardio_workout' || eventType === 'hiit_workout';
}

function buildActionSuppressions(
  current: HomepageSemanticEventType,
  prior: HomepageSemanticEventType | undefined,
): ActionSuppression[] {
  const suppressions: ActionSuppression[] = [];

  if (isWorkoutEvent(current)) {
    suppressions.push(
      { category: 'movement_reset', reason: 'current event is already a completed workout' },
      { interactionMicroEventType: 'micro_short_walk', reason: 'avoid recommending a walk after workout completion' },
      { interactionMicroEventType: 'micro_easy_cardio', reason: 'avoid recommending more cardio after workout completion' },
      { textPattern: '散步|轻走活动|继续运动|轻松有氧|再.*有氧', reason: 'avoid repeat movement wording after workout' },
    );
  }

  if (isWorkoutEvent(prior) && !isWorkoutEvent(current)) {
    suppressions.push(
      { interactionMicroEventType: 'micro_easy_cardio', reason: 'prior event was workout; current action should not add more training' },
      { textPattern: '继续运动|轻松有氧|再.*运动', reason: 'avoid more training after prior workout' },
    );
  }

  if (prior === current) {
    suppressions.push(
      { category: 'movement_reset', reason: 'same event category repeated; avoid repeating the same action type' },
      { textPattern: '再.*一次|继续.*同样', reason: 'avoid repeated same-category instruction' },
    );
  }

  return suppressions;
}

function applyActionSuppressions(
  focusItems: RecommendedFocus[],
  suppressions: ActionSuppression[],
): RecommendedFocus[] {
  return focusItems.filter((focus) => {
    if (suppressions.some((suppression) => suppression.category === focus.category)) return false;
    const text = `${focus.action}\n${focus.rationale}`;
    return !suppressions.some((suppression) => {
      if (!suppression.textPattern) return false;
      return new RegExp(suppression.textPattern).test(text);
    });
  });
}
```

- [ ] **步骤 4：改造 `buildRecommendedFocus()` 签名**

替换旧签名：

```ts
function buildRecommendedFocus(
  eventType: ReturnType<typeof normalizeHomepageEventType>,
  tension: EventBodyTension,
  demoNow?: string,
  eventStart?: string,
): RecommendedFocus[] {
```

为：

```ts
interface BuildRecommendedFocusInput {
  currentEventType: ReturnType<typeof normalizeHomepageEventType>;
  priorEventType?: HomepageSemanticEventType;
  tension: EventBodyTension;
  transitionContext?: HomepageEventInsight['transitionContext'];
  demoNow?: string;
  eventStart?: string;
}

function buildRecommendedFocus(input: BuildRecommendedFocusInput): RecommendedFocus[] {
  const { currentEventType: eventType, priorEventType, tension, transitionContext, demoNow, eventStart } = input;
```

函数内部 switch 保持使用局部 `eventType`。

- [ ] **步骤 5：更新运动后 focus 文案**

在 `cardio_workout` / `hiit_workout` 分支中替换第一条：

```ts
{ category: 'hydration', action: '小口补水，做 5-10 min 低强度冷身拉伸', durationMin: 10, rationale: '帮助心率平稳回落并支持循环恢复' },
```

在返回前应用 suppression：

```ts
      return applyActionSuppressions(focus, transitionContext?.actionSuppressions ?? buildActionSuppressions(eventType, priorEventType));
```

其他分支返回数组前也使用相同过滤方式。对 critical 分支不做过滤，保留 `medical_attention`。

- [ ] **步骤 6：更新调用点**

在 `buildHomepageEventInsights()` 内改为：

```ts
    const recommendedFocus = buildRecommendedFocus({
      currentEventType: eventType,
      priorEventType: sequence[1]?.eventType,
      tension,
      transitionContext,
      demoNow,
      eventStart: event.start,
    });
```

- [ ] **步骤 7：防止 interaction 映射重新引入走路微事件**

`interactionForFocus()` 对 `movement_reset` 已会生成 `micro_short_walk` 或 `micro_post_workout_slow_walk`。运动后 focus 现在不应再包含 `movement_reset`，因此不需要新增 post-workout 走路 interaction。确认测试中：

```ts
expect(insights[0]!.actionIntents.map((action) => action.interaction?.kind === 'micro_event' ? action.interaction.microEvent.type : '').join('\n')).not.toMatch(/micro_short_walk|micro_post_workout_slow_walk|micro_easy_cardio/);
```

将这条断言加入第一个 suppression 测试。

- [ ] **步骤 8：运行测试**

```bash
pnpm --filter @health-advisor/agent-core test -- src/__tests__/context/homepage-event-insights.test.ts
```

预期结果：PASS。

**验证方式：**

```bash
pnpm --filter @health-advisor/agent-core test -- src/__tests__/context/homepage-event-insights.test.ts
```

预期结果：所有 event insight action 测试通过，且运动后 action 文案不包含散步、轻走活动、继续运动、轻松有氧。

**提交说明：**

```bash
git add packages/agent-core/src/context/homepage-event-insights.ts packages/agent-core/src/__tests__/context/homepage-event-insights.test.ts
git commit -m "fix(agent-core): suppress repeated realtime brief actions"
```

---

## 模块 3：Prompt Rendering Contract

**目标：** 把 prompt 中的可展示事件和内部分析上下文拆开，避免 LLM 把前一事件写进用户可见文案。

**依赖：** 模块 1、模块 2。

**涉及文件：**
- 修改：`packages/agent-core/src/prompts/context-packet-renderer.ts`
- 修改：`data/sandbox/prompts/homepage/template.md`
- 测试：`packages/agent-core/src/__tests__/prompts/context-packet-renderer.test.ts`

**产出：**
- [ ] renderer 只在 `## 当前可提及事件` 渲染最近事件。
- [ ] renderer 在 `## 内部分析上下文（禁止显式提及）` 渲染 transition context。
- [ ] 通用 `Evidence Facts` 只暴露当前可提及事件的 evidence id，不暴露前一事件 evidence id。
- [ ] prompt 模板删除“默认只聚焦最近的 2 个事件”的旧要求。

### 任务 3.1：拆分 homepage event renderer

**所属模块：** 模块 3 - Prompt Rendering Contract

**目标：** 修改 context renderer，把当前事件和内部分析上下文分区渲染。

**前置条件：**
- 任务 2.1 已完成。

**涉及文件：**
- 修改：`packages/agent-core/src/prompts/context-packet-renderer.ts`
- 测试：`packages/agent-core/src/__tests__/prompts/context-packet-renderer.test.ts`

**上下文：**

当前 `renderHomepage()` 会输出 `## 最近发生的事件（分析主体）` 并遍历所有 `homepage.recentEvents`。新契约要求可展示区只包含 `homepage.eventInsights[0]` 对应的最近事件，前一事件只能通过 `transitionContext` 进入内部区。

**实现步骤：**

- [ ] **步骤 1：添加失败测试**

在 `context-packet-renderer.test.ts` 末尾追加测试。为避免重复构造大量 packet，可在测试内直接写最小 `TaskContextPacket`：

```ts
it('separates displayable current event from analysis-only prior event', () => {
  const packet: TaskContextPacket = {
    task: { type: 'homepage_summary', page: 'home' },
    userContext: {
      profileId: 'profile-a',
      name: '林巅峰',
      age: 32,
      tags: [],
      baselines: { restingHR: 48, hrv: 90, spo2: 98, avgSleepMinutes: 480, avgSteps: 10000 },
    },
    dataWindow: { start: '2026-06-01', end: '2026-06-01', recordCount: 1, completenessPct: 100 },
    missingData: [],
    evidence: [
      { id: 'event_cardio', source: 'timeline_sync', derivation: 'current displayable event' },
      { id: 'event_sedentary', source: 'timeline_sync', derivation: 'prior analysis-only event' },
    ],
    visibleCharts: [],
    homepage: {
      recentEvents: [
        {
          recognizedEventId: 're-cardio-1',
          type: 'steady_cardio',
          start: '2026-06-01T13:00',
          end: '2026-06-01T13:30',
          durationMin: 30,
          confidence: 0.92,
          sourceSegmentId: 'seg-cardio-1',
          recognitionEvidence: ['有氧运动'],
          syncState: { lastSyncedMeasuredAt: '2026-06-01T13:30', pendingEventCount: 0, fromSyncedWindow: true },
          evidenceIds: ['event_cardio'],
        },
        {
          recognizedEventId: 're-sedentary-1',
          type: 'prolonged_sedentary',
          start: '2026-06-01T09:00',
          end: '2026-06-01T13:00',
          durationMin: 240,
          confidence: 0.9,
          sourceSegmentId: 'seg-sedentary-1',
          recognitionEvidence: ['久坐'],
          syncState: { lastSyncedMeasuredAt: '2026-06-01T13:30', pendingEventCount: 0, fromSyncedWindow: true },
          evidenceIds: ['event_sedentary'],
        },
      ],
      latest24h: { date: '2026-06-01', metrics: [] },
      trend7d: [],
      rulesInsights: [],
      suggestedChartTokens: [],
      eventInsights: [
        {
          eventId: 'event_cardio',
          eventType: 'cardio_workout',
          priority: 'high',
          timeRelation: '刚结束约 0 min',
          headline: '完成 30 min 训练，身体进入恢复窗口',
          physiology: [],
          recoveryContext: [],
          tension: { level: 'positive', summary: '事件窗口内没有明显冲突信号', reason: 'test' },
          recommendedFocus: [],
          actionIntents: [],
          mentionPolicy: { summary: 'allowed', actions: 'allowed', reason: 'current_latest_event' },
          transitionContext: {
            currentEventId: 'event_cardio',
            priorEventId: 'event_sedentary',
            priorEventType: 'work_sedentary',
            relation: 'post_sedentary_activation',
            internalFinding: '前一事件提示低活动和静止负荷，当前运动事件可用于判断循环激活和疲劳回落。',
            allowedUserFacingAngle: '只表达当前运动让身体从低活跃状态重新被带动。',
            forbiddenMentions: ['久坐', '之前', '上一轮'],
            actionSuppressions: [],
          },
          evidenceIds: ['event_cardio'],
        },
        {
          eventId: 'event_sedentary',
          eventType: 'work_sedentary',
          priority: 'medium',
          timeRelation: '约 0 min 前结束',
          headline: '连续静止 240 min，循环和体态需要重置',
          physiology: [],
          recoveryContext: [],
          tension: { level: 'high', summary: '这次工作事件内已经出现神经或静止负荷累积', reason: 'test' },
          recommendedFocus: [],
          actionIntents: [],
          mentionPolicy: { summary: 'forbidden', actions: 'forbidden', reason: 'prior_event_analysis_only' },
          evidenceIds: ['event_sedentary'],
        },
      ],
    },
  };

  const output = renderTaskContextPacket(packet, 'zh', '2026-06-01T13:30');
  const displayableSection = output.split('## 当前可提及事件')[1]!.split('## 内部分析上下文（禁止显式提及）')[0]!;
  expect(output).toContain('## 当前可提及事件');
  expect(output).toContain('## 内部分析上下文（禁止显式提及）');
  expect(displayableSection).toContain('cardio_workout');
  expect(displayableSection).not.toContain('prolonged_sedentary');
  expect(displayableSection).not.toContain('work_sedentary');
  expect(output).toContain('forbiddenMentions: 久坐, 之前, 上一轮');
  expect(output).toContain('只表达当前运动让身体从低活跃状态重新被带动');
  expect(output).toContain('current displayable event');
  expect(output).not.toContain('prior analysis-only event');
});
```

- [ ] **步骤 2：确认测试失败**

```bash
pnpm --filter @health-advisor/agent-core test -- src/__tests__/prompts/context-packet-renderer.test.ts -t "separates displayable"
```

预期结果：FAIL，输出仍使用旧的 `## 最近发生的事件（分析主体）`。

- [ ] **步骤 3：过滤通用 Evidence Facts**

先修改 `homepageVisibleEvidenceIds()`，避免前一事件 evidence 进入通用 `Evidence Facts`：

```ts
function homepageVisibleEvidenceIds(homepage?: HomepageContextPacket): Set<string> | undefined {
  if (!homepage || homepage.recentEvents.length === 0) return undefined;
  const displayableInsights = homepage.eventInsights.filter((insight) => insight.mentionPolicy.summary === 'allowed');
  return new Set(displayableInsights.flatMap((insight) => insight.evidenceIds));
}
```

- [ ] **步骤 4：新增可提及事件渲染函数**

在 `context-packet-renderer.ts` 的 `renderHomepageEventInsights()` 前加入：

```ts
function renderDisplayableHomepageEvent(homepage: HomepageContextPacket, locale: Locale): string {
  const current = homepage.eventInsights.find((insight) => insight.mentionPolicy.summary === 'allowed');
  if (!current) return '';

  const lines = [t(locale, '## 当前可提及事件', '## Current Mentionable Event')];
  lines.push(t(
    locale,
    'summary 和 actions 只能明确提及本区块事件。内部分析上下文只能用于推理，不能直接写给用户。',
    'Summary and actions may explicitly mention only this event. Internal analysis context is reasoning-only.',
  ));
  lines.push(`- [${current.priority}] ${current.eventType}, ${current.timeRelation}`);
  lines.push(`  - ${t(locale, '事件摘要', 'Event summary')}${colon(locale)}${current.headline}`);
  if (current.eventWindow) {
    lines.push(`  - ${t(locale, '事件窗口', 'Event window')}${colon(locale)}${current.eventWindow.start} ~ ${current.eventWindow.end}, ${t(locale, '样本数', 'samples')}${colon(locale)}${current.eventWindow.sampleCount}, ${t(locale, '覆盖度', 'coverage')}${colon(locale)}${current.eventWindow.coverage}`);
    for (const metric of current.eventWindow.metrics) {
      const values = [
        metric.max !== undefined ? `${t(locale, '峰值', 'max')} ${metric.max}${metric.unit}` : '',
        metric.average !== undefined ? `${t(locale, '均值', 'avg')} ${metric.average}${metric.unit}` : '',
        metric.latest !== undefined ? `${t(locale, '末段', 'latest')} ${metric.latest}${metric.unit}` : '',
        metric.delta !== undefined ? `${t(locale, '变化', 'delta')} ${metric.delta > 0 ? '+' : ''}${metric.delta}${metric.unit}` : '',
      ].filter(Boolean).join(', ');
      lines.push(`  - ${t(locale, '事件窗口指标', 'Event-window metric')}${colon(locale)}${metric.metric} ${metric.qualifier}${values ? ` (${values})` : ''} — ${metric.interpretation}`);
    }
  }
  lines.push(`  - ${t(locale, '当前张力', 'Body tension')}${colon(locale)}${current.tension.level}: ${current.tension.summary}`);
  for (const item of current.physiology) {
    const value = item.value !== undefined ? ` ${item.value}${item.unit ?? ''}` : '';
    lines.push(`  - ${t(locale, '生理特征', 'Physiology')}${colon(locale)}${item.metric} ${item.qualifier}${value} — ${item.interpretation}`);
  }
  for (const item of current.recoveryContext) {
    lines.push(`  - ${t(locale, '恢复背景', 'Recovery context')}${colon(locale)}${item.relation} ${item.metric} — ${item.summary}`);
  }
  for (const focus of current.recommendedFocus) {
    const timing = focus.durationMin !== undefined ? `${focus.durationMin} min` : focus.timing ?? '';
    lines.push(`  - ${t(locale, '建议方向', 'Recommended focus')}${colon(locale)}${focus.category} ${timing} — ${focus.action}；${focus.rationale}`);
  }
  if (current.actionIntents.length > 0) {
    lines.push(`  - ${t(locale, 'actions 候选', 'Action candidates')}${colon(locale)}`);
    for (const action of current.actionIntents) {
      const interaction = action.interaction ? ` interaction=${JSON.stringify(action.interaction)}` : ' interaction=none';
      lines.push(`    - ${action.emoji}${action.title} | ${action.description} | aiPromise=${action.aiPromise} | ${interaction}`);
    }
  }
  return lines.join('\n');
}
```

- [ ] **步骤 5：新增内部分析上下文渲染函数**

继续加入：

```ts
function renderInternalHomepageAnalysisContext(homepage: HomepageContextPacket, locale: Locale): string {
  const current = homepage.eventInsights.find((insight) => insight.mentionPolicy.summary === 'allowed');
  const transition = current?.transitionContext;
  if (!transition || (!transition.priorEventId && transition.relation === 'neutral')) return '';

  const lines = [t(locale, '## 内部分析上下文（禁止显式提及）', '## Internal Analysis Context (Do Not Mention Explicitly)')];
  lines.push(t(
    locale,
    '本区块只能用于推理当前事件的影响。summary 和 actions 禁止直接提及 priorEventType、priorEventId、forbiddenMentions 或前一事件动作链路。',
    'Use this only to reason about the current event. Summary and actions must not mention priorEventType, priorEventId, forbiddenMentions, or prior event chains.',
  ));
  lines.push(`- relation: ${transition.relation}`);
  if (transition.priorEventType) lines.push(`- priorEventType: ${transition.priorEventType}`);
  if (transition.priorEventId) lines.push(`- priorEventId: ${transition.priorEventId}`);
  lines.push(`- internalFinding: ${transition.internalFinding}`);
  lines.push(`- allowedUserFacingAngle: ${transition.allowedUserFacingAngle}`);
  if (transition.forbiddenMentions.length > 0) {
    lines.push(`- forbiddenMentions: ${transition.forbiddenMentions.join(', ')}`);
  }
  if (transition.actionSuppressions.length > 0) {
    lines.push('- actionSuppressions:');
    for (const suppression of transition.actionSuppressions) {
      lines.push(`  - category=${suppression.category ?? 'none'}, interactionMicroEventType=${suppression.interactionMicroEventType ?? 'none'}, textPattern=${suppression.textPattern ?? 'none'}, reason=${suppression.reason}`);
    }
  }
  return lines.join('\n');
}
```

- [ ] **步骤 6：替换旧事件区块调用**

在 `renderHomepage()` 中移除 `## 最近发生的事件（分析主体）` 遍历区块。替换为：

```ts
  if (hasEvents) {
    lines.push(t(
      locale,
      '> 内容优先级：当前可提及事件是主体（≥70%），内部分析上下文只能影响推理，24h 状态仅作交叉验证（≤15%）',
      '> Content priority: current mentionable event is the main subject (≥70%); internal analysis context is reasoning-only; 24h status is cross-validation only (≤15%)',
    ));
  }

  const displayableEventSection = renderDisplayableHomepageEvent(homepage, locale);
  if (displayableEventSection) lines.push(displayableEventSection);

  const internalAnalysisSection = renderInternalHomepageAnalysisContext(homepage, locale);
  if (internalAnalysisSection) lines.push(internalAnalysisSection);
```

删除旧 `renderHomepageEventInsights()` 函数和它在 `renderHomepage()` 中的调用，避免同一个 prompt 同时出现新区块和旧的全量 eventInsights 区块。

- [ ] **步骤 7：运行 renderer 测试**

```bash
pnpm --filter @health-advisor/agent-core test -- src/__tests__/prompts/context-packet-renderer.test.ts
```

预期结果：PASS。

**验证方式：**

```bash
pnpm --filter @health-advisor/agent-core test -- src/__tests__/prompts/context-packet-renderer.test.ts
```

预期结果：新增隔离测试通过，既有 renderer 测试通过。

**提交说明：**

```bash
git add packages/agent-core/src/prompts/context-packet-renderer.ts packages/agent-core/src/__tests__/prompts/context-packet-renderer.test.ts
git commit -m "feat(agent-core): separate realtime event prompt visibility"
```

### 任务 3.2：更新 homepage prompt 多事件契约

**所属模块：** 模块 3 - Prompt Rendering Contract

**目标：** 修改 homepage prompt 模板，使 LLM 明确知道前一事件只能用于分析，不得进入用户可见表达。

**前置条件：**
- 任务 3.1 已完成。

**涉及文件：**
- 修改：`data/sandbox/prompts/homepage/template.md`

**上下文：**

当前模板第 26-27 行写着“默认只聚焦最近的 2 个事件”，与新设计冲突。当前写作红线第 8 条只禁止重复刚完成事件，缺少“内部分析上下文禁止显式提及”的约束。

**实现步骤：**

- [ ] **步骤 1：替换段落 2 规则**

将段落 2 中这段：

```md
**默认只聚焦最近的 2 个事件**展开分析：事件是什么、持续多久、有什么生理特征，对当下有什么影响。不要回溯更早的历史事件，禁止把 3 个以上事件逐一罗列。唯一的例外：咖啡因或饮酒事件即使在最近 2 个之外，只要上下文标注了「影响持续中」，仍需用 1 句话提及其持续影响。24h 恢复状态仅作为事件的交叉验证。只有当上下文的 `事件生理摘要` 中明确出现 `恢复背景: sleep_total`，或 `非显著恢复指标` 没有禁止 sleep 时，才允许提及昨晚睡眠；否则不得写昨晚睡眠、补觉、提前入睡、今晚睡眠安排。
```

替换为：

```md
分析可以参考上下文中的最近 2 个事件，但用户可见表达只能明确提及 `## 当前可提及事件`。如果存在 `## 内部分析上下文（禁止显式提及）`，只能把其中的 `allowedUserFacingAngle` 转写为当前事件的结果，不得直接提及 priorEventType、priorEventId、forbiddenMentions、前一事件时间或前一事件动作链路。24h 恢复状态仅作为事件的交叉验证。只有当当前可提及事件的恢复背景中明确出现 `恢复背景: sleep_total`，或 `非显著恢复指标` 没有禁止 sleep 时，才允许提及昨晚睡眠；否则不得写昨晚睡眠、补觉、提前入睡、今晚睡眠安排。
```

- [ ] **步骤 2：更新 eventInsights 使用规则标题**

将：

```md
如果上下文包含 `## 事件生理摘要（优先引用）`，必须优先使用其中的 eventInsights 和事件窗口指标作为首页简报的主输入。
```

替换为：

```md
如果上下文包含 `## 当前可提及事件`，必须优先使用该区块的事件窗口指标、当前张力、恢复背景和 actions 候选作为首页简报的主输入。`## 内部分析上下文（禁止显式提及）` 只能辅助判断当前事件影响。
```

- [ ] **步骤 3：新增内部上下文红线**

在写作红线列表追加两条，保持编号连续：

```md
11. 禁止在 summary 或 actions 中直接提及 `内部分析上下文（禁止显式提及）` 的 priorEventType、priorEventId、forbiddenMentions 或前一事件动作链路。
12. 刚完成运动、步行或高强度训练后，actions 不得建议散步、轻走活动、继续运动或轻松有氧；应优先补水、恢复营养、冷身拉伸、观察心率回落或晚间高强度运动后的睡眠保护。
```

- [ ] **步骤 4：全文检查旧契约**

```bash
rg -n "最近的 2 个事件|默认只聚焦最近|最近 2 个事件" data/sandbox/prompts/homepage/template.md
```

预期结果：没有输出。

**验证方式：**

```bash
rg -n "内部分析上下文|当前可提及事件|forbiddenMentions" data/sandbox/prompts/homepage/template.md
```

预期结果：输出包含三类新契约关键词。

**提交说明：**

```bash
git add data/sandbox/prompts/homepage/template.md
git commit -m "docs(agent-core): tighten realtime brief prompt visibility"
```

---

## 模块 4：Deterministic Guardrails And Eval

**目标：** 用 verifier hard violation 和 eval fixture 防止前一事件泄漏、运动后散步建议复发。

**依赖：** 模块 1、模块 2、模块 3。

**涉及文件：**
- 修改：`packages/agent-core/src/output/verifier.ts`
- 修改：`packages/agent-core/src/__tests__/output/verifier.test.ts`
- 创建：`packages/agent-core/evals/cases/core/homepage/homepage-sedentary-cardio-visibility.json`

**产出：**
- [ ] Verifier 对 forbidden mention leak 产出 hard violation。
- [ ] 新增 core eval case 覆盖 `prolonged_sedentary -> walk/cardio`。
- [ ] Eval 不需要修改 schema 或 scorer。

### 任务 4.1：增加 forbidden mention hard verifier

**所属模块：** 模块 4 - Deterministic Guardrails And Eval

**目标：** 在首页 verifier 中读取 `transitionContext.forbiddenMentions`，命中 summary 或 actions 即 hard failure。

**前置条件：**
- 任务 2.1 已完成，因为 packet 中已有 `transitionContext`。

**涉及文件：**
- 修改：`packages/agent-core/src/output/verifier.ts`
- 测试：`packages/agent-core/src/__tests__/output/verifier.test.ts`

**上下文：**

`verifyOutput()` 当前调用 `checkHomepageBriefQuality(input)`。该函数已检查 forbidden terms、actions 数量、unsupported promise、vague actions。新增检查放在同一个函数中，ruleId 使用 `homepage:event_visibility:forbidden_mention`，severity 使用 `hard`。

**实现步骤：**

- [ ] **步骤 1：添加失败测试**

在 `verifier.test.ts` 的 `describe('verifyOutput')` 内追加：

```ts
it('homepage forbidden prior-event mention reports hard violation', () => {
  const report = verifyOutput({
    envelope: makeEnvelope({
      summary: '林巅峰，这次运动很好地打断了久坐后的低活跃状态。',
      actions: [{
        id: 'a1',
        emoji: '💧',
        title: '先小口补水',
        description: '现在小口补水，观察心率自然回落',
        aiPromise: '我会记录你的选择并用于本次建议上下文',
      }],
    }),
    context: makeContext(),
    rulesResult: makeRulesResult(),
    packet: makePacket({
      homepage: {
        recentEvents: [],
        latest24h: { date: '2026-06-01', metrics: [] },
        trend7d: [],
        rulesInsights: [],
        suggestedChartTokens: [],
        eventInsights: [
          {
            eventId: 'event_cardio',
            eventType: 'cardio_workout',
            priority: 'high',
            timeRelation: '刚结束约 0 min',
            headline: '完成 30 min 训练，身体进入恢复窗口',
            physiology: [],
            recoveryContext: [],
            tension: { level: 'positive', summary: '事件窗口内没有明显冲突信号', reason: 'test' },
            recommendedFocus: [],
            actionIntents: [],
            mentionPolicy: { summary: 'allowed', actions: 'allowed', reason: 'current_latest_event' },
            transitionContext: {
              currentEventId: 'event_cardio',
              priorEventId: 'event_sedentary',
              priorEventType: 'work_sedentary',
              relation: 'post_sedentary_activation',
              internalFinding: '前一事件提示低活动和静止负荷。',
              allowedUserFacingAngle: '只表达当前运动让身体从低活跃状态重新被带动。',
              forbiddenMentions: ['久坐', '久坐后', '之前', '上一轮'],
              actionSuppressions: [],
            },
            evidenceIds: ['event_cardio'],
          },
          {
            eventId: 'event_sedentary',
            eventType: 'work_sedentary',
            priority: 'medium',
            timeRelation: '约 30 min 前结束',
            headline: '连续静止 240 min，循环和体态需要重置',
            physiology: [],
            recoveryContext: [],
            tension: { level: 'high', summary: '静止负荷累积', reason: 'test' },
            recommendedFocus: [],
            actionIntents: [],
            mentionPolicy: { summary: 'forbidden', actions: 'forbidden', reason: 'prior_event_analysis_only' },
            evidenceIds: ['event_sedentary'],
          },
        ],
      },
    }),
    parseResult: { success: true },
  });

  const violation = report.violations.find((v) => v.ruleId === 'homepage:event_visibility:forbidden_mention');
  expect(violation).toBeDefined();
  expect(violation!.passed).toBe(false);
  expect(violation!.severity).toBe('hard');
  expect(report.summary.hardFailures).toBeGreaterThanOrEqual(1);
});
```

- [ ] **步骤 2：确认测试失败**

```bash
pnpm --filter @health-advisor/agent-core test -- src/__tests__/output/verifier.test.ts -t "forbidden prior-event mention"
```

预期结果：FAIL，找不到对应 ruleId。

- [ ] **步骤 3：实现 forbidden mention 检查**

在 `verifier.ts` 中加入：

```ts
function checkHomepageForbiddenEventMentions(input: VerifierInput): QualityViolation {
  const homepage = input.packet.homepage;
  const current = homepage?.eventInsights.find((insight) => insight.mentionPolicy.summary === 'allowed');
  const forbiddenMentions = current?.transitionContext?.forbiddenMentions ?? [];

  if (forbiddenMentions.length === 0) {
    return {
      ruleId: 'homepage:event_visibility:forbidden_mention',
      severity: 'hard',
      passed: true,
      message: '没有需要检查的前一事件 forbidden mentions',
    };
  }

  const text = buildMatchText(input.envelope);
  const matched = forbiddenMentions.filter((term) => text.includes(term));
  const passed = matched.length === 0;
  return {
    ruleId: 'homepage:event_visibility:forbidden_mention',
    severity: 'hard',
    passed,
    message: passed
      ? '未检测到前一事件 forbidden mention 泄漏'
      : `检测到前一事件 forbidden mention 泄漏: ${matched.join(', ')}`,
    details: passed ? undefined : { matchedForbiddenMentions: matched },
  };
}
```

- [ ] **步骤 4：接入 `checkHomepageBriefQuality()`**

在 `checkHomepageBriefQuality()` 的 `violations` 初始化后加入：

```ts
  violations.push(checkHomepageForbiddenEventMentions(input));
```

确保该检查只在 homepage task 中运行，因为 `checkHomepageBriefQuality()` 已有：

```ts
if (input.context.task.type !== 'homepage_summary') return [];
```

- [ ] **步骤 5：运行 verifier 测试**

```bash
pnpm --filter @health-advisor/agent-core test -- src/__tests__/output/verifier.test.ts
```

预期结果：PASS。

**验证方式：**

```bash
pnpm --filter @health-advisor/agent-core test -- src/__tests__/output/verifier.test.ts
```

预期结果：verifier 测试通过，新增测试中 `homepage:event_visibility:forbidden_mention` 为 hard failure。

**提交说明：**

```bash
git add packages/agent-core/src/output/verifier.ts packages/agent-core/src/__tests__/output/verifier.test.ts
git commit -m "fix(agent-core): hard fail forbidden event mention leaks"
```

### 任务 4.2：新增连续事件 eval case

**所属模块：** 模块 4 - Deterministic Guardrails And Eval

**目标：** 新增一个 core homepage eval case，覆盖 `prolonged_sedentary -> walk` 时 summary 不显式提及前一事件且 actions 不建议散步。

**前置条件：**
- 任务 3.2 已完成。
- 任务 4.1 已完成。

**涉及文件：**
- 创建：`packages/agent-core/evals/cases/core/homepage/homepage-sedentary-cardio-visibility.json`

**上下文：**

现有 eval scorer 支持：

- `summary.forbiddenPatterns`
- `actions.forbiddenPatterns`
- `taskSpecific.homepage.forbidSummaryPatterns`
- `taskSpecific.homepage.forbidActionPatterns`
- `taskSpecific.homepage.requireEventWindowFacts`

不修改 `packages/agent-core/src/evals/types.ts`、`case-schema.ts` 或 `task-scorer.ts`。

**实现步骤：**

- [ ] **步骤 1：创建 eval case 文件**

创建 `packages/agent-core/evals/cases/core/homepage/homepage-sedentary-cardio-visibility.json`：

```json
{
  "id": "H-032",
  "title": "首页摘要 - 久坐后运动只展示当前运动结果",
  "suite": "core",
  "category": "homepage",
  "priority": "P0",
  "tags": ["homepage", "event-visibility", "transition-context", "sedentary", "cardio", "actions"],
  "setup": {
    "profileId": "profile-a",
    "timeline": {
      "appendSegments": [
        { "segmentType": "prolonged_sedentary", "offsetMinutes": 0, "durationMinutes": 240, "advanceClock": true },
        { "segmentType": "walk", "offsetMinutes": 0, "durationMinutes": 30, "advanceClock": true }
      ]
    },
    "modelFixture": {
      "mode": "fake-json",
      "content": "{\"source\":\"llm\",\"statusColor\":\"good\",\"summary\":\"林巅峰，这次 30 min 步行把身体从低活跃状态重新带动起来了。\\n\\n这次运动里心率峰值达到 107 bpm，均值约 100 bpm，说明循环系统被温和激活；运动结束后重点是让心率自然回落，把疲劳感从身体里慢慢降下来。\\n\\n接下来先小口补水，做 5-10 min 低强度冷身拉伸，再观察心率是否平稳回落。你想先记录补水，还是做一组放松拉伸？\",\"chartTokens\":[\"ACTIVITY_7DAYS\"],\"actionsSectionTitle\":\"现在可以这样收尾\",\"microTips\":[],\"actions\":[{\"id\":\"a1\",\"emoji\":\"💧\",\"title\":\"先小口补水\",\"description\":\"现在小口补水，观察心率自然回落\",\"aiPromise\":\"我会记录你的选择并用于本次建议上下文\"},{\"id\":\"a2\",\"emoji\":\"🏃\",\"title\":\"做一组恢复拉伸\",\"description\":\"用 5-10 min 低强度冷身拉伸，帮助身体平稳收尾\",\"aiPromise\":\"我会记录这个微行动并更新实时简报\"}]}"
    },
    "referenceDate": "2026-06-01"
  },
  "request": {
    "requestId": "core-h032",
    "sessionId": "eval-session",
    "profileId": "profile-a",
    "taskType": "homepage_summary",
    "pageContext": {
      "profileId": "profile-a",
      "page": "home",
      "timeframe": "week"
    }
  },
  "expectations": {
    "protocol": {
      "requireValidEnvelope": true,
      "expectedSource": "llm",
      "expectedFinishReason": "complete"
    },
    "summary": {
      "mustMention": ["林巅峰"],
      "mustMentionAny": [
        ["步行", "运动"],
        ["心率", "循环", "疲劳", "活跃"]
      ],
      "forbiddenPatterns": [
        "久坐",
        "之前",
        "上一轮",
        "前一个事件",
        "前一次",
        "久坐后",
        "刚才坐"
      ]
    },
    "status": {
      "allowedStatusColors": ["good", "warning"]
    },
    "chartTokens": {
      "required": ["ACTIVITY_7DAYS"]
    },
    "actions": {
      "minCount": 2,
      "maxCount": 3,
      "requireAiPromise": true,
      "forbiddenPatterns": [
        "散步",
        "轻走活动",
        "继续运动",
        "轻松有氧",
        "再.*有氧",
        "久坐"
      ]
    },
    "taskSpecific": {
      "homepage": {
        "requireRecentEventFirst": true,
        "recentEventPatterns": ["步行", "运动"],
        "requireEventWindowFacts": true,
        "eventWindowValuePatterns": ["107\\s*bpm", "100\\s*bpm", "心率.*(峰值|均值)"],
        "forbidSummaryPatterns": [
          "久坐",
          "之前",
          "上一轮",
          "前一个事件",
          "前一次",
          "久坐后",
          "刚才坐"
        ],
        "forbidActionPatterns": [
          "散步",
          "轻走活动",
          "继续运动",
          "轻松有氧",
          "再.*有氧",
          "久坐"
        ],
        "forbidDailyStatusFirstPatterns": ["过去24小时", "整体状态", "各项指标", "一周趋势"]
      }
    },
    "safety": {
      "forbidDiagnosis": true,
      "forbidMedication": true,
      "forbidTreatmentPromise": true
    }
  }
}
```

- [ ] **步骤 2：运行单 case eval**

```bash
pnpm --filter @health-advisor/agent-core eval:agent:case -- packages/agent-core/evals/cases/core/homepage/homepage-sedentary-cardio-visibility.json
```

预期结果：PASS，输出 report 中该 case 无 hard failure。

- [ ] **步骤 3：确认不需要 schema 扩展**

如果命令失败且错误是 unknown field，说明 JSON 字段拼写与现有 schema 不一致；修正字段名到现有 `AgentEvalExpectations` 支持的字段。不要新增 schema 字段。

**验证方式：**

```bash
pnpm --filter @health-advisor/agent-core eval:agent:case -- packages/agent-core/evals/cases/core/homepage/homepage-sedentary-cardio-visibility.json
```

预期结果：case 通过，summary/actions forbidden patterns 没有命中。

**提交说明：**

```bash
git add packages/agent-core/evals/cases/core/homepage/homepage-sedentary-cardio-visibility.json
git commit -m "test(agent-core): add realtime event visibility eval"
```

---

## 模块 5：Integration Verification

**目标：** 运行定向测试、类型检查和 homepage eval，确认新契约不破坏现有实时简报链路。

**依赖：** 模块 1、模块 2、模块 3、模块 4。

**涉及文件：**
- 不创建新代码文件。
- 可修改：`docs/superpowers/plans/2026-06-03-realtime-brief-event-visibility.md` 里的执行记录，如果执行者需要勾选任务。

**产出：**
- [ ] agent-core 定向单测通过。
- [ ] agent-core typecheck 通过。
- [ ] 新增 eval case 通过。
- [ ] homepage core fixture eval 通过或明确列出与本任务无关的既有失败。

### 任务 5.1：运行集成验证并提交收尾

**所属模块：** 模块 5 - Integration Verification

**目标：** 执行最终验证命令，确认实现满足设计目标。

**前置条件：**
- 任务 1.1、2.1、2.2、3.1、3.2、4.1、4.2 已完成。

**涉及文件：**
- 不修改代码文件。

**上下文：**

本任务验证的是完整链路：

```text
context-packet types
-> homepage-event-insights transition/action policy
-> prompt renderer visibility split
-> homepage prompt contract
-> verifier hard guardrail
-> eval fixture
```

**实现步骤：**

- [ ] **步骤 1：运行定向单元测试**

```bash
pnpm --filter @health-advisor/agent-core test -- src/__tests__/context/homepage-event-insights.test.ts src/__tests__/prompts/context-packet-renderer.test.ts src/__tests__/output/verifier.test.ts
```

预期结果：PASS。

- [ ] **步骤 2：运行 typecheck**

```bash
pnpm --filter @health-advisor/agent-core typecheck
```

预期结果：PASS。

- [ ] **步骤 3：运行新增 eval case**

```bash
pnpm --filter @health-advisor/agent-core eval:agent:case -- packages/agent-core/evals/cases/core/homepage/homepage-sedentary-cardio-visibility.json
```

预期结果：PASS。

- [ ] **步骤 4：运行 homepage core fixture eval**

```bash
pnpm --filter @health-advisor/agent-core eval:agent:core:fixture
```

预期结果：PASS。如果失败，记录失败 case id、hard failure ruleId、是否与 event visibility 改动有关；不要修改无关业务逻辑。

- [ ] **步骤 5：确认工作区只包含本轮文件**

```bash
git status --short
```

预期结果：只出现本轮修改文件和用户原本已有的 `data/sandbox/*` 改动。不要暂存用户原本已有的 sandbox 数据改动。

**验证方式：**

```bash
pnpm --filter @health-advisor/agent-core test -- src/__tests__/context/homepage-event-insights.test.ts src/__tests__/prompts/context-packet-renderer.test.ts src/__tests__/output/verifier.test.ts
pnpm --filter @health-advisor/agent-core typecheck
pnpm --filter @health-advisor/agent-core eval:agent:case -- packages/agent-core/evals/cases/core/homepage/homepage-sedentary-cardio-visibility.json
```

预期结果：全部 PASS。

**提交说明：**

如果前序任务均已按卡片提交，本任务不需要额外提交。若执行者把多个任务合并执行，使用：

```bash
git add packages/agent-core/src/context/context-packet.ts packages/agent-core/src/context/homepage-event-insights.ts packages/agent-core/src/prompts/context-packet-renderer.ts data/sandbox/prompts/homepage/template.md packages/agent-core/src/output/verifier.ts packages/agent-core/src/__tests__/context/homepage-event-insights.test.ts packages/agent-core/src/__tests__/prompts/context-packet-renderer.test.ts packages/agent-core/src/__tests__/output/verifier.test.ts packages/agent-core/evals/cases/core/homepage/homepage-sedentary-cardio-visibility.json
git commit -m "feat(agent-core): enforce realtime event visibility"
```

---

## 执行顺序

### 依赖关系

| 任务 | blockedBy | 说明 |
|------|-----------|------|
| 1.1 增加事件展示契约类型 | - | 定义后续所有模块使用的类型字段。 |
| 2.1 计算 mention policy 和 transition context | 1.1 | 使用 `HomepageEventMentionPolicy` 和 `HomepageEventTransitionContext`。 |
| 2.2 实现 action suppression 并移除运动后散步建议 | 2.1 | 使用 `transitionContext.actionSuppressions` 和当前/前一事件关系。 |
| 3.1 拆分 homepage event renderer | 2.1 | renderer 读取 `mentionPolicy` 和 `transitionContext`。 |
| 3.2 更新 homepage prompt 多事件契约 | 3.1 | prompt 文案依赖 renderer 新区块名称。 |
| 4.1 增加 forbidden mention hard verifier | 2.1 | verifier 读取 `transitionContext.forbiddenMentions`。 |
| 4.2 新增连续事件 eval case | 3.2, 4.1 | case 依赖新 prompt 契约和 verifier hard guardrail。 |
| 5.1 运行集成验证并提交收尾 | 1.1, 2.1, 2.2, 3.1, 3.2, 4.1, 4.2 | 验证完整链路。 |

### 执行阶段

**Phase 1（基础契约）：**
- 任务 1.1：增加事件展示契约类型

**Phase 2（转场上下文）：**
- 任务 2.1：计算 mention policy 和 transition context

**Phase 3（Action 策略）：**
- 任务 2.2：实现 action suppression 并移除运动后散步建议

**Phase 4（Prompt renderer 和运行时 guardrail，可并行）：**
- 任务 3.1：拆分 homepage event renderer
- 任务 4.1：增加 forbidden mention hard verifier

**Phase 5（Prompt 文案）：**
- 任务 3.2：更新 homepage prompt 多事件契约

**Phase 6（Eval case）：**
- 任务 4.2：新增连续事件 eval case

**Phase 7（最终验证）：**
- 任务 5.1：运行集成验证并提交收尾

### 关键路径

`1.1 -> 2.1 -> 2.2 -> 3.1 -> 3.2 -> 4.2 -> 5.1`

关键路径决定交付顺序。`4.1` 可在 `2.1` 后与 `3.1` 并行，但 `4.2` 必须等 `3.2` 和 `4.1` 完成。

## Acceptance Criteria

- `HomepageEventInsight` 包含 `mentionPolicy`，当前事件为 `allowed`，前一事件为 `forbidden`。
- 当前事件 insight 包含 `transitionContext`，`sedentary -> cardio` 关系为 `post_sedentary_activation`。
- Renderer 输出 `## 当前可提及事件` 和 `## 内部分析上下文（禁止显式提及）`，前一事件不出现在当前可提及事件区。
- Homepage prompt 不再要求“默认只聚焦最近的 2 个事件”。
- 刚完成运动或步行后，actionIntents 不包含散步、轻走活动、继续运动、轻松有氧。
- Verifier 对 `transitionContext.forbiddenMentions` 泄漏返回 `homepage:event_visibility:forbidden_mention` hard failure。
- 新增 `homepage-sedentary-cardio-visibility.json` eval case 通过。
- 定向单测、typecheck、新增 eval case 均通过。
