'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient, AI_REQUEST_TIMEOUT_MS } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import {
  streamMorningBrief,
  type MorningBriefRequest,
} from '@/lib/brief-stream-client';
import { useBriefStreamStore } from '@/stores/brief-stream.store';
import type {
  AgentResponseEnvelope,
  PageContext,
  DataTab,
  Timeframe,
} from '@health-advisor/shared';

export interface ChatRequest {
  profileId: string;
  pageContext: PageContext;
  userMessage: string;
  smartPromptId?: string;
  visibleChartIds?: string[];
}

/**
 * 统一的 morning brief 流式执行 helper（任务 3.2）。
 *
 * initial query 与 bust-cache mutation 共用本函数，统一管理
 * brief-stream store 的 begin/append/complete/fail 生命周期。
 *
 * 生命周期：
 * 1. begin：分配新 requestId（crypto.randomUUID），在 store 里创建 draft entry。
 *    requestId 唯一标识本次流，stale 事件（profile 切换/快速连点）由 store 校验拒绝。
 * 2. append：每个 brief.summary.delta 事件回调 store.append，draftSummary 逐步增长。
 *    store 内部校验 requestId，stale 事件不覆盖新 entry。
 * 3. complete：streamMorningBrief resolve 后调 store.complete，清除 draft entry。
 *    完整 envelope 返回给 React Query，由其原子写入 cache。
 * 4. fail：try/catch 捕获任何 reject（HTTP 错误/协议违规/failed/abort），
 *    调 store.fail 清除 draft entry，再向上抛出错误。
 *
 * 关键：provisional delta 只进 brief-stream store，从不写入 React Query cache。
 * cache 只承载终态 envelope，保证结构化字段（actions/statusColor/futureSuggestions）
 * 在 completed 时原子替换。
 */
async function runBriefStream(
  profileId: string,
  pageContext: PageContext,
  bustCache: boolean,
  signal: AbortSignal,
): Promise<AgentResponseEnvelope> {
  const requestId = crypto.randomUUID();
  const store = useBriefStreamStore.getState();
  store.begin(profileId, requestId);

  try {
    const payload: MorningBriefRequest = {
      profileId,
      pageContext,
      ...(bustCache ? { bustCache: true } : {}),
    };
    const envelope = await streamMorningBrief(payload, {
      requestId,
      signal,
      onEvent: (event) => {
        // 每次 onEvent 重新 getState()，确保拿到最新 store 实例
        // （Zustand store 是单例，getState() 始终返回最新状态）。
        const store = useBriefStreamStore.getState();
        switch (event.type) {
          case 'brief.summary.delta':
            store.append(profileId, requestId, event.delta);
            break;
          case 'brief.summary.done':
            store.markSummaryDone(profileId, requestId);
            break;
          case 'brief.action.ready':
            store.appendAction(profileId, requestId, event.index, event.action);
            break;
          case 'brief.forecast.started':
            store.markForecastStarted(profileId, requestId);
            break;
          case 'brief.future_suggestion.ready':
            store.appendFutureSuggestion(profileId, requestId, event.index, event.suggestion);
            break;
          // brief.started / brief.completed / brief.failed 仍由外层
          // try/finally + streamMorningBrief 的 resolve/reject 处理。
        }
      },
    });
    store.complete(profileId, requestId);
    return envelope;
  } catch (error) {
    store.fail(profileId, requestId);
    throw error;
  }
}

export function useMorningBrief(profileId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.homepage.brief(profileId || ''),
    queryFn: async ({ signal }) => {
      if (!profileId) return null;

      const pageContext: PageContext = {
        profileId,
        page: 'homepage',
        timeframe: 'week',
      };

      // React Query 5 提供 signal：组件卸载/profile 切换时 abort，
      // streamMorningBrief 透传给 fetch，流式请求被取消。
      return runBriefStream(profileId, pageContext, false, signal);
    },
    enabled: !!profileId,
    staleTime: 30 * 60 * 1000, // 30 minutes
    // AI 请求采用 quick fail，避免浏览器超时后隐式发起第二次长请求。
    retry: false,
  });
}

/**
 * 手动刷新 morning brief，绕过前后端缓存强制调用 LLM。
 * 使用 useMutation 而非 refetch，以便传递 bustCache 标记。
 *
 * 流式改造（任务 3.2）：
 * - mutationFn 调 runBriefStream(bustCache:true)，delta 经 brief-stream store 累积，
 *   UI 在终态到达前就能看到 summary 逐步增长。
 * - mutation 没有 React Query signal，用 AbortSignal.timeout 兜底超时；
 *   与 streamMorningBrief 的 abort 语义对齐（流式请求可能持续很久）。
 * - onSuccess 仍保留 setQueryData：completed 后 envelope 原子写入 cache，
 *   provisional delta 从未进 cache。
 */
export function useRefetchBrief(
  profileId: string | undefined,
  options?: { onSuccess?: (data: AgentResponseEnvelope | null) => void },
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (!profileId) return null;

      const pageContext: PageContext = {
        profileId,
        page: 'homepage',
        timeframe: 'week',
      };

      // mutation 没有 React Query signal，用 AbortSignal.timeout 兜底。
      // 与 AI_REQUEST_TIMEOUT_MS 一致（后端 AI_TIMEOUT_MS 内回 fallback）。
      return runBriefStream(
        profileId,
        pageContext,
        true,
        AbortSignal.timeout(AI_REQUEST_TIMEOUT_MS),
      );
    },
    onSuccess: (data) => {
      if (data && profileId) {
        queryClient.setQueryData(queryKeys.homepage.brief(profileId), data);
      }
      options?.onSuccess?.(data);
    },
  });
}

export function useViewSummary(
  profileId: string | undefined,
  tab: DataTab,
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
      }, { timeoutMs: AI_REQUEST_TIMEOUT_MS });
    },
    enabled: !!profileId, // 页面加载时自动请求
    staleTime: 5 * 60 * 1000,
    // AI 请求采用 quick fail，避免浏览器超时后隐式发起第二次长请求。
    retry: false,
  });
}

export function useAdvisorChat() {
  return useMutation({
    mutationFn: (payload: ChatRequest) => {
      return apiClient.post<AgentResponseEnvelope>('/ai/chat', payload, { timeoutMs: AI_REQUEST_TIMEOUT_MS });
    },
  });
}
