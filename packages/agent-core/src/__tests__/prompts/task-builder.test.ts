import { describe, it, expect } from 'vitest';
import { buildTaskPrompt } from '../../prompts/task-builder';
import type { AgentContext } from '../../types/agent-context';
import { AgentTaskType } from '@health-advisor/shared';
import type { PromptLoader } from '../../prompts/prompt-loader';
import type { RuleEvaluationResult } from '../../rules/types';

const mockLoader: PromptLoader = {
  load: (name) => {
    const templates: Record<string, string> = {
      homepage: '## 首页摘要生成\n\n请生成首页概览摘要。',
      'view-summary': '## 详情页分析\n\n请生成数据分析摘要。',
      'advisor-chat': '## 健康顾问对话\n\n你正在与用户对话。',
    };
    return templates[name] ?? '';
  },
  listAvailable: () => ['homepage', 'view-summary', 'advisor-chat'],
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
    dataWindow: {
      start: '2026-04-04',
      end: '2026-04-10',
      records: [{ date: '2026-04-10', hr: [60, 62], spo2: 98 }],
      missingFields: [],
    },
    signals: { overallStatus: 'green', anomalies: [], trends: [], events: [], lowData: false },
    memory: { recentMessages: [] },
    ...overrides,
  };
}

const emptyRules: RuleEvaluationResult = {
  insights: [],
  suggestedChartTokens: [],
  suggestedMicroTips: [],
  statusColor: 'green',
};

describe('buildTaskPrompt', () => {
  it('homepage 任务包含首页摘要模板', () => {
    const prompt = buildTaskPrompt(makeContext(), mockLoader, emptyRules);
    expect(prompt).toContain('首页摘要');
  });

  it('view_summary 任务包含详情分析模板', () => {
    const ctx = makeContext({
      task: {
        type: AgentTaskType.VIEW_SUMMARY,
        pageContext: { profileId: 'profile-a', page: 'data-center', dataTab: 'hrv', timeframe: 'week' },
        tab: 'hrv',
        timeframe: 'week',
      },
    });
    const prompt = buildTaskPrompt(ctx, mockLoader, emptyRules);
    expect(prompt).toContain('详情页分析');
  });

  it('advisor_chat 任务包含对话模板和用户消息', () => {
    const ctx = makeContext({
      task: {
        type: AgentTaskType.ADVISOR_CHAT,
        pageContext: { profileId: 'profile-a', page: 'home', timeframe: 'week' },
        userMessage: '最近感觉怎样',
      },
    });
    const prompt = buildTaskPrompt(ctx, mockLoader, emptyRules);
    expect(prompt).toContain('健康顾问对话');
    expect(prompt).toContain('最近感觉怎样');
  });

  it('包含数据窗口信息', () => {
    const prompt = buildTaskPrompt(makeContext(), mockLoader, emptyRules);
    expect(prompt).toContain('2026-04-04');
    expect(prompt).toContain('2026-04-10');
  });

  it('包含规则引擎 insights', () => {
    const rules: RuleEvaluationResult = {
      ...emptyRules,
      insights: [
        { category: 'anomaly', severity: 'warning', metric: 'hrv', message: 'HRV 下降' },
      ],
    };
    const prompt = buildTaskPrompt(makeContext(), mockLoader, rules);
    expect(prompt).toContain('HRV 下降');
  });

  it('包含历史对话记忆', () => {
    const ctx = makeContext({
      memory: {
        recentMessages: [
          { role: 'user', text: '你好' },
          { role: 'assistant', text: '你好，我是你的健康顾问' },
        ],
      },
    });
    const prompt = buildTaskPrompt(ctx, mockLoader, emptyRules);
    expect(prompt).toContain('你好');
  });

  it('包含输出格式要求', () => {
    const prompt = buildTaskPrompt(makeContext(), mockLoader, emptyRules);
    expect(prompt).toContain('summary');
    expect(prompt).toContain('chartTokens');
    expect(prompt).toContain('microTips');
  });

  it('包含 analytical memory 历史分析参考', () => {
    const ctx = makeContext({
      memory: {
        recentMessages: [],
        latestHomepageBrief: '上次首页摘要内容',
        latestViewSummary: '上次视图总结内容',
        latestRuleSummary: '上次规则分析内容',
      },
    });
    const prompt = buildTaskPrompt(ctx, mockLoader, emptyRules);
    expect(prompt).toContain('历史分析参考');
    expect(prompt).toContain('上次首页摘要内容');
    expect(prompt).toContain('上次视图总结内容');
    expect(prompt).toContain('上次规则分析内容');
  });
});
