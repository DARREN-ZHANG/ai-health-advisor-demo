# Sandbox Mock 数据设计方案

> 本文描述一套可穿戴健康数据的 mock 数据设计方案，用于在新架构中评审其适配性。文档只阐述设计与实现方案，不涉及具体代码组织或运行时消费机制。

---

## 1. 设计目标与原则

- **确定性可复现**：相同输入始终产出相同数据，保证 demo、评测（eval）、测试结果稳定可回归。
- **画像驱动**：以一组差异化的虚拟用户（profile）为锚点，所有数据围绕 profile 的 baseline 派生，避免无主语的随机数据。
- **资产分层**：人工编辑内容与脚本生成内容职责分离——人工只描述"画像与文案意图"，数值型数据全部由生成器按规则产出，杜绝手填数值导致的不一致。
- **双轨数据**：冻结的"历史日级数据"（DailyRecord）+ 可演进的"当前活动日"（活动片段），两套在 schema 上对齐，使历史与当下可无缝衔接。

---

## 2. 画像（Profile）模型

### 2.1 设计思路

通过少量差异化画像覆盖健康状态谱系（健康稳定 / 慢性疲劳 / 高压力 / 社交饮酒等），每个画像既是展示用的"人物设定"，也是数据生成的参数源。画像字段双语化（zh/en），支持本地化展示。

### 2.2 字段定义

```ts
interface SandboxProfile {
  profileId: string;
  name: LocalizableText;        // { zh, en } 双语
  age: number;
  gender: 'male' | 'female';
  avatar: string;
  tags: LocalizableText[];      // 双语标签，用于 UI 概括画像特征
  baseline: BaselineMetrics;    // 长期基线：生成历史数据的中心锚点
  weeklyBaseline?: Partial<BaselineMetrics>;
  dailyBaseline?: Partial<BaselineMetrics>;  // 当日精确值，覆盖生成抖动
}

interface BaselineMetrics {
  restingHr: number;       // 静息心率
  hrv: number;             // HRV (RMSSD)
  spo2: number;            // 血氧
  avgSleepMinutes: number; // 日均睡眠时长
  avgSteps: number;        // 日均步数
}
```

**`baseline` 与 `dailyBaseline` 的区别**（关键设计）：
- `baseline` 是长期中心值，历史数据围绕它抖动生成；
- `dailyBaseline`（可选）用于把"当前活动日"的数值精确钉死，保证 demo 展示数值与画像预期完全一致，而不被生成器的随机抖动稀释。

### 2.3 画像示例（4 个差异化角色）

| profileId | 角色/定位 | baseline 关键特征 |
|-----------|-----------|-------------------|
| profile-a | 健康稳定标杆 | HR 48 / HRV 94 / 步数 12000 / 长睡眠 |
| profile-b | 慢性疲劳、数据有缺失 | HR 72 / HRV 22 / 步数 3000（含 15% 缺失率）|
| profile-c | 高压力、短睡眠 | HR 78 / 睡眠 330min / 压力上行趋势 |
| profile-d | 社交饮酒、恢复赤字 | HR 58 / HRV 55 / 步数 10000 |

---

## 3. 数据类型 Schema

所有 mock 数据遵循统一的 schema 定义（schema-first），这是方案的核心。数据可空（`?`）用于表达"缺失"，profile-b 即借此模拟可穿戴数据不全的用户。

### 3.1 日级记录 DailyRecord（历史数据形态）

```ts
interface DailyRecord {
  date: string;                  // YYYY-MM-DD
  hr?: number[];                 // 5 个分位锚点：[最低, 静息, 均值, 峰值, 恢复]
  hrv?: number;                  // RMSSD 日级均值
  sleep?: SleepData;
  activity?: ActivityData;
  spo2?: number;                 // 血氧日级均值
  stress?: { load: number };     // 压力负荷 0~100
  intraday?: IntradaySnapshot[]; // 分时快照
}

interface SleepData {
  totalMinutes: number;
  startTime: string; endTime: string;        // HH:mm
  stages: { deep: number; light: number; rem: number; awake: number };
  score: number;                              // 0~100
}

interface ActivityData {
  steps: number; calories: number; activeMinutes: number; distanceKm: number;
}

interface IntradaySnapshot {
  hour: number;                  // 0,2,…,22（每 2 小时 1 个窗口，共 12 个）
  hr?: number; spo2?: number; steps?: number; sleepMinutes?: number; stressLoad?: number;
}
```

