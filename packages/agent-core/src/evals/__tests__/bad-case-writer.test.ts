import { describe, it, expect } from 'vitest';
import { convertToBadCase } from '../bad-case-writer';
import type { QualityViolation } from '../../output/verification-report';
import type { ReflectionArtifact, ReflectionIssue } from '../../output/reflection-types';
import type { AgentRequest } from '../../types/agent-request';

// ── 测试用 fixture 工厂 ──────────────────────────────────

/** 构建基础 AgentRequest */
function makeRequest(overrides?: Partial<AgentRequest>): AgentRequest {
  return {
    requestId: 'req-001',
    sessionId: 'sess-001',
    profileId: 'profile-001',
    taskType: 'homepage_summary',
    pageContext: {
      profileId: 'profile-001',
      page: 'home',
      timeframe: 'day',
    },
    ...overrides,
  };
}

/** 构建基础 QualityViolation（默认 passed=false 表示未通过） */
function makeViolation(overrides?: Partial<QualityViolation>): QualityViolation {
  return {
    ruleId: 'safety:diagnosis',
    severity: 'hard',
    passed: false,
    message: '检测到诊断语言',
    ...overrides,
  };
}

/** 构建基础 ReflectionIssue */
function makeIssue(overrides?: Partial<ReflectionIssue>): ReflectionIssue {
  return {
    category: 'safety',
    description: '回复包含诊断建议',
    severity: 'high',
    ...overrides,
  };
}

/** 构建基础 ReflectionArtifact */
function makeReflectionArtifact(overrides?: Partial<ReflectionArtifact>): ReflectionArtifact {
  return {
    envelopeSnapshot: {
      summary: '测试摘要',
      source: 'llm',
      statusColor: 'good',
      chartTokens: [],
      microTips: [],
      meta: {
        taskType: 'homepage_summary',
        pageContext: { profileId: 'profile-001', page: 'home', timeframe: 'day' },
        finishReason: 'complete',
      },
    },
    verificationReport: {
      envelope: {
        summary: '测试摘要',
        source: 'llm',
        statusColor: 'good',
        chartTokens: [],
        microTips: [],
        meta: {
          taskType: 'homepage_summary',
          pageContext: { profileId: 'profile-001', page: 'home', timeframe: 'day' },
          finishReason: 'complete',
        },
      },
      context: { taskType: 'homepage_summary', missingData: [], visibleCharts: [], ruleInsights: [] },
      violations: [],
      summary: { total: 0, passed: 0, failed: 0, hardFailures: 0 },
      verifiedAt: '2025-01-01T00:00:00.000Z',
    },
    reviewResult: {
      approved: false,
      qualityScore: 2,
      issues: [],
      suggestions: [],
    },
    reviewerModel: 'test',
    reflectedAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
  };
}

// ── convertToBadCase 核心逻辑 ──────────────────────────────

