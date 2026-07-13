import { createHash } from 'node:crypto';
import type { DeviceEvent, SensorObservation } from '@health-advisor/shared';

// ============================================================
// 传感器观察投影器
// 将 DeviceEvent（模拟器内部真值）投影为无标签的 SensorObservation
// 识别器只能基于 SensorObservation 推导事件
//
// 核心约束：
// 1. observationId 由 profile、时间、metric、同分钟序号生成 opaque hash
// 2. hash 输入不得包含 segment.type、segmentId、eventId 或 scenarioId
// 3. micro event 不投影，保留为独立的用户上报通道
// ============================================================

/** micro event 的 segmentId 格式：seg-micro-{type}-{timestamp} */
const MICRO_SEGMENT_PATTERN = /^seg-micro-/;

/**
 * 判断事件是否属于 micro event（用户主动上报的微小动作）
 * micro event 通过独立的显式事件输入进入识别结果，不经过传感器投影
 */
function isMicroEvent(event: DeviceEvent): boolean {
  return event.segmentId !== undefined && MICRO_SEGMENT_PATTERN.test(event.segmentId);
}

/**
 * 生成稳定的 opaque observationId
 * hash 输入：profileId|measuredAt|metric|indexInMinute
 * 不含 segment.type、segmentId、eventId、scenarioId
 */
function computeObservationId(
  profileId: string,
  measuredAt: string,
  metric: string,
  indexInMinute: number,
): string {
  const input = `${profileId}|${measuredAt}|${metric}|${indexInMinute}`;
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

/**
 * 将同步后的 DeviceEvent 列表投影为无标签 SensorObservation 流
 *
 * 处理流程：
 * 1. 过滤掉 micro event（用户上报通道独立处理）
 * 2. 按 measuredAt 升序稳定排序
 * 3. 移除所有 segment 信息（segmentId、eventId、source）
 * 4. 为每条观察生成稳定的 opaque observationId（同分钟内同 metric 自增序号）
 *
 * @param events - 同步后的设备事件列表
 * @returns 无标签的传感器观察列表
 */
export function projectDeviceEventsToSensorObservations(
  events: DeviceEvent[],
): SensorObservation[] {
  if (events.length === 0) {
    return [];
  }

  // 1. 过滤 micro event（用户主动上报，不进入传感器流）
  const filtered = events.filter((e) => !isMicroEvent(e));

  if (filtered.length === 0) {
    return [];
  }

  // 2. 按 measuredAt 稳定升序排序（保留原始相对顺序作为 tiebreaker）
  const indexed = filtered.map((event, originalIndex) => ({ event, originalIndex }));
  indexed.sort((a, b) => {
    const cmp = a.event.measuredAt.localeCompare(b.event.measuredAt);
    return cmp !== 0 ? cmp : a.originalIndex - b.originalIndex;
  });

  // 3. 生成观察，跟踪同分钟+同 metric 的序号
  const minuteMetricCount = new Map<string, number>();
  const observations: SensorObservation[] = [];

  for (const { event } of indexed) {
    const key = `${event.profileId}|${event.measuredAt}|${event.metric}`;
    const indexInMinute = minuteMetricCount.get(key) ?? 0;
    minuteMetricCount.set(key, indexInMinute + 1);

    const observationId = computeObservationId(
      event.profileId,
      event.measuredAt,
      event.metric,
      indexInMinute,
    );

    // 4. 仅保留可观测量，剥离所有语义字段
    observations.push({
      observationId,
      profileId: event.profileId,
      measuredAt: event.measuredAt,
      metric: event.metric,
      value: event.value,
    });
  }

  return observations;
}
