import { describe, it, expect } from 'vitest';
import type { TaskContextPacket, MissingDataItem } from '../../context/context-packet';
import type { AgentContext } from '../../types/agent-context';
import type { ToolExecutionContext } from '../tool-types';
import { queryMissingDataTool } from '../query-missing-data';

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

function makeMissingData(metric: string, overrides?: Partial<MissingDataItem>): MissingDataItem {
  return {
    metric,
    scope: 'selectedWindow',
    missingCount: 2,
    totalCount: 7,
    lastAvailableDate: '2025-06-05',
    impact: '数据不完整可能影响趋势分析',
    evidenceId: `ev-missing-${metric}`,
    ...overrides,
  };
}

describe('queryMissingDataTool', () => {
  it('成功查询所有缺失数据', async () => {
    const ctx = createMockContext({
      missingData: [
        makeMissingData('hrv'),
        makeMissingData('spo2', { missingCount: 3, totalCount: 7, evidenceId: 'ev-missing-spo2' }),
      ],
    });

    const result = await queryMissingDataTool.execute({}, ctx);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.items).toHaveLength(2);
      expect(result.data.hasMissingData).toBe(true);
      // completenessPct = (7 - 2) / 7 * 100 ≈ 71.43
      expect(result.data.items[0].completenessPct).toBeCloseTo(71.43, 1);
      expect(result.evidenceIds).toEqual(['ev-missing-hrv', 'ev-missing-spo2']);
    }
  });

  it('按 metric 过滤', async () => {
    const ctx = createMockContext({
      missingData: [makeMissingData('hrv'), makeMissingData('spo2')],
    });

    const result = await queryMissingDataTool.execute({ metric: 'hrv' }, ctx);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.items).toHaveLength(1);
      expect(result.data.items[0].metric).toBe('hrv');
    }
  });

  it('数据完整时返回空列表', async () => {
    const ctx = createMockContext(); // 无 missingData

    const result = await queryMissingDataTool.execute({}, ctx);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.items).toEqual([]);
      expect(result.data.hasMissingData).toBe(false);
      expect(result.evidenceIds).toEqual([]);
    }
  });

  it('totalCount 为 0 时 completenessPct 为 100', async () => {
    const ctx = createMockContext({
      missingData: [makeMissingData('hrv', { totalCount: 0, missingCount: 0 })],
    });

    const result = await queryMissingDataTool.execute({}, ctx);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.items[0].completenessPct).toBe(100);
    }
  });
});
