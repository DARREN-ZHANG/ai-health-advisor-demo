import type {
  DeviceEvent,
  RecognizedEvent,
  RecognizedEventType,
} from '@health-advisor/shared';
import { detectPossibleCaffeineIntake } from './caffeine-detector';

// ============================================================
// 事件识别器：根据同步后的 DeviceEvent 识别活动事件
// 策略：先按 segmentId 分组分类，再对无 segmentId 的事件做窗口检测
// ============================================================

/** 已知 segmentId 分组的统计摘要 */
interface SegmentStats {
  segmentId: string;
  profileId: string;
  /** 最早事件时间 */
  start: string;
  /** 最晚事件时间 */
  end: string;
  /** 心率值列表 */
  heartRates: number[];
  /** 步数值列表 */
  steps: number[];
  /** 运动强度值列表 */
  motions: number[];
  /** 血氧值列表 */
  spo2Values: number[];
  /** 睡眠阶段值列表 */
  sleepStages: string[];
  /** 佩戴状态事件数 */
  wearStateCount: number;
  /** 总事件数 */
  totalEvents: number;
}

// ============================================================
// 公共函数
// ============================================================

/**
 * 识别事件：分析同步后的 DeviceEvent 列表，输出已识别的活动事件
 * @param syncedEvents - 已同步的设备事件列表
 * @param profileId - 当前 profile 标识
 * @param currentTime - 当前时间（YYYY-MM-DDTHH:mm），用于生成 ID
 */
export function recognizeEvents(
  syncedEvents: DeviceEvent[],
  profileId: string,
  currentTime: string,
): RecognizedEvent[] {
  if (syncedEvents.length === 0) {
    return [];
  }

  // 筛选当前 profile 的事件
  const profileEvents = syncedEvents.filter(
    (e) => e.profileId === profileId,
  );

  // 按 segmentId 分组
  const grouped = groupBySegmentId(profileEvents);

  const results: RecognizedEvent[] = [];

  // 处理有 segmentId 的分组
  for (const stats of grouped.withSegmentId) {
    const recognized = classifySegment(stats);
    if (recognized) {
      results.push(recognized);
    }
  }

  // 处理无 segmentId 的事件（滑动窗口）
  if (grouped.withoutSegmentId.length > 0) {
    const windowResults = recognizeWithWindow(
      grouped.withoutSegmentId,
      profileId,
      currentTime,
    );
    results.push(...windowResults);
  }

  // 咖啡因摄入检测：基于所有已同步事件（不依赖 segmentId）
  const caffeineResults = detectPossibleCaffeineIntake(
    profileEvents,
    profileId,
    currentTime,
  );
  results.push(...caffeineResults);

  return results;
}

// ============================================================
// 分组逻辑
// ============================================================

/** 按 segmentId 分组并计算统计 */
function groupBySegmentId(
  events: DeviceEvent[],
): { withSegmentId: SegmentStats[]; withoutSegmentId: DeviceEvent[] } {
  const segmentMap = new Map<string, DeviceEvent[]>();
  const noSegment: DeviceEvent[] = [];

  for (const event of events) {
    if (event.segmentId) {
      const existing = segmentMap.get(event.segmentId) ?? [];
      segmentMap.set(event.segmentId, [...existing, event]);
    } else {
      noSegment.push(event);
    }
  }

  const withSegmentId: SegmentStats[] = [];
  for (const [segmentId, segEvents] of segmentMap) {
    withSegmentId.push(buildStats(segmentId, segEvents));
  }

  return { withSegmentId, withoutSegmentId: noSegment };
}

/** 从事件列表构建统计摘要 */
function buildStats(segmentId: string, events: DeviceEvent[]): SegmentStats {
  // 按时间排序
  const sorted = [...events].sort((a, b) =>
    a.measuredAt.localeCompare(b.measuredAt),
  );

  const heartRates: number[] = [];
  const steps: number[] = [];
  const motions: number[] = [];
  const spo2Values: number[] = [];
  const sleepStages: string[] = [];
  let wearStateCount = 0;

  for (const e of sorted) {
    switch (e.metric) {
      case 'heartRate':
        if (typeof e.value === 'number') heartRates.push(e.value);
        break;
      case 'steps':
        if (typeof e.value === 'number') steps.push(e.value);
        break;
      case 'motion':
        if (typeof e.value === 'number') motions.push(e.value);
        break;
      case 'spo2':
        if (typeof e.value === 'number') spo2Values.push(e.value);
        break;
      case 'sleepStage':
        if (typeof e.value === 'string') sleepStages.push(e.value);
        break;
      case 'wearState':
        wearStateCount++;
        break;
    }
  }

  return {
    segmentId,
    profileId: sorted[0]!.profileId,
    start: sorted[0]!.measuredAt,
    end: sorted[sorted.length - 1]!.measuredAt,
    heartRates,
    steps,
    motions,
    spo2Values,
    sleepStages,
    wearStateCount,
    totalEvents: sorted.length,
  };
}

// ============================================================
// 分类逻辑
// ============================================================

