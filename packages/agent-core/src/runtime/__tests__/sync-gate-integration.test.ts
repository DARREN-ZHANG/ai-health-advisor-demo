/**
 * P3 Sync Gate 集成测试
 *
 * 验证 sync reflection gate 接入 runtime 后的行为：
 * 1. 高风险触发 + approved → sync gate 返回 approved → 正常返回
 * 2. 高风险触发 + rejected + 重生成通过 → gate rejected → 重生成 → approved
 * 3. 高风险触发 + rejected + 重生成仍不通过 → gate rejected → 重生成 → rejected → 返回安全边界
 * 4. 非高风险不触发 → sync gate 不执行
 * 5. 无 syncReviewer 不触发 → 高风险场景走正常路径
 * 6. Hard failure 触发 → verificationReport 有 hardFailures → 触发 sync gate
 * 7. 高风险话题触发 → userMessage 匹配运动/诊断/用药模式 → 触发 sync gate
 * 8. Observer 回调验证 → onSyncGate 在审核后触发，onSafetyBoundary 在安全边界时触发
 */
import { describe, it, expect, vi } from 'vitest';
import { executeAgent, type AgentRuntimeDeps, type AgentRuntimeObserver } from '../agent-runtime';
import type { AgentRequest } from '../../types/agent-request';
import type { HealthAgent } from '../../executor/create-agent';
import type { PromptLoader } from '../../prompts/prompt-loader';
import type { FallbackEngine } from '../../fallback/fallback-engine';
import type { SyncReflectionReviewer } from '../../output/reflection-reviewer';
import type { SyncGateResult } from '../../output/sync-reflection-gate';
import type { ReflectionReviewResult } from '../../output/reflection-schema';
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
    requestId: 'req-sync-1',
    sessionId: 'sess-sync-1',
    profileId: 'profile-a',
    taskType: AgentTaskType.ADVISOR_CHAT,
    pageContext: { profileId: 'profile-a', page: 'advisor', timeframe: 'week' },
    userMessage: '我最近的睡眠怎么样？',
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

/** 构造 mock SyncReflectionReviewer，控制 review 的返回结果 */
function makeSyncReviewer(reviewResults: ReflectionReviewResult[]): {
  reviewer: SyncReflectionReviewer;
  reviewInvoke: ReturnType<typeof vi.fn>;
} {
  // 每次调用 review 返回 results 数组中的下一个结果
  let callIndex = 0;
  const reviewInvoke = vi.fn(async () => {
    const result = reviewResults[Math.min(callIndex, reviewResults.length - 1)];
    callIndex++;
    return result;
  });

  const reviewer = {
    review: reviewInvoke,
  } as unknown as SyncReflectionReviewer;

  return { reviewer, reviewInvoke };
}

/** 构造 deps，可注入 syncReviewer */
function makeDeps(
  agentOverrides: Partial<HealthAgent> = {},
  syncReviewer?: SyncReflectionReviewer,
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
    syncReviewer,
  };
}

/** 构造 approved 的审核结果 */
function makeApprovedResult(): ReflectionReviewResult {
  return { approved: true, violations: [] };
}

/** 构造 rejected 的审核结果 */
function makeRejectedResult(violations?: ReflectionReviewResult['violations']): ReflectionReviewResult {
  return {
    approved: false,
    violations: violations ?? [
      {
        category: 'safety',
        severity: 'high',
        description: '回复包含诊断性结论',
        requiredChanges: '移除诊断性表述，改为建议性语言',
      },
    ],
  };
}

// ── 测试用例 ──────────────────────────────────────

