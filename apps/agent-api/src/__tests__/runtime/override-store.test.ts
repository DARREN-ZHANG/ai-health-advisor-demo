import { describe, it, expect } from 'vitest';
import { createOverrideStore } from '../../runtime/override-store';
import type { OverrideEntry, DatedEvent } from '@health-advisor/sandbox';

describe('OverrideStore', () => {
  it('默认 profileId 为传入值', () => {
    const store = createOverrideStore('profile-a');
    expect(store.getCurrentProfileId()).toBe('profile-a');
  });

  it('switchProfile 更新当前 profile', () => {
    const store = createOverrideStore('profile-a');
    store.switchProfile('profile-c');
    expect(store.getCurrentProfileId()).toBe('profile-c');
  });

  it('addOverride + getActiveOverrides', () => {
    const store = createOverrideStore('profile-a');
    const entry: OverrideEntry = { metric: 'hrv', value: 15 };
    store.addOverride('profile-a', entry);
    const overrides = store.getActiveOverrides('profile-a');
    expect(overrides).toHaveLength(1);
    expect(overrides[0]!.metric).toBe('hrv');
  });

  it('getActiveOverrides 返回新数组（不可变）', () => {
    const store = createOverrideStore('profile-a');
    store.addOverride('profile-a', { metric: 'hrv', value: 15 });
    const a = store.getActiveOverrides('profile-a');
    const b = store.getActiveOverrides('profile-a');
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });

  it('injectEvent + getInjectedEvents', () => {
    const store = createOverrideStore('profile-a');
    const event: DatedEvent = { date: '2026-04-10', type: 'illness', data: {} };
    store.injectEvent('profile-a', event);
    const events = store.getInjectedEvents('profile-a');
    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe('illness');
  });

  it('不同 profile 的 override 隔离', () => {
    const store = createOverrideStore('profile-a');
    store.addOverride('profile-a', { metric: 'hrv', value: 15 });
    store.addOverride('profile-c', { metric: 'spo2', value: 90 });
    expect(store.getActiveOverrides('profile-a')).toHaveLength(1);
    expect(store.getActiveOverrides('profile-c')).toHaveLength(1);
    expect(store.getActiveOverrides('profile-b')).toHaveLength(0);
  });

  it('reset("all") 清空所有状态', () => {
    const store = createOverrideStore('profile-a');
    store.switchProfile('profile-c');
    store.addOverride('profile-a', { metric: 'hrv', value: 15 });
    store.injectEvent('profile-a', { date: '2026-04-10', type: 'illness', data: {} });
    store.reset('all');
    expect(store.getCurrentProfileId()).toBe('profile-a');
    expect(store.getActiveOverrides('profile-a')).toHaveLength(0);
    expect(store.getInjectedEvents('profile-a')).toHaveLength(0);
  });

  it('reset("profile") 只重置 profileId', () => {
    const store = createOverrideStore('profile-a');
    store.switchProfile('profile-c');
    store.addOverride('profile-a', { metric: 'hrv', value: 15 });
    store.reset('profile');
    expect(store.getCurrentProfileId()).toBe('profile-a');
    expect(store.getActiveOverrides('profile-a')).toHaveLength(1);
  });

  it('reset("overrides") 只清空 overrides', () => {
    const store = createOverrideStore('profile-a');
    store.addOverride('profile-a', { metric: 'hrv', value: 15 });
    store.injectEvent('profile-a', { date: '2026-04-10', type: 'illness', data: {} });
    store.reset('overrides');
    expect(store.getActiveOverrides('profile-a')).toHaveLength(0);
    expect(store.getInjectedEvents('profile-a')).toHaveLength(1);
  });

  it('reset("events") 只清空 events', () => {
    const store = createOverrideStore('profile-a');
    store.addOverride('profile-a', { metric: 'hrv', value: 15 });
    store.injectEvent('profile-a', { date: '2026-04-10', type: 'illness', data: {} });
    store.reset('events');
    expect(store.getActiveOverrides('profile-a')).toHaveLength(1);
    expect(store.getInjectedEvents('profile-a')).toHaveLength(0);
  });
});
