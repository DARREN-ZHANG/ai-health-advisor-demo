# Mock Timeline Control 设计文档

> 本文档描述一套**确定性的生理数据模拟引擎**的完整设计方案，用于在新仓库中实现"模拟一个人的一天"的时间轴控制能力。文档自包含，覆盖数据模型、运行时控制、确定性生成、状态管理、对外接口、扩展机制、约束与测试。读者无需访问任何既有代码即可据此实现。

---

## 1. 概述与设计目标

### 1.1 它是什么

Timeline Control 是一个**面向可穿戴健康数据场景的"虚拟人体 + 虚拟设备"工厂**。它接受操作者（演示控件 / 测试代码 / 评测脚本）发出的"活动指令"，把这些指令展开成确定性的传感器采样事件流，再经过同步、识别、聚合，最终变成 AI agent 可查询的结构化日级健康记录（`DailyRecord`）。

核心隐喻：

```
操作者 ──(活动指令)──▶ 时间轴 ──(展开)──▶ 传感器事件流
                                            │
                                            ▼
                          同步 ─▶ 识别 ─▶ 聚合 ─▶ DailyRecord
                                                        │
                                                        ▼
                                                  AI agent 只读消费
```

它**不是**：
- 通用任务调度器（cron / job queue）
- 实时数据采集网关
- 物理时钟驱动的仿真器

它**是**：
- 一个离散命令驱动的虚拟时钟 + 事件工厂
- 一套可复现、可版本控制的 mock 数据生成体系
- 一个支持运行时干预（operator override）的演示后端

### 1.2 设计目标

| 目标 | 含义 |
|------|------|
| **确定性可复现** | 相同输入（画像 + 指令序列 + 种子）永远产出相同输出。demo、eval、回归测试都不 flaky。 |
| **画像驱动** | 所有数据围绕一组差异化的虚拟用户（profile）的基线派生，避免无主语的随机数据。 |
| **资产分层** | 人工编辑"意图"（画像字段、文案），机器产出"数值"（事件、记录），职责分离杜绝不一致。 |
| **双轨数据** | 冻结的"历史日级数据" + 可演进的"当前活动日"，两者 schema 对齐，历史与当下无缝衔接。 |
| **运行时可干预** | 演示过程中可通过 operator override 通道随时注入活动，无需重生成静态资产。 |

### 1.3 适用场景与边界

**适用**：
- AI 健康顾问类应用的 demo 展示（需要一个"虚拟用户"持续产生数据）
- 算法/提示词的离线 eval（需要稳定可复现的输入）
- 单元测试 / 集成测试 / E2E 测试的数据底座

**不适用**：
- 真实生理数据采集与医疗决策
- 跨进程/跨节点的分布式任务调度
- 需要物理时钟（wall clock）实时推进的场景

### 1.4 核心设计原则

1. **纯函数 + 不可变**：所有数据变换返回新对象，状态变更集中在一个 holder 内。
2. **离散命令驱动时钟**：虚拟时钟只由显式命令（追加片段 / 推进 N 分钟）推进，没有后台 tick。这让"现在几点"完全可控、可断言。
3. **Schema-first**：所有数据结构用 Zod schema 定义，类型从 schema 派生，校验在系统边界强制执行。
4. **内存态运行时 + 磁盘态资产分离**：磁盘只存静态种子（画像、历史、脚本）；运行时所有可变状态在内存，进程重启即回到初始态。

---

## 2. 架构总览

### 2.1 分层视图

```
┌─────────────────────────────────────────────────────────────┐
│ L5  消费层    │  AI agent（只读查询）  /  前端 UI（只读展示）  │
├─────────────────────────────────────────────────────────────┤
│ L4  控制面 API │  HTTP：append / micro-event / advance / ...   │
├─────────────────────────────────────────────────────────────┤
│ L3  Service   │  编排：读基线 → 调 holder → 触发同步 →        │
│    编排层     │  失效缓存 → 注入 Active Sensing banner         │
├─────────────────────────────────────────────────────────────┤
│ L2  状态层    │  进程级 holder：demoStateByProfile Map         │
│   (有状态)    │  持有 clock / segments / rawEvents / syncState │
├─────────────────────────────────────────────────────────────┤
│ L1  纯函数    │  确定性生成器 + 同步引擎 + 识别 + 聚合          │
│   生成器层    │  （零副作用，所有操作不可变，易测试）           │
├─────────────────────────────────────────────────────────────┤
│ L0  磁盘资产  │  profile 档案 / 历史存档 / 活动脚本（静态 seed）│
└─────────────────────────────────────────────────────────────┘
```

分层的关键约束：
- **L1 必须零副作用**。它是一组纯函数，输入数据 + 参数，输出新数据。这使得核心算法可独立单测，不依赖任何运行时。
- **L2 是唯一的可变点**。所有状态变更（追加、同步、推进）都经过 holder，holder 内部用不可变替换更新 Map 的 value。
- **L3 不持有业务状态**，只做编排和副作用（缓存失效、banner 注入）。
- **L4/L5 永远不直接访问 L1**，必须经过 L3，保证缓存一致性和 Active Sensing 副作用不丢失。

### 2.2 端到端控制流鸟瞰

以"操作者追加一段 30 分钟的步行片段"为例，一个请求的完整旅程：

```
[1] 控制面 API 收到 POST /timeline-append { type: 'walk', durationMinutes: 30 }
        │
        ▼
[2] Service 读取该 profile 的 baseline（restingHr / hrv / spo2）
    注入到片段 params._baseline*
        │
        ▼
[3] Service 调用 holder.appendSegment(...)
        │
        ▼
[4] holder 调用 L1 纯函数 appendSegment(segments, currentTime, ...):
    a. 计算 start = currentTime, end = start + duration
    b. 校验 [start, end) 与所有已有片段不重叠 → 重叠则抛错
    c. 调用 generateEventsForSegment(segment) 展开成数十~数百个 DeviceEvent
    d. 不可变追加：返回新 segments 数组 + 新事件数组 + newCurrentTime
        │
        ▼
[5] holder 用新数据构造新 DemoProfileState（不可变替换），并推进 clock 到 end
        │
        ▼
[6] holder 自动执行 performSync(internalSync, 'app_open', newClockTime):
    把所有 measuredAt <= newClockTime 的 pending 事件标记为 synced
    推进水位线 lastSyncedMeasuredAt
        │
        ▼
[7] Service 失效该 profile 的派生缓存（识别事件、聚合记录、session memory）
        │
        ▼
[8] Service 向 Active Sensing 通道注入一条 banner 事件，通知前端"新数据到达"
        │
        ▼
[9] 下次 agent 查询时：
    syncedEvents ─▶ recognizeEvents ─▶ computeDerivedTemporalStates
                 ─▶ aggregateCurrentDayRecord ─▶ mergeCurrentDayRecord
                 ─▶ 返回含新步行数据的 DailyRecord
```

这条主线是整个系统的"骨架"，后续章节逐段展开。

### 2.3 模块清单与职责

| 模块 | 层 | 职责 | 副作用 |
|------|----|------|--------|
| `schemas/` | L1 | Zod schema 定义，类型派生源 | 无 |
| `generators/` | L1 | ActivitySegment / Micro Event → DeviceEvent 的确定性展开 | 无 |
| `timeline-append` | L1 | 片段追加纯函数（校验、生成、不可变返回） | 无 |
| `micro-event-append` | L1 | 微事件追加纯函数（生成事件、推进时钟） | 无 |
| `sync-engine` | L1 | 同步状态机：pending ↔ synced 水位线管理 | 无 |
| `event-recognition` | L1 | synced events → recognized events 反推 | 无 |
| `derived-temporal-state` | L1 | recognized events → 派生时态（"近 30 分钟吃过饭"） | 无 |
| `raw-to-daily` | L1 | synced events → DailyRecord 聚合 | 无 |
| `override-store` | L2 | 进程级状态 holder，唯一可变点 | 内存写 |
| `service` | L3 | 编排：参数注入、缓存失效、banner 注入 | 缓存 / 通道 |
| `routes` | L4 | HTTP 控制面 | 网络 IO |
| `query-timeline-events` | L5 | agent 只读查询工具 | 读 |

