'use client';

import { CHART_TOKEN_META, ChartTokenId } from '@health-advisor/shared';
import {
  MicroChart,
  getChartBuilder,
} from '@health-advisor/charts';
import { Card } from '@health-advisor/ui';
import { useChartDataQuery } from '@/hooks/use-data-query';
import { useProfileStore } from '@/stores/profile.store';
import { useMemo } from 'react';

interface ChartTokenRendererProps {
  tokenId: ChartTokenId;
}

type AxisOption = Record<string, unknown> | undefined;

function hideAxis(axis: AxisOption): Record<string, unknown> {
  const base = axis ?? {};
  const axisLabel = (base.axisLabel as Record<string, unknown> | undefined) ?? {};
  const axisLine = (base.axisLine as Record<string, unknown> | undefined) ?? {};
  const axisTick = (base.axisTick as Record<string, unknown> | undefined) ?? {};
  const splitLine = (base.splitLine as Record<string, unknown> | undefined) ?? {};

  return {
    ...base,
    show: false,
    name: undefined,
    axisLabel: { ...axisLabel, show: false },
    axisLine: { ...axisLine, show: false },
    axisTick: { ...axisTick, show: false },
    splitLine: { ...splitLine, show: false },
  };
}

export function ChartTokenRenderer({ tokenId }: ChartTokenRendererProps) {
  const { currentProfileId } = useProfileStore();
  const { data, isLoading } = useChartDataQuery(currentProfileId, [tokenId]);
  const tokenMeta = CHART_TOKEN_META[tokenId];

  const option = useMemo(() => {
    if (!data) return null;
    const builder = getChartBuilder(tokenId);
    if (!builder) return null;

    const fullOption = builder(data);

    return {
      ...fullOption,
      animation: false,
      title: undefined,
      legend: undefined,
      grid: { top: 6, right: 6, bottom: 6, left: 6, containLabel: false },
      xAxis: Array.isArray(fullOption.xAxis)
        ? fullOption.xAxis.map((axis) => hideAxis(axis as AxisOption))
        : hideAxis(fullOption.xAxis as AxisOption),
      yAxis: Array.isArray(fullOption.yAxis)
        ? fullOption.yAxis.map((axis) => hideAxis(axis as AxisOption))
        : hideAxis(fullOption.yAxis as AxisOption),
    };
  }, [data, tokenId]);

  return (
    <Card className="bg-slate-900 border-slate-700 p-4 flex flex-col gap-3 w-full">
      <div className="flex justify-between items-center">
        <span className="text-xs font-bold text-slate-400 uppercase tracking-widest border-l-2 border-slate-700 pl-2">
          {tokenMeta?.label || tokenId}
        </span>
        <button className="text-[10px] text-blue-500 font-bold hover:text-blue-400 transition-colors bg-blue-500/5 px-2 py-1 rounded">
          详情 →
        </button>
      </div>
      <div className="h-32 w-full bg-slate-950/40 rounded-lg flex items-center justify-center overflow-hidden border border-slate-800/50">
        {isLoading ? (
          <div className="w-full h-full bg-slate-900/50 animate-pulse flex items-center justify-center">
            <div className="flex gap-1">
              <div className="w-1 h-1 bg-slate-700 rounded-full animate-bounce" />
              <div className="w-1 h-1 bg-slate-700 rounded-full animate-bounce [animation-delay:0.2s]" />
              <div className="w-1 h-1 bg-slate-700 rounded-full animate-bounce [animation-delay:0.4s]" />
            </div>
          </div>
        ) : option ? (
          <MicroChart option={option} height={110} />
        ) : (
          <span className="text-xs text-slate-600 font-medium">
            {!getChartBuilder(tokenId) ? '暂未注册渲染器' : '无数据'}
          </span>
        )}
      </div>
    </Card>
  );
}
