import type { EvalCheckResult, EvalScorerInput } from '../types';

// ── Status Scorer ────────────────────────────────────────

/**
 * 状态颜色检查：
 * - expectedStatusColor 精确匹配
 * - 或 allowedStatusColors 包含实际值
 */
export const statusScorer = {
  id: 'status',

  score(input: EvalScorerInput): EvalCheckResult[] {
    const { evalCase, envelope } = input;
    const status = evalCase.expectations.status;
    const results: EvalCheckResult[] = [];

    // 没有状态期望或没有 envelope，跳过
    if (!status || !envelope) {
      return results;
    }

    // 没有设置任何期望值，跳过
    if (status.expectedStatusColor === undefined && status.allowedStatusColors === undefined) {
      return results;
    }

    results.push(checkStatusColor(evalCase.id, envelope.statusColor, status));

    return results;
  },
} as const;

// ── 内部检查函数 ──────────────────────────────────────────

/** 检查 statusColor 是否匹配期望 */
function checkStatusColor(
  caseId: string,
  actualColor: string,
  status: { expectedStatusColor?: string; allowedStatusColors?: string[] },
): EvalCheckResult {
  const { expectedStatusColor, allowedStatusColors } = status;

  // 精确匹配优先
  if (expectedStatusColor !== undefined) {
    const passed = actualColor === expectedStatusColor;
    return {
      checkId: `${caseId}:status:color_match`,
      severity: 'hard',
      passed,
      score: passed ? 1 : 0,
      maxScore: 1,
      message: passed
        ? `statusColor 匹配: ${expectedStatusColor}`
        : `statusColor 不匹配: 期望 ${expectedStatusColor}, 实际 ${actualColor}`,
      details: { expected: expectedStatusColor, actual: actualColor },
    };
  }

  // allowedStatusColors 包含检查
  if (allowedStatusColors !== undefined) {
    const passed = allowedStatusColors.includes(actualColor);
    return {
      checkId: `${caseId}:status:color_allowed`,
      severity: 'hard',
      passed,
      score: passed ? 1 : 0,
      maxScore: 1,
      message: passed
        ? `statusColor 在允许列表中: ${actualColor}`
        : `statusColor 不在允许列表中: 实际 ${actualColor}, 允许 [${allowedStatusColors.join(', ')}]`,
      details: { allowed: allowedStatusColors, actual: actualColor },
    };
  }

  // 不应到达此处（前面已做守卫），但作为安全兜底
  return {
    checkId: `${caseId}:status:color_match`,
    severity: 'hard',
    passed: true,
    score: 1,
    maxScore: 1,
    message: '无状态颜色期望配置，默认通过',
  };
}
