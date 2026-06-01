# Action Micro-Events Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将首页实时简报的建议交互拆成“添加进日程”和“即时微行动”，其中即时微行动能追加受控 mock timeline 数据并强制刷新实时简报。

**Architecture:** 采用 shared 受控协议 + sandbox 微事件注册表 + God Mode micro-event append API + agent action interaction + web action interaction UI。LLM 只表达建议文案并保留候选 action 的结构化 `interaction`，不能输出任意传感器事件类型；微事件数据由确定性生成器基于 profile baseline 生成。

**Tech Stack:** TypeScript, pnpm, Vitest, Zod, Fastify, React, TanStack Query, Next.js, Playwright, existing `@health-advisor/shared`, `@health-advisor/sandbox`, `@health-advisor/agent-core`, `@health-advisor/agent-api`, `@health-advisor/web`.

---

## 设计来源

本计划落实 `docs/superpowers/specs/2026-06-01-action-micro-events-design.md`。

微事件类别参考 `docs/profile-case-sample.xlsx` 的 `Sample Feedback interactions` sheet 中 `Action Suggestion 1 - 3` 的优秀样本主题，覆盖深呼吸、饭后走动、离屏休息、姿势调整、运动前后补给、低刺激工作、运动强度调整、睡前放松等。补水、调暗灯光、调室温、洗澡等传感器无法可靠捕捉的行为不进入 timeline。

## Module Topology

```text
Module A: Shared Contract
  Task A1: MicroEvent shared types/schemas
  Task A2: Action interaction + God Mode payload contract

Module B: Sandbox Micro-Event Data
  Task B1: Micro-event registry and deterministic generators
  Task B2: Micro-event append helper, recognition, and exports

Module C: God Mode API
  Task C1: OverrideStore appendMicroEvent
  Task C2: GodModeService + /god-mode/micro-event-append route

Module D: Agent Action Interaction
  Task D1: ActionIntent interaction mapping
  Task D2: Prompt rendering and response parser validation

Module E: Web Interaction
  Task E1: Web hook for micro-event action append
  Task E2: ActionOptions UI branch and brief refresh

Module F: Integration Verification
  Task F1: End-to-end action interaction verification
```

Topological execution order:

```text
A1
 ├─> A2
 │    ├─> D1 ─> D2 ─┐
 │    └─> C2 <─ C1 <─ B2 <─ B1
 │                   │
 │                   └─> E1 ─> E2
 └────────────────────────────┘

F1 depends on A1, A2, B1, B2, C1, C2, D1, D2, E1, E2.
```

Parallelization guidance:

- A1 must finish first because every downstream module imports `MicroEventType`.
- B1 can start after A1; A2 can run in parallel with B1.
- D1 can start after A2 and does not require B1/C1.
- C1 requires B2 because it calls `appendMicroEvent`.
- C2 requires C1 and A2.
- E1 requires A2 and C2 because it depends on the payload type and endpoint.
- E2 requires E1 and D2 because it needs both frontend hook and action `interaction`.
- F1 is the final integration gate.

## File Responsibility Map

| File | Responsibility |
| --- | --- |
| `packages/shared/src/types/micro-event.ts` | Define the 14 allowed micro-event types and micro-event params value shape. |
| `packages/shared/src/schemas/micro-event.ts` | Zod schemas for micro-event type and params. |
| `packages/shared/src/types/agent.ts` | Extend `ActionOption` with optional `interaction`. |
| `packages/shared/src/schemas/agent.ts` | Validate `calendar` and `micro_event` action interactions. |
| `packages/shared/src/types/god-mode.ts` | Add `MicroEventAppendPayload` and `micro_event_append` action variant. |
| `packages/shared/src/schemas/god-mode.ts` | Validate `/god-mode/micro-event-append` payload. |
| `packages/shared/src/types/sandbox.ts` | Extend `RecognizedEventType` with `MicroEventType`. |
| `packages/shared/src/schemas/sandbox.ts` | Extend `RecognizedEventTypeSchema` with `MicroEventTypeSchema`. |
| `packages/shared/src/index.ts` | Export new types and schemas. |
| `packages/sandbox/src/helpers/micro-event-registry.ts` | Own micro-event defaults, UI labels, evidence labels, and generation profile. |
| `packages/sandbox/src/helpers/micro-event-generators.ts` | Convert one micro-event segment into deterministic `DeviceEvent[]`. |
| `packages/sandbox/src/helpers/micro-event-append.ts` | Compute micro-event time range, segment id, events, and new demo time. |
| `packages/sandbox/src/helpers/event-recognition.ts` | Recognize `seg-micro-*` source segments as micro events. |
| `packages/sandbox/src/index.ts` | Export micro-event helpers for API runtime. |
| `apps/agent-api/src/runtime/override-store.ts` | Persist micro-event raw events and auto-sync them without adding main activity segments. |
| `apps/agent-api/src/modules/god-mode/service.ts` | Enrich micro-event params with profile baseline, invalidate analytical memory, return God Mode state. |
| `apps/agent-api/src/modules/god-mode/routes.ts` | Add `POST /god-mode/micro-event-append`, clear brief cache. |
| `packages/agent-core/src/context/context-packet.ts` | Extend `ActionIntentCandidate` with optional `interaction`. |
| `packages/agent-core/src/context/homepage-event-insights.ts` | Map recommended focus items to calendar/micro-event/no-interaction choices. |
| `packages/agent-core/src/prompts/context-packet-renderer.ts` | Render action candidates with their structured interaction contract. |
| `packages/agent-core/src/prompts/task-builder.ts` | Update homepage JSON example and constraints to include optional `interaction`. |
| `packages/agent-core/src/output/response-parser.ts` | Strictly validate `interaction` in LLM actions. |
| `apps/web/src/hooks/use-action-interactions.ts` | Handle action clicks, call micro-event API, invalidate queries, force brief regeneration. |
| `apps/web/src/components/homepage/ActionOptions.tsx` | Render calendar button, micro-event pending state, and no-interaction current behavior. |
| `apps/web/src/components/homepage/MorningBriefCard.tsx` | Pass action interaction handler props through to `ActionOptions`. |
| `apps/web/src/app/page.tsx` | Wire `useActionInteractions` with current profile and `useRefetchBrief`. |

---

## Module A: Shared Contract

### Task A1: MicroEvent Shared Types And Schemas

**Dependencies:** None.

**Context:** Micro events must be separate from `ActivitySegmentType`. Existing recognized events are typed in `packages/shared/src/types/sandbox.ts`; action and API schemas live in shared and are consumed by all packages.

**Task details:**

- Add a dedicated `MicroEventType` union with exactly 14 values.
- Add `MicroEventParams` as `Record<string, number | string | boolean>`.
- Export `MICRO_EVENT_TYPES` as a readonly tuple so schemas, tests, and registries share the same source of truth.
- Extend `RecognizedEventType` and `RecognizedEventTypeSchema` to include micro events.
- Export all new symbols from `packages/shared/src/index.ts`.

**Files:**

- Create: `packages/shared/src/types/micro-event.ts`
- Create: `packages/shared/src/schemas/micro-event.ts`
- Modify: `packages/shared/src/types/sandbox.ts`
- Modify: `packages/shared/src/schemas/sandbox.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/src/__tests__/schemas.test.ts`

**Implementation contract:**

```ts
// packages/shared/src/types/micro-event.ts
export const MICRO_EVENT_TYPES = [
  'micro_deep_breathing',
  'micro_short_walk',
  'micro_post_meal_walk',
  'micro_post_workout_slow_walk',
  'micro_standing_stretch',
  'micro_desk_mobility',
  'micro_offscreen_eye_rest',
  'micro_window_gaze_walk',
  'micro_pre_workout_snack',
  'micro_post_workout_snack',
  'micro_easy_cardio',
  'micro_restorative_stretch',
  'micro_low_stimulus_work',
  'micro_sleep_wind_down',
] as const;

export type MicroEventType = (typeof MICRO_EVENT_TYPES)[number];
export type MicroEventParamValue = number | string | boolean;
export type MicroEventParams = Record<string, MicroEventParamValue>;
```

```ts
// packages/shared/src/schemas/micro-event.ts
import { z } from 'zod';
import { MICRO_EVENT_TYPES } from '../types/micro-event';

export const MicroEventTypeSchema = z.enum(MICRO_EVENT_TYPES);
export const MicroEventParamsSchema = z.record(z.union([z.number(), z.string(), z.boolean()]));
```

