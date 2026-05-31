# Homepage Event-Level Realtime Brief Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让首页实时简报真正围绕最近 1-2 次事件的事件窗口生理数据生成，而不是继续围绕整日 `latest24h`、个人参考水平和一周趋势生成。

**Architecture:** 保留现有 `executeAgent()`、`TaskContextPacket`、`AgentResponseEnvelope` 协议。新增事件窗口摘要层：从已同步 `DeviceEvent` 原始样本中按 `sourceSegmentId` 或事件时间窗计算 HR/HRV/SpO2/motion/steps/stress 的事件级摘要，再由 `homepage-event-insights.ts` 使用这些事件级摘要生成 LLM 的主输入。`latest24h` 与 `trend7d` 只作为恢复背景，不能继续被用作事件本身的生理特征来源。

**Tech Stack:** TypeScript, pnpm, Vitest, Zod, existing `@health-advisor/shared`, `@health-advisor/sandbox`, `@health-advisor/agent-core`, `@health-advisor/agent-api`.

---

## 背景与根因

当前 `638d643..HEAD` 的变更已经限制 `recentEvents` 数量，并加入 `eventInsights`，但实现仍没有满足 `docs/profile-case-sample.xlsx` 的实时简报要求。

样例期望的实时简报形态是事件窗口分析：

- 专注工作：围绕 `10:00-12:00` 的心率、HRV 和久坐负荷解释。
- 工作久坐：围绕 `13:00-16:00` 的 HRV 下探、心率抬升和静止状态解释。
- HIIT 训练：围绕 `17:30-18:30` 的心率峰值、平均心率、运动后当前心率、HRV 下探解释。
- 晚餐饮酒：围绕 `19:00-21:00` 的心率滞留、HRV 受限、温度/代谢负荷解释。

当前根因：

1. `packages/agent-core/src/context/homepage-event-insights.ts` 只使用 `homepage.latest24h.metrics` 构造每个事件的 `physiology`，没有读取事件窗口内的 `DeviceEvent` 样本。
2. `packages/agent-core/src/context/context-packet-builder.ts` 把 `RecognizedEvent.evidence` 中的事件局部证据丢掉了，普通事件只保留 `"recognized event from timeline sync"`。
3. `apps/agent-api/src/runtime/registry.ts` 在当前日有 synced events 时仍用 `dailyBaseline` 覆盖 HRV、SpO2、steps 等聚合值，导致实时变化被写回为 profile 默认日基线。
4. `packages/agent-core/src/prompts/context-packet-renderer.ts` 在有事件时仍输出所有 normal 24h 指标和 7d 趋势，LLM 输入中整日状态权重过高。
5. eval scorer 只检查“summary 前 40 字符有事件词”和“事件词 + 指标词”，没有检查事件窗口数字是否来自 `eventInsights`。

---

## Module Topology

```text
Module A: Context Surface
  Task 1
  No dependency. Must complete before B/C/D.

Module B: Event Window Aggregation
  Task 2 depends on Task 1
  Task 3 depends on Task 2

Module C: Event Insight Rewrite
  Task 4 depends on Task 2 and Task 3

Module D: Prompt Rendering Contract
  Task 5 depends on Task 4

Module E: Runtime Current-Day Aggregation
  Task 6 can run after Task 1; independent from Task 4/5.

Module F: Eval and Verification
  Task 7 depends on Tasks 4, 5, 6
  Task 8 depends on all previous tasks
```

Parallelization guidance:

- Task 1 and Task 6 can be implemented by different engineers, but Task 6 tests may need the final context shape after Task 1.
- Task 2 and Task 3 should stay together because the type contract and aggregation implementation change together.
- Task 4 must not start until Task 2 exposes event window metrics.
- Task 5 must not start until Task 4 renders meaningful event insights.
- Task 7 is the integration gate for evals and must wait for Task 4/5/6.

## File Responsibility Map

| File | Responsibility |
| --- | --- |
| `packages/shared/src/types/sandbox.ts` | Existing `DeviceEvent`, `RecognizedEvent` source types. Do not add agent-specific homepage types here. |
| `packages/agent-core/src/types/agent-context.ts` | Add synced device samples to `TimelineSyncContext`. |
| `packages/agent-core/src/context/context-packet.ts` | Add event window summary types and attach them to `RecentEventPacket` / `HomepageEventInsight`. |
| `packages/agent-core/src/context/homepage-event-window.ts` | New pure deterministic builder that aggregates event-window samples into metrics. |
| `packages/agent-core/src/context/homepage-event-insights.ts` | Use event-window metrics as event physiology source; `latest24h` only recovery background. |
| `packages/agent-core/src/context/context-packet-builder.ts` | Preserve recognized event IDs/evidence/sourceSegmentId and pass synced samples into event window builder. |
| `packages/agent-core/src/prompts/context-packet-renderer.ts` | Render event-window metrics as primary input and suppress expanded 24h/trend blocks when events exist. |
| `apps/agent-api/src/runtime/registry.ts` | Stop overwriting observed current-day aggregate values with `dailyBaseline`. |
| `packages/agent-core/src/evals/scorers/task-scorer.ts` | Add deterministic checks for event-window values appearing before broad daily-status analysis. |
| `packages/agent-core/evals/cases/core/homepage/*.json` | Update homepage event cases to require event-window numbers and prohibit broad daily-status-first summaries. |

---

## Module A: Context Surface

### Task 1: Expose Synced Device Samples to Agent Context

**Dependencies:** None.

**Context:** `agent-api` already has synced device samples through `overrideStore.getSyncedEvents(profileId)`. `agent-core` currently only receives recognized events, derived states, and sync metadata. Event-level summaries need the original samples.

**Files:**
- Modify: `packages/agent-core/src/types/agent-context.ts`
- Modify: `apps/agent-api/src/runtime/registry.ts`
- Test: `packages/agent-core/src/__tests__/context/context-builder.test.ts`
- Test: `apps/agent-api/src/__tests__/runtime/registry.test.ts`

- [ ] **Step 1: Add failing context-builder test**

Append this test to `packages/agent-core/src/__tests__/context/context-builder.test.ts`. Reuse existing `makeRequest()` and `makeDeps()` helpers in that file. If helper names differ, keep the assertions and shape unchanged.

```ts
it('carries synced device samples in timelineSync context', () => {
  const deps = makeDeps();
  const syncedEvents = [
    {
      eventId: 'evt-focus-hr-1',
      profileId: 'profile-a',
      measuredAt: '2026-04-10T10:00',
      metric: 'heartRate',
      value: 72,
      source: 'sensor',
      segmentId: 'seg-focus-1',
    },
    {
      eventId: 'evt-focus-hrv-1',
      profileId: 'profile-a',
      measuredAt: '2026-04-10T10:05',
      metric: 'hrvRmssd',
      value: 55,
      source: 'sensor',
      segmentId: 'seg-focus-1',
    },
  ] as const;

  deps.getTimelineSync = () => ({
    recognizedEvents: [{
      recognizedEventId: 're-focus-1',
      profileId: 'profile-a',
      type: 'deep_focus',
      start: '2026-04-10T10:00',
      end: '2026-04-10T12:00',
      confidence: 0.91,
      evidence: ['平均心率 72, 低运动, 深度专注'],
      sourceSegmentId: 'seg-focus-1',
    }],
    derivedTemporalStates: [],
    syncedEvents: [...syncedEvents],
    syncMetadata: {
      lastSyncedMeasuredAt: '2026-04-10T12:00',
      pendingEventCount: 0,
    },
  });

  const ctx = buildAgentContext(makeRequest(), deps, '2026-04-10');

  expect(ctx.timelineSync?.syncedEvents).toHaveLength(2);
  expect(ctx.timelineSync?.syncedEvents?.[0]?.metric).toBe('heartRate');
  expect(ctx.timelineSync?.recognizedEvents[0]?.sourceSegmentId).toBe('seg-focus-1');
});
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
pnpm --filter @health-advisor/agent-core test -- src/__tests__/context/context-builder.test.ts
```

Expected: FAIL because `TimelineSyncContext` does not have `syncedEvents`.

- [ ] **Step 3: Extend `TimelineSyncContext`**

In `packages/agent-core/src/types/agent-context.ts`, update imports and interface:

