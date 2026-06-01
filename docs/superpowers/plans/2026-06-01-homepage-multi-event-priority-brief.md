# Homepage Multi-Event Priority Brief Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复首页实时简报在连续事件场景下的主次顺序：最新事件必须成为 summary 主体，较早事件只能作为背景或因果前文。

**Architecture:** 在 `HomepageEventInsight` 层显式建模事件叙事角色，而不是只靠数组顺序和 prompt 提示。`context-packet-builder` 仍负责选取最近事件，`homepage-event-insights` 负责计算 `primary/current_supporting/background` 角色与篇幅预算，renderer 把角色和预算渲染成强约束上下文，eval 用确定性检查保证最新事件优先。

**Tech Stack:** TypeScript, pnpm, Vitest, existing `@health-advisor/agent-core` prompt/context/eval stack.

---

## 问题背景

复现场景：

1. profile-a 初始化后打开 Timeline Control。
2. 先执行有氧事件。
3. 再执行进餐事件。
4. 请求首页实时简报。

当前输出示例：

```text
林巅峰，节奏把握得很好！监测到你刚完成了一场有氧训练，并且已经坐下来好好吃了一顿饭。

刚才那15分钟的有氧运动效率很高，心率峰值达到了142bpm，有氧系统被充分调动，同时也贡献了1700多步的活动量。运动后你很及时地安排了进餐，这20分钟里心率平稳维持在69bpm左右，说明身体正在从运动状态顺利切换到消化吸收模式。
```

主要问题：

- 进餐是后发生事件，更接近 mock 当前时间，应成为开场和主体。
- 运动是较早事件，只应作为“运动后及时进餐”的背景。
- 当前 summary 的篇幅把运动事件写成主角，进餐分析只作为附带句。

现有代码风险点：

- `buildRecentEvents()` 只限制最多 2 个事件，并依赖数组顺序；没有输出“当前主事件/背景事件”的结构化角色。
- `buildHomepageEventInsights()` 只用 `index === 0 ? 'high' : 'medium'` 表达优先级，缺少叙事角色、篇幅预算、主事件规则。
- `buildHeadline()` 对 `meal` 没有专门 headline，走 default：`最近事件持续 X min，需要结合恢复背景判断`，弱于运动 headline。
- `buildRecommendedFocus()` 对 `meal` 没有专门建议，走 default：`安排一次轻量活动切换状态`，无法支撑以进餐为主体的简报。
- `template.md` 说“默认只聚焦最近 2 个事件”，但没有明确“最近结束/最靠近 now 的事件必须占主体篇幅”。
- eval 当前只检查 event words / metric words，没有检查第一段是否命中最新事件，也没有检查较早事件是否被降级为背景。

---

## Module Topology

```text
Module A: Event Narrative Role Model
  Task 1
  No dependency. Must complete before B/C/D.

Module B: Meal Semantics
  Task 2 depends on Task 1

Module C: Renderer and Prompt Contract
  Task 3 depends on Tasks 1-2

Module D: Eval Guardrails
  Task 4 depends on Task 3

Module E: End-to-End Validation
  Task 5 depends on Tasks 1-4
```

Parallelization guidance:

- Task 1 and Task 2 should be done by the same engineer because both touch `homepage-event-insights.ts`.
- Task 4 can start by drafting test cases after Task 1's type names are fixed, but final scorer/case updates should wait for Task 3.
- Task 5 is the final integration gate and must run after all previous tasks.

## File Responsibility Map

| File | Responsibility |
| --- | --- |
| `packages/agent-core/src/context/context-packet.ts` | Add event narrative role and brief budget fields to `HomepageEventInsight`. |
| `packages/agent-core/src/context/homepage-event-insights.ts` | Compute event recency, narrative role, brief budget, meal headline/tension/actions. |
| `packages/agent-core/src/prompts/context-packet-renderer.ts` | Render primary/current-supporting/background roles and suppress older event detail. |
| `data/sandbox/prompts/homepage/template.md` | Strengthen writing contract for multi-event ordering and page budget. |
| `packages/agent-core/src/evals/types.ts` | Add homepage multi-event expectation fields. |
| `packages/agent-core/src/evals/case-schema.ts` | Validate new homepage multi-event expectation fields. |
| `packages/agent-core/src/evals/scorers/task-scorer.ts` | Add deterministic scorer checks for latest-event-first and background-only prior event. |
| `packages/agent-core/evals/cases/core/homepage/*.json` | Add fixture coverage for cardio followed by meal. |

---

## Module A: Event Narrative Role Model

### Task 1: Add Narrative Role and Brief Budget to Homepage Event Insights

**Dependencies:** None.

**Context:** 当前 `priority: high|medium|low` 不足以指导 LLM。需要明确一个事件在 summary 里的叙事职责：最新事件是主体，较早事件是支持背景，持续影响事件是附带提醒。

**Files:**
- Modify: `packages/agent-core/src/context/context-packet.ts`
- Modify: `packages/agent-core/src/context/homepage-event-insights.ts`
- Test: `packages/agent-core/src/__tests__/context/homepage-event-insights.test.ts`

- [ ] **Step 1: Add failing tests**

Append these tests to `packages/agent-core/src/__tests__/context/homepage-event-insights.test.ts`:

