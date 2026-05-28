# Homepage Realtime Brief Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a deterministic homepage event insight layer so realtime briefs focus on recent events, explain body tension, and produce trustworthy actionable options.

**Architecture:** Keep the current `executeAgent()` runtime and `AgentResponseEnvelope` protocol. Add a homepage-only `eventInsights` layer inside `TaskContextPacket`, render it into the homepage prompt as the primary LLM input, then protect output quality with verifier and eval coverage.

**Tech Stack:** TypeScript, pnpm, Vitest, Zod, existing `@health-advisor/agent-core` prompt/runtime/eval stack.

---

## Module Topology

```text
Module A: Prompt Cleanup
  Task 1
  No dependency. Can run first.

Module B: Event Insight Data Model
  Task 2
  No dependency. Must complete before C/D/E.

Module C: Event Insight Builder
  Task 3 depends on Task 2
  Task 4 depends on Task 3

Module D: Packet + Renderer Integration
  Task 5 depends on Task 3 and Task 4

Module E: Prompt Contract Alignment
  Task 6 depends on Task 1 and Task 5

Module F: Output Quality Verifier
  Task 7 depends on Task 2 and Task 5

Module G: Eval Coverage
  Task 8 depends on Task 6 and Task 7

Module H: End-to-End Validation
  Task 9 depends on all previous tasks
```

Parallelization guidance:

- Task 1 and Task 2 can run in parallel.
- Task 7 can begin after Task 5, without waiting for Task 8.
- Task 8 should wait for prompt and verifier changes so cases encode the final contract.
- Task 9 is the final integration gate.

## File Responsibility Map

| File | Responsibility |
| --- | --- |
| `data/sandbox/prompts/homepage/template.md` | Homepage writing contract and redlines |
| `data/sandbox/prompts/homepage/style/zh.md` | Chinese voice and action style |
| `packages/agent-core/src/prompts/task-builder.ts` | JSON output example and task constraints |
| `packages/agent-core/src/context/context-packet.ts` | Packet type definitions, including new `eventInsights` |
| `packages/agent-core/src/context/homepage-event-insights.ts` | New pure builder for homepage event insights |
| `packages/agent-core/src/context/context-packet-builder.ts` | Wire event insights into `HomepageContextPacket` |
| `packages/agent-core/src/prompts/context-packet-renderer.ts` | Render event insights and avoid old terminology |
| `packages/agent-core/src/output/verifier.ts` | Homepage action quality and forbidden-term checks |
| `packages/agent-core/src/evals/case-schema.ts` | Eval expectation schema if action checks need additional fields |
| `packages/agent-core/src/evals/scorers/action-scorer.ts` | Deterministic action eval checks |
| `packages/agent-core/evals/cases/core/homepage/*.json` | New representative homepage event cases |

---

## Module A: Prompt Cleanup

### Task 1: Remove Active Prompt Terminology Drift

**Dependencies:** None.

**Purpose:** Stop active homepage prompts and output examples from reintroducing `baseline` wording or legacy `microTips` emphasis before the new event insight layer lands.

**Files:**
- Modify: `data/sandbox/prompts/homepage/template.md`
- Modify: `data/sandbox/prompts/homepage/style/zh.md`
- Modify: `packages/agent-core/src/prompts/task-builder.ts`
- Test: `packages/agent-core/src/__tests__/prompts/task-builder.test.ts`

- [ ] **Step 1: Add failing prompt contract tests**

Add these tests to `packages/agent-core/src/__tests__/prompts/task-builder.test.ts`. If this file already has helper factories, reuse local helper names but keep these assertions unchanged.

```ts
it('homepage task prompt does not expose baseline jargon in active instructions', () => {
  const prompt = buildTaskPrompt(makeContext({
    task: {
      type: AgentTaskType.HOMEPAGE_SUMMARY,
      pageContext: { profileId: 'profile-a', page: 'homepage', timeframe: 'week' },
    },
  }), createPromptLoader(), emptyRules);

  expect(prompt).not.toMatch(/baseline|基线|基准线|偏离基线/);
  expect(prompt).toContain('个人参考水平');
  expect(prompt).toContain('平时水平');
});

it('homepage output example emphasizes actions instead of microTips', () => {
  const prompt = buildTaskPrompt(makeContext({
    task: {
      type: AgentTaskType.HOMEPAGE_SUMMARY,
      pageContext: { profileId: 'profile-a', page: 'homepage', timeframe: 'week' },
    },
  }), createPromptLoader(), emptyRules);

  expect(prompt).toContain('"actions"');
  expect(prompt).toContain('"actionsSectionTitle"');
  expect(prompt).not.toContain('"microTips": ["贴士1", "贴士2"]');
  expect(prompt).not.toContain('returned to baseline');
});
```

- [ ] **Step 2: Run the failing tests**

Run:

```bash
pnpm --filter @health-advisor/agent-core test -- src/__tests__/prompts/task-builder.test.ts
```

Expected: FAIL because active prompt text or JSON example still contains `baseline` or the legacy `microTips` example.

- [ ] **Step 3: Update active homepage template wording**

Edit `data/sandbox/prompts/homepage/template.md` with these exact policy changes:

```md
当存在最近事件（recentEvents 非空）时，summary 三个段落的篇幅必须遵循以下比例：
- **事件本身及其影响（发生了什么，会产生什么影响）≥ 70%**
- **24h 状态与个人参考水平交叉验证 ≤ 15%**
- **建议与引导 ≤ 15%**

**禁止的行为：**
- 禁止把 24h 各项指标逐个罗列
- 禁止花大量篇幅解释相对平时水平的偏差百分比
- 禁止将 trend7d 趋势数据作为分析主体
```

In the same file, replace every visible `baseline` reference with one of:

```md
个人参考水平
平时水平
通常水平
```

Keep internal concepts intact. Do not remove profile baseline fields from code or docs that describe internal data structures.

- [ ] **Step 4: Update homepage output example in task builder**

In `packages/agent-core/src/prompts/task-builder.ts`, update the homepage JSON example block to remove `microTips` from the example and avoid English `baseline` wording. The homepage branch should end like this:

```ts
sections.push('  "chartTokens": ["CHART_TOKEN_1"],');
sections.push(t(
  locale,
  '  "actions": [\n    {\n      "id": "action_1",\n      "emoji": "🚶",\n      "title": "要不要轻走一下",\n      "description": "现在起身走 10 分钟，让心率和注意力缓一缓",\n      "aiPromise": "我会记录你的选择并用于本次建议上下文"\n    }\n  ],',
  '  "actions": [\n    {\n      "id": "action_1",\n      "emoji": "🚶",\n      "title": "Take a light walk",\n      "description": "Stand up and walk for 10 minutes to ease your heart rate and focus load",\n      "aiPromise": "I will record your choice and use it in this advice context"\n    }\n  ],',
));
sections.push(t(
  locale,
  '  "actionsSectionTitle": "今天可以这样调整"',
  '  "actionsSectionTitle": "A few options for today"',
));
sections.push('}');
```

- [ ] **Step 5: Run prompt tests**

Run:

```bash
pnpm --filter @health-advisor/agent-core test -- src/__tests__/prompts/task-builder.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add data/sandbox/prompts/homepage/template.md data/sandbox/prompts/homepage/style/zh.md packages/agent-core/src/prompts/task-builder.ts packages/agent-core/src/__tests__/prompts/task-builder.test.ts
git commit -m "fix(prompt): remove homepage baseline terminology drift"
```

---

## Module B: Event Insight Data Model

### Task 2: Add Homepage Event Insight Types and Normalizer

**Dependencies:** None.

**Purpose:** Define the stable interfaces and event type normalization that all later modules consume.

**Files:**
- Modify: `packages/agent-core/src/context/context-packet.ts`
- Create: `packages/agent-core/src/context/homepage-event-insights.ts`
- Test: `packages/agent-core/src/__tests__/context/homepage-event-insights.test.ts`
- Modify: `packages/agent-core/src/index.ts`

- [ ] **Step 1: Add failing normalizer tests**

