# AI Health Advisor Web Demo

# 咖啡因摄入概率识别详细技术方案

> 日期：2026-04-30
> 状态：待实现

## 1. 文档定位

本文档定义 Web Demo 中“基于可穿戴传感器时序响应推导可能咖啡因摄入”的详细技术方案。

本方案不是医学诊断方案，也不是饮品类型识别方案。系统最终输出的是概率事件：`possible_caffeine_intake`。Agent 只能表达“可能摄入含咖啡因饮品”，不能表达“确认摄入咖啡因”。

本文档与以下既有设计配套阅读：

- `demo-timeline-device-sync-plan.md`：主时间轴、设备缓存、同步和活动片段机制
- `agent-context-contract-implementation-guide.md`：ContextPacket、EvidencePacket、Agent 可见事实契约
- `homepage-baseline-language-implementation-guide.md`：首页不暴露 baseline 术语的表达约束

---

## 2. 背景与问题定义

## 2.1 产品目标

PRD 中已经存在“咖啡因截点”和“咖啡因敏感型”相关产品方向。当前系统还没有能力从传感器数据中识别咖啡因摄入，只能在 prompt 或 micro tips 中泛泛建议“避免咖啡因”。

本轮目标是让 Agent 具备一种可解释、可演示、可测试的能力：

1. God Mode 触发一段“咖啡因摄入后生理响应”的时间轴数据
2. 设备同步后，后端只基于已同步传感器数据进行识别
3. 系统为某段时间打上 `possible_caffeine_intake`
4. Agent 在回答或晨报中引用该事件和证据，使用概率性措辞

## 2.2 为什么不能以 drink gesture 为主线

`drink_intake` 即使可以通过六轴 IMU 识别，也不能作为咖啡因摄入主证据：

- 吸管、奶茶、咖啡外带杯、能量饮料、茶饮等真实摄入动作差异很大
- 有些摄入场景不会形成典型抬腕饮水动作
- drink gesture 只能证明“可能喝了东西”，不能证明“摄入了咖啡因”
- 单独的 drink gesture 不能生成 `possible_caffeine_intake`

因此 v1 主线是生理时序响应识别；drink / meal 仅作为辅助上下文加分。

## 2.3 当前仓库能力边界

当前仓库已经具备：

- 主时间轴和 God Mode timeline append
- 设备事件 pending / synced 生命周期
- `DeviceEvent` 原始事件模型
- HR、SpO2、motion、steps、sleepStage 等事件
- IMU mock 生成器，但当前识别器只消费 motion 标量
- `RecognizedEvent` 进入 Agent context 的链路

当前缺口：

- 没有咖啡因相关 activity / recognized event 类型
- 没有用于短窗 HRV 的 `hrvRmssd` 设备事件
- 没有 5 分钟级 `stressLoad` 设备事件，当前 stress 多为日级/聚合视图
- 没有 caffeine response generator
- 没有基于 HR + HRV/RMSSD + stress + activity exclusion 的检测器
- Agent 没有概率性咖啡因事件表达约束

---

## 3. 设计目标与非目标

## 3.1 设计目标

本方案必须满足：

1. 以传感器时序响应作为主证据
2. 输出概率事件，而不是确定性诊断或摄入确认
3. God Mode 只生成触发段附近的 5 分钟级 mock 数据，不膨胀 30 天 history
4. 识别器不能读取 `segmentId` 或 `segment.type` 作弊，必须只基于已同步 sensor events
5. `drink_intake` / `meal_intake` 只影响概率，不是必要条件
6. 能明确解释“为什么这段时间被标记为可能咖啡因摄入”
7. 能被单元测试和 Agent eval 固化

## 3.2 非目标

本轮不做：

- 医学级咖啡因检测
- 咖啡、茶、奶茶、能量饮料等具体饮品分类
- IBI / RR 间期生成和真实 HRV 算法
- 训练 ML 模型
- 全量 30 天 5 分钟级 HRV 数据
- 通过输出后处理强行改写 Agent 结论

---

## 4. 核心原则

## 4.1 传感器事实优先

`possible_caffeine_intake` 必须由一组已同步 sensor events 推导得到。

允许使用的事实：

- `heartRate`
- `hrvRmssd`
- `stressLoad`
- `motion`
- `steps`
- `spo2`
- 已识别但非决定性的上下文事件，如 `drink_intake`、`meal_intake`

不允许使用：

- God Mode segment type 直接判定结果
- `segmentId` 中的字符串
- prompt 层猜测
- 没有 evidence 的固定文案

## 4.2 概率输出一等化

`confidence` 就是事件概率分数。系统不再把它当成普通 UI 置信度。

