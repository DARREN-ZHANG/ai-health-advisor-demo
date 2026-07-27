import { describe, it, expect, vi } from 'vitest';
import type { HealthAgent } from '../../executor/create-agent';
import type { PlanBuilderDeps, PlanBuilderInput } from '../advisor-plan-builder';
import { buildAnalysisPlan, buildAnalysisPlanWithRetry } from '../advisor-plan-builder';
import { AnalysisPlanSchema } from '../analysis-plan';
import type { TaskContextPacket } from '../../context/context-packet';

/** 构造最小合法的 PlanBuilderInput */
function createValidInput(overrides?: Partial<PlanBuilderInput>): PlanBuilderInput {
  return {
    userMessage: '我最近 HRV 怎么样？',
    pageContext: {
      profileId: 'profile-001',
      page: 'advisor',
      timeframe: 'week',
    },
    basePacket: {} as TaskContextPacket,
    supportedMetrics: ['hrv', 'sleep', 'activity', 'stress', 'spo2', 'resting-hr'],
    availableDateRange: { start: '2025-01-01', end: '2025-12-31' },
    ...overrides,
  };
}

/** 构造一个合法的 AnalysisPlan JSON 对象 */
function createValidPlanJson(): Record<string, unknown> {
  return {
    planId: 'plan-test-001',
    taskType: 'advisor_chat',
    userIntent: {
      action: 'status_summary',
      riskLevel: 'general',
      needsClarification: false,
    },
    evidenceNeeds: [
      {
        metric: 'hrv',
        timeScope: 'week',
        dateRange: { start: '2025-06-01', end: '2025-06-07' },
        reason: '用户询问最近 HRV 数据',
        required: true,
      },
    ],
    safetyConstraints: ['no_diagnosis', 'no_medication_advice'],
    answerShape: {
      includeMissingDataDisclosure: true,
      includeChartTokens: false,
      maxSummaryLength: 300,
      tone: 'concise',
    },
  };
}

/** 构造 mock plannerAgent */
function createMockAgent(response: string): HealthAgent {
  return {
    invoke: vi.fn().mockResolvedValue({ content: response }),
  } as unknown as HealthAgent;
}

/** 构造 deps */
function createDeps(agent: HealthAgent): PlanBuilderDeps {
  return {
    plannerAgent: agent,
    plannerPrompt: '你是一个健康数据分析规划器。',
  };
}

// ────────────────────────────────────────────
// 测试
// ────────────────────────────────────────────

