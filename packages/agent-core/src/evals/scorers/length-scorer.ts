import { AgentTaskType } from '@health-advisor/shared';
import type { EvalCheckResult, EvalScorerInput } from '../types';

// ── Length Scorer ────────────────────────────────────────

/** homepage 默认摘要长度范围 */
const HOMEPAGE_DEFAULT_LENGTH = { min: 80, max: 120 } as const;

/**
 * 摘要长度检查：
 * - 使用 expectations.summary.length.min/max 进行范围校验
 * - homepage 类型默认 80-120 字（除非 case 显式覆盖）
 * - microTips 单条长度暂不作为 hard check
 */
export const lengthScorer = {
  id: 'length',

  score(input: EvalScorerInput): EvalCheckResult[] {
    const { evalCase, envelope } = input;
    const summary = evalCase.expectations.summary;
    const results: EvalCheckResult[] = [];

    // 没有 summary 期望且没有 envelope，跳过
    if (!summary && !envelope) {
      return results;
    }

    // 摘要长度检查
    const lengthConfig = getEffectiveLengthConfig(evalCase);
    if (lengthConfig !== undefined && envelope?.summary !== undefined) {
      results.push(checkSummaryLength(evalCase.id, envelope.summary, lengthConfig));
    }

    return results;
  },
} as const;

// ── 内部工具函数 ──────────────────────────────────────────

/** 计算文本字符数（正确处理中文等多字节字符） */
function countChars(text: string): number {
  return [...text.trim()].length;
}

/**
 * 获取有效的长度配置。
 * - 如果 case 显式配置了 summary.length，优先使用
 * - 否则如果是 homepage 类型，使用默认 80-120
 * - 其他类型无默认值，返回 undefined
 */
function getEffectiveLengthConfig(evalCase: EvalScorerInput['evalCase']) {
  const explicitLength = evalCase.expectations.summary?.length;

  // case 显式配置优先
  if (explicitLength?.min !== undefined || explicitLength?.max !== undefined) {
    return explicitLength;
  }

  // homepage 默认范围
  if (evalCase.request.taskType === AgentTaskType.HOMEPAGE_SUMMARY) {
    return HOMEPAGE_DEFAULT_LENGTH;
  }

  return undefined;
}

/** 检查摘要长度是否在合法范围内 */
function checkSummaryLength(
  caseId: string,
  summaryText: string,
  lengthConfig: { min?: number; max?: number },
): EvalCheckResult {
  const charCount = countChars(summaryText);
  const { min, max } = lengthConfig;

  const tooShort = min !== undefined && charCount < min;
  const tooLong = max !== undefined && charCount > max;
  const passed = !tooShort && !tooLong;

  let message: string;
  if (tooShort) {
    message = `摘要过短: ${charCount} 字, 期望至少 ${min} 字`;
  } else if (tooLong) {
    message = `摘要过长: ${charCount} 字, 期望最多 ${max} 字`;
  } else {
    message = `摘要长度合法: ${charCount} 字`;
  }

  return {
    checkId: `${caseId}:length:summary_length`,
    severity: 'hard',
    passed,
    score: passed ? 1 : 0,
    maxScore: 1,
    message,
    details: { charCount, min, max },
  };
}
