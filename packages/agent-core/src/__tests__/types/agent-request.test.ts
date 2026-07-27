import { describe, it, expect } from 'vitest';
import { AgentRequestSchema } from '../../types/agent-request';
import { AgentTaskType } from '@health-advisor/shared';

const validBase = {
  requestId: 'req-1',
  sessionId: 'sess-1',
  profileId: 'profile-a',
  taskType: AgentTaskType.ADVISOR_CHAT,
  pageContext: {
    profileId: 'profile-a',
    page: 'homepage',
    timeframe: 'week',
  },
  userMessage: '在首页展示睡眠趋势简报',
};

describe('AgentRequestSchema — uiContext', () => {
  it('accepts homepageTrendCard sleep/activity/hidden', () => {
    for (const display of ['hidden', 'sleep', 'activity'] as const) {
      const result = AgentRequestSchema.safeParse({
        ...validBase,
        uiContext: { homepageTrendCard: display },
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.uiContext).toStrictEqual({
          homepageTrendCard: display,
        });
      }
    }
  });

  it('treats uiContext as optional for legacy clients', () => {
    const result = AgentRequestSchema.safeParse(validBase);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.uiContext).toBeUndefined();
    }
  });

  it('rejects overview display', () => {
    const result = AgentRequestSchema.safeParse({
      ...validBase,
      uiContext: { homepageTrendCard: 'overview' },
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty string display', () => {
    const result = AgentRequestSchema.safeParse({
      ...validBase,
      uiContext: { homepageTrendCard: '' },
    });
    expect(result.success).toBe(false);
  });

  it('rejects extra fields on uiContext (strict contract)', () => {
    const result = AgentRequestSchema.safeParse({
      ...validBase,
      uiContext: {
        homepageTrendCard: 'sleep',
        visible: true,
      },
    });
    expect(result.success).toBe(false);
  });

  it('rejects uiContext without homepageTrendCard', () => {
    const result = AgentRequestSchema.safeParse({
      ...validBase,
      uiContext: {},
    });
    expect(result.success).toBe(false);
  });
});
