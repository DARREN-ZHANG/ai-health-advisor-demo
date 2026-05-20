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

/** 从 segment.params 提取 profile 基线值，供生成器统一使用 */
function extractBaselines(params: Record<string, number | string | boolean> | undefined) {
  const p = params ?? {};
  return {
    /** 静息心率基线（默认 56 bpm） */
    restingHr: typeof p._baselineRestingHr === 'number' ? p._baselineRestingHr : 56,
    /** HRV (RMSSD) 基线（默认 42 ms） */
    hrv: typeof p._baselineHrv === 'number' ? p._baselineHrv : 42,
    /** SpO2 基线（默认 96%） */
    spo2: typeof p._baselineSpo2 === 'number' ? p._baselineSpo2 : 96,
  };
}

// ============================================================
// 生成器: meal_intake（进餐）
// ============================================================

/** 进餐事件生成 */
function generateMealIntakeEvents(segment: ActivitySegment): DeviceEvent[] {
  const events: DeviceEvent[] = [];
  const totalMin = diffMinutes(segment.start, segment.end);
  const { restingHr, spo2: spo2Base } = extractBaselines(segment.params);
  let idx = 0;

  // wearState: 片段开始和结束
  events.push(makeEvent(segment, 0, 'wearState', true, idx++));
  events.push(makeEvent(segment, totalMin, 'wearState', false, idx++));

  for (let m = 0; m < totalMin; m += 1) {
    // heartRate: 静息 + 9 的进餐消化偏移，轻微上升后回落
    const hrBase = (restingHr + 9) + Math.min(m * 0.4, 15) - Math.max(0, (m - 20) * 0.3);
    const hr = rangeValue(Math.round(hrBase), 8, m, 1);
    events.push(makeEvent(segment, m, 'heartRate', hr, idx++));

    // steps: 每分钟，偶尔有少量步数（0-5）
    const stepsCumulative = Math.round(deterministic(2, m) * 5) > 3 ? 1 : 0;
    events.push(makeEvent(segment, m, 'steps', stepsCumulative, idx++));

    // motion: 每分钟，基于 IMU 采样聚合
    const imuSamples = generateImuSamples(MOTION_PATTERN_MAP[segment.type], m, totalMin, segment.segmentId.length + m);
    const motion = aggregateMotion(imuSamples);
    events.push(makeEvent(segment, m, 'motion', motion, idx++));

    // spo2: 每5分钟，进餐时略高于基线
    if (m % 5 === 0) {
      const spo2 = rangeValue(spo2Base + 1, 3, m, 4);
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
  const { restingHr, spo2: spo2Base } = extractBaselines(params);
  const targetHr = typeof params.targetHr === 'number' ? params.targetHr : restingHr + 79;
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
    // heartRate: 围绕目标心率小幅波动
    const hr = rangeValue(targetHr, 15, m, 10);
    events.push(makeEvent(segment, m, 'heartRate', hr, idx++));

    // steps: 累积步数
    cumulativeSteps += Math.round(stepsPerMin * (0.9 + deterministic(11, m) * 0.2));
    events.push(makeEvent(segment, m, 'steps', cumulativeSteps, idx++));

    // motion: 高运动强度，基于 IMU 采样聚合
    const imuSamples = generateImuSamples(MOTION_PATTERN_MAP[segment.type], m, totalMin, segment.segmentId.length + m);
    const motion = aggregateMotion(imuSamples);
    events.push(makeEvent(segment, m, 'motion', motion, idx++));

    // spo2: 每5分钟，运动时略低于基线
    if (m % 5 === 0) {
      const spo2 = rangeValue(spo2Base, 3, m, 13);
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
  const { restingHr, spo2: spo2Base } = extractBaselines(segment.params);
  let idx = 0;

  // wearState
  events.push(makeEvent(segment, 0, 'wearState', true, idx++));
  events.push(makeEvent(segment, totalMin, 'wearState', false, idx++));

  for (let m = 0; m < totalMin; m += 1) {
    // heartRate: 静息 + 8 的久坐偏移
    const hr = rangeValue(restingHr + 8, 8, m, 20);
    events.push(makeEvent(segment, m, 'heartRate', hr, idx++));

    // steps: 累积，几乎为零
    events.push(makeEvent(segment, m, 'steps', 0, idx++));

    // motion: 基于 IMU 采样聚合（静止状态）
    const imuSamples = generateImuSamples(MOTION_PATTERN_MAP[segment.type], m, totalMin, segment.segmentId.length + m);
    const motion = aggregateMotion(imuSamples);
    events.push(makeEvent(segment, m, 'motion', motion, idx++));

    // spo2: 每5分钟，久坐时略高于基线
    if (m % 5 === 0) {
      const spo2 = rangeValue(spo2Base + 1, 2, m, 22);
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
  const { restingHr, spo2: spo2Base } = extractBaselines(params);
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

    // heartRate: 活跃期 = 静息 + 94，休息期 = 静息 + 24
    const hrBase = isActive ? restingHr + 94 : restingHr + 24;
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

    // spo2: 每5分钟，活跃期略低于基线，休息期略高于基线
    if (m % 5 === 0) {
      const spo2 = isActive ? rangeValue(spo2Base - 1, 4, m, 35) : rangeValue(spo2Base + 1, 2, m, 36);
      events.push(makeEvent(segment, m, 'spo2', spo2, idx++));
    }
  }

  return events;
}

// ============================================================
// 生成器: strength_training（力量训练）
// ============================================================

/** 力量训练事件生成 — 组内高强度 + 长间歇休息，极低步数 */
function generateStrengthTrainingEvents(segment: ActivitySegment): DeviceEvent[] {
  const events: DeviceEvent[] = [];
  const totalMin = diffMinutes(segment.start, segment.end);
  const params = segment.params ?? {};
  const { restingHr, spo2: spo2Base } = extractBaselines(params);
  const setMinutes = typeof params.setMinutes === 'number' ? params.setMinutes : 1;
  const restMinutes = typeof params.restMinutes === 'number' ? params.restMinutes : 2;

  const cycleLength = setMinutes + restMinutes;
  let idx = 0;
  let cumulativeSteps = 0;

  // wearState
  events.push(makeEvent(segment, 0, 'wearState', true, idx++));
  events.push(makeEvent(segment, totalMin, 'wearState', false, idx++));

  for (let m = 0; m < totalMin; m += 1) {
    // 判断当前是在组内还是休息期
    const cyclePos = m % cycleLength;
    const isActive = cyclePos < setMinutes;

    // heartRate: 组内 restingHr + 84（高强度无氧），休息 restingHr + 34（不完全恢复）
    const hrBase = isActive ? restingHr + 84 : restingHr + 34;
    const hrRange = isActive ? 20 : 12;
    const hr = rangeValue(hrBase, hrRange, m, 40);
    events.push(makeEvent(segment, m, 'heartRate', hr, idx++));

    // steps: 极低步数 — 力量训练几乎原地不动
    const stepsDelta = isActive
      ? Math.round(deterministic(43, m) * 3)
      : Math.round(deterministic(44, m) * 2);
    cumulativeSteps += stepsDelta;
    events.push(makeEvent(segment, m, 'steps', cumulativeSteps, idx++));

    // motion: 基于 IMU 采样聚合（周期性手臂重复动作）
    const imuSamples = generateImuSamples(MOTION_PATTERN_MAP[segment.type], m, totalMin, segment.segmentId.length + m);
    const motion = aggregateMotion(imuSamples);
    events.push(makeEvent(segment, m, 'motion', motion, idx++));

    // spo2: 每5分钟，组内略低于基线（Valsalva 效应），休息时恢复
    if (m % 5 === 0) {
      const spo2 = isActive ? rangeValue(spo2Base - 2, 3, m, 45) : rangeValue(spo2Base, 2, m, 46);
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
  const { restingHr, spo2: spo2Base } = extractBaselines(params);
  const paceRaw = params.pace;
  const pace = paceRaw === 'slow' || paceRaw === 'brisk' ? paceRaw : 'moderate';

  // 配速影响步数和心率偏移
  const stepsPerMin = pace === 'slow' ? 60 : pace === 'brisk' ? 130 : 100;
  const hrOffset = pace === 'slow' ? 39 : pace === 'brisk' ? 54 : 44;

  let idx = 0;
  let cumulativeSteps = 0;

  // wearState
  events.push(makeEvent(segment, 0, 'wearState', true, idx++));
  events.push(makeEvent(segment, totalMin, 'wearState', false, idx++));

  for (let m = 0; m < totalMin; m += 1) {
    // heartRate: 静息 + 步行偏移
    const hr = rangeValue(restingHr + hrOffset, 15, m, 40);
    events.push(makeEvent(segment, m, 'heartRate', hr, idx++));

    // steps: 稳定累积
    const delta = Math.round(stepsPerMin * (0.9 + deterministic(41, m) * 0.2));
    cumulativeSteps += delta;
    events.push(makeEvent(segment, m, 'steps', cumulativeSteps, idx++));

    // motion: 中等强度，基于 IMU 采样聚合
    const imuSamples = generateImuSamples(MOTION_PATTERN_MAP[segment.type], m, totalMin, segment.segmentId.length + m);
    const motion = aggregateMotion(imuSamples);
    events.push(makeEvent(segment, m, 'motion', motion, idx++));

    // spo2: 每5分钟，步行时略高于基线
    if (m % 5 === 0) {
      const spo2 = rangeValue(spo2Base + 1, 3, m, 43);
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
  const { restingHr, spo2: spo2Base } = extractBaselines(params);
  const qualityRaw = params.quality;
  const quality = qualityRaw === 'good' || qualityRaw === 'poor' ? qualityRaw : 'fair';

  // 质量影响各阶段持续时间和心率偏移
  const stageDuration: Record<string, number> =
    quality === 'good'
      ? { light: 20, deep: 30, rem: 25, awake: 5 }
      : quality === 'poor'
        ? { light: 15, deep: 10, rem: 10, awake: 15 }
        : { light: 20, deep: 20, rem: 20, awake: 10 };

  const hrOffset = quality === 'good' ? -1 : quality === 'poor' ? 6 : 2;

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

    // heartRate: 静息 + 睡眠质量偏移 + 阶段偏移
    const stageHrOffset = currentStage === 'deep' ? -5 : currentStage === 'rem' ? 5 : currentStage === 'awake' ? 8 : 0;
    const hr = rangeValue(restingHr + hrOffset + stageHrOffset, 6, m, 50);
    events.push(makeEvent(segment, m, 'heartRate', hr, idx++));

    // steps: 无
    events.push(makeEvent(segment, m, 'steps', 0, idx++));

    // motion: 几乎无，基于 IMU 采样聚合（仰卧静止模式）
    const imuSamples = generateImuSamples(MOTION_PATTERN_MAP[segment.type], m, totalMin, segment.segmentId.length + m);
    const motion = aggregateMotion(imuSamples);
    events.push(makeEvent(segment, m, 'motion', motion, idx++));

    // spo2: 每5分钟，睡眠时接近基线
    if (m % 5 === 0) {
      const spo2 = rangeValue(spo2Base, 3, m, 53);
      events.push(makeEvent(segment, m, 'spo2', spo2, idx++));
    }
  }

  return events;
}

// ============================================================
// 生成器: nap（小憩，约 1 小时的短时恢复性睡眠）
// ============================================================

/** 小憩阶段序列：入睡 → 浅睡 → 少量深睡 → 浅睡 → 醒来 */
const NAP_STAGE_SEQUENCE: Array<'awake' | 'light' | 'deep'> = [
  'awake', 'light', 'deep', 'light', 'awake',
];

/** 小憩事件生成 */
function generateNapEvents(segment: ActivitySegment): DeviceEvent[] {
  const events: DeviceEvent[] = [];
  const totalMin = diffMinutes(segment.start, segment.end);
  let idx = 0;

  // 从 params 读取 profile 基线，回退到典型默认值
  const { restingHr: hrBase, hrv: hrvBase, spo2: spo2Base } = extractBaselines(segment.params);

  // 各阶段时长分配（总约 60 分钟）
  const stageDuration: Record<string, number> = {
    awake: 5,   // 入睡准备
    light: 20,  // 浅睡
    deep: 10,   // 短暂深睡
    // 第二次 light 占据剩余时间
  };

  // wearState
  events.push(makeEvent(segment, 0, 'wearState', true, idx++));
  events.push(makeEvent(segment, totalMin, 'wearState', false, idx++));

  // 初始 awake 阶段
  events.push(makeEvent(segment, 0, 'sleepStage', 'awake', idx++));
  let currentStage: string = 'awake';
  let stageTime = 0;
  let seqIdx = 0;

  for (let m = 1; m < totalMin; m += 1) {
    stageTime += 1;

    // 阶段切换逻辑
    let dur: number;
    if (seqIdx === NAP_STAGE_SEQUENCE.length - 2) {
      // 最后一个 light 阶段：占据剩余时间
      dur = totalMin - (stageDuration.awake ?? 5) - (stageDuration.light ?? 20) - (stageDuration.deep ?? 10) - (stageDuration.awake ?? 5);
    } else {
      dur = stageDuration[currentStage] ?? 10;
    }

    if (stageTime >= dur && seqIdx < NAP_STAGE_SEQUENCE.length - 1) {
      seqIdx += 1;
      currentStage = NAP_STAGE_SEQUENCE[seqIdx]!;
      stageTime = 0;
      events.push(makeEvent(segment, m, 'sleepStage', currentStage, idx++));
    }

    // 恢复进度（0→1）：越接近小憩末尾恢复效果越明显
    const recoveryProgress = m / totalMin;

    // heartRate: 深睡最低，浅睡略高，awake 最高
    const hrOffset = currentStage === 'deep' ? -4 : currentStage === 'awake' ? 6 : 0;
    const hr = rangeValue(hrBase + hrOffset, 5, m, 50);
    events.push(makeEvent(segment, m, 'heartRate', hr, idx++));

    // HRV: 入睡初期因压力略低，深睡期平稳，末段（恢复窗口）明显回升
    // 前 60% 维持基线附近，后 40% 逐渐回升 +8~15
    const hrvRecoveryBoost = recoveryProgress > 0.6
      ? Math.round((recoveryProgress - 0.6) / 0.4 * 12) // 末段回升 0→12
      : 0;
    const stageHrvOffset = currentStage === 'deep' ? -5 : currentStage === 'awake' ? -3 : 0;
    const hrv = rangeValue(hrvBase + stageHrvOffset + hrvRecoveryBoost, 6, m, 70);
    events.push(makeEvent(segment, m, 'hrvRmssd', hrv, idx++));

    // steps: 无
    events.push(makeEvent(segment, m, 'steps', 0, idx++));

    // motion: 几乎无（仰卧静止）
    const imuSamples = generateImuSamples(MOTION_PATTERN_MAP[segment.type], m, totalMin, segment.segmentId.length + m);
    const motion = aggregateMotion(imuSamples);
    events.push(makeEvent(segment, m, 'motion', motion, idx++));

    // SpO2: 末段因呼吸平稳、氧气充分微升（+1~2%）
    const spo2Boost = recoveryProgress > 0.5
      ? Math.round((recoveryProgress - 0.5) / 0.5 * 2) // 末段 +0→2
      : 0;
    if (m % 5 === 0) {
      const spo2 = rangeValue(spo2Base + spo2Boost, 1.5, m, 53);
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
  const { restingHr, spo2: spo2Base } = extractBaselines(segment.params);
  let idx = 0;

  events.push(makeEvent(segment, 0, 'wearState', true, idx++));
  events.push(makeEvent(segment, totalMin, 'wearState', false, idx++));

  for (let m = 0; m < totalMin; m += 1) {
    // heartRate: 静息 + 2 的专注偏移
    const hr = rangeValue(restingHr + 2, 8, m, 60);
    events.push(makeEvent(segment, m, 'heartRate', hr, idx++));
    events.push(makeEvent(segment, m, 'steps', 0, idx++));
    const imuSamples = generateImuSamples(MOTION_PATTERN_MAP[segment.type], m, totalMin, segment.segmentId.length + m);
    const motion = aggregateMotion(imuSamples);
    events.push(makeEvent(segment, m, 'motion', motion, idx++));
    // spo2: 专注时呼吸平稳，略高于基线
    if (m % 5 === 0) {
      const spo2 = rangeValue(spo2Base + 3, 2, m, 62);
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
  const { restingHr, spo2: spo2Base } = extractBaselines(params);
  const triggerRaw = params.trigger;
  const trigger = typeof triggerRaw === 'string' ? triggerRaw : 'work';
  // 焦虑 HR 偏移：social +34, panic +44, work +39
  const hrOffset = trigger === 'social' ? 34 : trigger === 'panic' ? 44 : 39;
  let idx = 0;

  events.push(makeEvent(segment, 0, 'wearState', true, idx++));
  events.push(makeEvent(segment, totalMin, 'wearState', false, idx++));

  for (let m = 0; m < totalMin; m += 1) {
    const progress = m / totalMin;
    const hrSpike = Math.sin(progress * Math.PI) * 12;
    const hr = rangeValue(Math.round(restingHr + hrOffset + hrSpike), 15, m, 70);
    events.push(makeEvent(segment, m, 'heartRate', hr, idx++));
    const steps = deterministic(71, m) > 0.7 ? Math.round(deterministic(72, m) * 5) : 0;
    events.push(makeEvent(segment, m, 'steps', steps, idx++));
    const imuSamples = generateImuSamples(MOTION_PATTERN_MAP[segment.type], m, totalMin, segment.segmentId.length + m);
    const motion = aggregateMotion(imuSamples);
    events.push(makeEvent(segment, m, 'motion', motion, idx++));
    if (m % 5 === 0) {
      const spo2 = rangeValue(spo2Base + 1, 2, m, 74);
      events.push(makeEvent(segment, m, 'spo2', spo2, idx++));
    }
  }
  return events;
}

// ============================================================
// 生成器: alcohol_intake（饮酒）
// ============================================================

/** 酒精剂量等级 */
type AlcoholAmount = 'light' | 'moderate' | 'heavy';

/** 酒精响应曲线因子（0~1，在指定时间点的目标响应强度）
 *  酒精吸收更快，达峰更早（30~60min），持续更长
 */
function alcoholResponseFactor(minuteOffset: number): number {
  if (minuteOffset <= 0) return 0;
  if (minuteOffset <= 20) return 0.3 * (minuteOffset / 20);
  if (minuteOffset <= 40) return 0.3 + 0.7 * ((minuteOffset - 20) / 20);
  if (minuteOffset <= 80) return 1.0;
  if (minuteOffset <= 120) return 1.0 - 0.4 * ((minuteOffset - 80) / 40);
  if (minuteOffset <= 180) return 0.6 - 0.4 * ((minuteOffset - 120) / 60);
  return 0;
}

/** 各剂量对应的生理响应范围（基于可穿戴真实世界研究 PMC5878366） */
const ALCOHOL_AMOUNT_RANGES: Record<AlcoholAmount, {
  hrDeltaMin: number; hrDeltaMax: number;
  rmssdDropMin: number; rmssdDropMax: number;
  stressDeltaMin: number; stressDeltaMax: number;
}> = {
  light: { hrDeltaMin: 2, hrDeltaMax: 5, rmssdDropMin: 2, rmssdDropMax: 5, stressDeltaMin: 3, stressDeltaMax: 7 },
  moderate: { hrDeltaMin: 4, hrDeltaMax: 9, rmssdDropMin: 5, rmssdDropMax: 12, stressDeltaMin: 7, stressDeltaMax: 15 },
  heavy: { hrDeltaMin: 7, hrDeltaMax: 15, rmssdDropMin: 10, rmssdDropMax: 20, stressDeltaMin: 15, stressDeltaMax: 25 },
};

/** 饮酒事件生成（5 分钟间隔，3 小时窗口） */
function generateAlcoholIntakeEvents(segment: ActivitySegment): DeviceEvent[] {
  const events: DeviceEvent[] = [];
  const totalMin = diffMinutes(segment.start, segment.end);
  const params = segment.params ?? {};
  const { restingHr, hrv: hrvBaseline, spo2: spo2Base } = extractBaselines(params);
  const amountRaw = params.amount;
  const amount: AlcoholAmount =
    amountRaw === 'light' || amountRaw === 'heavy' ? amountRaw : 'moderate';
  const ranges = ALCOHOL_AMOUNT_RANGES[amount];

  // HR 基线 = 静息 + 12（饮酒场景下基础心率略高）
  const hrBaseline = restingHr + 12;
  // stressLoad 基线：交感神经基线
  const stressBaseline = 25;

  let idx = 0;
  let cumulativeSteps = 0;

  events.push(makeEvent(segment, 0, 'wearState', true, idx++));
  events.push(makeEvent(segment, totalMin, 'wearState', false, idx++));

  // 5 分钟间隔生成
  for (let m = 5; m <= totalMin; m += 5) {
    const factor = alcoholResponseFactor(m);
    const d = deterministic(42, m);
    const noise = d * 0.3 + 0.85; // 0.85~1.15 的微噪声

    // HR：随 factor 上升（血管扩张后代偿性心率增快）
    const hrDelta = ranges.hrDeltaMin + (ranges.hrDeltaMax - ranges.hrDeltaMin) * factor;
    const hr = Math.round(hrBaseline + hrDelta * noise);
    events.push(makeEvent(segment, m, 'heartRate', hr, idx++));

    // RMSSD：随 factor 下降（副交感神经受抑制）——使用绝对值 drop（ms）
    const rmssdDrop = ranges.rmssdDropMin + (ranges.rmssdDropMax - ranges.rmssdDropMin) * factor;
    const rmssd = Math.round((hrvBaseline - rmssdDrop * noise) * 10) / 10;
    events.push(makeEvent(segment, m, 'hrvRmssd', Math.max(5, rmssd), idx++));

    // stressLoad：随 factor 上升（交感神经相对占优）
    const stressDelta = ranges.stressDeltaMin + (ranges.stressDeltaMax - ranges.stressDeltaMin) * factor;
    const stress = Math.round(stressBaseline + stressDelta * noise);
    events.push(makeEvent(segment, m, 'stressLoad', stress, idx++));

    // SpO2：稳定或轻微下降 ±1%
    const spo2Noise = deterministic(73, m) * 2 - 1; // -1~1
    const spo2 = Math.round(spo2Base + 1 + spo2Noise);
    events.push(makeEvent(segment, m, 'spo2', spo2, idx++));

    // motion：低活动 0.2~1.8（社交饮酒场景下以坐姿为主，略宽松于咖啡因）
    const motion = Math.round((0.2 + deterministic(91, m) * 1.6) * 100) / 100;
    events.push(makeEvent(segment, m, 'motion', motion, idx++));

    // steps：每 5 分钟 0~25 步（社交场景可能略有走动）
    const stepsDelta = Math.round(deterministic(17, m) * 25);
    cumulativeSteps += stepsDelta;
    events.push(makeEvent(segment, m, 'steps', cumulativeSteps, idx++));
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
  const { restingHr, spo2: spo2Base } = extractBaselines(segment.params);
  let idx = 0;

  events.push(makeEvent(segment, 0, 'wearState', true, idx++));
  events.push(makeEvent(segment, totalMin, 'wearState', false, idx++));

  for (let m = 0; m < totalMin; m += 1) {
    // heartRate: 静息 - 4（放松状态低于静息心率）
    const hr = rangeValue(restingHr - 4, 5, m, 110);
    events.push(makeEvent(segment, m, 'heartRate', hr, idx++));
    events.push(makeEvent(segment, m, 'steps', 0, idx++));
    const imuSamples = generateImuSamples(MOTION_PATTERN_MAP[segment.type], m, totalMin, segment.segmentId.length + m);
    const motion = aggregateMotion(imuSamples);
    events.push(makeEvent(segment, m, 'motion', motion, idx++));
    // spo2: 放松时呼吸深长，明显高于基线
    if (m % 5 === 0) {
      const spo2 = rangeValue(spo2Base + 3, 2, m, 112);
      events.push(makeEvent(segment, m, 'spo2', spo2, idx++));
    }
  }
  return events;
}

// ============================================================
// 生成器: caffeine_intake（咖啡因摄入）
// ============================================================

/** 咖啡因剂量等级 */
type CaffeineDose = 'light' | 'moderate' | 'high_or_sensitive';

/** 咖啡因响应曲线因子（0~1，在指定时间点的目标响应强度） */
function caffeineResponseFactor(minuteOffset: number): number {
  if (minuteOffset <= 0) return 0;
  if (minuteOffset <= 15) return 0.2 * (minuteOffset / 15);
  if (minuteOffset <= 45) return 0.2 + 0.8 * ((minuteOffset - 15) / 30);
  if (minuteOffset <= 75) return 1.0;
  if (minuteOffset <= 120) return 1.0 - 0.5 * ((minuteOffset - 75) / 45);
  if (minuteOffset <= 240) return 0.5 * (1 - (minuteOffset - 120) / 120);
  return 0;
}

/** 各剂量对应的生理响应范围 */
const CAFFEINE_DOSE_RANGES: Record<CaffeineDose, {
  hrDeltaMin: number; hrDeltaMax: number;
  rmssdDropMin: number; rmssdDropMax: number;
  stressDeltaMin: number; stressDeltaMax: number;
}> = {
  light: { hrDeltaMin: 5, hrDeltaMax: 8, rmssdDropMin: 0.08, rmssdDropMax: 0.15, stressDeltaMin: 5, stressDeltaMax: 10 },
  moderate: { hrDeltaMin: 8, hrDeltaMax: 14, rmssdDropMin: 0.15, rmssdDropMax: 0.30, stressDeltaMin: 10, stressDeltaMax: 20 },
  high_or_sensitive: { hrDeltaMin: 15, hrDeltaMax: 25, rmssdDropMin: 0.25, rmssdDropMax: 0.45, stressDeltaMin: 20, stressDeltaMax: 35 },
};

/** 咖啡因摄入事件生成（5 分钟间隔，4 小时窗口） */
function generateCaffeineIntakeEvents(segment: ActivitySegment): DeviceEvent[] {
  const events: DeviceEvent[] = [];
  const totalMin = diffMinutes(segment.start, segment.end);
  const params = segment.params ?? {};
  const { restingHr, hrv: hrvBaseline, spo2: spo2Base } = extractBaselines(params);
  const doseRaw = params.dose;
  const dose: CaffeineDose =
    doseRaw === 'light' || doseRaw === 'high_or_sensitive' ? doseRaw : 'moderate';
  const ranges = CAFFEINE_DOSE_RANGES[dose];

  // HR 基线 = 静息 + 12（咖啡因场景下基础心率略高）
  const hrBaseline = restingHr + 12;
  // stressLoad 基线：交感神经基线
  const stressBaseline = 25;

  let idx = 0;
  let cumulativeSteps = 0;

  events.push(makeEvent(segment, 0, 'wearState', true, idx++));
  events.push(makeEvent(segment, totalMin, 'wearState', false, idx++));

  // 在 m=0 生成基线事件（factor=0，真实基线值），供 detector 建立伪基线
  events.push(makeEvent(segment, 0, 'heartRate', hrBaseline, idx++));
  events.push(makeEvent(segment, 0, 'hrvRmssd', hrvBaseline, idx++));
  events.push(makeEvent(segment, 0, 'stressLoad', stressBaseline, idx++));
  events.push(makeEvent(segment, 0, 'spo2', spo2Base + 1, idx++));
  events.push(makeEvent(segment, 0, 'motion', 0.3, idx++));
  events.push(makeEvent(segment, 0, 'steps', 0, idx++));

  // 5 分钟间隔生成（factor 从 0 平滑上升，所有 delta 从 0 缩放到 peak）
  for (let m = 5; m <= totalMin; m += 5) {
    const factor = caffeineResponseFactor(m);
    const d = deterministic(42, m);
    const noise = d * 0.3 + 0.85; // 0.85~1.15 的微噪声

    // HR：从基线随 factor 线性上升至 peak
    const hrDelta = ranges.hrDeltaMax * factor;
    const hr = Math.round(hrBaseline + hrDelta * noise);
    events.push(makeEvent(segment, m, 'heartRate', hr, idx++));

    // RMSSD：从基线随 factor 线性下降至 peak drop
    const rmssdDrop = ranges.rmssdDropMax * factor;
    const rmssd = Math.round((hrvBaseline * (1 - rmssdDrop * noise)) * 10) / 10;
    events.push(makeEvent(segment, m, 'hrvRmssd', rmssd, idx++));

    // stressLoad：从基线随 factor 线性上升至 peak
    const stressDelta = ranges.stressDeltaMax * factor;
    const stress = Math.round(stressBaseline + stressDelta * noise);
    events.push(makeEvent(segment, m, 'stressLoad', stress, idx++));

    // SpO2：保持稳定 ±1%
    const spo2Noise = deterministic(73, m) * 2 - 1; // -1~1
    const spo2 = Math.round(spo2Base + 1 + spo2Noise);
    events.push(makeEvent(segment, m, 'spo2', spo2, idx++));

    // motion：低活动 0.2~1.5
    const motion = Math.round((0.2 + deterministic(91, m) * 1.3) * 100) / 100;
    events.push(makeEvent(segment, m, 'motion', motion, idx++));

    // steps：每 5 分钟 0~20 步
    const stepsDelta = Math.round(deterministic(17, m) * 20);
    cumulativeSteps += stepsDelta;
    events.push(makeEvent(segment, m, 'steps', cumulativeSteps, idx++));
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
  nap: generateNapEvents,
  deep_focus: generateDeepFocusEvents,
  anxiety_episode: generateAnxietyEpisodeEvents,
  alcohol_intake: generateAlcoholIntakeEvents,
  caffeine_intake: generateCaffeineIntakeEvents,
  relaxation: generateRelaxationEvents,
  strength_training: generateStrengthTrainingEvents,
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
  generateAlcoholIntakeEvents,
  generateCaffeineIntakeEvents,
  generateRelaxationEvents,
  generateStrengthTrainingEvents,
};
