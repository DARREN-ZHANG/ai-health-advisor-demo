'use client';

import { Container, Section, Button } from '@health-advisor/ui';
import { CHART_TOKEN_META, ChartTokenId } from '@health-advisor/shared';
import { getChartBuilder, type StandardTimeSeries } from '@health-advisor/charts';
import { MorningBriefCard } from '@/components/homepage/MorningBriefCard';
import { MicroInsightPills } from '@/components/homepage/MicroInsightPills';
import { HistoricalTrendsGrid } from '@/components/homepage/HistoricalTrendsGrid';
import { useProfileStore } from '@/stores/profile.store';
import { useMorningBrief } from '@/hooks/use-ai-query';
import { useChartDataQuery } from '@/hooks/use-data-query';
import type { StatusColor } from '@health-advisor/ui';
import type { EChartsOption } from 'echarts';

import { useUIStore } from '@/stores/ui.store';
import { useEffect, useMemo } from 'react';

export default function HomePage() {
  const { currentProfileId } = useProfileStore();
  const { showToast } = useUIStore();
  const { data, isLoading, error, refetch, isFetching } = useMorningBrief(currentProfileId);
  const hrvTrend = useChartDataQuery(currentProfileId, [ChartTokenId.HRV_7DAYS]);
  const sleepTrend = useChartDataQuery(currentProfileId, [ChartTokenId.SLEEP_7DAYS]);
  const activityTrend = useChartDataQuery(currentProfileId, [ChartTokenId.ACTIVITY_7DAYS]);
  const stressTrend = useChartDataQuery(currentProfileId, [ChartTokenId.STRESS_LOAD_7DAYS]);

  const isAnyLoading = isLoading || isFetching;

  useEffect(() => {
    if (error) {
      // 超时不视为错误——后端会在 AI 超时后返回 fallback 响应
      const isTimeout = error instanceof Error && 'code' in error && (error as { code: string }).code === 'TIMEOUT';
      if (!isTimeout) {
        showToast('获取简报失败: ' + (error instanceof Error ? error.message : '未知错误'), 'error');
      }
    }
  }, [error, showToast]);

  const briefData = {
    status: (data?.statusColor || (data?.meta.finishReason === 'fallback' ? 'warning' : 'good')) as StatusColor,
    title: '今日简报',
    summary: data?.summary || (error ? '无法获取简报数据，请检查网络连接。' : '正在为您准备今日健康简报...'),
    microTips: data?.microTips || [],
  };

  const insights = data?.microTips || [];
  const trends = useMemo(() => ([
    buildTrendItem({
      id: 'hrv',
      label: 'HRV',
      tokenId: ChartTokenId.HRV_7DAYS,
      metricKey: 'hr',
      data: hrvTrend.data,
      isLoading: hrvTrend.isLoading || hrvTrend.isFetching,
      formatValue: (value) => Math.round(value).toString(),
    }),
    buildTrendItem({
      id: 'sleep',
      label: '睡眠',
      tokenId: ChartTokenId.SLEEP_7DAYS,
      metricKey: 'sleep.totalMinutes',
      data: sleepTrend.data,
      isLoading: sleepTrend.isLoading || sleepTrend.isFetching,
      formatValue: (value) => (value / 60).toFixed(1),
    }),
    buildTrendItem({
      id: 'activity',
      label: '步数',
      tokenId: ChartTokenId.ACTIVITY_7DAYS,
      metricKey: 'activity.steps',
      data: activityTrend.data,
      isLoading: activityTrend.isLoading || activityTrend.isFetching,
      formatValue: (value) => Math.round(value).toString(),
    }),
    buildTrendItem({
      id: 'stress',
      label: '压力负荷',
      tokenId: ChartTokenId.STRESS_LOAD_7DAYS,
      metricKey: 'stress.load',
      data: stressTrend.data,
      isLoading: stressTrend.isLoading || stressTrend.isFetching,
      formatValue: (value) => Math.round(value).toString(),
    }),
  ]), [
    hrvTrend.data,
    hrvTrend.isLoading,
    hrvTrend.isFetching,
    sleepTrend.data,
    sleepTrend.isLoading,
    sleepTrend.isFetching,
    activityTrend.data,
    activityTrend.isLoading,
    activityTrend.isFetching,
    stressTrend.data,
    stressTrend.isLoading,
    stressTrend.isFetching,
  ]);

  return (
    <Container className="py-6 space-y-8">
      {/* 顶部标题栏 */}
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">AI Health Advisor</h1>
          <p className="text-slate-400 text-sm">
            {describeBriefSource(data?.source)}
          </p>
        </div>
        <Button 
          variant="ghost" 
          onClick={() => refetch()} 
          disabled={isAnyLoading}
          className="text-xs text-slate-500 h-auto py-1 px-2"
        >
          {isFetching ? '正在刷新...' : '手动刷新'}
        </Button>
      </header>

      {/* 晨报部分 */}
      <Section title="今日简报" className="space-y-4">
        <MorningBriefCard 
          {...briefData} 
          isLoading={isAnyLoading} 
        />
      </Section>

      {/* 微贴士部分 */}
      <Section title="智能洞察" className="space-y-3">
        <MicroInsightPills insights={insights} />
      </Section>

      {/* 历史趋势概览 */}
      <Section title="历史趋势" className="space-y-4">
        <HistoricalTrendsGrid trends={trends} />
      </Section>

      <div className="h-20" />
    </Container>
  );
}