Create `packages/agent-core/src/__tests__/context/homepage-event-insights.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { normalizeHomepageEventType } from '../../context/homepage-event-insights';

describe('homepage event insights', () => {
  it.each([
    ['sleep', 'sleep_end'],
    ['nap', 'sleep_end'],
    ['meal_intake', 'meal'],
    ['deep_focus', 'work_focus'],
    ['prolonged_sedentary', 'work_sedentary'],
    ['relaxation', 'rest_break'],
    ['walk', 'cardio_workout'],
    ['steady_cardio', 'cardio_workout'],
    ['intermittent_exercise', 'hiit_workout'],
    ['strength_training', 'hiit_workout'],
    ['anxiety_episode', 'stress_spike'],
    ['caffeine_intake', 'possible_caffeine_intake'],
    ['possible_caffeine_intake', 'possible_caffeine_intake'],
    ['alcohol_intake', 'possible_alcohol_intake'],
    ['possible_alcohol_intake', 'possible_alcohol_intake'],
    ['unknown_event', 'unknown'],
  ])('maps %s to %s', (input, expected) => {
    expect(normalizeHomepageEventType(input)).toBe(expected);
  });
});
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
pnpm --filter @health-advisor/agent-core test -- src/__tests__/context/homepage-event-insights.test.ts
```

Expected: FAIL because `homepage-event-insights.ts` does not exist.

- [ ] **Step 3: Add type definitions**

Add these exports to `packages/agent-core/src/context/context-packet.ts` near the Homepage section:

```ts
export type HomepageSemanticEventType =
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

export type EventPhysiologyMetric =
  | 'heart_rate'
  | 'hrv'
  | 'spo2'
  | 'skin_temperature'
  | 'motion'
  | 'sleep'
  | 'stress'
  | 'activity';

export interface EventPhysiologySummary {
  metric: EventPhysiologyMetric;
  value?: number;
  unit?: string;
  qualifier: 'low' | 'normal' | 'elevated' | 'compressed' | 'volatile' | 'recovering' | 'missing';
  interpretation: string;
  evidenceId?: string;
}

export interface RecoveryContextSummary {
  source: 'latest24h' | 'trend7d' | 'profile';
  metric: string;
  relation: 'supports' | 'conflicts' | 'neutral' | 'missing';
  summary: string;
  evidenceId?: string;
}

export interface EventBodyTension {
  level: 'positive' | 'watch' | 'high' | 'critical';
  summary: string;
  reason: string;
}

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

export interface ActionIntentCandidate {
  id: string;
  emoji: string;
  title: string;
  description: string;
  aiPromise: string;
  productCapability: 'record_choice' | 'contextual_followup';
}

export interface HomepageEventInsight {
  eventId: string;
  eventType: HomepageSemanticEventType;
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

Then extend `HomepageContextPacket`:

```ts
export interface HomepageContextPacket {
  recentEvents: RecentEventPacket[];
  latest24h: Latest24hPacket;
  trend7d: MetricSummary[];
  eventInsights: HomepageEventInsight[];
  rulesInsights: RuleInsightPacket[];
  suggestedChartTokens: ChartTokenId[];
}
```

- [ ] **Step 4: Add the normalizer implementation**

Create `packages/agent-core/src/context/homepage-event-insights.ts`:

```ts
import type { HomepageSemanticEventType } from './context-packet';

export function normalizeHomepageEventType(eventType: string): HomepageSemanticEventType {
  switch (eventType) {
    case 'sleep':
    case 'nap':
      return 'sleep_end';
    case 'meal_intake':
      return 'meal';
    case 'deep_focus':
      return 'work_focus';
    case 'prolonged_sedentary':
      return 'work_sedentary';
    case 'relaxation':
      return 'rest_break';
    case 'walk':
    case 'steady_cardio':
      return 'cardio_workout';
    case 'intermittent_exercise':
    case 'strength_training':
      return 'hiit_workout';
    case 'anxiety_episode':
      return 'stress_spike';
    case 'caffeine_intake':
    case 'possible_caffeine_intake':
      return 'possible_caffeine_intake';
    case 'alcohol_intake':
    case 'possible_alcohol_intake':
      return 'possible_alcohol_intake';
    default:
      return 'unknown';
  }
}
```

- [ ] **Step 5: Export the helper**

Add to `packages/agent-core/src/index.ts`:

```ts
export {
  normalizeHomepageEventType,
} from './context/homepage-event-insights';
```

- [ ] **Step 6: Run tests and typecheck**

Before typecheck, update existing test packet literals so every `HomepageContextPacket` object includes `eventInsights: []`. Start with `packages/agent-core/src/__tests__/prompts/context-packet-renderer.test.ts`, then let typecheck identify any remaining compile-time literals.

Run:

```bash
pnpm --filter @health-advisor/agent-core test -- src/__tests__/context/homepage-event-insights.test.ts
pnpm --filter @health-advisor/agent-core typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/agent-core/src/context/context-packet.ts packages/agent-core/src/context/homepage-event-insights.ts packages/agent-core/src/__tests__/context/homepage-event-insights.test.ts packages/agent-core/src/index.ts
git commit -m "feat(context): add homepage event insight types"
```

---

## Module C: Event Insight Builder

### Task 3: Build Deterministic Event Insight Summaries

**Dependencies:** Task 2.

**Purpose:** Convert `recentEvents + latest24h + trend7d + rulesInsights` into structured `HomepageEventInsight[]` without generating final user-facing prose.

**Files:**
- Modify: `packages/agent-core/src/context/homepage-event-insights.ts`
- Test: `packages/agent-core/src/__tests__/context/homepage-event-insights.test.ts`

- [ ] **Step 1: Add failing builder tests**

Append these tests to `packages/agent-core/src/__tests__/context/homepage-event-insights.test.ts`:

```ts
import type { HomepageContextPacket } from '../../context/context-packet';

function makeHomepage(overrides: Partial<HomepageContextPacket> = {}): HomepageContextPacket {
  return {
    recentEvents: [],
    latest24h: {
      date: '2026-04-21',
      metrics: [
        { metric: 'sleep_total', value: 450, unit: 'min', baseline: 420, deltaPctVsBaseline: 7, status: 'normal', evidenceId: 'latest24h_sleep_total_2026-04-21' },
        { metric: 'hrv', value: 42, unit: 'ms', baseline: 58, deltaPctVsBaseline: -28, status: 'attention', evidenceId: 'latest24h_hrv_2026-04-21' },
        { metric: 'resting_hr', value: 82, unit: 'bpm', baseline: 62, deltaPctVsBaseline: 32, status: 'attention', evidenceId: 'latest24h_resting_hr_2026-04-21' },
        { metric: 'spo2', value: 98, unit: '%', baseline: 98, deltaPctVsBaseline: 0, status: 'normal', evidenceId: 'latest24h_spo2_2026-04-21' },
        { metric: 'stress_load', value: 72, unit: 'score', status: 'attention', evidenceId: 'latest24h_stress_load_2026-04-21' },
      ],
    },
    trend7d: [],
    eventInsights: [],
    rulesInsights: [],
    suggestedChartTokens: [],
    ...overrides,
  };
}

it('builds a high-tension work focus insight from HRV and heart rate attention metrics', () => {
  const insights = buildHomepageEventInsights({
    homepage: makeHomepage({
      recentEvents: [{
        type: 'deep_focus',
        start: '2026-04-21T10:00',
        end: '2026-04-21T12:00',
        durationMin: 120,
        confidence: 0.91,
        syncState: { lastSyncedMeasuredAt: '2026-04-21T12:00', pendingEventCount: 0, fromSyncedWindow: true },
        evidenceIds: ['event_deep_focus_2026-04-21T10:00'],
      }],
    }),
    demoNow: '2026-04-21T12:10',
  });

  expect(insights).toHaveLength(1);
  expect(insights[0]!.eventType).toBe('work_focus');
  expect(insights[0]!.priority).toBe('high');
  expect(insights[0]!.tension.level).toBe('high');
  expect(insights[0]!.physiology.some((p) => p.metric === 'hrv' && p.qualifier === 'compressed')).toBe(true);
  expect(insights[0]!.recommendedFocus.some((f) => f.category === 'movement_reset')).toBe(true);
  expect(insights[0]!.evidenceIds).toContain('event_deep_focus_2026-04-21T10:00');
});

