'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { mapActiveSensingToBanner } from '@/lib/god-mode';
import { queryKeys } from '@/lib/query-keys';
import { useProfileStore } from '@/stores/profile.store';
import { useActiveSensingStore } from '@/stores/active-sensing.store';
import type {
  ActiveSensingState,
  DemoScriptRunResponse,
  EventInjectPayload,
  GodModeStateResponse,
  MetricOverridePayload,
  ResetPayload,
} from '@health-advisor/shared';

export function useGodModeState() {
  return useQuery({
    queryKey: queryKeys.godMode.all,
    queryFn: () => apiClient.get<GodModeStateResponse>('/god-mode/state'),
    staleTime: 30 * 1000,
  });
}

export function useGodModeActions() {
  const queryClient = useQueryClient();
  const { setProfileId } = useProfileStore();
  const { showBanner, hideBanner } = useActiveSensingStore();

  const syncActiveSensingBanner = (activeSensing: ActiveSensingState | null) => {
    if (activeSensing?.visible && activeSensing.surface === 'banner') {
      showBanner(mapActiveSensingToBanner(activeSensing));
      return;
    }

    hideBanner();
  };

  /**
   * GM-001 & GM-002: Profile Switch
   */
  const switchProfileMutation = useMutation({
    mutationFn: async (profileId: string) => {
      return apiClient.post<GodModeStateResponse>('/god-mode/switch-profile', { profileId });
    },
    onSuccess: (state) => {
      // 更新本地存储的 profileId
      setProfileId(state.currentProfileId);
      syncActiveSensingBanner(state.activeSensing);

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
      return apiClient.post<GodModeStateResponse>('/god-mode/inject-event', payload);
    },
    onSuccess: (data) => {
      setProfileId(data.currentProfileId);
      syncActiveSensingBanner(data.activeSensing);

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
      return apiClient.post<GodModeStateResponse>('/god-mode/override-metric', payload);
    },
    onSuccess: (state) => {
      setProfileId(state.currentProfileId);
      syncActiveSensingBanner(state.activeSensing);

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
      return apiClient.post<GodModeStateResponse>('/god-mode/reset', payload);
    },
    onSuccess: (state) => {
      setProfileId(state.currentProfileId);
      syncActiveSensingBanner(state.activeSensing);

      // 重置后恢复基础状态，失效所有动态数据
      queryClient.invalidateQueries({ queryKey: queryKeys.homepage.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.dataCenter.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.godMode.all });
    },
  });

  /**
   * GM-009: Apply Scenario
   */
  const applyScenarioMutation = useMutation({
    mutationFn: async (scenarioId: string) => {
      return apiClient.post<GodModeStateResponse>('/god-mode/scenario/apply', { scenarioId });
    },
    onSuccess: (state) => {
      setProfileId(state.currentProfileId);
      syncActiveSensingBanner(state.activeSensing);

      queryClient.invalidateQueries({ queryKey: queryKeys.homepage.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.dataCenter.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.profile.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.godMode.all });
    },
  });

  /**
   * GM-010: Run Demo Script
   */
  const runDemoScriptMutation = useMutation({
    mutationFn: async (scenarioId: string) => {
      return apiClient.post<DemoScriptRunResponse>('/god-mode/demo-script/run', { scenarioId });
    },
    onSuccess: (result) => {
      setProfileId(result.state.currentProfileId);
      syncActiveSensingBanner(result.state.activeSensing);

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
    applyScenario: applyScenarioMutation.mutateAsync,
    isApplyingScenario: applyScenarioMutation.isPending,
    runDemoScript: runDemoScriptMutation.mutateAsync,
    isRunningDemoScript: runDemoScriptMutation.isPending,
  };
}