```ts
it('marks the most recently ended event as primary even when an older workout has stronger metrics', () => {
  const insights = buildHomepageEventInsights({
    demoNow: '2026-05-31T08:50',
    homepage: makeHomepage({
      recentEvents: [
        {
          type: 'meal_intake',
          start: '2026-05-31T08:20',
          end: '2026-05-31T08:40',
          durationMin: 20,
          confidence: 0.9,
          recognitionEvidence: ['平均心率 69, 少量步数, 进餐模式'],
          eventWindow: {
            source: 'synced_device_samples',
            coverage: 'complete',
            recognizedEventId: 're-meal-1',
            sourceSegmentId: 'seg-meal-1',
            start: '2026-05-31T08:20',
            end: '2026-05-31T08:40',
            durationMin: 20,
            sampleCount: 6,
            metrics: [
              {
                metric: 'heart_rate',
                unit: 'bpm',
                sampleCount: 4,
                startValue: 68,
                endValue: 69,
                latest: 69,
                min: 67,
                max: 71,
                average: 69,
                delta: 1,
                qualifier: 'normal',
                interpretation: '事件窗口心率均值 69bpm，末段 69bpm，符合进餐后的平稳消化切换',
                evidenceId: 'event_window_re-meal-1_heart_rate',
              },
              {
                metric: 'motion',
                unit: 'score',
                sampleCount: 4,
                startValue: 2,
                endValue: 2,
                latest: 2,
                min: 1,
                max: 3,
                average: 2,
                delta: 0,
                qualifier: 'normal',
                interpretation: '事件窗口运动强度低，符合坐下进餐场景',
                evidenceId: 'event_window_re-meal-1_motion',
              },
            ],
            evidenceIds: ['event_window_re-meal-1_heart_rate', 'event_window_re-meal-1_motion'],
          },
          syncState: { lastSyncedMeasuredAt: '2026-05-31T08:40', pendingEventCount: 0, fromSyncedWindow: true },
          evidenceIds: ['event_meal'],
        },
        {
          type: 'steady_cardio',
          start: '2026-05-31T07:55',
          end: '2026-05-31T08:10',
          durationMin: 15,
          confidence: 0.93,
          recognitionEvidence: ['平均心率 132, 步数 1700, 稳态有氧'],
          eventWindow: {
            source: 'synced_device_samples',
            coverage: 'complete',
            recognizedEventId: 're-cardio-1',
            sourceSegmentId: 'seg-cardio-1',
            start: '2026-05-31T07:55',
            end: '2026-05-31T08:10',
            durationMin: 15,
            sampleCount: 8,
            metrics: [
              {
                metric: 'heart_rate',
                unit: 'bpm',
                sampleCount: 4,
                startValue: 120,
                endValue: 126,
                latest: 126,
                min: 118,
                max: 142,
                average: 132,
                delta: 6,
                qualifier: 'elevated',
                interpretation: '事件窗口心率峰值 142bpm，均值 132bpm',
                evidenceId: 'event_window_re-cardio-1_heart_rate',
              },
            ],
            evidenceIds: ['event_window_re-cardio-1_heart_rate'],
          },
          syncState: { lastSyncedMeasuredAt: '2026-05-31T08:40', pendingEventCount: 0, fromSyncedWindow: true },
          evidenceIds: ['event_cardio'],
        },
      ],
    }),
  });

  expect(insights[0]!.eventType).toBe('meal');
  expect(insights[0]!.narrativeRole).toBe('primary');
  expect(insights[0]!.briefBudget).toEqual({
    summarySharePct: 70,
    detailLevel: 'full',
    instruction: 'summary 主体必须围绕这个最新事件展开',
  });
  expect(insights[1]!.eventType).toBe('cardio_workout');
  expect(insights[1]!.narrativeRole).toBe('supporting_context');
  expect(insights[1]!.briefBudget.detailLevel).toBe('one_sentence');
});

it('keeps ongoing caffeine or alcohol as secondary even when it is not the latest event', () => {
  const insights = buildHomepageEventInsights({
    demoNow: '2026-05-31T22:30',
    homepage: makeHomepage({
      recentEvents: [
        {
          type: 'meal_intake',
          start: '2026-05-31T21:40',
          end: '2026-05-31T22:00',
          durationMin: 20,
          confidence: 0.9,
          recognitionEvidence: [],
          syncState: { lastSyncedMeasuredAt: '2026-05-31T22:00', pendingEventCount: 0, fromSyncedWindow: true },
          evidenceIds: ['event_meal'],
        },
        {
          type: 'possible_alcohol_intake',
          start: '2026-05-31T19:00',
          end: '2026-05-31T21:00',
          durationMin: 120,
          confidence: 0.84,
          recognitionEvidence: ['心率升高, RMSSD下降, 低活动'],
          syncState: { lastSyncedMeasuredAt: '2026-05-31T22:00', pendingEventCount: 0, fromSyncedWindow: true },
          evidenceIds: ['event_alcohol'],
        },
      ],
    }),
  });

  expect(insights[0]!.eventType).toBe('meal');
  expect(insights[0]!.narrativeRole).toBe('primary');
  expect(insights[1]!.eventType).toBe('possible_alcohol_intake');
  expect(insights[1]!.narrativeRole).toBe('ongoing_secondary');
  expect(insights[1]!.briefBudget.detailLevel).toBe('one_sentence');
});
```

- [ ] **Step 2: Run failing tests**

Run:

```bash
pnpm --filter @health-advisor/agent-core test -- src/__tests__/context/homepage-event-insights.test.ts
```

Expected: FAIL because `narrativeRole` and `briefBudget` do not exist.

- [ ] **Step 3: Add role and budget types**

In `packages/agent-core/src/context/context-packet.ts`, add:

```ts
export type HomepageEventNarrativeRole =
  | 'primary'
  | 'supporting_context'
  | 'ongoing_secondary'
  | 'background';

export interface HomepageEventBriefBudget {
  summarySharePct: number;
  detailLevel: 'full' | 'one_sentence' | 'mention_only' | 'silent';
  instruction: string;
}
```

