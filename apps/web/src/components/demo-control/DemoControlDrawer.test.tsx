import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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
    });
  });

  afterEach(() => {
    cleanup();
    useGodModeStore.setState({
      isEnabled: false,
      isOpen: false,
      pendingSegmentType: null,
      pendingAction: null,
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

  it('严格渲染设计稿中的六个事件', () => {
    renderDrawer();
    expect(screen.getByRole('heading', { name: '添加事件' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^添加 / })).toHaveLength(6);
    expect(screen.getByText('有氧')).toBeInTheDocument();
    expect(screen.getByText('HIIT 运动')).toBeInTheDocument();
    expect(screen.getByText('散步')).toBeInTheDocument();
    expect(screen.getByText('力量')).toBeInTheDocument();
    expect(screen.getByText('咖啡因')).toBeInTheDocument();
    expect(screen.getByText('饮酒')).toBeInTheDocument();
    expect(screen.queryByText('日常节律')).toBeNull();
    expect(screen.queryByText('LIVE')).toBeNull();
    expect(screen.queryByText('+1h')).toBeNull();
    expect(screen.queryByText('重置')).toBeNull();
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
});
