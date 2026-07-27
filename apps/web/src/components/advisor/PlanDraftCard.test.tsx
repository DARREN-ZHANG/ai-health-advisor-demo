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
        tasks: [{ title: 'Walk' }],
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

  it('按 Figma 参数渲染 Start Plan 与 Modify Session', () => {
    renderCard();
    const start = screen.getByRole('button', { name: 'Start Plan' });
    const modify = screen.getByRole('button', { name: 'Modify Session' });

    expect(start).toHaveClass('h-7', 'min-w-[105px]', 'rounded', 'bg-white');
    expect(modify).toHaveClass('h-7', 'min-w-[121px]', 'rounded', 'border-white', 'bg-[#322a3f]');
  });

  it('Modify Session 将焦点交回 ChatBox', () => {
    renderCard();
    fireEvent.click(screen.getByRole('button', { name: 'Modify Session' }));
    expect(screen.getByRole('textbox', { name: 'Message' })).toHaveFocus();
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
