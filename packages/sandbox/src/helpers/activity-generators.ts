import type {
  ActivitySegment,
  ActivitySegmentType,
  DeviceEvent,
  DeviceMetric,
} from '@health-advisor/shared';
import { generateImuSamples, aggregateMotion, MOTION_PATTERN_MAP } from './imu-generator';

// ============================================================
// 内部工具函数
// ============================================================

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

/** 计算两个时间戳之间的分钟差 */
function diffMinutes(start: string, end: string): number {
  const s = new Date(`${start}:00`);
  const e = new Date(`${end}:00`);
  return Math.round((e.getTime() - s.getTime()) / 60000);
}

/** 创建单个设备事件 */
function makeEvent(
  segment: ActivitySegment,
  minuteOffset: number,
  metric: DeviceMetric,
  value: number | string | boolean,
  index: number,
): DeviceEvent {
  return {
    eventId: `evt-${segment.segmentId}-${index}`,
    profileId: segment.profileId,
    measuredAt: addMinutes(segment.start, minuteOffset),
    metric,
    value,
    source: 'sensor',
    segmentId: segment.segmentId,
  };
}

/** 基于确定性计算的"伪随机"值（0~1 之间） */
function deterministic(seed: number, offset: number): number {
  // 用正弦函数产生确定性的伪随机分布
  const x = Math.sin(seed * 9301 + offset * 49297 + 233280) * 0.5 + 0.5;
  return x - Math.floor(x);
}

/** 基于范围和偏移计算确定性值 */
function rangeValue(
  base: number,
  range: number,
  minuteOffset: number,
  seed: number,
): number {
  const d = deterministic(seed, minuteOffset);
  return Math.round(base - range / 2 + d * range);
}

// ============================================================
// 生成器: meal_intake（进餐）
// ============================================================

/** 进餐事件生成 */
function generateMealIntakeEvents(segment: ActivitySegment): DeviceEvent[] {
  const events: DeviceEvent[] = [];
  const totalMin = diffMinutes(segment.start, segment.end);
  let idx = 0;

  // wearState: 片段开始和结束
  events.push(makeEvent(segment, 0, 'wearState', true, idx++));
  events.push(makeEvent(segment, totalMin, 'wearState', false, idx++));

  for (let m = 0; m < totalMin; m += 1) {
    // heartRate: 每分钟，65-85 之间，轻微上升后回落
    const hrBase = 65 + Math.min(m * 0.4, 15) - Math.max(0, (m - 20) * 0.3);
    const hr = rangeValue(Math.round(hrBase), 8, m, 1);
    events.push(makeEvent(segment, m, 'heartRate', hr, idx++));

    // steps: 每分钟，偶尔有少量步数（0-5）
    const stepsCumulative = Math.round(deterministic(2, m) * 5) > 3 ? 1 : 0;
    events.push(makeEvent(segment, m, 'steps', stepsCumulative, idx++));

    // motion: 每分钟，基于 IMU 采样聚合
    const imuSamples = generateImuSamples(MOTION_PATTERN_MAP[segment.type], m, totalMin, segment.segmentId.length + m);
    const motion = aggregateMotion(imuSamples);
    events.push(makeEvent(segment, m, 'motion', motion, idx++));

    // spo2: 每5分钟
    if (m % 5 === 0) {
      const spo2 = rangeValue(97, 3, m, 4);
      events.push(makeEvent(segment, m, 'spo2', spo2, idx++));
    }
  }

  return events;
}

// ============================================================
// 生成器: steady_cardio（稳态有氧）
// ============================================================

