import type { DeviceEvent, MicroEventParams, MicroEventType } from '@health-advisor/shared';
import { generateImuSamples, aggregateMotion } from './imu-generator';

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
  segment: MicroEventSegment,
  minuteOffset: number,
  metric: DeviceEvent['metric'],
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

/** 从 segment.params 提取 profile 基线值 */
function extractBaselines(params: MicroEventParams | undefined) {
  const p = params ?? {};
  return {
    restingHr: typeof p._baselineRestingHr === 'number' ? p._baselineRestingHr : 56,
    hrv: typeof p._baselineHrv === 'number' ? p._baselineHrv : 42,
    spo2: typeof p._baselineSpo2 === 'number' ? p._baselineSpo2 : 96,
  };
}

// ============================================================
// 类型与运动模式映射
// ============================================================

export interface MicroEventSegment {
  segmentId: string;
  profileId: string;
  type: MicroEventType;
  start: string;
  end: string;
  params?: MicroEventParams;
}

/** 微事件类型到 MotionPattern 的映射（用于 IMU 生成） */
const MICRO_MOTION_PATTERN_MAP: Record<MicroEventType, import('@health-advisor/shared').MotionPattern> = {
  micro_deep_breathing: 'still_upright',
  micro_short_walk: 'periodic_walk',
  micro_post_meal_walk: 'periodic_stroll',
  micro_post_workout_slow_walk: 'periodic_stroll',
  micro_standing_stretch: 'intermittent_reach',
  micro_desk_mobility: 'intermittent_gesture',
  micro_offscreen_eye_rest: 'still_supine',
  micro_window_gaze_walk: 'periodic_stroll',
  micro_pre_workout_snack: 'still_with_micro',
  micro_post_workout_snack: 'still_with_micro',
  micro_easy_cardio: 'periodic_brisk',
  micro_restorative_stretch: 'intermittent_reach',
  micro_low_stimulus_work: 'still_upright',
  micro_sleep_wind_down: 'still_supine',
  // === R1 ===
  micro_box_breathing: 'still_upright',
  micro_calming_breathing: 'still_upright',
  micro_hydration_walk: 'periodic_stroll',
  micro_warm_shower: 'still_upright',
  micro_posture_correction: 'still_upright',
  micro_neuro_warmup: 'intermittent_gesture',
  // === R2 ===
  micro_recovery_meal: 'still_with_micro',
  micro_power_nap: 'still_supine',
  micro_screen_dimming: 'still_supine',
  micro_cool_shower: 'still_upright',
  micro_outdoor_breather: 'periodic_walk',
  micro_stair_climb: 'periodic_brisk',
  // === R3 ===
  micro_standing_work: 'still_upright',
  micro_foam_rolling: 'intermittent_reach',
  micro_cold_face_dip: 'still_with_micro',
  micro_mindfulness_meditation: 'still_supine',
  micro_muscle_relaxation: 'still_supine',
  micro_light_meal: 'still_with_micro',
};

// ============================================================
// 各 profile 生成器
// ============================================================

/** deep_breathing: low motion, zero steps, HR decreases 4-8 bpm, HRV increases 4-10 ms, stress decreases */
function generateDeepBreathing(segment: MicroEventSegment): DeviceEvent[] {
  const events: DeviceEvent[] = [];
  const totalMin = diffMinutes(segment.start, segment.end);
  const { restingHr, hrv } = extractBaselines(segment.params);
  let idx = 0;

  for (let m = 0; m < totalMin; m += 1) {
    const progress = m / Math.max(totalMin - 1, 1);
    const hrDrop = 4 + progress * 4; // 4 → 8
    const hr = rangeValue(Math.round(restingHr - hrDrop), 4, m, 1);
    events.push(makeEvent(segment, m, 'heartRate', hr, idx++));

    const hrvRise = 4 + progress * 6; // 4 → 10
    const hrvVal = rangeValue(Math.round(hrv + hrvRise), 4, m, 2);
    events.push(makeEvent(segment, m, 'hrvRmssd', hrvVal, idx++));

    events.push(makeEvent(segment, m, 'steps', 0, idx++));

    const imuSamples = generateImuSamples(MICRO_MOTION_PATTERN_MAP[segment.type], m, totalMin, segment.segmentId.length + m);
    const motion = aggregateMotion(imuSamples);
    events.push(makeEvent(segment, m, 'motion', motion, idx++));

    const stressDrop = progress * 8;
    const stress = rangeValue(Math.round(30 - stressDrop), 3, m, 3);
    events.push(makeEvent(segment, m, 'stressLoad', stress, idx++));
  }

  return events;
}

/** short_walk: cumulative steps 250-500 for 5 minutes, motion elevated, HR rises modestly then trends down */
function generateShortWalk(segment: MicroEventSegment): DeviceEvent[] {
  const events: DeviceEvent[] = [];
  const totalMin = diffMinutes(segment.start, segment.end);
  const { restingHr } = extractBaselines(segment.params);
  let idx = 0;
  let cumulativeSteps = 0;

  for (let m = 0; m < totalMin; m += 1) {
    const progress = m / Math.max(totalMin - 1, 1);
    const hrRise = 10 + Math.sin(progress * Math.PI) * 8 - progress * 6;
    const hr = rangeValue(Math.round(restingHr + hrRise), 10, m, 10);
    events.push(makeEvent(segment, m, 'heartRate', hr, idx++));

    const stepsDelta = Math.round(50 + deterministic(11, m) * 50);
    cumulativeSteps += stepsDelta;
    events.push(makeEvent(segment, m, 'steps', cumulativeSteps, idx++));

    const imuSamples = generateImuSamples(MICRO_MOTION_PATTERN_MAP[segment.type], m, totalMin, segment.segmentId.length + m);
    const motion = aggregateMotion(imuSamples);
    events.push(makeEvent(segment, m, 'motion', motion, idx++));
  }

  return events;
}

