/**
 * Task 4.1：唯一的 Locale-Aware Homepage Summary Length Policy
 *
 * 这是 homepage summary 长度的唯一来源（single source of truth）。
 * 以下三处必须全部消费本模块，不得各自维护硬编码常量：
 * - prompt（task-builder.ts）：把数字注入 LLM 指令
 * - runtime verifier（verifier.ts）：发布前确定性检查
 * - eval scorer（length-scorer.ts）：回归验收
 *
 * 同时 Task 3.3 的 realtime-brief-content-policy.ts 也消费本模块，
 * 保证阻断式策略与回归门禁的边界完全一致。
 *
 * 计数器规范：
 * - 英文：Intl.Segmenter('en', { granularity: 'word' })，仅统计 isWordLike 的 segment
 * - 中文：Intl.Segmenter('zh', { granularity: 'grapheme' })，每个 grapheme cluster 计 1
 *
 * summary 固定为三个段落（事件观察、证据解释、建议与引导），
 * actions 不计入 summary 长度。本模块只负责"给定文本"的计数与边界判断，
 * 段落结构由 homepage 模板在 prompt 层强制。
 */
import type { Locale } from '@health-advisor/shared';

// ── 常量 ─────────────────────────────────────────────────

/**
 * Homepage summary 长度策略。
 * - en：词数（word），90-180（含两端）
 * - zh：grapheme cluster 数，220-420（含两端）
 */
export const HOMEPAGE_SUMMARY_LENGTH = Object.freeze({
  en: Object.freeze({ min: 90, max: 180, unit: 'word' as const }),
  zh: Object.freeze({ min: 220, max: 420, unit: 'grapheme' as const }),
});

// ── 类型 ─────────────────────────────────────────────────

export type HomepageLengthUnit = 'word' | 'grapheme';

export interface HomepageLengthConfig {
  readonly min: number;
  readonly max: number;
  readonly unit: HomepageLengthUnit;
}

export type HomepageLengthLocale = 'en' | 'zh';

export interface HomepageLengthValidationOk {
  readonly ok: true;
  readonly actual: number;
  readonly min: number;
  readonly max: number;
  readonly unit: HomepageLengthUnit;
}

export interface HomepageLengthValidationFail {
  readonly ok: false;
  readonly reason: 'too_short' | 'too_long';
  readonly actual: number;
  readonly min: number;
  readonly max: number;
  readonly unit: HomepageLengthUnit;
}

export type HomepageLengthValidationResult =
  | HomepageLengthValidationOk
  | HomepageLengthValidationFail;

// ── 公开工具：locale 归一化 ──────────────────────────────

/**
 * 把外部 locale（可能是 'zh-CN'、'en-US' 等变种）归一化为策略支持的二选一。
 * - 任何以 'zh' 开头的 locale → 'zh'
 * - 其他（含 'en'、'en-US'、undefined、未知 locale）→ 'en'
 *
 * 这是 locale 归一化的唯一来源（single source of truth）。
 * 所有消费方（scorer / verifier / realtime-brief-content-policy）
 * 必须消费本函数，不得各自维护 inline 副本。
 *
 * 注意：未知 locale 默认归为 'en'。若调用方需要不同的默认值
 * （例如 eval scorer 默认中文），应在调用本函数前显式处理。
 */
export function normalizeHomepageLocale(locale: string | undefined): HomepageLengthLocale {
  if (typeof locale === 'string' && locale.toLowerCase().startsWith('zh')) {
    return 'zh';
  }
  return 'en';
}

// ── 内部工具：Segmenter 缓存 ─────────────────────────────

/**
 * Segmenter 构造相对昂贵，按 locale 缓存。
 * Node 16+ 原生支持 Intl.Segmenter。
 */
const segmenterCache = new Map<HomepageLengthLocale, Intl.Segmenter>();

function getSegmenter(locale: HomepageLengthLocale): Intl.Segmenter {
  const cached = segmenterCache.get(locale);
  if (cached) return cached;

  const segmenter =
    locale === 'en'
      ? new Intl.Segmenter('en', { granularity: 'word' })
      : new Intl.Segmenter('zh', { granularity: 'grapheme' });

  segmenterCache.set(locale, segmenter);
  return segmenter;
}

// ── 公开 API ─────────────────────────────────────────────

/**
 * 按 locale 规范计数 summary 文本长度。
 * - en：只统计 isWordLike=true 的 word segment（标点、空白不计）
 * - zh：统计所有 grapheme cluster（含中文标点）
 *
 * 纯函数：相同输入永远产生相同输出，无副作用。
 */
export function countHomepageSummaryLength(
  text: string,
  locale: HomepageLengthLocale | Locale | string,
): number {
  const normalized = normalizeHomepageLocale(typeof locale === 'string' ? locale : String(locale));
  const segmenter = getSegmenter(normalized);

  if (normalized === 'en') {
    let count = 0;
    for (const seg of segmenter.segment(text)) {
      if (seg.isWordLike) count++;
    }
    return count;
  }

  // zh：每个 grapheme cluster 计 1
  let count = 0;
  for (const seg of segmenter.segment(text)) {
    count++;
    // seg 在 grapheme granularity 下没有 isWordLike 字段，统一计 1
  }
  return count;
}

/**
 * 校验 summary 长度是否落在 locale 对应的合法范围（含两端）。
 *
 * 返回结构化结果，避免抛异常。调用方据此判断是否阻断。
 */
export function validateHomepageSummaryLength(
  text: string,
  locale: HomepageLengthLocale | Locale | string,
): HomepageLengthValidationResult {
  const normalized = normalizeHomepageLocale(typeof locale === 'string' ? locale : String(locale));
  const config = HOMEPAGE_SUMMARY_LENGTH[normalized];
  const actual = countHomepageSummaryLength(text, normalized);

  const base = {
    actual,
    min: config.min,
    max: config.max,
    unit: config.unit,
  };

  if (actual < config.min) {
    return { ok: false, reason: 'too_short', ...base };
  }
  if (actual > config.max) {
    return { ok: false, reason: 'too_long', ...base };
  }
  return { ok: true, ...base };
}

/**
 * 获取指定 locale 的长度配置（不可变）。
 * 用于 prompt builder 等需要把数字注入文案的场景。
 */
export function getHomepageLengthConfig(
  locale: HomepageLengthLocale | Locale | string,
): HomepageLengthConfig {
  const normalized = normalizeHomepageLocale(typeof locale === 'string' ? locale : String(locale));
  return HOMEPAGE_SUMMARY_LENGTH[normalized];
}