it('marks SpO2 critical context as critical tension', () => {
  const insights = buildHomepageEventInsights({
    homepage: makeHomepage({
      latest24h: {
        date: '2026-04-21',
        metrics: [
          { metric: 'spo2', value: 88, unit: '%', baseline: 98, deltaPctVsBaseline: -10, status: 'critical', clinicalNote: '低氧血症，建议尽快就医', evidenceId: 'latest24h_spo2_2026-04-21' },
        ],
      },
      recentEvents: [{
        type: 'sleep',
        start: '2026-04-20T23:00',
        end: '2026-04-21T07:00',
        durationMin: 480,
        confidence: 0.95,
        syncState: { lastSyncedMeasuredAt: '2026-04-21T07:00', pendingEventCount: 0, fromSyncedWindow: true },
        evidenceIds: ['event_sleep_2026-04-20T23:00'],
      }],
    }),
    demoNow: '2026-04-21T07:10',
  });

  expect(insights[0]!.eventType).toBe('sleep_end');
  expect(insights[0]!.tension.level).toBe('critical');
  expect(insights[0]!.recommendedFocus.some((f) => f.category === 'medical_attention')).toBe(true);
});
```

Update the import at the top:

```ts
import { buildHomepageEventInsights, normalizeHomepageEventType } from '../../context/homepage-event-insights';
```

- [ ] **Step 2: Run the failing tests**

Run:

```bash
pnpm --filter @health-advisor/agent-core test -- src/__tests__/context/homepage-event-insights.test.ts
```

Expected: FAIL because `buildHomepageEventInsights` is not implemented.

- [ ] **Step 3: Implement builder input and helpers**

Add to `packages/agent-core/src/context/homepage-event-insights.ts`:

```ts
import type {
  EventBodyTension,
  EventPhysiologySummary,
  HomepageContextPacket,
  HomepageEventInsight,
  Latest24hMetric,
  RecommendedFocus,
  RecoveryContextSummary,
} from './context-packet';

export interface BuildHomepageEventInsightsInput {
  homepage: Pick<HomepageContextPacket, 'recentEvents' | 'latest24h' | 'trend7d' | 'rulesInsights'>;
  demoNow?: string;
}

export function buildHomepageEventInsights(input: BuildHomepageEventInsightsInput): HomepageEventInsight[] {
  const { homepage, demoNow } = input;
  return homepage.recentEvents.map((event, index) => {
    const eventType = normalizeHomepageEventType(event.type);
    const physiology = buildPhysiology(eventType, homepage.latest24h.metrics);
    const recoveryContext = buildRecoveryContext(homepage.latest24h.metrics);
    const tension = determineEventBodyTension(eventType, homepage.latest24h.metrics, homepage.rulesInsights);
    const recommendedFocus = buildRecommendedFocus(eventType, tension);
    return {
      eventId: event.evidenceIds[0] ?? `${event.type}_${event.start}`,
      eventType,
      priority: index === 0 ? 'high' : 'medium',
      timeRelation: formatTimeRelation(event.end, demoNow),
      headline: buildHeadline(eventType, event.durationMin),
      physiology,
      recoveryContext,
      tension,
      recommendedFocus,
      actionIntents: [],
      evidenceIds: [...event.evidenceIds, ...collectMetricEvidenceIds(homepage.latest24h.metrics)],
    };
  });
}
```

- [ ] **Step 4: Implement deterministic physiology and tension rules**

In the same file, add these helper rules. Keep the helper functions pure.

```ts
function metric(metrics: Latest24hMetric[], name: string): Latest24hMetric | undefined {
  return metrics.find((m) => m.metric === name);
}

function buildPhysiology(eventType: ReturnType<typeof normalizeHomepageEventType>, metrics: Latest24hMetric[]): EventPhysiologySummary[] {
  const hrv = metric(metrics, 'hrv');
  const restingHr = metric(metrics, 'resting_hr');
  const spo2 = metric(metrics, 'spo2');
  const stress = metric(metrics, 'stress_load');
  const sleep = metric(metrics, 'sleep_total');

  const summaries: EventPhysiologySummary[] = [];

  if (hrv?.value !== undefined) {
    summaries.push({
      metric: 'hrv',
      value: hrv.value,
      unit: hrv.unit,
      qualifier: hrv.status === 'attention' || hrv.status === 'critical' ? 'compressed' : 'normal',
      interpretation: hrv.status === 'attention' || hrv.status === 'critical'
        ? 'HRV 处于压缩状态，提示自主神经恢复压力偏高'
        : 'HRV 状态稳定，可作为恢复背景参考',
      evidenceId: hrv.evidenceId,
    });
  }

  if (restingHr?.value !== undefined) {
    summaries.push({
      metric: 'heart_rate',
      value: restingHr.value,
      unit: restingHr.unit,
      qualifier: restingHr.status === 'attention' || restingHr.status === 'critical' ? 'elevated' : 'normal',
      interpretation: restingHr.status === 'attention' || restingHr.status === 'critical'
        ? '心率偏高，说明身体仍处在较高唤醒或负荷状态'
        : '心率处于平稳范围，可支持当前活动安排',
      evidenceId: restingHr.evidenceId,
    });
  }

  if (spo2?.value !== undefined) {
    summaries.push({
      metric: 'spo2',
      value: spo2.value,
      unit: spo2.unit,
      qualifier: spo2.status === 'critical' ? 'low' : spo2.status === 'attention' ? 'low' : 'normal',
      interpretation: spo2.status === 'critical'
        ? '血氧处于异常风险区间，需要优先处理安全边界'
        : spo2.status === 'attention'
          ? '血氧偏低，需关注呼吸状态和佩戴质量'
          : '血氧稳定，可作为呼吸状态背景',
      evidenceId: spo2.evidenceId,
    });
  }

  if (stress?.value !== undefined) {
    summaries.push({
      metric: 'stress',
      value: stress.value,
      unit: stress.unit,
      qualifier: stress.status === 'attention' || stress.status === 'critical' ? 'elevated' : 'normal',
      interpretation: stress.status === 'attention' || stress.status === 'critical'
        ? '压力负荷偏高，当前事件更容易放大疲劳感'
        : '压力负荷平稳',
      evidenceId: stress.evidenceId,
    });
  }

  if (sleep?.value !== undefined && eventType !== 'sleep_end') {
    summaries.push({
      metric: 'sleep',
      value: sleep.value,
      unit: sleep.unit,
      qualifier: sleep.status === 'attention' || sleep.status === 'critical' ? 'low' : 'normal',
      interpretation: sleep.status === 'attention' || sleep.status === 'critical'
        ? '过去 24h 睡眠恢复不足，当前事件需要降负荷处理'
        : '过去 24h 睡眠恢复可作为当前事件的支撑背景',
      evidenceId: sleep.evidenceId,
    });
  }

  return summaries;
}
```

Add `determineEventBodyTension`, `buildRecoveryContext`, `buildRecommendedFocus`, `formatTimeRelation`, `buildHeadline`, and `collectMetricEvidenceIds` in the same file.

```ts
function determineEventBodyTension(
  eventType: ReturnType<typeof normalizeHomepageEventType>,
  metrics: Latest24hMetric[],
  rulesInsights: HomepageContextPacket['rulesInsights'],
): EventBodyTension {
  if (metrics.some((m) => m.status === 'critical') || rulesInsights.some((r) => r.severity === 'critical')) {
    return { level: 'critical', summary: '当前存在需要优先处理的异常信号', reason: 'critical metric or rule insight present' };
  }

  const hrvAttention = metric(metrics, 'hrv')?.status === 'attention';
  const hrAttention = metric(metrics, 'resting_hr')?.status === 'attention';
  const stressAttention = metric(metrics, 'stress_load')?.status === 'attention';
  const sleepAttention = metric(metrics, 'sleep_total')?.status === 'attention';

  if ((eventType === 'work_focus' || eventType === 'work_sedentary') && (hrvAttention || hrAttention || stressAttention)) {
    return { level: 'high', summary: '认知或静止负荷已经累积，需要主动重置', reason: 'work event with HRV, heart rate, or stress attention' };
  }
  if ((eventType === 'cardio_workout' || eventType === 'hiit_workout') && (sleepAttention || hrvAttention)) {
    return { level: 'high', summary: '运动负荷与恢复不足叠加，建议调整训练策略', reason: 'workout with sleep or HRV attention' };
  }
  if ((eventType === 'possible_caffeine_intake' || eventType === 'possible_alcohol_intake') && (hrvAttention || hrAttention || stressAttention)) {
    return { level: 'watch', summary: '摄入相关信号可能影响今晚恢复，需要保护睡眠窗口', reason: 'intake event with recovery attention' };
  }

  return { level: 'positive', summary: '事件与当前恢复状态基本匹配', reason: 'no critical or attention conflict detected' };
}

