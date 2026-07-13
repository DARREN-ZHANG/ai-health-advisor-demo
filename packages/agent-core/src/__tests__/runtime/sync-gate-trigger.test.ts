import { describe, it, expect, vi } from 'vitest';
import { executeAgent, type AgentRuntimeDeps } from '../../runtime/agent-runtime';
import type { AgentRequest } from '../../types/agent-request';
import type { HealthAgent } from '../../executor/create-agent';
import type { PromptLoader } from '../../prompts/prompt-loader';
import type { FallbackEngine } from '../../fallback/fallback-engine';
import type { ProfileData, DailyRecord } from '@health-advisor/shared';
import type { DatedEvent } from '@health-advisor/sandbox';
import { AgentTaskType } from '@health-advisor/shared';
import { InMemorySessionMemoryStore } from '../../memory/session-memory-store';
import { InMemoryAnalyticalMemoryStore } from '../../memory/analytical-memory-store';
import { SyncReflectionReviewer } from '../../output/reflection-reviewer';
import type { PlanBuilderDeps } from '../../planner/advisor-plan-builder';

// ── 工具函数 ──────────────────────────────────────────

function makeRecord(date: string, overrides: Partial<DailyRecord> = {}): DailyRecord {
  return {
    date,
    hr: [60, 62],
    hrv: 58,
    sleep: {
      totalMinutes: 420,
      startTime: '23:00',
      endTime: '06:00',
      stages: { deep: 90, light: 180, rem: 120, awake: 30 },
      score: 85,
    },
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
    records: records ?? Array.from({ length: 7 }, (_, i) =>
      makeRecord(`2026-04-${String(18 + i).padStart(2, '0')}`),
    ),
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

/** 创建 always-approve 的 syncReviewer */
function makeSyncReviewer(): SyncReflectionReviewer {
  return new SyncReflectionReviewer({
    reviewerAgent: {
      invoke: vi.fn().mockResolvedValue({
        content: JSON.stringify({ approved: true, violations: [] }),
      }),
    },
    gatePrompt: '你是审核员',
  });
}

/** 创建返回指定 plan 的 planBuilder mock */
function makePlanBuilder(overrides: Record<string, unknown> = {}): PlanBuilderDeps {
  const plan = {
    planId: 'plan-1',
    taskType: 'advisor_chat',
    userIntent: {
      action: 'general',
      riskLevel: 'general',
      needsClarification: false,
      ...overrides.userIntent,
    },
    evidenceNeeds: (overrides.evidenceNeeds as unknown[]) ?? [],
    safetyConstraints: (overrides.safetyConstraints as string[]) ?? [],
    answerShape: {
      includeMissingDataDisclosure: false,
      includeChartTokens: false,
      maxSummaryLength: 300,
      tone: 'concise' as const,
      ...(overrides.answerShape as Record<string, unknown>),
    },
  };
  return {
    plannerAgent: {
      invoke: vi.fn().mockResolvedValue({
        content: JSON.stringify(plan),
      }),
    },
    plannerPrompt: '你是 planner',
  };
}

/** 构造 deps，支持注入 syncReviewer 和 planBuilder */
function makeDeps(
  agentOverrides: Partial<HealthAgent> = {},
  extra: { syncReviewer?: SyncReflectionReviewer; planBuilder?: PlanBuilderDeps; records?: DailyRecord[] } = {},
): AgentRuntimeDeps {
  const data = makeProfileData(extra.records);
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
          // Task 3.3: homepage summary 需满足 zh 220-420 grapheme 区间
          summary:
            '今天整体状态良好，各项生理指标处于稳定区间。夜间睡眠时长充足，深睡与浅睡比例合理，晨起恢复状况良好；白天活动量适中，心率与血氧饱和度保持在正常水平，压力负荷处于较低区间。当前没有出现明显的生理异常或需要关注的事件，身体处于稳态。建议继续保持规律的作息安排与均衡饮食结构，适当安排户外散步或轻度运动，以维持当前的稳态并促进长期健康。如出现任何不适或数据异常，请及时咨询专业医疗人员获取准确的评估和指导。今日可关注夜间睡眠质量与明日晨起准备度之间的关联。',
          source: 'llm',
          statusColor: 'good',
          chartTokens: [],
          microTips: [],
        }),
      })),
    },
    promptLoader: mockPromptLoader,
    fallbackEngine: mockFallbackEngine,
    ...(extra.syncReviewer ? { syncReviewer: extra.syncReviewer } : {}),
    ...(extra.planBuilder ? { planBuilder: extra.planBuilder } : {}),
  };
}

// ── 测试用例 ──────────────────────────────────────────

describe('shouldTriggerSyncGate 间接测试', () => {
  it('高风险话题（运动准备度）触发同步审核闸门', async () => {
    // 通过 userMessage 匹配 HIGH_RISK_TOPIC_PATTERNS 中的"能.*运动"模式来触发 sync gate
    // shouldTriggerSyncGate 条件 2: 用户询问运动准备度
    const onSyncGate = vi.fn();
    const syncReviewer = makeSyncReviewer();

    const deps = makeDeps(
      {},
      { syncReviewer },
    );

    await executeAgent(
      makeRequest({
        taskType: AgentTaskType.HOMEPAGE_SUMMARY,
        userMessage: '我今天能去运动吗',
      }),
      deps,
      undefined,
      { onSyncGate },
    );

    // 验证 sync gate 被触发（onSyncGate observer 回调被调用）
    expect(onSyncGate).toHaveBeenCalledTimes(1);
    const gateResult = onSyncGate.mock.calls[0]![0];
    expect(gateResult).toHaveProperty('approved');
    expect(gateResult).toHaveProperty('reviewResult');
  });

  it('disclose_missing_data 约束 + 缺失数据 >= 2 个字段触发同步审核闸门', async () => {
    // shouldTriggerSyncGate 条件 5: plan.safetyConstraints 包含 'disclose_missing_data'
    // 且 context.dataWindow.missingFields.length >= 2
    const onSyncGate = vi.fn();
    const syncReviewer = makeSyncReviewer();

    // 构造记录：spo2 和 stress 大部分缺失（超过 50%），使 detectMissingFields 检测到 2 个缺失字段
    const records = Array.from({ length: 7 }, (_, i) => {
      const date = `2026-04-${String(18 + i).padStart(2, '0')}`;
      // 前 4 条 spo2 和 stress 缺失，超过 50% 的记录缺失
      if (i < 4) {
        return makeRecord(date, { spo2: undefined, stress: undefined });
      }
      return makeRecord(date);
    });

    const planBuilder = makePlanBuilder({
      safetyConstraints: ['disclose_missing_data'],
    });

    const deps = makeDeps(
      {},
      { syncReviewer, planBuilder, records },
    );

    await executeAgent(
      makeRequest({
        taskType: AgentTaskType.ADVISOR_CHAT,
        userMessage: '帮我看看最近身体状况',
      }),
      deps,
      undefined,
      { onSyncGate },
    );

    // 验证 sync gate 被触发
    expect(onSyncGate).toHaveBeenCalledTimes(1);
    const gateResult = onSyncGate.mock.calls[0]![0];
    expect(gateResult.approved).toBe(true);
  });
});
