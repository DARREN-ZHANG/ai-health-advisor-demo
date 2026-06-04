# 微事件类型扩充执行文档

## 概述

将微事件类型从 14 种扩充至 32 种，新增 18 种微事件。分三轮实施，每轮 6 种。

---

## 新增微事件完整定义

### 第一轮（R1）：呼吸、补水、体温、体态核心补充

| # | type | titleZh | evidenceLabelZh | profile | 默认时长 | motionPattern |
|---|------|---------|-----------------|---------|---------|---------------|
| 1 | `micro_box_breathing` | 做一组箱式呼吸 | 检到结构化呼吸节律与心率快速下降 | `box_breathing` | 3 min | `still_upright` |
| 2 | `micro_calming_breathing` | 做一组舒缓调息 | 检测到延长呼气节律与心率温和下降 | `calming_breathing` | 5 min | `still_upright` |
| 3 | `micro_hydration_walk` | 去接杯水走一走 | 检测到短时轻度步行与短暂静止交替 | `hydration_walk` | 5 min | `periodic_stroll` |
| 4 | `micro_warm_shower` | 洗个温水澡 | 检测到皮肤温度先升后降 | `warm_shower` | 10 min | `still_upright` |
| 5 | `micro_posture_correction` | 纠正一下坐姿 | 检测到坐姿微调整与低活动量 | `posture_correction` | 15 min | `still_upright` |
| 6 | `micro_neuro_warmup` | 做一组热身唤醒 | 检测到原地轻度活动与心率微升 | `neuro_warmup` | 5 min | `intermittent_gesture` |

### 第二轮（R2）：营养、淋浴、休息、移动场景补充

| # | type | titleZh | evidenceLabelZh | profile | 默认时长 | motionPattern |
|---|------|---------|-----------------|---------|---------|---------------|
| 7 | `micro_recovery_meal` | 吃一份练后恢复餐 | 检测到餐后静止与轻度消化活动 | `recovery_meal` | 15 min | `still_with_micro` |
| 8 | `micro_power_nap` | 闭眼小憩一会儿 | 检测到平躺静止与心率降至静息以下 | `power_nap` | 20 min | `still_supine` |
| 9 | `micro_screen_dimming` | 关屏调暗灯光 | 检测到低刺激静止与心率缓慢下降 | `screen_dimming` | 15 min | `still_supine` |
| 10 | `micro_cool_shower` | 冲个微凉淋浴 | 检测到皮肤温度下降与心率快速回落 | `cool_shower` | 8 min | `still_upright` |
| 11 | `micro_outdoor_breather` | 去户外透透气 | 检测到户外级步数与血氧回升 | `outdoor_breather` | 10 min | `periodic_walk` |
| 12 | `micro_stair_climb` | 爬几层楼梯 | 检测到短时高强度步频与心率快速上升 | `stair_climb` | 5 min | `periodic_brisk` |

### 第三轮（R3）：冥想放松、站姿、筋膜、迷走神经补充

| # | type | titleZh | evidenceLabelZh | profile | 默认时长 | motionPattern |
|---|------|---------|-----------------|---------|---------|---------------|
| 13 | `micro_standing_work` | 站起来办公一会儿 | 检测到站立位低活动量工作 | `standing_work` | 20 min | `still_upright` |
| 14 | `micro_foam_rolling` | 用泡沫轴放松一下 | 检测到地面级低强度活动 | `foam_rolling` | 10 min | `intermittent_reach` |
| 15 | `micro_cold_face_dip` | 用冷水敷一下脸 | 检测到皮肤温度骤降与心率急降 | `cold_face_dip` | 3 min | `still_upright` |
| 16 | `micro_mindfulness_meditation` | 做一段正念冥想 | 检测到持续静止与心率平稳下降 | `mindfulness_meditation` | 15 min | `still_supine` |
| 17 | `micro_muscle_relaxation` | 做一组渐进式肌肉放松 | 检测到规律性微张力与心率锯齿形下降 | `muscle_relaxation` | 10 min | `still_supine` |
| 18 | `micro_light_meal` | 吃一份清淡轻食 | 检测到轻度消化活动与低代谢负担 | `light_meal` | 15 min | `still_with_micro` |

---

## 改动文件清单（按依赖顺序）

### Phase 1：类型与注册（无运行时依赖，纯数据）

#### 1.1 `packages/shared/src/types/micro-event.ts`

