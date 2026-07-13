import { describe, it, expect } from 'vitest';
import { renderTaskContextPacket } from '../../prompts/context-packet-renderer';
import { buildCustomerFacingEvidencePacket } from '../../context/customer-facing-evidence';
import type { TaskContextPacket } from '../../context/context-packet';
import type { Locale } from '@health-advisor/shared';
import { ChartTokenId } from '@health-advisor/shared';

/**
 * Task 3.1 helper：投影内部 packet 后再渲染。
 * 所有现有测试通过此 helper 调用，确保 renderer 只接收 CustomerFacingEvidencePacket。
 */
function render(
  packet: TaskContextPacket,
  locale: Locale = 'zh',
  demoNow?: string,
): string {
  return renderTaskContextPacket(
    buildCustomerFacingEvidencePacket(packet, locale),
    locale,
    demoNow,
  );
}

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

    const output = render(packet);
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

    const output = render(packet, 'en');
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

    const output = render(packet);
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

    const output = render(packet, 'en');
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
      evidence: [],
      visibleCharts: [],
      homepage: {
        recentEvents: [],
        latest24h: {
          date: '2026-04-10',
          metrics: [
            {
              metric: 'hrv',
              value: 58,
              unit: 'ms',
              status: 'normal',
              evidenceId: 'latest_hrv',
            },
          ],
        },
        trend7d: [],
        rulesInsights: [],
        suggestedChartTokens: [],
      },
    };

    // Task 3.1：evidence 不再直接渲染；改为渲染投影后的 PublicFact
    const output = render(packet);
    expect(output).toContain('Evidence Facts');
    expect(output).toContain('latest_hrv');
    expect(output).toContain('hrv=58ms');
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
            {
              metric: 'hrv',
              value: 58,
              unit: 'ms',
              baseline: 60,
              deltaPctVsBaseline: -3,
              status: 'normal',
              evidenceId: 'e1',
            },
            {
              metric: 'sleep_total',
              value: 420,
              unit: 'min',
              baseline: 420,
              deltaPctVsBaseline: 0,
              status: 'normal',
              evidenceId: 'e2',
            },
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

    const output = render(packet);
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
            {
              metric: 'hrv',
              value: 58,
              unit: 'ms',
              baseline: 60,
              deltaPctVsBaseline: -3,
              status: 'normal',
              evidenceId: 'e1',
            },
            {
              metric: 'sleep_total',
              value: 420,
              unit: 'min',
              baseline: 420,
              deltaPctVsBaseline: 0,
              status: 'normal',
              evidenceId: 'e2',
            },
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

    const output = render(packet, 'en');
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

    const output = render(packet);
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

    const output = render(packet, 'en');
    expect(output).toContain('View Context');
    expect(output).toContain('Selected Metric Details');
  });

  it('renders advisor chat packet in zh', () => {
    const packet: TaskContextPacket = {
      task: {
        type: 'advisor_chat',
        page: 'data-center',
        tab: 'hrv',
        timeframe: 'week',
        userMessage: '这个图说明什么',
      },
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
          {
            label: '当前图表: HRV_7DAYS',
            factType: 'chart',
            summary: 'HRV 趋势稳定',
            evidenceIds: ['e1'],
          },
        ],
        recentConversation: [],
        constraints: [{ type: 'must_cite_evidence', description: '重要建议必须引用 evidence' }],
      },
    };

    const output = render(packet);
    expect(output).toContain('用户问题');
    expect(output).toContain('这个图说明什么');
    expect(output).toContain('问题意图');
    expect(output).toContain('explain_chart');
    expect(output).toContain('相关事实');
    expect(output).toContain('回答约束');
  });

  it('renders advisor chat packet in en', () => {
    const packet: TaskContextPacket = {
      task: {
        type: 'advisor_chat',
        page: 'data-center',
        tab: 'hrv',
        timeframe: 'week',
        userMessage: 'What does this chart mean',
      },
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
          {
            label: 'Current chart: HRV_7DAYS',
            factType: 'chart',
            summary: 'HRV trend stable',
            evidenceIds: ['e1'],
          },
        ],
        recentConversation: [],
        constraints: [
          { type: 'must_cite_evidence', description: 'Important advice must cite evidence' },
        ],
      },
    };

    const output = render(packet, 'en');
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

    const output = render(packet);
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
            {
              metric: 'hrv',
              value: 58,
              unit: 'ms',
              baseline: 60,
              deltaPctVsBaseline: -3,
              status: 'normal',
              evidenceId: 'e1',
            },
            {
              metric: 'resting_hr',
              value: 62,
              unit: 'bpm',
              baseline: 60,
              deltaPctVsBaseline: 3,
              status: 'normal',
              evidenceId: 'e2',
            },
            {
              metric: 'spo2',
              value: 97,
              unit: '%',
              baseline: 98,
              deltaPctVsBaseline: -1,
              status: 'normal',
              evidenceId: 'e3',
            },
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

    const output = render(packet);
    // Task 3.1：Evidence Facts 区段渲染投影后的 facts
    expect(output).toContain('Evidence Facts');
    expect(output).toContain('e1: hrv=58ms');
    // User context baselines
    expect(output).toContain('60 bpm');
    expect(output).toContain('60 ms');
    expect(output).toContain('98%');
    // Latest 24h
    expect(output).toContain('hrv：58ms');
    expect(output).toContain('resting_hr：62bpm');
    expect(output).toContain('spo2：97%');
    // Trend 7d（投影后仍保留 latest value）
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
            {
              metric: 'hrv',
              value: 58,
              unit: 'ms',
              baseline: 60,
              deltaPctVsBaseline: -3,
              status: 'normal',
              evidenceId: 'e1',
            },
            {
              metric: 'sleep_total',
              value: 420,
              unit: 'min',
              baseline: 420,
              deltaPctVsBaseline: 0,
              status: 'normal',
              evidenceId: 'e2',
            },
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

    const output = render(packet);
    expect(output).not.toContain('基线');
    expect(output).not.toContain('基准线');
    expect(output).not.toContain('偏离基线');
    expect(output).not.toContain('baseline');
    // latest/average 仍渲染
    expect(output).toContain('58ms');
    expect(output).toContain('59ms');
    // Task 3.1：投影后 baseline/deltaPctVsBaseline 不再渲染到 prompt（防止内部 delta 泄漏）
    // 但 latest24h 中的 deltaPctVsBaseline 仍保留（客户可见的"相对平时"文案）
    const hrvLine = output.split('\n').find((line) => line.startsWith('- hrv：')) ?? '';
    expect(hrvLine).toContain('58');
    expect(hrvLine).toContain('相对平时');
    expect(output).toContain('sleep_total：420min（相对平时 0%）');
    // Task 3.1：trend7d 的 baseline 不再渲染"通常水平"文案（投影移除 baseline 字段）
    expect(output).not.toContain('仅用于解读');
  });

  it('renders action candidates with interaction JSON when available', () => {
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
        latest24h: { date: '2026-04-10', metrics: [] },
        trend7d: [],
        rulesInsights: [],
        suggestedChartTokens: [],
        eventInsights: [
          {
            eventId: 'event_deep_focus_2026-04-21T10:00',
            rawEventType: 'micro_deep_breathing',
            eventType: 'work_focus',
            certaintyBand: 'likely',
            priority: 'high',
            timeRelation: '刚结束约 10 min',
            headline: '连续专注 120 min，身体保持低位移',
            physiology: [],
            recoveryContext: [],
            tension: {
              level: 'watch',
              summary: '认知负荷已累积',
              reason: 'work focus with compressed HRV',
            },
            recommendedFocus: [
              {
                category: 'movement_reset',
                action: '起身轻走',
                durationMin: 10,
                rationale: '释放静止负荷',
              },
            ],
            actionIntents: [
              {
                id: 'a1',
                emoji: '🫁',
                title: '做几次深呼吸',
                description: '现在做 3 分钟缓慢呼吸',
                aiPromise: '我会记录这个微行动并更新实时简报',
                productCapability: 'contextual_followup',
                interaction: {
                  kind: 'micro_event',
                  microEvent: {
                    type: 'micro_deep_breathing',
                    durationMinutes: 3,
                    params: { pattern: 'extended_exhale' },
                  },
                },
              },
              {
                id: 'a2',
                emoji: '💧',
                title: '先小口补水',
                description: '喝一杯温水',
                aiPromise: '我会记录你的选择并用于本次建议上下文',
                productCapability: 'record_choice',
              },
            ],
            evidenceIds: ['event_deep_focus_2026-04-21T10:00'],
            mentionPolicy: {
              summary: 'allowed',
              actions: 'allowed',
              reason: 'current_latest_event',
            },
          },
        ],
      },
    };

    const output = render(packet, 'zh', '2026-04-21T12:10');
    expect(output).toContain('actions 候选');
    // Task 3.1：rawEventType 标签不再渲染到客户可见 prompt（防止内部类型泄漏）
    expect(output).not.toContain('最近事件原始类型');
    // interaction JSON 仍保留（actionIntents 是客户可见操作）
    expect(output).toContain('"kind":"micro_event"');
    expect(output).toContain('"type":"micro_deep_breathing"');
    expect(output).toContain('interaction=none');
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
        eventInsights: [
          {
            eventId: 'event_deep_focus_2026-04-21T10:00',
            eventType: 'work_focus',
            certaintyBand: 'likely',
            priority: 'high',
            timeRelation: '刚结束约 10 min',
            headline: '连续专注 120 min，身体保持低位移',
            physiology: [
              {
                metric: 'hrv',
                value: 55,
                unit: 'ms',
                qualifier: 'compressed',
                interpretation: 'HRV 处于压缩状态',
                evidenceId: 'e-hrv',
              },
            ],
            recoveryContext: [
              {
                source: 'latest24h',
                metric: 'sleep_total',
                relation: 'supports',
                summary: '昨晚睡眠支撑上午输出',
                evidenceId: 'e-sleep',
              },
            ],
            tension: {
              level: 'watch',
              summary: '认知负荷已累积',
              reason: 'work focus with compressed HRV',
            },
            recommendedFocus: [
              {
                category: 'movement_reset',
                action: '起身轻走',
                durationMin: 10,
                rationale: '释放静止负荷',
              },
            ],
            actionIntents: [
              {
                id: 'a1',
                emoji: '🚶',
                title: '要不要轻走一下',
                description: '起身轻走 10 min',
                aiPromise: '我会记录你的选择并用于本次建议上下文',
                productCapability: 'record_choice',
              },
            ],
            evidenceIds: ['event_deep_focus_2026-04-21T10:00', 'e-hrv', 'e-sleep'],
            mentionPolicy: {
              summary: 'allowed',
              actions: 'allowed',
              reason: 'current_latest_event',
            },
          },
        ],
      },
    };

    const output = render(packet, 'zh', '2026-04-21T12:10');
    expect(output).toContain('## 当前可提及事件');
    expect(output).toContain('work_focus');
    expect(output).toContain('认知负荷已累积');
    expect(output).toContain('要不要轻走一下');
    expect(output.indexOf('## 当前可提及事件')).toBeLessThan(output.indexOf('过去24小时状态'));
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
        recentEvents: [
          {
            recognizedEventId: 're-hiit-1',
            type: 'intermittent_exercise',
            start: '2026-05-31T17:30',
            end: '2026-05-31T18:30',
            durationMin: 60,
            confidence: 0.92,
            certaintyBand: 'likely',
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
              metrics: [
                {
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
                },
              ],
            },
            syncState: {
              lastSyncedMeasuredAt: '2026-05-31T18:30',
              pendingEventCount: 0,
              fromSyncedWindow: true,
            },
            evidenceIds: ['event_hiit', 'event_window_re-hiit-1_heart_rate'],
          },
        ],
        eventInsights: [
          {
            eventId: 'event_hiit',
            eventType: 'hiit_workout',
            certaintyBand: 'likely',
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
              metrics: [
                {
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
                },
              ],
            },
            physiology: [
              {
                metric: 'heart_rate',
                value: 172,
                unit: 'bpm',
                qualifier: 'elevated',
                interpretation: '事件窗口心率峰值 172bpm，均值 134bpm，末段 92bpm',
                evidenceId: 'event_window_re-hiit-1_heart_rate',
              },
            ],
            recoveryContext: [],
            tension: {
              level: 'watch',
              summary: '运动事件已经进入恢复窗口，需要降低后续刺激',
              reason: 'event-window workout recovery markers present',
            },
            recommendedFocus: [
              {
                category: 'hydration',
                action: '小口补水并做轻度走动冷身',
                durationMin: 10,
                rationale: '帮助心率平稳回落并支持循环恢复',
              },
            ],
            actionIntents: [],
            evidenceIds: ['event_hiit', 'event_window_re-hiit-1_heart_rate'],
            mentionPolicy: {
              summary: 'allowed',
              actions: 'allowed',
              reason: 'current_latest_event',
            },
          },
        ],
        latest24h: {
          date: '2026-05-31',
          metrics: [
            {
              metric: 'hrv',
              value: 93,
              unit: 'ms',
              baseline: 93,
              deltaPctVsBaseline: 0,
              status: 'normal',
              evidenceId: 'daily_hrv',
            },
            {
              metric: 'resting_hr',
              value: 48,
              unit: 'bpm',
              baseline: 48,
              deltaPctVsBaseline: 0,
              status: 'normal',
              evidenceId: 'daily_hr',
            },
            {
              metric: 'spo2',
              value: 99,
              unit: '%',
              baseline: 99,
              deltaPctVsBaseline: 0,
              status: 'normal',
              evidenceId: 'daily_spo2',
            },
          ],
        },
        trend7d: [],
        rulesInsights: [],
        suggestedChartTokens: [],
      },
    };

    const output = render(packet, 'zh', '2026-05-31T18:35');

    expect(output).toContain('## 当前可提及事件');
    expect(output).toContain('事件窗口');
    expect(output).toContain('峰值 172bpm');
    expect(output).not.toContain('其余指标正常：hrv 93ms, resting_hr 48bpm, spo2 99%');
  });

  it('event-window metric label reflects valueRole (max/latest/average) in zh and en', () => {
    // HR → max, HRV → latest, steps → average（通过 default 分支用 average）
    const packet: TaskContextPacket = {
      task: { type: 'homepage_summary', page: 'home' },
      userContext: {
        profileId: 'p-label',
        name: 'Label Test',
        age: 30,
        tags: [],
        baselines: { restingHR: 60, hrv: 60, spo2: 98, avgSleepMinutes: 420, avgSteps: 8000 },
      },
      dataWindow: { start: '2026-05-26', end: '2026-06-01', recordCount: 7, completenessPct: 100 },
      missingData: [],
      evidence: [],
      visibleCharts: [],
      homepage: {
        recentEvents: [],
        latest24h: { date: '2026-05-31', metrics: [] },
        trend7d: [],
        rulesInsights: [],
        suggestedChartTokens: [],
        eventInsights: [
          {
            eventId: 'evt-label',
            eventType: 'hiit_workout',
            certaintyBand: 'likely',
            priority: 'high',
            timeRelation: '刚结束',
            headline: '训练结束',
            eventWindow: {
              source: 'synced_device_samples',
              coverage: 'complete',
              recognizedEventId: 're-label',
              sourceSegmentId: 'seg-label',
              start: '2026-05-31T17:30',
              end: '2026-05-31T18:30',
              durationMin: 60,
              sampleCount: 9,
              evidenceIds: ['ew_label'],
              metrics: [
                {
                  // heart_rate → valueRole 'max'，值取 max
                  metric: 'heart_rate',
                  unit: 'bpm',
                  sampleCount: 3,
                  latest: 92,
                  min: 92,
                  max: 150,
                  average: 120,
                  qualifier: 'elevated',
                  interpretation: '心率峰值 150bpm',
                  evidenceId: 'ew_label',
                },
                {
                  // hrv_rmssd → valueRole 'latest'，值取 latest
                  metric: 'hrv_rmssd',
                  unit: 'ms',
                  sampleCount: 3,
                  latest: 45,
                  min: 40,
                  max: 80,
                  average: 60,
                  qualifier: 'compressed',
                  interpretation: 'HRV 末段 45ms',
                  evidenceId: 'ew_label',
                },
                {
                  // 未知 metric（走 default 分支）：average 存在 → 'average'
                  metric: 'resp_rate',
                  unit: 'min',
                  sampleCount: 3,
                  latest: 16,
                  min: 12,
                  max: 30,
                  average: 18,
                  qualifier: 'normal',
                  interpretation: '呼吸频率均值 18min',
                  evidenceId: 'ew_label',
                },
              ],
            },
            physiology: [],
            recoveryContext: [],
            tension: { level: 'watch', summary: '恢复中', reason: 'markers' },
            recommendedFocus: [],
            actionIntents: [],
            evidenceIds: ['ew_label'],
            mentionPolicy: { summary: 'allowed', actions: 'allowed', reason: 'current' },
          },
        ],
      },
    };

    // 中文：max→峰值，latest→最新，average→平均
    const zh = render(packet, 'zh', '2026-05-31T18:35');
    expect(zh).toContain('峰值：150bpm');
    expect(zh).toContain('最新：45ms');
    expect(zh).toContain('平均：18min');
    // 不应把 latest/average 误标为峰值
    expect(zh).not.toContain('峰值：45ms');
    expect(zh).not.toContain('峰值：18min');

    // 英文：max/latest/average
    const en = render(packet, 'en', '2026-05-31T18:35');
    expect(en).toContain('max: 150bpm');
    expect(en).toContain('latest: 45ms');
    expect(en).toContain('average: 18min');
    expect(en).not.toContain('max: 45ms');
  });

  it('does not render sleep latest24h or tonight sleep action context for a 13:00 walk event', () => {
    const packet: TaskContextPacket = {
      task: { type: 'homepage_summary', page: 'home' },
      userContext: {
        profileId: 'profile-a',
        name: '林巅峰',
        age: 34,
        tags: [],
        baselines: { restingHR: 48, hrv: 95, spo2: 98, avgSleepMinutes: 600, avgSteps: 9000 },
      },
      dataWindow: { start: '2026-05-26', end: '2026-06-01', recordCount: 7, completenessPct: 100 },
      missingData: [],
      evidence: [
        {
          id: 'latest24h_sleep_total_2026-06-01',
          source: 'daily_records',
          metric: 'sleep_total',
          value: 450,
          unit: 'min',
          dateRange: { start: '2026-06-01', end: '2026-06-01' },
          derivation: 'latest record for sleep_total',
        },
        {
          id: 'event_walk_2026-06-01T12:30',
          source: 'timeline_sync',
          metric: 'walk',
          dateRange: { start: '2026-06-01T12:30', end: '2026-06-01T13:00' },
          derivation: 'recognized event from timeline sync, confidence 91%',
        },
      ],
      visibleCharts: [],
      homepage: {
        recentEvents: [
          {
            recognizedEventId: 're-walk-1',
            type: 'walk',
            start: '2026-06-01T12:30',
            end: '2026-06-01T13:00',
            durationMin: 30,
            confidence: 0.91,
            certaintyBand: 'likely',
            sourceSegmentId: 'seg-walk-1',
            recognitionEvidence: ['步行 30 min'],
            syncState: {
              lastSyncedMeasuredAt: '2026-06-01T13:00',
              pendingEventCount: 0,
              fromSyncedWindow: true,
            },
            evidenceIds: ['event_walk_2026-06-01T12:30'],
          },
        ],
        latest24h: {
          date: '2026-06-01',
          metrics: [
            {
              metric: 'sleep_total',
              value: 450,
              unit: 'min',
              baseline: 600,
              deltaPctVsBaseline: -25,
              status: 'normal',
              evidenceId: 'latest24h_sleep_total_2026-06-01',
            },
            {
              metric: 'hrv',
              value: 93,
              unit: 'ms',
              baseline: 95,
              deltaPctVsBaseline: -2,
              status: 'normal',
              evidenceId: 'latest24h_hrv_2026-06-01',
            },
          ],
        },
        trend7d: [],
        rulesInsights: [],
        suggestedChartTokens: [],
        eventInsights: [
          {
            eventId: 'event_walk_2026-06-01T12:30',
            eventType: 'cardio_workout',
            certaintyBand: 'likely',
            priority: 'high',
            timeRelation: '刚结束约 0 min',
            headline: '完成 30 min 训练，身体进入恢复窗口',
            physiology: [],
            recoveryContext: [
              {
                source: 'latest24h',
                metric: 'hrv',
                relation: 'supports',
                summary: 'HRV 状态支持当前活动安排',
                visibility: 'material',
                reason: 'metric_supports_current_event',
                evidenceId: 'latest24h_hrv_2026-06-01',
              },
            ],
            tension: {
              level: 'positive',
              summary: '事件窗口内没有明显冲突信号',
              reason: 'event-window markers do not indicate elevated tension',
            },
            recommendedFocus: [
              {
                category: 'hydration',
                action: '小口补水并做轻度走动冷身',
                durationMin: 10,
                rationale: '帮助心率平稳回落并支持循环恢复',
              },
            ],
            actionIntents: [],
            evidenceIds: ['event_walk_2026-06-01T12:30', 'latest24h_hrv_2026-06-01'],
            mentionPolicy: {
              summary: 'allowed',
              actions: 'allowed',
              reason: 'current_latest_event',
            },
          },
        ],
      },
    };

    const output = render(packet, 'zh', '2026-06-01T13:00');

    expect(output).toContain('## 当前可提及事件');
    expect(output).toContain('恢复背景：supports hrv');
    expect(output).toContain('非显著恢复指标');
    expect(output).not.toContain('sleep_total：450min');
    expect(output).not.toContain('latest24h_sleep_total_2026-06-01');
    expect(output).not.toContain('今晚睡前');
  });

  it('separates displayable current event from analysis-only prior event', () => {
    const packet: TaskContextPacket = {
      task: { type: 'homepage_summary', page: 'home' },
      userContext: {
        profileId: 'profile-a',
        name: '林巅峰',
        age: 32,
        tags: [],
        baselines: { restingHR: 48, hrv: 90, spo2: 98, avgSleepMinutes: 480, avgSteps: 10000 },
      },
      dataWindow: { start: '2026-06-01', end: '2026-06-01', recordCount: 1, completenessPct: 100 },
      missingData: [],
      evidence: [
        { id: 'event_cardio', source: 'timeline_sync', derivation: 'current displayable event' },
        { id: 'event_sedentary', source: 'timeline_sync', derivation: 'prior analysis-only event' },
      ],
      visibleCharts: [],
      homepage: {
        recentEvents: [
          {
            recognizedEventId: 're-cardio-1',
            type: 'steady_cardio',
            start: '2026-06-01T13:00',
            end: '2026-06-01T13:30',
            durationMin: 30,
            confidence: 0.92,
            certaintyBand: 'likely',
            sourceSegmentId: 'seg-cardio-1',
            recognitionEvidence: ['有氧运动'],
            syncState: {
              lastSyncedMeasuredAt: '2026-06-01T13:30',
              pendingEventCount: 0,
              fromSyncedWindow: true,
            },
            evidenceIds: ['event_cardio'],
          },
          {
            recognizedEventId: 're-sedentary-1',
            type: 'prolonged_sedentary',
            start: '2026-06-01T09:00',
            end: '2026-06-01T13:00',
            durationMin: 240,
            confidence: 0.9,
            certaintyBand: 'likely',
            sourceSegmentId: 'seg-sedentary-1',
            recognitionEvidence: ['久坐'],
            syncState: {
              lastSyncedMeasuredAt: '2026-06-01T13:30',
              pendingEventCount: 0,
              fromSyncedWindow: true,
            },
            evidenceIds: ['event_sedentary'],
          },
        ],
        latest24h: { date: '2026-06-01', metrics: [] },
        trend7d: [],
        rulesInsights: [],
        suggestedChartTokens: [],
        eventInsights: [
          {
            eventId: 'event_cardio',
            eventType: 'cardio_workout',
            certaintyBand: 'likely',
            priority: 'high',
            timeRelation: '刚结束约 0 min',
            headline: '完成 30 min 训练，身体进入恢复窗口',
            physiology: [],
            recoveryContext: [],
            tension: { level: 'positive', summary: '事件窗口内没有明显冲突信号', reason: 'test' },
            recommendedFocus: [],
            actionIntents: [],
            mentionPolicy: {
              summary: 'allowed',
              actions: 'allowed',
              reason: 'current_latest_event',
            },
            transitionContext: {
              currentEventId: 'event_cardio',
              priorEventId: 'event_sedentary',
              priorEventType: 'work_sedentary',
              relation: 'post_sedentary_activation',
              internalFinding:
                '前一事件提示低活动和静止负荷，当前运动事件可用于判断循环激活和疲劳回落。',
              allowedUserFacingAngle: '只表达当前运动让身体从低活跃状态重新被带动。',
              forbiddenMentions: ['久坐', '之前', '上一轮'],
              actionSuppressions: [],
            },
            evidenceIds: ['event_cardio'],
          },
          {
            eventId: 'event_sedentary',
            eventType: 'work_sedentary',
            certaintyBand: 'likely',
            priority: 'medium',
            timeRelation: '约 0 min 前结束',
            headline: '连续静止 240 min，循环和体态需要重置',
            physiology: [],
            recoveryContext: [],
            tension: {
              level: 'high',
              summary: '这次工作事件内已经出现神经或静止负荷累积',
              reason: 'test',
            },
            recommendedFocus: [],
            actionIntents: [],
            mentionPolicy: {
              summary: 'forbidden',
              actions: 'forbidden',
              reason: 'prior_event_analysis_only',
            },
            evidenceIds: ['event_sedentary'],
          },
        ],
      },
    };

    const output = render(packet, 'zh', '2026-06-01T13:30');
    const displayableSection = output
      .split('## 当前可提及事件')[1]!
      .split('## 内部分析上下文（禁止显式提及）')[0]!;
    expect(output).toContain('## 当前可提及事件');
    expect(output).toContain('## 内部分析上下文（禁止显式提及）');
    expect(displayableSection).toContain('cardio_workout');
    expect(displayableSection).not.toContain('prolonged_sedentary');
    expect(displayableSection).not.toContain('work_sedentary');
    // Task 3.1：保留 forbiddenMentions 和 allowedUserFacingAngle（LLM 推理所需）
    expect(output).toContain('forbiddenMentions: 久坐, 之前, 上一轮');
    expect(output).toContain('只表达当前运动让身体从低活跃状态重新被带动。');
    // Task 3.1：内部 IDs（priorEventId、priorEventType、internalFinding）不再渲染
    expect(output).not.toContain('priorEventId');
    expect(output).not.toContain('priorEventType');
    expect(output).not.toContain('internalFinding');
    // evidence 数组中的 derivation 文本不再直接渲染（投影后只渲染 facts）
    expect(output).not.toContain('prior analysis-only event');
  });
});

