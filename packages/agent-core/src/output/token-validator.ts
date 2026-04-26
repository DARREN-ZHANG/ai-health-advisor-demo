import { ChartTokenId, isValidChartTokenId } from '@health-advisor/shared';
import { MAX_CHART_TOKENS } from '../constants/limits';

export interface TokenValidationResult {
  valid: ChartTokenId[];
  invalid: unknown[];
}

/**
 * 校验 chart token 白名单。
 * - 仅允许 shared ChartTokenId 枚举值（字符串）
 * - 对象 token 被过滤
 * - 超过 MAX_CHART_TOKENS 截断
 * - 如果提供了 allowedTokens，则只允许该列表中的 token
 */
export function validateChartTokens(
  tokens: unknown[],
  allowedTokens?: ChartTokenId[],
): TokenValidationResult {
  const valid: ChartTokenId[] = [];
  const invalid: unknown[] = [];
  const allowedSet = allowedTokens ? new Set(allowedTokens.map((t) => t as string)) : null;

  for (const token of tokens) {
    if (typeof token === 'string' && isValidChartTokenId(token)) {
      if (allowedSet && !allowedSet.has(token)) {
        invalid.push(token);
        continue;
      }
      if (valid.length < MAX_CHART_TOKENS) {
        valid.push(token);
      }
    } else {
      invalid.push(token);
    }
  }

  return { valid, invalid };
}