在 `MICRO_EVENT_TYPES` 数组末尾追加 18 个新类型（保持原有的 `as const`）。

```
追加项（按顺序）：
'micro_box_breathing',
'micro_calming_breathing',
'micro_hydration_walk',
'micro_warm_shower',
'micro_posture_correction',
'micro_neuro_warmup',
'micro_recovery_meal',
'micro_power_nap',
'micro_screen_dimming',
'micro_cool_shower',
'micro_outdoor_breather',
'micro_stair_climb',
'micro_standing_work',
'micro_foam_rolling',
'micro_cold_face_dip',
'micro_mindfulness_meditation',
'micro_muscle_relaxation',
'micro_light_meal',
```

**注意**：`MicroEventType` 联合类型从此数组自动派生，无需单独改动。

#### 1.2 `packages/sandbox/src/helpers/micro-event-registry.ts`

**a) 扩展 `MicroEventDefinition['profile']` 联合类型**

在现有 13 个 profile 值后追加 18 个新 profile 值：

```typescript
profile:
  | 'deep_breathing'
  // ... 现有 13 个 ...
  | 'sleep_wind_down'
  // === R1 新增 ===
  | 'box_breathing'
  | 'calming_breathing'
  | 'hydration_walk'
  | 'warm_shower'
  | 'posture_correction'
  | 'neuro_warmup'
  // === R2 新增 ===
  | 'recovery_meal'
  | 'power_nap'
  | 'screen_dimming'
  | 'cool_shower'
  | 'outdoor_breather'
  | 'stair_climb'
  // === R3 新增 ===
  | 'standing_work'
  | 'foam_rolling'
  | 'cold_face_dip'
  | 'mindfulness_meditation'
  | 'muscle_relaxation'
  | 'light_meal';
```

**b) 在 `MICRO_EVENT_REGISTRY` 中追加 18 个条目**

每个条目格式参照现有条目，例如：

```typescript
micro_box_breathing: {
  type: 'micro_box_breathing',
  defaultDurationMinutes: 3,
  titleZh: '做一组箱式呼吸',
  evidenceLabelZh: '检测到结构化呼吸节律与心率快速下降',
  profile: 'box_breathing',
},
```

完整条目见上方"新增微事件完整定义"表格。

#### 1.3 自动跟随（无需手动改动）

以下文件从 `MICRO_EVENT_TYPES` 或 `MicroEventType` 自动派生，**不需要手动修改**：

- `packages/shared/src/schemas/micro-event.ts` — `z.enum(MICRO_EVENT_TYPES)` 自动跟随
- `packages/shared/src/index.ts` — re-export 不变
- `packages/shared/src/types/agent.ts` — `ActionInteraction` 使用 `MicroEventType`，自动跟随
- `packages/shared/src/schemas/agent.ts` — 使用 `MicroEventTypeSchema`，自动跟随
- `packages/shared/src/types/sandbox.ts` — `RecognizedEventType` 包含 `MicroEventType`，自动跟随
- `packages/shared/src/schemas/sandbox.ts` — 使用 `MicroEventTypeSchema`，自动跟随
- `packages/shared/src/types/god-mode.ts` — `MicroEventAppendPayload` 使用 `MicroEventType`，自动跟随
- `packages/shared/src/schemas/god-mode.ts` — 使用 `MicroEventTypeSchema`，自动跟随

---

### Phase 2：生理数据生成器（核心逻辑）

#### 2.1 `packages/sandbox/src/helpers/micro-event-generators.ts`

**a) 在 `MICRO_MOTION_PATTERN_MAP` 追加 18 条映射**

```typescript
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
micro_cold_face_dip: 'still_upright',
micro_mindfulness_meditation: 'still_supine',
micro_muscle_relaxation: 'still_supine',
micro_light_meal: 'still_with_micro',
```

**b) 编写 18 个新的 profile 生成器函数**

每个生成器函数签名为 `(segment: MicroEventSegment) => DeviceEvent[]`，必须遵循现有模式（确定性生成、`rangeValue` / `deterministic` 计算、`makeEvent` 构造）。

以下是每个生成器的生理特征规格：

---

**R1-1: `generateBoxBreathing` — profile: `box_breathing`**

核心特征：心率急降、HRV 大幅拉升、零步数。

