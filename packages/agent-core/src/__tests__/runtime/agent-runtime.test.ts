import { describe, it, expect, vi } from 'vitest';
import { executeAgent, type AgentRuntimeDeps } from '../../runtime/agent-runtime';
import type { AgentRequest } from '../../types/agent-request';
import type { HealthAgent } from '../../executor/create-agent';
import type { PromptLoader } from '../../prompts/prompt-loader';
import type { FallbackEngine } from '../../fallback/fallback-engine';
import type { ProfileData, DailyRecord } from '@health-advisor/shared';
import type { DatedEvent } from '@health-advisor/sandbox';
import { AgentTaskType, ChartTokenId } from '@health-advisor/shared';
import { InMemorySessionMemoryStore } from '../../memory/session-memory-store';
import { InMemoryAnalyticalMemoryStore } from '../../memory/analytical-memory-store';

function makeRecord(date: string, overrides: Partial<DailyRecord> = {}): DailyRecord {
  return {
    date,
    hr: [60, 62],
    hrv: 58,
    sleep: { totalMinutes: 420, startTime: '23:00', endTime: '06:00', stages: { deep: 90, light: 180, rem: 120, awake: 30 }, score: 85 },
    activity: { steps: 8000, calories: 2200, activeMinutes: 45, distanceKm: 5.5 },
    spo2: 98,
    stress: { load: 30 },
    ...overrides,
  };
}

function makeProfileData(records?: DailyRecord[]): ProfileData {
  return {
    profile: {
      profileId: 'profile-a',
      name: '张健康',
      age: 32,
      gender: 'male',
      avatar: '👨‍💻',
      tags: ['test'],
      baseline: { restingHr: 62, hrv: 58, spo2: 98, avgSleepMinutes: 420, avgSteps: 8500 },
    },
    records: records ?? Array.from({ length: 7 }, (_, i) => makeRecord(`2026-04-${String(18 + i).padStart(2, '0')}`)),
  };
}

function makeRequest(overrides: Partial<AgentRequest> = {}): AgentRequest {
  return {
    requestId: 'req-1',
    sessionId: 'sess-1',
    profileId: 'profile-a',
    taskType: AgentTaskType.HOMEPAGE_SUMMARY,
    pageContext: { profileId: 'profile-a', page: 'home', timeframe: 'week' },
    ...overrides,
  };
}

const mockPromptLoader: PromptLoader = {
  load: (name) => {
    const templates: Record<string, string> = {
      system: '你是一位健康顾问',
      homepage: '请生成首页摘要',
      'view-summary': '请生成视图总结',
      'advisor-chat': '请进行健康对话',
    };
    return templates[name] ?? '';
  },
  loadStyle: () => '',
  listAvailable: () => ['system', 'homepage', 'view-summary', 'advisor-chat'],
};

const mockFallbackEngine: FallbackEngine = {
  getFallback: (taskType, key) => ({
    summary: '健康数据正在分析中。',
    source: 'fallback',
    statusColor: 'warning' as const,
    chartTokens: [],
    microTips: ['请稍后再试'],
    meta: { taskType, pageContext: key.pageContext, finishReason: 'fallback' as const },
  }),
};

function makeDeps(agent: Partial<HealthAgent> = {}): AgentRuntimeDeps {
  const data = makeProfileData();
  return {
    getProfile: () => data,
    selectByTimeframe: (records: DailyRecord[]) => records,
    applyOverrides: (records: DailyRecord[]) => records,
    mergeEvents: (base: DatedEvent[], injected: DatedEvent[]) => [...base, ...injected],
    sessionMemory: new InMemorySessionMemoryStore(),
    analyticalMemory: new InMemoryAnalyticalMemoryStore(),
    getActiveOverrides: () => [],
    getInjectedEvents: () => [],
    referenceDate: '2026-04-24',
    agent: {
      invoke: agent.invoke ?? (async () => ({
        content: JSON.stringify({
          summary: '整体状态良好。',
          chartTokens: [ChartTokenId.HRV_7DAYS],
          microTips: ['保持规律作息'],
        }),
      })),
    },
    promptLoader: mockPromptLoader,
    fallbackEngine: mockFallbackEngine,
  };
}

