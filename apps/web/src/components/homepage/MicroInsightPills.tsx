'use client';

import { Pill } from '@health-advisor/ui';
import { m } from 'framer-motion';

interface MicroInsightPillsProps {
  insights: string[];
}

export function MicroInsightPills({ insights }: MicroInsightPillsProps) {
  if (insights.length === 0) return null;

  return (
    <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
      {insights.map((insight, index) => (
        <m.div
          key={index}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3, delay: index * 0.1 }}
          className="flex-shrink-0"
        >
          <Pill className="bg-slate-800 border border-slate-700 py-1 hover:border-slate-500 transition-colors cursor-default whitespace-nowrap">
            {insight}
          </Pill>
        </m.div>
      ))}
    </div>
  );
}
