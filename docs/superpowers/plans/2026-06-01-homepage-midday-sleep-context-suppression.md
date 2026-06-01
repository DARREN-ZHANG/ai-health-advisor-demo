# Homepage Midday Sleep Context Suppression Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复首页实时简报在 13:00 且已有多个日内事件时仍展开昨晚睡眠、并在运动后建议里过早谈“今晚睡眠”的问题。

**Architecture:** 在 context 层引入确定性的首页“恢复背景显著性”选择策略，把睡眠从默认恢复背景改为按事件类型、当前时间、异常严重度显式进入。`homepage-event-insights` 只把与主事件有直接解释价值的恢复指标暴露给 LLM；renderer、prompt 和 eval 共同保证中午的非睡眠主事件不把睡眠写成主体或行动建议。修复点在结构化上下文和候选动作生成处完成，不使用输出后处理。

**Tech Stack:** TypeScript, pnpm, Vitest, existing `@health-advisor/agent-core` context / prompt / eval stack.

---

## 背景与复现

复现场景：

1. profile-a 初始化。
2. Timeline Control 已推进到 `2026-06-01T13:00`。
3. 事件总数已经到 5，最近主事件是一次约 30 min 的 `walk`。
4. 首页实时简报输出：

```text
林巅峰，动起来感觉不错吧！刚刚监测到你完成了一次约 30 分钟的步行锻炼。

在这半小时里，你的心率最高达到了 107 bpm，平均维持在 100 bpm 左右，相比你平时 48 bpm 的“强力引擎”，这次活动让循环系统得到了很好的激活。这步走得正是时候，刚好打破了你上午长达 4 个小时的连续久坐，帮你把累积的静止负荷释放了出来。不过从恢复背景来看，昨晚你只睡了 7 个半小时左右，比平时少了一些，虽然优秀的 HRV 状态依然在支撑着你，但身体的恢复底子稍微有点单薄。

现在身体正处于运动后的恢复窗口，建议先小口喝点水，做些轻度走动帮助心率平稳回落。今晚也可以提前一小时调暗灯光，把昨晚欠的睡眠补回来。你想先从哪一步开始？
```

期望：

- 13:00 的实时简报以最近步行事件为主。
- 如需要提及背景，应优先提及“打断上午 4h 久坐”这类与步行直接相关的日内事件背景。
- 睡眠不是最近事件，也不是当前主事件的直接问题，不应在 summary 中展开“昨晚睡眠偏少”。
- 当前时间是 13:00，建议应围绕运动后补水、冷身、轻度恢复、接下来活动节奏，不应提前给出“今晚睡眠”建议。

## 根因定位

根因不是“睡眠事件仍在 recentEvents 里”。当前 `buildRecentEvents()` 已经只取最近 2 个识别事件，睡眠早晨事件在事件数达到 5 后通常不会作为 `recentEvents` 传给 LLM。

真正的问题是睡眠仍从其他通道进入 LLM：

1. `packages/agent-core/src/context/context-packet-builder.ts:414-420` 无条件把最新日记录里的 `sleep_total`、`sleep_deep`、`sleep_rem` 写入 `latest24h.metrics`。
2. `packages/agent-core/src/context/homepage-event-insights.ts:178-195` 的 `buildRecoveryContext()` 对每个事件都加入 `sleep_total`，即使睡眠状态正常、当前事件是中午步行，也会渲染为“恢复背景”。
3. `packages/agent-core/src/context/homepage-event-insights.ts:71-75` 把 `latest24h.metrics` 的 evidence id 全部并入每个 `HomepageEventInsight.evidenceIds`，使睡眠 evidence 继续作为可引用事实存在。
4. `packages/agent-core/src/prompts/context-packet-renderer.ts:230-235` 会把 `recoveryContext` 和 `recommendedFocus` 原样渲染给 LLM，因此睡眠背景和睡眠保护建议有很高可见度。
5. `packages/agent-core/src/context/homepage-event-insights.ts:232-238` 对 `cardio_workout` / `hiit_workout` 无条件生成 `sleep_protection`，时间写死为“今晚睡前 60 min”。`walk` 被 `normalizeHomepageEventType()` 映射为 `cardio_workout`，所以 13:00 的步行也会得到今晚睡眠建议。
6. `data/sandbox/prompts/homepage/template.md:26-30` 明确允许段落 2 用“昨晚睡眠偏少，恢复还没跟上”作为 24h 交叉验证示例；`template.md:81-83` 又允许睡眠数值引用。这会放大上游暴露的睡眠事实。
7. `packages/agent-core/src/rules/homepage-rules.ts` 的 `sleepRule` 和默认 `suggestHomepageTokens()` 仍可把 sleep insight / `SLEEP_7DAYS` 带回首页上下文。即使不是本次输出的主要来源，也需要与新策略一致，避免后续 case 复发。

核心修复原则：

- 睡眠不是不能用于首页，而是必须先通过“当前主事件是否需要睡眠解释”的显著性判断。
- 显著性判断应基于结构化上下文：主事件类型、当前模拟时间、睡眠指标状态、睡眠相关事件或持续影响事件，而不是在 LLM 输出后删词。
- action 候选应由主事件和当前时间共同决定；13:00 的运动后建议不应生成今晚睡眠候选。

## Module Topology

```text
Module A: Recovery Relevance Policy
  Task 1
  No dependency. Must complete before B/C/D.

Module B: Event Insight Context Gating
  Task 2 depends on Task 1
  Task 3 depends on Task 2

Module C: Renderer and Prompt Contract
  Task 4 depends on Tasks 1-3

Module D: Eval Guardrails
  Task 5 depends on Task 4

Module E: End-to-End Validation
  Task 6 depends on Tasks 1-5
```

Parallelization guidance:

- Task 1 and Task 5 can be drafted in parallel once type names are agreed, but Task 5 final assertions must match Task 1's public API.
- Task 2 and Task 3 should be implemented by the same engineer because both modify `homepage-event-insights.ts`.
- Task 4 must wait for Task 2 so renderer can use the new `recoveryContext` shape.
- Task 6 is the final integration gate and should run after all code and eval changes.

## File Responsibility Map

