# 建议交互与微事件重构设计

## 背景

首页实时简报当前会输出 `actions`，但用户点击建议后只在前端显示“已记录”的 toast，不会改变 mock timeline，也不会触发新的实时简报生成。接下来需要把建议分成两类：

- 可添加进日历的建议：用于模拟与日程管理模块的交互。
- 即时交互类建议：用户点击后应像 Timeline Control 一样改变 mock timeline 数据，并触发实时简报更新。

本设计只覆盖 demo 内的交互与 mock 数据，不引入真实日程管理模块，也不引入真实设备控制能力。

## 目标

1. 让首页建议显式区分“日程建议”和“即时微行动”。
2. 日程建议在建议文案旁展示“添加进日程”按钮，点击后只显示 demo UI 反馈，不写 timeline。
3. 即时建议点击后追加受控微事件，生成 mock `DeviceEvent[]`，自动同步，并刷新首页简报。
4. 微事件和现有 Timeline Control 的主事件分开管理，避免把“呼吸 3 min”“补水”“姿势调整”等轻行为混进主活动片段。
5. 保持建议事件可测试、可审计、可扩展，不依赖 LLM 输出任意事件类型。

## 非目标

- 不实现真实日程管理、系统日历授权或持久日程表。
- 不实现真实提醒、后台定时任务、无干扰模式或设备控制。
- 不让 LLM 直接决定任意传感器数值。
- 不把每条自然语言建议都硬编码成独立事件。

## 推荐方案

采用“结构化 Action + 微事件注册表”的方案。

后端仍让 LLM 负责自然语言表达，但建议的交互能力来自受控字段。`ActionOption` 增加可选的 `interaction` 字段，分为：

```ts
type ActionInteraction =
  | {
      kind: 'calendar';
      calendar: {
        title: string;
        timingLabel: string;
        durationMinutes: number;
      };
    }
  | {
      kind: 'micro_event';
      microEvent: {
        type: MicroEventType;
        durationMinutes?: number;
        params?: Record<string, number | string | boolean>;
      };
    };
```

旧版 action 没有 `interaction` 时仍可正常展示，并按现在的“记录选择”行为处理。

## 微事件模型

新增 `MicroEventType`，独立于 `ActivitySegmentType`：

```ts
type MicroEventType =
  | 'micro_deep_breathing'
  | 'micro_short_walk'
  | 'micro_post_meal_walk'
  | 'micro_post_workout_slow_walk'
  | 'micro_standing_stretch'
  | 'micro_desk_mobility'
  | 'micro_offscreen_eye_rest'
  | 'micro_window_gaze_walk'
  | 'micro_pre_workout_snack'
  | 'micro_post_workout_snack'
  | 'micro_easy_cardio'
  | 'micro_restorative_stretch'
  | 'micro_low_stimulus_work'
  | 'micro_sleep_wind_down';
```

这些微事件是演示行为原语，不是自然语言文案枚举。命名必须面向用户能理解的具体行动，而不是抽象技术词。比如“做几次深呼吸”对应 `micro_deep_breathing`；“起身走几分钟”或“饭后走一小会儿”分别对应 `micro_short_walk` / `micro_post_meal_walk`。用户可见文案只使用自然的日常行动表达。

微事件清单参考了 `docs/profile-case-sample.xlsx` 的 `Sample Feedback interactions` sheet 中 Action Suggestion 1-3 的主题，覆盖深呼吸、饭后走动、短暂离屏、姿势调整、运动前后补给、低刺激工作、运动强度下调、睡前放松等高频建议。咖啡因时间安排、训练计划、睡眠计划这类未来安排优先走 `calendar`；补水、调暗灯光、调室温、洗澡等传感器无法可靠捕捉的行为默认不写 timeline。

每个微事件定义包含：

- `type`
- 默认 `durationMinutes`
- 可选 `paramsSchema`
- mock 设备事件生成器
- 简报语义映射
- UI 默认图标和中文标题

## 微事件生成原则

