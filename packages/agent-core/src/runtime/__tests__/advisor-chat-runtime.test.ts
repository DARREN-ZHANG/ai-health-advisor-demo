/**
 * P1 ADVISOR_CHAT planner 链路集成测试
 *
 * 验证 planner 接入 runtime 后的行为：
 * 1. ADVISOR_CHAT + planBuilder 成功 → solver 被调用 → taskPrompt 包含 plan 上下文
 * 2. ADVISOR_CHAT + needsClarification → 直接返回 clarification → solver 不被调用
 * 3. ADVISOR_CHAT + plan 失败 → 返回 fallback 响应 → solver 不被调用
 * 4. ADVISOR_CHAT + 无 planBuilder → 退化为原有模式 → solver 被直接调用
 * 5. HOMEPAGE_SUMMARY + planBuilder → 不受影响 → 不触发 planner
 * 6. Observer 回调时序：onPlanBuilt → onPromptBuilt → onModelOutput → onParsed → onVerified
 * 7. Plan 失败 observer：onPlanFailed 被调用
 * 8. Clarification observer：onClarification 被调用
 */
import { describe, it, expect, vi } from 'vitest';
import { executeAgent, type AgentRuntimeDeps, type AgentRuntimeObserver } from '../agent-runtime';
import type { AgentRequest } from '../../types/agent-request';
import type { HealthAgent } from '../../executor/create-agent';
import type { PromptLoader } from '../../prompts/prompt-loader';
import type { FallbackEngine } from '../../fallback/fallback-engine';
import type { PlanBuilderDeps } from '../../planner/advisor-plan-builder';
import type { AnalysisPlan } from '../../planner/analysis-plan';
import type { ToolDefinition, ToolResult } from '../../tools/tool-types';
import type { WebSearchInput, WebSearchOutput } from '../../tools/web-search';
import type { ProfileData, DailyRecord } from '@health-advisor/shared';
import type { DatedEvent } from '@health-advisor/sandbox';
import { AgentTaskType, ChartTokenId } from '@health-advisor/shared';
import { InMemorySessionMemoryStore } from '../../memory/session-memory-store';
import { InMemoryAnalyticalMemoryStore } from '../../memory/analytical-memory-store';

// ── 测试辅助函数 ──────────────────────────────────────

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

function makeAdvisorChatRequest(overrides: Partial<AgentRequest> = {}): AgentRequest {
  return {
    requestId: 'req-advisor-1',
    sessionId: 'sess-advisor-1',
    profileId: 'profile-a',
    taskType: AgentTaskType.ADVISOR_CHAT,
    pageContext: { profileId: 'profile-a', page: 'advisor', timeframe: 'week' },
    userMessage: '我最近的睡眠怎么样？',
    ...overrides,
  };
}

function makeHomepageRequest(overrides: Partial<AgentRequest> = {}): AgentRequest {
  return {
    requestId: 'req-home-1',
    sessionId: 'sess-home-1',
    profileId: 'profile-a',
    taskType: AgentTaskType.HOMEPAGE_SUMMARY,
    pageContext: { profileId: 'profile-a', page: 'home', timeframe: 'week' },
    ...overrides,
  };
}

function makeViewSummaryRequest(overrides: Partial<AgentRequest> = {}): AgentRequest {
  return {
    requestId: 'req-view-1',
    sessionId: 'sess-view-1',
    profileId: 'profile-a',
    taskType: AgentTaskType.VIEW_SUMMARY,
    pageContext: { profileId: 'profile-a', page: 'view', timeframe: 'week', dataTab: 'hrv' },
    tab: 'hrv',
    timeframe: 'week',
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

/** 构造一个合法的 AnalysisPlan */
function makeAnalysisPlan(overrides: Partial<AnalysisPlan> = {}): AnalysisPlan {
  return {
    planId: 'plan-001',
    taskType: 'advisor_chat',
    userIntent: {
      action: 'status_summary',
      riskLevel: 'general',
      needsClarification: false,
      clarificationQuestion: undefined,
    },
    evidenceNeeds: [
      { metric: 'sleep', timeScope: 'week', reason: '用户询问近一周睡眠质量', required: true },
    ],
    safetyConstraints: ['no_diagnosis'],
    answerShape: {
      includeMissingDataDisclosure: true,
      includeChartTokens: true,
      maxSummaryLength: 300,
      tone: 'concise',
    },
    ...overrides,
  };
}

/** 构造 deps，可注入 planBuilder 和 webSearch */
function makeDeps(
  agentOverrides: Partial<HealthAgent> = {},
  planBuilder?: PlanBuilderDeps,
  webSearch?: {
    tool?: ToolDefinition<WebSearchInput, WebSearchOutput>;
    maxResults?: number;
  },
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
      invoke: agentOverrides.invoke ?? (async () => ({
        content: JSON.stringify({
          summary: '您最近一周睡眠质量总体良好，平均睡眠时长约7小时。',
          chartTokens: [ChartTokenId.SLEEP_7DAYS],
          microTips: ['建议保持规律的作息时间'],
        }),
      })),
    },
    promptLoader: mockPromptLoader,
    fallbackEngine: mockFallbackEngine,
    planBuilder,
    webSearchTool: webSearch?.tool,
    webSearchConfig: webSearch ? { enabled: Boolean(webSearch.tool), maxResults: webSearch.maxResults ?? 3 } : undefined,
  };
}

