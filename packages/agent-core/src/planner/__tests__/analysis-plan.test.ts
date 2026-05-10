import { describe, it, expect } from 'vitest';
import { AnalysisPlanSchema, MetricType, TimeScope, ActionIntent, SafetyConstraint } from '../analysis-plan';

describe('AnalysisPlanSchema', () => {
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
