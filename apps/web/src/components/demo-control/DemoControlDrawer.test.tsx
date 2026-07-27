import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGodModeStore } from '@/stores/god-mode.store';
import { DemoControlIntlProvider } from './intl-test-helper';
import { DemoControlDrawer } from './DemoControlDrawer';
import type { TimelineSegmentConfig } from './types';

function renderDrawer(onSegmentClick = vi.fn()) {
  return {
    onSegmentClick,
    ...render(
      <DemoControlIntlProvider>
        <DemoControlDrawer onSegmentClick={onSegmentClick} />
      </DemoControlIntlProvider>,
    ),
  };
}

describe('DemoControlDrawer', () => {
  beforeEach(() => {
    useGodModeStore.setState({
      isEnabled: true,
      isOpen: true,
      pendingSegmentType: null,
      pendingAction: null,
      selectedPlanDayIndex: 0,
    });
  });

  afterEach(() => {
    cleanup();
    useGodModeStore.setState({
      isEnabled: false,
      isOpen: false,
      pendingSegmentType: null,
      pendingAction: null,
      selectedPlanDayIndex: 0,
    });
  });

  it('关闭或禁用时不渲染', () => {
    useGodModeStore.setState({ isOpen: false });
    const view = renderDrawer();
    expect(screen.queryByRole('dialog')).toBeNull();

    useGodModeStore.setState({ isEnabled: false, isOpen: true });
    view.rerender(
      <DemoControlIntlProvider>
        <DemoControlDrawer />
      </DemoControlIntlProvider>,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('渲染全部十三个事件和重置时间轴入口', () => {
    renderDrawer();
    expect(screen.getByRole('heading', { name: '添加事件' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^添加 / })).toHaveLength(13);
    expect(screen.getByText('进餐')).toBeInTheDocument();
    expect(screen.getByText('有氧')).toBeInTheDocument();
    expect(screen.getByText('久坐')).toBeInTheDocument();
    expect(screen.getByText('HIIT 运动')).toBeInTheDocument();
    expect(screen.getByText('散步')).toBeInTheDocument();
    expect(screen.getByText('睡眠')).toBeInTheDocument();
    expect(screen.getByText('小憩')).toBeInTheDocument();
    expect(screen.getByText('专注')).toBeInTheDocument();
    expect(screen.getByText('焦虑')).toBeInTheDocument();
    expect(screen.getByText('力量')).toBeInTheDocument();
    expect(screen.getByText('咖啡因')).toBeInTheDocument();
    expect(screen.getByText('饮酒')).toBeInTheDocument();
    expect(screen.getByText('放松')).toBeInTheDocument();
    expect(screen.queryByText('日常节律')).toBeNull();
    expect(screen.queryByText('LIVE')).toBeNull();
    expect(screen.queryByText('+1h')).toBeNull();
    expect(screen.getByRole('button', { name: '重置' })).toBeInTheDocument();
  });

  it('事件行按设计稿校准为 49px', () => {
    renderDrawer();
    expect(screen.getByText('散步').closest('div')).toHaveClass('h-[49px]');
  });

  it('事件列表保留滚动能力但隐藏滚动条', () => {
    renderDrawer();
    expect(screen.getByTestId('demo-event-list')).toHaveClass(
      'overflow-y-auto',
      '[scrollbar-width:none]',
      '[&::-webkit-scrollbar]:hidden',
    );
  });

  it('有计划时可切换首页展示的天数', () => {
    render(
      <DemoControlIntlProvider>
        <DemoControlDrawer
          planDays={[
            { id: 'day-1', title: 'Day 1' },
            { id: 'day-2', title: 'Day 2' },
          ]}
        />
      </DemoControlIntlProvider>,
    );

    const dayTwo = screen.getByRole('button', { name: '第 2 天' });
    expect(screen.getByRole('button', { name: '第 1 天' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(dayTwo);
    expect(dayTwo).toHaveAttribute('aria-pressed', 'true');
    expect(useGodModeStore.getState().selectedPlanDayIndex).toBe(1);
  });

  it('点击添加按钮传递对应事件配置', () => {
    const onSegmentClick = vi.fn();
    renderDrawer(onSegmentClick);
    fireEvent.click(screen.getByRole('button', { name: '添加 散步' }));
    expect(onSegmentClick).toHaveBeenCalledTimes(1);
    expect((onSegmentClick.mock.calls[0]?.[0] as TimelineSegmentConfig).type).toBe('walk');
  });

  it('关闭按钮关闭面板', () => {
    const toggleOpen = vi.spyOn(useGodModeStore.getState(), 'toggleOpen');
    renderDrawer();
    fireEvent.click(screen.getByRole('button', { name: '关闭' }));
    expect(toggleOpen).toHaveBeenCalledWith(false);
  });

  it('请求处理中禁用全部添加按钮并仅在当前项显示加载图标', () => {
    useGodModeStore.setState({ pendingSegmentType: 'walk' });
    renderDrawer();
    const buttons = screen.getAllByRole('button', { name: /^添加 / });
    expect(buttons.every((button) => button.hasAttribute('disabled'))).toBe(true);
    expect(
      screen.getByRole('button', { name: '添加 散步' }).querySelector('.animate-spin'),
    ).not.toBeNull();
  });

  it('确认后才执行重置时间轴', () => {
    const onResetTimeline = vi.fn();
    render(
      <DemoControlIntlProvider>
        <DemoControlDrawer onResetTimeline={onResetTimeline} />
      </DemoControlIntlProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: '重置' }));
    expect(screen.getByRole('dialog', { name: '重置时间轴？' })).toBeInTheDocument();
    expect(onResetTimeline).not.toHaveBeenCalled();

    fireEvent.click(
      within(screen.getByRole('dialog', { name: '重置时间轴？' })).getByRole('button', {
        name: '重置',
      }),
    );
    expect(onResetTimeline).toHaveBeenCalledTimes(1);
  });
});