function buildRecoveryContext(metrics: Latest24hMetric[]): RecoveryContextSummary[] {
  const sleep = metric(metrics, 'sleep_total');
  const hrv = metric(metrics, 'hrv');
  const contexts: RecoveryContextSummary[] = [];

  if (sleep) {
    contexts.push({
      source: 'latest24h',
      metric: 'sleep_total',
      relation: sleep.status === 'normal' ? 'supports' : sleep.status === 'missing' ? 'missing' : 'conflicts',
      summary: sleep.status === 'normal'
        ? '过去 24h 睡眠可作为当前事件的恢复底子'
        : sleep.status === 'missing'
          ? '缺少最近睡眠数据，无法完整判断恢复背景'
          : '过去 24h 睡眠不足，当前事件需要更保守处理',
      evidenceId: sleep.evidenceId,
    });
  }

  if (hrv) {
    contexts.push({
      source: 'latest24h',
      metric: 'hrv',
      relation: hrv.status === 'normal' ? 'supports' : hrv.status === 'missing' ? 'missing' : 'conflicts',
      summary: hrv.status === 'normal'
        ? 'HRV 状态支持当前活动安排'
        : hrv.status === 'missing'
          ? '缺少 HRV 数据，无法判断自主神经恢复状态'
          : 'HRV 走弱，提示恢复压力偏高',
      evidenceId: hrv.evidenceId,
    });
  }

  return contexts;
}

function buildRecommendedFocus(
  eventType: ReturnType<typeof normalizeHomepageEventType>,
  tension: EventBodyTension,
): RecommendedFocus[] {
  if (tension.level === 'critical') {
    return [
      { category: 'medical_attention', action: '如伴随胸闷、气短或明显不适，及时就医评估', timing: '现在', rationale: '当前存在异常风险信号，应优先处理安全边界' },
    ];
  }

  if (eventType === 'work_focus' || eventType === 'work_sedentary') {
    return [
      { category: 'movement_reset', action: '起身轻走并活动肩颈', durationMin: 10, rationale: '帮助从静止和认知负荷中切换出来' },
      { category: 'breathing_reset', action: '做一组缓慢呼吸', durationMin: 3, rationale: '用延长呼气降低交感神经兴奋' },
    ];
  }

  if (eventType === 'cardio_workout' || eventType === 'hiit_workout') {
    return [
      { category: 'hydration', action: '小口补水并做轻度走动冷身', durationMin: 10, rationale: '帮助心率平稳回落并支持循环恢复' },
      { category: 'sleep_protection', action: '睡前降低刺激和屏幕暴露', timing: '今晚睡前 60 min', rationale: '保护运动后的深睡恢复窗口' },
    ];
  }

  return [
    { category: 'movement_reset', action: '安排一次轻量活动切换状态', durationMin: 10, rationale: '帮助身体从当前事件平稳过渡到下一阶段' },
  ];
}

function formatTimeRelation(eventEnd: string, demoNow?: string): string {
  if (!demoNow) return '最近发生';
  const endMs = new Date(`${eventEnd}:00`).getTime();
  const nowMs = new Date(`${demoNow}:00`).getTime();
  const diffMin = Math.max(0, Math.round((nowMs - endMs) / 60000));
  if (diffMin < 60) return `刚结束约 ${diffMin} min`;
  const hours = Math.floor(diffMin / 60);
  const minutes = diffMin % 60;
  return `约 ${hours}h${minutes > 0 ? `${minutes}min` : ''} 前结束`;
}

function buildHeadline(eventType: ReturnType<typeof normalizeHomepageEventType>, durationMin: number): string {
  switch (eventType) {
    case 'work_focus':
      return `连续专注 ${durationMin} min，认知负荷正在累积`;
    case 'work_sedentary':
      return `连续静止 ${durationMin} min，循环和体态需要重置`;
    case 'cardio_workout':
    case 'hiit_workout':
      return `完成 ${durationMin} min 训练，身体进入恢复窗口`;
    case 'sleep_end':
      return `刚结束一段 ${durationMin} min 睡眠，需要评估恢复质量`;
    default:
      return `最近事件持续 ${durationMin} min，需要结合恢复背景判断`;
  }
}

function collectMetricEvidenceIds(metrics: Latest24hMetric[]): string[] {
  return metrics
    .map((item) => item.evidenceId)
    .filter((id): id is string => typeof id === 'string' && id.length > 0);
}
```

- [ ] **Step 5: Run builder tests**

Run:

```bash
pnpm --filter @health-advisor/agent-core test -- src/__tests__/context/homepage-event-insights.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/agent-core/src/context/homepage-event-insights.ts packages/agent-core/src/__tests__/context/homepage-event-insights.test.ts
git commit -m "feat(context): build homepage event insights"
```

### Task 4: Generate Safe Action Intent Candidates

**Dependencies:** Task 3.

**Purpose:** Ensure event insights carry action candidates that are specific, capability-safe, and suitable for LLM rewriting.

**Files:**
- Modify: `packages/agent-core/src/context/homepage-event-insights.ts`
- Test: `packages/agent-core/src/__tests__/context/homepage-event-insights.test.ts`

- [ ] **Step 1: Add failing action candidate tests**

Append:

```ts
it('uses only supported product capabilities in action intents', () => {
  const insights = buildHomepageEventInsights({
    homepage: makeHomepage({
      recentEvents: [{
        type: 'prolonged_sedentary',
        start: '2026-04-21T13:00',
        end: '2026-04-21T16:00',
        durationMin: 180,
        confidence: 0.88,
        syncState: { lastSyncedMeasuredAt: '2026-04-21T16:00', pendingEventCount: 0, fromSyncedWindow: true },
        evidenceIds: ['event_prolonged_sedentary_2026-04-21T13:00'],
      }],
    }),
    demoNow: '2026-04-21T16:05',
  });

  const actions = insights[0]!.actionIntents;
  expect(actions.length).toBeGreaterThanOrEqual(2);
  expect(actions.every((a) => a.productCapability === 'record_choice' || a.productCapability === 'contextual_followup')).toBe(true);
  expect(actions.map((a) => a.aiPromise).join('\n')).not.toMatch(/提醒|开启.*模式|实时监控|调整监测逻辑/);
});

it('creates event-appropriate action categories for post-workout recovery', () => {
  const insights = buildHomepageEventInsights({
    homepage: makeHomepage({
      recentEvents: [{
        type: 'steady_cardio',
        start: '2026-04-21T17:30',
        end: '2026-04-21T18:10',
        durationMin: 40,
        confidence: 0.92,
        syncState: { lastSyncedMeasuredAt: '2026-04-21T18:10', pendingEventCount: 0, fromSyncedWindow: true },
        evidenceIds: ['event_steady_cardio_2026-04-21T17:30'],
      }],
    }),
    demoNow: '2026-04-21T18:20',
  });

  const focusCategories = insights[0]!.recommendedFocus.map((f) => f.category);
  expect(focusCategories).toContain('hydration');
  expect(focusCategories).toContain('sleep_protection');
});
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
pnpm --filter @health-advisor/agent-core test -- src/__tests__/context/homepage-event-insights.test.ts
```

Expected: FAIL if action candidates are too generic or missing.

- [ ] **Step 3: Implement action candidate mapping**

Update the import block in `packages/agent-core/src/context/homepage-event-insights.ts` to include `ActionIntentCandidate`:

```ts
import type {
  ActionIntentCandidate,
  EventBodyTension,
  EventPhysiologySummary,
  HomepageContextPacket,
  HomepageEventInsight,
  Latest24hMetric,
  RecommendedFocus,
  RecoveryContextSummary,
} from './context-packet';
```

Replace the temporary value in `buildHomepageEventInsights()`:

```ts
actionIntents: [],
```

with:

```ts
actionIntents: buildActionIntentCandidates(eventType, recommendedFocus),
```

In `buildRecommendedFocus`, return concrete focus objects by event type:

```ts
case 'work_focus':
case 'work_sedentary':
  return [
    { category: 'movement_reset', action: '起身轻走并活动肩颈', durationMin: 10, rationale: '帮助从静止和认知负荷中切换出来' },
    { category: 'breathing_reset', action: '做一组缓慢呼吸', durationMin: 3, rationale: '用延长呼气降低交感神经兴奋' },
    { category: 'posture', action: '把接下来的工作切到站姿或挺直坐姿', timing: '接下来 30 min', rationale: '减少久坐对呼吸和循环的压迫' },
  ];
case 'cardio_workout':
case 'hiit_workout':
  return [
    { category: 'hydration', action: '小口补水并做轻度走动冷身', durationMin: 10, rationale: '帮助心率平稳回落并支持循环恢复' },
    { category: 'nutrition', action: '补充蛋白质和易消化碳水', timing: '运动后 45 min 内', rationale: '支持糖原回补和肌肉修复' },
    { category: 'sleep_protection', action: '睡前降低刺激和屏幕暴露', timing: '今晚睡前 60 min', rationale: '保护运动后的深睡恢复窗口' },
  ];
