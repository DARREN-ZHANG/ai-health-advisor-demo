'use client';

import { Container, Section } from '@health-advisor/ui';
import { ChartRoot } from '@health-advisor/charts';
import { DataCenterControls } from '@/components/data-center/DataCenterControls';
import { ChartContainer } from '@/components/data-center/ChartContainer';
import { OverviewGrid } from '@/components/data-center/OverviewGrid';
import { DeviceStatusBar } from '@/components/data-center/DeviceStatusBar';
import { useDataCenterStore } from '@/stores/data-center.store';
import { useProfileStore } from '@/stores/profile.store';
import { useDataCenterQuery, useChartDataByTokenQuery } from '@/hooks/use-data-query';
import { useDeviceSyncQuery } from '@/hooks/use-device-sync';
import { useDataChartOption, createCompactChartOption } from '@/hooks/use-data-chart-option';
import { useViewSummary } from '@/hooks/use-ai-query';
import { useMemo } from 'react';
import {
  CHART_TOKEN_META,
  ChartTokenId,
  type AgentResponseEnvelope,
  type DataCenterResponse,
  type DataTab,
  type StressTimelineResponse,
} from '@health-advisor/shared';
import type { StandardTimeSeries } from '@health-advisor/charts';
import { SparklesIcon } from '@heroicons/react/24/outline';

const tabLabels: Record<string, string> = {
  overview: '核心指标概览',
  sleep: '睡眠分析',
  hrv: 'HRV 趋势',
  'resting-hr': '静息心率',
  activity: '活动分布',
  spo2: '血氧饱和度',
  stress: '压力负荷',
};

/** 趋势卡片配置（6 项核心指标） */
const TREND_TOKEN_CONFIGS = [
  { id: 'hrv', label: 'HRV', tokenId: ChartTokenId.HRV_7DAYS, metricKey: 'hrv', formatValue: (v: number) => Math.round(v) },
  { id: 'sleep', label: '睡眠', tokenId: ChartTokenId.SLEEP_7DAYS, metricKey: 'sleep.totalMinutes', formatValue: (v: number) => (v / 60).toFixed(1) },
  { id: 'resting-hr', label: '静息心率', tokenId: ChartTokenId.RESTING_HR_7DAYS, metricKey: 'hr', formatValue: (v: number) => Math.round(v) },
  { id: 'activity', label: '活动', tokenId: ChartTokenId.ACTIVITY_7DAYS, metricKey: 'activity.steps', formatValue: (v: number) => Math.round(v).toLocaleString() },
  { id: 'spo2', label: '血氧', tokenId: ChartTokenId.SPO2_7DAYS, metricKey: 'spo2', formatValue: (v: number) => `${Math.round(v)}%` },
  { id: 'stress', label: '压力', tokenId: ChartTokenId.STRESS_LOAD_7DAYS, metricKey: 'stress.load', formatValue: (v: number) => Math.round(v) },
] as const;

/** 所有趋势 token 的 ID 列表 */
const TREND_TOKEN_IDS = TREND_TOKEN_CONFIGS.map((c) => c.tokenId);

