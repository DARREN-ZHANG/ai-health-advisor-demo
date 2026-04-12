'use client';

import { Card, Skeleton, EmptyState } from '@health-advisor/ui';
import { m, AnimatePresence } from 'framer-motion';

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
  return (
    <Card className="flex flex-col gap-4 min-h-[400px]">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-100">{title}</h3>
      </div>

      <div className="flex-1 relative min-h-[300px]">
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
                <p className="text-red-400 font-medium">加载失败</p>
                <p className="text-slate-500 text-sm">{error}</p>
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
              <EmptyState message="暂无数据" className="h-full" />
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
    </Card>
  );
}