case 'possible_alcohol_intake':
case 'possible_caffeine_intake':
  return [
    { category: 'sleep_protection', action: '把睡前环境调暗并降低刺激', timing: '今晚睡前 60 min', rationale: '降低摄入相关兴奋对入睡的影响' },
    { category: 'breathing_reset', action: '做一组延长呼气的呼吸练习', durationMin: 5, rationale: '帮助神经系统从紧绷状态回落' },
  ];
```

Map each `RecommendedFocus` into `ActionIntentCandidate`:

```ts
const RECORD_CHOICE_PROMISE = '我会记录你的选择并用于本次建议上下文';

function buildActionIntentCandidates(
  eventType: ReturnType<typeof normalizeHomepageEventType>,
  focusItems: RecommendedFocus[],
): ActionIntentCandidate[] {
  return focusItems.slice(0, 3).map((focus, index) => ({
    id: `event_${eventType}_action_${index + 1}`,
    emoji: emojiForFocus(focus.category),
    title: titleForFocus(focus),
    description: describeFocus(focus),
    aiPromise: RECORD_CHOICE_PROMISE,
    productCapability: 'record_choice',
  }));
}

function emojiForFocus(category: RecommendedFocus['category']): string {
  switch (category) {
    case 'movement_reset':
      return '🚶';
    case 'breathing_reset':
      return '🫁';
    case 'nutrition':
      return '🥣';
    case 'hydration':
      return '💧';
    case 'training_adjustment':
      return '🏃';
    case 'sleep_protection':
      return '🌙';
    case 'posture':
      return '🪑';
    case 'data_quality':
      return '⌚';
    case 'medical_attention':
      return '🩺';
  }
}

function titleForFocus(focus: RecommendedFocus): string {
  switch (focus.category) {
    case 'movement_reset':
      return '做一次轻量活动重置';
    case 'breathing_reset':
      return '用呼吸把紧张降下来';
    case 'nutrition':
      return '补一份恢复营养';
    case 'hydration':
      return '先把补水做好';
    case 'training_adjustment':
      return '把训练强度调保守';
    case 'sleep_protection':
      return '保护今晚睡眠窗口';
    case 'posture':
      return '调整接下来的姿势';
    case 'data_quality':
      return '补齐判断所需数据';
    case 'medical_attention':
      return '优先处理安全信号';
  }
}

function describeFocus(focus: RecommendedFocus): string {
  const schedule = focus.durationMin !== undefined
    ? `${focus.durationMin} min`
    : focus.timing ?? '现在';
  return `${schedule}：${focus.action}。${focus.rationale}`;
}
```

- [ ] **Step 4: Run tests**

Run:

```bash
pnpm --filter @health-advisor/agent-core test -- src/__tests__/context/homepage-event-insights.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/agent-core/src/context/homepage-event-insights.ts packages/agent-core/src/__tests__/context/homepage-event-insights.test.ts
git commit -m "feat(context): add safe homepage action intents"
```

---

## Module D: Packet + Renderer Integration

### Task 5: Wire Event Insights Into Homepage Packet and Prompt Rendering

**Dependencies:** Task 3 and Task 4.

**Purpose:** Make `eventInsights` part of the homepage packet and render it as the prioritized prompt section.

**Files:**
- Modify: `packages/agent-core/src/context/context-packet-builder.ts`
- Modify: `packages/agent-core/src/prompts/context-packet-renderer.ts`
- Test: `packages/agent-core/src/__tests__/context/context-packet-builder.test.ts`
- Test: `packages/agent-core/src/__tests__/prompts/context-packet-renderer.test.ts`

- [ ] **Step 1: Add failing packet builder test**

Append to `packages/agent-core/src/__tests__/context/context-packet-builder.test.ts`:

```ts
it('homepage packet includes eventInsights for synced recent events', () => {
  const ctx = makeContext({
    demoNow: '2026-04-10T16:10',
    timelineSync: {
      recognizedEvents: [
        {
          recognizedEventId: 're-focus-1',
          profileId: 'profile-a',
          type: 'deep_focus',
          start: '2026-04-10T14:00',
          end: '2026-04-10T16:00',
          confidence: 0.9,
          evidence: ['low motion', 'stable work posture'],
        },
      ],
      derivedTemporalStates: [],
      syncMetadata: { lastSyncedMeasuredAt: '2026-04-10T16:00', pendingEventCount: 0 },
    },
  });

  const packet = buildTaskContextPacket(ctx, emptyRules);
  expect(packet.homepage?.eventInsights.length).toBe(1);
  expect(packet.homepage?.eventInsights[0]?.eventType).toBe('work_focus');
  expect(packet.homepage?.eventInsights[0]?.actionIntents.length).toBeGreaterThanOrEqual(2);
});
```

- [ ] **Step 2: Add failing renderer test**

Append to `packages/agent-core/src/__tests__/prompts/context-packet-renderer.test.ts`:

```ts
it('renders homepage event insights before raw 24h details', () => {
  const packet: TaskContextPacket = {
    task: { type: 'homepage_summary', page: 'home' },
    userContext: {
      profileId: 'p1',
      name: '巅峰',
      age: 35,
      tags: [],
      baselines: { restingHR: 60, hrv: 60, spo2: 98, avgSleepMinutes: 420, avgSteps: 8000 },
    },
    dataWindow: { start: '2026-04-15', end: '2026-04-21', recordCount: 7, completenessPct: 100 },
    missingData: [],
    evidence: [],
    visibleCharts: [],
    homepage: {
      recentEvents: [],
      latest24h: { date: '2026-04-21', metrics: [] },
      trend7d: [],
      rulesInsights: [],
      suggestedChartTokens: [],
      eventInsights: [{
        eventId: 'event_deep_focus_2026-04-21T10:00',
        eventType: 'work_focus',
        priority: 'high',
        timeRelation: '刚结束约 10 min',
        headline: '连续专注 120 min，身体保持低位移',
        physiology: [{ metric: 'hrv', value: 55, unit: 'ms', qualifier: 'compressed', interpretation: 'HRV 处于压缩状态', evidenceId: 'e-hrv' }],
        recoveryContext: [{ source: 'latest24h', metric: 'sleep_total', relation: 'supports', summary: '昨晚睡眠支撑上午输出', evidenceId: 'e-sleep' }],
        tension: { level: 'watch', summary: '认知负荷已累积', reason: 'work focus with compressed HRV' },
        recommendedFocus: [{ category: 'movement_reset', action: '起身轻走', durationMin: 10, rationale: '释放静止负荷' }],
        actionIntents: [{ id: 'a1', emoji: '🚶', title: '要不要轻走一下', description: '起身轻走 10 min', aiPromise: '我会记录你的选择并用于本次建议上下文', productCapability: 'record_choice' }],
        evidenceIds: ['event_deep_focus_2026-04-21T10:00', 'e-hrv', 'e-sleep'],
      }],
    },
  };

  const output = renderTaskContextPacket(packet, 'zh', '2026-04-21T12:10');
  expect(output).toContain('事件生理摘要（优先引用）');
  expect(output).toContain('work_focus');
  expect(output).toContain('认知负荷已累积');
  expect(output).toContain('要不要轻走一下');
  expect(output.indexOf('事件生理摘要（优先引用）')).toBeLessThan(output.indexOf('过去24小时状态'));
});
```

- [ ] **Step 3: Run failing tests**

Run:

```bash
pnpm --filter @health-advisor/agent-core test -- src/__tests__/context/context-packet-builder.test.ts src/__tests__/prompts/context-packet-renderer.test.ts
```

Expected: FAIL because `eventInsights` is not wired or rendered.

- [ ] **Step 4: Wire builder into homepage packet**

In `packages/agent-core/src/context/context-packet-builder.ts`, import:

```ts
import { buildHomepageEventInsights } from './homepage-event-insights';
```

In `buildHomepagePacket()`, after `trend7d` and `rulesInsights` are built, construct a local homepage object and fill `eventInsights`:

```ts
const homepageWithoutInsights = {
  recentEvents,
  latest24h,
  trend7d,
  rulesInsights,
  suggestedChartTokens: rulesResult.suggestedChartTokens,
};