/** 稳态有氧事件生成 */
function generateSteadyCardioEvents(segment: ActivitySegment): DeviceEvent[] {
  const events: DeviceEvent[] = [];
  const totalMin = diffMinutes(segment.start, segment.end);
  const params = segment.params ?? {};
  const targetHr = typeof params.targetHr === 'number' ? params.targetHr : 135;
  const intensityRaw = params.intensity;
  const intensity = intensityRaw === 'low' || intensityRaw === 'high' ? intensityRaw : 'moderate';

  // 强度影响步数
  const stepsPerMin = intensity === 'low' ? 80 : intensity === 'high' ? 160 : 120;

  let idx = 0;
  let cumulativeSteps = 0;

  // wearState
  events.push(makeEvent(segment, 0, 'wearState', true, idx++));
  events.push(makeEvent(segment, totalMin, 'wearState', false, idx++));

  for (let m = 0; m < totalMin; m += 1) {
    // heartRate: 120-150，围绕目标心率小幅波动
    const hr = rangeValue(targetHr, 15, m, 10);
    events.push(makeEvent(segment, m, 'heartRate', hr, idx++));

    // steps: 累积步数
    cumulativeSteps += Math.round(stepsPerMin * (0.9 + deterministic(11, m) * 0.2));
    events.push(makeEvent(segment, m, 'steps', cumulativeSteps, idx++));

    // motion: 高运动强度，基于 IMU 采样聚合
    const imuSamples = generateImuSamples(MOTION_PATTERN_MAP[segment.type], m, totalMin, segment.segmentId.length + m);
    const motion = aggregateMotion(imuSamples);
    events.push(makeEvent(segment, m, 'motion', motion, idx++));

    // spo2: 每5分钟
    if (m % 5 === 0) {
      const spo2 = rangeValue(96, 3, m, 13);
      events.push(makeEvent(segment, m, 'spo2', spo2, idx++));
    }
  }

  return events;
}

// ============================================================
// 生成器: prolonged_sedentary（久坐）
// ============================================================

/** 久坐事件生成 */
function generateProlongedSedentaryEvents(segment: ActivitySegment): DeviceEvent[] {
  const events: DeviceEvent[] = [];
  const totalMin = diffMinutes(segment.start, segment.end);
  let idx = 0;

  // wearState
  events.push(makeEvent(segment, 0, 'wearState', true, idx++));
  events.push(makeEvent(segment, totalMin, 'wearState', false, idx++));

  for (let m = 0; m < totalMin; m += 1) {
    // heartRate: 60-70，非常低
    const hr = rangeValue(64, 8, m, 20);
    events.push(makeEvent(segment, m, 'heartRate', hr, idx++));

    // steps: 累积，几乎为零
    events.push(makeEvent(segment, m, 'steps', 0, idx++));

    // motion: 基于 IMU 采样聚合（静止状态）
    const imuSamples = generateImuSamples(MOTION_PATTERN_MAP[segment.type], m, totalMin, segment.segmentId.length + m);
    const motion = aggregateMotion(imuSamples);
    events.push(makeEvent(segment, m, 'motion', motion, idx++));

    // spo2: 每5分钟
    if (m % 5 === 0) {
      const spo2 = rangeValue(97, 2, m, 22);
      events.push(makeEvent(segment, m, 'spo2', spo2, idx++));
    }
  }

  return events;
}

// ============================================================
// 生成器: intermittent_exercise（间歇运动）
// ============================================================

/** 间歇运动事件生成 */
function generateIntermittentExerciseEvents(segment: ActivitySegment): DeviceEvent[] {
  const events: DeviceEvent[] = [];
  const totalMin = diffMinutes(segment.start, segment.end);
  const params = segment.params ?? {};
  const rounds = typeof params.rounds === 'number' ? params.rounds : 8;
  const activeMin = typeof params.activeMinutes === 'number' ? params.activeMinutes : 2;
  const restMin = typeof params.restMinutes === 'number' ? params.restMinutes : 1;

  const cycleLength = activeMin + restMin;
  let idx = 0;
  let cumulativeSteps = 0;

  // wearState
  events.push(makeEvent(segment, 0, 'wearState', true, idx++));
  events.push(makeEvent(segment, totalMin, 'wearState', false, idx++));

  for (let m = 0; m < totalMin; m += 1) {
    // 判断当前是在活跃期还是休息期
    const cyclePos = m % cycleLength;
    const isActive = cyclePos < activeMin;

    // heartRate: 活跃期高（130-170），休息期低（70-90）
    const hrBase = isActive ? 150 : 80;
    const hrRange = isActive ? 30 : 15;
    const hr = rangeValue(hrBase, hrRange, m, 30);
    events.push(makeEvent(segment, m, 'heartRate', hr, idx++));

    // steps: 活跃期大量步数，休息期少
    const stepsDelta = isActive
      ? Math.round(30 + deterministic(31, m) * 40)
      : Math.round(deterministic(32, m) * 5);
    cumulativeSteps += stepsDelta;
    events.push(makeEvent(segment, m, 'steps', cumulativeSteps, idx++));

    // motion: 基于 IMU 采样聚合（间歇爆发模式内部处理活跃/休息）
    const imuSamples = generateImuSamples(MOTION_PATTERN_MAP[segment.type], m, totalMin, segment.segmentId.length + m);
    const motion = aggregateMotion(imuSamples);
    events.push(makeEvent(segment, m, 'motion', motion, idx++));

    // spo2: 每5分钟
    if (m % 5 === 0) {
      const spo2 = isActive ? rangeValue(95, 4, m, 35) : rangeValue(97, 2, m, 36);
      events.push(makeEvent(segment, m, 'spo2', spo2, idx++));
    }
  }

  return events;
}

