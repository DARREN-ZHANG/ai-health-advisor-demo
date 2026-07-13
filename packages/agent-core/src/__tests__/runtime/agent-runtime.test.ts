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

/** Task 3.3: 测试用合规 summary（满足 zh 220-420 grapheme 区间） */
const COMPLIANT_SUMMARY =
  '今天整体状态良好，各项生理指标处于稳定区间。夜间睡眠时长充足，深睡与浅睡比例合理，晨起恢复状况良好；白天活动量适中，心率与血氧饱和度保持在正常水平，压力负荷处于较低区间。当前没有出现明显的生理异常或需要关注的事件，身体处于稳态。建议继续保持规律的作息安排与均衡饮食结构，适当安排户外散步或轻度运动，以维持当前的稳态并促进长期健康。如出现任何不适或数据异常，请及时咨询专业医疗人员获取准确的评估和指导。今日可关注夜间睡眠质量与明日晨起准备度之间的关联。';

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
          summary: COMPLIANT_SUMMARY,
          chartTokens: [ChartTokenId.HRV_7DAYS],
          microTips: ['保持规律作息'],
        }),
      })),
      // stream 默认与 invoke 返回相同内容（按 chunk 切分），便于测试覆盖
      stream: agent.stream,
    } as HealthAgent,
    promptLoader: mockPromptLoader,
    fallbackEngine: mockFallbackEngine,
  };
}

describe('executeAgent', () => {
  it('成功执行并返回结构化响应', async () => {
    const result = await executeAgent(makeRequest(), makeDeps());

    expect(result.summary).toBe(COMPLIANT_SUMMARY);
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
          summary: COMPLIANT_SUMMARY,
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

  it('homepage summary appends realtime tool evidence packet when caffeine event exists', async () => {
    const invokeMock = vi.fn(async () => ({
      content: JSON.stringify({
        summary: COMPLIANT_SUMMARY,
        chartTokens: [ChartTokenId.HRV_7DAYS],
        microTips: [],
      }),
    }));
    const deps = makeDeps({ invoke: invokeMock });

    await executeAgent(
      makeRequest(),
      deps,
      5_000,
      {
        onPacketBuilt(packet) {
          packet.homepage!.recentEvents.push({
            type: 'possible_caffeine_intake',
            start: '2026-04-24T16:00',
            end: '2026-04-24T18:00',
            durationMin: 120,
            confidence: 0.84,
            syncState: {
              lastSyncedMeasuredAt: '2026-04-24T18:00',
              pendingEventCount: 0,
              fromSyncedWindow: true,
            },
            evidenceIds: ['event-caffeine-runtime'],
          });
        },
      },
    );

    const userPrompt = (invokeMock.mock.calls as unknown as Array<Array<{ userPrompt: string }>>)[0]![0]!.userPrompt;
    // Task 3.2：LLM 只能看到 PublicToolClaim.summary（客户可用结论），看不到 toolName/policyId/算法常量
    expect(userPrompt).toContain('## 工具结论');
    expect(userPrompt).toContain('估算');
    // 内部执行元数据不得进入 solver prompt
    expect(userPrompt).not.toContain('estimateCaffeineSleepImpact');
    expect(userPrompt).not.toContain('policyId');
    expect(userPrompt).not.toContain('## 工具证据包');
    // 不出现"没有算法"/"无法估算"/"ring cannot measure" 等元说明
    expect(userPrompt).not.toContain('没有算法');
    expect(userPrompt).not.toContain('不是血液化学实测');
    expect(userPrompt).not.toContain('halfLifeHours');
    expect(userPrompt).not.toContain('eliminationRateK');
  });

  it('homepage summary stays silent on realtime tools when no trigger policy matches', async () => {
    const invokeMock = vi.fn(async () => ({
      content: JSON.stringify({
        summary: COMPLIANT_SUMMARY,
        chartTokens: [ChartTokenId.HRV_7DAYS],
        microTips: [],
      }),
    }));
    const deps = makeDeps({ invoke: invokeMock });

    await executeAgent(makeRequest(), deps);

    const userPrompt = (invokeMock.mock.calls as unknown as Array<Array<{ userPrompt: string }>>)[0]![0]!.userPrompt;
    // 无工具匹配时，solver prompt 不应出现任何工具章节
    expect(userPrompt).not.toContain('## 工具证据包');
    expect(userPrompt).not.toContain('## 工具结论');
    expect(userPrompt).not.toContain('estimateCaffeineSleepImpact');
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
          summary: COMPLIANT_SUMMARY,
          chartTokens: [ChartTokenId.HRV_7DAYS],
          microTips: ['保持规律作息'],
        }),
      })),
      stream: agentOverrides.stream,
    } as HealthAgent,
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
    expect(parsedEnvelope.summary).toBe(COMPLIANT_SUMMARY);
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

    expect(result.summary).toBe(COMPLIANT_SUMMARY);
    expect(result.meta.finishReason).toBe('complete');
  });
});