`packages/shared/src/types/sandbox.ts`:

```ts
import type { MicroEventType } from './micro-event';

export type RecognizedEventType =
  | ActivitySegmentType
  | MicroEventType
  | 'possible_caffeine_intake'
  | 'possible_alcohol_intake';
```

`packages/shared/src/schemas/sandbox.ts`:

```ts
import { MicroEventTypeSchema } from './micro-event';

export const RecognizedEventTypeSchema = z.union([
  ActivitySegmentTypeSchema,
  MicroEventTypeSchema,
  z.literal('possible_caffeine_intake'),
  z.literal('possible_alcohol_intake'),
]);
```

**Tests to add:**

Append to `packages/shared/src/__tests__/schemas.test.ts`:

```ts
describe('MicroEvent schemas', () => {
  it('accepts all 14 micro event types', () => {
    for (const type of MICRO_EVENT_TYPES) {
      expect(MicroEventTypeSchema.safeParse(type).success).toBe(true);
      expect(RecognizedEventTypeSchema.safeParse(type).success).toBe(true);
    }
  });

  it('rejects unknown micro event types', () => {
    expect(MicroEventTypeSchema.safeParse('micro_hydration_break').success).toBe(false);
    expect(RecognizedEventTypeSchema.safeParse('micro_breathing_reset').success).toBe(false);
  });
});
```

Also import `MICRO_EVENT_TYPES`, `MicroEventTypeSchema`, and `RecognizedEventTypeSchema` at the top of the test file if they are not already imported.

**Verification commands:**

```bash
pnpm --filter @health-advisor/shared test -- src/__tests__/schemas.test.ts
pnpm --filter @health-advisor/shared typecheck
```

**Expected result:** both commands pass.

**Commit:**

```bash
git add packages/shared/src/types/micro-event.ts packages/shared/src/schemas/micro-event.ts packages/shared/src/types/sandbox.ts packages/shared/src/schemas/sandbox.ts packages/shared/src/index.ts packages/shared/src/__tests__/schemas.test.ts
git commit -m "feat(shared): add micro event contract"
```

### Task A2: Action Interaction And God Mode Payload Contract

**Dependencies:** Task A1.

**Context:** Existing `ActionOption` has only text fields and must remain backward compatible. Existing actions without `interaction` continue to parse and display as before.

**Task details:**

- Add `ActionInteraction` union:
  - `calendar`: title, timingLabel, durationMinutes.
  - `micro_event`: type, optional durationMinutes, optional params.
- Add optional `interaction?: ActionInteraction` to `ActionOption`.
- Add `MicroEventAppendPayload` to God Mode shared types and schemas.
- Add `micro_event_append` to `GodModeAction`.
- Keep existing action schemas accepting actions with no interaction.
- Reject invalid interaction fields through Zod.

**Files:**

- Modify: `packages/shared/src/types/agent.ts`
- Modify: `packages/shared/src/schemas/agent.ts`
- Modify: `packages/shared/src/types/god-mode.ts`
- Modify: `packages/shared/src/schemas/god-mode.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/src/__tests__/schemas.test.ts`

**Implementation contract:**

```ts
// packages/shared/src/types/agent.ts
import type { MicroEventParams, MicroEventType } from './micro-event';

export type ActionInteraction =
  | {
      kind: 'calendar';
      calendar: {
        title: string;
        timingLabel: string;
        durationMinutes: number;
      };
    }
  | {
      kind: 'micro_event';
      microEvent: {
        type: MicroEventType;
        durationMinutes?: number;
        params?: MicroEventParams;
      };
    };

export interface ActionOption {
  id: string;
  emoji: string;
  title: string;
  description: string;
  aiPromise: string;
  interaction?: ActionInteraction;
}
```

```ts
// packages/shared/src/schemas/agent.ts
import { MicroEventParamsSchema, MicroEventTypeSchema } from './micro-event';

export const ActionInteractionSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('calendar'),
    calendar: z.object({
      title: z.string().min(1),
      timingLabel: z.string().min(1),
      durationMinutes: z.number().int().positive(),
    }),
  }),
  z.object({
    kind: z.literal('micro_event'),
    microEvent: z.object({
      type: MicroEventTypeSchema,
      durationMinutes: z.number().int().positive().optional(),
      params: MicroEventParamsSchema.optional(),
    }),
  }),
]);
```

`ActionOptionSchema` must add `interaction: ActionInteractionSchema.optional()`.

```ts
// packages/shared/src/types/god-mode.ts
import type { MicroEventParams, MicroEventType } from './micro-event';

export interface MicroEventAppendPayload {
  microEventType: MicroEventType;
  durationMinutes?: number;
  params?: MicroEventParams;
  advanceClock?: boolean;
}
```

`GodModeAction` must include:

```ts
| { type: 'micro_event_append'; payload: MicroEventAppendPayload }
```

```ts
// packages/shared/src/schemas/god-mode.ts
import { MicroEventParamsSchema, MicroEventTypeSchema } from './micro-event';

export const MicroEventAppendPayloadSchema = z.object({
  microEventType: MicroEventTypeSchema,
  durationMinutes: z.number().int().positive().optional(),
  params: MicroEventParamsSchema.optional(),
  advanceClock: z.boolean().optional(),
});
```

**Tests to add:**

Append to the existing `AgentResponseEnvelopeSchema — actions & microTips optional` block:

```ts
it('accepts calendar action interaction', () => {
  const envelope = {
    summary: '测试摘要',
    source: 'llm',
    statusColor: 'good',
    chartTokens: [],
    actions: [{
      id: 'calendar-1',
      emoji: '☕',
      title: '延后咖啡',
      description: '把咖啡安排到 10:30 后',
      aiPromise: '我会记录你的选择并用于本次建议上下文',
      interaction: {
        kind: 'calendar',
        calendar: { title: '10:30 后再喝咖啡', timingLabel: '今天 10:30', durationMinutes: 15 },
      },
    }],
    meta: { taskType: 'homepage_summary', pageContext: validPageContext, finishReason: 'complete' },
  };

  expect(AgentResponseEnvelopeSchema.safeParse(envelope).success).toBe(true);
});

it('accepts micro event action interaction', () => {
  const envelope = {
    summary: '测试摘要',
    source: 'llm',
    statusColor: 'good',
    chartTokens: [],
    actions: [{
      id: 'micro-1',
      emoji: '🫁',
      title: '做几次深呼吸',
      description: '现在做 3 分钟缓慢呼吸',
      aiPromise: '我会记录你的选择并更新实时简报',
      interaction: {
        kind: 'micro_event',
        microEvent: { type: 'micro_deep_breathing', durationMinutes: 3, params: { pattern: 'extended_exhale' } },
      },
    }],
    meta: { taskType: 'homepage_summary', pageContext: validPageContext, finishReason: 'complete' },
  };

  expect(AgentResponseEnvelopeSchema.safeParse(envelope).success).toBe(true);
});

it('rejects invalid micro event action interaction', () => {
  const envelope = {
    summary: '测试摘要',
    source: 'llm',
    statusColor: 'good',
    chartTokens: [],
    actions: [{
      id: 'micro-invalid',
      emoji: '💧',
      title: '补水',
      description: '喝一杯水',
      aiPromise: '我会记录你的选择并用于本次建议上下文',
      interaction: {
        kind: 'micro_event',
        microEvent: { type: 'micro_hydration_break' },
      },
    }],
    meta: { taskType: 'homepage_summary', pageContext: validPageContext, finishReason: 'complete' },
  };

  expect(AgentResponseEnvelopeSchema.safeParse(envelope).success).toBe(false);
});
```

Add God Mode payload tests:

```ts
describe('MicroEventAppendPayloadSchema', () => {
  it('accepts valid micro event append payload', () => {
    const result = MicroEventAppendPayloadSchema.safeParse({
      microEventType: 'micro_short_walk',
      durationMinutes: 5,
      params: { pace: 'slow' },
      advanceClock: true,
    });

    expect(result.success).toBe(true);
  });

  it('rejects hydration micro event payload because hydration is not a micro event type', () => {
    expect(MicroEventAppendPayloadSchema.safeParse({
      microEventType: 'micro_hydration_break',
    }).success).toBe(false);
  });
});
```

**Verification commands:**