describe('convertToBadCase', () => {
  it('安全类 violations → 生成 safety expectations', () => {
    // Arrange
    const request = makeRequest();
    const report = {
      violations: [
        makeViolation({ ruleId: 'safety:diagnosis', passed: false, message: '检测到诊断语言' }),
        makeViolation({ ruleId: 'safety:medication_recommendation', passed: false, message: '检测到用药推荐' }),
        makeViolation({ ruleId: 'safety:treatment_promise', passed: false, message: '检测到治疗承诺' }),
        makeViolation({ ruleId: 'safety:medication', passed: false, message: '检测到药物相关内容' }),
      ],
    };
    const reflection = makeReflectionArtifact({
      reviewResult: { approved: false, qualityScore: 1, issues: [], suggestions: [] },
    });

    // Act
    const result = convertToBadCase(request, report, reflection);

    // Assert
    expect(result.suggestedEvalCase.expectations.safety).toBeDefined();
    expect(result.suggestedEvalCase.expectations.safety?.forbidDiagnosis).toBe(true);
    expect(result.suggestedEvalCase.expectations.safety?.forbidMedicationRecommendation).toBe(true);
    expect(result.suggestedEvalCase.expectations.safety?.forbidTreatmentPromise).toBe(true);
    expect(result.suggestedEvalCase.expectations.safety?.forbidMedication).toBe(true);
  });

  it('安全类 reflection issues → safety expectations 生成，forbiddenPatterns 为空（自然语言不适用正则）', () => {
    // Arrange
    const request = makeRequest();
    const report = { violations: [] };
    const safetyIssue = makeIssue({ category: 'safety', description: '存在危险建议', severity: 'high' });
    const reflection = makeReflectionArtifact({
      reviewResult: { approved: false, qualityScore: 1, issues: [safetyIssue], suggestions: [] },
    });

    // Act
    const result = convertToBadCase(request, report, reflection);

    // Assert
    expect(result.suggestedEvalCase.expectations.safety).toBeDefined();
    // forbiddenPatterns 期望正则表达式，自然语言 description 不适用
    expect(result.suggestedEvalCase.expectations.safety?.forbiddenPatterns).toEqual([]);
  });

  it('缺失数据类 violations → 生成 missingData expectations', () => {
    // Arrange
    const request = makeRequest();
    const report = {
      violations: [
        makeViolation({
          ruleId: 'missing-data:no_claim:heartRate',
          passed: false,
          message: '心率数据缺失但做了断言',
        }),
        makeViolation({
          ruleId: 'missing-data:no_claim:spo2',
          passed: false,
          message: '血氧数据缺失但做了断言',
        }),
        makeViolation({
          ruleId: 'missing-data:insufficient_disclosure',
          passed: false,
          message: '未披露数据不足',
        }),
      ],
    };
    const reflection = makeReflectionArtifact({
      reviewResult: { approved: false, qualityScore: 1, issues: [], suggestions: [] },
    });

    // Act
    const result = convertToBadCase(request, report, reflection);

    // Assert
    expect(result.suggestedEvalCase.expectations.missingData).toBeDefined();
    expect(result.suggestedEvalCase.expectations.missingData?.missingMetrics).toContain('heartRate');
    expect(result.suggestedEvalCase.expectations.missingData?.missingMetrics).toContain('spo2');
    expect(result.suggestedEvalCase.expectations.missingData?.mustDiscloseInsufficientData).toBe(true);
  });

  it('完整性类 reflection issues → 生成 summary.mustNotMention', () => {
    // Arrange
    const request = makeRequest();
    const report = { violations: [] };
    const completenessIssue = makeIssue({
      category: 'completeness',
      description: '不应提及不存在的事件',
      severity: 'high',
    });
    const reflection = makeReflectionArtifact({
      reviewResult: { approved: false, qualityScore: 2, issues: [completenessIssue], suggestions: [] },
    });

    // Act
    const result = convertToBadCase(request, report, reflection);

    // Assert
    expect(result.suggestedEvalCase.expectations.summary).toBeDefined();
    expect(result.suggestedEvalCase.expectations.summary?.mustNotMention).toContain('不应提及不存在的事件');
  });

  it('总是包含 protocol expectations', () => {
    // Arrange
    const request = makeRequest();
    const report = { violations: [] };
    const reflection = makeReflectionArtifact();

    // Act
    const result = convertToBadCase(request, report, reflection);

    // Assert
    expect(result.suggestedEvalCase.expectations.protocol).toEqual({ requireValidEnvelope: true });
  });

  it('passed 的 violations 被过滤，不进入 violations 列表', () => {
    // Arrange
    const request = makeRequest();
    const report = {
      violations: [
        makeViolation({ ruleId: 'safety:diagnosis', passed: true, message: '通过' }),
        makeViolation({ ruleId: 'safety:medication', passed: false, message: '未通过' }),
      ],
    };
    const reflection = makeReflectionArtifact();

    // Act
    const result = convertToBadCase(request, report, reflection);

    // Assert
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].ruleId).toBe('safety:medication');
  });
});

// ── inferPriority 通过 convertToBadCase 间接测试 ──────────

describe('inferPriority（通过 convertToBadCase 间接测试）', () => {
  it('high severity issue → P0', () => {
    const request = makeRequest();
    const report = { violations: [] };
    const reflection = makeReflectionArtifact({
      reviewResult: {
        approved: false,
        qualityScore: 1,
        issues: [makeIssue({ severity: 'high', category: 'safety' })],
        suggestions: [],
      },
    });

    const result = convertToBadCase(request, report, reflection);
    expect(result.suggestedEvalCase.priority).toBe('P0');
  });

  it('hard failure violation → P0', () => {
    const request = makeRequest();
    const report = {
      violations: [makeViolation({ severity: 'hard', passed: false })],
    };
    const reflection = makeReflectionArtifact({
      reviewResult: { approved: false, qualityScore: 1, issues: [], suggestions: [] },
    });

    const result = convertToBadCase(request, report, reflection);
    expect(result.suggestedEvalCase.priority).toBe('P0');
  });

  it('medium severity issue（无 high、无 hard failure）→ P1', () => {
    const request = makeRequest();
    const report = { violations: [] };
    const reflection = makeReflectionArtifact({
      reviewResult: {
        approved: false,
        qualityScore: 3,
        issues: [makeIssue({ severity: 'medium', category: 'accuracy' })],
        suggestions: [],
      },
    });

    const result = convertToBadCase(request, report, reflection);
    expect(result.suggestedEvalCase.priority).toBe('P1');
  });

  it('无 issues、无 violations → P2', () => {
    const request = makeRequest();
    const report = { violations: [] };
    const reflection = makeReflectionArtifact({
      reviewResult: { approved: true, qualityScore: 4, issues: [], suggestions: [] },
    });

    const result = convertToBadCase(request, report, reflection);
    expect(result.suggestedEvalCase.priority).toBe('P2');
  });
});

// ── inferCategory 通过 convertToBadCase 间接测试 ──────────

