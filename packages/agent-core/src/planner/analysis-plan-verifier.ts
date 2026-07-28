import type { AnalysisPlan, PlanVerificationResult } from './analysis-plan';

/** Plan 校验上下文配置 */
export interface PlanVerifierContext {
  supportedMetrics: string[];
  maxSummaryLength: number;
  availableDateRange: { start: string; end: string };
  /** C-2: 当前 packet 中有数据的 metric 集合（可选，无 packet 时为空） */
  availablePacketMetrics?: string[];
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
    if (!need) continue;
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
    if (!need) continue;
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

  // 6. required evidence 的 metric 在 packet 中应有对应数据源
  // C-2: 恢复规则 6 实质校验
  const availablePacketMetrics = new Set(ctx.availablePacketMetrics ?? []);
  if (availablePacketMetrics.size > 0) {
    for (let i = 0; i < plan.evidenceNeeds.length; i++) {
      const need = plan.evidenceNeeds[i]!;
      if (need.required && !availablePacketMetrics.has(need.metric)) {
        violations.push({
          rule: 'required_evidence_not_available',
          message: `必需指标 ${need.metric} 在当前数据包中无对应数据源`,
          path: `evidenceNeeds[${i}].metric`,
        });
      }
    }
  }

  // 7. UI 控制计划约束（首页 Trends Brief）
  verifyUiControlPlan(plan, violations);

  // 8. 可执行计划是独立响应形态，不允许 Planner 同时要求趋势图表。
  if (
    plan.userIntent.action === 'create_plan' &&
    plan.answerShape.includeChartTokens
  ) {
    violations.push({
      rule: 'plan_response_has_charts',
      message: 'create_plan 必须将 includeChartTokens 设为 false',
      path: 'answerShape.includeChartTokens',
    });
  }

  return { valid: violations.length === 0, violations };
}

/**
 * 校验 control_ui / clientAction 的业务约束。
 *
 * 约束总结（与 advisor-plan.md prompt 对齐）：
 * - action='control_ui' 时必须有 clientAction（ui_action_required）
 * - action='control_ui' 时不得有 evidence/webSearch（ui_control_has_evidence）
 * - action='control_ui' 时 riskLevel 必须是 general（ui_control_risk_mismatch）
 * - clarification=true 时不得带 clientAction（ui_action_during_clarification）
 * - 健康 action（非 control_ui）允许带 clientAction（mixed 意图），不视为违规
 */
function verifyUiControlPlan(
  plan: AnalysisPlan,
  violations: PlanVerificationResult['violations'],
): void {
  const isControlUiAction = plan.userIntent.action === 'control_ui';
  const hasClientAction = plan.clientAction != null;

  if (isControlUiAction && !hasClientAction) {
    violations.push({
      rule: 'ui_action_required',
      message: 'action="control_ui" 必须提供 clientAction',
      path: 'clientAction',
    });
  }

  if (isControlUiAction) {
    // 纯 UI 不允许携带 evidence 或 webSearch
    const hasEvidence = plan.evidenceNeeds.length > 0;
    const hasWebSearch = (plan.webSearchNeeds?.length ?? 0) > 0;
    if (hasEvidence || hasWebSearch) {
      violations.push({
        rule: 'ui_control_has_evidence',
        message: 'control_ui 计划不得携带 evidenceNeeds 或 webSearchNeeds',
        path: hasEvidence ? 'evidenceNeeds' : 'webSearchNeeds',
      });
    }

    // riskLevel 必须是 general（UI 控制与安全语义无关）
    if (plan.userIntent.riskLevel !== 'general') {
      violations.push({
        rule: 'ui_control_risk_mismatch',
        message: `control_ui riskLevel 必须为 general，实际为 ${plan.userIntent.riskLevel}`,
        path: 'userIntent.riskLevel',
      });
    }
  }

  // clarification 时禁止 clientAction（避免澄清前产生副作用）
  if (plan.userIntent.needsClarification && hasClientAction) {
    violations.push({
      rule: 'ui_action_during_clarification',
      message: 'clarification 阶段不得附带 clientAction',
      path: 'clientAction',
    });
  }
}
