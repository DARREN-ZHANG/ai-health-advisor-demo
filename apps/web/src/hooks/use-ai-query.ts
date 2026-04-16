'use client';

import { useQuery, useMutation } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import type { AgentResponseEnvelope, PageContext, DataTab, Timeframe } from '@health-advisor/shared';

export interface ChatRequest {
  profileId: string;
  pageContext: PageContext;
  userMessage: string;
  smartPromptId?: string;
  visibleChartIds?: string[];
}

export function useMorningBrief(profileId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.homepage.brief(profileId || ''),
    queryFn: async () => {
      if (!profileId) return null;

      const pageContext: PageContext = {
        profileId,
        page: 'homepage',
        timeframe: 'week',
      };

      return apiClient.post<AgentResponseEnvelope>('/ai/morning-brief', {
        profileId,
        pageContext,
      });
    },
    enabled: !!profileId,
    staleTime: 30 * 60 * 1000, // 30 minutes
    retry: 1,
  });
}

/**
 * 手动刷新 morning brief，绕过前后端缓存强制调用 LLM。
 * 使用 useMutation 而非 refetch，以便传递 bustCache 标记。
 */
export function useRefetchBrief(
  profileId: string | undefined,
  options?: { onSuccess?: (data: AgentResponseEnvelope | null) => void },
) {
  return useMutation({
    mutationFn: async () => {
      if (!profileId) return null;

      const pageContext: PageContext = {
        profileId,
        page: 'homepage',
        timeframe: 'week',
      };

      return apiClient.post<AgentResponseEnvelope>('/ai/morning-brief', {
        profileId,
        pageContext,
        bustCache: true,
      });
    },
    onSuccess: options?.onSuccess,
  });
}

export function useViewSummary(
  profileId: string | undefined,
  tab: string,
  timeframe: string
) {
  return useQuery({
    queryKey: queryKeys.dataCenter.viewSummary(profileId || '', tab, timeframe),
    queryFn: async () => {
      if (!profileId) return null;

      const pageContext: PageContext = {
        profileId,
        page: 'data-center',
        dataTab: tab as DataTab,
        timeframe: timeframe as Timeframe,
      };

      return apiClient.post<AgentResponseEnvelope>('/ai/view-summary', {
        profileId,
        pageContext,
      });
    },
    enabled: false, // 按需触发，不在页面加载时自动请求
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}

export function useAdvisorChat() {
  return useMutation({
    mutationFn: (payload: ChatRequest) => {
      return apiClient.post<AgentResponseEnvelope>('/ai/chat', payload);
    },
  });
}
