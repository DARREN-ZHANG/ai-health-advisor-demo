import { describe, it, expect } from 'vitest';
import { ChartTokenId } from '@health-advisor/shared';
import { protocolScorer } from '../../evals/scorers/protocol-scorer';
import { lengthScorer } from '../../evals/scorers/length-scorer';
import { statusScorer } from '../../evals/scorers/status-scorer';
import { tokenScorer } from '../../evals/scorers/token-scorer';
import { DEFAULT_SCORERS } from '../../evals/scorers';
import type { EvalScorerInput } from '../../evals/types';
import type { AgentRequest } from '../../types/agent-request';
import type { AgentResponseEnvelope } from '@health-advisor/shared';

// ── 测试用公共数据 ────────────────────────────────────────

/** 构造一个合法的 AgentRequest */
function createValidRequest(overrides?: Partial<AgentRequest>): AgentRequest {
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

/** 构造一个合法的 AgentResponseEnvelope */
function createValidEnvelope(
  overrides?: Partial<AgentResponseEnvelope>,
): AgentResponseEnvelope {
  return {
    summary: '您今天的整体健康状态良好，各项指标均在正常范围内，建议保持规律作息。',
    source: 'llm',
    statusColor: 'good',
    chartTokens: [ChartTokenId.HRV_7DAYS],
    microTips: ['建议每天保持 7-8 小时睡眠'],
    meta: {
      taskType: 'homepage_summary' as const,
      pageContext: {
        profileId: 'profile-001',
        page: 'home',
        timeframe: 'day' as const,
      },
      finishReason: 'complete' as const,
      sessionId: 'sess-001',
    },
    ...overrides,
  };
}

/** 构造一个合法的 AgentEvalCase */
function createValidCase(overrides?: Record<string, unknown>) {
  return {
    id: 'H-001',
    title: '正常健康状态 Homepage',
    suite: 'smoke' as const,
    category: 'homepage' as const,
    priority: 'P0' as const,
    tags: ['smoke', 'homepage'],
    setup: {
      profileId: 'profile-001',
    },
    request: createValidRequest(),
    expectations: {
      protocol: {
        requireValidEnvelope: true,
        expectedFinishReason: 'complete' as const,
      },
      summary: {
        length: { min: 80, max: 120 },
      },
      status: {
        expectedStatusColor: 'good' as const,
      },
    },
    ...overrides,
  };
}

/** 构造一个合法的 EvalArtifacts */
function createValidArtifacts(overrides?: Record<string, unknown>) {
  return {
    caseId: 'H-001',
    request: createValidRequest(),
    ...overrides,
  };
}

/** 构造完整的 scorer input */
function createScorerInput(
  overrides?: Partial<EvalScorerInput>,
): EvalScorerInput {
  return {
    evalCase: createValidCase() as any,
    envelope: createValidEnvelope(),
    artifacts: createValidArtifacts() as any,
    ...overrides,
  };
}

// ── Protocol Scorer 测试 ──────────────────────────────────

describe('protocolScorer', () => {
  it('合法 envelope 应全部通过', () => {
    const input = createScorerInput();
    const results = protocolScorer.score(input);

    // 应有 5 个检查：exists, schema, taskType, profileId, finishReason
    expect(results.length).toBeGreaterThanOrEqual(4);

    for (const result of results) {
      expect(result.passed).toBe(true);
    }
  });

  it('envelope 不存在应失败', () => {
    const input = createScorerInput({ envelope: undefined });
    const results = protocolScorer.score(input);

    const existsCheck = results.find((r) => r.checkId.includes('envelope_exists'));
    expect(existsCheck).toBeDefined();
    expect(existsCheck!.passed).toBe(false);
  });

  it('taskType 不匹配应失败', () => {
    const envelope = createValidEnvelope({
      meta: {
        ...createValidEnvelope().meta,
        taskType: 'advisor_chat' as any,
      },
    });
    const input = createScorerInput({ envelope });
    const results = protocolScorer.score(input);

    const taskTypeCheck = results.find((r) => r.checkId.includes('task_type_match'));
    expect(taskTypeCheck).toBeDefined();
    expect(taskTypeCheck!.passed).toBe(false);
  });

  it('profileId 不匹配应失败', () => {
    const envelope = createValidEnvelope({
      meta: {
        ...createValidEnvelope().meta,
        pageContext: {
          ...createValidEnvelope().meta.pageContext,
          profileId: 'wrong-profile',
        },
      },
    });
    const input = createScorerInput({ envelope });
    const results = protocolScorer.score(input);

    const profileIdCheck = results.find((r) => r.checkId.includes('profile_id_match'));
    expect(profileIdCheck).toBeDefined();
    expect(profileIdCheck!.passed).toBe(false);
  });

  it('非法 finishReason 应导致 schema 校验失败', () => {
    // 构造一个 finishReason='cached' 的 envelope
    // Zod schema 不包含 'cached'，所以 schema 校验会失败
    const envelope = createValidEnvelope({
      meta: {
        ...createValidEnvelope().meta,
        finishReason: 'cached' as any,
      },
    });
    const input = createScorerInput({ envelope });
    const results = protocolScorer.score(input);

    const schemaCheck = results.find((r) => r.checkId.includes('schema_valid'));
    expect(schemaCheck).toBeDefined();
    // Zod schema 不包含 'cached'，所以 schema 校验应失败
    expect(schemaCheck!.passed).toBe(false);
  });

  it('expectedFinishReason 不匹配应失败', () => {
    const evalCase = createValidCase({
      expectations: {
        protocol: {
          requireValidEnvelope: true,
          expectedFinishReason: 'fallback',
        },
      },
    });
    const input = createScorerInput({
      evalCase: evalCase as any,
    });
    const results = protocolScorer.score(input);

    const finishReasonCheck = results.find((r) => r.checkId.includes('finish_reason'));
    expect(finishReasonCheck).toBeDefined();
    expect(finishReasonCheck!.passed).toBe(false);
  });

  it('无 protocol 期望且无 envelope 时返回空结果', () => {
    const evalCase = createValidCase({ expectations: {} });
    const input = createScorerInput({
      evalCase: evalCase as any,
      envelope: undefined,
    });
    const results = protocolScorer.score(input);
    expect(results).toEqual([]);
  });
});

// ── Length Scorer 测试 ─────────────────────────────────────

describe('lengthScorer', () => {
  it('摘要长度在合法范围内应通过', () => {
    // 30 字的中文摘要
    const envelope = createValidEnvelope({
      summary: '您今天的整体健康状态良好，各项指标均在正常范围内，建议保持规律作息。',
    });
    const evalCase = createValidCase({
      expectations: {
        summary: { length: { min: 20, max: 50 } },
      },
    });
    const input = createScorerInput({
      evalCase: evalCase as any,
      envelope,
    });
    const results = lengthScorer.score(input);

    const lengthCheck = results.find((r) => r.checkId.includes('summary_length'));
    expect(lengthCheck).toBeDefined();
    expect(lengthCheck!.passed).toBe(true);
  });

  it('摘要过长应失败', () => {
    const longSummary = '这是一段非常长的摘要文本'.repeat(20);
    const envelope = createValidEnvelope({ summary: longSummary });
    const evalCase = createValidCase({
      expectations: {
        summary: { length: { max: 50 } },
      },
    });
    const input = createScorerInput({
      evalCase: evalCase as any,
      envelope,
    });
    const results = lengthScorer.score(input);

    const lengthCheck = results.find((r) => r.checkId.includes('summary_length'));
    expect(lengthCheck).toBeDefined();
    expect(lengthCheck!.passed).toBe(false);
    expect(lengthCheck!.message).toContain('过长');
  });

  it('摘要过短应失败', () => {
    const envelope = createValidEnvelope({ summary: '太短' });
    const evalCase = createValidCase({
      expectations: {
        summary: { length: { min: 80 } },
      },
    });
    const input = createScorerInput({
      evalCase: evalCase as any,
      envelope,
    });
    const results = lengthScorer.score(input);

    const lengthCheck = results.find((r) => r.checkId.includes('summary_length'));
    expect(lengthCheck).toBeDefined();
    expect(lengthCheck!.passed).toBe(false);
    expect(lengthCheck!.message).toContain('过短');
  });

  it('homepage 类型默认使用 80-120 范围', () => {
    // 30 字，低于默认 min 80
    const shortSummary = '您今天的整体健康状态良好。';
    const envelope = createValidEnvelope({ summary: shortSummary });
    const evalCase = createValidCase({
      expectations: { summary: {} },
    });
    const input = createScorerInput({
      evalCase: evalCase as any,
      envelope,
    });
    const results = lengthScorer.score(input);

    const lengthCheck = results.find((r) => r.checkId.includes('summary_length'));
    expect(lengthCheck).toBeDefined();
    expect(lengthCheck!.passed).toBe(false);
    expect(lengthCheck!.details?.min).toBe(80);
    expect(lengthCheck!.details?.max).toBe(120);
  });

  it('非 homepage 且无显式配置时跳过长度检查', () => {
    const envelope = createValidEnvelope({ summary: '短' });
    const evalCase = createValidCase({
      request: createValidRequest({ taskType: 'advisor_chat' as any }),
      expectations: { summary: {} },
    });
    const input = createScorerInput({
      evalCase: evalCase as any,
      envelope,
    });
    const results = lengthScorer.score(input);
    expect(results).toEqual([]);
  });
});

// ── Status Scorer 测试 ────────────────────────────────────

describe('statusScorer', () => {
  it('expectedStatusColor 匹配应通过', () => {
    const evalCase = createValidCase({
      expectations: {
        status: { expectedStatusColor: 'good' },
      },
    });
    const input = createScorerInput({ evalCase: evalCase as any });
    const results = statusScorer.score(input);

    expect(results.length).toBe(1);
    expect(results[0].passed).toBe(true);
  });

  it('expectedStatusColor 不匹配应失败', () => {
    const evalCase = createValidCase({
      expectations: {
        status: { expectedStatusColor: 'warning' },
      },
    });
    const input = createScorerInput({ evalCase: evalCase as any });
    const results = statusScorer.score(input);

    expect(results.length).toBe(1);
    expect(results[0].passed).toBe(false);
    expect(results[0].message).toContain('不匹配');
  });

  it('allowedStatusColors 包含实际值应通过', () => {
    const evalCase = createValidCase({
      expectations: {
        status: { allowedStatusColors: ['good', 'warning'] },
      },
    });
    const input = createScorerInput({ evalCase: evalCase as any });
    const results = statusScorer.score(input);

    expect(results.length).toBe(1);
    expect(results[0].passed).toBe(true);
  });

  it('allowedStatusColors 不包含实际值应失败', () => {
    const evalCase = createValidCase({
      expectations: {
        status: { allowedStatusColors: ['warning', 'error'] },
      },
    });
    const input = createScorerInput({ evalCase: evalCase as any });
    const results = statusScorer.score(input);

    expect(results.length).toBe(1);
    expect(results[0].passed).toBe(false);
    expect(results[0].message).toContain('不在允许列表中');
  });

  it('无 status 期望时返回空结果', () => {
    const evalCase = createValidCase({ expectations: {} });
    const input = createScorerInput({ evalCase: evalCase as any });
    const results = statusScorer.score(input);
    expect(results).toEqual([]);
  });
});

// ── Token Scorer 测试 ─────────────────────────────────────

describe('tokenScorer', () => {
  it('合法 token 应通过', () => {
    const evalCase = createValidCase({
      expectations: {
        chartTokens: {
          required: [ChartTokenId.HRV_7DAYS],
          maxCount: 2,
        },
      },
    });
    const input = createScorerInput({ evalCase: evalCase as any });
    const results = tokenScorer.score(input);

    // 所有检查应通过
    for (const result of results) {
      expect(result.passed).toBe(true);
    }
  });

  it('forbidden token 应失败', () => {
    const evalCase = createValidCase({
      expectations: {
        chartTokens: {
          forbidden: [ChartTokenId.HRV_7DAYS],
        },
      },
    });
    const input = createScorerInput({ evalCase: evalCase as any });
    const results = tokenScorer.score(input);

    const forbiddenCheck = results.find((r) => r.checkId.includes('forbidden'));
    expect(forbiddenCheck).toBeDefined();
    expect(forbiddenCheck!.passed).toBe(false);
    expect(forbiddenCheck!.message).toContain('forbidden token');
  });

  it('token 数量超过 maxCount 应失败', () => {
    const envelope = createValidEnvelope({
      chartTokens: [ChartTokenId.HRV_7DAYS, ChartTokenId.SLEEP_7DAYS, ChartTokenId.ACTIVITY_7DAYS],
    });
    const evalCase = createValidCase({
      expectations: {
        chartTokens: { maxCount: 2 },
      },
    });
    const input = createScorerInput({
      evalCase: evalCase as any,
      envelope,
    });
    const results = tokenScorer.score(input);

    const countCheck = results.find((r) => r.checkId.includes('count'));
    expect(countCheck).toBeDefined();
    expect(countCheck!.passed).toBe(false);
    expect(countCheck!.message).toContain('超限');
  });

  it('required token 缺失应失败', () => {
    const evalCase = createValidCase({
      expectations: {
        chartTokens: {
          required: [ChartTokenId.SLEEP_7DAYS],
        },
      },
    });
    // envelope 只有 HRV_7DAYS
    const input = createScorerInput({ evalCase: evalCase as any });
    const results = tokenScorer.score(input);

    const requiredCheck = results.find((r) => r.checkId.includes('required'));
    expect(requiredCheck).toBeDefined();
    expect(requiredCheck!.passed).toBe(false);
    expect(requiredCheck!.message).toContain('缺少');
  });

  it('requiredAny 至少一组命中应通过', () => {
    const evalCase = createValidCase({
      expectations: {
        chartTokens: {
          requiredAny: [
            [ChartTokenId.SLEEP_7DAYS, ChartTokenId.HRV_7DAYS],
          ],
        },
      },
    });
    // envelope 有 HRV_7DAYS
    const input = createScorerInput({ evalCase: evalCase as any });
    const results = tokenScorer.score(input);

    const requiredAnyCheck = results.find((r) => r.checkId.includes('required_any'));
    expect(requiredAnyCheck).toBeDefined();
    expect(requiredAnyCheck!.passed).toBe(true);
  });

  it('requiredAny 全部未命中应失败', () => {
    const evalCase = createValidCase({
      expectations: {
        chartTokens: {
          requiredAny: [
            [ChartTokenId.SLEEP_7DAYS, ChartTokenId.STRESS_LOAD_7DAYS],
          ],
        },
      },
    });
    // envelope 只有 HRV_7DAYS
    const input = createScorerInput({ evalCase: evalCase as any });
    const results = tokenScorer.score(input);

    const requiredAnyCheck = results.find((r) => r.checkId.includes('required_any'));
    expect(requiredAnyCheck).toBeDefined();
    expect(requiredAnyCheck!.passed).toBe(false);
  });

  it('非法 token 应导致 validity 检查失败', () => {
    const envelope = createValidEnvelope({
      chartTokens: ['INVALID_TOKEN' as any],
    });
    const evalCase = createValidCase({
      expectations: {
        chartTokens: { maxCount: 2 },
      },
    });
    const input = createScorerInput({
      evalCase: evalCase as any,
      envelope,
    });
    const results = tokenScorer.score(input);

    const validityCheck = results.find((r) => r.checkId.includes('validity'));
    expect(validityCheck).toBeDefined();
    expect(validityCheck!.passed).toBe(false);
  });

  it('无 chartTokens 期望时返回空结果', () => {
    const evalCase = createValidCase({ expectations: {} });
    const input = createScorerInput({ evalCase: evalCase as any });
    const results = tokenScorer.score(input);
    expect(results).toEqual([]);
  });
});

// ── DEFAULT_SCORERS 测试 ──────────────────────────────────

describe('DEFAULT_SCORERS', () => {
  it('应包含 4 个 scorer', () => {
    expect(DEFAULT_SCORERS).toHaveLength(4);
  });

  it('每个 scorer 应有 id 和 score 方法', () => {
    for (const scorer of DEFAULT_SCORERS) {
      expect(scorer.id).toBeTruthy();
      expect(typeof scorer.score).toBe('function');
    }
  });

  it('scorer id 应不重复', () => {
    const ids = DEFAULT_SCORERS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
