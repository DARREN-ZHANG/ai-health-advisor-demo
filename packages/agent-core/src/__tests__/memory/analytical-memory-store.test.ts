import { describe, it, expect } from 'vitest';
import { InMemoryAnalyticalMemoryStore } from '../../memory/analytical-memory-store';

describe('InMemoryAnalyticalMemoryStore', () => {
  it('returns undefined for non-existent session', () => {
    const store = new InMemoryAnalyticalMemoryStore();
    expect(store.get('sess-1')).toBeUndefined();
    expect(store.getForProfile('sess-1', 'profile-a')).toBeUndefined();
  });

  it('stores homepage brief', () => {
    const store = new InMemoryAnalyticalMemoryStore();
    store.setHomepageBrief('sess-1', 'profile-a', '今日状态良好');
    const memory = store.get('sess-1')!;
    expect(memory.latestHomepageBrief).toBe('今日状态良好');
    expect(memory.profileId).toBe('profile-a');
  });

  it('stores view summary by scope', () => {
    const store = new InMemoryAnalyticalMemoryStore();
    store.setViewSummary('sess-1', 'profile-a', 'hrv:week', 'HRV 趋势稳定');
    store.setViewSummary('sess-1', 'profile-a', 'sleep:month', '睡眠有改善');
    const memory = store.get('sess-1')!;
    expect(memory.latestViewSummaryByScope?.['hrv:week']).toBe('HRV 趋势稳定');
    expect(memory.latestViewSummaryByScope?.['sleep:month']).toBe('睡眠有改善');
  });

  it('stores rule summary', () => {
    const store = new InMemoryAnalyticalMemoryStore();
    store.setRuleSummary('sess-1', 'profile-a', '无异常信号');
    expect(store.get('sess-1')?.latestRuleSummary).toBe('无异常信号');
  });

  it('auto-clears on profile mismatch', () => {
    const store = new InMemoryAnalyticalMemoryStore();
    store.setHomepageBrief('sess-1', 'profile-a', '旧摘要');
    store.setHomepageBrief('sess-1', 'profile-b', '新摘要');
    const memory = store.get('sess-1')!;
    expect(memory.profileId).toBe('profile-b');
    expect(memory.latestHomepageBrief).toBe('新摘要');
  });

  it('getForProfile returns undefined for mismatched profile', () => {
    const store = new InMemoryAnalyticalMemoryStore();
    store.setHomepageBrief('sess-1', 'profile-a', '摘要');
    expect(store.getForProfile('sess-1', 'profile-b')).toBeUndefined();
  });

  it('getForProfile returns memory for matched profile', () => {
    const store = new InMemoryAnalyticalMemoryStore();
    store.setHomepageBrief('sess-1', 'profile-a', '摘要');
    const memory = store.getForProfile('sess-1', 'profile-a');
    expect(memory?.latestHomepageBrief).toBe('摘要');
  });

  it('invalidateOnProfileSwitch deletes all', () => {
    const store = new InMemoryAnalyticalMemoryStore();
    store.setHomepageBrief('sess-1', 'profile-a', '摘要');
    store.setViewSummary('sess-1', 'profile-a', 'hrv:week', '视图总结');
    store.setRuleSummary('sess-1', 'profile-a', '规则总结');
    store.invalidateOnProfileSwitch('sess-1');
    expect(store.get('sess-1')).toBeUndefined();
  });

  it('invalidateOnOverride clears view summaries and rule summary but keeps homepage brief', () => {
    const store = new InMemoryAnalyticalMemoryStore();
    store.setHomepageBrief('sess-1', 'profile-a', '首页摘要');
    store.setViewSummary('sess-1', 'profile-a', 'hrv:week', '视图总结');
    store.setRuleSummary('sess-1', 'profile-a', '规则总结');

    store.invalidateOnOverride('sess-1');

    const memory = store.get('sess-1')!;
    expect(memory.latestHomepageBrief).toBe('首页摘要');
    expect(memory.latestViewSummaryByScope).toBeUndefined();
    expect(memory.latestRuleSummary).toBeUndefined();
  });

  it('invalidateOnOverride on non-existent session does nothing', () => {
    const store = new InMemoryAnalyticalMemoryStore();
    expect(() => store.invalidateOnOverride('sess-unknown')).not.toThrow();
  });

  it('clearAll deletes every analytical memory entry', () => {
    const store = new InMemoryAnalyticalMemoryStore();
    store.setHomepageBrief('sess-1', 'profile-a', '首页摘要');
    store.setHomepageBrief('sess-2', 'profile-b', '第二条摘要');

    store.clearAll();

    expect(store.get('sess-1')).toBeUndefined();
    expect(store.get('sess-2')).toBeUndefined();
  });
});
