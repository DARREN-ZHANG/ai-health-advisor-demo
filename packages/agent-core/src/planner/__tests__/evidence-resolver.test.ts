import { describe, it, expect } from 'vitest';
import { resolveEvidenceByPlan } from '../evidence-resolver';
import type { AnalysisPlan } from '../analysis-plan';
import type { TaskContextPacket, EvidenceFact, VisibleChartPacket, MetricSummary } from '../../context/context-packet';

/** 构造最小合法的 AnalysisPlan */
function createPlan(overrides?: Partial<AnalysisPlan>): AnalysisPlan {
  return {
    planId: 'plan-test-001',
    taskType: 'advisor_chat',
    userIntent: {
      action: 'status_summary',
      riskLevel: 'general',
      needsClarification: false,
    },
    evidenceNeeds: [
      { metric: 'hrv', timeScope: 'week', reason: '用户询问 HRV', required: true },
      { metric: 'sleep', timeScope: 'today', reason: '辅助参考', required: false },
    ],
    safetyConstraints: ['no_diagnosis'],
    answerShape: {
      includeMissingDataDisclosure: true,
      includeChartTokens: false,
      maxSummaryLength: 300,
      tone: 'concise',
    },
    ...overrides,
  };
}

/** 构造最小合法的 TaskContextPacket */
function createPacket(overrides?: Partial<TaskContextPacket>): TaskContextPacket {
  return {
    task: { type: 'advisor_chat', page: 'advisor' },
    userContext: {
      profileId: 'p-001',
      name: '测试用户',
      age: 30,
      tags: [],
      baselines: { restingHR: 60, hrv: 45, spo2: 97, avgSleepMinutes: 420, avgSteps: 8000 },
    },
    dataWindow: { start: '2025-06-01', end: '2025-06-07', recordCount: 7, completenessPct: 100 },
    missingData: [],
    evidence: [],
    visibleCharts: [],
    ...overrides,
  };
}

// ────────────────────────────────────────────
// 测试
// ────────────────────────────────────────────