| 指标 | 变化规则 |
|------|---------|
| heartRate | restingHr - (8 + progress * 4)，范围 ±3（比 deep_breathing 降幅更大） |
| hrvRmssd | hrv + (10 + progress * 8)，范围 ±4（比 deep_breathing 涨幅更大） |
| steps | 0 |
| motion | still_upright |
| stressLoad | 28 - progress * 10，范围 ±2 |

seed 基数：130-134

---

**R1-2: `generateCalmingBreathing` — profile: `calming_breathing`**

核心特征：温和持续的心率下降、HRV 稳步上升、零步数。比 box_breathing 更慢更稳。

| 指标 | 变化规则 |
|------|---------|
| heartRate | restingHr - (3 + progress * 5)，范围 ±3 |
| hrvRmssd | hrv + (6 + progress * 6)，范围 ±3 |
| steps | 0 |
| motion | still_upright |
| stressLoad | 26 - progress * 8，范围 ±3 |

seed 基数：140-144

---

**R1-3: `generateHydrationWalk` — profile: `hydration_walk`**

核心特征：步数少于 short_walk（100-200 步/5min），心率微升后回落。

| 指标 | 变化规则 |
|------|---------|
| heartRate | restingHr + 3 + sin(progress * π) * 4 - progress * 3，范围 ±5 |
| steps | 每分钟 20-40 步累积（比 short_walk 的 50-100 步/分钟更少） |
| motion | periodic_stroll |
| stressLoad | 不生成（补水场景无压力变化） |

seed 基数：150-154

---

**R1-4: `generateWarmShower` — profile: `warm_shower`**

核心特征：皮肤温度先升后降（核心特征），心率先微升后下降。

| 指标 | 变化规则 |
|------|---------|
| heartRate | 前 40% 微升 3-5 bpm，后 60% 下降至 restingHr - 2 |
| skinTemp | 前 60% 上升 0.3-0.5°C，后 40% 回落 0.2-0.4°C |
| steps | 0 |
| motion | still_upright |
| hrvRmssd | 后 60% 温和上升 3-6 ms |
| stressLoad | 25 - progress * 6，范围 ±2 |

seed 基数：160-165

注意：需要新增 `skinTemp` 指标的生成逻辑。检查 `DeviceEvent['metric']` 是否已包含 `skinTemp` 或类似字段。如不包含，改为在 evidenceLabelZh 中描述温度特征，生成器中用 `spo2` 替代（淋浴后血氧微升 1-2%）。

---

**R1-5: `generatePostureCorrection` — profile: `posture_correction`**

核心特征：近乎静止，心率极平稳（+2-3 bpm），血氧维持高位。

| 指标 | 变化规则 |
|------|---------|
| heartRate | restingHr + 2 - progress * 1，范围 ±2（非常平稳） |
| steps | 0（偶尔 1 步，概率 10%） |
| motion | still_upright |
| spo2 | 稳定在 97-99% |
| stressLoad | 不生成 |

seed 基数：170-174

---

**R1-6: `generateNeuroWarmup` — profile: `neuro_warmup`**

核心特征：原地活动，心率微升 5-8 bpm，步数极少。

| 指标 | 变化规则 |
|------|---------|
| heartRate | restingHr + 5 + sin(progress * π * 2) * 3，范围 ±3（有节律波动） |
| steps | 每分钟 5-15 步（极少，原地活动） |
| motion | intermittent_gesture |
| stressLoad | 不生成 |

seed 基数：180-184

---

**R2-7: `generateRecoveryMeal` — profile: `recovery_meal`**

核心特征：与 `snack` 类似但消化活动更强、持续更久。

| 指标 | 变化规则 |
|------|---------|
| heartRate | restingHr + 5 - progress * 2，范围 ±4（比 snack 的 +4 更高） |
| steps | 每分钟 0-2 步 |
| motion | still_with_micro |
| stressLoad | 不生成 |
| hrvRmssd | hrv - 3 + progress * 2（消化初期 HRV 轻微下降后恢复） |

seed 基数：190-195

---

**R2-8: `generatePowerNap` — profile: `power_nap`**

核心特征：心率降至静息以下、HRV 显著上升，类似 offscreen_rest 但幅度更大。

| 指标 | 变化规则 |
|------|---------|
| heartRate | restingHr - (3 + progress * 5)，范围 ±3 |
| hrvRmssd | hrv + (8 + progress * 7)，范围 ±4 |
| steps | 0 |
| motion | still_supine |
| stressLoad | 22 - progress * 8，范围 ±2 |

