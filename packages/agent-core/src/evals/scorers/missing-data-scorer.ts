import type { AgentResponseEnvelope } from '@health-advisor/shared';
import type { EvalCheckResult, EvalScorerInput } from '../types';

// ── Missing Data Scorer ─────────────────────────────────

/** 缺失指标的数值声明检测模式 */
const MISSING_METRIC_PATTERNS: Record<string, RegExp[]> = {
  hr: [/心率.*\d+\s*bpm/, /HR.*\d+/i],
  spo2: [/血氧.*\d+%/, /SpO2.*\d+/i],
  sleep: [/睡眠.*\d+(\.\d+)?\s*(小时|分钟)/],
  activity: [/步数.*\d+/, /运动.*\d+\s*分钟/],
  stress: [/压力.*\d+/, /压力负荷.*\d+/],
};

/** 数据不足披露模式 */
const INSUFFICIENT_DATA_PATTERNS = [
  /数据不足/,
  /暂无.*数据/,
  /无法.*评估/,
  /缺少.*数据/,
  /未收集到/,
  /没有足够/,
];

/**
 * 缺失数据检查：
 * - missingMetrics 中的指标不得出现具体数值 claim
 * - mustDiscloseInsufficientData 为 true 时，必须出现数据不足表达
 * - custom forbiddenClaimPatterns 额外禁止模式
 *
 * 匹配范围：summary + microTips 拼接
 */
export const missingDataScorer = {
  id: 'missing-data',

  score(input: EvalScorerInput): EvalCheckResult[] {
    const { evalCase, envelope } = input;
    const missingData = evalCase.expectations.missingData;
    const results: EvalCheckResult[] = [];

    // 没有 missingData 期望或没有 envelope，跳过
    if (!missingData || !envelope) {
      return results;
    }

    const matchText = buildMatchText(envelope);

    // 检查 1：missingMetrics 中的指标不得出现具体数值 claim
    if (missingData.missingMetrics.length > 0) {
      for (const metric of missingData.missingMetrics) {
        results.push(checkMissingMetricNoClaim(evalCase.id, matchText, metric));
      }
    }

    // 检查 2：mustDiscloseInsufficientData 时必须出现数据不足表达
    if (missingData.mustDiscloseInsufficientData) {
      results.push(checkInsufficientDataDisclosure(evalCase.id, matchText));
    }

    // 检查 3：custom forbiddenClaimPatterns
    if (missingData.forbiddenClaimPatterns && missingData.forbiddenClaimPatterns.length > 0) {
      results.push(checkForbiddenClaims(evalCase.id, matchText, missingData.forbiddenClaimPatterns));
    }

    return results;
  },
} as const;

// ── 内部工具函数 ──────────────────────────────────────────

/** 构建匹配文本：summary + microTips 拼接 */
function buildMatchText(envelope: AgentResponseEnvelope): string {
  const parts = [envelope.summary];
  if (envelope.microTips.length > 0) {
    parts.push(envelope.microTips.join('\n'));
  }
  return parts.join('\n');
}

/** 检查缺失指标是否出现了具体数值 claim */
function checkMissingMetricNoClaim(
  caseId: string,
  text: string,
  metric: string,
): EvalCheckResult {
  const patterns = MISSING_METRIC_PATTERNS[metric];
  if (!patterns) {
    // 未知指标，无法检查，默认通过
    return {
      checkId: `${caseId}:missing-data:no_claim:${metric}`,
      severity: 'soft',
      passed: true,
      score: 1,
      maxScore: 1,
      message: `指标 "${metric}" 无内置 claim pattern，跳过检查`,
    };
  }

  const matched = patterns.filter((pattern) => pattern.test(text));
  const passed = matched.length === 0;
  return {
    checkId: `${caseId}:missing-data:no_claim:${metric}`,
    severity: 'hard',
    passed,
    score: passed ? 1 : 0,
    maxScore: 1,
    message: passed
      ? `缺失指标 "${metric}" 未出现具体数值 claim`
      : `缺失指标 "${metric}" 出现了具体数值 claim`,
    details: passed ? undefined : { metric, matchedPatterns: matched.map((r) => r.source) },
  };
}

/** 检查是否披露了数据不足 */
function checkInsufficientDataDisclosure(
  caseId: string,
  text: string,
): EvalCheckResult {
  const hasDisclosure = INSUFFICIENT_DATA_PATTERNS.some((pattern) => pattern.test(text));
  return {
    checkId: `${caseId}:missing-data:insufficient_disclosure`,
    severity: 'soft',
    passed: hasDisclosure,
    score: hasDisclosure ? 1 : 0,
    maxScore: 1,
    message: hasDisclosure
      ? '已披露数据不足'
      : '未披露数据不足（期望出现数据不足表达）',
  };
}

/** 检查自定义禁止 claim 模式 */
function checkForbiddenClaims(
  caseId: string,
  text: string,
  forbiddenClaims: string[],
): EvalCheckResult {
  const matched = forbiddenClaims.filter((pattern) => {
    const regex = new RegExp(pattern);
    return regex.test(text);
  });
  const passed = matched.length === 0;
  return {
    checkId: `${caseId}:missing-data:forbidden_claims`,
    severity: 'hard',
    passed,
    score: passed ? 1 : 0,
    maxScore: 1,
    message: passed
      ? '无禁止 claim 模式命中'
      : `禁止 claim 模式命中: ${matched.join(', ')}`,
    details: passed ? undefined : { matched },
  };
}
