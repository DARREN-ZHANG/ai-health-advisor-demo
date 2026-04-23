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
    <div>
      <HistoricalTrendsGrid trends={trends} onTrendClick={onTrendClick} showChange={showChange} />
    </div>
  );
}