return {
  ...homepageWithoutInsights,
  eventInsights: buildHomepageEventInsights({
    homepage: homepageWithoutInsights,
    demoNow: context.demoNow,
  }),
};
```

- [ ] **Step 5: Render event insights**

In `packages/agent-core/src/prompts/context-packet-renderer.ts`, add a helper:

```ts
function renderHomepageEventInsights(homepage: HomepageContextPacket, locale: Locale): string {
  if (homepage.eventInsights.length === 0) return '';

  const lines = [t(locale, '## 事件生理摘要（优先引用）', '## Event Physiology Insights (Prioritize)')];
  lines.push(t(
    locale,
    '这些结构化摘要是最近事件的优先解释输入。summary 应自然转写，不要复制列表格式。',
    'These structured insights are the priority interpretation input for recent events. Rewrite naturally; do not copy the list format.',
  ));

  for (const insight of homepage.eventInsights) {
    lines.push(`- [${insight.priority}] ${insight.eventType}, ${insight.timeRelation}`);
    lines.push(`  - ${t(locale, '事件摘要', 'Event summary')}${colon(locale)}${insight.headline}`);
    lines.push(`  - ${t(locale, '当前张力', 'Body tension')}${colon(locale)}${insight.tension.level}: ${insight.tension.summary}`);
    for (const item of insight.physiology) {
      const value = item.value !== undefined ? ` ${item.value}${item.unit ?? ''}` : '';
      lines.push(`  - ${t(locale, '生理特征', 'Physiology')}${colon(locale)}${item.metric} ${item.qualifier}${value} — ${item.interpretation}`);
    }
    for (const item of insight.recoveryContext) {
      lines.push(`  - ${t(locale, '恢复背景', 'Recovery context')}${colon(locale)}${item.relation} ${item.metric} — ${item.summary}`);
    }
    for (const focus of insight.recommendedFocus) {
      const timing = focus.durationMin !== undefined ? `${focus.durationMin} min` : focus.timing ?? '';
      lines.push(`  - ${t(locale, '建议方向', 'Recommended focus')}${colon(locale)}${focus.category} ${timing} — ${focus.action}；${focus.rationale}`);
    }
    if (insight.actionIntents.length > 0) {
      lines.push(`  - ${t(locale, 'actions 候选', 'Action candidates')}${colon(locale)}${insight.actionIntents.map((a) => `${a.emoji}${a.title}`).join(' / ')}`);
    }
  }

  return lines.join('\n');
}
```

Call it near the start of `renderHomepage()` after recent events and before latest24h:

```ts
const eventInsightSection = renderHomepageEventInsights(homepage, locale);
if (eventInsightSection) lines.push(eventInsightSection);
```

- [ ] **Step 6: Run tests**

Run:

```bash
pnpm --filter @health-advisor/agent-core test -- src/__tests__/context/context-packet-builder.test.ts src/__tests__/prompts/context-packet-renderer.test.ts
pnpm --filter @health-advisor/agent-core typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/agent-core/src/context/context-packet-builder.ts packages/agent-core/src/prompts/context-packet-renderer.ts packages/agent-core/src/__tests__/context/context-packet-builder.test.ts packages/agent-core/src/__tests__/prompts/context-packet-renderer.test.ts
git commit -m "feat(prompt): render homepage event insights"
```

---

## Module E: Prompt Contract Alignment

### Task 6: Make Homepage Prompt Prioritize Event Insights and Safe Actions

**Dependencies:** Task 1 and Task 5.

**Purpose:** Align LLM instructions with the new `eventInsights` contract and prevent the model from treating raw metrics as the main brief.

**Files:**
- Modify: `data/sandbox/prompts/homepage/template.md`
- Modify: `data/sandbox/prompts/homepage/style/zh.md`
- Test: `packages/agent-core/src/__tests__/prompts/task-builder.test.ts`

- [ ] **Step 1: Add failing tests for eventInsights instruction**

Add to `packages/agent-core/src/__tests__/prompts/task-builder.test.ts`:

```ts
it('homepage prompt instructs the model to prioritize eventInsights', () => {
  const prompt = buildTaskPrompt(makeContext({
    task: {
      type: AgentTaskType.HOMEPAGE_SUMMARY,
      pageContext: { profileId: 'profile-a', page: 'homepage', timeframe: 'week' },
    },
  }), createPromptLoader(), emptyRules);

  expect(prompt).toContain('eventInsights');
  expect(prompt).toContain('事件生理摘要');
  expect(prompt).toContain('优先于 raw latest24h 指标');
  expect(prompt).toContain('actions 应优先从 actionIntents 转写');
});
```

- [ ] **Step 2: Run failing test**

Run:

```bash
pnpm --filter @health-advisor/agent-core test -- src/__tests__/prompts/task-builder.test.ts
```

Expected: FAIL until template mentions the new contract.

- [ ] **Step 3: Update `homepage/template.md`**

Add this section after “回复结构”:

```md
### eventInsights 使用规则

如果上下文包含 `## 事件生理摘要（优先引用）`，必须优先使用其中的 eventInsights 作为首页简报的主输入。

- eventInsights 优先于 raw latest24h 指标。
- raw latest24h 和 trend7d 只作为证据背景，不要逐项展开。
- summary 不要复制 eventInsights 的列表结构，要自然转写为用户能读懂的连续表达。
- 当前张力为 `critical` 时，必须优先说明安全边界和就医/观察建议。
- actions 应优先从 actionIntents 转写，不自行承诺提醒、模式切换、实时监控或调整监测逻辑。
```

Update “写作红线” with:

```md
9. 禁止绕过 eventInsights 自行编造事件影响、半衰期、睡眠损失比例、步数缺口或提醒时间。
10. 如果 actionIntents 已提供候选，actions 必须优先使用这些候选的行动方向和 aiPromise 能力边界。
```

- [ ] **Step 4: Update style guide**

In `data/sandbox/prompts/homepage/style/zh.md`, add under `summary 与 actions 分工`:

```md
- 如果上下文包含 actionIntents，actions 应转写这些候选，不要创造当前产品不支持的新能力
- action 的语气是建议式、可选式，不要命令用户执行
```

- [ ] **Step 5: Run prompt tests**

Run:

```bash
pnpm --filter @health-advisor/agent-core test -- src/__tests__/prompts/task-builder.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add data/sandbox/prompts/homepage/template.md data/sandbox/prompts/homepage/style/zh.md packages/agent-core/src/__tests__/prompts/task-builder.test.ts
git commit -m "feat(prompt): prioritize homepage event insights"
```

---

## Module F: Output Quality Verifier

### Task 7: Add Homepage Action and Terminology Verification

**Dependencies:** Task 2 and Task 5.

**Purpose:** Report deterministic homepage quality violations for forbidden terminology, unsupported action promises, vague action descriptions, and missing action options.

**Files:**
- Modify: `packages/agent-core/src/output/verifier.ts`
- Test: `packages/agent-core/src/__tests__/output/verifier.test.ts`

- [ ] **Step 1: Add failing verifier tests**

Append to `packages/agent-core/src/__tests__/output/verifier.test.ts`:

```ts
it('homepage output containing baseline jargon reports soft violation', () => {
  const report = verifyOutput({
    envelope: makeEnvelope({
      summary: '你的 HRV 低于 baseline，偏离基线明显。',
      actions: [{
        id: 'a1',
        emoji: '🚶',
        title: '要不要轻走一下',
        description: '现在起身轻走 10 分钟',
        aiPromise: '我会记录你的选择并用于本次建议上下文',
      }],
    }),
    context: makeContext(),
    rulesResult: makeRulesResult(),
    packet: makePacket(),
    parseResult: { success: true },
  });

  const violation = report.violations.find((v) => v.ruleId === 'homepage:forbidden_terms');
  expect(violation).toBeDefined();
  expect(violation!.passed).toBe(false);
  expect(violation!.severity).toBe('soft');
});

it('homepage action promising unsupported capabilities reports soft violation', () => {
  const report = verifyOutput({
    envelope: makeEnvelope({
      actions: [{
        id: 'a1',
        emoji: '⏰',
        title: '开启提醒',
        description: '我会在 21:00 准时提醒你',
        aiPromise: '我会开启无干扰模式并实时监控你的睡眠',
      }],
    }),
    context: makeContext(),
    rulesResult: makeRulesResult(),
    packet: makePacket(),
    parseResult: { success: true },
  });

  const violation = report.violations.find((v) => v.ruleId === 'homepage:action:unsupported_promise');
  expect(violation).toBeDefined();
  expect(violation!.passed).toBe(false);
});

