'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';

export interface DeviceSyncOverview {
  profileId: string;
  samplingIntervalMinutes: number | null;
  totalDeviceSamples: number;
  pendingDeviceSamples: number;
  firstDeviceSampleAt: string | null;
  lastDeviceSampleAt: string | null;
  lastSyncedSampleAt: string | null;
  syncSessions: Array<{
    syncId: string;
    connectedAt: string;
    disconnectedAt: string;
    uploadedRange: {
      start: string;
      end: string;
    };
    sampleCount: number;
    firstSampleAt: string | null;
    lastSampleAt: string | null;
  }>;
}

export function useDeviceSyncQuery(profileId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.dataCenter.deviceSync(profileId || ''),
    queryFn: async () => {
      if (!profileId) return null;
      return apiClient.get<DeviceSyncOverview>(`/profiles/${profileId}/device-sync`);
    },
    enabled: !!profileId,
    staleTime: 30 * 1000, // 30s
    retry: 1,
  });
}
