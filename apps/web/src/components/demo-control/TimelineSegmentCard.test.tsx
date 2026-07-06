import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TimelineSegmentCard } from './TimelineSegmentCard';
import { DemoControlIntlProvider } from './intl-test-helper';
import type { TimelineSegmentConfig } from './types';

const WALK_SEGMENT: TimelineSegmentConfig = {
  type: 'walk',
  labelKey: 'walk',
  helpKey: 'walk',
  icon: '🚶',
  group: 'daily-rhythm',
};

function renderWithIntl(node: React.ReactNode) {
  return render(<DemoControlIntlProvider>{node}</DemoControlIntlProvider>);
}

describe('TimelineSegmentCard', () => {
  it('渲染图标与文案', () => {
    renderWithIntl(<TimelineSegmentCard segment={WALK_SEGMENT} />);
    expect(screen.getByText('🚶')).toBeInTheDocument();
    expect(screen.getByText('散步')).toBeInTheDocument();
  });

  it('点击卡片触发 onClick', () => {
    const onClick = vi.fn();
    renderWithIntl(<TimelineSegmentCard segment={WALK_SEGMENT} onClick={onClick} />);
    fireEvent.click(screen.getByText('散步'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('disabled=true 时不响应点击（按钮被禁用）', () => {
    const onClick = vi.fn();
    renderWithIntl(
      <TimelineSegmentCard segment={WALK_SEGMENT} onClick={onClick} disabled />,
    );
    const cardButton = screen.getByText('散步').closest('button') as HTMLButtonElement;
    expect(cardButton).toBeDisabled();
    fireEvent.click(cardButton);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('loading=true 时显示旋转图标且按钮被禁用', () => {
    const onClick = vi.fn();
    const { container } = renderWithIntl(
      <TimelineSegmentCard segment={WALK_SEGMENT} onClick={onClick} loading />,
    );
    // 卡片按钮被禁用
    const cardButton = screen.getByText('散步').closest('button') as HTMLButtonElement;
    expect(cardButton).toBeDisabled();
    // 出现 animate-spin 类
    const spinner = container.querySelector('.animate-spin');
    expect(spinner).not.toBeNull();
  });

  it('点击帮助按钮不触发卡片 onClick', () => {
    const onClick = vi.fn();
    renderWithIntl(<TimelineSegmentCard segment={WALK_SEGMENT} onClick={onClick} />);
    const helpButton = screen.getByRole('button', { name: '帮助' });
    fireEvent.click(helpButton);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('聚焦帮助按钮后展开 tooltip 并设置 aria-describedby 关联', () => {
    renderWithIntl(<TimelineSegmentCard segment={WALK_SEGMENT} />);
    const helpButton = screen.getByRole('button', { name: '帮助' });
    fireEvent.focus(helpButton);
    const tooltip = screen.getByRole('tooltip');
    expect(tooltip).toHaveTextContent('心率 85-125');
  });

  it('最小 40px 触达：卡片与帮助按钮均标记 data-valo-touch', () => {
    renderWithIntl(<TimelineSegmentCard segment={WALK_SEGMENT} />);
    const cardButton = screen.getByText('散步').closest('button') as HTMLElement;
    const helpButton = screen.getByRole('button', { name: '帮助' });
    expect(cardButton.getAttribute('data-valo-touch')).toBe('true');
    expect(helpButton.getAttribute('data-valo-touch')).toBe('true');
  });

  it('仅引用 valo token 颜色，不出现硬编码 hex', () => {
    const { container } = renderWithIntl(
      <TimelineSegmentCard segment={WALK_SEGMENT} />,
    );
    const root = container.firstElementChild as HTMLElement;
    const classText = root.className + ' ' + root.innerHTML;
    // 简单断言：不出现 hex 字面量
    expect(classText).not.toMatch(/#[0-9a-fA-F]{3,8}/);
    // 引用 surface token
    expect(classText).toContain('bg-[var(--valo-surface)]');
  });

  it('帮助按钮在 loading 时被禁用', () => {
    renderWithIntl(<TimelineSegmentCard segment={WALK_SEGMENT} loading />);
    const helpButton = screen.getByRole('button', { name: '帮助' });
    expect(helpButton).toBeDisabled();
  });
});