```ts
import type {
  AgentTaskType,
  DataTab,
  Timeframe,
  PageContext,
  RecognizedEvent,
  DerivedTemporalState,
  DeviceEvent,
  Locale,
} from '@health-advisor/shared';

export interface TimelineSyncContext {
  /** 已识别的活动事件 */
  recognizedEvents: RecognizedEvent[];
  /** 已同步的原始设备事件样本，用于事件窗口级生理摘要 */
  syncedEvents: DeviceEvent[];
  /** 派生临时状态（如 recent_meal_30m） */
  derivedTemporalStates: DerivedTemporalState[];
  /** 同步元数据 */
  syncMetadata: {
    lastSyncedMeasuredAt: string | null;
    pendingEventCount: number;
  };
}
```

- [ ] **Step 4: Populate synced samples in registry**

In `apps/agent-api/src/runtime/registry.ts`, update `getTimelineSync()` return object:

```ts
return {
  recognizedEvents,
  syncedEvents,
  derivedTemporalStates,
  syncMetadata: {
    lastSyncedMeasuredAt: syncState.lastSyncedMeasuredAt,
    pendingEventCount: pendingEvents.length,
  },
};
```

- [ ] **Step 5: Add registry integration test**

Append this test to `apps/agent-api/src/__tests__/runtime/registry.test.ts`:

```ts
it('getTimelineSync exposes synced device samples after manual sync', () => {
  try {
    registry.overrideStore.performSync('profile-a', 'manual_refresh');

    const timelineSync = registry.getTimelineSync?.('profile-a');

    expect(timelineSync).toBeDefined();
    expect(timelineSync?.syncedEvents.length).toBeGreaterThan(0);
    expect(timelineSync?.syncedEvents.some((event) => event.metric === 'heartRate')).toBe(true);
  } finally {
    registry.overrideStore.reset('all');
  }
});
```

- [ ] **Step 6: Run tests**

Run:

```bash
pnpm --filter @health-advisor/agent-core test -- src/__tests__/context/context-builder.test.ts
pnpm --filter @health-advisor/agent-api test -- src/__tests__/runtime/registry.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/agent-core/src/types/agent-context.ts packages/agent-core/src/__tests__/context/context-builder.test.ts apps/agent-api/src/runtime/registry.ts apps/agent-api/src/__tests__/runtime/registry.test.ts
git commit -m "feat(context): expose synced samples for realtime briefs"
```

---

## Module B: Event Window Aggregation

### Task 2: Add Event Window Summary Types

**Dependencies:** Task 1.

**Context:** Event insight types currently describe `physiology` as generic metric snippets, but they do not say whether a number came from the event window or from all-day data. Add explicit event-window types so later code cannot accidentally pass `latest24h` values as event physiology.

**Files:**
- Modify: `packages/agent-core/src/context/context-packet.ts`

- [ ] **Step 1: Add event window types**

In `packages/agent-core/src/context/context-packet.ts`, add these types near the Homepage section before `EventPhysiologySummary`:

```ts
export type HomepageEventWindowMetricName =
  | 'heart_rate'
  | 'hrv_rmssd'
  | 'spo2'
  | 'motion'
  | 'steps'
  | 'stress_load';

export type HomepageEventWindowCoverage = 'complete' | 'partial' | 'missing';

export interface HomepageEventWindowMetric {
  metric: HomepageEventWindowMetricName;
  unit: string;
  sampleCount: number;
  startValue?: number;
  endValue?: number;
  latest?: number;
  min?: number;
  max?: number;
  average?: number;
  delta?: number;
  qualifier: 'low' | 'normal' | 'elevated' | 'compressed' | 'volatile' | 'recovering' | 'missing';
  interpretation: string;
  evidenceId: string;
}

export interface HomepageEventWindowSummary {
  source: 'synced_device_samples';
  coverage: HomepageEventWindowCoverage;
  recognizedEventId: string;
  sourceSegmentId?: string;
  start: string;
  end: string;
  durationMin: number;
  sampleCount: number;
  metrics: HomepageEventWindowMetric[];
  evidenceIds: string[];
}
```

Then extend existing interfaces:

```ts
export interface RecentEventPacket {
  recognizedEventId?: string;
  type: string;
  start: string;
  end: string;
  durationMin: number;
  confidence: number;
  sourceSegmentId?: string;
  recognitionEvidence: string[];
  eventWindow?: HomepageEventWindowSummary;
  syncState: {
    lastSyncedMeasuredAt: string | null;
    pendingEventCount: number;
    fromSyncedWindow: boolean;
  };
  evidenceIds: string[];
}

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

- [ ] **Step 2: Fix compile errors from required `recognitionEvidence`**

Update all test `RecentEventPacket` literals that fail compilation by adding:

```ts
recognitionEvidence: [],
```

For synced test events that already know the source segment, add:

```ts
recognizedEventId: 're-focus-1',
sourceSegmentId: 'seg-focus-1',
recognitionEvidence: ['平均心率 72, 低运动, 深度专注'],
```

- [ ] **Step 3: Run typecheck**

Run:

```bash
pnpm --filter @health-advisor/agent-core typecheck
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/agent-core/src/context/context-packet.ts packages/agent-core/src/__tests__
git commit -m "feat(context): define homepage event window summaries"
```

### Task 3: Build Deterministic Event Window Aggregator

**Dependencies:** Task 2.

**Context:** This is the central fix. The aggregator must compute event-local facts from `DeviceEvent` samples. It must not use `latest24h` as a fallback for event physiology. If samples are missing, it should return `coverage: "missing"` and no fabricated metrics.

**Files:**
- Create: `packages/agent-core/src/context/homepage-event-window.ts`
- Test: `packages/agent-core/src/__tests__/context/homepage-event-window.test.ts`
- Modify: `packages/agent-core/src/index.ts`

- [ ] **Step 1: Add failing tests**

Create `packages/agent-core/src/__tests__/context/homepage-event-window.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { DeviceEvent, RecognizedEvent } from '@health-advisor/shared';
import { buildHomepageEventWindowSummary } from '../../context/homepage-event-window';

function event(overrides: Partial<RecognizedEvent> = {}): RecognizedEvent {
  return {
    recognizedEventId: 're-hiit-1',
    profileId: 'profile-a',
    type: 'intermittent_exercise',
    start: '2026-05-31T17:30',
    end: '2026-05-31T18:30',
    confidence: 0.92,
    evidence: ['心率标准差 35, 交替高低强度'],
    sourceSegmentId: 'seg-hiit-1',
    ...overrides,
  };
}

function sample(
  measuredAt: string,
  metric: DeviceEvent['metric'],
  value: DeviceEvent['value'],
  segmentId = 'seg-hiit-1',
): DeviceEvent {
  return {
    eventId: `evt-${metric}-${measuredAt}`,
    profileId: 'profile-a',
    measuredAt,
    metric,
    value,
    source: 'sensor',
    segmentId,
  };
}