微事件生成的是“用户点击后发生的已知行为及其生理响应示意”，不是系统从戒指中反向识别真实行为。

生成规则必须是确定性的、基于 profile baseline 的通用算法：

- 做几次深呼吸：低 motion，HR 缓慢下降，HRV/RMSSD 回升，stressLoad 下降。适配“3 min 箱式呼吸”“延长呼气”“4-7-8 呼吸”等建议，具体呼吸法放在 `params.pattern`。
- 起身走几分钟：steps 和 motion 上升，HR 温和上升后回落，stressLoad 轻微下降。适配久坐后的“走 150 steps”“去茶水间走一圈”等建议，但不声称用户喝了水。
- 饭后走一小会儿：低到中等 steps/motion，HR 保持温和区间，HRV 轻微压缩后平稳。用于早餐/午餐后的 5 min 走动，不等同于正式运动。
- 运动后慢走几分钟：steps/motion 温和，HR 从运动后高位继续回落。用户可见文案使用“慢走几分钟”或“让心率慢慢降下来”。
- 站起来活动肩颈/关节：轻度 motion，steps 很少，HR 小幅变化，stressLoad 轻微下降。适配肩颈活动、脚踝绕环、简单 mobility。
- 闭眼离屏休息：低 motion，HR/stressLoad 下降，HRV 小幅恢复。适配 10-15 min 无屏闭眼，不生成睡眠阶段。
- 到窗边看远处：少量 steps 后进入低 motion，stressLoad 温和下降。该事件代表用户主动离开屏幕和改变视线，不声称传感器识别“看远处”。
- 训练前小点/运动后补给：用短时进食响应表达，HR 小幅上升，HRV 轻微压缩。只在 action 明确是“吃一份小点/补给”时使用；泛泛饮水不使用微事件。
- 做一段轻松有氧：中等 steps/motion，HR 进入温和运动区间。适配“把大重量改成中等强度有氧/轻松慢跑”。
- 做一段拉伸恢复：轻到中等 motion，steps 很少，HR 低幅波动，stressLoad 下降。适配“恢复瑜伽/下肢髋部拉伸”。
- 低刺激收尾工作：低 motion，HR/stressLoad 平稳下降。适配“处理邮件/整理待办/低刺激任务”，不伪造生产力数据。
- 睡前放松：低 motion，HR/stressLoad 下降，不直接伪造睡眠阶段。适配“睡前 60 min 降低刺激/放下屏幕”，但调暗灯光、调温本身不写入传感器事实。

不进入 timeline 的建议：

- 补水、小口喝水、电解质饮品：维持当前点击交互，只记录选择并显示 toast，不生成 mock sensor data。
- 调暗灯光、调低室温、开窗、洗温水澡：传感器无法可靠捕捉具体行为，默认只记录选择；如果建议同时包含“睡前放松一段时间”，才可映射到 `micro_sleep_wind_down`。
- 咖啡因倒计时、今晚训练计划、明早工作安排：属于未来计划或策略，优先使用 `calendar` 或无交互，不立即改 timeline。

## 后端设计

### Shared Types

新增文件：

- `packages/shared/src/types/micro-event.ts`
- `packages/shared/src/schemas/micro-event.ts`

修改：

- `packages/shared/src/types/agent.ts`
- `packages/shared/src/schemas/agent.ts`
- `packages/shared/src/types/god-mode.ts`
- `packages/shared/src/schemas/god-mode.ts`
- `packages/shared/src/types/sandbox.ts`
- `packages/shared/src/schemas/sandbox.ts`
- `packages/shared/src/index.ts`

`RecognizedEventType` 扩展为：

```ts
type RecognizedEventType =
  | ActivitySegmentType
  | MicroEventType
  | 'possible_caffeine_intake'
  | 'possible_alcohol_intake';
```

### Sandbox

新增：

- `packages/sandbox/src/helpers/micro-event-generators.ts`
- `packages/sandbox/src/helpers/micro-event-registry.ts`

