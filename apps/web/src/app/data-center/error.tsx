'use client';

import { Button, Container } from '@health-advisor/ui';
import { useTranslations } from 'next-intl';

interface DataCenterErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/** Data Center 路由错误边界 */
export default function DataCenterError({ error, reset }: DataCenterErrorProps) {
  const isNetworkError =
    error.message?.includes('fetch') ||
    error.message?.includes('network') ||
    error.message?.includes('Failed to fetch');
  const t = useTranslations('dataCenter');
  const tCommon = useTranslations('common');

  return (
    <Container className="flex flex-col items-center justify-center py-24 text-center">
      <div className="text-5xl mb-4">&#x1F4CA;</div>
      <h1 className="text-xl font-semibold text-slate-200 mb-2">
        {isNetworkError ? t('dataLoadFailed') : t('dataCenterError')}
      </h1>
      <p className="text-slate-400 text-sm mb-8 max-w-sm">
        {isNetworkError
          ? t('dataLoadFailedNetwork')
          : error.message || t('dataLoadFailedGeneric')}
      </p>
      <Button variant="primary" onClick={reset}>
        {tCommon('retry')}
      </Button>
    </Container>
  );
}
