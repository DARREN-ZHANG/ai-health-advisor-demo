import { describe, it, expect, vi } from 'vitest';
import { FakeChatModel } from '../../provider/fake-chat-model';
import { createHealthAgent, type HealthAgent } from '../../executor/create-agent';
import { SyncReflectionReviewer, type SyncReflectionReviewerDeps } from '../reflection-reviewer';
import { runSyncReflectionGate, type SyncGateDeps } from '../sync-reflection-gate';
import type { SyncReflectionReviewer as SyncReflectionReviewerType } from '../reflection-reviewer';
import type { ReflectionReviewResult } from '../reflection-schema';
import type { AgentResponseEnvelope } from '@health-advisor/shared';
import type { VerificationReport } from '../verification-report';
import type { VerifierInput } from '../verifier';

// ── 测试用 fixture ──────────────────────────────────────

const GATE_SYSTEM_PROMPT = '你是一个健康 AI 回复质量同步审核员。';

function makeEnvelope(overrides?: Partial<AgentResponseEnvelope>): AgentResponseEnvelope {
  return {
    summary: '今日心率正常，平均 72 bpm。',
    source: 'llm',
    statusColor: 'good',
    chartTokens: [],
    microTips: ['建议保持规律运动。'],
    meta: {
      taskType: 'advisor_chat' as const,
      pageContext: {
        profileId: 'test-profile',
        page: 'advisor',
        timeframe: 'day' as const,
      },
      finishReason: 'complete' as const,
    },
    ...overrides,
  };
}