Extend `HomepageEventInsight`:

```ts
export interface HomepageEventInsight {
  eventId: string;
  eventType: HomepageSemanticEventType;
  priority: 'high' | 'medium' | 'low';
  narrativeRole: HomepageEventNarrativeRole;
  briefBudget: HomepageEventBriefBudget;
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

- [ ] **Step 4: Compute narrative roles**

In `packages/agent-core/src/context/homepage-event-insights.ts`, add imports:

```ts
import type {
  HomepageEventBriefBudget,
  HomepageEventNarrativeRole,
} from './context-packet';
```

Add helpers:

```ts
function buildNarrativeRole(
  eventType: ReturnType<typeof normalizeHomepageEventType>,
  index: number,
  eventEnd: string,
  demoNow?: string,
): HomepageEventNarrativeRole {
  if (index === 0) return 'primary';
  if (isOngoingSecondaryEvent(eventType, eventEnd, demoNow)) return 'ongoing_secondary';
  if (index === 1) return 'supporting_context';
  return 'background';
}

function buildBriefBudget(role: HomepageEventNarrativeRole): HomepageEventBriefBudget {
  switch (role) {
    case 'primary':
      return {
        summarySharePct: 70,
        detailLevel: 'full',
        instruction: 'summary 主体必须围绕这个最新事件展开',
      };
    case 'supporting_context':
      return {
        summarySharePct: 20,
        detailLevel: 'one_sentence',
        instruction: '只能作为主事件的前因、背景或过渡，不得抢占主体',
      };
    case 'ongoing_secondary':
      return {
        summarySharePct: 20,
        detailLevel: 'one_sentence',
        instruction: '只在与当前状态仍有关时用一句话提醒持续影响',
      };
    case 'background':
      return {
        summarySharePct: 0,
        detailLevel: 'silent',
        instruction: '不要写入 summary，除非安全边界需要',
      };
  }
}

function isOngoingSecondaryEvent(
  eventType: ReturnType<typeof normalizeHomepageEventType>,
  eventEnd: string,
  demoNow?: string,
): boolean {
  if (!demoNow) return false;
  if (eventType !== 'possible_caffeine_intake' && eventType !== 'possible_alcohol_intake') return false;
  const endMs = new Date(`${eventEnd}:00`).getTime();
  const nowMs = new Date(`${demoNow}:00`).getTime();
  const diffHours = (nowMs - endMs) / 3600000;
  return diffHours >= 0 && diffHours <= 12;
}
```

Inside `buildHomepageEventInsights()` map:

```ts
const narrativeRole = buildNarrativeRole(eventType, index, event.end, demoNow);
const briefBudget = buildBriefBudget(narrativeRole);
```

Return:

```ts
narrativeRole,
briefBudget,
priority: narrativeRole === 'primary' ? 'high' : narrativeRole === 'background' ? 'low' : 'medium',
```

- [ ] **Step 5: Run tests**

Run:

```bash
pnpm --filter @health-advisor/agent-core test -- src/__tests__/context/homepage-event-insights.test.ts
pnpm --filter @health-advisor/agent-core typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/agent-core/src/context/context-packet.ts packages/agent-core/src/context/homepage-event-insights.ts packages/agent-core/src/__tests__/context/homepage-event-insights.test.ts
git commit -m "feat(context): assign homepage event narrative roles"
```

---

## Module B: Meal Semantics

### Task 2: Make Meal a First-Class Homepage Event

**Dependencies:** Task 1.

**Context:** 即使 meal 是 primary，当前 meal 缺少专门 headline、tension、recommendedFocus 和 actions，LLM 会继续偏向运动事件。meal 需要表达“运动后进餐/刚吃完饭/消化切换/餐后轻活动/今晚恢复保护”等语义。

**Files:**
- Modify: `packages/agent-core/src/context/homepage-event-insights.ts`
- Test: `packages/agent-core/src/__tests__/context/homepage-event-insights.test.ts`

- [ ] **Step 1: Add failing meal semantic test**

Append to `packages/agent-core/src/__tests__/context/homepage-event-insights.test.ts`:

```ts
it('builds meal-specific headline, tension and action intents when meal is primary', () => {
  const insights = buildHomepageEventInsights({
    demoNow: '2026-05-31T08:50',
    homepage: makeHomepage({
      recentEvents: [{
        type: 'meal_intake',
        start: '2026-05-31T08:20',
        end: '2026-05-31T08:40',
        durationMin: 20,
        confidence: 0.9,
        recognitionEvidence: ['平均心率 69, 少量步数, 进餐模式'],
        eventWindow: {
          source: 'synced_device_samples',
          coverage: 'complete',
          recognizedEventId: 're-meal-1',
          sourceSegmentId: 'seg-meal-1',
          start: '2026-05-31T08:20',
          end: '2026-05-31T08:40',
          durationMin: 20,
          sampleCount: 6,
          metrics: [{
            metric: 'heart_rate',
            unit: 'bpm',
            sampleCount: 4,
            startValue: 68,
            endValue: 69,
            latest: 69,
            min: 67,
            max: 71,
            average: 69,
            delta: 1,
            qualifier: 'normal',
            interpretation: '事件窗口心率均值 69bpm，末段 69bpm，符合进餐后的平稳消化切换',
            evidenceId: 'event_window_re-meal-1_heart_rate',
          }],
          evidenceIds: ['event_window_re-meal-1_heart_rate'],
        },
        syncState: { lastSyncedMeasuredAt: '2026-05-31T08:40', pendingEventCount: 0, fromSyncedWindow: true },
        evidenceIds: ['event_meal'],
      }],
    }),
  });

  const meal = insights[0]!;
  expect(meal.eventType).toBe('meal');
  expect(meal.headline).toContain('刚完成');
  expect(meal.headline).toContain('进餐');
  expect(meal.tension.summary).toContain('消化');
  expect(meal.recommendedFocus.map((focus) => focus.category)).toContain('post_meal_ease');
  expect(meal.actionIntents.some((action) => action.title.includes('缓一缓') || action.title.includes('轻走'))).toBe(true);
});
```

- [ ] **Step 2: Run failing test**

Run:

```bash
pnpm --filter @health-advisor/agent-core test -- src/__tests__/context/homepage-event-insights.test.ts
```

Expected: FAIL because `post_meal_ease` category does not exist and meal uses default headline/action.

- [ ] **Step 3: Extend recommended focus category**

In `packages/agent-core/src/context/context-packet.ts`, extend `RecommendedFocus['category']`:

```ts
    | 'post_meal_ease'
