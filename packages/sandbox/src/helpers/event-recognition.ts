import type {
  DeviceEvent,
  RecognizedEvent,
  RecognizedEventType,
} from '@health-advisor/shared';
import { MicroEventTypeSchema } from '@health-advisor/shared';
import { detectPossibleCaffeineIntake } from './caffeine-detector';
import { detectPossibleAlcoholIntake } from './alcohol-detector';

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

  // 饮酒摄入检测：基于所有已同步事件（不依赖 segmentId）
  const alcoholResults = detectPossibleAlcoholIntake(
    profileEvents,
    profileId,
    currentTime,
  );

  // 排除与已检测咖啡因事件重叠的饮酒结果
  // 两种事件的生理响应模式相似（HR↑、RMSSD↓、stress↑、低活动），
  // 咖啡因检测更可靠（有 RMSSD onset 约束），因此优先保留咖啡因结果
  const filteredAlcoholResults = alcoholResults.filter((alcoholEvent) => {
    if (caffeineResults.length === 0) return true;
    const significantOverlap = caffeineResults.some((caffeineEvent) => {
      const overlapStart = alcoholEvent.start > caffeineEvent.start ? alcoholEvent.start : caffeineEvent.start;
      const overlapEnd = alcoholEvent.end < caffeineEvent.end ? alcoholEvent.end : caffeineEvent.end;
      const overlapMin = diffMinutes(overlapStart, overlapEnd);
      return overlapMin > 30;
    });
    return !significantOverlap;
  });
  results.push(...filteredAlcoholResults);

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

/** 从 god-mode segmentId 中提取片段类型（格式：seg-gm-{type}-{timestamp}） */
function extractGodModeType(segmentId: string): string | null {
  const match = /^seg-gm-([a-z_]+)-\d+$/.exec(segmentId);
  return match?.[1] ?? null;
}

/** 从 micro-event segmentId 中提取微事件类型（格式：seg-micro-{type}-{timestamp}） */
function extractMicroEventType(segmentId: string): import('@health-advisor/shared').MicroEventType | null {
  const match = /^seg-micro-(micro_[a-z_]+)-\d+$/.exec(segmentId);
  const raw = match?.[1];
  const parsed = raw ? MicroEventTypeSchema.safeParse(raw) : null;
  return parsed?.success ? parsed.data : null;
}

/** 分类一个 segment 分组 */
function classifySegment(stats: SegmentStats): RecognizedEvent | null {
  const evidence: string[] = [];
  const durationMin = diffMinutes(stats.start, stats.end);

  // 微事件片段：直接从 segmentId 提取类型
  const microEventType = extractMicroEventType(stats.segmentId);
  if (microEventType) {
    return buildRecognized(stats, microEventType, durationMin, evidence, () => {
      evidence.push(`用户选择触发微事件 ${microEventType}，持续 ${durationMin} 分钟`);
      return 1.0;
    });
  }

  // god-mode 片段：直接从 segmentId 提取类型，跳过生理特征分类
  const godModeType = extractGodModeType(stats.segmentId);
  if (godModeType) {
    return buildRecognized(stats, godModeType as RecognizedEventType, durationMin, evidence, () => {
      return 1.0; // god-mode 片段确定性最高
    });
  }

  // 检查睡眠阶段事件
  if (stats.sleepStages.length > 0) {
    return classifySleep(stats, durationMin, evidence);
  }

  const avgHr = average(stats.heartRates);
  const avgMotion = average(stats.motions);
  const maxSteps = stats.steps.length > 0 ? Math.max(...stats.steps) : 0;
  const hrStdDev = stdDev(stats.heartRates);

  // 力量训练：高心率变异性 + 极低步数（先于 HIIT 检测）
  if (hrStdDev > 20 && maxSteps < 50 && avgHr >= 90 && avgMotion > 2) {
    return buildRecognized(stats, 'strength_training', durationMin, evidence, () => {
      evidence.push(`心率标准差 ${hrStdDev.toFixed(0)}, 低步数 ${maxSteps}, 间歇高强度`);
      return Math.min(0.85, 0.5 + Math.min(hrStdDev / 50, 0.35));
    });
  }

  // 间歇运动：高心率变异性 + 较多步数（先于 steady_cardio 检测，避免误匹配）
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

/** 睡眠/小憩分类 */
function classifySleep(
  stats: SegmentStats,
  durationMin: number,
  evidence: string[],
): RecognizedEvent {
  const stageCounts = countBy(stats.sleepStages);
  const avgHr = average(stats.heartRates);

  // 120 分钟为阈值：短于此时长识别为小憩，否则为夜间睡眠
  const isNap = durationMin < 120;
  const eventType = isNap ? 'nap' : 'sleep';

  if (isNap) {
    evidence.push(`小憩持续 ${durationMin} 分钟, 阶段分布: ${Object.entries(stageCounts).map(([k, v]) => `${k}=${v}`).join(', ')}`);
    evidence.push(`平均心率 ${avgHr.toFixed(0)}, 短时恢复性睡眠`);
  } else {
    evidence.push(`睡眠阶段转换 ${stats.sleepStages.length} 次, 持续 ${durationMin} 分钟`);
    evidence.push(`平均心率 ${avgHr.toFixed(0)}, 阶段分布: ${Object.entries(stageCounts).map(([k, v]) => `${k}=${v}`).join(', ')}`);
  }

  // 信心计算
  const durationConf = isNap
    ? Math.min(durationMin / 60, 0.5)
    : Math.min(durationMin / 360, 0.5);
  const stageConf = Math.min(Object.keys(stageCounts).length / 4, 0.3);
  const confidence = Math.min(0.95, 0.3 + durationConf + stageConf);

  return {
    recognizedEventId: `re-${stats.segmentId}`,
    profileId: stats.profileId,
    type: eventType,
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
