/**
 * P0 Observer 集成测试
 *
 * 验证 verifier 和 reflection observer 接入 runtime 后的行为：
 * 1. 不设置 reflectionObserver 时，executeAgent 行为与修改前完全一致（回归测试）
 * 2. onVerified 在每次成功生成后触发，接收 VerificationReport
 * 3. 设置 reflectionObserver 后，onReflected 在 reflection 完成后异步触发
 * 4. verifier/reflection 异常不传播到主链路
 * 5. fallback 场景（low_data）不触发 verifier/reflection
 */
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
import type { ReflectionArtifact } from '../../output/reflection-types';
import type { VerificationReport } from '../../output/verification-report';

// ── 测试辅助函数 ──────────────────────────────────────

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
          // Task 3.3: summary 长度需在 zh 220-420 grapheme 范围内
          summary: COMPLIANT_SUMMARY,
          chartTokens: [ChartTokenId.HRV_7DAYS],
          microTips: ['保持规律作息'],
        }),
      })),
    },
    promptLoader: mockPromptLoader,
    fallbackEngine: mockFallbackEngine,
  };
}

function makeVerificationReport(): VerificationReport {
  return {
    envelope: {} as any,
    context: { taskType: 'homepage_summary', missingData: [], visibleCharts: [], ruleInsights: [] },
    violations: [],
    summary: { total: 0, passed: 0, failed: 0, hardFailures: 0 },
    verifiedAt: '2026-01-01T00:00:00.000Z',
  };
}

function makeReflectionArtifact(): ReflectionArtifact {
  return {
    envelopeSnapshot: {} as any,
    verificationReport: makeVerificationReport(),
    reviewResult: { approved: true, qualityScore: 4, issues: [], suggestions: [] },
    reviewerModel: 'test',
    reflectedAt: '2026-01-01T00:00:00.000Z',
  };
}

// ── 测试用例 ──────────────────────────────────────