**`hr` 用 5 个锚点而非完整序列**：浓缩为 `[最低, 静息, 均值, 峰值, 恢复]`，既压缩存储，又保留心率曲线的关键形态供 UI 呈现。

### 3.2 活动片段 ActivitySegment（当前活动日形态）

```ts
interface ActivitySegment {
  segmentId: string;
  profileId: string;
  type: ActivitySegmentType;
  start: string; end: string;    // YYYY-MM-DDTHH:mm
  params?: Record<string, number | string | boolean>;
  source: 'baseline_script' | 'god_mode';
}

type ActivitySegmentType =
  | 'meal_intake' | 'steady_cardio' | 'prolonged_sedentary'
  | 'intermittent_exercise' | 'walk' | 'sleep' | 'nap'
  | 'deep_focus' | 'anxiety_episode' | 'alcohol_intake'
  | 'caffeine_intake' | 'relaxation' | 'strength_training';
```

`source` 区分数据来源：`baseline_script` = 画像自带基线片段；`god_mode` = 演示时手工/场景注入。

---

## 4. 资产分层设计

每个画像由三类资产构成，遵循"人工定义意图、机器产出数值"的分工：

| 资产类别 | 内容 | 生产方式 | 可否人工编辑 |
|----------|------|----------|--------------|
| **画像档案** | 人物字段 + baseline + 初始 demo 时刻 | 人工定义 | ✅ 可编辑 |
| **历史存档** | 连续 N 天的冻结 `DailyRecord[]` | 生成器产出 | ❌ 勿手改（会被覆盖）|
| **当前活动脚本** | 当前日的 baseline 活动片段 `segments[]` | 生成器产出 | ❌ 勿手改 |

分层的关键约束：画像档案是唯一的人工入口，它既是展示数据也是生成参数；历史存档与活动脚本都由生成器从画像派生，因此调整画像后只需重生成即可保持一致。

此外还有两类**纯人工编辑**的资产，与数值数据解耦：
- **回退文案**：AI 不可用时的离线响应（见 §6.1）。
- **提示词模板**：AI 场景的 prompt（见 §6.2）。

---

## 5. 确定性生成机制

历史数据与活动脚本由生成器产出，核心机制如下。

### 5.1 生成配置

每个画像对应一份生成配置，决定数据特征：

```ts
interface ProfileConfig {
  profileId: string;
  seed: number;          // 固定随机种子
  baseline: BaselineMetrics;
  missingRate: { hr: number; activity: number; spo2: number }; // 各指标缺失概率
  trend: { stressDirection: number; sleepDirection: number; hrDirection: number }; // 随 dayIndex 的线性方向系数
}
```

- `seed` 固定（如 42 / 137 / 256 / 314）→ 相同 seed 相同输出。
- `missingRate` 制造字段级缺失，模拟真实可穿戴数据不全。
- `trend` 让指标随时间漂移（如压力上行、睡眠缩短），制造趋势，而非静态平铺。

### 5.2 历史数据生成

- **PRNG**：mulberry32（轻量确定性伪随机）。
- **逐日生成**：每天按 `missingRate` 概率置空字段，其余围绕 `baseline` 抖动；睡眠由 `totalMinutes` 反推起止时间并按比例分配各阶段。
- **分时数据**：每 2 小时一个窗口，结合睡眠窗口重叠计算 `sleepMinutes`。
- **当日钉死**：对历史最后一天（= 当前活动日）用 `dailyBaseline` 精确覆盖睡眠时长、HRV、静息 HR、SpO2、步数，并同步缩放 intraday，保证 demo 日数值与画像预期一致。