---

## 3. 核心数据模型

> 所有时间戳统一格式 `YYYY-MM-DDTHH:mm`（精度到分钟，无秒无时区后缀）。这是强约束，由 schema 校验。

### 3.1 三层抽象

数据从"指令"到"记录"经过三种形态，每种都有明确的产生方和消费方：

```
ActivitySegment（指令/活动片段）
    │ generateEventsForSegment
    ▼
DeviceEvent（设备原始事件）
    │ performSync → recognizeEvents
    ▼
RecognizedEvent（识别事件，agent 友好）
```

#### 3.1.1 活动片段 ActivitySegment

时间轴的基本编排单元，代表"用户在 [start, end) 做了某类活动"。

```ts
/** 活动片段类型枚举（可扩展，见 §8.1） */
type ActivitySegmentType =
  | 'meal_intake'           // 进餐
  | 'steady_cardio'         // 稳态有氧
  | 'prolonged_sedentary'   // 久坐
  | 'intermittent_exercise' // 间歇运动
  | 'walk'                  // 步行
  | 'sleep'                 // 睡眠
  | 'nap'                   // 小睡
  | 'deep_focus'            // 深度专注
  | 'anxiety_episode'       // 焦虑发作
  | 'alcohol_intake'        // 饮酒
  | 'caffeine_intake'       // 咖啡因摄入
  | 'relaxation'            // 放松
  | 'strength_training';    // 力量训练

interface ActivitySegment {
  segmentId: string;
  profileId: string;
  type: ActivitySegmentType;
  /** YYYY-MM-DDTHH:mm */
  start: string;
  /** YYYY-MM-DDTHH:mm */
  end: string;
  /** 生成器参数，由 Service 注入 _baseline* */
  params?: Record<string, number | string | boolean>;
  /** 来源：脚本预设 / 操作者运行时注入 */
  source: 'baseline_script' | 'operator_override';
  /** 可选：场景标识，用于按场景批量操作 */
  scenarioId?: string;
}
```

`source` 区分两类来源：
- `baseline_script`：从磁盘活动脚本加载的预设片段（如昨夜睡眠），随初始化进入时间轴。
- `operator_override`：运行时通过控制面 API 追加的片段，用于演示干预。

#### 3.1.2 设备原始事件 DeviceEvent

片段"展开"后的离散传感器采样，模拟真实可穿戴设备上报的数据点。

```ts
/** 设备指标类型 */
type DeviceMetric =
  | 'heartRate'    // 心率（BPM）
  | 'steps'        // 步数（累计增量）
  | 'spo2'         // 血氧（%）
  | 'motion'       // 运动（IMU 模式标签，见 §5.3）
  | 'sleepStage'   // 睡眠分期（awake/light/deep/rem）
  | 'wearState'    // 佩戴状态
  | 'hrvRmssd'     // HRV（RMSSD）
  | 'stressLoad';  // 压力负荷（0~100）

interface DeviceEvent {
  eventId: string;
  profileId: string;
  /** YYYY-MM-DDTHH:mm，事件发生时刻 */
  measuredAt: string;
  metric: DeviceMetric;
  value: number | string | boolean;
  /** 固定为 'sensor'，表示设备来源 */
  source: 'sensor';
  /** 关联的片段 ID，用于反推归属 */
  segmentId?: string;
}
```

设计要点：
- `value` 是联合类型，因为 `sleepStage` / `motion` 用字符串标签，其余用数值。
- `segmentId` 让识别层能把事件归因回片段，是溯源链路的关键。
- 一个片段通常展开为**数十到数百个**事件，密度由生成器内部节奏决定（如心率每 2~5 分钟一个点）。

#### 3.1.3 识别事件 RecognizedEvent

从已同步的 DeviceEvent 反推"用户做了什么"，是 agent 消费的友好形态。

```ts
type RecognizedEventType =
  | ActivitySegmentType
  | MicroEventType
  | 'possible_caffeine_intake'   // 概率推导
  | 'possible_alcohol_intake';   // 概率推导

interface RecognizedEvent {
  recognizedEventId: string;
  profileId: string;
  type: RecognizedEventType;
  start: string;
  end: string;
  /** 置信度 0~1 */
  confidence: number;
  /** 证据链：引用哪些 DeviceEvent / 指标 */
  evidence: string[];
  sourceSegmentId?: string;
}
```

设计要点：
- 识别层不只"还原片段"，还能从原始指标**概率推导**片段未声明的事件（如从心率/HRV 异常推导 possible_caffeine_intake）。这让 agent 能看到比"操作者声明"更丰富的信号。
- `evidence` 让识别结果可解释，便于调试和 agent 引用。

### 3.2 虚拟时钟 DemoClock

```ts
interface DemoClock {
  profileId: string;
  timezone: string;       // 如 'Asia/Shanghai'
  /** YYYY-MM-DDTHH:mm，当前虚拟时刻 */
  currentTime: string;
}
```

**关键设计：离散命令驱动，非 tick**。

- 没有后台定时器，没有 `setInterval`。
- 时钟只在三种情况推进：
  1. `appendSegment` 默认把时钟推到片段 `end`（可用 `advanceClock: false` 关闭）。
  2. `appendMicroEvent` 默认把时钟推到事件 `eventEnd`。
  3. 显式 `advanceClock(profileId, minutes)` 推进 N 分钟。
- 这保证测试中"现在几点"完全由测试代码控制，可在任意时刻断言。

```ts
function advanceDemoClock(clock: DemoClock, minutes: number): DemoClock {
  if (minutes < 0) throw new Error('前进分钟数不能为负数');
  if (!Number.isInteger(minutes)) throw new Error('前进分钟数必须为整数');
  return { ...clock, currentTime: addMinutes(clock.currentTime, minutes) };
}
```

### 3.3 微事件 Micro Event

与 ActivitySegment 平行的轻量抽象，代表 **3~30 分钟的细粒度干预**（呼吸练习、短暂站立、冷水浸面、力量小睡等）。完整列表按 R1/R2/R3 三批组织（共约 30 种，见 §5.5），下面给出每批的代表类型以说明结构：

```ts
/** 微事件类型枚举（按交付批次分组，见 §5.5；此处为各批代表，完整列表在实现中维护） */
const MICRO_EVENT_TYPES = [
  // R1：呼吸、补水、体温、体态
  'micro_box_breathing', 'micro_calming_breathing', 'micro_hydration_walk',
  'micro_warm_shower', 'micro_posture_correction', 'micro_neuro_warmup',
  // R2：营养、淋浴、休息、移动
  'micro_recovery_meal', 'micro_power_nap', 'micro_screen_dimming',
  'micro_cool_shower', 'micro_outdoor_breather', 'micro_stair_climb',
  // R3：冥想、站姿、筋膜、迷走神经
  'micro_standing_work', 'micro_foam_rolling', 'micro_cold_face_dip',
  'micro_mindfulness_meditation', 'micro_muscle_relaxation', 'micro_light_meal',
  // ...其余早期基础类型（micro_deep_breathing / micro_short_walk 等）
] as const;

type MicroEventType = (typeof MICRO_EVENT_TYPES)[number];
type MicroEventParams = Record<string, number | string | boolean>;
```

