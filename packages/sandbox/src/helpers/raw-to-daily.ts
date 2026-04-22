import type {
  ActivityData,
  DailyRecord,
  DeviceEvent,
  SleepData,
  SleepStages,
  StressData,
} from '@health-advisor/shared';

// ============================================================
// DailyRecord 聚合器：从原始设备事件聚合为日级别记录
// ============================================================

// ============================================================
// 公共函数
// ============================================================

/**
 * 聚合指定日期的设备事件为 DailyRecord
 * @param syncedEvents - 已同步的设备事件列表
 * @param date - 日期字符串（YYYY-MM-DD）
 */
export function aggregateDailyRecord(
  syncedEvents: DeviceEvent[],
  date: string,
): DailyRecord {
  // 筛选指定日期的事件
  const dayPrefix = date;
  const dayEvents = syncedEvents.filter(
    (e) => e.measuredAt.startsWith(dayPrefix),
  );

  if (dayEvents.length === 0) {
    return { date };
  }

  // 心率聚合
  const hr = aggregateHeartRate(dayEvents);

  // 睡眠聚合
  const sleep = aggregateSleep(dayEvents, date);

  // 活动聚合
  const activity = aggregateActivity(dayEvents);

  // 血氧聚合
  const spo2 = aggregateSpo2(dayEvents);

  // 压力聚合
  const stress = aggregateStress(dayEvents);

  return {
    date,
    ...(hr.length > 0 ? { hr } : {}),
    ...(sleep ? { sleep } : {}),
    ...(activity ? { activity } : {}),
    ...(spo2 !== undefined ? { spo2 } : {}),
    ...(stress ? { stress } : {}),
  };
}

/**
 * 聚合当前活动日的记录
 * @param syncedEvents - 已同步的设备事件列表
 * @param currentTime - 当前时间（YYYY-MM-DDTHH:mm）
 */
export function aggregateCurrentDayRecord(
  syncedEvents: DeviceEvent[],
  currentTime: string,
): DailyRecord {
  const date = currentTime.slice(0, 10);
  return aggregateDailyRecord(syncedEvents, date);
}

// ============================================================
// 心率聚合
// ============================================================

/** 从事件中提取心率值，使用分位数采样到约 5 个锚点 */
function aggregateHeartRate(events: DeviceEvent[]): number[] {
  const hrValues = extractNumericValues(events, 'heartRate');
  if (hrValues.length === 0) return [];

  return sampleQuantiles(hrValues, 5);
}

/**
 * 使用分位数采样，将数据浓缩为指定数量的锚点
 * 保留最小值、最大值，中间按分位数取
 */
function sampleQuantiles(data: number[], count: number): number[] {
  if (data.length <= count) return [...data];

  const sorted = [...data].sort((a, b) => a - b);
  const result: number[] = [];

  for (let i = 0; i < count; i++) {
    // 等间距取分位数位置
    const rank = i / (count - 1);
    const index = Math.min(Math.round(rank * (sorted.length - 1)), sorted.length - 1);
    result.push(sorted[index]!);
  }

  return result;
}

// ============================================================
// 睡眠聚合
// ============================================================

