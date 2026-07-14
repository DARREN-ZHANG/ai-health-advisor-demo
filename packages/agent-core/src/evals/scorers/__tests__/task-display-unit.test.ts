import { describe, expect, it } from 'vitest';
import type { AgentResponseEnvelope } from '@health-advisor/shared';
import { taskScorer } from '../task-scorer';
import type { EvalScorerInput } from '../../types';

function score(summary: string) {
  const envelope: AgentResponseEnvelope = {
    source: 'llm',
    statusColor: 'good',
    summary,
    chartTokens: [],
    meta: {
      taskType: 'homepage_summary',
      pageContext: { profileId: 'p1', page: 'home' },
      finishReason: 'complete',
    },
  };

  const input = {
    evalCase: {
      id: 'unit-contract',
      expectations: {
        taskSpecific: {
          homepage: {
            requiredDisplayUnits: {
              sleep: {
                metricPatterns: ['sleep', '睡眠', 'deep sleep', '深睡'],
                unitPatterns: ['\\d+(?:\\.\\d+)?\\s*h\\b'],
              },
            },
            forbiddenDisplayUnits: {
              sleep: {
                metricPatterns: ['sleep', '睡眠', 'deep sleep', '深睡'],
                unitPatterns: ['\\d+(?:\\.\\d+)?\\s*(?:min|minutes|分钟)\\b'],
              },
            },
          },
        },
      },
    },
    envelope,
    artifacts: {},
  } as EvalScorerInput;

  return taskScorer.score(input);
}

describe('task scorer metric-specific display units', () => {
  it('sleep 使用 h 时通过 required/forbidden 合同', () => {
    const results = score('Your sleep totaled 7.5 h and deep sleep reached 1.4 h.');
    expect(results).toHaveLength(2);
    expect(results.every((result) => result.passed)).toBe(true);
  });

  it('sleep 使用 min 时同时触发 required 与 forbidden 失败', () => {
    const results = score('Your sleep totaled 450 min.');
    expect(results).toHaveLength(2);
    expect(results.every((result) => !result.passed)).toBe(true);
  });

  it('其他指标使用 min 不会被 sleep 合同跨指标误判', () => {
    const results = score('Your workout lasted 30 min and recovery looks steady.');
    expect(results).toHaveLength(2);
    expect(results.every((result) => result.passed)).toBe(true);
  });
});