describe('buildAnalysisPlan', () => {
  it('成功生成 plan（返回合法 JSON）', async () => {
    const validPlan = createValidPlanJson();
    const agent = createMockAgent(JSON.stringify(validPlan));
    const result = await buildAnalysisPlan(createDeps(agent), createValidInput());

    expect(result.success).toBe(true);
    expect(result.plan).toBeDefined();
    expect(result.plan!.planId).toBe('plan-test-001');
    expect(result.parseError).toBeUndefined();
    expect(result.verificationResult).toBeUndefined();
  });

  it('支持 markdown code block 包裹的 JSON', async () => {
    const validPlan = createValidPlanJson();
    const wrapped = '```json\n' + JSON.stringify(validPlan, null, 2) + '\n```';
    const agent = createMockAgent(wrapped);
    const result = await buildAnalysisPlan(createDeps(agent), createValidInput());

    expect(result.success).toBe(true);
    expect(result.plan).toBeDefined();
  });

  it('JSON 解析失败时返回 parseError', async () => {
    const agent = createMockAgent('这不是 JSON 格式的文本');
    const result = await buildAnalysisPlan(createDeps(agent), createValidInput());

    expect(result.success).toBe(false);
    expect(result.parseError).toContain('JSON 解析失败');
    expect(result.plan).toBeUndefined();
  });

  it('Schema 校验失败时返回 parseError', async () => {
    // 缺少 taskType 字段
    const invalidPlan = { ...createValidPlanJson(), taskType: undefined };
    const agent = createMockAgent(JSON.stringify(invalidPlan));
    const result = await buildAnalysisPlan(createDeps(agent), createValidInput());

    expect(result.success).toBe(false);
    expect(result.parseError).toContain('taskType');
  });

  it('Schema 校验失败 — 缺少 evidenceNeeds', async () => {
    const { evidenceNeeds, ...planWithoutEvidence } = createValidPlanJson();
    const agent = createMockAgent(JSON.stringify(planWithoutEvidence));
    const result = await buildAnalysisPlan(createDeps(agent), createValidInput());

    expect(result.success).toBe(false);
    expect(result.parseError).toBeDefined();
  });

  it('业务规则校验失败（metric 不在 supportedMetrics）返回 verificationResult', async () => {
    const plan = createValidPlanJson();
    // 修改 evidenceNeeds 中的 metric 为一个不被支持的值
    // 但需要先确保 schema 通过，所以用合法 metric 但 verifier 上下文不支持
    const agent = createMockAgent(JSON.stringify(plan));
    const input = createValidInput({
      supportedMetrics: ['sleep', 'activity'], // 不包含 hrv
    });
    const result = await buildAnalysisPlan(createDeps(agent), input);

    expect(result.success).toBe(false);
    expect(result.verificationResult).toBeDefined();
    expect(result.verificationResult!.valid).toBe(false);
    expect(result.verificationResult!.violations.length).toBeGreaterThan(0);
  });

  it('业务规则校验失败（dateRange 超出可用范围）', async () => {
    const plan = createValidPlanJson();
    const agent = createMockAgent(JSON.stringify(plan));
    const input = createValidInput({
      availableDateRange: { start: '2025-07-01', end: '2025-07-31' },
    });
    const result = await buildAnalysisPlan(createDeps(agent), input);

    expect(result.success).toBe(false);
    expect(result.verificationResult).toBeDefined();
    expect(result.verificationResult!.valid).toBe(false);
  });

  it('Planner 调用异常时返回 parseError', async () => {
    const agent = {
      invoke: vi.fn().mockRejectedValue(new Error('网络超时')),
    } as unknown as HealthAgent;
    const result = await buildAnalysisPlan(createDeps(agent), createValidInput());

    expect(result.success).toBe(false);
    expect(result.parseError).toContain('Planner 调用失败');
    expect(result.parseError).toContain('网络超时');
  });

  it('正确传递 systemPrompt 和 userPrompt 给 plannerAgent', async () => {
    const validPlan = createValidPlanJson();
    const mockInvoke = vi.fn().mockResolvedValue({ content: JSON.stringify(validPlan) });
    const agent = { invoke: mockInvoke } as unknown as HealthAgent;
    const plannerPrompt = '你是规划器';
    const deps: PlanBuilderDeps = { plannerAgent: agent, plannerPrompt };

    await buildAnalysisPlan(deps, createValidInput());

    expect(mockInvoke).toHaveBeenCalledTimes(1);
    const callArgs = mockInvoke.mock.calls[0][0];
    expect(callArgs.systemPrompt).toBe(plannerPrompt);
    expect(callArgs.userPrompt).toContain('我最近 HRV 怎么样？');
  });

  it('解析包含 webSearchNeeds 的合法 plan', async () => {
    const planWithSearch = {
      ...createValidPlanJson(),
      evidenceNeeds: [],
      webSearchNeeds: [
        {
          query: 'recent caffeine sleep research',
          reason: '用户询问最近公开研究，现有本地数据无法回答外部研究进展',
          required: true,
          topic: 'general',
          timeRange: 'year',
        },
      ],
    };
    const agent = createMockAgent(JSON.stringify(planWithSearch));
    const result = await buildAnalysisPlan(createDeps(agent), createValidInput());

    expect(result.success).toBe(true);
    expect(result.plan?.webSearchNeeds).toHaveLength(1);
    expect(result.plan?.webSearchNeeds?.[0]?.required).toBe(true);
  });

  it('previousViolations 被包含在 userPrompt 中', async () => {
    const validPlan = createValidPlanJson();
    const mockInvoke = vi.fn().mockResolvedValue({ content: JSON.stringify(validPlan) });
    const agent = { invoke: mockInvoke } as unknown as HealthAgent;

    const input = createValidInput({
      previousViolations: [
        { rule: 'unsupported_metric', message: '不支持的指标: xyz', path: 'evidenceNeeds[0].metric' },
      ],
    });
    await buildAnalysisPlan(createDeps(agent), input);

    const userPrompt = mockInvoke.mock.calls[0][0].userPrompt;
    expect(userPrompt).toContain('上次校验失败');
    expect(userPrompt).toContain('unsupported_metric');
  });

  it('uiContext.homepageTrendCard 出现在 userPrompt 中', async () => {
    const validPlan = createValidPlanJson();
    const mockInvoke = vi.fn().mockResolvedValue({ content: JSON.stringify(validPlan) });
    const agent = { invoke: mockInvoke } as unknown as HealthAgent;

    const input = createValidInput({
      uiContext: { homepageTrendCard: 'sleep' },
    });
    await buildAnalysisPlan(createDeps(agent), input);

    const userPrompt = mockInvoke.mock.calls[0][0].userPrompt;
    expect(userPrompt).toContain('当前客户端 UI 状态');
    expect(userPrompt).toContain('homepageTrendCard: sleep');
  });

  it('不传 uiContext 时 userPrompt 中不出现 UI 状态区块', async () => {
    const validPlan = createValidPlanJson();
    const mockInvoke = vi.fn().mockResolvedValue({ content: JSON.stringify(validPlan) });
    const agent = { invoke: mockInvoke } as unknown as HealthAgent;

    await buildAnalysisPlan(createDeps(agent), createValidInput());

    const userPrompt = mockInvoke.mock.calls[0][0].userPrompt;
    expect(userPrompt).not.toContain('当前客户端 UI 状态');
  });

  it('fake planner 返回纯 UI clientAction 时 builder 解析并通过 verifier', async () => {
    const uiPlan = {
      ...createValidPlan(),
      userIntent: {
        action: 'control_ui',
        riskLevel: 'general',
        needsClarification: false,
      },
      evidenceNeeds: [],
      clientAction: { type: 'homepage.trend-card.set', display: 'sleep' },
    };
    const agent = createMockAgent(JSON.stringify(uiPlan));
    const result = await buildAnalysisPlan(createDeps(agent), createValidInput());

    expect(result.success).toBe(true);
    expect(result.plan?.userIntent.action).toBe('control_ui');
    expect(result.plan?.clientAction).toStrictEqual({
      type: 'homepage.trend-card.set',
      display: 'sleep',
    });
  });
});

