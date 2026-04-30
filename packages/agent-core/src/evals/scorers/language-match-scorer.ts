import type { Locale } from '@health-advisor/shared';
import type { EvalCheckResult, EvalScorerInput } from '../types';

// ── Language Match Scorer ──────────────────────────────

/** 中文字符 Unicode 范围匹配 */
const CJK_REGEX = /[\u4e00-\u9fff\u3400-\u4dbf]/g;

/** 检测文本中中文字符占比 */
function chineseRatio(text: string): number {
  const matches = text.match(CJK_REGEX);
  if (!matches) return 0;
  return matches.length / text.length;
}

/**
 * 检测 Agent 响应的 summary 是否为期望的语言。
 * - zh: 中文字符占比 > 30%
 * - en: 中文字符占比 < 10%
 *
 * 仅在 context 中包含 locale 信息时执行，
 * 默认 eval 使用 'zh'。
 */
export const languageMatchScorer = {
  id: 'language_match',

  score(input: EvalScorerInput): EvalCheckResult[] {
    const { evalCase, envelope, artifacts } = input;

    // 没有 envelope 时跳过
    if (!envelope) return [];

    const summary = envelope.summary;
    if (!summary || summary.length < 10) {
      return [{
        checkId: `${evalCase.id}:language_match:summary_language`,
        severity: 'soft',
        passed: false,
        score: 0,
        maxScore: 1,
        message: 'summary 过短，无法判断语言',
      }];
    }

    // 从 context 中获取 locale，默认 'zh'
    const expectedLocale: Locale = artifacts.context?.locale ?? 'zh';

    const ratio = chineseRatio(summary);
    const ratioPercent = (ratio * 100).toFixed(0);

    if (expectedLocale === 'zh') {
      const passed = ratio > 0.3;
      return [{
        checkId: `${evalCase.id}:language_match:summary_language`,
        severity: 'soft',
        passed,
        score: passed ? 1 : 0,
        maxScore: 1,
        message: passed
          ? `中文占比 ${ratioPercent}% > 30%`
          : `中文占比 ${ratioPercent}% <= 30%，期望中文输出`,
        details: { ratio, expectedLocale },
      }];
    }

    // en
    const passed = ratio < 0.1;
    return [{
      checkId: `${evalCase.id}:language_match:summary_language`,
      severity: 'soft',
      passed,
      score: passed ? 1 : 0,
      maxScore: 1,
      message: passed
        ? `英文文本确认（中文占比 ${ratioPercent}% < 10%）`
        : `检测到非预期中文字符（占比 ${ratioPercent}%），期望英文输出`,
      details: { ratio, expectedLocale },
    }];
  },
} as const;
