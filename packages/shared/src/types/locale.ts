/** 支持的语言 */
export type Locale = 'zh' | 'en';

/** 默认语言 */
export const DEFAULT_LOCALE: Locale = 'zh';

/** 支持的语言列表 */
export const SUPPORTED_LOCALES: readonly Locale[] = ['zh', 'en'] as const;

/** 可本地化的文本结构 */
export interface LocalizableText {
  zh: string;
  en: string;
}

/** 判断是否为合法 Locale */
export function isValidLocale(value: string | undefined): value is Locale {
  return value === 'zh' || value === 'en';
}

/** 解析语言值，非法或空值回退到默认 */
export function parseLocale(value: string | undefined): Locale {
  if (isValidLocale(value)) return value;
  return DEFAULT_LOCALE;
}

/** 从 LocalizableText 中提取对应语言的文本，纯字符串直接返回 */
export function localize(text: LocalizableText | string, locale: Locale): string {
  if (typeof text === 'string') return text;
  return text[locale];
}
