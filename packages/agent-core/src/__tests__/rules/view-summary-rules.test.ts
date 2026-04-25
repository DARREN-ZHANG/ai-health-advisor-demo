import { describe, it, expect } from 'vitest';
import type { AgentContext } from '../../types/agent-context';
import { AgentTaskType, ChartTokenId, type DailyRecord, type DataTab } from '@health-advisor/shared';
import { viewSummaryRules, evaluateViewSummaryRules } from '../../rules/view-summary-rules';
import { InsightRuleEngine } from '../../rules/rule-engine';

function makeContext(
  tab: DataTab,
  records: DailyRecord[],
  overrides: Partial<AgentContext> = {},
): AgentContext {
  return {
    profile: {
      profileId: 'profile-a',
      name: '张健康',
      age: 32,
      tags: [],
      baselines: { restingHR: 62, hrv: 58, spo2: 98, avgSleepMinutes: 420, avgSteps: 8500 },
    },
    task: {
      type: AgentTaskType.VIEW_SUMMARY,
      pageContext: {
        profileId: 'profile-a',
        page: 'data-center',
        dataTab: tab,
        timeframe: 'week',
      },
      tab,
      timeframe: 'week',
    },
    dataWindow: {
      start: '2026-04-04',
      end: '2026-04-10',
      records,
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
    ...overrides,
  };
}

describe('viewSummaryRules', () => {
  const engine = new InsightRuleEngine(viewSummaryRules);

  it('HRV tab 检测到下降趋势', () => {
    const records: DailyRecord[] = Array.from({ length: 7 }, (_, i) => ({
      date: `2026-04-${String(4 + i).padStart(2, '0')}`,
      hrv: i < 3 ? 55 : 18,
    }));

    const result = engine.evaluate(makeContext('hrv', records));

    expect(result.insights.some((s) => s.metric === 'hrv')).toBe(true);
  });

  it('sleep tab 检测到睡眠质量差', () => {
    const records: DailyRecord[] = Array.from({ length: 7 }, (_, i) => ({
      date: `2026-04-${String(4 + i).padStart(2, '0')}`,
      sleep: { totalMinutes: 240, startTime: '02:00', endTime: '06:00', stages: { deep: 20, light: 120, rem: 40, awake: 60 }, score: 30 },
    }));

    const result = engine.evaluate(makeContext('sleep', records));

    expect(result.insights.some((s) => s.metric === 'sleep')).toBe(true);
  });

  it('stress tab 检测到高压', () => {
    const records: DailyRecord[] = Array.from({ length: 7 }, (_, i) => ({
      date: `2026-04-${String(4 + i).padStart(2, '0')}`,
      stress: { load: 85 },
    }));

    const result = engine.evaluate(makeContext('stress', records));

    expect(result.insights.some((s) => s.metric === 'stress')).toBe(true);
  });

  it('activity tab 检测到运动不足', () => {
    const records: DailyRecord[] = Array.from({ length: 7 }, (_, i) => ({
      date: `2026-04-${String(4 + i).padStart(2, '0')}`,
      activity: { steps: 1500, calories: 1200, activeMinutes: 5, distanceKm: 1.0 },
    }));

    const result = engine.evaluate(makeContext('activity', records));

    expect(result.insights.some((s) => s.metric === 'activity')).toBe(true);
  });

  it('spo2 tab 检测到低血氧', () => {
    const records: DailyRecord[] = Array.from({ length: 5 }, (_, i) => ({
      date: `2026-04-${String(6 + i).padStart(2, '0')}`,
      spo2: 92,
    }));

    const result = engine.evaluate(makeContext('spo2', records));

    expect(result.insights.some((s) => s.metric === 'spo2')).toBe(true);
  });

  it('规则仅适用于 view_summary', () => {
    for (const rule of viewSummaryRules) {
      expect(rule.appliesTo).toEqual([AgentTaskType.VIEW_SUMMARY]);
    }
  });

  it('evaluateViewSummaryRules 根据 tab 返回合适的 chart tokens', () => {
    const records: DailyRecord[] = Array.from({ length: 7 }, (_, i) => ({
      date: `2026-04-${String(4 + i).padStart(2, '0')}`,
      stress: { load: 85 },
    }));

    const result = evaluateViewSummaryRules(makeContext('stress', records));

    expect(result.suggestedChartTokens).toContain(ChartTokenId.STRESS_LOAD_7DAYS);
  });

  it('不在对应 tab 的规则不产生信号', () => {
    // 只有 spo2 数据，但 tab 是 hrv
    const records: DailyRecord[] = Array.from({ length: 7 }, (_, i) => ({
      date: `2026-04-${String(4 + i).padStart(2, '0')}`,
      spo2: 92,
    }));

    const result = engine.evaluate(makeContext('hrv', records));

    // hrv tab 规则不应该产出 spo2 信号
    expect(result.insights.some((s) => s.metric === 'spo2')).toBe(false);
  });

  it('resting-hr tab 检测到静息心率偏高', () => {
    const records: DailyRecord[] = Array.from({ length: 7 }, () => ({
      date: '2026-04-04',
      hr: [80, 82], // 远高于基线 62
    }));

    const result = engine.evaluate(makeContext('resting-hr', records));

    expect(result.insights.some((s) => s.metric === 'resting-hr')).toBe(true);
    expect(result.insights.some((s) => s.severity === 'warning')).toBe(true);
  });

  it('resting-hr tab 正常静息心率返回 info 信号', () => {
    const records: DailyRecord[] = Array.from({ length: 7 }, () => ({
      date: '2026-04-04',
      hr: [62, 64], // 接近基线 62
    }));

    const result = engine.evaluate(makeContext('resting-hr', records));

    expect(result.insights.some((s) => s.metric === 'resting-hr')).toBe(true);
    expect(result.insights.some((s) => s.severity === 'info')).toBe(true);
  });

  it('resting-hr tab 返回 RESTING_HR_7DAYS token', () => {
    const records: DailyRecord[] = Array.from({ length: 7 }, () => ({
      date: '2026-04-04',
      hr: [62, 64],
    }));

    const result = evaluateViewSummaryRules(makeContext('resting-hr', records));

    expect(result.suggestedChartTokens).toContain(ChartTokenId.RESTING_HR_7DAYS);
  });
});