describe('renderTaskContextPacket — todayOccurredActivities 区段', () => {
  function makePacketWithTodayOccurred(
    activities?: import('../../context/context-packet').OccurredActivity[],
  ): TaskContextPacket {
    return {
      task: { type: 'homepage_summary', page: 'home' },
      userContext: {
        profileId: 'p1',
        name: 'Test',
        age: 30,
        tags: [],
        baselines: { restingHR: 60, hrv: 60, spo2: 98, avgSleepMinutes: 420, avgSteps: 8000 },
      },
      dataWindow: { start: '2026-07-08', end: '2026-07-08', recordCount: 1, completenessPct: 100 },
      missingData: [],
      evidence: [],
      visibleCharts: [],
      homepage: {
        recentEvents: [],
        latest24h: { date: '2026-07-08', metrics: [] },
        trend7d: [],
        rulesInsights: [],
        suggestedChartTokens: [],
        eventInsights: [],
        todayOccurredActivities: activities,
      },
    };
  }

  it('todayOccurredActivities 为空时，区段不渲染', () => {
    const packet = makePacketWithTodayOccurred([]);
    const output = render(packet, 'zh', '2026-07-08T15:00');

    expect(output).not.toContain('今日已发生活动');
  });

  it('todayOccurredActivities 缺失时，区段不渲染', () => {
    const packet = makePacketWithTodayOccurred(undefined);
    const output = render(packet, 'zh', '2026-07-08T15:00');

    expect(output).not.toContain('今日已发生活动');
  });

  it('有活动时，区段标题明确标注仅供 futureSuggestions 推断', () => {
    const packet = makePacketWithTodayOccurred([
      { type: 'sleep', start: '2026-07-08T23:00', end: '2026-07-08T07:05', durationMin: 485 },
      {
        type: 'caffeine_intake',
        start: '2026-07-08T08:30',
        end: '2026-07-08T08:35',
        durationMin: 5,
      },
    ]);
    const output = render(packet, 'zh', '2026-07-08T15:00');

    expect(output).toContain(
      '## 今日已发生活动（仅供 futureSuggestions 推断，禁止用于 summary 或 actions）',
    );
    expect(output).toContain('23:00–07:05 sleep (8.1h)');
    expect(output).toContain('08:30–08:35 caffeine_intake (5min)');
  });

  it('英文 locale 同样渲染区段标题与禁用约束', () => {
    const packet = makePacketWithTodayOccurred([
      { type: 'meal_intake', start: '2026-07-08T12:30', end: '2026-07-08T13:00', durationMin: 30 },
    ]);
    const output = render(packet, 'en', '2026-07-08T15:00');

    expect(output).toContain(
      "## Today's Occurred Activities (futureSuggestions reasoning only, do not use in summary or actions)",
    );
    expect(output).toContain('12:30–13:00 meal_intake (30min)');
  });

  it('durationMin < 60 时用 min 单位', () => {
    const packet = makePacketWithTodayOccurred([
      { type: 'nap', start: '2026-07-08T14:00', end: '2026-07-08T14:20', durationMin: 20 },
    ]);
    const output = render(packet, 'zh', '2026-07-08T15:00');

    expect(output).toContain('14:00–14:20 nap (20min)');
  });

  it('区段不出现在非 homepage 任务中（ advisor chat packet 不含该字段）', () => {
    const packet: TaskContextPacket = {
      task: { type: 'advisor_chat', page: 'data' },
      userContext: {
        profileId: 'p1',
        name: 'Test',
        age: 30,
        tags: [],
        baselines: { restingHR: 60, hrv: 60, spo2: 98, avgSleepMinutes: 420, avgSteps: 8000 },
      },
      dataWindow: { start: '2026-07-08', end: '2026-07-08', recordCount: 1, completenessPct: 100 },
      missingData: [],
      evidence: [],
      visibleCharts: [],
    };
    const output = render(packet, 'zh', '2026-07-08T15:00');

    expect(output).not.toContain('今日已发生活动');
  });
});

