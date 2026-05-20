# Caffeine Sleep Impact Tool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `estimateCaffeineSleepImpact` and wire it into the realtime homepage brief so caffeine sleep impact is included only when a `possible_caffeine_intake` event exists.

**Architecture:** The Tool lives in `packages/agent-core/src/tools` and consumes only `TaskContextPacket.homepage.recentEvents`. Homepage brief uses a deterministic pre-prompt collection step in `executeAgent`: for `HOMEPAGE_SUMMARY`, if the packet contains `possible_caffeine_intake`, execute the Tool and append its structured result to the task prompt; otherwise skip the Tool entirely. This keeps the LLM from inventing caffeine impact when no event exists.

**Tech Stack:** TypeScript, Zod, Vitest, existing `ToolDefinition` interface, existing `AgentRuntime` homepage prompt pipeline.

---

## Context Summary

The approved design spec is `docs/superpowers/specs/2026-05-18-caffeine-sleep-impact-tool-design.md`.

Existing relevant files:

- `packages/agent-core/src/tools/tool-types.ts`: defines `ToolDefinition`, `ToolExecutionContext`, and `ToolResult`.
- `packages/agent-core/src/tools/query-timeline-events.ts`: closest existing Tool pattern.
- `packages/agent-core/src/tools/index.ts`: exports Tool implementations.
- `packages/agent-core/src/index.ts`: package-level exports consumed by `apps/agent-api`.
- `apps/agent-api/src/runtime/registry.ts`: registers ReAct tools.
- `packages/agent-core/src/runtime/agent-runtime.ts`: builds context, builds packet, builds prompt, invokes LLM.
- `packages/agent-core/src/prompts/task-builder.ts`: renders homepage prompt using `TaskContextPacket`.
- `data/sandbox/prompts/homepage.md` and `data/sandbox/prompts/homepage/template.md`: homepage writing rules.

Existing caffeine path:

- `packages/sandbox/src/helpers/caffeine-detector.ts` emits `possible_caffeine_intake`.
- `packages/agent-core/src/context/context-packet-builder.ts` exposes recognized events as `packet.homepage.recentEvents`.
- Homepage prompt already requires probabilistic language for `possible_caffeine_intake`.

Important product constraints:

- The Tool must never claim measured blood caffeine concentration.
- User-facing language may say "估算咖啡因剩余比例" or "估算体内咖啡因负荷".
- Tool output must set `basis: 'physiological_proxy'` and `measuredChemically: false`.
- If there is no `possible_caffeine_intake`, homepage brief must not call the Tool and must not mention caffeine sleep-impact estimates.

## File Structure

Create:

- `packages/agent-core/src/tools/estimate-caffeine-sleep-impact.ts`
  - Owns Tool input/output schemas, event selection, exponential decay math, risk classification, and supportive advice generation.
- `packages/agent-core/src/tools/__tests__/estimate-caffeine-sleep-impact.test.ts`
  - Unit tests for Tool behavior and math.
- `packages/agent-core/src/runtime/homepage-tool-evidence.ts`
  - Owns homepage-specific conditional Tool collection and prompt rendering for Tool results.
- `packages/agent-core/src/runtime/__tests__/homepage-tool-evidence.test.ts`
  - Unit tests for conditional collection and prompt rendering.

Modify:

- `packages/agent-core/src/tools/index.ts`
  - Export the new Tool.
- `packages/agent-core/src/index.ts`
  - Export the new Tool from package root.
- `apps/agent-api/src/runtime/registry.ts`
  - Register `estimateCaffeineSleepImpactTool` in the ReAct Tool map.
- `packages/agent-core/src/runtime/agent-runtime.ts`
  - For homepage summaries, conditionally collect Tool evidence after packet construction and before prompt construction.
- `packages/agent-core/src/__tests__/runtime/agent-runtime.test.ts`
  - Verify homepage prompt includes caffeine Tool result only when caffeine event exists.
- `data/sandbox/prompts/homepage.md`
  - Add a short rule telling the LLM how to use the Tool result when present.
- `data/sandbox/prompts/homepage/template.md`
  - Mirror the rule in the template prompt.

---

## Module 1: Tool Implementation

### Task 1: Add Unit Tests For `estimateCaffeineSleepImpact`

**Files:**

- Create: `packages/agent-core/src/tools/__tests__/estimate-caffeine-sleep-impact.test.ts`
- Create later in Task 2: `packages/agent-core/src/tools/estimate-caffeine-sleep-impact.ts`

**Task details:**

Write tests first. The Tool must:

- Return `hasCaffeineEvent: false` with no caffeine event.
- Select the latest `possible_caffeine_intake` before the target sleep time.
- Calculate `remainingRatioAtSleep` using a 5-hour half-life.
- Classify low, moderate, and high sleep risk.
- Keep `basis: 'physiological_proxy'` and `measuredChemically: false`.
- Include limited-evidence language when confidence is below `0.8`.

- [ ] **Step 1: Create the failing test file**

Add this file:

