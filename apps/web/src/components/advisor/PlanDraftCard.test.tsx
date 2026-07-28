import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MessagePlanDraft } from '@/stores/ai-advisor.store';
import { useUIStore } from '@/stores/ui.store';
import { PlanDraftCard } from './PlanDraftCard';

const mocks = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  push: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock('@/hooks/use-plan-query', () => ({
  useExecutePlanDraft: () => ({
    mutateAsync: mocks.mutateAsync,
    isPending: false,
  }),
}));

const messages = {
  advisor: {
    planDraft: {
      execute: 'Start Plan',
      executing: 'Starting…',
      modify: 'Modify Session',
      executeFailed: 'Failed to execute',
      viewPlan: 'View Plan',
      revoked: 'Replaced',
    },
  },
};

const planDraft: MessagePlanDraft = {
  status: 'executable',
  draft: {
    draftId: 'draft-1',
    title: 'Recovery Plan',
    summary: 'A short recovery plan',
    groups: [
      {
        title: 'Day 1',
        tasks: [
          {
            title: 'Walk',
            description: 'Take an easy walk after dinner',
            suggestedTimeOfDay: 'Evening',
            estimatedMinutes: 15,
          },
        ],
      },
      {
        title: 'Day 2',
        tasks: [{ title: 'Keep a consistent wake time' }],
      },
    ],
    createdAt: '2026-07-27T00:00:00.000Z',
  },
};

function renderCard() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <textarea data-valo-advisor-composer="true" aria-label="Message" />
      <PlanDraftCard planDraft={planDraft} />
    </NextIntlClientProvider>,
  );
}

describe('PlanDraftCard', () => {
  beforeEach(() => {
    mocks.mutateAsync.mockReset();
    mocks.mutateAsync.mockResolvedValue({});
    mocks.push.mockReset();
    useUIStore.setState({ isAdvisorDrawerOpen: true });
  });

  afterEach(() => {
    cleanup();
    useUIStore.setState({ isAdvisorDrawerOpen: false });
  });

  it('在操作按钮前展示完整的结构化计划正文', () => {
    renderCard();

    expect(screen.getByRole('heading', { name: 'Recovery Plan' })).toBeInTheDocument();
    expect(screen.getByText('A short recovery plan')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Day 1' })).toBeInTheDocument();
    expect(screen.getByText('Walk')).toBeInTheDocument();
    expect(screen.getByText('Take an easy walk after dinner')).toBeInTheDocument();
    expect(screen.getByText('Evening · 15 min')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Day 2' })).toBeInTheDocument();
    expect(screen.getByText('Keep a consistent wake time')).toBeInTheDocument();
    expect(document.querySelectorAll('[data-valo-plan-draft-group]')).toHaveLength(2);
    expect(document.querySelectorAll('[data-valo-plan-draft-task]')).toHaveLength(2);
  });

  it('executable 状态渲染 Start Plan，不再渲染 Modify Session', () => {
    renderCard();
    const start = screen.getByRole('button', { name: 'Start Plan' });
    expect(start).toHaveClass('h-7', 'min-w-[105px]', 'rounded', 'bg-white');
    // 设计变更：Modify Session 按钮已移除。
    expect(screen.queryByRole('button', { name: 'Modify Session' })).toBeNull();
  });

  it('Start Plan 执行成功后关闭 Chat 并回到首页', async () => {
    renderCard();
    fireEvent.click(screen.getByRole('button', { name: 'Start Plan' }));

    await waitFor(() => {
      expect(mocks.mutateAsync).toHaveBeenCalledWith({ draftId: 'draft-1' });
      expect(useUIStore.getState().isAdvisorDrawerOpen).toBe(false);
      expect(mocks.push).toHaveBeenCalledWith('/');
    });
  });
});
