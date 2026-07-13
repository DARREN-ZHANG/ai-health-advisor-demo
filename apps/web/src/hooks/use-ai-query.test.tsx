import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import {
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import type { AgentResponseEnvelope, BriefStreamEvent } from '@health-advisor/shared';
import { AgentTaskType } from '@health-advisor/shared';
import { useMorningBrief, useRefetchBrief } from './use-ai-query';
import { useBriefStreamStore } from '@/stores/brief-stream.store';
import { BriefStreamError } from '@/lib/brief-stream-client';
import { queryKeys } from '@/lib/query-keys';

/**
 * use-ai-query 流式改造的测试（任务 3.2）。
 *
 * 覆盖：
 * 1. 初始流：useMorningBrief queryFn 调 streamMorningBrief，delta 累积进 store，
 *    completed 后 React Query cache 原子拿到完整 envelope。
 * 2. 跨 hook refresh：useRefetchBrief mutationFn 用 streamMorningBrief(bustCache:true)，
 *    onSuccess setQueryData 写回 brief cache。
 * 3. final atomic commit：completed 后 draft entry 清除，cache 持有完整数据。
 * 4. failed clear：streamMorningBrief reject，store.fail 清除 draft，query/mutation error。
 * 5. profile switch stale event：profileA 的 delta 不污染 profileB（store requestId 校验）。
 */

// —— mock streamMorningBrief：默认 reject，每个测试按需 mockReturnValue ——
const mocks = vi.hoisted(() => ({
  streamMorningBrief: vi.fn(),
  // 让 requestId 可预测，方便断言 store 校验逻辑
  uuidCounter: 0,
}));

vi.mock('@/lib/brief-stream-client', () => ({
  streamMorningBrief: mocks.streamMorningBrief,
  BriefStreamError: class BriefStreamError extends Error {
    constructor(
      public status: number,
      public code: string,
      message: string,
    ) {
      super(message);
      this.name = 'BriefStreamError';
    }
  },
}));

// 替换全局 crypto.randomUUID，返回递增的 "req-0" / "req-1" 等，
// 便于断言"profileA 的旧 requestId 事件不污染 profileB"。
beforeEach(() => {
  mocks.uuidCounter = 0;
  vi.stubGlobal('crypto', {
    randomUUID: () => `req-${mocks.uuidCounter++}`,
  });
});

function makeEnvelope(summary: string): AgentResponseEnvelope {
  return {
    summary,
    source: 'llm',
    statusColor: 'good',
    chartTokens: [],
    meta: {
      taskType: AgentTaskType.HOMEPAGE_SUMMARY,
      pageContext: {
        profileId: 'p1',
        page: 'homepage',
        timeframe: 'week',
      },
      finishReason: 'complete',
    },
  };
}

/** 构造一个模拟流完成的 streamMorningBrief mock 实现 */
function makeStreamMock({
  deltas,
  envelope,
  requestId,
  rejectError,
}: {
  deltas: string[];
  envelope: AgentResponseEnvelope;
  requestId: string;
  rejectError?: BriefStreamError;
}): ReturnType<typeof vi.fn> {
  return vi.fn(async (_payload: unknown, options: { onEvent: (e: BriefStreamEvent) => void }) => {
    if (rejectError) throw rejectError;
    for (const delta of deltas) {
      options.onEvent({
        type: 'brief.summary.delta',
        requestId,
        delta,
      });
    }
    return envelope;
  });
}

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
        <NextIntlClientProvider locale="zh" messages={{}}>
          {children}
        </NextIntlClientProvider>
      </QueryClientProvider>
    );
  }
  return { Wrapper, queryClient };
}

function resetStore() {
  useBriefStreamStore.setState({ entries: {} });
}

