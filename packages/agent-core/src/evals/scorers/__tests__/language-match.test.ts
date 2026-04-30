import { describe, it, expect } from 'vitest';
import { languageMatchScorer } from '../language-match-scorer';
import type { EvalScorerInput } from '../../types';
import type { AgentRequest } from '../../../types/agent-request';
import type { AgentResponseEnvelope, AgentContext } from '@health-advisor/shared';

// ── 测试工具函数 ──────────────────────────────────────────

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

function createValidEnvelope(
  overrides?: Partial<AgentResponseEnvelope>,
): AgentResponseEnvelope {
  return {
    summary: '您今天的整体健康状态良好，各项指标均在正常范围内，建议保持规律作息。',
    source: 'llm',
    statusColor: 'good',
    chartTokens: [],
    microTips: [],
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

function createValidCase(overrides?: Record<string, unknown>) {
  return {
    id: 'H-001',
    title: '测试用例',
    suite: 'smoke' as const,
    category: 'homepage' as const,
    priority: 'P0' as const,
    tags: [],
    setup: { profileId: 'profile-001' },
    request: createValidRequest(),
    expectations: {},
    ...overrides,
  };
}

/** 构造 scorer input，可指定 locale */
function createScorerInput(options?: {
  summary?: string;
  locale?: 'zh' | 'en';
  noEnvelope?: boolean;
}): EvalScorerInput {
  const envelope = options?.noEnvelope
    ? undefined
    : createValidEnvelope({
        summary: options?.summary ?? '您今天的整体健康状态良好，各项指标均在正常范围内，建议保持规律作息。',
      });

  const context: Partial<AgentContext> | undefined = options?.locale
    ? ({
        profile: { profileId: 'profile-001', name: { zh: '测试', en: 'Test' }, age: 30, gender: 'male', avatar: '', tags: [], baseline: { restingHr: 60, hrv: 50, spo2: 97, avgSleepMinutes: 420, avgSteps: 8000 } },
        signals: { lowData: false },
        memory: { recentMessages: [] },
        locale: options.locale,
      } as AgentContext)
    : undefined;

  return {
    evalCase: createValidCase() as any,
    envelope,
    artifacts: {
      caseId: 'H-001',
      request: createValidRequest(),
      context: context as any,
    } as any,
  };
}

// ── 测试用例 ──────────────────────────────────────────────

describe('languageMatchScorer', () => {
  it('中文 summary 通过 zh 检测', () => {
    const input = createScorerInput({
      summary: '你的心率变异性趋势良好，建议继续保持规律运动。',
      locale: 'zh',
    });
    const results = languageMatchScorer.score(input);
    expect(results).toHaveLength(1);
    expect(results[0].passed).toBe(true);
  });

  it('英文 summary 通过 en 检测', () => {
    const input = createScorerInput({
      summary: 'Your heart rate variability trend looks good. Keep up the regular exercise.',
      locale: 'en',
    });
    const results = languageMatchScorer.score(input);
    expect(results).toHaveLength(1);
    expect(results[0].passed).toBe(true);
  });

  it('英文 summary 不通过 zh 检测', () => {
    const input = createScorerInput({
      summary: 'Your heart rate variability is stable.',
      locale: 'zh',
    });
    const results = languageMatchScorer.score(input);
    expect(results).toHaveLength(1);
    expect(results[0].passed).toBe(false);
  });

  it('中文 summary 不通过 en 检测', () => {
    const input = createScorerInput({
      summary: '你的心率变异性趋势稳定。',
      locale: 'en',
    });
    const results = languageMatchScorer.score(input);
    expect(results).toHaveLength(1);
    expect(results[0].passed).toBe(false);
  });

  it('空 summary 不通过', () => {
    const input1 = createScorerInput({ summary: '', locale: 'zh' });
    const results1 = languageMatchScorer.score(input1);
    expect(results1[0].passed).toBe(false);

    const input2 = createScorerInput({ summary: 'short', locale: 'zh' });
    const results2 = languageMatchScorer.score(input2);
    expect(results2[0].passed).toBe(false);
  });

  it('混合语言 summary（中文为主）通过 zh 检测', () => {
    const input = createScorerInput({
      summary: '你的 HRV 趋势良好，建议继续保持规律 exercise。',
      locale: 'zh',
    });
    const results = languageMatchScorer.score(input);
    expect(results).toHaveLength(1);
    expect(results[0].passed).toBe(true);
  });

  it('默认 locale 为 zh（无 context 时）', () => {
    const input = createScorerInput({
      summary: '你的心率变异性趋势良好，建议继续保持规律运动。',
    });
    const results = languageMatchScorer.score(input);
    expect(results).toHaveLength(1);
    expect(results[0].passed).toBe(true);
  });

  it('无 envelope 时返回空结果', () => {
    const input = createScorerInput({ noEnvelope: true });
    const results = languageMatchScorer.score(input);
    expect(results).toEqual([]);
  });

  it('check 结果包含正确的 checkId 格式', () => {
    const input = createScorerInput({
      summary: '你的心率变异性趋势良好。',
      locale: 'zh',
    });
    const results = languageMatchScorer.score(input);
    expect(results[0].checkId).toBe('H-001:language_match:summary_language');
  });

  it('check 结果 severity 为 soft', () => {
    const input = createScorerInput({
      summary: '你的心率变异性趋势良好。',
      locale: 'zh',
    });
    const results = languageMatchScorer.score(input);
    expect(results[0].severity).toBe('soft');
  });
});