/** post_meal_walk: cumulative steps 250-450, HR stable in light range, HRV mildly compressed */
function generatePostMealWalk(segment: MicroEventSegment): DeviceEvent[] {
  const events: DeviceEvent[] = [];
  const totalMin = diffMinutes(segment.start, segment.end);
  const { restingHr, hrv } = extractBaselines(segment.params);
  let idx = 0;
  let cumulativeSteps = 0;

  for (let m = 0; m < totalMin; m += 1) {
    const hr = rangeValue(restingHr + 18, 8, m, 20);
    events.push(makeEvent(segment, m, 'heartRate', hr, idx++));

    const hrvVal = rangeValue(hrv - 4, 6, m, 21);
    events.push(makeEvent(segment, m, 'hrvRmssd', hrvVal, idx++));

    const stepsDelta = Math.round(50 + deterministic(22, m) * 40);
    cumulativeSteps += stepsDelta;
    events.push(makeEvent(segment, m, 'steps', cumulativeSteps, idx++));

    const imuSamples = generateImuSamples(MICRO_MOTION_PATTERN_MAP[segment.type], m, totalMin, segment.segmentId.length + m);
    const motion = aggregateMotion(imuSamples);
    events.push(makeEvent(segment, m, 'motion', motion, idx++));
  }

  return events;
}

/** post_workout_slow_walk: cumulative steps 350-700, HR starts above baseline and declines each minute */
function generatePostWorkoutSlowWalk(segment: MicroEventSegment): DeviceEvent[] {
  const events: DeviceEvent[] = [];
  const totalMin = diffMinutes(segment.start, segment.end);
  const { restingHr } = extractBaselines(segment.params);
  let idx = 0;
  let cumulativeSteps = 0;

  for (let m = 0; m < totalMin; m += 1) {
    const progress = m / Math.max(totalMin - 1, 1);
    const hrStart = restingHr + 35;
    const hrDecline = progress * 25;
    const hr = rangeValue(Math.round(hrStart - hrDecline), 8, m, 30);
    events.push(makeEvent(segment, m, 'heartRate', hr, idx++));

    const stepsDelta = Math.round(45 + deterministic(31, m) * 45);
    cumulativeSteps += stepsDelta;
    events.push(makeEvent(segment, m, 'steps', cumulativeSteps, idx++));

    const imuSamples = generateImuSamples(MICRO_MOTION_PATTERN_MAP[segment.type], m, totalMin, segment.segmentId.length + m);
    const motion = aggregateMotion(imuSamples);
    events.push(makeEvent(segment, m, 'motion', motion, idx++));
  }

  return events;
}

/** standing_stretch: very low steps, light motion, HR small movement, stress mild decline */
function generateStandingStretch(segment: MicroEventSegment): DeviceEvent[] {
  const events: DeviceEvent[] = [];
  const totalMin = diffMinutes(segment.start, segment.end);
  const { restingHr } = extractBaselines(segment.params);
  let idx = 0;
  let cumulativeSteps = 0;

  for (let m = 0; m < totalMin; m += 1) {
    const hr = rangeValue(restingHr + 5, 6, m, 40);
    events.push(makeEvent(segment, m, 'heartRate', hr, idx++));

    const stepsDelta = deterministic(41, m) > 0.7 ? 1 : 0;
    cumulativeSteps += stepsDelta;
    events.push(makeEvent(segment, m, 'steps', cumulativeSteps, idx++));

    const imuSamples = generateImuSamples(MICRO_MOTION_PATTERN_MAP[segment.type], m, totalMin, segment.segmentId.length + m);
    const motion = aggregateMotion(imuSamples);
    events.push(makeEvent(segment, m, 'motion', motion, idx++));

    const progress = m / Math.max(totalMin - 1, 1);
    const stress = rangeValue(Math.round(28 - progress * 5), 3, m, 42);
    events.push(makeEvent(segment, m, 'stressLoad', stress, idx++));
  }

  return events;
}

/** desk_mobility: very low steps, light motion, HR small movement, stress mild decline */
function generateDeskMobility(segment: MicroEventSegment): DeviceEvent[] {
  const events: DeviceEvent[] = [];
  const totalMin = diffMinutes(segment.start, segment.end);
  const { restingHr } = extractBaselines(segment.params);
  let idx = 0;
  let cumulativeSteps = 0;

  for (let m = 0; m < totalMin; m += 1) {
    const hr = rangeValue(restingHr + 3, 5, m, 50);
    events.push(makeEvent(segment, m, 'heartRate', hr, idx++));

    const stepsDelta = deterministic(51, m) > 0.8 ? 1 : 0;
    cumulativeSteps += stepsDelta;
    events.push(makeEvent(segment, m, 'steps', cumulativeSteps, idx++));

    const imuSamples = generateImuSamples(MICRO_MOTION_PATTERN_MAP[segment.type], m, totalMin, segment.segmentId.length + m);
    const motion = aggregateMotion(imuSamples);
    events.push(makeEvent(segment, m, 'motion', motion, idx++));

    const progress = m / Math.max(totalMin - 1, 1);
    const stress = rangeValue(Math.round(26 - progress * 4), 3, m, 52);
    events.push(makeEvent(segment, m, 'stressLoad', stress, idx++));
  }

  return events;
}

