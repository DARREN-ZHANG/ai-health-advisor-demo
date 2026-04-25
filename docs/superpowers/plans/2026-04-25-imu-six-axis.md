# IMU 六轴加速度传感器 Mock 数据实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 sandbox mock 系统中引入六轴 IMU 原始传感器数据，使现有 motion 标量值从 IMU 数据聚合推导。

**Architecture:** 新增 `ImuSample` 类型和 14 种 `MotionPattern` 运动模式，通过配置驱动的 `imu-generator` 生成 IMU 数据并聚合为 motion 标量，嵌入到现有 `SensorSample` 中。改动仅限于数据类型层和生成器层，不影响 Profile/DailyRecord/History 文件。

**Tech Stack:** TypeScript, Zod, Vitest

---

### Task 1: 新增 MotionPattern 和 ImuSample 类型定义

**Files:**
- Modify: `packages/shared/src/types/sandbox.ts:162-174` (SensorSample 区域之前)
- Modify: `packages/shared/src/types/sandbox.ts:164-174` (SensorSample 接口)

- [ ] **Step 1: 在 SensorSample 之前添加 MotionPattern 类型和 ImuSample 接口**

在 `packages/shared/src/types/sandbox.ts` 文件中，在 `SleepStageType` 定义之后、`SensorSample` 接口之前，添加：

```typescript
/** 纯物理运动模式，与场景推断解耦 */
export type MotionPattern =
  // ── 静止 ──
  | 'still_supine'
  | 'still_upright'
  | 'still_with_micro'
  // ── 周期性 ──
  | 'periodic_stroll'
  | 'periodic_walk'
  | 'periodic_brisk'
  | 'periodic_run'
  | 'periodic_arm_repeat'
  // ── 间歇性 ──
  | 'intermittent_reach'
  | 'intermittent_gesture'
  | 'intermittent_burst'
  // ── 不规则 ──
  | 'irregular_fidget'
  | 'irregular_restless'
  | 'irregular_sudden';

/** 单次 IMU 采样点（每分钟 5 个，每 12s 一个） */
export interface ImuSample {
  /** 相对分钟起始的偏移毫秒数：0, 12000, 24000, 36000, 48000 */
  offsetMs: number;
  /** 加速度 X 轴（g），设备坐标系 */
  accX: number;
  /** 加速度 Y 轴（g），设备坐标系 */
  accY: number;
  /** 加速度 Z 轴（g），设备坐标系，包含重力 ~1g */
  accZ: number;
  /** 陀螺仪 X 轴（rad/s） */
  gyroX: number;
  /** 陀螺仪 Y 轴（rad/s） */
  gyroY: number;
  /** 陀螺仪 Z 轴（rad/s） */
  gyroZ: number;
}
```

- [ ] **Step 2: 在 SensorSample 接口中添加 imuSamples 字段**

修改 `SensorSample` 接口，在 `sleepStage` 字段后添加：

```typescript
export interface SensorSample {
  timestamp: string;
  heartRate?: number;
  spo2?: number;
  stressLoad?: number;
  stepsDelta?: number;
  caloriesDelta?: number;
  activeMinutesDelta?: number;
  distanceKmDelta?: number;
  sleepStage?: SleepStageType;
  imuSamples?: ImuSample[];  // 新增：每分钟 5 个 IMU 子采样
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/types/sandbox.ts
git commit -m "feat(types): add MotionPattern type and ImuSample interface"
```

---

### Task 2: 新增 Zod Schema 定义

**Files:**
- Modify: `packages/shared/src/schemas/sandbox.ts:148-160` (SensorSampleSchema 区域)

- [ ] **Step 1: 在 SensorSampleSchema 之前添加 ImuSampleSchema 和 MotionPatternSchema**

在 `packages/shared/src/schemas/sandbox.ts` 中，在 `SleepStageTypeSchema` 之后、`SensorSampleSchema` 之前添加：

```typescript
export const MotionPatternSchema = z.enum([
  'still_supine', 'still_upright', 'still_with_micro',
  'periodic_stroll', 'periodic_walk', 'periodic_brisk', 'periodic_run', 'periodic_arm_repeat',
  'intermittent_reach', 'intermittent_gesture', 'intermittent_burst',
  'irregular_fidget', 'irregular_restless', 'irregular_sudden',
]);

export const ImuSampleSchema = z.object({
  offsetMs: z.number().int().min(0).max(48000),
  accX: z.number().min(-4).max(4),
  accY: z.number().min(-4).max(4),
  accZ: z.number().min(-4).max(4),
  gyroX: z.number().min(-10).max(10),
  gyroY: z.number().min(-10).max(10),
  gyroZ: z.number().min(-10).max(10),
});
```