function makeVerificationReport(overrides?: Partial<VerificationReport>): VerificationReport {
  return {
    envelope: makeEnvelope(),
    context: {
      taskType: 'advisor_chat',
      missingData: [],
      visibleCharts: [],
      ruleInsights: [],
    },
    violations: [
      { ruleId: 'safety:diagnosis', severity: 'hard', passed: true, message: '未检测到诊断语言' },
    ],
    summary: { total: 1, passed: 1, failed: 0, hardFailures: 0 },
    verifiedAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeVerifierInput(overrides?: Partial<VerifierInput>): VerifierInput {
  return {
    envelope: makeEnvelope(),
    context: {
      profile: {
        profileId: 'p1',
        name: '测试用户',
        age: 30,
        tags: [],
        baselines: {
          restingHR: 65,
          hrv: 45,
          spo2: 97,
          avgSleepMinutes: 420,
          avgSteps: 8000,
        },
      },
      task: {
        type: 'advisor_chat',
        pageContext: {
          profileId: 'p1',
          page: 'advisor',
          timeframe: 'day',
        },
        userMessage: '我今天心率怎么样？',
      },
      dataWindow: {
        start: '2025-01-01T00:00:00.000Z',
        end: '2025-01-01T23:59:59.000Z',
        records: [],
        missingFields: [],
      },
      signals: {
        overallStatus: 'good',
        anomalies: [],
        trends: [],
        events: [],
        lowData: false,
      },
      memory: {
        recentMessages: [],
      },
      locale: 'zh-CN',
    },
    rulesResult: {
      insights: [],
      suggestedChartTokens: [],
      suggestedMicroTips: [],
      statusColor: 'good',
    },
    packet: {
      task: { type: 'advisor_chat' } as never,
      user: { locale: 'zh-CN' } as never,
      dataWindow: { start: '', end: '', missingData: [] } as never,
      evidence: [],
      missingData: [],
      visibleCharts: [],
    },
    parseResult: { success: true },
    ...overrides,
  };
}

// ── SyncReflectionReviewer 测试 ──────────────────────────

describe('SyncReflectionReviewer', () => {
  it('reviewer 返回 approved: true → 结果为 approved', async () => {
    // Arrange
    const responseJson = JSON.stringify({
      approved: true,
      violations: [],
    });
    const fakeModel = new FakeChatModel(responseJson);
    const reviewerAgent = createHealthAgent({ chatModel: fakeModel });
    const deps: SyncReflectionReviewerDeps = {
      reviewerAgent,
      gatePrompt: GATE_SYSTEM_PROMPT,
    };
    const reviewer = new SyncReflectionReviewer(deps);

    // Act
    const result = await reviewer.review({
      envelope: makeEnvelope(),
      verificationReport: makeVerificationReport(),
    });

    // Assert
    expect(result.approved).toBe(true);
    expect(result.violations).toEqual([]);
  });

  it('reviewer 返回 approved: false with violations → 结果包含 violations', async () => {
    // Arrange
    const responseJson = JSON.stringify({
      approved: false,
      violations: [
        {
          category: 'safety',
          severity: 'high',
          description: '回复包含诊断内容',
          requiredChanges: '移除诊断表述，改为建议咨询医生',
        },
      ],
    });
    const fakeModel = new FakeChatModel(responseJson);
    const reviewerAgent = createHealthAgent({ chatModel: fakeModel });
    const reviewer = new SyncReflectionReviewer({
      reviewerAgent,
      gatePrompt: GATE_SYSTEM_PROMPT,
    });

    // Act
    const result = await reviewer.review({
      envelope: makeEnvelope(),
      verificationReport: makeVerificationReport(),
    });

    // Assert
    expect(result.approved).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].category).toBe('safety');
    expect(result.violations[0].severity).toBe('high');
    expect(result.violations[0].description).toBe('回复包含诊断内容');
    expect(result.violations[0].requiredChanges).toBe('移除诊断表述，改为建议咨询医生');
  });

  it('reviewer agent 抛异常 → 返回 rejected 状态，violation 包含错误信息', async () => {
    // Arrange: 创建一个会抛异常的 agent
    const throwingAgent: HealthAgent = {
      async invoke() {
        throw new Error('模拟 LLM 调用失败');
      },
    };
    const reviewer = new SyncReflectionReviewer({
      reviewerAgent: throwingAgent,
      gatePrompt: GATE_SYSTEM_PROMPT,
    });

    // Act
    const result = await reviewer.review({
      envelope: makeEnvelope(),
      verificationReport: makeVerificationReport(),
    });

    // Assert: 不抛异常，返回 rejected
    expect(result.approved).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].category).toBe('accuracy');
    expect(result.violations[0].severity).toBe('high');
    expect(result.violations[0].description).toContain('模拟 LLM 调用失败');
    expect(result.violations[0].requiredChanges).toBe('系统错误，建议返回安全响应');
  });

  it('reviewer 返回无效 JSON → parseReviewResponse 返回 approved: false, violations: []', async () => {
    // Arrange
    const fakeModel = new FakeChatModel('这不是 JSON');
    const reviewerAgent = createHealthAgent({ chatModel: fakeModel });
    const reviewer = new SyncReflectionReviewer({
      reviewerAgent,
      gatePrompt: GATE_SYSTEM_PROMPT,
    });

    // Act
    const result = await reviewer.review({
      envelope: makeEnvelope(),
      verificationReport: makeVerificationReport(),
    });

    // Assert
    expect(result.approved).toBe(false);
    expect(result.violations).toEqual([]);
  });

  it('构建的 user prompt 包含 envelope、violations、plan、evidence 信息', async () => {
    // Arrange: 用 spy agent 检查传入的 prompt
    let capturedUserPrompt = '';
    const spyAgent: HealthAgent = {
      async invoke(input) {
        capturedUserPrompt = input.userPrompt;
        return {
          content: JSON.stringify({ approved: true, violations: [] }),
        };
      },
    };
    const reviewer = new SyncReflectionReviewer({
      reviewerAgent: spyAgent,
      gatePrompt: GATE_SYSTEM_PROMPT,
    });

    const envelope = makeEnvelope({
      summary: '你的心率偏高，建议就医。',
      statusColor: 'warning',
    });
    const report = makeVerificationReport({
      violations: [
        { ruleId: 'safety:diagnosis', severity: 'hard', passed: false, message: '检测到诊断语言' },
      ],
      summary: { total: 1, passed: 0, failed: 1, hardFailures: 1 },
    });

    // Act
    await reviewer.review({
      envelope,
      verificationReport: report,
      plan: {
        planId: 'plan-1',
        taskType: 'advisor_chat',
        userIntent: {
          action: 'exercise_readiness',
          riskLevel: 'safety_boundary',
          needsClarification: false,
        },
        evidenceNeeds: [],
        safetyConstraints: ['no_diagnosis', 'recommend_doctor_when_critical'],
        answerShape: {
          includeMissingDataDisclosure: true,
          includeChartTokens: false,
          maxSummaryLength: 300,
          tone: 'concise',
        },
      },
      collectedEvidence: [{ id: 'e1' }, { id: 'e2' }],
    });

    // Assert: prompt 包含关键信息
    expect(capturedUserPrompt).toContain('你的心率偏高');
    expect(capturedUserPrompt).toContain('检测到诊断语言');
    expect(capturedUserPrompt).toContain('safety_boundary');
    expect(capturedUserPrompt).toContain('no_diagnosis');
    expect(capturedUserPrompt).toContain('2 条');
  });
});

// ── runSyncReflectionGate 测试 ────────────────────────────