/** offscreen_rest: zero steps, low motion, HR and stress decline, HRV mild recovery */
function generateOffscreenRest(segment: MicroEventSegment): DeviceEvent[] {
  const events: DeviceEvent[] = [];
  const totalMin = diffMinutes(segment.start, segment.end);
  const { restingHr, hrv } = extractBaselines(segment.params);
  let idx = 0;

  for (let m = 0; m < totalMin; m += 1) {
    const progress = m / Math.max(totalMin - 1, 1);
    const hrDrop = progress * 6;
    const hr = rangeValue(Math.round(restingHr - hrDrop), 4, m, 60);
    events.push(makeEvent(segment, m, 'heartRate', hr, idx++));

    const hrvRise = progress * 5;
    const hrvVal = rangeValue(Math.round(hrv + hrvRise), 4, m, 61);
    events.push(makeEvent(segment, m, 'hrvRmssd', hrvVal, idx++));

    events.push(makeEvent(segment, m, 'steps', 0, idx++));

    const imuSamples = generateImuSamples(MICRO_MOTION_PATTERN_MAP[segment.type], m, totalMin, segment.segmentId.length + m);
    const motion = aggregateMotion(imuSamples);
    events.push(makeEvent(segment, m, 'motion', motion, idx++));

    const stressDrop = progress * 8;
    const stress = rangeValue(Math.round(28 - stressDrop), 3, m, 62);
    events.push(makeEvent(segment, m, 'stressLoad', stress, idx++));
  }

  return events;
}

/** window_gaze_walk: 60-160 steps in first 1-2 minutes, then low motion and stress decline */
function generateWindowGazeWalk(segment: MicroEventSegment): DeviceEvent[] {
  const events: DeviceEvent[] = [];
  const totalMin = diffMinutes(segment.start, segment.end);
  const { restingHr } = extractBaselines(segment.params);
  let idx = 0;
  let cumulativeSteps = 0;

  for (let m = 0; m < totalMin; m += 1) {
    const isMoving = m < 2;
    const stepsDelta = isMoving ? Math.round(30 + deterministic(70, m) * 50) : 0;
    cumulativeSteps += stepsDelta;
    events.push(makeEvent(segment, m, 'steps', cumulativeSteps, idx++));

    const hr = rangeValue(restingHr + (isMoving ? 8 : 2), 5, m, 71);
    events.push(makeEvent(segment, m, 'heartRate', hr, idx++));

    const imuSamples = generateImuSamples(MICRO_MOTION_PATTERN_MAP[segment.type], m, totalMin, segment.segmentId.length + m);
    const motion = aggregateMotion(imuSamples);
    events.push(makeEvent(segment, m, 'motion', motion, idx++));

    const progress = m / Math.max(totalMin - 1, 1);
    const stress = rangeValue(Math.round(25 - progress * 7), 3, m, 72);
    events.push(makeEvent(segment, m, 'stressLoad', stress, idx++));
  }

  return events;
}

/** snack: low motion, small HR rise, HRV mild compression; do not claim exact food type */
function generateSnack(segment: MicroEventSegment): DeviceEvent[] {
  const events: DeviceEvent[] = [];
  const totalMin = diffMinutes(segment.start, segment.end);
  const { restingHr, hrv } = extractBaselines(segment.params);
  let idx = 0;
  let cumulativeSteps = 0;

  for (let m = 0; m < totalMin; m += 1) {
    const progress = m / Math.max(totalMin - 1, 1);
    const hrRise = Math.sin(progress * Math.PI) * 6;
    const hr = rangeValue(Math.round(restingHr + 4 + hrRise), 6, m, 80);
    events.push(makeEvent(segment, m, 'heartRate', hr, idx++));

    const hrvVal = rangeValue(hrv - 3, 5, m, 81);
    events.push(makeEvent(segment, m, 'hrvRmssd', hrvVal, idx++));

    const stepsDelta = deterministic(82, m) > 0.8 ? 1 : 0;
    cumulativeSteps += stepsDelta;
    events.push(makeEvent(segment, m, 'steps', cumulativeSteps, idx++));

    const imuSamples = generateImuSamples(MICRO_MOTION_PATTERN_MAP[segment.type], m, totalMin, segment.segmentId.length + m);
    const motion = aggregateMotion(imuSamples);
    events.push(makeEvent(segment, m, 'motion', motion, idx++));
  }

  return events;
}

