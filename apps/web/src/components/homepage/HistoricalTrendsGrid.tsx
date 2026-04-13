'use client';

import type { EChartsOption } from 'echarts';
import { Card } from '@health-advisor/ui';
import { MicroChart } from '@health-advisor/charts';
import { m } from 'framer-motion';

interface TrendItem {
  id: string;
  label: string;
  value: string | number;
  unit: string;
  change?: number; // percentage
  accentColor: string;
  chartOption?: EChartsOption | null;
  isLoading?: boolean;
}

interface HistoricalTrendsGridProps {
  trends: TrendItem[];
}

export function HistoricalTrendsGrid({ trends }: HistoricalTrendsGridProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {trends.map((trend, index) => (
        <m.div
          key={trend.id}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3, delay: index * 0.1 }}
        >
          <Card
            className="flex flex-col gap-3 h-full hover:border-slate-500 transition-colors cursor-pointer group border-t-2"
            style={{ borderTopColor: trend.accentColor }}
          >
            <div className="flex justify-between items-start">
              <span className="text-sm font-medium text-slate-400 group-hover:text-slate-200 transition-colors">
                {trend.label}
              </span>
              {trend.change !== undefined && (
                <span 
                  className={`text-xs px-1.5 py-0.5 rounded ${
                    trend.change >= 0 ? 'text-green-400 bg-green-400/10' : 'text-red-400 bg-red-400/10'
                  }`}
                >
                  {trend.change >= 0 ? '+' : ''}{trend.change}%
                </span>
              )}
            </div>
            
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-bold text-slate-100">{trend.value}</span>
              <span className="text-sm text-slate-500">{trend.unit}</span>
            </div>

            <div className="h-16 mt-auto">
              {trend.isLoading ? (
                <div className="w-full h-full rounded bg-slate-800 animate-pulse" />
              ) : trend.chartOption ? (
                <MicroChart
                  height={60}
                  option={trend.chartOption}
                />
              ) : (
                <div className="w-full h-full rounded border border-dashed border-slate-800 text-[10px] text-slate-600 flex items-center justify-center">
                  无数据
                </div>
              )}
            </div>
          </Card>
        </m.div>
      ))}
    </div>
  );
}