```

- [ ] **Step 4: Add meal tension logic**

In `determineEventBodyTension()` before workout logic:

```ts
if (eventType === 'meal') {
  if (hrElevated || stressElevated) {
    return { level: 'watch', summary: '进餐后身体正在消化切换，心率或压力信号略偏紧', reason: 'meal event with elevated event-window markers' };
  }
  return { level: 'positive', summary: '进餐后身体正在平稳切换到消化吸收模式', reason: 'meal event with stable event-window markers' };
}
```

- [ ] **Step 5: Add meal recommended focus**

In `buildRecommendedFocus()`, add case before workout:

```ts
case 'meal':
  return [
    { category: 'post_meal_ease', action: '刚吃完先坐着缓一缓', durationMin: 10, rationale: '让血液分配从运动或活动状态平稳转向消化吸收' },
    { category: 'movement_reset', action: '稍后进行轻度走动', durationMin: 10, rationale: '帮助消化和血糖平稳过渡，但不要立刻进行高强度活动' },
    { category: 'sleep_protection', action: '今晚提前进入低刺激节奏', timing: '睡前 60 min', rationale: '如果昨晚睡眠偏少，保护今晚深睡窗口更重要' },
  ];
```

- [ ] **Step 6: Add meal headline**

In `buildHeadline()`:

```ts
case 'meal':
  return `刚完成 ${durationMin} min 进餐，身体正在切换到消化吸收模式`;
```

- [ ] **Step 7: Add action title/icon support**

In `emojiForFocus()`:

```ts
case 'post_meal_ease':
  return '🍽️';
```

In `titleForFocus()`:

```ts
case 'post_meal_ease':
  return '刚吃完先缓一缓';
