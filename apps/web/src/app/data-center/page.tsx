'use client';

import { Container } from '@health-advisor/ui';
import { ChartRoot } from '@health-advisor/charts';
import { DataCenterControls } from '@/components/data-center/DataCenterControls';
import { ChartContainer } from '@/components/data-center/ChartContainer';
import { OverviewGrid } from '@/components/data-center/OverviewGrid';
import { DeviceStatusBar } from '@/components/data-center/DeviceStatusBar';
import { ReflectionSection } from '@/components/data-center/ReflectionSection';
import { SleepDetailView } from '@/components/data-center/SleepDetailView';
import { ActivityDetailView } from '@/components/data-center/ActivityDetailView';
import { ValoCard } from '@/components/valo/ValoCard';
import { useDataCenterStore } from '@/stores/data-center.store';
import { useProfileStore } from '@/stores/profile.store';
import { useDataCenterQuery, useChartDataByTokenQuery } from '@/hooks/use-data-query';
import { useDeviceSyncQuery } from '@/hooks/use-device-sync';
import { useDataChartOption, createCompactChartOption } from '@/hooks/use-data-chart-option';
import { useMemo } from 'react';
import {
  CHART_TOKEN_META,
  ChartTokenId,
  localize,
  DEFAULT_LOCALE,
  type DataCenterResponse,
  type DataTab,
  type StressTimelineResponse,
} from '@health-advisor/shared';
import type { StandardTimeSeries } from '@health-advisor/charts';
import { useTranslations } from 'next-intl';

/** tab 到翻译键的映射 */
const TAB_TITLE_KEYS: Record<string, string> = {
  overview: 'tabOverview',
  sleep: 'tabSleep',
  hrv: 'tabHrv',
  'resting-hr': 'tabRestingHr',
  activity: 'tabActivity',
  spo2: 'tabSpo2',
  stress: 'tabStress',
};

/** 趋势卡片配置（6 项核心指标） */
const TREND_TOKEN_CONFIGS = [
  { id: 'hrv', labelKey: 'trendHrv', tokenId: ChartTokenId.HRV_7DAYS, metricKey: 'hrv', formatValue: (v: number) => Math.round(v) },
  { id: 'sleep', labelKey: 'trendSleep', tokenId: ChartTokenId.SLEEP_7DAYS, metricKey: 'sleep.totalMinutes', formatValue: (v: number) => (v / 60).toFixed(1) },
  { id: 'resting-hr', labelKey: 'trendRestingHr', tokenId: ChartTokenId.RESTING_HR_7DAYS, metricKey: 'hr', formatValue: (v: number) => Math.round(v) },
  { id: 'activity', labelKey: 'trendActivity', tokenId: ChartTokenId.ACTIVITY_7DAYS, metricKey: 'activity.steps', formatValue: (v: number) => Math.round(v).toLocaleString() },
  { id: 'spo2', labelKey: 'trendSpo2', tokenId: ChartTokenId.SPO2_7DAYS, metricKey: 'spo2', formatValue: (v: number) => `${Math.round(v)}%` },
  { id: 'stress', labelKey: 'trendStress', tokenId: ChartTokenId.STRESS_LOAD_7DAYS, metricKey: 'stress.load', formatValue: (v: number) => Math.round(v) },
] as const;

/** tab 到 ChartTokenId 的映射 */
const TAB_TOKEN_ID: Partial<Record<DataTab, ChartTokenId>> = {
  hrv: ChartTokenId.HRV_7DAYS,
  sleep: ChartTokenId.SLEEP_7DAYS,
  'resting-hr': ChartTokenId.RESTING_HR_7DAYS,
  activity: ChartTokenId.ACTIVITY_7DAYS,
  spo2: ChartTokenId.SPO2_7DAYS,
  stress: ChartTokenId.STRESS_LOAD_7DAYS,
};

/** tab 到数据指标 key 的映射（用于从 DataCenterResponse.timeline 提取数据） */
const TAB_METRIC_KEY: Record<string, string> = {
  sleep: 'sleep.totalMinutes',
  hrv: 'hrv',
  'resting-hr': 'hr',
  activity: 'activity.steps',
  spo2: 'spo2',
};

/** 所有趋势 token 的 ID 列表 */
const TREND_TOKEN_IDS = TREND_TOKEN_CONFIGS.map((c) => c.tokenId);

