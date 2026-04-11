import { describe, it, expect } from 'vitest';
import { selectWindowByTask } from '../../context/window-selector';
import { AgentTaskType } from '@health-advisor/shared';

describe('selectWindowByTask', () => {
  it('returns 14-day range for homepage_summary', () => {
    const range = selectWindowByTask(AgentTaskType.HOMEPAGE_SUMMARY, '2026-04-10');
    expect(range.end).toBe('2026-04-10');
    expect(range.start).toBe('2026-03-28');
  });

  it('returns 14-day range for advisor_chat', () => {
    const range = selectWindowByTask(AgentTaskType.ADVISOR_CHAT, '2026-04-10');
    expect(range.end).toBe('2026-04-10');
    expect(range.start).toBe('2026-03-28');
  });

  it('uses provided timeframe for view_summary', () => {
    const range = selectWindowByTask(AgentTaskType.VIEW_SUMMARY, '2026-04-10', 'week');
    expect(range.end).toBe('2026-04-10');
    expect(range.start).toBe('2026-04-04');
  });

  it('uses month timeframe for view_summary', () => {
    const range = selectWindowByTask(AgentTaskType.VIEW_SUMMARY, '2026-04-10', 'month');
    expect(range.end).toBe('2026-04-10');
    expect(range.start).toBe('2026-03-12');
  });

  it('returns 5-day range for micro_insight', () => {
    const range = selectWindowByTask('micro_insight', '2026-04-10');
    expect(range.end).toBe('2026-04-10');
    expect(range.start).toBe('2026-04-06');
  });

  it('uses customDateRange for custom timeframe', () => {
    const custom = { start: '2026-03-01', end: '2026-03-15' };
    const range = selectWindowByTask(
      AgentTaskType.VIEW_SUMMARY,
      '2026-04-10',
      'custom',
      custom,
    );
    expect(range).toEqual(custom);
  });

  it('defaults to week when no timeframe for view_summary', () => {
    const range = selectWindowByTask(AgentTaskType.VIEW_SUMMARY, '2026-04-10');
    expect(range.end).toBe('2026-04-10');
    expect(range.start).toBe('2026-04-04');
  });
});
