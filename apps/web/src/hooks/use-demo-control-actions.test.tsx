import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { useDemoControlActions } from './use-demo-control-actions';
import { useGodModeStore } from '@/stores/god-mode.store';
import { useActiveSensingStore } from '@/stores/active-sensing.store';
import { useUIStore } from '@/stores/ui.store';
import { useProfileStore } from '@/stores/profile.store';
import type { TimelineSegmentConfig } from '@/components/demo-control/types';

/**
 * 本测试不 mock `@/components/demo-control/timeline-segments`，因为该文件
 * 是纯配置无副作用；PROBABILISTIC_SEGMENT_TYPES / MAP 等导出是契约。
 *
 * `useGodModeActions` 是真正的副作用入口，必须 mock。
 */

const MESSAGES = {
  demoControl: {
    operationFailed: '操作失败',
    advanceFailed: '推进时钟失败',
    resetFailed: '重置时间轴失败',
    resetSucceeded: '时间轴已重置',
  },
} as const;

function wrapper({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider locale="zh" messages={MESSAGES}>
      {children}
    </NextIntlClientProvider>
  );
}

/**
 * 构造 mock `useGodModeActions` 返回值，便于每个用例定制 spy。
 */
function mockActions(overrides: {
  appendTimeline?: ReturnType<typeof vi.fn>;
  injectEvent?: ReturnType<typeof vi.fn>;
  advanceClock?: ReturnType<typeof vi.fn>;
  resetTimeline?: ReturnType<typeof vi.fn>;
}) {
  return {
    switchProfile: vi.fn(),
    isSwitchingProfile: false,
    injectEvent: overrides.injectEvent ?? vi.fn(),
    isInjectingEvent: false,
    appendTimeline: overrides.appendTimeline ?? vi.fn(),
    isAppendingTimeline: false,
    advanceClock: overrides.advanceClock ?? vi.fn(),
    isAdvancingClock: false,
    resetTimeline: overrides.resetTimeline ?? vi.fn(),
    isResettingTimeline: false,
    appendMicroEvent: vi.fn(),
    isAppendingMicroEvent: false,
  };
}

