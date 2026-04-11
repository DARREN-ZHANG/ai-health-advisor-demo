import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Skeleton, EmptyState, InlineError, LoadingDots } from '../../components/feedback';

describe('Skeleton', () => {
  it('渲染骨架占位符', () => {
    const { container } = render(<Skeleton />);
    expect(container.firstElementChild).toBeInTheDocument();
  });

  it('应用 animate-pulse', () => {
    const { container } = render(<Skeleton />);
    expect(container.firstElementChild?.className).toContain('animate-pulse');
  });

  it('支持自定义尺寸', () => {
    const { container } = render(<Skeleton className="h-4 w-full" />);
    expect(container.firstElementChild?.className).toContain('h-4');
    expect(container.firstElementChild?.className).toContain('w-full');
  });
});

describe('EmptyState', () => {
  it('渲染消息文本', () => {
    render(<EmptyState message="暂无数据" />);
    expect(screen.getByText('暂无数据')).toBeInTheDocument();
  });

  it('应用居中样式', () => {
    const { container } = render(<EmptyState message="空" />);
    expect(container.firstElementChild?.className).toContain('flex');
    expect(container.firstElementChild?.className).toContain('justify-center');
  });
});

describe('InlineError', () => {
  it('渲染错误消息', () => {
    render(<InlineError message="发生错误" />);
    expect(screen.getByText('发生错误')).toBeInTheDocument();
  });

  it('设置 role="alert"', () => {
    const { container } = render(<InlineError message="错误" />);
    expect(container.firstElementChild).toHaveAttribute('role', 'alert');
  });

  it('应用红色边框样式', () => {
    const { container } = render(<InlineError message="错误" />);
    const el = container.firstElementChild;
    expect(el?.className).toContain('border-red-500/50');
  });
});

describe('LoadingDots', () => {
  it('渲染三个圆点', () => {
    const { container } = render(<LoadingDots />);
    const dots = container.firstElementChild?.querySelectorAll('span');
    expect(dots?.length).toBe(3);
  });

  it('设置 role="status"', () => {
    const { container } = render(<LoadingDots />);
    expect(container.firstElementChild).toHaveAttribute('role', 'status');
  });

  it('包含 aria-label', () => {
    const { container } = render(<LoadingDots />);
    expect(container.firstElementChild).toHaveAttribute('aria-label', '加载中');
  });

  it('应用弹跳动画', () => {
    const { container } = render(<LoadingDots />);
    const dots = container.firstElementChild?.querySelectorAll('span');
    for (const dot of dots ?? []) {
      expect(dot.className).toContain('animate-bounce');
    }
  });
});
