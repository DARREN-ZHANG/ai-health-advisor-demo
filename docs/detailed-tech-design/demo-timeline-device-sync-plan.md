# AI Health Advisor Web Demo

# 主时间轴与设备同步模拟详细技术方案

## 1. 文档定位

本文档用于定义 Web Demo 中“主时间轴推进 + 智能穿戴设备缓存 + App 打开触发同步 + LLM 基于已同步数据生成建议”的详细技术实现方案。

本文档是对现有 `profile.records` + `God Mode override/event inject` 机制的升级设计，目标不是替代《技术架构文档》或《PRD》，而是在它们给定的约束内，把这条演示主链路落到可评审、可分阶段实施、可测试的方案级别。

本文档重点解决以下问题：

- Demo 如何有一条明确的主时间轴
- 设备端原始数据如何随时间积压
- 用户打开 App 时如何触发蓝牙同步到云端
- LLM 在首页和后续页面中究竟能看到哪一部分数据
- God Mode 如何从“覆盖式修改”升级为“沿主时间轴追加事件片段”
- 典型活动片段如何生成原始传感器数据并被系统识别

---

## 2. 背景与问题定义

## 2.1 当前实现的能力边界

当前仓库已经具备一版“设备同步流”演示能力：

- `profile.records[]` 仍是日级汇总主数据
- 后端在读取时把日级记录物化成分钟级 `SensorSample[]`
- `device.syncSessions[]` 用于表达哪些时间范围已经同步
- API 可以返回同步概览、某次同步的样本，以及 pending 样本

这套设计足以支撑“有同步概念的静态 demo”，但不足以支撑本次需求中的三项核心语义：

1. 时间是持续推进的，而不是静态快照
2. 数据先积压在设备，再在“打开 App”时被同步
3. God Mode 注入的是一段沿主时间轴追加的活动片段，而不是简单覆盖某个指标值

## 2.2 本次需求的真实目标

本次不是单纯增强数据结构，而是要支撑一条完整演示链路：

1. 用户在某个时刻打开 App
2. App 通过蓝牙从设备拉取尚未同步的原始数据
3. App 将这些数据上传到云端
4. 后端只基于“已同步可见”的数据生成首页回顾、状态总结和后续建议
5. 在 God Mode 下，可以把一段新的活动场景追加到主时间轴末尾
6. 这些活动片段既能产出原始数据，也能被规则识别为“空腹有氧 / 久坐办公 / 无氧训练 / 散步 / 睡眠”等事件

---

## 3. 设计目标与非目标

## 3.1 设计目标

本方案必须满足：

1. 有一条明确且可推进的主时间轴
2. 原始数据先存在于“设备侧缓存”，而不是默认全量云端可见
3. 用户“打开 App / 刷新”是一个一等同步动作
4. 首页晨间场景能准确表达“昨夜数据已同步、今日白天尚未发生”
5. God Mode 可以把可识别活动片段沿时间轴向后追加
6. 系统可以从原始数据中识别出这些片段对应的活动类型
7. 保留现有页面对聚合视图的消费方式，避免一次性重写整站

## 3.2 非目标

本方案不追求：

- 与真实硬件协议完全一致
- 引入数据库、消息队列或跨进程状态一致性
- 实现医学级别的活动识别算法
- 实现秒级 UI 实时流推送
- 在本轮内彻底移除现有 `profile.records[]` 消费链路

---

## 4. 核心设计原则

## 4.1 主时间轴是一等状态，不是隐式日期

所有 demo 行为都围绕“当前时间推进到了哪里”展开。任何场景注入都必须显式依附于主时间轴。

## 4.2 原始事实层与派生视图层分离

不能继续把日级 `records[]` 当作系统唯一事实源。原始事件、同步批次、识别结果、日级聚合是四类不同对象，必须分层。

## 4.3 LLM 只能读取云端已可见数据

设备中尚未同步的数据不能直接进入 Agent context。否则“打开 App 触发同步”的演示链路在语义上是假的。

## 4.4 God Mode 注入的是“时间片段”，不是“结果覆盖”

场景系统要从“改一个值”升级成“追加一段活动”。结果指标、识别事件、汇总记录都应从这段活动推导得到。