describe('buildHomepageEventWindowSummary', () => {
  it('aggregates workout heart-rate peak, average, latest and RMSSD from source segment samples', () => {
    const result = buildHomepageEventWindowSummary({
      event: event(),
      syncedEvents: [
        sample('2026-05-31T17:30', 'heartRate', 118),
        sample('2026-05-31T17:45', 'heartRate', 172),
        sample('2026-05-31T18:15', 'heartRate', 155),
        sample('2026-05-31T18:30', 'heartRate', 92),
        sample('2026-05-31T17:35', 'hrvRmssd', 48),
        sample('2026-05-31T18:30', 'hrvRmssd', 35),
        sample('2026-05-31T18:30', 'spo2', 99),
        sample('2026-05-31T18:30', 'steps', 4200),
        sample('2026-05-31T18:30', 'motion', 8.5),
      ],
      baselines: { restingHR: 48, hrv: 93, spo2: 99, avgSleepMinutes: 600, avgSteps: 5900 },
    });

    expect(result.coverage).toBe('complete');
    expect(result.sampleCount).toBe(9);

    const hr = result.metrics.find((metric) => metric.metric === 'heart_rate');
    expect(hr?.max).toBe(172);
    expect(hr?.average).toBe(134);
    expect(hr?.latest).toBe(92);
    expect(hr?.qualifier).toBe('elevated');
    expect(hr?.interpretation).toContain('峰值 172bpm');

    const hrv = result.metrics.find((metric) => metric.metric === 'hrv_rmssd');
    expect(hrv?.latest).toBe(35);
    expect(hrv?.delta).toBe(-13);
    expect(hrv?.qualifier).toBe('compressed');

    const steps = result.metrics.find((metric) => metric.metric === 'steps');
    expect(steps?.max).toBe(4200);
  });

  it('uses time-window filtering when sourceSegmentId is missing', () => {
    const result = buildHomepageEventWindowSummary({
      event: event({ sourceSegmentId: undefined }),
      syncedEvents: [
        sample('2026-05-31T17:29', 'heartRate', 80, 'other'),
        sample('2026-05-31T17:31', 'heartRate', 120, 'other'),
        sample('2026-05-31T18:29', 'heartRate', 150, 'other'),
        sample('2026-05-31T18:31', 'heartRate', 75, 'other'),
      ],
      baselines: { restingHR: 48, hrv: 93, spo2: 99, avgSleepMinutes: 600, avgSteps: 5900 },
    });

    const hr = result.metrics.find((metric) => metric.metric === 'heart_rate');
    expect(result.sampleCount).toBe(2);
    expect(hr?.min).toBe(120);
    expect(hr?.max).toBe(150);
  });

  it('does not fabricate metrics when no synced samples match the event', () => {
    const result = buildHomepageEventWindowSummary({
      event: event(),
      syncedEvents: [],
      baselines: { restingHR: 48, hrv: 93, spo2: 99, avgSleepMinutes: 600, avgSteps: 5900 },
    });

    expect(result.coverage).toBe('missing');
    expect(result.metrics).toEqual([]);
    expect(result.evidenceIds).toEqual([]);
  });
});
```

- [ ] **Step 2: Run failing test**

Run:

```bash
pnpm --filter @health-advisor/agent-core test -- src/__tests__/context/homepage-event-window.test.ts
```

Expected: FAIL because `homepage-event-window.ts` does not exist.

- [ ] **Step 3: Add implementation**

Create `packages/agent-core/src/context/homepage-event-window.ts`:

```ts
import type { DeviceEvent, RecognizedEvent } from '@health-advisor/shared';
import type {
  HomepageEventWindowMetric,
  HomepageEventWindowMetricName,
  HomepageEventWindowSummary,
  UserContextPacket,
} from './context-packet';

export interface BuildHomepageEventWindowSummaryInput {
  event: RecognizedEvent;
  syncedEvents: DeviceEvent[];
  baselines: UserContextPacket['baselines'];
}

const METRIC_MAP: Record<DeviceEvent['metric'], HomepageEventWindowMetricName | undefined> = {
  heartRate: 'heart_rate',
  hrvRmssd: 'hrv_rmssd',
  spo2: 'spo2',
  motion: 'motion',
  steps: 'steps',
  stressLoad: 'stress_load',
  sleepStage: undefined,
  wearState: undefined,
};

const UNIT_MAP: Record<HomepageEventWindowMetricName, string> = {
  heart_rate: 'bpm',
  hrv_rmssd: 'ms',
  spo2: '%',
  motion: 'score',
  steps: 'steps',
  stress_load: 'score',
};

export function buildHomepageEventWindowSummary(
  input: BuildHomepageEventWindowSummaryInput,
): HomepageEventWindowSummary {
  const { event, syncedEvents, baselines } = input;
  const samples = selectEventSamples(event, syncedEvents);
  const metrics = buildMetrics(event, samples, baselines);
  const evidenceIds = metrics.map((metric) => metric.evidenceId);

  return {
    source: 'synced_device_samples',
    coverage: samples.length === 0 ? 'missing' : metrics.length >= 2 ? 'complete' : 'partial',
    recognizedEventId: event.recognizedEventId,
    sourceSegmentId: event.sourceSegmentId,
    start: event.start,
    end: event.end,
    durationMin: diffMinutes(event.start, event.end),
    sampleCount: samples.length,
    metrics,
    evidenceIds,
  };
}

function selectEventSamples(event: RecognizedEvent, syncedEvents: DeviceEvent[]): DeviceEvent[] {
  const sameProfile = syncedEvents.filter((sample) => sample.profileId === event.profileId);
  const selected = event.sourceSegmentId
    ? sameProfile.filter((sample) => sample.segmentId === event.sourceSegmentId)
    : sameProfile.filter((sample) => sample.measuredAt >= event.start && sample.measuredAt <= event.end);

  return selected
    .filter((sample) => METRIC_MAP[sample.metric] !== undefined && typeof sample.value === 'number')
    .sort((a, b) => a.measuredAt.localeCompare(b.measuredAt));
}

function buildMetrics(
  event: RecognizedEvent,
  samples: DeviceEvent[],
  baselines: UserContextPacket['baselines'],
): HomepageEventWindowMetric[] {
  const metrics: HomepageEventWindowMetric[] = [];
  for (const metric of ['heart_rate', 'hrv_rmssd', 'spo2', 'motion', 'steps', 'stress_load'] as const) {
    const values = samples
      .filter((sample) => METRIC_MAP[sample.metric] === metric)
      .map((sample) => sample.value)
      .filter((value): value is number => typeof value === 'number');

    if (values.length === 0) continue;

    metrics.push(summarizeMetric(event, metric, values, baselines));
  }
  return metrics;
}

function summarizeMetric(
  event: RecognizedEvent,
  metric: HomepageEventWindowMetricName,
  values: number[],
  baselines: UserContextPacket['baselines'],
): HomepageEventWindowMetric {
  const startValue = values[0]!;
  const endValue = values[values.length - 1]!;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const averageValue = average(values);
  const averageRounded = metric === 'motion' ? round1(averageValue) : Math.round(averageValue);
  const delta = round1(endValue - startValue);
  const evidenceId = `event_window_${event.recognizedEventId}_${metric}`;

  return {
    metric,
    unit: UNIT_MAP[metric],
    sampleCount: values.length,
    startValue,
    endValue,
    latest: endValue,
    min,
    max,
    average: averageRounded,
    delta,
    qualifier: qualifyMetric(metric, { min, max, average: averageValue, latest: endValue, delta }, baselines),
    interpretation: interpretMetric(metric, { min, max, average: averageRounded, latest: endValue, delta }, baselines),
    evidenceId,
  };
}

function qualifyMetric(
  metric: HomepageEventWindowMetricName,
  values: { min: number; max: number; average: number; latest: number; delta: number },
  baselines: UserContextPacket['baselines'],
): HomepageEventWindowMetric['qualifier'] {
  switch (metric) {
    case 'heart_rate':
      return values.max >= baselines.restingHR + 35 || values.latest >= baselines.restingHR + 20 ? 'elevated' : 'normal';
    case 'hrv_rmssd':
      return values.latest <= baselines.hrv * 0.75 || values.delta < -8 ? 'compressed' : values.delta > 8 ? 'recovering' : 'normal';
    case 'spo2':
      return values.min < 95 ? 'low' : 'normal';
    case 'motion':
      return values.average >= 5 ? 'elevated' : 'normal';
    case 'steps':
      return values.max > 0 ? 'elevated' : 'normal';
    case 'stress_load':
      return values.max >= 60 ? 'elevated' : 'normal';
  }
}

