'use client';

import { useLocale } from 'next-intl';
import type { Locale } from '@health-advisor/shared';

const LOCALE_STORAGE_KEY = 'lang';

const LANG_OPTIONS: { value: Locale; label: string }[] = [
  { value: 'zh', label: '中' },
  { value: 'en', label: 'En' },
];

export function LanguageSwitcher() {
  const currentLocale = useLocale();

  function handleSwitch(locale: Locale) {
    if (locale === currentLocale) return;
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    window.location.reload();
  }

  return (
    <div className="flex items-center gap-0.5 text-xs border border-slate-700 rounded px-1 py-0.5">
      {LANG_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          onClick={() => handleSwitch(opt.value)}
          className={`px-1.5 py-0.5 rounded transition-colors ${
            currentLocale === opt.value
              ? 'bg-blue-500/20 text-blue-400'
              : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