## 4.5 生成模型与识别模型使用同一特征空间

避免为了 demo 效果引入零散补丁。每类活动片段应先定义其传感器特征，再由识别器使用同一组特征完成分类，保证前后一致。

---

## 5. 总体架构

本方案采用三层模型：

1. **事实层**
   - 主时间轴
   - 活动片段
   - 原始设备事件

2. **传输层**
   - 设备缓存状态
   - App 打开触发的同步会话
   - 已同步可见窗口

3. **派生层**
   - 已识别活动事件
   - 分钟级/小时级可视化样本
   - 日级 `DailyRecord`
   - 首页/数据中心/LLM 所需摘要

```text
God Mode 场景注入
        |
        v
ActivitySegment 追加到主时间轴尾部
        |
        v
DeviceEvent[] 生成并累积到设备缓存
        |
        +--> 用户打开 App / 手动刷新
               |
               v
          SyncSession
               |
               v
       已同步云端可见事件集合
               |
        +------+------+
        |             |
        v             v
RecognizedEvent[]   聚合视图(DailyRecord / timeline / homepage summary)
        |             |
        +------+------+
               v
             LLM
```

---

## 6. 数据模型

## 6.1 事实层模型

### 6.1.1 DemoClock

用于表达某个 profile 当前推进到的演示时刻。

```ts
export interface DemoClock {
  profileId: string;
  timezone: string;
  currentTime: string; // YYYY-MM-DDTHH:mm
}
```

约束：

- 同一时刻仅存在一个有效 `currentTime`
- 任何 scenario 注入默认从 `currentTime` 之后开始追加
- 若 scenario 自带显式偏移量，则仍以 `currentTime` 为参考点计算绝对开始时间

### 6.1.2 ActivitySegment

用于表达一段“活动片段模板实例”，它是原始数据生成的直接原因。

```ts
export type ActivitySegmentType =
  | 'fasted_cardio'
  | 'breakfast'
  | 'sedentary_work'
  | 'lunch'
  | 'strength_training'
  | 'dinner'
  | 'walk'
  | 'leisure'
  | 'sleep';

export interface ActivitySegment {
  segmentId: string;
  profileId: string;
  type: ActivitySegmentType;
  start: string; // YYYY-MM-DDTHH:mm
  end: string; // YYYY-MM-DDTHH:mm
  params?: Record<string, number | string | boolean>;
  source: 'baseline_script' | 'god_mode';
  scenarioId?: string;
}
```

说明：

- `baseline_script` 表示 profile 自带的标准日程脚本
- `god_mode` 表示运行时注入的增量片段
- `params` 用于表达强度、时长、餐后状态、目标步频等可控参数

### 6.1.3 DeviceEvent

用于表达设备侧缓存的原始事件。所有后续识别和聚合都基于它。

```ts
export type DeviceMetric =
  | 'heartRate'
  | 'steps'
  | 'spo2'
  | 'motion'
  | 'sleepStage'
  | 'wearState';

export interface DeviceEvent {
  eventId: string;
  profileId: string;
  measuredAt: string; // YYYY-MM-DDTHH:mm
  metric: DeviceMetric;
  value: number | string | boolean;
  source: 'sensor';
  segmentId?: string;
}
```

说明：

- `DeviceEvent` 是事实记录，不直接表示“已上传”
- 步数事件建议使用累计计数，而不是分钟增量，避免后续同步切片时重复累计语义不清
- `motion` 用于表达运动强度或加速度等级，作为活动识别输入

## 6.2 传输层模型

### 6.2.1 DeviceBufferState

用于表达“设备已产生但云端未必可见”的边界。

```ts
export interface DeviceBufferState {
  profileId: string;
  lastSyncedMeasuredAt: string | null;
}
```

说明：

- `lastSyncedMeasuredAt` 是云端可见数据上界
- 所有 `measuredAt > lastSyncedMeasuredAt` 的事件都视为 pending

### 6.2.2 SyncSession

用于表达一次“用户打开 App / 刷新触发同步”的事实。

