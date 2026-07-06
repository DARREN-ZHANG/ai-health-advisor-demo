import { create } from 'zustand';
import type { LifeLogCategory, LifeLogEntry } from '@/lib/life-log';

/**
 * Life Log 内存 store：按 profileId 分区，**不持久化**。
 *
 * 设计意图（I3.3）：
 * - Life Log 是交互式原型，数据只活在当前会话中；刷新页面即清空。
 * - 因此不挂 `persist` middleware，避免数据被写回 localStorage。
 * - 每个 profile 的条目相互隔离，切换 profile 时 UI 仅显示当前 profile 的数据。
 *
 * API：
 * - `addEntry(entry)` —— 追加新条目，返回新 id（`crypto.randomUUID()`）。
 * - `updateEntry(profileId, entryId, changes)` —— 部分更新（不允许改 id / profileId）。
 * - `deleteEntry(profileId, entryId)` —— 删除。
 * - `clearForProfile(profileId)` —— 清空指定 profile 的全部条目。
 *
 * 选择器：`selectEntriesForProfile(state, profileId)` —— 返回该 profile 的条目，
 * 按 timestamp 倒序（最新在前）。
 */
export interface LifeLogState {
  /** 按 profileId 分区的 entries */
  entriesByProfile: Readonly<Record<string, ReadonlyArray<LifeLogEntry>>>;
  /** 新增条目，返回新 id */
  addEntry: (entry: NewLifeLogEntry) => string;
  /** 更新条目（不允许跨 profile 移动） */
  updateEntry: (
    profileId: string,
    entryId: string,
    changes: Partial<Omit<LifeLogEntry, 'id' | 'profileId'>>,
  ) => void;
  /** 删除条目 */
  deleteEntry: (profileId: string, entryId: string) => void;
  /** 清空指定 profile 的全部条目 */
  clearForProfile: (profileId: string) => void;
}

/** addEntry 接收的入参：除 id 之外的所有字段 */
export type NewLifeLogEntry = Omit<LifeLogEntry, 'id'>;

export const useLifeLogStore = create<LifeLogState>((set) => ({
  entriesByProfile: {},

  addEntry: (entry) => {
    const id = generateId();
    set((state) => ({
      entriesByProfile: {
        ...state.entriesByProfile,
        [entry.profileId]: [
          ...(state.entriesByProfile[entry.profileId] ?? []),
          { ...entry, id },
        ],
      },
    }));
    return id;
  },

  updateEntry: (profileId, entryId, changes) =>
    set((state) => ({
      entriesByProfile: {
        ...state.entriesByProfile,
        [profileId]: (state.entriesByProfile[profileId] ?? []).map((e) =>
          e.id === entryId ? { ...e, ...changes } : e,
        ),
      },
    })),

  deleteEntry: (profileId, entryId) =>
    set((state) => ({
      entriesByProfile: {
        ...state.entriesByProfile,
        [profileId]: (state.entriesByProfile[profileId] ?? []).filter(
          (e) => e.id !== entryId,
        ),
      },
    })),

  clearForProfile: (profileId) =>
    set((state) => ({
      entriesByProfile: {
        ...state.entriesByProfile,
        [profileId]: [],
      },
    })),
}));

/**
 * 选择器：返回指定 profile 的 entries，按 timestamp 倒序。
 *
 * 返回的是新数组，调用方可以放心 sort/filter；不影响 store 内部状态。
 * profileId 不存在时返回空数组。
 */
export function selectEntriesForProfile(
  state: LifeLogState,
  profileId: string,
): ReadonlyArray<LifeLogEntry> {
  return [...(state.entriesByProfile[profileId] ?? [])].sort((a, b) =>
    b.timestamp.localeCompare(a.timestamp),
  );
}

/**
 * 生成条目 id：优先 `crypto.randomUUID()`，否则回退到带计数器的伪 id。
 *
 * jsdom 在某些 CI 环境下没有 `crypto.randomUUID`，避免直接抛错。
 * 测试通过 stub 全局 `crypto.randomUUID` 控制返回值。
 */
function generateId(): string {
  const c = globalThis.crypto as
    | { randomUUID?: () => string }
    | undefined;
  if (c && typeof c.randomUUID === 'function') {
    return c.randomUUID();
  }
  return `life-log-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** 重新导出类型，方便下游单一入口 */
export type { LifeLogCategory, LifeLogEntry };