/** 构造 mock planBuilder，控制 buildAnalysisPlanWithRetry 的行为 */
function makePlanBuilderDeps(planResult: { success: boolean; plan?: AnalysisPlan; parseError?: string }) {
  const plannerInvoke = vi.fn(async () => ({
    content: planResult.success && planResult.plan
      ? JSON.stringify(planResult.plan)
      : 'invalid json {{{',
  }));

  const deps: PlanBuilderDeps = {
    plannerAgent: { invoke: plannerInvoke },
    plannerPrompt: '你是一个健康数据分析规划师',
  };
  return { deps, plannerInvoke };
}

function makeWebSearchTool(
  result: ToolResult<WebSearchOutput>,
): ToolDefinition<WebSearchInput, WebSearchOutput> {
  return {
    name: 'webSearch',
    description: 'test web search',
    inputSchema: { parse: (value: WebSearchInput) => value } as never,
    outputSchema: { parse: (value: WebSearchOutput) => value } as never,
    execute: vi.fn(async () => result),
  };
}

// ── 测试用例 ──────────────────────────────────────

describe('P1 ADVISOR_CHAT planner 链路集成测试', () => {
  describe('ADVISOR_CHAT + planBuilder 成功', () => {
    it('plan 生成成功后 solver 被调用，taskPrompt 包含 plan 上下文', async () => {
      const plan = makeAnalysisPlan();
      const solverInvoke = vi.fn(async () => ({
        content: JSON.stringify({
          summary: '您最近一周睡眠质量总体良好。',
          chartTokens: [ChartTokenId.SLEEP_7DAYS],
          microTips: ['建议保持规律作息'],
        }),
      }));

      const { deps: planBuilder } = makePlanBuilderDeps({ success: true, plan });

      const runtimeDeps = makeDeps(
        { invoke: solverInvoke },
        planBuilder,
      );

      const onPromptBuilt = vi.fn();
      const onPlanBuilt = vi.fn();

      const result = await executeAgent(
        makeAdvisorChatRequest(),
        runtimeDeps,
        undefined,
        { onPromptBuilt, onPlanBuilt },
      );

      // 最终响应来自 solver
      expect(result.summary).toBe('您最近一周睡眠质量总体良好。');
      expect(result.meta.finishReason).toBe('complete');

      // solver 被调用
      expect(solverInvoke).toHaveBeenCalledTimes(1);

      // plan 被成功生成
      expect(onPlanBuilt).toHaveBeenCalledTimes(1);
      expect(onPlanBuilt.mock.calls[0]![0].planId).toBe('plan-001');

      // taskPrompt 包含 plan 上下文
      const promptInput = onPromptBuilt.mock.calls[0]![0];
      expect(promptInput.taskPrompt).toContain('分析计划');
      expect(promptInput.taskPrompt).toContain('需要引用的证据');
      expect(promptInput.taskPrompt).toContain('sleep');
    });

    it('create_plan 意图拒绝睡眠分析与图表，并按结构化计划契约重生成', async () => {
      const plan = makeAnalysisPlan({
        userIntent: {
          action: 'create_plan',
          riskLevel: 'general',
          needsClarification: false,
        },
        answerShape: {
          includeMissingDataDisclosure: false,
          includeChartTokens: false,
          maxSummaryLength: 300,
          tone: 'concise',
        },
      });
      const planDraft = {
        title: '7-Day Sleep Improvement Plan',
        summary: 'A gradual routine for more consistent sleep.',
        groups: [
          {
            title: 'Days 1-7',
            tasks: [
              {
                title: 'Keep a consistent wake time',
                description: 'Wake at the same time each day.',
                suggestedTimeOfDay: 'Morning',
              },
            ],
          },
        ],
      };
      const solverInvoke = vi
        .fn()
        .mockResolvedValueOnce({
          content: JSON.stringify({
            summary: 'Your sleep trend has been analyzed.',
            chartTokens: [ChartTokenId.SLEEP_7DAYS],
            microTips: [],
          }),
        })
        .mockResolvedValueOnce({
          content: JSON.stringify({
            summary: 'Your requested sleep plan is ready.',
            chartTokens: [],
            microTips: [],
            planDraft,
          }),
        });
      const { deps: planBuilder } = makePlanBuilderDeps({ success: true, plan });

      const result = await executeAgent(
        makeAdvisorChatRequest({
          userMessage: 'can you help me out with a sleep improvement plan?',
        }),
        makeDeps({ invoke: solverInvoke }, planBuilder),
        undefined,
        undefined,
        'en',
      );

      expect(solverInvoke).toHaveBeenCalledTimes(2);
      expect(solverInvoke.mock.calls[0]![0].userPrompt).toContain(
        '响应模式: structured_plan',
      );
      expect(solverInvoke.mock.calls[1]![0].userPrompt).toContain(
        'The Planner classified this request as plan creation',
      );
      expect(result.planDraftPreview).toEqual(planDraft);
      expect(result.chartTokens).toEqual([]);
      expect(result.microTips).toBeUndefined();
    });

    it('create_plan 连续违反响应契约时返回显式错误，不退化成趋势分析', async () => {
      const plan = makeAnalysisPlan({
        userIntent: {
          action: 'create_plan',
          riskLevel: 'general',
          needsClarification: false,
        },
        answerShape: {
          includeMissingDataDisclosure: false,
          includeChartTokens: false,
          maxSummaryLength: 300,
          tone: 'concise',
        },
      });
      const solverInvoke = vi.fn(async () => ({
        content: JSON.stringify({
          summary: 'Your sleep trend has been analyzed.',
          chartTokens: [ChartTokenId.SLEEP_7DAYS],
          microTips: [],
        }),
      }));
      const { deps: planBuilder } = makePlanBuilderDeps({ success: true, plan });

      const result = await executeAgent(
        makeAdvisorChatRequest({
          userMessage: 'can you help me out with a sleep improvement plan?',
        }),
        makeDeps({ invoke: solverInvoke }, planBuilder),
        undefined,
        undefined,
        'en',
      );

      expect(solverInvoke).toHaveBeenCalledTimes(2);
      expect(result.meta.finishReason).toBe('fallback');
      expect(result.summary).toContain('could not generate a valid structured plan');
      expect(result.chartTokens).toEqual([]);
      expect(result.planDraftPreview).toBeUndefined();
    });
  });

  describe('ADVISOR_CHAT + needsClarification', () => {
    it('plan.needsClarification=true 时直接返回 clarification，solver 不被调用', async () => {
      const plan = makeAnalysisPlan({
        userIntent: {
          action: 'general',
          riskLevel: 'general',
          needsClarification: true,
          clarificationQuestion: '您是想了解睡眠时长还是睡眠质量？',
        },
      });

      const solverInvoke = vi.fn(async () => ({
        content: JSON.stringify({
          summary: '不应该被调用',
          chartTokens: [],
          microTips: [],
        }),
      }));

      const { deps: planBuilder } = makePlanBuilderDeps({ success: true, plan });

      const runtimeDeps = makeDeps(
        { invoke: solverInvoke },
        planBuilder,
      );

      const onClarification = vi.fn();
      const onPlanBuilt = vi.fn();
      const onModelOutput = vi.fn();

      const result = await executeAgent(
        makeAdvisorChatRequest(),
        runtimeDeps,
        undefined,
        { onClarification, onPlanBuilt, onModelOutput },
      );

      // 返回 clarification 响应
      expect(result.summary).toContain('更多信息');
      expect(result.summary).toContain('您是想了解睡眠时长还是睡眠质量？');
      expect(result.source).toBe('planner');
      expect(result.meta.finishReason).toBe('complete');

      // solver 不被调用
      expect(solverInvoke).not.toHaveBeenCalled();

      // observer 回调
      expect(onClarification).toHaveBeenCalledTimes(1);
      expect(onClarification.mock.calls[0]![0]).toBe('您是想了解睡眠时长还是睡眠质量？');

      // onPlanBuilt 不触发（因为 needsClarification 后直接返回）
      expect(onPlanBuilt).not.toHaveBeenCalled();

      // solver 没有被调用，onModelOutput 不触发
      expect(onModelOutput).not.toHaveBeenCalled();

      // 回归保护：澄清轮次也必须写回 session memory，
      // 否则下一轮请求会因 recentConversation 为空而退化为单轮问答
      const messages = runtimeDeps.sessionMemory.getRecentMessages('sess-advisor-1');
      expect(messages).toHaveLength(2);
      expect(messages[0]).toMatchObject({ role: 'user', text: '我最近的睡眠怎么样？' });
      expect(messages[1]).toMatchObject({ role: 'assistant' });
      expect(messages[1].text).toContain('您是想了解睡眠时长还是睡眠质量？');
    });
  });

  describe('ADVISOR_CHAT + plan 失败', () => {
    it('buildAnalysisPlanWithRetry 返回 success:false 时返回 fallback 响应', async () => {
      const solverInvoke = vi.fn(async () => ({
        content: JSON.stringify({
          summary: '不应该被调用',
          chartTokens: [],
          microTips: [],
        }),
      }));

      // 构造一个 parseError 场景的 planBuilder
      const plannerInvoke = vi.fn(async () => ({
        content: 'this is not json at all {{{',
      }));
      const planBuilder: PlanBuilderDeps = {
        plannerAgent: { invoke: plannerInvoke },
        plannerPrompt: '你是一个健康数据分析规划师',
      };

      const runtimeDeps = makeDeps(
        { invoke: solverInvoke },
        planBuilder,
      );

      const onPlanFailed = vi.fn();
      const onModelOutput = vi.fn();

      const result = await executeAgent(
        makeAdvisorChatRequest(),
        runtimeDeps,
        undefined,
        { onPlanFailed, onModelOutput },
      );

      // 返回 fallback 响应
      expect(result.meta.finishReason).toBe('fallback');
      expect(result.summary).toContain('暂时无法理解');

      // solver 不被调用
      expect(solverInvoke).not.toHaveBeenCalled();

      // onPlanFailed 被触发（parse_error 类型）
      expect(onPlanFailed).toHaveBeenCalledTimes(1);
      expect(onPlanFailed.mock.calls[0]![0]).toBe('parse_error');

      // solver 没有被调用
      expect(onModelOutput).not.toHaveBeenCalled();

      // 回归保护：plan 失败的 fallback 轮次也必须写回 session memory
      const messages = runtimeDeps.sessionMemory.getRecentMessages('sess-advisor-1');
      expect(messages).toHaveLength(2);
      expect(messages[0]).toMatchObject({ role: 'user', text: '我最近的睡眠怎么样？' });
      expect(messages[1]).toMatchObject({ role: 'assistant' });
      expect(messages[1].text).toContain('暂时无法理解');
    });

    it('planner 调用异常时 onPlanFailed 收到 invocation_error', async () => {
      const solverInvoke = vi.fn(async () => ({
        content: JSON.stringify({ summary: 'x', chartTokens: [], microTips: [] }),
      }));

      // planner agent 抛出异常
      const plannerInvoke = vi.fn(async () => { throw new Error('LLM 服务不可用'); });
      const planBuilder: PlanBuilderDeps = {
        plannerAgent: { invoke: plannerInvoke },
        plannerPrompt: '你是一个健康数据分析规划师',
      };

      const runtimeDeps = makeDeps(
        { invoke: solverInvoke },
        planBuilder,
      );

      const onPlanFailed = vi.fn();

      const result = await executeAgent(
        makeAdvisorChatRequest(),
        runtimeDeps,
        undefined,
        { onPlanFailed },
      );

      expect(result.meta.finishReason).toBe('fallback');
      expect(onPlanFailed).toHaveBeenCalledTimes(1);
      expect(onPlanFailed.mock.calls[0]![0]).toBe('invocation_error');
    });
  });

  describe('ADVISOR_CHAT + 无 planBuilder', () => {
    it('退化为原有模式，solver 被直接调用，不经过 planner', async () => {
      const solverInvoke = vi.fn(async () => ({
        content: JSON.stringify({
          summary: '直接调用模式的结果。',
          chartTokens: [],
          microTips: [],
        }),
      }));

      // 不传入 planBuilder
      const runtimeDeps = makeDeps({ invoke: solverInvoke });

      const onPlanBuilt = vi.fn();
      const onPlanFailed = vi.fn();
      const onPromptBuilt = vi.fn();

      const result = await executeAgent(
        makeAdvisorChatRequest(),
        runtimeDeps,
        undefined,
        { onPlanBuilt, onPlanFailed, onPromptBuilt },
      );

      // solver 被直接调用
      expect(solverInvoke).toHaveBeenCalledTimes(1);
      expect(result.summary).toBe('直接调用模式的结果。');
      expect(result.meta.finishReason).toBe('complete');

      // planner observer 不触发
      expect(onPlanBuilt).not.toHaveBeenCalled();
      expect(onPlanFailed).not.toHaveBeenCalled();

      // taskPrompt 不包含 plan 上下文
      const promptInput = onPromptBuilt.mock.calls[0]![0];
      expect(promptInput.taskPrompt).not.toContain('分析计划');
    });
  });

  describe('HOMEPAGE_SUMMARY + planBuilder', () => {
    it('不受影响，不触发 planner', async () => {
      const plan = makeAnalysisPlan();
      const solverInvoke = vi.fn(async () => ({
        content: JSON.stringify({
          // Task 3.3: 合规 summary 需满足 zh 220-420 grapheme 区间
          summary:
            '今天整体状态良好，各项生理指标处于稳定区间。夜间睡眠时长充足，深睡与浅睡比例合理，晨起恢复状况良好；白天活动量适中，心率与血氧饱和度保持在正常水平，压力负荷处于较低区间。当前没有出现明显的生理异常或需要关注的事件，身体处于稳态。建议继续保持规律的作息安排与均衡饮食结构，适当安排户外散步或轻度运动，以维持当前的稳态并促进长期健康。如出现任何不适或数据异常，请及时咨询专业医疗人员获取准确的评估和指导。今日可关注夜间睡眠质量与明日晨起准备度之间的关联。',
          chartTokens: [ChartTokenId.HRV_7DAYS],
          microTips: ['保持规律作息'],
        }),
      }));

      const { deps: planBuilder } = makePlanBuilderDeps({ success: true, plan });

      const runtimeDeps = makeDeps(
        { invoke: solverInvoke },
        planBuilder,
      );

      const onPlanBuilt = vi.fn();
      const onPlanFailed = vi.fn();
      const onPromptBuilt = vi.fn();

      const result = await executeAgent(
        makeHomepageRequest(),
        runtimeDeps,
        undefined,
        { onPlanBuilt, onPlanFailed, onPromptBuilt },
      );

      // 正常 HOMEPAGE_SUMMARY 结果
      expect(result.summary).toContain('今天整体状态良好');
      expect(result.meta.finishReason).toBe('complete');

      // planner observer 不触发
      expect(onPlanBuilt).not.toHaveBeenCalled();
      expect(onPlanFailed).not.toHaveBeenCalled();

      // taskPrompt 不包含 plan 上下文
      const promptInput = onPromptBuilt.mock.calls[0]![0];
      expect(promptInput.taskPrompt).not.toContain('分析计划');
    });
  });

  describe('VIEW_SUMMARY + planBuilder', () => {
    it('不受影响，不触发 planner', async () => {
      const plan = makeAnalysisPlan();
      const solverInvoke = vi.fn(async () => ({
        content: JSON.stringify({
          summary: 'HRV 本周呈下降趋势。',
          chartTokens: [ChartTokenId.HRV_7DAYS],
          microTips: ['注意休息'],
        }),
      }));

      const { deps: planBuilder } = makePlanBuilderDeps({ success: true, plan });

      const runtimeDeps = makeDeps(
        { invoke: solverInvoke },
        planBuilder,
      );

      const onPlanBuilt = vi.fn();
      const onPlanFailed = vi.fn();
      const onPromptBuilt = vi.fn();

      const result = await executeAgent(
        makeViewSummaryRequest(),
        runtimeDeps,
        undefined,
        { onPlanBuilt, onPlanFailed, onPromptBuilt },
      );

      // 正常 VIEW_SUMMARY 结果
      expect(result.summary).toBe('HRV 本周呈下降趋势。');
      expect(result.meta.finishReason).toBe('complete');

      // planner observer 不触发
      expect(onPlanBuilt).not.toHaveBeenCalled();
      expect(onPlanFailed).not.toHaveBeenCalled();

      // taskPrompt 不包含 plan 上下文
      const promptInput = onPromptBuilt.mock.calls[0]![0];
      expect(promptInput.taskPrompt).not.toContain('分析计划');
    });
  });

  describe('Observer 回调时序', () => {
    it('成功路径：onPlanBuilt → onPromptBuilt → onModelOutput → onParsed → onVerified 按顺序触发', async () => {
      const plan = makeAnalysisPlan();
      const { deps: planBuilder } = makePlanBuilderDeps({ success: true, plan });
      const runtimeDeps = makeDeps({}, planBuilder);

      const callOrder: string[] = [];
      const observer: AgentRuntimeObserver = {
        onContextBuilt: () => { callOrder.push('onContextBuilt'); },
        onRulesEvaluated: () => { callOrder.push('onRulesEvaluated'); },
        onPacketBuilt: () => { callOrder.push('onPacketBuilt'); },
        onPlanBuilt: () => { callOrder.push('onPlanBuilt'); },
        onPromptBuilt: () => { callOrder.push('onPromptBuilt'); },
        onModelOutput: () => { callOrder.push('onModelOutput'); },
        onParsed: () => { callOrder.push('onParsed'); },
        onVerified: () => { callOrder.push('onVerified'); },
      };

      await executeAgent(makeAdvisorChatRequest(), runtimeDeps, undefined, observer);

      // 同步回调应按此顺序触发（onParsed 在 onVerified 之前）
      expect(callOrder).toEqual([
        'onContextBuilt',
        'onRulesEvaluated',
        'onPacketBuilt',
        'onPlanBuilt',
        'onPromptBuilt',
        'onModelOutput',
        'onParsed',
        'onVerified',
      ]);
    });
  });

  describe('Plan 失败 observer', () => {
    it('parse_error 时 onPlanFailed 被调用', async () => {
      const plannerInvoke = vi.fn(async () => ({
        content: 'not json',
      }));
      const planBuilder: PlanBuilderDeps = {
        plannerAgent: { invoke: plannerInvoke },
        plannerPrompt: 'test',
      };

      const runtimeDeps = makeDeps({}, planBuilder);
      const onPlanFailed = vi.fn();

      await executeAgent(
        makeAdvisorChatRequest(),
        runtimeDeps,
        undefined,
        { onPlanFailed },
      );

      expect(onPlanFailed).toHaveBeenCalledTimes(1);
      expect(onPlanFailed.mock.calls[0]![0]).toBe('parse_error');
    });

    it('verification_failed 时 onPlanFailed 被调用', async () => {
      // 构造一个通过 JSON 解析但 schema 验证失败的 plan
      // 使用无效的 taskType 来触发 schema error
      const plannerInvoke = vi.fn(async () => ({
        content: JSON.stringify({
          planId: 'plan-bad',
          taskType: 'invalid_type',
          userIntent: { action: 'status_summary', riskLevel: 'general', needsClarification: false },
          evidenceNeeds: [],
          safetyConstraints: [],
          answerShape: { includeMissingDataDisclosure: true, includeChartTokens: false, maxSummaryLength: 100, tone: 'concise' },
        }),
      }));
      const planBuilder: PlanBuilderDeps = {
        plannerAgent: { invoke: plannerInvoke },
        plannerPrompt: 'test',
      };

      const runtimeDeps = makeDeps({}, planBuilder);
      const onPlanFailed = vi.fn();

      await executeAgent(
        makeAdvisorChatRequest(),
        runtimeDeps,
        undefined,
        { onPlanFailed },
      );

      expect(onPlanFailed).toHaveBeenCalledTimes(1);
      // H-14: schema 错误现在有独立的 failureType
      expect(['parse_error', 'verification_failed', 'schema_error']).toContain(onPlanFailed.mock.calls[0]![0]);
    });
  });

  describe('Clarification observer', () => {
    it('needsClarification 时 onClarification 被调用，传递问题文本', async () => {
      const plan = makeAnalysisPlan({
        userIntent: {
          action: 'general',
          riskLevel: 'general',
          needsClarification: true,
          clarificationQuestion: '您想了解哪个时间段的数据？',
        },
      });

      const { deps: planBuilder } = makePlanBuilderDeps({ success: true, plan });
      const runtimeDeps = makeDeps({}, planBuilder);

      const onClarification = vi.fn();

      const result = await executeAgent(
        makeAdvisorChatRequest(),
        runtimeDeps,
        undefined,
        { onClarification },
      );

      expect(onClarification).toHaveBeenCalledTimes(1);
      expect(onClarification.mock.calls[0]![0]).toBe('您想了解哪个时间段的数据？');
      expect(result.source).toBe('planner');
      expect(result.meta.finishReason).toBe('complete');
    });
  });
});

