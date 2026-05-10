import { describe, it, expect } from 'vitest';
import { AnalysisPlanSchema } from '../analysis-plan';
import { verifyAnalysisPlan } from '../analysis-plan-verifier';
import type { AnalysisPlan } from '../analysis-plan';
import type { PlanVerifierContext } from '../analysis-plan-verifier';

/** 构造一个合法的默认校验上下文 */
function createValidContext(): PlanVerifierContext {
  return {
    supportedMetrics: ['hrv', 'sleep', 'activity', 'stress', 'spo2', 'resting-hr'],
    maxSummaryLength: 500,
    availableDateRange: { start: '2025-01-01', end: '2025-12-31' },
  };
}

/** 构造一个合法的 AnalysisPlan 对象 */
function createValidPlan(): AnalysisPlan {
  return AnalysisPlanSchema.parse({
    planId: 'plan-001',
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
        reason: '评估本周 HRV 趋势',
        required: true,
      },
    ],
    safetyConstraints: ['no_diagnosis', 'disclose_missing_data'],
    answerShape: {
      includeMissingDataDisclosure: true,
      includeChartTokens: false,
      maxSummaryLength: 300,
      tone: 'concise',
    },
  });
}

describe('verifyAnalysisPlan', () => {
  it('合法 plan 应返回 valid: true，无 violations', () => {
    const plan = createValidPlan();
    const ctx = createValidContext();
    const result = verifyAnalysisPlan(plan, ctx);

    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('不支持的 metric 应产生 unsupported_metric violation', () => {
    const plan = createValidPlan();
    // 使用类型断言绕过 schema 类型，模拟 LLM 输出了不支持的 metric
    const mutated = {
      ...plan,
      evidenceNeeds: [
        { ...plan.evidenceNeeds[0], metric: 'blood_pressure' },
      ],
    } as unknown as AnalysisPlan;

    const ctx = createValidContext();
    const result = verifyAnalysisPlan(mutated, ctx);

    expect(result.valid).toBe(false);
    expect(result.violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rule: 'unsupported_metric' }),
      ]),
    );
  });

  it('dateRange 越界应产生 date_range_out_of_bounds violation', () => {
    const plan = createValidPlan();
    const mutated = {
      ...plan,
      evidenceNeeds: [
        {
          ...plan.evidenceNeeds[0],
          dateRange: { start: '2024-01-01', end: '2026-01-01' },
        },
      ],
    };

    const ctx = createValidContext();
    const result = verifyAnalysisPlan(mutated, ctx);

    expect(result.valid).toBe(false);
    expect(result.violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rule: 'date_range_out_of_bounds' }),
      ]),
    );
  });

  it('exercise_readiness 未标记 safety_boundary 应产生 risk_level_mismatch violation', () => {
    const plan = createValidPlan();
    const mutated = {
      ...plan,
      userIntent: {
        ...plan.userIntent,
        action: 'exercise_readiness',
        riskLevel: 'general',
      },
    };

    const ctx = createValidContext();
    const result = verifyAnalysisPlan(mutated, ctx);

    expect(result.valid).toBe(false);
    expect(result.violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rule: 'risk_level_mismatch' }),
      ]),
    );
  });

  it('maxSummaryLength 超限应产生 max_length_exceeded violation', () => {
    const plan = createValidPlan();
    const mutated = {
      ...plan,
      answerShape: {
        ...plan.answerShape,
        maxSummaryLength: 1000,
      },
    };

    const ctx = createValidContext();
    const result = verifyAnalysisPlan(mutated, ctx);

    expect(result.valid).toBe(false);
    expect(result.violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rule: 'max_length_exceeded' }),
      ]),
    );
  });

  it('unsupported metric 只触发 unsupported_metric，不重复触发 required_evidence_unresolvable', () => {
    const plan = createValidPlan();
    // 使用类型断言模拟 required evidence 不可解析的情况
    const mutated = {
      ...plan,
      evidenceNeeds: [
        { ...plan.evidenceNeeds[0], metric: 'blood_pressure', required: true },
      ],
    } as unknown as AnalysisPlan;

    const ctx = createValidContext();
    const result = verifyAnalysisPlan(mutated, ctx);

    expect(result.valid).toBe(false);
    // 应只有 unsupported_metric，不应有 required_evidence_unresolvable（避免重复）
    expect(result.violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rule: 'unsupported_metric' }),
      ]),
    );
    expect(result.violations).toEqual(
      expect.not.arrayContaining([
        expect.objectContaining({ rule: 'required_evidence_unresolvable' }),
      ]),
    );
  });
});
