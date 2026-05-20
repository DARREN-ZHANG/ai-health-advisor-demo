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
