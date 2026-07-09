import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LifeLogPanel } from './LifeLogPanel';
import { LifeLogIntlProvider } from './intl-test-helper';
import { useLifeLogStore } from '@/stores/life-log.store';
import { useProfileStore } from '@/stores/profile.store';

const mocks = vi.hoisted(() => ({
  appendTimeline: vi.fn(),
  removeTimelineSegment: vi.fn(),
}));

vi.mock('@/hooks/use-god-mode-actions', () => ({
  useGodModeState: () => ({
    data: { currentDemoTime: '2026-07-08T10:01' },
  }),
  useGodModeActions: () => ({
    appendTimeline: mocks.appendTimeline,
    removeTimelineSegment: mocks.removeTimelineSegment,
    isAppendingTimeline: false,
    isRemovingTimelineSegment: false,
  }),
}));

function renderPanel() {
  return render(
    <LifeLogIntlProvider>
      <LifeLogPanel />
    </LifeLogIntlProvider>,
  );
}

function openCategory(type: 'caffeine' | 'alcohol' | 'hydration') {
  const section = document.querySelector(
    `[data-valo-life-log-section="${type}"]`,
  );
  const button = section?.querySelector('button');
  if (!button) throw new Error(`Missing ${type} category button`);
  fireEvent.click(button);
}

describe('LifeLogPanel', () => {
  beforeEach(() => {
    useProfileStore.setState({
      currentProfileId: 'profile-a',
      currentProfile: null,
    });
    useLifeLogStore.setState({ entriesByProfile: {} });
    let segment = 0;
    mocks.appendTimeline.mockImplementation(async () => ({
      currentProfileId: 'profile-a',
      lastTimelineSegmentId: `segment-${++segment}`,
    }));
    mocks.removeTimelineSegment.mockResolvedValue({
      currentProfileId: 'profile-a',
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('渲染三个生活记录入口', () => {
    renderPanel();
    expect(screen.getByText('生活记录')).toBeTruthy();
    expect(screen.getByText('咖啡因')).toBeTruthy();
    expect(screen.getByText('酒精')).toBeTruthy();
    expect(screen.getByText('饮水')).toBeTruthy();
  });

  it('咖啡因快捷新增写入当前 Mock 时间并显示记录', async () => {
    renderPanel();
    openCategory('caffeine');
    fireEvent.click(screen.getByRole('button', { name: '添加 1 杯' }));

    await waitFor(() => expect(mocks.appendTimeline).toHaveBeenCalled());
    expect(mocks.appendTimeline).toHaveBeenCalledWith(
      expect.objectContaining({
        segmentType: 'caffeine_intake',
        timeOfDay: '10:01',
        advanceClock: false,
      }),
    );
    expect(screen.getByText('10:01')).toBeTruthy();
    expect(screen.getByText('1 杯 (50mg)')).toBeTruthy();
  });

  it('饮水快捷新增以 250ml 为单位写入 hydration timeline', async () => {
    renderPanel();
    openCategory('hydration');
    fireEvent.click(screen.getByRole('button', { name: '添加 250ml' }));

    await waitFor(() => expect(mocks.appendTimeline).toHaveBeenCalled());
    expect(mocks.appendTimeline).toHaveBeenCalledWith(
      expect.objectContaining({
        segmentType: 'hydration_intake',
        params: expect.objectContaining({ amountMl: 250 }),
      }),
    );
    expect(screen.getByText('250ml')).toBeTruthy();
  });

  it('自定义新增使用时间弹窗选择的 Mock 当日时间', async () => {
    renderPanel();
    openCategory('alcohol');
    fireEvent.click(
      within(screen.getByRole('dialog', { name: '酒精' })).getByRole('button', {
        name: '自定义',
      }),
    );
    const timeButton = document.querySelector('[data-valo-life-log-time]');
    if (!timeButton) throw new Error('Missing time button');
    fireEvent.click(timeButton);
    fireEvent.change(screen.getByDisplayValue('10:01'), {
      target: { value: '14:00' },
    });
    fireEvent.click(screen.getByRole('button', { name: '完成' }));
    fireEvent.click(screen.getByRole('button', { name: '添加' }));

    await waitFor(() => expect(mocks.appendTimeline).toHaveBeenCalled());
    expect(mocks.appendTimeline).toHaveBeenCalledWith(
      expect.objectContaining({
        segmentType: 'alcohol_intake',
        timeOfDay: '14:00',
      }),
    );
    expect(screen.getByText('14:00')).toBeTruthy();
  });

  it('编辑使用 replaceSegmentId 原子替换时间轴片段', async () => {
    renderPanel();
    openCategory('caffeine');
    fireEvent.click(screen.getByRole('button', { name: '添加 1 杯' }));
    await waitFor(() => expect(screen.getByText('1 杯 (50mg)')).toBeTruthy());

    const entry = document.querySelector('[data-valo-life-log-entry]');
    if (!entry) throw new Error('Missing life log entry');
    fireEvent.click(entry);
    fireEvent.click(screen.getByRole('button', { name: '增加' }));
    fireEvent.click(screen.getByRole('button', { name: '更新' }));

    await waitFor(() => expect(mocks.appendTimeline).toHaveBeenCalledTimes(2));
    expect(mocks.appendTimeline).toHaveBeenLastCalledWith(
      expect.objectContaining({
        replaceSegmentId: 'segment-1',
        params: expect.objectContaining({ drinks: 2 }),
      }),
    );
    expect(screen.getByText('2 杯 (100mg)')).toBeTruthy();
  });

  it('删除同步移除时间轴片段和本地记录', async () => {
    renderPanel();
    openCategory('caffeine');
    fireEvent.click(screen.getByRole('button', { name: '添加 1 杯' }));
    await waitFor(() => expect(screen.getByText('1 杯 (50mg)')).toBeTruthy());

    const entry = document.querySelector('[data-valo-life-log-entry]');
    if (!entry) throw new Error('Missing life log entry');
    fireEvent.click(entry);
    fireEvent.click(screen.getByRole('button', { name: '删除' }));

    await waitFor(() =>
      expect(mocks.removeTimelineSegment).toHaveBeenCalledWith('segment-1'),
    );
    expect(screen.queryByText('1 杯 (50mg)')).toBeNull();
  });

  it('按 profile 隔离记录', async () => {
    renderPanel();
    openCategory('caffeine');
    fireEvent.click(screen.getByRole('button', { name: '添加 1 杯' }));
    await waitFor(() => expect(screen.getByText('1 杯 (50mg)')).toBeTruthy());

    act(() => useProfileStore.setState({ currentProfileId: 'profile-b' }));
    expect(screen.queryByText('1 杯 (50mg)')).toBeNull();
    expect(useLifeLogStore.getState().entriesByProfile['profile-a']).toHaveLength(1);
  });
});