function createValidPlan(): Record<string, unknown> {
  return {
    planId: 'plan-test-001',
    taskType: 'advisor_chat',
    userIntent: {
      action: 'status_summary',
      riskLevel: 'general',
      needsClarification: false,
    },
    evidenceNeeds: [
      {
        metric: 'hrv',
        timeScope: 'week',
        dateRange: { start: '2025-06-01', end: '2025-06-07' },
        reason: '用户询问最近 HRV 数据',
        required: true,
      },
    ],
    safetyConstraints: ['no_diagnosis', 'no_medication_advice'],
    answerShape: {
      includeMissingDataDisclosure: true,
      includeChartTokens: false,
      maxSummaryLength: 300,
      tone: 'concise',
    },
  };
}

describe('buildAnalysisPlanWithRetry', () => {
  it('第一次成功直接返回', async () => {
    const validPlan = createValidPlanJson();
    const agent = createMockAgent(JSON.stringify(validPlan));
    const result = await buildAnalysisPlanWithRetry(createDeps(agent), createValidInput());

    expect(result.success).toBe(true);
    expect(result.plan).toBeDefined();
    expect(agent.invoke).toHaveBeenCalledTimes(1);
  });

  it('重试成功（第一次验证失败，第二次成功）', async () => {
    const validPlan = createValidPlanJson();
    // 第一次返回的 plan 使用了不被支持的 metric
    const invalidPlan = createValidPlanJson();
    // 我们无法用同一个 FakeChatModel 返回不同结果，用 mock function 模拟
    const mockInvoke = vi.fn();
    // 第一次：返回 metric 不在 supportedMetrics 的 plan
    mockInvoke.mockResolvedValueOnce({
      content: JSON.stringify(invalidPlan),
    });
    // 第二次：返回修正后的 plan
    mockInvoke.mockResolvedValueOnce({
      content: JSON.stringify(validPlan),
    });

    const agent = { invoke: mockInvoke } as unknown as HealthAgent;
    // 第一次调用时 supportedMetrics 不含 hrv，导致验证失败
    // 第二次需要 supportedMetrics 包含 hrv，但 input 是同一个...
    // 所以我们需要调整策略：第一次用不支持的指标触发验证失败

    // 使用 exercise_readiness 但 riskLevel 为 general 触发 risk_level_mismatch
    const riskMismatchPlan = {
      ...createValidPlanJson(),
      userIntent: {
        action: 'exercise_readiness',
        riskLevel: 'general', // 应为 safety_boundary
        needsClarification: false,
      },
    };

    mockInvoke.mockReset();
    mockInvoke.mockResolvedValueOnce({ content: JSON.stringify(riskMismatchPlan) });
    mockInvoke.mockResolvedValueOnce({ content: JSON.stringify(validPlan) });

    const result = await buildAnalysisPlanWithRetry(createDeps(agent), createValidInput());

    expect(result.success).toBe(true);
    expect(result.plan).toBeDefined();
    expect(mockInvoke).toHaveBeenCalledTimes(2);
  });

  it('重试失败时返回第一次的结果', async () => {
    // 两次都返回一个触发验证失败的 plan
    const riskMismatchPlan = {
      ...createValidPlanJson(),
      userIntent: {
        action: 'exercise_readiness',
        riskLevel: 'general',
        needsClarification: false,
      },
    };

    const mockInvoke = vi.fn();
    mockInvoke.mockResolvedValue({ content: JSON.stringify(riskMismatchPlan) });

    const agent = { invoke: mockInvoke } as unknown as HealthAgent;
    const result = await buildAnalysisPlanWithRetry(createDeps(agent), createValidInput());

    expect(result.success).toBe(false);
    expect(result.verificationResult).toBeDefined();
    expect(result.verificationResult!.valid).toBe(false);
    expect(mockInvoke).toHaveBeenCalledTimes(2);
  });

  it('解析错误时不重试，直接返回', async () => {
    const agent = createMockAgent('这不是 JSON');
    const result = await buildAnalysisPlanWithRetry(createDeps(agent), createValidInput());

    expect(result.success).toBe(false);
    expect(result.parseError).toContain('JSON 解析失败');
    // 解析错误不触发重试
    expect(agent.invoke).toHaveBeenCalledTimes(1);
  });
});