| File | Responsibility |
| --- | --- |
| `packages/agent-core/src/context/context-packet.ts` | Add typed recovery relevance metadata and event action time bucket fields. |
| `packages/agent-core/src/context/homepage-recovery-relevance.ts` | New pure policy module deciding whether sleep is material for the current homepage brief. |
| `packages/agent-core/src/context/homepage-event-insights.ts` | Use the policy to filter recovery context, event evidence ids, and time-aware recommended focus. |
| `packages/agent-core/src/prompts/context-packet-renderer.ts` | Render only material recovery context; render explicit “do not discuss suppressed recovery metrics” guard. |
| `data/sandbox/prompts/homepage/template.md` | Replace broad sleep examples with conditional rules tied to material recovery context. |
| `packages/agent-core/src/rules/homepage-rules.ts` | Align sleep rule visibility and default chart tokens with event-mode relevance. |
| `packages/agent-core/src/evals/types.ts` | Add homepage forbidden / ordering fields for sleep-background leakage checks if not already present. |
| `packages/agent-core/src/evals/case-schema.ts` | Validate the new expectation fields. |
| `packages/agent-core/src/evals/scorers/task-scorer.ts` | Score “sleep not mentioned before evening when not material” and “no tonight sleep action at midday”. |
| `packages/agent-core/evals/cases/core/homepage/*.json` | Add a deterministic 13:00 walk case and adjust workout cases that currently require sleep. |

---

## Module A: Recovery Relevance Policy

### Task 1: Add a Deterministic Recovery Metric Relevance Policy

**Dependencies:** None.

**Context:** 睡眠目前通过 `latest24h` 默认进入每个事件的 `recoveryContext`。需要一个纯函数决定某个恢复指标是否应该用于当前首页 brief。该策略必须输入完整结构化上下文，输出显式 reason，方便 renderer 和 eval 验证。

**Files:**
- Create: `packages/agent-core/src/context/homepage-recovery-relevance.ts`
- Modify: `packages/agent-core/src/context/context-packet.ts`
- Test: `packages/agent-core/src/__tests__/context/homepage-recovery-relevance.test.ts`

- [ ] **Step 1: Add type fields**

In `packages/agent-core/src/context/context-packet.ts`, replace `RecoveryContextSummary` with:

```ts
export type RecoveryContextVisibility = 'material' | 'suppressed';

export type RecoveryContextReason =
  | 'primary_event_is_sleep_related'
  | 'primary_event_has_evening_sleep_risk'
  | 'metric_is_attention_or_critical'
  | 'metric_supports_current_event'
  | 'not_material_to_current_event';

export interface RecoveryContextSummary {
  source: 'latest24h' | 'trend7d' | 'profile';
  metric: string;
  relation: 'supports' | 'conflicts' | 'neutral' | 'missing';
  summary: string;
  visibility: RecoveryContextVisibility;
  reason: RecoveryContextReason;
  evidenceId?: string;
}
```

- [ ] **Step 2: Create the policy module**

Create `packages/agent-core/src/context/homepage-recovery-relevance.ts`:

```ts
import type { HomepageSemanticEventType, Latest24hMetric, RecoveryContextReason } from './context-packet';

export interface RecoveryMetricRelevanceInput {
  metric: Latest24hMetric;
  primaryEventType: HomepageSemanticEventType;
  demoNow?: string;
}

export interface RecoveryMetricRelevance {
  visible: boolean;
  reason: RecoveryContextReason;
}

const SLEEP_RISK_EVENT_TYPES = new Set<HomepageSemanticEventType>([
  'sleep_end',
  'prepare_sleep',
  'possible_caffeine_intake',
  'possible_alcohol_intake',
]);

const RECOVERY_DEMAND_EVENT_TYPES = new Set<HomepageSemanticEventType>([
  'hiit_workout',
  'stress_spike',
]);

export function getLocalHour(timestamp?: string): number | undefined {
  if (!timestamp) return undefined;
  const match = timestamp.match(/T(\d{2}):/);
  if (!match) return undefined;
  return Number(match[1]);
}

export function isEveningSleepActionWindow(timestamp?: string): boolean {
  const hour = getLocalHour(timestamp);
  return hour !== undefined && hour >= 18;
}

export function isSleepMetric(metricName: string): boolean {
  return metricName === 'sleep_total' || metricName === 'sleep_deep' || metricName === 'sleep_rem';
}

export function decideRecoveryMetricRelevance(input: RecoveryMetricRelevanceInput): RecoveryMetricRelevance {
  const { metric, primaryEventType, demoNow } = input;

  if (!isSleepMetric(metric.metric)) {
    return { visible: true, reason: 'metric_supports_current_event' };
  }

  if (SLEEP_RISK_EVENT_TYPES.has(primaryEventType)) {
    return { visible: true, reason: 'primary_event_is_sleep_related' };
  }

  if (metric.status === 'critical') {
    return { visible: true, reason: 'metric_is_attention_or_critical' };
  }

  if (
    metric.status === 'attention'
    && RECOVERY_DEMAND_EVENT_TYPES.has(primaryEventType)
    && isEveningSleepActionWindow(demoNow)
  ) {
    return { visible: true, reason: 'primary_event_has_evening_sleep_risk' };
  }

  return { visible: false, reason: 'not_material_to_current_event' };
}
```

- [ ] **Step 3: Add failing policy tests**

