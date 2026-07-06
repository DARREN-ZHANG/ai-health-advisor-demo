import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { TimelineResetDialog } from './TimelineResetDialog';

const MESSAGES = {
  demoControl: {
    resetConfirmTitle: '重置时间轴？',
    resetConfirmDescription: '将清空当前 Profile 的全部演示时间轴数据。',
    resetConfirmAction: '重置',
    resetConfirmCancel: '取消',
  },
} as const;

function wrapper({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider locale="zh" messages={MESSAGES}>
      {children}
    </NextIntlClientProvider>
  );
}

function renderDialog(props: Partial<React.ComponentProps<typeof TimelineResetDialog>> = {}) {
  return render(
    <TimelineResetDialog
      open
      onClose={vi.fn()}
      onConfirm={vi.fn()}
      {...props}
    />,
    { wrapper },
  );
}

describe('TimelineResetDialog', () => {
  it('open=true 渲染标题、描述、确认与取消按钮', () => {
    renderDialog();
    expect(screen.getByText('重置时间轴？')).toBeInTheDocument();
    expect(
      screen.getByText('将清空当前 Profile 的全部演示时间轴数据。'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '重置' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '取消' }),
    ).toBeInTheDocument();
  });

  it('open=false 不渲染', () => {
    renderDialog({ open: false });
    expect(screen.queryByText('重置时间轴？')).toBeNull();
  });

  it('点击确认调用 onConfirm', () => {
    const onConfirm = vi.fn();
    renderDialog({ onConfirm });
    fireEvent.click(screen.getByRole('button', { name: '重置' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('点击取消调用 onClose', () => {
    const onClose = vi.fn();
    renderDialog({ onClose });
    fireEvent.click(screen.getByRole('button', { name: '取消' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('使用 danger tone：确认按钮背景引用 --valo-depleted', () => {
    renderDialog();
    const confirmBtn = screen.getByRole('button', { name: '重置' });
    expect(confirmBtn.getAttribute('style') ?? '').toContain(
      'var(--valo-depleted)',
    );
  });

  it('loading=true 时确认按钮被禁用', () => {
    renderDialog({ loading: true });
    expect(screen.getByRole('button', { name: '重置' })).toBeDisabled();
  });

  it('loading=false 时确认按钮可点击', () => {
    renderDialog({ loading: false });
    expect(screen.getByRole('button', { name: '重置' })).not.toBeDisabled();
  });
});
