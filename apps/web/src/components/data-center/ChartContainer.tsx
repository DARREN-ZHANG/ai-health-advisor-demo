'use client';

import { Skeleton, EmptyState } from '@health-advisor/ui';
import { m, AnimatePresence } from 'framer-motion';
import { useTranslations } from 'next-intl';

interface ChartContainerProps {
  title: string;
  isLoading?: boolean;
  isEmpty?: boolean;
  error?: string | null;
  children: React.ReactNode;
}

export function ChartContainer({
  title,
  isLoading = false,
  isEmpty = false,
  error = null,
  children,
}: ChartContainerProps) {
  const t = useTranslations('common');

  return (
    <section className="flex min-h-[318px] flex-col gap-[18px] px-5 pb-8 pt-[2px]">
      <div className="flex items-center justify-between">
        <h3 className="text-[13px] font-semibold leading-[18px] text-white">{title}</h3>
      </div>

      <div className="relative min-h-[260px] flex-1">
        <AnimatePresence mode="wait">
          {isLoading ? (
            <m.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 flex flex-col gap-4"
            >
              <Skeleton className="h-8 w-1/4" />
              <Skeleton className="flex-1 w-full" />
            </m.div>
          ) : error ? (
            <m.div
              key="error"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 flex items-center justify-center"
            >
              <div className="text-center space-y-2">
                <p className="font-medium text-[var(--valo-depleted)]">{t('loadFailed')}</p>
                <p className="text-sm text-white/45">{error}</p>
              </div>
            </m.div>
          ) : isEmpty ? (
            <m.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0"
            >
              <EmptyState message={t('noData')} className="h-full" />
            </m.div>
          ) : (
            <m.div
              key="content"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="h-full w-full"
            >
              {children}
            </m.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}
