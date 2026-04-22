import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { createOverrideStore } from '../../runtime/override-store';
import type { OverrideEntry, DatedEvent } from '@health-advisor/sandbox';

// vitest 从 apps/agent-api 运行，需要回溯到 monorepo 根
const DATA_DIR = path.resolve(process.cwd(), '../../data/sandbox');

// ============================================================
// 现有能力测试（向后兼容）
// ============================================================

describe('OverrideStore — 现有能力', () => {
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

// ============================================================
// Timeline Sync 新能力测试
// ============================================================

const INITIAL_TIME = '2026-04-21T08:00';

describe('OverrideStore — Timeline Sync', () => {
  // — Demo Clock —
  it('getDemoClock 返回初始时钟', () => {
    const store = createOverrideStore('profile-a', { initialDemoTime: INITIAL_TIME });
    const clock = store.getDemoClock('profile-a');
    expect(clock.profileId).toBe('profile-a');
    expect(clock.currentTime).toBe(INITIAL_TIME);
    expect(clock.timezone).toBe('Asia/Shanghai');
  });

  it('getDemoClock 返回不可变副本', () => {
    const store = createOverrideStore('profile-a', { initialDemoTime: INITIAL_TIME });
    const a = store.getDemoClock('profile-a');
    const b = store.getDemoClock('profile-a');
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });

  it('advanceClock 推进时间', () => {
    const store = createOverrideStore('profile-a', { initialDemoTime: INITIAL_TIME });
    store.advanceClock('profile-a', 30);
    const clock = store.getDemoClock('profile-a');
    expect(clock.currentTime).toBe('2026-04-21T08:30');
  });

  it('advanceClock 多次推进累积', () => {
    const store = createOverrideStore('profile-a', { initialDemoTime: INITIAL_TIME });
    store.advanceClock('profile-a', 15);
    store.advanceClock('profile-a', 45);
    expect(store.getDemoClock('profile-a').currentTime).toBe('2026-04-21T09:00');
  });

  // — Segments —
  it('getSegments 初始为空', () => {
    const store = createOverrideStore('profile-a', { initialDemoTime: INITIAL_TIME });
    expect(store.getSegments('profile-a')).toEqual([]);
  });

  // — Append Segment —
  it('appendSegment 创建事件并推进时间', () => {
    const store = createOverrideStore('profile-a', { initialDemoTime: INITIAL_TIME });
    const result = store.appendSegment('profile-a', 'meal_intake');

    // meal_intake 默认持续 20 分钟（文档 §8.3）
    expect(result.newCurrentTime).toBe('2026-04-21T08:20');
    expect(result.events.length).toBeGreaterThan(0);
    expect(store.getDemoClock('profile-a').currentTime).toBe('2026-04-21T08:20');

    // 片段列表有新片段
    const segments = store.getSegments('profile-a');
    expect(segments).toHaveLength(1);
    expect(segments[0]!.type).toBe('meal_intake');
  });

  it('appendSegment 带自定义参数', () => {
    const store = createOverrideStore('profile-a', { initialDemoTime: INITIAL_TIME });
    const result = store.appendSegment('profile-a', 'steady_cardio', undefined, undefined, {
      durationMinutes: 45,
    });

    expect(result.newCurrentTime).toBe('2026-04-21T08:45');
  });

  it('appendSegment 带偏移量', () => {
    const store = createOverrideStore('profile-a', { initialDemoTime: INITIAL_TIME });
    const result = store.appendSegment('profile-a', 'walk', undefined, 10);

    // walk 从 08:10 开始，默认 30 分钟（文档 §8.3），结束于 08:40
    expect(result.newCurrentTime).toBe('2026-04-21T08:40');
  });

  // — Profile 隔离 —
  it('不同 profile 的时间轴互相隔离', () => {
    const store = createOverrideStore('profile-a', { initialDemoTime: INITIAL_TIME });
    store.appendSegment('profile-a', 'meal_intake');
    store.appendSegment('profile-b', 'walk');

    // profile-a 有 meal_intake
    expect(store.getSegments('profile-a')).toHaveLength(1);
    expect(store.getSegments('profile-a')[0]!.type).toBe('meal_intake');

    // profile-b 有 walk
    expect(store.getSegments('profile-b')).toHaveLength(1);
    expect(store.getSegments('profile-b')[0]!.type).toBe('walk');

    // 时钟各自独立
    expect(store.getDemoClock('profile-a').currentTime).not.toBe(
      store.getDemoClock('profile-b').currentTime,
    );
  });

  // — Sync 操作 —
  it('getSyncState 初始无同步记录', () => {
    const store = createOverrideStore('profile-a', { initialDemoTime: INITIAL_TIME });
    const syncState = store.getSyncState('profile-a');
    expect(syncState.lastSyncedMeasuredAt).toBeNull();
    expect(syncState.syncSessions).toHaveLength(0);
  });

  it('getPendingEvents 初始为空', () => {
    const store = createOverrideStore('profile-a', { initialDemoTime: INITIAL_TIME });
    expect(store.getPendingEvents('profile-a')).toEqual([]);
  });

  it('getSyncedEvents 初始为空', () => {
    const store = createOverrideStore('profile-a', { initialDemoTime: INITIAL_TIME });
    expect(store.getSyncedEvents('profile-a')).toEqual([]);
  });

  it('appendSegment 后 pending 事件正确', () => {
    const store = createOverrideStore('profile-a', { initialDemoTime: INITIAL_TIME });
    store.appendSegment('profile-a', 'meal_intake');
    const pending = store.getPendingEvents('profile-a');
    expect(pending.length).toBeGreaterThan(0);
    // 未同步时 synced 为空
    expect(store.getSyncedEvents('profile-a')).toEqual([]);
  });

  it('performSync 创建同步会话并更新水位线', () => {
    const store = createOverrideStore('profile-a', { initialDemoTime: INITIAL_TIME });
    store.appendSegment('profile-a', 'meal_intake');

    const session = store.performSync('profile-a', 'app_open');

    // 验证 session 基本结构
    expect(session.profileId).toBe('profile-a');
    expect(session.trigger).toBe('app_open');
    expect(session.syncId).toBeTruthy();

    // 水位线更新为当前时间
    const syncState = store.getSyncState('profile-a');
    expect(syncState.lastSyncedMeasuredAt).toBe(store.getDemoClock('profile-a').currentTime);
    expect(syncState.syncSessions).toHaveLength(1);

    // synced 事件有值，pending 为空
    expect(store.getSyncedEvents('profile-a').length).toBeGreaterThan(0);
    expect(store.getPendingEvents('profile-a')).toEqual([]);
  });

  it('performSync 手动刷新也正常工作', () => {
    const store = createOverrideStore('profile-a', { initialDemoTime: INITIAL_TIME });
    store.appendSegment('profile-a', 'walk');
    const session = store.performSync('profile-a', 'manual_refresh');
    expect(session.trigger).toBe('manual_refresh');
  });

  it('多次同步：追加后同步，再追加再同步', () => {
    const store = createOverrideStore('profile-a', { initialDemoTime: INITIAL_TIME });

    // 第一次追加 + 同步
    store.appendSegment('profile-a', 'meal_intake');
    store.performSync('profile-a', 'app_open');

    // 第二次追加 + 同步
    store.appendSegment('profile-a', 'walk');
    const session2 = store.performSync('profile-a', 'manual_refresh');

    expect(session2.trigger).toBe('manual_refresh');

    const syncState = store.getSyncState('profile-a');
    expect(syncState.syncSessions).toHaveLength(2);
    expect(store.getPendingEvents('profile-a')).toEqual([]);
  });

  // — Reset Timeline —
  it('resetProfileTimeline 恢复初始状态', () => {
    const store = createOverrideStore('profile-a', { initialDemoTime: INITIAL_TIME });

    store.appendSegment('profile-a', 'meal_intake');
    store.performSync('profile-a', 'app_open');

    // 重置时间轴
    store.resetProfileTimeline('profile-a');

    // 时钟回到初始值
    expect(store.getDemoClock('profile-a').currentTime).toBe(INITIAL_TIME);
    // 片段清空
    expect(store.getSegments('profile-a')).toEqual([]);
    // 同步状态清空
    expect(store.getSyncState('profile-a').syncSessions).toHaveLength(0);
    expect(store.getSyncState('profile-a').lastSyncedMeasuredAt).toBeNull();
    // 事件清空
    expect(store.getPendingEvents('profile-a')).toEqual([]);
  });

  it('resetProfileTimeline 不影响 override 和 injectedEvents', () => {
    const store = createOverrideStore('profile-a', { initialDemoTime: INITIAL_TIME });

    store.addOverride('profile-a', { metric: 'hrv', value: 15 });
    store.injectEvent('profile-a', { date: '2026-04-10', type: 'illness', data: {} });
    store.appendSegment('profile-a', 'meal_intake');

    store.resetProfileTimeline('profile-a');

    // override 和 injectedEvents 不受影响
    expect(store.getActiveOverrides('profile-a')).toHaveLength(1);
    expect(store.getInjectedEvents('profile-a')).toHaveLength(1);
    // 时间轴已重置
    expect(store.getSegments('profile-a')).toEqual([]);
  });

  it('reset("all") 同时清除 demo 状态', () => {
    const store = createOverrideStore('profile-a', { initialDemoTime: INITIAL_TIME });
    store.appendSegment('profile-a', 'meal_intake');
    store.advanceClock('profile-a', 30);
    store.reset('all');

    // demo 状态被清除，下次访问会重建为初始值
    expect(store.getDemoClock('profile-a').currentTime).toBe(INITIAL_TIME);
    expect(store.getSegments('profile-a')).toEqual([]);
  });
});

// ============================================================
// 带 dataDir 的初始化测试：从 timeline script 加载初始状态
// ============================================================

describe('OverrideStore — dataDir 初始化', () => {
  it('从 timeline script 加载 profile-a 初始时钟', () => {
    const store = createOverrideStore('profile-a', { dataDir: DATA_DIR });
    const clock = store.getDemoClock('profile-a');
    // profile-a-day-1.json 定义 initialDemoTime = 2026-04-16T07:05
    expect(clock.currentTime).toBe('2026-04-16T07:05');
    expect(clock.profileId).toBe('profile-a');
    expect(clock.timezone).toBe('Asia/Shanghai');
  });

  it('从 timeline script 加载 baseline segments', () => {
    const store = createOverrideStore('profile-a', { dataDir: DATA_DIR });
    const segments = store.getSegments('profile-a');
    // profile-a-day-1.json 有 1 个 baseline sleep segment
    expect(segments.length).toBe(1);
    expect(segments[0]!.type).toBe('sleep');
    expect(segments[0]!.segmentId).toBe('seg-baseline-sleep-a');
  });

  it('从 baseline segments 生成初始 raw events', () => {
    const store = createOverrideStore('profile-a', { dataDir: DATA_DIR });
    // baseline sleep segment 应该生成了设备事件（wearState, sleepStage, heartRate, spo2 等）
    const pending = store.getPendingEvents('profile-a');
    expect(pending.length).toBeGreaterThan(0);
    // 应包含睡眠阶段事件（metric 字段，不是 type）
    expect(pending.some((e) => e.metric === 'sleepStage')).toBe(true);
  });

  it('初始同步状态：尚未同步', () => {
    const store = createOverrideStore('profile-a', { dataDir: DATA_DIR });
    const syncState = store.getSyncState('profile-a');
    expect(syncState.lastSyncedMeasuredAt).toBeNull();
    expect(syncState.syncSessions).toHaveLength(0);
  });

  it('初始 synced 事件为空（尚未同步）', () => {
    const store = createOverrideStore('profile-a', { dataDir: DATA_DIR });
    expect(store.getSyncedEvents('profile-a')).toEqual([]);
  });

  it('performSync 同步昨夜睡眠后 synced 事件有值', () => {
    const store = createOverrideStore('profile-a', { dataDir: DATA_DIR });

    // 首次 app_open 同步
    const session = store.performSync('profile-a', 'app_open');

    expect(session.trigger).toBe('app_open');
    expect(session.syncId).toBeTruthy();

    // 同步后 synced 事件有值（昨夜睡眠）
    const synced = store.getSyncedEvents('profile-a');
    expect(synced.length).toBeGreaterThan(0);

    // pending 清空
    expect(store.getPendingEvents('profile-a')).toEqual([]);

    // 水位线更新
    const syncState = store.getSyncState('profile-a');
    expect(syncState.lastSyncedMeasuredAt).toBeTruthy();
  });

  it('同步后追加新片段，pending 包含新事件', () => {
    const store = createOverrideStore('profile-a', { dataDir: DATA_DIR });

    // 首次同步
    store.performSync('profile-a', 'app_open');

    // 追加早餐
    store.appendSegment('profile-a', 'meal_intake');

    // pending 应只有早餐事件
    const pending = store.getPendingEvents('profile-a');
    expect(pending.length).toBeGreaterThan(0);

    // synced 仍然是昨夜睡眠
    const synced = store.getSyncedEvents('profile-a');
    expect(synced.length).toBeGreaterThan(0);
  });

  it('resetProfileTimeline 恢复带 baseline 的初始状态', () => {
    const store = createOverrideStore('profile-a', { dataDir: DATA_DIR });

    // 操作：追加 + 同步
    store.appendSegment('profile-a', 'meal_intake');
    store.performSync('profile-a', 'app_open');

    // 重置
    store.resetProfileTimeline('profile-a');

    // 时钟回到 timeline script 定义的时刻
    expect(store.getDemoClock('profile-a').currentTime).toBe('2026-04-16T07:05');
    // segments 恢复为 baseline
    const segments = store.getSegments('profile-a');
    expect(segments.length).toBe(1);
    expect(segments[0]!.type).toBe('sleep');
    // 同步状态重置
    expect(store.getSyncState('profile-a').lastSyncedMeasuredAt).toBeNull();
    // raw events 重新生成（pending 有值）
    expect(store.getPendingEvents('profile-a').length).toBeGreaterThan(0);
    // synced 为空
    expect(store.getSyncedEvents('profile-a')).toEqual([]);
  });

  it('不同 profile 从各自的 timeline script 初始化', () => {
    const store = createOverrideStore('profile-a', { dataDir: DATA_DIR });

    // profile-a: initialDemoTime = 2026-04-16T07:05
    expect(store.getDemoClock('profile-a').currentTime).toBe('2026-04-16T07:05');

    // profile-b: initialDemoTime = 2026-04-16T07:30
    expect(store.getDemoClock('profile-b').currentTime).toBe('2026-04-16T07:30');

    // profile-c: initialDemoTime = 2026-04-16T06:45
    expect(store.getDemoClock('profile-c').currentTime).toBe('2026-04-16T06:45');

    // 各有 1 个 baseline sleep segment
    expect(store.getSegments('profile-a')).toHaveLength(1);
    expect(store.getSegments('profile-b')).toHaveLength(1);
    expect(store.getSegments('profile-c')).toHaveLength(1);
  });
});