Agent 表达约束：

- 可以说：“这段数据更像一次可能的含咖啡因饮品摄入后反应”
- 可以说：“概率不高，只能作为线索”
- 不可以说：“你喝了咖啡”
- 不可以说：“确认摄入咖啡因”

## 4.3 混杂因素显式处理

咖啡因生理响应与运动、焦虑、睡眠不足、呼吸异常等会重叠。检测器必须显式处理这些混杂因素：

- 运动重叠时不标记或强扣分
- 焦虑重叠时扣分但不必完全排除
- SpO2 明显下降时优先解释为呼吸/血氧异常，不标咖啡因
- 睡眠中不标即时咖啡因摄入

---

## 5. 数据模型

## 5.1 DeviceMetric 扩展

新增短窗 HRV 与压力代理指标：

```ts
type DeviceMetric =
  | 'heartRate'
  | 'steps'
  | 'spo2'
  | 'motion'
  | 'sleepStage'
  | 'wearState'
  | 'hrvRmssd'
  | 'stressLoad';
```

`hrvRmssd` 语义：

- `hrvRmssd` 是设备上报的 5 分钟短窗 RMSSD 指标
- 单位为 `ms`
- 仅在 God Mode 咖啡因触发段生成
- 不写入 30 天 history JSON
- 可进入 synced events 和 caffeine detector

`stressLoad` 语义：

- `stressLoad` 是设备/沙箱按 5 分钟短窗输出的压力负荷代理
- 单位为 `score`，范围 `0~100`
- 仅作为生理响应证据之一，不能单独推导咖啡因摄入
- 后续可继续聚合到 `DailyRecord.stress.load`

## 5.2 RecognizedEventType 解耦

当前 `RecognizedEventType` 与 `ActivitySegmentType` 等价。咖啡因事件不是 activity segment，而是从多个传感器序列推导出的概率事件，因此需要解耦。

建议：

```ts
type RecognizedEventType =
  | ActivitySegmentType
  | 'possible_caffeine_intake';
```

后续如果需要保留内部候选，可再引入不进入 Agent context 的内部类型：

```ts
type InternalCandidateType = 'caffeine_response_candidate';
```

v1 不需要把内部候选暴露到 shared public type。

## 5.3 ActivitySegmentType 扩展

God Mode 需要可追加咖啡因触发段：

```ts
type ActivitySegmentType =
  | ...
  | 'caffeine_intake';
```

注意：`caffeine_intake` 是 God Mode 的数据生成场景，不是系统可直接输出的识别结果。识别输出仍然是 `possible_caffeine_intake`。

## 5.4 God Mode 参数

新增参数：

```ts
type CaffeineDose = 'light' | 'moderate' | 'high_or_sensitive';

interface CaffeineIntakeParams {
  dose?: CaffeineDose;
  context?: 'coffee' | 'tea' | 'milk_tea' | 'energy_drink' | 'unknown';
}
```

默认值：

- `dose: 'moderate'`
- `context: 'unknown'`

`context` 只用于 mock 剧情和 evidence 文案，不作为检测器硬条件。

---

## 6. Mock 生成模型

## 6.1 数据粒度

God Mode 点击“咖啡因摄入”后，从当前演示时间 `t0` 生成 4 小时 5 分钟级事件。

分段：

- `t0 ~ t0 + 15min`：吸收延迟期
- `t0 + 15min ~ t0 + 120min`：主要响应期
- `t0 + 120min ~ t0 + 240min`：恢复期

每个 5 分钟点生成：

- `heartRate`
- `hrvRmssd`
- `stressLoad`
- `spo2`
- `motion`
- `steps`

## 6.2 局部基线

生成器需要先确定局部基线：

- HR baseline：优先使用最近已同步低活动心率均值；没有则使用 profile baseline resting HR
- RMSSD baseline：优先从 profile baseline HRV 映射；没有则使用 profile baseline hrv
- stress baseline：优先使用当前日已同步 stressLoad；没有则由 profile 状态给定默认值
- SpO2 baseline：使用 profile baseline spo2

v1 推荐映射：

```text
rmssdBaseline = profile.baseline.hrv
```

不要引入复杂个体化模型，避免不可解释。

## 6.3 剂量曲线

### light

适合弱咖啡因或低敏感用户：

- HR：`baseline + 5 ~ 8 bpm`
- RMSSD：`baseline * 0.85 ~ 0.92`
- stressLoad：`baseline + 5 ~ 10`
- motion：`0.2 ~ 1.5`
- steps：`0 ~ 20 / 5min`
- SpO2：`baseline ± 1%`

