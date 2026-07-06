import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  selectEntriesForProfile,
  useLifeLogStore,
} from './life-log.store';
import type { LifeLogState } from './life-log.store';
import type { LifeLogEntry } from '@/lib/life-log';

/**
 * Life Log store 单元测试：add / update / delete / clear，以及
 * profile 隔离与按时间倒序的 selector。
 *
 * store 不持久化（无 persist middleware），因此这里只覆盖内存行为。
 */

function makeState(entriesByProfile: LifeLogState['entriesByProfile']): LifeLogState {
  return {
    entriesByProfile,
    addEntry: () => '',
    updateEntry: () => {},
    deleteEntry: () => {},
    clearForProfile: () => {},
  };
}

describe('life-log store', () => {
  beforeEach(() => {
    // 每个用例前重置内存状态
    useLifeLogStore.setState({
      entriesByProfile: {},
    });
    // crypto.randomUUID 在 jsdom 可能不存在，stub 之
    if (!globalThis.crypto) {
      vi.stubGlobal('crypto', {});
    }
    let counter = 0;
    vi.stubGlobal('crypto', {
      ...globalThis.crypto,
      randomUUID: () => `id-${++counter}`,
    });
  });

  describe('addEntry', () => {
    it('把新条目追加到对应 profileId 分区', () => {
      const id = useLifeLogStore.getState().addEntry({
        profileId: 'profile-a',
        type: 'caffeine',
        cups: 1,
        timestamp: '2026-07-05T08:00:00.000Z',
      });
      expect(id).toBe('id-1');
      const state = useLifeLogStore.getState();
      expect(state.entriesByProfile['profile-a']).toEqual([
        {
          id: 'id-1',
          profileId: 'profile-a',
          type: 'caffeine',
          cups: 1,
          timestamp: '2026-07-05T08:00:00.000Z',
        },
      ]);
    });

    it('支持附加 note', () => {
      useLifeLogStore.getState().addEntry({
        profileId: 'profile-a',
        type: 'hydration',
        cups: 1,
        timestamp: '2026-07-05T09:00:00.000Z',
        note: 'after run',
      });
      const list = useLifeLogStore.getState().entriesByProfile['profile-a'];
      expect(list?.[0]?.note).toBe('after run');
    });

    it('返回的 id 与写入的 entry.id 一致', () => {
      const id = useLifeLogStore.getState().addEntry({
        profileId: 'profile-a',
        type: 'alcohol',
        cups: 0.5,
        timestamp: '2026-07-05T22:00:00.000Z',
      });
      const list = useLifeLogStore.getState().entriesByProfile['profile-a'];
      expect(list?.[0]?.id).toBe(id);
    });
  });

  describe('updateEntry', () => {
    it('更新指定条目的 cups 与 note', () => {
      const id = useLifeLogStore.getState().addEntry({
        profileId: 'profile-a',
        type: 'caffeine',
        cups: 1,
        timestamp: '2026-07-05T08:00:00.000Z',
      });
      useLifeLogStore.getState().updateEntry('profile-a', id, {
        cups: 2,
        note: 'double shot',
      });
      const list = useLifeLogStore.getState().entriesByProfile['profile-a'];
      expect(list?.[0]).toEqual({
        id,
        profileId: 'profile-a',
        type: 'caffeine',
        cups: 2,
        timestamp: '2026-07-05T08:00:00.000Z',
        note: 'double shot',
      });
    });

    it('更新不存在的 entryId 不抛错（幂等）', () => {
      useLifeLogStore.getState().addEntry({
        profileId: 'profile-a',
        type: 'caffeine',
        cups: 1,
        timestamp: '2026-07-05T08:00:00.000Z',
      });
      expect(() =>
        useLifeLogStore
          .getState()
          .updateEntry('profile-a', 'bogus', { cups: 9 }),
      ).not.toThrow();
      // 原 entry 保留，cups 仍为 1
      expect(
        useLifeLogStore.getState().entriesByProfile['profile-a']?.[0]?.cups,
      ).toBe(1);
    });

    it('不会跨 profile 修改', () => {
      const id = useLifeLogStore.getState().addEntry({
        profileId: 'profile-a',
        type: 'caffeine',
        cups: 1,
        timestamp: '2026-07-05T08:00:00.000Z',
      });
      useLifeLogStore.getState().addEntry({
        profileId: 'profile-b',
        type: 'caffeine',
        cups: 5,
        timestamp: '2026-07-05T08:00:00.000Z',
      });
      // 用 profile-b 的 id 去改 profile-a 的分区
      useLifeLogStore.getState().updateEntry('profile-a', id, { cups: 3 });
      // profile-b 不会被改
      expect(
        useLifeLogStore.getState().entriesByProfile['profile-b']?.[0]?.cups,
      ).toBe(5);
    });
  });

  describe('deleteEntry', () => {
    it('删除指定条目', () => {
      const id1 = useLifeLogStore.getState().addEntry({
        profileId: 'profile-a',
        type: 'caffeine',
        cups: 1,
        timestamp: '2026-07-05T08:00:00.000Z',
      });
      const id2 = useLifeLogStore.getState().addEntry({
        profileId: 'profile-a',
        type: 'hydration',
        cups: 1,
        timestamp: '2026-07-05T09:00:00.000Z',
      });
      useLifeLogStore.getState().deleteEntry('profile-a', id1);
      const list = useLifeLogStore.getState().entriesByProfile['profile-a'];
      expect(list?.map((e) => e.id)).toEqual([id2]);
    });

    it('删除不存在的 id 不抛错', () => {
      expect(() =>
        useLifeLogStore.getState().deleteEntry('profile-a', 'missing'),
      ).not.toThrow();
    });
  });

  describe('clearForProfile', () => {
    it('清空指定 profile 的所有条目但保留分区键', () => {
      useLifeLogStore.getState().addEntry({
        profileId: 'profile-a',
        type: 'caffeine',
        cups: 1,
        timestamp: '2026-07-05T08:00:00.000Z',
      });
      useLifeLogStore.getState().clearForProfile('profile-a');
      expect(
        useLifeLogStore.getState().entriesByProfile['profile-a'],
      ).toEqual([]);
    });

    it('不影响其它 profile', () => {
      useLifeLogStore.getState().addEntry({
        profileId: 'profile-a',
        type: 'caffeine',
        cups: 1,
        timestamp: '2026-07-05T08:00:00.000Z',
      });
      useLifeLogStore.getState().addEntry({
        profileId: 'profile-b',
        type: 'hydration',
        cups: 2,
        timestamp: '2026-07-05T08:00:00.000Z',
      });
      useLifeLogStore.getState().clearForProfile('profile-a');
      expect(
        useLifeLogStore.getState().entriesByProfile['profile-b'],
      ).toHaveLength(1);
    });
  });

  describe('profile 隔离', () => {
    it('profile-a 中的条目不出现在 profile-b', () => {
      useLifeLogStore.getState().addEntry({
        profileId: 'profile-a',
        type: 'caffeine',
        cups: 1,
        timestamp: '2026-07-05T08:00:00.000Z',
      });
      useLifeLogStore.getState().addEntry({
        profileId: 'profile-b',
        type: 'hydration',
        cups: 3,
        timestamp: '2026-07-05T08:00:00.000Z',
      });
      const a = useLifeLogStore.getState().entriesByProfile['profile-a'] ?? [];
      const b = useLifeLogStore.getState().entriesByProfile['profile-b'] ?? [];
      expect(a.every((e) => e.profileId === 'profile-a')).toBe(true);
      expect(b.every((e) => e.profileId === 'profile-b')).toBe(true);
      expect(a.some((e) => e.type === 'hydration')).toBe(false);
      expect(b.some((e) => e.type === 'caffeine')).toBe(false);
    });
  });

  describe('selectEntriesForProfile', () => {
    it('按 timestamp 倒序返回', () => {
      const state = makeState({
        'profile-a': [
          {
            id: '1',
            profileId: 'profile-a',
            type: 'caffeine',
            cups: 1,
            timestamp: '2026-07-05T08:00:00.000Z',
          },
          {
            id: '2',
            profileId: 'profile-a',
            type: 'hydration',
            cups: 1,
            timestamp: '2026-07-05T20:00:00.000Z',
          },
          {
            id: '3',
            profileId: 'profile-a',
            type: 'alcohol',
            cups: 1,
            timestamp: '2026-07-05T12:00:00.000Z',
          },
        ],
      });
      const out = selectEntriesForProfile(state, 'profile-a');
      expect(out.map((e) => e.id)).toEqual(['2', '3', '1']);
    });

    it('对未知 profileId 返回空数组', () => {
      const state = makeState({});
      expect(selectEntriesForProfile(state, 'unknown')).toEqual([]);
    });

    it('不修改 store 内部数组（返回拷贝）', () => {
      const original: ReadonlyArray<LifeLogEntry> = [
        {
          id: '1',
          profileId: 'profile-a',
          type: 'caffeine',
          cups: 1,
          timestamp: '2026-07-05T08:00:00.000Z',
        },
      ];
      const state = makeState({ 'profile-a': original });
      const out = selectEntriesForProfile(state, 'profile-a');
      // 调用方对新数组做任何操作都不应影响 store 内部数据
      const ids = [...out].sort((a, b) => a.id.localeCompare(b.id));
      expect(ids.map((e) => e.id)).toEqual(['1']);
      // 原 array 顺序与内容保持不变（未发生 mutation）
      expect(state.entriesByProfile['profile-a']).toEqual(original);
    });
  });
});
