import type {
  DemoClock,
  ActivitySegment,
  ActivitySegmentType,
  DeviceEvent,
  SyncSession,
  MicroEventParams,
  MicroEventType,
} from '@health-advisor/shared';
import type {
  OverrideEntry,
  DatedEvent,
  SyncState,
} from '@health-advisor/sandbox';
import {
  buildInitialProfileState,
  generateEventsForSegment,
  createDemoClock,
  appendSegment,
  performSync as sandboxPerformSync,
  getPendingEvents as sandboxGetPending,
  getSyncedEvents as sandboxGetSynced,
  appendMicroEvent as sandboxAppendMicroEvent,
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
    options?: { durationMinutes?: number; advanceClock?: boolean },
  ): { events: DeviceEvent[]; newCurrentTime: string; segmentStart: string; segmentEnd: string };

  // — 追加微事件 —
  appendMicroEvent(
    profileId: string,
    microEventType: MicroEventType,
    params?: MicroEventParams,
    options?: { durationMinutes?: number; advanceClock?: boolean },
  ): { events: DeviceEvent[]; newCurrentTime: string; eventStart: string; eventEnd: string };

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
  options?: { dataDir?: string; initialDemoTime?: string },
): OverrideStoreService {
  let currentProfileId = defaultProfileId;
  const overridesByProfile = new Map<string, OverrideEntry[]>();
  const eventsByProfile = new Map<string, DatedEvent[]>();
  const demoStateByProfile = new Map<string, DemoProfileState>();

  /** 获取或懒初始化 profile 的 demo 状态 */
  function ensureDemoState(profileId: string): DemoProfileState {
    const existing = demoStateByProfile.get(profileId);
    if (existing) return existing;

    let clock: DemoClock;
    let segments: ActivitySegment[];
    let rawEvents: DeviceEvent[];

    // 如果提供了 dataDir，从 timeline script 构建完整初始状态
    if (options?.dataDir) {
      const initial = buildInitialProfileState(options.dataDir, profileId);
      clock = initial.demoClock;
      segments = initial.segments;
      // 从 baseline segments 生成初始 raw events（如昨夜睡眠事件）
      rawEvents = segments.flatMap((seg) => generateEventsForSegment(seg));
    } else {
      // 回退：使用硬编码初始时间，不加载 segments
      const initialTime = options?.initialDemoTime ?? '2026-04-21T08:00';
      clock = createDemoClock(profileId, initialTime);
      segments = [];
      rawEvents = [];
    }

    const state: DemoProfileState = {
      overrides: [],
      injectedEvents: [],
      clock,
      segments,
      rawEvents,
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

    // — 追加片段（自动同步） —
    appendSegment(
      profileId: string,
      segmentType: ActivitySegmentType,
      params?: Record<string, number | string | boolean>,
      offsetMinutes?: number,
      options?: { durationMinutes?: number; advanceClock?: boolean },
    ): { events: DeviceEvent[]; newCurrentTime: string; segmentStart: string; segmentEnd: string } {
      const state = ensureDemoState(profileId);
      const result = appendSegment(
        state.segments,
        state.clock.currentTime,
        segmentType,
        profileId,
        params,
        offsetMinutes,
        options,
      );

      // 仅在 advanceClock 为 true 时推进时钟
      const advanceClock = options?.advanceClock !== false;
      const updatedState: DemoProfileState = {
        ...state,
        segments: result.segments,
        rawEvents: [...state.rawEvents, ...result.events],
        ...(advanceClock ? { clock: { ...state.clock, currentTime: result.newCurrentTime } } : {}),
      };

      // 自动同步：追加片段后立即执行同步，消除 pending 状态
      const internalSync = rebuildSyncState(updatedState);
      const { state: newSync } = sandboxPerformSync(
        internalSync,
        'app_open',
        updatedState.clock.currentTime,
      );

      demoStateByProfile.set(profileId, {
        ...updatedState,
        syncState: {
          lastSyncedMeasuredAt: newSync.lastSyncedMeasuredAt,
          syncSessions: [...newSync.syncSessions],
        },
      });

      // 从 segments 数组提取新 segment 的真实时间范围（不受 advanceClock 影响）
      const newSegment = result.segments[result.segments.length - 1];
      return {
        events: [...result.events],
        newCurrentTime: result.newCurrentTime,
        segmentStart: newSegment!.start,
        segmentEnd: newSegment!.end,
      };
    },

    // — 追加微事件（自动同步，不添加 segment，不注入事件） —
    appendMicroEvent(
      profileId: string,
      microEventType: MicroEventType,
      params?: MicroEventParams,
      options?: { durationMinutes?: number; advanceClock?: boolean },
    ): { events: DeviceEvent[]; newCurrentTime: string; eventStart: string; eventEnd: string } {
      const state = ensureDemoState(profileId);
      const result = sandboxAppendMicroEvent(
        state.clock.currentTime,
        microEventType,
        profileId,
        params,
        options,
      );

      const advanceClock = options?.advanceClock !== false;
      const updatedState: DemoProfileState = {
        ...state,
        rawEvents: [...state.rawEvents, ...result.events],
        ...(advanceClock ? { clock: { ...state.clock, currentTime: result.newCurrentTime } } : {}),
      };

      const internalSync = rebuildSyncState(updatedState);
      const { state: newSync } = sandboxPerformSync(internalSync, 'app_open', updatedState.clock.currentTime);

      demoStateByProfile.set(profileId, {
        ...updatedState,
        syncState: {
          lastSyncedMeasuredAt: newSync.lastSyncedMeasuredAt,
          syncSessions: [...newSync.syncSessions],
        },
      });

      return {
        events: [...result.events],
        newCurrentTime: result.newCurrentTime,
        eventStart: result.eventStart,
        eventEnd: result.eventEnd,
      };
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
