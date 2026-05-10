import { describe, it, expect } from 'vitest';
import { FakeChatModel } from '../../provider/fake-chat-model';
import { createHealthAgent, type HealthAgent } from '../../executor/create-agent';
import { ReflectionObserver, type ReflectionObserverDeps, type ReflectionObserverInput } from '../reflection-observer';
import type { VerificationReport } from '../verification-report';
import type { AgentResponseEnvelope } from '@health-advisor/shared';

// ── 测试用 fixture ──────────────────────────────────────

const REVIEWER_SYSTEM_PROMPT = '你是一个健康 AI 回复质量审核员。';

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

function makeObserverInput(overrides?: Partial<ReflectionObserverInput>): ReflectionObserverInput {
  return {
    envelope: makeEnvelope(),
    report: makeVerificationReport(),
    context: {
      task: {
        type: 'advisor_chat',
        userMessage: '我今天心率怎么样？',
      },
      dataWindow: {
        missingFields: [],
      },
      signals: {
        overallStatus: 'green',
        anomalies: [],
      },
    },
    packet: {
      evidence: [],
      missingData: [],
      visibleCharts: [],
    },
    systemPrompt: '你是健康顾问',
    taskPrompt: '请回复用户关于心率的问题',
    ...overrides,
  };
}

// ── 测试用例 ──────────────────────────────────────────

describe('ReflectionObserver', () => {
  it('成功的 reflection → approved: true，返回完整 ReflectionArtifact', async () => {
    // Arrange: reviewer 返回 approved=true 的 JSON
    const reviewerResponse = JSON.stringify({
      approved: true,
      qualityScore: 4,
      issues: [],
      suggestions: ['可以增加趋势对比说明'],
    });
    const fakeModel = new FakeChatModel(reviewerResponse);
    const reviewerAgent = createHealthAgent({ chatModel: fakeModel });
    const deps: ReflectionObserverDeps = {
      reviewerAgent,
      reviewerPrompt: REVIEWER_SYSTEM_PROMPT,
      reviewerModelName: 'gpt-4o-test',
    };
    const observer = new ReflectionObserver(deps);
    const input = makeObserverInput();

    // Act
    const result = await observer.observeAsync(input);

    // Assert: reviewResult 中包含审核结果
    expect(result.reviewResult.approved).toBe(true);
    expect(result.reviewResult.qualityScore).toBe(4);
    expect(result.reviewResult.issues).toEqual([]);
    expect(result.reviewResult.suggestions).toEqual(['可以增加趋势对比说明']);
    expect(result.envelopeSnapshot).toEqual(input.envelope);
    expect(result.verificationReport).toEqual(input.report);
    expect(result.reflectedAt).toBeTruthy();
    expect(result.reviewerModel).toBe('gpt-4o-test');
  });

  it('Reviewer 返回有 issues 的结果 → approved: false，issues 正确解析', async () => {
    // Arrange
    const reviewerResponse = JSON.stringify({
      approved: false,
      qualityScore: 2,
      issues: [
        { category: 'accuracy', description: '心率数据引用与上下文不一致', severity: 'high' },
        { category: 'completeness', description: '未提及缺失的 SpO2 数据', severity: 'medium' },
      ],
      suggestions: ['补充缺失数据说明', '修正心率引用'],
    });
    const fakeModel = new FakeChatModel(reviewerResponse);
    const reviewerAgent = createHealthAgent({ chatModel: fakeModel });
    const observer = new ReflectionObserver({
      reviewerAgent,
      reviewerPrompt: REVIEWER_SYSTEM_PROMPT,
      reviewerModelName: 'gpt-4o-test',
    });
    const input = makeObserverInput();

    // Act
    const result = await observer.observeAsync(input);

    // Assert
    expect(result.reviewResult.approved).toBe(false);
    expect(result.reviewResult.qualityScore).toBe(2);
    expect(result.reviewResult.issues).toHaveLength(2);
    expect(result.reviewResult.issues[0].category).toBe('accuracy');
    expect(result.reviewResult.issues[0].severity).toBe('high');
    expect(result.reviewResult.issues[1].category).toBe('completeness');
    expect(result.reviewResult.suggestions).toHaveLength(2);
  });

  it('Reviewer 返回无效 JSON → parseReflectionResponse 容错处理，返回默认值', async () => {
    // Arrange: reviewer 返回无法解析的文本
    const fakeModel = new FakeChatModel('这不是 JSON 格式的回复');
    const reviewerAgent = createHealthAgent({ chatModel: fakeModel });
    const observer = new ReflectionObserver({
      reviewerAgent,
      reviewerPrompt: REVIEWER_SYSTEM_PROMPT,
      reviewerModelName: 'gpt-4o-test',
    });
    const input = makeObserverInput();

    // Act
    const result = await observer.observeAsync(input);

    // Assert: 应该返回一个安全的默认 ReflectionArtifact，不抛错
    expect(result.reviewResult.approved).toBe(false);
    expect(result.reviewResult.qualityScore).toBe(0);
    expect(result.reviewResult.issues).toEqual([]);
    expect(result.reviewResult.suggestions).toEqual([]);
  });

  it('Reviewer agent 抛异常 → observeAsync 应捕获并返回错误 ReflectionArtifact（不抛错到外部）', async () => {
    // Arrange: 创建一个会抛异常的 agent
    const throwingAgent: HealthAgent = {
      async invoke() {
        throw new Error('模拟 LLM 调用超时');
      },
    };
    const observer = new ReflectionObserver({
      reviewerAgent: throwingAgent,
      reviewerPrompt: REVIEWER_SYSTEM_PROMPT,
    });
    const input = makeObserverInput();

    // Act
    const result = await observer.observeAsync(input);

    // Assert: 不抛错，返回错误态 ReflectionArtifact
    expect(result.reviewResult.approved).toBe(false);
    expect(result.reviewResult.qualityScore).toBe(0);
    expect(result.reviewResult.issues).toHaveLength(1);
    expect(result.reviewResult.issues[0].category).toBe('accuracy');
    expect(result.reviewResult.issues[0].description).toContain('模拟 LLM 调用超时');
    expect(result.reviewResult.issues[0].severity).toBe('high');
    expect(result.reviewerModel).toBe('error');
  });

  it('构建的 user prompt 包含 envelope、violations、context 信息', async () => {
    // Arrange: 用 spy agent 检查传入的 prompt
    let capturedUserPrompt = '';
    const spyAgent: HealthAgent = {
      async invoke(input) {
        capturedUserPrompt = input.userPrompt;
        return {
          content: JSON.stringify({
            approved: true,
            qualityScore: 5,
            issues: [],
            suggestions: [],
          }),
        };
      },
    };
    const observer = new ReflectionObserver({
      reviewerAgent: spyAgent,
      reviewerPrompt: REVIEWER_SYSTEM_PROMPT,
    });

    const envelope = makeEnvelope({
      summary: '你的心率偏高，建议休息。',
      statusColor: 'warning',
    });
    const report = makeVerificationReport({
      violations: [
        { ruleId: 'safety:diagnosis', severity: 'hard', passed: false, message: '检测到诊断语言' },
      ],
      summary: { total: 1, passed: 0, failed: 1, hardFailures: 1 },
    });
    const input = makeObserverInput({ envelope, report });

    // Act
    await observer.observeAsync(input);

    // Assert: prompt 包含关键信息
    expect(capturedUserPrompt).toContain('你的心率偏高');
    expect(capturedUserPrompt).toContain('检测到诊断语言');
    expect(capturedUserPrompt).toContain('advisor_chat');
  });
});
