import { describe, it, expect } from 'vitest';
import {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  isValidLocale,
  parseLocale,
  localize,
} from '../types/locale';
import type { Locale, LocalizableText } from '../types/locale';

describe('isValidLocale', () => {
  it('对 "zh" 返回 true', () => {
    expect(isValidLocale('zh')).toBe(true);
  });

  it('对 "en" 返回 true', () => {
    expect(isValidLocale('en')).toBe(true);
  });

  it('对其他字符串返回 false', () => {
    expect(isValidLocale('ja')).toBe(false);
    expect(isValidLocale('fr')).toBe(false);
    expect(isValidLocale('ZH')).toBe(false);
    expect(isValidLocale('')).toBe(false);
  });

  it('对 undefined 返回 false', () => {
    expect(isValidLocale(undefined)).toBe(false);
  });

  it('返回 true 时收窄为 Locale 类型', () => {
    const value: string | undefined = 'zh';
    if (isValidLocale(value)) {
      // TypeScript 应将 value 收窄为 Locale
      const _locale: Locale = value;
      expect(_locale).toBe('zh');
    }
  });
});

describe('parseLocale', () => {
  it('合法 "zh" 直接返回', () => {
    expect(parseLocale('zh')).toBe('zh');
  });

  it('合法 "en" 直接返回', () => {
    expect(parseLocale('en')).toBe('en');
  });

  it('非法字符串回退到默认', () => {
    expect(parseLocale('ja')).toBe(DEFAULT_LOCALE);
  });

  it('undefined 回退到默认', () => {
    expect(parseLocale(undefined)).toBe(DEFAULT_LOCALE);
  });

  it('空字符串回退到默认', () => {
    expect(parseLocale('')).toBe(DEFAULT_LOCALE);
  });
});

describe('localize', () => {
  const text: LocalizableText = { zh: '你好', en: 'Hello' };

  it('从 LocalizableText 提取中文', () => {
    expect(localize(text, 'zh')).toBe('你好');
  });

  it('从 LocalizableText 提取英文', () => {
    expect(localize(text, 'en')).toBe('Hello');
  });

  it('纯字符串直接返回', () => {
    expect(localize('plain text', 'zh')).toBe('plain text');
    expect(localize('plain text', 'en')).toBe('plain text');
  });
});

describe('常量', () => {
  it('DEFAULT_LOCALE 为 "zh"', () => {
    expect(DEFAULT_LOCALE).toBe('zh');
  });

  it('SUPPORTED_LOCALES 包含 zh 和 en', () => {
    expect(SUPPORTED_LOCALES).toEqual(['zh', 'en']);
  });
});
