import { describe, it, expect } from 'vitest';
import { validateTaskRequest } from '../../routing/task-validator';
import type { AgentRequest } from '../../types/agent-request';
import { AgentTaskType } from '@health-advisor/shared';

function makeRequest(overrides: Partial<AgentRequest> = {}): AgentRequest {
  return {
    requestId: 'req-1',
    sessionId: 'sess-1',
    profileId: 'profile-a',
    taskType: AgentTaskType.HOMEPAGE_SUMMARY,
    pageContext: {
      profileId: 'profile-a',
      page: 'home',
      timeframe: 'week',
    },
    ...overrides,
  };
}

describe('validateTaskRequest', () => {
  it('accepts valid homepage_summary request', () => {
    const result = validateTaskRequest(makeRequest());
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('accepts valid view_summary request with tab and timeframe', () => {
    const result = validateTaskRequest(
      makeRequest({
        taskType: AgentTaskType.VIEW_SUMMARY,
        tab: 'hrv',
        timeframe: 'week',
      }),
    );
    expect(result.valid).toBe(true);
  });

  it('accepts valid advisor_chat request with userMessage', () => {
    const result = validateTaskRequest(
      makeRequest({
        taskType: AgentTaskType.ADVISOR_CHAT,
        userMessage: '最近感觉不太好',
      }),
    );
    expect(result.valid).toBe(true);
  });

  it('rejects advisor_chat without userMessage', () => {
    const result = validateTaskRequest(
      makeRequest({ taskType: AgentTaskType.ADVISOR_CHAT }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Task 'advisor_chat' requires userMessage");
  });

  it('rejects view_summary without tab', () => {
    const result = validateTaskRequest(
      makeRequest({ taskType: AgentTaskType.VIEW_SUMMARY, timeframe: 'week' }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Task 'view_summary' requires tab");
  });

  it('rejects view_summary without timeframe', () => {
    const result = validateTaskRequest(
      makeRequest({ taskType: AgentTaskType.VIEW_SUMMARY, tab: 'hrv' }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Task 'view_summary' requires timeframe");
  });

  it('collects multiple errors', () => {
    const result = validateTaskRequest(
      makeRequest({ taskType: AgentTaskType.VIEW_SUMMARY }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(2);
  });
});
