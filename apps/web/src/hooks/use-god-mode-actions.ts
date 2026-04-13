'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { useProfileStore } from '@/stores/profile.store';
import { useActiveSensingStore } from '@/stores/active-sensing.store';
import type { EventInjectPayload, MetricOverridePayload, ResetPayload } from '@health-advisor/shared';

export interface GodModeState {
  currentProfileId: string;
  activeOverrides: any[];
  injectedEvents: any[];
  availableScenarios: Array<{ id: string; label: string; icon?: string; type: string }>;
}

export function useGodModeState() {
  return useQuery({
    queryKey: queryKeys.godMode.all,
    queryFn: () => apiClient.get<GodModeState>('/god-mode/state'),
    staleTime: 30 * 1000,
  });
}

export function useGodModeActions() {
  const queryClient = useQueryClient();
  const { setProfileId } = useProfileStore();
  const { showBanner } = useActiveSensingStore();

  /**
   * GM-001 & GM-002: Profile Switch
   */
  const switchProfileMutation = useMutation({
    mutationFn: async (profileId: string) => {
      await apiClient.post('/god-mode/switch-profile', { profileId });
      return profileId;
    },
    onSuccess: (profileId) => {
      // 更新本地存储的 profileId
      setProfileId(profileId);

      // GM-002: 使所有受 profile 影响的查询失效
      // 包括首页晨报、数据中心、图表等
      queryClient.invalidateQueries({ queryKey: queryKeys.homepage.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.dataCenter.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.profile.all });
      // 同时也使 God-Mode 自身状态失效，以反映后端最新的 profile 状态
      queryClient.invalidateQueries({ queryKey: queryKeys.godMode.all });
    },
  });

  /**
   * GM-003: Inject Event
   */
  const injectEventMutation = useMutation({
    mutationFn: async (payload: EventInjectPayload & { profileId?: string }) => {
      return apiClient.post<{ banner?: any }>('/god-mode/inject-event', payload);
    },
    onSuccess: (data) => {
      // GM-004: 如果后端返回了 active-sensing 数据，展示横幅
      if (data && (data as any).banner) {
        showBanner((data as any).banner);
      }

      // 注入事件后，数据通常会发生变化，失效相关查询
      queryClient.invalidateQueries({ queryKey: queryKeys.homepage.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.dataCenter.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.godMode.all });
    },
  });

  /**
   * GM-006: Override Metric
   */
  const overrideMetricMutation = useMutation({
    mutationFn: async (payload: MetricOverridePayload & { profileId?: string }) => {
      return apiClient.post('/god-mode/override-metric', payload);
    },
    onSuccess: () => {
      // GM-007: 局部失效策略，这里我们保守点，失效受影响的数据查询
      queryClient.invalidateQueries({ queryKey: queryKeys.homepage.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.dataCenter.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.godMode.all });
    },
  });

  /**
   * GM-008: Reset
   */
  const resetMutation = useMutation({
    mutationFn: async (payload: ResetPayload) => {
      return apiClient.post('/god-mode/reset', payload);
    },
    onSuccess: () => {
      // 重置后恢复基础状态，失效所有动态数据
      queryClient.invalidateQueries({ queryKey: queryKeys.homepage.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.dataCenter.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.godMode.all });
    },
  });

  /**
   * GM-010: Run Demo Script
   */
  const runDemoScriptMutation = useMutation({
    mutationFn: async (scenarioId: string) => {
      return apiClient.post('/god-mode/demo-script/run', { scenarioId });
    },
    onSuccess: () => {
      // 执行脚本后，可能涉及 profile 切换或数据变更，全面失效
      queryClient.invalidateQueries({ queryKey: queryKeys.homepage.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.dataCenter.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.profile.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.godMode.all });
    },
  });

  return {
    switchProfile: switchProfileMutation.mutateAsync,
    isSwitchingProfile: switchProfileMutation.isPending,
    injectEvent: injectEventMutation.mutateAsync,
    isInjectingEvent: injectEventMutation.isPending,
    overrideMetric: overrideMetricMutation.mutateAsync,
    isOverridingMetric: overrideMetricMutation.isPending,
    reset: resetMutation.mutateAsync,
    isResetting: resetMutation.isPending,
    runDemoScript: runDemoScriptMutation.mutateAsync,
    isRunningDemoScript: runDemoScriptMutation.isPending,
  };
}