**与 ActivitySegment 的关键区别**：

| 维度 | ActivitySegment | Micro Event |
|------|-----------------|-------------|
| 时长 | 较长（20min~8h） | 短（3~30min） |
| 是否进入 `segments` 数组 | 是 | **否** |
| 是否推进时钟 | 是（默认） | 是（默认） |
| 生成事件 | 是 | 是 |
| 重叠校验 | 强制 | 不强制 |
| 用途 | 主线活动编排 | 干预/微操演示 |

微事件**不创建 segment**，只生成 DeviceEvent 并推进时钟。这意味着微事件的时间窗可以与已有片段"叠加"（如在一个 prolonged_sedentary 片段中插入一次 box_breathing 微事件），更符合真实场景——人可以在久坐中短暂呼吸练习。

### 3.4 画像与基线

```ts
interface BaselineMetrics {
  restingHr: number;       // 静息心率
  hrv: number;             // HRV (RMSSD)
  spo2: number;            // 血氧
  avgSleepMinutes: number; // 日均睡眠时长
  avgSteps: number;        // 日均步数
}

interface SandboxProfile {
  profileId: string;
  name: LocalizableText;        // { zh, en }
  age: number;
  gender: 'male' | 'female';
  avatar: string;
  tags: LocalizableText[];
  /** 长期基线：生成历史数据的中心锚点 */
  baseline: BaselineMetrics;
  /** 可选：周维度覆盖 */
  weeklyBaseline?: Partial<BaselineMetrics>;
  /** 可选：当日精确值，覆盖生成抖动（见下） */
  dailyBaseline?: Partial<BaselineMetrics>;
}
```

**`baseline` 与 `dailyBaseline` 的区别（关键设计）**：
- `baseline` 是长期中心值，历史数据围绕它抖动生成。
- `dailyBaseline`（可选）把"当前活动日"的数值**精确钉死**，保证 demo 展示数值与画像预期完全一致，不被生成器的随机抖动稀释。

Service 在追加片段前会读取 profile 的 baseline，注入到 `params._baselineRestingHr` 等字段，让生成器以该 profile 的生理特征为锚点产出事件。

### 3.5 日级记录 DailyRecord

聚合产物，agent 最终消费的结构化形态。

```ts
interface DailyRecord {
  date: string;                  // YYYY-MM-DD
  hr?: number[];                 // 5 个分位锚点：[最低, 静息, 均值, 峰值, 恢复]
  hrv?: number;                  // RMSSD 日级均值
  sleep?: SleepData;
  activity?: ActivityData;
  spo2?: number;
  stress?: { load: number };
  intraday?: IntradaySnapshot[]; // 每 2 小时一个窗口，共 12 个
}

interface SleepData {
  totalMinutes: number;
  startTime: string; endTime: string;
  stages: { deep: number; light: number; rem: number; awake: number };
  score: number;
}

interface ActivityData {
  steps: number; calories: number; activeMinutes: number; distanceKm: number;
}

interface IntradaySnapshot {
  hour: number;  // 0, 2, ..., 22
  hr?: number; spo2?: number; steps?: number; sleepMinutes?: number; stressLoad?: number;
}
```

**`hr` 用 5 个锚点而非完整序列**：浓缩为 `[最低, 静息, 均值, 峰值, 恢复]`，既压缩存储，又保留心率曲线的关键形态供 UI 呈现。所有字段可空（`?`），用于表达"数据缺失"——某些画像可借此模拟可穿戴数据不全的真实用户。

### 3.6 资产分层

每个画像由三类资产构成：

| 资产类别 | 内容 | 生产方式 | 可否人工编辑 |
|----------|------|----------|--------------|
| **画像档案** | 人物字段 + baseline + 初始 demo 时刻 | 人工定义 | ✅ |
| **历史存档** | 连续 N 天的冻结 `DailyRecord[]` | 生成器产出 | ❌（会被覆盖）|
| **活动脚本** | 当日的 baseline 活动片段 `segments[]` | 生成器产出 | ❌（会被覆盖）|

**分层约束**：画像档案是唯一的人工入口，它既是展示数据也是生成参数；历史存档与活动脚本都由生成器从画像派生。调整画像后只需 recalibrate 重生成，即可保持三类资产一致。

磁盘布局建议：

```
data/
├── manifest.json                 # 画像 ID 列表
├── profiles/
│   └── <profileId>.json          # 画像档案 + initialDemoTime + 资产引用
├── history/
│   └── <profileId>-daily-records.json   # 冻结的历史 DailyRecord[]
└── timeline-scripts/
    └── <profileId>-day-1.json    # 当日 baseline 片段
```

---

## 4. 运行时控制主线

本章是整个系统的"骨架"，逐节展开 §2.2 的端到端控制流。

### 4.1 时间轴初始化

进程启动后，对每个 profile **懒初始化**：首次访问该 profile 时才构建状态。

```ts
function ensureDemoState(profileId: string): DemoProfileState {
  const existing = demoStateByProfile.get(profileId);
  if (existing) return existing;

  // 从磁盘加载 timeline script，构建初始状态
  const initial = buildInitialProfileState(dataDir, profileId);
  const segments = initial.segments;           // 通常是昨夜 sleep 片段
  const rawEvents = segments.flatMap(seg => generateEventsForSegment(seg));

  const state: DemoProfileState = {
    overrides: [],
    injectedEvents: [],
    clock: initial.demoClock,                  // 指向 initialDemoTime
    segments,
    rawEvents,
    syncState: { lastSyncedMeasuredAt: null, syncSessions: [] },
  };
  demoStateByProfile.set(profileId, state);
  return state;
}
```

要点：
- 初始 `rawEvents` 来自 baseline 片段的展开（如 8 小时睡眠展开成几百个 sleepStage / heartRate 事件）。
- 初始 `lastSyncedMeasuredAt` 为 null，意味着所有事件都在 pending，直到首次同步。
- 懒初始化让进程启动快，且只加载实际用到的 profile。

### 4.2 片段追加（核心操作）

`appendSegment` 是被调用最频繁的控制操作。纯函数签名：

```ts
interface TimelineAppendResult {
  segments: ActivitySegment[];   // 新的完整片段列表（不可变）
  events: DeviceEvent[];         // 新生成的事件
  newCurrentTime: string;        // 推进后的时钟
}

function appendSegment(
  currentSegments: ActivitySegment[],
  currentTime: string,
  segmentType: ActivitySegmentType,
  profileId: string,
  params?: Record<string, number | string | boolean>,
  offsetMinutes: number = 0,
  options?: { durationMinutes?: number; advanceClock?: boolean },
): TimelineAppendResult;
```

执行步骤（严格顺序）：

```
1. 校验 offsetMinutes >= 0
2. 计算 start = currentTime + offsetMinutes
3. 确定 duration = options.durationMinutes ?? DEFAULT_DURATION[segmentType]
4. 计算 end = start + duration
5. 校验 [start, end) 与所有已有片段不重叠 → 重叠抛错
6. 构造新 segment（source = 'operator_override'）
7. events = generateEventsForSegment(segment)   ← L1 确定性生成
8. updatedSegments = [...currentSegments, segment]   ← 不可变追加
9. newCurrentTime = options.advanceClock !== false ? end : currentTime
10. 返回 { segments, events, newCurrentTime }
```

**不重叠校验**是硬约束（§9.1）：