```ts
import { describe, expect, it } from 'vitest';
import type { TaskContextPacket, RecentEventPacket } from '../../context/context-packet';
import type { AgentContext } from '../../types/agent-context';
import type { ToolExecutionContext } from '../tool-types';
import { estimateCaffeineSleepImpactTool } from '../estimate-caffeine-sleep-impact';

function makeEvent(overrides: Partial<RecentEventPacket> = {}): RecentEventPacket {
  return {
    type: 'possible_caffeine_intake',
    start: '2026-05-19T16:00',
    end: '2026-05-19T18:00',
    durationMin: 120,
    confidence: 0.84,
    syncState: {
      lastSyncedMeasuredAt: '2026-05-19T18:00',
      pendingEventCount: 0,
      fromSyncedWindow: true,
    },
    evidenceIds: ['event_possible_caffeine_intake_1'],
    ...overrides,
  };
}

function makePacket(events: RecentEventPacket[] = []): TaskContextPacket {
  return {
    task: { type: 'homepage_summary', page: 'home' },
    userContext: {
      profileId: 'profile-a',
      name: '林巅峰',
      age: 28,
      tags: [],
      baselines: {
        restingHR: 48,
        hrv: 95,
        spo2: 99,
        avgSleepMinutes: 465,
        avgSteps: 12000,
      },
    },
    dataWindow: {
      start: '2026-05-13',
      end: '2026-05-19',
      recordCount: 7,
      completenessPct: 100,
    },
    missingData: [],
    evidence: [],
    visibleCharts: [],
    homepage: {
      recentEvents: events,
      latest24h: { date: '2026-05-19', metrics: [] },
      trend7d: [],
      rulesInsights: [],
      suggestedChartTokens: [],
    },
  };
}

function makeContext(packet: TaskContextPacket): ToolExecutionContext {
  return {
    packet,
    context: {
      profile: packet.userContext,
      task: { type: 'homepage_summary', pageContext: { page: 'home', profileId: 'profile-a' } },
      dataWindow: {
        start: packet.dataWindow.start,
        end: packet.dataWindow.end,
        records: [],
        missingFields: [],
      },
      signals: {
        overallStatus: 'green',
        anomalies: [],
        trends: [],
        events: [],
        lowData: false,
      },
      memory: { recentMessages: [] },
      demoNow: '2026-05-19T18:30',
      locale: 'zh',
    } as AgentContext,
  };
}

describe('estimateCaffeineSleepImpactTool', () => {
  it('returns no estimate when there is no possible_caffeine_intake event', async () => {
    const ctx = makeContext(makePacket([]));

    const result = await estimateCaffeineSleepImpactTool.execute({ targetSleepTime: '2026-05-19T23:00' }, ctx);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ hasCaffeineEvent: false });
      expect(result.evidenceIds).toEqual([]);
    }
  });

  it('estimates caffeine load at target sleep time from the latest eligible caffeine event', async () => {
    const packet = makePacket([
      makeEvent({ start: '2026-05-19T10:00', end: '2026-05-19T12:00', evidenceIds: ['old-event'] }),
      makeEvent({ start: '2026-05-19T16:00', end: '2026-05-19T18:00', evidenceIds: ['latest-event'] }),
    ]);
    const ctx = makeContext(packet);

    const result = await estimateCaffeineSleepImpactTool.execute({ targetSleepTime: '2026-05-19T23:00' }, ctx);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.hasCaffeineEvent).toBe(true);
      expect(result.data.event?.start).toBe('2026-05-19T16:00');
      expect(result.data.estimatedCaffeineLoad?.basis).toBe('physiological_proxy');
      expect(result.data.estimatedCaffeineLoad?.measuredChemically).toBe(false);
      expect(result.data.estimatedCaffeineLoad?.halfLifeHours).toBe(5);
      expect(result.data.estimatedCaffeineLoad?.eliminationRateK).toBeCloseTo(0.139, 3);
      expect(result.data.estimatedCaffeineLoad?.hoursUntilSleep).toBe(7);
      expect(result.data.estimatedCaffeineLoad?.remainingRatioAtSleep).toBeCloseTo(0.38, 2);
      expect(result.data.sleepImpact?.riskLevel).toBe('moderate');
      expect(result.evidenceIds).toEqual(['latest-event']);
    }
  });

  it('classifies low risk when estimated caffeine load is below 25 percent', async () => {
    const ctx = makeContext(makePacket([makeEvent({ start: '2026-05-19T08:00' })]));

    const result = await estimateCaffeineSleepImpactTool.execute({ targetSleepTime: '2026-05-19T23:00' }, ctx);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.estimatedCaffeineLoad?.remainingRatioAtSleep).toBeLessThan(0.25);
      expect(result.data.sleepImpact?.riskLevel).toBe('low');
    }
  });

  it('classifies high risk when estimated caffeine load is above 50 percent', async () => {
    const ctx = makeContext(makePacket([makeEvent({ start: '2026-05-19T19:00' })]));

    const result = await estimateCaffeineSleepImpactTool.execute({ targetSleepTime: '2026-05-19T23:00' }, ctx);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.estimatedCaffeineLoad?.remainingRatioAtSleep).toBeGreaterThan(0.5);
      expect(result.data.sleepImpact?.riskLevel).toBe('high');
    }
  });

  it('discloses limited evidence when confidence is below 0.8', async () => {
    const ctx = makeContext(makePacket([makeEvent({ confidence: 0.74 })]));

    const result = await estimateCaffeineSleepImpactTool.execute({ targetSleepTime: '2026-05-19T23:00' }, ctx);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sleepImpact?.rationale).toContain('摄入证据有限');
      expect(result.data.advice?.tone).toBe('supportive_partner');
    }
  });

  it('uses same-day 23:00 when targetSleepTime is omitted', async () => {
    const ctx = makeContext(makePacket([makeEvent({ start: '2026-05-19T16:00' })]));

    const result = await estimateCaffeineSleepImpactTool.execute({}, ctx);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.estimatedCaffeineLoad?.hoursUntilSleep).toBe(7);
    }
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
pnpm --filter @health-advisor/agent-core test -- src/tools/__tests__/estimate-caffeine-sleep-impact.test.ts
```

