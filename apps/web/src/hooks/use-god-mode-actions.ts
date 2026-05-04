'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { mapActiveSensingToBanner } from '@/lib/god-mode';
import { queryKeys } from '@/lib/query-keys';
import { useProfileStore } from '@/stores/profile.store';
import { useActiveSensingStore } from '@/stores/active-sensing.store';
import type {
  ActiveSensingState,
  EventInjectPayload,
  GodModeStateResponse,
  TimelineAppendPayload,
  ResetProfileTimelinePayload,
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

  /** 概率事件类型：这些事件在用户确认前不应触发简报更新 */
  const PROBABILISTIC_EVENT_TYPES = new Set([
    'possible_alcohol_intake',
    'possible_caffeine_intake',
    'probabilistic_dismissed',
  ]);

  /**
   * GM-003: Inject Event
   */
  const injectEventMutation = useMutation({
    mutationFn: async (payload: EventInjectPayload & { profileId?: string }) => {
      return apiClient.post<GodModeStateResponse>('/god-mode/inject-event', payload);
    },
    onSuccess: (data, variables) => {
      setProfileId(data.currentProfileId);
      syncActiveSensingBanner(data.activeSensing);

      // 概率事件在用户确认前不应触发简报更新，仅刷新 godMode 状态以显示/隐藏 Banner
      const isProbabilistic = PROBABILISTIC_EVENT_TYPES.has(variables.eventType);
      if (!isProbabilistic) {
        queryClient.invalidateQueries({ queryKey: queryKeys.homepage.all });
        queryClient.invalidateQueries({ queryKey: queryKeys.dataCenter.all });
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.godMode.all });
    },
  });

  /**
   * GM-TL1: 追加活动片段
   */
  const appendTimelineMutation = useMutation({
    mutationFn: async (payload: TimelineAppendPayload) => {
      return apiClient.post<GodModeStateResponse>('/god-mode/timeline-append', payload);
    },
    onSuccess: (state) => {
      setProfileId(state.currentProfileId);
      syncActiveSensingBanner(state.activeSensing);
      queryClient.invalidateQueries({ queryKey: queryKeys.homepage.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.dataCenter.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.godMode.all });
    },
  });

  /**
   * GM-TL2: 触发同步
   */
  const triggerSyncMutation = useMutation({
    mutationFn: async (trigger: 'app_open' | 'manual_refresh') => {
      return apiClient.post<GodModeStateResponse>('/god-mode/sync-trigger', { trigger });
    },
    onSuccess: (state) => {
      setProfileId(state.currentProfileId);
      syncActiveSensingBanner(state.activeSensing);
      queryClient.invalidateQueries({ queryKey: queryKeys.homepage.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.dataCenter.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.godMode.all });
    },
  });

  /**
   * GM-TL3: 推进时钟
   */
  const advanceClockMutation = useMutation({
    mutationFn: async (minutes: number) => {
      return apiClient.post<GodModeStateResponse>('/god-mode/advance-clock', { minutes });
    },
    onSuccess: (state) => {
      setProfileId(state.currentProfileId);
      syncActiveSensingBanner(state.activeSensing);
      queryClient.invalidateQueries({ queryKey: queryKeys.godMode.all });
    },
  });

  /**
   * GM-TL4: 重置时间轴
   */
  const resetTimelineMutation = useMutation({
    mutationFn: async (payload: ResetProfileTimelinePayload) => {
      return apiClient.post<GodModeStateResponse>('/god-mode/reset-profile-timeline', payload);
    },
    onSuccess: (state) => {
      setProfileId(state.currentProfileId);
      syncActiveSensingBanner(state.activeSensing);
      queryClient.invalidateQueries({ queryKey: queryKeys.homepage.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.dataCenter.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.godMode.all });
    },
  });

  return {
    switchProfile: switchProfileMutation.mutateAsync,
    isSwitchingProfile: switchProfileMutation.isPending,
    injectEvent: injectEventMutation.mutateAsync,
    isInjectingEvent: injectEventMutation.isPending,
    appendTimeline: appendTimelineMutation.mutateAsync,
    isAppendingTimeline: appendTimelineMutation.isPending,
    triggerSync: triggerSyncMutation.mutateAsync,
    isTriggeringSync: triggerSyncMutation.isPending,
    advanceClock: advanceClockMutation.mutateAsync,
    isAdvancingClock: advanceClockMutation.isPending,
    resetTimeline: resetTimelineMutation.mutateAsync,
    isResettingTimeline: resetTimelineMutation.isPending,
  };
}