```ts
for (const existing of currentSegments) {
  if (start < existing.end && end > existing.start) {
    throw new Error(`新片段 (${start}~${end}) 与已有片段 "${existing.segmentId}" 重叠`);
  }
}
```

**默认时长表**（分钟）：

```ts
const DEFAULT_DURATION: Record<ActivitySegmentType, number> = {
  meal_intake: 20, steady_cardio: 15, prolonged_sedentary: 120,
  intermittent_exercise: 30, walk: 30, sleep: 480, nap: 60,
  deep_focus: 120, anxiety_episode: 30, alcohol_intake: 180,
  caffeine_intake: 120, relaxation: 30, strength_training: 30,
};
```

**holder 层的自动同步**（关键）：纯函数只返回新数据，**不**触碰状态。holder 拿到结果后做三件事：

```ts
// 1. 不可变替换 DemoProfileState
const updatedState: DemoProfileState = {
  ...state,
  segments: result.segments,
  rawEvents: [...state.rawEvents, ...result.events],
  ...(advanceClock ? { clock: { ...state.clock, currentTime: result.newCurrentTime } } : {}),
};

// 2. 自动同步：把新事件中 measuredAt <= clock 的部分推过水位线
const internalSync = rebuildSyncState(updatedState);
const { state: newSync } = performSync(internalSync, 'app_open', updatedState.clock.currentTime);

// 3. 写回 holder
demoStateByProfile.set(profileId, {
  ...updatedState,
  syncState: { lastSyncedMeasuredAt: newSync.lastSyncedMeasuredAt, syncSessions: [...newSync.syncSessions] },
});
```

> 为什么"追加即同步"？因为在演示场景中，操作者追加一个片段后期望它立即可见（agent 马上能查到）。如果保留 pending 状态，需要额外一次显式同步调用，增加心智负担。自动同步把"追加"变成原子的"追加 + 落地"。

### 4.3 微事件追加

```ts
interface MicroEventAppendResult {
  events: DeviceEvent[];
  newCurrentTime: string;
  eventStart: string;
  eventEnd: string;
  segmentId: string;   // 用于事件归因，但不进入 state.segments
}

function appendMicroEvent(
  currentTime: string,
  microEventType: MicroEventType,
  profileId: string,
  params?: MicroEventParams,
  options?: { durationMinutes?: number; advanceClock?: boolean },
): MicroEventAppendResult;
```

与 `appendSegment` 的差异：
- `eventStart = currentTime`（无 offset 概念，永远紧贴当前时刻）。
- `durationMinutes` 缺省时取 `MICRO_EVENT_REGISTRY[type].defaultDurationMinutes`，再缺省 5。
- **不**校验重叠（微事件可叠加在已有片段上）。
- **不**追加到 `state.segments`，只把事件并入 `rawEvents` 并推进时钟。
- 生成的 `segmentId` 格式为 `seg-micro-${type}-${start}`，仍写入事件的 `segmentId` 字段供识别层归因。

holder 层同样执行自动同步，逻辑与 §4.2 一致。

### 4.4 时钟推进

显式推进，用于"什么都不发生，只是时间过去了"的场景（如等待 30 分钟看 intraday 窗口变化）。

```ts
advanceClock(profileId: string, minutes: number): void;
```

实现仅替换 `clock.currentTime`，**不**触发同步。如果希望推进后把 pending 事件落地，需显式调用 `performSync`（或由 Service 在合适时机统一触发）。

### 4.5 同步机制（水位线）

同步引擎是一个**单调前进的水位线状态机**：

```ts
interface SyncState {
  profileId: string;
  events: DeviceEvent[];              // 全量事件（pending + synced 混存）
  lastSyncedMeasuredAt: string | null; // 水位线
  syncSessions: SyncSession[];        // 同步历史
}
```

判定规则（字符串比较，因为 `YYYY-MM-DDTHH:mm` 字典序 = 时间序）：
- `pending`：`measuredAt > lastSyncedMeasuredAt`（或水位线为 null）。
- `synced`：`measuredAt <= lastSyncedMeasuredAt`。

```ts
function performSync(
  state: SyncState,
  trigger: 'app_open' | 'manual_refresh',
  currentTime: string,
): { state: SyncState; session: SyncSession } {
  const pending = getPendingEvents(state);
  const toSync = pending.filter(evt => evt.measuredAt <= currentTime);
  const maxMeasuredAt = toSync.length > 0
    ? toSync.reduce((max, evt) => evt.measuredAt > max ? evt.measuredAt : max, toSync[0]!.measuredAt)
    : null;

  const session = buildSyncSession(state.profileId, trigger, currentTime,
    state.lastSyncedMeasuredAt, toSync, maxMeasuredAt);

  return {
    state: {
      ...state,
      lastSyncedMeasuredAt: maxMeasuredAt ?? state.lastSyncedMeasuredAt,
      syncSessions: [...state.syncSessions, session],
    },
    session,
  };
}
```

要点：
- **水位线只进不退**。本批无新事件时保留旧值，绝不回退。
- `currentTime` 是同步的"上界"：即便有事件 `measuredAt` 在未来（`> currentTime`），它们仍保持 pending。这模拟"设备只能上传到当前时刻的数据"。
- 每次同步追加一条 `SyncSession` 记录，含 `uploadedMeasuredRange` 和 `uploadedEventCount`，用于 UI 展示"同步了多少数据"。

**为什么用字符串水位线而不是布尔标志？**
- 单一字段即可判定状态，无需遍历事件数组标记。
- 字符串字典序天然等价于时间序（得益于统一的时间戳格式）。
- 水位线本身就是"最后同步到哪"的语义，可直接展示。

### 4.6 事件识别

`recognizeEvents(syncedEvents, profileBaseline)` 把已同步事件反推为 `RecognizedEvent[]`。两层来源：

1. **片段还原**：按 `segmentId` 分组，直接产出对应类型的 recognized event（高置信度）。
2. **概率推导**：对未归属的事件用滑动窗口检测异常模式：
   - 心率骤升 + HRV 下降 → `possible_caffeine_intake`
   - 心率异常 + 步态不稳 → `possible_alcohol_intake`

```ts
function recognizeEvents(
  syncedEvents: DeviceEvent[],
  baseline: BaselineMetrics,
): RecognizedEvent[];
```

设计要点：
- **互斥过滤**：当 caffeine 与 alcohol 推导结果在时间窗上重叠超过阈值（如 30 分钟），优先保留置信度更高的一方，避免重复识别。
- **证据链**：每个 recognized event 附带 `evidence: string[]`，列出引用的事件 ID 或指标特征，便于调试与 agent 引用。
- 识别是**只读派生**，不修改 synced 事件，结果可缓存（见 §6.5）。

### 4.7 派生时态状态

某些 agent 推理需要"近因"信号，如"最近 30 分钟是否吃过饭"。这些不直接出现在事件列表，而由 recognized events 派生：

```ts
type DerivedTemporalStateType = 'recent_meal_30m';

interface DerivedTemporalState {
  type: DerivedTemporalStateType;
  profileId: string;
  sourceRecognizedEventId: string;
  activeAt: string;
  metadata?: Record<string, unknown>;
}
```

派生函数扫描 recognized events，对匹配类型（如 `meal_intake`）的事件，若 `activeAt` 在 `currentTime - 30min` 内，则产出一个派生状态。这是 agent 判断"现在该不该建议散步"的关键输入。

### 4.8 日级聚合

`aggregateCurrentDayRecord` 把当日所有 synced events 压缩为一条 `DailyRecord`，再与冻结的历史记录合并：

```
syncedEvents (当日)
    │ aggregateCurrentDayRecord
    ▼
当前日 DailyRecord
    │ mergeCurrentDayRecord（替换历史中同日记录）
    ▼
完整 records[]（返回给 agent）
```

