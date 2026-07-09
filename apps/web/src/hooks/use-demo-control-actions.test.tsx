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
}) {
  const { useGodModeActions } = await import('./use-god-mode-actions');
  (useGodModeActions as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
    appendTimeline: overrides.appendTimeline ?? vi.fn(),
    injectEvent: overrides.injectEvent ?? vi.fn(),
  });
  return renderHook(() => useDemoControlActions(), { wrapper });
}

describe('useDemoControlActions', () => {
  beforeEach(() => {
    useGodModeStore.setState({ pendingSegmentType: null });
    useActiveSensingStore.setState({ pendingProbabilisticAction: null });
    useUIStore.setState({ toasts: [] });
  });

  afterEach(() => vi.restoreAllMocks());

  it('普通事件追加时间轴并维护 pending', async () => {
    const appendTimeline = vi.fn().mockResolvedValue({});
    const { result } = await setup({ appendTimeline });
    await act(() => result.current.onSegmentClick(segment('walk')));
    expect(appendTimeline).toHaveBeenCalledWith({ segmentType: 'walk', params: undefined });
    expect(useGodModeStore.getState().pendingSegmentType).toBeNull();
  });

  it('咖啡因事件进入概率事件流程', async () => {
    const injectEvent = vi.fn().mockResolvedValue({});
    const { result } = await setup({ injectEvent });
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
  });

  it('失败时显示错误提示并清空 pending', async () => {
    const appendTimeline = vi.fn().mockRejectedValue(new Error('boom'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result } = await setup({ appendTimeline });
    await act(() => result.current.onSegmentClick(segment('walk')));
    expect(useGodModeStore.getState().pendingSegmentType).toBeNull();
    expect(useUIStore.getState().toasts[0]?.message).toBe('操作失败');
  });
});
