import { describe, it, expect } from 'vitest';
import { buildTaskContextPacket } from '../../context/context-packet-builder';
import type { AgentContext } from '../../types/agent-context';
import { AgentTaskType, ChartTokenId } from '@health-advisor/shared';
import type { RuleEvaluationResult } from '../../rules/types';
import type { DailyRecord } from '@health-advisor/shared';

function makeRecord(date: string, overrides: Partial<DailyRecord> = {}): DailyRecord {
  return { date, hr: [60, 62], hrv: 58, sleep: { totalMinutes: 420, startTime: '23:00', endTime: '06:00', stages: { deep: 90, light: 180, rem: 120, awake: 30 }, score: 85 }, activity: { steps: 8000, calories: 2200, activeMinutes: 45, distanceKm: 5.5 }, spo2: 98, stress: { load: 30 }, ...overrides };
}

function makeContext(overrides: Partial<AgentContext> = {}): AgentContext {
  return {
    profile: {
      profileId: 'profile-a',
      name: '张健康',
      age: 32,
      tags: ['耐力训练'],
      baselines: { restingHR: 62, hrv: 58, spo2: 98, avgSleepMinutes: 420, avgSteps: 8500 },
    },
    task: {
      type: AgentTaskType.HOMEPAGE_SUMMARY,
      pageContext: { profileId: 'profile-a', page: 'home', timeframe: 'week' },
    },
    dataWindow: {
      start: '2026-04-04',
      end: '2026-04-10',
      records: [
        makeRecord('2026-04-04', { hrv: 55 }),
        makeRecord('2026-04-05', { hrv: 58 }),
        makeRecord('2026-04-06', { hrv: 60 }),
        makeRecord('2026-04-07', { hrv: 62 }),
        makeRecord('2026-04-08', { hrv: 59 }),
        makeRecord('2026-04-09', { hrv: 57 }),
        makeRecord('2026-04-10', { hrv: 56 }),
      ],
      missingFields: [],
    },
    signals: { overallStatus: 'green', anomalies: [], trends: [], events: [], lowData: false },
    memory: { recentMessages: [] },
    ...overrides,
  };
}

const emptyRules: RuleEvaluationResult = {
  insights: [],
  suggestedChartTokens: [],
  suggestedMicroTips: [],
  statusColor: 'green',
};