Create `packages/agent-core/src/__tests__/context/homepage-recovery-relevance.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  decideRecoveryMetricRelevance,
  isEveningSleepActionWindow,
} from '../../context/homepage-recovery-relevance';
import type { Latest24hMetric } from '../../context/context-packet';

const normalSleep: Latest24hMetric = {
  metric: 'sleep_total',
  value: 450,
  unit: 'min',
  baseline: 600,
  deltaPctVsBaseline: -25,
  status: 'normal',
  evidenceId: 'latest24h_sleep_total_2026-06-01',
};

const attentionSleep: Latest24hMetric = {
  ...normalSleep,
  status: 'attention',
};

const criticalSleep: Latest24hMetric = {
  ...normalSleep,
  status: 'critical',
};

it('suppresses sleep context for a 13:00 walk when sleep is not critical', () => {
  expect(decideRecoveryMetricRelevance({
    metric: normalSleep,
    primaryEventType: 'cardio_workout',
    demoNow: '2026-06-01T13:00',
  })).toEqual({
    visible: false,
    reason: 'not_material_to_current_event',
  });
});

it('keeps critical sleep context regardless of hour because it changes safety boundary', () => {
  expect(decideRecoveryMetricRelevance({
    metric: criticalSleep,
    primaryEventType: 'cardio_workout',
    demoNow: '2026-06-01T13:00',
  })).toEqual({
    visible: true,
    reason: 'metric_is_attention_or_critical',
  });
});

it('keeps attention sleep for evening high recovery demand events', () => {
  expect(decideRecoveryMetricRelevance({
    metric: attentionSleep,
    primaryEventType: 'hiit_workout',
    demoNow: '2026-06-01T19:30',
  })).toEqual({
    visible: true,
    reason: 'primary_event_has_evening_sleep_risk',
  });
});

it('keeps sleep context when the primary event itself is sleep-related', () => {
  expect(decideRecoveryMetricRelevance({
    metric: normalSleep,
    primaryEventType: 'possible_caffeine_intake',
    demoNow: '2026-06-01T15:30',
  })).toEqual({
    visible: true,
    reason: 'primary_event_is_sleep_related',
  });
});

it('treats 18:00 and later as the sleep action window', () => {
  expect(isEveningSleepActionWindow('2026-06-01T13:00')).toBe(false);
  expect(isEveningSleepActionWindow('2026-06-01T18:00')).toBe(true);
  expect(isEveningSleepActionWindow('2026-06-01T22:30')).toBe(true);
});
```

- [ ] **Step 4: Run the failing tests**

Run:

```bash
pnpm --filter @health-advisor/agent-core test -- src/__tests__/context/homepage-recovery-relevance.test.ts
```

Expected before implementation completion: FAIL if the new module or fields are missing. Expected after Step 2: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/agent-core/src/context/context-packet.ts packages/agent-core/src/context/homepage-recovery-relevance.ts packages/agent-core/src/__tests__/context/homepage-recovery-relevance.test.ts
git commit -m "feat(context): add homepage recovery relevance policy"
```

---

## Module B: Event Insight Context Gating

### Task 2: Filter Sleep Recovery Context and Evidence by Relevance

**Dependencies:** Task 1.

**Context:** `buildRecoveryContext()` currently adds sleep for every event. Even if renderer later compresses latest24h, `eventInsights.recoveryContext` still tells LLM that sleep is relevant. This task moves the gating into `homepage-event-insights.ts`.

**Files:**
- Modify: `packages/agent-core/src/context/homepage-event-insights.ts`
- Test: `packages/agent-core/src/__tests__/context/homepage-event-insights.test.ts`

- [ ] **Step 1: Add failing tests**

Append to `packages/agent-core/src/__tests__/context/homepage-event-insights.test.ts`:

```ts
it('does not attach sleep recovery context or sleep evidence to a midday walk insight', () => {
  const insights = buildHomepageEventInsights({
    demoNow: '2026-06-01T13:00',
    homepage: makeHomepage({
      latest24h: {
        date: '2026-06-01',
        metrics: [
          { metric: 'sleep_total', value: 450, unit: 'min', baseline: 600, deltaPctVsBaseline: -25, status: 'normal', evidenceId: 'latest24h_sleep_total_2026-06-01' },
          { metric: 'hrv', value: 93, unit: 'ms', baseline: 90, deltaPctVsBaseline: 3, status: 'normal', evidenceId: 'latest24h_hrv_2026-06-01' },
        ],
      },
      recentEvents: [{
        recognizedEventId: 're-walk-1',
        type: 'walk',
        start: '2026-06-01T12:30',
        end: '2026-06-01T13:00',
        durationMin: 30,
        confidence: 0.91,
        sourceSegmentId: 'seg-walk-1',
        recognitionEvidence: ['步行 30 min, 心率均值 100'],
        eventWindow: {
          source: 'synced_device_samples',
          coverage: 'complete',
          recognizedEventId: 're-walk-1',
          sourceSegmentId: 'seg-walk-1',
          start: '2026-06-01T12:30',
          end: '2026-06-01T13:00',
          durationMin: 30,
          sampleCount: 12,
          metrics: [
            { metric: 'heart_rate', unit: 'bpm', sampleCount: 6, startValue: 84, endValue: 91, latest: 91, min: 84, max: 107, average: 100, delta: 7, qualifier: 'elevated', interpretation: '事件窗口心率峰值 107bpm，均值 100bpm', evidenceId: 'event_window_re-walk-1_heart_rate' },
            { metric: 'steps', unit: 'steps', sampleCount: 6, startValue: 0, endValue: 3100, latest: 3100, min: 0, max: 3100, average: 1550, delta: 3100, qualifier: 'elevated', interpretation: '事件窗口累计步数 3100steps', evidenceId: 'event_window_re-walk-1_steps' },
          ],
          evidenceIds: ['event_window_re-walk-1_heart_rate', 'event_window_re-walk-1_steps'],
        },
        syncState: { lastSyncedMeasuredAt: '2026-06-01T13:00', pendingEventCount: 0, fromSyncedWindow: true },
        evidenceIds: ['event_walk_2026-06-01T12:30'],
      }],
      rulesInsights: [],
    }),
  });

  expect(insights).toHaveLength(1);
  expect(insights[0]!.eventType).toBe('cardio_workout');
  expect(insights[0]!.recoveryContext.map((ctx) => ctx.metric)).not.toContain('sleep_total');
  expect(insights[0]!.evidenceIds).not.toContain('latest24h_sleep_total_2026-06-01');
});

