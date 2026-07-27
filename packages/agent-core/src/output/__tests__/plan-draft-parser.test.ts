import { describe, expect, it } from 'vitest';
import { parseAgentResponse } from '../response-parser';
import { cleanPlanDraftSafety } from '../plan-draft-cleaner';
import { AgentTaskType } from '@health-advisor/shared';
import type { PlanDraftInput } from '@health-advisor/shared';

const basePageContext = {
  profileId: 'profile-a',
  page: 'homepage',
  timeframe: 'week' as const,
};

const validDraft: PlanDraftInput = {
  title: '7 天恢复计划',
  summary: '本周以稳定 HRV 与改善睡眠为主。',
  groups: [
    {
      title: '第 1 天',
      tasks: [
        { title: '餐后散步 15 分钟', estimatedMinutes: 15 },
        { title: '记录晨起 HRV' },
      ],
    },
  ],
};

function makeEnvelopeJson(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    summary: '已为你准备好 7 天计划，预览如下。',
    source: 'llm',
    statusColor: 'good',
    chartTokens: [],
    meta: {
      taskType: 'advisor_chat',
      pageContext: basePageContext,
      finishReason: 'complete',
    },
    ...overrides,
  });
}

describe('parseAgentResponse planDraft handling', () => {
  it('accepts valid planDraft in ADVISOR_CHAT', () => {
    const result = parseAgentResponse(
      makeEnvelopeJson({ planDraft: validDraft }),
      {
        taskType: AgentTaskType.ADVISOR_CHAT,
        pageContext: basePageContext,
      },
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.envelope.planDraftPreview).toEqual(validDraft);
    }
  });

  it('omits planDraft when LLM does not emit the field', () => {
    const result = parseAgentResponse(makeEnvelopeJson(), {
      taskType: AgentTaskType.ADVISOR_CHAT,
      pageContext: basePageContext,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.envelope.planDraftPreview).toBeUndefined();
    }
  });

  it('rejects invalid planDraft (empty groups) as a full parse failure', () => {
    const badDraft = { ...validDraft, groups: [] };
    const result = parseAgentResponse(makeEnvelopeJson({ planDraft: badDraft }), {
      taskType: AgentTaskType.ADVISOR_CHAT,
      pageContext: basePageContext,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/planDraft/);
    }
  });

  it('rejects oversized planDraft (group with 21 tasks)', () => {
    const badDraft = {
      ...validDraft,
      groups: [
        {
          title: '第 1 天',
          tasks: Array.from({ length: 21 }, (_, i) => ({ title: `任务 ${i + 1}` })),
        },
      ],
    };
    const result = parseAgentResponse(makeEnvelopeJson({ planDraft: badDraft }), {
      taskType: AgentTaskType.ADVISOR_CHAT,
      pageContext: basePageContext,
    });
    expect(result.success).toBe(false);
  });

  it('ignores planDraft on HOMEPAGE_SUMMARY (non-ADVISOR_CHAT tasks)', () => {
    const result = parseAgentResponse(
      makeEnvelopeJson({ planDraft: validDraft }),
      {
        taskType: AgentTaskType.HOMEPAGE_SUMMARY,
        pageContext: basePageContext,
      },
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.envelope.planDraftPreview).toBeUndefined();
    }
  });
});

describe('cleanPlanDraftSafety', () => {
  it('returns the input untouched when nothing matches safety patterns', () => {
    const result = cleanPlanDraftSafety(validDraft, []);
    expect(result.touched).toBe(false);
    expect(result.cleaned).toEqual(validDraft);
  });

  it('rewrites diagnosis-style language across title, summary and task text', () => {
    const dirty: PlanDraftInput = {
      title: '7 天计划',
      summary: '若确诊为高血压请先咨询医生。',
      groups: [
        {
          title: '第 1 天',
          tasks: [
            { title: '监测心率', description: '若患有不适请停止' },
          ],
        },
      ],
    };
    const result = cleanPlanDraftSafety(dirty, []);
    expect(result.touched).toBe(true);
    expect(result.cleaned.summary).toContain('检测到');
    expect(result.cleaned.groups[0].tasks[0].description).toContain('检测到');
  });

  it('strips hallucinated numbers tied to missing metrics', () => {
    const dirty: PlanDraftInput = {
      title: '计划',
      summary: '当前心率 90 bpm 偏高。',
      groups: [
        {
          title: '第 1 天',
          tasks: [{ title: '注意心率', description: '心率 120 bpm 时停止' }],
        },
      ],
    };
    const result = cleanPlanDraftSafety(dirty, ['hr']);
    expect(result.touched).toBe(true);
    expect(result.cleaned.summary).not.toContain('90 bpm');
    expect(result.cleaned.groups[0].tasks[0].description).not.toContain('120 bpm');
  });
});
