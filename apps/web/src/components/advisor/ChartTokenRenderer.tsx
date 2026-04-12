'use client';

import { CHART_TOKEN_META, ChartTokenId } from '@health-advisor/shared';
import {
  MicroChart,
  getChartBuilder,
  toTimeSeries,
  type ChartDataPoint,
} from '@health-advisor/charts';
import { Card } from '@health-advisor/ui';
import type { EChartsOption } from 'echarts';

interface ChartTokenRendererProps {
  tokenId: ChartTokenId;
}

type AxisOption = Record<string, unknown> | undefined;

const PREVIEW_POINTS_BY_TOKEN: Record<ChartTokenId, ChartDataPoint[]> = {
  [ChartTokenId.HRV_7DAYS]: [
    { date: '04-01', values: { hr: 58 } },
    { date: '04-02', values: { hr: 61 } },
    { date: '04-03', values: { hr: 63 } },
    { date: '04-04', values: { hr: 60 } },
    { date: '04-05', values: { hr: 65 } },
    { date: '04-06', values: { hr: 67 } },
    { date: '04-07', values: { hr: 64 } },
  ],
  [ChartTokenId.SLEEP_7DAYS]: [
    { date: '04-01', values: { 'sleep.totalMinutes': 410 } },
    { date: '04-02', values: { 'sleep.totalMinutes': 445 } },
    { date: '04-03', values: { 'sleep.totalMinutes': 430 } },
    { date: '04-04', values: { 'sleep.totalMinutes': 470 } },
    { date: '04-05', values: { 'sleep.totalMinutes': 455 } },
    { date: '04-06', values: { 'sleep.totalMinutes': 485 } },
    { date: '04-07', values: { 'sleep.totalMinutes': 460 } },
  ],
  [ChartTokenId.RESTING_HR_7DAYS]: [
    { date: '04-01', values: { hr: 64 } },
    { date: '04-02', values: { hr: 63 } },
    { date: '04-03', values: { hr: 61 } },
    { date: '04-04', values: { hr: 62 } },
    { date: '04-05', values: { hr: 60 } },
    { date: '04-06', values: { hr: 59 } },
    { date: '04-07', values: { hr: 58 } },
  ],
  [ChartTokenId.ACTIVITY_7DAYS]: [
    { date: '04-01', values: { 'activity.steps': 8200 } },
    { date: '04-02', values: { 'activity.steps': 9100 } },
    { date: '04-03', values: { 'activity.steps': 10200 } },
    { date: '04-04', values: { 'activity.steps': 8700 } },
    { date: '04-05', values: { 'activity.steps': 11400 } },
    { date: '04-06', values: { 'activity.steps': 12600 } },
    { date: '04-07', values: { 'activity.steps': 10800 } },
  ],
  [ChartTokenId.SPO2_7DAYS]: [
    { date: '04-01', values: { spo2: 97 } },
    { date: '04-02', values: { spo2: 98 } },
    { date: '04-03', values: { spo2: 97 } },
    { date: '04-04', values: { spo2: 99 } },
    { date: '04-05', values: { spo2: 98 } },
    { date: '04-06', values: { spo2: 97 } },
    { date: '04-07', values: { spo2: 98 } },
  ],
  [ChartTokenId.SLEEP_STAGE_LAST_NIGHT]: [
    {
      date: '昨晚',
      values: {
        'sleep.stages.deep': 115,
        'sleep.stages.light': 210,
        'sleep.stages.rem': 95,
        'sleep.stages.awake': 20,
      },
    },
  ],
  [ChartTokenId.STRESS_LOAD_7DAYS]: [
    { date: '04-01', values: { 'stress.load': 34 } },
    { date: '04-02', values: { 'stress.load': 41 } },
    { date: '04-03', values: { 'stress.load': 49 } },
    { date: '04-04', values: { 'stress.load': 44 } },
    { date: '04-05', values: { 'stress.load': 57 } },
    { date: '04-06', values: { 'stress.load': 52 } },
    { date: '04-07', values: { 'stress.load': 38 } },
  ],
  [ChartTokenId.HRV_SLEEP_14DAYS_COMPARE]: [
    { date: '03-25', values: { hr: 56, 'sleep.totalMinutes': 410 } },
    { date: '03-26', values: { hr: 57, 'sleep.totalMinutes': 420 } },
    { date: '03-27', values: { hr: 55, 'sleep.totalMinutes': 395 } },
    { date: '03-28', values: { hr: 58, 'sleep.totalMinutes': 430 } },
    { date: '03-29', values: { hr: 60, 'sleep.totalMinutes': 445 } },
    { date: '03-30', values: { hr: 59, 'sleep.totalMinutes': 440 } },
    { date: '03-31', values: { hr: 61, 'sleep.totalMinutes': 455 } },
    { date: '04-01', values: { hr: 62, 'sleep.totalMinutes': 465 } },
    { date: '04-02', values: { hr: 60, 'sleep.totalMinutes': 450 } },
    { date: '04-03', values: { hr: 63, 'sleep.totalMinutes': 470 } },
    { date: '04-04', values: { hr: 64, 'sleep.totalMinutes': 480 } },
    { date: '04-05', values: { hr: 62, 'sleep.totalMinutes': 458 } },
    { date: '04-06', values: { hr: 65, 'sleep.totalMinutes': 490 } },
    { date: '04-07', values: { hr: 64, 'sleep.totalMinutes': 475 } },
  ],
};

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

function buildPreviewOption(tokenId: ChartTokenId): EChartsOption | null {
  const builder = getChartBuilder(tokenId);
  if (!builder) {
    return null;
  }

  const option = builder(toTimeSeries(PREVIEW_POINTS_BY_TOKEN[tokenId]));

  return {
    ...option,
    animation: false,
    title: undefined,
    legend: undefined,
    grid: { top: 6, right: 6, bottom: 6, left: 6, containLabel: false },
    xAxis: Array.isArray(option.xAxis)
      ? option.xAxis.map((axis) => hideAxis(axis as AxisOption))
      : hideAxis(option.xAxis as AxisOption),
    yAxis: Array.isArray(option.yAxis)
      ? option.yAxis.map((axis) => hideAxis(axis as AxisOption))
      : hideAxis(option.yAxis as AxisOption),
  };
}

export function ChartTokenRenderer({ tokenId }: ChartTokenRendererProps) {
  const option = buildPreviewOption(tokenId);
  const tokenMeta = CHART_TOKEN_META[tokenId];

  if (!option) {
    return (
      <Card className="bg-slate-900 border-slate-700 p-3 flex flex-col gap-2 w-full max-w-[300px]">
        <div className="flex justify-between items-center">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
            {tokenMeta.label}
          </span>
        </div>
        <div className="h-20 w-full bg-slate-950/50 rounded flex items-center justify-center text-xs text-slate-500">
          当前 token 暂未注册图表渲染器
        </div>
      </Card>
    );
  }

  return (
    <Card className="bg-slate-900 border-slate-700 p-3 flex flex-col gap-2 w-full max-w-[300px]">
      <div className="flex justify-between items-center">
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
          {tokenMeta.label}
        </span>
        <span className="text-[10px] text-blue-500 font-medium">查看详情 →</span>
      </div>
      <div className="h-20 w-full bg-slate-950/50 rounded flex items-center justify-center">
        <MicroChart option={option} height={70} />
      </div>
    </Card>
  );
}
