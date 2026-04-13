'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import type { StressTimelineResponse, ChartTokenId, DataCenterResponse } from '@health-advisor/shared';
import type { StandardTimeSeries, ChartDataPoint } from '@health-advisor/charts';
import { toTimeSeries } from '@health-advisor/charts';

export function useDataCenterQuery(
  profileId: string | undefined,
  tab: string,
  timeframe: string
) {
  const isStress = tab === 'stress';
  const queryKey = isStress
    ? queryKeys.dataCenter.stress(profileId || '', timeframe)
    : queryKeys.dataCenter.timeline(profileId || '', tab, timeframe);

  return useQuery({
    queryKey,
    queryFn: async () => {
      if (!profileId) return null;
      
      const response = await apiClient.get<DataCenterResponse | StressTimelineResponse>(
        `/profiles/${profileId}/data?tab=${tab}&timeframe=${timeframe}`
      );
      return response;
    },
    enabled: !!profileId,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}

export function useChartDataQuery(
  profileId: string | undefined,
  tokens: ChartTokenId[],
  timeframe: string = 'week'
) {
  return useQuery({
    queryKey: queryKeys.dataCenter.chartData(profileId || '', tokens.join(','), timeframe),
    queryFn: async () => {
      if (!profileId || tokens.length === 0) return null;

      const response = await apiClient.get<unknown>(
        `/profiles/${profileId}/chart-data?tokens=${tokens.join(',')}&timeframe=${timeframe}`
      );
      return normalizeChartDataResponse(response);
    },
    enabled: !!profileId && tokens.length > 0,
    staleTime: 5 * 60 * 1000,
  });
}

function normalizeChartDataResponse(response: unknown): StandardTimeSeries | null {
  if (!response) return null;

  if (isStandardTimeSeries(response)) {
    return response;
  }

  if (hasTimeline(response)) {
    return toTimeSeries(response.timeline);
  }

  if (Array.isArray(response)) {
    const timelines = response.filter(hasTimeline).map((item) => item.timeline);
    if (timelines.length === 0) return null;
    return toTimeSeries(mergeTimelinePoints(timelines));
  }

  return null;
}

function isStandardTimeSeries(value: unknown): value is StandardTimeSeries {
  return (
    typeof value === 'object' &&
    value !== null &&
    'dates' in value &&
    Array.isArray((value as { dates?: unknown }).dates) &&
    'series' in value &&
    typeof (value as { series?: unknown }).series === 'object'
  );
}

function hasTimeline(value: unknown): value is { timeline: ChartDataPoint[] } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'timeline' in value &&
    Array.isArray((value as { timeline?: unknown }).timeline)
  );
}

function mergeTimelinePoints(timelines: ChartDataPoint[][]): ChartDataPoint[] {
  const merged = new Map<string, Record<string, number | null>>();

  for (const timeline of timelines) {
    for (const point of timeline) {
      const existing = merged.get(point.date) ?? {};
      merged.set(point.date, {
        ...existing,
        ...point.values,
      });
    }
  }

  return Array.from(merged.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, values]) => ({ date, values }));
}