```

- [ ] **Step 8: Run tests**

Run:

```bash
pnpm --filter @health-advisor/agent-core test -- src/__tests__/context/homepage-event-insights.test.ts
pnpm --filter @health-advisor/agent-core typecheck
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add packages/agent-core/src/context/context-packet.ts packages/agent-core/src/context/homepage-event-insights.ts packages/agent-core/src/__tests__/context/homepage-event-insights.test.ts
git commit -m "feat(context): support meal-led homepage briefs"
```

---

## Module C: Renderer and Prompt Contract

### Task 3: Render Primary Event First and Constrain Older Events to Background

**Dependencies:** Tasks 1-2.

**Context:** LLM 要看到强结构化约束：哪个事件是主事件、哪个事件只能写一句背景、各自篇幅预算是多少。不要只靠“权重高/中/低”。

**Files:**
- Modify: `packages/agent-core/src/prompts/context-packet-renderer.ts`
- Modify: `data/sandbox/prompts/homepage/template.md`
- Test: `packages/agent-core/src/__tests__/prompts/context-packet-renderer.test.ts`
- Test: `packages/agent-core/src/__tests__/prompts/task-builder.test.ts`

- [ ] **Step 1: Add failing renderer test**

Append to `packages/agent-core/src/__tests__/prompts/context-packet-renderer.test.ts`:

```ts
it('renders primary meal before supporting workout with explicit budget constraints', () => {
  const packet: TaskContextPacket = {
    task: { type: 'homepage_summary', page: 'home' },
    userContext: {
      profileId: 'profile-a',
      name: '林巅峰',
      age: 28,
      tags: ['规律健身'],
      baselines: { restingHR: 48, hrv: 93, spo2: 99, avgSleepMinutes: 600, avgSteps: 5900 },
    },
    dataWindow: { start: '2026-05-25', end: '2026-05-31', recordCount: 7, completenessPct: 100 },
    missingData: [],
    evidence: [],
    visibleCharts: [],
    homepage: {
      recentEvents: [
        {
          type: 'meal_intake',
          start: '2026-05-31T08:20',
          end: '2026-05-31T08:40',
          durationMin: 20,
          confidence: 0.9,
          recognitionEvidence: ['平均心率 69, 少量步数, 进餐模式'],
          syncState: { lastSyncedMeasuredAt: '2026-05-31T08:40', pendingEventCount: 0, fromSyncedWindow: true },
          evidenceIds: ['event_meal'],
        },
        {
          type: 'steady_cardio',
          start: '2026-05-31T07:55',
          end: '2026-05-31T08:10',
          durationMin: 15,
          confidence: 0.93,
          recognitionEvidence: ['平均心率 132, 步数 1700, 稳态有氧'],
          syncState: { lastSyncedMeasuredAt: '2026-05-31T08:40', pendingEventCount: 0, fromSyncedWindow: true },
          evidenceIds: ['event_cardio'],
        },
      ],
      eventInsights: [
        {
          eventId: 'event_meal',
          eventType: 'meal',
          priority: 'high',
          narrativeRole: 'primary',
          briefBudget: { summarySharePct: 70, detailLevel: 'full', instruction: 'summary 主体必须围绕这个最新事件展开' },
          timeRelation: '刚结束约 10 min',
          headline: '刚完成 20 min 进餐，身体正在切换到消化吸收模式',
          physiology: [{ metric: 'heart_rate', value: 69, unit: 'bpm', qualifier: 'normal', interpretation: '事件窗口心率均值 69bpm，末段 69bpm，符合进餐后的平稳消化切换', evidenceId: 'meal_hr' }],
          recoveryContext: [],
          tension: { level: 'positive', summary: '进餐后身体正在平稳切换到消化吸收模式', reason: 'meal event with stable event-window markers' },
          recommendedFocus: [{ category: 'post_meal_ease', action: '刚吃完先坐着缓一缓', durationMin: 10, rationale: '让身体平稳转向消化吸收' }],
          actionIntents: [],
          evidenceIds: ['event_meal', 'meal_hr'],
        },
        {
          eventId: 'event_cardio',
          eventType: 'cardio_workout',
          priority: 'medium',
          narrativeRole: 'supporting_context',
          briefBudget: { summarySharePct: 20, detailLevel: 'one_sentence', instruction: '只能作为主事件的前因、背景或过渡，不得抢占主体' },
          timeRelation: '约 40 min 前结束',
          headline: '完成 15 min 训练，身体进入恢复窗口',
          physiology: [{ metric: 'heart_rate', value: 142, unit: 'bpm', qualifier: 'elevated', interpretation: '事件窗口心率峰值 142bpm，均值 132bpm', evidenceId: 'cardio_hr' }],
          recoveryContext: [],
          tension: { level: 'watch', summary: '运动事件已经进入恢复窗口，需要降低后续刺激', reason: 'event-window workout recovery markers present' },
          recommendedFocus: [{ category: 'hydration', action: '小口补水并做轻度走动冷身', durationMin: 10, rationale: '帮助心率平稳回落' }],
          actionIntents: [],
          evidenceIds: ['event_cardio', 'cardio_hr'],
        },
      ],
      latest24h: { date: '2026-05-31', metrics: [] },
      trend7d: [],
      rulesInsights: [],
      suggestedChartTokens: [],
    },
  };

  const output = renderTaskContextPacket(packet, 'zh', '2026-05-31T08:50');

  expect(output).toContain('叙事角色：primary');
  expect(output).toContain('summary 占比：70%');
  expect(output).toContain('叙事角色：supporting_context');
  expect(output).toContain('只能作为主事件的前因、背景或过渡');
  expect(output.indexOf('event_meal')).toBeLessThan(output.indexOf('event_cardio'));
});
```

- [ ] **Step 2: Run failing renderer test**

Run:

```bash
pnpm --filter @health-advisor/agent-core test -- src/__tests__/prompts/context-packet-renderer.test.ts
```

Expected: FAIL because renderer does not render narrative roles or budgets.

- [ ] **Step 3: Render role and budget in event insights**

In `renderHomepageEventInsights()`, after each insight header line, add:

```ts
lines.push(`  - ${t(locale, '叙事角色', 'Narrative role')}${colon(locale)}${insight.narrativeRole}`);
lines.push(`  - ${t(locale, 'summary 占比', 'Summary share')}${colon(locale)}${insight.briefBudget.summarySharePct}%`);
lines.push(`  - ${t(locale, '写作约束', 'Writing constraint')}${colon(locale)}${insight.briefBudget.instruction}`);
```

When rendering `physiology`, suppress details for `background` and `silent`:

```ts
if (insight.briefBudget.detailLevel !== 'silent') {
  for (const item of insight.physiology) {
    const value = item.value !== undefined ? ` ${item.value}${item.unit ?? ''}` : '';
    lines.push(`  - ${t(locale, '生理特征', 'Physiology')}${colon(locale)}${item.metric} ${item.qualifier}${value} — ${item.interpretation}`);
  }
}
```

For `supporting_context` and `ongoing_secondary`, keep only the first two physiology lines:

```ts
const physiologyItems = insight.briefBudget.detailLevel === 'one_sentence'
  ? insight.physiology.slice(0, 2)
  : insight.physiology;
