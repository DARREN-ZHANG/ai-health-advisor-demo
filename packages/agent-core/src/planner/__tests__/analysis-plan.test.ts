import { describe, it, expect } from 'vitest';
import { AnalysisPlanSchema, MetricType, TimeScope, ActionIntent, SafetyConstraint, WebSearchNeedSchema } from '../analysis-plan';

/** 构造最小合法的 AnalysisPlan */
function createValidPlan(overrides?: Record<string, unknown>) {
  return {
    planId: 'plan-test-001',
    taskType: 'advisor_chat',
    userIntent: {
      action: 'status_summary',
      riskLevel: 'general',
      needsClarification: false,
    },
    evidenceNeeds: [
      {
        metric: 'hrv',
        timeScope: 'week',
        dateRange: { start: '2025-06-01', end: '2025-06-07' },
        reason: '用户询问 HRV',
        required: true,
      },
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

describe('AnalysisPlanSchema', () => {

  it('合法 plan 通过校验', () => {
    const result = AnalysisPlanSchema.safeParse(createValidPlan());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.planId).toBe('plan-test-001');
      expect(result.data.evidenceNeeds).toHaveLength(1);
    }
  });

  it('缺少 planId 时校验失败', () => {
    const { planId, ...noId } = createValidPlan();
    const result = AnalysisPlanSchema.safeParse(noId);
    expect(result.success).toBe(false);
  });

  it('taskType 非 advisor_chat 时校验失败', () => {
    const result = AnalysisPlanSchema.safeParse(createValidPlan({ taskType: 'homepage' }));
    expect(result.success).toBe(false);
  });

  it('riskLevel 支持 general、potential_risk、safety_boundary（C-4）', () => {
    for (const level of ['general', 'potential_risk', 'safety_boundary'] as const) {
      const result = AnalysisPlanSchema.safeParse(
        createValidPlan({ userIntent: { action: 'status_summary', riskLevel: level, needsClarification: false } }),
      );
      expect(result.success).toBe(true);
    }
  });

  it('riskLevel 为非法值时校验失败', () => {
    const result = AnalysisPlanSchema.safeParse(
      createValidPlan({ userIntent: { action: 'status_summary', riskLevel: 'high', needsClarification: false } }),
    );
    expect(result.success).toBe(false);
  });

  it('actionIntent 支持 6 种值（含 compare_periods，H-6）', () => {
    const validActions = ['status_summary', 'explain_chart', 'ask_why', 'exercise_readiness', 'compare_periods', 'general'];
    for (const action of validActions) {
      const result = AnalysisPlanSchema.safeParse(
        createValidPlan({ userIntent: { action, riskLevel: 'general', needsClarification: false } }),
      );
      expect(result.success).toBe(true);
    }
  });

  it('evidenceNeeds 为空数组时校验通过', () => {
    const result = AnalysisPlanSchema.safeParse(createValidPlan({ evidenceNeeds: [] }));
    expect(result.success).toBe(true);
  });

  it('maxSummaryLength 为 0 时校验失败', () => {
    const result = AnalysisPlanSchema.safeParse(
      createValidPlan({ answerShape: { includeMissingDataDisclosure: true, includeChartTokens: false, maxSummaryLength: 0, tone: 'concise' } }),
    );
    expect(result.success).toBe(false);
  });

  it('dateRange 为可选字段', () => {
    const plan = createValidPlan({
      evidenceNeeds: [{ metric: 'hrv', timeScope: 'week', reason: 'HRV', required: true }],
    });
    const result = AnalysisPlanSchema.safeParse(plan);
    expect(result.success).toBe(true);
  });
});

describe('导出的枚举', () => {
  it('MetricType 包含 6 种指标', () => {
    const values = MetricType.options;
    expect(values).toEqual(['hrv', 'sleep', 'activity', 'stress', 'spo2', 'resting-hr']);
  });

  it('TimeScope 包含 6 种时间范围', () => {
    const values = TimeScope.options;
    expect(values).toEqual(['today', 'yesterday', 'week', 'month', 'custom', 'unknown']);
  });

  it('ActionIntent 包含 6 种意图', () => {
    const values = ActionIntent.options;
    expect(values).toContain('compare_periods');
    expect(values).toHaveLength(6);
  });

  it('SafetyConstraint 包含 5 种约束', () => {
    const values = SafetyConstraint.options;
    expect(values).toHaveLength(5);
    expect(values).toContain('disclose_missing_data');
  });
});

describe('webSearchNeeds', () => {
  it('接受合法 webSearchNeeds', () => {
    const result = AnalysisPlanSchema.safeParse(createValidPlan({
      evidenceNeeds: [],
      webSearchNeeds: [
        {
          query: 'latest caffeine sleep research 2026',
          reason: '用户询问最新公开研究，现有本地健康数据无法覆盖',
          required: true,
          topic: 'general',
          timeRange: 'year',
          includeDomains: ['nih.gov'],
          excludeDomains: ['example.com'],
        },
      ],
    }));

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.webSearchNeeds).toHaveLength(1);
      expect(result.data.webSearchNeeds?.[0]?.query).toBe('latest caffeine sleep research 2026');
    }
  });

  it('缺少 webSearchNeeds 时仍保持向后兼容', () => {
    const result = AnalysisPlanSchema.safeParse(createValidPlan());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.webSearchNeeds).toBeUndefined();
    }
  });

  it('拒绝过短 query', () => {
    const result = WebSearchNeedSchema.safeParse({
      query: 'ai',
      reason: 'query 过短',
      required: true,
    });

    expect(result.success).toBe(false);
  });

  it('拒绝非法 topic 和 timeRange', () => {
    const result = AnalysisPlanSchema.safeParse(createValidPlan({
      webSearchNeeds: [
        {
          query: 'recent sleep guideline',
          reason: '用户询问外部指南',
          required: false,
          topic: 'finance',
          timeRange: 'hour',
        },
      ],
    }));

    expect(result.success).toBe(false);
  });
});