默认只形成低置信候选，除非存在 drink / meal context。

### moderate

God Mode 默认：

- HR：`baseline + 8 ~ 14 bpm`
- RMSSD：`baseline * 0.70 ~ 0.85`
- stressLoad：`baseline + 10 ~ 20`
- motion：`0.2 ~ 1.8`
- steps：`0 ~ 20 / 5min`
- SpO2：`baseline ± 1%`

低活动场景下应能生成 public `possible_caffeine_intake`。

### high_or_sensitive

适合高剂量或敏感用户：

- HR：`baseline + 15 ~ 25 bpm`
- RMSSD：`baseline * 0.55 ~ 0.75`
- stressLoad：`baseline + 20 ~ 35`
- motion：`0.2 ~ 2.0`
- steps：`0 ~ 20 / 5min`
- SpO2：`baseline ± 1%`

应生成更高 confidence，但仍然只能概率性表达。

## 6.4 曲线形状

使用平滑响应曲线，不使用随机尖峰：

```text
responseFactor(t):
  0.0 at t0
  0.2 at +15min
  1.0 at +45~75min
  0.5 at +120min
  0.0 at +240min
```

所有指标都基于同一个 response factor：

- HR 随 factor 上升
- RMSSD 随 factor 下降
- stress 随 factor 上升
- SpO2 保持稳定小幅噪声
- motion / steps 保持低活动

这种方式保证生成模型和识别模型在同一特征空间内闭环。

---

## 7. 识别模型

## 7.1 扫描窗口

检测器扫描已同步事件中的候选锚点 `t0`。

每个候选点使用三个窗口：

- baseline：`t0 - 60min ~ t0 - 15min`
- response：`t0 + 15min ~ t0 + 120min`
- recovery：`t0 + 120min ~ t0 + 240min`

若 baseline 不足，可使用局部低活动点作为 baseline；仍不足则不生成 public event。

## 7.2 最低证据条件

生成 public event 的最低条件：

1. response 内至少 3 个 5 分钟点 HR 高于 baseline `>= 8 bpm`
2. response 内 RMSSD 均值低于 baseline `>= 15%`
3. response 内 stress 均值高于 baseline `>= 10`
4. response 内低活动：`motion < 2.0` 且 `steps < 20 / 5min`
5. SpO2 没有明显下降：相对 baseline 不低于 `-2%`

任一关键指标缺失时，不允许强行 public。可以产生内部候选，但 v1 不暴露。

## 7.3 概率打分

总分范围 `0 ~ 1`。

推荐权重：

| 证据 | 权重 |
|------|------|
| HR 持续升高 | 0.35 |
| RMSSD 下降 | 0.30 |
| stress proxy 上升 | 0.15 |
| 低活动排除运动 | 0.10 |
| 时间窗符合咖啡因响应 | 0.05 |
| drink / meal context | 0.05 |

阈值：

- `score >= 0.72`：输出 `possible_caffeine_intake`
- `0.55 <= score < 0.72`：内部候选，不进入 Agent public context
- `< 0.55`：不标记

## 7.4 子分数定义

### HR 子分数

```text
hrDelta = responseAvgHr - baselineAvgHr

hrScore:
  < 5 bpm  => 0
  5~8 bpm => 0.4
  8~14 bpm => 0.75
  > 14 bpm => 1.0
```

要求 response 内至少 3 个点持续升高，否则最高只能给 `0.4`。

### RMSSD 子分数

```text
rmssdDropPct = (baselineRmssd - responseAvgRmssd) / baselineRmssd

rmssdScore:
  < 8% => 0
  8~15% => 0.4
  15~30% => 0.8
  > 30% => 1.0
```

### Stress 子分数

```text
stressDelta = responseAvgStress - baselineAvgStress

stressScore:
  < 5 => 0
  5~10 => 0.4
  10~20 => 0.8
  > 20 => 1.0
```

### Activity exclusion 子分数

```text
activityScore:
  no exercise overlap and low motion/steps => 1.0
  mild movement only => 0.6
  walk/cardio/intermittent exercise overlap => 0
```

### Timing 子分数

```text
timingScore:
  peak appears between +30min and +90min => 1.0
  peak appears between +15min and +120min => 0.7
  otherwise => 0.2
```

### Context 子分数

```text
contextScore:
  drink_intake or meal_intake nearby => 1.0
  no context => 0
```

context 最高只贡献 `0.05`，不能主导结论。

## 7.5 混杂处理

### 运动

若 response window 与以下事件重叠：

- `steady_cardio`
- `walk`
- `intermittent_exercise`

则：

