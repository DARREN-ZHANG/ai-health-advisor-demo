import { describe, it, expect } from 'vitest';
import { parseAgentResponse } from '../../output/response-parser';
import { AgentTaskType, ChartTokenId } from '@health-advisor/shared';

const basePageContext = {
  profileId: 'profile-a',
  page: 'home',
  timeframe: 'week' as const,
};

describe('parseAgentResponse', () => {
  it('解析标准 JSON 输出', () => {
    const raw = JSON.stringify({
      source: 'llm',
      statusColor: 'good',
      summary: '整体状态良好，HRV 稳定。',
      chartTokens: [ChartTokenId.HRV_7DAYS],
      microTips: ['保持规律作息', '注意放松'],
    });

    const result = parseAgentResponse(raw, {
      taskType: AgentTaskType.HOMEPAGE_SUMMARY,
      pageContext: basePageContext,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.envelope.summary).toBe('整体状态良好，HRV 稳定。');
      expect(result.envelope.source).toBe('llm');
      expect(result.envelope.statusColor).toBe('good');
      expect(result.envelope.chartTokens).toEqual([ChartTokenId.HRV_7DAYS]);
      expect(result.envelope.microTips).toHaveLength(2);
      expect(result.envelope.meta.finishReason).toBe('complete');
      expect(result.envelope.meta.taskType).toBe(AgentTaskType.HOMEPAGE_SUMMARY);
    }
  });

  it('解析包含 markdown 代码块的 JSON', () => {
    const raw = '```json\n{"summary":"测试","chartTokens":[],"microTips":[]}\n```';

    const result = parseAgentResponse(raw, {
      taskType: AgentTaskType.HOMEPAGE_SUMMARY,
      pageContext: basePageContext,
    });

    expect(result.success).toBe(true);
  });

  it('非法 JSON 返回失败结果', () => {
    const result = parseAgentResponse('这不是 JSON', {
      taskType: AgentTaskType.HOMEPAGE_SUMMARY,
      pageContext: basePageContext,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeDefined();
    }
  });

  it('缺少 summary 字段返回失败', () => {
    const raw = JSON.stringify({
      chartTokens: [],
      microTips: [],
    });

    const result = parseAgentResponse(raw, {
      taskType: AgentTaskType.HOMEPAGE_SUMMARY,
      pageContext: basePageContext,
    });

    expect(result.success).toBe(false);
  });

  it('非法 chartToken 被过滤', () => {
    const raw = JSON.stringify({
      summary: '测试',
      chartTokens: [ChartTokenId.HRV_7DAYS, 'INVALID_TOKEN'],
      microTips: [],
    });

    const result = parseAgentResponse(raw, {
      taskType: AgentTaskType.HOMEPAGE_SUMMARY,
      pageContext: basePageContext,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.envelope.chartTokens).toEqual([ChartTokenId.HRV_7DAYS]);
    }
  });

  it('homepage microTips 截断到 MAX_HOMEPAGE_MICRO_TIPS', () => {
    const tips = Array.from({ length: 10 }, (_, i) => `贴士 ${i}`);
    const raw = JSON.stringify({
      summary: '测试',
      chartTokens: [],
      microTips: tips,
    });

    const result = parseAgentResponse(raw, {
      taskType: AgentTaskType.HOMEPAGE_SUMMARY,
      pageContext: basePageContext,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      // 首页场景单独放宽到 4 条
      expect(result.envelope.microTips).toHaveLength(4);
    }
  });

  it('非首页场景 microTips 仍截断到 MAX_MICRO_TIPS', () => {
    const tips = Array.from({ length: 10 }, (_, i) => `tip ${i}`);
    const raw = JSON.stringify({
      summary: '测试',
      chartTokens: [],
      microTips: tips,
    });

    const result = parseAgentResponse(raw, {
      taskType: AgentTaskType.VIEW_SUMMARY,
      pageContext: basePageContext,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.envelope.microTips).toHaveLength(3);
    }
  });

  it('meta 字段自动填充', () => {
    const raw = JSON.stringify({
      summary: '测试',
      chartTokens: [],
      microTips: [],
    });

    const result = parseAgentResponse(raw, {
      taskType: AgentTaskType.VIEW_SUMMARY,
      pageContext: { ...basePageContext, page: 'data-center', dataTab: 'hrv' },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.envelope.meta.taskType).toBe(AgentTaskType.VIEW_SUMMARY);
      expect(result.envelope.meta.pageContext.page).toBe('data-center');
      expect(result.envelope.meta.finishReason).toBe('complete');
    }
  });

  it('缺少 statusColor 时回退到调用方提供的默认状态', () => {
    const raw = JSON.stringify({
      source: 'llm',
      summary: '测试',
      chartTokens: [],
      microTips: [],
    });

    const result = parseAgentResponse(raw, {
      taskType: AgentTaskType.HOMEPAGE_SUMMARY,
      pageContext: basePageContext,
      defaultStatusColor: 'warning',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.envelope.statusColor).toBe('warning');
    }
  });
});

describe('actions parsing', () => {
  it('parses valid actions from LLM output', () => {
    const raw = JSON.stringify({
      summary: '测试',
      chartTokens: [],
      microTips: [],
      actions: [
        {
          id: 'a1',
          emoji: '💪',
          title: '去运动',
          description: '适当运动有助于恢复',
          aiPromise: '我会记录你的选择并用于本次建议上下文',
        },
        {
          id: 'a2',
          emoji: '😴',
          title: '去休息',
          description: '充足睡眠有助于恢复',
          aiPromise: '我会记录你的选择并用于本次建议上下文',
        },
      ],
    });

    const result = parseAgentResponse(raw, {
      taskType: AgentTaskType.HOMEPAGE_SUMMARY,
      pageContext: basePageContext,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.envelope.actions).toHaveLength(2);
      expect(result.envelope.actions?.[0].id).toBe('a1');
      expect(result.envelope.actions?.[1].title).toBe('去休息');
    }
  });

  it('tolerates missing actions field', () => {
    const raw = JSON.stringify({
      summary: '测试',
      chartTokens: [],
      microTips: [],
    });

    const result = parseAgentResponse(raw, {
      taskType: AgentTaskType.HOMEPAGE_SUMMARY,
      pageContext: basePageContext,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.envelope.actions).toBeUndefined();
    }
  });

  it('tolerates missing microTips field', () => {
    const raw = JSON.stringify({
      summary: '测试',
      chartTokens: [],
      actions: [],
    });

    const result = parseAgentResponse(raw, {
      taskType: AgentTaskType.HOMEPAGE_SUMMARY,
      pageContext: basePageContext,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.envelope.microTips).toBeUndefined();
    }
  });

  it('rejects actions above max 3', () => {
    const actions = Array.from({ length: 5 }, (_, i) => ({
      id: `a${i}`,
      emoji: '🔹',
      title: `选项${i}`,
      description: '描述',
      aiPromise: '承诺',
    }));
    const raw = JSON.stringify({
      summary: '测试',
      chartTokens: [],
      microTips: [],
      actions,
    });

    const result = parseAgentResponse(raw, {
      taskType: AgentTaskType.HOMEPAGE_SUMMARY,
      pageContext: basePageContext,
    });

    expect(result.success).toBe(false);
  });

  it('rejects actions with incomplete fields', () => {
    const raw = JSON.stringify({
      summary: '测试',
      chartTokens: [],
      microTips: [],
      actions: [{ id: 'a1', emoji: '💪', title: '去运动' }],
    });

    const result = parseAgentResponse(raw, {
      taskType: AgentTaskType.HOMEPAGE_SUMMARY,
      pageContext: basePageContext,
    });

    expect(result.success).toBe(false);
  });

  it('rejects actions when not an array', () => {
    const raw = JSON.stringify({
      summary: '测试',
      chartTokens: [],
      microTips: [],
      actions: 'not-an-array',
    });

    const result = parseAgentResponse(raw, {
      taskType: AgentTaskType.HOMEPAGE_SUMMARY,
      pageContext: basePageContext,
    });

    expect(result.success).toBe(false);
  });

  it('parses action interactions from LLM output', () => {
    const raw = JSON.stringify({
      summary: '测试',
      chartTokens: [],
      actions: [
        {
          id: 'a1',
          emoji: '🫁',
          title: '做几次深呼吸',
          description: '现在做 3 分钟缓慢呼吸',
          aiPromise: '我会记录这个微行动并更新实时简报',
          interaction: {
            kind: 'micro_event',
            microEvent: {
              type: 'micro_deep_breathing',
              durationMinutes: 3,
              params: { pattern: 'extended_exhale' },
            },
          },
        },
      ],
    });

    const result = parseAgentResponse(raw, {
      taskType: AgentTaskType.HOMEPAGE_SUMMARY,
      pageContext: basePageContext,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.envelope.actions?.[0]?.interaction).toEqual({
        kind: 'micro_event',
        microEvent: {
          type: 'micro_deep_breathing',
          durationMinutes: 3,
          params: { pattern: 'extended_exhale' },
        },
      });
    }
  });

  it('strips invalid action interaction and keeps the base action', () => {
    const raw = JSON.stringify({
      summary: '测试',
      chartTokens: [],
      actions: [
        {
          id: 'a1',
          emoji: '💧',
          title: '补水',
          description: '喝一杯水',
          aiPromise: '我会记录你的选择并用于本次建议上下文',
          interaction: {
            kind: 'micro_event',
            microEvent: { type: 'micro_hydration_break' },
          },
        },
      ],
    });

    const result = parseAgentResponse(raw, {
      taskType: AgentTaskType.HOMEPAGE_SUMMARY,
      pageContext: basePageContext,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.envelope.actions).toHaveLength(1);
      expect(result.envelope.actions?.[0].id).toBe('a1');
      expect(result.envelope.actions?.[0].interaction).toBeUndefined();
    }
  });

  it('rejects action with incomplete base fields even after stripping interaction', () => {
    const raw = JSON.stringify({
      summary: '测试',
      chartTokens: [],
      actions: [
        {
          id: 'a1',
          emoji: '💧',
          title: '补水',
          // missing description and aiPromise
          interaction: {
            kind: 'micro_event',
            microEvent: { type: 'micro_hydration_break' },
          },
        },
      ],
    });

    const result = parseAgentResponse(raw, {
      taskType: AgentTaskType.HOMEPAGE_SUMMARY,
      pageContext: basePageContext,
    });

    expect(result.success).toBe(false);
  });
});

describe('parseAgentResponse — futureSuggestions 校验', () => {
  const validSuggestion = {
    timePoint: '15:30',
    predictedState: '下午 HRV 通常会出现一个小低谷',
    rationale: '今天已记录 2 杯咖啡',
    action: {
      id: 'future_break_15',
      emoji: '🧘',
      title: '做几次正念呼吸',
      description: '15:20 做 3 分钟缓慢呼吸',
      aiPromise: '我会记录你的选择并用于本次建议上下文',
    },
  };

  function makeRaw(futureSuggestions: unknown, summary = '测试摘要') {
    return JSON.stringify({
      source: 'llm',
      statusColor: 'good',
      summary,
      chartTokens: [],
      futureSuggestions,
    });
  }

  it('demoNow < 21:00 时保留最多 2 个 timePoint > demoNow 的建议', () => {
    const raw = makeRaw([
      validSuggestion,
      {
        ...validSuggestion,
        timePoint: '18:00',
        action: { ...validSuggestion.action, id: 'future_2' },
      },
      {
        ...validSuggestion,
        timePoint: '22:00',
        action: { ...validSuggestion.action, id: 'future_3' },
      },
    ]);

    const result = parseAgentResponse(raw, {
      taskType: AgentTaskType.HOMEPAGE_SUMMARY,
      pageContext: basePageContext,
      demoNow: '2026-07-08T14:00',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.envelope.futureSuggestions).toHaveLength(2);
      expect(result.envelope.futureSuggestions?.[0]?.timePoint).toBe('15:30');
      expect(result.envelope.futureSuggestions?.[1]?.timePoint).toBe('18:00');
    }
  });

  it('demoNow >= 21:00 时只保留 1 个建议', () => {
    const raw = makeRaw([
      { ...validSuggestion, timePoint: '21:30' },
      {
        ...validSuggestion,
        timePoint: '22:30',
        action: { ...validSuggestion.action, id: 'future_2' },
      },
    ]);

    const result = parseAgentResponse(raw, {
      taskType: AgentTaskType.HOMEPAGE_SUMMARY,
      pageContext: basePageContext,
      demoNow: '2026-07-08T21:00',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.envelope.futureSuggestions).toHaveLength(1);
      expect(result.envelope.futureSuggestions?.[0]?.timePoint).toBe('21:30');
    }
  });

  it('过滤掉 timePoint <= demoNow 的项', () => {
    const raw = makeRaw([
      { ...validSuggestion, timePoint: '13:00' }, // 与 demoNow 相同，应被过滤
      { ...validSuggestion, timePoint: '12:00', action: { ...validSuggestion.action, id: 'past' } }, // 早于 demoNow
      {
        ...validSuggestion,
        timePoint: '15:00',
        action: { ...validSuggestion.action, id: 'future_ok' },
      },
    ]);

    const result = parseAgentResponse(raw, {
      taskType: AgentTaskType.HOMEPAGE_SUMMARY,
      pageContext: basePageContext,
      demoNow: '2026-07-08T13:00',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.envelope.futureSuggestions).toHaveLength(1);
      expect(result.envelope.futureSuggestions?.[0]?.timePoint).toBe('15:00');
    }
  });

  it('过滤掉 timePoint > 23:59 的项', () => {
    const raw = makeRaw([
      { ...validSuggestion, timePoint: '24:00' }, // 非法 HH:mm
      { ...validSuggestion, timePoint: '23:59', action: { ...validSuggestion.action, id: 'last' } },
    ]);

    const result = parseAgentResponse(raw, {
      taskType: AgentTaskType.HOMEPAGE_SUMMARY,
      pageContext: basePageContext,
      demoNow: '2026-07-08T20:00',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.envelope.futureSuggestions).toHaveLength(1);
      expect(result.envelope.futureSuggestions?.[0]?.timePoint).toBe('23:59');
    }
  });

  it('schema 非法的项被静默丢弃，不影响其余项', () => {
    const raw = makeRaw([
      { ...validSuggestion, timePoint: 'not-a-time' }, // 非法 timePoint
      { ...validSuggestion }, // 合法
    ]);

    const result = parseAgentResponse(raw, {
      taskType: AgentTaskType.HOMEPAGE_SUMMARY,
      pageContext: basePageContext,
      demoNow: '2026-07-08T10:00',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.envelope.futureSuggestions).toHaveLength(1);
    }
  });

  it('demoNow 缺失时 futureSuggestions 被整体丢弃', () => {
    const raw = makeRaw([validSuggestion]);

    const result = parseAgentResponse(raw, {
      taskType: AgentTaskType.HOMEPAGE_SUMMARY,
      pageContext: basePageContext,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.envelope.futureSuggestions).toBeUndefined();
    }
  });

  it('futureSuggestions 全部不合法时整体丢弃，不影响 summary/actions', () => {
    const raw = JSON.stringify({
      source: 'llm',
      statusColor: 'good',
      summary: '今天状态不错。',
      chartTokens: [],
      actions: [
        {
          id: 'act_1',
          emoji: '💧',
          title: '补水',
          description: '现在喝一杯水',
          aiPromise: '我会记录你的选择并用于本次建议上下文',
        },
      ],
      futureSuggestions: [
        { ...validSuggestion, timePoint: '12:00' }, // 全部 <= demoNow
        {
          ...validSuggestion,
          timePoint: '11:00',
          action: { ...validSuggestion.action, id: 'past2' },
        },
      ],
    });

    const result = parseAgentResponse(raw, {
      taskType: AgentTaskType.HOMEPAGE_SUMMARY,
      pageContext: basePageContext,
      demoNow: '2026-07-08T13:00',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.envelope.futureSuggestions).toBeUndefined();
      expect(result.envelope.actions).toHaveLength(1);
      expect(result.envelope.summary).toBe('今天状态不错。');
    }
  });

  it('非 homepage 任务忽略 futureSuggestions 字段', () => {
    const raw = JSON.stringify({
      source: 'llm',
      statusColor: 'good',
      summary: '数据视图分析。',
      chartTokens: [],
      futureSuggestions: [validSuggestion],
    });

    const result = parseAgentResponse(raw, {
      taskType: AgentTaskType.VIEW_SUMMARY,
      pageContext: { ...basePageContext, page: 'data', tab: 'hrv' },
      demoNow: '2026-07-08T10:00',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.envelope.futureSuggestions).toBeUndefined();
    }
  });
});
