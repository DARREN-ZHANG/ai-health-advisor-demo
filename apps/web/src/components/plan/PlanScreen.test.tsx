import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import type { Plan } from '@health-advisor/shared';
import { PlanScreen } from './PlanScreen';
import { useProfileStore } from '@/stores/profile.store';
import { useUIStore } from '@/stores/ui.store';

const mocks = vi.hoisted(() => ({
  useCurrentPlan: vi.fn(),
  useEndPlan: vi.fn(),
  useTogglePlanTask: vi.fn(),
}));

vi.mock('@/hooks/use-plan-query', () => ({
  useCurrentPlan: mocks.useCurrentPlan,
  useEndPlan: mocks.useEndPlan,
  useTogglePlanTask: mocks.useTogglePlanTask,
}));

const messages = {
  plan: {
    title: '我的计划',
    subtitle: 'x',
    empty: 'no plan',
    openAdvisor: 'open advisor',
    completedBadge: 'done',
    activeBadge: 'in progress',
    progressLabel: '{done} / {total} tasks',
    endPlan: 'end',
    endConfirm: 'sure?',
    replaceConfirm: 'replace?',
    tasks: 'tasks',
    minutes: 'min',
  },
};

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider locale="zh" messages={messages as unknown as Record<string, unknown>}>
      {children}
    </NextIntlClientProvider>
  );
}

const samplePlan: Plan = {
  id: 'plan-1',
  profileId: 'profile-a',
  sessionId: 'session-1',
  title: '7 天计划',
  summary: '总览',
  groups: [
    {
      id: 'g1',
      title: '第 1 天',
      tasks: [
        { id: 't1', title: '任务 A', completed: false },
        { id: 't2', title: '任务 B', completed: false },
      ],
    },
  ],
  status: 'active',
  version: 1,
  progress: { totalTasks: 2, completedTasks: 0 },
  createdAt: '2026-07-27T00:00:00.000Z',
  executedAt: '2026-07-27T00:00:00.000Z',
};

beforeEach(() => {
  useProfileStore.setState({ currentProfileId: 'profile-a' });
  useUIStore.setState({ isAdvisorDrawerOpen: false });
  mocks.useCurrentPlan.mockReturnValue({ data: samplePlan, isLoading: false });
  mocks.useEndPlan.mockReturnValue({ mutate: vi.fn(), isPending: false });
  mocks.useTogglePlanTask.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
});

describe('PlanScreen', () => {
  it('renders empty state when there is no plan', () => {
    mocks.useCurrentPlan.mockReturnValue({ data: null, isLoading: false });
    render(<PlanScreen />, { wrapper: Wrapper });
    expect(screen.getByText('no plan')).toBeInTheDocument();
    expect(screen.getByText('open advisor')).toBeInTheDocument();
  });

  it('renders the active plan with title, summary, and progress', () => {
    render(<PlanScreen />, { wrapper: Wrapper });
    expect(screen.getByText('7 天计划')).toBeInTheDocument();
    expect(screen.getByText('总览')).toBeInTheDocument();
    expect(screen.getByText('0 / 2 tasks')).toBeInTheDocument();
    expect(screen.getByText('in progress')).toBeInTheDocument();
  });

  it('toggles a task by clicking the leaf checkbox', async () => {
    const mutateAsync = vi.fn().mockResolvedValue({ ...samplePlan, version: 2 });
    mocks.useTogglePlanTask.mockReturnValue({ mutateAsync, isPending: false });
    render(<PlanScreen />, { wrapper: Wrapper });
    const toggleBtn = document.querySelector('[data-valo-plan-task-toggle="t1"]') as HTMLButtonElement;
    expect(toggleBtn).not.toBeNull();
    fireEvent.click(toggleBtn);
    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({
        planId: 'plan-1',
        groupId: 'g1',
        taskId: 't1',
        expectedVersion: 1,
        completed: true,
      }),
    );
  });

  it('asks for confirmation before ending the plan', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const mutate = vi.fn();
    mocks.useEndPlan.mockReturnValue({ mutate, isPending: false });
    render(<PlanScreen />, { wrapper: Wrapper });
    fireEvent.click(screen.getByText('end'));
    expect(confirmSpy).toHaveBeenCalledWith('sure?');
    expect(mutate).toHaveBeenCalled();
    confirmSpy.mockRestore();
  });
});
