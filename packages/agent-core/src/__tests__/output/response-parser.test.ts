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

  it('microTips 数组被截断到 MAX_MICRO_TIPS', () => {
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
      expect(result.envelope.microTips.length).toBeLessThanOrEqual(3);
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
        { id: 'a1', emoji: '💪', title: '去运动', description: '适当运动有助于恢复', aiPromise: '我会记录你的选择并用于本次建议上下文' },
        { id: 'a2', emoji: '😴', title: '去休息', description: '充足睡眠有助于恢复', aiPromise: '我会记录你的选择并用于本次建议上下文' },
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
});
