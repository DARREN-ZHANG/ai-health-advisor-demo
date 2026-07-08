import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ValoSheet } from './ValoSheet';

describe('ValoSheet', () => {
  it('open=false 时不渲染内容', () => {
    render(
      <ValoSheet open={false} onClose={() => {}} ariaLabel="测试">
        <p>隐藏内容</p>
      </ValoSheet>,
    );
    expect(screen.queryByText('隐藏内容')).toBeNull();
  });

  it('open=true 时渲染内容并设置 role=dialog', () => {
    render(
      <ValoSheet open onClose={() => {}} ariaLabel="测试弹层">
        <p>可见内容</p>
      </ValoSheet>,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog.getAttribute('aria-label')).toBe('测试弹层');
    expect(screen.getByText('可见内容')).toBeInTheDocument();
  });

  it('渲染 title 时显示标题与关闭按钮', () => {
    render(
      <ValoSheet open onClose={() => {}} title="状态切换">
        <p>内容</p>
      </ValoSheet>,
    );
    expect(screen.getByText('状态切换')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '关闭' })).toBeInTheDocument();
  });

  it('传入 title 时设置 aria-labelledby 指向标题元素', () => {
    render(
      <ValoSheet open onClose={() => {}} title="状态切换">
        <p>内容</p>
      </ValoSheet>,
    );
    const dialog = screen.getByRole('dialog');
    const labelledBy = dialog.getAttribute('aria-labelledby');
    expect(labelledBy).toBeTruthy();
    const heading = screen.getByText('状态切换');
    expect(heading.id).toBe(labelledBy);
  });

  it('点击关闭按钮调用 onClose', () => {
    const onClose = vi.fn();
    render(
      <ValoSheet open onClose={onClose} title="测试">
        <p>内容</p>
      </ValoSheet>,
    );
    fireEvent.click(screen.getByRole('button', { name: '关闭' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('点击遮罩（scrim）调用 onClose', () => {
    const onClose = vi.fn();
    const { container } = render(
      <ValoSheet open onClose={onClose} ariaLabel="测试">
        <p>内容</p>
      </ValoSheet>,
    );
    // scrim 是 fixed inset-0 的最外层 div（含 framer-motion 属性）
    const scrim = container.firstElementChild as HTMLElement;
    expect(scrim).toBeTruthy();
    fireEvent.click(scrim);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closeOnScrimClick=false 时点击遮罩不关闭', () => {
    const onClose = vi.fn();
    const { container } = render(
      <ValoSheet open onClose={onClose} ariaLabel="测试" closeOnScrimClick={false}>
        <p>内容</p>
      </ValoSheet>,
    );
    const scrim = container.firstElementChild as HTMLElement;
    fireEvent.click(scrim);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('Escape 关闭弹层', () => {
    const onClose = vi.fn();
    render(
      <ValoSheet open onClose={onClose} ariaLabel="测试">
        <p>内容</p>
      </ValoSheet>,
    );
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closeOnEscape=false 时 Escape 不关闭', () => {
    const onClose = vi.fn();
    render(
      <ValoSheet open onClose={onClose} ariaLabel="测试" closeOnEscape={false}>
        <p>内容</p>
      </ValoSheet>,
    );
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('未提供 ariaLabel/ariaLabelledBy/title 时抛错', () => {
    expect(() => {
      // 可访问名校验是运行时行为；TS 不报错，故无需 @ts-expect-error
      render(
        <ValoSheet open onClose={() => {}}>
          <p>内容</p>
        </ValoSheet>,
      );
    }).toThrow(/ariaLabel/);
  });

  it('variant=full-screen 渲染为全屏覆盖（无圆角顶部）', () => {
    render(
      <ValoSheet open onClose={() => {}} ariaLabel="测试" variant="full-screen">
        <p>内容</p>
      </ValoSheet>,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog.className).not.toContain('rounded-t-2xl');
  });

  it('height 透传给内容容器', () => {
    render(
      <ValoSheet open onClose={() => {}} ariaLabel="测试" height="92dvh">
        <p>内容</p>
      </ValoSheet>,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('style') ?? '').toContain('92dvh');
    expect(dialog.className).toContain('min-h-0');
  });

  it('managed 滚动容器允许在 flex 布局中收缩', () => {
    render(
      <ValoSheet open onClose={() => {}} ariaLabel="测试">
        <div data-test-children>自定义滚动</div>
      </ValoSheet>,
    );
    const dialog = screen.getByRole('dialog');
    const scroller = dialog.querySelector('.overflow-y-auto');
    expect(scroller?.className).toContain('min-h-0');
  });

  it('引用 scrim token', () => {
    const { container } = render(
      <ValoSheet open onClose={() => {}} ariaLabel="测试">
        <p>内容</p>
      </ValoSheet>,
    );
    const scrim = container.firstElementChild as HTMLElement;
    expect(scrim.getAttribute('style') ?? '').toContain('var(--valo-scrim)');
  });

  it('引用 surface token 作为内容背景', () => {
    render(
      <ValoSheet open onClose={() => {}} ariaLabel="测试">
        <p>内容</p>
      </ValoSheet>,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog.className).toContain('bg-[var(--valo-surface)]');
  });

  it('bodyScroll="native" 时不渲染内置 overflow-y-auto 容器', () => {
    render(
      <ValoSheet open onClose={() => {}} ariaLabel="测试" bodyScroll="native">
        <div data-test-children>自定义滚动</div>
      </ValoSheet>,
    );
    const dialog = screen.getByRole('dialog');
    // 直接子元素是 children 本身，不再包一层 overflow-y-auto div
    const directChild = dialog.querySelector('[data-test-children]');
    expect(directChild?.parentElement).toBe(dialog);
  });
});
