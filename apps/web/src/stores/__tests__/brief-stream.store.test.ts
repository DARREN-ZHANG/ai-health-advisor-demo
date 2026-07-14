import { describe, it, expect, beforeEach } from 'vitest';
import { useBriefStreamStore } from '../brief-stream.store';

describe('brief-stream store 结构 draft', () => {
  beforeEach(() => {
    useBriefStreamStore.setState({ entries: {} });
  });

  it('begin 初始化空 draftActions / forecastStarted / draftFutureSuggestions', () => {
    useBriefStreamStore.getState().begin('p1', 'r1');
    const entry = useBriefStreamStore.getState().getEntry('p1');
    expect(entry?.draftActions).toEqual([]);
    expect(entry?.forecastStarted).toBe(false);
    expect(entry?.draftFutureSuggestions).toEqual([]);
  });

  it('appendAction 按 index 放置（乱序到达也正确）', () => {
    const s = useBriefStreamStore.getState();
    s.begin('p1', 'r1');
    s.appendAction('p1', 'r1', 1, { id: 'a2' } as never);
    s.appendAction('p1', 'r1', 0, { id: 'a1' } as never);
    const entry = useBriefStreamStore.getState().getEntry('p1');
    expect(entry?.draftActions.map((a) => a.id)).toEqual(['a1', 'a2']);
  });

  it('markForecastStarted 幂等', () => {
    const s = useBriefStreamStore.getState();
    s.begin('p1', 'r1');
    s.markForecastStarted('p1', 'r1');
    s.markForecastStarted('p1', 'r1');
    expect(useBriefStreamStore.getState().getEntry('p1')?.forecastStarted).toBe(true);
  });

  it('appendFutureSuggestion 按 index 放置', () => {
    const s = useBriefStreamStore.getState();
    s.begin('p1', 'r1');
    s.appendFutureSuggestion('p1', 'r1', 0, { timePoint: '15:30' } as never);
    expect(useBriefStreamStore.getState().getEntry('p1')?.draftFutureSuggestions.length).toBe(1);
  });

  it('stale requestId 被拒绝', () => {
    const s = useBriefStreamStore.getState();
    s.begin('p1', 'r1');
    s.appendAction('p1', 'stale', 0, { id: 'x' } as never);
    expect(useBriefStreamStore.getState().getEntry('p1')?.draftActions).toEqual([]);
  });

  it('complete 清理整个 entry', () => {
    const s = useBriefStreamStore.getState();
    s.begin('p1', 'r1');
    s.appendAction('p1', 'r1', 0, { id: 'a1' } as never);
    s.complete('p1', 'r1');
    expect(useBriefStreamStore.getState().getEntry('p1')).toBeUndefined();
  });
});
