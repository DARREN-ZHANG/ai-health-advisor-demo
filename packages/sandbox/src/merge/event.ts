/** 带日期的事件 */
export interface DatedEvent {
  date: string;
  type: string;
  data: Record<string, unknown>;
}

/**
 * 合并两组事件并按日期排序（不可变）
 * @param baseEvents - 基础事件列表
 * @param injectedEvents - 注入的事件列表
 * @returns 合并并排序后的事件数组
 */
export function mergeEvents(baseEvents: DatedEvent[], injectedEvents: DatedEvent[]): DatedEvent[] {
  if (injectedEvents.length === 0) {
    return baseEvents;
  }
  if (baseEvents.length === 0) {
    return [...injectedEvents].sort(compareByDate);
  }

  const merged = [...baseEvents, ...injectedEvents];
  return merged.sort(compareByDate);
}

function compareByDate(a: DatedEvent, b: DatedEvent): number {
  if (a.date < b.date) return -1;
  if (a.date > b.date) return 1;
  return 0;
}