describe('P3 Sync Gate 集成测试', () => {
  /** 用于触发高风险条件的运动准备度请求 */
  const highRiskRequest = makeAdvisorChatRequest({
    userMessage: '我今天能跑步吗？',
  });

  describe('高风险触发 + approved', () => {
    it('sync gate 返回 approved 时正常返回原始结果', async () => {
      const { reviewer } = makeSyncReviewer([makeApprovedResult()]);
      const solverInvoke = vi.fn(async () => ({
        content: JSON.stringify({
          summary: '根据您目前的身体状态，适当运动是可以的。',
          chartTokens: [],
          microTips: ['注意运动强度'],
        }),
      }));

      const deps = makeDeps({ invoke: solverInvoke }, reviewer);
      const onSyncGate = vi.fn();
      const onSafetyBoundary = vi.fn();

      const result = await executeAgent(
        highRiskRequest,
        deps,
        undefined,
        { onSyncGate, onSafetyBoundary },
      );

      // 返回原始结果
      expect(result.summary).toBe('根据您目前的身体状态，适当运动是可以的。');
      expect(result.meta.finishReason).toBe('complete');

      // solver 只调用一次（无重生成）
      expect(solverInvoke).toHaveBeenCalledTimes(1);

      // onSyncGate 触发一次，approved
      expect(onSyncGate).toHaveBeenCalledTimes(1);
      expect(onSyncGate.mock.calls[0]![0].approved).toBe(true);

      // onSafetyBoundary 不触发
      expect(onSafetyBoundary).not.toHaveBeenCalled();
    });
  });

  describe('高风险触发 + rejected + 重生成通过', () => {
    it('gate rejected → 重生成 → approved → 返回重生成结果', async () => {
      const { reviewer, reviewInvoke } = makeSyncReviewer([
        makeRejectedResult(), // 第一次审核 rejected
        makeApprovedResult(), // 重生成后审核 approved
      ]);

      let invokeCount = 0;
      const solverInvoke = vi.fn(async () => {
        invokeCount++;
        if (invokeCount === 1) {
          // 原始调用：包含诊断性表述
          return {
            content: JSON.stringify({
              summary: '你患了心脏病，不能跑步。',
              chartTokens: [],
              microTips: ['不要运动'],
            }),
          };
        }
        // 重生成：修正后的回复
        return {
          content: JSON.stringify({
            summary: '建议您先咨询医生，确认身体状况适合运动后再开始。',
            chartTokens: [],
            microTips: ['咨询专业医生'],
          }),
        };
      });

      const deps = makeDeps({ invoke: solverInvoke }, reviewer);
      const onSyncGate = vi.fn();
      const onSafetyBoundary = vi.fn();
      const onParsed = vi.fn();

      const result = await executeAgent(
        highRiskRequest,
        deps,
        undefined,
        { onSyncGate, onSafetyBoundary, onParsed },
      );

      // 返回重生成结果
      expect(result.summary).toBe('建议您先咨询医生，确认身体状况适合运动后再开始。');
      expect(result.meta.finishReason).toBe('complete');

      // solver 调用两次（原始 + 重生成）
      expect(solverInvoke).toHaveBeenCalledTimes(2);

      // review 调用两次（原始审核 + 重生成审核）
      expect(reviewInvoke).toHaveBeenCalledTimes(2);

      // onSyncGate 触发两次：第一次 rejected，第二次 approved
      expect(onSyncGate).toHaveBeenCalledTimes(2);
      expect(onSyncGate.mock.calls[0]![0].approved).toBe(false);
      expect(onSyncGate.mock.calls[1]![0].approved).toBe(true);

      // onSafetyBoundary 不触发（因为重生成通过了）
      expect(onSafetyBoundary).not.toHaveBeenCalled();

      // onParsed 触发一次（重生成通过的版本）
      expect(onParsed).toHaveBeenCalledTimes(1);
      expect(onParsed.mock.calls[0]![0].summary).toBe('建议您先咨询医生，确认身体状况适合运动后再开始。');
    });
  });

  describe('高风险触发 + rejected + 重生成仍不通过', () => {
    it('gate rejected → 重生成 → rejected → 返回安全边界响应', async () => {
      const violations: ReflectionReviewResult['violations'] = [
        {
          category: 'safety',
          severity: 'high',
          description: '回复包含治疗承诺',
          requiredChanges: '移除治疗承诺表述',
        },
      ];
      const { reviewer, reviewInvoke } = makeSyncReviewer([
        { approved: false, violations }, // 第一次审核 rejected
        { approved: false, violations }, // 重生成后审核仍 rejected
      ]);

      const solverInvoke = vi.fn(async () => ({
        content: JSON.stringify({
          summary: '你的病一定会好的。',
          chartTokens: [],
          microTips: [],
        }),
      }));

      const deps = makeDeps({ invoke: solverInvoke }, reviewer);
      const onSyncGate = vi.fn();
      const onSafetyBoundary = vi.fn();
      const onParsed = vi.fn();

      const result = await executeAgent(
        highRiskRequest,
        deps,
        undefined,
        { onSyncGate, onSafetyBoundary, onParsed },
      );

      // 返回安全边界响应
      expect(result.source).toBe('sync-gate');
      expect(result.summary).toContain('安全');
      expect(result.summary).toContain('建议咨询专业医生');
      expect(result.summary).toContain('回复包含治疗承诺');
      expect(result.meta.finishReason).toBe('fallback');

      // solver 调用两次（原始 + 重生成）
      expect(solverInvoke).toHaveBeenCalledTimes(2);

      // review 调用两次
      expect(reviewInvoke).toHaveBeenCalledTimes(2);

      // onSyncGate 触发一次（第一次 rejected）
      expect(onSyncGate).toHaveBeenCalledTimes(1);
      expect(onSyncGate.mock.calls[0]![0].approved).toBe(false);

      // onSafetyBoundary 触发一次
      expect(onSafetyBoundary).toHaveBeenCalledTimes(1);
      expect(onSafetyBoundary.mock.calls[0]![0]).toEqual(violations);

      // onParsed 不触发（因为最终走安全边界）
      expect(onParsed).not.toHaveBeenCalled();
    });
  });

  describe('非高风险不触发', () => {
    it('无风险等级、无高风险话题时不触发 sync gate', async () => {
      const { reviewer, reviewInvoke } = makeSyncReviewer([makeApprovedResult()]);
      const solverInvoke = vi.fn(async () => ({
        content: JSON.stringify({
          summary: '您最近睡眠质量不错。',
          chartTokens: [],
          microTips: ['保持规律作息'],
        }),
      }));

      const deps = makeDeps({ invoke: solverInvoke }, reviewer);
      const onSyncGate = vi.fn();
      const onSafetyBoundary = vi.fn();

      // 非高风险请求：普通睡眠咨询，无运动/诊断/用药关键词
      const normalRequest = makeAdvisorChatRequest({
        userMessage: '我最近的睡眠怎么样？',
      });

      const result = await executeAgent(
        normalRequest,
        deps,
        undefined,
        { onSyncGate, onSafetyBoundary },
      );

      // 正常返回
      expect(result.summary).toBe('您最近睡眠质量不错。');
      expect(result.meta.finishReason).toBe('complete');

      // solver 只调用一次
      expect(solverInvoke).toHaveBeenCalledTimes(1);

      // sync gate 不触发
      expect(reviewInvoke).not.toHaveBeenCalled();
      expect(onSyncGate).not.toHaveBeenCalled();
      expect(onSafetyBoundary).not.toHaveBeenCalled();
    });
  });

  describe('无 syncReviewer 不触发', () => {
    it('deps 无 syncReviewer 时高风险场景走正常路径', async () => {
      const solverInvoke = vi.fn(async () => ({
        content: JSON.stringify({
          summary: '适当运动是可以的。',
          chartTokens: [],
          microTips: ['注意运动强度'],
        }),
      }));

      // 不传入 syncReviewer
      const deps = makeDeps({ invoke: solverInvoke });
      const onSyncGate = vi.fn();
      const onSafetyBoundary = vi.fn();

      const result = await executeAgent(
        highRiskRequest,
        deps,
        undefined,
        { onSyncGate, onSafetyBoundary },
      );

      // 正常返回，不走 sync gate
      expect(result.summary).toBe('适当运动是可以的。');
      expect(result.meta.finishReason).toBe('complete');

      // solver 只调用一次
      expect(solverInvoke).toHaveBeenCalledTimes(1);

      // sync gate 回调不触发
      expect(onSyncGate).not.toHaveBeenCalled();
      expect(onSafetyBoundary).not.toHaveBeenCalled();
    });
  });

  describe('Hard failure 触发', () => {
    it('verifier 有 hardFailures 时触发 sync gate', async () => {
      // 使用普通请求（无高风险话题），通过让 solver 输出包含治疗承诺触发 hard failure
      // verifier 的 safety:treatment_promise 检测到 "治愈" 会产生 hard failure
      // cleanSafetyIssues 不会替换 "治愈"，所以 verifier 能检测到

      const { reviewer, reviewInvoke } = makeSyncReviewer([makeApprovedResult()]);
      const solverInvoke = vi.fn(async () => ({
        content: JSON.stringify({
          summary: '坚持治疗可以治愈你的疾病。',
          chartTokens: [],
          microTips: ['保持规律作息'],
        }),
      }));

      const deps = makeDeps({ invoke: solverInvoke }, reviewer);
      const onSyncGate = vi.fn();

      // 普通请求（非高风险话题），但因 hard failure 触发 sync gate
      const normalRequest = makeAdvisorChatRequest({
        userMessage: '我的健康数据怎么样？',
      });

      const result = await executeAgent(
        normalRequest,
        deps,
        undefined,
        { onSyncGate },
      );

      // 因 hard failure 触发 sync gate
      expect(reviewInvoke).toHaveBeenCalledTimes(1);
      expect(onSyncGate).toHaveBeenCalledTimes(1);
      expect(onSyncGate.mock.calls[0]![0].approved).toBe(true);
      expect(result.meta.finishReason).toBe('complete');
    });
  });

  describe('高风险话题触发', () => {
    it('userMessage 匹配运动模式时触发 sync gate', async () => {
      const { reviewer, reviewInvoke } = makeSyncReviewer([makeApprovedResult()]);
      const solverInvoke = vi.fn(async () => ({
        content: JSON.stringify({
          summary: '可以适当运动。',
          chartTokens: [],
          microTips: ['注意强度'],
        }),
      }));

      const deps = makeDeps({ invoke: solverInvoke }, reviewer);
      const onSyncGate = vi.fn();

      const result = await executeAgent(
        makeAdvisorChatRequest({ userMessage: '我能跑步吗？' }),
        deps,
        undefined,
        { onSyncGate },
      );

      expect(result.meta.finishReason).toBe('complete');
      expect(reviewInvoke).toHaveBeenCalledTimes(1);
      expect(onSyncGate).toHaveBeenCalledTimes(1);
    });

    it('userMessage 匹配诊断模式时触发 sync gate', async () => {
      const { reviewer, reviewInvoke } = makeSyncReviewer([makeApprovedResult()]);
      const solverInvoke = vi.fn(async () => ({
        content: JSON.stringify({
          summary: '建议咨询医生进行诊断。',
          chartTokens: [],
          microTips: ['定期体检'],
        }),
      }));

      const deps = makeDeps({ invoke: solverInvoke }, reviewer);
      const onSyncGate = vi.fn();

      const result = await executeAgent(
        makeAdvisorChatRequest({ userMessage: '我最近心跳很快，是不是确诊了什么病？' }),
        deps,
        undefined,
        { onSyncGate },
      );

      expect(result.meta.finishReason).toBe('complete');
      expect(reviewInvoke).toHaveBeenCalledTimes(1);
      expect(onSyncGate).toHaveBeenCalledTimes(1);
    });

    it('userMessage 匹配用药模式时触发 sync gate', async () => {
      const { reviewer, reviewInvoke } = makeSyncReviewer([makeApprovedResult()]);
      const solverInvoke = vi.fn(async () => ({
        content: JSON.stringify({
          summary: '请遵医嘱用药。',
          chartTokens: [],
          microTips: ['不要自行调整药物'],
        }),
      }));

      const deps = makeDeps({ invoke: solverInvoke }, reviewer);
      const onSyncGate = vi.fn();

      // 使用 "用药" 关键词，匹配 /用药/ 模式
      const result = await executeAgent(
        makeAdvisorChatRequest({ userMessage: '我的用药方案需要调整吗？' }),
        deps,
        undefined,
        { onSyncGate },
      );

      expect(result.meta.finishReason).toBe('complete');
      expect(reviewInvoke).toHaveBeenCalledTimes(1);
      expect(onSyncGate).toHaveBeenCalledTimes(1);
    });

    it('userMessage 匹配治疗承诺模式时触发 sync gate', async () => {
      const { reviewer, reviewInvoke } = makeSyncReviewer([makeApprovedResult()]);
      const solverInvoke = vi.fn(async () => ({
        content: JSON.stringify({
          summary: '坚持治疗会好转。',
          chartTokens: [],
          microTips: ['定期复查'],
        }),
      }));

      const deps = makeDeps({ invoke: solverInvoke }, reviewer);
      const onSyncGate = vi.fn();

      const result = await executeAgent(
        makeAdvisorChatRequest({ userMessage: '这个治疗一定会好吗？' }),
        deps,
        undefined,
        { onSyncGate },
      );

      expect(result.meta.finishReason).toBe('complete');
      expect(reviewInvoke).toHaveBeenCalledTimes(1);
      expect(onSyncGate).toHaveBeenCalledTimes(1);
    });
  });

  describe('Observer 回调验证', () => {
    it('onSyncGate 在审核后触发，approved 时结果包含 approved=true', async () => {
      const { reviewer } = makeSyncReviewer([makeApprovedResult()]);
      const deps = makeDeps({}, reviewer);
      const onSyncGate = vi.fn();

      await executeAgent(
        highRiskRequest,
        deps,
        undefined,
        { onSyncGate },
      );

      expect(onSyncGate).toHaveBeenCalledTimes(1);
      const gateResult: SyncGateResult = onSyncGate.mock.calls[0]![0];
      expect(gateResult.approved).toBe(true);
      expect(gateResult.reviewResult).toBeDefined();
      expect(gateResult.reviewResult!.approved).toBe(true);
    });

    it('onSafetyBoundary 在安全边界时触发，包含违规信息', async () => {
      const violations: ReflectionReviewResult['violations'] = [
        {
          category: 'safety',
          severity: 'high',
          description: '回复包含诊断性结论',
          requiredChanges: '移除诊断性表述',
        },
        {
          category: 'accuracy',
          severity: 'medium',
          description: '数据引用不准确',
          requiredChanges: '核实数据来源',
        },
      ];
      const { reviewer } = makeSyncReviewer([
        { approved: false, violations },
        { approved: false, violations },
      ]);

      const solverInvoke = vi.fn(async () => ({
        content: JSON.stringify({
          summary: '你确诊了高血压。',
          chartTokens: [],
          microTips: [],
        }),
      }));

      const deps = makeDeps({ invoke: solverInvoke }, reviewer);
      const onSyncGate = vi.fn();
      const onSafetyBoundary = vi.fn();

      const result = await executeAgent(
        highRiskRequest,
        deps,
        undefined,
        { onSyncGate, onSafetyBoundary },
      );

      // 安全边界响应
      expect(result.source).toBe('sync-gate');
      expect(result.meta.finishReason).toBe('fallback');

      // onSafetyBoundary 触发并包含违规信息
      expect(onSafetyBoundary).toHaveBeenCalledTimes(1);
      expect(onSafetyBoundary.mock.calls[0]![0]).toEqual(violations);
    });

    it('observer 回调时序：onVerified → onSyncGate → onParsed（approved 场景）', async () => {
      const { reviewer } = makeSyncReviewer([makeApprovedResult()]);
      const deps = makeDeps({}, reviewer);

      const callOrder: string[] = [];
      const observer: AgentRuntimeObserver = {
        onVerified: () => { callOrder.push('onVerified'); },
        onSyncGate: () => { callOrder.push('onSyncGate'); },
        onParsed: () => { callOrder.push('onParsed'); },
      };

      await executeAgent(highRiskRequest, deps, undefined, observer);

      expect(callOrder).toEqual(['onVerified', 'onSyncGate', 'onParsed']);
    });

    it('observer 回调时序：onVerified → onSyncGate → onSafetyBoundary（rejected 场景）', async () => {
      const violations = [makeRejectedResult().violations[0]!];
      const { reviewer } = makeSyncReviewer([
        { approved: false, violations },
        { approved: false, violations },
      ]);

      const solverInvoke = vi.fn(async () => ({
        content: JSON.stringify({
          summary: '诊断结果。',
          chartTokens: [],
          microTips: [],
        }),
      }));

      const deps = makeDeps({ invoke: solverInvoke }, reviewer);

      const callOrder: string[] = [];
      const observer: AgentRuntimeObserver = {
        onVerified: () => { callOrder.push('onVerified'); },
        onSyncGate: () => { callOrder.push('onSyncGate'); },
        onSafetyBoundary: () => { callOrder.push('onSafetyBoundary'); },
        onParsed: () => { callOrder.push('onParsed'); },
      };

      const result = await executeAgent(highRiskRequest, deps, undefined, observer);

      // 安全边界响应，onParsed 不触发
      expect(result.source).toBe('sync-gate');
      expect(callOrder).toEqual(['onVerified', 'onSyncGate', 'onSafetyBoundary']);
    });
  });

  describe('重生成解析失败', () => {
    it('重生成的 LLM 输出无法解析时，返回安全边界响应', async () => {
      const { reviewer } = makeSyncReviewer([
        makeRejectedResult(), // 第一次审核 rejected
      ]);

      let invokeCount = 0;
      const solverInvoke = vi.fn(async () => {
        invokeCount++;
        if (invokeCount === 1) {
          return {
            content: JSON.stringify({
              summary: '诊断性回复。',
              chartTokens: [],
              microTips: [],
            }),
          };
        }
        // 重生成返回无效 JSON
        return { content: 'this is not json' };
      });

      const deps = makeDeps({ invoke: solverInvoke }, reviewer);
      const onSafetyBoundary = vi.fn();

      const result = await executeAgent(
        highRiskRequest,
        deps,
        undefined,
        { onSafetyBoundary },
      );

      // 解析失败，走安全边界
      expect(result.source).toBe('sync-gate');
      expect(result.meta.finishReason).toBe('fallback');
      expect(onSafetyBoundary).toHaveBeenCalledTimes(1);
    });
  });
});
