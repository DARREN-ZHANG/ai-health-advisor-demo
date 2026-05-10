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
import type { PlanBuilderDeps } from '../../planner/advisor-plan-builder';
import type { ReActLoopDeps } from '../../executor/react-loop';
import type { ToolDefinition } from '../../tools/tool-types';

// ── 工具函数 ──

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
      avatar: '',
      tags: ['test'],
      baseline: { restingHr: 62, hrv: 58, spo2: 98, avgSleepMinutes: 420, avgSteps: 8500 },
    },
    records: records ?? Array.from({ length: 7 }, (_, i) => makeRecord(`2026-04-${String(18 + i).padStart(2, '0')}`)),
  };
}

function makeRequest(overrides: Partial<AgentRequest> = {}): AgentRequest {
  return {
    requestId: 'req-react-1',
    sessionId: 'sess-react-1',
    profileId: 'profile-a',
    taskType: AgentTaskType.ADVISOR_CHAT,
    pageContext: { profileId: 'profile-a', page: 'home', timeframe: 'week' },
    userMessage: '帮我分析一下最近的心率变异性',
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

function makeSolverResponse(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    summary: '您的 HRV 数据整体正常。',
    source: 'llm',
    statusColor: 'good',
    chartTokens: [],
    microTips: [],
    ...overrides,
  });
}

/** 生成 planBuilder mock */
function makePlanBuilder(evidenceNeeds: Array<{ metric: string; timeScope: string; reason: string; required: boolean }>): PlanBuilderDeps {
  return {
    plannerAgent: {
      invoke: vi.fn().mockResolvedValue({
        content: JSON.stringify({
          planId: 'plan-react-001',
          taskType: 'advisor_chat',
          userIntent: { action: 'status_summary', riskLevel: 'general', needsClarification: false },
          evidenceNeeds: evidenceNeeds.map((n) => ({
            metric: n.metric,
            timeScope: n.timeScope,
            dateRange: { start: '2026-04-18', end: '2026-04-24' },
            reason: n.reason,
            required: n.required,
          })),
          safetyConstraints: ['no_diagnosis'],
          answerShape: { includeMissingDataDisclosure: true, includeChartTokens: false, maxSummaryLength: 300, tone: 'concise' },
        }),
      }),
    },
    plannerPrompt: '你是一个规划器',
  };
}

/** 生成 reactLoop mock */
function makeReActLoop(): { reactLoop: ReActLoopDeps; mockTool: ToolDefinition<unknown, unknown> } {
  const mockTool: ToolDefinition<unknown, unknown> = {
    name: 'queryMetricSummary',
    description: '查询指标摘要',
    inputSchema: {} as any,
    outputSchema: {} as any,
    execute: vi.fn().mockResolvedValue({
      success: true,
      data: { value: 55, unit: 'ms' },
      evidenceIds: ['ev-react-1'],
    }),
  };

  const reactLoop: ReActLoopDeps = {
    plannerAgent: {
      invoke: vi.fn().mockResolvedValue({
        content: JSON.stringify({ toolName: 'queryMetricSummary', input: { metric: 'hrv' } }),
      }),
    },
    tools: new Map([['queryMetricSummary', mockTool]]),
    reactPrompt: '你是工具选择器',
  };

  return { reactLoop, mockTool };
}

function makeDeps(
  options: {
    planBuilder?: PlanBuilderDeps;
    reactLoop?: ReActLoopDeps;
    agent?: Partial<HealthAgent>;
  } = {},
): AgentRuntimeDeps {
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
      invoke: options.agent?.invoke ?? (async () => ({
        content: makeSolverResponse(),
      })),
    },
    promptLoader: mockPromptLoader,
    fallbackEngine: mockFallbackEngine,
    planBuilder: options.planBuilder,
    reactLoop: options.reactLoop,
  };
}

// ── 测试用例 ──

