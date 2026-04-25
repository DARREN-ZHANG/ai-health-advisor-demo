import { ChartTokenId } from '@health-advisor/shared';
import { MAX_CHART_TOKENS } from '../../constants/limits';
import type { EvalCheckResult, EvalScorerInput } from '../types';

// ── Token Scorer ─────────────────────────────────────────

/** 合法的 ChartTokenId 值集合 */
const VALID_TOKEN_IDS = new Set<string>(Object.values(ChartTokenId));

/**
 * ChartToken 检查：
 * - 所有 token 合法（在 ChartTokenId enum values 内）
 * - maxCount 不超过配置（默认 MAX_CHART_TOKENS = 2）
 * - required：所有 token 必须出现
 * - requiredAny：每组中至少一个出现
 * - allowed：token 只能出现在允许列表中
 * - forbidden：token 不能出现
 */
export const tokenScorer = {
  id: 'token',

  score(input: EvalScorerInput): EvalCheckResult[] {
    const { evalCase, envelope } = input;
    const chartTokens = evalCase.expectations.chartTokens;
    const results: EvalCheckResult[] = [];

    // 没有 token 期望或没有 envelope，跳过
    if (!chartTokens || !envelope) {
      return results;
    }

    const tokens = envelope.chartTokens;

    // 检查 1：所有 token 合法
    results.push(checkTokenValidity(evalCase.id, tokens));

    // 检查 2：token 数量不超过 maxCount
    const maxCount = chartTokens.maxCount ?? MAX_CHART_TOKENS;
    results.push(checkTokenCount(evalCase.id, tokens, maxCount));

    // 检查 3：required token 全部出现
    if (chartTokens.required && chartTokens.required.length > 0) {
      results.push(checkRequired(evalCase.id, tokens, chartTokens.required));
    }

    // 检查 4：requiredAny 至少一组命中
    if (chartTokens.requiredAny && chartTokens.requiredAny.length > 0) {
      results.push(checkRequiredAny(evalCase.id, tokens, chartTokens.requiredAny));
    }

    // 检查 5：allowed 白名单
    if (chartTokens.allowed && chartTokens.allowed.length > 0) {
      results.push(checkAllowed(evalCase.id, tokens, chartTokens.allowed));
    }

    // 检查 6：forbidden 禁止列表
    if (chartTokens.forbidden && chartTokens.forbidden.length > 0) {
      results.push(checkForbidden(evalCase.id, tokens, chartTokens.forbidden));
    }

    return results;
  },
} as const;

// ── 内部检查函数 ──────────────────────────────────────────

/** 检查所有 token 是否为合法的 ChartTokenId */
function checkTokenValidity(caseId: string, tokens: string[]): EvalCheckResult {
  const invalidTokens = tokens.filter((t) => !VALID_TOKEN_IDS.has(t));
  const passed = invalidTokens.length === 0;
  return {
    checkId: `${caseId}:token:validity`,
    severity: 'hard',
    passed,
    score: passed ? 1 : 0,
    maxScore: 1,
    message: passed
      ? `所有 token 合法 (${tokens.length} 个)`
      : `存在非法 token: ${invalidTokens.join(', ')}`,
    details: passed ? undefined : { invalidTokens },
  };
}

/** 检查 token 数量是否超过上限 */
function checkTokenCount(caseId: string, tokens: string[], maxCount: number): EvalCheckResult {
  const count = tokens.length;
  const passed = count <= maxCount;
  return {
    checkId: `${caseId}:token:count`,
    severity: 'hard',
    passed,
    score: passed ? 1 : 0,
    maxScore: 1,
    message: passed
      ? `token 数量合法: ${count}/${maxCount}`
      : `token 数量超限: ${count} > ${maxCount}`,
    details: { count, maxCount },
  };
}

/** 检查 required token 全部出现 */
function checkRequired(caseId: string, tokens: string[], required: string[]): EvalCheckResult {
  const tokenSet = new Set(tokens);
  const missing = required.filter((r) => !tokenSet.has(r));
  const passed = missing.length === 0;
  return {
    checkId: `${caseId}:token:required`,
    severity: 'hard',
    passed,
    score: passed ? 1 : 0,
    maxScore: 1,
    message: passed
      ? '所有 required token 均出现'
      : `缺少 required token: ${missing.join(', ')}`,
    details: passed ? undefined : { missing },
  };
}

/** 检查 requiredAny 至少每组命中一个 */
function checkRequiredAny(caseId: string, tokens: string[], requiredAny: string[][]): EvalCheckResult {
  const tokenSet = new Set(tokens);
  // 检查每组是否至少命中一个
  const groupResults = requiredAny.map((group) => group.some((t) => tokenSet.has(t)));
  const failedGroups = groupResults
    .map((groupPassed, idx) => (!groupPassed ? idx : -1))
    .filter((idx) => idx >= 0);
  const passed = failedGroups.length === 0;

  // 构造失败信息
  const failedDescriptions = failedGroups.map((i) => requiredAny[i]!.join('|')).join('], [');
  return {
    checkId: `${caseId}:token:required_any`,
    severity: 'hard',
    passed,
    score: passed ? 1 : 0,
    maxScore: 1,
    message: passed
      ? '所有 requiredAny 组均命中'
      : `requiredAny 第 ${failedGroups.map((i) => i + 1).join(', ')} 组未命中: [${failedDescriptions}]`,
    details: passed
      ? undefined
      : { failedGroups: failedGroups.map((i) => requiredAny[i]!) },
  };
}

/** 检查 token 是否全部在允许列表中 */
function checkAllowed(caseId: string, tokens: string[], allowed: string[]): EvalCheckResult {
  const allowedSet = new Set(allowed);
  const outsideAllowed = tokens.filter((t) => !allowedSet.has(t));
  const passed = outsideAllowed.length === 0;
  return {
    checkId: `${caseId}:token:allowed`,
    severity: 'soft',
    passed,
    score: passed ? 1 : 0,
    maxScore: 1,
    message: passed
      ? '所有 token 均在允许列表中'
      : `存在不在允许列表中的 token: ${outsideAllowed.join(', ')}`,
    details: passed ? undefined : { outsideAllowed },
  };
}

/** 检查 forbidden token 未出现 */
function checkForbidden(caseId: string, tokens: string[], forbidden: string[]): EvalCheckResult {
  const forbiddenSet = new Set(forbidden);
  const found = tokens.filter((t) => forbiddenSet.has(t));
  const passed = found.length === 0;
  return {
    checkId: `${caseId}:token:forbidden`,
    severity: 'hard',
    passed,
    score: passed ? 1 : 0,
    maxScore: 1,
    message: passed
      ? '无 forbidden token'
      : `出现 forbidden token: ${found.join(', ')}`,
    details: passed ? undefined : { found },
  };
}
