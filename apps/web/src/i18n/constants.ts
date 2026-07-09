import type { Locale } from '@health-advisor/shared';

/**
 * localStorage 中存储语言偏好的 key。
 * 与 `Providers.tsx` / `LanguageSwitcher.tsx` 中的字面量保持一致；
 * 读取方仍是各自组件，本常量仅供新组件引用以避免重复。
 */
export const LOCALE_STORAGE_KEY = 'lang';

/**
 * 语言切换选项。
 * label 使用本地语言名称（"简体中文" / "English"），不随当前 locale 变化 ——
 * 这是语言切换器的惯例，确保用户在任何 locale 下都能识别自己的母语。
 */
export const LANG_OPTIONS: readonly { value: Locale; label: string }[] = [
  { value: 'zh', label: '简体中文' },
  { value: 'en', label: 'English' },
] as const;
