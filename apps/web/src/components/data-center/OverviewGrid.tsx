'use client';

import { HistoricalTrendsGrid } from '@/components/homepage/HistoricalTrendsGrid';
import type { EChartsOption } from 'echarts';

export interface OverviewTrendItem {
  id: string;
  label: string;
  value: string | number;
  unit: string;
  change?: number;
  accentColor: string;
  chartOption?: EChartsOption | null;
  isLoading?: boolean;
}

interface OverviewGridProps {
  trends: OverviewTrendItem[];
  onTrendClick?: (trendId: string) => void;
  showChange?: boolean;
}

export function OverviewGrid({ trends, onTrendClick, showChange }: OverviewGridProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-semibold text-slate-200">核心指标概览</h2>
        <span className="text-xs text-slate-500">全部 6 项指标</span>
      </div>
      <HistoricalTrendsGrid trends={trends} onTrendClick={onTrendClick} showChange={showChange} />
    </div>
  );
}
