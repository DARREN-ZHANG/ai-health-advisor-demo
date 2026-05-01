'use client';

import { useState } from 'react';
import { useLocale } from 'next-intl';
import { m, AnimatePresence } from 'framer-motion';
import { IconButton } from '@health-advisor/ui';
import { GlobeAltIcon, CheckIcon } from '@heroicons/react/24/outline';
import type { Locale } from '@health-advisor/shared';

const LOCALE_STORAGE_KEY = 'lang';

const LANG_OPTIONS: { value: Locale; label: string; fullLabel: string }[] = [
  { value: 'zh', label: '中', fullLabel: '简体中文' },
  { value: 'en', label: 'En', fullLabel: 'English' },
];

export function LanguageSwitcher() {
  const currentLocale = useLocale();
  const [isOpen, setIsOpen] = useState(false);

  function handleSwitch(locale: Locale) {
    if (locale === currentLocale) {
      setIsOpen(false);
      return;
    }
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    window.location.reload();
  }

  const currentLang = LANG_OPTIONS.find((opt) => opt.value === currentLocale);

  return (
    <div className="relative">
      <IconButton
        onClick={() => setIsOpen(!isOpen)}
        className="text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded-xl transition-all active:scale-90 gap-1"
        aria-label="切换语言"
      >
        <GlobeAltIcon className="w-5 h-5" />
        <span className="text-xs font-medium min-w-[1rem] text-center">{currentLang?.label}</span>
      </IconButton>

      <AnimatePresence>
        {isOpen && (
          <>
            {/* 遮罩层：点击外部关闭 */}
            <div
              className="fixed inset-0 z-10"
              onClick={() => setIsOpen(false)}
            />
            <m.div
              initial={{ opacity: 0, scale: 0.95, y: -10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -10 }}
              transition={{ duration: 0.15 }}
              className="absolute right-0 mt-2 w-44 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl z-20 py-1.5 overflow-hidden"
            >
              {LANG_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => handleSwitch(opt.value)}
                  className={`w-full flex items-center justify-between px-4 py-2.5 text-sm transition-colors ${
                    currentLocale === opt.value
                      ? 'text-blue-400 bg-blue-500/10'
                      : 'text-slate-300 hover:bg-slate-700 hover:text-slate-100'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span className="text-xs font-bold w-5 text-center">{opt.label}</span>
                    <span>{opt.fullLabel}</span>
                  </span>
                  {currentLocale === opt.value && (
                    <CheckIcon className="w-4 h-4" />
                  )}
                </button>
              ))}
            </m.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
