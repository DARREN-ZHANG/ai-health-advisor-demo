import { describe, it, expect, vi } from 'vitest';
import { executeAgent, type AgentRuntimeDeps } from '../agent-runtime';
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

// 辅助：把字符串切成 chunks 的 async generator，模拟 HealthAgent.stream
async function* chunksToStream(chunks: string[]): AsyncGenerator<{ content: string }> {
  for (const chunk of chunks) {
    yield { content: chunk };
  }
}

describe('executeAgent stream 分支结构信号', () => {
  it('onActionReady 按 index 递增、onForecastStarted 先于 onFutureSuggestionReady、顺序正确', async () => {
    const fullJson = JSON.stringify({
      summary: COMPLIANT_SUMMARY,
      source: 'llm',
      statusColor: 'good',
      chartTokens: ['CHART_TOKEN_HRV_7DAYS'],
      actions: [
        { id: 'action_1', emoji: '💧', title: '补水', description: '运动后补水', aiPromise: '记录' },
        { id: 'action_2', emoji: '🧘', title: '拉伸', description: '放松肌肉', aiPromise: '记录' },
      ],
      actionsSectionTitle: '今天可以这样调整',
      futureSuggestions: [
        { timePoint: '15:30', predictedState: '低谷', rationale: '咖啡因', action: { id: 'f1', emoji: '🧘', title: '呼吸', description: '深呼吸', aiPromise: '记录' } },
        { timePoint: '20:00', predictedState: '入睡困难', rationale: '晚运动', action: { id: 'f2', emoji: '🛌', title: '冥想', description: '放松', aiPromise: '记录' } },
      ],
    });
    // 每 7 字符切 chunk
    const chunks = Array.from({ length: Math.ceil(fullJson.length / 7) }, (_, i) => fullJson.slice(i * 7, i * 7 + 7));
    const deps = makeDeps({ stream: vi.fn(() => chunksToStream(chunks)) });

    const calls: string[] = [];
    const onActionReady = vi.fn((index: number) => { calls.push(`action-${index}`); });
    const onForecastStarted = vi.fn(() => { calls.push('forecast'); });
    const onFutureSuggestionReady = vi.fn((index: number) => { calls.push(`suggestion-${index}`); });

    await executeAgent(makeRequest(), deps, undefined, undefined, undefined, {
      onSummaryDelta: () => {},
      onActionReady,
      onForecastStarted,
      onFutureSuggestionReady,
    });

    expect(onActionReady).toHaveBeenCalledTimes(2);
    expect(onActionReady.mock.calls[0][0]).toBe(0);
    expect(onActionReady.mock.calls[1][0]).toBe(1);
    expect(onForecastStarted).toHaveBeenCalledTimes(1);
    expect(onFutureSuggestionReady).toHaveBeenCalledTimes(2);
    expect(onFutureSuggestionReady.mock.calls[0][0]).toBe(0);
    expect(onFutureSuggestionReady.mock.calls[1][0]).toBe(1);
    expect(calls).toEqual(['action-0', 'action-1', 'forecast', 'suggestion-0', 'suggestion-1']);
  });

  it('futureSuggestions 缺省时 onForecastStarted/onFutureSuggestionReady 不调用', async () => {
    const fullJson = JSON.stringify({
      summary: COMPLIANT_SUMMARY, source: 'llm', statusColor: 'good', chartTokens: [],
      actions: [{ id: 'a1', emoji: '💧', title: 't', description: 'd', aiPromise: 'p' }],
    });
    const deps = makeDeps({ stream: vi.fn(() => chunksToStream([fullJson])) });
    const onForecastStarted = vi.fn();
    const onFutureSuggestionReady = vi.fn();
    await executeAgent(makeRequest(), deps, undefined, undefined, undefined, {
      onSummaryDelta: () => {}, onActionReady: () => {}, onForecastStarted, onFutureSuggestionReady,
    });
    expect(onForecastStarted).not.toHaveBeenCalled();
    expect(onFutureSuggestionReady).not.toHaveBeenCalled();
  });

  it('结构回调全缺时 summary 仍正常流式（不构造 structure 提取器）', async () => {
    const chunks = [`{"summary":"${COMPLIANT_SUMMARY}","chartTokens":[],"microTips":[]}`];
    const deps = makeDeps({ stream: vi.fn(() => chunksToStream(chunks)) });
    const deltas: string[] = [];
    const result = await executeAgent(makeRequest(), deps, undefined, undefined, undefined, {
      onSummaryDelta: (d) => deltas.push(d),
    });
    expect(deltas.join('')).toBe(COMPLIANT_SUMMARY);
    expect(result.meta.finishReason).toBe('complete');
  });
});
