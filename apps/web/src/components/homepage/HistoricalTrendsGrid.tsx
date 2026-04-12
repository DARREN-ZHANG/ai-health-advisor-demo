'use client';

import { Card, statusColors } from '@health-advisor/ui';
import type { StatusColor } from '@health-advisor/ui';
import { MicroChart } from '@health-advisor/charts';
import { m } from 'framer-motion';

interface TrendItem {
  id: string;
  label: string;
  value: string | number;
  unit: string;
  change?: number; // percentage
  status: StatusColor;
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
          <Card className="flex flex-col gap-3 h-full hover:border-slate-500 transition-colors cursor-pointer group">
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
              {/* TODO: 这里的 option 会在后续 Wave 5.1 联通全链路时注入真实 builder 输出 */}
              <MicroChart 
                height={60}
                option={{
                  xAxis: { show: false, type: 'category' },
                  yAxis: { show: false, type: 'value' },
                  grid: { top: 5, bottom: 5, left: 5, right: 5 },
                  series: [{
                    data: [120, 132, 101, 134, 90, 230, 210],
                    type: 'line',
                    smooth: true,
                    showSymbol: false,
                    lineStyle: { width: 2, color: statusColors[trend.status] },
                    areaStyle: {
                      color: {
                        type: 'linear',
                        x: 0, y: 0, x2: 0, y2: 1,
                        colorStops: [
                          { offset: 0, color: `${statusColors[trend.status]}33` },
                          { offset: 1, color: `${statusColors[trend.status]}00` }
                        ]
                      }
                    }
                  }]
                }} 
              />
            </div>
          </Card>
        </m.div>
      ))}
    </div>
  );
}
