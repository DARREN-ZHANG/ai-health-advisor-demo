import { describe, it, expect } from 'vitest';
import type { DeviceEvent } from '@health-advisor/shared';
import {
  createSyncState,
  performSync,
  getPendingEvents,
  getSyncedEvents,
  addEventsToSyncState,
  summarizeSyncSessions,
} from '../../helpers/sync-engine';

// ============================================================
// 测试辅助函数
// ============================================================

/** 创建测试用设备事件 */
function makeEvent(
  overrides: Partial<DeviceEvent> & { eventId: string; measuredAt: string },
): DeviceEvent {
  return {
    profileId: 'test-profile',
    metric: 'heartRate',
    value: 72,
    source: 'sensor',
    segmentId: 'seg-test',
    ...overrides,
  };
}

/** 创建一组时间递增的事件 */
function makeTimedEvents(
  profileId: string,
  timestamps: string[],
): DeviceEvent[] {
  return timestamps.map((ts, index) =>
    makeEvent({
      eventId: `evt-${index}`,
      profileId,
      measuredAt: ts,
    }),
  );
}

// ============================================================
// 测试套件
// ============================================================

describe('sync-engine', () => {
  describe('createSyncState', () => {
    it('应创建初始状态，所有事件都在 pending', () => {
      const events = makeTimedEvents('p1', [
        '2026-04-16T08:00',
        '2026-04-16T08:01',
        '2026-04-16T08:02',
      ]);
      const state = createSyncState('p1', events);

      expect(state.profileId).toBe('p1');
      expect(state.events).toHaveLength(3);
      expect(state.lastSyncedMeasuredAt).toBeNull();
      expect(state.syncSessions).toEqual([]);
      // 所有事件都在 pending
      expect(getPendingEvents(state)).toHaveLength(3);
      expect(getSyncedEvents(state)).toHaveLength(0);
    });

    it('应接受空事件列表', () => {
      const state = createSyncState('p1', []);

      expect(state.events).toHaveLength(0);
      expect(getPendingEvents(state)).toHaveLength(0);
    });
  });

  describe('performSync (app_open)', () => {
    it('应将 pending 事件标记为 synced 并创建会话', () => {
      const events = makeTimedEvents('p1', [
        '2026-04-16T08:00',
        '2026-04-16T08:01',
        '2026-04-16T08:02',
      ]);
      const state = createSyncState('p1', events);

      const { state: newState, session } = performSync(
        state,
        'app_open',
        '2026-04-16T08:03',
      );

      // 会话记录正确
      expect(session.trigger).toBe('app_open');
      expect(session.uploadedEventCount).toBe(3);
      expect(session.uploadedMeasuredRange).toEqual({
        start: '2026-04-16T08:00',
        end: '2026-04-16T08:03',
      });
      expect(session.startedAt).toBe('2026-04-16T08:03');
      expect(session.finishedAt).toBe('2026-04-16T08:03');
      expect(session.profileId).toBe('p1');
      expect(session.syncId).toMatch(/^sync-/);

      // 状态更新
      expect(newState.lastSyncedMeasuredAt).toBe('2026-04-16T08:03');
      expect(getPendingEvents(newState)).toHaveLength(0);
      expect(getSyncedEvents(newState)).toHaveLength(3);

      // 原始状态不可变
      expect(state.lastSyncedMeasuredAt).toBeNull();
    });
  });

  describe('performSync (manual_refresh)', () => {
    it('应与 app_open 行为一致', () => {
      const events = makeTimedEvents('p1', [
        '2026-04-16T09:00',
        '2026-04-16T09:01',
      ]);
      const state = createSyncState('p1', events);

      const { state: newState, session } = performSync(
        state,
        'manual_refresh',
        '2026-04-16T09:02',
      );

      expect(session.trigger).toBe('manual_refresh');
      expect(session.uploadedEventCount).toBe(2);
      expect(getSyncedEvents(newState)).toHaveLength(2);
      expect(getPendingEvents(newState)).toHaveLength(0);
    });
  });

  describe('performSync 无 pending 事件', () => {
    it('应创建 null range 和 0 count 的会话', () => {
      const state = createSyncState('p1', []);
      const { state: newState, session } = performSync(
        state,
        'app_open',
        '2026-04-16T08:00',
      );

      expect(session.uploadedMeasuredRange).toBeNull();
      expect(session.uploadedEventCount).toBe(0);
      expect(newState.lastSyncedMeasuredAt).toBe('2026-04-16T08:00');
    });
  });

  describe('performSync 水位线限制', () => {
    it('应仅同步 measuredAt <= currentTime 的事件', () => {
      const events = makeTimedEvents('p1', [
        '2026-04-16T08:00',
        '2026-04-16T08:01',
        '2026-04-16T08:02',
        '2026-04-16T08:03',
        '2026-04-16T08:04',
      ]);
      const state = createSyncState('p1', events);

      // 仅同步到 08:02，08:03 和 08:04 仍为 pending
      const { state: newState, session } = performSync(
        state,
        'app_open',
        '2026-04-16T08:02',
      );

      expect(session.uploadedEventCount).toBe(3);
      expect(getSyncedEvents(newState)).toHaveLength(3);
      expect(getPendingEvents(newState)).toHaveLength(2);
    });
  });

  describe('getPendingEvents', () => {
    it('应仅返回 pending 事件', () => {
      const events = makeTimedEvents('p1', [
        '2026-04-16T08:00',
        '2026-04-16T08:01',
        '2026-04-16T08:02',
      ]);
      const state = createSyncState('p1', events);

      // 同步前：全部 pending
      expect(getPendingEvents(state)).toHaveLength(3);

      // 同步到 08:01
      const { state: synced } = performSync(state, 'app_open', '2026-04-16T08:01');
      const pending = getPendingEvents(synced);
      expect(pending).toHaveLength(1);
      expect(pending[0]!.measuredAt).toBe('2026-04-16T08:02');
    });
  });

  describe('getSyncedEvents', () => {
    it('应仅返回已同步事件', () => {
      const events = makeTimedEvents('p1', [
        '2026-04-16T08:00',
        '2026-04-16T08:01',
        '2026-04-16T08:02',
      ]);
      const state = createSyncState('p1', events);

      // 同步前：无已同步
      expect(getSyncedEvents(state)).toHaveLength(0);

      // 同步到 08:01
      const { state: synced } = performSync(state, 'app_open', '2026-04-16T08:01');
      const syncedEvents = getSyncedEvents(synced);
      expect(syncedEvents).toHaveLength(2);
      expect(syncedEvents.map((e) => e.measuredAt)).toEqual([
        '2026-04-16T08:00',
        '2026-04-16T08:01',
      ]);
    });
  });

  describe('addEventsToSyncState', () => {
    it('应将新事件添加到现有状态', () => {
      const initial = makeTimedEvents('p1', [
        '2026-04-16T08:00',
        '2026-04-16T08:01',
      ]);
      const state = createSyncState('p1', initial);

      const newEvents = makeTimedEvents('p1', [
        '2026-04-16T08:02',
        '2026-04-16T08:03',
      ]);
      const updated = addEventsToSyncState(state, newEvents);

      expect(updated.events).toHaveLength(4);
      expect(state.events).toHaveLength(2); // 原始状态不可变
      expect(updated.lastSyncedMeasuredAt).toBe(state.lastSyncedMeasuredAt);
    });

    it('新添加的事件应为 pending', () => {
      const initial = makeTimedEvents('p1', ['2026-04-16T08:00']);
      const state = createSyncState('p1', initial);

      // 先同步
      const { state: synced } = performSync(state, 'app_open', '2026-04-16T08:00');

      // 添加新事件
      const newEvents = makeTimedEvents('p1', ['2026-04-16T08:01']);
      const updated = addEventsToSyncState(synced, newEvents);

      expect(getPendingEvents(updated)).toHaveLength(1);
      expect(getSyncedEvents(updated)).toHaveLength(1);
    });
  });

  describe('summarizeSyncSessions', () => {
    it('应返回会话历史', () => {
      const events = makeTimedEvents('p1', [
        '2026-04-16T08:00',
        '2026-04-16T08:01',
      ]);
      const state = createSyncState('p1', events);

      const { state: s1 } = performSync(state, 'app_open', '2026-04-16T08:01');
      const sessions = summarizeSyncSessions(s1);

      expect(sessions).toHaveLength(1);
      expect(sessions[0]!.trigger).toBe('app_open');
    });
  });

  describe('多次同步', () => {
    it('会话应累积，水位线应推进', () => {
      const events = makeTimedEvents('p1', [
        '2026-04-16T08:00',
        '2026-04-16T08:01',
        '2026-04-16T08:02',
        '2026-04-16T08:03',
      ]);
      let state = createSyncState('p1', events);

      // 第一次同步
      const r1 = performSync(state, 'app_open', '2026-04-16T08:01');
      state = r1.state;
      expect(getSyncedEvents(state)).toHaveLength(2);
      expect(getPendingEvents(state)).toHaveLength(2);
      expect(summarizeSyncSessions(state)).toHaveLength(1);

      // 第二次同步
      const r2 = performSync(state, 'manual_refresh', '2026-04-16T08:03');
      state = r2.state;
      expect(getSyncedEvents(state)).toHaveLength(4);
      expect(getPendingEvents(state)).toHaveLength(0);
      expect(summarizeSyncSessions(state)).toHaveLength(2);

      // 会话历史正确
      const sessions = summarizeSyncSessions(state);
      expect(sessions[0]!.trigger).toBe('app_open');
      expect(sessions[0]!.uploadedEventCount).toBe(2);
      expect(sessions[1]!.trigger).toBe('manual_refresh');
      expect(sessions[1]!.uploadedEventCount).toBe(2);
    });
  });

  describe('同步后添加的事件', () => {
    it('应为 pending 直到下次同步', () => {
      const events = makeTimedEvents('p1', [
        '2026-04-16T08:00',
        '2026-04-16T08:01',
      ]);
      const state = createSyncState('p1', events);

      // 同步
      const { state: synced } = performSync(state, 'app_open', '2026-04-16T08:01');
      expect(getPendingEvents(synced)).toHaveLength(0);

      // 添加新事件
      const newEvents = makeTimedEvents('p1', [
        '2026-04-16T08:02',
        '2026-04-16T08:03',
      ]);
      const withNew = addEventsToSyncState(synced, newEvents);
      expect(getPendingEvents(withNew)).toHaveLength(2);
      expect(getSyncedEvents(withNew)).toHaveLength(2);

      // 再次同步
      const { state: finalSynced } = performSync(withNew, 'manual_refresh', '2026-04-16T08:03');
      expect(getPendingEvents(finalSynced)).toHaveLength(0);
      expect(getSyncedEvents(finalSynced)).toHaveLength(4);
    });
  });
});