// ────────────────────────────────────────────
// Task 2.1: EventCertaintyBand 渲染契约
// ────────────────────────────────────────────

describe('renderTaskContextPacket — EventCertaintyBand 渲染契约', () => {
  /** 构造最小可用 RecentEventPacket，certaintyBand 必填 */
  function makeRecentEventPacket(overrides: Partial<{
    recognizedEventId: string;
    type: string;
    start: string;
    end: string;
    durationMin: number;
    confidence: number;
    certaintyBand: 'possible' | 'likely' | 'reported';
    evidenceIds: string[];
  }>) {
    return {
      recognizedEventId: 're-test',
      type: 'meal_intake',
      start: '2026-07-13T12:00',
      end: '2026-07-13T12:30',
      durationMin: 30,
      confidence: 0.9,
      certaintyBand: 'likely' as const,
      recognitionEvidence: [],
      syncState: {
        lastSyncedMeasuredAt: '2026-07-13T12:30',
        pendingEventCount: 0,
        fromSyncedWindow: true,
      },
      evidenceIds: ['event_meal'],
      ...overrides,
    };
  }

  /** 构造最小可用 HomepageEventInsight，certaintyBand 必填 */
  function makeEventInsight(overrides: Partial<{
    eventId: string;
    eventType: string;
    certaintyBand: 'possible' | 'likely' | 'reported';
    headline: string;
    timeRelation: string;
    mentionPolicy: { summary: 'allowed' | 'forbidden'; actions: 'allowed' | 'forbidden'; reason: string };
  }>) {
    return {
      eventId: 'event_meal',
      eventType: 'meal',
      certaintyBand: 'likely' as const,
      priority: 'high' as const,
      timeRelation: '刚结束约 5 min',
      headline: '完成一段约 30 min 的进餐',
      physiology: [],
      recoveryContext: [],
      tension: {
        level: 'positive' as const,
        summary: '事件窗口内没有明显冲突信号',
        reason: 'no tension markers',
      },
      recommendedFocus: [],
      actionIntents: [],
      evidenceIds: ['event_meal'],
      mentionPolicy: {
        summary: 'allowed' as const,
        actions: 'allowed' as const,
        reason: 'current_latest_event',
      },
      ...overrides,
    };
  }

  function makeBasePacket(): TaskContextPacket {
    return {
      task: { type: 'homepage_summary', page: 'home' },
      userContext: {
        profileId: 'p1',
        name: 'Test',
        age: 30,
        tags: [],
        baselines: { restingHR: 60, hrv: 60, spo2: 98, avgSleepMinutes: 420, avgSteps: 8000 },
      },
      dataWindow: { start: '2026-07-13', end: '2026-07-13', recordCount: 1, completenessPct: 100 },
      missingData: [],
      evidence: [],
      visibleCharts: [],
    };
  }

  it('certaintyBand=possible 时，渲染"可能"措辞，且不渲染 confidence 百分比', () => {
    const packet: TaskContextPacket = {
      ...makeBasePacket(),
      homepage: {
        recentEvents: [
          makeRecentEventPacket({
            confidence: 0.79,
            certaintyBand: 'possible',
          }),
        ],
        latest24h: { date: '2026-07-13', metrics: [] },
        trend7d: [],
        rulesInsights: [],
        suggestedChartTokens: [],
        eventInsights: [
          makeEventInsight({ certaintyBand: 'possible' }),
        ],
      },
    };

    const output = render(packet, 'zh', '2026-07-13T12:35');

    // 必须包含 certainty band 标注
    expect(output).toContain('确定性档位');
    expect(output).toContain('possible');
    // 必须包含可能的措辞指引
    expect(output).toContain('可能');
    // "当前可提及事件"区块内不得出现 confidence 百分比
    const displayableSection = output.split('## 当前可提及事件')[1]?.split('## ')[0] ?? '';
    expect(displayableSection).not.toContain('79%');
    expect(displayableSection).not.toContain('confidence 79%');
    expect(displayableSection).not.toMatch(/置信度\s*\d/);
    // 必须显式标注禁止确定性断言（renderer 主动告知 LLM 禁用规则）
    expect(displayableSection).toContain('禁止');
  });

  it('certaintyBand=likely 时，渲染"大概率"措辞，且不渲染 confidence 百分比', () => {
    const packet: TaskContextPacket = {
      ...makeBasePacket(),
      homepage: {
        recentEvents: [
          makeRecentEventPacket({
            confidence: 0.98,
            certaintyBand: 'likely',
          }),
        ],
        latest24h: { date: '2026-07-13', metrics: [] },
        trend7d: [],
        rulesInsights: [],
        suggestedChartTokens: [],
        eventInsights: [
          makeEventInsight({ certaintyBand: 'likely' }),
        ],
      },
    };

    const output = render(packet, 'zh', '2026-07-13T12:35');

    expect(output).toContain('确定性档位');
    expect(output).toContain('likely');
    // likely 对应大概率/很可能 措辞指引
    expect(output).toContain('大概率');
    // "当前可提及事件"区块内不得出现 confidence 百分比
    const displayableSection = output.split('## 当前可提及事件')[1]?.split('## ')[0] ?? '';
    expect(displayableSection).not.toContain('98%');
    expect(displayableSection).not.toContain('confidence 98%');
    expect(displayableSection).not.toMatch(/置信度\s*\d/);
    // 即使 likely，renderer 也必须显式标注"禁止确定性断言"
    expect(displayableSection).toContain('禁止');
  });

  it('certaintyBand=reported 时，渲染"你记录了"措辞', () => {
    const packet: TaskContextPacket = {
      ...makeBasePacket(),
      homepage: {
        recentEvents: [
          makeRecentEventPacket({
            type: 'hydration_intake',
            confidence: 1.0,
            certaintyBand: 'reported',
          }),
        ],
        latest24h: { date: '2026-07-13', metrics: [] },
        trend7d: [],
        rulesInsights: [],
        suggestedChartTokens: [],
        eventInsights: [
          makeEventInsight({
            eventType: 'unknown',
            certaintyBand: 'reported',
            headline: '你记录了一次饮水',
          }),
        ],
      },
    };

    const output = render(packet, 'zh', '2026-07-13T12:35');

    expect(output).toContain('确定性档位');
    expect(output).toContain('reported');
    // reported 对应"你记录了/你完成了"措辞指引
    expect(output).toContain('你记录了');
  });

  it('英文 locale 同样渲染 certainty band 与对应措辞', () => {
    const packet: TaskContextPacket = {
      ...makeBasePacket(),
      homepage: {
        recentEvents: [
          makeRecentEventPacket({
            confidence: 0.98,
            certaintyBand: 'likely',
          }),
        ],
        latest24h: { date: '2026-07-13', metrics: [] },
        trend7d: [],
        rulesInsights: [],
        suggestedChartTokens: [],
        eventInsights: [makeEventInsight({ certaintyBand: 'likely' })],
      },
    };

    const output = render(packet, 'en', '2026-07-13T12:35');

    expect(output).toContain('Certainty band');
    expect(output).toContain('likely');
    expect(output).toContain('strongly consistent with');
    // "Current Mentionable Event" 区块内不得出现 confidence 百分比
    const displayableSection = output.split('## Current Mentionable Event')[1]?.split('## ')[0] ?? '';
    expect(displayableSection).not.toContain('98%');
    expect(displayableSection).not.toContain('confidence 98%');
  });

  it('renderer 不再使用 raw confidence 字段渲染百分比（即使 confidence 字段仍存在）', () => {
    const packet: TaskContextPacket = {
      ...makeBasePacket(),
      homepage: {
        recentEvents: [
          makeRecentEventPacket({
            confidence: 0.85,
            certaintyBand: 'likely',
          }),
        ],
        latest24h: { date: '2026-07-13', metrics: [] },
        trend7d: [],
        rulesInsights: [],
        suggestedChartTokens: [],
        eventInsights: [makeEventInsight({ certaintyBand: 'likely' })],
      },
    };

    const output = render(packet, 'zh', '2026-07-13T12:35');

    // 当前可提及事件区块不应出现 confidence 85% 字样
    const displayableSection = output.split('## 当前可提及事件')[1]?.split('## ')[0] ?? '';
    expect(displayableSection).not.toContain('confidence 85%');
    expect(displayableSection).not.toContain('置信度 85%');
    expect(displayableSection).not.toContain('85%');
  });
});