// 辅助：把字符串切成 chunks 的 async generator，模拟 HealthAgent.stream
async function* chunksToStream(chunks: string[]): AsyncGenerator<{ content: string }> {
  for (const chunk of chunks) {
    yield { content: chunk };
  }
}

describe('executeAgent streaming', () => {
  it('delta 顺序正确且拼接等于 summary（stream 分支）', async () => {
    // 构造合法 JSON，summary 分散在多个 chunk 中
    const fullSummary = '整体状态良好，继续保持。';
    const fullJson = JSON.stringify({
      summary: fullSummary,
      chartTokens: [ChartTokenId.HRV_7DAYS],
      microTips: [],
    });
    // 切成多个 chunk（在 summary 值中间切，确保 extractor 增量释放 delta）
    const chunks = [
      '{"summary":"',
      '整体',
      '状态良好，',
      '继续保持。',
      `","chartTokens":["${ChartTokenId.HRV_7DAYS}"],"microTips":[]}`,
    ];
    const streamMock = vi.fn(() => chunksToStream(chunks));
    const deps = makeDeps({ stream: streamMock });

    const receivedDeltas: string[] = [];
    const result = await executeAgent(
      makeRequest(),
      deps,
      undefined,
      undefined,
      undefined,
      { onSummaryDelta: (delta) => { receivedDeltas.push(delta); } },
    );

    // delta 按模型 chunk 顺序到达
    expect(receivedDeltas).toEqual(['整体', '状态良好，', '继续保持。']);
    expect(receivedDeltas.join('')).toBe(fullSummary);
    // stream 被调用（而非 invoke）
    expect(streamMock).toHaveBeenCalled();
    // 最终 envelope 正常（raw 经过 parseAgentResponse）
    expect(result.summary).toBe(fullSummary);
    expect(result.meta.finishReason).toBe('complete');
    expect(fullJson).toContain(fullSummary);
  });

  it('raw 仍通过现有 parser，envelope 结构正确', async () => {
    // stream 产出完整合法 JSON，验证最终 envelope 的所有字段
    const chunks = [
      '{"summary":"测试摘要","chartTokens":["',
      ChartTokenId.HRV_7DAYS,
      '"],"microTips":["多喝水"]}',
    ];
    const deps = makeDeps({ stream: vi.fn(() => chunksToStream(chunks)) });

    const result = await executeAgent(
      makeRequest(),
      deps,
      undefined,
      undefined,
      undefined,
      { onSummaryDelta: () => {} },
    );

    expect(result.summary).toBe('测试摘要');
    expect(result.chartTokens).toEqual([ChartTokenId.HRV_7DAYS]);
    expect(result.microTips).toEqual(['多喝水']);
    expect(result.meta.finishReason).toBe('complete');
    expect(result.meta.taskType).toBe(AgentTaskType.HOMEPAGE_SUMMARY);
  });

  it('callback 背压被 await（async callback 完成后才继续下一个 delta）', async () => {
    // 用一个 async callback + 计数器验证 runtime 确实 await 了每个 delta
    const chunks = [
      '{"summary":"',
      '第一段',
      '第二段',
      '第三段',
      '"}',
    ];
    const order: string[] = [];
    let pendingId = 0;
    const deps = makeDeps({ stream: vi.fn(() => chunksToStream(chunks)) });

    await executeAgent(
      makeRequest(),
      deps,
      undefined,
      undefined,
      undefined,
      {
        // 异步 callback：记录调用顺序 + 标记完成顺序，验证 backpressure
        onSummaryDelta: (delta) => {
          const id = pendingId++;
          order.push(`start-${id}-${delta}`);
          return new Promise<void>((resolve) => {
            // 用 microtask 模拟异步完成
            queueMicrotask(() => {
              order.push(`end-${id}-${delta}`);
              resolve();
            });
          });
        },
      },
    );

    // 若 runtime 没 await，会出现 start-1 在 end-0 之前（乱序）
    // 正确 await 时：start-0 end-0 start-1 end-1 ... 严格交替
    expect(order).toEqual([
      'start-0-第一段',
      'end-0-第一段',
      'start-1-第二段',
      'end-1-第二段',
      'start-2-第三段',
      'end-2-第三段',
    ]);
  });

  it('预 aborted signal 停止 provider 迭代（不产生完整输出）', async () => {
    // 当外部 signal 已 aborted，合并后的 signal 也应立即 aborted，
    // stream 迭代器据此中断（模拟 LangChain 行为：signal aborted 时抛错）
    let receivedSignal: AbortSignal | undefined;
    let iteratedChunks = 0;
    async function* streamWithGate(signal: AbortSignal): AsyncGenerator<{ content: string }> {
      receivedSignal = signal;
      // 模拟 LangChain 行为：signal abort 后抛错，不继续 yield
      for (const ch of ['{"summary":"不应完整消费"}']) {
        if (signal.aborted) {
          throw new DOMException('aborted', 'AbortError');
        }
        iteratedChunks++;
        yield { content: ch };
      }
    }
    const deps = makeDeps({
      stream: vi.fn((_input: { signal?: AbortSignal }) => streamWithGate(_input.signal!)),
    });

    // 外部预 aborted signal
    const abortController = new AbortController();
    abortController.abort();

    const result = await executeAgent(
      makeRequest(),
      deps,
      undefined,
      undefined,
      undefined,
      {
        signal: abortController.signal,
        onSummaryDelta: () => {},
      },
    );

    // 验证 signal 被传入 stream，且合并后立即 aborted（AbortSignal.any 行为）
    expect(receivedSignal).toBeDefined();
    expect(receivedSignal!.aborted).toBe(true);
    // 迭代器在第一个 chunk 之前就因 abort 抛错，没有消费任何 chunk
    expect(iteratedChunks).toBe(0);
    // -> 走 catch 块 provider_error -> fallback envelope（finishReason 非 complete）
    expect(result.meta.finishReason).not.toBe('complete');
  });

  it('stream 产出非法 JSON 时不写 memory（extractor.finish 抛错走 fallback）', async () => {
    // stream 产出截断的 JSON：extractor.push 会释放 provisional delta（summary 字符串在推进），
    // 但 extractor.finish() 会抛 StreamingSummaryParseError（字符串未闭合）。
    // 这个 error 向上抛到 executeAgent 的 catch 块，走 provider_error 分支。
    const truncatedChunks = ['{"summary":"部分内容', '但 JSON 没闭合'];
    const streamMock = vi.fn(() => chunksToStream(truncatedChunks));
    const deps = makeDeps({ stream: streamMock });

    const receivedDeltas: string[] = [];
    const result = await executeAgent(
      makeRequest(),
      deps,
      undefined,
      undefined,
      undefined,
      { onSummaryDelta: (delta) => { receivedDeltas.push(delta); } },
    );

    // provisional delta 已经释放（extractor 在 push 阶段释放，finish 才抛错）
    expect(receivedDeltas).toEqual(['部分内容', '但 JSON 没闭合']);
    // finishReason 非 complete（fallback）
    expect(result.meta.finishReason).not.toBe('complete');
    // session memory 不应被写入（因为没到 writeSessionMemory 步骤）
    const messages = deps.sessionMemory.getRecentMessages('sess-1');
    expect(messages.length).toBe(0);
    // analytical memory 也不应被写入
    const analytical = deps.analyticalMemory.get('sess-1');
    expect(analytical?.latestHomepageBrief).toBeUndefined();
  });

  it('customer policy 失败时 provisional delta 已发出但 memory 不写入', async () => {
    // 场景：stream 产出合法 JSON（extractor.finish 通过，summary delta 已释放），
    // 但整体结构让 parseAgentResponse 失败（如 statusColor 非法值）。
    // 这是 customer policy 失败的典型场景：第一轮 provisional delta 可以出现，
    // 但最终 envelope 不合法，返回 fallback（finishReason 非 complete），memory 不写入。
    const chunks = [
      '{"summary":"第一轮 delta 已发出","chartTokens":[],"statusColor":"INVALID_COLOR"}',
    ];
    const deps = makeDeps({ stream: vi.fn(() => chunksToStream(chunks)) });

    const receivedDeltas: string[] = [];
    const result = await executeAgent(
      makeRequest(),
      deps,
      undefined,
      undefined,
      undefined,
      { onSummaryDelta: (delta) => { receivedDeltas.push(delta); } },
    );

    // provisional delta 已经发出
    expect(receivedDeltas).toEqual(['第一轮 delta 已发出']);
    // 但最终 parse 失败（statusColor 非法）→ fallback envelope（finishReason 非 complete）
    expect(result.meta.finishReason).not.toBe('complete');
    // memory 不应被写入
    const messages = deps.sessionMemory.getRecentMessages('sess-1');
    expect(messages.length).toBe(0);
    const analytical = deps.analyticalMemory.get('sess-1');
    expect(analytical?.latestHomepageBrief).toBeUndefined();
  });

  it('非 HOMEPAGE_SUMMARY 任务即使传 onSummaryDelta 也走 invoke 分支', async () => {
    const invokeMock = vi.fn(async () => ({
      content: JSON.stringify({
        summary: 'HRV 稳定',
        chartTokens: [ChartTokenId.HRV_7DAYS],
        microTips: [],
      }),
    }));
    const streamMock = vi.fn(() => chunksToStream(['should-not-be-called']));
    const deps = makeDeps({ invoke: invokeMock, stream: streamMock });

    const onSummaryDelta = vi.fn();
    await executeAgent(
      makeRequest({
        taskType: AgentTaskType.VIEW_SUMMARY,
        tab: 'hrv',
        timeframe: 'week',
        pageContext: { profileId: 'profile-a', page: 'data-center', dataTab: 'hrv', timeframe: 'week' },
      }),
      deps,
      undefined,
      undefined,
      undefined,
      { onSummaryDelta },
    );

    // VIEW_SUMMARY 即使传了 onSummaryDelta，也走 invoke 分支
    expect(invokeMock).toHaveBeenCalled();
    expect(streamMock).not.toHaveBeenCalled();
    expect(onSummaryDelta).not.toHaveBeenCalled();
  });

  it('未传 onSummaryDelta 时 HOMEPAGE_SUMMARY 走 invoke 分支（向后兼容）', async () => {
    const invokeMock = vi.fn(async () => ({
      content: JSON.stringify({
        summary: '向后兼容',
        chartTokens: [],
        microTips: [],
      }),
    }));
    const streamMock = vi.fn(() => chunksToStream(['should-not-be-called']));
    const deps = makeDeps({ invoke: invokeMock, stream: streamMock });

    // HOMEPAGE_SUMMARY 但不传 options 或 options.onSummaryDelta
    const result = await executeAgent(makeRequest(), deps);

    expect(invokeMock).toHaveBeenCalled();
    expect(streamMock).not.toHaveBeenCalled();
    expect(result.meta.finishReason).toBe('complete');
    expect(result.summary).toBe('向后兼容');
  });
});
