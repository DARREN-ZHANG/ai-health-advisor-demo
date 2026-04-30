import { AgentTaskType, type Locale } from '@health-advisor/shared';
import type { EvalCheckResult, EvalScorerInput } from '../types';

// ── Length Scorer ────────────────────────────────────────

/** homepage 中文默认摘要长度范围（按字符计数） */
const HOMEPAGE_DEFAULT_LENGTH_ZH = { min: 80, max: 120 } as const;

/** homepage 英文默认摘要长度范围（按单词计数） */
const HOMEPAGE_DEFAULT_LENGTH_EN = { min: 50, max: 100 } as const;

/**
 * 摘要长度检查：
 * - 使用 expectations.summary.length.min/max 进行范围校验
 * - homepage 类型默认：中文 80-120 字符，英文 50-100 单词
 * - microTips 单条长度暂不作为 hard check
 */
export const lengthScorer = {
  id: 'length',

  score(input: EvalScorerInput): EvalCheckResult[] {
    const { evalCase, envelope, artifacts } = input;
    const summary = evalCase.expectations.summary;
    const results: EvalCheckResult[] = [];

    // 没有 summary 期望且没有 envelope，跳过
    if (!summary && !envelope) {
      return results;
    }

    // 摘要长度检查
    const locale = artifacts.context?.locale ?? 'zh';
    const lengthConfig = getEffectiveLengthConfig(evalCase, locale);
    if (lengthConfig !== undefined && envelope?.summary !== undefined) {
      results.push(checkSummaryLength(evalCase.id, envelope.summary, lengthConfig, locale));
    }

    return results;
  },
} as const;

// ── 内部工具函数 ──────────────────────────────────────────

/** 计算文本字符数（正确处理中文等多字节字符） */
function countChars(text: string): number {
  return [...text.trim()].length;
}

/** 计算英文单词数 */
function countWords(text: string): number {
  const trimmed = text.trim();
  if (trimmed.length === 0) return 0;
  return trimmed.split(/\s+/).length;
}

/** 根据语言选择计数方式：英文按单词，中文按字符 */
function countLength(text: string, locale: Locale): { count: number; unit: string } {
  if (locale === 'en') {
    return { count: countWords(text), unit: 'words' };
  }
  return { count: countChars(text), unit: '字' };
}

/**
 * 获取有效的长度配置。
 * - 如果 case 显式配置了 summary.length，优先使用
 * - 否则如果是 homepage 类型，根据 locale 使用默认范围
 * - 其他类型无默认值，返回 undefined
 */
function getEffectiveLengthConfig(evalCase: EvalScorerInput['evalCase'], locale: Locale = 'zh') {
  const explicitLength = evalCase.expectations.summary?.length;

  // case 显式配置优先
  if (explicitLength?.min !== undefined || explicitLength?.max !== undefined) {
    return explicitLength;
  }

  // homepage 默认范围（按语言区分）
  if (evalCase.request.taskType === AgentTaskType.HOMEPAGE_SUMMARY) {
    return locale === 'en' ? HOMEPAGE_DEFAULT_LENGTH_EN : HOMEPAGE_DEFAULT_LENGTH_ZH;
  }

  return undefined;
}

/** 检查摘要长度是否在合法范围内 */
function checkSummaryLength(
  caseId: string,
  summaryText: string,
  lengthConfig: { min?: number; max?: number },
  locale: Locale,
): EvalCheckResult {
  const { count, unit } = countLength(summaryText, locale);
  const { min, max } = lengthConfig;

  const tooShort = min !== undefined && count < min;
  const tooLong = max !== undefined && count > max;
  const passed = !tooShort && !tooLong;

  let message: string;
  if (tooShort) {
    message = `摘要过短: ${count} ${unit}, 期望至少 ${min} ${unit}`;
  } else if (tooLong) {
    message = `摘要过长: ${count} ${unit}, 期望最多 ${max} ${unit}`;
  } else {
    message = `摘要长度合法: ${count} ${unit}`;
  }

  return {
    checkId: `${caseId}:length:summary_length`,
    severity: 'hard',
    passed,
    score: passed ? 1 : 0,
    maxScore: 1,
    message,
    details: { count, unit, min, max },
  };
}