seed 基数：200-204

---

**R2-9: `generateScreenDimming` — profile: `screen_dimming`**

核心特征：心率极缓下降、HRV 温和上升，比 sleep_wind_down 更轻柔。

| 指标 | 变化规则 |
|------|---------|
| heartRate | restingHr - progress * 3，范围 ±2 |
| hrvRmssd | hrv + progress * 4，范围 ±3 |
| steps | 0 |
| motion | still_supine |
| stressLoad | 24 - progress * 6，范围 ±2 |

seed 基数：210-214

---

**R2-10: `generateCoolShower` — profile: `cool_shower`**

核心特征：皮肤温度下降（或血氧微升）、心率下降，与 warm_shower 方向相反。

| 指标 | 变化规则 |
|------|---------|
| heartRate | 前 30% 微升 2-3 bpm，后 70% 下降至 restingHr - 5 |
| hrvRmssd | 后 50% 上升 5-8 ms |
| steps | 0 |
| motion | still_upright |
| spo2 | 后 50% 回升 1-2%（冷刺激后血氧改善） |
| stressLoad | 26 - progress * 8，范围 ±2 |

seed 基数：220-224

---

**R2-11: `generateOutdoorBreather` — profile: `outdoor_breather`**

核心特征：步数多于 short_walk（200-400 步/10min），心率先升后降，SpO2 回升。

| 指标 | 变化规则 |
|------|---------|
| heartRate | restingHr + 8 + sin(progress * π) * 6 - progress * 5，范围 ±5 |
| steps | 前半段 40-60 步/分钟，后半段 20-30 步/分钟 |
| motion | periodic_walk |
| spo2 | 后半段回升至 98-99% |
| stressLoad | 28 - progress * 10，范围 ±3 |

seed 基数：230-234

---

**R2-12: `generateStairClimb` — profile: `stair_climb`**

核心特征：心率快速上升 15-25 bpm，步数集中（50-80 步/分钟），强度中等偏高。

| 指标 | 变化规则 |
|------|---------|
| heartRate | restingHr + 20 + sin(progress * π) * 5，范围 ±6 |
| steps | 每分钟 50-80 步 |
| motion | periodic_brisk |
| stressLoad | 不生成（运动场景不适用） |

seed 基数：240-244

---

**R3-13: `generateStandingWork` — profile: `standing_work`**

核心特征：长时间近乎静止但直立，心率比坐姿高 3-5 bpm，SpO2 维持高位。

| 指标 | 变化规则 |
|------|---------|
| heartRate | restingHr + 4 - progress * 1，范围 ±3 |
| steps | 偶尔 1-2 步/分钟（站立微调） |
| motion | still_upright |
| spo2 | 稳定 98-99% |
| stressLoad | 不生成 |

seed 基数：250-254

---

**R3-14: `generateFoamRolling` — profile: `foam_rolling`**

核心特征：地面级活动，按压时心率短暂波动（痛感），HRV 在按压间隙上升。

| 指标 | 变化规则 |
|------|---------|
| heartRate | restingHr + 3 + sin(progress * π * 4) * 3，范围 ±3（周期性波动，模拟按压） |
| steps | 0 |
| motion | intermittent_reach |
| hrvRmssd | hrv + progress * 4，范围 ±4 |
| stressLoad | 不生成 |

seed 基数：260-264

---

**R3-15: `generateColdFaceDip` — profile: `cold_face_dip`**

核心特征：极短时长，心率在冷敷后 10-15 秒内急降 8-15 bpm（潜水反射），HRV 快速拉升。

| 指标 | 变化规则 |
|------|---------|
| heartRate | 前 20% 微升 2 bpm，之后急降 restingHr - (8 + progress * 7)，范围 ±3 |
| hrvRmssd | 前 20% 无变化，之后 hrv + (10 + progress * 8)，范围 ±4 |
| steps | 0 |
| motion | still_upright |
| stressLoad | 30 → 前 20% 不变 → 后 80% 降至 15，范围 ±2 |

seed 基数：270-274

---

**R3-16: `generateMindfulnessMeditation` — profile: `mindfulness_meditation`**

核心特征：心率缓慢持续下降（比呼吸练习更缓）、HRV 平稳上升、零运动。

