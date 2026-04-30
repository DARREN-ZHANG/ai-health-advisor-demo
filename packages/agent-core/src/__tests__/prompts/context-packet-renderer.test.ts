import { describe, it, expect } from 'vitest';
import { renderTaskContextPacket } from '../../prompts/context-packet-renderer';
import type { TaskContextPacket } from '../../context/context-packet';
import { ChartTokenId } from '@health-advisor/shared';

describe('renderTaskContextPacket', () => {
  it('renders base sections in zh (default locale)', () => {
    const packet: TaskContextPacket = {
      task: { type: 'homepage_summary', page: 'home' },
      userContext: {
        profileId: 'p1',
        name: 'Test',
        age: 30,
        tags: ['tag1'],
        baselines: { restingHR: 60, hrv: 60, spo2: 98, avgSleepMinutes: 420, avgSteps: 8000 },
      },
      dataWindow: { start: '2026-04-04', end: '2026-04-10', recordCount: 7, completenessPct: 100 },
      missingData: [],
      evidence: [],
      visibleCharts: [],
    };

    const output = renderTaskContextPacket(packet);
    expect(output).toContain('任务上下文');
    expect(output).toContain('用户信息');
    expect(output).toContain('数据窗口');
    expect(output).toContain('数据质量');
    expect(output).toContain('Test');
    expect(output).toContain('tag1');
  });

  it('renders base sections in en locale', () => {
    const packet: TaskContextPacket = {
      task: { type: 'homepage_summary', page: 'home' },
      userContext: {
        profileId: 'p1',
        name: 'Test',
        age: 30,
        tags: ['tag1'],
        baselines: { restingHR: 60, hrv: 60, spo2: 98, avgSleepMinutes: 420, avgSteps: 8000 },
      },
      dataWindow: { start: '2026-04-04', end: '2026-04-10', recordCount: 7, completenessPct: 100 },
      missingData: [],
      evidence: [],
      visibleCharts: [],
    };

    const output = renderTaskContextPacket(packet, 'en');
    expect(output).toContain('Task Context');
    expect(output).toContain('User Info');
    expect(output).toContain('Data Window');
    expect(output).toContain('Data Quality');
    expect(output).toContain('Test');
    expect(output).toContain('tag1');
  });

  it('renders missing data in zh', () => {
    const packet: TaskContextPacket = {
      task: { type: 'homepage_summary', page: 'home' },
      userContext: {
        profileId: 'p1',
        name: 'Test',
        age: 30,
        tags: [],
        baselines: { restingHR: 60, hrv: 60, spo2: 98, avgSleepMinutes: 420, avgSteps: 8000 },
      },
      dataWindow: { start: '2026-04-04', end: '2026-04-10', recordCount: 7, completenessPct: 100 },
      missingData: [
        {
          metric: 'sleep',
          scope: 'latest24h',
          missingCount: 1,
          totalCount: 1,
          lastAvailableDate: '2026-04-08',
          impact: 'cannot assess last-night sleep',
          requiredDisclosure: '必须说明昨晚睡眠数据不足',
          evidenceId: 'missing_sleep_latest24h',
        },
      ],
      evidence: [],
      visibleCharts: [],
    };

    const output = renderTaskContextPacket(packet);
    expect(output).toContain('数据质量约束');
    expect(output).toContain('sleep 在 latest24h 缺失');
    expect(output).toContain('必须说明昨晚睡眠数据不足');
    expect(output).toContain('最近可用日期：2026-04-08');
  });

  it('renders missing data in en', () => {
    const packet: TaskContextPacket = {
      task: { type: 'homepage_summary', page: 'home' },
      userContext: {
        profileId: 'p1',
        name: 'Test',
        age: 30,
        tags: [],
        baselines: { restingHR: 60, hrv: 60, spo2: 98, avgSleepMinutes: 420, avgSteps: 8000 },
      },
      dataWindow: { start: '2026-04-04', end: '2026-04-10', recordCount: 7, completenessPct: 100 },
      missingData: [
        {
          metric: 'sleep',
          scope: 'latest24h',
          missingCount: 1,
          totalCount: 1,
          lastAvailableDate: '2026-04-08',
          impact: 'cannot assess last-night sleep',
          requiredDisclosure: 'Must note insufficient sleep data last night',
          evidenceId: 'missing_sleep_latest24h',
        },
      ],
      evidence: [],
      visibleCharts: [],
    };

    const output = renderTaskContextPacket(packet, 'en');
    expect(output).toContain('Data Quality Constraints');
    expect(output).toContain('sleep in latest24h missing');
    expect(output).toContain('Last available date: 2026-04-08');
  });

  it('hides homepage interpretation-only metric values in evidence facts', () => {
    const packet: TaskContextPacket = {
      task: { type: 'homepage_summary', page: 'home' },
      userContext: {
        profileId: 'p1',
        name: 'Test',
        age: 30,
        tags: [],
        baselines: { restingHR: 60, hrv: 60, spo2: 98, avgSleepMinutes: 420, avgSteps: 8000 },
      },
      dataWindow: { start: '2026-04-04', end: '2026-04-10', recordCount: 7, completenessPct: 100 },
      missingData: [],
      evidence: [
        {
          id: 'latest_hrv',
          source: 'daily_records',
          metric: 'hrv',
          value: 58,
          unit: 'ms',
          dateRange: { start: '2026-04-10', end: '2026-04-10' },
          derivation: 'latest record in selected window',
        },
      ],
      visibleCharts: [],
    };

    const output = renderTaskContextPacket(packet);
    expect(output).toContain('Evidence Facts');
    expect(output).toContain('latest_hrv');
    expect(output).toContain('metric=hrv');
    expect(output).not.toContain('58ms');
    expect(output).not.toContain('value=58');
  });

  it('renders homepage packet in zh', () => {
    const packet: TaskContextPacket = {
      task: { type: 'homepage_summary', page: 'home' },
      userContext: {
        profileId: 'p1',
        name: 'Test',
        age: 30,
        tags: [],
        baselines: { restingHR: 60, hrv: 60, spo2: 98, avgSleepMinutes: 420, avgSteps: 8000 },
      },
      dataWindow: { start: '2026-04-04', end: '2026-04-10', recordCount: 7, completenessPct: 100 },
      missingData: [],
      evidence: [],
      visibleCharts: [],
      homepage: {
        recentEvents: [],
        latest24h: {
          date: '2026-04-10',
          metrics: [
            { metric: 'hrv', value: 58, unit: 'ms', baseline: 60, deltaPctVsBaseline: -3, status: 'normal', evidenceId: 'e1' },
            { metric: 'sleep_total', value: 420, unit: 'min', baseline: 420, deltaPctVsBaseline: 0, status: 'normal', evidenceId: 'e2' },
          ],
        },
        trend7d: [
          {
            metric: 'hrv',
            latest: { value: 58, unit: 'ms', date: '2026-04-10' },
            average: { value: 59, unit: 'ms' },
            trendDirection: 'stable',
            anomalyPoints: [],
            missing: { missingCount: 0, totalCount: 7, completenessPct: 100 },
            evidenceIds: ['e3'],
          },
        ],
        rulesInsights: [{ category: 'trend', severity: 'info', message: 'HRV stable' }],
        suggestedChartTokens: [ChartTokenId.HRV_7DAYS],
      },
    };

    const output = renderTaskContextPacket(packet);
    expect(output).toContain('过去24小时状态');
    expect(output).toContain('hrv');
    expect(output).toContain('过去一周趋势');
    expect(output).toContain('预处理信号');
    expect(output).toContain('建议关联图表');
  });

  it('renders homepage packet in en', () => {
    const packet: TaskContextPacket = {
      task: { type: 'homepage_summary', page: 'home' },
      userContext: {
        profileId: 'p1',
        name: 'Test',
        age: 30,
        tags: [],
        baselines: { restingHR: 60, hrv: 60, spo2: 98, avgSleepMinutes: 420, avgSteps: 8000 },
      },
      dataWindow: { start: '2026-04-04', end: '2026-04-10', recordCount: 7, completenessPct: 100 },
      missingData: [],
      evidence: [],
      visibleCharts: [],
      homepage: {
        recentEvents: [],
        latest24h: {
          date: '2026-04-10',
          metrics: [
            { metric: 'hrv', value: 58, unit: 'ms', baseline: 60, deltaPctVsBaseline: -3, status: 'normal', evidenceId: 'e1' },
            { metric: 'sleep_total', value: 420, unit: 'min', baseline: 420, deltaPctVsBaseline: 0, status: 'normal', evidenceId: 'e2' },
          ],
        },
        trend7d: [
          {
            metric: 'hrv',
            latest: { value: 58, unit: 'ms', date: '2026-04-10' },
            average: { value: 59, unit: 'ms' },
            trendDirection: 'stable',
            anomalyPoints: [],
            missing: { missingCount: 0, totalCount: 7, completenessPct: 100 },
            evidenceIds: ['e3'],
          },
        ],
        rulesInsights: [{ category: 'trend', severity: 'info', message: 'HRV stable' }],
        suggestedChartTokens: [ChartTokenId.HRV_7DAYS],
      },
    };

    const output = renderTaskContextPacket(packet, 'en');
    expect(output).toContain('Past 24h Status');
    expect(output).toContain('Past Week Trends');
    expect(output).toContain('Pre-processed Signals');
    expect(output).toContain('Suggested Charts');
  });

  it('renders view summary packet in zh', () => {
    const packet: TaskContextPacket = {
      task: { type: 'view_summary', page: 'data-center', tab: 'hrv', timeframe: 'week' },
      userContext: {
        profileId: 'p1',
        name: 'Test',
        age: 30,
        tags: [],
        baselines: { restingHR: 60, hrv: 60, spo2: 98, avgSleepMinutes: 420, avgSteps: 8000 },
      },
      dataWindow: { start: '2026-04-04', end: '2026-04-10', recordCount: 7, completenessPct: 100 },
      missingData: [],
      evidence: [],
      visibleCharts: [
        {
          chartToken: ChartTokenId.HRV_7DAYS,
          metric: 'hrv',
          timeframe: 'week',
          visible: true,
          dataSummary: {
            metric: 'hrv',
            latest: { value: 58, unit: 'ms', date: '2026-04-10' },
            average: { value: 59, unit: 'ms' },
            trendDirection: 'stable',
            anomalyPoints: [],
            missing: { missingCount: 0, totalCount: 7, completenessPct: 100 },
            evidenceIds: ['e1'],
          },
          evidenceIds: ['e1'],
        },
      ],
      viewSummary: {
        tab: 'hrv',
        timeframe: 'week',
        selectedMetric: {
          metric: 'hrv',
          latest: { value: 58, unit: 'ms', date: '2026-04-10' },
          average: { value: 59, unit: 'ms' },
          trendDirection: 'stable',
          anomalyPoints: [],
          missing: { missingCount: 0, totalCount: 7, completenessPct: 100 },
          evidenceIds: ['e1'],
        },
        visibleCharts: [],
        rulesInsights: [],
        suggestedChartTokens: [ChartTokenId.HRV_7DAYS],
      },
    };

    const output = renderTaskContextPacket(packet);
    expect(output).toContain('视图上下文');
    expect(output).toContain('选中指标详情');
    expect(output).toContain('HRV_7DAYS');
  });

  it('renders view summary packet in en', () => {
    const packet: TaskContextPacket = {
      task: { type: 'view_summary', page: 'data-center', tab: 'hrv', timeframe: 'week' },
      userContext: {
        profileId: 'p1',
        name: 'Test',
        age: 30,
        tags: [],
        baselines: { restingHR: 60, hrv: 60, spo2: 98, avgSleepMinutes: 420, avgSteps: 8000 },
      },
      dataWindow: { start: '2026-04-04', end: '2026-04-10', recordCount: 7, completenessPct: 100 },
      missingData: [],
      evidence: [],
      visibleCharts: [],
      viewSummary: {
        tab: 'hrv',
        timeframe: 'week',
        selectedMetric: {
          metric: 'hrv',
          latest: { value: 58, unit: 'ms', date: '2026-04-10' },
          average: { value: 59, unit: 'ms' },
          trendDirection: 'stable',
          anomalyPoints: [],
          missing: { missingCount: 0, totalCount: 7, completenessPct: 100 },
          evidenceIds: ['e1'],
        },
        visibleCharts: [],
        rulesInsights: [],
        suggestedChartTokens: [],
      },
    };

    const output = renderTaskContextPacket(packet, 'en');
    expect(output).toContain('View Context');
    expect(output).toContain('Selected Metric Details');
  });

  it('renders advisor chat packet in zh', () => {
    const packet: TaskContextPacket = {
      task: { type: 'advisor_chat', page: 'data-center', tab: 'hrv', timeframe: 'week', userMessage: '这个图说明什么' },
      userContext: {
        profileId: 'p1',
        name: 'Test',
        age: 30,
        tags: [],
        baselines: { restingHR: 60, hrv: 60, spo2: 98, avgSleepMinutes: 420, avgSteps: 8000 },
      },
      dataWindow: { start: '2026-04-04', end: '2026-04-10', recordCount: 7, completenessPct: 100 },
      missingData: [],
      evidence: [],
      visibleCharts: [],
      advisorChat: {
        userMessage: '这个图说明什么',
        questionIntent: {
          metricFocus: [],
          timeScope: 'unknown',
          actionIntent: 'explain_chart',
          riskLevel: 'general',
        },
        currentPage: {
          page: 'data-center',
          tab: 'hrv',
          timeframe: 'week',
          visibleChartTokens: [ChartTokenId.HRV_7DAYS],
          chartDataSummaries: ['HRV_7DAYS: latest 58ms, avg 59ms, trend stable'],
        },
        relevantFacts: [
          { label: '当前图表: HRV_7DAYS', factType: 'chart', summary: 'HRV 趋势稳定', evidenceIds: ['e1'] },
        ],
        recentConversation: [],
        constraints: [
          { type: 'must_cite_evidence', description: '重要建议必须引用 evidence' },
        ],
      },
    };

    const output = renderTaskContextPacket(packet);
    expect(output).toContain('用户问题');
    expect(output).toContain('这个图说明什么');
    expect(output).toContain('问题意图');
    expect(output).toContain('explain_chart');
    expect(output).toContain('相关事实');
    expect(output).toContain('回答约束');
  });

  it('renders advisor chat packet in en', () => {
    const packet: TaskContextPacket = {
      task: { type: 'advisor_chat', page: 'data-center', tab: 'hrv', timeframe: 'week', userMessage: 'What does this chart mean' },
      userContext: {
        profileId: 'p1',
        name: 'Test',
        age: 30,
        tags: [],
        baselines: { restingHR: 60, hrv: 60, spo2: 98, avgSleepMinutes: 420, avgSteps: 8000 },
      },
      dataWindow: { start: '2026-04-04', end: '2026-04-10', recordCount: 7, completenessPct: 100 },
      missingData: [],
      evidence: [],
      visibleCharts: [],
      advisorChat: {
        userMessage: 'What does this chart mean',
        questionIntent: {
          metricFocus: [],
          timeScope: 'unknown',
          actionIntent: 'explain_chart',
          riskLevel: 'general',
        },
        currentPage: {
          page: 'data-center',
          tab: 'hrv',
          timeframe: 'week',
          visibleChartTokens: [ChartTokenId.HRV_7DAYS],
          chartDataSummaries: ['HRV_7DAYS: latest 58ms, avg 59ms, trend stable'],
        },
        relevantFacts: [
          { label: 'Current chart: HRV_7DAYS', factType: 'chart', summary: 'HRV trend stable', evidenceIds: ['e1'] },
        ],
        recentConversation: [],
        constraints: [
          { type: 'must_cite_evidence', description: 'Important advice must cite evidence' },
        ],
      },
    };

    const output = renderTaskContextPacket(packet, 'en');
    expect(output).toContain('User Question');
    expect(output).toContain('What does this chart mean');
    expect(output).toContain('Question Intent');
    expect(output).toContain('Relevant Facts');
    expect(output).toContain('Response Constraints');
  });

  it('does not compute metrics, only renders', () => {
    const packet: TaskContextPacket = {
      task: { type: 'homepage_summary', page: 'home' },
      userContext: {
        profileId: 'p1',
        name: 'Test',
        age: 30,
        tags: [],
        baselines: { restingHR: 60, hrv: 60, spo2: 98, avgSleepMinutes: 420, avgSteps: 8000 },
      },
      dataWindow: { start: '2026-04-04', end: '2026-04-10', recordCount: 7, completenessPct: 100 },
      missingData: [],
      evidence: [],
      visibleCharts: [],
    };

    const output = renderTaskContextPacket(packet);
    // Renderer should not do any calculations; just format what's in the packet
    expect(output).not.toContain('undefined');
    expect(output).toContain('任务上下文');
  });

  it('homepage context must not contain user-visible baseline jargon', () => {
    const packet: TaskContextPacket = {
      task: { type: 'homepage_summary', page: 'home' },
      userContext: {
        profileId: 'p1',
        name: 'Test',
        age: 30,
        tags: [],
        baselines: { restingHR: 60, hrv: 60, spo2: 98, avgSleepMinutes: 420, avgSteps: 8000 },
      },
      dataWindow: { start: '2026-04-04', end: '2026-04-10', recordCount: 7, completenessPct: 100 },
      missingData: [],
      evidence: [],
      visibleCharts: [
        {
          chartToken: ChartTokenId.HRV_7DAYS,
          metric: 'hrv',
          timeframe: 'week',
          visible: true,
          dataSummary: {
            metric: 'hrv',
            latest: { value: 58, unit: 'ms', date: '2026-04-10' },
            average: { value: 59, unit: 'ms' },
            baseline: { value: 60, unit: 'ms' },
            deltaPctVsBaseline: -3,
            trendDirection: 'stable',
            anomalyPoints: [],
            missing: { missingCount: 0, totalCount: 7, completenessPct: 100 },
            evidenceIds: ['e1'],
          },
          evidenceIds: ['e1'],
        },
      ],
      homepage: {
        recentEvents: [],
        latest24h: {
          date: '2026-04-10',
          metrics: [
            { metric: 'hrv', value: 58, unit: 'ms', baseline: 60, deltaPctVsBaseline: -3, status: 'normal', evidenceId: 'e1' },
            { metric: 'sleep_total', value: 420, unit: 'min', baseline: 420, deltaPctVsBaseline: 0, status: 'normal', evidenceId: 'e2' },
          ],
        },
        trend7d: [
          {
            metric: 'hrv',
            latest: { value: 58, unit: 'ms', date: '2026-04-10' },
            average: { value: 59, unit: 'ms' },
            baseline: { value: 60, unit: 'ms' },
            deltaPctVsBaseline: -3,
            trendDirection: 'stable',
            anomalyPoints: [],
            missing: { missingCount: 0, totalCount: 7, completenessPct: 100 },
            evidenceIds: ['e3'],
          },
        ],
        rulesInsights: [{ category: 'trend', severity: 'info', message: 'HRV stable' }],
        suggestedChartTokens: [ChartTokenId.HRV_7DAYS],
      },
    };

    const output = renderTaskContextPacket(packet);
    expect(output).not.toContain('基线');
    expect(output).not.toContain('基准线');
    expect(output).not.toContain('偏离基线');
    expect(output).not.toContain('baseline');
    expect(output).not.toContain('58ms');
    expect(output).not.toContain('59ms');
    expect(output).not.toContain('60ms');
    expect(output).not.toContain('value=58ms');
    const hrvLine = output.split('\n').find((line) => line.startsWith('- hrv：')) ?? '';
    expect(hrvLine).not.toContain('58');
    expect(hrvLine).not.toContain('相对平时');
    expect(output).toContain('sleep_total：420min（相对平时 0%）');
    expect(output).toContain('通常水平');
    expect(output).toContain('仅用于解读');
  });
});
