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

  it('renders homepage metric values in evidence facts', () => {
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
    expect(output).toContain('58ms');
    expect(output).toContain('value=58');
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

  it('renders specific numeric values for hrv/spo2/resting_hr on homepage task', () => {
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
            { metric: 'resting_hr', value: 62, unit: 'bpm', baseline: 60, deltaPctVsBaseline: 3, status: 'normal', evidenceId: 'e2' },
            { metric: 'spo2', value: 97, unit: '%', baseline: 98, deltaPctVsBaseline: -1, status: 'normal', evidenceId: 'e3' },
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
        rulesInsights: [],
        suggestedChartTokens: [],
      },
    };

    const output = renderTaskContextPacket(packet);
    // Evidence
    expect(output).toContain('value=58ms');
    // User context baselines
    expect(output).toContain('60 bpm');
    expect(output).toContain('60 ms');
    expect(output).toContain('98%');
    // Latest 24h
    expect(output).toContain('hrv：58ms');
    expect(output).toContain('resting_hr：62bpm');
    expect(output).toContain('spo2：97%');
    // Trend 7d
    expect(output).toContain('latest 58ms on 2026-04-10');
    expect(output).toContain('avg 59ms');
    // Visible charts
    expect(output).toContain('  hrv:');
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
    expect(output).toContain('58ms');
    expect(output).toContain('59ms');
    expect(output).toContain('60ms');
    const hrvLine = output.split('\n').find((line) => line.startsWith('- hrv：')) ?? '';
    expect(hrvLine).toContain('58');
    expect(hrvLine).toContain('相对平时');
    expect(output).toContain('sleep_total：420min（相对平时 0%）');
    expect(output).toContain('通常水平');
    expect(output).not.toContain('仅用于解读');
  });

  it('renders homepage event insights before raw 24h details', () => {
    const packet: TaskContextPacket = {
      task: { type: 'homepage_summary', page: 'home' },
      userContext: {
        profileId: 'p1',
        name: '巅峰',
        age: 35,
        tags: [],
        baselines: { restingHR: 60, hrv: 60, spo2: 98, avgSleepMinutes: 420, avgSteps: 8000 },
      },
      dataWindow: { start: '2026-04-15', end: '2026-04-21', recordCount: 7, completenessPct: 100 },
      missingData: [],
      evidence: [],
      visibleCharts: [],
      homepage: {
        recentEvents: [],
        latest24h: { date: '2026-04-21', metrics: [] },
        trend7d: [],
        rulesInsights: [],
        suggestedChartTokens: [],
        eventInsights: [{
          eventId: 'event_deep_focus_2026-04-21T10:00',
          eventType: 'work_focus',
          priority: 'high',
          timeRelation: '刚结束约 10 min',
          headline: '连续专注 120 min，身体保持低位移',
          physiology: [{ metric: 'hrv', value: 55, unit: 'ms', qualifier: 'compressed', interpretation: 'HRV 处于压缩状态', evidenceId: 'e-hrv' }],
          recoveryContext: [{ source: 'latest24h', metric: 'sleep_total', relation: 'supports', summary: '昨晚睡眠支撑上午输出', evidenceId: 'e-sleep' }],
          tension: { level: 'watch', summary: '认知负荷已累积', reason: 'work focus with compressed HRV' },
          recommendedFocus: [{ category: 'movement_reset', action: '起身轻走', durationMin: 10, rationale: '释放静止负荷' }],
          actionIntents: [{ id: 'a1', emoji: '🚶', title: '要不要轻走一下', description: '起身轻走 10 min', aiPromise: '我会记录你的选择并用于本次建议上下文', productCapability: 'record_choice' }],
          evidenceIds: ['event_deep_focus_2026-04-21T10:00', 'e-hrv', 'e-sleep'],
        }],
      },
    };

    const output = renderTaskContextPacket(packet, 'zh', '2026-04-21T12:10');
    expect(output).toContain('事件生理摘要（优先引用）');
    expect(output).toContain('work_focus');
    expect(output).toContain('认知负荷已累积');
    expect(output).toContain('要不要轻走一下');
    expect(output.indexOf('事件生理摘要（优先引用）')).toBeLessThan(output.indexOf('过去24小时状态'));
  });
});


  it('with homepage events, renders event-window metrics and suppresses expanded normal daily metrics', () => {
    const packet: TaskContextPacket = {
      task: { type: 'homepage_summary', page: 'home' },
      userContext: {
        profileId: 'profile-a',
        name: '巅峰',
        age: 28,
        tags: ['规律健身'],
        baselines: { restingHR: 48, hrv: 93, spo2: 99, avgSleepMinutes: 600, avgSteps: 5900 },
      },
      dataWindow: { start: '2026-05-25', end: '2026-05-31', recordCount: 7, completenessPct: 100 },
      missingData: [],
      evidence: [],
      visibleCharts: [],
      homepage: {
        recentEvents: [{
          recognizedEventId: 're-hiit-1',
          type: 'intermittent_exercise',
          start: '2026-05-31T17:30',
          end: '2026-05-31T18:30',
          durationMin: 60,
          confidence: 0.92,
          sourceSegmentId: 'seg-hiit-1',
          recognitionEvidence: ['心率标准差 35, 交替高低强度'],
          eventWindow: {
            source: 'synced_device_samples',
            coverage: 'complete',
            recognizedEventId: 're-hiit-1',
            sourceSegmentId: 'seg-hiit-1',
            start: '2026-05-31T17:30',
            end: '2026-05-31T18:30',
            durationMin: 60,
            sampleCount: 5,
            evidenceIds: ['event_window_re-hiit-1_heart_rate'],
            metrics: [{
              metric: 'heart_rate',
              unit: 'bpm',
              sampleCount: 3,
              startValue: 118,
              endValue: 92,
              latest: 92,
              min: 92,
              max: 172,
              average: 134,
              delta: -26,
              qualifier: 'elevated',
              interpretation: '事件窗口心率峰值 172bpm，均值 134bpm，末段 92bpm',
              evidenceId: 'event_window_re-hiit-1_heart_rate',
            }],
          },
          syncState: { lastSyncedMeasuredAt: '2026-05-31T18:30', pendingEventCount: 0, fromSyncedWindow: true },
          evidenceIds: ['event_hiit', 'event_window_re-hiit-1_heart_rate'],
        }],
        eventInsights: [{
          eventId: 'event_hiit',
          eventType: 'hiit_workout',
          priority: 'high',
          timeRelation: '刚结束约 5 min',
          headline: '完成 60 min 训练，身体进入恢复窗口',
          eventWindow: {
            source: 'synced_device_samples',
            coverage: 'complete',
            recognizedEventId: 're-hiit-1',
            sourceSegmentId: 'seg-hiit-1',
            start: '2026-05-31T17:30',
            end: '2026-05-31T18:30',
            durationMin: 60,
            sampleCount: 5,
            evidenceIds: ['event_window_re-hiit-1_heart_rate'],
            metrics: [{
              metric: 'heart_rate',
              unit: 'bpm',
              sampleCount: 3,
              startValue: 118,
              endValue: 92,
              latest: 92,
              min: 92,
              max: 172,
              average: 134,
              delta: -26,
              qualifier: 'elevated',
              interpretation: '事件窗口心率峰值 172bpm，均值 134bpm，末段 92bpm',
              evidenceId: 'event_window_re-hiit-1_heart_rate',
            }],
          },
          physiology: [{ metric: 'heart_rate', value: 172, unit: 'bpm', qualifier: 'elevated', interpretation: '事件窗口心率峰值 172bpm，均值 134bpm，末段 92bpm', evidenceId: 'event_window_re-hiit-1_heart_rate' }],
          recoveryContext: [],
          tension: { level: 'watch', summary: '运动事件已经进入恢复窗口，需要降低后续刺激', reason: 'event-window workout recovery markers present' },
          recommendedFocus: [{ category: 'hydration', action: '小口补水并做轻度走动冷身', durationMin: 10, rationale: '帮助心率平稳回落并支持循环恢复' }],
          actionIntents: [],
          evidenceIds: ['event_hiit', 'event_window_re-hiit-1_heart_rate'],
        }],
        latest24h: {
          date: '2026-05-31',
          metrics: [
            { metric: 'hrv', value: 93, unit: 'ms', baseline: 93, deltaPctVsBaseline: 0, status: 'normal', evidenceId: 'daily_hrv' },
            { metric: 'resting_hr', value: 48, unit: 'bpm', baseline: 48, deltaPctVsBaseline: 0, status: 'normal', evidenceId: 'daily_hr' },
            { metric: 'spo2', value: 99, unit: '%', baseline: 99, deltaPctVsBaseline: 0, status: 'normal', evidenceId: 'daily_spo2' },
          ],
        },
        trend7d: [],
        rulesInsights: [],
        suggestedChartTokens: [],
      },
    };

    const output = renderTaskContextPacket(packet, 'zh', '2026-05-31T18:35');

    expect(output).toContain('## 事件生理摘要（优先引用）');
    expect(output).toContain('事件窗口');
    expect(output).toContain('峰值 172bpm');
    expect(output).not.toContain('其余指标正常：hrv 93ms, resting_hr 48bpm, spo2 99%');
  });
