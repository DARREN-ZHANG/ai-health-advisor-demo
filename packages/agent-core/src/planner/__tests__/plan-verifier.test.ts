import { describe, it, expect } from 'vitest';
import { verifyAnalysisPlan } from '../analysis-plan-verifier';
import type { AnalysisPlan } from '../analysis-plan';

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
      { metric: 'hrv', timeScope: 'week', reason: 'HRV 分析', required: true },
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

/** 默认 verifier 上下文 */
function createContext(overrides?: Record<string, unknown>) {
  return {
    supportedMetrics: ['hrv', 'sleep', 'activity', 'stress', 'spo2', 'resting-hr'],
    maxSummaryLength: 800,
    availableDateRange: { start: '2025-01-01', end: '2025-12-31' },
    ...overrides,
  };
}

describe('verifyAnalysisPlan', () => {
  it('合法 plan 通过校验', () => {
    const result = verifyAnalysisPlan(createPlan(), createContext());
    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  // 规则 1: taskType
  it('taskType 非 advisor_chat 时违规', () => {
    // 构造不合法的 plan（绕过类型系统）
    const plan = createPlan() as Record<string, unknown>;
    plan.taskType = 'homepage';
    const result = verifyAnalysisPlan(plan as AnalysisPlan, createContext());
    expect(result.valid).toBe(false);
    expect(result.violations[0]!.rule).toBe('task_type');
  });

  // 规则 2: unsupported metric
  it('metric 不在 supportedMetrics 时违规', () => {
    const result = verifyAnalysisPlan(
      createPlan({
        evidenceNeeds: [{ metric: 'hrv', timeScope: 'week', reason: 'HRV', required: true }],
      }),
      createContext({ supportedMetrics: ['sleep', 'activity'] }),
    );
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.rule === 'unsupported_metric')).toBe(true);
  });

  // 规则 3: dateRange 越界
  it('dateRange 超出可用范围时违规', () => {
    const result = verifyAnalysisPlan(
      createPlan({
        evidenceNeeds: [{
          metric: 'hrv', timeScope: 'week',
          dateRange: { start: '2024-01-01', end: '2024-12-31' },
          reason: 'HRV', required: true,
        }],
      }),
      createContext({ availableDateRange: { start: '2025-01-01', end: '2025-12-31' } }),
    );
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.rule === 'date_range_out_of_bounds')).toBe(true);
  });

  // 规则 4: maxSummaryLength
  it('maxSummaryLength 超过上限时违规', () => {
    const result = verifyAnalysisPlan(
      createPlan({
        answerShape: {
          includeMissingDataDisclosure: true, includeChartTokens: false,
          maxSummaryLength: 1000, tone: 'concise',
        },
      }),
      createContext({ maxSummaryLength: 500 }),
    );
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.rule === 'max_length_exceeded')).toBe(true);
  });

  // 规则 5: riskLevel 一致性
  it('exercise_readiness 意图但 riskLevel 非 safety_boundary 时违规', () => {
    const result = verifyAnalysisPlan(
      createPlan({
        userIntent: { action: 'exercise_readiness', riskLevel: 'general', needsClarification: false },
      }),
      createContext(),
    );
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.rule === 'risk_level_mismatch')).toBe(true);
  });

  it('exercise_readiness + safety_boundary 通过', () => {
    const result = verifyAnalysisPlan(
      createPlan({
        userIntent: { action: 'exercise_readiness', riskLevel: 'safety_boundary', needsClarification: false },
      }),
      createContext(),
    );
    expect(result.valid).toBe(true);
  });

  // 规则 6: required evidence 可用性（C-2）
  it('required evidence metric 不在 availablePacketMetrics 时违规（C-2）', () => {
    const result = verifyAnalysisPlan(
      createPlan({
        evidenceNeeds: [
          { metric: 'hrv', timeScope: 'week', reason: 'HRV', required: true },
        ],
      }),
      createContext({
        availablePacketMetrics: ['sleep', 'activity'], // 不包含 hrv
      }),
    );
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.rule === 'required_evidence_not_available')).toBe(true);
  });

  it('required evidence metric 在 availablePacketMetrics 时通过（C-2）', () => {
    const result = verifyAnalysisPlan(
      createPlan({
        evidenceNeeds: [
          { metric: 'hrv', timeScope: 'week', reason: 'HRV', required: true },
        ],
      }),
      createContext({
        availablePacketMetrics: ['hrv', 'sleep'],
      }),
    );
    expect(result.valid).toBe(true);
  });

  it('optional evidence metric 不在 availablePacketMetrics 时不违规（C-2）', () => {
    const result = verifyAnalysisPlan(
      createPlan({
        evidenceNeeds: [
          { metric: 'hrv', timeScope: 'week', reason: 'HRV', required: false },
        ],
      }),
      createContext({
        availablePacketMetrics: ['sleep'],
      }),
    );
    expect(result.valid).toBe(true);
  });

  it('无 availablePacketMetrics 时不触发规则 6', () => {
    const result = verifyAnalysisPlan(
      createPlan({
        evidenceNeeds: [
          { metric: 'hrv', timeScope: 'week', reason: 'HRV', required: true },
        ],
      }),
      createContext({}), // 无 availablePacketMetrics
    );
    expect(result.valid).toBe(true);
  });

  // 多规则同时触发
  it('多规则同时违规时返回所有 violations', () => {
    const result = verifyAnalysisPlan(
      createPlan({
        userIntent: { action: 'exercise_readiness', riskLevel: 'general', needsClarification: false },
        answerShape: {
          includeMissingDataDisclosure: true, includeChartTokens: false,
          maxSummaryLength: 1000, tone: 'concise',
        },
      }),
      createContext({ maxSummaryLength: 500 }),
    );
    expect(result.valid).toBe(false);
    expect(result.violations.length).toBeGreaterThanOrEqual(2);
    const rules = result.violations.map((v) => v.rule);
    expect(rules).toContain('risk_level_mismatch');
    expect(rules).toContain('max_length_exceeded');
  });
});
