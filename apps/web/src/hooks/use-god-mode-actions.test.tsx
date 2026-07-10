import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useGodModeActions } from './use-god-mode-actions';
import { queryKeys } from '@/lib/query-keys';
import { useProfileStore } from '@/stores/profile.store';
import { useActiveSensingStore } from '@/stores/active-sensing.store';
import type { GodModeStateResponse } from '@health-advisor/shared';

/**
 * God Mode 写操作的 query invalidation 回归测试。
 *
 * Spec step 6 要求 advanceClock.onSuccess 同步失效 homepage、dataCenter、godMode
 * 三类查询；本测试 mock apiClient + invalidateQueries spy，验证三个 key 都被调用。
 *
 * appendTimeline / appendMicroEvent 由上层流程显式强制刷新简报，
 * 不得在 mutation 层再次失效 homepage，避免并发 LLM 请求。
 */

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    post: vi.fn(),
    get: vi.fn(),
  },
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );
  }
  return { Wrapper, queryClient };
}

const SAMPLE_STATE: GodModeStateResponse = {
  currentProfileId: 'profile-a',
  activeSensing: null,
} as unknown as GodModeStateResponse;

describe('useGodModeActions query invalidation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useProfileStore.setState({ currentProfileId: 'profile-a', currentProfile: null });
    useActiveSensingStore.setState({
      activeBanner: null,
      isVisible: false,
      pendingProbabilisticAction: null,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('advanceClock 成功后失效 homepage / dataCenter / godMode 三类查询', async () => {
    const { apiClient } = await import('@/lib/api-client');
    (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValue(SAMPLE_STATE);

    const { Wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useGodModeActions(), {
      wrapper: Wrapper,
    });

    await act(async () => {
      await result.current.advanceClock(60);
    });

    // Spec 合规：三个 queryKey 都必须被调用。
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.homepage.all,
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.dataCenter.all,
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.godMode.all,
    });

    invalidateSpy.mockRestore();
  });

  it('advanceClock 失败时不调用 invalidateQueries（mutation 未到达 onSuccess）', async () => {
    const { apiClient } = await import('@/lib/api-client');
    (apiClient.post as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('boom'),
    );

    const { Wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useGodModeActions(), {
      wrapper: Wrapper,
    });

    await act(async () => {
      await expect(result.current.advanceClock(60)).rejects.toThrow('boom');
    });

    await waitFor(() => {
      // onSuccess 没跑，因此一次 invalidateQueries 都不应该出现。
      expect(invalidateSpy).not.toHaveBeenCalled();
    });

    invalidateSpy.mockRestore();
  });

  it('appendMicroEvent 不自动刷新 homepage，避免与显式 LLM 刷新竞争', async () => {
    const { apiClient } = await import('@/lib/api-client');
    (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValue(SAMPLE_STATE);

    const { Wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useGodModeActions(), {
      wrapper: Wrapper,
    });

    await act(async () => {
      await result.current.appendMicroEvent({
        microEventType: 'micro_hydration_walk',
        advanceClock: true,
      });
    });

    expect(invalidateSpy).not.toHaveBeenCalledWith({
      queryKey: queryKeys.homepage.all,
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.dataCenter.all,
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.godMode.all,
    });
  });

  it('appendTimeline 不自动刷新 homepage，避免同一次添加事件生成两次简报', async () => {
    const { apiClient } = await import('@/lib/api-client');
    (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValue(SAMPLE_STATE);

    const { Wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useGodModeActions(), {
      wrapper: Wrapper,
    });

    await act(async () => {
      await result.current.appendTimeline({ segmentType: 'walk' });
    });

    expect(invalidateSpy).not.toHaveBeenCalledWith({
      queryKey: queryKeys.homepage.all,
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.dataCenter.all,
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.godMode.all,
    });
  });
});