// ============================================================
// 生成器: walk（步行）
// ============================================================

/** 步行事件生成 */
function generateWalkEvents(segment: ActivitySegment): DeviceEvent[] {
  const events: DeviceEvent[] = [];
  const totalMin = diffMinutes(segment.start, segment.end);
  const params = segment.params ?? {};
  const paceRaw = params.pace;
  const pace = paceRaw === 'slow' || paceRaw === 'brisk' ? paceRaw : 'moderate';

  // 配速影响步数和心率
  const stepsPerMin = pace === 'slow' ? 60 : pace === 'brisk' ? 130 : 100;
  const hrTarget = pace === 'slow' ? 95 : pace === 'brisk' ? 110 : 100;

  let idx = 0;
  let cumulativeSteps = 0;

  // wearState
  events.push(makeEvent(segment, 0, 'wearState', true, idx++));
  events.push(makeEvent(segment, totalMin, 'wearState', false, idx++));

  for (let m = 0; m < totalMin; m += 1) {
    // heartRate: 90-110 之间
    const hr = rangeValue(hrTarget, 15, m, 40);
    events.push(makeEvent(segment, m, 'heartRate', hr, idx++));

    // steps: 稳定累积
    const delta = Math.round(stepsPerMin * (0.9 + deterministic(41, m) * 0.2));
    cumulativeSteps += delta;
    events.push(makeEvent(segment, m, 'steps', cumulativeSteps, idx++));

    // motion: 中等强度，基于 IMU 采样聚合
    const imuSamples = generateImuSamples(MOTION_PATTERN_MAP[segment.type], m, totalMin, segment.segmentId.length + m);
    const motion = aggregateMotion(imuSamples);
    events.push(makeEvent(segment, m, 'motion', motion, idx++));

    // spo2: 每5分钟
    if (m % 5 === 0) {
      const spo2 = rangeValue(97, 3, m, 43);
      events.push(makeEvent(segment, m, 'spo2', spo2, idx++));
    }
  }

  return events;
}

// ============================================================
// 生成器: sleep（睡眠）
// ============================================================

/** 睡眠阶段序列（确定性循环模式） */
const SLEEP_STAGE_CYCLE: Array<'light' | 'deep' | 'rem' | 'awake'> = [
  'light', 'deep', 'light', 'rem',
];