describe('Advisor Chat WebSearch runtime', () => {
  it('webSearchNeeds 成功时调用 tool 并把结果注入 solver prompt', async () => {
    const plan = makeAnalysisPlan({
      evidenceNeeds: [],
      webSearchNeeds: [
        {
          query: 'recent caffeine sleep research',
          reason: '用户询问最近公开研究',
          required: true,
          topic: 'general',
          timeRange: 'year',
        },
      ],
    });
    const { deps: planBuilder } = makePlanBuilderDeps({ success: true, plan });
    const tool = makeWebSearchTool({
      success: true,
      data: {
        results: [
          {
            title: 'Caffeine and sleep',
            url: 'https://example.com/caffeine',
            content: 'Research snippet.',
            publishedDate: '2026-05-01',
          },
        ],
      },
      evidenceIds: ['web:https://example.com/caffeine'],
    });
    const solverInvoke = vi.fn(async () => ({
      content: JSON.stringify({ summary: '已结合外部资料保守说明。', chartTokens: [], microTips: [] }),
    }));
    const onPromptBuilt = vi.fn();
    const onWebSearchEvidence = vi.fn();

    const result = await executeAgent(
      makeAdvisorChatRequest({ userMessage: '最近有什么关于咖啡因和睡眠的研究？' }),
      makeDeps({ invoke: solverInvoke }, planBuilder, { tool, maxResults: 3 }),
      undefined,
      { onPromptBuilt, onWebSearchEvidence },
    );

    expect(result.summary).toBe('已结合外部资料保守说明。');
    expect(tool.execute).toHaveBeenCalledTimes(1);
    expect(solverInvoke).toHaveBeenCalledTimes(1);
    expect(onWebSearchEvidence).toHaveBeenCalledTimes(1);
    const promptInput = onPromptBuilt.mock.calls[0]![0];
    expect(promptInput.taskPrompt).toContain('## Web Search Evidence');
    expect(promptInput.taskPrompt).toContain('[web:https://example.com/caffeine] Caffeine and sleep');
  });

  it('required=true 且 tool 未注入时返回安全说明并且不调用 solver', async () => {
    const plan = makeAnalysisPlan({
      evidenceNeeds: [],
      webSearchNeeds: [
        {
          query: 'latest public sleep guideline',
          reason: '用户要求最新外部指南',
          required: true,
        },
      ],
    });
    const { deps: planBuilder } = makePlanBuilderDeps({ success: true, plan });
    const solverInvoke = vi.fn(async () => ({
      content: JSON.stringify({ summary: '不应该被调用', chartTokens: [], microTips: [] }),
    }));
    const onWebSearchEvidence = vi.fn();

    const result = await executeAgent(
      makeAdvisorChatRequest({ userMessage: '最新睡眠指南怎么说？' }),
      makeDeps({ invoke: solverInvoke }, planBuilder),
      undefined,
      { onWebSearchEvidence },
    );

    expect(result.summary).toContain('当前无法获取外部资料');
    expect(result.source).toBe('planner');
    expect(result.meta.finishReason).toBe('complete');
    expect(solverInvoke).not.toHaveBeenCalled();
    expect(onWebSearchEvidence).toHaveBeenCalledTimes(1);
  });

  it('required=true 且搜索空结果时不调用 solver', async () => {
    const plan = makeAnalysisPlan({
      evidenceNeeds: [],
      webSearchNeeds: [{ query: 'latest public sleep guideline', reason: '用户要求最新外部指南', required: true }],
    });
    const { deps: planBuilder } = makePlanBuilderDeps({ success: true, plan });
    const tool = makeWebSearchTool({ success: true, data: { results: [] }, evidenceIds: [] });
    const solverInvoke = vi.fn(async () => ({
      content: JSON.stringify({ summary: '不应该被调用', chartTokens: [], microTips: [] }),
    }));

    const result = await executeAgent(
      makeAdvisorChatRequest({ userMessage: '最新睡眠指南怎么说？' }),
      makeDeps({ invoke: solverInvoke }, planBuilder, { tool }),
    );

    expect(result.summary).toContain('当前无法获取外部资料');
    expect(solverInvoke).not.toHaveBeenCalled();
  });

  it('required=false 且搜索失败时继续调用 solver 并注入 unavailable', async () => {
    const plan = makeAnalysisPlan({
      evidenceNeeds: [],
      webSearchNeeds: [{ query: 'recent sleep news', reason: '补充外部背景资料', required: false }],
    });
    const { deps: planBuilder } = makePlanBuilderDeps({ success: true, plan });
    const tool = makeWebSearchTool({ success: false, error: { code: 'web_search_error', message: 'Tavily unavailable' } });
    const solverInvoke = vi.fn(async () => ({
      content: JSON.stringify({ summary: '基于本地上下文回答。', chartTokens: [], microTips: [] }),
    }));
    const onPromptBuilt = vi.fn();

    const result = await executeAgent(
      makeAdvisorChatRequest({ userMessage: '最近睡眠新闻有哪些？' }),
      makeDeps({ invoke: solverInvoke }, planBuilder, { tool }),
      undefined,
      { onPromptBuilt },
    );

    expect(result.summary).toBe('基于本地上下文回答。');
    expect(solverInvoke).toHaveBeenCalledTimes(1);
    const promptInput = onPromptBuilt.mock.calls[0]![0];
    expect(promptInput.taskPrompt).toContain('状态: unavailable');
    expect(promptInput.taskPrompt).toContain('不得声称已查到外部资料');
  });

  it('plan 没有 webSearchNeeds 时不调用 webSearchTool', async () => {
    const plan = makeAnalysisPlan({ webSearchNeeds: undefined });
    const { deps: planBuilder } = makePlanBuilderDeps({ success: true, plan });
    const tool = makeWebSearchTool({ success: true, data: { results: [] }, evidenceIds: [] });

    await executeAgent(
      makeAdvisorChatRequest({ userMessage: '我最近的睡眠怎么样？' }),
      makeDeps({}, planBuilder, { tool }),
    );

    expect(tool.execute).not.toHaveBeenCalled();
  });
});

