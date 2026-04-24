'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { useProfileStore } from '@/stores/profile.store';
import type {
  UpdateProfileResponse,
  CloneProfileResponse,
  DeleteProfileResponse,
  ResetProfileResponse,
} from '@health-advisor/shared';

export function useProfileActions() {
  const queryClient = useQueryClient();
  const { setProfileId } = useProfileStore();

  /** 失效所有受 profile 影响的查询 */
  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.homepage.all });
    queryClient.invalidateQueries({ queryKey: queryKeys.dataCenter.all });
    queryClient.invalidateQueries({ queryKey: queryKeys.profile.all });
    queryClient.invalidateQueries({ queryKey: queryKeys.godMode.all });
  };

  /** 更新 profile 字段 */
  const updateProfileMutation = useMutation({
    mutationFn: async (params: {
      profileId: string;
      changes: Record<string, unknown>;
    }) => {
      return apiClient.put<UpdateProfileResponse>(
        `/god-mode/profiles/${params.profileId}`,
        params.changes,
      );
    },
    onSuccess: () => {
      invalidateAll();
    },
  });

  /** 克隆创建新 profile */
  const cloneProfileMutation = useMutation({
    mutationFn: async (params: {
      sourceProfileId: string;
      newProfileId: string;
      overrides?: Record<string, unknown>;
    }) => {
      return apiClient.post<CloneProfileResponse>('/god-mode/profiles', params);
    },
    onSuccess: (data) => {
      // 切换到新 profile
      setProfileId(data.profile.profileId);
      invalidateAll();
    },
  });

  /** 删除 profile */
  const deleteProfileMutation = useMutation({
    mutationFn: async (params: { profileId: string }) => {
      return apiClient.delete<DeleteProfileResponse>(
        `/god-mode/profiles/${params.profileId}`,
      );
    },
    onSuccess: () => {
      invalidateAll();
    },
  });

  /** 恢复 profile 到默认 */
  const resetProfileMutation = useMutation({
    mutationFn: async (params: { profileId: string }) => {
      return apiClient.post<ResetProfileResponse>(
        `/god-mode/profiles/${params.profileId}/reset`,
        {},
      );
    },
    onSuccess: () => {
      invalidateAll();
    },
  });

  return {
    updateProfile: updateProfileMutation.mutateAsync,
    isUpdatingProfile: updateProfileMutation.isPending,
    cloneProfile: cloneProfileMutation.mutateAsync,
    isCloningProfile: cloneProfileMutation.isPending,
    deleteProfile: deleteProfileMutation.mutateAsync,
    isDeletingProfile: deleteProfileMutation.isPending,
    resetProfile: resetProfileMutation.mutateAsync,
    isResettingProfile: resetProfileMutation.isPending,
  };
}
