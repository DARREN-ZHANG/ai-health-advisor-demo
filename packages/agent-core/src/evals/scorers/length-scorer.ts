import { AgentTaskType, type Locale } from '@health-advisor/shared';
import type { EvalCheckResult, EvalScorerInput } from '../types';
// Task 4.1：homepage summary 长度的唯一来源
import {
  HOMEPAGE_SUMMARY_LENGTH,
  countHomepageSummaryLength,
  getHomepageLengthConfig,
} from '../../policies/homepage-length-policy';

// ── Length Scorer ────────────────────────────────────────

/**
 * 摘要长度检查：
 * - 使用 expectations.summary.length.min/max 进行范围校验（显式配置优先）
 * - homepage 类型默认范围来自共享策略 HOMEPAGE_SUMMARY_LENGTH：
 *   - zh：220-420 grapheme
 *   - en：90-180 word
 * - 计数器统一为 Intl.Segmenter（与 verifier/realtime-brief-content-policy 完全一致）
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
    const locale = normalizeLocale(artifacts.context?.locale);
    const lengthConfig = getEffectiveLengthConfig(evalCase, locale);
    if (lengthConfig !== undefined && envelope?.summary !== undefined) {
      results.push(checkSummaryLength(evalCase.id, envelope.summary, lengthConfig, locale));
    }

    return results;
  },
} as const;

// ── 内部工具函数 ──────────────────────────────────────────

/**
 * 把 AgentContext.locale（可能是 'zh-CN' 等变种）归一化为共享策略支持的 locale。
 * 共享策略内部也会做一次归一化，这里提前做是为了取 config。
 */
function normalizeLocale(locale: Locale | string | undefined): Locale {
  if (typeof locale === 'string' && locale.toLowerCase().startsWith('zh')) return 'zh';
  if (typeof locale === 'string' && locale.toLowerCase().startsWith('en')) return 'en';
  return 'zh';
}

/**
 * 获取有效的长度配置。
 * - 如果 case 显式配置了 summary.length，优先使用
 * - 否则如果是 homepage 类型，使用共享策略的默认范围
 * - 其他类型无默认值，返回 undefined
 *
 * 注意：homepage 默认范围与 verifier / realtime-brief-content-policy 完全一致，
 * 三处都消费 HOMEPAGE_SUMMARY_LENGTH，杜绝漂移。
 */
function getEffectiveLengthConfig(evalCase: EvalScorerInput['evalCase'], locale: Locale = 'zh') {
  const explicitLength = evalCase.expectations.summary?.length;

  // case 显式配置优先
  if (explicitLength?.min !== undefined || explicitLength?.max !== undefined) {
    return explicitLength;
  }

  // homepage 默认范围来自共享策略
  if (evalCase.request.taskType === AgentTaskType.HOMEPAGE_SUMMARY) {
    const config = getHomepageLengthConfig(locale);
    return { min: config.min, max: config.max };
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
  // Task 4.1：计数器统一为 Intl.Segmenter
  const count = countHomepageSummaryLength(summaryText, locale);
  // unit 来自共享策略（用于消息展示），保持与 verifier 一致
  const unit = HOMEPAGE_SUMMARY_LENGTH[locale].unit;
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