function interpretMetric(
  metric: HomepageEventWindowMetricName,
  values: { min: number; max: number; average: number; latest: number; delta: number },
  baselines: UserContextPacket['baselines'],
): string {
  switch (metric) {
    case 'heart_rate':
      return `事件窗口心率峰值 ${values.max}bpm，均值 ${values.average}bpm，末段 ${values.latest}bpm，相对静息心率 ${baselines.restingHR}bpm 显示当前事件负荷`;
    case 'hrv_rmssd':
      return `事件窗口 RMSSD 从起点到末段变化 ${formatSigned(values.delta)}ms，末段 ${values.latest}ms，用于判断自主神经是否仍被压缩`;
    case 'spo2':
      return `事件窗口血氧最低 ${values.min}%，末段 ${values.latest}%，用于判断呼吸状态是否稳定`;
    case 'motion':
      return `事件窗口运动强度均值 ${values.average}，峰值 ${values.max}，用于区分静止、轻活动和训练负荷`;
    case 'steps':
      return `事件窗口累计步数峰值 ${values.max}，用于判断活动量和循环激活程度`;
    case 'stress_load':
      return `事件窗口压力负荷峰值 ${values.max}，末段 ${values.latest}，用于判断交感神经占优程度`;
  }
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function formatSigned(value: number): string {
  return value > 0 ? `+${value}` : `${value}`;
}

function diffMinutes(start: string, end: string): number {
  return Math.round((new Date(`${end}:00`).getTime() - new Date(`${start}:00`).getTime()) / 60000);
}
```

- [ ] **Step 4: Export helper**

In `packages/agent-core/src/index.ts`, add:

```ts
export {
  buildHomepageEventWindowSummary,
} from './context/homepage-event-window';
export type {
  BuildHomepageEventWindowSummaryInput,
} from './context/homepage-event-window';
```

- [ ] **Step 5: Run tests**

Run:

```bash
pnpm --filter @health-advisor/agent-core test -- src/__tests__/context/homepage-event-window.test.ts
pnpm --filter @health-advisor/agent-core typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/agent-core/src/context/homepage-event-window.ts packages/agent-core/src/__tests__/context/homepage-event-window.test.ts packages/agent-core/src/index.ts
git commit -m "feat(context): summarize homepage event windows"
```

---

## Module C: Event Insight Rewrite

### Task 4: Wire Event Windows into Homepage Event Insights

**Dependencies:** Task 2, Task 3.

**Context:** `eventInsights` must use `RecentEventPacket.eventWindow.metrics` for event physiology. `latest24h` remains available only for `recoveryContext` and broad safety checks. Do not substitute `latest24h` values when event-window samples are missing.

**Files:**
- Modify: `packages/agent-core/src/context/context-packet-builder.ts`
- Modify: `packages/agent-core/src/context/homepage-event-insights.ts`
- Test: `packages/agent-core/src/__tests__/context/context-packet-builder.test.ts`
- Test: `packages/agent-core/src/__tests__/context/homepage-event-insights.test.ts`

- [ ] **Step 1: Add failing packet-builder test**

Append to `packages/agent-core/src/__tests__/context/context-packet-builder.test.ts`:

```ts
it('homepage eventInsights use event-window physiology instead of latest24h daily metrics', () => {
  const ctx = makeContext({
    demoNow: '2026-04-10T18:35',
    timelineSync: {
      recognizedEvents: [{
        recognizedEventId: 're-hiit-1',
        profileId: 'profile-a',
        type: 'intermittent_exercise',
        start: '2026-04-10T17:30',
        end: '2026-04-10T18:30',
        confidence: 0.92,
        evidence: ['心率标准差 35, 交替高低强度'],
        sourceSegmentId: 'seg-hiit-1',
      }],
      syncedEvents: [
        { eventId: 'evt-hr-1', profileId: 'profile-a', measuredAt: '2026-04-10T17:30', metric: 'heartRate', value: 118, source: 'sensor', segmentId: 'seg-hiit-1' },
        { eventId: 'evt-hr-2', profileId: 'profile-a', measuredAt: '2026-04-10T17:45', metric: 'heartRate', value: 172, source: 'sensor', segmentId: 'seg-hiit-1' },
        { eventId: 'evt-hr-3', profileId: 'profile-a', measuredAt: '2026-04-10T18:30', metric: 'heartRate', value: 92, source: 'sensor', segmentId: 'seg-hiit-1' },
        { eventId: 'evt-hrv-1', profileId: 'profile-a', measuredAt: '2026-04-10T17:35', metric: 'hrvRmssd', value: 48, source: 'sensor', segmentId: 'seg-hiit-1' },
        { eventId: 'evt-hrv-2', profileId: 'profile-a', measuredAt: '2026-04-10T18:30', metric: 'hrvRmssd', value: 35, source: 'sensor', segmentId: 'seg-hiit-1' },
      ],
      derivedTemporalStates: [],
      syncMetadata: { lastSyncedMeasuredAt: '2026-04-10T18:30', pendingEventCount: 0 },
    },
    dataWindow: {
      start: '2026-04-04',
      end: '2026-04-10',
      records: [
        makeRecord('2026-04-04'),
        makeRecord('2026-04-05'),
        makeRecord('2026-04-06'),
        makeRecord('2026-04-07'),
        makeRecord('2026-04-08'),
        makeRecord('2026-04-09'),
        makeRecord('2026-04-10', { hr: [48, 50], hrv: 93, spo2: 99 }),
      ],
      missingFields: [],
    },
    profile: {
      profileId: 'profile-a',
      name: '巅峰',
      age: 28,
      tags: ['规律健身'],
      baselines: { restingHR: 48, hrv: 93, spo2: 99, avgSleepMinutes: 600, avgSteps: 5900 },
    },
  });

  const packet = buildTaskContextPacket(ctx, emptyRules);
  const insight = packet.homepage?.eventInsights[0];

  expect(insight?.eventWindow?.metrics.find((metric) => metric.metric === 'heart_rate')?.max).toBe(172);
  expect(insight?.physiology.find((item) => item.metric === 'heart_rate')?.value).toBe(172);
  expect(insight?.physiology.find((item) => item.metric === 'hrv')?.value).toBe(35);
  expect(insight?.physiology.map((item) => item.interpretation).join('\n')).not.toContain('HRV 状态稳定，可作为恢复背景参考');
});
```

- [ ] **Step 2: Run failing test**

Run:

```bash
pnpm --filter @health-advisor/agent-core test -- src/__tests__/context/context-packet-builder.test.ts
```

Expected: FAIL because current `physiology` still uses `latest24h`.

- [ ] **Step 3: Preserve recognized event details and attach eventWindow**

In `packages/agent-core/src/context/context-packet-builder.ts`, import the new helper:

```ts
import { buildHomepageEventWindowSummary } from './homepage-event-window';
```

Inside `buildRecentEvents()`, before pushing each synced event, compute:

```ts
const eventWindow = buildHomepageEventWindowSummary({
  event: ev,
  syncedEvents: context.timelineSync.syncedEvents,
  baselines: context.profile.baselines,
});
```

Then update the pushed object:

```ts
events.push({
  recognizedEventId: ev.recognizedEventId,
  type: ev.type,
  start: ev.start,
  end: ev.end,
  durationMin,
  confidence: ev.confidence,
  sourceSegmentId: ev.sourceSegmentId,
  recognitionEvidence: ev.evidence,
  eventWindow,
  syncState: {
    lastSyncedMeasuredAt: context.timelineSync.syncMetadata.lastSyncedMeasuredAt,
    pendingEventCount: context.timelineSync.syncMetadata.pendingEventCount,
    fromSyncedWindow: true,
  },
  evidenceIds: [evidenceId, ...eventWindow.evidenceIds],
});
```

For injected events, set:

```ts
recognitionEvidence: [],
```

and do not create `eventWindow` because injected events are not measured samples.

- [ ] **Step 4: Rewrite event insight physiology**

In `packages/agent-core/src/context/homepage-event-insights.ts`, replace `buildPhysiology(eventType, homepage.latest24h.metrics)` with:

```ts
const physiology = buildEventWindowPhysiology(event.eventWindow);
```

Add this helper:

```ts
function buildEventWindowPhysiology(
  eventWindow: HomepageContextPacket['recentEvents'][number]['eventWindow'],
): EventPhysiologySummary[] {
  if (!eventWindow || eventWindow.coverage === 'missing') return [];

  return eventWindow.metrics.map((metric) => {
    switch (metric.metric) {
      case 'heart_rate':
        return {
          metric: 'heart_rate',
          value: metric.max ?? metric.latest,
          unit: metric.unit,
          qualifier: metric.qualifier === 'elevated' ? 'elevated' : 'normal',
          interpretation: metric.interpretation,
          evidenceId: metric.evidenceId,
        };
      case 'hrv_rmssd':
        return {
          metric: 'hrv',
          value: metric.latest,
          unit: metric.unit,
          qualifier: metric.qualifier === 'compressed' ? 'compressed' : metric.qualifier === 'recovering' ? 'recovering' : 'normal',
          interpretation: metric.interpretation,
          evidenceId: metric.evidenceId,
        };
      case 'spo2':
        return {
          metric: 'spo2',
          value: metric.min ?? metric.latest,
          unit: metric.unit,
          qualifier: metric.qualifier === 'low' ? 'low' : 'normal',
          interpretation: metric.interpretation,
          evidenceId: metric.evidenceId,
        };
      case 'motion':
        return {
          metric: 'motion',
          value: metric.average,
          unit: metric.unit,
          qualifier: metric.qualifier === 'elevated' ? 'elevated' : 'normal',
          interpretation: metric.interpretation,
          evidenceId: metric.evidenceId,
        };
      case 'steps':
        return {
          metric: 'activity',
          value: metric.max,
          unit: metric.unit,
          qualifier: metric.qualifier === 'elevated' ? 'elevated' : 'normal',
          interpretation: metric.interpretation,
          evidenceId: metric.evidenceId,
        };
      case 'stress_load':
        return {
          metric: 'stress',
          value: metric.max ?? metric.latest,
          unit: metric.unit,
          qualifier: metric.qualifier === 'elevated' ? 'elevated' : 'normal',
          interpretation: metric.interpretation,
          evidenceId: metric.evidenceId,
        };
    }
  });
}
```

Update the returned insight object to include:

```ts
eventWindow: event.eventWindow,
evidenceIds: [
  ...event.evidenceIds,
  ...event.eventWindow?.evidenceIds ?? [],
  ...collectMetricEvidenceIds(homepage.latest24h.metrics),
],
```

- [ ] **Step 5: Update tension logic**

Keep critical safety from `latest24h`, but derive event load from event-window metrics first:

```ts
const tension = determineEventBodyTension(eventType, event.eventWindow, homepage.latest24h.metrics, homepage.rulesInsights);
```

Use this logic:

```ts
function determineEventBodyTension(
  eventType: ReturnType<typeof normalizeHomepageEventType>,
  eventWindow: HomepageContextPacket['recentEvents'][number]['eventWindow'],
  metrics: Latest24hMetric[],
  rulesInsights: HomepageContextPacket['rulesInsights'],
): EventBodyTension {
  if (metrics.some((m) => m.status === 'critical') || rulesInsights.some((r) => r.severity === 'critical')) {
    return { level: 'critical', summary: '当前存在需要优先处理的异常信号', reason: 'critical metric or rule insight present' };
  }

  const eventMetrics = eventWindow?.metrics ?? [];
  const hrvCompressed = eventMetrics.some((m) => m.metric === 'hrv_rmssd' && m.qualifier === 'compressed');
  const hrElevated = eventMetrics.some((m) => m.metric === 'heart_rate' && m.qualifier === 'elevated');
  const stressElevated = eventMetrics.some((m) => m.metric === 'stress_load' && m.qualifier === 'elevated');
  const lowMotion = eventMetrics.some((m) => m.metric === 'motion' && (m.average ?? 0) < 1);

  if ((eventType === 'work_focus' || eventType === 'work_sedentary') && (hrvCompressed || hrElevated || stressElevated || lowMotion)) {
    return { level: 'high', summary: '这次工作事件内已经出现神经或静止负荷累积', reason: 'event-window work load markers present' };
  }
  if ((eventType === 'cardio_workout' || eventType === 'hiit_workout') && (hrvCompressed || hrElevated)) {
    return { level: 'watch', summary: '运动事件已经进入恢复窗口，需要降低后续刺激', reason: 'event-window workout recovery markers present' };
  }
  if ((eventType === 'possible_caffeine_intake' || eventType === 'possible_alcohol_intake') && (hrvCompressed || hrElevated || stressElevated)) {
    return { level: 'watch', summary: '摄入相关事件内存在恢复受压信号，需要保护今晚睡眠窗口', reason: 'event-window intake recovery markers present' };
  }

  return { level: 'positive', summary: '事件窗口内没有明显冲突信号', reason: 'event-window markers do not indicate elevated tension' };
}
```

- [ ] **Step 6: Run tests**

Run:

```bash
pnpm --filter @health-advisor/agent-core test -- src/__tests__/context/homepage-event-insights.test.ts src/__tests__/context/context-packet-builder.test.ts
pnpm --filter @health-advisor/agent-core typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/agent-core/src/context/context-packet-builder.ts packages/agent-core/src/context/homepage-event-insights.ts packages/agent-core/src/__tests__/context/context-packet-builder.test.ts packages/agent-core/src/__tests__/context/homepage-event-insights.test.ts
git commit -m "feat(context): base homepage insights on event windows"
```

---

## Module D: Prompt Rendering Contract

### Task 5: Render Event Windows as Primary Input and Compress Daily Context

**Dependencies:** Task 4.

**Context:** Even after event-window insights exist, the renderer must not keep feeding all normal 24h metrics and trend details to the LLM at similar visual weight. The homepage prompt should show event windows first, then only abnormal/missing 24h recovery context.

**Files:**
- Modify: `packages/agent-core/src/prompts/context-packet-renderer.ts`
- Modify: `data/sandbox/prompts/homepage/template.md`
- Test: `packages/agent-core/src/__tests__/prompts/context-packet-renderer.test.ts`
- Test: `packages/agent-core/src/__tests__/prompts/task-builder.test.ts`

- [ ] **Step 1: Add failing renderer test**

Append to `packages/agent-core/src/__tests__/prompts/context-packet-renderer.test.ts`:

```ts
it('with homepage events, renders event-window metrics and suppresses expanded normal daily metrics', () => {
  const packet: TaskContextPacket = {
    task: { type: 'homepage_summary', page: 'home' },
    userContext: {
      profileId: 'profile-a',
      name: '巅峰',
      age: 28,
      tags: ['规律健身'],
      baselines: { restingHR: 48, hrv: 93, spo2: 99, avgSleepMinutes: 600, avgSteps: 5900 },
    },
    dataWindow: { start: '2026-05-25', end: '2026-05-31', recordCount: 7, completenessPct: 100 },
    missingData: [],
    evidence: [],
    visibleCharts: [],
    homepage: {
      recentEvents: [{
        recognizedEventId: 're-hiit-1',
        type: 'intermittent_exercise',
        start: '2026-05-31T17:30',
        end: '2026-05-31T18:30',
        durationMin: 60,
        confidence: 0.92,
        sourceSegmentId: 'seg-hiit-1',
        recognitionEvidence: ['心率标准差 35, 交替高低强度'],
        eventWindow: {
          source: 'synced_device_samples',
          coverage: 'complete',
          recognizedEventId: 're-hiit-1',
          sourceSegmentId: 'seg-hiit-1',
          start: '2026-05-31T17:30',
          end: '2026-05-31T18:30',
          durationMin: 60,
          sampleCount: 5,
          evidenceIds: ['event_window_re-hiit-1_heart_rate'],
          metrics: [{
            metric: 'heart_rate',
            unit: 'bpm',
            sampleCount: 3,
            startValue: 118,
            endValue: 92,
            latest: 92,
            min: 92,
            max: 172,
            average: 134,
            delta: -26,
            qualifier: 'elevated',
            interpretation: '事件窗口心率峰值 172bpm，均值 134bpm，末段 92bpm',
            evidenceId: 'event_window_re-hiit-1_heart_rate',
          }],
        },
        syncState: { lastSyncedMeasuredAt: '2026-05-31T18:30', pendingEventCount: 0, fromSyncedWindow: true },
        evidenceIds: ['event_hiit', 'event_window_re-hiit-1_heart_rate'],
      }],
      eventInsights: [{
        eventId: 'event_hiit',
        eventType: 'hiit_workout',
        priority: 'high',
        timeRelation: '刚结束约 5 min',
        headline: '完成 60 min 训练，身体进入恢复窗口',
        eventWindow: {
          source: 'synced_device_samples',
          coverage: 'complete',
          recognizedEventId: 're-hiit-1',
          sourceSegmentId: 'seg-hiit-1',
          start: '2026-05-31T17:30',
          end: '2026-05-31T18:30',
          durationMin: 60,
          sampleCount: 5,
          evidenceIds: ['event_window_re-hiit-1_heart_rate'],
          metrics: [{
            metric: 'heart_rate',
            unit: 'bpm',
            sampleCount: 3,
            startValue: 118,
            endValue: 92,
            latest: 92,
            min: 92,
            max: 172,
            average: 134,
            delta: -26,
            qualifier: 'elevated',
            interpretation: '事件窗口心率峰值 172bpm，均值 134bpm，末段 92bpm',
            evidenceId: 'event_window_re-hiit-1_heart_rate',
          }],
        },
        physiology: [{ metric: 'heart_rate', value: 172, unit: 'bpm', qualifier: 'elevated', interpretation: '事件窗口心率峰值 172bpm，均值 134bpm，末段 92bpm', evidenceId: 'event_window_re-hiit-1_heart_rate' }],
        recoveryContext: [],
        tension: { level: 'watch', summary: '运动事件已经进入恢复窗口，需要降低后续刺激', reason: 'event-window workout recovery markers present' },
        recommendedFocus: [{ category: 'hydration', action: '小口补水并做轻度走动冷身', durationMin: 10, rationale: '帮助心率平稳回落并支持循环恢复' }],
        actionIntents: [],
        evidenceIds: ['event_hiit', 'event_window_re-hiit-1_heart_rate'],
      }],
      latest24h: {
        date: '2026-05-31',
        metrics: [
          { metric: 'hrv', value: 93, unit: 'ms', baseline: 93, deltaPctVsBaseline: 0, status: 'normal', evidenceId: 'daily_hrv' },
          { metric: 'resting_hr', value: 48, unit: 'bpm', baseline: 48, deltaPctVsBaseline: 0, status: 'normal', evidenceId: 'daily_hr' },
          { metric: 'spo2', value: 99, unit: '%', baseline: 99, deltaPctVsBaseline: 0, status: 'normal', evidenceId: 'daily_spo2' },
        ],
      },
      trend7d: [],
      rulesInsights: [],
      suggestedChartTokens: [],
    },
  };

  const output = renderTaskContextPacket(packet, 'zh', '2026-05-31T18:35');

  expect(output).toContain('## 事件生理摘要（优先引用）');
  expect(output).toContain('事件窗口');
  expect(output).toContain('峰值 172bpm');
  expect(output).not.toContain('其余指标正常：hrv 93ms, resting_hr 48bpm, spo2 99%');
});
```

- [ ] **Step 2: Run failing renderer test**

Run:

```bash
pnpm --filter @health-advisor/agent-core test -- src/__tests__/prompts/context-packet-renderer.test.ts
```

Expected: FAIL because current renderer still lists normal metrics.

- [ ] **Step 3: Render event-window metrics explicitly**

In `renderHomepageEventInsights()`, after the headline line, add:

```ts
if (insight.eventWindow) {
  lines.push(`  - ${t(locale, '事件窗口', 'Event window')}${colon(locale)}${insight.eventWindow.start} ~ ${insight.eventWindow.end}, ${t(locale, '样本数', 'samples')}${colon(locale)}${insight.eventWindow.sampleCount}, ${t(locale, '覆盖度', 'coverage')}${colon(locale)}${insight.eventWindow.coverage}`);
  for (const metric of insight.eventWindow.metrics) {
    const values = [
      metric.max !== undefined ? `${t(locale, '峰值', 'max')} ${metric.max}${metric.unit}` : '',
      metric.average !== undefined ? `${t(locale, '均值', 'avg')} ${metric.average}${metric.unit}` : '',
      metric.latest !== undefined ? `${t(locale, '末段', 'latest')} ${metric.latest}${metric.unit}` : '',
      metric.delta !== undefined ? `${t(locale, '变化', 'delta')} ${metric.delta > 0 ? '+' : ''}${metric.delta}${metric.unit}` : '',
    ].filter(Boolean).join(', ');
    lines.push(`  - ${t(locale, '事件窗口指标', 'Event-window metric')}${colon(locale)}${metric.metric} ${metric.qualifier}${values ? ` (${values})` : ''} — ${metric.interpretation}`);
  }
}
```

- [ ] **Step 4: Suppress normal 24h metric list when events exist**

In `renderHomepage()`, replace the current `normalMetrics` rendering block under `if (hasEvents)` with:

```ts
if (normalMetrics.length > 0 && notableMetrics.length === 0) {
  lines.push(`- ${t(locale, '24h 恢复背景', '24h recovery background')}${c}${t(locale, '未见异常指标；仅作为事件解释背景，不展开逐项分析', 'no abnormal metrics; use only as event background, do not expand item by item')}`);
}
```

Keep notable and missing metrics visible:

```ts
for (const m of notableMetrics) {
  const parts: string[] = [`- ${m.metric}${c}${m.value}${m.unit}`];
  if (m.baseline !== undefined && m.deltaPctVsBaseline !== undefined) {
    const sign = m.deltaPctVsBaseline > 0 ? '+' : '';
    parts.push(`（${t(locale, '相对平时', 'vs usual')} ${sign}${m.deltaPctVsBaseline}%）`);
  }
  if (m.status === 'attention') parts.push(`[${t(locale, '注意', 'attention')}]`);
  if (m.status === 'critical') parts.push(`[${t(locale, '异常', 'critical')}${m.clinicalNote ? `: ${m.clinicalNote}` : ''}]`);
  lines.push(parts.join(''));
}
```

- [ ] **Step 5: Make trend section opt-in when events exist**

When `hasEvents` is true, only render trends if any trend has anomalies:

```ts
const eventTrendEvidence = homepage.trend7d.filter((tr) => tr.anomalyPoints.length > 0);
if (homepage.trend7d.length > 0) {
  if (hasEvents) {
    if (eventTrendEvidence.length > 0) {
      lines.push(t(locale, '## 过去一周趋势（仅异常补充）', '## Past Week Trends (Anomalies Only)'));
      for (const tr of eventTrendEvidence) {
        lines.push(renderMetricSummaryCompact(tr, '- ', locale));
      }
    }
  } else {
    lines.push(t(locale, '## 过去一周趋势', '## Past Week Trends'));
    for (const tr of homepage.trend7d) {
      lines.push(renderMetricSummary(tr, '- ', {}, locale));
    }
  }
}
```

- [ ] **Step 6: Tighten homepage template**

In `data/sandbox/prompts/homepage/template.md`, update `eventInsights 使用规则`:

```md
### eventInsights 使用规则

如果上下文包含 `## 事件生理摘要（优先引用）`，必须优先使用其中的 eventInsights 和事件窗口指标作为首页简报的主输入。

- 事件窗口指标优先于 raw latest24h、trend7d 和个人参考水平。
- raw latest24h 只用于恢复背景、安全边界或异常交叉验证，不得作为事件本身的心率/HRV/血氧表现来描述。
- 当事件窗口指标包含峰值、均值、末段或变化值时，summary 的核心分析必须引用其中至少 1 个事件窗口事实。
- 不得把 `过去24小时状态` 或 `过去一周趋势` 写成 summary 主体。
- summary 不要复制 eventInsights 的列表结构，要自然转写为用户能读懂的连续表达。
- 当前张力为 `critical` 时，必须优先说明安全边界和就医/观察建议。
- actions 应优先从 actionIntents 转写，不自行承诺提醒、模式切换、实时监控或调整监测逻辑。
```

- [ ] **Step 7: Run prompt tests**

Run:

```bash
pnpm --filter @health-advisor/agent-core test -- src/__tests__/prompts/context-packet-renderer.test.ts src/__tests__/prompts/task-builder.test.ts
pnpm --filter @health-advisor/agent-core typecheck
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/agent-core/src/prompts/context-packet-renderer.ts data/sandbox/prompts/homepage/template.md packages/agent-core/src/__tests__/prompts/context-packet-renderer.test.ts packages/agent-core/src/__tests__/prompts/task-builder.test.ts
git commit -m "feat(prompt): prioritize event-window brief context"
```

---

## Module E: Runtime Current-Day Aggregation

### Task 6: Stop Daily Baseline From Overwriting Observed Current-Day Metrics

**Dependencies:** Task 1 can be implemented first; this task otherwise changes `agent-api`.

**Context:** `registry.ts` currently aggregates synced current-day samples and then calls `patchRecordWithDailyBaseline()`, which overwrites observed HRV/SpO2/steps with profile defaults. That erases event effects before `latest24h` and charts see them. The correct precedence is: observed synced sample aggregate first; dailyBaseline can fill only missing fields.

**Files:**
- Modify: `apps/agent-api/src/runtime/registry.ts`
- Test: `apps/agent-api/src/__tests__/runtime/registry.test.ts`

- [ ] **Step 1: Add failing registry test**

Append to `apps/agent-api/src/__tests__/runtime/registry.test.ts`:

```ts
it('does not overwrite observed current-day aggregate values with dailyBaseline after activity sync', () => {
  try {
    registry.overrideStore.appendSegment(
      'profile-a',
      'deep_focus',
      { durationMinutes: 120 },
      0,
      { durationMinutes: 120, advanceClock: true },
    );
    registry.overrideStore.performSync('profile-a', 'manual_refresh');

    const profile = registry.getProfile('profile-a');
    const currentDate = registry.overrideStore.getDemoClock('profile-a').currentTime.slice(0, 10);
    const currentDay = profile.records.find((record) => record.date === currentDate);
    const dailyBaseline = registry.getRawProfile('profile-a').profile.dailyBaseline;

    expect(currentDay?.hrv).toBeDefined();
    expect(dailyBaseline?.hrv).toBeDefined();
    expect(currentDay?.hrv).not.toBe(dailyBaseline?.hrv);
  } finally {
    registry.overrideStore.reset('all');
  }
});
```

- [ ] **Step 2: Run failing test**

Run:

```bash
pnpm --filter @health-advisor/agent-api test -- src/__tests__/runtime/registry.test.ts
```

Expected: FAIL because `patchRecordWithDailyBaseline()` overwrites observed HRV.

- [ ] **Step 3: Replace overwrite patch with missing-only patch**

In `apps/agent-api/src/runtime/registry.ts`, replace `patchRecordWithDailyBaseline()` with:

```ts
function patchMissingRecordFieldsWithDailyBaseline(
  record: DailyRecord,
  dailyBaseline: Partial<BaselineMetrics>,
  demoTime?: string,
): DailyRecord {
  const patched = { ...record };

  if (dailyBaseline.avgSleepMinutes != null && !record.sleep) {
    const exact = dailyBaseline.avgSleepMinutes;
    let wakeHour = 6;
    let wakeMin = 0;
    if (demoTime) {
      const timePart = demoTime.split('T')[1];
      if (timePart) {
        const [h, m] = timePart.split(':');
        wakeHour = parseInt(h!, 10);
        wakeMin = parseInt(m!, 10);
      }
    }
    const wakeTotalMin = wakeHour * 60 + wakeMin;
    let bedTotalMin = wakeTotalMin - exact;
    if (bedTotalMin < 0) bedTotalMin += 24 * 60;
    const deep = Math.round(exact * 0.22);
    const rem = Math.round(exact * 0.24);
    const awake = Math.max(1, Math.round(exact * 0.06));
    const light = Math.max(0, exact - deep - rem - awake);

    patched.sleep = {
      totalMinutes: exact,
      stages: { deep, light, rem, awake },
      score: Math.max(5, Math.min(98, Math.round((exact / 480) * 90))),
      startTime: `${String(Math.floor(bedTotalMin / 60) % 24).padStart(2, '0')}:${String(bedTotalMin % 60).padStart(2, '0')}`,
      endTime: `${String(wakeHour).padStart(2, '0')}:${String(wakeMin).padStart(2, '0')}`,
    };
  }

  if (dailyBaseline.hrv != null && record.hrv == null) patched.hrv = dailyBaseline.hrv;
  if (dailyBaseline.spo2 != null && record.spo2 == null) patched.spo2 = dailyBaseline.spo2;

  if (dailyBaseline.restingHr != null && (!record.hr || record.hr.length === 0)) {
    patched.hr = [dailyBaseline.restingHr];
  }

  if (dailyBaseline.avgSteps != null && !record.activity) {
    patched.activity = {
      steps: dailyBaseline.avgSteps,
      calories: Math.round(dailyBaseline.avgSteps * 0.04),
      activeMinutes: 0,
      distanceKm: Math.round(dailyBaseline.avgSteps * 0.0007 * 100) / 100,
    };
  }

  return patched;
}
```

Then update the call site:

```ts
if (raw.profile.dailyBaseline) {
  currentDayRecord = patchMissingRecordFieldsWithDailyBaseline(currentDayRecord, raw.profile.dailyBaseline, clock.currentTime);
}
```

Do not patch existing observed `hrv`, `spo2`, `hr`, or `activity`.

- [ ] **Step 4: Update old test expectation**

There is an existing test named `当前日发生同步后仍保留历史 HRV`. Replace its expectation so it asserts observed synced data is preserved, not historical HRV:

```ts
expect(currentDay?.hrv).toBeDefined();
expect(currentDay?.hrv).not.toBe(rawCurrentDay!.hrv);
```

If the generated baseline sleep-only sync still produces the same value for a profile, use the new `deep_focus` test above as the authoritative non-overwrite regression and change the old test name to:

```ts
it('当前日发生同步后保留已观测 HRV，不用 dailyBaseline 覆盖', () => {
```

- [ ] **Step 5: Run tests**

Run:

```bash
pnpm --filter @health-advisor/agent-api test -- src/__tests__/runtime/registry.test.ts
pnpm --filter @health-advisor/agent-api typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/agent-api/src/runtime/registry.ts apps/agent-api/src/__tests__/runtime/registry.test.ts
git commit -m "fix(agent-api): preserve observed current-day metrics"
```

---

## Module F: Eval and Verification

### Task 7: Add Event-Window Quality Checks to Eval Scorer and Cases

**Dependencies:** Task 4, Task 5, Task 6.

**Context:** Existing homepage evals can pass when summary only mentions generic event words plus HRV/heart-rate words. Add checks requiring event-window numbers and preventing broad daily-status-first summaries.

**Files:**
- Modify: `packages/agent-core/src/evals/types.ts`
- Modify: `packages/agent-core/src/evals/case-schema.ts`
- Modify: `packages/agent-core/src/evals/scorers/task-scorer.ts`
- Test: `packages/agent-core/src/__tests__/evals/case-schema.test.ts`
- Test: `packages/agent-core/src/__tests__/evals/scorers.test.ts`
- Modify: `packages/agent-core/evals/cases/core/homepage/homepage-post-workout-recovery.json`
- Modify: `packages/agent-core/evals/cases/core/homepage/homepage-sedentary-fatigue-pivot.json`
- Modify: `packages/agent-core/evals/cases/core/homepage/homepage-focus-caffeine-reset.json`

- [ ] **Step 1: Extend eval types and schema**

In `packages/agent-core/src/evals/types.ts`, extend homepage expectations:

```ts
homepage?: {
  requireRecentEventFirst?: boolean;
  recentEventPatterns?: string[];
  require24hCrossAnalysis?: boolean;
  crossAnalysisPatterns?: {
    event?: string[];
    metric?: string[];
  };
  requireEventWindowFacts?: boolean;
  eventWindowValuePatterns?: string[];
  forbidDailyStatusFirstPatterns?: string[];
};
```

In `packages/agent-core/src/evals/case-schema.ts`, add the same optional fields to `HomepageTaskExpectationSchema`:

```ts
requireEventWindowFacts: z.boolean().optional(),
eventWindowValuePatterns: z.array(z.string()).optional(),
forbidDailyStatusFirstPatterns: z.array(z.string()).optional(),
```

Add refine:

```ts
.refine(
  (data) =>
    !data.requireEventWindowFacts ||
    (Array.isArray(data.eventWindowValuePatterns) && data.eventWindowValuePatterns.length > 0),
  {
    message: 'requireEventWindowFacts 为 true 时，eventWindowValuePatterns 必须提供且非空',
    path: ['eventWindowValuePatterns'],
  },
)
```

- [ ] **Step 2: Add scorer checks**

In `packages/agent-core/src/evals/scorers/task-scorer.ts`, inside `checkHomepage()` add:

```ts
if (homepage.requireEventWindowFacts) {
  results.push(checkEventWindowFacts(caseId, text, homepage.eventWindowValuePatterns ?? []));
}
if (homepage.forbidDailyStatusFirstPatterns && homepage.forbidDailyStatusFirstPatterns.length > 0) {
  results.push(checkDailyStatusNotFirst(caseId, envelope.summary, homepage.forbidDailyStatusFirstPatterns));
}
```

Add helper functions:

```ts
function checkEventWindowFacts(
  caseId: string,
  text: string,
  patterns: string[],
): EvalCheckResult {
  if (patterns.length === 0) {
    return {
      checkId: `${caseId}:task:homepage:event_window_facts`,
      severity: 'hard',
      passed: false,
      score: 0,
      maxScore: 1,
      message: 'requireEventWindowFacts 为 true 但缺少 eventWindowValuePatterns',
      details: { reason: 'missing_event_window_value_patterns' },
    };
  }

  const matched = patterns.filter((pattern) => new RegExp(pattern).test(text));
  const passed = matched.length > 0;
  return {
    checkId: `${caseId}:task:homepage:event_window_facts`,
    severity: 'hard',
    passed,
    score: passed ? 1 : 0,
    maxScore: 1,
    message: passed ? '命中事件窗口事实' : '未命中任何事件窗口事实',
    details: passed ? { matched } : { patterns },
  };
}

function checkDailyStatusNotFirst(
  caseId: string,
  summary: string,
  patterns: string[],
): EvalCheckResult {
  const summaryHead = summary.slice(0, 80);
  const matched = patterns.filter((pattern) => new RegExp(pattern).test(summaryHead));
  const passed = matched.length === 0;
  return {
    checkId: `${caseId}:task:homepage:daily_status_not_first`,
    severity: 'hard',
    passed,
    score: passed ? 1 : 0,
    maxScore: 1,
    message: passed ? 'summary 开头没有以整日状态为主体' : 'summary 开头以整日状态为主体',
    details: passed ? undefined : { matched, summaryHead },
  };
}
```

- [ ] **Step 3: Add scorer tests**

Append to homepage section in `packages/agent-core/src/__tests__/evals/scorers.test.ts`:

```ts
it('requireEventWindowFacts 命中事件窗口数字应通过', () => {
  const envelope = createValidEnvelope({
    summary: '巅峰，刚完成 HIIT 训练，事件窗口心率峰值 172bpm，末段回落到 92bpm。',
  });
  const evalCase = createValidCase({
    expectations: {
      taskSpecific: {
        homepage: {
          requireEventWindowFacts: true,
          eventWindowValuePatterns: ['172bpm', '92bpm'],
        },
      },
    },
  });

  const results = taskScorer.score(createScorerInput({ evalCase: evalCase as any, envelope }));
  const check = results.find((result) => result.checkId.includes('event_window_facts'));
  expect(check?.passed).toBe(true);
});

it('forbidDailyStatusFirstPatterns 命中 summary 开头应失败', () => {
  const envelope = createValidEnvelope({
    summary: '你的过去24小时状态整体不错，HRV 和睡眠都稳定。刚才也完成了训练。',
  });
  const evalCase = createValidCase({
    expectations: {
      taskSpecific: {
        homepage: {
          forbidDailyStatusFirstPatterns: ['过去24小时', '整体状态', '各项指标'],
        },
      },
    },
  });

  const results = taskScorer.score(createScorerInput({ evalCase: evalCase as any, envelope }));
  const check = results.find((result) => result.checkId.includes('daily_status_not_first'));
  expect(check?.passed).toBe(false);
});
```

- [ ] **Step 4: Update event homepage cases**

For `packages/agent-core/evals/cases/core/homepage/homepage-post-workout-recovery.json`, update `taskSpecific.homepage`:

```json
"taskSpecific": {
  "homepage": {
    "requireRecentEventFirst": true,
    "recentEventPatterns": ["运动", "有氧", "训练"],
    "require24hCrossAnalysis": true,
    "crossAnalysisPatterns": {
      "event": ["运动", "训练"],
      "metric": ["心率", "恢复", "睡眠", "HRV"]
    },
    "requireEventWindowFacts": true,
    "eventWindowValuePatterns": ["心率.*(峰值|均值|末段)", "HRV.*(末段|变化|压缩)", "\\d+\\s*(bpm|ms)"],
    "forbidDailyStatusFirstPatterns": ["过去24小时", "整体状态", "各项指标", "一周趋势"]
  }
}
```

For `homepage-sedentary-fatigue-pivot.json`, use:

```json
"requireEventWindowFacts": true,
"eventWindowValuePatterns": ["HRV.*(压缩|末段|变化)", "心率.*(抬升|偏高|末段|均值)", "\\d+\\s*(bpm|ms)"],
"forbidDailyStatusFirstPatterns": ["过去24小时", "整体状态", "各项指标", "一周趋势"]
```

For `homepage-focus-caffeine-reset.json`, use:

```json
"requireEventWindowFacts": true,
"eventWindowValuePatterns": ["专注.*\\d+\\s*min", "心率.*\\d+\\s*bpm", "HRV.*\\d+\\s*ms"],
"forbidDailyStatusFirstPatterns": ["过去24小时", "整体状态", "各项指标", "一周趋势"]
```

- [ ] **Step 5: Run eval-related tests**

Run:

```bash
pnpm --filter @health-advisor/agent-core test -- src/__tests__/evals/case-schema.test.ts src/__tests__/evals/scorers.test.ts
pnpm --filter @health-advisor/agent-core eval:agent:case -- H-020
pnpm --filter @health-advisor/agent-core eval:agent:case -- H-022
```

Expected: PASS. If fixture text in those cases lacks event-window numbers, update the fixture summary to include numbers that the case expects; do not loosen the scorer.

- [ ] **Step 6: Commit**

```bash
git add packages/agent-core/src/evals/types.ts packages/agent-core/src/evals/case-schema.ts packages/agent-core/src/evals/scorers/task-scorer.ts packages/agent-core/src/__tests__/evals/case-schema.test.ts packages/agent-core/src/__tests__/evals/scorers.test.ts packages/agent-core/evals/cases/core/homepage/homepage-post-workout-recovery.json packages/agent-core/evals/cases/core/homepage/homepage-sedentary-fatigue-pivot.json packages/agent-core/evals/cases/core/homepage/homepage-focus-caffeine-reset.json
git commit -m "test(eval): require event-window homepage briefs"
```

### Task 8: End-to-End Validation and Prompt Artifact Inspection

**Dependencies:** Tasks 1-7.

**Context:** The implementation is only acceptable if the built prompt contains event-window facts before daily context and if no test relies on broad daily status as the event analysis.

**Files:**
- No required source modifications if all checks pass.
- Optional generated eval reports under `packages/agent-core/evals/reports/` should not be committed unless this repo already commits reports for the same workflow.

- [ ] **Step 1: Run targeted unit tests**

Run:

```bash
pnpm --filter @health-advisor/agent-core test -- src/__tests__/context/homepage-event-window.test.ts src/__tests__/context/homepage-event-insights.test.ts src/__tests__/context/context-packet-builder.test.ts src/__tests__/prompts/context-packet-renderer.test.ts src/__tests__/evals/scorers.test.ts
pnpm --filter @health-advisor/agent-api test -- src/__tests__/runtime/registry.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run typechecks**

Run:

```bash
pnpm --filter @health-advisor/agent-core typecheck
pnpm --filter @health-advisor/agent-api typecheck
```

Expected: PASS.

- [ ] **Step 3: Run fixture evals**

Run:

```bash
pnpm --filter @health-advisor/agent-core eval:agent:core:fixture
```

Expected: PASS with zero hard failures.

- [ ] **Step 4: Inspect a prompt artifact**

Run one event case with report output:

```bash
pnpm --filter @health-advisor/agent-core eval:agent:case -- H-022
```

Open the generated report path printed by the eval runner. In the captured prompt, verify these strings appear in this order:

```text
## 最近发生的事件（分析主体）
## 事件生理摘要（优先引用）
事件窗口
事件窗口指标
## 过去24小时状态（交叉验证背景，不要展开分析）
```

Also verify the prompt does not contain a normal-metric expansion like:

```text
其余指标正常：hrv ...
```

- [ ] **Step 5: Full package verification**

Run:

```bash
pnpm --filter @health-advisor/agent-core test
pnpm --filter @health-advisor/agent-api test
pnpm --filter @health-advisor/sandbox test
```

Expected: PASS.

- [ ] **Step 6: Commit final adjustments if needed**

If Step 1-5 required code/test adjustments:

```bash
git add packages/agent-core apps/agent-api packages/sandbox data/sandbox
git commit -m "fix(agent): align realtime brief event-window validation"
```

If no files changed after validation, do not create an empty commit.

---

## Acceptance Criteria

- `eventInsights[].physiology` for recent events uses `eventWindow.metrics`, not `latest24h.metrics`.
- `RecentEventPacket` preserves `recognizedEventId`, `sourceSegmentId`, recognition evidence, and event-window evidence IDs.
- Event-window facts include real values from synced device samples, such as heart-rate peak/average/latest, HRV latest/delta, SpO2 min/latest, motion average/max, steps max, stress max/latest when present.
- Missing event samples produce `coverage: "missing"` and no fabricated physiology.
- `latest24h` is rendered only as recovery/safety background when events exist.
- Normal 24h metrics are not listed item-by-item when recent events exist.
- 7d trends are not rendered for event briefs unless they contain anomaly points.
- Current-day observed aggregate metrics are not overwritten by `dailyBaseline`.
- Homepage event evals fail when the summary starts from broad daily status or lacks event-window facts.

## Self-Review Checklist for Implementers

- Every new event-window number in LLM prompt can be traced to a `DeviceEvent` sample.
- No helper copies `latest24h` values into event-window physiology.
- No prompt instruction asks the model to infer heart-rate/HRV changes that are not in event-window metrics.
- No eval fixture passes solely because it mentions generic words like `心率`, `HRV`, `恢复`, or `训练`.
- Commits are conventional commits and scoped to one module at a time.