| 指标 | 变化规则 |
|------|---------|
| heartRate | restingHr - (2 + progress * 6)，范围 ±2（比 calming_breathing 更平缓） |
| hrvRmssd | hrv + (5 + progress * 8)，范围 ±3 |
| steps | 0 |
| motion | still_supine |
| stressLoad | 26 - progress * 10，范围 ±2 |

seed 基数：280-284

---

**R3-17: `generateMuscleRelaxation` — profile: `muscle_relaxation`**

核心特征：心率呈锯齿形下降（紧绷微升、释放下降），HRV 阶梯式上升。

| 指标 | 变化规则 |
|------|---------|
| heartRate | restingHr - progress * 4 + sin(progress * π * 6) * 3，范围 ±2（锯齿形） |
| hrvRmssd | hrv + progress * 6 + floor(progress * 3) * 2，范围 ±3（阶梯式） |
| steps | 0 |
| motion | still_supine |
| stressLoad | 28 - progress * 9，范围 ±2 |

seed 基数：290-294

---

**R3-18: `generateLightMeal` — profile: `light_meal`**

核心特征：消化活动温和（比 recovery_meal 更轻），HRV 下降幅度更小。

| 指标 | 变化规则 |
|------|---------|
| heartRate | restingHr + 3 - progress * 1，范围 ±3 |
| steps | 0 |
| motion | still_with_micro |
| hrvRmssd | hrv - 2 + progress * 1（消化负担极轻） |
| stressLoad | 不生成 |

seed 基数：300-304

---

**c) 在 `PROFILE_GENERATOR_MAP` 注册 18 个新生成器**

```typescript
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
standing_work: generateStandingWork,
foam_rolling: generateFoamRolling,
cold_face_dip: generateColdFaceDip,
mindfulness_meditation: generateMindfulnessMeditation,
muscle_relaxation: generateMuscleRelaxation,
light_meal: generateLightMeal,
```

---

### Phase 3：Action 映射逻辑

#### 3.1 `packages/agent-core/src/context/homepage-event-insights.ts`

**修改 `interactionForFocus()` 函数**

在现有 switch-case 中扩展映射逻辑：

