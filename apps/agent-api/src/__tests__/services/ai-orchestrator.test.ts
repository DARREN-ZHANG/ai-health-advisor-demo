import { describe, it, expect, vi } from 'vitest';
import { AiOrchestrator } from '../../services/ai-orchestrator';
import type { AgentRequest } from '@health-advisor/agent-core';
import type { AgentResponseEnvelope, PageContext } from '@health-advisor/shared';
import { AgentTaskType } from '@health-advisor/shared';
import type { RuntimeRegistry } from '../../runtime/registry';
import type { MemoryServices } from '../../runtime/memory-services';

// mock executeAgent 以控制返回值
vi.mock('@health-advisor/agent-core', () => ({
  executeAgent: vi.fn(),
}));

import { executeAgent } from '@health-advisor/agent-core';

const mockedExecuteAgent = vi.mocked(executeAgent);

const defaultPageContext: PageContext = {
  profileId: 'profile-a',
  page: 'home',
  timeframe: 'week',
};

function makeMetrics() {
  const calls: Record<string, number> = {};
  return {
    calls,
    incrementApiRequests: () => {
      calls.apiRequests = (calls.apiRequests ?? 0) + 1;
    },
    incrementAiTimeout: () => {
      calls.aiTimeout = (calls.aiTimeout ?? 0) + 1;
    },
    incrementFallbackUsed: () => {
      calls.fallbackUsed = (calls.fallbackUsed ?? 0) + 1;
    },
    incrementProviderError: () => {
      calls.providerError = (calls.providerError ?? 0) + 1;
    },
    incrementBriefCacheHit: () => {
      calls.briefCacheHit = (calls.briefCacheHit ?? 0) + 1;
    },
    recordLatency: () => {},
    snapshot: () => ({
      apiRequests: {},
      aiTimeouts: 0,
      fallbackUsed: 0,
      providerErrors: 0,
      briefCacheHits: 0,
      latencyByRoute: {},
      totalRequests: 0,
      startTime: '',
    }),
  };
}

function makeRegistry(): RuntimeRegistry {
  const overrideStore = {
    getSyncState: vi.fn().mockReturnValue({ lastSyncedMeasuredAt: null, syncSessions: [] }),
    getSyncedEvents: vi.fn().mockReturnValue([]),
  };
  return {
    getSessionSandbox: vi.fn().mockReturnValue({ overrideStore }),
    getRawProfile: vi.fn().mockReturnValue({ profile: { profileId: 'profile-a' }, records: [] }),
    getActiveOverrides: vi.fn().mockReturnValue([]),
    getInjectedEvents: vi.fn().mockReturnValue([]),
  } as unknown as RuntimeRegistry;
}

function makeMemoryServices(hit?: { payload: Record<string, unknown> }): MemoryServices {
  return {
    cache: {
      get: vi.fn().mockResolvedValue(hit),
      set: vi.fn().mockResolvedValue(undefined),
      invalidateProfile: vi.fn().mockResolvedValue(0),
      clearExpired: vi.fn().mockResolvedValue(0),
    },
  } as unknown as MemoryServices;
}

const completeResponse: AgentResponseEnvelope = {
  summary: '健康状态良好',
  source: 'llm',
  statusColor: 'good',
  chartTokens: [],
  microTips: [],
  meta: {
    taskType: AgentTaskType.HOMEPAGE_SUMMARY,
    pageContext: defaultPageContext,
    finishReason: 'complete',
  },
};

