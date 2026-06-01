import type { DeviceEvent, MicroEventParams, MicroEventType } from '@health-advisor/shared';
import { MICRO_EVENT_REGISTRY } from './micro-event-registry';
import { generateEventsForMicroEvent } from './micro-event-generators';

// ============================================================
// Micro-Event Append 逻辑：生成微事件设备事件，不添加 ActivitySegment
// ============================================================

export interface MicroEventAppendResult {
  events: DeviceEvent[];
  newCurrentTime: string;
  eventStart: string;
  eventEnd: string;
  segmentId: string;
}

/** 给 YYYY-MM-DDTHH:mm 格式的时间戳加 N 分钟（使用本地时间解析） */
function addMinutes(timestamp: string, minutes: number): string {
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

/**
 * 生成微事件设备事件并推进演示时钟
 *
 * 规则：
 * - eventStart 等于 currentTime
 * - eventEnd 等于 currentTime + durationMinutes
 * - durationMinutes 省略时使用注册表默认值
 * - segmentId 格式为 seg-micro-${microEventType}-${start.replace(/[-T:]/g, '')}
 * - advanceClock 默认为 true；为 false 时不推进时钟
 *
 * 与 appendSegment 的区别：不操作 state.segments，仅返回生成的事件和时间信息
 */
export function appendMicroEvent(
  currentTime: string,
  microEventType: MicroEventType,
  profileId: string,
  params?: MicroEventParams,
  options?: { durationMinutes?: number; advanceClock?: boolean },
): MicroEventAppendResult {
  const eventStart = currentTime;

  // 确定持续时长：优先使用 options.durationMinutes，其次使用注册表默认值
  const definition = MICRO_EVENT_REGISTRY[microEventType];
  const defaultDuration = definition?.defaultDurationMinutes ?? 5;
  const duration = options?.durationMinutes ?? defaultDuration;

  const eventEnd = addMinutes(eventStart, duration);

  // 生成片段 ID
  const segmentId = `seg-micro-${microEventType}-${eventStart.replace(/[-T:]/g, '')}`;

  // 生成设备事件
  const events = generateEventsForMicroEvent({
    segmentId,
    profileId,
    type: microEventType,
    start: eventStart,
    end: eventEnd,
    params,
  });

  // advanceClock 默认为 true；为 false 时不推进时钟
  const advanceClock = options?.advanceClock !== false;
  const newCurrentTime = advanceClock ? eventEnd : currentTime;

  return {
    events,
    newCurrentTime,
    eventStart,
    eventEnd,
    segmentId,
  };
}