describe('resolveEvidenceByPlan', () => {
  describe('全部满足', () => {
    it('所有 evidence needs 都能从 packet 中解析 → unresolved 为空', () => {
      const evidenceHrv: EvidenceFact = {
        id: 'ev-hrv-1',
        source: 'daily_records',
        metric: 'hrv',
        value: 48,
        unit: 'ms',
        derivation: '7 天 RMSSD 均值',
      };
      const evidenceSleep: EvidenceFact = {
        id: 'ev-sleep-1',
        source: 'daily_records',
        metric: 'sleep',
        value: 420,
        unit: 'min',
        derivation: '最近一晚睡眠时长',
      };

      const plan = createPlan();
      const packet = createPacket({ evidence: [evidenceHrv, evidenceSleep] });
      const result = resolveEvidenceByPlan(plan, packet);

      expect(result.resolved).toHaveLength(2);
      expect(result.unresolved).toHaveLength(0);

      // 验证 hrv 解析结果
      const hrvResolved = result.resolved.find((r) => r.need.metric === 'hrv');
      expect(hrvResolved).toBeDefined();
      expect(hrvResolved!.evidence.evidenceIds).toEqual(['ev-hrv-1']);
    });
  });

  describe('部分满足', () => {
    it('部分 needs 可解析，部分不可 → resolved + unresolved 各有值', () => {
      const evidenceHrv: EvidenceFact = {
        id: 'ev-hrv-1',
        source: 'daily_records',
        metric: 'hrv',
        value: 48,
        unit: 'ms',
        derivation: '7 天均值',
      };

      // hrv 可解析，sleep required=true 但无数据
      const plan = createPlan({
        evidenceNeeds: [
          { metric: 'hrv', timeScope: 'week', reason: '用户询问 HRV', required: true },
          { metric: 'sleep', timeScope: 'today', reason: '辅助参考', required: true },
        ],
      });
      const packet = createPacket({ evidence: [evidenceHrv] });
      const result = resolveEvidenceByPlan(plan, packet);

      expect(result.resolved).toHaveLength(1);
      expect(result.resolved[0].need.metric).toBe('hrv');
      expect(result.unresolved).toHaveLength(1);
      expect(result.unresolved[0].metric).toBe('sleep');
    });
  });

  describe('全部失败', () => {
    it('packet 为空或无匹配 → 所有 required needs 在 unresolved', () => {
      const plan = createPlan({
        evidenceNeeds: [
          { metric: 'hrv', timeScope: 'week', reason: '用户询问 HRV', required: true },
          { metric: 'spo2', timeScope: 'today', reason: '安全检查', required: true },
        ],
      });
      const packet = createPacket();
      const result = resolveEvidenceByPlan(plan, packet);

      expect(result.resolved).toHaveLength(0);
      expect(result.unresolved).toHaveLength(2);
      expect(result.unresolved.map((u) => u.metric)).toEqual(['hrv', 'spo2']);
    });
  });

  describe('optional needs 不进 unresolved', () => {
    it('optional 且未找到 → 不在 unresolved 中', () => {
      const plan = createPlan({
        evidenceNeeds: [
          { metric: 'hrv', timeScope: 'week', reason: '用户询问 HRV', required: true },
          { metric: 'stress', timeScope: 'today', reason: '可选参考', required: false },
        ],
      });
      // 没有 hrv 和 stress 数据
      const packet = createPacket();
      const result = resolveEvidenceByPlan(plan, packet);

      expect(result.resolved).toHaveLength(0);
      // 只有 hrv（required）进入 unresolved
      expect(result.unresolved).toHaveLength(1);
      expect(result.unresolved[0].metric).toBe('hrv');
    });
  });

  describe('从 evidence 解析', () => {
    it('匹配 source=daily_records 的 EvidenceFact', () => {
      const evidence: EvidenceFact = {
        id: 'ev-act-1',
        source: 'daily_records',
        metric: 'activity',
        value: 8500,
        unit: 'steps',
        derivation: '7 天总步数均值',
      };

      const plan = createPlan({
        evidenceNeeds: [
          { metric: 'activity', timeScope: 'week', reason: '活动量', required: true },
        ],
      });
      const packet = createPacket({ evidence: [evidence] });
      const result = resolveEvidenceByPlan(plan, packet);

      expect(result.resolved).toHaveLength(1);
      expect(result.resolved[0].need.metric).toBe('activity');
      expect(result.resolved[0].evidence.evidenceIds).toEqual(['ev-act-1']);

      // 验证 data 结构
      const data = result.resolved[0].evidence.data as Array<{ id: string; metric: string; value: unknown }>;
      expect(data[0].id).toBe('ev-act-1');
      expect(data[0].metric).toBe('activity');
    });

    it('不匹配 source 非 daily_records 的 EvidenceFact', () => {
      const evidence: EvidenceFact = {
        id: 'ev-hrv-mem',
        source: 'memory',
        metric: 'hrv',
        value: 45,
        unit: 'ms',
        derivation: '历史记录',
      };

      const plan = createPlan({
        evidenceNeeds: [
          { metric: 'hrv', timeScope: 'week', reason: 'HRV', required: true },
        ],
      });
      const packet = createPacket({ evidence: [evidence] });
      const result = resolveEvidenceByPlan(plan, packet);

      // source 不是 daily_records，不匹配
      expect(result.resolved).toHaveLength(0);
      expect(result.unresolved).toHaveLength(1);
    });
  });

  describe('从 visibleCharts 解析', () => {
    it('匹配 metric 的 VisibleChartPacket', () => {
      const metricSummary: MetricSummary = {
        metric: 'spo2',
        latest: { value: 97, unit: '%' },
        average: { value: 96.5, unit: '%' },
        trendDirection: 'stable',
        anomalyPoints: [],
        missing: { missingCount: 0, totalCount: 7, completenessPct: 100 },
        evidenceIds: ['ev-spo2-chart'],
      };
      const chart: VisibleChartPacket = {
        chartToken: 'spo2-7d' as any,
        metric: 'spo2',
        timeframe: '7d' as any,
        visible: true,
        dataSummary: metricSummary,
        evidenceIds: ['ev-spo2-chart'],
      };

      const plan = createPlan({
        evidenceNeeds: [
          { metric: 'spo2', timeScope: 'week', reason: 'SpO2 监测', required: true },
        ],
      });
      const packet = createPacket({ visibleCharts: [chart] });
      const result = resolveEvidenceByPlan(plan, packet);

      expect(result.resolved).toHaveLength(1);
      expect(result.resolved[0].evidence.evidenceIds).toEqual(['ev-spo2-chart']);

      const data = result.resolved[0].evidence.data as { chartToken: string; metric: string; trend: string };
      expect(data.metric).toBe('spo2');
      expect(data.trend).toBe('stable');
    });
  });

  describe('从 trend7d 解析', () => {
    it('匹配 metric 的 MetricSummary（homepage.trend7d）', () => {
      const trend: MetricSummary = {
        metric: 'resting-hr',
        latest: { value: 58, unit: 'bpm' },
        average: { value: 60, unit: 'bpm' },
        trendDirection: 'down',
        deltaPctVsBaseline: -3.3,
        anomalyPoints: [],
        missing: { missingCount: 0, totalCount: 7, completenessPct: 100 },
        evidenceIds: ['ev-rhr-trend'],
      };

      const plan = createPlan({
        evidenceNeeds: [
          { metric: 'resting-hr', timeScope: 'week', reason: '静息心率趋势', required: true },
        ],
      });
      const packet = createPacket({
        homepage: {
          recentEvents: [],
          latest24h: { date: '2025-06-07', metrics: [] },
          trend7d: [trend],
          rulesInsights: [],
          suggestedChartTokens: [],
        },
      });
      const result = resolveEvidenceByPlan(plan, packet);

      expect(result.resolved).toHaveLength(1);
      expect(result.resolved[0].evidence.evidenceIds).toEqual(['ev-rhr-trend']);

      const data = result.resolved[0].evidence.data as { metric: string; trend: string; deltaPctVsBaseline: number };
      expect(data.metric).toBe('resting-hr');
      expect(data.trend).toBe('down');
      expect(data.deltaPctVsBaseline).toBe(-3.3);
    });
  });

  describe('解析优先级', () => {
    it('evidence 优先于 visibleCharts', () => {
      const evidence: EvidenceFact = {
        id: 'ev-hrv-evidence',
        source: 'daily_records',
        metric: 'hrv',
        value: 50,
        unit: 'ms',
        derivation: '直接证据',
      };
      const chart: VisibleChartPacket = {
        chartToken: 'hrv-7d' as any,
        metric: 'hrv',
        timeframe: '7d' as any,
        visible: true,
        dataSummary: {
          metric: 'hrv',
          trendDirection: 'up',
          anomalyPoints: [],
          missing: { missingCount: 0, totalCount: 7, completenessPct: 100 },
          evidenceIds: ['ev-hrv-chart'],
        },
        evidenceIds: ['ev-hrv-chart'],
      };

      const plan = createPlan({
        evidenceNeeds: [
          { metric: 'hrv', timeScope: 'week', reason: 'HRV', required: true },
        ],
      });
      const packet = createPacket({ evidence: [evidence], visibleCharts: [chart] });
      const result = resolveEvidenceByPlan(plan, packet);

      expect(result.resolved).toHaveLength(1);
      // 应该使用 evidence 而非 visibleCharts
      expect(result.resolved[0].evidence.evidenceIds).toEqual(['ev-hrv-evidence']);
    });
  });
});