describe('ADVISOR_CHAT — UI 控制计划（homepage.trend-card.set）', () => {
  function makeUiPlan(display: 'sleep' | 'activity' | 'hidden'): AnalysisPlan {
    return makeAnalysisPlan({
      userIntent: {
        action: 'control_ui',
        riskLevel: 'general',
        needsClarification: false,
        clarificationQuestion: undefined,
      },
      evidenceNeeds: [],
      webSearchNeeds: undefined,
      clientAction: { type: 'homepage.trend-card.set', display },
    });
  }

  function makeLowDataDeps(
    agentOverrides: Partial<HealthAgent> = {},
    planBuilder?: PlanBuilderDeps,
  ): AgentRuntimeDeps {
    const emptyData: ProfileData = {
      profile: {
        profileId: 'profile-a',
        name: '张健康',
        age: 32,
        gender: 'male',
        avatar: '👨‍💻',
        tags: ['test'],
        baseline: { restingHr: 62, hrv: 58, spo2: 98, avgSleepMinutes: 420, avgSteps: 8500 },
      },
      records: [],
    };
    return {
      getProfile: () => emptyData,
      selectByTimeframe: (records: DailyRecord[]) => records,
      applyOverrides: (records: DailyRecord[]) => records,
      mergeEvents: (base: DatedEvent[], injected: DatedEvent[]) => [...base, ...injected],
      sessionMemory: new InMemorySessionMemoryStore(),
      analyticalMemory: new InMemoryAnalyticalMemoryStore(),
      getActiveOverrides: () => [],
      getInjectedEvents: () => [],
      referenceDate: '2026-04-24',
      agent: agentOverrides,
      promptLoader: mockPromptLoader,
      fallbackEngine: mockFallbackEngine,
      planBuilder,
    } as unknown as AgentRuntimeDeps;
  }

  describe('纯 UI 计划 — 确定性回复', () => {
    it('sleep display 返回固定中文 summary 和 uiDirectives，solver 不调用', async () => {
      const plan = makeUiPlan('sleep');
      const solverInvoke = vi.fn(async () => ({ content: 'never' }));
      const { deps: planBuilder } = makePlanBuilderDeps({ success: true, plan });
      const sessionMemory = new InMemorySessionMemoryStore();

      const runtimeDeps: AgentRuntimeDeps = {
        ...makeDeps({ invoke: solverInvoke }, planBuilder),
        sessionMemory,
      };

      const result = await executeAgent(
        makeAdvisorChatRequest({ userMessage: '在首页展示睡眠趋势简报' }),
        runtimeDeps,
      );

      expect(solverInvoke).not.toHaveBeenCalled();
      expect(result.source).toBe('planner');
      expect(result.statusColor).toBe('good');
      expect(result.meta.finishReason).toBe('complete');
      expect(result.chartTokens).toEqual([]);
      expect(result.summary).toBe('已在首页展示睡眠趋势简报。');
      expect(result.uiDirectives).toEqual([
        { type: 'homepage.trend-card.set', display: 'sleep' },
      ]);
    });

    it('activity display 返回固定 summary', async () => {
      const plan = makeUiPlan('activity');
      const solverInvoke = vi.fn(async () => ({ content: 'never' }));
      const { deps: planBuilder } = makePlanBuilderDeps({ success: true, plan });

      const result = await executeAgent(
        makeAdvisorChatRequest(),
        makeDeps({ invoke: solverInvoke }, planBuilder),
      );

      expect(solverInvoke).not.toHaveBeenCalled();
      expect(result.summary).toBe('已在首页展示活动趋势简报。');
      expect(result.uiDirectives).toEqual([
        { type: 'homepage.trend-card.set', display: 'activity' },
      ]);
    });

    it('hidden display 返回固定 summary', async () => {
      const plan = makeUiPlan('hidden');
      const solverInvoke = vi.fn(async () => ({ content: 'never' }));
      const { deps: planBuilder } = makePlanBuilderDeps({ success: true, plan });

      const result = await executeAgent(
        makeAdvisorChatRequest(),
        makeDeps({ invoke: solverInvoke }, planBuilder),
      );

      expect(result.summary).toBe('已隐藏首页趋势简报。');
      expect(result.uiDirectives).toEqual([
        { type: 'homepage.trend-card.set', display: 'hidden' },
      ]);
    });

    it('英文 locale 返回英文 summary', async () => {
      const plan = makeUiPlan('activity');
      const solverInvoke = vi.fn(async () => ({ content: 'never' }));
      const { deps: planBuilder } = makePlanBuilderDeps({ success: true, plan });

      const result = await executeAgent(
        makeAdvisorChatRequest(),
        makeDeps({ invoke: solverInvoke }, planBuilder),
        undefined,
        undefined,
        'en' as never,
      );

      expect(result.summary).toBe('The Activity trends brief is now shown on Home.');
    });

    it('纯 UI 在 low-data profile 下仍能完成', async () => {
      const plan = makeUiPlan('sleep');
      const solverInvoke = vi.fn(async () => ({ content: 'never' }));
      const { deps: planBuilder } = makePlanBuilderDeps({ success: true, plan });

      const result = await executeAgent(
        makeAdvisorChatRequest({ userMessage: '在首页展示睡眠趋势简报' }),
        makeLowDataDeps({ invoke: solverInvoke }, planBuilder),
      );

      expect(solverInvoke).not.toHaveBeenCalled();
      expect(result.meta.finishReason).toBe('complete');
      expect(result.uiDirectives).toEqual([
        { type: 'homepage.trend-card.set', display: 'sleep' },
      ]);
    });

    it('纯 UI 写入一条 user 和一条 assistant session message', async () => {
      const plan = makeUiPlan('sleep');
      const solverInvoke = vi.fn(async () => ({ content: 'never' }));
      const { deps: planBuilder } = makePlanBuilderDeps({ success: true, plan });
      const sessionMemory = new InMemorySessionMemoryStore();
      const sessionId = 'sess-ui-memory';
      const profileId = 'profile-a';

      await executeAgent(
        makeAdvisorChatRequest({
          sessionId,
          profileId,
          pageContext: { profileId, page: 'advisor', timeframe: 'week' },
          userMessage: '在首页展示睡眠趋势简报',
        }),
        { ...makeDeps({ invoke: solverInvoke }, planBuilder), sessionMemory },
      );

      const history = sessionMemory.getRecentMessages(sessionId);
      expect(history).toHaveLength(2);
      expect(history[0]!.role).toBe('user');
      expect(history[0]!.text).toBe('在首页展示睡眠趋势简报');
      expect(history[1]!.role).toBe('assistant');
      expect(history[1]!.text).toBe('已在首页展示睡眠趋势简报。');
    });
  });

  describe('混合 UI + 健康问答', () => {
    it('健康 action 携带 clientAction 时正常调用 solver，附加 Planner 指令', async () => {
      const plan = makeAnalysisPlan({
        userIntent: { action: 'status_summary', riskLevel: 'general', needsClarification: false },
        evidenceNeeds: [
          { metric: 'sleep', timeScope: 'week', reason: '分析睡眠', required: true },
        ],
        clientAction: { type: 'homepage.trend-card.set', display: 'sleep' },
      });
      const solverInvoke = vi.fn(async () => ({
        content: JSON.stringify({
          summary: '您最近睡眠稳定。',
          chartTokens: [ChartTokenId.SLEEP_7DAYS],
          microTips: [],
        }),
      }));
      const { deps: planBuilder } = makePlanBuilderDeps({ success: true, plan });

      const result = await executeAgent(
        makeAdvisorChatRequest({ userMessage: '分析睡眠并在首页展示睡眠简报' }),
        makeDeps({ invoke: solverInvoke }, planBuilder),
      );

      expect(solverInvoke).toHaveBeenCalledTimes(1);
      expect(result.meta.finishReason).toBe('complete');
      expect(result.uiDirectives).toEqual([
        { type: 'homepage.trend-card.set', display: 'sleep' },
      ]);
    });

    it('模型输出自行携带 uiDirectives 但 Planner 没有 clientAction 时不得附加', async () => {
      const plan = makeAnalysisPlan({
        // 普通 health plan，无 clientAction
        clientAction: undefined,
      });
      const solverInvoke = vi.fn(async () => ({
        // 故意输出模型编造的 UI 字段
        content: JSON.stringify({
          summary: '您最近睡眠稳定。',
          chartTokens: [ChartTokenId.SLEEP_7DAYS],
          microTips: [],
          uiDirectives: [{ type: 'homepage.trend-card.set', display: 'sleep' }],
        }),
      }));
      const { deps: planBuilder } = makePlanBuilderDeps({ success: true, plan });

      const result = await executeAgent(
        makeAdvisorChatRequest(),
        makeDeps({ invoke: solverInvoke }, planBuilder),
      );

      expect(result.uiDirectives).toBeUndefined();
    });
  });

  describe('UI 指令不携带的边界', () => {
    it('clarification 不携带 uiDirectives', async () => {
      const plan = makeAnalysisPlan({
        userIntent: {
          action: 'general',
          riskLevel: 'general',
          needsClarification: true,
          clarificationQuestion: '你想看 Sleep 还是 Activity？',
        },
        clientAction: undefined,
      });
      const { deps: planBuilder } = makePlanBuilderDeps({ success: true, plan });

      const result = await executeAgent(
        makeAdvisorChatRequest(),
        makeDeps({}, planBuilder),
      );

      expect(result.uiDirectives).toBeUndefined();
      expect(result.meta.finishReason).toBe('complete');
    });

    it('planner failure 不携带 uiDirectives', async () => {
      const plannerInvoke = vi.fn(async () => ({ content: 'not json' }));
      const planBuilder: PlanBuilderDeps = {
        plannerAgent: { invoke: plannerInvoke },
        plannerPrompt: 'p',
      };

      const result = await executeAgent(
        makeAdvisorChatRequest(),
        makeDeps({}, planBuilder),
      );

      expect(result.meta.finishReason).toBe('fallback');
      expect(result.uiDirectives).toBeUndefined();
    });

    it('普通健康问答（无 clientAction）不携带 uiDirectives', async () => {
      const plan = makeAnalysisPlan();
      const solverInvoke = vi.fn(async () => ({
        content: JSON.stringify({ summary: 'sleep looks good', chartTokens: [], microTips: [] }),
      }));
      const { deps: planBuilder } = makePlanBuilderDeps({ success: true, plan });

      const result = await executeAgent(
        makeAdvisorChatRequest(),
        makeDeps({ invoke: solverInvoke }, planBuilder),
      );

      expect(result.uiDirectives).toBeUndefined();
    });

    it('solver 走 fallback envelope 时不携带 uiDirectives', async () => {
      const plan = makeAnalysisPlan();
      const solverInvoke = vi.fn(async () => ({ content: 'invalid output' }));
      const { deps: planBuilder } = makePlanBuilderDeps({ success: true, plan });

      const result = await executeAgent(
        makeAdvisorChatRequest(),
        makeDeps({ invoke: solverInvoke }, planBuilder),
      );

      expect(result.meta.finishReason).toBe('fallback');
      expect(result.uiDirectives).toBeUndefined();
    });
  });

  describe('uiContext 透传', () => {
    it('runtime 把 request.uiContext 传给 planBuilder', async () => {
      const plan = makeUiPlan('activity');
      const plannerInvoke = vi.fn(async () => ({ content: JSON.stringify(plan) }));
      const planBuilder: PlanBuilderDeps = {
        plannerAgent: { invoke: plannerInvoke },
        plannerPrompt: 'p',
      };

      await executeAgent(
        makeAdvisorChatRequest({
          userMessage: '在首页展示活动趋势简报',
          uiContext: { homepageTrendCard: 'sleep' },
        }),
        makeDeps({}, planBuilder),
      );

      const userPrompt = plannerInvoke.mock.calls[0]![0].userPrompt;
      expect(userPrompt).toContain('homepageTrendCard: sleep');
    });
  });
});
