import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AdvisorProactivePrompt } from '@health-advisor/shared';
import { ProactivePromptCard } from './ProactivePromptCard';

const prompt: AdvisorProactivePrompt = {
  kind: 'homepage.sleep.show',
  question: '是否添加到首页？',
  actions: [
    {
      id: 'accept',
      label: '添加到首页',
      userMessage: '添加。',
      interaction: {
        type: 'advisor.proactive.respond',
        proposal: 'homepage.sleep.show',
        decision: 'accept',
      },
    },
    {
      id: 'decline',
      label: '暂时不用',
      userMessage: '不用。',
      interaction: {
        type: 'advisor.proactive.respond',
        proposal: 'homepage.sleep.show',
        decision: 'decline',
      },
    },
  ],
};

describe('ProactivePromptCard', () => {
  it('展示问题并把 typed action 原样交给上层', () => {
    const onAction = vi.fn();
    render(
      <ProactivePromptCard
        prompt={prompt}
        status="pending"
        disabled={false}
        onAction={onAction}
      />,
    );

    expect(screen.getByText('是否添加到首页？')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '添加到首页' }));
    expect(onAction).toHaveBeenCalledWith(prompt.actions[0]);
  });

  it('提议已响应后禁用两个按钮', () => {
    render(
      <ProactivePromptCard
        prompt={prompt}
        status="accepted"
        disabled={false}
        onAction={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: '添加到首页' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '暂时不用' })).toBeDisabled();
  });
});