/** 分类一个 segment 分组 */
function classifySegment(stats: SegmentStats): RecognizedEvent | null {
  const evidence: string[] = [];
  const durationMin = diffMinutes(stats.start, stats.end);

  // 检查睡眠阶段事件
  if (stats.sleepStages.length > 0) {
    return classifySleep(stats, durationMin, evidence);
  }

  const avgHr = average(stats.heartRates);
  const avgMotion = average(stats.motions);
  const maxSteps = stats.steps.length > 0 ? Math.max(...stats.steps) : 0;
  const hrStdDev = stdDev(stats.heartRates);

  // 间歇运动：高心率变异性（先于 steady_cardio 检测，避免误匹配）
  if (stats.heartRates.length > 4 && hrStdDev > 20) {
    return buildRecognized(stats, 'intermittent_exercise', durationMin, evidence, () => {
      evidence.push(`心率标准差 ${hrStdDev.toFixed(0)}, 交替高低强度`);
      return Math.min(0.85, 0.5 + Math.min(hrStdDev / 40, 0.35));
    });
  }

  // 稳态有氧：高心率且心率稳定
  if (avgHr >= 110 && avgMotion > 5 && maxSteps > 100) {
    return buildRecognized(stats, 'steady_cardio', durationMin, evidence, () => {
      const hrConsistency = 1 - (hrStdDev / avgHr);
      evidence.push(`平均心率 ${avgHr.toFixed(0)}, 运动强度 ${avgMotion.toFixed(1)}, 步数 ${maxSteps}`);
      return Math.min(0.95, Math.max(0.5, hrConsistency * 0.8 + 0.15));
    });
  }

  if (avgHr >= 80 && avgMotion >= 2.5 && maxSteps > 50) {
    return buildRecognized(stats, 'walk', durationMin, evidence, () => {
      evidence.push(`平均心率 ${avgHr.toFixed(0)}, 运动强度 ${avgMotion.toFixed(1)}, 步数 ${maxSteps}`);
      return Math.min(0.9, 0.6 + Math.min(durationMin / 30, 0.3));
    });
  }

  if (avgMotion >= 2 && avgMotion <= 7 && avgHr >= 60 && avgHr <= 90 && maxSteps < 50) {
    return buildRecognized(stats, 'meal_intake', durationMin, evidence, () => {
      evidence.push(`平均心率 ${avgHr.toFixed(0)}, 运动强度 ${avgMotion.toFixed(1)}, 少量步数`);
      return Math.min(0.85, 0.55 + Math.min(durationMin / 40, 0.3));
    });
  }

  if (avgHr < 75 && avgMotion < 1 && maxSteps === 0 && durationMin > 30) {
    return buildRecognized(stats, 'prolonged_sedentary', durationMin, evidence, () => {
      evidence.push(`低心率 ${avgHr.toFixed(0)}, 无运动, 持续 ${durationMin} 分钟`);
      return Math.min(0.9, 0.5 + Math.min(durationMin / 90, 0.4));
    });
  }


  return null;
}

/** 睡眠分类 */
function classifySleep(
  stats: SegmentStats,
  durationMin: number,
  evidence: string[],
): RecognizedEvent {
  const stageCounts = countBy(stats.sleepStages);
  const avgHr = average(stats.heartRates);

  evidence.push(`睡眠阶段转换 ${stats.sleepStages.length} 次, 持续 ${durationMin} 分钟`);
  evidence.push(`平均心率 ${avgHr.toFixed(0)}, 阶段分布: ${Object.entries(stageCounts).map(([k, v]) => `${k}=${v}`).join(', ')}`);

  // 信心计算：基于时长和阶段多样性
  const durationConf = Math.min(durationMin / 360, 0.5);
  const stageConf = Math.min(Object.keys(stageCounts).length / 4, 0.3);
  const confidence = Math.min(0.95, 0.3 + durationConf + stageConf);

  return {
    recognizedEventId: `re-${stats.segmentId}`,
    profileId: stats.profileId,
    type: 'sleep',
    start: stats.start,
    end: stats.end,
    confidence,
    evidence,
    sourceSegmentId: stats.segmentId,
  };
}

// ============================================================
// 无 segmentId 的滑动窗口识别
// ============================================================

/** 对没有 segmentId 的事件使用滑动窗口 */
function recognizeWithWindow(
  events: DeviceEvent[],
  profileId: string,
  _currentTime: string,
): RecognizedEvent[] {
  if (events.length < 5) return [];

  // 按 measuredAt 排序
  const sorted = [...events].sort((a, b) =>
    a.measuredAt.localeCompare(b.measuredAt),
  );

  // 简单策略：对整个时间段做统计，作为单一活动分析
  const stats = buildStats('auto', sorted);
  stats.profileId = profileId;
  const durationMin = diffMinutes(stats.start, stats.end);

  if (durationMin < 10) return [];

  const result = classifySegment(stats);
  if (!result) return [];

  // 覆盖 ID（因为不是来自已知 segment）
  return [
    {
      ...result,
      recognizedEventId: `re-auto-${stats.start.replace(/[-T:]/g, '')}`,
      profileId,
      sourceSegmentId: undefined,
    },
  ];
}

// ============================================================
// 辅助工具函数
// ============================================================

/** 构建已识别事件（统一入口） */
function buildRecognized(
  stats: SegmentStats,
  type: RecognizedEventType,
  durationMin: number,
  evidence: string[],
  computeConfidence: () => number,
): RecognizedEvent {
  evidence.unshift(`检测到 ${type} 活动, 持续 ${durationMin} 分钟`);
  return {
    recognizedEventId: `re-${stats.segmentId}`,
    profileId: stats.profileId,
    type,
    start: stats.start,
    end: stats.end,
    confidence: computeConfidence(),
    evidence,
    sourceSegmentId: stats.segmentId,
  };
}

/** 计算两个时间戳之间的分钟差 */
function diffMinutes(start: string, end: string): number {
  const s = new Date(`${start}:00`);
  const e = new Date(`${end}:00`);
  return Math.round((e.getTime() - s.getTime()) / 60000);
}

/** 计算平均值 */
function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/** 计算标准差 */
function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const avg = average(values);
  const squaredDiffs = values.map((v) => (v - avg) ** 2);
  return Math.sqrt(average(squaredDiffs));
}

/** 计数统计 */
function countBy(items: string[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const item of items) {
    result[item] = (result[item] ?? 0) + 1;
  }
  return result;
}