```bash
pnpm --filter @health-advisor/shared test -- src/__tests__/schemas.test.ts
pnpm --filter @health-advisor/shared typecheck
```

**Expected result:** both commands pass, and old action tests still pass.

**Commit:**

```bash
git add packages/shared/src/types/agent.ts packages/shared/src/schemas/agent.ts packages/shared/src/types/god-mode.ts packages/shared/src/schemas/god-mode.ts packages/shared/src/index.ts packages/shared/src/__tests__/schemas.test.ts
git commit -m "feat(shared): add action interaction contract"
```

---

## Module B: Sandbox Micro-Event Data

### Task B1: Micro-Event Registry And Deterministic Generators

**Dependencies:** Task A1.

**Context:** Timeline Control main events use `ActivitySegmentType` and `activity-generators.ts`. Micro events must stay separate and generate only mock sensor data that a wearable could plausibly observe.補水/喝水 is deliberately absent from this registry.

**Task details:**

- Create a registry for all 14 micro events with default duration, Chinese UI title, evidence label, and generation profile.
- Create deterministic `DeviceEvent[]` generation for each micro event.
- Use segment ids in the format `seg-micro-${type}-${YYYYMMDDHHmm}`.
- Generate values using baseline params:
  - `_baselineRestingHr`
  - `_baselineHrv`
  - `_baselineSpo2`
- Do not generate sleep stages for `micro_sleep_wind_down`.
- Do not create any hydration micro event.

**Files:**

- Create: `packages/sandbox/src/helpers/micro-event-registry.ts`
- Create: `packages/sandbox/src/helpers/micro-event-generators.ts`
- Test: `packages/sandbox/src/__tests__/helpers/micro-event-generators.test.ts`

**Implementation contract:**

```ts
// packages/sandbox/src/helpers/micro-event-registry.ts
import type { MicroEventType } from '@health-advisor/shared';

export interface MicroEventDefinition {
  type: MicroEventType;
  defaultDurationMinutes: number;
  titleZh: string;
  evidenceLabelZh: string;
  profile:
    | 'deep_breathing'
    | 'short_walk'
    | 'post_meal_walk'
    | 'post_workout_slow_walk'
    | 'standing_stretch'
    | 'desk_mobility'
    | 'offscreen_rest'
    | 'window_gaze_walk'
    | 'snack'
    | 'easy_cardio'
    | 'restorative_stretch'
    | 'low_stimulus'
    | 'sleep_wind_down';
}
```

Registry values:

| type | duration | titleZh | profile |
| --- | ---: | --- | --- |
| `micro_deep_breathing` | 3 | 做几次深呼吸 | `deep_breathing` |
| `micro_short_walk` | 5 | 起身走几分钟 | `short_walk` |
| `micro_post_meal_walk` | 5 | 饭后走一小会儿 | `post_meal_walk` |
| `micro_post_workout_slow_walk` | 8 | 运动后慢走几分钟 | `post_workout_slow_walk` |
| `micro_standing_stretch` | 5 | 站起来活动肩颈 | `standing_stretch` |
| `micro_desk_mobility` | 4 | 在桌边活动关节 | `desk_mobility` |
| `micro_offscreen_eye_rest` | 10 | 闭眼离屏休息 | `offscreen_rest` |
| `micro_window_gaze_walk` | 4 | 到窗边看远处 | `window_gaze_walk` |
| `micro_pre_workout_snack` | 10 | 训练前吃一份小点 | `snack` |
| `micro_post_workout_snack` | 10 | 运动后补一份恢复小点 | `snack` |
| `micro_easy_cardio` | 20 | 做一段轻松有氧 | `easy_cardio` |
| `micro_restorative_stretch` | 12 | 做一段拉伸恢复 | `restorative_stretch` |
| `micro_low_stimulus_work` | 30 | 做一段低刺激收尾工作 | `low_stimulus` |
| `micro_sleep_wind_down` | 20 | 睡前放松一会儿 | `sleep_wind_down` |

```ts
// packages/sandbox/src/helpers/micro-event-generators.ts
import type { DeviceEvent, MicroEventParams, MicroEventType } from '@health-advisor/shared';

export interface MicroEventSegment {
  segmentId: string;
  profileId: string;
  type: MicroEventType;
  start: string;
  end: string;
  params?: MicroEventParams;
}

export function generateEventsForMicroEvent(segment: MicroEventSegment): DeviceEvent[];
```

Generation profiles must produce these observable properties:

- `deep_breathing`: low motion, zero steps, HR decreases by 4-8 bpm, HRV increases by 4-10 ms, stress decreases.
- `short_walk`: cumulative steps 250-500 for 5 minutes, motion elevated, HR rises modestly then trends down.
- `post_meal_walk`: cumulative steps 250-450, HR stable in light range, HRV mildly compressed.
- `post_workout_slow_walk`: cumulative steps 350-700, HR starts above baseline and declines each minute.
- `standing_stretch` / `desk_mobility`: very low steps, light motion, HR small movement, stress mild decline.
- `offscreen_rest`: zero steps, low motion, HR and stress decline, HRV mild recovery.
- `window_gaze_walk`: 60-160 steps in first 1-2 minutes, then low motion and stress decline.
- `snack`: low motion, small HR rise, HRV mild compression; do not claim exact food type.
- `easy_cardio`: moderate steps/motion and HR in a low exercise band.
- `restorative_stretch`: low steps, light-to-moderate motion, HR low fluctuation, stress decline.
- `low_stimulus`: low motion, zero or near-zero steps, HR/stress gradual decline.
- `sleep_wind_down`: low motion, HR/stress decline, no `sleepStage` metric.

**Tests to add:**

`packages/sandbox/src/__tests__/helpers/micro-event-generators.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { MICRO_EVENT_TYPES } from '@health-advisor/shared';
import { MICRO_EVENT_REGISTRY } from '../../helpers/micro-event-registry';
import { generateEventsForMicroEvent } from '../../helpers/micro-event-generators';

function makeSegment(type: (typeof MICRO_EVENT_TYPES)[number]) {
  const definition = MICRO_EVENT_REGISTRY[type];
  return {
    segmentId: `seg-micro-${type}-202606010900`,
    profileId: 'profile-a',
    type,
    start: '2026-06-01T09:00',
    end: `2026-06-01T09:${String(definition.defaultDurationMinutes).padStart(2, '0')}`,
    params: { _baselineRestingHr: 58, _baselineHrv: 72, _baselineSpo2: 97 },
  };
}

describe('generateEventsForMicroEvent', () => {
  it('generates events for every registered micro event type', () => {
    for (const type of MICRO_EVENT_TYPES) {
      const events = generateEventsForMicroEvent(makeSegment(type));
      expect(events.length).toBeGreaterThan(0);
      expect(events.every((event) => event.profileId === 'profile-a')).toBe(true);
      expect(events.every((event) => event.segmentId?.startsWith(`seg-micro-${type}-`))).toBe(true);
      expect(events.some((event) => event.metric === 'heartRate')).toBe(true);
      expect(events.some((event) => event.metric === 'motion')).toBe(true);
    }
  });

  it('deep breathing lowers heart rate and raises HRV', () => {
    const events = generateEventsForMicroEvent(makeSegment('micro_deep_breathing'));
    const hr = events.filter((event) => event.metric === 'heartRate').map((event) => Number(event.value));
    const hrv = events.filter((event) => event.metric === 'hrvRmssd').map((event) => Number(event.value));

    expect(hr.at(-1)!).toBeLessThan(hr[0]!);
    expect(hrv.at(-1)!).toBeGreaterThan(hrv[0]!);
    expect(events.filter((event) => event.metric === 'steps').every((event) => Number(event.value) === 0)).toBe(true);
  });

  it('short walk produces steps and motion without hydration claims', () => {
    const events = generateEventsForMicroEvent(makeSegment('micro_short_walk'));
    const steps = events.filter((event) => event.metric === 'steps').map((event) => Number(event.value));
    const motions = events.filter((event) => event.metric === 'motion').map((event) => Number(event.value));

    expect(steps.at(-1)!).toBeGreaterThan(200);
    expect(Math.max(...motions)).toBeGreaterThan(1);
    expect(events.map((event) => event.eventId).join('\n')).not.toMatch(/hydration|water|补水/);
  });

  it('sleep wind down never generates sleep stages', () => {
    const events = generateEventsForMicroEvent(makeSegment('micro_sleep_wind_down'));
    expect(events.some((event) => event.metric === 'sleepStage')).toBe(false);
  });
});
```

