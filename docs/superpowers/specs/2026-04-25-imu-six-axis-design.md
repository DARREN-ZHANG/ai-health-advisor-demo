# 六轴加速度传感器（IMU）Mock 数据设计

> 日期：2026-04-25
> 状态：已确认

## 目标

在现有 sandbox mock 系统中引入六轴 IMU（3轴加速度 + 3轴陀螺仪）原始传感器数据，作为 `motion` 标量指标的底层物理数据源。现有的 `motion` 标量值改为从 IMU 数据聚合推导，使数据模型更接近真实可穿戴设备。

## 设计决策

| 决策项 | 选择 | 理由 |
|--------|------|------|
| 数据定位 | 底层原始数据 | motion 标量由 IMU 聚合推导 |
| 采样频率 | 每分钟 5 个采样点（每 12s 一次） | 控制数据量，满足模式识别需求 |
| 存储格式 | `SensorSample.imuSamples` 嵌套数组 | 与现有分钟级采样对齐 |
| Mock 策略 | 按物理运动模式区分 | 与场景解耦，多种场景可映射同一模式 |
| 随机策略 | seeded PRNG | 确定性可复现 |

## 章节 1：类型与 Schema

### 新增类型

`packages/shared/src/types/sandbox.ts`：

```typescript
/** 纯物理运动模式，与场景推断解耦 */
type MotionPattern =
  // ── 静止 ──
  | 'still_supine'         // 平躺
  | 'still_upright'        // 直立体位（坐/站）
  | 'still_with_micro'     // 基本静止伴偶发微动
  // ── 周期性 ──
  | 'periodic_stroll'      // 缓步
  | 'periodic_walk'        // 正常步行
  | 'periodic_brisk'       // 快走
  | 'periodic_run'         // 跑步
  | 'periodic_arm_repeat'  // 非行走重复手臂动作
  // ── 间歇性 ──
  | 'intermittent_reach'   // 抬手/伸手
  | 'intermittent_gesture' // 饮/食手势
  | 'intermittent_burst'   // 运动爆发交替
  // ── 不规则 ──
  | 'irregular_fidget'     // 持续小幅不安
  | 'irregular_restless'   // 中度不安
  | 'irregular_sudden';    // 突发剧烈

/** 单次 IMU 采样点 */
interface ImuSample {
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

### SensorSample 扩展

```typescript
interface SensorSample {
  // ...现有字段不变
  imuSamples?: ImuSample[];  // 每分钟 5 个 IMU 子采样
}
```

### Zod Schema

`packages/shared/src/schemas/sandbox.ts` 新增：

```typescript
const MotionPatternSchema = z.enum([
  'still_supine', 'still_upright', 'still_with_micro',
  'periodic_stroll', 'periodic_walk', 'periodic_brisk', 'periodic_run', 'periodic_arm_repeat',
  'intermittent_reach', 'intermittent_gesture', 'intermittent_burst',
  'irregular_fidget', 'irregular_restless', 'irregular_sudden',
]);

