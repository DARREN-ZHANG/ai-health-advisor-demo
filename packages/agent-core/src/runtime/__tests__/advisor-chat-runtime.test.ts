/**
 * P1 ADVISOR_CHAT planner 链路集成测试
 *
 * 验证 planner 接入 runtime 后的行为：
 * 1. ADVISOR_CHAT + planBuilder 成功 → solver 被调用 → taskPrompt 包含 plan 上下文
 * 2. ADVISOR_CHAT + needsClarification → 直接返回 clarification → solver 不被调用
 * 3. ADVISOR_CHAT + plan 失败 → 返回 fallback 响应 → solver 不被调用
 * 4. ADVISOR_CHAT + 无 planBuilder → 退化为原有模式 → solver 被直接调用
 * 5. HOMEPAGE_SUMMARY + planBuilder → 不受影响 → 不触发 planner
 * 6. Observer 回调时序：onPlanBuilt → onPromptBuilt → onModelOutput → onParsed
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

/** 构造 deps，可注入 planBuilder */
function makeDeps(
  agentOverrides: Partial<HealthAgent> = {},
  planBuilder?: PlanBuilderDeps,
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
          summary: '整体状态良好。',
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
      expect(result.summary).toBe('整体状态良好。');
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
    it('成功路径：onPlanBuilt → onPromptBuilt → onModelOutput → onParsed 按顺序触发', async () => {
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
        onVerified: () => { callOrder.push('onVerified'); },
        onParsed: () => { callOrder.push('onParsed'); },
      };

      await executeAgent(makeAdvisorChatRequest(), runtimeDeps, undefined, observer);

      // 同步回调应按此顺序触发
      expect(callOrder).toEqual([
        'onContextBuilt',
        'onRulesEvaluated',
        'onPacketBuilt',
        'onPlanBuilt',
        'onPromptBuilt',
        'onModelOutput',
        'onVerified',
        'onParsed',
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
      // schema 错误属于 parse_error
      expect(['parse_error', 'verification_failed']).toContain(onPlanFailed.mock.calls[0]![0]);
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
