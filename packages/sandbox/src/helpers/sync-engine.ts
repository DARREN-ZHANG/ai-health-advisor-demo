import type { DeviceEvent, SyncSession } from '@health-advisor/shared';

// ============================================================
// 同步引擎：管理设备事件的 pending/synced 生命周期
// 纯函数模块，所有操作均不可变
// ============================================================

/** 同步状态 */
export interface SyncState {
  profileId: string;
  /** 所有事件（设备端 + 已同步） */
  events: DeviceEvent[];
  /** 水位线：measuredAt <= 此值的事件视为已同步 */
  lastSyncedMeasuredAt: string | null;
  /** 同步操作历史 */
  syncSessions: SyncSession[];
}

// ============================================================
// 公共函数
// ============================================================

/**
 * 创建初始同步状态（所有事件都在 pending）
 * @param profileId - profile 标识
 * @param initialEvents - 初始设备事件列表
 */
export function createSyncState(
  profileId: string,
  initialEvents: DeviceEvent[],
): SyncState {
  return {
    profileId,
    events: [...initialEvents],
    lastSyncedMeasuredAt: null,
    syncSessions: [],
  };
}

/**
 * 执行同步：把所有 measuredAt <= currentTime 的 pending 事件标记为 synced
 * 返回新的 SyncState（不可变）和新的 SyncSession
 * @param state - 当前同步状态
 * @param trigger - 同步触发方式
 * @param currentTime - 当前时间，作为同步水位线
 */
export function performSync(
  state: SyncState,
  trigger: 'app_open' | 'manual_refresh',
  currentTime: string,
): { state: SyncState; session: SyncSession } {
  const pendingEvents = getPendingEvents(state);
  // 筛选出 measuredAt <= currentTime 的事件（可被同步的）
  const toSync = pendingEvents.filter(
    (evt) => evt.measuredAt <= currentTime,
  );

  // 计算本批待同步事件的最大 measuredAt
  const maxMeasuredAt = toSync.length > 0
    ? toSync.reduce(
        (max, evt) => (evt.measuredAt > max ? evt.measuredAt : max),
        toSync[0]!.measuredAt,
      )
    : null;

  const session = buildSyncSession(
    state.profileId,
    trigger,
    currentTime,
    state.lastSyncedMeasuredAt,
    toSync,
    maxMeasuredAt,
  );

  // 水位线：有新数据时用最大 measuredAt，无新数据时保留旧水位线
  const newState: SyncState = {
    ...state,
    lastSyncedMeasuredAt: maxMeasuredAt ?? state.lastSyncedMeasuredAt,
    syncSessions: [...state.syncSessions, session],
  };

  return { state: newState, session };
}

/**
 * 获取 pending 事件（measuredAt > lastSyncedMeasuredAt）
 * 若 lastSyncedMeasuredAt 为 null，则所有事件均为 pending
 */
export function getPendingEvents(state: SyncState): DeviceEvent[] {
  if (state.lastSyncedMeasuredAt === null) {
    return [...state.events];
  }
  return state.events.filter(
    (evt) => evt.measuredAt > state.lastSyncedMeasuredAt!,
  );
}

/**
 * 获取已同步事件（measuredAt <= lastSyncedMeasuredAt）
 * 若 lastSyncedMeasuredAt 为 null，则无已同步事件
 */
export function getSyncedEvents(state: SyncState): DeviceEvent[] {
  if (state.lastSyncedMeasuredAt === null) {
    return [];
  }
  return state.events.filter(
    (evt) => evt.measuredAt <= state.lastSyncedMeasuredAt!,
  );
}

/**
 * 添加新事件到状态（如从 timeline append 产生的新事件）
 * 返回新的 SyncState，水位线不变
 */
export function addEventsToSyncState(
  state: SyncState,
  events: DeviceEvent[],
): SyncState {
  return {
    ...state,
    events: [...state.events, ...events],
  };
}

/**
 * 获取同步会话摘要（返回所有历史会话）
 */
export function summarizeSyncSessions(state: SyncState): SyncSession[] {
  return [...state.syncSessions];
}

// ============================================================
// 内部辅助函数
// ============================================================

/** 构建一个同步会话记录 */
function buildSyncSession(
  profileId: string,
  trigger: 'app_open' | 'manual_refresh',
  currentTime: string,
  lastSynced: string | null,
  syncedEvents: DeviceEvent[],
  maxMeasuredAt: string | null,
): SyncSession {
  const count = syncedEvents.length;

  if (count === 0) {
    return {
      syncId: generateSyncId(currentTime),
      profileId,
      trigger,
      startedAt: currentTime,
      finishedAt: currentTime,
      uploadedMeasuredRange: null,
      uploadedEventCount: 0,
    };
  }

  // 计算上传范围：从最早的待同步事件到实际最大 measuredAt
  const start = syncedEvents[0]!.measuredAt;
  const end = maxMeasuredAt!;

  return {
    syncId: generateSyncId(currentTime),
    profileId,
    trigger,
    startedAt: currentTime,
    finishedAt: currentTime,
    uploadedMeasuredRange: { start, end },
    uploadedEventCount: count,
  };
}

/** 生成同步 ID */
function generateSyncId(currentTime: string): string {
  // 用时间戳中非特殊字符作为简短 ID
  const compact = currentTime.replace(/[-T:]/g, '');
  return `sync-${compact}`;
}
