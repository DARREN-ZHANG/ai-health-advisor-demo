import { describe, it, expect, vi } from 'vitest';
import { AiOrchestrator } from '../../services/ai-orchestrator';
import type { AgentRequest } from '@health-advisor/agent-core';
import type { AgentResponseEnvelope, PageContext } from '@health-advisor/shared';
import { AgentTaskType } from '@health-advisor/shared';

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
    incrementApiRequests: () => { calls.apiRequests = (calls.apiRequests ?? 0) + 1; },
    incrementAiTimeout: () => { calls.aiTimeout = (calls.aiTimeout ?? 0) + 1; },
    incrementFallbackUsed: () => { calls.fallbackUsed = (calls.fallbackUsed ?? 0) + 1; },
    incrementProviderError: () => { calls.providerError = (calls.providerError ?? 0) + 1; },
    recordLatency: () => {},
    snapshot: () => ({ apiRequests: {}, aiTimeouts: 0, fallbackUsed: 0, providerErrors: 0, latencyByRoute: {}, totalRequests: 0, startTime: '' }),
  };
}

const completeResponse: AgentResponseEnvelope = {
  summary: '健康状态良好',
  source: 'llm',
  statusColor: 'good',
  chartTokens: [],
  microTips: [],
  meta: { taskType: AgentTaskType.HOMEPAGE_SUMMARY, pageContext: defaultPageContext, finishReason: 'complete' },
};

describe('AiOrchestrator', () => {
  it('成功执行返回原始结果', async () => {
    mockedExecuteAgent.mockResolvedValueOnce(completeResponse);
    const metrics = makeMetrics();
    const orchestrator = new AiOrchestrator({
      registry: {} as any,
      metrics,
      timeoutMs: 6000,
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

  it('fallback 时增加 fallbackUsed 计数', async () => {
    const fallbackResponse: AgentResponseEnvelope = {
      ...completeResponse,
      source: 'fallback',
      statusColor: 'warning',
      meta: { ...completeResponse.meta, finishReason: 'fallback' },
    };
    mockedExecuteAgent.mockResolvedValueOnce(fallbackResponse);
    const metrics = makeMetrics();
    const orchestrator = new AiOrchestrator({ registry: {} as any, metrics, timeoutMs: 6000 });

    const result = await orchestrator.execute({
      requestId: 'req-2', sessionId: 'sess-1', profileId: 'profile-a',
      taskType: AgentTaskType.HOMEPAGE_SUMMARY, pageContext: defaultPageContext,
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
    const orchestrator = new AiOrchestrator({ registry: {} as any, metrics, timeoutMs: 6000 });

    const result = await orchestrator.execute({
      requestId: 'req-3', sessionId: 'sess-1', profileId: 'profile-a',
      taskType: AgentTaskType.HOMEPAGE_SUMMARY, pageContext: defaultPageContext,
    });

    expect(result.meta.finishReason).toBe('timeout');
    expect(metrics.calls.aiTimeout).toBe(1);
  });

  it('provider error 时增加 providerError 计数并抛出', async () => {
    mockedExecuteAgent.mockRejectedValueOnce(new Error('connection failed'));
    const metrics = makeMetrics();
    const orchestrator = new AiOrchestrator({ registry: {} as any, metrics, timeoutMs: 6000 });

    await expect(
      orchestrator.execute({
        requestId: 'req-4', sessionId: 'sess-1', profileId: 'profile-a',
        taskType: AgentTaskType.HOMEPAGE_SUMMARY, pageContext: defaultPageContext,
      }),
    ).rejects.toThrow('connection failed');

    expect(metrics.calls.providerError).toBe(1);
  });
});