export default function DataCenterPage() {
  const { activeTab, timeframe, setActiveTab } = useDataCenterStore();
  const { currentProfileId } = useProfileStore();
  const isOverview = activeTab === 'overview';

  // 获取主图表数据（仅非概览 tab）
  const { data: chartData, isLoading, isFetching, error } = useDataCenterQuery(
    currentProfileId,
    isOverview ? 'sleep' : activeTab,
    timeframe
  );
  const chartOption = useDataChartOption((isOverview ? 'sleep' : activeTab) as DataTab, chartData);

  // 获取趋势汇总数据（6 项指标，概览 tab 与详情 tab 共用）
  const { data: trendDataByToken, isLoading: isTrendLoading } = useChartDataByTokenQuery(
    currentProfileId,
    TREND_TOKEN_IDS,
    timeframe
  );

  // 构建概览网格数据
  const trends = useMemo(() => {
    if (!trendDataByToken) {
      return TREND_TOKEN_CONFIGS.map((config) => ({
        id: config.id,
        label: config.label,
        value: '--',
        unit: CHART_TOKEN_META[config.tokenId].unit,
        accentColor: CHART_TOKEN_META[config.tokenId].color,
        isLoading: true,
      }));
    }

    return TREND_TOKEN_CONFIGS.map((config) =>
      buildTrendItem({
        id: config.id,
        label: config.label,
        tokenId: config.tokenId,
        metricKey: config.metricKey,
        data: trendDataByToken[config.tokenId],
        isLoading: isTrendLoading,
        formatValue: config.formatValue,
      })
    );
  }, [trendDataByToken, isTrendLoading]);

  const isAnyLoading = isLoading || isFetching;

  // 获取 AI 总结（随 activeTab + timeframe 切换自动重新请求）
  const {
    data: summaryData,
    isLoading: isSummaryLoading,
    isFetching: isSummaryFetching,
  } = useViewSummary(currentProfileId, activeTab, timeframe);

  const isChartEmpty = !chartData || (
    !isOverview && activeTab === 'stress'
      ? (chartData as StressTimelineResponse).points?.length === 0
      : (chartData as DataCenterResponse).timeline?.length === 0
  );

  // 设备同步状态
  const {
    data: deviceData,
    isLoading: isDeviceLoading,
    isError: isDeviceError,
  } = useDeviceSyncQuery(currentProfileId);

  return (
    <Container className="py-6 space-y-6 relative pb-24">
      <header>
        <h1 className="text-2xl font-bold text-slate-100">数据中心</h1>
        <p className="text-slate-400 text-sm">{getSubtitle(timeframe)}</p>
      </header>

      {/* AI 总结置顶 */}
      <AISummarySection
        summaryData={summaryData}
        isLoading={isSummaryLoading || isSummaryFetching}
      />

      {/* 控制区域：Tab 切换与时间窗 */}
      <DataCenterControls />

      {/* 概览 Tab：6 指标网格 */}
      {isOverview && (
        <Section>
          <OverviewGrid
            trends={trends}
            onTrendClick={(id) => setActiveTab(id as DataTab)}
            showChange={timeframe === 'day'}
          />
        </Section>
      )}

      {/* 详情 Tab：当前 tab 主图 */}
      {!isOverview && (
        <Section className="space-y-4">
          <ChartContainer
            title={tabLabels[activeTab] || '数据指标'}
            isLoading={isAnyLoading}
            isEmpty={isChartEmpty}
            error={error ? '加载失败，请重试' : undefined}
          >
            {chartOption && <ChartRoot option={chartOption} height={350} />}
          </ChartContainer>
        </Section>
      )}

      {/* 底部状态栏 */}
      <DeviceStatusBar
        deviceData={deviceData}
        isLoading={isDeviceLoading}
        error={isDeviceError}
      />
    </Container>
  );
}

/* ────────────────────────────────────────────────────────────── */
/*  AI 总结组件                                                  */
/* ────────────────────────────────────────────────────────────── */

function AISummarySection({
  summaryData,
  isLoading,
}: {
  summaryData: AgentResponseEnvelope | null | undefined;
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <div className="space-y-3 animate-pulse">
        <div className="h-4 bg-slate-800 rounded w-3/4" />
        <div className="h-4 bg-slate-800 rounded w-full" />
        <div className="h-4 bg-slate-800 rounded w-5/6" />
      </div>
    );
  }

  if (!summaryData) {
    return null;
  }

  return (
    <div className="space-y-4">
      <div className="relative rounded-xl border border-blue-500/10 bg-gradient-to-r from-blue-500/5 via-slate-900/50 to-emerald-500/5 p-5">
        <div className="absolute left-0 top-4 bottom-4 w-0.5 bg-gradient-to-b from-blue-500 to-emerald-500 rounded-full" />
        <div className="pl-4 space-y-4">
          <p className="text-slate-200 leading-relaxed text-sm whitespace-pre-wrap font-medium">
            {summaryData.summary}
          </p>

          {summaryData.microTips.length > 0 && (
            <div className="space-y-2 pt-2">
              <div className="flex items-center gap-1.5">
                <SparklesIcon className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                  建议动作
                </span>
              </div>
              <div className="grid grid-cols-1 gap-2">
                {summaryData.microTips.map((tip, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-2 p-2.5 rounded-lg bg-emerald-500/5 border border-emerald-500/10 text-emerald-400"
                  >
                    <span className="text-xs font-medium">{tip}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────── */
/*  辅助函数                                                     */
/* ────────────────────────────────────────────────────────────── */

function getSubtitle(timeframe: string): string {
  switch (timeframe) {
    case 'day':
      return '近24小时概览';
    case 'week':
      return '近7日概览';
    case 'month':
      return '近30日概览';
    default:
      return '近期概览';
  }
}

function calculateChange(current: number | null | undefined, previous: number | null | undefined): number | undefined {
  if (current == null || previous == null || previous === 0) return undefined;
  return Number(((current - previous) / previous * 100).toFixed(1));
}

function buildTrendItem({
  id,
  label,
  tokenId,
  metricKey,
  data,
  isLoading,
  formatValue,
}: {
  id: string;
  label: string;
  tokenId: ChartTokenId;
  metricKey: string;
  data: StandardTimeSeries | null | undefined;
  isLoading: boolean;
  formatValue: (v: number) => string | number;
}) {
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
