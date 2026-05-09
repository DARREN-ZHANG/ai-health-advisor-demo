import { describe, it, expect } from 'vitest';
import type { TaskContextPacket, VisibleChartPacket } from '../../context/context-packet';
import type { AgentContext } from '../../types/agent-context';
import type { ToolExecutionContext } from '../tool-types';
import { queryVisibleChartFactsTool } from '../query-visible-chart-facts';

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

function makeChart(metric: string, token: string): VisibleChartPacket {
  return {
    chartToken: token,
    metric: metric as VisibleChartPacket['metric'],
    timeframe: '7d',
    visible: true,
    dataSummary: {
      metric: metric as VisibleChartPacket['metric'],
      latest: { value: 55, unit: 'ms' },
      average: { value: 50, unit: 'ms' },
      min: { value: 40, unit: 'ms' },
      max: { value: 65, unit: 'ms' },
      trendDirection: 'up',
      anomalyPoints: [],
      missing: { missingCount: 0, totalCount: 7, completenessPct: 100 },
      evidenceIds: [`ev-${token}-1`],
    },
    evidenceIds: [`ev-${token}-1`],
  };
}

describe('queryVisibleChartFactsTool', () => {
  it('成功查询所有可见图表', async () => {
    const ctx = createMockContext({
      visibleCharts: [makeChart('hrv', 'chart-hrv'), makeChart('spo2', 'chart-spo2')],
    });

    const result = await queryVisibleChartFactsTool.execute({}, ctx);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.charts).toHaveLength(2);
      expect(result.data.charts[0].metric).toBe('hrv');
      expect(result.data.charts[1].metric).toBe('spo2');
      expect(result.evidenceIds).toEqual(['ev-chart-hrv-1', 'ev-chart-spo2-1']);
    }
  });

  it('按 chartToken 过滤', async () => {
    const ctx = createMockContext({
      visibleCharts: [makeChart('hrv', 'chart-hrv'), makeChart('spo2', 'chart-spo2')],
    });

    const result = await queryVisibleChartFactsTool.execute({ chartToken: 'chart-hrv' }, ctx);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.charts).toHaveLength(1);
      expect(result.data.charts[0].chartToken).toBe('chart-hrv');
    }
  });

  it('按 metric 过滤', async () => {
    const ctx = createMockContext({
      visibleCharts: [makeChart('hrv', 'chart-hrv'), makeChart('spo2', 'chart-spo2')],
    });

    const result = await queryVisibleChartFactsTool.execute({ metric: 'spo2' }, ctx);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.charts).toHaveLength(1);
      expect(result.data.charts[0].metric).toBe('spo2');
    }
  });

  it('数据缺失时返回空数组', async () => {
    const ctx = createMockContext(); // 无 visibleCharts

    const result = await queryVisibleChartFactsTool.execute({}, ctx);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.charts).toEqual([]);
      expect(result.evidenceIds).toEqual([]);
    }
  });
});
