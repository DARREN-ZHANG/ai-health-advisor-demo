'use client';

import type { EChartsOption } from 'echarts';
import { useMemo } from 'react';
import {
  ChartTokenId,
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

const TAB_TOKEN_MAP: Record<DataTab, ChartTokenId> = {
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
  return useMemo<EChartsOption | null>(() => {
    if (!data) return null;

    const tokenId = TAB_TOKEN_MAP[tab];
    const builder = getChartBuilder(tokenId);
    if (!builder) return null;

    return builder(toStandardTimeSeries(tab, data));
  }, [tab, data]);
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
