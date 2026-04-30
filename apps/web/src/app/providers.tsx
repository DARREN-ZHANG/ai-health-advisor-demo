'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import { LazyMotion, domAnimation } from 'framer-motion';
import { NextIntlClientProvider } from 'next-intl';
import { useState, useEffect } from 'react';
import { ProfileBootstrap } from './ProfileBootstrap';
import type { Locale } from '@health-advisor/shared';
import { DEFAULT_LOCALE } from '@health-advisor/shared';

const LOCALE_STORAGE_KEY = 'lang';

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      })
  );
  const [locale, setLocale] = useState<Locale>(DEFAULT_LOCALE);
  const [messages, setMessages] = useState<Record<string, unknown> | undefined>(undefined);

  useEffect(() => {
    const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY) as Locale | null;
    const resolved: Locale = stored === 'en' ? 'en' : 'zh';
    setLocale(resolved);
    import(`../messages/${resolved}.json`).then((mod) => {
      setMessages(mod.default);
    });
  }, []);

  if (!messages) return null; // 等待字典加载

  return (
    <ThemeProvider attribute="class" defaultTheme="dark" forcedTheme="dark">
      <NextIntlClientProvider locale={locale} messages={messages}>
        <QueryClientProvider client={queryClient}>
          <LazyMotion features={domAnimation} strict>
            <ProfileBootstrap />
            {children}
          </LazyMotion>
        </QueryClientProvider>
      </NextIntlClientProvider>
    </ThemeProvider>
  );
}
