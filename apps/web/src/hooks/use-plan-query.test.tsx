import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { Plan, PlanDraft } from '@health-advisor/shared';
import {
  useCurrentPlan,
  useExecutePlanDraft,
  useTogglePlanTask,
  useEndPlan,
} from './use-plan-query';
import { queryKeys } from '@/lib/query-keys';

// —— mock apiClient：默认 reject，每个测试按需 mockReturnValue ——
const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
  peekSessionId: vi.fn(),
}));

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    get: mocks.get,
    post: mocks.post,
    patch: mocks.patch,
    delete: mocks.delete,
  },
  peekSessionId: mocks.peekSessionId,
}));

const SESSION_ID = 'session-test';

function makeWrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => {
  mocks.peekSessionId.mockReturnValue(SESSION_ID);
  mocks.get.mockReset();
  mocks.post.mockReset();
  mocks.patch.mockReset();
  mocks.delete.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function newClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

const samplePlan: Plan = {
  id: '11111111-1111-4111-8111-111111111111',
  profileId: 'profile-a',
  sessionId: SESSION_ID,
  title: '7 天恢复计划',
  summary: '本周以稳定 HRV 为主。',
  groups: [
    {
      id: 'g1',
      title: '第 1 天',
      tasks: [
        { id: 't1', title: '餐后散步 15 分钟', completed: false },
        { id: 't2', title: '记录晨起 HRV', completed: false },
      ],
    },
  ],
  status: 'active',
  version: 1,
  progress: { totalTasks: 2, completedTasks: 0 },
  createdAt: '2026-07-27T00:00:00.000Z',
  executedAt: '2026-07-27T00:00:00.000Z',
};

const sampleDraft: PlanDraft = {
  draftId: '22222222-2222-4222-8222-222222222222',
  title: '7 天恢复计划',
  summary: '本周以稳定 HRV 为主。',
  groups: [
    {
      title: '第 1 天',
      tasks: [{ title: '餐后散步 15 分钟' }],
    },
  ],
  createdAt: '2026-07-27T00:00:00.000Z',
};

describe('useCurrentPlan', () => {
  it('fetches the current plan from the backend', async () => {
    mocks.get.mockResolvedValue(samplePlan);
    const client = newClient();
    const { result } = renderHook(() => useCurrentPlan('profile-a'), {
      wrapper: makeWrapper(client),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(samplePlan);
    expect(mocks.get).toHaveBeenCalledWith(
      `/sessions/${SESSION_ID}/profiles/profile-a/plans/current`,
    );
  });

  it('returns null when no plan exists', async () => {
    mocks.get.mockResolvedValue(null);
    const client = newClient();
    const { result } = renderHook(() => useCurrentPlan('profile-a'), {
      wrapper: makeWrapper(client),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });

  it('is disabled when profileId is missing', () => {
    const client = newClient();
    const { result } = renderHook(() => useCurrentPlan(undefined), {
      wrapper: makeWrapper(client),
    });
    expect(result.current.isEnabled).toBe(false);
  });
});

describe('useExecutePlanDraft', () => {
  it('posts to execute endpoint and writes the plan into the cache', async () => {
    mocks.post.mockResolvedValue(samplePlan);
    const client = newClient();
    const { result } = renderHook(() => useExecutePlanDraft('profile-a'), {
      wrapper: makeWrapper(client),
    });

    await act(async () => {
      await result.current.mutateAsync({ draftId: sampleDraft.draftId });
    });

    expect(mocks.post).toHaveBeenCalledWith(
      `/sessions/${SESSION_ID}/profiles/profile-a/plans/drafts/${sampleDraft.draftId}/execute`,
      {},
    );
    expect(
      client.getQueryData(queryKeys.plan.current(SESSION_ID, 'profile-a')),
    ).toEqual(samplePlan);
  });

  it('passes confirmReplace when provided', async () => {
    mocks.post.mockResolvedValue(samplePlan);
    const client = newClient();
    const { result } = renderHook(() => useExecutePlanDraft('profile-a'), {
      wrapper: makeWrapper(client),
    });

    await act(async () => {
      await result.current.mutateAsync({ draftId: sampleDraft.draftId, confirmReplace: true });
    });

    expect(mocks.post).toHaveBeenCalledWith(
      expect.stringContaining('/execute'),
      { confirmReplace: true },
    );
  });
});

describe('useTogglePlanTask', () => {
  it('patches the task and updates the cache atomically', async () => {
    const nextPlan: Plan = { ...samplePlan, version: 2 };
    mocks.patch.mockResolvedValue(nextPlan);
    const client = newClient();
    const { result } = renderHook(() => useTogglePlanTask('profile-a'), {
      wrapper: makeWrapper(client),
    });

    await act(async () => {
      await result.current.mutateAsync({
        planId: samplePlan.id,
        groupId: 'g1',
        taskId: 't1',
        expectedVersion: 1,
        completed: true,
      });
    });

    expect(mocks.patch).toHaveBeenCalledWith(
      `/sessions/${SESSION_ID}/profiles/profile-a/plans/${samplePlan.id}/groups/g1/tasks/t1`,
      { expectedVersion: 1, completed: true },
    );
    expect(
      client.getQueryData(queryKeys.plan.current(SESSION_ID, 'profile-a')),
    ).toEqual(nextPlan);
  });
});

describe('useEndPlan', () => {
  it('deletes the plan and clears the cache entry to null', async () => {
    mocks.delete.mockResolvedValue({ ended: true });
    const client = newClient();
    client.setQueryData(queryKeys.plan.current(SESSION_ID, 'profile-a'), samplePlan);
    const { result } = renderHook(() => useEndPlan('profile-a'), {
      wrapper: makeWrapper(client),
    });

    await act(async () => {
      await result.current.mutateAsync();
    });

    expect(mocks.delete).toHaveBeenCalledWith(
      `/sessions/${SESSION_ID}/profiles/profile-a/plans/current`,
    );
    expect(
      client.getQueryData(queryKeys.plan.current(SESSION_ID, 'profile-a')),
    ).toBeNull();
  });
});
