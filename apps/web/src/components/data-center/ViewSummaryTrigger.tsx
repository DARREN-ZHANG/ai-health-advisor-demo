'use client';

import { Button } from '@health-advisor/ui';
import { m } from 'framer-motion';

interface ViewSummaryTriggerProps {
  onClick: () => void;
  isLoading?: boolean;
}

export function ViewSummaryTrigger({ onClick, isLoading = false }: ViewSummaryTriggerProps) {
  return (
    <div className="fixed bottom-24 right-24 z-40 md:bottom-8 md:right-24">
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
              <span className="text-lg">✨</span>
              <span className="font-bold">总结当前视图</span>
            </>
          )}
        </Button>
      </m.div>
    </div>
  );
}