const ImuSampleSchema = z.object({
  offsetMs: z.number().int().min(0).max(48000),
  accX: z.number().min(-4).max(4),
  accY: z.number().min(-4).max(4),
  accZ: z.number().min(-4).max(4),
  gyroX: z.number().min(-10).max(10),
  gyroY: z.number().min(-10).max(10),
  gyroZ: z.number().min(-10).max(10),
});
```

`SensorSampleSchema` 增加：`imuSamples: z.array(ImuSampleSchema).optional()`。

## 章节 2：运动模式分类

### 各模式 IMU 特征

| 模式 | accX / accY | accZ | gyro | 特征 |
|------|------------|------|------|------|
| still_supine | ≈0 ±0.01, ≈1g ±0.01 | ≈0 ±0.01 | ≈0 ±0.01 | 重力沿 Y 轴 |
| still_upright | ≈0 ±0.01 | ≈1g ±0.01 | ≈0 ±0.01 | 重力沿 Z 轴 |
| still_with_micro | 同上，偶发 ±0.05 | 同上 | 偶发 ±0.1 | 90% 静止 + 10% 微扰 |
| periodic_stroll | ±0.1-0.3g 周期 | ~1g ±0.05 | ±0.3-0.8 周期 | 低频慢节奏 |
| periodic_walk | ±0.2-0.5g 周期 | ~1g ±0.1 | ±0.5-1.5 周期 | 中频标准步频 |
| periodic_brisk | ±0.3-0.7g 周期 | ~1g ±0.15 | ±0.8-2.0 周期 | 高频快节奏 |
| periodic_run | ±0.5-1.2g 周期 | ~1g ±0.3 | ±1-3 周期 | 高频大幅+垂直弹跳 |
| periodic_arm_repeat | ±0.3-0.8g 周期 | 偏移多变 | ±0.5-2.0 周期 | 手臂主导 |
| intermittent_reach | 偶发 0.5-1.0g | 动作时偏移 | 偶发 ±0.5-1.5 | 重力向量短时旋转 |
| intermittent_gesture | 短促 ±0.3-0.8g | 短促偏移 | 短促 ±0.3-0.8 | 抬手→回位 |
| intermittent_burst | 活跃段同 periodic_run | 交替 | 交替 | 高低交替 |
| irregular_fidget | 不规则 ±0.05-0.2g | ~1g + 微扰 | 不规则 ±0.1-0.3 | 持续低幅无节律 |
| irregular_restless | 不规则 ±0.2-0.6g | 偏移明显 | 不规则 ±0.3-1.0 | 方向多变 |
| irregular_sudden | 突发 ±0.5-1.5g | 突发偏移 | 突发 ±1-3 | 静止→骤然爆发 |

### ActivitySegmentType → MotionPattern 映射

```typescript
const MOTION_PATTERN_MAP: Record<ActivitySegmentType, MotionPattern> = {
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
```

## 章节 3：IMU 数据生成器

### 新文件

`packages/sandbox/src/helpers/imu-generator.ts`

### 核心接口

```typescript
function generateImuSamples(
  pattern: MotionPattern,
  minuteOffset: number,
  totalMinutes: number,
  seed: number,
): ImuSample[];

function aggregateMotion(samples: ImuSample[]): number;
```

### 配置驱动

```typescript
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
```

14 种模式各对应一个 PatternConfig 实例。

### 生成流程

1. 查表获取 PatternConfig
2. 初始化 seeded PRNG
3. 对 5 个采样点（offsetMs = 0/12000/24000/36000/48000）：
   - 计算基线值
   - 如有 oscillation，叠加 sin/cos 周期分量
   - 如有 burst，判断当前采样点是否在活跃窗口
   - 叠加 seeded noise
   - clamp 到物理合理范围
4. 返回 ImuSample[5]

### motion 聚合公式

```
dynamicAcc = sqrt(accX² + accY² + accZ²) - 1
motion = clamp(average(dynamicAcc) * 10, 0, 11)
```

## 章节 4：管道集成

### 修改文件清单

| 文件 | 变更 |
|------|------|
| `shared/types/sandbox.ts` | 新增 ImuSample、MotionPattern；SensorSample 加 imuSamples |
| `shared/schemas/sandbox.ts` | 新增 ImuSampleSchema、MotionPatternSchema；SensorSampleSchema 加字段 |
| `shared/src/index.ts` | 导出新类型 |
| `sandbox/helpers/imu-generator.ts` | 新增文件 |
| `sandbox/helpers/activity-generators.ts` | motion 生成改为从 IMU 聚合 |
| `sandbox/helpers/device-stream.ts` | materializeSample 时填充 imuSamples |
| `sandbox/generators/history.ts` | 确保imuSamples沿pipeline传递 |

### 不修改的部分

- Profile JSON 文件
- Timeline Script JSON 文件
- History JSON 文件（存储聚合后的 DailyRecord）
- DailyRecord / IntradaySnapshot 类型
- DeviceEvent 结构（motion 仍为标量值，只是来源变了）

### 数据流

```
ActivitySegment
  → type 查 MOTION_PATTERN_MAP → MotionPattern
  → imu-generator: generateImuSamples(pattern, ...) → ImuSample[5]
  → aggregateMotion(imuSamples) → motion 标量
  → activity-generators: DeviceEvent(metric:'motion', value: 标量)
                        + ImuSample[5] → SensorSample.imuSamples
  → device-stream: SensorSample { ..., imuSamples }
  → raw-to-daily: 聚合为 DailyRecord（activity 字段由 motion 标量计算，不变）
```

## 章节 5：测试策略

### 测试文件

| 文件 | 内容 |
|------|------|
| `sandbox/src/__tests__/helpers/imu-generator.test.ts`（新） | 生成器核心逻辑 |
| `shared/src/__tests__/schemas.test.ts`（扩展现有） | ImuSampleSchema 验证 |
| `sandbox/src/__tests__/helpers/activity-generators.test.ts`（扩展现有） | motion 由 IMU 派生 |

### imu-generator.test.ts 测试分组

1. **模式配置完整性**：14 种模式都有配置，基线重力幅值 ≈ 1g
2. **采样点数量**：每种模式返回恰好 5 个 ImuSample，offsetMs 正确
3. **物理合理性**：各模式数据在配置范围内
4. **确定性**：相同 seed → 一致输出；不同 seed → 不同输出
5. **motion 聚合**：still → ≈0，periodic_high → >5，范围 0-11
