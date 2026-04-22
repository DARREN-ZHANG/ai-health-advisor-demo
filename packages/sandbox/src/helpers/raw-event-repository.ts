import type { DeviceEvent } from '@health-advisor/shared';

// ============================================================
// 原始事件仓库：内存存储，支持按 profile/时间范围/segment 查询
// ============================================================

/** 仓库接口 */
export interface RawEventRepository {
  /** 批量添加事件（按 measuredAt 排序插入） */
  addEvents(events: DeviceEvent[]): void;
  /** 按 profileId 查询所有事件 */
  getEventsByProfile(profileId: string): DeviceEvent[];
  /** 按 profileId 和时间范围查询 */
  getEventsByRange(profileId: string, start: string, end: string): DeviceEvent[];
  /** 按 segmentId 查询所有事件 */
  getEventsBySegment(segmentId: string): DeviceEvent[];
  /** 获取所有事件 */
  getAllEvents(): DeviceEvent[];
  /** 清空所有事件 */
  clear(): void;
}

/**
 * 创建一个内存原始事件仓库
 * 内部维护按 measuredAt 排序的事件列表
 */
export function createRawEventRepository(): RawEventRepository {
  // 内部可变存储（对外暴露不可变操作）
  let events: DeviceEvent[] = [];

  /** 保持事件按 measuredAt 排序 */
  const sortEvents = (list: DeviceEvent[]): DeviceEvent[] =>
    [...list].sort((a, b) => a.measuredAt.localeCompare(b.measuredAt));

  return {
    addEvents(newEvents: DeviceEvent[]): void {
      events = sortEvents([...events, ...newEvents]);
    },

    getEventsByProfile(profileId: string): DeviceEvent[] {
      return events.filter((e) => e.profileId === profileId);
    },

    getEventsByRange(profileId: string, start: string, end: string): DeviceEvent[] {
      return events.filter(
        (e) =>
          e.profileId === profileId &&
          e.measuredAt >= start &&
          e.measuredAt <= end,
      );
    },

    getEventsBySegment(segmentId: string): DeviceEvent[] {
      return events.filter((e) => e.segmentId === segmentId);
    },

    getAllEvents(): DeviceEvent[] {
      return [...events];
    },

    clear(): void {
      events = [];
    },
  };
}