聚合规则：
- **hr**：收集当日所有 heartRate 事件，计算 `[min, resting(分位), mean, max, recovery]` 五个锚点。
- **hrv**：当日 hrvRmssd 事件均值。
- **sleep**：由 sleepStage 事件序列反推起止时间和各阶段时长。
- **activity**：累加 steps 事件，换算 calories / distance。
- **intraday**：按 2 小时窗口（0, 2, ..., 22 共 12 个）分桶，每桶内聚合各项指标。

聚合是纯函数，可缓存，仅在 synced events 变化时失效（见 §6.5）。

### 4.9 重置与重校准

两种维护操作：

| 操作 | 行为 | 影响 |
|------|------|------|
| `resetProfileTimeline(profileId)` | 删除该 profile 的 demoState，下次访问时重新懒初始化 | 内存态清空，磁盘资产不变 |
| `recalibrate(profileId)` | 重新生成磁盘上的 history + timeline-script，然后 reset | 磁盘 + 内存都更新 |

`recalibrate` 用于画像档案被编辑后，让派生资产重新一致。它调用 §5.6 的历史生成器回写磁盘，再触发 reset 让运行时加载新资产。

---

## 5. 确定性生成引擎

确定性是整个系统的可测试性基石。本章描述"为什么确定"和"怎么确定"。

### 5.1 确定性的意义

> 同一 seed + 同一画像参数 + 同一指令序列 → 永远产出相同结果。

带来的能力：
- **可回归**：mock 数据可纳入版本控制，schema 演进后安全重生成。
- **可断言**：测试可对生成结果的精确形态（事件数、心率曲线形状）做断言，不依赖随机容忍度。
- **可复现**：demo 中看到的数值在下次启动时完全一致，不会"上次 HRV 是 90，这次变成 87"。

### 5.2 PRNG 选型

系统使用两种确定性随机源，按场景分工：

#### 5.2.1 mulberry32（用于历史数据生成）

轻量、快速、种子化的伪随机数生成器。输入一个 32 位种子，输出 [0, 1) 区间的均匀分布序列。

```ts
function mulberry32(seed: number): () => number {
  let a = seed;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
```

适用：逐日生成历史数据时，每天围绕 baseline 抖动（§5.6）。

#### 5.2.2 Math.sin-based deterministic（用于事件生成器）

事件生成器需要"对同一时间偏移永远产出同一扰动"，但不希望维护 PRNG 状态机（因为事件可乱序生成、可局部重生成）。采用无状态的三角函数扰动：

```ts
/** 无状态确定性扰动：同一 (seed, offset) 永远返回同一 [-1, 1) 值 */
function deterministic(seed: number, offset: number): number {
  const x = Math.sin(seed * 999.13 + offset * 0.017) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
}
```

适用：生成器内部为每个事件点计算 `baseValue + deterministic(seed, minuteOffset) * amplitude`，无需维护序列状态，事件可独立重算。

### 5.3 生成器模式

所有 ActivitySegment 生成器遵循统一模式：

```ts
type SegmentGenerator = (segment: ActivitySegment, baseline: BaselineMetrics) => DeviceEvent[];

const GENERATOR_MAP: Record<ActivitySegmentType, SegmentGenerator> = {
  meal_intake:   generateMealIntakeEvents,
  steady_cardio: generateSteadyCardioEvents,
  // ...
};

function generateEventsForSegment(segment: ActivitySegment): DeviceEvent[] {
  const generator = GENERATOR_MAP[segment.type];
  if (!generator) throw new Error(`未注册的片段类型: ${segment.type}`);
  const baseline = extractBaselineFromParams(segment.params);
  return generator(segment, baseline);
}
```

每个生成器内部：
1. 解析 `segment.params`（含 Service 注入的 `_baseline*`）。
2. 计算时长（分钟）。
3. 按指标的采样节奏（心率每 2~5 分钟，步数每分钟等）生成事件序列。
4. 每个事件的 value = `baseValue + deterministic(seed, minuteOffset) * amplitude`，并按生理曲线（如运动中心率渐升、运动后回落）调整 baseValue。

**生理曲线建模**是生成器的核心。例如 steady_cardio：

```
心率曲线（30 分钟）:
  0~3min:  从 restingHr 线性升到 targetHr（热身）
  3~27min: 围绕 targetHr 抖动（稳态）
  27~30min:从 targetHr 线性回到 restingHr + 10（恢复）

其中 targetHr = restingHr + 79（中等强度有氧区间）
```

**IMU 运动 pattern**：motion 指标用预定义的 `MotionPattern` 标签（如 `periodic_walk` / `still_supine`），每个 ActivitySegment 类型映射到一个或多个 pattern，由 `MICRO_MOTION_PATTERN_MAP` 查表决定。

### 5.4 ActivitySegment 生成器设计范式

13 种类型可归为几族，每族共享曲线骨架：

| 族 | 类型 | 曲线特征 |
|----|------|----------|
| 运动 | steady_cardio / intermittent_exercise / strength_training / walk | 心率渐升→稳态→回落；步数周期性增量；motion 切换为 periodic_* |
| 静态 | prolonged_sedentary / deep_focus | 心率平稳偏低；motion 为 still_*；stress 可能上行 |
| 进食摄入 | meal_intake / caffeine_intake / alcohol_intake | 心率轻度上升；alcohol/caffeine 有延迟效应曲线 |
| 睡眠 | sleep / nap | 心率低于 restingHr；sleepStage 按 deep→light→rem 循环 |
| 情绪 | anxiety_episode / relaxation | anxiety 心率骤升 + HRV 骤降；relaxation 反之 |

新增类型时复用对应族的曲线骨架，调整参数即可（见 §8.3）。

### 5.5 微事件生成器

微事件生成器与 §5.3 同构，但更轻量（3~30 分钟，事件数少）。

注册结构：

```ts
interface MicroEventDefinition {
  type: MicroEventType;
  defaultDurationMinutes: number;
  /** 该微事件会触发的 IMU 模式，用于 motion 指标 */
  profile: MotionPattern[];
  /** 生成器函数引用 */
}

const MICRO_EVENT_REGISTRY: Record<MicroEventType, MicroEventDefinition> = {
  micro_box_breathing: { type: 'micro_box_breathing', defaultDurationMinutes: 5, profile: ['still_upright'] },
  // ...
};
```

生成器同样查表：

```ts
const PROFILE_GENERATOR_MAP: Record<MicroEventType, MicroEventGenerator> = {
  micro_box_breathing: generateBoxBreathingEvents,
  // ...
};
```

**R1/R2/R3 批次标记**：类型枚举中的注释标记（`// === R1 ===` 等）仅代表**交付批次**，运行时无语义差别。它的作用是让团队能分批交付生成器，每批内自洽可测试。

### 5.6 历史数据生成

`recalibrate` 时为每个 profile 生成连续 N 天的历史 `DailyRecord[]`，配置如下：

```ts
interface ProfileConfig {
  profileId: string;
  seed: number;       // 固定种子，如 42 / 137 / 256 / 314
  baseline: BaselineMetrics;
  missingRate: { hr: number; activity: number; spo2: number }; // 各指标缺失概率
  trend: { stressDirection: number; sleepDirection: number; hrDirection: number }; // 随 dayIndex 线性漂移
}
```

