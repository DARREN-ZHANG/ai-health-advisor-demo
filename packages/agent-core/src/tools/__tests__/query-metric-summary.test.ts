import { describe, it, expect } from 'vitest';
import type { TaskContextPacket, MetricSummary } from '../../context/context-packet';
import type { AgentContext } from '../../types/agent-context';
import type { ToolExecutionContext } from '../tool-types';
import { queryMetricSummaryTool } from '../query-metric-summary';

/** 构造测试用 ToolExecutionContext */
function createMockContext(overrides?: Partial<TaskContextPacket>): ToolExecutionContext {
  return {
    packet: {
      task: { type: 'advisor_chat', page: 'advisor' },
      userContext: {
        profileId: 'p1',
        name: 'Test',
        age: 30,
        tags: [],
        baselines: { restingHR: 60, hrv: 50, spo2: 97, avgSleepMinutes: 420, avgSteps: 8000 },
      },
      dataWindow: {
        start: '2025-06-01',
        end: '2025-06-07',
        recordCount: 7,
        completenessPct: 85,
      },
      missingData: [],
      evidence: [],
      visibleCharts: [],
      ...overrides,
    },
    context: {
      profile: {
        profileId: 'p1',
        name: 'Test',
        age: 30,
        tags: [],
        baselines: { restingHR: 60, hrv: 50, spo2: 97, avgSleepMinutes: 420, avgSteps: 8000 },
      },
      task: { type: 'advisor_chat', pageContext: { page: 'advisor' } },
      dataWindow: {
        start: '2025-06-01',
        end: '2025-06-07',
        records: [],
        missingFields: [],
      },
      signals: { overallStatus: 'green', anomalies: [], trends: [], events: [], lowData: false },
      memory: { recentMessages: [] },
      locale: 'zh-CN',
    } as AgentContext,
  };
}

/** 构造一个典型的 MetricSummary */
function makeMetricSummary(overrides?: Partial<MetricSummary>): MetricSummary {
  return {
    metric: 'hrv',
    latest: { value: 55, unit: 'ms' },
    average: { value: 50, unit: 'ms' },
    min: { value: 40, unit: 'ms' },
    max: { value: 65, unit: 'ms' },
    baseline: { value: 48, unit: 'ms' },
    deltaPctVsBaseline: 4.2,
    trendDirection: 'up',
    anomalyPoints: [],
    missing: { missingCount: 1, totalCount: 7, completenessPct: 85.7 },
    evidenceIds: ['ev-hrv-1', 'ev-hrv-2'],
    ...overrides,
  };
}

describe('queryMetricSummaryTool', () => {
  it('成功查询 visibleCharts 中的指标数据', async () => {
    const ctx = createMockContext({
      visibleCharts: [
        {
          chartToken: 'chart-hrv',
          metric: 'hrv',
          timeframe: '7d',
          visible: true,
          dataSummary: makeMetricSummary({ metric: 'hrv' }),
          evidenceIds: ['ev-chart-1'],
        },
      ],
    });

    const result = await queryMetricSummaryTool.execute({ metric: 'hrv' }, ctx);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.value).toBe(50); // 默认 aggregation=avg
      expect(result.data.unit).toBe('ms');
      expect(result.data.trend).toBe('up');
      expect(result.data.dataPoints).toBe(6); // 7 - 1
      expect(result.evidenceIds).toEqual(['ev-hrv-1', 'ev-hrv-2', 'ev-chart-1']);
    }
  });

  it('从 homepage.trend7d 中查询', async () => {
    const ctx = createMockContext({
      homepage: {
        recentEvents: [],
        latest24h: { date: '2025-06-07', metrics: [] },
        trend7d: [makeMetricSummary({ metric: 'spo2', average: { value: 97, unit: '%' } })],
        rulesInsights: [],
        suggestedChartTokens: [],
      },
    });

    const result = await queryMetricSummaryTool.execute({ metric: 'spo2' }, ctx);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.value).toBe(97);
      expect(result.data.unit).toBe('%');
    }
  });

  it('数据缺失时返回 null 值', async () => {
    const ctx = createMockContext(); // 无 visibleCharts、无 homepage

    const result = await queryMetricSummaryTool.execute({ metric: 'stress' }, ctx);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.value).toBeNull();
      expect(result.data.dataPoints).toBe(0);
      expect(result.data.trend).toBe('unknown');
      expect(result.evidenceIds).toEqual([]);
    }
  });

  it('支持不同聚合类型', async () => {
    const ctx = createMockContext({
      visibleCharts: [
        {
          chartToken: 'chart-hrv',
          metric: 'hrv',
          timeframe: '7d',
          visible: true,
          dataSummary: makeMetricSummary({ metric: 'hrv' }),
          evidenceIds: [],
        },
      ],
    });

    // latest
    const latestResult = await queryMetricSummaryTool.execute({ metric: 'hrv', aggregation: 'latest' }, ctx);
    expect(latestResult.success).toBe(true);
    if (latestResult.success) expect(latestResult.data.value).toBe(55);

    // max
    const maxResult = await queryMetricSummaryTool.execute({ metric: 'hrv', aggregation: 'max' }, ctx);
    expect(maxResult.success).toBe(true);
    if (maxResult.success) expect(maxResult.data.value).toBe(65);

    // min
    const minResult = await queryMetricSummaryTool.execute({ metric: 'hrv', aggregation: 'min' }, ctx);
    expect(minResult.success).toBe(true);
    if (minResult.success) expect(minResult.data.value).toBe(40);
  });
});
