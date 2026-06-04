import { describe, expect, it } from 'vitest';
import { InMemoryAnalyticalMemoryStore } from '../../memory/analytical-memory-store';
import type { RecentRecommendedAction } from '../../types/memory';

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

  describe('setHomepageActions', () => {
    it('appends actions to empty list', () => {
      const store = new InMemoryAnalyticalMemoryStore();
      const actions: RecentRecommendedAction[] = [
        { category: 'movement_reset', microEventType: 'micro_short_walk', title: '短距离步行', timestamp: 1000 },
      ];
      store.setHomepageActions('s1', 'p1', actions);
      const memory = store.get('s1');
      expect(memory?.latestHomepageActions).toEqual(actions);
    });

    it('appends actions to existing list', () => {
      const store = new InMemoryAnalyticalMemoryStore();
      store.setHomepageActions('s1', 'p1', [
        { category: 'hydration', title: '补水', timestamp: 1000 },
      ]);
      store.setHomepageActions('s1', 'p1', [
        { category: 'movement_reset', title: '步行', timestamp: 2000 },
      ]);
      const memory = store.get('s1');
      expect(memory?.latestHomepageActions).toHaveLength(2);
      expect(memory?.latestHomepageActions?.[0]?.category).toBe('hydration');
      expect(memory?.latestHomepageActions?.[1]?.category).toBe('movement_reset');
    });

    it('caps list at 20 items (FIFO)', () => {
      const store = new InMemoryAnalyticalMemoryStore();
      // 插入 25 条
      for (let i = 0; i < 25; i++) {
        store.setHomepageActions('s1', 'p1', [
          { category: 'hydration', title: `补水 ${i}`, timestamp: i },
        ]);
      }
      const memory = store.get('s1');
      expect(memory?.latestHomepageActions).toHaveLength(20);
      // 最旧的 5 条被淘汰，保留 index 5-24
      expect(memory?.latestHomepageActions?.[0]?.title).toBe('补水 5');
    });

    it('clears latestHomepageActions on invalidateOnOverride', () => {
      const store = new InMemoryAnalyticalMemoryStore();
      store.setHomepageBrief('s1', 'p1', 'test brief');
      store.setHomepageActions('s1', 'p1', [
        { category: 'hydration', title: '补水', timestamp: 1000 },
      ]);
      store.invalidateOnOverride('s1');
      const memory = store.get('s1');
      expect(memory?.latestHomepageActions).toBeUndefined();
      // latestHomepageBrief 应保留（override 不清除 brief）
      expect(memory?.latestHomepageBrief).toBe('test brief');
    });

    it('clears latestHomepageActions on invalidateOnProfileSwitch', () => {
      const store = new InMemoryAnalyticalMemoryStore();
      store.setHomepageActions('s1', 'p1', [
        { category: 'hydration', title: '补水', timestamp: 1000 },
      ]);
      store.invalidateOnProfileSwitch('s1');
      expect(store.get('s1')).toBeUndefined();
    });
  });
});