/** easy_cardio: moderate steps/motion and HR in a low exercise band */
function generateEasyCardio(segment: MicroEventSegment): DeviceEvent[] {
  const events: DeviceEvent[] = [];
  const totalMin = diffMinutes(segment.start, segment.end);
  const { restingHr } = extractBaselines(segment.params);
  let idx = 0;
  let cumulativeSteps = 0;

  for (let m = 0; m < totalMin; m += 1) {
    const hr = rangeValue(restingHr + 35, 12, m, 90);
    events.push(makeEvent(segment, m, 'heartRate', hr, idx++));

    const stepsDelta = Math.round(60 + deterministic(91, m) * 40);
    cumulativeSteps += stepsDelta;
    events.push(makeEvent(segment, m, 'steps', cumulativeSteps, idx++));

    const imuSamples = generateImuSamples(MICRO_MOTION_PATTERN_MAP[segment.type], m, totalMin, segment.segmentId.length + m);
    const motion = aggregateMotion(imuSamples);
    events.push(makeEvent(segment, m, 'motion', motion, idx++));
  }

  return events;
}

/** restorative_stretch: low steps, light-to-moderate motion, HR low fluctuation, stress decline */
function generateRestorativeStretch(segment: MicroEventSegment): DeviceEvent[] {
  const events: DeviceEvent[] = [];
  const totalMin = diffMinutes(segment.start, segment.end);
  const { restingHr } = extractBaselines(segment.params);
  let idx = 0;
  let cumulativeSteps = 0;

  for (let m = 0; m < totalMin; m += 1) {
    const hr = rangeValue(restingHr + 4, 5, m, 100);
    events.push(makeEvent(segment, m, 'heartRate', hr, idx++));

    const stepsDelta = deterministic(101, m) > 0.75 ? 1 : 0;
    cumulativeSteps += stepsDelta;
    events.push(makeEvent(segment, m, 'steps', cumulativeSteps, idx++));

    const imuSamples = generateImuSamples(MICRO_MOTION_PATTERN_MAP[segment.type], m, totalMin, segment.segmentId.length + m);
    const motion = aggregateMotion(imuSamples);
    events.push(makeEvent(segment, m, 'motion', motion, idx++));

    const progress = m / Math.max(totalMin - 1, 1);
    const stress = rangeValue(Math.round(27 - progress * 8), 3, m, 102);
    events.push(makeEvent(segment, m, 'stressLoad', stress, idx++));
  }

  return events;
}

/** low_stimulus: low motion, zero or near-zero steps, HR/stress gradual decline */
function generateLowStimulus(segment: MicroEventSegment): DeviceEvent[] {
  const events: DeviceEvent[] = [];
  const totalMin = diffMinutes(segment.start, segment.end);
  const { restingHr } = extractBaselines(segment.params);
  let idx = 0;
  let cumulativeSteps = 0;

  for (let m = 0; m < totalMin; m += 1) {
    const progress = m / Math.max(totalMin - 1, 1);
    const hrDrop = progress * 5;
    const hr = rangeValue(Math.round(restingHr + 2 - hrDrop), 4, m, 110);
    events.push(makeEvent(segment, m, 'heartRate', hr, idx++));

    const stepsDelta = deterministic(111, m) > 0.9 ? 1 : 0;
    cumulativeSteps += stepsDelta;
    events.push(makeEvent(segment, m, 'steps', cumulativeSteps, idx++));

    const imuSamples = generateImuSamples(MICRO_MOTION_PATTERN_MAP[segment.type], m, totalMin, segment.segmentId.length + m);
    const motion = aggregateMotion(imuSamples);
    events.push(makeEvent(segment, m, 'motion', motion, idx++));

    const stress = rangeValue(Math.round(26 - progress * 7), 3, m, 112);
    events.push(makeEvent(segment, m, 'stressLoad', stress, idx++));
  }

  return events;
}

/** sleep_wind_down: low motion, HR/stress decline, no sleepStage metric */
function generateSleepWindDown(segment: MicroEventSegment): DeviceEvent[] {
  const events: DeviceEvent[] = [];
  const totalMin = diffMinutes(segment.start, segment.end);
  const { restingHr, hrv } = extractBaselines(segment.params);
  let idx = 0;

  for (let m = 0; m < totalMin; m += 1) {
    const progress = m / Math.max(totalMin - 1, 1);
    const hrDrop = progress * 7;
    const hr = rangeValue(Math.round(restingHr - hrDrop), 4, m, 120);
    events.push(makeEvent(segment, m, 'heartRate', hr, idx++));

    const hrvRise = progress * 6;
    const hrvVal = rangeValue(Math.round(hrv + hrvRise), 4, m, 121);
    events.push(makeEvent(segment, m, 'hrvRmssd', hrvVal, idx++));

    events.push(makeEvent(segment, m, 'steps', 0, idx++));

    const imuSamples = generateImuSamples(MICRO_MOTION_PATTERN_MAP[segment.type], m, totalMin, segment.segmentId.length + m);
    const motion = aggregateMotion(imuSamples);
    events.push(makeEvent(segment, m, 'motion', motion, idx++));

    const stress = rangeValue(Math.round(24 - progress * 9), 3, m, 122);
    events.push(makeEvent(segment, m, 'stressLoad', stress, idx++));
  }

  return events;
}

