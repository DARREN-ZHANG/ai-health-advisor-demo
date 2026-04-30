'use client';

import type { EChartsOption } from 'echarts';
import { useMemo } from 'react';
import {
  ChartTokenId,
  CHART_TOKEN_META,
  localize,
  type DataCenterResponse,
  type DataTab,
  type StressTimelineResponse,
} from '@health-advisor/shared';
import {
  getChartBuilder,
  toTimeSeries,
  type ChartDataPoint,
  type StandardTimeSeries,
} from '@health-advisor/charts';
import { useLocale } from 'next-intl';
import type { Locale } from '@health-advisor/shared';

const TAB_TOKEN_MAP: Partial<Record<DataTab, ChartTokenId>> = {
  hrv: ChartTokenId.HRV_7DAYS,
  sleep: ChartTokenId.SLEEP_7DAYS,
  'resting-hr': ChartTokenId.RESTING_HR_7DAYS,
  activity: ChartTokenId.ACTIVITY_7DAYS,
  spo2: ChartTokenId.SPO2_7DAYS,
  stress: ChartTokenId.STRESS_LOAD_7DAYS,
};

export function useDataChartOption(
  tab: DataTab,
  data: DataCenterResponse | StressTimelineResponse | null | undefined
) {
  const locale = useLocale() as Locale;

  return useMemo<EChartsOption | null>(() => {
    if (!data) return null;

    const tokenId = TAB_TOKEN_MAP[tab];
    if (!tokenId) return null;
    const builder = getChartBuilder(tokenId);
    if (!builder) return null;

    const meta = CHART_TOKEN_META[tokenId];
    return builder(toStandardTimeSeries(tab, data), {
      label: localize(meta.label, locale),
      unit: localize(meta.unit, locale),
    });
  }, [tab, data, locale]);
}

function toStandardTimeSeries(
  tab: DataTab,
  data: DataCenterResponse | StressTimelineResponse
): StandardTimeSeries {
  if (tab === 'stress') {
    const stressData = data as StressTimelineResponse;
    return {
      dates: stressData.points.map((point) => point.date),
      series: {
        'stress.load': stressData.points.map((point) => point.stressLoadScore),
      },
    };
  }

  const standardData = data as DataCenterResponse;
  return toTimeSeries(standardData.timeline as ChartDataPoint[]);
}

/**
 * 各 tokenId 对应的 series key 映射，用于从 StandardTimeSeries 中提取数据
 */
const TOKEN_SERIES_KEY: Partial<Record<ChartTokenId, string>> = {
  [ChartTokenId.HRV_7DAYS]: 'hrv',
  [ChartTokenId.SLEEP_7DAYS]: 'sleep.totalMinutes',
  [ChartTokenId.RESTING_HR_7DAYS]: 'hr',
  [ChartTokenId.ACTIVITY_7DAYS]: 'activity.steps',
  [ChartTokenId.SPO2_7DAYS]: 'spo2',
  [ChartTokenId.STRESS_LOAD_7DAYS]: 'stress.load',
};

/**
 * 创建紧凑型图表选项，用于趋势卡片中的微型折线图
 * 不包含 title、tooltip、axis label 等元素
 */
export function createCompactChartOption(
  tokenId: ChartTokenId,
  data: StandardTimeSeries | null | undefined
): EChartsOption | null {
  if (!data || data.dates.length === 0) return null;

  const meta = CHART_TOKEN_META[tokenId];
  const seriesKey = TOKEN_SERIES_KEY[tokenId] ?? '';
  let seriesData = data.series[seriesKey] ?? [];

  // 睡眠数据需要将分钟转换为小时
  if (tokenId === ChartTokenId.SLEEP_7DAYS) {
    seriesData = seriesData.map((v) =>
      v !== null ? Number((v / 60).toFixed(1)) : null
    );
  }

  // 过滤掉全为 null 的数据
  const hasData = seriesData.some((v) => v !== null);
  if (!hasData) return null;

  return {
    backgroundColor: 'transparent',
    grid: { left: 0, right: 0, top: 4, bottom: 0 },
    xAxis: {
      type: 'category',
      data: data.dates,
      show: false,
      boundaryGap: false,
    },
    yAxis: {
      type: 'value',
      show: false,
    },
    series: [
      {
        type: 'line',
        data: seriesData,
        smooth: true,
        symbol: 'none',
        lineStyle: { color: meta.color, width: 2 },
        areaStyle: { color: meta.color, opacity: 0.15 },
      },
    ],
  };
}