**Verification commands:**

```bash
pnpm --filter @health-advisor/sandbox test -- src/__tests__/helpers/micro-event-generators.test.ts
pnpm --filter @health-advisor/sandbox typecheck
```

**Expected result:** both commands pass.

**Commit:**

```bash
git add packages/sandbox/src/helpers/micro-event-registry.ts packages/sandbox/src/helpers/micro-event-generators.ts packages/sandbox/src/__tests__/helpers/micro-event-generators.test.ts
git commit -m "feat(sandbox): add micro event generators"
```

### Task B2: Micro-Event Append Helper, Recognition, And Exports

**Dependencies:** Task B1.

**Context:** `appendSegment()` returns generated events and advances demo time for main activity segments. Micro events need the same time semantics but must not add an `ActivitySegment` to `state.segments`.

**Task details:**

- Add `appendMicroEvent()` helper returning generated events, start/end, and `newCurrentTime`.
- Add recognition for `seg-micro-${type}-${timestamp}` segment ids.
- Export new helper and types from `packages/sandbox/src/index.ts`.
- Keep `appendSegment()` behavior unchanged.

**Files:**

- Create: `packages/sandbox/src/helpers/micro-event-append.ts`
- Modify: `packages/sandbox/src/helpers/event-recognition.ts`
- Modify: `packages/sandbox/src/index.ts`
- Test: `packages/sandbox/src/__tests__/helpers/micro-event-append.test.ts`
- Test: `packages/sandbox/src/__tests__/helpers/event-recognition.test.ts`

**Implementation contract:**

```ts
// packages/sandbox/src/helpers/micro-event-append.ts
import type { DeviceEvent, MicroEventParams, MicroEventType } from '@health-advisor/shared';

export interface MicroEventAppendResult {
  events: DeviceEvent[];
  newCurrentTime: string;
  eventStart: string;
  eventEnd: string;
  segmentId: string;
}

export function appendMicroEvent(
  currentTime: string,
  microEventType: MicroEventType,
  profileId: string,
  params?: MicroEventParams,
  options?: { durationMinutes?: number; advanceClock?: boolean },
): MicroEventAppendResult;
```

Rules:

- `eventStart` equals `currentTime`.
- `eventEnd` equals `currentTime + durationMinutes`.
- `durationMinutes` uses registry default when omitted.
- `segmentId` format is `seg-micro-${microEventType}-${start.replace(/[-T:]/g, '')}`.
- `advanceClock` defaults to `true`.
- When `advanceClock === false`, `newCurrentTime` equals `currentTime`.

Update recognition:

```ts
function extractMicroEventType(segmentId: string): MicroEventType | null {
  const match = /^seg-micro-(micro_[a-z_]+)-\d+$/.exec(segmentId);
  const raw = match?.[1];
  const parsed = raw ? MicroEventTypeSchema.safeParse(raw) : null;
  return parsed?.success ? parsed.data : null;
}
```

In `classifySegment(stats)` before the existing god-mode segment branch:

```ts
const microEventType = extractMicroEventType(stats.segmentId);
if (microEventType) {
  return buildRecognized(stats, microEventType, durationMin, evidence, () => {
    evidence.push(`用户选择触发微事件 ${microEventType}，持续 ${durationMin} 分钟`);
    return 1.0;
  });
}
```

**Tests to add:**

`packages/sandbox/src/__tests__/helpers/micro-event-append.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { appendMicroEvent } from '../../helpers/micro-event-append';

describe('appendMicroEvent', () => {
  it('creates micro event events and advances time by default duration', () => {
    const result = appendMicroEvent(
      '2026-06-01T09:00',
      'micro_deep_breathing',
      'profile-a',
      { _baselineRestingHr: 58, _baselineHrv: 72, _baselineSpo2: 97 },
    );

    expect(result.eventStart).toBe('2026-06-01T09:00');
    expect(result.eventEnd).toBe('2026-06-01T09:03');
    expect(result.newCurrentTime).toBe('2026-06-01T09:03');
    expect(result.segmentId).toBe('seg-micro-micro_deep_breathing-202606010900');
    expect(result.events.length).toBeGreaterThan(0);
  });

  it('supports duration override and no clock advance', () => {
    const result = appendMicroEvent(
      '2026-06-01T09:00',
      'micro_short_walk',
      'profile-a',
      undefined,
      { durationMinutes: 7, advanceClock: false },
    );

    expect(result.eventEnd).toBe('2026-06-01T09:07');
    expect(result.newCurrentTime).toBe('2026-06-01T09:00');
  });
});
```

Append to `packages/sandbox/src/__tests__/helpers/event-recognition.test.ts`:

```ts
it('recognizes micro event segment ids as micro events', () => {
  const result = appendMicroEvent(
    '2026-06-01T09:00',
    'micro_deep_breathing',
    'profile-a',
    { _baselineRestingHr: 58, _baselineHrv: 72, _baselineSpo2: 97 },
  );

  const recognized = recognizeEvents(result.events, 'profile-a', result.newCurrentTime);

  expect(recognized).toHaveLength(1);
  expect(recognized[0]!.type).toBe('micro_deep_breathing');
  expect(recognized[0]!.confidence).toBe(1);
  expect(recognized[0]!.sourceSegmentId).toBe(result.segmentId);
  expect(recognized[0]!.evidence.join('\n')).toContain('用户选择触发微事件 micro_deep_breathing');
});
```

**Verification commands:**

```bash
pnpm --filter @health-advisor/sandbox test -- src/__tests__/helpers/micro-event-append.test.ts src/__tests__/helpers/event-recognition.test.ts
pnpm --filter @health-advisor/sandbox typecheck
```

**Expected result:** both commands pass and existing `timeline-append` tests remain unchanged.

**Commit:**

```bash
git add packages/sandbox/src/helpers/micro-event-append.ts packages/sandbox/src/helpers/event-recognition.ts packages/sandbox/src/index.ts packages/sandbox/src/__tests__/helpers/micro-event-append.test.ts packages/sandbox/src/__tests__/helpers/event-recognition.test.ts
git commit -m "feat(sandbox): append and recognize micro events"
```

---

## Module C: God Mode API

### Task C1: OverrideStore appendMicroEvent

**Dependencies:** Task B2.

**Context:** `OverrideStoreService.appendSegment()` currently appends raw events and immediately performs `app_open` sync. Micro events need identical raw-event and sync semantics but must not mutate `segments` or `injectedEvents`.

**Task details:**

- Add `appendMicroEvent()` to `OverrideStoreService`.
- Append generated micro-event raw events to `rawEvents`.
- Advance clock by default.
- Auto-sync with trigger `app_open`.
- Return `{ events, newCurrentTime, eventStart, eventEnd }`.
- Do not add an `ActivitySegment` to `state.segments`.
- Do not inject an event for Active Sensing.

**Files:**

- Modify: `apps/agent-api/src/runtime/override-store.ts`
- Test: `apps/agent-api/src/__tests__/runtime/override-store.test.ts`

**Implementation contract:**

```ts
appendMicroEvent(
  profileId: string,
  microEventType: MicroEventType,
  params?: MicroEventParams,
  options?: { durationMinutes?: number; advanceClock?: boolean },
): { events: DeviceEvent[]; newCurrentTime: string; eventStart: string; eventEnd: string };
```

Add imports:

```ts
import type { MicroEventParams, MicroEventType } from '@health-advisor/shared';
import { appendMicroEvent as sandboxAppendMicroEvent } from '@health-advisor/sandbox';
```

Implementation shape:

```ts
const result = sandboxAppendMicroEvent(
  state.clock.currentTime,
  microEventType,
  profileId,
  params,
  options,
);

const advanceClock = options?.advanceClock !== false;
const updatedState: DemoProfileState = {
  ...state,
  rawEvents: [...state.rawEvents, ...result.events],
  ...(advanceClock ? { clock: { ...state.clock, currentTime: result.newCurrentTime } } : {}),
};

const internalSync = rebuildSyncState(updatedState);
const { state: newSync } = sandboxPerformSync(internalSync, 'app_open', updatedState.clock.currentTime);

demoStateByProfile.set(profileId, {
  ...updatedState,
  syncState: {
    lastSyncedMeasuredAt: newSync.lastSyncedMeasuredAt,
    syncSessions: [...newSync.syncSessions],
  },
});
```