describe('runSyncReflectionGate', () => {
  it('approved: reviewer 返回 approved: true → gate result approved: true', async () => {
    // Arrange
    const mockReview = vi.fn().mockResolvedValue({
      approved: true,
      violations: [],
    } satisfies ReflectionReviewResult);
    const mockReviewer = { review: mockReview } as unknown as SyncReflectionReviewerType;

    const deps: SyncGateDeps = {
      reviewer: mockReviewer,
      verifierInput: makeVerifierInput(),
    };
    const envelope = makeEnvelope();

    // Act
    const result = await runSyncReflectionGate(deps, envelope);

    // Assert
    expect(result.approved).toBe(true);
    expect(result.reviewResult?.approved).toBe(true);
    expect(result.verificationReport).toBeDefined();
    expect(result.regenerated).toBeUndefined();
  });

  it('rejected: reviewer 返回 approved: false with violations → gate result approved: false', async () => {
    // Arrange
    const violations = [
      {
        category: 'safety' as const,
        severity: 'high' as const,
        description: '回复包含诊断内容',
        requiredChanges: '移除诊断表述',
      },
    ];
    const mockReview = vi.fn().mockResolvedValue({
      approved: false,
      violations,
    } satisfies ReflectionReviewResult);
    const mockReviewer = { review: mockReview } as unknown as SyncReflectionReviewerType;

    const deps: SyncGateDeps = {
      reviewer: mockReviewer,
      verifierInput: makeVerifierInput(),
    };
    const envelope = makeEnvelope();

    // Act
    const result = await runSyncReflectionGate(deps, envelope);

    // Assert
    expect(result.approved).toBe(false);
    expect(result.reviewResult?.approved).toBe(false);
    expect(result.reviewResult?.violations).toHaveLength(1);
    expect(result.verificationReport).toBeDefined();
    expect(result.regenerated).toBe(false);
  });

  it('reviewer 调用失败 → gate result approved: false，violation 包含错误信息', async () => {
    // Arrange: reviewer 内部 catch 返回 rejected 状态
    const throwingAgent: HealthAgent = {
      async invoke() {
        throw new Error('模拟审核超时');
      },
    };
    const reviewer = new SyncReflectionReviewer({
      reviewerAgent: throwingAgent,
      gatePrompt: GATE_SYSTEM_PROMPT,
    });

    const deps: SyncGateDeps = {
      reviewer,
      verifierInput: makeVerifierInput(),
    };
    const envelope = makeEnvelope();

    // Act
    const result = await runSyncReflectionGate(deps, envelope);

    // Assert
    expect(result.approved).toBe(false);
    expect(result.reviewResult?.approved).toBe(false);
    expect(result.reviewResult?.violations).toHaveLength(1);
    expect(result.reviewResult?.violations[0].description).toContain('模拟审核超时');
    expect(result.verificationReport).toBeDefined();
  });

  it('verifier 异常 → gate 仍能运行（使用安全默认报告）', async () => {
    // Arrange: 构造一个会导致 verifyOutput 抛异常的 verifierInput
    // 通过将 envelope 设为 null 来触发异常（verifier 内部会尝试访问 envelope.summary）
    const badVerifierInput = makeVerifierInput({
      envelope: null as unknown as AgentResponseEnvelope,
    });

    const mockReview = vi.fn().mockResolvedValue({
      approved: true,
      violations: [],
    } satisfies ReflectionReviewResult);
    const mockReviewer = { review: mockReview } as unknown as SyncReflectionReviewerType;

    const deps: SyncGateDeps = {
      reviewer: mockReviewer,
      verifierInput: badVerifierInput,
    };
    const envelope = makeEnvelope();

    // Act
    const result = await runSyncReflectionGate(deps, envelope);

    // Assert: gate 不崩溃，使用安全默认报告
    expect(result.approved).toBe(true);
    expect(result.verificationReport).toBeDefined();
    // 验证 reviewer 被调用了（说明即使 verifier 异常也能继续）
    expect(mockReview).toHaveBeenCalledTimes(1);
    // 验证传入 reviewer 的 verificationReport 是安全默认报告
    const reviewCall = mockReview.mock.calls[0][0];
    expect(reviewCall.verificationReport.summary.total).toBe(0);
  });

  it('plan 和 collectedEvidence 正确传递给 reviewer', async () => {
    // Arrange
    const mockReview = vi.fn().mockResolvedValue({
      approved: true,
      violations: [],
    } satisfies ReflectionReviewResult);
    const mockReviewer = { review: mockReview } as unknown as SyncReflectionReviewerType;

    const plan = {
      planId: 'plan-test',
      taskType: 'advisor_chat' as const,
      userIntent: {
        action: 'exercise_readiness' as const,
        riskLevel: 'safety_boundary' as const,
        needsClarification: false,
      },
      evidenceNeeds: [],
      safetyConstraints: ['no_diagnosis' as const],
      answerShape: {
        includeMissingDataDisclosure: true,
        includeChartTokens: false,
        maxSummaryLength: 300,
        tone: 'concise' as const,
      },
    };
    const collectedEvidence = [{ id: 'e1' }, { id: 'e2' }, { id: 'e3' }];

    const deps: SyncGateDeps = {
      reviewer: mockReviewer,
      verifierInput: makeVerifierInput(),
      plan,
      collectedEvidence,
    };
    const envelope = makeEnvelope();

    // Act
    await runSyncReflectionGate(deps, envelope);

    // Assert: reviewer 收到正确的 plan 和 collectedEvidence
    expect(mockReview).toHaveBeenCalledTimes(1);
    const reviewInput = mockReview.mock.calls[0][0];
    expect(reviewInput.plan).toEqual(plan);
    expect(reviewInput.collectedEvidence).toEqual(collectedEvidence);
    expect(reviewInput.envelope).toEqual(envelope);
  });
});