`micro-event-generators.ts` 负责将微事件转换为 `DeviceEvent[]`。它不复用 `ActivitySegmentType`，但可以复用时间戳、baseline、采样间隔等现有工具模式。

`event-recognition.ts` 增加对 `seg-micro-{type}-...` 的识别。微事件识别应该保持独立 evidence，例如：

```text
用户选择触发微事件 micro_deep_breathing，持续 3 min，低运动伴随 HR 下降和 RMSSD 回升
```

### Override Store

在 `apps/agent-api/src/runtime/override-store.ts` 增加：

```ts
appendMicroEvent(
  profileId: string,
  microEventType: MicroEventType,
  params?: Record<string, number | string | boolean>,
  options?: { durationMinutes?: number; advanceClock?: boolean },
): { events: DeviceEvent[]; newCurrentTime: string; eventStart: string; eventEnd: string };
```

行为与 `appendSegment()` 一致：

1. 从当前 demo clock 计算开始/结束时间。
2. 生成微事件 `DeviceEvent[]`。
3. 写入 `rawEvents`。
4. 默认推进 clock。
5. 自动执行 `app_open` sync，消除 pending 状态。

### God Mode API

新增 endpoint：

```http
POST /god-mode/micro-event-append
```

payload：

```ts
{
  microEventType: MicroEventType;
  durationMinutes?: number;
  params?: Record<string, number | string | boolean>;
  advanceClock?: boolean;
}
```

成功后：

- 清 brief cache。
- 失效当前 session analytical memory。
- 返回 `GodModeStateResponse`。

微事件不触发 Active Sensing Banner，避免与“可能咖啡因/饮酒”“运动检测”混淆。

## Agent 设计

### Action 生成

`homepage-event-insights.ts` 继续生成 `actionIntents`，但 `ActionIntentCandidate` 增加 `interaction`。

建议映射示例：

- `movement_reset` -> `micro_short_walk`
- 饭后 `movement_reset` -> `micro_post_meal_walk`
- 运动后 `movement_reset` -> `micro_post_workout_slow_walk`
- `breathing_reset` -> `micro_deep_breathing`
- `hydration` -> 无 `interaction`，只记录选择；如果文案同时包含起身走动，则映射到 `micro_short_walk`
- `nutrition` -> `micro_pre_workout_snack` 或 `micro_post_workout_snack`
- `posture` -> `micro_standing_stretch` 或 `micro_desk_mobility`
- `sleep_protection` -> `calendar` 或 `micro_sleep_wind_down`，按是否“现在执行”区分
- `training_adjustment` -> `micro_easy_cardio` 或 `micro_restorative_stretch`
- `work_planning` / 未来工作块 -> `calendar`
- `medical_attention` -> 无 `interaction`，只记录选择

规则：

- 即时可执行、可用 mock timeline 表达的建议使用 `micro_event`。
- 明确安排到未来时间的建议使用 `calendar`。
- 传感器无法可靠捕捉、且没有合理短时生理响应的建议不使用 `micro_event`，保持当前“记录选择”交互。
- 系统不能真实完成的能力不得写入 `aiPromise`。

### Prompt 与解析

`homepage/template.md` 增加约束：

- LLM 必须保留候选 action 的交互意图。
- 不得把 `calendar` 写成真实日程已创建。
- 不得给无交互能力的 action 编造提醒、监控、模式切换能力。

`response-parser.ts` 校验 `interaction`：

- `calendar` 必须有 `title/timingLabel/durationMinutes`。
- `micro_event.type` 必须来自 `MicroEventTypeSchema`。
- 无效 interaction 使解析失败，走现有 fallback，而不是静默改写。

## 前端设计

### ActionOptions

`apps/web/src/components/homepage/ActionOptions.tsx` 按 `interaction.kind` 分支：

- `calendar`
  - 在 action 文案右侧显示小按钮“添加进日程”。
  - 点击按钮 `stopPropagation()`。
  - toast：“已添加进日程（Demo）”。
  - action 本体仍可点击记录选择，但不写 timeline。