/** 睡眠事件生成 */
function generateSleepEvents(segment: ActivitySegment): DeviceEvent[] {
  const events: DeviceEvent[] = [];
  const totalMin = diffMinutes(segment.start, segment.end);
  const params = segment.params ?? {};
  const qualityRaw = params.quality;
  const quality = qualityRaw === 'good' || qualityRaw === 'poor' ? qualityRaw : 'fair';

  // 质量影响各阶段持续时间和心率基线
  const stageDuration: Record<string, number> =
    quality === 'good'
      ? { light: 20, deep: 30, rem: 25, awake: 5 }
      : quality === 'poor'
        ? { light: 15, deep: 10, rem: 10, awake: 15 }
        : { light: 20, deep: 20, rem: 20, awake: 10 };

  const hrBase = quality === 'good' ? 55 : quality === 'poor' ? 62 : 58;

  let idx = 0;
  let stageTime = 0;
  let cycleIdx = 0;
  let currentStage: string = 'awake';

  // wearState
  events.push(makeEvent(segment, 0, 'wearState', true, idx++));
  events.push(makeEvent(segment, totalMin, 'wearState', false, idx++));

  // 睡眠开始时记录第一个阶段
  events.push(makeEvent(segment, 0, 'sleepStage', 'awake', idx++));
  currentStage = 'awake';
  stageTime = 0;

  // 根据质量确定初始 awake 时长
  const initialAwakeDuration = quality === 'poor' ? 15 : 5;

  for (let m = 1; m < totalMin; m += 1) {
    stageTime += 1;

    // 检查是否需要切换阶段
    const isInitialAwake = m <= initialAwakeDuration && cycleIdx === 0;
    let shouldTransition = false;

    if (isInitialAwake) {
      // 入睡前的 awake 期
      if (stageTime >= initialAwakeDuration) {
        shouldTransition = true;
      }
    } else {
      // 正常阶段轮转
      const stageDur = stageDuration[currentStage] ?? 20;
      if (stageTime >= stageDur) {
        shouldTransition = true;
      }
    }

    if (shouldTransition) {
      // 切换到下一个阶段
      if (isInitialAwake) {
        currentStage = 'light';
      } else {
        const nextStage = SLEEP_STAGE_CYCLE[cycleIdx % SLEEP_STAGE_CYCLE.length]!;
        currentStage = nextStage;
        cycleIdx += 1;
      }
      stageTime = 0;
      events.push(makeEvent(segment, m, 'sleepStage', currentStage, idx++));
    }

    // heartRate: 基于当前阶段
    const hrOffset = currentStage === 'deep' ? -5 : currentStage === 'rem' ? 5 : currentStage === 'awake' ? 8 : 0;
    const hr = rangeValue(hrBase + hrOffset, 6, m, 50);
    events.push(makeEvent(segment, m, 'heartRate', hr, idx++));

    // steps: 无
    events.push(makeEvent(segment, m, 'steps', 0, idx++));

    // motion: 几乎无，基于 IMU 采样聚合（仰卧静止模式）
    const imuSamples = generateImuSamples(MOTION_PATTERN_MAP[segment.type], m, totalMin, segment.segmentId.length + m);
    const motion = aggregateMotion(imuSamples);
    events.push(makeEvent(segment, m, 'motion', motion, idx++));

    // spo2: 每5分钟
    if (m % 5 === 0) {
      const spo2 = rangeValue(96, 3, m, 53);
      events.push(makeEvent(segment, m, 'spo2', spo2, idx++));
    }
  }

  return events;
}

// ============================================================
// 生成器: deep_focus（深度专注）
// ============================================================

/** 深度专注事件生成 */
function generateDeepFocusEvents(segment: ActivitySegment): DeviceEvent[] {
  const events: DeviceEvent[] = [];
  const totalMin = diffMinutes(segment.start, segment.end);
  let idx = 0;

  events.push(makeEvent(segment, 0, 'wearState', true, idx++));
  events.push(makeEvent(segment, totalMin, 'wearState', false, idx++));

  for (let m = 0; m < totalMin; m += 1) {
    const hr = rangeValue(58, 8, m, 60);
    events.push(makeEvent(segment, m, 'heartRate', hr, idx++));
    events.push(makeEvent(segment, m, 'steps', 0, idx++));
    const imuSamples = generateImuSamples(MOTION_PATTERN_MAP[segment.type], m, totalMin, segment.segmentId.length + m);
    const motion = aggregateMotion(imuSamples);
    events.push(makeEvent(segment, m, 'motion', motion, idx++));
    if (m % 5 === 0) {
      const spo2 = rangeValue(99, 2, m, 62);
      events.push(makeEvent(segment, m, 'spo2', spo2, idx++));
    }
  }
  return events;
}

// ============================================================
// 生成器: anxiety_episode（焦虑发作）
// ============================================================

/** 焦虑发作事件生成 */
function generateAnxietyEpisodeEvents(segment: ActivitySegment): DeviceEvent[] {
  const events: DeviceEvent[] = [];
  const totalMin = diffMinutes(segment.start, segment.end);
  const params = segment.params ?? {};
  const triggerRaw = params.trigger;
  const trigger = typeof triggerRaw === 'string' ? triggerRaw : 'work';
  const hrBase = trigger === 'social' ? 90 : trigger === 'panic' ? 100 : 95;
  let idx = 0;

  events.push(makeEvent(segment, 0, 'wearState', true, idx++));
  events.push(makeEvent(segment, totalMin, 'wearState', false, idx++));

  for (let m = 0; m < totalMin; m += 1) {
    const progress = m / totalMin;
    const hrSpike = Math.sin(progress * Math.PI) * 12;
    const hr = rangeValue(Math.round(hrBase + hrSpike), 15, m, 70);
    events.push(makeEvent(segment, m, 'heartRate', hr, idx++));
    const steps = deterministic(71, m) > 0.7 ? Math.round(deterministic(72, m) * 5) : 0;
    events.push(makeEvent(segment, m, 'steps', steps, idx++));
    const imuSamples = generateImuSamples(MOTION_PATTERN_MAP[segment.type], m, totalMin, segment.segmentId.length + m);
    const motion = aggregateMotion(imuSamples);
    events.push(makeEvent(segment, m, 'motion', motion, idx++));
    if (m % 5 === 0) {
      const spo2 = rangeValue(97, 2, m, 74);
      events.push(makeEvent(segment, m, 'spo2', spo2, idx++));
    }
  }
  return events;
}

