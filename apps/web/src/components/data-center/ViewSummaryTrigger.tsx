'use client';

import { Button } from '@health-advisor/ui';
import { m } from 'framer-motion';
import { SparklesIcon } from '@heroicons/react/24/outline';
import { useTranslations } from 'next-intl';

interface ViewSummaryTriggerProps {
  onClick: () => void;
  isLoading?: boolean;
}

export function ViewSummaryTrigger({ onClick, isLoading = false }: ViewSummaryTriggerProps) {
  const t = useTranslations('common');

  return (
    <div className="fixed bottom-44 right-6 z-40 md:bottom-28 md:right-6">
      <m.div
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
      >
        <Button
          onClick={onClick}
          disabled={isLoading}
          className="rounded-full h-12 px-6 shadow-lg shadow-blue-500/20 flex items-center gap-2 group border border-blue-400/30"
        >
          {isLoading ? (
            <div className="flex gap-1">
              <span className="w-1.5 h-1.5 bg-white rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 bg-white rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 bg-white rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          ) : (
            <>
              <SparklesIcon className="w-5 h-5 text-yellow-400" />
              <span className="font-bold">{t('summarizeView')}</span>
            </>
          )}
        </Button>
      </m.div>
    </div>
  );
}