```ts
export interface SyncSession {
  syncId: string;
  profileId: string;
  trigger: 'app_open' | 'manual_refresh';
  startedAt: string;
  finishedAt: string;
  uploadedMeasuredRange: {
    start: string;
    end: string;
  } | null;
  uploadedEventCount: number;
}
```

说明：

- `startedAt/finishedAt` 是同步动作发生时间
- `uploadedMeasuredRange` 是本次上传覆盖的原始测量时间范围
- 允许某次同步没有新数据，此时 `uploadedMeasuredRange = null`

## 6.3 派生层模型

### 6.3.1 RecognizedEvent

用于表达规则识别出的可消费事件。

```ts
export interface RecognizedEvent {
  recognizedEventId: string;
  profileId: string;
  type: ActivitySegmentType;
  start: string;
  end: string;
  confidence: number;
  evidence: string[];
  sourceSegmentId?: string;
}
```

### 6.3.2 DailyRecord

现有 `DailyRecord` 暂时保留，但角色变更为“从已同步原始事件聚合得到的兼容视图”，不再视为顶层事实源。

---

## 7. 主时间轴语义

## 7.1 初始时刻

每个 profile 需要有一个明确的初始 demo 时刻，例如：

- `profile-a` 初始时刻：`2026-04-16T07:05`
- 含义：今天早晨用户刚起床，首次打开 App

在这个时刻：

- 设备缓存中已经有前一日白天到今晨起床前的事件
- 尚未发生今天白天的工作/训练/散步片段
- App 首次打开将触发一次同步
- 首页晨报基于这次同步后的数据生成

## 7.2 时间推进规则

系统支持三种推进方式：

1. `app_open`
   - 不推进 `currentTime`
   - 触发同步，把当前时间点以前尚未同步的设备事件上传

2. `advance_clock`
   - 仅推进时间，不追加活动片段
   - 适合模拟“时间流逝但用户无显著活动”

3. `timeline_append`
   - 在 `currentTime` 后追加一段活动片段
   - 生成一段原始设备事件
   - 默认把 `currentTime` 推进到片段结束时刻

## 7.3 时间轴上的合法性约束

必须保证：

- 新片段不得与已有片段重叠
- 新片段开始时间必须大于等于当前时间
- 同一个 profile 的活动片段按时间顺序存储
- 所有派生视图都只基于 `measuredAt <= currentTime` 的事件计算

---

## 8. 原始事件生成模型

## 8.1 生成职责

活动片段生成器负责把 `ActivitySegment` 转换为一组 `DeviceEvent[]`。

建议按片段类型分别实现生成器：

- `generateFastedCardioEvents()`
- `generateSedentaryWorkEvents()`
- `generateStrengthTrainingEvents()`
- `generateWalkEvents()`
- `generateSleepEvents()`

## 8.2 生成粒度

建议采用以下最小粒度：

- `heartRate`：1 分钟
- `steps`：1 分钟累计值
- `motion`：1 分钟
- `sleepStage`：5 分钟
- `spo2`：5 或 10 分钟，仅在睡眠或特定片段启用

原因：

- 足以支撑 demo 中的可视化和识别
- 样本量可控
- 避免为了“看起来像原始流”引入不必要的秒级复杂度

## 8.3 典型活动片段的目标特征

以下特征不是 UI 文案，而是生成模型和识别模型共享的约束。

### 8.3.1 空腹有氧 15 分钟

- 持续时长：15 分钟
- 心率：快速抬升后维持在中高平台
- 步数：稳定连续增长
- motion：持续中高
- 可识别标签：`fasted_cardio`

### 8.3.2 静坐工作 4 小时

- 持续时长：240 分钟
- 心率：低波动
- 步数：接近停滞，仅有零星微增
- motion：持续低
- 可识别标签：`sedentary_work`

### 8.3.3 无氧训练 30 分钟

- 持续时长：30 分钟
- 心率：多次波峰，呈间歇变化
- 步数：可低于有氧与散步
- motion：高 burst，模式不同于步行
- 可识别标签：`strength_training`

### 8.3.4 晚间散步 30 分钟

- 持续时长：30 分钟
- 心率：中等稳定抬升
- 步数：稳定持续增长
- motion：中等稳定
- 可识别标签：`walk`