**Tests to add:**

Append to `apps/agent-api/src/__tests__/runtime/override-store.test.ts`:

```ts
it('appendMicroEvent writes synced raw events without adding activity segments', () => {
  const store = createOverrideStore('profile-a', { initialDemoTime: INITIAL_TIME });
  const result = store.appendMicroEvent('profile-a', 'micro_deep_breathing', {
    _baselineRestingHr: 58,
    _baselineHrv: 72,
    _baselineSpo2: 97,
  });

  expect(result.newCurrentTime).toBe('2026-04-21T08:03');
  expect(result.events.length).toBeGreaterThan(0);
  expect(store.getSegments('profile-a')).toEqual([]);
  expect(store.getPendingEvents('profile-a')).toEqual([]);
  expect(store.getSyncedEvents('profile-a').some((event) => event.segmentId?.startsWith('seg-micro-micro_deep_breathing-'))).toBe(true);
});

it('appendMicroEvent keeps profile isolation', () => {
  const store = createOverrideStore('profile-a', { initialDemoTime: INITIAL_TIME });
  store.appendMicroEvent('profile-a', 'micro_short_walk');
  store.appendMicroEvent('profile-b', 'micro_offscreen_eye_rest');

  expect(store.getSyncedEvents('profile-a').some((event) => event.segmentId?.includes('micro_short_walk'))).toBe(true);
  expect(store.getSyncedEvents('profile-b').some((event) => event.segmentId?.includes('micro_offscreen_eye_rest'))).toBe(true);
  expect(store.getSyncedEvents('profile-a').some((event) => event.segmentId?.includes('micro_offscreen_eye_rest'))).toBe(false);
});
```

**Verification commands:**

```bash
pnpm --filter @health-advisor/agent-api test -- src/__tests__/runtime/override-store.test.ts
pnpm --filter @health-advisor/agent-api typecheck
```

**Expected result:** both commands pass.

**Commit:**

```bash
git add apps/agent-api/src/runtime/override-store.ts apps/agent-api/src/__tests__/runtime/override-store.test.ts
git commit -m "feat(agent-api): persist micro event timeline data"
```

### Task C2: GodModeService And micro-event-append Route

**Dependencies:** Task A2, Task C1.

**Context:** Timeline append currently lives at `POST /god-mode/timeline-append`, clears brief cache, and returns `GodModeStateResponse`. Micro-event append should use the same response shape, but must not trigger Active Sensing Banner.

**Task details:**

- Add `GodModeService.appendMicroEvent()`.
- Enrich micro-event params with current profile baseline.
- Call `overrideStore.appendMicroEvent()`.
- Invalidate session analytical memory.
- Add `POST /god-mode/micro-event-append`.
- Validate with `MicroEventAppendPayloadSchema`.
- Clear `app.briefCache` after success.
- Return 400 for invalid micro event types.
- Ensure `activeSensing` remains `null` after micro event append.

**Files:**

- Modify: `apps/agent-api/src/modules/god-mode/service.ts`
- Modify: `apps/agent-api/src/modules/god-mode/routes.ts`
- Test: `apps/agent-api/src/__tests__/modules/god-mode/routes.test.ts`

**Implementation contract:**

Service method:

```ts
appendMicroEvent(
  microEventType: MicroEventType,
  params?: MicroEventParams,
  sessionId?: string,
  options?: { durationMinutes?: number; advanceClock?: boolean },
): GodModeStateResponse {
  const currentProfileId = this.registry.overrideStore.getCurrentProfileId();
  const profile = this.registry.getRawProfile(currentProfileId);
  const baseline = profile.profile?.dailyBaseline ?? profile.profile?.weeklyBaseline ?? profile.profile?.baseline;
  const enrichedParams = {
    ...params,
    ...(baseline ? {
      _baselineRestingHr: baseline.restingHr,
      _baselineHrv: baseline.hrv,
      _baselineSpo2: baseline.spo2,
    } : {}),
  };

  this.registry.overrideStore.appendMicroEvent(currentProfileId, microEventType, enrichedParams, options);
  this.invalidateSessionAnalytical(sessionId);
  return this.getStateForProfile(currentProfileId);
}
```

Route shape:

```ts
app.post('/god-mode/micro-event-append', async (request, reply) => {
  const parsed = MicroEventAppendPayloadSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.status(400).send(
      createErrorResponse(ErrorCode.VALIDATION_ERROR, parsed.error.issues.map((i) => i.message).join('; '), buildMeta(request)),
    );
  }

  const result = service.appendMicroEvent(
    parsed.data.microEventType,
    parsed.data.params,
    request.ctx?.sessionId,
    {
      durationMinutes: parsed.data.durationMinutes,
      advanceClock: parsed.data.advanceClock,
    },
  );
  invalidateBriefCache();
  return createSuccessResponse(result, buildMeta(request));
});
```

**Tests to add:**

Append to `apps/agent-api/src/__tests__/modules/god-mode/routes.test.ts`:

```ts
describe('POST /god-mode/micro-event-append', () => {
  test('追加 deep breathing 微事件返回 200 且不触发 Active Sensing', async () => {
    await app.inject({ method: 'POST', url: '/god-mode/reset', payload: { scope: 'all' } });

    const response = await app.inject({
      method: 'POST',
      url: '/god-mode/micro-event-append',
      payload: {
        microEventType: 'micro_deep_breathing',
        durationMinutes: 3,
        params: { pattern: 'extended_exhale' },
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.success).toBe(true);
    expect(body.data.pendingEventCount).toBe(0);
    expect(body.data.activeSensing).toBeNull();
    expect(body.data.recentRecognizedEvents.some((event: { type: string }) => event.type === 'micro_deep_breathing')).toBe(true);
  });

  test('拒绝 hydration 微事件类型', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/god-mode/micro-event-append',
      payload: { microEventType: 'micro_hydration_break' },
    });

    expect(response.statusCode).toBe(400);
  });
});
```

**Verification commands:**

```bash
pnpm --filter @health-advisor/agent-api test -- src/__tests__/modules/god-mode/routes.test.ts
pnpm --filter @health-advisor/agent-api typecheck
```

**Expected result:** both commands pass.

**Commit:**

```bash
git add apps/agent-api/src/modules/god-mode/service.ts apps/agent-api/src/modules/god-mode/routes.ts apps/agent-api/src/__tests__/modules/god-mode/routes.test.ts
git commit -m "feat(agent-api): add micro event append endpoint"
```

---

## Module D: Agent Action Interaction

### Task D1: ActionIntent Interaction Mapping

**Dependencies:** Task A2.

**Context:** `homepage-event-insights.ts` currently creates `ActionIntentCandidate` objects with text and `productCapability`. This task adds structured interaction fields before the prompt layer, so the LLM only preserves capabilities that the product can execute.

**Task details:**

- Add optional `interaction?: ActionInteraction` to `ActionIntentCandidate`.
- Extend `buildActionIntentCandidates()` to map focus categories and event context to interactions.
- Keep hydration actions as no-interaction unless their text is explicitly a walk action.
- Use natural action titles; avoid technical or unnatural reset/cool-down wording in user-visible copy.
- Use `aiPromise` text based on capability:
  - no interaction: `我会记录你的选择并用于本次建议上下文`
  - micro event: `我会记录这个微行动并更新实时简报`
  - calendar: `我会把它作为日程建议记录在 Demo 中`

**Files:**

- Modify: `packages/agent-core/src/context/context-packet.ts`
- Modify: `packages/agent-core/src/context/homepage-event-insights.ts`
- Test: `packages/agent-core/src/__tests__/context/homepage-event-insights.test.ts`

**Mapping contract:**

| focus category / context | interaction |
| --- | --- |
| `breathing_reset` | `micro_event` -> `micro_deep_breathing` |
| `movement_reset` after meal semantic event | `micro_event` -> `micro_post_meal_walk` |
| `movement_reset` after cardio/hiit semantic event | `micro_event` -> `micro_post_workout_slow_walk` |
| other `movement_reset` | `micro_event` -> `micro_short_walk` |
| `posture` with standing text | `micro_event` -> `micro_standing_stretch` |
| other `posture` | `micro_event` -> `micro_desk_mobility` |
| `nutrition` after workout | `micro_event` -> `micro_post_workout_snack` |
| `nutrition` before workout | `micro_event` -> `micro_pre_workout_snack` |
| `training_adjustment` with cardio wording | `micro_event` -> `micro_easy_cardio` |
| `training_adjustment` with stretch/recovery wording | `micro_event` -> `micro_restorative_stretch` |
| `sleep_protection` with future timing | `calendar` |
| `sleep_protection` with immediate action | `micro_event` -> `micro_sleep_wind_down` |
| `hydration` | no interaction |
| `medical_attention` | no interaction |
| future work planning | `calendar` |