```

- [ ] **Step 4: Update content priority line**

In `renderHomepage()`, replace:

```ts
'> 内容优先级：事件详情是主体（≥50%），24h 状态仅作交叉验证（≤30%），趋势数据一句话概括即可'
```

with:

```ts
'> 内容优先级：primary 事件是主体（约70%），supporting_context/ongoing_secondary 只能各用一句话作为背景（合计≤20%），24h 状态仅作交叉验证（≤10%）'
```

Also update English text similarly:

```ts
'> Content priority: primary event is the main subject (~70%), supporting_context/ongoing_secondary are one-sentence background only (combined <=20%), 24h status is cross-validation only (<=10%)'
```

- [ ] **Step 5: Update homepage template**

In `data/sandbox/prompts/homepage/template.md`, replace the paragraph 2 rule:

```md
**默认只聚焦最近的 2 个事件**展开分析：事件是什么、持续多久、有什么生理特征，对当下有什么影响。不要回溯更早的历史事件，禁止把 3 个以上事件逐一罗列。唯一的例外：咖啡因或饮酒事件即使在最近 2 个之外，只要上下文标注了「影响持续中」，仍需用 1 句话提及其持续影响。24h 恢复状态仅作为事件的交叉验证，用 1-2 句话概括即可（如"从恢复指标看，身体状态还不错"或"但昨晚睡眠偏少，恢复还没跟上"）。
```

with:

```md
**多事件排序规则：必须以 `narrativeRole=primary` 的事件作为开场和主体。primary 通常是最靠近当前模拟时间、最近结束的事件。summary 的核心分析约 70% 写 primary 事件：它是什么、刚发生了什么生理变化、对用户当下意味着什么。`supporting_context` 或 `ongoing_secondary` 只能各用一句话作为前因、背景或持续影响，合计不超过 20%。禁止让较早事件抢占主体，即使较早事件的心率、步数或 HRV 数字更显眼。24h 恢复状态仅作为交叉验证，最多 1 句话。**
```

Add a concrete rule:

```md
如果 primary 是进餐，summary 必须先讲刚完成进餐和消化切换；较早的运动只能写成“前面运动后及时进餐”的背景，不能先展开运动训练效果。
```

- [ ] **Step 6: Run prompt tests**

Run:

```bash
pnpm --filter @health-advisor/agent-core test -- src/__tests__/prompts/context-packet-renderer.test.ts src/__tests__/prompts/task-builder.test.ts
pnpm --filter @health-advisor/agent-core typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/agent-core/src/prompts/context-packet-renderer.ts data/sandbox/prompts/homepage/template.md packages/agent-core/src/__tests__/prompts/context-packet-renderer.test.ts packages/agent-core/src/__tests__/prompts/task-builder.test.ts
git commit -m "feat(prompt): enforce primary event brief order"
```

---

## Module D: Eval Guardrails

### Task 4: Add Multi-Event Ordering Eval Checks

**Dependencies:** Task 3.

**Context:** 需要让 eval 对“先有氧后进餐”的错误输出失败。检查点：summary 开头必须命中 primary meal；older cardio 词不能在 meal 词之前出现；older cardio 的占比不能超过 meal。

**Files:**
- Modify: `packages/agent-core/src/evals/types.ts`
- Modify: `packages/agent-core/src/evals/case-schema.ts`
- Modify: `packages/agent-core/src/evals/scorers/task-scorer.ts`
- Test: `packages/agent-core/src/__tests__/evals/case-schema.test.ts`
- Test: `packages/agent-core/src/__tests__/evals/scorers.test.ts`
- Create: `packages/agent-core/evals/cases/core/homepage/homepage-cardio-then-meal-primary.json`

- [ ] **Step 1: Extend eval types**

In `packages/agent-core/src/evals/types.ts`, add fields under `taskSpecific.homepage`:

```ts
primaryEventPatterns?: string[];
supportingEventPatterns?: string[];
requirePrimaryBeforeSupporting?: boolean;
forbidSupportingEventFirst?: boolean;
```

- [ ] **Step 2: Extend case schema**

In `packages/agent-core/src/evals/case-schema.ts`, add:

```ts
primaryEventPatterns: z.array(z.string()).optional(),
supportingEventPatterns: z.array(z.string()).optional(),
requirePrimaryBeforeSupporting: z.boolean().optional(),
forbidSupportingEventFirst: z.boolean().optional(),
```

Add refine:

```ts
.refine(
  (data) =>
    !data.requirePrimaryBeforeSupporting ||
    ((data.primaryEventPatterns?.length ?? 0) > 0 && (data.supportingEventPatterns?.length ?? 0) > 0),
  {
    message: 'requirePrimaryBeforeSupporting 为 true 时，primaryEventPatterns 和 supportingEventPatterns 必须提供且非空',
    path: ['primaryEventPatterns'],
  },
)
```

- [ ] **Step 3: Add scorer helpers**

In `packages/agent-core/src/evals/scorers/task-scorer.ts`, inside `checkHomepage()` add:

```ts
if (homepage.requirePrimaryBeforeSupporting) {
  results.push(checkPrimaryBeforeSupporting(
    caseId,
    envelope.summary,
    homepage.primaryEventPatterns ?? [],
    homepage.supportingEventPatterns ?? [],
  ));
}
if (homepage.forbidSupportingEventFirst) {
  results.push(checkSupportingNotFirst(
    caseId,
    envelope.summary,
    homepage.supportingEventPatterns ?? [],
  ));
}
```

Add helpers:

```ts
function firstMatchIndex(text: string, patterns: string[]): number {
  const indexes = patterns
    .map((pattern) => text.search(new RegExp(pattern)))
    .filter((index) => index >= 0);
  return indexes.length > 0 ? Math.min(...indexes) : -1;
}

function checkPrimaryBeforeSupporting(
  caseId: string,
  summary: string,
  primaryPatterns: string[],
  supportingPatterns: string[],
): EvalCheckResult {
  if (primaryPatterns.length === 0 || supportingPatterns.length === 0) {
    return {
      checkId: `${caseId}:task:homepage:primary_before_supporting`,
      severity: 'hard',
      passed: false,
      score: 0,
      maxScore: 1,
      message: '缺少 primaryEventPatterns 或 supportingEventPatterns',
      details: { reason: 'missing_patterns' },
    };
  }

  const primaryIndex = firstMatchIndex(summary, primaryPatterns);
  const supportingIndex = firstMatchIndex(summary, supportingPatterns);
  const passed = primaryIndex >= 0 && (supportingIndex < 0 || primaryIndex < supportingIndex);
  return {
    checkId: `${caseId}:task:homepage:primary_before_supporting`,
    severity: 'hard',
    passed,
    score: passed ? 1 : 0,
    maxScore: 1,
    message: passed ? 'primary event appears before supporting event' : 'supporting event appears before primary event',
    details: { primaryIndex, supportingIndex },
  };
}