### 8.3.5 夜间睡眠

- 持续时长：跨天
- 心率：夜间下降，后半夜随 REM 出现波动
- 步数：接近零
- sleepStage：light/deep/rem/awake 有序切换
- spo2：夜间低频采样
- 可识别标签：`sleep`

---

## 9. 同步语义

## 9.1 同步触发条件

本轮只支持两类触发：

1. 用户首次打开首页
2. 用户手动刷新

后续如需扩展“后台自动同步”，可在此模型上追加新 trigger，不影响当前架构。

## 9.2 同步算法

同步过程定义如下：

1. 读取 `currentTime`
2. 选取 `measuredAt <= currentTime` 的全部设备事件
3. 再过滤出 `measuredAt > lastSyncedMeasuredAt` 的 pending 事件
4. 生成 `SyncSession`
5. 将 `lastSyncedMeasuredAt` 更新为当前这批事件的最大 `measuredAt`

伪代码：

```ts
function syncOnAppOpen(profileId: string, trigger: 'app_open' | 'manual_refresh'): SyncSession {
  const clock = getDemoClock(profileId);
  const buffer = getDeviceBufferState(profileId);
  const allVisibleToDevice = listDeviceEvents(profileId).filter((e) => e.measuredAt <= clock.currentTime);
  const pending = buffer.lastSyncedMeasuredAt == null
    ? allVisibleToDevice
    : allVisibleToDevice.filter((e) => e.measuredAt > buffer.lastSyncedMeasuredAt);

  const session = createSyncSession(trigger, pending);
  updateLastSyncedMeasuredAt(maxMeasuredAt(pending) ?? buffer.lastSyncedMeasuredAt);
  return session;
}
```

## 9.3 LLM 数据可见性规则

首页和 AI 任务只允许读取：

- `measuredAt <= lastSyncedMeasuredAt` 的原始事件
- 基于这些事件聚合得到的 `DailyRecord`
- 基于这些事件识别得到的 `RecognizedEvent`

禁止读取：

- 设备中尚未同步的数据
- 主时间轴未来时刻的数据

这是本方案最重要的业务约束。

---

## 10. God Mode 场景系统升级

## 10.1 当前机制的问题

现有 `profile_switch` / `event_inject` / `metric_override` / `reset` 机制本质是覆盖式控制，缺少：

- 主时间轴推进
- 活动片段追加
- 同步动作建模
- 基于原始数据识别事件

因此本次需要保留旧能力，但新增面向时间轴的动作类型。

## 10.2 新增场景动作类型

建议新增：

```ts
export type ScenarioType =
  | 'profile_switch'
  | 'timeline_append'
  | 'sync_trigger'
  | 'advance_clock'
  | 'reset'
  | 'demo_script';
```

其中：

- `timeline_append`
  - 追加一个 `ActivitySegment`
  - 生成对应 `DeviceEvent[]`
  - 默认推进主时间轴到片段结束

- `sync_trigger`
  - 触发一次同步
  - 支持 `app_open` 和 `manual_refresh`

- `advance_clock`
  - 仅推进主时间轴，不追加片段

## 10.3 新 scenario payload 设计

```ts
export interface TimelineAppendPayload {
  segmentType: ActivitySegmentType;
  durationMinutes: number;
  offsetMinutes?: number;
  params?: Record<string, number | string | boolean>;
  advanceClock?: boolean; // default true
}

export interface SyncTriggerPayload {
  trigger: 'app_open' | 'manual_refresh';
}

export interface AdvanceClockPayload {
  minutes: number;
}
```

## 10.4 典型 scenario 组织方式

`profile-a` 需要拆出一组可单独注入的识别片段：

1. `profile-a-fasted-cardio-15m`
2. `profile-a-breakfast-20m`
3. `profile-a-sedentary-work-4h`
4. `profile-a-lunch-30m`
5. `profile-a-strength-training-30m`
6. `profile-a-afternoon-sedentary-work-4h`
7. `profile-a-dinner-30m`
8. `profile-a-evening-walk-30m`
9. `profile-a-leisure-2h`
10. `profile-a-night-sleep`