describe('useMorningBrief / useRefetchBrief —— 流式改造', () => {
  beforeEach(() => {
    mocks.streamMorningBrief.mockReset();
    resetStore();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('初始流：delta 累积进 store，completed 后 cache 拿到完整 envelope', async () => {
    const envelope = makeEnvelope('今天恢复状态良好');
    mocks.streamMorningBrief.mockImplementation(
      makeStreamMock({
        deltas: ['今天', '恢复', '状态良好'],
        envelope,
        requestId: 'req-0',
      }),
    );

    const { Wrapper, queryClient } = createWrapper();
    const { result } = renderHook(() => useMorningBrief('p1'), {
      wrapper: Wrapper,
    });

    // 等 query 完成
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // query 返回的是完整 envelope（终态数据）
    expect(result.current.data).toEqual(envelope);

    // store 已清除 draft entry（completed 清理）
    expect(useBriefStreamStore.getState().getEntry('p1')).toBeUndefined();

    // cache 里也是完整 envelope
    expect(
      queryClient.getQueryData(queryKeys.homepage.brief('p1')),
    ).toEqual(envelope);
  });

  it('初始流：delta 到达期间 store 累积 draftSummary', async () => {
    // 用 manual control：streamMorningBrief 不立即 resolve，
    // 在 onEvent 回调后检查 store 状态。
    const envelope = makeEnvelope('final');
    let resolveStream: (value: AgentResponseEnvelope) => void = () => {};
    mocks.streamMorningBrief.mockImplementation(
      (_payload: unknown, options: { onEvent: (e: BriefStreamEvent) => void }) => {
        options.onEvent({ type: 'brief.summary.delta', requestId: 'req-0', delta: '片段一' });
        options.onEvent({ type: 'brief.summary.delta', requestId: 'req-0', delta: '片段二' });
        return new Promise<AgentResponseEnvelope>((resolve) => {
          resolveStream = resolve;
        });
      },
    );

    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useMorningBrief('p1'), {
      wrapper: Wrapper,
    });

    // delta 已累积进 store
    await waitFor(() => {
      expect(useBriefStreamStore.getState().getEntry('p1')?.draftSummary).toBe(
        '片段一片段二',
      );
    });
    // query 还没 resolve（stream 没 resolve）
    expect(result.current.isLoading).toBe(true);

    // 完成流
    await act(async () => {
      resolveStream(envelope);
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // 完成后 draft 清除
    expect(useBriefStreamStore.getState().getEntry('p1')).toBeUndefined();
  });

  it('跨 hook refresh：useRefetchBrief 用 streamMorningBrief(bustCache:true)，setQueryData 写回', async () => {
    const envelope = makeEnvelope('刷新后的简报');
    mocks.streamMorningBrief.mockImplementation(
      makeStreamMock({
        deltas: ['刷新'],
        envelope,
        requestId: 'req-0',
      }),
    );

    const { Wrapper, queryClient } = createWrapper();
    // 预置旧 cache
    const oldEnvelope = makeEnvelope('旧的简报');
    queryClient.setQueryData(queryKeys.homepage.brief('p1'), oldEnvelope);

    const { result } = renderHook(
      () => useRefetchBrief('p1'),
      { wrapper: Wrapper },
    );

    await act(async () => {
      await result.current.mutateAsync();
    });

    // streamMorningBrief 被调用，且 payload 带 bustCache: true
    expect(mocks.streamMorningBrief).toHaveBeenCalledTimes(1);
    const callArgs = mocks.streamMorningBrief.mock.calls[0];
    expect(callArgs).toBeDefined();
    expect(callArgs![0]).toMatchObject({
      profileId: 'p1',
      bustCache: true,
    });

    // cache 已原子替换为新 envelope
    expect(
      queryClient.getQueryData(queryKeys.homepage.brief('p1')),
    ).toEqual(envelope);

    // mutation 完成后 draft 清除
    expect(useBriefStreamStore.getState().getEntry('p1')).toBeUndefined();
  });

  it('final atomic commit：completed 后 draft 清除，cache 是完整数据', async () => {
    const envelope = makeEnvelope('完整终态');
    // 故意让 draft 和终态 summary 不同，验证终态替换 draft
    mocks.streamMorningBrief.mockImplementation(
      makeStreamMock({
        deltas: ['这是临时片段'],
        envelope,
        requestId: 'req-0',
      }),
    );

    const { Wrapper, queryClient } = createWrapper();
    const { result } = renderHook(() => useMorningBrief('p1'), {
      wrapper: Wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // draft 不应在终态后残留（provisional delta 从未进 cache）
    const cacheData = queryClient.getQueryData<AgentResponseEnvelope>(
      queryKeys.homepage.brief('p1'),
    );
    expect(cacheData?.summary).toBe('完整终态'); // 而非 "这是临时片段"
    expect(useBriefStreamStore.getState().getEntry('p1')).toBeUndefined();
  });

  it('failed clear：初始流失败清除 draft，query 进入 error', async () => {
    const failError = new BriefStreamError(
      0,
      'BRIEF_GENERATION_FAILED',
      'LLM 生成失败',
    );
    // 先发 delta 再 reject（模拟流到一半失败）
    mocks.streamMorningBrief.mockImplementation(
      async (_payload: unknown, options: { onEvent: (e: BriefStreamEvent) => void }) => {
        options.onEvent({
          type: 'brief.summary.delta',
          requestId: 'req-0',
          delta: '部分内容',
        });
        throw failError;
      },
    );

    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useMorningBrief('p1'), {
      wrapper: Wrapper,
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBe(failError);

    // 失败后 draft 已清除
    expect(useBriefStreamStore.getState().getEntry('p1')).toBeUndefined();
  });

  it('failed clear：刷新失败保留旧 cache，清除 draft，mutation error', async () => {
    const { Wrapper, queryClient } = createWrapper();
    const oldEnvelope = makeEnvelope('旧简报保留');
    queryClient.setQueryData(queryKeys.homepage.brief('p1'), oldEnvelope);

    const failError = new BriefStreamError(0, 'STREAM_ABORTED', '中断');
    mocks.streamMorningBrief.mockImplementation(
      async (_payload: unknown, options: { onEvent: (e: BriefStreamEvent) => void }) => {
        options.onEvent({
          type: 'brief.summary.delta',
          requestId: 'req-0',
          delta: '临时片段',
        });
        throw failError;
      },
    );

    const { result } = renderHook(
      () => useRefetchBrief('p1'),
      { wrapper: Wrapper },
    );

    await act(async () => {
      await expect(result.current.mutateAsync()).rejects.toThrow(failError);
    });

    // 旧 cache 保留（mutation 失败不应覆盖 cache）
    expect(
      queryClient.getQueryData<AgentResponseEnvelope>(
        queryKeys.homepage.brief('p1'),
      )?.summary,
    ).toBe('旧简报保留');
    // draft 清除
    expect(useBriefStreamStore.getState().getEntry('p1')).toBeUndefined();
  });

  it('profile switch stale event：profileA 的 delta 不污染 profileB 进行中的流', async () => {
    // 验证 store 的 requestId 守护在 B 流仍 streaming、B entry 仍存在时
    // 拒绝 A 的 stale 事件（不同 requestId）。
    //
    // 与"对不存在的 entry append 是 no-op"不同（store.test.ts 已覆盖），
    // 这里覆盖真正的 race：A 和 B 两个流都挂起、两个 entry 都在 store 里，
    // B 的 draftSummary 累积中。此时用 A 的 requestId 给 B 的 profileId
    // append A 的 stale 片段，store 必须拒绝（B 持有 req-1，req-0 不匹配）。
    // 随后 B 完成，验证 B 终态干净。
    //
    // 用两个 hook 实例并行渲染不同 profileId，避免 unmount/abort 信号路径
    // 复杂化。streamMorningBrief 都挂起，让两个 entry 同时 streaming。

    // A 流：发一个 delta 后挂起
    const envelopeA = makeEnvelope('profile A 终态');
    let resolveStreamA: (value: AgentResponseEnvelope) => void = () => {};
    mocks.streamMorningBrief.mockImplementationOnce(
      (_payload: unknown, options: { onEvent: (e: BriefStreamEvent) => void }) => {
        // req-0：A 的 requestId（crypto.randomUUID 被 stub，第一次调用返回 req-0）
        options.onEvent({
          type: 'brief.summary.delta',
          requestId: 'req-0',
          delta: 'A 的片段',
        });
        return new Promise<AgentResponseEnvelope>((resolve) => {
          resolveStreamA = resolve;
        });
      },
    );

    // B 流：发一个 delta 后挂起
    const envelopeB = makeEnvelope('profile B 终态');
    envelopeB.meta.pageContext.profileId = 'p2';
    let resolveStreamB: (value: AgentResponseEnvelope) => void = () => {};
    mocks.streamMorningBrief.mockImplementationOnce(
      (_payload: unknown, options: { onEvent: (e: BriefStreamEvent) => void }) => {
        // req-1：B 的 requestId（第二次调用返回 req-1）
        options.onEvent({
          type: 'brief.summary.delta',
          requestId: 'req-1',
          delta: 'B 的片段',
        });
        return new Promise<AgentResponseEnvelope>((resolve) => {
          resolveStreamB = resolve;
        });
      },
    );

    const { Wrapper } = createWrapper();
    // 并行渲染两个 hook（不同 profileId，模拟 profile 切换后两个流并存）
    renderHook(() => useMorningBrief('p1'), { wrapper: Wrapper });
    renderHook(() => useMorningBrief('p2'), { wrapper: Wrapper });

    // 等两个流各自的 delta 累积进 store
    await waitFor(() => {
      expect(useBriefStreamStore.getState().getEntry('p1')?.draftSummary).toBe('A 的片段');
      expect(useBriefStreamStore.getState().getEntry('p2')?.draftSummary).toBe('B 的片段');
    });

    // B entry 仍 streaming（B 流未 resolve）；requestId 应为 req-1
    const entryB = useBriefStreamStore.getState().getEntry('p2');
    expect(entryB?.phase).toBe('streaming');
    expect(entryB?.requestId).toBe('req-1');

    // 关键步骤：B 流仍进行中（B entry 仍存在）时，手动用 A 的 stale requestId（req-0）
    // 给 p2 append A 的 stale 片段——模拟 A 的延迟事件被误 dispatch 给 B 的 profileId。
    useBriefStreamStore.getState().append('p2', 'req-0', 'stale A 的片段');

    // 核心断言：B 的 draftSummary 没有被 A 的 stale requestId 污染。
    // store 的 requestId 守护拒绝 req-0（B 持有 req-1）。
    expect(useBriefStreamStore.getState().getEntry('p2')?.draftSummary).toBe('B 的片段');

    // 让 B 完成，验证 B 终态干净、entry 清除
    await act(async () => {
      resolveStreamB(envelopeB);
    });
    await waitFor(() => {
      expect(useBriefStreamStore.getState().getEntry('p2')).toBeUndefined();
    });

    // 清理 A 的挂起流，避免 unhandled rejection 警告
    await act(async () => {
      resolveStreamA(envelopeA);
    });
  });
});