// ============================================================
// 生成器: breathing_pause（呼吸暂停）
// ============================================================

/** 呼吸暂停事件生成 */
function generateBreathingPauseEvents(segment: ActivitySegment): DeviceEvent[] {
  const events: DeviceEvent[] = [];
  const totalMin = diffMinutes(segment.start, segment.end);
  const params = segment.params ?? {};
  const severityRaw = params.severity;
  const severity = severityRaw === 'mild' || severityRaw === 'severe' ? severityRaw : 'moderate';
  const spo2Base = severity === 'severe' ? 86 : severity === 'mild' ? 91 : 89;
  let idx = 0;

  events.push(makeEvent(segment, 0, 'wearState', true, idx++));
  events.push(makeEvent(segment, totalMin, 'wearState', false, idx++));

  for (let m = 0; m < totalMin; m += 1) {
    const progress = m / totalMin;
    const spo2Drop = Math.sin(progress * Math.PI) * 8;
    const currentSpo2 = Math.round(spo2Base + 6 - spo2Drop);
    const hrBase = progress < 0.6 ? 65 : 90;
    const hr = rangeValue(Math.round(hrBase + (progress > 0.6 ? 10 : 0)), 12, m, 80);
    events.push(makeEvent(segment, m, 'heartRate', hr, idx++));
    events.push(makeEvent(segment, m, 'steps', 0, idx++));
    const imuSamples = generateImuSamples(MOTION_PATTERN_MAP[segment.type], m, totalMin, segment.segmentId.length + m);
    const motion = aggregateMotion(imuSamples);
    events.push(makeEvent(segment, m, 'motion', motion, idx++));
    events.push(makeEvent(segment, m, 'spo2', Math.max(82, currentSpo2), idx++));
  }
  return events;
}

// ============================================================
// 生成器: alcohol_intake（饮酒）
// ============================================================

/** 饮酒事件生成 */
function generateAlcoholIntakeEvents(segment: ActivitySegment): DeviceEvent[] {
  const events: DeviceEvent[] = [];
  const totalMin = diffMinutes(segment.start, segment.end);
  const params = segment.params ?? {};
  const amountRaw = params.amount;
  const amount = amountRaw === 'light' || amountRaw === 'heavy' ? amountRaw : 'moderate';
  const hrBase = amount === 'heavy' ? 95 : amount === 'light' ? 82 : 90;
  let idx = 0;
  let cumulativeSteps = 0;

  events.push(makeEvent(segment, 0, 'wearState', true, idx++));
  events.push(makeEvent(segment, totalMin, 'wearState', false, idx++));

  for (let m = 0; m < totalMin; m += 1) {
    const progress = m / totalMin;
    const hrElevation = progress * 8;
    const hr = rangeValue(Math.round(hrBase + hrElevation), 10, m, 90);
    events.push(makeEvent(segment, m, 'heartRate', hr, idx++));
    const stepsDelta = Math.round(deterministic(91, m) * 20);
    cumulativeSteps += stepsDelta;
    events.push(makeEvent(segment, m, 'steps', cumulativeSteps, idx++));
    const imuSamples = generateImuSamples(MOTION_PATTERN_MAP[segment.type], m, totalMin, segment.segmentId.length + m);
    const motion = aggregateMotion(imuSamples);
    events.push(makeEvent(segment, m, 'motion', motion, idx++));
    if (m % 5 === 0) {
      const spo2 = rangeValue(96, 4, m, 93);
      events.push(makeEvent(segment, m, 'spo2', spo2, idx++));
    }
  }
  return events;
}

