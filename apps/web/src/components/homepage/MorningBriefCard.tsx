'use client';

import { Card, statusColors } from '@health-advisor/ui';
import type { StatusColor } from '@health-advisor/ui';
import { m } from 'framer-motion';

interface MorningBriefCardProps {
  status: StatusColor;
  title: string;
  summary: string;
  microTips?: string[];
  isLoading?: boolean;
}

export function MorningBriefCard({
  status,
  title,
  summary,
  microTips = [],
  isLoading = false,
}: MorningBriefCardProps) {
  const statusColor = statusColors[status];

  if (isLoading) {
    return (
      <Card className="animate-pulse">
        <div className="h-6 w-32 bg-slate-700 rounded mb-4" />
        <div className="h-20 bg-slate-700 rounded mb-4" />
        <div className="flex gap-2">
          <div className="h-6 w-16 bg-slate-700 rounded-full" />
          <div className="h-6 w-16 bg-slate-700 rounded-full" />
        </div>
      </Card>
    );
  }

  return (
    <m.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <Card className="relative overflow-hidden border-l-4" style={{ borderLeftColor: statusColor }}>
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-slate-100">{title}</h3>
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: statusColor, boxShadow: `0 0 8px ${statusColor}` }}
            />
          </div>

          <p className="text-slate-300 leading-relaxed">
            {summary}
          </p>

          {microTips.length > 0 && (
            <div className="space-y-3 pt-4 border-t border-slate-800/50">
              <p className="text-xs font-extrabold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <span className="w-1 h-3 bg-blue-500 rounded-full" />
                智能洞察
              </p>
              <div className="flex flex-wrap gap-2">
                {microTips.map((tip, index) => (
                  <span
                    key={index}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20"
                  >
                    {tip}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </Card>
    </m.div>
  );
}
