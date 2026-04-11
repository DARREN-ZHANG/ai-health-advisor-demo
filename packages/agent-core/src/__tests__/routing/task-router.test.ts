import { describe, it, expect } from 'vitest';
import { resolveTaskRoute, TASK_ROUTES } from '../../routing/task-router';
import { AgentTaskType } from '@health-advisor/shared';

describe('TASK_ROUTES', () => {
  it('defines routes for all internal task types', () => {
    const expectedTypes = [
      AgentTaskType.HOMEPAGE_SUMMARY,
      AgentTaskType.VIEW_SUMMARY,
      AgentTaskType.ADVISOR_CHAT,
      'micro_insight',
    ] as const;
    expectedTypes.forEach((t) => {
      expect(TASK_ROUTES[t]).toBeDefined();
      expect(TASK_ROUTES[t].taskType).toBe(t);
    });
  });

  it('homepage_summary does not require userMessage', () => {
    const route = TASK_ROUTES[AgentTaskType.HOMEPAGE_SUMMARY];
    expect(route.requiresUserMessage).toBe(false);
    expect(route.windowDays).toBe(14);
    expect(route.maxSummaryLength).toBe(120);
  });

  it('view_summary requires tab and timeframe', () => {
    const route = TASK_ROUTES[AgentTaskType.VIEW_SUMMARY];
    expect(route.requiresTab).toBe(true);
    expect(route.requiresTimeframe).toBe(true);
    expect(route.windowDays).toBe(0);
  });

  it('advisor_chat requires userMessage', () => {
    const route = TASK_ROUTES[AgentTaskType.ADVISOR_CHAT];
    expect(route.requiresUserMessage).toBe(true);
    expect(route.windowDays).toBe(14);
  });

  it('micro_insight has short window', () => {
    expect(TASK_ROUTES.micro_insight.windowDays).toBe(5);
    expect(TASK_ROUTES.micro_insight.maxSummaryLength).toBe(60);
  });
});

describe('resolveTaskRoute', () => {
  it('returns route for known task type', () => {
    const route = resolveTaskRoute(AgentTaskType.HOMEPAGE_SUMMARY);
    expect(route.taskType).toBe(AgentTaskType.HOMEPAGE_SUMMARY);
  });

  it('throws for unknown task type', () => {
    expect(() => resolveTaskRoute('unknown' as never)).toThrow('Unknown task type');
  });
});