it('keeps sleep recovery context for an evening HIIT event when sleep is attention', () => {
  const insights = buildHomepageEventInsights({
    demoNow: '2026-06-01T19:30',
    homepage: makeHomepage({
      latest24h: {
        date: '2026-06-01',
        metrics: [
          { metric: 'sleep_total', value: 360, unit: 'min', baseline: 600, deltaPctVsBaseline: -40, status: 'attention', evidenceId: 'latest24h_sleep_total_2026-06-01' },
          { metric: 'hrv', value: 72, unit: 'ms', baseline: 90, deltaPctVsBaseline: -20, status: 'normal', evidenceId: 'latest24h_hrv_2026-06-01' },
        ],
      },
      recentEvents: [{
        recognizedEventId: 're-hiit-1',
        type: 'intermittent_exercise',
        start: '2026-06-01T19:00',
        end: '2026-06-01T19:30',
        durationMin: 30,
        confidence: 0.92,
        sourceSegmentId: 'seg-hiit-1',
        recognitionEvidence: ['间歇训练 30 min'],
        syncState: { lastSyncedMeasuredAt: '2026-06-01T19:30', pendingEventCount: 0, fromSyncedWindow: true },
        evidenceIds: ['event_hiit'],
      }],
      rulesInsights: [],
    }),
  });

  expect(insights[0]!.eventType).toBe('hiit_workout');
  expect(insights[0]!.recoveryContext).toContainEqual(expect.objectContaining({
    metric: 'sleep_total',
    visibility: 'material',
    reason: 'primary_event_has_evening_sleep_risk',
  }));
  expect(insights[0]!.evidenceIds).toContain('latest24h_sleep_total_2026-06-01');
});
```

- [ ] **Step 2: Run tests and confirm failure**

Run:

```bash
pnpm --filter @health-advisor/agent-core test -- src/__tests__/context/homepage-event-insights.test.ts
```

Expected: FAIL because `buildRecoveryContext()` still includes sleep for midday walk and evidence ids still include all latest24h ids.

- [ ] **Step 3: Update `buildHomepageEventInsights()`**

In `packages/agent-core/src/context/homepage-event-insights.ts`, import the policy:

```ts
import {
  decideRecoveryMetricRelevance,
  isSleepMetric,
} from './homepage-recovery-relevance';
```

Change the per-event mapping:

```ts
const recoveryContext = buildRecoveryContext(homepage.latest24h.metrics, eventType, demoNow);
const visibleRecoveryEvidenceIds = recoveryContext
  .filter((ctx) => ctx.visibility === 'material')
  .map((ctx) => ctx.evidenceId)
  .filter((id): id is string => typeof id === 'string' && id.length > 0);
```

Replace the evidence id block with:

```ts
evidenceIds: [
  ...event.evidenceIds,
  ...event.eventWindow?.evidenceIds ?? [],
  ...visibleRecoveryEvidenceIds,
],
```

Replace `buildRecoveryContext(metrics: Latest24hMetric[])` with:

```ts
function buildRecoveryContext(
  metrics: Latest24hMetric[],
  primaryEventType: ReturnType<typeof normalizeHomepageEventType>,
  demoNow?: string,
): RecoveryContextSummary[] {
  const sleep = metric(metrics, 'sleep_total');
  const hrv = metric(metrics, 'hrv');
  const contexts: RecoveryContextSummary[] = [];

  if (sleep) {
    const relevance = decideRecoveryMetricRelevance({
      metric: sleep,
      primaryEventType,
      demoNow,
    });

    if (relevance.visible) {
      contexts.push({
        source: 'latest24h',
        metric: 'sleep_total',
        relation: sleep.status === 'normal' ? 'supports' : sleep.status === 'missing' ? 'missing' : 'conflicts',
        summary: sleep.status === 'normal'
          ? '过去 24h 睡眠可作为当前事件的恢复底子'
          : sleep.status === 'missing'
            ? '缺少最近睡眠数据，无法完整判断恢复背景'
            : '过去 24h 睡眠不足，当前事件需要更保守处理',
        visibility: 'material',
        reason: relevance.reason,
        evidenceId: sleep.evidenceId,
      });
    }
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
      visibility: 'material',
      reason: 'metric_supports_current_event',
      evidenceId: hrv.evidenceId,
    });
  }

  return contexts.filter((ctx) => !isSleepMetric(ctx.metric) || ctx.visibility === 'material');
}
```

- [ ] **Step 4: Run tests**

Run:

```bash
pnpm --filter @health-advisor/agent-core test -- src/__tests__/context/homepage-event-insights.test.ts src/__tests__/context/homepage-recovery-relevance.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/agent-core/src/context/homepage-event-insights.ts packages/agent-core/src/__tests__/context/homepage-event-insights.test.ts
git commit -m "feat(context): gate homepage sleep recovery context"
```

### Task 3: Make Recommended Focus Time-Aware for Midday Workouts

**Dependencies:** Task 2.

**Context:** `walk` 目前被映射成 `cardio_workout`，而 `cardio_workout` 无条件生成 `sleep_protection`，导致 13:00 步行后 action 候选和 summary 都出现“今晚睡眠”。需要让建议方向根据 `demoNow` 和事件类型决定。

**Files:**
- Modify: `packages/agent-core/src/context/homepage-event-insights.ts`
- Test: `packages/agent-core/src/__tests__/context/homepage-event-insights.test.ts`

- [ ] **Step 1: Add failing tests**

Append:

```ts
it('does not recommend sleep protection for a 13:00 walk', () => {
  const insights = buildHomepageEventInsights({
    demoNow: '2026-06-01T13:00',
    homepage: makeHomepage({
      recentEvents: [{
        recognizedEventId: 're-walk-1',
        type: 'walk',
        start: '2026-06-01T12:30',
        end: '2026-06-01T13:00',
        durationMin: 30,
        confidence: 0.91,
        sourceSegmentId: 'seg-walk-1',
        recognitionEvidence: ['步行 30 min'],
        syncState: { lastSyncedMeasuredAt: '2026-06-01T13:00', pendingEventCount: 0, fromSyncedWindow: true },
        evidenceIds: ['event_walk'],
      }],
    }),
  });

  expect(insights[0]!.recommendedFocus.map((focus) => focus.category)).not.toContain('sleep_protection');
  expect(insights[0]!.actionIntents.map((action) => action.title).join('\n')).not.toMatch(/睡眠|入睡|调暗|深睡/);
});