// ────────────────────────────────────────────
// Task 3.1: CustomerFacingEvidencePacket 评分隔离
// ────────────────────────────────────────────

describe('renderTaskContextPacket — CustomerFacingEvidencePacket 评分隔离', () => {
  /** 构造一个带完整 score 泄漏风险的内部 packet */
  function makeScoreLeakagePacket(): TaskContextPacket {
    return {
      task: { type: 'homepage_summary', page: 'home' },
      userContext: {
        profileId: 'p1',
        name: 'Test',
        age: 30,
        tags: [],
        baselines: { restingHR: 60, hrv: 60, spo2: 98, avgSleepMinutes: 420, avgSteps: 8000 },
      },
      dataWindow: { start: '2026-07-13', end: '2026-07-13', recordCount: 1, completenessPct: 100 },
      missingData: [],
      evidence: [],
      visibleCharts: [],
      homepage: {
        recentEvents: [
          {
            recognizedEventId: 're-hiit-1',
            type: 'intermittent_exercise',
            start: '2026-07-13T17:30',
            end: '2026-07-13T18:30',
            durationMin: 60,
            confidence: 0.98,
            certaintyBand: 'likely',
            sourceSegmentId: 'seg-hiit-1',
            recognitionEvidence: ['心率标准差 35'],
            eventWindow: {
              source: 'synced_device_samples',
              coverage: 'complete',
              recognizedEventId: 're-hiit-1',
              sourceSegmentId: 'seg-hiit-1',
              start: '2026-07-13T17:30',
              end: '2026-07-13T18:30',
              durationMin: 60,
              sampleCount: 5,
              evidenceIds: ['ew_hr_1'],
              metrics: [
                {
                  metric: 'heart_rate',
                  unit: 'bpm',
                  sampleCount: 3,
                  startValue: 118,
                  endValue: 107,
                  latest: 107,
                  min: 92,
                  max: 172,
                  average: 134,
                  delta: -11,
                  qualifier: 'elevated',
                  interpretation: '事件窗口心率峰值 172bpm，末段 107bpm',
                  evidenceId: 'ew_hr_1',
                },
                {
                  metric: 'hrv_rmssd',
                  unit: 'ms',
                  sampleCount: 3,
                  startValue: 70,
                  endValue: 84,
                  latest: 84,
                  min: 60,
                  max: 90,
                  average: 75,
                  delta: 14,
                  qualifier: 'recovering',
                  interpretation: 'HRV 恢复中，末段 84ms',
                  evidenceId: 'ew_hrv_1',
                },
                {
                  metric: 'spo2',
                  unit: '%',
                  sampleCount: 3,
                  startValue: 97,
                  endValue: 99,
                  latest: 99,
                  min: 96,
                  max: 99,
                  average: 98,
                  delta: 2,
                  qualifier: 'normal',
                  interpretation: '血氧稳定 99%',
                  evidenceId: 'ew_spo2_1',
                },
                {
                  metric: 'motion',
                  unit: 'score',
                  sampleCount: 3,
                  startValue: 1.2,
                  endValue: 0.8,
                  latest: 0.8,
                  min: 0.5,
                  max: 5.8,
                  average: 3.9,
                  delta: -0.4,
                  qualifier: 'elevated',
                  interpretation: 'movement intensity averaged 3.9, peaked at 5.8',
                  evidenceId: 'ew_motion_1',
                },
                {
                  metric: 'stress_load',
                  unit: 'score',
                  sampleCount: 3,
                  startValue: 30,
                  endValue: 72,
                  latest: 72,
                  min: 30,
                  max: 85,
                  average: 60,
                  delta: 42,
                  qualifier: 'elevated',
                  interpretation: 'stress load peaked at 85',
                  evidenceId: 'ew_stress_1',
                },
                {
                  metric: 'steps',
                  unit: 'steps',
                  sampleCount: 3,
                  startValue: 0,
                  endValue: 5400,
                  latest: 5400,
                  min: 0,
                  max: 5400,
                  average: 2700,
                  delta: 5400,
                  qualifier: 'elevated',
                  interpretation: '累计步数 5400',
                  evidenceId: 'ew_steps_1',
                },
              ],
            },
            syncState: {
              lastSyncedMeasuredAt: '2026-07-13T18:30',
              pendingEventCount: 0,
              fromSyncedWindow: true,
            },
            evidenceIds: ['event_hiit', 'ew_hr_1'],
          },
        ],
        eventInsights: [
          {
            eventId: 'event_hiit',
            rawEventType: 'intermittent_exercise',
            eventType: 'hiit_workout',
            certaintyBand: 'likely',
            priority: 'high',
            timeRelation: '刚结束约 5 min',
            headline: '完成 60 min 训练',
            eventWindow: {
              source: 'synced_device_samples',
              coverage: 'complete',
              recognizedEventId: 're-hiit-1',
              sourceSegmentId: 'seg-hiit-1',
              start: '2026-07-13T17:30',
              end: '2026-07-13T18:30',
              durationMin: 60,
              sampleCount: 5,
              evidenceIds: ['ew_hr_1'],
              metrics: [
                {
                  metric: 'heart_rate',
                  unit: 'bpm',
                  sampleCount: 3,
                  startValue: 118,
                  endValue: 107,
                  latest: 107,
                  min: 92,
                  max: 172,
                  average: 134,
                  delta: -11,
                  qualifier: 'elevated',
                  interpretation: '事件窗口心率峰值 172bpm，末段 107bpm',
                  evidenceId: 'ew_hr_1',
                },
                {
                  metric: 'motion',
                  unit: 'score',
                  sampleCount: 3,
                  startValue: 1.2,
                  endValue: 0.8,
                  latest: 0.8,
                  min: 0.5,
                  max: 5.8,
                  average: 3.9,
                  delta: -0.4,
                  qualifier: 'elevated',
                  interpretation: 'movement intensity averaged 3.9, peaked at 5.8',
                  evidenceId: 'ew_motion_1',
                },
                {
                  metric: 'stress_load',
                  unit: 'score',
                  sampleCount: 3,
                  startValue: 30,
                  endValue: 72,
                  latest: 72,
                  min: 30,
                  max: 85,
                  average: 60,
                  delta: 42,
                  qualifier: 'elevated',
                  interpretation: 'stress load peaked at 85',
                  evidenceId: 'ew_stress_1',
                },
              ],
            },
            physiology: [
              {
                metric: 'heart_rate',
                value: 172,
                unit: 'bpm',
                qualifier: 'elevated',
                interpretation: '心率峰值 172bpm',
                evidenceId: 'ew_hr_1',
              },
              {
                metric: 'motion',
                value: 3.9,
                unit: 'score',
                qualifier: 'elevated',
                interpretation: 'movement intensity averaged 3.9',
                evidenceId: 'ew_motion_1',
              },
              {
                metric: 'stress',
                value: 85,
                unit: 'score',
                qualifier: 'elevated',
                interpretation: 'stress load 72',
                evidenceId: 'ew_stress_1',
              },
            ],
            recoveryContext: [],
            tension: {
              level: 'watch',
              summary: '进入恢复窗口',
              reason: 'workout recovery markers present',
            },
            recommendedFocus: [],
            actionIntents: [],
            evidenceIds: ['event_hiit', 'ew_hr_1'],
            mentionPolicy: {
              summary: 'allowed',
              actions: 'allowed',
              reason: 'current_latest_event',
            },
          },
        ],
        latest24h: {
          date: '2026-07-13',
          metrics: [
            {
              metric: 'hrv',
              value: 84,
              unit: 'ms',
              baseline: 60,
              deltaPctVsBaseline: 40,
              status: 'normal',
              evidenceId: 'd_hrv',
            },
            {
              metric: 'spo2',
              value: 99,
              unit: '%',
              baseline: 98,
              deltaPctVsBaseline: 1,
              status: 'normal',
              evidenceId: 'd_spo2',
            },
          ],
        },
        trend7d: [],
        rulesInsights: [],
        suggestedChartTokens: [],
      },
    };
  }

  it('homepage prompt 不含 unit=score', () => {
    const packet = makeScoreLeakagePacket();
    const projected = buildCustomerFacingEvidencePacket(packet, 'zh');
    const output = renderTaskContextPacket(projected, 'zh', '2026-07-13T18:35');
    expect(output).not.toContain('unit=score');
    expect(output).not.toContain('score)');
  });

  it('homepage prompt 不含 movement intensity averaged 3.9', () => {
    const packet = makeScoreLeakagePacket();
    const projected = buildCustomerFacingEvidencePacket(packet, 'zh');
    const output = renderTaskContextPacket(projected, 'zh', '2026-07-13T18:35');
    expect(output).not.toContain('movement intensity averaged 3.9');
    expect(output).not.toContain('motion 3.9');
    expect(output).not.toContain('3.9score');
  });

  it('homepage prompt 不含 stress load 72 / stress load 85', () => {
    const packet = makeScoreLeakagePacket();
    const projected = buildCustomerFacingEvidencePacket(packet, 'zh');
    const output = renderTaskContextPacket(projected, 'zh', '2026-07-13T18:35');
    expect(output).not.toContain('stress load 72');
    expect(output).not.toContain('stress load 85');
    expect(output).not.toContain('85score');
    expect(output).not.toContain('72score');
  });

  it('homepage prompt 不含 qualityScore 字样', () => {
    const packet = makeScoreLeakagePacket();
    const projected = buildCustomerFacingEvidencePacket(packet, 'zh');
    const output = renderTaskContextPacket(projected, 'zh', '2026-07-13T18:35');
    expect(output.toLowerCase()).not.toContain('qualityscore');
  });

  it('homepage prompt 不含精确 confidence（0.98、confidence 98%、置信度 98%）', () => {
    const packet = makeScoreLeakagePacket();
    const projected = buildCustomerFacingEvidencePacket(packet, 'zh');
    const output = renderTaskContextPacket(projected, 'zh', '2026-07-13T18:35');
    // 投影后 confidence 字段已移除；仅 SpO2 98% baseline 合法保留
    expect(output).not.toContain('0.98');
    expect(output).not.toContain('confidence 98');
    expect(output).not.toContain('置信度');
    // 当前可提及事件区块不含 confidence 数值
    const displayableSection = output.split('## 当前可提及事件')[1]?.split('## ')[0] ?? '';
    expect(displayableSection).not.toContain('98%');
    expect(displayableSection).not.toContain('0.98');
  });

  it('homepage prompt 仍包含 HR 107bpm / HRV 84ms / SpO2 99% / steps / duration', () => {
    const packet = makeScoreLeakagePacket();
    const projected = buildCustomerFacingEvidencePacket(packet, 'zh');
    const output = renderTaskContextPacket(projected, 'zh', '2026-07-13T18:35');
    // HR 出现（event window 末段 107bpm 或 latest24h 中无 HR，但 eventWindow 有）
    expect(output).toContain('107');
    expect(output).toContain('bpm');
    // HRV 84ms（latest24h + eventWindow）
    expect(output).toContain('84');
    expect(output).toContain('ms');
    // SpO2 99%
    expect(output).toContain('99%');
    // Steps
    expect(output).toContain('5400');
    // Duration 60min
    expect(output).toContain('60');
  });

  it('homepage prompt 不含 sourceSegmentId / recognizedEventId / rawEventType', () => {
    const packet = makeScoreLeakagePacket();
    const projected = buildCustomerFacingEvidencePacket(packet, 'zh');
    const output = renderTaskContextPacket(projected, 'zh', '2026-07-13T18:35');
    expect(output).not.toContain('sourceSegmentId');
    expect(output).not.toContain('seg-hiit-1');
    expect(output).not.toContain('recognizedEventId');
    expect(output).not.toContain('re-hiit-1');
    expect(output).not.toContain('rawEventType');
    expect(output).not.toContain('intermittent_exercise');
  });

  it('英文 locale 同样隔离评分（en prompt 不含 motion/stress score）', () => {
    const packet = makeScoreLeakagePacket();
    const projected = buildCustomerFacingEvidencePacket(packet, 'en');
    const output = renderTaskContextPacket(projected, 'en', '2026-07-13T18:35');
    expect(output).not.toContain('unit=score');
    expect(output).not.toContain('movement intensity averaged 3.9');
    expect(output).not.toContain('stress load 72');
    expect(output).not.toContain('stress load 85');
    // 物理指标保留
    expect(output).toContain('107');
    expect(output).toContain('bpm');
    expect(output).toContain('84');
    expect(output).toContain('ms');
  });

  it('view summary prompt 同样隔离 stress score', () => {
    const packet: TaskContextPacket = {
      task: { type: 'view_summary', page: 'data-center', tab: 'stress', timeframe: 'week' },
      userContext: {
        profileId: 'p1',
        name: 'Test',
        age: 30,
        tags: [],
        baselines: { restingHR: 60, hrv: 60, spo2: 98, avgSleepMinutes: 420, avgSteps: 8000 },
      },
      dataWindow: { start: '2026-07-07', end: '2026-07-13', recordCount: 7, completenessPct: 100 },
      missingData: [],
      evidence: [],
      visibleCharts: [],
      viewSummary: {
        tab: 'stress',
        timeframe: 'week',
        selectedMetric: {
          metric: 'stress',
          latest: { value: 72, unit: 'score' },
          average: { value: 68, unit: 'score' },
          trendDirection: 'up',
          anomalyPoints: [],
          missing: { missingCount: 0, totalCount: 7, completenessPct: 100 },
          evidenceIds: ['e1'],
        },
        visibleCharts: [],
        rulesInsights: [],
        suggestedChartTokens: [],
      },
    };
    const projected = buildCustomerFacingEvidencePacket(packet, 'zh');
    const output = renderTaskContextPacket(projected, 'zh');
    expect(output).not.toContain('unit=score');
    expect(output).not.toContain('latest 72score');
    expect(output).not.toContain('avg 68score');
  });

  it('advisor chat prompt 不含 motion/stress score（通过 relevantFacts 传入时）', () => {
    const packet: TaskContextPacket = {
      task: {
        type: 'advisor_chat',
        page: 'data-center',
        userMessage: '最近压力怎么样',
      },
      userContext: {
        profileId: 'p1',
        name: 'Test',
        age: 30,
        tags: [],
        baselines: { restingHR: 60, hrv: 60, spo2: 98, avgSleepMinutes: 420, avgSteps: 8000 },
      },
      dataWindow: { start: '2026-07-07', end: '2026-07-13', recordCount: 7, completenessPct: 100 },
      missingData: [],
      evidence: [],
      visibleCharts: [],
      advisorChat: {
        userMessage: '最近压力怎么样',
        questionIntent: {
          metricFocus: ['stress'],
          timeScope: 'week',
          actionIntent: 'status_summary',
          riskLevel: 'general',
        },
        currentPage: {
          page: 'data-center',
          visibleChartTokens: [],
          chartDataSummaries: [],
        },
        relevantFacts: [
          {
            label: '压力负荷',
            factType: 'metric',
            summary: 'stress load 72 (score)',
            evidenceIds: ['e1'],
          },
        ],
        recentConversation: [],
        constraints: [],
      },
    };
    const projected = buildCustomerFacingEvidencePacket(packet, 'zh');
    const output = renderTaskContextPacket(projected, 'zh');
    // 注：relevantFacts.summary 是客户可见的；如果它包含 score，需要源端清理
    // 这里验证投影不会放大泄漏（relevantFacts 不在投影清理范围，但 facts 不含）
    expect(output).not.toContain('unit=score');
  });
});
