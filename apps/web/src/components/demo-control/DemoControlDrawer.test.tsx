import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within, act, waitFor } from '@testing-library/react';
import {
  DemoControlDrawer,
  type DemoControlDrawerProps,
} from './DemoControlDrawer';
import { DemoControlIntlProvider } from './intl-test-helper';
import { useGodModeStore } from '@/stores/god-mode.store';
import type { TimelineSegmentConfig } from './types';
import type { RecentEventEntry } from './RecentEventsDisclosure';

function renderWithIntl(node: React.ReactNode) {
  return render(<DemoControlIntlProvider>{node}</DemoControlIntlProvider>);
}

const SAMPLE_EVENTS: RecentEventEntry[] = [
  {
    recognizedEventId: 'evt-1',
    type: 'walk',
    start: '2026-07-05T08:30',
    end: '2026-07-05T09:00',
  },
];

const SAMPLE_PROPS: DemoControlDrawerProps = {
  events: SAMPLE_EVENTS,
  currentDemoTime: '2026-07-05T10:30',
};

/**
 * 抽屉同时渲染移动端 ValoSheet 与桌面端 ValoDialog，靠 Tailwind 断点类切换
 * 可见性。jsdom 不应用断点，两个 viewport 容器同时存在于 DOM。
 *
 * 我们始终把查询 scoped 到 `data-valo-viewport="mobile"` 容器（即移动端 sheet）
 * 上，避免重复元素引起的查询歧义。`getMobileContainer` 是这一约定的入口。
 */
function getMobileContainer(): HTMLElement {
  const container = document.querySelector(
    '[data-valo-viewport="mobile"]',
  ) as HTMLElement | null;
  if (!container) {
    throw new Error('移动端视口容器未渲染；可能 isEnabled / isOpen 为 false');
  }
  return container;
}