- `micro_event`
  - 点击 action 卡片后进入 pending 状态。
  - 调用 `POST /god-mode/micro-event-append`。
  - 成功后 toast：“已记录，正在更新实时简报”。
  - 失效 `homepage/dataCenter/godMode` 查询。
  - 触发 `useRefetchBrief(..., bustCache=true)`，强制实时简报重新生成。

- 无 `interaction`
  - 保持当前本地选中与 toast 行为。

### Hook

新增 `useAppendMicroEventAction()`，放在 `apps/web/src/hooks/use-god-mode-actions.ts` 或单独 `use-action-interactions.ts`。

它负责：

- 调用 API。
- 同步 Active Sensing 状态。
- 失效相关 query。
- 暴露 pending/error 状态给 action UI。

## 数据流

即时微事件完整链路：

```text
用户点击 action
  -> ActionOptions 读取 interaction.microEvent
  -> POST /god-mode/micro-event-append
  -> GodModeService.appendMicroEvent()
  -> overrideStore.appendMicroEvent()
  -> micro-event-generators 生成 DeviceEvent[]
  -> rawEvents 写入并自动 sync
  -> brief cache + analytical memory 失效
  -> 前端 invalidate queries
  -> POST /ai/morning-brief with bustCache=true
  -> context packet 包含微事件 recentEvents/eventInsights
  -> LLM 生成更新后的实时简报
```

日程建议链路：

```text
用户点击“添加进日程”
  -> 前端本地 toast
  -> 按钮显示已添加状态
  -> 不调用后端
  -> 不改变 timeline
  -> 不刷新简报
```

## 错误处理

- 微事件 API 失败：显示 toast，action 不进入已记录态，不做本地伪 timeline。
- 微事件类型非法：后端返回 400。
- LLM 输出非法 interaction：解析失败，走现有 fallback。
- 日程按钮无后端依赖，不存在网络失败；只显示 demo 状态。
- 如果当前 profile 不存在，沿用 God Mode 现有 profile 错误处理。

## 测试策略

### Shared

- `MicroEventTypeSchema` 接受 14 个微事件，拒绝非法值。
- `ActionOptionSchema` 兼容旧 action，校验 `calendar` 和 `micro_event`。

### Sandbox

- 每个微事件生成合法 `DeviceEvent[]`。
- 事件时间连续且不重叠。
- 呼吸/休息类事件体现 HR/stress 下降、HRV 回升。
- 起身走动、饭后走动、运动后慢走类事件体现 steps/motion。

### API

- `/god-mode/micro-event-append` 能写入 raw events、自动 sync、清 brief cache。
- 微事件不触发 Active Sensing Banner。
- 非法 micro event payload 返回 400。

### Agent

- `homepage-event-insights` 为相关 actionIntent 附加正确 `interaction`。
- `context-packet-renderer` 能渲染微事件。
- 微事件触发后，不重复建议用户执行同一动作。

### Web

- `calendar` action 显示“添加进日程”按钮，点击不触发 action 主点击。
- `micro_event` action 点击调用 API 并触发 brief refetch。
- 无 interaction action 保持当前行为。

## 迁移与兼容

旧 action 不带 `interaction`，前端和后端必须继续兼容。上线顺序：

1. 先扩展 shared schema 和 parser，兼容旧 action。
2. 再接入微事件 API 与生成器。
3. 再让 agent actionIntents 输出 interaction。
4. 最后改前端 UI 和刷新链路。

## 设计决策

- 微事件使用受控枚举，不使用 LLM 任意事件类型。
- 日程建议只做 UI 示意，不写后端记录。
- 微事件进入 timeline/sync/recentEvents，但不触发 Active Sensing Banner。
- 即时 action 成功后必须强制 `bustCache` 刷新简报，避免返回旧缓存。
- 对“喝水”“调温”这类非传感器事实，只模拟点击后的行为响应，不声称设备直接检测到该行为。

## 待实现计划

本设计通过后，应进入实现计划阶段，拆分为 shared schema、sandbox micro generators、API endpoint、agent action interaction、web action UI 五组小提交。