Expected:

```text
FAIL  src/tools/__tests__/estimate-caffeine-sleep-impact.test.ts
Cannot find module '../estimate-caffeine-sleep-impact'
```

- [ ] **Step 3: Commit the failing tests**

```bash
git add packages/agent-core/src/tools/__tests__/estimate-caffeine-sleep-impact.test.ts
git commit -m "test(agent): specify caffeine sleep impact tool"
```

### Task 2: Implement `estimateCaffeineSleepImpactTool`

**Files:**

- Create: `packages/agent-core/src/tools/estimate-caffeine-sleep-impact.ts`
- Test: `packages/agent-core/src/tools/__tests__/estimate-caffeine-sleep-impact.test.ts`

**Task details:**

Implement the Tool exactly against the approved spec. Use deterministic math and structured output. Do not infer beverage type or absolute blood concentration.

- [ ] **Step 1: Add the Tool implementation**

Create `packages/agent-core/src/tools/estimate-caffeine-sleep-impact.ts`:

```ts
import { z } from 'zod';
import type { RecentEventPacket } from '../context/context-packet';
import type { ToolDefinition, ToolExecutionContext, ToolResult } from './tool-types';

const DEFAULT_HALF_LIFE_HOURS = 5;
const DEFAULT_TARGET_SLEEP_HOUR = 23;

const CaffeineSleepImpactInputSchema = z.object({
  targetSleepTime: z.string().optional(),
});
type CaffeineSleepImpactInput = z.infer<typeof CaffeineSleepImpactInputSchema>;

const CaffeineSleepImpactOutputSchema = z.object({
  hasCaffeineEvent: z.boolean(),
  event: z.object({
    start: z.string(),
    end: z.string(),
    confidence: z.number(),
  }).optional(),
  estimatedCaffeineLoad: z.object({
    basis: z.literal('physiological_proxy'),
    measuredChemically: z.literal(false),
    halfLifeHours: z.number(),
    eliminationRateK: z.number(),
    hoursUntilSleep: z.number(),
    remainingRatioAtSleep: z.number(),
  }).optional(),
  sleepImpact: z.object({
    riskLevel: z.enum(['low', 'moderate', 'high']),
    rationale: z.string(),
  }).optional(),
  advice: z.object({
    tone: z.literal('supportive_partner'),
    message: z.string(),
  }).optional(),
});
type CaffeineSleepImpactOutput = z.infer<typeof CaffeineSleepImpactOutputSchema>;

export const estimateCaffeineSleepImpactTool: ToolDefinition<CaffeineSleepImpactInput, CaffeineSleepImpactOutput> = {
  name: 'estimateCaffeineSleepImpact',
  description: '基于 possible_caffeine_intake 事件估算目标入睡时间的咖啡因剩余比例和睡眠影响',
  inputSchema: CaffeineSleepImpactInputSchema,
  outputSchema: CaffeineSleepImpactOutputSchema,
  async execute(input, ctx): Promise<ToolResult<CaffeineSleepImpactOutput>> {
    try {
      const targetSleepTime = input.targetSleepTime ?? defaultTargetSleepTime(ctx);
      const targetMs = parseProjectTimestamp(targetSleepTime).getTime();
      const event = selectLatestCaffeineEventBeforeSleep(ctx, targetMs);

      if (!event) {
        return {
          success: true,
          data: { hasCaffeineEvent: false },
          evidenceIds: [],
        };
      }

      const eventStartMs = parseProjectTimestamp(event.start).getTime();
      const hoursUntilSleep = round((targetMs - eventStartMs) / 3_600_000, 2);
      const eliminationRateK = round(Math.log(2) / DEFAULT_HALF_LIFE_HOURS, 3);
      const remainingRatioAtSleep = round(Math.exp(-eliminationRateK * hoursUntilSleep), 2);
      const riskLevel = classifyRisk(remainingRatioAtSleep);
      const evidenceLimited = event.confidence < 0.8;

      return {
        success: true,
        data: {
          hasCaffeineEvent: true,
          event: {
            start: event.start,
            end: event.end,
            confidence: event.confidence,
          },
          estimatedCaffeineLoad: {
            basis: 'physiological_proxy',
            measuredChemically: false,
            halfLifeHours: DEFAULT_HALF_LIFE_HOURS,
            eliminationRateK,
            hoursUntilSleep,
            remainingRatioAtSleep,
          },
          sleepImpact: {
            riskLevel,
            rationale: buildRationale(remainingRatioAtSleep, riskLevel, evidenceLimited),
          },
          advice: {
            tone: 'supportive_partner',
            message: buildAdvice(riskLevel),
          },
        },
        evidenceIds: event.evidenceIds,
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'caffeine_sleep_impact_error',
          message: error instanceof Error ? error.message : '咖啡因睡眠影响估算失败',
        },
      };
    }
  },
};

function defaultTargetSleepTime(ctx: ToolExecutionContext): string {
  const anchor =
    ctx.context.demoNow
    ?? (ctx.packet.homepage?.latest24h.date ? `${ctx.packet.homepage.latest24h.date}T${String(DEFAULT_TARGET_SLEEP_HOUR).padStart(2, '0')}:00` : undefined)
    ?? `${ctx.packet.dataWindow.end}T${String(DEFAULT_TARGET_SLEEP_HOUR).padStart(2, '0')}:00`;

  const datePart = anchor.includes('T') ? anchor.split('T')[0]! : anchor;
  return `${datePart}T${String(DEFAULT_TARGET_SLEEP_HOUR).padStart(2, '0')}:00`;
}

function selectLatestCaffeineEventBeforeSleep(
  ctx: ToolExecutionContext,
  targetSleepMs: number,
): RecentEventPacket | undefined {
  const events = ctx.packet.homepage?.recentEvents ?? [];
  return events
    .filter((event) => event.type === 'possible_caffeine_intake')
    .map((event) => ({ event, startMs: parseProjectTimestamp(event.start).getTime() }))
    .filter(({ startMs }) => startMs < targetSleepMs)
    .sort((a, b) => b.startMs - a.startMs)[0]?.event;
}

function parseProjectTimestamp(value: string): Date {
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) {
    const parsed = new Date(`${value}:00`);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})?$/.test(value)) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  throw new Error(`无效时间格式: ${value}`);
}

function classifyRisk(remainingRatio: number): 'low' | 'moderate' | 'high' {
  if (remainingRatio < 0.25) return 'low';
  if (remainingRatio <= 0.5) return 'moderate';
  return 'high';
}

function buildRationale(
  remainingRatio: number,
  riskLevel: 'low' | 'moderate' | 'high',
  evidenceLimited: boolean,
): string {
  const percent = Math.round(remainingRatio * 100);
  const impact =
    riskLevel === 'high'
      ? '对入睡和深睡的影响可能偏高'
      : riskLevel === 'moderate'
        ? '可能轻到中度影响入睡和深睡比例'
        : '对今晚睡眠的影响预计较低';
  const limited = evidenceLimited ? '摄入证据有限，' : '';
  return `${limited}到目标入睡时间预计仍有约 ${percent}% 的咖啡因负荷，${impact}。该结果基于戒指生理信号估算，不是血液化学实测。`;
}

function buildAdvice(riskLevel: 'low' | 'moderate' | 'high'): string {
  if (riskLevel === 'high') {
    return '今晚建议把睡前 90 分钟留给低刺激活动，避免再摄入含咖啡因饮品，并把训练或高强度工作安排前移。';
  }
  if (riskLevel === 'moderate') {
    return '今晚可以把入睡前 60 分钟留给降刺激活动。如果还想喝热饮，建议换成无咖啡因选项。';
  }
  return '今晚继续保持放松节奏即可，睡前避免追加含咖啡因饮品，让身体自然进入恢复状态。';
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export type { CaffeineSleepImpactInput, CaffeineSleepImpactOutput };
```