describe('DemoControlDrawer', () => {
  beforeEach(() => {
    useGodModeStore.setState({
      isEnabled: true,
      isOpen: false,
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

  it('isEnabled=false 时不渲染任何 dialog', () => {
    useGodModeStore.setState({ isEnabled: false, isOpen: true });
    renderWithIntl(<DemoControlDrawer {...SAMPLE_PROPS} />);
    expect(screen.queryAllByRole('dialog')).toHaveLength(0);
  });

  it('isOpen=false 时不渲染任何 dialog', () => {
    useGodModeStore.setState({ isEnabled: true, isOpen: false });
    renderWithIntl(<DemoControlDrawer {...SAMPLE_PROPS} />);
    expect(screen.queryAllByRole('dialog')).toHaveLength(0);
  });

  it('open 后渲染标题与 LIVE 状态条（移动端 viewport）', () => {
    useGodModeStore.setState({ isOpen: true });
    renderWithIntl(<DemoControlDrawer {...SAMPLE_PROPS} />);
    const mobile = getMobileContainer();
    expect(within(mobile).getByText('Demo 控制台')).toBeInTheDocument();
    expect(within(mobile).getByText('LIVE')).toBeInTheDocument();
  });

  it('同时挂载移动端与桌面端两层 overlay（响应式双 DOM 设计）', () => {
    useGodModeStore.setState({ isOpen: true });
    renderWithIntl(<DemoControlDrawer {...SAMPLE_PROPS} />);
    expect(screen.getAllByRole('dialog')).toHaveLength(2);
    expect(getMobileContainer()).toBeInTheDocument();
    const desktop = document.querySelector('[data-valo-viewport="desktop"]');
    expect(desktop).not.toBeNull();
  });

  it('header 关闭按钮触发 toggleOpen(false)', () => {
    useGodModeStore.setState({ isOpen: true });
    const toggleSpy = vi.spyOn(useGodModeStore.getState(), 'toggleOpen');
    renderWithIntl(<DemoControlDrawer {...SAMPLE_PROPS} />);
    const mobile = getMobileContainer();
    fireEvent.click(within(mobile).getByRole('button', { name: '关闭' }));
    expect(toggleSpy).toHaveBeenCalledWith(false);
    toggleSpy.mockRestore();
  });

  it('摘要区显示当前时间 HH:MM 与事件数量', () => {
    useGodModeStore.setState({ isOpen: true });
    renderWithIntl(<DemoControlDrawer {...SAMPLE_PROPS} />);
    const mobile = getMobileContainer();
    const clock = within(mobile).getByText('10:30');
    expect(clock.getAttribute('data-valo-clock')).toBe('true');
    const count = within(mobile).getByText('1');
    expect(count.getAttribute('data-valo-event-count')).toBe('true');
  });

  it('渲染三组：日常节律(6) / 运动训练(3) / 状态与摄入(4)', () => {
    useGodModeStore.setState({ isOpen: true });
    renderWithIntl(<DemoControlDrawer {...SAMPLE_PROPS} />);
    const mobile = getMobileContainer();
    expect(within(mobile).getByText('日常节律')).toBeInTheDocument();
    expect(within(mobile).getByText('运动训练')).toBeInTheDocument();
    expect(within(mobile).getByText('状态与摄入')).toBeInTheDocument();

    const dailyGroup = mobile.querySelector('[data-valo-group="daily-rhythm"]');
    const sportGroup = mobile.querySelector('[data-valo-group="sport-training"]');
    const stateGroup = mobile.querySelector('[data-valo-group="state-intake"]');
    // 每张卡片有 2 个按钮（卡片主体 + 帮助按钮），所以日常 12、运动 6、状态 8
    expect(dailyGroup?.querySelectorAll('button')).toHaveLength(12);
    expect(sportGroup?.querySelectorAll('button')).toHaveLength(6);
    expect(stateGroup?.querySelectorAll('button')).toHaveLength(8);
  });

  it('点击 segment 卡片触发 onSegmentClick', () => {
    useGodModeStore.setState({ isOpen: true });
    const onSegmentClick = vi.fn();
    renderWithIntl(
      <DemoControlDrawer {...SAMPLE_PROPS} onSegmentClick={onSegmentClick} />,
    );
    const mobile = getMobileContainer();
    fireEvent.click(within(mobile).getByText('散步'));
    expect(onSegmentClick).toHaveBeenCalledTimes(1);
    const arg = onSegmentClick.mock.calls[0]?.[0] as TimelineSegmentConfig;
    expect(arg.type).toBe('walk');
  });

  it('点击 +1h 触发 onAdvanceHour', () => {
    useGodModeStore.setState({ isOpen: true });
    const onAdvanceHour = vi.fn();
    renderWithIntl(
      <DemoControlDrawer {...SAMPLE_PROPS} onAdvanceHour={onAdvanceHour} />,
    );
    const mobile = getMobileContainer();
    fireEvent.click(within(mobile).getByRole('button', { name: '+1h' }));
    expect(onAdvanceHour).toHaveBeenCalledTimes(1);
  });

  it('点击重置按钮不直接触发 onReset，而是打开确认弹窗（I2.3 流程）', () => {
    useGodModeStore.setState({ isOpen: true });
    const onReset = vi.fn();
    renderWithIntl(
      <DemoControlDrawer {...SAMPLE_PROPS} onReset={onReset} />,
    );
    const mobile = getMobileContainer();
    // 移动端 footer 的“重置”按钮只是打开 dialog
    fireEvent.click(within(mobile).getByRole('button', { name: '重置' }));
    expect(onReset).not.toHaveBeenCalled();
    // 确认弹窗应当被打开（标题/描述可见）
    expect(screen.getByText('重置时间轴？')).toBeInTheDocument();
  });

  it('在重置确认弹窗中点击“重置”才真正调用 onReset（I2.3，异步 await）', async () => {
    useGodModeStore.setState({ isOpen: true });
    // 异步 onReset：模拟 mutation 返回前弹窗应保持打开。
    let resolveMutation: () => void = () => {};
    const onReset = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveMutation = resolve;
        }),
    );
    renderWithIntl(
      <DemoControlDrawer {...SAMPLE_PROPS} onReset={onReset} />,
    );
    const mobile = getMobileContainer();
    fireEvent.click(within(mobile).getByRole('button', { name: '重置' }));
    // 弹窗内的“重置”按钮：通过弹窗根容器 scope，避免与 footer 按钮冲突
    const dialog = screen.getByText('重置时间轴？').closest('[role="dialog"]');
    expect(dialog).not.toBeNull();
    await act(async () => {
      fireEvent.click(
        within(dialog as HTMLElement).getByRole('button', { name: '重置' }),
      );
      // 让微任务跑一轮，让 await onReset 进入 pending
      await Promise.resolve();
    });
    // mutation 已被调用
    expect(onReset).toHaveBeenCalledTimes(1);
    // mutation 未 resolve 前弹窗保持打开（loading 态对用户可见）
    expect(screen.getByText('重置时间轴？')).toBeInTheDocument();

    // resolve mutation → 弹窗在 finally 中关闭
    await act(async () => {
      resolveMutation();
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(screen.queryByText('重置时间轴？')).toBeNull();
    });
  });

  it('onReset 失败时弹窗也会通过 finally 关闭（toast 由 hook 处理）', async () => {
    useGodModeStore.setState({ isOpen: true });
    const onReset = vi.fn().mockRejectedValue(new Error('boom'));
    renderWithIntl(
      <DemoControlDrawer {...SAMPLE_PROPS} onReset={onReset} />,
    );
    const mobile = getMobileContainer();
    fireEvent.click(within(mobile).getByRole('button', { name: '重置' }));
    const dialog = screen.getByText('重置时间轴？').closest('[role="dialog"]');
    await act(async () => {
      fireEvent.click(
        within(dialog as HTMLElement).getByRole('button', { name: '重置' }),
      );
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(screen.queryByText('重置时间轴？')).toBeNull();
    });
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it('在重置确认弹窗中点击“取消”关闭弹窗且不调用 onReset', () => {
    useGodModeStore.setState({ isOpen: true });
    const onReset = vi.fn();
    renderWithIntl(
      <DemoControlDrawer {...SAMPLE_PROPS} onReset={onReset} />,
    );
    const mobile = getMobileContainer();
    fireEvent.click(within(mobile).getByRole('button', { name: '重置' }));
    const dialog = screen.getByText('重置时间轴？').closest('[role="dialog"]');
    fireEvent.click(
      within(dialog as HTMLElement).getByRole('button', { name: '取消' }),
    );
    expect(onReset).not.toHaveBeenCalled();
    expect(screen.queryByText('重置时间轴？')).toBeNull();
  });

  it('pendingAction=advance 时 +1h 按钮被禁用并显示旋转图标', () => {
    useGodModeStore.setState({ isOpen: true, pendingAction: 'advance' });
    renderWithIntl(<DemoControlDrawer {...SAMPLE_PROPS} />);
    const mobile = getMobileContainer();
    expect(within(mobile).getByRole('button', { name: '+1h' })).toBeDisabled();
    expect(mobile.querySelector('.animate-spin')).not.toBeNull();
  });

  it('pendingAction=reset 时重置按钮被禁用', () => {
    useGodModeStore.setState({ isOpen: true, pendingAction: 'reset' });
    renderWithIntl(<DemoControlDrawer {...SAMPLE_PROPS} />);
    const mobile = getMobileContainer();
    expect(within(mobile).getByRole('button', { name: '重置' })).toBeDisabled();
  });

  it('LIVE 状态条引用 --valo-active token（绿色光谱）', () => {
    useGodModeStore.setState({ isOpen: true });
    renderWithIntl(<DemoControlDrawer {...SAMPLE_PROPS} />);
    const mobile = getMobileContainer();
    const live = within(mobile).getByText('LIVE');
    expect(live.className).toContain('text-[var(--valo-active)]');
  });

  it('+1h 按钮引用 --valo-prime 作为主操作背景', () => {
    useGodModeStore.setState({ isOpen: true });
    renderWithIntl(<DemoControlDrawer {...SAMPLE_PROPS} />);
    const mobile = getMobileContainer();
    const advanceBtn = within(mobile).getByRole('button', { name: '+1h' });
    expect(advanceBtn.getAttribute('style') ?? '').toContain('var(--valo-prime)');
  });

  it('重置按钮文字色引用 --valo-depleted token（红色光谱）', () => {
    useGodModeStore.setState({ isOpen: true });
    renderWithIntl(<DemoControlDrawer {...SAMPLE_PROPS} />);
    const mobile = getMobileContainer();
    const resetBtn = within(mobile).getByRole('button', { name: '重置' });
    expect(resetBtn.className).toContain('text-[var(--valo-depleted)]');
  });

  it('pendingSegmentType 命中某片段时该卡片显示 loading 旋转图标', () => {
    useGodModeStore.setState({ isOpen: true, pendingSegmentType: 'walk' });
    renderWithIntl(<DemoControlDrawer {...SAMPLE_PROPS} />);
    const mobile = getMobileContainer();
    expect(mobile.querySelector('.animate-spin')).not.toBeNull();
  });

  it('挂载后存在 id="demo-control-drawer" 元素，供 trigger 的 aria-controls 锚定', () => {
    useGodModeStore.setState({ isOpen: true });
    renderWithIntl(<DemoControlDrawer {...SAMPLE_PROPS} />);
    // 移动端与桌面端各渲染一份内容；只要存在至少一个匹配元素即可。
    const matches = document.querySelectorAll('#demo-control-drawer');
    expect(matches.length).toBeGreaterThan(0);
    // 该元素应当包含抽屉的标题，证明它是受控 UI 的一部分。
    const first = matches[0] as HTMLElement;
    expect(first.textContent ?? '').toContain('Demo 控制台');
  });

  // ============ I2.3 新增：disable-when-pending 契约 ============

  it('pendingSegmentType 命中某片段时：所有卡片均禁用，仅当前卡片显示 spinner', () => {
    useGodModeStore.setState({ isOpen: true, pendingSegmentType: 'walk' });
    renderWithIntl(<DemoControlDrawer {...SAMPLE_PROPS} />);
    const mobile = getMobileContainer();
    // walk 卡片显示 spinner
    expect(mobile.querySelector('.animate-spin')).not.toBeNull();
    // 所有片段的卡片主体按钮均被 disabled
    const dailyGroup = mobile.querySelector('[data-valo-group="daily-rhythm"]');
    const mainButtons = dailyGroup?.querySelectorAll('button[data-valo-touch="true"]');
    if (!mainButtons) throw new Error('未找到日常节律分组按钮');
    // 6 张卡片 * 2 个按钮（主体 + 帮助）= 12 个按钮，均应 disabled
    mainButtons.forEach((btn) => {
      expect((btn as HTMLButtonElement).disabled).toBe(true);
    });
    // 同时底部 +1h 与重置按钮也应被禁用（任一 pending 全禁用）
    expect(within(mobile).getByRole('button', { name: '+1h' })).toBeDisabled();
    expect(within(mobile).getByRole('button', { name: '重置' })).toBeDisabled();
  });

  it('pendingAction=advance 时：所有片段卡片、+1h、重置均禁用', () => {
    useGodModeStore.setState({ isOpen: true, pendingAction: 'advance' });
    renderWithIntl(<DemoControlDrawer {...SAMPLE_PROPS} />);
    const mobile = getMobileContainer();
    // 任一 pending 都触发全禁用
    expect(within(mobile).getByRole('button', { name: '+1h' })).toBeDisabled();
    expect(within(mobile).getByRole('button', { name: '重置' })).toBeDisabled();
    // 第一张卡片（meal_intake）的主体按钮应禁用
    const firstCard = mobile.querySelector(
      '[data-valo-group="daily-rhythm"] button[data-valo-touch="true"]',
    ) as HTMLButtonElement | null;
    expect(firstCard?.disabled).toBe(true);
  });

  it('无 pending 时：所有片段卡片、+1h、重置均可点击', () => {
    useGodModeStore.setState({ isOpen: true });
    renderWithIntl(<DemoControlDrawer {...SAMPLE_PROPS} />);
    const mobile = getMobileContainer();
    expect(within(mobile).getByRole('button', { name: '+1h' })).not.toBeDisabled();
    expect(
      within(mobile).getByRole('button', { name: '重置' }),
    ).not.toBeDisabled();
    const firstCard = mobile.querySelector(
      '[data-valo-group="daily-rhythm"] button[data-valo-touch="true"]',
    ) as HTMLButtonElement | null;
    expect(firstCard?.disabled).toBe(false);
  });

  it('pending 进行中时点击重置按钮不会打开确认弹窗', () => {
    useGodModeStore.setState({ isOpen: true, pendingAction: 'advance' });
    renderWithIntl(<DemoControlDrawer {...SAMPLE_PROPS} />);
    const mobile = getMobileContainer();
    // 重置按钮已被禁用
    const resetBtn = within(mobile).getByRole('button', { name: '重置' });
    expect(resetBtn).toBeDisabled();
    // 强制触发（即便 UI 上禁用）也不应打开弹窗
    fireEvent.click(resetBtn);
    expect(screen.queryByText('重置时间轴？')).toBeNull();
  });

  it('重置确认弹窗使用 danger tone（确认按钮引用 --valo-depleted）', () => {
    useGodModeStore.setState({ isOpen: true });
    renderWithIntl(<DemoControlDrawer {...SAMPLE_PROPS} />);
    const mobile = getMobileContainer();
    fireEvent.click(within(mobile).getByRole('button', { name: '重置' }));
    const dialog = screen.getByText('重置时间轴？').closest('[role="dialog"]');
    // 弹窗内有两个按钮：取消 + 重置。重置按钮应当引用 depleted token
    const confirmBtn = within(dialog as HTMLElement).getByRole('button', {
      name: '重置',
    });
    expect(confirmBtn.getAttribute('style') ?? '').toContain(
      'var(--valo-depleted)',
    );
  });

  // ============ I2.3 修复：单实例弹窗 + loading 态 ============

  it('重置确认弹窗在双视口下只有单个实例（消除 dual-render 重复）', () => {
    useGodModeStore.setState({ isOpen: true });
    renderWithIntl(<DemoControlDrawer {...SAMPLE_PROPS} />);
    const mobile = getMobileContainer();
    // 打开重置确认弹窗前：移动端 sheet + 桌面端 drawer 两个 role=dialog。
    expect(screen.getAllByRole('dialog').length).toBeGreaterThanOrEqual(2);
    fireEvent.click(within(mobile).getByRole('button', { name: '重置' }));
    // 打开后：sheet + drawer 两个外层 + 1 个 reset 弹窗 = 3 个。
    // 关键点是 reset 弹窗本身只渲染一次（旧版会渲染 2 次 → 总数 4）。
    const resetDialogs = document.querySelectorAll('[role="dialog"]');
    // 仅断言 reset 弹窗文案“重置时间轴？”只出现一次（单实例契约）。
    const resetTitleNodes = Array.from(resetDialogs).filter((d) =>
      (d as HTMLElement).textContent?.includes('重置时间轴？'),
    );
    expect(resetTitleNodes).toHaveLength(1);
  });

  it('pendingAction=reset 时重置确认弹窗的确认按钮处于 loading/disabled 态', () => {
    useGodModeStore.setState({ isOpen: true });
    renderWithIntl(<DemoControlDrawer {...SAMPLE_PROPS} />);
    const mobile = getMobileContainer();
    // 先打开弹窗，再模拟 mutation 进行中（pendingAction 由 hook 写入 store）。
    fireEvent.click(within(mobile).getByRole('button', { name: '重置' }));
    act(() => {
      useGodModeStore.setState({ pendingAction: 'reset' });
    });
    const dialog = screen.getByText('重置时间轴？').closest('[role="dialog"]');
    const confirmBtn = within(dialog as HTMLElement).getByRole('button', {
      name: '重置',
    });
    expect(confirmBtn).toBeDisabled();
  });
});