```typescript
case 'breathing_reset': {
  // 新增：区分急性应激（box_breathing）和一般放松（deep_breathing）
  const actionLower = focus.action.toLowerCase();
  if (actionLower.includes('箱式') || actionLower.includes('box') || actionLower.includes('紧急') || actionLower.includes('rescue')) {
    return {
      kind: 'micro_event',
      microEvent: { type: 'micro_box_breathing', durationMinutes: focus.durationMin ?? 3 },
    };
  }
  if (actionLower.includes('舒缓') || actionLower.includes('calming') || actionLower.includes('延长呼气') || actionLower.includes('4-7-8')) {
    return {
      kind: 'micro_event',
      microEvent: { type: 'micro_calming_breathing', durationMinutes: focus.durationMin ?? 5 },
    };
  }
  return {
    kind: 'micro_event',
    microEvent: { type: 'micro_deep_breathing', durationMinutes: focus.durationMin },
  };
}

case 'movement_reset': {
  // 新增：区分补水走动、户外换气
  if (eventType === 'meal') {
    return { kind: 'micro_event', microEvent: { type: 'micro_post_meal_walk', durationMinutes: focus.durationMin ?? 10 } };
  }
  if (eventType === 'cardio_workout' || eventType === 'hiit_workout') {
    return { kind: 'micro_event', microEvent: { type: 'micro_post_workout_slow_walk', durationMinutes: focus.durationMin ?? 10 } };
  }
  const actionLower = focus.action.toLowerCase();
  if (actionLower.includes('补水') || actionLower.includes('接水') || actionLower.includes('hydration')) {
    return { kind: 'micro_event', microEvent: { type: 'micro_hydration_walk', durationMinutes: focus.durationMin ?? 5 } };
  }
  if (actionLower.includes('户外') || actionLower.includes('outdoor') || actionLower.includes('窗外') || actionLower.includes('新鲜空气')) {
    return { kind: 'micro_event', microEvent: { type: 'micro_outdoor_breather', durationMinutes: focus.durationMin ?? 10 } };
  }
  if (actionLower.includes('楼梯') || actionLower.includes('stair')) {
    return { kind: 'micro_event', microEvent: { type: 'micro_stair_climb', durationMinutes: focus.durationMin ?? 5 } };
  }
  return { kind: 'micro_event', microEvent: { type: 'micro_short_walk', durationMinutes: focus.durationMin ?? 10 } };
}

case 'posture': {
  const actionLower = focus.action.toLowerCase();
  if (actionLower.includes('站姿办公') || actionLower.includes('站立办公') || actionLower.includes('standing desk')) {
    return { kind: 'micro_event', microEvent: { type: 'micro_standing_work', durationMinutes: focus.durationMin ?? 20 } };
  }
  if (actionLower.includes('纠正') || actionLower.includes('坐姿') || actionLower.includes('posture correction') || actionLower.includes('挺直')) {
    return { kind: 'micro_event', microEvent: { type: 'micro_posture_correction', durationMinutes: focus.durationMin ?? 15 } };
  }
  if (actionLower.includes('站') || actionLower.includes('站立')) {
    return { kind: 'micro_event', microEvent: { type: 'micro_standing_stretch', durationMinutes: focus.durationMin } };
  }
  return { kind: 'micro_event', microEvent: { type: 'micro_desk_mobility', durationMinutes: focus.durationMin } };
}

case 'nutrition': {
  if (eventType === 'cardio_workout' || eventType === 'hiit_workout') {
    return { kind: 'micro_event', microEvent: { type: 'micro_post_workout_snack' } };
  }
  if (eventType === 'prepare_sleep') {
    return { kind: 'micro_event', microEvent: { type: 'micro_pre_workout_snack' } };
  }
  const actionLower = focus.action.toLowerCase();
  if (actionLower.includes('恢复餐') || actionLower.includes('recovery meal') || actionLower.includes('练后')) {
    return { kind: 'micro_event', microEvent: { type: 'micro_recovery_meal', durationMinutes: focus.durationMin ?? 15 } };
  }
  if (actionLower.includes('轻食') || actionLower.includes('清淡') || actionLower.includes('light meal') || actionLower.includes('减负')) {
    return { kind: 'micro_event', microEvent: { type: 'micro_light_meal', durationMinutes: focus.durationMin ?? 15 } };
  }
  return undefined;
}

case 'training_adjustment': {
  const actionLower = focus.action.toLowerCase();
  if (actionLower.includes('有氧') || actionLower.includes('心肺') || actionLower.includes('cardio')) {
    return { kind: 'micro_event', microEvent: { type: 'micro_easy_cardio', durationMinutes: focus.durationMin } };
  }
  if (actionLower.includes('拉伸') || actionLower.includes('恢复') || actionLower.includes('stretch') || actionLower.includes('recovery')) {
    return { kind: 'micro_event', microEvent: { type: 'micro_restorative_stretch', durationMinutes: focus.durationMin } };
  }
  if (actionLower.includes('泡沫轴') || actionLower.includes('foam roll') || actionLower.includes('筋膜')) {
    return { kind: 'micro_event', microEvent: { type: 'micro_foam_rolling', durationMinutes: focus.durationMin ?? 10 } };
  }
  if (actionLower.includes('热身') || actionLower.includes('唤醒') || actionLower.includes('warm up') || actionLower.includes('激活')) {
    return { kind: 'micro_event', microEvent: { type: 'micro_neuro_warmup', durationMinutes: focus.durationMin ?? 5 } };
  }
  return undefined;
}

case 'sleep_protection': {
  const timingLower = (focus.timing ?? '').toLowerCase();
  const actionLower = focus.action.toLowerCase();
  if (timingLower.includes('今晚') || timingLower.includes('睡前') || timingLower.includes('明天') || timingLower.includes('未来')) {
    const isHotShower = actionLower.includes('热水澡') || actionLower.includes('温水澡');
    return {
      kind: 'calendar',
      calendar: {
        title: titleForFocus(focus),
        timingLabel: focus.timing ?? '稍后',
        durationMinutes: focus.durationMin ?? (isHotShower ? 30 : 60),
      },
    };
  }
  if (actionLower.includes('温水澡') || actionLower.includes('warm shower') || actionLower.includes('洗澡')) {
    return { kind: 'micro_event', microEvent: { type: 'micro_warm_shower', durationMinutes: focus.durationMin ?? 10 } };
  }
  if (actionLower.includes('微凉') || actionLower.includes('cool shower') || actionLower.includes('冷水淋浴')) {
    return { kind: 'micro_event', microEvent: { type: 'micro_cool_shower', durationMinutes: focus.durationMin ?? 8 } };
  }
  if (actionLower.includes('降光') || actionLower.includes('关屏') || actionLower.includes('dim') || actionLower.includes('褪黑素')) {
    return { kind: 'micro_event', microEvent: { type: 'micro_screen_dimming', durationMinutes: focus.durationMin ?? 15 } };
  }
  if (actionLower.includes('冥想') || actionLower.includes('meditation') || actionLower.includes('正念')) {
    return { kind: 'micro_event', microEvent: { type: 'micro_mindfulness_meditation', durationMinutes: focus.durationMin ?? 15 } };
  }
  if (actionLower.includes('肌肉放松') || actionLower.includes('muscle relaxation') || actionLower.includes('渐进')) {
    return { kind: 'micro_event', microEvent: { type: 'micro_muscle_relaxation', durationMinutes: focus.durationMin ?? 10 } };
  }
  if (actionLower.includes('调暗') || actionLower.includes('降低') || actionLower.includes('呼吸') || actionLower.includes('放松')) {
    return { kind: 'micro_event', microEvent: { type: 'micro_sleep_wind_down', durationMinutes: focus.durationMin } };
  }
  return undefined;
}
```

