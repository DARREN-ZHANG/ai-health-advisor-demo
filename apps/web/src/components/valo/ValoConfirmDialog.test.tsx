import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ValoConfirmDialog } from './ValoConfirmDialog';

describe('ValoConfirmDialog', () => {
  it('open=true 时渲染标题与描述', () => {
    render(
      <ValoConfirmDialog
        open
        onClose={() => {}}
        onConfirm={() => {}}
        title="重置时间线？"
        description="此操作不可撤销"
      />,
    );
    expect(screen.getByText('重置时间线？')).toBeInTheDocument();
    expect(screen.getByText('此操作不可撤销')).toBeInTheDocument();
  });

  it('open=false 时不渲染', () => {
    render(
      <ValoConfirmDialog
        open={false}
        onClose={() => {}}
        onConfirm={() => {}}
        title="测试"
      />,
    );
    expect(screen.queryByText('测试')).toBeNull();
  });

  it('使用默认确认/取消按钮文案', () => {
    render(
      <ValoConfirmDialog
        open
        onClose={() => {}}
        onConfirm={() => {}}
        title="测试"
      />,
    );
    expect(screen.getByRole('button', { name: '确认' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '取消' })).toBeInTheDocument();
  });

  it('支持自定义 confirmLabel / cancelLabel', () => {
    render(
      <ValoConfirmDialog
        open
        onClose={() => {}}
        onConfirm={() => {}}
        title="测试"
        confirmLabel="停止"
        cancelLabel="继续"
      />,
    );
    expect(screen.getByRole('button', { name: '停止' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '继续' })).toBeInTheDocument();
  });

  it('点击确认按钮调用 onConfirm', () => {
    const onConfirm = vi.fn();
    render(
      <ValoConfirmDialog
        open
        onClose={() => {}}
        onConfirm={onConfirm}
        title="测试"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '确认' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('点击取消按钮调用 onClose', () => {
    const onClose = vi.fn();
    render(
      <ValoConfirmDialog
        open
        onClose={onClose}
        onConfirm={() => {}}
        title="测试"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '取消' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('tone=danger 确认按钮引用 --valo-depleted', () => {
    render(
      <ValoConfirmDialog
        open
        onClose={() => {}}
        onConfirm={() => {}}
        title="测试"
        tone="danger"
      />,
    );
    const confirmButton = screen.getByRole('button', { name: '确认' });
    expect(confirmButton.getAttribute('style') ?? '').toContain(
      'var(--valo-depleted)',
    );
  });

  it('tone=default 确认按钮引用 --valo-prime', () => {
    render(
      <ValoConfirmDialog
        open
        onClose={() => {}}
        onConfirm={() => {}}
        title="测试"
        tone="default"
      />,
    );
    const confirmButton = screen.getByRole('button', { name: '确认' });
    expect(confirmButton.getAttribute('style') ?? '').toContain(
      'var(--valo-prime)',
    );
  });

  it('确认按钮前景色引用 --valo-canvas token，禁止硬编码 hex', () => {
    render(
      <ValoConfirmDialog
        open
        onClose={() => {}}
        onConfirm={() => {}}
        title="测试"
      />,
    );
    const confirmButton = screen.getByRole('button', { name: '确认' });
    const className = confirmButton.getAttribute('class') ?? '';
    expect(className).toContain('text-[var(--valo-canvas)]');
    expect(className).not.toMatch(/text-\[#[0-9a-fA-F]{3,8}\]/);
  });

  it('confirmDisabled=true 时确认按钮被禁用', () => {
    render(
      <ValoConfirmDialog
        open
        onClose={() => {}}
        onConfirm={() => {}}
        title="测试"
        confirmDisabled
      />,
    );
    expect(screen.getByRole('button', { name: '确认' })).toBeDisabled();
  });
});