- `activityScore = 0`
- 若 HR/RMSSD/stress 变化可由运动解释，则不输出 caffeine event

### 焦虑

若与 `anxiety_episode` 重叠：

- 不直接排除
- 总分乘以 `0.75`
- evidence 必须写明“存在焦虑/高压力混杂因素”

### 呼吸暂停 / 低血氧

若 SpO2 明显下降：

- 不输出 caffeine event
- 优先交给血氧/呼吸相关规则

### 睡眠

睡眠期间不生成即时咖啡因摄入事件。

如果后续要做“睡前咖啡因可能影响睡眠”，应作为另一个睡眠影响模型，不放进 v1。

---

## 8. Agent Context 与输出契约

## 8.1 Recent Event

`possible_caffeine_intake` 应进入 homepage recent events 和 advisor relevant facts。

示例：

```json
{
  "type": "possible_caffeine_intake",
  "start": "2026-04-30T09:00",
  "end": "2026-04-30T11:00",
  "durationMin": 120,
  "confidence": 0.81,
  "evidenceIds": ["event_possible_caffeine_intake_2026-04-30T09:00"]
}
```

## 8.2 Evidence

Evidence derivation 必须包含：

- HR delta
- RMSSD drop percent
- stress delta
- motion / steps low activity
- SpO2 stable
- 是否存在 drink / meal context
- 是否存在混杂因素

示例：

```text
recognized possible caffeine response:
HR +11bpm, RMSSD -24%, stress +16,
low motion and low steps, SpO2 stable,
confidence 81%
```

## 8.3 Prompt 约束

新增约束：

- 咖啡因事件必须用“可能 / 倾向 / 线索”表达
- 不得说“确认摄入咖啡因”
- 不得推断具体饮品
- 若 confidence 低于 0.8，应提示“证据有限”
- 若存在焦虑或运动混杂，应显式说明判断不确定性更高

---

## 9. God Mode 交互

## 9.1 Timeline Control

新增按钮：

- label：`咖啡因`
- segmentType：`caffeine_intake`
- 默认 params：`{ dose: 'moderate', context: 'unknown' }`
- 默认 duration：`240`

点击后：

1. 从当前 demo time 追加 caffeine segment
2. 生成 4 小时 5 分钟级 sensor events
3. 根据当前 God Mode 行为决定是否推进时钟
4. app open / manual refresh 后进入 synced events
5. 识别器基于 synced events 输出 `possible_caffeine_intake`

## 9.2 不引入 Active Sensing Banner 强提示

咖啡因不是即时危险事件，v1 不默认弹出最高优先级 banner。

可在晨报、micro insight 或 advisor 中表达。

---

## 10. 测试策略

## 10.1 单元测试

必须覆盖：

- caffeine generator 生成正确时间范围和 5 分钟粒度
- light / moderate / high_or_sensitive 数值区间正确
- detector 不依赖 segment type
- detector 对 moderate low activity 生成 public event
- detector 对运动重叠不误判
- detector 对 SpO2 下降不误判
- detector 对 drink only 不误判

## 10.2 集成测试

必须覆盖：

1. God Mode append caffeine segment
2. sync trigger 后 synced events 包含 caffeine raw data
3. registry timeline sync 中出现 `possible_caffeine_intake`
4. Agent context packet recentEvents 包含该事件
5. prompt renderer 展示概率性 evidence

## 10.3 Eval

新增至少 3 个 Agent eval：

- 首页识别 moderate caffeine response
- Advisor 被问“我是不是喝咖啡了”时保持概率表达
- 混杂场景下披露不确定性

---

## 11. 风险与边界

## 11.1 生理信号非唯一

HR 上升、RMSSD 下降、stress 上升并非咖啡因特异性表现。系统必须把它表达为概率线索。

## 11.2 Mock 与真实设备差异

v1 使用直接 5 分钟 `hrvRmssd`，不是 IBI / RR 推导。真实设备接入时可替换数据来源，但识别器输入契约不变。

## 11.3 低剂量不应强行识别

弱响应在真实世界中很容易被噪声淹没。v1 对 `light` 的默认行为应偏保守。

---

## 12. 参考资料

- NCBI Bookshelf: Caffeine pharmacokinetics and timing window
  - https://www.ncbi.nlm.nih.gov/books/NBK223808/
- Journal of Caffeine Research: Impact of caffeine on heart rate variability, systematic review
  - https://journals.sagepub.com/doi/full/10.1089/jcr.2013.0009
- Wageningen Research: Drinking gesture detection using wrist-worn IMU sensors
  - https://research.wur.nl/en/publications/drinking-gesture-detection-using-wrist-worn-imu-sensors-with-mult/