describe('AiOrchestrator', () => {
  it('成功执行返回原始结果', async () => {
    mockedExecuteAgent.mockResolvedValueOnce(completeResponse);
    const metrics = makeMetrics();
    const orchestrator = new AiOrchestrator({
      registry: makeRegistry(),
      metrics,
      timeoutMs: 60000,
      memoryServices: makeMemoryServices(),
      modelVersion: 'gpt-test',
    });

    const request: AgentRequest = {
      requestId: 'req-1',
      sessionId: 'sess-1',
      profileId: 'profile-a',
      taskType: AgentTaskType.HOMEPAGE_SUMMARY,
      pageContext: defaultPageContext,
    };

    const result = await orchestrator.execute(request);
    expect(result.meta.finishReason).toBe('complete');
    expect(metrics.calls).toEqual({});
  });

  it('记录执行阶段耗时，供生产日志定位慢请求', async () => {
    mockedExecuteAgent.mockImplementationOnce(async (_request, _deps, _timeout, observer) => {
      observer?.onContextBuilt?.({} as never);
      observer?.onRulesEvaluated?.({} as never);
      observer?.onPacketBuilt?.({} as never);
      observer?.onPromptBuilt?.({ systemPrompt: 'system', taskPrompt: 'task' });
      observer?.onModelOutput?.('{"summary":"ok"}');
      observer?.onCustomerPolicyEvaluated?.({
        phase: 'initial',
        approved: false,
        violationCodes: ['unattributed_numeric_claim'],
      });
      observer?.onCustomerPolicyEvaluated?.({
        phase: 'regeneration',
        approved: true,
        violationCodes: [],
      });
      observer?.onParsed?.(completeResponse);
      observer?.onVerified?.({} as never);
      return completeResponse;
    });
    const orchestrator = new AiOrchestrator({
      registry: makeRegistry(),
      metrics: makeMetrics(),
      timeoutMs: 60000,
      memoryServices: makeMemoryServices(),
      modelVersion: 'gpt-test',
    });
    let timings: Record<string, unknown> | undefined;

    await orchestrator.execute(
      {
        requestId: 'req-timing',
        sessionId: 'sess-1',
        profileId: 'profile-a',
        taskType: AgentTaskType.HOMEPAGE_SUMMARY,
        pageContext: defaultPageContext,
      },
      undefined,
      {
        onTimings: (value) => {
          timings = value;
        },
      },
    );

    expect(timings).toMatchObject({
      cacheLookupMs: expect.any(Number),
      contextMs: expect.any(Number),
      rulesMs: expect.any(Number),
      packetMs: expect.any(Number),
      promptBuildMs: expect.any(Number),
      llmMs: expect.any(Number),
      postProcessMs: expect.any(Number),
      contentPolicyChecks: [
        {
          phase: 'initial',
          approved: false,
          violationCodes: ['unattributed_numeric_claim'],
        },
        {
          phase: 'regeneration',
          approved: true,
          violationCodes: [],
        },
      ],
      agentMs: expect.any(Number),
      cacheWriteMs: expect.any(Number),
      orchestrationMs: expect.any(Number),
    });
  });

  it('fallback 时增加 fallbackUsed 计数', async () => {
    const fallbackResponse: AgentResponseEnvelope = {
      ...completeResponse,
      source: 'fallback',
      statusColor: 'warning',
      meta: { ...completeResponse.meta, finishReason: 'fallback' },
    };
    mockedExecuteAgent.mockResolvedValueOnce(fallbackResponse);
    const metrics = makeMetrics();
    const orchestrator = new AiOrchestrator({
      registry: makeRegistry(),
      metrics,
      timeoutMs: 6000,
      memoryServices: makeMemoryServices(),
      modelVersion: 'gpt-test',
    });

    const result = await orchestrator.execute({
      requestId: 'req-2',
      sessionId: 'sess-1',
      profileId: 'profile-a',
      taskType: AgentTaskType.HOMEPAGE_SUMMARY,
      pageContext: defaultPageContext,
    });

    expect(result.meta.finishReason).toBe('fallback');
    expect(metrics.calls.fallbackUsed).toBe(1);
  });

  it('timeout 时增加 aiTimeout 计数', async () => {
    const timeoutResponse: AgentResponseEnvelope = {
      ...completeResponse,
      source: 'fallback',
      statusColor: 'warning',
      meta: { ...completeResponse.meta, finishReason: 'timeout' },
    };
    mockedExecuteAgent.mockResolvedValueOnce(timeoutResponse);
    const metrics = makeMetrics();
    const orchestrator = new AiOrchestrator({
      registry: makeRegistry(),
      metrics,
      timeoutMs: 6000,
      memoryServices: makeMemoryServices(),
      modelVersion: 'gpt-test',
    });

    const result = await orchestrator.execute({
      requestId: 'req-3',
      sessionId: 'sess-1',
      profileId: 'profile-a',
      taskType: AgentTaskType.HOMEPAGE_SUMMARY,
      pageContext: defaultPageContext,
    });

    expect(result.meta.finishReason).toBe('timeout');
    expect(metrics.calls.aiTimeout).toBe(1);
  });

  it('provider error 时增加 providerError 计数并抛出', async () => {
    mockedExecuteAgent.mockRejectedValueOnce(new Error('connection failed'));
    const metrics = makeMetrics();
    const orchestrator = new AiOrchestrator({
      registry: makeRegistry(),
      metrics,
      timeoutMs: 6000,
      memoryServices: makeMemoryServices(),
      modelVersion: 'gpt-test',
    });

    await expect(
      orchestrator.execute({
        requestId: 'req-4',
        sessionId: 'sess-1',
        profileId: 'profile-a',
        taskType: AgentTaskType.HOMEPAGE_SUMMARY,
        pageContext: defaultPageContext,
      }),
    ).rejects.toThrow('connection failed');

    expect(metrics.calls.providerError).toBe(1);
  });

  it('cache 命中时跳过 LLM 调用并记录指标', async () => {
    mockedExecuteAgent.mockClear();
    const metrics = makeMetrics();
    const orchestrator = new AiOrchestrator({
      registry: makeRegistry(),
      metrics,
      timeoutMs: 60000,
      memoryServices: makeMemoryServices({
        payload: completeResponse as unknown as Record<string, unknown>,
      }),
      modelVersion: 'gpt-test',
    });

    const result = await orchestrator.execute({
      requestId: 'req-5',
      sessionId: 'sess-1',
      profileId: 'profile-a',
      taskType: AgentTaskType.HOMEPAGE_SUMMARY,
      pageContext: defaultPageContext,
    });

    expect(result.meta.finishReason).toBe('cached');
    expect(metrics.calls.briefCacheHit).toBe(1);
    // 不应调用 LLM
    expect(mockedExecuteAgent).not.toHaveBeenCalled();
  });

  // ── Task 4.2：客户边界集成验收 ────────────────────────

  it('成功的 envelope 不含内部字段（confidence / sourceSegmentId / internalScore）', async () => {
    mockedExecuteAgent.mockResolvedValueOnce(completeResponse);
    const orchestrator = new AiOrchestrator({
      registry: makeRegistry(),
      metrics: makeMetrics(),
      timeoutMs: 60000,
      memoryServices: makeMemoryServices(),
      modelVersion: 'gpt-test',
    });

    const result = await orchestrator.execute({
      requestId: 'req-envelope',
      sessionId: 'sess-1',
      profileId: 'profile-a',
      taskType: AgentTaskType.HOMEPAGE_SUMMARY,
      pageContext: defaultPageContext,
    });

    // 客户可见 envelope 不得出现内部字段
    expect(result).not.toHaveProperty('confidence');
    expect(result).not.toHaveProperty('sourceSegmentId');
    expect(result).not.toHaveProperty('internalScore');
    expect(result).not.toHaveProperty('evidencePacket');
    expect(result).not.toHaveProperty('analysisPlan');
    // meta 中也不得出现内部字段
    expect(result.meta).not.toHaveProperty('confidence');
    expect(result.meta).not.toHaveProperty('sourceSegmentId');
  });

  it('content policy 失败时（finishReason=fallback）不缓存结果', async () => {
    // 模拟 content policy 失败场景：executeAgent 返回 fallback finishReason
    //（正常路径下 content policy 失败会被 runtime 转为 fallback envelope）
    const policyFailedResponse: AgentResponseEnvelope = {
      ...completeResponse,
      source: 'fallback',
      statusColor: 'warning',
      summary: '抱歉，刚才的回复未通过内容策略校验，已为你回退到安全回复。',
      meta: { ...completeResponse.meta, finishReason: 'fallback' },
    };
    mockedExecuteAgent.mockResolvedValueOnce(policyFailedResponse);

    const cacheSet = vi.fn().mockResolvedValue(undefined);
    const memoryServices = makeMemoryServices();
    memoryServices.cache.set = cacheSet;

    const orchestrator = new AiOrchestrator({
      registry: makeRegistry(),
      metrics: makeMetrics(),
      timeoutMs: 60000,
      memoryServices,
      modelVersion: 'gpt-test',
    });

    const result = await orchestrator.execute({
      requestId: 'req-policy-fail',
      sessionId: 'sess-1',
      profileId: 'profile-a',
      taskType: AgentTaskType.HOMEPAGE_SUMMARY,
      pageContext: defaultPageContext,
    });

    // finishReason 应为 fallback，不是 complete
    expect(result.meta.finishReason).toBe('fallback');
    // 关键断言：cache.set 不得被调用（content policy 失败的结果不可缓存）
    expect(cacheSet).not.toHaveBeenCalled();
  });

  it('content policy 失败时（finishReason=timeout）也不缓存结果', async () => {
    const timeoutResponse: AgentResponseEnvelope = {
      ...completeResponse,
      source: 'fallback',
      statusColor: 'warning',
      meta: { ...completeResponse.meta, finishReason: 'timeout' },
    };
    mockedExecuteAgent.mockResolvedValueOnce(timeoutResponse);

    const cacheSet = vi.fn().mockResolvedValue(undefined);
    const memoryServices = makeMemoryServices();
    memoryServices.cache.set = cacheSet;

    const orchestrator = new AiOrchestrator({
      registry: makeRegistry(),
      metrics: makeMetrics(),
      timeoutMs: 60000,
      memoryServices,
      modelVersion: 'gpt-test',
    });

    await orchestrator.execute({
      requestId: 'req-policy-timeout',
      sessionId: 'sess-1',
      profileId: 'profile-a',
      taskType: AgentTaskType.HOMEPAGE_SUMMARY,
      pageContext: defaultPageContext,
    });

    // 非 complete finishReason 一律不缓存
    expect(cacheSet).not.toHaveBeenCalled();
  });

  it('成功的 complete envelope 会被缓存', async () => {
    mockedExecuteAgent.mockResolvedValueOnce(completeResponse);

    const cacheSet = vi.fn().mockResolvedValue(undefined);
    const memoryServices = makeMemoryServices();
    memoryServices.cache.set = cacheSet;

    const orchestrator = new AiOrchestrator({
      registry: makeRegistry(),
      metrics: makeMetrics(),
      timeoutMs: 60000,
      memoryServices,
      modelVersion: 'gpt-test',
    });

    await orchestrator.execute({
      requestId: 'req-cache-write',
      sessionId: 'sess-1',
      profileId: 'profile-a',
      taskType: AgentTaskType.HOMEPAGE_SUMMARY,
      pageContext: defaultPageContext,
    });

    // 成功的 complete 应触发 cache.set
    expect(cacheSet).toHaveBeenCalledTimes(1);
  });

  // ===== 流式传输（任务 2.2 新增）=====

  it('cache miss 时透传 onSummaryDelta 并记录流式 timing', async () => {
    // executeAgent 的第 6 参数是 options；测试时直接调用 callback 模拟 delta
    mockedExecuteAgent.mockImplementationOnce(
      async (_req, _deps, _timeout, _observer, _locale, options) => {
        const onDelta = options?.onSummaryDelta;
        if (onDelta) {
          await onDelta('健康');
          await onDelta('状态');
          await onDelta('良好');
        }
        return completeResponse;
      },
    );
    const orchestrator = new AiOrchestrator({
      registry: makeRegistry(),
      metrics: makeMetrics(),
      timeoutMs: 60000,
      memoryServices: makeMemoryServices(),
      modelVersion: 'gpt-test',
    });

    const receivedDeltas: string[] = [];
    let timings: Record<string, unknown> | undefined;

    const result = await orchestrator.execute(
      {
        requestId: 'req-stream-1',
        sessionId: 'sess-1',
        profileId: 'profile-a',
        taskType: AgentTaskType.HOMEPAGE_SUMMARY,
        pageContext: defaultPageContext,
      },
      undefined,
      {
        onSummaryDelta: (delta) => { receivedDeltas.push(delta); },
        onTimings: (value) => { timings = value; },
      },
    );

    // delta 顺序正确
    expect(receivedDeltas).toEqual(['健康', '状态', '良好']);
    // 终态为 complete（cache miss 正常完成）
    expect(result.meta.finishReason).toBe('complete');
    // 流式 timing 字段存在且类型正确
    expect(timings).toMatchObject({
      llmFirstTokenMs: expect.any(Number),
      streamChunkCount: 3,
      streamDurationMs: expect.any(Number),
    });
  });

  it('cache hit 时不调用 onSummaryDelta 且无流式 timing', async () => {
    mockedExecuteAgent.mockClear();
    const orchestrator = new AiOrchestrator({
      registry: makeRegistry(),
      metrics: makeMetrics(),
      timeoutMs: 60000,
      memoryServices: makeMemoryServices({
        payload: completeResponse as unknown as Record<string, unknown>,
      }),
      modelVersion: 'gpt-test',
    });

    const onSummaryDelta = vi.fn();
    let timings: Record<string, unknown> | undefined;

    const result = await orchestrator.execute(
      {
        requestId: 'req-stream-2',
        sessionId: 'sess-1',
        profileId: 'profile-a',
        taskType: AgentTaskType.HOMEPAGE_SUMMARY,
        pageContext: defaultPageContext,
      },
      undefined,
      {
        onSummaryDelta,
        onTimings: (value) => { timings = value; },
      },
    );

    // cache hit 直接返回 cached envelope，不伪造 delta
    expect(result.meta.finishReason).toBe('cached');
    expect(onSummaryDelta).not.toHaveBeenCalled();
    expect(mockedExecuteAgent).not.toHaveBeenCalled();
    // 流式 timing 字段不存在
    expect(timings?.llmFirstTokenMs).toBeUndefined();
    expect(timings?.streamChunkCount).toBeUndefined();
    expect(timings?.streamDurationMs).toBeUndefined();
    // 但 cache hit 标志存在
    expect(timings?.cacheHit).toBe(true);
  });

  it('signal 透传给 executeAgent', async () => {
    mockedExecuteAgent.mockResolvedValueOnce(completeResponse);
    const orchestrator = new AiOrchestrator({
      registry: makeRegistry(),
      metrics: makeMetrics(),
      timeoutMs: 60000,
      memoryServices: makeMemoryServices(),
      modelVersion: 'gpt-test',
    });

    const controller = new AbortController();
    await orchestrator.execute(
      {
        requestId: 'req-stream-3',
        sessionId: 'sess-1',
        profileId: 'profile-a',
        taskType: AgentTaskType.HOMEPAGE_SUMMARY,
        pageContext: defaultPageContext,
      },
      undefined,
      { signal: controller.signal },
    );

    // executeAgent 第 6 参数应包含 signal
    expect(mockedExecuteAgent).toHaveBeenCalledTimes(1);
    const sixthArg = mockedExecuteAgent.mock.calls[0]?.[5] as { signal?: AbortSignal } | undefined;
    expect(sixthArg?.signal).toBe(controller.signal);
  });

  it('finishReason 非 complete 时不 cache set', async () => {
    const fallbackResponse: AgentResponseEnvelope = {
      ...completeResponse,
      source: 'fallback',
      statusColor: 'warning',
      meta: { ...completeResponse.meta, finishReason: 'fallback' },
    };
    mockedExecuteAgent.mockResolvedValueOnce(fallbackResponse);
    const memoryServices = makeMemoryServices();
    const orchestrator = new AiOrchestrator({
      registry: makeRegistry(),
      metrics: makeMetrics(),
      timeoutMs: 60000,
      memoryServices,
      modelVersion: 'gpt-test',
    });

    const result = await orchestrator.execute({
      requestId: 'req-stream-4',
      sessionId: 'sess-1',
      profileId: 'profile-a',
      taskType: AgentTaskType.HOMEPAGE_SUMMARY,
      pageContext: defaultPageContext,
    });

    expect(result.meta.finishReason).toBe('fallback');
    // finishReason 非 complete 时不应写入缓存
    expect(memoryServices.cache.set).not.toHaveBeenCalled();
  });
});
