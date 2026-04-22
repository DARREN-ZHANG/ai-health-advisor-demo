import type {
  DemoClock,
  ActivitySegment,
  ActivitySegmentType,
  DeviceEvent,
  SyncSession,
} from '@health-advisor/shared';
import type {
  OverrideEntry,
  DatedEvent,
  SyncState,
} from '@health-advisor/sandbox';
import {
  createDemoClock,
  appendSegment,
  performSync as sandboxPerformSync,
  getPendingEvents as sandboxGetPending,
  getSyncedEvents as sandboxGetSynced,
} from '@health-advisor/sandbox';

// ============================================================
// Demo Profile 状态
// ============================================================

/** 每个 profile 的演示时间轴状态 */
export interface DemoProfileState {
  /** 已有的 override 记录 */
  overrides: OverrideEntry[];
  /** 已注入的事件 */
  injectedEvents: DatedEvent[];
  /** 演示时钟 */
  clock: DemoClock;
  /** 活动片段 */
  segments: ActivitySegment[];
  /** 原始设备事件 */
  rawEvents: DeviceEvent[];
  /** 同步状态 */
  syncState: {
    lastSyncedMeasuredAt: string | null;
    syncSessions: SyncSession[];
  };
}

// ============================================================
// Service 接口
// ============================================================

export interface OverrideStoreService {
  // — 现有能力（保留） —
  getCurrentProfileId(): string;
  switchProfile(profileId: string): void;
  addOverride(profileId: string, entry: OverrideEntry): void;
  getActiveOverrides(profileId: string): OverrideEntry[];
  injectEvent(profileId: string, event: DatedEvent): void;
  getInjectedEvents(profileId: string): DatedEvent[];
  reset(scope: 'profile' | 'events' | 'overrides' | 'all'): void;

  // — 时间轴操作 —
  getDemoClock(profileId: string): DemoClock;
  advanceClock(profileId: string, minutes: number): void;
  getSegments(profileId: string): ActivitySegment[];

  // — 追加片段 —
  appendSegment(
    profileId: string,
    segmentType: ActivitySegmentType,
    params?: Record<string, number | string | boolean>,
    offsetMinutes?: number,
  ): { events: DeviceEvent[]; newCurrentTime: string };

  // — 同步操作 —
  getSyncState(profileId: string): { lastSyncedMeasuredAt: string | null; syncSessions: SyncSession[] };
  getPendingEvents(profileId: string): DeviceEvent[];
  getSyncedEvents(profileId: string): DeviceEvent[];
  performSync(profileId: string, trigger: 'app_open' | 'manual_refresh'): SyncSession;

  // — 时间轴重置 —
  resetProfileTimeline(profileId: string): void;
}

// ============================================================
// 工厂函数
// ============================================================