it('homepage llm output with fewer than two actions reports soft violation', () => {
  const report = verifyOutput({
    envelope: makeEnvelope({ actions: [] }),
    context: makeContext(),
    rulesResult: makeRulesResult(),
    packet: makePacket(),
    parseResult: { success: true },
  });

  const violation = report.violations.find((v) => v.ruleId === 'homepage:action:min_count');
  expect(violation).toBeDefined();
  expect(violation!.passed).toBe(false);
});
```

- [ ] **Step 2: Run failing tests**

Run:

```bash
pnpm --filter @health-advisor/agent-core test -- src/__tests__/output/verifier.test.ts
```

Expected: FAIL because the new checks do not exist.

- [ ] **Step 3: Include actions in verifier match text**

Update `buildMatchText()` in `packages/agent-core/src/output/verifier.ts`:

```ts
function buildMatchText(envelope: AgentResponseEnvelope): string {
  const parts = [envelope.summary];
  if (envelope.microTips && envelope.microTips.length > 0) {
    parts.push(envelope.microTips.join('\n'));
  }
  if (envelope.actions && envelope.actions.length > 0) {
    parts.push(envelope.actions.map((a) => `${a.title}\n${a.description}\n${a.aiPromise}`).join('\n'));
  }
  return parts.join('\n');
}
```

- [ ] **Step 4: Add homepage-specific checks**

In `verifyOutput()`, after `checkTaskRedlines(input)`, add:

```ts
violations.push(...checkHomepageBriefQuality(input));
```

Add:

```ts
const HOMEPAGE_FORBIDDEN_TERM_PATTERNS = [/baseline/i, /基线/, /基准线/, /偏离基线/];
const UNSUPPORTED_ACTION_PROMISE_PATTERNS = [
  /提醒/,
  /开启.*模式/,
  /实时监控/,
  /调整监测逻辑/,
  /无干扰模式/,
  /准时提醒/,
];
const VAGUE_ACTION_PATTERNS = [/保持良好/, /注意休息/, /多喝水/, /适度运动/];

function checkHomepageBriefQuality(input: VerifierInput): QualityViolation[] {
  if (input.context.task.type !== 'homepage_summary') return [];

  const text = buildMatchText(input.envelope);
  const violations: QualityViolation[] = [];

  violations.push(checkPatterns(
    'homepage:forbidden_terms',
    text,
    HOMEPAGE_FORBIDDEN_TERM_PATTERNS,
    'soft',
    'homepage 禁用术语',
  ));

  const actions = input.envelope.actions ?? [];
  if (input.envelope.source === 'llm') {
    violations.push({
      ruleId: 'homepage:action:min_count',
      severity: 'soft',
      passed: actions.length >= 2,
      message: actions.length >= 2 ? 'homepage action 数量充足' : `homepage action 数量不足: ${actions.length} < 2`,
      details: { count: actions.length },
    });
  }

  const actionText = actions.map((a) => `${a.title}\n${a.description}\n${a.aiPromise}`).join('\n');
  const unsupported = UNSUPPORTED_ACTION_PROMISE_PATTERNS.filter((p) => p.test(actionText)).map((p) => p.source);
  violations.push({
    ruleId: 'homepage:action:unsupported_promise',
    severity: 'soft',
    passed: unsupported.length === 0,
    message: unsupported.length === 0 ? 'actions 未承诺未实现能力' : 'actions 承诺了未实现能力',
    details: unsupported.length === 0 ? undefined : { matchedPatterns: unsupported },
  });

  const vague = VAGUE_ACTION_PATTERNS.filter((p) => p.test(actionText)).map((p) => p.source);
  violations.push({
    ruleId: 'homepage:action:vague',
    severity: 'soft',
    passed: vague.length === 0,
    message: vague.length === 0 ? 'actions 未出现泛泛建议' : 'actions 出现泛泛建议',
    details: vague.length === 0 ? undefined : { matchedPatterns: vague },
  });

  return violations;
}
```

- [ ] **Step 5: Run verifier tests**

Run:

```bash
pnpm --filter @health-advisor/agent-core test -- src/__tests__/output/verifier.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/agent-core/src/output/verifier.ts packages/agent-core/src/__tests__/output/verifier.test.ts
git commit -m "feat(output): verify homepage action quality"
```

---

## Module G: Eval Coverage

### Task 8: Add Event-Focused Homepage Eval Cases

**Dependencies:** Task 6 and Task 7.

**Purpose:** Lock the new response pattern with representative homepage event cases and action expectations.

**Files:**
- Create: `packages/agent-core/evals/cases/core/homepage/homepage-focus-caffeine-reset.json`
- Create: `packages/agent-core/evals/cases/core/homepage/homepage-sedentary-fatigue-pivot.json`
- Create: `packages/agent-core/evals/cases/core/homepage/homepage-post-workout-recovery.json`
- Create: `packages/agent-core/evals/cases/core/homepage/homepage-alcohol-dinner-sleep-risk.json`
- Modify if needed: `packages/agent-core/src/evals/scorers/action-scorer.ts`
- Test: `packages/agent-core/src/__tests__/evals/scorers.test.ts`

- [ ] **Step 1: Add scorer tests for forbidden action promises**

If `action-scorer` does not already cover forbidden patterns against title, description, and aiPromise together, add this test to `packages/agent-core/src/__tests__/evals/scorers.test.ts`:

```ts
it('action scorer checks forbidden patterns across title description and aiPromise', () => {
  const results = actionScorer.score({
    evalCase: {
      id: 'case-action-forbidden',
      title: 'action forbidden',
      suite: 'core',
      category: 'homepage',
      priority: 'P1',
      tags: [],
      request: {
        requestId: 'r1',
        sessionId: 's1',
        profileId: 'profile-a',
        taskType: 'homepage_summary',
        pageContext: { profileId: 'profile-a', page: 'home', timeframe: 'week' },
      },
      expectations: {
        actions: {
          minCount: 1,
          forbiddenPatterns: ['实时监控', '开启.*模式'],
        },
      },
    } as any,
    envelope: {
      summary: 'summary',
      source: 'llm',
      statusColor: 'good',
      chartTokens: [],
      actions: [{
        id: 'a1',
        emoji: '⏰',
        title: '睡眠模式',
        description: '今晚开启睡眠模式',
        aiPromise: '我会实时监控你的睡眠',
      }],
      meta: {
        taskType: 'homepage_summary',
        pageContext: { profileId: 'profile-a', page: 'home', timeframe: 'week' },
        finishReason: 'complete',
      },
    },
    contextPacket: undefined,
    analysisPlan: undefined,
  } as any);

  const forbidden = results.find((r) => r.checkId.endsWith(':action:forbidden_patterns'));
  expect(forbidden?.passed).toBe(false);
});
```

- [ ] **Step 2: Run scorer test**

Run:

```bash
pnpm --filter @health-advisor/agent-core test -- src/__tests__/evals/scorers.test.ts
```

Expected: PASS if existing scorer already supports this; otherwise implement the missing behavior in `action-scorer.ts`.

- [ ] **Step 3: Add `homepage-focus-caffeine-reset.json`**

Create a core case with this structure. Use exact forbidden action patterns:

```json
{
  "id": "H-020",
  "title": "首页摘要 - 咖啡叠加深度专注后的重置建议",
  "suite": "core",
  "category": "homepage",
  "priority": "P1",
  "tags": ["homepage", "event-insights", "focus", "caffeine", "actions"],
  "setup": {
    "profileId": "profile-a",
    "timeline": {
      "appendSegments": [
        { "segmentType": "caffeine_intake", "offsetMinutes": 0, "durationMinutes": 10, "advanceClock": true },
        { "segmentType": "deep_focus", "offsetMinutes": 10, "durationMinutes": 120, "advanceClock": true }
      ]
    },
    "modelFixture": {
      "mode": "fake-json",
      "content": "{\"source\":\"llm\",\"statusColor\":\"warning\",\"summary\":\"巅峰，刚刚这段 120 min 的深度专注已经把大脑推到高负荷档位。\\n\\n这次专注前后还叠加了可能的咖啡因影响，心率和 HRV 的组合提示你的神经系统仍在偏紧的状态。现在最重要的不是继续硬扛，而是用短暂的身体切换把注意力和循环拉回来，避免下午后半段出现明显掉电。\\n\\n建议现在起身轻走 10 min，再用 3 min 延长呼气把心率慢慢压下来。你想先试哪个？\",\"chartTokens\":[\"HRV_7DAYS\"],\"actionsSectionTitle\":\"现在可以这样重置\",\"microTips\":[],\"actions\":[{\"id\":\"a1\",\"emoji\":\"🚶\",\"title\":\"要不要轻走一下\",\"description\":\"现在起身轻走 10 min，让久坐和专注负荷缓下来\",\"aiPromise\":\"我会记录你的选择并用于本次建议上下文\"},{\"id\":\"a2\",\"emoji\":\"🫁\",\"title\":\"要不要做组呼吸\",\"description\":\"做 3 min 延长呼气，帮助神经系统降档\",\"aiPromise\":\"我会记录你的选择并用于本次建议上下文\"}]}"
    },
    "referenceDate": "2026-04-27"
  },
  "request": {
    "requestId": "core-h020",
    "sessionId": "eval-session",
    "profileId": "profile-a",
    "taskType": "homepage_summary",
    "pageContext": { "profileId": "profile-a", "page": "home", "timeframe": "week" }
  },
  "expectations": {
    "protocol": { "requireValidEnvelope": true, "expectedSource": "llm", "expectedFinishReason": "complete" },
    "summary": {
      "mustMention": ["巅峰"],
      "mustMentionAny": [["专注", "深度专注"], ["重置", "轻走", "呼吸"]],
      "forbiddenPatterns": ["baseline", "基线", "基准线", "偏离基线"]
    },
    "status": { "allowedStatusColors": ["warning", "good"] },
    "actions": {
      "minCount": 2,
      "maxCount": 3,
      "requireAiPromise": true,
      "forbiddenPatterns": ["实时监控", "调整监测逻辑", "开启.*模式", "准时提醒", "无干扰模式"]
    },
    "taskSpecific": {
      "homepage": {
        "requireRecentEventFirst": true,
        "recentEventPatterns": ["专注", "深度专注"],
        "require24hCrossAnalysis": true,
        "crossAnalysisPatterns": {
          "event": ["专注", "咖啡"],
          "metric": ["心率", "HRV", "神经系统", "恢复"]
        }
      }
    },
    "safety": { "forbidDiagnosis": true, "forbidMedication": true, "forbidTreatmentPromise": true }
  }
}
```

- [ ] **Step 4: Add three more core cases**

Create:

```text
packages/agent-core/evals/cases/core/homepage/homepage-sedentary-fatigue-pivot.json
packages/agent-core/evals/cases/core/homepage/homepage-post-workout-recovery.json
packages/agent-core/evals/cases/core/homepage/homepage-alcohol-dinner-sleep-risk.json
```

Each file must follow the same expectation pattern as `H-020`:

- `summary.forbiddenPatterns`: `["baseline", "基线", "基准线", "偏离基线"]`
- `actions.minCount`: `2`
- `actions.maxCount`: `3`
- `actions.requireAiPromise`: `true`
- `actions.forbiddenPatterns`: `["实时监控", "调整监测逻辑", "开启.*模式", "准时提醒", "无干扰模式"]`
- `taskSpecific.homepage.requireRecentEventFirst`: `true`
- `taskSpecific.homepage.require24hCrossAnalysis`: `true`

Use these event expectations:

| File | recentEventPatterns | crossAnalysis event | crossAnalysis metric |
| --- | --- | --- | --- |
| `homepage-sedentary-fatigue-pivot.json` | `["久坐", "工作", "静止"]` | `["久坐", "工作"]` | `["HRV", "心率", "疲劳", "恢复"]` |
| `homepage-post-workout-recovery.json` | `["运动", "有氧", "训练"]` | `["运动", "训练"]` | `["心率", "恢复", "睡眠", "HRV"]` |
| `homepage-alcohol-dinner-sleep-risk.json` | `["饮酒", "晚餐"]` | `["饮酒", "晚餐"]` | `["心率", "HRV", "睡眠", "温度"]` |

- [ ] **Step 5: Run core homepage cases**

Run the new cases individually:

```bash
pnpm --filter @health-advisor/agent-core eval:agent:case -- packages/agent-core/evals/cases/core/homepage/homepage-focus-caffeine-reset.json
pnpm --filter @health-advisor/agent-core eval:agent:case -- packages/agent-core/evals/cases/core/homepage/homepage-sedentary-fatigue-pivot.json
pnpm --filter @health-advisor/agent-core eval:agent:case -- packages/agent-core/evals/cases/core/homepage/homepage-post-workout-recovery.json
pnpm --filter @health-advisor/agent-core eval:agent:case -- packages/agent-core/evals/cases/core/homepage/homepage-alcohol-dinner-sleep-risk.json
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/agent-core/evals/cases/core/homepage/homepage-focus-caffeine-reset.json packages/agent-core/evals/cases/core/homepage/homepage-sedentary-fatigue-pivot.json packages/agent-core/evals/cases/core/homepage/homepage-post-workout-recovery.json packages/agent-core/evals/cases/core/homepage/homepage-alcohol-dinner-sleep-risk.json packages/agent-core/src/evals/scorers/action-scorer.ts packages/agent-core/src/__tests__/evals/scorers.test.ts
git commit -m "test(eval): cover event-focused homepage briefs"
```

---

## Module H: End-to-End Validation

### Task 9: Full Verification and Cleanup

**Dependencies:** Tasks 1-8.

**Purpose:** Confirm the implementation works across unit tests, prompt rendering, eval cases, and repository validation.

**Files:**
- No planned source changes unless verification exposes a defect.

- [ ] **Step 1: Run focused agent-core tests**

Run:

```bash
pnpm --filter @health-advisor/agent-core test -- src/__tests__/context/homepage-event-insights.test.ts src/__tests__/context/context-packet-builder.test.ts src/__tests__/prompts/context-packet-renderer.test.ts src/__tests__/prompts/task-builder.test.ts src/__tests__/output/verifier.test.ts src/__tests__/evals/scorers.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run package typecheck**