/** box_breathing: 急性应激 HRV 救援，心率急降、HRV 大幅拉升 */
function generateBoxBreathing(segment: MicroEventSegment): DeviceEvent[] {
  const events: DeviceEvent[] = [];
  const totalMin = diffMinutes(segment.start, segment.end);
  const { restingHr, hrv } = extractBaselines(segment.params);
  let idx = 0;

  for (let m = 0; m < totalMin; m += 1) {
    const progress = m / Math.max(totalMin - 1, 1);
    const hrDrop = 8 + progress * 4; // 8 → 12
    const hr = rangeValue(Math.round(restingHr - hrDrop), 3, m, 130);
    events.push(makeEvent(segment, m, 'heartRate', hr, idx++));

    const hrvRise = 10 + progress * 8; // 10 → 18
    const hrvVal = rangeValue(Math.round(hrv + hrvRise), 4, m, 131);
    events.push(makeEvent(segment, m, 'hrvRmssd', hrvVal, idx++));

    events.push(makeEvent(segment, m, 'steps', 0, idx++));

    const imuSamples = generateImuSamples(MICRO_MOTION_PATTERN_MAP[segment.type], m, totalMin, segment.segmentId.length + m);
    const motion = aggregateMotion(imuSamples);
    events.push(makeEvent(segment, m, 'motion', motion, idx++));

    const stressDrop = progress * 10;
    const stress = rangeValue(Math.round(28 - stressDrop), 2, m, 132);
    events.push(makeEvent(segment, m, 'stressLoad', stress, idx++));
  }

  return events;
}

/** calming_breathing: 温和持续心率下降、HRV 稳步上升 */
function generateCalmingBreathing(segment: MicroEventSegment): DeviceEvent[] {
  const events: DeviceEvent[] = [];
  const totalMin = diffMinutes(segment.start, segment.end);
  const { restingHr, hrv } = extractBaselines(segment.params);
  let idx = 0;

  for (let m = 0; m < totalMin; m += 1) {
    const progress = m / Math.max(totalMin - 1, 1);
    const hrDrop = 3 + progress * 5; // 3 → 8
    const hr = rangeValue(Math.round(restingHr - hrDrop), 3, m, 140);
    events.push(makeEvent(segment, m, 'heartRate', hr, idx++));

    const hrvRise = 6 + progress * 6; // 6 → 12
    const hrvVal = rangeValue(Math.round(hrv + hrvRise), 3, m, 141);
    events.push(makeEvent(segment, m, 'hrvRmssd', hrvVal, idx++));

    events.push(makeEvent(segment, m, 'steps', 0, idx++));

    const imuSamples = generateImuSamples(MICRO_MOTION_PATTERN_MAP[segment.type], m, totalMin, segment.segmentId.length + m);
    const motion = aggregateMotion(imuSamples);
    events.push(makeEvent(segment, m, 'motion', motion, idx++));

    const stressDrop = progress * 8;
    const stress = rangeValue(Math.round(26 - stressDrop), 3, m, 142);
    events.push(makeEvent(segment, m, 'stressLoad', stress, idx++));
  }

  return events;
}

/** hydration_walk: 轻度步行+补水，步数少于 short_walk */
function generateHydrationWalk(segment: MicroEventSegment): DeviceEvent[] {
  const events: DeviceEvent[] = [];
  const totalMin = diffMinutes(segment.start, segment.end);
  const { restingHr } = extractBaselines(segment.params);
  let idx = 0;
  let cumulativeSteps = 0;

  for (let m = 0; m < totalMin; m += 1) {
    const progress = m / Math.max(totalMin - 1, 1);
    const hrRise = 3 + Math.sin(progress * Math.PI) * 4 - progress * 3;
    const hr = rangeValue(Math.round(restingHr + hrRise), 5, m, 150);
    events.push(makeEvent(segment, m, 'heartRate', hr, idx++));

    const stepsDelta = Math.round(20 + deterministic(151, m) * 20); // 20-40 步/分钟
    cumulativeSteps += stepsDelta;
    events.push(makeEvent(segment, m, 'steps', cumulativeSteps, idx++));

    const imuSamples = generateImuSamples(MICRO_MOTION_PATTERN_MAP[segment.type], m, totalMin, segment.segmentId.length + m);
    const motion = aggregateMotion(imuSamples);
    events.push(makeEvent(segment, m, 'motion', motion, idx++));
  }

  return events;
}

/** warm_shower: 心率先微升后下降，沐浴后血氧微升（用 spo2 替代 skinTemp） */
function generateWarmShower(segment: MicroEventSegment): DeviceEvent[] {
  const events: DeviceEvent[] = [];
  const totalMin = diffMinutes(segment.start, segment.end);
  const { restingHr, hrv, spo2 } = extractBaselines(segment.params);
  let idx = 0;

  for (let m = 0; m < totalMin; m += 1) {
    const progress = m / Math.max(totalMin - 1, 1);
    // 前 40% 微升 3-5 bpm，后 60% 下降至 restingHr - 2
    let hr: number;
    if (progress < 0.4) {
      hr = rangeValue(Math.round(restingHr + 4), 3, m, 160);
    } else {
      const dropProgress = (progress - 0.4) / 0.6;
      hr = rangeValue(Math.round(restingHr + 4 - dropProgress * 6), 3, m, 161);
    }
    events.push(makeEvent(segment, m, 'heartRate', hr, idx++));

    // 后 60% HRV 温和上升 3-6 ms
    if (progress >= 0.4) {
      const hrvRise = ((progress - 0.4) / 0.6) * 6;
      const hrvVal = rangeValue(Math.round(hrv + hrvRise), 3, m, 162);
      events.push(makeEvent(segment, m, 'hrvRmssd', hrvVal, idx++));
    } else {
      events.push(makeEvent(segment, m, 'hrvRmssd', rangeValue(hrv, 2, m, 163), idx++));
    }

    events.push(makeEvent(segment, m, 'steps', 0, idx++));

    const imuSamples = generateImuSamples(MICRO_MOTION_PATTERN_MAP[segment.type], m, totalMin, segment.segmentId.length + m);
    const motion = aggregateMotion(imuSamples);
    events.push(makeEvent(segment, m, 'motion', motion, idx++));

    // 沐浴后血氧微升 1-2%
    const spo2Rise = progress >= 0.5 ? Math.round((progress - 0.5) * 2 * 2) : 0;
    const spo2Val = rangeValue(Math.min(spo2 + spo2Rise, 100), 1, m, 164);
    events.push(makeEvent(segment, m, 'spo2', spo2Val, idx++));

    const stressDrop = progress * 6;
    const stress = rangeValue(Math.round(25 - stressDrop), 2, m, 165);
    events.push(makeEvent(segment, m, 'stressLoad', stress, idx++));
  }

  return events;
}

