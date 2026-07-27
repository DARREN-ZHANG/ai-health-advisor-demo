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

describe('verifyAnalysisPlan — UI 控制计划', () => {
  function createUiPlan(overrides?: Record<string, unknown>): AnalysisPlan {
    return AnalysisPlanSchema.parse({
      planId: 'plan-ui-001',
      taskType: 'advisor_chat',
      userIntent: {
        action: 'control_ui',
        riskLevel: 'general',
        needsClarification: false,
      },
      evidenceNeeds: [],
      safetyConstraints: ['no_diagnosis'],
      answerShape: {
        includeMissingDataDisclosure: false,
        includeChartTokens: false,
        maxSummaryLength: 120,
        tone: 'concise',
      },
      clientAction: { type: 'homepage.trend-card.set', display: 'sleep' },
      ...overrides,
    });
  }

  it('合法纯 UI sleep 计划通过校验', () => {
    const result = verifyAnalysisPlan(createUiPlan(), createValidContext());
    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('合法纯 UI activity 计划通过校验', () => {
    const plan = createUiPlan({
      clientAction: { type: 'homepage.trend-card.set', display: 'activity' },
    });
    const result = verifyAnalysisPlan(plan, createValidContext());
    expect(result.valid).toBe(true);
  });

  it('合法纯 UI hidden 计划通过校验', () => {
    const plan = createUiPlan({
      clientAction: { type: 'homepage.trend-card.set', display: 'hidden' },
    });
    const result = verifyAnalysisPlan(plan, createValidContext());
    expect(result.valid).toBe(true);
  });

  it('control_ui 缺失 clientAction 触发 ui_action_required', () => {
    const plan = createUiPlan();
    const mutated = { ...plan, clientAction: undefined } as unknown as AnalysisPlan;
    const result = verifyAnalysisPlan(mutated, createValidContext());
    expect(result.valid).toBe(false);
    expect(result.violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rule: 'ui_action_required' }),
      ]),
    );
  });

  it('control_ui 同时携带 evidence 触发 ui_control_has_evidence', () => {
    const plan = createUiPlan({
      evidenceNeeds: [
        {
          metric: 'sleep',
          timeScope: 'week',
          reason: '不该出现',
          required: true,
        },
      ],
    });
    const result = verifyAnalysisPlan(plan, createValidContext());
    expect(result.valid).toBe(false);
    expect(result.violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rule: 'ui_control_has_evidence' }),
      ]),
    );
  });

  it('control_ui 同时携带 webSearchNeeds 触发 ui_control_has_evidence', () => {
    const plan = createUiPlan({
      webSearchNeeds: [
        {
          query: 'sleep research',
          reason: '不该出现',
          required: true,
        },
      ],
    });
    const result = verifyAnalysisPlan(plan, createValidContext());
    expect(result.valid).toBe(false);
    expect(result.violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rule: 'ui_control_has_evidence' }),
      ]),
    );
  });

  it('control_ui riskLevel 非 general 触发 ui_control_risk_mismatch', () => {
    const plan = createUiPlan({
      userIntent: {
        action: 'control_ui',
        riskLevel: 'safety_boundary',
        needsClarification: false,
      },
    });
    const result = verifyAnalysisPlan(plan, createValidContext());
    expect(result.valid).toBe(false);
    expect(result.violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rule: 'ui_control_risk_mismatch' }),
      ]),
    );
  });

  it('clarification 携带 clientAction 触发 ui_action_during_clarification', () => {
    const plan = createUiPlan({
      userIntent: {
        action: 'control_ui',
        riskLevel: 'general',
        needsClarification: true,
        clarificationQuestion: '你想看 Sleep 还是 Activity？',
      },
    });
    const result = verifyAnalysisPlan(plan, createValidContext());
    expect(result.valid).toBe(false);
    expect(result.violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rule: 'ui_action_during_clarification' }),
      ]),
    );
  });

  it('clarification 且无 clientAction 时合法（不触发 ui_action_during_clarification）', () => {
    const plan = AnalysisPlanSchema.parse({
      planId: 'plan-clar',
      taskType: 'advisor_chat',
      userIntent: {
        action: 'general',
        riskLevel: 'general',
        needsClarification: true,
        clarificationQuestion: '你想看哪个？',
      },
      evidenceNeeds: [],
      safetyConstraints: ['no_diagnosis'],
      answerShape: {
        includeMissingDataDisclosure: false,
        includeChartTokens: false,
        maxSummaryLength: 120,
        tone: 'concise',
      },
    });
    const result = verifyAnalysisPlan(plan, createValidContext());
    expect(result.valid).toBe(true);
  });
});

describe('verifyAnalysisPlan — 混合 UI + 健康问答', () => {
  it('健康 action 携带 clientAction 通过校验（mixed 意图）', () => {
    const plan = AnalysisPlanSchema.parse({
      planId: 'plan-mix-001',
      taskType: 'advisor_chat',
      userIntent: {
        action: 'status_summary',
        riskLevel: 'general',
        needsClarification: false,
      },
      evidenceNeeds: [
        {
          metric: 'sleep',
          timeScope: 'week',
          dateRange: { start: '2025-06-01', end: '2025-06-07' },
          reason: '用户询问睡眠',
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
      clientAction: { type: 'homepage.trend-card.set', display: 'sleep' },
    });
    const result = verifyAnalysisPlan(plan, createValidContext());
    expect(result.valid).toBe(true);
  });

  it('普通健康问答无 clientAction 通过校验', () => {
    const plan = createValidPlan();
    const result = verifyAnalysisPlan(plan, createValidContext());
    expect(result.valid).toBe(true);
    expect(plan.clientAction).toBeUndefined();
  });
});
