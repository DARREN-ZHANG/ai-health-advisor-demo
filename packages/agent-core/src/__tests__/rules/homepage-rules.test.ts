import { describe, it, expect } from 'vitest';
import type { AgentContext } from '../../types/agent-context';
import { AgentTaskType, ChartTokenId } from '@health-advisor/shared';
import type { DailyRecord } from '@health-advisor/shared';
import { homepageRules } from '../../rules/homepage-rules';
import { InsightRuleEngine } from '../../rules/rule-engine';
import { evaluateHomepageRules } from '../../rules/homepage-rules';

function makeContext(records: DailyRecord[], overrides: Partial<AgentContext> = {}): AgentContext {
  return {
    profile: {
      profileId: 'profile-a',
      name: '张健康',
      age: 32,
      tags: [],
      baselines: { restingHR: 62, hrv: 58, spo2: 98, avgSleepMinutes: 420, avgSteps: 8500 },
    },
    task: {
      type: AgentTaskType.HOMEPAGE_SUMMARY,
      pageContext: {
        profileId: 'profile-a',
        page: 'home',
        timeframe: 'week',
      },
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

describe('homepageRules', () => {
  const engine = new InsightRuleEngine(homepageRules);

  it('健康数据正常时 statusColor 为 green', () => {
    const records: DailyRecord[] = Array.from({ length: 7 }, (_, i) => ({
      date: `2026-04-${String(4 + i).padStart(2, '0')}`,
      hr: [58, 66],
      sleep: { totalMinutes: 420, startTime: '23:00', endTime: '06:00', stages: { deep: 90, light: 180, rem: 120, awake: 30 }, score: 85 },
      activity: { steps: 8000, calories: 2200, activeMinutes: 45, distanceKm: 5.5 },
      spo2: 98,
      stress: { load: 30 },
    }));

    const result = engine.evaluate(makeContext(records));

    expect(result.statusColor).toBe('green');
  });

  it('HRV 下降趋势产生 warning 信号', () => {
    // HRV 由单条记录中 HR 数组的标准差近似。前半段方差大，后半段方差小 -> 下降趋势
    const records: DailyRecord[] = Array.from({ length: 7 }, (_, i) => ({
      date: `2026-04-${String(4 + i).padStart(2, '0')}`,
      hr: i < 3 ? [50, 80] : [59, 63], // 前半段 HRV 高，后半段 HRV 低
      spo2: 98,
    }));

    const result = engine.evaluate(makeContext(records));

    const hrvSignals = result.insights.filter(
      (s) => s.metric === 'hrv' && s.severity === 'warning',
    );
    expect(hrvSignals.length).toBeGreaterThan(0);
  });

  it('睡眠严重不足产生 warning 信号', () => {
    const records: DailyRecord[] = Array.from({ length: 7 }, (_, i) => ({
      date: `2026-04-${String(4 + i).padStart(2, '0')}`,
      sleep: { totalMinutes: 240, startTime: '02:00', endTime: '06:00', stages: { deep: 20, light: 120, rem: 60, awake: 40 }, score: 35 },
      spo2: 98,
    }));

    const result = engine.evaluate(makeContext(records));

    const sleepSignals = result.insights.filter(
      (s) => s.metric === 'sleep' && s.severity === 'warning',
    );
    expect(sleepSignals.length).toBeGreaterThan(0);
  });

  it('血氧过低产生 critical 信号', () => {
    const records: DailyRecord[] = Array.from({ length: 3 }, (_, i) => ({
      date: `2026-04-${String(8 + i).padStart(2, '0')}`,
      spo2: 90,
    }));

    const result = engine.evaluate(makeContext(records));

    const spo2Signals = result.insights.filter(
      (s) => s.metric === 'spo2' && s.severity === 'critical',
    );
    expect(spo2Signals.length).toBeGreaterThan(0);
  });

  it('压力持续偏高产生 warning 信号', () => {
    const records: DailyRecord[] = Array.from({ length: 7 }, (_, i) => ({
      date: `2026-04-${String(4 + i).padStart(2, '0')}`,
      stress: { load: 80 },
      spo2: 98,
    }));

    const result = engine.evaluate(makeContext(records));

    const stressSignals = result.insights.filter(
      (s) => s.metric === 'stress' && s.severity === 'warning',
    );
    expect(stressSignals.length).toBeGreaterThan(0);
  });

  it('运动量不足产生 suggestion 信号', () => {
    const records: DailyRecord[] = Array.from({ length: 7 }, (_, i) => ({
      date: `2026-04-${String(4 + i).padStart(2, '0')}`,
      activity: { steps: 2000, calories: 1500, activeMinutes: 10, distanceKm: 1.5 },
      spo2: 98,
    }));

    const result = engine.evaluate(makeContext(records));

    const activitySignals = result.insights.filter(
      (s) => s.metric === 'activity' && s.category === 'suggestion',
    );
    expect(activitySignals.length).toBeGreaterThan(0);
  });

  it('建议包含适合首页的 chart tokens', () => {
    const records: DailyRecord[] = Array.from({ length: 7 }, (_, i) => ({
      date: `2026-04-${String(4 + i).padStart(2, '0')}`,
      hr: [60, 62],
      sleep: { totalMinutes: 300, startTime: '01:00', endTime: '06:00', stages: { deep: 30, light: 150, rem: 80, awake: 40 }, score: 45 },
      spo2: 98,
      stress: { load: 70 },
    }));

    const result = evaluateHomepageRules(makeContext(records));

    expect(result.suggestedChartTokens.length).toBeGreaterThan(0);
    for (const token of result.suggestedChartTokens) {
      expect(Object.values(ChartTokenId)).toContain(token);
    }
  });

  it('规则仅适用于 homepage_summary', () => {
    for (const rule of homepageRules) {
      expect(rule.appliesTo).toEqual([AgentTaskType.HOMEPAGE_SUMMARY]);
    }
  });
});