/** posture_correction: 近乎静止，心率极平稳，血氧维持高位 */
function generatePostureCorrection(segment: MicroEventSegment): DeviceEvent[] {
  const events: DeviceEvent[] = [];
  const totalMin = diffMinutes(segment.start, segment.end);
  const { restingHr, spo2 } = extractBaselines(segment.params);
  let idx = 0;
  let cumulativeSteps = 0;

  for (let m = 0; m < totalMin; m += 1) {
    const progress = m / Math.max(totalMin - 1, 1);
    const hr = rangeValue(Math.round(restingHr + 2 - progress * 1), 2, m, 170);
    events.push(makeEvent(segment, m, 'heartRate', hr, idx++));

    const stepsDelta = deterministic(171, m) > 0.9 ? 1 : 0;
    cumulativeSteps += stepsDelta;
    events.push(makeEvent(segment, m, 'steps', cumulativeSteps, idx++));

    const imuSamples = generateImuSamples(MICRO_MOTION_PATTERN_MAP[segment.type], m, totalMin, segment.segmentId.length + m);
    const motion = aggregateMotion(imuSamples);
    events.push(makeEvent(segment, m, 'motion', motion, idx++));

    const spo2Val = rangeValue(Math.min(spo2 + 1, 99), 1, m, 172);
    events.push(makeEvent(segment, m, 'spo2', spo2Val, idx++));
  }

  return events;
}

/** neuro_warmup: 原地活动，心率微升，步数极少 */
function generateNeuroWarmup(segment: MicroEventSegment): DeviceEvent[] {
  const events: DeviceEvent[] = [];
  const totalMin = diffMinutes(segment.start, segment.end);
  const { restingHr } = extractBaselines(segment.params);
  let idx = 0;
  let cumulativeSteps = 0;

  for (let m = 0; m < totalMin; m += 1) {
    const progress = m / Math.max(totalMin - 1, 1);
    const hr = rangeValue(Math.round(restingHr + 5 + Math.sin(progress * Math.PI * 2) * 3), 3, m, 180);
    events.push(makeEvent(segment, m, 'heartRate', hr, idx++));

    const stepsDelta = Math.round(5 + deterministic(181, m) * 10); // 5-15 步/分钟
    cumulativeSteps += stepsDelta;
    events.push(makeEvent(segment, m, 'steps', cumulativeSteps, idx++));

    const imuSamples = generateImuSamples(MICRO_MOTION_PATTERN_MAP[segment.type], m, totalMin, segment.segmentId.length + m);
    const motion = aggregateMotion(imuSamples);
    events.push(makeEvent(segment, m, 'motion', motion, idx++));
  }

  return events;
}

/** recovery_meal: 运动后恢复餐，消化活动比 snack 更强 */
function generateRecoveryMeal(segment: MicroEventSegment): DeviceEvent[] {
  const events: DeviceEvent[] = [];
  const totalMin = diffMinutes(segment.start, segment.end);
  const { restingHr, hrv } = extractBaselines(segment.params);
  let idx = 0;
  let cumulativeSteps = 0;

  for (let m = 0; m < totalMin; m += 1) {
    const progress = m / Math.max(totalMin - 1, 1);
    const hr = rangeValue(Math.round(restingHr + 5 - progress * 2), 4, m, 190);
    events.push(makeEvent(segment, m, 'heartRate', hr, idx++));

    const hrvDrop = -3 + progress * 2; // 消化初期 HRV 轻微下降后恢复
    const hrvVal = rangeValue(Math.round(hrv + hrvDrop), 3, m, 191);
    events.push(makeEvent(segment, m, 'hrvRmssd', hrvVal, idx++));

    const stepsDelta = deterministic(192, m) > 0.8 ? 1 : 0;
    cumulativeSteps += stepsDelta;
    events.push(makeEvent(segment, m, 'steps', cumulativeSteps, idx++));

    const imuSamples = generateImuSamples(MICRO_MOTION_PATTERN_MAP[segment.type], m, totalMin, segment.segmentId.length + m);
    const motion = aggregateMotion(imuSamples);
    events.push(makeEvent(segment, m, 'motion', motion, idx++));
  }

  return events;
}