新增 `cold_face_dip` 的映射——在 `breathing_reset` 的急性行为判断中追加：

```typescript
// 在 breathing_reset case 内追加
if (actionLower.includes('冷水') || actionLower.includes('cold') || actionLower.includes('敷面') || actionLower.includes('冰敷')) {
  return { kind: 'micro_event', microEvent: { type: 'micro_cold_face_dip', durationMinutes: focus.durationMin ?? 3 } };
}
```

新增 `power_nap` 的映射——需要考虑是否新增 focus category 或复用现有 category。建议在 `breathing_reset`（精神重置）中追加：

```typescript
// 在 breathing_reset case 内追加
if (actionLower.includes('小憩') || actionLower.includes('nap') || actionLower.includes('闭目')) {
  return { kind: 'micro_event', microEvent: { type: 'micro_power_nap', durationMinutes: focus.durationMin ?? 20 } };
}
```

---

### Phase 4：前端展示

#### 4.1 `apps/web/src/components/homepage/ConfigArea.tsx`

在 `EVENT_TYPE_DISPLAY` 对象中追加 18 个条目：

```typescript
// === R1 ===
micro_box_breathing: { icon: '🫁', labelKey: 'microBoxBreathing' },
micro_calming_breathing: { icon: '💨', labelKey: 'microCalmingBreathing' },
micro_hydration_walk: { icon: '💧', labelKey: 'microHydrationWalk' },
micro_warm_shower: { icon: '🚿', labelKey: 'microWarmShower' },
micro_posture_correction: { icon: '🪑', labelKey: 'microPostureCorrection' },
micro_neuro_warmup: { icon: '⚡', labelKey: 'microNeuroWarmup' },
// === R2 ===
micro_recovery_meal: { icon: '🍲', labelKey: 'microRecoveryMeal' },
micro_power_nap: { icon: '💤', labelKey: 'microPowerNap' },
micro_screen_dimming: { icon: '🌙', labelKey: 'microScreenDimming' },
micro_cool_shower: { icon: '🚿', labelKey: 'microCoolShower' },
micro_outdoor_breather: { icon: '🌲', labelKey: 'microOutdoorBreather' },
micro_stair_climb: { icon: '🪜', labelKey: 'microStairClimb' },
// === R3 ===
micro_standing_work: { icon: '🧍', labelKey: 'microStandingWork' },
micro_foam_rolling: { icon: '🧹', labelKey: 'microFoamRolling' },
micro_cold_face_dip: { icon: '🧊', labelKey: 'microColdFaceDip' },
micro_mindfulness_meditation: { icon: '🧘', labelKey: 'microMindfulnessMeditation' },
micro_muscle_relaxation: { icon: '💆', labelKey: 'microMuscleRelaxation' },
micro_light_meal: { icon: '🥗', labelKey: 'microLightMeal' },
```

#### 4.2 i18n 翻译文件

在所有语言的翻译文件中为上述 `labelKey` 添加翻译条目。至少需要：

- `messages/zh.json` — 中文
- `messages/en.json` — 英文

中文翻译值：