export default function DataCenterPage() {
  const { activeTab, timeframe, setActiveTab } = useDataCenterStore();
  const { currentProfileId, currentProfile } = useProfileStore();
  const isOverview = activeTab === 'overview';
  const t = useTranslations('dataCenter');

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
        label: t(config.labelKey),
        value: '--',
        unit: localize(CHART_TOKEN_META[config.tokenId].unit, DEFAULT_LOCALE),
        accentColor: CHART_TOKEN_META[config.tokenId].color,
        isLoading: true,
      }));
    }

    return TREND_TOKEN_CONFIGS.map((config) =>
      buildTrendItem({
        id: config.id,
        label: t(config.labelKey),
        tokenId: config.tokenId,
        metricKey: config.metricKey,
        data: trendDataByToken[config.tokenId],
        isLoading: isTrendLoading,
        formatValue: config.formatValue,
      })
    );
  }, [trendDataByToken, isTrendLoading, t]);

  const isAnyLoading = isLoading || isFetching;

  // ReflectionSection 内部自行调用 useViewSummary；这里不再重复请求。
  const reflectionPageContext = useMemo(
    () => ({ page: 'data-center' as const, tab: activeTab, timeframe }),
    [activeTab, timeframe],
  );

  const isChartEmpty = !chartData || (
    !isOverview && activeTab === 'stress'
      ? (chartData as StressTimelineResponse).points?.length === 0
      : (chartData as DataCenterResponse).timeline?.length === 0
  );

  // 日均值（仅日级别详情 tab 使用）
  const dailyAvg = useMemo(() => {
    if (timeframe !== 'day' || isOverview) return null;
    return computeDailyAverage(activeTab, chartData);
  }, [timeframe, isOverview, activeTab, chartData]);

  // 设备同步状态
  const {
    data: deviceData,
    isLoading: isDeviceLoading,
    isError: isDeviceError,
  } = useDeviceSyncQuery(currentProfileId);

  return (
    <Container className="py-6 space-y-6 relative pb-24">
      <header>
        {/* 页面名称改为 Trends，URL 维持 /data-center */}
        <h1 className="text-2xl font-bold text-[var(--valo-text-primary)]">
          {t('pageName')}
        </h1>
        <p className="text-sm text-[var(--valo-text-secondary)]">
          {getSubtitle(timeframe, t)}
        </p>
      </header>

      {/* 控制卡：日期 + 指标 chips + 时间窗 */}
      <ValoCard>
        <DataCenterControls />
      </ValoCard>

      {/* Reflection：AI 洞察卡，内部自管请求状态 */}
      <ReflectionSection
        profileId={currentProfileId}
        pageContext={reflectionPageContext}
      />

      {/* 概览 Tab：6 指标网格 */}
      {isOverview && (
        <ValoCard as="section">
          <OverviewGrid
            trends={trends}
            onTrendClick={(id) => setActiveTab(id as DataTab)}
            showChange={timeframe === 'day'}
          />
        </ValoCard>
      )}

      {/* 详情 Tab：sleep / activity 在图表上方插入今日快照详情卡 */}
      {!isOverview && activeTab === 'sleep' && (
        <SleepDetailView data={chartData as DataCenterResponse | null} profile={currentProfile} />
      )}
      {!isOverview && activeTab === 'activity' && (
        <ActivityDetailView data={chartData as DataCenterResponse | null} />
      )}

      {/* 详情 Tab：日级别显示 24h 均值，周/月显示图表 */}
      {!isOverview && (
        <ValoCard as="section" className="space-y-4">
          <ChartContainer
            title={t(TAB_TITLE_KEYS[activeTab] || 'dataMetric')}
            isLoading={isAnyLoading}
            isEmpty={isChartEmpty}
            error={error ? t('loadFailedRetry') : undefined}
          >
            {timeframe === 'day'
              ? dailyAvg != null && (
                  <DailyAverageDisplay
                    value={formatDailyValue(activeTab, dailyAvg)}
                    unit={
                      TAB_TOKEN_ID[activeTab as DataTab]
                        ? localize(CHART_TOKEN_META[TAB_TOKEN_ID[activeTab as DataTab]!].unit, DEFAULT_LOCALE)
                        : ''
                    }
                    label={t('avg24h')}
                  />
                )
              : chartOption && <ChartRoot option={chartOption} height={350} />
            }
          </ChartContainer>
        </ValoCard>
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
/*  24h 均值展示                                                 */
/* ────────────────────────────────────────────────────────────── */

function DailyAverageDisplay({
  value,
  unit,
  label,
}: {
  value: string;
  unit: string;
  label: string;
}) {
  return (
    <div className="h-full w-full flex items-center justify-center">
      <div className="text-center space-y-3">
        <p className="text-6xl font-bold text-[var(--valo-text-primary)] tabular-nums">
          {value}
        </p>
        <p className="text-sm text-[var(--valo-text-secondary)]">
          {unit} · {label}
        </p>
      </div>
    </div>
  );
}

/** 计算 24h 均值 */
function computeDailyAverage(
  tab: string,
  data: DataCenterResponse | StressTimelineResponse | null | undefined
): number | null {
  if (!data) return null;

  // 压力数据使用后端汇总
  if (tab === 'stress') {
    const stressData = data as StressTimelineResponse;
    return stressData.summary?.average ?? null;
  }

  const standardData = data as DataCenterResponse;
  const metricKey = TAB_METRIC_KEY[tab];
  if (!metricKey) return null;

  const values = standardData.timeline
    ?.map((point) => point.values[metricKey])
    .filter((v): v is number => v !== null) ?? [];

  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/** 格式化日均值显示 */
function formatDailyValue(tab: string, value: number): string {
  switch (tab) {
    case 'sleep':
      return (value / 60).toFixed(1);
    case 'activity':
      return Math.round(value).toLocaleString();
    default:
      return Math.round(value).toString();
  }
}

/* ────────────────────────────────────────────────────────────── */
/*  辅助函数                                                     */
/* ────────────────────────────────────────────────────────────── */

function getSubtitle(timeframe: string, t: (key: string) => string): string {
  switch (timeframe) {
    case 'day':
      return t('subtitleDay');
    case 'week':
      return t('subtitleWeek');
    case 'month':
      return t('subtitleMonth');
    default:
      return t('subtitleDefault');
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
    unit: localize(meta.unit, DEFAULT_LOCALE),
    change: calculateChange(current, previous),
    accentColor: meta.color,
    chartOption: createCompactChartOption(tokenId, data),
    isLoading,
  };
}
