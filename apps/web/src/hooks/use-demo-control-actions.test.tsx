import { act, renderHook } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TimelineSegmentConfig } from '@/components/demo-control/types';
import { useActiveSensingStore } from '@/stores/active-sensing.store';
import { useGodModeStore } from '@/stores/god-mode.store';
import { useUIStore } from '@/stores/ui.store';
import { useDemoControlActions } from './use-demo-control-actions';

vi.mock('./use-god-mode-actions', () => ({ useGodModeActions: vi.fn() }));
vi.mock('./use-ai-query', () => ({ useRefetchBrief: vi.fn() }));

const wrapper = ({ children }: { children: ReactNode }) => (
  <NextIntlClientProvider locale="zh" messages={{ demoControl: { operationFailed: '操作失败' } }}>
    {children}
  </NextIntlClientProvider>
);

function segment(
  type: TimelineSegmentConfig['type'],
  params?: TimelineSegmentConfig['params'],
): TimelineSegmentConfig {
  return {
    type,
    labelKey: type,
    helpKey: type,
    icon: '📍',
    group: 'daily-rhythm',
    ...(params ? { params } : {}),
  };
}

async function setup(overrides: {
  appendTimeline?: ReturnType<typeof vi.fn>;
  injectEvent?: ReturnType<typeof vi.fn>;
  refetchBrief?: ReturnType<typeof vi.fn>;
}) {
  const { useGodModeActions } = await import('./use-god-mode-actions');
  const { useRefetchBrief } = await import('./use-ai-query');
  (useGodModeActions as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
    appendTimeline: overrides.appendTimeline ?? vi.fn(),
    injectEvent: overrides.injectEvent ?? vi.fn(),
  });
  const refetchMock = overrides.refetchBrief ?? vi.fn().mockResolvedValue(null);
  (useRefetchBrief as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
    mutateAsync: refetchMock,
    isPending: false,
  });
  return renderHook(() => useDemoControlActions(), { wrapper });
}

describe('useDemoControlActions', () => {
  beforeEach(() => {
    useGodModeStore.setState({
      pendingSegmentType: null,
      isBriefRefreshing: false,
    });
    useActiveSensingStore.setState({ pendingProbabilisticAction: null });
    useUIStore.setState({ toasts: [] });
  });

  afterEach(() => vi.restoreAllMocks());

  it('普通事件：立即关抽屉 + skeleton + 刷新简报 + 清空 pending', async () => {
    const appendTimeline = vi.fn().mockResolvedValue({});
    const refetchBrief = vi.fn().mockResolvedValue(null);
    const toggleSpy = vi.spyOn(useGodModeStore.getState(), 'toggleOpen');
    const { result } = await setup({ appendTimeline, refetchBrief });
    await act(() => result.current.onSegmentClick(segment('walk')));

    expect(appendTimeline).toHaveBeenCalledWith({ segmentType: 'walk', params: undefined });
    expect(refetchBrief).toHaveBeenCalled();
    // 乐观关闭：点击即刻关抽屉（不等 mutation 完成）
    expect(toggleSpy).toHaveBeenCalledWith(false);
    // 完成后清空 pending 和 skeleton flag
    expect(useGodModeStore.getState().pendingSegmentType).toBeNull();
    expect(useGodModeStore.getState().isBriefRefreshing).toBe(false);
  });

  it('概率事件：立即关抽屉 + injectEvent + 不刷新简报不显示 skeleton', async () => {
    const injectEvent = vi.fn().mockResolvedValue({});
    const refetchBrief = vi.fn().mockResolvedValue(null);
    const toggleSpy = vi.spyOn(useGodModeStore.getState(), 'toggleOpen');
    const { result } = await setup({ injectEvent, refetchBrief });
    await act(() =>
      result.current.onSegmentClick(segment('caffeine_intake', { dose: 'moderate' })),
    );

    expect(injectEvent).toHaveBeenCalledWith({
      eventType: 'possible_caffeine_intake',
      data: { source: 'caffeine_intake', confidence: 0.75 },
    });
    expect(useActiveSensingStore.getState().pendingProbabilisticAction?.segmentType).toBe(
      'caffeine_intake',
    );
    // 抽屉关闭（所有点击都立即关）
    expect(toggleSpy).toHaveBeenCalledWith(false);
    // 概率事件不刷新简报：用户在 Banner 二次确认前简报内容不应改变
    expect(refetchBrief).not.toHaveBeenCalled();
    // isBriefRefreshing 全程为 false（概率事件不需要 skeleton）
    expect(useGodModeStore.getState().isBriefRefreshing).toBe(false);
    expect(useGodModeStore.getState().pendingSegmentType).toBeNull();
  });

  it('失败时显示错误提示并清空 pending（抽屉已乐观关闭）', async () => {
    const appendTimeline = vi.fn().mockRejectedValue(new Error('boom'));
    const refetchBrief = vi.fn().mockResolvedValue(null);
    const toggleSpy = vi.spyOn(useGodModeStore.getState(), 'toggleOpen');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result } = await setup({ appendTimeline, refetchBrief });
    await act(() => result.current.onSegmentClick(segment('walk')));

    // 抽屉已关闭（乐观 UI，失败不回滚关闭状态）
    expect(toggleSpy).toHaveBeenCalledWith(false);
    // 失败时不刷新简报
    expect(refetchBrief).not.toHaveBeenCalled();
    // toast + pending 清空
    expect(useUIStore.getState().toasts[0]?.message).toBe('操作失败');
    expect(useGodModeStore.getState().pendingSegmentType).toBeNull();
    expect(useGodModeStore.getState().isBriefRefreshing).toBe(false);
  });
});
