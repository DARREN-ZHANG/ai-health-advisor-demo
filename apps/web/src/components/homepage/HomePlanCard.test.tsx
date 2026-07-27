import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Plan } from '@health-advisor/shared';
import { useGodModeStore } from '@/stores/god-mode.store';
import { HomePlanCard } from './HomePlanCard';

const mocks = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
}));

vi.mock('@/hooks/use-plan-query', () => ({
  useTogglePlanTask: () => ({
    mutateAsync: mocks.mutateAsync,
    isPending: false,
  }),
}));

const messages = {
  homepage: {
    planCard: {
      day: '第 {day} 天',
      progress: '已完成 {done}/{total}',
      focus: '今日重点',
      minutes: '{count} 分钟',
      markComplete: '完成{task}',
      markIncomplete: '将{task}标记为未完成',
      adjust: '调整今日计划',
    },
  },
};

const plan: Plan = {
  id: 'plan-1',
  profileId: 'profile-a',
  sessionId: 'session-1',
  title: '7 天恢复训练',
  summary: '根据恢复反馈逐日调整训练负荷。',
  status: 'active',
  version: 3,
  progress: { totalTasks: 3, completedTasks: 1 },
  createdAt: '2026-07-27T00:00:00.000Z',
  executedAt: '2026-07-27T00:00:00.000Z',
  groups: [
    {
      id: 'day-1',
      title: '全身恢复',
      tasks: [
        {
          id: 'task-1',
          title: '深蹲模式',
          estimatedMinutes: 10,
          completed: false,
        },
        {
          id: 'task-2',
          title: '核心稳定',
          completed: true,
        },
      ],
    },
    {
      id: 'day-2',
      title: '主动恢复',
      tasks: [
        {
          id: 'task-3',
          title: '轻松步行',
          suggestedTimeOfDay: '上午',
          estimatedMinutes: 20,
          completed: false,
        },
      ],
    },
  ],
};

function renderCard() {
  return render(
    <NextIntlClientProvider locale="zh" messages={messages}>
      <HomePlanCard plan={plan} />
    </NextIntlClientProvider>,
  );
}

describe('HomePlanCard', () => {
  beforeEach(() => {
    mocks.mutateAsync.mockReset();
    mocks.mutateAsync.mockResolvedValue(plan);
    useGodModeStore.setState({ selectedPlanDayIndex: 0 });
  });

  afterEach(() => {
    cleanup();
    useGodModeStore.setState({ selectedPlanDayIndex: 0 });
  });

  it('有计划时默认展示 Day 1', () => {
    renderCard();
    expect(screen.getByRole('heading', { name: '第 1 天' })).toBeInTheDocument();
    expect(screen.getByText('全身恢复')).toBeInTheDocument();
    expect(screen.queryByText('主动恢复')).toBeNull();
  });

  it('响应 God Mode 的天数切换', () => {
    renderCard();
    act(() => useGodModeStore.setState({ selectedPlanDayIndex: 1 }));
    expect(screen.getByRole('heading', { name: '第 2 天' })).toBeInTheDocument();
    expect(screen.getByText('主动恢复')).toBeInTheDocument();
    expect(screen.queryByText('全身恢复')).toBeNull();
  });

  it('点击圆形 checkbox 复用已有任务完成操作', async () => {
    renderCard();
    fireEvent.click(screen.getByRole('button', { name: '完成深蹲模式' }));

    await waitFor(() => {
      expect(mocks.mutateAsync).toHaveBeenCalledWith({
        planId: 'plan-1',
        groupId: 'day-1',
        taskId: 'task-1',
        expectedVersion: 3,
        completed: true,
      });
    });
  });
});
