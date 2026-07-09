import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useProfilesQuery, type ProfileSummary } from './use-profiles-query';

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

const PROFILES: ProfileSummary[] = [
  { profileId: 'profile-a', name: 'Account A', avatar: 'avatar-1.png', age: 30, gender: 'male', recordCount: 10 },
  { profileId: 'profile-b', name: 'Account B', avatar: 'avatar-2.png', age: 28, gender: 'female', recordCount: 8 },
];

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  }
  return { Wrapper, queryClient };
}

describe('useProfilesQuery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('成功返回 Profile 列表', async () => {
    const { apiClient } = await import('@/lib/api-client');
    (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue(PROFILES);

    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useProfilesQuery(), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(apiClient.get).toHaveBeenCalledWith('/profiles');
    expect(result.current.data).toEqual(PROFILES);
  });

  it('请求失败时 isError=true', async () => {
    const { apiClient } = await import('@/lib/api-client');
    (apiClient.get as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('network'),
    );

    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useProfilesQuery(), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });

  it('空列表也是成功状态', async () => {
    const { apiClient } = await import('@/lib/api-client');
    (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useProfilesQuery(), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });
});
