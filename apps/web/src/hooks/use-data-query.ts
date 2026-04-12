'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import type { DataTab, Timeframe, StressTimelineResponse, ChartTokenId } from '@health-advisor/shared';
import type { StandardTimeSeries } from '@health-advisor/charts';

// Re-using types from service.ts since we'll receive the same structure
export interface DataCenterResponse {
  profileId: string;
  tab: DataTab;
  timeframe: Timeframe;
  timeline: { date: string; values: Record<string, number | null> }[];
  metadata: {
    recordCount: number;
    metrics: string[];
  };
}

export function useDataCenterQuery(
  profileId: string | undefined,
  tab: string,
  timeframe: string
) {
  const isStress = tab === 'stress';
  const queryKey = isStress
    ? queryKeys.dataCenter.stress(profileId || '', timeframe)
    : queryKeys.dataCenter.timeline(profileId || '', timeframe);

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
    queryKey: [...queryKeys.dataCenter.all, 'chart-data', profileId, tokens.join(','), timeframe],
    queryFn: async () => {
      if (!profileId || tokens.length === 0) return null;
      
      const response = await apiClient.get<StandardTimeSeries>(
        `/profiles/${profileId}/chart-data?tokens=${tokens.join(',')}&timeframe=${timeframe}`
      );
      return response;
    },
    enabled: !!profileId && tokens.length > 0,
    staleTime: 5 * 60 * 1000,
  });
}