- [ ] **Step 2: 在 SensorSampleSchema 中添加 imuSamples 字段**

修改 `SensorSampleSchema`，在 `sleepStage` 字段后添加：

```typescript
export const SensorSampleSchema = z.object({
  timestamp: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
  heartRate: z.number().min(30).max(220).optional(),
  spo2: z.number().min(80).max(100).optional(),
  stressLoad: z.number().min(0).max(100).optional(),
  stepsDelta: z.number().min(0).optional(),
  caloriesDelta: z.number().min(0).optional(),
  activeMinutesDelta: z.number().min(0).optional(),
  distanceKmDelta: z.number().min(0).optional(),
  sleepStage: SleepStageTypeSchema.optional(),
  imuSamples: z.array(ImuSampleSchema).optional(),  // 新增
});
```

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/schemas/sandbox.ts
git commit -m "feat(schema): add ImuSampleSchema, MotionPatternSchema and extend SensorSampleSchema"
```

---

### Task 3: 导出新类型和 Schema

**Files:**
- Modify: `packages/shared/src/index.ts:2-30` (type exports)
- Modify: `packages/shared/src/index.ts:87-114` (schema exports)

- [ ] **Step 1: 在 type exports 中添加 MotionPattern 和 ImuSample**

在 `packages/shared/src/index.ts` 的 type 导出块中，在 `SensorSample` 之后添加：

```typescript
// 在 SensorSample 之后添加：
  MotionPattern,
  ImuSample,
```

- [ ] **Step 2: 在 schema exports 中添加 MotionPatternSchema 和 ImuSampleSchema**

在 schema 导出块中，在 `SensorSampleSchema` 之后添加：

```typescript
// 在 SensorSampleSchema 之后添加：
  ImuSampleSchema,
  MotionPatternSchema,
```

- [ ] **Step 3: 验证编译通过**

Run: `npx tsc --noEmit -p packages/shared/tsconfig.json`
Expected: 无错误

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/index.ts
git commit -m "feat(shared): export MotionPattern, ImuSample types and schemas"
```

---

### Task 4: 编写 ImuSample Schema 测试

**Files:**
- Modify: `packages/shared/src/__tests__/schemas.test.ts`

- [ ] **Step 1: 在 schemas.test.ts 的 import 中添加 ImuSampleSchema 和 MotionPatternSchema**

在文件顶部的 import 块中，在 `DerivedTemporalStateSchema` 后添加：

```typescript
  ImuSampleSchema,
  MotionPatternSchema,
```

- [ ] **Step 2: 在文件末尾添加 ImuSample 和 MotionPattern 的测试用例**

```typescript
describe('MotionPatternSchema', () => {
  it('accepts all 14 valid motion patterns', () => {
    const patterns = [
      'still_supine', 'still_upright', 'still_with_micro',
      'periodic_stroll', 'periodic_walk', 'periodic_brisk', 'periodic_run', 'periodic_arm_repeat',
      'intermittent_reach', 'intermittent_gesture', 'intermittent_burst',
      'irregular_fidget', 'irregular_restless', 'irregular_sudden',
    ];
    patterns.forEach((p) => {
      expect(MotionPatternSchema.parse(p)).toBe(p);
    });
  });

  it('rejects invalid pattern', () => {
    expect(() => MotionPatternSchema.parse('invalid_motion')).toThrow();
  });
});

describe('ImuSampleSchema', () => {
  const validSample = {
    offsetMs: 0,
    accX: 0.01,
    accY: 0.02,
    accZ: 0.98,
    gyroX: 0.01,
    gyroY: 0.005,
    gyroZ: -0.01,
  };

  it('accepts valid IMU sample', () => {
    expect(ImuSampleSchema.parse(validSample)).toEqual(validSample);
  });

  it('accepts all valid offsetMs values (0, 12000, 24000, 36000, 48000)', () => {
    [0, 12000, 24000, 36000, 48000].forEach((offset) => {
      expect(ImuSampleSchema.parse({ ...validSample, offsetMs: offset })).toEqual({
        ...validSample,
        offsetMs: offset,
      });
    });
  });

  it('rejects negative offsetMs', () => {
    expect(() => ImuSampleSchema.parse({ ...validSample, offsetMs: -1 })).toThrow();
  });

  it('rejects offsetMs > 48000', () => {
    expect(() => ImuSampleSchema.parse({ ...validSample, offsetMs: 49000 })).toThrow();
  });

  it('rejects accX > 4g', () => {
    expect(() => ImuSampleSchema.parse({ ...validSample, accX: 5.0 })).toThrow();
  });

  it('rejects accX < -4g', () => {
    expect(() => ImuSampleSchema.parse({ ...validSample, accX: -5.0 })).toThrow();
  });

  it('rejects gyroX > 10 rad/s', () => {
    expect(() => ImuSampleSchema.parse({ ...validSample, gyroX: 11.0 })).toThrow();
  });

  it('rejects missing required fields', () => {
    expect(() => ImuSampleSchema.parse({ offsetMs: 0 })).toThrow();
  });

  it('rejects non-integer offsetMs', () => {
    expect(() => ImuSampleSchema.parse({ ...validSample, offsetMs: 0.5 })).toThrow();
  });
});
```

