import type { ActivitySegmentType, ImuSample, MotionPattern } from '@health-advisor/shared';

// ============================================================
// seeded PRNG (mulberry32) — 与 history.ts 一致
// ============================================================

function mulberry32(seed: number): () => number {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ============================================================
// 配置类型
// ============================================================

interface PatternConfig {
  baseline: { accX: number; accY: number; accZ: number; gyroX: number; gyroY: number; gyroZ: number };
  oscillation: {
    amplitude: { acc: [number, number]; gyro: [number, number] };
    frequency: number;
  } | null;
  noise: { acc: number; gyro: number };
  burst: {
    activeRatio: number;
    avgBurstDuration: number;
  } | null;
}

// ============================================================
// 14 种运动模式配置
// ============================================================

const PATTERN_CONFIGS: Record<MotionPattern, PatternConfig> = {
  // ── 静止 ──
  still_supine: {
    baseline: { accX: 0, accY: 1, accZ: 0, gyroX: 0, gyroY: 0, gyroZ: 0 },
    oscillation: null,
    noise: { acc: 0.01, gyro: 0.01 },
    burst: null,
  },
  still_upright: {
    baseline: { accX: 0, accY: 0, accZ: 1, gyroX: 0, gyroY: 0, gyroZ: 0 },
    oscillation: null,
    noise: { acc: 0.01, gyro: 0.01 },
    burst: null,
  },
  still_with_micro: {
    baseline: { accX: 0, accY: 0, accZ: 1, gyroX: 0, gyroY: 0, gyroZ: 0 },
    oscillation: null,
    noise: { acc: 0.05, gyro: 0.1 },
    burst: { activeRatio: 0.1, avgBurstDuration: 2 },
  },

  // ── 周期性 ──
  periodic_stroll: {
    baseline: { accX: 0, accY: 0, accZ: 1, gyroX: 0, gyroY: 0, gyroZ: 0 },
    oscillation: { amplitude: { acc: [0.1, 0.3], gyro: [0.3, 0.8] }, frequency: 40 },
    noise: { acc: 0.03, gyro: 0.05 },
    burst: null,
  },
  periodic_walk: {
    baseline: { accX: 0, accY: 0, accZ: 1, gyroX: 0, gyroY: 0, gyroZ: 0 },
    oscillation: { amplitude: { acc: [0.2, 0.5], gyro: [0.5, 1.5] }, frequency: 55 },
    noise: { acc: 0.05, gyro: 0.1 },
    burst: null,
  },
  periodic_brisk: {
    baseline: { accX: 0, accY: 0, accZ: 1, gyroX: 0, gyroY: 0, gyroZ: 0 },
    oscillation: { amplitude: { acc: [0.3, 0.7], gyro: [0.8, 2.0] }, frequency: 70 },
    noise: { acc: 0.08, gyro: 0.15 },
    burst: null,
  },
  periodic_run: {
    baseline: { accX: 0, accY: 0, accZ: 1, gyroX: 0, gyroY: 0, gyroZ: 0 },
    oscillation: { amplitude: { acc: [0.5, 1.2], gyro: [1.0, 3.0] }, frequency: 85 },
    noise: { acc: 0.1, gyro: 0.2 },
    burst: null,
  },
  periodic_arm_repeat: {
    baseline: { accX: 0, accY: 0, accZ: 1, gyroX: 0, gyroY: 0, gyroZ: 0 },
    oscillation: { amplitude: { acc: [0.3, 0.8], gyro: [0.5, 2.0] }, frequency: 30 },
    noise: { acc: 0.06, gyro: 0.12 },
    burst: null,
  },

  // ── 间歇性 ──
  intermittent_reach: {
    baseline: { accX: 0, accY: 0, accZ: 1, gyroX: 0, gyroY: 0, gyroZ: 0 },
    oscillation: null,
    noise: { acc: 0.02, gyro: 0.02 },
    burst: { activeRatio: 0.2, avgBurstDuration: 3 },
  },
  intermittent_gesture: {
    baseline: { accX: 0, accY: 0, accZ: 1, gyroX: 0, gyroY: 0, gyroZ: 0 },
    oscillation: null,
    noise: { acc: 0.08, gyro: 0.1 },
    burst: { activeRatio: 0.3, avgBurstDuration: 3 },
  },
  intermittent_burst: {
    baseline: { accX: 0, accY: 0, accZ: 1, gyroX: 0, gyroY: 0, gyroZ: 0 },
    oscillation: { amplitude: { acc: [0.5, 1.2], gyro: [1.0, 3.0] }, frequency: 85 },
    noise: { acc: 0.1, gyro: 0.2 },
    burst: { activeRatio: 0.6, avgBurstDuration: 5 },
  },

  // ── 不规则 ──
  irregular_fidget: {
    baseline: { accX: 0, accY: 0, accZ: 1, gyroX: 0, gyroY: 0, gyroZ: 0 },
    oscillation: null,
    noise: { acc: 0.15, gyro: 0.25 },
    burst: null,
  },
  irregular_restless: {
    baseline: { accX: 0, accY: 0, accZ: 1, gyroX: 0, gyroY: 0, gyroZ: 0 },
    oscillation: null,
    noise: { acc: 0.35, gyro: 0.6 },
    burst: null,
  },
  irregular_sudden: {
    baseline: { accX: 0, accY: 0, accZ: 1, gyroX: 0, gyroY: 0, gyroZ: 0 },
    oscillation: null,
    noise: { acc: 0.01, gyro: 0.01 },
    burst: { activeRatio: 0.3, avgBurstDuration: 3 },
  },
};

// ============================================================
// ActivitySegmentType → MotionPattern 映射
// ============================================================

export const MOTION_PATTERN_MAP: Record<ActivitySegmentType, MotionPattern> = {
  sleep:               'still_supine',
  relaxation:          'still_upright',
  prolonged_sedentary: 'still_upright',
  walk:                'periodic_walk',
  steady_cardio:       'periodic_run',
  meal_intake:         'intermittent_gesture',
  alcohol_intake:      'intermittent_gesture',
  deep_focus:          'irregular_fidget',
  intermittent_exercise: 'intermittent_burst',
  anxiety_episode:     'irregular_restless',
  breathing_pause:     'still_supine',
  nightmare:           'irregular_sudden',
};

// ============================================================
// 每分钟采样点偏移（5 个点，每 12 秒）
// ============================================================

const SAMPLE_OFFSETS = [0, 12000, 24000, 36000, 48000] as const;

// ============================================================
// 核心生成函数
// ============================================================

/**
 * 生成一分钟内的 IMU 采样数据
 * @param pattern - 运动模式
 * @param minuteOffset - 段内第几分钟（0-based）
 * @param totalMinutes - 段总时长
 * @param seed - 确定性种子
 */
export function generateImuSamples(
  pattern: MotionPattern,
  minuteOffset: number,
  totalMinutes: number,
  seed: number,
): ImuSample[] {
  const config = PATTERN_CONFIGS[pattern];
  if (!config) {
    throw new Error(`未知的运动模式: ${pattern}`);
  }

  const rng = mulberry32(seed + minuteOffset * 7 + totalMinutes * 13);

  return SAMPLE_OFFSETS.map((offsetMs) => {
    const timeInMinute = offsetMs / 1000;
    const timeInSegment = minuteOffset * 60 + timeInMinute;

    const isActive = isBurstActive(config, timeInSegment, rng);

    const accX = computeAxis(config.baseline.accX, config, 'acc', timeInSegment, rng, isActive);
    const accY = computeAxis(config.baseline.accY, config, 'acc', timeInSegment, rng, isActive);
    const accZ = computeAxis(config.baseline.accZ, config, 'acc', timeInSegment, rng, isActive);
    const gyroX = computeAxis(config.baseline.gyroX, config, 'gyro', timeInSegment, rng, isActive);
    const gyroY = computeAxis(config.baseline.gyroY, config, 'gyro', timeInSegment, rng, isActive);
    const gyroZ = computeAxis(config.baseline.gyroZ, config, 'gyro', timeInSegment, rng, isActive);

    return {
      offsetMs,
      accX: clamp(accX, -4, 4),
      accY: clamp(accY, -4, 4),
      accZ: clamp(accZ, -4, 4),
      gyroX: clamp(gyroX, -10, 10),
      gyroY: clamp(gyroY, -10, 10),
      gyroZ: clamp(gyroZ, -10, 10),
    };
  });
}

/**
 * 从 IMU 采样数据聚合为 motion 标量值
 * dynamicAcc = sqrt(accX² + accY² + accZ²) - 1
 * motion = clamp(average(dynamicAcc) * 300, 0, 11)
 */
export function aggregateMotion(samples: ImuSample[]): number {
  if (samples.length === 0) return 0;

  const dynamicAccs = samples.map((s) => {
    const totalAcc = Math.sqrt(s.accX * s.accX + s.accY * s.accY + s.accZ * s.accZ);
    return Math.max(0, totalAcc - 1);
  });

  const avgDynamicAcc = dynamicAccs.reduce((sum, v) => sum + v, 0) / dynamicAccs.length;
  return Math.round(clamp(avgDynamicAcc * 300, 0, 11) * 10) / 10;
}

// ============================================================
// 内部辅助函数
// ============================================================

/** 计算单个轴的值：基线 + 振荡 + burst 活跃/静默 + 噪声 */
function computeAxis(
  baseline: number,
  config: PatternConfig,
  axisType: 'acc' | 'gyro',
  timeInSegment: number,
  rng: () => number,
  isActive: boolean,
): number {
  let value = baseline;

  // burst 不活跃时：回到基线 + 微小噪声
  if (!isActive && config.burst) {
    value = baseline + (rng() - 0.5) * config.noise[axisType] * 0.5;
    return value;
  }

  // 振荡分量
  if (config.oscillation) {
    const [ampMin, ampMax] = config.oscillation.amplitude[axisType];
    const amplitude = ampMin + rng() * (ampMax - ampMin);
    const phase = timeInSegment * config.oscillation.frequency * (2 * Math.PI) / 60;
    value += amplitude * Math.sin(phase);
  }

  // 噪声分量
  value += (rng() - 0.5) * 2 * config.noise[axisType];

  return value;
}

/** 判断当前时间是否在 burst 活跃窗口内 */
function isBurstActive(config: PatternConfig, timeInSegment: number, _rng: () => number): boolean {
  if (!config.burst) return true;

  const cycleDuration = config.burst.avgBurstDuration / config.burst.activeRatio;
  const cyclePosition = timeInSegment % cycleDuration;
  return cyclePosition < config.burst.avgBurstDuration;
}

/** 数值 clamp */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** 导出配置表供测试使用 */
export { PATTERN_CONFIGS };