Function shape:

```ts
function interactionForFocus(
  eventType: HomepageSemanticEventType,
  focus: RecommendedFocus,
): ActionInteraction | undefined;
```

`buildActionIntentCandidates()` should receive `eventType` and set:

```ts
const interaction = interactionForFocus(eventType, focus);
return {
  id: `event_${eventType}_action_${index + 1}`,
  emoji: emojiForFocus(focus.category),
  title: titleForFocus(focus, eventType),
  description: describeFocus(focus),
  aiPromise: promiseForInteraction(interaction),
  productCapability: interaction ? 'contextual_followup' : 'record_choice',
  ...(interaction ? { interaction } : {}),
};
```

**Tests to add or update:**

Append to `packages/agent-core/src/__tests__/context/homepage-event-insights.test.ts`:

```ts
it('attaches deep breathing micro event interaction for breathing reset', () => {
  const insights = buildHomepageEventInsights({
    homepage: makeHomepage({
      recentEvents: [{
        recognizedEventId: 're-sedentary-1',
        type: 'prolonged_sedentary',
        start: '2026-06-01T10:00',
        end: '2026-06-01T12:00',
        durationMin: 120,
        confidence: 0.9,
        sourceSegmentId: 'seg-sedentary-1',
        recognitionEvidence: ['久坐'],
        syncState: { lastSyncedMeasuredAt: '2026-06-01T12:00', pendingEventCount: 0, fromSyncedWindow: true },
        evidenceIds: ['event_sedentary'],
      }],
    }),
    demoNow: '2026-06-01T12:05',
  });

  const breathing = insights[0]!.actionIntents.find((action) => action.interaction?.kind === 'micro_event' && action.interaction.microEvent.type === 'micro_deep_breathing');
  expect(breathing).toBeDefined();
  expect(breathing?.title).toMatch(/呼吸/);
  expect(breathing?.title).not.toMatch(/重置/);
});

it('keeps hydration action without timeline interaction', () => {
  const insights = buildHomepageEventInsights({
    homepage: makeHomepage({
      recentEvents: [{
        recognizedEventId: 're-cardio-1',
        type: 'steady_cardio',
        start: '2026-06-01T17:30',
        end: '2026-06-01T18:10',
        durationMin: 40,
        confidence: 0.92,
        sourceSegmentId: 'seg-cardio-1',
        recognitionEvidence: ['有氧运动'],
        syncState: { lastSyncedMeasuredAt: '2026-06-01T18:10', pendingEventCount: 0, fromSyncedWindow: true },
        evidenceIds: ['event_cardio'],
      }],
    }),
    demoNow: '2026-06-01T18:20',
  });

  const hydration = insights[0]!.actionIntents.find((action) => action.title.includes('补水') || action.description.includes('补水'));
  expect(hydration).toBeDefined();
  expect(hydration?.interaction).toBeUndefined();
});

it('attaches calendar interaction for future sleep protection', () => {
  const insights = buildHomepageEventInsights({
    homepage: makeHomepage({
      recentEvents: [{
        recognizedEventId: 're-hiit-1',
        type: 'intermittent_exercise',
        start: '2026-06-01T19:00',
        end: '2026-06-01T19:30',
        durationMin: 30,
        confidence: 0.92,
        sourceSegmentId: 'seg-hiit-1',
        recognitionEvidence: ['间歇训练'],
        syncState: { lastSyncedMeasuredAt: '2026-06-01T19:30', pendingEventCount: 0, fromSyncedWindow: true },
        evidenceIds: ['event_hiit'],
      }],
    }),
    demoNow: '2026-06-01T19:30',
  });

  const sleep = insights[0]!.actionIntents.find((action) => action.interaction?.kind === 'calendar');
  expect(sleep?.interaction).toEqual({
    kind: 'calendar',
    calendar: expect.objectContaining({
      title: expect.any(String),
      timingLabel: expect.any(String),
      durationMinutes: expect.any(Number),
    }),
  });
});
```

Update existing assertions that require every action `productCapability` to be `record_choice` or `contextual_followup`; the new behavior should still satisfy that condition.

**Verification commands:**

```bash
pnpm --filter @health-advisor/agent-core test -- src/__tests__/context/homepage-event-insights.test.ts
pnpm --filter @health-advisor/agent-core typecheck
```

**Expected result:** both commands pass.

**Commit:**

```bash
git add packages/agent-core/src/context/context-packet.ts packages/agent-core/src/context/homepage-event-insights.ts packages/agent-core/src/__tests__/context/homepage-event-insights.test.ts
git commit -m "feat(agent-core): attach action interactions"
```

### Task D2: Prompt Rendering And Response Parser Validation

**Dependencies:** Task D1.

**Context:** The prompt currently renders only action candidate title strings, and `response-parser.ts` manually validates only the base text fields. This task makes interaction preservation explicit and strictly validated.

**Task details:**

- Render action candidates with `interaction` JSON when available.
- Update homepage output example with `interaction`.
- Add prompt constraints:
  - preserve candidate `interaction` exactly when using the candidate.
  - do not invent calendar/micro-event capabilities.
  - do not assign micro_event to补水/喝水/调暗灯光/调温/洗澡 actions.
- Update `parseAgentResponse()` to validate each action through `ActionOptionSchema`.
- Invalid `interaction` returns parse failure.
- Ensure `cleanSafetyIssues()` keeps `interaction` via existing object spread.

**Files:**

- Modify: `packages/agent-core/src/prompts/context-packet-renderer.ts`
- Modify: `packages/agent-core/src/prompts/task-builder.ts`
- Modify: `packages/agent-core/src/output/response-parser.ts`
- Test: `packages/agent-core/src/__tests__/output/response-parser.test.ts`
- Test: `packages/agent-core/src/__tests__/context/context-packet-renderer.test.ts` if the file exists; otherwise add tests to the nearest existing renderer test file.

**Renderer contract:**

Replace action candidate rendering with a detail-preserving line:

```ts
if (insight.actionIntents.length > 0) {
  lines.push(`  - ${t(locale, 'actions 候选', 'Action candidates')}${colon(locale)}`);
  for (const action of insight.actionIntents) {
    const interaction = action.interaction ? ` interaction=${JSON.stringify(action.interaction)}` : ' interaction=none';
    lines.push(`    - ${action.emoji}${action.title} | ${action.description} | aiPromise=${action.aiPromise} | ${interaction}`);
  }
}
```

Parser contract:

```ts
const parsedAction = ActionOptionSchema.safeParse(item);
if (!parsedAction.success) {
  return {
    success: false,
    error: `actions 中包含非法项: ${parsedAction.error.issues.map((i) => i.message).join(', ')}`,
    raw,
  };
}
validatedActions.push(parsedAction.data);
```

Then set:

```ts
actions = validatedActions.length > 0 ? validatedActions : [];
```

**Tests to add:**

Append to `packages/agent-core/src/__tests__/output/response-parser.test.ts`:

```ts
it('parses action interactions from LLM output', () => {
  const raw = JSON.stringify({
    summary: '测试',
    chartTokens: [],
    actions: [{
      id: 'a1',
      emoji: '🫁',
      title: '做几次深呼吸',
      description: '现在做 3 分钟缓慢呼吸',
      aiPromise: '我会记录这个微行动并更新实时简报',
      interaction: {
        kind: 'micro_event',
        microEvent: { type: 'micro_deep_breathing', durationMinutes: 3, params: { pattern: 'extended_exhale' } },
      },
    }],
  });

  const result = parseAgentResponse(raw, {
    taskType: AgentTaskType.HOMEPAGE_SUMMARY,
    pageContext: basePageContext,
  });

  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.envelope.actions?.[0]?.interaction).toEqual({
      kind: 'micro_event',
      microEvent: { type: 'micro_deep_breathing', durationMinutes: 3, params: { pattern: 'extended_exhale' } },
    });
  }
});

it('rejects invalid action interaction from LLM output', () => {
  const raw = JSON.stringify({
    summary: '测试',
    chartTokens: [],
    actions: [{
      id: 'a1',
      emoji: '💧',
      title: '补水',
      description: '喝一杯水',
      aiPromise: '我会记录你的选择并用于本次建议上下文',
      interaction: {
        kind: 'micro_event',
        microEvent: { type: 'micro_hydration_break' },
      },
    }],
  });

  const result = parseAgentResponse(raw, {
    taskType: AgentTaskType.HOMEPAGE_SUMMARY,
    pageContext: basePageContext,
  });

  expect(result.success).toBe(false);
});
```