- [ ] **Step 2: Run the Tool tests**

Run:

```bash
pnpm --filter @health-advisor/agent-core test -- src/tools/__tests__/estimate-caffeine-sleep-impact.test.ts
```

Expected:

```text
PASS  src/tools/__tests__/estimate-caffeine-sleep-impact.test.ts
```

- [ ] **Step 3: Commit the Tool implementation**

```bash
git add packages/agent-core/src/tools/estimate-caffeine-sleep-impact.ts packages/agent-core/src/tools/__tests__/estimate-caffeine-sleep-impact.test.ts
git commit -m "feat(agent): estimate caffeine sleep impact"
```

### Task 3: Export And Register The Tool

**Files:**

- Modify: `packages/agent-core/src/tools/index.ts`
- Modify: `packages/agent-core/src/index.ts`
- Modify: `apps/agent-api/src/runtime/registry.ts`

**Task details:**

Expose the Tool from `agent-core` and register it in the existing ReAct Tool map. Homepage conditional invocation in Module 2 will call the Tool directly from `agent-core`; registry export keeps the Tool available to the Agent Tool system.

- [ ] **Step 1: Export from `packages/agent-core/src/tools/index.ts`**

Add this export near the existing Tool exports:

```ts
export { estimateCaffeineSleepImpactTool } from './estimate-caffeine-sleep-impact';
export type { CaffeineSleepImpactInput, CaffeineSleepImpactOutput } from './estimate-caffeine-sleep-impact';
```

- [ ] **Step 2: Export from `packages/agent-core/src/index.ts`**

Add this near the existing Tool exports:

```ts
export { estimateCaffeineSleepImpactTool } from './tools/estimate-caffeine-sleep-impact';
export type { CaffeineSleepImpactInput, CaffeineSleepImpactOutput } from './tools/estimate-caffeine-sleep-impact';
```

- [ ] **Step 3: Register in `apps/agent-api/src/runtime/registry.ts`**

Update the import from `@health-advisor/agent-core` to include:

```ts
estimateCaffeineSleepImpactTool,
```

Then add this line next to the other `reactTools.set(...)` calls:

```ts
reactTools.set(estimateCaffeineSleepImpactTool.name, estimateCaffeineSleepImpactTool as ToolDefinition<unknown, unknown>);
```

- [ ] **Step 4: Run package typecheck**

Run:

```bash
pnpm --filter @health-advisor/agent-core typecheck
pnpm --filter @health-advisor/agent-api typecheck
```

Expected:

```text
No TypeScript errors.
```

- [ ] **Step 5: Commit exports and registry**

```bash
git add packages/agent-core/src/tools/index.ts packages/agent-core/src/index.ts apps/agent-api/src/runtime/registry.ts
git commit -m "feat(agent): register caffeine sleep impact tool"
```

---

## Module 2: Homepage Conditional Tool Flow

### Task 4: Add Homepage Tool Evidence Collector Tests

**Files:**

