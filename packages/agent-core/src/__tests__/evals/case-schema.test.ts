import { describe, it, expect } from 'vitest';
import { parseAgentEvalCase, AgentEvalCaseSchema } from '../../evals/case-schema';
import type { AgentRequest } from '../../types/agent-request';

// ── 测试用公共数据 ────────────────────────────────────

/** 构造一个合法的 AgentEvalCase 数据 */
function createValidCase(overrides?: Record<string, unknown>) {
  return {
    id: 'H-001',
    title: '正常健康状态 Homepage',
    suite: 'smoke',
    category: 'homepage',
    priority: 'P0',
    tags: ['smoke', 'homepage'],
    setup: {
      profileId: 'profile-001',
    },
    request: {
      requestId: 'req-001',
      sessionId: 'sess-001',
      profileId: 'profile-001',
      taskType: 'homepage_summary',
      pageContext: {
        profileId: 'profile-001',
        page: 'home',
        timeframe: 'day',
      },
    },
    expectations: {
      protocol: {
        requireValidEnvelope: true,
      },
      summary: {
        length: { min: 80, max: 120 },
      },
    },
    ...overrides,
  };
}

// ── 测试 ──────────────────────────────────────────────

describe('AgentEvalCaseSchema', () => {
  it('合法 case 应通过校验', () => {
    const input = createValidCase();
    const result = parseAgentEvalCase(input);

    expect(result.id).toBe('H-001');
    expect(result.suite).toBe('smoke');
    expect(result.category).toBe('homepage');
    expect(result.priority).toBe('P0');
    expect(result.tags).toEqual(['smoke', 'homepage']);
    expect(result.setup.profileId).toBe('profile-001');
    expect(result.request.profileId).toBe('profile-001');
  });

  it('tags 默认为空数组', () => {
    const input = createValidCase({ tags: undefined });
    // 需要去掉 tags 以测试默认值
    const { tags: _, ...rest } = createValidCase();
    const result = parseAgentEvalCase(rest);
    expect(result.tags).toEqual([]);
  });

  it('缺少 id 应失败', () => {
    const input = createValidCase();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (input as any).id;

    expect(() => parseAgentEvalCase(input)).toThrow();
  });

  it('空字符串 id 应失败', () => {
    const input = createValidCase({ id: '' });
    expect(() => parseAgentEvalCase(input)).toThrow();
  });

  it('request.profileId 与 setup.profileId 不一致应失败', () => {
    const input = createValidCase();
    // 修改 request.profileId 使其与 setup.profileId 不匹配
    input.request.profileId = 'different-profile';
    // pageContext.profileId 仍然匹配 setup.profileId，所以只有 request.profileId 不匹配

    expect(() => parseAgentEvalCase(input)).toThrow();
  });

  it('request.pageContext.profileId 与 setup.profileId 不一致应失败', () => {
    const input = createValidCase();
    input.request.pageContext = {
      ...input.request.pageContext,
      profileId: 'different-profile',
    };

    expect(() => parseAgentEvalCase(input)).toThrow();
  });

  it('非法 taskType 应失败', () => {
    const input = createValidCase();
    input.request.taskType = 'invalid_task_type';

    expect(() => parseAgentEvalCase(input)).toThrow();
  });

  it('expectations 可为空对象', () => {
    const input = createValidCase({ expectations: {} });
    const result = parseAgentEvalCase(input);
    expect(result.expectations).toEqual({});
  });

  it('非法 suite 应失败', () => {
    const input = createValidCase({ suite: 'invalid' });
    expect(() => parseAgentEvalCase(input)).toThrow();
  });

  it('suite=quality 应通过校验', () => {
    const input = createValidCase({ suite: 'quality' });
    const result = parseAgentEvalCase(input);
    expect(result.suite).toBe('quality');
  });

  it('非法 category 应失败', () => {
    const input = createValidCase({ category: 'invalid' });
    expect(() => parseAgentEvalCase(input)).toThrow();
  });

  it('非法 priority 应失败', () => {
    const input = createValidCase({ priority: 'P3' });
    expect(() => parseAgentEvalCase(input)).toThrow();
  });

  // ── taskSpecific 校验 ───────────────────────────────

  describe('taskSpecific.homepage', () => {
    it('requireRecentEventFirst=true 但缺 recentEventPatterns 应失败', () => {
      const input = createValidCase({
        expectations: {
          taskSpecific: {
            homepage: {
              requireRecentEventFirst: true,
            },
          },
        },
      });
      expect(() => parseAgentEvalCase(input)).toThrow();
    });

    it('requireRecentEventFirst=true 且提供 recentEventPatterns 应通过', () => {
      const input = createValidCase({
        expectations: {
          taskSpecific: {
            homepage: {
              requireRecentEventFirst: true,
              recentEventPatterns: ['运动.*后', '晨跑'],
            },
          },
        },
      });
      const result = parseAgentEvalCase(input);
      expect(result.expectations.taskSpecific?.homepage?.recentEventPatterns).toEqual([
        '运动.*后',
        '晨跑',
      ]);
    });

    it('require24hCrossAnalysis=true 但缺 crossAnalysisPatterns 应失败', () => {
      const input = createValidCase({
        expectations: {
          taskSpecific: {
            homepage: {
              require24hCrossAnalysis: true,
            },
          },
        },
      });
      expect(() => parseAgentEvalCase(input)).toThrow();
    });

    it('require24hCrossAnalysis=true 且提供完整 crossAnalysisPatterns 应通过', () => {
      const input = createValidCase({
        expectations: {
          taskSpecific: {
            homepage: {
              require24hCrossAnalysis: true,
              crossAnalysisPatterns: {
                event: ['运动'],
                metric: ['心率'],
              },
            },
          },
        },
      });
      const result = parseAgentEvalCase(input);
      expect(result.expectations.taskSpecific?.homepage?.crossAnalysisPatterns?.event).toEqual([
        '运动',
      ]);
    });
  });

  describe('taskSpecific.viewSummary', () => {
    it('requiredTab 存在但缺 requiredTabPatterns 应失败', () => {
      const input = createValidCase({
        expectations: {
          taskSpecific: {
            viewSummary: {
              requiredTab: 'hrv',
            },
          },
        },
      });
      expect(() => parseAgentEvalCase(input)).toThrow();
    });

    it('requiredTab 存在且提供 requiredTabPatterns 应通过', () => {
      const input = createValidCase({
        expectations: {
          taskSpecific: {
            viewSummary: {
              requiredTab: 'hrv',
              requiredTabPatterns: ['HRV', '心率变异性'],
            },
          },
        },
      });
      const result = parseAgentEvalCase(input);
      expect(result.expectations.taskSpecific?.viewSummary?.requiredTab).toBe('hrv');
    });
  });

  describe('taskSpecific.advisorChat', () => {
    it('requiredTimeScope 存在但缺 requiredTimeScopePatterns 应失败', () => {
      const input = createValidCase({
        expectations: {
          taskSpecific: {
            advisorChat: {
              requiredTimeScope: 'week',
            },
          },
        },
      });
      expect(() => parseAgentEvalCase(input)).toThrow();
    });

    it('requiredTimeScope 存在且提供 requiredTimeScopePatterns 应通过', () => {
      const input = createValidCase({
        expectations: {
          taskSpecific: {
            advisorChat: {
              requiredTimeScope: 'week',
              requiredTimeScopePatterns: ['本周', '过去.*天'],
            },
          },
        },
      });
      const result = parseAgentEvalCase(input);
      expect(result.expectations.taskSpecific?.advisorChat?.requiredTimeScope).toBe('week');
    });

    it('mustAnswerUserQuestion=true 但缺 answerPatterns 应失败', () => {
      const input = createValidCase({
        expectations: {
          taskSpecific: {
            advisorChat: {
              mustAnswerUserQuestion: true,
            },
          },
        },
      });
      expect(() => parseAgentEvalCase(input)).toThrow();
    });

    it('mustAnswerUserQuestion=true 且提供 answerPatterns 应通过', () => {
      const input = createValidCase({
        expectations: {
          taskSpecific: {
            advisorChat: {
              mustAnswerUserQuestion: true,
              answerPatterns: ['建议.*休息', '低强度'],
            },
          },
        },
      });
      const result = parseAgentEvalCase(input);
      expect(result.expectations.taskSpecific?.advisorChat?.answerPatterns).toEqual([
        '建议.*休息',
        '低强度',
      ]);
    });
  });

  // ── evidence 校验 ───────────────────────────────────

  describe('evidence', () => {
    it('requiredFacts 缺少 mentionPatterns 应失败', () => {
      const input = createValidCase({
        expectations: {
          evidence: {
            requiredFacts: [
              { id: 'fact-1', metric: 'hrv', value: 45, unit: 'ms' },
            ],
          },
        },
      });
      expect(() => parseAgentEvalCase(input)).toThrow();
    });

    it('requiredFacts 提供空 mentionPatterns 应失败', () => {
      const input = createValidCase({
        expectations: {
          evidence: {
            requiredFacts: [
              { id: 'fact-1', mentionPatterns: [] },
            ],
          },
        },
      });
      expect(() => parseAgentEvalCase(input)).toThrow();
    });

    it('requiredFacts 提供非空 mentionPatterns 应通过', () => {
      const input = createValidCase({
        expectations: {
          evidence: {
            requiredFacts: [
              { id: 'fact-1', metric: 'hrv', mentionPatterns: ['HRV.*45', '心率变异性'] },
            ],
          },
        },
      });
      const result = parseAgentEvalCase(input);
      expect(result.expectations.evidence?.requiredFacts?.[0]?.id).toBe('fact-1');
    });
  });

  // ── 完整 setup 校验 ─────────────────────────────────

  describe('setup', () => {
    it('包含完整 setup 字段应通过', () => {
      const input = createValidCase({
        setup: {
          profileId: 'profile-001',
          memory: {
            sessionMessages: [
              { role: 'user' as const, text: '我今天状态怎么样？', createdAt: 1000000 },
              { role: 'assistant' as const, text: '您今天整体状态良好。' },
            ],
            analytical: {
              latestHomepageBrief: '用户整体健康状态稳定。',
              latestViewSummaryByScope: { hrv_day: 'HRV 略有下降。' },
              latestRuleSummary: '无重大异常。',
            },
          },
          overrides: [
            { metric: 'hrv', value: 35, dateRange: { start: '2026-04-24', end: '2026-04-25' } },
          ],
          injectedEvents: [
            { date: '2026-04-25', type: 'exercise', data: { duration: 30 } },
          ],
          timeline: {
            performSync: 'app_open' as const,
            appendSegments: [
              {
                segmentType: 'running',
                params: { duration: 30, intensity: 'moderate' },
                offsetMinutes: -60,
                durationMinutes: 30,
                advanceClock: true,
              },
            ],
          },
          referenceDate: '2026-04-25',
          modelFixture: {
            mode: 'fake-json' as const,
            content: '{"summary":"测试摘要"}',
          },
        },
      });
      const result = parseAgentEvalCase(input);
      expect(result.setup.memory?.sessionMessages?.length).toBe(2);
      expect(result.setup.timeline?.performSync).toBe('app_open');
    });
  });
});