describe('buildTaskContextPacket', () => {
  it('builds base packet with task, userContext, dataWindow', () => {
    const packet = buildTaskContextPacket(makeContext(), emptyRules);

    expect(packet.task.type).toBe('homepage_summary');
    expect(packet.userContext.name).toBe('张健康');
    expect(packet.userContext.tags).toContain('耐力训练');
    expect(packet.dataWindow.recordCount).toBe(7);
    expect(packet.dataWindow.completenessPct).toBeGreaterThan(0);
  });

  it('builds homepage packet', () => {
    const packet = buildTaskContextPacket(makeContext(), emptyRules);

    expect(packet.homepage).toBeDefined();
    expect(packet.homepage?.latest24h.date).toBe('2026-04-10');
    expect(packet.homepage?.latest24h.metrics.length).toBeGreaterThan(0);
    expect(packet.homepage?.trend7d.length).toBeGreaterThan(0);
  });

  it('homepage latest24h includes all core metrics', () => {
    const packet = buildTaskContextPacket(makeContext(), emptyRules);
    const metrics = packet.homepage?.latest24h.metrics ?? [];
    const metricNames = metrics.map((m) => m.metric);

    expect(metricNames).toContain('sleep_total');
    expect(metricNames).toContain('hrv');
    expect(metricNames).toContain('resting_hr');
    expect(metricNames).toContain('spo2');
    expect(metricNames).toContain('stress_load');
    expect(metricNames).toContain('steps');
  });

  it('homepage trend7d includes all metrics', () => {
    const packet = buildTaskContextPacket(makeContext(), emptyRules);
    const trends = packet.homepage?.trend7d ?? [];
    const metricNames = trends.map((t) => t.metric);

    expect(metricNames).toContain('hrv');
    expect(metricNames).toContain('sleep');
    expect(metricNames).toContain('activity');
    expect(metricNames).toContain('stress');
    expect(metricNames).toContain('resting-hr');
    expect(metricNames).toContain('spo2');
  });

  it('builds view summary packet with selectedMetric', () => {
    const ctx = makeContext({
      task: {
        type: AgentTaskType.VIEW_SUMMARY,
        pageContext: { profileId: 'profile-a', page: 'data-center', dataTab: 'hrv', timeframe: 'week' },
        tab: 'hrv',
        timeframe: 'week',
      },
    });
    const packet = buildTaskContextPacket(ctx, emptyRules);

    expect(packet.viewSummary).toBeDefined();
    expect(packet.viewSummary?.tab).toBe('hrv');
    expect(packet.viewSummary?.selectedMetric).toBeDefined();
    expect(packet.viewSummary?.selectedMetric?.metric).toBe('hrv');
    expect(packet.viewSummary?.selectedMetric?.latest).toBeDefined();
    expect(packet.viewSummary?.selectedMetric?.average).toBeDefined();
    expect(packet.viewSummary?.selectedMetric?.trendDirection).toBeDefined();
  });

  it('view summary for single metric tab includes chart token', () => {
    const ctx = makeContext({
      task: {
        type: AgentTaskType.VIEW_SUMMARY,
        pageContext: { profileId: 'profile-a', page: 'data-center', dataTab: 'sleep', timeframe: 'week' },
        tab: 'sleep',
        timeframe: 'week',
      },
    });
    const packet = buildTaskContextPacket(ctx, emptyRules);
    expect(packet.viewSummary?.visibleCharts[0]?.chartToken).toBe(ChartTokenId.SLEEP_7DAYS);
  });

  it('view summary overview tab includes overviewMetrics', () => {
    const ctx = makeContext({
      task: {
        type: AgentTaskType.VIEW_SUMMARY,
        pageContext: { profileId: 'profile-a', page: 'data-center', dataTab: 'overview', timeframe: 'week' },
        tab: 'overview',
        timeframe: 'week',
      },
    });
    const packet = buildTaskContextPacket(ctx, emptyRules);
    expect(packet.viewSummary?.overviewMetrics).toBeDefined();
    expect(packet.viewSummary?.overviewMetrics?.length).toBeGreaterThan(0);
  });

  it('builds advisor chat packet', () => {
    const ctx = makeContext({
      task: {
        type: AgentTaskType.ADVISOR_CHAT,
        pageContext: { profileId: 'profile-a', page: 'data-center', dataTab: 'hrv', timeframe: 'week' },
        tab: 'hrv',
        timeframe: 'week',
        userMessage: '这个图说明什么',
      },
    });
    const packet = buildTaskContextPacket(ctx, emptyRules);

    expect(packet.advisorChat).toBeDefined();
    expect(packet.advisorChat?.userMessage).toBe('这个图说明什么');
    expect(packet.advisorChat?.questionIntent.actionIntent).toBe('explain_chart');
    expect(packet.advisorChat?.currentPage.visibleChartTokens).toContain(ChartTokenId.HRV_7DAYS);
    expect(packet.advisorChat?.relevantFacts.length).toBeGreaterThan(0);
  });

  it('advisor chat includes current tab facts even if not explicitly asked', () => {
    const ctx = makeContext({
      task: {
        type: AgentTaskType.ADVISOR_CHAT,
        pageContext: { profileId: 'profile-a', page: 'data-center', dataTab: 'hrv', timeframe: 'week' },
        tab: 'hrv',
        timeframe: 'week',
        userMessage: '最近怎么样',
      },
    });
    const packet = buildTaskContextPacket(ctx, emptyRules);
    const chartFacts = packet.advisorChat?.relevantFacts.filter((f) => f.factType === 'chart') ?? [];
    expect(chartFacts.length).toBeGreaterThan(0);
  });

  it('generates evidence facts', () => {
    const packet = buildTaskContextPacket(makeContext(), emptyRules);
    expect(packet.evidence.length).toBeGreaterThan(0);
  });

  it('generates missing data items when data is missing', () => {
    const ctx = makeContext({
      dataWindow: {
        start: '2026-04-04',
        end: '2026-04-10',
        records: [
          makeRecord('2026-04-04', { hrv: undefined }),
          makeRecord('2026-04-05', { hrv: undefined }),
          makeRecord('2026-04-06', { hrv: 58 }),
        ],
        missingFields: ['hrv'],
      },
    });
    const packet = buildTaskContextPacket(ctx, emptyRules);
    expect(packet.missingData.length).toBeGreaterThan(0);
    expect(packet.missingData.some((m) => m.metric === 'hrv')).toBe(true);
  });

  it('visibleCharts use real ChartTokenId', () => {
    const packet = buildTaskContextPacket(makeContext(), emptyRules);
    for (const vc of packet.visibleCharts) {
      expect(Object.values(ChartTokenId)).toContain(vc.chartToken);
    }
  });

  it('advisor chat relevantFacts evidence ids exist in evidence array', () => {
    const ctx = makeContext({
      task: {
        type: AgentTaskType.ADVISOR_CHAT,
        pageContext: { profileId: 'profile-a', page: 'data-center', dataTab: 'hrv', timeframe: 'week' },
        tab: 'hrv',
        timeframe: 'week',
        userMessage: '最近状态如何',
      },
    });
    const packet = buildTaskContextPacket(ctx, emptyRules);
    const evidenceIds = new Set(packet.evidence.map((e) => e.id));

    for (const fact of packet.advisorChat?.relevantFacts ?? []) {
      for (const eid of fact.evidenceIds) {
        expect(evidenceIds.has(eid)).toBe(true);
      }
    }
  });

  it('missing data includes multiple scopes', () => {
    const ctx = makeContext({
      dataWindow: {
        start: '2026-04-04',
        end: '2026-04-10',
        records: [
          makeRecord('2026-04-04', { hrv: undefined }),
          makeRecord('2026-04-05', { hrv: undefined }),
          makeRecord('2026-04-06', { hrv: undefined }),
        ],
        missingFields: ['hrv'],
      },
    });
    const packet = buildTaskContextPacket(ctx, emptyRules);
    const scopes = new Set(packet.missingData.map((m) => m.scope));
    expect(scopes.has('selectedWindow')).toBe(true);
    expect(scopes.has('latest24h')).toBe(true);
    expect(scopes.has('trend7d')).toBe(true);
  });

  it('allRecords help find lastAvailableDate outside window', () => {
    const ctx = makeContext({
      dataWindow: {
        start: '2026-04-08',
        end: '2026-04-10',
        records: [
          makeRecord('2026-04-08', { hrv: undefined }),
          makeRecord('2026-04-09', { hrv: undefined }),
          makeRecord('2026-04-10', { hrv: undefined }),
        ],
        allRecords: [
          makeRecord('2026-04-04', { hrv: 55 }),
          makeRecord('2026-04-05', { hrv: 58 }),
          makeRecord('2026-04-06', { hrv: 60 }),
          makeRecord('2026-04-07', { hrv: undefined }),
          makeRecord('2026-04-08', { hrv: undefined }),
          makeRecord('2026-04-09', { hrv: undefined }),
          makeRecord('2026-04-10', { hrv: undefined }),
        ],
        missingFields: ['hrv'],
      },
    });
    const packet = buildTaskContextPacket(ctx, emptyRules);
    const hrvMissing = packet.missingData.filter((m) => m.metric === 'hrv');
    for (const m of hrvMissing) {
      expect(m.lastAvailableDate).toBe('2026-04-06');
    }
  });
});