- [ ] **Step 3: 运行测试确认通过**

Run: `npx vitest run packages/shared/src/__tests__/schemas.test.ts`
Expected: 所有测试通过

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/__tests__/schemas.test.ts
git commit -m "test(schema): add ImuSampleSchema and MotionPatternSchema tests"
```

---

### Task 5: 创建 IMU 生成器核心文件

**Files:**
- Create: `packages/sandbox/src/helpers/imu-generator.ts`

- [ ] **Step 1: 编写 IMU 生成器完整实现**

创建 `packages/sandbox/src/helpers/imu-generator.ts`：

```typescript
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
    noise: { acc: 0.02, gyro: 0.02 },
    burst: { activeRatio: 0.15, avgBurstDuration: 2 },
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

  // 每个采样点有独立的 seed 偏移，保证不同点产生不同值
  const rng = mulberry32(seed + minuteOffset * 7 + totalMinutes * 13);

  return SAMPLE_OFFSETS.map((offsetMs) => {
    const timeInMinute = offsetMs / 1000; // 当前采样在分钟内的秒数
    const timeInSegment = minuteOffset * 60 + timeInMinute; // 在段内的秒数

    // 判断当前采样是否处于 burst 活跃窗口
    const isActive = isBurstActive(config, timeInSegment, rng);

    // 计算各轴值
    const accX = computeAxis(config.baseline.accX, config, 'acc', 'accX', timeInSegment, rng, isActive);
    const accY = computeAxis(config.baseline.accY, config, 'acc', 'accY', timeInSegment, rng, isActive);
    const accZ = computeAxis(config.baseline.accZ, config, 'acc', 'accZ', timeInSegment, rng, isActive);
    const gyroX = computeAxis(config.baseline.gyroX, config, 'gyro', 'gyroX', timeInSegment, rng, isActive);
    const gyroY = computeAxis(config.baseline.gyroY, config, 'gyro', 'gyroY', timeInSegment, rng, isActive);
    const gyroZ = computeAxis(config.baseline.gyroZ, config, 'gyro', 'gyroZ', timeInSegment, rng, isActive);

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
 * motion = clamp(average(dynamicAcc) * 10, 0, 11)
 */
export function aggregateMotion(samples: ImuSample[]): number {
  if (samples.length === 0) return 0;

  const dynamicAccs = samples.map((s) => {
    const totalAcc = Math.sqrt(s.accX * s.accX + s.accY * s.accY + s.accZ * s.accZ);
    return Math.max(0, totalAcc - 1);
  });

  const avgDynamicAcc = dynamicAccs.reduce((sum, v) => sum + v, 0) / dynamicAccs.length;
  return Math.round(clamp(avgDynamicAcc * 10, 0, 11) * 10) / 10;
}

// ============================================================
// 内部辅助函数
// ============================================================

/** 计算单个轴的值：基线 + 振荡 + burst 活跃 + 噪声 */
function computeAxis(
  baseline: number,
  config: PatternConfig,
  axisType: 'acc' | 'gyro',
  _axisName: string,
  timeInSegment: number,
  rng: () => number,
  isActive: boolean,
): number {
  let value = baseline;

  // 振荡分量（仅在有振荡配置且处于活跃状态时）
  if (config.oscillation && isActive) {
    const [ampMin, ampMax] = config.oscillation.amplitude[axisType];
    const amplitude = ampMin + rng() * (ampMax - ampMin);
    const phase = timeInSegment * config.oscillation.frequency * (2 * Math.PI) / 60;
    value += amplitude * Math.sin(phase);
  }

  // burst 不活跃时：回到基线 + 微小噪声
  if (!isActive && config.burst) {
    value = baseline + (rng() - 0.5) * config.noise[axisType] * 0.5;
    return value;
  }

  // 噪声分量
  value += (rng() - 0.5) * 2 * config.noise[axisType];

  return value;
}

/** 判断当前时间是否在 burst 活跃窗口内 */
function isBurstActive(config: PatternConfig, timeInSegment: number, rng: () => number): boolean {
  if (!config.burst) return true; // 无 burst 配置时始终活跃

  // 基于时间确定性计算活跃窗口
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
```

- [ ] **Step 2: 验证编译通过**

Run: `npx tsc --noEmit -p packages/sandbox/tsconfig.json`
Expected: 无错误

- [ ] **Step 3: Commit**

```bash
git add packages/sandbox/src/helpers/imu-generator.ts
git commit -m "feat(sandbox): add IMU generator with 14 motion patterns and motion aggregation"
```

---

### Task 6: 编写 IMU 生成器测试

**Files:**
- Create: `packages/sandbox/src/__tests__/helpers/imu-generator.test.ts`

- [ ] **Step 1: 编写完整的 IMU 生成器测试**

创建 `packages/sandbox/src/__tests__/helpers/imu-generator.test.ts`：

```typescript
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
      // accX/Y ≈ 0, accZ ≈ 1
      expect(Math.abs(s.accX)).toBeLessThan(0.05);
      expect(Math.abs(s.accY)).toBeLessThan(0.05);
      expect(Math.abs(s.accZ - 1)).toBeLessThan(0.05);
      // gyro ≈ 0
      expect(Math.abs(s.gyroX)).toBeLessThan(0.05);
      expect(Math.abs(s.gyroY)).toBeLessThan(0.05);
      expect(Math.abs(s.gyroZ)).toBeLessThan(0.05);
    }
  });

  it('周期性模式：加速度有振荡（至少有一个采样点偏离基线 > 0.05）', () => {
    const samples = generateImuSamples('periodic_walk', 3, 10, 42);
    const hasOscillation = samples.some((s) =>
      Math.abs(s.accX) > 0.05 || Math.abs(s.accY) > 0.05,
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
    expect(motion).toBeLessThan(0.5);
  });

  it('still_supine 模式 → motion ≈ 0', () => {
    const samples = generateImuSamples('still_supine', 0, 10, 42);
    const motion = aggregateMotion(samples);
    expect(motion).toBeLessThan(0.5);
  });

  it('periodic_run 模式 → motion > 3', () => {
    // 取多个分钟的采样来获得更稳定的平均
    const allSamples = [];
    for (let m = 0; m < 5; m++) {
      allSamples.push(...generateImuSamples('periodic_run', m, 10, 42));
    }
    const motion = aggregateMotion(allSamples);
    expect(motion).toBeGreaterThan(3);
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
```

- [ ] **Step 2: 运行测试确认通过**

Run: `npx vitest run packages/sandbox/src/__tests__/helpers/imu-generator.test.ts`
Expected: 所有测试通过

- [ ] **Step 3: Commit**

```bash
git add packages/sandbox/src/__tests__/helpers/imu-generator.test.ts
git commit -m "test(sandbox): add IMU generator tests for all 14 motion patterns"
```

---

### Task 7: 集成 IMU 生成器到 activity-generators

**Files:**
- Modify: `packages/sandbox/src/helpers/activity-generators.ts`

- [ ] **Step 1: 添加 IMU 导入**

在 `packages/sandbox/src/helpers/activity-generators.ts` 顶部 import 块中，添加：

```typescript
import type { ImuSample } from '@health-advisor/shared';
import { generateImuSamples, aggregateMotion, MOTION_PATTERN_MAP } from './imu-generator';
```

- [ ] **Step 2: 修改 generateMealIntakeEvents 中的 motion 生成逻辑**

在 `generateMealIntakeEvents` 函数中，将 motion 生成部分（约第 96-97 行）：

```typescript
    // motion: 每分钟，腕到嘴动作模式 2-5 次/分钟
    const motion = rangeValue(4, 4, m, 3);
    events.push(makeEvent(segment, m, 'motion', motion, idx++));
```

替换为：

```typescript
    // motion: 从 IMU 数据聚合
    const pattern = MOTION_PATTERN_MAP[segment.type];
    const imuSamples = generateImuSamples(pattern, m, totalMin, segment.segmentId.length + m);
    const motion = aggregateMotion(imuSamples);
    events.push(makeEvent(segment, m, 'motion', motion, idx++));
```

- [ ] **Step 3: 用相同模式替换其余 11 个生成器中的 motion 行**

每个生成器中的 `const motion = ...` + `events.push(makeEvent(..., 'motion', motion, ...))` 替换为：

```typescript
    const imuSamples = generateImuSamples(MOTION_PATTERN_MAP[segment.type], m, totalMin, segment.segmentId.length + m);
    const motion = aggregateMotion(imuSamples);
    events.push(makeEvent(segment, m, 'motion', motion, idx++));
```

涉及函数：
- `generateSteadyCardioEvents` (约第 142-143 行)
- `generateProlongedSedentaryEvents` (约第 178 行)
- `generateIntermittentExerciseEvents` (约第 230 行，注意 isActive 分支 — 两个分支都改用 burst 模式的 IMU 聚合替代)
- `generateWalkEvents` (约第 277-278 行)
- `generateSleepEvents` (约第 376-377 行)
- `generateDeepFocusEvents` (约第 406-407 行)
- `generateAnxietyEpisodeEvents` (约第 440-441 行)
- `generateBreathingPauseEvents` (约第 475-476 行，注意 progress 分支 — 统一用 still_supine 或根据 progress 动态选 pattern，简化为统一用 MOTION_PATTERN_MAP[segment.type])
- `generateAlcoholIntakeEvents` (约第 508-509 行)
- `generateNightmareEvents` (约第 537-538 行，注意 intensity 分支 — 统一用 MOTION_PATTERN_MAP[segment.type])
- `generateRelaxationEvents` (约第 564 行)

对于 `generateIntermittentExerciseEvents`，原来的 `isActive` 逻辑通过 IMU 的 `intermittent_burst` 模式自动处理，删除 `isActive` 条件判断：

替换前（约第 229-231 行）：
```typescript
    const motion = isActive ? rangeValue(8, 3, m, 33) : rangeValue(2, 3, m, 34);
    events.push(makeEvent(segment, m, 'motion', motion, idx++));
```

替换后：
```typescript
    const imuSamples = generateImuSamples(MOTION_PATTERN_MAP[segment.type], m, totalMin, segment.segmentId.length + m);
    const motion = aggregateMotion(imuSamples);
    events.push(makeEvent(segment, m, 'motion', motion, idx++));
```

- [ ] **Step 4: 运行现有 activity-generators 测试确认不破坏**

Run: `npx vitest run packages/sandbox/src/__tests__/helpers/activity-generators.test.ts`
Expected: 所有测试通过（motion 的具体值范围可能略有变化，但测试中的范围断言足够宽松）

- [ ] **Step 5: 如果有测试因 motion 值范围变化而失败，调整测试断言**

对于 `generateProlongedSedentaryEvents` 的 "should produce zero motion" 测试：IMU 生成的 still_upright 模式 motion 值 ≈ 0 但可能不为精确 0，需改为：

```typescript
    it('should produce near-zero motion', () => {
      const events = generateProlongedSedentaryEvents(segment);
      const motionEvents = events.filter((e) => e.metric === 'motion');
      for (const e of motionEvents) {
        expect(e.value as number).toBeLessThanOrEqual(1);
      }
    });
```

对于 `generateSleepEvents` 的 "should produce near-zero motion during sleep" 测试：同上，IMU still_supine 模式 motion ≈ 0。

对于 `generateRelaxationEvents` 相关测试（如果有的话）：同上处理。

- [ ] **Step 6: Commit**

```bash
git add packages/sandbox/src/helpers/activity-generators.ts packages/sandbox/src/__tests__/helpers/activity-generators.test.ts
git commit -m "feat(sandbox): integrate IMU generator into activity-generators for motion values"
```

---

### Task 8: 运行全量测试并修复

**Files:** 可能涉及多个测试文件

- [ ] **Step 1: 运行全量测试**

Run: `npx vitest run`
Expected: 所有测试通过

- [ ] **Step 2: 如有失败，逐一修复**

常见的失败场景：
1. Schema 测试中引用了 `SensorSampleSchema` 但未考虑 `imuSamples` 字段 — 不影响，因为 imuSamples 是 optional
2. 其他消费 `SensorSample` 的测试可能因为类型变化需要更新 — 按具体报错修复

- [ ] **Step 3: 最终 commit**

```bash
git add -A
git commit -m "fix: adjust tests for IMU integration"
```

---

### Task 9: 验证 TypeScript 编译

- [ ] **Step 1: 全量 TypeScript 编译检查**

Run: `npx tsc --noEmit`
Expected: 无错误

- [ ] **Step 2: 如果有编译错误，修复并提交**