Run:

```bash
pnpm --filter @health-advisor/agent-core typecheck
```

Expected: PASS.

- [ ] **Step 3: Run homepage eval smoke and new cases**

Run:

```bash
pnpm --filter @health-advisor/agent-core eval:agent:smoke
pnpm --filter @health-advisor/agent-core eval:agent:case -- packages/agent-core/evals/cases/core/homepage/homepage-focus-caffeine-reset.json
pnpm --filter @health-advisor/agent-core eval:agent:case -- packages/agent-core/evals/cases/core/homepage/homepage-sedentary-fatigue-pivot.json
pnpm --filter @health-advisor/agent-core eval:agent:case -- packages/agent-core/evals/cases/core/homepage/homepage-post-workout-recovery.json
pnpm --filter @health-advisor/agent-core eval:agent:case -- packages/agent-core/evals/cases/core/homepage/homepage-alcohol-dinner-sleep-risk.json
```

Expected: PASS.

- [ ] **Step 4: Run repository data validation**

Run:

```bash
pnpm validate
```

Expected: PASS.

- [ ] **Step 5: Scan active homepage prompt output for forbidden terminology**

Run:

```bash
rg -n "baseline|基线|基准线|偏离基线" data/sandbox/prompts/homepage packages/agent-core/src/prompts packages/agent-core/src/context packages/agent-core/src/output packages/agent-core/evals/cases/core/homepage
```

Expected:

- No matches in active user-visible prompt instructions, homepage fixtures, or verifier-safe generated examples.
- Type names or `profile.baselines` internal field references may still appear in TypeScript code. If matches are internal data fields, leave them in place.

- [ ] **Step 6: Inspect git status**

Run:

```bash
git status --short
```

Expected:

- Only files from this implementation branch are changed.
- Existing unrelated sandbox data changes should not be reverted or included unless this implementation intentionally touched them.

- [ ] **Step 7: Handle verification defects**

If Step 1-5 exposes a defect, stop this final verification task and return to the owning task:

- Prompt failures return to Task 1 or Task 6.
- Type or packet failures return to Task 2, Task 3, Task 4, or Task 5.
- Verifier failures return to Task 7.
- Eval failures return to Task 8.

After repairing the owning task, rerun Task 9 from Step 1. If Task 9 produces no file changes, do not create an empty commit.

---

## Self-Review Checklist

Before marking this plan complete:

- Each task has explicit dependencies.
- Each module has a clear topological position.
- Each task names exact files to create or modify.
- Each task has a failing-test step before implementation.
- Each task has exact verification commands.
- Each task has a conventional commit message.
- No task requires hidden context outside this plan and `docs/superpowers/specs/2026-05-28-homepage-realtime-brief-optimization-design.md`.
- The plan does not ask engineers to revert unrelated dirty worktree files.