### 5.3 活动脚本生成

- 为当前活动日生成一段 `sleep` baseline 片段（其余活动留给运行时演进）。
- 由 `avgSleepMinutes` 反推上床时刻（`deriveSleepConfig`）。

### 5.4 确定性的意义

同一 seed + 同一画像参数 + 同一日期范围 → 永远产出相同结果。这意味着 mock 数据可纳入版本控制，并随 schema 演进而安全重生成，回归测试不会因数据漂移而 flaky。

---

## 6. 文案类资产设计

### 6.1 回退文案（AI 不可用时的离线响应）

按 key 分桶的本地化文案：

```ts
interface FallbackEntry {
  summary: string;        // 主文案
  chartTokens: string[];  // 引用合法的图表 token ID
  microTips: unknown[];
  actions: unknown[];
}
```

分桶维度因场景而异：
- **首页 / 对话**：按 `profileId` 分桶（不同画像有不同话术）。
- **指标详情**：按数据页签（`hrv / sleep / resting-hr / activity / spo2 / stress`）分桶。
- 外层再按 `zh`/`en` 区分语言。

### 6.2 提示词模板

按场景组织的 `.md` 文件（system / 首页 / 指标详情 / 对话），部分含「模板 + 风格（双语）」的子结构。

---

## 7. 核心样例

> 以下为方案产出的数据形态示例，用于直观判断方案是否适配新架构。

### 7.1 画像档案

```json
{
  "profile": {
    "profileId": "profile-a",
    "name": { "zh": "林巅峰", "en": "Lin Dianfeng" },
    "age": 28, "gender": "male", "avatar": "avatar-a.png",
    "tags": [{ "zh": "规律健身", "en": "Regular exercise" }],
    "baseline": { "restingHr": 48, "hrv": 94, "spo2": 99, "avgSleepMinutes": 465, "avgSteps": 12000 },
    "dailyBaseline": { "avgSleepMinutes": 600, "avgSteps": 5900, "hrv": 93, "spo2": 99 }
  },
  "initialDemoTime": "2026-06-21T07:05"
}
```

### 7.2 日级记录 DailyRecord（节选）

```json
{
  "date": "2026-05-22",
  "hr": [37, 48, 60, 95, 54],
  "hrv": 90,
  "sleep": {
    "totalMinutes": 473, "startTime": "22:21", "endTime": "06:14",
    "stages": { "deep": 110, "light": 222, "rem": 106, "awake": 35 },
    "score": 93
  },
  "activity": { "steps": 10547, "calories": 2716, "activeMinutes": 56, "distanceKm": 7.7 },
  "spo2": 99,
  "stress": { "load": 31 },
  "intraday": [
    { "hour": 0, "hr": 45, "spo2": 99, "steps": 0, "stressLoad": 31 },
    { "hour": 6, "hr": 70, "spo2": 98, "steps": 659, "stressLoad": 31 }
  ]
}
```

历史存档为连续 31 天的此类记录。

### 7.3 活动脚本 ActivitySegment

```json
{
  "profileId": "profile-a",
  "scriptId": "profile-a-day-1",
  "initialDemoTime": "2026-06-21T07:05",
  "segments": [
    {
      "segmentId": "seg-baseline-sleep-a",
      "type": "sleep",
      "start": "2026-06-20T21:05", "end": "2026-06-21T07:05",
      "params": { "durationMinutes": 600 },
      "source": "baseline_script"
    }
  ]
}
```

四个画像的 baseline 片段当前均为单条 sleep，时长由各自 `avgSleepMinutes` 决定（10h / 8h / 5h / 7h）。

### 7.4 回退文案

```json
{
  "summary": "目前各项健康指标表现良好，整体状态不错。\n\n…\n\n你想怎么做？",
  "chartTokens": ["HRV_7DAYS", "SLEEP_7DAYS"],
  "microTips": [],
  "actions": []
}
```
