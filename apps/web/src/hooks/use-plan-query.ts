'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, peekSessionId } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import type { Plan, PlanDraft, PlanDraftInput } from '@health-advisor/shared';

interface ExecuteDraftOptions {
  confirmReplace?: boolean;
}

/**
 * 计划相关的 React Query hooks。
 *
 * 设计要点：
 * - 后端 plan-store 是唯一事实源；前端不使用 Zustand / localStorage 持久化计划。
 * - sessionId 来自页面会话（peekSessionId 仅在浏览器侧返回非空字符串）。
 * - profileId 由调用方传入（一般是 useProfileStore().currentProfileId）。
 * - 替换未完成计划需 confirmReplace=true；调用方应在 UI 二次确认后再传 true。
 */

export function useCurrentPlan(profileId: string | undefined) {
  const sessionId = typeof window !== 'undefined' ? peekSessionId() : undefined;
  const enabled = Boolean(profileId && sessionId);
  return useQuery({
    queryKey: queryKeys.plan.current(sessionId ?? '', profileId ?? ''),
    queryFn: async () => {
      if (!profileId || !sessionId) return null;
      return apiClient.get<Plan | null>(
        `/sessions/${sessionId}/profiles/${profileId}/plans/current`,
      );
    },
    enabled,
    staleTime: 0,
    retry: false,
  });
}

export function useExecutePlanDraft(profileId: string | undefined) {
  const queryClient = useQueryClient();
  const sessionId = typeof window !== 'undefined' ? peekSessionId() : undefined;
  return useMutation({
    mutationFn: async (input: { draftId: string } & ExecuteDraftOptions) => {
      if (!profileId || !sessionId) {
        throw new Error('Session or profile is not ready');
      }
      const body = input.confirmReplace ? { confirmReplace: true } : {};
      return apiClient.post<Plan>(
        `/sessions/${sessionId}/profiles/${profileId}/plans/drafts/${input.draftId}/execute`,
        body,
      );
    },
    onSuccess: (plan) => {
      if (!profileId || !sessionId) return;
      queryClient.setQueryData(queryKeys.plan.current(sessionId, profileId), plan);
    },
  });
}

export function useTogglePlanTask(profileId: string | undefined) {
  const queryClient = useQueryClient();
  const sessionId = typeof window !== 'undefined' ? peekSessionId() : undefined;
  return useMutation({
    mutationFn: async (input: {
      planId: string;
      groupId: string;
      taskId: string;
      expectedVersion: number;
      completed: boolean;
    }) => {
      if (!profileId || !sessionId) {
        throw new Error('Session or profile is not ready');
      }
      const { planId, groupId, taskId, expectedVersion, completed } = input;
      return apiClient.patch<Plan>(
        `/sessions/${sessionId}/profiles/${profileId}/plans/${planId}/groups/${groupId}/tasks/${taskId}`,
        { expectedVersion, completed },
      );
    },
    onSuccess: (plan) => {
      if (!profileId || !sessionId) return;
      queryClient.setQueryData(queryKeys.plan.current(sessionId, profileId), plan);
    },
  });
}

export function useEndPlan(profileId: string | undefined) {
  const queryClient = useQueryClient();
  const sessionId = typeof window !== 'undefined' ? peekSessionId() : undefined;
  return useMutation({
    mutationFn: async () => {
      if (!profileId || !sessionId) {
        throw new Error('Session or profile is not ready');
      }
      return apiClient.delete<{ ended: boolean }>(
        `/sessions/${sessionId}/profiles/${profileId}/plans/current`,
      );
    },
    onSuccess: () => {
      if (!profileId || !sessionId) return;
      queryClient.setQueryData(queryKeys.plan.current(sessionId, profileId), null);
    },
  });
}

/** 仅用于测试或显式构造草稿；chat 响应中 LLM 输出的 planDraftPreview 由后端注入 draftId。 */
export function useSavePlanDraft(profileId: string | undefined) {
  const sessionId = typeof window !== 'undefined' ? peekSessionId() : undefined;
  return useMutation({
    mutationFn: async (input: PlanDraftInput) => {
      if (!profileId || !sessionId) {
        throw new Error('Session or profile is not ready');
      }
      return apiClient.post<PlanDraft>(
        `/sessions/${sessionId}/profiles/${profileId}/plans/draft`,
        input,
      );
    },
  });
}