interface TrendBuilderInput {
  id: string;
  label: string;
  tokenId: ChartTokenId;
  metricKey: string;
  data: StandardTimeSeries | null | undefined;
  isLoading: boolean;
  formatValue: (value: number) => string;
}

function buildTrendItem({
  id,
  label,
  tokenId,
  metricKey,
  data,
  isLoading,
  formatValue,
}: TrendBuilderInput) {
  const series = data?.series[metricKey] ?? [];
  const current = series.at(-1);
  const previous = series.at(-2);
  const meta = CHART_TOKEN_META[tokenId];

  return {
    id,
    label,
    value: current == null ? '--' : formatValue(current),
    unit: meta.unit,
    change: calculateChange(current, previous),
    accentColor: meta.color,
    chartOption: createCompactChartOption(tokenId, data),
    isLoading,
  };
}

function calculateChange(current?: number | null, previous?: number | null) {
  if (current == null || previous == null || previous === 0) {
    return undefined;
  }

  return Math.round(((current - previous) / previous) * 100);
}

function describeBriefSource(source?: string) {
  if (source === 'fallback') {
    return '运行在离线受限模式';
  }

  if (source === 'llm') {
    return '智能健康顾问';
  }

  return '智能健康顾问';
}

function createCompactChartOption(
  tokenId: ChartTokenId,
  data: StandardTimeSeries | null | undefined,
): EChartsOption | null {
  if (!data) return null;

  const builder = getChartBuilder(tokenId);
  if (!builder) return null;

  const fullOption = builder(data);

  return {
    ...fullOption,
    animation: false,
    title: undefined,
    legend: undefined,
    tooltip: undefined,
    grid: { top: 5, right: 5, bottom: 5, left: 5, containLabel: false },
    xAxis: hideAxis(fullOption.xAxis),
    yAxis: hideAxis(fullOption.yAxis),
  };
}

function hideAxis(axis: EChartsOption['xAxis'] | EChartsOption['yAxis']) {
  if (Array.isArray(axis)) {
    return axis.map((item) => hideSingleAxis(item as Record<string, unknown>));
  }

  return hideSingleAxis((axis as Record<string, unknown> | undefined) ?? {});
}

function hideSingleAxis(axis: Record<string, unknown>) {
  const axisLabel = (axis.axisLabel as Record<string, unknown> | undefined) ?? {};
  const axisLine = (axis.axisLine as Record<string, unknown> | undefined) ?? {};
  const axisTick = (axis.axisTick as Record<string, unknown> | undefined) ?? {};
  const splitLine = (axis.splitLine as Record<string, unknown> | undefined) ?? {};

  return {
    ...axis,
    show: false,
    name: undefined,
    axisLabel: { ...axisLabel, show: false },
    axisLine: { ...axisLine, show: false },
    axisTick: { ...axisTick, show: false },
    splitLine: { ...splitLine, show: false },
  };
}
