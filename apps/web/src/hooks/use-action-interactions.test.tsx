import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { useActionInteractions } from './use-action-interactions';
import { useUIStore } from '@/stores/ui.store';
import type { ActionOption } from '@health-advisor/shared';

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    post: vi.fn(),
    get: vi.fn(),
  },
}));

// use-action-interactions 内部使用 useTranslations('homepage.action')，
// 渲染时需要 NextIntlClientProvider 提供 namespace 子集。
const TEST_MESSAGES = {
  homepage: {
    action: {
      toastRecorded: '已记录，正在更新实时简报',
      toastFailed: '微行动记录失败',
      toastUnverifiable: '{title}：已记录。由于该行为无法通过智能戒指验证，实时简报不会更新。',
      toastCalendarAdded: '已添加进日程',
    },
  },
} as const;

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <NextIntlClientProvider locale="zh" messages={TEST_MESSAGES}>
          {children}
        </NextIntlClientProvider>
      </QueryClientProvider>
    );
  }
  return Wrapper;
}

function makeMicroAction(duration?: number): ActionOption {
  return {
    id: 'a-micro',
    emoji: '💧',
    title: '喝水',
    description: '',
    aiPromise: '',
    interaction: {
      kind: 'micro_event',
      microEvent: {
        type: 'micro_hydration_walk',
        durationMinutes: duration,
        params: {},
      },
    },
  };
}

function makeCalendarAction(): ActionOption {
  return {
    id: 'a-cal',
    emoji: '📅',
    title: '体检预约',
    description: '明天 9 点',
    aiPromise: '',
    interaction: {
      kind: 'calendar',
      calendar: {
        title: '体检',
        timingLabel: '明天',
        durationMinutes: 60,
      },
    },
  };
}

function makePlainAction(): ActionOption {
  return {
    id: 'a-plain',
    emoji: '✅',
    title: '记录心情',
    description: '',
    aiPromise: '',
  };
}

describe('useActionInteractions', () => {
  beforeEach(() => {
    useUIStore.setState({ toasts: [] });
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('初始无 timerAction / appointmentAction', () => {
    const { result } = renderHook(
      () => useActionInteractions('p1'),
      { wrapper: createWrapper() },
    );
    expect(result.current.timerAction).toBeNull();
    expect(result.current.appointmentAction).toBeNull();
  });

  it('handleYes 对带 duration 的 micro_event 打开 Timer', async () => {
    const { result } = renderHook(
      () => useActionInteractions('p1'),
      { wrapper: createWrapper() },
    );
    await act(async () => {
      await result.current.handleYes(makeMicroAction(5));
    });
    expect(result.current.timerAction).not.toBeNull();
    expect(result.current.timerAction?.id).toBe('a-micro');
  });

  it('handleYes 对无 duration 的 micro_event 立即提交（pending → null）', async () => {
    const { result } = renderHook(
      () => useActionInteractions('p1'),
      { wrapper: createWrapper() },
    );
    await act(async () => {
      await result.current.handleYes(makeMicroAction(undefined));
    });
    // submitMicroEventNow 会失败（mock api），但不应抛出
    await waitFor(() => {
      expect(result.current.pendingActionId).toBeNull();
    });
  });

  it('handleYes 对 calendar action 打开 Appointment', async () => {
    const { result } = renderHook(
      () => useActionInteractions('p1'),
      { wrapper: createWrapper() },
    );
    await act(async () => {
      await result.current.handleYes(makeCalendarAction());
    });
    expect(result.current.appointmentAction).not.toBeNull();
    expect(result.current.appointmentAction?.id).toBe('a-cal');
  });

  it('handleYes 对 plain action 仅记录选择', async () => {
    const { result } = renderHook(
      () => useActionInteractions('p1'),
      { wrapper: createWrapper() },
    );
    await act(async () => {
      await result.current.handleYes(makePlainAction());
    });
    expect(result.current.selectedActionIds.has('a-plain')).toBe(true);
  });

  it('handleTimerStop 关闭 Timer，不提交', async () => {
    const { result } = renderHook(
      () => useActionInteractions('p1'),
      { wrapper: createWrapper() },
    );
    await act(async () => {
      await result.current.handleYes(makeMicroAction(5));
    });
    act(() => {
      result.current.handleTimerStop();
    });
    expect(result.current.timerAction).toBeNull();
  });

  it('handleAppointmentConfirm 记录 calendarActionIds', async () => {
    const { result } = renderHook(
      () => useActionInteractions('p1'),
      { wrapper: createWrapper() },
    );
    await act(async () => {
      await result.current.handleYes(makeCalendarAction());
    });
    act(() => {
      result.current.handleAppointmentConfirm();
    });
    expect(result.current.calendarActionIds.has('a-cal')).toBe(true);
    expect(result.current.appointmentAction).toBeNull();
  });

  it('handleAppointmentClose 关闭 Appointment 不记录', async () => {
    const { result } = renderHook(
      () => useActionInteractions('p1'),
      { wrapper: createWrapper() },
    );
    await act(async () => {
      await result.current.handleYes(makeCalendarAction());
    });
    act(() => {
      result.current.handleAppointmentClose();
    });
    expect(result.current.appointmentAction).toBeNull();
    expect(result.current.calendarActionIds.has('a-cal')).toBe(false);
  });

  it('handleNotNow 是无操作函数', () => {
    const { result } = renderHook(
      () => useActionInteractions('p1'),
      { wrapper: createWrapper() },
    );
    expect(() =>
      result.current.handleNotNow(makePlainAction()),
    ).not.toThrow();
  });

  it('handleTimerComplete 在无 timerAction 时安全返回', async () => {
    const { result } = renderHook(
      () => useActionInteractions('p1'),
      { wrapper: createWrapper() },
    );
    await expect(act(async () => {
      await result.current.handleTimerComplete();
    })).resolves.toBeUndefined();
    expect(result.current.timerAction).toBeNull();
  });
});