/** 从睡眠阶段事件构建 SleepData */
function aggregateSleep(events: DeviceEvent[], date: string): SleepData | undefined {
  const stageEvents = events
    .filter((e) => e.metric === 'sleepStage' && typeof e.value === 'string')
    .sort((a, b) => a.measuredAt.localeCompare(b.measuredAt));

  if (stageEvents.length < 2) return undefined;

  // 计算各阶段持续时间
  const stages: SleepStages = { deep: 0, light: 0, rem: 0, awake: 0 };
  let totalMinutes = 0;

  for (let i = 0; i < stageEvents.length - 1; i++) {
    const current = stageEvents[i]!;
    const next = stageEvents[i + 1]!;
    const duration = diffMinutes(current.measuredAt, next.measuredAt);
    const stage = current.value as string;
    if (stage in stages) {
      stages[stage as keyof SleepStages] += duration;
    }
    totalMinutes += duration;
  }

  // 最后一个阶段：假设持续到事件结束
  const lastStage = stageEvents[stageEvents.length - 1]!;
  const lastDuration = Math.min(
    diffMinutes(lastStage.measuredAt, events[events.length - 1]!.measuredAt),
    60, // 上限 60 分钟，避免无限延伸
  );
  if (typeof lastStage.value === 'string' && lastStage.value in stages) {
    stages[lastStage.value as keyof SleepStages] += lastDuration;
  }
  totalMinutes += lastDuration;

  if (totalMinutes === 0) return undefined;

  const startTime = stageEvents[0]!.measuredAt;
  const endTime = stageEvents[stageEvents.length - 1]!.measuredAt;

  // 计算睡眠得分（简化：基于 deep+rem 比例和总时长）
  const restfulMin = stages.deep + stages.rem;
  const restfulRatio = restfulMin / totalMinutes;
  const durationScore = Math.min(totalMinutes / 480, 1); // 8 小时为满分
  const score = Math.round(restfulRatio * 50 + durationScore * 50);

  return {
    totalMinutes,
    startTime,
    endTime,
    stages,
    score: Math.min(100, Math.max(0, score)),
  };
}

// ============================================================
// 活动聚合
// ============================================================

/** 从步数/卡路里等事件构建 ActivityData */
function aggregateActivity(events: DeviceEvent[]): ActivityData | undefined {
  const stepValues = extractNumericValues(events, 'steps');
  const motionValues = extractNumericValues(events, 'motion');

  if (stepValues.length === 0 && motionValues.length === 0) return undefined;

  // 步数：取最后一个值（因为是累积值）
  const steps = stepValues.length > 0 ? Math.max(...stepValues) : 0;

  // 活动分钟：motion > 3 的分钟数
  const activeMinutes = motionValues.filter((v) => v > 3).length;

  // 卡路里估算（简化公式：步数 * 0.04 + 活动分钟 * 3）
  const calories = Math.round(steps * 0.04 + activeMinutes * 3);

  // 距离估算（简化：步数 * 0.7m）
  const distanceKm = Math.round(steps * 0.0007 * 100) / 100;

  return { steps, calories, activeMinutes, distanceKm };
}

// ============================================================
// 血氧聚合
// ============================================================

/** 计算平均血氧值 */
function aggregateSpo2(events: DeviceEvent[]): number | undefined {
  const values = extractNumericValues(events, 'spo2');
  if (values.length === 0) return undefined;
  return Math.round(average(values));
}

// ============================================================
// 压力聚合
// ============================================================

/** 从心率和运动数据估算压力 */
function aggregateStress(events: DeviceEvent[]): StressData | undefined {
  const hrValues = extractNumericValues(events, 'heartRate');
  const motionValues = extractNumericValues(events, 'motion');

  if (hrValues.length === 0) return undefined;

  // 简化压力估算：基于心率变异性和运动强度
  const hrVariability = stdDev(hrValues);
  const avgMotion = average(motionValues);

  // 心率变异性高 + 低运动 = 低压力；心率稳定 + 高运动 = 中等压力
  const load = Math.round(
    Math.min(100, Math.max(0, 20 + hrVariability * 0.5 + avgMotion * 2)),
  );

  return { load };
}

// ============================================================
// 辅助工具
// ============================================================

/** 提取指定指标的数值列表 */
function extractNumericValues(
  events: DeviceEvent[],
  metric: string,
): number[] {
  return events
    .filter((e) => e.metric === metric && typeof e.value === 'number')
    .map((e) => e.value as number);
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

/** 计算两个时间戳之间的分钟差 */
function diffMinutes(start: string, end: string): number {
  const s = new Date(`${start}:00`);
  const e = new Date(`${end}:00`);
  return Math.round((e.getTime() - s.getTime()) / 60000);
}