- Create: `packages/agent-core/src/runtime/__tests__/homepage-tool-evidence.test.ts`
- Create later in Task 5: `packages/agent-core/src/runtime/homepage-tool-evidence.ts`

**Task details:**

This module ensures the homepage brief calls the Tool only when a caffeine event exists and renders a prompt section only when the Tool returns an estimate.

- [ ] **Step 1: Create the failing collector test**

Add this file:

```ts
import { describe, expect, it } from 'vitest';
import type { TaskContextPacket, RecentEventPacket } from '../../context/context-packet';
import type { AgentContext } from '../../types/agent-context';
import {
  appendHomepageToolEvidenceToPrompt,
  collectHomepageToolEvidence,
  shouldCollectCaffeineSleepImpact,
} from '../homepage-tool-evidence';

function makeEvent(type: string, confidence = 0.84): RecentEventPacket {
  return {
    type,
    start: '2026-05-19T16:00',
    end: '2026-05-19T18:00',
    durationMin: 120,
    confidence,
    syncState: {
      lastSyncedMeasuredAt: '2026-05-19T18:00',
      pendingEventCount: 0,
      fromSyncedWindow: true,
    },
    evidenceIds: ['event-caffeine'],
  };
}

function makePacket(events: RecentEventPacket[]): TaskContextPacket {
  return {
    task: { type: 'homepage_summary', page: 'home' },
    userContext: {
      profileId: 'profile-a',
      name: '林巅峰',
      age: 28,
      tags: [],
      baselines: {
        restingHR: 48,
        hrv: 95,
        spo2: 99,
        avgSleepMinutes: 465,
        avgSteps: 12000,
      },
    },
    dataWindow: {
      start: '2026-05-13',
      end: '2026-05-19',
      recordCount: 7,
      completenessPct: 100,
    },
    missingData: [],
    evidence: [],
    visibleCharts: [],
    homepage: {
      recentEvents: events,
      latest24h: { date: '2026-05-19', metrics: [] },
      trend7d: [],
      rulesInsights: [],
      suggestedChartTokens: [],
    },
  };
}

function makeContext(): AgentContext {
  return {
    profile: {
      profileId: 'profile-a',
      name: '林巅峰',
      age: 28,
      tags: [],
      baselines: {
        restingHR: 48,
        hrv: 95,
        spo2: 99,
        avgSleepMinutes: 465,
        avgSteps: 12000,
      },
    },
    task: { type: 'homepage_summary', pageContext: { page: 'home', profileId: 'profile-a' } },
    dataWindow: {
      start: '2026-05-13',
      end: '2026-05-19',
      records: [],
      missingFields: [],
    },
    signals: {
      overallStatus: 'green',
      anomalies: [],
      trends: [],
      events: [],
      lowData: false,
    },
    memory: { recentMessages: [] },
    demoNow: '2026-05-19T18:30',
    locale: 'zh',
  } as AgentContext;
}

describe('homepage-tool-evidence', () => {
  it('does not collect caffeine sleep impact when no caffeine event exists', async () => {
    const packet = makePacket([makeEvent('exercise')]);

    expect(shouldCollectCaffeineSleepImpact(packet)).toBe(false);
    await expect(collectHomepageToolEvidence(packet, makeContext())).resolves.toBeUndefined();
  });

  it('collects caffeine sleep impact when possible_caffeine_intake exists', async () => {
    const packet = makePacket([makeEvent('possible_caffeine_intake')]);

    expect(shouldCollectCaffeineSleepImpact(packet)).toBe(true);
    const evidence = await collectHomepageToolEvidence(packet, makeContext());

    expect(evidence?.caffeineSleepImpact.hasCaffeineEvent).toBe(true);
    expect(evidence?.caffeineSleepImpact.estimatedCaffeineLoad?.remainingRatioAtSleep).toBeCloseTo(0.38, 2);
  });

  it('appends a compact Tool result section to homepage prompt', async () => {
    const packet = makePacket([makeEvent('possible_caffeine_intake')]);
    const evidence = await collectHomepageToolEvidence(packet, makeContext());

    const prompt = appendHomepageToolEvidenceToPrompt('base prompt', evidence);

    expect(prompt).toContain('## 已调用工具结果');
    expect(prompt).toContain('estimateCaffeineSleepImpact');
    expect(prompt).toContain('估算咖啡因剩余比例');
    expect(prompt).toContain('不是血液化学实测');
  });

  it('returns original prompt when there is no collected evidence', () => {
    const prompt = appendHomepageToolEvidenceToPrompt('base prompt', undefined);

    expect(prompt).toBe('base prompt');
  });
});
```

- [ ] **Step 2: Run the collector test and verify it fails**

Run:

```bash
pnpm --filter @health-advisor/agent-core test -- src/runtime/__tests__/homepage-tool-evidence.test.ts
```

Expected:

```text
FAIL  src/runtime/__tests__/homepage-tool-evidence.test.ts
Cannot find module '../homepage-tool-evidence'
```

- [ ] **Step 3: Commit the failing collector tests**

```bash
git add packages/agent-core/src/runtime/__tests__/homepage-tool-evidence.test.ts
git commit -m "test(agent): specify homepage caffeine tool evidence"
```

### Task 5: Implement Homepage Tool Evidence Collector

**Files:**

- Create: `packages/agent-core/src/runtime/homepage-tool-evidence.ts`
- Test: `packages/agent-core/src/runtime/__tests__/homepage-tool-evidence.test.ts`

**Task details:**