describe('inferCategory（通过 convertToBadCase 间接测试）', () => {
  it('taskType=homepage_summary → category=homepage', () => {
    const request = makeRequest({ taskType: 'homepage_summary' });
    const report = { violations: [] };
    const reflection = makeReflectionArtifact();

    const result = convertToBadCase(request, report, reflection);
    expect(result.suggestedEvalCase.category).toBe('homepage');
  });

  it('taskType=view_summary → category=view-summary', () => {
    const request = makeRequest({
      taskType: 'view_summary',
      pageContext: { profileId: 'p-1', page: 'view', timeframe: 'day' },
    });
    const report = { violations: [] };
    const reflection = makeReflectionArtifact();

    const result = convertToBadCase(request, report, reflection);
    expect(result.suggestedEvalCase.category).toBe('view-summary');
  });

  it('taskType=advisor_chat → category=advisor-chat', () => {
    const request = makeRequest({
      taskType: 'advisor_chat',
      pageContext: { profileId: 'p-1', page: 'advisor', timeframe: 'day' },
    });
    const report = { violations: [] };
    const reflection = makeReflectionArtifact();

    const result = convertToBadCase(request, report, reflection);
    expect(result.suggestedEvalCase.category).toBe('advisor-chat');
  });

  it('未知 taskType → category=cross-cutting', () => {
    // 使用一种非预期的 taskType，测试默认行为
    const request = makeRequest({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      taskType: 'unknown_type' as any,
    });
    const report = { violations: [] };
    const reflection = makeReflectionArtifact();

    const result = convertToBadCase(request, report, reflection);
    expect(result.suggestedEvalCase.category).toBe('cross-cutting');
  });
});

// ── buildTitle 通过 convertToBadCase 间接测试 ──────────────

describe('buildTitle（通过 convertToBadCase 间接测试）', () => {
  it('有 reflection issues → 标题使用 issue 描述', () => {
    const request = makeRequest();
    const report = { violations: [] };
    const reflection = makeReflectionArtifact({
      reviewResult: {
        approved: false,
        qualityScore: 2,
        issues: [
          makeIssue({ description: '心率引用错误' }),
          makeIssue({ description: '缺少趋势说明' }),
        ],
        suggestions: [],
      },
    });

    const result = convertToBadCase(request, report, reflection);
    expect(result.suggestedEvalCase.title).toContain('自动生成:');
    expect(result.suggestedEvalCase.title).toContain('心率引用错误');
    expect(result.suggestedEvalCase.title).toContain('缺少趋势说明');
  });

  it('最多取 3 个 issue 描述', () => {
    const request = makeRequest();
    const report = { violations: [] };
    const reflection = makeReflectionArtifact({
      reviewResult: {
        approved: false,
        qualityScore: 1,
        issues: [
          makeIssue({ description: '问题A' }),
          makeIssue({ description: '问题B' }),
          makeIssue({ description: '问题C' }),
          makeIssue({ description: '问题D' }),
        ],
        suggestions: [],
      },
    });

    const result = convertToBadCase(request, report, reflection);
    expect(result.suggestedEvalCase.title).toContain('问题A');
    expect(result.suggestedEvalCase.title).toContain('问题C');
    expect(result.suggestedEvalCase.title).not.toContain('问题D');
  });

  it('无 issues 但有 failed violations → 标题使用 violation message', () => {
    const request = makeRequest();
    const report = {
      violations: [
        makeViolation({ passed: false, message: '规则A未通过' }),
        makeViolation({ passed: false, message: '规则B未通过' }),
      ],
    };
    const reflection = makeReflectionArtifact({
      reviewResult: { approved: false, qualityScore: 3, issues: [], suggestions: [] },
    });

    const result = convertToBadCase(request, report, reflection);
    expect(result.suggestedEvalCase.title).toContain('自动生成:');
    expect(result.suggestedEvalCase.title).toContain('规则A未通过');
  });

  it('无 issues 也无 failed violations → 使用默认标题', () => {
    const request = makeRequest();
    const report = { violations: [] };
    const reflection = makeReflectionArtifact({
      reviewResult: { approved: true, qualityScore: 5, issues: [], suggestions: [] },
    });

    const result = convertToBadCase(request, report, reflection);
    expect(result.suggestedEvalCase.title).toBe('自动生成: 质量审核未通过');
  });
});

// ── BadCaseArtifact 结构完整性 ──────────────────────────────

describe('BadCaseArtifact 结构', () => {
  it('返回的 artifact 包含正确的 request、violations、reflectionIssues', () => {
    const request = makeRequest();
    const violation = makeViolation({ passed: false });
    const issue = makeIssue({ severity: 'medium' });
    const report = { violations: [violation, makeViolation({ passed: true })] };
    const reflection = makeReflectionArtifact({
      reviewResult: { approved: false, qualityScore: 2, issues: [issue], suggestions: [] },
    });

    const result = convertToBadCase(request, report, reflection);

    expect(result.request).toBe(request);
    // 只包含 passed=false 的 violations
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]).toBe(violation);
    expect(result.reflectionIssues).toEqual([issue]);
    expect(result.suggestedEvalCase.id).toMatch(/^bad-case-\d+$/);
    expect(result.suggestedEvalCase.tags).toContain('auto-generated');
    expect(result.suggestedEvalCase.tags).toContain('bad-case');
    expect(result.suggestedEvalCase.setup.profileId).toBe('profile-001');
    expect(result.suggestedEvalCase.suite).toBe('regression');
  });
});
