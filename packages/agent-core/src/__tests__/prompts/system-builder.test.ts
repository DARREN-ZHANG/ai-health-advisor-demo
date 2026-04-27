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

  it('包含标签信息', () => {
    const ctx = makeContext({
      profile: { ...makeContext().profile, tags: ['耐力训练', '睡眠改善'] },
    });
    const prompt = buildSystemPrompt(ctx, mockLoader);
    expect(prompt).toContain('耐力训练');
    expect(prompt).toContain('睡眠改善');
  });

  it('包含个人参考水平数据', () => {
    const prompt = buildSystemPrompt(makeContext(), mockLoader);
    expect(prompt).toContain('62'); // restingHR
    expect(prompt).toContain('58'); // hrv
    expect(prompt).toContain('98'); // spo2
    expect(prompt).toContain('420'); // avgSleepMinutes
    expect(prompt).toContain('8500'); // avgSteps
    expect(prompt).not.toContain('基线');
    expect(prompt).not.toContain('基准线');
    expect(prompt).not.toContain('baseline');
  });

  it('包含数据质量声明（无 missingData）', () => {
    const prompt = buildSystemPrompt(makeContext(), mockLoader);
    expect(prompt).toContain('数据完整');
  });

  it('包含结构化 missingData', () => {
    const missingData = [
      {
        metric: 'sleep',
        scope: 'latest24h' as const,
        missingCount: 1,
        totalCount: 1,
        impact: 'cannot assess last-night sleep',
        requiredDisclosure: '必须说明昨晚睡眠数据不足',
        evidenceId: 'missing_sleep_latest24h',
      },
    ];
    const prompt = buildSystemPrompt(makeContext(), mockLoader, missingData);
    expect(prompt).toContain('sleep 在 latest24h 缺失');
    expect(prompt).toContain('必须说明昨晚睡眠数据不足');
  });

  it('包含低数据警告', () => {
    const ctx = makeContext({
      signals: { ...makeContext().signals, lowData: true },
    });
    const prompt = buildSystemPrompt(ctx, mockLoader);
    expect(prompt).toContain('低数据');
  });

  it('包含证据约束', () => {
    const prompt = buildSystemPrompt(makeContext(), mockLoader);
    expect(prompt).toContain('只能基于 evidence facts');
    expect(prompt).toContain('不得补全');
    expect(prompt).toContain('必须能回溯到至少一个 evidence fact');
  });
});
