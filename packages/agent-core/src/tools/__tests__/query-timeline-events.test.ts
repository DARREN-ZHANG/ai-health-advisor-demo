import { describe, it, expect } from 'vitest';
import type { TaskContextPacket, RecentEventPacket } from '../../context/context-packet';
import type { AgentContext } from '../../types/agent-context';
import type { ToolExecutionContext } from '../tool-types';
import { queryTimelineEventsTool } from '../query-timeline-events';

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

function makeEvent(overrides?: Partial<RecentEventPacket>): RecentEventPacket {
  return {
    recognizedEventId: 're-exercise-1',
    type: 'exercise',
    start: '2025-06-05T08:00:00Z',
    end: '2025-06-05T09:00:00Z',
    durationMin: 60,
    confidence: 0.95,
    // sensor_inference + confidence 0.95 (≥0.8) → likely
    certaintyBand: 'likely',
    sourceSegmentId: 'seg-exercise-1',
    recognitionEvidence: ['心率标准差 25, 运动模式'],
    syncState: {
      lastSyncedMeasuredAt: '2025-06-05T09:00:00Z',
      pendingEventCount: 0,
      fromSyncedWindow: true,
    },
    evidenceIds: ['ev-exercise-1'],
    ...overrides,
  };
}

describe('queryTimelineEventsTool', () => {
  it('成功查询所有时间线事件', async () => {
    const ctx = createMockContext({
      homepage: {
        recentEvents: [
          makeEvent({ type: 'exercise' }),
          makeEvent({ type: 'sleep', evidenceIds: ['ev-sleep-1'] }),
        ],
        latest24h: { date: '2025-06-07', metrics: [] },
        trend7d: [],
        rulesInsights: [],
        suggestedChartTokens: [],
      },
    });

    const result = await queryTimelineEventsTool.execute({}, ctx);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.events).toHaveLength(2);
      expect(result.evidenceIds).toEqual(['ev-exercise-1', 'ev-sleep-1']);
    }
  });

  it('按 eventType 过滤', async () => {
    const ctx = createMockContext({
      homepage: {
        recentEvents: [
          makeEvent({ type: 'exercise' }),
          makeEvent({ type: 'sleep' }),
        ],
        latest24h: { date: '2025-06-07', metrics: [] },
        trend7d: [],
        rulesInsights: [],
        suggestedChartTokens: [],
      },
    });

    const result = await queryTimelineEventsTool.execute({ eventType: 'sleep' }, ctx);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.events).toHaveLength(1);
      expect(result.data.events[0].type).toBe('sleep');
    }
  });

  it('按 dateRange 过滤', async () => {
    const ctx = createMockContext({
      homepage: {
        recentEvents: [
          makeEvent({ start: '2025-06-04T08:00:00Z', end: '2025-06-04T09:00:00Z' }),
          makeEvent({ start: '2025-06-06T10:00:00Z', end: '2025-06-06T11:00:00Z' }),
        ],
        latest24h: { date: '2025-06-07', metrics: [] },
        trend7d: [],
        rulesInsights: [],
        suggestedChartTokens: [],
      },
    });

    const result = await queryTimelineEventsTool.execute({
      dateRange: { start: '2025-06-05T00:00:00Z', end: '2025-06-07T00:00:00Z' },
    }, ctx);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.events).toHaveLength(1);
      expect(result.data.events[0].start).toBe('2025-06-06T10:00:00Z');
    }
  });

  it('数据缺失时返回空数组', async () => {
    const ctx = createMockContext(); // 无 homepage

    const result = await queryTimelineEventsTool.execute({}, ctx);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.events).toEqual([]);
      expect(result.evidenceIds).toEqual([]);
    }
  });
});
