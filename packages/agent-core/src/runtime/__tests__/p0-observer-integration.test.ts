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
      expect(result.summary).toBe('整体状态良好。');
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
      expect(result.summary).toBe('整体状态良好。');
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
      expect(result.summary).toBe('整体状态良好。');
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
      expect(result.summary).toBe('整体状态良好。');
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
      expect(result.summary).toBe('整体状态良好。');
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
});