Add or update renderer test to assert:

```ts
expect(rendered).toContain('"kind":"micro_event"');
expect(rendered).toContain('"type":"micro_deep_breathing"');
expect(rendered).toContain('interaction=none');
```

**Verification commands:**

```bash
pnpm --filter @health-advisor/agent-core test -- src/__tests__/output/response-parser.test.ts
pnpm --filter @health-advisor/agent-core test -- src/__tests__/context
pnpm --filter @health-advisor/agent-core typecheck
```

**Expected result:** commands pass, and parser still accepts actions without `interaction`.

**Commit:**

```bash
git add packages/agent-core/src/prompts/context-packet-renderer.ts packages/agent-core/src/prompts/task-builder.ts packages/agent-core/src/output/response-parser.ts packages/agent-core/src/__tests__/output/response-parser.test.ts packages/agent-core/src/__tests__/context
git commit -m "feat(agent-core): preserve action interaction output"
```

---

## Module E: Web Interaction

### Task E1: Web Hook For Micro-Event Action Append

**Dependencies:** Task A2, Task C2.

**Context:** `useGodModeActions()` already knows how to invalidate God Mode, homepage, and data center queries after timeline changes. Action clicks also need to force `POST /ai/morning-brief` with `bustCache=true`.

**Task details:**

- Add `appendMicroEventAction` mutation to `use-god-mode-actions.ts` or wrap it in a new `use-action-interactions.ts`.
- Use endpoint `/god-mode/micro-event-append`.
- Sync Active Sensing state from response; micro events should hide banner because response `activeSensing` is null.
- Invalidate `homepage`, `dataCenter`, and `godMode` query keys.
- Add a higher-level `useActionInteractions(profileId)` hook that:
  - handles no-interaction action selection with current toast.
  - handles calendar button click with Demo toast and local added state.
  - handles micro-event action click with API call, toast, query invalidation, and `refetchBrief.mutateAsync()`.

**Files:**

- Modify: `apps/web/src/hooks/use-god-mode-actions.ts`
- Create: `apps/web/src/hooks/use-action-interactions.ts`
- Test: no existing hook test harness covers React Query mutations; validation is done in Task E2 and F1.

**Implementation contract:**

`use-god-mode-actions.ts` imports:

```ts
import type { MicroEventAppendPayload } from '@health-advisor/shared';
```

Mutation:

```ts
const appendMicroEventMutation = useMutation({
  mutationFn: async (payload: MicroEventAppendPayload) => {
    return apiClient.post<GodModeStateResponse>('/god-mode/micro-event-append', payload);
  },
  onSuccess: (state) => {
    setProfileId(state.currentProfileId);
    syncActiveSensingBanner(state.activeSensing);
    queryClient.invalidateQueries({ queryKey: queryKeys.homepage.all });
    queryClient.invalidateQueries({ queryKey: queryKeys.dataCenter.all });
    queryClient.invalidateQueries({ queryKey: queryKeys.godMode.all });
  },
});
```

Return:

```ts
appendMicroEvent: appendMicroEventMutation.mutateAsync,
isAppendingMicroEvent: appendMicroEventMutation.isPending,
```

New hook:

```ts
// apps/web/src/hooks/use-action-interactions.ts
'use client';

import { useState } from 'react';
import type { ActionOption } from '@health-advisor/shared';
import { useRefetchBrief } from '@/hooks/use-ai-query';
import { useGodModeActions } from '@/hooks/use-god-mode-actions';
import { useUIStore } from '@/stores/ui.store';

export function useActionInteractions(profileId: string | undefined) {
  const { showToast } = useUIStore();
  const refetchBrief = useRefetchBrief(profileId);
  const { appendMicroEvent, isAppendingMicroEvent } = useGodModeActions();
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);
  const [selectedActionIds, setSelectedActionIds] = useState<Set<string>>(() => new Set());
  const [calendarActionIds, setCalendarActionIds] = useState<Set<string>>(() => new Set());

  async function selectAction(action: ActionOption) {
    if (action.interaction?.kind !== 'micro_event') {
      setSelectedActionIds((prev) => new Set(prev).add(action.id));
      showToast(`${action.title}：已记录`, 'success');
      return;
    }

    setPendingActionId(action.id);
    try {
      await appendMicroEvent({
        microEventType: action.interaction.microEvent.type,
        durationMinutes: action.interaction.microEvent.durationMinutes,
        params: action.interaction.microEvent.params,
        advanceClock: true,
      });
      setSelectedActionIds((prev) => new Set(prev).add(action.id));
      showToast('已记录，正在更新实时简报', 'success');
      await refetchBrief.mutateAsync();
    } catch (error) {
      const message = error instanceof Error ? error.message : '微行动记录失败';
      showToast(message, 'error');
    } finally {
      setPendingActionId(null);
    }
  }

  function addCalendarAction(action: ActionOption) {
    setCalendarActionIds((prev) => new Set(prev).add(action.id));
    showToast('已添加进日程（Demo）', 'success');
  }

  return {
    selectAction,
    addCalendarAction,
    pendingActionId,
    selectedActionIds,
    calendarActionIds,
    isBusy: isAppendingMicroEvent || refetchBrief.isPending,
  };
}
```

**Verification commands:**

```bash
pnpm --filter @health-advisor/web typecheck
```

**Expected result:** typecheck passes.

**Commit:**

```bash
git add apps/web/src/hooks/use-god-mode-actions.ts apps/web/src/hooks/use-action-interactions.ts
git commit -m "feat(web): add action interaction hook"
```

### Task E2: ActionOptions UI Branch And Brief Refresh Wiring

**Dependencies:** Task E1, Task D2.

**Context:** `ActionOptions` currently owns local selected state and calls `onSelect`. It needs enough state passed in to show selected/pending/calendar states while keeping no-interaction actions unchanged.

**Task details:**

- Replace local `selectedId` in `ActionOptions` with props from `useActionInteractions`.
- For `calendar` actions:
  - Show a small “添加进日程” button beside the title/description area.
  - Button uses `event.stopPropagation()`.
  - Button does not call backend, does not refresh brief, does not change timeline.
  - After click, button can show “已添加”.
- For `micro_event` actions:
  - Main card click calls `selectAction(action)`.
  - Show pending text while API and brief regeneration are running.
  - Disable repeated clicks for pending action.
- For no-interaction actions:
  - Preserve current selected/toast behavior.
- Wire `HomePage` to `useActionInteractions(currentProfileId)` and pass props through `MorningBriefCard`.

**Files:**

- Modify: `apps/web/src/components/homepage/ActionOptions.tsx`
- Modify: `apps/web/src/components/homepage/MorningBriefCard.tsx`
- Modify: `apps/web/src/app/page.tsx`
- Test: `apps/web/e2e/action-interactions.spec.ts`

**Component contract:**

`ActionOptionsProps`:

```ts
interface ActionOptionsProps {
  actions: ActionOption[];
  sectionTitle?: string;
  onSelect: (action: ActionOption) => void | Promise<void>;
  onAddCalendar: (action: ActionOption) => void;
  pendingActionId?: string | null;
  selectedActionIds: ReadonlySet<string>;
  calendarActionIds: ReadonlySet<string>;
  disabled?: boolean;
}
```

Calendar button render:

```tsx
{action.interaction?.kind === 'calendar' && (
  <button
    type="button"
    onClick={(event) => {
      event.stopPropagation();
      onAddCalendar(action);
    }}
    className="ml-2 shrink-0 rounded border border-slate-600 px-2 py-1 text-[11px] font-semibold text-slate-300 hover:border-emerald-500 hover:text-emerald-300"
  >
    {calendarActionIds.has(action.id) ? '已添加' : '添加进日程'}
  </button>
)}
```

Micro-event status render:

```tsx
{pendingActionId === action.id ? (
  <div className="text-xs text-emerald-400 mt-2">正在更新实时简报...</div>
) : selectedActionIds.has(action.id) ? (
  <div className="text-xs text-emerald-400 mt-2">已记录</div>
) : null}
```

`HomePage` wiring:

```tsx
const actionInteractions = useActionInteractions(currentProfileId);
const briefIsLoading = isLoading || isFetching || refetchBrief.isPending;
```

Pass into `MorningBriefCard`:

```tsx
onActionSelect: actionInteractions.selectAction,
onAddCalendarAction: actionInteractions.addCalendarAction,
pendingActionId: actionInteractions.pendingActionId,
selectedActionIds: actionInteractions.selectedActionIds,
calendarActionIds: actionInteractions.calendarActionIds,
actionsDisabled: actionInteractions.isBusy,
```

Keep `MorningBriefCard` loading state tied to `briefIsLoading`, not `actionInteractions.isBusy`, so a clicked micro-event action can show its pending row state instead of immediately replacing the whole card with a skeleton.

**E2E test to add:**

`apps/web/e2e/action-interactions.spec.ts`:

```ts
import { expect, test } from '@playwright/test';

test.describe('Homepage action interactions', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('calendar action shows add-to-schedule demo button without opening active sensing', async ({ page }) => {
    const calendarButton = page.getByRole('button', { name: '添加进日程' }).first();
    if (!(await calendarButton.isVisible().catch(() => false))) {
      test.skip(true, 'Current brief did not produce a calendar action in this environment');
      return;
    }

    await calendarButton.click();

    await expect(page.getByText('已添加进日程（Demo）')).toBeVisible();
    await expect(page.getByRole('button', { name: '已添加' }).first()).toBeVisible();
    await expect(page.getByText('AI Proactive Insight')).not.toBeVisible();
  });

  test('micro event action updates realtime brief and does not show active sensing banner', async ({ page }) => {
    const microAction = page.getByText(/深呼吸|起身走|饭后走|慢走|离屏|肩颈|拉伸|低刺激/).first();
    if (!(await microAction.isVisible().catch(() => false))) {
      test.skip(true, 'Current brief did not produce a micro event action in this environment');
      return;
    }

    await microAction.click();

    await expect(page.getByText('正在更新实时简报...')).toBeVisible();
    await expect(page.getByText('已记录，正在更新实时简报')).toBeVisible();
    await expect(page.getByText('AI Proactive Insight')).not.toBeVisible();
  });
});
```

**Verification commands:**

```bash
pnpm --filter @health-advisor/web typecheck
pnpm --filter @health-advisor/web test:e2e -- action-interactions.spec.ts
```

**Expected result:** typecheck passes. E2E passes when the generated brief contains calendar/micro-event actions; tests skip only when the current generated brief legitimately lacks that action class.

**Commit:**

```bash
git add apps/web/src/components/homepage/ActionOptions.tsx apps/web/src/components/homepage/MorningBriefCard.tsx apps/web/src/app/page.tsx apps/web/e2e/action-interactions.spec.ts
git commit -m "feat(web): render actionable brief suggestions"
```

---

## Module F: Integration Verification

### Task F1: End-to-End Action Interaction Verification

**Dependencies:** Tasks A1, A2, B1, B2, C1, C2, D1, D2, E1, E2.

**Context:** Unit tests prove each layer. This task verifies the full data path: action interaction -> micro-event append -> synced raw events -> recognized micro event -> brief regeneration.

**Task details:**

- Add one API integration test that calls micro-event append, then `/ai/morning-brief` with `bustCache=true`, and verifies the brief returns a valid envelope after the new event.
- Add one agent-core test that a recent micro event is normalized/rendered coherently enough for the homepage context. If `normalizeHomepageEventType()` maps micro events to `unknown`, assert the prompt still renders the raw micro event type and action candidates; do not force micro events into main activity categories.
- Run package-level targeted tests.
- Run repo typecheck.

**Files:**

- Modify: `apps/agent-api/src/__tests__/integration/api-consistency.test.ts` or add a focused test under `apps/agent-api/src/__tests__/modules/ai/routes.test.ts`
- Modify: `packages/agent-core/src/__tests__/context/homepage-event-insights.test.ts` or add renderer test beside existing context tests

**API integration test contract:**

```ts
it('micro event append can be followed by bust-cache morning brief regeneration', async () => {
  await app.inject({ method: 'POST', url: '/god-mode/reset', payload: { scope: 'all' } });

  const appendResponse = await app.inject({
    method: 'POST',
    url: '/god-mode/micro-event-append',
    payload: { microEventType: 'micro_deep_breathing', durationMinutes: 3 },
  });

  expect(appendResponse.statusCode).toBe(200);
  expect(appendResponse.json().data.recentRecognizedEvents.some((event: { type: string }) => event.type === 'micro_deep_breathing')).toBe(true);

  const briefResponse = await app.inject({
    method: 'POST',
    url: '/ai/morning-brief',
    payload: {
      profileId: 'profile-a',
      pageContext: { profileId: 'profile-a', page: 'homepage', timeframe: 'week' },
      bustCache: true,
    },
  });

  expect(briefResponse.statusCode).toBe(200);
  const body = briefResponse.json();
  expect(body.success).toBe(true);
  expect(body.data.summary).toEqual(expect.any(String));
  expect(Array.isArray(body.data.chartTokens)).toBe(true);
});
```

**Verification commands:**

```bash
pnpm --filter @health-advisor/shared test
pnpm --filter @health-advisor/sandbox test
pnpm --filter @health-advisor/agent-api test
pnpm --filter @health-advisor/agent-core test
pnpm --filter @health-advisor/web typecheck
pnpm typecheck
```

Manual browser verification after automated tests:

```bash
pnpm --filter @health-advisor/web dev
```

Open `http://localhost:3000` and verify:

- Calendar action shows “添加进日程”.
- Calendar button click shows “已添加进日程（Demo）”.
- Calendar button click does not change Active Sensing Banner.
- Micro-event action click shows pending state and then “已记录”.
- Micro-event action click changes God Mode recent recognized events to include the micro event.
- The realtime brief regenerates after the click.
- Hydration-only action click only records selection and does not call `/god-mode/micro-event-append`.

**Commit:**

```bash
git add apps/agent-api/src/__tests__/integration/api-consistency.test.ts apps/agent-api/src/__tests__/modules/ai/routes.test.ts packages/agent-core/src/__tests__/context
git commit -m "test: cover action micro event integration"
```

---

## Cross-Module Acceptance Criteria

- Shared contract exports `MicroEventType`, `MicroEventTypeSchema`, `ActionInteraction`, `ActionInteractionSchema`, `MicroEventAppendPayload`, and `MicroEventAppendPayloadSchema`.
- `MicroEventTypeSchema` accepts exactly the 14 planned micro events.
- `micro_hydration_break`, `micro_breathing_reset`, `micro_walk_reset`, and `micro_cooldown_walk` are rejected everywhere.
- `ActionOption` without `interaction` remains valid.
- Calendar action interaction never calls backend from the UI.
- Micro-event action interaction calls `POST /god-mode/micro-event-append`.
- Micro-event append writes synced raw `DeviceEvent[]`, advances demo clock by default, and leaves pending events empty.
- Micro-event append does not mutate `segments` and does not trigger Active Sensing Banner.
- `recognizeEvents()` returns recognized micro events for `seg-micro-*` event groups.
- Homepage brief regeneration uses `bustCache=true` after micro-event action click.
- Hydration-only actions keep the existing “record choice” interaction and do not alter timeline.
- User-visible action titles use natural daily phrasing such as “做几次深呼吸”, “起身走几分钟”, “运动后慢走几分钟”.

## Final Verification Checklist

Run before considering implementation complete:

```bash
pnpm --filter @health-advisor/shared test
pnpm --filter @health-advisor/sandbox test
pnpm --filter @health-advisor/agent-api test
pnpm --filter @health-advisor/agent-core test
pnpm --filter @health-advisor/web typecheck
pnpm typecheck
```

Optional browser check:

```bash
pnpm --filter @health-advisor/web test:e2e -- action-interactions.spec.ts
```

If the e2e test skips because the current generated brief lacks a calendar or micro-event action, use God Mode timeline controls to create a sedentary/workout context, refresh the brief, and rerun the e2e command.
