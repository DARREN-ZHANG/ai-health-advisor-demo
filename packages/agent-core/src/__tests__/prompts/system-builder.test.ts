import { describe, it, expect } from 'vitest';
import { buildSystemPrompt } from '../../prompts/system-builder';
import type { AgentContext } from '../../types/agent-context';
import { AgentTaskType } from '@health-advisor/shared';
import type { PromptLoader } from '../../prompts/prompt-loader';

const mockLoader: PromptLoader = {
  load: (name) => {
    const templates: Record<string, string> = {
      system: '你是一位健康顾问\n\n## 分析原则\n\n1. 基于数据事实',
    };
    return templates[name] ?? '';
  },
  listAvailable: () => ['system'],
};

function makeContext(overrides: Partial<AgentContext> = {}): AgentContext {
  return {
    profile: {
      profileId: 'profile-a',
      name: '张健康',
      age: 32,
      tags: [],
      baselines: { restingHR: 62, hrv: 58, spo2: 98, avgSleepMinutes: 420, avgSteps: 8500 },
    },
    task: {
      type: AgentTaskType.HOMEPAGE_SUMMARY,
      pageContext: { profileId: 'profile-a', page: 'home', timeframe: 'week' },
    },
    dataWindow: { start: '2026-04-04', end: '2026-04-10', records: [], missingFields: [] },
    signals: { overallStatus: 'green', anomalies: [], trends: [], events: [], lowData: false },
    memory: { recentMessages: [] },
    ...overrides,
  };
}

describe('buildSystemPrompt', () => {
  it('包含基础 persona', () => {
    const prompt = buildSystemPrompt(makeContext(), mockLoader);
    expect(prompt).toContain('健康顾问');
  });

  it('包含用户 profile 信息', () => {
    const prompt = buildSystemPrompt(makeContext(), mockLoader);
    expect(prompt).toContain('张健康');
    expect(prompt).toContain('32');
  });

  it('包含基线数据', () => {
    const prompt = buildSystemPrompt(makeContext(), mockLoader);
    expect(prompt).toContain('62'); // restingHR
    expect(prompt).toContain('58'); // hrv
  });

  it('包含数据质量声明', () => {
    const prompt = buildSystemPrompt(makeContext(), mockLoader);
    expect(prompt).toContain('缺失');
  });

  it('包含低数据警告', () => {
    const ctx = makeContext({
      signals: { ...makeContext().signals, lowData: true },
    });
    const prompt = buildSystemPrompt(ctx, mockLoader);
    expect(prompt).toContain('低数据');
  });
});