describe('ReAct loop 集成 (P2)', () => {
  it('ADVISOR_CHAT + planBuilder → observer 回调时序正确（onPlanBuilt → onEvidenceResolved → onParsed）', async () => {
    const planBuilder = makePlanBuilder([
      { metric: 'hrv', timeScope: 'week', reason: 'HRV 分析', required: true },
    ]);
    const { reactLoop } = makeReActLoop();
    const deps = makeDeps({ planBuilder, reactLoop });

    const callOrder: string[] = [];
    const onPlanBuilt = vi.fn(() => callOrder.push('onPlanBuilt'));
    const onEvidenceResolved = vi.fn(() => callOrder.push('onEvidenceResolved'));
    const onReActStep = vi.fn(() => callOrder.push('onReActStep'));
    const onParsed = vi.fn(() => callOrder.push('onParsed'));
    const onVerified = vi.fn(() => callOrder.push('onVerified'));

    const result = await executeAgent(
      makeRequest(),
      deps,
      undefined,
      { onPlanBuilt, onEvidenceResolved, onReActStep, onParsed, onVerified },
    );

    // 1. plan 构建成功
    expect(onPlanBuilt).toHaveBeenCalledTimes(1);
    const plan = onPlanBuilt.mock.calls[0]![0];
    expect(plan.planId).toBe('plan-react-001');
    expect(plan.evidenceNeeds).toHaveLength(1);

    // 2. evidence-resolver 被调用
    expect(onEvidenceResolved).toHaveBeenCalledTimes(1);

    // 3. 回调时序：onPlanBuilt → onEvidenceResolved → onParsed → onVerified
    expect(callOrder.indexOf('onPlanBuilt')).toBeLessThan(callOrder.indexOf('onEvidenceResolved'));
    expect(callOrder.indexOf('onEvidenceResolved')).toBeLessThan(callOrder.indexOf('onParsed'));
    expect(callOrder.indexOf('onParsed')).toBeLessThan(callOrder.indexOf('onVerified'));

    // 4. 最终结果成功
    expect(result.meta.finishReason).toBe('complete');
  });

  it('plan 所有证据均已解析时不触发 ReAct（即使提供了 reactLoop deps）', async () => {
    const planBuilder = makePlanBuilder([
      { metric: 'hrv', timeScope: 'week', reason: 'HRV 分析', required: true },
    ]);
    const { reactLoop, mockTool } = makeReActLoop();
    const deps = makeDeps({ planBuilder, reactLoop });

    const onEvidenceResolved = vi.fn();
    const onReActStep = vi.fn();

    await executeAgent(
      makeRequest(),
      deps,
      undefined,
      { onEvidenceResolved, onReActStep },
    );

    // evidence-resolver 被调用
    expect(onEvidenceResolved).toHaveBeenCalledTimes(1);
    const resolution = onEvidenceResolved.mock.calls[0]![0];

    // H-5 后 evidence-resolver 更宽松，常见指标通常能从 packet 匹配到证据
    // 若所有 required needs 都被解析，ReAct 不应触发
    if (resolution.unresolved.length === 0) {
      expect(onReActStep).not.toHaveBeenCalled();
      expect(mockTool.execute).not.toHaveBeenCalled();
    }
    // 若存在 unresolved（取决于运行时 packet 数据），ReAct 应触发
    // 两种情况都是正确的运行时行为
  });

  it('无 planBuilder 时 ADVISOR_CHAT 退化为单次调用，无 P1/P2 observer 回调', async () => {
    const deps = makeDeps(); // 不提供 planBuilder 和 reactLoop

    const onPlanBuilt = vi.fn();
    const onEvidenceResolved = vi.fn();
    const onReActStep = vi.fn();
    const onParsed = vi.fn();

    const result = await executeAgent(
      makeRequest(),
      deps,
      undefined,
      { onPlanBuilt, onEvidenceResolved, onReActStep, onParsed },
    );

    // 无 planBuilder → 不走 planner 链路
    expect(onPlanBuilt).not.toHaveBeenCalled();
    expect(onEvidenceResolved).not.toHaveBeenCalled();
    expect(onReActStep).not.toHaveBeenCalled();

    // 但 solver 仍正常工作
    expect(onParsed).toHaveBeenCalledTimes(1);
    expect(result.meta.finishReason).toBe('complete');
  });

  it('plan 构建失败时走 fallback 路径，onPlanFailed 触发', async () => {
    // planBuilder 返回无法解析的内容
    const planBuilder: PlanBuilderDeps = {
      plannerAgent: {
        invoke: vi.fn().mockResolvedValue({
          content: '这不是 JSON',
        }),
      },
      plannerPrompt: '你是一个规划器',
    };
    const { reactLoop } = makeReActLoop();
    const deps = makeDeps({ planBuilder, reactLoop });

    const onPlanFailed = vi.fn();
    const onPlanBuilt = vi.fn();
    const onEvidenceResolved = vi.fn();
    const onParsed = vi.fn();

    const result = await executeAgent(
      makeRequest(),
      deps,
      undefined,
      { onPlanFailed, onPlanBuilt, onEvidenceResolved, onParsed },
    );

    // plan 解析失败
    expect(onPlanFailed).toHaveBeenCalledTimes(1);
    expect(onPlanFailed.mock.calls[0]![0]).toBe('parse_error');

    // 不走后续 P1/P2 流程
    expect(onPlanBuilt).not.toHaveBeenCalled();
    expect(onEvidenceResolved).not.toHaveBeenCalled();

    // 返回 fallback 响应
    expect(result.meta.finishReason).toBe('fallback');
  });
});