it('keeps sleep protection for evening high intensity workouts', () => {
  const insights = buildHomepageEventInsights({
    demoNow: '2026-06-01T19:30',
    homepage: makeHomepage({
      recentEvents: [{
        recognizedEventId: 're-hiit-1',
        type: 'intermittent_exercise',
        start: '2026-06-01T19:00',
        end: '2026-06-01T19:30',
        durationMin: 30,
        confidence: 0.92,
        sourceSegmentId: 'seg-hiit-1',
        recognitionEvidence: ['间歇训练 30 min'],
        syncState: { lastSyncedMeasuredAt: '2026-06-01T19:30', pendingEventCount: 0, fromSyncedWindow: true },
        evidenceIds: ['event_hiit'],
      }],
    }),
  });

  expect(insights[0]!.recommendedFocus.map((focus) => focus.category)).toContain('sleep_protection');
});
```

- [ ] **Step 2: Run tests and confirm failure**

Run:

```bash
pnpm --filter @health-advisor/agent-core test -- src/__tests__/context/homepage-event-insights.test.ts
```

Expected: FAIL because midday `walk` currently receives `sleep_protection`.

- [ ] **Step 3: Pass `demoNow` into recommended focus**

Change:

```ts
const recommendedFocus = buildRecommendedFocus(eventType, tension);
```

to:

```ts
const recommendedFocus = buildRecommendedFocus(eventType, tension, demoNow);
```

Change the function signature:

```ts
function buildRecommendedFocus(
  eventType: ReturnType<typeof normalizeHomepageEventType>,
  tension: EventBodyTension,
  demoNow?: string,
): RecommendedFocus[] {
```

Import `isEveningSleepActionWindow`:

```ts
import {
  decideRecoveryMetricRelevance,
  isEveningSleepActionWindow,
  isSleepMetric,
} from './homepage-recovery-relevance';
```

Replace the workout case with:

```ts
case 'cardio_workout':
case 'hiit_workout': {
  const focus: RecommendedFocus[] = [
    { category: 'hydration', action: '小口补水并做轻度走动冷身', durationMin: 10, rationale: '帮助心率平稳回落并支持循环恢复' },
    { category: 'nutrition', action: '补充蛋白质和易消化碳水', timing: '运动后 45 min 内', rationale: '支持糖原回补和肌肉修复' },
  ];

  if (eventType === 'hiit_workout' && isEveningSleepActionWindow(demoNow)) {
    focus.push({ category: 'sleep_protection', action: '睡前降低刺激和屏幕暴露', timing: '今晚睡前 60 min', rationale: '保护高强度运动后的深睡恢复窗口' });
  }

  return focus;
}
```

- [ ] **Step 4: Run tests**

Run:

```bash
pnpm --filter @health-advisor/agent-core test -- src/__tests__/context/homepage-event-insights.test.ts src/__tests__/context/homepage-recovery-relevance.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/agent-core/src/context/homepage-event-insights.ts packages/agent-core/src/__tests__/context/homepage-event-insights.test.ts
git commit -m "feat(context): make homepage workout actions time aware"
```

---

## Module C: Renderer and Prompt Contract

### Task 4: Render Suppressed Sleep as a Constraint, Not as Evidence

**Dependencies:** Tasks 1-3.

**Context:** 即使 `eventInsights.recoveryContext` 不再含睡眠，`latest24h`、Evidence Facts、规则提示仍可能让 LLM 看到睡眠。renderer 需要在有最近事件时把未显著的睡眠指标从高可见上下文中移除，并渲染明确约束。

**Files:**
- Modify: `packages/agent-core/src/prompts/context-packet-renderer.ts`
- Modify: `data/sandbox/prompts/homepage/template.md`
- Modify: `packages/agent-core/src/__tests__/prompts/context-packet-renderer.test.ts`

- [ ] **Step 1: Add failing renderer test**

Append to `packages/agent-core/src/__tests__/prompts/context-packet-renderer.test.ts`:

```ts
it('does not render sleep latest24h or tonight sleep action context for a 13:00 walk event', () => {
  const packet: TaskContextPacket = {
    task: { type: 'homepage_summary', page: 'home' },
    userContext: {
      profileId: 'profile-a',
      name: '林巅峰',
      age: 34,
      tags: [],
      baselines: { restingHR: 48, hrv: 95, spo2: 98, avgSleepMinutes: 600, avgSteps: 9000 },
    },
    dataWindow: { start: '2026-05-26', end: '2026-06-01', recordCount: 7, completenessPct: 100 },
    missingData: [],
    evidence: [
      { id: 'latest24h_sleep_total_2026-06-01', source: 'daily_records', metric: 'sleep_total', value: 450, unit: 'min', dateRange: { start: '2026-06-01', end: '2026-06-01' }, derivation: 'latest record for sleep_total' },
      { id: 'event_walk_2026-06-01T12:30', source: 'timeline_sync', metric: 'walk', dateRange: { start: '2026-06-01T12:30', end: '2026-06-01T13:00' }, derivation: 'recognized event from timeline sync, confidence 91%' },
    ],
    visibleCharts: [],
    homepage: {
      recentEvents: [{
        recognizedEventId: 're-walk-1',
        type: 'walk',
        start: '2026-06-01T12:30',
        end: '2026-06-01T13:00',
        durationMin: 30,
        confidence: 0.91,
        sourceSegmentId: 'seg-walk-1',
        recognitionEvidence: ['步行 30 min'],
        syncState: { lastSyncedMeasuredAt: '2026-06-01T13:00', pendingEventCount: 0, fromSyncedWindow: true },
        evidenceIds: ['event_walk_2026-06-01T12:30'],
      }],
      latest24h: {
        date: '2026-06-01',
        metrics: [
          { metric: 'sleep_total', value: 450, unit: 'min', baseline: 600, deltaPctVsBaseline: -25, status: 'normal', evidenceId: 'latest24h_sleep_total_2026-06-01' },
          { metric: 'hrv', value: 93, unit: 'ms', baseline: 95, deltaPctVsBaseline: -2, status: 'normal', evidenceId: 'latest24h_hrv_2026-06-01' },
        ],
      },
      trend7d: [],
      rulesInsights: [],
      suggestedChartTokens: [],
      eventInsights: [{
        eventId: 'event_walk_2026-06-01T12:30',
        eventType: 'cardio_workout',
        priority: 'high',
        timeRelation: '刚结束约 0 min',
        headline: '完成 30 min 训练，身体进入恢复窗口',
        physiology: [],
        recoveryContext: [{
          source: 'latest24h',
          metric: 'hrv',
          relation: 'supports',
          summary: 'HRV 状态支持当前活动安排',
          visibility: 'material',
          reason: 'metric_supports_current_event',
          evidenceId: 'latest24h_hrv_2026-06-01',
        }],
        tension: { level: 'positive', summary: '事件窗口内没有明显冲突信号', reason: 'event-window markers do not indicate elevated tension' },
        recommendedFocus: [
          { category: 'hydration', action: '小口补水并做轻度走动冷身', durationMin: 10, rationale: '帮助心率平稳回落并支持循环恢复' },
        ],
        actionIntents: [],
        evidenceIds: ['event_walk_2026-06-01T12:30', 'latest24h_hrv_2026-06-01'],
      }],
    },
  };

  const output = renderTaskContextPacket(packet, 'zh', '2026-06-01T13:00');

  expect(output).toContain('## 事件生理摘要（优先引用）');
  expect(output).toContain('恢复背景：supports hrv');
  expect(output).toContain('非显著恢复指标');
  expect(output).not.toContain('sleep_total：450min');
  expect(output).not.toContain('latest24h_sleep_total_2026-06-01');
  expect(output).not.toContain('今晚睡前');
});
```

- [ ] **Step 2: Run renderer test and confirm failure**

Run:

```bash
pnpm --filter @health-advisor/agent-core test -- src/__tests__/prompts/context-packet-renderer.test.ts
```

Expected: FAIL because evidence still renders `latest24h_sleep_total_2026-06-01` and no suppressed-metric constraint exists.

- [ ] **Step 3: Filter homepage evidence facts for event mode**

In `packages/agent-core/src/prompts/context-packet-renderer.ts`, add helpers near `renderEvidence()`:

```ts
function homepageVisibleEvidenceIds(homepage?: HomepageContextPacket): Set<string> | undefined {
  if (!homepage || homepage.recentEvents.length === 0) return undefined;
  return new Set(homepage.eventInsights.flatMap((insight) => insight.evidenceIds));
}

function renderEvidence(evidence: EvidenceFact[], visibleEvidenceIds?: Set<string>): string {
  const facts = visibleEvidenceIds
    ? evidence.filter((fact) => visibleEvidenceIds.has(fact.id))
    : evidence;
  if (facts.length === 0) return '';

  const lines = ['## Evidence Facts'];
  for (const fact of facts) {
    const parts: string[] = [`- ${fact.id}:`];
    parts.push(`source=${fact.source}`);
    if (fact.dateRange) parts.push(`${fact.dateRange.start}~${fact.dateRange.end}`);
    if (fact.metric) parts.push(`metric=${fact.metric}`);
    if (fact.value !== undefined) {
      parts.push(`value=${fact.value}${fact.unit ?? ''}`);
    }
    parts.push(`derivation=${fact.derivation}`);
    lines.push(parts.join(', '));
  }
  return lines.join('\n');
}
```

Change the top-level call:

```ts
sections.push(renderEvidence(packet.evidence, homepageVisibleEvidenceIds(packet.homepage)));
```

- [ ] **Step 4: Render suppressed recovery constraint**

In `renderHomepage()`, after event insights and before `过去24小时状态`, add:

```ts
if (hasEvents) {
  const materialRecoveryMetrics = new Set(
    homepage.eventInsights.flatMap((insight) => insight.recoveryContext.map((ctx) => ctx.metric)),
  );
  const suppressedSleepMetrics = homepage.latest24h.metrics
    .filter((metric) => ['sleep_total', 'sleep_deep', 'sleep_rem'].includes(metric.metric))
    .filter((metric) => !materialRecoveryMetrics.has(metric.metric));

  if (suppressedSleepMetrics.length > 0) {
    lines.push(t(
      locale,
      '## 非显著恢复指标（禁止展开）\n- sleep：当前主事件不需要睡眠背景解释；summary 和 actions 不要提及昨晚睡眠、补觉、提前入睡或今晚睡眠安排',
      '## Non-material Recovery Metrics (Do Not Expand)\n- sleep: current primary event does not require sleep-background explanation; summary and actions must not mention last-night sleep, catching up on sleep, earlier bedtime, or tonight sleep planning',
    ));
  }
}
```

- [ ] **Step 5: Tighten `template.md`**

In `data/sandbox/prompts/homepage/template.md`, replace the paragraph 2 sentence:

```md
24h 恢复状态仅作为事件的交叉验证，用 1-2 句话概括即可（如"从恢复指标看，身体状态还不错"或"但昨晚睡眠偏少，恢复还没跟上"）。
```

with:

```md
24h 恢复状态仅作为事件的交叉验证。只有当上下文的 `事件生理摘要` 中明确出现 `恢复背景: sleep_total`，或 `非显著恢复指标` 没有禁止 sleep 时，才允许提及昨晚睡眠；否则不得写昨晚睡眠、补觉、提前入睡、今晚睡眠安排。
```

Replace the data reference rule:

```md
- 睡眠：可以引用时长（"睡了快 8 小时"）、深睡比例
```

with:

```md
- 睡眠：仅在 sleep 已作为 material recovery context 或主事件是睡眠/咖啡因/饮酒/晚间高强度运动时，才可引用睡眠时长、深睡比例或今晚睡眠建议。
```

- [ ] **Step 6: Run tests**

Run:

```bash
pnpm --filter @health-advisor/agent-core test -- src/__tests__/prompts/context-packet-renderer.test.ts src/__tests__/context/homepage-event-insights.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/agent-core/src/prompts/context-packet-renderer.ts data/sandbox/prompts/homepage/template.md packages/agent-core/src/__tests__/prompts/context-packet-renderer.test.ts
git commit -m "feat(prompt): suppress non-material homepage sleep context"
```

---

## Module D: Eval Guardrails

### Task 5: Add a 13:00 Walk Eval That Fails on Sleep Leakage

**Dependencies:** Task 4.

**Context:** 当前 eval 对“睡眠不该出现”没有专项检查，已有 workout case 甚至把“睡眠”列为通过条件。需要新增一个 H-031 case，确保中午步行 brief 不提昨晚睡眠和今晚睡眠建议。

**Files:**
- Modify: `packages/agent-core/src/evals/types.ts`
- Modify: `packages/agent-core/src/evals/case-schema.ts`
- Modify: `packages/agent-core/src/evals/scorers/task-scorer.ts`
- Create: `packages/agent-core/evals/cases/core/homepage/homepage-midday-walk-no-sleep-context.json`
- Modify: `packages/agent-core/evals/cases/core/homepage/homepage-post-workout-recovery.json`

- [ ] **Step 1: Add scorer support if missing**

In `packages/agent-core/src/evals/types.ts`, extend homepage task-specific expectations:

```ts
forbidSummaryPatterns?: string[];
forbidActionPatterns?: string[];
```

In `packages/agent-core/src/evals/case-schema.ts`, add matching optional arrays:

```ts
forbidSummaryPatterns: z.array(z.string()).optional(),
forbidActionPatterns: z.array(z.string()).optional(),
```

In `packages/agent-core/src/evals/scorers/task-scorer.ts`, add checks inside homepage scoring:

```ts
for (const pattern of homepage.forbidSummaryPatterns ?? []) {
  const regex = new RegExp(pattern, 'i');
  checks.push({
    name: `homepage.forbidSummaryPatterns:${pattern}`,
    passed: !regex.test(summary),
    message: regex.test(summary)
      ? `summary matched forbidden pattern: ${pattern}`
      : `summary did not match forbidden pattern: ${pattern}`,
  });
}

const actionText = actions.map((action) => `${action.title}\n${action.description}\n${action.aiPromise}`).join('\n');
for (const pattern of homepage.forbidActionPatterns ?? []) {
  const regex = new RegExp(pattern, 'i');
  checks.push({
    name: `homepage.forbidActionPatterns:${pattern}`,
    passed: !regex.test(actionText),
    message: regex.test(actionText)
      ? `actions matched forbidden pattern: ${pattern}`
      : `actions did not match forbidden pattern: ${pattern}`,
  });
}
```

- [ ] **Step 2: Create the regression eval case**

Create `packages/agent-core/evals/cases/core/homepage/homepage-midday-walk-no-sleep-context.json`:

```json
{
  "id": "H-031",
  "title": "首页摘要 - 13点步行不展开昨晚睡眠",
  "suite": "core",
  "category": "homepage",
  "priority": "P0",
  "tags": ["homepage", "event-insights", "walk", "sleep-suppression", "midday"],
  "setup": {
    "profileId": "profile-a",
    "timeline": {
      "appendSegments": [
        { "segmentType": "meal_intake", "offsetMinutes": 0, "durationMinutes": 20, "advanceClock": true },
        { "segmentType": "prolonged_sedentary", "offsetMinutes": 0, "durationMinutes": 240, "advanceClock": true },
        { "segmentType": "walk", "offsetMinutes": 0, "durationMinutes": 30, "advanceClock": true }
      ]
    },
    "modelFixture": {
      "mode": "fake-json",
      "content": "{\"source\":\"llm\",\"statusColor\":\"good\",\"summary\":\"林巅峰，刚刚这 30 min 步行把上午久坐后的身体重新带动起来了。\\n\\n这次步行里心率峰值达到 107 bpm，均值约 100 bpm，说明循环系统被温和激活，同时它也刚好接在较长的静止工作之后，能帮助身体从低活动状态切回更顺畅的血液循环和肌肉活动。现在重点是让运动后的心率自然回落，不需要把整天的恢复背景展开成主线。\\n\\n接下来先小口补水，走慢一点冷身 5-10 min，再回到坐姿工作。你想先记录这次恢复，还是安排一个轻量收尾？\",\"chartTokens\":[\"ACTIVITY_7DAYS\"],\"actionsSectionTitle\":\"现在可以这样收尾\",\"microTips\":[],\"actions\":[{\"id\":\"a1\",\"emoji\":\"💧\",\"title\":\"小口补水\",\"description\":\"先小口补水并慢走几分钟，帮助心率平稳回落\",\"aiPromise\":\"我会记录你的选择并用于本次建议上下文\"},{\"id\":\"a2\",\"emoji\":\"🚶\",\"title\":\"轻量冷身\",\"description\":\"用 5-10 min 低速走动完成冷身，再回到工作节奏\",\"aiPromise\":\"我会记录你的选择并用于本次建议上下文\"}]}"
    },
    "referenceDate": "2026-06-01"
  },
  "request": {
    "requestId": "core-h031",
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
        ["步行", "走"],
        ["心率", "循环", "冷身"]
      ],
      "forbiddenPatterns": [
        "昨晚.*睡",
        "睡了",
        "睡眠偏少",
        "恢复底子",
        "今晚.*睡",
        "提前.*(休息|入睡|睡觉)",
        "调暗灯光",
        "深睡"
      ]
    },
    "status": {
      "allowedStatusColors": ["good", "warning"]
    },
    "actions": {
      "minCount": 2,
      "maxCount": 3,
      "requireAiPromise": true,
      "forbiddenPatterns": [
        "睡眠",
        "今晚",
        "入睡",
        "深睡",
        "调暗",
        "提前.*休息"
      ]
    },
    "taskSpecific": {
      "homepage": {
        "requireRecentEventFirst": true,
        "recentEventPatterns": ["步行", "走"],
        "requireEventWindowFacts": true,
        "eventWindowValuePatterns": ["107\\s*bpm", "100\\s*bpm", "心率.*(峰值|均值)"],
        "forbidSummaryPatterns": [
          "昨晚.*睡",
          "睡了",
          "睡眠偏少",
          "今晚.*睡",
          "调暗灯光",
          "深睡"
        ],
        "forbidActionPatterns": [
          "睡眠",
          "今晚",
          "入睡",
          "深睡",
          "调暗"
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

- [ ] **Step 3: Adjust workout recovery eval so it does not require sleep for every workout**

In `packages/agent-core/evals/cases/core/homepage/homepage-post-workout-recovery.json`, change:

```json
[
  "恢复",
  "补水",
  "睡眠"
]
```

to:

```json
[
  "恢复",
  "补水",
  "冷身"
]
```

Also change the fixture action title from `保护今晚睡眠` to `轻量冷身` unless the case clock is explicitly evening. The expected action should remain about product-supported recording, not an unsupported reminder.

- [ ] **Step 4: Run schema and scorer tests**

Run:

```bash
pnpm --filter @health-advisor/agent-core test -- src/__tests__/evals/case-schema.test.ts src/__tests__/evals/scorers.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run the new eval case**

Run:

```bash
pnpm --filter @health-advisor/agent-core eval -- --case packages/agent-core/evals/cases/core/homepage/homepage-midday-walk-no-sleep-context.json
```

Expected: PASS for the fixture and FAIL if summary/action contains the forbidden sleep patterns.

- [ ] **Step 6: Commit**

```bash
git add packages/agent-core/src/evals/types.ts packages/agent-core/src/evals/case-schema.ts packages/agent-core/src/evals/scorers/task-scorer.ts packages/agent-core/evals/cases/core/homepage/homepage-midday-walk-no-sleep-context.json packages/agent-core/evals/cases/core/homepage/homepage-post-workout-recovery.json
git commit -m "test(eval): prevent midday homepage sleep leakage"
```

---

## Module E: End-to-End Validation

### Task 6: Validate the 13:00 Timeline Scenario

**Dependencies:** Tasks 1-5.

**Context:** Unit tests prove context behavior, but the user-facing failure happens through Timeline Control and real homepage generation. This task verifies that the generated prompt no longer contains actionable sleep context and that the model output stays centered on the walk event.

**Files:**
- No code changes expected.
- Optional docs update only if runbook commands differ from current repo scripts.

- [ ] **Step 1: Run targeted tests**

Run:

```bash
pnpm --filter @health-advisor/agent-core test -- src/__tests__/context/homepage-recovery-relevance.test.ts src/__tests__/context/homepage-event-insights.test.ts src/__tests__/prompts/context-packet-renderer.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run eval case**

Run:

```bash
pnpm --filter @health-advisor/agent-core eval -- --case packages/agent-core/evals/cases/core/homepage/homepage-midday-walk-no-sleep-context.json
```

Expected: PASS.

- [ ] **Step 3: Run homepage eval subset**

Run:

```bash
pnpm --filter @health-advisor/agent-core eval -- --suite core --category homepage
```

Expected:

- Existing homepage cases pass.
- H-031 passes.
- Any evening caffeine/alcohol/sleep-related cases may still mention sleep when the new policy marks it material.

- [ ] **Step 4: Manually reproduce in Timeline Control**

Manual sequence:

```text
1. Reset profile-a.
2. Advance / append events until current mock time is 2026-06-01T13:00.
3. Ensure the last event is walk and total recognized event count is at least 5.
4. Request homepage realtime brief.
```

Expected output characteristics:

- Paragraph 1 starts with `林巅峰，` and immediately mentions the just-finished walk.
- Paragraph 2 cites walk event-window facts such as `107 bpm` peak and `100 bpm` average when those values are present in event-window context.
- It may mention the walk interrupted a long sedentary block if that event is in the last 1-2 event insights.
- It does not mention `昨晚睡眠`、`睡了 7 个半小时`、`睡眠偏少`、`恢复底子`、`今晚睡眠`、`提前休息`、`调暗灯光`、`深睡窗口`.
- Actions focus on post-walk recovery: hydration, cooldown, light movement, returning to work rhythm.

- [ ] **Step 5: Inspect rendered prompt if output regresses**

If manual output still mentions sleep, dump the rendered context for the same request and verify these absence conditions:

```text
latest24h_sleep_total_2026-06-01 must not appear.
sleep_total must not appear in eventInsights.recoveryContext.
Recommended focus must not include sleep_protection for walk at 13:00.
Non-material Recovery Metrics must include the sleep suppression instruction.
```

If any condition fails, return to the task that owns that layer:

- `sleep_total` in recoveryContext: Task 2.
- `sleep_protection` in recommended focus: Task 3.
- sleep evidence in rendered prompt: Task 4.
- eval passes despite bad output: Task 5.

- [ ] **Step 6: Commit validation-only updates if any**

If this task only runs tests, do not create an empty commit. If a runbook or fixture correction is needed:

```bash
git add docs/test/smoke-runbook.md
git commit -m "docs(test): document homepage midday walk validation"
```

---

## Acceptance Criteria

- At 13:00, a `walk` / low-to-moderate `cardio_workout` homepage brief does not mention last-night sleep unless sleep is `critical` or the primary event is sleep/caffeine/alcohol/sleep-prep related.
- `HomepageEventInsight.recoveryContext` does not include `sleep_total` for the 13:00 walk case.
- `HomepageEventInsight.evidenceIds` for the 13:00 walk case does not include sleep evidence ids.
- Rendered homepage prompt in event mode does not expose suppressed sleep evidence facts.
- Rendered homepage prompt includes a clear non-material recovery metric constraint when sleep exists in daily records but is not relevant to the current event.
- `recommendedFocus` for 13:00 walk does not include `sleep_protection`.
- `recommendedFocus` may include `sleep_protection` for evening high-intensity workouts or sleep-risk events.
- The new H-031 eval fails if summary or actions mention `昨晚睡眠`、`今晚睡眠`、`提前入睡`、`调暗灯光`、`深睡`.
- No output post-processing, string deletion, or fallback summary rewrite is introduced.

## Implementation Notes

- Do not remove sleep from the raw daily record data model. The fix belongs to homepage context selection.
- Do not globally ban sleep in homepage. Sleep remains valid for sleep-related events, caffeine/alcohol sleep-risk events, evening high-intensity recovery, and critical sleep safety boundaries.
- Do not rely on prompt wording alone. The LLM should not receive high-salience sleep evidence for the 13:00 walk case.
- Keep existing user worktree changes intact. The current workspace may contain unrelated uncommitted knowledge and sandbox edits.