export function createOverrideStore(
  defaultProfileId: string,
  options?: { initialDemoTime?: string },
): OverrideStoreService {
  let currentProfileId = defaultProfileId;
  const overridesByProfile = new Map<string, OverrideEntry[]>();
  const eventsByProfile = new Map<string, DatedEvent[]>();
  const demoStateByProfile = new Map<string, DemoProfileState>();

  /** 获取或懒初始化 profile 的 demo 状态 */
  function ensureDemoState(profileId: string): DemoProfileState {
    const existing = demoStateByProfile.get(profileId);
    if (existing) return existing;

    const initialTime = options?.initialDemoTime ?? '2026-04-21T08:00';
    const clock = createDemoClock(profileId, initialTime);

    const state: DemoProfileState = {
      overrides: [],
      injectedEvents: [],
      clock,
      segments: [],
      rawEvents: [],
      syncState: {
        lastSyncedMeasuredAt: null,
        syncSessions: [],
      },
    };
    demoStateByProfile.set(profileId, state);
    return state;
  }

  return {
    // — 现有能力 —
    getCurrentProfileId() {
      return currentProfileId;
    },
    switchProfile(profileId: string) {
      currentProfileId = profileId;
    },
    addOverride(profileId: string, entry: OverrideEntry) {
      const existing = overridesByProfile.get(profileId) ?? [];
      overridesByProfile.set(profileId, [...existing, entry]);
    },
    getActiveOverrides(profileId: string): OverrideEntry[] {
      return [...(overridesByProfile.get(profileId) ?? [])];
    },
    injectEvent(profileId: string, event: DatedEvent) {
      const existing = eventsByProfile.get(profileId) ?? [];
      eventsByProfile.set(profileId, [...existing, event]);
    },
    getInjectedEvents(profileId: string): DatedEvent[] {
      return [...(eventsByProfile.get(profileId) ?? [])];
    },
    reset(scope) {
      switch (scope) {
        case 'profile':
          currentProfileId = defaultProfileId;
          break;
        case 'events':
          eventsByProfile.clear();
          break;
        case 'overrides':
          overridesByProfile.clear();
          break;
        case 'all':
          currentProfileId = defaultProfileId;
          overridesByProfile.clear();
          eventsByProfile.clear();
          demoStateByProfile.clear();
          break;
      }
    },

    // — 时间轴操作 —
    getDemoClock(profileId: string): DemoClock {
      return { ...ensureDemoState(profileId).clock };
    },
    advanceClock(profileId: string, minutes: number): void {
      const state = ensureDemoState(profileId);
      const newTime = addLocalMinutes(state.clock.currentTime, minutes);
      demoStateByProfile.set(profileId, {
        ...state,
        clock: { ...state.clock, currentTime: newTime },
      });
    },
    getSegments(profileId: string): ActivitySegment[] {
      return [...ensureDemoState(profileId).segments];
    },

    // — 追加片段 —
    appendSegment(
      profileId: string,
      segmentType: ActivitySegmentType,
      params?: Record<string, number | string | boolean>,
      offsetMinutes?: number,
    ): { events: DeviceEvent[]; newCurrentTime: string } {
      const state = ensureDemoState(profileId);
      const result = appendSegment(
        state.segments,
        state.clock.currentTime,
        segmentType,
        profileId,
        params,
        offsetMinutes,
      );

      // 将新事件追加到 rawEvents，保留已有水位线
      demoStateByProfile.set(profileId, {
        ...state,
        segments: result.segments,
        rawEvents: [...state.rawEvents, ...result.events],
        clock: { ...state.clock, currentTime: result.newCurrentTime },
      });

      return { events: [...result.events], newCurrentTime: result.newCurrentTime };
    },

    // — 同步操作 —
    getSyncState(profileId: string): { lastSyncedMeasuredAt: string | null; syncSessions: SyncSession[] } {
      const { syncState } = ensureDemoState(profileId);
      return {
        lastSyncedMeasuredAt: syncState.lastSyncedMeasuredAt,
        syncSessions: [...syncState.syncSessions],
      };
    },
    getPendingEvents(profileId: string): DeviceEvent[] {
      const state = ensureDemoState(profileId);
      const internalSync = rebuildSyncState(state);
      return sandboxGetPending(internalSync);
    },
    getSyncedEvents(profileId: string): DeviceEvent[] {
      const state = ensureDemoState(profileId);
      const internalSync = rebuildSyncState(state);
      return sandboxGetSynced(internalSync);
    },
    performSync(profileId: string, trigger: 'app_open' | 'manual_refresh'): SyncSession {
      const state = ensureDemoState(profileId);
      const internalSync = rebuildSyncState(state);
      const { state: newSync, session } = sandboxPerformSync(
        internalSync,
        trigger,
        state.clock.currentTime,
      );

      demoStateByProfile.set(profileId, {
        ...state,
        syncState: {
          lastSyncedMeasuredAt: newSync.lastSyncedMeasuredAt,
          syncSessions: [...newSync.syncSessions],
        },
      });

      return { ...session };
    },

    // — 时间轴重置 —
    resetProfileTimeline(profileId: string): void {
      demoStateByProfile.delete(profileId);
    },
  };
}

/** 从 DemoProfileState 的 rawEvents 和 syncState 信息重建 SyncState */
function rebuildSyncState(state: DemoProfileState): SyncState {
  return {
    profileId: state.clock.profileId,
    events: [...state.rawEvents],
    lastSyncedMeasuredAt: state.syncState.lastSyncedMeasuredAt,
    syncSessions: [...state.syncState.syncSessions],
  };
}

/** 给 YYYY-MM-DDTHH:mm 格式的时间戳加 N 分钟（本地时间，与 timeline-append 一致） */
function addLocalMinutes(timestamp: string, minutes: number): string {
  const date = new Date(`${timestamp}:00`);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`无效的时间戳格式: ${timestamp}`);
  }
  date.setMinutes(date.getMinutes() + minutes);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${d}T${h}:${min}`;
}
