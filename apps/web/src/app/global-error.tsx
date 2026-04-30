'use client';

import { NextIntlClientProvider } from 'next-intl';
import { useState, useEffect } from 'react';
import zhMessages from '../messages/zh.json';
import enMessages from '../messages/en.json';

const LOCALE_STORAGE_KEY = 'lang';

/** 全局错误边界 — 捕获 layout 级别的致命错误（替换整个页面） */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [locale, setLocale] = useState<'zh' | 'en'>('zh');

  useEffect(() => {
    const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    setLocale(stored === 'en' ? 'en' : 'zh');
  }, []);

  const messages = locale === 'en' ? enMessages : zhMessages;
  const t = (key: string): string => {
    const keys = key.split('.');
    let result: unknown = messages;
    for (const k of keys) {
      if (result && typeof result === 'object' && k in result) {
        result = (result as Record<string, unknown>)[k];
      } else {
        return key;
      }
    }
    return typeof result === 'string' ? result : key;
  };

  return (
    <html lang={locale === 'en' ? 'en' : 'zh-CN'}>
      <body className="antialiased min-h-screen bg-slate-950 text-slate-200">
        <div className="flex flex-col items-center justify-center min-h-screen text-center px-4">
          <div className="text-5xl mb-4">&#x1F6A8;</div>
          <h1 className="text-xl font-semibold text-slate-200 mb-2">
            {t('common.appFatalError')}
          </h1>
          <p className="text-slate-400 text-sm mb-8 max-w-sm">
            {error.message || t('common.appFatalErrorMsg')}
          </p>
          <button
            onClick={reset}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          >
            {t('common.refreshPage')}
          </button>
        </div>
      </body>
    </html>
  );
}