生成流程：
1. 用 `mulberry32(seed)` 创建 PRNG。
2. 逐日生成：按 `missingRate` 概率置空字段，其余围绕 `baseline` 抖动。
3. 睡眠由 `totalMinutes` 反推起止时间，按比例分配 deep/light/rem/awake。
4. 分时数据每 2 小时一窗，结合睡眠窗口重叠计算 `sleepMinutes`。
5. **当日钉死**：对历史最后一天（= 当前活动日）用 `dailyBaseline` 精确覆盖睡眠时长、HRV、静息 HR、SpO2、步数，并同步缩放 intraday。

`missingRate` 制造字段级缺失，模拟真实可穿戴数据不全的用户；`trend` 让指标随时间漂移（如压力上行、睡眠缩短），制造趋势而非静态平铺。

---

## 6. 状态管理与生命周期

### 6.1 不可变性原则

**所有数据变换返回新对象，绝不就地修改**。这是整个系统的强约束：

```ts
// 错误：就地修改
state.segments.push(newSegment);

// 正确：不可变替换
const newState = { ...state, segments: [...state.segments, newSegment] };
demoStateByProfile.set(profileId, newState);
```

理由：
- **可预测**：每次状态变更都可见、可追踪。
- **可并发读**：读操作拿到的是一个一致快照，不会被写操作半途打断。
- **易调试**：状态机可回放，每个快照独立完整。

### 6.2 内存 holder

唯一的可变点是 `createOverrideStore` 返回的 holder，内部用 `Map` 按 profileId 隔离状态：

```ts
function createOverrideStore(defaultProfileId: string, options?: { dataDir?: string }) {
  const demoStateByProfile = new Map<string, DemoProfileState>();
  // ...overridesByProfile, eventsByProfile（其他通道）

  function ensureDemoState(profileId: string): DemoProfileState { /* §4.1 */ }

  return {
    getDemoClock(profileId) { return { ...ensureDemoState(profileId).clock }; },
    appendSegment(profileId, ...) { /* §4.2，写回 demoStateByProfile */ },
    // ...
  };
}
```

**进程级生命周期**：状态只在进程内存，进程重启即清空，回到磁盘资产的初始态。这是有意为之——demo 应用的状态不需要持久化，重启即"重置 demo"。

**返回值防御性拷贝**：所有 getter 返回数组的浅拷贝（`[...state.segments]`）和对象的展开（`{ ...state.clock }`），防止调用方就地修改破坏 holder 内部状态。

### 6.3 DemoState 结构

```ts
interface DemoProfileState {
  overrides: OverrideEntry[];      // 其他 override 通道（数值覆写等）
  injectedEvents: DatedEvent[];    // Active Sensing 注入的事件
  clock: DemoClock;
  segments: ActivitySegment[];
  rawEvents: DeviceEvent[];        // pending + synced 混存
  syncState: {
    lastSyncedMeasuredAt: string | null;
    syncSessions: SyncSession[];
  };
}
```

注意 `rawEvents` **混存** pending 与 synced，由 `lastSyncedMeasuredAt` 水位线动态划分。这避免维护两个数组带来的同步问题。

> `overrides` 与 `injectedEvents` 属于**扩展通道**（数值覆写、Active Sensing banner 等），非时间轴核心。若新仓库不需要这些能力，可从结构中删除而不影响时间轴主流程；本文后续章节聚焦 `clock / segments / rawEvents / syncState` 四个核心字段。

### 6.4 磁盘资产与 recalibrate

磁盘只存静态 seed（profile 档案、history、timeline-script），运行时不写回，除非显式 `recalibrate`。

```
recalibrate(profileId):
  1. 读取 profile 档案（含编辑后的 baseline）
  2. 用 §5.6 生成器重生成 history → 回写 history/<id>-daily-records.json
  3. 用 §5.3 生成器重生成 timeline-script → 回写 timeline-scripts/<id>-day-1.json
  4. resetProfileTimeline(profileId) → 清空内存，触发懒初始化加载新资产
```

### 6.5 缓存与失效

Service 层维护几个派生缓存（识别事件、派生时态、聚合记录、session memory），它们都是**只读派生**，可安全缓存。失效规则：

| 缓存 | 失效触发 |
|------|----------|
| recognizedEvents | 该 profile 的 syncedEvents 变化（追加 / 同步） |
| derivedTemporalStates | recognizedEvents 失效 |
| aggregatedDailyRecord | syncedEvents 变化 |
| sessionMemory（agent 上下文） | 任何时间轴变更 |

失效后下次查询时按需重算。**不要在 holder 层缓存**——holder 只管状态原子性，缓存是 Service 的职责，避免层间耦合。

---

## 7. 对外接口契约

### 7.1 控制面 HTTP API

| 方法 & 路径 | 作用 | 关键参数 |
|-------------|------|----------|
| `POST /timeline-append` | 追加 ActivitySegment | `profileId`, `type`, `params?`, `offsetMinutes?`, `durationMinutes?`, `advanceClock?` |
| `POST /micro-event-append` | 追加微事件 | `profileId`, `type`, `params?`, `durationMinutes?`, `advanceClock?` |
| `POST /advance-clock` | 推进虚拟时钟 | `profileId`, `minutes` |
| `POST /reset-profile-timeline` | 重置该 profile 时间轴 | `profileId` |
| `POST /recalibrate` | 重生成磁盘资产并重置 | `profileId` |
| `GET /state` | 查询完整状态（clock/segments/sync） | `profileId` |

所有写操作返回**操作结果**（新事件、新时钟、片段起止），便于调用方立即断言。

### 7.2 请求/响应 schema

用 Zod 在 API 边界强制校验：

```ts
import { z } from 'zod';

const timestampSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);

const timelineAppendSchema = z.object({
  profileId: z.string().min(1),
  type: z.enum([
    'meal_intake', 'steady_cardio', 'prolonged_sedentary',
    'intermittent_exercise', 'walk', 'sleep', 'nap', 'deep_focus',
    'anxiety_episode', 'alcohol_intake', 'caffeine_intake',
    'relaxation', 'strength_training',
  ]),
  params: z.record(z.union([z.number(), z.string(), z.boolean()])).optional(),
  offsetMinutes: z.number().int().min(0).optional(),
  durationMinutes: z.number().int().min(1).optional(),
  advanceClock: z.boolean().optional(),
});

const timelineAppendResponseSchema = z.object({
  events: z.array(deviceEventSchema),
  newCurrentTime: timestampSchema,
  segmentStart: timestampSchema,
  segmentEnd: timestampSchema,
});
```

数值范围约束（生成器内部值）：

| 指标 | 范围 |
|------|------|
| heartRate | 30 ~ 220 |
| spo2 | 80 ~ 100 |
| hrvRmssd | 0 ~ 200 |
| stressLoad | 0 ~ 100 |
| steps（单点增量） | 0 ~ 200 |

### 7.3 Agent 只读查询接口

Agent **不直接写时间轴**，只读。查询工具示例：

```ts
const queryTimelineEventsTool = {
  name: 'query_timeline_events',
  description: '查询当前 profile 最近 N 分钟的识别事件',
  inputSchema: z.object({
    profileId: z.string(),
    windowMinutes: z.number().int().min(1).max(1440).default(60),
  }),
  execute: async ({ profileId, windowMinutes }) => {
    const clock = store.getDemoClock(profileId);
    const since = addMinutes(clock.currentTime, -windowMinutes);
    const recognized = getCachedRecognizedEvents(profileId);
    return recognized.filter(e => e.end >= since);
  },
};
```

完整的时间轴快照通过 `getTimelineSync(profileId)` 注入到 agent 的 context packet，让模型在每轮对话中都能看到"当前虚拟用户做了什么"。

### 7.4 Active Sensing 通道