function checkSupportingNotFirst(
  caseId: string,
  summary: string,
  supportingPatterns: string[],
): EvalCheckResult {
  const summaryHead = summary.slice(0, 60);
  const matched = supportingPatterns.filter((pattern) => new RegExp(pattern).test(summaryHead));
  const passed = matched.length === 0;
  return {
    checkId: `${caseId}:task:homepage:supporting_not_first`,
    severity: 'hard',
    passed,
    score: passed ? 1 : 0,
    maxScore: 1,
    message: passed ? 'summary head does not start from supporting event' : 'summary head starts from supporting event',
    details: passed ? undefined : { matched, summaryHead },
  };
}
```

- [ ] **Step 4: Add scorer tests**

Append to homepage scorer tests in `packages/agent-core/src/__tests__/evals/scorers.test.ts`:

```ts
it('requirePrimaryBeforeSupporting fails when workout appears before meal', () => {
  const envelope = createValidEnvelope({
    summary: '林巅峰，刚完成了一场有氧训练，并且已经坐下来吃饭。刚才运动心率峰值达到了142bpm，进餐时心率稳定在69bpm。',
  });
  const evalCase = createValidCase({
    expectations: {
      taskSpecific: {
        homepage: {
          requirePrimaryBeforeSupporting: true,
          primaryEventPatterns: ['进餐', '吃饭', '消化'],
          supportingEventPatterns: ['有氧', '运动', '训练'],
          forbidSupportingEventFirst: true,
        },
      },
    },
  });

  const results = taskScorer.score(createScorerInput({ evalCase: evalCase as any, envelope }));
  expect(results.find((result) => result.checkId.includes('primary_before_supporting'))?.passed).toBe(false);
  expect(results.find((result) => result.checkId.includes('supporting_not_first'))?.passed).toBe(false);
});