The collector is intentionally deterministic. It decides whether the Tool should run before any LLM prompt is built. This implements the requirement: "有咖啡因事件摄入时调用工具，没有事件则无需调用该工具".

- [ ] **Step 1: Add the collector implementation**

Create `packages/agent-core/src/runtime/homepage-tool-evidence.ts`:

```ts
import type { TaskContextPacket } from '../context/context-packet';
import type { AgentContext } from '../types/agent-context';
import { estimateCaffeineSleepImpactTool, type CaffeineSleepImpactOutput } from '../tools/estimate-caffeine-sleep-impact';

export interface HomepageToolEvidence {
  caffeineSleepImpact: CaffeineSleepImpactOutput;
}

export function shouldCollectCaffeineSleepImpact(packet: TaskContextPacket): boolean {
  return (packet.homepage?.recentEvents ?? []).some((event) => event.type === 'possible_caffeine_intake');
}

export async function collectHomepageToolEvidence(
  packet: TaskContextPacket,
  context: AgentContext,
): Promise<HomepageToolEvidence | undefined> {
  if (packet.task.type !== 'homepage_summary') return undefined;
  if (!shouldCollectCaffeineSleepImpact(packet)) return undefined;

  const result = await estimateCaffeineSleepImpactTool.execute({}, { packet, context });
  if (!result.success) return undefined;
  if (!result.data.hasCaffeineEvent) return undefined;

  return {
    caffeineSleepImpact: result.data,
  };
}

export function appendHomepageToolEvidenceToPrompt(
  taskPrompt: string,
  evidence: HomepageToolEvidence | undefined,
): string {
  if (!evidence) return taskPrompt;

  const impact = evidence.caffeineSleepImpact;
  const load = impact.estimatedCaffeineLoad;
  const sleepImpact = impact.sleepImpact;
  const advice = impact.advice;

  if (!load || !sleepImpact || !advice || !impact.event) return taskPrompt;

  const percent = Math.round(load.remainingRatioAtSleep * 100);
  const lines = [taskPrompt, '', '## 已调用工具结果'];
  lines.push('- 工具: estimateCaffeineSleepImpact');
  lines.push(`- 事件: possible_caffeine_intake, start=${impact.event.start}, confidence=${Math.round(impact.event.confidence * 100)}%`);
  lines.push(`- 估算咖啡因剩余比例: ${percent}%`);
  lines.push(`- 估算依据: ${load.basis}, measuredChemically=${load.measuredChemically}`);
  lines.push(`- 半衰期模型: halfLifeHours=${load.halfLifeHours}, hoursUntilSleep=${load.hoursUntilSleep}, eliminationRateK=${load.eliminationRateK}`);
  lines.push(`- 睡眠影响等级: ${sleepImpact.riskLevel}`);
  lines.push(`- 睡眠影响解释: ${sleepImpact.rationale}`);
  lines.push(`- 支持型建议: ${advice.message}`);
  lines.push('- 写作要求: 如果 summary 提到该结果，必须说“估算咖啡因剩余比例”或“估算体内咖啡因负荷”，并说明这不是血液化学实测。不得说确认摄入咖啡因、血液咖啡因浓度、一定失眠。');

  return lines.join('\n');
}
```

- [ ] **Step 2: Run collector tests**

Run:

```bash
pnpm --filter @health-advisor/agent-core test -- src/runtime/__tests__/homepage-tool-evidence.test.ts
```

Expected:

```text
PASS  src/runtime/__tests__/homepage-tool-evidence.test.ts
```

- [ ] **Step 3: Commit collector implementation**

```bash
git add packages/agent-core/src/runtime/homepage-tool-evidence.ts packages/agent-core/src/runtime/__tests__/homepage-tool-evidence.test.ts
git commit -m "feat(agent): collect homepage caffeine tool evidence"
```

### Task 6: Wire Conditional Tool Collection Into Homepage Runtime

**Files:**

- Modify: `packages/agent-core/src/runtime/agent-runtime.ts`
- Modify: `packages/agent-core/src/__tests__/runtime/agent-runtime.test.ts`
- Test helper context: existing `makeDeps`, `makeRequest`, and `executeAgent` tests in the same test file.

**Task details:**

After `TaskContextPacket` is built, collect homepage Tool evidence only for homepage summaries with caffeine events. Append the Tool section before invoking the model. No caffeine event means no Tool section in the prompt.

- [ ] **Step 1: Add failing runtime tests**

Append these tests inside `describe('executeAgent', () => { ... })` in `packages/agent-core/src/__tests__/runtime/agent-runtime.test.ts`:

```ts
  it('homepage summary appends caffeine sleep impact tool result when caffeine event exists', async () => {
    const invokeMock = vi.fn(async () => ({
      content: JSON.stringify({
        summary: '林巅峰，检测到一次可能的咖啡因摄入响应，估算咖啡因剩余比例仍可能影响今晚睡眠。',
        chartTokens: [ChartTokenId.HRV_7DAYS],
        microTips: [],
      }),
    }));
    const deps = makeDeps({ invoke: invokeMock });

    await executeAgent(
      makeRequest(),
      deps,
      5_000,
      {
        onPacketBuilt(packet) {
          packet.homepage!.recentEvents.push({
            type: 'possible_caffeine_intake',
            start: '2026-04-24T16:00',
            end: '2026-04-24T18:00',
            durationMin: 120,
            confidence: 0.84,
            syncState: {
              lastSyncedMeasuredAt: '2026-04-24T18:00',
              pendingEventCount: 0,
              fromSyncedWindow: true,
            },
            evidenceIds: ['event-caffeine-runtime'],
          });
        },
      },
    );

    const userPrompt = (invokeMock.mock.calls as unknown as Array<Array<{ userPrompt: string }>>)[0]![0]!.userPrompt;
    expect(userPrompt).toContain('## 已调用工具结果');
    expect(userPrompt).toContain('estimateCaffeineSleepImpact');
    expect(userPrompt).toContain('估算咖啡因剩余比例');
    expect(userPrompt).toContain('不是血液化学实测');
  });

  it('homepage summary does not append caffeine tool result when no caffeine event exists', async () => {
    const invokeMock = vi.fn(async () => ({
      content: JSON.stringify({
        summary: '整体状态良好。',
        chartTokens: [ChartTokenId.HRV_7DAYS],
        microTips: [],
      }),
    }));
    const deps = makeDeps({ invoke: invokeMock });

    await executeAgent(makeRequest(), deps);

    const userPrompt = (invokeMock.mock.calls as unknown as Array<Array<{ userPrompt: string }>>)[0]![0]!.userPrompt;
    expect(userPrompt).not.toContain('## 已调用工具结果');
    expect(userPrompt).not.toContain('estimateCaffeineSleepImpact');
  });
```

- [ ] **Step 2: Run runtime tests and verify the caffeine test fails**

Run:

```bash
pnpm --filter @health-advisor/agent-core test -- src/__tests__/runtime/agent-runtime.test.ts
```

Expected:

```text
FAIL  src/__tests__/runtime/agent-runtime.test.ts
Expected userPrompt to contain "## 已调用工具结果"
```

- [ ] **Step 3: Modify runtime imports**

In `packages/agent-core/src/runtime/agent-runtime.ts`, add:

```ts
import {
  appendHomepageToolEvidenceToPrompt,
  collectHomepageToolEvidence,
} from './homepage-tool-evidence';
```

- [ ] **Step 4: Append homepage Tool evidence before model invocation**

Find this block:

```ts
    // 5. 构建 prompts（传入 packet）
    const systemPrompt = buildSystemPrompt(context, deps.promptLoader, packet.missingData);
    let taskPrompt = buildTaskPrompt(context, deps.promptLoader, rulesResult, packet);
```

Replace it with:

```ts
    // 5. 构建 prompts（传入 packet）
    const systemPrompt = buildSystemPrompt(context, deps.promptLoader, packet.missingData);
    let taskPrompt = buildTaskPrompt(context, deps.promptLoader, rulesResult, packet);

    if (request.taskType === AgentTaskType.HOMEPAGE_SUMMARY) {
      const homepageToolEvidence = await collectHomepageToolEvidence(packet, context);
      taskPrompt = appendHomepageToolEvidenceToPrompt(taskPrompt, homepageToolEvidence);
    }
```

- [ ] **Step 5: Run runtime tests**

Run:

```bash
pnpm --filter @health-advisor/agent-core test -- src/__tests__/runtime/agent-runtime.test.ts
```

Expected:

```text
PASS  src/__tests__/runtime/agent-runtime.test.ts
```

- [ ] **Step 6: Commit runtime wiring**

```bash
git add packages/agent-core/src/runtime/agent-runtime.ts packages/agent-core/src/__tests__/runtime/agent-runtime.test.ts
git commit -m "feat(agent): add caffeine sleep impact to homepage brief"
```

---

## Module 3: Prompt Rules For LLM Use

### Task 7: Update Homepage Prompt Rules

**Files:**

- Modify: `data/sandbox/prompts/homepage.md`
- Modify: `data/sandbox/prompts/homepage/template.md`

**Task details:**

The Tool section gives the model structured numbers. The prompt must tell the model how to use them and how not to overclaim.

- [ ] **Step 1: Update `data/sandbox/prompts/homepage.md`**

Under the existing `事件分析要求` list, after the caffeine/alcohol probability-language bullet, add:

```md
- 如果上下文包含 `estimateCaffeineSleepImpact` 工具结果，必须优先使用工具返回的“估算咖啡因剩余比例”和睡眠影响等级来解释今晚睡眠影响；必须说明该结果来自戒指生理信号估算，不是血液化学实测；不得说“血液咖啡因浓度”或“确认摄入咖啡因”。
- 如果上下文没有 `estimateCaffeineSleepImpact` 工具结果，不得自行编造咖啡因半衰期、剩余比例、睡眠损失比例或具体提醒时间。
```

- [ ] **Step 2: Update `data/sandbox/prompts/homepage/template.md`**

Under the existing `数据引用规则` list, after the caffeine/alcohol probability-language bullet, add:

```md
- 如果上下文包含 `estimateCaffeineSleepImpact` 工具结果，必须优先使用工具返回的“估算咖啡因剩余比例”和睡眠影响等级来解释今晚睡眠影响；必须说明该结果来自戒指生理信号估算，不是血液化学实测；不得说“血液咖啡因浓度”或“确认摄入咖啡因”。
- 如果上下文没有 `estimateCaffeineSleepImpact` 工具结果，不得自行编造咖啡因半衰期、剩余比例、睡眠损失比例或具体提醒时间。
```

- [ ] **Step 3: Run prompt-related tests**

Run:

```bash
pnpm --filter @health-advisor/agent-core test -- src/__tests__/prompts/task-builder.test.ts src/__tests__/prompts/context-packet-renderer.test.ts
```

Expected:

```text
PASS  src/__tests__/prompts/task-builder.test.ts
PASS  src/__tests__/prompts/context-packet-renderer.test.ts
```