// ============================================================
// 生成器: nightmare（噩梦）
// ============================================================

/** 噩梦事件生成 */
function generateNightmareEvents(segment: ActivitySegment): DeviceEvent[] {
  const events: DeviceEvent[] = [];
  const totalMin = diffMinutes(segment.start, segment.end);
  let idx = 0;

  events.push(makeEvent(segment, 0, 'wearState', true, idx++));
  events.push(makeEvent(segment, totalMin, 'wearState', false, idx++));

  for (let m = 0; m < totalMin; m += 1) {
    const progress = m / totalMin;
    const intensity = Math.sin(progress * Math.PI);
    const hr = rangeValue(Math.round(85 + intensity * 10), 10, m, 100);
    events.push(makeEvent(segment, m, 'heartRate', hr, idx++));
    events.push(makeEvent(segment, m, 'steps', 0, idx++));
    const imuSamples = generateImuSamples(MOTION_PATTERN_MAP[segment.type], m, totalMin, segment.segmentId.length + m);
    const motion = aggregateMotion(imuSamples);
    events.push(makeEvent(segment, m, 'motion', motion, idx++));
    if (m % 5 === 0) {
      const spo2 = rangeValue(96, 2, m, 103);
      events.push(makeEvent(segment, m, 'spo2', spo2, idx++));
    }
  }
  return events;
}

// ============================================================
// 生成器: relaxation（放松）
// ============================================================

/** 放松事件生成 */
function generateRelaxationEvents(segment: ActivitySegment): DeviceEvent[] {
  const events: DeviceEvent[] = [];
  const totalMin = diffMinutes(segment.start, segment.end);
  let idx = 0;

  events.push(makeEvent(segment, 0, 'wearState', true, idx++));
  events.push(makeEvent(segment, totalMin, 'wearState', false, idx++));

  for (let m = 0; m < totalMin; m += 1) {
    const hr = rangeValue(52, 5, m, 110);
    events.push(makeEvent(segment, m, 'heartRate', hr, idx++));
    events.push(makeEvent(segment, m, 'steps', 0, idx++));
    const imuSamples = generateImuSamples(MOTION_PATTERN_MAP[segment.type], m, totalMin, segment.segmentId.length + m);
    const motion = aggregateMotion(imuSamples);
    events.push(makeEvent(segment, m, 'motion', motion, idx++));
    if (m % 5 === 0) {
      const spo2 = rangeValue(99, 2, m, 112);
      events.push(makeEvent(segment, m, 'spo2', spo2, idx++));
    }
  }
  return events;
}

// ============================================================
// 公共调度函数
// ============================================================

/** 片段类型到生成器的映射 */
const GENERATOR_MAP: Record<ActivitySegmentType, (segment: ActivitySegment) => DeviceEvent[]> = {
  meal_intake: generateMealIntakeEvents,
  steady_cardio: generateSteadyCardioEvents,
  prolonged_sedentary: generateProlongedSedentaryEvents,
  intermittent_exercise: generateIntermittentExerciseEvents,
  walk: generateWalkEvents,
  sleep: generateSleepEvents,
  deep_focus: generateDeepFocusEvents,
  anxiety_episode: generateAnxietyEpisodeEvents,
  breathing_pause: generateBreathingPauseEvents,
  alcohol_intake: generateAlcoholIntakeEvents,
  nightmare: generateNightmareEvents,
  relaxation: generateRelaxationEvents,
};

/**
 * 根据片段类型自动分派到对应的事件生成器
 * 相同输入始终产生相同的输出（确定性生成）
 */
export function generateEventsForSegment(segment: ActivitySegment): DeviceEvent[] {
  const generator = GENERATOR_MAP[segment.type];
  if (!generator) {
    throw new Error(`不支持的活动片段类型: ${segment.type}`);
  }
  return generator(segment);
}

// 导出各生成器供单独使用
export {
  generateMealIntakeEvents,
  generateSteadyCardioEvents,
  generateProlongedSedentaryEvents,
  generateIntermittentExerciseEvents,
  generateWalkEvents,
  generateSleepEvents,
  generateDeepFocusEvents,
  generateAnxietyEpisodeEvents,
  generateBreathingPauseEvents,
  generateAlcoholIntakeEvents,
  generateNightmareEvents,
  generateRelaxationEvents,
};