每个 scenario 的职责是：

- 在主时间轴尾部追加一段活动片段
- 让设备缓存中新增一段原始事件
- 必要时由用户手动触发同步后让页面/LLM 看到变化

---

## 11. 识别模型

## 11.1 识别职责

识别器负责从“已同步可见”的原始事件中输出 `RecognizedEvent[]`，供：

- God Mode 面板展示“系统识别到了什么”
- 首页和 LLM 解释“你刚刚完成了一段空腹有氧”
- 后续规则与 summary 逻辑复用

## 11.2 识别输入

识别器只读取：

- 已同步事件
- 主时间轴截止当前时刻的历史窗口

不读取：

- 未同步事件
- God Mode 的原始意图标签

说明：

- 在测试中允许用 `sourceSegmentId` 做对账
- 在运行时识别器不应直接靠 `segment.type` 反查答案

## 11.3 识别输出与可信度

识别输出必须显式包含：

- 类型
- 开始/结束时间
- 置信度
- 证据列表

这样前端和 LLM 都能解释“为什么识别为该事件”，而不是只拿到一个硬标签。

---

## 12. 页面与 LLM 读侧影响

## 12.1 首页

首页晨间路径改为：

1. 首次打开首页
2. 触发 `sync_trigger(app_open)`
3. 聚合昨夜睡眠与最近已同步状态
4. 调用 LLM 生成晨间总结

因此首页不是读取静态预制摘要，而是读取“同步后的事实数据”。

## 12.2 数据中心

数据中心在本轮不直接消费 `DeviceEvent[]`，而继续消费派生后的：

- `DailyRecord`
- 分钟/小时级聚合 timeline
- 识别事件列表

这样可以减少前端重写量。

## 12.3 Agent Context

`packages/agent-core` 的 context builder 需要新增两块输入：

1. `recognizedEvents`
2. `syncMetadata`

例如：

- 最近一次同步时间
- 是否存在未同步 pending 数据
- 最近识别到的活动片段

但 Agent 仍不直接读取设备侧未同步事件。

---

## 13. 存储与文件组织建议

## 13.1 Profile 基础文件

保留现有 `data/sandbox/profiles/profile-*.json`，但职责收敛为：

- 用户基础画像
- baseline 指标
- 初始 demo 时刻
- 可选的 baseline 日程模板

## 13.2 新增 timeline/script 资产

建议新增：

```text
data/sandbox/
├── profiles/
├── scenarios/
├── timeline-scripts/
│   ├── profile-a-day-1.json
│   ├── profile-b-day-1.json
│   └── profile-c-day-1.json
```

这些文件用于定义：

- 初始 baseline 活动片段
- 每个 profile 的标准日程模板
- 可供 God Mode 片段注入复用的参数预设

## 13.3 运行时状态

以下状态保持内存态，不回写 JSON：

- 当前主时间轴
- 运行时追加的活动片段
- 设备缓存同步边界
- 同步历史

这与现有 demo 的内存态原则一致。

---

## 14. 模块改造清单

## 14.1 `packages/shared`

新增或调整：

- `DemoClock`
- `ActivitySegment`
- `DeviceEvent`
- `DeviceBufferState`
- `SyncSession`
- `RecognizedEvent`
- God Mode 新 scenario payload 和类型

## 14.2 `packages/sandbox`

新增：

- timeline script loader
- segment generator
- raw event repository helpers
- recognition helpers
- raw-to-daily aggregation helpers

调整：

- `materializeDeviceSamples()` 角色改为“从 raw events 聚合兼容视图”
- 不再从 `DailyRecord` 直接构造原始分钟流

## 14.3 `apps/agent-api`

新增或重构：

- `demo-state-store` 取代当前 `override-store` 的主职责
- `timeline_append` / `sync_trigger` / `advance_clock` 路由与服务
- 首页初次打开触发同步的服务编排
- 数据模块新增“只读取已同步数据”的约束

## 14.4 `packages/agent-core`

调整：

- context builder 加入 recognized events 与 sync metadata
- 规则引擎支持“最近活动片段”类信号

## 14.5 `apps/web`

调整：

