'use client';

import Link from 'next/link';
import { Button, Container } from '@health-advisor/ui';
import { useTranslations } from 'next-intl';

/** 404 页面 */
export default function NotFound() {
  const t = useTranslations('common');

  return (
    <Container className="flex flex-col items-center justify-center py-24 text-center">
      <div className="text-6xl font-bold text-slate-700 mb-4">404</div>
      <h1 className="text-xl font-semibold text-slate-200 mb-2">
        {t('pageNotFound')}
      </h1>
      <p className="text-slate-400 text-sm mb-8 max-w-sm">
        {t('pageNotFoundMsg')}
      </p>
      <Link href="/">
        <Button variant="primary">{t('backToHome')}</Button>
      </Link>
    </Container>
  );
}