```json
{
  "microBoxBreathing": "箱式呼吸",
  "microCalmingBreathing": "舒缓调息",
  "microHydrationWalk": "补水走动",
  "microWarmShower": "温水澡",
  "microPostureCorrection": "体态纠正",
  "microNeuroWarmup": "热身唤醒",
  "microRecoveryMeal": "练后恢复餐",
  "microPowerNap": "闭目小憩",
  "microScreenDimming": "降光断联",
  "microCoolShower": "微凉淋浴",
  "microOutdoorBreather": "户外换气",
  "microStairClimb": "爬楼梯",
  "microStandingWork": "站姿办公",
  "microFoamRolling": "泡沫轴放松",
  "microColdFaceDip": "冷水敷面",
  "microMindfulnessMeditation": "正念冥想",
  "microMuscleRelaxation": "渐进式肌肉放松",
  "microLightMeal": "轻食减负"
}
```

英文翻译值：

```json
{
  "microBoxBreathing": "Box Breathing",
  "microCalmingBreathing": "Calming Breath",
  "microHydrationWalk": "Hydration Walk",
  "microWarmShower": "Warm Shower",
  "microPostureCorrection": "Posture Correction",
  "microNeuroWarmup": "Neuro Warmup",
  "microRecoveryMeal": "Recovery Meal",
  "microPowerNap": "Power Nap",
  "microScreenDimming": "Screen Dimming",
  "microCoolShower": "Cool Shower",
  "microOutdoorBreather": "Outdoor Breather",
  "microStairClimb": "Stair Climb",
  "microStandingWork": "Standing Work",
  "microFoamRolling": "Foam Rolling",
  "microColdFaceDip": "Cold Face Dip",
  "microMindfulnessMeditation": "Mindfulness Meditation",
  "microMuscleRelaxation": "Progressive Muscle Relaxation",
  "microLightMeal": "Light Meal"
}
```

#### 4.3 `apps/web/e2e/action-interactions.spec.ts`

更新第 23 行的正则表达式，追加新微事件的中文关键词：

```typescript
// 旧
const microAction = page.getByText(/深呼吸|起身走|饭后走|慢走|离屏|肩颈|拉伸|低刺激/).first();

// 新
const microAction = page.getByText(/深呼吸|箱式呼吸|舒缓调息|起身走|饭后走|慢走|补水|离屏|肩颈|拉伸|低刺激|恢复餐|小憩|冥想|站姿|泡沫轴|爬楼梯|户外|温水|微凉|降光|冷敷|轻食|肌肉放松/).first();
```

---

### Phase 5：Prompt 更新

#### 5.1 `packages/agent-core/src/prompts/task-builder.ts`

在 prompt 中更新微事件相关约束文本：

1. 更新可用微事件类型列表（如有列举）
2. 更新 JSON 示例（可选，当前示例使用 `micro_short_walk`，无需强制改动）
3. 确认约束"补水、喝水类 action 不得分配 micro_event interaction"仍然有效（`micro_hydration_walk` 是一个例外，它同时包含补水和走动，应该允许分配 micro_event）

---

## 执行顺序建议

```
Phase 1 (类型注册) ──→ Phase 2 (生成器) ──→ Phase 3 (映射逻辑)
                                                    ↓
                                              Phase 4 (前端)
                                                    ↓
                                              Phase 5 (Prompt)
                                                    ↓
                                               全量测试
```

每轮（R1/R2/R3）建议作为一个独立 PR 提交，降低单次改动风险。

## 测试策略

### 自动跟随的测试

以下测试因 `MICRO_EVENT_TYPES` 数组扩展而自动覆盖新类型，无需额外修改：

- `packages/sandbox/src/__tests__/helpers/micro-event-generators.test.ts` — 遍历所有类型的通用测试
- `packages/shared/src/__tests__/schemas.test.ts` — schema 校验测试

### 需要专项补充的测试

- `micro-event-generators.test.ts`：为以下类型添加专项断言
  - `micro_box_breathing` — 心率下降 ≥ 8 bpm、HRV 上升 ≥ 10 ms
  - `micro_stair_climb` — 步数 ≥ 200、心率上升 ≥ 15 bpm
  - `micro_cold_face_dip` — 心率下降 ≥ 8 bpm（潜水反射）
  - `micro_power_nap` — 心率低于 restingHr、HRV 上升 ≥ 8 ms
- `micro-event-append.test.ts`：至少为每轮各 1 个新类型添加 append 测试
- `god-mode/routes.test.ts`：更新无效类型测试（之前用 `micro_hydration_break` 作为无效类型，现在它已合法，需换一个新的无效类型如 `micro_invalid_type`）
