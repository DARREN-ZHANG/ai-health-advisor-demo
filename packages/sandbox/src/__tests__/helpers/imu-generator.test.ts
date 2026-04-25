import { describe, it, expect } from 'vitest';
import type { MotionPattern } from '@health-advisor/shared';
import {
  generateImuSamples,
  aggregateMotion,
  MOTION_PATTERN_MAP,
  PATTERN_CONFIGS,
} from '../../helpers/imu-generator';

const ALL_PATTERNS: MotionPattern[] = [
  'still_supine', 'still_upright', 'still_with_micro',
  'periodic_stroll', 'periodic_walk', 'periodic_brisk', 'periodic_run', 'periodic_arm_repeat',
  'intermittent_reach', 'intermittent_gesture', 'intermittent_burst',
  'irregular_fidget', 'irregular_restless', 'irregular_sudden',
];

// ============================================================
// 模式配置完整性
// ============================================================

describe('imu-generator: 模式配置完整性', () => {
  it('14 种模式都有对应的 PatternConfig', () => {
    for (const pattern of ALL_PATTERNS) {
      expect(PATTERN_CONFIGS[pattern]).toBeDefined();
    }
    expect(Object.keys(PATTERN_CONFIGS).length).toBe(14);
  });

  it('静止模式的基线重力幅值 ≈ 1g', () => {
    const stillPatterns: MotionPattern[] = ['still_supine', 'still_upright', 'still_with_micro'];
    for (const pattern of stillPatterns) {
      const config = PATTERN_CONFIGS[pattern]!;
      const { accX, accY, accZ } = config.baseline;
      const gravity = Math.sqrt(accX * accX + accY * accY + accZ * accZ);
      expect(Math.abs(gravity - 1)).toBeLessThan(0.01);
    }
  });

  it('所有模式的 noise 和 amplitude 非负', () => {
    for (const pattern of ALL_PATTERNS) {
      const config = PATTERN_CONFIGS[pattern]!;
      expect(config.noise.acc).toBeGreaterThanOrEqual(0);
      expect(config.noise.gyro).toBeGreaterThanOrEqual(0);
      if (config.oscillation) {
        expect(config.oscillation.amplitude.acc[0]).toBeGreaterThanOrEqual(0);
        expect(config.oscillation.amplitude.gyro[0]).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

// ============================================================
// 采样点数量和 offsetMs
// ============================================================

describe('imu-generator: 采样点数量', () => {
  it('每种模式返回恰好 5 个 ImuSample', () => {
    for (const pattern of ALL_PATTERNS) {
      const samples = generateImuSamples(pattern, 0, 10, 42);
      expect(samples.length).toBe(5);
    }
  });

  it('offsetMs 分别为 0, 12000, 24000, 36000, 48000', () => {
    const samples = generateImuSamples('periodic_walk', 0, 10, 42);
    const offsets = samples.map((s) => s.offsetMs);
    expect(offsets).toEqual([0, 12000, 24000, 36000, 48000]);
  });
});

// ============================================================
// 物理合理性
// ============================================================

describe('imu-generator: 物理合理性', () => {
  it('静止模式：加速度接近基线，偏差在 noise 范围内', () => {
    const samples = generateImuSamples('still_upright', 5, 10, 42);
    for (const s of samples) {
      expect(Math.abs(s.accX)).toBeLessThan(0.05);
      expect(Math.abs(s.accY)).toBeLessThan(0.05);
      expect(Math.abs(s.accZ - 1)).toBeLessThan(0.05);
      expect(Math.abs(s.gyroX)).toBeLessThan(0.05);
      expect(Math.abs(s.gyroY)).toBeLessThan(0.05);
      expect(Math.abs(s.gyroZ)).toBeLessThan(0.05);
    }
  });

  it('周期性模式：加速度有振荡（至少有一个采样点偏离基线 > 0.03）', () => {
    const samples = generateImuSamples('periodic_run', 3, 10, 42);
    const hasOscillation = samples.some((s) =>
      Math.abs(s.accX) > 0.03 || Math.abs(s.accY) > 0.03,
    );
    expect(hasOscillation).toBe(true);
  });

  it('所有输出值在物理合理范围内', () => {
    for (const pattern of ALL_PATTERNS) {
      for (let m = 0; m < 5; m++) {
        const samples = generateImuSamples(pattern, m, 10, 42);
        for (const s of samples) {
          expect(s.accX).toBeGreaterThanOrEqual(-4);
          expect(s.accX).toBeLessThanOrEqual(4);
          expect(s.accY).toBeGreaterThanOrEqual(-4);
          expect(s.accY).toBeLessThanOrEqual(4);
          expect(s.accZ).toBeGreaterThanOrEqual(-4);
          expect(s.accZ).toBeLessThanOrEqual(4);
          expect(s.gyroX).toBeGreaterThanOrEqual(-10);
          expect(s.gyroX).toBeLessThanOrEqual(10);
          expect(s.gyroY).toBeGreaterThanOrEqual(-10);
          expect(s.gyroY).toBeLessThanOrEqual(10);
          expect(s.gyroZ).toBeGreaterThanOrEqual(-10);
          expect(s.gyroZ).toBeLessThanOrEqual(10);
        }
      }
    }
  });
});

// ============================================================
// 确定性
// ============================================================

describe('imu-generator: 确定性', () => {
  it('相同 seed + 参数 → 完全一致的输出', () => {
    for (const pattern of ALL_PATTERNS) {
      const run1 = generateImuSamples(pattern, 3, 10, 42);
      const run2 = generateImuSamples(pattern, 3, 10, 42);
      expect(run1).toEqual(run2);
    }
  });

  it('不同 seed → 不同输出', () => {
    const run1 = generateImuSamples('periodic_walk', 3, 10, 42);
    const run2 = generateImuSamples('periodic_walk', 3, 10, 99);
    expect(run1).not.toEqual(run2);
  });

  it('不同 minuteOffset → 不同输出', () => {
    const run1 = generateImuSamples('periodic_walk', 0, 10, 42);
    const run2 = generateImuSamples('periodic_walk', 5, 10, 42);
    expect(run1).not.toEqual(run2);
  });
});

// ============================================================
// motion 标量聚合
// ============================================================

describe('imu-generator: motion 聚合', () => {
  it('still_upright 模式 → motion ≈ 0', () => {
    const samples = generateImuSamples('still_upright', 0, 10, 42);
    const motion = aggregateMotion(samples);
    expect(motion).toBeLessThan(1);
  });

  it('still_supine 模式 → motion ≈ 0', () => {
    const samples = generateImuSamples('still_supine', 0, 10, 42);
    const motion = aggregateMotion(samples);
    expect(motion).toBeLessThan(1);
  });

  it('periodic_run 模式 → motion > 1（有明显运动）', () => {
    const allSamples = [];
    for (let m = 0; m < 5; m++) {
      allSamples.push(...generateImuSamples('periodic_run', m, 10, 42));
    }
    const motion = aggregateMotion(allSamples);
    expect(motion).toBeGreaterThan(1);
  });

  it('聚合值在 0-11 范围内', () => {
    for (const pattern of ALL_PATTERNS) {
      for (let m = 0; m < 3; m++) {
        const samples = generateImuSamples(pattern, m, 10, 42);
        const motion = aggregateMotion(samples);
        expect(motion).toBeGreaterThanOrEqual(0);
        expect(motion).toBeLessThanOrEqual(11);
      }
    }
  });

  it('空数组 → motion = 0', () => {
    expect(aggregateMotion([])).toBe(0);
  });
});

// ============================================================
// 映射完整性
// ============================================================

describe('imu-generator: ActivitySegmentType → MotionPattern 映射', () => {
  it('映射表覆盖所有 ActivitySegmentType', () => {
    const segmentTypes = [
      'sleep', 'relaxation', 'prolonged_sedentary',
      'walk', 'steady_cardio',
      'meal_intake', 'alcohol_intake',
      'deep_focus', 'intermittent_exercise',
      'anxiety_episode', 'breathing_pause', 'nightmare',
    ];
    for (const type of segmentTypes) {
      expect(MOTION_PATTERN_MAP[type as keyof typeof MOTION_PATTERN_MAP]).toBeDefined();
    }
    expect(Object.keys(MOTION_PATTERN_MAP).length).toBe(12);
  });

  it('映射值全部是有效的 MotionPattern', () => {
    const validPatterns = new Set(ALL_PATTERNS);
    for (const pattern of Object.values(MOTION_PATTERN_MAP)) {
      expect(validPatterns.has(pattern)).toBe(true);
    }
  });
});
