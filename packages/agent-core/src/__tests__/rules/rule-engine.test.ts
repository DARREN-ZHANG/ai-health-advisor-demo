import { describe, it, expect } from 'vitest';
import { InsightRuleEngine } from '../../rules/rule-engine';
import type { InsightRule, InsightSignal } from '../../rules/types';
import type { AgentContext } from '../../types/agent-context';
import { AgentTaskType } from '@health-advisor/shared';

function makeContext(overrides: Partial<AgentContext> = {}): AgentContext {
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
    memory: {
      recentMessages: [],
    },
    ...overrides,
  };
}

const stubRule: InsightRule = {
  id: 'stub-rule',
  appliesTo: [AgentTaskType.HOMEPAGE_SUMMARY],
  evaluate: () => [
    { category: 'status', severity: 'info', message: '一切正常' },
  ],
};

const warningRule: InsightRule = {
  id: 'warning-rule',
  appliesTo: [AgentTaskType.HOMEPAGE_SUMMARY, AgentTaskType.VIEW_SUMMARY],
  evaluate: () => [
    { category: 'anomaly', severity: 'warning', metric: 'hrv', message: 'HRV 下降' },
  ],
};

const criticalRule: InsightRule = {
  id: 'critical-rule',
  appliesTo: [AgentTaskType.ADVISOR_CHAT],
  evaluate: () => [
    { category: 'anomaly', severity: 'critical', metric: 'spo2', message: '血氧严重偏低' },
  ],
};

describe('InsightRuleEngine', () => {
  it('仅执行适用于当前 taskType 的规则', () => {
    const engine = new InsightRuleEngine([stubRule, criticalRule]);
    const result = engine.evaluate(makeContext());

    expect(result.insights).toHaveLength(1);
    expect(result.insights[0]?.message).toBe('一切正常');
  });

  it('合并多条适用规则的信号', () => {
    const engine = new InsightRuleEngine([stubRule, warningRule]);
    const result = engine.evaluate(makeContext());

    expect(result.insights).toHaveLength(2);
  });

  it('无适用规则时返回空 insights', () => {
    const engine = new InsightRuleEngine([criticalRule]);
    const result = engine.evaluate(makeContext());

    expect(result.insights).toHaveLength(0);
    expect(result.statusColor).toBe('green');
  });

  it('存在 critical 信号时 statusColor 为 red', () => {
    const engine = new InsightRuleEngine([criticalRule]);
    const ctx = makeContext({
      task: {
        ...makeContext().task,
        type: AgentTaskType.ADVISOR_CHAT,
      },
    });
    const result = engine.evaluate(ctx);

    expect(result.statusColor).toBe('red');
  });

  it('存在 warning 信号且无 critical 时 statusColor 为 yellow', () => {
    const engine = new InsightRuleEngine([warningRule]);
    const result = engine.evaluate(makeContext());

    expect(result.statusColor).toBe('yellow');
  });

  it('仅 info 信号时 statusColor 为 green', () => {
    const engine = new InsightRuleEngine([stubRule]);
    const result = engine.evaluate(makeContext());

    expect(result.statusColor).toBe('green');
  });

  it('lowData 为 true 时 statusColor 至少为 yellow', () => {
    const engine = new InsightRuleEngine([stubRule]);
    const ctx = makeContext({
      signals: { ...makeContext().signals, lowData: true },
    });
    const result = engine.evaluate(ctx);

    expect(result.statusColor).toBe('yellow');
  });

  it('lowData 为 true 且有 critical 信号时 statusColor 为 red', () => {
    const engine = new InsightRuleEngine([criticalRule]);
    const ctx = makeContext({
      task: {
        ...makeContext().task,
        type: AgentTaskType.ADVISOR_CHAT,
      },
      signals: { ...makeContext().signals, lowData: true },
    });
    const result = engine.evaluate(ctx);

    expect(result.statusColor).toBe('red');
  });

  it('result 包含 suggestedChartTokens 和 suggestedMicroTips 字段', () => {
    const engine = new InsightRuleEngine([]);
    const result = engine.evaluate(makeContext());

    expect(result).toHaveProperty('suggestedChartTokens');
    expect(result).toHaveProperty('suggestedMicroTips');
    expect(Array.isArray(result.suggestedChartTokens)).toBe(true);
    expect(Array.isArray(result.suggestedMicroTips)).toBe(true);
  });
});
