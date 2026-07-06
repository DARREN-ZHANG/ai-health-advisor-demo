import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ValoDialog } from './ValoDialog';

describe('ValoDialog', () => {
  it('open=false 时不渲染内容', () => {
    render(
      <ValoDialog open={false} onClose={() => {}} ariaLabel="测试">
        <p>隐藏</p>
      </ValoDialog>,
    );
    expect(screen.queryByText('隐藏')).toBeNull();
  });

  it('open=true 时渲染 role=dialog', () => {
    render(
      <ValoDialog open onClose={() => {}} ariaLabel="测试弹窗">
        <p>可见</p>
      </ValoDialog>,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog.getAttribute('aria-label')).toBe('测试弹窗');
  });

  it('渲染 title 并设置 aria-labelledby', () => {
    render(
      <ValoDialog open onClose={() => {}} title="切换状态">
        <p>内容</p>
      </ValoDialog>,
    );
    const dialog = screen.getByRole('dialog');
    const labelledBy = dialog.getAttribute('aria-labelledby');
    expect(labelledBy).toBeTruthy();
    const heading = screen.getByText('切换状态');
    expect(heading.id).toBe(labelledBy);
  });

  it('点击关闭按钮调用 onClose', () => {
    const onClose = vi.fn();
    render(
      <ValoDialog open onClose={onClose} title="测试">
        <p>内容</p>
      </ValoDialog>,
    );
    fireEvent.click(screen.getByRole('button', { name: '关闭' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('点击遮罩调用 onClose', () => {
    const onClose = vi.fn();
    const { container } = render(
      <ValoDialog open onClose={onClose} ariaLabel="测试">
        <p>内容</p>
      </ValoDialog>,
    );
    const scrim = container.firstElementChild as HTMLElement;
    fireEvent.click(scrim);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Escape 关闭', () => {
    const onClose = vi.fn();
    render(
      <ValoDialog open onClose={onClose} ariaLabel="测试">
        <p>内容</p>
      </ValoDialog>,
    );
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('width=sm 设置为 420px', () => {
    render(
      <ValoDialog open onClose={() => {}} ariaLabel="测试" width="sm">
        <p>内容</p>
      </ValoDialog>,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('style') ?? '').toContain('420px');
  });

  it('width=md 设置为 480px', () => {
    render(
      <ValoDialog open onClose={() => {}} ariaLabel="测试" width="md">
        <p>内容</p>
      </ValoDialog>,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('style') ?? '').toContain('480px');
  });

  it('width=lg 设置为 640px', () => {
    render(
      <ValoDialog open onClose={() => {}} ariaLabel="测试" width="lg">
        <p>内容</p>
      </ValoDialog>,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('style') ?? '').toContain('640px');
  });

  it('width 接受自定义数值（像素）', () => {
    render(
      <ValoDialog open onClose={() => {}} ariaLabel="测试" width={500}>
        <p>内容</p>
      </ValoDialog>,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('style') ?? '').toContain('500px');
  });

  it('variant=drawer 渲染为右侧抽屉（无圆角）', () => {
    render(
      <ValoDialog open onClose={() => {}} ariaLabel="测试" variant="drawer">
        <p>内容</p>
      </ValoDialog>,
    );
    const dialog = screen.getByRole('dialog');
    // drawer 锚定右侧，不会有居中圆角卡片的 max-h
    expect(dialog.className).not.toContain('rounded-2xl');
  });

  it('未提供 ariaLabel/ariaLabelledBy/title 时抛错', () => {
    expect(() => {
      // 可访问名校验是运行时行为；TS 不报错，故无需 @ts-expect-error
      render(
        <ValoDialog open onClose={() => {}}>
          <p>内容</p>
        </ValoDialog>,
      );
    }).toThrow(/ariaLabel/);
  });

  it('引用 surface token 与边框 token', () => {
    render(
      <ValoDialog open onClose={() => {}} ariaLabel="测试">
        <p>内容</p>
      </ValoDialog>,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog.className).toContain('bg-[var(--valo-surface)]');
    expect(dialog.className).toContain('border-[var(--valo-border)]');
  });

  it('bodyScroll="native" 时不渲染内置 overflow-y-auto 容器', () => {
    render(
      <ValoDialog open onClose={() => {}} ariaLabel="测试" bodyScroll="native">
        <div data-test-children>自定义滚动</div>
      </ValoDialog>,
    );
    const dialog = screen.getByRole('dialog');
    // 直接子元素是 children 本身，不再包一层 overflow-y-auto div
    const directChild = dialog.querySelector('[data-test-children]');
    expect(directChild?.parentElement).toBe(dialog);
  });
});