每次 `appendSegment` / `appendMicroEvent` 后，Service 向一个 **Active Sensing 通道**注入一条 banner 事件，通知前端"新数据到达"。这是控制面 → 前端的副作用通道，独立于 agent 的只读查询。

```
操作者追加片段
    │
    ├─▶ holder 更新状态（§4.2）
    ├─▶ Service 失效缓存（§6.5）
    └─▶ Service 注入 Active Sensing banner ─▶ 前端 UI 提示"新数据"
```

---

## 8. 扩展机制

### 8.1 新增 ActivitySegment 类型（三步）

1. **加枚举**：在 `ActivitySegmentType` 联合类型和 Zod enum 中添加新类型。
2. **加默认时长**：在 `DEFAULT_DURATION` 表中添加。
3. **注册生成器**：在 `GENERATOR_MAP` 中添加 `SegmentGenerator` 实现。

无需修改 appendSegment / holder / API 任何代码——它们都通过查表分发。新增类型立即可用。

### 8.2 新增微事件类型（四步）

1. **加枚举**：在 `MICRO_EVENT_TYPES` 中添加（建议标注交付批次注释）。
2. **加定义**：在 `MICRO_EVENT_REGISTRY` 中添加 `MicroEventDefinition`（含 defaultDuration、motion profile）。
3. **加生成器**：在 `PROFILE_GENERATOR_MAP` 中添加 `MicroEventGenerator` 实现。
4. **加 IMU 映射**：在 `MICRO_MOTION_PATTERN_MAP` 中添加 motion 指标映射。

### 8.3 生成器编写规范

每个生成器必须满足三条：

1. **确定性**：相同 `segment` + `baseline` 永远产出相同事件序列。禁止使用 `Math.random()` / `Date.now()`，只用 §5.2 的 PRNG 或 `deterministic(seed, offset)`。
2. **生理合理性**：value 必须落在 §7.2 的数值范围内，且曲线形态符合该活动的真实生理特征（如运动心率必须先升后降，不能突变）。
3. **metric 覆盖**：至少覆盖 `heartRate` 和 `motion` 两类指标，让识别层有足够信号。睡眠类必须覆盖 `sleepStage`。

### 8.4 注册机制

纯 Map 查表，**无装饰器、无注解、无反射**：

```ts
const GENERATOR_MAP: Record<ActivitySegmentType, SegmentGenerator> = { ... };
const MICRO_EVENT_REGISTRY: Record<MicroEventType, MicroEventDefinition> = { ... };
const PROFILE_GENERATOR_MAP: Record<MicroEventType, MicroEventGenerator> = { ... };
```

理由：
- 查表是最直接的分发机制，无运行时开销。
- 注册即"在该 Map 加一行"，diff 友好，review 清晰。
- 不依赖任何元数据反射，移植到任何语言都是同样的字典查表。

---

## 9. 约束与错误处理

### 9.1 片段不重叠校验

`appendSegment` 强制新片段的 `[start, end)` 与所有已有片段不相交：

```ts
if (start < existing.end && end > existing.start) throw new Error('片段重叠');
```

理由：ActivitySegment 代表"用户主要活动状态"，同时只能有一个。重叠会让识别层归因混乱（一个心率点同时属于两个片段）。

**微事件不受此约束**——它们代表"叠加在主线上的微操"，可以发生在任何时段（如久坐中的呼吸练习）。

### 9.2 Schema 数值范围校验

所有数值在 API 边界和生成器内部双重校验。Zod schema 拒绝越界输入；生成器内部的 `clamp(value, min, max)` 兜底，防止确定性扰动的极值突破生理范围。

### 9.3 时间格式约束

所有时间戳必须匹配 `^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$`（精度到分钟）。这带来两个红利：
- 字符串字典序 = 时间序，水位线比较直接用 `<=`。
- 无时区后缀，所有时间在 profile 的 `timezone` 下解释，避免时区漂移。

### 9.4 错误传播策略

按"边界校验 vs 内部信任"分层：

- **API 边界**（L4）：所有外部输入经 Zod 校验，失败返回 400 + 详细错误。
- **纯函数边界**（L1）：对不可恢复的违反（重叠、负偏移、未注册类型）抛错，让调用方（holder/service）决定如何转译为 HTTP 错误。
- **生成器内部**：信任传入的 baseline 和 params（已被 Service 校验注入），只做防御性 clamp，不抛错。

**绝不静默吞错**。所有错误要么抛出，要么转译为用户可读的 HTTP 错误。

### 9.5 "无时间合理性校验"的权衡说明

本设计**不**校验"凌晨 3 点不能吃饭"这类语义合理性。理由：
- 演示场景需要能展示异常模式（夜班工人、睡眠障碍、不规律饮食），时间合理性校验会阻碍这些场景。
- 生理合理性由生成器内部的曲线建模保证（如凌晨吃饭的生理曲线仍是合理的进餐曲线），而非时间窗口。
- 时间合理性是 agent 的职责（由 AI 判断"这个时间吃饭不寻常"），而非数据工厂的职责。

唯一的时间约束是 sleep 片段的 bed/wake 时刻由 `avgSleepMinutes` 反推，保证睡眠时长自洽。

---

## 10. 测试策略

### 10.1 测试金字塔

```
        ┌──────────┐
        │   E2E    │  ← HTTP 全链路（少数，验证 API 契约）
        ├──────────┤
        │ 集成测试  │  ← holder + service（验证状态流转）
        ├──────────┤
        │ 单元测试  │  ← L1 纯函数（绝大多数，验证算法）
        └──────────┘
```

绝大多数测试在 L1 单元层，因为纯函数易构造、易断言、快如闪电。

### 10.2 时间驱动方式

**不**用 tick / mock timer。直接构造 segment 传入固定 `currentTime`：

```ts
const seg = makeSegment('walk', { start: '2026-04-21T08:00', end: '2026-04-21T08:30' });
const events = generateEventsForSegment(seg);
// events 的时间戳完全由 seg.start/end 决定，无需推进时钟
```

这让测试无状态、无时序、可并行。

### 10.3 断言模式：生理曲线形状 > 精确值

断言生成结果的**形态特征**，而非精确数值。因为确定性扰动会让具体值随种子变化，但曲线形状稳定。

示例：

```ts
// box_breathing：心率应下降，HRV 应上升
expect(hr.at(-1)).toBeLessThan(hr[0] - 6);
expect(hrv.at(-1)).toBeGreaterThan(hrv[0] + 8);

// cold_face_dip：潜水反射，心率骤降
expect(Math.min(...hr)).toBeLessThan(restingHr - 8);

// power_nap：心率应低于静息
expect(Math.max(...hr)).toBeLessThan(restingHr);

// stair_climb：步数 > 200，心率 > restingHr + 15
expect(totalSteps).toBeGreaterThan(200);
expect(Math.max(...hr)).toBeGreaterThan(restingHr + 15);
```

### 10.4 确定性带来的可回归性

由于 §5 的确定性保证，这些断言永远稳定，不会因运行时机不同而 flaky。schema 演进后重生成数据，断言仍应通过（除非刻意改了曲线模型）。

### 10.5 各层测试覆盖建议

| 层 | 测试重点 |
|----|----------|
| L1 生成器 | 每种类型的曲线形态、metric 覆盖、数值范围、确定性（同输入同输出） |
| L1 同步引擎 | 水位线单调性、pending/synced 划分、空批次保水位线 |
| L1 识别 | 片段还原、概率推导、互斥过滤、证据链完整性 |
| L1 聚合 | hr 五锚点、睡眠反推、intraday 分桶、与历史合并 |
| L2 holder | 不可变性（输入不被改）、懒初始化、自动同步触发 |
| L3 service | 缓存失效正确性、banner 注入、baseline 注入 |
| L4 API | schema 校验、错误转译、响应契约 |

