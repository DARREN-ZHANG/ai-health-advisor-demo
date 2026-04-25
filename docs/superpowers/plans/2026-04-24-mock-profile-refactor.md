# Mock Profile 重构实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 替换现有 3 个 Mock Profile 为 4 个全新 Profile，新增 6 种 segment type 及对应生成器，扩展 God Mode 面板。

**Architecture:** 在现有分层结构上直接扩展——共享类型层新增 type 定义，sandbox 数据生成层新增生成器函数，前端层新增按钮，数据文件全量替换。

**Tech Stack:** TypeScript, React, Zod, Node.js

---

## 文件结构

### 代码改动（按文件）

| 文件 | 职责 |
|------|------|
| `packages/shared/src/types/sandbox.ts:6-12` | `ActivitySegmentType` 联合类型扩展 |
| `packages/sandbox/src/helpers/activity-generators.ts` | 新增 6 个生成器函数 + GENERATOR_MAP 更新 |
| `packages/sandbox/src/helpers/timeline-append.ts:25-32` | `DEFAULT_DURATION` 追加 6 条 |
| `apps/web/src/components/god-mode/GodModePanel.tsx:11-18` | `TIMELINE_SEGMENTS` 追加 6 项 |

### 数据文件（全量替换/新增）

| 文件 | 操作 |
|------|------|
| `data/sandbox/profiles/profile-a.json` | 替换为巅峰表现型 |
| `data/sandbox/profiles/profile-b.json` | 替换为低效睡眠型 |
| `data/sandbox/profiles/profile-c.json` | 替换为焦虑耗竭型 |
| `data/sandbox/profiles/profile-d.json` | 新增社交运动型 |
| `data/sandbox/history/profile-*-daily-records.json` | 4 个文件（3 替换 + 1 新增） |
| `data/sandbox/timeline-scripts/profile-*-day-1.json` | 4 个文件（3 替换 + 1 新增） |
| `data/sandbox/manifest.json` | 更新为 4 个 profile 条目 |
| `scripts/generate-history.ts` | 新增：历史数据生成脚本 |

---

### Task 1: 扩展 ActivitySegmentType 类型

**Files:**
- Modify: `packages/shared/src/types/sandbox.ts:6-12`

- [ ] **Step 1: 在 `ActivitySegmentType` 联合类型中追加 6 个新值**

在 `packages/shared/src/types/sandbox.ts` 第 6-12 行，将 `ActivitySegmentType` 修改为：

```typescript
/** 活动片段类型 */
export type ActivitySegmentType =
  | 'meal_intake'
  | 'steady_cardio'
  | 'prolonged_sedentary'
  | 'intermittent_exercise'
  | 'walk'
  | 'sleep'
  | 'deep_focus'
  | 'anxiety_episode'
  | 'breathing_pause'
  | 'alcohol_intake'
  | 'nightmare'
  | 'relaxation';
```

- [ ] **Step 2: 验证 TypeScript 编译**

Run: `npx tsc --noEmit -p packages/shared/tsconfig.json 2>&1 | head -20`
Expected: 编译通过（新增的 type 值暂时未被引用不会报错）

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/types/sandbox.ts
git commit -m "feat(shared): add 6 new ActivitySegmentType values for extended events"
```

---

### Task 2: 新增 6 个生成器函数

**Files:**
- Modify: `packages/sandbox/src/helpers/activity-generators.ts`

此文件使用确定性伪随机生成器 `deterministic(seed, offset)` 和 `rangeValue(base, range, offset, seed)` 生成设备事件。每个生成器产出 `DeviceEvent[]`，包含 `heartRate`、`steps`、`motion`、`spo2` 指标，以及头尾的 `wearState` 事件。

所有新生成器遵循与现有 6 个生成器完全相同的模式：
1. 计算 `totalMin`
2. 写入 `wearState` (开始=true, 结束=false)
3. 按分钟循环写入 `heartRate`、`steps`、`motion`
4. 每 5 分钟写入 `spo2`
5. 返回 events 数组

- [ ] **Step 1: 在 `generateSleepEvents` 函数后（约第 387 行）、`GENERATOR_MAP` 之前，添加 6 个新生成器函数**

```typescript
// ============================================================
// 生成器: deep_focus（深度专注）
// ============================================================