it('requirePrimaryBeforeSupporting passes when meal appears before workout background', () => {
  const envelope = createValidEnvelope({
    summary: '林巅峰，刚吃完早饭，身体正在平稳切换到消化吸收模式。前面那段有氧训练可以作为背景：你运动后及时补充了能量。',
  });
  const evalCase = createValidCase({
    expectations: {
      taskSpecific: {
        homepage: {
          requirePrimaryBeforeSupporting: true,
          primaryEventPatterns: ['进餐', '吃完', '消化'],
          supportingEventPatterns: ['有氧', '运动', '训练'],
          forbidSupportingEventFirst: true,
        },
      },
    },
  });

  const results = taskScorer.score(createScorerInput({ evalCase: evalCase as any, envelope }));
  expect(results.find((result) => result.checkId.includes('primary_before_supporting'))?.passed).toBe(true);
  expect(results.find((result) => result.checkId.includes('supporting_not_first'))?.passed).toBe(true);
});
```

- [ ] **Step 5: Add eval case**

Create `packages/agent-core/evals/cases/core/homepage/homepage-cardio-then-meal-primary.json`:

```json
{
  "id": "H-030",
  "title": "首页摘要 - 有氧后进餐时进餐必须成为主体",
  "suite": "core",
  "category": "homepage",
  "priority": "P1",
  "tags": ["homepage", "event-order", "meal", "cardio"],
  "setup": {
    "profileId": "profile-a",
    "timeline": {
      "appendSegments": [
        {
          "segmentType": "steady_cardio",
          "offsetMinutes": 0,
          "durationMinutes": 15,
          "advanceClock": true
        },
        {
          "segmentType": "meal_intake",
          "offsetMinutes": 5,
          "durationMinutes": 20,
          "advanceClock": true
        }
      ]
    },
    "modelFixture": {
      "mode": "fake-json",
      "content": "{\"source\":\"llm\",\"statusColor\":\"good\",\"summary\":\"林巅峰，刚吃完早饭，身体正在从前面的有氧输出平稳切换到消化吸收模式。\\n\\n这次进餐窗口里心率稳定在 69bpm 左右，运动强度已经降下来，说明身体没有继续卡在训练兴奋状态，而是在把能量转向补给和恢复。前面 15 min 有氧可以作为背景：它把心率推到过 142bpm，也贡献了 1700 多步，所以现在及时进餐更像是一次补能收尾，而不是继续加码训练。\\n\\n刚吃完先坐着缓 10 min，稍后再轻走 10 min 帮助消化。昨晚睡眠略少，今晚可以提前进入低刺激节奏，把恢复窗口补回来。\",\"chartTokens\":[\"ACTIVITY_7DAYS\"],\"actionsSectionTitle\":\"刚吃完可以这样安排\",\"microTips\":[],\"actions\":[{\"id\":\"a1\",\"emoji\":\"🍽️\",\"title\":\"刚吃完先缓一缓\",\"description\":\"先坐着缓 10 min，让身体平稳转向消化吸收\",\"aiPromise\":\"我会记录你的选择并用于本次建议上下文\"},{\"id\":\"a2\",\"emoji\":\"🚶\",\"title\":\"稍后轻走一下\",\"description\":\"过一会儿轻走 10 min，帮助消化和血糖平稳过渡\",\"aiPromise\":\"我会记录你的选择并用于本次建议上下文\"}]}"
    },
    "referenceDate": "2026-05-31"
  },
  "request": {
    "requestId": "core-h030",
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
        ["进餐", "吃完", "消化"],
        ["有氧", "运动"]
      ],
      "forbiddenPatterns": ["baseline", "基线", "基准线", "偏离基线"]
    },
    "status": {
      "allowedStatusColors": ["good", "warning"]
    },
    "actions": {
      "minCount": 2,
      "maxCount": 3,
      "requireAiPromise": true,
      "forbiddenPatterns": ["实时监控", "调整监测逻辑", "开启.*模式", "准时提醒", "无干扰模式"]
    },
    "taskSpecific": {
      "homepage": {
        "requireRecentEventFirst": true,
        "recentEventPatterns": ["进餐", "吃完", "消化"],
        "requirePrimaryBeforeSupporting": true,
        "primaryEventPatterns": ["进餐", "吃完", "消化"],
        "supportingEventPatterns": ["有氧", "运动", "训练"],
        "forbidSupportingEventFirst": true,
        "requireEventWindowFacts": true,
        "eventWindowValuePatterns": ["69\\s*bpm", "142\\s*bpm", "1700"]
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

- [ ] **Step 6: Run eval tests**

Run:

```bash
pnpm --filter @health-advisor/agent-core test -- src/__tests__/evals/case-schema.test.ts src/__tests__/evals/scorers.test.ts
pnpm --filter @health-advisor/agent-core eval:agent:case -- H-030
```

Expected: PASS. The case must fail if the fixture starts with `有氧训练` before `进餐/吃完/消化`.

- [ ] **Step 7: Commit**

```bash
git add packages/agent-core/src/evals/types.ts packages/agent-core/src/evals/case-schema.ts packages/agent-core/src/evals/scorers/task-scorer.ts packages/agent-core/src/__tests__/evals/case-schema.test.ts packages/agent-core/src/__tests__/evals/scorers.test.ts packages/agent-core/evals/cases/core/homepage/homepage-cardio-then-meal-primary.json
git commit -m "test(eval): enforce homepage primary event ordering"
```

---

## Module E: End-to-End Validation

### Task 5: Validate Timeline Control Cardio-Then-Meal Behavior

**Dependencies:** Tasks 1-4.

**Context:** Unit tests and fixture evals are necessary but not sufficient. The final behavior must be checked against the user-reported Timeline Control flow.

**Files:**
- No required source modifications if validation passes.
- Do not commit generated eval reports unless the repo already tracks that report path.

- [ ] **Step 1: Run targeted unit tests**

Run:

```bash
pnpm --filter @health-advisor/agent-core test -- src/__tests__/context/homepage-event-insights.test.ts src/__tests__/prompts/context-packet-renderer.test.ts src/__tests__/evals/scorers.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run typecheck**

Run:

```bash
pnpm --filter @health-advisor/agent-core typecheck
```

Expected: PASS.

- [ ] **Step 3: Run core fixture evals**

Run:

```bash
pnpm --filter @health-advisor/agent-core eval:agent:core:fixture
```

Expected: PASS with zero hard failures.

- [ ] **Step 4: Manually verify generated prompt for H-030**

Run:

```bash
pnpm --filter @health-advisor/agent-core eval:agent:case -- H-030
```

Open the generated report path printed by eval runner. In the prompt, verify:

```text
叙事角色：primary
summary 占比：70%
eventType: meal 或 [high] meal
叙事角色：supporting_context
只能作为主事件的前因、背景或过渡
```

Also verify the primary meal block appears before the cardio supporting block.

- [ ] **Step 5: Manual product flow**

Run the local app if needed:

```bash
pnpm dev
```

In the browser:

1. Select profile-a.
2. Reset profile timeline.
3. In Timeline Control, append `steady_cardio` / 有氧 15 min and advance clock.
4. Append `meal_intake` / 早餐 20 min and advance clock.
5. Refresh homepage realtime brief.

Expected summary shape:

```text
林巅峰，刚吃完/完成进餐...

主体段落先解释进餐窗口：心率约 69bpm、消化吸收切换、刚运动后及时补能。
有氧训练只能作为一句背景：前面 15 min 有氧、心率峰值 142bpm、1700 多步。
建议先围绕餐后缓一缓/稍后轻走/今晚恢复，不应先建议运动后恢复。
```

Failure condition:

```text
开头先说“刚完成有氧训练”
第二段先详细展开运动心率峰值、步数、有氧系统
进餐只作为“并且吃了一顿饭”的附带句
```

- [ ] **Step 6: Commit final adjustments if needed**

If validation required code or test changes:

```bash
git add packages/agent-core data/sandbox
git commit -m "fix(agent): prioritize latest homepage event narrative"
```

If no files changed after validation, do not create an empty commit.

---

## Acceptance Criteria

- 在多个最近事件存在时，`eventInsights[0].narrativeRole` 必须是 `primary`。
- primary 必须对应最靠近 `demoNow` 的最近结束事件，而不是生理数字最强的事件。
- 当事件顺序是 `steady_cardio -> meal_intake` 时，summary 开头和主体必须先讲 meal。
- cardio 在该场景中只能作为 supporting_context，一句话说明“前面运动后及时补能/进餐”。
- meal 有专门 headline、tension、recommendedFocus 和 actions，不再走 default 逻辑。
- prompt 中明确渲染 `叙事角色`、`summary 占比`、`写作约束`。
- eval 会让“有氧先于进餐展开”的输出失败。
- 不引入基于字符串后处理 summary 的补丁；修复必须发生在结构化上下文、prompt contract 和 eval guardrail 层。

## Self-Review Checklist for Implementers

- 没有通过后处理把 LLM 输出重排。
- 没有用简单关键词替换来压低运动内容。
- 没有删除 cardio 事件；只是把它降级为 supporting_context。
- meal primary 场景下 actions 不建议用户继续运动训练。
- 所有新增 scorer 都有失败用例和通过用例。
- 每个任务提交都使用 conventional commit。