describe('P0 Observer 集成测试', () => {
  describe('回归测试：不设置 reflectionObserver', () => {
    it('行为与修改前完全一致，不触发 onVerified 和 onReflected', async () => {
      const onVerified = vi.fn();
      const onReflected = vi.fn();
      const onParsed = vi.fn();

      // 不设置 reflectionObserver
      const deps = makeDeps();

      const result = await executeAgent(
        makeRequest(),
        deps,
        undefined,
        { onVerified, onReflected, onParsed },
      );

      // 主链路输出不变
      expect(result.summary).toBe(COMPLIANT_SUMMARY);
      expect(result.chartTokens).toEqual([ChartTokenId.HRV_7DAYS]);
      expect(result.meta.finishReason).toBe('complete');

      // onVerified 仍然触发（verifier 始终运行）
      expect(onVerified).toHaveBeenCalledTimes(1);
      expect(onVerified.mock.calls[0]![0]).toHaveProperty('violations');
      expect(onVerified.mock.calls[0]![0]).toHaveProperty('summary');

      // 没有 reflectionObserver，onReflected 不触发
      expect(onReflected).not.toHaveBeenCalled();

      // onParsed 正常触发
      expect(onParsed).toHaveBeenCalledTimes(1);
    });
  });

  describe('onVerified 触发', () => {
    it('在每次成功生成后触发，接收 VerificationReport', async () => {
      const onVerified = vi.fn();

      await executeAgent(
        makeRequest(),
        makeDeps(),
        undefined,
        { onVerified },
      );

      expect(onVerified).toHaveBeenCalledTimes(1);
      const report = onVerified.mock.calls[0]![0] as VerificationReport;
      expect(report).toHaveProperty('violations');
      expect(report).toHaveProperty('summary');
      expect(report.summary).toHaveProperty('total');
      expect(report.summary).toHaveProperty('passed');
      expect(report.summary).toHaveProperty('failed');
      expect(report.summary).toHaveProperty('hardFailures');
      expect(report).toHaveProperty('verifiedAt');
      expect(typeof report.verifiedAt).toBe('string');
    });

    it('VerificationReport 的 context 包含正确的 taskType', async () => {
      const onVerified = vi.fn();

      await executeAgent(makeRequest(), makeDeps(), undefined, { onVerified });

      const report = onVerified.mock.calls[0]![0] as VerificationReport;
      expect(report.context.taskType).toBe('homepage_summary');
    });
  });

  describe('onReflected 触发', () => {
    it('设置 reflectionObserver 后，onReflected 在 reflection 完成后异步触发', async () => {
      const onReflected = vi.fn();
      const mockArtifact = makeReflectionArtifact();

      const mockReflectionObserver = {
        observeAsync: vi.fn().mockResolvedValue(mockArtifact),
      };

      const deps: AgentRuntimeDeps = {
        ...makeDeps(),
        reflectionObserver: mockReflectionObserver as any,
      };

      const result = await executeAgent(
        makeRequest(),
        deps,
        undefined,
        { onReflected },
      );

      // 主链路不受影响
      expect(result.summary).toBe(COMPLIANT_SUMMARY);
      expect(result.meta.finishReason).toBe('complete');

      // 等待异步 reflection 完成
      await vi.waitFor(() => {
        expect(mockReflectionObserver.observeAsync).toHaveBeenCalledTimes(1);
      });

      // onReflected 应该在 reflection 完成后被调用
      await vi.waitFor(() => {
        expect(onReflected).toHaveBeenCalledTimes(1);
      });

      const artifact = onReflected.mock.calls[0]![0] as ReflectionArtifact;
      expect(artifact).toBe(mockArtifact);
    });

    it('observeAsync 接收正确的输入参数', async () => {
      const mockReflectionObserver = {
        observeAsync: vi.fn().mockResolvedValue(makeReflectionArtifact()),
      };

      const deps: AgentRuntimeDeps = {
        ...makeDeps(),
        reflectionObserver: mockReflectionObserver as any,
      };

      await executeAgent(makeRequest(), deps, undefined, {});

      await vi.waitFor(() => {
        expect(mockReflectionObserver.observeAsync).toHaveBeenCalledTimes(1);
      });

      const callInput = mockReflectionObserver.observeAsync.mock.calls[0]![0];
      expect(callInput).toHaveProperty('envelope');
      expect(callInput).toHaveProperty('report');
      expect(callInput).toHaveProperty('context');
      expect(callInput).toHaveProperty('packet');
      expect(callInput).toHaveProperty('systemPrompt');
      expect(callInput).toHaveProperty('taskPrompt');
      expect(callInput.context.task.type).toBe('homepage_summary');
      expect(callInput.report).toHaveProperty('violations');
    });
  });

  describe('异常隔离', () => {
    it('verifier 异常不传播到主链路', async () => {
      // 通过 observer 验证 verifier 正常运行（verifyOutput 是纯函数不应抛错）
      // 测试 observer 回调抛错不影响主链路
      const onVerified = vi.fn(() => { throw new Error('observer crashed'); });

      const result = await executeAgent(
        makeRequest(),
        makeDeps(),
        undefined,
        { onVerified },
      );

      // 主链路正常返回
      expect(result.summary).toBe(COMPLIANT_SUMMARY);
      expect(result.meta.finishReason).toBe('complete');
    });

    it('reflection observer 异常不传播到主链路', async () => {
      const mockReflectionObserver = {
        observeAsync: vi.fn().mockRejectedValue(new Error('reflection crashed')),
      };

      const deps: AgentRuntimeDeps = {
        ...makeDeps(),
        reflectionObserver: mockReflectionObserver as any,
      };

      const result = await executeAgent(
        makeRequest(),
        deps,
      );

      // 主链路正常返回
      expect(result.summary).toBe(COMPLIANT_SUMMARY);
      expect(result.meta.finishReason).toBe('complete');
    });

    it('onReflected 回调抛错不影响主链路', async () => {
      const onReflected = vi.fn(() => { throw new Error('onReflected crashed'); });
      const mockReflectionObserver = {
        observeAsync: vi.fn().mockResolvedValue(makeReflectionArtifact()),
      };

      const deps: AgentRuntimeDeps = {
        ...makeDeps(),
        reflectionObserver: mockReflectionObserver as any,
      };

      const result = await executeAgent(
        makeRequest(),
        deps,
        undefined,
        { onReflected },
      );

      // 主链路正常返回
      expect(result.summary).toBe(COMPLIANT_SUMMARY);
      expect(result.meta.finishReason).toBe('complete');
    });
  });

  describe('fallback 场景不触发 verifier/reflection', () => {
    it('low_data fallback 不触发 onVerified 和 onReflected', async () => {
      const onVerified = vi.fn();
      const onReflected = vi.fn();
      const onParsed = vi.fn();
      const invokeMock = vi.fn(async () => ({
        content: JSON.stringify({ summary: '不应被调用', chartTokens: [], microTips: [] }),
      }));

      // 只有 1 条记录，低于 LOW_DATA_THRESHOLD (3)
      const fewRecords = [makeRecord('2026-04-18')];
      const data = makeProfileData(fewRecords);
      const deps: AgentRuntimeDeps = {
        ...makeDeps({ invoke: invokeMock }),
        getProfile: () => data,
      };

      const result = await executeAgent(
        makeRequest(),
        deps,
        undefined,
        { onVerified, onReflected, onParsed },
      );

      expect(result.meta.finishReason).toBe('fallback');
      expect(invokeMock).not.toHaveBeenCalled();
      expect(onVerified).not.toHaveBeenCalled();
      expect(onReflected).not.toHaveBeenCalled();
      expect(onParsed).not.toHaveBeenCalled();
    });

    it('invalid_output fallback 不触发 onVerified', async () => {
      const onVerified = vi.fn();
      const onReflected = vi.fn();

      const deps = makeDeps({
        invoke: async () => ({ content: '这不是 JSON' }),
      });

      const result = await executeAgent(
        makeRequest(),
        deps,
        undefined,
        { onVerified, onReflected },
      );

      expect(result.meta.finishReason).toBe('fallback');
      expect(onVerified).not.toHaveBeenCalled();
      expect(onReflected).not.toHaveBeenCalled();
    });

    it('timeout fallback 不触发 onVerified', async () => {
      const onVerified = vi.fn();
      const onReflected = vi.fn();

      const deps = makeDeps({
        invoke: async () => new Promise(() => {}), // 永不返回
      });

      const result = await executeAgent(
        makeRequest(),
        deps,
        50,
        { onVerified, onReflected },
      );

      expect(result.meta.finishReason).toBe('timeout');
      expect(onVerified).not.toHaveBeenCalled();
      expect(onReflected).not.toHaveBeenCalled();
    });

    it('provider_error fallback 不触发 onVerified', async () => {
      const onVerified = vi.fn();
      const onReflected = vi.fn();

      const deps = makeDeps({
        invoke: async () => { throw new Error('provider error'); },
      });

      const result = await executeAgent(
        makeRequest(),
        deps,
        undefined,
        { onVerified, onReflected },
      );

      expect(result.meta.finishReason).toBe('fallback');
      expect(onVerified).not.toHaveBeenCalled();
      expect(onReflected).not.toHaveBeenCalled();
    });
  });

  describe('observer 回调时序', () => {
    it('onParsed 在 onVerified 之前触发', async () => {
      const callOrder: string[] = [];
      const onVerified = vi.fn(() => { callOrder.push('onVerified'); });
      const onParsed = vi.fn(() => { callOrder.push('onParsed'); });

      await executeAgent(
        makeRequest(),
        makeDeps(),
        undefined,
        { onVerified, onParsed },
      );

      expect(callOrder).toEqual(['onParsed', 'onVerified']);
    });

    it('成功路径完整的 observer 回调序列', async () => {
      const callOrder: string[] = [];
      const observer = {
        onContextBuilt: () => { callOrder.push('onContextBuilt'); },
        onRulesEvaluated: () => { callOrder.push('onRulesEvaluated'); },
        onPacketBuilt: () => { callOrder.push('onPacketBuilt'); },
        onPromptBuilt: () => { callOrder.push('onPromptBuilt'); },
        onModelOutput: () => { callOrder.push('onModelOutput'); },
        onVerified: () => { callOrder.push('onVerified'); },
        onParsed: () => { callOrder.push('onParsed'); },
        onFallback: () => { callOrder.push('onFallback'); },
        onReflected: () => { callOrder.push('onReflected'); },
      };

      const mockReflectionObserver = {
        observeAsync: vi.fn().mockResolvedValue(makeReflectionArtifact()),
      };

      const deps: AgentRuntimeDeps = {
        ...makeDeps(),
        reflectionObserver: mockReflectionObserver as any,
      };

      await executeAgent(makeRequest(), deps, undefined, observer);

      // 同步回调的顺序（onParsed 在 onVerified 之前，表示解析先于验证）
      const syncCalls = callOrder.filter((c) => c !== 'onReflected');
      expect(syncCalls).toEqual([
        'onContextBuilt',
        'onRulesEvaluated',
        'onPacketBuilt',
        'onPromptBuilt',
        'onModelOutput',
        'onParsed',
        'onVerified',
      ]);

      // onReflected 异步触发
      await vi.waitFor(() => {
        expect(callOrder).toContain('onReflected');
      });
    });
  });

  // ──────────────────────────────────────────────────
  // Task 3.3: Realtime Brief Content Policy 集成测试
  // 验证阻断式客户内容策略在 runtime 层的执行顺序
  // ──────────────────────────────────────────────────
  describe('Task 3.3: Realtime Brief Content Policy', () => {
    it('两次违规都不写入 session memory', async () => {
      const sessionMemory = new InMemorySessionMemoryStore();
      const analyticalMemory = new InMemoryAnalyticalMemoryStore();
      const badSummary = '今天运动强度 4.2，整体偏高。建议放松。';
      const invokeMock = vi.fn(async () => ({
        // 包含 internal_score_disclosed：运动强度 4.2
        content: JSON.stringify({
          summary: badSummary,
          chartTokens: [],
          microTips: [],
        }),
      }));

      const deps: AgentRuntimeDeps = {
        ...makeDeps({ invoke: invokeMock }),
        sessionMemory,
        analyticalMemory,
      };

      const result = await executeAgent(makeRequest(), deps);

      // 两次都违规 → fail-closed 错误响应
      expect(result.meta.finishReason).toBe('fallback');
      expect(result.source).toBe('customer-policy');
      // 模型被调用两次（首次 + 一次 regeneration）
      expect(invokeMock).toHaveBeenCalledTimes(2);
      // session memory 不应有 assistant 写入（fail-closed 时连 session 都不应创建）
      const session = sessionMemory.get('sess-1');
      const assistantMsgs = session?.messages.filter((m) => m.role === 'assistant') ?? [];
      expect(assistantMsgs).toHaveLength(0);
      // analytical memory 也不应写入违规内容
      const analytical = analyticalMemory.get('sess-1');
      expect(analytical?.latestHomepageBrief).toBeUndefined();
    });

    it('regeneration 通过后只写入通过版本', async () => {
      const sessionMemory = new InMemorySessionMemoryStore();
      const analyticalMemory = new InMemoryAnalyticalMemoryStore();
      const badSummary = '你刚吃完饭，运动强度 4.2。';
      // Task 3.3: 合规 summary 需满足 zh 220-420 grapheme 区间
      const goodSummary = COMPLIANT_SUMMARY;
      const invokeMock = vi.fn();
      // 两次调用：第一次违规，第二次合规
      invokeMock.mockResolvedValueOnce({ content: JSON.stringify({ summary: badSummary, chartTokens: [], microTips: [] }) });
      invokeMock.mockResolvedValueOnce({ content: JSON.stringify({ summary: goodSummary, chartTokens: [], microTips: [] }) });

      const deps: AgentRuntimeDeps = {
        ...makeDeps({ invoke: invokeMock }),
        sessionMemory,
        analyticalMemory,
      };

      const result = await executeAgent(makeRequest(), deps);

      // 模型被调用两次（初次 + regeneration）
      expect(invokeMock).toHaveBeenCalledTimes(2);
      // 最终返回的是通过版本
      expect(result.summary).toBe(goodSummary);
      expect(result.meta.finishReason).toBe('complete');
      // session memory 只有 goodSummary 被写入
      const session = sessionMemory.get('sess-1');
      const assistantMsgs = session?.messages.filter((m) => m.role === 'assistant') ?? [];
      expect(assistantMsgs).toHaveLength(1);
      expect(assistantMsgs[0]!.text).toBe(goodSummary);
      // 违规 summary 不得出现在 memory
      const allText = (session?.messages ?? []).map((m) => m.text).join('');
      expect(allText).not.toContain(badSummary);
      // analytical memory 也只保留 goodSummary
      expect(analyticalMemory.get('sess-1')?.latestHomepageBrief).toBe(goodSummary);
    });

    it('regeneration 超时会返回 timeout fallback，而不会无限等待', async () => {
      const badSummary = '你刚吃完饭，运动强度 4.2。';
      const invokeMock = vi.fn();
      invokeMock.mockResolvedValueOnce({
        content: JSON.stringify({ summary: badSummary, chartTokens: [], microTips: [] }),
      });
      invokeMock.mockImplementationOnce(() => new Promise<never>(() => {}));

      const result = await executeAgent(makeRequest(), makeDeps({ invoke: invokeMock }), 10);

      expect(invokeMock).toHaveBeenCalledTimes(2);
      expect(result.source).toBe('fallback');
      expect(result.meta.finishReason).toBe('timeout');
    });

    it('第二次 regeneration 仍违规 → 返回 typed error，不写 memory', async () => {
      const sessionMemory = new InMemorySessionMemoryStore();
      const analyticalMemory = new InMemoryAnalyticalMemoryStore();
      const badSummary1 = '你刚吃完饭，运动强度 4.2。';
      const badSummary2 = '本次睡眠评分 95 分，压力负荷 88。';
      const invokeMock = vi.fn();
      invokeMock.mockResolvedValueOnce({ content: JSON.stringify({ summary: badSummary1, chartTokens: [], microTips: [] }) });
      invokeMock.mockResolvedValueOnce({ content: JSON.stringify({ summary: badSummary2, chartTokens: [], microTips: [] }) });

      const deps: AgentRuntimeDeps = {
        ...makeDeps({ invoke: invokeMock }),
        sessionMemory,
        analyticalMemory,
      };

      const result = await executeAgent(makeRequest(), deps);

      // 两次都违规 → fail-closed typed error
      expect(invokeMock).toHaveBeenCalledTimes(2);
      expect(result.meta.finishReason).toBe('fallback');
      // 两次违规 summary 都不写入 session memory
      const session = sessionMemory.get('sess-1');
      const allText = (session?.messages ?? []).map((m) => m.text).join('');
      expect(allText).not.toContain(badSummary1);
      expect(allText).not.toContain(badSummary2);
      // analytical memory 未写入
      expect(analyticalMemory.get('sess-1')?.latestHomepageBrief).toBeUndefined();
    });

    it('cleanSafetyIssues 不处理新增的 4 类客户边界', async () => {
      // 验证：即使 safety-cleaner 能清洗"确诊/诊断"等，它不会把"运动强度 4.2"这类
      // internal_score_disclosed 视为可清洗问题。
      const { cleanSafetyIssues } = await import('../../output/safety-cleaner');
      const cleaned = cleanSafetyIssues('今天运动强度 4.2，整体偏高。', [], [], []);
      // 原文应当被保留（未被字符串清洗），让 policy 层去 fail-closed
      expect(cleaned.cleaned).toContain('运动强度 4.2');
      expect(cleaned.flags).toHaveLength(0);
    });
  });
});