---

## 附录 A：术语表

| 术语 | 含义 |
|------|------|
| **Timeline Control** | 本设计描述的时间轴控制引擎整体 |
| **ActivitySegment** | 活动片段，时间轴的编排单元（13 种类型） |
| **Micro Event** | 微事件，轻量干预（3~30min，不进入 segments） |
| **DeviceEvent** | 设备原始事件，片段展开后的传感器采样 |
| **RecognizedEvent** | 识别事件，从 DeviceEvent 反推的 agent 友好形态 |
| **DemoClock** | 虚拟时钟，离散命令驱动 |
| **profile** | 虚拟用户画像，数据的"主语" |
| **baseline** | 画像的长期生理基线，生成数据的锚点 |
| **dailyBaseline** | 当日精确值，钉死 demo 日数值 |
| **synced / pending** | 事件的同步状态，由水位线划分 |
| **operator_override** | 运行时干预来源（对应 baseline_script 的脚本来源） |
| **recalibrate** | 重生成磁盘资产并重置运行时 |
| **Active Sensing** | 控制面 → 前端的副作用通知通道 |

## 附录 B：完整类型定义汇总

```ts
// ===== 时间戳约束 =====
// 所有 timestamp 字段：YYYY-MM-DDTHH:mm（匹配 /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/）

// ===== 活动片段 =====
type ActivitySegmentType =
  | 'meal_intake' | 'steady_cardio' | 'prolonged_sedentary'
  | 'intermittent_exercise' | 'walk' | 'sleep' | 'nap'
  | 'deep_focus' | 'anxiety_episode' | 'alcohol_intake'
  | 'caffeine_intake' | 'relaxation' | 'strength_training';

interface ActivitySegment {
  segmentId: string;
  profileId: string;
  type: ActivitySegmentType;
  start: string;  // YYYY-MM-DDTHH:mm
  end: string;    // YYYY-MM-DDTHH:mm
  params?: Record<string, number | string | boolean>;
  source: 'baseline_script' | 'operator_override';
  scenarioId?: string;
}

// ===== 设备事件 =====
type DeviceMetric =
  | 'heartRate' | 'steps' | 'spo2' | 'motion'
  | 'sleepStage' | 'wearState' | 'hrvRmssd' | 'stressLoad';

interface DeviceEvent {
  eventId: string;
  profileId: string;
  measuredAt: string;
  metric: DeviceMetric;
  value: number | string | boolean;
  source: 'sensor';
  segmentId?: string;
}

// ===== 识别事件 =====
type RecognizedEventType =
  | ActivitySegmentType | MicroEventType
  | 'possible_caffeine_intake' | 'possible_alcohol_intake';

interface RecognizedEvent {
  recognizedEventId: string;
  profileId: string;
  type: RecognizedEventType;
  start: string; end: string;
  confidence: number;
  evidence: string[];
  sourceSegmentId?: string;
}

// ===== 虚拟时钟 =====
interface DemoClock {
  profileId: string;
  timezone: string;
  currentTime: string;
}

// ===== 同步状态 =====
interface SyncSession {
  syncId: string;
  profileId: string;
  trigger: 'app_open' | 'manual_refresh';
  startedAt: string; finishedAt: string;
  uploadedMeasuredRange: { start: string; end: string } | null;
  uploadedEventCount: number;
}

interface SyncState {
  profileId: string;
  events: DeviceEvent[];
  lastSyncedMeasuredAt: string | null;
  syncSessions: SyncSession[];
}

// ===== 画像与基线 =====
interface BaselineMetrics {
  restingHr: number; hrv: number; spo2: number;
  avgSleepMinutes: number; avgSteps: number;
}

interface SandboxProfile {
  profileId: string;
  name: LocalizableText;
  age: number;
  gender: 'male' | 'female';
  avatar: string;
  tags: LocalizableText[];
  baseline: BaselineMetrics;
  weeklyBaseline?: Partial<BaselineMetrics>;
  dailyBaseline?: Partial<BaselineMetrics>;
}

// ===== 日级记录 =====
interface DailyRecord {
  date: string;
  hr?: number[];                 // [最低, 静息, 均值, 峰值, 恢复]
  hrv?: number;
  sleep?: SleepData;
  activity?: ActivityData;
  spo2?: number;
  stress?: { load: number };
  intraday?: IntradaySnapshot[];
}

interface SleepData {
  totalMinutes: number;
  startTime: string; endTime: string;
  stages: { deep: number; light: number; rem: number; awake: number };
  score: number;
}

interface ActivityData {
  steps: number; calories: number;
  activeMinutes: number; distanceKm: number;
}

interface IntradaySnapshot {
  hour: number;  // 0, 2, ..., 22
  hr?: number; spo2?: number; steps?: number;
  sleepMinutes?: number; stressLoad?: number;
}

// ===== 运行时状态 =====
interface DemoProfileState {
  overrides: OverrideEntry[];      // 扩展通道（数值覆写），非时间轴核心，可按需裁剪
  injectedEvents: DatedEvent[];    // 扩展通道（Active Sensing），非时间轴核心，可按需裁剪
  clock: DemoClock;
  segments: ActivitySegment[];
  rawEvents: DeviceEvent[];
  syncState: {
    lastSyncedMeasuredAt: string | null;
    syncSessions: SyncSession[];
  };
}

// ===== LocalizableText（本地化文本）=====
interface LocalizableText {
  zh: string;
  en: string;
}
```

## 附录 C：端到端时序示例

场景：操作者为 profile 追加一段 30 分钟步行，然后 agent 查询最近 1 小时事件。

```
[t=0]  操作者 → POST /timeline-append
         { profileId: "p1", type: "walk", durationMinutes: 30 }

       Service:
         1. 读 baseline: restingHr=60, hrv=70, spo2=98
         2. holder.appendSegment("p1", "walk", {_baselineRestingHr:60, ...})
              ├─ start = "2026-04-21T08:00" (当前 clock)
              ├─ end   = "2026-04-21T08:30"
              ├─ 重叠校验通过
              ├─ generateEventsForSegment → 32 个事件
              │   (8 个 heartRate, 15 个 steps, 5 个 motion, 4 个 spo2/stress)
              ├─ rawEvents 追加 32 个事件
              ├─ clock 推进到 08:30
              └─ performSync → 水位线从 null 推到 08:30
                 (32 个事件全部 measuredAt <= 08:30，全部 synced)
         3. 失效 recognizedEvents / aggregatedDailyRecord 缓存
         4. 注入 Active Sensing banner

       响应:
         { events: [...32 个], newCurrentTime: "2026-04-21T08:30",
           segmentStart: "2026-04-21T08:00", segmentEnd: "2026-04-21T08:30" }

[t=1]  agent → query_timeline_events({ profileId: "p1", windowMinutes: 60 })

       查询工具:
         1. clock.currentTime = "2026-04-21T08:30"
         2. since = "2026-04-21T07:30"
         3. 重算 recognizedEvents（缓存已失效）:
              ├─ 按段还原：1 个 walk recognized event (08:00~08:30, confidence=1.0)
              └─ 概率推导：无（无咖啡因/酒精异常）
         4. 过滤 end >= since → 返回 1 个 recognized event

       agent 看到: 用户在 08:00~08:30 步行，可信度 1.0
```

这个示例展示了从控制面写入到 agent 读取的完整闭环：操作者的指令经展开、同步、识别，最终变成 agent 可推理的结构化信号——而整个过程是确定性的，任何时候重放都得到相同结果。
