import type { AnalysisPlan, PlanVerificationResult } from './analysis-plan';

/** Plan 校验上下文配置 */
export interface PlanVerifierContext {
  supportedMetrics: string[];
  maxSummaryLength: number;
  availableDateRange: { start: string; end: string };
}

/**
 * 确定性 plan verifier
 * 校验 AnalysisPlan 的业务规则合法性
 */
export function verifyAnalysisPlan(
  plan: AnalysisPlan,
  ctx: PlanVerifierContext,
): PlanVerificationResult {
  const violations: PlanVerificationResult['violations'] = [];

  // 1. taskType 必须是 advisor_chat（schema 已保证，双重确认）
  if (plan.taskType !== 'advisor_chat') {
    violations.push({
      rule: 'task_type',
      message: 'taskType 必须是 advisor_chat',
      path: 'taskType',
    });
  }

  // 2. metric 必须属于已支持指标集合
  for (let i = 0; i < plan.evidenceNeeds.length; i++) {
    const need = plan.evidenceNeeds[i];
    if (!ctx.supportedMetrics.includes(need.metric)) {
      violations.push({
        rule: 'unsupported_metric',
        message: `不支持的指标: ${need.metric}`,
        path: `evidenceNeeds[${i}].metric`,
      });
    }
  }

  // 3. dateRange 合法性
  for (let i = 0; i < plan.evidenceNeeds.length; i++) {
    const need = plan.evidenceNeeds[i];
    if (need.dateRange) {
      if (need.dateRange.start < ctx.availableDateRange.start ||
          need.dateRange.end > ctx.availableDateRange.end) {
        violations.push({
          rule: 'date_range_out_of_bounds',
          message: 'dateRange 越过可用数据边界',
          path: `evidenceNeeds[${i}].dateRange`,
        });
      }
    }
  }

  // 4. maxSummaryLength 不超过 task route 上限
  if (plan.answerShape.maxSummaryLength > ctx.maxSummaryLength) {
    violations.push({
      rule: 'max_length_exceeded',
      message: `maxSummaryLength ${plan.answerShape.maxSummaryLength} 超过上限 ${ctx.maxSummaryLength}`,
      path: 'answerShape.maxSummaryLength',
    });
  }

  // 5. riskLevel 与高风险意图一致性
  const highRiskActions = ['exercise_readiness'] as const;
  if (highRiskActions.includes(plan.userIntent.action as typeof highRiskActions[number])
      && plan.userIntent.riskLevel !== 'safety_boundary') {
    violations.push({
      rule: 'risk_level_mismatch',
      message: `action "${plan.userIntent.action}" 应标记为 safety_boundary`,
      path: 'userIntent.riskLevel',
    });
  }

  // 6. required evidence 必须可从 TaskContextPacket 中解析
  // 注意：unsupported 的 metric 已由规则 2 报告，此处只检查 supported 但不可解析的情况
  // TODO: P2 集成后可增加 packet 级别的 evidence 可用性检查
  for (let i = 0; i < plan.evidenceNeeds.length; i++) {
    const need = plan.evidenceNeeds[i];
    if (need.required && ctx.supportedMetrics.includes(need.metric)) {
      // 当前 verifier 无 packet 上下文，supported metric 暂视为可解析
      // 未来可结合 packet.evidence 和 visibleCharts 做精确检查
    }
  }

  return { valid: violations.length === 0, violations };
}
