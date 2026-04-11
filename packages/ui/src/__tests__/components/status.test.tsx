import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusBadge, Pill, InlineHint, MicroTip } from '../../components/status';

describe('StatusBadge', () => {
  it('渲染标签文本', () => {
    render(<StatusBadge status="good" label="正常" />);
    expect(screen.getByText('正常')).toBeInTheDocument();
  });

  it('为每种状态渲染圆点', () => {
    const statuses = ['good', 'warning', 'alert', 'neutral'] as const;
    for (const status of statuses) {
      const { unmount } = render(<StatusBadge status={status} label={status} />);
      const badge = screen.getByText(status).parentElement!;
      const dot = badge.querySelector('span');
      expect(dot).toBeInTheDocument();
      unmount();
    }
  });

  it('应用胶囊样式', () => {
    const { container } = render(<StatusBadge status="good" label="正常" />);
    expect(container.firstElementChild?.className).toContain('rounded-full');
  });
});

describe('Pill', () => {
  it('渲染子元素', () => {
    render(<Pill>标签</Pill>);
    expect(screen.getByText('标签')).toBeInTheDocument();
  });

  it('应用胶囊样式', () => {
    const { container } = render(<Pill>标签</Pill>);
    expect(container.firstElementChild?.className).toContain('rounded-full');
  });

  it('支持自定义 className', () => {
    const { container } = render(<Pill className="bg-red-500">标签</Pill>);
    expect(container.firstElementChild?.className).toContain('bg-red-500');
  });
});

describe('InlineHint', () => {
  it('渲染提示文本', () => {
    render(<InlineHint>提示信息</InlineHint>);
    expect(screen.getByText('提示信息')).toBeInTheDocument();
  });

  it('应用 slate-400 颜色', () => {
    const { container } = render(<InlineHint>提示</InlineHint>);
    expect(container.firstElementChild?.className).toContain('text-slate-400');
  });
});

describe('MicroTip', () => {
  it('渲染提示内容', () => {
    render(<MicroTip>小贴士</MicroTip>);
    expect(screen.getByText('小贴士')).toBeInTheDocument();
  });

  it('包含灯泡图标', () => {
    const { container } = render(<MicroTip>提示</MicroTip>);
    expect(container.innerHTML).toContain('💡');
  });

  it('应用蓝色边框样式', () => {
    const { container } = render(<MicroTip>提示</MicroTip>);
    const el = container.firstElementChild;
    expect(el?.className).toContain('border-blue-500/30');
  });
});
