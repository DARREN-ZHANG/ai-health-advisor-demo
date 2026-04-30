'use client';

import { Button, Container } from '@health-advisor/ui';
import { useTranslations } from 'next-intl';

interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/** 根级错误边界 — 捕获路由内未处理异常 */
export default function RootError({ error, reset }: ErrorPageProps) {
  const isNetworkError =
    error.message?.includes('fetch') ||
    error.message?.includes('network') ||
    error.message?.includes('Failed to fetch') ||
    error.message?.includes('NetworkError');
  const t = useTranslations('common');

  return (
    <Container className="flex flex-col items-center justify-center py-24 text-center">
      <div className="text-5xl mb-4">&#x26A0;&#xFE0F;</div>
      <h1 className="text-xl font-semibold text-slate-200 mb-2">
        {isNetworkError ? t('errorNetwork') : t('errorGeneric')}
      </h1>
      <p className="text-slate-400 text-sm mb-8 max-w-sm">
        {isNetworkError
          ? t('errorNetworkMsg')
          : error.message || t('errorGenericMsg')}
      </p>
      <Button variant="primary" onClick={reset}>
        {t('retry')}
      </Button>
    </Container>
  );
}