/** power_nap: 心率降至静息以下，HRV 显著上升 */
function generatePowerNap(segment: MicroEventSegment): DeviceEvent[] {
  const events: DeviceEvent[] = [];
  const totalMin = diffMinutes(segment.start, segment.end);
  const { restingHr, hrv } = extractBaselines(segment.params);
  let idx = 0;

  for (let m = 0; m < totalMin; m += 1) {
    const progress = m / Math.max(totalMin - 1, 1);
    const hrDrop = 3 + progress * 5; // 3 → 8
    const hr = rangeValue(Math.round(restingHr - hrDrop), 3, m, 200);
    events.push(makeEvent(segment, m, 'heartRate', hr, idx++));

    const hrvRise = 8 + progress * 7; // 8 → 15
    const hrvVal = rangeValue(Math.round(hrv + hrvRise), 4, m, 201);
    events.push(makeEvent(segment, m, 'hrvRmssd', hrvVal, idx++));

    events.push(makeEvent(segment, m, 'steps', 0, idx++));

    const imuSamples = generateImuSamples(MICRO_MOTION_PATTERN_MAP[segment.type], m, totalMin, segment.segmentId.length + m);
    const motion = aggregateMotion(imuSamples);
    events.push(makeEvent(segment, m, 'motion', motion, idx++));

    const stress = rangeValue(Math.round(22 - progress * 8), 2, m, 202);
    events.push(makeEvent(segment, m, 'stressLoad', stress, idx++));
  }

  return events;
}

/** screen_dimming: 心率极缓下降，HRV 温和上升 */
function generateScreenDimming(segment: MicroEventSegment): DeviceEvent[] {
  const events: DeviceEvent[] = [];
  const totalMin = diffMinutes(segment.start, segment.end);
  const { restingHr, hrv } = extractBaselines(segment.params);
  let idx = 0;

  for (let m = 0; m < totalMin; m += 1) {
    const progress = m / Math.max(totalMin - 1, 1);
    const hr = rangeValue(Math.round(restingHr - progress * 3), 2, m, 210);
    events.push(makeEvent(segment, m, 'heartRate', hr, idx++));

    const hrvVal = rangeValue(Math.round(hrv + progress * 4), 3, m, 211);
    events.push(makeEvent(segment, m, 'hrvRmssd', hrvVal, idx++));

    events.push(makeEvent(segment, m, 'steps', 0, idx++));

    const imuSamples = generateImuSamples(MICRO_MOTION_PATTERN_MAP[segment.type], m, totalMin, segment.segmentId.length + m);
    const motion = aggregateMotion(imuSamples);
    events.push(makeEvent(segment, m, 'motion', motion, idx++));

    const stress = rangeValue(Math.round(24 - progress * 6), 2, m, 212);
    events.push(makeEvent(segment, m, 'stressLoad', stress, idx++));
  }

  return events;
}

/** cool_shower: 心率先微升后下降，冷刺激后血氧改善 */
function generateCoolShower(segment: MicroEventSegment): DeviceEvent[] {
  const events: DeviceEvent[] = [];
  const totalMin = diffMinutes(segment.start, segment.end);
  const { restingHr, hrv, spo2 } = extractBaselines(segment.params);
  let idx = 0;

  for (let m = 0; m < totalMin; m += 1) {
    const progress = m / Math.max(totalMin - 1, 1);
    // 前 30% 微升，后 70% 下降至 restingHr - 5
    let hr: number;
    if (progress < 0.3) {
      hr = rangeValue(Math.round(restingHr + 2), 3, m, 220);
    } else {
      const dropProgress = (progress - 0.3) / 0.7;
      hr = rangeValue(Math.round(restingHr + 2 - dropProgress * 7), 3, m, 221);
    }
    events.push(makeEvent(segment, m, 'heartRate', hr, idx++));

    // 后 50% HRV 上升 5-8 ms
    if (progress >= 0.5) {
      const hrvRise = ((progress - 0.5) / 0.5) * 8;
      const hrvVal = rangeValue(Math.round(hrv + hrvRise), 3, m, 222);
      events.push(makeEvent(segment, m, 'hrvRmssd', hrvVal, idx++));
    } else {
      events.push(makeEvent(segment, m, 'hrvRmssd', rangeValue(hrv, 2, m, 223), idx++));
    }

    events.push(makeEvent(segment, m, 'steps', 0, idx++));

    const imuSamples = generateImuSamples(MICRO_MOTION_PATTERN_MAP[segment.type], m, totalMin, segment.segmentId.length + m);
    const motion = aggregateMotion(imuSamples);
    events.push(makeEvent(segment, m, 'motion', motion, idx++));

    // 后 50% 血氧回升 1-2%
    const spo2Rise = progress >= 0.5 ? Math.round(((progress - 0.5) / 0.5) * 2) : 0;
    const spo2Val = rangeValue(Math.min(spo2 + spo2Rise, 100), 1, m, 224);
    events.push(makeEvent(segment, m, 'spo2', spo2Val, idx++));

    const stress = rangeValue(Math.round(26 - progress * 8), 2, m, 225);
    events.push(makeEvent(segment, m, 'stressLoad', stress, idx++));
  }

  return events;
}