- God Mode 面板按时间轴展示动作与当前时刻
- 可显示最近一次同步、pending 数据量、最近识别事件
- 首页首次打开时触发同步并刷新晨报

---

## 15. 分阶段实施计划

## Phase 1：打通主时间轴与同步边界

目标：

- 引入 `DemoClock`
- 引入 `DeviceEvent`
- 引入 `SyncSession`
- 首页读取“已同步可见数据”

完成标志：

- 首次打开首页会触发同步
- LLM 只看到同步后的昨夜数据
- 可查询 pending / synced 事件

## Phase 2：God Mode 升级为时间片段注入

目标：

- 新增 `timeline_append`
- 新增 `advance_clock`
- 新增 `sync_trigger`
- `profile-a` 一天中的标准活动片段可逐段推进

完成标志：

- God Mode 能按顺序追加“空腹有氧/静坐工作/无氧训练/散步/睡眠”片段
- 每次追加后设备缓存中能看到新增原始事件

## Phase 3：活动识别闭环

目标：

- 从已同步事件识别活动片段
- 在 God Mode 和首页中展示识别结果

完成标志：

- 新增事件能被识别为正确类型
- LLM 能引用识别结果生成建议

## Phase 4：兼容视图与收敛

目标：

- 将现有图表/数据中心消费链路切换到“从 raw events 聚合出的视图”
- 减少旧 `metric_override` 机制的使用范围

完成标志：

- 页面读侧不依赖“伪原始分钟流”
- 旧机制仅作为兼容或测试辅助存在

---

## 16. 风险与取舍

## 16.1 为什么不继续以 `DailyRecord` 作为主数据源

因为它无法自然表达：

- 同步前后数据可见性的差异
- 片段级时间推进
- 原始事件识别
- 设备侧缓存与云端数据的边界

继续把 `DailyRecord` 当主源，只会让系统不断叠加补丁。

## 16.2 为什么本轮不引入数据库

本项目仍是 demo，运行时状态只需进程内存即可。数据库不是本问题的关键约束，过早引入只会增加实现面。

## 16.3 为什么保留派生 `DailyRecord`

因为现有首页、数据中心、部分 AI 流程已经围绕该视图组织。保留它作为派生层，可以在不重写所有页面的前提下完成主链路升级。

---

## 17. 测试策略

## 17.1 单元测试

覆盖：

- 片段生成器输出事件的时间顺序和特征分布
- 同步算法对 pending / synced 边界的处理
- 识别器对典型片段的分类结果
- raw event 到 `DailyRecord` 的聚合正确性

## 17.2 集成测试

覆盖：

1. 初次打开首页触发同步
2. 同步后晨报可读取昨夜睡眠
3. 注入 `fasted_cardio` 片段后，未同步前首页不可见
4. 触发手动刷新后，新增事件变为可见
5. 识别器输出 `fasted_cardio`

## 17.3 回归测试

需要确保：

- 旧 profile 切换仍可用
- 旧 reset 仍可恢复到初始 demo 状态
- 现有图表和 AI 路由在聚合视图层不回归

---

## 18. 评审重点

本方案评审时建议重点判断以下问题：

1. 是否认可“主时间轴 + 原始事件 + 同步会话 + 派生聚合”的三层模型
2. 是否认可 `DailyRecord` 从主数据源降级为派生兼容视图
3. 是否认可 God Mode 从覆盖式动作升级为时间片段注入
4. 是否认可“LLM 只读已同步数据”这一硬约束
5. 是否认可 `profile-a` 的典型一天应拆为多个可识别片段 scenario
6. Phase 1 到 Phase 4 的切分是否符合当前迭代节奏

---

## 19. 结论

本方案的核心结论是：

若要真实表达“用户打开 App 时设备同步，随后 LLM 基于新数据给出建议”的 demo 主链路，就必须把系统升级为“主时间轴驱动”的模型。原始设备事件、同步边界和活动片段注入必须成为一等概念，而不能继续依附在静态 `profile.records[]` 和覆盖式 `metric override` 之上。

在此基础上，保留现有聚合视图作为兼容层，是本轮成本与正确性之间最合理的工程取舍。
