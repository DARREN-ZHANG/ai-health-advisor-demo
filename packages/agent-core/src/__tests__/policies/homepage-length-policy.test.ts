import { describe, it, expect } from 'vitest';
import {
  HOMEPAGE_SUMMARY_LENGTH,
  countHomepageSummaryLength,
  validateHomepageSummaryLength,
} from '../../policies/homepage-length-policy';

// ── 工具：构造指定词数的英文文本 ─────────────────────────
/** 拼接 N 个英文单词，每个单词形如 word0 word1 ... */
function buildEnWords(n: number): string {
  return Array.from({ length: n }, (_, i) => `word${i}`).join(' ');
}

// ── 工具：构造指定 grapheme 数的中文文本 ─────────────────
/** 拼接 N 个中文字符（每个视为一个 grapheme cluster） */
function buildZhGraphemes(n: number): string {
  // 用 Unicode 基本区汉字，每个为 1 个 grapheme
  const base = 0x4e00; // 一
  return Array.from({ length: n }, (_, i) => String.fromCodePoint(base + (i % 0x1000))).join('');
}

describe('HOMEPAGE_SUMMARY_LENGTH', () => {
  it('英文：90-180 词', () => {
    expect(HOMEPAGE_SUMMARY_LENGTH.en).toEqual({ min: 90, max: 180, unit: 'word' });
  });

  it('中文：220-420 grapheme', () => {
    expect(HOMEPAGE_SUMMARY_LENGTH.zh).toEqual({ min: 220, max: 420, unit: 'grapheme' });
  });

  it('常量冻结（as const）', () => {
    // 冻结对象在运行时不可变；这里只验证字段存在且为字面量类型
    expect(Object.isFrozen(HOMEPAGE_SUMMARY_LENGTH)).toBe(true);
  });
});

describe('countHomepageSummaryLength', () => {
  it('英文：计数 N 个空格分隔的单词', () => {
    const text = buildEnWords(90);
    expect(countHomepageSummaryLength(text, 'en')).toBe(90);
  });

  it('英文：标点不计入单词数', () => {
    // 5 个词 + 标点
    const text = 'Hello, world! Foo bar baz.';
    expect(countHomepageSummaryLength(text, 'en')).toBe(5);
  });

  it('英文：连字符单词按 Intl.Segmenter 拆分（well-being = 2 个 word）', () => {
    // Intl.Segmenter granularity=word 把连字符视为分隔，well-being 计为 2 个 word-like segment
    // 这与旧的 split(/\s+/) 行为不同（旧实现会把它计为 1 词），
    // 统一计数器正是为了消除这种差异
    const text = 'well-being is important';
    expect(countHomepageSummaryLength(text, 'en')).toBe(4);
  });

  it('英文：多空格不影响计数', () => {
    const a = 'foo bar baz';
    const b = 'foo   bar    baz';
    expect(countHomepageSummaryLength(a, 'en')).toBe(countHomepageSummaryLength(b, 'en'));
    expect(countHomepageSummaryLength(a, 'en')).toBe(3);
  });

  it('中文：计数 grapheme cluster 数量', () => {
    const text = buildZhGraphemes(220);
    expect(countHomepageSummaryLength(text, 'zh')).toBe(220);
  });

  it('中文：中文标点也是 grapheme cluster（计数包含标点）', () => {
    // 中文标点。、！各为 1 个 grapheme cluster
    const text = '你好。世界！';
    // 6 个 grapheme：你 好 。 世 界 ！
    expect(countHomepageSummaryLength(text, 'zh')).toBe(6);
  });

  it('空字符串英文返回 0', () => {
    expect(countHomepageSummaryLength('', 'en')).toBe(0);
  });

  it('空字符串中文返回 0', () => {
    expect(countHomepageSummaryLength('', 'zh')).toBe(0);
  });

  it('zh-CN 也归为 zh 计数（locale 归一化）', () => {
    const text = buildZhGraphemes(220);
    expect(countHomepageSummaryLength(text, 'zh-CN')).toBe(220);
  });
});

describe('validateHomepageSummaryLength - 英文边界', () => {
  it('89 词：失败（低于下限）', () => {
    const text = buildEnWords(89);
    const result = validateHomepageSummaryLength(text, 'en');
    expect(result.ok).toBe(false);
    expect(result.actual).toBe(89);
    expect(result.reason).toBe('too_short');
  });

  it('90 词：通过（刚好下限）', () => {
    const text = buildEnWords(90);
    const result = validateHomepageSummaryLength(text, 'en');
    expect(result.ok).toBe(true);
  });

  it('180 词：通过（刚好上限）', () => {
    const text = buildEnWords(180);
    const result = validateHomepageSummaryLength(text, 'en');
    expect(result.ok).toBe(true);
  });

  it('181 词：失败（超过上限）', () => {
    const text = buildEnWords(181);
    const result = validateHomepageSummaryLength(text, 'en');
    expect(result.ok).toBe(false);
    expect(result.actual).toBe(181);
    expect(result.reason).toBe('too_long');
  });
});

describe('validateHomepageSummaryLength - 中文边界', () => {
  it('219 grapheme：失败（低于下限）', () => {
    const text = buildZhGraphemes(219);
    const result = validateHomepageSummaryLength(text, 'zh');
    expect(result.ok).toBe(false);
    expect(result.actual).toBe(219);
    expect(result.reason).toBe('too_short');
  });

  it('220 grapheme：通过（刚好下限）', () => {
    const text = buildZhGraphemes(220);
    const result = validateHomepageSummaryLength(text, 'zh');
    expect(result.ok).toBe(true);
  });

  it('420 grapheme：通过（刚好上限）', () => {
    const text = buildZhGraphemes(420);
    const result = validateHomepageSummaryLength(text, 'zh');
    expect(result.ok).toBe(true);
  });

  it('421 grapheme：失败（超过上限）', () => {
    const text = buildZhGraphemes(421);
    const result = validateHomepageSummaryLength(text, 'zh');
    expect(result.ok).toBe(false);
    expect(result.actual).toBe(421);
    expect(result.reason).toBe('too_long');
  });
});

describe('validateHomepageSummaryLength - 一致性', () => {
  it('带标点、连字符和多空格的英文计数一致', () => {
    // 90 个简单词（无连字符），混入标点和多空格
    const words = Array.from({ length: 90 }, (_, i) => `w${i}`);
    const text = words.join(' ') + '! ';
    const result = validateHomepageSummaryLength(text, 'en');
    expect(result.ok).toBe(true);
    expect(result.actual).toBe(90);
  });

  it('连字符单词在不同空格布局下计数一致', () => {
    // 同样 3 个连字符词，不同空格布局，计数应一致
    const a = 'well-being state-of-mind self-care';
    const b = 'well-being   state-of-mind    self-care';
    expect(countHomepageSummaryLength(a, 'en')).toBe(countHomepageSummaryLength(b, 'en'));
  });

  it('带标点的中文计数一致（标点也算 grapheme）', () => {
    // 220 个汉字 + 10 个标点 = 230 grapheme（仍在 220-420 范围内）
    const text = buildZhGraphemes(220) + '。！？，；：！？。；';
    const result = validateHomepageSummaryLength(text, 'zh');
    expect(result.ok).toBe(true);
    expect(result.actual).toBe(230);
  });

  it('返回结果包含 min/max/actual 字段', () => {
    const text = buildEnWords(50);
    const result = validateHomepageSummaryLength(text, 'en');
    expect(result.min).toBe(90);
    expect(result.max).toBe(180);
    expect(result.actual).toBe(50);
    expect(result.unit).toBe('word');
  });
});