/** 深度专注事件生成 */
function generateDeepFocusEvents(segment: ActivitySegment): DeviceEvent[] {
  const events: DeviceEvent[] = [];
  const totalMin = diffMinutes(segment.start, segment.end);
  let idx = 0;

  // wearState
  events.push(makeEvent(segment, 0, 'wearState', true, idx++));
  events.push(makeEvent(segment, totalMin, 'wearState', false, idx++));

  for (let m = 0; m < totalMin; m += 1) {
    // heartRate: 55-62 bpm（平静专注状态）
    const hr = rangeValue(58, 8, m, 60);
    events.push(makeEvent(segment, m, 'heartRate', hr, idx++));

    // steps: 零（静坐不动）
    events.push(makeEvent(segment, m, 'steps', 0, idx++));

    // motion: 极低（几乎零位移）
    const motion = rangeValue(1, 2, m, 61);
    events.push(makeEvent(segment, m, 'motion', motion, idx++));

    // spo2: 每5分钟
    if (m % 5 === 0) {
      const spo2 = rangeValue(99, 2, m, 62);
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
  const triggerRaw = params.trigger;
  const trigger = typeof triggerRaw === 'string' ? triggerRaw : 'work';

  // 焦虑程度影响心率基线
  const hrBase = trigger === 'social' ? 90 : trigger === 'panic' ? 100 : 95;
  let idx = 0;

  // wearState
  events.push(makeEvent(segment, 0, 'wearState', true, idx++));
  events.push(makeEvent(segment, totalMin, 'wearState', false, idx++));

  for (let m = 0; m < totalMin; m += 1) {
    // heartRate: 85-110 bpm（情绪波动大，随时间先升后降）
    const progress = m / totalMin;
    const hrSpike = Math.sin(progress * Math.PI) * 12;
    const hr = rangeValue(Math.round(hrBase + hrSpike), 15, m, 70);
    events.push(makeEvent(segment, m, 'heartRate', hr, idx++));

    // steps: 极少量（僵坐或高频微动）
    const steps = deterministic(71, m) > 0.7 ? Math.round(deterministic(72, m) * 5) : 0;
    events.push(makeEvent(segment, m, 'steps', steps, idx++));

    // motion: 极低到中等（僵坐或高频微动交替）
    const motion = rangeValue(3, 6, m, 73);
    events.push(makeEvent(segment, m, 'motion', motion, idx++));

    // spo2: 每5分钟
    if (m % 5 === 0) {
      const spo2 = rangeValue(97, 2, m, 74);
      events.push(makeEvent(segment, m, 'spo2', spo2, idx++));
    }
  }

  return events;
}

// ============================================================
// 生成器: breathing_pause（呼吸暂停）
// ============================================================

/** 呼吸暂停事件生成 */
function generateBreathingPauseEvents(segment: ActivitySegment): DeviceEvent[] {
  const events: DeviceEvent[] = [];
  const totalMin = diffMinutes(segment.start, segment.end);
  const params = segment.params ?? {};
  const severityRaw = params.severity;
  const severity = severityRaw === 'mild' || severityRaw === 'severe' ? severityRaw : 'moderate';

  // 严重程度影响 SpO2 最低值
  const spo2Base = severity === 'severe' ? 86 : severity === 'mild' ? 91 : 89;
  let idx = 0;

  // wearState
  events.push(makeEvent(segment, 0, 'wearState', true, idx++));
  events.push(makeEvent(segment, totalMin, 'wearState', false, idx++));

  for (let m = 0; m < totalMin; m += 1) {
    // SpO2 先降后升（模拟暂停→恢复过程）
    const progress = m / totalMin;
    const spo2Drop = Math.sin(progress * Math.PI) * 8;
    const currentSpo2 = Math.round(spo2Base + 6 - spo2Drop);

    // heartRate: 暂停期低→憋醒后飙升
    const hrBase = progress < 0.6 ? 65 : 90;
    const hr = rangeValue(Math.round(hrBase + (progress > 0.6 ? 10 : 0)), 12, m, 80);
    events.push(makeEvent(segment, m, 'heartRate', hr, idx++));

    // steps: 零
    events.push(makeEvent(segment, m, 'steps', 0, idx++));

    // motion: 后半段突发大幅动作
    const motion = progress > 0.5 ? rangeValue(6, 5, m, 81) : rangeValue(1, 2, m, 82);
    events.push(makeEvent(segment, m, 'motion', motion, idx++));

    // spo2: 每分钟（呼吸暂停需要高频监测）
    events.push(makeEvent(segment, m, 'spo2', Math.max(82, currentSpo2), idx++));
  }

  return events;
}

// ============================================================
// 生成器: alcohol_intake（饮酒）
// ============================================================

/** 饮酒事件生成 */
function generateAlcoholIntakeEvents(segment: ActivitySegment): DeviceEvent[] {
  const events: DeviceEvent[] = [];
  const totalMin = diffMinutes(segment.start, segment.end);
  const params = segment.params ?? {};
  const amountRaw = params.amount;
  const amount = amountRaw === 'light' || amountRaw === 'heavy' ? amountRaw : 'moderate';

  // 饮酒量影响心率升幅
  const hrBase = amount === 'heavy' ? 95 : amount === 'light' ? 82 : 90;
  let idx = 0;
  let cumulativeSteps = 0;

  // wearState
  events.push(makeEvent(segment, 0, 'wearState', true, idx++));
  events.push(makeEvent(segment, totalMin, 'wearState', false, idx++));

  for (let m = 0; m < totalMin; m += 1) {
    // heartRate: 随饮酒时间逐步升高
    const progress = m / totalMin;
    const hrElevation = progress * 8;
    const hr = rangeValue(Math.round(hrBase + hrElevation), 10, m, 90);
    events.push(makeEvent(segment, m, 'heartRate', hr, idx++));

    // steps: 不规则（社交时有走动）
    const stepsDelta = Math.round(deterministic(91, m) * 20);
    cumulativeSteps += stepsDelta;
    events.push(makeEvent(segment, m, 'steps', cumulativeSteps, idx++));

    // motion: 不规则（手部活跃/不规则步态）
    const motion = rangeValue(4, 6, m, 92);
    events.push(makeEvent(segment, m, 'motion', motion, idx++));

    // spo2: 每5分钟
    if (m % 5 === 0) {
      const spo2 = rangeValue(96, 4, m, 93);
      events.push(makeEvent(segment, m, 'spo2', spo2, idx++));
    }
  }

  return events;
}

// ============================================================
// 生成器: nightmare（噩梦）
// ============================================================

/** 噩梦事件生成 */
function generateNightmareEvents(segment: ActivitySegment): DeviceEvent[] {
  const events: DeviceEvent[] = [];
  const totalMin = diffMinutes(segment.start, segment.end);
  let idx = 0;

  // wearState
  events.push(makeEvent(segment, 0, 'wearState', true, idx++));
  events.push(makeEvent(segment, totalMin, 'wearState', false, idx++));

  // 噩梦通常在中间达到峰值
  for (let m = 0; m < totalMin; m += 1) {
    const progress = m / totalMin;
    const intensity = Math.sin(progress * Math.PI);

    // heartRate: 85-95 bpm（突发应激，中间峰值）
    const hr = rangeValue(Math.round(85 + intensity * 10), 10, m, 100);
    events.push(makeEvent(segment, m, 'heartRate', hr, idx++));

    // steps: 零
    events.push(makeEvent(segment, m, 'steps', 0, idx++));

    // motion: 突发大幅位移（噩梦挣扎）
    const motion = intensity > 0.5 ? rangeValue(5, 4, m, 101) : rangeValue(1, 2, m, 102);
    events.push(makeEvent(segment, m, 'motion', motion, idx++));

    // spo2: 每5分钟
    if (m % 5 === 0) {
      const spo2 = rangeValue(96, 2, m, 103);
      events.push(makeEvent(segment, m, 'spo2', spo2, idx++));
    }
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
  let idx = 0;

  // wearState
  events.push(makeEvent(segment, 0, 'wearState', true, idx++));
  events.push(makeEvent(segment, totalMin, 'wearState', false, idx++));

  for (let m = 0; m < totalMin; m += 1) {
    // heartRate: 50-55 bpm（平静放松）
    const hr = rangeValue(52, 5, m, 110);
    events.push(makeEvent(segment, m, 'heartRate', hr, idx++));

    // steps: 零
    events.push(makeEvent(segment, m, 'steps', 0, idx++));

    // motion: 零位移
    events.push(makeEvent(segment, m, 'motion', 0, idx++));

    // spo2: 每5分钟
    if (m % 5 === 0) {
      const spo2 = rangeValue(99, 2, m, 112);
      events.push(makeEvent(segment, m, 'spo2', spo2, idx++));
    }
  }

  return events;
}
```

- [ ] **Step 2: 更新 `GENERATOR_MAP`（约第 394-401 行），追加 6 个新映射**

将 `GENERATOR_MAP` 修改为：

```typescript
const GENERATOR_MAP: Record<ActivitySegmentType, (segment: ActivitySegment) => DeviceEvent[]> = {
  meal_intake: generateMealIntakeEvents,
  steady_cardio: generateSteadyCardioEvents,
  prolonged_sedentary: generateProlongedSedentaryEvents,
  intermittent_exercise: generateIntermittentExerciseEvents,
  walk: generateWalkEvents,
  sleep: generateSleepEvents,
  deep_focus: generateDeepFocusEvents,
  anxiety_episode: generateAnxietyEpisodeEvents,
  breathing_pause: generateBreathingPauseEvents,
  alcohol_intake: generateAlcoholIntakeEvents,
  nightmare: generateNightmareEvents,
  relaxation: generateRelaxationEvents,
};
```

- [ ] **Step 3: 更新文件底部的导出语句，追加 6 个新导出**

将导出语句修改为：

```typescript
export {
  generateMealIntakeEvents,
  generateSteadyCardioEvents,
  generateProlongedSedentaryEvents,
  generateIntermittentExerciseEvents,
  generateWalkEvents,
  generateSleepEvents,
  generateDeepFocusEvents,
  generateAnxietyEpisodeEvents,
  generateBreathingPauseEvents,
  generateAlcoholIntakeEvents,
  generateNightmareEvents,
  generateRelaxationEvents,
};
```

- [ ] **Step 4: 验证 TypeScript 编译**

Run: `npx tsc --noEmit -p packages/sandbox/tsconfig.json 2>&1 | head -20`
Expected: 编译通过

- [ ] **Step 5: Commit**

```bash
git add packages/sandbox/src/helpers/activity-generators.ts
git commit -m "feat(sandbox): add 6 new event generators for extended segment types"
```

---

### Task 3: 更新 DEFAULT_DURATION 和 Timeline Append

**Files:**
- Modify: `packages/sandbox/src/helpers/timeline-append.ts:25-32`

- [ ] **Step 1: 在 `DEFAULT_DURATION` 中追加 6 个新 segment type 的默认时长**

将 `DEFAULT_DURATION` 修改为：

```typescript
const DEFAULT_DURATION: Record<ActivitySegmentType, number> = {
  meal_intake: 20,
  steady_cardio: 15,
  prolonged_sedentary: 240,
  intermittent_exercise: 30,
  walk: 30,
  sleep: 480,
  deep_focus: 120,
  anxiety_episode: 30,
  breathing_pause: 5,
  alcohol_intake: 60,
  nightmare: 10,
  relaxation: 60,
};
```

- [ ] **Step 2: 验证 TypeScript 编译**

Run: `npx tsc --noEmit -p packages/sandbox/tsconfig.json 2>&1 | head -20`
Expected: 编译通过

- [ ] **Step 3: Commit**

```bash
git add packages/sandbox/src/helpers/timeline-append.ts
git commit -m "feat(sandbox): add default durations for 6 new segment types"
```

---

### Task 4: 扩展 God Mode 面板按钮

**Files:**
- Modify: `apps/web/src/components/god-mode/GodModePanel.tsx:11-18`

- [ ] **Step 1: 在 `TIMELINE_SEGMENTS` 数组中追加 6 个新按钮定义**

将 `TIMELINE_SEGMENTS` 修改为：

```typescript
const TIMELINE_SEGMENTS: { type: TimelineAppendPayload['segmentType']; label: string; icon: string; params?: Record<string, number | string | boolean> }[] = [
  { type: 'meal_intake', label: '进餐', icon: '🍽️', params: { mealContext: 'breakfast' } },
  { type: 'steady_cardio', label: '有氧', icon: '🏃', params: { durationMinutes: 30 } },
  { type: 'prolonged_sedentary', label: '久坐', icon: '🪑', params: { durationMinutes: 120 } },
  { type: 'intermittent_exercise', label: '间歇运动', icon: '🏋️', params: { rounds: 5 } },
  { type: 'walk', label: '散步', icon: '🚶', params: undefined },
  { type: 'sleep', label: '睡眠', icon: '😴', params: { durationMinutes: 480 } },
  { type: 'deep_focus', label: '专注', icon: '🧠', params: { intensity: 'high' } },
  { type: 'anxiety_episode', label: '焦虑', icon: '😰', params: { trigger: 'work' } },
  { type: 'breathing_pause', label: '呼吸暂停', icon: '🫁', params: { severity: 'moderate' } },
  { type: 'alcohol_intake', label: '饮酒', icon: '🍺', params: { amount: 'moderate' } },
  { type: 'nightmare', label: '噩梦', icon: '👻', params: { intensity: 'high' } },
  { type: 'relaxation', label: '放松', icon: '📖', params: { activity: 'reading' } },
];
```

- [ ] **Step 2: 验证前端编译**

Run: `npx tsc --noEmit -p apps/web/tsconfig.json 2>&1 | head -20`
Expected: 编译通过

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/god-mode/GodModePanel.tsx
git commit -m "feat(web): add 6 new timeline control buttons to God Mode panel"
```

---

### Task 5: 创建 4 个 Profile 数据文件和更新 Manifest

**Files:**
- Replace: `data/sandbox/profiles/profile-a.json`
- Replace: `data/sandbox/profiles/profile-b.json`
- Replace: `data/sandbox/profiles/profile-c.json`
- Create: `data/sandbox/profiles/profile-d.json`
- Update: `data/sandbox/manifest.json`

- [ ] **Step 1: 替换 `data/sandbox/profiles/profile-a.json`**

```json
{
  "profile": {
    "profileId": "profile-a",
    "name": "林巅峰",
    "age": 28,
    "gender": "male",
    "avatar": "avatar-a.png",
    "tags": ["规律健身", "长睡眠", "HRV优秀"],
    "baseline": {
      "restingHr": 48,
      "hrv": 95,
      "spo2": 99,
      "avgSleepMinutes": 465,
      "avgSteps": 12000
    }
  },
  "initialDemoTime": "2026-04-24T07:05",
  "historyRef": {
    "file": "history/profile-a-daily-records.json"
  },
  "timelineScriptRef": {
    "file": "timeline-scripts/profile-a-day-1.json"
  }
}
```

- [ ] **Step 2: 替换 `data/sandbox/profiles/profile-b.json`**

```json
{
  "profile": {
    "profileId": "profile-b",
    "name": "赵沉睡",
    "age": 42,
    "gender": "male",
    "avatar": "avatar-d.png",
    "tags": ["偏胖", "睡眠呼吸暂停", "慢性疲劳"],
    "baseline": {
      "restingHr": 72,
      "hrv": 22,
      "spo2": 94,
      "avgSleepMinutes": 480,
      "avgSteps": 3000
    }
  },
  "initialDemoTime": "2026-04-24T08:00",
  "historyRef": {
    "file": "history/profile-b-daily-records.json"
  },
  "timelineScriptRef": {
    "file": "timeline-scripts/profile-b-day-1.json"
  }
}
```

- [ ] **Step 3: 替换 `data/sandbox/profiles/profile-c.json`**

```json
{
  "profile": {
    "profileId": "profile-c",
    "name": "孙焦虑",
    "age": 26,
    "gender": "female",
    "avatar": "avatar-e.png",
    "tags": ["偏瘦", "短睡眠", "高压力"],
    "baseline": {
      "restingHr": 78,
      "hrv": 15,
      "spo2": 97,
      "avgSleepMinutes": 330,
      "avgSteps": 4000
    }
  },
  "initialDemoTime": "2026-04-24T06:00",
  "historyRef": {
    "file": "history/profile-c-daily-records.json"
  },
  "timelineScriptRef": {
    "file": "timeline-scripts/profile-c-day-1.json"
  }
}
```

- [ ] **Step 4: 创建 `data/sandbox/profiles/profile-d.json`**

```json
{
  "profile": {
    "profileId": "profile-d",
    "name": "周社交",
    "age": 31,
    "gender": "male",
    "avatar": "avatar-f.png",
    "tags": ["有氧运动", "社交饮酒", "恢复赤字"],
    "baseline": {
      "restingHr": 58,
      "hrv": 55,
      "spo2": 98,
      "avgSleepMinutes": 420,
      "avgSteps": 10000
    }
  },
  "initialDemoTime": "2026-04-24T08:00",
  "historyRef": {
    "file": "history/profile-d-daily-records.json"
  },
  "timelineScriptRef": {
    "file": "timeline-scripts/profile-d-day-1.json"
  }
}
```

- [ ] **Step 5: 更新 `data/sandbox/manifest.json`**

```json
{
  "version": "1.0.0",
  "profiles": [
    { "profileId": "profile-a", "name": "林巅峰", "file": "profiles/profile-a.json" },
    { "profileId": "profile-b", "name": "赵沉睡", "file": "profiles/profile-b.json" },
    { "profileId": "profile-c", "name": "孙焦虑", "file": "profiles/profile-c.json" },
    { "profileId": "profile-d", "name": "周社交", "file": "profiles/profile-d.json" }
  ]
}
```

- [ ] **Step 6: Commit**

```bash
git add data/sandbox/profiles/ data/sandbox/manifest.json
git commit -m "feat(data): replace profiles A/B/C and add profile D with new personas"
```

---

### Task 6: 创建 4 个 Timeline Script 文件

**Files:**
- Replace: `data/sandbox/timeline-scripts/profile-a-day-1.json`
- Replace: `data/sandbox/timeline-scripts/profile-b-day-1.json`
- Replace: `data/sandbox/timeline-scripts/profile-c-day-1.json`
- Create: `data/sandbox/timeline-scripts/profile-d-day-1.json`

每个 timeline script 只包含 baseline sleep segment（用户选择了纯方案 A，不预填充场景）。`initialDemoTime` 与对应 profile 文件一致。

- [ ] **Step 1: 替换 `data/sandbox/timeline-scripts/profile-a-day-1.json`**

```json
{
  "profileId": "profile-a",
  "scriptId": "profile-a-day-1",
  "initialDemoTime": "2026-04-24T07:05",
  "segments": [
    {
      "segmentId": "seg-baseline-sleep-a",
      "type": "sleep",
      "start": "2026-04-23T23:20",
      "end": "2026-04-24T07:05",
      "params": { "durationMinutes": 465, "quality": "good" },
      "source": "baseline_script"
    }
  ]
}
```

- [ ] **Step 2: 替换 `data/sandbox/timeline-scripts/profile-b-day-1.json`**

```json
{
  "profileId": "profile-b",
  "scriptId": "profile-b-day-1",
  "initialDemoTime": "2026-04-24T08:00",
  "segments": [
    {
      "segmentId": "seg-baseline-sleep-b",
      "type": "sleep",
      "start": "2026-04-24T00:00",
      "end": "2026-04-24T08:00",
      "params": { "durationMinutes": 480, "quality": "poor" },
      "source": "baseline_script"
    }
  ]
}
```

- [ ] **Step 3: 替换 `data/sandbox/timeline-scripts/profile-c-day-1.json`**

```json
{
  "profileId": "profile-c",
  "scriptId": "profile-c-day-1",
  "initialDemoTime": "2026-04-24T06:00",
  "segments": [
    {
      "segmentId": "seg-baseline-sleep-c",
      "type": "sleep",
      "start": "2026-04-24T00:30",
      "end": "2026-04-24T06:00",
      "params": { "durationMinutes": 330, "quality": "poor" },
      "source": "baseline_script"
    }
  ]
}
```

- [ ] **Step 4: 创建 `data/sandbox/timeline-scripts/profile-d-day-1.json`**

```json
{
  "profileId": "profile-d",
  "scriptId": "profile-d-day-1",
  "initialDemoTime": "2026-04-24T08:00",
  "segments": [
    {
      "segmentId": "seg-baseline-sleep-d",
      "type": "sleep",
      "start": "2026-04-24T01:00",
      "end": "2026-04-24T08:00",
      "params": { "durationMinutes": 420, "quality": "fair" },
      "source": "baseline_script"
    }
  ]
}
```

- [ ] **Step 5: Commit**

```bash
git add data/sandbox/timeline-scripts/
git commit -m "feat(data): replace timeline scripts for new profile personas"
```

---

### Task 7: 创建历史数据生成脚本并生成 4 个 Profile 的 30 天历史数据

**Files:**
- Create: `scripts/generate-history.ts`
- Replace: `data/sandbox/history/profile-a-daily-records.json`
- Replace: `data/sandbox/history/profile-b-daily-records.json`
- Replace: `data/sandbox/history/profile-c-daily-records.json`
- Create: `data/sandbox/history/profile-d-daily-records.json`

每个 Profile 的历史数据包含 30 天（2026-03-25 ~ 2026-04-24）的 DailyRecord。数据需符合对应 Profile 的生理特征。由于每个文件约 3700 行 JSON，需要编写生成脚本。

- [ ] **Step 1: 创建 `scripts/generate-history.ts`**

此脚本为独立 Node.js 脚本（不依赖 tsconfig 项目配置），使用确定性伪随机逻辑为每个 Profile 生成 30 天历史数据。

脚本接受 profileId 参数，读取 `data/sandbox/profiles/{profileId}.json` 获取 baseline 指标，根据 Profile 类型使用不同的数据范围生成 30 天 DailyRecord，输出到 `data/sandbox/history/{profileId}-daily-records.json`。

关键数据范围（按 Profile）：

**Profile A（巅峰表现型）**:
- hr[]: 5 个值，范围 [43-60, 55-62, 60-75, 100-145, 60-72]（低基础心率，运动高峰高）
- sleep: totalMinutes 435-495, score 77-98, deep 占比高, awake 少
- activity: steps 7500-12000, activeMinutes 40-60
- spo2: 97-100
- stress.load: 17-33（低压力）
- intraday: hr 供睡眠时 45-62, 白天 57-90, 运动时可达 84+

**Profile B（低效睡眠型）**:
- hr[]: 5 个值，范围 [65-80, 68-78, 65-90, 80-100, 65-78]
- sleep: totalMinutes 450-510, score 40-65, awake 多, deep 少
- activity: steps 2000-4000, activeMinutes 10-25
- spo2: 90-96（低血氧）
- stress.load: 50-75（高压力/疲劳）
- intraday: hr 白天 68-90, 夜间 SpO2 常低于 95

**Profile C（焦虑耗竭型）**:
- hr[]: 5 个值，范围 [72-85, 85-115, 78-105, 80-110, 70-82]
- sleep: totalMinutes 280-380, score 30-55, awake 多
- activity: steps 2500-5000, activeMinutes 15-35
- spo2: 96-99
- stress.load: 60-85（极高压力）
- intraday: hr 焦虑期 85-110, 睡眠时 72-80

**Profile D（社交运动型）**:
- hr[]: 5 个值，范围 [55-68, 60-70, 60-70, 140-165, 60-75]
- sleep: totalMinutes 360-480, score 45-70（酒精影响质量）
- activity: steps 6000-12000, activeMinutes 30-65
- spo2: 95-99
- stress.load: 30-55（中等压力）
- intraday: 运动时 hr 可达 150+, 饮酒后 hr 偏高

生成逻辑：
1. 确定性伪随机（使用 seeded PRNG，以 profileId + date 为种子）
2. 每天的数据围绕 baseline 上下波动
3. intraday 快照 12 个小时（偶数小时 0,2,4,...,22）
4. hr 数组 5 个值：[最低, 晨起均值, 日间均值, 峰值, 夜间均值]

脚本使用 `ts-node` 或 `tsx` 运行，输出格式与现有 `profile-a-daily-records.json` 完全一致。

- [ ] **Step 2: 运行脚本生成 4 个 Profile 的历史数据**

```bash
npx tsx scripts/generate-history.ts profile-a
npx tsx scripts/generate-history.ts profile-b
npx tsx scripts/generate-history.ts profile-c
npx tsx scripts/generate-history.ts profile-d
```

- [ ] **Step 3: 验证生成的 JSON 格式正确**

```bash
for f in data/sandbox/history/profile-*.json; do
  echo "=== $f ==="
  node -e "const d = require('./$f'); console.log('records:', d.records.length, 'dateRange:', JSON.stringify(d.dateRange))"
done
```

Expected: 每个 profile 输出 30 条 records，dateRange 为 2026-03-25 ~ 2026-04-24

- [ ] **Step 4: Commit**

```bash
git add scripts/generate-history.ts data/sandbox/history/
git commit -m "feat(data): generate 30-day history for 4 new profile personas"
```

---

### Task 8: 最终验证

- [ ] **Step 1: 全项目 TypeScript 编译检查**

```bash
npx tsc --noEmit -p packages/shared/tsconfig.json
npx tsc --noEmit -p packages/sandbox/tsconfig.json
npx tsc --noEmit -p apps/web/tsconfig.json
npx tsc --noEmit -p apps/agent-api/tsconfig.json
```

Expected: 所有包编译通过

- [ ] **Step 2: 验证数据文件完整性**

```bash
node -e "
const m = require('./data/sandbox/manifest.json');
console.log('Manifest profiles:', m.profiles.length);
for (const p of m.profiles) {
  try {
    const d = require('./data/sandbox/' + p.file);
    console.log(p.profileId, ':', d.profile.name, '- baseline:', JSON.stringify(d.profile.baseline));
    const h = require('./data/sandbox/' + d.historyRef.file);
    console.log('  history:', h.records.length, 'days');
    const t = require('./data/sandbox/' + d.timelineScriptRef.file);
    console.log('  timeline:', t.segments.length, 'segments');
  } catch(e) { console.error('  ERROR:', e.message); }
}
"
```

Expected: 4 个 profile 都有完整的 profile + 30天 history + timeline script

- [ ] **Step 3: 启动开发服务器验证**

```bash
pnpm dev
```

验证：
- 前端可正常加载
- God Mode 面板显示 12 个按钮
- 切换 Profile 时数据正确加载

- [ ] **Step 4: Final commit（如有未提交的修正）**

```bash
git add -A
git commit -m "chore: final adjustments for mock profile refactor"
```
