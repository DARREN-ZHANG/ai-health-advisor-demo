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
 */
export function validateChartTokens(tokens: unknown[]): TokenValidationResult {
  const valid: ChartTokenId[] = [];
  const invalid: unknown[] = [];

  for (const token of tokens) {
    if (typeof token === 'string' && isValidChartTokenId(token)) {
      if (valid.length < MAX_CHART_TOKENS) {
        valid.push(token);
      }
    } else {
      invalid.push(token);
    }
  }

  return { valid, invalid };
}