/** outdoor_breather: 户外步数较多，心率先升后降，SpO2 回升 */
function generateOutdoorBreather(segment: MicroEventSegment): DeviceEvent[] {
  const events: DeviceEvent[] = [];
  const totalMin = diffMinutes(segment.start, segment.end);
  const { restingHr, spo2 } = extractBaselines(segment.params);
  let idx = 0;
  let cumulativeSteps = 0;

  for (let m = 0; m < totalMin; m += 1) {
    const progress = m / Math.max(totalMin - 1, 1);
    const hrRise = 8 + Math.sin(progress * Math.PI) * 6 - progress * 5;
    const hr = rangeValue(Math.round(restingHr + hrRise), 5, m, 230);
    events.push(makeEvent(segment, m, 'heartRate', hr, idx++));

    // 前半段 40-60 步/分，后半段 20-30 步/分
    const stepsPerMin = progress < 0.5
      ? Math.round(40 + deterministic(231, m) * 20)
      : Math.round(20 + deterministic(231, m) * 10);
    cumulativeSteps += stepsPerMin;
    events.push(makeEvent(segment, m, 'steps', cumulativeSteps, idx++));

    const imuSamples = generateImuSamples(MICRO_MOTION_PATTERN_MAP[segment.type], m, totalMin, segment.segmentId.length + m);
    const motion = aggregateMotion(imuSamples);
    events.push(makeEvent(segment, m, 'motion', motion, idx++));

    // 后半段 SpO2 回升至 98-99%
    if (progress >= 0.5) {
      const spo2Val = rangeValue(Math.min(spo2 + 2, 99), 1, m, 232);
      events.push(makeEvent(segment, m, 'spo2', spo2Val, idx++));
    }

    const stress = rangeValue(Math.round(28 - progress * 10), 3, m, 233);
    events.push(makeEvent(segment, m, 'stressLoad', stress, idx++));
  }

  return events;
}

/** stair_climb: 心率快速上升 15-25 bpm，步数集中 50-80 步/分钟 */
function generateStairClimb(segment: MicroEventSegment): DeviceEvent[] {
  const events: DeviceEvent[] = [];
  const totalMin = diffMinutes(segment.start, segment.end);
  const { restingHr } = extractBaselines(segment.params);
  let idx = 0;
  let cumulativeSteps = 0;

  for (let m = 0; m < totalMin; m += 1) {
    const progress = m / Math.max(totalMin - 1, 1);
    const hr = rangeValue(Math.round(restingHr + 20 + Math.sin(progress * Math.PI) * 5), 6, m, 240);
    events.push(makeEvent(segment, m, 'heartRate', hr, idx++));

    const stepsDelta = Math.round(50 + deterministic(241, m) * 30); // 50-80 步/分钟
    cumulativeSteps += stepsDelta;
    events.push(makeEvent(segment, m, 'steps', cumulativeSteps, idx++));

    const imuSamples = generateImuSamples(MICRO_MOTION_PATTERN_MAP[segment.type], m, totalMin, segment.segmentId.length + m);
    const motion = aggregateMotion(imuSamples);
    events.push(makeEvent(segment, m, 'motion', motion, idx++));
  }

  return events;
}

// ============================================================
// 公共调度函数
// ============================================================

const PROFILE_GENERATOR_MAP: Record<
  MicroEventDefinition['profile'],
  (segment: MicroEventSegment) => DeviceEvent[]
> = {
  deep_breathing: generateDeepBreathing,
  short_walk: generateShortWalk,
  post_meal_walk: generatePostMealWalk,
  post_workout_slow_walk: generatePostWorkoutSlowWalk,
  standing_stretch: generateStandingStretch,
  desk_mobility: generateDeskMobility,
  offscreen_rest: generateOffscreenRest,
  window_gaze_walk: generateWindowGazeWalk,
  snack: generateSnack,
  easy_cardio: generateEasyCardio,
  restorative_stretch: generateRestorativeStretch,
  low_stimulus: generateLowStimulus,
  sleep_wind_down: generateSleepWindDown,
  // === R1 ===
  box_breathing: generateBoxBreathing,
  calming_breathing: generateCalmingBreathing,
  hydration_walk: generateHydrationWalk,
  warm_shower: generateWarmShower,
  posture_correction: generatePostureCorrection,
  neuro_warmup: generateNeuroWarmup,
  // === R2 ===
  recovery_meal: generateRecoveryMeal,
  power_nap: generatePowerNap,
  screen_dimming: generateScreenDimming,
  cool_shower: generateCoolShower,
  outdoor_breather: generateOutdoorBreather,
  stair_climb: generateStairClimb,
  // === R3 ===
  standing_work: generateLowStimulus,
  foam_rolling: generateRestorativeStretch,
  cold_face_dip: generateOffscreenRest,
  mindfulness_meditation: generateSleepWindDown,
  muscle_relaxation: generateSleepWindDown,
  light_meal: generateSnack,
};

import type { MicroEventDefinition } from './micro-event-registry';
import { MICRO_EVENT_REGISTRY } from './micro-event-registry';

/**
 * 根据微事件片段生成对应的 DeviceEvent 数组
 * 相同输入始终产生相同的输出（确定性生成）
 */
export function generateEventsForMicroEvent(segment: MicroEventSegment): DeviceEvent[] {
  const definition = MICRO_EVENT_REGISTRY[segment.type];
  if (!definition) {
    throw new Error(`未注册的微事件类型: ${segment.type}`);
  }
  const generator = PROFILE_GENERATOR_MAP[definition.profile];
  if (!generator) {
    throw new Error(`不支持的微事件 profile: ${definition.profile}`);
  }
  return generator(segment);
}
