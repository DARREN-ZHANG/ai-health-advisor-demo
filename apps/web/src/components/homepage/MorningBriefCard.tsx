'use client';

import { Card, statusColors } from '@health-advisor/ui';
import type { StatusColor } from '@health-advisor/ui';
import type { ActionOption } from '@health-advisor/shared';
import { m } from 'framer-motion';
import { ActionOptions } from './ActionOptions';

interface MorningBriefCardProps {
  status: StatusColor;
  title: string;
  summary: string;
  actions?: ActionOption[];
  onActionSelect?: (action: ActionOption) => void;
  isLoading?: boolean;
}

export function MorningBriefCard({
  status,
  title,
  summary,
  actions = [],
  onActionSelect,
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

          <div className="text-slate-300 leading-relaxed whitespace-pre-line">
            {summary}
          </div>

          <ActionOptions actions={actions} onSelect={onActionSelect} />
        </div>
      </Card>
    </m.div>
  );
}