- [ ] **Step 4: Commit prompt rules**

```bash
git add data/sandbox/prompts/homepage.md data/sandbox/prompts/homepage/template.md
git commit -m "docs(prompts): guide caffeine sleep impact brief"
```

---

## Module 4: Integration And Regression Coverage

### Task 8: Add Runtime Integration Coverage For No-Call Behavior

**Files:**

- Modify: `packages/agent-core/src/runtime/__tests__/homepage-tool-evidence.test.ts`
- Modify: `packages/agent-core/src/__tests__/runtime/agent-runtime.test.ts`

**Task details:**

The most important failure mode is mentioning caffeine impact without a caffeine event. Strengthen tests around the conditional boundary.

- [ ] **Step 1: Add a non-caffeine event collector test**

Append this test to `packages/agent-core/src/runtime/__tests__/homepage-tool-evidence.test.ts`:

```ts
  it('does not collect caffeine sleep impact for alcohol-only probabilistic event', async () => {
    const packet = makePacket([makeEvent('possible_alcohol_intake')]);

    expect(shouldCollectCaffeineSleepImpact(packet)).toBe(false);
    await expect(collectHomepageToolEvidence(packet, makeContext())).resolves.toBeUndefined();
  });
```

- [ ] **Step 2: Add an advisor-chat non-homepage collector test**

Append this test to the same file:

```ts
  it('does not collect caffeine sleep impact outside homepage_summary task', async () => {
    const packet = {
      ...makePacket([makeEvent('possible_caffeine_intake')]),
      task: { type: 'advisor_chat', page: 'advisor', userMessage: '今晚睡眠会受影响吗' },
    };

    await expect(collectHomepageToolEvidence(packet, makeContext())).resolves.toBeUndefined();
  });
```

- [ ] **Step 3: Run focused regression tests**

Run:

```bash
pnpm --filter @health-advisor/agent-core test -- src/runtime/__tests__/homepage-tool-evidence.test.ts src/__tests__/runtime/agent-runtime.test.ts
```

Expected:

```text
PASS  src/runtime/__tests__/homepage-tool-evidence.test.ts
PASS  src/__tests__/runtime/agent-runtime.test.ts
```

- [ ] **Step 4: Commit regression coverage**

```bash
git add packages/agent-core/src/runtime/__tests__/homepage-tool-evidence.test.ts packages/agent-core/src/__tests__/runtime/agent-runtime.test.ts
git commit -m "test(agent): cover caffeine tool conditional brief flow"
```

### Task 9: Run Final Verification

**Files:**

- No source edits expected.

**Task details:**

Run the focused suites first, then typecheck both packages touched by the work.

- [ ] **Step 1: Run Tool and runtime tests**

```bash
pnpm --filter @health-advisor/agent-core test -- src/tools/__tests__/estimate-caffeine-sleep-impact.test.ts src/runtime/__tests__/homepage-tool-evidence.test.ts src/__tests__/runtime/agent-runtime.test.ts
```

Expected:

```text
PASS  src/tools/__tests__/estimate-caffeine-sleep-impact.test.ts
PASS  src/runtime/__tests__/homepage-tool-evidence.test.ts
PASS  src/__tests__/runtime/agent-runtime.test.ts
```

- [ ] **Step 2: Run agent-core typecheck**

```bash
pnpm --filter @health-advisor/agent-core typecheck
```

Expected:

```text
No TypeScript errors.
```

- [ ] **Step 3: Run agent-api typecheck**

```bash
pnpm --filter @health-advisor/agent-api typecheck
```

Expected:

```text
No TypeScript errors.
```

- [ ] **Step 4: Run the agent-core test suite**

```bash
pnpm --filter @health-advisor/agent-core test
```

Expected:

```text
All agent-core tests pass.
```

- [ ] **Step 5: Commit verification fixes if the previous commands required source or test changes**

Run this commit command only when Step 1 through Step 4 required source or test changes:

```bash
git add packages/agent-core apps/agent-api data/sandbox/prompts
git commit -m "fix(agent): stabilize caffeine sleep impact flow"
```

---

## Acceptance Criteria

- `estimateCaffeineSleepImpactTool` exists and conforms to the approved output contract.
- Tool output includes `basis: 'physiological_proxy'` and `measuredChemically: false`.
- Tool returns `hasCaffeineEvent: false` when no eligible `possible_caffeine_intake` exists.
- Homepage summary runtime calls the Tool only when `packet.homepage.recentEvents` contains `possible_caffeine_intake`.
- Homepage prompt includes the Tool result section only after the Tool is actually called.
- Homepage prompt contains no caffeine sleep-impact Tool section when no caffeine event exists.
- Homepage prompt rules prevent the LLM from inventing half-life, remaining ratio, blood concentration, or sleep-loss percentage.
- ReAct Tool registry includes the Tool for future Agent Tool access.
- Focused Tool, runtime, and typecheck commands pass.

## Implementation Notes

- Keep homepage conditional Tool collection deterministic. Do not ask the LLM whether it should call this Tool for homepage summaries.
- Do not expand `AnalysisPlan.MetricType` in this implementation. The homepage path does not use planner/ReAct, and expanding planner metrics would increase blast radius.
- Do not merge multiple caffeine events in this implementation. The approved spec selects the latest eligible event before target sleep time.
- Do not add manual caffeine intake input. The approved Demo scope uses only existing `possible_caffeine_intake`.
- Do not express absolute caffeine mass or blood concentration. The model is normalized around a relative load ratio.
