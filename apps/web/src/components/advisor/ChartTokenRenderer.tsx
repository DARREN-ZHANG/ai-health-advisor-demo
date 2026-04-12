'use client';

import { ChartTokenId } from '@health-advisor/shared';
import { MicroChart } from '@health-advisor/charts';
import { Card } from '@health-advisor/ui';

interface ChartTokenRendererProps {
  tokenId: ChartTokenId;
}

export function ChartTokenRenderer({ tokenId }: ChartTokenRendererProps) {
  // Mock options for different tokens
  const getMockOption = () => ({
    xAxis: { show: false, type: 'category' as const },
    yAxis: { show: false, type: 'value' as const },
    grid: { top: 5, bottom: 5, left: 5, right: 5 },
    series: [{
      data: [820, 932, 901, 934, 1290, 1330, 1320],
      type: 'line' as const,
      smooth: true,
      showSymbol: false,
      lineStyle: { width: 2, color: '#3b82f6' },
      areaStyle: {
        color: {
          type: 'linear' as const,
          x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [
            { offset: 0, color: 'rgba(59, 130, 246, 0.2)' },
            { offset: 1, color: 'rgba(59, 130, 246, 0)' }
          ]
        }
      }
    }]
  });

  const tokenLabels: Record<ChartTokenId, string> = {
    [ChartTokenId.HRV_7DAYS]: '7日 HRV 趋势',
    [ChartTokenId.SLEEP_7DAYS]: '7日睡眠时长',
    [ChartTokenId.RESTING_HR_7DAYS]: '7日静息心率',
    [ChartTokenId.ACTIVITY_7DAYS]: '7日活动量',
    [ChartTokenId.SPO2_7DAYS]: '7日血氧饱和度',
    [ChartTokenId.SLEEP_STAGE_LAST_NIGHT]: '昨晚睡眠阶段',
    [ChartTokenId.STRESS_LOAD_7DAYS]: '7日压力负荷',
    [ChartTokenId.HRV_SLEEP_14DAYS_COMPARE]: '14日 HRV 与睡眠对比',
  };

  return (
    <Card className="bg-slate-900 border-slate-700 p-3 flex flex-col gap-2 w-full max-w-[300px]">
      <div className="flex justify-between items-center">
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
          {tokenLabels[tokenId] || tokenId}
        </span>
        <span className="text-[10px] text-blue-500 font-medium">查看详情 →</span>
      </div>
      <div className="h-20 w-full bg-slate-950/50 rounded flex items-center justify-center">
        <MicroChart option={getMockOption()} height={70} />
      </div>
    </Card>
  );
}