describe('executeAgent', () => {
  it('成功执行并返回结构化响应', async () => {
    const result = await executeAgent(makeRequest(), makeDeps());

    expect(result.summary).toBe('整体状态良好。');
    expect(result.chartTokens).toEqual([ChartTokenId.HRV_7DAYS]);
    expect(result.microTips).toEqual(['保持规律作息']);
    expect(result.meta.finishReason).toBe('complete');
  });

  it('模型返回非法 JSON 时回退到 fallback', async () => {
    const deps = makeDeps({
      invoke: async () => ({ content: '这不是 JSON' }),
    });

    const result = await executeAgent(makeRequest(), deps);

    expect(result.meta.finishReason).toBe('fallback');
  });

  it('模型超时时回退到 fallback', async () => {
    const deps = makeDeps({
      invoke: async () => new Promise(() => {}), // 永不返回
    });

    const result = await executeAgent(makeRequest(), deps, 50);

    expect(result.meta.finishReason).toBe('timeout');
  });

  it('模型抛错时回退到 fallback', async () => {
    const deps = makeDeps({
      invoke: async () => { throw new Error('provider error'); },
    });

    const result = await executeAgent(makeRequest(), deps);

    expect(result.meta.finishReason).toBe('fallback');
  });

  it('advisor_chat 任务正确传递 userMessage', async () => {
    const invokeMock = vi.fn(async () => ({
      content: JSON.stringify({
        summary: '回复',
        chartTokens: [],
        microTips: [],
      }),
    }));
    const deps = makeDeps({ invoke: invokeMock });

    await executeAgent(
      makeRequest({
        taskType: AgentTaskType.ADVISOR_CHAT,
        userMessage: '最近感觉怎样',
      }),
      deps,
    );

    expect(invokeMock).toHaveBeenCalled();
    expect((invokeMock.mock.calls as unknown as Array<Array<{ userPrompt: string }>>)[0]![0]!.userPrompt).toContain('最近感觉怎样');
  });

  it('view_summary 任务使用 tab 上下文', async () => {
    const invokeMock = vi.fn(async () => ({
      content: JSON.stringify({
        summary: 'HRV 稳定',
        chartTokens: [ChartTokenId.HRV_7DAYS],
        microTips: [],
      }),
    }));
    const deps = makeDeps({ invoke: invokeMock });

    await executeAgent(
      makeRequest({
        taskType: AgentTaskType.VIEW_SUMMARY,
        tab: 'hrv',
        timeframe: 'week',
        pageContext: { profileId: 'profile-a', page: 'data-center', dataTab: 'hrv', timeframe: 'week' },
      }),
      deps,
    );

    expect(invokeMock).toHaveBeenCalled();
    expect((invokeMock.mock.calls as unknown as Array<Array<{ userPrompt: string }>>)[0]![0]!.userPrompt).toContain('hrv');
  });

  it('response 包含正确的 taskType 和 pageContext', async () => {
    const result = await executeAgent(makeRequest(), makeDeps());

    expect(result.meta.taskType).toBe(AgentTaskType.HOMEPAGE_SUMMARY);
    expect(result.meta.pageContext.profileId).toBe('profile-a');
    expect(result.meta.pageContext.page).toBe('home');
  });

  it('非法 chartToken 被过滤', async () => {
    const deps = makeDeps({
      invoke: async () => ({
        content: JSON.stringify({
          summary: '测试',
          chartTokens: [ChartTokenId.HRV_7DAYS, 'INVALID_TOKEN'],
          microTips: [],
        }),
      }),
    });

    const result = await executeAgent(makeRequest(), deps);

    expect(result.chartTokens).toEqual([ChartTokenId.HRV_7DAYS]);
    expect(result.meta.finishReason).toBe('complete');
  });

  it('低数据量时直接走 fallback 不调用 LLM', async () => {
    const invokeMock = vi.fn(async () => ({
      content: JSON.stringify({ summary: '不应被调用', chartTokens: [], microTips: [] }),
    }));
    // 只有 1 条记录，低于 LOW_DATA_THRESHOLD (3)
    const fewRecords = [makeRecord('2026-04-18')];
    const deps = makeDepsFromRecords(fewRecords, { invoke: invokeMock });

    const result = await executeAgent(makeRequest(), deps);

    expect(result.meta.finishReason).toBe('fallback');
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('成功执行后写回 session memory', async () => {
    const deps = makeDeps();
    await executeAgent(
      makeRequest({
        taskType: AgentTaskType.ADVISOR_CHAT,
        userMessage: '最近感觉怎样',
      }),
      deps,
    );

    const messages = deps.sessionMemory.getRecentMessages('sess-1');
    expect(messages.length).toBeGreaterThanOrEqual(2);
    expect(messages.some((m) => m.role === 'user' && m.text === '最近感觉怎样')).toBe(true);
    expect(messages.some((m) => m.role === 'assistant')).toBe(true);
  });

  it('homepage 任务成功后写回 analytical memory brief', async () => {
    const deps = makeDeps();
    await executeAgent(makeRequest(), deps);

    const memory = deps.analyticalMemory.get('sess-1');
    expect(memory?.latestHomepageBrief).toBeTruthy();
  });

  it('view_summary 任务成功后写回 analytical memory view summary', async () => {
    const deps = makeDeps();
    await executeAgent(
      makeRequest({
        taskType: AgentTaskType.VIEW_SUMMARY,
        tab: 'hrv',
        timeframe: 'week',
        pageContext: { profileId: 'profile-a', page: 'data-center', dataTab: 'hrv', timeframe: 'week' },
      }),
      deps,
    );

    const memory = deps.analyticalMemory.get('sess-1');
    expect(memory?.latestViewSummaryByScope?.['hrv:week']).toBeTruthy();
  });
});

function makeDepsFromRecords(
  records: DailyRecord[],
  agentOverrides: Partial<HealthAgent> = {},
): AgentRuntimeDeps {
  const data = makeProfileData(records);
  return {
    getProfile: () => data,
    selectByTimeframe: (r: DailyRecord[]) => r,
    applyOverrides: (r: DailyRecord[]) => r,
    mergeEvents: (base: DatedEvent[], injected: DatedEvent[]) => [...base, ...injected],
    sessionMemory: new InMemorySessionMemoryStore(),
    analyticalMemory: new InMemoryAnalyticalMemoryStore(),
    getActiveOverrides: () => [],
    getInjectedEvents: () => [],
    referenceDate: '2026-04-24',
    agent: {
      invoke: agentOverrides.invoke ?? (async () => ({
        content: JSON.stringify({
          summary: '整体状态良好。',
          chartTokens: [ChartTokenId.HRV_7DAYS],
          microTips: ['保持规律作息'],
        }),
      })),
    },
    promptLoader: mockPromptLoader,
    fallbackEngine: mockFallbackEngine,
  };
}

describe('executeAgent observer', () => {
  it('成功路径触发 onContextBuilt / onRulesEvaluated / onPromptBuilt / onModelOutput / onParsed', async () => {
    const onContextBuilt = vi.fn();
    const onRulesEvaluated = vi.fn();
    const onPromptBuilt = vi.fn();
    const onModelOutput = vi.fn();
    const onParsed = vi.fn();
    const onFallback = vi.fn();

    await executeAgent(
      makeRequest(),
      makeDeps(),
      undefined,
      { onContextBuilt, onRulesEvaluated, onPromptBuilt, onModelOutput, onParsed, onFallback },
    );

    expect(onContextBuilt).toHaveBeenCalledTimes(1);
    expect(onRulesEvaluated).toHaveBeenCalledTimes(1);
    expect(onPromptBuilt).toHaveBeenCalledTimes(1);
    expect(onModelOutput).toHaveBeenCalledTimes(1);
    expect(onParsed).toHaveBeenCalledTimes(1);
    expect(onFallback).not.toHaveBeenCalled();
  });

  it('onParsed 接收到的 envelope 包含正确的 summary', async () => {
    let parsedEnvelope: any = null;
    await executeAgent(
      makeRequest(),
      makeDeps(),
      undefined,
      {
        onParsed: (envelope) => { parsedEnvelope = envelope; },
      },
    );

    expect(parsedEnvelope).toBeTruthy();
    expect(parsedEnvelope.summary).toBe('整体状态良好。');
    expect(parsedEnvelope.meta.finishReason).toBe('complete');
  });

  it('非法 JSON 触发 onFallback("invalid_output")', async () => {
    const onFallback = vi.fn();
    const onContextBuilt = vi.fn();
    const onRulesEvaluated = vi.fn();
    const onPromptBuilt = vi.fn();
    const onModelOutput = vi.fn();
    const onParsed = vi.fn();

    const deps = makeDeps({
      invoke: async () => ({ content: '这不是 JSON' }),
    });

    await executeAgent(
      makeRequest(),
      deps,
      undefined,
      { onContextBuilt, onRulesEvaluated, onPromptBuilt, onModelOutput, onParsed, onFallback },
    );

    expect(onFallback).toHaveBeenCalledWith('invalid_output');
    expect(onParsed).not.toHaveBeenCalled();
    expect(onContextBuilt).toHaveBeenCalledTimes(1);
    expect(onRulesEvaluated).toHaveBeenCalledTimes(1);
    expect(onPromptBuilt).toHaveBeenCalledTimes(1);
    expect(onModelOutput).toHaveBeenCalledTimes(1);
  });

  it('超时触发 onFallback("timeout")', async () => {
    const onFallback = vi.fn();
    const onParsed = vi.fn();

    const deps = makeDeps({
      invoke: async () => new Promise(() => {}), // 永不返回
    });

    await executeAgent(
      makeRequest(),
      deps,
      50,
      { onFallback, onParsed },
    );

    expect(onFallback).toHaveBeenCalledWith('timeout');
    expect(onParsed).not.toHaveBeenCalled();
  });

  it('provider 抛错触发 onFallback("provider_error")', async () => {
    const onFallback = vi.fn();
    const onParsed = vi.fn();

    const deps = makeDeps({
      invoke: async () => { throw new Error('provider error'); },
    });

    await executeAgent(
      makeRequest(),
      deps,
      undefined,
      { onFallback, onParsed },
    );

    expect(onFallback).toHaveBeenCalledWith('provider_error');
    expect(onParsed).not.toHaveBeenCalled();
  });

  it('低数据量触发 onFallback("low_data")', async () => {
    const onFallback = vi.fn();
    const onRulesEvaluated = vi.fn();
    const onParsed = vi.fn();
    const invokeMock = vi.fn(async () => ({
      content: JSON.stringify({ summary: '不应被调用', chartTokens: [], microTips: [] }),
    }));
    // 只有 1 条记录，低于 LOW_DATA_THRESHOLD (3)
    const fewRecords = [makeRecord('2026-04-18')];
    const deps = makeDepsFromRecords(fewRecords, { invoke: invokeMock });

    await executeAgent(
      makeRequest(),
      deps,
      undefined,
      { onFallback, onRulesEvaluated, onParsed },
    );

    expect(onFallback).toHaveBeenCalledWith('low_data');
    expect(onRulesEvaluated).not.toHaveBeenCalled();
    expect(onParsed).not.toHaveBeenCalled();
  });

  it('observer 抛错不影响生产执行', async () => {
    const errorObserver = {
      onContextBuilt: () => { throw new Error('observer error'); },
      onRulesEvaluated: () => { throw new Error('observer error'); },
      onPromptBuilt: () => { throw new Error('observer error'); },
      onModelOutput: () => { throw new Error('observer error'); },
      onParsed: () => { throw new Error('observer error'); },
    };

    // 即使所有 observer 都抛错，executeAgent 仍正常返回
    const result = await executeAgent(
      makeRequest(),
      makeDeps(),
      undefined,
      errorObserver,
    );

    expect(result.summary).toBe('整体状态良好。');
    expect(result.meta.finishReason).toBe('complete');
  });
});