function makeSegment(
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

describe('useDemoControlActions', () => {
  beforeEach(() => {
    vi.mock('./use-god-mode-actions', () => ({
      useGodModeActions: vi.fn(),
    }));
    // 重置 store
    useGodModeStore.setState({
      isEnabled: true,
      isOpen: false,
      pendingSegmentType: null,
      pendingAction: null,
    });
    useActiveSensingStore.setState({
      activeBanner: null,
      isVisible: false,
      pendingProbabilisticAction: null,
    });
    useUIStore.setState({
      isAdvisorDrawerOpen: false,
      activeDrawer: null,
      toasts: [],
    });
    // 重置 profile store 到默认 profile-a，避免跨用例污染
    useProfileStore.setState({ currentProfileId: 'profile-a', currentProfile: null });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('普通片段点击调用 appendTimeline 并管理 pendingSegmentType 生命周期', async () => {
    const appendTimeline = vi.fn().mockResolvedValue({});
    const { useGodModeActions } = await import('./use-god-mode-actions');
    (useGodModeActions as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      mockActions({ appendTimeline }),
    );
    const { result } = renderHook(() => useDemoControlActions(), { wrapper });

    // 调用前 pending 为 null
    expect(useGodModeStore.getState().pendingSegmentType).toBeNull();

    let pendingDuringCall: unknown = 'not-set';
    appendTimeline.mockImplementationOnce(async () => {
      // 调用 mutation 时应当已经写入 pending
      pendingDuringCall = useGodModeStore.getState().pendingSegmentType;
      return {};
    });

    await act(async () => {
      await result.current.onSegmentClick(makeSegment('walk'));
    });

    expect(appendTimeline).toHaveBeenCalledWith({
      segmentType: 'walk',
      params: undefined,
    });
    expect(pendingDuringCall).toBe('walk');
    // 调用后清空
    expect(useGodModeStore.getState().pendingSegmentType).toBeNull();
  });

  it('概率片段（caffeine）调用 injectEvent 并写入 pendingProbabilisticAction', async () => {
    const injectEvent = vi.fn().mockResolvedValue({});
    const { useGodModeActions } = await import('./use-god-mode-actions');
    (useGodModeActions as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      mockActions({ injectEvent }),
    );
    const { result } = renderHook(() => useDemoControlActions(), { wrapper });

    await act(async () => {
      await result.current.onSegmentClick(
        makeSegment('caffeine_intake', { dose: 'moderate' }),
      );
    });

    expect(injectEvent).toHaveBeenCalledWith({
      eventType: 'possible_caffeine_intake',
      data: { source: 'caffeine_intake', confidence: 0.75 },
    });
    expect(useActiveSensingStore.getState().pendingProbabilisticAction).toEqual({
      segmentType: 'caffeine_intake',
      params: { dose: 'moderate' },
    });
    expect(useGodModeStore.getState().pendingSegmentType).toBeNull();
  });

  it('概率片段（alcohol）使用 possible_alcohol_intake eventType', async () => {
    const injectEvent = vi.fn().mockResolvedValue({});
    const { useGodModeActions } = await import('./use-god-mode-actions');
    (useGodModeActions as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      mockActions({ injectEvent }),
    );
    const { result } = renderHook(() => useDemoControlActions(), { wrapper });

    await act(async () => {
      await result.current.onSegmentClick(
        makeSegment('alcohol_intake', { amount: 'moderate' }),
      );
    });

    expect(injectEvent).toHaveBeenCalledWith({
      eventType: 'possible_alcohol_intake',
      data: { source: 'alcohol_intake', confidence: 0.75 },
    });
    expect(
      useActiveSensingStore.getState().pendingProbabilisticAction?.segmentType,
    ).toBe('alcohol_intake');
  });

  it('+1h 调用 advanceClock(60) 并管理 pendingAction 生命周期', async () => {
    const advanceClock = vi.fn().mockResolvedValue({});
    const { useGodModeActions } = await import('./use-god-mode-actions');
    (useGodModeActions as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      mockActions({ advanceClock }),
    );
    const { result } = renderHook(() => useDemoControlActions(), { wrapper });

    let pendingDuringCall: unknown = 'not-set';
    advanceClock.mockImplementationOnce(async () => {
      pendingDuringCall = useGodModeStore.getState().pendingAction;
      return {};
    });

    await act(async () => {
      await result.current.onAdvanceHour();
    });

    expect(advanceClock).toHaveBeenCalledWith(60);
    expect(pendingDuringCall).toBe('advance');
    expect(useGodModeStore.getState().pendingAction).toBeNull();
  });

  it('reset 调用 resetTimeline({ profileId }) 并在成功后显示 toast', async () => {
    const resetTimeline = vi.fn().mockResolvedValue({});
    const { useGodModeActions } = await import('./use-god-mode-actions');
    (useGodModeActions as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      mockActions({ resetTimeline }),
    );
    const { result } = renderHook(() => useDemoControlActions(), { wrapper });

    await act(async () => {
      await result.current.onReset();
    });

    expect(resetTimeline).toHaveBeenCalledWith({ profileId: 'profile-a' });
    expect(useGodModeStore.getState().pendingAction).toBeNull();
    // 成功 toast
    expect(useUIStore.getState().toasts).toHaveLength(1);
    expect(useUIStore.getState().toasts[0]?.type).toBe('success');
    expect(useUIStore.getState().toasts[0]?.message).toBe('时间轴已重置');
  });

  it('appendTimeline 失败时显示 error toast 并清空 pending', async () => {
    const appendTimeline = vi.fn().mockRejectedValue(new Error('boom'));
    const { useGodModeActions } = await import('./use-god-mode-actions');
    (useGodModeActions as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      mockActions({ appendTimeline }),
    );
    // 抑制 console.error 噪音
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result } = renderHook(() => useDemoControlActions(), { wrapper });

    await act(async () => {
      await result.current.onSegmentClick(makeSegment('walk'));
    });

    expect(appendTimeline).toHaveBeenCalled();
    expect(useGodModeStore.getState().pendingSegmentType).toBeNull();
    const { toasts } = useUIStore.getState();
    expect(toasts).toHaveLength(1);
    expect(toasts[0]?.type).toBe('error');
    expect(toasts[0]?.message).toBe('操作失败');
    errSpy.mockRestore();
  });

  it('injectEvent 失败时不写入 pendingProbabilisticAction，但显示 toast', async () => {
    const injectEvent = vi.fn().mockRejectedValue(new Error('boom'));
    const { useGodModeActions } = await import('./use-god-mode-actions');
    (useGodModeActions as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      mockActions({ injectEvent }),
    );
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result } = renderHook(() => useDemoControlActions(), { wrapper });

    await act(async () => {
      await result.current.onSegmentClick(makeSegment('caffeine_intake'));
    });

    expect(injectEvent).toHaveBeenCalled();
    expect(
      useActiveSensingStore.getState().pendingProbabilisticAction,
    ).toBeNull();
    expect(useUIStore.getState().toasts[0]?.type).toBe('error');
    errSpy.mockRestore();
  });

  it('advanceClock 失败时显示 error toast 并清空 pendingAction', async () => {
    const advanceClock = vi.fn().mockRejectedValue(new Error('boom'));
    const { useGodModeActions } = await import('./use-god-mode-actions');
    (useGodModeActions as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      mockActions({ advanceClock }),
    );
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result } = renderHook(() => useDemoControlActions(), { wrapper });

    await act(async () => {
      await result.current.onAdvanceHour();
    });

    expect(useGodModeStore.getState().pendingAction).toBeNull();
    expect(useUIStore.getState().toasts[0]?.message).toBe('推进时钟失败');
    errSpy.mockRestore();
  });

  it('resetTimeline 失败时显示 error toast 且不显示 success toast', async () => {
    const resetTimeline = vi.fn().mockRejectedValue(new Error('boom'));
    const { useGodModeActions } = await import('./use-god-mode-actions');
    (useGodModeActions as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      mockActions({ resetTimeline }),
    );
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result } = renderHook(() => useDemoControlActions(), { wrapper });

    await act(async () => {
      await result.current.onReset();
    });

    expect(resetTimeline).toHaveBeenCalledWith({ profileId: 'profile-a' });
    expect(useGodModeStore.getState().pendingAction).toBeNull();
    const { toasts } = useUIStore.getState();
    expect(toasts).toHaveLength(1);
    expect(toasts[0]?.type).toBe('error');
    expect(toasts[0]?.message).toBe('重置时间轴失败');
    errSpy.mockRestore();
  });

  it('三个回调引用稳定（多次 render 同一实例）', async () => {
    const { useGodModeActions } = await import('./use-god-mode-actions');
    (useGodModeActions as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      mockActions({}),
    );
    const { result, rerender } = renderHook(() => useDemoControlActions(), {
      wrapper,
    });
    const first = result.current;
    rerender();
    expect(result.current.onSegmentClick).toBe(first.onSegmentClick);
    expect(result.current.onAdvanceHour).toBe(first.onAdvanceHour);
    expect(result.current.onReset).toBe(first.onReset);
  });

  it('pending 写入与清空发生在 mutation 之前后（顺序校验）', async () => {
    const appendTimeline = vi.fn().mockImplementation(async () => {
      // 调用 mutation 时 pending 已写入
      expect(useGodModeStore.getState().pendingSegmentType).toBe('nap');
      return {};
    });
    const { useGodModeActions } = await import('./use-god-mode-actions');
    (useGodModeActions as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      mockActions({ appendTimeline }),
    );
    const { result } = renderHook(() => useDemoControlActions(), { wrapper });

    expect(useGodModeStore.getState().pendingSegmentType).toBeNull();
    await act(async () => {
      await result.current.onSegmentClick(makeSegment('nap'));
    });
    // 调用完成后清空
    await waitFor(() => {
      expect(useGodModeStore.getState().pendingSegmentType).toBeNull();
    });
  });
});
